// Round 102: Agatha's Soul Cauldron: the exile ability's reflexive trigger (CR 603.12) for a creature card, the exiled
// creature cards' activated abilities (mana abilities too) on creatures you control with +1/+1 counters, "~" in them
// meaning that creature (rulings), and mana spent as though it were any color on creatures' abilities (CR 609.4b).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, isFullySupported, planActivate, power, waitingOn, type GameState } from "../src";
import { moveObject } from "../src/game";
import { manaAbilitiesOn } from "../src/manaabilities";

// Real oracle text (Scryfall).
const cauldron = card("Agatha's Soul Cauldron", "Legendary Artifact", "{2}", { supertypes: ["Legendary"], oracleText: "You may spend mana as though it were mana of any color to activate abilities of creatures you control.\nCreatures you control with +1/+1 counters on them have all activated abilities of all creature cards exiled with Agatha's Soul Cauldron.\n{T}: Exile target card from a graveyard. When a creature card is exiled this way, put a +1/+1 counter on target creature you control." });
const shade = card("Frozen Shade", "Creature — Shade", "{2}{B}", { power: "0", toughness: "1", oracleText: "{B}: This creature gets +1/+1 until end of turn." });
const druid = card("Devoted Druid", "Creature — Elf Druid", "{1}{G}", { power: "0", toughness: "2", oracleText: "{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState, pick?: string) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [target(pick!)] });
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = pass(s);
  }
  return s;
};
const inGraveyard = (s: GameState, pid: number, def: Parameters<typeof putOnBattlefield>[2]) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};

describe("round 102: Agatha's Soul Cauldron", () => {
  it("parse", () => expect(isFullySupported(cauldron)).toBe(true));

  it("exiles a creature card, puts a counter on a creature, which then has the card's activated abilities", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cauldron);
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const sh = inGraveyard(s0, opp, shade);
    let s = settle(planActivate(s0, ap, c, 0, [target(sh)])!.reduce((x, y) => act(x, y), s0), b);
    expect(s.objects[sh]!.zone).toBe("exile");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(abilitiesOf(s, s.objects[b]!).activated.map((a) => a.text)).toEqual([expect.stringMatching(/^\{B\}: /)]);
    // No counter, no ability.
    expect(abilitiesOf(s, s.objects[other]!).activated).toHaveLength(0);
    // {B} paid with red mana: any color for creatures' abilities. "This creature" is the bear.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool.R = 1;
    const i = abilitiesOf(s, s.objects[b]!).activated.findIndex((a) => a.text.startsWith("{B}"));
    s = settle(planActivate(s, ap, b, i)!.reduce((x, y) => act(x, y), s));
    expect(power(s, s.objects[b]!)).toBe(4);
    expect(s.players[ap]!.manaPool.R).toBe(0);
  });

  it("a noncreature card: no trigger; a creature card's mana ability is lent too; the counter gone, so is the ability", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cauldron);
    const b = putOnBattlefield(s0, ap, bear());
    const bl = inGraveyard(s0, opp, bolt);
    let s = settle(planActivate(s0, ap, c, 0, [target(bl)])!.reduce((x, y) => act(x, y), s0));
    expect(s.objects[bl]!.zone).toBe("exile");
    expect(s.objects[b]!.counters["+1/+1"]).toBeUndefined();
    const dr = inGraveyard(s, opp, druid);
    s.objects[c]!.tapped = false;
    s = settle(planActivate(s, ap, c, 0, [target(dr)])!.reduce((x, y) => act(x, y), s), b);
    expect(manaAbilitiesOn(s, s.objects[b]!).map((m) => m.text)).toContain("{T}: Add {G}.");
    s.objects[b]!.counters["+1/+1"] = 0;
    expect(manaAbilitiesOn(s, s.objects[b]!).map((m) => m.text)).not.toContain("{T}: Add {G}.");
    expect(abilitiesOf(s, s.objects[b]!).activated).toHaveLength(0);
  });
});
