// Round 293: from the top of the popularity list, names no earlier round looked at.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, isFullySupported, planActivate, planCast, waitingOn, invalidateCharacteristics, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { castProblem, moveObject } from "../src/game";
import { putCounters } from "../src/counters";
import { nextRandom } from "../src/rng";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority (no blocks) until `done`. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
/** Bots answer every question but `human`'s until `done`. */
const botsUntil = (s: GameState, human: PlayerId, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (pid === human && s.pending) throw new Error(`human asked: ${JSON.stringify(s.pending).slice(0, 200)}`);
    if (pid === human) s = act(s, { type: "passPriority", player: pid });
    else for (const a of botActions(s, pid)) s = act(s, a);
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const ctl = (s: GameState, id: string) => controllerOf(s, s.objects[id]!);
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** The player `n` seats to `pid`'s left (turn order goes to each player's left, CR 101.4). */
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const orderofsuc = (): CardDef => ({"oracleId":"1b95970c-e7eb-41c4-a8d2-9889b64b3c63","name":"Order of Succession","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose left or right. Starting with you and proceeding in the chosen direction, each player chooses a creature controlled by the next player in that direction. Each player gains control of the creature they chose.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const calltothev = (): CardDef => ({"oracleId":"c2db2c28-3ddc-41ce-a0c2-ddc555dea133","name":"Call to the Void","manaCost":"{4}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player secretly chooses a creature they control and a creature they don't control. Then those choices are revealed. Destroy each creature chosen this way.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const thecavesof = (): CardDef => ({"oracleId":"5ce47fb9-4e4f-4419-af75-309d2743f5f9","name":"The Caves of Androzani","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Put two stun counters on each of up to two target tapped creatures.\nII, III — For each non-Saga permanent, choose a counter on it. You may put an additional counter of that kind on that permanent.\nIV — Search your library for a Doctor card, reveal it, put it into your hand, then shuffle.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const theseadevi = (): CardDef => ({"oracleId":"09d7a2d5-9e6e-4d84-8f97-c36b11ccc6fb","name":"The Sea Devils","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 green Alien Salamander creature token with islandwalk. (It can't be blocked as long as defending player controls an Island.)\nIII — Until end of turn, whenever a Salamander deals combat damage to a player, it deals that much damage to target creature that player controls.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const goblinpsyc = (): CardDef => ({"oracleId":"9369f131-3356-4926-9a9f-88a636305bd0","name":"Goblin Psychopath","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Goblin Mutant","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Mutant"],"oracleText":"Whenever this creature attacks or blocks, flip a coin. If you lose the flip, the next time it would deal combat damage this turn, it deals that damage to you instead.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"scg","releasedAt":"2003-05-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const oathoflimd = (): CardDef => ({"oracleId":"64e163c2-2378-4e4c-aefe-5e0d2fd19988","name":"Oath of Lim-Dûl","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you lose life, for each 1 life you lost, sacrifice a permanent other than this enchantment unless you discard a card. (Damage dealt to you causes you to lose life.)\n{B}{B}: Draw a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const soulsculpt = (): CardDef => ({"oracleId":"d407abd0-69a9-405d-ab69-75b379a45780","name":"Soul Sculptor","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"{1}{W}, {T}: Target creature becomes an enchantment and loses all abilities until a player casts a creature spell.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const thecurseof = (): CardDef => ({"oracleId":"ef7fce1b-0d95-4f92-a8ad-09d9756fa0e4","name":"The Curse of Fenric","manaCost":"{2}{G}{W}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — For each player, destroy up to one target creature that player controls. For each creature destroyed this way, its controller creates a 3/3 green Mutant creature token with deathtouch.\nII — Target nontoken creature becomes a 6/6 legendary Horror creature named Fenric and loses all abilities.\nIII — Target Mutant fights another target creature named Fenric.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Fight"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const ashioksera = (): CardDef => ({"oracleId":"13cf3ef7-d88e-4cc7-a4d8-cedc671f356a","name":"Ashiok's Erasure","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Flash\nWhen this enchantment enters, exile target spell.\nYour opponents can't cast spells with the same name as the exiled card.\nWhen this enchantment leaves the battlefield, return the exiled card to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":["Flash"],"commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const descentint = (): CardDef => ({"oracleId":"88d42e0e-3921-4873-a53b-146220341f76","name":"Descent into Madness","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, put a despair counter on this enchantment, then each player exiles X permanents they control and/or cards from their hand, where X is the number of despair counters on this enchantment.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"avr","releasedAt":"2012-05-04","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

/** Sets the game's random state so the next flips come out as `wins` (true: won). */
function rig(s: GameState, ...wins: boolean[]) {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
}

describe("round 293", () => {
  it("every card of the round compiles fully", () => supported(orderofsuc(), calltothev(), thecavesof(), theseadevi(), goblinpsyc(), oathoflimd(), soulsculpt(), thecurseof(), ashioksera(), descentint()));
});

describe("Order of Succession", () => {
  it("left: each player takes a creature of the player to their left, all at once", () => {
    const { s: s0, ap, ids } = setup([orderofsuc()]);
    const [b, c, d] = [leftOf(s0, ap), leftOf(s0, ap, 2), leftOf(s0, ap, 3)];
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const b1 = putOnBattlefield(s0, b, bear({ name: "Test B1" }));
    const b2 = putOnBattlefield(s0, b, bear({ name: "Test B2", power: "5", toughness: "5" }));
    const c1 = putOnBattlefield(s0, c, bear({ name: "Test C1" }));
    // D has none: C takes nothing (rulings).
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "direction", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "left" });
    // You choose first, among B's two creatures.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(s.pending.options.sort()).toEqual([b1, b2].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [b1] });
    s = until(s, (x) => !x.stack.length && !x.pending);
    expect(ctl(s, b1)).toBe(ap);
    expect(ctl(s, b2)).toBe(b);
    // B had one choice (C's creature), D had one (yours); C chose nothing.
    expect(ctl(s, c1)).toBe(b);
    expect(ctl(s, mine)).toBe(d);
  });

  it("right: the other way round; a bot takes the best creature", () => {
    const { s: s0, ap, ids } = setup([orderofsuc()]);
    const [b, c, d] = [leftOf(s0, ap), leftOf(s0, ap, 2), leftOf(s0, ap, 3)];
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const c1 = putOnBattlefield(s0, c, bear({ name: "Test C1" }));
    const c2 = putOnBattlefield(s0, c, bear({ name: "Test C2", power: "6", toughness: "6" }));
    const d1 = putOnBattlefield(s0, d, bear({ name: "Test D1" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => !!x.pending);
    s = act(s, { type: "chooseOption", player: ap, choice: "right" });
    // You take D's only creature; D picks from C's two (a bot: the bigger one); C takes nothing of B's; B takes yours.
    s = botsUntil(s, ap, (x) => !x.stack.length && !x.pending);
    expect(ctl(s, d1)).toBe(ap);
    expect(ctl(s, c2)).toBe(d);
    expect(ctl(s, c1)).toBe(c);
    expect(ctl(s, mine)).toBe(b);
  });
});

describe("Call to the Void", () => {
  it("each player secretly chooses one of theirs and one they don't control; each chosen creature is destroyed once", () => {
    const { s: s0, ap, ids } = setup([calltothev()]);
    const [b, c, d] = [leftOf(s0, ap), leftOf(s0, ap, 2), leftOf(s0, ap, 3)];
    const mine1 = putOnBattlefield(s0, ap, bear({ name: "Test Mine One" }));
    const mine2 = putOnBattlefield(s0, ap, bear({ name: "Test Mine Two", power: "4", toughness: "4" }));
    const bBig = putOnBattlefield(s0, b, bear({ name: "Test B Big", power: "7", toughness: "7" }));
    const bSmall = putOnBattlefield(s0, b, bear({ name: "Test B Small", power: "1", toughness: "1" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => !!x.pending);
    // Yours first, then one you don't control.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, secret: "own" });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(s.pending.options.sort()).toEqual([mine1, mine2].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine1] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, secret: "theirs" });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(s.pending.options.sort()).toEqual([bBig, bSmall].sort());
    // Nothing is revealed before every choice is made.
    const logged = s.log.length;
    s = act(s, { type: "pickPermanents", player: ap, ids: [bBig] });
    // B: their least useful (Test B Small), then the best they don't control (Test Mine Two); C and D control none,
    // and both choose the best one they don't control.
    s = botsUntil(s, ap, (x) => !x.stack.length && !x.pending);
    const reveal = s.log.slice(logged).map((l) => (typeof l === "string" ? l : JSON.stringify(l))).find((l) => l.includes("The choices are revealed"));
    expect(reveal).toBeTruthy();
    expect(zone(s, mine1)).toBe("graveyard");
    expect(zone(s, bBig)).toBe("graveyard");
    expect(zone(s, bSmall)).toBe("graveyard");
    expect(zone(s, mine2)).toBe("graveyard");
    void c, d;
  });
});

describe("The Caves of Androzani", () => {
  it("II: any number of non-Saga permanents get another counter of a kind on them, the kind chosen", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const caves = putOnBattlefield(s0, ap, thecavesof());
    s0.objects[caves]!.counters = { lore: 1 };
    const two = putOnBattlefield(s0, ap, bear({ name: "Test Two Kinds" }));
    s0.objects[two]!.counters = { "+1/+1": 1, stun: 1 };
    const one = putOnBattlefield(s0, ap, bear({ name: "Test One Kind" }));
    s0.objects[one]!.counters = { "+1/+1": 2 };
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs", power: "5", toughness: "5" }));
    s0.objects[theirs]!.counters = { "-1/-1": 1 };
    putOnBattlefield(s0, ap, bear({ name: "Test No Counters" }));
    invalidateCharacteristics(s0);
    putCounters(s0, s0.objects[caves]!, "lore", 1);
    let s = until(s0, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, anyNumber: true });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    // Not the Saga, not a permanent with no counter.
    expect(s.pending.options.sort()).toEqual([two, one, theirs].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [two, theirs] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterKind", about: two });
    s = act(s, { type: "chooseOption", player: ap, choice: "+1/+1" });
    s = until(s, (x) => !x.stack.length && !x.pending);
    expect(s.objects[two]!.counters).toMatchObject({ "+1/+1": 2, stun: 1 });
    expect(s.objects[one]!.counters).toMatchObject({ "+1/+1": 2 });
    expect(s.objects[theirs]!.counters).toMatchObject({ "-1/-1": 2 });
    expect(s.objects[caves]!.counters.lore).toBe(2);
  });

  it("a bot adds the helpful kind to its own and the harmful kind to others'", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const caves = putOnBattlefield(s0, opp, thecavesof());
    s0.objects[caves]!.counters = { lore: 1 };
    const own = putOnBattlefield(s0, opp, bear({ name: "Test Own" }));
    s0.objects[own]!.counters = { "+1/+1": 1, stun: 1 };
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    s0.objects[mine]!.counters = { "+1/+1": 1 };
    const stunned = putOnBattlefield(s0, ap, bear({ name: "Test Stunned" }));
    s0.objects[stunned]!.counters = { stun: 1, "+1/+1": 1 };
    invalidateCharacteristics(s0);
    putCounters(s0, s0.objects[caves]!, "lore", 1);
    const s = botsUntil(s0, ap, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.objects[own]!.counters).toMatchObject({ "+1/+1": 2, stun: 1 });
    expect(s.objects[mine]!.counters).toMatchObject({ "+1/+1": 1 });
    expect(s.objects[stunned]!.counters).toMatchObject({ stun: 2, "+1/+1": 1 });
  });
});

describe("The Sea Devils", () => {
  it("I: a 2/2 Alien Salamander with islandwalk; III: until end of turn, a Salamander's combat damage to a player is dealt again to target creature that player controls", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const saga = putOnBattlefield(s0, ap, theseadevi());
    s0.objects[saga]!.counters = { lore: 0 };
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = until(s0, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    const ch = characteristics(s, s.objects[token]!);
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Alien", "Salamander"]));
    expect(ch.keywords).toContain("Islandwalk");
    // Anyone's Salamander, not only yours (it's "a Salamander").
    const theirSal = putOnBattlefield(s, opp, bear({ name: "Test Their Salamander", typeLine: "Creature — Salamander", subtypes: ["Salamander"], power: "3", toughness: "3" }));
    const victim = putOnBattlefield(s, opp, bear({ name: "Test Victim", power: "1", toughness: "4" }));
    const myBig = putOnBattlefield(s, ap, bear({ name: "Test My Big", power: "1", toughness: "5" }));
    s.objects[token]!.controlledSinceTurn = -1;
    s.objects[saga]!.counters.lore = 2;
    putCounters(s, s.objects[saga]!, "lore", 1);
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, saga)).toBe("graveyard");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: token, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.objects[victim]!.damage).toBe(2);
    void theirSal, myBig;
  });

  it("the trigger ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, theseadevi());
    s0.objects[saga]!.counters = { lore: 2 };
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = until(s0, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.floatingTriggers?.length ?? 0).toBeGreaterThan(0);
    s = passUntil(s, "upkeep", leftOf(s, ap));
    expect(s.floatingTriggers ?? []).toHaveLength(0);
  });
});

describe("Goblin Psychopath", () => {
  it("lost flip: the next combat damage it deals is dealt to you instead", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const me = putOnBattlefield(s0, ap, goblinpsyc());
    let s = passUntil(s0, "declareAttackers", ap);
    rig(s, false);
    const [mine, theirs] = [s.players[ap]!.life, s.players[opp]!.life];
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = until(s, (x) => x.step === "end");
    expect(s.players[ap]!.life).toBe(mine - 5);
    expect(s.players[opp]!.life).toBe(theirs);
  });

  it("won flip: it deals its damage as usual", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const me = putOnBattlefield(s0, ap, goblinpsyc());
    let s = passUntil(s0, "declareAttackers", ap);
    rig(s, true);
    const [mine, theirs] = [s.players[ap]!.life, s.players[opp]!.life];
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = until(s, (x) => x.step === "end");
    expect(s.players[ap]!.life).toBe(mine);
    expect(s.players[opp]!.life).toBe(theirs - 5);
  });
});

