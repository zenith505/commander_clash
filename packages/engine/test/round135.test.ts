// Round 135: round 134's gaps (bots use Doubling Cube for abilities, {X} and hybrid costs, and Detection Tower for
// abilities), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Only these cards stay in `pid`'s hand; the others go to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const x of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[x]!.zone = "library";
    p.library.push(x);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const emptyPools = (s: GameState) => {
  for (const p of Object.values(s.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

const cube = card("Doubling Cube", "Artifact", "{2}", { oracleText: "{3}, {T}: Double the amount of each type of unspent mana you have." });

describe("Doubling Cube: bots use it for abilities, hybrid and {X} costs too", () => {
  /** `hand` in hand and our 14 lands untapped, plus the Cube if asked. */
  const scene = (hand: CardDef[], withCube: boolean) => {
    const { s, ap, ids } = setup(hand);
    emptyPools(s);
    onlyInHand(s, ap, ids);
    s.players[ap]!.landsPlayedThisTurn = 1;
    // Not the commander: the spell or ability asked about is what the bot does.
    s.players[ap]!.command = [];
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    const cubeId = withCube ? putOnBattlefield(s, ap, cube) : undefined;
    return { s, ap, ids, cubeId, lands };
  };
  const untapped = (s: GameState, lands: string[]) => lands.filter((id) => !s.objects[id]!.tapped).length;

  it("a hybrid cost of eight: the Cube saves land taps", () => {
    const giant = card("Test Hybrid Giant", "Creature — Giant", "{4}{G/W}{G/W}{G/W}{G/W}", { power: "8", toughness: "8" });
    const { s: s0, ap, ids, cubeId, lands } = scene([giant], true);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, acts);
    expect(s.stack.map((x) => x.objectId)).toContain(ids[0]);
    // Four lands and the Cube's three, where the lands alone take eight.
    expect(untapped(s, lands)).toBe(7);
  });

  it("an {X} spell keeps the X the lands alone would pay, with four lands left", () => {
    const blaze = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "Test Blaze deals X damage to any target." });
    const xOf = (acts: Action[]) => acts.flatMap((a) => (a.type === "castSpell" ? [a.x] : []))[0];
    const without = scene([blaze], false);
    expect(xOf(botActions(without.s, without.ap))).toBe(13);
    const { s: s0, ap, ids, cubeId, lands } = scene([blaze], true);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    expect(xOf(acts)).toBe(13);
    const s = run(s0, acts);
    expect(s.stack.map((x) => x.objectId)).toContain(ids[0]);
    // Seven lands and the Cube's three: fourteen.
    expect(untapped(s, lands)).toBe(4);
  });

  it("an activated ability that costs eight, in the second main phase", () => {
    const engine = card("Test Engine", "Artifact", "{1}", { oracleText: "{8}, {T}: Draw three cards." });
    supported(engine);
    const { s: s0, ap, cubeId, lands } = scene([], true);
    const eng = putOnBattlefield(s0, ap, engine);
    s0.step = "main2";
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === eng)).toBe(true);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, acts);
    expect(s.stack.some((x) => x.sourceId === eng)).toBe(true);
    expect(untapped(s, lands)).toBe(7);
  });
});

describe("Detection Tower: bots activate it for an ability that would target what has hexproof", () => {
  const tower = card("Detection Tower", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Until end of turn, your opponents and creatures your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof." });
  const troll = card("Test Troll", "Creature — Troll", "{2}{G}", { power: "3", toughness: "3", keywords: ["Hexproof"], oracleText: "Hexproof" });
  const rod = card("Test Rod", "Artifact", "{1}", { oracleText: "{2}, {T}: Destroy target creature." });

  it("the Tower first, then the ability at the hexproof creature", () => {
    supported(tower, rod);
    const { s: s0, ap } = setup([]);
    emptyPools(s0);
    onlyInHand(s0, ap, []);
    s0.players[ap]!.landsPlayedThisTurn = 1;
    s0.players[ap]!.command = [];
    for (const id of s0.battlefield.filter((x) => s0.cards[s0.objects[x]!.cardId]!.types.includes("Creature"))) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const t = putOnBattlefield(s0, nextOf(s0, ap), troll);
    const tw = putOnBattlefield(s0, ap, tower);
    const r = putOnBattlefield(s0, ap, rod);
    s0.step = "main2";
    const first = botActions(s0, ap);
    expect(first.some((a) => a.type === "activateAbility" && a.objectId === tw)).toBe(true);
    let s = resolveAll(run(s0, first));
    expect(s.turnRules?.some((x) => x.player === ap && x.rule === "seeHexproof")).toBe(true);
    const next = botActions(s, ap);
    const use = next.find((a) => a.type === "activateAbility");
    expect(use?.type === "activateAbility" && use.objectId === r && use.targets).toEqual([{ kind: "object", id: t }]);
    s = resolveAll(run(s, next));
    expect(s.battlefield).not.toContain(t);
  });
});
