// "Return another creature you control to its owner's hand" (not targeted, chosen as it resolves), "sacrifice it unless
// you return another creature / discard a land card", "discard two cards unless you discard an artifact card".

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castIt = (s: GameState, pid: PlayerId, id: string) => settle(planCast(s, pid, id)!.reduce((x, a) => act(x, a), s));
const handCard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

// Real oracle text (Scryfall).
const krotiq = card("Ambush Krotiq", "Creature — Insect", "{5}{G}", { power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, return another creature you control to its owner's hand." });
const quickling = card("Quickling", "Creature — Faerie Rogue", "{1}{U}", { power: "2", toughness: "2", keywords: ["Flying", "Flash"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nFlying\nWhen this creature enters, sacrifice it unless you return another creature you control to its owner's hand." });
const fallowWurm = card("Fallow Wurm", "Creature — Wurm", "{2}{G}", { power: "4", toughness: "4", oracleText: "When this creature enters, sacrifice it unless you discard a land card." });
const thirst = card("Thirst for Knowledge", "Instant", "{2}{U}", { oracleText: "Draw three cards. Then discard two cards unless you discard an artifact card." });
const kraken = card("Biblioplex Kraken", "Creature — Kraken", "{4}{U}", { power: "4", toughness: "5", keywords: ["Scry"], oracleText: "When this creature enters, scry 3. (Look at the top three cards of your library, then put any number of them on the bottom and the rest on top in any order.)\nWhenever this creature attacks, you may return another creature you control to its owner's hand. If you do, this creature can't be blocked this turn." });
const bodySnatcher = card("Body Snatcher", "Creature — Phyrexian Minion", "{2}{B}{B}", { power: "2", toughness: "2", oracleText: "When this creature enters, exile it unless you discard a creature card.\nWhen this creature dies, exile it and return target creature card from your graveyard to the battlefield." });
const aviary = card("Aviary Mechanic", "Creature — Dwarf Artificer", "{1}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, you may return another permanent you control to its owner's hand." });
const relic = card("Relic Test", "Artifact", "{1}");
/** Only the cards given to setup in hand: the rest of the opening hand goes back to the library. */
const only = <T extends { s: GameState; ap: PlayerId; ids: string[] }>(x: T): T => {
  const p = x.s.players[x.ap]!;
  for (const id of p.hand.filter((h) => !x.ids.includes(h))) {
    x.s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((h) => x.ids.includes(h));
  return x;
};

describe("return another creature you control", () => {
  it("chosen as it resolves, never the source; with no other creature nothing happens (rulings)", () => {
    supported(krotiq, quickling, fallowWurm, thirst, kraken, bodySnatcher, aviary);
    const { s: s0, ap, ids } = setup([krotiq]);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    const { s: t0, ap: ap2, ids: ids2 } = setup([krotiq]);
    const a = putOnBattlefield(t0, ap2, bear({ name: "Bear A" }));
    const b = putOnBattlefield(t0, ap2, bear({ name: "Bear B" }));
    s = castIt(t0, ap2, ids2[0]!);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "bounce", options: expect.arrayContaining([a, b]) });
    expect((s.pending as { options: string[] }).options).not.toContain(ids2[0]);
    s = settle(act(s, { type: "pickPermanents", player: ap2, ids: [b] }));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[ids2[0]!]!.zone).toBe("battlefield");
  });

  it("Quickling: return another creature or sacrifice it; with none, it's sacrificed (rulings)", () => {
    const { s: s0, ap, ids } = setup([quickling]);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    const { s: t0, ap: ap2, ids: ids2 } = setup([quickling]);
    const a = putOnBattlefield(t0, ap2, bear());
    s = castIt(t0, ap2, ids2[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = settle(act(s, { type: "chooseMay", player: ap2, yes: true }));
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[ids2[0]!]!.zone).toBe("battlefield");
  });

  it("'you may ... If you do' only when one was returned", () => {
    const { s: s0, ap, ids } = setup([aviary]);
    const r = putOnBattlefield(s0, ap, relic);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "bounce" });
    expect((s.pending as { options: string[] }).options).not.toContain(ids[0]);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [r] }));
    expect(s.objects[r]!.zone).toBe("hand");
  });
});

describe("discard unless", () => {
  it("Fallow Wurm: only a land card keeps it; without one it's sacrificed", () => {
    const { s: s0, ap, ids } = only(setup([fallowWurm, bear()]));
    let s = castIt(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    const { s: t0, ap: ap2, ids: ids2 } = only(setup([fallowWurm, bear(), forest]));
    s = castIt(t0, ap2, ids2[0]!);
    s = act(s, { type: "chooseMay", player: ap2, yes: true });
    // Only one land card in hand: it's the one discarded.
    s = settle(s);
    expect(s.objects[ids2[2]!]!.zone).toBe("graveyard");
    expect(s.objects[ids2[1]!]!.zone).toBe("hand");
    expect(s.objects[ids2[0]!]!.zone).toBe("battlefield");
  });

  it("Body Snatcher: exiled unless you discard a creature card; the pick is limited to creature cards", () => {
    const { s: s0, ap, ids } = only(setup([bodySnatcher, bear(), bear({ name: "Other Bear" }), forest]));
    let s = castIt(s0, ap, ids[0]!);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", count: 1, filter: { text: "creature card" } });
    expect(() => act(s, { type: "discard", player: ap, objectIds: [ids[3]!] })).toThrow();
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[2]!] }));
    expect(s.objects[ids[2]!]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    const { s: t0, ap: ap2, ids: ids2 } = only(setup([bodySnatcher, bear()]));
    s = castIt(t0, ap2, ids2[0]!);
    s = settle(act(s, { type: "chooseMay", player: ap2, yes: false }));
    expect(s.objects[ids2[0]!]!.zone).toBe("exile");
  });

  it("Thirst for Knowledge: an artifact card, or two cards (even two artifacts, rulings)", () => {
    const { s: s0, ap, ids } = only(setup([thirst]));
    const r = handCard(s0, ap, relic);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    // No: two cards.
    const { s: t0, ap: ap2, ids: ids2 } = only(setup([thirst]));
    handCard(t0, ap2, relic);
    s = castIt(t0, ap2, ids2[0]!);
    const n = s.players[ap2]!.hand.length;
    s = act(s, { type: "chooseMay", player: ap2, yes: false });
    expect(s.pending).toMatchObject({ kind: "discard", count: 2 });
    s = settle(act(s, { type: "discard", player: ap2, objectIds: s.players[ap2]!.hand.slice(0, 2) }));
    expect(s.players[ap2]!.hand.length).toBe(n - 2);
    // No artifact card: two cards without asking.
    const { s: u0, ap: ap3, ids: ids3 } = only(setup([thirst]));
    s = castIt(u0, ap3, ids3[0]!);
    expect(s.pending).toMatchObject({ kind: "discard", count: 2 });
  });

  it("bots keep the creature and discard the one card", () => {
    const { s: s0, ap, ids } = only(setup([fallowWurm, forest]));
    let s = castIt(s0, ap, ids[0]!);
    for (let i = 0; i < 4 && s.pending; i++) s = settle(botActions(s, ap).reduce((x, a) => act(x, a), s));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });
});
