// Round 174: the most played cards still unsupported, in popularity order, from Myojin of Cryptic Dreams (rank 7,760) on,
// and the cards that share their mechanics.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
void [botActions, objHasKeyword, toughness];

// Real oracle text (Scryfall).
const myojinOfCrypticDreams = card("Myojin of Cryptic Dreams", "Legendary Creature — Spirit", "{5}{U}{U}{U}", {cmc: 8,power: "3",toughness: "3",oracleText: "Myojin of Cryptic Dreams enters with an indestructible counter on it if you cast it from your hand.\nRemove an indestructible counter from Myojin of Cryptic Dreams: Copy target permanent spell you control three times. (The copies become tokens.)"});
const errantAndGiada = card("Errant and Giada", "Legendary Creature — Human Angel", "{1}{W}{U}", {cmc: 3,power: "2",toughness: "3",keywords: ["Flying","Flash"],oracleText: "Flash\nFlying\nYou may look at the top card of your library any time.\nYou may cast spells with flash or flying from the top of your library."});
const runadiBehemothCaller = card("Runadi, Behemoth Caller", "Legendary Creature — Cat Shaman", "{2}{G}", {cmc: 3,power: "1",toughness: "3",oracleText: "Whenever you cast a creature spell with mana value 5 or greater, that creature enters with X additional +1/+1 counters on it, where X is its mana value minus 4.\nCreatures you control with three or more +1/+1 counters on them have haste.\n{T}: Add {G}."});
const dontMove = card("Don't Move", "Sorcery", "{3}{W}{W}", {cmc: 5,oracleText: "Destroy all tapped creatures. Until your next turn, whenever a creature becomes tapped, destroy it."});
const recommission = card("Recommission", "Sorcery", "{1}{W}", {cmc: 2,oracleText: "Return target artifact or creature card with mana value 3 or less from your graveyard to the battlefield. If a creature enters this way, it enters with an additional +1/+1 counter on it."});
const arahboRoarOfTheWorld = card("Arahbo, Roar of the World", "Legendary Creature — Cat Avatar", "{3}{G}{W}", {cmc: 5,power: "5",toughness: "5",keywords: ["Eminence"],oracleText: "Eminence — At the beginning of combat on your turn, if Arahbo is in the command zone or on the battlefield, another target Cat you control gets +3/+3 until end of turn.\nWhenever another Cat you control attacks, you may pay {1}{G}{W}. If you do, it gains trample and gets +X/+X until end of turn, where X is its power."});
const titheTaker = card("Tithe Taker", "Creature — Human Soldier", "{1}{W}", {cmc: 2,power: "2",toughness: "1",keywords: ["Afterlife"],oracleText: "During your turn, spells your opponents cast cost {1} more to cast and abilities your opponents activate cost {1} more to activate unless they're mana abilities.\nAfterlife 1 (When this creature dies, create a 1/1 white and black Spirit creature token with flying.)"});
const signatureSlam = card("Signature Slam", "Instant", "{2}{G}", {cmc: 3,oracleText: "Put a +1/+1 counter on target creature you control, then each modified creature you control deals damage equal to its power to target creature you don't control. (Equipment, Auras you control, and counters are modifications.)"});
const bardClass = card("Bard Class", "Enchantment — Class", "{R}{G}", {cmc: 2,oracleText: "(Gain the next level as a sorcery to add its ability.)\nLegendary creatures you control enter with an additional +1/+1 counter on them.\n{R}{G}: Level 2\nLegendary spells you cast cost {R}{G} less to cast. This effect reduces only the amount of colored mana you pay.\n{3}{R}{G}: Level 3\nWhenever you cast a legendary spell, exile the top two cards of your library. You may play them this turn."});
const sageOfHours = card("Sage of Hours", "Creature — Human Wizard", "{1}{U}", {cmc: 2,power: "1",toughness: "1",keywords: ["Heroic"],oracleText: "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on it.\nRemove all +1/+1 counters from this creature: For each five counters removed this way, take an extra turn after this one."});
const moltenHydra = card("Molten Hydra", "Creature — Hydra", "{1}{R}", {cmc: 2,power: "1",toughness: "1",oracleText: "{1}{R}{R}: Put a +1/+1 counter on this creature.\n{T}, Remove all +1/+1 counters from this creature: It deals damage to any target equal to the number of +1/+1 counters removed this way."});
const vishKalBloodArbiter = card("Vish Kal, Blood Arbiter", "Legendary Creature — Vampire", "{4}{W}{B}{B}", {cmc: 7,power: "5",toughness: "5",keywords: ["Flying","Lifelink"],oracleText: "Flying, lifelink\nSacrifice a creature: Put X +1/+1 counters on Vish Kal, where X is the sacrificed creature's power.\nRemove all +1/+1 counters from Vish Kal: Target creature gets -1/-1 until end of turn for each +1/+1 counter removed this way."});
const cattibrieOfMithralHall = card("Catti-brie of Mithral Hall", "Legendary Creature — Human Archer", "{G}{W}", {cmc: 2,power: "2",toughness: "2",keywords: ["Reach","First strike"],oracleText: "Reach, first strike\nWhenever Catti-brie attacks, put a +1/+1 counter on it for each Equipment attached to it.\n{1}, Remove all +1/+1 counters from Catti-brie: It deals X damage to target attacking or blocking creature an opponent controls, where X is the number of counters removed this way."});
const essenceBottle = card("Essence Bottle", "Artifact", "{2}", {cmc: 2,oracleText: "{3}, {T}: Put an elixir counter on this artifact.\n{T}, Remove all elixir counters from this artifact: You gain 2 life for each elixir counter removed this way."});
const geometricNexus = card("Geometric Nexus", "Artifact", "{2}", {cmc: 2,oracleText: "Whenever a player casts an instant or sorcery spell, put a number of charge counters on this artifact equal to that spell's mana value.\n{6}, {T}, Remove all charge counters from this artifact: Create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it, where X is the number of charge counters removed this way."});
const jarOfEyeballs = card("Jar of Eyeballs", "Artifact", "{3}", {cmc: 3,oracleText: "Whenever a creature you control dies, put two eyeball counters on this artifact.\n{3}, {T}, Remove all eyeball counters from this artifact: Look at the top X cards of your library, where X is the number of eyeball counters removed this way. Put one of them into your hand and the rest on the bottom of your library in any order."});
const tortureChamber = card("Torture Chamber", "Artifact", "{3}", {cmc: 3,oracleText: "At the beginning of your upkeep, put a pain counter on this artifact.\nAt the beginning of your end step, this artifact deals damage to you equal to the number of pain counters on it.\n{1}, {T}, Remove all pain counters from this artifact: It deals damage to target creature equal to the number of pain counters removed this way."});
const cavesOfChaosAdventurer = card("Caves of Chaos Adventurer", "Creature — Human Barbarian", "{3}{R}", {cmc: 4,power: "5",toughness: "3",keywords: ["Trample"],oracleText: "Trample\nWhen this creature enters, you take the initiative.\nWhenever this creature attacks, exile the top card of your library. If you've completed a dungeon, you may play that card this turn without paying its mana cost. Otherwise, you may play that card this turn."});
const noxiousAssault = card("Noxious Assault", "Sorcery", "{3}{G}{G}", {cmc: 5,oracleText: "Creatures you control get +2/+2 until end of turn. Whenever a creature blocks this turn, its controller gets a poison counter."});
const theMistyMountainsCold = card("The Misty Mountains Cold", "Enchantment — Saga", "{2}{R}", {cmc: 3,keywords: ["Treasure"],oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II, III, IV — Create a Treasure token. Then if you control four or more Treasures, sacrifice this Saga. If you do, create a 6/6 red Dragon creature token with flying. (A Treasure token is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"});
const ariaOfFlame = card("Aria of Flame", "Enchantment", "{2}{R}", {cmc: 3,oracleText: "When this enchantment enters, each opponent gains 10 life.\nWhenever you cast an instant or sorcery spell, put a verse counter on this enchantment, then it deals damage equal to the number of verse counters on it to target player or planeswalker."});
const practicedScrollsmith = card("Practiced Scrollsmith", "Creature — Dwarf Cleric", "{R}{R/W}{W}", {cmc: 3,power: "3",toughness: "2",keywords: ["First strike"],oracleText: "First strike\nWhen this creature enters, exile target noncreature, nonland card from your graveyard. Until the end of your next turn, you may cast that card."});
const thorGodOfThunder = card("Thor, God of Thunder", "Legendary Creature — God Warrior Hero", "{3}{R}{R}", {cmc: 5,power: "5",toughness: "5",keywords: ["Flying"],oracleText: "Flying\nWhen Thor enters, exile target Equipment, instant, or sorcery card from your graveyard. Until the end of your next turn, you may play that card.\nWhenever you cast a noncreature spell, Thor deals damage equal to that spell's mana value to any target."});
const harnesserOfStorms = card("Harnesser of Storms", "Creature — Otter Wizard", "{2}{R}", {cmc: 3,power: "1",toughness: "4",oracleText: "Whenever you cast a noncreature or Otter spell, you may exile the top card of your library. Until end of turn, you may play that card. This ability triggers only once each turn."});
const staffOfTheDeathMagus = card("Staff of the Death Magus", "Artifact", "{3}", {cmc: 3,oracleText: "Whenever you cast a black spell or a Swamp you control enters, you gain 1 life."});
const staffOfTheFlameMagus = card("Staff of the Flame Magus", "Artifact", "{3}", {cmc: 3,oracleText: "Whenever you cast a red spell or a Mountain you control enters, you gain 1 life."});
const staffOfTheMindMagus = card("Staff of the Mind Magus", "Artifact", "{3}", {cmc: 3,oracleText: "Whenever you cast a blue spell or an Island you control enters, you gain 1 life."});
const staffOfTheSunMagus = card("Staff of the Sun Magus", "Artifact", "{3}", {cmc: 3,oracleText: "Whenever you cast a white spell or a Plains you control enters, you gain 1 life."});
const staffOfTheWildMagus = card("Staff of the Wild Magus", "Artifact", "{3}", {cmc: 3,oracleText: "Whenever you cast a green spell or a Forest you control enters, you gain 1 life."});
const ridersOfTheMark = card("Riders of the Mark", "Creature — Human Knight", "{6}{R}", {cmc: 7,power: "7",toughness: "4",keywords: ["Affinity","Haste","Trample"],oracleText: "Affinity for Humans (This spell costs {1} less to cast for each Human you control.)\nTrample, haste\nAt the beginning of your end step, if this creature attacked this turn, return it to its owner's hand. If you do, create a number of 1/1 white Human Soldier creature tokens equal to its toughness."});
const naliaDearnise = card("Nalia de'Arnise", "Legendary Creature — Human Rogue", "{1}{W}{B}", {cmc: 3,power: "3",toughness: "3",oracleText: "You may look at the top card of your library any time.\nYou may cast Cleric, Rogue, Warrior, and Wizard spells from the top of your library.\nAt the beginning of combat on your turn, if you have a full party, put a +1/+1 counter on each creature you control and those creatures gain deathtouch until end of turn."});
const alistairTheBrigadier = card("Alistair, the Brigadier", "Legendary Creature — Human Soldier", "{1}{G}{W}{U}", {cmc: 4,power: "3",toughness: "3",oracleText: "Whenever you cast a historic spell, create a 1/1 white Soldier creature token. (Artifacts, legendaries, and Sagas are historic.)\nWhenever Alistair attacks, you may pay {8}. If you do, creatures you control get +X/+X until end of turn, where X is the number of historic permanents you control."});
const championsDrake = card("Champion's Drake", "Creature — Drake", "{1}{U}", {cmc: 2,power: "1",toughness: "1",keywords: ["Flying"],oracleText: "Flying\nThis creature gets +3/+3 as long as you control a creature with three or more level counters on it."});
const echoMage = card("Echo Mage", "Creature — Human Wizard", "{1}{U}{U}", {cmc: 3,power: "2",toughness: "3",keywords: ["Level Up"],oracleText: "Level up {1}{U} ({1}{U}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-3\n2/4\n{U}{U}, {T}: Copy target instant or sorcery spell. You may choose new targets for the copy.\nLEVEL 4+\n2/5\n{U}{U}, {T}: Copy target instant or sorcery spell twice. You may choose new targets for the copies."});
const emberethSkyblazer = card("Embereth Skyblazer", "Creature — Human Knight", "{3}{R}", {cmc: 4,power: "4",toughness: "3",oracleText: "During your turn, this creature has flying.\nWhenever this creature attacks, you may pay {2}{R}. If you do, creatures you control get +X/+0 until end of turn, where X is the number of opponents you have."});
const kateStewart = card("Kate Stewart", "Legendary Creature — Human Scientist", "{1}{U}{R}{W}", {cmc: 4,power: "3",toughness: "3",oracleText: "Whenever you put one or more time counters on a permanent you control, create a 1/1 white Soldier creature token.\nWhenever Kate Stewart attacks, you may pay {8}. If you do, attacking creatures get +X/+X until end of turn, where X is the number of time counters among permanents you control."});
const returnedPastcaller = card("Returned Pastcaller", "Creature — Spirit Cleric", "{3}{R}{R/W}{W}", {cmc: 6,power: "4",toughness: "2",keywords: ["Flying"],oracleText: "Flying\nWhen this creature enters, return target Spirit, instant, or sorcery card from your graveyard to your hand."});
const howlpackPiper = card("Howlpack Piper", "Creature — Human Werewolf", "{3}{G}", {cmc: 4,power: "2",toughness: "2",keywords: ["Daybound"],oracleText: "This spell can't be countered.\n{1}{G}, {T}: You may put a creature card from your hand onto the battlefield. If it's a Wolf or Werewolf, untap this creature. Activate only as a sorcery.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)"});
const retrievePrey = card("Retrieve Prey", "Sorcery", "{1}{G}", {cmc: 2,oracleText: "Exile target creature card from your graveyard. Until the end of your next turn, you may cast that card."});
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const mountainCard = card("Mountain", "Basic Land — Mountain", "", { oracleText: "({T}: Add {R}.)" });
/** Players pass until `pid` has priority, in this step. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
/** Everyone passes until a question comes up. */
const untilPending = (s: GameState) => {
  for (let i = 0; i < 200 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const bolt = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
void [next, characteristics, objHasKeyword];

describe("Round 174 cards", () => {
  it("are fully supported", () =>
    supported(myojinOfCrypticDreams, errantAndGiada, runadiBehemothCaller, dontMove, recommission, arahboRoarOfTheWorld, titheTaker, signatureSlam, bardClass, sageOfHours, moltenHydra, vishKalBloodArbiter, cattibrieOfMithralHall, essenceBottle, geometricNexus, jarOfEyeballs, tortureChamber, cavesOfChaosAdventurer, noxiousAssault, theMistyMountainsCold, ariaOfFlame, practicedScrollsmith, thorGodOfThunder, harnesserOfStorms, staffOfTheDeathMagus, staffOfTheFlameMagus, staffOfTheMindMagus, staffOfTheSunMagus, staffOfTheWildMagus, ridersOfTheMark, naliaDearnise, alistairTheBrigadier, championsDrake, echoMage, emberethSkyblazer, kateStewart, returnedPastcaller, howlpackPiper, retrievePrey));
});

describe("Myojin of Cryptic Dreams", () => {
  it("copies target permanent spell you control three times (CR 707.10)", () => {
    let { s, ap, ids } = setup([bear()]);
    const m = putOnBattlefield(s, ap, myojinOfCrypticDreams);
    s.objects[m]!.counters.indestructible = 1;
    s = run(s, planCast(s, ap, ids[0]!));
    s = run(s, planActivate(s, ap, m, 0, [{ kind: "stack", id: s.stack.at(-1)!.id }]));
    expect(counters(s, m, "indestructible")).toBe(0);
    s = resolveAll(s);
    expect(named(s, ap, "Grizzly Bears").length).toBe(4);
  });
  it("enters with an indestructible counter only when cast from hand", () => {
    let { s, ap, ids } = setup([myojinOfCrypticDreams]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!, "indestructible")).toBe(1);
  });
});

describe("Errant and Giada", () => {
  it("casts a spell with flying or flash from the top of the library, but not one without", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, errantAndGiada);
    const flyer = into(s, ap, bear({ name: "Bird", keywords: ["Flying"] }), "library");
    expect(planCast(s, ap, flyer)).not.toBeNull();
    s = resolveAll(run(s, planCast(s, ap, flyer)));
    expect(zone(s, flyer)).toBe("battlefield");
    const ground = into(s, ap, bear(), "library");
    expect(planCast(s, ap, ground)).toBeNull();
  });
});

describe("Runadi, Behemoth Caller", () => {
  it("a creature spell of mana value 6 enters with 2 more counters; three counters give haste", () => {
    let { s, ap, ids } = setup([bear({ name: "Big", manaCost: "{4}{G}{G}", cmc: 6, power: "5", toughness: "5" })]);
    putOnBattlefield(s, ap, runadiBehemothCaller);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(2);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(false);
    s.objects[ids[0]!]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
  });
  it("a mana value 4 creature gets nothing", () => {
    let { s, ap, ids } = setup([bear({ name: "Mid", manaCost: "{2}{G}{G}", cmc: 4 })]);
    putOnBattlefield(s, ap, runadiBehemothCaller);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(0);
  });
});

describe("Don't Move", () => {
  it("destroys tapped creatures, then each creature that becomes tapped until your next turn", () => {
    let { s, ap, ids, opp } = setup([dontMove]);
    const tapped = putOnBattlefield(s, opp, bear());
    s.objects[tapped]!.tapped = true;
    const untapped = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, tapped)).toBe("graveyard");
    expect(zone(s, untapped)).toBe("battlefield");
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: untapped, defender: ap }] });
    s = resolveAll(s);
    expect(zone(s, untapped)).toBe("graveyard");
  });
});

