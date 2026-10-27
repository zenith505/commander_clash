// Round 178: the most played cards still unsupported, in popularity order, from about rank 10,060 on, and the cards
// that share their mechanics.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, cast, island, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { blockProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** resolveAll, keeping cards on top for any scry or look on the way. */
const resolveKeep = (s: GameState, yes = true) => {
  s = resolveAll(s, yes);
  for (let i = 0; i < 20 && s.pending?.kind === "arrangeTop"; i++) s = resolveAll(act(s, { type: "arrangeTop", player: s.pending.player, top: s.pending.cards, away: [] }), yes);
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
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const castable = (s: GameState, pid: PlayerId, id: string) => planCast(s, pid, id) !== null;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const cancel = card("Cancel", "Instant", "{1}{U}{U}", { cmc: 3, oracleText: "Counter target spell." });
const forestCard = card("Forest", "Basic Land — Forest", "", { cmc: 0 });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { cmc: 0, power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" });
const craw = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { cmc: 6, power: "6", toughness: "4" });
const bolas = card("Test Bolas", "Legendary Planeswalker — Bolas", "{U}{B}{B}{B}{R}", { cmc: 5, loyalty: "4", oracleText: "+1: You draw a card." });
const jace = card("Test Jace", "Legendary Planeswalker — Jace", "{1}{U}{U}", { cmc: 3, loyalty: "3", oracleText: "+2: You draw a card." });
const fiveColor = card("Test Five-Color Giant", "Creature — Giant", "{W}{U}{B}{R}{G}", { cmc: 5, power: "5", toughness: "5" });

// Real oracle text (Scryfall).
const aetherwindBasker = card("Aetherwind Basker", "Creature — Lizard", "{4}{G}{G}{G}", {cmc: 7,"power":"7","toughness":"7","keywords":["Trample"],"oracleText":"Trample\nWhenever this creature enters or attacks, you get {E} (an energy counter) for each creature you control.\nPay {E}: This creature gets +1/+1 until end of turn."});
const ajaniGoldmane = card("Ajani Goldmane", "Legendary Planeswalker — Ajani", "{2}{W}{W}", {cmc: 4,"loyalty":"4","oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\""});
const anthemOfRakdos = card("Anthem of Rakdos", "Enchantment", "{2}{B}{R}{R}", {cmc: 5,"keywords":["Double","Hellbent"],"oracleText":"Whenever a creature you control attacks, it gets +2/+0 until end of turn and this enchantment deals 1 damage to you.\nHellbent — As long as you have no cards in hand, if a source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead."});
const avatarOfMight = card("Avatar of Might", "Creature — Avatar", "{6}{G}{G}", {cmc: 8,"power":"8","toughness":"8","keywords":["Trample"],"oracleText":"If an opponent controls at least four more creatures than you, this spell costs {6} less to cast.\nTrample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"});
const azureFleetAdmiral = card("Azure Fleet Admiral", "Creature — Human Pirate", "{3}{U}", {cmc: 4,"power":"3","toughness":"3","oracleText":"When this creature enters, you become the monarch.\nThis creature can't be blocked by creatures the monarch controls."});
const banefulOmen = card("Baneful Omen", "Enchantment", "{4}{B}{B}{B}", {cmc: 7,"oracleText":"At the beginning of your end step, you may reveal the top card of your library. If you do, each opponent loses life equal to that card's mana value."});
const beaconBolt = card("Beacon Bolt", "Sorcery", "{1}{U}{R}", {cmc: 3,"keywords":["Jump","Jump-start"],"oracleText":"Beacon Bolt deals damage to target creature equal to the total number of instant and sorcery cards you own in exile and in your graveyard.\nJump-start (You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile this card.)"});
const carrionGrub = card("Carrion Grub", "Creature — Insect", "{3}{B}", {cmc: 4,"power":"0","toughness":"5","keywords":["Mill"],"oracleText":"This creature gets +X/+0, where X is the greatest power among creature cards in your graveyard.\nWhen this creature enters, mill four cards. (Put the top four cards of your library into your graveyard.)"});
const cemeteryRecruitment = card("Cemetery Recruitment", "Sorcery", "{1}{B}", {cmc: 2,"oracleText":"Return target creature card from your graveyard to your hand. If it's a Zombie card, draw a card."});
const confirmSuspicions = card("Confirm Suspicions", "Instant", "{3}{U}{U}", {cmc: 5,"keywords":["Investigate"],"oracleText":"Counter target spell.\nInvestigate three times. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"});
const cracklingDrake = card("Crackling Drake", "Creature — Drake", "{U}{U}{R}{R}", {cmc: 4,"power":"*","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nCrackling Drake's power is equal to the total number of instant and sorcery cards you own in exile and in your graveyard.\nWhen this creature enters, draw a card."});
const curseOfThirst = card("Curse of Thirst", "Enchantment — Aura Curse", "{4}{B}", {cmc: 5,"keywords":["Enchant"],"oracleText":"Enchant player\nAt the beginning of enchanted player's upkeep, this Aura deals damage to that player equal to the number of Curses attached to them."});
const cursedRecording = card("Cursed Recording", "Artifact", "{2}{R}{R}", {cmc: 4,"oracleText":"Whenever you cast an instant or sorcery spell, put a time counter on this artifact. Then if there are seven or more time counters on it, remove those counters and it deals 20 damage to you.\n{T}: When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy."});
const daxosOfMeletis = card("Daxos of Meletis", "Legendary Creature — Human Soldier", "{1}{W}{U}", {cmc: 3,"power":"2","toughness":"2","oracleText":"Daxos can't be blocked by creatures with power 3 or greater.\nWhenever Daxos deals combat damage to a player, exile the top card of that player's library. You gain life equal to that card's mana value. Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell."});
const daxosTheReturned = card("Daxos the Returned", "Legendary Creature — Zombie Soldier", "{1}{W}{B}", {cmc: 3,"power":"2","toughness":"2","oracleText":"Whenever you cast an enchantment spell, you get an experience counter.\n{1}{W}{B}: Create a white and black Spirit enchantment creature token. It has \"This creature's power and toughness are each equal to the number of experience counters you have.\""});
const deepwoodDenizen = card("Deepwood Denizen", "Creature — Elf Warrior", "{2}{G}", {cmc: 3,"power":"3","toughness":"2","keywords":["Vigilance"],"oracleText":"Vigilance (Attacking doesn't cause this creature to tap.)\n{5}{G}, {T}: Draw a card. This ability costs {1} less to activate for each +1/+1 counter on creatures you control."});
const dimirCharm = card("Dimir Charm", "Instant", "{U}{B}", {cmc: 2,"oracleText":"Choose one —\n• Counter target sorcery spell.\n• Destroy target creature with power 2 or less.\n• Look at the top three cards of target player's library. Put one back and the rest into that player's graveyard."});
const drillworksMole = card("Drillworks Mole", "Artifact Creature — Mole", "{1}", {cmc: 1,"power":"1","toughness":"1","oracleText":"{2}, {T}: Put a +1/+1 counter on this creature and a +1/+1 counter on up to one target commander creature you control."});
const experimentOne = card("Experiment One", "Creature — Human Ooze", "{G}", {cmc: 1,"power":"1","toughness":"1","keywords":["Evolve","Heal","Regenerate"],"oracleText":"Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nRemove two +1/+1 counters from this creature: Regenerate it. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)"});
const eyesOfThe = card("Eyes of the Wisent", "Kindred Enchantment — Elemental", "{1}{G}", {cmc: 2,"oracleText":"Whenever an opponent casts a blue spell during your turn, you may create a 4/4 green Elemental creature token."});
const ezzarootChanneler = card("Ezzaroot Channeler", "Creature — Treefolk Druid", "{5}{G}", {cmc: 6,"power":"4","toughness":"6","keywords":["Reach"],"oracleText":"Reach\nCreature spells you cast cost {X} less to cast, where X is the amount of life you gained this turn.\n{T}: You gain 2 life."});
const fertileThicket = card("Fertile Thicket", "Land", "", {cmc: 0,"oracleText":"This land enters tapped.\nWhen this land enters, you may look at the top five cards of your library. If you do, reveal up to one basic land card from among them, then put that card on top of your library and the rest on the bottom in any order.\n{T}: Add {G}."});
const fixWhatsBroken = card("Fix What's Broken", "Sorcery", "{2}{W}{B}", {cmc: 4,"oracleText":"As an additional cost to cast this spell, pay X life.\nReturn each artifact and creature card with mana value X from your graveyard to the battlefield."});
const funeralRites = card("Funeral Rites", "Sorcery", "{2}{B}", {cmc: 3,"keywords":["Mill"],"oracleText":"You draw two cards, lose 2 life, then mill two cards."});
const galadrielOfLothlrien = card("Galadriel of Lothlórien", "Legendary Creature — Elf Noble", "{1}{G}{U}", {cmc: 3,"power":"3","toughness":"3","keywords":["Scry"],"oracleText":"Whenever the Ring tempts you, if you chose a creature other than Galadriel as your Ring-bearer, scry 3.\nWhenever you scry, you may reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped."});
const galvanicRelay = card("Galvanic Relay", "Sorcery", "{2}{R}", {cmc: 3,"keywords":["Storm"],"oracleText":"Exile the top card of your library. During your next turn, you may play that card.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)"});
const gandalfWhiteRider = card("Gandalf, White Rider", "Legendary Creature — Avatar Wizard", "{3}{W}", {cmc: 4,"power":"3","toughness":"3","keywords":["Vigilance","Scry"],"oracleText":"Vigilance\nWhenever you cast a spell, creatures you control get +1/+0 until end of turn. Scry 1.\nWhen Gandalf dies, you may put it into its owner's library fifth from the top."});
const genasiEnforcers = card("Genasi Enforcers", "Creature — Elemental Shaman", "{1}{R}", {cmc: 2,"power":"1","toughness":"3","keywords":["Myriad"],"oracleText":"Myriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)\n{1}{R}: Creatures you control named Genasi Enforcers get +1/+0 until end of turn."});
const gisasFavoriteShovel = card("Gisa's Favorite Shovel", "Legendary Artifact — Equipment", "{1}{B}", {cmc: 2,"keywords":["Equip"],"oracleText":"Equipped creature gets +2/+0 and has menace.\nWhenever equipped creature attacks, defending player sacrifices a creature of their choice. If they do, you create a Walker token.\nEquip {4}"});
const goldenTailTrainer = card("Golden-Tail Trainer", "Creature — Fox Samurai", "{1}{G}{W}", {cmc: 3,"power":"1","toughness":"3","oracleText":"Aura and Equipment spells you cast cost {X} less to cast, where X is this creature's power.\nWhenever this creature attacks, other modified creatures you control get +X/+X until end of turn, where X is this creature's power. (Equipment, Auras you control, and counters are modifications.)"});
const graveScrabbler = card("Grave Scrabbler", "Creature — Zombie", "{3}{B}", {cmc: 4,"power":"2","toughness":"2","keywords":["Madness"],"oracleText":"Madness {1}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)\nWhen this creature enters, if its madness cost was paid, you may return target creature card from a graveyard to its owner's hand."});
const gwafaHazidProfiteer = card("Gwafa Hazid, Profiteer", "Legendary Creature — Human Rogue", "{1}{W}{U}", {cmc: 3,"power":"2","toughness":"2","oracleText":"{W}{U}, {T}: Put a bribery counter on target creature you don't control. Its controller draws a card.\nCreatures with bribery counters on them can't attack or block."});
const hanskSlayerZealot = card("Hansk, Slayer Zealot", "Legendary Creature — Human Archer", "{2}{R}{G}", {cmc: 4,"power":"4","toughness":"4","oracleText":"At the beginning of your upkeep, target opponent creates three Walker tokens. (They're 2/2 black Zombie creatures.)\n{T}: Hansk, Slayer Zealot deals 2 damage to target creature.\nWhenever a Zombie an opponent controls dies, draw a card."});
const hourOfDevastation = card("Hour of Devastation", "Sorcery", "{3}{R}{R}", {cmc: 5,"oracleText":"All creatures lose indestructible until end of turn. Hour of Devastation deals 5 damage to each creature and each non-Bolas planeswalker."});
const hurkylsRecall = card("Hurkyl's Recall", "Instant", "{1}{U}", {cmc: 2,"oracleText":"Return all artifacts target player owns to their hand."});
const immortalServitude = card("Immortal Servitude", "Sorcery", "{X}{W/B}{W/B}{W/B}", {cmc: 3,"oracleText":"Return each creature card with mana value X from your graveyard to the battlefield."});
const inspiredUltimatum = card("Inspired Ultimatum", "Sorcery", "{U}{U}{R}{R}{R}{W}{W}", {cmc: 7,"oracleText":"Target player gains 5 life, Inspired Ultimatum deals 5 damage to any target, then you draw five cards."});
const iridianMaelstrom = card("Iridian Maelstrom", "Sorcery", "{W}{U}{B}{R}{G}", {cmc: 5,"oracleText":"Destroy each creature that isn't all colors."});
const isolatedWatchtower = card("Isolated Watchtower", "Land", "", {cmc: 0,"keywords":["Scry"],"oracleText":"{T}: Add {C}.\n{2}, {T}: Scry 1, then you may reveal the top card of your library. If a basic land card is revealed this way, put it onto the battlefield tapped. Activate only if an opponent controls at least two more lands than you."});
const kravensLastHunt = card("Kraven's Last Hunt", "Enchantment — Saga", "{3}{G}", {cmc: 4,"keywords":["Mill"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Mill five cards. When you do, this Saga deals damage equal to the greatest power among creature cards in your graveyard to target creature.\nII — Target creature you control gets +2/+2 until end of turn.\nIII — Return target creature card from your graveyard to your hand."});
const lightningSecuritySergeant = card("Lightning, Security Sergeant", "Legendary Creature — Human Soldier", "{2}{R}", {cmc: 3,"power":"2","toughness":"3","keywords":["Menace"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nWhenever Lightning deals combat damage to a player, exile the top card of your library. You may play that card for as long as you control Lightning."});
const lostToLegend = card("Lost to Legend", "Instant", "{W}{W}", {cmc: 2,"oracleText":"Put target nonland historic permanent into its owner's library fourth from the top. (Artifacts, legendaries, and Sagas are historic.)"});
const lovisaColdeyes = card("Lovisa Coldeyes", "Legendary Creature — Human", "{3}{R}{R}", {cmc: 5,"power":"3","toughness":"3","oracleText":"Each creature that's a Barbarian, a Warrior, or a Berserker gets +2/+2 and has haste."});
const luluLoyalHollyphant = card("Lulu, Loyal Hollyphant", "Legendary Creature — Elephant Angel", "{3}{W}", {cmc: 4,"power":"3","toughness":"2","keywords":["Flying","Choose a background"],"oracleText":"Flying\nAt the beginning of your end step, if a permanent you controlled left the battlefield this turn, put a +1/+1 counter on each tapped creature you control, then untap them.\nChoose a Background (You can have a Background as a second commander.)"});
const malfegor = card("Malfegor", "Legendary Creature — Demon Dragon", "{2}{B}{B}{R}{R}", {cmc: 6,"power":"6","toughness":"6","keywords":["Flying"],"oracleText":"Flying\nWhen Malfegor enters, discard your hand. Each opponent sacrifices a creature of their choice for each card discarded this way."});
const mirkoVoskMind = card("Mirko Vosk, Mind Drinker", "Legendary Creature — Vampire", "{3}{U}{B}", {cmc: 5,"power":"2","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nWhenever Mirko Vosk deals combat damage to a player, that player reveals cards from the top of their library until they reveal four land cards, then puts those cards into their graveyard."});
const oblivionsHunger = card("Oblivion's Hunger", "Instant", "{1}{B}", {cmc: 2,"oracleText":"Target creature you control gains indestructible until end of turn. Draw a card if that creature has a +1/+1 counter on it. (Damage and effects that say \"destroy\" don't destroy the creature.)"});
const perennation = card("Perennation", "Sorcery", "{3}{W}{B}{G}", {cmc: 6,"oracleText":"Return target permanent card from your graveyard to the battlefield with a hexproof counter and an indestructible counter on it."});
const phyrexianWarBeast = card("Phyrexian War Beast", "Artifact Creature — Phyrexian Beast", "{3}", {cmc: 3,"power":"3","toughness":"4","oracleText":"When this creature leaves the battlefield, sacrifice a land and this creature deals 1 damage to you."});
const playWithFire = card("Play with Fire", "Instant", "{R}", {cmc: 1,"keywords":["Scry"],"oracleText":"Play with Fire deals 2 damage to any target. If a player is dealt damage this way, scry 1. (Look at the top card of your library. You may put that card on the bottom.)"});
const psychicSpiral = card("Psychic Spiral", "Instant", "{4}{U}", {cmc: 5,"keywords":["Mill"],"oracleText":"Shuffle all cards from your graveyard into your library. Target player mills that many cards."});
const pyreticCharge = card("Pyretic Charge", "Sorcery", "{4}{R}", {cmc: 5,"keywords":["Plot"],"oracleText":"Discard your hand, then draw four cards. For each card discarded this way, creatures you control get +1/+0 until end of turn.\nPlot {3}{R} (You may pay {3}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)"});
const ralIzzetViceroy = card("Ral, Izzet Viceroy", "Legendary Planeswalker — Ral", "{3}{U}{R}", {cmc: 5,"loyalty":"5","oracleText":"+1: Look at the top two cards of your library. Put one of them into your hand and the other into your graveyard.\n−3: Ral deals damage to target creature equal to the total number of instant and sorcery cards you own in exile and in your graveyard.\n−8: You get an emblem with \"Whenever you cast an instant or sorcery spell, this emblem deals 4 damage to any target and you draw two cards.\""});
const realitySmasher = card("Reality Smasher", "Creature — Eldrazi", "{4}{C}", {cmc: 5,"power":"5","toughness":"5","keywords":["Haste","Trample"],"oracleText":"({C} represents colorless mana.)\nTrample, haste\nWhenever this creature becomes the target of a spell an opponent controls, counter that spell unless its controller discards a card."});
const righteousAuthority = card("Righteous Authority", "Enchantment — Aura", "{3}{W}{U}", {cmc: 5,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 for each card in its controller's hand.\nAt the beginning of the draw step of enchanted creature's controller, that player draws an additional card."});
const samutTheDriving = card("Samut, the Driving Force", "Legendary Creature — Human Warrior Cleric", "{3}{R}{G}{W}", {cmc: 6,"power":"4","toughness":"5","keywords":["Vigilance","First strike","Haste","Start your engines!"],"oracleText":"First strike, vigilance, haste\nStart your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\nOther creatures you control get +X/+0, where X is your speed.\nNoncreature spells you cast cost {X} less to cast, where X is your speed."});
const seedtime = card("Seedtime", "Instant", "{1}{G}", {cmc: 2,"oracleText":"Cast this spell only during your turn.\nTake an extra turn after this one if an opponent cast a blue spell this turn."});
const sentryBot = card("Sentry Bot", "Artifact Creature — Robot", "{4}{W}", {cmc: 5,"power":"2","toughness":"5","keywords":["Flash"],"oracleText":"Flash\nThis spell costs {1} less to cast for each creature attacking you.\nWhen this creature enters, you get {E} for each creature attacking you.\nAt the beginning of combat on your turn, you may pay {E}{E}{E}. If you do, put a +1/+1 counter on each creature you control."});
const septicRats = card("Septic Rats", "Creature — Phyrexian Rat", "{1}{B}{B}", {cmc: 3,"power":"2","toughness":"2","keywords":["Infect"],"oracleText":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nWhenever this creature attacks, if defending player is poisoned, it gets +1/+1 until end of turn."});
const serpentineCurve = card("Serpentine Curve", "Sorcery", "{3}{U}", {cmc: 4,"oracleText":"Create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it, where X is one plus the total number of instant and sorcery cards you own in exile and in your graveyard."});
const serratedBiskelion = card("Serrated Biskelion", "Artifact Creature — Construct", "{3}", {cmc: 3,"power":"2","toughness":"2","oracleText":"{T}: Put a -1/-1 counter on this creature and a -1/-1 counter on target creature."});
const shadowbornApostle = card("Shadowborn Apostle", "Creature — Human Cleric", "{B}", {cmc: 1,"power":"1","toughness":"1","oracleText":"A deck can have any number of cards named Shadowborn Apostle.\n{B}, Sacrifice six creatures named Shadowborn Apostle: Search your library for a Demon creature card, put it onto the battlefield, then shuffle."});
const shortcutToMushrooms = card("Shortcut to Mushrooms", "Enchantment", "{1}{G}", {cmc: 2,"oracleText":"When this enchantment enters, the Ring tempts you.\nAt the beginning of your end step, if a permanent you controlled left the battlefield this turn, put a +1/+1 counter on target creature you control."});
const spellbreakerBehemoth = card("Spellbreaker Behemoth", "Creature — Beast", "{1}{R}{G}{G}", {cmc: 4,"power":"5","toughness":"5","oracleText":"This spell can't be countered.\nCreature spells you control with power 5 or greater can't be countered."});
const stealTheShow = card("Steal the Show", "Sorcery", "{2}{R}", {cmc: 3,"oracleText":"Choose one or both —\n• Target player discards any number of cards, then draws that many cards.\n• Steal the Show deals damage equal to the number of instant and sorcery cards in your graveyard to target creature or planeswalker."});
const taleOfMomo = card("Tale of Momo", "Sorcery", "{2}{W}", {cmc: 3,"oracleText":"This spell costs {2} less to cast if a creature left the battlefield under your control this turn.\nSearch your library and/or graveyard for an Ally creature card, reveal it, and put it into your hand. If you search your library this way, shuffle."});
const thatsRoughBuddy = card("That's Rough Buddy", "Instant — Lesson", "{1}{W}", {cmc: 2,"oracleText":"Put a +1/+1 counter on target creature. Put two +1/+1 counters on that creature instead if a creature left the battlefield under your control this turn.\nDraw a card."});
const theScarletWitch = card("The Scarlet Witch", "Legendary Creature — Mutant Warlock Hero", "{2}{R}", {cmc: 3,"power":"2","toughness":"3","oracleText":"Instant and sorcery spells you cast with mana value 4 or greater cost {X} less to cast, where X is The Scarlet Witch's power."});
const thranTurbine = card("Thran Turbine", "Artifact", "{1}", {cmc: 1,"oracleText":"At the beginning of your upkeep, you may add {C}{C}. This mana can't be spent to cast spells."});
const throatseeker = card("Throatseeker", "Creature — Vampire Ninja", "{2}{B}", {cmc: 3,"power":"3","toughness":"2","oracleText":"Unblocked attacking Ninjas you control have lifelink."});
const tolsimirFriendTo = card("Tolsimir, Friend to Wolves", "Legendary Creature — Elf Scout", "{2}{G}{G}{W}", {cmc: 5,"power":"3","toughness":"3","keywords":["Fight"],"oracleText":"When Tolsimir enters, create Voja, Friend to Elves, a legendary 3/3 green and white Wolf creature token.\nWhenever a Wolf you control enters, you gain 3 life and that creature fights up to one target creature you don't control."});
const voiceOfResurgence = card("Voice of Resurgence", "Creature — Elemental", "{G}{W}", {cmc: 2,"power":"2","toughness":"2","oracleText":"Whenever an opponent casts a spell during your turn and when this creature dies, create a green and white Elemental creature token with \"This token's power and toughness are each equal to the number of creatures you control.\""});
const vrock = card("Vrock", "Creature — Bird Demon", "{3}{B}{B}", {cmc: 5,"power":"3","toughness":"3","keywords":["Flying","Toxic Spores"],"oracleText":"Flying\nToxic Spores — At the beginning of your end step, if a permanent you controlled left the battlefield this turn, each opponent loses 3 life."});
const willowduskEssenceSeer = card("Willowdusk, Essence Seer", "Legendary Creature — Dryad Druid", "{1}{B}{G}", {cmc: 3,"power":"3","toughness":"3","oracleText":"{1}, {T}: Choose another target creature. Put a number of +1/+1 counters on it equal to the amount of life you gained this turn or the amount of life you lost this turn, whichever is greater. Activate only as a sorcery."});
const witchstalker = card("Witchstalker", "Creature — Wolf", "{1}{G}{G}", {cmc: 3,"power":"3","toughness":"3","keywords":["Hexproof"],"oracleText":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nWhenever an opponent casts a blue or black spell during your turn, put a +1/+1 counter on this creature."});

describe("Round 178 cards", () => {
  it("are fully supported", () =>
    supported(aetherwindBasker, ajaniGoldmane, anthemOfRakdos, avatarOfMight, azureFleetAdmiral, banefulOmen, beaconBolt, carrionGrub, cemeteryRecruitment, confirmSuspicions, cracklingDrake, curseOfThirst, cursedRecording, daxosOfMeletis, daxosTheReturned, deepwoodDenizen, dimirCharm, drillworksMole, experimentOne, eyesOfThe, ezzarootChanneler, fertileThicket, fixWhatsBroken, funeralRites, galadrielOfLothlrien, galvanicRelay, gandalfWhiteRider, genasiEnforcers, gisasFavoriteShovel, goldenTailTrainer, graveScrabbler, gwafaHazidProfiteer, hanskSlayerZealot, hourOfDevastation, hurkylsRecall, immortalServitude, inspiredUltimatum, iridianMaelstrom, isolatedWatchtower, kravensLastHunt, lightningSecuritySergeant, lostToLegend, lovisaColdeyes, luluLoyalHollyphant, malfegor, mirkoVoskMind, oblivionsHunger, perennation, phyrexianWarBeast, playWithFire, psychicSpiral, pyreticCharge, ralIzzetViceroy, realitySmasher, righteousAuthority, samutTheDriving, seedtime, sentryBot, septicRats, serpentineCurve, serratedBiskelion, shadowbornApostle, shortcutToMushrooms, spellbreakerBehemoth, stealTheShow, taleOfMomo, thatsRoughBuddy, theScarletWitch, thranTurbine, throatseeker, tolsimirFriendTo, voiceOfResurgence, vrock, willowduskEssenceSeer, witchstalker));
});

describe("the revealed card's mana value", () => {
  it("Baneful Omen: each opponent loses life equal to the top card's mana value", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, banefulOmen);
    into(s, ap, craw, "library");
    const lives = s.turnOrder.map((p) => s.players[p]!.life);
    s = resolveAll(passUntil(s, "end", ap));
    s.turnOrder.forEach((p, i) => expect(s.players[p]!.life, `player ${p}`).toBe(p === ap ? lives[i] : lives[i]! - 6));
    expect(s.players[ap]!.library.length).toBeGreaterThan(0);
  });
  it("Baneful Omen: not revealing does nothing", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, banefulOmen);
    into(s, ap, craw, "library");
    const lives = s.turnOrder.map((p) => s.players[p]!.life);
    s = resolveAll(passUntil(s, "end", ap), false);
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(lives);
  });
});

describe("play the exiled card later", () => {
  it("Galvanic Relay: not this turn, only during your next turn", () => {
    let { s, ap, ids } = setup([galvanicRelay]);
    const top = into(s, ap, opt, "library");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, top)).toBe("exile");
    expect(castable(s, ap, top)).toBe(false);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(castable(s, ap, top)).toBe(false);
    s = passUntil(s, "upkeep", ap);
    expect(castable(s, ap, top)).toBe(true);
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.objects[top]!.mayPlay).toBeUndefined();
  });
  it("Lightning, Security Sergeant: playable while you control it, and never again once you don't", () => {
    let { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, lightningSecuritySergeant);
    const top = into(s, ap, opt, "library");
    s = attack(s, ap, [{ attacker: l, defender: opp }]);
    s = resolveAll(passUntil(s, "endCombat", ap));
    expect(zone(s, top)).toBe("exile");
    s = passUntil(s, "main2", ap);
    expect(castable(s, ap, top)).toBe(true);
    const steal = addEffect(s, opp, [l], [{ kind: "control" }], "game");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[l]!)).toBe(opp);
    expect(s.objects[top]!.mayPlay).toBeUndefined();
    addEffect(s, ap, [l], [{ kind: "control" }], "game");
    expect(steal.timestamp).toBeLessThan(s.effects.at(-1)!.timestamp);
    expect(controllerOf(s, s.objects[l]!)).toBe(ap);
    expect(castable(s, ap, top)).toBe(false);
  });
});

describe("Daxos of Meletis", () => {
  it("exiles the top card of that player's library, you gain its mana value, and may cast it with any mana", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, daxosOfMeletis);
    const top = into(s, opp, cancel, "library");
    const life = s.players[ap]!.life;
    s = attack(s, ap, [{ attacker: d, defender: opp }]);
    s = resolveAll(passUntil(s, "endCombat", ap));
    expect(zone(s, top)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", anyType: true });
  });
});

describe("Isolated Watchtower", () => {
  it("can be activated only if an opponent controls at least two more lands than you", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, isolatedWatchtower);
    for (let i = 0; i < 16; i++) putOnBattlefield(s, opp, forestCard);
    expect(planActivate(s, ap, w, 0)).toBeNull();
    putOnBattlefield(s, opp, forestCard);
    const top = into(s, ap, forestCard, "library");
    s = resolveAll(run(s, planActivate(s, ap, w, 0)));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", cards: [top] });
    s = act(s, { type: "arrangeTop", player: ap, top: [top], away: [] });
    s = resolveAll(s);
    expect(zone(s, top)).toBe("battlefield");
    expect(s.objects[top]!.tapped).toBe(true);
  });
});

describe("costs and conditions", () => {
  const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land") && !s.objects[id]!.tapped).length;
  it("Tale of Momo costs {2} less once a creature left the battlefield under your control this turn", () => {
    let { s, ap, ids } = setup([taleOfMomo, taleOfMomo, shock]);
    let before = untapped(s, ap);
    let t = run(structuredClone(s), planCast(s, ap, ids[0]!));
    expect(before - untapped(t, ap)).toBe(3);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    before = untapped(s, ap);
    t = run(s, planCast(s, ap, ids[1]!));
    expect(before - untapped(t, ap)).toBe(1);
  });
  it("Fix What's Broken returns each artifact and creature card with mana value exactly X, paying X life", () => {
    let { s, ap, ids } = setup([fixWhatsBroken]);
    const b = into(s, ap, bear(), "graveyard");
    const o = into(s, ap, ornithopter, "graveyard");
    const g = into(s, ap, ogre, "graveyard");
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect([zone(s, b), zone(s, o), zone(s, g)]).toEqual(["battlefield", "graveyard", "graveyard"]);
  });
  it("Avatar of Might costs {6} less only if an opponent controls at least four more creatures than you", () => {
    let { s, ap, opp, ids } = setup([avatarOfMight]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, bear());
    const before = untapped(s, ap);
    expect(before - untapped(run(structuredClone(s), planCast(s, ap, ids[0]!)), ap)).toBe(8);
    putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!));
    expect(before - untapped(s, ap)).toBe(2);
  });
  it("Deepwood Denizen's ability costs {1} less for each +1/+1 counter on creatures you control", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, deepwoodDenizen);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters["+1/+1"] = 3;
    s.objects[d]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    const before = untapped(s, ap);
    s = run(s, planActivate(s, ap, d, 0));
    expect(before - untapped(s, ap)).toBe(2);
  });
});

