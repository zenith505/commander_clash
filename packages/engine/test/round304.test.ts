// Round 304 (Lane A, skip-list cards): Green Sun's Twilight (a creature card and/or a land card, onto the battlefield or
// into your hand with X 5 or more).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { abilitiesOf, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Puts these cards on top of the library, the first one on top. */
const stackTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => into(s, pid, d, "library")).reverse();
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

const gst = (): CardDef => ({"oracleId":"0221330a-3e7a-40aa-9c78-85c88a4c1a53","name":"Green Sun's Twilight","manaCost":"{X}{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top X plus one cards of your library. Choose a creature card and/or a land card from among them. Put those cards into your hand and the rest on the bottom of your library in a random order. If X is 5 or more, instead put the chosen cards onto the battlefield or into your hand and the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"});
const sorcery = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("round 304: Green Sun's Twilight", () => {
  it("is supported", () => supported(gst()));

  it("X below 5: a creature card and a land card into your hand, at least one, the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([gst()]);
    const top = stackTop(s0, ap, [sorcery, bear({ name: "A" }), forest]);
    const fourth = s0.players[ap]!.library[3]!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 2)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 2 });
    // Not two creature cards, and not the sorcery.
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [top[0]!] })).toThrow();
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!, top[2]!] }), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([top[1]!, top[2]!]));
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(fourth);
    expect(lib[lib.length - 1]).toBe(top[0]!);
  });

  it("only one of them is fine, and none when none matches", () => {
    const { s: s0, ap, ids } = setup([gst(), gst()]);
    const top = stackTop(s0, ap, [bear({ name: "A" }), forest]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 1)), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!] }), ap);
    expect(s.players[ap]!.hand).toContain(top[1]!);
    expect(s.objects[top[0]!]!.zone).toBe("library");
    // Two sorceries on top, X 1: nothing to choose.
    stackTop(s, ap, [sorcery, sorcery]);
    const before = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [], undefined, undefined, 1)), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand).toHaveLength(before - 1);
  });

  it("X 5 or more: both onto the battlefield, or both into your hand (rulings)", () => {
    const { s: s0, ap, ids } = setup([gst(), gst()]);
    s0.players[ap]!.manaPool.G = 12;
    const top = stackTop(s0, ap, [sorcery, bear({ name: "A" }), sorcery, sorcery, forest, sorcery]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 5)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!, top[4]!] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), ap);
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
    expect(s.objects[top[4]!]!.zone).toBe("battlefield");
    expect(s.objects[top[4]!]!.tapped).toBeFalsy();
    // The other way: both into the hand.
    const top2 = stackTop(s, ap, [bear({ name: "B" }), forest, sorcery, sorcery, sorcery, sorcery]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [], undefined, undefined, 5)), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top2[0]!, top2[1]!] }), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }), ap);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([top2[0]!, top2[1]!]));
    expect(s.pending).toBeNull();
  });

  it("a bot puts what it chose onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([gst()]);
    s0.players[ap]!.manaPool.G = 12;
    const top = stackTop(s0, ap, [bear({ name: "A" }), forest, sorcery, sorcery, sorcery, sorcery]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 5));
    s = settle(s, -1 as PlayerId);
    for (let i = 0; i < 20 && s.pending; i++) s = settle(act(s, botActions(s, s.pending.player)[0]!), -1 as PlayerId);
    expect(s.objects[top[0]!]!.zone).toBe("battlefield");
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
  });
});

const rst = (): CardDef => ({"oracleId":"21c77cdb-9ba1-4621-b096-7eb94c076cef","name":"Red Sun's Twilight","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy up to X target artifacts. If X is 5 or more, for each artifact destroyed this way, create a token that's a copy of it. Those tokens gain haste. Exile them at the beginning of the next end step.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"});
const relic = card("Iron Relic", "Artifact", "{2}", { oracleText: "" });
const golem = card("Iron Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3", oracleText: "" });

