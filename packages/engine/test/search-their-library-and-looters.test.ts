// "Search target opponent's library for a creature card and put that card onto the battlefield under your control. Then
// that player shuffles." (Bribery): you search their library (CR 701.23a) and control what you find (CR 110.2a); they
// shuffle. "Target player draws a card, then discards a card" (Cephalid Looter): the same player does both, in order.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A new copy of `def` on top of `pid`'s library. */
function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "library");
  const lib = s.players[pid]!.library;
  lib.splice(lib.indexOf(id), 1);
  lib.unshift(id);
  return id;
}

// Real oracle text (Scryfall).
const bribery = card("Bribery", "Sorcery", "{3}{U}{U}", { oracleText: "Search target opponent's library for a creature card and put that card onto the battlefield under your control. Then that player shuffles." });
const extract = card("Extract", "Sorcery", "{U}", { oracleText: "Search target player's library for a card and exile it. Then that player shuffles." });
const looter = card("Cephalid Looter", "Creature — Octopus Rogue", "{2}{U}", { power: "2", toughness: "1", oracleText: "{T}: Target player draws a card, then discards a card." });

describe("searching another player's library", () => {
  it("parse", () => {
    supported(bribery, extract, looter);
    expect(compileCard(bribery).spell!.effects).toEqual([{ type: "search", filter: expect.objectContaining({ types: ["Creature"] }), n: 1, upTo: false, reveal: false, dest: { zone: "battlefield" }, library: { ref: "target", index: 0 } }]);
  });

  it("Bribery: you choose among their creature cards, it enters under your control, their library is shuffled", () => {
    const { s: s0, ap, ids, opp } = setup([bribery]);
    const titan = onTop(s0, opp, bear({ name: "Their Titan", power: "6", toughness: "6" }));
    const mine = s0.players[ap]!.library.length;
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const offered = (s.pending as { cards: string[] }).cards;
    expect(offered).toContain(titan);
    expect(offered.every((id) => s.objects[id]!.owner === opp && s.cards[s.objects[id]!.cardId]!.types.includes("Creature"))).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [titan] }));
    expect(s.objects[titan]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });
    expect(s.players[opp]!.library).not.toContain(titan);
    expect(s.players[ap]!.library.length).toBe(mine);
    expect(s.log.some((l) => l.text.includes(`searches ${s.players[opp]!.name}'s library, finds a card (Their Titan), and ${s.players[opp]!.name} shuffles`))).toBe(true);
  });

  it("Extract: any card, exiled", () => {
    const { s: s0, ap, ids, opp } = setup([extract]);
    const top = s0.players[opp]!.library[0]!;
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }));
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.players[opp]!.exile).toContain(top);
  });
});

describe("a looter aimed at a player", () => {
  it("Cephalid Looter: that player draws, then discards", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, looter);
    s0.objects[l]!.controlledSinceTurn = -1;
    const hand = s0.players[opp]!.hand.length;
    let s = act(s0, { type: "activateAbility", player: ap, objectId: l, index: 0, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 1 });
    const drawn = s.players[opp]!.hand.length;
    expect(drawn).toBe(hand + 1);
    s = settle(act(s, { type: "discard", player: opp, objectIds: [s.players[opp]!.hand[0]!] }));
    expect(s.players[opp]!.hand.length).toBe(hand);
  });
});
