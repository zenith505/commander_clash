// Lane B, round 37: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, nextRandom, objHasKeyword, planActivate, planCast, potentialAttackers, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Puts `def` onto the battlefield under `pid`, attached to `host`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
  return id;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** From an attack, to the defender's block declaration, which `blocks` makes. */
const blockWith = (s: GameState, defender: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "declareBlockers", player: defender });
  return act(s, { type: "declareBlockers", player: defender, blocks });
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};
/** Sets the game's random state so the next flips come out as `wins` (true: won). */
const rig = (s: GameState, ...wins: boolean[]) => {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
};
const kws = (s: GameState, id: string, kw: string) => objHasKeyword(s, s.objects[id]!, kw);
const colorsOf = (s: GameState, id: string) => [...characteristics(s, s.objects[id]!).colors].sort();

// Real oracle text (Scryfall).

// Real oracle text (Scryfall).
const shrineOfLimitlessPower = () => card("Shrine of Limitless Power", "Artifact", "{3}", { cmc: 3, colors: [], oracleText: "At the beginning of your upkeep and whenever you cast a black spell, put a charge counter on this artifact.\n{4}, {T}, Sacrifice this artifact: Target player discards a card for each charge counter on this artifact." });
const shrineOfBoundlessGrowth = () => card("Shrine of Boundless Growth", "Artifact", "{3}", { cmc: 3, colors: [], oracleText: "At the beginning of your upkeep and whenever you cast a green spell, put a charge counter on this artifact.\n{T}, Sacrifice this artifact: Add {C} for each charge counter on this artifact." });
const shrineOfPiercingVision = () => card("Shrine of Piercing Vision", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "At the beginning of your upkeep and whenever you cast a blue spell, put a charge counter on this artifact.\n{T}, Sacrifice this artifact: Look at the top X cards of your library, where X is the number of charge counters on this artifact. Put one of those cards into your hand and the rest on the bottom of your library in any order." });
const shrineOfBurningRage = () => card("Shrine of Burning Rage", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "At the beginning of your upkeep and whenever you cast a red spell, put a charge counter on this artifact.\n{3}, {T}, Sacrifice this artifact: It deals damage equal to the number of charge counters on it to any target." });
const shrineOfLoyalLegions = () => card("Shrine of Loyal Legions", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "At the beginning of your upkeep and whenever you cast a white spell, put a charge counter on this artifact.\n{3}, {T}, Sacrifice this artifact: Create a 1/1 colorless Phyrexian Myr artifact creature token for each charge counter on this artifact." });
const balefulStare = () => card("Baleful Stare", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Target opponent reveals their hand. You draw a card for each Mountain and red card in it." });
const witheringGaze = () => card("Withering Gaze", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Target opponent reveals their hand. You draw a card for each Forest and green card in it." });
const consignToDream = () => card("Consign to Dream", "Instant", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Return target permanent to its owner's hand. If that permanent is red or green, put it on top of its owner's library instead." });
const sweepAway = () => card("Sweep Away", "Instant", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Return target creature to its owner's hand. If that creature is attacking, you may put it on top of its owner's library instead." });
const frightfulDelusion = () => card("Frightful Delusion", "Instant", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Counter target spell unless its controller pays {1}. That player discards a card." });
const takeToTheStreets = () => card("Take to the Streets", "Sorcery", "{4}{G}", { cmc: 5, colors: ["G"], oracleText: "Creatures you control get +2/+2 until end of turn. Citizens you control get an additional +1/+1 and gain vigilance until end of turn." });
const searingBarb = () => card("Searing Barb", "Sorcery", "{2}{R}", { cmc: 3, colors: ["R"], keywords: ["Incubate", "Transform"], oracleText: "Searing Barb deals 2 damage to any target. If it's a creature, it can't block this turn. Incubate 1. (Create an Incubator token with a +1/+1 counter on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)" });
const oliviasMidnightAmbush = () => card("Olivia's Midnight Ambush", "Instant", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "Target creature gets -2/-2 until end of turn. If it's night, that creature gets -13/-13 until end of turn instead." });
const moonragersSlash = () => card("Moonrager's Slash", "Instant", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "This spell costs {2} less to cast if it's night.\nMoonrager's Slash deals 3 damage to any target." });
const wolfStrike = () => card("Wolf Strike", "Instant", "{2}{G}", { cmc: 3, colors: ["G"], oracleText: "Target creature you control gets +2/+0 until end of turn if it's night. Then it deals damage equal to its power to target creature you don't control." });
const essenceVortex = () => card("Essence Vortex", "Instant", "{1}{U}{B}", { cmc: 3, colors: ["B", "U"], oracleText: "Destroy target creature unless its controller pays life equal to its toughness. A creature destroyed this way can't be regenerated." });
const icyReception = () => card("Icy Reception", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Choose one —\n• Counter target creature or legendary spell unless its controller pays {3}.\n• Target creature gets -5/-0 until end of turn." });
const traitorsClutch = () => card("Traitor's Clutch", "Instant", "{4}{B}", { cmc: 5, colors: ["B"], keywords: ["Flashback"], oracleText: "Target creature gets +1/+0, becomes black, and gains shadow until end of turn. (It can block or be blocked by only creatures with shadow.)\nFlashback {1}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const soulParry = () => card("Soul Parry", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Prevent all damage one or two target creatures would deal this turn." });
const coneOfFlame = () => card("Cone of Flame", "Sorcery", "{3}{R}{R}", { cmc: 5, colors: ["R"], oracleText: "Cone of Flame deals 1 damage to any target, 2 damage to another target, and 3 damage to a third target." });
const pestilentHaze = () => card("Pestilent Haze", "Sorcery", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Choose one —\n• All creatures get -2/-2 until end of turn.\n• Remove two loyalty counters from each planeswalker." });
const reveka = () => card("Reveka, Wizard Savant", "Legendary Creature — Dwarf Wizard", "{2}{U}{U}", { cmc: 4, colors: ["U"], power: "0", toughness: "1", oracleText: "{T}: Reveka deals 2 damage to any target and doesn't untap during your next untap step." });
const machineMan = () => card("Machine Man, Model X-51", "Legendary Artifact Creature — Robot Hero", "{4}", { cmc: 4, colors: [], power: "2", toughness: "3", oracleText: "Whenever you cast a noncreature spell, put a +1/+1 counter on Machine Man and he gains flying until end of turn." });
const hobble = () => card("Hobble", "Enchantment — Aura", "{2}{W}", { cmc: 3, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature can't attack.\nEnchanted creature can't block if it's black." });
const guanYu = () => card("Guan Yu, Sainted Warrior", "Legendary Creature — Human Soldier Warrior", "{3}{W}{W}", { cmc: 5, colors: ["W"], power: "3", toughness: "5", keywords: ["Horsemanship"], oracleText: "Horsemanship (This creature can't be blocked except by creatures with horsemanship.)\nWhen Guan Yu is put into your graveyard from the battlefield, you may shuffle Guan Yu into your library." });
const persecute = () => card("Persecute", "Sorcery", "{2}{B}{B}", { cmc: 4, colors: ["B"], oracleText: "Choose a color. Target player reveals their hand and discards all cards of that color." });
const monomania = () => card("Monomania", "Sorcery", "{3}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "Target player chooses a card in their hand and discards the rest." });
const plagueRats = () => card("Plague Rats", "Creature — Rat", "{2}{B}", { cmc: 3, colors: ["B"], power: "*", toughness: "*", oracleText: "Plague Rats's power and toughness are each equal to the number of creatures named Plague Rats on the battlefield." });

const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{W}{W}", 2, 2, { cmc: 2, colors: ["W"] });
const blackKnight = () => creature("Black Knight", "Creature — Human Knight", "{B}{B}", 2, 2, { cmc: 2, colors: ["B"] });
const citizen = () => creature("Town Citizen", "Creature — Human Citizen", "{1}{G}", 1, 1, { cmc: 2, colors: ["G"] });
const blueWall = () => creature("Wall of Air", "Creature — Wall", "{1}{U}{U}", 1, 5, { cmc: 3, colors: ["U"] });
const legend = () => creature("Old Legend", "Legendary Creature — Human", "{3}", 3, 3, { cmc: 3, colors: [] });
const legendaryArtifact = () => card("Old Relic", "Legendary Artifact", "{3}", { cmc: 3, colors: [] });
const mindStone = () => card("Mind Stone", "Artifact", "{2}", { cmc: 2, colors: [] });
const walker = () => card("Test Walker", "Legendary Planeswalker — Jace", "{3}", { cmc: 3, colors: [], loyalty: "3" });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const duress = () => card("Duress", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card." });
const giantGrowth = () => card("Giant Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });
const ponder = () => card("Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Scry 1. Draw a card." });
const mountainCard = () => card("Mountain", "Basic Land — Mountain");
const forestCard = () => card("Forest", "Basic Land — Forest");
const islandCard = () => card("Island", "Basic Land — Island");
const goblin = () => creature("Goblin Piker", "Creature — Goblin Warrior", "{1}{R}", 2, 1, { cmc: 2, colors: ["R"] });

describe("Lane B round 37", () => {
  it("compiles every card fully", () => {
    supported(shrineOfBurningRage(), shrineOfLoyalLegions());
    supported(shrineOfLimitlessPower(), shrineOfBoundlessGrowth(), shrineOfPiercingVision(), balefulStare(), witheringGaze(), consignToDream(), sweepAway(), frightfulDelusion());
    supported(takeToTheStreets(), searingBarb(), oliviasMidnightAmbush(), moonragersSlash(), wolfStrike(), essenceVortex(), icyReception(), traitorsClutch());
    supported(soulParry(), coneOfFlame(), pestilentHaze(), reveka(), machineMan(), hobble(), guanYu(), plagueRats(), persecute(), monomania());
  });
});

describe("The Shrines", () => {
  it("get a charge counter at your upkeep and whenever you cast a spell of their color, not another color", () => {
    const { s: s0, ap, ids } = setup([murder(), giantGrowth(), ponder()]);
    const black = putOnBattlefield(s0, ap, shrineOfLimitlessPower());
    const green = putOnBattlefield(s0, ap, shrineOfBoundlessGrowth());
    const blue = putOnBattlefield(s0, ap, shrineOfPiercingVision());
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(putOnBattlefield(s0, ap, hillGiant()))]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(bear)]));
    const charge = (id: string) => s.objects[id]!.counters.charge ?? 0;
    expect([charge(black), charge(green), charge(blue)]).toEqual([1, 1, 0]);
    s = settle(castNow(s, ap, ids[2]!));
    expect([charge(black), charge(green), charge(blue)]).toEqual([1, 1, 1]);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect([charge(black), charge(green), charge(blue)]).toEqual([2, 2, 2]);
  });

  it("Shrine of Limitless Power: target player discards a card for each charge counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const shrine = putOnBattlefield(s0, ap, shrineOfLimitlessPower());
    s0.objects[shrine]!.counters.charge = 2;
    for (const d of [hillGiant(), greenBear(), mountainCard()]) toZone(s0, opp, d, "hand");
    const before = s0.players[opp]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, shrine, 0, [ply(opp)])));
    expect([s.players[opp]!.hand.length, zone(s, shrine)]).toEqual([before - 2, "graveyard"]);
  });

  it("Shrine of Burning Rage: damage equal to its charge counters as it last existed", () => {
    const { s: s0, ap, opp } = setup([]);
    const shrine = putOnBattlefield(s0, ap, shrineOfBurningRage());
    s0.objects[shrine]!.counters.charge = 4;
    const s = settle(run(s0, planActivate(s0, ap, shrine, 0, [ply(opp)])));
    expect([life(s, opp), zone(s, shrine)]).toEqual([36, "graveyard"]);
  });

  it("Shrine of Loyal Legions: a 1/1 Myr for each charge counter; a white spell adds one", () => {
    const { s: s0, ap, ids } = setup([card("Raise the Alarm", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Create two 1/1 white Soldier creature tokens." })]);
    const shrine = putOnBattlefield(s0, ap, shrineOfLoyalLegions());
    s0.objects[shrine]!.counters.charge = 2;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[shrine]!.counters.charge).toBe(3);
    s = settle(run(s, planActivate(s, ap, shrine, 0)));
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Myr")).length).toBe(3);
  });

  it("Shrine of Boundless Growth: {C} for each charge counter", () => {
    const { s: s0, ap } = setup([]);
    const shrine = putOnBattlefield(s0, ap, shrineOfBoundlessGrowth());
    s0.objects[shrine]!.counters.charge = 3;
    const s = settle(run(s0, planActivate(s0, ap, shrine, 0)));
    expect([s.players[ap]!.manaPool.C, zone(s, shrine)]).toEqual([3, "graveyard"]);
  });
});

describe("Revealed hands", () => {
  it("Baleful Stare: a card for each Mountain and red card in it, each card once", () => {
    const { s: s0, ap, ids, opp } = setup([balefulStare()]);
    emptyHand(s0, opp);
    for (const d of [mountainCard(), hillGiant(), goblin(), greenBear(), forestCard()]) toZone(s0, opp, d, "hand");
    const hand = s0.players[ap]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Withering Gaze: a card for each Forest and green card in it", () => {
    const { s: s0, ap, ids, opp } = setup([witheringGaze()]);
    emptyHand(s0, opp);
    for (const d of [mountainCard(), hillGiant(), greenBear(), forestCard(), forestCard()]) toZone(s0, opp, d, "hand");
    const hand = s0.players[ap]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });
});

describe("Discards", () => {
  it("Persecute: the target player discards every card of the chosen color, nothing else", () => {
    const { s: s0, ap, ids, opp } = setup([persecute()]);
    emptyHand(s0, opp);
    const red = [hillGiant(), goblin()].map((d) => toZone(s0, opp, d, "hand"));
    const others = [greenBear(), mountainCard()].map((d) => toZone(s0, opp, d, "hand"));
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), (x) => x.pending?.kind === "chooseOption" && x.pending.player === ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.options).toContain("Red");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    expect(s.players[opp]!.hand.sort()).toEqual(others.sort());
    for (const id of red) expect(zone(s, id)).toBe("graveyard");
  });

  it("Monomania: the target player keeps the card they choose and discards the rest", () => {
    const { s: s0, ap, ids, opp } = setup([monomania()]);
    emptyHand(s0, opp);
    const hand = [hillGiant(), goblin(), greenBear()].map((d) => toZone(s0, opp, d, "hand"));
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("discard", opp));
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 2 });
    s = settle(act(s, { type: "discard", player: opp, objectIds: [hand[0]!, hand[2]!] }));
    expect(s.players[opp]!.hand).toEqual([hand[1]]);
  });
});

