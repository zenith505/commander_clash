// Lane B, round 2: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { attackProblem, blockProblem, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { dealDamage, objectSource } from "../src/damage";
import { cantBlockNow, blockRequirementProblem, potentialAttackers } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const redBear = () => creature("Red Bear", "Creature — Bear", "{1}{R}", 2, 2);
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const whiteBear = () => creature("White Bear", "Creature — Bear", "{1}{W}", 2, 2);
const blueBear = () => creature("Blue Bear", "Creature — Bear", "{1}{U}", 2, 2);
const blackBear = () => creature("Black Bear", "Creature — Bear", "{1}{B}", 2, 2);
const wall = () => creature("Wall", "Creature — Wall", "{1}", 0, 6, { keywords: ["Defender"], oracleText: "Defender" });
/** Attackers declared, the game paused on the defending player's blocks. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};

// Real oracle text (Scryfall).
const amnesia = card("Amnesia", "Sorcery", "{3}{U}{U}{U}", { cmc: 6, oracleText: "Target player reveals their hand and discards all nonland cards." });
const anavolver = card("Anavolver", "Creature — Volver", "{3}{G}", { cmc: 4, power: "3", toughness: "3", keywords: ["Regenerate","Kicker"], oracleText: "Kicker {1}{U} and/or {B} (You may pay an additional {1}{U} and/or {B} as you cast this spell.)\nIf this creature was kicked with its {1}{U} kicker, it enters with two +1/+1 counters on it and with flying.\nIf this creature was kicked with its {B} kicker, it enters with a +1/+1 counter on it and with \"Pay 3 life: Regenerate this creature.\"" });
const benalishMissionary = card("Benalish Missionary", "Creature — Human Cleric", "{W}", { cmc: 1, power: "1", toughness: "1", oracleText: "{1}{W}, {T}: Prevent all combat damage that would be dealt by target blocked creature this turn." });
const brandedBrawlers = card("Branded Brawlers", "Creature — Human Soldier", "{R}", { cmc: 1, power: "2", toughness: "2", oracleText: "This creature can't attack if defending player controls an untapped land.\nThis creature can't block if you control an untapped land." });
const cetavolver = card("Cetavolver", "Creature — Volver", "{1}{U}", { cmc: 2, power: "1", toughness: "1", keywords: ["Kicker"], oracleText: "Kicker {1}{R} and/or {G} (You may pay an additional {1}{R} and/or {G} as you cast this spell.)\nIf this creature was kicked with its {1}{R} kicker, it enters with two +1/+1 counters on it and with first strike.\nIf this creature was kicked with its {G} kicker, it enters with a +1/+1 counter on it and with trample." });
const deathsCaress = card("Death's Caress", "Sorcery", "{3}{B}{B}", { cmc: 5, oracleText: "Destroy target creature. If that creature was a Human, you gain life equal to its toughness." });
const degavolver = card("Degavolver", "Creature — Volver", "{1}{W}", { cmc: 2, power: "1", toughness: "1", keywords: ["Regenerate","Kicker"], oracleText: "Kicker {1}{B} and/or {R} (You may pay an additional {1}{B} and/or {R} as you cast this spell.)\nIf this creature was kicked with its {1}{B} kicker, it enters with two +1/+1 counters on it and with \"Pay 3 life: Regenerate this creature.\"\nIf this creature was kicked with its {R} kicker, it enters with a +1/+1 counter on it and with first strike." });
const emberGale = card("Ember Gale", "Sorcery", "{3}{R}", { cmc: 4, oracleText: "Creatures target player controls can't block this turn. Ember Gale deals 1 damage to each white and/or blue creature that player controls." });
const enchantedBeing = card("Enchanted Being", "Creature — Human", "{1}{W}{W}", { cmc: 3, power: "2", toughness: "2", oracleText: "Prevent all combat damage that would be dealt to this creature by enchanted creatures." });
const evaporate = card("Evaporate", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Evaporate deals 1 damage to each white and/or blue creature." });
const glacialCrasher = card("Glacial Crasher", "Creature — Elemental", "{4}{U}{U}", { cmc: 6, power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nThis creature can't attack unless there is a Mountain on the battlefield." });
const gloomlance = card("Gloomlance", "Sorcery", "{3}{B}{B}", { cmc: 5, oracleText: "Destroy target creature. If that creature was green or white, its controller discards a card." });
const goblinFurrier = card("Goblin Furrier", "Creature — Goblin Warrior", "{1}{R}", { cmc: 2, power: "2", toughness: "2", oracleText: "Prevent all damage that this creature would deal to snow creatures." });
const goblinGoon = card("Goblin Goon", "Creature — Goblin Mutant", "{3}{R}", { cmc: 4, power: "6", toughness: "6", oracleText: "This creature can't attack unless you control more creatures than defending player.\nThis creature can't block unless you control more creatures than attacking player." });
const gossamerChains = card("Gossamer Chains", "Enchantment", "{W}{W}", { cmc: 2, oracleText: "Return this enchantment to its owner's hand: Prevent all combat damage that would be dealt by target unblocked creature this turn." });
const greaterWerewolf = card("Greater Werewolf", "Creature — Werewolf", "{4}{B}", { cmc: 5, power: "2", toughness: "4", oracleText: "At end of combat, put a -0/-2 counter on each creature blocking or blocked by this creature." });
const harborGuardian = card("Harbor Guardian", "Creature — Gargoyle", "{2}{W}{U}", { cmc: 4, power: "3", toughness: "4", keywords: ["Reach"], oracleText: "Reach (This creature can block creatures with flying.)\nWhenever this creature attacks, defending player may draw a card." });
const harmonicConvergence = card("Harmonic Convergence", "Instant", "{2}{G}", { cmc: 3, oracleText: "Put all enchantments on top of their owners' libraries." });
const indenturedOaf = card("Indentured Oaf", "Creature — Ogre Warrior", "{3}{R}", { cmc: 4, power: "4", toughness: "3", oracleText: "Prevent all damage that this creature would deal to red creatures." });
const inkfathomWitch = card("Inkfathom Witch", "Creature — Merfolk Wizard", "{1}{U/B}", { cmc: 2, power: "1", toughness: "1", keywords: ["Fear"], oracleText: "Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\n{2}{U}{B}: Each unblocked creature has base power and toughness 4/1 until end of turn." });
const inquisition = card("Inquisition", "Sorcery", "{2}{B}", { cmc: 3, oracleText: "Target player reveals their hand. Inquisition deals damage to that player equal to the number of white cards in their hand." });
const ivoryGuardians = card("Ivory Guardians", "Creature — Giant Cleric", "{4}{W}{W}", { cmc: 6, power: "3", toughness: "3", keywords: ["Protection"], oracleText: "Protection from red\nCreatures named Ivory Guardians get +1/+1 as long as an opponent controls a nontoken red permanent." });
const kavuRunner = card("Kavu Runner", "Creature — Kavu", "{3}{R}", { cmc: 4, power: "3", toughness: "3", oracleText: "This creature has haste as long as no opponent controls a white or blue creature." });
const kjeldoranFrostbeast = card("Kjeldoran Frostbeast", "Creature — Elemental Beast", "{3}{G}{W}", { cmc: 5, power: "2", toughness: "4", oracleText: "At end of combat, destroy all creatures blocking or blocked by this creature." });
const marblePriest = card("Marble Priest", "Artifact Creature — Cleric", "{5}", { cmc: 5, power: "3", toughness: "3", oracleText: "All Walls able to block this creature do so.\nPrevent all combat damage that would be dealt to this creature by Walls." });
const moggToady = card("Mogg Toady", "Creature — Goblin", "{1}{R}", { cmc: 2, power: "2", toughness: "2", oracleText: "This creature can't attack unless you control more creatures than defending player.\nThis creature can't block unless you control more creatures than attacking player." });
const moldDemon = card("Mold Demon", "Creature — Fungus Demon", "{5}{B}{B}", { cmc: 7, power: "6", toughness: "6", oracleText: "When this creature enters, sacrifice it unless you sacrifice two Swamps." });
const monstrousHound = card("Monstrous Hound", "Creature — Dog", "{3}{R}", { cmc: 4, power: "4", toughness: "4", oracleText: "This creature can't attack unless you control more lands than defending player.\nThis creature can't block unless you control more lands than attacking player." });
const mudhole = card("Mudhole", "Instant", "{2}{R}", { cmc: 3, oracleText: "Target player exiles all land cards from their graveyard." });
const necravolver = card("Necravolver", "Creature — Volver", "{2}{B}", { cmc: 3, power: "2", toughness: "2", keywords: ["Kicker"], oracleText: "Kicker {1}{G} and/or {W} (You may pay an additional {1}{G} and/or {W} as you cast this spell.)\nIf this creature was kicked with its {1}{G} kicker, it enters with two +1/+1 counters on it and with trample.\nIf this creature was kicked with its {W} kicker, it enters with a +1/+1 counter on it and with \"Whenever this creature deals damage, you gain that much life.\"" });
const plowUnder = card("Plow Under", "Sorcery", "{3}{G}{G}", { cmc: 5, oracleText: "Put two target lands on top of their owners' libraries." });
const possessedAven = card("Possessed Aven", "Creature — Bird Soldier Horror", "{2}{U}{U}", { cmc: 4, power: "3", toughness: "3", keywords: ["Flying","Threshold"], oracleText: "Flying\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1, is black, and has \"{2}{B}, {T}: Destroy target blue creature.\"" });
const possessedBarbarian = card("Possessed Barbarian", "Creature — Human Barbarian Horror", "{2}{R}{R}", { cmc: 4, power: "3", toughness: "3", keywords: ["First strike","Threshold"], oracleText: "First strike\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1, is black, and has \"{2}{B}, {T}: Destroy target red creature.\"" });
const possessedCentaur = card("Possessed Centaur", "Creature — Centaur Horror", "{2}{G}{G}", { cmc: 4, power: "3", toughness: "3", keywords: ["Trample","Threshold"], oracleText: "Trample\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1, is black, and has \"{2}{B}, {T}: Destroy target green creature.\"" });
const possessedNomad = card("Possessed Nomad", "Creature — Human Nomad Horror", "{2}{W}{W}", { cmc: 4, power: "3", toughness: "3", keywords: ["Vigilance","Threshold"], oracleText: "Vigilance\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1, is black, and has \"{2}{B}, {T}: Destroy target white creature.\"" });
const prophesiedEnd = card("Prophesied End", "Instant", "{1}{W}", { cmc: 2, oracleText: "Destroy target creature. If it wasn't attacking, its controller draws a card." });
const psionicEntity = card("Psionic Entity", "Creature — Illusion", "{4}{U}", { cmc: 5, power: "2", toughness: "2", oracleText: "{T}: This creature deals 2 damage to any target and 3 damage to itself." });
const psionicSliver = card("Psionic Sliver", "Creature — Sliver", "{4}{U}", { cmc: 5, power: "2", toughness: "2", oracleText: "All Sliver creatures have \"{T}: This creature deals 2 damage to any target and 3 damage to itself.\"" });
const rakavolver = card("Rakavolver", "Creature — Volver", "{2}{R}", { cmc: 3, power: "2", toughness: "2", keywords: ["Kicker"], oracleText: "Kicker {1}{W} and/or {U} (You may pay an additional {1}{W} and/or {U} as you cast this spell.)\nIf this creature was kicked with its {1}{W} kicker, it enters with two +1/+1 counters on it and with \"Whenever this creature deals damage, you gain that much life.\"\nIf this creature was kicked with its {U} kicker, it enters with a +1/+1 counter on it and with flying." });
const rathiDragon = card("Rathi Dragon", "Creature — Dragon", "{2}{R}{R}", { cmc: 4, power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhen this creature enters, sacrifice it unless you sacrifice two Mountains." });
const rebukingCeremony = card("Rebuking Ceremony", "Sorcery", "{3}{G}{G}", { cmc: 5, oracleText: "Put two target artifacts on top of their owners' libraries." });
const recklessEmbermage = card("Reckless Embermage", "Creature — Human Wizard", "{3}{R}", { cmc: 4, power: "2", toughness: "2", oracleText: "{1}{R}: This creature deals 1 damage to any target and 1 damage to itself." });
const scarredPuma = card("Scarred Puma", "Creature — Cat", "{R}", { cmc: 1, power: "2", toughness: "1", oracleText: "This creature can't attack unless a black or green creature also attacks." });
const shatterAssumptions = card("Shatter Assumptions", "Sorcery", "{1}{B}{B}", { cmc: 3, oracleText: "Choose one —\n• Target opponent reveals their hand and discards all colorless nonland cards.\n• Target opponent reveals their hand and discards all multicolored cards." });
const sibilantSpirit = card("Sibilant Spirit", "Creature — Spirit", "{5}{U}", { cmc: 6, power: "5", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, defending player may draw a card." });
const skittishKavu = card("Skittish Kavu", "Creature — Kavu", "{1}{R}", { cmc: 2, power: "1", toughness: "1", oracleText: "This creature gets +1/+1 as long as no opponent controls a white or blue creature." });
const smite = card("Smite", "Instant", "{W}", { cmc: 1, oracleText: "Destroy target blocked creature." });
const snag = card("Snag", "Instant", "{3}{G}", { cmc: 4, oracleText: "You may discard a Forest card rather than pay this spell's mana cost.\nPrevent all combat damage that would be dealt by unblocked creatures this turn." });
const tattermungeWitch = card("Tattermunge Witch", "Creature — Goblin Shaman", "{1}{R/G}", { cmc: 2, power: "2", toughness: "1", oracleText: "{R}{G}: Each blocked creature gets +1/+0 and gains trample until end of turn." });
const tombfire = card("Tombfire", "Sorcery", "{B}", { cmc: 1, oracleText: "Target player exiles all cards with flashback from their graveyard." });
const trapfindersTrick = card("Trapfinder's Trick", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Target player reveals their hand and discards all Trap cards." });
const tresserhornSkyknight = card("Tresserhorn Skyknight", "Creature — Zombie Knight", "{5}{B}{B}", { cmc: 7, power: "5", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nPrevent all damage that would be dealt to this creature by creatures with first strike." });
const unlikelyAlliance = card("Unlikely Alliance", "Enchantment", "{1}{W}", { cmc: 2, oracleText: "{1}{W}: Target nonattacking, nonblocking creature gets +0/+2 until end of turn." });
const veteranBrawlers = card("Veteran Brawlers", "Creature — Human Soldier", "{1}{R}", { cmc: 2, power: "4", toughness: "4", oracleText: "This creature can't attack if defending player controls an untapped land.\nThis creature can't block if you control an untapped land." });
const vexingBeetle = card("Vexing Beetle", "Creature — Insect", "{4}{G}", { cmc: 5, power: "3", toughness: "3", oracleText: "This spell can't be countered.\nThis creature gets +3/+3 as long as no opponent controls a creature." });
const wallOfPutridFlesh = card("Wall of Putrid Flesh", "Creature — Wall", "{2}{B}", { cmc: 3, power: "2", toughness: "4", keywords: ["Protection","Defender"], oracleText: "Defender (This creature can't attack.)\nProtection from white\nPrevent all damage that would be dealt to this creature by enchanted creatures." });
const warpath = card("Warpath", "Instant", "{3}{R}", { cmc: 4, oracleText: "Warpath deals 3 damage to each blocking creature and each blocked creature." });
const wirecat = card("Wirecat", "Artifact Creature — Cat", "{4}", { cmc: 4, power: "4", toughness: "3", oracleText: "This creature can't attack or block if an enchantment is on the battlefield." });
const wormwoodDryad = card("Wormwood Dryad", "Creature — Dryad", "{2}{G}", { cmc: 3, power: "3", toughness: "1", oracleText: "{G}: This creature gains forestwalk until end of turn and deals 1 damage to you. (It can't be blocked as long as defending player controls a Forest.)\n{B}: This creature gains swampwalk until end of turn and deals 1 damage to you. (It can't be blocked as long as defending player controls a Swamp.)" });
const wormwoodTreefolk = card("Wormwood Treefolk", "Creature — Treefolk", "{3}{G}{G}", { cmc: 5, power: "4", toughness: "4", oracleText: "{G}{G}: This creature gains forestwalk until end of turn and deals 2 damage to you. (It can't be blocked as long as defending player controls a Forest.)\n{B}{B}: This creature gains swampwalk until end of turn and deals 2 damage to you. (It can't be blocked as long as defending player controls a Swamp.)" });
const zombieMob = card("Zombie Mob", "Creature — Zombie", "{2}{B}{B}", { cmc: 4, power: "2", toughness: "0", oracleText: "This creature enters with a +1/+1 counter on it for each creature card in your graveyard.\nWhen this creature enters, exile all creature cards from your graveyard." });

describe("Prevent all damage ~ would deal to red creatures, or that would be dealt to ~ by some creatures (CR 615)", () => {
  it("are fully supported", () => supported(indenturedOaf, goblinFurrier, enchantedBeing, tresserhornSkyknight, wallOfPutridFlesh, marblePriest));

  it("Indentured Oaf deals no damage to red creatures, and Goblin Furrier none to snow creatures", () => {
    const { s, ap } = setup([]);
    const oaf = putOnBattlefield(s, ap, indenturedOaf);
    const fur = putOnBattlefield(s, ap, goblinFurrier);
    const red = putOnBattlefield(s, next(s, ap), redBear());
    const green = putOnBattlefield(s, next(s, ap), greenBear());
    const snow = putOnBattlefield(s, next(s, ap), creature("Snow Bear", "Snow Creature — Bear", "{1}{G}", 2, 2));
    expect(dealDamage(s, objectSource(s, s.objects[oaf]!), { object: s.objects[red]! }, 4)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[oaf]!), { object: s.objects[green]! }, 1)).toBe(1);
    expect(dealDamage(s, objectSource(s, s.objects[fur]!), { object: s.objects[snow]! }, 2)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[fur]!), { object: s.objects[red]! }, 1)).toBe(1);
    expect(dealDamage(s, objectSource(s, s.objects[fur]!), { player: next(s, ap) }, 2)).toBe(2);
  });

  it("Enchanted Being takes no combat damage from enchanted creatures; Wall of Putrid Flesh no damage at all from them", () => {
    const { s, ap } = setup([]);
    const being = putOnBattlefield(s, ap, enchantedBeing);
    const putrid = putOnBattlefield(s, ap, wallOfPutridFlesh);
    const b = putOnBattlefield(s, next(s, ap), greenBear());
    const plain = putOnBattlefield(s, next(s, ap), greenBear());
    const aura = putOnBattlefield(s, next(s, ap), card("Aura", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature" }));
    s.objects[aura]!.attachedTo = b;
    invalidateCharacteristics(s);
    const src = () => objectSource(s, s.objects[b]!);
    expect(dealDamage(s, src(), { object: s.objects[being]! }, 2, { combat: true })).toBe(0);
    expect(dealDamage(s, src(), { object: s.objects[being]! }, 1)).toBe(1); // not combat damage
    expect(dealDamage(s, src(), { object: s.objects[putrid]! }, 1)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[plain]!), { object: s.objects[being]! }, 1, { combat: true })).toBe(1);
    expect(dealDamage(s, objectSource(s, s.objects[plain]!), { object: s.objects[putrid]! }, 1)).toBe(1);
  });

  it("Tresserhorn Skyknight takes no damage from creatures with first strike; Marble Priest no combat damage from Walls", () => {
    const { s, ap } = setup([]);
    const sky = putOnBattlefield(s, ap, tresserhornSkyknight);
    const mp = putOnBattlefield(s, ap, marblePriest);
    const fs = putOnBattlefield(s, next(s, ap), creature("Striker", "Creature — Human", "{1}{W}", 2, 2, { keywords: ["First strike"], oracleText: "First strike" }));
    const w = putOnBattlefield(s, next(s, ap), creature("Spiked Wall", "Creature — Wall", "{1}", 3, 3, { keywords: ["Defender"], oracleText: "Defender" }));
    expect(dealDamage(s, objectSource(s, s.objects[fs]!), { object: s.objects[sky]! }, 2)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[w]!), { object: s.objects[sky]! }, 1)).toBe(1);
    expect(dealDamage(s, objectSource(s, s.objects[w]!), { object: s.objects[mp]! }, 3, { combat: true })).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[w]!), { object: s.objects[mp]! }, 1)).toBe(1);
    expect(dealDamage(s, objectSource(s, s.objects[fs]!), { object: s.objects[mp]! }, 1, { combat: true })).toBe(1);
  });
});

describe("All Walls able to block ~ do so (Marble Priest, CR 509.1c)", () => {
  it("each Wall able to block it must, other creatures needn't, and bots obey", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const mp = putOnBattlefield(s, ap, marblePriest);
    const w1 = putOnBattlefield(s, opp, wall());
    const w2 = putOnBattlefield(s, opp, wall());
    const b = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: mp, defender: opp }]);
    expect(blockRequirementProblem(s, opp, [])).toMatch(/must block Marble Priest/);
    expect(blockRequirementProblem(s, opp, [{ blocker: w1, attacker: mp }])).toMatch(/must block Marble Priest/);
    expect(blockRequirementProblem(s, opp, [{ blocker: w1, attacker: mp }, { blocker: w2, attacker: mp }])).toBeNull();
    expect(blockRequirementProblem(s, opp, [{ blocker: w1, attacker: mp }, { blocker: w2, attacker: mp }, { blocker: b, attacker: mp }])).toBeNull();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: mp }] })).toThrow();
    const bot = botActions(s, opp).find((a) => a.type === "declareBlockers");
    expect(bot).toBeDefined();
    const blocks = bot!.type === "declareBlockers" ? bot!.blocks : [];
    expect(blocks.filter((x) => x.attacker === mp).map((x) => x.blocker).sort()).toEqual(expect.arrayContaining([w1, w2].sort()));
    // The Walls' damage to it is prevented.
    s = block(s, opp, blocks);
    s = passUntil(s, "endCombat", ap);
    expect(s.objects[mp]!.damage).toBe(0);
  });

  it("a tapped Wall isn't able to block, so it needn't", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const mp = putOnBattlefield(s, ap, marblePriest);
    const w1 = putOnBattlefield(s, opp, wall());
    s = toBlocks(s, ap, [{ attacker: mp, defender: opp }]);
    s.objects[w1]!.tapped = true;
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
  });
});

describe("Can't attack or block unless or if (CR 508.1c, 509.1b)", () => {
  it("are fully supported", () => supported(brandedBrawlers, veteranBrawlers, goblinGoon, moggToady, monstrousHound, glacialCrasher, wirecat, scarredPuma));

  it("Branded Brawlers can't attack a player with an untapped land, and can't block while you control one", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const bb = putOnBattlefield(s, ap, brandedBrawlers);
    s = passUntil(s, "declareAttackers", ap);
    expect(attackProblem(s, s.objects[bb]!, opp)).toBeNull(); // opp has no lands
    const l = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    expect(attackProblem(s, s.objects[bb]!, opp)).not.toBeNull();
    s.objects[l]!.tapped = true;
    expect(attackProblem(s, s.objects[bb]!, opp)).toBeNull();
    // ap controls untapped lands: it can't block.
    const vb = putOnBattlefield(s, opp, veteranBrawlers);
    expect(cantBlockNow(s, s.objects[bb]!)).toBe(true);
    expect(cantBlockNow(s, s.objects[vb]!)).toBe(false); // its controller's only land is tapped
  });

  it("Goblin Goon and Mogg Toady compare creatures, Monstrous Hound lands, with the defending or attacking player", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const goon = putOnBattlefield(s, ap, goblinGoon);
    const toady = putOnBattlefield(s, ap, moggToady);
    const hound = putOnBattlefield(s, ap, monstrousHound);
    s = passUntil(s, "declareAttackers", ap);
    // ap: 3 creatures, 14 lands; opp: none.
    for (const id of [goon, toady, hound]) expect(attackProblem(s, s.objects[id]!, opp)).toBeNull();
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, greenBear());
    for (let i = 0; i < 14; i++) putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    for (const id of [goon, toady, hound]) expect(attackProblem(s, s.objects[id]!, opp)).not.toBeNull();
    // The other opponent has nothing.
    expect(attackProblem(s, s.objects[goon]!, next(s, opp))).toBeNull();
    // Blocking: opp's Goon and Hound against ap, who has more.
    const oGoon = putOnBattlefield(s, opp, goblinGoon);
    const oHound = putOnBattlefield(s, opp, monstrousHound);
    expect(cantBlockNow(s, s.objects[oGoon]!)).toBe(false); // 5 creatures to ap's 3
    expect(cantBlockNow(s, s.objects[oHound]!)).toBe(true); // 14 lands to 14
  });

  it("Glacial Crasher needs a Mountain anywhere; Wirecat can't attack or block while there's an enchantment", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const wc = putOnBattlefield(s, ap, wirecat);
    const gc = putOnBattlefield(s, ap, glacialCrasher);
    s = passUntil(s, "declareAttackers", ap);
    const can = (id: string) => potentialAttackers(s, ap).some((o) => o.id === id);
    // ap's own Mountains count.
    expect([can(wc), can(gc), cantBlockNow(s, s.objects[wc]!)]).toEqual([true, true, false]);
    putOnBattlefield(s, opp, card("Ench", "Enchantment", "{G}"));
    expect([can(wc), cantBlockNow(s, s.objects[wc]!)]).toEqual([false, true]);
    for (const id of [...s.battlefield]) if (s.cards[s.objects[id]!.cardId]!.name === "Mountain") s.objects[id]!.zone = "exile", s.battlefield.splice(s.battlefield.indexOf(id), 1);
    invalidateCharacteristics(s);
    expect(can(gc)).toBe(false);
    // Anyone's Mountain.
    putOnBattlefield(s, next(s, opp), card("Mountain", "Basic Land — Mountain"));
    expect(can(gc)).toBe(true);
  });

  it("Scarred Puma attacks only beside another black or green attacker", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const puma = putOnBattlefield(s, ap, scarredPuma);
    const red = putOnBattlefield(s, ap, redBear());
    const green = putOnBattlefield(s, ap, greenBear());
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: puma, defender: opp }] })).toThrow(/also attacks/);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: puma, defender: opp }, { attacker: red, defender: opp }] })).toThrow(/also attacks/);
    const t = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: puma, defender: opp }, { attacker: green, defender: next(s, opp) }] });
    expect(t.objects[puma]!.attacking).toBe(opp);
    // A bot never sends it alone.
    s.objects[green]!.tapped = true;
    const bot = botActions(s, ap).find((a) => a.type === "declareAttackers");
    expect(bot && bot.type === "declareAttackers" && bot.attacks.some((a) => a.attacker === puma)).toBe(false);
  });
});

describe("As long as no opponent controls ..., creatures named ~, threshold (CR 604.2, 613)", () => {
  it("are fully supported", () => supported(kavuRunner, skittishKavu, vexingBeetle, ivoryGuardians, possessedAven, possessedBarbarian, possessedCentaur, possessedNomad));

  it("Kavu Runner and Skittish Kavu stop while any opponent controls a white or blue creature; Vexing Beetle while any creature", () => {
    const { s, ap } = setup([]);
    const opp = next(s, ap);
    const kr = putOnBattlefield(s, ap, kavuRunner, { sick: true });
    const sk = putOnBattlefield(s, ap, skittishKavu);
    const vb = putOnBattlefield(s, ap, vexingBeetle);
    expect([objHasKeyword(s, s.objects[kr]!, "Haste"), pt(s, sk), pt(s, vb)]).toEqual([true, "2/2", "6/6"]);
    // Their own white creature doesn't count.
    putOnBattlefield(s, ap, whiteBear());
    expect([objHasKeyword(s, s.objects[kr]!, "Haste"), pt(s, sk), pt(s, vb)]).toEqual([true, "2/2", "6/6"]);
    putOnBattlefield(s, opp, redBear());
    expect([objHasKeyword(s, s.objects[kr]!, "Haste"), pt(s, sk), pt(s, vb)]).toEqual([true, "2/2", "3/3"]);
    putOnBattlefield(s, next(s, opp), blueBear());
    expect([objHasKeyword(s, s.objects[kr]!, "Haste"), pt(s, sk)]).toEqual([false, "1/1"]);
  });

  it("Ivory Guardians pumps every creature named Ivory Guardians, each ability once (rulings)", () => {
    const { s, ap } = setup([]);
    const opp = next(s, ap);
    const mine1 = putOnBattlefield(s, ap, ivoryGuardians);
    const mine2 = putOnBattlefield(s, ap, ivoryGuardians);
    const theirs = putOnBattlefield(s, opp, ivoryGuardians);
    expect([pt(s, mine1), pt(s, mine2), pt(s, theirs)]).toEqual(["3/3", "3/3", "3/3"]);
    // A red token doesn't count.
    const tok = putOnBattlefield(s, opp, redBear());
    s.objects[tok]!.isToken = true;
    invalidateCharacteristics(s);
    expect(pt(s, mine1)).toBe("3/3");
    // ap's two Guardians see opp's red permanent: each of their abilities pumps all three Guardians, once.
    putOnBattlefield(s, opp, redBear());
    expect([pt(s, mine1), pt(s, mine2), pt(s, theirs)]).toEqual(["5/5", "5/5", "5/5"]);
    // opp's sees another opponent's two: once more.
    putOnBattlefield(s, next(s, opp), redBear());
    putOnBattlefield(s, next(s, opp), redBear());
    expect([pt(s, mine1), pt(s, mine2), pt(s, theirs)]).toEqual(["6/6", "6/6", "6/6"]);
  });

  it("Possessed Nomad with threshold gets +1/+1, is black, and gains its ability", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const pn = putOnBattlefield(s, ap, possessedNomad);
    const w = putOnBattlefield(s, opp, whiteBear());
    const g = putOnBattlefield(s, opp, greenBear());
    expect(planActivate(s, ap, pn, 0, [tgt(w)])).toBeNull();
    expect(characteristics(s, s.objects[pn]!).colors).toEqual(["W"]);
    for (let i = 0; i < 7; i++) {
      const id = s.players[ap]!.library.shift()!;
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
    }
    invalidateCharacteristics(s);
    expect(pt(s, pn)).toBe("4/4");
    expect(characteristics(s, s.objects[pn]!).colors).toEqual(["B"]);
    expect(planActivate(s, ap, pn, 0, [tgt(g)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, pn, 0, [tgt(w)])));
    expect(zone(s, w)).toBe("graveyard");
  });
});

describe("Blocked, unblocked, nonattacking nonblocking creatures; creatures blocking or blocked by ~ (CR 509.1h, 506.4)", () => {
  it("are fully supported", () => supported(smite, benalishMissionary, gossamerChains, snag, inkfathomWitch, tattermungeWitch, unlikelyAlliance, warpath, greaterWerewolf, kjeldoranFrostbeast));

  /** ap's bear `a1` blocked by opp's wall, `a2` unblocked; ap also has a creature that stays home. */
  const combat = (hand: CardDef[]) => {
    let { s, ap, ids } = setup(hand);
    const opp = next(s, ap);
    const a1 = putOnBattlefield(s, ap, greenBear());
    const a2 = putOnBattlefield(s, ap, greenBear());
    const home = putOnBattlefield(s, ap, greenBear());
    const w = putOnBattlefield(s, opp, wall());
    s = toBlocks(s, ap, [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }]);
    return { s, ap, ids, opp, a1, a2, home, w };
  };

  it("before blocks, no attacker is blocked or unblocked; then Smite destroys only the blocked one", () => {
    let { s, ap, opp, a1, a2, w } = combat([]);
    const sm = putOnBattlefield(s, opp, smite);
    s.objects[sm]!.zone = "hand";
    s.battlefield.splice(s.battlefield.indexOf(sm), 1);
    s.players[opp]!.hand.push(sm);
    for (let i = 0; i < 5; i++) putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    s = block(s, opp, [{ blocker: w, attacker: a1 }]);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, opp, sm, [tgt(a2)])).toBeNull();
    s = resolveAll(run(s, planCast(s, opp, sm, [tgt(a1)])));
    expect(zone(s, a1)).toBe("graveyard");
    void ap;
  });

  it("Inkfathom Witch makes only unblocked creatures 4/1, and only once blockers are declared (rulings)", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const a1 = putOnBattlefield(s, ap, greenBear());
    const a2 = putOnBattlefield(s, ap, greenBear());
    const home = putOnBattlefield(s, ap, greenBear());
    const w = putOnBattlefield(s, opp, wall());
    const iw = putOnBattlefield(s, ap, inkfathomWitch);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    // In the declare attackers step nothing is unblocked yet.
    expect(s.step).toBe("declareAttackers");
    const early = resolveAll(run(s, planActivate(s, ap, iw, 0)));
    expect([pt(early, a1), pt(early, a2)]).toEqual(["2/2", "2/2"]);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = block(s, opp, [{ blocker: w, attacker: a1 }]);
    s = resolveAll(run(s, planActivate(s, ap, iw, 0)));
    expect([pt(s, a1), pt(s, a2), pt(s, home)]).toEqual(["2/2", "4/1", "2/2"]);
  });

  it("Tattermunge Witch pumps blocked creatures; Unlikely Alliance targets only creatures out of combat", () => {
    let { s, ap, opp, a1, a2, home, w } = combat([]);
    const tw = putOnBattlefield(s, ap, tattermungeWitch);
    const ua = putOnBattlefield(s, ap, unlikelyAlliance);
    s = block(s, opp, [{ blocker: w, attacker: a1 }]);
    s = resolveAll(run(s, planActivate(s, ap, tw, 0)));
    expect([pt(s, a1), pt(s, a2)]).toEqual(["3/2", "2/2"]);
    expect(objHasKeyword(s, s.objects[a1]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[a2]!, "Trample")).toBe(false);
    for (const t of [a1, a2, w]) expect(planActivate(s, ap, ua, 0, [tgt(t)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, ua, 0, [tgt(home)])));
    expect(pt(s, home)).toBe("2/4");
  });

  it("Benalish Missionary stops a blocked creature's combat damage; Gossamer Chains an unblocked one's, returning itself", () => {
    let { s, ap, opp, a1, a2, w } = combat([]);
    const bm = putOnBattlefield(s, opp, benalishMissionary);
    const gc = putOnBattlefield(s, opp, gossamerChains);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    s = block(s, opp, [{ blocker: w, attacker: a1 }]);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, opp, bm, 0, [tgt(a2)])).toBeNull();
    expect(planActivate(s, opp, gc, 0, [tgt(a1)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, opp, bm, 0, [tgt(a1)])));
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(run(s, planActivate(s, opp, gc, 0, [tgt(a2)])));
    expect(zone(s, gc)).toBe("hand");
    const life = s.players[opp]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[w]!.damage).toBe(0);
  });

  it("Snag prevents the combat damage of unblocked creatures, cast by discarding a Forest", () => {
    let { s, ap, opp, a1, a2, w } = combat([]);
    const sn = putOnBattlefield(s, opp, snag);
    const fo = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    for (const id of [sn, fo]) {
      s.objects[id]!.zone = "hand";
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.players[opp]!.hand.push(id);
    }
    s = block(s, opp, [{ blocker: w, attacker: a1 }]);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // No lands: only the alternative cost.
    s = resolveAll(run(s, planCast(s, opp, sn, [], undefined, "auto", undefined, { alt: "alternative", discard: [fo] })));
    expect(zone(s, fo)).toBe("graveyard");
    const life = s.players[opp]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life);
    // The blocked one still deals its damage.
    expect(s.objects[w]!.damage).toBe(2);
    void a2;
  });

  it("Warpath hits each blocking and each blocked creature", () => {
    let { s, ap, opp, a1, a2, home, w } = combat([warpath]);
    const ids = s.players[ap]!.hand.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Warpath");
    s = block(s, opp, [{ blocker: w, attacker: a1 }]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([s.objects[w]!.damage, zone(s, a1), s.objects[a2]!.damage, s.objects[home]!.damage]).toEqual([3, "graveyard", 0, 0]);
  });

  it("at end of combat, Greater Werewolf puts -0/-2 counters and Kjeldoran Frostbeast destroys, on each creature in combat with it", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const gw = putOnBattlefield(s, ap, greaterWerewolf);
    const kf = putOnBattlefield(s, ap, kjeldoranFrostbeast);
    const w1 = putOnBattlefield(s, opp, wall());
    const w2 = putOnBattlefield(s, opp, wall());
    const other = putOnBattlefield(s, opp, wall());
    s = toBlocks(s, ap, [{ attacker: gw, defender: opp }, { attacker: kf, defender: opp }]);
    s = block(s, opp, [{ blocker: w1, attacker: gw }, { blocker: w2, attacker: kf }]);
    s = passUntil(s, "endCombat", ap);
    s = resolveAll(s);
    expect(s.objects[w1]!.counters["-0/-2"]).toBe(1);
    expect(zone(s, w2)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
    expect(s.objects[other]!.counters["-0/-2"] ?? 0).toBe(0);
  });
});

