// Round 93, smaller cards: Forgotten Ancient (move any number of its +1/+1 counters onto other creatures, chosen as it
// resolves: rulings), Demolition Field (that land's controller may search for a basic land, then you may).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { activate } from "./helpers";
import { isFullySupported, parseManaCost, planMana, waitingOn, type GameState } from "../src";

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

const mondrak = card("Mondrak, Glory Dominus", "Legendary Creature — Phyrexian Horror", "{2}{W}{W}", { power: "4", toughness: "4", oracleText: "If one or more tokens would be created under your control, twice that many of those tokens are created instead.\n{1}{W/P}{W/P}, Sacrifice two other artifacts and/or creatures: Put an indestructible counter on Mondrak. ({W/P} can be paid with either {W} or 2 life.)" });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const ripples = card("Ripples of Undeath", "Enchantment", "{1}{B}", { keywords: ["Mill"], oracleText: "At the beginning of your first main phase, mill three cards. Then you may pay {1} and 3 life. If you do, put a card from among those cards into your hand." });

describe("Mondrak, Glory Dominus", () => {
  it("parse", () => expect(isFullySupported(mondrak)).toBe(true));

  it("sacrifices two other artifacts and/or creatures, not itself", async () => {
    const { planActivate, abilityProblem } = await import("../src");
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mondrak);
    const b = putOnBattlefield(s0, ap, bear());
    const o = putOnBattlefield(s0, ap, ornithopter);
    expect(abilityProblem(s0, ap, m, 0, undefined, undefined, undefined, undefined, { sacrifice: [m, b] })).not.toBeNull();
    const plan = planActivate(s0, ap, m, 0, undefined, undefined, undefined, undefined, { sacrifice: [b, o] });
    expect(plan).not.toBeNull();
    let s = plan!.reduce((x, a) => act(x, a), s0);
    for (let i = 0; i < 10 && s.stack.length; i++) s = step(s);
    expect([s.objects[b]!.zone, s.objects[o]!.zone]).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[m]!.counters.indestructible).toBe(1);
  });
});

describe("Ripples of Undeath", () => {
  it("parse", () => expect(isFullySupported(ripples)).toBe(true));

  it("mills three; pay {1} and 3 life to put one of those cards into your hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ripples);
    let s = passUntil(s0, "upkeep", ap);
    const older = [...s.players[ap]!.graveyard];
    s = passUntil(s, "main1", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = step(s);
    const milled = s.players[ap]!.graveyard.filter((id) => !older.includes(id));
    expect(milled.length).toBe(3);
    expect(s.pending?.kind).toBe("chooseMay");
    const life = s.players[ap]!.life;
    for (const a of planMana(s, ap, parseManaCost("{1}"))!) s = act(s, a);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([...milled].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [milled[0]!] });
    expect(s.objects[milled[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life - 3);
  });
});
