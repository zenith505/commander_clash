// Sneak (CR 702.190), backup granting static abilities (CR 702.165a), partner—[text] (CR 702.124i).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, commanderPairProblem, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const blocks = (s: GameState, b: { blocker: string; attacker: string }[] = []) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: b.filter((x) => s.objects[x.blocker]!.controller === pid) });
  }
  return settle(s);
};

// Real oracle text (Scryfall).
const leoLeader = card("Leonardo, Leader in Blue", "Legendary Creature — Mutant Ninja Turtle", "{W}", { power: "1", toughness: "1", keywords: ["Sneak"], oracleText: "Sneak {3}{W}{W} (You may cast this spell for {3}{W}{W} if you also return an unblocked attacker you control to hand during the declare blockers step. He enters tapped and attacking.)\nWhen Leonardo enters, if his sneak cost was paid, creatures you control get +2/+0 until end of turn.\n{1}{W}: Leonardo gains first strike until end of turn." });
const splinter = card("Splinter, Hamato Yoshi", "Legendary Creature — Mutant Ninja Rat", "{1}{B}", { power: "2", toughness: "2", keywords: ["Sneak", "Menace"], oracleText: "Sneak {B} (You may cast this spell for {B} if you also return an unblocked attacker you control to hand during the declare blockers step. He enters tapped and attacking.)\nMenace (This creature can't be blocked except by two or more creatures.)\nOther Ninjas you control get +1/+1." });
const donatellosTechnique = card("Donatello's Technique", "Sorcery", "{2}{U}", { keywords: ["Sneak"], oracleText: "Sneak {U} (You may cast this spell for {U} if you also return an unblocked attacker you control to hand during the declare blockers step.)\nDraw two cards." });
const fallback = card("Foot Ninjas", "Creature — Human Ninja", "{4}{W/B}{W/B}", { power: "3", toughness: "3", keywords: ["Sneak"], oracleText: "Sneak {3}{W/B} (You may cast this spell for {3}{W/B} if you also return an unblocked attacker you control to hand during the declare blockers step. It enters tapped and attacking.)\nWhen this creature enters, you gain 3 life." });
const chompingKavu = card("Chomping Kavu", "Creature — Kavu", "{3}{G}", { power: "3", toughness: "3", keywords: ["Backup"], oracleText: "Backup 1 (When this creature enters, put a +1/+1 counter on target creature. If that's another creature, it gains the following ability until end of turn.)\nThis creature can't be blocked by creatures with power 2 or less." });
const streetwise = card("Streetwise Negotiator", "Creature — Cat Citizen", "{1}{G}", { power: "0", toughness: "3", keywords: ["Backup"], oracleText: "Backup 1 (When this creature enters, put a +1/+1 counter on target creature. If that's another creature, it gains the following ability until end of turn.)\nThis creature assigns combat damage equal to its toughness rather than its power." });
const elmar = card("Elmar, Ulvenwald Informant", "Legendary Creature — Human", "{1}{R}{G}", { power: "3", toughness: "2", keywords: ["Haste", "Partner", "Investigate"], oracleText: "Haste\nWhenever you cast your second spell each turn, untap target creature, then investigate. (Create a colorless Clue artifact token with \"{2}, Sacrifice this artifact: Draw a card.\")\nPartner—Friends forever (You can have two commanders if both have this ability.)" });
const hargilde = card("Hargilde, Kindly Runechanter", "Legendary Creature — Human", "{2}{W}{U}", { power: "2", toughness: "4", keywords: ["Partner"], oracleText: "{T}: Add {C}{C}. Spend this mana only to cast artifact spells or activate abilities of artifacts.\nPartner—Friends forever (You can have two commanders if both have this ability.)" });
const april = card("April O'Neil, Live on the Scene", "Legendary Creature — Human", "{W}", { power: "1", toughness: "1", keywords: ["Partner"], oracleText: "Partner—Character select (You can have two commanders if both have this ability.)" });

