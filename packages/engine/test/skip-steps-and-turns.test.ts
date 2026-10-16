// "Skip your next turn / untap step / draw step / combat phase" (CR 614.10): a replacement effect; the skipped step or
// turn doesn't happen. Skips add up, each one waiting for the next step or turn that isn't already skipped (614.10a;
// Avizoa, Brine Elemental, Blinding Angel and Stonehorn Dignitary rulings). "Doesn't untap during its controller's next
// untap step" waits for an untap step that isn't skipped (Brine Elemental rulings). "This turn" (Moment of Silence)
// does nothing if the player has no combat phase left this turn.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId, type Step } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function stepOnce(s: GameState): GameState {
  const pid = waitingOn(s)!;
  const pend = s.pending;
  if (pend?.kind === "declareAttackers") return act(s, { type: "declareAttackers", player: pid, attacks: [] });
  if (pend?.kind === "declareBlockers") return act(s, { type: "declareBlockers", player: pid, blocks: [] });
  if (pend?.kind === "discardToHandSize") return act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
  return act(s, { type: "passPriority", player: pid });
}
/** The active players of the next `k` turns. */
function nextTurns(s: GameState, k: number): PlayerId[] {
  const out: PlayerId[] = [];
  for (let i = 0; i < k; i++) {
    const turn = s.turn;
    for (let j = 0; j < 2000 && s.turn === turn; j++) s = stepOnce(s);
    out.push(s.activePlayer);
  }
  return out;
}
/** The steps of the rest of this turn, from where it is now. */
function restOfTurn(s: GameState): { steps: Step[]; s: GameState } {
  const steps: Step[] = [s.step];
  const turn = s.turn;
  for (let j = 0; j < 2000; j++) {
    s = stepOnce(s);
    if (s.turn !== turn) break;
    if (steps[steps.length - 1] !== s.step) steps.push(s.step);
  }
  return { steps, s };
}
const seat = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;

