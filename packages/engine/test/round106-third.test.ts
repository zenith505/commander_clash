// Round 106, more popular cards: The Scarab God ("each opponent loses X life and you scry X, where X is the number of
// Zombies you control") and Daxos, Blessed by the Sun ("whenever another creature you control enters or dies").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const scarab = card("The Scarab God", "Legendary Creature — God", "{3}{U}{B}", { power: "5", toughness: "5", oracleText: "At the beginning of your upkeep, each opponent loses X life and you scry X, where X is the number of Zombies you control.\n{2}{U}{B}: Exile target creature card from a graveyard. Create a token that's a copy of it, except it's a 4/4 black Zombie.\nWhen The Scarab God dies, return it to its owner's hand at the beginning of the next end step." });
const daxos = card("Daxos, Blessed by the Sun", "Legendary Enchantment Creature — Demigod", "{W}{W}", { power: "2", toughness: "*", oracleText: "Daxos's toughness is equal to your devotion to white. (Each {W} in the mana costs of permanents you control counts toward your devotion to white.)\nWhenever another creature you control enters or dies, you gain 1 life." });

// Test cards.
const zombie = (name: string) => card(name, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });
const murder = card("Test Murder", "Instant", "{1}{B}", { oracleText: "Destroy target creature." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 106: more popular cards", () => {
  it("parse", () => [scarab, daxos].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("The Scarab God: at your upkeep each opponent loses X life and you scry X, X = your Zombies", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, scarab);
    putOnBattlefield(s0, ap, zombie("Zombie A"));
    putOnBattlefield(s0, ap, zombie("Zombie B"));
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const life = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.life]));
    let s = passUntil(passUntil(s0, "end", ap), "upkeep", ap);
    s = settle(s);
    expect(s.pending?.kind).toBe("arrangeTop");
    for (let i = 0; i < 10 && s.pending; i++) {
      expect(s.pending!.kind).toBe("arrangeTop");
      if (s.pending!.kind !== "arrangeTop") break;
      expect(s.pending.cards.length).toBe(2);
      s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    }
    for (const p of opps) expect(s.players[p]!.life).toBe(life[p]! - 2);
    expect(s.players[ap]!.life).toBe(life[ap]);
  });

  it("The Scarab God: with no Zombies nothing happens", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, scarab);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const life = Object.fromEntries(opps.map((p) => [p, s0.players[p]!.life]));
    const s = settle(passUntil(passUntil(s0, "end", ap), "upkeep", ap));
    expect(s.pending).toBeFalsy();
    for (const p of opps) expect(s.players[p]!.life).toBe(life[p]);
  });

  it("Daxos: you gain 1 life when another creature you control enters, and when one dies", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Hand Bear" }), murder]);
    putOnBattlefield(s0, ap, daxos);
    const life = s0.players[ap]!.life;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life + 1);
    for (const a of planCast(s, ap, ids[1]!, [target(ids[0]!)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});
