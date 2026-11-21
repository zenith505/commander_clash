// Lane B round B286: Galea, Kindler of Hope ("You may cast Aura and Equipment spells from the top of your library. When you
// cast an Equipment spell this way, it gains \"When this Equipment enters, attach it to target creature you control.\""; CR
// 400.7a, 601.2i, 603.2, 603.3 and its rulings).

import { describe, expect, it } from "vitest";
import { act, bear, putOnBattlefield, setup } from "./helpers";
import { castProblem, compileCard, isFullySupported, planCast, power, topPlayable, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const galea = (): CardDef => ({"oracleId":"30c0df75-9822-4016-a52b-d2e69dd58124","name":"Galea, Kindler of Hope","manaCost":"{1}{G}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Elf Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Knight"],"oracleText":"Vigilance\nYou may look at the top card of your library any time.\nYou may cast Aura and Equipment spells from the top of your library. When you cast an Equipment spell this way, it gains \"When this Equipment enters, attach it to target creature you control.\"","power":"4","toughness":"4","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Vigilance"],"layout":"normal"}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"layout":"normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;

/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Put a fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** `ap` controls Galea and a Grizzly Bears, with `def` on top of their library. */
const board = (def: CardDef) => {
  const { s, ap, opp } = setup([]);
  const gal = putOnBattlefield(s, ap, galea());
  const b = putOnBattlefield(s, ap, bear());
  const top = onTop(s, ap, def);
  return { s, ap, opp, gal, b, top };
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};

describe("Galea, Kindler of Hope", () => {
  it("is supported", () => {
    expect(isFullySupported(galea())).toBe(true);
    expect(compileCard(galea()).lookTop).toBe(true);
  });

  it("an Equipment cast from the top gains the attach trigger: Galea's trigger goes on the stack above it, and it enters attached", () => {
    const { s: s0, ap, b, top, gal } = board(bonesplitter());
    expect(topPlayable(s0, ap)).toEqual([top]);
    let s = run(s0, planCast(s0, ap, top));
    // Galea's "When you cast an Equipment spell this way" trigger, above the spell.
    for (let i = 0; i < 10 && s.triggerQueue.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(2);
    expect(s.stack[1]!.sourceId).toBe(gal);
    s = settle(s);
    // The enters trigger asks for its target as it's put on the stack: a creature you control.
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] }));
    expect(s.objects[top]!.attachedTo).toBe(b);
    expect(power(s, s.objects[b]!)).toBe(4);
  });

  it("the permanent keeps the trigger even with Galea gone, and a creature you don't control can't be its target", () => {
    const { s: s0, ap, opp, top, gal } = board(bonesplitter());
    putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = run(s0, planCast(s0, ap, top));
    for (let i = 0; i < 10 && s.triggerQueue.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Galea's trigger resolves; then Galea leaves before the Equipment does.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    const gone = structuredClone(s);
    gone.battlefield.splice(gone.battlefield.indexOf(gal), 1);
    gone.objects[gal]!.zone = "graveyard";
    gone.players[ap]!.graveyard.push(gal);
    s = settle(gone);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const theirs = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Their Bear")!;
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] })).toThrow();
  });

  it("an Equipment cast from the hand gets nothing; an Aura from the top is cast as usual", () => {
    const { s: s0, ap, opp } = setup([bonesplitter()]);
    putOnBattlefield(s0, ap, galea());
    let s = settle(run(s0, planCast(s0, ap, s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Bonesplitter")!)));
    const bs = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Bonesplitter")!;
    expect(s.objects[bs]!.attachedTo).toBeUndefined();
    const enemy = putOnBattlefield(s, opp, bear());
    const aura = onTop(s, ap, pacifism());
    expect(topPlayable(s, ap)).toContain(aura);
    s = settle(run(s, planCast(s, ap, aura, [{ kind: "object", id: enemy }])));
    expect(s.objects[aura]!.attachedTo).toBe(enemy);
  });

  it("only Aura and Equipment spells, at their usual timing", () => {
    const { s, ap, opp } = board(bear({ name: "Top Bear" }));
    expect(topPlayable(s, ap)).toEqual([]);
    const { s: s2, ap: ap2, top } = board(bonesplitter());
    // Not on another player's turn: an artifact spell is cast at sorcery speed.
    s2.activePlayer = opp;
    expect(castProblem(s2, ap2, top)).toBeTruthy();
    void s;
  });
});
