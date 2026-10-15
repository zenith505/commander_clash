// Alternative costs (CR 118.9) that give opponents life, "If you control a Forest, rather than pay this spell's mana cost,
// you may have an opponent gain 3 life" (Invigorate), and the Mercadian Masques free spells, "If an opponent controls an
// Island and you control a Mountain, you may cast this spell without paying its mana cost" (Mogg Salvage). A player who
// can't gain life can't be had gain life for a cost (CR 119.7).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, mountain, passAll, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, castProblem, compileCard, isFullySupported, manaValue, parseManaCost, planCast, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const invigorate = card("Invigorate", "Instant", "{2}{G}", { oracleText: "If you control a Forest, rather than pay this spell's mana cost, you may have an opponent gain 3 life.\nTarget creature gets +4/+4 until end of turn." });
const silence = card("Reverent Silence", "Sorcery", "{3}{G}", { oracleText: "If you control a Forest, rather than pay this spell's mana cost, you may have each other player gain 6 life.\nDestroy all enchantments." });
const cutter = card("Skyshroud Cutter", "Creature — Beast", "{4}{G}", { power: "3", toughness: "5", oracleText: "If you control a Forest, rather than pay this spell's mana cost, you may have each other player gain 5 life." });
const salvage = card("Mogg Salvage", "Instant", "{2}{R}", { oracleText: "If an opponent controls an Island and you control a Mountain, you may cast this spell without paying its mana cost.\nDestroy target artifact." });
const massacre = card("Massacre", "Sorcery", "{2}{B}{B}", { oracleText: "If an opponent controls a Plains and you control a Swamp, you may cast this spell without paying its mana cost.\nAll creatures get -2/-2 until end of turn." });
const rain = card("Refreshing Rain", "Instant", "{3}{G}", { oracleText: "If an opponent controls a Swamp and you control a Forest, you may cast this spell without paying its mana cost.\nTarget player gains 6 life." });
const submerge = card("Submerge", "Instant", "{4}{U}", { oracleText: "If an opponent controls a Forest and you control an Island, you may cast this spell without paying its mana cost.\nPut target creature on top of its owner's library." });
const choArrim = card("Cho-Arrim Legate", "Creature — Human Soldier", "{2}{W}", { power: "1", toughness: "2", keywords: ["Protection"], oracleText: "If an opponent controls a Swamp and you control a Plains, you may cast this spell without paying its mana cost.\nProtection from black" });
const kyren = card("Kyren Legate", "Creature — Goblin", "{1}{R}", { power: "1", toughness: "1", keywords: ["Haste"], oracleText: "If an opponent controls a Plains and you control a Mountain, you may cast this spell without paying its mana cost.\nHaste" });
const saprazzan = card("Saprazzan Legate", "Creature — Merfolk Soldier", "{2}{U}", { power: "1", toughness: "3", keywords: ["Flying"], oracleText: "If an opponent controls a Mountain and you control an Island, you may cast this spell without paying its mana cost.\nFlying" });
const deepwood = card("Deepwood Legate", "Creature — Shade", "{3}{B}", { power: "2", toughness: "1", oracleText: "If an opponent controls a Forest and you control a Swamp, you may cast this spell without paying its mana cost.\n{B}: This creature gets +1/+1 until end of turn." });
const rushwood = card("Rushwood Legate", "Creature — Dryad", "{2}{G}", { power: "2", toughness: "1", oracleText: "If an opponent controls an Island and you control a Forest, you may cast this spell without paying its mana cost." });

const anthem = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });

const alt = { alt: "alternative" as const };
const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const tapAll = (s: GameState, pid: PlayerId) => s.battlefield.forEach((id) => s.objects[id]!.controller === pid && (s.objects[id]!.tapped = true));
const problem = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], more = {}) => castProblem(s, pid, id, targets, undefined, undefined, undefined, undefined, { ...alt, ...more });
const target = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
/** The game with only the active player's chosen lands (setup gives them one of each basic, several times over). */
const onlyLands = (s: GameState, pid: PlayerId, keep: CardDef[]) => {
  const names = keep.map((d) => d.name);
  s.battlefield = s.battlefield.filter((id) => {
    const o = s.objects[id]!;
    const name = s.cards[o.cardId]!.name;
    return !(o.controller === pid && ["Forest", "Island", "Mountain", "Plains", "Swamp"].includes(name) && !names.includes(name));
  });
};