/** A fresh copy of `def` in `pid`'s hand, or graveyard. */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, ids: string[]) => ids.map((id) => s.cards[s.objects[id]!.cardId]!.name).sort();

describe("Reveal and discard all ..., exile all ... from a graveyard, damage for each white card in hand", () => {
  it("are fully supported", () => supported(amnesia, shatterAssumptions, trapfindersTrick, inquisition, mudhole, tombfire));

  it("Amnesia discards every nonland card; Trapfinder's Trick only Traps; Shatter Assumptions colorless nonland or multicolored", () => {
    let { s, ap, ids } = setup([amnesia, trapfindersTrick, shatterAssumptions, shatterAssumptions]);
    const opp = next(s, ap);
    for (let i = 0; i < 6; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp")), putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    s.players[opp]!.hand = [];
    const fill = (who: PlayerId) => {
      into(s, who, card("Forest", "Basic Land — Forest"));
      into(s, who, greenBear());
      into(s, who, card("Pit Trap", "Instant — Trap", "{2}"));
      into(s, who, card("Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
      into(s, who, card("Gold", "Instant", "{W}{U}"));
    };
    fill(opp);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(named(s, s.players[opp]!.hand)).toEqual(["Forest", "Gold", "Golem", "Green Bear"]);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }], [0])));
    expect(named(s, s.players[opp]!.hand)).toEqual(["Forest", "Gold", "Green Bear"]);
    s = resolveAll(run(s, planCast(s, ap, ids[3]!, [{ kind: "player", id: opp }], [1])));
    expect(named(s, s.players[opp]!.hand)).toEqual(["Forest", "Green Bear"]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(named(s, s.players[opp]!.hand)).toEqual(["Forest"]);
  });

  it("Inquisition deals damage equal to the white cards in the target player's hand", () => {
    let { s, ap, ids } = setup([inquisition]);
    const opp = next(s, ap);
    s.players[opp]!.hand = [];
    into(s, opp, whiteBear());
    into(s, opp, card("Azorius Thing", "Instant", "{W}{U}"));
    into(s, opp, greenBear());
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Mudhole exiles the land cards, Tombfire the cards with flashback, from the target player's graveyard", () => {
    let { s, ap, ids } = setup([mudhole, tombfire]);
    const opp = next(s, ap);
    const land = into(s, opp, card("Forest", "Basic Land — Forest"), "graveyard");
    const fb = into(s, opp, card("Think Twice", "Instant", "{1}{U}", { keywords: ["Flashback"], oracleText: "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" }), "graveyard");
    const plain = into(s, opp, greenBear(), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect([zone(s, land), zone(s, fb), zone(s, plain)]).toEqual(["exile", "graveyard", "graveyard"]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect([zone(s, fb), zone(s, plain)]).toEqual(["exile", "graveyard"]);
  });
});

describe("Put two target lands or all enchantments on top of their owners' libraries (CR 401.4)", () => {
  it("are fully supported", () => supported(plowUnder, rebukingCeremony, harmonicConvergence));

  it("Plow Under: the owner of both lands orders them on top of their library", () => {
    let { s, ap, ids } = setup([plowUnder]);
    const opp = next(s, ap);
    const l1 = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    const l2 = putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(l1), tgt(l2)]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: opp });
    s = act(s, { type: "orderLibrary", player: opp, order: [l2, l1] });
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([l2, l1]);
    expect(s.pending).toBeNull();
  });

  it("Rebuking Ceremony: artifacts of two owners go on top of each owner's library with no question", () => {
    let { s, ap, ids } = setup([rebukingCeremony]);
    const opp = next(s, ap);
    const a1 = putOnBattlefield(s, opp, card("Rock", "Artifact", "{1}"));
    const a2 = putOnBattlefield(s, next(s, opp), card("Rock", "Artifact", "{1}"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a1), tgt(a2)])));
    expect(s.pending).toBeNull();
    expect([s.players[opp]!.library[0], s.players[next(s, opp)]!.library[0]]).toEqual([a1, a2]);
  });

  it("Harmonic Convergence: each player orders their own enchantments; a bot answers its own", () => {
    let { s, ap, ids } = setup([harmonicConvergence]);
    const opp = next(s, ap);
    const e1 = putOnBattlefield(s, opp, card("Ench A", "Enchantment", "{G}"));
    const e2 = putOnBattlefield(s, opp, card("Ench B", "Enchantment", "{G}"));
    const mine = putOnBattlefield(s, ap, card("Ench C", "Enchantment", "{G}"));
    const tok = putOnBattlefield(s, opp, card("Ench Token", "Enchantment", ""));
    s.objects[tok]!.isToken = true;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: opp });
    s = act(s, botActions(s, opp)[0]!);
    expect(new Set(s.players[opp]!.library.slice(0, 2))).toEqual(new Set([e1, e2]));
    expect(s.players[ap]!.library[0]).toBe(mine);
    expect(s.objects[tok]?.zone).not.toBe("battlefield");
    expect(s.pending).toBeNull();
  });
});

