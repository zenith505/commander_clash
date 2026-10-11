// Keyword actions that need a player's choice while a spell resolves (discard, scry, surveil),
// and fight. CR 701.9, 701.14, 701.22, 701.25; choices in APNAP order per CR 101.4.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, planCast, waitingOn, type GameState } from "../src";

const castOnly = (s: GameState, pid: number, id: string, targets?: Parameters<typeof planCast>[3]) => {
  for (const a of planCast(s, pid, id, targets)!) s = act(s, a);
  return s;
};
const resolveTop = (s: GameState) => passAll(s);
const hand = (s: GameState, pid: number) => s.players[pid]!.hand;

describe("discard (CR 701.9)", () => {
  const mind = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });

  it("the discarding player chooses, while the spell waits partway through resolving", () => {
    const { s: s0, ap, ids, opp } = setup([mind]);
    let s = resolveTop(castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 2 });
    expect(waitingOn(s)).toBe(opp);
    expect(s.objects[ids[0]!]!.zone).toBe("stack"); // still resolving
    expect(() => act(s, { type: "discard", player: opp, objectIds: [hand(s, opp)[0]!] })).toThrow(/exactly 2/);
    const pick = hand(s, opp).slice(0, 2);
    s = act(s, { type: "discard", player: opp, objectIds: pick });
    expect(pick.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard"); // finished resolving (CR 608.2n)
    expect(s.pending).toBeNull();
    expect(waitingOn(s)).toBe(ap); // active player gets priority (CR 117.3b)
  });

  it("with no more cards than it says, the whole hand goes and there's nothing to choose", () => {
    const { s: s0, ap, ids, opp } = setup([mind]);
    s0.players[opp]!.hand = hand(s0, opp).slice(0, 1);
    const s = resolveTop(castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toBeNull();
    expect(hand(s, opp)).toHaveLength(0);
  });

  it("each opponent chooses in turn order, then all the cards are discarded at once (CR 101.4)", () => {
    const rot = card("Wave of Rot", "Sorcery", "{B}", { oracleText: "Each opponent discards a card." });
    const { s: s0, ap, ids } = setup([rot]);
    let s = resolveTop(castOnly(s0, ap, ids[0]!));
    const order = [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
    const before = order.map((p) => hand(s, p).length);
    for (const p of order) {
      expect(s.pending).toMatchObject({ kind: "discard", player: p });
      // Nobody has discarded yet: the discards happen together after the last choice.
      expect(order.map((q) => hand(s, q).length)).toEqual(before);
      s = act(s, { type: "discard", player: p, objectIds: [hand(s, p)[0]!] });
    }
    expect(order.map((q) => hand(s, q).length)).toEqual(before.map((n) => n - 1));
  });

  it("'draw two cards, then discard a card' draws first", () => {
    const loot = card("Loot", "Sorcery", "{U}", { oracleText: "Draw two cards, then discard a card." });
    const { s: s0, ap, ids } = setup([loot]);
    const n = hand(s0, ap).length - 1;
    let s = resolveTop(castOnly(s0, ap, ids[0]!));
    expect(hand(s, ap)).toHaveLength(n + 2);
    s = act(s, { type: "discard", player: ap, objectIds: [hand(s, ap)[0]!] });
    expect(hand(s, ap)).toHaveLength(n + 1);
  });

  it("at random needs no choice", () => {
    const cat = card("Random Rot", "Sorcery", "{B}", { oracleText: "Target opponent discards two cards at random." });
    const { s: s0, ap, ids, opp } = setup([cat]);
    const n = hand(s0, opp).length;
    const s = resolveTop(castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toBeNull();
    expect(hand(s, opp)).toHaveLength(n - 2);
  });

  it("state-based actions wait until the spell has finished resolving (CR 704.3)", () => {
    // The bear is 0/0 while the spell waits for a discard, but survives: counters come before any check.
    const odd = card("Odd Bargain", "Sorcery", "{B}", {
      oracleText: "Target creature gets -2/-2 until end of turn. Each opponent discards a card. Put two +1/+1 counters on that creature.",
    });
    const { s: s0, ap, ids } = setup([odd]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveTop(castOnly(s0, ap, ids[0]!, [target(b)]));
    expect(s.pending?.kind).toBe("discard");
    expect(pt(s, b)).toBe("0/0");
    while (s.pending?.kind === "discard") s = act(s, { type: "discard", player: s.pending.player, objectIds: [hand(s, s.pending.player)[0]!] });
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(pt(s, b)).toBe("2/2");
  });
});

describe("scry and surveil (CR 701.22, 701.25)", () => {
  const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 2.\nDraw a card." });
  const surveil = card("Look Back", "Instant", "{U}", { oracleText: "Surveil 2." });

  it("scry: chosen cards stay on top in the chosen order, the rest go to the bottom; then the draw", () => {
    const { s: s0, ap, ids } = setup([opt]);
    const [c1, c2] = s0.players[ap]!.library;
    let s = resolveTop(castOnly(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry", cards: [c1, c2] });
    expect(() => act(s, { type: "arrangeTop", player: ap, top: [c1!], away: [] })).toThrow(/each card/);
    s = act(s, { type: "arrangeTop", player: ap, top: [c2!], away: [c1!] });
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(c1);
    expect(hand(s, ap)).toContain(c2); // then it drew the card left on top
    expect(s.log.some((e) => /scries 2: 1 on top, 1 on the bottom/.test(e.text))).toBe(true);
  });

  it("surveil: the rest go to the graveyard", () => {
    const { s: s0, ap, ids } = setup([surveil]);
    const [c1, c2] = s0.players[ap]!.library;
    let s = resolveTop(castOnly(s0, ap, ids[0]!));
    s = act(s, { type: "arrangeTop", player: ap, top: [], away: [c1!, c2!] });
    expect([s.objects[c1!]!.zone, s.objects[c2!]!.zone]).toEqual(["graveyard", "graveyard"]);
  });
});

describe("fight (CR 701.14)", () => {
  const fight = card("Prey Upon", "Sorcery", "{G}", { oracleText: "Target creature you control fights target creature you don't control." });
  const bite = card("Rabid Bite", "Sorcery", "{1}{G}", { oracleText: "Target creature you control deals damage equal to its power to target creature you don't control." });

  it("each deals damage equal to its power to the other", () => {
    const { s: s0, ap, ids, opp } = setup([fight]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Big", power: "4", toughness: "4" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Medium", power: "3", toughness: "3" }));
    const s = resolveTop(castOnly(s0, ap, ids[0]!, [target(mine), target(theirs)]));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.damage).toBe(3);
  });

  it("if either creature is gone or an illegal target, neither deals damage (CR 701.14b)", () => {
    const murder = card("Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
    const { s: s0, ap, ids, opp } = setup([fight, murder]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Big", power: "4", toughness: "4" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Medium", power: "3", toughness: "3" }));
    let s = castOnly(s0, ap, ids[0]!, [target(mine), target(theirs)]);
    s = castOnly(s, ap, ids[1]!, [target(mine)]);
    s = resolveTop(s); // Murder kills our fighter
    s = resolveTop(s); // Prey Upon: one target left, but no damage at all
    expect(s.objects[theirs]!.damage).toBe(0);
  });

  it("'deals damage equal to its power' is one-way, and uses that creature's deathtouch and lifelink", () => {
    const { s: s0, ap, ids, opp } = setup([bite]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Viper", power: "1", toughness: "1", keywords: ["Deathtouch", "Lifelink"], oracleText: "Deathtouch, lifelink" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Wall", power: "0", toughness: "8" }));
    const life = s0.players[ap]!.life;
    const s = resolveTop(castOnly(s0, ap, ids[0]!, [target(mine), target(theirs)]));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.players[ap]!.life).toBe(life + 1);
  });
});

describe("bots", () => {
  it("answer discard and scry decisions", () => {
    const mind = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });
    const { s: s0, ap, ids, opp } = setup([mind]);
    let s = resolveTop(castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const [a] = botActions(s, opp);
    expect(a).toMatchObject({ type: "discard", player: opp });
    s = act(s, a!);
    expect(s.pending).toBeNull();
  });
});
