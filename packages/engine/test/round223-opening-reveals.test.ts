// Round 223: cards revealed from the opening hand (CR 103.6b). "You may reveal this card from your opening hand. If you
// do, at the beginning of the first upkeep, ..." makes a delayed triggered ability of the revealing player's (CR 603.7):
// the Chancellors, Sphinx of Foresight, Providence and Devourer of Destiny.

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, forest, passUntil } from "./helpers";
import { botActions, createGame, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const dross = card("Chancellor of the Dross", "Creature — Phyrexian Vampire", "{4}{B}{B}{B}", {
  power: "6", toughness: "6", keywords: ["Flying", "Lifelink"],
  oracleText: "You may reveal this card from your opening hand. If you do, at the beginning of the first upkeep, each opponent loses 3 life, then you gain life equal to the life lost this way.\nFlying, lifelink",
});
const tangle = card("Chancellor of the Tangle", "Creature — Phyrexian Beast", "{4}{G}{G}{G}", {
  power: "6", toughness: "7", keywords: ["Reach", "Vigilance"],
  oracleText: "You may reveal this card from your opening hand. If you do, at the beginning of your first main phase of the game, add {G}.\nReach, vigilance",
});
const forge = card("Chancellor of the Forge", "Creature — Phyrexian Giant", "{4}{R}{R}{R}", {
  power: "5", toughness: "5",
  oracleText: "You may reveal this card from your opening hand. If you do, at the beginning of the first upkeep, create a 1/1 red Phyrexian Goblin creature token with haste.\nWhen this creature enters, create X 1/1 red Phyrexian Goblin creature tokens with haste, where X is the number of creatures you control.",
});
const spires = card("Chancellor of the Spires", "Creature — Phyrexian Sphinx", "{4}{U}{U}{U}", {
  power: "5", toughness: "7", keywords: ["Flying", "Mill"],
  oracleText: "You may reveal this card from your opening hand. If you do, at the beginning of the first upkeep, each opponent mills seven cards.\nFlying\nWhen this creature enters, you may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost.",
});
const sphinx = card("Sphinx of Foresight", "Creature — Sphinx", "{2}{U}{U}", {
  power: "4", toughness: "4", keywords: ["Scry", "Flying"],
  oracleText: "You may reveal this card from your opening hand. If you do, scry 3 at the beginning of your first upkeep.\nFlying\nAt the beginning of your upkeep, scry 1.",
});
const providence = card("Providence", "Sorcery", "{5}{W}{W}", {
  oracleText: "You may reveal this card from your opening hand. If you do, at the beginning of the first upkeep, your life total becomes 26.\nYour life total becomes 26.",
});
const devourer = card("Devourer of Destiny", "Creature — Eldrazi", "{5}{C}{C}", {
  power: "6", toughness: "6",
  oracleText: "You may reveal this card from your opening hand. If you do, at the beginning of your first upkeep, look at the top four cards of your library. You may put one of those cards back on top of your library. Exile the rest.\nWhen you cast this spell, exile target permanent that's one or more colors.",
});

/** Player 0's deck holds `n` copies of `c` (the rest forests), so the opening hand has some; the others play forests and bears. */
function game(c: CardDef, n = 60, seed = 7): GameState {
  const others = () => [...Array.from({ length: 50 }, () => forest), ...Array.from({ length: 49 }, () => bear())];
  const mine = [...Array.from({ length: n }, () => c), ...Array.from({ length: 99 - n }, () => forest)];
  return createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: i === 0 ? mine : others() })), seed);
}

/** The opening-hand reveal for player 0, revealing `pick(cards)`. */
function reveal(s: GameState, pick: (cards: string[]) => string[]): GameState {
  const pend = s.pending;
  if (pend?.kind !== "searchLibrary" || !pend.opening || !pend.reveal) throw new Error(`no reveal choice: ${pend?.kind}`);
  expect(pend.player).toBe(0);
  expect(pend.fromHand).toBe(true);
  return act(s, { type: "searchLibrary", player: 0, found: pick(pend.cards) });
}

