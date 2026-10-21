// Round 101: The Darkness Crystal. Its replacement effect exiles opponents' nontoken creatures that would die (CR 614.1a),
// and its activated ability targets a creature card exiled with it, a card in exile linked to it (CR 607.2a).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, controllerOf, isFullySupported, legalTargets, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const crystal = card("The Darkness Crystal", "Legendary Artifact", "{2}{B}{B}", { oracleText: "Black spells you cast cost {1} less to cast.\nIf a nontoken creature an opponent controls would die, instead exile it and you gain 2 life.\n{4}{B}{B}, {T}: Put target creature card exiled with The Darkness Crystal onto the battlefield tapped under your control with two additional +1/+1 counters on it." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const exileIt = card("Exile It", "Instant", "{W}", { oracleText: "Exile target creature." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const cast = (s: GameState, pid: number, id: string, t: string) => {
  const plan = planCast(s, pid, id, [target(t)]);
  if (!plan) throw new Error("can't cast");
  return settle(plan.reduce((x, a) => act(x, a), s));
};

describe("round 101: The Darkness Crystal", () => {
  it("parse", () => expect(isFullySupported(crystal)).toBe(true));

  it("exiles an opponent's dying creature, gains 2 life, and later puts it onto the battlefield with two +1/+1 counters", () => {
    const { s: s0, ap, opp, ids } = setup([murder]);
    const c = putOnBattlefield(s0, ap, crystal);
    const b = putOnBattlefield(s0, opp, bear());
    s0.players[ap]!.manaPool.B = 2; // Murder costs {1} less: a black spell
    const life = s0.players[ap]!.life;
    let s = cast(s0, ap, ids[0]!, b);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 2);
    const ab = abilitiesOf(s, s.objects[c]!).activated.findIndex((a) => a.text?.startsWith("{4}"));
    expect(legalTargets(s, abilitiesOf(s, s.objects[c]!).activated[ab]!.body.targets[0]!, ap, undefined, undefined, c).map((t) => t.id)).toEqual([b]);
    s.players[ap]!.manaPool.B = 6;
    const plan = planActivate(s, ap, c, ab, [{ kind: "object", id: b, zc: s.objects[b]!.zoneChanges ?? 0 }]);
    if (!plan) throw new Error("can't activate");
    s = settle(plan.reduce((x, a) => act(x, a), s));
    const o = s.objects[b]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(controllerOf(s, o)).toBe(ap);
    expect(o.counters?.["+1/+1"]).toBe(2);
  });

  it("a creature card exiled some other way isn't a legal target", () => {
    const { s: s0, ap, opp, ids } = setup([exileIt]);
    const c = putOnBattlefield(s0, ap, crystal);
    const b = putOnBattlefield(s0, opp, bear());
    s0.players[ap]!.manaPool.W = 1;
    const s = cast(s0, ap, ids[0]!, b);
    expect(s.objects[b]!.zone).toBe("exile");
    const ab = abilitiesOf(s, s.objects[c]!).activated.findIndex((a) => a.text?.startsWith("{4}"));
    expect(legalTargets(s, abilitiesOf(s, s.objects[c]!).activated[ab]!.body.targets[0]!, ap, undefined, undefined, c)).toEqual([]);
  });
});
