// Round 115, most played cards: bots take spells over with Commandeer and Invert Polarity; cards that suspend other
// cards (Jhoira of the Ghitu, Kang Prime, CR 702.62).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, island, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, castProblem } from "../src";
import { controllerOf } from "../src/layers";
import { manaAbilityProblem } from "../src/manaabilities";
import { attackTaxPer, botActions, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, power, toughness, isSuspended, planActivate, planCast, ringBearer, waitingOn, type Action, type GameState, type PlayerId } from "../src";
import { attackProblem, moveObject } from "../src/game";

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

const sower = card("Oblivion Sower", "Creature — Eldrazi", "{6}", {
  power: "5",
  toughness: "8",
  oracleText: "When you cast this spell, target opponent exiles the top four cards of their library, then you may put any number of land cards that player owns from exile onto the battlefield under your control.",
});

describe("Oblivion Sower", () => {
  it("the opponent exiles four; any of their face-up land cards in exile enter under your control, whatever exiled them", () => {
    expect(isFullySupported(sower)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([sower]);
    let s = s0;
    // Two lands on top of the opponent's library, and one of theirs exiled earlier; a face-down one doesn't count.
    const lib = [putOnBattlefield(s, opp, card("Swamp", "Basic Land — Swamp")), putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, card("Island", "Basic Land — Island")), putOnBattlefield(s, opp, bear())];
    for (const id of [...lib].reverse()) moveObject(s, id, "library", { top: true });
    const old = putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    moveObject(s, old, "exile");
    const hidden = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    moveObject(s, hidden, "exile");
    s.objects[hidden]!.hiddenExile = { by: hidden, seen: [opp] };
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, exiled: true });
    const offered = (s.pending as { cards: string[] }).cards;
    expect([...offered].sort()).toEqual([lib[0]!, lib[2]!, old].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, old] }));
    expect(s.objects[lib[0]!]!.zone).toBe("battlefield");
    expect(s.objects[lib[0]!]!.controller).toBe(ap);
    expect(s.objects[old]!.zone).toBe("battlefield");
    expect(s.objects[lib[2]!]!.zone).toBe("exile");
    expect(s.objects[hidden]!.zone).toBe("exile");
  });
});

