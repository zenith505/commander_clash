// Round 172: the most played cards still unsupported, in popularity order, after round 171 (ranks 5,400 to 8,300).

import { describe, expect, it } from "vitest";
import { act, plainsCard, addEffect, bear, card, forest, island, passAll, passUntil, pt, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { gainLife, destroyPermanent, castProblem, draw, compileCard, attackProblem, moveObject, loseLife, spellCost, potentialAttackers, abilityProblem, blockProblem, botActions, controllerOf, parseManaCost, planMana, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { putCounters } from "../src/counters";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Like `resolveAll`, and other players' questions are answered by the bot. */
const settle = (s: GameState, me: PlayerId, yes = true) => {
  for (let i = 0; i < 40; i++) {
    s = resolveAll(s, yes);
    if (!s.pending || s.pending.player === me) return s;
    s = run(s, botActions(s, s.pending.player));
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const pending = <T = Record<string, unknown>>(s: GameState) => s.pending as unknown as T;
const named = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** Players pass until `pid` has priority, in this step. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
void [bear, card, pt, characteristics, kw, settle, zone, next, attack, tgt, pending, named, abilityProblem, passAll];


const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && named(s, id) === name);
void [handOf, lifeOf, mine, swamp, forest, loseLife, moveObject, spellCost, blockProblem, potentialAttackers];

const josu = card("Josu Vess, Lich Knight", "Legendary Creature — Zombie Knight", "{2}{B}{B}", {cmc: 4,power: "4",toughness: "5",keywords: ["Menace","Kicker"],oracleText: "Kicker {5}{B} (You may pay an additional {5}{B} as you cast this spell.)\nMenace\nWhen Josu Vess enters, if he was kicked, create eight 2/2 black Zombie Knight creature tokens with menace."});
const kefnet = card("Kefnet the Mindful", "Legendary Creature — God", "{2}{U}", {cmc: 3,power: "5",toughness: "5",keywords: ["Flying","Indestructible"],oracleText: "Flying, indestructible\nKefnet can't attack or block unless you have seven or more cards in hand.\n{3}{U}: Draw a card, then you may return a land you control to its owner's hand."});
const rienne = card("Rienne, Angel of Rebirth", "Legendary Creature — Angel", "{2}{R}{G}{W}", {cmc: 5,power: "5",toughness: "4",keywords: ["Flying"],oracleText: "Flying\nOther multicolored creatures you control get +1/+0.\nWhenever another multicolored creature you control dies, return it to its owner's hand at the beginning of the next end step."});
const muYanling = card("Mu Yanling, Wind Rider", "Legendary Creature — Human Wizard Pilot", "{2}{U}{U}", {cmc: 4,power: "2",toughness: "4",oracleText: "When Mu Yanling enters, create a 3/2 colorless Vehicle artifact token with crew 1.\nVehicles you control have flying.\nWhenever one or more creatures you control with flying deal combat damage to a player, draw a card."});

// Real oracle text (Scryfall).
const remedy = card("Tainted Remedy", "Enchantment", "{2}{B}", {cmc: 3,oracleText: "If an opponent would gain life, that player loses that much life instead."});
const drone = card("Plague Drone", "Creature — Demon", "{3}{B}", {cmc: 4,power: "3",toughness: "3",keywords: ["Flying","Rot Fly"],oracleText: "Flying\nRot Fly — If an opponent would gain life, that player loses that much life instead."});
const balan = card("Balan, Wandering Knight", "Legendary Creature — Cat Knight", "{2}{W}{W}", {cmc: 4,power: "3",toughness: "3",keywords: ["First strike"],oracleText: "First strike\nBalan has double strike as long as two or more Equipment are attached to it.\n{1}{W}: Attach all Equipment you control to Balan."});
const snare = card("Soul Snare", "Enchantment", "{W}", {cmc: 1,oracleText: "{W}, Sacrifice this enchantment: Exile target creature that's attacking you or a planeswalker you control."});
const roar = card("Roar of Challenge", "Sorcery", "{2}{G}", {cmc: 3,keywords: ["Ferocious"],oracleText: "All creatures able to block target creature this turn do so.\nFerocious — That creature gains indestructible until end of turn if you control a creature with power 4 or greater."});
const marcus = card("Marcus, Mutant Mayor", "Legendary Creature — Mutant Advisor", "{3}{G}{U}", {cmc: 5,power: "4",toughness: "4",keywords: ["Vigilance","Trample"],oracleText: "Vigilance, trample\nWhenever a creature you control deals combat damage to a player, draw a card if that creature has a +1/+1 counter on it. If it doesn't, put a +1/+1 counter on it."});
const barrens = card("Crawling Barrens", "Land", "", {cmc: 0,oracleText: "{T}: Add {C}.\n{4}: Put two +1/+1 counters on this land. Then you may have it become a 0/0 Elemental creature until end of turn. It's still a land."});
const mountainL = card("The Lonely Mountain", "Land — Mountain", "", {cmc: 0,oracleText: "({T}: Add {R}.)\nThis land enters tapped unless you control an Equipment.\n{4}{R}, {T}: Create a 2/2 red Dwarf creature token. This ability costs {1} less to activate for each Equipment you control. Activate only as a sorcery."});
const might = card("Animist's Might", "Sorcery", "{2}{G}", {cmc: 3,oracleText: "This spell costs {2} less to cast if it targets a legendary creature you control.\nTarget creature you control deals damage equal to twice its power to target creature or planeswalker you don't control."});
const polliwallop = card("Polliwallop", "Instant", "{3}{G}", {cmc: 4,keywords: ["Affinity"],oracleText: "Affinity for Frogs (This spell costs {1} less to cast for each Frog you control.)\nTarget creature you control deals damage equal to twice its power to target creature you don't control."});
const pointed = card("Pointed Discussion", "Sorcery", "{2}{B}", {cmc: 3,oracleText: "You draw two cards, lose 2 life, then create a Blood token. (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")"});
const acidic = card("Acidic Soil", "Sorcery", "{2}{R}", {cmc: 3,oracleText: "Acidic Soil deals damage to each player equal to the number of lands they control."});
const duneblast = card("Duneblast", "Sorcery", "{4}{W}{B}{G}", {cmc: 7,oracleText: "Choose up to one creature. Destroy the rest."});
const reshaper = card("Matter Reshaper", "Creature — Eldrazi", "{2}{C}", {cmc: 3,power: "3",toughness: "2",oracleText: "({C} represents colorless mana.)\nWhen this creature dies, reveal the top card of your library. You may put that card onto the battlefield if it's a permanent card with mana value 3 or less. Otherwise, put that card into your hand."});
const energyTap = card("Energy Tap", "Sorcery", "{U}", {cmc: 1,oracleText: "Tap target untapped creature you control. If you do, add an amount of {C} equal to that creature's mana value."});
const hexavus = card("Hexavus", "Artifact Creature — Construct", "{6}", {cmc: 6,power: "0",toughness: "0",keywords: ["Flying"],oracleText: "Flying\nThis creature enters with six +1/+1 counters on it.\n{1}, Remove a +1/+1 counter from this creature: Put a flying counter on another target creature.\n{1}, Remove a counter from another creature you control: Put a +1/+1 counter on this creature."});
const valkyrie = card("Eradicator Valkyrie", "Creature — Angel Berserker", "{2}{B}{B}", {cmc: 4,power: "4",toughness: "3",keywords: ["Flying","Lifelink","Hexproof from","Hexproof","Boast"],oracleText: "Flying, lifelink, hexproof from planeswalkers\nBoast — {1}{B}, Sacrifice a creature: Each opponent sacrifices a creature or planeswalker. (Activate only if this creature attacked this turn and only once each turn.)"});
const mowu = card("Mowu, Loyal Companion", "Legendary Creature — Dog", "{3}{G}", {cmc: 4,power: "3",toughness: "3",keywords: ["Vigilance","Trample"],oracleText: "Vigilance, trample\nIf one or more +1/+1 counters would be put on Mowu, that many plus one +1/+1 counters are put on it instead."});
const autumn = card("Colonel Autumn", "Legendary Creature — Human Soldier", "{1}{W}{B}", {cmc: 3,power: "2",toughness: "3",keywords: ["Lifelink","Exploit"],oracleText: "Lifelink\nExploit (When this creature enters, you may sacrifice a creature.)\nOther legendary creatures you control have exploit.\nWhenever a creature you control exploits a creature, put a +1/+1 counter on each creature you control."});
const marhault = card("General Marhault Elsdragon", "Legendary Creature — Elf Warrior", "{2}{R}{G}", {cmc: 4,power: "4",toughness: "4",oracleText: "Whenever a creature you control becomes blocked, it gets +3/+3 until end of turn for each creature blocking it."});
const coronation = card("Coronation of Chaos", "Sorcery", "{2}{R}", {cmc: 3,keywords: ["Goad"],oracleText: "Up to three target creatures can't block this turn. Goad them. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)"});
const slick = card("Slick Sequence", "Instant", "{U}{R}", {cmc: 2,oracleText: "Slick Sequence deals 2 damage to any target. If you've cast another spell this turn, draw a card."});
const elixir = card("Elixir", "Artifact", "{1}", {cmc: 1,oracleText: "This artifact enters tapped.\n{5}, {T}, Exile this artifact: Shuffle all nonland cards from your graveyard into your library. You gain life equal to the number of cards shuffled into your library this way."});
const mirko = card("Mirko, Obsessive Theorist", "Legendary Creature — Vampire Detective", "{1}{U}{B}", {cmc: 3,power: "1",toughness: "3",keywords: ["Flying","Vigilance"],oracleText: "Flying, vigilance\nWhenever you surveil, put a +1/+1 counter on Mirko.\nAt the beginning of your end step, you may return target creature card with power less than Mirko's from your graveyard to the battlefield with a finality counter on it. (If it would die, exile it instead.)"});
const conflux = card("Conflux", "Sorcery", "{3}{W}{U}{B}{R}{G}", {cmc: 8,oracleText: "Search your library for a white card, a blue card, a black card, a red card, and a green card. Reveal those cards, put them into your hand, then shuffle."});
const empathy = card("Primal Empathy", "Enchantment", "{1}{G}{U}", {cmc: 3,oracleText: "At the beginning of your upkeep, draw a card if you control a creature with the greatest power among creatures on the battlefield. Otherwise, put a +1/+1 counter on a creature you control."});
const traprunner = card("Goblin Traprunner", "Creature — Goblin", "{3}{R}", {cmc: 4,power: "4",toughness: "2",oracleText: "Whenever this creature attacks, flip three coins. For each flip you win, create a 1/1 red Goblin creature token that's tapped and attacking."});
const atlas = card("Phyrexian Atlas", "Artifact", "{3}", {cmc: 3,keywords: ["Corrupted"],oracleText: "{T}: Add one mana of any color.\nCorrupted — Whenever this artifact becomes tapped, each opponent who has three or more poison counters loses 1 life."});
const jenson = card("Jenson Carthalion, Druid Exile", "Legendary Creature — Human Druid", "{G}{W}", {cmc: 2,power: "2",toughness: "2",keywords: ["Scry"],oracleText: "Whenever you cast a multicolored spell, scry 1. If that spell was all colors, create a 4/4 white Angel creature token with flying and vigilance.\n{5}, {T}: Add {W}{U}{B}{R}{G}."});
const glory = card("Chance for Glory", "Instant", "{1}{R}{W}", {cmc: 3,oracleText: "Creatures you control gain indestructible. Take an extra turn after this one. At the beginning of that turn's end step, you lose the game."});
const gau = card("Gau, Feral Youth", "Legendary Creature — Human Berserker", "{1}{R}", {cmc: 2,power: "2",toughness: "2",keywords: ["Rage"],oracleText: "Rage — Whenever Gau attacks, put a +1/+1 counter on it.\nAt the beginning of each end step, if a card left your graveyard this turn, Gau deals damage equal to its power to each opponent."});
const insight = card("Commander's Insight", "Instant", "{X}{U}{U}{U}", {cmc: 3,oracleText: "Target player draws X cards plus an additional card for each time they've cast a commander from the command zone this game."});
const broodtender = card("Seedship Broodtender", "Creature — Insect Citizen", "{B}{G}", {cmc: 2,power: "2",toughness: "3",keywords: ["Mill"],oracleText: "When this creature enters, mill three cards. (Put the top three cards of your library into your graveyard.)\n{3}{B}{G}, Sacrifice this creature: Return target creature or Spacecraft card from your graveyard to the battlefield. Activate only as a sorcery."});
const avoidFate = card("Avoid Fate", "Instant", "{G}", {cmc: 1,oracleText: "Counter target instant or Aura spell that targets a permanent you control."});
const serra = card("Serra the Benevolent", "Legendary Planeswalker — Serra", "{2}{W}{W}", {cmc: 4,loyalty: "4",oracleText: "+2: Creatures you control with flying get +1/+1 until end of turn.\n−3: Create a 4/4 white Angel creature token with flying and vigilance.\n−6: You get an emblem with \"If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead.\""});
const oStone = card("Oblivion Stone", "Artifact", "{3}", {cmc: 3,oracleText: "{4}, {T}: Put a fate counter on target permanent.\n{5}, {T}, Sacrifice this artifact: Destroy each nonland permanent without a fate counter on it, then remove all fate counters from all permanents."});
const ward = card("Curator's Ward", "Enchantment — Aura", "{2}{U}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant permanent\nEnchanted permanent has hexproof.\nWhen enchanted permanent leaves the battlefield, if it was historic, draw two cards. (Artifacts, legendaries, and Sagas are historic.)"});
const worship = card("Worship", "Enchantment", "{3}{W}", {cmc: 4,oracleText: "If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead."});
const bringLow = card("Bring Low", "Instant", "{3}{R}", {cmc: 4,oracleText: "Bring Low deals 3 damage to target creature. If that creature has a +1/+1 counter on it, Bring Low deals 5 damage to it instead."});
const feed = card("Feed the Infection", "Sorcery", "{3}{B}", {cmc: 4,keywords: ["Corrupted"],oracleText: "You draw three cards and you lose 3 life.\nCorrupted — Each opponent who has three or more poison counters loses 3 life."});
const gravkill = card("Gravkill", "Instant", "{3}{B}", {cmc: 4,oracleText: "Exile target creature or Spacecraft."});
const funeral = card("Funeral March", "Enchantment — Aura", "{1}{B}{B}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant creature\nWhen enchanted creature leaves the battlefield, its controller sacrifices a creature of their choice."});
const research = card("Primary Research", "Enchantment", "{4}{W}", {cmc: 5,oracleText: "When this enchantment enters, return target nonland permanent card with mana value 3 or less from your graveyard to the battlefield.\nAt the beginning of your end step, if a card left your graveyard this turn, draw a card."});
const retriever = card("Relic Retriever", "Creature — Spirit Monkey", "{1}{R}", {cmc: 2,power: "2",toughness: "1",keywords: ["First strike","Treasure"],oracleText: "First strike\nAt the beginning of each end step, if a card left your graveyard this turn, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"});
const anchor = card("Essence Anchor", "Artifact", "{2}{U}", {cmc: 3,keywords: ["Surveil"],oracleText: "At the beginning of your upkeep, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{T}: Create a 2/2 black Zombie Druid creature token. Activate only during your turn and only if a card left your graveyard this turn."});
const xavier = card("Xavier Sal, Infested Captain", "Legendary Creature — Human Fungus Pirate", "{B}{G}{U}", {cmc: 3,power: "3",toughness: "3",keywords: ["Proliferate","Populate"],oracleText: "{T}, Remove a counter from another permanent you control: Populate. Activate only as a sorcery. (Create a token that's a copy of a creature token you control.)\n{T}, Sacrifice another creature: Proliferate. Activate only as a sorcery. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)"});
const ringImm = card("Ring of Immortals", "Artifact", "{5}", {cmc: 5,oracleText: "{3}, {T}: Counter target instant or Aura spell that targets a permanent you control."});
const valor = card("Valor of the Worthy", "Enchantment — Aura", "{W}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature gets +1/+1.\nWhen enchanted creature leaves the battlefield, create a 1/1 white Spirit creature token with flying."});
const history = card("Living History", "Enchantment", "{1}{R}", {cmc: 2,oracleText: "When this enchantment enters, create a 2/2 red and white Spirit creature token.\nWhenever you attack, if a card left your graveyard this turn, target attacking creature gets +2/+0 until end of turn."});
const nullify = card("Nullify", "Instant", "{U}{U}", {cmc: 2,oracleText: "Counter target creature or Aura spell."});
const balladeer = card("Insufferable Balladeer", "Creature — Dwarf Bard", "{1}{R}", {cmc: 2,power: "2",toughness: "1",keywords: ["Goad","Vicious Mockery"],oracleText: "Vicious Mockery — When this creature enters, target creature an opponent controls can't block this turn. Goad it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)"});
const oceanus = card("Oceanus Dragon", "Creature — Dragon", "{4}{U}{U}", {cmc: 6,power: "3",toughness: "5",keywords: ["Flying","Goad"],oracleText: "Flying\nWhen this creature enters, tap target creature an opponent controls. Goad it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)"});
const tractor = card("Tractor Beam", "Enchantment — Aura", "{2}{U}{U}", {cmc: 4,keywords: ["Enchant"],oracleText: "Enchant creature or Spacecraft\nWhen this Aura enters, tap enchanted permanent.\nYou control enchanted permanent.\nEnchanted permanent doesn't untap during its controller's untap step."});
const focusFire = card("Focus Fire", "Instant", "{W}", {cmc: 1,oracleText: "Focus Fire deals X damage to target attacking or blocking creature, where X is 2 plus the number of creatures and/or Spacecraft you control."});
const beyondQuiet = card("Beyond the Quiet", "Sorcery", "{3}{W}{W}", {cmc: 5,oracleText: "Exile all creatures and Spacecraft."});
const embrace = card("Embrace Oblivion", "Sorcery", "{B}", {cmc: 1,oracleText: "As an additional cost to cast this spell, sacrifice an artifact or creature.\nDestroy target creature or Spacecraft."});
const scrounge = card("Scrounge for Eternity", "Sorcery", "{2}{B}", {cmc: 3,oracleText: "As an additional cost to cast this spell, sacrifice an artifact or creature.\nReturn target creature or Spacecraft card with mana value 5 or less from your graveyard to the battlefield. Then create a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")"});
const punch = card("Punishing Punch", "Instant", "{2}{G}", {cmc: 3,oracleText: "This spell costs {2} less to cast if there are two or more creature cards in your graveyard.\nTarget creature you control deals damage equal to twice its power to target creature an opponent controls."});
const thingSwing = card("Thing Swing", "Instant", "{3}{G}", {cmc: 4,oracleText: "This spell costs {2} less to cast if it targets a Hero you control.\nTarget creature you control deals damage equal to twice its power to target creature an opponent controls."});
const gravship = card("Fell Gravship", "Artifact — Spacecraft", "{2}{B}", {cmc: 3,power: "3",toughness: "2",keywords: ["Station","Mill"],oracleText: "When this Spacecraft enters, mill three cards, then return a creature or Spacecraft card from your graveyard to your hand.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 8+.)\n8+ | Flying, lifelink"});

describe("Round 172 cards", () => {
  it("are fully supported", () =>
    supported(remedy, drone, balan, snare, roar, marcus, barrens, mountainL, might, polliwallop, pointed, acidic, duneblast, reshaper, energyTap, hexavus, valkyrie, mowu, autumn, marhault, coronation, slick, elixir, mirko, conflux, empathy, traprunner, atlas, jenson, glory, gau, insight, broodtender, avoidFate, serra, oStone, ward, worship, bringLow, feed, gravkill, funeral, research, retriever, anchor, xavier, ringImm, valor, history, nullify, balladeer, oceanus, tractor, focusFire, beyondQuiet, embrace, scrounge, punch, thingSwing, gravship));
});

describe("Tainted Remedy", () => {
  it("an opponent who would gain life loses that much instead; you still gain", () => {
    const { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, remedy);
    const [mineL, theirs] = [lifeOf(s, ap), lifeOf(s, opp)];
    gainLife(s, opp, 3);
    gainLife(s, ap, 2);
    expect(lifeOf(s, opp)).toBe(theirs - 3);
    expect(lifeOf(s, ap)).toBe(mineL + 2);
  });
  it("Plague Drone does the same", () => {
    const { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, drone);
    const theirs = lifeOf(s, opp);
    gainLife(s, opp, 4);
    expect(lifeOf(s, opp)).toBe(theirs - 4);
  });
});

describe("Balan, Wandering Knight", () => {
  const sword = () => card("Bonesplitter", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
  it("{1}{W}: attaches all your Equipment to it, and with two it has double strike", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, balan);
    const e1 = putOnBattlefield(s, ap, sword());
    const e2 = putOnBattlefield(s, ap, sword());
    const theirs = putOnBattlefield(s, next(s, ap), sword());
    expect(kw(s, b, "Double strike")).toBe(false);
    s = resolveAll(run(s, planActivate(s, ap, b, 0)));
    expect(s.objects[e1]!.attachedTo).toBe(b);
    expect(s.objects[e2]!.attachedTo).toBe(b);
    expect(s.objects[theirs]!.attachedTo).toBeUndefined();
    expect(kw(s, b, "Double strike")).toBe(true);
    expect(pt(s, b)).toBe("7/3");
  });
  it("one Equipment: first strike only", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, balan);
    putOnBattlefield(s, ap, sword());
    s = resolveAll(run(s, planActivate(s, ap, b, 0)));
    expect(kw(s, b, "Double strike")).toBe(false);
    expect(kw(s, b, "First strike")).toBe(true);
  });
});

