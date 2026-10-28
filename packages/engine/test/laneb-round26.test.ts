// Lane B, round 26: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, attackProblem, botActions, moveObject, characteristics, invalidateCharacteristics, isFullySupported, objIsType, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
    if (p?.kind === "discard" || p?.kind === "declareAttackers" || p?.kind === "declareBlockers") break;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Stops at a decision of this kind for `pid`. */
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const bigBeast = () => creature("Big Beast", "Creature — Beast", "{3}{G}", 4, 5, { cmc: 4 });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{1}{W}", 2, 2, { cmc: 2 });
const whiteCharm = () => card("White Charm", "Instant", "{W}", { cmc: 1, oracleText: "You gain 1 life." });
/** Moves a new card for `def` into `pid`'s hand, graveyard or library (on top). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana };
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], x?: number, costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, x, costs));
/** Passes priority (empty stack) until `pid` has it. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
};
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
/** Passes to the declare blockers step and has the defending player declare `blocks` (blocker, attacker). */
const blockWith = (s: GameState, blocks: [string, string][]) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const p = s.pending!;
  return settle(act(s, { type: "declareBlockers", player: p.player, blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) }));
};
const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

// Real oracle text (Scryfall).
const avenShrine = card("Aven Shrine", "Enchantment", "{1}{W}{W}", {"cmc":3,"oracleText":"Whenever a player casts a spell, that player gains X life, where X is the number of cards in all graveyards with the same name as that spell."});
const nantukoShrine = card("Nantuko Shrine", "Enchantment", "{1}{G}{G}", {"cmc":3,"oracleText":"Whenever a player casts a spell, that player creates X 1/1 green Squirrel creature tokens, where X is the number of cards in all graveyards with the same name as that spell."});
const dwarvenShrine = card("Dwarven Shrine", "Enchantment", "{1}{R}{R}", {"cmc":3,"oracleText":"Whenever a player casts a spell, this enchantment deals X damage to that player, where X is twice the number of cards in all graveyards with the same name as that spell."});
const cabalShrine = card("Cabal Shrine", "Enchantment", "{1}{B}{B}", {"cmc":3,"oracleText":"Whenever a player casts a spell, that player discards X cards, where X is the number of cards in all graveyards with the same name as that spell."});
const cephalidShrine = card("Cephalid Shrine", "Enchantment", "{1}{U}{U}", {"cmc":3,"oracleText":"Whenever a player casts a spell, counter that spell unless that player pays {X}, where X is the number of cards in all graveyards with the same name as the spell."});
const floralSpuzzem = card("Floral Spuzzem", "Creature — Elemental", "{3}{G}", {"cmc":4,"power":"2","toughness":"2","oracleText":"Whenever this creature attacks and isn't blocked, you may destroy target artifact defending player controls. If you do, this creature assigns no combat damage this turn."});
const kukemssaPirates = card("Kukemssa Pirates", "Creature — Human Pirate", "{3}{U}", {"cmc":4,"power":"2","toughness":"2","oracleText":"Whenever this creature attacks and isn't blocked, you may gain control of target artifact defending player controls. If you do, this creature assigns no combat damage this turn."});
const goblinVandal = card("Goblin Vandal", "Creature — Goblin Rogue", "{R}", {"cmc":1,"power":"1","toughness":"1","oracleText":"Whenever this creature attacks and isn't blocked, you may pay {R}. If you do, destroy target artifact defending player controls and this creature assigns no combat damage this turn."});
const rysorianBadger = card("Rysorian Badger", "Creature — Badger", "{2}{G}", {"cmc":3,"power":"2","toughness":"2","oracleText":"Whenever this creature attacks and isn't blocked, you may exile up to two target creature cards from defending player's graveyard. If you do, you gain 1 life for each card exiled this way and this creature assigns no combat damage this turn."});
const orcishSquatters = card("Orcish Squatters", "Creature — Orc", "{4}{R}", {"cmc":5,"power":"2","toughness":"3","oracleText":"Whenever this creature attacks and isn't blocked, you may gain control of target land defending player controls for as long as you control this creature. If you do, this creature assigns no combat damage this turn."});
const cloakOfConfusion = card("Cloak of Confusion", "Enchantment — Aura", "{1}{B}", {"cmc":2,"keywords":["Enchant"],"oracleText":"Enchant creature you control\nWhenever enchanted creature attacks and isn't blocked, you may have it assign no combat damage this turn. If you do, defending player discards a card at random."});

