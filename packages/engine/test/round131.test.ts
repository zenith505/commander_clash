// Round 131: round 130's gaps (Zada's copy order, The Master, Idol of Endurance), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, botActions, castProblem, characteristics, defOf, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
/** Everyone passes until something asks a player to choose (or the stack is empty). */
const passToPending = (s: GameState) => {
  for (let i = 0; i < 30 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
/** A fresh copy of `def` put into `pid`'s `zone` (on top of the library). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, zone: "library" | "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((n) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!);
const ogre = (name = "Test Ogre") => card(name, "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
const nameOf = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id) === name);
const kill = card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature." });

const zada = card("Zada, Hedron Grinder", "Legendary Creature — Goblin Ally", "{3}{R}", { power: "3", toughness: "3", oracleText: "Whenever you cast an instant or sorcery spell that targets only Zada, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures." });
const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

describe("Zada: the copies' controller chooses the order they go on the stack (rulings)", () => {
  it("the creature picked first gets the copy put on the stack first, which resolves after the others", () => {
    supported(zada);
    const { s: s0, ap, ids } = setup([giantGrowth]);
    const z = putOnBattlefield(s0, ap, zada);
    const a = putOnBattlefield(s0, ap, ogre("Ogre A"));
    const b = putOnBattlefield(s0, ap, ogre("Ogre B"));
    const c = putOnBattlefield(s0, ap, ogre("Ogre C"));
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: z }])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder", player: ap });
    const pend = s.pending as { options: string[]; labels: string[] };
    expect([...pend.options].sort()).toEqual([a, b, c].sort());
    expect(pend.labels[pend.options.indexOf(a)]).toBe(`Ogre A (${s.players[ap]!.name})`);
    s = act(s, { type: "chooseOption", player: ap, choice: c });
    // Two left to order; the one picked must be among them.
    expect(s.pending).toMatchObject({ what: "copyOrder" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([a, b].sort());
    expect(() => act(s, { type: "chooseOption", player: ap, choice: c })).toThrow();
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    // The last copy needs no question.
    expect(s.pending).toBeNull();
    const copies = s.stack.filter((x) => x.copy).map((x) => (x.targets?.[0] as { id: string }).id);
    expect(copies).toEqual([c, b, a]); // bottom to top: Ogre A's copy resolves first
    s = settleBots(s);
    expect([z, a, b, c].map((id) => characteristics(s, s.objects[id]!).power)).toEqual([6, 6, 6, 6]);
  });
});

const nightmareShepherd = card("Nightmare Shepherd", "Enchantment Creature — Demon", "{2}{B}{B}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever another nontoken creature you control dies, you may exile it. If you do, create a token that's a copy of that creature, except it's 1/1 and it's a Nightmare in addition to its other types." });
const myrkul = card("Myrkul, Lord of Bones", "Legendary Creature — God", "{4}{W}{B}{G}", { power: "7", toughness: "5", oracleText: "As long as your life total is less than or equal to half your starting life total, Myrkul has indestructible.\nWhenever another nontoken creature you control dies, you may exile it. If you do, create a token that's a copy of that card, except it's an enchantment and loses all other card types." });
const theMaster = card("The Master, Gallifrey's End", "Legendary Creature — Time Lord Rogue", "{2}{B}{R}", { power: "4", toughness: "3", keywords: ["Make Them Pay"], oracleText: "Make Them Pay — Whenever a nontoken artifact creature you control dies, you may exile it. If you do, choose an opponent with the most life among your opponents. That player faces a villainous choice — They lose 4 life, or you create a token that's a copy of that card." });
const clone = card("Test Clone", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield." });
const construct = card("Test Construct", "Artifact Creature — Construct", "{3}", { power: "3", toughness: "3" });

/** `def` dies under `ap` with `watcher` on the battlefield; returns the state paused on the watcher's "you may exile it". */
const dies = (watcher: CardDef, def: CardDef) => {
  const { s: s0, ap, ids } = setup([kill]);
  const w = putOnBattlefield(s0, ap, watcher);
  const victim = putOnBattlefield(s0, ap, def);
  const s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }])));
  return { s, ap, w, victim };
};

