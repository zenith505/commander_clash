// Round 175: the most played cards still unsupported, in popularity order, from Detention Sphere (rank 8,455) on, and
// the cards that share their mechanics.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { blockProblem, potentialAttackers, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const canAttack = (s: GameState, pid: PlayerId, id: string) => potentialAttackers(s, pid).some((o) => o.id === id);
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
/** Everyone passes until a question comes up. */
const untilPending = (s: GameState) => {
  for (let i = 0; i < 200 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Empties a player's hand onto the bottom of their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
  invalidateCharacteristics(s);
};
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const blaze = card("Blaze", "Sorcery", "{X}{R}", { cmc: 1, oracleText: "Blaze deals X damage to any target." });
const sword = card("Short Sword", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" });
const ench = (extra: Partial<CardDef> = {}) => card(extra.name ?? "Nymph", "Enchantment Creature — Nymph", "{1}{G}", { cmc: 2, power: "2", toughness: "2", ...extra });

// Real oracle text (Scryfall).
const afterlifeInsurance = card("Afterlife Insurance", "Instant", "{1}{W/B}", {cmc: 2,oracleText: "Creatures you control gain afterlife 1 until end of turn. Draw a card. (When a creature with afterlife 1 dies, create a 1/1 white and black Spirit creature token with flying.)"});
const biovisionary = card("Biovisionary", "Creature — Human Wizard", "{1}{G}{U}", {cmc: 3,power: "2",toughness: "3",oracleText: "At the beginning of the end step, if you control four or more creatures named Biovisionary, you win the game."});
const bontuTheGlorified = card("Bontu the Glorified", "Legendary Creature — God", "{2}{B}", {cmc: 3,power: "4",toughness: "6",keywords: ["Indestructible","Menace","Scry"],oracleText: "Menace, indestructible\nBontu can't attack or block unless a creature died under your control this turn.\n{1}{B}, Sacrifice another creature: Scry 1. Each opponent loses 1 life and you gain 1 life."});
const bowerPassage = card("Bower Passage", "Enchantment", "{1}{G}", {cmc: 2,oracleText: "Creatures with flying can't block creatures you control."});
const curiousColossus = card("Curious Colossus", "Creature — Giant Warrior", "{5}{W}{W}", {cmc: 7,power: "7",toughness: "7",oracleText: "When this creature enters, each creature target opponent controls loses all abilities, becomes a Coward in addition to its other types, and has base power and toughness 1/1."});
const deepseaTerror = card("Deep-Sea Terror", "Creature — Serpent", "{4}{U}{U}", {cmc: 6,power: "6",toughness: "6",oracleText: "This creature can't attack unless there are seven or more cards in your graveyard."});
const emissaryEscort = card("Emissary Escort", "Artifact Creature — Robot Soldier", "{1}{U}", {cmc: 2,power: "0",toughness: "4",oracleText: "This creature gets +X/+0, where X is the greatest mana value among other artifacts you control."});
const feastOfDreams = card("Feast of Dreams", "Instant", "{1}{B}", {cmc: 2,oracleText: "Destroy target enchanted creature or enchantment creature."});
const feralAppetite = card("Feral Appetite", "Enchantment", "{2}{G}", {cmc: 3,oracleText: "Attacking Pests you control get +1/+0 and have deathtouch.\n{1}{G}: Exile target card from a graveyard. If a creature card is exiled this way, create a 1/1 black and green Pest creature token with \"When this token dies, you gain 1 life.\""});
const fullMoonsRise = card("Full Moon's Rise", "Enchantment", "{1}{G}", {cmc: 2,keywords: ["Regenerate"],oracleText: "Werewolf creatures you control get +1/+0 and have trample.\nSacrifice this enchantment: Regenerate all Werewolf creatures you control."});
const geometersArthropod = card("Geometer's Arthropod", "Creature — Fractal Crab", "{G}{U}", {cmc: 2,power: "1",toughness: "4",oracleText: "Whenever you cast a spell with {X} in its mana cost, look at the top X cards of your library. Put one of them into your hand and the rest on the bottom of your library in a random order."});
const goblinCohort = card("Goblin Cohort", "Creature — Goblin Warrior", "{R}", {cmc: 1,power: "2",toughness: "2",oracleText: "This creature can't attack unless you've cast a creature spell this turn."});
const harborSerpent = card("Harbor Serpent", "Creature — Serpent", "{4}{U}{U}", {cmc: 6,power: "5",toughness: "5",keywords: ["Landwalk","Islandwalk"],oracleText: "Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nThis creature can't attack unless there are five or more Islands on the battlefield."});
const hazoretTheFervent = card("Hazoret the Fervent", "Legendary Creature — God", "{3}{R}", {cmc: 4,power: "5",toughness: "4",keywords: ["Indestructible","Haste"],oracleText: "Indestructible, haste\nHazoret can't attack or block unless you have one or fewer cards in hand.\n{2}{R}, Discard a card: Hazoret deals 2 damage to each opponent."});
const indebtedSpirit = card("Indebted Spirit", "Enchantment Creature — Spirit", "{W}", {cmc: 1,power: "1",toughness: "1",keywords: ["Afterlife","Bestow"],oracleText: "Bestow {2}{W} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nAfterlife 1 (When this permanent is put into a graveyard from the battlefield, create a 1/1 white and black Spirit creature token with flying.)\nEnchanted creature gets +1/+1 and has afterlife 1."});
const kabiraEvangel = card("Kabira Evangel", "Creature — Human Cleric Ally", "{2}{W}", {cmc: 3,power: "2",toughness: "3",oracleText: "Whenever this creature or another Ally you control enters, you may choose a color. If you do, Allies you control gain protection from the chosen color until end of turn."});
const karametrasBlessing = card("Karametra's Blessing", "Instant", "{W}", {cmc: 1,oracleText: "Target creature gets +2/+2 until end of turn. If it's an enchanted creature or enchantment creature, it also gains hexproof and indestructible until end of turn. (It can't be the target of spells or abilities your opponents control. Damage and effects that say \"destroy\" don't destroy it.)"});
const kestiaTheCultivator = card("Kestia, the Cultivator", "Legendary Enchantment Creature — Nymph", "{1}{G}{W}{U}", {cmc: 4,power: "4",toughness: "4",keywords: ["Bestow"],oracleText: "Bestow {3}{G}{W}{U} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+4.\nWhenever an enchanted creature or enchantment creature you control attacks, draw a card."});
const latticeLibrary = card("Lattice Library", "Enchantment", "{X}{G}{G}", {cmc: 2,oracleText: "This enchantment enters with X study counters on it.\nWhen this enchantment enters and whenever you cast your first spell with {X} in its mana cost each turn, create a 0/0 green and blue Fractal creature token. Put a number of +1/+1 counters on it equal to the number of study counters on this enchantment."});
const lupinePrototype = card("Lupine Prototype", "Artifact Creature — Wolf Construct", "{2}", {cmc: 2,power: "5",toughness: "5",oracleText: "This creature can't attack or block unless a player has no cards in hand."});
const marjhan = card("Marjhan", "Creature — Serpent", "{5}{U}{U}", {cmc: 7,power: "8",toughness: "8",oracleText: "This creature doesn't untap during your untap step.\n{U}{U}, Sacrifice a creature: Untap this creature. Activate only during your upkeep.\nThis creature can't attack unless defending player controls an Island.\n{U}{U}: This creature gets -1/-0 until end of turn and deals 1 damage to target attacking creature without flying.\nWhen you control no Islands, sacrifice this creature."});
const moggConscripts = card("Mogg Conscripts", "Creature — Goblin", "{R}", {cmc: 1,power: "2",toughness: "2",oracleText: "This creature can't attack unless you've cast a creature spell this turn."});
const nessianWanderer = card("Nessian Wanderer", "Creature — Satyr Scout", "{1}{G}", {cmc: 2,power: "1",toughness: "3",keywords: ["Constellation"],oracleText: "Constellation — Whenever an enchantment you control enters, look at the top three cards of your library. You may reveal a land card from among them and put that card into your hand. Put the rest on the bottom of your library in a random order."});
const nevThePracticalDean = card("Nev, the Practical Dean", "Legendary Creature — Merfolk Wizard", "{2}{G}", {cmc: 3,power: "2",toughness: "2",oracleText: "Creatures you control with counters on them have trample.\nWhenever you cast your first spell with {X} in its mana cost each turn, put X +1/+1 counters on Nev."});
const nyxHerald = card("Nyx Herald", "Enchantment Creature — Centaur Shaman", "{2}{G}", {cmc: 3,power: "2",toughness: "3",oracleText: "At the beginning of combat on your turn, target enchanted creature or enchantment creature you control gets +1/+1 and gains trample until end of turn."});
const overgrownPest = card("Overgrown Pest", "Creature — Pest", "{2}{G}", {cmc: 3,power: "2",toughness: "2",oracleText: "When this creature enters, look at the top five cards of your library. You may reveal a land or double-faced card from among them and put that card into your hand. Put the rest on the bottom of your library in a random order."});
const owlinSpiralmancer = card("Owlin Spiralmancer", "Creature — Bird Wizard", "{3}{U}", {cmc: 4,power: "3",toughness: "4",keywords: ["Flying","Vigilance"],oracleText: "Flying, vigilance\nWhenever you cast your first spell with {X} in its mana cost each turn, you may copy it. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)"});
const patchworkBeastie = card("Patchwork Beastie", "Artifact Creature — Beast", "{G}", {cmc: 1,power: "3",toughness: "3",keywords: ["Delirium","Mill"],oracleText: "Delirium — This creature can't attack or block unless there are four or more card types among cards in your graveyard.\nAt the beginning of your upkeep, you may mill a card. (You may put the top card of your library into your graveyard.)"});
const penregonStrongbull = card("Penregon Strongbull", "Creature — Minotaur", "{2}{R}", {cmc: 3,power: "2",toughness: "3",oracleText: "{1}, Sacrifice an artifact: This creature gets +1/+1 until end of turn and deals 1 damage to each opponent."});
const plateArmor = card("Plate Armor", "Artifact — Equipment", "{2}{W}", {cmc: 3,keywords: ["Equip"],oracleText: "Equipped creature gets +3/+3 and has ward {1}. (Whenever equipped creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\nEquip {3}. This ability costs {1} less to activate for each other Equipment you control. ({3}: Attach to target creature you control. Equip only as a sorcery.)"});
const quandrixApprentice = card("Quandrix Apprentice", "Creature — Human Wizard", "{G}{U}", {cmc: 2,power: "2",toughness: "2",keywords: ["Magecraft"],oracleText: "Magecraft — Whenever you cast or copy an instant or sorcery spell, look at the top three cards of your library. You may reveal a land card from among them and put that card into your hand. Put the rest on the bottom of your library in any order."});
const ravenEagle = card("Raven Eagle", "Creature — Bird Assassin", "{2}{B}", {cmc: 3,power: "2",toughness: "3",keywords: ["Flying"],oracleText: "Flying\nWhenever this creature enters or attacks, exile up to one target card from a graveyard. If a creature card is exiled this way, create a Clue token. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nWhenever you draw your second card each turn, each opponent loses 1 life and you gain 1 life."});
const redcapGutterdweller = card("Redcap Gutter-Dweller", "Creature — Goblin Warrior", "{2}{R}{R}", {cmc: 4,power: "3",toughness: "3",keywords: ["Menace"],oracleText: "Menace\nWhen this creature enters, create two 1/1 black Rat creature tokens with \"This token can't block.\"\nAt the beginning of your upkeep, you may sacrifice another creature. If you do, put a +1/+1 counter on this creature and exile the top card of your library. You may play that card this turn."});
const relicGolem = card("Relic Golem", "Artifact Creature — Golem", "{3}", {cmc: 3,power: "6",toughness: "6",keywords: ["Mill"],oracleText: "This creature can't attack or block unless an opponent has eight or more cards in their graveyard.\n{2}, {T}: Target player mills two cards. (They put the top two cards of their library into their graveyard.)"});
const resistanceIsFutile = card("Resistance Is Futile", "Sorcery", "{1}{B}", {cmc: 2,oracleText: "Choose one —\n• Destroy target nonartifact creature.\n• Return target artifact creature card with mana value 3 or less from your graveyard to the battlefield."});
const riverSerpent = card("River Serpent", "Creature — Serpent", "{5}{U}", {cmc: 6,power: "5",toughness: "5",keywords: ["Cycling"],oracleText: "This creature can't attack unless there are five or more cards in your graveyard.\nCycling {U} ({U}, Discard this card: Draw a card.)"});
const scarecrone = card("Scarecrone", "Artifact Creature — Scarecrow", "{3}", {cmc: 3,power: "1",toughness: "2",oracleText: "{1}, Sacrifice a Scarecrow: Draw a card.\n{4}, {T}: Return target artifact creature card from your graveyard to the battlefield."});
const silburlindSnapper = card("Silburlind Snapper", "Creature — Turtle", "{5}{U}", {cmc: 6,power: "6",toughness: "6",oracleText: "This creature can't attack unless you've cast a noncreature spell this turn."});
const slumberingDragon = card("Slumbering Dragon", "Creature — Dragon", "{R}", {cmc: 1,power: "3",toughness: "3",keywords: ["Flying"],oracleText: "Flying\nThis creature can't attack or block unless it has five or more +1/+1 counters on it.\nWhenever a creature attacks you or a planeswalker you control, put a +1/+1 counter on this creature."});
const subjugateTheHobbits = card("Subjugate the Hobbits", "Sorcery", "{5}{U}{U}", {cmc: 7,oracleText: "Gain control of each noncommander creature with mana value 3 or less."});
const sylvanAdvocate = card("Sylvan Advocate", "Creature — Elf Druid Ally", "{1}{G}", {cmc: 2,power: "2",toughness: "3",keywords: ["Vigilance"],oracleText: "Vigilance\nAs long as you control six or more lands, this creature and land creatures you control get +2/+2."});
const technodrome = card("Technodrome", "Artifact Creature — Construct", "{2}", {cmc: 2,power: "3",toughness: "3",keywords: ["Reach","Trample"],oracleText: "Reach, trample\nThis creature can't attack or block unless its power is 6 or greater.\n{T}, Sacrifice another artifact: Draw a card. Put a +1/+1 counter on this creature."});
const templeThief = card("Temple Thief", "Creature — Human Rogue", "{1}{B}", {cmc: 2,power: "2",toughness: "2",oracleText: "This creature can't be blocked by enchanted creatures or enchantment creatures."});
const theHowlingAbomination = card("The Howling Abomination", "Legendary Creature — Human Beast Warrior", "{3}{R}{G}", {cmc: 5,power: "5",toughness: "5",keywords: ["Haste"],oracleText: "Haste\nThe Howling Abomination has trample as long as you've cast three or more spells this turn.\nWhenever The Howling Abomination becomes the target of a spell, it gets +2/+2 until end of turn and deals 2 damage to each opponent."});
const theImmortalWeapons = card("The Immortal Weapons", "Legendary Creature — Human Warrior Hero", "{4}{R}", {cmc: 5,power: "4",toughness: "4",oracleText: "When The Immortal Weapons enter, return target instant or sorcery card from your graveyard to your hand.\nWhenever you cast a noncreature spell, target creature gets +2/+0 and gains menace until end of turn. (It can't be blocked except by two or more creatures.)"});
const theLionturtle = card("The Lion-Turtle", "Legendary Creature — Elder Cat Turtle", "{1}{G}{U}", {cmc: 3,power: "3",toughness: "6",keywords: ["Reach","Vigilance"],oracleText: "Reach, vigilance\nWhen The Lion-Turtle enters, you gain 3 life.\nThe Lion-Turtle can't attack or block unless there are three or more Lesson cards in your graveyard.\n{T}: Add one mana of any color."});
const theNotaryHobbits = card("The Notary Hobbits", "Legendary Creature — Halfling Advisor", "{3}{G}{G}", {cmc: 5,power: "1",toughness: "1",oracleText: "When The Notary Hobbits enter, if they're not a token, create two tokens that are copies of them, except the tokens aren't legendary.\n{T}: Add {C} for each Halfling you control."});
const theSackvillebagginses = card("The Sackville-Bagginses", "Legendary Creature — Halfling Citizen", "{1}{B}", {cmc: 2,power: "2",toughness: "2",keywords: ["Treasure"],oracleText: "When The Sackville-Bagginses enter, you may sacrifice another creature or artifact. If you do, draw a card and create a Treasure token.\nWhenever you sacrifice a token, target opponent loses 1 life."});
const trainingDrone = card("Training Drone", "Artifact Creature — Drone", "{3}", {cmc: 3,power: "4",toughness: "4",oracleText: "This creature can't attack or block unless it's equipped."});
const unquenchableFury = card("Unquenchable Fury", "Enchantment — Aura", "{2}{R}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature has \"Whenever this creature attacks, it deals X damage to defending player, where X is the number of cards in their hand.\"\nWhen this Aura is put into your graveyard from the battlefield, return it to your hand."});
const unsealTheNecropolis = card("Unseal the Necropolis", "Instant", "{2}{B}", {cmc: 3,keywords: ["Mill"],oracleText: "Each player mills three cards. Then you return up to two creature cards from your graveyard to your hand. (To mill three cards, a player puts the top three cards of their library into their graveyard.)"});
const witherbloomCommand = card("Witherbloom Command", "Sorcery", "{B}{G}", {cmc: 2,keywords: ["Mill"],oracleText: "Choose two —\n• Target player mills three cards, then you return a land card from your graveyard to your hand.\n• Destroy target noncreature, nonland permanent with mana value 2 or less.\n• Target creature gets -3/-1 until end of turn.\n• Target opponent loses 2 life and you gain 2 life."});
const wreckAndRebuild = card("Wreck and Rebuild", "Sorcery", "{1}{R}{G}", {cmc: 3,keywords: ["Flashback","Mill"],oracleText: "Choose one —\n• Destroy target artifact or enchantment.\n• Mill five cards, then you may put a land card from your graveyard onto the battlefield tapped.\nFlashback {3}{R}{G}"});
const yunasWhistle = card("Yuna's Whistle", "Instant", "{1}{G}{G}", {cmc: 3,oracleText: "Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order. When you reveal a creature card this way, put X +1/+1 counters on target creature you control, where X is the mana value of that card."});
const zaxaraTheExemplary = card("Zaxara, the Exemplary", "Legendary Creature — Nightmare Hydra", "{1}{B}{G}{U}", {cmc: 4,power: "2",toughness: "3",keywords: ["Deathtouch"],oracleText: "Deathtouch\n{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it."});
const zodiacDragon = card("Zodiac Dragon", "Creature — Dragon", "{7}{R}{R}", {cmc: 9,power: "8",toughness: "8",oracleText: "When this creature is put into your graveyard from the battlefield, you may return it to your hand."});
const zukosConviction = card("Zuko's Conviction", "Instant", "{B}", {cmc: 1,keywords: ["Kicker"],oracleText: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nReturn target creature card from your graveyard to your hand. If this spell was kicked, instead put that card onto the battlefield tapped."});
const ferraforYoungYew = card("Ferrafor, Young Yew", "Legendary Creature — Treefolk Druid", "{6}{G}", {cmc: 7,power: "4",toughness: "7",keywords: ["Double"],oracleText: "When Ferrafor enters, create a number of 1/1 green Saproling creature tokens equal to the number of counters among creatures target player controls.\n{T}: Double the number of each kind of counter on target creature."});

describe("Round 175 cards", () => {
  it("are fully supported", () =>
    supported(afterlifeInsurance, biovisionary, bontuTheGlorified, bowerPassage, curiousColossus, deepseaTerror, emissaryEscort, feastOfDreams, feralAppetite, fullMoonsRise, geometersArthropod, goblinCohort, harborSerpent, hazoretTheFervent, indebtedSpirit, kabiraEvangel, karametrasBlessing, kestiaTheCultivator, latticeLibrary, lupinePrototype, marjhan, moggConscripts, nessianWanderer, nevThePracticalDean, nyxHerald, overgrownPest, owlinSpiralmancer, patchworkBeastie, penregonStrongbull, plateArmor, quandrixApprentice, ravenEagle, redcapGutterdweller, relicGolem, resistanceIsFutile, riverSerpent, scarecrone, silburlindSnapper, slumberingDragon, subjugateTheHobbits, sylvanAdvocate, technodrome, templeThief, theHowlingAbomination, theImmortalWeapons, theLionturtle, theNotaryHobbits, theSackvillebagginses, trainingDrone, unquenchableFury, unsealTheNecropolis, witherbloomCommand, wreckAndRebuild, yunasWhistle, zaxaraTheExemplary, zodiacDragon, zukosConviction, ferraforYoungYew));
});

describe("can't attack or block unless (CR 508.1c, 509.1b)", () => {
  it("Goblin Cohort attacks only after you've cast a creature spell this turn", () => {
    let { s, ap, ids, opp } = setup([bear()]);
    const g = putOnBattlefield(s, ap, goblinCohort);
    expect(canAttack(s, ap, g)).toBe(false);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(canAttack(s, ap, g)).toBe(true);
  });
  it("Hazoret attacks and blocks only with one or fewer cards in hand", () => {
    let { s, ap, opp } = setup([bear(), bear()]);
    const h = putOnBattlefield(s, ap, hazoretTheFervent);
    const foe = putOnBattlefield(s, opp, bear());
    s.objects[foe]!.attacking = ap;
    expect(canAttack(s, ap, h)).toBe(false);
    expect(blockProblem(s, s.objects[h]!, s.objects[foe]!)).not.toBeNull();
    emptyHand(s, ap);
    expect(canAttack(s, ap, h)).toBe(true);
    expect(blockProblem(s, s.objects[h]!, s.objects[foe]!)).toBeNull();
  });
  it("Bontu attacks once a creature died under your control this turn", () => {
    let { s, ap, ids, opp } = setup([shock]);
    const b = putOnBattlefield(s, ap, bontuTheGlorified);
    const victim = putOnBattlefield(s, ap, bear());
    expect(canAttack(s, ap, b)).toBe(false);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(victim)])));
    expect(zone(s, victim)).toBe("graveyard");
    expect(canAttack(s, ap, b)).toBe(true);
  });
  it("Lupine Prototype attacks once some player has no cards in hand", () => {
    const { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, lupinePrototype);
    expect(canAttack(s, ap, l)).toBe(false);
    emptyHand(s, s.turnOrder[2]!);
    expect(canAttack(s, ap, l)).toBe(true);
  });
  it("Technodrome attacks once its power is 6 or greater", () => {
    const { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, technodrome);
    expect(canAttack(s, ap, t)).toBe(false);
    s.objects[t]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    expect(canAttack(s, ap, t)).toBe(true);
  });
  it("Slumbering Dragon needs five +1/+1 counters, and gets one whenever a creature attacks you", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, slumberingDragon);
    expect(canAttack(s, ap, d)).toBe(false);
    s.objects[d]!.counters["+1/+1"] = 5;
    invalidateCharacteristics(s);
    expect(canAttack(s, ap, d)).toBe(true);
    const foe = putOnBattlefield(s, opp, bear());
    s = act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: foe, defender: ap }] });
    s = resolveAll(s);
    expect(counters(s, d)).toBe(6);
  });
  it("Deep-Sea Terror counts the cards in your graveyard", () => {
    const { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, deepseaTerror);
    for (let i = 0; i < 6; i++) into(s, ap, bear(), "graveyard");
    expect(canAttack(s, ap, d)).toBe(false);
    into(s, ap, bear(), "graveyard");
    expect(canAttack(s, ap, d)).toBe(true);
  });
});

