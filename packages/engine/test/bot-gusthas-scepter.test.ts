// Bots and Gustha's Scepter ("{T}: Exile a card from your hand face down. You may look at it for as long as it remains
// exiled. / {T}: Return a card you own exiled with this artifact to your hand."): in its second main phase, a bot hides a
// card it would otherwise discard in the cleanup step (CR 402.2, 514.1), and takes one back once there's room.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, waitingOn, type GameState, type PlayerId } from "../src";

const scepter = card("Gustha's Scepter", "Artifact", "{0}", { oracleText: "{T}: Exile a card from your hand face down. You may look at it for as long as it remains exiled.\n{T}: Return a card you own exiled with this artifact to your hand.\nWhen you lose control of this artifact, put all cards exiled with this artifact into their owner's graveyard." });
const huge = card("Test Colossus", "Creature — Giant", "{20}", { power: "20", toughness: "20" });

/** The active player, a bot in its second main phase with `n` uncastable cards in hand and a Scepter. */
function botWith(n: number) {
  const { s: s0, ap } = setup([]);
  let s = passUntil(s0, "main2", ap);
  const p = s.players[ap]!;
  for (const id of [...p.hand]) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = [];
  for (let i = 0; i < n; i++) {
    const id = putOnBattlefield(s, ap, huge);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    p.hand.push(id);
  }
  p.isBot = true;
  const g = putOnBattlefield(s, ap, scepter);
  return { s, ap, g };
}
/** The bot plays until it passes priority with an empty stack. */
function botTurn(s: GameState, ap: PlayerId) {
  for (let i = 0; i < 30; i++) {
    const who = waitingOn(s)!;
    if (who === ap && !s.pending && !s.stack.length) {
      const acts = botActions(s, ap);
      if (acts.length === 1 && acts[0]!.type === "passPriority") return s;
      s = acts.reduce((x, a) => act(x, a), s);
      continue;
    }
    s = (who === ap ? botActions(s, ap) : [{ type: "passPriority" as const, player: who }]).reduce((x, a) => act(x, a), s);
  }
  return s;
}

describe("bots with Gustha's Scepter", () => {
  it("hides a card from a hand over its maximum size", () => {
    const { s: s0, ap, g } = botWith(8);
    const s = botTurn(s0, ap);
    expect(s.players[ap]!.hand).toHaveLength(7);
    expect(s.objects[g]!.tapped).toBe(true);
    expect(s.players[ap]!.exile.some((id) => s.objects[id]!.hiddenExile?.by === g)).toBe(true);
  });

  it("leaves it alone with seven cards or fewer and nothing hidden", () => {
    const { s: s0, ap, g } = botWith(7);
    const s = botTurn(s0, ap);
    expect(s.objects[g]!.tapped).toBe(false);
    expect(s.players[ap]!.hand).toHaveLength(7);
  });

  it("takes a hidden card back once there's room", () => {
    const { s: s0, ap, g } = botWith(8);
    let s = botTurn(s0, ap);
    const hidden = s.players[ap]!.exile.find((id) => s.objects[id]!.hiddenExile?.by === g)!;
    // Down to five cards in hand, the Scepter untapped again.
    const p = s.players[ap]!;
    for (const id of p.hand.splice(0, 2)) {
      s.objects[id]!.zone = "graveyard";
      p.graveyard.push(id);
    }
    s.objects[g]!.tapped = false;
    s = botTurn(s, ap);
    expect(s.objects[hidden]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toHaveLength(6);
  });
});