describe("Recommission", () => {
  it("a creature returns with an additional +1/+1 counter", () => {
    let { s, ap, ids } = setup([recommission]);
    const b = into(s, ap, bear(), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(counters(s, b)).toBe(1);
  });
  it("a noncreature artifact gets no counter", () => {
    let { s, ap, ids } = setup([recommission]);
    const a = into(s, ap, card("Rock", "Artifact", "{2}", { cmc: 2 }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(zone(s, a)).toBe("battlefield");
    expect(counters(s, a)).toBe(0);
  });
});

describe("Arahbo, Roar of the World", () => {
  it("paying {1}{G}{W} when another Cat attacks gives trample and +X/+X, X its power then", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, arahboRoarOfTheWorld);
    const cat = putOnBattlefield(s, ap, bear({ name: "Cat", subtypes: ["Cat"], power: "2", toughness: "2" }));
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(cat)] }));
    // Eminence: +3/+3 on the only other Cat.
    expect(power(s, s.objects[cat]!)).toBe(5);
    s = attack(s, ap, [{ attacker: cat, defender: opp }]);
    s = resolveAll(s);
    expect(power(s, s.objects[cat]!)).toBe(10);
    expect(objHasKeyword(s, s.objects[cat]!, "Trample")).toBe(true);
  });
});