describe("Destroy target creature, then a check of it as it last existed (CR 608.2h); white and/or blue creatures", () => {
  it("are fully supported", () => supported(gloomlance, deathsCaress, prophesiedEnd, evaporate, emberGale));

  it("Gloomlance makes the controller of a green or white creature discard", () => {
    let { s, ap, ids } = setup([gloomlance, gloomlance]);
    const opp = next(s, ap);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    const g = putOnBattlefield(s, opp, greenBear());
    const r = putOnBattlefield(s, opp, redBear());
    const hand = s.players[opp]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(r)])));
    expect([zone(s, r), s.players[opp]!.hand.length]).toEqual(["graveyard", hand]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(g)])));
    if (s.pending) s = act(s, botActions(s, opp)[0]!);
    expect([zone(s, g), s.players[opp]!.hand.length]).toEqual(["graveyard", hand - 1]);
  });

  it("Death's Caress gains the Human's toughness as it last existed, even if it survives (rulings)", () => {
    let { s, ap, ids } = setup([deathsCaress, deathsCaress]);
    const opp = next(s, ap);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    const h = putOnBattlefield(s, opp, creature("Knight", "Creature — Human Knight", "{1}{W}", 2, 3));
    s.objects[h]!.counters["+1/+1"] = 2;
    const ind = putOnBattlefield(s, opp, creature("Stone Human", "Creature — Human", "{1}{W}", 1, 4, { keywords: ["Indestructible"], oracleText: "Indestructible" }));
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(h)])));
    expect([zone(s, h), s.players[ap]!.life]).toEqual(["graveyard", life + 5]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(ind)])));
    expect([zone(s, ind), s.players[ap]!.life]).toEqual(["battlefield", life + 9]);
  });

  it("Prophesied End: the controller of a creature that wasn't attacking draws", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const a = putOnBattlefield(s, ap, greenBear());
    const home = putOnBattlefield(s, ap, greenBear());
    const pe1 = into(s, opp, prophesiedEnd);
    const pe2 = into(s, opp, prophesiedEnd);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    s = block(s, opp, []);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, opp, pe1, [tgt(a)])));
    expect([zone(s, a), s.players[ap]!.hand.length]).toEqual(["graveyard", hand]);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(run(s, planCast(s, opp, pe2, [tgt(home)])));
    expect([zone(s, home), s.players[ap]!.hand.length]).toEqual(["graveyard", hand + 1]);
  });

  it("Evaporate hits white and/or blue creatures; Ember Gale only the target player's, and they can't block", () => {
    let { s, ap, ids } = setup([evaporate, emberGale]);
    const opp = next(s, ap);
    const w = putOnBattlefield(s, opp, creature("W", "Creature — Bear", "{W}", 1, 3));
    const u = putOnBattlefield(s, next(s, opp), creature("U", "Creature — Bear", "{U}", 1, 3));
    const wu = putOnBattlefield(s, opp, creature("WU", "Creature — Bear", "{W}{U}", 1, 3));
    const g = putOnBattlefield(s, opp, creature("G", "Creature — Bear", "{G}", 1, 3));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([w, u, wu, g].map((id) => s.objects[id]!.damage)).toEqual([1, 1, 1, 0]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect([w, u, wu, g].map((id) => s.objects[id]!.damage)).toEqual([2, 1, 2, 0]);
    expect([w, g, u].map((id) => cantBlockNow(s, s.objects[id]!))).toEqual([true, true, false]);
  });
});

