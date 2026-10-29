// Lane B, round 29: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
    if (p?.kind === "discard" || p?.kind === "pickPermanents" || p?.kind === "declareAttackers" || p?.kind === "declareBlockers") break;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const goblin = (name = "Red Goblin") => creature(name, "Creature — Goblin", "{R}", 1, 1, { cmc: 1, colors: ["R"] });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const shapeshifter = () => creature("Test Changeling", "Creature — Shapeshifter", "{1}{U}", 1, 1, { cmc: 2, colors: ["U"], keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });
const spirit = (name = "Test Spirit") => creature(name, "Creature — Spirit", "{1}{W}", 1, 1, { cmc: 2, colors: ["W"] });
const goldKnight = () => creature("Gold Knight", "Creature — Human Knight", "{R}{W}", 1, 1, { cmc: 2, colors: ["R", "W"] });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." });
const blast = () => card("Six Blast", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Six Blast deals 6 damage to target creature." });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const giantGrowth = () => card("Giant Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });
const filler = () => card("Filler Card", "Sorcery", "{5}", { cmc: 5 });
/** Moves a new card for `def` into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], x?: number, choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], x?: number, costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, x, costs));
/** The lands of this subtype `pid` controls. */
const landsOf = (s: GameState, pid: PlayerId, sub: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes(sub));

