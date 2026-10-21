// Round 104: Ugin, the Spirit Dragon's −10 ("put up to seven permanent cards from your hand onto the battlefield") and
// Smuggler's Surprise (up to two cards from among the milled cards; up to two creature cards from your hand).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const ugin = card("Ugin, the Spirit Dragon", "Legendary Planeswalker — Ugin", "{8}", { loyalty: "7", oracleText: "+2: Ugin deals 3 damage to any target.\n−X: Exile each permanent with mana value X or less that's one or more colors.\n−10: You gain 7 life, draw seven cards, then put up to seven permanent cards from your hand onto the battlefield." });
const surprise = card("Smuggler's Surprise", "Instant", "{G}", { keywords: ["Spree", "Mill"], oracleText: "Spree (Choose one or more additional costs.)\n+ {2} — Mill four cards. You may put up to two creature and/or land cards from among the milled cards into your hand.\n+ {4}{G} — You may put up to two creature cards from your hand onto the battlefield.\n+ {1} — Creatures you control with power 4 or greater gain hexproof and indestructible until end of turn." });

const giant = (n: string) => card(n, "Creature — Giant", "{4}{G}", { power: "5", toughness: "5" });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 104: Ugin, the Spirit Dragon and Smuggler's Surprise", () => {
  it("parse", () => [ugin, surprise].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Ugin −10: gain 7, draw seven, then up to seven permanent cards from your hand onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([giant("G1"), giant("G2"), opt]);
    const u = putOnBattlefield(s0, ap, ugin);
    s0.objects[u]!.counters = { loyalty: 10 };
    const life = s0.players[ap]!.life;
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, u, 2)));
    expect(s.players[ap]!.life).toBe(life + 7);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.players[ap]!.hand.length).toBe(hand + 7);
    // Opt isn't a permanent card; at most seven.
    expect(s.pending.cards).not.toContain(ids[2]);
    expect(s.pending.max).toBe(7);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!, ids[1]!] }));
    expect([ids[0], ids[1]].map((id) => s.objects[id!]!.zone)).toEqual(["battlefield", "battlefield"]);
    expect(s.objects[ids[2]!]!.zone).toBe("hand");
  });

  it("Smuggler's Surprise: two of the milled creature or land cards, then two creature cards from your hand", () => {
    const { s: s0, ap, ids } = setup([surprise, giant("G1"), giant("G2"), giant("G3")]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, [0, 1]));
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    // The milled cards: Forests and Bears from the test library, all creature or land cards.
    expect(s.pending.max).toBe(2);
    const milled = s.pending.cards.slice(0, 2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: milled }));
    expect(milled.map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    if (s.pending?.kind !== "searchLibrary") throw new Error(`expected the hand pick, got ${s.pending?.kind}`);
    expect(s.pending.max).toBe(2);
    expect(s.pending.cards).toEqual(expect.arrayContaining([ids[1], ids[2], ids[3]]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, ids[2]!] }));
    expect([1, 2, 3].map((i) => s.objects[ids[i]!]!.zone)).toEqual(["battlefield", "battlefield", "hand"]);
  });
});
