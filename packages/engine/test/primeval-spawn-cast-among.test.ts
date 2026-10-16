// Primeval Spawn: "If this creature would enter and it wasn't cast or no mana was spent to cast it, exile it instead"
// (CR 614.1a, judged with the abilities it would have there, 614.12), and "exile the top ten cards of your library. You
// may cast any number of spells with total mana value 10 or less from among them without paying their mana costs":
// one after another as it resolves, the last one cast resolving first (rulings). Villainous Wealth: "with mana value X
// or less" each, from an opponent's library.

import { describe, expect, it } from "vitest";
import { act, card, passAll, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const spawn = card("Primeval Spawn", "Creature — Avatar", "{5}{W}{U}{B}{R}{G}", { power: "10", toughness: "10", keywords: ["Vigilance", "Trample", "Lifelink"], oracleText: "If this creature would enter and it wasn't cast or no mana was spent to cast it, exile it instead.\nVigilance, trample, lifelink\nWhen this creature leaves the battlefield, exile the top ten cards of your library. You may cast any number of spells with total mana value 10 or less from among them without paying their mana costs." });
const wealth = card("Villainous Wealth", "Sorcery", "{X}{B}{G}{U}", { oracleText: "Target opponent exiles the top X cards of their library. You may cast any number of spells with mana value X or less from among them without paying their mana costs." });

const five = card("Five Drop", "Sorcery", "{4}{R}", { oracleText: "Draw a card." });
const four = card("Four Drop", "Creature — Ogre", "{3}{G}", { power: "4", toughness: "4" });
const three = card("Three Drop", "Creature — Elf", "{2}{G}", { power: "3", toughness: "3" });
const forest = card("Forest", "Basic Land — Forest");

function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Pass priority until a prompt or an empty stack. */
function until(s: GameState, done: (s: GameState) => boolean) {
  for (let i = 0; i < 80 && !done(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
/** Choose `id` and cast it with no targets. */
function castPick(s: GameState, pid: PlayerId, id: string) {
  s = act(s, { type: "chooseOption", player: pid, choice: id });
  expect(s.pending).toMatchObject({ kind: "castFree", objectId: id });
  return run(s, planCast(s, pid, id));
}

describe("Primeval Spawn, and casting spells from among exiled cards", () => {
  it("parse", () => {
    supported(spawn, wealth);
    expect(compileCard(spawn).exileUnlessCastWithMana).toBe(true);
    expect(compileCard(spawn).triggers[0]!.body.effects[0]).toMatchObject({ type: "castFromAmong", n: 10, totalMv: 10 });
    expect(compileCard(wealth).spell!.effects[0]).toMatchObject({ type: "castFromAmong", maxMv: { count: { kind: "x" } } });
  });

  it("cast with mana, it enters", () => {
    const { s: s0, ap, ids } = setup([spawn]);
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("put onto the battlefield without being cast, it's exiled instead, and its leaves ability doesn't trigger", () => {
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, spawn);
    moveObject(s, id, "graveyard");
    s.triggerQueue = [];
    const top = s.players[ap]!.library[0];
    moveObject(s, id, "battlefield");
    expect(s.objects[id]!.zone).toBe("exile");
    expect(s.triggerQueue).toHaveLength(0);
    expect(s.players[ap]!.library[0]).toBe(top);
  });

  it("leaves: cast spells with total mana value 10 or less from the top ten, the last cast resolving first", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, spawn);
    const ids = [onTop(s0, ap, forest), onTop(s0, ap, three), onTop(s0, ap, four), onTop(s0, ap, five)];
    const [land, t3, t4, t5] = ids as [string, string, string, string];
    moveObject(s0, id, "graveyard");
    let s = until(s0, (x) => !!s0 && offered(x).length > 0);
    // The land can't be cast.
    expect(offered(s)).toEqual(expect.arrayContaining([t3, t4, t5, "none"]));
    expect(offered(s)).not.toContain(land);
    s = castPick(s, ap, t5);
    // 5 of 10 left: both creatures still fit.
    expect(offered(s)).toEqual(expect.arrayContaining([t3, t4]));
    s = castPick(s, ap, t4);
    // 1 left: nothing fits, so it's over.
    expect(s.pending).toBeNull();
    expect(s.stack.map((x) => x.description)).toEqual(["Five Drop", "Four Drop"]);
    expect(s.objects[t3]!.zone).toBe("exile");
    expect(s.objects[land]!.zone).toBe("exile");
    s = until(s, (x) => x.stack.length === 0);
    expect(s.objects[t4]!.zone).toBe("battlefield");
  });

  it("Done stops early; a card cast this way for free doesn't make a Primeval Spawn enter (no mana was spent)", () => {
    const { s: s0, ap, ids, opp } = setup([wealth]);
    const theirSpawn = onTop(s0, opp, spawn);
    const theirFive = onTop(s0, opp, five);
    // Villainous Wealth for X = 10: mana value 10 or less each, from the opponent's library.
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 10));
    s = until(s, (x) => offered(x).length > 0);
    expect(offered(s)).toEqual(expect.arrayContaining([theirSpawn, theirFive]));
    s = castPick(s, ap, theirSpawn);
    s = until(s, (x) => offered(x).length > 0 || !x.stack.length);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.objects[theirFive]!.zone).toBe("exile");
    s = until(s, (x) => x.stack.length === 0);
    expect(s.objects[theirSpawn]!.zone).toBe("exile");
    expect(s.log.some((l) => /Primeval Spawn is exiled instead of entering: no mana was spent to cast it/.test(l.text))).toBe(true);
  });

  it("Villainous Wealth: only spells with mana value X or less", () => {
    const { s: s0, ap, ids, opp } = setup([wealth]);
    const big = onTop(s0, opp, five);
    const small = onTop(s0, opp, three);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 3));
    s = until(s, (x) => offered(x).length > 0);
    expect(offered(s)).toEqual([small, "none"]);
    expect(s.objects[big]!.zone).toBe("exile");
  });
});
