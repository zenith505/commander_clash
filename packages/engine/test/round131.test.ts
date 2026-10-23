// Round 131: round 130's gaps (Zada's copy order, The Master, Idol of Endurance), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, botActions, castProblem, characteristics, defOf, isFullySupported, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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

const dalkovan = card("Dalkovan Encampment", "Land", "", { oracleText: "This land enters tapped unless you control a Swamp or a Mountain.\n{T}: Add {W}.\n{2}{W}, {T}: Whenever you attack this turn, create two 1/1 red Warrior creature tokens that are tapped and attacking. Sacrifice them at the beginning of the next end step." });

describe("Dalkovan Encampment: \"whenever you attack this turn\", a delayed trigger made by an activated ability (CR 603.7)", () => {
  it("attacking makes two tapped and attacking Warriors, sacrificed at the next end step; not attacking makes none", () => {
    supported(dalkovan);
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dalkovan);
    const o = putOnBattlefield(s0, ap, ogre("Attacker"));
    let s = settleBots(run(s0, planActivate(s0, ap, d, 0)));
    expect(s.floatingTriggers?.length).toBe(1);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = settleBots(s);
    const warriors = tokensNamed(s, "Warrior Token");
    expect(warriors.length).toBe(2);
    expect(warriors.every((id) => s.objects[id]!.tapped && s.objects[id]!.attacking !== undefined)).toBe(true);
    s = passUntil(s, "end", ap);
    s = settleBots(s);
    expect(tokensNamed(s, "Warrior Token")).toEqual([]);
  });
  it("its ability lasts this turn only: attacking on a later turn makes nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dalkovan);
    const o = putOnBattlefield(s0, ap, ogre("Attacker"));
    let s = settleBots(run(s0, planActivate(s0, ap, d, 0)));
    s = passUntil(s, "end", ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = settleBots(s);
    expect(tokensNamed(s, "Warrior Token")).toEqual([]);
  });
});

const eidolon = card("Eidolon of Countless Battles", "Enchantment Creature — Spirit", "{1}{W}{W}", { power: "0", toughness: "0", keywords: ["Bestow"], oracleText: "Bestow {2}{W}{W} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nThis creature and enchanted creature each get +1/+1 for each creature you control and +1/+1 for each Aura you control." });
const testAura = card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" });

describe("Eidolon of Countless Battles: it and enchanted creature each get +1/+1 for each creature and each Aura you control", () => {
  it("as a creature it counts itself as a creature, not an Aura (rulings)", () => {
    supported(eidolon);
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, eidolon);
    putOnBattlefield(s0, ap, ogre());
    const pt = (s: GameState, id: string) => [characteristics(s, s.objects[id]!).power, characteristics(s, s.objects[id]!).toughness];
    expect(pt(s0, e)).toEqual([2, 2]);
  });
  it("bestowed: the enchanted creature gets it, counting the Eidolon as an Aura", () => {
    const { s: s0, ap, ids } = setup([eidolon, eidolon]);
    const o = putOnBattlefield(s0, ap, ogre());
    putOnBattlefield(s0, ap, ogre("Other Ogre"));
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: o }], undefined, "auto", undefined, { alt: "bestow" })));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(o);
    // Two creatures, one Aura: +3/+3.
    expect([characteristics(s, s.objects[o]!).power, characteristics(s, s.objects[o]!).toughness]).toEqual([6, 6]);
    // The Eidolon itself isn't a creature now and gets nothing.
    expect(characteristics(s, s.objects[ids[0]!]!).types).not.toContain("Creature");
  });
});

const nighthowler = card("Nighthowler", "Enchantment Creature — Horror", "{1}{B}{B}", { power: "0", toughness: "0", keywords: ["Bestow"], oracleText: "Bestow {2}{B}{B} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nThis creature and enchanted creature each get +X/+X, where X is the number of creature cards in all graveyards." });

