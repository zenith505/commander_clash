// Discard and cycling triggers (CR 701.9, 702.29): "whenever you cycle or discard a card", "whenever an opponent
// discards a card", "whenever a player cycles a card", "when you cycle ~" (it triggers from the graveyard, 702.29c);
// discarding a whole hand and wheels.

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const adept = card("Flameblade Adept", "Creature — Jackal Warrior", "{R}", {
  power: "1",
  toughness: "2",
  keywords: ["Menace"],
  oracleText: "Menace\nWhenever you cycle or discard a card, this creature gets +1/+0 until end of turn.",
});
const specter = card("Fell Specter", "Creature — Specter", "{3}{B}", {
  power: "1",
  toughness: "3",
  keywords: ["Flying"],
  oracleText: "Flying\nWhen this creature enters, target opponent discards a card.\nWhenever an opponent discards a card, that player loses 2 life.",
});
const healer = card("Drannith Healer", "Creature — Human Cleric", "{1}{W}", {
  power: "2",
  toughness: "2",
  keywords: ["Cycling"],
  oracleText: "Whenever you cycle another card, you gain 1 life.\nCycling {1} ({1}, Discard this card: Draw a card.)",
});
const tusker = card("Krosan Tusker", "Creature — Boar Beast", "{5}{G}{G}", {
  power: "6",
  toughness: "5",
  keywords: ["Cycling"],
  oracleText: "Cycling {2}{G} ({2}{G}, Discard this card: Draw a card.)\nWhen you cycle this card, you may search your library for a basic land card, reveal that card, put it into your hand, then shuffle.",
});
const lurker = card("Drownyard Lurker", "Creature — Eldrazi Trilobite", "{7}", {
  power: "6",
  toughness: "6",
  keywords: ["Cycling"],
  oracleText: "When you cast or cycle this card, create a 1/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\"\nCycling {2}",
});
const wheel = card("Wheel of Fortune", "Sorcery", "{2}{R}", { oracleText: "Each player discards their hand, then draws seven cards." });
const winds = card("Tolarian Winds", "Instant", "{1}{U}", { oracleText: "Discard all the cards in your hand, then draw that many cards." });
const windfall = card("Windfall", "Sorcery", "{2}{U}", { oracleText: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way." });
const myojin = card("Myojin of Night's Reach", "Legendary Creature — Spirit", "{5}{B}{B}{B}", {
  power: "5",
  toughness: "2",
  oracleText: "Myojin of Night's Reach enters with a divinity counter on it if you cast it from your hand.\nMyojin of Night's Reach has indestructible as long as it has a divinity counter on it.\nRemove a divinity counter from Myojin of Night's Reach: Each opponent discards their hand.",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("discard and cycling triggers", () => {
  it("compile", () => {
    for (const c of [adept, specter, healer, tusker, lurker, wheel, winds, windfall, myojin]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("cycling a card triggers 'whenever you cycle or discard a card' once, before the draw", () => {
    const { s: s0, ap, ids } = setup([healer]);
    const a = putOnBattlefield(s0, ap, adept);
    const hand = s0.players[ap]!.hand.length;
    let s = s0;
    for (const x of planActivate(s, ap, ids[0]!, 0)!) s = act(s, x);
    s = act(s, { type: "passPriority", player: waitingOn(s)! }); // the trigger goes on the stack as a player gets priority
    expect(s.stack.length).toBe(2); // the trigger is on top of the cycling ability (rulings)
    expect(s.stack[1]!.kind).toBe("ability");
    s = settle(s);
    expect(pt(s, a)).toBe("2/2");
    expect(s.players[ap]!.hand.length).toBe(hand); // cycled one, drew one
  });

  it("'whenever you cycle another card' doesn't see the card itself", () => {
    const { s: s0, ap, ids } = setup([healer, healer]);
    putOnBattlefield(s0, ap, healer);
    const life = s0.players[ap]!.life;
    const s = settle(activate(s0, ap, ids[0]!, 0));
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("'whenever an opponent discards a card, that player loses 2 life'", () => {
    const { s: s0, ap, opp } = setup([wheel]);
    putOnBattlefield(s0, ap, specter);
    const n = s0.players[opp]!.hand.length;
    const life = s0.players[opp]!.life;
    const wid = s0.players[ap]!.hand[s0.players[ap]!.hand.length - 1]!;
    const s = settle(cast(s0, ap, wid));
    expect(s.players[opp]!.life).toBe(life - 2 * n);
    expect(s.players[opp]!.hand.length).toBe(7);
    expect(s.players[ap]!.hand.length).toBe(7);
  });

  it("'when you cycle ~' triggers from the graveyard", () => {
    const { s: s0, ap, ids } = setup([tusker]);
    let s = activate(s0, ap, ids[0]!, 0);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("'when you cast or cycle ~' is two abilities", () => {
    const { s: s0, ap, ids } = setup([lurker]);
    const before = s0.battlefield.length;
    const s = settle(activate(s0, ap, ids[0]!, 0));
    expect(s.battlefield.length).toBe(before + 1);
  });

  it("Tolarian Winds draws as many as were discarded; Windfall the most anyone discarded", () => {
    const { s: s0, ap, ids } = setup([winds, adept, adept, adept]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(s0.players[ap]!.hand.length - 1);
    const { s: s1, ap: ap1, ids: ids1, opp } = setup([windfall, adept, adept, adept, adept, adept, adept, adept, adept]);
    s = settle(cast(s1, ap1, ids1[0]!));
    const most = Math.max(...s1.turnOrder.map((p) => s1.players[p]!.hand.length - (p === ap1 ? 1 : 0)));
    expect(s.players[opp]!.hand.length).toBe(most);
    expect(s.players[ap1]!.hand.length).toBe(most);
  });

  it("the Myojin gets its divinity counter only if cast from your hand", () => {
    const { s: s0, ap, ids, opp } = setup([myojin]);
    putOnBattlefield(s0, ap, swamp);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters.divinity).toBe(1);
    s = settle(activate(s, ap, ids[0]!, 0));
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(s.objects[ids[0]!]!.counters.divinity ?? 0).toBe(0);
    const { s: s2, ap: ap2 } = setup([]);
    const put = putOnBattlefield(s2, ap2, myojin);
    expect(s2.objects[put]!.counters.divinity ?? 0).toBe(0);
  });
});
