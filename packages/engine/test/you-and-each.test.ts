// "You and target opponent each draw a card" (Secret Rendezvous, Farsight Adept, Thran Spider, Loran of the Third Path):
// the same instruction for both players, you first. Season of the Burrow (pawprints, CR 700.2i): "with an indestructible
// counter on it" is a counter it enters with (CR 614.1c), and "Its controller draws a card" is the exiled permanent's
// controller.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";
import { defOf } from "../src/cards";

// Real oracle text (Scryfall).
const rendezvous = card("Secret Rendezvous", "Sorcery", "{1}{W}{W}", { oracleText: "You and target opponent each draw three cards." });
const spider = card("Thran Spider", "Artifact Creature — Spider", "{3}", { power: "2", toughness: "4", keywords: ["Reach"], oracleText: "Reach\nWhen this creature enters, you and target opponent each create a tapped Powerstone token.\n{7}: Look at the top four cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });
const farsight = card("Farsight Adept", "Creature — Kor Wizard", "{2}{W}", { power: "3", toughness: "3", oracleText: "When this creature enters, you and target opponent each draw a card." });
const loran = card("Loran of the Third Path", "Legendary Creature — Human Artificer", "{2}{W}", { power: "2", toughness: "1", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen Loran enters, destroy up to one target artifact or enchantment.\n{T}: You and target opponent each draw a card." });
const temple = card("Your Temple Is Under Attack", "Instant", "{2}{W}", { keywords: ["Pray for Protection", "Strike a Deal"], oracleText: "Choose one —\n• Pray for Protection — Creatures you control gain indestructible until end of turn.\n• Strike a Deal — You and target opponent each draw two cards." });
const burrow = card("Season of the Burrow", "Sorcery", "{3}{W}{W}", { oracleText: "Choose up to five {P} worth of modes. You may choose the same mode more than once.\n{P} — Create a 1/1 white Rabbit creature token.\n{P}{P} — Exile target nonland permanent. Its controller draws a card.\n{P}{P}{P} — Return target permanent card with mana value 3 or less from your graveyard to the battlefield with an indestructible counter on it." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const hands = (s: GameState, ...pids: PlayerId[]) => pids.map((p) => s.players[p]!.hand.length);
const powerstones = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && /^Powerstone/.test(defOf(s, s.objects[id]!).name));

describe("you and target opponent each ...", () => {
  it("compiles", () => supported(rendezvous, spider, farsight, loran, temple));

  it("Secret Rendezvous: you and the target opponent draw three; the other players don't", () => {
    const { s: s0, ap, opp, ids } = setup([rendezvous]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const before = hands(s0, ap, opp, third);
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(hands(s, ap, opp, third)).toEqual([before[0]! - 1 + 3, before[1]! + 3, before[2]]);
  });

  it("Farsight Adept's enters trigger targets an opponent as it's put on the stack", () => {
    const { s: s0, ap, opp, ids } = setup([farsight]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const before = hands(s, ap, opp);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(hands(s, ap, opp)).toEqual([before[0]! + 1, before[1]! + 1]);
  });

  it("Thran Spider: each of you creates a tapped Powerstone under your own control", () => {
    const { s: s0, ap, opp, ids } = setup([spider]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    for (const p of [ap, opp]) {
      const stones = powerstones(s, p);
      expect(stones).toHaveLength(1);
      expect(s.objects[stones[0]!]!.tapped).toBe(true);
    }
  });

  it("Loran's {T} ability", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, loran);
    const before = hands(s0, ap, opp);
    const s = settle(run(s0, planActivate(s0, ap, l, 0, [{ kind: "player", id: opp }])));
    expect(hands(s, ap, opp)).toEqual([before[0]! + 1, before[1]! + 1]);
  });
});

describe("Season of the Burrow", () => {
  it("compiles", () => supported(burrow));

  it("{P}{P} exiles a nonland permanent and its controller draws; {P}{P}{P} returns a card with an indestructible counter", () => {
    const { s: s0, ap, opp, ids } = setup([burrow]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    moveObject(s0, mine, "graveyard");
    const before = hands(s0, ap, opp);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs), target(mine)], [1, 2])));
    expect(s.objects[theirs]?.zone ?? "exile").toBe("exile");
    expect(hands(s, ap, opp)).toEqual([before[0]! - 1, before[1]! + 1]);
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s0.objects[mine]!.cardId && s.objects[id]!.controller === ap)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.counters).toMatchObject({ indestructible: 1 });
    expect(objHasKeyword(s, s.objects[back]!, "indestructible")).toBe(true);
  });

  it("{P} five times makes five Rabbits", () => {
    const { s: s0, ap, ids } = setup([burrow]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, [0, 0, 0, 0, 0])));
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && defOf(s, s.objects[id]!).name.includes("Rabbit"))).toHaveLength(5);
  });
});
