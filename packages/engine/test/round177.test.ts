// Round 177: the most played cards still unsupported, in popularity order, from about rank 9,240 on, and the cards that
// share their mechanics.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, plainsCard, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Answers a pending mode choice, then a pending target choice. */
const choose = (s: GameState, modes: number[] | null, targets?: TargetChoice[]) => {
  if (modes) {
    if (s.pending?.kind !== "chooseModes") throw new Error(`no mode choice: ${s.pending?.kind}`);
    s = act(s, { type: "chooseModes", player: s.pending.player, modes });
  }
  if (targets) {
    if (s.pending?.kind !== "chooseTargets") throw new Error(`no target choice: ${s.pending?.kind}`);
    s = act(s, { type: "chooseTargets", player: s.pending.player, targets });
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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types;
const everyType = (s: GameState, id: string) => characteristics(s, s.objects[id]!).allCreatureTypes;
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && types(s, id).includes("Land") && !s.objects[id]!.tapped).length;
const giantGrowth = card("Giant Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });
const sprout = card("Sprout", "Sorcery", "{G}", { cmc: 1, oracleText: "Create a 1/1 green Saproling creature token." });
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const cancel = card("Cancel", "Instant", "{1}{U}{U}", { cmc: 3, oracleText: "Counter target spell." });
const forestCard = card("Forest", "Basic Land — Forest", "", { cmc: 0 });
const swampCard = card("Swamp", "Basic Land — Swamp", "", { cmc: 0 });
const mountainCard = card("Mountain", "Basic Land — Mountain", "", { cmc: 0 });

// Real oracle text (Scryfall).
const aetherStorm = card("Aether Storm", "Enchantment", "{3}{U}", {cmc: 4,"oracleText":"Creature spells can't be cast.\nPay 4 life: Destroy this enchantment. It can't be regenerated. Any player may activate this ability."});
const amorphousAxe = card("Amorphous Axe", "Artifact — Equipment", "{2}", {cmc: 2,"keywords":["Equip"],"oracleText":"Equipped creature gets +3/+0 and is every creature type.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)"});
const arachnoform = card("Arachnoform", "Enchantment — Aura", "{1}{G}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2, has reach, and is every creature type."});
const arcboundTracker = card("Arcbound Tracker", "Artifact Creature — Dog", "{2}{R}", {cmc: 3,"power":"0","toughness":"0","keywords":["Modular","Menace"],"oracleText":"Menace\nModular 2 (This creature enters with two +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)\nWhenever you cast a spell other than your first spell each turn, put a +1/+1 counter on this creature."});
const awakenTheErstwhile = card("Awaken the Erstwhile", "Sorcery", "{3}{B}{B}", {cmc: 5,"oracleText":"Each player discards all the cards in their hand, then creates that many 2/2 black Zombie creature tokens."});
const balthorTheDefiled = card("Balthor the Defiled", "Legendary Creature — Zombie Dwarf", "{2}{B}{B}", {cmc: 4,"power":"2","toughness":"2","oracleText":"Minion creatures get +1/+1.\n{B}{B}{B}, Exile Balthor: Each player returns all black and all red creature cards from their graveyard to the battlefield."});
const baruWurmspeaker = card("Baru, Wurmspeaker", "Legendary Creature — Human Druid", "{2}{G}{G}", {cmc: 4,"power":"3","toughness":"3","oracleText":"Wurms you control get +2/+2 and have trample.\n{7}{G}, {T}: Create a 4/4 green Wurm creature token. This ability costs {X} less to activate, where X is the greatest power among Wurms you control."});
const bioengineeredFuture = card("Bioengineered Future", "Enchantment", "{1}{G}{G}", {cmc: 3,"oracleText":"When this enchantment enters, create a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")\nEach creature you control enters with an additional +1/+1 counter on it for each land that entered the battlefield under your control this turn."});
const biorhythm = card("Biorhythm", "Sorcery", "{6}{G}{G}", {cmc: 8,"oracleText":"Each player's life total becomes the number of creatures they control."});
const bloodsporeThrinax = card("Bloodspore Thrinax", "Creature — Lizard", "{2}{G}{G}", {cmc: 4,"power":"2","toughness":"2","keywords":["Devour"],"oracleText":"Devour 1 (As this creature enters, you may sacrifice any number of creatures. It enters with that many +1/+1 counters on it.)\nEach other creature you control enters with an additional X +1/+1 counters on it, where X is the number of +1/+1 counters on this creature."});
const bonecacheOverseer = card("Bonecache Overseer", "Creature — Squirrel Warlock", "{B}", {cmc: 1,"power":"1","toughness":"1","oracleText":"{T}, Pay 1 life: Draw a card. Activate only if three or more cards left your graveyard this turn or if you've sacrificed a Food this turn."});
const crystalInhumanPrincess = card("Crystal, Inhuman Princess", "Legendary Creature — Inhuman Noble Hero", "{1}{R}{G}", {cmc: 3,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever you cast a noncreature spell, Crystal deals X damage to each opponent, where X is the number of colors that spell is.\n{T}: Add {R}, {G}, {W}, or {U}."});
const custodiLich = card("Custodi Lich", "Creature — Zombie Cleric", "{3}{B}{B}", {cmc: 5,"power":"4","toughness":"2","oracleText":"When this creature enters, you become the monarch.\nWhenever you become the monarch, target player sacrifices a creature of their choice."});
const demonicTaskmaster = card("Demonic Taskmaster", "Creature — Demon", "{2}{B}", {cmc: 3,"power":"4","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nAt the beginning of your upkeep, sacrifice a creature other than this creature."});
const devilsPlay = card("Devil's Play", "Sorcery", "{X}{R}", {cmc: 1,"keywords":["Flashback"],"oracleText":"Devil's Play deals X damage to any target.\nFlashback {X}{R}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const eldraziRepurposer = card("Eldrazi Repurposer", "Creature — Eldrazi Drone", "{2}{G}", {cmc: 3,"power":"3","toughness":"3","keywords":["Devoid"],"oracleText":"Devoid (This card has no color.)\nWhen you cast this spell and when this creature dies, create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\""});
const evolutionaryEscalation = card("Evolutionary Escalation", "Enchantment", "{1}{G}", {cmc: 2,"oracleText":"At the beginning of your upkeep, put three +1/+1 counters on target creature you control and three +1/+1 counters on target creature an opponent controls."});
const extinguishTheLight = card("Extinguish the Light", "Instant", "{2}{B}{B}", {cmc: 4,"oracleText":"Destroy target creature or planeswalker. If its mana value was 3 or less, you gain 3 life."});
const finaleOfEternity = card("Finale of Eternity", "Sorcery", "{X}{B}{B}", {cmc: 2,"oracleText":"Destroy up to three target creatures with toughness X or less. If X is 10 or more, return all creature cards from your graveyard to the battlefield."});
const flux = card("Flux", "Sorcery", "{2}{U}", {cmc: 3,"oracleText":"Each player discards any number of cards, then draws that many cards.\nDraw a card."});
const frostTitan = card("Frost Titan", "Creature — Giant", "{4}{U}{U}", {cmc: 6,"power":"6","toughness":"6","oracleText":"Whenever this creature becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}.\nWhenever this creature enters or attacks, tap target permanent. It doesn't untap during its controller's next untap step."});
const fullFlowering = card("Full Flowering", "Sorcery", "{X}{X}{G}", {cmc: 1,"keywords":["Populate"],"oracleText":"Populate X times. (To populate, create a token that's a copy of a creature token you control. Do this X times.)"});
const gaddockTeeg = card("Gaddock Teeg", "Legendary Creature — Kithkin Advisor", "{G}{W}", {cmc: 2,"power":"2","toughness":"2","oracleText":"Noncreature spells with mana value 4 or greater can't be cast.\nNoncreature spells with {X} in their mana costs can't be cast."});
const gerrardsVerdict = card("Gerrard's Verdict", "Sorcery", "{W}{B}", {cmc: 2,"oracleText":"Target player discards two cards. You gain 3 life for each land card discarded this way."});
const gloryOfWarfare = card("Glory of Warfare", "Enchantment", "{2}{R}{W}", {cmc: 4,"oracleText":"During your turn, creatures you control get +2/+0.\nDuring turns other than yours, creatures you control get +0/+2."});
const goldRush = card("Gold Rush", "Instant", "{1}{G}", {cmc: 2,"keywords":["Treasure"],"oracleText":"Create a Treasure token. Until end of turn, up to one target creature gets +2/+2 for each Treasure you control."});
const graviticPunch = card("Gravitic Punch", "Sorcery", "{3}{R}", {cmc: 4,"keywords":["Jump","Jump-start"],"oracleText":"Target creature you control deals damage equal to its power to target player.\nJump-start (You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile this card.)"});
const increasingAmbition = card("Increasing Ambition", "Sorcery", "{4}{B}", {cmc: 5,"keywords":["Flashback"],"oracleText":"Search your library for a card and put that card into your hand. If this spell was cast from a graveyard, instead search your library for two cards and put those cards into your hand. Then shuffle.\nFlashback {7}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const increasingConfusion = card("Increasing Confusion", "Sorcery", "{X}{U}", {cmc: 1,"keywords":["Flashback","Mill"],"oracleText":"Target player mills X cards. If this spell was cast from a graveyard, that player mills twice that many cards instead.\nFlashback {X}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const jadelightSpelunker = card("Jadelight Spelunker", "Creature — Merfolk Scout", "{X}{G}", {cmc: 1,"power":"1","toughness":"1","keywords":["Explore"],"oracleText":"When this creature enters, it explores X times. (To have it explore, reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on that creature, then put the card back or put it into your graveyard.)"});
const junkJet = card("Junk Jet", "Artifact — Equipment", "{1}{R}", {cmc: 2,"keywords":["Equip","Double"],"oracleText":"When this Equipment enters, create a Junk token. (It's an artifact with \"{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.\")\n{3}, Sacrifice another artifact: Double equipped creature's power until end of turn.\nEquip {1}"});
const kutzilsFlanker = card("Kutzil's Flanker", "Creature — Cat Warrior", "{2}{W}", {cmc: 3,"power":"3","toughness":"1","keywords":["Flash","Scry"],"oracleText":"Flash\nWhen this creature enters, choose one —\n• Put a +1/+1 counter on this creature for each creature that left the battlefield under your control this turn.\n• You gain 2 life and scry 2.\n• Exile target player's graveyard."});
const leatherArmor = card("Leather Armor", "Artifact — Equipment", "{1}", {cmc: 1,"keywords":["Equip"],"oracleText":"Equipped creature gets +0/+1 and has ward {1}. (Whenever equipped creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\nEquip {0}. Activate only once each turn."});
const liegeOfThePit = card("Liege of the Pit", "Creature — Demon", "{5}{B}{B}{B}", {cmc: 8,"power":"7","toughness":"7","keywords":["Flying","Morph","Trample"],"oracleText":"Flying, trample\nAt the beginning of your upkeep, sacrifice a creature other than this creature. If you can't, this creature deals 7 damage to you.\nMorph {B}{B}{B}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)"});
const lockjawSlobberingTeleporter = card("Lockjaw, Slobbering Teleporter", "Legendary Creature — Inhuman Dog Hero", "{1}{U}", {cmc: 2,"power":"1","toughness":"1","keywords":["Vigilance"],"oracleText":"Vigilance\nAt the beginning of combat on your turn, if you've cast a noncreature spell this turn, put a +1/+1 counter on Lockjaw. When you do, Lockjaw and up to one other target creature you control can't be blocked this turn."});
const lordOfThePit = card("Lord of the Pit", "Creature — Demon", "{4}{B}{B}{B}", {cmc: 7,"power":"7","toughness":"7","keywords":["Flying","Trample"],"oracleText":"Flying, trample\nAt the beginning of your upkeep, sacrifice a creature other than this creature. If you can't, this creature deals 7 damage to you."});
const manaCannons = card("Mana Cannons", "Enchantment", "{2}{R}", {cmc: 3,"oracleText":"Whenever you cast a multicolored spell, this enchantment deals X damage to any target, where X is the number of colors that spell is."});
const marthaJones = card("Martha Jones", "Legendary Creature — Human Cleric", "{2}{U}", {cmc: 3,"power":"3","toughness":"2","keywords":["Investigate","Woman Who Walked the Earth","Doctor's companion"],"oracleText":"Woman Who Walked the Earth — When Martha Jones enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nWhenever you sacrifice a Clue, Martha Jones and up to one other target creature can't be blocked this turn.\nDoctor's companion (You can have two commanders if the other is the Doctor.)"});
const mesaLynx = card("Mesa Lynx", "Creature — Cat", "{1}{W}", {cmc: 2,"power":"2","toughness":"1","oracleText":"During turns other than yours, this creature gets +0/+2."});
const midnightMangler = card("Midnight Mangler", "Artifact — Vehicle", "{1}{U}", {cmc: 2,"power":"3","toughness":"3","keywords":["Crew"],"oracleText":"During turns other than yours, this Vehicle is an artifact creature.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)"});
const mindFuneral = card("Mind Funeral", "Sorcery", "{1}{U}{B}", {cmc: 3,"oracleText":"Target opponent reveals cards from the top of their library until four land cards are revealed. That player puts all cards revealed this way into their graveyard."});
const oakStreetInnkeeper = card("Oak Street Innkeeper", "Creature — Elf", "{2}{G}", {cmc: 3,"power":"1","toughness":"2","oracleText":"During turns other than yours, tapped creatures you control have hexproof."});
const otterballAntics = card("Otterball Antics", "Sorcery", "{1}{U}", {cmc: 2,"keywords":["Flashback"],"oracleText":"Create a 1/1 blue and red Otter creature token with prowess. If this spell was cast from anywhere other than your hand, put a +1/+1 counter on that creature. (Whenever you cast a noncreature spell, a creature with prowess gets +1/+1 until end of turn.)\nFlashback {3}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const phoenixFleetAirship = card("Phoenix Fleet Airship", "Artifact — Vehicle", "{2}{B}{B}", {cmc: 4,"power":"4","toughness":"4","keywords":["Flying","Crew"],"oracleText":"Flying\nAt the beginning of your end step, if you sacrificed a permanent this turn, create a token that's a copy of this Vehicle.\nAs long as you control eight or more permanents named Phoenix Fleet Airship, this Vehicle is an artifact creature.\nCrew 1"});
const prismariPianist = card("Prismari Pianist", "Creature — Djinn Bard", "{1}{R}{R}", {cmc: 3,"power":"2","toughness":"1","oracleText":"Whenever you cast an instant or sorcery spell, create a 1/1 blue and red Elemental creature token. If that spell's mana value is 5 or greater, create three of those tokens instead."});
const razeToTheGround = card("Raze to the Ground", "Sorcery", "{2}{R}", {cmc: 3,"oracleText":"This spell can't be countered.\nDestroy target artifact. If its mana value was 1 or less, draw a card."});
const razorgrassInvoker = card("Razorgrass Invoker", "Creature — Elf Scout", "{3}{G}", {cmc: 4,"power":"4","toughness":"3","keywords":["Vigilance"],"oracleText":"Vigilance (Attacking doesn't cause this creature to tap.)\n{8}: This creature and up to one other target creature each get +3/+3 until end of turn."});
const resoluteArchangel = card("Resolute Archangel", "Creature — Angel", "{5}{W}{W}", {cmc: 7,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, if your life total is less than your starting life total, it becomes equal to your starting life total."});
const riverHeraldsBoon = card("River Heralds' Boon", "Instant", "{1}{G}", {cmc: 2,"oracleText":"Put a +1/+1 counter on target creature and a +1/+1 counter on up to one target Merfolk."});
const runechantersPike = card("Runechanter's Pike", "Artifact — Equipment", "{2}", {cmc: 2,"keywords":["Equip"],"oracleText":"Equipped creature has first strike and gets +X/+0, where X is the number of instant and sorcery cards in your graveyard.\nEquip {2}"});
const runedStalactite = card("Runed Stalactite", "Artifact — Equipment", "{1}", {cmc: 1,"keywords":["Equip"],"oracleText":"Equipped creature gets +1/+1 and is every creature type.\nEquip {2}"});
const seasonedPyromancer = card("Seasoned Pyromancer", "Creature — Human Shaman", "{1}{R}{R}", {cmc: 3,"power":"2","toughness":"2","oracleText":"When this creature enters, discard two cards, then draw two cards. For each nonland card discarded this way, create a 1/1 red Elemental creature token.\n{3}{R}{R}, Exile this card from your graveyard: Create two 1/1 red Elemental creature tokens."});
const seedshipImpact = card("Seedship Impact", "Instant", "{1}{G}", {cmc: 2,"oracleText":"Destroy target artifact or enchantment. If its mana value was 2 or less, create a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")"});
const shamanOfForgottenWays = card("Shaman of Forgotten Ways", "Creature — Human Shaman", "{2}{G}", {cmc: 3,"power":"2","toughness":"3","keywords":["Formidable"],"oracleText":"{T}: Add two mana in any combination of colors. Spend this mana only to cast creature spells.\nFormidable — {9}{G}{G}, {T}: Each player's life total becomes the number of creatures they control. Activate only if creatures you control have total power 8 or greater."});
const smaugTheImpenetrable = card("Smaug the Impenetrable", "Legendary Creature — Dragon", "{5}{B}{R}", {cmc: 7,"power":"8","toughness":"7","keywords":["Flying","Indestructible","Treasure","Haste"],"oracleText":"Flying, indestructible, haste\nWhenever Smaug is dealt noncombat damage, create that many Treasure tokens."});
const sokkaBoldBoomeranger = card("Sokka, Bold Boomeranger", "Legendary Creature — Human Warrior Ally", "{U}{R}", {cmc: 2,"power":"1","toughness":"1","oracleText":"When Sokka enters, discard up to two cards, then draw that many cards.\nWhenever you cast an artifact or Lesson spell, put a +1/+1 counter on Sokka."});
const stalactiteDagger = card("Stalactite Dagger", "Artifact — Equipment", "{2}", {cmc: 2,"keywords":["Equip"],"oracleText":"When this Equipment enters, create a 1/1 colorless Shapeshifter creature token with changeling. (It's every creature type.)\nEquipped creature gets +1/+1 and is all creature types.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"});
const surveyMechan = card("Survey Mechan", "Artifact Creature — Robot", "{4}", {cmc: 4,"power":"1","toughness":"3","keywords":["Flying","Hexproof"],"oracleText":"Flying\nHexproof (This creature can't be the target of spells or abilities your opponents control.)\n{10}, Sacrifice this creature: It deals 3 damage to any target. Target player draws three cards and gains 3 life. This ability costs {X} less to activate, where X is the number of differently named lands you control."});
const taigamOjutaiMaster = card("Taigam, Ojutai Master", "Legendary Creature — Human Monk", "{2}{W}{U}", {cmc: 4,"power":"3","toughness":"4","oracleText":"Instant, sorcery, and Dragon spells you control can't be countered.\nWhenever you cast an instant or sorcery spell from your hand, if Taigam attacked this turn, that spell gains rebound. (Exile the spell as it resolves. At the beginning of your next upkeep, you may cast that card from exile without paying its mana cost.)"});
const taintedTreats = card("Tainted Treats", "Instant", "{1}{B}{G}", {cmc: 3,"keywords":["Food"],"oracleText":"Destroy target artifact or creature. If its mana value was 4 or less, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")"});
const tatyovaStewardOfTides = card("Tatyova, Steward of Tides", "Legendary Creature — Merfolk Druid", "{G}{G}{U}", {cmc: 3,"power":"3","toughness":"3","oracleText":"Land creatures you control have flying.\nWhenever a land you control enters, if you control seven or more lands, up to one target land you control becomes a 3/3 Elemental creature with haste. It's still a land."});
const theDestinedBlackMage = card("The Destined Black Mage", "Legendary Creature — Human Wizard", "{2}{B}", {cmc: 3,"power":"3","toughness":"2","keywords":["Deathtouch"],"oracleText":"Deathtouch\n{B}, {T}: Another target creature you control gains deathtouch until end of turn.\nWhenever you cast a noncreature spell, The Destined Black Mage deals 1 damage to each opponent. If you have a full party, it deals 3 damage to each opponent instead."});
const undercoverSkrull = card("Undercover Skrull", "Creature — Skrull Shapeshifter Villain", "{1}{G}", {cmc: 2,"power":"1","toughness":"1","oracleText":"As long as there are two or more creature cards in your graveyard, this creature gets +2/+2 and is all creature types.\n{T}: Add one mana of any color."});
const vibratingSphere = card("Vibrating Sphere", "Artifact", "{4}", {cmc: 4,"oracleText":"During your turn, creatures you control get +2/+0.\nDuring turns other than yours, creatures you control get -0/-2."});
const wiltInTheHeat = card("Wilt in the Heat", "Instant", "{2}{R}{W}", {cmc: 4,"oracleText":"This spell costs {2} less to cast if one or more cards left your graveyard this turn.\nWilt in the Heat deals 5 damage to target creature. If that creature would die this turn, exile it instead."});
const wolfcallersHowl = card("Wolfcaller's Howl", "Enchantment", "{3}{G}", {cmc: 4,"oracleText":"At the beginning of your upkeep, create X 2/2 green Wolf creature tokens, where X is the number of your opponents with four or more cards in hand."});
const yorvoLordOfGarenbrig = card("Yorvo, Lord of Garenbrig", "Legendary Creature — Giant Noble", "{G}{G}{G}", {cmc: 3,"power":"0","toughness":"0","oracleText":"Yorvo enters with four +1/+1 counters on it.\nWhenever another green creature you control enters, put a +1/+1 counter on Yorvo. Then if that creature's power is greater than Yorvo's power, put another +1/+1 counter on Yorvo."});

describe("Round 177 cards", () => {
  it("are fully supported", () =>
    supported(aetherStorm, amorphousAxe, arachnoform, arcboundTracker, awakenTheErstwhile, balthorTheDefiled, baruWurmspeaker, bioengineeredFuture, biorhythm, bloodsporeThrinax, bonecacheOverseer, crystalInhumanPrincess, custodiLich, demonicTaskmaster, devilsPlay, eldraziRepurposer, evolutionaryEscalation, extinguishTheLight, finaleOfEternity, flux, frostTitan, fullFlowering, gaddockTeeg, gerrardsVerdict, gloryOfWarfare, goldRush, graviticPunch, increasingAmbition, increasingConfusion, jadelightSpelunker, junkJet, kutzilsFlanker, leatherArmor, liegeOfThePit, lockjawSlobberingTeleporter, lordOfThePit, manaCannons, marthaJones, mesaLynx, midnightMangler, mindFuneral, oakStreetInnkeeper, otterballAntics, phoenixFleetAirship, prismariPianist, razeToTheGround, razorgrassInvoker, resoluteArchangel, riverHeraldsBoon, runechantersPike, runedStalactite, seasonedPyromancer, seedshipImpact, shamanOfForgottenWays, smaugTheImpenetrable, sokkaBoldBoomeranger, stalactiteDagger, surveyMechan, taigamOjutaiMaster, taintedTreats, tatyovaStewardOfTides, theDestinedBlackMage, undercoverSkrull, vibratingSphere, wiltInTheHeat, wolfcallersHowl, yorvoLordOfGarenbrig));
});

describe("~ and up to one other target creature", () => {
  it("Razorgrass Invoker: it and the other target each get +3/+3; with no other target, only it", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, razorgrassInvoker);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, r, 0, [tgt(b)])));
    expect(pt(s, r)).toBe("7/6");
    expect(pt(s, b)).toBe("5/5");
  });
  it("Razorgrass Invoker can't target itself as the other creature", () => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, razorgrassInvoker);
    expect(planActivate(s, ap, r, 0, [tgt(r)])).toBeNull();
  });
});

describe("during turns other than yours", () => {
  it("Glory of Warfare: +2/+0 in your turn, +0/+2 in the others'", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, gloryOfWarfare);
    const b = putOnBattlefield(s, ap, bear());
    expect(pt(s, b)).toBe("4/2");
    s = passUntil(s, "main1", opp);
    expect(pt(s, b)).toBe("2/4");
  });
  it("Vibrating Sphere: +2/+0 in your turn, -0/-2 in the others'", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, vibratingSphere);
    const b = putOnBattlefield(s, ap, bear({ toughness: "3" }));
    expect(pt(s, b)).toBe("4/3");
    s = passUntil(s, "main1", opp);
    expect(pt(s, b)).toBe("2/1");
  });
  it("Mesa Lynx gets +0/+2 and Midnight Mangler is a creature only in other players' turns", () => {
    let { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, mesaLynx);
    const m = putOnBattlefield(s, ap, midnightMangler);
    expect(pt(s, l)).toBe("2/1");
    expect(types(s, m)).not.toContain("Creature");
    s = passUntil(s, "main1", opp);
    expect(pt(s, l)).toBe("2/3");
    expect(types(s, m)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });
  it("Oak Street Innkeeper: your tapped creatures have hexproof only in other players' turns", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, oakStreetInnkeeper);
    const b = putOnBattlefield(s, ap, bear());
    const u = putOnBattlefield(s, ap, bear());
    s.objects[b]!.tapped = true;
    invalidateCharacteristics(s);
    expect(kw(s, b, "Hexproof")).toBe(false);
    s = passUntil(s, "upkeep", opp);
    s.objects[b]!.tapped = true;
    invalidateCharacteristics(s);
    expect(kw(s, b, "Hexproof")).toBe(true);
    expect(kw(s, u, "Hexproof")).toBe(false);
  });
});

