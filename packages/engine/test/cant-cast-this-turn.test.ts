// "Can't cast spells this turn" (CR 101.2: a "can't" wins): Silence's opponents, Orim's Chant's target player, Render
// Silent's countered spell's controller, Xantid Swarm's defending player, Calamity's Wake's "players can't cast
// noncreature spells", Aurelia's Fury's "players dealt damage this way". Spells cast before it resolved aren't affected
// (rulings), abilities and lands are, and a player who can't cast a card can't suspend it (rulings on Silence).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, mountain, plainsCard, island } from "./helpers";
import { castProblem, invalidateCharacteristics, isFullySupported, planCast, potentialAttackers, suspendProblem, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const silence = card("Silence", "Instant", "{W}", { oracleText: "Your opponents can't cast spells this turn." });
const chant = card("Orim's Chant", "Instant", "{W}", { oracleText: "Kicker {W} (You may pay an additional {W} as you cast this spell.)\nTarget player can't cast spells this turn. If this spell was kicked, creatures can't attack this turn." });
const swarm = card("Xantid Swarm", "Creature — Insect", "{G}", { power: "0", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, defending player can't cast spells this turn." });
const ranger = card("Ranger-Captain of Eos", "Creature — Human Soldier", "{1}{W}{W}", { power: "3", toughness: "3", oracleText: "When this creature enters, you may search your library for a creature card with mana value 1 or less, reveal it, put it into your hand, then shuffle.\nSacrifice this creature: Your opponents can't cast noncreature spells this turn." });
const render = card("Render Silent", "Instant", "{W}{U}{U}", { oracleText: "Counter target spell. Its controller can't cast spells this turn." });
const denied = card("Permission Denied", "Instant", "{W}{U}", { oracleText: "Counter target noncreature spell. Your opponents can't cast noncreature spells this turn." });
const wake = card("Calamity's Wake", "Instant", "{1}{W}", { oracleText: "Exile all graveyards. Players can't cast noncreature spells this turn. Exile Calamity's Wake." });
const fury = card("Aurelia's Fury", "Instant", "{X}{R}{W}", { oracleText: "Aurelia's Fury deals X damage divided as you choose among any number of targets. Tap each creature dealt damage this way. Players dealt damage this way can't cast noncreature spells this turn." });

const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card." });
const ancestral = card("Ancestral Vision", "Sorcery", "", { colors: ["U"], oracleText: "Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards." });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const untilPriority = (s: GameState, pid: PlayerId) => {
  while (waitingOn(s) !== pid) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const lands = (s: GameState, pid: PlayerId) => [mountain, mountain, island, island, plainsCard].forEach((l) => putOnBattlefield(s, pid, l));
const cantCast = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => castProblem(s, pid, id, targets) ?? "";

describe("can't cast spells this turn", () => {
  it("is supported", () => [silence, chant, swarm, ranger, render, denied, wake, fury].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Silence: opponents can't cast spells; you still can, and it ends with the turn", () => {
    const { s: s0, ap, ids, opp } = setup([silence, opt]);
    lands(s0, opp);
    const theirBolt = toHand(s0, opp, bolt);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.log.some((e) => /can't cast spells this turn/.test(e.text))).toBe(true);
    s = untilPriority(s, opp);
    expect(cantCast(s, opp, theirBolt, [player(ap)])).toMatch(/Silence: you can't cast spells this turn/);
    expect(planCast(s, opp, theirBolt, [player(ap)])).toBeNull();
    s = untilPriority(s, ap);
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
    // Next turn it's over.
    for (let i = 0; i < 400 && s.turn === s0.turn; i++) {
      const p = waitingOn(s)!;
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p, attacks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p, objectIds: s.players[p]!.hand.slice(0, s.pending.count) });
      else s = act(s, { type: "passPriority", player: p });
    }
    expect(s.cantCastThisTurn).toBeUndefined();
  });

  it("Silence doesn't touch a spell already on the stack", () => {
    const { s: s0, ap, ids, opp } = setup([silence]);
    lands(s0, opp);
    const theirBolt = toHand(s0, opp, bolt);
    let s = untilPriority(s0, opp);
    s = run(s, planCast(s, opp, theirBolt, [player(ap)]));
    s = untilPriority(s, ap);
    const life = s.players[ap]!.life;
    s = passAll(run(s, planCast(s, ap, ids[0]!)));
    s = passAll(s);
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("Orim's Chant: the target player only; kicked, creatures can't attack this turn", () => {
    const { s: s0, ap, ids, opp } = setup([chant]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    lands(s0, opp);
    lands(s0, other);
    const [b1, b2] = [toHand(s0, opp, bolt), toHand(s0, other, bolt)];
    const attacker = putOnBattlefield(s0, ap, bear());
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, "auto", undefined, { kicks: [0] })));
    expect(cantCast(s, opp, b1, [player(ap)])).toMatch(/can't cast spells/);
    expect(cantCast(s, other, b2, [player(ap)])).not.toMatch(/can't cast spells/);
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(attacker);
    // Unkicked, at yourself: your creatures can attack, but you can't suspend a card (rulings).
    const { s: t0, ap: ap2, ids: ids2 } = setup([chant, ancestral]);
    const a2 = putOnBattlefield(t0, ap2, bear());
    expect(suspendProblem(t0, ap2, ids2[1]!)).toMatch(/not enough mana/); // it checks the rest first
    const t = passAll(run(t0, planCast(t0, ap2, ids2[0]!, [player(ap2)])));
    expect(potentialAttackers(t, ap2).map((o) => o.id)).toContain(a2);
    expect(suspendProblem(t, ap2, ids2[1]!)).toMatch(/can't cast spells/);
  });

  it("Render Silent: the countered spell's controller can't cast spells; Permission Denied: noncreature spells only", () => {
    const { s: s0, ap, ids, opp } = setup([render, denied]);
    lands(s0, opp);
    const b1 = toHand(s0, opp, bolt);
    let s = untilPriority(s0, opp);
    s = run(s, planCast(s, opp, b1, [player(ap)]));
    s = untilPriority(s, ap);
    s = passAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack.at(-1)!.id }])));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.cantCastThisTurn).toMatchObject([{ player: opp }]);
    // Permission Denied leaves creature spells alone.
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([denied, opt]);
    lands(t0, opp2);
    const [tb, tbear] = [toHand(t0, opp2, bolt), toHand(t0, opp2, bear({ keywords: ["Flash"], oracleText: "Flash" }))];
    let t = run(t0, planCast(t0, ap2, ids2[1]!));
    t = passAll(run(t, planCast(t, ap2, ids2[0]!, [{ kind: "stack", id: t.stack.at(-1)!.id }])));
    t = untilPriority(t, opp2);
    expect(cantCast(t, opp2, tb, [player(ap2)])).toMatch(/can't cast noncreature spells/);
    expect(cantCast(t, opp2, tbear)).not.toMatch(/can't cast/);
  });

  it("Calamity's Wake: everyone, noncreature spells, and it exiles itself", () => {
    const { s: s0, ap, ids } = setup([wake, opt]);
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(cantCast(s, ap, ids[1]!)).toMatch(/can't cast noncreature spells/);
  });

  it("Ranger-Captain of Eos: sacrificed, opponents can't cast noncreature spells", () => {
    const { s: s0, ap, opp } = setup([]);
    const rc = putOnBattlefield(s0, ap, ranger);
    lands(s0, opp);
    const b = toHand(s0, opp, bolt);
    let t = act(s0, { type: "activateAbility", player: ap, objectId: rc, index: 0, targets: [] });
    t = passAll(t);
    expect(t.objects[rc]!.zone).toBe("graveyard");
    t = untilPriority(t, opp);
    expect(cantCast(t, opp, b, [player(ap)])).toMatch(/Ranger-Captain of Eos: you can't cast noncreature spells/);
  });

  it("Xantid Swarm: only the player it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const swarmId = putOnBattlefield(s0, ap, swarm);
    lands(s0, opp);
    const b = toHand(s0, opp, bolt);
    let s = s0;
    while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: swarmId, defender: opp }] });
    s = passAll(s);
    expect(s.cantCastThisTurn).toMatchObject([{ player: opp }]);
    s = untilPriority(s, opp);
    expect(cantCast(s, opp, b, [player(ap)])).toMatch(/can't cast spells/);
  });
});