describe("Plate Armor and Training Drone", () => {
  it("equip costs {1} less for each other Equipment you control; the equipped Drone can attack", () => {
    let { s, ap, opp } = setup([]);
    const drone = putOnBattlefield(s, ap, trainingDrone);
    const armor = putOnBattlefield(s, ap, plateArmor);
    putOnBattlefield(s, ap, sword);
    expect(canAttack(s, ap, drone)).toBe(false);
    // Leave two untapped lands: {3} less {1} for the Short Sword.
    const lands = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land"));
    for (const l of lands.slice(2)) s.objects[l]!.tapped = true;
    s = resolveAll(run(s, planActivate(s, ap, armor, 0, [tgt(drone)])));
    expect(s.objects[armor]!.attachedTo).toBe(drone);
    expect(pt(s, drone)).toBe("7/7");
    expect(characteristics(s, s.objects[drone]!).grantedAbilities).toContain("Ward {1}");
    expect(canAttack(s, ap, drone)).toBe(true);
  });
  it("with no other Equipment, two lands aren't enough", () => {
    const { s, ap } = setup([]);
    const drone = putOnBattlefield(s, ap, trainingDrone);
    const armor = putOnBattlefield(s, ap, plateArmor);
    const lands = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land"));
    for (const l of lands.slice(2)) s.objects[l]!.tapped = true;
    expect(planActivate(s, ap, armor, 0, [tgt(drone)])).toBeNull();
  });
});

