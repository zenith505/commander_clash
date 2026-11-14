// Round 369 (Lane A): card types and supertypes outside the battlefield (CR 613.1d): Encroaching Mycosynth and
// Biotransference make cards and spells artifacts in every zone, Rootpath Purifier makes the land cards in your library
// basic.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, characteristics, defOf, invalidateCharacteristics, isFullySupported, objIsType, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const types = (s: GameState, id: ObjectId) => [...defOf(s, s.objects[id]!).types].sort();
const isArtifact = (s: GameState, id: ObjectId) => (s.objects[id]!.zone === "battlefield" ? objIsType(s, s.objects[id]!, "Artifact") : defOf(s, s.objects[id]!).types.includes("Artifact"));
/** Taps every untapped land `pid` controls but `keep` of those named `name`. */
const leaveUntapped = (s: GameState, pid: PlayerId, keep: number, name: string) => {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller !== pid || !objIsType(s, o, "Land") || o.tapped) continue;
    if (keep > 0 && defOf(s, o).name === name) keep--;
    else o.tapped = true;
  }
  invalidateCharacteristics(s);
};

const mycosynth = card("Encroaching Mycosynth", "Artifact", "{3}{U}", { cmc: 4, oracleText: "Nonland permanents you control are artifacts in addition to their other types. The same is true for permanent spells you control and nonland permanent cards you own that aren't on the battlefield." });
const biotransference = card("Biotransference", "Enchantment", "{2}{B}{B}", { cmc: 4, oracleText: "Creatures you control are artifacts in addition to their other types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.\nWhenever you cast an artifact spell, you lose 1 life and create a 2/2 black Necron Warrior artifact creature token." });
const rootpath = card("Rootpath Purifier", "Creature — Elf Druid", "{3}{G}", { cmc: 4, power: "3", toughness: "4", oracleText: "Lands you control and land cards in your library are basic." });
const sculptor = card("Etherium Sculptor", "Artifact Creature — Vedalken Artificer", "{1}{U}", { cmc: 2, power: "1", toughness: "2", oracleText: "Artifact spells you cast cost {1} less to cast." });
const fabricate = card("Fabricate", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Search your library for an artifact card, reveal it, put it into your hand, then shuffle." });
const rootMaze = card("Root Maze", "Enchantment", "{G}", { cmc: 1, oracleText: "Artifacts and lands enter tapped." });
const bloodMoon = card("Blood Moon", "Enchantment", "{2}{R}", { cmc: 3, oracleText: "Nonbasic lands are Mountains." });
const rampant = card("Rampant Growth", "Sorcery", "{1}{G}", { cmc: 2, oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });
const canonist = card("Ethersworn Canonist", "Artifact Creature — Human Cleric", "{1}{W}", { cmc: 2, power: "2", toughness: "2", oracleText: "Each player who has cast a nonartifact spell this turn can't cast additional nonartifact spells." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });
const charm = card("Test Charm", "Enchantment", "{1}{W}", { cmc: 2, oracleText: "" });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const tower = card("Test Tower", "Land", "", { oracleText: "{T}: Add {C}." });
const throne = card("Test Throne", "Legendary Land", "", { oracleText: "{T}: Add {C}." });
const forestCard = card("Forest", "Basic Land — Forest");
const painter = card("Painter's Servant", "Artifact Creature — Scarecrow", "{2}", { cmc: 2, power: "1", toughness: "3", oracleText: "As this creature enters, choose a color.\nAll cards that aren't on the battlefield, spells, and permanents are the chosen color in addition to their other colors." });
const lattice = card("Mycosynth Lattice", "Artifact", "{6}", { cmc: 6, oracleText: "All permanents are artifacts in addition to their other types.\nAll cards that aren't on the battlefield, spells, and permanents are colorless.\nPlayers may spend mana as though it were mana of any color." });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });

describe("round 369 cards compile", () => {
  it("are fully supported", () => supported(mycosynth, biotransference, rootpath, painter));
});