// Real oracle text (Scryfall).
const crownOfSuspicion = card("Crown of Suspicion", "Enchantment — Aura", "{1}{B}", { cmc: 2, colors: ["B"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/-1.\nSacrifice this Aura: Enchanted creature and other creatures that share a creature type with it get +2/-1 until end of turn." });
const crownOfVigor = card("Crown of Vigor", "Enchantment — Aura", "{1}{G}", { cmc: 2, colors: ["G"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice this Aura: Enchanted creature and other creatures that share a creature type with it get +1/+1 until end of turn." });
const crownOfAscension = card("Crown of Ascension", "Enchantment — Aura", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature has flying.\nSacrifice this Aura: Enchanted creature and other creatures that share a creature type with it gain flying until end of turn." });
const crownOfFury = card("Crown of Fury", "Enchantment — Aura", "{1}{R}", { cmc: 2, colors: ["R"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+0 and has first strike.\nSacrifice this Aura: Enchanted creature and other creatures that share a creature type with it get +1/+0 and gain first strike until end of turn." });
const crownOfAwe = card("Crown of Awe", "Enchantment — Aura", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature has protection from black and from red.\nSacrifice this Aura: Enchanted creature and other creatures that share a creature type with it gain protection from black and from red until end of turn." });
const keldonBattlewagon = card("Keldon Battlewagon", "Artifact Creature — Juggernaut", "{5}", { cmc: 5, power: "0", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nThis creature can't block.\nWhen this creature attacks, sacrifice it at end of combat.\nTap an untapped creature you control: This creature gets +X/+0 until end of turn, where X is the power of the creature tapped this way." });
const impelledGiant = card("Impelled Giant", "Creature — Giant Warrior", "{4}{R}{R}", { cmc: 6, power: "3", toughness: "3", colors: ["R"], keywords: ["Trample"], oracleText: "Trample\nTap an untapped red creature you control other than this creature: This creature gets +X/+0 until end of turn, where X is the power of the creature tapped this way." });
const unerringSling = card("Unerring Sling", "Artifact", "{3}", { cmc: 3, oracleText: "{3}, {T}, Tap an untapped creature you control: This artifact deals damage equal to the tapped creature's power to target attacking or blocking creature with flying." });
const clockworkSwarm = card("Clockwork Swarm", "Artifact Creature — Insect", "{4}", { cmc: 4, power: "0", toughness: "3", oracleText: "This creature enters with four +1/+0 counters on it.\nThis creature can't be blocked by Walls.\nAt end of combat, if this creature attacked or blocked this combat, remove a +1/+0 counter from it.\n{X}, {T}: Put up to X +1/+0 counters on this creature. This ability can't cause the total number of +1/+0 counters on this creature to be greater than four. Activate only during your upkeep." });
const clockworkAvian = card("Clockwork Avian", "Artifact Creature — Bird", "{5}", { cmc: 5, power: "0", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nThis creature enters with four +1/+0 counters on it.\nAt end of combat, if this creature attacked or blocked this combat, remove a +1/+0 counter from it.\n{X}, {T}: Put up to X +1/+0 counters on this creature. This ability can't cause the total number of +1/+0 counters on this creature to be greater than four. Activate only during your upkeep." });
const clockworkBeast = card("Clockwork Beast", "Artifact Creature — Beast", "{6}", { cmc: 6, power: "0", toughness: "4", oracleText: "This creature enters with seven +1/+0 counters on it.\nAt end of combat, if this creature attacked or blocked this combat, remove a +1/+0 counter from it.\n{X}, {T}: Put up to X +1/+0 counters on this creature. This ability can't cause the total number of +1/+0 counters on this creature to be greater than seven. Activate only during your upkeep." });
const clockworkSteed = card("Clockwork Steed", "Artifact Creature — Horse", "{4}", { cmc: 4, power: "0", toughness: "3", oracleText: "This creature enters with four +1/+0 counters on it.\nThis creature can't be blocked by artifact creatures.\nAt end of combat, if this creature attacked or blocked this combat, remove a +1/+0 counter from it.\n{X}, {T}: Put up to X +1/+0 counters on this creature. This ability can't cause the total number of +1/+0 counters on this creature to be greater than four. Activate only during your upkeep." });
const temper = card("Temper", "Instant", "{X}{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Prevent the next X damage that would be dealt to target creature this turn. For each 1 damage prevented this way, put a +1/+1 counter on that creature." });
const testOfFaith = card("Test of Faith", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Prevent the next 3 damage that would be dealt to target creature this turn. For each 1 damage prevented this way, put a +1/+1 counter on that creature." });
const braceForImpact = card("Brace for Impact", "Instant", "{4}{W}", { cmc: 5, colors: ["W"], oracleText: "Prevent all damage that would be dealt to target multicolored creature this turn. For each 1 damage prevented this way, put a +1/+1 counter on that creature." });
const sacredBoon = card("Sacred Boon", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Prevent the next 3 damage that would be dealt to target creature this turn. At the beginning of the next end step, put a +0/+1 counter on that creature for each 1 damage prevented this way." });
const scarsOfTheVeteran = card("Scars of the Veteran", "Instant", "{4}{W}", { cmc: 5, colors: ["W"], oracleText: "You may exile a white card from your hand rather than pay this spell's mana cost.\nPrevent the next 7 damage that would be dealt to any target this turn. If it's a creature, put a +0/+1 counter on it for each 1 damage prevented this way at the beginning of the next end step." });
const candlesGlow = card("Candles' Glow", "Instant — Arcane", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Splice"], oracleText: "Prevent the next 3 damage that would be dealt to any target this turn. You gain life equal to the damage prevented this way.\nSplice onto Arcane {1}{W} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)" });
const vengefulArchon = card("Vengeful Archon", "Creature — Archon", "{4}{W}{W}{W}", { cmc: 7, power: "7", toughness: "7", colors: ["W"], keywords: ["Flying"], oracleText: "Flying\n{X}: Prevent the next X damage that would be dealt to you this turn. If damage is prevented this way, this creature deals that much damage to target player or planeswalker." });
const landslide = card("Landslide", "Sorcery", "{R}", { cmc: 1, colors: ["R"], oracleText: "Sacrifice any number of Mountains. Landslide deals that much damage to target player or planeswalker." });
const plowThroughReito = card("Plow Through Reito", "Instant — Arcane", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Sweep"], oracleText: "Sweep — Return any number of Plains you control to their owner's hand. Target creature gets +1/+1 until end of turn for each Plains returned this way." });
const sinkIntoTakenuma = card("Sink into Takenuma", "Sorcery — Arcane", "{3}{B}", { cmc: 4, colors: ["B"], keywords: ["Sweep"], oracleText: "Sweep — Return any number of Swamps you control to their owner's hand. Target player discards a card for each Swamp returned this way." });
const sacredRites = card("Sacred Rites", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Discard any number of cards. Creatures you control get +0/+1 until end of turn for each card discarded this way." });
const devouringRage = card("Devouring Rage", "Instant — Arcane", "{4}{R}", { cmc: 5, colors: ["R"], oracleText: "As an additional cost to cast this spell, you may sacrifice any number of Spirits.\nTarget creature gets +3/+0 until end of turn. For each Spirit sacrificed this way, that creature gets an additional +3/+0 until end of turn." });
const barrelDownSokenzan = card("Barrel Down Sokenzan", "Instant — Arcane", "{2}{R}", { cmc: 3, colors: ["R"], keywords: ["Sweep"], oracleText: "Sweep — Return any number of Mountains you control to their owner's hand. Barrel Down Sokenzan deals damage to target creature equal to twice the number of Mountains returned this way." });
const chargeAcrossTheAraba = card("Charge Across the Araba", "Instant — Arcane", "{4}{W}", { cmc: 5, colors: ["W"], keywords: ["Sweep"], oracleText: "Sweep — Return any number of Plains you control to their owner's hand. Creatures you control get +1/+1 until end of turn for each Plains returned this way." });

const ritesOfRefusal = card("Rites of Refusal", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Discard any number of cards. Counter target spell unless its controller pays {3} for each card discarded this way." });
const tamiyoMeetsTheStoryCircle = card("Tamiyo Meets the Story Circle", "Enchantment — Saga", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Investigate"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets -2/-0 until end of turn.\nII — Discard any number of cards, then investigate twice for each card discarded this way.\nIII — Shuffle up to three target cards from your graveyard into your library." });
describe("Lane B round 29", () => {
  it("compiles every card fully", () => {
    supported(crownOfSuspicion, crownOfVigor, crownOfAscension, crownOfFury, crownOfAwe, keldonBattlewagon, impelledGiant, unerringSling, clockworkSwarm, clockworkAvian, clockworkBeast, clockworkSteed);
    supported(temper, testOfFaith, braceForImpact, sacredBoon, scarsOfTheVeteran, candlesGlow, vengefulArchon, landslide, plowThroughReito, sinkIntoTakenuma, sacredRites, devouringRage, barrelDownSokenzan, chargeAcrossTheAraba);
    // "Discard any number of cards" before "for each card discarded this way" (Sacred Rites) also completes these two.
    supported(ritesOfRefusal, tamiyoMeetsTheStoryCircle);
  });
});

describe("Crowns: enchanted creature and other creatures that share a creature type with it", () => {
  it("Crown of Vigor: the enchanted Goblin and the other Goblin, not the Bear", () => {
    const { s: s0, ap } = setup([]);
    const host = putOnBattlefield(s0, ap, goblin());
    const other = putOnBattlefield(s0, ap, goblin("Other Goblin"));
    const bear = putOnBattlefield(s0, ap, greenBear());
    const crown = attach(s0, ap, crownOfVigor, host);
    expect(pt(s0, host)).toBe("2/2");
    const s = settle(activateNow(s0, ap, crown, 0));
    expect(zone(s, crown)).toBe("graveyard");
    expect([pt(s, host), pt(s, other), pt(s, bear)]).toEqual(["2/2", "2/2", "2/2"]);
  });

  it("Crown of Ascension: with the creature gone, the types it last had (CR 608.2h)", () => {
    const { s: s0, ap } = setup([murder()]);
    const host = putOnBattlefield(s0, ap, goblin());
    const other = putOnBattlefield(s0, ap, goblin("Other Goblin"));
    const bear = putOnBattlefield(s0, ap, greenBear());
    const crown = attach(s0, ap, crownOfAscension, host);
    let s = activateNow(s0, ap, crown, 0);
    s = castNow(s, ap, s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Murder")!, [tgt(host)]);
    s = settle(s);
    expect(zone(s, host)).toBe("graveyard");
    expect(objHasKeyword(s, s.objects[other]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[bear]!, "Flying")).toBe(false);
  });

  it("Crown of Fury: a changeling shares a creature type with the Bear", () => {
    const { s: s0, ap } = setup([]);
    const host = putOnBattlefield(s0, ap, greenBear());
    const changeling = putOnBattlefield(s0, ap, shapeshifter());
    const gob = putOnBattlefield(s0, ap, goblin());
    const crown = attach(s0, ap, crownOfFury, host);
    const s = settle(activateNow(s0, ap, crown, 0));
    expect(pt(s, host)).toBe("3/2");
    expect(pt(s, changeling)).toBe("2/1");
    expect(objHasKeyword(s, s.objects[changeling]!, "First strike")).toBe(true);
    expect(pt(s, gob)).toBe("1/1");
  });

  it("Crown of Suspicion: opponents' creatures that share a type get it too", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, greenBear());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    const crown = attach(s0, ap, crownOfSuspicion, host);
    expect(pt(s0, host)).toBe("4/1");
    const s = settle(activateNow(s0, ap, crown, 0));
    expect(pt(s, host)).toBe("4/1");
    expect(pt(s, theirs)).toBe("4/1");
  });
});

describe("Tap a creature: its power", () => {
  it("Keldon Battlewagon: +X/+0, X the tapped creature's power", () => {
    const { s: s0, ap } = setup([]);
    const wagon = putOnBattlefield(s0, ap, keldonBattlewagon);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = settle(activateNow(s0, ap, wagon, 0, [], undefined, { tap: [bear] }));
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(pt(s, wagon)).toBe("2/3");
  });

  it("Impelled Giant: the power as the ability resolves, then as the creature last existed (rulings)", () => {
    const { s: s0, ap } = setup([giantGrowth(), murder()]);
    const giant = putOnBattlefield(s0, ap, impelledGiant);
    const gob = putOnBattlefield(s0, ap, goblin());
    // Not itself: "other than this creature".
    expect(planActivate(s0, ap, giant, 0, [], undefined, undefined, undefined, { tap: [giant] })).toBeNull();
    let s = activateNow(s0, ap, giant, 0, [], undefined, { tap: [gob] });
    const [growth, kill] = s.players[ap]!.hand.filter((id) => ["Giant Growth", "Murder"].includes(s.cards[s.objects[id]!.cardId]!.name));
    s = castNow(s, ap, growth!, [tgt(gob)]);
    s = settle(s, (x) => x.stack.length === 1);
    expect(pt(s, gob)).toBe("4/4");
    s = castNow(s, ap, kill!, [tgt(gob)]);
    s = settle(s);
    expect(zone(s, gob)).toBe("graveyard");
    expect(pt(s, giant)).toBe("7/3");
  });

  it("Unerring Sling: damage equal to the tapped creature's power", () => {
    const c = compileCard(unerringSling);
    expect(c.activated[0]!.costs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "tap", n: 1 })]));
    expect(JSON.stringify(c.activated[0]!.body.effects)).toContain("stationPower");
  });
});

describe("Clockworks", () => {
  it("Clockwork Beast: loses a counter at end of combat after attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    const beast = putOnBattlefield(s0, ap, clockworkBeast);
    s0.objects[beast]!.counters = { "+1/+0": 7 };
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: beast, defender: opp }] });
    s = settle(passUntil(s, "endCombat", ap));
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[beast]!.counters["+1/+0"]).toBe(6);
    expect(life(s, opp)).toBe(40 - 7);
  });

  it("Clockwork Swarm: up to X counters, but never past four (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const swarm = putOnBattlefield(s0, ap, clockworkSwarm);
    s0.objects[swarm]!.counters = { "+1/+0": 1 };
    let s = settle(passUntil(s0, "upkeep", ap));
    s = settle(activateNow(s, ap, swarm, 0, [], 5));
    expect(s.objects[swarm]!.counters["+1/+0"]).toBe(4);
    expect(pt(s, swarm)).toBe("4/3");
  });

  it("Clockwork Steed: only during your upkeep", () => {
    const { s, ap } = setup([]);
    const steed = putOnBattlefield(s, ap, clockworkSteed);
    expect(planActivate(s, ap, steed, 0, [], undefined, undefined, 1)).toBeNull();
  });
});

describe("Prevention: for each 1 damage prevented this way", () => {
  it("Test of Faith: 3 of 6 damage prevented, three +1/+1 counters at once, so the 1/1 lives as a 4/4 (rulings)", () => {
    const { s: s0, ap, ids } = setup([testOfFaith, blast()]);
    const gob = putOnBattlefield(s0, ap, goblin());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(gob)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(gob)]));
    expect(zone(s, gob)).toBe("battlefield");
    expect(s.objects[gob]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[gob]!.damage).toBe(3);
    expect(pt(s, gob)).toBe("4/4");
  });

  it("Temper: X is the most it prevents; one counter for each 1 actually prevented (rulings)", () => {
    const { s: s0, ap, ids } = setup([temper, shock(), shock()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)], 3));
    s = settle(castNow(s, ap, ids[1]!, [tgt(bear)]));
    expect(s.objects[bear]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]!.damage).toBe(0);
    s = settle(castNow(s, ap, ids[2]!, [tgt(bear)]));
    expect(s.objects[bear]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[bear]!.damage).toBe(1);
  });

  it("Brace for Impact: all of it prevented, a counter for each 1", () => {
    const { s: s0, ap, ids } = setup([braceForImpact, blast()]);
    const knight = putOnBattlefield(s0, ap, goldKnight());
    expect(planCast(s0, ap, ids[0]!, [tgt(putOnBattlefield(s0, ap, greenBear()))])).toBeNull(); // multicolored only
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(knight)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(knight)]));
    expect(s.objects[knight]!.counters["+1/+1"]).toBe(6);
    expect(s.objects[knight]!.damage).toBe(0);
  });

  it("Sacred Boon: the +0/+1 counters at the beginning of the next end step", () => {
    const { s: s0, ap, ids } = setup([sacredBoon, shock()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(bear)]));
    expect(s.objects[bear]!.counters["+0/+1"] ?? 0).toBe(0);
    s = settle(passUntil(s, "end", ap));
    s = settle(s);
    expect(s.objects[bear]!.counters["+0/+1"]).toBe(2);
    expect(pt(s, bear)).toBe("2/4");
  });

  it("Scars of the Veteran: a player is protected but gets no counters; a creature gets them at the end step", () => {
    const whiteCard = card("White Card", "Sorcery", "{W}", { cmc: 1, colors: ["W"] });
    const { s: s0, ap, opp, ids } = setup([scarsOfTheVeteran, scarsOfTheVeteran, shock(), shock(), whiteCard]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const [scarsA, scarsB, shockA, shockB, white] = ids;
    let s = settle(castNow(s0, ap, scarsA!, [ply(ap)]));
    s = settle(castNow(s, ap, shockA!, [ply(ap)]));
    expect(life(s, ap)).toBe(40);
    // The second one by exiling a white card from hand rather than paying its mana cost.
    s = settle(castNow(s, ap, scarsB!, [tgt(bear)], undefined, { alt: "alternative", exileFromHand: [white!] }));
    expect(zone(s, white!)).toBe("exile");
    s = settle(castNow(s, ap, shockB!, [tgt(bear)]));
    expect(s.objects[bear]!.damage).toBe(0);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[bear]!.counters["+0/+1"]).toBe(2);
    expect(life(s, opp)).toBe(40);
  });

  it("Candles' Glow: you gain life equal to the damage prevented", () => {
    const { s: s0, ap, ids } = setup([candlesGlow, shock()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(bear)]));
    expect(s.objects[bear]!.damage).toBe(0);
    expect(life(s, ap)).toBe(42);
  });

  it("Candles' Glow spliced onto Plow Through Reito: the targets after its own, the life from the shield", () => {
    const { s: s0, ap, ids } = setup([plowThroughReito, candlesGlow, shock()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear), tgt(bear)], undefined, { splice: [ids[1]!] }));
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("hand");
    s = settle(castNow(s, ap, ids[2]!, [tgt(bear)]));
    expect(s.objects[bear]!.damage).toBe(0);
    expect(life(s, ap)).toBe(42);
  });

  it("Vengeful Archon: it deals as much as it prevented to the target; the rest of the shield stays (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([shock(), shock()]);
    const archon = putOnBattlefield(s0, ap, vengefulArchon);
    let s = settle(activateNow(s0, ap, archon, 0, [ply(opp)], 3));
    s = settle(castNow(s, ap, ids[0]!, [ply(ap)]));
    expect(life(s, ap)).toBe(40);
    expect(life(s, opp)).toBe(38);
    s = settle(castNow(s, ap, ids[1]!, [ply(ap)]));
    expect(life(s, ap)).toBe(39);
    expect(life(s, opp)).toBe(37);
  });
});

