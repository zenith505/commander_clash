// A countered spell's cascade still resolves (rulings on cascade cards), using the spell as it last existed on the stack
// (CR 113.7a): its mana value there counts the X chosen for it (CR 202.3e), not just its printed mana cost.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const imoti = card("Imoti, Celebrant of Bounty", "Legendary Creature — Naga Druid", "{3}{G}{U}", { power: "6", toughness: "4", oracleText: "Spells you cast with mana value 6 or greater have cascade. (When you cast your first spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const island = card("Island", "Basic Land — Island");
const blaze = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "~ deals X damage to any target." });
const fiveDrop = card("Five Drop", "Sorcery", "{4}{R}", { oracleText: "Draw a card." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}
function toHand(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}

describe("cascade of a countered X spell", () => {
  it("parses", () => expect(isFullySupported(imoti) && isFullySupported(counterspell)).toBe(true));

  it("uses the mana value the spell had on the stack, X included, after it was countered", () => {
    const { s: s0, ap, ids, opp } = setup([blaze]);
    putOnBattlefield(s0, ap, imoti);
    putOnBattlefield(s0, opp, island);
    putOnBattlefield(s0, opp, island);
    const cs = toHand(s0, opp, counterspell);
    const five = onTop(s0, ap, fiveDrop);
    // Test Blaze with X = 5: mana value 6 on the stack, so Imoti gives it cascade.
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 5));
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.some((x) => x.description.includes("Cascade"))).toBe(true);
    // In response to cascade, the opponent counters Test Blaze.
    const target: TargetChoice = { kind: "stack", id: s.stack.find((x) => x.kind === "spell")!.id };
    s = run(s, planCast(s, opp, cs, [target]));
    for (let i = 0; i < 20 && s.pending?.kind !== "castFree" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Cascade looked for less than 6, not less than its printed 1: the five-drop is hit and may be cast.
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: five });
  });
});
