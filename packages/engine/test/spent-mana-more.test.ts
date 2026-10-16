// More cards that ask what was spent to cast them (CR 601.2h): a "you may" under the condition (Cankerous Thirst), hand
// disruption in one sentence under it (River's Grasp), "counter up to one target creature spell" (Repel Intruders, CR
// 115.6), "can't play lands this turn" (Moonhold, CR 305.2, 101.2), and "each player loses 1 life for each attacking
// creature they control" (Batwing Brume), each player counting their own.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, legalActions, planCast, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const thirst = card("Cankerous Thirst", "Instant", "{3}{B/G}", { oracleText: "If {B} was spent to cast this spell, you may have target creature get -3/-3 until end of turn. If {G} was spent to cast this spell, you may have target creature get +3/+3 until end of turn. (Do both if {B}{G} was spent.)" });
const grasp = card("River's Grasp", "Sorcery", "{3}{U/B}", { oracleText: "If {U} was spent to cast this spell, return up to one target creature to its owner's hand. If {B} was spent to cast this spell, target player reveals their hand, you choose a nonland card from it, then that player discards that card. (Do both if {U}{B} was spent.)" });
const repel = card("Repel Intruders", "Instant", "{3}{W/U}", { oracleText: "Create two 1/1 white Kithkin Soldier creature tokens if {W} was spent to cast this spell. Counter up to one target creature spell if {U} was spent to cast this spell. (Do both if {W}{U} was spent.)" });
const moonhold = card("Moonhold", "Instant", "{2}{R/W}", { oracleText: "Target player can't play lands this turn if {R} was spent to cast this spell and can't cast creature spells this turn if {W} was spent to cast this spell. (Do both if {R}{W} was spent.)" });
const brume = card("Batwing Brume", "Instant", "{1}{W/B}", { oracleText: "Prevent all combat damage that would be dealt this turn if {W} was spent to cast this spell. Each player loses 1 life for each attacking creature they control if {B} was spent to cast this spell. (Do both if {W}{B} was spent.)" });
const discipline = card("Stronghold Discipline", "Sorcery", "{2}{B}{B}", { oracleText: "Each player loses 1 life for each creature they control." });
const greed = card("Burden of Greed", "Instant", "{3}{B}", { oracleText: "Target player loses 1 life for each tapped artifact they control." });
const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
const forestCard = card("Forest", "Basic Land — Forest");

const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** Cast it paying with new basic lands of these names, not autopay. */
function castWith(s: GameState, pid: PlayerId, id: string, lands: string[], targets?: TargetChoice[]): GameState {
  for (const l of lands) {
    const land = putOnBattlefield(s, pid, card(l, `Basic Land — ${l}`));
    const mana = ({ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" } as const)[l as "Plains"];
    s = act(s, { type: "activateMana", player: pid, objectId: land, mana });
  }
  return act(s, { type: "castSpell", player: pid, objectId: id, targets });
}
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });

describe("more mana-spent cards", () => {
  it("compiles them", () => [thirst, grasp, repel, moonhold, brume, discipline, greed].forEach((d: CardDef) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Cankerous Thirst paid with {B}: you may give the first target -3/-3; the {G} part doesn't happen", () => {
    let { s, ap, opp, ids } = setup([thirst]);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    s = passAll(castWith(s, ap, ids[0]!, ["Swamp", "Island", "Island", "Island"], [target(theirs), target(mine)]));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toBeFalsy();
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });

  it("Cankerous Thirst paid with {B} and {G}, both targets the same creature: each part is up to you", () => {
    let { s, ap, ids } = setup([thirst]);
    const mine = putOnBattlefield(s, ap, bear());
    s = passAll(castWith(s, ap, ids[0]!, ["Swamp", "Forest", "Island", "Island"], [target(mine), target(mine)]));
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });

  it("River's Grasp paid with {U} and {B}: bounces the creature, then you pick a nonland card for the player to discard", () => {
    let { s, ap, opp, ids } = setup([grasp]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = passAll(castWith(s, ap, ids[0]!, ["Island", "Swamp", "Mountain", "Mountain"], [target(theirs), player(opp)]));
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp });
    const pick = (s.pending as { cards: string[] }).cards.find((id) => name(s, id) === "Grizzly Bears")!;
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    expect(s.objects[pick]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("hand");
  });

  it("River's Grasp paid with {U} only: no hand is revealed", () => {
    let { s, ap, opp, ids } = setup([grasp]);
    const hand = s.players[opp]!.hand.length;
    s = passAll(castWith(s, ap, ids[0]!, ["Island", "Mountain", "Mountain", "Mountain"], [{ kind: "none" }, player(opp)]));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.hand.length).toBe(hand);
  });

  it("Repel Intruders: with {W} and {U}, two Kithkin and the creature spell countered; with no creature spell, it can be cast anyway", () => {
    let { s, ap, ids } = setup([bear(), repel, { ...repel }]);
    // Countering our own creature spell: the bear goes first, then Repel Intruders on it while holding priority.
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    const spell = s.stack[s.stack.length - 1]!.id;
    s = passAll(castWith(s, ap, ids[1]!, ["Plains", "Island", "Mountain", "Mountain"], [{ kind: "stack", id: spell }]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => /Kithkin/.test(name(s, id)))).toHaveLength(2);
    s = passAll(castWith(s, ap, ids[2]!, ["Plains", "Mountain", "Mountain", "Mountain"], [{ kind: "none" }]));
    expect(s.battlefield.filter((id) => /Kithkin/.test(name(s, id)))).toHaveLength(4);
  });

  it("Moonhold paid with {R}: the target player can't play lands this turn, but can still cast creature spells", () => {
    let { s, ap, ids } = setup([moonhold, forestCard, bear()]);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = passAll(castWith(s, ap, ids[0]!, ["Mountain", "Island", "Island"], [player(ap)]));
    expect(legalActions(s, ap).some((a) => a.type === "playLand")).toBe(false);
    expect(() => act(s, { type: "playLand", player: ap, objectId: ids[1]! })).toThrow();
    expect(planCast(s, ap, ids[2]!)).not.toBeNull();
  });

  it("Moonhold paid with {W}: no creature spells, lands are fine", () => {
    let { s, ap, ids } = setup([moonhold, forestCard, bear()]);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = passAll(castWith(s, ap, ids[0]!, ["Plains", "Island", "Island"], [player(ap)]));
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[2]! })).toThrow();
  });

  it("Batwing Brume paid with {B}: each player loses 1 life for each attacking creature they control", () => {
    let { s, ap, opp, ids } = setup([brume]);
    const attackers = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, bear())];
    putOnBattlefield(s, opp, bear()); // not attacking
    for (const a of attackers) s.objects[a]!.attacking = ap; // as if they were attacking
    const [a, b] = [life(s, ap), life(s, opp)];
    s = passAll(castWith(s, ap, ids[0]!, ["Swamp", "Island"]));
    expect(life(s, opp)).toBe(b - 2);
    expect(life(s, ap)).toBe(a);
    expect(s.preventCombatDamage).toBeFalsy();
  });

  it("Stronghold Discipline: each player loses 1 life for each creature they control", () => {
    let { s, ap, opp, ids } = setup([discipline]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, ap, bear());
    const [a, b] = [life(s, ap), life(s, opp)];
    const others = s.turnOrder.filter((p) => p !== ap && p !== opp);
    const before = others.map((p) => life(s, p));
    s = passAll(castWith(s, ap, ids[0]!, ["Swamp", "Swamp", "Island", "Island"]));
    expect(life(s, ap)).toBe(a - 1);
    expect(life(s, opp)).toBe(b - 3);
    expect(others.map((p) => life(s, p))).toEqual(before);
  });

  it("Burden of Greed: the target player's tapped artifacts only", () => {
    let { s, ap, opp, ids } = setup([greed]);
    const r = [putOnBattlefield(s, opp, rock), putOnBattlefield(s, opp, rock), putOnBattlefield(s, opp, rock)];
    s.objects[r[0]!]!.tapped = s.objects[r[1]!]!.tapped = true;
    s.objects[putOnBattlefield(s, ap, rock)]!.tapped = true;
    const b = life(s, opp);
    s = passAll(castWith(s, ap, ids[0]!, ["Swamp", "Island", "Island", "Island"], [player(opp)]));
    expect(life(s, opp)).toBe(b - 2);
  });
});
