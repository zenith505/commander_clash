// Lane B, round 24: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, objIsType, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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

// Real oracle text (Scryfall).
const woodElemental = card("Wood Elemental", "Creature — Elemental", "{3}{G}", {"cmc":4,"power":"*","toughness":"*","oracleText":"As this creature enters, sacrifice any number of untapped Forests.\nWood Elemental's power and toughness are each equal to the number of Forests sacrificed as it entered."});
const dracoplasm = card("Dracoplasm", "Creature — Shapeshifter", "{U}{R}", {"cmc":2,"power":"0","toughness":"0","keywords":["Flying"],"oracleText":"Flying\nAs this creature enters, sacrifice any number of creatures. This creature's power becomes the total power of those creatures and its toughness becomes their total toughness.\n{R}: This creature gets +1/+0 until end of turn."});
const shimatsuTheBloodcloaked = card("Shimatsu the Bloodcloaked", "Legendary Creature — Demon Spirit", "{3}{R}", {"cmc":4,"power":"0","toughness":"0","oracleText":"As Shimatsu enters, sacrifice any number of permanents. Shimatsu enters with that many +1/+1 counters on it."});
const minionOfTheWastes = card("Minion of the Wastes", "Creature — Minion", "{3}{B}{B}{B}", {"cmc":6,"power":"*","toughness":"*","keywords":["Trample"],"oracleText":"Trample\nAs this creature enters, pay any amount of life.\nMinion of the Wastes's power and toughness are each equal to the life paid as it entered."});
const namelessRace = card("Nameless Race", "Creature", "{3}{B}", {"cmc":4,"power":"*","toughness":"*","keywords":["Trample"],"oracleText":"Trample\nAs this creature enters, pay any amount of life. The amount you pay can't be more than the total number of white nontoken permanents your opponents control plus the total number of white cards in their graveyards.\nNameless Race's power and toughness are each equal to the life paid as it entered."});
const phyrexianProcessor = card("Phyrexian Processor", "Artifact", "{4}", {"cmc":4,"oracleText":"As this artifact enters, pay any amount of life.\n{4}, {T}: Create an X/X black Phyrexian Minion creature token, where X is the life paid as this artifact entered."});
const brokenVisage = card("Broken Visage", "Instant", "{4}{B}", {"cmc":5,"oracleText":"Destroy target nonartifact attacking creature. It can't be regenerated. Create a black Spirit creature token. Its power is equal to that creature's power and its toughness is equal to that creature's toughness. Sacrifice the token at the beginning of the next end step."});
const kalitasBloodchiefOfGhet = card("Kalitas, Bloodchief of Ghet", "Legendary Creature — Vampire Warrior", "{5}{B}{B}", {"cmc":7,"power":"5","toughness":"5","oracleText":"{B}{B}{B}, {T}: Destroy target creature. If that creature dies this way, create a black Vampire creature token. Its power is equal to that creature's power and its toughness is equal to that creature's toughness."});
const ritualOfTheReturned = card("Ritual of the Returned", "Instant", "{3}{B}", {"cmc":4,"oracleText":"Exile target creature card from your graveyard. Create a black Zombie creature token. Its power is equal to that card's power and its toughness is equal to that card's toughness."});