describe("Nighthowler: it and enchanted creature each get +X/+X, X the creature cards in all graveyards", () => {
  it("as a creature it gets +X/+X; bestowed, the enchanted creature does", () => {
    supported(nighthowler);
    const { s: s0, ap, opp, ids } = setup([nighthowler, nighthowler]);
    putIn(s0, ap, ogre("Yard Ogre"), "graveyard");
    putIn(s0, opp, ogre("Their Ogre"), "graveyard");
    putIn(s0, opp, opt, "graveyard");
    const n = putOnBattlefield(s0, ap, nighthowler);
    const pt = (s: GameState, id: string) => [characteristics(s, s.objects[id]!).power, characteristics(s, s.objects[id]!).toughness];
    expect(pt(s0, n)).toEqual([2, 2]);
    const o = putOnBattlefield(s0, ap, ogre());
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: o }], undefined, "auto", undefined, { alt: "bestow" })));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(o);
    expect(pt(s, o)).toEqual([5, 5]);
  });
});

const matoya = card("Matoya, Archon Elder", "Legendary Creature — Human Warlock", "{2}{U}", { power: "1", toughness: "4", oracleText: "Whenever you scry or surveil, draw a card. (Draw after you scry or surveil.)" });
const chanceMet = card("Chance-Met Elves", "Creature — Elf Warrior", "{2}{G}", { power: "3", toughness: "2", oracleText: "Whenever you scry, put a +1/+1 counter on this creature. This ability triggers only once each turn." });
const phantasm = card("Thoughtbound Phantasm", "Creature — Spirit", "{U}", { power: "2", toughness: "2", keywords: ["Defender"], oracleText: "Defender\nWhenever you surveil, put a +1/+1 counter on this creature.\nAs long as this creature has three or more +1/+1 counters on it, it can attack as though it didn't have defender." });
const opt = card("Test Opt", "Instant", "{U}", { oracleText: "Scry 1." });
const surveil = card("Test Surveil", "Instant", "{U}", { oracleText: "Surveil 2." });
const scryZero = card("Test Scry X", "Instant", "{X}{U}", { oracleText: "Scry X." });
/** Cast `id`, keeping every looked-at card on top, and let everything resolve. */
const castScry = (s: GameState, pid: PlayerId, id: string, x?: number) => {
  s = run(s, planCast(s, pid, id, undefined, undefined, "auto", x));
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: p.player, top: p.cards, away: [] });
    else if (p) s = botActions(s, p.player).reduce((x2, a) => act(x2, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("\"Whenever you scry\", \"whenever you surveil\" (CR 701.22d, 701.25d)", () => {
  it("Matoya draws after a scry and after a surveil; Chance-Met Elves only once a turn; the Phantasm only on surveil", () => {
    supported(matoya, chanceMet, phantasm);
    const { s: s0, ap, ids } = setup([opt, opt, surveil]);
    putOnBattlefield(s0, ap, matoya);
    const elves = putOnBattlefield(s0, ap, chanceMet);
    const ph = putOnBattlefield(s0, ap, phantasm);
    const hand = () => s.players[ap]!.hand.length;
    let s = s0;
    const h0 = hand();
    s = castScry(s, ap, ids[0]!);
    expect(hand()).toBe(h0 - 1 + 1);
    s = castScry(s, ap, ids[1]!);
    s = castScry(s, ap, ids[2]!);
    expect(hand()).toBe(h0 - 3 + 3);
    expect(s.objects[elves]!.counters["+1/+1"] ?? 0).toBe(1);
    expect(s.objects[ph]!.counters["+1/+1"] ?? 0).toBe(1);
  });
  it("scry 0 is no scry (CR 701.22b); scry 1 with an empty library still is (CR 701.22d)", () => {
    const { s: s0, ap, ids } = setup([scryZero, opt]);
    const elves = putOnBattlefield(s0, ap, chanceMet);
    let s = castScry(s0, ap, ids[0]!, 0);
    expect(s.objects[elves]!.counters["+1/+1"] ?? 0).toBe(0);
    for (const id of [...s.players[ap]!.library]) s.objects[id]!.zone = "exile";
    s.players[ap]!.exile.push(...s.players[ap]!.library);
    s.players[ap]!.library = [];
    s = castScry(s, ap, ids[1]!);
    expect(s.objects[elves]!.counters["+1/+1"] ?? 0).toBe(1);
  });
});

const planetarium = card("Planetarium of Wan Shi Tong", "Legendary Artifact", "{6}", { keywords: ["Scry"], oracleText: "{1}, {T}: Scry 2.\nWhenever you scry or surveil, look at the top card of your library. You may cast that card without paying its mana cost. Do this only once each turn. (Look at the card after you scry or surveil.)" });
const giant = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" });

describe("Planetarium of Wan Shi Tong: cast the top card free after you scry or surveil, once each turn", () => {
  it("the top card may be cast free as the trigger resolves; once cast, it doesn't trigger again this turn (rulings)", () => {
    supported(planetarium);
    const { s: s0, ap, ids } = setup([opt]);
    putOnBattlefield(s0, ap, planetarium);
    const g = putIn(s0, ap, giant, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop" });
    s = act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] });
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: g, player: ap });
    // The log names no card: it was only looked at.
    expect(logText(s)).toMatch(/looks at the top card of their library/);
    s = settleBots(act(s, { type: "castSpell", player: ap, objectId: g }));
    expect(s.objects[g]!.zone).toBe("battlefield");
    // Its own scry: no second trigger this turn.
    const p = s.battlefield.find((id) => nameOf(s, id) === "Planetarium of Wan Shi Tong")!;
    s = run(s, planActivate(s, ap, p, 0));
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop" });
    s = act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] });
    s = passToPending(s);
    expect(s.pending).toBeNull();
    expect(s.stack).toEqual([]);
  });
  it("declining to cast it lets it trigger again this turn", () => {
    const { s: s0, ap, ids } = setup([opt, opt]);
    putOnBattlefield(s0, ap, planetarium);
    putIn(s0, ap, giant, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passToPending(s);
    s = act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] });
    s = passToPending(s);
    expect(s.pending?.kind).toBe("castFree");
    s = passToPending(act(s, { type: "chooseMay", player: ap, yes: false }));
    s = run(s, planCast(s, ap, ids[1]!));
    s = passToPending(s);
    s = act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] });
    s = passToPending(s);
    expect(s.pending?.kind).toBe("castFree");
  });
});

