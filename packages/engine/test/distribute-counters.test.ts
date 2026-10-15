// Distributing counters (CR 601.2d): "distribute two +1/+1 counters among one or two target creatures". How many
// targets and how many counters each gets are chosen with the targets, at least one each, like divided damage; a
// target that's illegal as it resolves doesn't get its part, and the part goes nowhere else (CR 608.2b).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, planCast, isFullySupported, moveObject, waitingOn, type CardDef, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const rite = card("Elven Rite", "Sorcery", "{1}{G}", { oracleText: "Distribute two +1/+1 counters among one or two target creatures." });
const agony = card("Splendid Agony", "Instant", "{2}{B}", { oracleText: "Distribute two -1/-1 counters among one or two target creatures." });
const gearhulk = card("Verdurous Gearhulk", "Artifact Creature — Construct", "{3}{G}{G}", { power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, distribute four +1/+1 counters among any number of target creatures you control." });
const corps = card("Armament Corps", "Creature — Human Soldier", "{2}{W}{B}{G}", { power: "4", toughness: "4", oracleText: "When this creature enters, distribute two +1/+1 counters among one or two target creatures you control." });
const forger = card("Wurmskin Forger", "Creature — Elf Warrior", "{5}{G}{G}", { power: "2", toughness: "2", oracleText: "When this creature enters, distribute three +1/+1 counters among one, two, or three target creatures." });
const elf = card("Elf Test", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

const part = (id: string, amount: number): TargetChoice => ({ kind: "object", id, amount });
const plusOnes = (s: { objects: Record<string, { counters: Record<string, number | undefined> }> }, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;

describe("distributing counters", () => {
  it("parses the common forms", () => {
    supported(rite, agony, gearhulk, corps, forger);
  });

  it("each target gets its part, at least one each, adding up to the total", () => {
    const { s: s0, ap, ids } = setup([rite]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!, [part(a, 2), part(b, 1)])).toMatch(/distribute the 2 counters/);
    expect(castProblem(s0, ap, ids[0]!, [part(a, 2), part(b, 0)])).toMatch(/at least 1/);
    let s = cast(s0, ap, ids[0]!, [part(a, 1), part(b, 1)]);
    expect([plusOnes(s, a), plusOnes(s, b)]).toEqual([1, 1]);
    const { s: s1, ap: ap1, ids: ids1 } = setup([rite]);
    const c = putOnBattlefield(s1, ap1, bear());
    s = cast(s1, ap1, ids1[0]!, [part(c, 2), { kind: "none" }]);
    expect(plusOnes(s, c)).toBe(2);
  });

  it("a target gone when it resolves doesn't get its part, and nobody else does (CR 608.2b)", () => {
    const { s: s0, ap, opp, ids } = setup([agony]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    let s = s0;
    for (const x of planCast(s0, ap, ids[0]!, [part(a, 1), part(b, 1)])!) s = act(s, x);
    moveObject(s, a, "exile");
    s = passAll(s);
    expect(s.objects[b]!.counters["-1/-1"]).toBe(1);
    expect(s.objects[a]!.counters["-1/-1"]).toBeUndefined();
  });

  it("an enters trigger's targets and parts are chosen as it goes on the stack", () => {
    const { s: s0, ap, ids } = setup([gearhulk]);
    const a = putOnBattlefield(s0, ap, elf);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [part(a, 3), part(ids[0]!, 1), { kind: "none" }, { kind: "none" }] });
    s = passAll(s);
    expect([plusOnes(s, a), plusOnes(s, ids[0]!)]).toEqual([3, 1]);
  });

  it("a bot puts +1/+1 counters on its own creature and -1/-1 counters where they kill", () => {
    const { s: s0, ap, opp, ids } = setup([forger]);
    const mine = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 6 && s.pending?.kind === "chooseTargets"; i++) for (const x of botActions(s, waitingOn(s)!)) s = act(s, x);
    s = passAll(s);
    expect(plusOnes(s, mine) + plusOnes(s, ids[0]!)).toBe(3);

    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([agony]);
    const x = putOnBattlefield(s1, opp1, elf);
    const y = putOnBattlefield(s1, opp1, elf);
    s = s1;
    for (let i = 0; i < 10 && !s.stack.length; i++) for (const a of botActions(s, ap1)) s = act(s, a);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids1[0] });
    expect((s.stack.at(-1)!.targets ?? []).filter((t) => t.kind === "object").map((t) => (t as { id: string; amount: number }).amount)).toEqual([1, 1]);
    s = passAll(s);
    expect([s.objects[x]!.zone, s.objects[y]!.zone]).toEqual(["graveyard", "graveyard"]);
  });
});
