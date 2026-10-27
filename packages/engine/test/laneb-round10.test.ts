// Lane B, round 10: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, mountain, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const apocalypseDemon = card("Apocalypse Demon", "Creature — Demon", "{4}{B}{B}", { cmc: 6, power: "*", toughness: "*", keywords: ["Flying"], oracleText: "Flying\nApocalypse Demon's power and toughness are each equal to the number of cards in your graveyard.\nAt the beginning of your upkeep, tap this creature unless you sacrifice another creature." });
const aysenCrusader = card("Aysen Crusader", "Creature — Human Knight", "{2}{W}{W}", { cmc: 4, power: "2+*", toughness: "2+*", oracleText: "Aysen Crusader's power and toughness are each equal to 2 plus the number of Soldiers and Warriors you control." });
const battleOfWits = card("Battle of Wits", "Enchantment", "{3}{U}{U}", { cmc: 5, oracleText: "At the beginning of your upkeep, if you have 200 or more cards in your library, you win the game." });
const battlescarredGoblin = card("Battle-Scarred Goblin", "Creature — Goblin Warrior", "{1}{R}", { cmc: 2, power: "2", toughness: "2", oracleText: "Whenever this creature becomes blocked, it deals 1 damage to each creature blocking it." });
const blessingOfTheNephilim = card("Blessing of the Nephilim", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1 for each of its colors." });
const blightning = card("Blightning", "Sorcery", "{1}{B}{R}", { cmc: 3, colors: ["B","R"], oracleText: "Blightning deals 3 damage to target player or planeswalker. That player or that planeswalker's controller discards two cards." });
const bloodBaronOfVizkopa = card("Blood Baron of Vizkopa", "Creature — Vampire", "{3}{W}{B}", { cmc: 5, power: "4", toughness: "4", keywords: ["Lifelink","Protection"], colors: ["B","W"], oracleText: "Lifelink, protection from white and from black\nAs long as you have 30 or more life and an opponent has 10 or less life, this creature gets +6/+6 and has flying." });
const captainsHook = card("Captain's Hook", "Artifact — Equipment", "{3}", { cmc: 3, keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0, has menace, and is a Pirate in addition to its other creature types.\nWhenever this Equipment becomes unattached from a permanent, destroy that permanent.\nEquip {1}" });
const caterwaulingBoggart = card("Caterwauling Boggart", "Creature — Goblin Shaman", "{3}{R}", { cmc: 4, power: "2", toughness: "2", oracleText: "Goblins you control and Elementals you control have menace. (They can't be blocked except by two or more creatures.)" });
const civicSaber = card("Civic Saber", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+0 for each of its colors.\nEquip {1}" });
const creepingChill = card("Creeping Chill", "Sorcery", "{3}{B}", { cmc: 4, oracleText: "Creeping Chill deals 3 damage to each opponent and you gain 3 life.\nWhen Creeping Chill is put into your graveyard from your library, you may exile it. If you do, Creeping Chill deals 3 damage to each opponent and you gain 3 life." });
const darkestHour = card("Darkest Hour", "Enchantment", "{B}", { cmc: 1, oracleText: "All creatures are black." });
const decimatorWeb = card("Decimator Web", "Artifact", "{4}", { cmc: 4, keywords: ["Mill"], oracleText: "{4}, {T}: Target opponent loses 2 life, gets a poison counter, then mills six cards." });
const earthSurge = card("Earth Surge", "Enchantment", "{3}{G}", { cmc: 4, oracleText: "Each land gets +2/+2 as long as it's a creature." });
const earthenAlly = card("Earthen Ally", "Creature — Human Soldier Ally", "{G}", { cmc: 1, power: "0", toughness: "2", keywords: ["Earthbend"], oracleText: "This creature gets +1/+0 for each color among Allies you control.\n{2}{W}{U}{B}{R}{G}: Earthbend 5. (Target land you control becomes a 0/0 creature with haste that's still a land. Put five +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)" });
const fancyFootwork = card("Fancy Footwork", "Instant — Lesson", "{2}{W}", { cmc: 3, oracleText: "Untap one or two target creatures. They each get +2/+2 until end of turn." });
const fireJuggler = card("Fire Juggler", "Creature — Goblin Shaman", "{2}{R}", { cmc: 3, power: "2", toughness: "2", keywords: ["Clash"], oracleText: "Whenever this creature becomes blocked, clash with an opponent. If you win, this creature deals 4 damage to each creature blocking it. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)" });
const gaeasBlessing = card("Gaea's Blessing", "Sorcery", "{1}{G}", { cmc: 2, oracleText: "Target player shuffles up to three target cards from their graveyard into their library.\nDraw a card.\nWhen this card is put into your graveyard from your library, shuffle your graveyard into your library." });
const gearshiftAce = card("Gearshift Ace", "Creature — Dwarf Pilot", "{1}{W}", { cmc: 2, power: "2", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nWhenever this creature crews a Vehicle, that Vehicle gains first strike until end of turn." });
const glisteningDawn = card("Glistening Dawn", "Sorcery", "{2}{G}{G}", { cmc: 4, keywords: ["Incubate","Transform"], oracleText: "Incubate X twice, where X is the number of lands you control. (To incubate X, create an Incubator token with X +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)" });
const goBlank = card("Go Blank", "Sorcery", "{2}{B}", { cmc: 3, oracleText: "Target player discards two cards. Then exile that player's graveyard." });
const godsire = card("Godsire", "Creature — Beast", "{4}{R}{G}{G}{W}", { cmc: 8, power: "8", toughness: "8", keywords: ["Vigilance"], colors: ["G","R","W"], oracleText: "Vigilance\n{T}: Create an 8/8 Beast creature token that's red, green, and white." });
const grondTheGatebreaker = card("Grond, the Gatebreaker", "Legendary Artifact — Vehicle", "{3}{B}", { cmc: 4, power: "5", toughness: "5", keywords: ["Crew","Trample"], oracleText: "Trample\nAs long as it's your turn and you control an Army, Grond is an artifact creature.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const hivestone = card("Hivestone", "Artifact", "{2}", { cmc: 2, oracleText: "Creatures you control are Slivers in addition to their other creature types." });
const hundredhandedOne = card("Hundred-Handed One", "Creature — Giant", "{2}{W}{W}", { cmc: 4, power: "3", toughness: "5", keywords: ["Vigilance","Monstrosity"], oracleText: "Vigilance\n{3}{W}{W}{W}: Monstrosity 3. (If this creature isn't monstrous, put three +1/+1 counters on it and it becomes monstrous.)\nAs long as this creature is monstrous, it has reach and can block an additional ninety-nine creatures each combat." });
const knightOfNewAlara = card("Knight of New Alara", "Creature — Human Knight", "{2}{G}{W}", { cmc: 4, power: "2", toughness: "2", colors: ["G","W"], oracleText: "Each other multicolored creature you control gets +1/+1 for each of its colors." });
const llawanCephalidEmpress = card("Llawan, Cephalid Empress", "Legendary Creature — Octopus Noble", "{3}{U}", { cmc: 4, power: "2", toughness: "3", oracleText: "When Llawan enters, return all blue creatures your opponents control to their owners' hands.\nYour opponents can't cast blue creature spells." });
const michelangeloOnTheScene = card("Michelangelo, On the Scene", "Legendary Creature — Mutant Ninja Turtle", "{4}{G}{G}", { cmc: 6, power: "2", toughness: "2", keywords: ["Trample"], oracleText: "Trample (This creature can deal excess combat damage to the player it's attacking.)\nMichelangelo enters with a +1/+1 counter on him for each land you control.\nWhen Michelangelo dies, return this card to your hand." });
const narcomoeba = card("Narcomoeba", "Creature — Illusion", "{1}{U}", { cmc: 2, power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this card is put into your graveyard from your library, you may put it onto the battlefield." });
const neardeathExperience = card("Near-Death Experience", "Enchantment", "{2}{W}{W}{W}", { cmc: 5, oracleText: "At the beginning of your upkeep, if you have exactly 1 life, you win the game." });
const nobleQuarry = card("Noble Quarry", "Enchantment Creature — Unicorn", "{2}{G}", { cmc: 3, power: "1", toughness: "1", keywords: ["Bestow"], oracleText: "Bestow {5}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nAll creatures able to block this creature or enchanted creature do so.\nEnchanted creature gets +1/+1." });
const piousWarrior = card("Pious Warrior", "Creature — Human Rebel Warrior", "{3}{W}", { cmc: 4, power: "2", toughness: "3", oracleText: "Whenever this creature is dealt combat damage, you gain that much life." });
const plagueWight = card("Plague Wight", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "1", oracleText: "Whenever this creature becomes blocked, each creature blocking it gets -1/-1 until end of turn." });
const planTheHeist = card("Plan the Heist", "Sorcery", "{2}{U}{U}", { cmc: 4, keywords: ["Surveil","Plot"], oracleText: "Surveil 3 if you have no cards in hand. Then draw three cards. (To surveil 3, look at the top three cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nPlot {3}{U} (You may pay {3}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const precipitousDrop = card("Precipitous Drop", "Enchantment — Aura", "{2}{B}", { cmc: 3, keywords: ["Enchant","Venture into the dungeon"], oracleText: "Enchant creature\nWhen this Aura enters, venture into the dungeon. (Enter the first room or advance to the next room.)\nEnchanted creature gets -2/-2. It gets -5/-5 instead as long as you've completed a dungeon." });
const primalOrder = card("Primal Order", "Enchantment", "{2}{G}{G}", { cmc: 4, oracleText: "At the beginning of each player's upkeep, this enchantment deals damage to that player equal to the number of nonbasic lands they control." });
const quicksilverSpeedster = card("Quicksilver, Speedster", "Legendary Creature — Mutant Hero", "{3}{U}{R}", { cmc: 5, power: "3", toughness: "4", keywords: ["Haste","Double strike","Flash"], colors: ["R","U"], oracleText: "Flash\nDouble strike, haste\nAs long as Quicksilver is tapped, you may cast spells as though they had flash." });
const rakdossReturn = card("Rakdos's Return", "Sorcery", "{X}{B}{R}", { cmc: 2, colors: ["B","R"], oracleText: "Rakdos's Return deals X damage to target opponent or planeswalker. That player or that planeswalker's controller discards X cards." });
const roadRage = card("Road Rage", "Instant", "{R}", { cmc: 1, oracleText: "Road Rage deals X damage to target creature or planeswalker, where X is 2 plus the number of Mounts and Vehicles you control." });
const runeboundWolf = card("Runebound Wolf", "Creature — Wolf", "{1}{R}", { cmc: 2, power: "2", toughness: "2", oracleText: "{3}{R}, {T}: This creature deals damage equal to the number of Wolves and Werewolves you control to target opponent." });
const sardianCliffstomper = card("Sardian Cliffstomper", "Creature — Minotaur Barbarian", "{1}{R}", { cmc: 2, power: "0", toughness: "4", oracleText: "As long as it's your turn and you control four or more Mountains, this creature gets +X/+0, where X is the number of Mountains you control." });
const shadowbornDemon = card("Shadowborn Demon", "Creature — Demon", "{3}{B}{B}", { cmc: 5, power: "5", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, destroy target non-Demon creature.\nAt the beginning of your upkeep, if there are fewer than six creature cards in your graveyard, sacrifice a creature." });
const smashingSuccess = card("Smashing Success", "Instant", "{3}{R}", { cmc: 4, keywords: ["Treasure"], oracleText: "Destroy target artifact or land. If an artifact is destroyed this way, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const soldOut = card("Sold Out", "Instant", "{3}{B}", { cmc: 4, oracleText: "Exile target creature. If it was dealt damage this turn, create a Clue token. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const spectralGrasp = card("Spectral Grasp", "Enchantment — Aura", "{1}{W}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack you or planeswalkers you control.\nEnchanted creature can't block creatures you control." });
const speedwayFanatic = card("Speedway Fanatic", "Creature — Human Pilot", "{1}{R}", { cmc: 2, power: "2", toughness: "1", keywords: ["Haste"], oracleText: "Haste\nWhenever this creature crews a Vehicle, that Vehicle gains haste until end of turn." });
const splinterAgingChampion = card("Splinter, Aging Champion", "Legendary Creature — Mutant Ninja Rat", "{2}{W}", { cmc: 3, power: "2", toughness: "2", oracleText: "When Splinter enters, destroy up to one target tapped creature.\nWhen Splinter leaves the battlefield, you and another target player each draw a card." });
const tangledSkyline = card("Tangled Skyline", "Enchantment", "{4}{G}", { cmc: 5, keywords: ["Incubate","Transform"], oracleText: "When this enchantment enters, you gain 5 life and incubate 5. (Create an Incubator token with five +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)\nPhyrexians you control have reach." });
const tinybonesPocketNuisance = card("Tinybones, Pocket Nuisance", "Legendary Creature — Skeleton Rogue", "{2}{B}", { cmc: 3, power: "2", toughness: "1", oracleText: "When Tinybones enters, each opponent discards a card.\nWhenever a player discards one or more cards, Tinybones deals 1 damage to each opponent." });
const titanHunter = card("Titan Hunter", "Creature — Human Warrior", "{4}{B}", { cmc: 5, power: "4", toughness: "5", oracleText: "At the beginning of each player's end step, if no creatures died this turn, this creature deals 4 damage to that player.\n{1}{B}, Sacrifice a creature: You gain 4 life." });
const valentinaAllegraDeFontaine = card("Valentina Allegra de Fontaine", "Legendary Creature — Human Spy Villain", "{2}{B}", { cmc: 3, power: "2", toughness: "3", keywords: ["Connive"], oracleText: "Other Villains you control are Heroes in addition to their other types.\n{T}: Target Hero you control connives. Activate only as a sorcery. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)" });
const veteranMotorist = card("Veteran Motorist", "Creature — Dwarf Pilot", "{R}{W}", { cmc: 2, power: "3", toughness: "1", keywords: ["Scry"], colors: ["R","W"], oracleText: "When this creature enters, scry 2.\nWhenever this creature crews a Vehicle, that Vehicle gets +1/+1 until end of turn." });
const walkerOfTheWastes = card("Walker of the Wastes", "Creature — Eldrazi", "{4}{C}", { cmc: 5, power: "4", toughness: "4", keywords: ["Trample"], oracleText: "({C} represents colorless mana.)\nTrample\nThis creature gets +1/+1 for each land you control named Wastes." });
const wallOfEssence = card("Wall of Essence", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nWhenever this creature is dealt combat damage, you gain that much life." });
const wallOfSouls = card("Wall of Souls", "Creature — Wall", "{1}{B}", { cmc: 2, power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nWhenever this creature is dealt combat damage, it deals that much damage to target opponent or planeswalker." });
const witchbaneOrb = card("Witchbane Orb", "Artifact", "{4}", { cmc: 4, oracleText: "When this artifact enters, destroy all Curses attached to you.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control, including Aura spells.)" });
const kudoKingAmongBears = card("Kudo, King Among Bears", "Legendary Creature — Bear", "{G}{W}", { cmc: 2, power: "2", toughness: "2", colors: ["G","W"], oracleText: "Other creatures have base power and toughness 2/2 and are Bears in addition to their other types." });
const marchOfTheWorldOoze = card("March of the World Ooze", "Enchantment", "{3}{G}{G}{G}", { cmc: 6, oracleText: "Creatures you control have base power and toughness 6/6 and are Oozes in addition to their other types.\nWhenever an opponent casts a spell, if it's not their turn, you create a 3/3 green Elephant creature token." });
const raisedByGiants = card("Raised by Giants", "Legendary Enchantment — Background", "{5}{G}", { cmc: 6, oracleText: "Commander creatures you own have base power and toughness 10/10 and are Giants in addition to their other types." });

describe("Type, color and power statics", () => {
  it("are fully supported", () => supported(hivestone, valentinaAllegraDeFontaine, captainsHook, caterwaulingBoggart, darkestHour, walkerOfTheWastes, earthSurge, bloodBaronOfVizkopa, sardianCliffstomper, grondTheGatebreaker, civicSaber, blessingOfTheNephilim, knightOfNewAlara, earthenAlly, aysenCrusader, precipitousDrop, spectralGrasp, apocalypseDemon, kudoKingAmongBears, marchOfTheWorldOoze, raisedByGiants));

  it("Hivestone makes your creatures Slivers, not anyone else's", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, greenBear());
    putOnBattlefield(s, ap, hivestone);
    expect(chars(s, mine).subtypes).toEqual(expect.arrayContaining(["Bear", "Sliver"]));
    expect(chars(s, theirs).subtypes).not.toContain("Sliver");
  });

  it("Valentina Allegra de Fontaine makes your other Villains Heroes too", () => {
    const { s, ap, opp } = setup([]);
    const villain = putOnBattlefield(s, ap, creature("Test Villain", "Creature — Human Villain", "{B}", 1, 1));
    const theirs = putOnBattlefield(s, opp, creature("Test Villain", "Creature — Human Villain", "{B}", 1, 1));
    const v = putOnBattlefield(s, ap, valentinaAllegraDeFontaine);
    expect(chars(s, villain).subtypes).toEqual(expect.arrayContaining(["Villain", "Hero"]));
    expect(chars(s, theirs).subtypes).not.toContain("Hero");
    expect(chars(s, v).subtypes).not.toContain("Hero");
  });

  it("Kudo and March of the World Ooze still set base power and toughness and add the type", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, greenBear());
    putOnBattlefield(s, ap, marchOfTheWorldOoze);
    expect(pt(s, mine)).toBe("6/6");
    expect(chars(s, mine).subtypes).toContain("Ooze");
    putOnBattlefield(s, opp, kudoKingAmongBears);
    expect(pt(s, theirs)).toBe("2/2");
    expect(chars(s, mine).subtypes).toEqual(expect.arrayContaining(["Ooze", "Bear"]));
  });

  it("Captain's Hook: +2/+0, menace, and a Pirate", () => {
    const { s, ap } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    attach(s, ap, captainsHook, bear);
    expect(pt(s, bear)).toBe("4/2");
    expect(has(s, bear, "Menace")).toBe(true);
    expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Pirate"]));
  });

  it("Caterwauling Boggart gives your Goblins and Elementals menace", () => {
    const { s, ap, opp } = setup([]);
    const gob = putOnBattlefield(s, ap, redGoblin());
    const elem = putOnBattlefield(s, ap, creature("Test Elemental", "Creature — Elemental", "{1}{R}", 2, 2));
    const bear = putOnBattlefield(s, ap, greenBear());
    const theirGob = putOnBattlefield(s, opp, redGoblin());
    const boggart = putOnBattlefield(s, ap, caterwaulingBoggart);
    expect([gob, elem].map((id) => has(s, id, "Menace"))).toEqual([true, true]);
    expect([bear, theirGob].map((id) => has(s, id, "Menace"))).toEqual([false, false]);
    expect(has(s, boggart, "Menace")).toBe(true); // a Goblin itself
  });

  it("Darkest Hour makes every creature black, and only black", () => {
    const { s, ap, opp } = setup([]);
    const elf = putOnBattlefield(s, opp, gwElf());
    putOnBattlefield(s, ap, darkestHour);
    expect(chars(s, elf).colors).toEqual(["B"]);
  });

  it("Walker of the Wastes: +1/+1 for each land you control named Wastes", () => {
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, walkerOfTheWastes);
    expect(pt(s, w)).toBe("4/4");
    putOnBattlefield(s, ap, wastes);
    putOnBattlefield(s, ap, wastes);
    putOnBattlefield(s, opp, wastes);
    invalidateCharacteristics(s);
    expect(pt(s, w)).toBe("6/6");
  });

  it("Earth Surge pumps each land that's a creature, anyone's", () => {
    const { s, ap, opp } = setup([]);
    const arbor = putOnBattlefield(s, opp, creature("Test Arbor", "Land Creature — Forest Dryad", "", 1, 1));
    const bear = putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, earthSurge);
    expect(pt(s, arbor)).toBe("3/3");
    expect(pt(s, bear)).toBe("2/2");
  });

  it("Blood Baron gets +6/+6 and flying only with 30 or more life and an opponent at 10 or less", () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bloodBaronOfVizkopa);
    s.players[ap]!.life = 30;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("4/4");
    s.players[opp]!.life = 10;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("10/10");
    expect(has(s, b, "Flying")).toBe(true);
    s.players[ap]!.life = 29;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("4/4");
  });

  it("Sardian Cliffstomper: +X/+0 for its Mountains, only on your turn and with four or more", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, sardianCliffstomper);
    const theirs = putOnBattlefield(s, opp, sardianCliffstomper);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, opp, mountain);
    invalidateCharacteristics(s);
    expect(pt(s, mine)).toBe("0/4"); // three Mountains
    expect(pt(s, theirs)).toBe("0/4"); // not their turn
    putOnBattlefield(s, ap, mountain);
    invalidateCharacteristics(s);
    expect(pt(s, mine)).toBe("4/4");
  });

  it("Grond is an artifact creature on your turn while you control an Army", () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, grondTheGatebreaker);
    const theirs = putOnBattlefield(s, opp, grondTheGatebreaker);
    expect(chars(s, g).types).not.toContain("Creature");
    putOnBattlefield(s, ap, creature("Test Army", "Creature — Army", "", 0, 0, { oracleText: "" }));
    putOnBattlefield(s, opp, creature("Test Army", "Creature — Army", "", 0, 0, { oracleText: "" }));
    invalidateCharacteristics(s);
    expect(chars(s, g).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, theirs).types).not.toContain("Creature");
  });

  it("Civic Saber and Blessing of the Nephilim count the colors of the creature they're on", () => {
    const { s, ap } = setup([]);
    const elf = putOnBattlefield(s, ap, gwElf());
    const golem = putOnBattlefield(s, ap, creature("Test Golem", "Artifact Creature — Golem", "{2}", 2, 2));
    attach(s, ap, civicSaber, elf);
    attach(s, ap, civicSaber, golem);
    expect(pt(s, elf)).toBe("4/2");
    expect(pt(s, golem)).toBe("2/2");
    attach(s, ap, blessingOfTheNephilim, elf);
    expect(pt(s, elf)).toBe("6/4");
  });

  it("Knight of New Alara: each other multicolored creature you control gets +1/+1 for each of its colors", () => {
    const { s, ap, opp } = setup([]);
    const elf = putOnBattlefield(s, ap, gwElf());
    const bear = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, gwElf());
    const k = putOnBattlefield(s, ap, knightOfNewAlara);
    expect(pt(s, elf)).toBe("4/4");
    expect(pt(s, bear)).toBe("2/2");
    expect(pt(s, theirs)).toBe("2/2");
    expect(pt(s, k)).toBe("2/2");
  });

  it("Earthen Ally: +1/+0 for each color among Allies you control, itself included", () => {
    const { s, ap, opp } = setup([]);
    const ally = putOnBattlefield(s, ap, earthenAlly);
    expect(pt(s, ally)).toBe("1/2");
    putOnBattlefield(s, ap, creature("Test Ally", "Creature — Human Ally", "{U}{R}", 1, 1, { colors: ["R", "U"] }));
    putOnBattlefield(s, ap, creature("Test Bear", "Creature — Bear", "{W}", 1, 1));
    putOnBattlefield(s, opp, creature("Test Ally", "Creature — Human Ally", "{B}", 1, 1));
    invalidateCharacteristics(s);
    expect(pt(s, ally)).toBe("3/2");
  });

  it("Aysen Crusader counts Soldiers and Warriors once each", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, aysenCrusader);
    expect(pt(s, a)).toBe("2/2");
    putOnBattlefield(s, ap, creature("Test Soldier", "Creature — Human Soldier", "{W}", 1, 1));
    putOnBattlefield(s, ap, creature("Test Warrior", "Creature — Human Warrior", "{W}", 1, 1));
    putOnBattlefield(s, ap, creature("Test Both", "Creature — Human Soldier Warrior", "{W}", 1, 1));
    invalidateCharacteristics(s);
    expect(pt(s, a)).toBe("5/5");
  });

  it("Precipitous Drop: -2/-2, or -5/-5 once you've completed a dungeon", () => {
    const { s, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    attach(s, ap, precipitousDrop, ogre);
    expect(pt(s, ogre)).toBe("4/4");
    s.players[ap]!.completedDungeons = ["Lost Mine of Phandelver"];
    invalidateCharacteristics(s);
    expect(pt(s, ogre)).toBe("1/1");
  });

  it("Spectral Grasp: the creature can't attack you, and can't block your creatures", () => {
    let { s, ap, opp } = setup([]);
    const third = s.turnOrder[2]!;
    const mine = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, greenBear());
    attach(s, ap, spectralGrasp, theirs);
    expect(chars(s, theirs).cantAttackPlayers).toContain(ap);
    expect(chars(s, theirs).cantAttackPlayers).not.toContain(third);
    s = toBlocks(s, ap, [{ attacker: mine, defender: opp }]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: theirs, attacker: mine }] })).toThrow();
  });
});

