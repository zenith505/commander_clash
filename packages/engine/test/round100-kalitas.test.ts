// Round 100: Kalitas, Traitor of Ghet: "If a nontoken creature an opponent controls would die, instead exile that card
// and create a 2/2 black Zombie creature token." One replacement effect (CR 614.1a); tokens die as usual (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const kalitas = card("Kalitas, Traitor of Ghet", "Legendary Creature — Vampire Warrior", "{2}{B}{B}", { power: "3", toughness: "4", keywords: ["Lifelink"], oracleText: "Lifelink\nIf a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token.\n{2}{B}, Sacrifice another Vampire or Zombie: Put two +1/+1 counters on Kalitas." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zombies = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.startsWith("Zombie")).length;

describe("round 100: Kalitas, Traitor of Ghet", () => {
  it("parse", () => expect(isFullySupported(kalitas)).toBe(true));

  it("an opponent's creature is exiled instead of dying, and Kalitas's controller gets a Zombie", () => {
    const { s: s0, ap, opp, ids } = setup([murder]);
    putOnBattlefield(s0, ap, kalitas);
    const b = putOnBattlefield(s0, opp, bear());
    s0.players[ap]!.manaPool.B = 3;
    const plan = planCast(s0, ap, ids[0]!, [target(b)]);
    if (!plan) throw new Error("can't cast");
    const s = settle(plan.reduce((x, a) => act(x, a), s0));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(zombies(s, ap)).toBe(1);
  });

  it("not its controller's own creatures", () => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, kalitas);
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.manaPool.B = 3;
    const plan = planCast(s0, ap, ids[0]!, [target(b)]);
    if (!plan) throw new Error("can't cast");
    const s = settle(plan.reduce((x, a) => act(x, a), s0));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(zombies(s, ap)).toBe(0);
  });
});
