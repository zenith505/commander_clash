// Round 441 (Lane A): Wayta, Trainer Prodigy ("{2}{G}, {T}: Target creature you control fights another target creature.
// This ability costs {2} less to activate if it targets two creatures you control." and "If a creature you control being
// dealt damage causes a triggered ability of a permanent you control to trigger, that ability triggers an additional
// time.": CR 601.2f, 701.14, 603.2d; rulings: only abilities whose trigger conditions refer to damage being dealt).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const wayta = (): CardDef => ({"oracleId": "e507df33-d150-4b21-8ddb-90799f412dd8", "name": "Wayta, Trainer Prodigy", "manaCost": "{R}{G}{W}", "cmc": 3, "typeLine": "Legendary Creature — Human Warrior", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Warrior"], "oracleText": "Haste\n{2}{G}, {T}: Target creature you control fights another target creature. This ability costs {2} less to activate if it targets two creatures you control.\nIf a creature you control being dealt damage causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.", "power": "1", "toughness": "5", "colors": ["G", "R", "W"], "colorIdentity": ["G", "R", "W"], "keywords": ["Haste", "Fight"], "commanderLegal": "legal", "set": "lcc", "releasedAt": "2023-11-17", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const raptor = (): CardDef => ({"oracleId": "80bb9ce4-1f3c-42ca-b75f-9a6b2f42073b", "name": "Ripjaw Raptor", "manaCost": "{2}{G}{G}", "cmc": 4, "typeLine": "Creature — Dinosaur", "supertypes": [], "types": ["Creature"], "subtypes": ["Dinosaur"], "oracleText": "Enrage — Whenever this creature is dealt damage, draw a card.", "power": "4", "toughness": "5", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Enrage"], "commanderLegal": "legal", "set": "xln", "releasedAt": "2017-09-29", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const mephidross = (): CardDef => ({"oracleId": "a6763205-47c7-4d7f-be8c-2f69e8321048", "name": "Mephidross Vampire", "manaCost": "{4}{B}{B}", "cmc": 6, "typeLine": "Creature — Vampire", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire"], "oracleText": "Flying\nEach creature you control is a Vampire in addition to its other creature types and has \"Whenever this creature deals damage to a creature, put a +1/+1 counter on this creature.\"", "power": "3", "toughness": "4", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Flying"], "commanderLegal": "legal", "set": "spg", "releasedAt": "2023-11-17", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const pridemate = (): CardDef => ({"oracleId": "95e94dea-5ac0-4d6f-adec-ca147aee861f", "name": "Ajani's Pridemate", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Creature — Cat Soldier", "supertypes": [], "types": ["Creature"], "subtypes": ["Cat", "Soldier"], "oracleText": "Whenever you gain life, put a +1/+1 counter on this creature.", "power": "2", "toughness": "2", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "commanderLegal": "legal", "set": "fdn", "releasedAt": "2024-11-15", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const nighthawk = (): CardDef => ({"oracleId": "feb244f8-bcb1-44cf-9940-2719221a7309", "name": "Vampire Nighthawk", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Creature — Vampire Shaman", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire", "Shaman"], "oracleText": "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)", "power": "2", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Deathtouch", "Flying", "Lifelink"], "commanderLegal": "legal", "set": "zen", "releasedAt": "2009-10-02", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const giant = (): CardDef => ({"oracleId": "342199e0-15b6-4824-83da-25caef2592b3", "name": "Hill Giant", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Giant", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "commanderLegal": "legal", "set": "10e", "releasedAt": "2007-07-13", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const pyroclasm = (): CardDef => ({"oracleId": "e4bcd4ea-e7cd-4471-8f3b-18bb51d3d70c", "name": "Pyroclasm", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Pyroclasm deals 2 damage to each creature.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "commanderLegal": "legal", "set": "dsk", "releasedAt": "2024-09-27", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions answered as the bots would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const FIGHT = compileCard(wayta()).activated.findIndex((a) => a.body.effects[0]?.type === "fight");
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const counters = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;

