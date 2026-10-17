// Adeline with a token doubler: "You choose whether each token is attacking that opponent or a planeswalker they
// control as those tokens enter" (Adeline's rulings), so each of the tokens a doubler makes for one opponent gets its
// own choice (CR 508.4, 614.1a).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const adeline = card("Adeline, Resplendent Cathar", "Legendary Creature — Human Knight", "{1}{W}{W}", { power: "*", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nAdeline's power is equal to the number of creatures you control.\nWhenever you attack, for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control." });
const parallelLives = card("Parallel Lives", "Enchantment", "{3}{G}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." });
const walker = card("Walker Test", "Legendary Planeswalker — Test", "{3}", { loyalty: "3", oracleText: "+1: You gain 1 life." });

function settle(s: GameState, answer: (s: GameState) => Action | undefined) {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer(s);
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
const humans = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Human Token");

describe("Adeline with a token doubler", () => {
  it("each of the two tokens for an opponent with a planeswalker is asked about: one may attack the player, one the planeswalker", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, adeline);
    putOnBattlefield(s0, ap, parallelLives);
    const b1 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const w = putOnBattlefield(s0, b1, walker);
    s0.objects[w]!.counters.loyalty = 3;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: b1 }] });
    const prompts: string[] = [];
    s = settle(s, (x) => {
      if (x.pending?.kind !== "chooseOption" || x.pending.what !== "attackWhom") return undefined;
      prompts.push(x.pending.prompt!);
      return { type: "chooseOption", player: ap, choice: prompts.length === 1 ? String(b1) : `${b1}:${w}` };
    });
    // Only b1 has a planeswalker: two questions, one per token for b1.
    expect(prompts).toEqual([`choose what the Human token for ${s.players[b1]!.name} attacks (1 of 2)`, `choose what the Human token for ${s.players[b1]!.name} attacks (2 of 2)`]);
    const mine = humans(s, ap);
    expect(mine).toHaveLength(6);
    const atB1 = mine.filter((id) => s.objects[id]!.attacking === b1);
    expect(atB1).toHaveLength(2);
    expect(atB1.map((id) => s.objects[id]!.attackingPermanent?.id ?? null).sort()).toEqual([null, w].sort());
  });
});
