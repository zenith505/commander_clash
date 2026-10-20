// Round 93, more popular cards: Ichor Wellspring (enters or is put into a graveyard from the battlefield), Krosan
// Verge (a Forest card and a Plains card: one of each, a dual land is only one of them), Razorkin Needlehead (first
// strike during your turn), Flare of Fortitude (your life total can't change this turn, CR 119.8) and Tribute to the
// World Tree (draw if its power is 3 or greater, otherwise two +1/+1 counters).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, plainsCard, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, objHasKeyword, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const wellspring = card("Ichor Wellspring", "Artifact", "{2}", { oracleText: "When this artifact enters or is put into a graveyard from the battlefield, draw a card." });
const verge = card("Krosan Verge", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle." });
const razorkin = card("Razorkin Needlehead", "Creature — Human Assassin", "{R}{R}", { power: "2", toughness: "2", oracleText: "This creature has first strike during your turn.\nWhenever an opponent draws a card, this creature deals 1 damage to them." });
const flare = card("Flare of Fortitude", "Instant", "{2}{W}{W}", { oracleText: "You may sacrifice a nontoken white creature rather than pay this spell's mana cost.\nUntil end of turn, your life total can't change, and permanents you control gain hexproof and indestructible." });
const tribute = card("Tribute to the World Tree", "Enchantment", "{G}{G}{G}", { oracleText: "Whenever a creature you control enters, draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it." });
const savannah = card("Savannah", "Land — Forest Plains", "", { oracleText: "({T}: Add {G} or {W}.)" });
const whisper = card("Night's Whisper", "Sorcery", "{1}{B}", { oracleText: "You draw two cards and you lose 2 life." });
const salve = card("Healing Salve", "Instant", "{W}", { oracleText: "Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn." });
const ogre = card("Hill Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
const shatter = card("Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });

const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

describe("Ichor Wellspring", () => {
  it("parse", () => expect(isFullySupported(wellspring)).toBe(true));

  it("draws when it enters and again when it goes to the graveyard from the battlefield", () => {
    const { s: s0, ap, ids } = setup([wellspring, shatter]);
    const before = handSize(s0, ap);
    let s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(handSize(s, ap)).toBe(before - 1 + 1);
    s = cast(s, ap, ids[1]!, [{ kind: "object", id: ids[0]! }]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(handSize(s, ap)).toBe(before - 2 + 2);
  });
});

describe("Krosan Verge", () => {
  it("parse", () => expect(isFullySupported(verge)).toBe(true));

  const searchFrom = () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, verge);
    // A Plains and a Savannah (Forest Plains) in the library, among the Forests.
    const lib = s0.players[ap]!.library;
    const p = putOnBattlefield(s0, ap, plainsCard);
    const d = putOnBattlefield(s0, ap, savannah);
    for (const id of [p, d]) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      lib.push(id);
    }
    const s = activate(s0, ap, v, 0);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const forestId = lib.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    return { s, ap, v, p, d, forestId, forest2: lib.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")[1]! };
  };

  it("finds a Forest card and a Plains card, tapped", () => {
    const { s: s1, ap, v, p, forestId } = searchFrom();
    expect(() => act(s1, { type: "searchLibrary", player: ap, found: [forestId, s1.players[ap]!.library.filter((id) => id !== forestId && s1.cards[s1.objects[id]!.cardId]!.name === "Forest")[0]!] })).toThrow(/one card for each/);
    let s = act(s1, { type: "searchLibrary", player: ap, found: [forestId, p] });
    s = passAll(s);
    expect(s.objects[v]!.zone).toBe("graveyard");
    for (const id of [forestId, p]) expect(s.objects[id]).toMatchObject({ zone: "battlefield", tapped: true });
  });

  it("a Forest Plains dual land counts as either one, but not both", () => {
    const { s: s1, ap, p, d, forestId, forest2 } = searchFrom();
    // Savannah as the Forest, with the Plains; or Savannah as the Plains, with a Forest.
    expect(() => act(s1, { type: "searchLibrary", player: ap, found: [d, p] })).not.toThrow();
    expect(() => act(s1, { type: "searchLibrary", player: ap, found: [forestId, d] })).not.toThrow();
    expect(() => act(s1, { type: "searchLibrary", player: ap, found: [forestId, forest2, d] })).toThrow();
    // Only the dual: it is one of the two, and you may fail to find the other.
    const s = passAll(act(s1, { type: "searchLibrary", player: ap, found: [d] }));
    expect(s.objects[d]).toMatchObject({ zone: "battlefield", tapped: true });
  });
});

describe("Razorkin Needlehead", () => {
  it("parse", () => expect(isFullySupported(razorkin)).toBe(true));

  it("has first strike only during its controller's turn", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, razorkin);
    const theirs = putOnBattlefield(s, opp, razorkin);
    expect(objHasKeyword(s, s.objects[mine]!, "First strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[theirs]!, "First strike")).toBe(false);
  });
});

describe("Flare of Fortitude", () => {
  it("parse", () => expect(isFullySupported(flare)).toBe(true));

  it("until end of turn your life total can't change and your permanents gain hexproof and indestructible", () => {
    const { s: s0, ap, ids, opp } = setup([flare, whisper, salve]);
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, opp, bear());
    const life = s0.players[ap]!.life;
    let s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[other]!, "Indestructible")).toBe(false);
    // Night's Whisper's life loss and Healing Salve's life gain do nothing (CR 119.8).
    s = cast(s, ap, ids[1]!);
    expect(s.players[ap]!.life).toBe(life);
    s = cast(s, ap, ids[2]!, [{ kind: "player", id: ap }], [0]);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.log.some((l) => /life total can't change this turn/.test(l.text))).toBe(true);
  });
});

describe("Tribute to the World Tree", () => {
  it("parse", () => expect(isFullySupported(tribute)).toBe(true));

  it("draws for a creature with power 3 or greater, otherwise puts two +1/+1 counters on it", () => {
    const { s: s0, ap, ids } = setup([ogre, bear()]);
    putOnBattlefield(s0, ap, tribute);
    const hand = handSize(s0, ap);
    let s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(handSize(s, ap)).toBe(hand - 1 + 1);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    s = cast(s, ap, ids[1]!);
    expect(handSize(s, ap)).toBe(hand - 1);
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(2);
  });
});

