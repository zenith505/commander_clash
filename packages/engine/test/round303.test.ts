// Round 303 (Lane A, skip-list cards): Bounty of Skemfar (a land and an Elf card from the same revealed cards).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject, spellCost } from "../src/game";
import { manaValue } from "../src/mana";
import { abilitiesOf, applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Everyone passes until the stack is empty, answering "you may" with `may`; other players' questions as the bots would. Stops at any other question of `me`'s. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

const bounty = (): CardDef => ({"oracleId":"e4bfe005-7c4e-4178-ae41-a28eb2352ad1","name":"Bounty of Skemfar","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top six cards of your library. You may put up to one land card from among them onto the battlefield tapped and up to one Elf card from among them into your hand. Put the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"});
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"});

describe("round 303: Bounty of Skemfar", () => {
  it("is supported", () => supported(bounty()));

  it("a land onto the battlefield tapped and an Elf card into your hand, the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([bounty()]);
    const top = stackTop(s0, ap, [bear({ name: "A" }), forest, llanowar(), bear({ name: "B" }), bear({ name: "C" }), bear({ name: "D" })]);
    const seventh = s0.players[ap]!.library[6]!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1, min: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!] }));
    expect(s.objects[top[1]!]!).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1, min: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[2]!] }));
    expect(s.players[ap]!.hand).toContain(top[2]!);
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(seventh);
    for (const id of [top[0]!, top[3]!, top[4]!, top[5]!]) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 4);
  });

  it("only an Elf card can go to your hand, and taking no land leaves all six for the Elf pick", () => {
    const { s: s0, ap, ids } = setup([bounty()]);
    const top = stackTop(s0, ap, [bear({ name: "A" }), forest, llanowar(), bear({ name: "B" }), bear({ name: "C" }), bear({ name: "D" })]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1, min: 0 });
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [top[0]!] })).toThrow(/Elf card/);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[2]!] }));
    expect(s.players[ap]!.hand).toContain(top[2]!);
    expect(s.objects[top[1]!]!.zone).toBe("library");
    const lib = s.players[ap]!.library;
    for (const id of [top[0]!, top[1]!, top[3]!, top[4]!, top[5]!]) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 5);
  });
});

const dreadnought = (): CardDef => ({"oracleId":"a7950edb-5670-46fd-a30e-0fe888a5a32b","name":"Phyrexian Dreadnought","manaCost":"{1}","cmc":1,"typeLine":"Artifact Creature — Phyrexian Dreadnought","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Dreadnought"],"oracleText":"Trample\nWhen this creature enters, sacrifice it unless you sacrifice any number of creatures with total power 12 or greater.","power":"12","toughness":"12","colors":[],"colorIdentity":[],"keywords":["Trample"],"layout":"normal"});
const big = (name: string, p: number) => bear({ name, power: String(p), toughness: String(p) });