describe("round 304: Red Sun's Twilight", () => {
  it("is supported", () => supported(rst()));

  it("X below 5: destroys up to X target artifacts, no copies", () => {
    const { s: s0, ap, ids, opp } = setup([rst()]);
    const a = putOnBattlefield(s0, opp, relic);
    const b = putOnBattlefield(s0, opp, golem);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)], undefined, undefined, 2)), ap);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
  });

  it("X 5 or more: a hasty token copy of each artifact destroyed, exiled at the next end step; none for one that wasn't", () => {
    const { s: s0, ap, ids, opp } = setup([rst()]);
    s0.players[ap]!.manaPool.R = 10;
    const a = putOnBattlefield(s0, opp, relic);
    const b = putOnBattlefield(s0, opp, golem);
    const c = putOnBattlefield(s0, opp, card("Darksteel Relic", "Artifact", "{0}", { oracleText: "Indestructible", keywords: ["Indestructible"] }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), tgt(c)], undefined, undefined, 5)), ap);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("battlefield");
    const tokens = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.isToken);
    expect(tokens.map((o) => characteristics(s, o).name).sort()).toEqual(["Iron Golem", "Iron Relic"]);
    for (const o of tokens) {
      expect(controllerOf(s, o)).toBe(ap);
      expect(characteristics(s, o).keywords).toContain("Haste");
    }
    s = passUntil(s, "end");
    s = settle(s, -1 as PlayerId);
    for (const o of tokens) expect(s.objects[o.id]?.zone === "battlefield").toBe(false);
  });
});

const powerSink = (): CardDef => ({"oracleId":"39412e6d-2837-4729-abf9-e64a5ba87e40","name":"Power Sink","manaCost":"{X}{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell unless its controller pays {X}. If that player doesn't, they tap all lands with mana abilities they control and lose all unspent mana.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"});
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const sureThing = card("Sure Thing", "Sorcery", "{2}{U}", { oracleText: "This spell can't be countered.\nDraw two cards." });
const barren = card("Barren Moor Test", "Land", "", { oracleText: "" });

describe("round 304: Power Sink", () => {
  it("is supported", () => supported(powerSink()));

  const cast = (first: CardDef) => {
    const { s: s0, ap, ids } = setup([first, powerSink()]);
    const noMana = putOnBattlefield(s0, ap, barren);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack[0]!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell }], undefined, undefined, 2));
    s = settle(s, ap);
    return { s, ap, ids, noMana };
  };
  const lands = (s: GameState, ap: PlayerId) => s.battlefield.map((id) => s.objects[id]!).filter((o) => o.controller === ap && characteristics(s, o).types.includes("Land"));

  it("not paid: the spell is countered, and its controller taps every land with a mana ability and loses unspent mana", () => {
    let { s, ap, ids, noMana } = cast(divination);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s.players[ap]!.manaPool.R = 1;
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(lands(s, ap).filter((o) => o.id !== noMana).every((o) => o.tapped)).toBe(true);
    expect(s.objects[noMana]!.tapped).toBeFalsy();
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
  });

  it("paid: the spell resolves and nothing else happens", () => {
    let { s, ap, ids } = cast(divination);
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(lands(s, ap).filter((o) => o.tapped)).toHaveLength(6);
  });

  it("a spell that can't be countered: its controller is still asked, and not paying still taps the lands", () => {
    let { s, ap, ids } = cast(sureThing);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }), ap);
    expect(s.log.some((l) => /can't be countered/.test(typeof l === "string" ? l : l.text))).toBe(true);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(lands(s, ap).filter((o) => !o.tapped).map((o) => characteristics(s, o).name)).toEqual(["Barren Moor Test"]);
  });
});