describe("Soul Snare", () => {
  it("exiles a creature attacking you, not one attacking another player", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const third = next(s, opp);
    const snareId = putOnBattlefield(s, opp, snare);
    putOnBattlefield(s, opp, plainsCard);
    const a = putOnBattlefield(s, ap, bear());
    const other = putOnBattlefield(s, ap, bear());
    s = attack(s, ap, [{ attacker: a, defender: opp }, { attacker: other, defender: third }]);
    s = resolveAll(s);
    s = priorityTo(s, opp);
    expect(planActivate(s, opp, snareId, 0, [tgt(other)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, opp, snareId, 0, [tgt(a)])));
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, snareId)).toBe("graveyard");
  });
});

describe("Roar of Challenge", () => {
  it("indestructible too with a creature with power 4 or greater", () => {
    let { s, ap } = setup([roar]);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear({ name: "Big", power: "4", toughness: "4" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(b)])));
    expect(kw(s, b, "Indestructible")).toBe(true);
  });
  it("without one, no indestructible", () => {
    let { s, ap } = setup([roar]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(b)])));
    expect(kw(s, b, "Indestructible")).toBe(false);
  });
});

describe("Marcus, Mutant Mayor", () => {
  it("combat damage: a creature with a +1/+1 counter draws; one without gets a counter", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, marcus, { sick: true });
    const withC = putOnBattlefield(s, ap, bear());
    const without = putOnBattlefield(s, ap, bear());
    s.objects[withC]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    const hand = handOf(s, ap).length;
    s = attack(s, ap, [{ attacker: withC, defender: opp }, { attacker: without, defender: opp }]);
    s = settle(s, ap);
    s = passUntil(s, "end", ap);
    expect(handOf(s, ap).length).toBe(hand + 1);
    expect(s.objects[withC]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[without]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Crawling Barrens", () => {
  it("{4}: two +1/+1 counters, then it may become a 0/0 Elemental creature that's still a land", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, barrens);
    s = run(s, planActivate(s, ap, l, 0));
    s = resolveAll(s, true);
    expect(s.objects[l]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[l]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(pt(s, l)).toBe("2/2");
  });
  it("saying no: only the counters", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, barrens);
    s = resolveAll(run(s, planActivate(s, ap, l, 0)), false);
    expect(s.objects[l]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[l]!).types).not.toContain("Creature");
  });
});