describe("Tithe Taker", () => {
  it("opponents' spells cost {1} more during your turn only", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, titheTaker);
    const shock = into(s, opp, bolt, "hand");
    putOnBattlefield(s, opp, mountainCard);
    s = priorityTo(s, opp);
    expect(planCast(s, opp, shock, [{ kind: "player", id: ap }])).toBeNull();
    putOnBattlefield(s, opp, mountainCard);
    expect(planCast(s, opp, shock, [{ kind: "player", id: ap }])).not.toBeNull();
  });
  it("not on the opponent's own turn, and not on my spells", () => {
    let { s, ap, ids, opp } = setup([bolt]);
    const mine = planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!.length;
    putOnBattlefield(s, ap, titheTaker);
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!.length).toBe(mine);
    const shock = into(s, opp, bolt, "hand");
    putOnBattlefield(s, opp, mountainCard);
    s = passUntil(s, "main1", opp);
    expect(planCast(s, opp, shock, [{ kind: "player", id: ap }])).not.toBeNull();
  });
});

describe("Signature Slam", () => {
  it("each modified creature you control deals damage equal to its power to the target", () => {
    let { s, ap, ids, opp } = setup([signatureSlam]);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear({ name: "Countered", power: "3", toughness: "3" }));
    s.objects[b]!.counters["+1/+1"] = 1;
    const plain = putOnBattlefield(s, ap, bear({ name: "Plain", power: "9", toughness: "9" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Wall", power: "0", toughness: "8" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(theirs)])));
    // 3 from the bear (now modified, 3/3) and 4 from the other; the unmodified 9/9 deals none.
    expect(s.objects[theirs]!.damage).toBe(7);
    expect(zone(s, plain)).toBe("battlefield");
  });
});

describe("Bard Class", () => {
  it("legendary creatures you control enter with an additional +1/+1 counter", () => {
    let { s, ap, ids } = setup([bear({ name: "Legend", supertypes: ["Legendary"] }), bear()]);
    putOnBattlefield(s, ap, bardClass);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, ids[0]!)).toBe(1);
    expect(counters(s, ids[1]!)).toBe(0);
  });
});

