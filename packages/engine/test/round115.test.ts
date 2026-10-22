// Round 115, most played cards: bots take spells over with Commandeer and Invert Polarity; cards that suspend other
// cards (Jhoira of the Ghitu, Kang Prime, CR 702.62).

import { describe, expect, it } from "vitest";
import { act, bear, card, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { attackTaxPer, botActions, isFullySupported, isSuspended, planActivate, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "hand");
  return id;
};

// Real oracle text (Scryfall).
const commandeer = card("Commandeer", "Instant", "{5}{U}{U}", {
  oracleText:
    "You may exile two blue cards from your hand rather than pay this spell's mana cost.\nGain control of target noncreature spell. You may choose new targets for it. (If that spell is an artifact, enchantment, or planeswalker, the permanent enters under your control.)",
});
const invert = card("Invert Polarity", "Instant", "{U}{U}{R}", {
  oracleText: "Choose target spell, then flip a coin. If you win the flip, gain control of that spell and you may choose new targets for it. If you lose the flip, counter that spell.",
});
const relic = card("Mind Stone Relic", "Artifact", "{3}", { oracleText: "" });
const jhoira = card("Jhoira of the Ghitu", "Legendary Creature — Human Wizard", "{1}{U}{R}", {
  power: "2",
  toughness: "2",
  oracleText:
    "{2}, Exile a nonland card from your hand: Put four time counters on the exiled card. If it doesn't have suspend, it gains suspend. (At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. If it's a creature, it has haste.)",
});
const kang = card("Kang Prime", "Legendary Creature — Human Villain", "{3}{U}{B}", {
  power: "3",
  toughness: "5",
  keywords: ["Flying"],
  oracleText:
    "Flying\nWhenever Kang Prime enters or attacks, exile cards from the top of your library until you exile a nonland card. Put two time counters on that card. If it doesn't have suspend, it gains suspend. (At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. If it's a creature, it has haste.)",
});
const titan = card("Big Titan", "Creature — Giant", "{7}{G}{G}", { power: "9", toughness: "9" });

describe("bots take spells over", () => {
  /** Ap casts a 3-mana artifact; the next player holds `answer` with plenty of Islands and Mountains. */
  function answering(answer: ReturnType<typeof card>) {
    const { s: s0, ap, opp, ids } = setup([relic]);
    let s = s0;
    const a = toHand(s, opp, answer);
    for (let i = 0; i < 7; i++) putOnBattlefield(s, opp, island);
    putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    return { s, opp, a };
  }
  it("a bot casts Commandeer on an opponent's spell", () => {
    expect(isFullySupported(commandeer)).toBe(true);
    const { s, opp, a } = answering(commandeer);
    const plan = botActions(s, opp);
    const cast = plan.find((x) => x.type === "castSpell");
    expect(cast).toMatchObject({ objectId: a });
  });
  it("a bot casts Invert Polarity on an opponent's spell", () => {
    expect(isFullySupported(invert)).toBe(true);
    const { s, opp, a } = answering(invert);
    const cast = botActions(s, opp).find((x) => x.type === "castSpell");
    expect(cast).toMatchObject({ objectId: a });
  });
});