describe("The Lonely Mountain", () => {
  it("enters tapped unless you control an Equipment", () => {
    let { s, ap } = setup([mountainL, mountainL]);
    const [a, b] = s.players[ap]!.hand.slice(-2) as [string, string];
    s = act(s, { type: "playLand", player: ap, objectId: a } as Action);
    expect(s.objects[a]!.tapped).toBe(true);
    putOnBattlefield(s, ap, card("Bonesplitter", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +2/+0.\nEquip {1}" }));
    moveObject(s, a, "hand");
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: b } as Action);
    expect(s.objects[b]!.tapped).toBe(false);
  });
});

describe("Animist's Might and Polliwallop", () => {
  it("your creature deals twice its power to the other creature", () => {
    let { s, ap } = setup([might]);
    const opp = next(s, ap);
    const mine1 = putOnBattlefield(s, ap, bear({ power: "3", toughness: "3" }));
    const theirs = putOnBattlefield(s, opp, bear({ power: "1", toughness: "7" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(mine1), tgt(theirs)])));
    expect(s.objects[theirs]!.damage).toBe(6);
    expect(s.objects[mine1]!.damage ?? 0).toBe(0);
  });
  it("Polliwallop", () => {
    let { s, ap } = setup([polliwallop]);
    const opp = next(s, ap);
    const mine1 = putOnBattlefield(s, ap, bear({ power: "2", toughness: "2" }));
    const theirs = putOnBattlefield(s, opp, bear({ power: "1", toughness: "5" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(mine1), tgt(theirs)])));
    expect(s.objects[theirs]!.damage).toBe(4);
  });
});