describe("named ~ and is every creature type", () => {
  it("Phoenix Fleet Airship is a creature only with eight or more named Phoenix Fleet Airship", () => {
    const { s, ap } = setup([]);
    const ids = Array.from({ length: 7 }, () => putOnBattlefield(s, ap, phoenixFleetAirship));
    expect(types(s, ids[0]!)).not.toContain("Creature");
    ids.push(putOnBattlefield(s, ap, phoenixFleetAirship));
    invalidateCharacteristics(s);
    for (const id of ids) expect(types(s, id)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });
  it("Arachnoform: +2/+2, reach and every creature type", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, arachnoform);
    s.objects[a]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("4/4");
    expect(kw(s, b, "Reach")).toBe(true);
    expect(everyType(s, b)).toBe(true);
  });
  it("Amorphous Axe and Runed Stalactite make the equipped creature every creature type", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear());
    const axe = putOnBattlefield(s, ap, amorphousAxe);
    const st = putOnBattlefield(s, ap, runedStalactite);
    s.objects[axe]!.attachedTo = b;
    s.objects[st]!.attachedTo = c;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("5/2");
    expect(pt(s, c)).toBe("3/3");
    expect(everyType(s, b)).toBe(true);
    expect(everyType(s, c)).toBe(true);
  });
  it("Stalactite Dagger creates a Shapeshifter with changeling", () => {
    let { s, ap, ids } = setup([stalactiteDagger]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const t = named(s, ap, "Shapeshifter");
    expect(t.length).toBe(1);
    expect(everyType(s, t[0]!)).toBe(true);
  });
  it("Undercover Skrull: +2/+2 and all creature types with two or more creature cards in your graveyard", () => {
    const { s, ap } = setup([]);
    const u = putOnBattlefield(s, ap, undercoverSkrull);
    into(s, ap, bear(), "graveyard");
    expect(pt(s, u)).toBe("1/1");
    expect(everyType(s, u)).toBe(false);
    into(s, ap, bear(), "graveyard");
    expect(pt(s, u)).toBe("3/3");
    expect(everyType(s, u)).toBe(true);
  });
});

