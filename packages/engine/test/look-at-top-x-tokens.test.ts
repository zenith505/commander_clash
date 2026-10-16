// Ellyn Harbreeze: "Look at the top X cards of your library, where X is the number of tokens you created this turn"
// (CR 107.3c: X defined by the text, counted as the ability resolves, 608.2h). Rulings: with no tokens created this
// turn, X is 0 and nothing happens.

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const ellyn = card("Ellyn Harbreeze, Busybody", "Legendary Creature — Human Peasant", "{3}{W}", { power: "2", toughness: "4", keywords: ["Choose a background"], oracleText: "{T}: Look at the top X cards of your library, where X is the number of tokens you created this turn. Put one of those cards into your hand and the rest on the bottom of your library in a random order.\nChoose a Background (You can have a Background as a second commander.)" });
const riches = card("Test Riches", "Sorcery", "{1}{R}", { oracleText: "Create two Treasure tokens." });

function settle(s: GameState): GameState {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("look at the top X cards, where X is a count", () => {
  it("parse", () => {
    expect(isFullySupported(ellyn)).toBe(true);
    expect(compileCard(ellyn).activated[0]!.body.effects[0]).toMatchObject({ type: "dig", count: 1, into: "hand", random: true });
  });

  it("Ellyn: X is the number of tokens you created this turn", () => {
    const { s: s0, ap, ids } = setup([riches]);
    const e = putOnBattlefield(s0, ap, ellyn);
    let s = settle(cast(s0, ap, ids[0]!));
    const top = s.players[ap]!.library.slice(0, 3);
    s = settle(activate(s, ap, e, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no prompt");
    expect(s.pending.cards).toEqual(top.slice(0, 2));
    const hand = s.players[ap]!.hand.length;
    s = act(s, botActions(s, ap)[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(top.slice(0, 2).some((id) => s.players[ap]!.hand.includes(id))).toBe(true);
    // The third card wasn't looked at: it's on top now.
    expect(s.players[ap]!.library[0]).toBe(top[2]);
  });

  it("no tokens created this turn: X is 0, nothing happens", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, ellyn);
    const lib = [...s0.players[ap]!.library];
    const hand = s0.players[ap]!.hand.length;
    const s = settle(activate(s0, ap, e, 0));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.library).toEqual(lib);
  });
});
