// Triggers and choices from the most played cards (round 90): Orcish Bowmasters ("When ~ enters and whenever an opponent
// draws a card except the first one they draw in each of their draw steps"), Faerie Mastermind ("their second card each
// turn"), Mirkwood Bats ("Whenever you create or sacrifice a token": once for each token, CR 111.2; a copy of a permanent
// spell becoming a token isn't created, 111.12), Tireless Provisioner ("create a Food token or a Treasure token"), Rhythm
// of the Wild ("Nontoken creatures you control have riot": riot from another permanent applies as the creature enters,
// CR 614.12, rulings) and Gamble (the card found may be the one discarded, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, fourPlayerGame, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, draw, invalidateCharacteristics, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const bowmasters = card("Orcish Bowmasters", "Creature — Orc Archer", "{1}{B}", { power: "1", toughness: "1", keywords: ["Flash", "Amass"], oracleText: "Flash\nWhen this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1." });
const mastermind = card("Faerie Mastermind", "Creature — Faerie Rogue", "{1}{U}", { power: "2", toughness: "1", keywords: ["Flash", "Flying"], oracleText: "Flash\nFlying\nWhenever an opponent draws their second card each turn, you draw a card.\n{3}{U}: Each player draws a card." });
const bats = card("Mirkwood Bats", "Creature — Bat", "{3}{B}", { power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever you create or sacrifice a token, each opponent loses 1 life." });
const provisioner = card("Tireless Provisioner", "Creature — Elf Scout", "{2}{G}", { power: "3", toughness: "2", oracleText: "Landfall — Whenever a land you control enters, create a Food token or a Treasure token. (Food is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\" Treasure is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const rhythm = card("Rhythm of the Wild", "Enchantment", "{1}{R}{G}", { oracleText: "Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)" });
const gamble = card("Gamble", "Sorcery", "{R}", { oracleText: "Search your library for a card, put that card into your hand, discard a card at random, then shuffle." });
const raise = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });

function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function toHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const queued = (s: GameState, src: string) => s.triggerQueue.filter((t) => t.sourceId === src).length + s.stack.filter((x) => x.sourceId === src).length;

describe("triggers from the most played cards", () => {
  it("parse", () => {
    for (const d of [bowmasters, mastermind, bats, provisioner, rhythm, gamble]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Orcish Bowmasters triggers on an opponent's draws except the first one in their draw step", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const bm = putOnBattlefield(s, ap, bowmasters);
    // The opponent's draw step: their turn's draw doesn't trigger it, a second card does.
    s = passUntil(s, "draw", opp);
    expect(queued(s, bm)).toBe(0);
    draw(s, opp, 1);
    expect(queued(s, bm)).toBe(1);
    s.triggerQueue = [];
    // Outside their draw step, every card: two cards, two triggers.
    s = passUntil(s, "main1", opp);
    draw(s, opp, 2);
    expect(queued(s, bm)).toBe(2);
    s.triggerQueue = [];
    // Not you.
    draw(s, ap, 1);
    expect(queued(s, bm)).toBe(0);
  });

  it("Orcish Bowmasters deals 1 damage as it enters, then amasses Orcs 1", () => {
    const { s: s0, ap, ids, opp } = setup([bowmasters]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 1);
    const army = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.subtypes.includes("Army"));
    expect(army).toBeDefined();
    expect(s.objects[army!]!.counters["+1/+1"]).toBe(1);
    expect(s.cards[s.objects[army!]!.cardId]!.subtypes).toContain("Orc");
  });

  it("Faerie Mastermind draws when an opponent draws their second card in a turn", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const fm = putOnBattlefield(s, ap, mastermind);
    draw(s, opp, 1);
    expect(queued(s, fm)).toBe(0);
    draw(s, opp, 1);
    expect(queued(s, fm)).toBe(1);
    draw(s, opp, 1);
    expect(queued(s, fm)).toBe(1);
  });

  it("Mirkwood Bats: each token created", () => {
    const { s: s0, ap, ids } = setup([raise]);
    const b = putOnBattlefield(s0, ap, bats);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const s = settle(cast(s0, ap, ids[0]!));
    // Two Soldiers: two triggers.
    expect(s.log.filter((l) => /Mirkwood Bats/.test(l.text)).length).toBeGreaterThan(0);
    for (const o of opps) expect(s.players[o]!.life).toBe(38);
    void b;
  });

  it("Mirkwood Bats: sacrificing a Treasure", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bats);
    const treasure = putOnBattlefield(s0, ap, card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." }));
    s0.objects[treasure]!.isToken = true;
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const s = settle(act(s0, { type: "activateMana", player: ap, objectId: treasure, mana: "R" }));
    for (const o of opps) expect(s.players[o]!.life).toBe(39);
  });

  it("Tireless Provisioner: a Food or a Treasure, chosen as it resolves", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    putOnBattlefield(s, ap, provisioner);
    const land = toHand(s, ap, forest);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: ap, labels: ["create a Food token", "create a Treasure token"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).map((id) => s.cards[s.objects[id]!.cardId]!.name);
    expect(tokens).toEqual(["Treasure Token"]);
  });

  it("a bot's Tireless Provisioner makes a Treasure", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    putOnBattlefield(s, ap, provisioner);
    const land = toHand(s, ap, forest);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const [a] = botActions(s, ap);
    s = settle(act(s, a!));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Treasure Token")).toBe(true);
  });

  it("Rhythm of the Wild gives a creature spell riot as it enters, not tokens", () => {
    const { s: s0, ap, ids } = setup([bear(), raise]);
    putOnBattlefield(s0, ap, rhythm);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "riot" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Haste" }));
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.pending).toBeNull();
  });

  it("Gamble finds a card, then discards one at random", () => {
    const { s: s0, ap, ids } = setup([gamble]);
    const hand = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pick = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    // Gamble left the hand, the found card came and one card was discarded.
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.players[ap]!.graveyard.length).toBe(2);
  });
});
