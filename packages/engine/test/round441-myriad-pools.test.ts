// Round 441 (Lane A): The Everflowing Well // The Myriad Pools ("Whenever you cast a permanent spell using mana produced by
// The Myriad Pools, up to one other target permanent you control becomes a copy of that spell until end of turn.": CR
// 601.2h, 707.2, 707.4, 611.2a; rulings: it copies what's printed on the card, its "enters" abilities don't apply, a spell
// that has left the stack is copied as it last existed, CR 608.2h).

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const well = (): CardDef => ({"oracleId": "1f57a9f1-6b95-4395-bdf0-c5289b786ab1", "name": "The Everflowing Well // The Myriad Pools", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Legendary Artifact // Legendary Artifact Land", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": [], "oracleText": "When The Everflowing Well enters, mill two cards, then draw two cards.\nDescend 8 — At the beginning of your upkeep, if there are eight or more permanent cards in your graveyard, transform The Everflowing Well.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Transform", "Descend", "Mill"], "producedMana": ["U"], "commanderLegal": "legal", "set": "lci", "releasedAt": "2023-11-17", "rarity": "rare", "layout": "transform", "gameChanger": false, "faces": [{"name": "The Everflowing Well", "manaCost": "{2}{U}", "typeLine": "Legendary Artifact", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": [], "oracleText": "When The Everflowing Well enters, mill two cards, then draw two cards.\nDescend 8 — At the beginning of your upkeep, if there are eight or more permanent cards in your graveyard, transform The Everflowing Well.", "colors": ["U"]}, {"name": "The Myriad Pools", "manaCost": "", "typeLine": "Legendary Artifact Land", "supertypes": ["Legendary"], "types": ["Artifact", "Land"], "subtypes": [], "oracleText": "(Transforms from The Everflowing Well.)\n{T}: Add {U}.\nWhenever you cast a permanent spell using mana produced by The Myriad Pools, up to one other target permanent you control becomes a copy of that spell until end of turn.", "colors": []}]}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const mulldrifter = (): CardDef => ({"oracleId": "24d0f5e7-0d9e-4b76-900e-a7274e80312d", "name": "Mulldrifter", "manaCost": "{4}{U}", "cmc": 5, "typeLine": "Creature — Elemental", "supertypes": [], "types": ["Creature"], "subtypes": ["Elemental"], "oracleText": "Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)", "power": "2", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying", "Evoke"], "commanderLegal": "legal", "set": "sld", "releasedAt": "2021-11-05", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const cancel = (): CardDef => ({"oracleId": "7d00fb28-ea6c-49a9-b4af-ffb38860a9a7", "name": "Cancel", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Counter target spell.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "commanderLegal": "legal", "set": "xln", "releasedAt": "2017-09-29", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions answered as the bots would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
/** Pass priority until the Pools' trigger asks for its target. */
const toTarget = (s: GameState) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Pass priority until the trigger has resolved (the spell is still on the stack). */
const resolveTrigger = (s: GameState) => {
  for (let i = 0; i < 20 && s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

/** The Myriad Pools on the battlefield (transformed) and tapped for {U}, a Forest of yours, `spell` in hand. */
const tapped = (spell: () => CardDef) => {
  const { s: s0, ap, opp } = setup([]);
  const pools = putOnBattlefield(s0, ap, well());
  s0.objects[pools]!.face = 1; // transformed
  const land = putOnBattlefield(s0, ap, forest);
  const c = toHand(s0, ap, spell());
  const s = act(s0, { type: "activateMana", player: ap, objectId: pools, mana: "U" });
  return { s, ap, opp, pools, land, c };
};

describe("round 441: The Everflowing Well // The Myriad Pools", () => {
  it("is fully supported: the Pools' cast trigger makes a permanent a copy of that spell until end of turn", () => {
    expect(isFullySupported(well())).toBe(true);
    const { s, pools } = tapped(bears);
    expect(name(s, pools)).toBe("The Myriad Pools");
    const t = compileCard(s.cards[s.objects[pools]!.cardId]!.faces ? { ...well(), ...well().faces![1]!, faces: undefined, oracleId: "pools" } as CardDef : well()).triggers;
    expect(t).toEqual([expect.objectContaining({ event: "castSpell", cast: expect.objectContaining({ manaFromSelf: true }), body: expect.objectContaining({ targets: [expect.objectContaining({ optional: true, notSource: true, controller: "you" })], effects: [{ type: "becomeCopy", what: { ref: "target", index: 0 }, of: { ref: "castSpell" }, duration: "endOfTurn" }] }) })]);
  });

  it("Grizzly Bears cast with its {U}: a Forest becomes a Grizzly Bears until end of turn, before the spell resolves", () => {
    const { s: s0, ap, land, c } = tapped(bears);
    let s = toTarget(run(s0, planCast(s0, ap, c)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(land)] });
    s = resolveTrigger(s);
    expect(s.objects[c]!.zone).toBe("stack");
    expect(name(s, land)).toBe("Grizzly Bears");
    expect(characteristics(s, s.objects[land]!).types).toEqual(["Creature"]);
    expect(power(s, s.objects[land]!)).toBe(2);
    s = settle(s);
    expect(s.objects[c]!.zone).toBe("battlefield");
    // Until end of turn (CR 514.2).
    for (let i = 0; i < 200 && s.step !== "cleanup" && s.turn === s0.turn; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 50 && s.turn === s0.turn; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(name(s, land)).toBe("Forest");
  });

  it("not the Pools itself, and none is fine", () => {
    const { s: s0, ap, pools, land, c } = tapped(bears);
    const s = toTarget(run(s0, planCast(s0, ap, c)));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(pools)] })).toThrow();
    const after = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }));
    expect(name(after, land)).toBe("Forest");
    expect(after.objects[c]!.zone).toBe("battlefield");
  });

  it("Mulldrifter: the copy isn't entering, so only the spell draws two (rulings)", () => {
    const { s: s0, ap, land, c } = tapped(mulldrifter);
    const before = s0.players[ap]!.hand.length;
    let s = toTarget(run(s0, planCast(s0, ap, c)));
    s = resolveTrigger(act(s, { type: "chooseTargets", player: ap, targets: [target(land)] }));
    expect(name(s, land)).toBe("Mulldrifter");
    expect(s.players[ap]!.hand.length).toBe(before - 1);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(before - 1 + 2);
  });

  it("countered in response, the spell is copied as it last existed on the stack (CR 608.2h)", () => {
    const { s: s0, ap, land, c } = tapped(bears);
    const k = toHand(s0, ap, cancel());
    let s = toTarget(run(s0, planCast(s0, ap, c)));
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(land)] });
    // The trigger is on the stack above Grizzly Bears: Cancel it.
    for (let i = 0; i < 5 && s.triggerQueue.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    s = run(s, planCast(s, ap, k, [{ kind: "stack", id: s.stack[0]!.id }]));
    for (let i = 0; i < 20 && s.objects[k]!.zone === "stack"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[c]!.zone).toBe("graveyard");
    s = settle(s);
    expect(name(s, land)).toBe("Grizzly Bears");
  });

  it("no trigger for an instant cast with its {U}, or for a spell paid without the Pools' mana", () => {
    const { s: s0, ap, land, c } = tapped(opt);
    let s = run(s0, planCast(s0, ap, c));
    expect(s.players[ap]!.manaPool.U).toBe(0);
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(0);
    s = settle(s);
    expect(name(s, land)).toBe("Forest");
    const b = toHand(s, ap, bears());
    s = run(s, planCast(s, ap, b));
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(0);
    s = settle(s);
    expect(name(s, land)).toBe("Forest");
  });
});