describe("Oath of Lim-Dûl", () => {
  it("for each 1 life lost, a permanent other than it is sacrificed unless a card is discarded, one choice at a time", () => {
    const loss = card("Test Loss", "Sorcery", "{B}", { oracleText: "You lose 3 life." });
    const keep = card("Test Keep", "Instant", "{U}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([loss, keep]);
    const p = s0.players[ap]!;
    p.hand = [...ids];
    const oath = putOnBattlefield(s0, ap, oathoflimd());
    const b1 = putOnBattlefield(s0, ap, bear({ name: "Test First" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => !!x.pending);
    // 1: discard Test Keep rather than sacrifice.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "discard" || (s.pending as { kind: string } | null)?.kind === "chooseDiscard") s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] } as Action);
    s = until(s, (x) => !!x.pending || (!x.stack.length && !x.triggerQueue.length));
    // 2 and 3: no card left, so a permanent other than Oath each time.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(s.pending.options).not.toContain(oath);
    s = act(s, { type: "pickPermanents", player: ap, ids: [b1] });
    s = until(s, (x) => !!x.pending || (!x.stack.length && !x.triggerQueue.length));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    const land = s.pending.options[0]!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [land] });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, land)).toBe("graveyard");
    expect(zone(s, oath)).toBe("battlefield");
  });

  it("a bot answers every choice", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    putOnBattlefield(s0, opp, oathoflimd());
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    s0.objects[b]!.tapped = true;
    const me = putOnBattlefield(s0, ap, bear({ name: "Test Attacker" }));
    let s = passUntil(s0, "declareAttackers", ap);
    const before = s.players[opp]!.hand.length + s.battlefield.filter((id) => ctl(s, id) === opp).length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = botsUntil(s, ap, (x) => x.step === "end");
    const after = s.players[opp]!.hand.length + s.battlefield.filter((id) => ctl(s, id) === opp).length;
    expect(before - after).toBe(2);
    void b;
  });
});

