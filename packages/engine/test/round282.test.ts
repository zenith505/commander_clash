// Round 282: earlier skips from the top of the popularity list. Attacking only the nearest opponent in a chosen
// direction (Pramikon, Sky Rampart; Teyo, Geometric Tactician), skipping a chosen step or phase (Fatespinner).

import { describe, expect, it } from "vitest";
import { act, bear, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, attackProblem, botActions, isFullySupported, nearestOpponent, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const nextOpp = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % s.turnOrder.length]!;
const choose = (s: GameState, what: string, choice: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== what) throw new Error(`no ${what} asked for: ${JSON.stringify(p)}`);
  return settle(act(s, { type: "chooseOption", player: p.player, choice }));
};

// Real oracle text (Scryfall).
const pramikon = (): CardDef => ({"oracleId":"377d0fa7-1b3d-4b97-b066-dceeff3734d0","name":"Pramikon, Sky Rampart","manaCost":"{U}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Wall","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Flying, defender\nAs Pramikon enters, choose left or right.\nEach player may attack only the nearest opponent in the chosen direction and planeswalkers controlled by that opponent.","power":"1","toughness":"5","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Flying","Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/8569ad47-a243-402d-899f-4e6b17ea4e1e.jpg?1783932798","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/8569ad47-a243-402d-899f-4e6b17ea4e1e.jpg?1783932798","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const teyo = (): CardDef => ({"oracleId":"0dfdf1a1-a3a9-490f-bd9d-dcba088c6785","name":"Teyo, Geometric Tactician","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Planeswalker — Teyo","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Teyo"],"oracleText":"When Teyo enters, create a 0/4 white Wall creature token with defender and flying.\n+1: You and target opponent each draw a card.\n−2: Choose left or right. Until your next turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent.","loyalty":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c66fa93a-6888-4297-b22e-7d69fd25c0d7.jpg?1783915485","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c66fa93a-6888-4297-b22e-7d69fd25c0d7.jpg?1783915485","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fatespinner = (): CardDef => ({"oracleId":"676935c8-22e0-427f-9566-16778cea0873","name":"Fatespinner","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of each opponent's upkeep, that player chooses draw step, main phase, or combat phase. The player skips each instance of the chosen step or phase this turn.","power":"1","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/5780f4e0-dcfb-4d1f-8ae1-762b98970abb.jpg?1783944554","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/5780f4e0-dcfb-4d1f-8ae1-762b98970abb.jpg?1783944554","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const planeswalker = (name: string) => ({ oracleId: `pw-${name}`, name, manaCost: "{3}", cmc: 3, typeLine: "Legendary Planeswalker — Test", supertypes: ["Legendary"], types: ["Planeswalker"], subtypes: ["Test"], oracleText: "", loyalty: "5", colors: [], colorIdentity: [], keywords: [] }) as CardDef;

describe("round 282", () => {
  it("every card of the round compiles fully", () => {
    supported(pramikon(), teyo(), fatespinner());
  });
});

describe("attacking only the nearest opponent in a direction", () => {
  it("Pramikon: the direction is chosen as it enters; each player may attack only the next opponent that way and their planeswalkers", () => {
    const { s: s0, ap, ids } = setup([pramikon()]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "direction", options: ["left", "right"], player: ap });
    s = choose(s, "direction", "left");
    expect(s.objects[ids[0]!]!.chosen?.direction).toBe("left");
    const left = nextOpp(s, ap, 1);
    const right = nextOpp(s, ap, 3);
    expect(nearestOpponent(s, ap, "left")).toBe(left);
    expect(nearestOpponent(s, ap, "right")).toBe(right);
    const mine = s.objects[putOnBattlefield(s, ap, bear())]!;
    expect(attackProblem(s, mine, left)).toBeNull();
    expect(attackProblem(s, mine, right)).toMatch(/nearest opponent/);
    expect(attackProblem(s, mine, nextOpp(s, ap, 2))).toMatch(/nearest opponent/);
    // Planeswalkers: only the left player's.
    const pwLeft = putOnBattlefield(s, left, planeswalker("Left Walker"));
    const pwRight = putOnBattlefield(s, right, planeswalker("Right Walker"));
    expect(attackProblem(s, mine, left, true, pwLeft)).toBeNull();
    expect(attackProblem(s, mine, right, true, pwRight)).toMatch(/nearest opponent/);
    // Another player is held to their own left neighbor: the player after them.
    const theirs = s.objects[putOnBattlefield(s, left, bear())]!;
    expect(attackProblem(s, theirs, nextOpp(s, ap, 2))).toBeNull();
    expect(attackProblem(s, theirs, ap)).toMatch(/nearest opponent/);
    // Declaring the attack it forbids is refused.
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine.id, defender: right }] })).toThrow(/nearest opponent/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine.id, defender: left }] });
    expect(s.objects[mine.id]!.attacking).toBe(left);
  });

  it("Pramikon: a player who left the game has no seat, so the next one that way is the nearest", () => {
    const { s: s0, ap, ids } = setup([pramikon()]);
    let s = choose(cast(s0, ap, ids[0]!), "direction", "right");
    const right = nextOpp(s, ap, 3);
    s.players[right]!.lost = true;
    expect(nearestOpponent(s, ap, "right")).toBe(nextOpp(s, ap, 2));
    const mine = s.objects[putOnBattlefield(s, ap, bear())]!;
    expect(attackProblem(s, mine, nextOpp(s, ap, 2))).toBeNull();
    expect(attackProblem(s, mine, nextOpp(s, ap, 1))).toMatch(/nearest opponent/);
  });

  it("Teyo −2: the direction lasts until its controller's next turn; disagreeing with Pramikon, nobody can attack", () => {
    const { s: s0, ap, ids } = setup([pramikon()]);
    let s = choose(cast(s0, ap, ids[0]!), "direction", "left");
    const t = putOnBattlefield(s, ap, teyo());
    s.objects[t]!.counters = { loyalty: 4 };
    s = settle(run(s, planActivate(s, ap, t, 1)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "direction" });
    s = choose(s, "direction", "right");
    expect(s.objects[t]!.counters.loyalty).toBe(2);
    expect(s.attackDirections).toEqual([{ by: ap, side: "right" }]);
    const mine = s.objects[putOnBattlefield(s, ap, bear())]!;
    for (const n of [1, 2, 3]) expect(attackProblem(s, mine, nextOpp(s, ap, n))).toMatch(/nearest opponent/);
    // The next player's turn: still in force; then it ends as Teyo's controller's next turn begins.
    s = passUntil(s, "upkeep", nextOpp(s, ap, 1));
    expect(s.attackDirections).toHaveLength(1);
    s = passUntil(s, "upkeep", ap);
    expect(s.attackDirections).toBeUndefined();
    // Pramikon alone again: the left one only.
    expect(attackProblem(s, mine, nextOpp(s, ap, 1))).toBeNull();
  });

  it("Teyo −2 alone, choosing right: each player attacks only the player before them in turn order", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const t = putOnBattlefield(s, ap, teyo());
    s.objects[t]!.counters = { loyalty: 4 };
    s = choose(settle(run(s, planActivate(s, ap, t, 1))), "direction", "right");
    const mine = s.objects[putOnBattlefield(s, ap, bear())]!;
    expect(attackProblem(s, mine, nextOpp(s, ap, 3))).toBeNull();
    expect(attackProblem(s, mine, nextOpp(s, ap, 1))).toMatch(/nearest opponent/);
  });

  it("bots choose a direction and attack only the player it allows", () => {
    const { s: s0, ap, ids } = setup([pramikon()]);
    let s = cast(s0, ap, ids[0]!);
    const acts = botActions(s, ap);
    expect(acts[0]).toMatchObject({ type: "chooseOption" });
    s = settle(act(s, acts[0]!));
    const side = s.objects[ids[0]!]!.chosen!.direction!;
    const allowed = nearestOpponent(s, ap, side);
    putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    const decl = botActions(s, ap).find((a) => a.type === "declareAttackers");
    if (decl?.type === "declareAttackers") for (const a of decl.attacks) expect(a.defender).toBe(allowed);
  });
});

