// Round 443 (Lane A): Cryptic Spires ("As you create your deck, circle two of the colors below." and "{T}: Add one mana of
// either of the circled colors.": CR 207.5, 613.1, 707.2, 903.4, 607.2; rulings).

import { describe, expect, it } from "vitest";
import { act, bear, commander, passAll, putOnBattlefield, setup, target } from "./helpers";
import { circleColors, compileCard, createGame, identityOf, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, manaChoices, planActivate, validateCommanderDeck, waitingOn, type CardDef, type Color, type GameState, type ObjectId } from "../src";

// Real card data (Scryfall).
const etrata = (): CardDef => ({"oracleId":"87957d09-7e22-40fe-8770-ff66d1934a38","name":"Etrata, Deadly Fugitive","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Vampire Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Assassin"],"oracleText":"Deathtouch\nFace-down creatures you control have \"{2}{U}{B}: Turn this creature face up. If you can't, exile it, then you may cast the exiled card without paying its mana cost.\"\nWhenever an Assassin you control deals combat damage to an opponent, cloak the top card of that player's library.","power":"1","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Cloak","Deathtouch"],"commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const spires = (): CardDef => ({"oracleId":"6d6a25fb-0432-4c7d-b0e6-e787ddc71218","name":"Cryptic Spires","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"As you create your deck, circle two of the colors below.\nThis land enters tapped.\n{T}: Add one mana of either of the circled colors.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"2x2","releasedAt":"2022-07-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stage = (): CardDef => ({"oracleId":"b01e698b-608a-4fc7-8073-b01d044743ec","name":"Thespian's Stage","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{2}, {T}: This land becomes a copy of target land, except it has this ability.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const refractor = (): CardDef => ({"oracleId":"ae3517db-bb96-4c29-91dc-5bd68683dced","name":"Manascape Refractor","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters tapped.\nThis artifact has all activated abilities of all lands on the battlefield.\nYou may spend mana as though it were mana of any color to pay the activation costs of this artifact's abilities.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const circled = (colors: [Color, Color]) => circleColors(spires(), colors);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The mana Spires' ability (or the one an object has) could add. */
const choicesOf = (s: GameState, id: ObjectId) =>
  manaAbilitiesOn(s, s.objects[id]!)
    .filter((ab) => ab.produces.kind === "circled")
    .map((ab) => manaChoices(s, s.objects[id]!, ab));
const deckOf = (extra: CardDef[]) => {
  const rest = Array.from({ length: 99 - extra.length }, (_, i) => bear({ name: `Bear ${i}`, colorIdentity: [] as Color[], colors: [] as Color[] }));
  return [...extra, ...rest];
};

describe("Cryptic Spires", () => {
  it("parse: the circling is done as the deck is built; it enters tapped; it adds one mana of a circled color", () => {
    expect(isFullySupported(spires())).toBe(true);
    const c = compileCard(spires());
    expect(c.circleTwoColors).toBe(true);
    expect(c.entersTapped).toBe(true);
    expect(c.mana.map((m) => m.produces)).toEqual([{ kind: "circled" }]);
  });

  it("circling two colors: they're its color identity, but it stays colorless (CR 207.5, 903.4; rulings)", () => {
    const d = circled(["U", "B"]);
    expect(d.circledColors).toEqual(["U", "B"]);
    expect(d.colorIdentity).toEqual(["U", "B"]);
    expect(d.colors).toEqual([]);
    expect(d.oracleId).not.toBe(spires().oracleId);
    expect(circled(["B", "U"]).oracleId).not.toBe(d.oracleId);
    expect(() => circleColors(spires(), ["U", "U"])).toThrow(/two colors/);
  });

  it("deck building: two colors must be circled, both within the commander's color identity", () => {
    const problems = (cmd: CardDef, card: CardDef) => validateCommanderDeck(cmd, deckOf([card])).filter((p) => p.card === "Cryptic Spires").map((p) => p.problem);
    expect(problems(etrata(), circled(["U", "B"]))).toEqual([]);
    expect(problems(etrata(), spires())).toEqual([expect.stringMatching(/needs two colors circled/)]);
    expect(problems(etrata(), circled(["U", "R"]))).toEqual([expect.stringMatching(/outside the commander's color identity/)]);
    // A one-color commander can't have it: two different colors must be circled.
    expect(problems(commander("Mono Green"), circled(["G", "U"]))).toEqual([expect.stringMatching(/outside/)]);
  });

  it("a game can't start with its colors not circled", () => {
    const setupWith = (card: CardDef) => ["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deckOf(i === 0 ? [card] : []) }));
    expect(() => createGame(setupWith(spires()), 1)).toThrow(/needs two colors circled/);
    expect(() => createGame(setupWith(circled(["U", "B"])), 1)).not.toThrow();
  });

  it("it adds one mana of either circled color, and no other", () => {
    const { s: s0, ap } = setup([]);
    const sp = putOnBattlefield(s0, ap, circled(["U", "B"]));
    expect(choicesOf(s0, sp)).toEqual([["U", "B"]]);
    expect(identityOf(s0, s0.objects[sp]!)).toEqual(["U", "B"]);
    const blue = act(s0, { type: "activateMana", player: ap, objectId: sp, mana: "U" });
    expect(blue.players[ap]!.manaPool.U).toBe(s0.players[ap]!.manaPool.U + 1);
    const black = act(s0, { type: "activateMana", player: ap, objectId: sp, mana: "B" });
    expect(black.players[ap]!.manaPool.B).toBe(s0.players[ap]!.manaPool.B + 1);
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: sp, mana: "G" })).toThrow();
  });

  it("it enters tapped", () => {
    const { s: s0, ap, ids } = setup([circled(["W", "R"])]);
    const s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });

  it("a copy of it has the same circled colors (rulings: copiable values)", () => {
    const { s: s0, ap } = setup([]);
    const sp = putOnBattlefield(s0, ap, circled(["R", "G"]));
    const st = putOnBattlefield(s0, ap, stage());
    let s = s0;
    const plan = planActivate(s, ap, st, 0, [target(sp)]);
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    s = settle(passAll(s));
    expect(s.cards[s.objects[st]!.cardId] && choicesOf(s, st)).toEqual([["R", "G"]]);
  });

  it("an object that only gained its ability adds no mana with it (CR 607.2, rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, circled(["W", "U"]));
    const r = putOnBattlefield(s0, ap, refractor());
    invalidateCharacteristics(s0);
    const got = choicesOf(s0, r);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((c) => c.length === 0)).toBe(true);
  });
});