describe("cards that left your graveyard", () => {
  it("Bonecache Overseer can draw only once three or more cards left your graveyard this turn", () => {
    let { s, ap, ids } = setup([kutzilsFlanker]);
    const o = putOnBattlefield(s, ap, bonecacheOverseer);
    for (let i = 0; i < 3; i++) into(s, ap, bear(), "graveyard");
    expect(planActivate(s, ap, o, 0)).toBeNull();
    // Kutzil's Flanker exiles your graveyard: three cards leave it.
    s = resolveAll(choose(resolveAll(run(s, planCast(s, ap, ids[0]!))), [2], [player(ap)]));
    expect(s.players[ap]!.graveyard.length).toBe(0);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, o, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
  it("Wilt in the Heat costs {2} less once a card left your graveyard this turn", () => {
    let { s, ap, ids, opp } = setup([wiltInTheHeat, kutzilsFlanker]);
    const foe = putOnBattlefield(s, opp, bear());
    into(s, ap, bear(), "graveyard");
    s = resolveAll(choose(resolveAll(run(s, planCast(s, ap, ids[1]!))), [2], [player(ap)]));
    const before = untappedLands(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(foe)])));
    expect(before - untappedLands(s, ap)).toBe(2);
    expect(zone(s, foe)).toBe("exile");
  });
});

