// Round 173: the most played cards still unsupported, in popularity order, from Godsend (rank 7,725) on.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, castProblem, destroyPermanent, objHasKeyword, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objIsType, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ctl = (s: GameState, id: string) => controllerOf(s, s.objects[id]!);
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** Players pass until `pid` has priority, in this step. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
void [characteristics, objIsType, botActions, attack, swamp, forest, castProblem];

// Real oracle text (Scryfall).
const adaptiveTrainingPost = card("Adaptive Training Post", "Artifact", "{2}{U}", {cmc: 3,oracleText: "Whenever you cast an instant or sorcery spell, if this artifact has fewer than three charge counters on it, put a charge counter on it.\nRemove three charge counters from this artifact: When you next cast an instant or sorcery spell this turn, copy it and you may choose new targets for the copy."});
const adarkarValkyrie = card("Adarkar Valkyrie", "Snow Creature — Angel", "{4}{W}{W}", {cmc: 6,power: "4",toughness: "5",keywords: ["Flying","Vigilance"],oracleText: "Flying, vigilance\n{T}: When target creature other than this creature dies this turn, return that card to the battlefield under your control."});
const admonitionAngel = card("Admonition Angel", "Creature — Angel", "{3}{W}{W}{W}", {cmc: 6,power: "6",toughness: "6",keywords: ["Landfall","Flying"],oracleText: "Flying\nLandfall — Whenever a land you control enters, you may exile target nonland permanent other than this creature.\nWhen this creature leaves the battlefield, return all cards exiled with it to the battlefield under their owners' control."});
const avariceTotem = card("Avarice Totem", "Artifact", "{1}", {cmc: 1,oracleText: "{5}: Exchange control of this artifact and target nonland permanent."});
const blizzardStrix = card("Blizzard Strix", "Snow Creature — Bird", "{4}{U}", {cmc: 5,power: "3",toughness: "2",keywords: ["Flying","Flash"],oracleText: "Flash\nFlying\nWhen this creature enters, if you control another snow permanent, exile target permanent other than this creature. Return that card to the battlefield under its owner's control at the beginning of the next end step."});
const chandraSparkHunter = card("Chandra, Spark Hunter", "Legendary Planeswalker — Chandra", "{3}{R}", {cmc: 4,loyalty: "4",oracleText: "At the beginning of combat on your turn, choose up to one target Vehicle you control. Until end of turn, it becomes an artifact creature and gains haste.\n+2: You may sacrifice an artifact or discard a card. If you do, draw a card.\n0: Create a 3/2 colorless Vehicle artifact token with crew 1.\n−7: You get an emblem with \"Whenever an artifact you control enters, this emblem deals 3 damage to any target.\""});
const contractHero = card("Contract Hero", "Creature — Human Mercenary Hero", "{2}{R}", {cmc: 3,power: "2",toughness: "3",keywords: ["Treasure"],oracleText: "When this creature enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nWhenever this creature attacks, you may sacrifice an artifact or discard a card. If you do, this creature gets +2/+0 until end of turn."});
const councilOfEchoes = card("Council of Echoes", "Creature — Spirit Advisor", "{4}{U}{U}", {cmc: 6,power: "4",toughness: "4",keywords: ["Flying","Descend"],oracleText: "Flying\nDescend 4 — When this creature enters, if there are four or more permanent cards in your graveyard, return up to one target nonland permanent other than this creature to its owner's hand."});
const cryptLurker = card("Crypt Lurker", "Creature — Horror", "{3}{B}", {cmc: 4,power: "3",toughness: "4",oracleText: "When this creature enters, you may sacrifice a creature or discard a creature card. If you do, draw a card."});
const dovinHandOfControl = card("Dovin, Hand of Control", "Legendary Planeswalker — Dovin", "{2}{W/U}", {cmc: 3,loyalty: "5",oracleText: "Artifact, instant, and sorcery spells your opponents cast cost {1} more to cast.\n−1: Until your next turn, prevent all damage that would be dealt to and dealt by target permanent an opponent controls."});
const elegantEntourage = card("Elegant Entourage", "Creature — Elf Druid", "{3}{G}", {cmc: 4,power: "4",toughness: "4",keywords: ["Alliance"],oracleText: "Alliance — Whenever another creature you control enters, target creature other than this creature gets +1/+1 and gains trample until end of turn."});
const eyesEverywhere = card("Eyes Everywhere", "Enchantment", "{2}{U}", {cmc: 3,keywords: ["Scry"],oracleText: "At the beginning of your upkeep, scry 1.\n{5}{U}: Exchange control of this enchantment and target nonland permanent. Activate only as a sorcery."});
const finalwordPhantom = card("Final-Word Phantom", "Creature — Spirit Detective", "{2}{U}", {cmc: 3,power: "1",toughness: "4",keywords: ["Flying","Flash"],oracleText: "Flash\nFlying\nDuring each opponent's end step, you may cast spells as though they had flash."});
const floodpitsDrowner = card("Floodpits Drowner", "Creature — Merfolk", "{1}{U}", {cmc: 2,power: "2",toughness: "1",keywords: ["Vigilance","Flash"],oracleText: "Flash\nVigilance\nWhen this creature enters, tap target creature an opponent controls and put a stun counter on it.\n{1}{U}, {T}: Shuffle this creature and target creature with a stun counter on it into their owners' libraries."});
const gethLordOfTheVault = card("Geth, Lord of the Vault", "Legendary Creature — Phyrexian Zombie", "{4}{B}{B}", {cmc: 6,power: "5",toughness: "5",keywords: ["Mill","Intimidate"],oracleText: "Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\n{X}{B}: Put target artifact or creature card with mana value X from an opponent's graveyard onto the battlefield tapped under your control. Then that player mills X cards."});
const gryffsBoon = card("Gryff's Boon", "Enchantment — Aura", "{W}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature gets +1/+0 and has flying.\n{3}{W}: Return this card from your graveyard to the battlefield attached to target creature. Activate only as a sorcery."});
const kunlunWarrior = card("K'un-Lun Warrior", "Creature — Human Warrior Hero", "{1}{R}", {cmc: 2,power: "2",toughness: "2",oracleText: "When this creature enters, you may sacrifice an artifact or discard a card. If you do, draw a card."});
const kioraTheCrashingWave = card("Kiora, the Crashing Wave", "Legendary Planeswalker — Kiora", "{2}{G}{U}", {cmc: 4,loyalty: "2",oracleText: "+1: Until your next turn, prevent all damage that would be dealt to and dealt by target permanent an opponent controls.\n−1: Draw a card. You may play an additional land this turn.\n−5: You get an emblem with \"At the beginning of your end step, create a 9/9 blue Kraken creature token.\""});
const kitsuneDragonsDaughter = card("Kitsune, Dragon's Daughter", "Legendary Creature — Fox Warlock Avatar", "{4}{U}{U}", {cmc: 6,power: "6",toughness: "6",keywords: ["Vigilance"],oracleText: "Vigilance\nWhenever Kitsune enters or deals combat damage to a player, you may exchange control of two other target creatures controlled by different players."});
const leadershipVacuum = card("Leadership Vacuum", "Instant", "{2}{U}", {cmc: 3,oracleText: "Target player returns each commander they control from the battlefield to the command zone.\nDraw a card."});
const madblindMountain = card("Madblind Mountain", "Land — Mountain", "", {cmc: 0,oracleText: "({T}: Add {R}.)\nThis land enters tapped.\n{R}, {T}: Shuffle your library. Activate only if you control two or more red permanents."});
const memorialVault = card("Memorial Vault", "Artifact", "{3}{R}", {cmc: 4,oracleText: "{T}, Sacrifice another artifact: Exile the top X cards of your library, where X is one plus the mana value of the sacrificed artifact. You may play those cards this turn."});
const mercurialChemister = card("Mercurial Chemister", "Creature — Human Wizard", "{3}{U}{R}", {cmc: 5,power: "2",toughness: "3",oracleText: "{U}, {T}: Draw two cards.\n{R}, {T}, Discard a card: This creature deals damage to target creature equal to the discarded card's mana value."});
const morbidCuriosity = card("Morbid Curiosity", "Sorcery", "{1}{B}{B}", {cmc: 3,oracleText: "As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw cards equal to the mana value of the sacrificed permanent."});
const myrMindservant = card("Myr Mindservant", "Artifact Creature — Myr", "{1}", {cmc: 1,power: "1",toughness: "1",oracleText: "{2}, {T}: Shuffle your library."});
const ninjasBlades = card("Ninja's Blades", "Artifact — Equipment", "{2}{B}", {cmc: 3,keywords: ["Job select","Equip","Mutsunokami"],oracleText: "Job select\nEquipped creature gets +1/+1, is a Ninja in addition to its other types, and has \"Whenever this creature deals combat damage to a player, draw a card, then discard a card. That player loses life equal to the discarded card's mana value.\"\nMutsunokami — Equip {2}"});
const obekaBruteChronologist = card("Obeka, Brute Chronologist", "Legendary Creature — Ogre Wizard", "{1}{U}{B}{R}", {cmc: 4,power: "3",toughness: "4",oracleText: "{T}: The player whose turn it is may end the turn. (Exile all spells and abilities from the stack. The player whose turn it is discards down to their maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)"});
const phyrexianInfiltrator = card("Phyrexian Infiltrator", "Creature — Phyrexian Minion", "{2}{B}", {cmc: 3,power: "2",toughness: "2",oracleText: "{2}{U}{U}: Exchange control of this creature and target creature. (This effect lasts indefinitely.)"});
const rapidAugmenter = card("Rapid Augmenter", "Creature — Otter Artificer", "{1}{U}{R}", {cmc: 3,power: "1",toughness: "3",keywords: ["Haste"],oracleText: "Haste\nWhenever another creature you control with base power 1 enters, it gains haste until end of turn.\nWhenever another creature you control enters, if it wasn't cast, put a +1/+1 counter on this creature and this creature can't be blocked this turn."});
const recklessDetective = card("Reckless Detective", "Creature — Devil Detective", "{1}{R}", {cmc: 2,power: "0",toughness: "3",oracleText: "Whenever this creature attacks, you may sacrifice an artifact or discard a card. If you do, draw a card and this creature gets +2/+0 until end of turn."});
const repayInKind = card("Repay in Kind", "Sorcery", "{5}{B}{B}", {cmc: 7,oracleText: "Each player's life total becomes the lowest life total among all players."});
const serendibSorcerer = card("Serendib Sorcerer", "Creature — Human Wizard Sorcerer", "{1}{U}{U}", {cmc: 3,power: "1",toughness: "1",oracleText: "{T}: Target creature other than this creature has base power and toughness 0/2 until end of turn."});
const shiftingBorders = card("Shifting Borders", "Instant — Arcane", "{3}{U}", {cmc: 4,keywords: ["Splice"],oracleText: "Exchange control of two target lands.\nSplice onto Arcane {3}{U} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)"});
const shiftingGrift = card("Shifting Grift", "Sorcery", "{U}{U}", {cmc: 2,keywords: ["Spree"],oracleText: "Spree (Choose one or more additional costs.)\n+ {2} — Exchange control of two target creatures.\n+ {1} — Exchange control of two target artifacts.\n+ {1} — Exchange control of two target enchantments."});
const shreddersTechnique = card("Shredder's Technique", "Sorcery", "{2}{B}", {cmc: 3,keywords: ["Sneak"],oracleText: "Sneak {B} (You may cast this spell for {B} if you also return an unblocked attacker you control to hand during the declare blockers step.)\nDestroy target creature or enchantment. If an enchantment was destroyed this way, you lose 2 life."});
const slumberingTora = card("Slumbering Tora", "Artifact", "{3}", {cmc: 3,oracleText: "{2}, Discard a Spirit or Arcane card: This artifact becomes an X/X Cat artifact creature until end of turn, where X is the discarded card's mana value."});
const soothsaying = card("Soothsaying", "Enchantment", "{U}", {cmc: 1,oracleText: "{3}{U}{U}: Shuffle your library.\n{X}: Look at the top X cards of your library, then put them back in any order."});
const sorceressQueen = card("Sorceress Queen", "Creature — Human Wizard Sorcerer", "{1}{B}{B}", {cmc: 3,power: "1",toughness: "1",oracleText: "{T}: Target creature other than this creature has base power and toughness 0/2 until end of turn."});
const sorinTheMirthless = card("Sorin the Mirthless", "Legendary Planeswalker — Sorin", "{2}{B}{B}", {cmc: 4,loyalty: "4",oracleText: "+1: Look at the top card of your library. You may reveal that card and put it into your hand. If you do, you lose life equal to its mana value.\n−2: Create a 2/3 black Vampire creature token with flying and lifelink.\n−7: Sorin deals 13 damage to any target. You gain 13 life."});
const spellboundDragon = card("Spellbound Dragon", "Creature — Dragon", "{3}{U}{R}", {cmc: 5,power: "3",toughness: "5",keywords: ["Flying"],oracleText: "Flying\nWhenever this creature attacks, draw a card, then discard a card. This creature gets +X/+0 until end of turn, where X is the discarded card's mana value."});
const stasis = card("Stasis", "Enchantment", "{1}{U}", {cmc: 2,oracleText: "Players skip their untap steps.\nAt the beginning of your upkeep, sacrifice this enchantment unless you pay {U}."});
const surveyorsScope = card("Surveyor's Scope", "Artifact", "{2}", {cmc: 2,oracleText: "{T}, Exile this artifact: Search your library for up to X basic land cards, where X is the number of players who control at least two more lands than you. Put those cards onto the battlefield, then shuffle."});
const switcheroo = card("Switcheroo", "Sorcery", "{4}{U}", {cmc: 5,oracleText: "Exchange control of two target creatures."});
const thatWhichWasTaken = card("That Which Was Taken", "Legendary Artifact", "{5}", {cmc: 5,oracleText: "{4}, {T}: Put a divinity counter on target permanent other than That Which Was Taken.\nEach permanent with a divinity counter on it has indestructible."});
const vampireGourmand = card("Vampire Gourmand", "Creature — Vampire", "{1}{B}", {cmc: 2,power: "2",toughness: "2",oracleText: "Whenever this creature attacks, you may sacrifice another creature. If you do, draw a card and this creature can't be blocked this turn."});
const visionOfLove = card("Vision of Love", "Instant", "{1}{R}", {cmc: 2,oracleText: "You may sacrifice an artifact or discard a card. If you do, draw two cards."});
const volrathTheFallen = card("Volrath the Fallen", "Legendary Creature — Phyrexian Shapeshifter", "{3}{B}{B}{B}", {cmc: 6,power: "6",toughness: "4",oracleText: "{1}{B}, Discard a creature card: Volrath gets +X/+X until end of turn, where X is the discarded card's mana value."});
const weedprunerPoplar = card("Weed-Pruner Poplar", "Creature — Treefolk Assassin", "{4}{B}", {cmc: 5,power: "3",toughness: "3",oracleText: "At the beginning of your upkeep, target creature other than this creature gets -1/-1 until end of turn."});
const worldfire = card("Worldfire", "Sorcery", "{6}{R}{R}{R}", {cmc: 9,oracleText: "Exile all permanents. Exile all cards from all hands and graveyards. Each player's life total becomes 1."});

