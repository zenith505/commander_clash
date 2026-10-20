// Taxes from the most played Commander cards: "you may draw a card unless that player pays {1}" (Rhystic Study, Mystic
// Remora), "draw a card unless that player pays {X}" (Esper Sentinel) and "that player may pay {2}. If the player doesn't,
// you create a Treasure token" (Smothering Tithe). The player taxed decides first, as the ability resolves; then, if they
// didn't pay, its controller decides whether to draw (rulings on Rhystic Study).

import { describe, expect, it } from "vitest";
import { act, card, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, parseManaCost, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const rhysticStudy = card("Rhystic Study", "Enchantment", "{2}{U}", { oracleText: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}." });
const mysticRemora = card("Mystic Remora", "Enchantment", "{U}", { keywords: ["Cumulative upkeep"], oracleText: "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}." });
const esperSentinel = card("Esper Sentinel", "Artifact Creature — Human Soldier", "{W}", { power: "1", toughness: "1", oracleText: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power." });
const smotheringTithe = card("Smothering Tithe", "Enchantment", "{3}{W}", { oracleText: "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });

/** Cast `id` by `pid`, auto-paid. */
function castIt(s: GameState, pid: PlayerId, id: string) {
  const plan = planCast(s, pid, id);
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}
/** Pass priority, answering each prompt with `answer` (or the bots' answer), until `until` is true or nothing is left. */
function run(s: GameState, answer: (s: GameState) => Action | Action[] | undefined, until: (s: GameState) => boolean = () => false) {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending) && !until(s); i++) {
    const pid = waitingOn(s)!;
    const mine = answer(s);
    if (mine) for (const a of [mine].flat()) s = act(s, a);
    else if (s.pending) for (const a of botActions(s, pid)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** Pay (tapping lands for it) or don't. */
const payIt = (s: GameState, yes: boolean): Action[] => {
  const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "payUnless" }>;
  return [...(yes ? planMana(s, p.player, parseManaCost(p.cost))! : []), { type: "payUnless", player: p.player, pay: yes }];
};
const pay = (yes: boolean) => (s: GameState): Action[] | undefined => (s.pending?.kind === "payUnless" ? payIt(s, yes) : undefined);

describe("taxes from the most played cards", () => {
  it("parse", () => {
    for (const d of [rhysticStudy, mysticRemora, esperSentinel, smotheringTithe] as CardDef[]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Rhystic Study: the caster is asked to pay {1} as the trigger resolves, before their spell", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    putOnBattlefield(s0, opp, rhysticStudy);
    const oppHand = s0.players[opp]!.hand.length;
    let s = castIt(s0, ap, ids[0]!);
    let prompt: Extract<NonNullable<GameState["pending"]>, { kind: "payUnless" }> | undefined;
    s = run(s, (x) => {
      if (x.pending?.kind !== "payUnless") return undefined;
      prompt = x.pending;
      // The spell is still on the stack under the trigger.
      expect(x.stack.some((it) => it.kind === "spell")).toBe(true);
      return payIt(x, true);
    });
    expect(prompt).toMatchObject({ player: ap, cost: "{1}", source: "Rhystic Study", otherwise: `${s0.players[opp]!.name} may draw a card` });
    expect(s.players[opp]!.hand.length).toBe(oppHand);
  });

  it("Rhystic Study: if they don't pay, its controller may draw", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    putOnBattlefield(s0, opp, rhysticStudy);
    const oppHand = s0.players[opp]!.hand.length;
    let asked = 0;
    const s = run(castIt(s0, ap, ids[0]!), (x) => {
      if (x.pending?.kind === "payUnless") return { type: "payUnless", player: x.pending.player, pay: false };
      if (x.pending?.kind === "chooseMay") {
        asked++;
        expect(x.pending.player).toBe(opp);
        return { type: "chooseMay", player: opp, yes: true };
      }
      return undefined;
    });
    expect(asked).toBe(1);
    expect(s.players[opp]!.hand.length).toBe(oppHand + 1);
  });

  it("Rhystic Study doesn't trigger on its controller's own spells", () => {
    const { s: s0, ap, ids } = setup([divination]);
    putOnBattlefield(s0, ap, rhysticStudy);
    const s = castIt(s0, ap, ids[0]!);
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(0);
  });

  it("Mystic Remora triggers on noncreature spells only, and asks for {4}", () => {
    const { s: s0, ap, ids, opp } = setup([ornithopter, divination]);
    putOnBattlefield(s0, opp, mysticRemora);
    let s = run(castIt(s0, ap, ids[0]!), () => undefined);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    const oppHand = s.players[opp]!.hand.length;
    let cost = "";
    s = run(castIt(s, ap, ids[1]!), (x) => {
      if (x.pending?.kind !== "payUnless") return undefined;
      cost = x.pending.cost;
      return { type: "payUnless", player: x.pending.player, pay: false };
    });
    expect(cost).toBe("{4}");
    // The bot controlling Remora draws.
    expect(s.players[opp]!.hand.length).toBe(oppHand + 1);
  });

  it("Esper Sentinel: only each opponent's first noncreature spell each turn, for {X} = its power", () => {
    const { s: s0, ap, ids, opp } = setup([ornithopter, solRing, divination]);
    const sentinel = putOnBattlefield(s0, opp, esperSentinel);
    s0.objects[sentinel]!.counters = { "+1/+1": 2 };
    const oppHand = s0.players[opp]!.hand.length;
    // A creature spell first: it doesn't count.
    let s = run(castIt(s0, ap, ids[0]!), () => undefined);
    expect(s.players[opp]!.hand.length).toBe(oppHand);
    let costs: string[] = [];
    s = run(castIt(s, ap, ids[1]!), (x) => {
      if (x.pending?.kind !== "payUnless") return undefined;
      costs.push(x.pending.cost);
      return { type: "payUnless", player: x.pending.player, pay: false };
    });
    expect(costs).toEqual(["{3}"]);
    expect(s.players[opp]!.hand.length).toBe(oppHand + 1);
    // The second noncreature spell this turn: no trigger.
    costs = [];
    s = run(castIt(s, ap, ids[2]!), pay(false));
    expect(costs).toEqual([]);
    expect(s.players[opp]!.hand.length).toBe(oppHand + 1);
  });

  it("Esper Sentinel: a noncreature spell cast before it entered counts as the first", () => {
    const { s: s0, ap, ids, opp } = setup([solRing, divination]);
    let s = run(castIt(s0, ap, ids[0]!), () => undefined);
    putOnBattlefield(s, opp, esperSentinel);
    const oppHand = s.players[opp]!.hand.length;
    s = run(castIt(s, ap, ids[1]!), pay(false));
    expect(s.players[opp]!.hand.length).toBe(oppHand);
  });

  it("Smothering Tithe: each card an opponent draws, they pay {2} or its controller gets a Treasure", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    putOnBattlefield(s0, opp, smotheringTithe);
    const treasures = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.controller === opp && s.cards[s.objects[id]!.cardId]?.name === "Treasure Token").length;
    let answers = [true, false];
    const otherwise: string[] = [];
    const s = run(castIt(s0, ap, ids[0]!), (x) => {
      if (x.pending?.kind !== "payUnless") return undefined;
      expect(x.pending.player).toBe(ap);
      expect(x.pending.cost).toBe("{2}");
      otherwise.push(x.pending.otherwise ?? "");
      return payIt(x, answers.shift()!);
    });
    expect(answers).toEqual([]);
    expect(otherwise[0]).toBe(`${s0.players[opp]!.name} creates a Treasure token`);
    expect(treasures(s)).toBe(1);
  });

  it("bots pay {1} for Rhystic Study, but not {4} for Mystic Remora when it would leave them short", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, rhysticStudy);
    putOnBattlefield(s0, ap, mysticRemora);
    // The opponent (a bot) has four Islands and casts Divination on its turn.
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, island);
    const div = putOnBattlefield(s0, opp, divination);
    s0.battlefield.splice(s0.battlefield.indexOf(div), 1);
    s0.objects[div]!.zone = "hand";
    s0.players[opp]!.hand.push(div);
    let s = passUntil(s0, "main1", opp);
    const decisions: { cost: string; pay: boolean }[] = [];
    s = run(castIt(s, opp, div), (x) => {
      if (x.pending?.kind !== "payUnless") return undefined;
      const a = botActions(x, x.pending.player);
      const last = a[a.length - 1]!;
      decisions.push({ cost: x.pending.cost, pay: last.type === "payUnless" && last.pay });
      return undefined;
    });
    // Divination took three of its four Islands: one left, enough for Rhystic Study's {1} but not Remora's {4}.
    expect(decisions.sort((a, b) => a.cost.localeCompare(b.cost))).toEqual([{ cost: "{1}", pay: true }, { cost: "{4}", pay: false }]);
  });
});
