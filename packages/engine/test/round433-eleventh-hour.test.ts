// Round 433: The Eleventh Hour ("III — Create a token that's a copy of target creature, except it's a legendary Alien
// named Prisoner Zero."): a copy with a name of its own, legendary, an Alien instead of every subtype it had (rulings),
// its text's references to itself by name meaning itself (CR 201.5).
import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { putCounters } from "../src/counters";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, power, toughness, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const hour = (): CardDef => ({"oracleId":"6b3e1aaf-6909-400a-88f2-9e9fde9a0cf7","name":"The Eleventh Hour","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Search your library for a Doctor card, reveal it, put it into your hand, then shuffle.\nII — Create a Food token and a 1/1 white Human creature token with \"Doctor spells you cast cost {1} less to cast.\"\nIII — Create a token that's a copy of target creature, except it's a legendary Alien named Prisoner Zero.","colors":["U"],"colorIdentity":["U"],"keywords":["Food"],"layout":"saga"}) as CardDef;
const gingerbrute = (): CardDef => ({"oracleId":"10b8d4c7-7553-4d76-b643-d98b80701e13","name":"Gingerbrute","manaCost":"{1}","cmc":1,"typeLine":"Artifact Creature — Food Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Food","Golem"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)\n{1}: This creature can't be blocked this turn except by creatures with haste.\n{2}, {T}, Sacrifice this creature: You gain 3 life.","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":["Haste"],"layout":"normal"}) as CardDef;
const squadron = (): CardDef => ({"oracleId":"5783e71e-2497-4241-9d1a-8bced4745b1d","name":"Battle Squadron","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Flying\nBattle Squadron's power and toughness are each equal to the number of creatures you control.","power":"*","toughness":"*","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const snowBear = (): CardDef => ({"oracleId":"2fcc69ff-8ab5-4e14-afe3-db892049a872","name":"Boreal Druid","manaCost":"{G}","cmc":1,"typeLine":"Snow Creature — Elf Druid","supertypes":["Snow"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {C}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;

/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === name);

/** The Saga at chapter II, then its third lore counter: chapter III copying `target` (a creature of `owner`'s). */
const chapterIII = (def: CardDef, theirs = true) => {
  const { s: s0, ap, opp } = setup([]);
  const saga = putOnBattlefield(s0, ap, hour());
  s0.objects[saga]!.counters.lore = 2;
  const target = putOnBattlefield(s0, theirs ? opp : ap, def);
  invalidateCharacteristics(s0);
  putCounters(s0, s0.objects[saga]!, "lore", 1);
  let s = settle(s0, ap);
  if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: target }] }), ap);
  const tok = tokensNamed(s, "Prisoner Zero")[0];
  return { s, ap, opp, saga, target, tok: tok as ObjectId | undefined };
};

describe("round 433: The Eleventh Hour", () => {
  it("is fully supported", () => {
    expect(isFullySupported(hour())).toBe(true);
  });

  it("chapter III: a token copy named Prisoner Zero, legendary, an Alien instead of all its subtypes (Food too), its card types kept", () => {
    const r = chapterIII(gingerbrute());
    expect(r.tok).toBeDefined();
    const c = characteristics(r.s, r.s.objects[r.tok!]!);
    expect(c.name).toBe("Prisoner Zero");
    expect(c.supertypes).toContain("Legendary");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(["Alien"]);
    expect(c.keywords).toContain("Haste");
    expect(r.s.objects[r.tok!]!.controller).toBe(r.ap);
    // Then the Saga is sacrificed.
    expect(r.s.objects[r.saga]!.zone).toBe("graveyard");
  });

  it("its other supertypes stay (snow)", () => {
    const r = chapterIII(snowBear());
    const c = characteristics(r.s, r.s.objects[r.tok!]!);
    expect(c.supertypes).toEqual(expect.arrayContaining(["Legendary", "Snow"]));
    expect(c.subtypes).toEqual(["Alien"]);
  });

  it("the copied text's references to itself by name mean the copy (CR 201.5): Battle Squadron's power and toughness", () => {
    const r = chapterIII(squadron(), false);
    const tok = r.s.objects[r.tok!]!;
    const mine = r.s.battlefield.filter((id) => r.s.objects[id]!.controller === r.ap && characteristics(r.s, r.s.objects[id]!).types.includes("Creature")).length;
    expect(isFullySupported(r.s.cards[tok.cardId]!)).toBe(true);
    expect(power(r.s, tok)).toBe(mine);
    expect(toughness(r.s, tok)).toBe(mine);
  });

  it("two of them: the legend rule applies to Prisoner Zero (CR 704.5j)", () => {
    const r = chapterIII(gingerbrute());
    let s = r.s;
    const saga = putOnBattlefield(s, r.ap, hour());
    s.objects[saga]!.counters.lore = 2;
    invalidateCharacteristics(s);
    putCounters(s, s.objects[saga]!, "lore", 1);
    s = settle(s, r.ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "object", id: r.target }] }), r.ap);
    // The legend rule: its controller keeps one.
    if (s.pending) s = settle(act(s, botActions(s, r.ap)[0]!), r.ap);
    expect(tokensNamed(s, "Prisoner Zero")).toHaveLength(1);
  });
});
