// Round 240: cards from the top of the popularity list. The Belligerent ("you may look at the top card of your library
// any time, and you may play lands and cast spells from the top of your library" until end of turn); Life and Limb
// ("All Forests and all Saprolings are 1/1 green Saproling creatures and Forest lands in addition to their other
// types"); Nissa, Worldsoul Speaker ("You may pay eight {E} rather than pay the mana cost for permanent spells you
// cast"); Case of the Uneaten Feast ("Creature cards in your graveyard gain "You may cast this card from your graveyard"
// until end of turn"); Moritte of the Frost (a copy that's legendary and snow, and if it's a creature, with two more
// +1/+1 counters and changeling); Hulking Metamorph (a copy that's an artifact creature with its own power and
// toughness, the prototype's if prototyped); Immortal Obligation (an opponent's creature card returned under their control,
// goaded and kept off you while it has a duty counter); Choco, Seeker of Paradise ("look at that many cards ... You may
// put one of them into your hand. Then put any number of land cards from among them onto the battlefield tapped and the
// rest into your graveyard").

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, applyAction, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { abilitiesOf } from "../src/cards";
import { topVisible } from "../src/game";
import { manaAbilitiesOn } from "../src/manaabilities";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" yes. Stops at any other question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

// Real oracle text (Scryfall).
const belligerent = (): CardDef => ({"oracleId":"9a0c9023-9431-4f98-b167-ab4c7215319c","name":"The Belligerent","manaCost":"{2}{U}{R}","cmc":4,"typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Whenever The Belligerent attacks, create a Treasure token. Until end of turn, you may look at the top card of your library any time, and you may play lands and cast spells from the top of your library.\nCrew 3","power":"5","toughness":"5","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Treasure","Crew"],"commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const limb = (): CardDef => ({"oracleId":"d0d7250b-70d2-43f9-ae15-837227061ccb","name":"Life and Limb","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"All Forests and all Saprolings are 1/1 green Saproling creatures and Forest lands in addition to their other types. (They're affected by summoning sickness.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nissa = (): CardDef => ({"oracleId":"00037840-6089-42ec-8c5c-281f9f474504","name":"Nissa, Worldsoul Speaker","manaCost":"{3}{G}","cmc":4,"typeLine":"Legendary Creature — Elf Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"Landfall — Whenever a land you control enters, you get {E}{E} (two energy counters).\nYou may pay eight {E} rather than pay the mana cost for permanent spells you cast.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Landfall"],"commanderLegal":"legal","set":"drc","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const feast = (): CardDef => ({"oracleId":"0d8730b5-f7ba-48b0-928d-d8b7685347d3","name":"Case of the Uneaten Feast","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Case","supertypes":[],"types":["Enchantment"],"subtypes":["Case"],"oracleText":"Whenever a creature you control enters, you gain 1 life.\nTo solve — You've gained 5 or more life this turn. (If unsolved, solve at the beginning of your end step.)\nSolved — Sacrifice this Case: Creature cards in your graveyard gain \"You may cast this card from your graveyard\" until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":["Solved"],"commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"case","gameChanger":false}) as CardDef;
const moritte = (): CardDef => ({"oracleId":"78699161-fc14-4a44-8a15-0f7c08be0343","name":"Moritte of the Frost","manaCost":"{2}{G}{U}{U}","cmc":5,"typeLine":"Legendary Snow Creature — Shapeshifter","supertypes":["Legendary","Snow"],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nYou may have Moritte enter as a copy of a permanent you control, except it's legendary and snow in addition to its other types and, if it's a creature, it enters with two additional +1/+1 counters on it and has changeling.","power":"0","toughness":"0","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Changeling"],"commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const metamorph = (): CardDef => ({"oracleId":"b2b09dc3-8239-4f3b-91d2-e7cbbdc062f7","name":"Hulking Metamorph","manaCost":"{9}","cmc":9,"typeLine":"Artifact Creature — Shapeshifter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Shapeshifter"],"oracleText":"Prototype {2}{U}{U} — 3/3 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nYou may have this creature enter as a copy of an artifact or creature you control, except it's an artifact creature in addition to its other types, and its power and toughness are equal to this creature's power and toughness.","power":"7","toughness":"7","colors":[],"colorIdentity":["U"],"keywords":["Prototype"],"commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"uncommon","layout":"prototype","gameChanger":false}) as CardDef;
const obligation = (): CardDef => ({"oracleId":"b34080fe-69d1-4cc9-9feb-c37762f26a23","name":"Immortal Obligation","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature card from an opponent's graveyard to the battlefield under their control with a duty counter on it. For as long as that creature has a duty counter on it, it is goaded, can't attack you or a permanent you control, and can't block creatures you control.","colors":["W"],"colorIdentity":["W"],"keywords":["Goad"],"commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const choco = (): CardDef => ({"oracleId":"7979bf83-5091-4e62-8885-ca1833a97306","name":"Choco, Seeker of Paradise","manaCost":"{1}{G}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Bird","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird"],"oracleText":"Whenever one or more Birds you control attack, look at that many cards from the top of your library. You may put one of them into your hand. Then put any number of land cards from among them onto the battlefield tapped and the rest into your graveyard.\nLandfall — Whenever a land you control enters, Choco gets +1/+0 until end of turn.","power":"3","toughness":"5","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Landfall"],"commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const ogre = card("Hill Ogre", "Creature — Ogre", "{3}{R}", { power: "3", toughness: "3" });
const rock = card("Test Rock", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
const saproling = card("Saproling Token", "Creature — Saproling", "", { power: "1", toughness: "1", colors: ["G"] });
const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const automaton = card("Blitz Automaton", "Artifact Creature — Construct", "{7}", { power: "6", toughness: "4", keywords: ["Haste", "Prototype"], oracleText: "Prototype {2}{R} — 3/2 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nHaste" });

describe("round 240 cards", () => {
  it("are fully supported", () => supported(belligerent(), limb(), nissa(), feast(), moritte(), metamorph(), obligation(), choco()));
});

describe("The Belligerent", () => {
  it("attacking makes a Treasure and lets you see and cast the top card of your library until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, belligerent());
    const crew = [putOnBattlefield(s0, ap, ogre)];
    const top = into(s0, ap, ogre, "library");
    expect(topVisible(s0, ap, ap)).toBe(false);
    expect(castProblem(s0, ap, top)).not.toBeNull();
    const idx = abilitiesOf(s0, s0.objects[b]!).activated.findIndex((a) => /^Crew/.test(a.text));
    let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: b, index: idx, tapCreatures: crew }));
    expect(characteristics(s, s.objects[b]!).types).toContain("Creature");
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]?.name === "Treasure Token" && s.objects[id]!.controller === ap)).toBe(true);
    expect(topVisible(s, ap, ap)).toBe(true);
    expect(topVisible(s, ap, opp)).toBe(false);
    s = passUntil(s, "main2", ap);
    // Cast for its mana cost (no life instead, unlike Gwenom).
    expect(altCostsFor(s, ap, s.objects[top]!).map((a) => a.kind)).toEqual([]);
    s = run(s, planCast(s, ap, top));
    expect(s.objects[top]!.zone).toBe("stack");
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("battlefield");
    // The next turn: no longer.
    const next = into(s, ap, ogre, "library");
    s = passUntil(s, "upkeep");
    expect(topVisible(s, ap, ap)).toBe(false);
    expect(castProblem(s, ap, next)).not.toBeNull();
  });
});

