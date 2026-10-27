// Round 180: the most played cards still unsupported, in popularity order, from about rank 11,250 on, and the cards
// that share their templates.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { blockProblem, spellCost, characteristics, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, splitSecondOnStack, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { countersBanned, putCounters, putPlayerCounters } from "../src/counters";

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
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
/** Attacks with `attackers`; `blocks` are declared by the defending player. */
const combat = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  s = resolveAll(s);
  s = passUntil(s, "declareBlockers", ap);
  if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks });
  return resolveAll(s);
};
const murder = card("Test Murder", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." });
const opt = card("Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const bigBear = card("Big Bear", "Creature — Bear", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });
const hillGiant = card("Hill Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" });
const testAura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const glider = card("Test Glider", "Artifact — Vehicle", "{2}", { cmc: 2, power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nCrew 1" });
const cart = card("Test Cart", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", oracleText: "Crew 1" });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { cmc: 1, power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const infector = card("Test Infector", "Creature — Phyrexian", "{1}{B}", { cmc: 2, power: "2", toughness: "2", keywords: ["Infect"], oracleText: "Infect" });
const pin = card("Test Pin", "Enchantment", "{W}", { cmc: 1, oracleText: "Test" });

// Real oracle text (Scryfall).
const anointWithAffliction = card("Anoint with Affliction", "Instant", "{1}{B}", {cmc: 2,"keywords":["Corrupted"],"oracleText":"Exile target creature if it has mana value 3 or less.\nCorrupted — Exile that creature instead if its controller has three or more poison counters."});
const arcboundOverseer = card("Arcbound Overseer", "Artifact Creature — Golem", "{8}", {cmc: 8,"power":"0","toughness":"0","keywords":["Modular"],"oracleText":"At the beginning of your upkeep, put a +1/+1 counter on each creature you control with modular.\nModular 6 (This creature enters with six +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)"});
const armageddonClock = card("Armageddon Clock", "Artifact", "{6}", {cmc: 6,"oracleText":"At the beginning of your upkeep, put a doom counter on this artifact.\nAt the beginning of your draw step, this artifact deals damage equal to the number of doom counters on it to each player.\n{4}: Remove a doom counter from this artifact. Any player may activate this ability but only during any upkeep step."});
const assembledAlphas = card("Assembled Alphas", "Creature — Wolf", "{5}{R}", {cmc: 6,"power":"5","toughness":"5","oracleText":"Whenever this creature blocks or becomes blocked by a creature, this creature deals 3 damage to that creature and 3 damage to that creature's controller."});
const avariceAmulet = card("Avarice Amulet", "Artifact — Equipment", "{4}", {cmc: 4,"keywords":["Equip"],"oracleText":"Equipped creature gets +2/+0 and has vigilance and \"At the beginning of your upkeep, draw a card.\"\nWhenever equipped creature dies, target opponent gains control of this Equipment.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"});
const battlescarredGoblin = card("Battle-Scarred Goblin", "Creature — Goblin Warrior", "{1}{R}", {cmc: 2,"power":"2","toughness":"2","oracleText":"Whenever this creature becomes blocked, it deals 1 damage to each creature blocking it."});
const callASurpriseWitness = card("Call a Surprise Witness", "Sorcery", "{1}{W}", {cmc: 2,"oracleText":"Return target creature card with mana value 3 or less from your graveyard to the battlefield. Put a flying counter on it. It's a Spirit in addition to its other types."});
const captainAmericaTeamLeader = card("Captain America, Team Leader", "Legendary Creature — Human Soldier Hero", "{R}{W}{U}", {cmc: 3,"power":"3","toughness":"3","oracleText":"Whenever another Hero you control enters, it gains vigilance and haste until end of turn. Put a +1/+1 counter on that Hero and a +1/+1 counter on Captain America.","colors":["R","U","W"]});
const captainAmericaUnbowed = card("Captain America, Unbowed", "Legendary Creature — Human Soldier Hero", "{3}{W}", {cmc: 4,"power":"3","toughness":"4","keywords":["Flash"],"oracleText":"Flash\nWhen Captain America enters, Soldiers and Heroes you control gain indestructible until end of turn."});
const caradoraHeartOfAlacria = card("Caradora, Heart of Alacria", "Legendary Creature — Human Knight", "{2}{G}{W}", {cmc: 4,"power":"4","toughness":"2","oracleText":"When Caradora enters, you may search your library for a Mount or Vehicle card, reveal it, put it into your hand, then shuffle.\nIf one or more +1/+1 counters would be put on a creature or Vehicle you control, that many plus one +1/+1 counters are put on it instead."});
const ceaselessConflict = card("Ceaseless Conflict", "Sorcery", "{3}{W}{W}", {cmc: 5,"oracleText":"Destroy all creatures. Then create a 3/2 red and white Spirit creature token for each nontoken creature you controlled that was destroyed this way."});
const cidTimelessArtificer = card("Cid, Timeless Artificer", "Legendary Creature — Human Artificer", "{2}{W}{U}", {cmc: 4,"power":"4","toughness":"4","keywords":["Cycling"],"oracleText":"Artifact creatures and Heroes you control get +1/+1 for each Artificer you control and each Artificer card in your graveyard.\nA deck can have any number of cards named Cid, Timeless Artificer.\nCycling {W}{U} ({W}{U}, Discard this card: Draw a card.)","colors":["U","W"]});
const darksteelAngel = card("Darksteel Angel", "Artifact Creature — Angel", "{9}", {cmc: 9,"power":"4","toughness":"4","keywords":["Flying","Indestructible"],"oracleText":"Flying, indestructible\nYou can't lose the game and your opponents can't win the game.\nCreatures you control can't have -1/-1 counters put on them."});
const desperateMeasures = card("Desperate Measures", "Instant", "{B}", {cmc: 1,"oracleText":"Target creature gets +1/-1 until end of turn. When it dies under your control this turn, draw two cards."});
const draconicDestiny = card("Draconic Destiny", "Enchantment — Aura", "{1}{R}{R}", {cmc: 3,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 and has flying, haste, and \"{1}: This creature gets +1/+0 until end of turn.\" It's a Dragon in addition to its other types.\nWhen enchanted creature dies, return this card to its owner's hand."});
const dualsunTechnique = card("Dual-Sun Technique", "Instant", "{1}{W}", {cmc: 2,"oracleText":"Target creature you control gains double strike until end of turn. If it has a +1/+1 counter on it, draw a card."});
const essenceSymbiote = card("Essence Symbiote", "Creature — Beast", "{1}{G}", {cmc: 2,"power":"2","toughness":"2","oracleText":"Whenever a creature you control mutates, put a +1/+1 counter on that creature and you gain 2 life."});
const faceOfDivinity = card("Face of Divinity", "Enchantment — Aura", "{2}{W}", {cmc: 3,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2.\nAs long as another Aura is attached to enchanted creature, it has first strike and lifelink."});
const feastOnTheFallen = card("Feast on the Fallen", "Enchantment", "{2}{B}", {cmc: 3,"oracleText":"At the beginning of each upkeep, if an opponent lost life last turn, put a +1/+1 counter on target creature you control."});
const fireJuggler = card("Fire Juggler", "Creature — Goblin Shaman", "{2}{R}", {cmc: 3,"power":"2","toughness":"2","keywords":["Clash"],"oracleText":"Whenever this creature becomes blocked, clash with an opponent. If you win, this creature deals 4 damage to each creature blocking it. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)"});
const fugitiveDroid = card("Fugitive Droid", "Artifact Creature — Robot Scientist", "{U}", {cmc: 1,"power":"1","toughness":"1","oracleText":"This creature can't be blocked if an artifact entered the battlefield under your control this turn.\n{U}, Sacrifice this creature: Counter target spell that targets an artifact or creature you control."});
const gloomSower = card("Gloom Sower", "Creature — Horror", "{5}{B}{B}", {cmc: 7,"power":"8","toughness":"6","oracleText":"Whenever this creature becomes blocked by a creature, that creature's controller loses 2 life and you gain 2 life."});
const goblinCadets = card("Goblin Cadets", "Creature — Goblin", "{R}", {cmc: 1,"power":"2","toughness":"1","oracleText":"Whenever this creature blocks or becomes blocked, target opponent gains control of it. (This removes this creature from combat.)"});
const hawkeyeTrickShot = card("Hawkeye, Trick Shot", "Legendary Creature — Human Archer Hero", "{3}{R}", {cmc: 4,"power":"3","toughness":"4","keywords":["Reach","First strike"],"oracleText":"Reach, first strike\nWhenever Hawkeye or another Hero you control enters, it deals damage equal to the number of Heroes you control to any target."});
const heraldOfIlharg = card("Herald of Ilharg", "Creature — Boar Beast", "{2}{R}{G}", {cmc: 4,"power":"3","toughness":"3","keywords":["Trample"],"oracleText":"Trample\nWhenever you cast a creature spell, put two +1/+1 counters on this creature. If that spell has mana value 5 or greater, this creature deals damage equal to the number of counters on it to each opponent.","colors":["G","R"]});
const hiddenDragonslayer = card("Hidden Dragonslayer", "Creature — Human Warrior", "{1}{W}", {cmc: 2,"power":"2","toughness":"1","keywords":["Lifelink","Megamorph"],"oracleText":"Lifelink\nMegamorph {2}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)\nWhen this creature is turned face up, destroy target creature with power 4 or greater an opponent controls."});
const ichtekikSalvageSplicer = card("Ich-Tekik, Salvage Splicer", "Legendary Creature — Phyrexian Human Artificer", "{4}{G}", {cmc: 5,"power":"1","toughness":"1","keywords":["Partner"],"oracleText":"When Ich-Tekik enters, create a 3/3 colorless Phyrexian Golem artifact creature token.\nWhenever an artifact is put into a graveyard from the battlefield, put a +1/+1 counter on Ich-Tekik and a +1/+1 counter on each Golem you control.\nPartner (You can have two commanders if both have partner.)"});
const kamiOfTransience = card("Kami of Transience", "Creature — Spirit", "{1}{G}", {cmc: 2,"power":"2","toughness":"2","keywords":["Trample"],"oracleText":"Trample\nWhenever you cast an enchantment spell, put a +1/+1 counter on this creature.\nAt the beginning of each end step, if an enchantment was put into your graveyard from the battlefield this turn, you may return this card from your graveyard to your hand."});
const lightmineField = card("Lightmine Field", "Enchantment", "{2}{W}{W}", {cmc: 4,"oracleText":"Whenever one or more creatures attack, this enchantment deals damage to each of those creatures equal to the number of attacking creatures."});
const lightningReaver = card("Lightning Reaver", "Creature — Zombie Beast", "{3}{B}{R}", {cmc: 5,"power":"3","toughness":"3","keywords":["Haste","Fear"],"oracleText":"Haste; fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nWhenever this creature deals combat damage to a player, put a charge counter on it.\nAt the beginning of your end step, this creature deals damage equal to the number of charge counters on it to each opponent."});
const markOfSakiko = card("Mark of Sakiko", "Enchantment — Aura", "{1}{G}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature has \"Whenever this creature deals combat damage to a player, add that much {G}. Until end of turn, you don't lose this mana as steps and phases end.\""});
const maskOfTheSchemer = card("Mask of the Schemer", "Artifact — Equipment", "{2}{U}", {cmc: 3,"keywords":["Equip","Connive"],"oracleText":"Whenever equipped creature deals combat damage to a player, it connives X, where X is the amount of damage it dealt to that player. (Draw X cards, then discard X cards. Put a +1/+1 counter on that creature for each nonland card discarded this way.)\nEquip {2}"});
const meglonoth = card("Meglonoth", "Creature — Beast", "{3}{R}{G}{W}", {cmc: 6,"power":"6","toughness":"6","keywords":["Vigilance","Trample"],"oracleText":"Vigilance, trample\nWhenever this creature blocks a creature, this creature deals damage to that creature's controller equal to this creature's power.","colors":["G","R","W"]});
const meliraSylvokOutcast = card("Melira, Sylvok Outcast", "Legendary Creature — Human Scout", "{1}{G}", {cmc: 2,"power":"2","toughness":"2","oracleText":"You can't get poison counters.\nCreatures you control can't have -1/-1 counters put on them.\nCreatures your opponents control lose infect."});
const mentalModulation = card("Mental Modulation", "Instant", "{1}{U}", {cmc: 2,"oracleText":"This spell costs {1} less to cast during your turn.\nTap target artifact or creature.\nDraw a card."});
const milesTailsPrower = card("Miles \"Tails\" Prower", "Legendary Creature — Fox Artificer", "{1}{W}{U}", {cmc: 3,"power":"3","toughness":"1","keywords":["Flying","Flash"],"oracleText":"Flash\nFlying\nWhenever a Vehicle you control enters, draw a card if it has flying. Otherwise, put a flying counter on it.","colors":["U","W"]});
const nessianBoar = card("Nessian Boar", "Creature — Boar", "{3}{G}{G}", {cmc: 5,"power":"10","toughness":"6","oracleText":"All creatures able to block this creature do so.\nWhenever this creature becomes blocked by a creature, that creature's controller draws a card."});
const pantherHabit = card("Panther Habit", "Artifact — Equipment", "{4}", {cmc: 4,"keywords":["Equip"],"oracleText":"If equipped creature would be dealt damage, prevent that damage and put that many +1/+1 counters on it.\nEquip {2}"});
const parkHeightsMaverick = card("Park Heights Maverick", "Creature — Human Soldier", "{2}{G}", {cmc: 3,"power":"2","toughness":"2","keywords":["Dethrone","Proliferate"],"oracleText":"Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nThis creature can't be blocked by creatures with power 2 or less.\nWhenever this creature deals combat damage to a player or dies, proliferate."});
const plagueWight = card("Plague Wight", "Creature — Zombie", "{1}{B}", {cmc: 2,"power":"2","toughness":"1","oracleText":"Whenever this creature becomes blocked, each creature blocking it gets -1/-1 until end of turn."});
const prismariApprentice = card("Prismari Apprentice", "Creature — Human Shaman", "{U}{R}", {cmc: 2,"power":"2","toughness":"2","keywords":["Magecraft"],"oracleText":"Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature can't be blocked this turn. If that spell has mana value 5 or greater, put a +1/+1 counter on this creature.","colors":["R","U"]});
const raphaelNinjaDestroyer = card("Raphael, Ninja Destroyer", "Legendary Creature — Mutant Ninja Turtle", "{2}{R}{R}", {cmc: 4,"power":"4","toughness":"4","keywords":["Enrage"],"oracleText":"Raphael must be blocked if able.\nEnrage — Whenever Raphael is dealt damage, add that much {R}. Until end of turn, you don't lose this mana as steps and phases end."});
const relentlessRats = card("Relentless Rats", "Creature — Rat", "{1}{B}{B}", {cmc: 3,"power":"2","toughness":"2","oracleText":"This creature gets +1/+1 for each other creature on the battlefield named Relentless Rats.\nA deck can have any number of cards named Relentless Rats."});
const relentlessXatm092 = card("Relentless X-ATM092", "Artifact Creature — Robot Spider", "{6}", {cmc: 6,"power":"6","toughness":"5","oracleText":"This creature can't be blocked except by three or more creatures.\n{8}: Return this card from your graveyard to the battlefield tapped with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)"});
const retrofittedTransmogrant = card("Retrofitted Transmogrant", "Artifact Creature — Zombie", "{B}", {cmc: 1,"power":"1","toughness":"1","oracleText":"{3}{B}: Return this card from your graveyard to the battlefield tapped with two +1/+1 counters on it."});
const returnUponTheTide = card("Return Upon the Tide", "Sorcery", "{4}{B}", {cmc: 5,"keywords":["Foretell"],"oracleText":"Return target creature card from your graveyard to the battlefield. If it's an Elf, create two 1/1 green Elf Warrior creature tokens.\nForetell {3}{B} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)"});
const sakikoMotherOfSummer = card("Sakiko, Mother of Summer", "Legendary Creature — Snake Shaman", "{4}{G}{G}", {cmc: 6,"power":"3","toughness":"3","oracleText":"Whenever a creature you control deals combat damage to a player, add that much {G}. Until end of turn, you don't lose this mana as steps and phases end."});
const samutTyrantOfNaktamun = card("Samut, Tyrant of Naktamun", "Legendary Creature — Human Wizard", "{1}{U}", {cmc: 2,"power":"2","toughness":"1","oracleText":"Instant and sorcery spells you control have split second. (As long as a spell with split second is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)"});
const sevenDwarves = card("Seven Dwarves", "Creature — Dwarf", "{1}{R}", {cmc: 2,"power":"2","toughness":"2","oracleText":"This creature gets +1/+1 for each other creature named Seven Dwarves you control.\nA deck can have up to seven cards named Seven Dwarves."});
const shehulkWallbreaker = card("She-Hulk, Wallbreaker", "Legendary Creature — Gamma Hero", "{5}{R}", {cmc: 6,"power":"5","toughness":"5","keywords":["Trample"],"oracleText":"Trample\nOther Heroes you control have trample.\nWhenever a Hero you control becomes blocked, put a +1/+1 counter on that Hero for each creature blocking it."});
const silkwrap = card("Silkwrap", "Enchantment", "{1}{W}", {cmc: 2,"oracleText":"When this enchantment enters, exile target creature with mana value 3 or less an opponent controls until this enchantment leaves the battlefield. (That creature returns under its owner's control.)"});
const silumgarAssassin = card("Silumgar Assassin", "Creature — Human Assassin", "{1}{B}", {cmc: 2,"power":"2","toughness":"1","keywords":["Megamorph"],"oracleText":"Creatures with power greater than this creature's power can't block it.\nMegamorph {2}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)\nWhen this creature is turned face up, destroy target creature with power 3 or less an opponent controls."});
const sleeperAgent = card("Sleeper Agent", "Creature — Phyrexian Minion", "{B}", {cmc: 1,"power":"3","toughness":"3","oracleText":"When this creature enters, target opponent gains control of it.\nAt the beginning of your upkeep, this creature deals 2 damage to you."});
const slogurkTheOverslime = card("Slogurk, the Overslime", "Legendary Creature — Ooze", "{1}{G}{U}", {cmc: 3,"power":"3","toughness":"3","keywords":["Trample"],"oracleText":"Trample\nWhenever a land card is put into your graveyard from anywhere, put a +1/+1 counter on Slogurk.\nRemove three +1/+1 counters from Slogurk: Return it to its owner's hand.\nWhen Slogurk leaves the battlefield, return up to three target land cards from your graveyard to your hand."});
const theThingBenGrimm = card("The Thing, Ben Grimm", "Legendary Creature — Human Hero", "{5}{G}", {cmc: 6,"power":"7","toughness":"7","keywords":["Trample"],"oracleText":"Trample\nWhenever one or more Heroes you control deal damage to a player, put two +1/+1 counters on The Thing."});
const tideShaper = card("Tide Shaper", "Creature — Merfolk Wizard", "{U}", {cmc: 1,"power":"1","toughness":"1","keywords":["Kicker"],"oracleText":"Kicker {1} (You may pay an additional {1} as you cast this spell.)\nWhen this creature enters, if it was kicked, target land becomes an Island for as long as this creature remains on the battlefield.\nThis creature gets +1/+1 as long as an opponent controls an Island."});
const trailblazersTorch = card("Trailblazer's Torch", "Artifact — Equipment", "{4}", {cmc: 4,"keywords":["Equip"],"oracleText":"When this Equipment enters, you take the initiative.\nWhenever equipped creature becomes blocked, it deals 2 damage to each creature blocking it.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)"});
const treacherousPitdweller = card("Treacherous Pit-Dweller", "Creature — Demon", "{B}{B}", {cmc: 2,"power":"4","toughness":"3","keywords":["Undying"],"oracleText":"When this creature enters from a graveyard, target opponent gains control of it.\nUndying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)"});
const vengefulRegrowth = card("Vengeful Regrowth", "Sorcery", "{4}{G}{G}", {cmc: 6,"keywords":["Flashback"],"oracleText":"Return up to three target land cards from your graveyard to the battlefield tapped. Create that many 4/2 green Plant Warrior creature tokens with reach.\nFlashback {6}{G}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const viciousBattlerager = card("Vicious Battlerager", "Creature — Dwarf Barbarian", "{3}{B}", {cmc: 4,"power":"1","toughness":"5","keywords":["Spiked Retribution"],"oracleText":"When this creature enters, you take the initiative.\nSpiked Retribution — Whenever this creature becomes blocked by a creature, that creature's controller loses 5 life."});
const zardaThePowerPrincess = card("Zarda, the Power Princess", "Legendary Creature — Human Warrior Hero", "{3}{W}", {cmc: 4,"power":"2","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nOther Heroes you control have exalted. (Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted among permanents you control.)"});
const daruStinger = card("Daru Stinger", "Creature — Soldier", "{3}{W}", {cmc: 4,"power":"1","toughness":"1","keywords":["Amplify"],"oracleText":"Amplify 1 (As this creature enters, put a +1/+1 counter on it for each Soldier card you reveal in your hand.)\n{T}: This creature deals damage equal to the number of +1/+1 counters on it to target attacking or blocking creature."});
const kjeldoranJavelineer = card("Kjeldoran Javelineer", "Creature — Human Soldier", "{W}", {cmc: 1,"power":"1","toughness":"2","keywords":["Cumulative upkeep"],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\n{T}: This creature deals damage equal to the number of age counters on it to target attacking or blocking creature."});
const gemrazer = card("Gemrazer", "Creature — Beast", "{3}{G}", {cmc: 4,"power":"4","toughness":"4","keywords":["Reach","Mutate","Trample"],"oracleText":"Mutate {1}{G}{G} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nReach, trample\nWhenever this creature mutates, destroy target artifact or enchantment an opponent controls."});
const egon = scry("modal_dfc", [{"name":"Egon, God of Death","mana_cost":"{2}{B}","type_line":"Legendary Creature — God","oracle_text":"Deathtouch\nAt the beginning of your upkeep, exile two cards from your graveyard. If you can't, sacrifice Egon and draw a card.","power":"6","toughness":"6"},{"name":"Throne of Death","mana_cost":"{B}","type_line":"Legendary Artifact","oracle_text":"At the beginning of your upkeep, mill a card.\n{2}{B}, {T}, Exile a creature card from your graveyard: Draw a card."}], {"keywords":["Mill","Deathtouch"]});
const faithboundJudge = scry("transform", [{"name":"Faithbound Judge","mana_cost":"{1}{W}{W}","type_line":"Creature — Spirit Soldier","oracle_text":"Defender, flying, vigilance\nAt the beginning of your upkeep, if this creature has two or fewer judgment counters on it, put a judgment counter on it.\nAs long as this creature has three or more judgment counters on it, it can attack as though it didn't have defender.\nDisturb {5}{W}{W}","power":"4","toughness":"4"},{"name":"Sinner's Judgment","mana_cost":"","type_line":"Enchantment — Aura Curse","oracle_text":"Enchant player\nAt the beginning of your upkeep, put a judgment counter on this Aura. Then if there are three or more judgment counters on it, enchanted player loses the game.\nIf Sinner's Judgment would be put into a graveyard from anywhere, exile it instead.","color_indicator":["W"]}], {"keywords":["Flying","Vigilance","Transform","Enchant","Defender","Disturb"]});

describe("round 180", () => {
  it("all compile", () => supported(anointWithAffliction, arcboundOverseer, armageddonClock, assembledAlphas, avariceAmulet, battlescarredGoblin, callASurpriseWitness, captainAmericaTeamLeader, captainAmericaUnbowed, caradoraHeartOfAlacria, ceaselessConflict, cidTimelessArtificer, darksteelAngel, desperateMeasures, draconicDestiny, dualsunTechnique, essenceSymbiote, faceOfDivinity, feastOnTheFallen, fireJuggler, fugitiveDroid, gloomSower, goblinCadets, hawkeyeTrickShot, heraldOfIlharg, hiddenDragonslayer, ichtekikSalvageSplicer, kamiOfTransience, lightmineField, lightningReaver, markOfSakiko, maskOfTheSchemer, meglonoth, meliraSylvokOutcast, mentalModulation, milesTailsPrower, nessianBoar, pantherHabit, parkHeightsMaverick, plagueWight, prismariApprentice, raphaelNinjaDestroyer, relentlessRats, relentlessXatm092, retrofittedTransmogrant, returnUponTheTide, sakikoMotherOfSummer, samutTyrantOfNaktamun, sevenDwarves, shehulkWallbreaker, silkwrap, silumgarAssassin, sleeperAgent, slogurkTheOverslime, theThingBenGrimm, tideShaper, trailblazersTorch, treacherousPitdweller, vengefulRegrowth, viciousBattlerager, zardaThePowerPrincess, daruStinger, kjeldoranJavelineer, egon, faithboundJudge));

  it("Anoint with Affliction: exiles a creature with mana value 3 or less, or any creature of a player with three poison counters", () => {
    const { s: s0, ap, ids, opp } = setup([anointWithAffliction, anointWithAffliction, anointWithAffliction]);
    const small = putOnBattlefield(s0, opp, bear({ cmc: 2 }));
    const big = putOnBattlefield(s0, opp, bigBear);
    putOnBattlefield(s0, ap, swamp);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)])));
    expect(zone(s, small)).toBe("exile");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(big)])));
    expect(zone(s, big)).toBe("battlefield");
    s.players[opp]!.poison = 3;
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(big)])));
    expect(zone(s, big)).toBe("exile");
  });

  it("Ceaseless Conflict: a Spirit for each nontoken creature you controlled that was destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([ceaselessConflict]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    const tok = putOnBattlefield(s0, ap, bear());
    s0.objects[tok]!.isToken = true;
    putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, ap, "Grizzly Bears").length).toBe(0);
    expect(named(s, ap, "Spirit").length).toBe(2);
    expect(named(s, opp, "Spirit").length).toBe(0);
  });

  it("Desperate Measures: draws two when the creature dies under your control, not an opponent's", () => {
    const { s: s0, ap, ids, opp } = setup([desperateMeasures, desperateMeasures]);
    const mine = putOnBattlefield(s0, ap, card("Frail Thing", "Creature — Spirit", "{W}", { cmc: 1, power: "1", toughness: "1" }));
    const theirs = putOnBattlefield(s0, opp, card("Frail Thing", "Creature — Spirit", "{W}", { cmc: 1, power: "1", toughness: "1" }));
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)])));
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2);
  });

  it("Egon, God of Death: with fewer than two cards in your graveyard, sacrifice it and draw", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, egon);
    let s = passUntil(s0, "upkeep", ap, 4000);
    s = resolveAll(s);
    // Its upkeep came round: nothing in the graveyard to exile.
    expect(zone(s, e)).toBe("graveyard");
  });

  it("Egon, God of Death: with two or more, exile two of them", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, egon);
    const a = into(s0, ap, bear(), "graveyard");
    const b = into(s0, ap, bear(), "graveyard");
    let s = passUntil(s0, "upkeep", ap, 4000);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "exile", min: 2, max: 2 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [a, b] }));
    expect(zone(s, e)).toBe("battlefield");
    expect([zone(s, a), zone(s, b)]).toEqual(["exile", "exile"]);
  });

  it("Face of Divinity: first strike and lifelink only with another Aura on the creature", () => {
    const { s: s0, ap, ids } = setup([faceOfDivinity, testAura]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(false);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Lifelink")).toBe(true);
  });

  it("Feast on the Fallen: a counter at an upkeep after a turn an opponent lost life in, not after one without", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s0, ap, feastOnTheFallen);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.life).toBe(38);
    s = passUntil(s, "upkeep", opp);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s = resolveAll(s);
    expect(counters(s, b)).toBe(1);
    // Nobody lost life during that turn: nothing at the next upkeep.
    const next = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    s = resolveAll(passUntil(s, "upkeep", next));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(counters(s, b)).toBe(1);
  });

  it("Kami of Transience: returns from your graveyard at the end step after an enchantment of yours went to the graveyard", () => {
    const disenchant = card("Test Disenchant", "Instant", "{W}", { cmc: 1, oracleText: "Destroy target enchantment." });
    const { s: s0, ap, ids } = setup([disenchant]);
    const kami = into(s0, ap, kamiOfTransience, "graveyard");
    const ench = putOnBattlefield(s0, ap, pin);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(ench)])));
    expect(zone(s, ench)).toBe("graveyard");
    s = passUntil(s, "end", ap);
    expect(s.stack.length).toBe(1);
    s = resolveAll(s);
    expect(zone(s, kami)).toBe("hand");
  });

  it("Kami of Transience: stays put on a turn without one", () => {
    const { s: s0, ap } = setup([]);
    const kami = into(s0, ap, kamiOfTransience, "graveyard");
    const s = resolveAll(passUntil(s0, "end", ap));
    expect(zone(s, kami)).toBe("graveyard");
  });

  it("Lightmine Field: each attacker is dealt damage equal to the number of attacking creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, lightmineField);
    const a = putOnBattlefield(s0, ap, bigBear);
    const b = putOnBattlefield(s0, ap, bigBear);
    const s = resolveAll(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] }));
    expect([s.objects[a]!.damage, s.objects[b]!.damage]).toEqual([2, 2]);
  });

  it("Mark of Sakiko: combat damage to a player adds that much {G}, kept until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([markOfSakiko]);
    const b = putOnBattlefield(s0, ap, bigBear);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    s = combat(s, ap, opp, [b]);
    s = resolveAll(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(35);
    expect(s.players[ap]!.manaPool.G).toBe(5);
  });

  it("Miles \"Tails\" Prower: draws for a Vehicle with flying, else gives it a flying counter", () => {
    const { s: s0, ap, ids } = setup([glider, cart]);
    putOnBattlefield(s0, ap, milesTailsPrower);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
    expect(counters(s, ids[1]!, "flying")).toBe(1);
  });

  it("Caradora: one more +1/+1 counter on a creature or Vehicle you control", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, caradoraHeartOfAlacria);
    const b = putOnBattlefield(s, ap, bear());
    const v = putOnBattlefield(s, ap, cart);
    const theirs = putOnBattlefield(s, opp, bear());
    putCounters(s, s.objects[b]!, "+1/+1", 1);
    putCounters(s, s.objects[v]!, "+1/+1", 2);
    putCounters(s, s.objects[theirs]!, "+1/+1", 1);
    expect([counters(s, b), counters(s, v), counters(s, theirs)]).toEqual([2, 3, 1]);
  });

  it("Silumgar Assassin: creatures with greater power can't block it", () => {
    const { s, ap, opp } = setup([]);
    const sa = putOnBattlefield(s, ap, silumgarAssassin);
    const big = putOnBattlefield(s, opp, hillGiant);
    const small = putOnBattlefield(s, opp, bear());
    s.objects[sa]!.attacking = opp;
    expect(blockProblem(s, s.objects[big]!, s.objects[sa]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[small]!, s.objects[sa]!)).toBeNull();
  });

  it("Relentless Rats and Seven Dwarves count the others with their name", () => {
    const { s, ap } = setup([]);
    const r1 = putOnBattlefield(s, ap, relentlessRats);
    putOnBattlefield(s, ap, relentlessRats);
    putOnBattlefield(s, ap, relentlessRats);
    const d1 = putOnBattlefield(s, ap, sevenDwarves);
    putOnBattlefield(s, ap, sevenDwarves);
    expect(pt(s, r1)).toBe("4/4");
    expect(pt(s, d1)).toBe("3/3");
  });

  it("Samut: your instant and sorcery spells have split second, not your creature spells", () => {
    const { s: s0, ap, ids } = setup([opt, bear()]);
    putOnBattlefield(s0, ap, samutTyrantOfNaktamun);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(splitSecondOnStack(s)).toBe(true);
    s = resolveAll(s);
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.stack.length).toBe(1);
    expect(splitSecondOnStack(s)).toBe(false);
  });

  it("Melira: no poison counters for you, no -1/-1 counters on your creatures, opponents' creatures lose infect", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, meliraSylvokOutcast);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const inf = putOnBattlefield(s, opp, infector);
    expect(putPlayerCounters(s, ap, "poison", 2)).toBe(0);
    expect(putPlayerCounters(s, opp, "poison", 2)).toBe(2);
    expect(countersBanned(s, s.objects[b]!, "-1/-1")).toBe(true);
    expect(countersBanned(s, s.objects[theirs]!, "-1/-1")).toBe(false);
    expect(objHasKeyword(s, s.objects[inf]!, "Infect")).toBe(false);
  });

  it("Daru Stinger and Kjeldoran Javelineer count the counters on themselves, not on the target", () => {
    for (const d of [daruStinger, kjeldoranJavelineer]) {
      const body = compileCard(d).activated[0]!.body;
      expect(JSON.stringify(body.effects)).toContain('"of":{"ref":"self"}');
    }
  });

  it("Battle-Scarred Goblin and Plague Wight: about each creature blocking it", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, battlescarredGoblin);
    const w = putOnBattlefield(s0, ap, plagueWight);
    const b1 = putOnBattlefield(s0, opp, bigBear);
    const b2 = putOnBattlefield(s0, opp, bigBear);
    const b3 = putOnBattlefield(s0, opp, bigBear);
    const s = combat(s0, ap, opp, [g, w], [{ blocker: b1, attacker: g }, { blocker: b2, attacker: g }, { blocker: b3, attacker: w }]);
    expect([s.objects[b1]!.damage, s.objects[b2]!.damage]).toEqual([1, 1]);
    expect(pt(s, b3)).toBe("4/4");
  });

  it("She-Hulk: a Hero that becomes blocked gets a counter for each creature blocking it", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, shehulkWallbreaker);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const s = combat(s0, ap, opp, [h], [{ blocker: b1, attacker: h }, { blocker: b2, attacker: h }]);
    expect(counters(s, h)).toBe(2);
  });

  it("Vengeful Regrowth: the lands come back tapped, with as many Plant Warriors", () => {
    const { s: s0, ap, ids } = setup([vengefulRegrowth]);
    const forestCard = card("Forest", "Basic Land — Forest");
    const l1 = into(s0, ap, forestCard, "graveyard");
    const l2 = into(s0, ap, forestCard, "graveyard");
    into(s0, ap, forestCard, "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(l1), tgt(l2), { kind: "none" }])));
    expect([zone(s, l1), zone(s, l2)]).toEqual(["battlefield", "battlefield"]);
    expect(s.objects[l1]!.tapped).toBe(true);
    expect(named(s, ap, "Plant Warrior").length).toBe(2);
  });

  it("Return Upon the Tide: two Elf Warriors only if it returned an Elf", () => {
    const { s: s0, ap, ids } = setup([returnUponTheTide, returnUponTheTide]);
    const e = into(s0, ap, elf, "graveyard");
    const b = into(s0, ap, bear(), "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(named(s, ap, "Elf Warrior").length).toBe(0);
    s.players[ap]!.manaPool.B += 5;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(e)])));
    expect(zone(s, e)).toBe("battlefield");
    expect(named(s, ap, "Elf Warrior").length).toBe(2);
  });

  it("Call a Surprise Witness: back with a flying counter, a Spirit too", () => {
    const { s: s0, ap, ids } = setup([callASurpriseWitness]);
    const b = into(s0, ap, bear(), "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(counters(s, b, "flying")).toBe(1);
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Spirit"]));
  });

  it("Herald of Ilharg: two counters for each creature spell, and as much damage to each opponent as it has counters for one of mana value 5 or more", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ cmc: 2 }), bigBear]);
    const h = putOnBattlefield(s0, ap, heraldOfIlharg);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, h)).toBe(2);
    expect(s.players[opp]!.life).toBe(40);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, h)).toBe(4);
    for (const p of s.turnOrder.filter((q) => q !== ap)) expect(s.players[p]!.life).toBe(36);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Panther Habit: damage to the equipped creature becomes +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const b = putOnBattlefield(s0, ap, bear());
    const e = putOnBattlefield(s0, ap, pantherHabit);
    let s = resolveAll(run(s0, planActivate(s0, ap, e, 0, [tgt(b)])));
    expect(s.objects[e]!.attachedTo).toBe(b);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[b]!.damage).toBe(0);
    expect(counters(s, b)).toBe(2);
  });

  it("Sleeper Agent: an opponent gains control of it as it enters", () => {
    const { s: s0, ap, ids, opp } = setup([sleeperAgent]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    expect(controllerOf(s, s.objects[ids[0]!]!)).toBe(opp);
  });

  it("Tide Shaper, kicked: the land is an Island while Tide Shaper remains", () => {
    const { s: s0, ap, ids, opp } = setup([tideShaper, murder]);
    const land = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }));
    expect(characteristics(s, s.objects[land]!).subtypes).toEqual(["Island"]);
    // An opponent controls an Island now: +1/+1.
    expect(pt(s, ids[0]!)).toBe("2/2");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(characteristics(s, s.objects[land]!).subtypes).toEqual(["Forest"]);
  });

  it("Essence Symbiote: a creature of yours that mutates gets a counter, and you gain 2 life", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    putOnBattlefield(s0, ap, essenceSymbiote);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { alt: "mutate" })));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "mutate" });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "top" }));
    expect(counters(s, b)).toBe(1);
    expect(s.players[ap]!.life).toBe(42);
  });

  it("Faithbound Judge: a judgment counter at your upkeep while it has two or fewer", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, faithboundJudge);
    s0.objects[j]!.counters.judgment = 2;
    let s = resolveAll(passUntil(s0, "upkeep", ap, 4000));
    expect(counters(s, j, "judgment")).toBe(3);
    s = resolveAll(passUntil(passUntil(s, "draw", ap), "upkeep", ap, 4000));
    expect(counters(s, j, "judgment")).toBe(3);
  });

  it("Gloom Sower and Vicious Battlerager: the blocking creature's controller loses life", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gloomSower);
    const v = putOnBattlefield(s0, ap, viciousBattlerager);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const s = combat(s0, ap, opp, [g, v], [{ blocker: b1, attacker: g }, { blocker: b2, attacker: v }]);
    expect(s.players[opp]!.life).toBe(40 - 2 - 5);
    expect(s.players[ap]!.life).toBe(42);
  });

  it("Assembled Alphas: 3 damage to the creature it blocks and 3 to that creature's controller", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, assembledAlphas);
    const o = putOnBattlefield(s0, opp, bigBear);
    let s = resolveAll(act(passUntil(s0, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: o, defender: ap }] }));
    s = passUntil(s, "declareBlockers", opp);
    s = resolveAll(act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: a, attacker: o }] }));
    expect(s.objects[o]!.damage).toBe(3);
    expect(s.players[opp]!.life).toBe(37);
  });

  it("Goblin Cadets: an opponent gains control of it when it becomes blocked", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, goblinCadets);
    const b = putOnBattlefield(s0, opp, bear());
    let s = combat(s0, ap, opp, [c], [{ blocker: b, attacker: c }]);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    expect(controllerOf(s, s.objects[c]!)).toBe(opp);
  });

  it("Silkwrap: exiles a creature with mana value 3 or less an opponent controls, not a bigger one", () => {
    const { s: s0, ap, ids, opp } = setup([silkwrap]);
    const small = putOnBattlefield(s0, opp, bear({ cmc: 2 }));
    putOnBattlefield(s0, opp, bigBear);
    putOnBattlefield(s0, ap, bear({ cmc: 2 }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] }));
    expect(zone(s, small)).toBe("exile");
  });

  it("Hawkeye: it deals damage equal to the number of Heroes you control as a Hero enters", () => {
    const hero = card("Test Hero", "Creature — Human Hero", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
    const { s: s0, ap, ids, opp } = setup([hero]);
    putOnBattlefield(s0, ap, hawkeyeTrickShot);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Darksteel Angel: no -1/-1 counters on your creatures", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, darksteelAngel);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    expect(countersBanned(s, s.objects[b]!, "-1/-1")).toBe(true);
    expect(countersBanned(s, s.objects[b]!, "+1/+1")).toBe(false);
    expect(countersBanned(s, s.objects[theirs]!, "-1/-1")).toBe(false);
  });

  it("Relentless X-ATM092: back from your graveyard tapped with a finality counter", () => {
    const { s: s0, ap } = setup([]);
    const r = into(s0, ap, relentlessXatm092, "graveyard");
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    const s = resolveAll(run(s0, planActivate(s0, ap, r, 0)));
    expect(zone(s, r)).toBe("battlefield");
    expect(s.objects[r]!.tapped).toBe(true);
    expect(counters(s, r, "finality")).toBe(1);
  });

  it("Lightning Reaver: damage equal to the charge counters on itself to each opponent", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, lightningReaver);
    s0.objects[r]!.counters.charge = 2;
    const s = resolveAll(passUntil(s0, "end", ap));
    for (const p of s.turnOrder.filter((q) => q !== ap)) expect(s.players[p]!.life).toBe(38);
  });

  it("Dual-Sun Technique: double strike, and a card if the creature has a +1/+1 counter", () => {
    const { s: s0, ap, ids } = setup([dualsunTechnique, dualsunTechnique]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(objHasKeyword(s, s.objects[a]!, "Double strike")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });

  it("Mental Modulation costs {1} less during your turn", () => {
    const { s, ap, ids, opp } = setup([mentalModulation]);
    const generic = () => {
      const c = spellCost(s, ap, s.objects[ids[0]!]!);
      return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
    };
    expect(generic()).toBe(0);
    // Not during another player's turn.
    s.activePlayer = opp;
    expect(generic()).toBe(1);
  });

  it("Ich-Tekik: a counter on it and each Golem when an artifact goes to a graveyard from the battlefield", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const ich = putOnBattlefield(s0, ap, ichtekikSalvageSplicer);
    const golem = putOnBattlefield(s0, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" }));
    const thing = putOnBattlefield(s0, ap, card("Test Thopter", "Artifact Creature — Thopter", "{1}", { cmc: 1, power: "1", toughness: "1" }));
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(thing)])));
    expect(counters(s, ich)).toBe(1);
    expect(counters(s, golem)).toBe(1);
  });
});
