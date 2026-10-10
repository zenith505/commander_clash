// Skulk (CR 702.118), umbra armor (702.89), no maximum hand size (402.2), extort (702.101), "If you do"
// after an optional discard or draw (608.2c), "you gain life equal to the life lost this way", damage
// triggers that use "that much" or "that player", statics for attacking creatures, and "costs less if it
// targets".

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import {
  blockProblem,
  compileCard,
  hasNoMaxHandSize,
  invalidateCharacteristics,
  isFullySupported,
  objHasKeyword,
  objIsType,
  planCast,
  spellCost,
  waitingOn,
  type Action,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const creature = (name: string, text: string, p = "2", t = "2", extra: Partial<CardDef> = {}) =>
  card(name, "Creature — Rogue", "{1}{B}", { power: p, toughness: t, oracleText: text, ...extra });

/** From main 1: attack, let the defenders block, and deal damage. */
function fight(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 12 && s.pending?.kind !== "declareBlockers" && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === pid) });
  }
  return s;
}

const kill = card("Kill Test", "Instant", "{B}", { oracleText: "Destroy target creature." });
const umbra = card("Umbra Test", "Enchantment — Aura", "{G}", {
  oracleText: "Enchant creature\nEnchanted creature gets +1/+1.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)",
  keywords: ["Enchant", "Umbra armor"],
});
const rummage = card("Rummage Test", "Enchantment", "{R}", { oracleText: "When this enchantment enters, you may discard a card. If you do, draw two cards." });
const extorter = creature("Extort Test", "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)", "1", "1", { keywords: ["Extort"] });
const drain = card("Drain Test", "Sorcery", "{2}{B}", { oracleText: "Each opponent loses 2 life. You gain life equal to the life lost this way." });
const leech = creature("Leech Test", "Whenever this creature deals damage, you gain that much life.", "3", "3");
const raider = creature("Raider Test", "Whenever this creature deals combat damage to a player, that player discards a card.", "2", "2");
const wheel = creature("Wheel Test", "Whenever this creature deals combat damage to a player, you may discard a card. If you do, draw a card.", "2", "2");
const historian = card("Historian Test", "Creature — Human", "{1}{R}{W}", { power: "2", toughness: "3", oracleText: "Attacking creatures you control have double strike." });
const response = card("Response Test", "Instant", "{4}{W}", { oracleText: "This spell costs {3} less to cast if it targets a tapped creature.\nDestroy target creature." });
const tower = card("Tower Test", "Land", "", { oracleText: "You have no maximum hand size.\n{T}: Add {C}." });

describe("round J cards compile", () => {
  it("all of them", () => {
    supported(umbra, rummage, extorter, drain, leech, raider, wheel, historian, response, tower, creature("Skulk Test", "Skulk", "1", "1", { keywords: ["Skulk"] }));
    expect(compileCard(tower).noMaxHandSize).toBe(true);
    expect(compileCard(response).costLessIfTargets).toHaveLength(1);
  });
});

describe("skulk (CR 702.118b)", () => {
  it("can't be blocked by a creature with greater power", () => {
    const { s, ap, opp } = setup([]);
    const sk = putOnBattlefield(s, ap, creature("Skulk Test", "Skulk", "1", "1", { keywords: ["Skulk"] }));
    const big = putOnBattlefield(s, opp, bear());
    const small = putOnBattlefield(s, opp, bear({ name: "Small", power: "1", toughness: "1" }));
    s.objects[sk]!.attacking = opp;
    expect(blockProblem(s, s.objects[big]!, s.objects[sk]!)).toMatch(/skulk/);
    expect(blockProblem(s, s.objects[small]!, s.objects[sk]!)).toBeNull();
  });
});

describe("umbra armor (CR 702.89a)", () => {
  it("destroys the Aura instead and removes the creature's damage", () => {
    const { s: s0, ap, ids, opp } = setup([kill]);
    const b = putOnBattlefield(s0, opp, bear());
    const u = putOnBattlefield(s0, opp, umbra);
    s0.objects[u]!.attachedTo = b;
    s0.objects[b]!.damage = 1;
    invalidateCharacteristics(s0);
    const s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!, [target(b)]))));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.objects[u]!.zone).toBe("graveyard");
    expect(logged(s, /umbra armor/)).toBe(true);
  });
});

describe("no maximum hand size (CR 402.2)", () => {
  it("the controller of the permanent skips the cleanup discard", () => {
    const { s, ap } = setup([]);
    expect(hasNoMaxHandSize(s, ap)).toBe(false);
    putOnBattlefield(s, ap, tower);
    expect(hasNoMaxHandSize(s, ap)).toBe(true);
    const lib = s.players[ap]!.library;
    for (let i = 0; i < 10; i++) {
      const id = lib.pop()!;
      s.objects[id]!.zone = "hand";
      s.players[ap]!.hand.push(id);
    }
    const n = s.players[ap]!.hand.length;
    const after = passUntil(s, "upkeep");
    expect(after.pending?.kind).not.toBe("discardToHandSize");
    expect(after.players[ap]!.hand.length).toBe(n);
  });
});