describe("Biovisionary", () => {
  it("wins at the beginning of the end step with four or more named Biovisionary (CR 104.2b)", () => {
    let { s, ap } = setup([]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, biovisionary);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && !s.winner; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.winner).toBe(ap);
  });
  it("three aren't enough", () => {
    let { s, ap } = setup([]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, biovisionary);
    s = resolveAll(passUntil(s, "end", ap));
    expect(s.winner).toBeNull();
  });
});

describe("enchanted creature or enchantment creature", () => {
  it("Feast of Dreams targets an enchantment creature or an enchanted creature, not a plain creature", () => {
    let { s, ap, ids, opp } = setup([feastOfDreams]);
    const plain = putOnBattlefield(s, opp, bear());
    const nymph = putOnBattlefield(s, opp, ench());
    expect(planCast(s, ap, ids[0]!, [tgt(plain)])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(nymph)])));
    expect(zone(s, nymph)).toBe("graveyard");
  });
  it("Karametra's Blessing adds hexproof and indestructible only to an enchantment creature", () => {
    let { s, ap, ids } = setup([karametrasBlessing, karametrasBlessing]);
    const plain = putOnBattlefield(s, ap, bear());
    const nymph = putOnBattlefield(s, ap, ench());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(plain)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(nymph)])));
    expect(pt(s, plain)).toBe("4/4");
    expect(kw(s, plain, "Hexproof")).toBe(false);
    expect(pt(s, nymph)).toBe("4/4");
    expect(kw(s, nymph, "Hexproof")).toBe(true);
    expect(kw(s, nymph, "Indestructible")).toBe(true);
  });
  it("Temple Thief can't be blocked by an enchantment creature, but can by a plain one", () => {
    const { s, ap, opp } = setup([]);
    const thief = putOnBattlefield(s, ap, templeThief);
    s.objects[thief]!.attacking = opp;
    expect(blockProblem(s, s.objects[putOnBattlefield(s, opp, ench())]!, s.objects[thief]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[putOnBattlefield(s, opp, bear())]!, s.objects[thief]!)).toBeNull();
  });
});

