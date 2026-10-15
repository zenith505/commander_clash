// Mana added by a spell or by a triggered ability that isn't a mana ability (CR 605.1, 605.5a): it uses the stack, and the
// mana empties from the pool as the step ends (CR 106.4). "Add {B}{B}{B}" (Dark Ritual), "Threshold — Add {B}{B}{B}{B}{B}
// instead if ..." (Cabal Ritual), "When this creature enters, add one mana of any color" (Quirion Sentinel), "Add two
// mana of any one color" (Traitorous Greed).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, controllerOf, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const ritual = card("Dark Ritual", "Instant", "{B}", { oracleText: "Add {B}{B}{B}." });
const cabal = card("Cabal Ritual", "Instant", "{1}{B}", { oracleText: "Add {B}{B}{B}.\nThreshold — Add {B}{B}{B}{B}{B} instead if there are seven or more cards in your graveyard." });
const sentinel = card("Quirion Sentinel", "Creature — Elf Druid", "{1}{G}", { power: "2", toughness: "1", oracleText: "When this creature enters, add one mana of any color." });
const vestige = card("Crumbling Vestige", "Land", "", { oracleText: "This land enters tapped.\nWhen this land enters, add one mana of any color.\n{T}: Add {C}. ({C} represents colorless mana.)" });
const greed = card("Traitorous Greed", "Sorcery", "{3}{R}", {
  oracleText: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. Add two mana of any one color. (The creature can attack and {T} this turn.)",
});
const angel = card("Illusory Angel", "Creature — Angel Illusion", "{2}{U}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Cast this spell only if you've cast another spell this turn.\nFlying" });
const ogre = card("Hulking Ogre", "Creature — Ogre", "{2}{B}", { power: "3", toughness: "3" });

const pool = (s: GameState, pid: PlayerId) => s.players[pid]!.manaPool;
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;

describe("adding mana from a spell or an enters trigger", () => {
  it("compiles", () => {
    for (const d of [ritual, cabal, sentinel, vestige, greed, angel]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Dark Ritual adds {B}{B}{B} as it resolves; it pays for a spell, then empties as the step ends", () => {
    const { s: s0, ap, ids } = setup([ritual, ogre]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.stack.length).toBe(0);
    expect(pool(s, ap).B).toBe(3);
    const before = untapped(s, ap);
    const plan = planCast(s, ap, ids[1]!)!;
    for (const a of plan) s = act(s, a);
    expect(untapped(s, ap)).toBe(before); // paid entirely from the pool
    expect(pool(s, ap).B).toBe(0);
    // Unspent mana is lost as the step ends.
    const { s: s1, ap: ap1, ids: ids1 } = setup([ritual]);
    let t = cast(s1, ap1, ids1[0]!);
    expect(pool(t, ap1).B).toBe(3);
    t = passUntil(t, "beginCombat", ap1);
    expect(pool(t, ap1).B).toBe(0);
  });

  it("Cabal Ritual adds five with threshold, three without", () => {
    const { s: s0, ap, ids } = setup([cabal]);
    expect(pool(cast(structuredClone(s0), ap, ids[0]!), ap).B).toBe(3);
    const p = s0.players[ap]!;
    for (const id of p.library.splice(0, 7)) {
      s0.objects[id]!.zone = "graveyard";
      p.graveyard.push(id);
    }
    expect(pool(cast(s0, ap, ids[0]!), ap).B).toBe(5);
  });

  it("Quirion Sentinel's enters trigger asks for a color and adds one of it", () => {
    const { s: s0, ap, ids } = setup([sentinel]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending!;
    expect(pend.kind === "chooseOption" && pend.what).toBe("color");
    const blue = pend.kind === "chooseOption" ? pend.options.find((o) => /blue|^U$/i.test(o))! : "";
    s = act(s, { type: "chooseOption", player: ap, choice: blue });
    expect(pool(s, ap).U).toBe(1);
  });

  it("Crumbling Vestige enters tapped and still adds a mana; Traitorous Greed adds two of one color", () => {
    const { s: s0, ap, ids } = setup([vestige]);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    s = act(s, { type: "chooseOption", player: ap, choice: opts.find((o) => /red|^R$/i.test(o))! });
    expect(pool(s, ap).R).toBe(1);
    const { s: s1, ap: ap1, opp, ids: ids1 } = setup([greed]);
    const theirs = putOnBattlefield(s1, opp, ogre);
    let t = s1;
    for (const a of planCast(s1, ap1, ids1[0]!, [{ kind: "object", id: theirs }])!) t = act(t, a);
    for (let i = 0; i < 10 && t.pending?.kind !== "chooseOption"; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    const o2 = t.pending?.kind === "chooseOption" ? t.pending.options : [];
    t = act(t, { type: "chooseOption", player: ap1, choice: o2.find((o) => /green|^G$/i.test(o))! });
    expect(pool(t, ap1).G).toBe(2);
    expect(controllerOf(t, t.objects[theirs]!)).toBe(ap1);
  });

  it("Illusory Angel can be cast only after another spell this turn", () => {
    const { s: s0, ap, ids } = setup([ritual, angel]);
    expect(castProblem(s0, ap, ids[1]!)).toMatch(/only if you've cast another spell/);
    expect(planCast(s0, ap, ids[1]!)).toBeNull();
    let s = cast(s0, ap, ids[0]!);
    s = cast(s, ap, ids[1]!);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
  });
});
