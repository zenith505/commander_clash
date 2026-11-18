// Round 406 (Lane A): Lazav, Dimir Mastermind (a copy of a creature card put into an opponent's graveyard, as printed,
// except its name, legendary, hexproof and this ability, CR 707.2, 707.9a-b), Quintorius, Loremaster (a card exiled with it,
// CR 607.2a, cast this turn without paying its mana cost, then to the bottom of its owner's library, CR 118.9, 614.1a) and
// Maralen, Fae Ascendant (once each turn, a spell with mana value up to its count from among cards exiled with it this turn,
// for free).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { addCopyEffect, copyKey } from "../src/copies";
import { moveObject } from "../src/game";
import { applyAction, botActions, castProblem, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const dimir = (): CardDef => ({"oracleId":"8027a610-613e-4640-9840-c8778694f312","name":"Lazav, Dimir Mastermind","manaCost":"{U}{U}{B}{B}","cmc":4,"typeLine":"Legendary Creature — Shapeshifter","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Hexproof\nWhenever a creature card is put into an opponent's graveyard from anywhere, you may have Lazav become a copy of that card, except its name is Lazav, Dimir Mastermind, it's legendary in addition to its other types, and it has hexproof and this ability.","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69c8fcdb-4798-4961-995a-e128a3ff431a.jpg?1783940106","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69c8fcdb-4798-4961-995a-e128a3ff431a.jpg?1783940106","commanderLegal":"legal","set":"gtc","releasedAt":"2013-02-01","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const quintorius = (): CardDef => ({"oracleId":"c3d38129-b955-4fb5-8486-095f918935b9","name":"Quintorius, Loremaster","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Legendary Creature — Elephant Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elephant","Cleric"],"oracleText":"Vigilance\nAt the beginning of your end step, exile target noncreature, nonland card from your graveyard. Create a 3/2 red and white Spirit creature token.\n{1}{R}{W}, {T}, Sacrifice a Spirit: Choose target card exiled with Quintorius. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead.","power":"3","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/a/1/a19b152c-8376-42f9-9daf-e139dc29c9ca.jpg?1783916939","artUrl":"https://cards.scryfall.io/art_crop/front/a/1/a19b152c-8376-42f9-9daf-e139dc29c9ca.jpg?1783916939","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const maralen = (): CardDef => ({"oracleId":"114e1d2c-cefc-4e2a-922e-3b2ceed1871d","name":"Maralen, Fae Ascendant","manaCost":"{2}{B}{G}{U}","cmc":5,"typeLine":"Legendary Creature — Elf Faerie Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Faerie","Noble"],"oracleText":"Flying\nWhenever Maralen or another Elf or Faerie you control enters, exile the top two cards of target opponent's library.\nOnce each turn, you may cast a spell with mana value less than or equal to the number of Elves and Faeries you control from among cards exiled with Maralen this turn without paying its mana cost.","power":"4","toughness":"5","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c50f5408-5b5c-41dc-807e-136233403a09.jpg?1783904406","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c50f5408-5b5c-41dc-807e-136233403a09.jpg?1783904406","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty or a question comes up; "you may" questions answered `yes`. */
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** `pid`'s cards in a zone of theirs: library (on top, the first one on top), graveyard or hand. */
function place(s: GameState, pid: PlayerId, zone: "library" | "graveyard" | "hand", defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    return id;
  });
  if (zone === "library") s.players[pid]!.library.unshift(...ids);
  else s.players[pid]![zone].push(...ids);
  invalidateCharacteristics(s);
  return ids;
}
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);

