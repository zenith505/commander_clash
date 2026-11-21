// Lane B round B285: Ice Cauldron ("{X}, {T}: You may exile a nonland card from your hand. You may cast that card for as
// long as it remains exiled. Put a charge counter on this artifact and note the type and amount of mana spent to pay this
// activation cost. Activate only if there are no charge counters on this artifact." and "{T}, Remove a charge counter from
// this artifact: Add this artifact's last noted type and amount of mana. Spend this mana only to cast the last card exiled
// with this artifact."; CR 106.6, 400.7, 602.5b, 605.1a and its rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const cauldron = (): CardDef => ({"oracleId":"2b7e4e70-53b1-4d4f-bdcc-56c2e15f367a","name":"Ice Cauldron","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{X}, {T}: You may exile a nonland card from your hand. You may cast that card for as long as it remains exiled. Put a charge counter on this artifact and note the type and amount of mana spent to pay this activation cost. Activate only if there are no charge counters on this artifact.\n{T}, Remove a charge counter from this artifact: Add this artifact's last noted type and amount of mana. Spend this mana only to cast the last card exiled with this artifact.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

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
const total = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);

/** Ice Cauldron under `ap`, Lightning Bolt and Divination in hand, every land tapped and {R}{C} in the pool. */
const board = () => {
  const { s, ap, ids, opp } = setup([bolt(), divination()]);
  const c = putOnBattlefield(s, ap, cauldron());
  for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
  s.players[ap]!.manaPool.R = 1;
  s.players[ap]!.manaPool.C = 1;
  invalidateCharacteristics(s);
  return { s, ap, opp, c, b: ids[0]!, d: ids[1]! };
};

describe("Ice Cauldron", () => {
  it("is supported", () => {
    expect(isFullySupported(cauldron())).toBe(true);
  });

  it("exiles a card, notes the mana spent on X, and its mana casts only that card", () => {
    const { s: s0, ap, opp, c, b, d } = board();
    let s = settle(run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, 2)));
    // A nonland card from the hand, or none.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect(s.pending!.kind === "searchLibrary" && s.pending!.cards).toEqual(expect.arrayContaining([b, d]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[c]!.counters.charge).toBe(1);
    expect([...(s.objects[c]!.notedManaAll ?? [])].sort()).toEqual(["C", "R"]);
    expect(total(s, ap)).toBe(0);
    // "Activate only if there are no charge counters on this artifact."
    s.players[ap]!.manaPool.C = 1;
    expect(planActivate(s, ap, c, 0, [], undefined, undefined, 1)).toBeNull();
    s.players[ap]!.manaPool.C = 0;
    // Untapped (as on a later turn), then tapped for its mana: {C}{R}, the type and amount noted (rulings).
    s.objects[c]!.tapped = false;
    s = act(s, { type: "activateMana", player: ap, objectId: c, mana: "C", ability: 0 });
    expect(s.objects[c]!.counters.charge ?? 0).toBe(0);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.players[ap]!.manaPool.C).toBe(1);
    // That mana can't be spent on another spell (Divination from the hand).
    expect(planCast(s, ap, d)).toBeNull();
    // It pays for the exiled Lightning Bolt, cast from exile.
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R).toBe(0);
  });

  it("paying for the exiled card taps the Cauldron for its mana on its own (autopay), and not for another spell", () => {
    const { s: s0, ap, opp, c, b, d } = board();
    let s = settle(run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, 1)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(s.objects[c]!.notedManaAll).toEqual([s.objects[c]!.notedManaAll![0]]);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s.objects[c]!.tapped = false;
    // Its {R} or {C}, whichever paid X = 1: a Bolt needs {R}.
    s.objects[c]!.notedManaAll = ["R"];
    expect(planCast(s, ap, d)).toBeNull();
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(s.objects[c]!.tapped).toBe(true);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("with no card exiled, the counter and the note still happen; X = 0 notes no mana and adds none", () => {
    const { s: s0, ap, c, b } = board();
    let s = settle(run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, 0)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[c]!.counters.charge).toBe(1);
    expect(s.objects[c]!.notedManaAll).toEqual([]);
    s.objects[c]!.tapped = false;
    const before = total(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: c, mana: "C", ability: 0 });
    expect(s.objects[c]!.counters.charge ?? 0).toBe(0);
    expect(total(s, ap)).toBe(before);
  });

  it("the exiled card can still be cast after the Cauldron leaves, with other mana (rulings)", () => {
    const { s: s0, ap, opp, c, b } = board();
    let s = settle(run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, 2)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    moveObject(s, c, "graveyard");
    invalidateCharacteristics(s);
    s.players[ap]!.manaPool.R = 1;
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("a card exiled with it isn't castable at a time it couldn't be cast normally: a sorcery waits for its owner's main phase", () => {
    const { s: s0, ap, c, d } = board();
    let s = settle(run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, 2)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [d] }));
    expect(s.objects[d]!.zone).toBe("exile");
    s.players[ap]!.manaPool.U = 3;
    // In the main phase with an empty stack: castable from exile.
    expect(planCast(s, ap, d)).not.toBeNull();
    // In the beginning of combat step: not (its usual timing, rulings).
    const later = passUntil(s, "beginCombat", ap);
    later.players[ap]!.manaPool.U = 3;
    expect(planCast(later, ap, d)).toBeNull();
  });
});
