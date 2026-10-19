// Excess damage (CR 120.4a, 120.10): damage to a creature beyond lethal damage (its toughness minus the damage already
// marked on it; 1 from a source with deathtouch, 702.2c), to a planeswalker beyond its loyalty, to a battle beyond its
// defense. "Excess damage is dealt to that creature's controller instead" splits the damage before prevention (Flame
// Spill rulings); "the excess damage dealt this way" counts what was dealt beyond lethal.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const castX = (s: GameState, pid: PlayerId, id: string, x: number, targets: ReturnType<typeof target>[]) => run(s, planCast(s, pid, id, targets, undefined, undefined, x));
const named = (s: GameState, name: string, pid: PlayerId) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.replace(/ Token$/, "") === name && s.objects[id]!.controller === pid);

// Real oracle text (Scryfall).
const hellToPay = card("Hell to Pay", "Sorcery", "{X}{R}", { keywords: ["Treasure"], oracleText: "Hell to Pay deals X damage to target creature. Create a number of tapped Treasure tokens equal to the amount of excess damage dealt to that creature this way." });
const flameSpill = card("Flame Spill", "Instant", "{2}{R}", { oracleText: "Flame Spill deals 4 damage to target creature. Excess damage is dealt to that creature's controller instead." });
const bottleCap = card("Bottle-Cap Blast", "Instant", "{4}{R}", { keywords: ["Improvise", "Treasure"], oracleText: 'Improvise (Your artifacts can help cast this spell. Each artifact you tap after you\'re done activating mana abilities pays for {1}.)\nBottle-Cap Blast deals 5 damage to any target. If excess damage was dealt to a permanent this way, create that many tapped Treasure tokens. (They\'re artifacts with "{T}, Sacrifice this token: Add one mana of any color.")' });
const plunge = card("Orbital Plunge", "Sorcery", "{3}{R}", { oracleText: 'Orbital Plunge deals 6 damage to target creature. If excess damage was dealt this way, create a Lander token. (It\'s an artifact with "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.")' });
const slice = card("Windswift Slice", "Instant", "{2}{G}", { oracleText: "Target creature you control deals damage equal to its power to target creature you don't control. Create a number of 1/1 green Elf Warrior creature tokens equal to the amount of excess damage dealt this way." });
const victory = card("Overwhelming Victory", "Instant — Lesson", "{4}{R}", { oracleText: "Overwhelming Victory deals 5 damage to target creature. Each creature you control gains trample and gets +X/+0 until end of turn, where X is the amount of excess damage dealt this way." });
const ramThrough = card("Ram Through", "Sorcery", "{1}{G}", { oracleText: "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead." });
const walker = card("Jace Beleren", "Legendary Planeswalker — Jace", "{1}{U}{U}", { loyalty: "3", oracleText: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." });
const big = (p: string, t: string, extra: Partial<CardDef> = {}) => bear({ power: p, toughness: t, ...extra });

describe("excess damage (CR 120.4a, 120.10)", () => {
  it("compile", () => supported(hellToPay, flameSpill, bottleCap, plunge, slice, victory, ramThrough));

  it("Ram Through: the excess goes to the controller only if your creature has trample", () => {
    const { s: s0, ap, opp, ids } = setup([ramThrough]);
    const mine = putOnBattlefield(s0, ap, big("6", "6", { keywords: ["Trample"], oracleText: "Trample" }));
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(mine), target(theirs)]));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(36);
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([ramThrough]);
    const plain = putOnBattlefield(t0, a2, big("6", "6"));
    const other = putOnBattlefield(t0, o2, bear());
    const t = settle(cast(t0, a2, i2[0]!, [target(plain), target(other)]));
    expect(t.objects[other]!.zone).toBe("graveyard");
    expect(t.players[o2]!.life).toBe(40);
  });

  it("Hell to Pay: a Treasure for each damage beyond toughness, counting damage already marked", () => {
    const { s: s0, ap, opp, ids } = setup([hellToPay]);
    const b = putOnBattlefield(s0, opp, big("2", "4"));
    s0.objects[b]!.damage = 1;
    const s = castX(s0, ap, ids[0]!, 6, [target(b)]);
    // Lethal was 4 - 1 = 3, so 3 of the 6 were excess.
    expect(s.objects[b]!.zone).toBe("graveyard");
    const treasures = named(s, "Treasure", ap);
    expect(treasures).toHaveLength(3);
    expect(treasures.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Hell to Pay: no excess, no Treasures", () => {
    const { s: s0, ap, opp, ids } = setup([hellToPay]);
    const b = putOnBattlefield(s0, opp, big("2", "4"));
    const s = castX(s0, ap, ids[0]!, 4, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(named(s, "Treasure", ap)).toHaveLength(0);
  });

  it("Flame Spill: lethal damage to the creature, the rest to its controller", () => {
    const { s: s0, ap, opp, ids } = setup([flameSpill]);
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(38);
    // A creature it doesn't kill: nothing to the player.
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([flameSpill]);
    const c = putOnBattlefield(t0, o2, big("5", "5"));
    const t = settle(cast(t0, a2, i2[0]!, [target(c)]));
    expect(t.objects[c]!.damage).toBe(4);
    expect(t.players[o2]!.life).toBe(40);
  });

  it("Bottle-Cap Blast: a planeswalker's excess is beyond its loyalty; a player has none", () => {
    const { s: s0, ap, opp, ids } = setup([bottleCap]);
    const j = putOnBattlefield(s0, opp, walker);
    s0.objects[j]!.counters.loyalty = 3;
    const s = settle(cast(s0, ap, ids[0]!, [target(j)]));
    expect(named(s, "Treasure", ap)).toHaveLength(2);
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([bottleCap]);
    const t = settle(cast(t0, a2, i2[0]!, [{ kind: "player", id: o2 }]));
    expect(t.players[o2]!.life).toBe(35);
    expect(named(t, "Treasure", a2)).toHaveLength(0);
  });

  it("Orbital Plunge: a Lander only if excess damage was dealt", () => {
    const { s: s0, ap, opp, ids } = setup([plunge]);
    const b = putOnBattlefield(s0, opp, big("6", "6"));
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(named(s, "Lander", ap)).toHaveLength(0);
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([plunge]);
    const c = putOnBattlefield(t0, o2, bear());
    s = settle(cast(t0, a2, i2[0]!, [target(c)]));
    expect(named(s, "Lander", a2)).toHaveLength(1);
  });

  it("Windswift Slice: your creature's damage beyond lethal, and deathtouch makes 1 lethal", () => {
    const { s: s0, ap, opp, ids } = setup([slice]);
    const mine = putOnBattlefield(s0, ap, big("5", "5"));
    const theirs = putOnBattlefield(s0, opp, big("3", "3"));
    let s = settle(cast(s0, ap, ids[0]!, [target(mine), target(theirs)]));
    expect(named(s, "Elf Warrior", ap)).toHaveLength(2);
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([slice]);
    const killer = putOnBattlefield(t0, a2, big("3", "3", { keywords: ["Deathtouch"], oracleText: "Deathtouch" }));
    const victim = putOnBattlefield(t0, o2, big("4", "4"));
    s = settle(cast(t0, a2, i2[0]!, [target(killer), target(victim)]));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(named(s, "Elf Warrior", a2)).toHaveLength(2);
  });

  it("Overwhelming Victory: +X/+0 for the excess damage", () => {
    const { s: s0, ap, opp, ids } = setup([victory]);
    const mine = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(pt(s, mine)).toBe("6/2");
  });
});
