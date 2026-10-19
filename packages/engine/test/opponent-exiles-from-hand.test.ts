// "Target opponent exiles a card from their hand" (Parallax Nexus, Mind Swords, Witness the End): the player chooses the
// card and exiles it. It isn't a discard (CR 701.9a). Parallax Nexus gives the cards back when it leaves (CR 607.2a).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, moveObject, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const nexus = card("Parallax Nexus", "Enchantment", "{2}{B}", { keywords: ["Fading"], oracleText: "Fading 5 (This enchantment enters with five fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\nRemove a fade counter from this enchantment: Target opponent exiles a card from their hand. Activate only as a sorcery.\nWhen this enchantment leaves the battlefield, each player returns to their hand all cards they own exiled with it." });
const mindSwords = card("Mind Swords", "Sorcery", "{1}{B}", { oracleText: "If you control a Swamp, you may sacrifice a creature rather than pay this spell's mana cost.\nEach player exiles two cards from their hand." });
const witness = card("Witness the End", "Sorcery", "{3}{B}", { keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nTarget opponent exiles two cards from their hand and loses 2 life." });
const megrim = card("Megrim", "Enchantment", "{2}{B}", { oracleText: "Whenever an opponent discards a card, this enchantment deals 2 damage to that player." });
const snail = card("Skullcap Snail", "Creature — Fungus Snail", "{1}{B}", { power: "1", toughness: "1", oracleText: "When this creature enters, target opponent exiles a card from their hand." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const emptyHand = (s: GameState, pid: PlayerId, keep?: string) => {
  for (const id of [...s.players[pid]!.hand]) if (id !== keep) moveObject(s, id, "library");
};

describe("a player exiles cards from their hand", () => {
  it("parses these cards", () => {
    supported(nexus, mindSwords, witness, snail);
    expect(compileCard(witness).spell!.effects).toMatchObject([{ type: "discard", n: 2, exile: true }, { type: "loseLife", n: 2 }]);
  });

  it("Parallax Nexus: the opponent chooses which card; it's exiled, not discarded; they come back when the Nexus leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    const nx = putOnBattlefield(s0, ap, nexus);
    s0.objects[nx]!.counters.fade = 5;
    putOnBattlefield(s0, ap, megrim);
    emptyHand(s0, opp);
    const [a, b, c] = [toHand(s0, opp, card("Card A", "Sorcery", "{B}")), toHand(s0, opp, card("Card B", "Sorcery", "{B}")), toHand(s0, opp, card("Card C", "Sorcery", "{B}"))];
    const life = s0.players[opp]!.life;
    let s = activate(s0, ap, nx, 0, [{ kind: "player", id: opp }]);
    while (!s.pending && s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 1, exile: true });
    s = act(s, { type: "discard", player: opp, objectIds: [b] });
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[nx]!.counters.fade).toBe(4);
    expect(s.players[opp]!.life).toBe(life); // not a discard: Megrim doesn't trigger
    s = activate(s, ap, nx, 0, [{ kind: "player", id: opp }]);
    while (!s.pending && s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "discard", player: opp, objectIds: [c] });
    expect(s.players[opp]!.hand).toEqual([a]);
    // Another exiled card, not exiled with the Nexus, stays in exile.
    const other = toHand(s, opp, card("Card D", "Sorcery", "{B}"));
    moveObject(s, other, "exile");
    moveObject(s, nx, "graveyard");
    s = passAll(s);
    while (s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.hand.sort()).toEqual([a, b, c].sort());
    expect(s.objects[other]!.zone).toBe("exile");
  });

  it("Parallax Nexus: only as a sorcery, and not without a fade counter to remove", () => {
    const { s: s0, ap, opp, ids } = setup([card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." })]);
    const nx = putOnBattlefield(s0, ap, nexus);
    expect(compileCard(nexus).activated[0]!.sorcerySpeed).toBe(true);
    expect(planActivate(s0, ap, nx, 0, [{ kind: "player", id: opp }])).toBeNull(); // no fade counters
    s0.objects[nx]!.counters.fade = 1;
    expect(planActivate(s0, ap, nx, 0, [{ kind: "player", id: opp }])).not.toBeNull();
    // With a spell on the stack: not as a sorcery.
    let s = s0;
    const plan = planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!;
    for (const a of plan) s = act(s, a);
    expect(s.stack.length).toBe(1);
    expect(waitingOn(s)).toBe(ap);
    expect(planActivate(s, ap, nx, 0, [{ kind: "player", id: opp }])).toBeNull();
  });

  it("Mind Swords: each player chooses two, in turn order; a player with one card exiles it", () => {
    const { s: s0, ap, ids } = setup([mindSwords]);
    const order = [0, 1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    for (const p of order) emptyHand(s0, p, ids[0]);
    const hands: Record<PlayerId, string[]> = {};
    for (const p of order) hands[p] = [1, 2, 3].map((i) => toHand(s0, p, card(`Card ${p}${i}`, "Sorcery", "{B}")));
    // The last player has only one card.
    const last = order[3]!;
    for (const id of hands[last]!.slice(1)) moveObject(s0, id, "library");
    let s = cast(s0, ap, ids[0]!);
    while (!s.pending && s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const p of order.slice(0, 3)) {
      expect(s.pending).toMatchObject({ kind: "discard", player: p, count: 2, exile: true });
      s = act(s, { type: "discard", player: p, objectIds: hands[p]!.slice(0, 2) });
    }
    for (const p of order.slice(0, 3)) {
      expect(s.players[p]!.hand).toEqual([hands[p]![2]]);
      for (const id of hands[p]!.slice(0, 2)) expect(s.objects[id]!.zone).toBe("exile");
    }
    expect(s.players[last]!.hand).toEqual([]);
    expect(s.objects[hands[last]![0]!]!.zone).toBe("exile");
  });

  it("Witness the End: with no cards in hand the opponent still loses 2 life (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([witness]);
    emptyHand(s0, opp);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    while (s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Skullcap Snail: a bot opponent answers by exiling one of its cards", () => {
    const { s: s0, ap, opp, ids } = setup([snail]);
    emptyHand(s0, opp);
    const mine = [toHand(s0, opp, card("Swamp", "Basic Land — Swamp")), toHand(s0, opp, card("Card A", "Sorcery", "{B}"))];
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      const who = waitingOn(s)!;
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
      else if (s.pending) for (const a of botActions(s, who)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: who });
    }
    expect(mine.map((id) => s.objects[id]!.zone).sort()).toEqual(["exile", "hand"]);
  });
});
