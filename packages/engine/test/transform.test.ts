// Transforming double-faced cards (CR 701.27, 712): "transform ~" turns the permanent over (701.27a), only once for an
// ability put on the stack before it last transformed (701.27f); a back face has its front face's mana value (712.8e);
// werewolves transform at the beginning of each upkeep by last turn's spells; daybound and nightbound permanents
// transform only as day and night change (702.145, 731); a Saga can return transformed (712.14a); disturb casts the
// card transformed from a graveyard (702.146).

import { describe, expect, it } from "vitest";
import { act, card, island, passUntil, plainsCard, pt, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { defOf, graveyardWays, isFullySupported, objHasKeyword, planActivate, planCast, spellManaValue, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { transformPermanent } from "../src/effects/run-permanents";
import { defMv } from "../src/faces";

// Real oracle text (Scryfall).
const gargoyle = scry(
  "transform",
  [
    { name: "Thraben Gargoyle", mana_cost: "{1}", type_line: "Artifact Creature — Gargoyle", oracle_text: "Defender\n{6}: Transform this creature.", power: "2", toughness: "2" },
    { name: "Stonewing Antagonizer", type_line: "Artifact Creature — Gargoyle Horror", oracle_text: "Flying", power: "4", toughness: "2" },
  ],
  { keywords: ["Flying", "Transform", "Defender"] },
);
const shepherd = scry(
  "transform",
  [
    { name: "Gatstaf Shepherd", mana_cost: "{1}{G}", type_line: "Creature — Human Werewolf", oracle_text: "At the beginning of each upkeep, if no spells were cast last turn, transform this creature.", power: "2", toughness: "2" },
    {
      name: "Gatstaf Howler",
      type_line: "Creature — Werewolf",
      oracle_text: "Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature.",
      power: "3",
      toughness: "3",
    },
  ],
  { keywords: ["Transform", "Intimidate"] },
);
const hauler = scry(
  "transform",
  [
    { name: "Tireless Hauler", mana_cost: "{4}{G}", type_line: "Creature — Human Werewolf", oracle_text: "Vigilance\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", power: "4", toughness: "5" },
    { name: "Dire-Strain Brawler", type_line: "Creature — Werewolf", oracle_text: "Vigilance\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)", power: "6", toughness: "6" },
  ],
  { keywords: ["Vigilance", "Transform", "Daybound", "Nightbound"] },
);
const era = scry(
  "transform",
  [
    { name: "Era of Enlightenment", mana_cost: "{1}{W}", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Scry 2.\nII — You gain 2 life.\nIII — Exile this Saga, then return it to the battlefield transformed under your control." },
    { name: "Hand of Enlightenment", type_line: "Enchantment Creature — Human Monk", oracle_text: "First strike", power: "2", toughness: "2" },
  ],
  { keywords: ["Transform", "First strike", "Scry"] },
);
const beggar = scry(
  "transform",
  [
    { name: "Beloved Beggar", mana_cost: "{1}{W}", type_line: "Creature — Human Peasant", oracle_text: "Disturb {4}{W}{W} (You may cast this card from your graveyard transformed for its disturb cost.)", power: "0", toughness: "4" },
    { name: "Generous Soul", type_line: "Creature — Spirit", oracle_text: "Flying, vigilance\nIf Generous Soul would be put into a graveyard from anywhere, exile it instead.", power: "4", toughness: "4" },
  ],
  { keywords: ["Flying", "Vigilance", "Transform", "Disturb"] },
);
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Draw a card." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** On to `pid`'s next upkeep, with what triggers there resolved. */
const nextUpkeep = (s: GameState, pid: PlayerId) => settle(passUntil(s.activePlayer === pid ? passUntil(s, "end", pid) : s, "upkeep", pid));
const toGraveyard = (s: GameState, id: string) => {
  const o = s.objects[id]!;
  const p = s.players[o.owner]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  o.zone = "graveyard";
};
const name = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;

describe("transforming double-faced cards", () => {
  it("compile", () => {
    for (const d of [gargoyle, shepherd, hauler, era, beggar] as CardDef[]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Thraben Gargoyle transforms for {6}, keeps mana value 1, and turns back to its front face when it leaves", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const g = putOnBattlefield(s0, ap, gargoyle);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(run(s0, planActivate(s0, ap, g, 0)));
    expect(name(s, g)).toBe("Stonewing Antagonizer");
    expect(s.objects[g]!.face).toBe(1);
    expect(pt(s, g)).toBe("4/2");
    expect(objHasKeyword(s, s.objects[g]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[g]!, "Defender")).toBe(false);
    // CR 712.8e: the back face's mana value is the front face's.
    expect(defMv(defOf(s, s.objects[g]!))).toBe(1);
    expect(s.log.some((l) => l.text === "Thraben Gargoyle transforms into Stonewing Antagonizer.")).toBe(true);
    // The back face has no transform ability: the activation is gone.
    expect(planActivate(s, ap, g, 0)).toBeNull();
    // Destroyed, it's a front-face-up card in the graveyard (CR 712.8a).
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: g }])));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[g]!.face).toBeUndefined();
    expect(name(s, g)).toBe("Thraben Gargoyle");
  });

  it("two activations on the stack transform it only once (CR 701.27f)", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gargoyle);
    let s = run(s0, planActivate(s0, ap, g, 0));
    s = run(s, planActivate(s, ap, g, 0));
    expect(s.stack).toHaveLength(2);
    s = settle(s);
    expect(s.objects[g]!.face).toBe(1);
    expect(s.objects[g]!.transforms).toBe(1);
  });

  it("Gatstaf Shepherd: a turn with no spells transforms it, a turn with two spells by one player transforms it back", () => {
    const { s: s0, ap, ids } = setup([opt, opt]);
    const w = putOnBattlefield(s0, ap, shepherd);
    // No spells this turn: at the next upkeep it transforms.
    let s = nextUpkeep(s0, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(name(s, w)).toBe("Gatstaf Howler");
    expect(pt(s, w)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[w]!, "Intimidate")).toBe(true);
    // On to our next turn with no spells cast; it stays a Howler (its back face looks for two spells).
    s = settle(passUntil(s, "main1", ap));
    expect(name(s, w)).toBe("Gatstaf Howler");
    // We cast two spells: at the next upkeep it transforms back.
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    s = nextUpkeep(s, s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(name(s, w)).toBe("Gatstaf Shepherd");
    expect(s.objects[w]!.face).toBeUndefined();
  });

  it("a werewolf doesn't transform after a turn with one spell, nor after one spell each by two players (ruling)", () => {
    const { s: s0, ap, ids, opp } = setup([opt, opt]);
    const w = putOnBattlefield(s0, ap, shepherd);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = nextUpkeep(s, opp);
    expect(name(s, w)).toBe("Gatstaf Shepherd");
    // Back face up; in our turn we cast one spell and an opponent casts one.
    expect(transformPermanent(s, s.objects[w]!)).toBe(true);
    s = settle(passUntil(s, "main1", ap));
    const theirs = putOnBattlefield(s, opp, opt);
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "hand";
    s.players[opp]!.hand.push(theirs);
    putOnBattlefield(s, opp, island);
    s = run(s, planCast(s, ap, ids[1]!));
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, opp, theirs)));
    expect(s.castThisTurn?.length).toBe(2);
    s = nextUpkeep(s, opp);
    expect(name(s, w)).toBe("Gatstaf Howler");
  });

  it("day and night: Tireless Hauler makes it day; a turn with no spells makes it night and it transforms; two spells make it day again", () => {
    const { s: s0, ap, ids } = setup([opt, opt]);
    const h = putOnBattlefield(s0, ap, hauler);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // CR 702.145d: with a daybound permanent and neither day nor night, it becomes day.
    expect(s.dayNight).toBe("day");
    expect(name(s, h)).toBe("Tireless Hauler");
    // One spell this turn: still day next turn.
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = nextUpkeep(s, next);
    expect(s.dayNight).toBe("day");
    // The next player casts nothing: night at the following untap step, and it transforms (702.145c).
    const after = s.turnOrder[(s.turnOrder.indexOf(next) + 1) % 4]!;
    s = nextUpkeep(s, after);
    expect(s.dayNight).toBe("night");
    expect(name(s, h)).toBe("Dire-Strain Brawler");
    expect(pt(s, h)).toBe("6/6");
    expect(s.log.some((l) => l.text === "Day becomes night.")).toBe(true);
    // Nothing else transforms it (702.145b, e).
    expect(transformPermanent(s, s.objects[h]!)).toBe(false);
    expect(s.objects[h]!.face).toBe(1);
    // Our turn: two spells make it day at the next untap step (731.2b).
    s = settle(passUntil(s, "main1", ap));
    expect(s.dayNight).toBe("night");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    const third = putOnBattlefield(s, ap, opt);
    s.battlefield.splice(s.battlefield.indexOf(third), 1);
    s.objects[third]!.zone = "hand";
    s.players[ap]!.hand.push(third);
    s = settle(run(s, planCast(s, ap, third)));
    s = nextUpkeep(s, next);
    expect(s.dayNight).toBe("day");
    expect(name(s, h)).toBe("Tireless Hauler");
  });

  it("a daybound permanent enters transformed at night (CR 702.145c)", () => {
    const { s: s0, ap, ids } = setup([hauler]);
    s0.dayNight = "night";
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(name(s, ids[0]!)).toBe("Dire-Strain Brawler");
  });

  it("Era of Enlightenment's chapter III returns it transformed, a 2/2 first strike creature (CR 712.14a)", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, era);
    s0.objects[e]!.counters.lore = 2;
    const s = settle(passUntil(passUntil(s0, "end", ap), "main1", ap));
    const o = s.objects[e]!;
    expect(o.zone).toBe("battlefield");
    expect(o.face).toBe(1);
    expect(name(s, e)).toBe("Hand of Enlightenment");
    expect(pt(s, e)).toBe("2/2");
    expect(objHasKeyword(s, o, "First strike")).toBe(true);
    // A creature now, not a Saga: no lore counters keep it, and it isn't sacrificed.
    expect(o.counters.lore ?? 0).toBe(0);
  });

  it("disturb: Beloved Beggar cast from the graveyard as Generous Soul, mana value 2, exiled when it would die", () => {
    const { s: s0, ap, ids } = setup([beggar, murder]);
    const [b, m] = [ids[0]!, ids[1]!];
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    toGraveyard(s0, b);
    expect(graveyardWays(s0, s0.objects[b]!)).toEqual([expect.objectContaining({ kind: "disturb", face: 1 })]);
    let s = run(s0, planCast(s0, ap, b, undefined, undefined, "auto", undefined, { face: 1, via: "disturb" }));
    const item = s.stack.find((x) => x.objectId === b)!;
    expect(name(s, b)).toBe("Generous Soul");
    // CR 712.8e: a transforming card's back face has the front face's mana value.
    expect(spellManaValue(s, item)).toBe(2);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(pt(s, b)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
    s = settle(run(s, planCast(s, ap, m, [{ kind: "object", id: b }])));
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("disturb: a Generous Soul spell countered is exiled; from hand it's cast as Beloved Beggar", () => {
    const { s: s0, ap, ids } = setup([beggar, counterspell, beggar]);
    const [b, cs, inHand] = [ids[0]!, ids[1]!, ids[2]!];
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, plainsCard);
    toGraveyard(s0, b);
    let s = run(s0, planCast(s0, ap, b, undefined, undefined, "auto", undefined, { face: 1, via: "disturb" }));
    s = run(s, planCast(s, ap, cs, [{ kind: "stack", id: s.stack.find((x) => x.objectId === b)!.id }]));
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("exile");
    // From hand: the front face, for its own cost.
    s = settle(run(s, planCast(s, ap, inHand)));
    expect(name(s, inHand)).toBe("Beloved Beggar");
    expect(pt(s, inHand)).toBe("0/4");
  });
});
