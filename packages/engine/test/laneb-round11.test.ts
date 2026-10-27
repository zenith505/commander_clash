// Lane B, round 11: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, forest, island, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a pick
 * gets `pick` (or the first ones offered); a discard the first cards in hand. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; pick?: string[] } = {}) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
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
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1);
const redGoblin = () => creature("Red Goblin", "Creature — Goblin", "{R}", 1, 1);
const gwElf = () => creature("Green-White Elf", "Creature — Elf", "{G}{W}", 2, 2, { colors: ["G", "W"] });
const bigOgre = () => creature("Big Ogre", "Creature — Ogre", "{4}{R}", 6, 6);
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A card put on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);
/** Attackers declared, the game paused on the defending players' blocks. */
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
/** Everyone passes (answering as `settle` does) until the game reaches `step` of `pid`'s turn. */
const passTo = (s: GameState, step: GameState["step"], pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => {
  for (let i = 0; i < 400 && !(s.step === step && s.activePlayer === pid && !s.stack.length && !s.pending); i++) {
    if (s.pending || s.stack.length || s.triggerQueue.length) {
      const before = JSON.stringify([s.pending, s.stack.length]);
      s = settle(s, opts);
      if (s.pending && JSON.stringify([s.pending, s.stack.length]) === before) throw new Error(`stuck on ${s.pending.kind}`);
    } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** `pid`'s hand put on the bottom of their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
};
const testShock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const testMill = () => card("Test Mill", "Sorcery", "{U}", { cmc: 1, oracleText: "Mill three cards." });
const testRaze = () => card("Test Raze", "Sorcery", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const wastes = card("Wastes", "Basic Land", "");
const vehicle = () => card("Test Cart", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", keywords: ["Crew"], oracleText: "Crew 1" });


// Real oracle text (Scryfall).
const harvesterOfMisery = card("Harvester of Misery", "Creature — Spirit", "{3}{B}{B}", { cmc: 5, power: "5", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nWhen this creature enters, other creatures get -2/-2 until end of turn.\n{1}{B}, Discard this card: Target creature gets -2/-2 until end of turn." });
const phthisis = card("Phthisis", "Sorcery", "{3}{B}{B}{B}{B}", { cmc: 7, keywords: ["Suspend"], oracleText: "Destroy target creature. Its controller loses life equal to its power plus its toughness.\nSuspend 5—{1}{B} (Rather than cast this card from your hand, you may pay {1}{B} and exile it with five time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
const predatorsRapport = card("Predator's Rapport", "Instant", "{2}{G}", { cmc: 3, oracleText: "Choose target creature you control. You gain life equal to that creature's power plus its toughness." });
const turtleduck = card("Turtle-Duck", "Creature — Turtle Bird", "{G}", { cmc: 1, power: "0", toughness: "4", oracleText: "{3}: Until end of turn, this creature has base power 4 and gains trample." });
const championOfStraySouls = card("Champion of Stray Souls", "Creature — Skeleton Warrior", "{4}{B}{B}", { cmc: 6, power: "4", toughness: "4", oracleText: "{3}{B}{B}, {T}, Sacrifice X other creatures: Return X target creature cards from your graveyard to the battlefield.\n{5}{B}{B}: Put this card from your graveyard on top of your library." });
const fearsomeAwakening = card("Fearsome Awakening", "Sorcery", "{4}{B}", { cmc: 5, oracleText: "Return target creature card from your graveyard to the battlefield. If it's a Dragon, put two +1/+1 counters on it." });
const craterElemental = card("Crater Elemental", "Creature — Elemental", "{2}{R}", { cmc: 3, power: "0", toughness: "6", keywords: ["Formidable"], oracleText: "{R}, {T}, Sacrifice this creature: It deals 4 damage to target creature.\nFormidable — {2}{R}: This creature has base power 8 until end of turn. Activate only if creatures you control have total power 8 or greater." });
const defyDeath = card("Defy Death", "Sorcery", "{3}{W}{W}", { cmc: 5, oracleText: "Return target creature card from your graveyard to the battlefield. If it's an Angel, put two +1/+1 counters on it." });
const intimidationBolt = card("Intimidation Bolt", "Instant", "{1}{R}{W}", { cmc: 3, colors: ["R","W"], oracleText: "Intimidation Bolt deals 3 damage to target creature. Other creatures can't attack this turn." });
const islandOfWakwak = card("Island of Wak-Wak", "Land", "", { cmc: 0, oracleText: "{T}: Target creature with flying has base power 0 until end of turn." });
const singingTree = card("Singing Tree", "Creature — Plant", "{3}{G}", { cmc: 4, power: "0", toughness: "3", oracleText: "{T}: Target attacking creature has base power 0 until end of turn." });
const symmetrySage = card("Symmetry Sage", "Creature — Human Wizard", "{U}", { cmc: 1, power: "0", toughness: "2", keywords: ["Flying","Magecraft"], oracleText: "Flying\nMagecraft — Whenever you cast or copy an instant or sorcery spell, target creature you control has base power 2 until end of turn." });
const leylineOfSingularity = card("Leyline of Singularity", "Enchantment", "{2}{U}{U}", { cmc: 4, oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nAll nonland permanents are legendary." });
const inBolassClutches = card("In Bolas's Clutches", "Legendary Enchantment — Aura", "{4}{U}{U}", { cmc: 6, keywords: ["Enchant"], oracleText: "Enchant permanent\nYou control enchanted permanent.\nEnchanted permanent is legendary." });
const hunterSliver = card("Hunter Sliver", "Creature — Sliver", "{1}{R}", { cmc: 2, power: "1", toughness: "1", oracleText: "All Sliver creatures have provoke. (Whenever a Sliver attacks, its controller may have target creature defending player controls untap and block it if able.)" });
const frozenInIce = card("Frozen in Ice", "Enchantment — Aura", "{2}{U}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature loses all abilities and can't become untapped." });
const rope = card("Rope", "Artifact — Clue Equipment", "{G}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+2, has reach, and can't be blocked by more than one creature.\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {3}" });
const kruphixsInsight = card("Kruphix's Insight", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Reveal the top six cards of your library. Put up to three enchantment cards from among them into your hand and the rest of the revealed cards into your graveyard." });
const glacialRevelation = card("Glacial Revelation", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Reveal the top six cards of your library. You may put any number of snow permanent cards from among them into your hand. Put the rest into your graveyard." });
const piecesOfThePuzzle = card("Pieces of the Puzzle", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Reveal the top five cards of your library. Put up to two instant and/or sorcery cards from among them into your hand and the rest into your graveyard." });
const spoilsOfVictory = card("Spoils of Victory", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Search your library for a Plains, Island, Swamp, Mountain, or Forest card and put that card onto the battlefield. Then shuffle." });
const specimenFreighter = card("Specimen Freighter", "Artifact — Spacecraft", "{5}{U}", { cmc: 6, power: "4", toughness: "7", keywords: ["Station","Mill"], oracleText: "When this Spacecraft enters, return up to two target non-Spacecraft creatures to their owners' hands.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 9+.)\n9+ | Flying\nWhenever this Spacecraft attacks, defending player mills four cards." });
const fanaticOfTheHarrowing = card("Fanatic of the Harrowing", "Creature — Human Cleric", "{3}{B}", { cmc: 4, power: "2", toughness: "2", oracleText: "When this creature enters, each player discards a card. If you discarded a card this way, draw a card." });
const doesMachines = card("Does Machines", "Enchantment — Class", "{1}{U}", { cmc: 2, keywords: ["Mill"], oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, mill two cards, draw two cards, then discard two cards.\n{1}{U}: Level 2\nWhen this Class becomes level 2, return up to two target artifact cards from your graveyard to your hand.\n{4}{U}: Level 3\nAt the beginning of combat on your turn, put three +1/+1 counters on target artifact you control. If it isn't a creature, it becomes a 0/0 Robot creature in addition to its other types." });
const theThanoscopter = card("The Thanos-Copter", "Legendary Artifact — Vehicle", "{6}", { cmc: 6, power: "5", toughness: "5", keywords: ["Flying","Haste","Crew"], oracleText: "Flying, haste\nWhen The Thanos-Copter enters, Vehicles you control become artifact creatures until end of turn.\nWhenever a Vehicle you control deals combat damage to a player, draw a card.\nCrew 2" });
const tectonicInstability = card("Tectonic Instability", "Enchantment", "{2}{R}", { cmc: 3, oracleText: "Whenever a land enters, tap all lands its controller controls." });
const sonarStrike = card("Sonar Strike", "Instant", "{1}{W}", { cmc: 2, oracleText: "Sonar Strike deals 4 damage to target attacking, blocking, or tapped creature. You gain 3 life if you control a Bat." });
const interpretTheSigns = card("Interpret the Signs", "Sorcery", "{5}{U}", { cmc: 6, keywords: ["Scry"], oracleText: "Scry 3, then reveal the top card of your library. Draw cards equal to that card's mana value. (To scry 3, look at the top three cards of your library, then put any number of them on the bottom and the rest on top in any order.)" });
const sifterWurm = card("Sifter Wurm", "Creature — Wurm", "{5}{G}{G}", { cmc: 7, power: "7", toughness: "7", keywords: ["Trample","Scry"], oracleText: "Trample\nWhen this creature enters, scry 3, then reveal the top card of your library. You gain life equal to that card's mana value." });
const triumphantChomp = card("Triumphant Chomp", "Sorcery", "{R}", { cmc: 1, oracleText: "Triumphant Chomp deals damage to target creature equal to 2 or the greatest power among Dinosaurs you control, whichever is greater." });
const goldenRatio = card("Golden Ratio", "Sorcery", "{1}{G}{U}", { cmc: 3, colors: ["G","U"], oracleText: "Draw a card for each different power among creatures you control." });
const corruptedResolve = card("Corrupted Resolve", "Instant", "{1}{U}", { cmc: 2, oracleText: "Counter target spell if its controller is poisoned." });
const hokoriDustDrinker = card("Hokori, Dust Drinker", "Legendary Creature — Spirit", "{2}{W}{W}", { cmc: 4, power: "2", toughness: "2", oracleText: "Lands don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player untaps a land they control." });
const risingWaters = card("Rising Waters", "Enchantment", "{3}{U}", { cmc: 4, oracleText: "Lands don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player untaps a land they control." });
const unexpectedlyAbsent = card("Unexpectedly Absent", "Instant", "{X}{W}{W}", { cmc: 2, oracleText: "Put target nonland permanent into its owner's library just beneath the top X cards of that library." });
const kirtarsWrath = card("Kirtar's Wrath", "Sorcery", "{4}{W}{W}", { cmc: 6, keywords: ["Threshold"], oracleText: "Destroy all creatures. They can't be regenerated.\nThreshold — If there are seven or more cards in your graveyard, instead destroy all creatures, then create two 1/1 white Spirit creature tokens with flying. Creatures destroyed this way can't be regenerated." });
const sianiEyeOfTheStorm = card("Siani, Eye of the Storm", "Legendary Creature — Djinn Monk", "{3}{U}", { cmc: 4, power: "3", toughness: "2", keywords: ["Scry","Flying","Partner"], oracleText: "Flying\nWhenever Siani attacks, scry X, where X is the number of attacking creatures with flying.\nPartner (You can have two commanders if both have partner.)" });
const acolyteHybrid = card("Acolyte Hybrid", "Creature — Tyranid Human", "{2}{R}", { cmc: 3, power: "2", toughness: "2", keywords: ["Heavy Rock Cutter"], oracleText: "Heavy Rock Cutter — Whenever this creature attacks, destroy up to one target artifact. If an artifact is destroyed this way, its controller draws a card." });
const sophinaSpearsageDeserter = card("Sophina, Spearsage Deserter", "Legendary Creature — Human Soldier", "{2}{R}{W}", { cmc: 4, power: "4", toughness: "4", keywords: ["Investigate","Partner","Menace"], colors: ["R","W"], oracleText: "Menace\nWhenever Sophina, Spearsage Deserter attacks, investigate once for each nontoken attacking creature. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this artifact: Draw a card.\")\nPartner—Friends forever (You can have two commanders if both have this ability.)" });
const savagePunch = card("Savage Punch", "Sorcery", "{1}{G}", { cmc: 2, keywords: ["Ferocious","Fight"], oracleText: "Target creature you control fights target creature you don't control.\nFerocious — The creature you control gets +2/+2 until end of turn before it fights if you control a creature with power 4 or greater." });
const seeBeyond = card("See Beyond", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Draw two cards, then shuffle a card from your hand into your library." });
const rootsOfWisdom = card("Roots of Wisdom", "Sorcery", "{1}{G}", { cmc: 2, keywords: ["Mill"], oracleText: "Mill three cards, then return a land card or Elf card from your graveyard to your hand. If you can't, draw a card. (To mill a card, put the top card of your library into your graveyard.)" });
const patronOfTheOrochi = card("Patron of the Orochi", "Legendary Creature — Spirit", "{6}{G}{G}", { cmc: 8, power: "7", toughness: "7", keywords: ["Offering"], oracleText: "Snake offering (You may cast this spell any time you could cast an instant by sacrificing a Snake and paying the difference in mana costs between this and the sacrificed Snake. Mana cost includes color.)\n{T}: Untap all Forests and all green creatures. Activate only once each turn." });
const vampireScrivener = card("Vampire Scrivener", "Creature — Vampire Warlock", "{4}{B}", { cmc: 5, power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever you gain life during your turn, put a +1/+1 counter on this creature.\nWhenever you lose life during your turn, put a +1/+1 counter on this creature." });
const whiteGloveGourmand = card("White Glove Gourmand", "Creature — Human Noble", "{2}{W}{B}", { cmc: 4, power: "2", toughness: "2", keywords: ["Food"], colors: ["B","W"], oracleText: "When this creature enters, create two 1/1 white Human Soldier creature tokens.\nAt the beginning of your end step, if another Human died under your control this turn, create a Food token." });
const bearerOfTheHeavens = card("Bearer of the Heavens", "Creature — Giant", "{7}{R}", { cmc: 8, power: "10", toughness: "10", oracleText: "When this creature dies, destroy all permanents at the beginning of the next end step." });
const moralityShift = card("Morality Shift", "Sorcery", "{5}{B}{B}", { cmc: 7, oracleText: "Exchange your graveyard and library. Then shuffle your library." });
const arbiterOfKnollridge = card("Arbiter of Knollridge", "Creature — Giant Wizard", "{6}{W}", { cmc: 7, power: "5", toughness: "5", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, each player's life total becomes the highest life total among all players." });
const grimGiganotosaurus = card("Grim Giganotosaurus", "Creature — Dinosaur", "{5}{B}{G}", { cmc: 7, power: "10", toughness: "10", keywords: ["Monstrosity"], colors: ["B","G"], oracleText: "{10}{B}{G}: Monstrosity 10. This ability costs {1} less to activate for each creature with power 4 or greater your opponents control. (If this creature isn't monstrous, put ten +1/+1 counters on it and it becomes monstrous.)\nWhen this creature becomes monstrous, destroy all artifacts and creatures other than this creature." });
const invincibleHymn = card("Invincible Hymn", "Sorcery", "{6}{W}{W}", { cmc: 8, oracleText: "Count the number of cards in your library. Your life total becomes that number." });
const livingLands = card("Living Lands", "Enchantment", "{3}{G}", { cmc: 4, oracleText: "All Forests are 1/1 creatures that are still lands." });
const kormusBell = card("Kormus Bell", "Artifact", "{4}", { cmc: 4, oracleText: "All Swamps are 1/1 black creatures that are still lands." });
const naturesRevolt = card("Nature's Revolt", "Enchantment", "{3}{G}{G}", { cmc: 5, oracleText: "All lands are 2/2 creatures that are still lands." });
const bitterChill = card("Bitter Chill", "Enchantment — Aura", "{1}{U}", { cmc: 2, keywords: ["Enchant","Scry"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\nWhen this Aura is put into a graveyard from the battlefield, you may pay {1}. If you do, scry 1, then draw a card." });
const customsDepot = card("Customs Depot", "Enchantment", "{1}{U}", { cmc: 2, oracleText: "Whenever you cast a creature spell, you may pay {1}. If you do, draw a card, then discard a card." });
const dromarTheBanisher = card("Dromar, the Banisher", "Legendary Creature — Dragon", "{3}{W}{U}{B}", { cmc: 6, power: "6", toughness: "6", keywords: ["Flying"], colors: ["B","U","W"], oracleText: "Flying\nWhenever Dromar deals combat damage to a player, you may pay {2}{U}. If you do, choose a color, then return all creatures of that color to their owners' hands." });
const livingPlane = card("Living Plane", "World Enchantment", "{2}{G}{G}", { cmc: 4, oracleText: "All lands are 1/1 creatures that are still lands." });
const shadowheartClericOfOrder = card("Shadowheart, Cleric of Order", "Legendary Creature — Human Elf Cleric", "{1}{W}{B}", { cmc: 3, power: "4", toughness: "4", keywords: ["Deathtouch"], colors: ["B","W"], oracleText: "Deathtouch\nAt the beginning of your end step, Shadowheart, Cleric of Order deals 1 damage to each player.\nWhenever you lose life during your turn, create a 2/2 white Knight creature token." });
const shadowheartClericOfTrickery = card("Shadowheart, Cleric of Trickery", "Legendary Creature — Human Elf Cleric", "{1}{U}{B}", { cmc: 3, power: "4", toughness: "4", keywords: ["Deathtouch"], colors: ["B","U"], oracleText: "Deathtouch\nAt the beginning of your end step, Shadowheart, Cleric of Trickery deals 1 damage to each player.\nWhenever you lose life during your turn, draw a card." });
const shadowheartClericOfTwilight = card("Shadowheart, Cleric of Twilight", "Legendary Creature — Human Elf Cleric", "{1}{B}{G}", { cmc: 3, power: "4", toughness: "4", keywords: ["Deathtouch"], colors: ["B","G"], oracleText: "Deathtouch\nShadowheart, Cleric of Twilight can't be blocked by creatures with power 2 or less.\nAt the beginning of your end step, Shadowheart deals 1 damage to each player.\nWhenever you lose life during your turn, put a +1/+1 counter on Shadowheart." });
const sparkshaperVisionary = card("Sparkshaper Visionary", "Creature — Human Wizard", "{2}{U}", { cmc: 3, power: "0", toughness: "5", keywords: ["Scry"], oracleText: "At the beginning of combat on your turn, choose any number of target planeswalkers you control. Until end of turn, they become 3/3 blue Bird creatures with flying, hexproof, and \"Whenever this creature deals combat damage to a player, scry 1.\" (They're no longer planeswalkers. Loyalty abilities can still be activated.)" });
// END CARDS

describe("Batch 1", () => {
  it("are fully supported", () => supported(harvesterOfMisery, phthisis, predatorsRapport, turtleduck, championOfStraySouls, fearsomeAwakening));

  it("Harvester of Misery gives every other creature -2/-2, anyone's, until end of turn", () => {
    let { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, bigOgre());
    const theirs = putOnBattlefield(s, opp, bigOgre());
    const bear = putOnBattlefield(s, opp, greenBear());
    s.players[ap]!.hand = [];
    const h = into(s, ap, harvesterOfMisery);
    putOnBattlefield(s, ap, swamp);
    putOnBattlefield(s, ap, swamp);
    s = settle(run(s, planCast(s, ap, h, [])));
    expect(zone(s, h)).toBe("battlefield");
    expect(pt(s, h)).toBe("5/4");
    expect(pt(s, mine)).toBe("4/4");
    expect(pt(s, theirs)).toBe("4/4");
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Phthisis: the controller loses life equal to the destroyed creature's power plus toughness", () => {
    let { s, ap, opp, ids } = setup([phthisis]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    addEffect(s, opp, [ogre], [{ kind: "modifyPT", power: 1, toughness: 0 }]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(zone(s, ogre)).toBe("graveyard");
    expect(life(s, opp)).toBe(40 - 13);
    expect(life(s, ap)).toBe(40);
  });

  it("Predator's Rapport gains power plus toughness", () => {
    let { s, ap, ids } = setup([predatorsRapport]);
    const ogre = putOnBattlefield(s, ap, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(life(s, ap)).toBe(52);
  });

  it("Turtle-Duck has base power 4 and trample until end of turn; pumps still apply", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, turtleduck);
    addEffect(s, ap, [t], [{ kind: "modifyPT", power: 1, toughness: 1 }]);
    expect(pt(s, t)).toBe("1/5");
    s = settle(run(s, planActivate(s, ap, t, 0, [])));
    expect(pt(s, t)).toBe("5/5");
    expect(has(s, t, "Trample")).toBe(true);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(pt(s, t)).toBe("0/4");
  });

  it("Champion of Stray Souls goes from your graveyard to the top of your library", () => {
    let { s, ap } = setup([]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const c = into(s, ap, championOfStraySouls, "graveyard");
    s = settle(run(s, planActivate(s, ap, c, 1, [])));
    expect(s.players[ap]!.library[0]).toBe(c);
    expect(zone(s, c)).toBe("library");
  });

  it("Fearsome Awakening: two +1/+1 counters only on a Dragon", () => {
    let { s, ap, ids } = setup([fearsomeAwakening, fearsomeAwakening]);
    const dragon = into(s, ap, creature("Test Dragon", "Creature — Dragon", "{4}{R}", 4, 4), "graveyard");
    const bear = into(s, ap, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dragon)])));
    expect(zone(s, dragon)).toBe("battlefield");
    expect(pt(s, dragon)).toBe("6/6");
    putOnBattlefield(s, ap, swamp);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect(zone(s, bear)).toBe("battlefield");
    expect(pt(s, bear)).toBe("2/2");
  });
});

describe("Batch 2", () => {
  it("are fully supported", () => supported(craterElemental, defyDeath, intimidationBolt, islandOfWakwak, singingTree, symmetrySage, leylineOfSingularity, inBolassClutches, hunterSliver, frozenInIce, rope));

  it("Intimidation Bolt: only its target can attack this turn, also over creatures that arrive later", () => {
    let { s, ap, opp, ids } = setup([intimidationBolt]);
    const ogre = putOnBattlefield(s, ap, bigOgre());
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(pt(s, ogre)).toBe("6/6");
    const late = putOnBattlefield(s, ap, greenBear(), { sick: false });
    expect(potentialAttackers(s, ap).map((o) => o.id)).toEqual([ogre]);
    expect([bear, late].every((id) => s.battlefield.includes(id))).toBe(true);
  });

  it("Intimidation Bolt: with its target dead, no creature can attack", () => {
    let { s, ap, opp, ids } = setup([intimidationBolt]);
    const bird = putOnBattlefield(s, ap, blueBird());
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bird)])));
    expect(zone(s, bird)).toBe("graveyard");
    expect(zone(s, bear)).toBe("battlefield");
    expect(potentialAttackers(s, ap)).toEqual([]);
  });

  it("Crater Elemental's formidable sets base power 8", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, craterElemental);
    putOnBattlefield(s, ap, bigOgre());
    putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planActivate(s, ap, c, 1, [])));
    expect(pt(s, c)).toBe("8/6");
  });

  it("Singing Tree sets an attacker's base power to 0", () => {
    let { s, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s, ap, bigOgre());
    const tree = putOnBattlefield(s, opp, singingTree);
    s = toBlocks(s, ap, [{ attacker: ogre, defender: opp }]);
    s = block(s, opp, []);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, opp, tree, 0, [tgt(ogre)])));
    expect(pt(s, ogre)).toBe("0/6");
  });

  it("Leyline of Singularity makes nonland permanents legendary, so the legend rule applies", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, leylineOfSingularity);
    const land = s.battlefield.find((id) => chars(s, id).types.includes("Land"))!;
    expect(chars(s, a).supertypes).toContain("Legendary");
    expect(chars(s, land).supertypes).not.toContain("Legendary");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("legend");
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("In Bolas's Clutches takes the permanent and makes it legendary", () => {
    let { s, ap, opp, ids } = setup([inBolassClutches]);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(s.objects[ogre]!.controller === ap || chars(s, ogre).controller === ap).toBe(true);
    expect(chars(s, ogre).supertypes).toContain("Legendary");
  });

  it("Hunter Sliver gives Slivers provoke", () => {
    let { s, ap, opp } = setup([]);
    const hs = putOnBattlefield(s, ap, hunterSliver);
    const bear = putOnBattlefield(s, opp, greenBear());
    s.objects[bear]!.tapped = true;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hs, defender: opp }] });
    s = settle(s, { targets: [tgt(bear)] });
    expect(s.objects[bear]!.tapped).toBe(false);
  });

  it("Frozen in Ice: no abilities, and it can't become untapped", () => {
    let { s, ap, opp, ids } = setup([frozenInIce]);
    const elf = putOnBattlefield(s, opp, creature("Test Llanowar", "Creature — Elf", "{G}", 1, 1, { oracleText: "Flying" }));
    s.objects[elf]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(elf)])));
    expect(has(s, elf, "Flying")).toBe(false);
    s = passUntil(s, "main1", opp);
    expect(s.objects[elf]!.tapped).toBe(true);
  });

  it("Rope: +1/+2, reach, and at most one blocker", () => {
    let { s, ap } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    attach(s, ap, rope, bear);
    expect(pt(s, bear)).toBe("3/4");
    expect(has(s, bear, "Reach")).toBe(true);
    expect(chars(s, bear).maxOneBlocker).toBeTruthy();
  });
});