describe("round 406: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [dimir(), quintorius(), maralen()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

/** Pass priority until an ability from `src` is on top of the stack (its trigger put there). */
function untilAbilityOf(s0: GameState, src: ObjectId) {
  let s = s0;
  for (let i = 0; i < 100; i++) {
    const top = s.stack[s.stack.length - 1];
    if (top?.kind === "ability" && top.sourceId === src) return s;
    if (s.pending) throw new Error(s.pending.kind);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("no ability");
}

describe("round 406: Lazav, Dimir Mastermind", () => {
  it("a creature card put into an opponent's graveyard: Lazav may become a copy of it, keeping its name, legendary, hexproof and this ability", () => {
    const { s: s0, ap, opp, ids } = setup([murder(), bolt()]);
    const lz = putOnBattlefield(s0, ap, dimir());
    const an = putOnBattlefield(s0, opp, angel());
    const br = putOnBattlefield(s0, opp, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(an)]));
    s = untilAbilityOf(s, lz);
    s = settle(s);
    expect(s.objects[an]!.zone).toBe("graveyard");
    let c = ch(s, lz);
    expect(c.name).toBe("Lazav, Dimir Mastermind");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toEqual(["Angel"]);
    expect(c.keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance", "Hexproof"]));
    // It has this ability: the next creature card makes it a copy of that one, still Lazav.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(br)]));
    s = settle(untilAbilityOf(s, lz));
    c = ch(s, lz);
    expect(c.name).toBe("Lazav, Dimir Mastermind");
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.subtypes).toEqual(["Bear"]);
    expect(c.keywords).toContain("Hexproof");
    expect(c.keywords).not.toContain("Flying");
  });

  it("it may stay as it is; your own creature card doesn't trigger it", () => {
    const { s: s0, ap, opp, ids } = setup([murder(), bolt()]);
    const lz = putOnBattlefield(s0, ap, dimir());
    const mine = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)])));
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(ch(s, lz).power).toBe(3);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(theirs)]));
    s = settle(untilAbilityOf(s, lz), false);
    expect(ch(s, lz).name).toBe("Lazav, Dimir Mastermind");
    expect(ch(s, lz).subtypes).toEqual(["Shapeshifter"]);
  });

  it("the card is copied as it last existed in the graveyard, even after it left", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    const lz = putOnBattlefield(s0, ap, dimir());
    const br = putOnBattlefield(s0, opp, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(br)]));
    s = untilAbilityOf(s, lz);
    // The Bears card leaves the graveyard with the trigger on the stack.
    moveObject(s, br, "exile");
    expect(s.objects[br]!.zone).toBe("exile");
    s = settle(s);
    expect(ch(s, lz).subtypes).toEqual(["Bear"]);
    expect(ch(s, lz).power).toBe(2);
  });

  it("copy effects on the permanent it was aren't copied: a Clone that was an Angel is a 0/0 Clone (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([murder()]);
    const lz = putOnBattlefield(s0, ap, dimir());
    const cl = putOnBattlefield(s0, opp, angel());
    s0.objects[cl]!.cardId = clone().oracleId;
    s0.cards[clone().oracleId] = clone();
    addCopyEffect(s0, s0.objects[cl]!, copyKey(s0, angel()));
    invalidateCharacteristics(s0);
    expect(ch(s0, cl).name).toBe("Serra Angel");
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(cl)]));
    s = settle(untilAbilityOf(s, lz));
    expect(s.objects[lz]!.zone).toBe("graveyard");
  });

  it("bots copy a bigger creature card and stay as they are for a smaller one", () => {
    const { s: s0, ap, opp, ids } = setup([murder(), shock()]);
    const lz = putOnBattlefield(s0, ap, dimir());
    const an = putOnBattlefield(s0, opp, angel());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(an)]));
    s = untilAbilityOf(s, lz);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseMay", yes: true });
    s = settle(s);
    const br = putOnBattlefield(s, opp, bears());
    s = run(s, planCast(s, ap, ids[1]!, [tgt(br)]));
    s = untilAbilityOf(s, lz);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseMay", yes: false });
  });
});

/** Pass to `ap`'s end step, where Quintorius's trigger asks for its target; choose `card`, then let it resolve. */
function quintoriusEndStep(s0: GameState, ap: PlayerId, card: ObjectId) {
  let s = s0;
  for (let i = 0; i < 100 && s.pending?.kind !== "chooseTargets"; i++) {
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    else if (s.pending) throw new Error(s.pending.kind);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  expect(s.step).toBe("end");
  s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(card)] });
  for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const spiritOf = (s: GameState, pid: PlayerId) => s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && ch(s, id).subtypes.includes("Spirit"));

