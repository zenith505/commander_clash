// Round 450: Finale of Promise. "You may cast up to one target instant card and/or up to one target sorcery card from your
// graveyard each with mana value X or less without paying their mana costs. If a spell cast this way would be put into your
// graveyard, exile it instead. If X is 10 or more, copy each of those spells twice. You may choose new targets for the
// copies." Cast as it resolves in either order (rulings; CR 608.2g), exiled instead of going to the graveyard (CR 614.1a);
// the copies aren't cast and go on the stack in any order (rulings; CR 707.10, 707.10c).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const finale = (): CardDef => ({"oracleId":"d6fafb50-9531-4fbf-bb1e-ebb4dd39281c","name":"Finale of Promise","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value X or less without paying their mana costs. If a spell cast this way would be put into your graveyard, exile it instead. If X is 10 or more, copy each of those spells twice. You may choose new targets for the copies.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const fof = (): CardDef => ({"oracleId":"437b2dab-15e0-4b9a-a204-58622d37a3b3","name":"Fact or Fiction","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const whisper = (): CardDef => ({"oracleId":"7ffae8f8-3006-4969-a339-6d30678f87ea","name":"Night's Whisper","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You draw two cards and lose 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const none: TargetChoice = { kind: "none" };
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until something is asked of a player in `me`; bots answer the others. */
const settleFor = (s: GameState, me: PlayerId[]) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me.includes(p.player)) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

/** Finale of Promise in my hand; Lightning Bolt, Mind Rot, Fact or Fiction and Night's Whisper in my graveyard. */
function board() {
  const { s, ap, opp } = setup([]);
  const fin = into(s, ap, finale(), "hand");
  const bo = into(s, ap, bolt(), "graveyard");
  const mr = into(s, ap, mindRot(), "graveyard");
  const ff = into(s, ap, fof(), "graveyard");
  const nw = into(s, ap, whisper(), "graveyard");
  return { s, ap, opp, fin, bo, mr, ff, nw };
}
/** Casts Finale with X and these targets, and passes until it asks something. */
function castFinale(b: ReturnType<typeof board>, x: number, targets: TargetChoice[]) {
  const s = run(b.s, planCast(b.s, b.ap, b.fin, targets, undefined, undefined, x));
  expect(s.stack.at(-1)?.description).toMatch(/Finale of Promise/);
  return settle(s);
}