describe("Oblivion Sower (bot)", () => {
  it("a bot puts every land it may onto the battlefield", () => {
    const { s: s0, ap, opp, ids } = setup([sower]);
    let s = s0;
    const lib = [putOnBattlefield(s, opp, card("Swamp", "Basic Land — Swamp")), putOnBattlefield(s, opp, card("Island", "Basic Land — Island"))];
    for (const id of [...lib].reverse()) moveObject(s, id, "library", { top: true });
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(lib.map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  });
});

const bombardment = card("Arcane Bombardment", "Enchantment", "{4}{R}{R}", {
  oracleText:
    "Whenever you cast your first instant or sorcery spell each turn, exile an instant or sorcery card at random from your graveyard. Then copy each card exiled with Arcane Bombardment. You may cast any number of the copies without paying their mana costs.",
});
const shock = card("Spark Draw", "Instant", "{U}", { oracleText: "Draw a card." });
const divine = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("Arcane Bombardment", () => {
  it("exiles a card at random with it on your first instant or sorcery each turn, then casts copies of all of them", () => {
    expect(isFullySupported(bombardment)).toBe(true);
    const { s: s0, ap, ids } = setup([shock, shock, shock]);
    let s = s0;
    putOnBattlefield(s, ap, bombardment);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, island);
    const d = putOnBattlefield(s, ap, divine);
    moveObject(s, d, "graveyard");
    s = passUntil(s, "main1", ap);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    // The spell that triggered it is still on the stack, so only Divination can be exiled (rulings).
    expect(s.objects[d]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [d, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: d });
    expect(s.pending?.kind).toBe("castFree");
    const copy = s.pending!.kind === "castFree" ? s.pending.objectId : "";
    s = settle(run(s, planCast(s, ap, copy)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // The second instant this turn doesn't trigger it.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    // Next turn: one more card exiled at random, then copies of both cards exiled with it.
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s = run(s, planCast(s, ap, ids[2]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    const options = s.pending!.kind === "chooseOption" ? s.pending.options : [];
    const exiledNow = [ids[0]!, ids[1]!].filter((id) => s.objects[id]!.zone === "exile");
    expect(exiledNow.length).toBe(1);
    expect([...options].sort()).toEqual([d, exiledNow[0]!, "none"].sort());
  });
});

const tyrant = card("Leyline Tyrant", "Creature — Dragon", "{2}{R}{R}", {
  power: "4",
  toughness: "4",
  keywords: ["Flying"],
  oracleText:
    "Flying\nYou don't lose unspent red mana as steps and phases end.\nWhen Leyline Tyrant dies, you may pay any amount of {R}. When you do, it deals that much damage to any target.\nIf Leyline Tyrant is in your opening hand, you may begin the game with it on the battlefield.",
});
const tapMountains = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Mountain") s.objects[id]!.tapped = true;
};
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

describe("Leyline Tyrant", () => {
  it("dies: X paid in red mana only, then that much damage to any target", () => {
    expect(isFullySupported(tyrant)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([murder]);
    const t = putOnBattlefield(s0, ap, tyrant);
    Object.assign(s0.players[ap]!.manaPool, { B: 3, R: 2, U: 3 });
    tapMountains(s0, ap);
    let s = settle(cast(s0, ap, ids[0]!, [target(t)]));
    expect(s.objects[t]!.zone).toBe("graveyard");
    // Only the red mana counts: up to 2, though 3 blue is floating too.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", options: ["none", "0", "1", "2"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{R}{R}" } });
    const blue = s.players[ap]!.manaPool.U;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.manaPool.R).toBe(0);
    expect(s.players[ap]!.manaPool.U).toBe(blue);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("a bot pays all the red it can and aims it", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const t = putOnBattlefield(s0, ap, tyrant);
    Object.assign(s0.players[ap]!.manaPool, { B: 4, R: 3 });
    tapMountains(s0, ap);
    let s = settle(cast(s0, ap, ids[0]!, [target(t)]));
    // Murder's generic took one red, so two are left.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", options: ["none", "0", "1", "2"] });
    for (let i = 0; i < 6 && s.pending; i++) s = settle(act(s, botActions(s, s.pending.player)[0]!));
    const lost = Object.values(s.players).filter((p) => p.id !== ap).reduce((n, p) => n + (40 - p.life), 0);
    expect(lost).toBe(2);
  });
});

const whelming = card("Whelming Wave", "Sorcery", "{2}{U}{U}", { oracleText: "Return all creatures to their owners' hands except for Krakens, Leviathans, Octopuses, and Serpents." });
const scourglass = card("Scourglass", "Artifact", "{1}{W}{W}", { oracleText: "{T}, Sacrifice Scourglass: Destroy all permanents except for artifacts and lands. Activate only during your upkeep." });

describe("all ... except for", () => {
  it("Whelming Wave returns every creature but Krakens, Leviathans, Octopuses and Serpents", () => {
    expect(isFullySupported(whelming)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([whelming]);
    const b = putOnBattlefield(s0, opp, bear());
    const octo = putOnBattlefield(s0, opp, card("Lorthos Copy", "Creature — Octopus", "{5}{U}{U}", { power: "5", toughness: "5" }));
    const serp = putOnBattlefield(s0, ap, card("Sea Serpent", "Creature — Serpent", "{5}{U}", { power: "5", toughness: "5" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([b, octo, serp].map((id) => s.objects[id]!.zone)).toEqual(["hand", "battlefield", "battlefield"]);
  });

  it("Scourglass destroys every permanent but artifacts and lands", () => {
    expect(isFullySupported(scourglass)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, scourglass);
    const b = putOnBattlefield(s0, opp, bear());
    const art = putOnBattlefield(s0, opp, card("Mind Stone Copy", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    let s = passUntil(s0, "upkeep", ap);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect([b, art, g].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "battlefield", "graveyard"]);
    expect(s.battlefield.some((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Island")).toBe(true);
  });
});

const toxrill = card("Toxrill, the Corrosive", "Legendary Creature — Slug Horror", "{5}{B}{B}", {
  power: "7",
  toughness: "7",
  oracleText:
    "At the beginning of each end step, put a slime counter on each creature you don't control.\nCreatures you don't control get -1/-1 for each slime counter on them.\nWhenever a creature you don't control with a slime counter on it dies, create a 1/1 black Slug creature token.\n{U}{B}, Sacrifice a Slug: Draw a card.",
});

describe("Toxrill, the Corrosive", () => {
  it("slime counters at each end step shrink each creature you don't control by its own counters; one dying with slime makes a Slug", () => {
    expect(isFullySupported(toxrill)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, toxrill);
    const mine = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, opp, card("Big Ox", "Creature — Ox", "{3}", { power: "3", toughness: "3" }));
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[big]!.counters.slime = 1; // from another source: still counts (rulings)
    invalidateCharacteristics(s0);
    expect([power(s0, s0.objects[big]!), toughness(s0, s0.objects[big]!)]).toEqual([2, 2]);
    expect(toughness(s0, s0.objects[b]!)).toBe(2);
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    // One more on each: the bear has one (1/1), the ox two (1/1); yours gets none.
    expect([s.objects[b]!.counters.slime, s.objects[big]!.counters.slime, s.objects[mine]!.counters.slime ?? 0]).toEqual([1, 2, 0]);
    expect([toughness(s, s.objects[b]!), toughness(s, s.objects[big]!)]).toEqual([1, 1]);
    s = passUntil(s, "end", opp);
    s = settle(s);
    // Another counter at the opponent's end step: both die, and each makes a Slug for Toxrill's controller.
    expect([s.objects[b]!.zone, s.objects[big]!.zone]).toEqual(["graveyard", "graveyard"]);
    const slugs = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.isToken && objIsType(s, s.objects[id]!, "Creature"));
    expect(slugs.length).toBe(2);
  });
});

const slaughter = card("Slaughter the Strong", "Sorcery", "{1}{W}{W}", {
  oracleText: "Each player chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures they control.",
});

describe("Slaughter the Strong", () => {
  it("each player keeps creatures with total power 4 or less (a negative power subtracting); the rest are sacrificed at once", () => {
    expect(isFullySupported(slaughter)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([slaughter]);
    const ox = (n: number) => card(`Ox ${n}`, "Creature — Ox", "{3}", { power: String(n), toughness: "5" });
    const [a2, b2, c3] = [putOnBattlefield(s0, ap, ox(2)), putOnBattlefield(s0, ap, ox(2)), putOnBattlefield(s0, ap, ox(3))];
    const [big, weak] = [putOnBattlefield(s0, opp, ox(5)), putOnBattlefield(s0, opp, ox(1))];
    s0.objects[weak]!.counters["-1/-1"] = 2; // power -1
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", maxTotalPower: 4, min: 0 });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [a2, c3] })).toThrow(/total power 4 or less/);
    s = act(s, { type: "pickPermanents", player: ap, ids: [a2, b2] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, maxTotalPower: 4 });
    // 5 + (-1) = 4: both survive (rulings).
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [big, weak] }));
    for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) s = settle(act(s, { type: "pickPermanents", player: s.pending.player, ids: [] }));
    expect([a2, b2, c3, big, weak].map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "graveyard", "battlefield", "battlefield"]);
  });

  it("a bot keeps its best creatures that fit", () => {
    const { s: s0, ap, opp, ids } = setup([slaughter]);
    const ox = (n: number) => card(`Ox ${n}`, "Creature — Ox", "{3}", { power: String(n), toughness: String(n) });
    const [one, three, four] = [putOnBattlefield(s0, opp, ox(1)), putOnBattlefield(s0, opp, ox(3)), putOnBattlefield(s0, opp, ox(4))];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) s = settle(act(s, botActions(s, s.pending.player)[0]!));
    const kept = [one, three, four].filter((id) => s.objects[id]!.zone === "battlefield");
    expect(kept.reduce((t, id) => t + power(s, s.objects[id]!), 0)).toBeLessThanOrEqual(4);
    expect(kept.length).toBeGreaterThan(0);
  });
});

const silkguard = card("Silkguard", "Instant", "{X}{G}", {
  oracleText:
    "Put a +1/+1 counter on each of up to X target creatures you control.\nAuras, Equipment, and modified creatures you control gain hexproof until end of turn. (Equipment, Auras you control, and counters are modifications.)",
});

describe("Silkguard", () => {
  it("counters on up to X; then your Auras, Equipment and modified creatures (counted after the counters) gain hexproof", () => {
    expect(isFullySupported(silkguard)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([silkguard]);
    const [a, b] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    const eq = putOnBattlefield(s0, ap, card("Bone Saw", "Artifact — Equipment", "{0}", { oracleText: "Equipped creature gets +1/+0.\nEquip {1}" }));
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[theirs]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a)], undefined, "auto", 1)));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    const hex = (id: string) => objHasKeyword(s, s.objects[id]!, "Hexproof");
    expect([hex(a), hex(b), hex(eq), hex(theirs)]).toEqual([true, false, true, false]);
  });
});

const bruenor = card("Bruenor Battlehammer", "Legendary Creature — Dwarf Warrior", "{2}{R}{W}", {
  power: "5",
  toughness: "3",
  oracleText: "Each creature you control gets +2/+0 for each Equipment attached to it.\nYou may pay {0} rather than pay the equip cost of the first equip ability you activate each turn.",
});
const shikari = card("Leonin Shikari", "Creature — Cat Soldier", "{1}{W}", { power: "2", toughness: "2", oracleText: "You may activate equip abilities any time you could cast an instant." });
const splitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });

describe("Bruenor Battlehammer", () => {
  it("the first equip each turn is free, on an opponent's turn too (unlike Forge Anew); the second costs its mana", () => {
    expect(isFullySupported(bruenor)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, bruenor);
    putOnBattlefield(s0, opp, shikari);
    const sw = putOnBattlefield(s0, opp, splitter);
    const [a, b] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear())];
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === opp && objIsType(s0, s0.objects[id]!, "Land")) s0.objects[id]!.tapped = true;
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(abilityProblem(s, opp, sw, 0, [target(a)])).toBeNull();
    s = settle(act(s, { type: "activateAbility", player: opp, objectId: sw, index: 0, targets: [target(a)] } as never));
    expect(s.objects[sw]!.attachedTo).toBe(a);
    // Bonesplitter's +2/+0 and Bruenor's +2/+0 for it.
    expect(power(s, s.objects[a]!)).toBe(6);
    if (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(abilityProblem(s, opp, sw, 0, [target(b)])).toMatch(/mana/);
  });
});

const sceptre = card("Sceptre of Eternal Glory", "Legendary Artifact", "{4}", {
  oracleText: "{T}: Add one mana of any color.\n{T}: Add three mana of any one color. Activate only if you control three or more lands with the same name.",
});

describe("Sceptre of Eternal Glory", () => {
  it("three mana only while you control three or more lands with one name", () => {
    expect(isFullySupported(sceptre)).toBe(true);
    const { s, ap } = setup([]);
    const sc = putOnBattlefield(s, ap, sceptre);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Land"));
    // Down to two of each name: no.
    const byName = new Map<string, string[]>();
    for (const id of lands) byName.set(s.cards[s.objects[id]!.cardId]!.name, [...(byName.get(s.cards[s.objects[id]!.cardId]!.name) ?? []), id]);
    for (const ids of byName.values()) for (const id of ids.slice(2)) moveObject(s, id, "graveyard");
    invalidateCharacteristics(s);
    expect(manaAbilityProblem(s, ap, s.objects[sc]!, 0)).toBeNull();
    expect(manaAbilityProblem(s, ap, s.objects[sc]!, 1)).not.toBeNull();
    putOnBattlefield(s, ap, island);
    expect(manaAbilityProblem(s, ap, s.objects[sc]!, 1)).toBeNull();
  });
});