describe("Bower Passage", () => {
  it("creatures with flying can't block your creatures", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, bowerPassage);
    const mine = putOnBattlefield(s, ap, bear());
    s.objects[mine]!.attacking = opp;
    expect(blockProblem(s, s.objects[putOnBattlefield(s, opp, bear({ name: "Bird", keywords: ["Flying"] }))]!, s.objects[mine]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[putOnBattlefield(s, opp, bear())]!, s.objects[mine]!)).toBeNull();
  });
});

describe("Curious Colossus", () => {
  it("each creature target opponent controls loses all abilities, becomes a Coward and is 1/1, for the rest of the game", () => {
    let { s, ap, ids, opp } = setup([curiousColossus]);
    const bird = putOnBattlefield(s, opp, bear({ name: "Bird", keywords: ["Flying"], power: "4", toughness: "4" }));
    s = untilPending(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(pt(s, bird)).toBe("1/1");
    expect(kw(s, bird, "Flying")).toBe(false);
    expect(characteristics(s, s.objects[bird]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Coward"]));
    // The creatures are locked in as it resolves (CR 611.2c): a later one is unaffected.
    const later = putOnBattlefield(s, opp, bear());
    expect(pt(s, later)).toBe("2/2");
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, bird)).toBe("1/1");
  });
});

describe("Subjugate the Hobbits", () => {
  it("gains control of each noncommander creature with mana value 3 or less", () => {
    let { s, ap, ids, opp } = setup([subjugateTheHobbits]);
    const small = putOnBattlefield(s, opp, bear({ cmc: 2 }));
    const big = putOnBattlefield(s, opp, bear({ name: "Big", manaCost: "{3}{G}{G}", cmc: 5 }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(controllerOf(s, s.objects[small]!)).toBe(ap);
    expect(controllerOf(s, s.objects[big]!)).toBe(opp);
  });
});

describe("afterlife", () => {
  it("Indebted Spirit bestowed: the enchanted creature dies with afterlife 1, and the Spirit stays as a creature", () => {
    let { s, ap, ids } = setup([indebtedSpirit, shock]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { alt: "bestow" })));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/3");
    s.objects[b]!.damage = 1;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(named(s, ap, "Spirit Token").length).toBe(1);
  });
  it("Afterlife Insurance: your creatures gain afterlife 1 until end of turn, and you draw", () => {
    let { s, ap, ids } = setup([afterlifeInsurance, shock]);
    const b = putOnBattlefield(s, ap, bear());
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(named(s, ap, "Spirit Token").length).toBe(1);
  });
});

describe("Unquenchable Fury and Zodiac Dragon", () => {
  it("the Aura returns to its owner's hand when put into the graveyard from the battlefield", () => {
    let { s, ap, ids } = setup([unquenchableFury, shock]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, ids[0]!)).toBe("hand");
  });
  it("Zodiac Dragon may return to your hand when it dies", () => {
    let { s, ap, ids } = setup([shock]);
    const d = putOnBattlefield(s, ap, zodiacDragon);
    s.objects[d]!.damage = 7;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(d)])));
    expect(zone(s, d)).toBe("hand");
  });
});