describe("Batch 3", () => {
  it("are fully supported", () => supported(kruphixsInsight, glacialRevelation, piecesOfThePuzzle, spoilsOfVictory, specimenFreighter, fanaticOfTheHarrowing, doesMachines, theThanoscopter, tectonicInstability, sonarStrike, interpretTheSigns, sifterWurm, triumphantChomp, goldenRatio, corruptedResolve, hokoriDustDrinker, risingWaters, unexpectedlyAbsent, kirtarsWrath));

  const ench = () => card("Test Aura", "Enchantment", "{W}", { cmc: 1, oracleText: "" });

  it("Kruphix's Insight takes up to three enchantment cards of the top six; the rest go to the graveyard", () => {
    let { s, ap, ids } = setup([kruphixsInsight]);
    const top = [ench(), greenBear(), ench(), ench(), ench(), greenBear()].reverse().map((d) => onTop(s, ap, d)).reverse();
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "searchLibrary" && s.pending.max).toBe(3);
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[2]!, top[3]!] });
    s = settle(s);
    expect([top[0], top[2], top[3]].map((id) => zone(s, id!))).toEqual(["hand", "hand", "hand"]);
    expect([top[1], top[4], top[5]].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard", "graveyard"]);
  });

  it("Spoils of Victory puts a basic-land-typed card onto the battlefield", () => {
    let { s, ap, ids } = setup([spoilsOfVictory]);
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "searchLibrary") throw new Error("no search");
    expect(p.cards.length).toBeGreaterThan(0);
    s = act(s, { type: "searchLibrary", player: ap, found: [p.cards[0]!] });
    expect(zone(s, p.cards[0]!)).toBe("battlefield");
  });

  it("Fanatic of the Harrowing: everyone discards; you draw only if you discarded", () => {
    let { s, ap, opp } = setup([]);
    const f = into(s, ap, fanaticOfTheHarrowing);
    emptyHand(s, opp);
    into(s, opp, greenBear());
    s.players[ap]!.hand = [f];
    into(s, ap, greenBear());
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const libBefore = s.players[ap]!.library.length;
    s = settle(run(s, planCast(s, ap, f, [])));
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(s.players[ap]!.library.length).toBe(libBefore - 1);
    expect(s.players[ap]!.hand.length).toBe(1);
  });

  it("Fanatic of the Harrowing: with an empty hand you don't draw", () => {
    let { s, ap } = setup([]);
    const f = into(s, ap, fanaticOfTheHarrowing);
    s.players[ap]!.hand = [f];
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const libBefore = s.players[ap]!.library.length;
    s = settle(run(s, planCast(s, ap, f, [])));
    expect(s.players[ap]!.library.length).toBe(libBefore);
  });

  it("Does Machines mills two, draws two, then discards two", () => {
    let { s, ap, ids } = setup([doesMachines]);
    const lib = s.players[ap]!.library.length;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.library.length).toBe(lib - 4);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 - 2);
  });

  it("The Thanos-Copter makes your Vehicles artifact creatures until end of turn", () => {
    let { s, ap, opp } = setup([]);
    const cart = putOnBattlefield(s, ap, vehicle());
    const theirs = putOnBattlefield(s, opp, vehicle());
    const t = into(s, ap, theThanoscopter);
    s = settle(run(s, planCast(s, ap, t, [])));
    expect(chars(s, cart).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, theirs).types).not.toContain("Creature");
    expect(chars(s, t).types).toContain("Creature");
  });

  it("Tectonic Instability taps all lands of the player whose land entered", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, tectonicInstability);
    const theirs = [putOnBattlefield(s, opp, forest), putOnBattlefield(s, opp, mountain)];
    const mine = s.battlefield.filter((id) => chars(s, id).types.includes("Land") && s.objects[id]!.controller === ap);
    const land = into(s, ap, forest);
    s = settle(act(s, { type: "playLand", player: ap, objectId: land } as Action));
    expect([...mine, land].every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(theirs.some((id) => s.objects[id]!.tapped)).toBe(false);
  });

  it("Sonar Strike: an attacking, blocking, or tapped creature; 3 life only with a Bat", () => {
    let { s, ap, opp, ids } = setup([sonarStrike]);
    const untapped = putOnBattlefield(s, opp, bigOgre());
    const tapped = putOnBattlefield(s, opp, bigOgre());
    s.objects[tapped]!.tapped = true;
    expect(planCast(s, ap, ids[0]!, [tgt(untapped)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(tapped)])));
    expect(s.objects[tapped]!.damage).toBe(4);
    expect(life(s, ap)).toBe(40);
    putOnBattlefield(s, ap, creature("Test Bat", "Creature — Bat", "{B}", 1, 1));
    const again = into(s, ap, sonarStrike);
    s = settle(run(s, planCast(s, ap, again, [tgt(tapped)])));
    expect(life(s, ap)).toBe(43);
  });

  it("Interpret the Signs draws cards equal to the revealed card's mana value", () => {
    let { s, ap, ids } = setup([interpretTheSigns]);
    putOnBattlefield(s, ap, island);
    const top = onTop(s, ap, bigOgre());
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "arrangeTop") throw new Error("no scry");
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top, ...p.cards.filter((id) => id !== top)], away: [] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 5);
    expect(zone(s, top)).toBe("hand");
  });

  it("Sifter Wurm gains life equal to the revealed card's mana value; a land gives none", () => {
    let { s, ap } = setup([]);
    const w = into(s, ap, sifterWurm);
    const top = onTop(s, ap, bigOgre());
    s = run(s, planCast(s, ap, w, []));
    for (let i = 0; i < 20 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "arrangeTop") throw new Error("no scry");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top, ...p.cards.filter((id) => id !== top)], away: [] }));
    expect(life(s, ap)).toBe(45);
    expect(s.players[ap]!.library[0]).toBe(top);
  });

  it("Triumphant Chomp deals 2, or the greatest Dinosaur power if greater", () => {
    let { s, ap, opp, ids } = setup([triumphantChomp, triumphantChomp]);
    const a = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(s.objects[a]!.damage).toBe(2);
    putOnBattlefield(s, ap, creature("Test Dino", "Creature — Dinosaur", "{4}{G}", 5, 5));
    const b = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.objects[b]!.damage).toBe(5);
  });

  it("Golden Ratio draws one card per different power", () => {
    let { s, ap, ids } = setup([goldenRatio]);
    putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, blueBird());
    putOnBattlefield(s, ap, bigOgre());
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Corrupted Resolve counters only a poisoned player's spell", () => {
    let { s, ap, opp, ids } = setup([corruptedResolve, corruptedResolve]);
    const bolt = into(s, ap, testShock());
    s = run(s, planCast(s, ap, bolt, [player(opp)]));
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = settle(s);
    expect(life(s, opp)).toBe(38);
    s.players[ap]!.poison = 1;
    const bolt2 = into(s, ap, testShock());
    s = run(s, planCast(s, ap, bolt2, [player(opp)]));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = settle(s);
    expect(life(s, opp)).toBe(38);
    expect(zone(s, bolt2)).toBe("graveyard");
  });

  it("Rising Waters: lands stay tapped, but each player untaps one in their upkeep", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, risingWaters);
    const lands = s.battlefield.filter((id) => chars(s, id).types.includes("Land") && s.objects[id]!.controller === ap);
    for (const id of lands) s.objects[id]!.tapped = true;
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "pickPermanents"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "pickPermanents") throw new Error("no pick");
    expect(p.player).toBe(ap);
    expect(p.count).toBe(1);
    s = act(s, { type: "pickPermanents", player: ap, ids: [lands[0]!] });
    expect(lands.filter((id) => !s.objects[id]!.tapped)).toEqual([lands[0]]);
  });

  it("Unexpectedly Absent puts the permanent just beneath the top X cards", () => {
    let { s, ap, opp, ids } = setup([unexpectedlyAbsent]);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    const top3 = s.players[opp]!.library.slice(0, 3);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)], undefined, undefined, 2)));
    expect(s.players[opp]!.library.slice(0, 4)).toEqual([top3[0], top3[1], ogre, top3[2]]);
  });

  it("Kirtar's Wrath: with threshold, two Spirits too; no regeneration either way", () => {
    let { s, ap, opp, ids } = setup([kirtarsWrath]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, plainsCard);
    const bear = putOnBattlefield(s, opp, greenBear());
    s.objects[bear]!.regenShields = 1;
    for (let i = 0; i < 7; i++) into(s, ap, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, bear)).toBe("graveyard");
    expect(tokens(s, ap).length).toBe(2);
  });
});