describe("enters with additional counters", () => {
  it("Bloodspore Thrinax: each other creature you control enters with X more, X its own +1/+1 counters", () => {
    let { s, ap, ids } = setup([bear()]);
    const t = putOnBattlefield(s, ap, bloodsporeThrinax);
    s.objects[t]!.counters["+1/+1"] = 3;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(3);
    expect(pt(s, ids[0]!)).toBe("5/5");
  });
  it("Bioengineered Future: one more for each land that entered under your control this turn", () => {
    let { s, ap, ids } = setup([bioengineeredFuture, forestCard, bear()]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, ap, "Lander").length).toBe(1);
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(counters(s, ids[2]!)).toBe(1);
  });
});

describe("each player's own count", () => {
  it("Awaken the Erstwhile: each player discards their hand and creates that many Zombies", () => {
    let { s, ap, ids } = setup([awakenTheErstwhile, bear(), bear()]);
    const [b, c] = s.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId];
    const handB = s.players[b]!.hand.length;
    const handC = s.players[c]!.hand.length;
    const mine = s.players[ap]!.hand.length - 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(0);
    expect(named(s, ap, "Zombie").length).toBe(mine);
    expect(named(s, b, "Zombie").length).toBe(handB);
    expect(named(s, c, "Zombie").length).toBe(handC);
  });
  it("Biorhythm: each player's life total becomes the number of creatures they control", () => {
    let { s, ap, ids, opp } = setup([biorhythm]);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(2);
    expect(s.players[opp]!.life).toBe(1);
    expect(s.players[s.turnOrder.find((p) => p !== ap && p !== opp)!]!.life).toBe(0);
  });
  it("Shaman of Forgotten Ways: formidable, each player's life total becomes their creature count", () => {
    let { s, ap, opp } = setup([]);
    const sh = putOnBattlefield(s, ap, shamanOfForgottenWays);
    expect(planActivate(s, ap, sh, 0)).toBeNull();
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, bear({ power: "3" }));
    putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planActivate(s, ap, sh, 0)));
    expect(s.players[ap]!.life).toBe(4);
    expect(s.players[opp]!.life).toBe(1);
  });
  it("Flux: each player discards any number, then draws that many; you draw one more", () => {
    let { s, ap, ids } = setup([flux, bear(), bear(), bear()]);
    const hand = s.players[ap]!.hand.length - 1;
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: p.player === ap ? [ids[1]!, ids[2]!] : [] });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(zone(s, ids[3]!)).toBe("hand");
    // Two discarded, two drawn, then one more.
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Kutzil's Flanker", () => {
  it("gets a counter for each creature that left the battlefield under your control this turn", () => {
    let { s, ap, ids, opp } = setup([shock, kutzilsFlanker]);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    s = resolveAll(choose(resolveAll(run(s, planCast(s, ap, ids[1]!))), [0]));
    expect(counters(s, ids[1]!)).toBe(1);
  });
});

