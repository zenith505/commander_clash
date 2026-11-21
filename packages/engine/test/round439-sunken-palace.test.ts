// Round 439 (Lane A): Sunken Palace ("{1}{U}, {T}, Exile seven cards from your graveyard: Add {U}. When you spend this mana
// to cast a spell or activate an ability, copy that spell or ability. You may choose new targets for the copy.": a delayed
// trigger for the mana, CR 106.6, 603.7a; the copy as in CR 707.10; mana abilities can't be copied).

import { describe, expect, it } from "vitest";
import { act, island, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const palace = (): CardDef => ({"oracleId":"c098c507-5154-423a-a70b-f6dfd4959cf6","name":"Sunken Palace","manaCost":"","cmc":0,"typeLine":"Land — Cave","supertypes":[],"types":["Land"],"subtypes":["Cave"],"oracleText":"This land enters tapped.\n{T}: Add {U}.\n{1}{U}, {T}, Exile seven cards from your graveyard: Add {U}. When you spend this mana to cast a spell or activate an ability, copy that spell or ability. You may choose new targets for the copy. (Mana abilities can't be copied.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/2614a5f6-f8b2-499d-bca2-677b980d3a97.jpg?1783911401","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/2614a5f6-f8b2-499d-bca2-677b980d3a97.jpg?1783911401","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mysticGate = (): CardDef => ({"oracleId":"e9f5feb2-2c1a-46ce-885a-4f378d7d10af","name":"Mystic Gate","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{W/U}, {T}: Add {W}{W}, {W}{U}, or {U}{U}.","colors":[],"colorIdentity":["U","W"],"keywords":[],"producedMana":["C","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a95a6b0-cd73-4754-a53a-26669bc1440b.jpg?1783937934","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a95a6b0-cd73-4754-a53a-26669bc1440b.jpg?1783937934","commanderLegal":"legal","set":"exp","releasedAt":"2016-01-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cancel = (): CardDef => ({"oracleId":"7d00fb28-ea6c-49a9-b4af-ffb38860a9a7","name":"Cancel","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf6e5ad6-ffe2-4588-b357-c415c33fbc11.jpg?1783935790","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf6e5ad6-ffe2-4588-b357-c415c33fbc11.jpg?1783935790","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

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
/** A fresh copy of `def` in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const ABILITY = compileCard(palace()).activated.findIndex((a) => a.mana);

/** Sunken Palace untapped, seven cards in the graveyard, its {U} added (the seven exiled). */
const tapped = () => {
  const { s: s0, ap, opp } = setup([]);
  const p = putOnBattlefield(s0, ap, palace());
  const yard = Array.from({ length: 7 }, () => inYard(s0, ap, mindStone()));
  const s = run(s0, planActivate(s0, ap, p, ABILITY, undefined, undefined, undefined, undefined, { exileCards: yard }, { mana: "U" }));
  return { s, ap, opp, p, yard };
};

describe("round 439: Sunken Palace", () => {
  it("is fully supported: a mana ability whose {U} copies what it's spent on", () => {
    expect(isFullySupported(palace())).toBe(true);
    const ab = compileCard(palace()).activated[ABILITY]!;
    expect(ab.mana).toBe(true);
    expect(ab.costs).toEqual([{ kind: "exileFromGraveyard", n: 7 }]);
    expect(ab.body.effects).toEqual([expect.objectContaining({ type: "addMana", mana: "{U}", spentTrigger: expect.objectContaining({ spellOrAbility: true }) })]);
  });

  it("exiles seven cards and adds {U} without using the stack", () => {
    const { s, ap, p, yard } = tapped();
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(yard.every((id) => zone(s, id) === "exile")).toBe(true);
    expect(s.objects[p]!.tapped).toBe(true);
    expect(s.stack.length).toBe(0);
  });

  it("spent to cast a spell: the copy resolves first, so Divination draws four cards", () => {
    const { s: s0, ap } = tapped();
    const d = toHand(s0, ap, divination());
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, d));
    expect(s.players[ap]!.manaPool.U).toBe(0);
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(1);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4);
    expect(zone(s, d)).toBe("graveyard");
  });

  it("the copy of a targeted spell may get a new target: Unsummon and its copy return two creatures", () => {
    const { s: s0, ap, opp } = tapped();
    const u = toHand(s0, ap, unsummon());
    const a = putOnBattlefield(s0, opp, bears());
    const b = putOnBattlefield(s0, opp, bears());
    let s = run(s0, planCast(s0, ap, u, [{ kind: "object", id: a }]));
    expect(s.players[ap]!.manaPool.U).toBe(0);
    for (let i = 0; i < 20 && s.pending?.kind !== "copyTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "object", id: b }] }));
    expect(zone(s, a)).toBe("hand");
    expect(zone(s, b)).toBe("hand");
  });

  it("not spent on a spell its mana can't pay for: Lightning Bolt leaves the {U} in the pool, and nothing triggers", () => {
    const { s: s0, ap, opp } = tapped();
    const b = toHand(s0, ap, bolt());
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, b, [{ kind: "player", id: opp }]));
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.triggerQueue.length).toBe(0);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("spent to activate an ability: Mind Stone's sacrifice ability is copied, drawing two cards", () => {
    const { s: s0, ap } = tapped();
    const m = putOnBattlefield(s0, ap, mindStone());
    const hand = s0.players[ap]!.hand.length;
    const index = compileCard(mindStone()).activated.findIndex((a) => !a.mana);
    let s = run(s0, planActivate(s0, ap, m, index));
    expect(s.players[ap]!.manaPool.U).toBe(0);
    expect(zone(s, m)).toBe("graveyard");
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("a copy is made even if the spell was countered before the trigger resolved (rulings)", () => {
    const { s: s0, ap, opp } = tapped();
    const d = toHand(s0, ap, divination());
    const c = toHand(s0, opp, cancel());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, island);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, d));
    // The Palace's trigger goes on the stack above Divination; the opponent counters Divination in response to it.
    for (let i = 0; i < 20 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.at(-1)?.kind).toBe("ability");
    const spell = s.stack.find((x) => x.kind === "spell")!;
    s = run(s, planCast(s, opp, c, [{ kind: "stack", id: spell.id }]));
    s = settle(s);
    expect(zone(s, d)).toBe("graveyard");
    expect(zone(s, c)).toBe("graveyard");
    // Countered, Divination drew nothing; its copy drew two.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("spent on a mana ability's cost: it triggers, but mana abilities can't be copied, so Mystic Gate makes its mana once", () => {
    const { s: s0, ap } = tapped();
    const g = putOnBattlefield(s0, ap, mysticGate());
    let s = act(s0, { type: "activateMana", player: ap, objectId: g, mana: "U", ability: 1, combo: 2 });
    expect(s.players[ap]!.manaPool.U).toBe(2);
    expect(s.triggerQueue.length).toBe(1);
    s = settle(s);
    expect(s.players[ap]!.manaPool.U).toBe(2);
  });
});