describe("round 303: Phyrexian Dreadnought", () => {
  it("is supported", () => supported(dreadnought()));

  it("sacrificing creatures with total power 12 or greater keeps it, all at once", () => {
    const { s: s0, ap, ids } = setup([dreadnought()]);
    const a = putOnBattlefield(s0, ap, big("Seven", 7));
    const b = putOnBattlefield(s0, ap, big("Five", 5));
    const c = putOnBattlefield(s0, ap, big("Two", 2));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", minTotalPower: 12 });
    expect(() => applyAction(s, { type: "pickPermanents", player: ap, ids: [a, c] })).toThrow(/total power 12 or greater/);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a, b] }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("battlefield");
  });

  it("~ itself is one of any number of creatures; without it, 12 power must come from the others", () => {
    const { s: s0, ap, ids } = setup([dreadnought()]);
    const a = putOnBattlefield(s0, ap, big("Seven", 7));
    const b = putOnBattlefield(s0, ap, big("Four", 4));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(() => applyAction(s, { type: "pickPermanents", player: ap, ids: [a, b] })).toThrow(/total power 12 or greater/);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("gone before its trigger resolves, that option needs 12 power from the others", () => {
    const { s: s0, ap, ids } = setup([dreadnought()]);
    const a = putOnBattlefield(s0, ap, big("Seven", 7));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, ids[0]!, "graveyard");
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("declining sacrifices it", () => {
    const { s: s0, ap, ids } = setup([dreadnought()]);
    putOnBattlefield(s0, ap, big("Twelve", 12));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { may: false });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("a bot keeps it by sacrificing tokens worth less", () => {
    const { s: s0, ap, ids } = setup([dreadnought()]);
    const toks = [0, 1, 2].map((i) => {
      const id = putOnBattlefield(s0, ap, big(`Tok${i}`, 4));
      s0.objects[id]!.isToken = true;
      return id;
    });
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(toks.map((id) => s.objects[id]?.zone ?? "gone")).not.toContain("battlefield");
  });
});

const funeral = (): CardDef => ({"oracleId":"b4b0a4b7-b36f-4c96-b07b-a86c1efd333e","name":"The Kenriths' Royal Funeral","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"When The Kenriths' Royal Funeral enters, exile up to two target legendary creature cards from your graveyard. You draw X cards and you lose X life, where X is the greatest mana value among cards exiled this way.\nLegendary spells you cast cost {1} less to cast for each card exiled with The Kenriths' Royal Funeral.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"layout":"normal"});
const legend = (name: string, mv: number) => card(name, "Legendary Creature — Human", `{${mv - 1}}{W}`, { cmc: mv, power: "2", toughness: "2" });

describe("round 303: The Kenriths' Royal Funeral", () => {
  it("is supported", () => supported(funeral()));

  const enter = (cards: number[]) => {
    const { s: s0, ap, ids } = setup([funeral()]);
    const yard = cards.map((mv, i) => into(s0, ap, legend(`Legend ${i}`, mv), "graveyard"));
    const later = into(s0, ap, legend("Later Legend", 6), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [0, 1].map((i): TargetChoice => (yard[i] ? tgt(yard[i]!) : { kind: "none" })) }));
    return { s, ap, yard, later, funeralId: ids[0]! };
  };

  it("exiles up to two legendary creature cards; you draw and lose life equal to the greatest mana value", () => {
    const { s: s1, ap, yard } = enter([3, 5]);
    expect(yard.map((id) => s1.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s1.players[ap]!.life).toBe(35);
    expect(s1.log.some((l) => /draws? 5 cards/.test(typeof l === "string" ? l : l.text))).toBe(true);
  });

  it("legendary spells cost {1} less for each card exiled with it, only while those cards stay exiled", () => {
    const { s: s1, ap, yard, later } = enter([3, 5]);
    const total = (s: GameState, id: string) => ((c) => manaValue(c.cost) + c.extra)(spellCost(s, ap, s.objects[id]!));
    const cost = (s: GameState) => total(s, later);
    expect(cost(s1)).toBe(4);
    const nonLegend = into(s1, ap, bear(), "hand");
    expect(total(s1, nonLegend)).toBe(2);
    moveObject(s1, yard[0]!, "graveyard");
    invalidateCharacteristics(s1);
    expect(cost(s1)).toBe(5);
  });

  it("with no targets, X is 0", () => {
    const { s: s1, ap } = enter([]);
    expect(s1.players[ap]!.life).toBe(40);
  });
});

const safeguard = (): CardDef => ({"oracleId":"8ac43884-9f03-4945-98ea-c744d0403f32","name":"Contractual Safeguard","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Addendum — If you cast this spell during your main phase, put a shield counter on a creature you control. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)\nChoose a kind of counter on a creature you control. Put a counter of that kind on each other creature you control.","colors":["W"],"colorIdentity":["W"],"keywords":["Addendum"],"layout":"normal"});

describe("round 303: Contractual Safeguard", () => {
  it("is supported", () => supported(safeguard()));

  const board = () => {
    const { s, ap, ids } = setup([safeguard()]);
    const a = putOnBattlefield(s, ap, bear({ name: "A" }));
    s.objects[a]!.counters["+1/+1"] = 2;
    s.objects[a]!.counters.flying = 1;
    const b = putOnBattlefield(s, ap, bear({ name: "B" }));
    const c = putOnBattlefield(s, ap, bear({ name: "C" }));
    const theirs = putOnBattlefield(s, s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!, bear({ name: "Theirs" }));
    invalidateCharacteristics(s);
    return { s, ap, ids, a, b, c, theirs };
  };

  it("in your main phase: a shield counter first, which can be the kind chosen for each other creature", () => {
    const { s: s0, ap, ids, a, b, c, theirs } = board();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "counters" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[b]!.counters.shield).toBe(1);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([a, b].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[a]!.counters.shield).toBe(1);
    expect(s.objects[c]!.counters.shield).toBe(1);
    expect(s.objects[b]!.counters.shield).toBe(1);
    expect(s.objects[theirs]!.counters.shield ?? 0).toBe(0);
  });

  it("a kind chosen among those on the chosen creature, onto each other creature you control", () => {
    const { s: s0, ap, ids, a, b, c } = board();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterKind", options: ["+1/+1", "flying"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "flying" }));
    expect(s.objects[b]!.counters.flying).toBe(1);
    expect(s.objects[c]!.counters.flying).toBe(1);
    expect(s.objects[a]!.counters.flying).toBe(1);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
  });

  it("outside your main phase, no shield counter", () => {
    const { s: s0, ap, ids, a, b, c } = board();
    s0.step = "beginCombat";
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[b]!.counters.shield ?? 0).toBe(0);
    // Only A has counters: no creature to choose.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterKind" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1" }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
  });
});