const hashaton = card("Hashaton, Scarab's Fist", "Legendary Creature — Zombie Wizard", "{W}{B}", { power: "1", toughness: "3", oracleText: "Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that's a copy of that card, except it's a 4/4 black Zombie." });
const loot = card("Test Loot", "Sorcery", "{U}", { oracleText: "Draw a card, then discard a card." });
const flier = card("Test Flier", "Creature — Bird", "{1}{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });

describe("Hashaton, Scarab's Fist: a 4/4 black Zombie copy of a discarded creature card", () => {
  it("paying {2}{U} makes a tapped token copy, a 4/4 black Zombie with the card's abilities", () => {
    supported(hashaton);
    const { s: s0, ap, ids } = setup([loot]);
    putOnBattlefield(s0, ap, hashaton);
    const f = putIn(s0, ap, flier, "hand");
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = passToPending(act(s, { type: "discard", player: ap, objectIds: [f] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    for (const a of planMana(s, ap, parseManaCost("{2}{U}"))!) s = act(s, a);
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: true }));
    const [t] = tokensNamed(s, "Test Flier");
    const ch = characteristics(s, s.objects[t!]!);
    expect([ch.power, ch.toughness, ch.colors, ch.subtypes]).toEqual([4, 4, ["B"], ["Zombie"]]);
    expect(ch.keywords).toContain("Flying");
    expect(s.objects[t!]!.tapped).toBe(true);
  });
  it("discarding a noncreature card doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([loot]);
    putOnBattlefield(s0, ap, hashaton);
    const l = putIn(s0, ap, opt, "hand");
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    s = passToPending(act(s, { type: "discard", player: ap, objectIds: [l] }));
    expect(s.pending).toBeNull();
  });
});