describe("Encroaching Mycosynth", () => {
  it("your nonland permanents are artifacts; your lands and other players' permanents aren't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, mycosynth);
    const b = putOnBattlefield(s, ap, bear());
    const ench = putOnBattlefield(s, ap, charm);
    const land = putOnBattlefield(s, ap, tower);
    const theirs = putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!).types.sort()).toEqual(["Artifact", "Creature"]);
    expect(characteristics(s, s.objects[ench]!).types.sort()).toEqual(["Artifact", "Enchantment"]);
    expect(objIsType(s, s.objects[land]!, "Artifact")).toBe(false);
    expect(objIsType(s, s.objects[theirs]!, "Artifact")).toBe(false);
  });

  it("nonland permanent cards you own are artifact cards in your hand, graveyard, library and command zone; lands, instants and other players' cards aren't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, mycosynth);
    const inHand = into(s, ap, ogre, "hand");
    const inYard = into(s, ap, charm, "graveyard");
    const inLibrary = into(s, ap, bear(), "library");
    const landInHand = into(s, ap, tower, "hand");
    const instant = into(s, ap, shock, "hand");
    const theirs = into(s, opp, ogre, "hand");
    const cmdr = s.players[ap]!.commanders?.[0] ?? Object.values(s.objects).find((o) => o.isCommander && o.owner === ap && o.zone === "command")!.id;
    expect(types(s, inHand)).toEqual(["Artifact", "Creature"]);
    expect(types(s, inYard)).toEqual(["Artifact", "Enchantment"]);
    expect(types(s, inLibrary)).toEqual(["Artifact", "Creature"]);
    expect(isArtifact(s, cmdr)).toBe(true);
    expect(isArtifact(s, landInHand)).toBe(false);
    expect(isArtifact(s, instant)).toBe(false);
    expect(isArtifact(s, theirs)).toBe(false);
  });

  it("without it, nothing changes", () => {
    const { s, ap } = setup([]);
    const inHand = into(s, ap, ogre, "hand");
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(isArtifact(s, inHand)).toBe(false);
    expect(isArtifact(s, b)).toBe(false);
  });

  it("a creature spell you cast is an artifact spell: Etherium Sculptor makes it cost {1} less", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    putOnBattlefield(s0, ap, sculptor);
    leaveUntapped(s0, ap, 2, "Mountain");
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    putOnBattlefield(s0, ap, mycosynth);
    invalidateCharacteristics(s0);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const item = s.stack.at(-1)!;
    expect(item.objectId).toBe(ids[0]);
    expect(characteristics(s, s.objects[ids[0]!]!).types).toContain("Artifact");
    const after = settle(s, ap);
    expect(after.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(objIsType(after, after.objects[ids[0]!]!, "Artifact")).toBe(true);
  });

  it("Fabricate can find a creature card in your library, an artifact card there", () => {
    const { s: s0, ap, ids } = setup([fabricate]);
    putOnBattlefield(s0, ap, mycosynth);
    const ogreId = into(s0, ap, ogre, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    expect((s.pending as { cards: string[] }).cards).toContain(ogreId);
    // Forests stay lands only.
    const forests = s.players[ap]!.library.filter((id) => defOf(s, s.objects[id]!).name === "Forest");
    expect(forests.some((id) => (s.pending as { cards: string[] }).cards.includes(id))).toBe(false);
    s = act(s, { type: "searchLibrary", player: ap, found: [ogreId] });
    s = settle(s, ap);
    expect(s.objects[ogreId]!.zone).toBe("hand");
  });
});