const skydiver = card("Thieving Skydiver", "Creature — Merfolk Rogue", "{1}{U}", {
  power: "2",
  toughness: "1",
  keywords: ["Kicker", "Flying"],
  oracleText:
    "Kicker {X}. X can't be 0. (You may pay an additional {X} as you cast this spell.)\nFlying\nWhen Thieving Skydiver enters, if it was kicked, gain control of target artifact with mana value X or less. If that artifact is an Equipment, attach it to Thieving Skydiver.",
});

describe("Kicker {X}: Thieving Skydiver", () => {
  it("X only when kicked, never 0; it steals an artifact with mana value X or less and wears it if it's an Equipment", () => {
    expect(isFullySupported(skydiver)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([skydiver]);
    const sw = putOnBattlefield(s0, opp, splitter);
    const big = putOnBattlefield(s0, opp, card("Big Relic", "Artifact", "{4}", { oracleText: "" }));
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 2, {})).toMatch(/no X/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 0, { kicks: [0] })).toMatch(/can't be 0/);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1, { kicks: [0] });
    expect(plan).not.toBeNull();
    let s = settle(run(s0, plan));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // X = 1: Bonesplitter (mana value 1) can be chosen, the 4-mana relic can't.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(big)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(sw)] }));
    expect(controllerOf(s, s.objects[sw]!)).toBe(ap);
    expect(s.objects[sw]!.attachedTo).toBe(ids[0]);
  });

  it("unkicked: no X, no trigger; a bot kicks it with an X big enough", () => {
    const { s: s0, ap, opp, ids } = setup([skydiver]);
    const sw = putOnBattlefield(s0, opp, splitter);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[sw]!)).toBe(opp);
    const b = setup([skydiver]);
    const sw2 = putOnBattlefield(b.s, b.opp, splitter);
    b.s.players[b.ap]!.hand = [b.ids[0]!];
    b.s.players[b.ap]!.command = [];
    const cast = botActions(b.s, b.ap).find((a) => a.type === "castSpell");
    expect(cast).toMatchObject({ kicks: [0] });
    s = run(b.s, botActions(b.s, b.ap));
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : settle(s);
    expect(controllerOf(s, s.objects[sw2]!)).toBe(b.ap);
  });
});

