// "When ~ enters or dies", "Whenever ~ enters or attacks": one ability that triggers on either event, read for each
// event ("it" after it died is the card in the graveyard).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { compileCard, isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const thawbringer = card("Thawbringer", "Creature — Insect Scout", "{2}{G}", {
  power: "2",
  toughness: "1",
  oracleText: "When this creature enters or dies, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)",
});
const patron = card("Patron of the Arts", "Creature — Dwarf Pirate", "{2}{R}", {
  power: "2",
  toughness: "1",
  oracleText: "When this creature enters or dies, create a Treasure token.",
});
const herald = card("Primeval Herald", "Creature — Elf Druid", "{2}{G}", {
  power: "2",
  toughness: "3",
  keywords: ["Trample"],
  oracleText: "Trample\nWhenever this creature enters or attacks, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
});
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const treasures = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === "Treasure Token").length;

describe("enters-or triggers", () => {
  it("compile into two abilities", () => {
    for (const d of [thawbringer, patron, herald]) expect(isFullySupported(d), d.name).toBe(true);
    expect(compileCard(thawbringer).triggers.map((t) => t.event)).toEqual(["selfEnters", "selfDies"]);
    expect(compileCard(herald).triggers.map((t) => t.event)).toEqual(["selfEnters", "selfAttacks"]);
  });

  it("Patron of the Arts makes a Treasure when it enters and again when it dies", () => {
    const { s: s0, ap, ids } = setup([patron, murder]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(treasures(s, ap)).toBe(1);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "object", id: ids[0]! }]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(treasures(s, ap)).toBe(2);
  });

  it("Thawbringer surveils as it enters", () => {
    const { s: s0, ap, ids } = setup([thawbringer]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
  });

  it("Primeval Herald triggers when it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, herald);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
  });
});
