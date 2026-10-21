// Round 103: Koma, Cosmos Serpent (a token named Koma's Coil: a token's name isn't the card's; "its activated abilities
// can't be activated this turn", mana abilities too: rulings, CR 605.1a).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, compileCard, controllerOf, isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const koma = card("Koma, Cosmos Serpent", "Legendary Creature — Serpent", "{3}{G}{G}{U}{U}", { power: "7", toughness: "7", oracleText: "This spell can't be countered.\nAt the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma's Coil.\nSacrifice another Serpent: Choose one —\n• Tap target permanent. Its activated abilities can't be activated this turn.\n• Koma gains indestructible until end of turn." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

const nabber = card("Treasure Nabber", "Creature — Goblin Rogue", "{2}{R}", { power: "3", toughness: "2", oracleText: "Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn." });
const ring = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });

const depths = card("Dark Depths", "Legendary Snow Land", "", { oracleText: "Dark Depths enters with ten ice counters on it.\n{3}: Remove an ice counter from Dark Depths.\nWhen Dark Depths has no ice counters on it, sacrifice it. If you do, create Marit Lage, a legendary 20/20 black Avatar creature token with flying and indestructible." });
const hexmage = card("Vampire Hexmage", "Creature — Vampire Shaman", "{B}{B}", { power: "2", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nSacrifice this creature: Remove all counters from target permanent." });

const run = (s: GameState, plan: ReturnType<typeof planActivate>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 103: Koma, Cosmos Serpent", () => {
  it("parse", () => {
    expect(isFullySupported(koma)).toBe(true);
    expect(JSON.stringify(compileCard(koma).triggers[0]!.body)).toContain(`"name":"Koma's Coil"`);
  });

  it("a Coil each upkeep; sacrificing one taps a permanent and stops its abilities, mana abilities too", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, koma);
    const e = putOnBattlefield(s0, opp, elf);
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    const coil = s.battlefield.find((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.name === "Koma's Coil");
    expect(coil).toBeDefined();
    expect(s.objects[coil!]!.controller).toBe(ap);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, ap, k, 0, [target(e)], [0], undefined, undefined, { sacrifice: [coil!] })));
    expect(s.objects[coil!]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[e]!.tapped).toBe(true);
    s.objects[e]!.tapped = false;
    expect(abilityProblem(s, opp, e, 0)).toBeTruthy();
  });
});

describe("round 103: Treasure Nabber", () => {
  it("parse", () => expect(isFullySupported(nabber)).toBe(true));

  it("an opponent's artifact tapped for mana is yours until the end of your next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, nabber);
    const stone = putOnBattlefield(s0, opp, ring);
    let s = passUntil(s0, "main1", opp);
    s = act(s, { type: "activateMana", player: opp, objectId: stone, mana: "C" });
    s = settle(s);
    expect(controllerOf(s, s.objects[stone]!)).toBe(ap);
    expect(s.objects[stone]!.tapped).toBe(true);
    // Still yours through your next turn, back at its end.
    s = passUntil(s, "main1", ap);
    expect(controllerOf(s, s.objects[stone]!)).toBe(ap);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(controllerOf(s, s.objects[stone]!)).toBe(opp);
  });
});

describe("round 103: Dark Depths", () => {
  it("parse", () => [depths, hexmage].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("the last ice counter removed: sacrificed for Marit Lage", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, depths);
    s0.objects[d]!.counters.ice = 1;
    const s = settle(run(s0, planActivate(s0, ap, d, 0)));
    expect(s.objects[d]!.zone).toBe("graveyard");
    const lage = s.battlefield.map((id) => s.objects[id]!).find((o) => s.cards[o.cardId]?.name === "Marit Lage");
    expect(lage).toBeDefined();
    expect(lage!.controller).toBe(ap);
  });

  it("Vampire Hexmage removes them all at once", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, depths);
    s0.objects[d]!.counters.ice = 10;
    const h = putOnBattlefield(s0, ap, hexmage);
    const s = settle(run(s0, planActivate(s0, ap, h, 0, [target(d)])));
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Marit Lage")).toHaveLength(1);
  });

  it("one that has left in response makes no Marit Lage", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, depths);
    s0.objects[d]!.counters.ice = 1;
    let s = run(s0, planActivate(s0, ap, d, 0));
    // The removal resolves; the state trigger goes on the stack.
    for (let i = 0; i < 10 && !s.stack.some((x) => x.triggered); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.some((x) => x.triggered)).toBe(true);
    // It leaves before the trigger resolves (bounced, say).
    s.battlefield.splice(s.battlefield.indexOf(d), 1);
    s.objects[d]!.zone = "hand";
    s.objects[d]!.zoneChanges = (s.objects[d]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.hand.push(d);
    s = settle(s);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]?.name === "Marit Lage")).toBe(false);
  });
});
