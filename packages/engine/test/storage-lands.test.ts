// Storage lands and depletion lands. "{T}, Remove any number of storage counters from this land: Add {B} for each
// storage counter removed this way" and "{1}, Remove X storage counters from this land: Add X mana in any combination
// of {W} and/or {U}": how many are removed is announced as the ability is activated (CR 107.3a, 601.2b, 602.2b), and
// it's still a mana ability (CR 605.1a). Depletion lands put a counter on or take one off as they make mana, and some
// don't untap while they have one (CR 502.3).

import { describe, expect, it } from "vitest";
import { act, activate, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { availableMana, botActions, isFullySupported, manaOptions, moveObject, planCast, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const vault = card("Bottomless Vault", "Land", "", {
  oracleText:
    "This land enters tapped.\nYou may choose not to untap this land during your untap step.\nAt the beginning of your upkeep, if this land is tapped, put a storage counter on it.\n{T}, Remove any number of storage counters from this land: Add {B} for each storage counter removed this way.",
});
const pools = card("Calciform Pools", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{1}, Remove X storage counters from this land: Add X mana in any combination of {W} and/or {U}." });
const fountain = card("Fountain of Cho", "Land", "", { oracleText: "This land enters tapped.\n{T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {W} for each storage counter removed this way." });
const woodlot = card("Hickory Woodlot", "Land", "", { oracleText: "This land enters tapped with two depletion counters on it.\n{T}, Remove a depletion counter from this land: Add {G}{G}. If there are no depletion counters on this land, sacrifice it." });
const landCap = card("Land Cap", "Land", "", { oracleText: "This land doesn't untap during your untap step if it has a depletion counter on it.\nAt the beginning of your upkeep, remove a depletion counter from this land.\n{T}: Add {W} or {U}. Put a depletion counter on this land." });
const crucible = card("Crucible of the Spirit Dragon", "Land", "", {
  oracleText: "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{T}, Remove X storage counters from this land: Add X mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons.",
});
const city = card("City of Shadows", "Land", "", { oracleText: "{T}, Exile a creature you control: Put a storage counter on this land.\n{T}: Add {C} for each storage counter on this land." });
const ritual = card("Dark Ritual", "Instant", "{B}");
const manabarbs = card("Manabarbs", "Enchantment", "{3}{R}", { oracleText: "Whenever a player taps a land for mana, this enchantment deals 1 damage to that player." });

/** A game where `pid` controls none of their basic lands: they're moved to the graveyard. */
function bare(hand: CardDef[] = []): { s: GameState; ap: PlayerId; ids: ObjectId[] } {
  const { s, ap, ids } = setup(hand);
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap) moveObject(s, id, "graveyard");
  return { s, ap, ids };
}

/** Pass until `pid`'s next untap step, where they choose what stays tapped (or past it, if nothing can). */
const toUntap = (s: GameState, pid: PlayerId) => passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "untap", pid);
const pool = (s: GameState, pid: PlayerId) => s.players[pid]!.manaPool;

describe("storage lands", () => {
  it("parses; Crucible's any combination of colors and City of Shadows' exile cost stay unsupported", () => {
    for (const d of [vault, pools, fountain, woodlot, landCap]) expect(isFullySupported(d), d.name).toBe(true);
    for (const d of [crucible, city]) expect(isFullySupported(d), d.name).toBe(false);
  });

  it("removes as many storage counters as you choose, for that much mana", () => {
    const { s, ap } = bare();
    const v = putOnBattlefield(s, ap, vault);
    s.objects[v]!.counters.storage = 3;
    const options = manaOptions(s, s.objects[v]!);
    expect(options.map((x) => [x.removes, x.adds.join("")])).toEqual([
      [0, ""],
      [1, "B"],
      [2, "BB"],
      [3, "BBB"],
    ]);
    putOnBattlefield(s, ap, manabarbs);
    const s1 = act(s, { type: "activateMana", player: ap, objectId: v, mana: "B", ability: 0, combo: 2 });
    expect(pool(s1, ap).B).toBe(2);
    expect(s1.triggerQueue).toHaveLength(1); // tapped for mana: Manabarbs
    expect(s1.objects[v]!.counters.storage).toBe(1);
    expect(s1.objects[v]!.tapped).toBe(true);
    expect(s1.log.some((l) => /removes 2 storage counters from Bottomless Vault/.test(l.text))).toBe(true);
    // The number has to be chosen, and can't be more than it has.
    expect(() => act(s, { type: "activateMana", player: ap, objectId: v, mana: "B", ability: 0 })).toThrow(/choose which mana/);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: v, mana: "B", ability: 0, combo: 4 })).toThrow(/choose which mana/);
  });

  it("can be tapped removing none, and stores a counter at each upkeep it stays tapped", () => {
    const { s, ap } = bare();
    const v = putOnBattlefield(s, ap, vault);
    putOnBattlefield(s, ap, manabarbs);
    const life = s.players[ap]!.life;
    let s1 = act(s, { type: "activateMana", player: ap, objectId: v, mana: "B", ability: 0, combo: 0 });
    expect(s1.objects[v]!.tapped).toBe(true);
    expect(pool(s1, ap).B).toBe(0);
    // No mana, so it wasn't tapped for mana (CR 106.12a, rulings on Bottomless Vault): Manabarbs doesn't trigger.
    expect(s1.triggerQueue).toHaveLength(0);
    expect(passAll(s1).players[ap]!.life).toBe(life);
    s1 = toUntap(s1, ap);
    expect(s1.pending).toMatchObject({ kind: "pickPermanents", action: "keepTapped", options: [v] });
    s1 = act(s1, { type: "pickPermanents", player: ap, ids: [v] });
    s1 = passUntil(s1, "draw", ap);
    expect(s1.objects[v]!.counters.storage).toBe(1);
    // Untapped, it gets none (the trigger's "if": CR 603.4).
    s1 = toUntap(s1, ap);
    s1 = act(s1, { type: "pickPermanents", player: ap, ids: [] });
    s1 = passUntil(s1, "draw", ap);
    expect(s1.objects[v]!.tapped).toBe(false);
    expect(s1.objects[v]!.counters.storage).toBe(1);
  });

  it("a bot keeps a storage land tapped until it has three counters", () => {
    const { s, ap } = bare();
    const v = putOnBattlefield(s, ap, vault);
    s.objects[v]!.tapped = true;
    s.objects[v]!.counters.storage = 2;
    let s1 = toUntap(s, ap);
    expect(botActions(s1, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [v] }]);
    s1.objects[v]!.counters.storage = 3;
    expect(botActions(s1, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [] }]);
  });

  it("Calciform Pools: {1}, Remove X: X mana split between {W} and {U}, without tapping", () => {
    const { s, ap } = bare();
    const p = putOnBattlefield(s, ap, pools);
    s.objects[p]!.counters.storage = 3;
    const options = manaOptions(s, s.objects[p]!).filter((x) => x.ability === 1);
    expect(options.map((x) => x.adds.join(""))).toEqual(["W", "U", "WW", "WU", "UU", "WWW", "WWU", "WUU", "UUU"]);
    // {1} first: {C} from the pools itself.
    let s1 = act(s, { type: "activateMana", player: ap, objectId: p, mana: "C", ability: 0 });
    const wu = options.find((x) => x.adds.join("") === "WU")!;
    s1 = act(s1, { type: "activateMana", player: ap, objectId: p, mana: wu.mana, ability: 1, combo: wu.combo });
    expect(pool(s1, ap)).toMatchObject({ W: 1, U: 1, C: 0 });
    expect(s1.objects[p]!.counters.storage).toBe(1);
  });

  it("Calciform Pools: needs a counter, and {1}, {T} stores one", () => {
    const { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, pools);
    expect(manaOptions(s, s.objects[p]!).filter((x) => x.ability === 1)).toEqual([]);
    const s1 = activate(s, ap, p, 0);
    expect(s1.objects[p]!.counters.storage).toBe(1);
    expect(s1.objects[p]!.tapped).toBe(true);
  });

  it("autopay takes one storage counter at a time, and only when nothing else will do", () => {
    const { s, ap, ids } = bare([ritual]);
    const v = putOnBattlefield(s, ap, vault);
    s.objects[v]!.counters.storage = 3;
    expect(availableMana(s, ap)).toBe(1);
    let s1 = s;
    for (const a of planCast(s, ap, ids[0]!)!) s1 = act(s1, a);
    expect(s1.stack).toHaveLength(1);
    expect(s1.objects[v]!.counters.storage).toBe(2);
  });

  it("Fountain of Cho: {T} stores a counter; {T}, Remove any number makes {W}", () => {
    const { s, ap } = bare();
    const f = putOnBattlefield(s, ap, fountain);
    let s1 = activate(s, ap, f, 0);
    expect(s1.objects[f]!.counters.storage).toBe(1);
    s1.objects[f]!.tapped = false;
    s1 = act(s1, { type: "activateMana", player: ap, objectId: f, mana: "W", ability: 0, combo: 1 });
    expect(pool(s1, ap).W).toBe(1);
    expect(s1.objects[f]!.counters.storage).toBe(0);
  });
});