describe("revealing cards from the opening hand", () => {
  it("parse", () => {
    for (const c of [dross, tangle, forge, spires, sphinx, providence, devourer]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("only player 0 is asked, about the cards it may reveal; then the game begins", () => {
    let s = game(dross);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", opening: true, reveal: true, player: 0 });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards.length).toBeGreaterThan(0);
    for (const id of cards) expect(s.objects[id]!.zone).toBe("hand");
    s = reveal(s, () => []);
    expect(s.pending).toBeNull();
    expect(s.delayed ?? []).toHaveLength(0);
    // Nothing happens at the first upkeep.
    s = passUntil(s, "main1");
    expect(s.players.map((p) => p.life)).toEqual([40, 40, 40, 40]);
  });

  it("Chancellor of the Dross: at the first upkeep each opponent loses 3 life and you gain that much", () => {
    let s = game(dross);
    s = reveal(s, (c) => [c[0]!]);
    expect(s.log.some((l) => /A reveals Chancellor of the Dross from their opening hand/.test(l.text))).toBe(true);
    // The card stays in the hand.
    s = passUntil(s, "upkeep");
    // The first upkeep of the game, whoever's it is.
    expect(s.turn).toBe(1);
    while (s.step === "upkeep") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players.map((p) => p.life)).toEqual([49, 37, 37, 37]);
    // Only once.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % 4]);
    expect(s.players.map((p) => p.life)).toEqual([49, 37, 37, 37]);
  });

  it("each one revealed makes its own trigger (Chancellor of the Spires rulings): two of them mill fourteen each", () => {
    let s = game(spires);
    s = reveal(s, (c) => c.slice(0, 2));
    s = passUntil(s, "upkeep");
    while (s.step === "upkeep") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[0]!.graveyard).toHaveLength(0);
    for (const pid of [1, 2, 3]) expect(s.players[pid]!.graveyard.length, `player ${pid}`).toBe(14);
  });

  it("Chancellor of the Forge: a 1/1 red Phyrexian Goblin with haste at the first upkeep", () => {
    let s = game(forge);
    s = reveal(s, (c) => [c[0]!]);
    s = passUntil(s, "upkeep");
    while (s.step === "upkeep") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === 0);
    expect(tokens).toHaveLength(1);
    expect(s.cards[s.objects[tokens[0]!]!.cardId]!.name).toBe("Phyrexian Goblin Token");
  });

  it("Chancellor of the Tangle: {G} at the beginning of your first main phase, not anyone else's", () => {
    let s = game(tangle);
    s = reveal(s, (c) => [c[0]!]);
    expect(s.delayed?.[0]?.when).toBe("yourNextFirstMain");
    // Another player's first main phase: nothing.
    if (s.activePlayer !== 0) {
      s = passUntil(s, "main1");
      while (s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.delayed).toHaveLength(1);
    }
    s = passUntil(s, "main1", 0);
    expect(s.stack).toHaveLength(1);
    while (s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main1");
    expect(s.players[0]!.manaPool.G).toBe(1);
    expect(s.delayed ?? []).toHaveLength(0);
  });

  it("Sphinx of Foresight: two revealed scry 3 twice at your first upkeep (rulings)", () => {
    let s = game(sphinx);
    s = reveal(s, (c) => c.slice(0, 2));
    s = passUntil(s, "upkeep", 0);
    let scries = 0;
    for (let i = 0; i < 40 && s.step === "upkeep"; i++) {
      const pend = s.pending;
      if (pend?.kind === "arrangeTop") {
        expect(pend.player).toBe(0);
        expect(pend.cards).toHaveLength(3);
        scries++;
        s = act(s, { type: "arrangeTop", player: 0, top: pend.cards, away: [] });
      } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(scries).toBe(2);
  });

  it("Providence: your life total becomes 26 at the first upkeep; the bot doesn't reveal it at 40 life", () => {
    let s = game(providence);
    const acts = botActions(s, 0);
    expect(acts).toEqual([{ type: "searchLibrary", player: 0, found: [] }]);
    s = reveal(s, (c) => [c[0]!]);
    s = passUntil(s, "upkeep");
    while (s.step === "upkeep") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[0]!.life).toBe(26);
  });

  it("the bot reveals its Chancellors", () => {
    const s = game(dross);
    const [a] = botActions(s, 0);
    expect(a).toEqual({ type: "searchLibrary", player: 0, found: (s.pending as { cards: string[] }).cards });
  });

  it("Devourer of Destiny: look at the top four at your first upkeep, put up to one back on top, exile the rest", () => {
    let s = game(devourer, 30);
    s = reveal(s, (c) => [c[0]!]);
    s = passUntil(s, "upkeep", 0);
    const top = s.players[0]!.library.slice(0, 4);
    for (let i = 0; i < 40 && s.step === "upkeep" && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending;
    if (pend?.kind !== "searchLibrary" || !pend.dig) throw new Error("no choice");
    expect(pend.dig.looked).toEqual(top);
    expect(pend.max).toBe(1);
    expect(pend.min).toBe(0);
    s = act(s, { type: "searchLibrary", player: 0, found: [top[2]!] });
    expect(s.players[0]!.library[0]).toBe(top[2]);
    for (const id of [top[0]!, top[1]!, top[3]!]) expect(s.objects[id]!.zone).toBe("exile");
  });
});
