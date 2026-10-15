// "Whenever you attack with two or more creatures" and battalion ("Whenever ~ and at least two other creatures
// attack", as attackers are declared, CR 508.1); "You may cast [sorcery] spells as though they had flash" (CR 702.8a).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { castProblem, planCast, invalidateCharacteristics, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const intel = card("Military Intelligence", "Enchantment", "{1}{U}", { oracleText: "Whenever you attack with two or more creatures, draw a card." });
const elite = card("Boros Elite", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1", oracleText: "Battalion — Whenever this creature and at least two other creatures attack, this creature gets +2/+2 until end of turn." });
const dragon = card("Hypersonic Dragon", "Creature — Dragon", "{3}{U}{R}", {
  power: "4",
  toughness: "4",
  keywords: ["Flying", "Haste"],
  oracleText: "Flying, haste\nYou may cast sorcery spells as though they had flash. (You may cast them any time you could cast an instant.)",
});
const orrery = card("Vedalken Orrery", "Artifact", "{4}", { oracleText: "You may cast spells as though they had flash." });
const prophet = card("Prophet of Kruphix", "Creature — Human Wizard", "{3}{G}{U}", {
  power: "2",
  toughness: "3",
  oracleText: "Untap all creatures and lands you control during each other player's untap step.\nYou may cast creature spells as though they had flash.",
});
const sorcery = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function attackWith(s: GameState, ap: PlayerId, opp: PlayerId, ids: string[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: ids.map((attacker) => ({ attacker, defender: opp })) });
  return settle(s);
}
/** A card in `pid`'s hand. */
function inHand(s: GameState, pid: PlayerId, def: Parameters<typeof putOnBattlefield>[2]) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}

describe("attacking with two or more creatures", () => {
  it("compile", () => {
    for (const d of [intel, elite, dragon, orrery, prophet]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Military Intelligence: two attackers draw a card, one doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, intel);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    expect(attackWith(structuredClone(s0), ap, opp, [a]).players[ap]!.hand.length).toBe(hand);
    expect(attackWith(structuredClone(s0), ap, opp, [a, b]).players[ap]!.hand.length).toBe(hand + 1);
  });

  it("battalion: it and at least two others", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, elite);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    expect(pt(attackWith(structuredClone(s0), ap, opp, [e, a]), e)).toBe("1/1");
    expect(pt(attackWith(structuredClone(s0), ap, opp, [a, b]), e)).toBe("1/1"); // it has to attack too
    expect(pt(attackWith(structuredClone(s0), ap, opp, [e, a, b]), e)).toBe("3/3");
  });
});

describe("cast spells as though they had flash", () => {
  it("Hypersonic Dragon: sorceries at instant speed, but not creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const sor = inHand(s0, ap, sorcery);
    const crit = inHand(s0, ap, bear());
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(castProblem(s, ap, sor)).toMatch(/sorcery speed/);
    putOnBattlefield(s, ap, dragon);
    expect(planCast(s, ap, sor)).not.toBeNull();
    expect(castProblem(s, ap, crit)).toMatch(/sorcery speed/);
  });

  it("Vedalken Orrery: any spell; Prophet of Kruphix: creature spells", () => {
    const { s: s0, ap, opp } = setup([]);
    const sor = inHand(s0, ap, sorcery);
    const crit = inHand(s0, ap, bear());
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = putOnBattlefield(s, ap, prophet);
    expect(planCast(s, ap, crit)).not.toBeNull();
    expect(castProblem(s, ap, sor)).toMatch(/sorcery speed/);
    s.objects[p]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(p), 1);
    putOnBattlefield(s, ap, orrery);
    expect(planCast(s, ap, sor)).not.toBeNull();
    expect(planCast(s, ap, crit)).not.toBeNull();
    // Cast it on an opponent's turn.
    for (const a of planCast(s, ap, sor)!) s = act(s, a);
    expect(s.stack.at(-1)?.description).toBe("Divination");
  });
});
