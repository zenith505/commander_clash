// "The number of (Treasure) tokens you created this turn" (CR 111.2; rulings on Thalisse: every token you created this
// turn, wherever it is now; a copy of a permanent spell isn't created). Vazi's "Whenever an opponent casts a spell or
// activates an ability, if mana from a Treasure was spent to cast it or activate it" (CR 106.3, 603.4): mana abilities
// are abilities too.

import { describe, expect, it } from "vitest";
import { act, card, cast, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const vazi = card("Vazi, Keen Negotiator", "Legendary Creature — Human Advisor", "{2}{B}{R}{G}", { power: "3", toughness: "4", keywords: ["Haste"], oracleText: "Haste\n{T}: Target opponent creates X Treasure tokens, where X is the number of Treasure tokens you created this turn.\nWhenever an opponent casts a spell or activates an ability, if mana from a Treasure was spent to cast it or activate it, put a +1/+1 counter on target creature, then draw a card." });
const thalisse = card("Thalisse, Reverent Medium", "Legendary Creature — Human Cleric", "{3}{W}{B}", { power: "3", toughness: "4", oracleText: "At the beginning of each end step, create X 1/1 white Spirit creature tokens with flying, where X is the number of tokens you created this turn." });
const riches = card("Test Riches", "Sorcery", "{1}{R}", { oracleText: "Create two Treasure tokens." });
const clues = card("Test Clues", "Sorcery", "{1}{U}", { oracleText: "Investigate." });
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });
const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const pumper = card("Test Pumper", "Creature — Shade", "{B}", { power: "1", toughness: "1", oracleText: "{B}: This creature gets +1/+1 until end of turn." });

function settle(s: GameState): GameState {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
}
const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.subtypes.includes("Treasure")).length;

describe("tokens you created this turn, and Vazi", () => {
  it("parse", () => supported(vazi, thalisse));

  it("Vazi's {T}: the opponent creates as many Treasures as you created this turn, only Treasures", () => {
    const { s: s0, ap, opp, ids } = setup([riches, clues]);
    const v = putOnBattlefield(s0, ap, vazi);
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(cast(s, ap, ids[1]!));
    expect(treasures(s, ap)).toBe(2);
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: v, index: 0, targets: [{ kind: "player", id: opp }] }));
    expect(treasures(s, opp)).toBe(2);
  });

  it("counts tokens that are gone, and not another player's", () => {
    const { s: s0, ap, opp, ids } = setup([riches]);
    let s = settle(cast(s0, ap, ids[0]!));
    // Sacrifice one Treasure for mana: it was still created this turn.
    const t = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    s = act(s, { type: "activateMana", player: ap, objectId: t, mana: "R" });
    const v = putOnBattlefield(s, ap, vazi);
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: v, index: 0, targets: [{ kind: "player", id: opp }] }));
    expect(treasures(s, opp)).toBe(2);
    // The opponent's Treasures were created by them: Vazi's controller's count is unchanged.
    expect(s.turnLog?.tokensCreated?.filter((x) => x.player === ap)).toHaveLength(2);
  });

  it("Thalisse: at each end step, a Spirit for each token you created this turn", () => {
    const { s: s0, ap, ids } = setup([riches]);
    putOnBattlefield(s0, ap, thalisse);
    let s = settle(cast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && s.step !== "end"; i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    const spirits = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.subtypes.includes("Spirit"));
    expect(spirits).toHaveLength(2);
  });

  it("Vazi's trigger: an opponent's spell or ability paid with a Treasure's mana, not one paid otherwise", () => {
    const { s: s0, ap, opp, ids } = setup([giant, giant]);
    putOnBattlefield(s0, opp, vazi);
    const hand = s0.players[opp]!.hand.length;
    // With lands only: nothing.
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[opp]!.hand.length).toBe(hand);
    // With a Treasure's mana: a counter and a card.
    const t = putOnBattlefield(s, ap, treasure);
    s = act(s, { type: "activateMana", player: ap, objectId: t, mana: "R" });
    const plan: Action[] = planCast(s, ap, ids[1]!)!;
    for (const a of plan) s = act(s, a);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    const counters = (st: GameState) => st.battlefield.reduce((n, id) => n + (st.objects[id]!.counters["+1/+1"] ?? 0), 0);
    expect(counters(s)).toBe(1);
    // An activated ability paid with a Treasure's mana.
    const p = putOnBattlefield(s, ap, pumper);
    const t2 = putOnBattlefield(s, ap, treasure);
    s = act(s, { type: "activateMana", player: ap, objectId: t2, mana: "B" });
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: p, index: 0 }));
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    // One paid with other mana: nothing.
    addMana(s, ap, ["B"], {});
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: p, index: 0 }));
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(counters(s)).toBe(2);
  });
});