describe("Any number ... this way", () => {
  it("Landslide: one damage for each Mountain sacrificed as it resolves", () => {
    const { s: s0, ap, opp, ids } = setup([landslide]);
    let s = castNow(s0, ap, ids[0]!, [ply(opp)]);
    s = settle(s);
    expect(s.pending?.kind).toBe("pickPermanents");
    const mountains = landsOf(s, ap, "Mountain").filter((id) => !s.objects[id]!.tapped);
    s = act(s, { type: "pickPermanents", player: ap, ids: mountains.slice(0, 2) });
    s = settle(s);
    expect(mountains.slice(0, 2).map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(life(s, opp)).toBe(38);
  });

  it("Plow Through Reito: +1/+1 for each Plains returned to hand", () => {
    const { s: s0, ap, ids } = setup([plowThroughReito]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(s.pending?.kind).toBe("pickPermanents");
    const plains = landsOf(s, ap, "Plains");
    s = act(s, { type: "pickPermanents", player: ap, ids: plains.slice(0, 2) });
    s = settle(s);
    expect(plains.slice(0, 2).map((id) => zone(s, id))).toEqual(["hand", "hand"]);
    expect(pt(s, bear)).toBe("4/4");
  });

  it("Charge Across the Araba: none returned, no bonus", () => {
    const { s: s0, ap, ids } = setup([chargeAcrossTheAraba]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = settle(s);
    expect(pt(s, bear)).toBe("2/2");
  });

  it("Barrel Down Sokenzan: twice the number of Mountains returned", () => {
    const { s: s0, ap, opp, ids } = setup([barrelDownSokenzan]);
    const big = putOnBattlefield(s0, opp, creature("Big Wurm", "Creature — Wurm", "{6}", 6, 6));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(big)]));
    const mountains = landsOf(s, ap, "Mountain");
    s = act(s, { type: "pickPermanents", player: ap, ids: mountains.slice(0, 2) });
    s = settle(s);
    expect(s.objects[big]!.damage).toBe(4);
  });

  it("Sink into Takenuma: the target player discards a card for each Swamp returned", () => {
    const { s: s0, ap, opp, ids } = setup([sinkIntoTakenuma]);
    for (let i = 0; i < 3; i++) toHand(s0, opp, filler());
    const before = s0.players[opp]!.hand.length;
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    const swamps = landsOf(s, ap, "Swamp");
    s = act(s, { type: "pickPermanents", player: ap, ids: swamps.slice(0, 2) });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 2 });
    s = act(s, { type: "discard", player: opp, objectIds: s.players[opp]!.hand.slice(0, 2) });
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(before - 2);
  });

  it("Sacred Rites: +0/+1 for each card discarded", () => {
    const { s: s0, ap } = setup([sacredRites, filler(), filler(), filler()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const [rites, a, b] = s0.players[ap]!.hand.slice(-4);
    let s = settle(castNow(s0, ap, rites!));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, upTo: true });
    s = act(s, { type: "discard", player: ap, objectIds: [a!, b!] });
    s = settle(s);
    expect([zone(s, a!), zone(s, b!)]).toEqual(["graveyard", "graveyard"]);
    expect(pt(s, bear)).toBe("2/4");
  });

  it("Rites of Refusal: {3} for each card discarded; with no mana left, the spell is countered", () => {
    const testDraw = card("Test Draw", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([testDraw, ritesOfRefusal, filler()]);
    let s = castNow(s0, ap, ids[0]!);
    const spell = s.stack[s.stack.length - 1]!.id;
    s = castNow(s, ap, ids[1]!, [{ kind: "stack", id: spell } as TargetChoice]);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, upTo: true });
    s = act(s, { type: "discard", player: ap, objectIds: [ids[2]!] });
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.log.some((l) => /Test Draw is countered|counter(s|ed) Test Draw/i.test(l.text))).toBe(true);
  });

  it("Tamiyo Meets the Story Circle: chapter II investigates twice for each card discarded", () => {
    const ch2 = compileCard(tamiyoMeetsTheStoryCircle).triggers.find((t) => t.event === "chapter" && t.chapter === 2)!;
    expect(ch2.body.effects).toMatchObject([{ type: "discard", upTo: true }, { type: "createToken", investigate: true, n: { count: { kind: "discardedThisWay" }, times: 2 } }]);
  });

  it("Devouring Rage: +3/+0, and +3/+0 more for each Spirit sacrificed as it's cast", () => {
    const { s: s0, ap, ids } = setup([devouringRage]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const a = putOnBattlefield(s0, ap, spirit());
    const b = putOnBattlefield(s0, ap, spirit("Other Spirit"));
    expect(planCast(s0, ap, ids[0]!, [tgt(bear)], undefined, "auto", 1, { sacrifice: [bear] })).toBeNull(); // Spirits only
    let s = castNow(s0, ap, ids[0]!, [tgt(bear)], 2, { sacrifice: [a, b] });
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "graveyard"]);
    s = settle(s);
    expect(pt(s, bear)).toBe("11/2");
  });

  it("Devouring Rage: with no Spirit sacrificed, only +3/+0", () => {
    const { s: s0, ap, ids } = setup([devouringRage]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)], 0));
    expect(pt(s, bear)).toBe("5/2");
  });
});
