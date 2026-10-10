// Graft (CR 702.58) and moving counters (CR 122.5).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

const grafter = card("Graft Test", "Creature — Plant Mutant", "{1}{G}", { power: "0", toughness: "0", oracleText: "Graft 2 (This creature enters with two +1/+1 counters on it. Whenever another creature enters, you may move a +1/+1 counter from this creature onto it.)" });
const hardenedScales = card("Scales Test", "Enchantment", "{G}", { oracleText: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." });

describe("graft", () => {
  it("enters with counters and may move one onto another creature as it enters", () => {
    supported(grafter);
    const { s: s0, ap, ids } = setup([grafter, bear()]);
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
  });

  it("doesn't trigger once it has no counters, and a moved counter is 'put' (Hardened Scales adds one)", () => {
    const { s: s0, ap, ids } = setup([bear(), bear({ name: "Second Bear" })]);
    const g = putOnBattlefield(s0, ap, grafter);
    s0.objects[g]!.counters["+1/+1"] = 1;
    putOnBattlefield(s0, ap, hardenedScales);
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[g]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s));
    expect(s.pending).toBeNull();
  });
});

describe("state triggers", () => {
  it("'When you control no Islands, sacrifice ~' triggers once the last Island leaves (CR 603.8)", () => {
    const fish = card("Island Fish Test", "Creature — Fish", "{1}{U}", { power: "5", toughness: "8", oracleText: "When you control no Islands, sacrifice this creature." });
    supported(fish);
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fish);
    let s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.objects[f]!.zone).toBe("battlefield"); // setup gives us Islands
    for (const id of [...s.battlefield]) if (s.cards[s.objects[id]!.cardId]!.name === "Island") s.objects[id]!.zone = "graveyard";
    s.battlefield = s.battlefield.filter((id) => s.objects[id]!.zone === "battlefield");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[f]!.zone).toBe("graveyard");
  });
});
