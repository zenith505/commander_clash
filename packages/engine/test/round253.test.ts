// Round 253: the top of the popularity list. Brokkos, Apex of Forever (cast from the graveyard only for its mutate cost,
// rulings), Illuna, Apex of Wishes (a nonland permanent card exiled, then put onto the battlefield or into the hand,
// chosen after seeing it; rulings), Plargg, Dean of Chaos // Augusta, Dean of Order (a nonlegendary, nonland card with
// mana value 3 or less, cast as the ability resolves; "untap each creature you control, then tap any number"), Neera, Wild
// Mage (the spell put on the bottom of its owner's library, then a free cast, once each turn), Frodo, Sauron's Bane (the
// Rogue's trigger: the player dealt damage loses the game once the Ring has tempted you four times), Sanwell, Avenger Ace
// (prevention while an artifact creature you control attacks; cast a Vehicle or artifact creature from the top six,
// paying for it), Princess Yue (back as a legendary land named Moon), Living Laser (a token copy for each card discarded
// this turn) and Cataclysmic Prospecting (a Treasure for each mana from a Desert spent to cast it).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, closeZoneBatch, discardCards, botActions, castProblem, characteristics, controllerOf, dealDamage, destroyPermanent, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, timesTempted, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Cards on top of `pid`'s library, `defs[0]` on top; their ids in the same order. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => into(s, pid, d, "library")).reverse();
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** Moves `pid`'s hand to the bottom of their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
  s.players[pid]!.hand = [];
  invalidateCharacteristics(s);
};
/** Removes `pid`'s lands. */
const noLands = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")));
  invalidateCharacteristics(s);
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const treasuresOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).subtypes.includes("Treasure"));