describe("Biotransference", () => {
  it("your creatures are artifacts, and so are creature cards you own elsewhere; noncreature cards and other players' creatures aren't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, biotransference);
    const b = putOnBattlefield(s, ap, bear());
    const ench = putOnBattlefield(s, ap, charm);
    const theirs = putOnBattlefield(s, opp, bear());
    const inYard = into(s, ap, ogre, "graveyard");
    const charmInHand = into(s, ap, charm, "hand");
    const theirCard = into(s, opp, ogre, "graveyard");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!).types.sort()).toEqual(["Artifact", "Creature"]);
    expect(objIsType(s, s.objects[ench]!, "Artifact")).toBe(false);
    expect(objIsType(s, s.objects[theirs]!, "Artifact")).toBe(false);
    expect(types(s, inYard)).toEqual(["Artifact", "Creature"]);
    expect(isArtifact(s, charmInHand)).toBe(false);
    expect(isArtifact(s, theirCard)).toBe(false);
  });

  it("casting a creature spell is casting an artifact spell: you lose 1 life and create a 2/2 Necron Warrior", () => {
    const { s: s0, ap, ids } = setup([ogre, ponder]);
    putOnBattlefield(s0, ap, biotransference);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.players[ap]!.life).toBe(life - 1);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(tokens).toHaveLength(1);
    const tok = characteristics(s, s.objects[tokens[0]!]!);
    expect(tok.subtypes).toEqual(["Necron", "Warrior"]);
    expect(tok.types.sort()).toEqual(["Artifact", "Creature"]);
    expect(`${tok.power}/${tok.toughness}`).toBe("2/2");
    // A sorcery isn't an artifact spell.
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s, ap);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("an opponent's Root Maze makes your creatures enter tapped: they enter as artifacts (rulings, CR 614.12)", () => {
    const { s: s0, ap, ids, opp } = setup([ogre]);
    putOnBattlefield(s0, opp, rootMaze);
    putOnBattlefield(s0, ap, biotransference);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });

  it("under Ethersworn Canonist a creature spell is an artifact spell, so a sorcery can still follow it, but not a second one", () => {
    const { s: s0, ap, ids } = setup([bear(), ponder, ponder]);
    putOnBattlefield(s0, ap, canonist);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // Without Biotransference the bear is a nonartifact spell: nothing else nonartifact this turn.
    expect(castProblem(s, ap, ids[1]!)).toMatch(/Canonist|nonartifact/);
    expect(planCast(s, ap, ids[1]!)).toBeNull();

    const { s: t0, ap: bp, ids: bids } = setup([bear(), ponder, ponder]);
    putOnBattlefield(t0, bp, canonist);
    putOnBattlefield(t0, bp, biotransference);
    let t = settle(run(t0, planCast(t0, bp, bids[0]!)), bp);
    expect(planCast(t, bp, bids[1]!)).not.toBeNull();
    t = settle(run(t, planCast(t, bp, bids[1]!)), bp);
    expect(t.objects[bids[1]!]!.zone).toBe("graveyard");
    expect(planCast(t, bp, bids[2]!)).toBeNull();
  });
});

describe("Rootpath Purifier", () => {
  it("lands you control are basic, a legendary one too; other players' lands and the land cards in your hand aren't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, rootpath);
    const mine = putOnBattlefield(s, ap, tower);
    const legend = putOnBattlefield(s, ap, throne);
    const theirs = putOnBattlefield(s, opp, tower);
    const inHand = into(s, ap, tower, "hand");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[mine]!).supertypes).toContain("Basic");
    expect(characteristics(s, s.objects[legend]!).supertypes.sort()).toEqual(["Basic", "Legendary"]);
    // No basic land type comes with it (rulings).
    expect(characteristics(s, s.objects[mine]!).subtypes).toEqual([]);
    expect(characteristics(s, s.objects[theirs]!).supertypes).not.toContain("Basic");
    expect(defOf(s, s.objects[inHand]!).supertypes).not.toContain("Basic");
  });

  it("Rampant Growth may find any land card in your library, which stays basic on the battlefield", () => {
    const { s: s0, ap, ids } = setup([rampant]);
    const towerId = into(s0, ap, tower, "library");
    // Without it, the nonbasic land can't be found.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    expect((s.pending as { cards: string[] }).cards).not.toContain(towerId);

    const { s: t0, ap: bp, ids: bids } = setup([rampant]);
    putOnBattlefield(t0, bp, rootpath);
    const towerId2 = into(t0, bp, tower, "library");
    const creatureInLibrary = into(t0, bp, ogre, "library");
    expect(defOf(t0, t0.objects[towerId2]!).supertypes).toContain("Basic");
    let t = settle(run(t0, planCast(t0, bp, bids[0]!)), bp);
    expect(t.pending?.kind).toBe("searchLibrary");
    expect((t.pending as { cards: string[] }).cards).toContain(towerId2);
    expect((t.pending as { cards: string[] }).cards).not.toContain(creatureInLibrary);
    t = act(t, { type: "searchLibrary", player: bp, found: [towerId2] });
    t = settle(t, bp);
    expect(t.objects[towerId2]!.zone).toBe("battlefield");
    expect(t.objects[towerId2]!.tapped).toBe(true);
    expect(characteristics(t, t.objects[towerId2]!).supertypes).toContain("Basic");
  });

  it("an opponent's Blood Moon no longer applies to your lands, which are basic (rulings, CR 613.8a)", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, bloodMoon);
    const mine = putOnBattlefield(s, ap, tower);
    const theirs = putOnBattlefield(s, opp, tower);
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[mine]!).subtypes).toEqual(["Mountain"]);
    // Rootpath Purifier enters after Blood Moon: Blood Moon depends on it, so it applies first.
    putOnBattlefield(s, ap, rootpath);
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[mine]!).subtypes).toEqual([]);
    expect(characteristics(s, s.objects[theirs]!).subtypes).toEqual(["Mountain"]);
  });

  it("a basic Forest stays a Forest", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, rootpath);
    const f = putOnBattlefield(s, ap, forestCard);
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[f]!).supertypes).toEqual(["Basic"]);
    expect(characteristics(s, s.objects[f]!).subtypes).toEqual(["Forest"]);
  });
});