// Real oracle text (Scryfall).
const meditate = card("Meditate", "Instant", "{2}{U}", { oracleText: "Draw four cards. You skip your next turn." });
const eater = card("Eater of Days", "Artifact Creature — Leviathan", "{4}", { power: "9", toughness: "8", keywords: ["Flying", "Trample"], oracleText: "Flying, trample\nWhen this creature enters, you skip your next two turns." });
const chronatog = card("Chronatog", "Creature — Atog", "{1}{U}", { power: "1", toughness: "2", oracleText: "{0}: This creature gets +3/+3 until end of turn. You skip your next turn. Activate only once each turn." });
const manipulation = card("Temporal Manipulation", "Sorcery", "{3}{U}{U}", { oracleText: "Take an extra turn after this one." });
const fatigue = card("Fatigue", "Sorcery", "{1}{U}", { oracleText: "Target player skips their next draw step." });
const avizoa = card("Avizoa", "Creature — Jellyfish", "{3}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\n{0}: This creature gets +2/+2 until end of turn. You skip your next untap step. Activate only once each turn." });
const dovin = card("Dovin, Architect of Law", "Legendary Planeswalker — Dovin", "{4}{W}{U}", { loyalty: "5", oracleText: "+1: You gain 2 life and draw a card.\n−1: Tap target creature. It doesn't untap during its controller's next untap step.\n−9: Tap all permanents target opponent controls. That player skips their next untap step." });
const angel = card("Blinding Angel", "Creature — Angel", "{3}{W}{W}", { power: "2", toughness: "4", keywords: ["Flying"], oracleText: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever this creature deals combat damage to a player, that player skips their next combat phase." });
const silence = card("Moment of Silence", "Instant", "{W}", { oracleText: "Target player skips their next combat phase this turn." });
const dignitary = card("Stonehorn Dignitary", "Creature — Rhino Soldier", "{3}{W}", { power: "1", toughness: "4", oracleText: "When this creature enters, target opponent skips their next combat phase." });
const gargoyle = card("Ivory Gargoyle", "Creature — Gargoyle", "{4}{W}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, return it to the battlefield under its owner's control at the beginning of the next end step and you skip your next draw step.\n{4}{W}: Exile this creature." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const others = [
  card("Brine Elemental", "Creature — Elemental", "{4}{U}{U}", { power: "5", toughness: "4", keywords: ["Morph"], oracleText: "Morph {5}{U}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, each opponent skips their next untap step." }),
  card("Chronosavant", "Creature — Giant", "{5}{W}", { power: "5", toughness: "5", oracleText: "{1}{W}: Return this card from your graveyard to the battlefield tapped. You skip your next turn." }),
  card("Revenant Patriarch", "Creature — Spirit", "{4}{B}", { power: "4", toughness: "3", oracleText: "When this creature enters, if {W} was spent to cast it, target player skips their next combat phase.\nThis creature can't block." }),
  card("Shisato, Whispering Hunter", "Legendary Creature — Snake Warrior", "{3}{G}", { power: "2", toughness: "2", oracleText: "At the beginning of your upkeep, sacrifice a Snake.\nWhenever Shisato deals combat damage to a player, that player skips their next untap step." }),
  card("Unstable Hulk", "Creature — Goblin Mutant", "{1}{R}{R}", { power: "2", toughness: "2", keywords: ["Morph"], oracleText: "Morph {3}{R}{R} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, it gets +6/+6 and gains trample until end of turn. You skip your next turn." }),
  card("Waterspout Elemental", "Creature — Elemental", "{3}{U}{U}", { power: "3", toughness: "4", keywords: ["Kicker", "Flying"], oracleText: "Kicker {U} (You may pay an additional {U} as you cast this spell.)\nFlying\nWhen this creature enters, if it was kicked, return all other creatures to their owners' hands and you skip your next turn." }),
  card("Wormfang Manta", "Creature — Nightmare Fish Beast", "{5}{U}{U}", { power: "6", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you skip your next turn.\nWhen this creature leaves the battlefield, you take an extra turn after this one." }),
  card("Molten Firebird", "Creature — Phoenix", "{4}{R}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, return it to the battlefield under its owner's control at the beginning of the next end step and you skip your next draw step.\n{4}{R}: Exile this creature." }),
];

describe("skipping turns", () => {
  it("compile", () => supported(meditate, eater, chronatog, fatigue, avizoa, dovin, angel, silence, dignitary, gargoyle, ...others));

  it("Meditate: you draw four and your next turn doesn't happen", () => {
    const { s: s0, ap, ids, opp } = setup([meditate]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4);
    expect(nextTurns(s, 4)).toEqual([opp, seat(s, ap, 2), seat(s, ap, 3), opp]);
  });

  it("Eater of Days: you skip your next two turns", () => {
    const { s: s0, ap, ids } = setup([eater]);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(nextTurns(s, 10)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 0].map((k) => seat(s, ap, k)));
  });

  it("skips add up: Chronatog's skip and Meditate's are two turns", () => {
    const { s: s0, ap, ids } = setup([chronatog, meditate]);
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(activate(s, ap, ids[0]!, 0));
    s = settle(cast(s, ap, ids[1]!));
    expect(nextTurns(s, 10)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 0].map((k) => seat(s, ap, k)));
  });

  it("an extra turn is the next turn you'd take, so that's the one skipped", () => {
    const { s: s0, ap, ids, opp } = setup([manipulation, meditate]);
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(cast(s, ap, ids[1]!));
    expect(nextTurns(s, 2)).toEqual([opp, seat(s, ap, 2)]);
  });
});

describe("skipping steps", () => {
  it("Fatigue: the target player's next draw step doesn't happen", () => {
    const { s: s0, ap, ids, opp } = setup([fatigue]);
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = passUntil(s, "upkeep", opp);
    const hand = s.players[opp]!.hand.length;
    const { steps } = restOfTurn(s);
    expect(steps).not.toContain("draw");
    s = passUntil(s, "main1", opp);
    expect(s.players[opp]!.hand.length).toBe(hand);
    // Only the next one.
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "upkeep", opp);
    expect(restOfTurn(s).steps).toContain("draw");
  });

  it("Avizoa: your next untap step is skipped, and 'doesn't untap during its next untap step' waits for the one after", () => {
    const { s: s0, ap, ids } = setup([avizoa]);
    let s = settle(cast(s0, ap, ids[0]!));
    const d = putOnBattlefield(s, ap, dovin);
    s.objects[d]!.counters.loyalty = 5;
    const b = putOnBattlefield(s, ap, bear());
    s = settle(activate(s, ap, d, 1, [target(b)]));
    expect(s.objects[b]!.tapped).toBe(true);
    s = settle(activate(s, ap, ids[0]!, 0));
    // A land tapped to cast Avizoa stays tapped through the skipped untap step, and so does the bear.
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped && id !== b)!;
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[land]!.tapped).toBe(true);
    expect(s.objects[b]!.tapped).toBe(true);
    // The next untap step that isn't skipped: the land untaps, the bear doesn't.
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[land]!.tapped).toBe(false);
    expect(s.objects[b]!.tapped).toBe(true);
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[b]!.tapped).toBe(false);
  });

  it("Ivory Gargoyle: it comes back at the next end step and its controller skips their next draw step", () => {
    const { s: s0, ap, ids } = setup([gargoyle, murder]);
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(cast(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.skips).toEqual([{ what: "draw" }]);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = passUntil(s, "upkeep", ap);
    expect(restOfTurn(s).steps).not.toContain("draw");
  });
});

describe("skipping combat phases", () => {
  it("Blinding Angel: the player it hit skips their next combat phase", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, angel);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }));
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.players[opp]!.skips).toEqual([{ what: "combat" }]);
    s = passUntil(s, "main1", opp);
    const { steps } = restOfTurn(s);
    expect(steps).toEqual(["main1", "main2", "end", "cleanup"]);
  });

  it("two Stonehorn Dignitaries: that opponent skips their next two combat phases, over two turns", () => {
    const { s: s0, ap, ids, opp } = setup([dignitary, dignitary]);
    let s = settle(cast(s0, ap, ids[0]!));
    if (s.pending) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    s = settle(cast(s, ap, ids[1]!));
    if (s.pending) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.skips?.length).toBe(2);
    for (let k = 0; k < 2; k++) {
      s = passUntil(s, "main1", opp);
      const r = restOfTurn(s);
      expect(r.steps).not.toContain("beginCombat");
      s = r.s;
    }
    s = passUntil(s, "main1", opp);
    expect(restOfTurn(s).steps).toContain("beginCombat");
  });

  it("Moment of Silence on yourself before combat: no combat this turn", () => {
    const { s: s0, ap, ids } = setup([silence]);
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(restOfTurn(s).steps).not.toContain("beginCombat");
  });

  it("Moment of Silence on a player whose turn it isn't does nothing", () => {
    const { s: s0, ap, ids, opp } = setup([silence]);
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(restOfTurn(s).steps).toContain("beginCombat");
    s = passUntil(s, "main1", opp);
    expect(s.players[opp]!.skips).toBeUndefined();
    expect(restOfTurn(s).steps).toContain("beginCombat");
  });
});