const djinnOfInfiniteDeceits = card("Djinn of Infinite Deceits", "Creature — Djinn", "{4}{U}{U}", {cmc: 6,power: "2",toughness: "7",keywords: ["Flying"],oracleText: "Flying\n{T}: Exchange control of two target nonlegendary creatures. You can't activate this ability during combat."});
const modifyMemory = card("Modify Memory", "Sorcery", "{4}{U}", {cmc: 5,oracleText: "Exchange control of two target creatures controlled by different players. If you control neither creature, draw three cards."});

describe("Round 173 cards", () => {
  it("are fully supported", () =>
    supported(adaptiveTrainingPost, adarkarValkyrie, admonitionAngel, avariceTotem, blizzardStrix, chandraSparkHunter, contractHero, councilOfEchoes, cryptLurker, dovinHandOfControl, elegantEntourage, eyesEverywhere, finalwordPhantom, floodpitsDrowner, gethLordOfTheVault, gryffsBoon, kunlunWarrior, kioraTheCrashingWave, kitsuneDragonsDaughter, leadershipVacuum, madblindMountain, memorialVault, mercurialChemister, morbidCuriosity, myrMindservant, ninjasBlades, obekaBruteChronologist, phyrexianInfiltrator, rapidAugmenter, recklessDetective, repayInKind, serendibSorcerer, shiftingBorders, shiftingGrift, shreddersTechnique, slumberingTora, soothsaying, sorceressQueen, sorinTheMirthless, spellboundDragon, stasis, surveyorsScope, switcheroo, thatWhichWasTaken, vampireGourmand, visionOfLove, volrathTheFallen, weedprunerPoplar, worldfire, djinnOfInfiniteDeceits, modifyMemory));
});