const ironPot = (extra: Partial<CardDef> = {}) => card("Iron Pot", "Artifact", "{2}", { cmc: 2, colors: [], ...extra });
/** `attacker` attacks `opp` unblocked; stops when its controller is asked whether to do what the trigger offers. */
const unblocked = (s0: GameState, attacker: string, opp: PlayerId) => {
  let s = attackWith(s0, [attacker], opp);
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] }), at("chooseMay", s.activePlayer));
};
const exaltedDragon = card("Exalted Dragon", "Creature — Dragon", "{4}{W}{W}", {"cmc":6,"power":"5","toughness":"5","keywords":["Flying"],"oracleText":"Flying\nThis creature can't attack unless you sacrifice a land. (This cost is paid as attackers are declared.)"});
const leviathan = card("Leviathan", "Creature — Leviathan", "{5}{U}{U}{U}{U}", {"cmc":9,"power":"10","toughness":"10","keywords":["Trample"],"oracleText":"Trample\nThis creature enters tapped and doesn't untap during your untap step.\nAt the beginning of your upkeep, you may sacrifice two Islands. If you do, untap this creature.\nThis creature can't attack unless you sacrifice two Islands. (This cost is paid as attackers are declared.)"});
const floodtideSerpent = card("Floodtide Serpent", "Creature — Serpent", "{4}{U}", {"cmc":5,"power":"4","toughness":"4","oracleText":"This creature can't attack unless you return an enchantment you control to its owner's hand. (This cost is paid as attackers are declared.)"});

/** Passes to `s`'s declare attackers step and declares these attacks at `defender` (no settling: a cost may be asked for). */
const declare = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
/** Removes `pid`'s lands but these. */
const keepLands = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && objIsType(s, s.objects[id]!, "Land") && !keep.includes(id)) moveObject(s, id, "exile");
};
const islandCard = (name = "Island") => card(name, "Basic Land — Island", "", { supertypes: ["Basic"], oracleText: "({T}: Add {U}.)" });

const dropOfHoney = card("Drop of Honey", "Enchantment", "{G}", {"cmc":1,"oracleText":"At the beginning of your upkeep, destroy the creature with the least power. It can't be regenerated. If two or more creatures are tied for least power, you choose one of them.\nWhen there are no creatures on the battlefield, sacrifice this enchantment."});
const porphyryNodes = card("Porphyry Nodes", "Enchantment", "{W}", {"cmc":1,"oracleText":"At the beginning of your upkeep, destroy the creature with the least power. It can't be regenerated. If two or more creatures are tied for least power, you choose one of them.\nWhen there are no creatures on the battlefield, sacrifice this enchantment."});
const purgingScythe = card("Purging Scythe", "Artifact", "{5}", {"cmc":5,"oracleText":"At the beginning of your upkeep, this artifact deals 2 damage to the creature with the least toughness. If two or more creatures are tied for least toughness, you choose one of them."});
const stoneImp = () => creature("Stone Imp", "Creature — Imp", "{1}{B}", 1, 1, { cmc: 2, keywords: ["Indestructible"], oracleText: "Indestructible" });
const tinyElf = () => creature("Tiny Elf", "Creature — Elf", "{G}", 1, 1, { cmc: 1 });
const thinWall = () => creature("Thin Wall", "Creature — Wall", "{1}", 0, 3, { cmc: 1 });
const taskMageAssembly = card("Task Mage Assembly", "Enchantment", "{2}{R}", {"cmc":3,"oracleText":"When there are no creatures on the battlefield, sacrifice this enchantment.\n{2}: This enchantment deals 1 damage to target creature. Any player may activate this ability but only as a sorcery."});
/** On to `pid`'s next upkeep, stopping when `pid` is asked to pick. */
const nextUpkeep = (s: GameState, pid: PlayerId) => settle(passUntil(passUntil(s, "end"), "upkeep", pid), at("pickPermanents", pid));

