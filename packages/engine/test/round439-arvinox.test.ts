// Round 439 (Lane A): Arvinox, the Mind Flail ("~ isn't a creature unless you control three or more permanents you don't
// own." and "At the beginning of your end step, exile the bottom card of each opponent's library face down. For as long as
// those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana
// as though it were mana of any color to cast those spells.").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, compileCard, invalidateCharacteristics, isFullySupported, objIsType, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const arvinox = (): CardDef => ({"oracleId":"9abecd23-a2d9-43c7-8d01-f8afdc53026e","name":"Arvinox, the Mind Flail","manaCost":"{4}{B}{B}{B}","cmc":7,"typeLine":"Legendary Enchantment Creature — Horror","supertypes":["Legendary"],"types":["Enchantment","Creature"],"subtypes":["Horror"],"oracleText":"Arvinox isn't a creature unless you control three or more permanents you don't own.\nAt the beginning of your end step, exile the bottom card of each opponent's library face down. For as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells.","power":"9","toughness":"9","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c83542de-38ca-4aad-acba-189374be37e2.jpg?1783923612","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c83542de-38ca-4aad-acba-189374be37e2.jpg?1783923612","commanderLegal":"legal","set":"slx","releasedAt":"2022-03-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;

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
/** A fresh copy of `def` at the bottom of `pid`'s library. */
const onBottom = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** A permanent `owner` owns that `pid` controls (as if stolen). */
const stolen = (s: GameState, pid: PlayerId, owner: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, owner, def);
  s.objects[id]!.controller = pid;
  invalidateCharacteristics(s);
  return id;
};

/** Arvinox on the battlefield; each opponent's bottom card set; the active player at their end step with the trigger resolved. */
const atEnd = (bottoms: (() => CardDef)[]) => {
  const { s: s0, ap } = setup([]);
  const a = putOnBattlefield(s0, ap, arvinox());
  const opps = s0.turnOrder.filter((p) => p !== ap);
  const cards = opps.map((p, i) => onBottom(s0, p, bottoms[i % bottoms.length]!()));
  let s = passUntil(s0, "end", ap);
  s = settle(s);
  return { s, ap, a, opps, cards };
};

describe("round 439: Arvinox, the Mind Flail", () => {
  it("is fully supported", () => {
    expect(isFullySupported(arvinox())).toBe(true);
    const c = compileCard(arvinox());
    expect(c.statics).toHaveLength(1);
    expect(c.triggers).toEqual([expect.objectContaining({ event: "yourEndStep" })]);
  });

  it("isn't a creature unless you control three or more permanents you don't own (your own don't count)", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, arvinox());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, bears());
    invalidateCharacteristics(s);
    expect(objIsType(s, s.objects[a]!, "Creature")).toBe(false);
    expect(objIsType(s, s.objects[a]!, "Enchantment")).toBe(true);
    stolen(s, ap, opp, bears());
    stolen(s, ap, opp, forestCard());
    expect(objIsType(s, s.objects[a]!, "Creature")).toBe(false);
    stolen(s, ap, s.turnOrder.find((p) => p !== ap && p !== opp)!, bears());
    expect(objIsType(s, s.objects[a]!, "Creature")).toBe(true);
    expect(s.objects[a]!.zone).toBe("battlefield");
    // A permanent you own that an opponent controls doesn't count for you.
    const { s: t, ap: me, opp: them } = setup([]);
    const b = putOnBattlefield(t, me, arvinox());
    for (let i = 0; i < 3; i++) stolen(t, them, me, bears());
    expect(objIsType(t, t.objects[b]!, "Creature")).toBe(false);
  });

  it("at your end step exiles the bottom card of each opponent's library face down, which only you may look at", () => {
    const { s, ap, opps, cards } = atEnd([bears]);
    for (const [i, id] of cards.entries()) {
      expect(zone(s, id)).toBe("exile");
      expect(s.players[opps[i]!]!.library.includes(id)).toBe(false);
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "exiled", castOnly: true, permanentOnly: true, anyColor: true });
    }
  });

  it("you may cast a permanent spell from among them, paying its colored mana with any mana, and you control it", () => {
    const { s: s0, ap, opps, cards } = atEnd([bears]);
    // On your next turn, with only Islands: Grizzly Bears' {G} is paid with blue mana.
    let s = passUntil(s0, "main1", ap);
    const b = cards[0]!;
    expect(zone(s, b)).toBe("exile");
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Land")) s.objects[id]!.tapped = !(s.cards[s.objects[id]!.cardId]!.name === "Island");
    const plan = planCast(s, ap, b);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.owner).toBe(opps[0]);
    expect(s.objects[b]!.controller).toBe(ap);
  });

  it("not an instant, a land, or an adventurer's Adventure; the adventurer itself as a creature spell", () => {
    const { s: s0, ap, cards } = atEnd([bolt, forestCard, giant]);
    const s = passUntil(s0, "main1", ap);
    const [b, f, g] = cards;
    expect(castProblem(s, ap, b!, [{ kind: "player", id: ap }])).toMatch(/only as a permanent spell/);
    expect(planCast(s, ap, f!)).toBeNull();
    expect(castProblem(s, ap, g!, [{ kind: "player", id: ap }], undefined, undefined, undefined, undefined, { face: 1 })).toMatch(/only as a permanent spell/);
    expect(planCast(s, ap, g!)).not.toBeNull();
  });

  it("a bot casts the creature it exiled with Arvinox", () => {
    const { s: s0, ap, cards } = atEnd([bears]);
    const s = passUntil(s0, "main1", ap);
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "castSpell" && a.objectId === cards[0])).toBe(true);
  });
});