describe("Aurelia's Fury", () => {
  it("taps each creature dealt damage, and players dealt damage can't cast noncreature spells", () => {
    const { s: s0, ap, ids, opp } = setup([fury]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const big = putOnBattlefield(s0, opp, bear({ name: "Big", toughness: "5" }));
    const untouched = putOnBattlefield(s0, opp, bear({ name: "Untouched" }));
    lands(s0, opp);
    lands(s0, other);
    const [b1, b2] = [toHand(s0, opp, bolt), toHand(s0, other, bolt)];
    const targets: TargetChoice[] = [{ kind: "object", id: big, amount: 2 }, { kind: "player", id: opp, amount: 1 }];
    const plan = planCast(s0, ap, ids[0]!, targets, undefined, "auto", 3);
    expect(plan).not.toBeNull();
    let s = passAll(run(s0, plan));
    expect(s.objects[big]!.tapped).toBe(true);
    expect(s.objects[big]!.damage).toBe(2);
    expect(s.objects[untouched]!.tapped).toBe(false);
    s = untilPriority(s, opp);
    expect(cantCast(s, opp, b1, [player(ap)])).toMatch(/Aurelia's Fury: you can't cast noncreature spells/);
    expect(cantCast(s, other, b2, [player(ap)])).not.toMatch(/can't cast/);
  });
});