const sphinxRev = card("Sphinx of the Revelation", "Creature — Sphinx", "{3}{W}{U}{U}", {
  power: "5",
  toughness: "5",
  keywords: ["Flying", "Lifelink"],
  oracleText: "Flying, lifelink\nWhenever you gain life, you get that much {E} (energy counter).\n{W}{U}{U}, {T}, Pay X {E}: Draw X cards.",
});
const nightmare = card("Chthonian Nightmare", "Enchantment", "{1}{B}", {
  oracleText:
    "When this enchantment enters, you get {E}{E}{E} (three energy counters).\nPay X {E}, Sacrifice a creature, Return this enchantment to its owner's hand: Return target creature card with mana value X from your graveyard to the battlefield. Activate only as a sorcery.",
});

describe("Pay X {E}", () => {
  it("Sphinx of the Revelation: X energy for X cards, no more than you have; a bot uses it", () => {
    expect(isFullySupported(sphinxRev)).toBe(true);
    const { s: s0, ap } = setup([]);
    const sx = putOnBattlefield(s0, ap, sphinxRev);
    s0.players[ap]!.energy = 3;
    let s = passUntil(s0, "main1", ap);
    expect(abilityProblem(s, ap, sx, 0, undefined, undefined, undefined, 4)).toMatch(/energy/);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, sx, 0, undefined, undefined, undefined, 2)));
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // A bot spends all of it.
    const b = setup([]);
    const bx = putOnBattlefield(b.s, b.ap, sphinxRev);
    b.s.players[b.ap]!.energy = 2;
    b.s.players[b.ap]!.hand = [];
    b.s.players[b.ap]!.command = [];
    let t = passUntil(b.s, "main2", b.ap);
    const use = botActions(t, b.ap).find((a) => a.type === "activateAbility");
    expect(use).toMatchObject({ objectId: bx, x: 2 });
    t = settle(run(t, botActions(t, b.ap)));
    expect(t.players[b.ap]!.energy).toBe(0);
  });

  it("Chthonian Nightmare: X energy returns a creature card with mana value X", () => {
    expect(isFullySupported(nightmare)).toBe(true);
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nightmare);
    const fodder = putOnBattlefield(s0, ap, bear());
    const three = putOnBattlefield(s0, ap, card("Three Drop", "Creature — Ox", "{2}{G}", { power: "3", toughness: "3" }));
    moveObject(s0, three, "graveyard");
    s0.players[ap]!.energy = 3;
    let s = passUntil(s0, "main1", ap);
    expect(abilityProblem(s, ap, n, 0, [target(three)], undefined, undefined, 2, { sacrifice: [fodder] })).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, n, 0, [target(three)], undefined, undefined, 3, { sacrifice: [fodder] })));
    expect(s.objects[three]!.zone).toBe("battlefield");
    expect(s.objects[n]!.zone).toBe("hand");
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.players[ap]!.energy).toBe(0);
  });
});

