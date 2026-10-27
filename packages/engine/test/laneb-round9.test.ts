// Lane B, round 9: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, mountain, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { transformPermanent } from "../src/effects/run-permanents";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a pick
 * gets `pick` (or the first ones offered); a discard the first cards in hand; a reveal from hand `reveal` (or none). Stops
 * at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; pick?: string[]; reveal?: string[] } = {}) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "searchLibrary" && p.fromHand) s = act(s, { type: "searchLibrary", player: p.player, found: opts.reveal ?? [] });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const chars = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const tokens = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const whiteHuman = () => creature("White Human", "Creature — Human Soldier", "{1}{W}", 2, 2);
const redGoblin = () => creature("Red Goblin", "Creature — Goblin", "{R}", 1, 1);
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The top spell on the stack, as a target. */
const topSpell = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice);
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);
/** Attackers declared, then everyone passes until `ap` has priority in the declare attackers step (triggers resolved). */
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], opts: Parameters<typeof settle>[1] = {}) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  return settle(s, opts);
};
const testShock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });

// Real oracle text (Scryfall).
const agrusKosWojekVeteran = card("Agrus Kos, Wojek Veteran", "Legendary Creature — Human Soldier", "{3}{R}{W}", { cmc: 5, power: "3", toughness: "3", colors: ["R", "W"], oracleText: "Whenever Agrus Kos attacks, attacking red creatures get +2/+0 and attacking white creatures get +0/+2 until end of turn." });
const ancientRunes = card("Ancient Runes", "Enchantment", "{2}{R}", { cmc: 3, oracleText: "At the beginning of each player's upkeep, this enchantment deals damage to that player equal to the number of artifacts they control." });
const armageddonClock = card("Armageddon Clock", "Artifact", "{6}", { cmc: 6, oracleText: "At the beginning of your upkeep, put a doom counter on this artifact.\nAt the beginning of your draw step, this artifact deals damage equal to the number of doom counters on it to each player.\n{4}: Remove a doom counter from this artifact. Any player may activate this ability but only during any upkeep step." });
const bladedBracers = card("Bladed Bracers", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nAs long as equipped creature is a Human or an Angel, it has vigilance.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" });
const bondsOfFaith = card("Bonds of Faith", "Enchantment — Aura", "{1}{W}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+2 as long as it's a Human. Otherwise, it can't attack or block." });
const boundByMoonsilver = card("Bound by Moonsilver", "Enchantment — Aura", "{2}{W}", { cmc: 3, keywords: ["Transform", "Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack, block, or transform.\nSacrifice another permanent: Attach this Aura to target creature. Activate only as a sorcery and only once each turn." });
const cactuar = card("Cactuar", "Creature — Plant", "{G}", { cmc: 1, power: "3", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nAt the beginning of your end step, if this creature didn't enter the battlefield this turn, return it to its owner's hand." });
const caseyJonesVigilante = card("Casey Jones, Vigilante", "Legendary Creature — Human Berserker", "{1}{R}{R}", { cmc: 3, power: "4", toughness: "3", oracleText: "When Casey Jones enters, draw three cards. At the beginning of your next upkeep, discard three cards at random." });
const coilingStalker = card("Coiling Stalker", "Creature — Snake Ninja", "{1}{G}", { cmc: 2, power: "2", toughness: "1", keywords: ["Ninjutsu"], oracleText: "Ninjutsu {1}{G} ({1}{G}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, put a +1/+1 counter on target creature you control that doesn't have a +1/+1 counter on it." });
const compellingDeterrence = card("Compelling Deterrence", "Instant", "{1}{U}", { cmc: 2, oracleText: "Return target nonland permanent to its owner's hand. Then that player discards a card if you control a Zombie." });
const compleatDevotion = card("Compleat Devotion", "Instant", "{1}{W}", { cmc: 2, oracleText: "Target creature you control gets +2/+2 until end of turn. If that creature has toxic, draw a card." });
const consumingAshes = card("Consuming Ashes", "Instant", "{2}{B}{B}", { cmc: 4, keywords: ["Surveil"], oracleText: "Exile target creature. If it had mana value 3 or less, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)" });
const cryptbornHorror = card("Cryptborn Horror", "Creature — Horror", "{1}{B/R}{B/R}", { cmc: 3, power: "0", toughness: "0", keywords: ["Trample"], colors: ["B", "R"], oracleText: "Trample\nThis creature enters with X +1/+1 counters on it, where X is the total life lost by your opponents this turn." });
const depressurize = card("Depressurize", "Instant", "{1}{B}", { cmc: 2, oracleText: "Target creature gets -3/-0 until end of turn. Then if that creature's power is 0 or less, destroy it." });
const divineSacrament = card("Divine Sacrament", "Enchantment", "{1}{W}{W}", { cmc: 3, keywords: ["Threshold"], oracleText: "White creatures get +1/+1.\nThreshold — White creatures get an additional +1/+1 as long as there are seven or more cards in your graveyard." });
const doomgape = card("Doomgape", "Creature — Elemental", "{4}{B/G}{B/G}{B/G}", { cmc: 7, power: "10", toughness: "10", keywords: ["Trample"], colors: ["B", "G"], oracleText: "Trample\nAt the beginning of your upkeep, sacrifice a creature. You gain life equal to that creature's toughness." });
const dragTheCanal = card("Drag the Canal", "Instant", "{U}{B}", { cmc: 2, keywords: ["Surveil", "Investigate"], colors: ["B", "U"], oracleText: "Create a 2/2 white and blue Detective creature token. If a creature died this turn, you gain 2 life, surveil 2, then investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const dramaticAccusation = card("Dramatic Accusation", "Enchantment — Aura", "{2}{U}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\n{U}{U}: Shuffle enchanted creature into its owner's library." });
const dueDiligence = card("Due Diligence", "Enchantment — Aura", "{2}{W}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, target creature you control other than enchanted creature gets +2/+2 and gains vigilance until end of turn.\nEnchanted creature gets +2/+2 and has vigilance." });
const egoDrain = card("Ego Drain", "Sorcery", "{B}", { cmc: 1, oracleText: "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. If you don't control a Faerie, exile a card from your hand." });
const errantry = card("Errantry", "Enchantment — Aura", "{1}{R}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +3/+0 and can only attack alone." });
const exile = card("Exile", "Instant", "{2}{W}", { cmc: 3, oracleText: "Exile target nonwhite attacking creature. You gain life equal to its toughness." });
const faerieMiscreant = card("Faerie Miscreant", "Creature — Faerie Rogue", "{U}", { cmc: 1, power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, if you control another creature named Faerie Miscreant, draw a card." });
const fearOfImmobility = card("Fear of Immobility", "Enchantment Creature — Nightmare", "{4}{W}", { cmc: 5, power: "4", toughness: "4", oracleText: "When this creature enters, tap up to one target creature. If an opponent controls that creature, put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const firstResponse = card("First Response", "Enchantment", "{3}{W}", { cmc: 4, oracleText: "At the beginning of each upkeep, if you lost life last turn, create a 1/1 white Soldier creature token." });
const flameSweep = card("Flame Sweep", "Instant", "{2}{R}", { cmc: 3, oracleText: "Flame Sweep deals 2 damage to each creature except for creatures you control with flying." });
const forceOfRage = card("Force of Rage", "Instant", "{1}{R}{R}", { cmc: 3, oracleText: "If it's not your turn, you may exile a red card from your hand rather than pay this spell's mana cost.\nCreate two 3/1 red Elemental creature tokens with trample and haste. Sacrifice those tokens at the beginning of your next upkeep." });
const forsakenCity = card("Forsaken City", "Land", "", { cmc: 0, oracleText: "This land doesn't untap during your untap step.\nAt the beginning of your upkeep, you may exile a card from your hand. If you do, untap this land.\n{T}: Add one mana of any color." });
const giantOpportunity = card("Giant Opportunity", "Sorcery", "{2}{G}", { cmc: 3, keywords: ["Food"], oracleText: "You may sacrifice two Foods. If you do, create a 7/7 green Giant creature token. Otherwise, create three Food tokens. (They're artifacts with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")" });
const goblinCaves = card("Goblin Caves", "Enchantment — Aura", "{1}{R}{R}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant land\nAs long as enchanted land is a basic Mountain, Goblin creatures get +0/+2." });
const goblinShrine = card("Goblin Shrine", "Enchantment — Aura", "{1}{R}{R}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant land\nAs long as enchanted land is a basic Mountain, Goblin creatures get +1/+0.\nWhen this Aura leaves the battlefield, it deals 1 damage to each Goblin creature." });
const greyKnightParagon = card("Grey Knight Paragon", "Creature — Astartes Knight", "{4}{W}", { cmc: 5, power: "4", toughness: "4", keywords: ["Rites of Banishment", "Flash"], oracleText: "Flash\nRites of Banishment — When this creature enters, destroy target attacking creature. If that creature is a Demon, exile it instead." });
const hidetsugusSecondRite = card("Hidetsugu's Second Rite", "Instant", "{3}{R}", { cmc: 4, oracleText: "If target player has exactly 10 life, Hidetsugu's Second Rite deals 10 damage to that player." });
const illvoiInfiltrator = card("Illvoi Infiltrator", "Creature — Jellyfish Rogue", "{2}{U}", { cmc: 3, power: "1", toughness: "3", oracleText: "This creature can't be blocked if you've cast two or more spells this turn.\nWhenever this creature deals combat damage to a player, draw a card." });
const insatiableAppetite = card("Insatiable Appetite", "Instant", "{1}{G}", { cmc: 2, oracleText: "You may sacrifice a Food. If you do, target creature gets +5/+5 until end of turn. Otherwise, that creature gets +3/+3 until end of turn." });
const karma = card("Karma", "Enchantment", "{2}{W}{W}", { cmc: 4, oracleText: "At the beginning of each player's upkeep, this enchantment deals damage to that player equal to the number of Swamps they control." });
const kjeldoranPride = card("Kjeldoran Pride", "Enchantment — Aura", "{1}{W}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+2.\n{2}{U}: Attach this Aura to target creature other than enchanted creature." });
const knightOfGrace = card("Knight of Grace", "Creature — Human Knight", "{1}{W}", { cmc: 2, power: "2", toughness: "2", keywords: ["Hexproof from", "Hexproof", "First strike"], oracleText: "First strike (This creature deals combat damage before creatures without first strike.)\nHexproof from black (This creature can't be the target of black spells or abilities your opponents control.)\nThis creature gets +1/+0 as long as any player controls a black permanent." });
const knightOfMalice = card("Knight of Malice", "Creature — Human Knight", "{1}{B}", { cmc: 2, power: "2", toughness: "2", keywords: ["Hexproof from", "Hexproof", "First strike"], oracleText: "First strike (This creature deals combat damage before creatures without first strike.)\nHexproof from white (This creature can't be the target of white spells or abilities your opponents control.)\nThis creature gets +1/+0 as long as any player controls a white permanent." });
const lashwhipPredator = card("Lashwhip Predator", "Creature — Plant Beast", "{4}{G}{G}", { cmc: 6, power: "5", toughness: "7", keywords: ["Reach"], oracleText: "This spell costs {2} less to cast if your opponents control three or more creatures.\nReach" });
const lithomanticBarrage = card("Lithomantic Barrage", "Sorcery", "{R}", { cmc: 1, oracleText: "This spell can't be countered.\nLithomantic Barrage deals 1 damage to target creature or planeswalker. It deals 5 damage instead if that target is white and/or blue." });
const melirasKeepers = card("Melira's Keepers", "Creature — Human Warrior", "{4}{G}", { cmc: 5, power: "4", toughness: "4", oracleText: "This creature can't have counters put on it." });
const mysteriosMirage = card("Mysterio's Mirage", "Enchantment", "{2}{U}", { cmc: 3, oracleText: "At the beginning of your end step, if you discarded a card this turn, create a 3/3 blue Illusion Villain creature token." });
const narcolepsy = card("Narcolepsy", "Enchantment — Aura", "{1}{U}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nAt the beginning of each upkeep, if enchanted creature is untapped, tap it." });
const noggleRansacker = card("Noggle Ransacker", "Creature — Noggle Rogue", "{2}{U/R}", { cmc: 3, power: "2", toughness: "1", colors: ["R", "U"], oracleText: "When this creature enters, each player draws two cards, then discards a card at random." });
const orimsPrayer = card("Orim's Prayer", "Enchantment", "{1}{W}{W}", { cmc: 3, oracleText: "Whenever one or more creatures attack you, you gain 1 life for each attacking creature." });
const overgrowthElemental = card("Overgrowth Elemental", "Creature — Elemental", "{2}{G}", { cmc: 3, power: "3", toughness: "2", oracleText: "When this creature enters, put a +1/+1 counter on another target Elemental you control.\nWhenever another creature you control dies, you gain 1 life. If that creature was an Elemental, put a +1/+1 counter on this creature." });
const paladinOfAtonement = card("Paladin of Atonement", "Creature — Vampire Knight", "{1}{W}", { cmc: 2, power: "1", toughness: "1", oracleText: "At the beginning of each upkeep, if you lost life last turn, put a +1/+1 counter on this creature.\nWhen this creature dies, you gain life equal to its toughness." });
const pippinsBravery = card("Pippin's Bravery", "Instant", "{G}", { cmc: 1, oracleText: "You may sacrifice a Food. If you do, target creature gets +4/+4 until end of turn. Otherwise, that creature gets +2/+2 until end of turn." });
const porcelainZealot = card("Porcelain Zealot", "Creature — Phyrexian Soldier", "{3}{W}", { cmc: 4, power: "2", toughness: "3", oracleText: "At the beginning of combat on your turn, target creature you control gets +1/+1 until end of turn. If that creature has toxic, instead it gets +2/+2 until end of turn." });
const powerstoneMinefield = card("Powerstone Minefield", "Enchantment", "{2}{R}{W}", { cmc: 4, colors: ["R", "W"], oracleText: "Whenever a creature attacks or blocks, this enchantment deals 2 damage to it." });
const priestOfTheWakeningSun = card("Priest of the Wakening Sun", "Creature — Human Cleric", "{W}", { cmc: 1, power: "1", toughness: "1", oracleText: "At the beginning of your upkeep, you may reveal a Dinosaur card from your hand. If you do, you gain 2 life.\n{3}{W}{W}, Sacrifice this creature: Search your library for a Dinosaur card, reveal it, put it into your hand, then shuffle." });
const recoil = card("Recoil", "Instant", "{1}{U}{B}", { cmc: 3, colors: ["B", "U"], oracleText: "Return target permanent to its owner's hand. Then that player discards a card." });
const regenerate = card("Regenerate", "Instant", "{1}{G}", { cmc: 2, keywords: ["Heal", "Regenerate"], oracleText: "Regenerate target creature. (The next time that creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)" });
const reveilleSquad = card("Reveille Squad", "Creature — Human Rebel", "{2}{W}{W}", { cmc: 4, power: "3", toughness: "3", oracleText: "Whenever one or more creatures attack you, if this creature is untapped, you may untap all creatures you control." });
const searchPartyCaptain = card("Search Party Captain", "Creature — Human Soldier", "{3}{W}", { cmc: 4, power: "2", toughness: "2", oracleText: "This spell costs {1} less to cast for each creature you attacked with this turn.\nWhen this creature enters, draw a card." });
const shatterskullCharger = card("Shatterskull Charger", "Creature — Giant Warrior", "{1}{R}{R}", { cmc: 3, power: "4", toughness: "3", keywords: ["Haste", "Trample", "Kicker"], oracleText: "Kicker {2}\nTrample, haste\nIf this creature was kicked, it enters with a +1/+1 counter on it.\nAt the beginning of your end step, if this creature doesn't have a +1/+1 counter on it, return it to its owner's hand." });
const sigilCaptain = card("Sigil Captain", "Creature — Rhino Soldier", "{1}{G}{W}{W}", { cmc: 4, power: "3", toughness: "3", colors: ["G", "W"], oracleText: "Whenever a creature you control enters, if that creature is 1/1, put two +1/+1 counters on it." });
const skullRend = card("Skull Rend", "Sorcery", "{3}{B}{R}", { cmc: 5, colors: ["B", "R"], oracleText: "Skull Rend deals 2 damage to each opponent. Those players each discard two cards at random." });
const statureSizeShifter = card("Stature, Size Shifter", "Legendary Creature — Human Hero", "{U}", { cmc: 1, power: "1", toughness: "1", keywords: ["Power-up"], oracleText: "Stature can't be blocked if her power is 1 or less.\nPower-up — {X}{U}{U}: Put X +1/+1 counters on Stature. (Activate each power-up ability only once. Reduce the cost by her mana cost if she entered this turn.)" });
const stayHiddenStaySilent = card("Stay Hidden, Stay Silent", "Enchantment — Aura", "{1}{U}", { cmc: 2, keywords: ["Manifest", "Enchant", "Manifest dread"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\n{4}{U}{U}: Shuffle enchanted creature into its owner's library, then manifest dread. Activate only as a sorcery." });
const tatterkite = card("Tatterkite", "Artifact Creature — Scarecrow", "{3}", { cmc: 3, power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nThis creature can't have counters put on it." });
const thunderSalvo = card("Thunder Salvo", "Instant", "{1}{R}", { cmc: 2, oracleText: "Thunder Salvo deals X damage to target creature, where X is 2 plus the number of other spells you've cast this turn." });
const tymaretCallsTheDead = card("Tymaret Calls the Dead", "Enchantment — Saga", "{2}{B}", { cmc: 3, keywords: ["Mill", "Scry"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Mill three cards. Then you may exile a creature or enchantment card from your graveyard. If you do, create a 2/2 black Zombie creature token.\nIII — You gain X life and scry X, where X is the number of Zombies you control." });
const unifiedWill = card("Unified Will", "Instant", "{1}{U}", { cmc: 2, oracleText: "Counter target spell if you control more creatures than that spell's controller." });
const whiplashVengefulEngineer = card("Whiplash, Vengeful Engineer", "Legendary Creature — Human Artificer Villain", "{B}", { cmc: 1, power: "2", toughness: "2", oracleText: "Whiplash enters tapped.\nWhenever Whiplash attacks, if he's equipped, each opponent loses X life and you gain X life, where X is the number of Equipment attached to him." });
const zephyrSentinel = card("Zephyr Sentinel", "Creature — Human Soldier", "{1}{U}", { cmc: 2, power: "2", toughness: "1", keywords: ["Flying", "Flash"], oracleText: "Flash\nFlying\nWhen this creature enters, return up to one other target creature you control to its owner's hand. If it was a Soldier, put a +1/+1 counter on this creature." });
const vileMutilator = card("Vile Mutilator", "Creature — Demon", "{5}{B}{B}", { cmc: 7, power: "6", toughness: "5", keywords: ["Flying", "Trample"], oracleText: "As an additional cost to cast this spell, sacrifice a creature or enchantment.\nFlying, trample\nWhen this creature enters, each opponent sacrifices a nontoken enchantment of their choice, then sacrifices a nontoken creature of their choice." });

describe("Statics that read the permanent, its host or the board", () => {
  it("are fully supported", () => supported(bladedBracers, bondsOfFaith, boundByMoonsilver, errantry, knightOfGrace, knightOfMalice, divineSacrament, goblinCaves, goblinShrine, melirasKeepers, tatterkite, statureSizeShifter, illvoiInfiltrator, lashwhipPredator, searchPartyCaptain, kjeldoranPride, dueDiligence, dramaticAccusation, stayHiddenStaySilent, narcolepsy));

  it("Knight of Malice gets +1/+0 only while any player controls a white permanent", () => {
    const { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, knightOfMalice);
    expect(pt(s, k)).toBe("2/2");
    putOnBattlefield(s, opp, whiteHuman());
    invalidateCharacteristics(s);
    expect(pt(s, k)).toBe("3/2");
  });

  it("Bladed Bracers: +1/+1 for anyone, vigilance only for a Human or an Angel", () => {
    const { s, ap } = setup([]);
    const human = putOnBattlefield(s, ap, whiteHuman());
    const bear = putOnBattlefield(s, ap, greenBear());
    attach(s, ap, bladedBracers, human);
    attach(s, ap, bladedBracers, bear);
    expect(pt(s, human)).toBe("3/3");
    expect(has(s, human, "Vigilance")).toBe(true);
    expect(pt(s, bear)).toBe("3/3");
    expect(has(s, bear, "Vigilance")).toBe(false);
  });

  it("Bonds of Faith: +2/+2 on a Human; any other creature can't attack or block", () => {
    const { s, ap, opp } = setup([]);
    const human = putOnBattlefield(s, ap, whiteHuman());
    const bear = putOnBattlefield(s, opp, greenBear());
    attach(s, ap, bondsOfFaith, human);
    attach(s, ap, bondsOfFaith, bear);
    expect(pt(s, human)).toBe("4/4");
    expect(chars(s, human).cantAttack).toBe(false);
    expect(pt(s, bear)).toBe("2/2");
    expect(chars(s, bear).cantAttack).toBe(true);
    expect(chars(s, bear).cantBlock).toBe(true);
  });

  it("Bound by Moonsilver: the creature can't attack, block or transform", () => {
    const werewolf = scry("transform", [
      { name: "Test Werewolf", mana_cost: "{1}{G}", type_line: "Creature — Human Werewolf", power: "2", toughness: "2" },
      { name: "Test Wolf", type_line: "Creature — Werewolf", power: "4", toughness: "4" },
    ]);
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, opp, werewolf);
    const free = putOnBattlefield(s, opp, werewolf);
    attach(s, ap, boundByMoonsilver, w);
    expect(chars(s, w).cantAttack).toBe(true);
    expect(chars(s, w).cantBlock).toBe(true);
    expect(transformPermanent(s, s.objects[w]!)).toBe(false);
    expect(transformPermanent(s, s.objects[free]!)).toBe(true);
  });

  it("Errantry: +3/+0, and the creature can only attack alone", () => {
    const { s, ap } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    attach(s, ap, errantry, bear);
    expect(pt(s, bear)).toBe("5/2");
    expect(compileCard(errantry).statics[0]!.mods).toContainEqual({ kind: "onlyAttacksAlone" });
  });

  it("Divine Sacrament: white creatures +1/+1, +2/+2 with threshold", () => {
    const { s, ap } = setup([]);
    const human = putOnBattlefield(s, ap, whiteHuman());
    const bear = putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, divineSacrament);
    expect(pt(s, human)).toBe("3/3");
    expect(pt(s, bear)).toBe("2/2");
    for (let i = 0; i < 7; i++) into(s, ap, greenBear(), "graveyard");
    expect(pt(s, human)).toBe("4/4");
  });

  it("Goblin Caves and Goblin Shrine pump Goblins only while on a basic Mountain", () => {
    const { s, ap, opp } = setup([]);
    const gob = putOnBattlefield(s, opp, redGoblin());
    const mtn = putOnBattlefield(s, ap, mountain);
    const fst = putOnBattlefield(s, ap, forest);
    const caves = attach(s, ap, goblinCaves, fst);
    expect(pt(s, gob)).toBe("1/1");
    s.objects[caves]!.attachedTo = mtn;
    invalidateCharacteristics(s);
    expect(pt(s, gob)).toBe("1/3");
    attach(s, ap, goblinShrine, mtn);
    expect(pt(s, gob)).toBe("2/3");
  });

  it("Melira's Keepers and Tatterkite can't have counters put on them", () => {
    const grow = card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter on target creature." });
    for (const def of [melirasKeepers, tatterkite]) {
      let { s, ap, ids } = setup([grow]);
      const k = putOnBattlefield(s, ap, def);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(k)])));
      expect(s.objects[k]!.counters["+1/+1"] ?? 0, def.name).toBe(0);
    }
  });

  it("Stature can't be blocked while its power is 1 or less", () => {
    const { s, ap } = setup([]);
    const st = putOnBattlefield(s, ap, statureSizeShifter);
    expect(chars(s, st).cantBeBlocked).toBe(true);
    s.objects[st]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(chars(s, st).cantBeBlocked).toBe(false);
  });

  it("Lashwhip Predator costs {2} less while your opponents control three or more creatures", () => {
    const { s, ap, opp, ids } = setup([lashwhipPredator]);
    const taps = (st: GameState) => planCast(st, ap, ids[0]!, [])!.filter((a) => a.type === "activateMana").length;
    putOnBattlefield(s, opp, greenBear());
    putOnBattlefield(s, opp, greenBear());
    invalidateCharacteristics(s);
    expect(taps(s)).toBe(6);
    putOnBattlefield(s, s.turnOrder[2]!, greenBear());
    invalidateCharacteristics(s);
    expect(taps(s)).toBe(4);
  });

  it("Search Party Captain costs {1} less for each creature you attacked with this turn", () => {
    let { s, ap, opp, ids } = setup([searchPartyCaptain]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    const taps = (st: GameState) => planCast(st, ap, ids[0]!, [])!.filter((x) => x.type === "activateMana").length;
    expect(taps(s)).toBe(4);
    s = attack(s, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    s = passUntil(s, "main2", ap);
    expect(taps(s)).toBe(2);
  });

  it("Narcolepsy taps the enchanted creature at the beginning of each upkeep, if it's untapped", () => {
    let { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, opp, greenBear());
    attach(s, ap, narcolepsy, bear);
    s = toUpkeep(s, opp);
    expect(s.objects[bear]!.tapped).toBe(true);
  });

  it("Due Diligence: the enters trigger can't target the enchanted creature", () => {
    const t = compileCard(dueDiligence).triggers[0]!.body.targets[0]!;
    expect(t).toMatchObject({ kind: "object", controller: "you", notSourceHost: true });
  });

  it("Kjeldoran Pride moves to another creature, not the one it's on", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    const pride = attach(s, ap, kjeldoranPride, a);
    expect(pt(s, a)).toBe("3/4");
    expect(planActivate(s, ap, pride, 0, [tgt(a)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, pride, 0, [tgt(b)])));
    expect(s.objects[pride]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/4");
  });

  it("Dramatic Accusation shuffles the enchanted creature into its owner's library", () => {
    let { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const aura = attach(s, ap, dramaticAccusation, bear);
    s = settle(run(s, planActivate(s, ap, aura, 0, [])));
    expect(zone(s, bear)).toBe("library");
    expect(s.players[opp]!.library).toContain(bear);
  });
});

describe("Upkeep, end step and draw step triggers", () => {
  it("are fully supported", () => supported(cactuar, shatterskullCharger, mysteriosMirage, firstResponse, paladinOfAtonement, karma, ancientRunes, armageddonClock, doomgape, caseyJonesVigilante, priestOfTheWakeningSun, forsakenCity, tymaretCallsTheDead, forceOfRage));

  it("Cactuar returns to hand at your end step unless it entered this turn", () => {
    let { s, ap, ids } = setup([cactuar]);
    const old = putOnBattlefield(s, ap, cactuar);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, old)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Shatterskull Charger returns at your end step only without a +1/+1 counter", () => {
    let { s, ap } = setup([]);
    const plain = putOnBattlefield(s, ap, shatterskullCharger);
    const grown = putOnBattlefield(s, ap, shatterskullCharger);
    s.objects[grown]!.counters["+1/+1"] = 1;
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, plain)).toBe("hand");
    expect(zone(s, grown)).toBe("battlefield");
  });

  it("Mysterio's Mirage makes a 3/3 Illusion at your end step only if you discarded a card this turn", () => {
    const rummage = card("Test Rummage", "Sorcery", "{R}", { cmc: 1, oracleText: "Discard a card, then draw a card." });
    for (const discard of [true, false]) {
      let { s, ap, ids } = setup([rummage, greenBear()]);
      putOnBattlefield(s, ap, mysteriosMirage);
      if (discard) s = settle(run(s, planCast(s, ap, ids[0]!, [])));
      s = settle(passUntil(s, "end", ap));
      expect(tokens(s, ap).length, `discarded ${discard}`).toBe(discard ? 1 : 0);
    }
  });

  it("First Response and Paladin of Atonement: at each upkeep, only if you lost life last turn", () => {
    const drain = card("Test Drain", "Sorcery", "{B}", { cmc: 1, oracleText: "You lose 2 life." });
    let { s, ap, opp, ids } = setup([drain]);
    putOnBattlefield(s, ap, firstResponse);
    const pal = putOnBattlefield(s, ap, paladinOfAtonement);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    s = toUpkeep(s, opp);
    expect(tokens(s, ap).length).toBe(1);
    expect(s.objects[pal]!.counters["+1/+1"]).toBe(1);
    // The opponent's turn cost you nothing: no more at the next upkeep.
    s = toUpkeep(s, s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    expect(tokens(s, ap).length).toBe(1);
    expect(s.objects[pal]!.counters["+1/+1"]).toBe(1);
  });

  it("Karma and Ancient Runes deal damage to the upkeep's player for their Swamps and artifacts", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, karma);
    putOnBattlefield(s, ap, ancientRunes);
    putOnBattlefield(s, opp, card("Swamp", "Basic Land — Swamp"));
    putOnBattlefield(s, opp, card("Swamp", "Basic Land — Swamp"));
    putOnBattlefield(s, opp, card("Test Relic", "Artifact", "{1}", { cmc: 1 }));
    s = toUpkeep(s, opp);
    expect(life(s, opp)).toBe(37);
  });

  it("Armageddon Clock: a doom counter each upkeep, then that much damage to each player in your draw step", () => {
    let { s, ap, opp } = setup([]);
    const clock = putOnBattlefield(s, ap, armageddonClock);
    s = toUpkeep(s, ap);
    expect(s.objects[clock]!.counters["doom"]).toBe(1);
    s = settle(passUntil(s, "main1", ap));
    expect(life(s, ap)).toBe(39);
    expect(life(s, opp)).toBe(39);
  });

  it("Doomgape: sacrifice a creature at your upkeep and gain life equal to its toughness", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, doomgape);
    const wall = putOnBattlefield(s, ap, creature("Test Wall", "Creature — Wall", "{1}{W}", 0, 5));
    s = toUpkeep(s, ap, { pick: [wall] });
    expect(zone(s, wall)).toBe("graveyard");
    expect(zone(s, g)).toBe("battlefield");
    expect(life(s, ap)).toBe(45);
  });

  it("Casey Jones: draw three when it enters, discard three at random at your next upkeep", () => {
    let { s, ap, ids } = setup([caseyJonesVigilante]);
    const before = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.hand.length).toBe(before + 2);
    // After the cleanup step's discard to seven.
    s = settle(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!));
    const atEnd = s.players[ap]!.hand.length;
    const yard = s.players[ap]!.graveyard.length;
    s = toUpkeep(s, ap);
    expect(s.players[ap]!.hand.length).toBe(atEnd - 3);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 3);
    // Only once.
    s = settle(passUntil(s, "main1", ap));
    const later = s.players[ap]!.graveyard.length;
    s = toUpkeep(s, ap);
    expect(s.players[ap]!.graveyard.length).toBe(later);
  });

  it("Priest of the Wakening Sun: reveal up to one Dinosaur at your upkeep to gain 2 life", () => {
    const dino = creature("Test Dinosaur", "Creature — Dinosaur", "{2}{G}", 4, 4);
    for (const reveal of [true, false]) {
      let { s, ap, ids } = setup([dino, dino]);
      putOnBattlefield(s, ap, priestOfTheWakeningSun);
      s = passUntil(s, "upkeep", ap);
      for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0, max: 1 });
      s = settle(s, { reveal: reveal ? [ids[0]!] : [] });
      expect(life(s, ap), `revealed ${reveal}`).toBe(reveal ? 42 : 40);
      expect(s.players[ap]!.hand).toContain(ids[0]!);
    }
  });

  it("Force of Rage's two Elementals are sacrificed at your next upkeep", () => {
    let { s, ap, ids } = setup([forceOfRage]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    const made = tokens(s, ap);
    expect(made.length).toBe(2);
    expect(pt(s, made[0]!)).toBe("3/1");
    s = settle(passUntil(s, "end", ap));
    expect(tokens(s, ap).length).toBe(2);
    s = toUpkeep(s, ap);
    expect(tokens(s, ap).length).toBe(0);
  });
});

