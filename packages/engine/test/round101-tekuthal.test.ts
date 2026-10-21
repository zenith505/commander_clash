// Round 101: Tekuthal, Inquiry Dominus ("If you would proliferate, proliferate twice instead", CR 614.1a), "Whenever you
// proliferate" (Ezuri, Stalker of Spheres), and "Remove N counters from among ... you control" costs (CR 602.2b): Tekuthal,
// Tayam, Hopeful Initiate, Novijen Sages.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const tekuthal = card("Tekuthal, Inquiry Dominus", "Legendary Creature — Phyrexian Horror", "{2}{U}{U}", { power: "3", toughness: "5", keywords: ["Flying", "Proliferate"], oracleText: "Flying\nIf you would proliferate, proliferate twice instead.\n{1}{U/P}{U/P}, Remove three counters from among other artifacts, creatures, and planeswalkers you control: Put an indestructible counter on Tekuthal. ({U/P} can be paid with either {U} or 2 life.)" });
const progress = card("Steady Progress", "Instant", "{2}{U}", { keywords: ["Proliferate"], oracleText: "Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)\nDraw a card." });
const ezuri = card("Ezuri, Stalker of Spheres", "Legendary Creature — Phyrexian Elf Warrior", "{2}{G}{U}", { power: "3", toughness: "3", keywords: ["Proliferate"], oracleText: "When Ezuri enters, you may pay {3}. If you do, proliferate twice.\nWhenever you proliferate, draw a card." });
const tayam = card("Tayam, Luminous Enigma", "Legendary Creature — Nightmare Beast", "{1}{W}{B}{G}", { power: "3", toughness: "3", oracleText: "Each other creature you control enters with an additional vigilance counter on it.\n{3}, Remove three counters from among creatures you control: Mill three cards, then return a permanent card with mana value 3 or less from your graveyard to the battlefield." });
const initiate = card("Hopeful Initiate", "Creature — Human Warlock", "{W}", { power: "1", toughness: "2", keywords: ["Training"], oracleText: "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\n{2}{W}, Remove two +1/+1 counters from among creatures you control: Destroy target artifact or enchantment." });
const sages = card("Novijen Sages", "Creature — Human Advisor Mutant", "{4}{U}{U}", { power: "0", toughness: "0", keywords: ["Graft"], oracleText: "Graft 4 (This creature enters with four +1/+1 counters on it. Whenever another creature enters, you may move a +1/+1 counter from this creature onto it.)\n{1}, Remove two +1/+1 counters from among creatures you control: Draw a card." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};

describe("round 101: Tekuthal and proliferating", () => {
  it("parse", () => {
    for (const c of [tekuthal, ezuri, tayam, initiate, sages]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Tekuthal: proliferating once proliferates twice; with two, four times", () => {
    const { s: s0, ap, ids } = setup([progress]);
    putOnBattlefield(s0, ap, tekuthal);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    s0.players[ap]!.manaPool.U = 3;
    const s = run(s0, planCast(s0, ap, ids[0]!, []));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
  });

  it("Ezuri: proliferate twice draws a card each time; with Tekuthal, four", () => {
    for (const [withTekuthal, draws] of [[false, 2], [true, 4]] as const) {
      const { s: s0, ap, ids } = setup([ezuri]);
      if (withTekuthal) putOnBattlefield(s0, ap, tekuthal);
      const b = putOnBattlefield(s0, ap, bear());
      s0.objects[b]!.counters["+1/+1"] = 1;
      s0.players[ap]!.manaPool.G = 1;
      s0.players[ap]!.manaPool.U = 1;
      s0.players[ap]!.manaPool.C = 5;
      let s = run(s0, planCast(s0, ap, ids[0]!, []));
      const hand = s.players[ap]!.hand.length;
      for (let i = 0; i < 20 && s.pending; i++) s = settle(botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s));
      expect(s.objects[b]!.counters["+1/+1"]).toBe(1 + draws);
      expect(s.players[ap]!.hand.length).toBe(hand + draws);
    }
  });

  it("Tekuthal's cost: three counters from among other artifacts, creatures, and planeswalkers, any mix", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tekuthal);
    const b = putOnBattlefield(s0, ap, bear());
    const m = putOnBattlefield(s0, ap, relic);
    s0.objects[t]!.counters["+1/+1"] = 5; // not "other"
    s0.objects[b]!.counters["+1/+1"] = 2;
    s0.objects[m]!.counters.charge = 1;
    s0.players[ap]!.manaPool.U = 3;
    expect(abilityProblem(s0, ap, t, 0, [], undefined, undefined, undefined, { counters: [{ id: t, kind: "+1/+1" }, { id: b, kind: "+1/+1" }, { id: m, kind: "charge" }] })).toMatch(/choose 3 counters/);
    expect(abilityProblem(s0, ap, t, 0, [], undefined, undefined, undefined, { counters: [{ id: b, kind: "+1/+1" }, { id: b, kind: "+1/+1" }, { id: b, kind: "+1/+1" }] })).toMatch(/choose 3 counters/);
    const s = run(s0, planActivate(s0, ap, t, 0, [], undefined, undefined, undefined, { counters: [{ id: b, kind: "+1/+1" }, { id: b, kind: "+1/+1" }, { id: m, kind: "charge" }] }));
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[m]!.counters.charge ?? 0).toBe(0);
    expect(s.objects[t]!.counters.indestructible).toBe(1);
    expect(abilitiesOf(s, s.objects[t]!).activated.length).toBe(1);
  });

  it("not enough counters: it can't be activated", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tekuthal);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 2;
    s0.players[ap]!.manaPool.U = 3;
    expect(abilityProblem(s0, ap, t, 0, [])).toMatch(/remove 3 counters/);
  });

  it("Hopeful Initiate: only +1/+1 counters, from one creature or two", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, initiate);
    const b = putOnBattlefield(s0, ap, bear());
    const m = putOnBattlefield(s0, opp, relic);
    s0.objects[h]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters.vigilance = 3;
    s0.players[ap]!.manaPool.W = 3;
    expect(abilityProblem(s0, ap, h, 0, [target(m)], undefined, undefined, undefined, { counters: [{ id: b, kind: "vigilance" }, { id: b, kind: "+1/+1" }] })).toMatch(/choose 2 \+1\/\+1 counters/);
    const s = run(s0, planActivate(s0, ap, h, 0, [target(m)], undefined, undefined, undefined, { counters: [{ id: h, kind: "+1/+1" }, { id: b, kind: "+1/+1" }] }));
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.objects[h]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Tayam: three counters of any kind from among creatures, including Tayam's own", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tayam);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[t]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters.vigilance = 2;
    s0.players[ap]!.manaPool.C = 3;
    expect(abilityProblem(s0, ap, t, 0, [], undefined, undefined, undefined, { counters: [{ id: t, kind: "+1/+1" }, { id: b, kind: "vigilance" }, { id: b, kind: "vigilance" }] })).toBeNull();
  });

  it("Novijen Sages: two +1/+1 counters from one creature", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, sages);
    s0.objects[n]!.counters["+1/+1"] = 4;
    s0.players[ap]!.manaPool.C = 1;
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planActivate(s0, ap, n, 0, [], undefined, undefined, undefined, { counters: [{ id: n, kind: "+1/+1" }, { id: n, kind: "+1/+1" }] }));
    expect(s.objects[n]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("a bot pays a counter cost with spare counters, never a creature's last +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, sages);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[n]!.counters["+1/+1"] = 3;
    s0.objects[b]!.counters["+1/+1"] = 1;
    let s = s0;
    for (let i = 0; i < 60 && s.activePlayer === ap && s.step === "main1"; i++) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
    // Two of the Sages' three +1/+1 counters pay for one draw; its last one and the Bears' stay.
    expect(s.objects[n]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
});
