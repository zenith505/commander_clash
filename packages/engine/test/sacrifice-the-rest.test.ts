// "Each player chooses ..., then sacrifices the rest" (Cataclysm and friends): chosen as it resolves, not targeted; the
// active player first, then the others in turn order; a permanent with several of the types can be chosen for each of
// them; then every unchosen permanent of the kind is sacrificed at the same time (rulings, CR 101.4). With Mythos of
// Snapdax's {B}{R}, you make every player's choices, which must still be legal ones.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";
import { groupValue } from "../src/value";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const cataclysm = card("Cataclysm", "Sorcery", "{2}{W}{W}", { oracleText: "Each player chooses from among the permanents they control an artifact, a creature, an enchantment, and a land, then sacrifices the rest." });
const gearhulk = card("Cataclysmic Gearhulk", "Artifact Creature — Construct", "{3}{W}{W}", { power: "4", toughness: "5", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, each player chooses an artifact, a creature, an enchantment, and a planeswalker from among the nonland permanents they control, then sacrifices the rest." });
const snapdax = card("Mythos of Snapdax", "Sorcery", "{2}{W}{W}", { oracleText: "Each player chooses an artifact, a creature, an enchantment, and a planeswalker from among the nonland permanents they control, then sacrifices the rest. If {B}{R} was spent to cast this spell, you choose the permanents for each player instead." });
const elegy = card("Covetous Elegy", "Sorcery", "{4}{W}{B}", { oracleText: "Each player chooses up to two creatures they control, then sacrifices the rest. Then you create a tapped Treasure token for each creature your opponents control." });
const ruin = card("Global Ruin", "Sorcery", "{4}{W}", { oracleText: "Each player chooses from the lands they control a land of each basic land type, then sacrifices the rest." });
const annihilation = card("Planetary Annihilation", "Sorcery", "{4}{R}{R}", { oracleText: "Each player chooses six lands they control, then sacrifices the rest. Planetary Annihilation deals 6 damage to each creature." });
const razia = card("Razia's Purification", "Sorcery", "{4}{R}{W}", { oracleText: "Each player chooses three permanents they control, then sacrifices the rest." });
const archfiend = card("Archfiend of Depravity", "Creature — Demon", "{3}{B}{B}", { power: "5", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of each opponent's end step, that player chooses up to two creatures they control, then sacrifices the rest." });
const golem = card("Golem Test", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
const aura = card("Glorious Anthem Test", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });
const big = card("Big Test", "Creature — Wurm", "{6}", { power: "7", toughness: "7" });

const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const mine = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid);
function castFrom(s: GameState, pid: PlayerId, id: string, mana: ManaType[]): GameState {
  addMana(s, pid, mana, {});
  return passAll(act(s, { type: "castSpell", player: pid, objectId: id }));
}
const pick = (s: GameState, pid: PlayerId, ids: string[]) => passAll(act(s, { type: "pickPermanents", player: pid, ids }));

describe("choose some, sacrifice the rest", () => {
  it("parses", () => supported(cataclysm, gearhulk, snapdax, elegy, ruin, annihilation, razia, archfiend));

  it("Cataclysm: an artifact creature can be both your artifact and your creature; the rest are sacrificed", () => {
    let { s, ap, ids } = setup([cataclysm]);
    const g = putOnBattlefield(s, ap, golem);
    const b = putOnBattlefield(s, ap, bear());
    const e = putOnBattlefield(s, ap, aura);
    const lands = mine(s, ap).filter((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"));
    s = castFrom(s, ap, ids[0]!, ["W", "W", "C", "C"]);
    // The only artifact is kept without asking; then the creature.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", what: "creature", count: 1 });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([g, b].sort());
    s = pick(s, ap, [g]);
    expect(s.pending).toMatchObject({ action: "keep", what: "land", count: 1 });
    s = pick(s, ap, [lands[0]!]);
    expect(s.pending).toBeFalsy();
    expect([zone(s, g), zone(s, e), zone(s, lands[0]!)]).toEqual(["battlefield", "battlefield", "battlefield"]);
    expect(zone(s, b)).toBe("graveyard");
    expect(lands.slice(1).every((id) => zone(s, id) === "graveyard")).toBe(true);
  });

  it("Mythos of Snapdax: lands stay; each player chooses, the active player first", () => {
    let { s, ap, opp, ids } = setup([snapdax]);
    const [b1, b2] = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, big)];
    const mineBefore = mine(s, ap).length;
    s = castFrom(s, ap, ids[0]!, ["W", "W", "C", "C"]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "keep", what: "creature" });
    expect((s.pending as { of?: number }).of).toBeUndefined();
    s = pick(s, opp, [b2]);
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, b2)).toBe("battlefield");
    expect(mine(s, ap).length).toBe(mineBefore);
  });

  it("Mythos of Snapdax with {B}{R} spent: you choose for each player, and must still choose one", () => {
    let { s, ap, opp, ids } = setup([snapdax]);
    const [b1, b2] = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, big)];
    s = castFrom(s, ap, ids[0]!, ["B", "R", "W", "W"]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", what: "creature", of: opp, count: 1 });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [] })).toThrow();
    s = pick(s, ap, [b1]);
    expect(zone(s, b1)).toBe("battlefield");
    expect(zone(s, b2)).toBe("graveyard");
  });

  it("Covetous Elegy: up to two, so none is fine; then Treasures for the opponents' creatures left", () => {
    let { s, ap, opp, ids } = setup([elegy]);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, big)];
    s = castFrom(s, ap, ids[0]!, ["W", "B", "C", "C", "C", "C"]);
    expect(s.pending).toMatchObject({ player: ap, action: "keep", count: 1, min: 0 });
    s = pick(s, ap, []);
    expect(zone(s, b)).toBe("battlefield"); // all at once, after every player has chosen
    expect(s.pending).toMatchObject({ player: opp, action: "keep", count: 2, min: 0 });
    s = pick(s, opp, [theirs[0]!, theirs[2]!]);
    expect(theirs.map((id) => zone(s, id))).toEqual(["battlefield", "graveyard", "battlefield"]);
    expect(zone(s, b)).toBe("graveyard");
    const treasures = mine(s, ap).filter((id) => s.objects[id]!.isToken);
    expect(treasures.length).toBe(2);
    expect(treasures.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Global Ruin: a land of each basic land type", () => {
    let { s, ap, ids } = setup([ruin]);
    s = castFrom(s, ap, ids[0]!, ["W", "C", "C", "C", "C"]);
    // Three of each basic but two Swamps: one choice for each type.
    for (let i = 0; i < 5; i++) {
      expect(s.pending).toMatchObject({ player: ap, action: "keep", count: 1 });
      s = pick(s, ap, [(s.pending as { options: string[] }).options[0]!]);
    }
    expect(s.pending).toBeFalsy();
    const left = mine(s, ap).map((id) => s.cards[s.objects[id]!.cardId]!.name).sort();
    expect(left).toEqual(["Forest", "Island", "Mountain", "Plains", "Swamp"]);
  });

  it("the bot keeps its best permanents", () => {
    let { s, ap, ids } = setup([razia]);
    const b = putOnBattlefield(s, ap, bear());
    const g = putOnBattlefield(s, ap, big);
    const e = putOnBattlefield(s, ap, aura);
    const g2 = putOnBattlefield(s, ap, golem);
    s = castFrom(s, ap, ids[0]!, ["W", "R", "C", "C", "C", "C"]);
    expect(s.pending).toMatchObject({ player: ap, action: "keep", count: 3 });
    for (const a of botActions(s, ap)) s = act(s, a);
    s = passAll(s);
    expect([b, g, g2, e].map((id) => zone(s, id))).toEqual(["battlefield", "battlefield", "battlefield", "graveyard"]);
    expect(mine(s, ap).length).toBe(3);
  });

  it("the bot keeps as many as it may when it's up to two", () => {
    let { s, ap, opp, ids } = setup([elegy]);
    const theirs = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, big), putOnBattlefield(s, opp, golem)];
    s = castFrom(s, ap, ids[0]!, ["W", "B", "C", "C", "C", "C"]);
    expect(s.pending).toMatchObject({ player: opp, action: "keep", count: 2, min: 0 });
    for (const a of botActions(s, opp)) s = act(s, a);
    s = passAll(s);
    expect(theirs.map((id) => zone(s, id))).toEqual(["graveyard", "battlefield", "battlefield"]);
  });

  it("a bot casts Cataclysm only when the opponents lose more", () => {
    const { s, ap, opp } = setup([]);
    const body = compileCard(cataclysm).spell!;
    expect(groupValue(s, ap, body)).toBeLessThan(0);
    for (let i = 0; i < 5; i++) putOnBattlefield(s, opp, big);
    expect(groupValue(s, ap, body)).toBeGreaterThan(0);
  });
});
