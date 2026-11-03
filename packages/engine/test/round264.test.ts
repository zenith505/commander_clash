// Round 264: counters removed from a permanent, for any reason, as one event (CR 122; see countersRemoved in
// counters.ts): Protean Hydra ("Whenever a +1/+1 counter is removed from ~", once for each counter, and its damage
// prevention that removes that many +1/+1 counters even with fewer or none) and Chandra, Fire Artisan ("Whenever one or
// more loyalty counters are removed from Chandra", once for each event, combat damage dealt at the same time being one).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src";
import { putCounters } from "../src/counters";
import { abilitiesOf, applyAction, characteristics, dealDamageBatch, isFullySupported, objectSource, planActivate, moveObject, planCast, planSuspend, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question but blockers (none declared). */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const indexOf = (s: GameState, id: ObjectId, text: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
  if (i < 0) throw new Error(`no ability ${text}`);
  return i;
};
/** Damage from these sources dealt at the same time (one batch, like combat damage). */
const hitAll = (s: GameState, to: ObjectId, hits: [ObjectId, number][], combat = false) =>
  dealDamageBatch(s, hits.map(([from, n]) => ({ src: objectSource(s, s.objects[from]!), to: { object: to }, n, ...(combat ? { combat: true as const } : {}) })));
const plus = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;

const hydra = (): CardDef => ({"oracleId":"6e32b958-70d3-4f3d-b10e-d6c8cb27dd93","name":"Protean Hydra","manaCost":"{X}{G}","cmc":1,"typeLine":"Creature — Hydra","supertypes":[],"types":["Creature"],"subtypes":["Hydra"],"oracleText":"This creature enters with X +1/+1 counters on it.\nIf damage would be dealt to this creature, prevent that damage and remove that many +1/+1 counters from it.\nWhenever a +1/+1 counter is removed from this creature, put two +1/+1 counters on it at the beginning of the next end step.","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"2867d539-6a63-4fae-aae2-a7fdd4dd9f28","name":"Chandra, Fire Artisan","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"Whenever one or more loyalty counters are removed from Chandra, she deals that much damage to target opponent or planeswalker.\n+1: Exile the top card of your library. You may play it this turn.\n−7: Exile the top seven cards of your library. You may play them this turn.","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2020-02-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hexmage = (): CardDef => ({"oracleId":"fcb2a95b-cef0-4b29-8b2b-538f380aff2b","name":"Vampire Hexmage","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"First strike\nSacrifice this creature: Remove all counters from target permanent.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["First strike"],"commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const kraken = (): CardDef => ({"oracleId":"54de4a7f-86f4-4029-80f7-bc25d6509cc8","name":"Deep-Sea Kraken","manaCost":"{7}{U}{U}{U}","cmc":10,"typeLine":"Creature — Kraken","supertypes":[],"types":["Creature"],"subtypes":["Kraken"],"oracleText":"This creature can't be blocked.\nSuspend 9—{2}{U} (Rather than cast this card from your hand, you may pay {2}{U} and exile it with nine time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)\nWhenever an opponent casts a spell, if this card is suspended, remove a time counter from it.","power":"6","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bloatfly = (): CardDef => ({"oracleId":"fc50e254-71bc-46b3-93e6-c6eb820a3473","name":"Bloatfly Swarm","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Insect Mutant","supertypes":[],"types":["Creature"],"subtypes":["Insect","Mutant"],"oracleText":"Flying\nThis creature enters with five +1/+1 counters on it.\nIf damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage, remove that many +1/+1 counters from it, then give each player a rad counter for each +1/+1 counter removed this way.","power":"0","toughness":"0","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};

/** A Protean Hydra with `n` +1/+1 counters, and an opponent's creature to deal damage with. */
const withHydra = (n: number) => {
  const { s, ap } = setup([]);
  const h = putOnBattlefield(s, ap, hydra());
  s.objects[h]!.counters["+1/+1"] = n;
  const opp = opps(s, ap)[0]!;
  const src = putOnBattlefield(s, opp, card("Test Brute", "Creature — Giant", "{3}", { power: "5", toughness: "5" }));
  const src2 = putOnBattlefield(s, opp, card("Test Lout", "Creature — Giant", "{2}", { power: "2", toughness: "2" }));
  return { s, ap, h, src, src2, opp };
};

describe("Protean Hydra", () => {
  it("is fully supported", () => {
    expect(isFullySupported(hydra())).toBe(true);
    expect(isFullySupported(chandra())).toBe(true);
  });

  it("prevents damage and removes that many +1/+1 counters; each one removed puts two back at the next end step", () => {
    const { s: s0, h, src } = withHydra(4);
    const out = hitAll(s0, h, [[src, 3]]);
    expect(out.reduce((a, e) => a + e.dealt, 0)).toBe(0);
    expect(s0.objects[h]!.damage ?? 0).toBe(0);
    expect(plus(s0, h)).toBe(1);
    // Three counters removed at once: three triggers (rulings), each making a delayed trigger.
    expect(s0.triggerQueue.length).toBe(3);
    let s = settle(s0);
    expect(s.delayed?.filter((d) => d.when === "nextEndStep").length).toBe(3);
    expect(plus(s, h)).toBe(1);
    s = settle(passUntil(s, "end"));
    expect(plus(s, h)).toBe(7);
    expect(characteristics(s, s.objects[h]!).power).toBe(7);
  });

  it("damage greater than its counters is all prevented and removes them all; it then dies with 0 toughness", () => {
    const { s: s0, h, src } = withHydra(2);
    const out = hitAll(s0, h, [[src, 5]]);
    expect(out.reduce((a, e) => a + e.dealt, 0)).toBe(0);
    expect(plus(s0, h)).toBe(0);
    expect(s0.triggerQueue.length).toBe(2);
    runStateBasedActions(s0);
    expect(s0.objects[h]!.zone).toBe("graveyard");
    // The delayed triggers are made but do nothing: "it" is a new object in the graveyard (CR 400.7).
    let s = settle(s0);
    s = settle(passUntil(s, "end"));
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(plus(s, h)).toBe(0);
  });

  it("damage is prevented even with no +1/+1 counters on it (rulings), and nothing triggers", () => {
    const { s: s0, ap, h, src } = withHydra(0);
    const anthem = putOnBattlefield(s0, ap, card("Test Anthem", "Enchantment", "{2}", { oracleText: "Creatures you control get +2/+2." }));
    expect(characteristics(s0, s0.objects[h]!).toughness).toBe(2);
    expect(anthem).toBeTruthy();
    const out = hitAll(s0, h, [[src, 5]]);
    expect(out.reduce((a, e) => a + e.dealt, 0)).toBe(0);
    expect(s0.objects[h]!.damage ?? 0).toBe(0);
    expect(s0.triggerQueue.length).toBe(0);
    runStateBasedActions(s0);
    expect(s0.objects[h]!.zone).toBe("battlefield");
  });

  it("combat damage from two creatures at once removes the counters for both and triggers once for each counter", () => {
    const { s: s0, h, src, src2 } = withHydra(6);
    hitAll(s0, h, [[src, 3], [src2, 2]], true);
    expect(plus(s0, h)).toBe(1);
    expect(s0.triggerQueue.length).toBe(5);
  });

  it("a -1/-1 counter cancelling a +1/+1 counter (CR 704.5q) triggers it", () => {
    const { s: s0, ap, h } = withHydra(3);
    putCounters(s0, s0.objects[h]!, "-1/-1", 1);
    expect(s0.triggerQueue.length).toBe(0);
    runStateBasedActions(s0);
    expect(plus(s0, h)).toBe(2);
    expect(s0.objects[h]!.counters["-1/-1"] ?? 0).toBe(0);
    // State-based actions put the trigger on the stack (CR 704.3, 603.3b).
    expect(s0.triggerQueue.length + s0.stack.length).toBe(1);
    let s = settle(s0);
    s = settle(passUntil(s, "end", ap));
    expect(plus(s, h)).toBe(4);
  });

  it("counters removed by an effect (Vampire Hexmage) trigger it once for each", () => {
    expect(isFullySupported(hexmage())).toBe(true);
    const { s: s0, ap, h } = withHydra(3);
    const hex = putOnBattlefield(s0, ap, hexmage());
    let s = run(s0, planActivate(s0, ap, hex, indexOf(s0, hex, /Remove all counters/), [{ kind: "object", id: h }]));
    s = settle(s);
    expect(plus(s, h)).toBe(0);
    // It has 0 toughness now and died before the triggers resolved (state-based actions first, CR 704.3).
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.delayed?.filter((d) => d.when === "nextEndStep").length).toBe(3);
  });

  it("counters removed during the end step put counters on it at the next turn's end step (rulings)", () => {
    const { s: s0, ap, h, src } = withHydra(3);
    let s = passUntil(s0, "end", ap);
    const turn = s.turn;
    hitAll(s, h, [[src, 1]]);
    s = settle(s);
    expect(plus(s, h)).toBe(2);
    s = settle(passUntil(s, "cleanup"));
    expect(plus(s, h)).toBe(2);
    s = settle(passUntil(s, "end"));
    expect(s.turn).toBe(turn + 1);
    expect(plus(s, h)).toBe(4);
  });
});

describe("Chandra, Fire Artisan", () => {
  const withChandra = (loyalty: number) => {
    const { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, chandra());
    s.objects[c]!.counters.loyalty = loyalty;
    const opp = opps(s, ap)[0]!;
    const src = putOnBattlefield(s, opp, card("Test Brute", "Creature — Giant", "{3}", { power: "5", toughness: "5" }));
    const src2 = putOnBattlefield(s, opp, card("Test Lout", "Creature — Giant", "{2}", { power: "2", toughness: "2" }));
    return { s, ap, c, src, src2, opp };
  };

  it("damage dealt to her removes loyalty counters: she deals that much damage to target opponent", () => {
    const { s: s0, ap, c, src, opp } = withChandra(4);
    hitAll(s0, c, [[src, 3]]);
    expect(s0.objects[c]!.counters.loyalty).toBe(1);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("combat damage from several creatures at once is one event: she triggers once, for all of it (rulings)", () => {
    const { s: s0, c, src, src2 } = withChandra(9);
    hitAll(s0, c, [[src, 5], [src2, 2]], true);
    expect(s0.objects[c]!.counters.loyalty).toBe(2);
    expect(s0.triggerQueue.length).toBe(1);
  });

  it("damage two sources deal one after the other is two events", () => {
    const { s: s0, c, src, src2 } = withChandra(9);
    hitAll(s0, c, [[src, 5]]);
    hitAll(s0, c, [[src2, 2]]);
    expect(s0.triggerQueue.length).toBe(2);
  });

  it("with all her loyalty removed she still deals the damage, as many as were removed (rulings)", () => {
    const { s: s0, ap, c, src, opp } = withChandra(4);
    hitAll(s0, c, [[src, 5]]);
    runStateBasedActions(s0);
    expect(s0.objects[c]!.zone).toBe("graveyard");
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("her −7 loyalty cost removes seven counters: she deals 7 damage; her +1 doesn't trigger", () => {
    const { s: s0, ap, c, opp } = withChandra(8);
    let s = run(s0, planActivate(s0, ap, c, indexOf(s0, c, /^−7/)));
    expect(s.objects[c]!.counters.loyalty).toBe(1);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 7);

    const { s: t0, ap: ap2, c: c2 } = withChandra(4);
    const t = run(t0, planActivate(t0, ap2, c2, indexOf(t0, c2, /^\+1/)));
    expect(t.objects[c2]!.counters.loyalty).toBe(5);
    // Only the +1 ability itself is on the stack.
    expect(t.triggerQueue.length).toBe(0);
    expect(t.stack.length).toBe(1);
  });

  it("leaving the battlefield doesn't remove her counters, so nothing triggers (rulings, CR 122.2)", () => {
    const { s, c } = withChandra(4);
    moveObject(s, c, "hand");
    runStateBasedActions(s);
    expect(s.objects[c]!.zone).toBe("hand");
    expect(s.triggerQueue.length).toBe(0);
  });
});

describe("Deep-Sea Kraken", () => {
  /** Kraken suspended by its owner (the active player) with `n` time counters, and an instant in an opponent's hand. */
  const suspended = (n: number) => {
    const { s, ap, ids } = setup([kraken(), card("Test Study", "Sorcery", "{U}", { oracleText: "Draw a card." })]);
    let t = run(s, planSuspend(s, ap, ids[0]!));
    const k = ids[0]!;
    expect(t.objects[k]!.zone).toBe("exile");
    expect(t.objects[k]!.counters.time).toBe(9);
    t.objects[k]!.counters.time = n;
    const opp = opps(t, ap)[0]!;
    const shocks = [0, 1].map(() => into(t, opp, card("Test Quick Study", "Instant", "{U}", { oracleText: "Draw a card." }), "hand"));
    t.players[opp]!.manaPool.U = 2;
    return { s: t, ap, k, opp, shocks, study: ids[1]! };
  };
  /** The active player casts their sorcery, then the opponent responds with an instant. */
  const oppCasts = (s: GameState, ap: PlayerId, opp: PlayerId, study: ObjectId, shock: ObjectId) => {
    let t = run(s, planCast(s, ap, study, []));
    t = act(t, { type: "passPriority", player: ap });
    expect(waitingOn(t)).toBe(opp);
    return run(t, planCast(t, opp, shock, []));
  };

  it("is fully supported", () => {
    expect(isFullySupported(kraken())).toBe(true);
  });

  it("an opponent casting a spell removes a time counter from it while it's suspended", () => {
    const { s: s0, ap, k, opp, shocks, study } = suspended(3);
    let s = oppCasts(s0, ap, opp, study, shocks[0]!);
    // The trigger works in exile, controlled by its owner (CR 113.6, 113.8).
    const trig = s.stack.at(-1)!;
    expect(trig.description).toMatch(/remove a time counter/);
    expect(trig.controller).toBe(ap);
    s = settle(s);
    expect(s.objects[k]!.counters.time).toBe(2);
    expect(s.objects[k]!.zone).toBe("exile");
  });

  it("its owner's own spells don't remove one", () => {
    const { s: s0, ap, k, study } = suspended(3);
    const s = settle(run(s0, planCast(s0, ap, study, [])));
    expect(s.objects[k]!.counters.time).toBe(3);
  });

  it("removing the last time counter lets its owner cast it without paying its mana cost (CR 702.62a)", () => {
    const { s: s0, ap, k, opp, shocks, study } = suspended(1);
    let s = oppCasts(s0, ap, opp, study, shocks[0]!);
    s = settle(s);
    expect(s.objects[k]!.counters.time ?? 0).toBe(0);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: k, how: "suspend" });
    s = settle(run(s, planCast(s, ap, k, [])));
    expect(s.objects[k]!.zone).toBe("battlefield");
  });

  it("a card in exile without time counters isn't suspended: nothing triggers", () => {
    const { s: s0, ap, k, opp, shocks, study } = suspended(1);
    s0.objects[k]!.counters = {};
    const s = settle(oppCasts(s0, ap, opp, study, shocks[0]!));
    expect(s.objects[k]!.counters.time ?? 0).toBe(0);
    expect(s.pending?.kind).not.toBe("castFree");
  });
});

describe("Bloatfly Swarm", () => {
  it("prevents damage, removes that many +1/+1 counters, then gives each player a rad counter for each", () => {
    expect(isFullySupported(bloatfly())).toBe(true);
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bloatfly());
    s.objects[b]!.counters["+1/+1"] = 5;
    const opp = opps(s, ap)[0]!;
    const src = putOnBattlefield(s, opp, card("Test Brute", "Creature — Giant", "{3}", { power: "5", toughness: "5" }));
    const out = hitAll(s, b, [[src, 2]]);
    expect(out.reduce((a, e) => a + e.dealt, 0)).toBe(0);
    expect(plus(s, b)).toBe(3);
    for (const p of s.turnOrder) expect(s.players[p]!.rad ?? 0).toBe(2);
    // More damage than counters: all of it prevented, only the counters it had count.
    hitAll(s, b, [[src, 5]]);
    expect(plus(s, b)).toBe(0);
    for (const p of s.turnOrder) expect(s.players[p]!.rad ?? 0).toBe(5);
    // With no counters left the damage isn't prevented.
    runStateBasedActions(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});