describe("spells with {X} in their mana cost", () => {
  it("Zaxara makes a Hydra with X +1/+1 counters", () => {
    let { s, ap, ids, opp } = setup([blaze]);
    putOnBattlefield(s, ap, zaxaraTheExemplary);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3)));
    const hydra = named(s, ap, "Hydra Token");
    expect(hydra.length).toBe(1);
    expect(counters(s, hydra[0]!)).toBe(3);
  });
  it("Nev gets X counters for the first such spell each turn only", () => {
    let { s, ap, ids, opp } = setup([blaze, blaze]);
    const n = putOnBattlefield(s, ap, nevThePracticalDean);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 2)));
    expect(counters(s, n)).toBe(2);
    expect(kw(s, n, "Trample")).toBe(true);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, "auto", 1)));
    expect(counters(s, n)).toBe(2);
  });
  it("Lattice Library enters with X study counters and makes a Fractal with that many counters", () => {
    let { s, ap, ids } = setup([latticeLibrary]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(counters(s, ids[0]!, "study")).toBe(2);
    const f = named(s, ap, "Fractal Token");
    expect(f.length).toBe(1);
    expect(counters(s, f[0]!)).toBe(2);
  });
});

describe("Yuna's Whistle", () => {
  it("puts counters equal to the revealed creature card's mana value on target creature you control (CR 603.12)", () => {
    let { s, ap, ids } = setup([yunasWhistle]);
    const b = putOnBattlefield(s, ap, bear());
    const big = into(s, ap, bear({ name: "Big", manaCost: "{2}{G}{G}", cmc: 4 }), "library");
    into(s, ap, card("Forest", "Basic Land — Forest"), "library");
    s = untilPending(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(zone(s, big)).toBe("hand");
    expect(counters(s, b)).toBe(4);
  });
});

describe("Kabira Evangel", () => {
  it("you may choose a color; your Allies gain protection from it until end of turn", () => {
    let { s, ap, ids } = setup([kabiraEvangel]);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = may(s, true);
    expect(s.pending?.kind).toBe("chooseOption");
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: opts.find((o) => /red|^R$/i.test(o))! }));
    expect(kw(s, ids[0]!, "Protection from red")).toBe(true);
  });
});