describe("Batch 4", () => {
  const testLife = card("Test Ebb and Flow", "Sorcery", "{W}", { cmc: 1, oracleText: "You gain 2 life. You lose 1 life." });
  const testDrain = card("Test Drain", "Enchantment", "{B}", { cmc: 1, oracleText: "At the beginning of your upkeep, each player loses 1 life." });
  const human = () => creature("Test Human", "Creature — Human", "{W}", 1, 1);
  /** Attackers declared by `ap` at `opp`, with the game paused at the first question after (or the blocks). */
  const attack = (s: GameState, ap: PlayerId, opp: PlayerId, ids: string[]) => {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: ids.map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("are fully supported", () => {
    supported(sianiEyeOfTheStorm, acolyteHybrid, sophinaSpearsageDeserter, savagePunch, seeBeyond, rootsOfWisdom, patronOfTheOrochi, vampireScrivener, whiteGloveGourmand, bearerOfTheHeavens, moralityShift, arbiterOfKnollridge, grimGiganotosaurus, invincibleHymn, livingLands, kormusBell, naturesRevolt, bitterChill);
  });

  it("Siani scries once for each attacking creature with flying", () => {
    const { s: s0, ap, opp } = setup([]);
    const siani = putOnBattlefield(s0, ap, sianiEyeOfTheStorm);
    const bird = putOnBattlefield(s0, ap, creature("Test Flier", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" }));
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = attack(s0, ap, opp, [siani, bird, bear]);
    expect(s.pending?.kind).toBe("arrangeTop");
    if (s.pending?.kind === "arrangeTop") expect(s.pending.cards.length).toBe(2);
  });

  it("Acolyte Hybrid destroys up to one artifact; its controller draws", () => {
    let { s, ap, opp } = setup([]);
    const acolyte = putOnBattlefield(s, ap, acolyteHybrid);
    const cart = putOnBattlefield(s, opp, vehicle());
    const hand = s.players[opp]!.hand.length;
    s = attack(s, ap, opp, [acolyte]);
    s = settle(s, { targets: [tgt(cart)] });
    expect(zone(s, cart)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
  });

  it("Acolyte Hybrid with no artifact chosen: nobody draws", () => {
    let { s, ap, opp } = setup([]);
    const acolyte = putOnBattlefield(s, ap, acolyteHybrid);
    putOnBattlefield(s, opp, vehicle());
    const hands = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s = attack(s, ap, opp, [acolyte]);
    s = settle(s, { targets: [{ kind: "none" }] });
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(hands);
  });

  it("Sophina investigates once for each nontoken attacking creature", () => {
    let { s, ap, opp } = setup([]);
    const sophina = putOnBattlefield(s, ap, sophinaSpearsageDeserter);
    const bear = putOnBattlefield(s, ap, greenBear());
    const token = putOnBattlefield(s, ap, redGoblin());
    s.objects[token]!.isToken = true;
    s = attack(s, ap, opp, [sophina, bear, token]);
    s = settle(s);
    expect(tokens(s, ap).filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Clue Token").length).toBe(2);
  });

  it("Savage Punch: +2/+2 before the fight only with ferocious", () => {
    let { s, ap, opp, ids } = setup([savagePunch, savagePunch]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const foe = putOnBattlefield(s, opp, creature("Test Wolf", "Creature — Wolf", "{2}{G}", 3, 3));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear), tgt(foe)])));
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.objects[foe]!.damage).toBe(2);
    const bear2 = putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, bigOgre());
    const foe2 = putOnBattlefield(s, opp, creature("Test Wolf", "Creature — Wolf", "{2}{G}", 3, 3));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear2), tgt(foe2)])));
    expect(zone(s, foe2)).toBe("graveyard");
    expect(zone(s, bear2)).toBe("battlefield");
    expect(pt(s, bear2)).toBe("4/4");
  });

  it("See Beyond draws two, then shuffles a chosen card from hand into the library", () => {
    let { s, ap, ids } = setup([seeBeyond, greenBear()]);
    const lib = s.players[ap]!.library.length;
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "handToTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    expect(p).toMatchObject({ kind: "handToTop", count: 1, shuffle: true });
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("library");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 - 1);
    expect(s.players[ap]!.library.length).toBe(lib - 2 + 1);
  });

  it("Roots of Wisdom returns a land card; with none to return, it draws instead", () => {
    let { s, ap, ids } = setup([rootsOfWisdom, rootsOfWisdom]);
    const hand = s.players[ap]!.hand.length;
    for (let i = 0; i < 3; i++) onTop(s, ap, forest);
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [s.pending.cards[0]!] });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest").length).toBe(2);
    // The graveyard's Forests are gone; three Bears milled.
    for (const id of [...s.players[ap]!.graveyard]) if (s.cards[s.objects[id]!.cardId]!.name === "Forest") {
      s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(id), 1);
      s.objects[id]!.zone = "exile";
      s.players[ap]!.exile.push(id);
    }
    for (let i = 0; i < 4; i++) onTop(s, ap, greenBear());
    const drawn = s.players[ap]!.library[3]!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    expect(zone(s, drawn)).toBe("hand");
  });

  it("Patron of the Orochi untaps every Forest and green creature, once each turn", () => {
    let { s, ap, opp } = setup([]);
    const patron = putOnBattlefield(s, ap, patronOfTheOrochi);
    const bear = putOnBattlefield(s, opp, greenBear());
    const goblin = putOnBattlefield(s, ap, redGoblin());
    const forests = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    const mountains = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain");
    for (const id of [bear, goblin, ...forests, ...mountains]) s.objects[id]!.tapped = true;
    s = settle(run(s, planActivate(s, ap, patron, 0, [])));
    expect(forests.every((id) => !s.objects[id]!.tapped)).toBe(true);
    expect(s.objects[bear]!.tapped).toBe(false);
    expect(s.objects[patron]!.tapped).toBe(false);
    expect(s.objects[goblin]!.tapped).toBe(true);
    expect(mountains.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(planActivate(s, ap, patron, 0, [])).toBeNull();
  });

  it("Vampire Scrivener grows on life gained or lost during your turn only", () => {
    let { s, ap, opp, ids } = setup([testLife]);
    const v = putOnBattlefield(s, ap, vampireScrivener);
    putOnBattlefield(s, opp, testDrain);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.objects[v]!.counters["+1/+1"]).toBe(2);
    const before = life(s, ap);
    s = toUpkeep(s, opp);
    expect(life(s, ap)).toBe(before - 1);
    expect(s.objects[v]!.counters["+1/+1"]).toBe(2);
  });

  it("White Glove Gourmand makes Food only after another Human of yours died this turn", () => {
    let { s, ap, opp, ids } = setup([testRaze(), testRaze()]);
    putOnBattlefield(s, ap, whiteGloveGourmand);
    const theirs = putOnBattlefield(s, opp, human());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    s = passUntil(s, "cleanup", ap);
    const food = (st: GameState) => tokens(st, ap).filter((id) => st.cards[st.objects[id]!.cardId]!.name === "Food Token").length;
    expect(food(s)).toBe(0);
    s = passUntil(s, "main1", ap);
    const mine = putOnBattlefield(s, ap, human());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    s = passUntil(s, "cleanup", ap);
    expect(food(s)).toBe(1);
  });

  it("Bearer of the Heavens: at the next end step, every permanent is destroyed", () => {
    let { s, ap, opp, ids } = setup([testRaze()]);
    const bearer = putOnBattlefield(s, ap, bearerOfTheHeavens);
    const later = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bearer)])));
    expect(zone(s, bearer)).toBe("graveyard");
    const arrives = putOnBattlefield(s, opp, bigOgre());
    s = passUntil(s, "cleanup", ap);
    expect(zone(s, later)).toBe("graveyard");
    expect(zone(s, arrives)).toBe("graveyard");
    expect(s.battlefield.length).toBe(0);
  });

  it("Morality Shift exchanges graveyard and library", () => {
    let { s, ap, ids } = setup([moralityShift]);
    const yard = [into(s, ap, greenBear(), "graveyard"), into(s, ap, blueBird(), "graveyard")];
    const lib = [...s.players[ap]!.library];
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect([...s.players[ap]!.library].sort()).toEqual([...yard].sort());
    expect(lib.every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Arbiter of Knollridge: each player's life total becomes the highest", () => {
    let { s, ap, opp, ids } = setup([arbiterOfKnollridge]);
    s.players[opp]!.life = 52;
    s.players[ap]!.life = 13;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.turnOrder.map((p) => life(s, p))).toEqual([52, 52, 52, 52]);
  });

  it("Grim Giganotosaurus becomes monstrous for less and destroys every other artifact and creature", () => {
    let { s, ap, opp } = setup([]);
    const grim = putOnBattlefield(s, ap, grimGiganotosaurus);
    const ogres = [bigOgre(), bigOgre(), bigOgre()].map((d) => putOnBattlefield(s, opp, d));
    const cart = putOnBattlefield(s, ap, vehicle());
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planActivate(s, ap, grim, 0, [])));
    expect(pt(s, grim)).toBe("20/20");
    expect([...ogres, cart, bear].every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(zone(s, grim)).toBe("battlefield");
  });

  it("Invincible Hymn sets your life total to your library's size", () => {
    let { s, ap, ids } = setup([invincibleHymn]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(life(s, ap)).toBe(s.players[ap]!.library.length);
  });

  it("Living Lands, Kormus Bell and Nature's Revolt animate lands that are still lands", () => {
    let { s, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s, opp, swamp);
    const find = (n: string) => s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === n && s.objects[id]!.controller === ap)!;
    const [f, sw, m] = [find("Forest"), find("Swamp"), find("Mountain")];
    const ll = putOnBattlefield(s, ap, livingLands);
    expect(chars(s, f).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(pt(s, f)).toBe("1/1");
    expect(chars(s, m).types).not.toContain("Creature");
    s.battlefield.splice(s.battlefield.indexOf(ll), 1);
    putOnBattlefield(s, ap, kormusBell);
    expect(pt(s, theirs)).toBe("1/1");
    expect(chars(s, sw).colors).toEqual(["B"]);
    expect(chars(s, f).types).not.toContain("Creature");
    putOnBattlefield(s, ap, naturesRevolt);
    expect(pt(s, m)).toBe("2/2");
    expect(chars(s, m).subtypes).toContain("Mountain");
  });

  it("Bitter Chill taps; when it goes to the graveyard you may pay {1} to scry 1, then draw", () => {
    let { s, ap, opp, ids } = setup([bitterChill, testRaze()]);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(s.objects[ogre]!.tapped).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[1]!, [tgt(ogre)]));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}" } });
    for (const a of planMana(s, ap, parseManaCost("{1}"))!) s = act(s, a);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 5 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "arrangeTop") throw new Error("no scry");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: p.cards }));
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Batch 4, cards the same templates also cover", () => {
  const testWalker = card("Test Walker", "Legendary Planeswalker — Test", "{2}{U}", { cmc: 3, loyalty: "3", oracleText: "+1: You gain 1 life." });
  /** Waits for a "you may pay" question and pays it from the player's lands. */
  const payMay = (s: GameState, pid: PlayerId, cost: string) => {
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: cost } });
    for (const a of planMana(s, pid, parseManaCost(cost))!) s = act(s, a);
    return act(s, { type: "chooseMay", player: pid, yes: true });
  };

  it("are fully supported", () => {
    supported(customsDepot, dromarTheBanisher, livingPlane, shadowheartClericOfOrder, shadowheartClericOfTrickery, shadowheartClericOfTwilight, sparkshaperVisionary);
  });

  it("Customs Depot: pay {1} on a creature spell to draw, then discard", () => {
    let { s, ap, ids } = setup([greenBear()]);
    putOnBattlefield(s, ap, customsDepot);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = payMay(s, ap, "{1}");
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.players[ap]!.graveyard.length).toBe(1);
  });

  it("Dromar: pay {2}{U}, then choose a color and bounce every creature of it", () => {
    let { s, ap, opp } = setup([]);
    const dromar = putOnBattlefield(s, ap, dromarTheBanisher);
    const theirs = putOnBattlefield(s, opp, greenBear());
    const mine = putOnBattlefield(s, ap, greenBear());
    const red = putOnBattlefield(s, opp, redGoblin());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: dromar, defender: opp }] });
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseMay"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = payMay(s, ap, "{2}{U}");
    for (let i = 0; i < 5 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "chooseOption") throw new Error("no color");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => /green/i.test(o))! }));
    expect(zone(s, theirs)).toBe("hand");
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, red)).toBe("battlefield");
  });

  it("Living Plane makes every land a 1/1 creature", () => {
    const { s, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s, opp, swamp);
    putOnBattlefield(s, ap, livingPlane);
    expect(pt(s, theirs)).toBe("1/1");
    expect(chars(s, theirs).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
  });

  it("Shadowheart: the end step ping makes you lose life on your turn, which draws (Trickery) or grows (Twilight)", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, shadowheartClericOfTrickery);
    const twilight = putOnBattlefield(s, ap, shadowheartClericOfTwilight);
    const order = putOnBattlefield(s, ap, shadowheartClericOfOrder);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "cleanup", ap);
    // Three pings, each a life loss on your turn: three draws, three counters, three Knights.
    expect(life(s, ap)).toBe(37);
    expect(life(s, opp)).toBe(37);
    expect(s.players[ap]!.hand.length).toBeGreaterThanOrEqual(Math.min(hand + 3, 7));
    expect(s.objects[twilight]!.counters["+1/+1"]).toBe(3);
    expect(tokens(s, ap).length).toBe(3);
    expect(zone(s, order)).toBe("battlefield");
    // On the opponent's turn, a loss doesn't count.
    s = passUntil(s, "cleanup", opp);
    expect(s.objects[twilight]!.counters["+1/+1"]).toBe(3);
  });

  it("Sparkshaper Visionary: a planeswalker becomes a 3/3 flying Bird, and its loyalty ability still works", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, sparkshaperVisionary);
    const w = putOnBattlefield(s, ap, testWalker);
    s.objects[w]!.counters.loyalty = 3;
    s = passUntil(s, "beginCombat", ap);
    s = settle(s, { targets: [tgt(w)] });
    expect(chars(s, w).types).toEqual(["Creature"]);
    expect(chars(s, w).subtypes).toEqual(["Bird"]);
    expect(pt(s, w)).toBe("3/3");
    expect(has(s, w, "Flying")).toBe(true);
    s = passUntil(s, "main2", ap);
    s = settle(run(s, planActivate(s, ap, w, 0, [])));
    expect(life(s, ap)).toBe(41);
    expect(s.objects[w]!.counters.loyalty).toBe(4);
  });
});
