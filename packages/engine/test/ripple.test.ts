// Ripple (CR 702.60) and the owner's order for cards put on the bottom of a library together (CR 401.4).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const surgingFlame = card("Surging Flame", "Instant", "{1}{R}", { keywords: ["Ripple"], oracleText: "Surging Flame deals 2 damage to any target.\nRipple 4 (When you cast this spell, you may reveal the top four cards of your library. You may cast spells with the same name as this spell from among those cards without paying their mana costs. Put the rest on the bottom of your library.)" });
const surgingSentinels = card("Surging Sentinels", "Creature — Human Soldier", "{2}{W}", { power: "2", toughness: "1", keywords: ["First strike", "Ripple"], oracleText: "First strike\nRipple 4 (When you cast this spell, you may reveal the top four cards of your library. You may cast spells with the same name as this spell from among those cards without paying their mana costs. Put the rest on the bottom of your library.)" });
const surgingMight = card("Surging Might", "Enchantment — Aura", "{2}{G}", { keywords: ["Enchant", "Ripple"], oracleText: "Enchant creature\nEnchanted creature gets +2/+2.\nRipple 4 (When you cast this spell, you may reveal the top four cards of your library. You may cast spells with the same name as this spell from among those cards without paying their mana costs. Put the rest on the bottom of your library.)" });
const thrummingStone = card("Thrumming Stone", "Legendary Artifact", "{5}", { oracleText: "Spells you cast have ripple 4. (Whenever you cast a spell, you may reveal the top four cards of your library. You may cast spells with the same name as that spell from among the revealed cards without paying their mana costs. Put the rest on the bottom of your library.)" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Put these cards on top of the player's library, first on top. */
const stack = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = s.players[pid]!.library.slice(0, defs.length);
  ids.forEach((id, i) => {
    s.cards[defs[i]!.oracleId] = defs[i]!;
    s.objects[id]!.cardId = defs[i]!.oracleId;
  });
  return ids;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: ReturnType<typeof target>[]) => {
  const plan = planCast(s, pid, id, targets);
  expect(plan, "can cast").not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Pass until the ripple trigger on top of the stack asks whether to reveal. */
const toReveal = (s: GameState) => {
  for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "chooseMay" });
  return s;
};

describe("ripple", () => {
  it("reveals the top four, casts same-named cards for free one at a time, and the owner orders the rest for the bottom", () => {
    supported(surgingFlame, surgingSentinels, surgingMight, thrummingStone);
    const { s: s0, ap, ids, opp } = setup([surgingFlame]);
    const v1 = putOnBattlefield(s0, opp, bear({ name: "Victim One" }));
    const v2 = putOnBattlefield(s0, opp, bear({ name: "Victim Two" }));
    const top = stack(s0, ap, [surgingFlame, forest, surgingFlame, shock]);
    const below = s0.players[ap]!.library[4];
    let s = castNow(s0, ap, ids[0]!, [target(v1)]);
    s = toReveal(s);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // The first Surging Flame: cast it for free, with a new target.
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top[0] });
    s = castNow(s, ap, top[0]!, [target(v2)]);
    expect(s.objects[top[0]!]!.zone).toBe("stack");
    // The second one: decline it. Shock has another name, so it isn't offered.
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top[2] });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom", player: ap });
    expect(new Set((s.pending as { cards: string[] }).cards)).toEqual(new Set([top[1], top[2], top[3]]));
    s = act(s, { type: "arrangeTop", player: ap, top: [top[3]!, top[1]!, top[2]!], away: [] });
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(below);
    expect(lib.slice(-3)).toEqual([top[3], top[1], top[2]]);
    // The free Surging Flame has its own ripple, then both resolve.
    s = toReveal(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    expect(s.objects[v1]!.zone).toBe("graveyard");
    expect(s.objects[v2]!.zone).toBe("graveyard");
  });

  it("revealing is optional; with fewer cards in the library, all of them", () => {
    const { s: s0, ap, ids, opp } = setup([surgingFlame]);
    const lib = s0.players[ap]!.library;
    let s = castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = toReveal(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.library).toEqual(lib);
    // Two cards left: both are revealed.
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([surgingFlame]);
    const p = t0.players[ap2]!;
    for (const id of p.library.slice(2)) t0.objects[id]!.zone = "exile";
    p.library = p.library.slice(0, 2);
    const two = stack(t0, ap2, [forest, surgingFlame]);
    let t = castNow(t0, ap2, ids2[0]!, [{ kind: "player", id: opp2 }]);
    t = toReveal(t);
    t = act(t, { type: "chooseMay", player: ap2, yes: true });
    expect(t.pending).toMatchObject({ kind: "castFree", objectId: two[1] });
    t = act(t, { type: "chooseMay", player: ap2, yes: false });
    expect(t.pending).toMatchObject({ kind: "arrangeTop", how: "bottom" });
  });

  it("a creature with ripple casts its namesakes as it's cast, whatever their timing", () => {
    const { s: s0, ap, ids } = setup([surgingSentinels]);
    const top = stack(s0, ap, [surgingSentinels, forest, forest, forest]);
    let s = castNow(s0, ap, ids[0]!);
    s = toReveal(s);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top[0] });
    s = castNow(s, ap, top[0]!);
    expect(s.objects[top[0]!]!.zone).toBe("stack");
    // One card left for the bottom? No: three forests, which the owner orders.
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom" });
  });

  it("Thrumming Stone gives every spell you cast ripple 4, using that spell's name", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s0, ap, thrummingStone);
    const top = stack(s0, ap, [forest, shock, forest, forest]);
    let s = castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = toReveal(s);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top[1] });
    s = castNow(s, ap, top[1]!, [{ kind: "player", id: opp }]);
    s = act(s, { type: "arrangeTop", player: ap, top: [top[0]!, top[2]!, top[3]!], away: [] });
    // The Shock cast by ripple is a spell you cast too: the Stone triggers again (rulings).
    s = toReveal(s);
  });

  it("bots reveal, cast the free copies and order the rest", () => {
    const { s: s0, ap, ids, opp } = setup([surgingFlame]);
    const top = stack(s0, ap, [surgingFlame, forest, forest, forest]);
    let s = castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = toReveal(s);
    for (let i = 0; i < 6 && s.pending; i++) s = botActions(s, ap).reduce((x, a) => act(x, a), s);
    expect(s.objects[top[0]!]!.zone).toBe("stack");
    expect(new Set(s.players[ap]!.library.slice(-3))).toEqual(new Set(top.slice(1)));
  });
});