describe("Combat statics and triggers", () => {
  it("are fully supported", () => supported(hundredhandedOne, nobleQuarry, battlescarredGoblin, plagueWight, fireJuggler, piousWarrior, wallOfEssence, wallOfSouls, gearshiftAce, speedwayFanatic, veteranMotorist));

  it("Hundred-Handed One has reach and blocks a hundred creatures once monstrous", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hundredhandedOne);
    expect(has(s, h, "Reach")).toBe(false);
    expect(chars(s, h).extraBlocks).toBe(0);
    s.objects[h]!.monstrous = true;
    invalidateCharacteristics(s);
    expect(has(s, h, "Reach")).toBe(true);
    expect(chars(s, h).extraBlocks).toBe(99);
  });

  it("Noble Quarry: every creature able to block it, or the creature it enchants, does so", () => {
    const { s, ap, opp } = setup([]);
    const q = putOnBattlefield(s, ap, nobleQuarry);
    const bear = putOnBattlefield(s, ap, greenBear());
    expect(chars(s, q).allMustBlock).toBe(true);
    expect(chars(s, bear).allMustBlock).toBeFalsy();
    const other = putOnBattlefield(s, opp, greenBear());
    attach(s, ap, nobleQuarry, other);
    expect(chars(s, other).allMustBlock).toBe(true);
    expect(pt(s, other)).toBe("3/3");
  });

  it("Noble Quarry's opponent must block it with every creature able to", () => {
    let { s, ap, opp } = setup([]);
    const q = putOnBattlefield(s, ap, nobleQuarry);
    const b1 = putOnBattlefield(s, opp, greenBear());
    const b2 = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: q, defender: opp }]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: q }] })).toThrow();
    s = block(s, opp, [{ blocker: b1, attacker: q }, { blocker: b2, attacker: q }]);
    expect(s.step).toBe("declareBlockers");
  });

  it("Battle-Scarred Goblin deals 1 damage to each creature blocking it; Plague Wight gives them -1/-1", () => {
    for (const [def, expectDead] of [[battlescarredGoblin, true], [plagueWight, true]] as const) {
      let { s, ap, opp } = setup([]);
      const a = putOnBattlefield(s, ap, def);
      const b1 = putOnBattlefield(s, opp, redGoblin());
      const b2 = putOnBattlefield(s, opp, greenBear());
      s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
      s = settle(block(s, opp, [{ blocker: b1, attacker: a }, { blocker: b2, attacker: a }]));
      expect(zone(s, b1) === "graveyard", def.name).toBe(expectDead);
      expect(zone(s, b2), def.name).toBe("battlefield");
      if (def === plagueWight) expect(pt(s, b2)).toBe("1/1");
      else expect(s.objects[b2]!.damage).toBe(1);
    }
  });

  it("Fire Juggler deals 4 damage to each blocker when it wins the clash", () => {
    let { s, ap, opp } = setup([]);
    const j = putOnBattlefield(s, ap, fireJuggler);
    onTop(s, ap, bigOgre());
    const b = putOnBattlefield(s, opp, creature("Test Wall", "Creature — Wall", "{2}", 0, 4));
    s = toBlocks(s, ap, [{ attacker: j, defender: opp }]);
    s = block(s, opp, [{ blocker: b, attacker: j }]);
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
      else if (p?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: p.player, choice: p.options[0]! });
      else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [player(opp)] } as Action);
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Pious Warrior and Wall of Essence gain life equal to the combat damage dealt to them", () => {
    for (const def of [piousWarrior, wallOfEssence]) {
      let { s, ap, opp } = setup([]);
      const w = putOnBattlefield(s, opp, def);
      const a = putOnBattlefield(s, ap, greenBear());
      s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
      s = passTo(block(s, opp, [{ blocker: w, attacker: a }]), "end", ap);
      expect(life(s, opp), def.name).toBe(42);
    }
  });

  it("Wall of Souls deals the combat damage dealt to it to target opponent", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, opp, wallOfSouls);
    const a = putOnBattlefield(s, ap, greenBear());
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    s = passTo(block(s, opp, [{ blocker: w, attacker: a }]), "end", ap, { targets: [player(ap)] });
    expect(life(s, ap)).toBe(38);
    expect(life(s, opp)).toBe(40);
  });

  it("Gearshift Ace, Speedway Fanatic and Veteran Motorist give the Vehicle they crew first strike, haste or +1/+1", () => {
    for (const [def, check] of [
      [gearshiftAce, (s: GameState, v: string) => has(s, v, "First strike")],
      [speedwayFanatic, (s: GameState, v: string) => has(s, v, "Haste")],
      [veteranMotorist, (s: GameState, v: string) => pt(s, v) === "4/4"],
    ] as const) {
      let { s, ap } = setup([]);
      const pilot = putOnBattlefield(s, ap, def);
      const v = putOnBattlefield(s, ap, vehicle());
      s = settle(act(s, { type: "activateAbility", player: ap, objectId: v, index: 0, tapCreatures: [pilot] }));
      expect(chars(s, v).types, def.name).toContain("Creature");
      expect(check(s, v), def.name).toBe(true);
    }
  });

  it("a pilot's crew trigger doesn't fire when another creature crews", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, speedwayFanatic);
    const bear = putOnBattlefield(s, ap, greenBear());
    const v = putOnBattlefield(s, ap, vehicle());
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: v, index: 0, tapCreatures: [bear] }));
    expect(has(s, v, "Haste")).toBe(false);
  });
});