describe("Stasis", () => {
  it("players skip their untap steps (CR 502.1 is skipped entirely)", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, stasis);
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.tapped = true;
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.log.some((l) => /skip/i.test(l.text) && /untap/i.test(l.text))).toBe(true);
  });
});

describe("Repay in Kind and Worldfire", () => {
  it("Repay in Kind: each life total becomes the lowest", () => {
    let { s, ap, ids } = setup([repayInKind]);
    const [b, c, d] = [next(s, ap), next(s, next(s, ap)), next(s, next(s, next(s, ap)))];
    s.players[b]!.life = 31;
    s.players[c]!.life = 7;
    s.players[d]!.life = 52;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    for (const p of [ap, b, c, d]) expect(lifeOf(s, p)).toBe(7);
  });
  it("Worldfire exiles all permanents, hands and graveyards, and each life total becomes 1", () => {
    let { s, ap, ids, opp } = setup([worldfire, bear()]);
    const yard = into(s, opp, bear(), "graveyard");
    const theirs = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.battlefield.length).toBe(0);
    for (const p of s.turnOrder) {
      expect(s.players[p]!.hand.length).toBe(0);
      expect(lifeOf(s, p)).toBe(1);
    }
    expect(zone(s, yard)).toBe("exile");
    expect(zone(s, theirs)).toBe("exile");
    expect(zone(s, ids[1]!)).toBe("exile");
  });
});