describe("Enters, attack, block and death triggers", () => {
  it("are fully supported", () => supported(faerieMiscreant, sigilCaptain, overgrowthElemental, orimsPrayer, reveilleSquad, powerstoneMinefield, agrusKosWojekVeteran, whiplashVengefulEngineer, zephyrSentinel, fearOfImmobility, greyKnightParagon, noggleRansacker, cryptbornHorror, coilingStalker, vileMutilator));

  it("Faerie Miscreant draws a card only if you control another one", () => {
    let { s, ap, ids } = setup([faerieMiscreant, faerieMiscreant]);
    const hand0 = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1);
  });

  it("Sigil Captain puts two +1/+1 counters on a creature that enters as a 1/1, not on a 2/2", () => {
    let { s, ap, ids } = setup([redGoblin(), greenBear()]);
    putOnBattlefield(s, ap, sigilCaptain);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    expect(pt(s, ids[0]!)).toBe("3/3");
    expect(pt(s, ids[1]!)).toBe("2/2");
  });

  it("Overgrowth Elemental: 1 life when another creature you control dies, a counter if it was an Elemental", () => {
    const elemental = creature("Test Elemental", "Creature — Elemental", "{R}", 1, 1);
    let { s, ap, ids } = setup([testShock(), testShock()]);
    const og = putOnBattlefield(s, ap, overgrowthElemental);
    const bear = putOnBattlefield(s, ap, greenBear());
    const el = putOnBattlefield(s, ap, elemental);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect(life(s, ap)).toBe(41);
    expect(s.objects[og]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(el)])));
    expect(life(s, ap)).toBe(42);
    expect(s.objects[og]!.counters["+1/+1"]).toBe(1);
  });

  it("Orim's Prayer: 1 life for each creature attacking you", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, orimsPrayer);
    const a = putOnBattlefield(s, opp, greenBear());
    const b = putOnBattlefield(s, opp, greenBear());
    s = attack(s, opp, [{ attacker: a, defender: ap }, { attacker: b, defender: ap }]);
    expect(life(s, ap)).toBe(42);
  });

  it("Powerstone Minefield deals 2 damage to each attacking creature and each blocking creature", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, powerstoneMinefield);
    const att = putOnBattlefield(s, ap, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    const blk = putOnBattlefield(s, opp, creature("Test Wall", "Creature — Wall", "{1}{W}", 0, 5));
    s = attack(s, ap, [{ attacker: att, defender: opp }]);
    expect(s.objects[att]!.damage).toBe(2);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: blk, attacker: att }] });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    s = settle(s);
    expect(s.objects[blk]!.damage).toBe(2);
  });

  it("Agrus Kos: attacking red creatures get +2/+0 and attacking white ones +0/+2", () => {
    let { s, ap, opp } = setup([]);
    const agrus = putOnBattlefield(s, ap, agrusKosWojekVeteran);
    const gob = putOnBattlefield(s, ap, redGoblin());
    const human = putOnBattlefield(s, ap, whiteHuman());
    const home = putOnBattlefield(s, ap, redGoblin());
    s = attack(s, ap, [{ attacker: agrus, defender: opp }, { attacker: gob, defender: opp }, { attacker: human, defender: opp }]);
    expect(pt(s, agrus)).toBe("5/5");
    expect(pt(s, gob)).toBe("3/1");
    expect(pt(s, human)).toBe("2/4");
    expect(pt(s, home)).toBe("1/1");
  });

  it("Whiplash: when it attacks equipped, each opponent loses 1 life for each Equipment and you gain that much", () => {
    const sword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
    for (const equipped of [true, false]) {
      let { s, ap, opp } = setup([]);
      const w = putOnBattlefield(s, ap, whiplashVengefulEngineer);
      if (equipped) {
        attach(s, ap, sword, w);
        attach(s, ap, sword, w);
      }
      s = attack(s, ap, [{ attacker: w, defender: opp }]);
      for (const p of s.turnOrder) if (p !== ap) expect(life(s, p), `equipped ${equipped}`).toBe(equipped ? 38 : 40);
      expect(life(s, ap)).toBe(equipped ? 42 : 40);
    }
  });

  it("Zephyr Sentinel returns up to one other creature; a +1/+1 counter if it was a Soldier", () => {
    for (const def of [whiteHuman(), greenBear()]) {
      let { s, ap, ids } = setup([zephyrSentinel]);
      const back = putOnBattlefield(s, ap, def);
      s = settle(run(s, planCast(s, ap, ids[0]!, [])), { targets: [tgt(back)] });
      expect(zone(s, back)).toBe("hand");
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0, def.name).toBe(def.name === "White Human" ? 1 : 0);
    }
  });

  it("Fear of Immobility taps the target; a stun counter only if an opponent controls it", () => {
    for (const mine of [false, true]) {
      let { s, ap, opp, ids } = setup([fearOfImmobility]);
      const bear = putOnBattlefield(s, mine ? ap : opp, greenBear());
      s = settle(run(s, planCast(s, ap, ids[0]!, [])), { targets: [tgt(bear)] });
      expect(s.objects[bear]!.tapped).toBe(true);
      expect(s.objects[bear]!.counters["stun"] ?? 0, `mine ${mine}`).toBe(mine ? 0 : 1);
    }
  });

  it("Grey Knight Paragon destroys an attacking creature, or exiles it if it's a Demon", () => {
    const demon = creature("Test Demon", "Creature — Demon", "{2}{B}", 3, 3);
    for (const def of [greenBear(), demon]) {
      let { s, ap, opp, ids } = setup([greyKnightParagon]);
      const att = putOnBattlefield(s, opp, def);
      s = passUntil(s, "declareAttackers", opp);
      s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: att, defender: ap }] });
      for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = settle(run(s, planCast(s, ap, ids[0]!, [])), { targets: [tgt(att)] });
      expect(zone(s, att), def.name).toBe(def.name === "Test Demon" ? "exile" : "graveyard");
    }
  });

  it("Noggle Ransacker: each player draws two cards, then discards one at random", () => {
    let { s, ap, opp, ids } = setup([noggleRansacker]);
    const theirs = s.players[opp]!.hand.length;
    const mine = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
    // Noggle Ransacker left the hand: two drawn, one discarded.
    expect(s.players[ap]!.hand.length).toBe(mine);
    expect(s.players[opp]!.graveyard.length).toBe(1);
  });

  it("Cryptborn Horror enters with a +1/+1 counter for each life your opponents lost this turn", () => {
    let { s, ap, opp, ids } = setup([testShock(), testShock(), cryptbornHorror]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(s.turnOrder[2]!)])));
    s = settle(run(s, planCast(s, ap, ids[2]!, [])));
    expect(pt(s, ids[2]!)).toBe("4/4");
  });

  it("Vile Mutilator: each opponent sacrifices an enchantment, then a creature; you sacrifice nothing", () => {
    const fx = compileCard(vileMutilator).triggers[0]!.body.effects;
    expect(fx.length).toBe(2);
    for (const e of fx) expect(e).toMatchObject({ type: "pick", action: "sacrifice", who: { ref: "eachOpponent" } });
  });
});

