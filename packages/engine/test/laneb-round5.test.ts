// Lane B, round 5: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
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
    } else if (p) break;
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

// Real oracle text (Scryfall).
const mesaLynx = card("Mesa Lynx", "Creature — Cat", "{1}{W}", { cmc: 2, power: "2", toughness: "1", oracleText: "During turns other than yours, this creature gets +0/+2." });
const gloryOfWarfare = card("Glory of Warfare", "Enchantment", "{2}{R}{W}", { cmc: 4, oracleText: "During your turn, creatures you control get +2/+0.\nDuring turns other than yours, creatures you control get +0/+2." });
const wardenOfTheWall = card("Warden of the Wall", "Artifact", "{3}", { cmc: 3, oracleText: "This artifact enters tapped.\n{T}: Add {C}.\nDuring turns other than yours, this artifact is a 2/3 Gargoyle artifact creature with flying." });
const rustedRelic = card("Rusted Relic", "Artifact", "{4}", { cmc: 4, keywords: ["Metalcraft"], oracleText: "Metalcraft — This artifact is a 5/5 Golem artifact creature as long as you control three or more artifacts." });
const midnightMangler = card("Midnight Mangler", "Artifact — Vehicle", "{1}{U}", { cmc: 2, power: "3", toughness: "3", keywords: ["Crew"], oracleText: "During turns other than yours, this Vehicle is an artifact creature.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const kezzerdrix = card("Kezzerdrix", "Creature — Rabbit Beast", "{2}{B}{B}", { cmc: 4, power: "4", toughness: "4", keywords: ["First strike"], oracleText: "First strike\nAt the beginning of your upkeep, if your opponents control no creatures, this creature deals 4 damage to you." });
const homicidalSeclusion = card("Homicidal Seclusion", "Enchantment", "{4}{B}", { cmc: 5, oracleText: "As long as you control exactly one creature, that creature gets +3/+1 and has lifelink." });
const demonicRising = card("Demonic Rising", "Enchantment", "{3}{B}{B}", { cmc: 5, oracleText: "At the beginning of your end step, if you control exactly one creature, create a 5/5 black Demon creature token with flying." });
const spiritMirror = card("Spirit Mirror", "Enchantment", "{2}{W}{W}", { cmc: 4, oracleText: "At the beginning of your upkeep, if there are no Reflection tokens on the battlefield, create a 2/2 white Reflection creature token.\n{0}: Destroy target Reflection." });
const bloodcrazedGoblin = card("Bloodcrazed Goblin", "Creature — Goblin Berserker", "{R}", { cmc: 1, power: "2", toughness: "2", oracleText: "This creature can't attack unless an opponent has been dealt damage this turn." });
const mercadianAtlas = card("Mercadian Atlas", "Artifact — Book", "{5}", { cmc: 5, oracleText: "At the beginning of your end step, if you didn't play a land this turn, you may draw a card." });
const kamiOfTerribleSecrets = card("Kami of Terrible Secrets", "Creature — Spirit", "{3}{B}", { cmc: 4, power: "3", toughness: "4", oracleText: "When this creature enters, if you control an artifact and an enchantment, you draw a card and you gain 1 life." });
const naomiPillarOfOrder = card("Naomi, Pillar of Order", "Legendary Creature — Human Advisor", "{3}{W}{B}", { cmc: 5, power: "4", toughness: "4", oracleText: "Whenever Naomi enters or attacks, if you control an artifact and an enchantment, create a 2/2 white Samurai creature token with vigilance." });
const liuBeiLordOfShu = card("Liu Bei, Lord of Shu", "Legendary Creature — Human Soldier", "{3}{W}{W}", { cmc: 5, power: "2", toughness: "4", keywords: ["Horsemanship"], oracleText: "Horsemanship (This creature can't be blocked except by creatures with horsemanship.)\nLiu Bei gets +2/+2 as long as you control a permanent named Guan Yu, Sainted Warrior or a permanent named Zhang Fei, Fierce Warrior." });
const maraudingMaulhorn = card("Marauding Maulhorn", "Creature — Beast", "{2}{R}{R}", { cmc: 4, power: "5", toughness: "3", oracleText: "This creature attacks each combat if able unless you control a creature named Advocate of the Beast." });
const oakStreetInnkeeper = card("Oak Street Innkeeper", "Creature — Elf", "{2}{G}", { cmc: 3, power: "1", toughness: "2", oracleText: "During turns other than yours, tapped creatures you control have hexproof." });
const vibratingSphere = card("Vibrating Sphere", "Artifact", "{4}", { cmc: 4, oracleText: "During your turn, creatures you control get +2/+0.\nDuring turns other than yours, creatures you control get -0/-2." });
const deadlyWanderings = card("Deadly Wanderings", "Enchantment", "{3}{B}{B}", { cmc: 5, oracleText: "As long as you control exactly one creature, that creature gets +2/+0 and has deathtouch and lifelink." });
const sarcomancy = card("Sarcomancy", "Enchantment", "{B}", { cmc: 1, oracleText: "When this enchantment enters, create a 2/2 black Zombie creature token.\nAt the beginning of your upkeep, if there are no Zombies on the battlefield, this enchantment deals 1 damage to you." });
const warElemental = card("War Elemental", "Creature — Elemental", "{R}{R}{R}", { cmc: 3, power: "1", toughness: "1", oracleText: "When this creature enters, sacrifice it unless an opponent was dealt damage this turn.\nWhenever an opponent is dealt damage, put that many +1/+1 counters on this creature." });
const skarrganFirebird = card("Skarrgan Firebird", "Creature — Phoenix", "{4}{R}{R}", { cmc: 6, power: "3", toughness: "3", keywords: ["Flying", "Bloodthirst"], oracleText: "Bloodthirst 3 (If an opponent was dealt damage this turn, this creature enters with three +1/+1 counters on it.)\nFlying\n{R}{R}{R}: Return this card from your graveyard to your hand. Activate only if an opponent was dealt damage this turn." });
const banishingSlash = card("Banishing Slash", "Sorcery", "{W}{W}", { cmc: 2, oracleText: "Destroy up to one target artifact, enchantment, or tapped creature. Then if you control an artifact and an enchantment, create a 2/2 white Samurai creature token with vigilance." });
const recklessCohort = card("Reckless Cohort", "Creature — Human Warrior Ally", "{1}{R}", { cmc: 2, power: "2", toughness: "2", oracleText: "This creature attacks each combat if able unless you control another Ally." });
const rufusShinra = card("Rufus Shinra", "Legendary Creature — Human Noble", "{1}{W}{B}", { cmc: 3, power: "2", toughness: "4", oracleText: "Whenever Rufus Shinra attacks, if you don't control a creature named Darkstar, create Darkstar, a legendary 2/2 white and black Dog creature token." });
const jiangYanggu = card("Jiang Yanggu", "Legendary Planeswalker — Yanggu", "{4}{G}", { cmc: 5, loyalty: "4", oracleText: "+1: Target creature gets +2/+2 until end of turn.\n−1: If you don't control a creature named Mowu, create Mowu, a legendary 3/3 green Dog creature token.\n−5: Until end of turn, target creature gains trample and gets +X/+X, where X is the number of lands you control." });
const venserCorpsePuppet = card("Venser, Corpse Puppet", "Legendary Creature — Phyrexian Zombie Wizard", "{U}{B}", { cmc: 2, power: "1", toughness: "3", keywords: ["Lifelink", "Toxic", "Proliferate"], oracleText: "Lifelink, toxic 1\nWhenever you proliferate, choose one —\n• If you don't control a creature named The Hollow Sentinel, create The Hollow Sentinel, a legendary 3/3 colorless Phyrexian Golem artifact creature token.\n• Target artifact creature you control gains flying and lifelink until end of turn." });
const gutwrencherOni = card("Gutwrencher Oni", "Creature — Demon Spirit", "{3}{B}{B}", { cmc: 5, power: "5", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nAt the beginning of your upkeep, discard a card if you don't control an Ogre." });
const gimlisFury = card("Gimli's Fury", "Instant", "{1}{R}", { cmc: 2, oracleText: "Target creature gets +3/+2 until end of turn. If it's legendary, it also gains trample until end of turn." });
const rushTheRoom = card("Rush the Room", "Instant", "{R}", { cmc: 1, oracleText: "Target creature gets +1/+0 and gains first strike until end of turn. If it's a Goblin or Orc, it also gains haste until end of turn." });
const blessingOfBelzenlok = card("Blessing of Belzenlok", "Instant", "{B}", { cmc: 1, oracleText: "Target creature gets +2/+1 until end of turn. If it's legendary, it also gains lifelink until end of turn." });
const hazardrootHerbalist = card("Hazardroot Herbalist", "Creature — Rabbit Druid", "{2}{G}", { cmc: 3, power: "1", toughness: "4", oracleText: "Whenever you attack, target creature you control gets +1/+0 until end of turn. If that creature is a token, it also gains deathtouch until end of turn." });
const whenWeWereYoung = card("When We Were Young", "Instant", "{3}{W}", { cmc: 4, oracleText: "Up to two target creatures each get +2/+2 until end of turn. If you control an artifact and an enchantment, those creatures also gain lifelink until end of turn." });
const kytheonsTactics = card("Kytheon's Tactics", "Sorcery", "{1}{W}{W}", { cmc: 3, keywords: ["Spell mastery"], oracleText: "Creatures you control get +2/+1 until end of turn.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, those creatures also gain vigilance until end of turn. (Attacking doesn't cause them to tap.)" });
const swarmSurge = card("Swarm Surge", "Sorcery", "{2}{B}", { cmc: 3, keywords: ["Devoid"], colors: [], oracleText: "Devoid (This card has no color.)\nCreatures you control get +2/+0 until end of turn. Colorless creatures you control also gain first strike until end of turn." });
const gallantFowlknight = card("Gallant Fowlknight", "Creature — Kithkin Knight", "{3}{W}", { cmc: 4, power: "3", toughness: "4", oracleText: "When this creature enters, creatures you control get +1/+0 until end of turn. Kithkin creatures you control also gain first strike until end of turn." });
const sanctifiedCharge = card("Sanctified Charge", "Instant", "{4}{W}", { cmc: 5, oracleText: "Creatures you control get +2/+1 until end of turn. White creatures you control also gain first strike until end of turn. (They deal combat damage before creatures without first strike.)" });
const hexgoldSlash = card("Hexgold Slash", "Instant", "{R}", { cmc: 1, oracleText: "Hexgold Slash deals 2 damage to target creature. If that creature has toxic, Hexgold Slash deals 4 damage to that creature instead." });
const elderCathar = card("Elder Cathar", "Creature — Human Soldier", "{2}{W}", { cmc: 3, power: "2", toughness: "2", oracleText: "When this creature dies, put a +1/+1 counter on target creature you control. If that creature is a Human, put two +1/+1 counters on it instead." });
const gloomwidowsFeast = card("Gloomwidow's Feast", "Instant", "{3}{G}", { cmc: 4, oracleText: "Destroy target creature with flying. If that creature was blue or black, create a 1/2 green Spider creature token with reach. (It can block creatures with flying.)" });
const filigreeFracture = card("Filigree Fracture", "Instant", "{2}{G}", { cmc: 3, oracleText: "Destroy target artifact or enchantment. If that permanent was blue or black, draw a card." });
const moltenRain = card("Molten Rain", "Sorcery", "{1}{R}{R}", { cmc: 3, oracleText: "Destroy target land. If that land was nonbasic, Molten Rain deals 2 damage to the land's controller." });
const chokingSands = card("Choking Sands", "Sorcery", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target non-Swamp land. If that land was nonbasic, Choking Sands deals 2 damage to the land's controller." });
const lilianasDefeat = card("Liliana's Defeat", "Sorcery", "{B}", { cmc: 1, oracleText: "Destroy target black creature or black planeswalker. If that permanent was a Liliana planeswalker, her controller loses 3 life." });
const helldozer = card("Helldozer", "Creature — Zombie Giant", "{3}{B}{B}{B}", { cmc: 6, power: "6", toughness: "5", oracleText: "{B}{B}{B}, {T}: Destroy target land. If that land was nonbasic, untap this creature." });
const enemyOfEnlightenment = card("Enemy of Enlightenment", "Enchantment Creature — Demon", "{5}{B}", { cmc: 6, power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nThis creature gets -1/-1 for each card in your opponents' hands.\nAt the beginning of your upkeep, each player discards a card." });
const identityCrisis = card("Identity Crisis", "Sorcery", "{2}{W}{W}{B}{B}", { cmc: 6, oracleText: "Exile all cards from target player's hand and graveyard." });
const akuDjinn = card("Aku Djinn", "Creature — Djinn", "{3}{B}{B}", { cmc: 5, power: "5", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nAt the beginning of your upkeep, put a +1/+1 counter on each creature each opponent controls." });
const gerrardsVerdict = card("Gerrard's Verdict", "Sorcery", "{W}{B}", { cmc: 2, oracleText: "Target player discards two cards. You gain 3 life for each land card discarded this way." });
const forget = card("Forget", "Sorcery", "{U}{U}", { cmc: 2, oracleText: "Target player discards two cards, then draws as many cards as they discarded this way." });
const aweForTheGuilds = card("Awe for the Guilds", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Monocolored creatures can't block this turn." });
const plagueFiend = card("Plague Fiend", "Creature — Insect", "{1}{B}", { cmc: 2, power: "1", toughness: "1", oracleText: "Whenever this creature deals combat damage to a creature, destroy that creature unless its controller pays {2}." });
const rhysticDeluge = card("Rhystic Deluge", "Enchantment", "{2}{U}", { cmc: 3, oracleText: "{U}: Tap target creature unless its controller pays {1}." });
const excise = card("Excise", "Instant", "{X}{W}", { cmc: 1, oracleText: "Exile target attacking creature unless its controller pays {X}." });
const silentAssassin = card("Silent Assassin", "Creature — Human Mercenary Assassin", "{B}{B}", { cmc: 2, power: "2", toughness: "1", oracleText: "{3}{B}: Destroy target blocking creature at end of combat." });
const sneakyHomunculus = card("Sneaky Homunculus", "Creature — Homunculus Illusion", "{1}{U}", { cmc: 2, power: "1", toughness: "1", oracleText: "This creature can't block or be blocked by creatures with power 2 or greater." });
const realmOfKoh = card("Realm of Koh", "Land", "", { cmc: 0, oracleText: "This land enters tapped unless you control a basic land.\n{T}: Add {B}.\n{3}{B}, {T}: Create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\"" });
const baboonSpirit = card("Baboon Spirit", "Creature — Monkey Spirit", "{2}{U}", { cmc: 3, power: "2", toughness: "4", oracleText: "Whenever another nontoken Spirit you control enters, create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\"\n{3}{U}: Exile another target creature you control. Return it to the battlefield under its owner's control at the beginning of the next end step." });
const foggySwampSpiritKeeper = card("Foggy Swamp Spirit Keeper", "Creature — Human Druid Ally", "{1}{U}{B}", { cmc: 3, power: "2", toughness: "4", keywords: ["Lifelink"], oracleText: "Lifelink\nWhenever you draw your second card each turn, create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\"" });
const lostInTheSpiritWorld = card("Lost in the Spirit World", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Return up to one target creature to its owner's hand. Create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\"" });
const ponybackBrigade = card("Ponyback Brigade", "Creature — Goblin Warrior", "{3}{R}{W}{B}", { cmc: 6, power: "2", toughness: "2", keywords: ["Morph"], oracleText: "When this creature enters or is turned face up, create three 1/1 red Goblin creature tokens.\nMorph {2}{R}{W}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const gadgetTechnician = card("Gadget Technician", "Creature — Goblin Artificer", "{2}{U}{R}", { cmc: 4, power: "3", toughness: "2", keywords: ["Disguise"], oracleText: "When this creature enters or is turned face up, create a 1/1 colorless Thopter artifact creature token with flying.\nDisguise {U/R}{U/R} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" });
const culvertAmbusher = card("Culvert Ambusher", "Creature — Wurm Horror", "{3}{G}{G}", { cmc: 5, power: "4", toughness: "5", keywords: ["Disguise"], oracleText: "When this creature enters or is turned face up, target creature blocks this turn if able.\nDisguise {4}{G} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" });
const rakishScoundrel = card("Rakish Scoundrel", "Creature — Elf Rogue", "{2}{B}{G}", { cmc: 4, power: "3", toughness: "3", keywords: ["Disguise", "Deathtouch"], oracleText: "Deathtouch\nWhen this creature enters or is turned face up, target creature gains indestructible until end of turn.\nDisguise {4}{B/G}{B/G} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" });
const offenderAtLarge = card("Offender at Large", "Creature — Giant Rogue", "{4}{R}", { cmc: 5, power: "5", toughness: "4", keywords: ["Disguise"], oracleText: "Disguise {4}{R} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhen this creature enters or is turned face up, up to one target creature gets +2/+0 until end of turn." });
const efreetWeaponmaster = card("Efreet Weaponmaster", "Creature — Efreet Monk", "{3}{U}{R}{W}", { cmc: 6, power: "4", toughness: "3", keywords: ["Morph", "First strike"], oracleText: "First strike\nWhen this creature enters or is turned face up, another target creature you control gets +3/+0 until end of turn.\nMorph {2}{U}{R}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const alarum = card("Alarum", "Instant", "{1}{W}", { cmc: 2, oracleText: "Untap target nonattacking creature. It gets +1/+3 until end of turn." });
const ruthlessInstincts = card("Ruthless Instincts", "Instant", "{2}{G}", { cmc: 3, oracleText: "Choose one —\n• Target nonattacking creature gains reach and deathtouch until end of turn. Untap it.\n• Target attacking creature gets +2/+2 and gains trample until end of turn." });
const spidermanToTheRescue = card("Spider-Man, To the Rescue", "Legendary Creature — Spider Human Hero", "{2}{G/W}", { cmc: 3, power: "3", toughness: "2", keywords: ["Reach", "Vigilance", "Flash", "No One Dies!"], oracleText: "Flash\nReach, vigilance\nNo One Dies! — When Spider-Man enters, you may tap him. When you do, another target nonattacking creature you control gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)" });
const lyevDecree = card("Lyev Decree", "Sorcery", "{1}{W}", { cmc: 2, keywords: ["Detain"], oracleText: "Detain up to two target creatures your opponents control. (Until your next turn, those creatures can't attack or block and their activated abilities can't be activated.)" });
const azoriusJusticiar = card("Azorius Justiciar", "Creature — Human Wizard", "{2}{W}{W}", { cmc: 4, power: "2", toughness: "2", keywords: ["Detain"], oracleText: "When this creature enters, detain up to two target creatures your opponents control. (Until your next turn, those creatures can't attack or block and their activated abilities can't be activated.)" });
const archonOfTheTriumvirate = card("Archon of the Triumvirate", "Creature — Archon", "{5}{W}{U}", { cmc: 7, power: "4", toughness: "5", keywords: ["Flying", "Detain"], oracleText: "Flying\nWhenever this creature attacks, detain up to two target nonland permanents your opponents control. (Until your next turn, those permanents can't attack or block and their activated abilities can't be activated.)" });
const laviniaOfTheTenth = card("Lavinia of the Tenth", "Legendary Creature — Human Soldier", "{3}{W}{U}", { cmc: 5, power: "4", toughness: "4", keywords: ["Protection", "Detain"], oracleText: "Protection from red\nWhen Lavinia enters, detain each nonland permanent your opponents control with mana value 4 or less. (Until your next turn, those permanents can't attack or block and their activated abilities can't be activated.)" });
const burningSunCavalry = card("Burning Sun Cavalry", "Creature — Human Knight", "{1}{R}", { cmc: 2, power: "2", toughness: "2", oracleText: "Whenever this creature attacks or blocks while you control a Dinosaur, this creature gets +1/+1 until end of turn." });
const weatherseedTotem = card("Weatherseed Totem", "Artifact", "{3}", { cmc: 3, oracleText: "{T}: Add {G}.\n{2}{G}{G}{G}: This artifact becomes a 5/3 green Treefolk artifact creature with trample until end of turn.\nWhen this artifact is put into a graveyard from the battlefield, if it was a creature, return this card to its owner's hand." });
const razorGolem = card("Razor Golem", "Artifact Creature — Golem", "{6}", { cmc: 6, power: "3", toughness: "4", keywords: ["Affinity", "Vigilance"], oracleText: "Affinity for Plains (This spell costs {1} less to cast for each Plains you control.)\nVigilance" });
const quirionDryad = card("Quirion Dryad", "Creature — Dryad", "{1}{G}", { cmc: 2, power: "1", toughness: "1", oracleText: "Whenever you cast a spell that's white, blue, black, or red, put a +1/+1 counter on this creature." });
const kathariBomber = card("Kathari Bomber", "Creature — Bird Shaman", "{1}{B}{R}", { cmc: 3, power: "2", toughness: "2", keywords: ["Flying", "Unearth"], oracleText: "Flying\nWhen this creature deals combat damage to a player, create two 1/1 red Goblin creature tokens and sacrifice this creature.\nUnearth {3}{B}{R} ({3}{B}{R}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)" });

describe("\"During turns other than yours\" and \"~ is a 2/3 Gargoyle artifact creature\"", () => {
  it("are fully supported", () => supported(mesaLynx, gloryOfWarfare, oakStreetInnkeeper, vibratingSphere, wardenOfTheWall, rustedRelic, midnightMangler));

  it("Mesa Lynx and Glory of Warfare: one bonus on your turn, the other on everyone else's", () => {
    let { s, ap } = setup([]);
    const lynx = putOnBattlefield(s, ap, mesaLynx);
    const bear = putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, gloryOfWarfare);
    expect(pt(s, lynx)).toBe("4/1");
    expect(pt(s, bear)).toBe("4/2");
    s = passUntil(s, "main1", next(s, ap));
    expect(pt(s, lynx)).toBe("2/5");
    expect(pt(s, bear)).toBe("2/4");
  });

  it("Oak Street Innkeeper: your tapped creatures have hexproof on other players' turns", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, oakStreetInnkeeper);
    const bear = putOnBattlefield(s, ap, greenBear());
    s = passUntil(s, "main1", next(s, ap));
    expect(has(s, bear, "Hexproof")).toBe(false);
    s.objects[bear]!.tapped = true;
    invalidateCharacteristics(s);
    expect(has(s, bear, "Hexproof")).toBe(true);
  });

  it("Warden of the Wall is a 2/3 flying Gargoyle artifact creature only on other players' turns (CR 205.1b)", () => {
    let { s, ap } = setup([]);
    const w = putOnBattlefield(s, ap, wardenOfTheWall);
    expect(types(s, w)).toEqual(["Artifact"]);
    s = passUntil(s, "main1", next(s, ap));
    expect(types(s, w)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(characteristics(s, s.objects[w]!).subtypes).toEqual(["Gargoyle"]);
    expect(pt(s, w)).toBe("2/3");
    expect(has(s, w, "Flying")).toBe(true);
  });

  it("Rusted Relic is a 5/5 Golem with three or more artifacts; Midnight Mangler is a creature on other turns", () => {
    let { s, ap } = setup([]);
    const relic = putOnBattlefield(s, ap, rustedRelic);
    const mangler = putOnBattlefield(s, ap, midnightMangler);
    expect(types(s, relic)).toEqual(["Artifact"]);
    expect(types(s, mangler)).not.toContain("Creature");
    putOnBattlefield(s, ap, card("Bauble", "Artifact", "{1}"));
    expect(types(s, relic)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, relic)).toBe("5/5");
    s = passUntil(s, "main1", next(s, ap));
    expect(types(s, mangler)).toContain("Creature");
    expect(pt(s, mangler)).toBe("3/3");
  });
});

describe("conditions: \"your opponents control no creatures\", \"exactly one creature\", \"no Reflection tokens\", named permanents, \"an artifact and an enchantment\"", () => {
  it("are fully supported", () => supported(kezzerdrix, homicidalSeclusion, deadlyWanderings, demonicRising, spiritMirror, sarcomancy, bloodcrazedGoblin, warElemental, skarrganFirebird, mercadianAtlas, kamiOfTerribleSecrets, naomiPillarOfOrder, banishingSlash, liuBeiLordOfShu, maraudingMaulhorn, recklessCohort, rufusShinra, jiangYanggu, venserCorpsePuppet, gutwrencherOni));

  it("Kezzerdrix deals 4 damage to you only when no opponent controls a creature", () => {
    for (const oppCreature of [false, true]) {
      let { s, ap } = setup([]);
      s.players[ap]!.command = [];
      putOnBattlefield(s, ap, kezzerdrix);
      for (const p of s.turnOrder) s.players[p]!.command = [];
      if (oppCreature) putOnBattlefield(s, next(s, ap), greenBear());
      const start = life(s, ap);
      s = toUpkeep(s, ap);
      expect(life(s, ap), `an opponent's creature: ${oppCreature}`).toBe(start - (oppCreature ? 0 : 4));
    }
  });

  it("Homicidal Seclusion and Deadly Wanderings: only while you control exactly one creature", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, homicidalSeclusion);
    putOnBattlefield(s, ap, deadlyWanderings);
    const bear = putOnBattlefield(s, ap, greenBear());
    expect(pt(s, bear)).toBe("7/3");
    expect(has(s, bear, "Lifelink")).toBe(true);
    expect(has(s, bear, "Deathtouch")).toBe(true);
    // Another player's creature doesn't count.
    putOnBattlefield(s, next(s, ap), greenBear());
    expect(pt(s, bear)).toBe("7/3");
    putOnBattlefield(s, ap, greenBear());
    expect(pt(s, bear)).toBe("2/2");
    expect(has(s, bear, "Lifelink")).toBe(false);
  });

  it("Demonic Rising makes a Demon at your end step only with exactly one creature", () => {
    for (const n of [1, 2]) {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, demonicRising);
      for (let i = 0; i < n; i++) putOnBattlefield(s, ap, greenBear());
      s = settle(passUntil(s, "end", ap));
      const demons = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Demon"));
      expect(demons.length, `${n} creatures`).toBe(n === 1 ? 1 : 0);
    }
  });

  it("Spirit Mirror makes a Reflection only when there is none; Sarcomancy hurts you without a Zombie", () => {
    let { s, ap } = setup([]);
    for (const p of s.turnOrder) s.players[p]!.command = [];
    putOnBattlefield(s, ap, spiritMirror);
    putOnBattlefield(s, ap, sarcomancy);
    const reflections = (st: GameState) => st.battlefield.filter((id) => characteristics(st, st.objects[id]!).subtypes.includes("Reflection"));
    const start = life(s, ap);
    s = toUpkeep(s, ap);
    expect(reflections(s).length).toBe(1);
    expect(life(s, ap)).toBe(start - 1);
    // A Zombie anywhere stops Sarcomancy; the Reflection stops the Mirror.
    putOnBattlefield(s, next(s, ap), creature("Zombie", "Creature — Zombie", "{B}", 2, 2));
    s = passUntil(s, "main1", ap);
    s = toUpkeep(s, ap);
    expect(reflections(s).length).toBe(1);
    expect(life(s, ap)).toBe(start - 1);
  });

  it("Bloodcrazed Goblin attacks only once an opponent was dealt damage this turn", () => {
    let { s, ap, ids } = setup([card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." })]);
    const g = putOnBattlefield(s, ap, bloodcrazedGoblin);
    const shock = ids[0]!;
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(g);
    // Damage to yourself doesn't count.
    s = settle(run(s, planCast(s, ap, shock, [player(ap)])));
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(g);
    s.damagedThisTurn = [...(s.damagedThisTurn ?? []), next(s, ap)];
    invalidateCharacteristics(s);
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(g);
  });

  it("Mercadian Atlas draws at your end step only if you didn't play a land", () => {
    for (const played of [false, true]) {
      let { s, ap, ids } = setup([forest]);
      putOnBattlefield(s, ap, mercadianAtlas);
      if (played) s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
      const hand = s.players[ap]!.hand.length;
      s = settle(passUntil(s, "end", ap));
      expect(s.players[ap]!.hand.length, `played a land: ${played}`).toBe(hand + (played ? 0 : 1));
    }
  });

  it("Kami of Terrible Secrets and Naomi need both an artifact and an enchantment", () => {
    for (const both of [false, true]) {
      let { s, ap, ids } = setup([kamiOfTerribleSecrets, naomiPillarOfOrder]);
      putOnBattlefield(s, ap, card("Bauble", "Artifact", "{1}"));
      if (both) putOnBattlefield(s, ap, card("Charm", "Enchantment", "{1}"));
      const [hand, start] = [s.players[ap]!.hand.length, life(s, ap)];
      s = settle(run(s, planCast(s, ap, ids[0]!)));
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + (both ? 1 : 0));
      expect(life(s, ap)).toBe(start + (both ? 1 : 0));
      s = settle(run(s, planCast(s, ap, ids[1]!)));
      const samurai = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Samurai"));
      expect(samurai.length).toBe(both ? 1 : 0);
    }
  });

  it("Liu Bei gets +2/+2 with a permanent named Guan Yu or Zhang Fei; Marauding Maulhorn must attack without its Advocate", () => {
    let { s, ap } = setup([]);
    const liu = putOnBattlefield(s, ap, liuBeiLordOfShu);
    const maul = putOnBattlefield(s, ap, maraudingMaulhorn);
    expect(pt(s, liu)).toBe("2/4");
    // An opponent's doesn't count.
    putOnBattlefield(s, next(s, ap), creature("Zhang Fei, Fierce Warrior", "Legendary Creature — Human Soldier Warrior", "{4}{W}", 4, 4));
    expect(pt(s, liu)).toBe("2/4");
    putOnBattlefield(s, ap, creature("Zhang Fei, Fierce Warrior", "Legendary Creature — Human Soldier Warrior", "{4}{W}", 4, 4));
    expect(pt(s, liu)).toBe("4/6");
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/attacks each combat if able/);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: maul, defender: next(s, ap) }] })).not.toThrow();
    putOnBattlefield(s, ap, creature("Advocate of the Beast", "Creature — Elf Shaman", "{2}{G}", 2, 3));
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
  });

  it("Rufus Shinra makes Darkstar only if you don't control one", () => {
    let { s, ap } = setup([]);
    const rufus = putOnBattlefield(s, ap, rufusShinra);
    const opp = next(s, ap);
    const darkstars = (st: GameState) => st.battlefield.filter((id) => characteristics(st, st.objects[id]!).name === "Darkstar");
    s = settle(toBlocks(s, ap, [{ attacker: rufus, defender: opp }]));
    expect(darkstars(s).length).toBe(1);
    s = passUntil(s, "main1", ap);
    s.objects[rufus]!.tapped = false;
    s = settle(toBlocks(s, ap, [{ attacker: rufus, defender: opp }]));
    expect(darkstars(s).length).toBe(1);
  });

  it("Gutwrencher Oni: discard a card at your upkeep without an Ogre", () => {
    for (const ogre of [false, true]) {
      let { s, ap } = setup([]);
      for (const p of s.turnOrder) s.players[p]!.command = [];
      putOnBattlefield(s, ap, gutwrencherOni);
      if (ogre) putOnBattlefield(s, ap, creature("Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
      s = passUntil(s, "upkeep", ap);
      const hand = s.players[ap]!.hand.length;
      for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "discard" || (p && "player" in p && p.kind !== "chooseMay")) s = act(s, botActions(s, p.player as PlayerId)[0]!);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.players[ap]!.hand.length, `an Ogre: ${ogre}`).toBe(hand - (ogre ? 0 : 1));
    }
  });
});

const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const legend = () => creature("Legendary Bear", "Legendary Creature — Bear", "{1}{G}", 2, 2);
const goblin = () => creature("Goblin Test", "Creature — Goblin", "{R}", 1, 1);
const human = () => creature("Human Test", "Creature — Human", "{W}", 1, 1);
const golem = () => creature("Colorless Golem", "Artifact Creature — Golem", "{2}", 2, 2);
const kithkin = () => creature("Kithkin Test", "Creature — Kithkin", "{W}", 1, 1);
const toxicBug = () => creature("Toxic Bug", "Creature — Insect", "{B}", 1, 5, { keywords: ["Toxic"], oracleText: "Toxic 1" });
const nonbasic = () => card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const snowSwamp = () => card("Snow-Covered Swamp", "Basic Snow Land — Swamp", "", { oracleText: "({T}: Add {B}.)" });

describe("pump spells with an \"also\" rider, and \"if that creature is a Human, put two counters instead\"", () => {
  it("are fully supported", () => supported(gimlisFury, rushTheRoom, blessingOfBelzenlok, hazardrootHerbalist, whenWeWereYoung, kytheonsTactics, swarmSurge, gallantFowlknight, sanctifiedCharge, hexgoldSlash, elderCathar));

  it("Gimli's Fury and Blessing of Belzenlok: the keyword only for a legendary creature", () => {
    for (const [spell, kw] of [[gimlisFury, "Trample"], [blessingOfBelzenlok, "Lifelink"]] as const) {
      let { s, ap, ids } = setup([spell, spell]);
      const plain = putOnBattlefield(s, ap, greenBear());
      const leg = putOnBattlefield(s, ap, legend());
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(plain)])));
      s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(leg)])));
      expect([has(s, plain, kw), has(s, leg, kw)]).toEqual([false, true]);
      expect(pt(s, leg)).toBe(spell === gimlisFury ? "5/4" : "4/3");
    }
  });

  it("Rush the Room: haste only for a Goblin or Orc", () => {
    let { s, ap, ids } = setup([rushTheRoom, rushTheRoom]);
    const b = putOnBattlefield(s, ap, greenBear(), { sick: true });
    const g = putOnBattlefield(s, ap, goblin(), { sick: true });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(g)])));
    expect([has(s, b, "First strike"), has(s, g, "First strike")]).toEqual([true, true]);
    expect([has(s, b, "Haste"), has(s, g, "Haste")]).toEqual([false, true]);
    expect(pt(s, g)).toBe("2/1");
  });

  it("Hazardroot Herbalist: deathtouch only when the target is a token", () => {
    for (const token of [false, true]) {
      let { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, hazardrootHerbalist);
      const b = putOnBattlefield(s, ap, greenBear());
      if (token) s.objects[b]!.isToken = true;
      s = toBlocks(s, ap, [{ attacker: b, defender: opp }], [tgt(b)]);
      expect(pt(s, b)).toBe("3/2");
      expect(has(s, b, "Deathtouch")).toBe(token);
    }
  });

  it("When We Were Young: lifelink only if you control an artifact and an enchantment", () => {
    for (const both of [false, true]) {
      let { s, ap, ids } = setup([whenWeWereYoung]);
      const a = putOnBattlefield(s, ap, greenBear());
      const b = putOnBattlefield(s, ap, greenBear());
      putOnBattlefield(s, ap, card("Test Rock", "Artifact", "{1}"));
      if (both) putOnBattlefield(s, ap, card("Test Aura", "Enchantment", "{W}"));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
      expect([pt(s, a), pt(s, b)]).toEqual(["4/4", "4/4"]);
      expect([has(s, a, "Lifelink"), has(s, b, "Lifelink")]).toEqual([both, both]);
    }
  });

  it("Kytheon's Tactics: vigilance with spell mastery", () => {
    for (const mastery of [false, true]) {
      let { s, ap, ids } = setup([kytheonsTactics]);
      const a = putOnBattlefield(s, ap, greenBear());
      for (let i = 0; i < (mastery ? 2 : 1); i++) into(s, ap, card("Test Bolt", "Instant", "{R}"), "graveyard");
      s = settle(run(s, planCast(s, ap, ids[0]!)));
      expect(pt(s, a)).toBe("4/3");
      expect(has(s, a, "Vigilance")).toBe(mastery);
    }
  });

  it("Swarm Surge, Gallant Fowlknight and Sanctified Charge: the first strike part only for that kind of creature", () => {
    let { s, ap, ids } = setup([swarmSurge, sanctifiedCharge, gallantFowlknight]);
    const b = putOnBattlefield(s, ap, greenBear());
    const g = putOnBattlefield(s, ap, golem());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect([pt(s, b), pt(s, g)]).toEqual(["4/2", "4/2"]);
    expect([has(s, b, "First strike"), has(s, g, "First strike")]).toEqual([false, true]);

    ({ s, ap, ids } = setup([sanctifiedCharge]));
    const w = putOnBattlefield(s, ap, human());
    const b2 = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect([pt(s, w), pt(s, b2)]).toEqual(["3/2", "4/3"]);
    expect([has(s, w, "First strike"), has(s, b2, "First strike")]).toEqual([true, false]);

    ({ s, ap, ids } = setup([gallantFowlknight]));
    const k = putOnBattlefield(s, ap, kithkin());
    const b3 = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect([pt(s, k), pt(s, b3), pt(s, ids[0]!)]).toEqual(["2/1", "3/2", "4/4"]);
    expect([has(s, k, "First strike"), has(s, b3, "First strike"), has(s, ids[0]!, "First strike")]).toEqual([true, false, true]);
  });

  it("Hexgold Slash deals 4 damage to a creature with toxic, 2 otherwise", () => {
    let { s, ap, opp, ids } = setup([hexgoldSlash, hexgoldSlash]);
    const a = putOnBattlefield(s, opp, toxicBug());
    const b = putOnBattlefield(s, opp, creature("Big Wall", "Creature — Wall", "{4}", 0, 5));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect([s.objects[a]!.damage, s.objects[b]!.damage]).toEqual([4, 2]);
  });

  it("Elder Cathar puts two counters on a Human, one on anything else", () => {
    for (const isHuman of [false, true]) {
      let { s, ap, ids } = setup([murder]);
      const c = putOnBattlefield(s, ap, elderCathar);
      const t = putOnBattlefield(s, ap, isHuman ? human() : greenBear());
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])), { targets: [tgt(t)] });
      expect(zone(s, c)).toBe("graveyard");
      expect(s.objects[t]!.counters["+1/+1"]).toBe(isHuman ? 2 : 1);
    }
  });
});