describe("round 441: Wayta, Trainer Prodigy", () => {
  it("is fully supported: a fight that costs {2} less with two creatures you control, and damage triggers again", () => {
    expect(isFullySupported(wayta())).toBe(true);
    const c = compileCard(wayta());
    expect(c.activated[FIGHT]).toMatchObject({ manaCost: "{2}{G}", tap: true, costLessIfTarget: { n: 2, count: 2, filter: { types: ["Creature"], controller: "you" } } });
    expect(c.triggersAgain).toEqual([{ by: { event: "dealtDamage", filter: [expect.objectContaining({ kind: "object", types: ["Creature"], controller: "you" })] } }]);
  });

  it("Lightning Bolt on your Ripjaw Raptor: enrage triggers twice (once without Wayta)", () => {
    for (const withWayta of [true, false]) {
      const { s: s0, ap } = setup([]);
      if (withWayta) putOnBattlefield(s0, ap, wayta());
      const r = putOnBattlefield(s0, ap, raptor());
      const b = toHand(s0, ap, bolt());
      const before = hand(s0, ap);
      const s = settle(run(s0, planCast(s0, ap, b, [target(r)])));
      expect(s.objects[r]!.zone).toBe("battlefield");
      expect(hand(s, ap)).toBe(before - 1 + (withWayta ? 2 : 1));
    }
  });

  it("not an opponent's creature dealt damage, nor an opponent's ability", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wayta());
    const theirs = putOnBattlefield(s0, opp, raptor());
    const b = toHand(s0, ap, bolt());
    const before = hand(s0, opp);
    const s = settle(run(s0, planCast(s0, ap, b, [target(theirs)])));
    expect(hand(s, opp)).toBe(before + 1);
  });

  it("the fight costs {G} with two creatures you control, {2}{G} with an opponent's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    // One Forest left: {G} only.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const forest = s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    s0.players[ap]!.library.splice(s0.players[ap]!.library.indexOf(forest), 1);
    s0.objects[forest]!.zone = "battlefield";
    s0.battlefield.push(forest);
    const w = putOnBattlefield(s0, ap, wayta());
    const r = putOnBattlefield(s0, ap, raptor());
    const mine = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, bears());
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, w, FIGHT, [target(r), target(theirs)])).toBeNull();
    const plan = planActivate(s0, ap, w, FIGHT, [target(r), target(mine)]);
    expect(plan).not.toBeNull();
    const before = hand(s0, ap);
    const s = settle(run(s0, plan));
    expect(s.objects[forest]!.tapped).toBe(true);
    expect(s.objects[w]!.tapped).toBe(true);
    // Grizzly Bears dealt Raptor 2 damage: enrage twice; the Bears died.
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(hand(s, ap)).toBe(before + 2);
  });

  it("with Mephidross Vampire: a creature fighting your creature gets two counters, one fighting an opponent's gets one", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wayta());
    putOnBattlefield(s0, ap, mephidross());
    const r = putOnBattlefield(s0, ap, raptor());
    const g = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, giant());
    // Raptor fights your Hill Giant: its "deals damage to a creature" counter twice (damage to a creature you control).
    let s = settle(run(s0, planActivate(s0, ap, w, FIGHT, [target(r), target(g)])));
    expect(counters(s, r)).toBe(2);
    expect(s.objects[g]!.zone).toBe("graveyard");
    // Untapped, Raptor fights the opponent's Hill Giant: only once.
    s.objects[w]!.tapped = false;
    const was = counters(s, r);
    s = settle(run(s, planActivate(s, ap, w, FIGHT, [target(r), target(theirs)])));
    expect(counters(s, r)).toBe(was + 1);
  });

  it("not what the damage led to: Ajani's Pridemate gains one counter from Vampire Nighthawk's lifelink (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wayta());
    const p = putOnBattlefield(s0, ap, pridemate());
    const n = putOnBattlefield(s0, ap, nighthawk());
    const b = putOnBattlefield(s0, ap, bears());
    const s = settle(run(s0, planActivate(s0, ap, w, FIGHT, [target(n), target(b)])));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(counters(s, p)).toBe(1);
  });

  it("Pyroclasm: each of your two Raptors' enrage triggers twice, an opponent's once", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wayta());
    putOnBattlefield(s0, ap, raptor());
    putOnBattlefield(s0, ap, raptor());
    putOnBattlefield(s0, opp, raptor());
    const c = toHand(s0, ap, pyroclasm());
    const [mine, theirs] = [hand(s0, ap), hand(s0, opp)];
    const s = settle(run(s0, planCast(s0, ap, c)));
    expect(hand(s, ap)).toBe(mine - 1 + 4);
    expect(hand(s, opp)).toBe(theirs + 1);
  });

  it("combat: your Ripjaw Raptor blocking an opponent's Hill Giant draws two cards", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wayta());
    const r = putOnBattlefield(s0, ap, raptor());
    const g = putOnBattlefield(s0, opp, giant());
    let s = passUntil(s0, "beginCombat", opp);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: g, defender: ap }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === ap); i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    const before = hand(s, ap);
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: r, attacker: g }] });
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[r]!.damage).toBe(3);
    expect(hand(s, ap)).toBe(before + 2);
  });
});
