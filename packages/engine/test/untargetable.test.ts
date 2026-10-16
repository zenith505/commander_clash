// "Can't be the target of ..." (CR 115.4): spells or abilities your opponents control (Canopy Cover: the Aura's controller's
// opponents, not hexproof, rulings), spells only (Spectral Shield), spells of some colors (Karplusan Strider), spells or
// abilities from sources of a color (Mercenary Informer) or not of a color (Gaea's Revenge), Aura spells (Bartel Runeaxe),
// and for a turn (Vines of Vastwood).

import { describe, expect, it } from "vitest";
import { bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, castProblem, isFullySupported, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const canopy = card("Canopy Cover", "Enchantment — Aura", "{1}{G}", { oracleText: "Enchant creature\nEnchanted creature can't be blocked except by creatures with flying or reach.\nEnchanted creature can't be the target of spells or abilities your opponents control." });
const plax = card("Shielding Plax", "Enchantment — Aura", "{2}{G/U}", { oracleText: "({G/U} can be paid with either {G} or {U}.)\nEnchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature can't be the target of spells or abilities your opponents control." });
const spectral = card("Spectral Shield", "Enchantment — Aura", "{1}{W}{U}", { oracleText: "Enchant creature\nEnchanted creature gets +0/+2 and can't be the target of spells." });
const revenge = card("Gaea's Revenge", "Creature — Elemental", "{5}{G}{G}", { power: "8", toughness: "5", keywords: ["Haste"], oracleText: "This spell can't be countered.\nHaste\nThis creature can't be the target of nongreen spells or abilities from nongreen sources." });
const informer = card("Mercenary Informer", "Creature — Human Rebel Mercenary", "{2}{W}", { power: "2", toughness: "1", oracleText: "This creature can't be the target of black spells or abilities from black sources.\n{2}{W}: Put target nontoken Mercenary on the bottom of its owner's library." });
const strider = card("Karplusan Strider", "Creature — Yeti", "{3}{G}", { power: "3", toughness: "4", oracleText: "This creature can't be the target of blue or black spells." });
const thrun = card("Thrun, Breaker of Silence", "Legendary Creature — Troll Shaman", "{3}{G}{G}", { power: "5", toughness: "5", supertypes: ["Legendary"], keywords: ["Trample"], oracleText: "This spell can't be countered.\nTrample\nThrun can't be the target of nongreen spells your opponents control or abilities from nongreen sources your opponents control.\nDuring your turn, Thrun has indestructible." });
const bartel = card("Bartel Runeaxe", "Legendary Creature — Giant Warrior", "{3}{B}{R}{G}", { power: "6", toughness: "5", supertypes: ["Legendary"], keywords: ["Vigilance"], oracleText: "Vigilance\nBartel Runeaxe can't be the target of Aura spells." });
const paladin = card("Fiendslayer Paladin", "Creature — Human Knight", "{1}{W}{W}", { power: "2", toughness: "2", keywords: ["First strike", "Lifelink"], oracleText: "First strike (This creature deals combat damage before creatures without first strike.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)\nThis creature can't be the target of black or red spells your opponents control." });
const vines = card("Vines of Vastwood", "Instant", "{G}", { keywords: ["Kicker"], oracleText: "Kicker {G} (You may pay an additional {G} as you cast this spell.)\nTarget creature can't be the target of spells or abilities your opponents control this turn. If this spell was kicked, that creature gets +4/+4 until end of turn." });

const shock = () => card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const disfigure = () => card("Disfigure", "Instant", "{B}", { oracleText: "Target creature gets -2/-2 until end of turn." });
const growth = () => card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const pyromancer = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const holy = card("Holy Strength", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });

/** Whether `pid` could cast the card `id` (in their hand) at `t`, mana aside. */
const canCast = (s: GameState, pid: PlayerId, id: string, t: string) => {
  const was = s.priority;
  s.priority = pid;
  const problem = castProblem(s, pid, id, [target(t)]);
  s.priority = was;
  return !/target/.test(problem ?? "");
};
/** A card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

describe("can't be the target of ...", () => {
  it("compiles them", () => supported(canopy, plax, spectral, revenge, informer, strider, thrun, bartel, paladin, vines));

  it("Canopy Cover on an opponent's creature: its controller can't target it, the Aura's controller can", () => {
    let { s, ap, opp, ids } = setup([canopy, shock()]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = cast(s, ap, ids[0]!, [target(theirs)]);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(theirs);
    const theirShock = inHand(s, opp, shock());
    expect(canCast(s, opp, theirShock, theirs)).toBe(false); // not hexproof (rulings)
    expect(canCast(s, ap, ids[1]!, theirs)).toBe(true);
  });

  it("Spectral Shield stops spells, not abilities", () => {
    let { s, ap, ids } = setup([spectral, shock()]);
    const mine = putOnBattlefield(s, ap, bear());
    const pyro = putOnBattlefield(s, ap, pyromancer);
    s = cast(s, ap, ids[0]!, [target(mine)]);
    expect(canCast(s, ap, ids[1]!, mine)).toBe(false);
    expect(abilityProblem(s, ap, pyro, 0, [target(mine)])).toBeNull();
  });

  it("Mercenary Informer: no black spells or abilities from black sources; Karplusan Strider: no blue or black spells", () => {
    const { s, ap, ids } = setup([disfigure(), shock(), growth()]);
    const inf = putOnBattlefield(s, ap, informer);
    const str = putOnBattlefield(s, ap, strider);
    expect(canCast(s, ap, ids[0]!, inf)).toBe(false);
    expect(canCast(s, ap, ids[1]!, inf)).toBe(true);
    expect(canCast(s, ap, ids[0]!, str)).toBe(false);
    expect(canCast(s, ap, ids[2]!, str)).toBe(true);
  });

  it("Gaea's Revenge: green spells only, its controller's colorless or red abilities included", () => {
    const { s, ap, ids } = setup([growth(), shock()]);
    const g = putOnBattlefield(s, ap, revenge);
    const pyro = putOnBattlefield(s, ap, pyromancer);
    expect(canCast(s, ap, ids[0]!, g)).toBe(true);
    expect(canCast(s, ap, ids[1]!, g)).toBe(false);
    expect(abilityProblem(s, ap, pyro, 0, [target(g)])).toMatch(/target/);
  });

  it("Thrun and Fiendslayer Paladin: only opponents' spells and abilities", () => {
    const { s, ap, opp, ids } = setup([shock(), disfigure()]);
    const t = putOnBattlefield(s, ap, thrun);
    const p = putOnBattlefield(s, ap, paladin);
    expect(canCast(s, ap, ids[0]!, t)).toBe(true);
    expect(canCast(s, ap, ids[1]!, p)).toBe(true);
    const theirShock = inHand(s, opp, shock());
    const theirGrowth = inHand(s, opp, growth());
    expect(canCast(s, opp, theirShock, t)).toBe(false);
    expect(canCast(s, opp, theirGrowth, t)).toBe(true);
    expect(canCast(s, opp, theirShock, p)).toBe(false);
    const theirPyro = putOnBattlefield(s, opp, pyromancer);
    const was = s.priority;
    s.priority = opp;
    expect(abilityProblem(s, opp, theirPyro, 0, [target(t)])).toMatch(/target/);
    expect(abilityProblem(s, opp, theirPyro, 0, [target(p)])).toBeNull(); // Fiendslayer: spells only
    s.priority = was;
  });

  it("Bartel Runeaxe: no Aura spells, other spells are fine", () => {
    const { s, ap, ids } = setup([holy, growth()]);
    const b = putOnBattlefield(s, ap, bartel);
    expect(canCast(s, ap, ids[0]!, b)).toBe(false);
    expect(canCast(s, ap, ids[1]!, b)).toBe(true);
  });

  it("Vines of Vastwood on an opponent's creature: its controller can't target it this turn", () => {
    let { s, ap, opp, ids } = setup([vines, shock()]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = cast(s, ap, ids[0]!, [target(theirs)]);
    const theirShock = inHand(s, opp, shock());
    expect(canCast(s, opp, theirShock, theirs)).toBe(false);
    expect(canCast(s, ap, ids[1]!, theirs)).toBe(true);
  });
});