describe("\"Destroy target X. If that permanent was Y, ...\"", () => {
  it("are fully supported", () => supported(gloomwidowsFeast, filigreeFracture, moltenRain, chokingSands, lilianasDefeat, helldozer));

  it("Gloomwidow's Feast makes a Spider only if the flier was blue or black", () => {
    for (const blue of [false, true]) {
      let { s, ap, opp, ids } = setup([gloomwidowsFeast]);
      const f = putOnBattlefield(s, opp, blue ? blueBird() : creature("White Bird", "Creature — Bird", "{1}{W}", 1, 1, { keywords: ["Flying"] }));
      const before = s.battlefield.length;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(f)])));
      expect(zone(s, f)).toBe("graveyard");
      const spiders = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Spider"));
      expect(spiders.length).toBe(blue ? 1 : 0);
      expect(s.battlefield.length).toBe(before - 1 + (blue ? 1 : 0));
      if (blue) expect([pt(s, spiders[0]!), has(s, spiders[0]!, "Reach")]).toEqual(["1/2", true]);
    }
  });

  it("Filigree Fracture draws only if the permanent was blue or black", () => {
    for (const black of [false, true]) {
      let { s, ap, opp, ids } = setup([filigreeFracture]);
      const e = putOnBattlefield(s, opp, card("Test Pact", "Enchantment", black ? "{B}" : "{G}"));
      const hand = s.players[ap]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(e)])));
      expect(zone(s, e)).toBe("graveyard");
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + (black ? 1 : 0));
    }
  });

  it("Molten Rain and Choking Sands deal 2 damage to the controller of a nonbasic land", () => {
    for (const spell of [moltenRain, chokingSands]) {
      let { s, ap, opp, ids } = setup([spell, spell]);
      for (const l of [swamp, mountain]) putOnBattlefield(s, ap, l);
      for (const l of [swamp, mountain]) putOnBattlefield(s, ap, l);
      const basic = putOnBattlefield(s, opp, mountain);
      const other = putOnBattlefield(s, opp, nonbasic());
      const l = life(s, opp);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(basic)])));
      expect([zone(s, basic), life(s, opp)]).toEqual(["graveyard", l]);
      s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(other)])));
      expect([zone(s, other), life(s, opp)]).toEqual(["graveyard", l - 2]);
    }
  });

  it("Choking Sands can't target a Swamp", () => {
    let { s, ap, opp, ids } = setup([chokingSands]);
    const sw = putOnBattlefield(s, opp, swamp);
    expect(planCast(s, ap, ids[0]!, [tgt(sw)])).toBeNull();
  });

  it("Liliana's Defeat: 3 life only if it was a Liliana planeswalker", () => {
    let { s, ap, opp, ids } = setup([lilianasDefeat, lilianasDefeat]);
    const lili = putOnBattlefield(s, opp, card("Liliana, Test Witch", "Legendary Planeswalker — Liliana", "{2}{B}{B}", { loyalty: "5" }));
    s.objects[lili]!.counters.loyalty = 5;
    const zombie = putOnBattlefield(s, opp, creature("Black Zombie", "Creature — Zombie", "{1}{B}", 2, 2));
    const l = life(s, opp);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(zombie)])));
    expect([zone(s, zombie), life(s, opp)]).toEqual(["graveyard", l]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(lili)])));
    expect([zone(s, lili), life(s, opp)]).toEqual(["graveyard", l - 3]);
  });

  it("Helldozer untaps after destroying a nonbasic land", () => {
    for (const nb of [false, true]) {
      let { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, swamp);
      const h = putOnBattlefield(s, ap, helldozer);
      const land = putOnBattlefield(s, opp, nb ? nonbasic() : forest);
      s = settle(run(s, planActivate(s, ap, h, 0, [tgt(land)])));
      expect(zone(s, land)).toBe("graveyard");
      expect(s.objects[h]!.tapped).toBe(!nb);
    }
  });
});