describe("Zuko's Conviction", () => {
  it("kicked, the creature card goes onto the battlefield tapped instead", () => {
    let { s, ap, ids } = setup([zukosConviction]);
    const b = into(s, ap, bear(), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { kicks: [0] })));
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(true);
  });
  it("not kicked, it goes to your hand", () => {
    let { s, ap, ids } = setup([zukosConviction]);
    const b = into(s, ap, bear(), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
  });
});

describe("Feral Appetite", () => {
  it("exiling a creature card makes a Pest; a land card doesn't", () => {
    let { s, ap, opp } = setup([]);
    const fa = putOnBattlefield(s, ap, feralAppetite);
    const c = into(s, opp, bear(), "graveyard");
    const l = into(s, opp, card("Forest", "Basic Land — Forest"), "graveyard");
    s = resolveAll(run(s, planActivate(s, ap, fa, 0, [tgt(l)])));
    expect(zone(s, l)).toBe("exile");
    expect(named(s, ap, "Pest Token").length).toBe(0);
    s = resolveAll(run(s, planActivate(s, ap, fa, 0, [tgt(c)])));
    expect(named(s, ap, "Pest Token").length).toBe(1);
  });
});

describe("Emissary Escort", () => {
  it("gets +X/+0 for the greatest mana value among other artifacts you control", () => {
    const { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, emissaryEscort);
    expect(pt(s, e)).toBe("0/4");
    putOnBattlefield(s, ap, card("Rock", "Artifact", "{3}", { cmc: 3 }));
    putOnBattlefield(s, ap, card("Pebble", "Artifact", "{1}", { cmc: 1 }));
    invalidateCharacteristics(s);
    expect(pt(s, e)).toBe("3/4");
  });
});

