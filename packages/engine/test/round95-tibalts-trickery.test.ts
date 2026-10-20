// Round 95: Tibalt's Trickery: "Counter target spell. Choose 1, 2, or 3 at random. Its controller mills that many cards,
// then exiles cards from the top of their library until they exile a nonland card with a different name than that spell.
// They may cast that card without paying its mana cost. Then they put the exiled cards on the bottom of their library in
// a random order." (CR 701.6, 701.13, 608.2g)

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const trickery = card("Tibalt's Trickery", "Instant", "{1}{R}", { oracleText: "Counter target spell. Choose 1, 2, or 3 at random. Its controller mills that many cards, then exiles cards from the top of their library until they exile a nonland card with a different name than that spell. They may cast that card without paying its mana cost. Then they put the exiled cards on the bottom of their library in a random order." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const wastes = card("Wastes", "Basic Land", "");

const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  for (const a of plan!) s = act(s, a);
  return s;
};
function onTop(s: GameState, pid: PlayerId, defs: CardDef[]): string[] {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  invalidateCharacteristics(s);
  return ids;
}

describe("Tibalt's Trickery", () => {
  it("parse", () => expect(isFullySupported(trickery)).toBe(true));

  for (const seed of [5, 6, 7]) {
    it(`counters the spell; its controller mills 1-3, skips cards named like it, may cast the next nonland card free, the rest go to the bottom (seed ${seed})`, () => {
      const { s: s0, ap, opp } = setup([trickery], seed);
      // The opponent holds a Shock and has Mountains to cast it.
      const theirShock = putOnBattlefield(s0, opp, shock);
      s0.battlefield.splice(s0.battlefield.indexOf(theirShock), 1);
      s0.objects[theirShock]!.zone = "hand";
      s0.players[opp]!.hand.push(theirShock);
      putOnBattlefield(s0, opp, card("Mountain", "Basic Land — Mountain"));
      const [w1, w2, w3, sameName, w4, g] = onTop(s0, opp, [wastes, wastes, wastes, shock, wastes, giant]);
      const trick = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Tibalt's Trickery")!;
      // The opponent casts Shock at the active player at instant speed after the active player passes.
      let s = act(s0, { type: "passPriority", player: ap });
      while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = run(s, planCast(s, opp, theirShock, [{ kind: "player", id: ap }]));
      while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      const item = s.stack[s.stack.length - 1]!;
      s = run(s, planCast(s, ap, trick, [{ kind: "stack", id: item.id }]));
      for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.objects[theirShock]!.zone).toBe("graveyard");
      expect(s.pending).toMatchObject({ kind: "castFree", player: opp, objectId: g });
      s = run(s, planCast(s, opp, g!));
      for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.objects[g!]!.zone).toBe("battlefield");
      // Milled: 1 to 3 of the Wastes on top; the rest of what was exiled is now at the bottom of the library.
      const milled = [w1, w2, w3].filter((id) => s.objects[id!]!.zone === "graveyard").length;
      expect(milled).toBeGreaterThanOrEqual(1);
      expect(milled).toBeLessThanOrEqual(3);
      const lib = s.players[opp]!.library;
      const bottom = lib.slice(lib.length - (3 - milled + 2));
      expect(new Set(bottom)).toEqual(new Set([...[w1, w2, w3].filter((id) => s.objects[id!]!.zone === "library"), sameName, w4]));
      expect(s.players[ap]!.life).toBe(40);
    });
  }
});