describe("Remove all counters (Sage of Hours, Molten Hydra, Vish Kal, Essence Bottle, Torture Chamber)", () => {
  it("Sage of Hours: twelve counters removed give two extra turns (one per five)", () => {
    let { s, ap } = setup([]);
    const sage = putOnBattlefield(s, ap, sageOfHours);
    s.objects[sage]!.counters["+1/+1"] = 12;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planActivate(s, ap, sage, 0)));
    expect(counters(s, sage)).toBe(0);
    expect(s.extraTurns?.length).toBe(2);
  });
  it("Sage of Hours: four counters give none", () => {
    let { s, ap } = setup([]);
    const sage = putOnBattlefield(s, ap, sageOfHours);
    s.objects[sage]!.counters["+1/+1"] = 4;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planActivate(s, ap, sage, 0)));
    expect(s.extraTurns?.length ?? 0).toBe(0);
  });
  it("a bot removes Sage of Hours' counters only with five or more", () => {
    const botMain = (n: number) => {
      let { s, ap } = setup([]);
      const sage = putOnBattlefield(s, ap, sageOfHours);
      s.objects[sage]!.counters["+1/+1"] = n;
      invalidateCharacteristics(s);
      // Bots use activated abilities in their second main phase.
      s = passUntil(s, "main2", ap);
      for (let i = 0; i < 40 && s.activePlayer === ap && s.step === "main2"; i++) {
        const pid = waitingOn(s)!;
        for (const a of botActions(s, pid)) s = act(s, a);
      }
      return { s, sage };
    };
    const four = botMain(4);
    expect(counters(four.s, four.sage)).toBe(4);
    const five = botMain(5);
    expect(counters(five.s, five.sage)).toBe(0);
    expect(five.s.extraTurns?.length).toBe(1);
  });
  it("Molten Hydra deals damage equal to the counters removed", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, moltenHydra);
    s.objects[h]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    const life = lifeOf(s, opp);
    s = resolveAll(run(s, planActivate(s, ap, h, 1, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(power(s, s.objects[h]!)).toBe(1);
  });
  it("Vish Kal: target creature gets -1/-1 for each counter removed", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, vishKalBloodArbiter);
    s.objects[v]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Big", power: "4", toughness: "4" }));
    s = resolveAll(run(s, planActivate(s, ap, v, 1, [tgt(theirs)])));
    expect(power(s, s.objects[theirs]!)).toBe(2);
    expect(toughness(s, s.objects[theirs]!)).toBe(2);
  });
  it("Essence Bottle gains 2 life per elixir counter; Torture Chamber deals its pain counters", () => {
    let { s, ap, opp } = setup([]);
    const bottle = putOnBattlefield(s, ap, essenceBottle);
    s.objects[bottle]!.counters.elixir = 3;
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planActivate(s, ap, bottle, 1)));
    expect(lifeOf(s, ap)).toBe(life + 6);
    const chamber = putOnBattlefield(s, ap, tortureChamber);
    s.objects[chamber]!.counters.pain = 2;
    const theirs = putOnBattlefield(s, opp, bear({ name: "Big", power: "4", toughness: "4" }));
    s = resolveAll(run(s, planActivate(s, ap, chamber, 0, [tgt(theirs)])));
    expect(s.objects[theirs]!.damage).toBe(2);
    expect(s.objects[chamber]!.counters.pain ?? 0).toBe(0);
  });
  it("Torture Chamber deals damage to you equal to its pain counters at your end step", () => {
    let { s, ap } = setup([]);
    const chamber = putOnBattlefield(s, ap, tortureChamber);
    s.objects[chamber]!.counters.pain = 3;
    const life = lifeOf(s, ap);
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(lifeOf(s, ap)).toBe(life - 3);
  });
});