const together = card("Together Forever", "Enchantment", "{W}{W}", {
  keywords: ["Support"],
  oracleText:
    "When this enchantment enters, support 2. (Put a +1/+1 counter on each of up to two target creatures.)\n{1}: Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand.",
});

describe("Together Forever", () => {
  it("a creature with a counter chosen this turn returns to its owner's hand when it dies, only this turn", () => {
    expect(isFullySupported(together)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([murder, murder]);
    const tf = putOnBattlefield(s0, ap, together);
    const a = putOnBattlefield(s0, ap, bear());
    const plain = putOnBattlefield(s0, ap, bear());
    s0.objects[a]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    expect(abilityProblem(s0, ap, tf, 0, [target(plain)])).not.toBeNull();
    Object.assign(s0.players[ap]!.manaPool, { C: 1, B: 6 });
    let s = settle(run(s0, planActivate(s0, ap, tf, 0, [target(a)])));
    s = settle(cast(s, ap, ids[0]!, [target(a)]));
    expect(s.objects[a]!.zone).toBe("hand");
    void opp;
  });
});

const indomitable = card("The Indomitable", "Legendary Artifact — Vehicle", "{2}{U}{U}", {
  power: "6",
  toughness: "6",
  keywords: ["Crew", "Trample"],
  oracleText: "Trample\nWhenever a creature you control deals combat damage to a player, draw a card.\nCrew 3\nYou may cast this card from your graveyard as long as you control three or more tapped Pirates and/or Vehicles.",
});

describe("The Indomitable", () => {
  it("castable from your graveyard only while you control three or more tapped Pirates and/or Vehicles", () => {
    expect(isFullySupported(indomitable)).toBe(true);
    const { s, ap, ids } = setup([indomitable]);
    moveObject(s, ids[0]!, "graveyard");
    const pirate = () => putOnBattlefield(s, ap, card("Deck Hand", "Creature — Human Pirate", "{1}", { power: "1", toughness: "1" }));
    const [p1, p2] = [pirate(), pirate()];
    const v = putOnBattlefield(s, ap, card("Skiff", "Artifact — Vehicle", "{1}", { power: "2", toughness: "2", oracleText: "Crew 1" }));
    for (const id of [p1, p2]) s.objects[id]!.tapped = true;
    invalidateCharacteristics(s);
    const can = () => castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { via: "permission" });
    Object.assign(s.players[ap]!.manaPool, { U: 4 });
    expect(can()).toMatch(/graveyard|can't/);
    s.objects[v]!.tapped = true;
    invalidateCharacteristics(s);
    expect(can()).toBeNull();
  });
});

const sandwurm = card("Sandwurm Convergence", "Enchantment", "{6}{G}{G}", {
  oracleText: "Creatures with flying can't attack you or planeswalkers you control.\nAt the beginning of your end step, create a 5/5 green Wurm creature token.",
});

describe("can't attack you or planeswalkers you control", () => {
  it("Sandwurm Convergence: flyers can't attack its controller (or their planeswalkers), others can", () => {
    expect(isFullySupported(sandwurm)).toBe(true);
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, sandwurm);
    const flyer = putOnBattlefield(s, opp, card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" }));
    const walker = putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(attackProblem(s, s.objects[flyer]!, ap)).toMatch(/can't attack/);
    expect(attackProblem(s, s.objects[flyer]!, third)).toBeNull();
    expect(attackProblem(s, s.objects[walker]!, ap)).toBeNull();
  });
});

const bow = card("Bow of Nylea", "Legendary Enchantment Artifact", "{1}{G}{G}", {
  oracleText:
    "Attacking creatures you control have deathtouch.\n{1}{G}, {T}: Choose one —\n• Put a +1/+1 counter on target creature.\n• Bow of Nylea deals 2 damage to target creature with flying.\n• You gain 3 life.\n• Put up to four target cards from your graveyard on the bottom of your library in any order.",
});

describe("Bow of Nylea", () => {
  it("puts up to four target cards from your graveyard on the bottom of your library, in the order chosen", () => {
    expect(isFullySupported(bow)).toBe(true);
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bow);
    const [x, y] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    for (const id of [x, y]) moveObject(s0, id, "graveyard");
    let s = passUntil(s0, "main1", ap);
    s = settle(run(s, planActivate(s, ap, b, 0, [target(y), target(x), { kind: "none" }, { kind: "none" }], [3])));
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2)).toEqual([y, x]);
  });
});

