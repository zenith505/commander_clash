// Round 100: Homeward Path ("each player gains control of all creatures they own", CR 613.1b), The Black Gate ("choose a
// player with the most life or tied for most life", rulings), Steel Hellkite ("whose controller was dealt combat damage
// by ~ this turn", rulings), Ezuri's Predation ("each of those tokens fights a different one of those creatures", rulings).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { controllerOf, isFullySupported, planActivate, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const homeward = card("Homeward Path", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Each player gains control of all creatures they own." });
const gate = card("The Black Gate", "Legendary Land — Gate", "", { oracleText: "As The Black Gate enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}.\n{1}{B}, {T}: Choose a player with the most life or tied for most life. Target creature can't be blocked by creatures that player controls this turn." });
const hellkite = card("Steel Hellkite", "Artifact Creature — Dragon", "{6}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{2}: This creature gets +1/+0 until end of turn.\n{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only once each turn." });
const predation = card("Ezuri's Predation", "Sorcery", "{5}{G}{G}{G}", { oracleText: "For each creature your opponents control, create a 4/4 green Phyrexian Beast creature token. Each of those tokens fights a different one of those creatures." });
const ogre = card("Hulking Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;

describe("round 100: Homeward Path, The Black Gate, Steel Hellkite, Ezuri's Predation", () => {
  it("parse", () => {
    for (const d of [homeward, gate, hellkite, predation]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Homeward Path: each creature goes back to its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const path = putOnBattlefield(s0, ap, homeward);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    addEffect(s0, opp, [mine], [{ kind: "control" }], "game");
    addEffect(s0, ap, [theirs], [{ kind: "control" }], "game");
    expect(controllerOf(s0, s0.objects[mine]!)).toBe(opp);
    const s = settle(run(s0, planActivate(s0, ap, path, 0)));
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
  });

  it("The Black Gate: the creature can't be blocked by creatures of the player with the most life", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const third = nextAfter(s0, opp);
    s0.players[opp]!.life = 50;
    const g = putOnBattlefield(s0, ap, gate);
    const a = putOnBattlefield(s0, ap, bear());
    const x = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [target(a)])));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: x, attacker: a }] })).toThrow();
    void third;
  });

  it("The Black Gate: with a tie, its controller chooses among the tied players", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const third = nextAfter(s0, opp);
    s0.players[opp]!.life = 50;
    s0.players[third]!.life = 50;
    const g = putOnBattlefield(s0, ap, gate);
    const a = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [target(a)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", options: [String(opp), String(third)].sort((m, n) => s0.turnOrder.indexOf(Number(m)) - s0.turnOrder.indexOf(Number(n))) });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(third) }));
    const x = putOnBattlefield(s, third, bear());
    const y = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: third }] });
    s = passUntil(s, "declareBlockers", ap);
    // A creature that came under that player's control later can't block it either (rulings).
    expect(() => act(s, { type: "declareBlockers", player: third, blocks: [{ blocker: x, attacker: a }] })).toThrow();
    void y;
  });

  it("Steel Hellkite destroys the permanents with mana value X of the players it dealt combat damage to", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const third = nextAfter(s0, opp);
    const h = putOnBattlefield(s0, ap, hellkite);
    const theirBear = putOnBattlefield(s0, opp, bear());
    const theirOgre = putOnBattlefield(s0, opp, ogre);
    const otherBear = putOnBattlefield(s0, third, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(35);
    const plan = planActivate(s, ap, h, 1, undefined, undefined, undefined, 2);
    s = settle(run(s, plan));
    expect(s.objects[theirBear]!.zone).toBe("graveyard");
    expect(s.objects[theirOgre]!.zone).toBe("battlefield");
    expect(s.objects[otherBear]!.zone).toBe("battlefield");
  });

  it("Ezuri's Predation: a 4/4 for each creature opponents control, each fighting a different one", () => {
    const { s: s0, ap, ids } = setup([predation]);
    const opp = nextAfter(s0, ap);
    const third = nextAfter(s0, opp);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, third, ogre);
    const big = putOnBattlefield(s0, third, card("Big One", "Creature — Giant", "{5}", { power: "5", toughness: "5" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    // The 5/5 took 4 and killed its Beast.
    expect(s.objects[big]!.damage).toBe(4);
    const beasts = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Phyrexian Beast"));
    expect(beasts).toHaveLength(2);
  });
});