describe("sneak", () => {
  it("only in your declare blockers step, after blocks; returns an unblocked attacker and enters tapped and attacking its player", () => {
    supported(leoLeader, splinter, donatellosTechnique, fallback);
    const { s: s0, ap, opp, ids } = setup([splinter]);
    const b = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "sneak" })).toMatch(/declare blockers/);
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "sneak" })).toMatch(/declare blockers/);
    s = blocks(s);
    expect(s.step).toBe("declareBlockers");
    const plan = planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "sneak", returnToHand: [b] })!;
    expect(plan).toBeTruthy();
    // {B} instead of {1}{B}.
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(1);
    s = plan.reduce((x, a) => act(x, a), s);
    expect(s.objects[b]!.zone).toBe("hand");
    s = settle(s);
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(o.attacking).toBe(opp);
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("a sorcery with sneak is cast at instant speed then; a blocked attacker can't pay", () => {
    const { s: s0, ap, opp, ids } = setup([donatellosTechnique]);
    const b = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Blocked Bear" }));
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Blocker" }));
    let s = blocks(attack(s0, ap, [{ attacker: b, defender: opp }, { attacker: b2, defender: opp }]), [{ blocker, attacker: b2 }]);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "sneak", returnToHand: [b2] })).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "sneak", returnToHand: [b] })!.reduce((x, a) => act(x, a), s));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // The bear came back to hand, the Technique left it, and two cards were drawn.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1 + 2);
  });

  it("'if his sneak cost was paid' triggers only then", () => {
    const { s: s0, ap, opp, ids } = setup([leoLeader]);
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = blocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    s = settle(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "sneak", returnToHand: [b] })!.reduce((x, a) => act(x, a), s));
    expect(pt(s, other)).toBe("4/2");
    expect(pt(s, ids[0]!)).toBe("3/1");
    // Cast normally, it doesn't.
    const { s: t0, ap: ap2, ids: ids2 } = setup([leoLeader]);
    const o2 = putOnBattlefield(t0, ap2, bear());
    const t = settle(planCast(t0, ap2, ids2[0]!)!.reduce((x, a) => act(x, a), t0));
    expect(pt(t, o2)).toBe("2/2");
  });

  it("bots sneak a better creature in for a token or a smaller attacker", () => {
    const { s: s0, ap, opp } = setup([fallback]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = blocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.alt === "sneak")).toBe(true);
    s = settle(acts.reduce((x, a) => act(x, a), s));
    expect(s.objects[b]!.zone).toBe("hand");
  });
});

describe("backup granting a static ability", () => {
  it("'can't be blocked by creatures with power 2 or less' and 'assigns combat damage equal to its toughness' until end of turn", () => {
    supported(chompingKavu, streetwise);
    const { s: s0, ap, opp, ids } = setup([chompingKavu, streetwise]);
    const wall = putOnBattlefield(s0, ap, card("Wall Test", "Creature — Wall", "{1}", { power: "0", toughness: "4" }));
    let s = settle(planCast(s0, ap, ids[1]!, [target(wall)])!.reduce((x, a) => act(x, a), s0));
    for (let i = 0; i < 5 && s.pending?.kind === "chooseTargets"; i++) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(wall)] }));
    expect(pt(s, wall)).toBe("1/5");
    s = settle(planCast(s, ap, ids[0]!)!.reduce((x, a) => act(x, a), s));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(wall)] }));
    expect(pt(s, wall)).toBe("2/6");
    const small = putOnBattlefield(s, opp, bear({ name: "Small Bear" }));
    s.objects[wall]!.controlledSinceTurn = -1;
    const life = s.players[opp]!.life;
    s = attack(s, ap, [{ attacker: wall, defender: opp }]);
    expect(() => blocks(s, [{ blocker: small, attacker: wall }])).toThrow();
    s = settle(passUntil(blocks(s), "main2", ap));
    expect(s.players[opp]!.life).toBe(life - 6); // its toughness
  });
});

describe("partner—[text]", () => {
  it("two commanders with the same partner—[text] ability, not different ones", () => {
    supported(elmar, hargilde, april);
    expect(commanderPairProblem(elmar, hargilde)).toBeNull();
    expect(commanderPairProblem(elmar, april)).not.toBeNull();
  });
});
