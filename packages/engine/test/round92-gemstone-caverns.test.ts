// Round 92: Gemstone Caverns. "If this card is in your opening hand and you're not the starting player, you may begin
// the game with ~ on the battlefield with a luck counter on it. If you do, exile a card from your hand." (CR 103.6a,
// the starting player takes the first turn, 103.1), and its mana ability that makes any color with that counter.

import { describe, expect, it } from "vitest";
import { act, card, commander, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, createGame, isFullySupported, manaAbilitiesOn, manaChoices, waitingOn, type CardDef } from "../src";

// Real oracle text (Scryfall).
const caverns = card("Gemstone Caverns", "Legendary Land", "", {
  oracleText: "If this card is in your opening hand and you're not the starting player, you may begin the game with Gemstone Caverns on the battlefield with a luck counter on it. If you do, exile a card from your hand.\n{T}: Add {C}. If Gemstone Caverns has a luck counter on it, instead add one mana of any color.",
});
const deck = (extra: CardDef[]) => [...extra, ...Array.from({ length: 99 - extra.length }, () => forest)];
const game = (bots = false) => createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deck(Array.from({ length: 60 }, () => caverns)), isBot: bots })), 3);

describe("Gemstone Caverns", () => {
  it("parse", () => expect(isFullySupported(caverns)).toBe(true));

  it("the starting player isn't asked; the next player begins with it and a luck counter, then exiles a card", () => {
    let s = game();
    const first = s.activePlayer;
    const pend = s.pending;
    if (pend?.kind !== "searchLibrary") throw new Error("no opening choice");
    expect(pend.player).not.toBe(first);
    expect(pend.player).toBe(s.turnOrder[(s.turnOrder.indexOf(first) + 1) % 4]);
    const pid = pend.player;
    const cav = pend.cards[0]!;
    s = act(s, { type: "searchLibrary", player: pid, found: [cav] });
    expect(s.objects[cav]!.zone).toBe("battlefield");
    expect(s.objects[cav]!.counters.luck).toBe(1);
    const ex = s.pending;
    if (ex?.kind !== "searchLibrary" || !ex.exile) throw new Error("no exile choice");
    expect(ex.min).toBe(1);
    expect(ex.cards).toEqual(s.players[pid]!.hand);
    const gone = ex.cards[0]!;
    expect(() => act(s, { type: "searchLibrary", player: pid, found: [] })).toThrow();
    s = act(s, { type: "searchLibrary", player: pid, found: [gone] });
    expect(s.objects[gone]!.zone).toBe("exile");
    expect(s.players[pid]!.hand).toHaveLength(5); // seven, less the Caverns and the exiled card
    // The next player is asked next.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", opening: true });
    expect((s.pending as { player: number }).player).not.toBe(pid);
  });

  it("not taking it asks nothing more", () => {
    let s = game();
    const pid = (s.pending as { player: number }).player;
    s = act(s, { type: "searchLibrary", player: pid, found: [] });
    expect(s.players[pid]!.hand).toHaveLength(7);
    expect((s.pending as { player?: number } | null)?.player).not.toBe(pid);
  });

  it("bots take it and exile a card; only one of them", () => {
    let s = game(true);
    for (let i = 0; i < 20 && s.pending?.kind === "searchLibrary"; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    const first = s.turnOrder[0]!;
    for (const pid of s.turnOrder) {
      const mine = s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Gemstone Caverns");
      if (pid === first) expect(mine).toHaveLength(0);
      else {
        expect(mine.length).toBe(1);
        expect(s.players[pid]!.exile).toHaveLength(1); // only one of them, so only one card exiled
      }
    }
  });

  it("with a luck counter it makes any color; without, {C}", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, caverns);
    const ab = () => manaAbilitiesOn(s, s.objects[a]!)[0]!;
    expect(manaChoices(s, s.objects[a]!, ab())).toEqual(["C"]);
    s.objects[a]!.counters.luck = 1;
    expect(manaChoices(s, s.objects[a]!, ab())).toEqual(["W", "U", "B", "R", "G"]);
  });
});
