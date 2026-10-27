// Lane B, round 6: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, forest, island, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { blockProblem, botActions, characteristics, compileCard, harmfulTargets, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { potentialAttackers } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a
 * punisher's player in `payers` pays (with their lands), the others don't. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; payers?: PlayerId[] } = {}) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "chooseOption" && p.what === "punisher") s = act(s, { type: "chooseOption", player: p.player, choice: opts.payers?.includes(p.player) ? p.options[0]! : "none" });
    else if (p?.kind === "payUnless") {
      const yes = !!opts.payers?.includes(p.player);
      s = run(s, [...(yes && p.cost ? planMana(s, p.player, parseManaCost(p.cost))! : []), { type: "payUnless", player: p.player, pay: yes }]);
    } else if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: p.player, top: p.cards, away: [] });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Attackers declared, the game paused on the defending player's blocks (or on a target for an attack trigger). */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], targets?: TargetChoice[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.pending?.kind === "chooseTargets" && targets) s = act(s, { type: "chooseTargets", player: s.pending.player, targets } as Action);
    else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);

const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The top spell on the stack, as a target. */
const topSpell = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice);

// Real oracle text (Scryfall).
const rayOfRuin = card("Ray of Ruin", "Sorcery", "{4}{B}", { cmc: 5, keywords: ["Scry"], oracleText: "Exile target creature, Vehicle, or nonbasic land. Scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
const electrostaticBolt = card("Electrostatic Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Electrostatic Bolt deals 2 damage to target creature. If it's an artifact creature, Electrostatic Bolt deals 4 damage to it instead." });
const purifyingDragon = card("Purifying Dragon", "Creature — Dragon", "{3}{R}{R}", { cmc: 5, power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, it deals 1 damage to target creature defending player controls. If that creature is a Zombie, this creature deals 2 damage to it instead." });
const rendingFlame = card("Rending Flame", "Instant", "{2}{R}", { cmc: 3, oracleText: "Rending Flame deals 5 damage to target creature or planeswalker. If that permanent is a Spirit, Rending Flame also deals 2 damage to that permanent's controller." });
const rayOfEnfeeblement = card("Ray of Enfeeblement", "Instant", "{B}", { cmc: 1, oracleText: "Target creature gets -4/-1 until end of turn. If that creature is white, it gets -4/-4 until end of turn instead." });
const wakandanRoyalGuard = card("Wakandan Royal Guard", "Creature — Human Soldier Hero", "{4}{G}", { cmc: 5, power: "4", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, put a +1/+1 counter on target creature. If that creature is another Hero, put two +1/+1 counters on it instead." });
const oversoulOfDusk = card("Oversoul of Dusk", "Creature — Spirit Avatar", "{G/W}{G/W}{G/W}{G/W}{G/W}", { cmc: 5, power: "5", toughness: "5", keywords: ["Protection"], oracleText: "Protection from blue, from black, and from red" });
const tsaboTavoc = card("Tsabo Tavoc", "Legendary Creature — Phyrexian Horror", "{5}{B}{R}", { cmc: 7, power: "7", toughness: "4", keywords: ["First strike","Protection"], oracleText: "First strike, protection from legendary creatures\n{B}{B}, {T}: Destroy target legendary creature. It can't be regenerated." });
const harbingerOfSpring = card("Harbinger of Spring", "Creature — Spirit", "{4}{G}", { cmc: 5, power: "2", toughness: "1", keywords: ["Protection","Soulshift"], oracleText: "Protection from non-Spirit creatures\nSoulshift 4 (When this creature dies, you may return target Spirit card with mana value 4 or less from your graveyard to your hand.)" });
const inOketrasName = card("In Oketra's Name", "Instant", "{1}{W}", { cmc: 2, oracleText: "Zombies you control get +2/+1 until end of turn. Other creatures you control get +1/+1 until end of turn." });
const sigilBlessing = card("Sigil Blessing", "Instant", "{G}{W}", { cmc: 2, oracleText: "Until end of turn, target creature you control gets +3/+3 and other creatures you control get +1/+1." });
const joinForces = card("Join Forces", "Instant", "{2}{W}", { cmc: 3, oracleText: "Untap up to two target creatures. They each get +2/+2 until end of turn." });
const ridingTheDiluHorse = card("Riding the Dilu Horse", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Target creature gets +2/+2 and gains horsemanship. (It can't be blocked except by creatures with horsemanship. This effect lasts indefinitely.)" });
const agility = card("Agility", "Enchantment — Aura", "{1}{R}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1 and has flanking. (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)" });
const vectisGloves = card("Vectis Gloves", "Artifact — Equipment", "{2}", { cmc: 2, keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0 and has artifact landwalk. (It can't be blocked as long as defending player controls an artifact land.)\nEquip {2}" });
const vex = card("Vex", "Instant", "{2}{U}", { cmc: 3, oracleText: "Counter target spell. That spell's controller may draw a card." });
const suffocatingBlast = card("Suffocating Blast", "Instant", "{1}{U}{U}{R}", { cmc: 4, oracleText: "Counter target spell and Suffocating Blast deals 3 damage to target creature." });
const outwit = card("Outwit", "Instant", "{U}", { cmc: 1, oracleText: "Counter target spell that targets a player." });
const turnToSlag = card("Turn to Slag", "Sorcery", "{3}{R}{R}", { cmc: 5, oracleText: "Turn to Slag deals 5 damage to target creature. Destroy all Equipment attached to that creature." });
const blastfireBolt = card("Blastfire Bolt", "Instant", "{5}{R}", { cmc: 6, oracleText: "Blastfire Bolt deals 5 damage to target creature. Destroy all Equipment attached to that creature." });
const hubris = card("Hubris", "Instant", "{1}{U}", { cmc: 2, oracleText: "Return target creature and all Auras attached to it to their owners' hands." });

// Second batch (real oracle text, Scryfall).
const eliteInquisitor = card("Elite Inquisitor", "Creature — Human Soldier", "{W}{W}", { cmc: 2, power: "2", toughness: "2", keywords: ["Vigilance","First strike","Protection"], oracleText: "First strike, vigilance\nProtection from Vampires, from Werewolves, and from Zombies" });
const jabarisBanner = card("Jabari's Banner", "Artifact", "{2}", { cmc: 2, oracleText: "{1}, {T}: Target creature gains flanking until end of turn. (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)" });
const sidewinderSliver = card("Sidewinder Sliver", "Creature — Sliver", "{W}", { cmc: 1, power: "1", toughness: "1", oracleText: "All Sliver creatures have flanking. (Whenever a creature without flanking blocks a Sliver, the blocking creature gets -1/-1 until end of turn.)" });
const spareFromEvil = card("Spare from Evil", "Instant", "{1}{W}", { cmc: 2, oracleText: "Creatures you control gain protection from non-Human creatures until end of turn." });
const synchronizedStrike = card("Synchronized Strike", "Instant", "{2}{G}", { cmc: 3, oracleText: "Untap up to two target creatures. They each get +2/+2 until end of turn." });
const crumble = card("Crumble", "Instant", "{G}", { cmc: 1, oracleText: "Destroy target artifact. It can't be regenerated. That artifact's controller gains life equal to its mana value." });
const coercedConfession = card("Coerced Confession", "Sorcery", "{4}{U/B}", { cmc: 5, keywords: ["Mill"], oracleText: "Target player mills four cards. You draw a card for each creature card put into their graveyard this way." });
const balanceOfPower = card("Balance of Power", "Sorcery", "{3}{U}{U}", { cmc: 5, oracleText: "If target opponent has more cards in hand than you, draw cards equal to the difference." });
const darkSuspicions = card("Dark Suspicions", "Enchantment", "{2}{B}{B}", { cmc: 4, oracleText: "At the beginning of each opponent's upkeep, that player loses X life, where X is the number of cards in that player's hand minus the number of cards in your hand." });
const heroicCharge = card("Heroic Charge", "Instant", "{2}{W}{W}", { cmc: 4, keywords: ["Kicker"], oracleText: "Kicker {1}{R} (You may pay an additional {1}{R} as you cast this spell.)\nCreatures you control get +2/+1 until end of turn. If this spell was kicked, those creatures also gain trample until end of turn." });
const clipWings = card("Clip Wings", "Instant", "{1}{G}", { cmc: 2, oracleText: "Each opponent sacrifices a creature of their choice with flying." });
const vengefulWarchief = card("Vengeful Warchief", "Creature — Orc Warrior", "{4}{B}", { cmc: 5, power: "4", toughness: "4", oracleText: "Whenever you lose life for the first time each turn, put a +1/+1 counter on this creature. (Damage causes loss of life.)" });
const steelDromedary = card("Steel Dromedary", "Artifact Creature — Camel", "{3}", { cmc: 3, power: "2", toughness: "2", oracleText: "This creature enters tapped with two +1/+1 counters on it.\nThis creature doesn't untap during your untap step if it has a +1/+1 counter on it.\nAt the beginning of combat on your turn, you may move a +1/+1 counter from this creature onto target creature." });
const aliriosEnraptured = card("Alirios, Enraptured", "Legendary Creature — Human", "{2}{U}", { cmc: 3, power: "2", toughness: "3", oracleText: "Alirios enters tapped.\nAlirios doesn't untap during your untap step if you control a Reflection.\nWhen Alirios enters, create a 3/2 blue Reflection creature token." });
const heartmender = card("Heartmender", "Creature — Elemental", "{2}{G/W}{G/W}", { cmc: 4, power: "2", toughness: "2", keywords: ["Persist"], oracleText: "At the beginning of your upkeep, remove a -1/-1 counter from each creature you control.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)" });
const deathknellBerserker = card("Deathknell Berserker", "Creature — Elf Berserker", "{1}{B}", { cmc: 2, power: "2", toughness: "2", oracleText: "When this creature dies, if its power was 3 or greater, create a 2/2 black Zombie Berserker creature token." });
const warrenPilferers = card("Warren Pilferers", "Creature — Goblin Rogue", "{4}{B}", { cmc: 5, power: "3", toughness: "3", oracleText: "When this creature enters, return target creature card from your graveyard to your hand. If that card is a Goblin card, this creature gains haste until end of turn." });
const bonecladNecromancer = card("Boneclad Necromancer", "Creature — Human Wizard", "{3}{B}{B}", { cmc: 5, power: "3", toughness: "3", oracleText: "When this creature enters, you may exile target creature card from a graveyard. If you do, create a 2/2 black Zombie creature token." });
const predatoryAdvantage = card("Predatory Advantage", "Enchantment", "{3}{R}{G}", { cmc: 5, oracleText: "At the beginning of each opponent's end step, if that player didn't cast a creature spell this turn, create a 2/2 green Lizard creature token." });
const impatience = card("Impatience", "Enchantment", "{2}{R}", { cmc: 3, oracleText: "At the beginning of each player's end step, if that player didn't cast a spell this turn, this enchantment deals 2 damage to that player." });
const wranglerOfTheDamned = card("Wrangler of the Damned", "Creature — Human Soldier", "{3}{W}{U}", { cmc: 5, power: "1", toughness: "4", keywords: ["Flash"], oracleText: "Flash\nAt the beginning of your end step, if you haven't cast a spell from your hand this turn, create a 2/2 white Spirit creature token with flying." });
const twinnedVision = card("Twinned Vision", "Instant", "{1}{U/R}", { cmc: 2, keywords: ["Flashback"], oracleText: "Draw a card. If this spell wasn't cast from your hand, draw two cards instead.\nFlashback—{1}{U/R}{U/R}, Discard a card. (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const carnageInterpreter = card("Carnage Interpreter", "Creature — Devil Detective", "{1}{B/R}{B/R}", { cmc: 3, power: "3", toughness: "3", keywords: ["Investigate"], oracleText: "When this creature enters, discard your hand, then investigate four times. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nAs long as you have one or fewer cards in hand, this creature gets +2/+2 and has menace." });
const unagisSpray = card("Unagi's Spray", "Instant", "{U}", { cmc: 1, oracleText: "Target creature gets -4/-0 until end of turn. If you control a Fish, Octopus, Otter, Seal, Serpent, or Whale, draw a card." });
const revelationOfPower = card("Revelation of Power", "Instant", "{1}{W}", { cmc: 2, oracleText: "Target creature gets +2/+2 until end of turn. If it has a counter on it, it also gains flying and lifelink until end of turn." });
const oilGorgerTroll = card("Oil-Gorger Troll", "Creature — Phyrexian Troll Warrior", "{3}{G}{G}", { cmc: 5, power: "3", toughness: "4", oracleText: "When this creature enters, you gain 3 life. Then if you control a permanent with an oil counter on it, draw a card." });
const cinderslashRavager = card("Cinderslash Ravager", "Creature — Phyrexian Warrior", "{4}{R}{G}", { cmc: 6, power: "5", toughness: "5", keywords: ["Vigilance"], oracleText: "This spell costs {1} less to cast for each permanent you control with oil counters on it.\nVigilance\nWhen this creature enters, it deals 1 damage to each creature your opponents control." });
const pyrophobia = card("Pyrophobia", "Sorcery", "{1}{R}", { cmc: 2, oracleText: "Pyrophobia deals 3 damage to target creature. Cowards can't block this turn." });
const goblinLocksmith = card("Goblin Locksmith", "Creature — Goblin Rogue", "{1}{R}", { cmc: 2, power: "2", toughness: "1", oracleText: "Whenever this creature attacks, creatures with defender can't block this turn." });
const blaringCaptain = card("Blaring Captain", "Creature — Azra Warrior", "{3}{B}", { cmc: 4, power: "2", toughness: "2", keywords: ["Partner with","Partner"], oracleText: "Partner with Blaring Recruiter (When this creature enters, target player may put Blaring Recruiter into their hand from their library, then shuffle.)\nWhenever this creature attacks, attacking Warriors get +1/+1 until end of turn." });
const jacesDefeat = card("Jace's Defeat", "Instant", "{1}{U}", { cmc: 2, keywords: ["Scry"], oracleText: "Counter target blue spell. If it was a Jace planeswalker spell, scry 2." });
const gideonsDefeat = card("Gideon's Defeat", "Instant", "{W}", { cmc: 1, oracleText: "Exile target white creature that's attacking or blocking. If it was a Gideon planeswalker, you gain 5 life." });
const attendedHealer = card("Attended Healer", "Creature — Kor Cleric", "{3}{W}", { cmc: 4, power: "2", toughness: "3", oracleText: "Whenever you gain life for the first time each turn, create a 1/1 white Cat creature token.\n{2}{W}: Another target Cleric gains lifelink until end of turn." });
const bloodAgeGeneral = card("Blood Age General", "Creature — Spirit Warrior", "{1}{R}", { cmc: 2, power: "2", toughness: "2", oracleText: "{T}: Attacking Spirits get +1/+0 until end of turn." });
const canyonCrab = card("Canyon Crab", "Creature — Crab", "{1}{U}", { cmc: 2, power: "0", toughness: "5", oracleText: "{1}{U}: This creature gets +2/-2 until end of turn.\nAt the beginning of your end step, if you haven't cast a spell from your hand this turn, draw a card, then discard a card." });
const carrionImp = card("Carrion Imp", "Creature — Imp", "{3}{B}", { cmc: 4, power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may exile target creature card from a graveyard. If you do, you gain 2 life." });
const clericOfLifesBond = card("Cleric of Life's Bond", "Creature — Vampire Cleric", "{W}{B}", { cmc: 2, power: "2", toughness: "2", oracleText: "Whenever another Cleric you control enters, you gain 1 life.\nWhenever you gain life for the first time each turn, put a +1/+1 counter on this creature." });
const confirmSuspicions = card("Confirm Suspicions", "Instant", "{3}{U}{U}", { cmc: 5, keywords: ["Investigate"], oracleText: "Counter target spell.\nInvestigate three times. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const detonate = card("Detonate", "Sorcery", "{X}{R}", { cmc: 1, oracleText: "Destroy target artifact with mana value X. It can't be regenerated. Detonate deals X damage to that artifact's controller." });
const gontisMachinations = card("Gonti's Machinations", "Enchantment", "{B}", { cmc: 1, oracleText: "Whenever you lose life for the first time each turn, you get {E}. (You get an energy counter. Damage causes loss of life.)\nPay {E}{E}, Sacrifice this enchantment: Each opponent loses 3 life. You gain life equal to the life lost this way." });
const heroOfOxidRidge = card("Hero of Oxid Ridge", "Creature — Human Knight", "{2}{R}{R}", { cmc: 4, power: "4", toughness: "2", keywords: ["Battle Cry","Haste"], oracleText: "Haste\nBattle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)\nWhenever this creature attacks, creatures with power 1 or less can't block this turn." });
const jemLightfooteSkyExplorer = card("Jem Lightfoote, Sky Explorer", "Legendary Creature — Human Scout", "{2}{W}{U}", { cmc: 4, power: "3", toughness: "3", keywords: ["Flying","Vigilance"], oracleText: "Flying, vigilance\nAt the beginning of your end step, if you haven't cast a spell from your hand this turn, draw a card." });
const kuldothaCackler = card("Kuldotha Cackler", "Creature — Phyrexian Hyena", "{2}{R}", { cmc: 3, power: "2", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the number of permanents you control with oil counters on them." });
const marduWoeReaper = card("Mardu Woe-Reaper", "Creature — Human Warrior", "{W}", { cmc: 1, power: "2", toughness: "1", oracleText: "Whenever this creature or another Warrior you control enters, you may exile target creature card from a graveyard. If you do, you gain 1 life." });
const mournwillow = card("Mournwillow", "Creature — Plant Skeleton", "{1}{B}{G}", { cmc: 3, power: "3", toughness: "2", keywords: ["Delirium","Haste"], oracleText: "Haste\nDelirium — When this creature enters, if there are four or more card types among cards in your graveyard, creatures with power 2 or less can't block this turn." });
const patientRebuilding = card("Patient Rebuilding", "Enchantment", "{3}{U}{U}", { cmc: 5, keywords: ["Mill"], oracleText: "At the beginning of your upkeep, target opponent mills three cards, then you draw a card for each land card put into their graveyard this way." });
const runAfoul = card("Run Afoul", "Instant", "{G}", { cmc: 1, oracleText: "Target opponent sacrifices a creature of their choice with flying." });
const sance = card("Séance", "Enchantment", "{2}{W}{W}", { cmc: 4, oracleText: "At the beginning of each upkeep, you may exile target creature card from your graveyard. If you do, create a token that's a copy of that card, except it's a Spirit in addition to its other types. Exile it at the beginning of the next end step." });
const seismicElemental = card("Seismic Elemental", "Creature — Elemental", "{3}{R}{R}", { cmc: 5, power: "4", toughness: "4", oracleText: "When this creature enters, creatures without flying can't block this turn." });
const smashToSmithereens = card("Smash to Smithereens", "Instant", "{1}{R}", { cmc: 2, oracleText: "Destroy target artifact. Smash to Smithereens deals 3 damage to that artifact's controller." });
const urabrasksAnointer = card("Urabrask's Anointer", "Artifact Creature — Phyrexian Wizard", "{3}{R}", { cmc: 4, power: "4", toughness: "2", oracleText: "When this creature enters, it deals X damage to any target, where X is the number of permanents you control with oil counters on them." });
const vanguardSeraph = card("Vanguard Seraph", "Creature — Angel Warrior", "{3}{W}", { cmc: 4, power: "3", toughness: "3", keywords: ["Flying","Surveil"], oracleText: "Flying\nWhenever you gain life for the first time each turn, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)" });

describe("Riders checked as the spell resolves: what the creature or permanent is (CR 608.2c)", () => {
  it("are fully supported", () => supported(rayOfRuin, electrostaticBolt, purifyingDragon, rendingFlame, rayOfEnfeeblement, wakandanRoyalGuard));

  it("Ray of Ruin exiles a creature, a Vehicle or a nonbasic land, not a basic land, then scries 1", () => {
    let { s, ap, opp, ids } = setup([rayOfRuin, rayOfRuin]);
    const vehicle = putOnBattlefield(s, opp, card("Test Wagon", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1", keywords: ["Crew"] }));
    const nonbasic = putOnBattlefield(s, opp, card("Test Fortress", "Land", "", { oracleText: "{T}: Add {C}." }));
    const basic = putOnBattlefield(s, opp, swamp);
    expect(planCast(s, ap, ids[0]!, [tgt(basic)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(vehicle)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(nonbasic)])));
    expect(zone(s, vehicle)).toBe("exile");
    expect(zone(s, nonbasic)).toBe("exile");
  });

  it("Electrostatic Bolt deals 4 to an artifact creature, 2 to another", () => {
    let { s, ap, opp, ids } = setup([electrostaticBolt, electrostaticBolt]);
    const golem = putOnBattlefield(s, opp, creature("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3));
    const ogre = putOnBattlefield(s, opp, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(golem)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ogre)])));
    expect(zone(s, golem)).toBe("graveyard");
    expect(s.objects[ogre]!.damage).toBe(2);
  });

  it("Purifying Dragon deals 2 to a Zombie, 1 to anything else", () => {
    for (const zombie of [false, true]) {
      let { s, ap, opp } = setup([]);
      const d = putOnBattlefield(s, ap, purifyingDragon);
      const c = putOnBattlefield(s, opp, creature("Test Walker", zombie ? "Creature — Zombie" : "Creature — Human", "{2}{B}", 1, 4));
      s = toBlocks(s, ap, [{ attacker: d, defender: opp }], [tgt(c)]);
      expect(s.objects[c]!.damage).toBe(zombie ? 2 : 1);
    }
  });

  it("Rending Flame also deals 2 to the controller of a Spirit", () => {
    for (const spirit of [false, true]) {
      let { s, ap, opp, ids } = setup([rendingFlame]);
      const c = putOnBattlefield(s, opp, creature("Test Ghost", spirit ? "Creature — Spirit" : "Creature — Bird", "{2}{W}", 6, 6));
      const life0 = life(s, opp);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(s.objects[c]!.damage).toBe(5);
      expect(life(s, opp)).toBe(life0 - (spirit ? 2 : 0));
    }
  });

  it("Ray of Enfeeblement gives a white creature -4/-4, any other -4/-1", () => {
    let { s, ap, opp, ids } = setup([rayOfEnfeeblement, rayOfEnfeeblement]);
    const white = putOnBattlefield(s, opp, creature("Test Knight", "Creature — Human Knight", "{3}{W}", 5, 5));
    const green = putOnBattlefield(s, opp, creature("Test Beast", "Creature — Beast", "{3}{G}", 5, 5));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(white)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(green)])));
    expect(pt(s, white)).toBe("1/1");
    expect(pt(s, green)).toBe("1/4");
  });

  it("Wakandan Royal Guard puts two counters on another Hero, one on itself or a non-Hero", () => {
    for (const on of ["hero", "self", "other"] as const) {
      let { s, ap, ids } = setup([wakandanRoyalGuard]);
      const hero = putOnBattlefield(s, ap, creature("Test Hero", "Creature — Human Hero", "{1}{W}", 2, 2));
      const bear0 = putOnBattlefield(s, ap, greenBear());
      s = run(s, planCast(s, ap, ids[0]!));
      const who = on === "hero" ? hero : on === "self" ? ids[0]! : bear0;
      s = settle(s, { targets: [tgt(who)] });
      expect(s.objects[who]!.counters["+1/+1"] ?? 0).toBe(on === "hero" ? 2 : 1);
    }
  });
});

describe("Protection lists, from legendary creatures and from non-Spirit creatures (CR 702.16)", () => {
  it("are fully supported", () => supported(oversoulOfDusk, tsaboTavoc, harbingerOfSpring));

  it("Oversoul of Dusk has protection from blue, black and red", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, oversoulOfDusk);
    for (const c of ["blue", "black", "red"]) expect(has(s, o, `Protection from ${c}`)).toBe(true);
    expect(has(s, o, "Protection from green")).toBe(false);
  });

  it("Tsabo Tavoc can't be blocked by a legendary creature; Harbinger of Spring only by Spirits (and changelings)", () => {
    let { s, ap, opp } = setup([]);
    const tsabo = putOnBattlefield(s, ap, tsaboTavoc);
    const harb = putOnBattlefield(s, ap, harbingerOfSpring);
    const legend = putOnBattlefield(s, opp, creature("Test Legend", "Legendary Creature — Human", "{1}{W}", 2, 2));
    const plain = putOnBattlefield(s, opp, greenBear());
    const spirit = putOnBattlefield(s, opp, creature("Test Spirit", "Creature — Spirit", "{1}{W}", 1, 1));
    const shifter = putOnBattlefield(s, opp, creature("Test Shifter", "Creature — Shapeshifter", "{1}{U}", 1, 1, { keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    s = toBlocks(s, ap, [{ attacker: tsabo, defender: opp }, { attacker: harb, defender: opp }]);
    const o = (id: string) => s.objects[id]!;
    expect(blockProblem(s, o(legend), o(tsabo))).not.toBeNull();
    expect(blockProblem(s, o(plain), o(tsabo))).toBeNull();
    expect(blockProblem(s, o(plain), o(harb))).not.toBeNull();
    expect(blockProblem(s, o(legend), o(harb))).not.toBeNull();
    expect(blockProblem(s, o(spirit), o(harb))).toBeNull();
    expect(blockProblem(s, o(shifter), o(harb))).toBeNull();
  });

  it("damage from a legendary creature to Tsabo Tavoc is prevented", () => {
    let { s, ap, opp } = setup([]);
    const tsabo = putOnBattlefield(s, opp, tsaboTavoc);
    const legend = putOnBattlefield(s, ap, creature("Test Legend", "Legendary Creature — Human", "{1}{W}", 2, 2));
    s = toBlocks(s, ap, [{ attacker: legend, defender: opp }]);
    expect(blockProblem(s, s.objects[tsabo]!, s.objects[legend]!)).toBeNull();
    s = block(s, opp, [{ blocker: tsabo, attacker: legend }]);
    s = passUntil(s, "end", ap);
    expect(s.objects[tsabo]!.damage).toBe(0);
    expect(zone(s, legend)).toBe("graveyard");
  });
});

describe("Pumps: other creatures, two targets, no duration, and a granted flanking or artifact landwalk", () => {
  it("are fully supported", () => supported(inOketrasName, sigilBlessing, joinForces, ridingTheDiluHorse, agility, vectisGloves));

  it("In Oketra's Name: Zombies get +2/+1, your other creatures +1/+1", () => {
    let { s, ap, opp, ids } = setup([inOketrasName]);
    const z = putOnBattlefield(s, ap, creature("Test Zombie", "Creature — Zombie", "{1}{B}", 2, 2));
    const b = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, z)).toBe("4/3");
    expect(pt(s, b)).toBe("3/3");
    expect(pt(s, theirs)).toBe("2/2");
  });

  it("Sigil Blessing: +3/+3 to the target, +1/+1 to your others, until end of turn", () => {
    let { s, ap, ids } = setup([sigilBlessing]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(pt(s, a)).toBe("5/5");
    expect(pt(s, b)).toBe("3/3");
    s = passUntil(s, "upkeep", next(s, ap));
    expect(pt(s, a)).toBe("2/2");
  });

  it("Join Forces untaps two creatures and gives each +2/+2", () => {
    let { s, ap, ids } = setup([joinForces]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s.objects[a]!.tapped = true;
    s.objects[b]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    for (const x of [a, b]) {
      expect(s.objects[x]!.tapped).toBe(false);
      expect(pt(s, x)).toBe("4/4");
    }
  });

  it("Riding the Dilu Horse lasts past the turn (CR 611.2a)", () => {
    let { s, ap, ids } = setup([ridingTheDiluHorse]);
    const a = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    s = passUntil(s, "upkeep", next(s, ap));
    expect(pt(s, a)).toBe("4/4");
    expect(has(s, a, "Horsemanship")).toBe(true);
  });

  it("Agility's flanking shrinks a blocker without flanking, not one with it", () => {
    for (const flanker of [false, true]) {
      let { s, ap, opp } = setup([]);
      const a = putOnBattlefield(s, ap, greenBear());
      attach(s, ap, agility, a);
      const blocker = putOnBattlefield(s, opp, creature("Test Squire", "Creature — Human", "{1}{W}", 1, 3, flanker ? { keywords: ["Flanking"], oracleText: "Flanking" } : {}));
      s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
      s = block(s, opp, [{ blocker, attacker: a }]);
      s = settle(s);
      expect(pt(s, a)).toBe("3/3");
      expect(pt(s, blocker)).toBe(flanker ? "1/3" : "0/2");
    }
  });

  it("Vectis Gloves: unblockable while the defending player controls an artifact land", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, greenBear());
    attach(s, ap, vectisGloves, a);
    const b = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    expect(pt(s, a)).toBe("4/2");
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!)).toBeNull();
    putOnBattlefield(s, opp, card("Test Vault", "Artifact Land", "", { oracleText: "{T}: Add {C}." }));
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!)).toMatch(/artifact landwalk/i);
  });
});

describe("Counterspells: may draw, and damage; spells that target a player", () => {
  it("are fully supported", () => supported(vex, suffocatingBlast, outwit));

  it("Vex counters the spell; its controller may draw a card", () => {
    for (const yes of [true, false]) {
      let { s, ap, opp, ids } = setup([electrostaticBolt]);
      const v = into(s, opp, vex);
      for (const l of [island, island, island]) putOnBattlefield(s, opp, l);
      const b = putOnBattlefield(s, opp, greenBear());
      s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
      s = act(s, { type: "passPriority", player: ap });
      s = run(s, planCast(s, opp, v, [topSpell(s)]));
      const hand = s.players[ap]!.hand.length;
      s = settle(s, { yes });
      expect(zone(s, ids[0]!)).toBe("graveyard");
      expect(s.objects[b]!.damage).toBe(0);
      expect(s.players[ap]!.hand.length).toBe(hand + (yes ? 1 : 0));
    }
  });

  it("Suffocating Blast counters the spell and deals 3 damage to a creature", () => {
    let { s, ap, opp, ids } = setup([electrostaticBolt]);
    const sb = into(s, opp, suffocatingBlast);
    for (const l of [island, island, mountain, mountain]) putOnBattlefield(s, opp, l);
    const b = putOnBattlefield(s, opp, greenBear());
    const mine = putOnBattlefield(s, ap, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, sb, [topSpell(s), tgt(mine)]));
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Outwit can target a spell that targets a player, not one that targets only a creature", () => {
    let { s, ap, opp, ids } = setup([electrostaticBolt, card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." })]);
    const o = into(s, opp, outwit);
    putOnBattlefield(s, opp, island);
    const b = putOnBattlefield(s, opp, greenBear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    s = act(s, { type: "passPriority", player: ap });
    expect(planCast(s, opp, o, [topSpell(s)])).toBeNull();
    s = settle(s);
    s = run(s, planCast(s, ap, ids[1]!, [player(opp)]));
    s = act(s, { type: "passPriority", player: ap });
    const life0 = life(s, opp);
    s = settle(run(s, planCast(s, opp, o, [topSpell(s)])));
    expect(life(s, opp)).toBe(life0);
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });
});

describe("Attached permanents: Equipment destroyed with the creature, Auras returned with it", () => {
  it("are fully supported", () => supported(turnToSlag, blastfireBolt, hubris));

  it("Turn to Slag deals 5 damage and destroys the Equipment attached to that creature, not other Equipment", () => {
    let { s, ap, opp, ids } = setup([turnToSlag]);
    const b = putOnBattlefield(s, opp, creature("Test Giant", "Creature — Giant", "{4}{R}", 6, 6));
    const eq = attach(s, opp, card("Test Blade", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}", keywords: ["Equip"] }), b);
    const other = putOnBattlefield(s, opp, card("Test Shield", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}", keywords: ["Equip"] }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[b]!.damage).toBe(5);
    expect(zone(s, eq)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Hubris returns the creature and every Aura on it, whoever controls the Aura", () => {
    let { s, ap, opp, ids } = setup([hubris]);
    const b = putOnBattlefield(s, opp, greenBear());
    const aura1 = attach(s, opp, card("Test Might", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1.", keywords: ["Enchant"] }), b);
    const aura2 = attach(s, ap, card("Test Weakness", "Enchantment — Aura", "{B}", { oracleText: "Enchant creature\nEnchanted creature gets -1/-1.", keywords: ["Enchant"] }), b);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, aura1)).toBe("hand");
    expect(zone(s, aura2)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(aura2);
  });
});

const salve = card("Test Salve", "Instant", "{W}", { cmc: 1, oracleText: "You gain 1 life." });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const testArtifact = (name = "Test Relic", manaCost = "{3}") => card(name, "Artifact", manaCost, { cmc: Number(manaCost.replace(/\D/g, "")), oracleText: "{T}: You gain 1 life." });
/** Pass priority until `pid` has it (the stack and step unchanged, as someone else still has to pass). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const oiled = (s: GameState, pid: PlayerId, n = 1) => {
  const id = putOnBattlefield(s, pid, testArtifact("Test Oil Vat"));
  s.objects[id]!.counters["oil"] = n;
  invalidateCharacteristics(s);
  return id;
};

describe("More of the first batch's templates: protection lists, flanking, two untaps", () => {
  it("are fully supported", () => supported(eliteInquisitor, jabarisBanner, sidewinderSliver, spareFromEvil, synchronizedStrike));

  it("Elite Inquisitor can't be blocked by a Zombie; Spare from Evil stops non-Humans from blocking", () => {
    let { s, ap, opp, ids } = setup([spareFromEvil]);
    const inq = putOnBattlefield(s, ap, eliteInquisitor);
    const b = putOnBattlefield(s, ap, greenBear());
    const zombie = putOnBattlefield(s, opp, creature("Test Zombie", "Creature — Zombie", "{1}{B}", 2, 2));
    const human = putOnBattlefield(s, opp, creature("Test Human", "Creature — Human", "{1}{W}", 2, 2));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = toBlocks(s, ap, [{ attacker: inq, defender: opp }, { attacker: b, defender: opp }]);
    const o = (id: string) => s.objects[id]!;
    expect(blockProblem(s, o(zombie), o(inq))).not.toBeNull();
    expect(blockProblem(s, o(zombie), o(b))).not.toBeNull();
    expect(blockProblem(s, o(human), o(b))).toBeNull();
  });

  it("Sidewinder Sliver gives Slivers flanking; Jabari's Banner gives it to a creature until end of turn", () => {
    let { s, ap } = setup([]);
    const sl = putOnBattlefield(s, ap, sidewinderSliver);
    const banner = putOnBattlefield(s, ap, jabarisBanner);
    const b = putOnBattlefield(s, ap, greenBear());
    expect(has(s, sl, "Flanking")).toBe(true);
    expect(has(s, b, "Flanking")).toBe(false);
    s = settle(run(s, planActivate(s, ap, banner, 0, [tgt(b)])));
    expect(has(s, b, "Flanking")).toBe(true);
    s = passUntil(s, "upkeep", next(s, ap));
    expect(has(s, b, "Flanking")).toBe(false);
  });

  it("Synchronized Strike untaps two creatures, +2/+2 each", () => {
    let { s, ap, ids } = setup([synchronizedStrike]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s.objects[a]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect(s.objects[a]!.tapped).toBe(false);
    expect([pt(s, a), pt(s, b)]).toEqual(["4/4", "4/4"]);
  });
});

describe("What was cast this turn, checked at the end step (CR 603.4)", () => {
  it("are fully supported", () => supported(impatience, predatoryAdvantage, wranglerOfTheDamned, jemLightfooteSkyExplorer, canyonCrab, twinnedVision));

  it("Impatience deals 2 damage to the active player at their end step only if they cast no spell", () => {
    for (const cast of [false, true]) {
      let { s, ap, opp, ids } = setup([salve]);
      putOnBattlefield(s, opp, impatience);
      if (cast) s = settle(run(s, planCast(s, ap, ids[0]!)));
      const life0 = life(s, ap);
      const oppLife = life(s, opp);
      s = settle(passUntil(s, "end", ap));
      expect(life(s, ap)).toBe(life0 - (cast ? 0 : 2));
      expect(life(s, opp)).toBe(oppLife);
    }
  });

  it("Predatory Advantage makes a Lizard at an opponent's end step if they cast no creature spell", () => {
    for (const what of ["none", "instant", "creature"] as const) {
      let { s, ap, opp, ids } = setup([salve, greenBear()]);
      putOnBattlefield(s, opp, predatoryAdvantage);
      if (what === "instant") s = settle(run(s, planCast(s, ap, ids[0]!)));
      if (what === "creature") s = settle(run(s, planCast(s, ap, ids[1]!)));
      s = settle(passUntil(s, "end", ap));
      const lizards = s.battlefield.filter((id) => s.objects[id]!.controller === opp && types(s, id).includes("Creature") && characteristics(s, s.objects[id]!).subtypes.includes("Lizard"));
      expect(lizards.length).toBe(what === "creature" ? 0 : 1);
    }
  });

  it("Jem Lightfoote draws unless a spell was cast from the hand; Twinned Vision draws two from the graveyard", () => {
    for (const how of ["none", "hand", "flashback"] as const) {
      let { s, ap, ids } = setup([twinnedVision]);
      putOnBattlefield(s, ap, jemLightfooteSkyExplorer);
      const hand = s.players[ap]!.hand;
      if (how === "flashback") {
        hand.splice(hand.indexOf(ids[0]!), 1);
        s.objects[ids[0]!]!.zone = "graveyard";
        s.players[ap]!.graveyard.push(ids[0]!);
      }
      const hand0 = s.players[ap]!.hand.length;
      if (how === "hand") s = settle(run(s, planCast(s, ap, ids[0]!)));
      if (how === "flashback") {
        const discard = s.players[ap]!.hand[0]!;
        s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { via: "flashback", discard: [discard] })));
        expect(zone(s, ids[0]!)).toBe("exile");
      }
      // From the hand: one card cast, one drawn. By flashback: one discarded, two drawn.
      expect(s.players[ap]!.hand.length - hand0).toBe(how === "none" ? 0 : how === "hand" ? 0 : 1);
      s = settle(passUntil(s, "end", ap));
      // Jem: a card unless a spell was cast from the hand.
      expect(s.players[ap]!.hand.length - hand0).toBe(how === "none" ? 1 : how === "hand" ? 0 : 2);
    }
  });

  it("Wrangler of the Damned makes a flying Spirit if you cast no spell from your hand", () => {
    for (const cast of [false, true]) {
      let { s, ap, ids } = setup([salve]);
      putOnBattlefield(s, ap, wranglerOfTheDamned);
      if (cast) s = settle(run(s, planCast(s, ap, ids[0]!)));
      s = settle(passUntil(s, "end", ap));
      const spirits = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Spirit"));
      expect(spirits.length).toBe(cast ? 0 : 1);
      if (!cast) expect(has(s, spirits[0]!, "Flying")).toBe(true);
    }
  });
});

describe("The first time you gain or lose life each turn", () => {
  it("are fully supported", () => supported(vengefulWarchief, attendedHealer, clericOfLifesBond, vanguardSeraph, gontisMachinations));

  it("Vengeful Warchief gets one counter for two losses of life in a turn, another the next turn", () => {
    let { s, ap, ids } = setup([shock, shock, shock]);
    const w = putOnBattlefield(s, ap, vengefulWarchief);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(ap)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(ap)])));
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(1);
    s = passUntil(s, "main1", next(s, ap));
    const nap = s.activePlayer;
    for (const l of [mountain]) putOnBattlefield(s, ap, l);
    s = priorityTo(s, nap);
    s = act(s, { type: "passPriority", player: nap });
    s = priorityTo(s, ap);
    s = settle(run(s, planCast(s, ap, ids[2]!, [player(ap)])));
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(2);
  });

  it("Attended Healer makes one Cat and Cleric of Life's Bond gets one counter for two gains of life", () => {
    let { s, ap, ids } = setup([salve, salve]);
    const cleric = putOnBattlefield(s, ap, clericOfLifesBond);
    putOnBattlefield(s, ap, attendedHealer);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    const cats = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Cat"));
    expect(cats.length).toBe(1);
    expect(s.objects[cleric]!.counters["+1/+1"] ?? 0).toBe(1);
  });

  it("Gonti's Machinations gets one energy for two losses of life", () => {
    let { s, ap, ids } = setup([shock, shock]);
    putOnBattlefield(s, ap, gontisMachinations);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(ap)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(ap)])));
    expect(s.players[ap]!.energy ?? 0).toBe(1);
  });
});

describe("Riders about the target, the cards moved, and who controlled it", () => {
  it("are fully supported", () => supported(crumble, smashToSmithereens, detonate, coercedConfession, patientRebuilding, balanceOfPower, darkSuspicions, clipWings, runAfoul, warrenPilferers, deathknellBerserker));

  it("Crumble: the artifact's controller gains life equal to its mana value; Smash to Smithereens deals 3 to them", () => {
    let { s, ap, opp, ids } = setup([crumble, smashToSmithereens]);
    const a = putOnBattlefield(s, opp, testArtifact("Test Relic", "{4}"));
    const b = putOnBattlefield(s, opp, testArtifact("Test Idol", "{2}"));
    const life0 = life(s, opp);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(zone(s, a)).toBe("graveyard");
    expect(life(s, opp)).toBe(life0 + 4);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(life(s, opp)).toBe(life0 + 4 - 3);
  });

  it("Detonate destroys an artifact with mana value X and deals X damage to its controller", () => {
    let { s, ap, opp, ids } = setup([detonate]);
    const a = putOnBattlefield(s, opp, testArtifact("Test Relic", "{2}"));
    const b = putOnBattlefield(s, opp, testArtifact("Test Idol", "{3}"));
    expect(planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto", 2)).toBeNull();
    const life0 = life(s, opp);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)], undefined, "auto", 2)));
    expect(zone(s, a)).toBe("graveyard");
    expect(life(s, opp)).toBe(life0 - 2);
  });

  it("Coerced Confession draws a card for each creature card milled", () => {
    let { s, ap, opp, ids } = setup([coercedConfession]);
    const hand0 = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    const milled = s.players[opp]!.graveyard.filter((id) => types(s, id).includes("Creature")).length;
    expect(s.players[opp]!.graveyard.length).toBe(4);
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1 + milled);
  });

  it("Patient Rebuilding: at your upkeep, the opponent mills three and you draw for each land card", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, patientRebuilding);
    s = passUntil(s, "upkeep", ap);
    const hand0 = s.players[ap]!.hand.length;
    const yard0 = s.players[opp]!.graveyard.length;
    s = settle(s, { targets: [player(opp)] });
    const milled = s.players[opp]!.graveyard.slice(yard0);
    expect(milled.length).toBe(3);
    expect(s.players[ap]!.hand.length).toBe(hand0 + milled.filter((id) => types(s, id).includes("Land")).length);
  });

  it("Balance of Power draws the difference only if the opponent has more cards in hand", () => {
    for (const more of [true, false]) {
      let { s, ap, opp, ids } = setup([balanceOfPower]);
      const mine = s.players[ap]!.hand.length - 1;
      while (s.players[opp]!.hand.length < (more ? mine + 3 : mine)) into(s, opp, greenBear());
      while (s.players[opp]!.hand.length > (more ? mine + 3 : mine)) s.players[opp]!.hand.pop();
      s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
      expect(s.players[ap]!.hand.length).toBe(mine + (more ? 3 : 0));
    }
  });

  it("Dark Suspicions: at each opponent's upkeep they lose the difference between their hand and yours", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, darkSuspicions);
    const o = next(s, ap);
    s = passUntil(s, "upkeep", o);
    const diff = Math.max(0, s.players[o]!.hand.length - s.players[ap]!.hand.length);
    const life0 = life(s, o);
    s = settle(s);
    expect(life(s, o)).toBe(life0 - diff);
  });

  it("Clip Wings and Run Afoul: a creature with flying is sacrificed, not one without", () => {
    let { s, ap, opp, ids } = setup([clipWings, runAfoul]);
    const bird = putOnBattlefield(s, opp, blueBird());
    const b = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, bird)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
    const bird2 = putOnBattlefield(s, opp, blueBird());
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(zone(s, bird2)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Warren Pilferers returns a creature card; with a Goblin card it gains haste", () => {
    for (const goblin of [true, false]) {
      let { s, ap, ids } = setup([warrenPilferers]);
      const c = into(s, ap, goblin ? creature("Test Goblin", "Creature — Goblin", "{R}", 1, 1) : greenBear(), "graveyard");
      s = run(s, planCast(s, ap, ids[0]!));
      s = settle(s, { targets: [tgt(c)] });
      expect(zone(s, c)).toBe("hand");
      expect(has(s, ids[0]!, "Haste")).toBe(goblin);
    }
  });

  it("Deathknell Berserker makes a Zombie Berserker only if its power was 3 or greater", () => {
    for (const big of [true, false]) {
      let { s, ap, ids } = setup([murder]);
      const d = putOnBattlefield(s, ap, deathknellBerserker);
      if (big) s.objects[d]!.counters["+1/+1"] = 1;
      invalidateCharacteristics(s);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(d)])));
      expect(zone(s, d)).toBe("graveyard");
      const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
      expect(tokens.length).toBe(big ? 1 : 0);
      if (big) expect(characteristics(s, s.objects[tokens[0]!]!).subtypes).toEqual(expect.arrayContaining(["Zombie", "Berserker"]));
    }
  });
});

describe("Exiling a card from a graveyard if you do; Clues; draws if you control a type", () => {
  it("are fully supported", () => supported(bonecladNecromancer, carrionImp, marduWoeReaper, sance, carnageInterpreter, confirmSuspicions, unagisSpray, revelationOfPower));

  it("Boneclad Necromancer: exiling a creature card makes a Zombie; declining makes none", () => {
    for (const yes of [true, false]) {
      let { s, ap, opp, ids } = setup([bonecladNecromancer]);
      const c = into(s, opp, greenBear(), "graveyard");
      s = run(s, planCast(s, ap, ids[0]!));
      s = settle(s, { yes, targets: [tgt(c)] });
      expect(zone(s, c)).toBe(yes ? "exile" : "graveyard");
      expect(s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Zombie")).length).toBe(yes ? 1 : 0);
    }
  });

  it("Carrion Imp gains 2 life if it exiles the card, none if you decline; Mardu Woe-Reaper the same for a Warrior", () => {
    for (const yes of [true, false]) {
      let { s, ap, ids } = setup([carrionImp, marduWoeReaper]);
      const c = into(s, ap, greenBear(), "graveyard");
      s = run(s, planCast(s, ap, ids[0]!));
      s = settle(s, { yes, targets: [tgt(c)] });
      expect(zone(s, c)).toBe(yes ? "exile" : "graveyard");
      expect(life(s, ap)).toBe(40 + (yes ? 2 : 0));
      if (!yes) continue;
      const c2 = into(s, ap, greenBear(), "graveyard");
      s = run(s, planCast(s, ap, ids[1]!));
      s = settle(s, { yes, targets: [tgt(c2)] });
      expect(zone(s, c2)).toBe("exile");
      expect(life(s, ap)).toBe(43);
    }
  });

  it("Séance: at each upkeep you may exile a creature card from your graveyard for a Spirit token copy, exiled at the end step", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, sance);
    const c = into(s, ap, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3), "graveyard");
    const o = next(s, ap);
    s = passUntil(s, "upkeep", o);
    s = settle(s, { yes: true, targets: [tgt(c)] });
    expect(zone(s, c)).toBe("exile");
    const copy = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(copy).toBeDefined();
    expect(characteristics(s, s.objects[copy]!).subtypes).toEqual(expect.arrayContaining(["Ogre", "Spirit"]));
    s = settle(passUntil(s, "end", o));
    expect(s.battlefield.includes(copy)).toBe(false);
  });

  it("Carnage Interpreter discards your hand and investigates four times; Confirm Suspicions counters and investigates three times", () => {
    let { s, ap, opp, ids } = setup([carnageInterpreter]);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(0);
    const clues = (pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Clue")).length;
    expect(clues(ap)).toBe(4);
    const cs = into(s, opp, confirmSuspicions);
    for (const l of [island, island, island, island, island]) putOnBattlefield(s, opp, l);
    const sh = into(s, ap, shock);
    s = run(s, planCast(s, ap, sh, [player(opp)]));
    s = priorityTo(s, opp);
    s = settle(run(s, planCast(s, opp, cs, [topSpell(s)])));
    expect(zone(s, sh)).toBe("graveyard");
    expect(clues(opp)).toBe(3);
  });

  it("Unagi's Spray draws a card only if you control one of the listed types", () => {
    for (const otter of [true, false]) {
      let { s, ap, opp, ids } = setup([unagisSpray]);
      if (otter) putOnBattlefield(s, ap, creature("Test Otter", "Creature — Otter", "{U}", 1, 1));
      const b = putOnBattlefield(s, opp, greenBear());
      const hand0 = s.players[ap]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
      expect(pt(s, b)).toBe("-2/2");
      expect(s.players[ap]!.hand.length).toBe(hand0 - 1 + (otter ? 1 : 0));
    }
  });

  it("Revelation of Power: flying and lifelink too if the creature has a counter of any kind", () => {
    for (const counter of [true, false]) {
      let { s, ap, ids } = setup([revelationOfPower]);
      const b = putOnBattlefield(s, ap, greenBear());
      if (counter) s.objects[b]!.counters["stun"] = 1;
      invalidateCharacteristics(s);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
      expect(pt(s, b)).toBe("4/4");
      expect(has(s, b, "Flying")).toBe(counter);
      expect(has(s, b, "Lifelink")).toBe(counter);
    }
  });
});

describe("Oil counters on permanents you control", () => {
  it("are fully supported", () => supported(oilGorgerTroll, cinderslashRavager, kuldothaCackler, urabrasksAnointer));

  it("Oil-Gorger Troll gains 3 life, then draws only if you control a permanent with an oil counter", () => {
    for (const oil of [true, false]) {
      let { s, ap, ids } = setup([oilGorgerTroll]);
      if (oil) oiled(s, ap);
      const hand0 = s.players[ap]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[0]!)));
      expect(life(s, ap)).toBe(43);
      expect(s.players[ap]!.hand.length).toBe(hand0 - 1 + (oil ? 1 : 0));
    }
  });

  it("Cinderslash Ravager costs {1} less for each permanent with oil counters, and deals 1 to each opposing creature", () => {
    for (const oil of [2, 0]) {
      let { s, ap, opp, ids } = setup([cinderslashRavager]);
      // Four lands left: {R}{G} and two more.
      const left = { Mountain: 2, Forest: 2 } as Record<string, number>;
      for (const id of s.battlefield) if (s.objects[id]!.controller === ap && types(s, id).includes("Land")) {
        const t = characteristics(s, s.objects[id]!).subtypes[0]!;
        if ((left[t] ?? 0) > 0) left[t]!--;
        else s.objects[id]!.tapped = true;
      }
      for (let i = 0; i < oil; i++) oiled(s, ap);
      const theirs = putOnBattlefield(s, opp, creature("Test Wisp", "Creature — Spirit", "{W}", 1, 1));
      const plan = planCast(s, ap, ids[0]!);
      if (!oil) {
        expect(plan).toBeNull();
        continue;
      }
      s = settle(run(s, plan));
      expect(zone(s, ids[0]!)).toBe("battlefield");
      expect(zone(s, theirs)).toBe("graveyard");
    }
  });

  it("Kuldotha Cackler gets +X/+0 attacking; Urabrask's Anointer deals X damage", () => {
    let { s, ap, opp, ids } = setup([urabrasksAnointer]);
    oiled(s, ap, 2);
    oiled(s, ap, 1);
    const k = putOnBattlefield(s, ap, kuldothaCackler);
    const b = putOnBattlefield(s, opp, creature("Test Giant", "Creature — Giant", "{4}", 5, 5));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { targets: [tgt(b)] });
    expect(s.objects[b]!.damage).toBe(2);
    s = toBlocks(s, ap, [{ attacker: k, defender: opp }]);
    expect(pt(s, k)).toBe("4/3");
  });
});

describe("Who can block, and attacking creatures of a type", () => {
  it("are fully supported", () => supported(pyrophobia, goblinLocksmith, heroOfOxidRidge, seismicElemental, mournwillow, blaringCaptain, bloodAgeGeneral));

  it("Pyrophobia: Cowards can't block this turn, other creatures can", () => {
    let { s, ap, opp, ids } = setup([pyrophobia]);
    const b = putOnBattlefield(s, opp, greenBear());
    const coward = putOnBattlefield(s, opp, creature("Test Coward", "Creature — Goblin Coward", "{R}", 1, 1));
    const other = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    const a = putOnBattlefield(s, ap, greenBear());
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    expect(blockProblem(s, s.objects[coward]!, s.objects[a]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[other]!, s.objects[a]!)).toBeNull();
  });

  it("Goblin Locksmith: creatures with defender can't block once it attacks", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, goblinLocksmith);
    const wall = putOnBattlefield(s, opp, creature("Test Wall", "Creature — Wall", "{1}", 0, 4, { keywords: ["Defender"], oracleText: "Defender" }));
    const b = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: g, defender: opp }]);
    expect(blockProblem(s, s.objects[wall]!, s.objects[g]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[b]!, s.objects[g]!)).toBeNull();
  });

  it("Seismic Elemental: creatures without flying can't block this turn", () => {
    let { s, ap, opp, ids } = setup([seismicElemental]);
    const bird = putOnBattlefield(s, opp, blueBird());
    const b = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const a = putOnBattlefield(s, ap, greenBear());
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[bird]!, s.objects[a]!)).toBeNull();
  });

  it("Blaring Captain: attacking Warriors get +1/+1, not other attackers; Blood Age General pumps attacking Spirits", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, blaringCaptain);
    const w = putOnBattlefield(s, ap, creature("Test Warrior", "Creature — Human Warrior", "{R}", 1, 1));
    const sp = putOnBattlefield(s, ap, creature("Test Spirit", "Creature — Spirit", "{W}", 1, 1));
    const home = putOnBattlefield(s, ap, creature("Test Warrior", "Creature — Human Warrior", "{R}", 1, 1));
    const gen = putOnBattlefield(s, ap, bloodAgeGeneral);
    s = toBlocks(s, ap, [{ attacker: c, defender: opp }, { attacker: w, defender: opp }, { attacker: sp, defender: opp }]);
    expect([pt(s, c), pt(s, w), pt(s, sp), pt(s, home)]).toEqual(["3/3", "2/2", "1/1", "1/1"]);
    s = block(s, opp, []);
    s = settle(run(s, planActivate(s, ap, gen, 0)));
    expect([pt(s, sp), pt(s, gen)]).toEqual(["2/1", "2/2"]);
  });
});

describe("The Defeat cycle: a Jace spell, a Gideon creature", () => {
  it("are fully supported", () => supported(jacesDefeat, gideonsDefeat));

  it("Jace's Defeat counters a blue spell, and scries 2 only for a Jace planeswalker spell", () => {
    for (const jace of [true, false]) {
      let { s, ap, opp } = setup([]);
      const spell = into(s, ap, jace ? card("Test Jace", "Legendary Planeswalker — Jace", "{1}{U}", { cmc: 2, loyalty: "3", oracleText: "+1: Draw a card." }) : creature("Test Drake", "Creature — Drake", "{1}{U}", 2, 2));
      const jd = into(s, opp, jacesDefeat);
      for (const l of [island, island]) putOnBattlefield(s, opp, l);
      s = run(s, planCast(s, ap, spell));
      s = priorityTo(s, opp);
      s = run(s, planCast(s, opp, jd, [topSpell(s)]));
      for (let i = 0; i < 10 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(zone(s, spell)).toBe("graveyard");
      expect(s.pending?.kind === "arrangeTop" && s.pending.player === opp).toBe(jace);
    }
  });

  it("Gideon's Defeat exiles a white attacker, with 5 life if it was a Gideon planeswalker", () => {
    for (const gideon of [true, false]) {
      let { s, ap, opp } = setup([]);
      const a = putOnBattlefield(s, ap, gideon ? card("Test Gideon", "Legendary Planeswalker — Gideon", "{2}{W}", { cmc: 3, loyalty: "3", oracleText: "+1: You gain 1 life." }) : creature("Test Knight", "Creature — Human Knight", "{1}{W}", 2, 2));
      // A planeswalker that's become a creature (as the Gideons' own abilities do).
      if (gideon) s.objects[a]!.counters["loyalty"] = 3;
      if (gideon) addEffect(s, ap, [a], [{ kind: "addTypes", types: ["Creature"], subtypes: ["Human", "Soldier"] }, { kind: "setPT", power: 4, toughness: 4 }]);
      const gd = into(s, opp, gideonsDefeat);
      putOnBattlefield(s, opp, plainsCard);
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
      s = priorityTo(s, opp);
      const life0 = life(s, opp);
      s = settle(run(s, planCast(s, opp, gd, [tgt(a)])));
      expect(zone(s, a)).toBe("exile");
      expect(life(s, opp)).toBe(life0 + (gideon ? 5 : 0));
    }
  });
});

describe("Untapping, counters at upkeep, and a kicked rider", () => {
  it("are fully supported", () => supported(steelDromedary, aliriosEnraptured, heartmender, heroicCharge));

  it("Steel Dromedary doesn't untap while it has a +1/+1 counter", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, steelDromedary);
    s.objects[d]!.tapped = true;
    s.objects[d]!.counters["+1/+1"] = 1;
    // Its beginning-of-combat move: declined.
    const pass = (step: "upkeep", pid: PlayerId) => {
      for (let i = 0; i < 4000 && !(s.step === step && s.activePlayer === pid); i++) {
        if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [tgt(d)] } as Action);
        else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: false });
        else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: s.pending.player, attacks: [] });
        else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
        else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, s.pending.count) });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
    };
    pass("upkeep", ap);
    expect(s.objects[d]!.tapped).toBe(true);
    s.objects[d]!.counters["+1/+1"] = 0;
    s.objects[d]!.tapped = true;
    pass("upkeep", next(s, ap));
    pass("upkeep", ap);
    expect(s.objects[d]!.tapped).toBe(false);
  });

  it("Alirios enters tapped with a Reflection, and doesn't untap while you control a Reflection", () => {
    let { s, ap, ids } = setup([aliriosEnraptured]);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const refl = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Reflection"))!;
    expect(pt(s, refl)).toBe("3/2");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    s.battlefield.splice(s.battlefield.indexOf(refl), 1);
    delete s.objects[refl];
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", next(s, ap));
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
  });

  it("Heartmender removes a -1/-1 counter from each creature you control at your upkeep", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, heartmender);
    const b = putOnBattlefield(s, ap, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    const theirs = putOnBattlefield(s, opp, greenBear());
    for (const id of [h, b, theirs]) s.objects[id]!.counters["-1/-1"] = 1;
    s.objects[b]!.counters["-1/-1"] = 2;
    invalidateCharacteristics(s);
    s = toUpkeep(s, ap);
    expect([h, b, theirs].map((id) => s.objects[id]!.counters["-1/-1"] ?? 0)).toEqual([0, 1, 1]);
  });

  it("Heroic Charge: +2/+1 to your creatures, and trample too if kicked", () => {
    for (const kicked of [true, false]) {
      let { s, ap, ids } = setup([heroicCharge]);
      const b = putOnBattlefield(s, ap, greenBear());
      s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, kicked ? { kicks: [0] } : {})));
      expect(pt(s, b)).toBe("4/3");
      expect(has(s, b, "Trample")).toBe(kicked);
    }
  });
});
