// Round 100: Spellskite ("Change a target of target spell or ability to ~": rulings, CR 115.7) and Siren Stormtamer
// ("Counter target spell or ability that targets you or a creature you control", rulings).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const spellskite = card("Spellskite", "Artifact Creature — Phyrexian Horror", "{2}", { power: "0", toughness: "4", oracleText: "{U/P}: Change a target of target spell or ability to this creature. ({U/P} can be paid with either {U} or 2 life.)" });
const stormtamer = card("Siren Stormtamer", "Creature — Siren Pirate Wizard", "{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying\n{U}, Sacrifice this creature: Counter target spell or ability that targets you or a creature you control." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const arcTrail = card("Arc Trail", "Sorcery", "{1}{R}", { oracleText: "Arc Trail deals 2 damage to any target and 1 damage to another target." });
const lavaSpike = card("Lava Spike", "Sorcery", "{R}", { oracleText: "Lava Spike deals 3 damage to target player." });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const top = (s: GameState) => ({ kind: "stack" as const, id: s.stack[s.stack.length - 1]!.id });

describe("round 100: Spellskite and Siren Stormtamer", () => {
  it("parse", () => {
    for (const d of [spellskite, stormtamer]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Spellskite takes a Shock aimed at a Bear", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const skite = putOnBattlefield(s0, ap, spellskite);
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    s = run(s, planActivate(s, ap, skite, 0, [top(s)]));
    s = settle(s);
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.objects[skite]!.damage).toBe(2);
  });

  it("with two targets, its controller chooses which one becomes Spellskite as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([arcTrail]);
    const skite = putOnBattlefield(s0, ap, spellskite);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear({ name: "Runeclaw Bear" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)]));
    s = run(s, planActivate(s, ap, skite, 0, [top(s)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "targetSlot", options: ["0", "1"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.objects[skite]!.damage).toBe(1);
  });

  it("a target can't be changed if that would make another target illegal (\"another target\")", () => {
    const { s: s0, ap, ids, opp } = setup([arcTrail]);
    const skite = putOnBattlefield(s0, ap, spellskite);
    const a = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a), target(skite)]));
    s = run(s, planActivate(s, ap, skite, 0, [top(s)]));
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[skite]!.damage).toBe(1);
  });

  it("a spell that can't target it keeps its targets, and it can still be activated (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([lavaSpike]);
    const skite = putOnBattlefield(s0, ap, spellskite);
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = run(s, planActivate(s, ap, skite, 0, [top(s)]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Siren Stormtamer counters a spell aimed at a creature you control or at you, but not at someone else's", () => {
    const { s: s0, ap, ids, opp } = setup([shock, lavaSpike]);
    const siren = putOnBattlefield(s0, ap, stormtamer);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(theirs)]));
    expect(planActivate(s, ap, siren, 0, [top(s)])).toBeNull();
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }]));
    s = settle(run(s, planActivate(s, ap, siren, 0, [top(s)])));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[siren]!.zone).toBe("graveyard");
    void mine;
    void activate;
  });
});