describe("\"Whenever another nontoken creature you control dies, you may exile it. If you do, ...\"", () => {
  it("Nightmare Shepherd: exiling it makes a 1/1 Nightmare copy of the creature", () => {
    supported(nightmareShepherd, myrkul, theMaster);
    let { s, ap, victim } = dies(nightmareShepherd, ogre("Doomed Ogre"));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[victim]!.zone).toBe("exile");
    const [t] = tokensNamed(s, "Doomed Ogre");
    const ch = characteristics(s, s.objects[t!]!);
    expect([ch.power, ch.toughness]).toEqual([1, 1]);
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Ogre", "Nightmare"]));
  });
  it("Nightmare Shepherd: declining leaves the card in the graveyard and makes no token", () => {
    let { s, ap, victim } = dies(nightmareShepherd, ogre("Doomed Ogre"));
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(tokensNamed(s, "Doomed Ogre")).toEqual([]);
  });
  it("Nightmare Shepherd: no question once the card has left the graveyard, and no token (CR 400.7)", () => {
    // The card leaves the graveyard before the trigger resolves.
    const { s: s2, ap: ap2, ids } = setup([kill]);
    putOnBattlefield(s2, ap2, nightmareShepherd);
    const v = putOnBattlefield(s2, ap2, ogre("Doomed Ogre"));
    let t = run(s2, planCast(s2, ap2, ids[0]!, [{ kind: "object", id: v }]));
    for (let i = 0; i < 30 && t.stack.length + t.triggerQueue.length > 0 && !t.stack.some((x) => x.kind === "ability"); i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.stack.some((x) => x.kind === "ability")).toBe(true);
    const q = t.players[ap2]!;
    q.graveyard.splice(q.graveyard.indexOf(v), 1);
    t.objects[v]!.zone = "exile";
    t.objects[v]!.zoneChanges = (t.objects[v]!.zoneChanges ?? 0) + 1;
    q.exile.push(v);
    t = passToPending(t);
    expect(t.pending).toBeNull();
    expect(tokensNamed(t, "Doomed Ogre")).toEqual([]);
  });
  it("Nightmare Shepherd copies the creature as it last existed: a Clone that copied an Ogre comes back as the Ogre (rulings)", () => {
    const { s: s0, ap, ids } = setup([kill]);
    putOnBattlefield(s0, ap, nightmareShepherd);
    const o = putOnBattlefield(s0, ap, ogre("Original Ogre"));
    const cl = putOnBattlefield(s0, ap, clone);
    s0.objects[cl]!.copyOf = s0.objects[o]!.cardId;
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: cl }])));
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: true }));
    const toks = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(toks.map((id) => nameOf(s, id))).toEqual(["Original Ogre"]);
  });
  it("Myrkul: a copy of the card, an enchantment that's no longer a creature (rulings: of the card, not the creature)", () => {
    const { s: s0, ap, ids } = setup([kill]);
    putOnBattlefield(s0, ap, myrkul);
    const o = putOnBattlefield(s0, ap, ogre("Original Ogre"));
    const cl = putOnBattlefield(s0, ap, clone);
    s0.objects[cl]!.copyOf = s0.objects[o]!.cardId;
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: cl }])));
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // The token is a Test Clone, which may enter as a copy of something (it's an enchantment Clone).
    s = settleBots(s);
    const toks = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(toks.length).toBe(1);
    expect(s.cards[s.objects[toks[0]!]!.cardId]!.name).toBe("Test Clone");
  });
  it("Myrkul: a creature card becomes an enchantment token with no creature type", () => {
    let { s, ap } = dies(myrkul, ogre("Doomed Ogre"));
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: true }));
    const [t] = tokensNamed(s, "Doomed Ogre");
    const ch = characteristics(s, s.objects[t!]!);
    expect(ch.types).toEqual(["Enchantment"]);
    expect(ch.subtypes).toEqual([]);
  });
  it("The Master: the opponent with the most life faces the choice; losing 4 life or a token copy for you", () => {
    let { s, ap } = dies(theMaster, construct);
    const opps = opponentsOf(s, ap);
    s.players[opps[1]!]!.life = 45;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // One opponent has the most life: no choice of opponent needed.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[1] });
    s = settleBots(act(s, { type: "chooseOption", player: opps[1]!, choice: "1" }));
    expect(tokensNamed(s, "Test Construct").length).toBe(1);
    expect(s.players[opps[1]!]!.life).toBe(45);
  });
  it("The Master: tied opponents are offered; the chosen one loses 4 life", () => {
    let { s, ap } = dies(theMaster, construct);
    const opps = opponentsOf(s, ap);
    s.players[opps[0]!]!.life = 30;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    expect((s.pending as { options: string[] }).options.map(Number).sort()).toEqual([opps[1], opps[2]].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: String(opps[2]) });
    expect(s.pending).toMatchObject({ what: "villainous", player: opps[2] });
    s = settleBots(act(s, { type: "chooseOption", player: opps[2]!, choice: "0" }));
    expect(s.players[opps[2]!]!.life).toBe(36);
    expect(tokensNamed(s, "Test Construct")).toEqual([]);
  });
  it("The Master: not exiling it means no villainous choice; a non-artifact creature doesn't trigger it", () => {
    let { s, ap } = dies(theMaster, construct);
    const life = s.turnOrder.map((pid) => s.players[pid]!.life);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toBeNull();
    s = settleBots(s);
    expect(logText(s)).not.toMatch(/faces? a villainous choice and chooses/);
    expect(s.turnOrder.map((pid) => s.players[pid]!.life)).toEqual(life);
    expect(tokensNamed(s, "Test Construct")).toEqual([]);
    const { s: s2 } = dies(theMaster, ogre("Doomed Ogre"));
    expect(s2.pending).toBeNull();
  });
});

