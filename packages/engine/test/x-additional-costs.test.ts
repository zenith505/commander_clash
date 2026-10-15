// X in an additional cost: "pay X life", "discard X cards", "sacrifice X creatures". X is announced as the spell is cast
// and the cost is paid that many times (CR 107.3a, 601.2b); cast without paying its mana cost, X can still be chosen when
// the mana cost has no {X} (CR 107.3b, rulings on Toxic Deluge). "X target creatures" means exactly X (CR 601.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, compileCard, isFullySupported, planCast, toughness, waitingOn, type CardDef, type GameState, type ObjectId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const deluge = card("Toxic Deluge", "Sorcery", "{2}{B}", { oracleText: "As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn." });
const dreams = card("Sickening Dreams", "Sorcery", "{1}{B}", { oracleText: "As an additional cost to cast this spell, discard X cards.\nSickening Dreams deals X damage to each creature and each player." });
const eliminate = card("Eliminate the Competition", "Sorcery", "{4}{B}", { oracleText: "As an additional cost to cast this spell, sacrifice X creatures.\nDestroy X target creatures." });
const harvest = card("Infernal Harvest", "Instant", "{1}{B}", { oracleText: "As an additional cost to cast this spell, return X Swamps you control to their owner's hand.\nInfernal Harvest deals X damage divided as you choose among any number of target creatures." });
const pyre = card("Harvest Pyre", "Instant", "{1}{R}", { oracleText: "As an additional cost to cast this spell, exile X cards from your graveyard.\nHarvest Pyre deals X damage to target creature." });
const conflagrate = card("Conflagrate", "Sorcery", "{X}{X}{R}", { keywords: ["Flashback"], oracleText: "Conflagrate deals X damage divided as you choose among any number of targets.\nFlashback—{R}{R}, Discard X cards. (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const scorched = card("Scorched Earth", "Sorcery", "{X}{R}", { oracleText: "As an additional cost to cast this spell, discard X land cards.\nDestroy X target lands." });
const thrive = card("Thrive", "Sorcery", "{X}{G}", { oracleText: "Put a +1/+1 counter on each of X target creatures." });
const biteDown = card("Bite Down", "Instant", "{1}{G}", { oracleText: "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control." });
const walker = card("Lord Windgrace", "Legendary Planeswalker — Windgrace", "{2}{B}{R}{G}", { loyalty: "5" });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast that");
  return plan.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const obj = (id: string, amount?: number): TargetChoice => ({ kind: "object", id, ...(amount !== undefined ? { amount } : {}) });
const toYard = (s: GameState, id: ObjectId) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[s.objects[id]!.owner]!.graveyard.push(id);
};

describe("X in an additional cost", () => {
  it("is supported", () => [deluge, dreams, eliminate, harvest, pyre, conflagrate, scorched, thrive, biteDown].forEach((d: CardDef) => expect(isFullySupported(d), d.name).toBe(true)));

  it("parses the cost as X of it", () => {
    expect(compileCard(deluge).additionalCosts).toMatchObject([{ kind: "payLife", x: true }]);
    expect(compileCard(eliminate).additionalCosts).toMatchObject([{ kind: "sacrifice", x: true }]);
    expect(compileCard(eliminate).spell!.targets).toMatchObject([{ many: "exactX" }]);
    expect(compileCard(scorched).additionalCosts).toMatchObject([{ kind: "discard", x: true, filter: { types: ["Land"] } }]);
  });

  it("Toxic Deluge: pay X life, all creatures get -X/-X; X can't be more than your life", () => {
    const { s: s0, ap, opp, ids } = setup([deluge]);
    const small = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, card("Big", "Creature — Beast", "{4}", { power: "4", toughness: "4" }));
    const life = s0.players[ap]!.life;
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", life + 1)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3)));
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(zone(s, small)).toBe("graveyard");
    expect(toughness(s, s.objects[big]!)).toBe(1);
    expect(s.log.some((l) => /casts Toxic Deluge with X=3/.test(l.text))).toBe(true);
    // X = 0: no life paid.
    const z = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 0)));
    expect(z.players[ap]!.life).toBe(life);
  });

  it("Toxic Deluge cast without paying its mana cost still has an X to choose; an {X} in the mana cost doesn't", () => {
    const { s, ap, ids } = setup([deluge, thrive]);
    s.pending = { kind: "castFree", player: ap, objectId: ids[0]!, source: "test" };
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 2)).toBeNull();
    s.pending = { kind: "castFree", player: ap, objectId: ids[1]!, source: "test" };
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, 2) ?? "").toMatch(/X is 0/);
  });

  it("Sickening Dreams: discard exactly X cards, then X damage to each creature and each player", () => {
    const { s: s0, ap, opp, ids } = setup([dreams]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const hand = s0.players[ap]!.hand.filter((id) => id !== ids[0]);
    expect(hand.length).toBeGreaterThanOrEqual(2);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { discard: [hand[0]!] })).toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { discard: [ids[0]!, hand[0]!] })).toBeNull(); // not itself
    const [lifeA, lifeB] = [s0.players[ap]!.life, s0.players[opp]!.life];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { discard: hand.slice(0, 2) })));
    expect(hand.slice(0, 2).map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(zone(s, theirs)).toBe("graveyard");
    expect([s.players[ap]!.life, s.players[opp]!.life]).toEqual([lifeA - 2, lifeB - 2]);
  });

  it("Eliminate the Competition: sacrifice X creatures, destroy exactly X target creatures", () => {
    const { s: s0, ap, opp, ids } = setup([eliminate]);
    const mine = [0, 1].map(() => putOnBattlefield(s0, ap, bear()));
    const theirs = [0, 1, 2].map(() => putOnBattlefield(s0, opp, bear()));
    const sac = { sacrifice: mine };
    expect(planCast(s0, ap, ids[0]!, [target(theirs[0]!)], undefined, "auto", 2, sac)).toBeNull(); // one target, X = 2
    expect(planCast(s0, ap, ids[0]!, theirs.map(target), undefined, "auto", 2, sac)).toBeNull(); // three
    expect(planCast(s0, ap, ids[0]!, theirs.slice(0, 2).map(target), undefined, "auto", 2, { sacrifice: [mine[0]!] })).toBeNull(); // one sacrificed
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, theirs.slice(0, 2).map(target), undefined, "auto", 2, sac)));
    expect([...mine, ...theirs].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "battlefield"]);
  });

  it("Infernal Harvest: return X Swamps, X damage divided among creatures", () => {
    const { s: s0, ap, opp, ids } = setup([harvest]);
    const swamps = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Swamp");
    const theirs = putOnBattlefield(s0, opp, bear());
    expect(swamps).toHaveLength(2);
    expect(planCast(s0, ap, ids[0]!, [obj(theirs, 2)], undefined, "auto", 3, { returnToHand: swamps })).toBeNull(); // only two Swamps
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(theirs, 2)], undefined, "auto", 2, { returnToHand: swamps })));
    expect(swamps.map((id) => zone(s, id))).toEqual(["hand", "hand"]);
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Harvest Pyre: exile X cards from your graveyard, X damage", () => {
    const { s: s0, ap, opp, ids } = setup([pyre]);
    const dead = [0, 1, 2].map(() => putOnBattlefield(s0, ap, bear()));
    dead.forEach((id) => toYard(s0, id));
    const theirs = putOnBattlefield(s0, opp, card("Big", "Creature — Beast", "{4}", { power: "3", toughness: "3" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)], undefined, "auto", 3, { exileCards: dead })));
    expect(dead.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Scorched Earth: discard X land cards, destroy X target lands", () => {
    const { s: s0, ap, opp, ids } = setup([scorched]);
    const lands = [0, 1].map(() => putOnBattlefield(s0, opp, swamp));
    const inHand = [0, 1].map(() => putOnBattlefield(s0, ap, swamp));
    for (const id of inHand) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "hand";
      s0.players[ap]!.hand.push(id);
    }
    const nonland = s0.players[ap]!.hand.find((id) => id !== ids[0] && !/Land/.test(s0.cards[s0.objects[id]!.cardId]!.typeLine));
    if (nonland) expect(planCast(s0, ap, ids[0]!, lands.map(target), undefined, "auto", 2, { discard: [inHand[0]!, nonland] })).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, lands.map(target), undefined, "auto", 2, { discard: inHand })));
    expect([...lands, ...inHand].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  });

  it("Conflagrate's flashback: {R}{R} and discard X cards, with an X to choose though its {X}s aren't paid", () => {
    const { s: s0, ap, opp, ids } = setup([conflagrate]);
    toYardFromHand(s0, ids[0]!);
    const theirs = putOnBattlefield(s0, opp, bear());
    const hand = s0.players[ap]!.hand.slice(0, 3);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(theirs, 2), { kind: "player", id: opp, amount: 1 }], undefined, "auto", 3, { via: "flashback", discard: hand })));
    expect(hand.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Thrive: a counter on each of exactly X target creatures", () => {
    const { s: s0, ap, ids } = setup([thrive]);
    const bears = [0, 1, 2].map(() => putOnBattlefield(s0, ap, bear()));
    expect(planCast(s0, ap, ids[0]!, bears.slice(0, 2).map(target), undefined, "auto", 3)).toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, bears.map(target), undefined, "auto", 3)));
    expect(bears.map((id) => s.objects[id]!.counters["+1/+1"] ?? 0)).toEqual([1, 1, 1]);
  });

  it("a bot pays X for the costs it can spare: Eliminate the Competition with its tokens", () => {
    const { s: s0, ap, opp, ids } = setup([eliminate]);
    const tokens = [0, 1].map(() => putOnBattlefield(s0, ap, bear({ name: "Token Bear" })));
    for (const id of tokens) s0.objects[id]!.isToken = true;
    const theirs = [0, 1, 2].map(() => putOnBattlefield(s0, opp, card("Big", "Creature — Beast", "{4}", { power: "4", toughness: "4" })));
    // Nothing else in hand: only this to cast.
    for (const id of s0.players[ap]!.hand.filter((x) => x !== ids[0])) {
      s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    let s = s0;
    for (let i = 0; i < 6 && s.players[ap]!.hand.includes(ids[0]!); i++) for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.players[ap]!.hand).not.toContain(ids[0]!);
    s = settle(s);
    expect(tokens.every((id) => !s.objects[id] || zone(s, id) !== "battlefield")).toBe(true);
    expect(theirs.filter((id) => zone(s, id) === "graveyard")).toHaveLength(2);
  });
});

describe("damage equal to its power", () => {
  it("Bite Down can hit a planeswalker", () => {
    const { s: s0, ap, opp, ids } = setup([biteDown]);
    const mine = putOnBattlefield(s0, ap, bear());
    const pw = putOnBattlefield(s0, opp, walker);
    s0.objects[pw]!.counters = { loyalty: 5 };
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(mine), target(pw)])));
    expect(s.objects[pw]!.counters.loyalty).toBe(3);
  });
});

function toYardFromHand(s: GameState, id: ObjectId) {
  const p = s.players[s.objects[id]!.owner]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  p.graveyard.push(id);
}
