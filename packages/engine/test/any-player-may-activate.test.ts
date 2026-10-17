// "Any player may activate this ability" (CR 602.2): a player who doesn't control the permanent may activate it, paying
// its cost themselves, and they control the ability on the stack (CR 113.8): "you" in it is them. "But only during their
// draw step" is the activator's; "only as a sorcery" is when the activator could cast a sorcery.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, forest } from "./helpers";
import { abilityProblem, compileCard, isFullySupported, power, waitingOn, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const hydra = card("Feral Hydra", "Creature — Hydra Beast", "{X}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\n{3}: Put a +1/+1 counter on this creature. Any player may activate this ability." });
const wall = card("Quicksilver Wall", "Creature — Wall", "{2}{U}", { power: "1", toughness: "6", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\n{4}: Return this creature to its owner's hand. Any player may activate this ability." });
const excavation = card("Excavation", "Enchantment", "{1}{U}", { oracleText: "{1}, Sacrifice a land: Draw a card. Any player may activate this ability." });
const vapors = card("Lethal Vapors", "Enchantment", "{2}{B}{B}", { oracleText: "Whenever a creature enters, destroy it.\n{0}: Destroy this enchantment. You skip your next turn. Any player may activate this ability." });
const well = card("Well of Knowledge", "Artifact", "{3}", { oracleText: "{2}: Draw a card. Any player may activate this ability but only during their draw step." });
const cluster = card("Saproling Cluster", "Enchantment", "{1}{G}", { oracleText: "{1}, Discard a card: Create a 1/1 green Saproling creature token. Any player may activate this ability." });
const ogre = card("Flailing Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", oracleText: "{1}: This creature gets +1/+1 until end of turn. Any player may activate this ability.\n{1}: This creature gets -1/-1 until end of turn. Any player may activate this ability." });
const scandalmonger = card("Scandalmonger", "Creature — Boar Monger", "{3}{B}", { power: "3", toughness: "3", oracleText: "{2}: Target player discards a card. Any player may activate this ability but only as a sorcery." });
const pinger = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
/** Give `pid` priority now (the active player passes until it reaches them). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && s.priority !== pid; i++) s = act(s, { type: "passPriority", player: s.priority! });
  return s;
};

describe("any player may activate this ability", () => {
  it("parses, and only abilities whose costs anyone could pay", () => {
    for (const d of [hydra, wall, excavation, vapors, well, cluster, ogre, scandalmonger]) expect(isFullySupported(d), d.name).toBe(true);
    expect(compileCard(hydra).activated[0]!.anyPlayer).toBe(true);
    // A {T} ability of someone else's permanent isn't one any player may activate.
    expect(compileCard(pinger).activated[0]!.anyPlayer).toBeUndefined();
  });

  it("Feral Hydra: an opponent pays and puts the counter on it; the hydra stays its controller's", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    const h = putOnBattlefield(s, ap, hydra);
    s.objects[h]!.counters["+1/+1"] = 2;
    s = priorityTo(s, p1!);
    expect(abilityProblem(s, p1!, h, 0)).toMatch(/not enough mana/);
    addMana(s, p1!, ["C", "C", "C"] as ManaType[], {});
    s = act(s, { type: "activateAbility", player: p1!, objectId: h, index: 0 });
    expect(s.stack[s.stack.length - 1]!.controller).toBe(p1);
    s = settle(s);
    expect(s.objects[h]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[h]!.controller).toBe(ap);
  });

  it("Quicksilver Wall: an opponent returns it to its owner's hand", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    const w = putOnBattlefield(s, ap, wall);
    s = priorityTo(s, p1!);
    addMana(s, p1!, ["C", "C", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "activateAbility", player: p1!, objectId: w, index: 0 }));
    expect(s.objects[w]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(w);
  });

  it("Excavation: the activator sacrifices their own land and draws", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    putOnBattlefield(s, ap, excavation);
    const mine = putOnBattlefield(s, p1!, forest);
    const ex = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Excavation")!;
    s = priorityTo(s, p1!);
    addMana(s, p1!, ["C"] as ManaType[], {});
    const hand = s.players[p1!]!.hand.length;
    s = settle(act(s, { type: "activateAbility", player: p1!, objectId: ex, index: 0, costs: { sacrifice: [mine] } }));
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.players[p1!]!.hand.length).toBe(hand + 1);
  });

  it("Saproling Cluster: the token is the activator's", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    const c = putOnBattlefield(s, ap, cluster);
    s = priorityTo(s, p1!);
    addMana(s, p1!, ["C"] as ManaType[], {});
    const discard = s.players[p1!]!.hand[0]!;
    s = settle(act(s, { type: "activateAbility", player: p1!, objectId: c, index: 0, costs: { discard: [discard] } }));
    const token = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken)!;
    expect(token.controller).toBe(p1);
    expect(s.objects[discard]!.zone).toBe("graveyard");
  });

  it("Lethal Vapors: the player who destroys it skips their next turn", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    const v = putOnBattlefield(s, ap, vapors);
    s = priorityTo(s, p1!);
    s = settle(act(s, { type: "activateAbility", player: p1!, objectId: v, index: 0 }));
    expect(s.objects[v]!.zone).toBe("graveyard");
    expect(s.players[p1!]!.skips).toEqual([{ what: "turn" }]);
    expect(s.players[ap]!.skips ?? []).toEqual([]);
  });

  it("Flailing Ogre: an opponent shrinks it", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    const o = putOnBattlefield(s, ap, ogre);
    s = priorityTo(s, p1!);
    addMana(s, p1!, ["C"] as ManaType[], {});
    s = settle(act(s, { type: "activateAbility", player: p1!, objectId: o, index: 1 }));
    expect(power(s, s.objects[o]!)).toBe(2);
  });

  it("Well of Knowledge: only during the activator's own draw step", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    const w = putOnBattlefield(s, ap, well);
    addMana(s, ap, ["C", "C"] as ManaType[], {});
    // The controller's main phase: not their draw step.
    expect(abilityProblem(s, ap, w, 0)).toMatch(/can't be activated now/);
    s = priorityTo(s, p1!);
    expect(abilityProblem(s, p1!, w, 0)).toMatch(/can't be activated now/);
    // The active player's draw step: theirs, not p1's.
    s.step = "draw";
    expect(abilityProblem(s, p1!, w, 0)).toMatch(/can't be activated now/);
    s.priority = ap;
    expect(abilityProblem(s, ap, w, 0)).toBeNull();
  });

  it("Scandalmonger: as a sorcery for the activator, so not on another player's turn", () => {
    let { s, ap } = setup([]);
    const [p1] = others(s, ap);
    const m = putOnBattlefield(s, p1!, scandalmonger);
    addMana(s, ap, ["C", "C"] as ManaType[], {});
    // The active player's main phase with an empty stack: they may, though it's p1's creature.
    expect(abilityProblem(s, ap, m, 0, [{ kind: "player", id: p1! }])).toBeNull();
    s = priorityTo(s, p1!);
    addMana(s, p1!, ["C", "C"] as ManaType[], {});
    expect(abilityProblem(s, p1!, m, 0, [{ kind: "player", id: ap }])).toMatch(/sorcery/);
  });
});
