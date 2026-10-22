// Controlling another player (CR 723): Emrakul, the Promised End, Mindslaver, Worst Fears, Sorin Markov's −7, Cruel
// Entertainment. The controller makes all the controlled player's choices and decisions during that player's next
// turn; the engine still waits on the controlled player, and `deciderOf` says who decides.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, deciderOf, isFullySupported, planActivate, planCast, playerLoses, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const emrakul = card("Emrakul, the Promised End", "Legendary Creature — Eldrazi", "{13}", {
  power: "13",
  toughness: "13",
  keywords: ["Flying", "Protection", "Trample"],
  oracleText:
    "This spell costs {1} less to cast for each card type among cards in your graveyard.\nWhen you cast this spell, you gain control of target opponent during that player's next turn. After that turn, that player takes an extra turn.\nFlying, trample, protection from instants",
});
const mindslaver = card("Mindslaver", "Legendary Artifact", "{6}", {
  oracleText: "{4}, {T}, Sacrifice Mindslaver: You control target player during that player's next turn. (You see all cards that player could see and make all decisions for them.)",
});
const worstFears = card("Worst Fears", "Sorcery", "{7}{B}", {
  oracleText: "You control target player during that player's next turn. Exile Worst Fears. (You see all cards that player could see and make all decisions for them.)",
});
const cruel = card("Cruel Entertainment", "Sorcery", "{6}{B}", {
  oracleText:
    "Choose target player and another target player. The first player controls the second player during the second player's next turn, and the second player controls the first player during the first player's next turn.",
});
const sorin = card("Sorin Markov", "Legendary Planeswalker — Sorin", "{3}{B}{B}{B}", {
  loyalty: "4",
  oracleText: "+2: Sorin Markov deals 2 damage to any target and you gain 2 life.\n−3: Target opponent's life total becomes 10.\n−7: You control target player during that player's next turn.",
});
const skipper = card("Test Skip", "Sorcery", "{1}", { oracleText: "Target player skips their next turn." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
/** Cast Emrakul; its cast trigger targets `victim`. */
function castEmrakul(s: GameState, ap: PlayerId, id: string, victim: PlayerId) {
  s = run(s, planCast(s, ap, id));
  expect(s.pending?.kind).toBe("chooseTargets");
  s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: victim }] });
  return settle(s);
}

describe("Emrakul, the Promised End", () => {
  it("you control the target opponent during their next turn, then they take an extra turn", () => {
    supported(emrakul);
    const { s: s0, ap, ids } = setup([emrakul]);
    const victim = next(s0, next(s0, ap));
    let s = castEmrakul(s0, ap, ids[0]!, victim);
    expect(s.battlefield).toContain(ids[0]);
    // Not yet: it's the victim's next turn that's controlled (CR 723.1).
    expect(deciderOf(s, victim)).toBe(victim);
    expect(s.controlledTurn).toBeUndefined();
    s = passUntil(s, "upkeep", next(s, ap));
    expect(deciderOf(s, next(s, ap))).toBe(next(s, ap));
    s = passUntil(s, "main1", victim);
    const turn = s.turn;
    expect(s.activePlayer).toBe(victim); // still the active player (CR 723.3)
    expect(deciderOf(s, victim)).toBe(ap);
    expect(waitingOn(s)).toBe(victim);
    // The controller keeps making their own decisions (CR 723.8); nobody else is controlled.
    expect(deciderOf(s, ap)).toBe(ap);
    expect(s.log.some((l) => /controls .* during this turn/.test(l.text))).toBe(true);
    // After that turn, the extra turn: the victim again, under their own control.
    s = passUntil(s, "end", victim);
    s = passUntil(s, "main1", victim);
    expect(s.turn).toBe(turn + 1);
    expect(s.activePlayer).toBe(victim);
    expect(deciderOf(s, victim)).toBe(victim);
    // Then the normal order goes on.
    s = passUntil(s, "main1", next(s, victim));
    expect(s.turn).toBe(turn + 2);
  });

  it("a skipped turn isn't the controlled one: it waits for the next turn they actually take (CR 723.1b)", () => {
    const { s: s0, ap, ids } = setup([emrakul, skipper]);
    const victim = next(s0, ap);
    let s = castEmrakul(s0, ap, ids[0]!, victim);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: victim }])));
    s = passUntil(s, "main1", next(s, victim));
    expect(s.controlledTurn).toBeUndefined();
    // Round the table: the victim's next real turn is controlled.
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(ap);
  });

  it("a bot controlling a player makes them do nothing they don't have to", () => {
    const { s: s0, ap, ids } = setup([emrakul]);
    const victim = next(s0, ap);
    let s = castEmrakul(s0, ap, ids[0]!, victim);
    putOnBattlefield(s, victim, bear());
    s = passUntil(s, "main1", victim);
    expect(botActions(s, victim)).toEqual([{ type: "passPriority", player: victim }]);
    for (let i = 0; i < 12 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("declareAttackers");
    expect(botActions(s, victim)).toEqual([{ type: "declareAttackers", player: victim, attacks: [] }]);
  });

  it("if the controller leaves the game, the control ends (CR 800.4a) but the extra turn still comes", () => {
    const { s: s0, ap, ids } = setup([emrakul]);
    const victim = next(s0, ap);
    let s = castEmrakul(s0, ap, ids[0]!, victim);
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    playerLoses(s, ap, "test");
    expect(deciderOf(s, victim)).toBe(victim);
    const turn = s.turn;
    s = passUntil(s, "main1", next(s, victim));
    // The extra turn came first.
    expect(s.turn).toBe(turn + 2);
  });

  it("two Emrakuls on one player: the last one's caster controls the turn, and each makes an extra turn (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const victim = next(s, next(s, ap));
    const other = next(s, ap);
    s.playerControls = [
      { controlled: victim, controller: ap, extraTurnAfter: true },
      { controlled: victim, controller: other, extraTurnAfter: true },
    ];
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(other);
    const turn = s.turn;
    s = passUntil(s, "main1", next(s, victim));
    expect(s.turn).toBe(turn + 3);
  });
});