describe("Soul Sculptor", () => {
  it("the creature is just an enchantment with no abilities, across turns, until a player casts a creature spell", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const me = putOnBattlefield(s0, ap, soulsculpt());
    const flier = putOnBattlefield(s0, opp, bear({ name: "Test Flier", oracleText: "Flying", keywords: ["Flying"], supertypes: ["Legendary"], typeLine: "Legendary Creature — Bird" }));
    let s = run(s0, planActivate(s0, ap, me, 0, [tgt(flier)]));
    s = until(s, (x) => !x.stack.length && !x.pending);
    let ch = characteristics(s, s.objects[flier]!);
    expect(ch.types).toEqual(["Enchantment"]);
    expect(ch.subtypes).toEqual([]);
    expect(ch.keywords).not.toContain("Flying");
    // The next turn doesn't end it.
    s = until(s, (x) => x.activePlayer === opp && x.step === "main1");
    ch = characteristics(s, s.objects[flier]!);
    expect(ch.types).toEqual(["Enchantment"]);
    // Any player's creature spell does.
    const spell = inHand(s, opp, bear({ name: "Test Creature Spell" }));
    s.players[opp]!.manaPool.G = 2;
    s = run(s, planCast(s, opp, spell));
    ch = characteristics(s, s.objects[flier]!);
    expect(ch.types).toEqual(["Creature"]);
    expect(ch.keywords).toContain("Flying");
  });
});