describe("Sylvan Advocate", () => {
  it("with six or more lands, it and land creatures you control get +2/+2", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, sylvanAdvocate);
    const dryad = putOnBattlefield(s, ap, card("Dryad Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" }));
    expect(pt(s, a)).toBe("4/5");
    expect(pt(s, dryad)).toBe("3/3");
  });
});

describe("The Notary Hobbits", () => {
  it("creates two nonlegendary token copies when cast", () => {
    let { s, ap, ids } = setup([theNotaryHobbits]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, ap, "The Notary Hobbits").length).toBe(3);
  });
});

describe("Scarecrone and Resistance Is Futile", () => {
  it("Scarecrone returns an artifact creature card, not a plain creature card", () => {
    let { s, ap } = setup([]);
    const sc = putOnBattlefield(s, ap, scarecrone);
    const plain = into(s, ap, bear(), "graveyard");
    const golem = into(s, ap, card("Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" }), "graveyard");
    expect(planActivate(s, ap, sc, 1, [tgt(plain)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, sc, 1, [tgt(golem)])));
    expect(zone(s, golem)).toBe("battlefield");
  });
  it("Resistance Is Futile's second mode returns an artifact creature card with mana value 3 or less", () => {
    let { s, ap, ids } = setup([resistanceIsFutile]);
    const golem = into(s, ap, card("Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(golem)], [1])));
    expect(zone(s, golem)).toBe("battlefield");
  });
});

describe("Ferrafor, Young Yew", () => {
  it("creates a Saproling for each counter among creatures target player controls", () => {
    let { s, ap, ids, opp } = setup([ferraforYoungYew]);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[b]!.counters["+1/+1"] = 2;
    s.objects[b]!.counters.shield = 1;
    s = untilPending(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(named(s, ap, "Saproling Token").length).toBe(3);
  });
});

describe("Full Moon's Rise", () => {
  it("regenerates all Werewolf creatures you control", () => {
    let { s, ap, ids } = setup([shock]);
    const fm = putOnBattlefield(s, ap, fullMoonsRise);
    const w = putOnBattlefield(s, ap, bear({ name: "Wolfy", subtypes: ["Werewolf"] }));
    expect(pt(s, w)).toBe("3/2");
    expect(kw(s, w, "Trample")).toBe(true);
    s = resolveAll(run(s, planActivate(s, ap, fm, 0)));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    expect(zone(s, w)).toBe("battlefield");
    expect(s.objects[w]!.tapped).toBe(true);
  });
});

describe("Unseal the Necropolis", () => {
  it("each player mills three, then you return up to two creature cards", () => {
    let { s, ap, ids } = setup([unsealTheNecropolis]);
    const c1 = into(s, ap, bear({ name: "One" }), "graveyard");
    const c2 = into(s, ap, bear({ name: "Two" }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    s = untilPending(s);
    expect(s.turnOrder.every((p) => s.players[p]!.graveyard.length >= 3)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [c1, c2] }));
    expect(zone(s, c1)).toBe("hand");
    expect(zone(s, c2)).toBe("hand");
  });
});

describe("Redcap Gutter-Dweller", () => {
  it("at upkeep you may sacrifice another creature: a +1/+1 counter, and you may play the top card this turn", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, redcapGutterdweller);
    const fodder = putOnBattlefield(s, ap, bear());
    const top = into(s, ap, bear({ name: "Top" }), "library");
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 3) % 4]!);
    s = untilPending(passUntil(s, "upkeep", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, source: "Redcap Gutter-Dweller" });
    s = resolveAll(may(s, true));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(counters(s, r)).toBe(1);
    expect(zone(s, top)).toBe("exile");
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, top)).not.toBeNull();
  });
  it("declining does nothing", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, redcapGutterdweller);
    const fodder = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 3) % 4]!);
    s = resolveAll(untilPending(passUntil(s, "upkeep", ap)), false);
    expect(zone(s, fodder)).toBe("battlefield");
    expect(counters(s, r)).toBe(0);
  });
});

