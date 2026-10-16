// "Sacrifice it when you lose control of ~" (CR 603.7, Khârn and Seraph rulings): Krovikan Vampire and Seraph return
// the creatures they dealt damage to, and you sacrifice them when you lose control of the Vampire or Seraph, by a
// control change or by it leaving the battlefield.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";
import { dealDamage, objectSource } from "../src/damage";
import { destroyPermanent, moveObject, runStateBasedActions } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const vampire = card("Krovikan Vampire", "Creature — Vampire", "{3}{B}{B}", { power: "3", toughness: "3", oracleText: "At the beginning of each end step, if a creature dealt damage by this creature this turn died, put that card onto the battlefield under your control. Sacrifice it when you lose control of this creature." });
const seraph = card("Seraph", "Creature — Angel", "{6}{W}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever a creature dealt damage by this creature this turn dies, put that card onto the battlefield under your control at the beginning of the next end step. Sacrifice the creature when you lose control of this creature." });

/** `src` deals 2 damage to `victim`, which dies. */
function hitAndKill(s: GameState, src: string, victim: string) {
  dealDamage(s, objectSource(s, s.objects[src]!), { object: s.objects[victim]! }, 2);
  runStateBasedActions(s);
  return settle(s);
}

describe("sacrifice it when you lose control of ~", () => {
  it("parse", () => supported(vampire, seraph));

  it("Krovikan Vampire returns the creature at the end step; you sacrifice it when another player gains control of the Vampire", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vampire);
    const b = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = hitAndKill(s0, v, b);
    expect(s.objects[b]!.zone).toBe("graveyard");
    // Another creature that died without being dealt damage by the Vampire stays in its graveyard.
    destroyPermanent(s, s.objects[other]!, "test");
    s = passUntil(s, "end");
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
    expect(s.objects[other]!.zone).toBe("graveyard");
    // An opponent gains control of the Vampire: the returned creature is sacrificed.
    addEffect(s, opp, [v], [{ kind: "control" }], "game");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[v]!.zone).toBe("battlefield");
  });

  it("Krovikan Vampire leaving the battlefield is losing control of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vampire);
    const b = putOnBattlefield(s0, opp, bear());
    let s = hitAndKill(s0, v, b);
    s = settle(passUntil(s, "end"));
    expect(s.objects[b]!.zone).toBe("battlefield");
    destroyPermanent(s, s.objects[v]!, "test");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Krovikan Vampire doesn't trigger when nothing it damaged died, and loses track of a card that left the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vampire);
    const b = putOnBattlefield(s0, opp, bear());
    let s = hitAndKill(s0, v, b);
    // The card goes to exile and back to the graveyard: a new object (rulings).
    moveObject(s, b, "exile");
    moveObject(s, b, "graveyard");
    s = settle(passUntil(s, "end"));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Seraph returns the card at the next end step, even if Seraph has left by then, and then never sacrifices it (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const sr = putOnBattlefield(s0, ap, seraph);
    const b = putOnBattlefield(s0, opp, bear());
    let s = hitAndKill(s0, sr, b);
    expect(s.objects[b]!.zone).toBe("graveyard");
    destroyPermanent(s, s.objects[sr]!, "test");
    s = settle(s);
    s = settle(passUntil(s, "end"));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
    expect(s.delayed ?? []).toHaveLength(0);
  });

  it("Seraph: the returned creature is sacrificed when you lose control of Seraph", () => {
    const { s: s0, ap, opp } = setup([]);
    const sr = putOnBattlefield(s0, ap, seraph);
    const b = putOnBattlefield(s0, opp, bear());
    let s = hitAndKill(s0, sr, b);
    s = settle(passUntil(s, "end"));
    expect(s.objects[b]!.zone).toBe("battlefield");
    addEffect(s, opp, [sr], [{ kind: "control" }], "game");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Seraph controlled by another player as the card returns: you sacrifice it only after you regain and lose Seraph again (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const sr = putOnBattlefield(s0, ap, seraph);
    const b = putOnBattlefield(s0, opp, bear());
    let s = hitAndKill(s0, sr, b);
    const steal = addEffect(s, opp, [sr], [{ kind: "control" }], "game");
    s = settle(passUntil(s, "end"));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
    // You get Seraph back: nothing happens yet.
    s.effects = s.effects.filter((e) => e.id !== steal.id);
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    // And lose it again.
    addEffect(s, opp, [sr], [{ kind: "control" }], "game");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

// "That creature is a black Zombie in addition to its other colors and types" (CR 611.2c; rulings: it adds a color and a
// subtype, and a colorless creature simply becomes black).
const rise = card("Rise from the Grave", "Sorcery", "{4}{B}", { oracleText: "Put target creature card from a graveyard onto the battlefield under your control. That creature is a black Zombie in addition to its other colors and types." });
const betrayal = card("Grave Betrayal", "Enchantment", "{5}{B}{B}", { oracleText: "Whenever a creature you don't control dies, return it to the battlefield under your control with an additional +1/+1 counter on it at the beginning of the next end step. That creature is a black Zombie in addition to its other colors and types." });
const slaver = card("Dread Slaver", "Creature — Zombie Horror", "{3}{B}{B}", { power: "3", toughness: "5", oracleText: "Whenever a creature dealt damage by this creature this turn dies, return it to the battlefield under your control. That creature is a black Zombie in addition to its other colors and types." });
const liliana = card("Liliana, Death's Majesty", "Legendary Planeswalker — Liliana", "{3}{B}{B}", { loyalty: "5", oracleText: "+1: Create a 2/2 black Zombie creature token. Mill two cards.\n−3: Return target creature card from your graveyard to the battlefield. That creature is a black Zombie in addition to its other colors and types.\n−7: Destroy all non-Zombie creatures." });

describe("that creature is a black Zombie in addition to its other colors and types", () => {
  it("parse", () => supported(rise, betrayal, slaver, liliana));

  it("Rise from the Grave: an opponent's creature card, now yours, a green and black Bear Zombie", () => {
    const { s: s0, ap, opp, ids } = setup([rise]);
    const b = putOnBattlefield(s0, opp, bear());
    destroyPermanent(s0, s0.objects[b]!, "test");
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    const o = s.objects[b]!;
    expect(o.zone).toBe("battlefield");
    expect(o.controller).toBe(ap);
    const c = characteristics(s, o);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Zombie"]));
    expect([...c.colors].sort()).toEqual(["B", "G"]);
  });

  it("Grave Betrayal: at the next end step, with a +1/+1 counter, as a black Zombie", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, betrayal);
    const b = putOnBattlefield(s0, opp, bear());
    destroyPermanent(s0, s0.objects[b]!, "test");
    let s = settle(s0);
    expect(s.objects[b]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end"));
    const o = s.objects[b]!;
    expect(o.zone).toBe("battlefield");
    expect(o.controller).toBe(ap);
    expect(o.counters["+1/+1"]).toBe(1);
    expect(characteristics(s, o).subtypes).toContain("Zombie");
  });

  it("Dread Slaver returns what it dealt damage to, right away", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, slaver);
    const b = putOnBattlefield(s0, opp, bear());
    const s = hitAndKill(s0, d, b);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
    expect(characteristics(s, s.objects[b]!).colors).toContain("B");
  });
});
