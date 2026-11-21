// Lane B round B282: Ertai's Meddling ("X can't be 0. Target spell's controller exiles it with X delay counters on it. At the
// beginning of each of that player's upkeeps, if that card is exiled, remove a delay counter from it. If the card has no
// delay counters on it, the player puts it onto the stack as a copy of the original spell."; CR 603.7, 707.10 and its
// rulings).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const meddling = (): CardDef => ({"oracleId":"609c529a-b3b3-46d5-b9d0-ae0117507d6e","name":"Ertai's Meddling","manaCost":"{X}{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"X can't be 0.\nTarget spell's controller exiles it with X delay counters on it.\nAt the beginning of each of that player's upkeeps, if that card is exiled, remove a delay counter from it. If the card has no delay counters on it, the player puts it onto the stack as a copy of the original spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const thinkTwice = (): CardDef => ({"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"layout":"normal"}) as CardDef;
const intoTheRoil = (): CardDef => ({"oracleId":"c2898bbd-82a4-4d26-b6ee-169b0ebe71b4","name":"Into the Roil","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Kicker"],"layout":"normal"}) as CardDef;

const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.players[pid]!.hand.find((x) => s.cards[s.objects[x]!.cardId]!.name === name)!;
/** Cast `name` from `pid`'s hand (stays on the stack). */
const castIt = (s: GameState, pid: PlayerId, name: string, targets?: TargetChoice[], x?: number, choices = {}) => run(s, planCast(s, pid, named(s, pid, name), targets, undefined, undefined, x, choices));
/** Ertai's Meddling with X = `x` at the spell on top of the stack, then everything resolves. */
const meddle = (s: GameState, pid: PlayerId, x: number) => settle(castIt(s, pid, "Ertai's Meddling", [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice], x));
/** On to the beginning of `pid`'s next turn's draw step: their upkeep and whatever it put on the stack is over. */
const nextDraw = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "end"), "draw", pid);