const boxer = card("Bark-Knuckle Boxer", "Creature — Raccoon Berserker", "{1}{G}", { power: "3", toughness: "2", oracleText: "Whenever you expend 4, this creature gains indestructible until end of turn. (You expend 4 as you spend your fourth total mana to cast spells during a turn.)" });
const scout = card("Trailtracker Scout", "Creature — Raccoon Scout", "{1}{G}", { power: "1", toughness: "3", oracleText: "{T}: Add one mana of any color.\nWhenever you expend 8, return up to one target permanent card from your graveyard to your hand. (You expend 8 as you spend your eighth total mana to cast spells during a turn.)" });
const two = card("Test Two", "Sorcery", "{1}{G}", { oracleText: "You gain 1 life." });
const five = card("Test Five", "Sorcery", "{4}{G}", { oracleText: "You gain 1 life." });

describe("Expend (CR 700.14): the total mana spent casting spells this turn reaching N", () => {
  it("2 then 5: the second spell takes the total from 2 to 7, past 4 (the CR's example) but not 8; then a free spell adds nothing", () => {
    supported(boxer, scout);
    const { s: s0, ap, ids } = setup([two, five, two]);
    const b = putOnBattlefield(s0, ap, boxer);
    putOnBattlefield(s0, ap, scout);
    const y = putIn(s0, ap, ogre("Yard Ogre"), "graveyard");
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Indestructible");
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Indestructible");
    expect(s.objects[y]!.zone).toBe("graveyard");
    // From 7 to 9: past 8.
    s = passToPending(run(s, planCast(s, ap, ids[2]!)));
    s = settleBots(s);
    expect(s.objects[y]!.zone).toBe("hand");
  });
  it("it's counted per turn, and only spells count", () => {
    const { s: s0, ap, ids } = setup([five]);
    const b = putOnBattlefield(s0, ap, boxer);
    s0.players[ap]!.expended = { turn: s0.turn - 1, n: 3 };
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    // Last turn's 3 don't count: 0 to 5 is still past 4.
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Indestructible");
    expect(s.players[ap]!.expended).toEqual({ turn: s.turn, n: 5 });
  });
});

const wallOfRoots = card("Wall of Roots", "Creature — Plant Wall", "{1}{G}", { power: "0", toughness: "5", keywords: ["Defender"], oracleText: "Defender\nPut a -0/-1 counter on this creature: Add {G}. Activate only once each turn." });
const armorThrull = card("Armor Thrull", "Creature — Thrull", "{2}{B}", { power: "1", toughness: "3", oracleText: "{T}, Sacrifice this creature: Put a +1/+2 counter on target creature." });
const shieldSphere = card("Shield Sphere", "Artifact Creature — Wall", "{0}", { power: "0", toughness: "6", keywords: ["Defender"], oracleText: "Defender\nWhenever this creature blocks, put a -0/-1 counter on it." });

