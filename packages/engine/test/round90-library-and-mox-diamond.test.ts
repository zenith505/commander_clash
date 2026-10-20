// Sylvan Library and Mox Diamond (round 90).
// Sylvan Library: "you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each
// of those cards, pay 4 life or put the card on top of your library." Any card drawn this turn counts, the draw step's
// too; with fewer than two drawn cards in hand, those (rulings). Paying life needs that much life (CR 119.4).
// Mox Diamond: "If ~ would enter, you may discard a land card instead. If you do, put ~ onto the battlefield. If you
// don't, put it into its owner's graveyard." Without the discard it never enters (rulings).

import { describe, expect, it } from "vitest";
import { act, card, forest, fourPlayerGame, passUntil, putOnBattlefield } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sylvan = card("Sylvan Library", "Enchantment", "{1}{G}", { oracleText: "At the beginning of your draw step, you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on top of your library." });
const moxDiamond = card("Mox Diamond", "Artifact", "{0}", { oracleText: "If this artifact would enter, you may discard a land card instead. If you do, put this artifact onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add one mana of any color." });
const watcher = card("Enters Watcher", "Creature — Human", "{1}{W}", { power: "1", toughness: "1", oracleText: "Whenever another permanent enters, you gain 1 life." });

function toHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** On to `pid`'s next draw step, Sylvan Library's trigger waiting on its "you may". */
function toLibrary(s: GameState, pid: PlayerId): GameState {
  s = passUntil(s, "end", pid);
  s = passUntil(s, "draw", pid);
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Sylvan Library", () => {
  it("parses", () => expect(isFullySupported(sylvan)).toBe(true));

  it("draws two more, then for two of the three drawn cards pays 4 life or puts it back", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    putOnBattlefield(s, ap, sylvan);
    const before = s.players[ap]!.hand.slice();
    s = toLibrary(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Three drawn this turn: the draw step's and two more. Choose two of them.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2, hand: ap });
    const drawn = (s.pending as { cards: string[] }).cards;
    expect(drawn).toHaveLength(3);
    for (const id of before) expect(drawn).not.toContain(id);
    s = act(s, { type: "searchLibrary", player: ap, found: [drawn[0]!, drawn[1]!] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payOrTop", about: drawn[0] });
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseOption", player: ap, choice: "pay" });
    expect(s.players[ap]!.life).toBe(life - 4);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payOrTop", about: drawn[1] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "top" }));
    expect(s.players[ap]!.library[0]).toBe(drawn[1]);
    expect(s.players[ap]!.hand).toContain(drawn[0]);
    expect(s.players[ap]!.hand).toContain(drawn[2]);
  });

  it("with less than 4 life, the cards go back", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    putOnBattlefield(s, ap, sylvan);
    s = toLibrary(s, ap);
    s.players[ap]!.life = 3;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const drawn = (s.pending as { cards: string[] }).cards;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [drawn[2]!, drawn[0]!] }));
    expect(s.players[ap]!.life).toBe(3);
    // Handled in the order chosen: the second one back ends on top.
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([drawn[0], drawn[2]]);
  });

  it("not drawing: nothing more happens", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    putOnBattlefield(s, ap, sylvan);
    s = toLibrary(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.pending?.kind).not.toBe("searchLibrary");
  });

  it("a bot draws two more and pays or puts back two", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    putOnBattlefield(s, ap, sylvan);
    s = toLibrary(s, ap);
    const hand = s.players[ap]!.hand.length;
    for (let i = 0; i < 10 && s.pending; i++) s = act(s, botActions(s, ap)[0]!);
    s = settle(s);
    // Two more drawn; for two cards, 4 life paid or the card put back.
    const putBack = hand + 2 - s.players[ap]!.hand.length;
    const paid = (40 - s.players[ap]!.life) / 4;
    expect(putBack + paid).toBe(2);
  });
});

describe("Mox Diamond", () => {
  it("parses", () => expect(isFullySupported(moxDiamond)).toBe(true));

  it("enters only by discarding a land card; otherwise it goes to the graveyard and nothing sees it enter", () => {
    for (const discard of [true, false]) {
      let s = passUntil(fourPlayerGame(), "main1");
      const ap = s.activePlayer;
      s.players[ap]!.hand = [];
      putOnBattlefield(s, ap, watcher);
      const mox = toHand(s, ap, moxDiamond);
      const land = toHand(s, ap, forest);
      const life = s.players[ap]!.life;
      s = act(s, { type: "castSpell", player: ap, objectId: mox });
      for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "discardInstead", options: [land, "none"] });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: discard ? land : "none" }));
      expect(s.objects[mox]!.zone).toBe(discard ? "battlefield" : "graveyard");
      expect(s.objects[land]!.zone).toBe(discard ? "graveyard" : "hand");
      expect(s.players[ap]!.life).toBe(life + (discard ? 1 : 0));
    }
  });

  it("a bot doesn't cast it without a land card to discard", () => {
    const s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    s.players[ap]!.hand = [];
    const mox = toHand(s, ap, moxDiamond);
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === mox)).toBe(false);
  });
});
