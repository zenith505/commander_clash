// Round 107, more popular cards: Insurrection, Bennie Bracks ("if you created a token this turn"), Dragon's Rage
// Channeler ("gets +2/+2, has flying, and attacks each combat if able") and Fists of Flame ("until end of turn, target
// creature gains trample and gets +1/+0 for each card you've drawn this turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, island, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { attackProblem, characteristics, controllerOf, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const insurrection = card("Insurrection", "Sorcery", "{5}{R}{R}{R}", { oracleText: "Untap all creatures and gain control of them until end of turn. They gain haste until end of turn." });
const bennie = card("Bennie Bracks, Zoologist", "Legendary Creature — Elf Druid", "{3}{W}", { power: "3", toughness: "2", keywords: ["Convoke"], oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nAt the beginning of each end step, if you created a token this turn, draw a card." });
const drc = card("Dragon's Rage Channeler", "Creature — Human Shaman", "{R}", { power: "1", toughness: "1", keywords: ["Delirium", "Surveil"], oracleText: "Whenever you cast a noncreature spell, surveil 1. (Look at the top card of your library. You may put that card into your graveyard.)\nDelirium — As long as there are four or more card types among cards in your graveyard, this creature gets +2/+2, has flying, and attacks each combat if able." });
const fists = card("Fists of Flame", "Instant", "{1}{R}", { oracleText: "Draw a card. Until end of turn, target creature gains trample and gets +1/+0 for each card you've drawn this turn. (A creature with trample can deal excess combat damage to the player or planeswalker it's attacking.)" });
// Test cards.
const saproling = card("Test Sprout", "Sorcery", "{G}", { oracleText: "Create a 1/1 green Saproling creature token." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { oracleText: "Draw a card." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** Move a card from its owner's hand to their graveyard. */
const discard = (s: GameState, id: string) => {
  const p = s.players[s.objects[id]!.owner]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  p.graveyard.push(id);
};

describe("Insurrection", () => {
  it("untaps every creature, gains control of all of them until end of turn, and gives them haste", () => {
    supported(insurrection);
    const { s: s0, ap, opp, ids } = setup([insurrection]);
    let s = s0;
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.tapped = true;
    const third = putOnBattlefield(s, next(s, opp), bear({ name: "Third" }));
    s = settle(cast(s, ap, ids[0]!));
    for (const id of [theirs, third]) {
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
      expect(s.objects[id]!.tapped).toBe(false);
      expect(characteristics(s, s.objects[id]!).keywords).toContain("Haste");
      expect(attackProblem(s, s.objects[id]!, opp)).toBeNull();
    }
    s = passUntil(s, "upkeep", next(s, ap));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
  });
});

describe("Bennie Bracks, Zoologist", () => {
  it("draws at the beginning of each end step if you created a token this turn", () => {
    supported(bennie);
    const { s: s0, ap, ids } = setup([saproling]);
    let s = s0;
    putOnBattlefield(s, ap, bennie);
    s = settle(cast(s, ap, ids[0]!));
    // Counted by the library (the cleanup step discards down to seven).
    const lib = (st: GameState) => st.players[ap]!.library.length;
    const before = lib(s);
    s = settle(passUntil(s, "end", ap));
    expect(lib(s)).toBe(before - 1);
    // The next player's turn: no token created this turn, so nothing.
    s = settle(passUntil(s, "end", next(s, ap)));
    expect(lib(s)).toBe(before - 1);
  });
});

describe("Dragon's Rage Channeler", () => {
  it("with four card types in your graveyard: +2/+2, flying, and it attacks each combat if able", () => {
    supported(drc);
    const { s: s0, ap, opp, ids } = setup([island, bear(), ponder, shock]);
    let s = s0;
    const d = putOnBattlefield(s, ap, drc);
    for (const id of ids.slice(0, 3)) discard(s, id);
    expect(pt(s, d)).toBe("1/1");
    discard(s, ids[3]!);
    expect(pt(s, d)).toBe("3/3");
    expect(characteristics(s, s.objects[d]!).keywords).toContain("Flying");
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/attacks each combat if able/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: opp }] });
    expect(s.objects[d]!.attacking).toBe(opp);
  });
});

describe("Fists of Flame", () => {
  it("counts the cards you've drawn this turn as it resolves, its own included, and later draws add nothing", () => {
    supported(fists);
    const { s: s0, ap, ids } = setup([ponder, fists, ponder]);
    let s = s0;
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!));
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    // Drew one in the draw step (a multiplayer game's first player draws, CR 103.8c), one with Ponder and one with
    // Fists: +3/+0, and trample.
    expect(pt(s, b)).toBe("5/2");
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Trample");
    s = settle(cast(s, ap, ids[2]!));
    expect(pt(s, b)).toBe("5/2");
  });
});
