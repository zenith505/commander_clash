// "Creatures target player controls get -2/-2", "tap all creatures target opponent controls", "each creature that
// player controls": a group chosen through a player target (CR 115.1). And "untap them / those creatures" after a group
// effect: the same creatures it affected, locked in as it started (CR 611.2c), not ones that arrive later.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, chooseTargets, compileCard, controllerOf, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const arms = card("Arms of Hadar", "Sorcery", "{3}{B}", { oracleText: "Creatures target player controls get -2/-2 until end of turn." });
const tempest = card("Tempest Caller", "Creature — Merfolk Wizard", "{2}{U}{U}", { power: "2", toughness: "3", oracleText: "When this creature enters, tap all creatures target opponent controls." });
const radiating = card("Radiating Lightning", "Instant", "{3}{R}", { oracleText: "Radiating Lightning deals 3 damage to target player and 1 damage to each creature that player controls." });
const roar = card("Rallying Roar", "Instant", "{2}{W}", { oracleText: "Creatures you control get +1/+1 until end of turn. Untap them." });
const takeover = card("Broadcast Takeover", "Sorcery", "{2}{R}{R}{R}", { oracleText: "Gain control of all artifacts your opponents control until end of turn. Untap them. They gain haste until end of turn." });
const unity = card("Dauntless Unity", "Instant", "{1}{W}", {
  oracleText: "Kicker {1}{W} (You may pay an additional {1}{W} as you cast this spell.)\nCreatures you control get +1/+1 until end of turn. If this spell was kicked, those creatures get +2/+1 until end of turn instead.",
  keywords: ["Kicker"],
});
const zealous = card("Zealous Display", "Instant", "{2}{W}", { oracleText: "Creatures you control get +2/+0 until end of turn. If it's not your turn, untap those creatures." });
const ascendancy = card("Jeskai Ascendancy", "Enchantment", "{U}{R}{W}", {
  oracleText: "Whenever you cast a noncreature spell, creatures you control get +1/+1 until end of turn. Untap those creatures.\nWhenever you cast a noncreature spell, you may draw a card. If you do, discard a card.",
});
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{2}, {T}, Sacrifice this artifact: Draw a card." });
const plains = card("Plains", "Basic Land — Plains");

const opponentsOf = (s: GameState, pid: PlayerId) => {
  const i = s.turnOrder.indexOf(pid);
  return [...s.turnOrder.slice(i + 1), ...s.turnOrder.slice(0, i)];
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Resolves everything, answering any choice the way a bot would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, who)[0]! : { type: "passPriority", player: who });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const player = (id: PlayerId) => ({ kind: "player" as const, id });

describe("a group chosen through a player target", () => {
  it("is supported", () => [arms, tempest, radiating].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Arms of Hadar: only that player's creatures, and only those there as it resolves (CR 611.2c)", () => {
    const { s: s0, ap, ids } = setup([arms]);
    const [b, c] = opponentsOf(s0, ap);
    const big = putOnBattlefield(s0, b!, bear({ name: "Big", power: "4", toughness: "4" }));
    const small = putOnBattlefield(s0, b!, bear({ name: "Small" }));
    const other = putOnBattlefield(s0, c!, bear({ name: "Other" }));
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [player(b!)])));
    expect(pt(s, big)).toBe("2/2");
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(pt(s, other)).toBe("2/2");
    const late = putOnBattlefield(s, b!, bear({ name: "Late" }));
    expect(pt(s, late)).toBe("2/2");
    s = passUntil(s, "upkeep");
    expect(pt(s, big)).toBe("4/4");
  });

  it("Tempest Caller: its enters trigger targets an opponent and taps all their creatures", () => {
    const { s: s0, ap, ids } = setup([tempest]);
    const [b, c] = opponentsOf(s0, ap);
    const xb = putOnBattlefield(s0, b!, bear({ name: "Bear B" }));
    const xb2 = putOnBattlefield(s0, b!, bear({ name: "Bear B2" }));
    const xc = putOnBattlefield(s0, c!, bear({ name: "Bear C" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Ours" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // It's "target opponent": not ourselves.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [player(ap)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(b!)] }));
    expect([xb, xb2].map((id) => s.objects[id]!.tapped)).toEqual([true, true]);
    expect(s.objects[xc]!.tapped).toBe(false);
    expect(s.objects[mine]!.tapped).toBe(false);
  });

  it("Radiating Lightning: 3 to the player and 1 to each creature that player controls", () => {
    const { s: s0, ap, ids } = setup([radiating]);
    const [b, c] = opponentsOf(s0, ap);
    const one = putOnBattlefield(s0, b!, bear({ name: "One", power: "1", toughness: "1" }));
    const two = putOnBattlefield(s0, b!, bear({ name: "Two" }));
    const theirs = putOnBattlefield(s0, c!, bear({ name: "Theirs", power: "1", toughness: "1" }));
    const life = s0.players[b!]!.life;
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [player(b!)])));
    expect(s.players[b!]!.life).toBe(life - 3);
    expect(s.objects[one]!.zone).toBe("graveyard");
    expect(s.objects[two]!.damage).toBe(1);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("bots aim it at the opponent it hurts most", () => {
    const { s, ap, ids } = setup([arms]);
    const [b, , d] = opponentsOf(s, ap);
    putOnBattlefield(s, b!, bear({ name: "Lone" }));
    for (let i = 0; i < 3; i++) putOnBattlefield(s, d!, bear({ name: `Swarm ${i}` }));
    putOnBattlefield(s, ap, bear({ name: "Ours" }));
    putOnBattlefield(s, ap, bear({ name: "Ours too" }));
    putOnBattlefield(s, ap, bear({ name: "Ours three" }));
    putOnBattlefield(s, ap, bear({ name: "Ours four" }));
    expect(chooseTargets(s, ap, compileCard(arms).spell!, false, ids[0])).toEqual([player(d!)]);
  });
});

