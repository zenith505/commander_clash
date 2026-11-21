// Lane B round B284: Chorus of the Conclave ("As an additional cost to cast creature spells, you may pay any amount of
// mana. If you do, that creature enters with that many additional +1/+1 counters on it."; CR 113.6, 400.7, 601.2b, 601.2f,
// 614.1c and its rulings).

import { describe, expect, it } from "vitest";
import { act, bear, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

// Real card data (Scryfall).
const chorus = (): CardDef => ({"oracleId":"e4e6ffab-3f0c-43f8-b1c3-b59c7fcb095d","name":"Chorus of the Conclave","manaCost":"{4}{G}{G}{W}{W}","cmc":8,"typeLine":"Legendary Creature — Dryad","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dryad"],"oracleText":"Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)\nAs an additional cost to cast creature spells, you may pay any amount of mana. If you do, that creature enters with that many additional +1/+1 counters on it.","power":"3","toughness":"8","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Landwalk","Forestwalk"],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const untapped = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

describe("Chorus of the Conclave", () => {
  it("is supported", () => {
    expect(isFullySupported(chorus())).toBe(true);
  });

  it("pays any amount of mana more for a creature spell, which enters with that many more +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, chorus());
    const lands = untapped(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { chorus: 3 }));
    // {1}{G} and {3} more (CR 601.2f).
    expect(untapped(s, ap)).toBe(lands - 5);
    expect(s.log.some((l) => /casts Grizzly Bears, paying \{3\} more \(Chorus of the Conclave\)/.test(l.text))).toBe(true);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
  });

  it("paying nothing, or not choosing to, adds no counters", () => {
    for (const chorusPaid of [0, undefined]) {
      const { s: s0, ap, ids } = setup([bear()]);
      putOnBattlefield(s0, ap, chorus());
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, chorusPaid === undefined ? {} : { chorus: chorusPaid })));
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    }
  });

  it("can't be paid for more mana than you have", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, chorus());
    const lands = untapped(s0, ap);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { chorus: lands - 2 })).not.toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { chorus: lands - 1 })).toBeNull();
  });

  it("only for creature spells, only while you control it, only whole amounts", () => {
    const { s: s0, ap, ids } = setup([divination(), bear(), chorus()]);
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { chorus: 2 })).toMatch(/nothing lets you pay more mana/);
    // Chorus can't pay for itself (rulings): it isn't on the battlefield as it's cast.
    expect(castProblem(s0, ap, ids[2]!, undefined, undefined, undefined, undefined, undefined, { chorus: 1 })).toMatch(/nothing lets you pay more mana/);
    putOnBattlefield(s0, ap, chorus());
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { chorus: 2 })).toMatch(/nothing lets you pay more mana/);
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { chorus: 1.5 })).toMatch(/whole amount/);
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { chorus: 2 })).not.toMatch(/nothing lets you pay more mana|whole amount/);
    expect(planCast(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, { chorus: 2 })).not.toBeNull();
  });

  it("an opponent's Chorus does nothing for your spells", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    putOnBattlefield(s0, opp, chorus());
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { chorus: 2 })).toMatch(/nothing lets you pay more mana/);
  });

  it("no counters if the Chorus has left the battlefield by the time the creature enters (CR 113.6)", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const ch = putOnBattlefield(s0, ap, chorus());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { chorus: 2 }));
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    moveObject(s, ch, "graveyard");
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a bot pays its spare mana for counters when nothing else in hand is left to cast", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, chorus());
    const lands = untapped(s0, ap);
    s0.players[ap]!.hand = [ids[0]!];
    // Its commander out of the way (it would be cast first).
    for (const c of s0.players[ap]!.command) {
      s0.objects[c]!.zone = "exile";
      s0.players[ap]!.exile.push(c);
    }
    s0.players[ap]!.command = [];
    let s = s0;
    for (let i = 0; i < 40 && s.objects[ids[0]!]!.zone === "hand"; i++) {
      const acts = botActions(s, waitingOn(s)!);
      for (const a of acts) s = act(s, a);
    }
    expect(s.log.some((l) => l.text.includes(`paying {${lands - 2}} more (Chorus of the Conclave)`))).toBe(true);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(lands - 2);
  });
});