describe("Life and Limb", () => {
  it("Forests and Saprolings are 1/1 green Saproling creatures and Forest lands, keeping their other types", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, limb());
    const f = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]?.name === "Forest")!;
    const sap = putOnBattlefield(s, ap, saproling);
    const m = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]?.name === "Mountain")!;
    invalidateCharacteristics(s);
    for (const id of [f, sap]) {
      const c = characteristics(s, s.objects[id]!);
      expect(c.types).toEqual(expect.arrayContaining(["Creature", "Land"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Saproling"]));
      expect(c.colors).toEqual(["G"]);
      expect(pt(s, id)).toBe("1/1");
    }
    // The Saproling is a Forest, so it has "{T}: Add {G}" (CR 305.6).
    expect(manaAbilitiesOn(s, s.objects[sap]!).map((a) => a.produces)).toEqual([{ kind: "fixed", mana: ["G"] }]);
    // A Mountain isn't affected.
    expect(characteristics(s, s.objects[m]!).types).toEqual(["Land"]);
  });
});

describe("Nissa, Worldsoul Speaker", () => {
  it("pay eight energy rather than the mana cost of a permanent spell, not an instant", () => {
    const { s: s0, ap, ids } = setup([ogre, bolt]);
    putOnBattlefield(s0, ap, nissa());
    s0.players[ap]!.energy = 7;
    expect(altCostsFor(s0, ap, s0.objects[ids[0]!]!).map((a) => a.kind)).toContain("energyForSpell");
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "energyForSpell" })).toMatch(/8 energy/);
    expect(altCostsFor(s0, ap, s0.objects[ids[1]!]!).map((a) => a.kind)).not.toContain("energyForSpell");
    s0.players[ap]!.energy = 9;
    const untapped = s0.battlefield.filter((id) => !s0.objects[id]!.tapped).length;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "energyForSpell" }));
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.battlefield.filter((id) => !s.objects[id]!.tapped).length).toBe(untapped);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
  it("landfall: you get two energy", () => {
    const { s: s0, ap, ids } = setup([forest]);
    putOnBattlefield(s0, ap, nissa());
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(s.players[ap]!.energy).toBe(2);
  });
});

