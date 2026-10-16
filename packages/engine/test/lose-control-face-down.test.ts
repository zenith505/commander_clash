// "When you lose control of ~" (CR 603.2; Khârn rulings: it leaves the battlefield or another player gains control of
// it, and the player who lost control controls the trigger), and cards exiled face down with ~ (CR 406.3, 607.2a):
// Duplicity and Gustha's Scepter.

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { destroyPermanent, moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Something happens and every player passes: state-based actions and triggers get their turn. */
const pass = (s: GameState) => settle(act(s, { type: "passPriority", player: waitingOn(s)! }));

// Real oracle text (Scryfall).
const duplicity = card("Duplicity", "Enchantment", "{3}{U}{U}", { oracleText: "When this enchantment enters, exile the top five cards of your library face down.\nAt the beginning of your upkeep, you may exile all cards from your hand face down. If you do, put all other cards you own exiled with this enchantment into your hand.\nAt the beginning of your end step, discard a card.\nWhen you lose control of this enchantment, put all cards exiled with this enchantment into their owner's graveyard." });
const scepter = card("Gustha's Scepter", "Artifact", "{0}", { oracleText: "{T}: Exile a card from your hand face down. You may look at it for as long as it remains exiled.\n{T}: Return a card you own exiled with this artifact to your hand.\nWhen you lose control of this artifact, put all cards exiled with this artifact into their owner's graveyard." });
// Khârn the Betrayer's Sigil of Corruption on its own (Khârn's last ability isn't supported).
const sigil = card("Test Sigil Bearer", "Creature — Human", "{2}{R}", { power: "2", toughness: "2", oracleText: "When you lose control of this creature, draw two cards." });

/** Duplicity on `pid`'s battlefield, its enters trigger resolved. */
function withDuplicity(s: GameState, pid: PlayerId) {
  const d = putOnBattlefield(s, pid, duplicity);
  const top = s.players[pid]!.library.slice(0, 5);
  s.triggerQueue.push({ sourceId: d, sourceCardId: duplicity.oracleId, controller: pid, index: 0, sourceZc: s.objects[d]!.zoneChanges ?? 0 });
  return { s: settle(s), d, top };
}

describe("when you lose control of ~; cards exiled face down", () => {
  it("parse", () => {
    supported(duplicity, scepter, sigil);
    expect(compileCard(sigil).triggers[0]!.event).toBe("selfLostControl");
  });

  it("Duplicity exiles the top five face down; nobody may look at them", () => {
    const { s: s0, ap } = setup([]);
    const { s, top } = withDuplicity(s0, ap);
    for (const id of top) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    }
  });

  it("Duplicity's upkeep: swap the hand for the cards exiled with it", () => {
    const { s: s0, ap } = setup([bear(), bear({ name: "Other Bear" })]);
    const { s: s1, d, top } = withDuplicity(s0, ap);
    const hand = [...s1.players[ap]!.hand];
    s1.triggerQueue.push({ sourceId: d, sourceCardId: duplicity.oracleId, controller: ap, index: 1, sourceZc: s1.objects[d]!.zoneChanges ?? 0 });
    let s = settle(s1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect([...s.players[ap]!.hand].sort()).toEqual([...top].sort());
    for (const id of hand) expect(s.objects[id]!.zone).toBe("exile");
    // A second swap gets the old hand back, not the cards just exiled.
    s.triggerQueue.push({ sourceId: d, sourceCardId: duplicity.oracleId, controller: ap, index: 1, sourceZc: s.objects[d]!.zoneChanges ?? 0 });
    s = settle(s);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect([...s.players[ap]!.hand].sort()).toEqual([...hand].sort());
  });

  it("Duplicity with an empty hand: you may still exile it, and get the cards (rulings)", () => {
    const { s: s0, ap } = setup([]);
    [...s0.players[ap]!.hand].forEach((id) => moveObject(s0, id, "graveyard"));
    const { s: s1, d, top } = withDuplicity(s0, ap);
    expect(s1.players[ap]!.hand).toHaveLength(0);
    s1.triggerQueue.push({ sourceId: d, sourceCardId: duplicity.oracleId, controller: ap, index: 1, sourceZc: s1.objects[d]!.zoneChanges ?? 0 });
    let s = settle(s1);
    // A bot takes five cards for none.
    s = settle(act(s, botActions(s, ap)[0]!));
    expect([...s.players[ap]!.hand].sort()).toEqual([...top].sort());
  });

  it("Duplicity: another player gaining control of it puts the cards into their owner's graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const { s: s1, d, top } = withDuplicity(s0, ap);
    addEffect(s1, opp, [d], [{ kind: "control" }], "game");
    const s = pass(s1);
    for (const id of top) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining(top));
  });

  it("Duplicity leaving the battlefield: the same", () => {
    const { s: s0, ap } = setup([]);
    const { s: s1, d, top } = withDuplicity(s0, ap);
    destroyPermanent(s1, s1.objects[d]!, "destroyed");
    const s = settle(s1);
    for (const id of top) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Gustha's Scepter: hide a card, look at it, take it back; lose the Scepter and the card goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([bear(), bear({ name: "Hidden Bear" })]);
    const g = putOnBattlefield(s0, ap, scepter);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: g, index: 0 });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.objects[ids[1]!]!.hiddenExile?.seen).toEqual([ap]); // you may look at it
    // Take it back.
    s.objects[g]!.tapped = false;
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: g, index: 1 }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [ids[1]] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.objects[ids[1]!]!.hiddenExile).toBeUndefined();
    // Hide another, then lose the Scepter.
    s.objects[g]!.tapped = false;
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: g, index: 0 }));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    destroyPermanent(s, s.objects[g]!, "destroyed");
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Khârn's Sigil of Corruption: the player who lost control draws two", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, sigil);
    const s1 = pass(s0); // the game notices who controls it
    const hand = s1.players[ap]!.hand.length;
    const theirs = s1.players[opp]!.hand.length;
    addEffect(s1, opp, [k], [{ kind: "control" }], "game");
    const s = pass(s1);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[opp]!.hand.length).toBe(theirs);
    // Losing it again (it dies under the opponent): now they draw.
    destroyPermanent(s, s.objects[k]!, "destroyed");
    const t = settle(s);
    expect(t.players[opp]!.hand.length).toBe(theirs + 2);
  });

  it("a bot doesn't hide cards with the Scepter", () => {
    const { s: s0, ap } = setup([bear()]);
    putOnBattlefield(s0, ap, scepter);
    s0.priority = ap;
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility")).toBe(false);
  });
});
