// "At the beginning of your first (precombat) main phase", "each of your postcombat main phases" and "your second main
// phase" (CR 505.1a-b): only the turn's first main phase is precombat; every other one, added ones too, is postcombat;
// "second" counts the main phases of this turn. With "the total amount of life your opponents have lost this turn"
// (Neheb, the Eternal; CR 119.3: damage makes a player lose that much life).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";
import { loseLife } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const neheb = card("Neheb, the Eternal", "Legendary Creature — Zombie Minotaur Warrior", "{3}{R}{R}", { power: "4", toughness: "6", keywords: ["Afflict"], oracleText: "Afflict 3 (Whenever this creature becomes blocked, defending player loses 3 life.)\nAt the beginning of each of your postcombat main phases, add {R} for each 1 life your opponents have lost this turn." });
const survivor = card("Cautious Survivor", "Creature — Elf Survivor", "{3}{G}", { power: "4", toughness: "4", keywords: ["Survival"], oracleText: "Survival — At the beginning of your second main phase, if this creature is tapped, you gain 2 life." });
const market = card("Black Market", "Enchantment", "{3}{B}{B}", { oracleText: "Whenever a creature dies, put a charge counter on this enchantment.\nAt the beginning of your first main phase, add {B} for each charge counter on this enchantment." });
const assault = card("Relentless Assault", "Sorcery", "{2}{R}{R}", { oracleText: "Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase." });

describe("main phase triggers", () => {
  it("parse", () => {
    supported(neheb, survivor, market);
    expect(compileCard(neheb).triggers.map((t) => t.event)).toContain("yourPostcombatMain");
    expect(compileCard(survivor).triggers[0]).toMatchObject({ event: "yourPostcombatMain", secondMain: true });
    expect(compileCard(market).triggers.map((t) => t.event)).toContain("yourFirstMain");
  });

  it("Neheb: {R} for each life your opponents lost this turn, not yours; again in an added main phase (rulings)", () => {
    const { s: s0, ap, ids } = setup([assault]);
    putOnBattlefield(s0, ap, neheb);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    loseLife(s0, o1!, 3);
    loseLife(s0, o2!, 2);
    loseLife(s0, ap, 4);
    let s = passUntil(s0, "main2", ap);
    s = settle(s);
    expect(s.players[ap]!.manaPool.R).toBe(5);
    // Relentless Assault: an additional combat phase and main phase after this one; that main phase is postcombat too.
    s = cast(s, ap, ids[0]!);
    s = settle(s);
    expect(s.addedPhases).toEqual(["combat", "main"]);
    loseLife(s, o1!, 1);
    s = passUntil(s, "beginCombat", ap);
    s = passUntil(s, "main2", ap);
    expect(s.mainPhasesThisTurn).toBe(3);
    s = settle(s);
    expect(s.players[ap]!.manaPool.R).toBe(6);
  });

  it("Survival: only in the turn's second main phase, and only if it's tapped then", () => {
    const { s: s0, ap, ids } = setup([assault]);
    const sv = putOnBattlefield(s0, ap, survivor);
    s0.objects[sv]!.tapped = true;
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "main2", ap);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 2);
    // A third main phase isn't the second (rulings).
    s = cast(s, ap, ids[0]!);
    s = settle(s);
    s.objects[sv]!.tapped = true;
    s = passUntil(s, "beginCombat", ap);
    s = passUntil(s, "main2", ap);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 2);
    // Untapped in the next turn's second main phase: no trigger.
    s = passUntil(s, "upkeep", s.turnOrder.find((p) => p !== ap));
    s.objects[sv]!.tapped = false;
    s = passUntil(s, "main2", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("Black Market: at the beginning of your first main phase, {B} for each charge counter; not in your second", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, market);
    s0.objects[m]!.counters.charge = 3;
    let s = passUntil(s0, "main2", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = passUntil(s, "upkeep", s.turnOrder.find((p) => p !== ap));
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(s.players[ap]!.manaPool.B).toBe(3);
  });
});
