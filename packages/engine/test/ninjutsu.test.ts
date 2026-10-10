// Ninjutsu (CR 702.49), mobilize (702.181), tokens that enter tapped and attacking (CR 508.4).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, isFullySupported, legalTargets, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
/** Every defending player declares these blocks (or none), then the active player has priority. */
const blocks = (s: GameState, b: { blocker: string; attacker: string }[] = []) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: b.filter((x) => s.objects[x.blocker]!.controller === pid) });
  }
  return settle(s);
};
const named = (s: GameState, name: string) => s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === name);

const ninja = card("Ninja Test", "Creature — Human Ninja", "{2}{U}", {
  power: "3",
  toughness: "2",
  oracleText: "Ninjutsu {U} ({U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, draw a card.",
});
const mobilizer = card("Mobilize Test", "Creature — Human Warrior", "{1}{R}", { power: "2", toughness: "1", oracleText: "Mobilize 2 (Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)" });

describe("ninjutsu", () => {
  it("swaps an unblocked attacker for the ninja, attacking the same player, after blockers", () => {
    supported(ninja);
    const { s: s0, ap, opp, ids } = setup([ninja]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(abilityProblem(s, ap, ids[0]!, 0)).toMatch(/unblocked attacker/); // not before blockers are declared
    s = blocks(s);
    expect(s.step).toBe("declareBlockers");
    const plan = planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { returnToHand: [b] })!;
    expect(plan).toBeTruthy();
    s = settle(plan.reduce((x, a) => act(x, a), s));
    expect(s.objects[b]!.zone).toBe("hand");
    const n = s.objects[ids[0]!]!;
    expect(n.zone).toBe("battlefield");
    expect(n.tapped).toBe(true);
    expect(n.attacking).toBe(opp);
    const life = s.players[opp]!.life;
    const hand = s.players[ap]!.hand.length;
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 1); // its combat damage trigger
  });

  it("can't return a blocked attacker", () => {
    const { s: s0, ap, opp, ids } = setup([ninja]);
    const b = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Blocker Bear" }));
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    s = blocks(s, [{ blocker, attacker: b }]);
    expect(abilityProblem(s, ap, ids[0]!, 0)).toMatch(/unblocked attacker/);
    expect(planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { returnToHand: [b] })).toBeNull();
  });
});

describe("'target creature that player controls'", () => {
  it("in a combat damage trigger, only the damaged player's creatures can be targeted", () => {
    const k = card("Shinobi Test", "Creature — Human Ninja", "{2}{U}", { power: "1", toughness: "1", oracleText: "Whenever this creature deals combat damage to a player, you may return target creature that player controls to its owner's hand." });
    supported(k);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, k);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const other = putOnBattlefield(s0, third, bear({ name: "Other Bear" }));
    s0.objects[theirs]!.tapped = true; // so it doesn't block
    let s = blocks(attack(s0, ap, [{ attacker: a, defender: opp }]));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    const specs = s.pending?.kind === "chooseTargets" ? s.pending.specs : [];
    const ids = legalTargets(s, specs[0]!, ap).map((t) => (t.kind === "object" ? t.id : ""));
    expect(ids).toContain(theirs);
    expect(ids).not.toContain(other);
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: other }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] }));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[theirs]!.zone).toBe("hand");
  });
});

describe("mobilize and attacking tokens", () => {
  it("mobilize 2: two tapped attacking Warriors, sacrificed at the next end step", () => {
    supported(mobilizer);
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mobilizer);
    const life = s0.players[opp]!.life;
    let s = attack(s0, ap, [{ attacker: m, defender: opp }]);
    const warriors = named(s, "Warrior Token");
    expect(warriors).toHaveLength(2);
    for (const w of warriors) {
      expect(s.objects[w]!.tapped).toBe(true);
      expect(s.objects[w]!.attacking).toBe(opp);
    }
    s = settle(passUntil(blocks(s), "main2", ap));
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(named(s, "Warrior Token")).toHaveLength(2);
    s = settle(passUntil(s, "end", ap));
    expect(named(s, "Warrior Token")).toHaveLength(0);
  });

  it("tokens 'tapped and attacking' made outside combat just enter tapped", () => {
    const spell = card("Attack Tokens Test", "Sorcery", "{1}", { oracleText: "Create two 1/1 red and white Soldier creature tokens with haste that are tapped and attacking." });
    supported(spell);
    const { s: s0, ap, ids } = setup([spell]);
    const s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    const soldiers = named(s, "Soldier Token");
    expect(soldiers).toHaveLength(2);
    for (const t of soldiers) {
      expect(s.objects[t]!.tapped).toBe(true);
      expect(s.objects[t]!.attacking).toBeUndefined();
    }
  });
});