describe("Spells: bounce and discard, damage by what the target is, life totals, sacrifices", () => {
  it("are fully supported", () => supported(recoil, compellingDeterrence, lithomanticBarrage, hidetsugusSecondRite, skullRend, unifiedWill, egoDrain, flameSweep, thunderSalvo, depressurize, consumingAshes, insatiableAppetite, pippinsBravery, giantOpportunity, compleatDevotion, porcelainZealot, dragTheCanal, exile, regenerate));

  it("Recoil returns the permanent, then its owner discards a card", () => {
    let { s, ap, opp, ids } = setup([recoil]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const hand = s.players[opp]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect(s.players[opp]!.hand.length).toBe(hand);
    expect(s.players[opp]!.graveyard.length).toBe(1);
  });

  it("Compelling Deterrence: the owner discards only if you control a Zombie", () => {
    for (const zombie of [true, false]) {
      let { s, ap, opp, ids } = setup([compellingDeterrence]);
      if (zombie) putOnBattlefield(s, ap, creature("Test Zombie", "Creature — Zombie", "{B}", 2, 2));
      const bear = putOnBattlefield(s, opp, greenBear());
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
      expect(zone(s, bear)).not.toBe("battlefield");
      expect(s.players[opp]!.graveyard.length, `zombie ${zombie}`).toBe(zombie ? 1 : 0);
    }
  });

  it("Lithomantic Barrage deals 1 damage, or 5 to a white and/or blue permanent", () => {
    let { s, ap, opp, ids } = setup([lithomanticBarrage, lithomanticBarrage]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const big = putOnBattlefield(s, opp, creature("Test Angel", "Creature — Angel", "{3}{W}", 4, 4));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect(s.objects[bear]!.damage).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(big)])));
    expect(zone(s, big)).toBe("graveyard");
  });

  it("Hidetsugu's Second Rite deals 10 damage only to a player at exactly 10 life", () => {
    for (const at of [10, 11]) {
      let { s, ap, opp, ids } = setup([hidetsugusSecondRite]);
      s.players[opp]!.life = at;
      s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
      expect(life(s, opp)).toBe(at === 10 ? 0 : 11);
    }
  });

  it("Skull Rend: 2 damage to each opponent, and each discards two cards at random", () => {
    let { s, ap, ids } = setup([skullRend]);
    const hands = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    s.turnOrder.forEach((p, i) => {
      if (p === ap) return;
      expect(life(s, p)).toBe(38);
      expect(s.players[p]!.hand.length).toBe(hands[i]! - 2);
    });
  });

  it("Unified Will counters a spell only if you control more creatures than its controller", () => {
    for (const more of [true, false]) {
      let { s, ap, opp, ids } = setup([unifiedWill]);
      putOnBattlefield(s, ap, greenBear());
      if (more) putOnBattlefield(s, ap, greenBear());
      putOnBattlefield(s, opp, greenBear());
      const shock = (() => {
        const id = putOnBattlefield(s, opp, testShock());
        s.battlefield.splice(s.battlefield.indexOf(id), 1);
        s.objects[id]!.zone = "hand";
        s.players[opp]!.hand.push(id);
        for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, mountain);
        invalidateCharacteristics(s);
        return id;
      })();
      s = passUntil(s, "main1", opp);
      s = run(s, planCast(s, opp, shock, [player(ap)]));
      for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = settle(run(s, planCast(s, ap, ids[0]!, [topSpell(s)])));
      expect(life(s, ap), `more ${more}`).toBe(more ? 40 : 38);
    }
  });

  it("Ego Drain: you choose a nonland card to discard, then exile a card from your hand without a Faerie", () => {
    for (const faerie of [false, true]) {
      let { s, ap, opp, ids } = setup([egoDrain]);
      if (faerie) putOnBattlefield(s, ap, faerieMiscreant);
      s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
      for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
      const p = s.pending as { cards: string[] };
      const chosen = p.cards[0]!;
      const hand = s.players[ap]!.hand.length;
      s = act(s, { type: "searchLibrary", player: ap, found: [chosen] });
      if (!faerie) expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1, exile: true });
      s = settle(s);
      expect(zone(s, chosen)).toBe("graveyard");
      expect(s.players[ap]!.hand.length, `faerie ${faerie}`).toBe(faerie ? hand : hand - 1);
      expect(s.players[ap]!.exile.length).toBe(faerie ? 0 : 1);
    }
  });

  it("Flame Sweep: 2 damage to each creature except your own fliers", () => {
    let { s, ap, opp, ids } = setup([flameSweep]);
    const myBird = putOnBattlefield(s, ap, blueBird());
    const myBear = putOnBattlefield(s, ap, greenBear());
    const theirBird = putOnBattlefield(s, opp, blueBird());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, myBird)).toBe("battlefield");
    expect(zone(s, myBear)).toBe("graveyard");
    expect(zone(s, theirBird)).toBe("graveyard");
  });

  it("Thunder Salvo deals 2 plus the number of other spells you've cast this turn", () => {
    let { s, ap, opp, ids } = setup([testShock(), thunderSalvo]);
    const big = putOnBattlefield(s, opp, creature("Test Giant", "Creature — Giant", "{4}", 4, 6));
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(big)])));
    expect(s.objects[big]!.damage).toBe(3);
  });

  it("Depressurize destroys the creature only if its power is then 0 or less", () => {
    let { s, ap, opp, ids } = setup([depressurize, depressurize]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const big = putOnBattlefield(s, opp, creature("Test Giant", "Creature — Giant", "{4}", 4, 6));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(big)])));
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
    expect(pt(s, big)).toBe("1/6");
  });

  it("Insatiable Appetite: +5/+5 if you sacrificed a Food, otherwise +3/+3", () => {
    const food = card("Food", "Token Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." });
    for (const sac of [true, false]) {
      let { s, ap, ids } = setup([insatiableAppetite]);
      putOnBattlefield(s, ap, food);
      const bear = putOnBattlefield(s, ap, greenBear());
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])), { yes: sac });
      expect(pt(s, bear), `sacrificed ${sac}`).toBe(sac ? "7/7" : "5/5");
    }
  });

  it("Giant Opportunity without two Foods makes three Foods", () => {
    let { s, ap, ids } = setup([giantOpportunity]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { yes: false });
    expect(tokens(s, ap).length).toBe(3);
  });

  it("Compleat Devotion draws a card only if the creature has toxic", () => {
    const toxic = creature("Test Toxic", "Creature — Phyrexian", "{G}", 1, 1, { keywords: ["Toxic"], oracleText: "Toxic 1" });
    for (const def of [toxic, greenBear()]) {
      let { s, ap, ids } = setup([compleatDevotion]);
      const c = putOnBattlefield(s, ap, def);
      const hand = s.players[ap]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(pt(s, c)).toBe(def === toxic ? "3/3" : "4/4");
      expect(s.players[ap]!.hand.length, def.name).toBe(def === toxic ? hand : hand - 1);
    }
  });
});
