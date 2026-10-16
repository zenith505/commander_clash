// Tellah, Great Sage: "Whenever you cast a noncreature spell, create a 1/1 colorless Hero creature token. If four or
// more mana was spent to cast that spell, draw two cards. If eight or more mana was spent to cast that spell, sacrifice
// Tellah and it deals that much damage to each opponent." "That much" is the mana spent to cast the spell (CR 601.2h);
// if Tellah has already left the battlefield, it still deals the damage (rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const tellah = card("Tellah, Great Sage", "Legendary Creature — Human Wizard", "{3}{U}{R}", { power: "3", toughness: "3", oracleText: "Whenever you cast a noncreature spell, create a 1/1 colorless Hero creature token. If four or more mana was spent to cast that spell, draw two cards. If eight or more mana was spent to cast that spell, sacrifice Tellah and it deals that much damage to each opponent." });
const spell = (n: number) => card(`Instant Test ${n}`, "Instant", `{${n - 1}}{U}`, { oracleText: "You gain 1 life." });

const heroes = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Hero")).length;
/** Resolve the trigger and the spell. */
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function castWith(s: GameState, pid: PlayerId, id: string, n: number): GameState {
  addMana(s, pid, ["U", ...Array<ManaType>(n - 1).fill("C")], {});
  return act(s, { type: "castSpell", player: pid, objectId: id });
}

describe("Tellah, Great Sage", () => {
  it("is supported", () => expect(isFullySupported(tellah)).toBe(true));

  it("a cheap spell makes a Hero; four mana also draws two", () => {
    let { s, ap, ids } = setup([spell(3), spell(4)]);
    putOnBattlefield(s, ap, tellah);
    const hand = s.players[ap]!.hand.length;
    s = settle(castWith(s, ap, ids[0]!, 3));
    expect(heroes(s, ap)).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = settle(castWith(s, ap, ids[1]!, 4));
    expect(heroes(s, ap)).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2);
  });

  it("nine mana: Tellah is sacrificed and deals 9 damage to each opponent", () => {
    let { s, ap, ids } = setup([spell(9)]);
    const t = putOnBattlefield(s, ap, tellah);
    const lives = s.turnOrder.map((p) => s.players[p]!.life);
    s = settle(castWith(s, ap, ids[0]!, 9));
    expect(s.objects[t]!.zone).toBe("graveyard");
    expect(heroes(s, ap)).toBe(1);
    s.turnOrder.forEach((p, i) => expect(s.players[p]!.life).toBe(p === ap ? lives[i]! + 1 : lives[i]! - 9));
  });

  it("it still deals the damage if it has left the battlefield", () => {
    let { s, ap, ids } = setup([spell(8)]);
    const t = putOnBattlefield(s, ap, tellah);
    const lives = s.turnOrder.map((p) => s.players[p]!.life);
    s = castWith(s, ap, ids[0]!, 8);
    // In response, Tellah leaves (bounced to its owner's hand).
    s.battlefield.splice(s.battlefield.indexOf(t), 1);
    s.objects[t]!.zone = "hand";
    s.players[ap]!.hand.push(t);
    s = settle(s);
    s.turnOrder.forEach((p, i) => p !== ap && expect(s.players[p]!.life).toBe(lives[i]! - 8));
  });
});
