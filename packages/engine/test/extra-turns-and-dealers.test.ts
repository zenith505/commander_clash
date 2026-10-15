// Extra turns (CR 500.7: taken directly after this one, the most recently created first), "you lose the game" at that
// turn's end step (Final Fortune), "Target player loses the game", and "Whenever a creature you control deals combat
// damage to a player" (once for each creature, CR 510.2 and 603.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const gnawbone = card("Old Gnawbone", "Legendary Creature — Dragon", "{5}{G}{G}", {
  power: "7",
  toughness: "7",
  keywords: ["Flying"],
  oracleText: "Flying\nWhenever a creature you control deals combat damage to a player, create that many Treasure tokens.",
});
const piracy = card("Coastal Piracy", "Enchantment", "{2}{U}{U}", {
  oracleText: "Whenever a creature you control deals combat damage to an opponent, you may draw a card.",
});
const manipulation = card("Temporal Manipulation", "Sorcery", "{3}{U}{U}", { oracleText: "Take an extra turn after this one." });
const timeWarp = card("Time Warp", "Sorcery", "{3}{U}{U}", { oracleText: "Target player takes an extra turn after this one." });
const finalFortune = card("Final Fortune", "Instant", "{R}{R}", {
  oracleText: "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game.",
});
const sundering = card("Karn's Temporal Sundering", "Legendary Sorcery", "{4}{U}{U}", {
  oracleText:
    "(You may cast a legendary sorcery only if you control a legendary creature or planeswalker.)\nTarget player takes an extra turn after this one. Return up to one target nonland permanent to its owner's hand. Exile Karn's Temporal Sundering.",
});
const door = card("Door to Nothingness", "Artifact", "{5}", {
  oracleText: "This artifact enters tapped.\n{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, {T}, Sacrifice this artifact: Target player loses the game.",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

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
function stepOnce(s: GameState): GameState {
  const pid = waitingOn(s)!;
  const pend = s.pending;
  if (pend?.kind === "declareAttackers") return act(s, { type: "declareAttackers", player: pid, attacks: [] });
  if (pend?.kind === "declareBlockers") return act(s, { type: "declareBlockers", player: pid, blocks: [] });
  if (pend?.kind === "discardToHandSize") return act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
  return act(s, { type: "passPriority", player: pid });
}

describe("extra turns", () => {
  it("compile", () => {
    for (const d of [gnawbone, piracy, manipulation, timeWarp, finalFortune, sundering, door]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("take an extra turn after this one, then the normal order goes on", () => {
    const { s: s0, ap, ids, opp } = setup([manipulation]);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(nextTurns(s, 2)).toEqual([ap, opp]);
  });

  it("target player takes it; the turn after goes to the player after the one whose turn it was", () => {
    const { s: s0, ap, ids, opp } = setup([timeWarp]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: third }]));
    expect(nextTurns(s, 3)).toEqual([third, opp, third]);
  });

  it("the most recently created extra turn is taken first (CR 500.7)", () => {
    const { s: s0, ap, ids, opp } = setup([timeWarp, timeWarp]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, island);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: third }]));
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(nextTurns(s, 3)).toEqual([opp, third, opp]);
  });

  it("Final Fortune: you lose the game at the beginning of the extra turn's end step", () => {
    const { s: s0, ap, ids, opp } = setup([finalFortune]);
    let s = settle(cast(s0, ap, ids[0]!));
    s = passUntil(s, "upkeep", ap);
    const extraTurn = s.turn;
    expect(s.players[ap]!.lost).toBe(false);
    s = passUntil(s, "end", ap);
    expect(s.turn).toBe(extraTurn);
    expect(s.players[ap]!.lost).toBe(false);
    s = settle(s);
    expect(s.players[ap]!.lost).toBe(true);
    expect(s.activePlayer).toBe(opp);
  });

  it("an exiled extra-turn spell goes to exile, not the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([sundering]);
    putOnBattlefield(s0, ap, card("Legend", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1" }));
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }, { kind: "object", id: b }]));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("hand");
    expect(nextTurns(s, 1)).toEqual([ap]);
  });
});

describe("whenever a creature you control deals combat damage to a player", () => {
  it("once for each creature; 'that many' is its damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gnawbone);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "3" }));
    putOnBattlefield(s0, opp, bear()); // a creature the opponent controls doesn't count
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }, { attacker: b2, defender: opp }] });
    s = passUntil(s, "endCombat", ap);
    s = settle(s);
    const treasures = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Treasure Token" && s.objects[id]!.controller === ap);
    expect(treasures.length).toBe(5);
    expect(s.players[opp]!.life).toBe(35);
  });
});