// Real oracle text (Scryfall).
const brokkos = (): CardDef => ({"oracleId":"e9137b54-3464-4f57-95e3-f94bf2ac854e","name":"Brokkos, Apex of Forever","manaCost":"{2}{B}{G}{U}","cmc":5,"typeLine":"Legendary Creature — Nightmare Beast Elemental","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Nightmare","Beast","Elemental"],"oracleText":"Mutate {2}{U/B}{G}{G} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nTrample\nYou may cast this card from your graveyard using its mutate ability.","power":"6","toughness":"6","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Mutate","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9f07625-fbd8-4581-8568-eb3cfb2a4c1e.jpg?1783931028","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9f07625-fbd8-4581-8568-eb3cfb2a4c1e.jpg?1783931028","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"mythic","layout":"mutate","gameChanger":false}) as CardDef;
const illuna = (): CardDef => ({"oracleId":"08daa30f-7ce0-4a72-b539-fbb0c585fd73","name":"Illuna, Apex of Wishes","manaCost":"{2}{G}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Beast Elemental Dinosaur","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Beast","Elemental","Dinosaur"],"oracleText":"Mutate {3}{R/G}{U}{U} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nFlying, trample\nWhenever this creature mutates, exile cards from the top of your library until you exile a nonland permanent card. Put that card onto the battlefield or into your hand.","power":"6","toughness":"6","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Flying","Mutate","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9fc99c81-d112-4811-9bba-77a14d904692.jpg?1783931024","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9fc99c81-d112-4811-9bba-77a14d904692.jpg?1783931024","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"mythic","layout":"mutate","gameChanger":false}) as CardDef;
const plargg = (): CardDef => ({"oracleId":"a0e85762-e433-4a23-bbee-69daeebb5898","name":"Plargg, Dean of Chaos // Augusta, Dean of Order","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Orc Shaman // Legendary Creature — Human Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Orc","Shaman"],"oracleText":"{T}, Discard a card: Draw a card.\n{4}{R}, {T}: Reveal cards from the top of your library until you reveal a nonlegendary, nonland card with mana value 3 or less. You may cast that card without paying its mana cost. Put all revealed cards not cast this way on the bottom of your library in a random order.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5bd9b5cf-f018-48af-a081-995ce8ecc539.jpg?1783927333","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5bd9b5cf-f018-48af-a081-995ce8ecc539.jpg?1783927333","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Plargg, Dean of Chaos","manaCost":"{1}{R}","typeLine":"Legendary Creature — Orc Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Orc","Shaman"],"oracleText":"{T}, Discard a card: Draw a card.\n{4}{R}, {T}: Reveal cards from the top of your library until you reveal a nonlegendary, nonland card with mana value 3 or less. You may cast that card without paying its mana cost. Put all revealed cards not cast this way on the bottom of your library in a random order.","power":"2","toughness":"2","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5bd9b5cf-f018-48af-a081-995ce8ecc539.jpg?1783927333","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5bd9b5cf-f018-48af-a081-995ce8ecc539.jpg?1783927333"},{"name":"Augusta, Dean of Order","manaCost":"{2}{W}","typeLine":"Legendary Creature — Human Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Other tapped creatures you control get +1/+0.\nOther untapped creatures you control get +0/+1.\nWhenever you attack, untap each creature you control, then tap any number of creatures you control.","power":"1","toughness":"3","colors":["W"],"imageUrl":"https://cards.scryfall.io/normal/back/5/b/5bd9b5cf-f018-48af-a081-995ce8ecc539.jpg?1783927333","artUrl":"https://cards.scryfall.io/art_crop/back/5/b/5bd9b5cf-f018-48af-a081-995ce8ecc539.jpg?1783927333"}]}) as CardDef;
const neera = (): CardDef => ({"oracleId":"88fb1dd1-60fb-4f51-ac4d-30b43156a474","name":"Neera, Wild Mage","manaCost":"{4}{U}{R}","cmc":6,"typeLine":"Legendary Creature — Human Elf Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Elf","Shaman"],"oracleText":"Whenever you cast a spell, you may put it on the bottom of its owner's library. If you do, reveal cards from the top of your library until you reveal a nonland card. You may cast that card without paying its mana cost. Then put all revealed cards not cast this way on the bottom of your library in a random order. This ability triggers only once each turn.","power":"2","toughness":"7","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/499bd497-4c72-4a61-88c8-abe2d379fe41.jpg?1783922624","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/499bd497-4c72-4a61-88c8-abe2d379fe41.jpg?1783922624","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const frodo = (): CardDef => ({"oracleId":"8be62f5c-0ab2-4869-97a2-d8a69a3fde95","name":"Frodo, Sauron's Bane","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Halfling Citizen","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Halfling","Citizen"],"oracleText":"{W/B}{W/B}: If Frodo is a Citizen, it becomes a Halfling Scout with base power and toughness 2/3 and lifelink.\n{B}{B}{B}: If Frodo is a Scout, it becomes a Halfling Rogue with \"Whenever this creature deals combat damage to a player, that player loses the game if the Ring has tempted you four or more times this game. Otherwise, the Ring tempts you.\"","power":"1","toughness":"2","colors":["W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/d/7d86dc2e-6f0c-4714-9d30-5d099d3b895c.jpg?1783916334","artUrl":"https://cards.scryfall.io/art_crop/front/7/d/7d86dc2e-6f0c-4714-9d30-5d099d3b895c.jpg?1783916334","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sanwell = (): CardDef => ({"oracleId":"4884ad6c-2290-44fc-ab9e-6e6b75b2d69a","name":"Sanwell, Avenger Ace","manaCost":"{1}{W}","cmc":2,"typeLine":"Legendary Creature — Human Pilot","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Pilot"],"oracleText":"As long as an artifact creature you control is attacking, prevent all damage that would be dealt to Sanwell.\nWhenever Sanwell becomes tapped, exile the top six cards of your library. You may cast a Vehicle or artifact creature spell from among them. Then put the rest on the bottom of your library in a random order.","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70cb4359-8e57-4d1a-bf1f-c188555376ce.jpg?1783919724","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70cb4359-8e57-4d1a-bf1f-c188555376ce.jpg?1783919724","commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const yue = (): CardDef => ({"oracleId":"08c59e5e-d01c-49b7-a812-8ea75e9e945d","name":"Princess Yue","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Human Noble Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Ally"],"oracleText":"When Princess Yue dies, if she was a nonland creature, return this card to the battlefield tapped under your control. She's a land named Moon. She gains \"{T}: Add {C}.\" (She's still legendary.)\n{T}: Scry 2.","power":"3","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1ebccc72-45d3-441c-9680-704f9f61ce67.jpg?1783904827","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1ebccc72-45d3-441c-9680-704f9f61ce67.jpg?1783904827","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const laser = (): CardDef => ({"oracleId":"fd15e02a-dd1e-42ee-8c69-a3e5bcb5ede6","name":"Living Laser","manaCost":"{4}{R}","cmc":5,"typeLine":"Legendary Creature — Elemental Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Villain"],"oracleText":"Haste\nWhenever Living Laser attacks, for each card you've discarded this turn, create a token that's a copy of Living Laser, except the token isn't legendary. The tokens enter tapped and attacking. Exile the tokens at the beginning of the next end step.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/595ee0b4-393f-4bda-bcb4-f0fa43cf7ed2.jpg?1783903282","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/595ee0b4-393f-4bda-bcb4-f0fa43cf7ed2.jpg?1783903282","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const prospecting = (): CardDef => ({"oracleId":"76dc9452-4e81-4152-bb4d-cdec6db767ed","name":"Cataclysmic Prospecting","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Cataclysmic Prospecting deals X damage to each creature. For each mana from a Desert spent to cast this spell, create a tapped Treasure token.","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/149829e6-94bd-49a0-be35-51f37bea7ffb.jpg?1783911968","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/149829e6-94bd-49a0-be35-51f37bea7ffb.jpg?1783911968","commanderLegal":"legal","set":"otc","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const study = card("Test Study", "Sorcery", "{1}{U}", { oracleText: "Draw two cards." });
const ogre = card("Test Ogre", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" });
const hero = card("Test Hero", "Legendary Creature — Human", "{1}{W}", { power: "2", toughness: "2" });
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const vault = card("Test Vault", "Artifact Land", "", { oracleText: "{T}: Add {C}." });
const charm = card("Test Charm", "Enchantment", "{2}{W}");
const golem = card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" });
const cart = card("Test Cart", "Artifact — Vehicle", "{1}", { power: "3", toughness: "3", oracleText: "Crew 1" });
const human = card("Test Human", "Creature — Human", "{1}{W}", { power: "1", toughness: "1" });
const desert = card("Test Desert", "Land — Desert", "", { oracleText: "{T}: Add {R}." });
const mountainish = card("Test Peak", "Land", "", { oracleText: "{T}: Add {R}." });

describe("round 253", () => {
  it("every card of the round compiles fully", () => {
    supported(brokkos(), illuna(), plargg(), neera(), frodo(), sanwell(), yue(), laser(), prospecting());
  });

  it("Brokkos: cast from the graveyard only for its mutate cost, merging with a non-Human creature you own", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const id = into(s0, ap, brokkos(), "graveyard");
    // Its mana cost, from the graveyard: no (rulings).
    expect(castProblem(s0, ap, id, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/only for its mutate cost/);
    let s = run(s0, planCast(s0, ap, id, [tgt(b)], undefined, "auto", undefined, { via: "permission", alt: "mutate" }));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "mutate" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "top" }));
    expect(zone(s, id)).toBe("merged");
    const c = characteristics(s, s.objects[b]!);
    expect(c.name).toBe("Brokkos, Apex of Forever");
    expect(c.keywords).toContain("Trample");
  });

  it("Illuna: as it mutates, exiles down to a nonland permanent card (an artifact land doesn't stop it), then onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([illuna()]);
    const b = putOnBattlefield(s0, ap, bear());
    const [w, bo, v, o] = onTop(s0, ap, [wastes, bolt, vault, ogre]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { alt: "mutate" }));
    s = settle(s);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "top" }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", labels: ["Put Test Ogre onto the battlefield", "Put Test Ogre into your hand"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(zone(s, o!)).toBe("battlefield");
    expect(controllerOf(s, s.objects[o!]!)).toBe(ap);
    // The land, the instant and the artifact land stay exiled (rulings).
    for (const id of [w!, bo!, v!]) expect(zone(s, id)).toBe("exile");
  });

  it("Illuna: or into your hand; with no nonland permanent card, every card is exiled", () => {
    const { s: s0, ap, ids } = setup([illuna()]);
    const b = putOnBattlefield(s0, ap, bear());
    const [c] = onTop(s0, ap, [charm]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { alt: "mutate" }));
    s = settle(act(settle(s), { type: "chooseOption", player: ap, choice: "bottom" }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(zone(s, c!)).toBe("hand");
    const { s: s1, ap: ap1, ids: ids1 } = setup([illuna()]);
    const b1 = putOnBattlefield(s1, ap1, bear());
    s1.players[ap1]!.library = [];
    const [w1, bo1] = onTop(s1, ap1, [wastes, bolt]);
    let s2 = run(s1, planCast(s1, ap1, ids1[0]!, [tgt(b1)], undefined, "auto", undefined, { alt: "mutate" }));
    s2 = settle(act(settle(s2), { type: "chooseOption", player: ap1, choice: "top" }));
    expect(s2.pending).toBeNull();
    expect(zone(s2, w1!)).toBe("exile");
    expect(zone(s2, bo1!)).toBe("exile");
  });

  it("Illuna: a bot puts the card onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([illuna()]);
    const b = putOnBattlefield(s0, ap, bear());
    const [o] = onTop(s0, ap, [ogre]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { alt: "mutate" }));
    s = settleBots(s);
    expect(zone(s, o!)).toBe("battlefield");
  });

  it("Plargg: reveals down to a nonlegendary, nonland card with mana value 3 or less, cast free as it resolves; the rest to the bottom", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const p = putOnBattlefield(s0, ap, plargg());
    const [h, w, o, st] = onTop(s0, ap, [hero, wastes, ogre, study]);
    let s = settle(run(s0, planActivate(s0, ap, p, 1)));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: st });
    s = settle(run(s, planCast(s, ap, st!)));
    expect(zone(s, st!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(2);
    // The legendary card, the land and the 5-drop go to the bottom; none of them was drawn.
    const lib = s.players[ap]!.library;
    expect(lib.slice(-3).sort()).toEqual([h!, w!, o!].sort());
    expect(s.players[ap]!.hand).not.toContain(h);
  });

  it("Plargg: a card not cast goes to the bottom with the rest", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, plargg());
    const [w, st] = onTop(s0, ap, [wastes, study]);
    let s = settle(run(s0, planActivate(s0, ap, p, 1)));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: st });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, st!)).toBe("library");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([w!, st!].sort());
  });

  it("Augusta: whenever you attack, untap each creature you control, then tap any number of them", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, plargg());
    s0.objects[a]!.face = 1;
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[a]!).name).toBe("Augusta, Dean of Order");
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap" });
    expect(s.objects[b1]!.tapped).toBeFalsy(); // untapped by the trigger
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toEqual(expect.arrayContaining([a, b1, b2]));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b1] }));
    expect(s.objects[b1]!.tapped).toBe(true);
    expect(s.objects[b1]!.attacking).toBe(opp);
    expect(pt(s, b1)).toBe("3/2"); // other tapped creatures get +1/+0
    expect(pt(s, b2)).toBe("2/3"); // other untapped ones get +0/+1
  });

  it("Augusta: a bot taps only its attacking creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, plargg());
    s0.objects[a]!.face = 1;
    invalidateCharacteristics(s0);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settleBots(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }] }));
    expect(s.objects[b1]!.tapped).toBe(true);
    expect(s.objects[b2]!.tapped).toBeFalsy();
    expect(s.objects[a]!.tapped).toBeFalsy();
  });

  it("Neera: the spell goes to the bottom of its owner's library, then a nonland card is revealed and cast free; once each turn", () => {
    const { s: s0, ap, ids } = setup([study, study]);
    putOnBattlefield(s0, ap, neera());
    const [w, o] = onTop(s0, ap, [wastes, ogre]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, ids[0]!)).toBe("library");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: o });
    s = settle(run(s, planCast(s, ap, o!)));
    expect(zone(s, o!)).toBe("battlefield");
    // The land revealed goes to the bottom too, below or above the spell; the spell never resolved.
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([ids[0]!, w!].sort());
    expect(s.players[ap]!.hand).toContain(ids[1]!);
    expect(s.players[ap]!.hand).not.toContain(ids[0]!);
    // The second spell this turn: no trigger.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("Neera: declining keeps the spell; a spell countered in response can't be put there, so nothing is revealed", () => {
    const { s: s0, ap, ids } = setup([study]);
    putOnBattlefield(s0, ap, neera());
    const [o] = onTop(s0, ap, [ogre]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand).toContain(o); // drawn by the spell, not revealed
    const { s: s1, ap: ap1, ids: ids1 } = setup([study]);
    putOnBattlefield(s1, ap1, neera());
    const [o1] = onTop(s1, ap1, [ogre]);
    let s2 = run(s1, planCast(s1, ap1, ids1[0]!));
    // The spell leaves the stack before the trigger resolves.
    const item = s2.stack.find((x) => x.objectId === ids1[0]);
    s2.stack = s2.stack.filter((x) => x !== item);
    s2.objects[ids1[0]!]!.zone = "graveyard";
    s2.players[ap1]!.graveyard.push(ids1[0]!);
    s2 = settle(s2);
    expect(s2.pending).toBeNull();
    expect(zone(s2, o1!)).toBe("library");
    expect(s2.players[ap1]!.library[0]).toBe(o1);
  });

  it("Neera: a bot puts a cheap spell on the bottom, not an expensive one", () => {
    const { s: s0, ap, ids } = setup([study, ogre]);
    putOnBattlefield(s0, ap, neera());
    onTop(s0, ap, [ogre]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("library");
    const { s: s1, ap: ap1, ids: ids1 } = setup([ogre]);
    putOnBattlefield(s1, ap1, neera());
    const s2 = settleBots(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(zone(s2, ids1[0]!)).toBe("battlefield");
  });

  it("Frodo, Sauron's Bane: Citizen to Scout to Rogue; the Rogue's combat damage makes the Ring tempt you", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, frodo());
    // Only a Scout becomes a Rogue (rulings: checked as it resolves).
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, B: 3 };
    let s = settle(run(s0, planActivate(s0, ap, f, 1)));
    expect(characteristics(s, s.objects[f]!).subtypes).toEqual(["Halfling", "Citizen"]);
    s = settle(run(s, planActivate(s, ap, f, 0)));
    expect(characteristics(s, s.objects[f]!).subtypes).toEqual(["Halfling", "Scout"]);
    expect(pt(s, f)).toBe("2/3");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 3 };
    s = settle(run(s, planActivate(s, ap, f, 1)));
    const c = characteristics(s, s.objects[f]!);
    expect(c.subtypes).toEqual(["Halfling", "Rogue"]);
    expect(c.keywords).toContain("Lifelink");
    // The granted trigger compiles fully.
    const granted = abilitiesOf(s, s.objects[f]!).triggers.find((t) => t.event === "selfDealsCombatDamageToPlayer");
    expect(granted?.body.effects).toMatchObject([{ type: "if", cond: { kind: "state", cond: { kind: "ringTempted", n: 4 } }, effects: [{ type: "loseGame" }], otherwise: [{ type: "ringTempts" }] }]);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }] }));
    s = settle(passUntil(s, "combatDamage", ap));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [f] }));
    expect(timesTempted(s, ap)).toBe(1);
    expect(s.players[opp]!.lost).toBeFalsy();
  });

  it("Frodo, Sauron's Bane: once the Ring has tempted you four or more times, that player loses the game", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, frodo());
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, B: 3 };
    let s = settle(run(s0, planActivate(s0, ap, f, 0)));
    s = settle(run(s, planActivate(s, ap, f, 1)));
    s.players[ap]!.ring = { tempted: 4, timestamp: s.nextTimestamp++ };
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }] }));
    s = settle(passUntil(s, "combatDamage", ap));
    expect(s.players[opp]!.lost).toBe(true);
    expect(timesTempted(s, ap)).toBe(4);
  });

  it("Sanwell: while an artifact creature you control is attacking, damage to it is prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, sanwell());
    const g = putOnBattlefield(s0, ap, golem);
    const b = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    // A nonartifact attacker doesn't do: dealt (Sanwell is a 2/1).
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    expect(dealDamage(s, objectSource(s, s.objects[theirs]!), { object: s.objects[sw]! }, 1)).toBe(1);
    // An attacking artifact creature you control: prevented.
    let s1 = passUntil(s0, "declareAttackers", ap);
    s1 = settle(act(s1, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] }));
    expect(dealDamage(s1, objectSource(s1, s1.objects[theirs]!), { object: s1.objects[sw]! }, 2)).toBe(0);
    expect(s1.objects[sw]!.damage).toBe(0);
    expect(s1.objects[sw]!.zone).toBe("battlefield");
    // Not attacking: dealt.
    expect(dealDamage(s0, objectSource(s0, s0.objects[theirs]!), { object: s0.objects[sw]! }, 1)).toBe(1);
  });

  it("Sanwell: becoming tapped, exile the top six; cast a Vehicle or artifact creature among them, paying its costs; the rest to the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const sw = putOnBattlefield(s0, ap, sanwell());
    const six = onTop(s0, ap, [ogre, golem, wastes, cart, study, charm]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sw, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect(s.pending?.kind === "chooseOption" && [...s.pending.options].sort()).toEqual([six[1]!, six[3]!, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: six[1]! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: six[1], how: "paid" });
    s = settle(run(s, planCast(s, ap, six[1]!)));
    expect(zone(s, six[1]!)).toBe("battlefield");
    // Paid for: two lands tapped beside Sanwell.
    const tappedLands = s.battlefield.filter((id) => s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land"));
    expect(tappedLands.length).toBe(2);
    for (const id of [six[0]!, six[2]!, six[3]!, six[4]!, six[5]!]) expect(zone(s, id)).toBe("library");
    expect(s.players[ap]!.library.slice(-5).sort()).toEqual([six[0]!, six[2]!, six[3]!, six[4]!, six[5]!].sort());
  });

  it("Princess Yue: dies, returns tapped under your control as a legendary land named Moon with {T}: Add {C}", () => {
    const { s: s0, ap, opp } = setup([]);
    const y = putOnBattlefield(s0, ap, yue());
    // An opponent owns it: it returns under your control (its controller as it died).
    s0.objects[y]!.owner = opp;
    destroyPermanent(s0, s0.objects[y]!, "destroyed");
    const s = settle(s0);
    expect(zone(s, y)).toBe("battlefield");
    const o = s.objects[y]!;
    expect(o.tapped).toBe(true);
    expect(controllerOf(s, o)).toBe(ap);
    const c = characteristics(s, o);
    expect(c.name).toBe("Moon");
    expect(c.types).toEqual(["Land"]);
    expect(c.subtypes).toEqual([]);
    expect(c.supertypes).toContain("Legendary");
    const ab = abilitiesOf(s, o);
    expect(ab.mana.some((m) => m.text === "{T}: Add {C}.")).toBe(true);
    expect(ab.activated.some((a) => a.text === "{T}: Scry 2.")).toBe(true);
    // A legendary creature named Princess Yue and the land named Moon at once (rulings): no legend rule.
    const y2 = putOnBattlefield(s, ap, yue());
    const s2 = settle(s);
    expect(zone(s2, y2)).toBe("battlefield");
    expect(zone(s2, y)).toBe("battlefield");
  });

  it("Princess Yue: as a land it doesn't come back again", () => {
    const { s: s0, ap } = setup([]);
    const y = putOnBattlefield(s0, ap, yue());
    destroyPermanent(s0, s0.objects[y]!, "destroyed");
    let s = settle(s0);
    expect(characteristics(s, s.objects[y]!).name).toBe("Moon");
    destroyPermanent(s, s.objects[y]!, "destroyed");
    s = settle(s);
    expect(zone(s, y)).toBe("graveyard");
  });

  it("Living Laser: attacking, a non-legendary token copy for each card you discarded this turn, tapped and attacking, exiled at the end step", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, laser());
    discardCards(s0, ap, s0.players[ap]!.hand.slice(0, 2));
    closeZoneBatch(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] }));
    if (s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom") s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    if (s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom") s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const tokens = named(s, "Living Laser").filter((id) => id !== l);
    expect(tokens.length).toBe(2);
    for (const t of tokens) {
      const o = s.objects[t]!;
      expect(o.isToken).toBe(true);
      expect(o.tapped).toBe(true);
      expect(o.attacking).toBe(opp);
      expect(characteristics(s, o).supertypes).not.toContain("Legendary");
    }
    expect(zone(s, l)).toBe("battlefield"); // no legend rule
    s = settle(passUntil(s, "end", ap));
    for (const t of tokens) expect(s.objects[t]?.zone ?? "gone").not.toBe("battlefield");
  });

  it("Living Laser: no card discarded this turn, no token", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, laser());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] }));
    expect(named(s, "Living Laser")).toEqual([l]);
  });

  it("Cataclysmic Prospecting: X damage to each creature; a tapped Treasure for each mana from a Desert spent to cast it", () => {
    const { s: s0, ap, opp, ids } = setup([prospecting()]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, desert);
    putOnBattlefield(s0, ap, desert);
    putOnBattlefield(s0, ap, mountainish);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear({ toughness: "3" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 1)));
    expect(s.objects[mine]!.damage).toBe(1);
    expect(s.objects[theirs]!.damage).toBe(1);
    const treasures = treasuresOf(s, ap);
    expect(treasures.length).toBe(2);
    for (const t of treasures) expect(s.objects[t]!.tapped).toBe(true);
  });

  it("Cataclysmic Prospecting: no Desert mana, no Treasure", () => {
    const { s: s0, ap, ids } = setup([prospecting()]);
    noLands(s0, ap);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, mountainish);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 1)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(treasuresOf(s, ap).length).toBe(0);
  });

  it("Brokkos: no non-Human creature you own, no cast from the graveyard; a bot casts it from there", () => {
    const { s: s0, ap } = setup([]);
    const id = into(s0, ap, brokkos(), "graveyard");
    const h = putOnBattlefield(s0, ap, human);
    expect(planCast(s0, ap, id, [tgt(h)], undefined, "auto", undefined, { via: "permission", alt: "mutate" })).toBeNull();
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    s0.players[ap]!.landsPlayedThisTurn = 1;
    const plan = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === id);
    expect(plan).toMatchObject({ via: "permission", alt: "mutate", targets: [tgt(b)] });
  });
});
