// Casting from a graveyard and what happens to spells after: flashback (CR 702.34), jump-start
// (702.133), retrace (702.81), escape (702.138), buyback (702.27), rebound (702.88), unearth (702.84).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
/** Put a card from `pid`'s hand into their graveyard. */
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};

const thinkTwice = card("Think Twice", "Instant", "{1}{U}", { oracleText: "Draw a card.\nFlashback {2}{U}" });
const analysis = card("Deep Analysis", "Sorcery", "{3}{U}", { oracleText: "Target player draws two cards.\nFlashback—{1}{U}, Pay 3 life." });
const staggershock = card("Staggershock", "Instant", "{2}{R}{R}", { oracleText: "Staggershock deals 2 damage to any target.\nRebound" });
const whispers = card("Whispers of the Muse", "Instant", "{U}", { oracleText: "Draw a card.\nBuyback {5}" });
const ravensCrime = card("Raven's Crime", "Sorcery", "{B}", { oracleText: "Target player discards a card.\nRetrace" });
const radical = card("Radical Idea", "Instant", "{1}{U}", { oracleText: "Draw a card.\nJump-start" });
const zombie = card("Dregscape Zombie", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "1", oracleText: "Unearth {B}" });
const hound = card("Escape Hound", "Creature — Dog", "{1}{R}", {
  power: "2",
  toughness: "2",
  oracleText: "Escape—{2}{R}, Exile two other cards from your graveyard.\nThis creature escapes with two +1/+1 counters on it.",
});
const cancel = card("Cancel", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell." });
const forestCard = card("Forest", "Basic Land — Forest");

describe("casting from a graveyard", () => {
  it("compiles the keywords", () => {
    supported(thinkTwice, analysis, staggershock, whispers, ravensCrime, radical, zombie, hound);
    expect(compileCard(analysis).fromGraveyard).toEqual([{ kind: "flashback", mana: "{1}{U}", costs: [{ kind: "payLife", n: 3 }], exile: true }]);
    expect(compileCard(hound).escapesWith).toBe(2);
    expect(compileCard(zombie).activated[0]).toMatchObject({ zone: "graveyard", sorcerySpeed: true, manaCost: "{B}" });
    // Flashback on a creature card isn't a thing; neither is buyback.
    expect(isFullySupported(card("Odd", "Creature — Elf", "{G}", { power: "1", toughness: "1", oracleText: "Flashback {G}" }))).toBe(false);
  });

  it("flashback: cast from the graveyard for its flashback cost, then exiled", () => {
    const { s: s0, ap, ids } = setup([thinkTwice]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(castProblem(s, ap, ids[0]!)).toMatch(/choose how to cast Think Twice/);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { via: "escape" })).toMatch(/doesn't have escape/);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(logged(s, /casts Think Twice from their graveyard \(flashback\)/)).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("a flashed-back spell that's countered is exiled too", () => {
    const { s: s0, ap, ids } = setup([thinkTwice, cancel]);
    toGraveyard(s0, ap, ids[0]!);
    let s = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "flashback" })!.reduce((x, a) => act(x, a), s0);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Deep Analysis's flashback costs mana and 3 life", () => {
    const { s: s0, ap, ids } = setup([analysis]);
    toGraveyard(s0, ap, ids[0]!);
    const life = s0.players[ap]!.life;
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, { via: "flashback" }));
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("jump-start discards a card; retrace discards a land card and goes back to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([radical, ravensCrime, bear(), forestCard]);
    toGraveyard(s0, ap, ids[0]!);
    toGraveyard(s0, ap, ids[1]!);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "jumpStart", discard: [ids[2]!] }));
    expect(zone(s, ids[2]!)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "retrace", discard: s.players[ap]!.hand.filter((id) => id !== ids[3]).slice(0, 1) })).toBeNull(); // not a land
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "retrace", discard: [ids[3]!] }));
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: opp, objectIds: s.players[opp]!.hand.slice(0, 1) }));
    expect(zone(s, ids[3]!)).toBe("graveyard");
    expect(zone(s, ids[1]!)).toBe("graveyard"); // retrace doesn't exile it
  });

  it("escape: pays its escape cost, exiles other cards, and enters with counters", () => {
    const { s: s0, ap, ids } = setup([hound, thinkTwice, whispers]);
    for (const id of ids) toGraveyard(s0, ap, id);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { via: "escape", exileCards: [ids[0]!, ids[1]!] })).toMatch(/choose 2 card to exile/);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "escape", exileCards: [ids[1]!, ids[2]!] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect([zone(s, ids[1]!), zone(s, ids[2]!)]).toEqual(["exile", "exile"]);
    expect(characteristics(s, s.objects[ids[0]!]!).power).toBe(4);
  });
});

describe("buyback and rebound", () => {
  it("buyback: paid, the spell returns to its owner's hand; not paid, it goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([whispers]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { buyback: true }));
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(logged(s, /paying buyback/)).toBe(true);
    s = run(s, planCast(s, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("buyback doesn't save a countered spell", () => {
    const { s: s0, ap, ids } = setup([whispers, cancel]);
    let s = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { buyback: true })!.reduce((x, a) => act(x, a), s0);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("rebound: exiled, then cast for free at your next upkeep, then to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([staggershock]);
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.players[opp]!.life).toBe(life - 2);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0]! });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(zone(s, ids[0]!)).toBe("graveyard"); // cast from exile this time: no rebound
  });
});

describe("unearth (CR 702.84)", () => {
  it("returns with haste, is exiled at the next end step", () => {
    const { s: s0, ap, ids, opp } = setup([zombie]);
    toGraveyard(s0, ap, ids[0]!);
    let s = run(s0, planActivate(s0, ap, ids[0]!, 0));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).toContain("Haste");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ids[0]!, defender: opp }] });
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("if it would leave the battlefield, it's exiled instead; only as a sorcery", () => {
    const { s: s0, ap, ids } = setup([zombie]);
    toGraveyard(s0, ap, ids[0]!);
    let s = run(s0, planActivate(s0, ap, ids[0]!, 0));
    s.objects[ids[0]!]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: ap }));
    expect(zone(s, ids[0]!)).toBe("exile");
    const { s: t0, ap: p, ids: t } = setup([zombie]);
    toGraveyard(t0, p, t[0]!);
    const t1 = passUntil(t0, "beginCombat", p);
    expect(planActivate(t1, p, t[0]!, 0)).toBeNull();
  });

  it("bots flash back spells and unearth creatures", () => {
    const { s: s0, ap, ids } = setup([thinkTwice, zombie]);
    for (const id of ids) toGraveyard(s0, ap, id);
    s0.players[ap]!.isBot = true;
    s0.players[ap]!.landsPlayedThisTurn = 1;
    s0.players[ap]!.command = []; // nothing better to cast
    for (const id of s0.players[ap]!.hand.splice(0)) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    const acts = botActions(s0, ap);
    expect(acts[acts.length - 1]).toMatchObject({ type: "castSpell", objectId: ids[0]!, via: "flashback" });
    // With the spell gone, the zombie comes back to attack.
    const yard = s0.players[ap]!.graveyard;
    yard.splice(yard.indexOf(ids[0]!), 1);
    s0.objects[ids[0]!]!.zone = "exile";
    s0.players[ap]!.exile.push(ids[0]!);
    const next = botActions(s0, ap);
    expect(next[next.length - 1]).toMatchObject({ type: "activateAbility", objectId: ids[1]! });
  });
});
