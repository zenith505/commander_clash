// "Any player may sacrifice a land of their choice. If a player does, ..." (Argothian Wurm), "any opponent may have it
// deal 4 damage to them. If a player does, sacrifice ~" (Vexing Devil), "Any player may have Browbeat deal 5 damage to
// them. If no one does, ..." (Browbeat): each player in turn order chooses, knowing the choices before theirs, even after
// someone has done it; the chosen actions happen together, then the rest once, if anyone did (or if no one did)
// (rulings on Shivan Wumpus, Clackbridge Troll, Vexing Devil, Brain Gorgers and Dash Hopes).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const wurm = card("Argothian Wurm", "Creature — Wurm", "{3}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, any player may sacrifice a land of their choice. If a player does, put this creature on top of its owner's library." });
const demon = card("Desecration Demon", "Creature — Demon", "{2}{B}{B}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of each combat, any opponent may sacrifice a creature of their choice. If a player does, tap this creature and put a +1/+1 counter on it." });
const devil = card("Vexing Devil", "Creature — Devil", "{R}", { power: "4", toughness: "3", oracleText: "When this creature enters, any opponent may have it deal 4 damage to them. If a player does, sacrifice this creature." });
const browbeat = card("Browbeat", "Sorcery", "{2}{R}", { oracleText: "Any player may have Browbeat deal 5 damage to them. If no one does, target player draws three cards." });
const gorgers = card("Brain Gorgers", "Creature — Zombie", "{3}{B}", { power: "4", toughness: "2", keywords: ["Madness"], oracleText: "When you cast this spell, any player may sacrifice a creature of their choice. If a player does, counter Brain Gorgers.\nMadness {1}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" });
const pangolin = card("Prowling Pangolin", "Creature — Pangolin Beast", "{3}{B}{B}", { power: "6", toughness: "5", oracleText: "When this creature enters, any player may sacrifice two creatures of their choice. If a player does, sacrifice this creature." });
const troll = card("Clackbridge Troll", "Creature — Troll", "{3}{B}{B}", { power: "8", toughness: "8", keywords: ["Haste", "Trample"], oracleText: "Trample, haste\nWhen this creature enters, target opponent creates three 0/1 white Goat creature tokens.\nAt the beginning of combat on your turn, any opponent may sacrifice a creature of their choice. If a player does, tap this creature, you gain 3 life, and you draw a card." });
const dashHopes = card("Dash Hopes", "Instant", "{B}{B}", { oracleText: "When you cast this spell, any player may pay 5 life. If a player does, counter Dash Hopes.\nCounter target spell." });
const breakingPoint = card("Breaking Point", "Sorcery", "{1}{R}{R}", { oracleText: "Any player may have Breaking Point deal 6 damage to them. If no one does, destroy all creatures. Creatures destroyed this way can't be regenerated." });
const firebeast = card("Longhorn Firebeast", "Creature — Elemental Ox Beast", "{2}{R}", { power: "3", toughness: "2", oracleText: "When this creature enters, any opponent may have it deal 5 damage to them. If a player does, sacrifice this creature." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const choose = (s: GameState, pid: PlayerId, choice: string) => settle(act(s, { type: "chooseOption", player: pid, choice }));
const pending = (s: GameState) => s.pending as { kind: string; player: PlayerId; options: string[]; labels: string[]; prompt: string };

describe("any player may ... if a player does / if no one does", () => {
  it("parses", () => [wurm, demon, devil, browbeat, gorgers, pangolin, troll, dashHopes, breakingPoint, firebeast].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Argothian Wurm: each player in turn order, even after one has; then it goes on top of its owner's library once", () => {
    let { s, ap, ids } = setup([wurm]);
    const [p1, p2, p3] = others(s, ap);
    const lands = [p1, p2].map((p) => putOnBattlefield(s, p!, forest));
    addMana(s, ap, ["G", "C", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    // The active player (its controller) is asked first: they have lands too.
    expect(pending(s)).toMatchObject({ kind: "chooseOption", player: ap, labels: ["Sacrifice a land", "Don't"] });
    expect(pending(s).prompt).toBe("Sacrifice a land? If anyone does, put Argothian Wurm on top of its owner's library.");
    s = choose(s, ap, "none");
    expect(pending(s)).toMatchObject({ player: p1 });
    s = choose(s, p1!, "0");
    // p1 has one land: no choice of which. p2 still gets the option, and takes it.
    expect(pending(s)).toMatchObject({ player: p2 });
    expect(pending(s).prompt).toContain("someone already has");
    s = choose(s, p2!, "0");
    // p3 has no land: not asked. Both lands go at once, and the Wurm goes on top of the library.
    expect(lands.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[ids[0]!]!.zone).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(ids[0]);
    void p3;
  });

  it("Argothian Wurm: if no one does, it stays", () => {
    let { s, ap, ids } = setup([wurm]);
    const [p1] = others(s, ap);
    putOnBattlefield(s, p1!, forest);
    addMana(s, ap, ["G", "C", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    s = choose(s, ap, "none");
    s = choose(s, p1!, "none");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Vexing Devil: an opponent who chooses is dealt 4 damage by it, and it's sacrificed", () => {
    let { s, ap, ids } = setup([devil]);
    const [p1, p2, p3] = others(s, ap);
    addMana(s, ap, ["R"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    // Opponents only, starting with the next in turn order.
    expect(pending(s)).toMatchObject({ player: p1, labels: ["Be dealt 4 damage", "Don't"] });
    s = choose(s, p1!, "none");
    s = choose(s, p2!, "0");
    s = choose(s, p3!, "none");
    expect(s.players[p2!]!.life).toBe(36);
    expect(s.players[p1!]!.life).toBe(40);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Browbeat: if no one takes the damage, the target player draws three; if someone does, nothing", () => {
    for (const someone of [false, true]) {
      let { s, ap, ids } = setup([browbeat]);
      const [p1, p2, p3] = others(s, ap);
      addMana(s, ap, ["R", "C", "C"] as ManaType[], {});
      const hand = s.players[ap]!.hand.length;
      s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [{ kind: "player", id: ap }] }));
      for (const p of [ap, p1, p2, p3]) s = choose(s, p!, someone && p === p2 ? "0" : "none");
      expect(s.players[ap]!.hand.length).toBe(someone ? hand - 1 : hand - 1 + 3);
      expect(s.players[p2!]!.life).toBe(someone ? 35 : 40);
    }
  });

  it("Brain Gorgers: a creature sacrificed counters it", () => {
    let { s, ap, ids } = setup([gorgers]);
    const [p1] = others(s, ap);
    const b = putOnBattlefield(s, p1!, bear());
    addMana(s, ap, ["B", "C", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    // Its controller has no creature: not asked.
    expect(pending(s)).toMatchObject({ player: p1 });
    s = choose(s, p1!, "0");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.stack).toHaveLength(0);
  });

  it("Prowling Pangolin: two creatures, picked together, only by a player who has two", () => {
    let { s, ap, ids } = setup([pangolin]);
    const [p1, p2] = others(s, ap);
    const three = [bear(), bear(), bear()].map((d) => putOnBattlefield(s, p1!, d));
    putOnBattlefield(s, p2!, bear());
    addMana(s, ap, ["B", "B", "C", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    // The controller has only the Pangolin itself, so not two creatures? It has one: not asked. p2 has one: not asked.
    expect(pending(s)).toMatchObject({ player: p1, labels: ["Sacrifice 2 creatures", "Don't"] });
    s = choose(s, p1!, "0");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: p1, count: 2 });
    s = settle(act(s, { type: "pickPermanents", player: p1!, ids: three.slice(0, 2) }));
    expect(three.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Desecration Demon: tapped and one +1/+1 counter, however many opponents sacrifice", () => {
    let { s, ap } = setup([]);
    const [p1, p2, p3] = others(s, ap);
    const d = putOnBattlefield(s, ap, demon);
    const bears = [p1, p2].map((p) => putOnBattlefield(s, p!, bear()));
    putOnBattlefield(s, p3!, bear());
    while (s.step !== "beginCombat" || !s.stack.length && !s.pending) {
      if (s.pending) break;
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = settle(s);
    expect(pending(s)).toMatchObject({ player: p1 });
    s = choose(s, p1!, "0");
    s = choose(s, p2!, "0");
    s = choose(s, p3!, "none");
    expect(bears.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[d]!.tapped).toBe(true);
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
  });

  it("Breaking Point: no one takes it, so all creatures are destroyed and can't be regenerated", () => {
    let { s, ap, ids } = setup([breakingPoint]);
    const [p1, p2, p3] = others(s, ap);
    const b = putOnBattlefield(s, p1!, bear());
    addMana(s, ap, ["R", "R", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    for (const p of [ap, p1, p2, p3]) s = choose(s, p!, "none");
    expect(s.objects[b]!.zone).toBe("graveyard");
    void target;
  });
  it("Dash Hopes: a player who pays 5 life counters it", () => {
    let { s, ap, ids } = setup([dashHopes, browbeat]);
    const [p1, p2, p3] = others(s, ap);
    addMana(s, ap, ["R", "C", "C"] as ManaType[], {});
    s = act(s, { type: "castSpell", player: ap, objectId: ids[1]!, targets: [{ kind: "player", id: ap }] });
    addMana(s, ap, ["B", "B"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [{ kind: "stack", id: s.stack[0]!.id }] }));
    expect(pending(s)).toMatchObject({ kind: "chooseOption", player: ap, labels: ["Pay 5 life", "Don't"] });
    expect(pending(s).prompt).toContain("If anyone does, counter Dash Hopes");
    s = choose(s, ap, "none");
    s = choose(s, p1!, "0");
    expect(s.players[p1!]!.life).toBe(35);
    s = choose(s, p2!, "none");
    s = choose(s, p3!, "none");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Browbeat is still there, now resolving: asking its own question.
    expect(s.objects[ids[1]!]!.zone).toBe("stack");
  });
});
