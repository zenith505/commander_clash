// Round 284: from the top of the popularity list. Encore with each card's own mana cost (Wire Surgeons), turning
// creatures with morph abilities face down (Master of the Veil, Weaver of Lies) and putting one onto the battlefield
// (Dermoplasm), a +1/+1 counter for creature spells cast from the top of the library (Mikey & Don), forced attacks with
// destruction for creatures that didn't attack (Siren's Call, Nettling Imp), a random card exiled from hand to play
// (Elkin Lair), a creature put onto the battlefield attacking when one attacks alone (Nick Fury, Spymaster), keywords of
// the cards exiled with a creature (Urborg Scavengers), and lands named as an imprinted card (Invader Parasite).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, compileCard, isFullySupported, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "hand");
  return id;
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
const morphling = (name = "Morph Test", extra = "") => card(name, "Creature — Beast", "{2}{G}", { power: "3", toughness: "3", oracleText: `Morph {G}${extra}`, keywords: ["Morph"] });
const megaling = () => card("Megamorph Test", "Creature — Elf", "{1}{G}", { power: "2", toughness: "1", oracleText: "Megamorph {1}{G}", keywords: ["Megamorph"] });

// Real oracle text (Scryfall).
const surgeons = (): CardDef => ({"oracleId": "c51078d9-a53a-49ae-9658-2bc00cce2b81", "name": "Wire Surgeons", "manaCost": "{4}{B}{B}", "cmc": 6, "typeLine": "Creature — Human Artificer", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Artificer"], "oracleText": "Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nEach artifact creature card in your graveyard has encore. Its encore cost is equal to its mana cost. (Exile it and pay its mana cost: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)", "power": "6", "toughness": "5", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Fear"], "commanderLegal": "legal", "set": "brc", "releasedAt": "2022-11-18", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const veil = (): CardDef => ({"oracleId": "ee9104d5-3583-4549-8dd0-5b69274f4b4f", "name": "Master of the Veil", "manaCost": "{2}{U}{U}", "cmc": 4, "typeLine": "Creature — Human Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Wizard"], "oracleText": "Morph {2}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, you may turn target creature with a morph ability face down.", "power": "2", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Morph"], "commanderLegal": "legal", "set": "lgn", "releasedAt": "2003-02-03", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const weaver = (): CardDef => ({"oracleId": "bb2fca84-fc19-4c04-b146-1059aa975535", "name": "Weaver of Lies", "manaCost": "{5}{U}{U}", "cmc": 7, "typeLine": "Creature — Beast", "supertypes": [], "types": ["Creature"], "subtypes": ["Beast"], "oracleText": "Morph {4}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, turn any number of target creatures with morph abilities other than this creature face down.", "power": "4", "toughness": "4", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Morph"], "commanderLegal": "legal", "set": "lgn", "releasedAt": "2003-02-03", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const dermo = (): CardDef => ({"oracleId": "963d4712-51b2-4102-9626-d810e4696b70", "name": "Dermoplasm", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Shapeshifter", "supertypes": [], "types": ["Creature"], "subtypes": ["Shapeshifter"], "oracleText": "Flying\nMorph {2}{U}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, you may put a creature card with a morph ability from your hand onto the battlefield face up. If you do, return this creature to its owner's hand.", "power": "1", "toughness": "1", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying", "Morph"], "commanderLegal": "legal", "set": "lgn", "releasedAt": "2003-02-03", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const mikey = (): CardDef => ({"oracleId": "529178e8-425e-4d59-948c-ca7d0663f6ff", "name": "Mikey & Don, Party Planners", "manaCost": "{2}{G/U}{G/U}", "cmc": 4, "typeLine": "Legendary Creature — Mutant Ninja Turtle", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Ninja", "Turtle"], "oracleText": "Ward {2}\nYou may look at the top card of your library any time.\nYou may play lands and cast Mutant, Ninja, or Turtle spells from the top of your library. If you cast a creature spell this way, that creature enters with an additional +1/+1 counter on it.", "power": "3", "toughness": "3", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "keywords": ["Ward"], "commanderLegal": "legal", "set": "tmt", "releasedAt": "2026-03-06", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const siren = (): CardDef => ({"oracleId": "269fc857-a052-4f0a-9759-467ccf42bebb", "name": "Siren's Call", "manaCost": "{U}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Cast this spell only during an opponent's turn, before attackers are declared.\nCreatures the active player controls attack this turn if able.\nAt the beginning of the next end step, destroy all non-Wall creatures that player controls that didn't attack this turn. Ignore this effect for each creature the player didn't control continuously since the beginning of the turn.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "commanderLegal": "legal", "set": "lea", "releasedAt": "1993-08-05", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const imp = (): CardDef => ({"oracleId": "c58dfcbf-49e6-4ef0-bd31-ebd81b0cfa41", "name": "Nettling Imp", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Creature — Imp", "supertypes": [], "types": ["Creature"], "subtypes": ["Imp"], "oracleText": "{T}: Choose target non-Wall creature the active player has controlled continuously since the beginning of the turn. That creature attacks this turn if able. Destroy it at the beginning of the next end step if it didn't attack this turn. Activate only during an opponent's turn, before attackers are declared.", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "commanderLegal": "legal", "set": "lea", "releasedAt": "1993-08-05", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const elkin = (): CardDef => ({"oracleId": "b3488947-7142-4e6c-9c92-2728469b3ad9", "name": "Elkin Lair", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "World Enchantment", "supertypes": ["World"], "types": ["Enchantment"], "subtypes": [], "oracleText": "At the beginning of each player's upkeep, that player exiles a card at random from their hand. The player may play that card this turn. At the beginning of the next end step, if the player hasn't played the card, they put it into their graveyard.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "commanderLegal": "legal", "set": "vis", "releasedAt": "1997-02-03", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const fury = (): CardDef => ({"oracleId": "b20860da-2e71-414a-a512-1cce7ba64079", "name": "Nick Fury, Spymaster", "manaCost": "{4}{W}", "cmc": 5, "typeLine": "Legendary Creature — Human Spy Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Spy", "Hero"], "oracleText": "First strike\nWhenever a creature you control attacks alone, draw a card. Then you may put a creature card with mana value 3 or less from your hand onto the battlefield. It enters tapped and attacking and gains indestructible until end of turn.", "power": "4", "toughness": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["First strike"], "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const scav = (): CardDef => ({"oracleId": "d27f3338-4900-49eb-9d8b-994afd524abe", "name": "Urborg Scavengers", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Creature — Spirit", "supertypes": [], "types": ["Creature"], "subtypes": ["Spirit"], "oracleText": "Whenever this creature enters or attacks, exile target card from a graveyard. Put a +1/+1 counter on this creature.\nThis creature has flying as long as a card exiled with it has flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "commanderLegal": "legal", "set": "mat", "releasedAt": "2023-05-12", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const parasite = (): CardDef => ({"oracleId": "fe4c0dc1-f6a9-4828-9c19-4239c4f955a7", "name": "Invader Parasite", "manaCost": "{3}{R}{R}", "cmc": 5, "typeLine": "Creature — Phyrexian Insect", "supertypes": [], "types": ["Creature"], "subtypes": ["Phyrexian", "Insect"], "oracleText": "Imprint — When this creature enters, exile target land.\nWhenever a land an opponent controls with the same name as the exiled card enters, this creature deals 2 damage to that player.", "power": "3", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Imprint"], "commanderLegal": "legal", "set": "nph", "releasedAt": "2011-05-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;

const norritt = (): CardDef => ({"oracleId": "4318c704-888f-4d85-b5f7-6d9abb14e60c", "name": "Norritt", "manaCost": "{3}{B}", "cmc": 4, "typeLine": "Creature — Imp", "supertypes": [], "types": ["Creature"], "subtypes": ["Imp"], "oracleText": "{T}: Untap target blue creature.\n{T}: Choose target non-Wall creature the active player has controlled continuously since the beginning of the turn. That creature attacks this turn if able. Destroy it at the beginning of the next end step if it didn't attack this turn. Activate only before attackers are declared.", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "commanderLegal": "legal", "set": "ice", "releasedAt": "1995-06-03", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const backslide = (): CardDef => ({"oracleId": "6d9746bc-0b72-4ac4-b48a-742b63b1c41b", "name": "Backslide", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Turn target creature with a morph ability face down.\nCycling {U} ({U}, Discard this card: Draw a card.)", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Cycling"], "commanderLegal": "legal", "set": "ons", "releasedAt": "2002-10-07", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const bird = (name = "Test Bird") => card(name, "Creature — Bird", "{1}{U}", { power: "1", toughness: "1", oracleText: "Flying", keywords: ["Flying"] });
const snake = () => card("Test Snake", "Creature — Snake", "{1}{B}", { power: "1", toughness: "1", oracleText: "Deathtouch", keywords: ["Deathtouch"] });
const construct = () => card("Test Construct", "Artifact Creature — Construct", "{2}{U}", { power: "2", toughness: "2" });
const wall = () => card("Test Wall", "Creature — Wall", "{1}{W}", { power: "0", toughness: "4", oracleText: "Defender", keywords: ["Defender"] });
const turtle = () => card("Test Turtle", "Creature — Turtle", "{1}{G}", { power: "1", toughness: "1" });
/** Puts a fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** Passes priority until `pid` has it (with nothing pending). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 20 && (s.priority !== pid || s.pending); i++) {
    if (s.pending) throw new Error(JSON.stringify(s.pending));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const faceDown = (s: GameState, ap: PlayerId, id: string) => settle(run(s, planCast(s, ap, id, undefined, undefined, "auto", undefined, { faceDown: true })));

describe("round 284", () => {
  it("every card of the round compiles fully", () => {
    supported(surgeons(), veil(), weaver(), dermo(), mikey(), siren(), imp(), elkin(), fury(), scav(), parasite(), norritt(), backslide());
  });
});

describe("Wire Surgeons", () => {
  it("each artifact creature card in your graveyard has encore for its own mana cost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, surgeons());
    const c = toYard(s0, ap, construct());
    const plain = toYard(s0, ap, bear());
    const yardAbilities = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.filter((a) => a.zone === "graveyard");
    expect(yardAbilities(s0, plain)).toHaveLength(0);
    const enc = yardAbilities(s0, c);
    expect(enc).toHaveLength(1);
    expect(enc[0]!.manaCost).toBe("{2}{U}");
    const untapped = (s: GameState) => s.battlefield.filter((id) => !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    const before = untapped(s0);
    expect(planActivate(s0, ap, plain, 0)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, c, 0)));
    expect(before - untapped(s)).toBe(3);
    expect(zone(s, c)).toBe("exile");
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Test Construct");
    expect(tokens).toHaveLength(3);
    expect(tokens.every((id) => kw(s, id).includes("Haste"))).toBe(true);
  });

  it("a card with no mana cost has nothing to pay for it, so no encore (CR 118.6)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, surgeons());
    const free = toYard(s, ap, card("Costless Construct", "Artifact Creature — Construct", "", { power: "1", toughness: "1" }));
    expect(abilitiesOf(s, s.objects[free]!).activated.filter((a) => a.zone === "graveyard")).toHaveLength(0);
  });

  it("an opponent's Wire Surgeons doesn't help your cards", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, surgeons());
    const c = toYard(s, ap, construct());
    expect(abilitiesOf(s, s.objects[c]!).activated.filter((a) => a.zone === "graveyard")).toHaveLength(0);
  });
});

describe("Master of the Veil and Weaver of Lies", () => {
  it("Master of the Veil turns a creature with morph face down; its controller can turn it face up again for its morph cost", () => {
    const { s: s0, ap, ids, opp } = setup([veil()]);
    const mine = putOnBattlefield(s0, ap, morphling());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    // A creature without morph isn't a legal target.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: mine }] }));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[mine]!.faceDown).toBe("morph");
    const ch = characteristics(s, s.objects[mine]!);
    expect([ch.name, ch.power, ch.toughness, ch.keywords]).toEqual(["Face-down creature", 2, 2, []]);
    s = settle(run(s, planTurnFaceUp(s, ap, mine)));
    expect(s.objects[mine]!.faceDown).toBeFalsy();
    expect(characteristics(s, s.objects[mine]!).name).toBe("Morph Test");
  });

  it("Master of the Veil can turn itself face down (rulings), and a face-down creature isn't a legal target", () => {
    const { s: s0, ap, ids } = setup([veil(), morphling()]);
    let s = faceDown(s0, ap, ids[1]!);
    s = faceDown(s, ap, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    // Only Master of the Veil itself has a morph ability now: the face-down one has no abilities (CR 708.2).
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[1]! }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[0]! }] }));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[ids[0]!]!.faceDown).toBe("morph");
  });

  it("Weaver of Lies turns any number of creatures with morph or megamorph face down, not itself", () => {
    const { s: s0, ap, ids, opp } = setup([weaver()]);
    const a = putOnBattlefield(s0, ap, morphling());
    const b = putOnBattlefield(s0, opp, megaling());
    const plain = putOnBattlefield(s0, opp, bear());
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[0]! }] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: plain }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }, { kind: "object", id: b }] }));
    expect(s.objects[a]!.faceDown).toBe("morph");
    expect(s.objects[b]!.faceDown).toBe("morph");
    expect(s.objects[ids[0]!]!.faceDown).toBeFalsy();
    expect(s.objects[plain]!.faceDown).toBeFalsy();
  });
});

describe("Dermoplasm", () => {
  it("turned face up, you may put a creature card with a morph ability from your hand onto the battlefield face up; if you do, Dermoplasm returns to your hand", () => {
    const { s: s0, ap, ids } = setup([dermo(), morphling(), bear()]);
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual([ids[1]]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.objects[ids[1]!]!.faceDown).toBeFalsy();
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("putting nothing, it stays", () => {
    const { s: s0, ap, ids } = setup([dermo(), morphling()]);
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, ids[1]!)).toBe("hand");
  });
});

describe("Mikey & Don, Party Planners", () => {
  it("casts a Turtle creature spell from the top of the library; it enters with an additional +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mikey());
    const t = onTop(s0, ap, turtle());
    let s = settle(run(s0, planCast(s0, ap, t)));
    expect(zone(s, t)).toBe("battlefield");
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
  });

  it("not a creature that isn't a Mutant, Ninja or Turtle", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, mikey());
    const b = onTop(s, ap, bear());
    expect(planCast(s, ap, b)).toBeNull();
  });

  it("a land from the top can be played", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mikey());
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const l = onTop(s0, ap, card("Test Grove", "Land"));
    const s = act(s0, { type: "playLand", player: ap, objectId: l });
    expect(zone(s, l)).toBe("battlefield");
  });
});

describe("Backslide", () => {
  it("turns target creature with a morph ability face down", () => {
    const { s: s0, ap, ids, opp } = setup([backslide()]);
    const m = putOnBattlefield(s0, opp, morphling());
    const b = putOnBattlefield(s0, opp, bear());
    expect(planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: m }])));
    expect(s.objects[m]!.faceDown).toBe("morph");
  });
});

/** From `ap`'s first main phase, on to `who`'s upkeep with `pid` holding priority. */
const toUpkeepPriority = (s: GameState, who: PlayerId, pid: PlayerId) => priorityTo(passUntil(s, "upkeep", who), pid);
/** Steps on, passing, until `who` is asked to declare attackers (or the step is skipped). */
const toAttack = (s: GameState, who: PlayerId) => {
  for (let i = 0; i < 100; i++) {
    if (s.pending?.kind === "declareAttackers" && s.pending.player === who) return s;
    if (s.activePlayer === who && (s.step === "declareBlockers" || s.step === "main2")) return s;
    if (s.pending) throw new Error(JSON.stringify(s.pending));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("no attack step");
};
/** On to the end of `who`'s turn: past the end step's triggers, into cleanup or the next turn. */
const throughEnd = (s: GameState, who: PlayerId) => {
  for (let i = 0; i < 300; i++) {
    if (s.activePlayer !== who) return s;
    const w = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: w, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: w, objectIds: s.players[w]!.hand.slice(0, s.pending.count) });
    else if (s.pending) throw new Error(JSON.stringify(s.pending));
    else s = act(s, { type: "passPriority", player: w });
  }
  throw new Error("turn never ended");
};

describe("Siren's Call", () => {
  it("only during an opponent's turn, before attackers are declared", () => {
    const { s, ap, ids } = setup([siren()]);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });

  it("the active player's creatures attack if able; at the end step, those that didn't attack are destroyed, not Walls or ones they got this turn", () => {
    const { s: s0, ap, ids, opp } = setup([siren()]);
    const attacker = putOnBattlefield(s0, opp, bear({ name: "Test Attacker" }));
    const tappedOne = putOnBattlefield(s0, opp, bear({ name: "Test Tapped" }));
    const w = putOnBattlefield(s0, opp, wall());
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    let s = toUpkeepPriority(s0, opp, ap);
    const fresh = putOnBattlefield(s, opp, bear({ name: "Test Fresh" }), { sick: true });
    s.objects[tappedOne]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = toAttack(s, opp);
    expect(s.pending).toMatchObject({ kind: "declareAttackers", player: opp });
    // The untapped one must attack (CR 508.1d).
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker, defender: ap }] });
    s = throughEnd(s, opp);
    expect(zone(s, attacker)).toBe("battlefield");
    expect(zone(s, tappedOne)).toBe("graveyard"); // it couldn't attack: still destroyed (rulings)
    expect(zone(s, w)).toBe("battlefield");
    expect(zone(s, fresh)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
  });
});

describe("Nettling Imp and Norritt", () => {
  it("Nettling Imp: only during an opponent's turn, a creature the active player has controlled since the turn began, not a Wall", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, imp());
    const b = putOnBattlefield(s0, opp, bear());
    const w = putOnBattlefield(s0, opp, wall());
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    expect(planActivate(s0, ap, i, 0, [{ kind: "object", id: mine }])).toBeNull(); // your own turn
    const s = toUpkeepPriority(s0, opp, ap);
    const fresh = putOnBattlefield(s, opp, bear({ name: "Test Fresh" }), { sick: true });
    expect(planActivate(s, ap, i, 0, [{ kind: "object", id: w }])).toBeNull();
    expect(planActivate(s, ap, i, 0, [{ kind: "object", id: mine }])).toBeNull(); // not the active player's
    expect(planActivate(s, ap, i, 0, [{ kind: "object", id: fresh }])).toBeNull();
    expect(planActivate(s, ap, i, 0, [{ kind: "object", id: b }])).not.toBeNull();
  });

  it("Nettling Imp: the creature attacks if able; if it didn't attack, it's destroyed at the end step, even with the Imp gone", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, imp());
    const b = putOnBattlefield(s0, opp, bear());
    let s = toUpkeepPriority(s0, opp, ap);
    s = settle(run(s, planActivate(s, ap, i, 0, [{ kind: "object", id: b }])));
    moveObject(s, i, "graveyard");
    s.objects[b]!.tapped = true; // it can't attack now
    s = toAttack(s, opp);
    // With nothing able to attack, there's no declaration to make.
    expect(s.pending?.kind).not.toBe("declareAttackers");
    s = throughEnd(s, opp);
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Nettling Imp: one that attacked survives", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, imp());
    const b = putOnBattlefield(s0, opp, bear());
    let s = toUpkeepPriority(s0, opp, ap);
    s = settle(run(s, planActivate(s, ap, i, 0, [{ kind: "object", id: b }])));
    s = toAttack(s, opp);
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap }] });
    s = throughEnd(s, opp);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Norritt: in its controller's own turn too, before attackers are declared", () => {
    const { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, norritt());
    const mine = putOnBattlefield(s, ap, bear({ name: "Test Mine" }));
    expect(planActivate(s, ap, n, 1, [{ kind: "object", id: mine }])).not.toBeNull();
  });
});

