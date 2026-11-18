// Round 408 (Lane A): Abstruse Appropriation (colorless mana spent as though it were mana of any color, CR 609.4b), Valki,
// God of Lies (a creature card from each opponent's hand exiled until it leaves, CR 610.3, and "{X}: ... becomes a copy of
// that card", CR 707.2, 607.2a) and its back face Tibalt, Cosmic Impostor (an emblem, as it enters, that plays the cards
// exiled with that Tibalt, CR 114, 614.1c, rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { moveObject } from "../src/game";
import { applyAction, botActions, castProblem, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const abstruse = (): CardDef => ({"oracleId":"61a23402-3244-4b5e-9134-98e1f82eda65","name":"Abstruse Appropriation","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Devoid (This card has no color.)\nExile target nonland permanent. You may cast that card for as long as it remains exiled, and you may spend colorless mana as though it were mana of any color to cast that spell.","colors":[],"colorIdentity":["B","W"],"keywords":["Devoid"],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d7149359-bb3f-413c-b21d-e4cd88618e56.jpg?1783911253","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d7149359-bb3f-413c-b21d-e4cd88618e56.jpg?1783911253","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const valki = (): CardDef => ({"oracleId":"907ae517-22d5-4ac7-bc3a-3f4d5eaeeb57","name":"Valki, God of Lies // Tibalt, Cosmic Impostor","manaCost":"{1}{B}","cmc":2,"typeLine":"Legendary Creature — God // Legendary Planeswalker — Tibalt","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"When Valki enters, each opponent reveals their hand. For each opponent, exile a creature card they revealed this way until Valki leaves the battlefield.\n{X}: Choose a creature card exiled with Valki with mana value X. Valki becomes a copy of that card.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B","R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/e/3/e3e5c965-a689-4726-b8c2-63b836895939.jpg?1783928157","artUrl":"https://cards.scryfall.io/art_crop/front/e/3/e3e5c965-a689-4726-b8c2-63b836895939.jpg?1783928157","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Valki, God of Lies","manaCost":"{1}{B}","typeLine":"Legendary Creature — God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"When Valki enters, each opponent reveals their hand. For each opponent, exile a creature card they revealed this way until Valki leaves the battlefield.\n{X}: Choose a creature card exiled with Valki with mana value X. Valki becomes a copy of that card.","power":"2","toughness":"1","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/e/3/e3e5c965-a689-4726-b8c2-63b836895939.jpg?1783928157","artUrl":"https://cards.scryfall.io/art_crop/front/e/3/e3e5c965-a689-4726-b8c2-63b836895939.jpg?1783928157"},{"name":"Tibalt, Cosmic Impostor","manaCost":"{5}{B}{R}","typeLine":"Legendary Planeswalker — Tibalt","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tibalt"],"oracleText":"As Tibalt enters, you get an emblem with \"You may play cards exiled with Tibalt, Cosmic Impostor, and you may spend mana as though it were mana of any color to cast those spells.\"\n+2: Exile the top card of each player's library.\n−3: Exile target artifact or creature.\n−8: Exile all graveyards. Add {R}{R}{R}.","loyalty":"5","colors":["B","R"],"imageUrl":"https://cards.scryfall.io/normal/back/e/3/e3e5c965-a689-4726-b8c2-63b836895939.jpg?1783928157","artUrl":"https://cards.scryfall.io/art_crop/back/e/3/e3e5c965-a689-4726-b8c2-63b836895939.jpg?1783928157"}]} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const wastes = (): CardDef => ({"oracleId":"05d24b0c-904a-46b6-b42a-96a4d91a0dd4","name":"Wastes","manaCost":"","cmc":0,"typeLine":"Basic Land","supertypes":["Basic"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60682c00-c661-4a9d-8326-f3f014a04e3e.jpg?1783937888","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60682c00-c661-4a9d-8326-f3f014a04e3e.jpg?1783937888","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const finks = (): CardDef => ({"oracleId":"5470dcfa-4eff-43da-abf7-19922841f719","name":"Kitchen Finks","manaCost":"{1}{G/W}{G/W}","cmc":3,"typeLine":"Creature — Ouphe","supertypes":[],"types":["Creature"],"subtypes":["Ouphe"],"oracleText":"When this creature enters, you gain 2 life.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)","power":"3","toughness":"2","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Persist"],"imageUrl":"https://cards.scryfall.io/normal/front/7/d/7d203208-8a21-4c68-afa2-4efd8726f026.jpg?1783942717","artUrl":"https://cards.scryfall.io/art_crop/front/7/d/7d203208-8a21-4c68-afa2-4efd8726f026.jpg?1783942717","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const reaper = (): CardDef => ({"oracleId":"70034860-5198-421f-871d-7c1676337b6e","name":"Reaper King","manaCost":"{2/W}{2/U}{2/B}{2/R}{2/G}","cmc":10,"typeLine":"Legendary Artifact Creature — Scarecrow","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Scarecrow"],"oracleText":"({2/W} can be paid with any two mana or with {W}. This card's mana value is 10.)\nOther Scarecrow creatures you control get +1/+1.\nWhenever another Scarecrow you control enters, destroy target permanent.","power":"6","toughness":"6","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1b3463a8-79f6-4fec-afd6-ad8c412d648c.jpg?1783931622","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1b3463a8-79f6-4fec-afd6-ad8c412d648c.jpg?1783931622","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-08","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const legion = (): CardDef => ({"oracleId":"66442396-f804-47f3-8daa-0d43d8cfb482","name":"Porcelain Legionnaire","manaCost":"{2}{W/P}","cmc":3,"typeLine":"Artifact Creature — Phyrexian Soldier","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Soldier"],"oracleText":"({W/P} can be paid with either {W} or 2 life.)\nFirst strike","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/2616aa0e-8413-4e63-877c-bffd5263f552.jpg?1783941324","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/2616aa0e-8413-4e63-877c-bffd5263f552.jpg?1783941324","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
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
/** Every opponent of `ap` with an empty hand (its cards back on top of the library). */
function emptyHands(s: GameState, ap: PlayerId) {
  for (const p of s.turnOrder.filter((x) => x !== ap)) for (const id of [...s.players[p]!.hand]) moveObject(s, id, "library");
  return s.turnOrder.filter((p) => p !== ap);
}
/** Only these lands for `pid`: the others setup() gave are gone. */
function onlyLands(s: GameState, pid: PlayerId, defs: CardDef[]) {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) moveObject(s, id, "graveyard");
  return defs.map((d) => putOnBattlefield(s, pid, d));
}

describe("round 408: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [abstruse(), valki()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 408: Abstruse Appropriation", () => {
  it("exiles a nonland permanent; its caster may cast that card later, paying its colored mana with colorless mana", () => {
    const { s: s0, ap, opp, ids } = setup([abstruse()]);
    const an = putOnBattlefield(s0, opp, angel());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(an)])));
    expect(s.objects[an]!.zone).toBe("exile");
    expect(s.objects[an]!.mayPlay).toMatchObject({ player: ap, until: "exiled", castOnly: true, colorlessAny: true });
    // Its owner can't; its caster can, with five Wastes for {3}{W}{W}, on a later turn too.
    expect(castProblem(s, opp, an)).not.toBeNull();
    onlyLands(s, ap, [wastes(), wastes(), wastes(), wastes(), wastes()]);
    s = settle(run(s, planCast(s, ap, an)));
    expect(s.objects[an]!.zone).toBe("battlefield");
    expect(s.objects[an]!.controller).toBe(ap);
    expect(s.objects[an]!.owner).toBe(opp);
  });

  it("colored mana pays only its own color; {C} and generic as usual; hybrid, {2/W} and Phyrexian symbols take colorless too", () => {
    const { s: s0, ap, opp, ids } = setup([abstruse(), abstruse(), abstruse(), abstruse()]);
    const an = putOnBattlefield(s0, opp, angel());
    const fk = putOnBattlefield(s0, opp, finks());
    const rk = putOnBattlefield(s0, opp, reaper());
    const pl = putOnBattlefield(s0, opp, legion());
    let s = s0;
    for (const [i, t] of [an, fk, rk, pl].entries()) {
      s = settle(run(s, planCast(s, ap, ids[i]!, [tgt(t)])));
      for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    }
    for (const t of [an, fk, rk, pl]) expect(s.objects[t]!.zone).toBe("exile");
    // Four Forests and a Wastes can't pay {3}{W}{W}: green mana isn't any color here.
    onlyLands(s, ap, [wastes(), ...Array.from({ length: 4 }, () => s.cards[Object.values(s.cards).find((d) => d.name === "Forest")!.oracleId]!)]);
    expect(planCast(s, ap, an)).toBeNull();
    // Three Wastes pay Kitchen Finks's {1}{G/W}{G/W}.
    const s1 = structuredClone(s);
    onlyLands(s1, ap, [wastes(), wastes(), wastes()]);
    expect(settle(run(s1, planCast(s1, ap, fk))).objects[fk]!.zone).toBe("battlefield");
    // Five Wastes pay Reaper King's {2/W}{2/U}{2/B}{2/R}{2/G}, one each.
    const s2 = structuredClone(s);
    onlyLands(s2, ap, [wastes(), wastes(), wastes(), wastes(), wastes()]);
    expect(settle(run(s2, planCast(s2, ap, rk))).objects[rk]!.zone).toBe("battlefield");
    // Three Wastes pay Porcelain Legionnaire's {2}{W/P} without life.
    const s3 = structuredClone(s);
    onlyLands(s3, ap, [wastes(), wastes(), wastes()]);
    const life = s3.players[ap]!.life;
    const s3b = settle(run(s3, planCast(s3, ap, pl)));
    expect(s3b.objects[pl]!.zone).toBe("battlefield");
    expect(s3b.players[ap]!.life).toBe(life);
  });

  it("only that card: a token exiled with it is gone, and another card in exile gets no colorless payment", () => {
    const { s: s0, ap, opp, ids } = setup([abstruse()]);
    const an = putOnBattlefield(s0, opp, angel());
    s0.objects[an]!.isToken = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(an)])));
    expect(s.objects[an]).toBeUndefined();
  });
});

