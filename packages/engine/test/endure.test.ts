// Endure N (CR 701.63): its controller puts N +1/+1 counters on the permanent, or creates an N/N white Spirit token
// instead, chosen as the ability resolves. If it's gone, just the token (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, parseManaCost, planCast, planMana, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};
const spirits = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Spirit Token");

// Real oracle text (Scryfall).
const kinGuard = card("Fortress Kin-Guard", "Creature — Dog Soldier", "{1}{W}", {
  power: "1",
  toughness: "2",
  keywords: ["Endure"],
  oracleText: "When this creature enters, it endures 1. (Put a +1/+1 counter on it or create a 1/1 white Spirit creature token.)",
});
const anafenza = card("Anafenza, Unyielding Lineage", "Legendary Creature — Spirit Soldier", "{2}{W}", {
  power: "2",
  toughness: "2",
  keywords: ["First strike", "Flash", "Endure"],
  oracleText: "Flash\nFirst strike\nWhenever another nontoken creature you control dies, Anafenza endures 2. (Put two +1/+1 counters on it or create a 2/2 white Spirit creature token.)",
});
const descendant = card("Descendant of Storms", "Creature — Human Soldier", "{W}", {
  power: "2",
  toughness: "1",
  keywords: ["Endure"],
  oracleText: "Whenever this creature attacks, you may pay {1}{W}. If you do, it endures 1. (Put a +1/+1 counter on it or create a 1/1 white Spirit creature token.)",
});
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });

describe("endure", () => {
  it("Fortress Kin-Guard: a +1/+1 counter on it, or a 1/1 Spirit token, as its controller chooses", () => {
    supported(kinGuard, anafenza, descendant);
    const { s: s0, ap, ids } = setup([kinGuard, kinGuard]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "endure", options: ["counters", "token"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "counters" }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(spirits(s, ap)).toHaveLength(0);
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "token" }));
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBeUndefined();
    const sp = spirits(s, ap);
    expect(sp).toHaveLength(1);
    expect(s.cards[s.objects[sp[0]!]!.cardId]).toMatchObject({ power: "1", toughness: "1", colors: ["W"], subtypes: ["Spirit"] });
  });

  it("Anafenza dying with another creature: she's gone, so it's a 2/2 Spirit, no choice (CR 603.10a)", () => {
    const { s: s0, ap, ids } = setup([wrath]);
    putOnBattlefield(s0, ap, anafenza);
    putOnBattlefield(s0, ap, bear());
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toBeNull();
    const sp = spirits(s, ap);
    expect(sp).toHaveLength(1);
    expect(s.cards[s.objects[sp[0]!]!.cardId]).toMatchObject({ power: "2", toughness: "2" });
  });

  it("Descendant of Storms endures only if you pay", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, descendant);
    let s = settle(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}{W}" } });
    for (const a of planMana(s, ap, parseManaCost("{1}{W}"))!) s = act(s, a);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "endure" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "counters" }));
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
  });
});
