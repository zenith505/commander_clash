// Flip cards (CR 710): a permanent that flips uses its bottom half's name, text, type line, power and toughness (710.1b,
// 710.2), keeping its color and mana cost (710.1c). Flipping is one-way, and a flipped permanent that leaves the
// battlefield is an unflipped card again (710.4).

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, card, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { botActions, characteristics, defOf, isFullySupported, objHasKeyword, objIsType, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

// Real oracle text (Scryfall).
const pupil = scry(
  "flip",
  [
    { name: "Budoka Pupil", mana_cost: "{1}{G}{G}", type_line: "Creature — Human Monk", oracle_text: "Whenever you cast a Spirit or Arcane spell, you may put a ki counter on this creature.\nAt the beginning of the end step, if there are two or more ki counters on this creature, you may flip it.", power: "2", toughness: "2" },
    { name: "Ichiga, Who Topples Oaks", type_line: "Legendary Creature — Spirit", oracle_text: "Trample\nRemove a ki counter from Ichiga: Target creature gets +2/+2 until end of turn.", power: "4", toughness: "3" },
  ],
  { keywords: ["Trample"] },
);
const homura = scry("flip", [
  { name: "Homura, Human Ascendant", mana_cost: "{4}{R}{R}", type_line: "Legendary Creature — Human Monk", oracle_text: "Homura can't block.\nWhen Homura dies, return it to the battlefield flipped.", power: "4", toughness: "4" },
  { name: "Homura's Essence", type_line: "Legendary Enchantment", oracle_text: 'Creatures you control get +2/+2 and have flying and "{R}: This creature gets +1/+0 until end of turn."' },
]);
const graverobber = scry("flip", [
  { name: "Nezumi Graverobber", mana_cost: "{1}{B}", type_line: "Creature — Rat Rogue", oracle_text: "{1}{B}: Exile target card from an opponent's graveyard. If no cards are in that graveyard, flip this creature.", power: "2", toughness: "1" },
  { name: "Nighteyes the Desecrator", type_line: "Legendary Creature — Rat Wizard", oracle_text: "{4}{B}: Put target creature card from a graveyard onto the battlefield under your control.", power: "4", toughness: "2" },
]);
const shortfang = scry("flip", [
  { name: "Nezumi Shortfang", mana_cost: "{1}{B}", type_line: "Creature — Rat Rogue", oracle_text: "{1}{B}, {T}: Target opponent discards a card. Then if that player has no cards in hand, flip this creature.", power: "1", toughness: "1" },
  { name: "Stabwhisker the Odious", type_line: "Legendary Creature — Rat Shaman", oracle_text: "At the beginning of each opponent's upkeep, that player loses 1 life for each card fewer than three in their hand.", power: "3", toughness: "3" },
]);
const initiate = scry("flip", [
  { name: "Initiate of Blood", mana_cost: "{3}{R}", type_line: "Creature — Ogre Shaman", oracle_text: "{T}: This creature deals 1 damage to target creature that was dealt damage this turn. When that creature dies this turn, flip this creature.", power: "2", toughness: "2" },
  { name: "Goka the Unjust", type_line: "Legendary Creature — Ogre Shaman", oracle_text: "{T}: Goka deals 4 damage to target creature that was dealt damage this turn.", power: "4", toughness: "4" },
]);
const runeTail = scry("flip", [
  { name: "Rune-Tail, Kitsune Ascendant", mana_cost: "{2}{W}", type_line: "Legendary Creature — Fox Monk", oracle_text: "When you have 30 or more life, flip Rune-Tail.", power: "2", toughness: "2" },
  { name: "Rune-Tail's Essence", type_line: "Legendary Enchantment", oracle_text: "Prevent all damage that would be dealt to creatures you control." },
]);
const student = scry("flip", [
  { name: "Student of Elements", mana_cost: "{1}{U}", type_line: "Creature — Human Wizard", oracle_text: "When this creature has flying, flip it.", power: "1", toughness: "1" },
  { name: "Tobita, Master of Winds", type_line: "Legendary Creature — Human Wizard", oracle_text: "Creatures you control have flying.", power: "3", toughness: "3" },
]);
const spiritSpell = card("Spirit Test", "Instant — Arcane", "{U}", { oracleText: "Draw a card." });
const ping = card("Ping Test", "Instant", "{R}", { oracleText: "Ping Test deals 1 damage to target creature." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const bear = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** Put a copy of `def` into `pid`'s graveyard. */
function inGraveyard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
}

describe("flip cards (CR 710)", () => {
  it("compile, both halves", () => {
    for (const d of [pupil, homura, graverobber, shortfang, initiate, runeTail, student]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Budoka Pupil: ki counters from Arcane spells, then flips at the end step into Ichiga, keeping its counters, cost and color", () => {
    const { s: s0, ap, ids } = setup([spiritSpell, spiritSpell]);
    const p = putOnBattlefield(s0, ap, pupil);
    let s = s0;
    for (const id of ids) {
      s = settle(run(s, planCast(s, ap, id)));
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    }
    expect(s.objects[p]!.counters?.ki).toBe(2);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(name(s, p)).toBe("Ichiga, Who Topples Oaks");
    expect(pt(s, p)).toBe("4/3");
    const c = characteristics(s, s.objects[p]!);
    expect(c.supertypes).toContain("Legendary");
    expect(c.colors).toEqual(["G"]);
    expect(objHasKeyword(s, s.objects[p]!, "Trample")).toBe(true);
    expect(s.objects[p]!.counters?.ki).toBe(2);
    expect(s.log.some((l) => l.text === "Budoka Pupil flips into Ichiga, Who Topples Oaks.")).toBe(true);
    // Ichiga's ability: remove a ki counter.
    s = activate(s, ap, p, 0, [target(p)]);
    expect(s.objects[p]!.counters?.ki).toBe(1);
    expect(pt(s, p)).toBe("6/5");
  });

  it("with fewer than two ki counters it doesn't flip; a flipped permanent that leaves is unflipped again (CR 710.4)", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pupil);
    s0.objects[p]!.counters = { ki: 1 };
    let s = settle(passUntil(s0, "end", ap));
    expect(s.pending).toBeNull();
    expect(name(s, p)).toBe("Budoka Pupil");
    s.objects[p]!.counters = { ki: 2 };
    s = passUntil(s, "end", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = settle(s);
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(name(s, p)).toBe("Ichiga, Who Topples Oaks");
    moveObject(s, p, "hand");
    expect(s.objects[p]!.face).toBeUndefined();
    expect(defOf(s, s.objects[p]!).name).toBe("Budoka Pupil");
  });

  it("Homura dies and returns flipped as Homura's Essence, an enchantment (CR 710.1b)", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const h = putOnBattlefield(s0, ap, homura);
    const b = putOnBattlefield(s0, ap, bear);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(h)])));
    expect(s.objects[h]!.zone).toBe("battlefield");
    expect(name(s, h)).toBe("Homura's Essence");
    expect(objIsType(s, s.objects[h]!, "Creature")).toBe(false);
    expect(objIsType(s, s.objects[h]!, "Enchantment")).toBe(true);
    expect(pt(s, b)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
  });

  it("Nezumi Graverobber flips when it exiles the last card of that graveyard, not before", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, graverobber);
    const c1 = inGraveyard(s0, opp, bear);
    const c2 = inGraveyard(s0, opp, bear);
    let s = activate(s0, ap, g, 0, [target(c1)]);
    expect(s.objects[c1]!.zone).toBe("exile");
    expect(name(s, g)).toBe("Nezumi Graverobber");
    s = activate(s, ap, g, 0, [target(c2)]);
    expect(s.players[opp]!.graveyard).toHaveLength(0);
    expect(name(s, g)).toBe("Nighteyes the Desecrator");
  });

  it("Nezumi Shortfang flips once that player has no cards in hand; Stabwhisker drains for cards fewer than three", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, shortfang);
    s0.players[opp]!.hand.slice(1).forEach((id) => moveObject(s0, id, "library"));
    expect(s0.players[opp]!.hand).toHaveLength(1);
    let s = activate(s0, ap, n, 0, [{ kind: "player", id: opp }]);
    if (s.pending?.kind === "discard" || s.pending) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    expect(s.players[opp]!.hand).toHaveLength(0);
    expect(name(s, n)).toBe("Stabwhisker the Odious");
    // At the opponent's upkeep, before they draw, with no cards: 3 life.
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "upkeep", opp));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Initiate of Blood flips when the creature it damaged dies this turn, not when it dies a later turn", () => {
    const { s: s0, ap, opp, ids } = setup([ping]);
    const i = putOnBattlefield(s0, ap, initiate);
    const b = putOnBattlefield(s0, opp, bear);
    putOnBattlefield(s0, opp, bear);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)])));
    expect(s.objects[b]!.damage).toBe(1);
    s = activate(s, ap, i, 0, [target(b)]);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(name(s, i)).toBe("Goka the Unjust");

    // One that survives the turn and dies the next doesn't flip it.
    const t = setup([ping, murder]);
    const i2 = putOnBattlefield(t.s, t.ap, initiate);
    const big = putOnBattlefield(t.s, t.opp, card("Ox", "Creature — Ox", "{3}{G}", { power: "3", toughness: "4" }));
    let u = settle(run(t.s, planCast(t.s, t.ap, t.ids[0]!, [target(big)])));
    u = settle(activate(u, t.ap, i2, 0, [target(big)]));
    expect(u.objects[big]!.zone).toBe("battlefield");
    u = passUntil(passUntil(u, "main1", t.opp), "main1", t.ap);
    u = settle(run(u, planCast(u, t.ap, t.ids[1]!, [target(big)])));
    expect(u.objects[big]!.zone).toBe("graveyard");
    expect(name(u, i2)).toBe("Initiate of Blood");
  });

  it("Rune-Tail flips at 30 or more life; Student of Elements flips once it has flying (state triggers, CR 603.8)", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.life = 20;
    const r = putOnBattlefield(s0, ap, runeTail);
    const st = putOnBattlefield(s0, ap, student);
    let s = settle(passUntil(s0, "main2", ap));
    expect(name(s, r)).toBe("Rune-Tail, Kitsune Ascendant");
    s.players[ap]!.life = 30;
    addEffect(s, ap, [st], [{ kind: "addKeywords", keywords: ["Flying"] }]);
    s = settle(act(s, { type: "passPriority", player: ap }));
    expect(name(s, r)).toBe("Rune-Tail's Essence");
    expect(objIsType(s, s.objects[r]!, "Creature")).toBe(false);
    expect(name(s, st)).toBe("Tobita, Master of Winds");
    expect(pt(s, st)).toBe("3/3");
  });
});