describe("Volvers: kicked with one kicker or the other, it enters with counters and with an ability (CR 702.33)", () => {
  it("are fully supported", () => supported(anavolver, cetavolver, degavolver, necravolver, rakavolver));

  const castKicked = (def: CardDef, kicks: number[]) => {
    let { s, ap, ids } = setup([def]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks })));
    return { s, ap, id: ids[0]! };
  };

  it("Anavolver: two counters and flying, a counter and a regeneration ability, or both", () => {
    let { s, id } = castKicked(anavolver, []);
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "Flying"), compileCard(anavolver).activated.length]).toEqual(["3/3", false, 0]);
    ({ s, id } = castKicked(anavolver, [0]));
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "Flying"), characteristics(s, s.objects[id]!).grantedAbilities.length]).toEqual(["5/5", true, 0]);
    let ap: PlayerId;
    ({ s, id, ap } = castKicked(anavolver, [1]));
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "Flying")]).toEqual(["4/4", false]);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planActivate(s, ap, id, 0)));
    expect([s.players[ap]!.life, s.objects[id]!.regenShields]).toEqual([life - 3, 1]);
    ({ s, id } = castKicked(anavolver, [0, 1]));
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "Flying")]).toEqual(["6/6", true]);
  });

  it("Cetavolver, Rakavolver and Necravolver get their keywords and abilities; a copy isn't kicked", () => {
    let { s, id } = castKicked(cetavolver, [0, 1]);
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "First strike"), objHasKeyword(s, s.objects[id]!, "Trample")]).toEqual(["4/4", true, true]);
    ({ s, id } = castKicked(rakavolver, [1]));
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "Flying")]).toEqual(["3/3", true]);
    let ap: PlayerId;
    ({ s, id, ap } = castKicked(rakavolver, [0]));
    expect(pt(s, id)).toBe("4/4");
    const life = s.players[ap]!.life;
    expect(characteristics(s, s.objects[id]!).grantedAbilities).toEqual(["Whenever ~ deals damage, you gain that much life."]);
    // It attacks unblocked (as if it had haste) and deals 4 combat damage.
    s.objects[id]!.controlledSinceTurn = -1;
    s = toBlocks(s, ap, [{ attacker: id, defender: next(s, ap) }]);
    s = block(s, next(s, ap), []);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[ap]!.life).toBe(life + 4);
    ({ s, id } = castKicked(necravolver, [0]));
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "Trample")]).toEqual(["4/4", true]);
    ({ s, id } = castKicked(degavolver, [1]));
    expect([pt(s, id), objHasKeyword(s, s.objects[id]!, "First strike")]).toEqual(["2/2", true]);
    // Put onto the battlefield without being cast: not kicked.
    const { s: s2, ap: ap2 } = setup([]);
    const put = putOnBattlefield(s2, ap2, necravolver);
    expect([pt(s2, put), objHasKeyword(s2, s2.objects[put]!, "Trample")]).toEqual(["2/2", false]);
  });
});