describe("Pointed Discussion", () => {
  it("draw two, lose 2 life, create a Blood token", () => {
    let { s, ap } = setup([pointed]);
    const hand = handOf(s, ap).length;
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(handOf(s, ap).length).toBe(hand + 1);
    expect(lifeOf(s, ap)).toBe(life - 2);
    expect(mine(s, ap, "Blood Token").length).toBe(1);
  });
});

describe("Acidic Soil", () => {
  it("each player takes damage equal to the lands they control", () => {
    let { s, ap } = setup([acidic]);
    const opp = next(s, ap);
    putOnBattlefield(s, opp, forest);
    putOnBattlefield(s, opp, forest);
    const third = next(s, opp);
    const [me, them, nobody] = [lifeOf(s, ap), lifeOf(s, opp), lifeOf(s, third)];
    const myLands = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(lifeOf(s, ap)).toBe(me - myLands);
    expect(lifeOf(s, opp)).toBe(them - 2);
    expect(lifeOf(s, third)).toBe(nobody - s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === third && characteristics(s, s.objects[id]!).types.includes("Land")).length);
  });
});

describe("Duneblast", () => {
  it("keeps up to one creature and destroys the rest", () => {
    let { s, ap } = setup([duneblast]);
    const keep = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, next(s, ap), bear());
    s = run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!));
    s = resolveAll(s);
    expect(s.pending?.player).toBe(ap);
    s = act(s, { type: "pickPermanents", player: ap, ids: [keep] } as Action);
    s = resolveAll(s);
    expect(zone(s, keep)).toBe("battlefield");
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
  });
});

describe("Matter Reshaper", () => {
  const top = (s: GameState, pid: PlayerId, def: CardDef) => into(s, pid, def, "library");
  it("dies: a permanent card with mana value 3 or less may go onto the battlefield", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, reshaper);
    const c = top(s, ap, bear());
    destroyPermanent(s, s.objects[r]!, "test");
    s = resolveAll(s, true);
    expect(zone(s, c)).toBe("battlefield");
  });
  it("saying no: into your hand", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, reshaper);
    const c = top(s, ap, bear());
    destroyPermanent(s, s.objects[r]!, "test");
    s = resolveAll(s, false);
    expect(zone(s, c)).toBe("hand");
  });
  it("a bigger card or a nonpermanent goes into your hand", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, reshaper);
    const c = top(s, ap, card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." }));
    destroyPermanent(s, s.objects[r]!, "test");
    s = resolveAll(s, true);
    expect(zone(s, c)).toBe("hand");
    const r2 = putOnBattlefield(s, ap, reshaper);
    const big = top(s, ap, bear({ name: "Big", cmc: 4, manaCost: "{3}{G}" }));
    destroyPermanent(s, s.objects[r2]!, "test");
    s = resolveAll(s, true);
    expect(zone(s, big)).toBe("hand");
  });
});

describe("Energy Tap", () => {
  it("taps your untapped creature and adds {C} equal to its mana value", () => {
    let { s, ap } = setup([energyTap]);
    const b = putOnBattlefield(s, ap, bear({ name: "Big", cmc: 4, manaCost: "{3}{G}" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(b)])));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(4);
  });
  it("can't target a tapped creature", () => {
    const { s, ap } = setup([energyTap]);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.tapped = true;
    expect(planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(b)])).toBeNull();
  });
});

describe("Hexavus", () => {
  it("enters with six counters; {1}, remove a counter from another creature: a +1/+1 counter on it", () => {
    let { s, ap } = setup([hexavus]);
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    const h = mine(s, ap, "Hexavus")[0]!;
    expect(pt(s, h)).toBe("6/6");
    const other = putOnBattlefield(s, ap, bear());
    s.objects[other]!.counters.lore = 1;
    expect(planActivate(s, ap, h, 1, undefined, undefined, undefined, undefined, { counters: [{ id: h, kind: "+1/+1" }] })).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, h, 1, undefined, undefined, undefined, undefined, { counters: [{ id: other, kind: "lore" }] })));
    expect(pt(s, h)).toBe("7/7");
    expect(s.objects[other]!.counters.lore ?? 0).toBe(0);
  });
  it("{1}, remove a +1/+1 counter from it: a flying counter on another target creature", () => {
    let { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hexavus);
    s.objects[h]!.counters["+1/+1"] = 6;
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, h, 0, [tgt(b)])));
    expect(kw(s, b, "Flying")).toBe(true);
    expect(s.objects[h]!.counters["+1/+1"]).toBe(5);
  });
});

describe("Eradicator Valkyrie", () => {
  it("hexproof from planeswalkers only: a creature's ability can target it", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const v = putOnBattlefield(s, opp, valkyrie);
    const pinger = putOnBattlefield(s, ap, card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { cmc: 3, power: "1", toughness: "1", oracleText: "{T}: Prodigal Pyromancer deals 1 damage to any target." }));
    expect(kw(s, v, "Hexproof")).toBe(false);
    s = resolveAll(run(s, planActivate(s, ap, pinger, 0, [tgt(v)])));
    expect(s.objects[v]!.damage).toBe(1);
  });
  it("a planeswalker's ability can't target it", () => {
    const { s, ap } = setup([]);
    const opp = next(s, ap);
    const v = putOnBattlefield(s, opp, valkyrie);
    const pw = putOnBattlefield(s, ap, card("Test Walker", "Legendary Planeswalker — Test", "{2}{R}", { cmc: 3, loyalty: "3", oracleText: "−1: This planeswalker deals 1 damage to target creature." }));
    s.objects[pw]!.counters.loyalty = 3;
    expect(planActivate(s, ap, pw, 0, [tgt(v)])).toBeNull();
  });
});

