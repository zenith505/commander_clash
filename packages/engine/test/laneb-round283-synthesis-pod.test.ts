// Lane B round B283: Synthesis Pod ("{1}{U/P}, {T}, Exile a spell you control: Target opponent reveals cards from the top of
// their library until they reveal a card with mana value equal to 1 plus the exiled spell's mana value. Exile that card,
// then that player shuffles. You may cast that exiled card without paying its mana cost."; CR 202.3, 202.3e, 602.2b,
// 608.2g, 608.2h, 701.20a and its rulings).

import { describe, expect, it } from "vitest";
import { act, bear, putOnBattlefield, setup } from "./helpers";
import { applyAction, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const pod = (): CardDef => ({"oracleId":"55e42539-3fe2-4c84-9978-c071d6fc6aa0","name":"Synthesis Pod","manaCost":"{3}{U/P}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"({U/P} can be paid with either {U} or 2 life.)\n{1}{U/P}, {T}, Exile a spell you control: Target opponent reveals cards from the top of their library until they reveal a card with mana value equal to 1 plus the exiled spell's mana value. Exile that card, then that player shuffles. You may cast that exiled card without paying its mana cost.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const concentrate = (): CardDef => ({"oracleId":"a3d287ec-1a39-4f91-acf1-7c1d2c00ed89","name":"Concentrate","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw three cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const blaze = (): CardDef => ({"oracleId":"0596920f-9946-42f4-a03b-24aab67f9f1b","name":"Blaze","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Blaze deals X damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** `defs` on top of `pid`'s library, in order; their ids. */
const stackLibrary = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
};
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id }) as TargetChoice;
/** Casts `id` (it stays on the stack), then activates the Pod exiling it, at `opp`; resolves up to the first question. */
const podIt = (s: GameState, ap: PlayerId, opp: PlayerId, pd: string, id: string, x?: number, targets?: TargetChoice[]) => {
  s = run(s, planCast(s, ap, id, targets, undefined, undefined, x));
  expect(zone(s, id)).toBe("stack");
  s = run(s, planActivate(s, ap, pd, 0, [ply(opp)], undefined, undefined, undefined, { exileSpell: [id] }));
  expect(zone(s, id)).toBe("exile");
  return settle(s);
};

describe("Synthesis Pod", () => {
  it("is supported", () => {
    expect(isFullySupported(pod())).toBe(true);
  });

  it("exiles your spell; the opponent reveals down to a card with 1 more mana value, exiles it and shuffles; you cast it free", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    const pd = putOnBattlefield(s0, ap, pod());
    // Lightning Bolt (1), Shivan Dragon (6), Divination (3), Concentrate (4).
    const lib = stackLibrary(s0, opp, [bolt(), shivan(), divination(), concentrate()]);
    const size = s0.players[opp]!.library.length;
    let s = podIt(s0, ap, opp, pd, ids[0]!);
    // Grizzly Bears has mana value 2: the card sought has 3.
    expect(zone(s, lib[2]!)).toBe("exile");
    expect(s.players[opp]!.library.length).toBe(size - 1);
    expect(s.log.some((l) => /reveals 3 cards from the top of their library/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /shuffles their library/.test(l.text))).toBe(true);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[2] });
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, lib[2]!)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // Its owner's graveyard (CR 400.3).
    expect(zone(s, lib[2]!)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(lib[2]!);
    // The Bears stay exiled (rulings).
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("an {X} spell's mana value counts its X on the stack: Blaze with X 2 looks for mana value 4", () => {
    const { s: s0, ap, ids, opp } = setup([blaze()]);
    const pd = putOnBattlefield(s0, ap, pod());
    const lib = stackLibrary(s0, opp, [divination(), concentrate()]);
    const s = podIt(s0, ap, opp, pd, ids[0]!, 2, [ply(opp)]);
    expect(zone(s, lib[0]!)).toBe("library");
    expect(zone(s, lib[1]!)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[1] });
  });

  it("with no such card, the whole library is revealed, nothing is exiled and it's shuffled", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    const pd = putOnBattlefield(s0, ap, pod());
    // No card with mana value 3 in the opponent's library (Forests and Bears).
    const size = s0.players[opp]!.library.length;
    const s = podIt(s0, ap, opp, pd, ids[0]!);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.library.length).toBe(size);
    expect(s.players[opp]!.exile).toHaveLength(0);
    expect(s.log.some((l) => /finding no card with mana value 3/.test(l.text))).toBe(true);
  });

  it("declined, the card stays in exile", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    const pd = putOnBattlefield(s0, ap, pod());
    // Bolt (1) looks for a card with mana value 2: a Grizzly Bears.
    const lib = stackLibrary(s0, opp, [bear()]);
    let s = podIt(s0, ap, opp, pd, ids[0]!, undefined, [ply(opp)]);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[0] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, lib[0]!)).toBe("exile");
    // The Bolt was exiled, not countered: the opponent took no damage.
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life);
  });

  it("a creature card cast this way enters under your control", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    const pd = putOnBattlefield(s0, ap, pod());
    const lib = stackLibrary(s0, opp, [bear()]);
    let s = podIt(s0, ap, opp, pd, ids[0]!, undefined, [ply(opp)]);
    s = settle(run(s, planCast(s, ap, lib[0]!)));
    expect(zone(s, lib[0]!)).toBe("battlefield");
    expect(s.objects[lib[0]!]!.controller).toBe(ap);
    expect(s.objects[lib[0]!]!.owner).toBe(opp);
  });

  it("it needs a spell you control: none on the stack, it can't be activated", () => {
    const { s: s0, ap, opp } = setup([]);
    const pd = putOnBattlefield(s0, ap, pod());
    expect(planActivate(s0, ap, pd, 0, [ply(opp)])).toBeNull();
  });
});