describe("Obeka, Brute Chronologist", () => {
  it("{T}: the player whose turn it is may end the turn", () => {
    let { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, obekaBruteChronologist);
    s = run(s, planActivate(s, ap, o, 0));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.log.some((l) => /The turn ends/.test(l.text))).toBe(true);
  });
  it("on an opponent's turn, that player is asked, and a bot says no", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, opp, obekaBruteChronologist);
    s = priorityTo(s, opp);
    s = run(s, planActivate(s, opp, o, 0));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const turn = s.turn;
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.turn).toBe(turn);
    expect(s.step).toBe("main1");
  });
});

describe("exchanging control (CR 701.12b)", () => {
  it("Switcheroo swaps two creatures controlled by different players", () => {
    let { s, ap, ids, opp } = setup([switcheroo]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(mine), tgt(theirs)])));
    expect(ctl(s, mine)).toBe(opp);
    expect(ctl(s, theirs)).toBe(ap);
  });
  it("Switcheroo between two of one player's creatures does nothing", () => {
    let { s, ap, ids, opp } = setup([switcheroo]);
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect(ctl(s, a)).toBe(opp);
    expect(ctl(s, b)).toBe(opp);
  });
  it("Avarice Totem trades itself for target nonland permanent", () => {
    let { s, ap, opp } = setup([]);
    const totem = putOnBattlefield(s, ap, avariceTotem);
    const theirs = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planActivate(s, ap, totem, 0, [tgt(theirs)])));
    expect(ctl(s, totem)).toBe(opp);
    expect(ctl(s, theirs)).toBe(ap);
  });
  it("with the target gone, Phyrexian Infiltrator stays put", () => {
    let { s, ap, opp } = setup([]);
    const inf = putOnBattlefield(s, ap, phyrexianInfiltrator);
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planActivate(s, ap, inf, 0, [tgt(theirs)]));
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(theirs);
    invalidateCharacteristics(s);
    s = resolveAll(s);
    expect(ctl(s, inf)).toBe(ap);
  });
  it("Kitsune's targets must be other creatures controlled by different players", () => {
    let { s, ap, ids, opp } = setup([kitsuneDragonsDaughter]);
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    const mine = putOnBattlefield(s, ap, bear());
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(ids[0]!), tgt(b)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(b)] }));
    expect(ctl(s, mine)).toBe(opp);
    expect(ctl(s, b)).toBe(ap);
    expect(ctl(s, a)).toBe(opp);
  });
});