describe("round 406: Quintorius, Loremaster", () => {
  it("a card exiled with it may be cast this turn for free, then goes to the bottom of its owner's library", () => {
    const { s: s0, ap, opp } = setup([]);
    const q = putOnBattlefield(s0, ap, quintorius());
    const [b] = place(s0, ap, "graveyard", [bolt()]);
    let s = quintoriusEndStep(s0, ap, b!);
    expect(s.objects[b!]!.zone).toBe("exile");
    const sp = spiritOf(s, ap);
    expect(sp).toBeDefined();
    // Not castable before the ability.
    expect(castProblem(s, ap, b!, [{ kind: "player", id: opp }])).not.toBeNull();
    s = run(s, planActivate(s, ap, q, 0, [tgt(b!)], undefined, undefined, undefined, { sacrifice: [sp!] }));
    expect(s.objects[sp!]).toBeUndefined();
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[b!]!.mayPlay).toMatchObject({ until: "thisTurn", free: true, bottomAfter: true, castOnly: true });
    const lifeBefore = s.players[opp]!.life;
    s = run(s, planCast(s, ap, b!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(lifeBefore - 3);
    expect(s.objects[b!]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(b);
  });

  it("only a card its trigger exiled can be chosen; a sorcery still waits for a main phase, and the permission ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const q = putOnBattlefield(s0, ap, quintorius());
    const [d, other] = place(s0, ap, "graveyard", [divination(), bolt()]);
    let s = quintoriusEndStep(s0, ap, d!);
    moveObject(s, other!, "exile");
    const sp = spiritOf(s, ap)!;
    expect(planActivate(s, ap, q, 0, [tgt(other!)], undefined, undefined, undefined, { sacrifice: [sp] })).toBeNull();
    s = run(s, planActivate(s, ap, q, 0, [tgt(d!)], undefined, undefined, undefined, { sacrifice: [sp] }));
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[d!]!.mayPlay?.free).toBe(true);
    expect(castProblem(s, ap, d!)).not.toBeNull();
    const turn = s.turn;
    for (let i = 0; i < 100 && s.turn === turn; i++) {
      if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, s.pending.count) });
      else if (s.pending) throw new Error(s.pending.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[d!]!.zone).toBe("exile");
    expect(s.objects[d!]!.mayPlay).toBeUndefined();
  });
});

/** Cast Llanowar Elves with Maralen out; its trigger exiles the top two cards of `opp`'s library. */
function elfEnters(s0: GameState, ap: PlayerId, opp: PlayerId, elf: ObjectId) {
  let s = run(s0, planCast(s0, ap, elf));
  for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) {
    if (s.pending) throw new Error(s.pending.kind);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
  return settle(s);
}
const free = { alt: "linkedFree" as const };

describe("round 406: Maralen, Fae Ascendant", () => {
  it("once each turn, a spell with mana value up to the number of Elves and Faeries you control from among cards it exiled this turn, for free", () => {
    const { s: s0, ap, opp, ids } = setup([elves()]);
    putOnBattlefield(s0, ap, maralen());
    const [br, dv] = place(s0, opp, "library", [bears(), divination()]);
    let s = elfEnters(s0, ap, opp, ids[0]!);
    expect(s.objects[br!]!.zone).toBe("exile");
    expect(s.objects[dv!]!.zone).toBe("exile");
    // Maralen and Llanowar Elves: 2. The Bears (2) yes, Divination (3) no; and only for free.
    expect(castProblem(s, ap, br!, undefined, undefined, undefined, undefined, undefined, free)).toBeNull();
    expect(castProblem(s, ap, br!)).toMatch(/only be cast without paying its mana cost/);
    expect(castProblem(s, ap, dv!, undefined, undefined, undefined, undefined, undefined, free)).not.toBeNull();
    s = settle(run(s, planCast(s, ap, br!, undefined, undefined, "auto", undefined, free)));
    expect(s.objects[br!]!.zone).toBe("battlefield");
    expect(s.objects[br!]!.controller).toBe(ap);
    // A third Elf makes Divination's mana value low enough, but the once this turn is used.
    putOnBattlefield(s, ap, elves());
    expect(castProblem(s, ap, dv!, undefined, undefined, undefined, undefined, undefined, free)).not.toBeNull();
  });

  it("cards it exiled on an earlier turn can't be cast this way", () => {
    const { s: s0, ap, opp, ids } = setup([elves()]);
    putOnBattlefield(s0, ap, maralen());
    const [b1] = place(s0, opp, "library", [bolt(), bolt()]);
    let s = elfEnters(s0, ap, opp, ids[0]!);
    expect(castProblem(s, ap, b1!, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, free)).toBeNull();
    const turn = s.turn;
    for (let i = 0; i < 100 && s.turn === turn; i++) {
      if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, s.pending.count) });
      else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: s.pending.player, attacks: [] });
      else if (s.pending) throw new Error(s.pending.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[b1!]!.zone).toBe("exile");
    expect(castProblem(s, ap, b1!, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, free)).not.toBeNull();
  });

  it("bots cast the card for free", () => {
    const { s: s0, ap, opp, ids } = setup([elves()]);
    putOnBattlefield(s0, ap, maralen());
    const [br] = place(s0, opp, "library", [bears(), divination()]);
    let s = elfEnters(s0, ap, opp, ids[0]!);
    for (let i = 0; i < 30 && s.objects[br!]!.zone === "exile" && waitingOn(s) === ap && s.step === "main1"; i++) for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[br!]!.zone).not.toBe("exile");
    expect(s.objects[br!]!.castAlt).toBe("linkedFree");
  });
});
