// Round 92: Archdruid's Charm. "Choose one — • Search your library for a creature or land card and reveal it. Put it onto
// the battlefield tapped if it's a land card. Otherwise, put it into your hand. Then shuffle. • Put a +1/+1 counter on
// target creature you control. It deals damage equal to its power to target creature you don't control. • Exile target
// artifact or enchantment."

import { describe, expect, it } from "vitest";
import { act, card, passAll, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, type GameState } from "../src";

// Real oracle text (Scryfall).
const charm = card("Archdruid's Charm", "Instant", "{G}{G}{G}", { oracleText: "Choose one —\n• Search your library for a creature or land card and reveal it. Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand. Then shuffle.\n• Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you don't control.\n• Exile target artifact or enchantment." });

function search(pick: "Land" | "Creature") {
  const { s: s0, ap, ids } = setup([charm]);
  let s: GameState = passAll(planCast(s0, ap, ids[0]!, undefined, [0])!.reduce((x, a) => act(x, a), s0));
  expect(s.pending?.kind).toBe("searchLibrary");
  const found = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes(pick))!;
  s = act(s, { type: "searchLibrary", player: ap, found: [found] });
  return { s, found };
}

describe("Archdruid's Charm", () => {
  it("parse", () => expect(isFullySupported(charm)).toBe(true));

  it("a land card found goes onto the battlefield tapped", () => {
    const { s, found } = search("Land");
    expect(s.objects[found]!.zone).toBe("battlefield");
    expect(s.objects[found]!.tapped).toBe(true);
  });

  it("a creature card found goes into your hand", () => {
    const { s, found } = search("Creature");
    expect(s.objects[found]!.zone).toBe("hand");
  });

  it("the other modes: fight-like damage, exile an artifact", () => {
    const { s: s0, ap, opp, ids } = setup([charm]);
    const mine = putOnBattlefield(s0, ap, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const theirs = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const s = passAll(planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }, { kind: "object", id: theirs }], [1])!.reduce((x, a) => act(x, a), s0));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });
});
