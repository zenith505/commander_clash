// "Put a creature card from your hand onto the battlefield tapped and attacking" (CR 508.4): it was never declared as an
// attacker, and its controller chooses which player or planeswalker it attacks, not necessarily the one the source
// attacks (rulings on Kinscaer Sentry). X is counted as the ability resolves (Kinscaer Sentry, Paladin Elizabeth Taggerdy).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
/** Passes priority until something needs an answer or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const sentry = card("Kinscaer Sentry", "Creature — Kithkin Soldier", "{1}{W}", { power: "2", toughness: "2", keywords: ["Lifelink", "First strike"], oracleText: "First strike, lifelink\nWhenever this creature attacks, you may put a creature card with mana value X or less from your hand onto the battlefield tapped and attacking, where X is the number of attacking creatures you control." });
const captain = card("Preeminent Captain", "Creature — Kithkin Soldier", "{2}{W}", { power: "2", toughness: "2", keywords: ["First strike"], oracleText: "First strike (This creature deals combat damage before creatures without first strike.)\nWhenever this creature attacks, you may put a Soldier creature card from your hand onto the battlefield tapped and attacking." });
const paladin = card("Paladin Elizabeth Taggerdy", "Legendary Creature — Human Knight", "{1}{R}{W}", { power: "3", toughness: "2", keywords: ["Battalion"], oracleText: "Battalion — Whenever Paladin Elizabeth Taggerdy and at least two other creatures attack, draw a card, then you may put a creature card with mana value X or less from your hand onto the battlefield tapped and attacking, where X is Paladin Elizabeth Taggerdy's power." });
const troll = card("Test Troll", "Creature — Troll", "{2}{G}{G}", { power: "4", toughness: "4" });
const soldier = card("Test Soldier", "Creature — Human Soldier", "{5}{W}", { power: "5", toughness: "5" });
const watcher = card("Test Watcher", "Creature — Human", "{1}{W}", { power: "1", toughness: "1", oracleText: "Whenever a creature you control attacks, you gain 1 life." });

describe("put onto the battlefield from your hand tapped and attacking", () => {
  it("parse", () => supported(sentry, captain, paladin, watcher));

  it("Kinscaer Sentry: X is the attacking creatures you control; you choose whom it attacks; it wasn't declared (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, sentry);
    const other = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, watcher);
    s0.players[ap]!.hand = [];
    const b = toHand(s0, ap, bear());
    const t = toHand(s0, ap, troll);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const life0 = s0.players[ap]!.life;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }, { attacker: other, defender: opp }] });
    s = untilChoice(s);
    // Two attack triggers from Test Watcher already: the Sentry's lets you pick among cards with mana value 2 or less.
    while (s.pending?.kind !== "searchLibrary") s = untilChoice(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.pending.cards).toEqual([b]);
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [t] })).toThrow();
    s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.options[0]).toBe(String(opp)); // the player the Sentry attacks, first
    s = untilChoice(act(s, { type: "chooseOption", player: ap, choice: String(third) }));
    expect(s.objects[b]!).toMatchObject({ zone: "battlefield", tapped: true, attacking: third });
    expect(s.players[ap]!.life).toBe(life0 + 2); // only the two declared attackers triggered Test Watcher
    const lifeThird = s.players[third]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[third]!.life).toBe(lifeThird - 2);
  });

  it("Preeminent Captain: a Soldier card, any mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, captain);
    const sol = toHand(s0, ap, soldier);
    toHand(s0, ap, troll);
    let s = untilChoice(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [sol] });
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [sol] }));
    s = untilChoice(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    expect(s.objects[sol]!).toMatchObject({ zone: "battlefield", tapped: true, attacking: opp });
  });

  it("Paladin Elizabeth Taggerdy: X is its power as the ability resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const pal = putOnBattlefield(s0, ap, paladin);
    const a = putOnBattlefield(s0, ap, bear()), b = putOnBattlefield(s0, ap, bear());
    const t = toHand(s0, ap, troll);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [pal, a, b].map((attacker) => ({ attacker, defender: opp })) });
    s.objects[pal]!.counters["+1/+1"] = 1; // 4 power as it resolves
    s = untilChoice(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no choice");
    expect(s.pending.cards).toContain(t);
  });

  it("the bot puts it attacking the player the source attacks", async () => {
    const { botActions } = await import("../src/bot");
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, captain);
    const sol = toHand(s0, ap, soldier);
    let s = untilChoice(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] }));
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [sol] }));
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[sol]!.attacking).toBe(opp);
  });
});
