// Empower Jace (CR 701.71a), and loyalty abilities that planeswalkers gain from another permanent (CR 606.3).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const REMINDER = (n: string) => `(Put ${n} loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with "[−1]: Surveil 1" and "[−3]: Draw a card.")`;

// Real oracle text (Scryfall).
const amphisbaena = card("Arcane Amphisbaena", "Creature — Snake", "{3}{U}", { power: "3", toughness: "3", keywords: ["Deathtouch"], oracleText: `Deathtouch\nWhen this creature enters, empower Jace 2. ${REMINDER("two")}` });
const ascent = card("Academic Ascent", "Instant", "{1}{U}", { oracleText: `Target creature gets +2/+2 and gains flying until end of turn.\nEmpower Jace 2. ${REMINDER("two")}` });
const wildspeaker = card("Way of the Wildspeaker", "Enchantment", "{4}{G}{G}", {
  oracleText: `When Way of the Wildspeaker enters, empower Jace 7. ${REMINDER("seven")}\nPlaneswalkers you control have "[−4]: Create a 4/4 green Beast creature token with trample."`,
});
const warlord = card("Way of the Warlord", "Enchantment", "{3}{R}{R}", {
  oracleText: `When Way of the Warlord enters, empower Jace 5. ${REMINDER("five")}\nPlaneswalkers you control have "[−4]: This planeswalker deals 2 damage to up to one target creature or planeswalker and 2 damage to target player."`,
});
const jaceBeleren = card("Jace Beleren", "Legendary Planeswalker — Jace", "{1}{U}{U}", {
  loyalty: "3",
  oracleText: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.",
});

/** Pass priority until the stack is empty, answering nothing. */
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.resolving) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const jaceTokens = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Jace Token");

describe("empower Jace (CR 701.71a)", () => {
  it("compiles, and gained bracketed loyalty abilities compile", () => {
    supported(amphisbaena, ascent, wildspeaker, warlord);
  });

  it("creates a 0-loyalty Jace token first, then puts the counters on it; later it uses the same token", () => {
    const { s: s0, ap, ids } = setup([amphisbaena, ascent]);
    let s = settle(cast(s0, ap, ids[0]!));
    const [j] = jaceTokens(s, ap);
    expect(j).toBeDefined();
    expect(s.objects[j!]!.counters.loyalty).toBe(2);
    const tok = s.cards[s.objects[j!]!.cardId]!;
    expect(tok.types).toEqual(["Planeswalker"]);
    expect(tok.subtypes).toEqual(["Jace"]);
    expect(tok.colors).toEqual(["U"]);
    expect(abilitiesOf(s, s.objects[j!]!).activated.map((a) => a.loyalty)).toEqual([-1, -3]);
    s = settle(cast(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(jaceTokens(s, ap)).toEqual([j]);
    expect(s.objects[j!]!.counters.loyalty).toBe(4);
    // Its own abilities: −3 draws a card.
    const hand = s.players[ap]!.hand.length;
    s = activate(s, ap, j!, 1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[j!]!.counters.loyalty).toBe(1);
  });

  it("a nontoken Jace doesn't count (rulings)", () => {
    const { s: s0, ap, ids } = setup([amphisbaena]);
    const real = putOnBattlefield(s0, ap, jaceBeleren);
    s0.objects[real]!.counters.loyalty = 3;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[real]!.counters.loyalty).toBe(3);
    expect(jaceTokens(s, ap)).toHaveLength(1);
  });

  it("with several Jace tokens, you choose which one gets the counters (rulings)", () => {
    const { s: s0, ap, ids } = setup([amphisbaena, ascent, ascent]);
    let s = settle(cast(s0, ap, ids[0]!));
    // A second Jace token, as a copy effect could make one.
    const [j1] = jaceTokens(s, ap);
    const j2 = putOnBattlefield(s, ap, s.cards[s.objects[j1!]!.cardId]!);
    s.objects[j2]!.isToken = true;
    s.objects[j2]!.counters.loyalty = 1;
    s = cast(s, ap, ids[1]!, [target(ids[0]!)]);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, counter: "loyalty" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [j2] });
    s = settle(s);
    expect(s.objects[j2]!.counters.loyalty).toBe(3);
    expect(s.objects[j1!]!.counters.loyalty).toBe(2);
    // The bot answers that choice too.
    let t = cast(s, ap, ids[2]!, [target(ids[0]!)]);
    for (let i = 0; i < 10 && !t.pending; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = act(t, botActions(t, ap)[0]!);
    t = settle(t);
    expect(t.objects[j1!]!.counters.loyalty! + t.objects[j2]!.counters.loyalty!).toBe(7);
  });

  it("planeswalkers gain the Way's loyalty ability, still one loyalty ability per turn (CR 606.3, rulings)", () => {
    const { s: s0, ap, ids } = setup([wildspeaker]);
    const real = putOnBattlefield(s0, ap, jaceBeleren);
    s0.objects[real]!.counters.loyalty = 5;
    let s = settle(cast(s0, ap, ids[0]!));
    const [j] = jaceTokens(s, ap);
    expect(s.objects[j!]!.counters.loyalty).toBe(7);
    // The token has −1, −3 and the gained −4; Jace Beleren has +2, −1, −10 and −4.
    const gained = abilitiesOf(s, s.objects[real]!).activated.findIndex((a) => a.loyalty === -4);
    expect(gained).toBeGreaterThan(0);
    const beasts = () => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Beast Token").length;
    s = activate(s, ap, real, gained);
    expect(beasts()).toBe(1);
    expect(s.objects[real]!.counters.loyalty).toBe(1);
    expect(abilityProblem(s, ap, real, 0)).toMatch(/already activated this turn/);
    // The token can still use one this turn.
    s = activate(s, ap, j!, 2);
    expect(beasts()).toBe(2);
    expect(s.objects[j!]!.counters.loyalty).toBe(3);
  });

  it("'This planeswalker deals 2 damage' in a gained ability is the planeswalker with it", () => {
    const { s: s0, ap, opp, ids } = setup([warlord]);
    let s = settle(cast(s0, ap, ids[0]!));
    const [j] = jaceTokens(s, ap);
    const victim = putOnBattlefield(s, opp, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const life = s.players[opp]!.life;
    s = activate(s, ap, j!, 2, [target(victim), { kind: "player", id: opp }]);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[j!]!.counters.loyalty).toBe(1);
  });
});