describe("Djinn of Infinite Deceits and Modify Memory", () => {
  it("Djinn: two nonlegendary creatures, never during combat", () => {
    let { s, ap, opp } = setup([]);
    const djinn = putOnBattlefield(s, ap, djinnOfInfiniteDeceits);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    const legend = putOnBattlefield(s, opp, card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", { cmc: 1, power: "2", toughness: "2" }));
    expect(planActivate(s, ap, djinn, 0, [tgt(mine), tgt(legend)])).toBeNull();
    s = attack(s, ap, [{ attacker: mine, defender: opp }]);
    s = priorityTo(s, ap);
    expect(planActivate(s, ap, djinn, 0, [tgt(mine), tgt(theirs)])).toBeNull();
    s = passUntil(s, "main2", ap);
    s = resolveAll(run(s, planActivate(s, ap, djinn, 0, [tgt(mine), tgt(theirs)])));
    expect(ctl(s, mine)).toBe(opp);
    expect(ctl(s, theirs)).toBe(ap);
  });
  it("Modify Memory: you draw three only if you control neither creature afterwards", () => {
    let { s, ap, ids, opp } = setup([modifyMemory, modifyMemory]);
    const c = next(s, opp);
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, c, bear());
    const mine = putOnBattlefield(s, ap, bear());
    let hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect(ctl(s, a)).toBe(c);
    expect(ctl(s, b)).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(mine), tgt(a)])));
    expect(ctl(s, a)).toBe(ap);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("Leadership Vacuum", () => {
  it("target player's commanders on the battlefield go to the command zone; you draw", () => {
    let { s, ap, ids, opp } = setup([leadershipVacuum]);
    const cmdr = putOnBattlefield(s, opp, bear({ name: "Their Commander" }), { commander: true });
    const other = putOnBattlefield(s, opp, bear());
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(zone(s, cmdr)).toBe("command");
    expect(zone(s, other)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
  });
});

describe("Admonition Angel", () => {
  it("landfall exiles target nonland permanent; when the Angel leaves, all of them return", () => {
    let { s, ap, ids, opp } = setup([forest]);
    const angel = putOnBattlefield(s, ap, admonitionAngel);
    const theirs = putOnBattlefield(s, opp, bear());
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(angel)] })).toThrow(); // "other than this creature"
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(zone(s, theirs)).toBe("exile");
    destroyPermanent(s, s.objects[angel]!, "test");
    s = resolveAll(s);
    const back = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && ctl(s, id) === opp);
    expect(back.length).toBe(1);
  });
});

