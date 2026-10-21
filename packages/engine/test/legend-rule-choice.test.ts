// The legend rule (CR 704.5j): "If two or more legendary permanents with the same name are controlled by the same
// player, that player chooses one of them, and the rest are put into their owners' graveyards." The choice is made
// before the state-based actions are performed, so they all still happen at once (CR 704.3).

import { describe, expect, it } from "vitest";
import { act, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { botActions, legendBotKeep, waitingOn, type GameState } from "../src";

const thalia = card("Thalia's Lieutenant Prime", "Legendary Creature — Human Soldier", "{1}{W}", { power: "2", toughness: "2" });
const relic = card("Test Relic", "Legendary Artifact", "{1}", {});
const mirror = card("Test Mirror", "Sorcery", "{1}{U}", { oracleText: "Create a token that's a copy of target creature you control." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("the legend rule: the controller chooses which to keep", () => {
  it("asks which one; the one chosen stays, even the older one", () => {
    const { s: s0, ap, ids } = setup([thalia]);
    let s = s0;
    const old = putOnBattlefield(s, ap, thalia);
    s.objects[old]!.counters["+1/+1"] = 2;
    s = settle(cast(s, ap, ids[0]!));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "legend" && p.player === ap).toBe(true);
    if (p?.kind !== "chooseOption") return;
    expect(p.options).toEqual([old, ids[0]]);
    expect(p.labels).toEqual(["Keep Thalia's Lieutenant Prime (2 +1/+1 counters, oldest)", "Keep Thalia's Lieutenant Prime (newest)"]);
    s = act(s, { type: "chooseOption", player: ap, choice: old });
    expect(s.pending).toBeFalsy();
    expect(s.objects[old]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("or the new one", () => {
    const { s: s0, ap, ids } = setup([thalia]);
    let s = s0;
    const old = putOnBattlefield(s, ap, thalia);
    s = settle(cast(s, ap, ids[0]!));
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    expect(s.objects[old]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("two groups are asked about one after the other, then both are put into the graveyard together", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [t1, t2, r1, r2] = [putOnBattlefield(s, ap, thalia), putOnBattlefield(s, ap, thalia), putOnBattlefield(s, ap, relic), putOnBattlefield(s, ap, relic)];
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual([t1, t2]);
    s = act(s, { type: "chooseOption", player: ap, choice: t2! });
    // Nothing has gone yet: the second group is asked first.
    expect(s.objects[t1!]!.zone).toBe("battlefield");
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual([r1, r2]);
    s = act(s, { type: "chooseOption", player: ap, choice: r1! });
    expect(s.pending).toBeFalsy();
    expect([t1, t2, r1, r2].map((id) => s.objects[id!]!.zone)).toEqual(["graveyard", "battlefield", "battlefield", "graveyard"]);
  });

  it("different players' legends with the same name both stay", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const a = putOnBattlefield(s, ap, thalia);
    const b = putOnBattlefield(s, opp, thalia);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toBeFalsy();
    expect([a, b].map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  });
});

describe("the legend rule: which one a bot keeps", () => {
  it("the card over a token copy of it", () => {
    const { s: s0, ap, ids } = setup([mirror]);
    let s = s0;
    const old = putOnBattlefield(s, ap, thalia);
    s = settle(cast(s, ap, ids[0]!, [target(old)]));
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "legend") throw new Error("not asked");
    const token = p.options.find((id) => id !== old)!;
    expect(s.objects[token]!.isToken).toBe(true);
    expect(p.labels![1]).toBe("Keep Thalia's Lieutenant Prime (token, newest)");
    expect(legendBotKeep(s, p.options)).toBe(old);
    s = act(s, botActions(s, ap)[0]!);
    expect(s.objects[old]!.zone).toBe("battlefield");
    expect(s.objects[token]?.zone ?? "gone").not.toBe("battlefield");
  });

  it("the one with counters, then the one with an Aura or Equipment on it", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, thalia);
    const b = putOnBattlefield(s, ap, thalia);
    expect(legendBotKeep(s, [a, b])).toBe(a);
    s.objects[b]!.counters["+1/+1"] = 1;
    expect(legendBotKeep(s, [a, b])).toBe(b);
    const gear = putOnBattlefield(s, ap, card("Test Gear", "Artifact — Equipment", "{1}", {}));
    s.objects[gear]!.attachedTo = a;
    expect(legendBotKeep(s, [a, b])).toBe(a);
  });
});
