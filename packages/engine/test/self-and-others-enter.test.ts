// "Whenever ~ and/or one or more other creatures you control enter" (CR 603.2c): once for each event that puts it or
// any of the others onto the battlefield. Satoru's intervening if (CR 603.4): none of them was cast with mana spent on
// it (rulings: mana paid for additional costs counts).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const satoru = card("Satoru, the Infiltrator", "Legendary Creature — Human Ninja Rogue", "{U}{B}", { power: "2", toughness: "3", keywords: ["Menace"], oracleText: "Menace\nWhenever Satoru and/or one or more other nontoken creatures you control enter, if none of them were cast or no mana was spent to cast them, draw a card." });
const zombify = card("Zombify", "Sorcery", "{3}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
const triggered = (s: GameState, name: string) => s.log.filter((l) => l.text.startsWith(`${name}'s ability triggers`)).length;
function toGraveyard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
}

describe("~ and/or one or more other creatures enter", () => {
  it("parse", () => expect(isFullySupported(satoru)).toBe(true));

  it("Satoru: a creature cast with mana doesn't draw; one put onto the battlefield does", () => {
    const { s: s0, ap, ids } = setup([bear(), zombify]);
    putOnBattlefield(s0, ap, satoru);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(triggered(s, "Satoru, the Infiltrator")).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    const dead = toGraveyard(s, ap, bear({ name: "Dead Bear" }));
    s = settle(cast(s, ap, ids[1]!, [target(dead)]));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(triggered(s, "Satoru, the Infiltrator")).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });

  it("Satoru itself: cast with mana, no card; returned from the graveyard, a card", () => {
    const { s: s0, ap, ids } = setup([satoru, zombify]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(triggered(s, "Satoru, the Infiltrator")).toBe(0);
    const { s: t0, ap: p, ids: w } = setup([zombify]);
    const dead = toGraveyard(t0, p, satoru);
    const hand = t0.players[p]!.hand.length;
    const t = settle(cast(t0, p, w[0]!, [target(dead)]));
    expect(triggered(t, "Satoru, the Infiltrator")).toBe(1);
    expect(t.players[p]!.hand.length).toBe(hand - 1 + 1);
  });
});
