// "Becomes a 4/4 white and blue Elemental creature with flying and vigilance" (CR 205.1a-b, 613: types and subtypes in
// layer 4, colors in layer 5, abilities in layer 6, base P/T in layer 7b), "that's still a land" and "They're still
// lands" (it keeps its card types), plural "become 2/2 creatures", and "becomes" with no duration, which lasts while it
// stays on the battlefield (CR 611.2a, 400.7).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

// Real oracle text (Scryfall).
const colonnade = card("Celestial Colonnade", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {W} or {U}.\n{3}{W}{U}: Until end of turn, this land becomes a 4/4 white and blue Elemental creature with flying and vigilance. It's still a land." });
const affinity = card("Natural Affinity", "Instant", "{2}{G}", { oracleText: "All lands become 2/2 creatures until end of turn. They're still lands." });
const quirion = card("Quirion Druid", "Creature — Elf Druid", "{2}{G}", { power: "1", toughness: "2", oracleText: "{G}, {T}: Target land becomes a 2/2 green creature that's still a land. (This effect lasts indefinitely.)" });
const statue = card("Xanthic Statue", "Artifact", "{8}", { oracleText: "{5}: Until end of turn, this artifact becomes an 8/8 Golem artifact creature with trample." });

describe("animated lands and artifacts", () => {
  it("parses", () => {
    supported(colonnade, affinity, quirion, statue);
  });

  it("a manland: a 4/4 white and blue Elemental land creature with flying and vigilance until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const land = putOnBattlefield(s0, ap, colonnade);
    let s = settle(run(s0, planActivate(s0, ap, land, 0)));
    const o = s.objects[land]!;
    const c = characteristics(s, o);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(["Elemental"]);
    expect(c.colors.sort()).toEqual(["U", "W"]);
    expect([power(s, o), toughness(s, o)]).toEqual([4, 4]);
    expect(objHasKeyword(s, o, "Flying") && objHasKeyword(s, o, "Vigilance")).toBe(true);
    s = passUntil(s, "upkeep", (ap + 1) % 4);
    expect(characteristics(s, s.objects[land]!).types).toEqual(["Land"]);
  });

  it("all lands become 2/2 creatures that are still lands", () => {
    const { s: s0, ap, ids } = setup([affinity]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const forest = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    expect(characteristics(s, s.objects[forest]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(characteristics(s, s.objects[forest]!).subtypes).toContain("Forest");
    expect(power(s, s.objects[forest]!)).toBe(2);
  });

  it("with no duration it lasts after the turn ends", () => {
    const { s: s0, ap } = setup([]);
    const druid = putOnBattlefield(s0, ap, quirion);
    const forest = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = settle(run(s0, planActivate(s0, ap, druid, 0, [target(forest)])));
    s = passUntil(s, "upkeep", (ap + 1) % 4);
    const c = characteristics(s, s.objects[forest]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.colors).toEqual(["G"]);
    expect(toughness(s, s.objects[forest]!)).toBe(2);
  });

  it("an artifact becomes an 8/8 Golem artifact creature with trample", () => {
    const { s: s0, ap } = setup([]);
    const st = putOnBattlefield(s0, ap, statue);
    const s = settle(run(s0, planActivate(s0, ap, st, 0)));
    const c = characteristics(s, s.objects[st]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(["Golem"]);
    expect(objHasKeyword(s, s.objects[st]!, "Trample")).toBe(true);
    expect(power(s, s.objects[st]!)).toBe(8);
  });
});
