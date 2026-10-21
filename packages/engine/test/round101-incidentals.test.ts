// Round 101: cards that came with this round's rules. Dino DNA (a target card exiled with it, linked to its imprint
// ability, CR 607.2a), Pitiless Carnage ("sacrifice any number of permanents you control, then draw that many cards"),
// Evil Reawakened ("with two additional +1/+1 counters", CR 614.1c), Contagion Engine ("proliferate twice") and
// Scheming Aspirant ("Whenever you proliferate", once for each proliferate action, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const dna = card("Dino DNA", "Artifact", "{1}", { keywords: ["Imprint"], oracleText: "Imprint — {1}, {T}: Exile target creature card from a graveyard. Activate only as a sorcery.\n{6}: Create a token that's a copy of target creature card exiled with this artifact, except it's a 6/6 green Dinosaur creature with trample. Activate only as a sorcery." });
const carnage = card("Pitiless Carnage", "Sorcery", "{3}{B}", { keywords: ["Plot"], oracleText: "Sacrifice any number of permanents you control, then draw that many cards.\nPlot {1}{B}{B} (You may pay {1}{B}{B} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const reawakened = card("Evil Reawakened", "Sorcery", "{4}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield with two additional +1/+1 counters on it." });
const engine = card("Contagion Engine", "Artifact", "{6}", { keywords: ["Proliferate"], oracleText: "When this artifact enters, put a -1/-1 counter on each creature target player controls.\n{4}, {T}: Proliferate twice. (Choose any number of permanents and/or players, then give each another counter of each kind already there. Then do it again.)" });
const aspirant = card("Scheming Aspirant", "Creature — Phyrexian Advisor", "{1}{B}", { power: "1", toughness: "3", keywords: ["Proliferate"], oracleText: "Whenever you proliferate, each opponent loses 2 life and you gain 2 life." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
const toGraveyard = (s: GameState, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[s.objects[id]!.owner]!.graveyard.push(id);
};

describe("round 101: cards that came along", () => {
  it("parse", () => {
    for (const c of [dna, carnage, reawakened, engine, aspirant]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Dino DNA: copies a creature card it exiled, as a 6/6 Dinosaur with trample; not one exiled another way", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dna);
    const b = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear({ name: "Runeclaw Bear" }));
    toGraveyard(s0, b);
    s0.battlefield.splice(s0.battlefield.indexOf(other), 1);
    s0.objects[other]!.zone = "exile";
    s0.players[ap]!.manaPool.C = 7;
    let s = run(s0, planActivate(s0, ap, d, 0, [target(b)]));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(planActivate(s, ap, d, 1, [{ kind: "object", id: other, zc: s.objects[other]!.zoneChanges ?? 0 }])).toBeNull();
    s = run(s, planActivate(s, ap, d, 1, [{ kind: "object", id: b, zc: s.objects[b]!.zoneChanges ?? 0 }]));
    const token = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken && o.controller === ap);
    expect(token).toBeDefined();
    expect(s.cards[token!.cardId]!.name).toBe("Grizzly Bears");
    expect(pt(s, token!.id)).toBe("6/6");
    expect(objHasKeyword(s, token!, "Trample")).toBe(true);
  });

  it("Pitiless Carnage: sacrifice any number, including none, then draw that many", () => {
    for (const n of [0, 2]) {
      const { s: s0, ap, ids } = setup([carnage]);
      const mine = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
      s0.players[ap]!.manaPool.B = 4;
      let s = run(s0, planCast(s0, ap, ids[0]!, []));
      expect(s.pending?.kind).toBe("pickPermanents");
      if (s.pending?.kind !== "pickPermanents") return;
      expect(s.pending.min).toBe(0);
      const hand = s.players[ap]!.hand.length;
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: mine.slice(0, n) }));
      expect(mine.filter((id) => s.objects[id]!.zone === "graveyard").length).toBe(n);
      expect(s.players[ap]!.hand.length).toBe(hand + n);
    }
  });

  it("Evil Reawakened: the creature returns with two +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([reawakened]);
    const b = putOnBattlefield(s0, ap, bear());
    toGraveyard(s0, b);
    s0.players[ap]!.manaPool.B = 5;
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("Contagion Engine and Scheming Aspirant: proliferating twice drains twice", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, engine);
    putOnBattlefield(s0, ap, aspirant);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.counters["-1/-1"] = 1;
    s0.players[ap]!.manaPool.C = 4;
    const life = s0.players[ap]!.life;
    const s = run(s0, planActivate(s0, ap, e, 0, []));
    expect(s.objects[b]!.zone).toBe("graveyard"); // a 2/2 with three -1/-1 counters
    expect(s.players[ap]!.life).toBe(life + 4); // 2 life, twice
    expect(s.players[opp]!.life).toBe(36);
  });
});
