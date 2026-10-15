// Encore (CR 702.141a), mayhem (CR 702.187b) and recruit (CR 701.70a).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, castProblem, planActivate, characteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const pilferer = card("Impulsive Pilferer", "Creature — Goblin Pirate", "{R}", {
  power: "1",
  toughness: "1",
  oracleText:
    'When this creature dies, create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")\nEncore {3}{R} ({3}{R}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)',
});
const slash = card("Sadistic Slash", "Instant", "{3}{B}", {
  oracleText: "Target creature gets -5/-5 until end of turn.\nMayhem {1}{B} (You may cast this card from your graveyard for {1}{B} if you discarded it this turn.)",
});
const goblinoids = card("Raging Goblinoids", "Creature — Goblin Berserker Villain", "{4}{R}", {
  power: "5",
  toughness: "4",
  keywords: ["Haste"],
  oracleText: "Haste\nMayhem {2}{R} (You may cast this card from your graveyard for {2}{R} if you discarded it this turn. Timing rules still apply.)",
});
const instructor = card("Patient Instructor", "Creature — Human Citizen", "{2}{W/U}", {
  power: "2",
  toughness: "2",
  keywords: ["Vigilance"],
  oracleText: "Vigilance\nWhen this creature enters, recruit. (Draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token.)",
});
const lookout = card("Lake-town Lookout", "Creature — Human Soldier", "{1}{W}", {
  power: "2",
  toughness: "1",
  oracleText: "When this creature dies, recruit. (Draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token.)",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[]) => settle(plan.reduce((x, a) => act(x, a), s));
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};
const planActivateOrThrow = (s: GameState, pid: PlayerId, id: string, i: number) => {
  const plan = planActivate(s, pid, id, i);
  if (!plan) throw new Error("can't activate");
  return plan;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);

describe("encore", () => {
  it("compile", () => {
    for (const d of [pilferer, slash, goblinoids, instructor, lookout]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("a hasty token copy for each opponent, each attacking that opponent if able, sacrificed at the next end step", () => {
    const { s: s0, ap, ids } = setup([pilferer]);
    toGraveyard(s0, ap, ids[0]!);
    let s = run(s0, planActivateOrThrow(s0, ap, ids[0]!, 0));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    const tokens = named(s, "Impulsive Pilferer");
    expect(tokens).toHaveLength(3);
    expect(tokens.every((t) => objHasKeyword(s, s.objects[t]!, "Haste"))).toBe(true);
    const opps = s.turnOrder.filter((p) => p !== ap);
    expect(tokens.map((t) => characteristics(s, s.objects[t]!).mustAttack).sort()).toEqual(opps.map((p) => [p]).sort());
    s = passUntil(s, "declareAttackers", ap);
    // Each has to attack its own opponent.
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/must attack/);
    const wrong = tokens.map((t, i) => ({ attacker: t, defender: characteristics(s, s.objects[tokens[(i + 1) % 3]!]!).mustAttack[0]! }));
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: wrong })).toThrow(/must attack/);
    // The bot sends each to its opponent.
    const bot = botActions(s, ap).find((a) => a.type === "declareAttackers");
    expect(bot?.type === "declareAttackers" && bot.attacks.map((a) => [a.attacker, a.defender])).toEqual(
      expect.arrayContaining(tokens.map((t) => [t, characteristics(s, s.objects[t]!).mustAttack[0]!])),
    );
    s = act(s, { type: "declareAttackers", player: ap, attacks: tokens.map((t) => ({ attacker: t, defender: characteristics(s, s.objects[t]!).mustAttack[0]! })) });
    s = settle(passUntil(s, "end", ap));
    s = settle(s);
    expect(named(s, "Impulsive Pilferer")).toHaveLength(0);
    // Each died: three Treasures.
    expect(named(s, "Treasure Token")).toHaveLength(3);
  });

  it("only as a sorcery", () => {
    const { s: s0, ap, ids, opp } = setup([pilferer]);
    toGraveyard(s0, ap, ids[0]!);
    const s = passUntil(s0, "upkeep", opp);
    expect(() => planActivateOrThrow(s, ap, ids[0]!, 0)).toThrow();
  });
});

describe("mayhem", () => {
  it("cast from the graveyard for its mayhem cost only the turn you discarded it", () => {
    const { s: s0, ap, ids, opp } = setup([slash, instructor]);
    putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, ap, swamp);
    const target = putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    // Discarded with recruit: Patient Instructor draws a card, then discards Sadistic Slash.
    let s = run(s0, planCast(s0, ap, ids[1]!)!);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(named(s, "Human Soldier Token")).toHaveLength(1); // a nonland card was discarded
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: target }], undefined, undefined, undefined, { via: "mayhem" })!);
    expect(s.objects[target]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard"); // not exiled
  });

  it("not if it went to the graveyard another way, nor on a later turn", () => {
    const { s, ap, ids } = setup([goblinoids, goblinoids]);
    toGraveyard(s, ap, ids[0]!);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { via: "mayhem" })).toMatch(/discarded/);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "mayhem" })).toBeNull();
    toGraveyard(s, ap, ids[1]!);
    s.objects[ids[1]!]!.discardedTurn = s.turn - 1; // discarded last turn
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { via: "mayhem" })).toMatch(/discarded/);
    s.objects[ids[1]!]!.discardedTurn = s.turn;
    expect(planCast(s, ap, ids[1]!, undefined, undefined, undefined, undefined, { via: "mayhem" })).not.toBeNull();
  });
});

describe("recruit", () => {
  it("discarding a land makes no token", () => {
    const { s: s0, ap, ids } = setup([instructor, forest]);
    let s = run(s0, planCast(s0, ap, ids[0]!)!);
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(named(s, "Human Soldier Token")).toHaveLength(0);
    expect(s.players[ap]!.graveyard).toContain(ids[1]!);
  });

  it("when it dies, recruit", () => {
    const { s: s0, ap, ids } = setup([slash]);
    const l = putOnBattlefield(s0, ap, lookout);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: l }])!);
    expect(s.objects[l]!.zone).toBe("graveyard");
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] }));
    expect(s.log.some((e) => /recruits/.test(typeof e === "string" ? e : e.text))).toBe(true);
  });
});