describe("Bounce or the top of the library", () => {
  it("Consign to Dream: a red or green permanent goes on top of its owner's library, another to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([consignToDream(), consignToDream()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const wall = putOnBattlefield(s0, opp, blueWall());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect([zone(s, giant), s.players[opp]!.library[0]]).toEqual(["library", giant]);
    s.players[ap]!.manaPool = { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 };
    s = settle(castNow(s, ap, ids[1]!, [tgt(wall)]));
    expect(zone(s, wall)).toBe("hand");
  });

  it("Sweep Away: you may put an attacking creature on top of its owner's library; one not attacking goes to the hand", () => {
    const { s: s0, ap, ids, opp } = setup([]);
    emptyHand(s0, opp);
    const sweep = toZone(s0, opp, sweepAway(), "hand");
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const bear = putOnBattlefield(s0, ap, greenBear());
    void ids;
    let s = attackWith(s0, [giant], opp);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).not.toBe(ap);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[opp]!.manaPool = { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 };
    s = run(s, planCast(s, opp, sweep, [tgt(giant)]));
    s = settle(s, at("chooseMay", opp));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const declined = settle(act(structuredClone(s), { type: "chooseMay", player: opp, yes: false }));
    expect(zone(declined, giant)).toBe("hand");
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    s = settle(s);
    expect([zone(s, giant), s.players[ap]!.library[0]]).toEqual(["library", giant]);
    expect(zone(s, bear)).toBe("battlefield");
  });

  it("Sweep Away: a creature that isn't attacking just goes to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([sweepAway()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]), at("chooseMay", ap));
    expect(s.pending).toBeFalsy();
    expect(zone(s, giant)).toBe("hand");
  });
});

