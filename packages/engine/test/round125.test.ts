// Round 125: round 124's gaps (Library of Leng, Rottenmouth Viper, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass priority until something waits on a choice or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n");
/** Put cards named `names` into `pid`'s hand. */
const toHand = (s: GameState, pid: number, ...defs: CardDef[]) =>
  defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
    return id;
  });

// Real oracle text (Scryfall).
const leng = card("Library of Leng", "Artifact", "{1}", {
  oracleText: "You have no maximum hand size.\nIf an effect causes you to discard a card, discard it, but you may put it on top of your library instead of into your graveyard.",
});
const looting = card("Faithless Looting", "Sorcery", "{R}", { keywords: ["Flashback"], oracleText: "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const hymn = card("Hymn to Tourach", "Sorcery", "{B}{B}", { oracleText: "Target player discards two cards at random." });
const rummage = card("Rummaging Test", "Sorcery", "{R}", { oracleText: "You may discard a card. If you do, draw a card." });
const thrill = card("Thrill of Possibility", "Instant", "{1}{R}", { oracleText: "As an additional cost to cast this spell, discard a card.\nDraw two cards." });
const blank = (name: string) => card(name, "Sorcery", "{5}", { oracleText: "Draw a card." });

describe("Library of Leng (CR 614.1a)", () => {
  it("Faithless Looting: the two discarded cards are offered; the one picked goes on top, the other to the graveyard", () => {
    supported(leng, looting, hymn);
    const { s: s0, ap, ids } = setup([looting]);
    putOnBattlefield(s0, ap, leng);
    const [a, b] = toHand(s0, ap, blank("Card A"), blank("Card B"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    s = act(s, { type: "discard", player: ap, objectIds: [a!, b!] });
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, upTo: true, discarding: [a, b] });
    s = act(s, { type: "handToTop", player: ap, objectIds: [b!] });
    expect(s.players[ap]!.library[0]).toBe(b);
    expect(s.objects[a!]!.zone).toBe("graveyard");
    expect(logText(s)).toMatch(/puts Card B on top of their library instead \(Library of Leng\)/);
  });

  it("both on top, the first pick ending on top (rulings: the order is the player's)", () => {
    const { s: s0, ap, ids } = setup([looting]);
    putOnBattlefield(s0, ap, leng);
    const [a, b] = toHand(s0, ap, blank("Card A"), blank("Card B"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "discard", player: ap, objectIds: [a!, b!] });
    s = act(s, { type: "handToTop", player: ap, objectIds: [a!, b!] });
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([a, b]);
  });

  it("a card not being discarded can't be picked", () => {
    const { s: s0, ap, ids } = setup([looting]);
    putOnBattlefield(s0, ap, leng);
    const [a, b, c] = toHand(s0, ap, blank("Card A"), blank("Card B"), blank("Card C"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "discard", player: ap, objectIds: [a!, b!] });
    expect(() => act(s, { type: "handToTop", player: ap, objectIds: [c!] })).toThrow(/being discarded/);
  });

  it("Hymn to Tourach on the Library's controller: the random cards are picked first, then offered", () => {
    const { s: s0, ap, ids, opp } = setup([hymn]);
    putOnBattlefield(s0, opp, leng);
    s0.players[opp]!.hand = [];
    const hand = toHand(s0, opp, blank("Card A"), blank("Card B"), blank("Card C"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp });
    const offered = s.pending!.kind === "handToTop" ? s.pending.discarding! : [];
    expect(offered).toHaveLength(2);
    expect(offered.every((id) => s.players[opp]!.hand.includes(id))).toBe(true);
    s = act(s, { type: "handToTop", player: opp, objectIds: [] });
    expect(offered.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(hand.filter((id) => s.objects[id]!.zone === "hand")).toHaveLength(1);
  });

  it("a bot puts the discarded spells back on top", () => {
    const { s: s0, ap, ids, opp } = setup([hymn]);
    putOnBattlefield(s0, opp, leng);
    s0.players[opp]!.hand = [];
    toHand(s0, opp, blank("Card A"), blank("Card B"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(s.players[opp]!.hand).toHaveLength(0);
    expect(s.players[opp]!.graveyard).toHaveLength(0);
    expect(s.players[opp]!.library.slice(0, 2).map((id) => s.cards[s.objects[id]!.cardId]!.name).sort()).toEqual(["Card A", "Card B"]);
  });

  it("not for a discard that's a cost: \"you may discard a card. If you do, ...\" (CR 118.12)", () => {
    supported(rummage, thrill);
    const { s: s0, ap, ids } = setup([rummage]);
    putOnBattlefield(s0, ap, leng);
    const [a] = toHand(s0, ap, blank("Card A"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [a!] });
    expect(s.pending?.kind).not.toBe("handToTop");
    expect(s.objects[a!]!.zone).toBe("graveyard");
  });
});