describe("Lane B round 26", () => {
  it("supports every card of the round", () => {
    supported(avenShrine, nantukoShrine, dwarvenShrine, cabalShrine, cephalidShrine, floralSpuzzem, kukemssaPirates, goblinVandal, rysorianBadger, orcishSquatters, cloakOfConfusion, exaltedDragon, leviathan, floodtideSerpent, dropOfHoney, porphyryNodes, purgingScythe, taskMageAssembly);
  });

  it("the Shrines count the cards in all graveyards with the cast spell's name", () => {
    const { s: s0, ap, ids, opp } = setup([whiteCharm(), whiteCharm()]);
    putOnBattlefield(s0, ap, avenShrine);
    putOnBattlefield(s0, ap, dwarvenShrine);
    putOnBattlefield(s0, ap, nantukoShrine);
    // One named White Charm in each of two graveyards; a differently named card doesn't count.
    const charm = whiteCharm();
    into(s0, ap, charm, "graveyard");
    into(s0, opp, card("White Charm", "Instant", "{W}", { cmc: 1, oracleText: "You gain 1 life." }), "graveyard");
    into(s0, opp, greenBear(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!));
    // Aven Shrine +2, Dwarven Shrine 2 × 2 damage, White Charm +1.
    expect(life(s, ap)).toBe(40 + 2 - 4 + 1);
    expect(mine(s, ap, "Squirrel Token")).toHaveLength(2);
    // Now three of them are in graveyards (the one just cast too).
    s = priorityTo(s, ap);
    pool(s, ap, { W: 1 });
    s = settle(castNow(s, ap, ids[1]!));
    expect(life(s, ap)).toBe(39 + 3 - 6 + 1);
    expect(mine(s, ap, "Squirrel Token")).toHaveLength(5);
  });

  it("Cabal Shrine: that player discards X cards; with no card of that name, none", () => {
    const { s: s0, ap, ids } = setup([whiteCharm(), whiteKnight(), greenBear()]);
    putOnBattlefield(s0, ap, cabalShrine);
    into(s0, ap, whiteCharm(), "graveyard");
    const before = handOf(s0, ap);
    let s = settle(castNow(s0, ap, ids[0]!), at("discard", ap));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(handOf(s, ap)).toBe(before - 2);
    s = priorityTo(s, ap);
    pool(s, ap, { G: 2 });
    s = settle(castNow(s, ap, ids[2]!));
    expect(handOf(s, ap)).toBe(before - 3);
    expect(zone(s, ids[2]!)).toBe("battlefield");
  });

  it("Cephalid Shrine: counter that spell unless its caster pays {X}", () => {
    const { s: s0, ap, ids } = setup([whiteCharm(), whiteCharm()]);
    putOnBattlefield(s0, ap, cephalidShrine);
    into(s0, ap, whiteCharm(), "graveyard");
    into(s0, ap, whiteCharm(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), at("payUnless", ap));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}" });
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(life(s, ap)).toBe(40);
  });

  it("Floral Spuzzem: destroying the artifact means no combat damage; an indestructible one isn't destroyed, so it deals its damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const spuzzem = putOnBattlefield(s0, ap, floralSpuzzem);
    const pot = putOnBattlefield(s0, opp, ironPot());
    let s = unblocked(s0, spuzzem, opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, pot)).toBe("graveyard");
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(40);

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const spuzzem1 = putOnBattlefield(s1, ap1, floralSpuzzem);
    const tough = putOnBattlefield(s1, opp1, ironPot({ keywords: ["Indestructible"], oracleText: "Indestructible" }));
    let t = settle(act(unblocked(s1, spuzzem1, opp1), { type: "chooseMay", player: ap1, yes: true }));
    expect(zone(t, tough)).toBe("battlefield");
    t = passUntil(t, "end");
    expect(life(t, opp1)).toBe(38);
  });

  it("Kukemssa Pirates and Orcish Squatters: gaining control means no combat damage; declining, the damage is dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const pirates = putOnBattlefield(s0, ap, kukemssaPirates);
    const pot = putOnBattlefield(s0, opp, ironPot());
    let s = settle(act(unblocked(s0, pirates, opp), { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[pot]!.controller === ap || characteristics(s, s.objects[pot]!).controller === ap).toBe(true);
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(40);

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const squatters = putOnBattlefield(s1, ap1, orcishSquatters);
    const land = putOnBattlefield(s1, opp1, card("Sandy Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    let t = settle(act(unblocked(s1, squatters, opp1), { type: "chooseMay", player: ap1, yes: false }));
    expect(characteristics(t, t.objects[land]!).controller).toBe(opp1);
    t = passUntil(t, "end");
    expect(life(t, opp1)).toBe(38);
  });

  it("Orcish Squatters: the land stays only as long as you control it", () => {
    const { s: s0, ap, opp } = setup([]);
    const squatters = putOnBattlefield(s0, ap, orcishSquatters);
    const land = putOnBattlefield(s0, opp, card("Sandy Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    let s = settle(act(unblocked(s0, squatters, opp), { type: "chooseMay", player: ap, yes: true }));
    expect(characteristics(s, s.objects[land]!).controller).toBe(ap);
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(40);
    // Squatters leaves: the land goes back.
    moveObject(s, squatters, "graveyard");
    expect(characteristics(s, s.objects[land]!).controller).toBe(opp);
  });

  it("Goblin Vandal: pay {R} to destroy the artifact instead of dealing damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const vandal = putOnBattlefield(s0, ap, goblinVandal);
    const pot = putOnBattlefield(s0, opp, ironPot());
    let s = unblocked(s0, vandal, opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{R}" } });
    pool(s, ap, { R: 1 });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, pot)).toBe("graveyard");
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(40);

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const vandal1 = putOnBattlefield(s1, ap1, goblinVandal);
    const pot1 = putOnBattlefield(s1, opp1, ironPot());
    let t = settle(act(unblocked(s1, vandal1, opp1), { type: "chooseMay", player: ap1, yes: false }));
    expect(zone(t, pot1)).toBe("battlefield");
    t = passUntil(t, "end");
    expect(life(t, opp1)).toBe(39);
  });

  it("Rysorian Badger: exile up to two creature cards, gain 1 life for each, and deal no combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const badger = putOnBattlefield(s0, ap, rysorianBadger);
    const a = into(s0, opp, greenBear(), "graveyard");
    const b = into(s0, opp, whiteKnight(), "graveyard");
    let s = unblocked(s0, badger, opp);
    expect(s.resolving?.item.targets?.map((t) => (t.kind === "object" ? t.id : ""))).toEqual(expect.arrayContaining([a, b]));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(life(s, ap)).toBe(42);
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(40);
  });

  it("Cloak of Confusion: no combat damage, and defending player discards a card at random", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const cloak = putOnBattlefield(s0, ap, cloakOfConfusion);
    s0.objects[cloak]!.attachedTo = bear;
    invalidateCharacteristics(s0);
    const before = handOf(s0, opp);
    let s = unblocked(s0, bear, opp);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(handOf(s, opp)).toBe(before - 1);
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(40);
  });

  it("Exalted Dragon: sacrifice a land as it's declared an attacker; with no land, it can't attack", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, exaltedDragon);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && objIsType(s0, s0.objects[id]!, "Land"));
    let s = declare(s0, [dragon], opp);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", attackCost: true, count: 1, objectId: dragon });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([...lands].sort());
    expect(s.objects[dragon]!.attacking).toBe(opp);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [lands[0]!] }));
    expect(zone(s, lands[0]!)).toBe("graveyard");
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(35);

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const dragon1 = putOnBattlefield(s1, ap1, exaltedDragon);
    keepLands(s1, ap1);
    expect(attackProblem(s1, s1.objects[dragon1]!, opp1)).toMatch(/can't attack unless you sacrifice a land/);
    expect(() => declare(s1, [dragon1], opp1)).toThrow(/can't attack/);
  });

  it("Leviathan needs two Islands, Floodtide Serpent an enchantment to return; together each permanent pays only one cost", () => {
    const { s: s0, ap, opp } = setup([]);
    const lev = putOnBattlefield(s0, ap, leviathan);
    const dragon = putOnBattlefield(s0, ap, exaltedDragon);
    const i1 = putOnBattlefield(s0, ap, islandCard());
    const i2 = putOnBattlefield(s0, ap, islandCard("Snow-Covered Island"));
    keepLands(s0, ap, [i1, i2]);
    // Two Islands and no other land: not both of them.
    expect(attackProblem(s0, s0.objects[lev]!, opp)).toBeNull();
    expect(() => declare(s0, [lev, dragon], opp)).toThrow(/costs to attack/);
    const forest = putOnBattlefield(s0, ap, card("Grassy Field", "Land", "", { oracleText: "{T}: Add {G}." }));
    let s = declare(s0, [dragon, lev], opp);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", attackCost: true, objectId: dragon, count: 1 });
    // An Island for the Dragon would leave Leviathan one short.
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [i1] })).toThrow(/needed for the other costs/);
    s = act(s, { type: "pickPermanents", player: ap, ids: [forest] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", attackCost: true, objectId: lev, count: 2 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [i1, i2] }));
    expect([zone(s, forest), zone(s, i1), zone(s, i2)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(25);

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const serpent = putOnBattlefield(s1, ap1, floodtideSerpent);
    expect(attackProblem(s1, s1.objects[serpent]!, opp1)).toMatch(/return an enchantment you control/);
    const ench = putOnBattlefield(s1, ap1, card("Quiet Glade", "Enchantment", "{1}", { cmc: 1 }));
    let t = declare(s1, [serpent], opp1);
    expect(t.pending).toMatchObject({ kind: "pickPermanents", action: "bounce", attackCost: true, options: [ench] });
    t = settle(act(t, { type: "pickPermanents", player: ap1, ids: [ench] }));
    expect(zone(t, ench)).toBe("hand");
    expect(t.objects[serpent]!.attacking).toBe(opp1);
  });

  it("a bot attacks with Exalted Dragon when it has lands to spare, sacrificing its least valuable land", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const dragon = putOnBattlefield(s0, ap, exaltedDragon);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && objIsType(s0, s0.objects[id]!, "Land")).length;
    let s = s0;
    for (let i = 0; i < 60 && !(s.step === "declareBlockers" || s.step === "combatDamage" || s.step === "end"); i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[dragon]!.attacking).toBeDefined();
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Land")).length).toBe(lands - 1);
  });
  it("Drop of Honey destroys the creature with the least power, anyone's; of those tied, one you choose that can be destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dropOfHoney);
    const beast = putOnBattlefield(s0, ap, bigBeast());
    const imp = putOnBattlefield(s0, opp, stoneImp());
    const elf = putOnBattlefield(s0, opp, tinyElf());
    const mine1 = putOnBattlefield(s0, ap, tinyElf());
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = nextUpkeep(s0, ap);
    // Tied for least power (1): the indestructible Imp can't be destroyed, so one of the Elves (rulings).
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([elf, mine1].sort());
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [imp] })).toThrow();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [elf] }));
    expect([zone(s, elf), zone(s, mine1), zone(s, imp), zone(s, bear), zone(s, beast)]).toEqual(["graveyard", "battlefield", "battlefield", "battlefield", "battlefield"]);
    // Next upkeep: my Elf is the only destroyable one tied for least power.
    s = nextUpkeep(s, ap);
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine1] }));
    expect(zone(s, mine1)).toBe("graveyard");
    // Then only the indestructible Imp has the least power: nothing is destroyed (rulings).
    s = settle(nextUpkeep(s, ap));
    expect([zone(s, imp), zone(s, bear), zone(s, beast)]).toEqual(["battlefield", "battlefield", "battlefield"]);
  });

  it("Porphyry Nodes: the creature can't be regenerated; with no creatures on the battlefield it's sacrificed", () => {
    const { s: s0, ap, opp } = setup([]);
    const nodes = putOnBattlefield(s0, ap, porphyryNodes);
    const elf = putOnBattlefield(s0, opp, tinyElf());
    s0.objects[elf]!.regenShields = 1;
    let s = nextUpkeep(s0, ap);
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [elf] }));
    expect(zone(s, elf)).toBe("graveyard");
    // No creatures left: the state trigger sacrifices it (CR 603.8).
    s = settle(s);
    expect(zone(s, nodes)).toBe("graveyard");
  });

  it("Purging Scythe deals 2 damage to the creature with the least toughness", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, purgingScythe);
    const wall = putOnBattlefield(s0, opp, thinWall());
    const bear = putOnBattlefield(s0, opp, greenBear());
    const knight = putOnBattlefield(s0, ap, whiteKnight());
    let s = nextUpkeep(s0, ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([bear, knight].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bear] }));
    expect([zone(s, bear), zone(s, knight), zone(s, wall)]).toEqual(["graveyard", "battlefield", "battlefield"]);
  });

  it("a bot's Drop of Honey picks an opponent's creature among those tied", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dropOfHoney);
    const mineElf = putOnBattlefield(s0, ap, tinyElf());
    const theirs = putOnBattlefield(s0, opp, tinyElf());
    const s = nextUpkeep(s0, ap);
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [theirs] }]);
    expect(mineElf).toBeDefined();
  });

  it("Task Mage Assembly: with the last creature dead, the state trigger sacrifices it", () => {
    const { s: s0, ap, opp } = setup([]);
    const assembly = putOnBattlefield(s0, ap, taskMageAssembly);
    const elf = putOnBattlefield(s0, opp, tinyElf());
    pool(s0, ap, { C: 2 });
    const s = settle(activateNow(s0, ap, assembly, 0, [tgt(elf)]));
    expect([zone(s, elf), zone(s, assembly)]).toEqual(["graveyard", "graveyard"]);
  });
});