describe("Alternative costs that give opponents life, and free spells", () => {
  it("is supported", () => [invigorate, silence, cutter, salvage, massacre, rain, submerge, choArrim, kyren, saprazzan, deepwood, rushwood].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Invigorate: an opponent you pick gains 3 life instead of {2}{G}, only while you control a Forest", () => {
    const { s: s0, ap, ids } = setup([invigorate]);
    const [inv] = ids as [string];
    const b = putOnBattlefield(s0, ap, bear());
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId];
    tapAll(s0, ap);
    expect(problem(s0, ap, inv, [target(b)], { lifeTo: ap })).toMatch(/choose an opponent/);
    expect(problem(s0, ap, inv, [target(b)], { lifeTo: o2 })).toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, inv, [target(b)], undefined, undefined, undefined, { ...alt, lifeTo: o2 })));
    expect(s.players[o2]!.life).toBe(43);
    expect(s.players[o1]!.life).toBe(40);
    expect(s.log.some((e) => /has .* gain 3 life/.test(e.text))).toBe(true);
    expect(s.objects[inv]!.zone).toBe("graveyard");
    // No Forest, no alternative cost (CR 601.2b).
    const { s: s1, ap: ap1, ids: ids1 } = setup([invigorate]);
    onlyLands(s1, ap1, [mountain]);
    const b1 = putOnBattlefield(s1, ap1, bear());
    expect(problem(s1, ap1, ids1[0]!, [target(b1)], { lifeTo: s1.turnOrder.find((p) => p !== ap1)! })).toMatch(/can't be paid now|isn't|only/);
  });

  it("Invigorate: an opponent who can't gain life can't be picked (CR 119.7)", () => {
    const { s, ap, ids } = setup([invigorate]);
    const b = putOnBattlefield(s, ap, bear());
    const [o1, o2] = s.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId];
    // "Players other than o2 can't gain life this turn."
    s.noLifeGain = [{ turn: s.turn, controller: o2, who: "opponents" }];
    expect(problem(s, ap, ids[0]!, [target(b)], { lifeTo: o1 })).toMatch(/can't gain life/);
    expect(problem(s, ap, ids[0]!, [target(b)], { lifeTo: o2 })).toBeNull();
    s.noLifeGain = [{ turn: s.turn, controller: ap, who: "opponents" }];
    expect(problem(s, ap, ids[0]!, [target(b)])).toMatch(/no opponent can gain life/);
  });

  it("Reverent Silence: each other player gains 6 life, and it's unpayable if one can't gain life", () => {
    const { s: s0, ap, ids } = setup([silence]);
    const others = s0.turnOrder.filter((p) => p !== ap);
    const aura = putOnBattlefield(s0, others[0]!, anthem);
    tapAll(s0, ap);
    expect(problem(s0, ap, ids[0]!)).toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, alt)));
    expect(others.map((p) => s.players[p]!.life)).toEqual([46, 46, 46]);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.objects[aura]!.zone).toBe("graveyard");
    const { s: s1, ap: ap1, ids: ids1 } = setup([silence]);
    s1.noLifeGain = [{ turn: s1.turn, controller: s1.turnOrder.find((p) => p !== ap1)!, who: "opponents" }];
    expect(problem(s1, ap1, ids1[0]!)).toMatch(/every other player must be able to gain life/);
  });

  it("Skyshroud Cutter: a creature spell cast for each other player gaining 5 life keeps its mana value", () => {
    const { s: s0, ap, ids } = setup([cutter]);
    tapAll(s0, ap);
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, alt)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.turnOrder.filter((p) => p !== ap).every((p) => s.players[p]!.life === 45)).toBe(true);
    expect(manaValue(parseManaCost(cutter.manaCost))).toBe(5);
  });

  it("Mogg Salvage: free if any opponent controls an Island and you control a Mountain, checked only as it's cast", () => {
    const { s: s0, ap, ids } = setup([salvage]);
    const [o1, , o3] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId, PlayerId];
    const ring = putOnBattlefield(s0, o1, solRing);
    tapAll(s0, ap);
    // No opponent has an Island yet.
    expect(problem(s0, ap, ids[0]!, [target(ring)])).toMatch(/can't be paid now|only/);
    // A different opponent's Island will do (rulings).
    const isl = putOnBattlefield(s0, o3, island);
    expect(problem(s0, ap, ids[0]!, [target(ring)])).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(ring)], undefined, undefined, undefined, alt));
    // The Island leaving afterward doesn't matter (rulings).
    s.battlefield = s.battlefield.filter((id) => id !== isl);
    s = passAll(s);
    expect(s.objects[ring]!.zone).toBe("graveyard");
    // Without a Mountain of your own, no.
    const { s: s1, ap: ap1, ids: ids1 } = setup([salvage]);
    onlyLands(s1, ap1, [island, forest]);
    putOnBattlefield(s1, s1.turnOrder.find((p) => p !== ap1)!, island);
    const ring1 = putOnBattlefield(s1, s1.turnOrder.find((p) => p !== ap1)!, solRing);
    expect(problem(s1, ap1, ids1[0]!, [target(ring1)])).not.toBeNull();
    expect(compileCard(salvage).altCosts?.[0]).toMatchObject({ kind: "alternative", mana: "", if: { kind: "allOf" } });
  });

  it("Massacre, Refreshing Rain, and a Legate cast for free", () => {
    const { s: s0, ap, ids } = setup([massacre, rain, kyren]);
    const [o1] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId];
    putOnBattlefield(s0, o1, plainsCard);
    putOnBattlefield(s0, o1, swamp);
    const theirBear = putOnBattlefield(s0, o1, bear());
    tapAll(s0, ap);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, alt)));
    expect(s.objects[theirBear]!.zone).toBe("graveyard");
    s = passAll(run(s, planCast(s, ap, ids[1]!, [player(ap)], undefined, undefined, undefined, alt)));
    expect(s.players[ap]!.life).toBe(46);
    s = passAll(run(s, planCast(s, ap, ids[2]!, [], undefined, undefined, undefined, alt)));
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
  });

  it("bots cast them this way when the mana isn't there", () => {
    const { s, ap, ids } = setup([kyren, silence]);
    const [o1] = s.turnOrder.filter((p) => p !== ap) as [PlayerId];
    putOnBattlefield(s, o1, plainsCard);
    putOnBattlefield(s, o1, anthem);
    s.players[ap]!.hand = [...ids]; // no land to play first
    tapAll(s, ap);
    const first = botActions(s, ap).find((a) => a.type === "castSpell");
    expect(first).toMatchObject({ type: "castSpell", objectId: ids[1], alt: "alternative" });
    const next = passAll(botActions(s, ap).reduce((x, a) => act(x, a), s));
    expect(botActions(next, ap).find((a) => a.type === "castSpell")).toMatchObject({ objectId: ids[0], alt: "alternative" });
  });
});