describe("Sorin the Mirthless", () => {
  it("+1: you may reveal the top card and put it into your hand, losing life equal to its mana value", () => {
    let { s, ap } = setup([]);
    const sorin = putOnBattlefield(s, ap, sorinTheMirthless);
    s.objects[sorin]!.counters.loyalty = 4;
    const top = into(s, ap, switcheroo, "library");
    const life = lifeOf(s, ap);
    s = run(s, planActivate(s, ap, sorin, 0));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, top)).toBe("hand");
    expect(lifeOf(s, ap)).toBe(life - 5);
  });
  it("saying no leaves the card on top and costs no life", () => {
    let { s, ap } = setup([]);
    const sorin = putOnBattlefield(s, ap, sorinTheMirthless);
    s.objects[sorin]!.counters.loyalty = 4;
    const top = into(s, ap, switcheroo, "library");
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planActivate(s, ap, sorin, 0)), false);
    expect(s.players[ap]!.library[0]).toBe(top);
    expect(lifeOf(s, ap)).toBe(life);
  });
});

describe("Adarkar Valkyrie", () => {
  it("{T}: when target creature other than it dies this turn, it returns under your control", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, adarkarValkyrie);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(planActivate(s, ap, v, 0, [tgt(v)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, v, 0, [tgt(theirs)])));
    destroyPermanent(s, s.objects[theirs]!, "test");
    s = resolveAll(s);
    const back = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Their Bear");
    expect(back.length).toBe(1);
    expect(ctl(s, back[0]!)).toBe(ap);
    expect(s.objects[back[0]!]!.owner).toBe(opp);
  });
  it("the effect ends with the turn", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, adarkarValkyrie);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = resolveAll(run(s, planActivate(s, ap, v, 0, [tgt(theirs)])));
    s = passUntil(s, "upkeep", opp);
    destroyPermanent(s, s.objects[theirs]!, "test");
    s = resolveAll(s);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Their Bear")).toBe(false);
  });
});

describe("Gryff's Boon", () => {
  it("returns from your graveyard attached to target creature, as a sorcery", () => {
    let { s, ap } = setup([]);
    const boon = into(s, ap, gryffsBoon, "graveyard");
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, boon, 0, [tgt(b)])));
    expect(zone(s, boon)).toBe("battlefield");
    expect(s.objects[boon]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/2");
  });
});

