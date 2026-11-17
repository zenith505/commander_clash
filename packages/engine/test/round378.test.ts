// Round 378 (Lane A): someone other than the defending player declaring the blocks: Brutal Hordechief's "Creatures your
// opponents control block this turn if able, and you choose how those creatures block", Invasion Plans' "The attacking
// player chooses how each creature blocks each combat" and Berserker's Frenzy's die roll for forced blocks or blocks you
// choose this turn (CR 509.1, 509.1c; the rulings: the latest one to resolve decides, and every block must be legal).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, plainsCard, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { nextRandom } from "../src/rng";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty, stopping at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % 4]!;
const attack = (s: GameState, ap: PlayerId, attacks: [ObjectId, PlayerId][]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attacks.map(([attacker, defender]) => ({ attacker, defender })) });
  return settle(s);
};
/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
const lands = (s: GameState, pid: PlayerId) => {
  for (const l of [mountain, mountain, mountain, plainsCard, plainsCard, plainsCard]) putOnBattlefield(s, pid, l);
};

// Real oracle text (Scryfall).
const hordechief = (): CardDef => ({"oracleId":"e70cac5e-674e-4df7-94c7-77f8801e3941","name":"Brutal Hordechief","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Orc Warrior","supertypes":[],"types":["Creature"],"subtypes":["Orc","Warrior"],"oracleText":"Whenever a creature you control attacks, defending player loses 1 life and you gain 1 life.\n{3}{R/W}{R/W}: Creatures your opponents control block this turn if able, and you choose how those creatures block.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B","R","W"],"keywords":[],"commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const plans = (): CardDef => ({"oracleId":"db9c0d94-9fa5-4f07-be48-23e19d2f3d68","name":"Invasion Plans","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"All creatures block each combat if able.\nThe attacking player chooses how each creature blocks each combat.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2026-02-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const frenzy = (): CardDef => ({"oracleId":"5cd51d39-aebc-4367-9157-da70b8d9b1a3","name":"Berserker's Frenzy","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only before combat or during combat before blockers are declared.\nRoll two d20 and ignore the lower roll.\n1—14 | Choose any number of creatures. They block this turn if able.\n15—20 | You choose which creatures block this turn and how those creatures block.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" });
const flyer = card("Test Bird", "Creature — Bird", "{1}{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });

describe("round 378: compiles", () => {
  it("Brutal Hordechief, Invasion Plans and Berserker's Frenzy", () => {
    for (const d of [hordechief(), plans(), frenzy()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Brutal Hordechief", () => {
  const ready = () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const chief = putOnBattlefield(s, ap, hordechief());
    const big = putOnBattlefield(s, ap, giant);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = run(s, planActivate(s, ap, chief, 0));
    s = settle(s);
    return { s, ap, opp, chief, big, theirs };
  };

  it("makes the opponents' creatures block, those that come later too, and you declare how", () => {
    let { s, ap, opp, chief, big, theirs } = ready();
    expect(s.blocksChosenThisTurn).toEqual([expect.objectContaining({ player: ap, turn: s.turn, opponents: true })]);
    // A creature that enters after it resolved is covered as well (rulings).
    const late = putOnBattlefield(s, opp, bear({ name: "Late Bear" }));
    const lifeBefore = s.players[opp]!.life;
    s = attack(s, ap, [[chief, opp], [big, opp]]);
    // Its first ability still triggers for each attacker.
    expect(s.players[opp]!.life).toBe(lifeBefore - 2);
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toEqual({ kind: "declareBlockers", player: ap, remaining: [], defender: opp });
    // Not the defending player, and not without the blocks they must make.
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: big }] })).toThrow(/Late Bear must block/);
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: big }, { blocker: late, attacker: big }] });
    expect(s.objects[theirs]!.blocking).toEqual([big]);
    expect(s.objects[late]!.blocking).toEqual([big]);
  });

  it("covers each defending player who is an opponent; the blocks must still be legal", () => {
    let { s, ap, opp, chief, big, theirs } = ready();
    const third = nextOf(s, ap, 2);
    const bird = putOnBattlefield(s, third, flyer);
    s = attack(s, ap, [[chief, opp], [big, third]]);
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: opp });
    // Their Bear can only block an attacker attacking its controller (CR 509.1a).
    expect(() => act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: big }] })).toThrow();
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: chief }] });
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: third });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: bird, attacker: big }] });
    expect(s.objects[bird]!.blocking).toEqual([big]);
  });

  it("with two activated, the last to resolve decides, but not for its own creatures (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const third = nextOf(s, ap, 2);
    const chief = putOnBattlefield(s, ap, hordechief());
    const big = putOnBattlefield(s, ap, giant);
    const theirChief = putOnBattlefield(s, opp, hordechief());
    lands(s, opp);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const thirds = putOnBattlefield(s, third, bear({ name: "Third Bear" }));
    s = run(s, planActivate(s, ap, chief, 0));
    s = settle(s);
    s = passUntil(s, "beginCombat", ap);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planActivate(s, opp, theirChief, 0));
    s = settle(s);
    expect(s.blocksChosenThisTurn!.map((b) => b.player)).toEqual([ap, opp]);
    s = attack(s, ap, [[chief, opp], [big, third]]);
    s = passUntil(s, "declareBlockers", ap);
    // The opponent's own creatures: only the active player's ability covers them.
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: opp });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: chief }, { blocker: theirChief, attacker: chief }] });
    // The third player's: the later one, the opponent's.
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp, defender: third });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: thirds, attacker: big }] });
    expect(s.objects[thirds]!.blocking).toEqual([big]);
  });

  it("lasts for the turn only", () => {
    let { s, ap, opp, theirs } = ready();
    const nextAp = nextOf(s, ap);
    s = passUntil(s, "declareAttackers", nextAp);
    expect(s.blocksChosenThisTurn?.some((b) => b.turn === s.turn) ?? false).toBe(false);
    expect(s.objects[theirs]!.blocking).toBeUndefined();
    void opp;
  });

  it("a bot activates it before attacking and makes each forced blocker block where it dies", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    s.players[ap]!.hand = [];
    putOnBattlefield(s, ap, hordechief());
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    // The bots play on (its commander first) until combat.
    for (let i = 0; i < 100 && s.step !== "declareAttackers"; i++) {
      const who = s.pending?.player ?? waitingOn(s)!;
      s = run(s, botActions(s, who));
    }
    expect(s.blocksChosenThisTurn).toEqual([expect.objectContaining({ player: ap })]);
    // Choosing for the opponent: the 2/2 blocks the 5/5 (it dies, the giant lives), not the 1/1 it would kill.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const chief = putOnBattlefield(t, ap2, hordechief());
    const big = putOnBattlefield(t, ap2, giant);
    const small = putOnBattlefield(t, ap2, bear({ name: "Small", power: "1", toughness: "1" }));
    const theirs = putOnBattlefield(t, opp2, bear({ name: "Their Bear" }));
    t = run(t, planActivate(t, ap2, chief, 0));
    t = settle(t);
    t = attack(t, ap2, [[small, opp2], [big, opp2]]);
    t = passUntil(t, "declareBlockers", ap2);
    expect(t.pending).toMatchObject({ kind: "declareBlockers", player: ap2, defender: opp2 });
    expect(botActions(t, ap2)).toEqual([{ type: "declareBlockers", player: ap2, blocks: [{ blocker: theirs, attacker: big }] }]);
  });
});

