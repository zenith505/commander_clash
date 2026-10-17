// "Each opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and planeswalkers
// they control" (Soul Shatter, Flare of Malice, Break Under Pressure, Riveteers Charm): each picks one of their own with
// the greatest mana value, choosing among those tied, in APNAP order (rulings on Soul Shatter and Flare of Malice).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const shatter = card("Soul Shatter", "Instant", "{2}{B}", { oracleText: "Each opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control." });
const pressure = card("Break Under Pressure", "Instant", "{2}{B}", { oracleText: "Target opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control. You gain 2 life." });
const flare = card("Flare of Malice", "Instant", "{2}{B}{B}", { oracleText: "You may sacrifice a nontoken black creature rather than pay this spell's mana cost.\nEach opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control." });
const charm = card("Riveteers Charm", "Instant", "{B}{R}{G}", { oracleText: "Choose one —\n• Target opponent sacrifices a creature or planeswalker they control with the greatest mana value among creatures and planeswalkers they control.\n• Exile the top three cards of your library. Until your next end step, you may play those cards.\n• Exile target player's graveyard." });
const ogre = card("Big Ogre", "Creature — Ogre", "{2}{R}{R}", { power: "1", toughness: "1" });
const walker = card("Four Walker", "Legendary Planeswalker — Test", "{2}{U}{U}", { loyalty: "4", oracleText: "+1: You gain 1 life." });
const hydra = card("X Hydra", "Creature — Hydra", "{X}{G}{G}", { power: "3", toughness: "3" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("sacrifices the one with the greatest mana value", () => {
  it("compiles", () => supported(shatter, pressure, flare, charm));

  it("a creature and a planeswalker tied: the opponent chooses between just those two", () => {
    const { s: s0, ap, opp, ids } = setup([pressure]);
    const small = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, ogre);
    const pw = putOnBattlefield(s0, opp, walker);
    s0.objects[pw]!.counters.loyalty = 4;
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "sacrifice", count: 1, what: "creature or planeswalker with the greatest mana value" });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([big, pw].sort());
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [pw] }));
    expect(s.objects[pw]!.zone).toBe("graveyard");
    expect([small, big].map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("each opponent loses their own greatest; X counts as 0 on the battlefield (CR 107.3)", () => {
    const { s: s0, ap, opp, ids } = setup([shatter]);
    const [o2] = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const a = putOnBattlefield(s0, opp, ogre);
    const b = putOnBattlefield(s0, opp, bear());
    const c = putOnBattlefield(s0, o2!, hydra); // {X}{G}{G}: mana value 2
    const d = putOnBattlefield(s0, o2!, ogre);
    const mine = putOnBattlefield(s0, ap, ogre);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect([a, b, c, d, mine].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "battlefield", "battlefield", "graveyard", "battlefield"]);
  });
});