describe("Caves of Chaos Adventurer", () => {
  it("without a completed dungeon, the exiled card may be played this turn, paying for it", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, cavesOfChaosAdventurer);
    const top = into(s, ap, bear(), "library");
    s = attack(s, ap, [{ attacker: c, defender: opp }]);
    s = resolveAll(s);
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    expect(s.objects[top]!.mayPlay?.free).toBeUndefined();
  });
  it("with a completed dungeon, for free", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.completedDungeons = ["Lost Mine of Phandelver"];
    const c = putOnBattlefield(s, ap, cavesOfChaosAdventurer);
    const top = into(s, ap, bear(), "library");
    s = attack(s, ap, [{ attacker: c, defender: opp }]);
    s = resolveAll(s);
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", free: true });
  });
});

describe("Noxious Assault", () => {
  it("whenever a creature blocks this turn, its controller gets a poison counter", () => {
    let { s, ap, ids, opp } = setup([noxiousAssault]);
    const mine = putOnBattlefield(s, ap, bear());
    const blocker = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(power(s, s.objects[mine]!)).toBe(4);
    s = attack(s, ap, [{ attacker: mine, defender: opp }]);
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: mine }] });
    s = resolveAll(s);
    expect(s.players[opp]!.poison).toBe(1);
  });
});

describe("The Misty Mountains Cold", () => {
  it("with four Treasures, it's sacrificed and a 6/6 Dragon is created", () => {
    let { s, ap, ids } = setup([theMistyMountainsCold]);
    const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, treasure);
    const id = ids[0]!;
    s = resolveAll(run(s, planCast(s, ap, id)));
    expect(zone(s, id)).toBe("graveyard");
    expect(named(s, ap, "Dragon Token").length).toBe(1);
  });
  it("with fewer, it stays", () => {
    let { s, ap, ids } = setup([theMistyMountainsCold]);
    const id = ids[0]!;
    s = resolveAll(run(s, planCast(s, ap, id)));
    expect(zone(s, id)).toBe("battlefield");
    expect(named(s, ap, "Dragon Token").length).toBe(0);
  });
});