describe("Invasion Plans", () => {
  it("the attacking player declares every defending player's blocks while it's on the battlefield, whoever controls it", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const third = nextOf(s, ap, 2);
    const ip = putOnBattlefield(s, third, plans());
    const big = putOnBattlefield(s, ap, giant);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const mine = putOnBattlefield(s, ap, bear({ name: "Home Bear" }));
    s = attack(s, ap, [[big, opp]]);
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toEqual({ kind: "declareBlockers", player: ap, remaining: [], defender: opp });
    // "All creatures block each combat if able": Their Bear must block.
    expect(() => act(s, { type: "declareBlockers", player: ap, blocks: [] })).toThrow(/must block/);
    expect(() => act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: mine, attacker: big }] })).toThrow();
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: big }] });
    expect(s.objects[theirs]!.blocking).toEqual([big]);
    void ip;
  });

  it("against a Hordechief activated later, the later one decides", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const third = nextOf(s, ap, 2);
    putOnBattlefield(s, ap, plans());
    const big = putOnBattlefield(s, ap, giant);
    const bigger = putOnBattlefield(s, ap, giant);
    const theirChief = putOnBattlefield(s, third, hordechief());
    lands(s, third);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const thirds = putOnBattlefield(s, third, bear({ name: "Third Bear" }));
    s = passUntil(s, "beginCombat", ap);
    s = act(s, { type: "passPriority", player: ap });
    s = act(s, { type: "passPriority", player: opp });
    expect(waitingOn(s)).toBe(third);
    s = run(s, planActivate(s, third, theirChief, 0));
    s = settle(s);
    s = attack(s, ap, [[big, opp], [bigger, third]]);
    s = passUntil(s, "declareBlockers", ap);
    // The opponent's creatures: the third player's Hordechief is the later effect.
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: third, defender: opp });
    s = act(s, { type: "declareBlockers", player: third, blocks: [{ blocker: theirs, attacker: big }] });
    // The third player's own: the Hordechief doesn't cover them, Invasion Plans does.
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: third });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: thirds, attacker: bigger }, { blocker: theirChief, attacker: bigger }] });
    expect(s.objects[thirds]!.blocking).toEqual([bigger]);
  });

  it("a player who has lost the game decides nothing: the choice falls back to the one before (CR 800.4a)", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const third = nextOf(s, ap, 2);
    putOnBattlefield(s, opp, plans());
    const big = putOnBattlefield(s, ap, giant);
    const theirChief = putOnBattlefield(s, third, hordechief());
    lands(s, third);
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = passUntil(s, "beginCombat", ap);
    s = act(s, { type: "passPriority", player: ap });
    s = act(s, { type: "passPriority", player: opp });
    s = run(s, planActivate(s, third, theirChief, 0));
    s = settle(s);
    s.players[third]!.life = 0;
    s = attack(s, ap, [[big, opp]]);
    expect(s.players[third]!.lost).toBe(true);
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: opp });
  });
});

