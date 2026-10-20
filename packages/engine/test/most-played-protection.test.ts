// "Protection from everything" for a player (CR 702.16j) and "your life total can't change" (CR 119.7-8), until your
// next turn: The One Ring and Teferi's Protection, from the most played Commander cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, gainLife, isFullySupported, loseLife, planActivate, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const teferisProtection = card("Teferi's Protection", "Instant", "{2}{W}", { oracleText: "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection." });
const oneRing = card("The One Ring", "Legendary Artifact", "{4}", { keywords: ["Indestructible"], oracleText: "Indestructible\nWhen The One Ring enters, if you cast it, you gain protection from everything until your next turn.\nAt the beginning of your upkeep, you lose 1 life for each burden counter on The One Ring.\n{T}: Put a burden counter on The One Ring, then draw a card for each burden counter on The One Ring." });
const blast = card("Test Blast", "Sorcery", "{0}", { oracleText: "Test Blast deals 2 damage to each player." });
const drain = card("Test Drain", "Sorcery", "{0}", { oracleText: "Each player loses 2 life." });
const ping = card("Test Ping", "Instant", "{0}", { oracleText: "Test Ping deals 1 damage to any target." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Everyone passes until the stack is empty or someone has a choice to make. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const mine = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid);

describe("protection from everything, and a life total that can't change", () => {
  it("parse", () => {
    for (const d of [teferisProtection, oneRing]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Teferi's Protection: permanents phase out, no damage, no targeting, no life change, until your next turn", () => {
    const { s: s0, ap, ids, opp } = setup([teferisProtection, blast, drain, ping]);
    const before = mine(s0, ap);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(mine(s, ap)).toEqual([]);
    expect(before.every((id) => s.objects[id]!.zone === "phasedOut")).toBe(true);
    expect(s.players[ap]!.gainedUntilNextTurn).toContain("Protection from everything");
    // Its own damage is prevented too (from everything); loss and gain don't change it.
    const oppLife = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[opp]!.life).toBe(oppLife - 2);
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(s.players[ap]!.life).toBe(life);
    gainLife(s, ap, 5);
    loseLife(s, ap, 5);
    expect(s.players[ap]!.life).toBe(life);
    // It can't be the target of spells, its own included (CR 702.16j).
    expect(planCast(s, ap, ids[3]!, [{ kind: "player", id: ap }])).toBeNull();
    expect(planCast(s, ap, ids[3]!, [{ kind: "player", id: opp }])).not.toBeNull();
    // Back at its next turn.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.players[ap]!.lifeCantChange).toBe(true);
    s = passUntil(s, "upkeep", ap);
    expect(before.every((id) => s.objects[id]!.zone === "battlefield")).toBe(true);
    expect(s.players[ap]!.lifeCantChange).toBeUndefined();
    expect(s.players[ap]!.gainedUntilNextTurn).toBeUndefined();
    loseLife(s, ap, 1);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("The One Ring: protection only if it was cast; burden counters draw more and cost life each upkeep", () => {
    const { s: s0, ap, ids } = setup([oneRing]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.gainedUntilNextTurn).toContain("Protection from everything");
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[ids[0]!]!.counters.burden).toBe(1);
    const life = s.players[ap]!.life;
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 3) % 4]!);
    s = passUntil(s, "draw", ap);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[ap]!.gainedUntilNextTurn).toBeUndefined();
    s = passUntil(s, "main1", ap);
    const hand2 = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand2 + 2);

    // Put onto the battlefield without being cast: no protection.
    const { s: t0, ap: bp } = setup([]);
    const ring = putOnBattlefield(t0, bp, oneRing);
    expect(t0.objects[ring]!.zone).toBe("battlefield");
    expect(t0.players[bp]!.gainedUntilNextTurn).toBeUndefined();
  });

  it("a bot keeps Teferi's Protection until lethal combat damage is coming at it", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = s0.players[opp]!;
    // The bot: Teferi's Protection and three Plains.
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, card("Plains", "Basic Land — Plains"));
    const tp = putOnBattlefield(s0, opp, teferisProtection);
    s0.battlefield.splice(s0.battlefield.indexOf(tp), 1);
    s0.objects[tp]!.zone = "hand";
    p.hand = [tp];
    p.life = 5;
    const attackers = [0, 1, 2].map(() => putOnBattlefield(s0, ap, bear()));
    let s = passUntil(s0, "declareAttackers", ap);
    // Holding it at the beginning of combat.
    expect(botActions(s, opp).some((a) => a.type === "castSpell")).toBe(false);
    s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((id) => ({ attacker: id, defender: opp })) });
    s = passUntil(s, "declareBlockers", ap);
    let cast = false;
    for (let i = 0; i < 40 && s.step === "declareBlockers"; i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (pid === opp) {
        const plan = botActions(s, opp);
        if (plan.some((a) => a.type === "castSpell")) cast = true;
        s = plan.reduce((x, a) => act(x, a), s);
      } else s = act(s, { type: "passPriority", player: pid });
    }
    expect(cast).toBe(true);
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(5);
  });

  it("a bot answers a board wipe with Teferi's Protection", () => {
    const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });
    const { s: s0, ap, ids, opp } = setup([wrath]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, card("Plains", "Basic Land — Plains"));
    const tp = putOnBattlefield(s0, opp, teferisProtection);
    s0.battlefield.splice(s0.battlefield.indexOf(tp), 1);
    s0.objects[tp]!.zone = "hand";
    s0.players[opp]!.hand = [tp];
    const bears = [0, 1, 2].map(() => putOnBattlefield(s0, opp, bear()));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, botActions(s, opp));
    s = settle(s);
    expect(bears.every((id) => s.objects[id]!.zone === "phasedOut")).toBe(true);
  });
});