describe("Round 450: Finale of Promise", () => {
  it("compiles fully: two up-to-one targets, a cast as it resolves and copies when X is 10 or more", () => {
    for (const d of [finale(), bolt(), mindRot(), fof(), whisper()]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("targets only an instant and a sorcery card with mana value X or less in your graveyard", () => {
    const b = board();
    // A legal choice can be planned (paid from my lands); an illegal one is refused for its targets.
    const ok = (x: number, targets: TargetChoice[]) => (planCast(b.s, b.ap, b.fin, targets, undefined, undefined, x) ? null : castProblem(b.s, b.ap, b.fin, targets, undefined, undefined, undefined, x));
    expect(ok(3, [tgt(b.bo), tgt(b.mr)])).toBeNull();
    expect(ok(3, [tgt(b.ff), none])).toMatch(/target/);
    expect(ok(4, [tgt(b.ff), none])).toBeNull();
    expect(ok(2, [none, tgt(b.mr)])).toMatch(/target/);
    expect(ok(2, [none, tgt(b.nw)])).toBeNull();
    expect(ok(3, [tgt(b.mr), none])).toMatch(/target/); // a sorcery card in the instant's slot
    expect(ok(3, [none, none])).toBeNull();
  });

  it("X=3: I choose which to cast first; both cast free, the later resolves first, then both are exiled", () => {
    const b = board();
    let s = castFinale(b, 3, [tgt(b.bo), tgt(b.mr)]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFirst", player: b.ap, labels: ["Lightning Bolt", "Mind Rot"] });
    expect(() => act(s, { type: "chooseOption", player: b.ap, choice: b.nw })).toThrow();
    s = act(s, { type: "chooseOption", player: b.ap, choice: b.mr });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b.mr });
    s = run(s, planCast(s, b.ap, b.mr, [{ kind: "player", id: b.opp }]));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b.bo });
    s = run(s, planCast(s, b.ap, b.bo, [{ kind: "player", id: b.opp }]));
    expect(s.pending).toBeFalsy();
    // Finale is done; Bolt is on top of Mind Rot; nothing was copied with X 3.
    expect(zone(s, b.fin)).toBe("graveyard");
    expect(s.stack.map((i) => i.description)).toEqual(["Mind Rot", "Lightning Bolt"].map((n) => expect.stringContaining(n)));
    const hand = s.players[b.opp]!.hand.length;
    const life = s.players[b.opp]!.life;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 3; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[b.opp]!.life).toBe(life - 3);
    expect(s.players[b.opp]!.hand.length).toBe(hand);
    s = settleFor(s, [b.ap]);
    expect(s.players[b.opp]!.hand.length).toBe(hand - 2);
    expect(zone(s, b.bo)).toBe("exile");
    expect(zone(s, b.mr)).toBe("exile");
  });

  it("one target, or one declined: no order question; a declined card stays in the graveyard", () => {
    const b = board();
    let s = castFinale(b, 2, [none, tgt(b.nw)]);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b.nw });
    s = settle(act(s, { type: "chooseMay", player: b.ap, yes: false }));
    expect(s.pending).toBeFalsy();
    expect(zone(s, b.nw)).toBe("graveyard");
    const c = board();
    let t = castFinale(c, 3, [tgt(c.bo), tgt(c.nw)]);
    t = act(t, { type: "chooseOption", player: c.ap, choice: c.bo });
    t = act(t, { type: "chooseMay", player: c.ap, yes: false });
    expect(t.pending).toMatchObject({ kind: "castFree", objectId: c.nw });
    t = run(t, planCast(t, c.ap, c.nw));
    expect(t.pending).toBeFalsy();
    expect(zone(t, c.bo)).toBe("graveyard");
    t = settle(t);
    expect(zone(t, c.nw)).toBe("exile");
  });

  it("X=10: each spell cast is copied twice, I order the copies and may choose their targets", () => {
    const b = board();
    let s = castFinale(b, 10, [tgt(b.bo), tgt(b.mr)]);
    s = act(s, { type: "chooseOption", player: b.ap, choice: b.bo });
    s = run(s, planCast(s, b.ap, b.bo, [{ kind: "player", id: b.opp }]));
    s = run(s, planCast(s, b.ap, b.mr, [{ kind: "player", id: b.opp }]));
    const boItem = s.stack.find((i) => i.objectId === b.bo)!.id;
    const mrItem = s.stack.find((i) => i.objectId === b.mr)!.id;
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyNextOf", options: [boItem, mrItem] });
    s = act(s, { type: "chooseOption", player: b.ap, choice: boItem });
    expect(s.pending).toMatchObject({ kind: "copyTargets", copyOf: expect.stringContaining("Lightning Bolt"), left: 1 });
    const third = s.turnOrder.find((p) => p !== b.ap && p !== b.opp)!;
    s = act(s, { type: "copyTargets", player: b.ap, targets: [{ kind: "player", id: third }] });
    // Bolt has one copy left, Mind Rot two.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyNextOf", labels: [expect.stringContaining("1 copy left"), expect.stringContaining("2 copies left")] });
    s = act(s, { type: "chooseOption", player: b.ap, choice: mrItem });
    s = act(s, { type: "copyTargets", player: b.ap });
    s = act(s, { type: "chooseOption", player: b.ap, choice: boItem });
    s = act(s, { type: "copyTargets", player: b.ap });
    // Only Mind Rot has a copy left: no question about which.
    expect(s.pending).toMatchObject({ kind: "copyTargets", copyOf: expect.stringContaining("Mind Rot") });
    s = act(s, { type: "copyTargets", player: b.ap });
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(6);
    expect(s.stack.filter((i) => i.copy).length).toBe(4);
    const life = { opp: s.players[b.opp]!.life, third: s.players[third]!.life };
    s = settleFor(s, [b.ap]);
    expect(s.players[b.opp]!.life).toBe(life.opp - 6);
    expect(s.players[third]!.life).toBe(life.third - 3);
    expect(zone(s, b.bo)).toBe("exile");
    expect(zone(s, b.mr)).toBe("exile");
  });

  it("bots answer the order questions", () => {
    const b = board();
    let s = castFinale(b, 10, [tgt(b.bo), tgt(b.nw)]);
    const a = botActions(s, b.ap);
    expect(a).toEqual([{ type: "chooseOption", player: b.ap, choice: b.bo }]);
    s = settleFor(s, []);
    expect(s.pending).toBeFalsy();
    expect(zone(s, b.bo)).toBe("exile");
    expect(zone(s, b.nw)).toBe("exile");
  });
});