describe("The Curse of Fenric", () => {
  it("II: a nontoken creature becomes a 6/6 legendary Horror named Fenric with no abilities; III: a Mutant fights a creature named Fenric", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const saga = putOnBattlefield(s0, ap, thecurseof());
    const flier = putOnBattlefield(s0, opp, bear({ name: "Test Flier", oracleText: "Flying", keywords: ["Flying"], typeLine: "Creature — Bird", subtypes: ["Bird"] }));
    const mutant = putOnBattlefield(s0, ap, bear({ name: "Test Mutant", typeLine: "Creature — Mutant", subtypes: ["Mutant"], power: "3", toughness: "3" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Test Other" }));
    s0.objects[saga]!.counters = { lore: 1 };
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = until(s0, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(flier)] });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    const ch = characteristics(s, s.objects[flier]!);
    expect(ch.name).toBe("Fenric");
    expect(ch.subtypes).toEqual(["Horror"]);
    expect(ch.supertypes).toContain("Legendary");
    expect([ch.power, ch.toughness]).toEqual([6, 6]);
    expect(ch.keywords).not.toContain("Flying");
    // III: only a creature named Fenric can be the second target.
    putCounters(s, s.objects[saga]!, "lore", 1);
    s = until(s, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(mutant), tgt(other)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(mutant), tgt(flier)] });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.objects[flier]!.damage).toBe(3);
    expect(zone(s, mutant)).toBe("graveyard");
    expect(zone(s, saga)).toBe("graveyard");
  });
});