describe("Fatespinner", () => {
  /** Fatespinner under `ap`, then on to the next player's upkeep, where its trigger asks them. */
  const atUpkeep = () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, fatespinner());
    const opp = nextOpp(s, ap, 1);
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "skipChoice", player: opp, options: ["draw", "main", "combat"] });
    return { s, ap, opp };
  };
  /** The steps `pid`'s current turn goes through from now to its end. */
  const stepsOfTurn = (s: GameState, pid: PlayerId) => {
    const seen: string[] = [];
    const turn = s.turn;
    for (let i = 0; i < 400 && s.turn === turn; i++) {
      if (!seen.includes(s.step)) seen.push(s.step);
      const w = waitingOn(s)!;
      const pend = s.pending;
      if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: w, attacks: [] });
      else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: w, blocks: [] });
      else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: w, objectIds: s.players[w]!.hand.slice(0, pend.count) });
      else s = act(s, { type: "passPriority", player: w });
    }
    expect(s.activePlayer).not.toBe(pid);
    return { seen, s };
  };

  it("main phase: both main phases of that turn are skipped", () => {
    const { s: s0, opp } = atUpkeep();
    const s = choose(s0, "skipChoice", "main");
    expect(s.players[opp]!.skips).toEqual([{ what: "main", turn: s.turn, wholeTurn: true }]);
    putOnBattlefield(s, opp, bear());
    const { seen } = stepsOfTurn(s, opp);
    expect(seen).toContain("draw");
    expect(seen).not.toContain("main1");
    expect(seen).not.toContain("main2");
    expect(seen).toContain("end");
  });

  it("draw step: no draw this turn; combat phase: no combat steps", () => {
    let { s, opp } = atUpkeep();
    const hand = s.players[opp]!.hand.length;
    s = choose(s, "skipChoice", "draw");
    s = passUntil(s, "main1", opp);
    expect(s.players[opp]!.hand.length).toBe(hand);
    ({ s, opp } = atUpkeep());
    s = choose(s, "skipChoice", "combat");
    putOnBattlefield(s, opp, bear());
    const { seen, s: after } = stepsOfTurn(s, opp);
    expect(seen).toContain("main1");
    expect(seen.some((x) => x === "beginCombat" || x === "declareAttackers")).toBe(false);
    // Only that turn: the skip is gone the turn after.
    expect(after.players[opp]!.skips ?? []).toEqual([]);
  });

  it("its controller's own upkeep doesn't trigger it, and a bot answers", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, fatespinner());
    const opp = nextOpp(s, ap, 1);
    s = settle(passUntil(s, "upkeep", opp));
    const acts = botActions(s, opp);
    expect(acts[0]).toMatchObject({ type: "chooseOption" });
    expect(["draw", "combat"]).toContain((acts[0] as { choice: string }).choice);
    s = settle(act(s, acts[0]!));
    // On to its controller's own upkeep, the other opponents asked on the way; at its controller's, nothing asked.
    const asked: PlayerId[] = [];
    for (let i = 0; i < 3000 && !(s.activePlayer === ap && s.step === "upkeep"); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "skipChoice") asked.push(p.player);
      s = act(s, p ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual([nextOpp(s, ap, 2), nextOpp(s, ap, 3)]);
    s = settle(s);
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "skipChoice").toBe(false);
  });
});