/** A pending "discard N" answered with the first cards of that player's hand. */
const discardFirst = (s: GameState) => {
  const p = s.pending;
  if (p?.kind !== "discard") return s;
  return act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
};
const settleDiscards = (s: GameState) => {
  for (let i = 0; i < 10; i++) {
    s = settle(s);
    if (s.pending?.kind !== "discard") return s;
    s = discardFirst(s);
  }
  return s;
};

describe("hands, graveyards and discards", () => {
  it("are fully supported", () => supported(enemyOfEnlightenment, identityCrisis, akuDjinn, gerrardsVerdict, forget, aweForTheGuilds));

  it("Enemy of Enlightenment gets -1/-1 for each card in your opponents' hands", () => {
    let { s, ap } = setup([]);
    for (const p of s.turnOrder) if (p !== ap) s.players[p]!.hand = [];
    const e = putOnBattlefield(s, ap, enemyOfEnlightenment);
    expect(pt(s, e)).toBe("5/5");
    into(s, next(s, ap), greenBear());
    into(s, next(s, next(s, ap)), greenBear());
    into(s, ap, greenBear()); // your own hand doesn't count
    expect(pt(s, e)).toBe("3/3");
  });

  it("Identity Crisis exiles the target player's hand and graveyard", () => {
    let { s, ap, opp, ids } = setup([identityCrisis]);
    const g = into(s, opp, greenBear(), "graveyard");
    const h = into(s, opp, greenBear());
    const handSize = s.players[opp]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect([zone(s, g), zone(s, h)]).toEqual(["exile", "exile"]);
    expect([s.players[opp]!.hand.length, s.players[opp]!.graveyard.length]).toEqual([0, 0]);
    expect(handSize).toBeGreaterThan(1);
  });

  it("Aku Djinn puts a +1/+1 counter on each creature your opponents control at your upkeep", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, akuDjinn);
    const mine = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, greenBear());
    const third = putOnBattlefield(s, next(s, opp), greenBear());
    s = passUntil(s, "main1", next(s, ap));
    s = toUpkeep(s, ap);
    expect([s.objects[mine]!.counters["+1/+1"] ?? 0, s.objects[theirs]!.counters["+1/+1"], s.objects[third]!.counters["+1/+1"]]).toEqual([0, 1, 1]);
  });

  it("Gerrard's Verdict: 3 life for each land card discarded", () => {
    let { s, ap, opp, ids } = setup([gerrardsVerdict]);
    s.players[opp]!.hand = [];
    into(s, opp, forest);
    into(s, opp, greenBear());
    const l = life(s, ap);
    s = settleDiscards(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(life(s, ap)).toBe(l + 3);
  });

  it("Forget: the player discards two, then draws as many as they discarded", () => {
    for (const n of [1, 3]) {
      let { s, ap, opp, ids } = setup([forget]);
      s.players[opp]!.hand = [];
      for (let i = 0; i < n; i++) into(s, opp, greenBear());
      const lib = s.players[opp]!.library.length;
      s = settleDiscards(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
      const discarded = Math.min(n, 2);
      expect(s.players[opp]!.graveyard.length).toBe(discarded);
      expect(s.players[opp]!.library.length).toBe(lib - discarded);
      expect(s.players[opp]!.hand.length).toBe(n);
    }
  });

  it("Awe for the Guilds: monocolored creatures can't block this turn", () => {
    let { s, ap, opp, ids } = setup([aweForTheGuilds]);
    const a = putOnBattlefield(s, ap, greenBear());
    const mono = putOnBattlefield(s, opp, greenBear());
    const multi = putOnBattlefield(s, opp, creature("Gold Bear", "Creature — Bear", "{G}{W}", 2, 2));
    const colorless = putOnBattlefield(s, opp, golem());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    const o = (id: string) => s.objects[id]!;
    expect(blockProblem(s, o(mono), o(a))).not.toBeNull();
    expect(blockProblem(s, o(multi), o(a))).toBeNull();
    expect(blockProblem(s, o(colorless), o(a))).toBeNull();
  });
});