describe("Power/toughness counters other than +1/+1 and -1/-1: each +X/+Y counter gives +X/+Y (CR 122.1a, 613.4c)", () => {
  it("Wall of Roots: the -0/-1 counter is its mana ability's cost, once each turn, on any player's turn", () => {
    supported(wallOfRoots, armorThrull, shieldSphere);
    const { s: s0, ap } = setup([]);
    const nxt = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const w = putOnBattlefield(s0, nxt, wallOfRoots);
    const pt = (s: GameState) => [characteristics(s, s.objects[w]!).power, characteristics(s, s.objects[w]!).toughness];
    // On the active player's turn, once it has priority (CR 605.3a).
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(nxt);
    s = act(s, { type: "activateMana", player: nxt, objectId: w, mana: "G" });
    expect(s.players[nxt]!.manaPool.G).toBe(1);
    expect(s.objects[w]!.counters["-0/-1"]).toBe(1);
    expect(pt(s)).toEqual([0, 4]);
    expect(() => act(s, { type: "activateMana", player: nxt, objectId: w, mana: "G" })).toThrow();
    // Its own turn: again.
    s = passUntil(s, "upkeep", nxt);
    s = act(s, { type: "activateMana", player: nxt, objectId: w, mana: "G" });
    expect(s.objects[w]!.counters["-0/-1"]).toBe(2);
    expect(pt(s)).toEqual([0, 3]);
  });
  it("Armor Thrull: a +1/+2 counter, and a +1/+1 counter with it adds up", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, armorThrull);
    const o = putOnBattlefield(s0, ap, ogre());
    s0.objects[o]!.counters["+1/+1"] = 1;
    const s = settleBots(run(s0, planActivate(s0, ap, t, 0, [{ kind: "object", id: o }])));
    expect(s.objects[o]!.counters["+1/+2"]).toBe(1);
    expect([characteristics(s, s.objects[o]!).power, characteristics(s, s.objects[o]!).toughness]).toEqual([5, 6]);
  });
});

const champions = card("Champions from Beyond", "Enchantment", "{X}{W}{W}", { keywords: ["Full Party", "Light Party", "Scry"], oracleText: "When this enchantment enters, create X 1/1 colorless Hero creature tokens.\nLight Party — Whenever you attack with four or more creatures, scry 2, then draw a card.\nFull Party — Whenever you attack with eight or more creatures, those creatures get +4/+4 until end of turn." });

describe("Champions from Beyond: \"whenever you attack with eight or more creatures, those creatures get +4/+4\"", () => {
  const attackWith = (n: number) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, champions);
    const mine = Array.from({ length: n }, (_, i) => putOnBattlefield(s0, ap, ogre(`Ogre ${i}`)));
    const home = putOnBattlefield(s0, ap, ogre("Home Ogre"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: mine.map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: p.player, top: p.cards, away: [] });
      else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, mine, home };
  };
  it("eight attackers: each of them gets +4/+4, not the creature that stayed home; four or more: scry 2 and draw", () => {
    supported(champions);
    const { s, ap, mine, home } = attackWith(8);
    expect(mine.every((id) => characteristics(s, s.objects[id]!).power === 7)).toBe(true);
    expect(characteristics(s, s.objects[home]!).power).toBe(3);
    expect(logText(s)).toMatch(/scr(y|ies) 2/i);
    expect(s.players[ap]!.hand.length).toBeGreaterThan(0);
  });
  it("seven attackers: no +4/+4", () => {
    const { s, mine } = attackWith(7);
    expect(mine.every((id) => characteristics(s, s.objects[id]!).power === 3)).toBe(true);
  });
});

const dragonborn = card("Dragonborn Champion", "Creature — Dragon Warrior", "{2}{R}{G}", { power: "5", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nWhenever a source you control deals 5 or more damage to a player, draw a card." });
const blast = (n: number) => card(`Test Blast ${n}`, "Instant", "{R}", { oracleText: `Test Blast ${n} deals ${n} damage to any target.` });

describe("Dragonborn Champion: a source you control dealing 5 or more damage to a player at once (rulings)", () => {
  it("5 to an opponent draws; 4 doesn't; 5 to yourself does (a player)", () => {
    supported(dragonborn);
    const { s: s0, ap, opp, ids } = setup([blast(5), blast(4), blast(5)]);
    putOnBattlefield(s0, ap, dragonborn);
    const hand = (s: GameState) => s.players[ap]!.hand.length;
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(hand(s)).toBe(hand(s0) - 1 + 1);
    const h1 = hand(s);
    s = settleBots(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(hand(s)).toBe(h1 - 1);
    s = settleBots(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: ap }])));
    expect(hand(s)).toBe(h1 - 2 + 1);
  });
});

