// Harmonize (CR 702.180a-b): cast from your graveyard for the harmonize cost, tapping up to one untapped creature you
// control to take its power off the total cost in generic mana (never colored mana, rulings), then exiled whatever
// happens to the spell.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
const harmonize = (harmonize?: string) => ({ via: "harmonize" as const, ...(harmonize ? { harmonize } : {}) });

// Real oracle text (Scryfall).
const whisper = card("Unending Whisper", "Sorcery", "{U}", { oracleText: "Draw a card.\nHarmonize {5}{U} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by an amount of generic mana equal to its power. Then exile this spell.)" });
const ride = card("Wild Ride", "Sorcery", "{R}", { oracleText: "Target creature gets +3/+0 and gains haste until end of turn.\nHarmonize {4}{R} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by an amount of generic mana equal to its power. Then exile this spell.)" });
const festival = card("Zenith Festival", "Sorcery", "{X}{R}{R}", { oracleText: "Exile the top X cards of your library. You may play them until the end of your next turn.\nHarmonize {X}{R}{R} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by an amount of generic mana equal to its power. Then exile this spell.)" });
const giant = bear({ name: "Hill Giant", power: "3", toughness: "3" });
const titan = bear({ name: "Big Titan", power: "7", toughness: "7" });
const wall = bear({ name: "Wall Zero", power: "0", toughness: "4" });

describe("harmonize", () => {
  it("parse", () => {
    supported(whisper, ride, festival);
    expect(compileCard(whisper).fromGraveyard).toEqual([{ kind: "harmonize", mana: "{5}{U}", costs: [], exile: true }]);
  });

  it("Unending Whisper: tapping a 3-power creature takes {3} off; the card is exiled", () => {
    const { s: s0, ap, ids } = setup([whisper]);
    toGraveyard(s0, ap, ids[0]!);
    const g = putOnBattlefield(s0, ap, giant, { sick: true }); // tapping it isn't a {T} cost: summoning sick is fine
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, harmonize(g)));
    expect(s.objects[g]!.tapped).toBe(true);
    expect(tappedLands(s, ap)).toBe(3);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.log.some((l) => /taps Hill Giant \(harmonize\)/.test(l.text))).toBe(true);
  });

  it("without a creature, the whole harmonize cost; a 0-power creature takes nothing off", () => {
    const { s: s0, ap, ids } = setup([whisper]);
    toGraveyard(s0, ap, ids[0]!);
    const w = putOnBattlefield(s0, ap, wall);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, harmonize(w)));
    expect(tappedLands(s, ap)).toBe(6);
    expect(s.objects[w]!.tapped).toBe(true);
  });

  it("only generic mana comes off: Wild Ride with a 7-power creature still costs {R}", () => {
    const { s: s0, ap, ids } = setup([ride]);
    toGraveyard(s0, ap, ids[0]!);
    const t = putOnBattlefield(s0, ap, titan);
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: t }], undefined, undefined, undefined, harmonize(t)));
    expect(tappedLands(s, ap)).toBe(1);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("X in the harmonize cost: Zenith Festival for X=3 with a 3-power creature costs {R}{R}", () => {
    const { s: s0, ap, ids } = setup([festival]);
    toGraveyard(s0, ap, ids[0]!);
    const g = putOnBattlefield(s0, ap, giant);
    const top = s0.players[ap]!.library.slice(0, 3);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3, harmonize(g)));
    expect(tappedLands(s, ap)).toBe(2);
    for (const id of top) expect(s.objects[id]!.zone).toBe("exile");
  });

  it("the creature has to be an untapped creature you control, and only when cast using harmonize", () => {
    const { s: s0, ap, opp, ids } = setup([whisper]);
    toGraveyard(s0, ap, ids[0]!);
    const theirs = putOnBattlefield(s0, opp, giant);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, harmonize(theirs))).toMatch(/only creatures you control/);
    const g = putOnBattlefield(s0, ap, giant);
    s0.objects[g]!.tapped = true;
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, harmonize(g))).toMatch(/already tapped/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { via: "flashback", harmonize: g })).toBeTruthy();
  });

  it("a mana creature tapped for harmonize isn't also tapped for mana", () => {
    const { s: s0, ap, ids } = setup([whisper]);
    toGraveyard(s0, ap, ids[0]!);
    // Four lands untapped, one an Island: {4}{U} only with the Elves' mana too.
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    const island = lands.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Island")!;
    const keep = [island, ...lands.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Mountain")];
    for (const id of lands) if (!keep.includes(id)) s0.objects[id]!.tapped = true;
    const elves = putOnBattlefield(s0, ap, card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." }));
    const big = putOnBattlefield(s0, ap, bear({ name: "Five Power", power: "5", toughness: "5" }));
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, harmonize(big))).not.toBeNull();
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, harmonize(elves));
    // {5}{U} less 1 is {4}{U}: the four lands and the Elves' {G} would pay it, but the Elves are tapped for harmonize.
    expect(plan).toBeNull();
  });

  it("a bot casts it from its graveyard, tapping a creature it can spare", () => {
    const { s: s0, ap, ids } = setup([whisper]);
    toGraveyard(s0, ap, ids[0]!);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const g = putOnBattlefield(s0, ap, giant, { sick: true });
    s0.priority = ap;
    const acts = botActions(s0, ap);
    const cast = acts.find((a) => a.type === "castSpell");
    expect(cast).toMatchObject({ objectId: ids[0], via: "harmonize", harmonize: g });
  });
});