const idol = card("Idol of Endurance", "Artifact", "{2}{W}", { oracleText: "When this artifact enters, exile all creature cards with mana value 3 or less from your graveyard until this artifact leaves the battlefield.\n{1}{W}, {T}: Until end of turn, you may cast a creature spell from among cards exiled with this artifact without paying its mana cost." });
const bigOne = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const shatter = card("Test Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });

/** Idol of Endurance cast with an Ogre (3), a Giant (5) and an instant in the graveyard; its enters trigger resolved. */
const idolIn = () => {
  const { s: s0, ap, ids } = setup([idol, shatter]);
  const o = putIn(s0, ap, ogre("Yard Ogre"), "graveyard");
  const g = putIn(s0, ap, bigOne, "graveyard");
  const sh = putIn(s0, ap, shock, "graveyard");
  let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
  const i = s.battlefield.find((id) => nameOf(s, id) === "Idol of Endurance")!;
  return { s, ap, i, o, g, sh, shatterId: ids[1]! };
};

describe("Idol of Endurance: creature cards with mana value 3 or less exiled until it leaves, cast free one at a time", () => {
  it("exiles only the creature cards with mana value 3 or less, which return to the graveyard when it leaves (CR 610.3)", () => {
    supported(idol);
    let { s, ap, o, g, sh, shatterId, i } = idolIn();
    expect([o, g, sh].map((id) => s.objects[id]!.zone)).toEqual(["exile", "graveyard", "graveyard"]);
    s = settleBots(run(s, planCast(s, ap, shatterId, [{ kind: "object", id: i }])));
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(o);
  });
  it("{1}{W}, {T}: one creature spell from among them this turn, without paying its mana cost", () => {
    let { s, ap, i, o } = idolIn();
    expect(castProblem(s, ap, o, undefined, undefined, undefined, undefined, undefined, { alt: "linkedFree" })).not.toBeNull();
    s = settleBots(run(s, planActivate(s, ap, i, 0)));
    expect(altCostsFor(s, ap, s.objects[o]!).map((a) => a.kind)).toContain("linkedFree");
    // Only for free: not for its mana cost.
    expect(castProblem(s, ap, o)).not.toBeNull();
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped);
    s = settleBots(run(s, planCast(s, ap, o, undefined, undefined, "auto", undefined, { alt: "linkedFree" })));
    expect(s.objects[o]!.zone).toBe("battlefield");
    // Nothing was tapped to pay for it.
    expect(untapped.filter((id) => s.objects[id]!.tapped)).toEqual([]);
  });
  it("a card put into the graveyard after it entered wasn't exiled with it, so it can't be cast this way", () => {
    let { s, ap, i } = idolIn();
    const o2 = putIn(s, ap, ogre("Second Ogre"), "graveyard");
    s = settleBots(run(s, planActivate(s, ap, i, 0)));
    expect(castProblem(s, ap, o2, undefined, undefined, undefined, undefined, undefined, { alt: "linkedFree" })).not.toBeNull();
  });
  it("a creature spell only: a noncreature card exiled with it can't be cast this way", () => {
    let { s, ap, i, o } = idolIn();
    s = settleBots(run(s, planActivate(s, ap, i, 0)));
    // Pretend the exiled Ogre is an instant by swapping its definition: the filter checks the card's types.
    s.cards[s.objects[o]!.cardId] = { ...s.cards[s.objects[o]!.cardId]!, types: ["Instant"], typeLine: "Instant" };
    expect(castProblem(s, ap, o, undefined, undefined, undefined, undefined, undefined, { alt: "linkedFree" })).not.toBeNull();
  });
  it("if it has already left as its trigger resolves, nothing is exiled (CR 610.3c)", () => {
    const { s: s0, ap, ids } = setup([idol, shatter]);
    const o = putIn(s0, ap, ogre("Yard Ogre"), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 30 && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const idolId = s.battlefield.find((id) => nameOf(s, id) === "Idol of Endurance")!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: idolId }]));
    s = settleBots(s);
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(logText(s)).toMatch(/Idol of Endurance has left the battlefield, so nothing is exiled/);
  });
});

void passUntil;