describe("Case of the Uneaten Feast", () => {
  it("solved, sacrifice it: creature cards in your graveyard now may be cast from there this turn, not ones put there later", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, feast());
    s0.objects[c]!.solved = true;
    const there = into(s0, ap, ogre, "graveyard");
    const instant = into(s0, ap, bolt, "graveyard");
    expect(castProblem(s0, ap, there, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).not.toBeNull();
    const idx = abilitiesOf(s0, s0.objects[c]!).activated.findIndex((a) => /^Sacrifice/.test(a.text));
    let s = settle(run(s0, planActivate(s0, ap, c, idx)));
    expect(s.objects[c]!.zone).toBe("graveyard");
    const later = into(s, ap, bear(), "graveyard");
    expect(castProblem(s, ap, instant, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).not.toBeNull();
    expect(castProblem(s, ap, later, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).not.toBeNull();
    s = settle(run(s, planCast(s, ap, there, undefined, undefined, "auto", undefined, { via: "permission" })));
    expect(s.objects[there]!.zone).toBe("battlefield");
  });
  it("can't be activated unsolved, and the permission ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, feast());
    const idx = abilitiesOf(s0, s0.objects[c]!).activated.findIndex((a) => /^Sacrifice/.test(a.text));
    expect(planActivate(s0, ap, c, idx)).toBeNull();
    s0.objects[c]!.solved = true;
    const there = into(s0, ap, ogre, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, c, idx)));
    s = passUntil(s, "upkeep");
    s = passUntil(s, "main1", ap);
    expect(castProblem(s, ap, there, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).not.toBeNull();
  });
});

/** Cast `id` (with `choices`) and stop at the "enter as a copy" choice. */
const toCopyChoice = (s: GameState, ap: PlayerId, id: string, choices = {}) => {
  s = run(s, planCast(s, ap, id, undefined, undefined, "auto", undefined, choices));
  for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
  return s;
};

describe("Moritte of the Frost", () => {
  it("a copy of a creature: legendary and snow, two more +1/+1 counters, changeling", () => {
    const { s: s0, ap, ids } = setup([moritte()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = toCopyChoice(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }));
    const o = s.objects[ids[0]!]!;
    const c = characteristics(s, o);
    expect(c.name).toBe("Grizzly Bears");
    expect(c.supertypes).toEqual(expect.arrayContaining(["Legendary", "Snow"]));
    expect(o.counters["+1/+1"]).toBe(2);
    expect(c.allCreatureTypes).toBe(true);
    expect(pt(s, ids[0]!)).toBe("4/4");
    // Not legendary itself, the bear stays (rulings).
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
  it("a copy of a noncreature permanent: legendary and snow, no counters, no changeling", () => {
    const { s: s0, ap, ids } = setup([moritte()]);
    const r = putOnBattlefield(s0, ap, rock);
    let s = toCopyChoice(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: r }));
    const o = s.objects[ids[0]!]!;
    const c = characteristics(s, o);
    expect(c.name).toBe("Test Rock");
    expect(c.supertypes).toEqual(expect.arrayContaining(["Legendary", "Snow"]));
    expect(c.types).toEqual(["Artifact"]);
    expect(o.counters["+1/+1"] ?? 0).toBe(0);
    expect(c.allCreatureTypes).toBe(false);
  });
});