const fblthp = (): CardDef => ({"oracleId":"ba5a7ac0-b625-42e9-af05-2680a01a95ed","name":"Fblthp, the Lost","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Homunculus","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Homunculus"],"oracleText":"When Fblthp enters, draw a card. If it entered from your library or was cast from your library, draw two cards instead.\nWhen Fblthp becomes the target of a spell, shuffle Fblthp into its owner's library.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"});

describe("round 303: Fblthp, the Lost", () => {
  it("is supported", () => supported(fblthp(), tutorToField(), topCaster(), pump()));

  const hand = (s: GameState, p: PlayerId) => s.players[p]!.hand.length;

  it("cast from your hand: one card", () => {
    const { s: s0, ap, ids } = setup([fblthp()]);
    const before = hand(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(hand(s, ap)).toBe(before - 1 + 1);
  });

  it("put onto the battlefield from your library: two cards", () => {
    const { s: s0, ap, ids } = setup([tutorToField()]);
    const f = into(s0, ap, fblthp(), "library");
    const before = hand(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [f] }));
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(hand(s, ap)).toBe(before - 1 + 2);
  });

  it("cast from your library: two cards", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, topCaster());
    const f = into(s0, ap, fblthp(), "library");
    const before = hand(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, f)));
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(hand(s, ap)).toBe(before + 2);
  });

  it("when it becomes the target of a spell, it's shuffled into its owner's library and the spell has no target", () => {
    const { s: s0, ap, ids } = setup([pump()]);
    const f = putOnBattlefield(s0, ap, fblthp());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(f)])));
    expect(s.objects[f]!.zone).toBe("library");
    expect(s.players[ap]!.library).toContain(f);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

function tutorToField() { return card("Field Tutor", "Sorcery", "{G}", { cmc: 1, oracleText: "Search your library for a creature card, put it onto the battlefield, then shuffle." }); }
function topCaster() { return card("Top Caster", "Enchantment", "{U}", { cmc: 1, oracleText: "You may cast spells from the top of your library." }); }
function pump() { return card("Small Pump", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +1/+1 until end of turn." }); }

const arlinn = (): CardDef => ({"oracleId":"f227ce07-7e96-4a36-ab7c-9be6e777d649","name":"Arlinn, the Pack's Hope // Arlinn, the Moon's Fury","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Planeswalker — Arlinn // Legendary Planeswalker — Arlinn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Arlinn"],"oracleText":"Daybound (If a player casts no spells during their own turn, it becomes night next turn.)\n+1: Until your next turn, you may cast creature spells as though they had flash, and each creature you control enters with an additional +1/+1 counter on it.\n−3: Create two 2/2 green Wolf creature tokens.","loyalty":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Transform","Daybound","Nightbound"],"producedMana":["G","R"],"layout":"transform","faces":[{"name":"Arlinn, the Pack's Hope","manaCost":"{2}{R}{G}","typeLine":"Legendary Planeswalker — Arlinn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Arlinn"],"oracleText":"Daybound (If a player casts no spells during their own turn, it becomes night next turn.)\n+1: Until your next turn, you may cast creature spells as though they had flash, and each creature you control enters with an additional +1/+1 counter on it.\n−3: Create two 2/2 green Wolf creature tokens.","loyalty":"4","colors":["G","R"]},{"name":"Arlinn, the Moon's Fury","manaCost":"","typeLine":"Legendary Planeswalker — Arlinn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Arlinn"],"oracleText":"Nightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)\n+2: Add {R}{G}.\n0: Until end of turn, Arlinn becomes a 5/5 Werewolf creature with trample, indestructible, and haste.","loyalty":"4","colors":["G","R"],"colorIndicator":["G","R"]}]});

describe("round 303: Arlinn, the Pack's Hope", () => {
  it("is supported", () => supported(arlinn()));

  it("+1: until your next turn, creature spells with flash and an additional +1/+1 counter on each creature you control", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "First" }), bear({ name: "Second" })]);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const a = putOnBattlefield(s0, ap, arlinn());
    s0.objects[a]!.counters.loyalty = 4;
    let s = settle(run(s0, planActivate(s0, ap, a, 0)));
    expect(s.objects[a]!.counters.loyalty).toBe(5);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    // An opponent's creature doesn't get one.
    const theirs = into(s, opp, bear({ name: "Theirs" }), "hand");
    moveObject(s, theirs, "battlefield");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
    const mine = into(s, ap, bear({ name: "Mine" }), "hand");
    moveObject(s, mine, "battlefield");
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    // During the next player's turn: cast as though it had flash, still with the counter.
    s = passUntil(s, "main1", opp);
    s = act(s, { type: "passPriority", player: opp });
    expect(waitingOn(s)).toBe(s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[ap]!.manaPool.G = 2;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
    // It ends as your next turn begins.
    s = passUntil(s, "upkeep", ap);
    expect(s.entersWithCountersThisTurn ?? []).toEqual([]);
  });
});