describe("Final-Word Phantom", () => {
  it("during each opponent's end step you may cast spells as though they had flash", () => {
    let { s, ap, ids, opp } = setup([switcheroo]);
    putOnBattlefield(s, ap, finalwordPhantom);
    const a = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "main1", opp);
    s = priorityTo(s, ap);
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(mine)])).toBeNull();
    s = passUntil(s, "end", opp);
    s = priorityTo(s, ap);
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(mine)])).not.toBeNull();
  });
});

describe("Surveyor's Scope", () => {
  it("X is the number of players with at least two more lands than you", () => {
    let { s, ap, opp } = setup([]);
    const c = next(s, opp);
    const d = next(s, c);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, forest);
    putOnBattlefield(s, c, forest);
    const scope = putOnBattlefield(s, d, surveyorsScope);
    s = priorityTo(s, d);
    s = run(s, planActivate(s, d, scope, 0));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: d, max: 2 }); // ap (14) and opp (3), not c (1)
  });
});

describe("the discarded card's mana value", () => {
  it("Mercurial Chemister: a discard paid as a cost sets the damage", () => {
    let { s, ap, ids, opp } = setup([switcheroo]);
    const m = putOnBattlefield(s, ap, mercurialChemister);
    const big = putOnBattlefield(s, opp, bear({ name: "Big", power: "8", toughness: "8" }));
    s = resolveAll(run(s, planActivate(s, ap, m, 1, [tgt(big)], undefined, undefined, undefined, { discard: [ids[0]!] })));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.objects[big]!.damage).toBe(5);
  });
  it("Volrath the Fallen: +X/+X for the creature card discarded", () => {
    let { s, ap, ids } = setup([bear(), switcheroo]);
    const v = putOnBattlefield(s, ap, volrathTheFallen);
    expect(planActivate(s, ap, v, 0, undefined, undefined, undefined, undefined, { discard: [ids[1]!] })).toBeNull(); // not a creature card
    s = resolveAll(run(s, planActivate(s, ap, v, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] })));
    expect(pt(s, v)).toBe("8/6");
  });
  it("Spellbound Dragon: +X/+0 for the card it discards as it attacks", () => {
    let { s, ap, ids, opp } = setup([switcheroo]);
    const dragon = putOnBattlefield(s, ap, spellboundDragon);
    s = attack(s, ap, [{ attacker: dragon, defender: opp }]);
    for (let i = 0; i < 8 && s.pending?.kind !== "discard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [ids[0]!] }));
    expect(pt(s, dragon)).toBe("8/5");
  });
  it("Memorial Vault: exiles one plus the sacrificed artifact's mana value", () => {
    let { s, ap } = setup([]);
    const vault = putOnBattlefield(s, ap, memorialVault);
    const totem = putOnBattlefield(s, ap, card("Mind Stone", "Artifact", "{2}", { cmc: 2 }));
    const lib = s.players[ap]!.library.length;
    s = resolveAll(run(s, planActivate(s, ap, vault, 0, undefined, undefined, undefined, undefined, { sacrifice: [totem] })));
    expect(lib - s.players[ap]!.library.length).toBe(3);
  });
  it("Morbid Curiosity draws cards equal to the sacrificed permanent's mana value", () => {
    let { s, ap, ids } = setup([morbidCuriosity]);
    const v = putOnBattlefield(s, ap, volrathTheFallen);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { sacrifice: [v] })));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 6);
  });
});

describe("Shredder's Technique", () => {
  it("destroying an enchantment costs 2 life; a creature costs none", () => {
    let { s, ap, ids, opp } = setup([shreddersTechnique, shreddersTechnique]);
    const ench = putOnBattlefield(s, opp, stasis);
    const b = putOnBattlefield(s, opp, bear());
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(lifeOf(s, ap)).toBe(life);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(ench)])));
    expect(zone(s, ench)).toBe("graveyard");
    expect(lifeOf(s, ap)).toBe(life - 2);
  });
});

