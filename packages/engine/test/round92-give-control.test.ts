// Round 92: giving control away (layer 2, CR 613.1b). Donate: "Target player gains control of target permanent you
// control." Wishclaw Talisman: "... An opponent gains control of this artifact. Activate only during your turn." You
// choose the opponent as the ability resolves; if they leave the game, you get it back (rulings, CR 800.4a).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, isFullySupported, planActivate, planCast, playerLoses, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const donate = card("Donate", "Sorcery", "{2}{U}", { oracleText: "Target player gains control of target permanent you control." });
const offering = card("Harmless Offering", "Sorcery", "{2}{R}", { oracleText: "Target opponent gains control of target permanent you control." });
const wishclaw = card("Wishclaw Talisman", "Artifact", "{1}{B}", { oracleText: "This artifact enters with three wish counters on it.\n{1}, {T}, Remove a wish counter from this artifact: Search your library for a card, put it into your hand, then shuffle. An opponent gains control of this artifact. Activate only during your turn." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};

describe("giving control away", () => {
  it("parse", () => [donate, offering, wishclaw].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Donate: the target player gains control of your permanent", () => {
    const { s: s0, ap, opp, ids } = setup([donate]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "object", id: b }])));
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
    // If that player leaves the game, the effect giving them control ends (CR 800.4a).
    playerLoses(s, opp, "test", true);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
  });

  it("Harmless Offering: only an opponent", () => {
    const { s, ap, ids } = setup([offering]);
    const b = putOnBattlefield(s, ap, bear());
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }, { kind: "object", id: b }])).toBeNull();
  });

  it("Wishclaw Talisman: search, then the opponent you choose gains control of it; they use it only on their turn", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wishclaw);
    s0.objects[w]!.counters.wish = 3;
    const hand = s0.players[ap]!.hand.length;
    let s = passAll(run(s0, planActivate(s0, ap, w, 0)));
    expect(s.pending?.kind).toBe("searchLibrary");
    const card0 = s.players[ap]!.library[5]!;
    s = act(s, { type: "searchLibrary", player: ap, found: [card0] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    const to = Number((s.pending as { options: string[] }).options[2]);
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: String(to) }));
    expect(s.players[ap]!.hand).toContain(card0);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(controllerOf(s, s.objects[w]!)).toBe(to);
    expect(s.objects[w]!.counters.wish).toBe(2);
    // Its new controller can't activate it during another player's turn.
    s.objects[w]!.tapped = false;
    s.players[to]!.manaPool.B = 1;
    s.priority = to;
    expect(planActivate(s, to, w, 0)).toBeNull();
  });

  it("bots don't give their permanents away with Donate", () => {
    const { s, ap, ids } = setup([donate]);
    putOnBattlefield(s, ap, bear());
    s.players[ap]!.isBot = true;
    s.players[ap]!.landsPlayedThisTurn = 1;
    s.players[ap]!.command = []; // no commander to cast instead
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    expect(acts.some((a) => a.type === "castSpell")).toBe(true); // it casts something else
  });
});