describe("Aria of Flame", () => {
  it("each instant or sorcery adds a verse counter, then deals damage equal to the verse counters", () => {
    let { s, ap, ids, opp } = setup([bolt, bolt]);
    const aria = putOnBattlefield(s, ap, ariaOfFlame);
    const life = lifeOf(s, opp);
    for (const id of ids) {
      s = run(s, planCast(s, ap, id, [{ kind: "player", id: next(s, opp) }]));
      s = untilPending(s);
      expect(s.pending).toMatchObject({ kind: "chooseTargets" });
      s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    }
    expect(counters(s, aria, "verse")).toBe(2);
    expect(lifeOf(s, opp)).toBe(life - 3);
  });
});

describe("until the end of your next turn (Thor, Practiced Scrollsmith, Retrieve Prey)", () => {
  it("Practiced Scrollsmith exiles a noncreature card that may be cast until the end of your next turn", () => {
    let { s, ap, ids } = setup([practicedScrollsmith]);
    const spell = into(s, ap, bolt, "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    s = untilPending(s);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(spell)] });
    s = resolveAll(s);
    expect(zone(s, spell)).toBe("exile");
    expect(s.objects[spell]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
    expect(planCast(s, ap, spell, [{ kind: "player", id: next(s, ap) }])).not.toBeNull();
  });
  it("Thor: an Equipment card may be the target, and casting a noncreature spell deals its mana value", () => {
    let { s, ap, ids, opp } = setup([thorGodOfThunder, bolt]);
    const eq = into(s, ap, card("Sword", "Artifact — Equipment", "{3}", { cmc: 3, oracleText: "Equip {2}" }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(eq)] }));
    expect(zone(s, eq)).toBe("exile");
    expect(s.objects[eq]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
    const life = lifeOf(s, opp);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: next(s, opp) }]));
    s = untilPending(s);
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(lifeOf(s, opp)).toBe(life - 1);
  });
  it("Retrieve Prey: a creature card from your graveyard", () => {
    let { s, ap, ids } = setup([retrievePrey]);
    const b = into(s, ap, bear(), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[b]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
  });
});

describe("Harnesser of Storms", () => {
  it("a noncreature spell lets you exile the top card and play it this turn, once each turn", () => {
    let { s, ap, ids } = setup([bolt, bolt]);
    putOnBattlefield(s, ap, harnesserOfStorms);
    const top = into(s, ap, bear(), "library");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: next(s, ap) }])));
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    const second = into(s, ap, bear(), "library");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: next(s, ap) }])));
    expect(zone(s, second)).toBe("library");
  });
});

describe("Staff of the Death Magus", () => {
  it("a black spell or a Swamp entering gains you 1 life; another Swamp entering doesn't count for an opponent", () => {
    let { s, ap, ids, opp } = setup([bear({ name: "Black", manaCost: "{1}{B}", colors: ["B"] }), card("Swamp", "Basic Land — Swamp", "", { oracleText: "({T}: Add {B}.)" })]);
    putOnBattlefield(s, ap, staffOfTheDeathMagus);
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(lifeOf(s, ap)).toBe(life + 1);
    s = resolveAll(act(s, { type: "playLand", player: ap, objectId: ids[1]! }));
    expect(lifeOf(s, ap)).toBe(life + 2);
    putOnBattlefield(s, opp, card("Swamp", "Basic Land — Swamp", "", { oracleText: "({T}: Add {B}.)" }));
    s = resolveAll(s);
    expect(lifeOf(s, ap)).toBe(life + 2);
  });
});

describe("Riders of the Mark", () => {
  it("at your end step, if it attacked, it returns to hand and makes Human Soldiers equal to its toughness", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, ridersOfTheMark);
    s = attack(s, ap, [{ attacker: r, defender: opp }]);
    s = passUntil(resolveAll(s), "end", ap);
    s = resolveAll(s);
    expect(zone(s, r)).toBe("hand");
    expect(named(s, ap, "Human Soldier Token").length).toBe(4);
  });
  it("not if it didn't attack", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, ridersOfTheMark);
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(zone(s, r)).toBe("battlefield");
  });
});

describe("Nalia de'Arnise", () => {
  it("with a full party: a +1/+1 counter on each creature you control, and deathtouch until end of turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, naliaDearnise);
    const party = [
      bear({ name: "Cleric", subtypes: ["Cleric"] }),
      bear({ name: "Warrior", subtypes: ["Warrior"] }),
      bear({ name: "Wizard", subtypes: ["Wizard"] }),
    ].map((d) => putOnBattlefield(s, ap, d));
    s = untilPending(s);
    s = resolveAll(s);
    for (const id of party) {
      expect(counters(s, id)).toBe(1);
      expect(objHasKeyword(s, s.objects[id]!, "Deathtouch")).toBe(true);
    }
  });
});

describe("Howlpack Piper", () => {
  it("puts a creature card from hand onto the battlefield; a Wolf untaps it", () => {
    let { s, ap, ids } = setup([bear({ name: "Wolf", subtypes: ["Wolf"] })]);
    const p = putOnBattlefield(s, ap, howlpackPiper);
    s = run(s, planActivate(s, ap, p, 0));
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true });
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] });
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[p]!.tapped).toBe(false);
  });
  it("a creature that isn't a Wolf or Werewolf leaves it tapped", () => {
    let { s, ap, ids } = setup([bear()]);
    const p = putOnBattlefield(s, ap, howlpackPiper);
    s = untilPending(run(s, planActivate(s, ap, p, 0)));
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[p]!.tapped).toBe(true);
  });
});