describe("Mowu, Loyal Companion", () => {
  it("one more +1/+1 counter whenever counters would be put on it, not on others", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mowu);
    const b = putOnBattlefield(s, ap, bear());
    putCounters(s, s.objects[m]!, "+1/+1", 2);
    putCounters(s, s.objects[b]!, "+1/+1", 2);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Colonel Autumn", () => {
  it("another legendary creature you control has exploit; exploiting puts a +1/+1 counter on each of your creatures", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, autumn);
    const fodder = putOnBattlefield(s, ap, bear());
    const other = putOnBattlefield(s, ap, bear({ name: "Other" }));
    const legend = into(s, ap, card("Test Legend", "Legendary Creature — Human", "{1}{G}", { cmc: 2, power: "2", toughness: "2" }), "hand");
    s = run(s, planCast(s, ap, legend));
    s = resolveAll(s, true);
    expect(s.pending?.player).toBe(ap);
    s = act(s, { type: "pickPermanents", player: ap, ids: [fodder] } as Action);
    s = resolveAll(s);
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.objects[other]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[legend]!.counters["+1/+1"]).toBe(1);
  });
});

describe("General Marhault Elsdragon", () => {
  it("a creature of yours that becomes blocked gets +3/+3 for each creature blocking it", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, marhault);
    const a = putOnBattlefield(s, ap, bear());
    const b1 = putOnBattlefield(s, opp, bear());
    const b2 = putOnBattlefield(s, opp, bear());
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    s = resolveAll(s);
    s = passUntil(s, "declareBlockers", ap);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a }, { blocker: b2, attacker: a }] } as Action);
    s = resolveAll(s);
    expect(pt(s, a)).toBe("8/8");
  });
});

describe("Coronation of Chaos", () => {
  it("up to three target creatures can't block this turn and are goaded", () => {
    let { s, ap } = setup([coronation]);
    const opp = next(s, ap);
    const t1 = putOnBattlefield(s, opp, bear());
    const t2 = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(t1), tgt(t2), { kind: "none" }])));
    const a = putOnBattlefield(s, ap, bear());
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    expect(blockProblem(s, s.objects[t1]!, s.objects[a]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[t2]!, s.objects[a]!)).not.toBeNull();
    expect(characteristics(s, s.objects[t2]!).goadedBy).toContain(ap);
  });
});

describe("Slick Sequence", () => {
  const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
  it("draws a card if you've cast another spell this turn", () => {
    let { s, ap } = setup([shock(), slick]);
    const opp = next(s, ap);
    const [sh, sl] = s.players[ap]!.hand.slice(-2) as [string, string];
    s = resolveAll(run(s, planCast(s, ap, sh, [{ kind: "player", id: opp }])));
    const hand = handOf(s, ap).length;
    s = resolveAll(run(s, planCast(s, ap, sl, [{ kind: "player", id: opp }])));
    expect(handOf(s, ap).length).toBe(hand);
  });
  it("not if it's the only spell cast", () => {
    let { s, ap } = setup([slick]);
    const opp = next(s, ap);
    const hand = handOf(s, ap).length;
    const life = lifeOf(s, opp);
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [{ kind: "player", id: opp }])));
    expect(handOf(s, ap).length).toBe(hand - 1);
    expect(lifeOf(s, opp)).toBe(life - 2);
  });
});

describe("Elixir", () => {
  it("shuffles your nonland graveyard cards into your library and gains that much life", () => {
    let { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, elixir);
    const g1 = into(s, ap, bear(), "graveyard");
    const g2 = into(s, ap, bear(), "graveyard");
    const land = into(s, ap, forest, "graveyard");
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planActivate(s, ap, e, 0)));
    expect(zone(s, g1)).toBe("library");
    expect(zone(s, g2)).toBe("library");
    expect(zone(s, land)).toBe("graveyard");
    expect(zone(s, e)).toBe("exile");
    expect(lifeOf(s, ap)).toBe(life + 2);
  });
});

describe("Mirko, Obsessive Theorist", () => {
  it("end step: may return a creature card with power less than Mirko's, with a finality counter", () => {
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mirko);
    s.objects[m]!.counters["+1/+1"] = 2;
    const small = into(s, ap, bear(), "graveyard");
    const big = into(s, ap, bear({ name: "Big", power: "3", toughness: "3" }), "graveyard");
    s = passUntil(s, "end", ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] }), true);
    expect(zone(s, small)).toBe("battlefield");
    expect(s.objects[small]!.counters.finality).toBe(1);
  });
});

describe("Conflux", () => {
  it("finds one card of each color and puts them into your hand", () => {
    let { s, ap } = setup([conflux]);
    const colored = (c: string, m: string) => into(s, ap, card(`${c} Card`, "Creature — Test", m, { cmc: 1, power: "1", toughness: "1" }), "library");
    const ids = [colored("White", "{W}"), colored("Blue", "{U}"), colored("Black", "{B}"), colored("Red", "{R}"), colored("Green", "{G}")];
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: ids } as Action);
    s = resolveAll(s);
    for (const id of ids) expect(zone(s, id)).toBe("hand");
  });
});

describe("Primal Empathy", () => {
  it("upkeep: draws if you control a creature with the greatest power (a tie counts)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, empathy);
    putOnBattlefield(s, ap, bear({ power: "3", toughness: "3" }));
    putOnBattlefield(s, next(s, ap), bear({ power: "3", toughness: "3" }));
    s = passUntil(s, "upkeep", next(s, ap));
    s = passUntil(s, "upkeep", ap);
    const hand = handOf(s, ap).length;
    s = settle(s, ap);
    expect(handOf(s, ap).length).toBe(hand + 1);
  });
  it("otherwise a +1/+1 counter on a creature you control", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, empathy);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, next(s, ap), bear({ power: "5", toughness: "5" }));
    s = passUntil(s, "upkeep", next(s, ap));
    s = passUntil(s, "upkeep", ap);
    const hand = handOf(s, ap).length;
    s = settle(s, ap);
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [b] } as Action));
    expect(handOf(s, ap).length).toBe(hand);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Goblin Traprunner", () => {
  it("attacks: flips three coins, a tapped and attacking 1/1 Goblin for each won", () => {
    for (const seed of [1, 2, 3, 4]) {
      let { s, ap } = setup([], seed);
      const opp = next(s, ap);
      const t = putOnBattlefield(s, ap, traprunner);
      s = settle(attack(s, ap, [{ attacker: t, defender: opp }]), ap);
      // Each token attacks a player its controller chooses (CR 508.4).
      while (s.pending?.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) } as Action), ap);
      const line = s.log.find((l) => /flips 3 coins/.test(typeof l === "string" ? l : (l as { text: string }).text));
      const won = Number(/: (\d) won/.exec(typeof line === "string" ? line : (line as unknown as { text: string }).text)![1]);
      const goblins = mine(s, ap, "Goblin Token");
      expect(goblins.length).toBe(won);
      for (const g of goblins) {
        expect(s.objects[g]!.tapped).toBe(true);
        expect(s.objects[g]!.attacking).toBe(opp);
      }
    }
  });
});