const frontlineMedic = card("Frontline Medic", "Creature — Human Cleric", "{2}{W}", { power: "3", toughness: "3", keywords: ["Battalion"], oracleText: "Battalion — Whenever this creature and at least two other creatures attack, creatures you control gain indestructible until end of turn.\nSacrifice this creature: Counter target spell with {X} in its mana cost unless its controller pays {3}." });
const xBurn = card("Test X Burn", "Instant", "{X}{R}", { oracleText: "Test X Burn deals X damage to any target." });

describe("Frontline Medic: \"counter target spell with {X} in its mana cost\" (CR 107.3)", () => {
  it("only a spell with {X} in its mana cost can be targeted; unpaid, it's countered", () => {
    supported(frontlineMedic);
    const { s: s0, ap, opp, ids } = setup([xBurn, blast(1)]);
    const m = putOnBattlefield(s0, ap, frontlineMedic);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 1));
    const spell = s.stack[s.stack.length - 1]!;
    s = run(s, planActivate(s, ap, m, 0, [{ kind: "stack", id: spell.id }]));
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{3}" });
    const life = s.players[opp]!.life;
    s = settleBots(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // A spell without {X}: not a legal target.
    const { s: t0, ap: ap2, opp: opp2, ids: ids2 } = setup([blast(1)]);
    const m2 = putOnBattlefield(t0, ap2, frontlineMedic);
    const t = run(t0, planCast(t0, ap2, ids2[0]!, [{ kind: "player", id: opp2 }]));
    const plain = t.stack[t.stack.length - 1]!;
    expect(() => run(t, planActivate(t, ap2, m2, 0, [{ kind: "stack", id: plain.id }]))).toThrow();
  });
});

const maester = card("Maester Seymour", "Legendary Creature — Human Elf Cleric", "{2}{G}", { power: "1", toughness: "3", keywords: ["Monstrosity"], oracleText: "At the beginning of combat on your turn, put a number of +1/+1 counters equal to Maester Seymour's power on another target creature you control.\n{3}{G}{G}: Monstrosity X, where X is the number of counters among creatures you control. (If this creature isn't monstrous, put X +1/+1 counters on it and it becomes monstrous.)" });

describe("Maester Seymour: counters equal to its power; monstrosity X counting counters among creatures you control", () => {
  it("beginning of combat: its power in +1/+1 counters on another creature; monstrosity X counts every kind of counter, X fixed as it resolves", () => {
    supported(maester);
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, maester);
    const o = putOnBattlefield(s0, ap, ogre());
    s0.objects[o]!.counters["-0/-1"] = 1;
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 20 && s.triggerQueue.length + s.stack.length > 0 || (i < 20 && s.pending); i++) {
      if (s.pending?.kind === "chooseTargets" || s.pending) s = botActions(s, s.pending!.player).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[o]!.counters["+1/+1"]).toBe(1);
    // Two counters among them: monstrosity 2.
    s = settleBots(run(s, planActivate(s, ap, m, 0)));
    expect(s.objects[m]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[m]!.monstrous).toBe(true);
  });
});

const comeBackWrong = card("Come Back Wrong", "Sorcery", "{2}{B}", { oracleText: "Destroy target creature. If a creature card is put into a graveyard this way, return it to the battlefield under your control. Sacrifice it at the beginning of your next end step." });
const testToken = card("Test Token Maker", "Sorcery", "{G}", { oracleText: "Create a 2/2 green Bear creature token." });