describe("Champion's Drake and Geometric Nexus", () => {
  it("Champion's Drake gets +3/+3 while you control a creature with three or more level counters", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, championsDrake);
    const leveler = putOnBattlefield(s, ap, bear());
    s.objects[leveler]!.counters.level = 2;
    invalidateCharacteristics(s);
    expect(power(s, s.objects[d]!)).toBe(1);
    s.objects[leveler]!.counters.level = 3;
    invalidateCharacteristics(s);
    expect(power(s, s.objects[d]!)).toBe(4);
  });
  it("Geometric Nexus makes a Fractal with the charge counters removed", () => {
    let { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, geometricNexus);
    s.objects[n]!.counters.charge = 5;
    s = resolveAll(run(s, planActivate(s, ap, n, 0)));
    const [f] = named(s, ap, "Fractal Token");
    expect(f).toBeDefined();
    expect(counters(s, f!)).toBe(5);
    expect(s.objects[n]!.counters.charge ?? 0).toBe(0);
  });
});

// The second pass, further down the list.
const riskFactor = card("Risk Factor", "Instant", "{2}{R}", {cmc: 3,keywords: ["Jump","Jump-start"],oracleText: "Target opponent may have Risk Factor deal 4 damage to them. If that player doesn't, you draw three cards.\nJump-start (You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile this card.)"});
const whatMustBeDone = card("What Must Be Done", "Sorcery", "{3}{W}{W}", {cmc: 5,keywords: ["Release Juno","Let the World Burn"],oracleText: "Choose one —\n• Let the World Burn — Destroy all artifacts and creatures.\n• Release Juno — Return target historic permanent card from your graveyard to the battlefield. It enters with two additional +1/+1 counters on it if it's a creature. (Artifacts, legendaries, and Sagas are historic.)"});
const necklaceOfGirion = card("Necklace of Girion", "Legendary Artifact", "{2}{G}", {cmc: 3,oracleText: "Whenever you cast a green spell and whenever a Forest you control enters, put a +1/+1 counter on target creature you control.\n{T}: Add {G}."});
const savorTheMoment = card("Savor the Moment", "Sorcery", "{1}{U}{U}", {cmc: 3,oracleText: "Take an extra turn after this one. Skip the untap step of that turn."});
const uglkOfTheWhiteHand = card("Uglúk of the White Hand", "Legendary Creature — Orc Soldier", "{2}{B}{R}", {cmc: 4,power: "3",toughness: "3",oracleText: "Whenever another creature you control dies, put a +1/+1 counter on Uglúk. If that creature was a Goblin or Orc, put two +1/+1 counters on Uglúk instead."});
const midnightTilling = card("Midnight Tilling", "Instant", "{1}{G}", {cmc: 2,keywords: ["Mill"],oracleText: "Mill four cards, then you may return a permanent card from among them to your hand. (To mill four cards, put the top four cards of your library into your graveyard.)"});
const taxCollector = card("Tax Collector", "Creature — Human Advisor", "{1}{W}", {cmc: 2,power: "2",toughness: "2",keywords: ["Detain","Tax","Arrest"],oracleText: "When this creature enters, choose one —\n• Tax — Until your next turn, spells your opponents cast cost {1} more to cast.\n• Arrest — Detain target creature an opponent controls. (Until your next turn, that creature can't attack or block and its activated abilities can't be activated.)"});
const jadelightRanger = card("Jadelight Ranger", "Creature — Merfolk Scout Ranger", "{1}{G}{G}", {cmc: 3,power: "2",toughness: "1",keywords: ["Explore"],oracleText: "When this creature enters, it explores, then it explores again. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard. Then repeat this process.)"});
const overTheEdge = card("Over the Edge", "Sorcery", "{1}{G}", {cmc: 2,keywords: ["Explore"],oracleText: "Choose one —\n• Destroy target artifact or enchantment.\n• Target creature you control explores, then it explores again. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on that creature, then put the card back or put it into your graveyard. Then repeat this process.)"});
const defossilize = card("Defossilize", "Sorcery", "{4}{B}", {cmc: 5,keywords: ["Explore"],oracleText: "Return target creature card from your graveyard to the battlefield. That creature explores, then it explores again. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on that creature, then put the card back or put it into your graveyard. Then repeat this process.)"});
const land = (name: string, sub: string, mana: string) => card(name, `Basic Land — ${sub}`, "", { oracleText: `({T}: Add {${mana}}.)` });

describe("Round 174 cards, second pass", () => {
  it("are fully supported", () => supported(riskFactor, whatMustBeDone, necklaceOfGirion, savorTheMoment, uglkOfTheWhiteHand, midnightTilling, taxCollector, jadelightRanger, overTheEdge, defossilize));
});

