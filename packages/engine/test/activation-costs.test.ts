// Activated abilities with sacrifice and discard costs: "Sacrifice a creature: ...", "Sacrifice another
// creature: ...", "{1}, Discard a card: ...". Costs are paid as the ability is activated (CR 602.2b, 601.2h),
// and "the sacrificed creature" is that creature as it last existed (CR 608.2h).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, botActions, characteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const power = (s: GameState, id: string) => characteristics(s, s.objects[id]!).power;

const bombard = card("Bombard Test", "Enchantment", "{2}{R}", { oracleText: "Sacrifice a creature: This enchantment deals 1 damage to any target." });
const vampire = card("Vampire Test", "Creature — Vampire", "{1}{B}", { power: "1", toughness: "1", oracleText: "Sacrifice another creature: This creature gets +2/+2 until end of turn." });
const looter = card("Looter Test", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1", oracleText: "{1}, Discard a card: Draw a card." });
const altar = card("Altar Test", "Artifact", "{3}", { oracleText: "Sacrifice a creature: You gain life equal to the sacrificed creature's toughness." });

describe("sacrifice and discard costs on activated abilities", () => {
  it("sacrifices the chosen creature as the cost, then deals damage", () => {
    supported(bombard, vampire, looter, altar);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bombard);
    const fodder = putOnBattlefield(s0, ap, bear());
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: b, index: 0, targets: [{ kind: "player", id: opp }] })).toThrow(/choose what/);
    const life = s0.players[opp]!.life;
    let s = act(s0, { type: "activateAbility", player: ap, objectId: b, index: 0, targets: [{ kind: "player", id: opp }], costs: { sacrifice: [fodder] } });
    // The cost is paid before anyone can respond (CR 602.2b).
    expect(zone(s, fodder)).toBe("graveyard");
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("can't sacrifice the ability's source to 'sacrifice another creature'", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vampire);
    expect(abilityProblem(s0, ap, v, 0)).toMatch(/sacrifice another creature/);
    expect(abilityProblem(s0, ap, v, 0, undefined, undefined, undefined, undefined, { sacrifice: [v] })).toMatch(/choose another creature/);
    const fodder = putOnBattlefield(s0, ap, bear());
    const s = run(s0, planActivate(s0, ap, v, 0, undefined, undefined, undefined, undefined, { sacrifice: [fodder] }));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(power(s, v)).toBe(3);
  });

  it("discards a card and pays mana, then draws", () => {
    const { s: s0, ap, ids } = setup([bear(), bear()]);
    const l = putOnBattlefield(s0, ap, looter);
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planActivate(s0, ap, l, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("uses the sacrificed creature as it last existed (CR 608.2h)", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, altar);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Test", toughness: "5" }));
    const life = s0.players[ap]!.life;
    const s = run(s0, planActivate(s0, ap, a, 0, undefined, undefined, undefined, undefined, { sacrifice: [big] }));
    expect(s.players[ap]!.life).toBe(life + 5);
  });

  it("bots only sacrifice cheap tokens and keep real creatures", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bombard);
    const keep = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.isBot = true;
    const acts = botActions(s0, ap);
    const sac = acts.find((a) => a.type === "activateAbility" && a.costs?.sacrifice?.includes(keep));
    expect(sac).toBeUndefined();
  });
});
