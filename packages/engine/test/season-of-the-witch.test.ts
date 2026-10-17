// Season of the Witch: "destroy all untapped creatures that didn't attack this turn, except for creatures that couldn't
// attack" destroys the creatures that could have been declared as attackers that turn but weren't (rulings, CR 508.1a).
// Seasons Past: "Return any number of cards with different mana values from your graveyard to your hand", chosen as it
// resolves (rulings); X in a mana cost counts as 0 and a land has mana value 0 (CR 202.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions } from "../src/bot";
import { isFullySupported, manaValue, parseManaCost, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const witch = card("Season of the Witch", "Enchantment", "{B}{B}{B}", { oracleText: "At the beginning of your upkeep, sacrifice this enchantment unless you pay 2 life.\nAt the beginning of the end step, destroy all untapped creatures that didn't attack this turn, except for creatures that couldn't attack." });
const past = card("Seasons Past", "Sorcery", "{4}{G}{G}", { oracleText: "Return any number of cards with different mana values from your graveyard to your hand. Put Seasons Past on the bottom of its owner's library." });
const vigilant = (name: string) => bear({ name, keywords: ["Vigilance"], oracleText: "Vigilance" });
const wall = card("Wall of Stone", "Creature — Wall", "{1}{R}{R}", { power: "0", toughness: "8", keywords: ["Defender"], oracleText: "Defender" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const fireball = card("Fireball", "Sorcery", "{X}{R}", { oracleText: "This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

const onField = (s: GameState, id: string) => s.battlefield.includes(id);

/** Runs to `step`, declaring `attacks` for the active player when attackers are declared. */
function attackWith(s: GameState, attacks: { attacker: string; defender: PlayerId }[]) {
  s = passUntil(s, "declareAttackers");
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks });
}

/** On to the end step, then resolve what triggered there. */
function toEndStep(s: GameState) {
  s = passUntil(s, "end");
  for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Season of the Witch", () => {
  it("compiles", () => expect(isFullySupported(witch)).toBe(true));

  it("destroys the untapped creatures that could have attacked but didn't, and spares the rest", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, witch);
    const idle = putOnBattlefield(s, ap, bear({ name: "Idle Bear" }));
    const raider = putOnBattlefield(s, ap, vigilant("Vigilant Bear"));
    const sick = putOnBattlefield(s, ap, bear({ name: "New Bear" }), { sick: true });
    const defender = putOnBattlefield(s, ap, wall);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = attackWith(s, [{ attacker: raider, defender: opp }]);
    s = toEndStep(s);
    // Could attack, didn't: destroyed.
    expect(onField(s, idle)).toBe(false);
    // Attacked (and is still untapped thanks to vigilance), had summoning sickness, has defender, or isn't the active
    // player's: none of them could have been destroyed this way.
    expect(onField(s, raider)).toBe(true);
    expect(onField(s, sick)).toBe(true);
    expect(onField(s, defender)).toBe(true);
    expect(onField(s, theirs)).toBe(true);
  });

  it("spares a creature that's tapped at the end step and one that entered after attackers were declared", () => {
    let { s, ap, opp, ids } = setup([giant]);
    putOnBattlefield(s, ap, witch);
    const tapped = putOnBattlefield(s, ap, bear({ name: "Tapped Bear" }));
    s = attackWith(s, []);
    s.objects[tapped]!.tapped = true;
    // In the second main phase: a creature that wasn't there when attackers were declared couldn't attack, even with haste.
    s = passUntil(s, "main2");
    s = cast(s, ap, ids[0]!);
    const late = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Hill Giant")!;
    expect(late).toBeDefined();
    s = toEndStep(s);
    expect(onField(s, tapped)).toBe(true);
    expect(onField(s, late)).toBe(true);
    void opp;
  });

  it("triggers at every end step: on an opponent's turn it destroys their idle creatures, not yours", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, witch);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    s = attackWith(s, [{ attacker: mine, defender: opp }]);
    s = toEndStep(s);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const theirs = putOnBattlefield(s, next, bear({ name: "Their Idle Bear" }));
    const mineIdle = putOnBattlefield(s, ap, bear({ name: "My Idle Bear" }));
    s = passUntil(s, "main1", next);
    s = attackWith(s, []);
    s = toEndStep(s);
    expect(s.activePlayer).toBe(next);
    expect(onField(s, theirs)).toBe(false);
    expect(onField(s, mineIdle)).toBe(true);
    expect(onField(s, mine)).toBe(true);
  });

  it("a creature that could attack, then left and came back, is a new object that couldn't (CR 400.7)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, witch);
    const b = putOnBattlefield(s, ap, bear());
    s = attackWith(s, []);
    expect(s.objects[b]!.couldAttack).toBe(s.turn);
    s.objects[b]!.couldAttack = undefined; // as a blink would leave it
    s = toEndStep(s);
    expect(onField(s, b)).toBe(true);
  });
});

describe("Seasons Past", () => {
  const graveyard = (s: GameState, pid: PlayerId, defs: CardDef[]) =>
    defs.map((d) => {
      const id = putOnBattlefield(s, pid, d);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[pid]!.graveyard.push(id);
      return id;
    });

  it("compiles", () => expect(isFullySupported(past)).toBe(true));

  it("returns the cards you choose, no two with the same mana value, then goes to the bottom of your library", () => {
    let { s, ap, ids } = setup([past]);
    const [b1, b2, g, sh, fb] = graveyard(s, ap, [bear({ name: "Bear One" }), bear({ name: "Bear Two" }), giant, shock, fireball]);
    s = cast(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "hand", distinctManaValues: true, min: 0 });
    // Bears are 2, Hill Giant 4, Shock 1, Fireball 1 (X is 0): three different mana values.
    expect(s.pending?.kind === "searchLibrary" && s.pending.max).toBe(3);
    // Two cards with mana value 2, or Shock with Fireball, are refused.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [b1!, b2!] })).toThrow(/different mana values/);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [sh!, fb!] })).toThrow(/different mana values/);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [b1!, g!, fb!] }));
    const hand = s.players[ap]!.hand;
    expect(hand).toEqual(expect.arrayContaining([b1, g, fb]));
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining([b2, sh]));
    // Seasons Past itself goes to the bottom of its owner's library, not the graveyard.
    const lib = s.players[ap]!.library;
    expect(s.cards[s.objects[lib[lib.length - 1]!]!.cardId]!.name).toBe("Seasons Past");
  });

  it("may return nothing", () => {
    let { s, ap, ids } = setup([past]);
    const [b1] = graveyard(s, ap, [bear()]);
    s = cast(s, ap, ids[0]!);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.players[ap]!.graveyard).toContain(b1);
  });

  it("a bot takes one card of each mana value", () => {
    let { s, ap, ids } = setup([past]);
    graveyard(s, ap, [bear({ name: "Bear One" }), bear({ name: "Bear Two" }), giant, shock, fireball]);
    s = cast(s, ap, ids[0]!);
    const [answer] = botActions(s, ap);
    expect(answer?.type).toBe("searchLibrary");
    const found = answer?.type === "searchLibrary" ? answer.found : [];
    expect(found).toHaveLength(3);
    expect(new Set(found.map((id) => manaValue(parseManaCost(s.cards[s.objects[id]!.cardId]!.manaCost)))).size).toBe(3);
    s = passAll(act(s, answer!));
    expect(s.stack).toHaveLength(0);
  });
});
