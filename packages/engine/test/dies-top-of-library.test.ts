// "When ~ dies, put it on top of its owner's library" (Dark Revenant): the card in the graveyard, only while it's still
// that object there (CR 400.7, 603.10a; rulings on Dark Revenant). "You may" asks its controller (Avenging Angel).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const revenant = card("Dark Revenant", "Creature — Spirit", "{3}{B}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, put it on top of its owner's library." });
const angel = card("Avenging Angel", "Creature — Angel", "{3}{W}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, you may put it on top of its owner's library." });
const beast = card("Undying Beast", "Creature — Beast", "{3}{B}", { power: "3", toughness: "2", oracleText: "When this creature dies, put it on top of its owner's library." });
const blast = card("Test Blast", "Instant", "{R}", { oracleText: "Test Blast deals 3 damage to any target." });

/** Its controller's opponent kills it with Test Blast; returns the game with the dies trigger waiting to resolve. */
function kill(def: CardDef) {
  const { s: s0, ap, ids, opp } = setup([blast]);
  const victim = putOnBattlefield(s0, opp, def);
  let s = s0;
  for (const a of planCast(s, ap, ids[0]!, [target(victim)])!) s = act(s, a);
  for (let i = 0; i < 4 && s.objects[victim]!.zone === "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, ap, opp, victim };
}

describe("dies, put it on top of its owner's library", () => {
  it("parse", () => supported(revenant, angel, beast));

  it("Dark Revenant goes on top of its owner's library", () => {
    const { s: s0, opp, victim } = kill(revenant);
    expect(s0.objects[victim]!.zone).toBe("graveyard");
    const s = settle(s0);
    expect(s.objects[victim]!.zone).toBe("library");
    expect(s.players[opp]!.library[0]).toBe(victim);
  });

  it("if it left the graveyard first, it stays where it went (rulings)", () => {
    const { s: s0, victim } = kill(revenant);
    moveObject(s0, victim, "exile");
    const s = settle(s0);
    expect(s.objects[victim]!.zone).toBe("exile");
  });

  it("Avenging Angel: its controller may leave it in the graveyard", () => {
    const { s: s0, opp, victim } = kill(angel);
    let s = s0;
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const no = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(no.objects[victim]!.zone).toBe("graveyard");
    const yes = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(yes.players[opp]!.library[0]).toBe(victim);
  });
});
