// "For each opponent, destroy up to one target artifact or enchantment that player controls": one "up to one" target
// for each opponent, controlled by that opponent (CR 601.2c, 115.6), chosen as it's cast or put on the stack, all
// done at once as it resolves. Opponents who left the game aren't opponents any more (CR 800.4a).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, chooseTargets, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, offerTargets, planCast, spellTargets, waitingOn, type Action, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const wave = card("Dismantling Wave", "Sorcery", "{2}{W}", {
  oracleText: "For each opponent, destroy up to one target artifact or enchantment that player controls.\nCycling {6}{W}{W} ({6}{W}{W}, Discard this card: Draw a card.)\nWhen you cycle this card, destroy all artifacts and enchantments.",
  keywords: ["Cycling"],
});
const mutiny = card("Mass Mutiny", "Sorcery", "{3}{R}{R}", { oracleText: "For each opponent, gain control of up to one target creature that player controls until end of turn. Untap those creatures. They gain haste until end of turn." });
const grasp = card("Grasp of Fate", "Enchantment", "{1}{W}{W}", { oracleText: "When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield. (Those permanents return under their owners' control.)" });
const hammers = card("Hammers of Moradin", "Creature — Dwarf Cleric", "{2}{W}", {
  power: "3",
  toughness: "3",
  oracleText: "Whenever this creature attacks, for each opponent, tap up to one target creature that player controls.",
});
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{2}, {T}, Sacrifice this artifact: Draw a card." });
const disenchant = card("Disenchant", "Instant", "{1}{W}", { oracleText: "Destroy target artifact or enchantment." });