describe("Ertai's Meddling", () => {
  it("is supported", () => {
    expect(isFullySupported(meddling())).toBe(true);
  });

  it("X can't be 0", () => {
    const { s: s0, ap, opp } = setup([meddling(), bolt()]);
    const s1 = castIt(s0, ap, "Lightning Bolt", [ply(opp)]);
    expect(planCast(s1, ap, named(s1, ap, "Ertai's Meddling"), [{ kind: "stack", id: s1.stack[0]!.id } as TargetChoice], undefined, undefined, 0)).toBeNull();
  });

  it("exiles the spell with X delay counters; it comes back at its controller's upkeep once the last is removed, not cast", () => {
    const { s: s0, ap, opp } = setup([meddling(), bolt()]);
    const life = s0.players[opp]!.life;
    const s1 = castIt(s0, ap, "Lightning Bolt", [ply(opp)]);
    const boltId = s1.stack[0]!.objectId!;
    const s2 = meddle(s1, ap, 2);
    expect(s2.pending).toBeNull();
    expect(s2.objects[boltId]!.zone).toBe("exile");
    expect(s2.objects[boltId]!.counters.delay).toBe(2);
    expect(s2.players[opp]!.life).toBe(life);
    // The first upkeep: one counter left, still exiled.
    const s3 = nextDraw(s2, ap);
    expect(s3.objects[boltId]!.zone).toBe("exile");
    expect(s3.objects[boltId]!.counters.delay).toBe(1);
    expect(s3.players[opp]!.life).toBe(life);
    // The second: the last counter is removed and the Bolt goes onto the stack with its target, then resolves.
    const s4 = passUntil(passUntil(s3, "end"), "upkeep", ap);
    const s5 = settle(s4);
    expect(s5.log.some((l) => /puts Lightning Bolt onto the stack as a copy of the original spell targeting/.test(l.text))).toBe(true);
    expect(s5.players[opp]!.life).toBe(life - 3);
    expect(s5.objects[boltId]!.zone).toBe("graveyard");
    // It wasn't cast this turn (rulings: cast triggers and counts don't see it).
    expect((s5.castThisTurn ?? []).some((c) => c.card === s5.objects[boltId]!.cardId)).toBe(false);
    expect(s5.meddled).toBeUndefined();
    expect((s5.delayed ?? []).some((d) => d.when === "eachPlayersUpkeepWhileExiled")).toBe(false);
  });

  it("only that player's upkeeps count: an opponent's spell returns at that opponent's upkeep, under their control", () => {
    const { s: s0, ap, opp } = setup([meddling()]);
    const s1 = structuredClone(s0);
    // The opponent casts Grizzly Bears (given the priority and a Forest's mana for it).
    const b = putOnBattlefield(s1, opp, bears());
    s1.battlefield.splice(s1.battlefield.indexOf(b), 1);
    s1.objects[b]!.zone = "stack";
    s1.stack.push({ id: `s${s1.nextId++}`, kind: "spell", objectId: b, controller: opp, description: "Grizzly Bears" });
    invalidateCharacteristics(s1);
    const s2 = meddle(s1, ap, 1);
    expect(s2.objects[b]!.zone).toBe("exile");
    // Ana's own next upkeep doesn't remove it: it's the opponent's (the one right after Ana) that does.
    const s3 = passUntil(passUntil(s2, "end"), "draw", opp);
    expect(s3.objects[b]!.zone).toBe("battlefield");
    expect(s3.objects[b]!.controller).toBe(opp);
    // The permanent wasn't cast (CR 707.10).
    expect(s3.objects[b]!.wasCast).toBeUndefined();
  });

  it("a target gone by then: the spell can't resolve, and goes to the graveyard", () => {
    const { s: s0, ap, opp } = setup([meddling(), intoTheRoil()]);
    const s1 = structuredClone(s0);
    const target = putOnBattlefield(s1, opp, bear());
    const s2 = castIt(s1, ap, "Into the Roil", [{ kind: "object", id: target }]);
    const roil = s2.stack[0]!.objectId!;
    const s3 = meddle(s2, ap, 1);
    expect(s3.objects[roil]!.zone).toBe("exile");
    // The Bears leave and come back: a new object (CR 400.7).
    const s4 = structuredClone(s3);
    s4.battlefield.splice(s4.battlefield.indexOf(target), 1);
    s4.objects[target]!.zone = "hand";
    s4.players[opp]!.hand.push(target);
    s4.objects[target]!.zoneChanges = (s4.objects[target]!.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(s4);
    const s5 = passUntil(passUntil(s4, "end"), "upkeep", ap);
    const s6 = settle(s5);
    expect(s6.objects[target]!.zone).toBe("hand");
    expect(s6.objects[roil]!.zone).toBe("graveyard");
  });

  it("a kicked spell comes back kicked (CR 707.10)", () => {
    const { s: s0, ap, opp } = setup([meddling(), intoTheRoil()]);
    const s1 = structuredClone(s0);
    const target = putOnBattlefield(s1, opp, bear());
    const s2 = castIt(s1, ap, "Into the Roil", [{ kind: "object", id: target }], undefined, { kicks: [0] });
    expect(s2.stack[0]!.kicked).toEqual([0]);
    const s3 = meddle(s2, ap, 1);
    const s4 = passUntil(passUntil(s3, "end"), "upkeep", ap);
    const hand = s4.players[ap]!.hand.length;
    const s5 = settle(s4);
    expect(s5.objects[target]!.zone).toBe("hand");
    // Kicked: it draws a card too.
    expect(s5.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("a spell cast with flashback is exiled when it leaves the stack again (rulings)", () => {
    const { s: s0, ap } = setup([meddling(), thinkTwice()]);
    const s1 = structuredClone(s0);
    const tt = named(s1, ap, "Think Twice");
    s1.players[ap]!.hand.splice(s1.players[ap]!.hand.indexOf(tt), 1);
    s1.objects[tt]!.zone = "graveyard";
    s1.players[ap]!.graveyard.push(tt);
    invalidateCharacteristics(s1);
    const s2 = run(s1, planCast(s1, ap, tt, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(s2.objects[tt]!.zone).toBe("stack");
    const s3 = meddle(s2, ap, 1);
    expect(s3.objects[tt]!.zone).toBe("exile");
    const s4 = passUntil(passUntil(s3, "end"), "upkeep", ap);
    const s5 = settle(s4);
    expect(s5.log.some((l) => /puts Think Twice onto the stack/.test(l.text))).toBe(true);
    expect(s5.objects[tt]!.zone).toBe("exile");
    expect(s5.meddled).toBeUndefined();
  });

  it("a spell cast from the hand goes to the graveyard after it resolves", () => {
    const { s: s0, ap } = setup([meddling(), thinkTwice()]);
    const s1 = castIt(s0, ap, "Think Twice");
    const tt = s1.stack[0]!.objectId!;
    const s2 = meddle(s1, ap, 1);
    const s3 = settle(passUntil(passUntil(s2, "end"), "upkeep", ap));
    expect(s3.objects[tt]!.zone).toBe("graveyard");
  });

  it("a bot uses it on an opponent's spell", () => {
    // Bots answer spells with mana value 3 or more.
    const { s: s0, ap, opp } = setup([bear({ name: "Big Bear", manaCost: "{2}{G}" })]);
    const s1 = structuredClone(s0);
    // The opponent holds Ertai's Meddling and two untapped Islands.
    const m = putOnBattlefield(s1, opp, meddling());
    s1.battlefield.splice(s1.battlefield.indexOf(m), 1);
    s1.objects[m]!.zone = "hand";
    s1.players[opp]!.hand = [m];
    const isl = (): CardDef => ({ ...bears(), oracleId: "island-b282", name: "Island", manaCost: "", cmc: 0, typeLine: "Basic Land — Island", supertypes: ["Basic"], types: ["Land"], subtypes: ["Island"], oracleText: "({T}: Add {U}.)", colors: [], colorIdentity: [], power: undefined, toughness: undefined, producedMana: ["U"] }) as CardDef;
    for (let k = 0; k < 3; k++) putOnBattlefield(s1, opp, isl());
    invalidateCharacteristics(s1);
    let s = castIt(s1, ap, "Big Bear");
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const acts = botActions(s, opp);
    const c = acts.find((a) => a.type === "castSpell" && a.objectId === m);
    expect(c && c.type === "castSpell" ? c.targets?.[0] : undefined).toEqual({ kind: "stack", id: s.stack[0]!.id });
    expect(c && c.type === "castSpell" ? (c.x ?? 0) : 0).toBeGreaterThanOrEqual(1);
  });
});