describe("Painter's Servant", () => {
  const paint = (s: GameState, pid: PlayerId, color: "W" | "U" | "B" | "R" | "G") => {
    const id = putOnBattlefield(s, pid, painter);
    s.objects[id]!.chosen = { ...(s.objects[id]!.chosen ?? {}), color };
    invalidateCharacteristics(s);
    return id;
  };
  const colors = (s: GameState, id: ObjectId) => [...(s.objects[id]!.zone === "battlefield" ? characteristics(s, s.objects[id]!).colors : defOf(s, s.objects[id]!).colors)].sort();

  it("every permanent, whoever controls it, and every card in every zone, whoever owns it, is the chosen color too; a colorless one is just that color", () => {
    const { s, ap, opp, ids } = setup([shock]);
    const servant = paint(s, ap, "U");
    const theirBear = putOnBattlefield(s, opp, bear());
    const myRock = putOnBattlefield(s, ap, rock);
    const land = putOnBattlefield(s, ap, tower);
    const theirYard = into(s, opp, ogre, "graveyard");
    const myLibrary = into(s, ap, ogre, "library");
    invalidateCharacteristics(s);
    expect(colors(s, servant)).toEqual(["U"]);
    expect(colors(s, theirBear)).toEqual(["G", "U"]);
    expect(colors(s, myRock)).toEqual(["U"]);
    expect(colors(s, land)).toEqual(["U"]);
    expect(colors(s, theirYard)).toEqual(["R", "U"]);
    expect(colors(s, myLibrary)).toEqual(["R", "U"]);
    expect(colors(s, ids[0]!)).toEqual(["R", "U"]);
  });

  it("a spell on the stack is that color too", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    paint(s0, ap, "W");
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    expect(colors(s, ids[0]!)).toEqual(["R", "W"]);
  });

  it("with no color chosen, nothing changes", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, painter);
    const theirBear = putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    expect(colors(s, theirBear)).toEqual(["G"]);
  });

  it("two of them: both colors (rulings)", () => {
    const { s, ap, opp } = setup([]);
    paint(s, ap, "U");
    paint(s, opp, "B");
    const theirBear = putOnBattlefield(s, opp, bear());
    const yard = into(s, ap, ogre, "graveyard");
    invalidateCharacteristics(s);
    expect(colors(s, theirBear)).toEqual(["B", "G", "U"]);
    expect(colors(s, yard)).toEqual(["B", "R", "U"]);
  });

  it("with Mycosynth Lattice, the later one wins (CR 613.7)", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, lattice);
    paint(s, ap, "G");
    const theirBear = putOnBattlefield(s, opp, card("Test Wolf", "Creature — Wolf", "{1}{R}", { power: "2", toughness: "2" }));
    const yard = into(s, opp, ogre, "graveyard");
    invalidateCharacteristics(s);
    expect(colors(s, theirBear)).toEqual(["G"]);
    expect(colors(s, yard)).toEqual(["G"]);

    const { s: t, ap: bp, opp: bo } = setup([]);
    paint(t, bp, "G");
    putOnBattlefield(t, bp, lattice);
    const wolf = putOnBattlefield(t, bo, card("Test Wolf", "Creature — Wolf", "{1}{R}", { power: "2", toughness: "2" }));
    const yard2 = into(t, bo, ogre, "graveyard");
    invalidateCharacteristics(t);
    expect(colors(t, wolf)).toEqual([]);
    expect(colors(t, yard2)).toEqual([]);
  });

  it("cast, it asks for a color as it enters", () => {
    const { s: s0, ap, ids } = setup([painter]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.player).toBe(ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.chosen?.color).toBe("R");
    const land = s.battlefield.find((id) => objIsType(s, s.objects[id]!, "Land"))!;
    expect(colors(s, land)).toEqual(["R"]);
    expect(colors(s, s.players[ap]!.library[0]!)).toContain("R");
  });
});