describe("depletion lands", () => {
  it("Hickory Woodlot: {G}{G} for a counter, sacrificed when the last is gone", () => {
    const { s, ap } = bare();
    const w = putOnBattlefield(s, ap, woodlot);
    s.objects[w]!.counters.depletion = 2;
    let s1 = act(s, { type: "activateMana", player: ap, objectId: w, mana: "G" });
    expect(pool(s1, ap).G).toBe(2);
    expect(s1.objects[w]!.zone).toBe("battlefield");
    expect(s1.objects[w]!.counters.depletion).toBe(1);
    s1.objects[w]!.tapped = false;
    s1 = act(s1, { type: "activateMana", player: ap, objectId: w, mana: "G" });
    expect(pool(s1, ap).G).toBe(4);
    expect(s1.objects[w]!.zone).toBe("graveyard");
    // With none, it can't be activated at all.
    const { s: s2, ap: ap2 } = bare();
    const w2 = putOnBattlefield(s2, ap2, woodlot);
    expect(() => act(s2, { type: "activateMana", player: ap2, objectId: w2, mana: "G" })).toThrow();
  });

  it("Land Cap: a counter for each use, and it stays tapped until the upkeep takes it off", () => {
    const { s, ap } = bare();
    const l = putOnBattlefield(s, ap, landCap);
    let s1 = act(s, { type: "activateMana", player: ap, objectId: l, mana: "U" });
    expect(pool(s1, ap).U).toBe(1);
    expect(s1.objects[l]!.counters.depletion).toBe(1);
    // Its untap step: it has a counter, so it doesn't untap; its upkeep removes the counter.
    s1 = passUntil(act(s1, { type: "passPriority", player: waitingOn(s1)! }), "draw", ap);
    expect(s1.objects[l]!.tapped).toBe(true);
    expect(s1.objects[l]!.counters.depletion).toBe(0);
    // The next one, it untaps.
    s1 = passUntil(act(s1, { type: "passPriority", player: waitingOn(s1)! }), "upkeep", ap);
    expect(s1.objects[l]!.tapped).toBe(false);
  });
});