describe("Elkin Lair", () => {
  it("each upkeep, that player exiles a card at random from their hand and may play it this turn; if not, it goes to their graveyard at the end step", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, elkin());
    const hand = s0.players[opp]!.hand.length;
    expect(hand).toBeGreaterThan(0);
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
    const ex = s.players[opp]!.exile.find((id) => s.objects[id]!.mayPlay?.player === opp);
    expect(ex).toBeDefined();
    s = throughEnd(s, opp);
    expect(zone(s, ex!)).toBe("graveyard");
  });

  it("played this turn, it isn't put into the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, elkin());
    for (const id of [...s0.players[opp]!.hand]) moveObject(s0, id, "library");
    const g = toHand(s0, opp, card("Test Grove", "Land"));
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(zone(s, g)).toBe("exile");
    s = passUntil(s, "main1", opp);
    s = act(s, { type: "playLand", player: opp, objectId: g });
    expect(zone(s, g)).toBe("battlefield");
    s = throughEnd(s, opp);
    expect(zone(s, g)).toBe("battlefield");
  });
});

describe("Nick Fury, Spymaster", () => {
  it("a creature attacking alone: draw, then put a creature card with mana value 3 or less onto the battlefield tapped, attacking and indestructible", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "Test Recruit" }), card("Big Test", "Creature — Giant", "{4}{G}", { power: "5", toughness: "5" })]);
    putOnBattlefield(s0, ap, fury());
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Scout" }));
    let s = passUntil(s0, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toContain(ids[0]);
    expect(p.cards).not.toContain(ids[1]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(o.attacking).toBe(opp);
    expect(kw(s, ids[0]!)).toContain("Indestructible");
  });

  it("not when two creatures attack", () => {
    const { s: s0, ap, opp } = setup([bear({ name: "Test Recruit" })]);
    putOnBattlefield(s0, ap, fury());
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Scout" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Scout 2" }));
    let s = passUntil(s0, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] }));
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Urborg Scavengers", () => {
  it("has each listed keyword while a card exiled with it has it", () => {
    const { s: s0, ap, ids, opp } = setup([scav()]);
    const flier = toYard(s0, opp, bird());
    toYard(s0, opp, snake());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: flier }] }));
    expect(zone(s, flier)).toBe("exile");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(kw(s, ids[0]!)).toContain("Flying");
    expect(kw(s, ids[0]!)).not.toContain("Deathtouch");
    // Gone from exile, the card no longer gives it.
    moveObject(s, flier, "graveyard");
    expect(kw(s, ids[0]!)).not.toContain("Flying");
  });
});

describe("Invader Parasite", () => {
  it("exiles target land; a land an opponent controls with the same name entering deals 2 damage to that player", () => {
    const grove = () => card("Test Grove", "Land");
    const { s: s0, ap, ids, opp } = setup([parasite()]);
    const l = putOnBattlefield(s0, opp, grove());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: l }] }));
    expect(zone(s, l)).toBe("exile");
    const life = s.players[opp]!.life;
    const myLife = s.players[ap]!.life;
    const same = toHand(s, opp, grove());
    moveObject(s, same, "battlefield");
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    const other = toHand(s, opp, card("Test Marsh", "Land"));
    moveObject(s, other, "battlefield");
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    const mine = toHand(s, ap, grove());
    moveObject(s, mine, "battlefield");
    s = settle(s);
    expect(s.players[ap]!.life).toBe(myLife);
  });
});