describe("Berserker's Frenzy", () => {
  it("can be cast only before combat or during combat before blockers are declared", () => {
    const { s: s0, ap, ids, opp } = setup([frenzy()]);
    let s = s0;
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    const big = putOnBattlefield(s, ap, giant);
    s = passUntil(s, "beginCombat", ap);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    s = act(s, { type: "passPriority", player: ap });
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }] });
    s = settle(s);
    expect(s.step).toBe("declareAttackers");
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    s = passUntil(s, "declareBlockers", ap);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s = passUntil(s, "main2", ap);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });

  it("1—14: the creatures you choose, anyone's, block this turn if able", () => {
    const { s: s0, ap, ids, opp } = setup([frenzy()]);
    let s = s0;
    const big = putOnBattlefield(s, ap, giant);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const other = putOnBattlefield(s, opp, bear({ name: "Other Bear" }));
    rig(s, 20, [3, 14]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", anyNumber: true });
    expect((s.pending as { options: ObjectId[] }).options).toEqual(expect.arrayContaining([big, theirs, other]));
    s = act(s, { type: "pickPermanents", player: ap, ids: [theirs] });
    s = settle(s);
    s = attack(s, ap, [[big, opp]]);
    s = passUntil(s, "declareBlockers", ap);
    // The defending player still declares, and must block with the chosen one only.
    expect(s.pending).toEqual({ kind: "declareBlockers", player: opp, remaining: [] });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/Their Bear must block/);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: theirs, attacker: big }] });
    expect(s.objects[other]!.blocking).toBeUndefined();
  });

  it("15—20: you choose which creatures block this turn and how, none if you like", () => {
    const { s: s0, ap, ids, opp } = setup([frenzy()]);
    let s = s0;
    const big = putOnBattlefield(s, ap, giant);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    rig(s, 20, [15, 2]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.blocksChosenThisTurn).toEqual([expect.objectContaining({ player: ap })]);
    expect(s.blocksChosenThisTurn![0]!.opponents).toBeUndefined();
    s = attack(s, ap, [[big, opp]]);
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toEqual({ kind: "declareBlockers", player: ap, remaining: [], defender: opp });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: big }] });
    expect(s.objects[theirs]!.blocking).toEqual([big]);
  });

  it("a bot casts it in its first main phase with an attacker, and picks the opponents' creatures", () => {
    const { s: s0, ap, ids, opp } = setup([frenzy()]);
    let s = s0;
    putOnBattlefield(s, ap, giant);
    const mine = putOnBattlefield(s, ap, bear({ name: "Home Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    rig(s, 20, [7, 9]);
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(true);
    s = run(s, plan);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const pick = botActions(s, ap);
    expect(pick).toEqual([{ type: "pickPermanents", player: ap, ids: [theirs] }]);
    void mine;
  });
});