describe("Risk Factor", () => {
  it("the opponent takes 4 damage, or you draw three cards; a bot with plenty of life takes the damage", () => {
    let { s, ap, ids, opp } = setup([riskFactor]);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const [life, hand] = [lifeOf(s, opp), s.players[ap]!.hand.length];
    s = resolveAll(act(s, botActions(s, opp)[0]!));
    expect(lifeOf(s, opp)).toBe(life - 4);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
  it("if they don't, you draw three", () => {
    let { s, ap, ids, opp } = setup([riskFactor]);
    s.players[opp]!.life = 12;
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = untilPending(s);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(act(s, botActions(s, opp)[0]!));
    expect(lifeOf(s, opp)).toBe(12);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
});

describe("What Must Be Done", () => {
  it("Release Juno: a historic creature returns with two additional +1/+1 counters; an artifact with none", () => {
    let { s, ap, ids } = setup([whatMustBeDone]);
    const legend = into(s, ap, bear({ name: "Legend", supertypes: ["Legendary"] }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(legend)], [1])));
    expect(zone(s, legend)).toBe("battlefield");
    expect(counters(s, legend)).toBe(2);
    let t = setup([whatMustBeDone]);
    const rock = into(t.s, t.ap, card("Rock", "Artifact", "{2}", { cmc: 2 }), "graveyard");
    t.s = resolveAll(run(t.s, planCast(t.s, t.ap, t.ids[0]!, [tgt(rock)], [1])));
    expect(zone(t.s, rock)).toBe("battlefield");
    expect(counters(t.s, rock)).toBe(0);
  });
});

describe("Necklace of Girion", () => {
  it("a green spell, and a Forest you control entering, each put a +1/+1 counter on target creature you control", () => {
    let { s, ap, ids } = setup([bear(), land("Forest", "Forest", "G")]);
    putOnBattlefield(s, ap, necklaceOfGirion);
    const mine = putOnBattlefield(s, ap, bear());
    s = run(s, planCast(s, ap, ids[0]!));
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] }));
    expect(counters(s, mine)).toBe(1);
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    s = untilPending(s);
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] }));
    expect(counters(s, mine)).toBe(2);
  });
});

describe("Savor the Moment", () => {
  it("an extra turn whose untap step is skipped (CR 614.10)", () => {
    let { s, ap, ids } = setup([savorTheMoment]);
    const tapped = putOnBattlefield(s, ap, bear());
    s.objects[tapped]!.tapped = true;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const turn = s.turn;
    s = passUntil(s, "upkeep");
    expect(s.activePlayer).toBe(ap);
    expect(s.turn).toBe(turn + 1);
    expect(s.objects[tapped]!.tapped).toBe(true);
    // Its next turn is a normal one.
    s = passUntil(s, "upkeep", next(s, ap));
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[tapped]!.tapped).toBe(false);
  });
});

describe("Uglúk of the White Hand", () => {
  it("one counter for another creature dying, two for a Goblin or Orc", () => {
    let { s, ap, ids } = setup([card("Doom", "Sorcery", "{B}", { cmc: 1, oracleText: "Destroy target creature." }), card("Doom", "Sorcery", "{B}", { cmc: 1, oracleText: "Destroy target creature." })]);
    const u = putOnBattlefield(s, ap, uglkOfTheWhiteHand);
    const bearId = putOnBattlefield(s, ap, bear());
    const goblin = putOnBattlefield(s, ap, bear({ name: "Goblin", subtypes: ["Goblin"] }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(bearId)])));
    expect(counters(s, u)).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(goblin)])));
    expect(counters(s, u)).toBe(3);
  });
});

describe("Midnight Tilling", () => {
  it("mills four, then a permanent card from among them may go to your hand", () => {
    let { s, ap, ids } = setup([midnightTilling]);
    const spell = into(s, ap, bolt, "library");
    const creature = into(s, ap, bear({ name: "Milled Bear" }), "library");
    s = run(s, planCast(s, ap, ids[0]!));
    s = untilPending(s);
    for (let i = 0; i < 5 && s.pending && s.pending.kind !== "searchLibrary"; i++) s = act(s, botActions(s, waitingOn(s)!)[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).not.toContain(spell);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [creature] }));
    expect(zone(s, creature)).toBe("hand");
    expect(zone(s, spell)).toBe("graveyard");
  });
});

describe("Tax Collector", () => {
  it("Tax: until your next turn, opponents' spells cost {1} more", () => {
    let { s, ap, ids, opp } = setup([taxCollector]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = untilPending(s);
    if (s.pending?.kind === "chooseModes") s = act(s, { type: "chooseModes", player: ap, modes: [0] } as Action);
    s = resolveAll(s);
    const shock = into(s, opp, bolt, "hand");
    putOnBattlefield(s, opp, mountainCard);
    s = passUntil(s, "main1", opp);
    expect(planCast(s, opp, shock, [{ kind: "player", id: ap }])).toBeNull();
    putOnBattlefield(s, opp, mountainCard);
    expect(planCast(s, opp, shock, [{ kind: "player", id: ap }])).not.toBeNull();
  });
});

describe("explores, then explores again (Jadelight Ranger, Over the Edge, Defossilize)", () => {
  it("two nonland cards on top: two counters, the second exploration revealing the new top card", () => {
    let { s, ap, ids } = setup([jadelightRanger]);
    const second = into(s, ap, bolt, "library");
    const first = into(s, ap, bear({ name: "Top" }), "library");
    s = run(s, planCast(s, ap, ids[0]!));
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(zone(s, first)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }), false);
    expect(zone(s, second)).toBe("library");
    expect(counters(s, ids[0]!)).toBe(2);
  });
  it("a nonland card kept on top is revealed again (rulings)", () => {
    let { s, ap, ids } = setup([overTheEdge]);
    const mine = putOnBattlefield(s, ap, bear());
    const top = into(s, ap, bear({ name: "Top" }), "library");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(mine)], [1]));
    s = untilPending(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }), false);
    expect(zone(s, top)).toBe("library");
    expect(counters(s, mine)).toBe(2);
  });
  it("Defossilize: the returned creature explores twice; lands go to hand", () => {
    let { s, ap, ids } = setup([defossilize]);
    const b = into(s, ap, bear(), "graveyard");
    const l2 = into(s, ap, land("Forest", "Forest", "G"), "library");
    const l1 = into(s, ap, land("Forest", "Forest", "G"), "library");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, l1)).toBe("hand");
    expect(zone(s, l2)).toBe("hand");
    expect(counters(s, b)).toBe(0);
  });
});
