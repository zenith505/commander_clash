// Round 105, a third batch: Cultivator Colossus (put a land, draw, repeat until you decline), Giada ("for each Angel you
// already control"), Chainer, Nightmare Adept (a one-cast permission from the graveyard; "if you didn't cast it from your
// hand").

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const cultivator = card("Cultivator Colossus", "Creature — Plant Beast", "{4}{G}{G}{G}", { power: "*", toughness: "*", keywords: ["Trample"], oracleText: "Trample\nCultivator Colossus's power and toughness are each equal to the number of lands you control.\nWhen this creature enters, you may put a land card from your hand onto the battlefield tapped. If you do, draw a card and repeat this process." });
const giada = card("Giada, Font of Hope", "Legendary Creature — Angel", "{1}{W}", { power: "2", toughness: "2", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance\nEach other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.\n{T}: Add {W}. Spend this mana only to cast an Angel spell." });
const chainer = card("Chainer, Nightmare Adept", "Legendary Creature — Human Minion", "{2}{B}{R}", { power: "3", toughness: "2", oracleText: "Discard a card: You may cast a creature spell from your graveyard this turn. Activate only once each turn.\nWhenever a nontoken creature you control enters, if you didn't cast it from your hand, it gains haste until your next turn." });

// Test cards.
const angel = (name: string) => card(name, "Creature — Angel", "{3}{W}", { power: "3", toughness: "3", keywords: ["Flying"] });
const ox = card("Test Ox", "Creature — Ox", "{3}{G}", { power: "3", toughness: "3" });
const hill = (name: string) => card(name, "Land", "", { oracleText: "{T}: Add {G}." });
const raise = card("Test Raise", "Sorcery", "{2}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const toZone = (s: GameState, pid: PlayerId, d: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const via = { via: "turnPermission" as const };

describe("round 105: Cultivator Colossus, Giada, Chainer", () => {
  it("parse", () => [cultivator, giada, chainer].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Cultivator Colossus: a land, a draw, again, until you decline", () => {
    const { s: s0, ap, ids } = setup([cultivator]);
    // Only these lands in hand.
    s0.players[ap]!.hand = [ids[0]!];
    const lands = [toZone(s0, ap, hill("Hill A"), "hand"), toZone(s0, ap, hill("Hill B"), "hand")];
    const drawn = [toZone(s0, ap, ox, "library"), toZone(s0, ap, ox, "library")];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (const land of lands) {
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0 });
      expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toContain(land);
      s = act(s, { type: "searchLibrary", player: ap, found: [land] });
      expect(s.objects[land]!).toMatchObject({ zone: "battlefield", tapped: true });
    }
    expect(drawn.map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    // No land card left in hand: the process ends.
    expect(s.pending?.kind).not.toBe("searchLibrary");
  });

  it("Cultivator Colossus: declining ends it with no draw", () => {
    const { s: s0, ap, ids } = setup([cultivator]);
    toZone(s0, ap, hill("Hill A"), "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.pending).toBeFalsy();
  });

  it("Giada: another Angel enters with a counter for each Angel you already control", () => {
    const { s: s0, ap, ids } = setup([angel("New Angel"), bear()]);
    putOnBattlefield(s0, ap, giada);
    putOnBattlefield(s0, ap, angel("Old Angel"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    // Not a non-Angel.
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Chainer: discard a card for one creature spell from the graveyard this turn; it gains haste", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chainer);
    const fodder = toZone(s0, ap, bear({ name: "Fodder" }), "hand");
    const dead = toZone(s0, ap, ox, "graveyard");
    const dead2 = toZone(s0, ap, ox, "graveyard");
    expect(planCast(s0, ap, dead, undefined, undefined, "auto", undefined, via)).toBeNull();
    const plan = planActivate(s0, ap, c, 0, undefined, undefined, undefined, undefined, { discard: [fodder] });
    let s = settle(plan!.reduce((x, y) => act(x, y), s0));
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    s = run(s, planCast(s, ap, dead, undefined, undefined, "auto", undefined, via));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[dead]!, "Haste")).toBe(true);
    // One cast for one activation, and the ability only once each turn.
    expect(planCast(s, ap, dead2, undefined, undefined, "auto", undefined, via)).toBeNull();
    expect(planActivate(s, ap, c, 0)).toBeNull();
  });

  it("Chainer: a creature cast from the hand doesn't gain haste; one put onto the battlefield does", () => {
    const { s: s0, ap, ids } = setup([ox, raise]);
    putOnBattlefield(s0, ap, chainer);
    const dead = toZone(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(false);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: dead }]));
    expect(objHasKeyword(s, s.objects[dead]!, "Haste")).toBe(true);
  });

  it("Chainer: a bot discards for a creature in its graveyard and casts it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, chainer);
    // Bots discard for a cost only with plenty of cards in hand.
    s0.players[ap]!.hand = [];
    for (let i = 0; i < 6; i++) toZone(s0, ap, hill(`Hill ${i}`), "hand");
    const dead = toZone(s0, ap, ox, "graveyard");
    let s = s0;
    for (let i = 0; i < 200 && s.objects[dead]!.zone === "graveyard" && s.activePlayer === ap; i++) {
      const acts = s.pending?.kind === "declareBlockers" ? [{ type: "declareBlockers" as const, player: s.pending.player, blocks: [] }] : botActions(s, waitingOn(s)!);
      if (!acts.length) break;
      s = acts.reduce((x, a) => act(x, a), s);
    }
    expect(s.objects[dead]!.zone).not.toBe("graveyard");
  });
});