describe("cast triggers", () => {
  it("Prismari Pianist: one Elemental, or three for a spell with mana value 5 or greater", () => {
    const big = card("Big Thought", "Sorcery", "{4}{U}", { cmc: 5, oracleText: "Draw a card." });
    let { s, ap, ids } = setup([opt, big]);
    putOnBattlefield(s, ap, prismariPianist);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, ap, "Elemental").length).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(named(s, ap, "Elemental").length).toBe(4);
  });
  it("Arcbound Tracker: a counter for each spell after your first each turn", () => {
    let { s, ap, ids } = setup([opt, opt, opt]);
    const t = putOnBattlefield(s, ap, arcboundTracker);
    s.objects[t]!.counters["+1/+1"] = 2;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, t)).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, t)).toBe(3);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(counters(s, t)).toBe(4);
  });
  it("Sokka, Bold Boomeranger: a counter for an artifact or Lesson spell, not for another instant", () => {
    const trinket = card("Trinket", "Artifact", "{1}", { cmc: 1 });
    const lesson = card("Study Hall", "Sorcery — Lesson", "{U}", { cmc: 1, oracleText: "Draw a card." });
    let { s, ap, ids } = setup([trinket, lesson, opt]);
    const k = putOnBattlefield(s, ap, sokkaBoldBoomeranger);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, k)).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, k)).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(counters(s, k)).toBe(2);
  });
  it("Crystal, Inhuman Princess deals X to each opponent, X the colors of the noncreature spell", () => {
    const charm = card("Gold Charm", "Instant", "{R}{G}", { cmc: 2, oracleText: "Draw a card." });
    let { s, ap, ids, opp } = setup([charm]);
    putOnBattlefield(s, ap, crystalInhumanPrincess);
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[opp]!.life).toBe(life - 2);
  });
  it("The Destined Black Mage deals 1 damage to each opponent when you cast a noncreature spell", () => {
    let { s, ap, ids, opp } = setup([opt]);
    putOnBattlefield(s, ap, theDestinedBlackMage);
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[opp]!.life).toBe(life - 1);
  });
  it("Eldrazi Repurposer: a Spawn when you cast it and another when it dies", () => {
    const bolt = card("Lightning Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Lightning Bolt deals 3 damage to any target." });
    let { s, ap, ids } = setup([eldraziRepurposer, bolt]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, ap, "Eldrazi Spawn").length).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(named(s, ap, "Eldrazi Spawn").length).toBe(2);
  });
});