describe("Ashiok's Erasure", () => {
  it("exiles target spell; opponents can't cast spells with that name; when it leaves, the card returns to its owner's hand", () => {
    const bolt = card("Test Bolt", "Instant", "{U}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([bolt, ashioksera()]);
    const opp = leftOf(s0, ap);
    const theirBolt = inHand(s0, opp, bolt);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const boltItem = s.stack.at(-1)!.id;
    s = run(s, planCast(s, ap, ids[1]!));
    s = until(s, (x) => x.pending?.kind === "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: boltItem }] });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, ids[0]!)).toBe("exile");
    // Opponents can't cast a spell with that name.
    s = until(s, (x) => x.activePlayer === opp && x.step === "main1");
    s.players[opp]!.manaPool.U = 1;
    expect(planCast(s, opp, theirBolt)).toBeNull();
    expect(castProblem(s, opp, theirBolt)).toMatch(/name/i);
    // It leaves: the exiled card goes back to its owner's hand, and the ban is over.
    const erasure = s.battlefield.find((id) => s.objects[id]!.cardId === ashioksera().oracleId)!;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, erasure, "graveyard");
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, ids[0]!)).toBe("hand");
  });
});

describe("Descent into Madness", () => {
  it("upkeep: a despair counter, then each player from its controller on exiles that many permanents and/or hand cards", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const descent = putOnBattlefield(s0, opp, descentint());
    s0.objects[descent]!.counters = { despair: 1 };
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    let s = passUntil(s0, "upkeep", opp);
    s = botsUntil(s, ap, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === ap);
    expect(s.objects[descent]!.counters.despair).toBe(2);
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    // Permanents you control and cards in your hand, two of them.
    expect(s.pending).toMatchObject({ min: 2, max: 2 });
    expect(s.pending.cards).toContain(mine);
    const handCard = s.players[ap]!.hand[0]!;
    expect(s.pending.cards).toContain(handCard);
    // Everyone before you has chosen; nothing is exiled until you have too (rulings).
    const exiledBefore = s.players.reduce((n, p) => n + p.exile.length, 0);
    s = act(s, { type: "searchLibrary", player: ap, found: [mine, handCard] });
    s = botsUntil(s, ap, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, handCard)).toBe("exile");
    // Two for each of the four players.
    expect(s.players.reduce((n, p) => n + p.exile.length, 0) - exiledBefore).toBe(8);
  });
});