describe("counters on ~ and on another creature", () => {
  it("Drillworks Mole puts a counter on itself and on up to one target commander creature you control", () => {
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, drillworksMole);
    const c = putOnBattlefield(s, ap, bear(), { commander: true });
    const b = putOnBattlefield(s, ap, bear());
    expect(planActivate(s, ap, m, 0, [tgt(b)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, m, 0, [tgt(c)])));
    expect([counters(s, m), counters(s, c), counters(s, b)]).toEqual([1, 1, 0]);
  });
  it("Serrated Biskelion puts a -1/-1 counter on itself and on target creature", () => {
    let { s, ap, opp } = setup([]);
    const sb = putOnBattlefield(s, ap, serratedBiskelion);
    const b = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planActivate(s, ap, sb, 0, [tgt(b)])));
    expect([counters(s, sb, "-1/-1"), counters(s, b, "-1/-1")]).toEqual([1, 1]);
  });
});

describe("attack and block restrictions", () => {
  it("Azure Fleet Admiral can't be blocked by creatures the monarch controls", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, azureFleetAdmiral);
    const b = putOnBattlefield(s, opp, bear());
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!, opp)).toBeNull();
    s.monarch = opp;
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!, opp)).not.toBeNull();
    s.monarch = ap;
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!, opp)).toBeNull();
  });
  it("Gwafa Hazid: a creature with a bribery counter can't attack, and its controller draws a card", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, gwafaHazidProfiteer);
    const b = putOnBattlefield(s, opp, bear());
    const a = putOnBattlefield(s, ap, bear());
    expect(characteristics(s, s.objects[b]!).cantAttack).toBeFalsy();
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!, opp)).toBeNull();
    const hand = s.players[opp]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, g, 0, [tgt(b)])));
    expect(counters(s, b, "bribery")).toBe(1);
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(characteristics(s, s.objects[b]!).cantAttack).toBe(true);
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!, opp)).not.toBeNull();
  });
});

