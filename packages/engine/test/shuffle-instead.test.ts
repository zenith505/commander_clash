// "If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead"
// (Darksteel Colossus): a replacement effect (CR 614.1a) that works in every zone.

import { describe, expect, it } from "vitest";
import { act, addEffect, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const colossus = card("Darksteel Colossus", "Artifact Creature — Golem", "{11}", {
  power: "11",
  toughness: "11",
  keywords: ["Indestructible", "Trample"],
  oracleText:
    "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nIndestructible (Damage and effects that say \"destroy\" don't destroy this creature.)\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead.",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("shuffled into its library instead of a graveyard (Darksteel Colossus)", () => {
  it("compiles", () => expect(isFullySupported(colossus)).toBe(true));

  it("from the battlefield (0 toughness, CR 704.5f): into the library, which is shuffled; it didn't die", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, colossus);
    const lib = s0.players[ap]!.library.length;
    addEffect(s0, ap, [c], [{ kind: "modifyPT", power: -11, toughness: -11 }]);
    const s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.objects[c]!.zone).toBe("library");
    expect(s.players[ap]!.graveyard).not.toContain(c);
    expect(s.players[ap]!.library.length).toBe(lib + 1);
    expect(s.log.some((l) => /reveals Darksteel Colossus and shuffles it/.test(l.text))).toBe(true);
  });

  it("from the hand, discarded: also into the library", () => {
    const { s: s0, ap, ids } = setup([colossus]);
    s0.pending = { kind: "discardToHandSize", player: ap, count: 1 } as GameState["pending"];
    const s = act(s0, { type: "discard", player: ap, objectIds: [ids[0]!] });
    expect(s.objects[ids[0]!]!.zone).toBe("library");
  });

  it("not once it has lost its abilities on the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, colossus);
    addEffect(s0, ap, [c], [{ kind: "loseAllAbilities" }, { kind: "modifyPT", power: -11, toughness: -11 }]);
    const s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.objects[c]!.zone).toBe("graveyard");
  });
});
