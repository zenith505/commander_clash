// The order of graveyards (CR 404): cards go on top (404.1), nobody rearranges them (404.2), except that cards put into
// the same graveyard at the same time are arranged by their owner (404.3); the spell that did it goes on top of them
// as it finishes resolving (608.2n, rulings on Krovikan Horror).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });
const pyroclasm = card("Pyroclasm", "Sorcery", "{1}{R}", { oracleText: "Pyroclasm deals 2 damage to each creature." });
const digger = card("Soldevi Digger", "Artifact", "{2}", { oracleText: "{2}: Put the top card of your graveyard on the bottom of your library." });

function run(s: GameState, plan: Action[] | null): GameState {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
/** A player's graveyard by name, top first. */
const yard = (s: GameState, pid: PlayerId) => [...s.players[pid]!.graveyard].reverse().map((id) => name(s, id));
const bears = (s: GameState, pid: PlayerId, names: string[]) => names.map((n) => putOnBattlefield(s, pid, bear({ name: n })));

describe("graveyard order", () => {
  it("Wrath of God: the owner arranges the creatures it destroys, then Wrath of God goes on top of them", () => {
    const { s: s0, ap, ids, opp } = setup([wrath]);
    putOnBattlefield(s0, opp, digger);
    const [a, b, c] = bears(s0, ap, ["Bear A", "Bear B", "Bear C"]);
    bears(s0, opp, ["Bear X"]); // one card: nothing to arrange
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "orderGraveyard", player: ap });
    if (s.pending?.kind !== "orderGraveyard") throw new Error("no order");
    expect(new Set(s.pending.cards)).toEqual(new Set([a, b, c]));
    expect(() => act(s, { type: "orderGraveyard", player: ap, order: [a!, b!] })).toThrow();
    s = act(s, { type: "orderGraveyard", player: ap, order: [b!, c!, a!] });
    expect(s.pending).toBeNull();
    expect(yard(s, ap)).toEqual(["Wrath of God", "Bear B", "Bear C", "Bear A"]);
    expect(yard(s, opp)).toEqual(["Bear X"]);
  });

  it("each owner arranges their own cards, in turn order from the active player (CR 101.4)", () => {
    const { s: s0, ap, ids, opp } = setup([wrath]);
    putOnBattlefield(s0, ap, digger);
    bears(s0, ap, ["Bear A", "Bear B"]);
    const [x, y] = bears(s0, opp, ["Bear X", "Bear Y"]);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "orderGraveyard", player: ap });
    s = act(s, botActions(s, ap)[0]!);
    expect(s.pending).toMatchObject({ kind: "orderGraveyard", player: opp });
    s = act(s, { type: "orderGraveyard", player: opp, order: [y!, x!] });
    expect(s.pending).toBeNull();
    expect(yard(s, opp)).toEqual(["Bear Y", "Bear X"]);
    expect(yard(s, ap)[0]).toBe("Wrath of God");
  });

  it("creatures dying together to state-based actions (CR 704.3) are arranged after the spell is already on top", () => {
    const { s: s0, ap, ids } = setup([pyroclasm]);
    putOnBattlefield(s0, ap, digger);
    const [a, b] = bears(s0, ap, ["Bear A", "Bear B"]);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "orderGraveyard", player: ap });
    s = act(s, { type: "orderGraveyard", player: ap, order: [a!, b!] });
    expect(yard(s, ap)).toEqual(["Bear A", "Bear B", "Pyroclasm"]);
    expect(waitingOn(s)).toBe(ap);
  });

  it("nobody is asked when no card in the game cares about graveyard order", () => {
    const { s: s0, ap, ids } = setup([wrath]);
    bears(s0, ap, ["Bear A", "Bear B"]);
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(yard(s, ap)).toHaveLength(3);
  });
});
