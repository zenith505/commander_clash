// Spells from the most played Commander cards: Chaos Warp, Arcane Denial ("Its controller may draw up to two cards at the
// beginning of the next turn's upkeep"), Mana Drain ("At the beginning of your next main phase, add ..."), and "you may
// choose new targets for target spell or ability" (CR 115.7d): Deflecting Swat, Redirect, Wild Ricochet.

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, island, mountain, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, RulesError, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const chaosWarp = card("Chaos Warp", "Instant", "{2}{R}", { oracleText: "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield." });
const arcaneDenial = card("Arcane Denial", "Instant", "{1}{U}", { oracleText: "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.\nYou draw a card at the beginning of the next turn's upkeep." });
const manaDrain = card("Mana Drain", "Instant", "{U}{U}", { oracleText: "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value." });
const swat = card("Deflecting Swat", "Instant", "{2}{R}", { oracleText: "If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability." });
const redirect = card("Redirect", "Instant", "{U}{U}", { oracleText: "You may choose new targets for target spell." });
const ricochet = card("Wild Ricochet", "Instant", "{2}{R}{R}", { oracleText: "You may choose new targets for target instant or sorcery spell. Then copy that spell. You may choose new targets for the copy." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const twoBolts = card("Twin Bolt Test", "Instant", "{1}{R}", { oracleText: "Twin Bolt Test deals 1 damage to target creature and 1 damage to another target creature." });

const run = (s: GameState, plan: Action[]) => plan.reduce((x, a) => act(x, a), s);
function castOnly(s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], choices?: CostChoices) {
  const plan = planCast(s, pid, id, targets, undefined, "auto", undefined, choices);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  return run(s, plan);
}
/** Pass until `pid` has priority again, with the stack as it is. */
function priorityTo(s: GameState, pid: PlayerId) {
  if (waitingOn(s) === pid) s = act(s, { type: "passPriority", player: pid });
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** Everyone passes until the stack is empty or someone has a choice to make. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A card in `pid`'s hand, with lands to cast it. */
function give(s: GameState, pid: PlayerId, def: CardDef, lands = 0, land = island) {
  for (let i = 0; i < lands; i++) putOnBattlefield(s, pid, land);
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const stackTarget = (s: GameState, name: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.description.startsWith(name))!.id });
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

describe("spells from the most played cards", () => {
  it("parse", () => {
    for (const d of [chaosWarp, arcaneDenial, manaDrain, swat, redirect, ricochet]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Chaos Warp: the owner shuffles it in and puts the top card onto the battlefield if it's a permanent card", () => {
    const { s: s0, ap, ids, opp } = setup([chaosWarp]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const lib = s0.players[opp]!.library.length;
    const before = s0.battlefield.filter((id) => s0.objects[id]!.controller === opp).length;
    const s = settle(castOnly(s0, ap, ids[0]!, [target(theirs)]));
    expect(s.objects[theirs]?.zone ?? "library").not.toBe("battlefield");
    // Their library is all Forests and Bears: whatever is on top comes in.
    expect(s.players[opp]!.library.length).toBe(lib);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp).length).toBe(before);
  });

  it("Chaos Warp: a card that isn't a permanent card stays on top", () => {
    const { s: s0, ap, ids, opp } = setup([chaosWarp]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const p = s0.players[opp]!;
    for (const id of p.library) s0.objects[id]!.zone = "exile";
    p.exile.push(...p.library);
    p.library = [];
    for (let i = 0; i < 30; i++) {
      const id = putOnBattlefield(s0, opp, opt);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      p.library.push(id);
    }
    invalidateCharacteristics(s0);
    const s = settle(castOnly(s0, ap, ids[0]!, [target(theirs)]));
    const lib = s.players[opp]!.library;
    expect(lib).toHaveLength(31);
    expect(nameOf(s, lib[0]!)).toBe("Opt");
    expect(lib.some((id) => nameOf(s, id) === "Their Bear")).toBe(true);
    expect(s.log.some((e) => /reveals/.test(e.text) && /Opt/.test(e.text))).toBe(true);
  });

  it("Arcane Denial: at the next upkeep, the countered spell's controller draws up to two, its caster one", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    const denial = give(s0, opp, arcaneDenial, 2);
    let s = castOnly(s0, ap, ids[0]!);
    s = priorityTo(s, opp);
    s = settle(castOnly(s, opp, denial, [stackTarget(s, "Divination")]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // At the next turn's upkeep (after B's cleanup discard).
    s = passUntil(s, "upkeep", opp);
    const handAp = s.players[ap]!.hand.length;
    const handOpp = s.players[opp]!.hand.length;
    let asked: { options: string[]; labels?: string[] } | undefined;
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "chooseOption" && s.pending.what === "drawUpTo") {
        expect(s.pending.player).toBe(ap);
        asked = s.pending;
        s = act(s, { type: "chooseOption", player: ap, choice: "1" });
      } else if (s.pending) s = run(s, botActions(s, pid));
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(asked?.options).toEqual(["2", "1", "0"]);
    expect(asked?.labels).toEqual(["Draw 2 cards", "Draw 1 card", "Draw none"]);
    expect(s.players[ap]!.hand.length).toBe(handAp + 1);
    expect(s.players[opp]!.hand.length).toBe(handOpp + 1);
    expect(s.step).toBe("upkeep");
  });

  it("Arcane Denial: a bot whose spell was countered draws two", () => {
    const { s: s0, ap, ids, opp } = setup([arcaneDenial]);
    const div = give(s0, opp, divination);
    let s = passUntil(s0, "main1", opp);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, island);
    s = castOnly(s, opp, div);
    s = priorityTo(s, ap);
    s = settle(castOnly(s, ap, ids[0]!, [stackTarget(s, "Divination")]));
    const next = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    s = passUntil(s, "upkeep", next);
    const hand = s.players[opp]!.hand.length;
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const pid = waitingOn(s)!;
      s = s.pending ? run(s, botActions(s, pid)) : act(s, { type: "passPriority", player: pid });
    }
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
  });

  it("Mana Drain cast in your first main phase adds the mana in your second", () => {
    const { s: s0, ap, ids } = setup([divination, manaDrain]);
    let s = castOnly(s0, ap, ids[0]!);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Divination")]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.C).toBe(0);
    s = passUntil(s, "main2", ap);
    s = settle(s);
    expect(s.step).toBe("main2");
    expect(s.players[ap]!.manaPool.C).toBe(3);
  });

  it("Mana Drain cast on an opponent's turn adds the spell's mana value in your next first main phase", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    const drain = give(s0, opp, manaDrain, 2);
    let s = castOnly(s0, ap, ids[0]!);
    s = priorityTo(s, opp);
    s = settle(castOnly(s, opp, drain, [stackTarget(s, "Divination")]));
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.manaPool.C).toBe(0);
    s = passUntil(s, "main1", opp);
    s = settle(s);
    expect(s.players[opp]!.manaPool.C).toBe(3);
  });

  it("Deflecting Swat is free with a commander, and turns a spell onto a new target", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, swat]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    putOnBattlefield(s0, ap, commander("My Commander"), { commander: true });
    let s = castOnly(s0, ap, ids[0]!, [target(mine)]);
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    s = castOnly(s, ap, ids[1]!, [stackTarget(s, "Lightning Bolt")], { alt: "alternative" });
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(untapped);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap, source: "Deflecting Swat", controller: ap, current: [target(mine)] });
    // Not itself (CR 115.5) or anything illegal.
    const boltId = (s.pending as { stackId: string }).stackId;
    expect(() => act(s, { type: "newTargets", player: ap, targets: [{ kind: "stack", id: boltId }] })).toThrow(RulesError);
    s = settle(act(s, { type: "newTargets", player: ap, targets: [target(theirs)] }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });

  it("choosing no new targets keeps them, even an illegal one", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, redirect]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = castOnly(s0, ap, ids[0]!, [target(mine)]);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Lightning Bolt")]));
    expect(s.pending?.kind).toBe("newTargets");
    s = settle(act(s, { type: "newTargets", player: ap }));
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });

  it("a spell with two targets: change one, keep the other, but not onto the one it keeps", () => {
    const { s: s0, ap, ids, opp } = setup([twoBolts, redirect]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A", toughness: "1" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B", toughness: "1" }));
    const c = putOnBattlefield(s0, opp, bear({ name: "Bear C", toughness: "1" }));
    let s = castOnly(s0, ap, ids[0]!, [target(a), target(b)]);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Twin Bolt Test")]));
    expect(s.pending?.kind).toBe("newTargets");
    expect(() => act(s, { type: "newTargets", player: ap, targets: [target(b), target(b)] })).toThrow(RulesError);
    s = settle(act(s, { type: "newTargets", player: ap, targets: [target(c), target(b)] }));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("graveyard");
  });

  it("Wild Ricochet: new targets for the spell, then a copy of it with its own", () => {
    const { s: s0, ap, ids, opp } = setup([ricochet]);
    const bolter = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const boltId = give(s0, bolter, bolt, 1, mountain);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = priorityTo(s0, bolter);
    s = castOnly(s, bolter, boltId, [target(mine)]);
    s = priorityTo(s, ap);
    s = settle(castOnly(s, ap, ids[0]!, [stackTarget(s, "Lightning Bolt")]));
    expect(s.pending).toMatchObject({ kind: "newTargets", controller: bolter });
    s = act(s, { type: "newTargets", player: ap, targets: [{ kind: "player", id: bolter }] });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [target(theirs)] });
    const life = s.players[bolter]!.life;
    s = settle(s);
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.players[bolter]!.life).toBe(life - 3);
  });

  it("a bot swats a spell aimed at its creature onto another player or theirs", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    give(s0, opp, swat, 3, mountain);
    let s = castOnly(s0, ap, ids[0]!, [target(theirs)]);
    s = priorityTo(s, opp);
    const plan = botActions(s, opp);
    expect(plan[plan.length - 1]).toMatchObject({ type: "castSpell", player: opp, targets: [{ kind: "stack" }] });
    s = run(s, plan);
    let answer: Action | undefined;
    for (let i = 0; i < 80 && (s.stack.length || s.pending); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "newTargets") answer = botActions(s, pid)[0];
      s = pid === ap && !s.pending ? act(s, { type: "passPriority", player: ap }) : run(s, botActions(s, pid));
    }
    // At another player or theirs, wherever it hurts most.
    expect(answer?.type).toBe("newTargets");
    const to = (answer as { targets: TargetChoice[] }).targets[0]!;
    expect(to.kind === "player" ? to.id !== opp : to.kind === "object" && s.objects[to.id]!.controller !== opp).toBe(true);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });
});
