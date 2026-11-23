// Lane B round B303: least played first, one card off the skip lists. Turtles Forever: a search of your library (nothing
// is outside the game here) for exactly four legendary creature cards with different names, of which an opponent
// chooses two for your hand; the rest are shuffled back into your library.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A fresh copy of `def` on top of `pid`'s library. */
function toLibrary(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

// Real oracle text (Scryfall).
const turtles = (): CardDef => ({"oracleId":"cff5aca2-72c5-4053-a32c-c0bd3174c52d","name":"Turtles Forever","manaCost":"{3}{W}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Search your library and/or outside the game for exactly four legendary creature cards you own with different names, then reveal those cards. An opponent chooses two of them. Put the chosen cards into your hand and shuffle the rest into your library.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const legend = (name: string) => card(name, "Legendary Creature — Turtle", "{2}", { power: "2", toughness: "2" });

describe("Turtles Forever", () => {
  it("is fully supported", () => {
    expect(isFullySupported(turtles())).toBe(true);
  });

  it("finds exactly four legendary creature cards with different names; an opponent's two go to your hand, the rest are shuffled back", () => {
    const { s: s0, ap, ids } = setup([turtles()]);
    const four = ["Test Leo", "Test Raph", "Test Donnie", "Test Mikey"].map((n) => toLibrary(s0, ap, legend(n)));
    const twin = toLibrary(s0, ap, legend("Test Leo"));
    const plain = toLibrary(s0, ap, card("Test Turtle", "Creature — Turtle", "{1}", { power: "1", toughness: "1" }));
    const libSize = s0.players[ap]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 4, exactly: true });
    const offered = (s.pending as { cards: string[] }).cards;
    // One of each name is offered (cards with the same name in a library are alike); a nonlegendary creature isn't.
    expect(offered).toHaveLength(4);
    expect(offered).not.toContain(plain);
    expect(offered.filter((id) => id === four[0] || id === twin)).toHaveLength(1);
    const leo = offered.find((id) => id === four[0] || id === twin)!;
    const found = [leo, four[1]!, four[2]!, four[3]!];
    // Exactly four: not three (CR 701.23b lets it find none, not fewer).
    expect(() => act(s, { type: "searchLibrary", player: ap, found: found.slice(0, 3) })).toThrow();
    s = act(s, { type: "searchLibrary", player: ap, found });
    // "An opponent" is chosen as it resolves.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2, forPlayer: ap });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [four[1]!, four[3]!] }));
    expect(s.pending).toBeNull();
    expect(s.objects[four[1]!]!.zone).toBe("hand");
    expect(s.objects[four[3]!]!.zone).toBe("hand");
    expect(s.objects[leo]!.zone).toBe("library");
    expect(s.objects[four[2]!]!.zone).toBe("library");
    expect(s.players[ap]!.library).toHaveLength(libSize - 2);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /shuffles the rest into their library/.test(l.text))).toBe(true);
  });

  it("with fewer than four different names in the library, none can be found", () => {
    const { s: s0, ap, ids } = setup([turtles()]);
    const three = ["Test Leo", "Test Raph", "Test Donnie"].map((n) => toLibrary(s0, ap, legend(n)));
    toLibrary(s0, ap, legend("Test Raph"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.pending).toBeNull();
    expect(three.map((id) => s.objects[id]!.zone)).toEqual(["library", "library", "library"]);
  });

  it("a bot finds four, and the opponent bot picks two for its hand", () => {
    const { s: s0, ap, ids } = setup([turtles()]);
    const four = ["Test Leo", "Test Raph", "Test Donnie", "Test Mikey"].map((n) => toLibrary(s0, ap, legend(n)));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto"));
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending) for (const a of botActions(s, (s.pending as { player: PlayerId }).player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toBeNull();
    expect(four.filter((id) => s.objects[id]!.zone === "hand")).toHaveLength(2);
    expect(four.filter((id) => s.objects[id]!.zone === "library")).toHaveLength(2);
  });
});