describe("Yorvo, Lord of Garenbrig", () => {
  it("one counter for another green creature, two if that creature's power is greater than Yorvo's after the first", () => {
    const big = card("Huge Beast", "Creature — Beast", "{4}{G}", { cmc: 5, power: "7", toughness: "7" });
    let { s, ap, ids } = setup([yorvoLordOfGarenbrig, bear(), big]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, forestCard);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(4);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, ids[0]!)).toBe(5);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(counters(s, ids[0]!)).toBe(7);
  });
});

describe("explore X times", () => {
  it("Jadelight Spelunker with X = 2 explores twice: two lands on top go to your hand", () => {
    let { s, ap, ids } = setup([jadelightSpelunker]);
    into(s, ap, forestCard, "library");
    into(s, ap, forestCard, "library");
    const hand = s.players[ap]!.hand.length - 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(counters(s, ids[0]!)).toBe(0);
  });
});

describe("Smaug the Impenetrable", () => {
  it("creates that many Treasures when dealt noncombat damage", () => {
    let { s, ap, ids } = setup([shock]);
    const sm = putOnBattlefield(s, ap, smaugTheImpenetrable);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(sm)])));
    expect(named(s, ap, "Treasure").length).toBe(2);
  });
});

describe("Tatyova, Steward of Tides", () => {
  it("with seven or more lands, a land entering makes up to one target land a 3/3 Elemental with haste, and land creatures fly", () => {
    let { s, ap, ids } = setup([forestCard]);
    putOnBattlefield(s, ap, tatyovaStewardOfTides);
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    s = resolveAll(choose(resolveAll(s), null, [tgt(ids[0]!)]));
    expect(pt(s, ids[0]!)).toBe("3/3");
    expect(types(s, ids[0]!)).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(kw(s, ids[0]!, "Haste")).toBe(true);
    expect(kw(s, ids[0]!, "Flying")).toBe(true);
  });
});

describe("spells that can't be cast", () => {
  it("Gaddock Teeg: noncreature spells with mana value 4 or more, or with {X}, can't be cast; others can", () => {
    const big = card("Big Thought", "Sorcery", "{3}{U}", { cmc: 4, oracleText: "Draw a card." });
    const bigBeast = card("Huge Beast", "Creature — Beast", "{4}{G}", { cmc: 5, power: "6", toughness: "6" });
    const { s, ap, ids, opp } = setup([big, devilsPlay, opt, bigBeast]);
    putOnBattlefield(s, opp, gaddockTeeg);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/can't be cast/);
    expect(planCast(s, ap, ids[1]!, [player(opp)], undefined, undefined, 1)).toBeNull();
    expect(planCast(s, ap, ids[2]!)).not.toBeNull();
    expect(planCast(s, ap, ids[3]!)).not.toBeNull();
  });
  it("Aether Storm: creature spells can't be cast; any player may pay 4 life to destroy it", () => {
    let { s, ap, ids, opp } = setup([bear(), opt]);
    const st = putOnBattlefield(s, opp, aetherStorm);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/can't be cast/);
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planActivate(s, ap, st, 0)));
    expect(s.players[ap]!.life).toBe(life - 4);
    expect(zone(s, st)).toBe("graveyard");
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
  });
});

describe("Full Flowering", () => {
  it("populates X times", () => {
    let { s, ap, ids } = setup([sprout, fullFlowering]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = run(s, planCast(s, ap, ids[1]!, undefined, undefined, undefined, 2));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: [named(s, ap, "Saproling")[0]!] });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(named(s, ap, "Saproling").length).toBe(3);
  });
});

describe("the number of colors that spell is", () => {
  it("Mana Cannons deals X damage to any target when you cast a multicolored spell", () => {
    const charm = card("Gold Charm", "Instant", "{R}{G}", { cmc: 2, oracleText: "Draw a card." });
    let { s, ap, ids, opp } = setup([charm, opt]);
    putOnBattlefield(s, ap, manaCannons);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    s = resolveAll(s);
    s = resolveAll(choose(run(s, planCast(s, ap, ids[0]!)), null, [player(opp)]));
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

describe("Junk Jet", () => {
  it("doubles the equipped creature's power, sacrificing another artifact", () => {
    let { s, ap, ids } = setup([junkJet]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const junk = named(s, ap, "Junk");
    expect(junk.length).toBe(1);
    const b = putOnBattlefield(s, ap, bear({ power: "3" }));
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, 1, [tgt(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { sacrifice: [junk[0]!] })));
    expect(zone(s, junk[0]!)).not.toBe("battlefield");
    expect(pt(s, b)).toBe("6/2");
  });
});

describe("Taigam, Ojutai Master", () => {
  it("your instant spells can't be countered", () => {
    let { s, ap, ids } = setup([giantGrowth, cancel]);
    putOnBattlefield(s, ap, taigamOjutaiMaster);
    const b = putOnBattlefield(s, ap, bear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    const spell = s.stack[s.stack.length - 1]!;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }])));
    expect(pt(s, b)).toBe("5/5");
  });
});

describe("sacrifice another creature at upkeep", () => {
  it("Lord of the Pit deals 7 damage to you if you can't sacrifice another creature", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, lordOfThePit);
    s = passUntil(s, "upkeep", ap, 4000);
    const life = s.players[ap]!.life;
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(life - 7);
  });
  it("Liege of the Pit sacrifices your other creature instead", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, liegeOfThePit);
    const b = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "upkeep", ap, 4000);
    const life = s.players[ap]!.life;
    s = resolveAll(s);
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, l)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life);
  });
  it("Demonic Taskmaster sacrifices a creature other than itself, and nothing if there's none", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, demonicTaskmaster);
    s = passUntil(s, "upkeep", ap, 4000);
    s = resolveAll(s);
    expect(zone(s, d)).toBe("battlefield");
  });
});

