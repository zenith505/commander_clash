// Round 100: Liberator, Urza's Battlethopter: "You may cast colorless spells and artifact spells as though they had
// flash" (either kind, CR 702.8a) and "if the amount of mana spent to cast that spell is greater than ~'s power" (the
// mana actually spent, rulings; an intervening "if", CR 603.4).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const liberator = card("Liberator, Urza's Battlethopter", "Legendary Artifact Creature — Thopter", "{3}", { power: "1", toughness: "2", keywords: ["Flash", "Flying"], oracleText: "Flash\nFlying\nYou may cast colorless spells and artifact spells as though they had flash.\nWhenever you cast a spell, if the amount of mana spent to cast that spell is greater than Liberator's power, put a +1/+1 counter on Liberator." });
const golem = card("Stone Golem", "Artifact Creature — Golem", "{5}", { power: "4", toughness: "4", oracleText: "" });
const bauble = card("Mishra's Bauble", "Artifact", "{0}", { oracleText: "" });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const ox = card("Ox", "Creature — Ox", "{1}{W}", { power: "2", toughness: "2", oracleText: "" });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Liberator", () => {
  it("parse", () => {
    expect(isFullySupported(liberator)).toBe(true);
  });

  it("artifact spells at instant speed; a counter when the mana spent is greater than its power", () => {
    const { s: s0, ap, ids } = setup([golem, ox, bauble, ornithopter]);
    const l = putOnBattlefield(s0, ap, liberator);
    let s = passUntil(s0, "beginCombat", ap);
    expect(castProblem(s, ap, ids[1]!)).toMatch(/sorcery|main phase|can't cast/i);
    s.players[ap]!.manaPool.C = 5;
    s = settle(cast(s, ap, ids[0]!));
    expect(s.battlefield).toContain(ids[0]);
    expect(s.objects[l]!.counters["+1/+1"]).toBe(1); // 5 spent, power 1
    s = settle(cast(s, ap, ids[3]!)); // nothing spent: no counter
    expect(s.objects[l]!.counters["+1/+1"]).toBe(1);
  });
});