/** Valki on the battlefield after its enters trigger has been put on the stack and resolved; the picks answered with `pick`. */
function castValki(s0: GameState, ap: PlayerId, id: ObjectId, pick: (cards: ObjectId[]) => ObjectId[]) {
  let s = run(s0, planCast(s0, ap, id));
  for (let i = 0; i < 100; i++) {
    if (s.pending?.kind === "searchLibrary" && s.pending.player === ap) {
      s = act(s, { type: "searchLibrary", player: ap, found: pick(s.pending.cards) });
      continue;
    }
    if (s.pending) throw new Error(s.pending.kind);
    if (!s.stack.length && !s.triggerQueue.length) break;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

describe("round 408: Valki, God of Lies", () => {
  it("exiles a creature card from each opponent's revealed hand, one each, until Valki leaves; they return to their owners' hands", () => {
    const { s: s0, ap, ids } = setup([valki()]);
    const opps = emptyHands(s0, ap);
    const [a1, b1] = place(s0, opps[0]!, "hand", [angel(), bears()]);
    const [a2] = place(s0, opps[1]!, "hand", [bolt()]);
    const [a3] = place(s0, opps[2]!, "hand", [bears()]);
    const asked: ObjectId[][] = [];
    let s = castValki(s0, ap, ids[0]!, (cards) => (asked.push(cards), [cards.includes(a1!) ? a1! : cards[0]!]));
    const v = ids[0]!;
    expect(s.objects[v]!.zone).toBe("battlefield");
    // One opponent at a time from the active player (CR 101.4); the one with no creature card has no pick.
    expect(asked).toEqual([[a3], [a1, b1]]);
    expect(s.objects[a1!]!.zone).toBe("exile");
    expect(s.objects[b1!]!.zone).toBe("hand");
    expect(s.objects[a2!]!.zone).toBe("hand");
    expect(s.objects[a3!]!.zone).toBe("exile");
    expect(s.log.filter((l) => /^\w+ reveals their hand:/.test(l.text))).toHaveLength(3);
    // Valki leaves: both cards return to their owners' hands (CR 610.3).
    moveObject(s, v, "graveyard");
    s = settle(s);
    expect(s.objects[a1!]!.zone).toBe("hand");
    expect(s.players[opps[0]!]!.hand).toContain(a1);
    expect(s.objects[a3!]!.zone).toBe("hand");
  });

  it("{X}: Valki becomes a copy of the exiled creature card with mana value X, for good, losing this ability", () => {
    const { s: s0, ap, ids } = setup([valki()]);
    const opps = emptyHands(s0, ap);
    const [an] = place(s0, opps[0]!, "hand", [angel()]);
    const [br] = place(s0, opps[1]!, "hand", [bears()]);
    let s = castValki(s0, ap, ids[0]!, (cards) => [cards[0]!]);
    const v = ids[0]!;
    // X = 3: no exiled creature card has mana value 3, so nothing happens.
    s = settle(run(s, planActivate(s, ap, v, 0, undefined, undefined, undefined, 3)));
    expect(ch(s, v).name).toBe("Valki, God of Lies");
    // X = 5: Serra Angel.
    s = settle(run(s, planActivate(s, ap, v, 0, undefined, undefined, undefined, 5)));
    expect(ch(s, v).name).toBe("Serra Angel");
    expect([ch(s, v).power, ch(s, v).toughness]).toEqual([4, 4]);
    expect(ch(s, v).keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    expect(planActivate(s, ap, v, 0, undefined, undefined, undefined, 2)).toBeNull();
    // Still the copy after the turn ends.
    expect(s.objects[an!]!.zone).toBe("exile");
    expect(s.objects[br!]!.zone).toBe("exile");
  });

  it("with two cards of mana value X, its controller chooses one as it resolves", () => {
    const { s: s0, ap, ids } = setup([valki()]);
    const opps = emptyHands(s0, ap);
    const [b1] = place(s0, opps[0]!, "hand", [bears()]);
    const [e1] = place(s0, opps[1]!, "hand", [{ ...elves(), oracleId: "x-elves-2", name: "Llanowar Elves", manaCost: "{1}{G}", cmc: 2 }]);
    let s = castValki(s0, ap, ids[0]!, (cards) => [cards[0]!]);
    const v = ids[0]!;
    s = run(s, planActivate(s, ap, v, 0, undefined, undefined, undefined, 2));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "aegisCopy", player: ap });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([b1, e1].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: e1! }));
    expect(ch(s, v).name).toBe("Llanowar Elves");
  });

  it("if Valki has left before its trigger resolves, the hands are revealed but nothing is exiled", () => {
    const { s: s0, ap, ids } = setup([valki()]);
    const opps = emptyHands(s0, ap);
    const [an] = place(s0, opps[0]!, "hand", [angel()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 50 && !(s.stack.length && s.stack[s.stack.length - 1]!.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, ids[0]!, "graveyard");
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(s.objects[an!]!.zone).toBe("hand");
  });

  it("bots copy the biggest exiled creature card they can pay for, in their main phase", () => {
    const { s: s0, ap, ids } = setup([valki()]);
    const opps = emptyHands(s0, ap);
    place(s0, opps[0]!, "hand", [angel()]);
    place(s0, opps[1]!, "hand", [bears()]);
    let s = castValki(s0, ap, ids[0]!, (cards) => [cards[0]!]);
    // Nothing else in hand; the bot may cast its commander first.
    for (const id of [...s.players[ap]!.hand]) moveObject(s, id, "library");
    let got: Action | undefined;
    for (let i = 0; i < 20 && !got; i++) {
      if (waitingOn(s) !== ap || s.pending) {
        s = act(s, botActions(s, waitingOn(s)!)[0] ?? { type: "passPriority", player: waitingOn(s)! });
        continue;
      }
      const acts = botActions(s, ap);
      got = acts.find((x) => x.type === "activateAbility");
      for (const a of acts) s = act(s, a);
      s = settle(s);
    }
    expect(got).toMatchObject({ type: "activateAbility", objectId: ids[0], x: 5 });
    expect(ch(s, ids[0]!).name).toBe("Serra Angel");
    // Now it's an Angel, with no {X} ability left.
    expect(botActions(s, ap).find((x) => x.type === "activateAbility")).toBeUndefined();
  });
});

describe("round 408: Tibalt, Cosmic Impostor", () => {
  /** Tibalt cast as Valki's back face, on the battlefield with its emblem. */
  function tibalt() {
    const { s: s0, ap, opp, ids } = setup([valki()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    return { s, ap, opp, t: ids[0]! };
  }

  it("enters with an emblem; its +2 exiles the top card of each library, and the emblem's owner may play them", () => {
    const { s: s0, ap, opp, t } = tibalt();
    expect(ch(s0, t).name).toBe("Tibalt, Cosmic Impostor");
    expect(s0.objects[t]!.counters.loyalty).toBe(5);
    const em = (s0.emblems ?? []).map((id) => s0.objects[id]!).filter((o) => o.owner === ap);
    expect(em).toHaveLength(1);
    expect(em[0]!.emblemLink).toBe(`${t}@${s0.objects[t]!.zoneChanges ?? 0}`);
    const [b] = place(s0, opp, "library", [bolt()]);
    let s = settle(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.objects[t]!.counters.loyalty).toBe(7);
    expect(s.objects[b!]!.zone).toBe("exile");
    for (const p of s.turnOrder) expect(s.players[p]!.library.length).toBeGreaterThan(0);
    // The Bolt, an opponent's card: castable by Tibalt's controller, not by its owner.
    expect(castProblem(s, opp, b!, [{ kind: "player", id: opp }])).not.toBeNull();
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("the emblem still works after Tibalt leaves, with mana of any color for spells but not for {C}", () => {
    const { s: s0, ap, opp, t } = tibalt();
    const [an] = place(s0, opp, "library", [angel()]);
    let s = settle(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.objects[an!]!.zone).toBe("exile");
    moveObject(s, t, "graveyard");
    s = settle(s);
    // Five Forests pay {3}{W}{W} as though the green mana were white.
    onlyLands(s, ap, Array.from({ length: 5 }, () => s.cards[Object.values(s.cards).find((d) => d.name === "Forest")!.oracleId]!));
    s = settle(run(s, planCast(s, ap, an!)));
    expect(s.objects[an!]!.zone).toBe("battlefield");
    expect(s.objects[an!]!.controller).toBe(ap);
  });

  it("a land card exiled with Tibalt can be played with a land play (rulings)", () => {
    const { s: s0, ap, opp, t } = tibalt();
    const [w] = place(s0, opp, "library", [wastes()]);
    let s = settle(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.objects[w!]!.zone).toBe("exile");
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: w! });
    expect(s.objects[w!]!.zone).toBe("battlefield");
    expect(s.objects[w!]!.controller).toBe(ap);
  });

  it("its -3's exile is linked too: the exiled permanent's card may be cast by the emblem's owner", () => {
    const { s: s0, ap, opp, t } = tibalt();
    const br = putOnBattlefield(s0, opp, bears());
    const s = settle(run(s0, planActivate(s0, ap, t, 1, [tgt(br)])));
    expect(s.objects[br]!.zone).toBe("exile");
    expect(planCast(s, ap, br)).not.toBeNull();
    expect(planCast(s, opp, br)).toBeNull();
  });

  it("its -8 exiles all graveyards, linked, and adds {R}{R}{R}", () => {
    const { s: s0, ap, opp, t } = tibalt();
    s0.objects[t]!.counters.loyalty = 9;
    const [g] = place(s0, opp, "graveyard", [elves()]);
    const s = settle(run(s0, planActivate(s0, ap, t, 2)));
    expect(s.objects[g!]!.zone).toBe("exile");
    expect(s.players[ap]!.manaPool.R).toBe(3);
    expect(planCast(s, ap, g!)).not.toBeNull();
  });
});