describe("Sacrifice it unless you sacrifice two Swamps; defending player may draw; ~ deals damage to any target and to itself", () => {
  it("are fully supported", () => supported(moldDemon, rathiDragon, harborGuardian, sibilantSpirit, psionicEntity, psionicSliver, recklessEmbermage, wormwoodDryad, wormwoodTreefolk, zombieMob));

  it("Mold Demon stays if you sacrifice two Swamps, and is sacrificed if you don't", () => {
    let { s, ap, ids } = setup([moldDemon, moldDemon]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, prompt: "Sacrifice two Swamps to keep Mold Demon" });
    const swamps = () => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Swamp" && s.objects[id]!.controller === ap).length;
    const before = swamps();
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending) s = act(s, botActions(s, ap)[0]!);
    s = resolveAll(s);
    expect([zone(s, ids[0]!), swamps()]).toEqual(["battlefield", before - 2]);
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect([zone(s, ids[1]!), swamps()]).toEqual(["graveyard", before - 2]);
  });

  it("Rathi Dragon with fewer than two Mountains is sacrificed", () => {
    let { s, ap, ids } = setup([rathiDragon]);
    for (const id of [...s.battlefield]) if (s.cards[s.objects[id]!.cardId]!.name === "Mountain") s.objects[id]!.tapped = false;
    s = run(s, planCast(s, ap, ids[0]!));
    // Three Mountains, tapped or not, can still be sacrificed.
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", prompt: "Sacrifice two Mountains to keep Rathi Dragon" });
    // A bot keeps it.
    s = act(s, botActions(s, ap)[0]!);
    if (s.pending) s = act(s, botActions(s, ap)[0]!);
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain").length).toBe(1);
  });

  it("Harbor Guardian attacks: the defending player may draw a card", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const hg = putOnBattlefield(s, ap, harborGuardian);
    const sp = putOnBattlefield(s, ap, sibilantSpirit);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hg, defender: opp }, { attacker: sp, defender: next(s, opp) }] });
    const hands = [s.players[opp]!.hand.length, s.players[next(s, opp)]!.hand.length, s.players[ap]!.hand.length];
    const asked: PlayerId[] = [];
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
      if (s.pending?.kind === "chooseMay") {
        asked.push(s.pending.player);
        s = act(s, { type: "chooseMay", player: s.pending.player, yes: s.pending.player === opp });
      } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked.sort()).toEqual([opp, next(s, opp)].sort());
    expect([s.players[opp]!.hand.length, s.players[next(s, opp)]!.hand.length, s.players[ap]!.hand.length]).toEqual([hands[0]! + 1, hands[1], hands[2]]);
  });

  it("Psionic Entity, a Sliver with Psionic Sliver's ability, and Reckless Embermage deal damage to a target and to themselves", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const pe = putOnBattlefield(s, ap, psionicEntity);
    const ps = putOnBattlefield(s, ap, psionicSliver);
    const sliver = putOnBattlefield(s, opp, creature("Muscle Sliver", "Creature — Sliver", "{1}{G}", 4, 4));
    const re = putOnBattlefield(s, ap, recklessEmbermage);
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planActivate(s, ap, pe, 0, [{ kind: "player", id: opp }])));
    expect([s.players[opp]!.life, zone(s, pe)]).toEqual([life - 2, "graveyard"]);
    // Every Sliver has it, the opponent's too.
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(run(s, planActivate(s, opp, sliver, 0, [{ kind: "player", id: ap }])));
    expect(s.objects[sliver]!.damage).toBe(3);
    s = resolveAll(run(s, planActivate(s, ap, re, 0, [tgt(ps)])));
    expect([s.objects[ps]!.damage, s.objects[re]!.damage]).toEqual([1, 1]);
  });

  it("Wormwood Dryad gains forestwalk and deals 1 damage to you; Wormwood Treefolk swampwalk and 2", () => {
    let { s, ap } = setup([]);
    const wd = putOnBattlefield(s, ap, wormwoodDryad);
    const wt = putOnBattlefield(s, ap, wormwoodTreefolk);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planActivate(s, ap, wd, 0)));
    s = resolveAll(run(s, planActivate(s, ap, wt, 1)));
    expect([objHasKeyword(s, s.objects[wd]!, "Forestwalk"), objHasKeyword(s, s.objects[wt]!, "Swampwalk"), s.players[ap]!.life]).toEqual([true, true, life - 3]);
    expect([s.objects[wd]!.damage, s.objects[wt]!.damage]).toEqual([0, 0]);
  });

  it("Zombie Mob enters with a counter per creature card in your graveyard, then exiles them", () => {
    let { s, ap, ids } = setup([zombieMob]);
    const c1 = into(s, ap, greenBear(), "graveyard");
    const c2 = into(s, ap, greenBear(), "graveyard");
    const l = into(s, ap, card("Forest", "Basic Land — Forest"), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([pt(s, ids[0]!), zone(s, c1), zone(s, c2), zone(s, l)]).toEqual(["4/2", "exile", "exile", "graveyard"]);
  });
});
