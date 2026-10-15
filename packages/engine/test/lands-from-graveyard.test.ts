// "You may play lands from your graveyard." (Crucible of Worlds): a permission to play land cards from your own
// graveyard; it doesn't change when, and each one is still your land play for the turn (CR 305.1-2, rulings).

import { describe, expect, it } from "vitest";
import { act, card, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, legalActions, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Puts a new card into `pid`'s graveyard. */
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const playable = (s: GameState, pid: PlayerId, id: string) => legalActions(s, pid).some((a) => a.type === "playLand" && a.objectId === id);

// Real oracle text (Scryfall).
const crucible = card("Crucible of Worlds", "Artifact", "{3}", { oracleText: "You may play lands from your graveyard." });

describe("play lands from your graveyard", () => {
  it("with Crucible of Worlds a land in your graveyard can be your land play, and only that one", () => {
    supported(crucible);
    const { s: s0, ap, opp } = setup([]);
    const land = inGraveyard(s0, ap, forest);
    const theirs = inGraveyard(s0, opp, forest);
    expect(playable(s0, ap, land)).toBe(false);
    putOnBattlefield(s0, ap, crucible);
    expect(playable(s0, ap, land)).toBe(true);
    expect(playable(s0, ap, theirs)).toBe(false); // only your own graveyard
    const s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
    // The land play is used up: another graveyard land can't be played this turn.
    const second = inGraveyard(s, ap, forest);
    expect(playable(s, ap, second)).toBe(false);
    expect(() => act(s, { type: "playLand", player: ap, objectId: second })).toThrow();
  });

  it("not a nonland card, and not for another player", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, crucible);
    const spell = inGraveyard(s0, ap, card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." }));
    expect(() => act(s0, { type: "playLand", player: ap, objectId: spell })).toThrow();
    const land = inGraveyard(s0, opp, forest);
    expect(playable(s0, opp, land)).toBe(false); // my Crucible gives them nothing
  });
});