describe("cast from a graveyard", () => {
  it("Otterball Antics: a 1/1 Otter from your hand, a 2/2 with flashback", () => {
    let { s, ap, ids } = setup([otterballAntics, opt]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    let otters = named(s, ap, "Otter");
    expect(otters.length).toBe(1);
    expect(counters(s, otters[0]!)).toBe(0);
    // Prowess.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, otters[0]!)).toBe("2/2");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { via: "flashback" })));
    otters = named(s, ap, "Otter");
    expect(otters.length).toBe(2);
    expect(otters.map((o) => counters(s, o)).sort()).toEqual([0, 1]);
    expect(zone(s, ids[0]!)).toBe("exile");
  });
  it("Increasing Confusion mills X, or twice X cast with flashback", () => {
    let { s, ap, ids, opp } = setup([increasingConfusion]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, undefined, 2)));
    expect(s.players[opp]!.graveyard.length).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto", 2, { via: "flashback" })));
    expect(s.players[opp]!.graveyard.length).toBe(6);
    expect(zone(s, ids[0]!)).toBe("exile");
  });
  it("Devil's Play: flashback with X", () => {
    let { s, ap, ids, opp } = setup([devilsPlay]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, mountainCard);
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, undefined, 2)));
    expect(s.players[opp]!.life).toBe(life - 2);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto", 3, { via: "flashback" })));
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(zone(s, ids[0]!)).toBe("exile");
  });
  it("Increasing Ambition searches for one card from your hand, two cast from a graveyard", () => {
    let { s, ap, ids } = setup([increasingAmbition]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 1 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: s.players[ap]!.library.slice(0, 1) }));
    for (let i = 0; i < 8; i++) putOnBattlefield(s, ap, swampCard);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { via: "flashback" })));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
  });
});

describe("Balthor the Defiled", () => {
  it("each player returns all black and all red creature cards from their graveyard", () => {
    let { s, ap, opp } = setup([]);
    const bal = putOnBattlefield(s, ap, balthorTheDefiled);
    putOnBattlefield(s, ap, swampCard);
    const red = card("Red Pup", "Creature — Dog", "{R}", { cmc: 1, power: "1", toughness: "1", colors: ["R"] });
    const black = card("Night Bear", "Creature — Bear", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] });
    const r = into(s, ap, red, "graveyard");
    const k = into(s, opp, black, "graveyard");
    const g = into(s, opp, bear(), "graveyard");
    s = resolveAll(run(s, planActivate(s, ap, bal, 0)));
    expect(zone(s, bal)).toBe("exile");
    expect(zone(s, r)).toBe("battlefield");
    expect(zone(s, k)).toBe("battlefield");
    expect(controllerOf(s, s.objects[k]!)).toBe(opp);
    expect(zone(s, g)).toBe("graveyard");
  });
});

describe("cards discarded this way", () => {
  it("Seasoned Pyromancer: discard two, draw two, an Elemental for each nonland card discarded", () => {
    let { s, ap, ids } = setup([seasonedPyromancer]);
    // Just a land and a creature card in hand besides it.
    for (const id of [...s.players[ap]!.hand]) if (id !== ids[0]) { s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(id), 1); s.objects[id]!.zone = "exile"; }
    into(s, ap, forestCard, "hand");
    into(s, ap, bear(), "hand");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    if (s.pending?.kind === "discard") s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [...s.players[ap]!.hand] }));
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(named(s, ap, "Elemental").length).toBe(1);
  });
  it("Gerrard's Verdict: you gain 3 life for each land card discarded", () => {
    let { s, ap, ids, opp } = setup([gerrardsVerdict]);
    for (const id of [...s.players[opp]!.hand]) { s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(id), 1); s.objects[id]!.zone = "exile"; }
    into(s, opp, forestCard, "hand");
    into(s, opp, bear(), "hand");
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    if (s.pending?.kind === "discard") s = resolveAll(act(s, { type: "discard", player: opp, objectIds: [...s.players[opp]!.hand] }));
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});

describe("Mind Funeral", () => {
  it("mills until four land cards are revealed", () => {
    let { s, ap, ids, opp } = setup([mindFuneral]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    const yard = s.players[opp]!.graveyard;
    expect(yard.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length).toBe(4);
    expect(s.cards[s.objects[yard[yard.length - 1]!]!.cardId]!.types).toContain("Land");
  });
});

describe("if its mana value was N or less", () => {
  it("Extinguish the Light: you gain 3 life only for a creature with mana value 3 or less", () => {
    const big = card("Huge Beast", "Creature — Beast", "{4}{G}", { cmc: 5, power: "6", toughness: "6" });
    let { s, ap, ids, opp } = setup([extinguishTheLight, extinguishTheLight]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swampCard);
    const b = putOnBattlefield(s, opp, bear());
    const h = putOnBattlefield(s, opp, big);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(h)])));
    expect(zone(s, h)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
  });
  it("Tainted Treats: a Food for a creature with mana value 4 or less, even if it isn't destroyed", () => {
    let { s, ap, ids, opp } = setup([taintedTreats]);
    const b = putOnBattlefield(s, opp, bear({ oracleText: "Indestructible", keywords: ["Indestructible"] }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(named(s, ap, "Food").length).toBe(1);
  });
  it("Seedship Impact and Raze to the Ground", () => {
    const trinket = card("Trinket", "Artifact", "{1}", { cmc: 1 });
    const relic = card("Old Relic", "Artifact", "{3}", { cmc: 3 });
    let { s, ap, ids, opp } = setup([seedshipImpact, razeToTheGround, razeToTheGround]);
    const t1 = putOnBattlefield(s, opp, trinket);
    const t2 = putOnBattlefield(s, opp, trinket);
    const r = putOnBattlefield(s, opp, relic);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t1)])));
    expect(zone(s, t1)).toBe("graveyard");
    expect(named(s, ap, "Lander").length).toBe(1);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(t2)])));
    expect(s.players[ap]!.hand.length).toBe(hand);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, mountainCard);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(r)])));
    expect(zone(s, r)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("Resolute Archangel", () => {
  it("raises your life total to your starting life total, and only if it's lower", () => {
    let { s, ap, ids } = setup([resoluteArchangel, resoluteArchangel]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, plainsCard);
    s.players[ap]!.life = 12;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(40);
    s.players[ap]!.life = 45;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(45);
  });
});

describe("Custodi Lich", () => {
  it("when you become the monarch, target player sacrifices a creature; not when you already are", () => {
    let { s, ap, ids, opp } = setup([custodiLich, custodiLich]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, swampCard);
    const b = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.monarch).toBe(ap);
    s = resolveAll(choose(s, null, [player(opp)]));
    expect(zone(s, b)).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });
});

