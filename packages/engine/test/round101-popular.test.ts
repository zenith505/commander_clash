// Round 101: popular cards with small new readings. Giver of Runes (protection from colorless or a color, chosen as it
// resolves), Wave Goodbye ("without a +1/+1 counter on it"), In Garruk's Wake, Stubborn Denial and Temur Battle Rage
// (ferocious, checked as they resolve, CR 608.2c), Triskaidekaphile ("exactly thirteen cards"), Dark Deal (each player
// draws one fewer than they discarded, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const giver = card("Giver of Runes", "Creature — Kor Cleric", "{W}", { power: "1", toughness: "2", oracleText: "{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn." });
const wave = card("Wave Goodbye", "Sorcery", "{2}{U}{U}", { oracleText: "Return each creature without a +1/+1 counter on it to its owner's hand." });
const wake = card("In Garruk's Wake", "Sorcery", "{7}{B}{B}", { oracleText: "Destroy all creatures you don't control and all planeswalkers you don't control." });
const denial = card("Stubborn Denial", "Instant", "{U}", { keywords: ["Ferocious"], oracleText: "Counter target noncreature spell unless its controller pays {1}.\nFerocious — If you control a creature with power 4 or greater, counter that spell instead." });
const rage = card("Temur Battle Rage", "Instant", "{1}{R}", { keywords: ["Ferocious"], oracleText: "Target creature gains double strike until end of turn.\nFerocious — That creature also gains trample until end of turn if you control a creature with power 4 or greater." });
const trisk = card("Triskaidekaphile", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "3", oracleText: "You have no maximum hand size.\nAt the beginning of your upkeep, if you have exactly thirteen cards in your hand, you win the game.\n{3}{U}: Draw a card." });
const deal = card("Dark Deal", "Sorcery", "{2}{B}", { oracleText: "Each player discards all the cards in their hand, then draws that many cards minus one." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const big = (extra = {}) => bear({ name: "Big Bear", power: "4", toughness: "4", ...extra });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
const cast = (s: GameState, pid: number, id: string, targets?: Parameters<typeof planCast>[3]) => {
  const plan = planCast(s, pid, id, targets);
  if (!plan) throw new Error("can't cast");
  return plan.reduce((x, a) => act(x, a), s);
};

describe("round 101: popular cards", () => {
  it("parse", () => {
    for (const c of [giver, wave, wake, denial, rage, trisk, deal]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Giver of Runes: protection from colorless, or from the chosen color", () => {
    for (const choice of ["Protection from colorless", "Protection from red"]) {
      const { s: s0, ap } = setup([]);
      const g = putOnBattlefield(s0, ap, giver);
      const b = putOnBattlefield(s0, ap, bear());
      expect(planActivate(s0, ap, g, 0, [target(g)])).toBeNull(); // another creature
      let s = run(s0, planActivate(s0, ap, g, 0, [target(b)]));
      expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["Protection from colorless", "Protection from white", "Protection from blue", "Protection from black", "Protection from red", "Protection from green"]);
      s = settle(act(s, { type: "chooseOption", player: ap, choice }));
      expect(objHasKeyword(s, s.objects[b]!, choice)).toBe(true);
    }
  });

  it("Wave Goodbye: only creatures without a +1/+1 counter go back", () => {
    const { s: s0, ap, opp, ids } = setup([wave]);
    const kept = putOnBattlefield(s0, opp, bear());
    s0.objects[kept]!.counters["+1/+1"] = 1;
    const shielded = putOnBattlefield(s0, opp, bear());
    s0.objects[shielded]!.counters.shield = 1;
    const mine = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.manaPool.U = 4;
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.objects[kept]!.zone).toBe("battlefield");
    expect(s.objects[shielded]!.zone).toBe("hand");
    expect(s.objects[mine]!.zone).toBe("hand");
  });

  it("In Garruk's Wake: everyone else's creatures and planeswalkers", () => {
    const { s: s0, ap, opp, ids } = setup([wake]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const walker = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "3" }));
    s0.objects[walker]!.counters.loyalty = 3;
    const mine = putOnBattlefield(s0, ap, bear());
    const myWalker = putOnBattlefield(s0, ap, card("My Walker", "Legendary Planeswalker — Mine", "{3}", { loyalty: "3" }));
    s0.objects[myWalker]!.counters.loyalty = 3;
    s0.players[ap]!.manaPool.B = 9;
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect([theirs, walker].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect([mine, myWalker].map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  });

  it("Stubborn Denial: unless they pay {1}; with a 4-power creature, no chance to pay", () => {
    for (const ferocious of [false, true]) {
      const { s: s0, ap, ids } = setup([divination, denial]);
      if (ferocious) putOnBattlefield(s0, ap, big());
      s0.players[ap]!.manaPool.U = 5;
      let s = cast(s0, ap, ids[0]!);
      s = cast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]);
      s = settle(s);
      if (ferocious) {
        expect(s.pending).toBeFalsy();
        expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
        expect(s.stack).toHaveLength(0);
      } else expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}" });
    }
  });

  it("Temur Battle Rage: trample only with a creature with power 4 or greater", () => {
    for (const ferocious of [false, true]) {
      const { s: s0, ap, ids } = setup([rage]);
      const b = putOnBattlefield(s0, ap, bear());
      if (ferocious) putOnBattlefield(s0, ap, big());
      s0.players[ap]!.manaPool.R = 2;
      const s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
      expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
      expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(ferocious);
    }
  });

  it("Triskaidekaphile: exactly thirteen cards in hand at upkeep wins; fourteen doesn't", () => {
    for (const [n, wins] of [[13, true], [14, false]] as const) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, trisk);
      const p = s0.players[ap]!;
      // Cards of its own for the hand (the library here is short).
      while (p.hand.length > 0) p.library.unshift(p.hand.pop()!);
      for (let i = 0; i < n; i++) {
        const id = putOnBattlefield(s0, ap, bear({ name: `Hand Bear ${i}` }));
        s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
        s0.objects[id]!.zone = "hand";
        p.hand.push(id);
      }
      for (const id of p.library) s0.objects[id]!.zone = "library";
      let s = passUntil(s0, "upkeep", ap);
      s = settle(s);
      expect(s.winner === ap).toBe(wins);
    }
  });

  it("Dark Deal: each player draws one fewer than they discarded; one or none, nothing", () => {
    const { s: s0, ap, opp, ids } = setup([deal]);
    const third = s0.turnOrder.find((x) => x !== ap && x !== opp)!;
    const fourth = s0.turnOrder.find((x) => x !== ap && x !== opp && x !== third)!;
    const set = (pid: number, n: number) => {
      const p = s0.players[pid]!;
      while (p.hand.length > n) p.library.unshift(p.hand.pop()!);
      while (p.hand.length < n) p.hand.push(p.library.shift()!);
      for (const id of p.hand) s0.objects[id]!.zone = "hand";
    };
    set(opp, 4);
    set(third, 1);
    set(fourth, 0);
    s0.players[ap]!.manaPool.B = 3;
    const mine = s0.players[ap]!.hand.length - 1; // the rest of the hand after casting it
    const s = run(s0, planCast(s0, ap, ids[0]!));
    // The libraries here are short, so the log says how many each drew.
    const drew = (pid: number) => Number(new RegExp(`^${s.players[pid]!.name} draws (\\d+) cards?\\.$`).exec(s.log.map((l) => l.text).find((l) => l.startsWith(`${s.players[pid]!.name} draws`)) ?? "")?.[1]);
    expect([opp, third, fourth, ap].map(drew)).toEqual([3, 0, 0, mine - 1]);
  });
});
