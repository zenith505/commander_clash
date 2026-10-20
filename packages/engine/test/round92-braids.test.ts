// Round 92: Braids, Arisen Nightmare. "At the beginning of your end step, you may sacrifice an artifact, creature,
// enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a
// card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card."

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const braids = card("Braids, Arisen Nightmare", "Legendary Creature — Nightmare", "{1}{B}{B}", { power: "3", toughness: "3", oracleText: "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });

/** To `ap`'s end step, with Braids's trigger asking whether to sacrifice. */
function toEndStep(s: GameState, ap: PlayerId) {
  for (let i = 0; i < 200 && !(s.step === "end" && s.pending); i++) {
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else s = act(s, { type: "passPriority", player: pid });
  }
  expect(s.activePlayer).toBe(ap);
  return s;
}

describe("Braids, Arisen Nightmare", () => {
  it("parse", () => expect(isFullySupported(braids)).toBe(true));

  it("sacrifice an artifact: the opponent with an artifact may sacrifice one; the others lose 2 life and you draw for each", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, braids);
    const mine = putOnBattlefield(s0, ap, relic);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const theirs = putOnBattlefield(s0, opps[0]!, relic);
    const creature = putOnBattlefield(s0, opps[1]!, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = toEndStep(s0, ap);
    // You may sacrifice: yes.
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [mine] });
    expect(s.objects[mine]!.zone).toBe("graveyard");
    // The opponents choose in turn order. The first may sacrifice its artifact; the others have none that shares a type.
    const answered: PlayerId[] = [];
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "chooseOption" && p.what === "punisher") {
        answered.push(p.player);
        if (p.player === opps[0]) {
          expect(p.labels![0]).toBe("Sacrifice a permanent that shares a card type with it");
          s = act(s, { type: "chooseOption", player: p.player, choice: p.options[0]! });
        } else s = act(s, { type: "chooseOption", player: p.player, choice: "none" });
      } else if (p.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) });
      else break;
    }
    expect(answered).toEqual([opps[0]]); // the creature isn't an artifact: no choice to make
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[creature]!.zone).toBe("battlefield");
    expect(opps.map((p) => s.players[p]!.life)).toEqual([40, 38, 38]);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("not sacrificing does nothing", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, braids);
    let s = toEndStep(s0, ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual([40, 40, 40, 40]);
  });

  it("bots answer it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, braids);
    for (const p of s0.turnOrder) s0.players[p]!.isBot = true;
    let s = toEndStep(s0, ap);
    for (let i = 0; i < 20 && s.pending && s.step === "end"; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    expect(s.pending?.kind ?? "none").not.toBe("chooseOption");
  });
});
