// Counters with no rules of their own (charge, spore, oil, ...): put on, enters with, removed as a cost
// (CR 602.2b, 122.1), and counted ("for each charge counter on ~").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("named counters", () => {
  it("spore counters each upkeep, removed three at a time for a Saproling", () => {
    const thallid = card("Thallid Test", "Creature — Fungus", "{G}", {
      power: "1",
      toughness: "1",
      oracleText: "At the beginning of your upkeep, put a spore counter on this creature.\nRemove three spore counters from this creature: Create a 1/1 green Saproling creature token.",
    });
    supported(thallid);
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, thallid);
    expect(planActivate(s, ap, id, 0)).toBeNull(); // no counters to remove yet
    s.objects[id]!.counters.spore = 2;
    const t = settle(passUntil(passUntil(s, "end", ap), "main1", ap));
    expect(t.objects[id]!.counters.spore).toBe(3);
    const u = settle(planActivate(t, ap, id, 0)!.reduce((x, a) => act(x, a), t));
    expect(u.objects[id]!.counters.spore).toBe(0);
    expect(u.battlefield.filter((x) => u.cards[u.objects[x]!.cardId]!.name === "Saproling Token")).toHaveLength(1);
  });

  it("a land that enters tapped with charge counters and removes one for mana", () => {
    const land = card("Charge Land Test", "Land", "", { oracleText: "This land enters tapped with two charge counters on it.\n{T}: Add {C}.\n{T}, Remove a charge counter from this land: Add one mana of any color." });
    supported(land);
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, land);
    expect(s.objects[id]!.counters.charge ?? 0).toBe(0); // put onto the battlefield directly, not "entering" with them here
    s.objects[id]!.counters.charge = 1;
    let t = act(s, { type: "activateMana", player: ap, objectId: id, mana: "G" });
    expect(t.players[ap]!.manaPool.G).toBe(1);
    expect(t.objects[id]!.counters.charge).toBe(0);
    t.objects[id]!.tapped = false;
    expect(() => act(t, { type: "activateMana", player: ap, objectId: id, mana: "G" })).toThrow();
  });

  it("enters with charge counters, gets +1/+1 per oil counter, and counts them after it's sacrificed", () => {
    const vessel = card("Vessel Test", "Artifact", "{1}", { oracleText: "This artifact enters with three charge counters on it.\n{T}, Sacrifice this artifact: You gain life equal to the number of charge counters on this artifact." });
    const oily = card("Oily Test", "Artifact Creature — Construct", "{1}", { power: "1", toughness: "1", oracleText: "This creature gets +1/+1 for each oil counter on it." });
    supported(vessel, oily);
    const { s, ap, ids } = setup([vessel]);
    const o = putOnBattlefield(s, ap, oily);
    s.objects[o]!.counters.oil = 2;
    expect(pt(s, o)).toBe("3/3");
    let t = settle(planCast(s, ap, ids[0]!)!.reduce((x, a) => act(x, a), s));
    expect(t.objects[ids[0]!]!.counters.charge).toBe(3);
    const life = t.players[ap]!.life;
    t = settle(planActivate(t, ap, ids[0]!, 0)!.reduce((x, a) => act(x, a), t));
    expect(t.players[ap]!.life).toBe(life + 3);
  });

  it("'remove a +1/+1 counter' as a cost moves it to another creature", () => {
    const spike = card("Spike Test", "Creature — Spike", "{1}", { power: "0", toughness: "0", oracleText: "This creature enters with two +1/+1 counters on it.\n{2}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on target creature." });
    supported(spike);
    const { s, ap } = setup([]);
    const sp = putOnBattlefield(s, ap, spike);
    s.objects[sp]!.counters["+1/+1"] = 2;
    const other = putOnBattlefield(s, ap, card("Other Test", "Creature — Bear", "{1}", { power: "2", toughness: "2" }));
    const t = settle(planActivate(s, ap, sp, 0, [target(other)])!.reduce((x, a) => act(x, a), s));
    expect(t.objects[sp]!.counters["+1/+1"]).toBe(1);
    expect(t.objects[other]!.counters["+1/+1"]).toBe(1);
  });
});