describe("Phyrexian Atlas", () => {
  it("becoming tapped: each opponent with three or more poison counters loses 1 life", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const clean = next(s, opp);
    s.players[opp]!.poison = 3;
    s.players[clean]!.poison = 2;
    const a = putOnBattlefield(s, ap, atlas);
    const [l1, l2] = [lifeOf(s, opp), lifeOf(s, clean)];
    s = act(s, { type: "activateMana", player: ap, objectId: a, index: 0, mana: "G" } as Action);
    s = resolveAll(s);
    expect(lifeOf(s, opp)).toBe(l1 - 1);
    expect(lifeOf(s, clean)).toBe(l2);
  });
});

describe("Jenson Carthalion, Druid Exile", () => {
  it("a multicolored spell: scry 1; all colors: a 4/4 Angel too", () => {
    let { s, ap } = setup([card("Five Colors", "Sorcery", "{W}{U}{B}{R}{G}", { cmc: 5, oracleText: "Draw a card." }), card("Two Colors", "Sorcery", "{W}{U}", { cmc: 2, oracleText: "Draw a card." })]);
    putOnBattlefield(s, ap, jenson);
    const [five, two] = s.players[ap]!.hand.slice(-2) as [string, string];
    s = run(s, planCast(s, ap, two));
    s = settle(s, ap);
    if (s.pending?.kind === "arrangeTop") s = resolveAll(act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] }));
    expect(mine(s, ap, "Angel Token").length).toBe(0);
    s = run(s, planCast(s, ap, five));
    s = settle(s, ap);
    if (s.pending?.kind === "arrangeTop") s = resolveAll(act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] }));
    const angels = mine(s, ap, "Angel Token");
    expect(angels.length).toBe(1);
    expect(pt(s, angels[0]!)).toBe("4/4");
  });
});

describe("Gau, Feral Youth", () => {
  it("end step: deals its power to each opponent if a card left your graveyard this turn", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, gau);
    const life = lifeOf(s, opp);
    s = passUntil(s, "end", ap);
    s = settle(s, ap);
    expect(lifeOf(s, opp)).toBe(life);
    s = passUntil(s, "main1", next(s, ap));
    const g = into(s, ap, bear(), "graveyard");
    moveObject(s, g, "exile");
    s = passUntil(s, "end", next(s, ap));
    s = settle(s, ap);
    expect(lifeOf(s, opp)).toBe(life - 2);
  });
  it("a token leaving the graveyard isn't a card", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, gau);
    const life = lifeOf(s, opp);
    const t = into(s, ap, bear(), "graveyard");
    s.objects[t]!.isToken = true;
    moveObject(s, t, "exile");
    s = settle(passUntil(s, "end", ap), ap);
    expect(lifeOf(s, opp)).toBe(life);
  });
});

describe("Commander's Insight", () => {
  it("target player draws X plus one for each time they've cast a commander from the command zone", () => {
    let { s, ap } = setup([insight]);
    const opp = next(s, ap);
    s.players[opp]!.commanderCasts = { a: 2 } as never;
    s.players[ap]!.commanderCasts = { b: 5 } as never;
    const hand = handOf(s, opp).length;
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [{ kind: "player", id: opp }], undefined, "auto", 1)));
    expect(handOf(s, opp).length).toBe(hand + 3);
  });
});

describe("Seedship Broodtender", () => {
  it("enters: mill three; sacrifice it: a creature card from your graveyard onto the battlefield", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, broodtender);
    const g = into(s, ap, bear({ name: "Back" }), "graveyard");
    s = resolveAll(run(s, planActivate(s, ap, b, 0, [tgt(g)])));
    expect(zone(s, g)).toBe("battlefield");
    expect(zone(s, b)).toBe("graveyard");
  });
});

const axe = () => card("Lava Axe", "Sorcery", "{4}{R}", { cmc: 5, oracleText: "Lava Axe deals 5 damage to target player or planeswalker." });
const shockDef = () => card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });

describe("Worship", () => {
  it("with a creature, damage can't take your life below 1", () => {
    let { s, ap } = setup([axe()]);
    putOnBattlefield(s, ap, worship);
    putOnBattlefield(s, ap, bear());
    s.players[ap]!.life = 3;
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [{ kind: "player", id: ap }])));
    expect(lifeOf(s, ap)).toBe(1);
  });
  it("without a creature, it does nothing; nor does it stop life loss", () => {
    let { s, ap } = setup([axe()]);
    putOnBattlefield(s, ap, worship);
    s.players[ap]!.life = 6;
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [{ kind: "player", id: ap }])));
    expect(lifeOf(s, ap)).toBe(1);
    putOnBattlefield(s, ap, bear());
    loseLife(s, ap, 3);
    expect(lifeOf(s, ap)).toBe(-2);
  });
});

describe("Serra the Benevolent", () => {
  it("−6: an emblem with Worship's ability", () => {
    let { s, ap } = setup([axe()]);
    const sv = putOnBattlefield(s, ap, serra);
    s.objects[sv]!.counters.loyalty = 6;
    s = resolveAll(run(s, planActivate(s, ap, sv, 2)));
    expect(zone(s, sv)).toBe("graveyard");
    putOnBattlefield(s, ap, bear());
    s.players[ap]!.life = 3;
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [{ kind: "player", id: ap }])));
    expect(lifeOf(s, ap)).toBe(1);
  });
  it("+2: creatures you control with flying get +1/+1", () => {
    let { s, ap } = setup([]);
    const sv = putOnBattlefield(s, ap, serra);
    s.objects[sv]!.counters.loyalty = 4;
    const flier = putOnBattlefield(s, ap, bear({ keywords: ["Flying"], oracleText: "Flying" }));
    const walker = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, sv, 0)));
    expect(pt(s, flier)).toBe("3/3");
    expect(pt(s, walker)).toBe("2/2");
  });
});

describe("Chance for Glory", () => {
  it("your creatures gain indestructible for good; an extra turn, at whose end step you lose", () => {
    let { s, ap } = setup([glory]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(kw(s, b, "Indestructible")).toBe(true);
    const later = putOnBattlefield(s, ap, bear({ name: "Later" }));
    expect(kw(s, later, "Indestructible")).toBe(false);
    s = passUntil(s, "upkeep", ap);
    expect(s.activePlayer).toBe(ap);
    expect(kw(s, b, "Indestructible")).toBe(true);
    expect(s.players[ap]!.lost).toBeFalsy();
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(s.players[ap]!.lost).toBeTruthy();
  });
});

/** The spell `id` on the stack, as a target. */
const onStack = (s: GameState, id: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id });

describe("Avoid Fate, Nullify and Ring of Immortals", () => {
  const aura = () => card("Pacifism", "Enchantment — Aura", "{1}{W}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
  it("Avoid Fate counters an Aura spell targeting your permanent", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const b = putOnBattlefield(s, opp, bear());
    const pac = into(s, ap, aura(), "hand");
    const af = into(s, opp, avoidFate, "hand");
    putOnBattlefield(s, opp, forest);
    s = run(s, planCast(s, ap, pac, [tgt(b)]));
    s = priorityTo(s, opp);
    s = resolveAll(run(s, planCast(s, opp, af, [onStack(s, pac)])));
    expect(zone(s, pac)).toBe("graveyard");
    expect(zone(s, af)).toBe("graveyard");
  });
  it("Avoid Fate can't target an instant that targets someone else's permanent", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const theirs = putOnBattlefield(s, next(s, opp), bear());
    const sh = into(s, ap, shockDef(), "hand");
    const af = into(s, opp, avoidFate, "hand");
    putOnBattlefield(s, opp, forest);
    s = run(s, planCast(s, ap, sh, [tgt(theirs)]));
    s = priorityTo(s, opp);
    expect(planCast(s, opp, af, [onStack(s, sh)])).toBeNull();
  });
  it("Nullify counters a creature spell; Ring of Immortals an instant targeting your permanent", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const mineB = putOnBattlefield(s, opp, bear());
    const sh = into(s, ap, shockDef(), "hand");
    const ring = putOnBattlefield(s, opp, ringImm);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, island);
    s = run(s, planCast(s, ap, sh, [tgt(mineB)]));
    s = priorityTo(s, opp);
    s = resolveAll(run(s, planActivate(s, opp, ring, 0, [onStack(s, sh)])));
    expect(zone(s, sh)).toBe("graveyard");
    expect(zone(s, mineB)).toBe("battlefield");
    const creature = into(s, ap, bear({ name: "Cast Bear" }), "hand");
    const nul = into(s, opp, nullify, "hand");
    putOnBattlefield(s, opp, island);
    putOnBattlefield(s, opp, island);
    s = run(s, planCast(s, ap, creature));
    s = priorityTo(s, opp);
    s = resolveAll(run(s, planCast(s, opp, nul, [onStack(s, creature)])));
    expect(zone(s, creature)).toBe("graveyard");
  });
});