describe('"you may discard a card. If you do, draw" (CR 608.2c)', () => {
  it("draws only when the discard happened", () => {
    const { s: s0, ap, ids } = setup([rummage, bear()]);
    const n = s0.players[ap]!.hand.length - 1;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(passAll(s));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending?.kind).toBe("discard");
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(n + 1);
  });

  it("declining draws nothing", () => {
    const { s: s0, ap, ids } = setup([rummage, bear()]);
    const hand = s0.players[ap]!.hand.filter((id) => id !== ids[0]);
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.hand).toEqual(hand);
  });

  it("with an empty hand there is nothing to discard, so nothing is drawn", () => {
    const { s: s0, ap, ids } = setup([rummage]);
    for (const id of s0.players[ap]!.hand.filter((id) => id !== ids[0])) s0.objects[id]!.zone = "library";
    s0.players[ap]!.library.push(...s0.players[ap]!.hand.filter((id) => id !== ids[0]));
    s0.players[ap]!.hand = [ids[0]!];
    const s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand).toHaveLength(0);
  });
});

describe("extort (CR 702.101a)", () => {
  it("pay {W/B} on cast: each opponent loses 1 and you gain the total", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, extorter);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 6 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{W/B}" } });
    const plains = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains" && !s.objects[id]!.tapped)!;
    s = act(s, { type: "activateMana", player: ap, objectId: plains, mana: "W" });
    const life = s.players[ap]!.life;
    const opps = s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life)).toEqual(opps.map((l) => l - 1));
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});

describe('"you gain life equal to the life lost this way"', () => {
  it("gains the total lost by all opponents", () => {
    const { s: s0, ap, ids } = setup([drain]);
    const life = s0.players[ap]!.life;
    const s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.players[ap]!.life).toBe(life + 6);
  });

  it("counts life actually lost, which isn't capped by a low life total", () => {
    const { s: s0, ap, ids, opp } = setup([drain]);
    s0.players[opp]!.life = 1;
    const life = s0.players[ap]!.life;
    const s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.players[ap]!.life).toBe(life + 6);
  });
});

describe("damage triggers", () => {
  it('"whenever this creature deals damage, you gain that much life": once per damage event, with the total', () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leech);
    const life = s0.players[ap]!.life;
    let s = fight(s0, ap, [{ attacker: l, defender: opp }]);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(40 - 3);
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it('"that player discards a card" means the damaged player', () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, raider);
    const before = s0.players[opp]!.hand.length;
    expect(before).toBeGreaterThan(0);
    let s = fight(s0, ap, [{ attacker: r, defender: opp }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "discard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: opp });
    s = act(s, { type: "discard", player: opp, objectIds: [s.players[opp]!.hand[0]!] });
    expect(s.players[opp]!.hand.length).toBe(before - 1);
  });

  it("an optional discard on a damage trigger draws only if you discarded", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    const w = putOnBattlefield(s0, ap, wheel);
    let s = fight(s0, ap, [{ attacker: w, defender: opp }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const n = s.players[ap]!.hand.length;
    s = act(s, { type: "discard", player: ap, objectIds: [ids[0]!] });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(n);
  });
});

describe("statics for attacking creatures", () => {
  it("only attacking creatures get double strike", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, historian);
    const b = putOnBattlefield(s0, ap, bear());
    expect(objHasKeyword(s0, s0.objects[b]!, "Double strike")).toBe(false);
    let s = fight(s0, ap, [{ attacker: b, defender: opp }]);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(40 - 4);
  });
});

describe('"costs {N} less to cast if it targets"', () => {
  it("depends on the chosen target (CR 601.2f)", () => {
    const { s, ap, ids, opp } = setup([response]);
    const tapped = putOnBattlefield(s, opp, bear());
    const untapped = putOnBattlefield(s, opp, bear({ name: "Other Bear" }));
    s.objects[tapped]!.tapped = true;
    const o = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, o, 0, [], { targets: [target(tapped)] }).extra).toBe(1);
    expect(spellCost(s, ap, o, 0, [], { targets: [target(untapped)] }).extra).toBe(4);
    // With only the five lands' worth of mana... cast on the tapped one for {1}{W}.
    for (const id of s.battlefield) if (objIsType(s, s.objects[id]!, "Land") && s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    const pl = s.battlefield.filter((id) => s.objects[id]!.controller === ap && ["Plains", "Forest"].includes(s.cards[s.objects[id]!.cardId]!.name));
    s.objects[pl.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains")!]!.tapped = false;
    s.objects[pl.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!]!.tapped = false;
    expect(planCast(s, ap, ids[0]!, [target(untapped)])).toBeNull();
    const after = settle(passAll(run(s, planCast(s, ap, ids[0]!, [target(tapped)]))));
    expect(after.objects[tapped]!.zone).toBe("graveyard");
  });
});
