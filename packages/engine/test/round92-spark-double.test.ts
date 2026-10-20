// Round 92: Spark Double. "You may have this creature enter as a copy of a creature or planeswalker you control, except
// it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it
// if it's a planeswalker, and it isn't legendary." The counters are a replacement effect on its entering (CR 614.1c),
// judged as the copy; "isn't legendary" is copiable (rulings). Littjara Mirrorlake's token copy too.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const spark = card("Spark Double", "Creature — Illusion", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary." });
const mirrorlake = card("Littjara Mirrorlake", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {G} or {U}.\n{2}{G}{G}{U}, {T}, Sacrifice this land: Create a token that's a copy of target creature you control, except it enters with an additional +1/+1 counter on it. Activate only as a sorcery." });
const legend = card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", { power: "2", toughness: "2" });
const walker = card("Ajani Goldmane", "Legendary Planeswalker — Ajani", "{2}{W}{W}", { loyalty: "4", oracleText: "+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This creature's power and toughness are each equal to your life total.\"" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
function untilCopy(s: GameState) {
  for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
  return s;
}

describe("Spark Double", () => {
  it("parse", () => {
    for (const d of [spark, mirrorlake]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("copies a legendary creature: not legendary, with a +1/+1 counter, and both stay", () => {
    const { s: s0, ap, ids } = setup([spark]);
    const isamaru = putOnBattlefield(s0, ap, legend);
    let s = untilCopy(run(s0, planCast(s0, ap, ids[0]!)));
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: isamaru }));
    const d = ids[0]!;
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[d]!).supertypes).not.toContain("Legendary");
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, d)).toBe("3/3");
    expect(s.objects[isamaru]!.zone).toBe("battlefield");
  });

  it("only creatures and planeswalkers you control", () => {
    const { s: s0, ap, ids, opp } = setup([spark]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    const s = untilCopy(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind !== "chooseOption") throw new Error();
    expect(s.pending.options).toContain(mine);
    expect(s.pending.options).not.toContain(theirs);
  });

  it("copies a planeswalker: its loyalty plus one, no +1/+1 counter", () => {
    const { s: s0, ap, ids } = setup([spark]);
    const ajani = putOnBattlefield(s0, ap, walker);
    s0.objects[ajani]!.counters.loyalty = 4;
    let s = untilCopy(run(s0, planCast(s0, ap, ids[0]!)));
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: ajani }));
    const d = ids[0]!;
    expect(s.objects[d]!.counters.loyalty).toBe(5);
    expect(s.objects[d]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[ajani]!.zone).toBe("battlefield");
  });

  it("Littjara Mirrorlake: a token copy with an additional +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    const lake = putOnBattlefield(s0, ap, mirrorlake);
    const b = putOnBattlefield(s0, ap, bear());
    const s = passAll(run(s0, planActivate(s0, ap, lake, 0, [{ kind: "object", id: b }])));
    const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(token).toBeDefined();
    expect(s.objects[token]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, token)).toBe("3/3");
  });
});