describe("Oblivion Stone", () => {
  it("destroys each nonland permanent without a fate counter, then removes all fate counters", () => {
    let { s, ap } = setup([]);
    const st = putOnBattlefield(s, ap, oStone);
    const kept = putOnBattlefield(s, ap, bear());
    const gone = putOnBattlefield(s, next(s, ap), bear());
    s = resolveAll(run(s, planActivate(s, ap, st, 0, [tgt(kept)])));
    expect(s.objects[kept]!.counters.fate).toBe(1);
    s.objects[st]!.tapped = false;
    s = resolveAll(run(s, planActivate(s, ap, st, 1)));
    expect(zone(s, kept)).toBe("battlefield");
    expect(zone(s, gone)).toBe("graveyard");
    expect(zone(s, st)).toBe("graveyard");
    expect(s.objects[kept]!.counters.fate ?? 0).toBe(0);
  });
});

describe("Curator's Ward", () => {
  it("enchanted permanent has hexproof; it leaving the battlefield draws two if it was historic", () => {
    let { s, ap } = setup([ward]);
    const legend = putOnBattlefield(s, ap, card("Test Legend", "Legendary Creature — Human", "{1}{G}", { cmc: 2, power: "2", toughness: "2" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(legend)])));
    expect(kw(s, legend, "Hexproof")).toBe(true);
    const hand = handOf(s, ap).length;
    destroyPermanent(s, s.objects[legend]!, "test");
    s = resolveAll(s);
    expect(handOf(s, ap).length).toBe(hand + 2);
  });
  it("not if it wasn't historic", () => {
    let { s, ap } = setup([ward]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(b)])));
    const hand = handOf(s, ap).length;
    moveObject(s, b, "hand");
    s = resolveAll(s);
    expect(handOf(s, ap).length).toBe(hand + 1); // only the bear itself
  });
});

describe("Bring Low", () => {
  it("3 damage, or 5 to a creature with a +1/+1 counter", () => {
    let { s, ap } = setup([bringLow, bringLow]);
    const opp = next(s, ap);
    const plain = putOnBattlefield(s, opp, bear({ power: "1", toughness: "9" }));
    const countered = putOnBattlefield(s, opp, bear({ power: "1", toughness: "9" }));
    s.objects[countered]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    const [a, b] = s.players[ap]!.hand.slice(-2) as [string, string];
    s = resolveAll(run(s, planCast(s, ap, a, [tgt(plain)])));
    s = resolveAll(run(s, planCast(s, ap, b, [tgt(countered)])));
    expect(s.objects[plain]!.damage).toBe(3);
    expect(s.objects[countered]!.damage).toBe(5);
  });
});

describe("Feed the Infection", () => {
  it("draw three, lose 3; each opponent with three or more poison counters loses 3", () => {
    let { s, ap } = setup([feed]);
    const opp = next(s, ap);
    const clean = next(s, opp);
    s.players[opp]!.poison = 4;
    const [me, l1, l2, hand] = [lifeOf(s, ap), lifeOf(s, opp), lifeOf(s, clean), handOf(s, ap).length];
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(lifeOf(s, ap)).toBe(me - 3);
    expect(lifeOf(s, opp)).toBe(l1 - 3);
    expect(lifeOf(s, clean)).toBe(l2);
    expect(handOf(s, ap).length).toBe(hand + 2);
  });
});

const ship = () => card("Test Ship", "Artifact — Spacecraft", "{2}", { cmc: 2, power: "3", toughness: "3", keywords: ["Station"], oracleText: "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 8+.)\n8+ | Flying" });
const rock = () => card("Mind Stone", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });

describe("Curator's Ward on a noncreature permanent", () => {
  it("an enchanted artifact leaving the battlefield draws two", () => {
    let { s, ap } = setup([ward]);
    const r = putOnBattlefield(s, ap, rock());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(r)])));
    const hand = handOf(s, ap).length;
    destroyPermanent(s, s.objects[r]!, "test");
    s = resolveAll(s);
    expect(handOf(s, ap).length).toBe(hand + 2);
  });
});

describe("Spacecraft as creatures or Spacecraft", () => {
  it("Gravkill exiles a Spacecraft that isn't a creature, not another artifact", () => {
    let { s, ap } = setup([gravkill]);
    const opp = next(s, ap);
    const sc = putOnBattlefield(s, opp, ship());
    const r = putOnBattlefield(s, opp, rock());
    expect(planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(r)])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(sc)])));
    expect(zone(s, sc)).toBe("exile");
  });
  it("Beyond the Quiet exiles all creatures and Spacecraft, not other artifacts", () => {
    let { s, ap } = setup([beyondQuiet]);
    const opp = next(s, ap);
    const sc = putOnBattlefield(s, opp, ship());
    const r = putOnBattlefield(s, opp, rock());
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(zone(s, sc)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, r)).toBe("battlefield");
  });
  it("Focus Fire: 2 plus your creatures and Spacecraft", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, opp, ship());
    putOnBattlefield(s, opp, bear());
    const ff = into(s, opp, focusFire, "hand");
    putOnBattlefield(s, opp, plainsCard);
    const a = putOnBattlefield(s, ap, bear({ power: "1", toughness: "9" }));
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    s = resolveAll(s);
    s = priorityTo(s, opp);
    s = resolveAll(run(s, planCast(s, opp, ff, [tgt(a)])));
    expect(s.objects[a]!.damage).toBe(4);
  });
  it("Embrace Oblivion: sacrifice an artifact or creature, destroy a creature or Spacecraft", () => {
    let { s, ap } = setup([embrace]);
    const opp = next(s, ap);
    const fodder = putOnBattlefield(s, ap, rock());
    const sc = putOnBattlefield(s, opp, ship());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(sc)], undefined, "auto", undefined, { sacrifice: [fodder] } as never)));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(zone(s, sc)).toBe("graveyard");
  });
  it("Scrounge for Eternity: a creature or Spacecraft card back, and a Lander token", () => {
    let { s, ap } = setup([scrounge]);
    const fodder = putOnBattlefield(s, ap, bear());
    const sc = into(s, ap, ship(), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(sc)], undefined, "auto", undefined, { sacrifice: [fodder] } as never)));
    expect(zone(s, sc)).toBe("battlefield");
    expect(mine(s, ap, "Lander Token").length).toBe(1);
  });
  it("Tractor Beam: enchant a Spacecraft, tap it, gain control of it", () => {
    let { s, ap } = setup([tractor]);
    const opp = next(s, ap);
    const sc = putOnBattlefield(s, opp, ship());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(sc)])));
    expect(controllerOf(s, s.objects[sc]!)).toBe(ap);
    expect(s.objects[sc]!.tapped).toBe(true);
  });
  it("Fell Gravship: mill three, then a creature or Spacecraft card from your graveyard to your hand", () => {
    let { s, ap } = setup([gravship]);
    const g = into(s, ap, ship(), "graveyard");
    s = run(s, planCast(s, ap, s.players[ap]!.hand.at(-2 + 1)!));
    s = resolveAll(s);
    if (s.pending) s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [g] }));
    expect(zone(s, g)).toBe("hand");
  });
});