describe("Come Back Wrong: the destroyed creature's card returns under your control, sacrificed at your next end step", () => {
  it("an opponent's creature comes back under your control and is sacrificed at your end step, to its owner's graveyard", () => {
    supported(comeBackWrong);
    const { s: s0, ap, opp, ids } = setup([comeBackWrong]);
    const o = putOnBattlefield(s0, opp, ogre("Their Ogre"));
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: o }])));
    const back = s.battlefield.find((id) => nameOf(s, id) === "Their Ogre")!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.controller).toBe(ap);
    s = passUntil(s, "end", ap);
    s = settleBots(s);
    expect(s.battlefield.some((id) => nameOf(s, id) === "Their Ogre")).toBe(false);
    expect(s.players[opp]!.graveyard.some((id) => nameOf(s, id) === "Their Ogre")).toBe(true);
  });
  it("a token isn't a card: nothing comes back", () => {
    const { s: s0, ap, opp, ids } = setup([testToken, comeBackWrong]);
    const t0 = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const bear = t0.battlefield.find((id) => t0.objects[id]!.isToken)!;
    const s = settleBots(run(t0, planCast(t0, ap, ids[1]!, [{ kind: "object", id: bear }])));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
    void opp;
  });
});

const thundermane = card("Thundermane Dragon", "Creature — Dragon", "{3}{R}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nYou may look at the top card of your library any time.\nYou may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn." });

describe("Thundermane Dragon: creature spells with power 4 or greater from the top of your library, with haste", () => {
  it("a 5/5 on top is cast from there and has haste this turn only; a 3/3 can't be cast this way", () => {
    supported(thundermane);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, thundermane);
    const g = putIn(s0, ap, giant, "library");
    s0.players[ap]!.library = [g, ...s0.players[ap]!.library.filter((x) => x !== g)];
    let s = settleBots(run(s0, planCast(s0, ap, g)));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[g]!).keywords).toContain("Haste");
    const o = putIn(s, ap, ogre("Top Ogre"), "library");
    s.players[ap]!.library = [o, ...s.players[ap]!.library.filter((x) => x !== o)];
    expect(castProblem(s, ap, o)).not.toBeNull();
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[g]!).keywords).not.toContain("Haste");
  });
});

const nimDeathmantle = card("Nim Deathmantle", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+2, has intimidate, and is a black Zombie. (A creature with intimidate can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhenever a nontoken creature is put into your graveyard from the battlefield, you may pay {4}. If you do, return that card to the battlefield and attach this Equipment to it.\nEquip {4}" });

describe("Nim Deathmantle: pay {4} to return the creature card and attach it", () => {
  it("paying returns the card attached, a black Zombie 5/5; declining leaves it in the graveyard", () => {
    supported(nimDeathmantle);
    const { s: s0, ap, ids } = setup([kill, kill]);
    const nim = putOnBattlefield(s0, ap, nimDeathmantle);
    const o = putOnBattlefield(s0, ap, ogre("Doomed Ogre"));
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: o }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    for (const a of planMana(s, ap, parseManaCost("{4}"))!) s = act(s, a);
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(s.objects[nim]!.attachedTo).toBe(o);
    const ch = characteristics(s, s.objects[o]!);
    expect([ch.power, ch.toughness, ch.colors, ch.subtypes]).toEqual([5, 5, ["B"], ["Zombie"]]);
    s = passToPending(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: o }])));
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[o]!.zone).toBe("graveyard");
  });
});

const galuf = card("Galuf's Final Act", "Instant", "{1}{G}", { oracleText: "Until end of turn, target creature gets +1/+0 and gains \"When this creature dies, put a number of +1/+1 counters equal to its power on up to one target creature.\"" });

describe("\"Put a number of +1/+1 counters equal to its power\" as it last existed (CR 608.2h)", () => {
  it("Galuf's Final Act: the 4/3 that died gives four counters", () => {
    supported(galuf);
    const { s: s0, ap, ids } = setup([galuf, kill]);
    const o = putOnBattlefield(s0, ap, ogre("Doomed Ogre"));
    const other = putOnBattlefield(s0, ap, ogre("Other Ogre"));
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: o }])));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: o }]));
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets" && p.player === ap) s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: other }] });
      else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(s.objects[other]!.counters["+1/+1"]).toBe(4);
  });
});