describe("Upkeep, end step and other triggers", () => {
  it("are fully supported", () => supported(apocalypseDemon, battleOfWits, neardeathExperience, primalOrder, shadowbornDemon, titanHunter, tinybonesPocketNuisance, narcomoeba, creepingChill, gaeasBlessing, michelangeloOnTheScene, splinterAgingChampion, llawanCephalidEmpress, witchbaneOrb, tangledSkyline));

  it("Apocalypse Demon: its power and toughness count your graveyard; at your upkeep it taps unless you sacrifice another creature", () => {
    for (const sac of [true, false]) {
      let { s, ap } = setup([]);
      const d = putOnBattlefield(s, ap, apocalypseDemon);
      const bear = putOnBattlefield(s, ap, greenBear());
      into(s, ap, greenBear(), "graveyard");
      expect(pt(s, d)).toBe("1/1");
      s = passUntil(s, "end", ap);
      s = passUntil(s, "upkeep", ap);
      const yard = s.players[ap]!.graveyard.length;
      s = settle(s, { yes: sac });
      expect(s.objects[d]!.tapped, `sacrifice ${sac}`).toBe(!sac);
      expect(zone(s, bear), `sacrifice ${sac}`).toBe(sac ? "graveyard" : "battlefield");
      expect(pt(s, d)).toBe(sac ? `${yard + 1}/${yard + 1}` : `${yard}/${yard}`);
    }
  });

  it("Apocalypse Demon taps when there's no other creature to sacrifice", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, apocalypseDemon);
    into(s, ap, greenBear(), "graveyard");
    s = passUntil(s, "end", ap);
    s = toUpkeep(s, ap);
    expect(s.objects[d]!.tapped).toBe(true);
    expect(zone(s, d)).toBe("battlefield");
  });

  it("Battle of Wits wins at your upkeep with 200 or more cards in your library", () => {
    for (const extra of [0, 120]) {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, battleOfWits);
      for (let i = 0; i < extra; i++) onTop(s, ap, forest);
      const n = s.players[ap]!.library.length;
      s = passUntil(s, "end", ap);
      s = toUpkeep(s, ap);
      expect(s.winner === ap, `${n} cards`).toBe(n >= 201);
    }
  });

  it("Near-Death Experience wins at your upkeep with exactly 1 life", () => {
    for (const l of [1, 2]) {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, neardeathExperience);
      s.players[ap]!.life = l;
      s = passUntil(s, "end", ap);
      s = toUpkeep(s, ap);
      expect(s.winner === ap, `${l} life`).toBe(l === 1);
    }
  });

  it("Primal Order deals damage to each player at their upkeep for each nonbasic land they control", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, primalOrder);
    const dual = card("Test Dual", "Land", "", { oracleText: "{T}: Add {G}." });
    putOnBattlefield(s, opp, dual);
    putOnBattlefield(s, opp, dual);
    putOnBattlefield(s, opp, forest);
    s = toUpkeep(s, opp);
    expect(life(s, opp)).toBe(38);
  });

  it("Shadowborn Demon destroys a non-Demon creature as it enters, and makes you sacrifice at upkeep with under six creature cards in your graveyard", () => {
    let { s, ap, opp, ids } = setup([shadowbornDemon]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const demon = putOnBattlefield(s, opp, creature("Test Demon", "Creature — Demon", "{2}{B}", 3, 3));
    const cast = run(s, planCast(s, ap, ids[0]!, []));
    expect(() => settle(cast, { targets: [tgt(demon)] })).toThrow(/illegal target/);
    ({ s, ap, opp, ids } = setup([shadowbornDemon]));
    const bear2 = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { targets: [tgt(bear2)] });
    expect(zone(s, bear2)).toBe("graveyard");
    expect(bear).toBeDefined();
    for (let i = 0; i < 4; i++) into(s, ap, greenBear(), "graveyard");
    s = passUntil(s, "end", ap);
    s = toUpkeep(s, ap);
    expect(zone(s, ids[0]!)).toBe("graveyard"); // five creature cards (the Bear it destroyed and four): the Demon is the only creature to sacrifice
    ({ s, ap } = setup([]));
    const d = putOnBattlefield(s, ap, shadowbornDemon);
    for (let i = 0; i < 6; i++) into(s, ap, greenBear(), "graveyard");
    s = passUntil(s, "end", ap);
    s = toUpkeep(s, ap);
    expect(zone(s, d)).toBe("battlefield");
  });

  it("Titan Hunter deals 4 damage to the player whose end step it is, unless a creature died this turn", () => {
    let { s, ap, opp, ids } = setup([testRaze()]);
    putOnBattlefield(s, ap, titanHunter);
    s = settle(passUntil(s, "end", ap));
    expect(life(s, ap)).toBe(36);
    s = settle(passUntil(s, "end", opp));
    expect(life(s, opp)).toBe(36);
    ({ s, ap, opp, ids } = setup([testRaze()]));
    putOnBattlefield(s, ap, titanHunter);
    const bear = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    s = settle(passUntil(s, "end", ap));
    expect(life(s, ap)).toBe(40);
  });

  it("Tinybones: each opponent discards as it enters, and each player who discards triggers 1 damage to each opponent", () => {
    let { s, ap, opp, ids } = setup([tinybonesPocketNuisance]);
    for (const pid of s.turnOrder) if (pid !== ap) into(s, pid, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    // Three opponents discarded at once: three triggers, 3 damage to each opponent (CR 603.2c).
    expect(life(s, opp)).toBe(37);
    expect(life(s, ap)).toBe(40);
  });

  it("Narcomoeba and Creeping Chill trigger when milled from your library", () => {
    let { s, ap, opp, ids } = setup([testMill()]);
    const chill = onTop(s, ap, creepingChill);
    const n = onTop(s, ap, narcomoeba);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, n)).toBe("battlefield");
    expect(zone(s, chill)).toBe("exile");
    expect(life(s, opp)).toBe(37);
    expect(life(s, ap)).toBe(43);
  });

  it("Gaea's Blessing shuffles your graveyard into your library when milled", () => {
    let { s, ap, ids } = setup([testMill()]);
    into(s, ap, greenBear(), "graveyard");
    onTop(s, ap, gaeasBlessing);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.graveyard.length).toBe(0);
  });

  it("Narcomoeba doesn't trigger from your hand", () => {
    const rummage = card("Test Rummage", "Sorcery", "{R}", { cmc: 1, oracleText: "Discard a card, then draw a card." });
    let { s, ap, ids } = setup([rummage, narcomoeba]);
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = act(s, { type: "passPriority", player: ap });
    for (let i = 0; i < 10 && s.pending?.kind !== "discard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("Michelangelo enters with a counter for each land and returns to your hand when it dies", () => {
    let { s, ap, ids } = setup([michelangeloOnTheScene, testRaze()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(14);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("Splinter destroys up to one tapped creature, and as it leaves you and another target player each draw", () => {
    let { s, ap, opp, ids } = setup([splinterAgingChampion, testRaze()]);
    const tapped = putOnBattlefield(s, opp, greenBear());
    s.objects[tapped]!.tapped = true;
    const untapped = putOnBattlefield(s, opp, greenBear());
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { targets: [tgt(tapped)] });
    expect(zone(s, tapped)).toBe("graveyard");
    expect(zone(s, untapped)).toBe("battlefield");
    const mine = s.players[ap]!.hand.length;
    const theirs = s.players[opp]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])), { targets: [player(opp)] });
    expect(s.players[ap]!.hand.length).toBe(mine);
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
  });

  it("Llawan returns your opponents' blue creatures, and they can't cast blue creature spells", () => {
    let { s, ap, opp, ids } = setup([llawanCephalidEmpress]);
    const bird = putOnBattlefield(s, opp, blueBird());
    const bear = putOnBattlefield(s, opp, greenBear());
    const mine = putOnBattlefield(s, ap, blueBird());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, bird)).toBe("hand");
    expect([zone(s, bear), zone(s, mine)]).toEqual(["battlefield", "battlefield"]);
    const island = card("Island", "Basic Land — Island");
    putOnBattlefield(s, opp, island);
    putOnBattlefield(s, opp, island);
    const flashBird = into(s, opp, creature("Flash Bird", "Creature — Bird", "{U}", 1, 1, { keywords: ["Flash"], oracleText: "Flash" }), "hand");
    const flashBear = into(s, opp, creature("Flash Bear", "Creature — Bear", "{G}", 1, 1, { keywords: ["Flash"], oracleText: "Flash" }), "hand");
    putOnBattlefield(s, opp, forest);
    const blueSpell = into(s, opp, card("Test Draw", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." }), "hand");
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(planCast(s, opp, flashBird, [])).toBeNull();
    expect(planCast(s, opp, flashBear, [])).not.toBeNull();
    expect(planCast(s, opp, blueSpell, [])).not.toBeNull();
  });

  it("Witchbane Orb destroys the Curses attached to you and gives you hexproof", () => {
    let { s, ap, opp, ids } = setup([witchbaneOrb]);
    const curse = card("Test Curse", "Enchantment — Aura Curse", "{B}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant player\nAt the beginning of enchanted player's upkeep, that player loses 1 life." });
    const onMe = putOnBattlefield(s, opp, curse);
    s.objects[onMe]!.attachedToPlayer = ap;
    const onThem = putOnBattlefield(s, ap, curse);
    s.objects[onThem]!.attachedToPlayer = opp;
    const aura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant player" });
    const notCurse = putOnBattlefield(s, opp, aura);
    s.objects[notCurse]!.attachedToPlayer = ap;
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, onMe)).toBe("graveyard");
    expect(zone(s, onThem)).toBe("battlefield");
    expect(zone(s, notCurse)).toBe("battlefield");
    const shock = into(s, opp, testShock());
    putOnBattlefield(s, opp, mountain);
    s = act(s, { type: "passPriority", player: ap });
    expect(planCast(s, opp, shock, [player(ap)])).toBeNull();
    expect(planCast(s, opp, shock, [player(s.turnOrder[2]!)])).not.toBeNull();
  });

  it("Tangled Skyline: you gain 5 life and incubate 5; Phyrexians you control have reach", () => {
    let { s, ap, ids } = setup([tangledSkyline]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(life(s, ap)).toBe(45);
    const [inc] = tokens(s, ap);
    expect(s.objects[inc!]!.counters["+1/+1"]).toBe(5);
    const phy = putOnBattlefield(s, ap, creature("Test Phyrexian", "Creature — Phyrexian Horror", "{B}", 1, 1));
    expect(has(s, phy, "Reach")).toBe(true);
  });
});