describe("mass removal", () => {
  it("Hour of Devastation: creatures lose indestructible; Bolas planeswalkers are spared", () => {
    let { s, ap, opp, ids } = setup([hourOfDevastation]);
    const i = putOnBattlefield(s, opp, bear({ keywords: ["Indestructible"], oracleText: "Indestructible" }));
    const b = putOnBattlefield(s, opp, bolas);
    const j = putOnBattlefield(s, opp, jace);
    expect(kw(s, i, "Indestructible")).toBe(true);
    s.objects[b]!.counters.loyalty = 4;
    s.objects[j]!.counters.loyalty = 4;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, i), zone(s, b), zone(s, j)]).toEqual(["graveyard", "battlefield", "graveyard"]);
  });
  it("Iridian Maelstrom destroys each creature that isn't all colors", () => {
    let { s, ap, opp, ids } = setup([iridianMaelstrom]);
    const f = putOnBattlefield(s, opp, fiveColor);
    const b = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, f), zone(s, b)]).toEqual(["battlefield", "graveyard"]);
  });
});

describe("mana and spells", () => {
  it("Thran Turbine: {C}{C} at upkeep that can't be spent to cast spells", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, thranTurbine);
    s = passUntil(s, "upkeep", ap, 4000);
    s = resolveAll(s);
    const lots = s.players[ap]!.manaLots ?? [];
    expect(lots.reduce((n, l) => n + (l.mana === "C" ? l.n : 0), 0)).toBe(2);
    expect(lots.every((l) => l.only && !l.only.spells && l.only.abilities === "any")).toBe(true);
  });
  it("Spellbreaker Behemoth: your creature spells with power 5 or greater can't be countered", () => {
    let { s, ap, ids } = setup([craw, cancel, bear(), cancel]);
    putOnBattlefield(s, ap, spellbreakerBehemoth);
    for (let i = 0; i < 6; i++) putOnBattlefield(s, ap, island);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack.at(-1)!.id }])));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = run(s, planCast(s, ap, ids[2]!));
    s = resolveAll(run(s, planCast(s, ap, ids[3]!, [{ kind: "stack", id: s.stack.at(-1)!.id }])));
    expect(zone(s, ids[2]!)).toBe("graveyard");
  });
  it("Cursed Recording deals 20 damage to you on the seventh time counter, and removes them", () => {
    let { s, ap, ids } = setup([opt]);
    const c = putOnBattlefield(s, ap, cursedRecording);
    s.objects[c]!.counters.time = 6;
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, c, "time")).toBe(0);
    expect(s.players[ap]!.life).toBe(life - 20);
  });
});

