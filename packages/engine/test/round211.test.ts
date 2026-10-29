// Round 211: Wrath of the Skies and Aether Spike (pay any amount of energy) and others.

import { describe, expect, it } from "vitest";
import { nextRandom } from "../src/rng";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, characteristics, compileCard, controllerOf, destroyPermanent, objHasKeyword, planActivate, power, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const attack = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const inHand = (s: GameState, pid: PlayerId, name: string) => s.players[pid]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === name)!;
const rock = (n = "Test Rock", mv = 3) => card(n, "Artifact", `{${mv}}`, { cmc: mv });

// Real oracle text (Scryfall).
const wrathOfTheSkies = card("Wrath of the Skies", "Sorcery", "{X}{W}{W}", {"cmc":2,"keywords":[],"oracleText":"You get X {E} (energy counters), then you may pay any amount of {E}. Destroy each artifact, creature, and enchantment with mana value less than or equal to the amount of {E} paid this way.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const aetherSpike = card("Aether Spike", "Instant", "{1}{U}", {"cmc":2,"keywords":[],"oracleText":"Choose target spell. You get {E}{E} (two energy counters), then you may pay any amount of {E}. Counter that spell unless its controller pays {1} for each {E} paid this way.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});

describe("you may pay any amount of {E}: Wrath of the Skies, Aether Spike", () => {
  it("compile", () => supported(wrathOfTheSkies, aetherSpike));

  it("Wrath of the Skies: X energy, then destroys each artifact, creature and enchantment with mana value up to the energy paid", () => {
    const { s: s0, ap, opp } = setup([wrathOfTheSkies]);
    const w = inHand(s0, ap, "Wrath of the Skies");
    s0.players[ap]!.energy = 1;
    s0.players[ap]!.manaPool.C = 3;
    s0.players[ap]!.manaPool.W = 2;
    const cheap = putOnBattlefield(s0, opp, bear());
    const three = putOnBattlefield(s0, opp, rock());
    const four = putOnBattlefield(s0, opp, rock("Big Rock", 4));
    const land = putOnBattlefield(s0, opp, card("Test Land", "Land"));
    let s = settle(run(s0, planCast(s0, ap, w, [], undefined, undefined, 3)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payEnergy", numberRange: { min: 0, max: 4 } });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }));
    expect(s.objects[cheap]!.zone).toBe("graveyard");
    expect(s.objects[three]!.zone).toBe("graveyard");
    expect(s.objects[four]!.zone).toBe("battlefield");
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.players[ap]!.energy).toBe(1);
  });

  it("Wrath of the Skies: paying 0 destroys only mana value 0", () => {
    const { s: s0, ap, opp } = setup([wrathOfTheSkies]);
    const w = inHand(s0, ap, "Wrath of the Skies");
    s0.players[ap]!.manaPool.C = 2;
    s0.players[ap]!.manaPool.W = 2;
    const zero = putOnBattlefield(s0, opp, card("Zero Thing", "Artifact Creature — Construct", "{0}", { power: "0", toughness: "1" }));
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, w, [], undefined, undefined, 2)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[zero]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.players[ap]!.energy).toBe(2);
  });

  it("Aether Spike: counters the spell unless its controller pays {1} for each energy paid", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = into(s0, ap, bear(), "hand");
    const spike = into(s0, opp, aetherSpike, "hand");
    s0.players[ap]!.manaPool.G = 2;
    s0.players[ap]!.manaPool.C = 1;
    s0.players[opp]!.manaPool.U = 1;
    s0.players[opp]!.manaPool.C = 1;
    s0.players[opp]!.energy = 1;
    let s = run(s0, planCast(s0, ap, b, []));
    const item = s.stack[s.stack.length - 1]!;
    s = act(s, { type: "passPriority", player: ap });
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, spike, [{ kind: "stack", id: item.id }]));
    while (!s.pending) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payEnergy", player: opp, numberRange: { max: 3 } });
    s = act(s, { type: "chooseOption", player: opp, choice: "2" });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}" });
    expect(() => act(s, { type: "payUnless", player: ap, pay: true })).toThrow(); // one mana left: not enough
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.energy).toBe(1);
  });

  it("Aether Spike: paying 1, the spell's controller may pay {1} and it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = into(s0, ap, bear(), "hand");
    const spike = into(s0, opp, aetherSpike, "hand");
    s0.players[ap]!.manaPool.G = 2;
    s0.players[ap]!.manaPool.C = 1;
    s0.players[opp]!.manaPool.U = 1;
    s0.players[opp]!.manaPool.C = 1;
    let s = run(s0, planCast(s0, ap, b, []));
    const item = s.stack[s.stack.length - 1]!;
    s = act(s, { type: "passPriority", player: ap });
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, spike, [{ kind: "stack", id: item.id }]));
    while (!s.pending) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseOption", player: opp, choice: "1" });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}" });
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.players[opp]!.energy).toBe(1);
  });

  it("\"Choose target spell\" targets a spell only, not an ability (Aether Spike, Swallowed by Leviathan)", () => {
    const leviathan = card("Swallowed by Leviathan", "Instant", "{2}{U}", { cmc: 3, oracleText: "Choose target spell. Surveil 2, then counter the chosen spell unless its controller pays {1} for each card in your graveyard. (To surveil 2, look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)" });
    for (const d of [aetherSpike, leviathan]) {
      const t = compileCard(d).spell!.targets[0]!;
      expect(t.kind).toBe("spell");
      expect(t.kind === "spell" && t.stackAbilities).toBeFalsy();
    }
  });
});
const synthEradicator = card("Synth Eradicator", "Artifact Creature — Synth Soldier", "{2}{R}", {"cmc":3,"power":"3","toughness":"3","keywords":["Haste"],"oracleText":"Haste\nWhenever this creature attacks, exile the top card of your library. You may get {E}{E} (two energy counters). If you don't, you may play that card this turn.\n{T}, Pay {E}{E}{E}: This creature deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});

describe("exile the top card; you may get {E}{E}, if you don't you may play that card this turn (Synth Eradicator)", () => {
  it("compile", () => supported(synthEradicator));

  const start = () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const se = putOnBattlefield(s0, ap, synthEradicator);
    const top = into(s0, ap, card("Test Land", "Land"), "library");
    return { s0, ap, opp, se, top };
  };

  it("getting the energy: the card stays exiled without a permission", () => {
    const { s0, ap, opp, se, top } = start();
    let s = attack(s0, ap, opp, [se]);
    s = settle(s, { may: true });
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.players[ap]!.energy).toBe(2);
    expect(s.objects[top]!.mayPlay).toBeUndefined();
  });

  it("not getting it: the exiled card may be played this turn", () => {
    const { s0, ap, opp, se, top } = start();
    let s = attack(s0, ap, opp, [se]);
    s = settle(s, { may: false });
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.players[ap]!.energy ?? 0).toBe(0);
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    s = passUntil(s, "main2", ap);
    s = act(s, { type: "playLand", player: ap, objectId: top });
    expect(s.objects[top]!.zone).toBe("battlefield");
  });
});
const marinaVendrell = card("Marina Vendrell", "Legendary Creature — Human Warlock", "{W}{U}{B}{R}{G}", {"cmc":5,"power":"3","toughness":"5","keywords":[],"oracleText":"When Marina Vendrell enters, reveal the top seven cards of your library. Put all enchantment cards from among them into your hand and the rest on the bottom of your library in a random order.\n{T}: Lock or unlock a door of target Room you control. Activate only as a sorcery.","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"layout":"normal"});
const keysToTheHouse = card("Keys to the House", "Artifact", "{1}", {"cmc":1,"keywords":[],"oracleText":"{1}, {T}, Sacrifice this artifact: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.\n{3}, {T}, Sacrifice this artifact: Lock or unlock a door of target Room you control. Activate only as a sorcery.","colors":[],"colorIdentity":[],"layout":"normal"});

const ROOM_REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const bottomlessPool = scry("split", [
  { name: "Bottomless Pool", mana_cost: "{U}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, return up to one target creature to its owner's hand.${ROOM_REMINDER}` },
  { name: "Locker Room", mana_cost: "{4}{U}", type_line: "Enchantment — Room", oracle_text: `Whenever one or more creatures you control deal combat damage to a player, draw a card.${ROOM_REMINDER}` },
]);

describe("reveal seven, all enchantment cards from among them to your hand; lock or unlock a door (Marina Vendrell, Keys to the House)", () => {
  it("compile", () => supported(marinaVendrell, keysToTheHouse, bottomlessPool));

  it("Marina enters: every enchantment card among the top seven goes to your hand, the rest to the bottom", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const m = into(s0, ap, marinaVendrell, "hand");
    const ench = [into(s0, ap, card("Test Aura Thing", "Enchantment"), "library"), into(s0, ap, bottomlessPool, "library")];
    const other = into(s0, ap, bear(), "library");
    for (const c of ["W", "U", "B", "R", "G"] as const) s0.players[ap]!.manaPool[c] = 1;
    let s = settle(run(s0, planCast(s0, ap, m, [])));
    expect(ench.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    expect(s.objects[other]!.zone).toBe("library");
    expect(s.players[ap]!.hand.length).toBe(2);
    const lib = s.players[ap]!.library;
    expect(lib.indexOf(other)).toBeGreaterThanOrEqual(lib.length - 5);
  });

  const withRoom = (unlocked: number[]) => {
    const { s, ap, opp } = setup([]);
    const room = putOnBattlefield(s, ap, bottomlessPool);
    s.objects[room]!.unlocked = unlocked;
    invalidateCharacteristics(s);
    const m = putOnBattlefield(s, ap, marinaVendrell);
    return { s, ap, opp, room, m };
  };

  it("unlocking Locker Room: chosen from both doors; the door's unlock is a real unlock", () => {
    const { s: s0, ap, room, m } = withRoom([0]);
    let s = run(s0, planActivate(s0, ap, m, 0, [tgt(room)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "unlockDoor", options: [`${room}:1`, `${room}:0`], labels: ["Unlock Locker Room", "Lock Bottomless Pool"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: `${room}:1` }));
    expect(s.objects[room]!.unlocked).toEqual([0, 1]);
  });

  it("locking Bottomless Pool, then unlocking it again triggers its unlock ability", () => {
    const { s: s0, ap, opp, room, m } = withRoom([0]);
    let s = run(s0, planActivate(s0, ap, m, 0, [tgt(room)]));
    s = settle(act(settle(s), { type: "chooseOption", player: ap, choice: `${room}:0` }));
    expect(s.objects[room]!.unlocked).toEqual([]);
    expect(characteristics(s, s.objects[room]!).name).toBe("");
    // Next turn: unlock it with Marina again; "when you unlock this door" triggers (CR 709.5h).
    const b = putOnBattlefield(s, opp, bear());
    s.objects[m]!.tapped = false;
    s = run(s, planActivate(s, ap, m, 0, [tgt(room)]));
    s = settle(s);
    s = act(s, { type: "chooseOption", player: ap, choice: `${room}:0` });
    s = settle(s, { targets: [tgt(b)] });
    expect(s.objects[room]!.unlocked).toEqual([0]);
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("Keys to the House: {3}, {T}, sacrifice: lock or unlock a door, at sorcery speed", () => {
    const { s: s0, ap, room } = withRoom([]);
    const k = putOnBattlefield(s0, ap, keysToTheHouse);
    s0.players[ap]!.manaPool.C = 3;
    let s = run(s0, planActivate(s0, ap, k, 1, [tgt(room)]));
    expect(s.objects[k]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "unlockDoor", labels: ["Unlock Bottomless Pool", "Unlock Locker Room"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: `${room}:1` }));
    expect(s.objects[room]!.unlocked).toEqual([1]);
  });
});
const trepanationBlade = card("Trepanation Blade", "Artifact — Equipment", "{3}", {"cmc":3,"keywords":["Equip"],"oracleText":"Whenever equipped creature attacks, defending player reveals cards from the top of their library until they reveal a land card. The creature gets +1/+0 until end of turn for each card revealed this way. That player puts the revealed cards into their graveyard.\nEquip {2}","colors":[],"colorIdentity":[],"layout":"normal"});

describe("defending player reveals until a land card; +1/+0 for each card revealed, then they go to the graveyard (Trepanation Blade)", () => {
  it("compile", () => supported(trepanationBlade));

  it("two nonland cards and the land: +3/+0 until end of turn, all three into that player's graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const blade = putOnBattlefield(s0, ap, trepanationBlade);
    s0.objects[blade]!.attachedTo = b;
    const land = into(s0, opp, card("Test Land", "Land"), "library");
    const two = [into(s0, opp, bear({ name: "Bear One" }), "library"), into(s0, opp, rock(), "library")];
    invalidateCharacteristics(s0);
    let s = attack(s0, ap, opp, [b]);
    s = settle(s);
    expect([land, ...two].every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(power(s, s.objects[b]!)).toBe(5);
    expect(s.players[opp]!.library.length).toBeGreaterThan(0);
  });

  it("a land on top: +1/+0", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const blade = putOnBattlefield(s0, ap, trepanationBlade);
    s0.objects[blade]!.attachedTo = b;
    const land = into(s0, opp, card("Test Land", "Land"), "library");
    invalidateCharacteristics(s0);
    let s = settle(attack(s0, ap, opp, [b]));
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(power(s, s.objects[b]!)).toBe(3);
  });
});
const revivify = card("Revivify", "Instant", "{2}{W}", {"cmc":3,"keywords":[],"oracleText":"Roll a d20 and add the number of creature cards in your graveyard that were put there from the battlefield this turn.\n1—14 | Return all creature cards in your graveyard that were put there from the battlefield this turn to your hand.\n15+ | Return those cards from your graveyard to the battlefield.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});

/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}

describe("roll a d20 and add the creature cards put into your graveyard from the battlefield this turn (Revivify)", () => {
  it("compile", () => supported(revivify));

  const start = (roll: number) => {
    const { s, ap, opp } = setup([]);
    const died = [putOnBattlefield(s, ap, bear({ name: "Bear One" })), putOnBattlefield(s, ap, bear({ name: "Bear Two" }))];
    for (const id of died) destroyPermanent(s, s.objects[id]!, "test");
    const old = into(s, ap, bear({ name: "Old Bear" }), "graveyard");
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    destroyPermanent(s, s.objects[theirs]!, "test");
    const r = into(s, ap, revivify, "hand");
    s.players[ap]!.manaPool.W = 1;
    s.players[ap]!.manaPool.C = 2;
    rig(s, 20, [roll]);
    return { s, ap, opp, died, old, theirs, r };
  };

  it("12 + 2 = 14: those two cards return to your hand, not the older one or another player's", () => {
    const { s: s0, ap, died, old, theirs, r } = start(12);
    const s = settle(run(s0, planCast(s0, ap, r, [])));
    expect(died.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    expect(s.objects[old]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("13 + 2 = 15: they return to the battlefield", () => {
    const { s: s0, ap, died, old, r } = start(13);
    const s = settle(run(s0, planCast(s0, ap, r, [])));
    expect(died.every((id) => s.objects[id]!.zone === "battlefield")).toBe(true);
    expect(s.objects[old]!.zone).toBe("graveyard");
  });
});
const opportunisticDragon = card("Opportunistic Dragon", "Creature — Dragon", "{2}{R}{R}", {"cmc":4,"power":"4","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, choose target Human or artifact an opponent controls. For as long as this creature remains on the battlefield, gain control of that permanent, it loses all abilities, and it can't attack or block.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});

describe("for as long as ~ remains on the battlefield, gain control of that permanent, it loses all abilities and can't attack or block (Opportunistic Dragon)", () => {
  it("compile", () => supported(opportunisticDragon));

  const start = () => {
    const { s, ap, opp } = setup([]);
    const human = putOnBattlefield(s, opp, card("Test Knight", "Creature — Human Knight", "{1}{W}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" }));
    const d = into(s, ap, opportunisticDragon, "hand");
    s.players[ap]!.manaPool.R = 2;
    s.players[ap]!.manaPool.C = 2;
    return { s, ap, opp, human, d };
  };

  it("takes the Human: yours, no abilities, can't attack or block; back to its owner once the Dragon leaves", () => {
    const { s: s0, ap, opp, human, d } = start();
    let s = settle(run(s0, planCast(s0, ap, d, [])), { targets: [tgt(human)] });
    const h = s.objects[human]!;
    expect(controllerOf(s, h)).toBe(ap);
    expect(objHasKeyword(s, h, "Flying")).toBe(false);
    h.enteredTurn = 0;
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: human, defender: opp }] })).toThrow();
    destroyPermanent(s, s.objects[d]!, "test");
    invalidateCharacteristics(s);
    expect(controllerOf(s, s.objects[human]!)).toBe(opp);
    expect(objHasKeyword(s, s.objects[human]!, "Flying")).toBe(true);
  });

  it("gone before the trigger resolves: nothing happens", () => {
    const { s: s0, ap, opp, human, d } = start();
    let s = run(s0, planCast(s0, ap, d, []));
    while (s.stack.length && s.objects[d]!.zone !== "battlefield") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(human)] });
    destroyPermanent(s, s.objects[d]!, "test");
    s = settle(s);
    expect(controllerOf(s, s.objects[human]!)).toBe(opp);
    expect(objHasKeyword(s, s.objects[human]!, "Flying")).toBe(true);
  });
});
const voloGuideToMonsters = card("Volo, Guide to Monsters", "Legendary Creature — Human Wizard", "{2}{G}{U}", {"cmc":4,"power":"3","toughness":"2","keywords":[],"oracleText":"Whenever you cast a creature spell that doesn't share a creature type with a creature you control or a creature card in your graveyard, copy that spell. (A copy of a creature spell becomes a token.)","colors":["G","U"],"colorIdentity":["G","U"],"layout":"normal"});

describe("copy a creature spell that doesn't share a creature type with your creatures or creature cards in your graveyard (Volo, Guide to Monsters)", () => {
  it("compile", () => supported(voloGuideToMonsters));

  const castBear = (s: GameState, ap: PlayerId, name: string) => {
    const b = into(s, ap, bear({ name }), "hand");
    s.players[ap]!.manaPool.G = 2;
    return settle(run(s, planCast(s, ap, b, [])));
  };
  const bears = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).subtypes.includes("Bear")).length;

  it("the first Bear is copied (the copy is a token); the next Bear shares a type with it and isn't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, voloGuideToMonsters);
    let s = castBear(s0, ap, "Bear One");
    expect(bears(s, ap)).toBe(2);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(true);
    s = castBear(s, ap, "Bear Two");
    expect(bears(s, ap)).toBe(3);
  });

  it("a Bear card in your graveyard is enough to stop it; a Wizard is never copied (Volo is one)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, voloGuideToMonsters);
    into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    let s = castBear(s0, ap, "Bear One");
    expect(bears(s, ap)).toBe(1);
    const w = into(s, ap, card("Test Wizard", "Creature — Elf Wizard", "{1}{U}", { power: "1", toughness: "1" }), "hand");
    s.players[ap]!.manaPool.U = 2;
    s = settle(run(s, planCast(s, ap, w, [])));
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Wizard").length).toBe(1);
  });
});
const confoundingConundrum = card("Confounding Conundrum", "Enchantment", "{1}{U}", {"cmc":2,"keywords":[],"oracleText":"When this enchantment enters, draw a card.\nWhenever a land an opponent controls enters, if that player had another land enter the battlefield under their control this turn, they return a land they control to its owner's hand.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});

describe("whenever a land an opponent controls enters, if they had another land enter this turn, they return a land (Confounding Conundrum)", () => {
  it("compile", () => supported(confoundingConundrum));

  it("the first land of the turn: nothing; the second: that player returns a land they control of their choice", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, confoundingConundrum);
    let s = passUntil(s0, "main1", opp);
    const old = putOnBattlefield(s, opp, card("Old Land", "Land"));
    const l1 = into(s, opp, card("Land One", "Land"), "hand");
    const l2 = into(s, opp, card("Land Two", "Land"), "hand");
    s = act(s, { type: "playLand", player: opp, objectId: l1 });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s.players[opp]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: opp, objectId: l2 });
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The player may return any land they control, not just one that entered this turn (rulings).
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "bounce", count: 1 });
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [old] }));
    expect(s.objects[old]!.zone).toBe("hand");
    expect(s.objects[l1]!.zone).toBe("battlefield");
    expect(s.objects[l2]!.zone).toBe("battlefield");
  });

  it("its own controller's lands don't trigger it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, confoundingConundrum);
    const l1 = into(s0, ap, card("Land One", "Land"), "hand");
    const l2 = into(s0, ap, card("Land Two", "Land"), "hand");
    let s = act(s0, { type: "playLand", player: ap, objectId: l1 });
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: l2 });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });
});
const ursineMonstrosity = card("Ursine Monstrosity", "Creature — Bear Mutant", "{2}{G}", {"cmc":3,"power":"3","toughness":"3","keywords":["Trample","Mill"],"oracleText":"Trample\nAt the beginning of combat on your turn, mill a card and choose an opponent at random. This creature attacks that player this combat if able. Until end of turn, this creature gains indestructible and gets +1/+1 for each card type among cards in your graveyard.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});

describe("mill a card and choose an opponent at random; attacks that player; indestructible and +1/+1 per card type in your graveyard (Ursine Monstrosity)", () => {
  it("compile", () => supported(ursineMonstrosity));

  it("mills an artifact creature: +2/+2 and indestructible; it must attack the chosen opponent", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const u = putOnBattlefield(s0, ap, ursineMonstrosity);
    into(s0, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }), "library");
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s);
    expect(power(s, s.objects[u]!)).toBe(5);
    expect(objHasKeyword(s, s.objects[u]!, "Indestructible")).toBe(true);
    s = passUntil(s, "declareAttackers", ap);
    const others = s.turnOrder.filter((p) => p !== ap);
    const legal = others.filter((p) => {
      try {
        act(structuredClone(s), { type: "declareAttackers", player: ap, attacks: [{ attacker: u, defender: p }] });
        return true;
      } catch {
        return false;
      }
    });
    expect(legal.length).toBe(1);
    expect(() => act(structuredClone(s), { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
  });
});
const loamcrafterFaun = card("Loamcrafter Faun", "Creature — Satyr Druid", "{2}{G}", {"cmc":3,"power":"3","toughness":"3","keywords":[],"oracleText":"When this creature enters, you may discard one or more land cards. When you do, return up to that many target nonland permanent cards from your graveyard to your hand.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});

describe("you may discard one or more land cards; when you do, return up to that many nonland permanent cards (Loamcrafter Faun)", () => {
  it("compile", () => supported(loamcrafterFaun));

  it("two lands discarded: up to two targets, returned to your hand", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const f = into(s0, ap, loamcrafterFaun, "hand");
    const lands = [into(s0, ap, card("Land One", "Land"), "hand"), into(s0, ap, card("Land Two", "Land"), "hand")];
    const spell = into(s0, ap, card("Test Spell", "Sorcery", "{1}"), "hand");
    const yard = [into(s0, ap, bear({ name: "Dead One" }), "graveyard"), into(s0, ap, rock(), "graveyard"), into(s0, ap, bear({ name: "Dead Two" }), "graveyard")];
    s0.players[ap]!.manaPool.G = 3;
    let s = run(s0, planCast(s0, ap, f, []));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2, upTo: true });
    // Only land cards (CR 701.9).
    expect(() => act(s, { type: "discard", player: ap, objectIds: [spell] })).toThrow();
    s = act(s, { type: "discard", player: ap, objectIds: lands });
    s = settle(s, { targets: [tgt(yard[0]!), tgt(yard[1]!)] });
    expect(lands.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(s.objects[yard[0]!]!.zone).toBe("hand");
    expect(s.objects[yard[1]!]!.zone).toBe("hand");
    expect(s.objects[yard[2]!]!.zone).toBe("graveyard");
  });
});
const sidequestCatchAFish = scry("transform", [{"name":"Sidequest: Catch a Fish","mana_cost":"{2}{W}","type_line":"Enchantment","oracle_text":"At the beginning of your upkeep, look at the top card of your library. If it's an artifact or creature card, you may reveal it and put it into your hand. If you put a card into your hand this way, create a Food token and transform this enchantment."},{"name":"Cooking Campsite","mana_cost":"","type_line":"Land","oracle_text":"{T}: Add {W}.\n{3}, {T}, Sacrifice an artifact: Put a +1/+1 counter on each creature you control. Activate only as a sorcery."}], { keywords: ["Transform","Food"], color_identity: ["W"] });

describe("look at the top card; an artifact or creature card may go to your hand, then a Food and transform (Sidequest: Catch a Fish)", () => {
  it("compile", () => supported(sidequestCatchAFish));

  const upkeep = (top: CardDef, may: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const q = putOnBattlefield(s0, ap, sidequestCatchAFish);
    let s = passUntil(s0, "end", ap);
    const t = into(s, ap, top, "library");
    s = passUntil(s, "upkeep", ap);
    // The next turn may be another player's: go round to ours.
    while (s.activePlayer !== ap || s.step !== "upkeep") s = passUntil(s, "upkeep");
    s = settle(s, { may });
    return { s, ap, opp, q, t };
  };
  const foods = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).subtypes.includes("Food")).length;

  it("a creature card put into your hand: a Food token, and it transforms into Cooking Campsite", () => {
    const { s, ap, q, t } = upkeep(bear(), true);
    expect(s.objects[t]!.zone).toBe("hand");
    expect(foods(s, ap)).toBe(1);
    expect(characteristics(s, s.objects[q]!).name).toBe("Cooking Campsite");
  });

  it("not taking it, or a land on top: no Food, no transform", () => {
    const a = upkeep(bear(), false);
    expect(a.s.objects[a.t]!.zone).toBe("library");
    expect(foods(a.s, a.ap)).toBe(0);
    expect(characteristics(a.s, a.s.objects[a.q]!).name).toBe("Sidequest: Catch a Fish");
    const b = upkeep(card("Test Land", "Land"), true);
    expect(b.s.objects[b.t]!.zone).toBe("library");
    expect(foods(b.s, b.ap)).toBe(0);
  });
});
const advancedReconstruction = card("Advanced Reconstruction", "Enchantment — Class", "{3}{R}", {"cmc":4,"keywords":["Mill"],"oracleText":"(Gain the next level as a sorcery to add its ability.)\nAt the beginning of your first main phase, mill a card, then exile a card from your graveyard at random. You may play the exiled card this turn.\n{1}{R}: Level 2\nWhenever one or more cards leave your graveyard, this Class deals 2 damage to each opponent.\n{1}{R}: Level 3\nSpells you cast from anywhere other than your hand cost {2} less to cast.","colors":["R"],"colorIdentity":["R"],"layout":"class"});

describe("mill a card, then exile a card from your graveyard at random; you may play it this turn (Advanced Reconstruction)", () => {
  it("compile", () => supported(advancedReconstruction));

  it("the milled card is the only one: exiled, and playable this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, advancedReconstruction);
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    const t = into(s, ap, card("Test Land", "Land"), "library");
    into(s, ap, bear({ name: "Drawn Bear" }), "library");
    // An empty graveyard (cleanup discards went there).
    for (const id of s.players[ap]!.graveyard.splice(0)) {
      s.objects[id]!.zone = "exile";
      s.players[ap]!.exile.push(id);
    }
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("exile");
    expect(s.objects[t]!.mayPlay).toMatchObject({ player: ap });
    s = act(s, { type: "playLand", player: ap, objectId: t });
    expect(s.objects[t]!.zone).toBe("battlefield");
  });
});