describe("Lane B round 24", () => {
  it("supports every card of the round", () => {
    supported(woodElemental, dracoplasm, shimatsuTheBloodcloaked, minionOfTheWastes, namelessRace, phyrexianProcessor, brokenVisage, kalitasBloodchiefOfGhet, ritualOfTheReturned);
  });

  it("Wood Elemental: only untapped Forests can be sacrificed as it enters, and its P/T is how many were (rulings)", () => {
    const { s: s0, ap, ids } = setup([woodElemental]);
    pool(s0, ap, { G: 1, C: 3 });
    const forests = mine(s0, ap, "Forest");
    s0.objects[forests[0]!]!.tapped = true;
    let s = settle(castNow(s0, ap, ids[0]!), at("pickPermanents", ap));
    const p = s.pending;
    expect(p?.kind === "pickPermanents" && [...p.options].sort()).toEqual(forests.slice(1).sort());
    expect(p?.kind === "pickPermanents" && p.min).toBe(0);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: forests.slice(1) }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(pt(s, ids[0]!)).toBe("2/2");
    expect(forests.slice(1).map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(zone(s, forests[0]!)).toBe("battlefield");
  });

  it("Wood Elemental with no Forest sacrificed is 0/0 and dies; a bot keeps four lands", () => {
    const { s: s0, ap, ids } = setup([woodElemental]);
    pool(s0, ap, { G: 1, C: 3 });
    let s = settle(castNow(s0, ap, ids[0]!), at("pickPermanents", ap));
    // Fourteen lands: the bot sacrifices its three untapped Forests.
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: (s.pending as { options: string[] }).options }]);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Dracoplasm's power and toughness become the totals of the creatures sacrificed, as a layer 7b effect", () => {
    const { s: s0, ap, ids } = setup([dracoplasm]);
    const beast = putOnBattlefield(s0, ap, bigBeast());
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!), at("pickPermanents", ap));
    const p = s.pending;
    expect(p?.kind === "pickPermanents" && [...p.options].sort()).toEqual([beast, bear].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [beast, bear] }));
    expect(pt(s, ids[0]!)).toBe("6/7");
    expect([zone(s, beast), zone(s, bear)]).toEqual(["graveyard", "graveyard"]);
    // Its own pump still adds on top (layer 7c).
    pool(s, ap, { R: 1 });
    s = settle(activateNow(s, ap, ids[0]!, 0));
    expect(pt(s, ids[0]!)).toBe("7/7");
  });

  it("Shimatsu enters with a +1/+1 counter for each permanent sacrificed, lands too", () => {
    const { s: s0, ap, ids } = setup([shimatsuTheBloodcloaked]);
    pool(s0, ap, { R: 1, C: 3 });
    const bear = putOnBattlefield(s0, ap, greenBear());
    const swamp = mine(s0, ap, "Swamp")[0]!;
    let s = settle(castNow(s0, ap, ids[0]!), at("pickPermanents", ap));
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toContain(swamp);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bear, swamp] }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, ids[0]!)).toBe("2/2");
  });

  it("Minion of the Wastes: its controller pays any amount of life as it enters, and that's its P/T", () => {
    const { s: s0, ap, ids } = setup([minionOfTheWastes]);
    pool(s0, ap, { B: 3, C: 3 });
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("lifeAsEnters");
    expect(p?.kind === "chooseOption" && p.numberRange).toEqual({ min: 0, max: 40 });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "41" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "7" }));
    expect(life(s, ap)).toBe(33);
    expect(pt(s, ids[0]!)).toBe("7/7");
    expect(objIsType(s, s.objects[ids[0]!]!, "Creature")).toBe(true);
  });

  it("Minion of the Wastes with 0 life paid dies; a bot pays up to 7 and keeps 12 life", () => {
    const { s: s0, ap, ids } = setup([minionOfTheWastes]);
    pool(s0, ap, { B: 3, C: 3 });
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "7" }]);
    s.players[ap]!.life = 15;
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "3" }]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(life(s, ap)).toBe(15);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Nameless Race can't pay more than the white nontoken permanents opponents control plus white cards in their graveyards", () => {
    const { s: s0, ap, ids, opp } = setup([namelessRace]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s0, opp, whiteKnight());
    putOnBattlefield(s0, other, whiteKnight());
    putOnBattlefield(s0, ap, whiteKnight()); // yours doesn't count
    into(s0, opp, whiteCharm(), "graveyard");
    into(s0, ap, whiteCharm(), "graveyard"); // nor does your graveyard
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(s.pending?.kind === "chooseOption" && s.pending.numberRange).toEqual({ min: 0, max: 3 });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }));
    expect(pt(s, ids[0]!)).toBe("3/3");
    expect(life(s, ap)).toBe(37);
  });

  it("Nameless Race with nothing white to count pays nothing, without asking, and dies", () => {
    const { s: s0, ap, ids } = setup([namelessRace]);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(life(s, ap)).toBe(40);
  });

  it("Phyrexian Processor makes X/X Minions, X the life paid as it entered", () => {
    const { s: s0, ap, ids } = setup([phyrexianProcessor]);
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "5" }));
    expect(life(s, ap)).toBe(35);
    pool(s, ap, { C: 4 });
    s = settle(activateNow(s, ap, ids[0]!, 0));
    const minion = mine(s, ap, "Phyrexian Minion Token").concat(mine(s, ap, "Phyrexian Minion"));
    expect(minion.length).toBe(1);
    expect(pt(s, minion[0]!)).toBe("5/5");
  });
  it("Broken Visage: the Spirit token has the attacking creature's P/T as it last existed, goes to you, and is sacrificed at the next end step", () => {
    const { s: s0, ap, opp } = setup([]);
    const beast = putOnBattlefield(s0, ap, bigBeast());
    addEffect(s0, ap, [beast], [{ kind: "modifyPT", power: 2, toughness: 1 }]);
    const visage = into(s0, opp, brokenVisage);
    let s = attackWith(s0, [beast], opp);
    s = priorityTo(s, opp);
    pool(s, opp, { B: 1, C: 4 });
    s = settle(castNow(s, opp, visage, [tgt(beast)]));
    expect(zone(s, beast)).toBe("graveyard");
    const spirit = mine(s, opp, "Spirit Token").concat(mine(s, opp, "Spirit"));
    expect(spirit.length).toBe(1);
    expect(pt(s, spirit[0]!)).toBe("6/6");
    s = passUntil(s, "end");
    s = settle(s);
    expect(zone(s, spirit[0]!)).not.toBe("battlefield");
  });

  it("Kalitas makes a Vampire with the destroyed creature's P/T, but none if it didn't die (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const kalitas = putOnBattlefield(s0, ap, kalitasBloodchiefOfGhet);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    pool(s0, ap, { B: 3 });
    let s = settle(activateNow(s0, ap, kalitas, 0, [tgt(beast)]));
    expect(zone(s, beast)).toBe("graveyard");
    const vampire = mine(s, ap, "Vampire Token").concat(mine(s, ap, "Vampire"));
    expect(vampire.length).toBe(1);
    expect(pt(s, vampire[0]!)).toBe("4/5");
    // An indestructible creature doesn't die: no token.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const k1 = putOnBattlefield(s1, ap1, kalitasBloodchiefOfGhet);
    const wall = putOnBattlefield(s1, opp1, bigBeast());
    addEffect(s1, opp1, [wall], [{ kind: "addKeywords", keywords: ["Indestructible"] }]);
    pool(s1, ap1, { B: 3 });
    const t = settle(activateNow(s1, ap1, k1, 0, [tgt(wall)]));
    expect(zone(t, wall)).toBe("battlefield");
    expect(mine(t, ap1, "Vampire Token").concat(mine(t, ap1, "Vampire")).length).toBe(0);
  });

  it("Ritual of the Returned exiles the creature card and makes a Zombie with its power and toughness", () => {
    const { s: s0, ap, ids } = setup([ritualOfTheReturned]);
    const beast = into(s0, ap, bigBeast(), "graveyard");
    pool(s0, ap, { B: 1, C: 3 });
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(beast)]));
    expect(zone(s, beast)).toBe("exile");
    const zombie = mine(s, ap, "Zombie Token").concat(mine(s, ap, "Zombie"));
    expect(zombie.length).toBe(1);
    expect(pt(s, zombie[0]!)).toBe("4/5");
  });
});