describe("Mindslaver, Worst Fears, Sorin Markov, Cruel Entertainment", () => {
  it("compile to control effects", () => {
    supported(mindslaver, worstFears, sorin, cruel);
    expect(compileCard(mindslaver).activated[0]!.body.effects).toEqual([{ type: "controlPlayer", who: { ref: "target", index: 0 }, controller: { ref: "you" } }]);
    const c = compileCard(cruel).spell!;
    expect(c.targets).toHaveLength(2);
    expect(c.targets[1]!.distinctFrom).toEqual([0]);
  });

  it("Mindslaver: the last effect on a player is the one that works (CR 723.1a)", () => {
    const { s: s0, ap, ids } = setup([worstFears]);
    let s = s0;
    const victim = next(s, next(s, ap));
    const slaver = putOnBattlefield(s, ap, mindslaver);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: victim }])));
    // Someone else's effect after it overwrites it; Mindslaver after that overwrites theirs.
    s.playerControls!.push({ controlled: victim, controller: next(s, ap) });
    s = settle(run(s, planActivate(s, ap, slaver, 0, [{ kind: "player", id: victim }])));
    expect(s.playerControls).toHaveLength(3);
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    expect(s.playerControls).toBeUndefined();
  });

  it("Cruel Entertainment: each of the two players controls the other during the other's next turn", () => {
    const { s: s0, ap, ids } = setup([cruel]);
    let s = s0;
    const [a, b] = [next(s, ap), next(s, next(s, ap))];
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: a }, { kind: "player", id: b }])));
    s = passUntil(s, "main1", a);
    expect(deciderOf(s, a)).toBe(b);
    s = passUntil(s, "main1", b);
    expect(deciderOf(s, b)).toBe(a);
    expect(deciderOf(s, a)).toBe(a);
  });
});

describe("Construct a Cosmic Cube", () => {
  const cube = card("Construct a Cosmic Cube", "Enchantment — Plan", "{1}{B}{B}", {
    oracleText:
      "Whenever you draw your second card each turn, create a 2/1 black Villain creature token with menace and put a plan counter on this enchantment.\nWhen the seventh plan counter is put on this enchantment, sacrifice it. When you do, you control target opponent during their next turn. (You see all cards that player could see and make all decisions for them.)",
  });
  const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

  it("the seventh plan counter sacrifices it, and you control the target opponent during their next turn", () => {
    supported(cube);
    const { s: s0, ap, ids } = setup([divination]);
    const c = putOnBattlefield(s0, ap, cube);
    s0.objects[c]!.counters.plan = 6;
    const victim = next(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: victim }] }));
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(ap);
  });
});