describe("untap them: the creatures the effect just affected", () => {
  it("is supported", () => [roar, takeover, unity, zealous, ascendancy].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Rallying Roar: +1/+1 and untaps our creatures, not anyone else's", () => {
    const { s: s0, ap, ids, opp } = setup([roar]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Ours" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Theirs" }));
    s0.objects[mine]!.tapped = true;
    s0.objects[theirs]!.tapped = true;
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, mine)).toBe("3/3");
    expect(s.objects[mine]!.tapped).toBe(false);
    expect(s.objects[theirs]!.tapped).toBe(true);
  });

  it("Broadcast Takeover: the artifacts come untapped with haste, and go back at end of turn", () => {
    const { s: s0, ap, ids } = setup([takeover]);
    const [b, c] = opponentsOf(s0, ap);
    const rb = putOnBattlefield(s0, b!, relic);
    const rc = putOnBattlefield(s0, c!, relic);
    const mine = putOnBattlefield(s0, ap, relic);
    s0.objects[rb]!.tapped = true;
    s0.objects[mine]!.tapped = true;
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect([rb, rc].map((id) => controllerOf(s, s.objects[id]!))).toEqual([ap, ap]);
    expect(s.objects[rb]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[rb]!, "Haste")).toBe(true);
    // Ours wasn't gained, so it isn't one of "them".
    expect(s.objects[mine]!.tapped).toBe(true);
    s = passUntil(s, "upkeep");
    expect(controllerOf(s, s.objects[rb]!)).toBe(b);
    expect(controllerOf(s, s.objects[rc]!)).toBe(c);
  });

  it("Dauntless Unity: +1/+1, or +2/+1 instead when kicked", () => {
    const { s: s0, ap, ids } = setup([unity]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Ours" }));
    expect(pt(passAll(run(s0, planCast(s0, ap, ids[0]!))), mine)).toBe("3/3");
    const { s: t0, ap: ap2, ids: ids2 } = setup([unity]);
    const mine2 = putOnBattlefield(t0, ap2, bear({ name: "Ours" }));
    expect(pt(passAll(run(t0, planCast(t0, ap2, ids2[0]!, undefined, undefined, undefined, undefined, { kicks: [0] }))), mine2)).toBe("4/3");
  });

  it("Zealous Display untaps them only when it isn't its controller's turn", () => {
    const { s: s0, ap, ids } = setup([zealous]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Ours" }));
    s0.objects[mine]!.tapped = true;
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, mine)).toBe("4/2");
    expect(s.objects[mine]!.tapped).toBe(true);
    // The opponent casts it during our turn.
    const { s: t0, opp: o2 } = setup([]);
    for (let i = 0; i < 3; i++) putOnBattlefield(t0, o2, plains);
    const theirs = putOnBattlefield(t0, o2, bear({ name: "Theirs" }));
    t0.objects[theirs]!.tapped = true;
    const z = toHand(t0, o2, zealous);
    let t = t0;
    for (let i = 0; i < 4 && waitingOn(t) !== o2; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = passAll(run(t, planCast(t, o2, z)));
    expect(pt(t, theirs)).toBe("4/2");
    expect(t.objects[theirs]!.tapped).toBe(false);
  });

  it("Jeskai Ascendancy: each noncreature spell pumps and untaps our creatures", () => {
    const { s: s0, ap, ids } = setup([opt]);
    putOnBattlefield(s0, ap, ascendancy);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Ours" }));
    s0.objects[mine]!.tapped = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, mine)).toBe("3/3");
    expect(s.objects[mine]!.tapped).toBe(false);
  });
});