describe("Hulking Metamorph", () => {
  it("cast normally: a copy that's an artifact creature, 7/7", () => {
    const { s: s0, ap, ids } = setup([metamorph()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = toCopyChoice(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }));
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Grizzly Bears");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, ids[0]!)).toBe("7/7");
  });
  it("prototyped: a 3/3 copy, even of a prototype card cast normally (the copied values, not its own prototype's)", () => {
    const { s: s0, ap, ids } = setup([metamorph()]);
    const auto = putOnBattlefield(s0, ap, automaton);
    let s = toCopyChoice(s0, ap, ids[0]!, { alt: "prototype" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: auto }));
    const o = s.objects[ids[0]!]!;
    const c = characteristics(s, o);
    expect(c.name).toBe("Blitz Automaton");
    expect(pt(s, ids[0]!)).toBe("3/3");
    // The copied card's mana cost and colors, not its prototype's (CR 707.2, 718.2a).
    expect(c.colors).toEqual([]);
    expect(s.cards[s.objects[ids[0]!]!.copyOf!]!.manaCost).toBe("{7}");
  });
});

describe("Immortal Obligation", () => {
  it("returns an opponent's creature card under their control with a duty counter: goaded by you, can't attack you or block your creatures, while it has the counter", () => {
    const { s: s0, ap, ids, opp } = setup([obligation()]);
    const g = into(s0, opp, ogre, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: g }]));
    s = settle(s);
    const o = s.objects[g]!;
    expect(o.zone).toBe("battlefield");
    expect(o.controller).toBe(opp);
    expect(o.counters.duty).toBe(1);
    let c = characteristics(s, o);
    expect(c.goadedBy).toEqual([ap]);
    expect(c.cantAttackPlayers).toContain(ap);
    expect(c.cantBlockCreatures.some((f) => f.controlledBy === ap)).toBe(true);
    // Without the counter, none of it.
    delete s.objects[g]!.counters.duty;
    invalidateCharacteristics(s);
    c = characteristics(s, s.objects[g]!);
    expect(c.goadedBy).toEqual([]);
    expect(c.cantAttackPlayers).not.toContain(ap);
    expect(c.cantBlockCreatures).toEqual([]);
  });
  it("can't target a card in your own graveyard", () => {
    const { s: s0, ap, ids } = setup([obligation()]);
    const g = into(s0, ap, ogre, "graveyard");
    expect(planCast(s0, ap, ids[0]!, [{ kind: "object", id: g }])).toBeNull();
  });
});

describe("Choco, Seeker of Paradise", () => {
  const bird = card("Test Bird", "Creature — Bird", "{1}{W}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
  const land = card("Test Land", "Land", "", { oracleText: "{T}: Add {G}." });
  it("two Birds attack: look at two cards, one to your hand, then lands onto the battlefield tapped, the rest to the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const c = putOnBattlefield(s0, ap, choco());
    const b = putOnBattlefield(s0, ap, bird);
    const l2 = into(s0, ap, land, "library");
    const spell = into(s0, ap, ogre, "library");
    const l1 = into(s0, ap, land, "library");
    expect(s0.players[ap]!.library.slice(0, 3)).toEqual([l1, spell, l2]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [c, b].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s);
    // Two Birds: the top two.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1, min: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [spell] }));
    expect(s.objects[spell]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [l1] }));
    expect(s.objects[l1]!.zone).toBe("battlefield");
    expect(s.objects[l1]!.tapped).toBe(true);
    // The third card wasn't looked at.
    expect(s.objects[l2]!.zone).toBe("library");
  });
  it("taking nothing to hand: a land onto the battlefield and the other card into the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, choco());
    const b = putOnBattlefield(s0, ap, bird);
    const spell = into(s0, ap, ogre, "library");
    const l1 = into(s0, ap, land, "library");
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [c, b].map((attacker) => ({ attacker, defender: opp })) }));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [l1] }));
    expect(s.objects[l1]!.zone).toBe("battlefield");
    expect(s.objects[spell]!.zone).toBe("graveyard");
  });
});
