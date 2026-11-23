// Round 455: North Star, "{4}, {T}: For one spell this turn, you may spend mana as though it were mana of any type to pay
// that spell's mana cost. (Additional costs are still paid normally.)" (CR 609.4b): one use, for a spell its controller
// chooses as they cast it (CostChoices.anyTypeMana), for its mana cost only: a kicker's mana is paid as it is (CR 601.2f),
// and a spell cast for an alternative cost (evoke) doesn't pay its mana cost (CR 118.9).

import { describe, expect, it } from "vitest";
import { act, passAll, passUntil, putOnBattlefield, setup, mountain } from "./helpers";
import { anyTypeManaUsable, anyTypeSpellFor, botActions, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const northStar = (): CardDef => ({"oracleId": "9109437a-da80-463f-a92a-77d693d05d91", "name": "North Star", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{4}, {T}: For one spell this turn, you may spend mana as though it were mana of any type to pay that spell's mana cost. (Additional costs are still paid normally.)", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const gatekeeper = (): CardDef => ({"oracleId": "6781f8ae-2a86-4e3d-bc43-48809c9d6c26", "name": "Gatekeeper of Malakir", "manaCost": "{B}{B}", "cmc": 2, "typeLine": "Creature — Vampire Warrior", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire", "Warrior"], "oracleText": "Kicker {B} (You may pay an additional {B} as you cast this spell.)\nWhen this creature enters, if it was kicked, target player sacrifices a creature of their choice.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Kicker"], "layout": "normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const mulldrifter = (): CardDef => ({"oracleId": "24d0f5e7-0d9e-4b76-900e-a7274e80312d", "name": "Mulldrifter", "manaCost": "{4}{U}", "cmc": 5, "typeLine": "Creature — Elemental", "supertypes": [], "types": ["Creature"], "subtypes": ["Elemental"], "oracleText": "Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)", "power": "2", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying", "Evoke"], "layout": "normal"}) as CardDef;
const probe = (): CardDef => ({"oracleId": "1d67f5ff-1fce-45e5-b6a1-416c569351e2", "name": "Gitaxian Probe", "manaCost": "{U/P}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "({U/P} can be paid with either {U} or 2 life.)\nLook at target player's hand.\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const isLand = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.types.includes("Land");
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
/** Tap every land `pid` controls but `keep` of each named one: those are what's left to pay with. */
const leaveUntapped = (s: GameState, pid: PlayerId, keep: Record<string, number>) => {
  const left = { ...keep };
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller !== pid || !isLand(s, id)) continue;
    const n = nameOf(s, id);
    if ((left[n] ?? 0) > 0) {
      left[n]!--;
      o.tapped = false;
    } else o.tapped = true;
  }
  invalidateCharacteristics(s);
};

/** North Star on my battlefield, activated and resolved: one use this turn. Then only `keep` of my lands are untapped. */
function starred(hand: CardDef[], keep: Record<string, number>) {
  const { s: s0, ap, ids, opp } = setup(hand);
  for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, mountain);
  const star = putOnBattlefield(s0, ap, northStar());
  const s = passAll(run(s0, planActivate(s0, ap, star, 0)));
  expect(anyTypeSpellFor(s, ap)).toBe("North Star");
  leaveUntapped(s, ap, keep);
  return { s, ap, ids, opp, star };
}

describe("North Star (round 455)", () => {
  it("is fully supported", () => {
    expect(isFullySupported(northStar())).toBe(true);
  });

  it("lets one spell's mana cost be paid with mana of any type, chosen as it's cast; then it's used up (CR 609.4b)", () => {
    const { s: s0, ap, ids } = starred([divination(), divination()], { Mountain: 6 });
    // Three Mountains can't pay {2}{U} otherwise.
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    expect(anyTypeManaUsable(s0, ap, ids[0]!)).toBe(true);
    const hand = s0.players[ap]!.hand.length;
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { anyTypeMana: true })));
    expect(s.log.some((e) => /casts Divination, spending mana as though it were mana of any type for its mana cost \(North Star\)/.test(e.text))).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    // Used up: the second Divination can't use it, with three Mountains still untapped.
    expect(anyTypeSpellFor(s, ap)).toBeUndefined();
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { anyTypeMana: true })).toBeNull();
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { anyTypeMana: true })).toMatch(/nothing lets you spend mana as though it were mana of any type/);
  });

  it("pays only the mana cost: a kicker's {B} is paid with black mana (\"Additional costs are still paid normally\", CR 601.2f)", () => {
    const kicked = { anyTypeMana: true as const, kicks: [0] };
    const onlyMountains = starred([gatekeeper()], { Mountain: 4 });
    // {B}{B} with Mountains, but not its kicker's {B}.
    expect(planCast(onlyMountains.s, onlyMountains.ap, onlyMountains.ids[0]!, undefined, undefined, "auto", undefined, kicked)).toBeNull();
    expect(planCast(onlyMountains.s, onlyMountains.ap, onlyMountains.ids[0]!, undefined, undefined, "auto", undefined, { anyTypeMana: true })).not.toBeNull();
    const withSwamp = starred([gatekeeper()], { Mountain: 2, Swamp: 1 });
    const { s: s0, ap, ids } = withSwamp;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, kicked));
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Its kicked enters trigger asks for a target player.
    expect(s.log.some((e) => /casts Gatekeeper of Malakir.*kick/i.test(e.text))).toBe(true);
  });

  it("doesn't apply to a spell cast for an alternative cost: evoke doesn't pay the mana cost (CR 118.9)", () => {
    const { s, ap, ids } = starred([mulldrifter()], { Mountain: 6 });
    expect(anyTypeManaUsable(s, ap, ids[0]!, { alt: "evoke" })).toBe(false);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { anyTypeMana: true, alt: "evoke" })).toMatch(/only its mana cost/);
    expect(anyTypeManaUsable(s, ap, ids[0]!)).toBe(true);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { anyTypeMana: true })).not.toBeNull();
  });

  it("a Phyrexian symbol takes any mana (or 2 life) as though it were its color: Gitaxian Probe's {U/P} (CR 107.4f)", () => {
    const { s, ap, ids } = starred([probe()], { Mountain: 1 });
    const o = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, o, 0, [], {}).cost.symbols).toEqual([{ kind: "phyrexian", color: "U" }]);
    expect(spellCost(s, ap, o, 0, [], { anyTypeMana: true }).cost.symbols).toEqual([{ kind: "phyrexian", color: "U", any: true }]);
  });

  it("lasts only this turn; a bot uses it only for a spell it can't cast otherwise, and doesn't activate North Star", () => {
    const { s: s0, ap, ids } = starred([divination()], { Mountain: 3 });
    // The bot (playing for me here) casts Divination with it.
    let s = s0;
    for (let i = 0; i < 20 && !s.log.some((e) => /casts Divination/.test(e.text)); i++) s = act(s, botActions(s, waitingOn(s)!)[0]!);
    expect(s.log.some((e) => /casts Divination, spending mana as though it were mana of any type for its mana cost \(North Star\)/.test(e.text))).toBe(true);
    // Next turn it's gone.
    const { s: n0, ap: np, ids: nids } = starred([divination()], { Mountain: 3 });
    const later = passUntil(passUntil(n0, "end", np), "main1", np);
    expect(anyTypeSpellFor(later, np)).toBeUndefined();
    expect(castProblem(later, np, nids[0]!, undefined, undefined, undefined, undefined, undefined, { anyTypeMana: true })).toMatch(/nothing lets you/);
    // An untapped North Star with lands to spare: the bot doesn't activate it.
    const { s: t0, ap: bp } = setup([]);
    const star = putOnBattlefield(t0, bp, northStar());
    const acts = botActions(t0, bp);
    expect(acts.some((a) => a.type === "activateAbility" && (a as { objectId?: string }).objectId === star)).toBe(false);
  });
});