describe("Spells and activated abilities", () => {
  it("are fully supported", () => supported(blightning, rakdossReturn, goBlank, smashingSuccess, soldOut, planTheHeist, fancyFootwork, roadRage, glisteningDawn, decimatorWeb, runeboundWolf, godsire, quicksilverSpeedster));

  it("Blightning deals 3 damage to the player, who discards two cards", () => {
    let { s, ap, opp, ids } = setup([blightning]);
    emptyHand(s, opp);
    for (let i = 0; i < 3; i++) into(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(life(s, opp)).toBe(37);
    expect(s.players[opp]!.hand.length).toBe(1);
    expect(s.players[opp]!.graveyard.length).toBe(2);
  });

  it("Blightning at a planeswalker makes its controller discard", () => {
    let { s, ap, opp, ids } = setup([blightning]);
    const pw = putOnBattlefield(s, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." }));
    s.objects[pw]!.counters.loyalty = 5;
    emptyHand(s, opp);
    for (let i = 0; i < 2; i++) into(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(pw)])));
    expect(s.objects[pw]!.counters.loyalty).toBe(2);
    expect(life(s, opp)).toBe(40);
    expect(s.players[opp]!.hand.length).toBe(0);
  });

  it("Rakdos's Return deals X damage to an opponent, who discards X cards", () => {
    let { s, ap, opp, ids } = setup([rakdossReturn]);
    emptyHand(s, opp);
    for (let i = 0; i < 4; i++) into(s, opp, greenBear());
    const plan = planCast(s, ap, ids[0]!, [player(opp)], undefined, undefined, 3);
    s = settle(run(s, plan));
    expect(life(s, opp)).toBe(37);
    expect(s.players[opp]!.hand.length).toBe(1);
    expect(planCast(s, ap, into(s, ap, rakdossReturn), [player(ap)], undefined, undefined, 1)).toBeNull();
  });

  it("Go Blank: the player discards two cards, then their graveyard is exiled", () => {
    let { s, ap, opp, ids } = setup([goBlank]);
    emptyHand(s, opp);
    for (let i = 0; i < 3; i++) into(s, opp, greenBear());
    const old = into(s, opp, greenBear(), "graveyard");
    const mine = into(s, ap, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.hand.length).toBe(1);
    expect(s.players[opp]!.graveyard.length).toBe(0);
    expect(zone(s, old)).toBe("exile");
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("Smashing Success makes a Treasure only when it destroys an artifact", () => {
    for (const art of [true, false]) {
      let { s, ap, opp, ids } = setup([smashingSuccess]);
      const t = putOnBattlefield(s, opp, art ? card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "" }) : card("Test Dual", "Land", "", { oracleText: "{T}: Add {G}." }));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
      expect(zone(s, t)).toBe("graveyard");
      expect(tokens(s, ap).length, `artifact ${art}`).toBe(art ? 1 : 0);
    }
  });

  it("Sold Out exiles the creature, with a Clue if it was dealt damage this turn", () => {
    for (const hurt of [true, false]) {
      let { s, ap, opp, ids } = setup([soldOut, testShock()]);
      const ogre = putOnBattlefield(s, opp, bigOgre());
      if (hurt) s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ogre)])));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
      expect(zone(s, ogre)).toBe("exile");
      expect(tokens(s, ap).length, `damaged ${hurt}`).toBe(hurt ? 1 : 0);
    }
  });

  it("Plan the Heist surveils 3 only with no cards in hand, then draws three", () => {
    for (const empty of [true, false]) {
      let { s, ap, ids } = setup([planTheHeist]);
      emptyHand(s, ap);
      s.players[ap]!.hand.push(ids[0]!);
      s.objects[ids[0]!]!.zone = "hand";
      s.players[ap]!.library.splice(s.players[ap]!.library.indexOf(ids[0]!), 1);
      if (!empty) into(s, ap, greenBear());
      s = run(s, planCast(s, ap, ids[0]!, []));
      for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, away: p.cards.slice(0, 1), top: p.cards.slice(1) });
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.players[ap]!.graveyard.length, `empty ${empty}`).toBe(empty ? 2 : 1);
      expect(s.players[ap]!.hand.length).toBe(empty ? 3 : 4);
    }
  });

  it("Fancy Footwork untaps one or two creatures and pumps them", () => {
    let { s, ap, ids } = setup([fancyFootwork]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s.objects[a]!.tapped = true;
    s.objects[b]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect([s.objects[a]!.tapped, s.objects[b]!.tapped]).toEqual([false, false]);
    expect([pt(s, a), pt(s, b)]).toEqual(["4/4", "4/4"]);
  });

  it("Road Rage deals 2 plus the number of Mounts and Vehicles you control", () => {
    let { s, ap, opp, ids } = setup([roadRage]);
    putOnBattlefield(s, ap, vehicle());
    putOnBattlefield(s, ap, creature("Test Mount", "Creature — Horse Mount", "{1}{W}", 2, 2));
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(s.objects[ogre]!.damage).toBe(4);
  });

  it("Glistening Dawn incubates X twice, X being the lands you control", () => {
    let { s, ap, ids } = setup([glisteningDawn]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    const incs = tokens(s, ap);
    expect(incs.length).toBe(2);
    expect(incs.map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([14, 14]);
  });

  it("Decimator Web: the opponent loses 2 life, gets a poison counter, then mills six", () => {
    let { s, ap, opp } = setup([]);
    const web = putOnBattlefield(s, ap, decimatorWeb);
    s = settle(run(s, planActivate(s, ap, web, 0, [player(opp)])));
    expect(life(s, opp)).toBe(38);
    expect(s.players[opp]!.poison).toBe(1);
    expect(s.players[opp]!.graveyard.length).toBe(6);
  });

  it("Runebound Wolf deals damage equal to your Wolves and Werewolves to target opponent", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, runeboundWolf);
    putOnBattlefield(s, ap, creature("Test Werewolf", "Creature — Human Werewolf", "{1}{G}", 2, 2));
    putOnBattlefield(s, opp, creature("Test Wolf", "Creature — Wolf", "{1}{G}", 2, 2));
    s = settle(run(s, planActivate(s, ap, w, 0, [player(opp)])));
    expect(life(s, opp)).toBe(38);
  });

  it("Godsire makes an 8/8 red, green and white Beast", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, godsire);
    s = settle(run(s, planActivate(s, ap, g, 0, [])));
    const [beast] = tokens(s, ap);
    expect(pt(s, beast!)).toBe("8/8");
    expect([...chars(s, beast!).colors].sort()).toEqual(["G", "R", "W"]);
    expect(chars(s, beast!).subtypes).toEqual(["Beast"]);
  });

  it("Quicksilver lets you cast spells as though they had flash while it's tapped", () => {
    let { s, ap, opp, ids } = setup([greenBear()]);
    const q = putOnBattlefield(s, ap, quicksilverSpeedster);
    s = passUntil(s, "upkeep", opp);
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    expect(planCast(s, ap, ids[0]!, [])).toBeNull();
    s.objects[q]!.tapped = true;
    expect(planCast(s, ap, ids[0]!, [])).not.toBeNull();
  });
});
