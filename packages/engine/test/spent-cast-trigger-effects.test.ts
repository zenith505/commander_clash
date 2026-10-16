// Cast triggers that look at the mana spent on the spell they're about (CR 601.2h): an intervening "if" (CR 603.4,
// Sahagin) or an "If five or more mana was spent to cast that spell" inside the effect (opus: Elemental Mascot,
// Molten-Core Maestro). Also "add an amount of {R} equal to ~'s power", and "put a +1/+1 counter on ~ and it can't be
// blocked this turn" as two instructions about ~.

import { describe, expect, it } from "vitest";
import { act, card, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const mascot = card("Elemental Mascot", "Creature — Elemental Bird", "{1}{U}{R}", { power: "1", toughness: "4", keywords: ["Flying", "Vigilance", "Opus"], oracleText: "Flying, vigilance\nOpus — Whenever you cast an instant or sorcery spell, this creature gets +1/+0 until end of turn. If five or more mana was spent to cast that spell, exile the top card of your library. You may play that card until the end of your next turn." });
const maestro = card("Molten-Core Maestro", "Creature — Goblin Bard", "{1}{R}", { power: "2", toughness: "2", keywords: ["Menace", "Opus"], oracleText: "Menace\nOpus — Whenever you cast an instant or sorcery spell, put a +1/+1 counter on this creature. If five or more mana was spent to cast that spell, add an amount of {R} equal to this creature's power." });
const sahagin = card("Sahagin", "Creature — Merfolk Warrior", "{1}{U}", { power: "1", toughness: "3", oracleText: "Whenever you cast a noncreature spell, if at least four mana was spent to cast it, put a +1/+1 counter on this creature and it can't be blocked this turn." });
const pet = card("Infernal Pet", "Creature — Imp", "{2}{B}", { power: "2", toughness: "2", oracleText: "Whenever you cast your second spell each turn, put a +1/+1 counter on this creature and it gains flying until end of turn." });

const big = card("Big Thoughts", "Sorcery", "{4}{U}", { oracleText: "Draw a card." });
const small = card("Small Thoughts", "Sorcery", "{1}{U}", { oracleText: "Draw a card." });

/** Cast it and resolve its cast triggers (not the spell). */
function castAndTrigger(s0: GameState, pid: PlayerId, id: string): GameState {
  let s = planCast(s0, pid, id)!.reduce((x, a) => act(x, a), s0);
  for (let i = 0; i < 20 && s.stack.length > 1 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("cast triggers about the mana spent", () => {
  it("parses", () => [mascot, maestro, sahagin, pet].forEach((d: CardDef) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Molten-Core Maestro: a counter either way; {R} equal to its power only for five or more mana", () => {
    for (const [spell, red] of [[big, 3], [small, 0]] as const) {
      const { s: s0, ap, ids } = setup([spell]);
      const m = putOnBattlefield(s0, ap, maestro);
      const s = castAndTrigger(s0, ap, ids[0]!);
      expect(pt(s, m)).toBe("3/3");
      expect(s.players[ap]!.manaPool.R).toBe(red);
    }
  });

  it("Elemental Mascot: +1/+0 either way; exiles the top card to play only for five or more mana", () => {
    for (const [spell, exiled] of [[big, 1], [small, 0]] as const) {
      const { s: s0, ap, ids } = setup([spell]);
      const m = putOnBattlefield(s0, ap, mascot);
      const before = s0.players[ap]!.exile.length;
      const s = castAndTrigger(s0, ap, ids[0]!);
      expect(pt(s, m)).toBe("2/4");
      expect(s.players[ap]!.exile.length - before).toBe(exiled);
    }
  });

  it("Sahagin: at least four mana, a counter and it can't be blocked this turn; less, nothing", () => {
    for (const [spell, after] of [[big, "2/4"], [small, "1/3"]] as const) {
      const { s: s0, ap, ids } = setup([spell]);
      const m = putOnBattlefield(s0, ap, sahagin);
      const s = castAndTrigger(s0, ap, ids[0]!);
      expect(pt(s, m)).toBe(after);
    }
  });
});
