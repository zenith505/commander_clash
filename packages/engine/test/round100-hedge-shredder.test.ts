// Round 100: Hedge Shredder, "Whenever one or more land cards are put into your graveyard from your library, put them
// onto the battlefield tapped": one trigger for all of them (CR 603.2c), those still in the graveyard as it resolves
// (CR 400.7).

import { describe, expect, it } from "vitest";
import { act, card, cast, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const shredder = card("Hedge Shredder", "Artifact — Vehicle", "{2}{G}{G}", { power: "5", toughness: "5", oracleText: "Whenever this Vehicle attacks, you may mill two cards.\nWhenever one or more land cards are put into your graveyard from your library, put them onto the battlefield tapped.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const scour = card("Thought Scour", "Instant", "{U}", { oracleText: "Target player mills two cards.\nDraw a card." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Hedge Shredder", () => {
  it("parse", () => {
    expect(isFullySupported(shredder)).toBe(true);
  });

  it("milled lands come back tapped; other cards stay", () => {
    const { s: s0, ap, ids } = setup([scour]);
    putOnBattlefield(s0, ap, shredder);
    const lib = s0.players[ap]!.library;
    const land = lib.find((id) => characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    const spell = lib.find((id) => !characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    lib.splice(lib.indexOf(land), 1);
    lib.splice(lib.indexOf(spell), 1);
    lib.unshift(land, spell);
    s0.players[ap]!.manaPool.U = 1;
    const tappedLands = (g: GameState) => g.battlefield.filter((id) => g.objects[id]!.cardId === s0.objects[land]!.cardId && g.objects[id]!.tapped).length;
    const before = tappedLands(s0);
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(tappedLands(s)).toBe(before + 1);
    expect(s.players[ap]!.graveyard.some((id) => s.objects[id]!.cardId === s0.objects[spell]!.cardId)).toBe(true);
    expect(s.players[ap]!.graveyard.some((id) => s.objects[id]!.cardId === s0.objects[land]!.cardId)).toBe(false);
  });
});