const yidris = (): CardDef => ({"oracleId":"9efe8aff-9a7d-4397-b5fd-c1a0fad7c15f","name":"Yidris, Maelstrom Wielder","manaCost":"{U}{B}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Ogre Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Ogre","Wizard"],"oracleText":"Trample\nWhenever Yidris deals combat damage to a player, as you cast spells from your hand this turn, they gain cascade. (When you cast the spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)","power":"5","toughness":"4","colors":["B","G","R","U"],"colorIdentity":["B","G","R","U"],"keywords":["Trample"],"layout":"normal"});
const study = (name: string) => card(name, "Sorcery", "{2}{U}", { cmc: 3, oracleText: "You gain 3 life." });

describe("round 303: Yidris, Maelstrom Wielder", () => {
  it("is supported", () => supported(yidris()));

  it("after combat damage to a player, each spell you cast from your hand this turn gains cascade", () => {
    const { s: s0, ap, ids } = setup([study("Study A"), study("Study B")]);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const y = putOnBattlefield(s0, ap, yidris());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: y, defender: opp }] } as Action), { me: ap });
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(35);
    const tops = stackTop(s, ap, [bear({ name: "Cheap One", cmc: 2 }), bear({ name: "Cheap Two", cmc: 2 })]);
    const castCascaded = (s: GameState, top: string) => {
      s = settle(s);
      expect(s.pending).toMatchObject({ kind: "castFree", objectId: top });
      return settle(act(s, { type: "castSpell", player: ap, objectId: top }));
    };
    s = castCascaded(run(s, planCast(s, ap, ids[0]!)), tops[0]!);
    expect(s.objects[tops[0]!]!.zone).toBe("battlefield");
    // The cascaded spell was cast from exile, not your hand: no cascade of its own. The second spell from your hand cascades.
    s = castCascaded(run(s, planCast(s, ap, ids[1]!)), tops[1]!);
    expect(s.objects[tops[1]!]!.zone).toBe("battlefield");
  });

  it("without combat damage, no cascade", () => {
    const { s: s0, ap, ids } = setup([study("Study A")]);
    putOnBattlefield(s0, ap, yidris());
    const tops = stackTop(s0, ap, [bear({ name: "Cheap One", cmc: 2 })]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { may: true });
    expect(s.objects[tops[0]!]!.zone).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(tops[0]!);
  });
});

const cursecloth = (): CardDef => ({"oracleId":"d9c4996a-35eb-4d38-9680-57d9d039ed82","name":"Cursecloth Wrappings","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Zombies you control get +1/+1.\n{T}: Target creature card in your graveyard gains embalm until end of turn. The embalm cost is equal to its mana cost. (Exile that card and pay its embalm cost: Create a token that's a copy of it, except it's a white Zombie in addition to its other types and has no mana cost. Embalm only as a sorcery.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});

describe("round 303: Cursecloth Wrappings", () => {
  it("is supported", () => supported(cursecloth()));

  it("a creature card in your graveyard gains embalm with its mana cost until end of turn; the token is a 3/3 white Zombie", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, cursecloth());
    const b = into(s0, ap, bear({ name: "Old Bear", cmc: 2 }), "graveyard");
    expect(abilitiesOf(s0, s0.objects[b]!).activated.some((a) => a.keyword === "Embalm")).toBe(false);
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [tgt(b)])));
    const i = abilitiesOf(s, s.objects[b]!).activated.findIndex((a) => a.keyword === "Embalm");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(abilitiesOf(s, s.objects[b]!).activated[i]!.manaCost).toBe("{1}{G}");
    s = settle(run(s, planActivate(s, ap, b, i)));
    expect(s.objects[b]!.zone).toBe("exile");
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Old Bear")!;
    const ch = characteristics(s, s.objects[tok]!);
    expect(ch.colors).toEqual(["W"]);
    expect(ch.subtypes).toContain("Zombie");
    // Zombies you control get +1/+1.
    expect(`${ch.power}/${ch.toughness}`).toBe("3/3");
  });

  it("the embalm is gone at end of turn", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, cursecloth());
    const b = into(s0, ap, bear({ name: "Old Bear", cmc: 2 }), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [tgt(b)])));
    expect(abilitiesOf(s, s.objects[b]!).activated.some((a) => a.keyword === "Embalm")).toBe(true);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(abilitiesOf(s, s.objects[b]!).activated.some((a) => a.keyword === "Embalm")).toBe(false);
  });
});
