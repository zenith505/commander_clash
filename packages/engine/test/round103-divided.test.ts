// Round 103: Shatterskull Smashing ("X damage divided as you choose among up to two target creatures and/or
// planeswalkers. If X is 6 or more, ... twice X damage divided ... instead": twice X is what's divided as it's cast, each
// target at least 1, rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const smashing = scry("modal_dfc", [
  { name: "Shatterskull Smashing", mana_cost: "{X}{R}{R}", type_line: "Sorcery", oracle_text: "Shatterskull Smashing deals X damage divided as you choose among up to two target creatures and/or planeswalkers. If X is 6 or more, Shatterskull Smashing deals twice X damage divided as you choose among them instead." },
  { name: "Shatterskull, the Hammer Pass", type_line: "Land", oracle_text: "As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {R}." },
]);
const big = (name: string) => card(name, "Creature — Giant", "{4}{R}", { power: "10", toughness: "10" });

const obj = (id: string, amount?: number): TargetChoice => ({ kind: "object", id, ...(amount !== undefined ? { amount } : {}) });
const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 103: Shatterskull Smashing", () => {
  it("parse", () => expect(isFullySupported(smashing)).toBe(true));

  it("X below 6: X divided between two targets, at least 1 each", () => {
    const { s: s0, ap, ids, opp } = setup([smashing]);
    const a = putOnBattlefield(s0, opp, big("Giant A"));
    const b = putOnBattlefield(s0, opp, big("Giant B"));
    expect(planCast(s0, ap, ids[0]!, [obj(a, 3), obj(b, 1)], undefined, undefined, 3)).toBeNull(); // 4, not 3
    expect(planCast(s0, ap, ids[0]!, [obj(a, 3), obj(b, 0)], undefined, undefined, 3)).toBeNull(); // at least 1 each
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(a, 2), obj(b, 1)], undefined, undefined, 3)));
    expect(s.objects[a]!.damage).toBe(2);
    expect(s.objects[b]!.damage).toBe(1);
  });

  it("X of 6 or more: twice X is divided", () => {
    const { s: s0, ap, ids, opp } = setup([smashing]);
    const a = putOnBattlefield(s0, opp, big("Giant A"));
    const b = putOnBattlefield(s0, opp, big("Giant B"));
    expect(planCast(s0, ap, ids[0]!, [obj(a, 3), obj(b, 3)], undefined, undefined, 6)).toBeNull(); // 6, not 12
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(a, 8), obj(b, 4)], undefined, undefined, 6)));
    expect(s.objects[a]!.damage).toBe(8);
    expect(s.objects[b]!.damage).toBe(4);
  });

  it("one target gets it all", () => {
    const { s: s0, ap, ids, opp } = setup([smashing]);
    const a = putOnBattlefield(s0, opp, big("Giant A"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(a, 14), { kind: "none" }], undefined, undefined, 7)));
    expect(s.objects[a]!.zone).toBe("graveyard");
  });
});
