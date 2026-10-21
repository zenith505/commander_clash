// Round 100: Summon: Bahamut, "the total mana value of other permanents you control" (X counts 0, CR 107.3; figured as
// the chapter ability resolves, rulings), the Saga itself left out.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const bahamut = card("Summon: Bahamut", "Enchantment Creature — Saga Dragon", "{9}", { power: "9", toughness: "9", keywords: ["Flying"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II — Destroy up to one target nonland permanent.\nIII — Draw two cards.\nIV — Mega Flare — This creature deals damage equal to the total mana value of other permanents you control to each opponent.\nFlying" });
const ring = card("The One Ring", "Legendary Artifact", "{4}", { oracleText: "" });
const fireball = card("Endless Forge", "Artifact", "{X}{X}", { oracleText: "" });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Summon: Bahamut", () => {
  it("parse", () => {
    expect(isFullySupported(bahamut)).toBe(true);
  });

  it("Mega Flare: damage equal to the other permanents' total mana value to each opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bahamut);
    s0.objects[b]!.counters.lore = 3;
    putOnBattlefield(s0, ap, bear()); // 2
    putOnBattlefield(s0, ap, ring); // 4
    putOnBattlefield(s0, ap, fireball); // X is 0
    putOnBattlefield(s0, opp, bear()); // not yours
    const before = s0.turnOrder.filter((p) => p !== ap).map((p) => s0.players[p]!.life);
    let s = passUntil(s0, "end", ap);
    s = settle(passUntil(s, "main1", ap));
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life)).toEqual(before.map((l) => l - 6));
    expect(s.battlefield).not.toContain(b); // sacrificed after IV
  });
});
