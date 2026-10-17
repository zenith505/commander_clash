// "If you controlled that permanent, draw a card" about the target an instruction just moved (Geistwave, Boomerang Basics,
// Hotshot Investigators): you control it as the spell resolves, or did as it last existed on the battlefield (CR 608.2h).
// Rulings: not if you controlled it only earlier (Geistwave); still if it wasn't destroyed (Kellan, Inquisitive Prodigy).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const geistwave = card("Geistwave", "Instant", "{1}{U}", { oracleText: "Return target nonland permanent to its owner's hand. If you controlled that permanent, draw a card." });
const boomerang = card("Boomerang Basics", "Sorcery — Lesson", "{U}", { oracleText: "Return target nonland permanent to its owner's hand. If you controlled that permanent, draw a card." });
const hotshot = card("Hotshot Investigators", "Creature — Vedalken Detective", "{5}{U}", { power: "4", toughness: "4", keywords: ["Investigate"], oracleText: "When this creature enters, return up to one other target creature to its owner's hand. If you controlled it, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
// Kellan, Inquisitive Prodigy's attack trigger, as a sorcery (Kellan's other face isn't supported yet).
const kellanLine = card("Kellan Test", "Sorcery", "{1}", { oracleText: "Destroy up to one target artifact. If you controlled that permanent, draw a card." });
const relic = card("Darksteel Relic", "Artifact", "{0}", { keywords: ["Indestructible"], oracleText: "Indestructible" });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};

describe("if you controlled that permanent", () => {
  it("parse", () => {
    for (const d of [geistwave, boomerang, hotshot, kellanLine]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Geistwave: draws for your own permanent, not an opponent's", () => {
    for (const mine of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([geistwave]);
      const b = putOnBattlefield(s0, mine ? ap : opp, bear());
      const hand = s0.players[ap]!.hand.length;
      const s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
      expect(s.objects[b]!.zone).toBe("hand");
      expect(s.players[mine ? ap : opp]!.hand).toContain(b);
      // Geistwave left the hand; your own bear came back to it; and a card was drawn for it.
      expect(s.players[ap]!.hand.length, String(mine)).toBe(mine ? hand + 1 : hand - 1);
    }
  });

  it("Boomerang Basics: a permanent you control but don't own goes to its owner, and you still draw", () => {
    const { s: s0, ap, opp, ids } = setup([boomerang]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.owner = opp;
    const hand = s0.players[ap]!.hand.length;
    const theirs = s0.players[opp]!.hand.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    expect(s.players[opp]!.hand).toContain(b);
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
    expect(s.players[ap]!.hand.length).toBe(hand); // -1 Boomerang Basics, +1 draw
  });

  it("an indestructible artifact you control that isn't destroyed still draws (Kellan ruling)", () => {
    for (const mine of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([kellanLine]);
      const r = putOnBattlefield(s0, mine ? ap : opp, relic);
      const hand = s0.players[ap]!.hand.length;
      const s = run(s0, planCast(s0, ap, ids[0]!, [target(r)]));
      expect(s.objects[r]!.zone).toBe("battlefield");
      expect(s.players[ap]!.hand.length, String(mine)).toBe(mine ? hand : hand - 1);
    }
  });

  it("Hotshot Investigators: investigates only for your own creature, and not with no target", () => {
    for (const who of ["mine", "theirs", "none"] as const) {
      const { s: s0, ap, opp, ids } = setup([hotshot]);
      const b = putOnBattlefield(s0, who === "theirs" ? opp : ap, bear());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 10 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
        const p = s.pending;
        if (p?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: p.player, targets: [who === "none" ? { kind: "none" } : target(b)] }));
        else s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
      }
      expect(s.objects[b]!.zone, who).toBe(who === "none" ? "battlefield" : "hand");
      const clues = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Clue Token");
      expect(clues.length, who).toBe(who === "mine" ? 1 : 0);
    }
  });
});
