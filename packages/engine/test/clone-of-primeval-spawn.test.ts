// A Clone entering as a copy of Primeval Spawn: Spawn's "If this creature would enter and it wasn't cast or no mana was
// spent to cast it, exile it instead" is the Clone's as it would exist on the battlefield (CR 614.12, 707.5), judged by
// how the Clone itself got there. Exiled instead, it never was on the battlefield, so its leaves ability doesn't trigger.

import { describe, expect, it } from "vitest";
import { act, card, passAll, putOnBattlefield, setup } from "./helpers";
import { moveObject, planCast, waitingOn, type Action, type GameState } from "../src";

const spawn = card("Primeval Spawn", "Creature — Avatar", "{5}{W}{U}{B}{R}{G}", { power: "10", toughness: "10", keywords: ["Vigilance", "Trample", "Lifelink"], oracleText: "If this creature would enter and it wasn't cast or no mana was spent to cast it, exile it instead.\nVigilance, trample, lifelink\nWhen this creature leaves the battlefield, exile the top ten cards of your library. You may cast any number of spells with total mana value 10 or less from among them without paying their mana costs." });
const clone = card("Clone", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
function untilCopy(s: GameState) {
  for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
  return s;
}

describe("A Clone copying Primeval Spawn", () => {
  it("cast with mana, it enters as a Primeval Spawn", () => {
    const { s: s0, ap, ids } = setup([clone]);
    const theSpawn = putOnBattlefield(s0, ap, spawn);
    let s = untilCopy(run(s0, planCast(s0, ap, ids[0]!)));
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: theSpawn }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.copyOf).toBeDefined();
  });

  it("put onto the battlefield from a graveyard, it's exiled instead, and nothing triggers", () => {
    const { s: s0, ap } = setup([]);
    const theSpawn = putOnBattlefield(s0, ap, spawn);
    const c = putOnBattlefield(s0, ap, clone);
    moveObject(s0, c, "graveyard");
    s0.triggerQueue = [];
    moveObject(s0, c, "battlefield");
    let s = untilCopy(s0);
    const top = s.players[ap]!.library[0];
    s = act(s, { type: "chooseOption", player: ap, choice: theSpawn });
    expect(s.objects[c]!.zone).toBe("exile");
    expect(s.battlefield).not.toContain(c);
    expect(s.objects[c]!.copyOf).toBeUndefined();
    expect(s.triggerQueue).toHaveLength(0);
    expect(s.players[ap]!.library[0]).toBe(top);
    expect(s.log.some((l) => l.text === "Clone is exiled instead of entering: it wasn't cast.")).toBe(true);
  });

  it("not copying anything, it enters (as a 0/0)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, spawn);
    const c = putOnBattlefield(s0, ap, clone);
    moveObject(s0, c, "graveyard");
    moveObject(s0, c, "battlefield");
    const s = act(untilCopy(s0), { type: "chooseOption", player: ap, choice: "none" });
    expect(s.log.some((l) => /Clone is exiled instead/.test(l.text))).toBe(false);
  });
});
