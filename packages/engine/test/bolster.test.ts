// Bolster N (CR 701.39a): N +1/+1 counters on a creature you control with the least toughness, or tied for it,
// chosen as the spell or ability resolves; not targeted (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};

// Real oracle text (Scryfall).
const tactician = card("Aven Tactician", "Creature — Bird Soldier", "{4}{W}", {
  power: "2",
  toughness: "3",
  keywords: ["Bolster", "Flying"],
  oracleText: "Flying\nWhen this creature enters, bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)",
});
const general = card("Dragonscale General", "Creature — Human Warrior", "{3}{W}", {
  power: "2",
  toughness: "3",
  keywords: ["Bolster"],
  oracleText:
    "At the beginning of your end step, bolster X, where X is the number of tapped creatures you control. (Choose a creature with the least toughness among creatures you control and put X +1/+1 counters on it.)",
});
const cached = card("Cached Defenses", "Sorcery", "{2}{G}", {
  keywords: ["Bolster"],
  oracleText: "Bolster 3. (Choose a creature with the least toughness among creatures you control and put three +1/+1 counters on it.)",
});

describe("bolster", () => {
  it("the counters go on the creature with the least toughness, with no choice when it is alone", () => {
    supported(tactician, general, cached);
    const { s: s0, ap, ids } = setup([tactician]);
    const small = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "1" }));
    const b = putOnBattlefield(s0, ap, bear());
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect([pt(s, small), pt(s, b), pt(s, ids[0]!)]).toEqual(["4/2", "2/2", "2/3"]);
  });

  it("a tie for least toughness: you choose among the tied creatures only", () => {
    const { s: s0, ap, ids } = setup([cached]);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear({ power: "1", toughness: "4" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", count: 1 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([b1, b2].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b2] }));
    expect([pt(s, b1), pt(s, b2)]).toEqual(["2/2", "5/5"]);
  });

  it("Dragonscale General: X is the number of tapped creatures you control as it resolves", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, general);
    const b1 = putOnBattlefield(s0, ap, bear({ toughness: "1" }));
    const b2 = putOnBattlefield(s0, ap, bear());
    s0.objects[b2]!.tapped = true;
    const s = settle(passUntil(s0, "end", ap));
    expect(pt(s, b1)).toBe("3/2");
  });
});