describe("a permanent you controlled left the battlefield this turn", () => {
  it("Lulu, Loyal Hollyphant: a counter on each tapped creature you control, then untap them", () => {
    let { s, ap, ids } = setup([shock]);
    putOnBattlefield(s, ap, luluLoyalHollyphant);
    const t = putOnBattlefield(s, ap, bear());
    const u = putOnBattlefield(s, ap, bear());
    const gone = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(gone)])));
    s.objects[t]!.tapped = true;
    s = resolveAll(passUntil(s, "end", ap));
    expect([counters(s, t), counters(s, u)]).toEqual([1, 0]);
    expect(s.objects[t]!.tapped).toBe(false);
  });
  it("Lulu does nothing when no permanent of yours left", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, luluLoyalHollyphant);
    const t = putOnBattlefield(s, ap, bear());
    s.objects[t]!.tapped = true;
    s = resolveAll(passUntil(s, "end", ap));
    expect(counters(s, t)).toBe(0);
  });
});

describe("library and graveyard", () => {
  it("Fertile Thicket: you may look at the top five, put up to one basic land on top and the rest on the bottom", () => {
    let { s, ap, ids } = setup([fertileThicket]);
    const deep = s.players[ap]!.library.slice(0, 4);
    const land = into(s, ap, forestCard, "library");
    const second = s.players[ap]!.library[1]!;
    s = resolveAll(act(s, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    s = act(s, { type: "searchLibrary", player: ap, found: [land] });
    if (s.pending?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] });
    s = resolveAll(s);
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(land);
    expect(lib.slice(-4)).toEqual(expect.arrayContaining([second, ...deep.slice(0, 3)]));
  });
  it("Fertile Thicket: not looking leaves the library as it was", () => {
    let { s, ap, ids } = setup([fertileThicket]);
    const lib = [...s.players[ap]!.library];
    s = resolveAll(act(s, { type: "playLand", player: ap, objectId: ids[0]! }), false);
    expect(s.players[ap]!.library).toEqual(lib);
  });
  it("Mirko Vosk: that player reveals until four land cards and puts them all into their graveyard", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, mirkoVoskMind);
    const lib = s.players[opp]!.library;
    let lands = 0, n = 0;
    while (lands < 4) if (s.objects[lib[n++]!]!.cardId && /Land/.test(characteristics(s, s.objects[lib[n - 1]!]!).types.join())) lands++;
    const yard = s.players[opp]!.graveyard.length;
    s = attack(s, ap, [{ attacker: m, defender: opp }]);
    s = resolveAll(passUntil(s, "endCombat", ap));
    expect(s.players[opp]!.graveyard.length).toBe(yard + n);
  });
  it("Psychic Spiral: target player mills as many cards as were shuffled in from your graveyard", () => {
    let { s, ap, opp, ids } = setup([psychicSpiral]);
    for (let i = 0; i < 3; i++) into(s, ap, bear(), "graveyard");
    const lib = s.players[opp]!.library.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[ap]!.graveyard.length).toBe(1);
    expect(s.players[opp]!.library.length).toBe(lib - 3);
  });
  it("Lost to Legend puts the permanent into its owner's library fourth from the top", () => {
    let { s, ap, opp, ids } = setup([lostToLegend]);
    const t = putOnBattlefield(s, opp, cursedRecording);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
    expect(s.players[opp]!.library.indexOf(t)).toBe(3);
  });
  it("Gandalf, White Rider: when it dies, you may put it fifth from the top", () => {
    let { s, ap, ids } = setup([shock]);
    const g = putOnBattlefield(s, ap, gandalfWhiteRider);
    s.objects[g]!.damage = Number(gandalfWhiteRider.toughness) - 2;
    s = resolveKeep(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(s.players[ap]!.library.indexOf(g)).toBe(4);
  });
  it("Dimir Charm: look at the top three of target player's library, put one back and the rest into their graveyard", () => {
    let { s, ap, opp, ids } = setup([dimirCharm]);
    const top3 = s.players[opp]!.library.slice(0, 3);
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)], [2]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [top3[1]!] }));
    expect(s.players[opp]!.library[0]).toBe(top3[1]);
    expect([zone(s, top3[0]!), zone(s, top3[2]!)]).toEqual(["graveyard", "graveyard"]);
  });
  it("Cemetery Recruitment draws a card only if the returned card is a Zombie", () => {
    let { s, ap, ids } = setup([cemeteryRecruitment, cemeteryRecruitment]);
    const z = into(s, ap, bear({ name: "Walking Corpse", subtypes: ["Zombie"] } as Partial<CardDef>), "graveyard");
    const b = into(s, ap, bear(), "graveyard");
    let hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand);
    hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(z)])));
    expect(zone(s, z)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
  it("Hurkyl's Recall returns the artifacts target player owns, whoever controls them", () => {
    let { s, ap, opp, ids } = setup([hurkylsRecall]);
    const mine = putOnBattlefield(s, ap, ornithopter);
    const theirs = putOnBattlefield(s, opp, ornithopter);
    const stolen = putOnBattlefield(s, opp, ornithopter);
    addEffect(s, ap, [stolen], [{ kind: "control" }], "game");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect([zone(s, mine), zone(s, theirs), zone(s, stolen)]).toEqual(["battlefield", "hand", "hand"]);
    expect(s.players[opp]!.hand).toEqual(expect.arrayContaining([theirs, stolen]));
  });
});