const opponentsOf = (s: GameState, pid: PlayerId) => {
  const i = s.turnOrder.indexOf(pid);
  return [...s.turnOrder.slice(i + 1), ...s.turnOrder.slice(0, i)];
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("for each opponent, up to one target that player controls", () => {
  it("is supported", () => [wave, mutiny, grasp, hammers].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Dismantling Wave: one target for each opponent, each controlled by that opponent", () => {
    const { s: s0, ap, ids } = setup([wave]);
    const [b, c, d] = opponentsOf(s0, ap);
    const rb = putOnBattlefield(s0, b!, relic);
    const rb2 = putOnBattlefield(s0, b!, relic);
    const rd = putOnBattlefield(s0, d!, relic);
    const mine = putOnBattlefield(s0, ap, relic);
    // Printed, it's one entry; as it's cast, one per opponent in turn order (CR 601.2c).
    expect(compileCard(wave).spell!.targets).toHaveLength(1);
    const specs = offerTargets(s0, spellTargets(s0, ids[0]!), ap);
    expect(specs.map((t) => t.controlledBy)).toEqual([b, c, d]);
    expect(specs.every((t) => t.optional)).toBe(true);
    // Two of one opponent's artifacts, or one of ours, can't be chosen.
    expect(castProblem(s0, ap, ids[0]!, [target(rb), target(rb2), { kind: "none" }])).toBeTruthy();
    expect(castProblem(s0, ap, ids[0]!, [target(mine), { kind: "none" }, { kind: "none" }])).toBeTruthy();
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "none" }, { kind: "none" }, target(rb)])).toBeTruthy();
    // C has nothing: that one is left unchosen (rulings).
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(rb), { kind: "none" }, target(rd)])));
    expect(s.objects[rb]!.zone).toBe("graveyard");
    expect(s.objects[rd]!.zone).toBe("graveyard");
    expect(s.objects[rb2]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });

  it("a target that changed control to another opponent before it resolves is no longer legal (CR 608.2b)", () => {
    const { s: s0, ap, ids } = setup([wave]);
    const [b, c, d] = opponentsOf(s0, ap);
    const rb = putOnBattlefield(s0, b!, relic);
    const rd = putOnBattlefield(s0, d!, relic);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(rb), { kind: "none" }, target(rd)]));
    s.objects[rb]!.controller = c!;
    invalidateCharacteristics(s);
    s = passAll(s);
    expect(s.objects[rb]!.zone).toBe("battlefield");
    expect(s.objects[rd]!.zone).toBe("graveyard");
  });

  it("an opponent who lost isn't one: only the others get a target (CR 800.4a)", () => {
    const { s, ap, ids } = setup([wave]);
    const [b, c, d] = opponentsOf(s, ap);
    s.players[c!]!.lost = true;
    expect(offerTargets(s, spellTargets(s, ids[0]!), ap).map((t) => t.controlledBy)).toEqual([b, d]);
  });

  it("Mass Mutiny: gains control of the chosen creatures until end of turn, untaps them, and they gain haste", () => {
    const { s: s0, ap, ids } = setup([mutiny]);
    const [b, c, d] = opponentsOf(s0, ap);
    const xb = putOnBattlefield(s0, b!, bear({ name: "Bear B" }));
    const xc = putOnBattlefield(s0, c!, bear({ name: "Bear C" }));
    const xd = putOnBattlefield(s0, d!, bear({ name: "Bear D" }));
    s0.objects[xb]!.tapped = true;
    s0.objects[xc]!.tapped = true;
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(xb), target(xc), { kind: "none" }])));
    for (const id of [xb, xc]) {
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
      expect(s.objects[id]!.tapped).toBe(false);
    }
    expect(controllerOf(s, s.objects[xd]!)).toBe(d);
    expect(s.log.some((e) => /haste/.test(e.text))).toBe(true);
    // Until end of turn: they go back at the cleanup step.
    s = passUntil(s, "upkeep");
    expect(controllerOf(s, s.objects[xb]!)).toBe(b);
    expect(controllerOf(s, s.objects[xc]!)).toBe(c);
  });

  it("Grasp of Fate: its enters trigger asks for one target per opponent; they come back when it leaves", () => {
    const { s: s0, ap, ids } = setup([grasp, disenchant]);
    const [b, c, d] = opponentsOf(s0, ap);
    const rb = putOnBattlefield(s0, b!, relic);
    const xc = putOnBattlefield(s0, c!, bear({ name: "Bear C" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    if (s.pending?.kind !== "chooseTargets") throw new Error("no targets");
    expect(s.pending.specs.map((t) => t.controlledBy)).toEqual([b, c, d]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(rb), target(xc), { kind: "none" }] }));
    expect(s.objects[rb]!.zone).toBe("exile");
    expect(s.objects[xc]!.zone).toBe("exile");
    // Disenchant on Grasp of Fate: both come back under their owners' control.
    const graspId = ids[0]!;
    s = passAll(run(s, planCast(s, ap, ids[1]!, [target(graspId)])));
    expect(s.objects[graspId]!.zone).toBe("graveyard");
    expect(s.objects[rb]!.zone).toBe("battlefield");
    expect(s.objects[xc]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[rb]!)).toBe(b);
    expect(controllerOf(s, s.objects[xc]!)).toBe(c);
  });

  it("Hammers of Moradin: taps up to one creature of each opponent as it attacks", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = opponentsOf(s0, ap);
    const me = putOnBattlefield(s0, ap, hammers);
    const xb = putOnBattlefield(s0, b!, bear({ name: "Bear B" }));
    const xc = putOnBattlefield(s0, c!, bear({ name: "Bear C" }));
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: b! }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, botActions(s, waitingOn(s)!)[0] ?? { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(xb), target(xc), { kind: "none" }] }));
    expect(s.objects[xb]!.tapped).toBe(true);
    expect(s.objects[xc]!.tapped).toBe(true);
  });

  it("bots choose an opponent's creature for each opponent who has one", () => {
    const { s, ap, ids } = setup([mutiny]);
    const [b, , d] = opponentsOf(s, ap);
    const xb = putOnBattlefield(s, b!, bear({ name: "Bear B" }));
    const xd = putOnBattlefield(s, d!, bear({ name: "Bear D", power: "5", toughness: "5" }));
    putOnBattlefield(s, ap, bear({ name: "Our Bear" }));
    const body = compileCard(mutiny).spell!;
    const picked: TargetChoice[] | null = chooseTargets(s, ap, body, false, ids[0]);
    expect(picked).toEqual([target(xb), { kind: "none" }, target(xd)]);
  });
});
