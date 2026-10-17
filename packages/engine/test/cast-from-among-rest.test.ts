// Casting from among exiled cards, of some types only and only so many, then the rest going somewhere: Muse Vortex (one
// instant or sorcery; the others of those types to your hand, the rest to the bottom: rulings, all of them to your hand
// if you cast none), Epic Experiment (any number; the rest to your graveyard, rulings), Collected Conjuring (up to two
// sorceries; the rest to the bottom in a random order). Cast as it resolves, ignoring timing (CR 608.2g).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const vortex = card("Muse Vortex", "Sorcery", "{X}{U}", { oracleText: "Exile the top X cards of your library. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost. Then put the exiled instant and sorcery cards that weren't cast this way into your hand and the rest on the bottom of your library in a random order." });
const experiment = card("Epic Experiment", "Sorcery", "{X}{U}{R}", { oracleText: "Exile the top X cards of your library. You may cast instant and sorcery spells with mana value X or less from among them without paying their mana costs. Then put all cards exiled this way that weren't cast into your graveyard." });
const conjuring = card("Collected Conjuring", "Sorcery", "{2}{U}{R}", { oracleText: "Exile the top six cards of your library. You may cast up to two sorcery spells with mana value 3 or less from among them without paying their mana costs. Put the exiled cards not cast this way on the bottom of your library in a random order." });

const sorcery = (name: string, cost: string) => card(name, "Sorcery", cost, { oracleText: "Draw a card." });
const instant = (name: string, cost: string) => card(name, "Instant", cost, { oracleText: "Draw a card." });
const elf = card("Three Drop", "Creature — Elf", "{2}{G}", { power: "3", toughness: "3" });

/** Puts `defs` on top of `pid`'s library, the first one on top. */
function stack(s: GameState, pid: PlayerId, defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
}
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
function until(s: GameState, done: (s: GameState) => boolean) {
  for (let i = 0; i < 80 && !done(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
function castPick(s: GameState, pid: PlayerId, id: string) {
  s = act(s, { type: "chooseOption", player: pid, choice: id });
  expect(s.pending).toMatchObject({ kind: "castFree", objectId: id });
  return run(s, planCast(s, pid, id));
}

describe("cast from among exiled cards, then the rest", () => {
  it("parse", () => {
    supported(vortex, experiment, conjuring);
    expect(compileCard(vortex).spell!.effects[0]).toMatchObject({ type: "castFromAmong", max: 1, filter: { types: ["Instant", "Sorcery"] }, rest: { dest: "bottomRandom", toHand: true } });
    expect(compileCard(experiment).spell!.effects[0]).toMatchObject({ type: "castFromAmong", rest: { dest: "graveyard" } });
    expect(compileCard(experiment).spell!.effects[0]).not.toHaveProperty("max");
    expect(compileCard(conjuring).spell!.effects[0]).toMatchObject({ type: "castFromAmong", n: 6, max: 2, maxMv: 3, filter: { types: ["Sorcery"] }, rest: { dest: "bottomRandom" } });
  });

  it("Muse Vortex: cast one, the other sorcery to your hand, the creature to the bottom", () => {
    const { s: s0, ap, ids } = setup([vortex]);
    const [cheap, pricey, creature] = stack(s0, ap, [sorcery("Cheap Spell", "{2}{U}"), sorcery("Pricey Spell", "{4}{U}"), elf]) as [string, string, string];
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3));
    s = until(s, (x) => offered(x).length > 0);
    expect(offered(s)).toEqual([cheap, "none"]);
    s = castPick(s, ap, cheap);
    expect(s.pending).toBeNull();
    expect(s.objects[cheap]!.zone).toBe("stack");
    expect(s.objects[pricey]!.zone).toBe("hand");
    expect(s.objects[creature]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(creature);
  });

  it("Muse Vortex: casting none puts all the instants and sorceries into your hand (rulings)", () => {
    const { s: s0, ap, ids } = setup([vortex]);
    const [a, b] = stack(s0, ap, [instant("Quick Spell", "{U}"), sorcery("Pricey Spell", "{4}{U}"), elf]) as [string, string, string];
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3));
    s = until(s, (x) => offered(x).length > 0);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["hand", "hand"]);
  });

  it("Epic Experiment: cast several, then the rest go to your graveyard, the land and the too-costly one too", () => {
    const { s: s0, ap, ids } = setup([experiment]);
    const forest = card("Forest", "Basic Land — Forest");
    const [one, two, big, land] = stack(s0, ap, [sorcery("One Spell", "{U}"), instant("Two Spell", "{1}{U}"), sorcery("Pricey Spell", "{4}{U}"), forest]) as [string, string, string, string];
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4));
    s = until(s, (x) => offered(x).length > 0);
    expect(offered(s)).toEqual(expect.arrayContaining([one, two, "none"]));
    expect(offered(s)).not.toContain(big);
    s = castPick(s, ap, one);
    s = castPick(s, ap, two);
    expect(s.pending).toBeNull();
    expect([s.objects[big]!.zone, s.objects[land]!.zone]).toEqual(["graveyard", "graveyard"]);
    expect(s.stack.map((x) => x.description)).toEqual(["One Spell", "Two Spell"]);
  });

  it("Collected Conjuring: up to two sorceries of mana value 3 or less; the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([conjuring]);
    const six = stack(s0, ap, [sorcery("One Spell", "{U}"), sorcery("Two Spell", "{1}{U}"), sorcery("Three Spell", "{2}{U}"), instant("Quick Spell", "{U}"), sorcery("Pricey Spell", "{4}{U}"), elf]);
    const libSize = s0.players[ap]!.library.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => offered(x).length > 0);
    expect(offered(s)).toEqual([six[0], six[1], six[2], "none"]);
    s = castPick(s, ap, six[0]!);
    s = castPick(s, ap, six[2]!);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.length).toBe(libSize - 2);
    expect(new Set(s.players[ap]!.library.slice(-4))).toEqual(new Set([six[1], six[3], six[4], six[5]]));
  });
});