describe("Frost Titan", () => {
  it("counters an opponent's spell that targets it unless they pay {2}", () => {
    let { s, ap, opp } = setup([]);
    const ft = putOnBattlefield(s, opp, frostTitan);
    const sh = into(s, ap, shock, "hand");
    s = run(s, planCast(s, ap, sh, [tgt(ft)]));
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "payUnless") s = act(s, { type: "payUnless", player: p.player, pay: false });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, sh)).toBe("graveyard");
    expect(s.objects[ft]!.damage).toBe(0);
  });
});

describe("small additions", () => {
  it("Gold Rush: +2/+2 for each Treasure you control, counting the new one", () => {
    let { s, ap, ids } = setup([goldRush]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(named(s, ap, "Treasure").length).toBe(1);
    expect(pt(s, b)).toBe("4/4");
  });
  it("Gravitic Punch: your creature deals damage equal to its power to target player", () => {
    let { s, ap, ids, opp } = setup([graviticPunch]);
    const b = putOnBattlefield(s, ap, bear({ power: "5" }));
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b), player(opp)])));
    expect(s.players[opp]!.life).toBe(life - 5);
  });
  it("Finale of Eternity destroys up to three creatures with toughness X or less", () => {
    let { s, ap, ids, opp } = setup([finaleOfEternity]);
    const small = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, bear())];
    const big = putOnBattlefield(s, opp, bear({ toughness: "3" }));
    expect(planCast(s, ap, ids[0]!, [...small, big].map(tgt), undefined, undefined, 2)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [...small.map(tgt), { kind: "none" }], undefined, undefined, 2)));
    for (const id of small) expect(zone(s, id)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
  });
  it("Leather Armor: equip {0}, only once each turn; +0/+1 and ward {1}", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, leatherArmor);
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, a, 0, [tgt(b)])));
    expect(pt(s, b)).toBe("2/3");
    expect(characteristics(s, s.objects[b]!).grantedAbilities).toContain("Ward {1}");
    expect(planActivate(s, ap, a, 0, [tgt(c)])).toBeNull();
  });
  it("Runechanter's Pike: first strike and +X/+0 for instant and sorcery cards in your graveyard", () => {
    const { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, runechantersPike);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[p]!.attachedTo = b;
    into(s, ap, opt, "graveyard");
    into(s, ap, sprout, "graveyard");
    into(s, ap, bear(), "graveyard");
    expect(pt(s, b)).toBe("4/2");
    expect(kw(s, b, "First strike")).toBe(true);
  });
  it("River Heralds' Boon: one creature can be both targets", () => {
    const merfolk = card("Fish Friend", "Creature — Merfolk", "{U}", { cmc: 1, power: "1", toughness: "1" });
    let { s, ap, ids } = setup([riverHeraldsBoon]);
    const m = putOnBattlefield(s, ap, merfolk);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(m), tgt(m)])));
    expect(counters(s, m)).toBe(2);
  });
  it("Evolutionary Escalation: three counters on your creature and three on an opponent's", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, evolutionaryEscalation);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "upkeep", ap, 4000);
    s = resolveAll(choose(resolveAll(s), null, [tgt(mine), tgt(theirs)]));
    expect(counters(s, mine)).toBe(3);
    expect(counters(s, theirs)).toBe(3);
  });
  it("Wolfcaller's Howl: a Wolf for each opponent with four or more cards in hand", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, wolfcallersHowl);
    s = passUntil(s, "upkeep", ap, 4000);
    const n = s.turnOrder.filter((p) => p !== ap && s.players[p]!.hand.length >= 4).length;
    s = resolveAll(s);
    expect(named(s, ap, "Wolf").length).toBe(n);
  });
  it("Baru, Wurmspeaker's ability costs {X} less, X the greatest power among your Wurms", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, baruWurmspeaker);
    putOnBattlefield(s, ap, card("Wurm", "Creature — Wurm", "{4}{G}", { cmc: 5, power: "4", toughness: "4" }));
    const before = untappedLands(s, ap);
    s = resolveAll(run(s, planActivate(s, ap, b, 0)));
    // {7}{G} minus 6 (the Wurm is 6/6 with Baru): {1}{G}.
    expect(before - untappedLands(s, ap)).toBe(2);
    expect(named(s, ap, "Wurm").length).toBe(2);
  });
  it("Survey Mechan's ability costs {X} less, X the number of differently named lands you control", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, surveyMechan);
    const before = untappedLands(s, ap);
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planActivate(s, ap, m, 0, [player(opp), player(ap)])));
    // Five differently named lands: {10} minus 5.
    expect(before - untappedLands(s, ap)).toBe(5);
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("sacrificing a Clue", () => {
  it("Martha Jones: sacrificing a Clue makes her and up to one other target creature unblockable this turn", () => {
    let { s, ap, ids } = setup([marthaJones]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const clue = named(s, ap, "Clue");
    expect(clue.length).toBe(1);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(choose(run(s, planActivate(s, ap, clue[0]!, 0)), null, [tgt(b)]));
    expect(characteristics(s, s.objects[ids[0]!]!).cantBeBlocked).toBe(true);
    expect(characteristics(s, s.objects[b]!).cantBeBlocked).toBe(true);
  });
  it("Phoenix Fleet Airship copies itself at your end step if you sacrificed a permanent this turn", () => {
    let { s, ap, ids } = setup([marthaJones]);
    putOnBattlefield(s, ap, phoenixFleetAirship);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const clue = named(s, ap, "Clue");
    s = resolveAll(choose(run(s, planActivate(s, ap, clue[0]!, 0)), null, [{ kind: "none" }]));
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(named(s, ap, "Phoenix Fleet Airship").length).toBe(2);
  });
});

describe("bots and life totals that become a count", () => {
  it("a bot casts Biorhythm only when it doesn't lose by it and it takes an opponent to 0 or gains it life", () => {
    const { s, ap, ids } = setup([biorhythm]);
    s.players[ap]!.hand = [ids[0]!];
    const casts = (st: GameState) => botActions(st, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0]);
    // No creatures of our own: we'd go to 0.
    expect(casts(s)).toBe(false);
    // One creature, and every opponent has one too: we'd drop from 40 to 1 for nothing.
    putOnBattlefield(s, ap, bear());
    const theirs = s.turnOrder.filter((p) => p !== ap).map((p) => putOnBattlefield(s, p, bear()));
    expect(casts(s)).toBe(false);
    // An opponent with no creatures would go to 0.
    s.battlefield.splice(s.battlefield.indexOf(theirs[0]!), 1);
    s.objects[theirs[0]!]!.zone = "graveyard";
    invalidateCharacteristics(s);
    expect(casts(s)).toBe(true);
  });
});