describe("Funeral March and Valor of the Worthy", () => {
  it("Funeral March: when enchanted creature leaves, its controller sacrifices a creature", () => {
    let { s, ap } = setup([funeral]);
    const opp = next(s, ap);
    const t = putOnBattlefield(s, opp, bear());
    const other = putOnBattlefield(s, opp, bear({ name: "Other" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(t)])));
    moveObject(s, t, "hand");
    s = settle(s, ap);
    expect(zone(s, other)).toBe("graveyard");
  });
  it("Valor of the Worthy: +1/+1, and a 1/1 flying Spirit when the creature leaves", () => {
    let { s, ap } = setup([valor]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(b)])));
    expect(pt(s, b)).toBe("3/3");
    moveObject(s, b, "exile");
    s = resolveAll(s);
    const spirits = mine(s, ap, "Spirit Token");
    expect(spirits.length).toBe(1);
    expect(kw(s, spirits[0]!, "Flying")).toBe(true);
  });
});

describe("A card left your graveyard this turn", () => {
  it("Primary Research: returns a card, and then draws at your end step", () => {
    let { s, ap } = setup([research]);
    const g = into(s, ap, bear(), "graveyard");
    s = run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!));
    s = resolveAll(s);
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] }));
    expect(zone(s, g)).toBe("battlefield");
    const hand = handOf(s, ap).length;
    s = settle(passUntil(s, "end", ap), ap);
    expect(handOf(s, ap).length).toBe(hand + 1);
  });
  it("Primary Research: no draw on a turn nothing left", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, research);
    const hand = handOf(s, ap).length;
    s = settle(passUntil(s, "end", ap), ap);
    expect(handOf(s, ap).length).toBe(hand);
  });
  it("Relic Retriever: a Treasure at each end step, an opponent's card leaving doesn't count", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, retriever);
    const theirs = into(s, opp, bear(), "graveyard");
    moveObject(s, theirs, "exile");
    s = settle(passUntil(s, "end", ap), ap);
    expect(mine(s, ap, "Treasure Token").length).toBe(0);
    s = passUntil(s, "main1", opp);
    const g = into(s, ap, bear(), "graveyard");
    moveObject(s, g, "hand");
    s = settle(passUntil(s, "end", opp), ap);
    expect(mine(s, ap, "Treasure Token").length).toBe(1);
  });
  it("Essence Anchor: makes a Zombie Druid only on your turn after a card left your graveyard", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, anchor);
    expect(planActivate(s, ap, a, 0)).toBeNull();
    const g = into(s, ap, bear(), "graveyard");
    moveObject(s, g, "exile");
    s = resolveAll(run(s, planActivate(s, ap, a, 0)));
    expect(mine(s, ap, "Zombie Druid Token").length).toBe(1);
  });
  it("Living History: a 2/2 Spirit; attacking after a card left your graveyard pumps an attacker", () => {
    let { s, ap } = setup([history]);
    const opp = next(s, ap);
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(mine(s, ap, "Spirit Token").length).toBe(1);
    const b = putOnBattlefield(s, ap, bear());
    const g = into(s, ap, bear({ name: "Gone" }), "graveyard");
    moveObject(s, g, "exile");
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(pt(s, b)).toBe("4/2");
  });
});

describe("Xavier Sal, Infested Captain", () => {
  it("remove a counter from another permanent you control: populate", () => {
    let { s, ap } = setup([]);
    const x = putOnBattlefield(s, ap, xavier);
    const holder = putOnBattlefield(s, ap, rock());
    s.objects[holder]!.counters.charge = 1;
    s.objects[x]!.counters["+1/+1"] = 1;
    const tok = putOnBattlefield(s, ap, bear({ name: "Bear Token" }));
    s.objects[tok]!.isToken = true;
    expect(planActivate(s, ap, x, 0, undefined, undefined, undefined, undefined, { counters: [{ id: x, kind: "+1/+1" }] })).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, x, 0, undefined, undefined, undefined, undefined, { counters: [{ id: holder, kind: "charge" }] })));
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [tok] } as Action));
    expect(mine(s, ap, "Bear Token").length).toBe(2);
  });
});

describe("Goading on entering", () => {
  it("Insufferable Balladeer: target creature can't block this turn and is goaded", () => {
    let { s, ap } = setup([balladeer]);
    const opp = next(s, ap);
    const t = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!));
    s = resolveAll(s);
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(t)] }));
    expect(characteristics(s, s.objects[t]!).goadedBy).toContain(ap);
    const a = putOnBattlefield(s, ap, bear());
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    expect(blockProblem(s, s.objects[t]!, s.objects[a]!)).not.toBeNull();
  });
  it("Oceanus Dragon: taps and goads", () => {
    let { s, ap } = setup([oceanus]);
    const opp = next(s, ap);
    const t = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!));
    s = resolveAll(s);
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(t)] }));
    expect(s.objects[t]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[t]!).goadedBy).toContain(ap);
  });
});

describe("Punishing Punch and Thing Swing", () => {
  it("Punishing Punch: twice the power, cheaper with two creature cards in your graveyard", () => {
    let { s, ap } = setup([punch]);
    const opp = next(s, ap);
    const p = s.players[ap]!.hand.at(-1)!;
    const m1 = putOnBattlefield(s, ap, bear({ power: "3", toughness: "3" }));
    const t = putOnBattlefield(s, opp, bear({ power: "1", toughness: "9" }));
    const before = spellCost(s, ap, s.objects[p]!).extra;
    into(s, ap, bear(), "graveyard");
    into(s, ap, bear(), "graveyard");
    expect(before - spellCost(s, ap, s.objects[p]!).extra).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, p, [tgt(m1), tgt(t)])));
    expect(s.objects[t]!.damage).toBe(6);
  });
  it("Thing Swing: twice the power", () => {
    let { s, ap } = setup([thingSwing]);
    const opp = next(s, ap);
    const m1 = putOnBattlefield(s, ap, bear({ power: "4", toughness: "4" }));
    const t = putOnBattlefield(s, opp, bear({ power: "1", toughness: "9" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(m1), tgt(t)])));
    expect(s.objects[t]!.damage).toBe(8);
  });
});

describe("Mowu entering with counters", () => {
  it("one more as it enters with them (rulings), not on another creature entering", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mowu);
    const b = putOnBattlefield(s, ap, bear());
    putCounters(s, s.objects[m]!, "+1/+1", 1, true);
    putCounters(s, s.objects[b]!, "+1/+1", 1, true);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Kellan, Daring Traveler", () => {
  const kellan = card("Kellan, Daring Traveler", "Legendary Creature — Human Faerie Scout", "{1}{W}", { cmc: 2, power: "2", toughness: "3", oracleText: "Whenever Kellan attacks, reveal the top card of your library. If it's a creature card with mana value 3 or less, put it into your hand. Otherwise, you may put it into your graveyard." });
  it("attacks: a small creature card goes into your hand; anything else may go to your graveyard", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const k = putOnBattlefield(s, ap, kellan);
    const c = into(s, ap, bear(), "library");
    s = settle(attack(s, ap, [{ attacker: k, defender: opp }]), ap);
    expect(zone(s, c)).toBe("hand");
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    const big = into(s, ap, bear({ name: "Big", cmc: 5, manaCost: "{4}{G}" }), "library");
    s = settle(attack(s, ap, [{ attacker: k, defender: opp }]), ap, true);
    expect(zone(s, big)).toBe("graveyard");
  });
});
