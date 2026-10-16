// An "if" whose instructions include one that waits on a player: "If you control a blue creature, draw a card, then
// discard a card" (Statute of Denial) draws once, then waits on the discard and resumes there (CR 608.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const statute = card("Statute of Denial", "Instant", "{2}{U}{U}", { oracleText: "Counter target spell. If you control a blue creature, draw a card, then discard a card." });
const blueBear = card("Coral Merfolk", "Creature — Merfolk", "{1}{U}", { power: "2", toughness: "1" });

/** Cast `id` and then Statute of Denial on it, holding priority, and let them resolve until a choice. */
function counterIt(s: GameState, ap: PlayerId, id: string, statuteId: string): GameState {
  for (const a of planCast(s, ap, id)!) s = act(s, a);
  const spell = s.stack[s.stack.length - 1]!.id;
  for (const a of planCast(s, ap, statuteId, [{ kind: "stack", id: spell }])!) s = act(s, a);
  return passAll(s);
}

describe("an if with a discard inside", () => {
  it("compiles Statute of Denial", () => expect(isFullySupported(statute)).toBe(true));

  it("with a blue creature: counters, draws one card, then discards the card picked", () => {
    let { s, ap, ids } = setup([bear(), statute]);
    putOnBattlefield(s, ap, blueBear);
    const hand = s.players[ap]!.hand.length - 2;
    const library = s.players[ap]!.library.length;
    s = counterIt(s, ap, ids[0]!, ids[1]!);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard"); // countered
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    expect(s.players[ap]!.library.length).toBe(library - 1);
    const pick = s.players[ap]!.hand[0]!;
    s = act(s, { type: "discard", player: ap, objectIds: [pick] });
    expect(s.pending).toBeFalsy();
    // Resuming at the discard doesn't draw again.
    expect(s.players[ap]!.library.length).toBe(library - 1);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[pick]!.zone).toBe("graveyard");
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("without a blue creature: counters only", () => {
    let { s, ap, ids } = setup([bear(), statute]);
    const hand = s.players[ap]!.hand.length - 2;
    const library = s.players[ap]!.library.length;
    s = counterIt(s, ap, ids[0]!, ids[1]!);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.library.length).toBe(library);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("resumes after the instruction that waited: what came before it in the if isn't done again", () => {
    // Not a real card: an instruction that keeps nothing for itself before the one that waits.
    const test = card("Test Statute", "Instant", "{2}{U}{U}", { oracleText: "Counter target spell. If you control a blue creature, you gain 2 life, then discard a card." });
    expect(isFullySupported(test)).toBe(true);
    let { s, ap, ids } = setup([bear(), test]);
    putOnBattlefield(s, ap, blueBear);
    const life = s.players[ap]!.life;
    s = counterIt(s, ap, ids[0]!, ids[1]!);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});