const ringsight = card("Ringsight", "Sorcery", "{1}{U}{B}", {
  oracleText:
    "The Ring tempts you. Search your library for a card that shares a color with a legendary creature you control, reveal it, put it into your hand, then shuffle.",
});
const blueGuy = card("Blue Guy", "Creature — Human", "{1}{U}", { power: "1", toughness: "1" });

describe("Ringsight", () => {
  it("finds a card sharing a color with a legendary creature you control; your Ring-bearer is legendary (rulings)", () => {
    expect(isFullySupported(ringsight)).toBe(true);
    const { s: s0, ap, ids } = setup([ringsight]);
    const g = putOnBattlefield(s0, ap, bear());
    const u = putOnBattlefield(s0, ap, blueGuy);
    moveObject(s0, u, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto"));
    s = settle(s);
    // The only creature: it's the Ring-bearer without a choice.
    expect(s.pending?.kind).toBe("searchLibrary");
    expect(ringBearer(s, ap)?.id).toBe(g);
    const found = (s.pending as { cards: string[] }).cards;
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found[0]!] }));
    expect(s.players[ap]!.hand).toContain(found[0]);
  });
  it("a colorless legendary creature shares no color: nothing is found", () => {
    const { s: s0, ap, ids } = setup([ringsight]);
    putOnBattlefield(s0, ap, card("Legend Golem", "Legendary Artifact Creature — Golem", "{4}", { power: "3", toughness: "3" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto")));
    expect(s.pending?.kind === "searchLibrary" ? (s.pending as { cards: string[] }).cards : []).toEqual([]);
  });
});