describe("Geometer's Arthropod", () => {
  it("looks at the top X cards and puts one into your hand", () => {
    let { s, ap, ids, opp } = setup([blaze]);
    putOnBattlefield(s, ap, geometersArthropod);
    s = untilPending(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3)));
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no choice");
    expect(p.cards.length).toBe(3);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [p.cards[1]!] }));
    expect(zone(s, p.cards[1]!)).toBe("hand");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([p.cards[0]!, p.cards[2]!].sort());
  });
});

describe("Nessian Wanderer", () => {
  it("constellation: may reveal a land card from the top three and put it into your hand", () => {
    let { s, ap, ids } = setup([ench()]);
    putOnBattlefield(s, ap, nessianWanderer);
    const land = into(s, ap, card("Forest", "Basic Land — Forest"), "library");
    s = untilPending(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", what: "a land card", min: 0, max: 1 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    expect(zone(s, land)).toBe("hand");
  });
});

describe("Owlin Spiralmancer", () => {
  it("may copy your first spell with {X} each turn", () => {
    let { s, ap, ids, opp } = setup([blaze]);
    putOnBattlefield(s, ap, owlinSpiralmancer);
    const life = s.players[opp]!.life;
    s = untilPending(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3)));
    s = resolveAll(may(s, true));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = resolveAll(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 6);
  });
});

describe("The Sackville-Bagginses", () => {
  it("may sacrifice another creature or artifact to draw a card and create a Treasure", () => {
    let { s, ap, ids } = setup([theSackvillebagginses]);
    const b = putOnBattlefield(s, ap, bear());
    s = untilPending(run(s, planCast(s, ap, ids[0]!)));
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(may(s, true));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(named(s, ap, "Treasure Token").length).toBe(1);
  });
});

describe("Wreck and Rebuild", () => {
  it("mills five, then you may put a land card from your graveyard onto the battlefield tapped", () => {
    let { s, ap, ids } = setup([wreckAndRebuild]);
    s = untilPending(run(s, planCast(s, ap, ids[0]!, undefined, [1])));
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no choice");
    expect(p).toMatchObject({ what: "a land card", min: 0, max: 1, fromGraveyard: "battlefield" });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [p.cards[0]!] }));
    expect(zone(s, p.cards[0]!)).toBe("battlefield");
    expect(s.objects[p.cards[0]!]!.tapped).toBe(true);
  });
});