const wall = () => creature("Test Wall", "Creature — Wall", "{3}", 0, 5);
/** `pid` has priority with nothing on the stack, in the current step. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 20 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("\"unless its controller pays\" and \"destroy target blocking creature at end of combat\"", () => {
  it("are fully supported", () => supported(plagueFiend, rhysticDeluge, excise, silentAssassin));

  it("Plague Fiend destroys a creature it dealt combat damage to unless its controller pays {2}", () => {
    for (const pays of [false, true]) {
      let { s, ap, opp } = setup([]);
      const f = putOnBattlefield(s, ap, plagueFiend);
      const w = putOnBattlefield(s, opp, wall());
      putOnBattlefield(s, opp, forest);
      putOnBattlefield(s, opp, forest);
      s = toBlocks(s, ap, [{ attacker: f, defender: opp }]);
      s = block(s, opp, [{ blocker: w, attacker: f }]);
      s = settle(passUntil(s, "combatDamage", ap), { payers: pays ? [opp] : [] });
      expect(zone(s, w)).toBe(pays ? "battlefield" : "graveyard");
    }
  });

  it("Rhystic Deluge taps the creature unless its controller pays {1}", () => {
    for (const pays of [false, true]) {
      let { s, ap, opp } = setup([]);
      const d = putOnBattlefield(s, ap, rhysticDeluge);
      const b = putOnBattlefield(s, opp, greenBear());
      putOnBattlefield(s, opp, forest);
      s = settle(run(s, planActivate(s, ap, d, 0, [tgt(b)])), { payers: pays ? [opp] : [] });
      expect(s.objects[b]!.tapped ?? false).toBe(!pays);
    }
  });

  it("Excise exiles the attacking creature unless its controller pays {X}", () => {
    for (const lands of [1, 2]) {
      let { s, ap, ids } = setup([excise]);
      const opp = next(s, ap);
      const a = putOnBattlefield(s, opp, greenBear());
      for (let i = 0; i < lands; i++) putOnBattlefield(s, opp, forest);
      s = passUntil(s, "declareAttackers", opp);
      s = priorityTo(act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a, defender: ap }] }), ap);
      expect(planCast(s, ap, ids[0]!, [tgt(putOnBattlefield(s, ap, greenBear()))], undefined, undefined, 2)).toBeNull(); // only an attacking creature
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)], undefined, undefined, 2)), { payers: lands >= 2 ? [opp] : [] });
      expect(zone(s, a)).toBe(lands >= 2 ? "battlefield" : "exile");
    }
  });

  it("Silent Assassin destroys the blocker at end of combat, after combat damage", () => {
    let { s, ap, opp } = setup([]);
    const sa = putOnBattlefield(s, ap, silentAssassin);
    const b = putOnBattlefield(s, ap, greenBear());
    const w = putOnBattlefield(s, opp, wall());
    const idle = putOnBattlefield(s, opp, wall());
    s = toBlocks(s, ap, [{ attacker: b, defender: opp }]);
    s = priorityTo(block(s, opp, [{ blocker: w, attacker: b }]), ap);
    expect(planActivate(s, ap, sa, 0, [tgt(idle)])).toBeNull(); // only a blocking creature
    s = settle(run(s, planActivate(s, ap, sa, 0, [tgt(w)])));
    expect(zone(s, w)).toBe("battlefield");
    s = passUntil(s, "combatDamage", ap);
    expect([zone(s, w), s.objects[w]!.damage]).toEqual(["battlefield", 2]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(zone(s, w)).toBe("graveyard");
    expect(zone(s, idle)).toBe("battlefield");
  });

  it("bots aim Silent Assassin at an opponent's blocker", () => {
    const body = compileCard(silentAssassin).activated[0]!.body;
    expect(harmfulTargets(body)).toEqual([true]);
  });
});

describe("\"can't block or be blocked by\"", () => {
  it("are fully supported", () => supported(sneakyHomunculus, realmOfKoh, baboonSpirit, foggySwampSpiritKeeper, lostInTheSpiritWorld));

  it("Sneaky Homunculus can't block or be blocked by creatures with power 2 or greater", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, sneakyHomunculus);
    const ob = putOnBattlefield(s, opp, greenBear());
    const small = putOnBattlefield(s, opp, creature("Tiny Elf", "Creature — Elf", "{G}", 1, 1));
    s = toBlocks(s, ap, [{ attacker: h, defender: opp }]);
    const o = (id: string) => s.objects[id]!;
    expect(blockProblem(s, o(ob), o(h))).not.toBeNull();
    expect(blockProblem(s, o(small), o(h))).toBeNull();

    ({ s, ap, opp } = setup([]));
    const h2 = putOnBattlefield(s, ap, sneakyHomunculus);
    const big = putOnBattlefield(s, opp, greenBear());
    const tiny = putOnBattlefield(s, opp, creature("Tiny Elf", "Creature — Elf", "{G}", 1, 1));
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: big, defender: ap }, { attacker: tiny, defender: ap }] });
    expect(blockProblem(s, s.objects[h2]!, s.objects[big]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[h2]!, s.objects[tiny]!)).toBeNull();
  });

  it("Lost in the Spirit World: bounce, and a Spirit token that only fights Spirits", () => {
    let { s, ap, opp, ids } = setup([lostInTheSpiritWorld]);
    const ob = putOnBattlefield(s, opp, greenBear());
    const os = putOnBattlefield(s, opp, creature("Test Spirit", "Creature — Spirit", "{1}{W}", 1, 1));
    const ob2 = putOnBattlefield(s, opp, greenBear());
    const before = new Set(s.battlefield);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ob)])));
    expect(zone(s, ob)).toBe("hand");
    const tok = s.battlefield.find((id) => !before.has(id))!;
    expect([pt(s, tok), characteristics(s, s.objects[tok]!).subtypes, characteristics(s, s.objects[tok]!).colors]).toEqual(["1/1", ["Spirit"], []]);
    s.objects[tok]!.controlledSinceTurn = -1;
    s = toBlocks(s, ap, [{ attacker: tok, defender: opp }]);
    expect(blockProblem(s, s.objects[ob2]!, s.objects[tok]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[os]!, s.objects[tok]!)).toBeNull();
  });

  it("Realm of Koh enters untapped with a basic land, and makes the Spirit token", () => {
    let { s, ap, ids } = setup([realmOfKoh]);
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.tapped ?? false).toBe(false);
    s.objects[ids[0]!]!.tapped = false;
    const before = new Set(s.battlefield);
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0)));
    const tok = s.battlefield.filter((id) => !before.has(id));
    expect(tok.map((id) => characteristics(s, s.objects[id]!).subtypes)).toEqual([["Spirit"]]);
  });
});

const faceDown = (s: GameState, ap: PlayerId, id: string) => settle(run(s, planCast(s, ap, id, undefined, undefined, "auto", undefined, { faceDown: true })));
const ofType = (s: GameState, sub: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes(sub));

describe("\"When ~ enters or is turned face up\"", () => {
  it("are fully supported", () => supported(ponybackBrigade, gadgetTechnician, culvertAmbusher, rakishScoundrel, offenderAtLarge, efreetWeaponmaster));

  it("Ponyback Brigade makes three Goblins when cast face up, and when turned face up, but not face down (CR 708.8)", () => {
    let { s, ap, ids } = setup([ponybackBrigade]);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(ofType(s, "Goblin").filter((id) => id !== ids[0]).length).toBe(3);

    ({ s, ap, ids } = setup([ponybackBrigade]));
    for (const l of [mountain, plainsCard, swamp]) putOnBattlefield(s, ap, l);
    s = faceDown(s, ap, ids[0]!);
    expect(ofType(s, "Goblin").length).toBe(0);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(ofType(s, "Goblin").filter((id) => id !== ids[0]).length).toBe(3);
  });

  it("Gadget Technician makes a Thopter when turned face up; Rakish Scoundrel makes its target indestructible", () => {
    let { s, ap, ids } = setup([gadgetTechnician, rakishScoundrel]);
    for (const l of [forest, forest, swamp, swamp]) putOnBattlefield(s, ap, l);
    s = faceDown(s, ap, ids[0]!);
    expect(ofType(s, "Thopter").length).toBe(0);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(ofType(s, "Thopter").length).toBe(1);
    const b = putOnBattlefield(s, ap, greenBear());
    s = faceDown(s, ap, ids[1]!);
    expect(has(s, b, "Indestructible")).toBe(false);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[1]!)), { targets: [tgt(b)] });
    expect(has(s, b, "Indestructible")).toBe(true);
  });
});

describe("\"nonattacking\" targets", () => {
  it("are fully supported", () => supported(alarum, ruthlessInstincts, spidermanToTheRescue));

  it("Alarum untaps a nonattacking creature and gives it +1/+3; an attacking one can't be targeted", () => {
    let { s, ap, ids } = setup([alarum]);
    const opp = next(s, ap);
    const a = putOnBattlefield(s, opp, greenBear());
    const mine = putOnBattlefield(s, ap, greenBear());
    s.objects[mine]!.tapped = true;
    s = passUntil(s, "declareAttackers", opp);
    s = priorityTo(act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a, defender: ap }] }), ap);
    expect(planCast(s, ap, ids[0]!, [tgt(a)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(mine)])));
    expect([s.objects[mine]!.tapped ?? false, pt(s, mine)]).toEqual([false, "3/5"]);
  });

  it("Ruthless Instincts: reach, deathtouch and untap for a nonattacking creature, or +2/+2 and trample for an attacker", () => {
    let { s, ap, opp, ids } = setup([ruthlessInstincts, ruthlessInstincts]);
    const att = putOnBattlefield(s, ap, greenBear());
    const home = putOnBattlefield(s, ap, greenBear());
    s.objects[home]!.tapped = true;
    s = passUntil(s, "declareAttackers", ap);
    s = priorityTo(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] }), ap);
    expect(planCast(s, ap, ids[0]!, [tgt(att)], [0])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(home)], [1])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(home)], [0])));
    expect([s.objects[home]!.tapped ?? false, has(s, home, "Reach"), has(s, home, "Deathtouch")]).toEqual([false, true, true]);
    s = priorityTo(s, ap);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(att)], [1])));
    expect([pt(s, att), has(s, att, "Trample")]).toEqual(["4/4", true]);
  });

  it("Spider-Man, To the Rescue: tap him to make another nonattacking creature indestructible", () => {
    let { s, ap, ids } = setup([spidermanToTheRescue]);
    const b = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)), { yes: true, targets: [tgt(b)] });
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    expect(has(s, b, "Indestructible")).toBe(true);
  });
});

describe("detain", () => {
  it("are fully supported", () => supported(lyevDecree, azoriusJusticiar, archonOfTheTriumvirate, laviniaOfTheTenth));

  const attackers = (s: GameState, pid: PlayerId) => potentialAttackers(s, pid).map((o) => o.id);

  it("Lyev Decree detains up to two creatures until your next turn", () => {
    let { s, ap, opp, ids } = setup([lyevDecree]);
    const [a, b, c] = [greenBear(), greenBear(), greenBear()].map((d) => putOnBattlefield(s, opp, d));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a!), tgt(b!)])));
    s = passUntil(s, "main1", opp);
    expect(attackers(s, opp).filter((id) => [a, b, c].includes(id))).toEqual([c]);
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "main1", opp);
    expect(attackers(s, opp).filter((id) => [a, b, c].includes(id)).sort()).toEqual([a, b, c].sort());
  });

  it("Azorius Justiciar detains when it enters; Archon of the Triumvirate when it attacks", () => {
    let { s, ap, opp, ids } = setup([azoriusJusticiar]);
    const a = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)), { targets: [tgt(a), { kind: "none" }] });
    s = passUntil(s, "main1", opp);
    expect(attackers(s, opp)).not.toContain(a);

    ({ s, ap, opp } = setup([]));
    const archon = putOnBattlefield(s, ap, archonOfTheTriumvirate);
    const spider = () => creature("Reach Spider", "Creature — Spider", "{1}{G}", 1, 3, { keywords: ["Reach"], oracleText: "Reach" });
    const [x, y] = [putOnBattlefield(s, opp, spider()), putOnBattlefield(s, opp, spider())];
    s = settle(toBlocks(s, ap, [{ attacker: archon, defender: opp }], [tgt(x), { kind: "none" }]));
    expect(blockProblem(s, s.objects[x]!, s.objects[archon]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[y]!, s.objects[archon]!)).toBeNull();
  });

  it("Lavinia of the Tenth detains each nonland permanent with mana value 4 or less, as it resolves", () => {
    let { s, ap, opp, ids } = setup([laviniaOfTheTenth]);
    const small = putOnBattlefield(s, opp, greenBear());
    const big = putOnBattlefield(s, opp, creature("Big Test", "Creature — Wurm", "{4}{G}", 5, 5));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const later = putOnBattlefield(s, opp, greenBear());
    s = passUntil(s, "main1", opp);
    const can = attackers(s, opp);
    expect([can.includes(small), can.includes(big), can.includes(later)]).toEqual([false, true, true]);
  });
});

describe("more of the round's cards", () => {
  it("are fully supported", () => supported(burningSunCavalry, weatherseedTotem, razorGolem, quirionDryad, kathariBomber));

  it("Burning Sun Cavalry gets +1/+1 when it attacks only while you control a Dinosaur", () => {
    for (const dino of [false, true]) {
      let { s, ap, opp } = setup([]);
      const c = putOnBattlefield(s, ap, burningSunCavalry);
      if (dino) putOnBattlefield(s, ap, creature("Test Dinosaur", "Creature — Dinosaur", "{2}{R}", 3, 3));
      s = toBlocks(s, ap, [{ attacker: c, defender: opp }]);
      expect(pt(s, c)).toBe(dino ? "3/3" : "2/2");
    }
  });

  it("Weatherseed Totem returns to your hand when it dies as a creature, not when destroyed as an artifact", () => {
    const shatter = card("Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
    for (const animated of [false, true]) {
      let { s, ap, ids } = setup([shatter]);
      const t = putOnBattlefield(s, ap, weatherseedTotem);
      if (animated) {
        s = settle(run(s, planActivate(s, ap, t, 0)));
        expect(pt(s, t)).toBe("5/3");
        expect(types(s, t)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      }
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
      expect(zone(s, t)).toBe(animated ? "hand" : "graveyard");
    }
  });

  it("Razor Golem costs {1} less for each Plains you control", () => {
    let { s, ap, ids } = setup([razorGolem]);
    const plan = planCast(s, ap, ids[0]!)!;
    s = settle(run(s, plan));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(3); // three Plains from setup
  });

  it("Quirion Dryad grows for white, blue, black or red spells, not green ones", () => {
    const spell = (name: string, cost: string) => card(name, "Instant", cost, { oracleText: "You gain 1 life." });
    let { s, ap, ids } = setup([spell("Green Prayer", "{G}"), spell("White Prayer", "{W}"), spell("Gold Prayer", "{G}{U}")]);
    const d = putOnBattlefield(s, ap, quirionDryad);
    for (const id of ids) s = settle(run(s, planCast(s, ap, id)));
    expect(s.objects[d]!.counters["+1/+1"]).toBe(2);
  });

  it("Kathari Bomber makes two Goblins and is sacrificed when it deals combat damage to a player", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kathariBomber);
    s = block(toBlocks(s, ap, [{ attacker: k, defender: opp }]), opp, []);
    s = settle(passUntil(s, "combatDamage", ap));
    expect(zone(s, k)).toBe("graveyard");
    expect(ofType(s, "Goblin").length).toBe(2);
  });
});

describe("\"an opponent was dealt damage this turn\", and the rest of the conditions", () => {
  it("War Elemental is sacrificed unless an opponent was dealt damage this turn", () => {
    for (const damaged of [false, true]) {
      let { s, ap, opp, ids } = setup([warElemental]);
      if (damaged) s.damagedThisTurn = [opp];
      s = settle(run(s, planCast(s, ap, ids[0]!)));
      expect(zone(s, ids[0]!)).toBe(damaged ? "battlefield" : "graveyard");
    }
  });

  it("Skarrgan Firebird returns from your graveyard only once an opponent was dealt damage this turn", () => {
    let { s, ap, opp } = setup([]);
    const f = into(s, ap, skarrganFirebird, "graveyard");
    expect(planActivate(s, ap, f, 0)).toBeNull();
    s.damagedThisTurn = [ap];
    expect(planActivate(s, ap, f, 0)).toBeNull();
    s.damagedThisTurn = [ap, opp];
    s = settle(run(s, planActivate(s, ap, f, 0)));
    expect(zone(s, f)).toBe("hand");
  });

  it("Banishing Slash destroys a tapped creature, and makes a Samurai with an artifact and an enchantment", () => {
    for (const both of [false, true]) {
      let { s, ap, opp, ids } = setup([banishingSlash]);
      const b = putOnBattlefield(s, opp, greenBear());
      const untapped = putOnBattlefield(s, opp, greenBear());
      s.objects[b]!.tapped = true;
      putOnBattlefield(s, ap, card("Test Rock", "Artifact", "{1}"));
      if (both) putOnBattlefield(s, ap, card("Test Aura", "Enchantment", "{W}"));
      expect(planCast(s, ap, ids[0]!, [tgt(untapped)])).toBeNull();
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
      expect(zone(s, b)).toBe("graveyard");
      const samurai = ofType(s, "Samurai");
      expect(samurai.length).toBe(both ? 1 : 0);
      if (both) expect([pt(s, samurai[0]!), has(s, samurai[0]!, "Vigilance")]).toEqual(["2/2", true]);
    }
  });

  it("Reckless Cohort must attack unless you control another Ally", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, recklessCohort);
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/attacks each combat if able/);
    putOnBattlefield(s, ap, creature("Test Ally", "Creature — Human Ally", "{1}{W}", 2, 2));
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
  });

  it("Jiang Yanggu's −1 makes Mowu only if you don't control one", () => {
    let { s, ap } = setup([]);
    const j = putOnBattlefield(s, ap, jiangYanggu);
    s.objects[j]!.counters.loyalty = 4;
    const mowu = (st: GameState) => st.battlefield.filter((id) => characteristics(st, st.objects[id]!).name === "Mowu");
    s = settle(run(s, planActivate(s, ap, j, 1)));
    expect(mowu(s).length).toBe(1);
    expect(pt(s, mowu(s)[0]!)).toBe("3/3");
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    s = settle(run(s, planActivate(s, ap, j, 1)));
    expect(mowu(s).length).toBe(1);
    expect(s.objects[j]!.counters.loyalty).toBe(2);
  });

  it("Baboon Spirit makes a Spirit token when another nontoken Spirit you control enters", () => {
    let { s, ap, ids } = setup([creature("Test Spirit", "Creature — Spirit", "{1}{W}", 1, 1), greenBear()]);
    putOnBattlefield(s, ap, baboonSpirit);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(ofType(s, "Spirit").length).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(ofType(s, "Spirit").length).toBe(3);
  });
});