describe("cards that suspend other cards", () => {
  it("Kang Prime: the nonland card exiled from the top gets two time counters and suspend", () => {
    expect(isFullySupported(kang)).toBe(true);
    const { s: s0, ap, ids } = setup([kang]);
    let s = s0;
    const lib = s.players[ap]!.library;
    // A land on top, then a nonland card.
    const land = putOnBattlefield(s, ap, card("Forest", "Basic Land — Forest"));
    const big = putOnBattlefield(s, ap, titan);
    for (const id of [big, land]) {
      moveObject(s, id, "library", { top: true });
    }
    expect(lib.slice(0, 2)).toEqual([land, big]);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 12 && (s.stack.length || s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.objects[big]!.zone).toBe("exile");
    expect(s.objects[big]!.counters.time).toBe(2);
    expect(isSuspended(s, s.objects[big]!)).toBe(true);
    expect(isSuspended(s, s.objects[land]!)).toBe(false);
  });

  it("Jhoira of the Ghitu: the card exiled to pay its cost gets four time counters and suspend; a bot uses it", () => {
    expect(isFullySupported(jhoira)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const j = putOnBattlefield(s, ap, jhoira);
    const big = toHand(s, ap, titan);
    const land = toHand(s, ap, card("Forest", "Basic Land — Forest"));
    // A land can't pay the cost.
    expect(planActivate(s, ap, j, 0, [], undefined, undefined, undefined, { exileFromHand: [land] })).toBeNull();
    s = run(s, planActivate(s, ap, j, 0, [], undefined, undefined, undefined, { exileFromHand: [big] }));
    expect(s.objects[big]!.zone).toBe("exile");
    for (let i = 0; i < 6 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[big]!.counters.time).toBe(4);
    expect(isSuspended(s, s.objects[big]!)).toBe(true);
    // A bot with Jhoira and a card it can't afford suspends it.
    const { s: b0, ap: bp } = setup([]);
    const bj = putOnBattlefield(b0, bp, jhoira);
    const bbig = toHand(b0, bp, card("Huge Titan", "Creature — Giant", "{9}{G}{G}{G}{G}{G}{G}{G}", { power: "16", toughness: "16" }));
    b0.step = "main2"; // bots use abilities once they're done casting spells
    b0.players[bp]!.hand = [bbig];
    b0.players[bp]!.command = []; // nothing else to cast
    const plan = botActions(b0, bp);
    expect(plan.find((x) => x.type === "activateAbility")).toMatchObject({ objectId: bj, costs: { exileFromHand: [bbig] } });
  });
});

const greatwurm = card("Quilled Greatwurm", "Creature — Wurm", "{4}{G}{G}", {
  power: "7",
  toughness: "7",
  keywords: ["Trample"],
  oracleText:
    "Trample\nWhenever a creature you control deals combat damage during your turn, put that many +1/+1 counters on it. (It must survive to get the counters.)\nYou may cast this card from your graveyard by removing six counters from among creatures you control in addition to paying its other costs.",
});

describe("Quilled Greatwurm", () => {
  it("a creature you control dealing combat damage during your turn gets that many +1/+1 counters", () => {
    expect(isFullySupported(greatwurm)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, greatwurm);
    const b = putOnBattlefield(s0, ap, bear());
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(passUntil(settle(s), "endCombat"));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    // Blocked and dealing damage on an opponent's turn: nothing.
    const { s: t0, ap: tp } = setup([]);
    const other = t0.turnOrder[(t0.turnOrder.indexOf(tp) + 1) % 4]!;
    putOnBattlefield(t0, tp, greatwurm);
    const blocker = putOnBattlefield(t0, tp, card("Wall", "Creature — Wall", "{1}", { power: "1", toughness: "5" }));
    const attacker = putOnBattlefield(t0, other, bear());
    let u = passUntil(t0, "declareAttackers", other);
    u = settle(act(u, { type: "declareAttackers", player: other, attacks: [{ attacker, defender: tp }] }));
    u = passUntil(u, "declareBlockers", other);
    for (let i = 0; i < 8 && u.pending?.kind === "declareBlockers"; i++)
      u = act(u, { type: "declareBlockers", player: u.pending.player, blocks: u.pending.player === tp ? [{ blocker, attacker }] : [] });
    u = settle(passUntil(settle(u), "endCombat"));
    expect(u.objects[blocker]!.damage).toBe(2); // it blocked, and dealt its own damage too
    expect(u.objects[blocker]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("cast from the graveyard by removing six counters from among creatures you control", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const w = toHand(s, ap, greatwurm);
    moveObject(s, w, "graveyard");
    const a = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear());
    s.objects[a]!.counters["+1/+1"] = 4;
    s.objects[c]!.counters["+1/+1"] = 1;
    // Five counters aren't enough.
    expect(planCast(s, ap, w, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    s.objects[c]!.counters["+1/+1"] = 3;
    const counters = [...Array(4).fill({ id: a, kind: "+1/+1" }), ...Array(2).fill({ id: c, kind: "+1/+1" })];
    s = run(s, planCast(s, ap, w, undefined, undefined, undefined, undefined, { via: "permission", counters }));
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
    s = settle(s);
    expect(s.objects[w]!.zone).toBe("battlefield");
    // A bot does it too.
    const { s: b0, ap: bp } = setup([]);
    const bw = toHand(b0, bp, greatwurm);
    moveObject(b0, bw, "graveyard");
    const bb = putOnBattlefield(b0, bp, bear());
    b0.objects[bb]!.counters["+1/+1"] = 7;
    b0.players[bp]!.hand = [];
    b0.players[bp]!.command = [];
    const plan = botActions(b0, bp);
    expect(plan.at(-1)).toMatchObject({ type: "castSpell", objectId: bw, via: "permission" });
  });
});

const plargg = card("Plargg and Nassari", "Legendary Creature — Dwarf Wizard", "{3}{R}{R}", {
  power: "5",
  toughness: "5",
  oracleText:
    "At the beginning of your upkeep, each player exiles cards from the top of their library until they exile a nonland card. An opponent chooses a nonland card exiled this way. You may cast up to two spells from among the other cards exiled this way without paying their mana costs.",
});

describe("Plargg and Nassari", () => {
  it("you choose an opponent, who picks one nonland card; you cast up to two of the others free", () => {
    expect(isFullySupported(plargg)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, plargg);
    let s = passUntil(s0, "upkeep", ap);
    // The top of each library: a Forest, then a nonland card.
    const tops = s.turnOrder.map((pid, i) => {
      const nonland = putOnBattlefield(s, pid, bear({ name: `Bear ${i}` }));
      const land = putOnBattlefield(s, pid, card("Forest", "Basic Land — Forest"));
      for (const id of [nonland, land]) moveObject(s, id, "library", { top: true });
      return { pid, nonland, land };
    });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    const mine = tops.find((t) => t.pid === ap)!.nonland;
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "castFromAmong" });
    expect((s.pending as { options: string[] }).options).toHaveLength(4);
    s = act(s, { type: "chooseOption", player: opp, choice: mine });
    // Ap's own card can't be cast now; two of the other three can.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    expect((s.pending as { options: string[] }).options).not.toContain(mine);
    const others = tops.filter((t) => t.pid !== ap).map((t) => t.nonland);
    for (const pick of others.slice(0, 2)) {
      s = act(s, { type: "chooseOption", player: ap, choice: pick });
      if (s.pending?.kind === "castFree") s = run(s, planCast(s, ap, pick));
    }
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong").toBe(false);
    s = settle(s);
    expect(s.objects[others[0]!]!.zone).toBe("battlefield");
    expect(s.objects[others[1]!]!.zone).toBe("battlefield");
    expect(s.objects[others[2]!]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("exile");
    for (const t of tops) expect(s.objects[t.land]!.zone).toBe("exile");
  });
});

const yojimbo = card("Summon: Yojimbo", "Enchantment Creature — Saga Samurai", "{3}{W}", {
  power: "5",
  toughness: "5",
  keywords: ["Vigilance"],
  oracleText:
    "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Exile target artifact, enchantment, or tapped creature an opponent controls.\nII, III — Until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures.\nIV — Create X Treasure tokens, where X is the number of opponents who control a creature with power 4 or greater.\nVigilance",
});
const forbidding = card("Forbidding Spirit", "Creature — Spirit Cleric", "{1}{W}{W}", {
  power: "3",
  toughness: "3",
  oracleText: "When this creature enters, until your next turn, creatures can't attack you or planeswalkers you control unless their controller pays {2} for each of those creatures.",
});

describe("attack taxes until your next turn", () => {
  it("Forbidding Spirit: {2} for each creature attacking you or your planeswalkers, until your next turn", () => {
    expect(isFullySupported(forbidding)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([forbidding]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(attackTaxPer(s, ap)).toBe(2);
    expect(attackTaxPer(s, ap, true)).toBe(2);
    s = passUntil(s, "main2", opp);
    expect(attackTaxPer(s, ap)).toBe(2);
    s = passUntil(s, "upkeep", ap);
    expect(attackTaxPer(s, ap)).toBe(0);
  });

  it("Summon: Yojimbo: I exiles a tapped creature (not an untapped one); II taxes attacks on you only; IV counts opponents with a big creature", () => {
    expect(isFullySupported(yojimbo)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([yojimbo]);
    const untapped = putOnBattlefield(s0, opp, bear());
    const tapped = putOnBattlefield(s0, opp, bear());
    s0.objects[tapped]!.tapped = true;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: untapped }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: tapped }] }));
    expect(s.objects[tapped]!.zone).toBe("exile");
    // Chapter II, after the next draw step.
    s = settle(passUntil(passUntil(s, "upkeep", opp), "main1", ap));
    expect(attackTaxPer(s, ap)).toBe(2);
    expect(attackTaxPer(s, ap, true)).toBe(0);
    // Two opponents with a creature with power 4 or greater: two Treasures at chapter IV.
    const others = s.turnOrder.filter((p) => p !== ap);
    putOnBattlefield(s, others[0]!, card("Big", "Creature — Giant", "{4}", { power: "4", toughness: "4" }));
    putOnBattlefield(s, others[1]!, card("Big", "Creature — Giant", "{4}", { power: "5", toughness: "1" }));
    const y = ids[0]!;
    s.objects[y]!.counters.lore = 3;
    const before = s.battlefield.length;
    s = settle(passUntil(passUntil(s, "upkeep", others[0]!), "main1", ap));
    const treasures = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.subtypes.includes("Treasure") && s.objects[id]!.controller === ap);
    expect(treasures).toHaveLength(2);
    expect(s.objects[y]!.zone).toBe("graveyard");
    expect(before).toBeGreaterThan(0);
  });
});

const sphinx = card("Sphinx of the Second Sun", "Creature — Sphinx", "{6}{U}{U}", {
  power: "6",
  toughness: "6",
  keywords: ["Flying"],
  oracleText: "Flying\nAt the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase. (The beginning phase includes the untap, upkeep, and draw steps.)",
});

describe("Sphinx of the Second Sun", () => {
  it("after your postcombat main phase: an untap step, an upkeep step and a draw step, then the end step", () => {
    expect(isFullySupported(sphinx)).toBe(true);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sphinx);
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Island")!;
    let s = passUntil(s0, "main2", ap);
    s = settle(s);
    s.objects[land]!.tapped = true;
    const hand = s.players[ap]!.hand.length;
    const steps: string[] = [];
    for (let i = 0; i < 40 && s.step !== "end"; i++) {
      const before = s.step;
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
      if (s.step !== before) steps.push(s.step);
    }
    expect(steps).toEqual(["upkeep", "draw", "end"]); // the untap step has no priority
    expect(s.objects[land]!.tapped).toBe(false);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.activePlayer).toBe(ap);
  });
});
