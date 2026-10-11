// London mulligan in a multiplayer game: CR 103.5 (declare in turn order from the starting
// player, mulligan simultaneously, repeat until all keep, bottom one card per mulligan) and
// CR 103.5c (the first mulligan in multiplayer is free).

import { describe, expect, it } from "vitest";
import { act, commander, forest, bear } from "./helpers";
import { botActions, createGame, mulliganBottom, waitingOn, type GameState, type PlayerId } from "../src";

function game(seed = 7): GameState {
  const deck = () => [...Array.from({ length: 50 }, () => forest), ...Array.from({ length: 49 }, () => bear())];
  return createGame(
    ["Ana", "Ben", "Cy", "Dee"].map((name, i) => ({ name, commander: commander(`Cmdr ${i}`), deck: deck() })),
    seed,
    { mulligans: true },
  );
}
const order = (s: GameState) => [0, 1, 2, 3].map((i) => (s.activePlayer + i) % 4);
const decide = (s: GameState, keep: boolean) => act(s, { type: "mulligan", player: waitingOn(s)!, keep });
const keepAll = (s: GameState) => {
  while (s.pending?.kind === "mulligan") s = decide(s, true);
  return s;
};
/** The starting player mulligans `n` times while everyone else keeps their first hand. */
const mulliganFirst = (s: GameState, n: number) => {
  const first = s.activePlayer;
  for (let i = 0; i < n; i++) {
    s = decide(s, false);
    while (s.pending?.kind === "mulligan" && s.pending.player !== first) s = decide(s, true);
  }
  return s;
};

describe("mulligans (CR 103.5)", () => {
  it("asks the starting player first, then the others in turn order, before the first turn begins", () => {
    let s = game();
    expect(s.step).not.toBe("upkeep");
    const asked: PlayerId[] = [];
    while (s.pending?.kind === "mulligan") {
      asked.push(s.pending.player);
      s = decide(s, true);
    }
    expect(asked).toEqual(order(game()));
    expect(s.mulligans).toBeNull();
    expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(s.turn).toBeGreaterThan(0);
    expect(["upkeep", "main1"]).toContain(s.step);
  });

  it("the first mulligan is free in multiplayer (CR 103.5c); the second puts one card on the bottom", () => {
    expect([0, 1, 2, 3].map(mulliganBottom)).toEqual([0, 0, 1, 2]);
    let s = game();
    const first = s.activePlayer;
    const handBefore = [...s.players[first]!.hand];
    s = mulliganFirst(s, 1); // everyone else keeps; then the mulligan happens
    expect(s.players[first]!.hand).toHaveLength(7);
    expect(s.players[first]!.hand).not.toEqual(handBefore);
    // Only the player who mulliganed declares again.
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 1, bottomIfKept: 0 });
    s = decide(s, false);
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 2, bottomIfKept: 1 });
    s = decide(s, true);
    expect(s.pending).toMatchObject({ kind: "bottomCards", player: first, count: 1 });
    const lib = s.players[first]!.library.length;
    const chosen = s.players[first]!.hand[3]!;
    expect(() => act(s, { type: "bottomCards", player: first, objectIds: [] })).toThrow(/exactly 1/);
    s = act(s, { type: "bottomCards", player: first, objectIds: [chosen] });
    expect(s.players[first]!.hand).toHaveLength(6);
    expect(s.players[first]!.library).toHaveLength(lib + 1);
    // The bottom of the library is the end of the array (draws take from index 0).
    expect(s.players[first]!.library.at(-1)).toBe(chosen);
    expect(s.objects[chosen]!.zone).toBe("library");
    expect(s.mulligans).toBeNull();
  });

  it("bottoms several cards in the chosen order, the first chosen lowest", () => {
    let s = game(3);
    const first = s.activePlayer;
    s = mulliganFirst(s, 3);
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 3, bottomIfKept: 2 });
    s = decide(s, true);
    const [a, b] = s.players[first]!.hand;
    s = act(s, { type: "bottomCards", player: first, objectIds: [a!, b!] });
    expect(s.players[first]!.library.slice(-2)).toEqual([b, a]);
    expect(s.players[first]!.hand).toHaveLength(5);
  });

  it("everyone who declared a mulligan takes it at the same time, after all declarations", () => {
    let s = game();
    const [p0, p1, p2, p3] = order(s);
    const hand1 = [...s.players[p1!]!.hand];
    s = decide(s, true); // p0 keeps
    s = decide(s, false); // p1 mulligans
    expect(s.players[p1!]!.hand).toEqual(hand1); // not yet: others still have to declare
    s = decide(s, false); // p2 mulligans
    s = decide(s, true); // p3 keeps
    expect(s.players[p1!]!.hand).not.toEqual(hand1);
    // Next round: only p1 and p2, in turn order; keepers are done.
    expect(s.pending).toMatchObject({ kind: "mulligan", player: p1 });
    s = decide(s, true);
    expect(s.pending).toMatchObject({ kind: "mulligan", player: p2 });
    expect(() => act(s, { type: "mulligan", player: p0!, keep: false })).toThrow();
    s = decide(s, true);
    expect(s.mulligans).toBeNull();
    void p3;
  });

  it("a player can't mulligan once their opening hand would be zero cards", () => {
    let s = game();
    const first = s.activePlayer;
    s = mulliganFirst(s, 8);
    // Eight mulligans: one free, so keeping now leaves 7 - 7 = 0 cards.
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 8, bottomIfKept: 7, canMulligan: false });
    expect(() => decide(s, false)).toThrow(/can't mulligan/);
  });

  it("a player who concedes mid-mulligan drops out and the next player starts if they were first", () => {
    let s = game();
    const [p0, p1] = order(s);
    s = act(s, { type: "concede", player: p0! });
    expect(s.pending).toMatchObject({ kind: "mulligan", player: p1 });
    s = keepAll(s);
    expect(s.mulligans).toBeNull();
    expect(s.activePlayer).toBe(p1);
  });

  it("bots decide and the game starts", () => {
    let s = game(11);
    for (let i = 0; i < 100 && s.mulligans; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    expect(s.mulligans).toBeNull();
    expect(s.players.every((p) => p.hand.length >= 4 && p.hand.length + p.library.length === 99)).toBe(true);
  });
});
