// Round 92: Plaguecrafter. "When this creature enters, each player sacrifices a creature or planeswalker of their
// choice. Each player who can't discards a card." The sacrifices first, then each player who had nothing to sacrifice
// discards (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const plaguecrafter = card("Plaguecrafter", "Creature — Human Shaman", "{2}{B}", { power: "3", toughness: "2", oracleText: "When this creature enters, each player sacrifices a creature or planeswalker of their choice. Each player who can't discards a card." });

describe("Plaguecrafter", () => {
  it("parse", () => expect(isFullySupported(plaguecrafter)).toBe(true));

  it("each player sacrifices; those with nothing to sacrifice discard a card", () => {
    const { s: s0, ap, ids } = setup([plaguecrafter]);
    const [o1, o2, o3] = s0.turnOrder.filter((p) => p !== ap);
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller !== ap) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const b = putOnBattlefield(s0, o1!, bear());
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length);
    let s: GameState = passAll(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    const discarded: number[] = [];
    for (let i = 0; i < 20 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "discard") {
        discarded.push(p.player);
        s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard"); // its controller's only creature
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(discarded.sort()).toEqual([o2, o3].sort());
    expect(s.players[o1!]!.hand.length).toBe(hands[s0.turnOrder.indexOf(o1!)]);
    expect(s.players[o2!]!.hand.length).toBe(hands[s0.turnOrder.indexOf(o2!)]! - 1);
  });
});