/** Passes priority around until `pid` has it (nothing on the stack to resolve in between). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const pool = (s: GameState, pid: PlayerId, m: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...m };
};

describe("Counterspells", () => {
  for (const pay of [false, true])
    it(`Frightful Delusion: that spell's controller discards a card whether or not they pay (${pay ? "pays" : "doesn't pay"})`, () => {
      const { s: s0, ap, ids, opp } = setup([frightfulDelusion()]);
      emptyHand(s0, opp);
      const growth = toZone(s0, opp, giantGrowth(), "hand");
      toZone(s0, opp, hillGiant(), "hand");
      const bear = putOnBattlefield(s0, opp, greenBear());
      let s = priorityTo(act(s0, { type: "passPriority", player: ap }), opp);
      pool(s, opp, { G: 1, C: pay ? 1 : 0 });
      s = run(s, planCast(s, opp, growth, [tgt(bear)]));
      s = priorityTo(s, ap);
      const item = s.stack[s.stack.length - 1]!;
      s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }]));
      s = settle(s, at("payUnless", opp));
      expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
      s = settle(act(s, { type: "payUnless", player: opp, pay }));
      expect(s.players[opp]!.hand.length).toBe(0);
      expect(pt(s, bear)).toBe(pay ? "5/5" : "2/2");
    });

  it("Icy Reception: counters a creature or legendary spell, not another spell", () => {
    const { s: s0, ap, ids } = setup([icyReception(), legendaryArtifact(), mindStone(), greenBear()]);
    const reception = compileCard(icyReception()).spell!;
    expect(reception.modal?.modes[0]?.targets[0]).toMatchObject({ kind: "spell" });
    let s = run(s0, planCast(s0, ap, ids[1]!, []));
    const relic = s.stack[s.stack.length - 1]!;
    expect(planCast(s, ap, ids[0]!, [{ kind: "stack", id: relic.id }], [0])).not.toBeNull();
    s = settle(s);
    s = run(s, planCast(s, ap, ids[2]!, []));
    const stone = s.stack[s.stack.length - 1]!;
    expect(planCast(s, ap, ids[0]!, [{ kind: "stack", id: stone.id }], [0])).toBeNull();
    s = settle(s);
    s = run(s, planCast(s, ap, ids[3]!, []));
    const bearSpell = s.stack[s.stack.length - 1]!;
    expect(planCast(s, ap, ids[0]!, [{ kind: "stack", id: bearSpell.id }], [0])).not.toBeNull();
  });
});

describe("Pumps and shrinks", () => {
  it("Take to the Streets: +2/+2 for each creature you control, another +1/+1 and vigilance for Citizens", () => {
    const { s: s0, ap, ids, opp } = setup([takeToTheStreets()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const town = putOnBattlefield(s0, ap, citizen());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([pt(s, bear), pt(s, town), pt(s, theirs)]).toEqual(["4/4", "4/4", "2/2"]);
    expect([kws(s, bear, "Vigilance"), kws(s, town, "Vigilance")]).toEqual([false, true]);
  });

  it("Olivia's Midnight Ambush: -2/-2 by day, -13/-13 instead at night", () => {
    const { s: s0, ap, ids, opp } = setup([oliviasMidnightAmbush(), oliviasMidnightAmbush()]);
    const wall = putOnBattlefield(s0, opp, blueWall());
    const big = putOnBattlefield(s0, opp, creature("Huge Wurm", "Creature — Wurm", "{6}{G}", 10, 10, { cmc: 7, colors: ["G"] }));
    s0.dayNight = "day";
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]));
    expect(pt(s, wall)).toBe("-1/3");
    s.dayNight = "night";
    s = settle(castNow(s, ap, ids[1]!, [tgt(big)]));
    expect(zone(s, big)).toBe("graveyard");
  });

  it("Olivia's Midnight Ambush: with no day or night yet, only -2/-2", () => {
    const { s: s0, ap, ids, opp } = setup([oliviasMidnightAmbush()]);
    const wall = putOnBattlefield(s0, opp, blueWall());
    expect(s0.dayNight).toBeUndefined();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]));
    expect(pt(s, wall)).toBe("-1/3");
  });

  it("Wolf Strike: +2/+0 only at night, then it deals damage equal to its power", () => {
    for (const night of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([wolfStrike()]);
      const bear = putOnBattlefield(s0, ap, greenBear());
      const giant = putOnBattlefield(s0, opp, hillGiant());
      s0.dayNight = night ? "night" : "day";
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear), tgt(giant)]));
      expect([zone(s, giant), pt(s, bear)]).toEqual(night ? ["graveyard", "4/2"] : ["battlefield", "2/2"]);
    }
  });

  it("Moonrager's Slash costs {2} less at night", () => {
    const { s: s0, ap, ids, opp } = setup([moonragersSlash()]);
    emptyHand(s0, ap);
    const slash = toZone(s0, ap, moonragersSlash(), "hand");
    void ids;
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    pool(s0, ap, { R: 1 });
    s0.dayNight = "day";
    expect(planCast(s0, ap, slash, [ply(opp)])).toBeNull();
    s0.dayNight = "night";
    const s = settle(run(s0, planCast(s0, ap, slash, [ply(opp)])));
    expect(life(s, opp)).toBe(37);
  });

  it("Traitor's Clutch: +1/+0, black and shadow until end of turn", () => {
    const { s: s0, ap, ids } = setup([traitorsClutch()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect([pt(s, bear), colorsOf(s, bear), kws(s, bear, "Shadow")]).toEqual(["3/2", ["B"], true]);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect([pt(s, bear), colorsOf(s, bear), kws(s, bear, "Shadow")]).toEqual(["2/2", ["G"], false]);
  });

  it("Pestilent Haze: -2/-2 to all creatures, or two loyalty counters off each planeswalker", () => {
    const { s: s0, ap, ids, opp } = setup([pestilentHaze(), pestilentHaze()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const jace = putOnBattlefield(s0, opp, walker());
    s0.objects[jace]!.counters.loyalty = 3;
    const mine = putOnBattlefield(s0, ap, walker());
    s0.objects[mine]!.counters.loyalty = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [0])));
    expect([pt(s, giant), zone(s, bear)]).toEqual(["1/1", "graveyard"]);
    pool(s, ap, { B: 3 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [], [1])));
    expect([s.objects[jace]!.counters.loyalty, zone(s, mine)]).toEqual([1, "graveyard"]);
  });
});

describe("Damage", () => {
  it("Searing Barb: a creature it damages can't block this turn; then incubate 1", () => {
    const { s: s0, ap, ids, opp } = setup([searingBarb(), searingBarb()]);
    const wall = putOnBattlefield(s0, opp, blueWall());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]));
    expect(s.objects[wall]!.damage).toBe(2);
    expect(characteristics(s, s.objects[wall]!).cantBlock).toBeTruthy();
    const incubators = () => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Incubator Token");
    expect(incubators().length).toBe(1);
    pool(s, ap, { R: 3 });
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]));
    expect([life(s, opp), incubators().length]).toEqual([38, 2]);
  });

  it("Cone of Flame: 1, 2 and 3 damage to three different targets", () => {
    const { s: s0, ap, ids, opp } = setup([coneOfFlame()]);
    const bear = putOnBattlefield(s0, opp, greenBear());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    expect(planCast(s0, ap, ids[0]!, [tgt(bear), tgt(bear), ply(opp)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp), tgt(bear), tgt(giant)]));
    expect([life(s, opp), zone(s, bear), zone(s, giant)]).toEqual([39, "graveyard", "graveyard"]);
  });

  it("Reveka: 2 damage to any target, and she doesn't untap during your next untap step", () => {
    const { s: s0, ap, opp } = setup([]);
    const rev = putOnBattlefield(s0, ap, reveka());
    let s = settle(run(s0, planActivate(s0, ap, rev, 0, [ply(opp)])));
    expect([life(s, opp), s.objects[rev]!.tapped]).toEqual([38, true]);
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[rev]!.tapped).toBe(true);
  });
});

describe("Essence Vortex", () => {
  it("destroys the creature unless its controller pays life equal to its toughness; destroyed, it can't be regenerated", () => {
    for (const pay of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([essenceVortex()]);
      const wall = putOnBattlefield(s0, opp, blueWall());
      s0.objects[wall]!.regenShields = 1;
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]), at("payUnless", opp));
      expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, life: 5 });
      s = settle(act(s, { type: "payUnless", player: opp, pay }));
      expect([zone(s, wall), life(s, opp)]).toEqual(pay ? ["battlefield", 35] : ["graveyard", 40]);
    }
  });

  it("a player with less life than its toughness can't pay", () => {
    const { s: s0, ap, ids, opp } = setup([essenceVortex()]);
    const wall = putOnBattlefield(s0, opp, blueWall());
    s0.players[opp]!.life = 4;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]), at("payUnless", opp));
    expect(() => act(s, { type: "payUnless", player: opp, pay: true })).toThrow();
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(zone(s, wall)).toBe("graveyard");
  });
});

describe("Prevention", () => {
  it("Soul Parry: prevents all damage one or two target creatures would deal this turn", () => {
    const { s: s0, ap, ids, opp } = setup([soulParry(), soulParry()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant), tgt(bear)]));
    for (const id of [giant, bear]) expect(characteristics(s, s.objects[id]!).preventDamage?.some((p) => p.by)).toBe(true);
    pool(s, ap, { W: 2 });
    const goblinId = putOnBattlefield(s, ap, goblin());
    s = settle(castNow(s, ap, ids[1]!, [tgt(goblinId), { kind: "none" }]));
    expect(characteristics(s, s.objects[goblinId]!).preventDamage?.some((p) => p.by)).toBe(true);
    expect(planCast(s, ap, toZone(s, ap, soulParry(), "hand"), [{ kind: "none" }, { kind: "none" }])).toBeNull();
  });

  it("Soul Parry: the creature deals no combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, opp);
    const parry = toZone(s0, opp, soulParry(), "hand");
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = attackWith(s0, [giant], opp);
    s = priorityTo(act(s, { type: "passPriority", player: ap }), opp);
    pool(s, opp, { W: 2 });
    s = run(s, planCast(s, opp, parry, [tgt(giant), { kind: "none" }]));
    s = settle(s);
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(40);
  });
});

describe("Creatures and an Aura", () => {
  it("Machine Man: a +1/+1 counter and flying until end of turn whenever you cast a noncreature spell", () => {
    const { s: s0, ap, ids } = setup([ponder(), greenBear()]);
    const mm = putOnBattlefield(s0, ap, machineMan());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([pt(s, mm), kws(s, mm, "Flying")]).toEqual(["3/4", true]);
    s = settle(castNow(s, ap, ids[1]!));
    expect(pt(s, mm)).toBe("3/4");
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect([pt(s, mm), kws(s, mm, "Flying")]).toEqual(["3/4", false]);
  });

  it("Hobble: the enchanted creature can't attack, and can't block while it's black", () => {
    const { s: s0, ap, opp } = setup([]);
    const knight = putOnBattlefield(s0, opp, blackKnight());
    const white = putOnBattlefield(s0, opp, whiteKnight());
    attach(s0, ap, hobble(), knight);
    attach(s0, ap, hobble(), white);
    expect(characteristics(s0, s0.objects[knight]!).cantBlock).toBeTruthy();
    expect(characteristics(s0, s0.objects[white]!).cantBlock).toBeFalsy();
    expect([characteristics(s0, s0.objects[knight]!).cantAttack, characteristics(s0, s0.objects[white]!).cantAttack].every(Boolean)).toBe(true);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = attackWith(s0, [giant], opp);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: knight, attacker: giant }] })).toThrow();
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: white, attacker: giant }] });
    expect(s.objects[white]!.blocking).toEqual([giant]);
  });

  it("Hobble: by its color now, so a black creature that turns white can block", () => {
    const { s: s0, ap, opp } = setup([]);
    const knight = putOnBattlefield(s0, opp, blackKnight());
    attach(s0, ap, hobble(), knight);
    addEffect(s0, opp, [knight], [{ kind: "setColors", colors: ["W"] }]);
    expect(characteristics(s0, s0.objects[knight]!).cantBlock).toBeFalsy();
  });

  it("Guan Yu: when it's put into your graveyard from the battlefield, you may shuffle it into your library", () => {
    const { s: s0, ap, ids, opp } = setup([murder()]);
    const guan = putOnBattlefield(s0, opp, guanYu());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(guan)]), at("chooseMay", opp));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const declined = settle(act(structuredClone(s), { type: "chooseMay", player: opp, yes: false }));
    expect(zone(declined, guan)).toBe("graveyard");
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(zone(s, guan)).toBe("library");
    expect(s.players[opp]!.library).toContain(guan);
  });

  it("Plague Rats: power and toughness equal to the number of creatures named Plague Rats, anyone's", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, plagueRats());
    expect(pt(s0, a)).toBe("1/1");
    const b = putOnBattlefield(s0, opp, plagueRats());
    putOnBattlefield(s0, opp, greenBear());
    expect([pt(s0, a), pt(s0, b)]).toEqual(["2/2", "2/2"]);
  });
});

describe("Bots", () => {
  it("a bot casting Persecute aims it at an opponent and names a color the opponents play", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    s0.players[ap]!.command = [];
    const spell = toZone(s0, ap, persecute(), "hand");
    putOnBattlefield(s0, ap, blackKnight());
    const opps = s0.turnOrder.filter((p) => p !== ap);
    for (const p of opps) {
      emptyHand(s0, p);
      putOnBattlefield(s0, p, hillGiant());
      toZone(s0, p, goblin(), "hand");
      toZone(s0, p, greenBear(), "hand");
    }
    let s = s0;
    for (let i = 0; i < 200 && zone(s, spell) === "hand"; i++) {
      const pid = s.pending?.player ?? waitingOn(s)!;
      for (const a of botActions(s, pid)) s = act(s, a);
    }
    s = settle(s);
    expect(zone(s, spell)).toBe("graveyard");
    const hit = opps.filter((p) => s.players[p]!.hand.length === 1);
    expect(hit.length).toBe(1);
    expect(characteristics(s, s.objects[s.players[hit[0]!]!.hand[0]!]!).colors).toEqual(["G"]);
  });
});
