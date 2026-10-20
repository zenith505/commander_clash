// Round 91, one-offs: Sword of Feast and Famine ("that player discards a card and you untap all lands you control"),
// Culling Ritual ("Add {B} or {G} for each permanent destroyed this way": either color for each one, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sword = card("Sword of Feast and Famine", "Artifact — Equipment", "{3}", { oracleText: "Equipped creature gets +2/+2 and has protection from black and from green.\nWhenever equipped creature deals combat damage to a player, that player discards a card and you untap all lands you control.\nEquip {2}" });
const ritual = card("Culling Ritual", "Sorcery", "{2}{B}{G}", { oracleText: "Destroy each nonland permanent with mana value 2 or less. Add {B} or {G} for each permanent destroyed this way." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacker: string, defender: PlayerId) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] }));

describe("round 91 one-offs", () => {
  it("parse", () => {
    for (const d of [sword, ritual]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Sword of Feast and Famine: the player discards, and your lands untap", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[putOnBattlefield(s0, ap, sword)]!.attachedTo = b;
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    for (const id of lands) s0.objects[id]!.tapped = true;
    const hand = s0.players[opp]!.hand.length;
    let s = attack(s0, ap, b, opp);
    s = settle(passUntil(s, "combatDamage"));
    for (let i = 0; i < 10 && s.pending; i++) s = settle(act(s, botActions(s, s.pending.player)[0]!));
    expect(s.players[opp]!.life).toBe(40 - 4);
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
    expect(lands.every((id) => !s.objects[id]!.tapped)).toBe(true);
  });

  it("Culling Ritual: destroys the cheap permanents and adds either color for each", () => {
    const { s: s0, ap, ids, opp } = setup([ritual]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    let s = cast(s0, ap, ids[0]!);
    const pend = s.pending;
    if (pend?.kind !== "chooseOption") throw new Error("no choice");
    expect(pend.labels).toEqual(["add {B}{B}{B}", "add {B}{B}{G}", "add {B}{G}{G}", "add {G}{G}{G}"]);
    s = act(s, { type: "chooseOption", player: ap, choice: pend.options[2]! });
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(s.players[ap]!.manaPool.G).toBe(2);
    expect(s.battlefield).toContain(big);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")).toEqual([]);
  });

  it("Culling Ritual with nothing destroyed adds nothing and asks nothing", () => {
    const { s: s0, ap, ids } = setup([ritual]);
    const s = cast(s0, ap, ids[0]!);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.players[ap]!.manaPool.B + s.players[ap]!.manaPool.G).toBe(0);
  });
});
