// Round 93, smaller cards: Forgotten Ancient (move any number of its +1/+1 counters onto other creatures, chosen as it
// resolves: rulings), Demolition Field (that land's controller may search for a basic land, then you may).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { activate } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const ancient = card("Forgotten Ancient", "Creature — Elemental", "{3}{G}", { power: "0", toughness: "3", oracleText: "Whenever a player casts a spell, you may put a +1/+1 counter on this creature.\nAt the beginning of your upkeep, you may move any number of +1/+1 counters from this creature onto other creatures." });
const demolition = card("Demolition Field", "Land", "", { oracleText: "{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. That land's controller may search their library for a basic land card, put it onto the battlefield, then shuffle. You may search your library for a basic land card, put it onto the battlefield, then shuffle." });
const dual = card("Tropical Island", "Land — Forest Island", "", { oracleText: "({T}: Add {G} or {U}.)" });

const step = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });

describe("Forgotten Ancient", () => {
  it("parse", () => expect(isFullySupported(ancient)).toBe(true));

  it("moves some of its counters onto other creatures, anyone's, at the beginning of your upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, ancient);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[a]!.counters = { "+1/+1": 4 };
    let s = passUntil(s0, "upkeep", ap);
    for (let i = 0; i < 400 && !(s.pending?.kind === "chooseMay" && s.activePlayer === ap && s.step === "upkeep"); i++) s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: s.pending.player, yes: false }) : step(passUntil(s, "upkeep", ap));
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "distribute", total: 4, move: true });
    expect(s.pending?.kind === "distribute" && [...s.pending.options].sort()).toEqual([mine, theirs].sort());
    expect(() => act(s, { type: "distribute", player: ap, parts: { [mine]: 5 } })).toThrow(/at most 4/);
    s = act(s, { type: "distribute", player: ap, parts: { [mine]: 2, [theirs]: 1 } });
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Demolition Field", () => {
  it("parse", () => expect(isFullySupported(demolition)).toBe(true));

  it("destroys a nonbasic land; its controller, then you, may search for a basic land", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, demolition);
    const t = putOnBattlefield(s0, opp, dual);
    const oppLands = s0.battlefield.filter((id) => s0.objects[id]!.controller === opp).length;
    const myLands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).length;
    let s = activate(s0, ap, f, 0, [target(t)]);
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: p.cards.slice(0, 1) });
      else if (!p) s = step(s);
      else throw new Error(`unexpected ${p.kind}`);
    }
    expect(s.objects[t]!.zone).toBe("graveyard");
    expect(s.objects[f]!.zone).toBe("graveyard");
    // Each got a Forest: the opponent's land count is back, yours is one less (the Field) plus one.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp).length).toBe(oppLands);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(myLands);
  });
});
