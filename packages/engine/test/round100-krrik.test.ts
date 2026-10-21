// Round 100: K'rrik, Son of Yawgmoth: "For each {B} in a cost, you may pay 2 life rather than pay that mana." (rulings:
// any cost paid with mana, hybrid symbols with black paid as their {B} too; the cost itself doesn't change.)

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { blackForLife, waitingOn, isFullySupported, parseManaCost, payFromPool, planCast, emptyPool, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const krrik = card("K'rrik, Son of Yawgmoth", "Legendary Creature — Phyrexian Horror Minion", "{4}{B/P}{B/P}{B/P}", { power: "2", toughness: "2", keywords: ["Lifelink"], oracleText: "({B/P} can be paid with either {B} or 2 life.)\nLifelink\nFor each {B} in a cost, you may pay 2 life rather than pay that mana.\nWhenever you cast a black spell, put a +1/+1 counter on K'rrik." });
const raise = card("Raise the Dead", "Sorcery", "{B}{B}", { oracleText: "Return target creature card from your graveyard to your hand." });
const terminate = card("Rakdos Cackler", "Creature — Devil", "{1}{B/R}", { power: "2", toughness: "2" });

/** Take every land but `keep` Forests off `pid`'s battlefield. */
function onlyForests(s: GameState, pid: PlayerId, keep: number) {
  let left = keep;
  s.battlefield = s.battlefield.filter((id) => {
    const o = s.objects[id]!;
    if (o.controller !== pid || !s.cards[o.cardId]!.typeLine.includes("Land")) return true;
    if (s.cards[o.cardId]!.name === "Forest" && left > 0) {
      left--;
      return true;
    }
    o.zone = "exile";
    return false;
  });
}
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return s;
};

describe("round 100: K'rrik", () => {
  it("parse", () => expect(isFullySupported(krrik)).toBe(true));

  it("each {B}, and a hybrid symbol's black half, may be paid with 2 life", () => {
    const pool = emptyPool();
    expect(payFromPool(parseManaCost("{B}{B}"), pool, 0, 40)).toBeNull();
    expect(payFromPool(blackForLife(parseManaCost("{B}{B}")), pool, 0, 40)?.lifePaid).toBe(4);
    expect(payFromPool(blackForLife(parseManaCost("{B/R}")), pool, 0, 40)?.lifePaid).toBe(2);
    expect(payFromPool(blackForLife(parseManaCost("{2/B}")), { ...pool, G: 2 }, 0, 40)?.lifePaid).toBe(0);
    expect(payFromPool(blackForLife(parseManaCost("{2/B}")), pool, 0, 40)?.lifePaid).toBe(2);
    // Generic mana can't be paid with life.
    expect(payFromPool(blackForLife(parseManaCost("{1}{B}")), pool, 0, 40)).toBeNull();
  });

  it("with K'rrik, a black spell is cast with life when no black mana can be made, and K'rrik grows", () => {
    const { s: s0, ap, ids } = setup([raise, terminate]);
    const k = putOnBattlefield(s0, ap, krrik);
    s0.players[ap]!.graveyard.push(putOnBattlefield(s0, ap, bear()));
    const dead = s0.players[ap]!.graveyard[0]!;
    s0.battlefield.splice(s0.battlefield.indexOf(dead), 1);
    s0.objects[dead]!.zone = "graveyard";
    onlyForests(s0, ap, 1);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: dead }])));
    expect(s.players[ap]!.life).toBe(36);
    expect(s.players[ap]!.hand.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toContain("Grizzly Bears");
    expect(pt(s, k)).toBe("3/3");
    // Rakdos Cackler: {1} from the Forest, {B/R} as {B} with 2 life.
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.players[ap]!.life).toBe(34);
  });

  it("without K'rrik, it can't be cast that way", () => {
    const { s: s0, ap, ids } = setup([raise]);
    onlyForests(s0, ap, 3);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
  });

  it("black mana the player can make is spent first", () => {
    const { s: s0, ap, ids } = setup([terminate]);
    putOnBattlefield(s0, ap, krrik);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(40);
  });
});