describe("Geth, Lord of the Vault", () => {
  it("{X}{B}: puts a card with mana value X from an opponent's graveyard onto the battlefield tapped; its owner mills X", () => {
    let { s, ap, opp } = setup([]);
    const geth = putOnBattlefield(s, ap, gethLordOfTheVault);
    const card2 = into(s, opp, bear(), "graveyard");
    const lib = s.players[opp]!.library.length;
    s = resolveAll(run(s, planActivate(s, ap, geth, 0, [tgt(card2)], undefined, undefined, 2)));
    const got = s.battlefield.find((id) => ctl(s, id) === ap && s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears");
    expect(got).toBeDefined();
    expect(s.objects[got!]!.tapped).toBe(true);
    expect(lib - s.players[opp]!.library.length).toBe(2);
  });
});

describe("Vision of Love", () => {
  it("you may sacrifice an artifact or discard a card; if you do, draw two", () => {
    let { s, ap, ids } = setup([visionOfLove, bear()]);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // No artifact to sacrifice: the discard is the only way.
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options.find((o) => /discard/i.test(o))! });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Kiora, the Crashing Wave", () => {
  it("+1: damage to and by target permanent an opponent controls is prevented until your next turn", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kioraTheCrashingWave);
    s.objects[k]!.counters.loyalty = 2;
    const theirs = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planActivate(s, ap, k, 0, [tgt(theirs)])));
    const life = lifeOf(s, ap);
    s = attack(s, opp, [{ attacker: theirs, defender: ap }]);
    s = passUntil(s, "end", opp);
    expect(lifeOf(s, ap)).toBe(life);
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    s = passUntil(s, "end", opp);
    expect(lifeOf(s, ap)).toBe(life - 2);
  });
});

describe("Floodpits Drowner", () => {
  it("taps and stuns on entering; {1}{U}, {T} shuffles itself and a stunned creature into their owners' libraries", () => {
    let { s, ap, ids, opp } = setup([floodpitsDrowner]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[theirs]!.counters.stun).toBe(1);
    const unstunned = putOnBattlefield(s, opp, bear());
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    expect(planActivate(s, ap, ids[0]!, 0, [tgt(unstunned)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, 0, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("library");
    expect(zone(s, ids[0]!)).toBe("library");
    expect(s.players[opp]!.library).toContain(theirs);
  });
});

describe("Rapid Augmenter", () => {
  it("another creature with base power 1 entering gains haste; one with another base power doesn't", () => {
    let { s, ap, ids } = setup([card("Elite Vanguard", "Creature — Human Soldier", "{W}", { cmc: 1, power: "1", toughness: "1" }), bear()]);
    putOnBattlefield(s, ap, rapidAugmenter);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[1]!]!, "Haste")).toBe(false);
  });
});

describe("Ninja's Blades", () => {
  it("the equipped creature's combat damage trigger: rummage, and that player loses the discarded card's mana value", () => {
    let { s, ap, ids, opp } = setup([switcheroo]);
    const blades = putOnBattlefield(s, ap, ninjasBlades);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[blades]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("3/3");
    expect(characteristics(s, s.objects[b]!).subtypes).toContain("Ninja");
    const life = lifeOf(s, opp);
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "discard"; i++)
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [ids[0]!] }));
    expect(lifeOf(s, opp)).toBe(life - 3 - 5);
  });
});

/** What the bot does with `id` in hand: its other actions (playing a land) taken first. */
const botCast = (s: GameState, pid: PlayerId, id: string) => {
  for (let i = 0; i < 6; i++) {
    const acts = botActions(s, pid);
    const c = acts.find((a) => a.type === "castSpell" && a.objectId === id);
    if (c || !acts.length || acts.some((a) => a.type === "passPriority")) return c as Extract<Action, { type: "castSpell" }> | undefined;
    s = run(s, acts);
    if (waitingOn(s) !== pid) return undefined;
  }
  return undefined;
};

describe("bots and exchanges of control", () => {
  it("a bot swaps its least useful creature for an opponent's much better one", () => {
    const { s, ap, ids, opp } = setup([switcheroo]);
    const mine = putOnBattlefield(s, ap, bear());
    const big = putOnBattlefield(s, opp, bear({ name: "Big", power: "7", toughness: "7" }));
    const cast = botCast(s, ap, ids[0]!);
    expect(cast).toBeDefined();
    expect(cast!.targets).toEqual(expect.arrayContaining([tgt(mine), tgt(big)]));
  });
  it("and doesn't when the swap gains it nothing", () => {
    const { s, ap, ids, opp } = setup([switcheroo]);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear());
    expect(botCast(s, ap, ids[0]!)).toBeUndefined();
  });
});
