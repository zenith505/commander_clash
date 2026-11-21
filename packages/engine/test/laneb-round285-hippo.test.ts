// Lane B round B285: Pygmy Hippo ("Whenever this creature attacks and isn't blocked, you may have defending player
// activate a mana ability of each land they control and lose all unspent mana. If you do, this creature assigns no combat
// damage this turn and at the beginning of your next main phase this turn, you add an amount of {C} equal to the amount of
// mana that player lost this way."; CR 106.4, 509.1h, 510.1a, 603.7, 605.5a and Drain Power's rulings).

import { describe, expect, it } from "vitest";
import { act, bear, forest, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const hippo = (): CardDef => ({"oracleId":"0d39513a-1f05-4d9a-a772-745f4f1a3471","name":"Pygmy Hippo","manaCost":"{G}{U}","cmc":2,"typeLine":"Creature — Hippo","supertypes":[],"types":["Creature"],"subtypes":["Hippo"],"oracleText":"Whenever this creature attacks and isn't blocked, you may have defending player activate a mana ability of each land they control and lose all unspent mana. If you do, this creature assigns no combat damage this turn and at the beginning of your next main phase this turn, you add an amount of {C} equal to the amount of mana that player lost this way.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const tundra = (): CardDef => ({"oracleId":"02418479-9455-417f-a6a1-004356faff37","name":"Tundra","manaCost":"","cmc":0,"typeLine":"Land — Plains Island","supertypes":[],"types":["Land"],"subtypes":["Plains","Island"],"oracleText":"({T}: Add {W} or {U}.)","colors":[],"colorIdentity":["U","W"],"keywords":[],"producedMana":["U","W"],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const total = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);

/**
 * `ap` attacks `opp` with Pygmy Hippo (and blocks are declared: none, or `block` blocking it); the opponent controls a
 * Forest and an Island, a tapped Forest, and `extra` lands. Returns at the trigger's question (or wherever it stops).
 */
const attack = (opts: { block?: boolean; lands?: boolean; extra?: CardDef[] } = {}) => {
  const { s: s0, ap, opp } = setup([]);
  const h = putOnBattlefield(s0, ap, hippo());
  const lands = opts.lands === false ? [] : [putOnBattlefield(s0, opp, forest), putOnBattlefield(s0, opp, island)];
  const tapped = opts.lands === false ? undefined : putOnBattlefield(s0, opp, forest);
  if (tapped) s0.objects[tapped]!.tapped = true;
  for (const d of opts.extra ?? []) lands.push(putOnBattlefield(s0, opp, d));
  const blocker = opts.block ? putOnBattlefield(s0, opp, bear()) : undefined;
  invalidateCharacteristics(s0);
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
  for (let i = 0; i < 40 && s.pending?.kind !== "chooseMay" && s.step !== "combatDamage" && s.step !== "endCombat"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: blocker ? [{ blocker, attacker: h }] : [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return { s, ap, opp, h, lands, tapped };
};

describe("Pygmy Hippo", () => {
  it("is supported", () => {
    expect(isFullySupported(hippo())).toBe(true);
  });

  it("unblocked, yes: the defending player taps their lands, loses all their mana, Hippo deals no damage, and you get that much {C} after combat", () => {
    const { s: s0, ap, opp, lands, tapped } = attack();
    expect(s0.pending).toMatchObject({ kind: "chooseMay", player: ap });
    // Mana they already had is lost too ("all unspent mana").
    const s1 = structuredClone(s0);
    s1.players[opp]!.manaPool.R = 1;
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toBeNull();
    for (const l of lands) expect(s.objects[l]!.tapped).toBe(true);
    expect(s.objects[tapped!]!.tapped).toBe(true);
    expect(total(s, opp)).toBe(0);
    // Not added now: at the beginning of the next main phase.
    expect(s.players[ap]!.manaPool.C).toBe(0);
    expect(s.log.some((l) => /loses \{R\}\{U\}\{G\}\.$|loses \{U\}\{R\}\{G\}\.$/.test(l.text))).toBe(true);
    const life = s.players[opp]!.life;
    s = passUntil(s, "endCombat", ap);
    // It assigns no combat damage this turn (CR 510.1a).
    expect(s.players[opp]!.life).toBe(life);
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[ap]!.manaPool.C).toBe(3);
    expect(s.players[opp]!.life).toBe(life);
  });

  it("unblocked, no: nothing is tapped and it deals its combat damage", () => {
    const { s: s0, ap, opp, lands } = attack();
    let s = settle(act(s0, { type: "chooseMay", player: ap, yes: false }));
    for (const l of lands) expect(s.objects[l]!.tapped).toBe(false);
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("blocked: no trigger", () => {
    const { s, ap } = attack({ block: true });
    expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(false);
  });

  it("a land with a choice of mana: the defending player chooses (Drain Power's rulings)", () => {
    const { s: s0, ap, opp, lands } = attack({ extra: [tundra()] });
    const t = lands[2]!;
    let s = act(s0, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "drainLand", about: t });
    const pend = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(pend.labels).toEqual(["Add {W}", "Add {U}"]);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: pend.options[0]! }));
    expect(s.objects[t]!.tapped).toBe(true);
    expect(total(s, opp)).toBe(0);
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[ap]!.manaPool.C).toBe(3);
  });

  it("with no lands: done all the same, so no combat damage and no mana", () => {
    const { s: s0, ap, opp } = attack({ lands: false });
    let s = settle(act(s0, { type: "chooseMay", player: ap, yes: true }));
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(life);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("a bot takes the mana when the defending player has at least as many untapped lands as its power, not with fewer", () => {
    const { s: s0, ap, lands } = attack();
    expect(botActions(s0, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    const one = structuredClone(s0);
    one.objects[lands[1]!]!.tapped = true;
    expect(botActions(one, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    // With the answer, the game goes on to the extra mana.
    const s = settle(run(s0, botActions(s0, ap)));
    expect(settle(passUntil(s, "main2", ap)).players[ap]!.manaPool.C).toBe(2);
  });
});