const bioshift = (): CardDef => ({"oracleId":"3da604fc-68e9-4749-98f9-6fbcebcab9b6","name":"Bioshift","manaCost":"{G/U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Move any number of +1/+1 counters from target creature onto another target creature with the same controller.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"layout":"normal"});

describe("round 304: Bioshift", () => {
  it("is supported", () => supported(bioshift()));

  it("moves as many +1/+1 counters as you choose, one at a time, from one creature onto another with the same controller", () => {
    const { s: s0, ap, ids, opp } = setup([bioshift()]);
    const a = putOnBattlefield(s0, ap, bear({ name: "A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "B" }));
    const c = putOnBattlefield(s0, opp, bear({ name: "C" }));
    s0.objects[a]!.counters["+1/+1"] = 3;
    s0.objects[a]!.counters.charge = 1;
    invalidateCharacteristics(s0);
    // Not a creature another player controls.
    expect(planCast(s0, ap, ids[0]!, [tgt(a), tgt(c)])).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter", options: ["+1/+1", "done"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1" }), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1" }), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "done" }), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[a]!.counters.charge).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("controlled by different players as it resolves: no counters move (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([bioshift()]);
    const a = putOnBattlefield(s0, ap, bear({ name: "A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "B" }));
    s0.objects[a]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)]));
    s.objects[b]!.controller = opp;
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(s.pending).toBeNull();
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

const scion = (): CardDef => ({"oracleId":"b4031540-584b-4c8a-9e4e-d68ae5cdec5b","name":"Scion of the Ur-Dragon","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Dragon Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon","Avatar"],"oracleText":"Flying\n{2}: Search your library for a Dragon permanent card and put it into your graveyard. If you do, Scion of the Ur-Dragon becomes a copy of that card until end of turn. Then shuffle.","power":"4","toughness":"4","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Flying"],"layout":"normal"});
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"});

describe("round 304: Scion of the Ur-Dragon", () => {
  it("is supported", () => supported(scion()));

  it("puts the Dragon card it finds into your graveyard and becomes a copy of it until end of turn, then shuffles", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, scion());
    const dragon = into(s0, ap, shivan(), "library");
    s0.players[ap]!.manaPool.C = 2;
    let s = run(s0, planActivate(s0, ap, me, 0));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dragon] }), ap);
    expect(s.objects[dragon]!.zone).toBe("graveyard");
    expect(characteristics(s, s.objects[me]!)).toMatchObject({ name: "Shivan Dragon", power: 5, toughness: 5 });
    // Removing the Dragon card from the graveyard changes nothing (rulings).
    moveObject(s, dragon, "exile");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[me]!).name).toBe("Shivan Dragon");
    // A copy of Shivan Dragon has its abilities, not the copy ability (rulings).
    expect(abilitiesOf(s, s.objects[me]!).activated.some((a) => /Search your library/.test(a.text))).toBe(false);
    s = passUntil(s, "cleanup");
    s = settle(s, -1 as PlayerId);
    expect(characteristics(s, s.objects[me]!).name).toBe("Scion of the Ur-Dragon");
  });

  it("no Dragon found: no copy", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, scion());
    s0.players[ap]!.manaPool.C = 2;
    let s = settle(run(s0, planActivate(s0, ap, me, 0)), ap);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(s.pending).toBeNull();
    expect(characteristics(s, s.objects[me]!).name).toBe("Scion of the Ur-Dragon");
  });
});

const signal = (): CardDef => ({"oracleId":"fd68ae3c-52cd-4b20-b015-bd31378d972e","name":"Signal the Clans","manaCost":"{R}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Search your library for three creature cards and reveal them. If you reveal three cards with different names, choose one of them at random and put that card into your hand. Shuffle the rest into your library.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"layout":"normal"});

describe("round 304: Signal the Clans", () => {
  it("is supported", () => supported(signal()));

  it("three creature cards with different names: one of them at random into your hand, the others shuffled back", () => {
    const { s: s0, ap, ids } = setup([signal()]);
    const found = [bear({ name: "A" }), bear({ name: "B" }), bear({ name: "C" })].map((d) => into(s0, ap, d, "library"));
    const libSize = s0.players[ap]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 3 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found }), ap);
    const inHand = found.filter((id) => s.objects[id]!.zone === "hand");
    expect(inHand).toHaveLength(1);
    expect(found.filter((id) => s.objects[id]!.zone === "library")).toHaveLength(2);
    expect(s.players[ap]!.library).toHaveLength(libSize - 1);
    expect(s.log.some((l) => /is chosen at random/.test(typeof l === "string" ? l : l.text))).toBe(true);
  });

  it("a bot finds cards with different names", () => {
    const { s: s0, ap, ids } = setup([signal()]);
    const found = [bear({ name: "A" }), bear({ name: "B" }), bear({ name: "C" })].map((d) => into(s0, ap, d, "library"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.players[ap]!.hand.filter((id) => found.includes(id))).toHaveLength(1);
  });

  it("two with the same name, or fewer than three: nothing into your hand (rulings)", () => {
    const { s: s0, ap, ids } = setup([signal(), signal()]);
    const a = into(s0, ap, bear({ name: "A" }), "library");
    const lib = s0.players[ap]!.library;
    const bears = lib.filter((id) => s0.objects[id]!.cardId && characteristics(s0, s0.objects[id]!).name === "Grizzly Bears").slice(0, 2);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a, ...bears] }), ap);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[a]!.zone).toBe("library");
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a] }), ap);
    expect(s.objects[a]!.zone).toBe("library");
  });
});

