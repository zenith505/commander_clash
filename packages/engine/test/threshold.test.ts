// Threshold (CR 207.2c ability word): "As long as there are seven or more cards in your graveyard, ~ gets +2/+2 and
// can't block." Both parts apply only while the condition holds; "gets +N/+N and can't block" on Auras and Equipment.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Fills `pid`'s graveyard to `n` cards from the top of their library. */
const graveyard = (s: GameState, pid: PlayerId, n: number) => {
  const p = s.players[pid]!;
  while (p.graveyard.length < n) {
    const id = p.library.shift()!;
    s.objects[id]!.zone = "graveyard";
    p.graveyard.push(id);
  }
  invalidateCharacteristics(s);
};

// Real oracle text (Scryfall).
const horror = card("Childhood Horror", "Creature — Horror", "{3}{B}", {
  power: "2",
  toughness: "2",
  keywords: ["Flying", "Threshold"],
  oracleText: "Flying\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +2/+2 and can't block.",
});
const juggernaut = card("Otarian Juggernaut", "Artifact Creature — Juggernaut", "{4}", {
  power: "2",
  toughness: "3",
  keywords: ["Threshold"],
  oracleText: "This creature can't be blocked by Walls.\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +3/+0 and attacks each combat if able.",
});
const carapace = card("Copper Carapace", "Artifact — Equipment", "{1}", {
  oracleText: "Equipped creature gets +2/+2 and can't block.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)",
});

const grizzlyFate = card("Grizzly Fate", "Sorcery", "{3}{G}{G}", {
  oracleText:
    "Create two 2/2 green Bear creature tokens.\nThreshold — Create four 2/2 green Bear creature tokens instead if there are seven or more cards in your graveyard.\nFlashback {5}{G}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
});
const sledge = card("Kamahl's Sledge", "Sorcery", "{5}{R}{R}", {
  oracleText:
    "Kamahl's Sledge deals 4 damage to target creature.\nThreshold — If there are seven or more cards in your graveyard, instead Kamahl's Sledge deals 4 damage to that creature and 4 damage to that creature's controller.",
});

describe("threshold: gets +N/+N and can't block", () => {
  it("Childhood Horror is a 2/2 that can block with six cards in the graveyard, a 4/4 that can't with seven", () => {
    supported(horror, juggernaut, carapace);
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, horror);
    const j = putOnBattlefield(s, ap, juggernaut);
    graveyard(s, ap, 6);
    expect(characteristics(s, s.objects[h]!)).toMatchObject({ power: 2, toughness: 2, cantBlock: false });
    expect(characteristics(s, s.objects[j]!)).toMatchObject({ power: 2, attacksIfAble: false });
    graveyard(s, ap, 7);
    expect(characteristics(s, s.objects[h]!)).toMatchObject({ power: 4, toughness: 4, cantBlock: true });
    expect(characteristics(s, s.objects[j]!)).toMatchObject({ power: 5, attacksIfAble: true });
  });

  it("Copper Carapace: equipped creature gets +2/+2 and can't block", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, carapace);
    s.objects[c]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!)).toMatchObject({ power: 4, toughness: 4, cantBlock: true });
  });

  it("threshold spells: 'instead if' (Grizzly Fate) and 'If ..., instead' (Kamahl's Sledge), checked as they resolve", () => {
    supported(grizzlyFate, sledge);
    const { s: s0, ap, ids, opp } = setup([grizzlyFate, grizzlyFate, sledge]);
    const bears = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken).length;
    for (const l of [forest, forest, forest, mountain, mountain]) putOnBattlefield(s0, ap, l);
    graveyard(s0, ap, 6);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(bears(s)).toBe(2); // Grizzly Fate is on the stack, not yet the seventh card
    s = run(s, planCast(s, ap, ids[1]!));
    expect(bears(s)).toBe(6);
    const b = putOnBattlefield(s, opp, bear({ toughness: "5" }));
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[2]!, [target(b)]));
    expect(s.objects[b]!.damage).toBe(4);
    expect(s.players[opp]!.life).toBe(life - 4);
  });
});