describe("players and choices", () => {
  it("Steal the Show: target player discards any number of cards, then draws that many", () => {
    let { s, ap, opp, ids } = setup([stealTheShow]);
    const a = into(s, opp, bear(), "hand"), b = into(s, opp, bear(), "hand");
    const hand = s.players[opp]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)], [0]));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: [a, b] });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "graveyard"]);
    expect(s.players[opp]!.hand.length).toBe(hand);
  });
  it("Willowdusk: counters equal to the life you gained or lost this turn, whichever is greater", () => {
    let { s, ap } = setup([]);
    const w = putOnBattlefield(s, ap, willowduskEssenceSeer);
    const b = putOnBattlefield(s, ap, bear());
    s.players[ap]!.life -= 3;
    s.turnLog = { ...(s.turnLog ?? {}), lifeLost: { [ap]: 3 }, lifeGained: { [ap]: 2 } } as typeof s.turnLog;
    expect(planActivate(s, ap, w, 0, [tgt(w)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, w, 0, [tgt(b)])));
    expect(counters(s, b)).toBe(3);
  });
  it("Gisa's Favorite Shovel: defending player sacrifices a creature, and only then you create a Walker", () => {
    let { s, ap, opp } = setup([]);
    const shovel = putOnBattlefield(s, ap, gisasFavoriteShovel);
    const a = putOnBattlefield(s, ap, bear());
    s.objects[shovel]!.attachedTo = a;
    invalidateCharacteristics(s);
    const v = putOnBattlefield(s, opp, bear());
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    s = resolveAll(s);
    expect(zone(s, v)).toBe("graveyard");
    const walkers = named(s, ap, "Walker");
    expect(walkers.length).toBe(1);
    expect(pt(s, walkers[0]!)).toBe("2/2");
    expect(characteristics(s, s.objects[walkers[0]!]!).subtypes).toContain("Zombie");
  });
  it("Gisa's Favorite Shovel: no Walker when the defending player has no creature", () => {
    let { s, ap, opp } = setup([]);
    const shovel = putOnBattlefield(s, ap, gisasFavoriteShovel);
    const a = putOnBattlefield(s, ap, bear());
    s.objects[shovel]!.attachedTo = a;
    invalidateCharacteristics(s);
    s = resolveAll(attack(s, ap, [{ attacker: a, defender: opp }]));
    expect(named(s, ap, "Walker").length).toBe(0);
  });
});

describe("Reality Smasher", () => {
  /** The active player Shocks the opponent's Reality Smasher; its trigger asks them to discard. */
  const shockSmasher = () => {
    const { s: s0, ap, opp, ids } = setup([shock, opt]);
    const r = putOnBattlefield(s0, opp, realitySmasher);
    let s = cast(s0, ap, ids[0]!, [tgt(r)]);
    s = settle(s);
    return { s, ap, r, discard: ids[1]! };
  };

  it("discarding a card keeps the spell", () => {
    let { s, ap, r, discard } = shockSmasher();
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, discard: 1 });
    s = act(s, { type: "payUnless", player: ap, pay: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [discard] }));
    expect(s.objects[discard]!.zone).toBe("graveyard");
    expect(s.objects[r]!.damage).toBe(2);
  });

  it("not discarding counters the spell", () => {
    let { s, ap, r } = shockSmasher();
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[r]!.damage).toBe(0);
  });
});