const invokeJustice = (): CardDef => ({"oracleId":"3e5cd60f-8fef-4152-a957-0a803997b3da","name":"Invoke Justice","manaCost":"{1}{W}{W}{W}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target permanent card from your graveyard to the battlefield, then distribute four +1/+1 counters among any number of creatures and/or Vehicles target player controls.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"});
const vehicle = card("Test Wagon", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1" });

describe("round 304: Invoke Justice", () => {
  it("is supported", () => supported(invokeJustice()));

  it("returns the card, then four +1/+1 counters among that player's creatures and Vehicles, the returned one included (rulings)", () => {
    const { s: s0, ap, ids } = setup([invokeJustice()]);
    s0.players[ap]!.manaPool.W = 5;
    const back = into(s0, ap, bear({ name: "Back" }), "graveyard");
    const other = putOnBattlefield(s0, ap, bear({ name: "Other" }));
    const wagon = putOnBattlefield(s0, ap, vehicle);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(back), { kind: "player", id: ap }])), ap);
    expect(s.objects[back]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "distribute", player: ap, total: 4 });
    const opts = s.pending?.kind === "distribute" ? s.pending.options : [];
    expect(opts).toEqual(expect.arrayContaining([back, other, wagon]));
    s = settle(act(s, { type: "distribute", player: ap, parts: { [back]: 2, [other]: 1, [wagon]: 1 } }), ap);
    expect(s.objects[back]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[wagon]!.counters["+1/+1"]).toBe(1);
  });

  it("another target player: only the permanents that player controls", () => {
    const { s: s0, ap, ids, opp } = setup([invokeJustice()]);
    s0.players[ap]!.manaPool.W = 5;
    const back = into(s0, ap, relic, "graveyard");
    const mine = putOnBattlefield(s0, ap, bear({ name: "Mine" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Theirs" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(back), { kind: "player", id: opp }])), ap);
    // One choice only: all four on it.
    expect(s.pending).toBeNull();
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

const exterminate = (): CardDef => ({"oracleId":"90b540ab-b05a-4d29-b896-7ff5da0b101d","name":"Exterminate!","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Replicate—Tap an untapped Dalek you control. (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)\nDestroy target creature. Its controller loses 3 life.","colors":["B"],"colorIdentity":["B"],"keywords":["Replicate"],"layout":"normal"});
const psionic = (): CardDef => ({"oracleId":"1c3e6980-97fe-4e15-93a0-368280da8608","name":"Psionic Ritual","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Replicate—Tap an untapped Horror you control. (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)\nExile target instant or sorcery card from a graveyard and copy it. You may cast the copy without paying its mana cost.\nExile Psionic Ritual.","colors":["U"],"colorIdentity":["U"],"keywords":["Replicate"],"layout":"normal"});
const bolt = (): CardDef => ({"oracleId":"371da0d8-3845-458e-9b0a-6477017b890e","name":"Reiterating Bolt","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Replicate—Pay {E}{E}{E}. (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)\nReiterating Bolt deals 3 damage to target creature or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":["Replicate"],"layout":"normal"});
const dalek = (name: string) => card(name, "Artifact Creature — Dalek", "{2}", { power: "2", toughness: "2", oracleText: "" });

describe("round 304: replicate by tapping a creature (Exterminate!, Psionic Ritual)", () => {
  it("is supported", () => supported(exterminate(), psionic(), bolt()));

  it("Reiterating Bolt: replicate paid in energy, three for each time (CR 107.14)", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    s0.players[ap]!.energy = 7;
    const v = [bear({ name: "V1" }), bear({ name: "V2" }), bear({ name: "V3" })].map((d) => putOnBattlefield(s0, opp, d));
    expect(planCast(s0, ap, ids[0]!, [tgt(v[0]!)], undefined, undefined, undefined, { kicks: [0, 0, 0] })).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(v[0]!)], undefined, undefined, undefined, { kicks: [0, 0] }));
    expect(s.players[ap]!.energy).toBe(1);
    for (let i = 0; i < 30 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "copyTargets" && p.player === ap) {
        const next = v.find((x) => s.objects[x]!.zone === "battlefield" && !s.stack.some((it) => (it.targets ?? []).some((t) => t.kind === "object" && t.id === x)))!;
        s = act(s, { type: "copyTargets", player: ap, targets: [tgt(next)] });
      } else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    for (const x of v) expect(s.objects[x]!.zone).toBe("graveyard");
  });

  it("paid twice: two untapped Daleks tapped, summoning sick ones too (no {T} symbol, CR 302.6), and two copies", () => {
    const { s: s0, ap, ids, opp } = setup([exterminate()]);
    const d1 = putOnBattlefield(s0, ap, dalek("Dalek One"), { sick: true });
    const d2 = putOnBattlefield(s0, ap, dalek("Dalek Two"));
    const victims = [bear({ name: "V1" }), bear({ name: "V2" }), bear({ name: "V3" })].map((d) => putOnBattlefield(s0, opp, d));
    // Three times needs three Daleks.
    expect(planCast(s0, ap, ids[0]!, [tgt(victims[0]!)], undefined, undefined, undefined, { kicks: [0, 0, 0], tap: [d1, d2] })).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(victims[0]!)], undefined, undefined, undefined, { kicks: [0, 0], tap: [d1, d2] }));
    expect(s.objects[d1]!.tapped).toBe(true);
    expect(s.objects[d2]!.tapped).toBe(true);
    const life = s.players[opp]!.life;
    // The copies' new targets.
    for (let i = 0; i < 30 && s.stack.length; i++) {
      const p = s.pending;
      if (p?.kind === "copyTargets" && p.player === ap) {
        const next = victims.find((v) => s.objects[v]!.zone === "battlefield" && !s.stack.some((it) => (it.targets ?? []).some((t) => t.kind === "object" && t.id === v)))!;
        s = act(s, { type: "copyTargets", player: ap, targets: [tgt(next)] });
      } else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    for (const v of victims) expect(s.objects[v]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 9);
  });

  it("Psionic Ritual: a Horror tapped once copies it, each copy exiling and copying another card", () => {
    const { s: s0, ap, ids } = setup([psionic()]);
    s0.players[ap]!.manaPool.U = 6;
    const horror = putOnBattlefield(s0, ap, card("Test Horror", "Creature — Horror", "{1}", { power: "1", toughness: "1", oracleText: "" }));
    const a = into(s0, ap, divination, "graveyard");
    const b = into(s0, ap, divination, "graveyard");
    const plan = planCast(s0, ap, ids[0]!, [tgt(a)], undefined, undefined, undefined, { kicks: [0], tap: [horror] });
    expect(plan).not.toBeNull();
    let s = run(s0, plan);
    expect(s.objects[horror]!.tapped).toBe(true);
    const hand = s.players[ap]!.hand.length;
    const seen: string[] = [];
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p) seen.push(p.kind);
      if (p?.kind === "copyTargets" && p.player === ap) s = act(s, { type: "copyTargets", player: ap, targets: [tgt(b)] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(seen).toContain("copyTargets");
    // Both cards exiled, each copy cast: four cards drawn.
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});
