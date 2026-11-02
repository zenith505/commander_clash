// Round 243: cards from the top of the popularity list. Verdeloth the Ancient ("Saproling creatures and other Treefolk
// creatures get +1/+1"); Fork ("Copy target instant or sorcery spell, except that the copy is red"); Linvala, Shield of Sea
// Gate ("Choose hexproof or indestructible. Creatures you control gain that ability until end of turn"); Icebreaker Kraken
// ("artifacts and creatures target opponent controls don't untap during that player's next untap step"); Voracious
// Bibliophile ("Whenever you cast a spell with one or more targets, draw that many cards"); Welcome the Dead ("cards that
// were put into your graveyard from your hand or library this turn"); Larval Scoutlander ("sacrifice a land or Lander");
// Mistbreath Elder ("return another creature you control ... If you do, ... Otherwise, you may return ~"); Irencrag Feat
// ("You can cast only one more spell this turn"); Fumiko the Lowblood ("bushido X, where X is the number of attacking
// creatures"); Starving Revenant ("for each card you put on top of your library" after surveil); Spider-Man 2099 ("if
// you've played a land or cast a spell this turn from anywhere other than your hand"); Widespread Brutality ("the Army you
// amassed deals damage equal to its power"); Soulbright Flamekin ("If this is the third time ..., you may add").

import { describe, expect, it } from "vitest";
import { act, addEffect, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, characteristics, compileCard, defOf, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name);
/** Everyone passes (bots answer their own questions, nobody attacks or blocks) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
/** Only these cards in `pid`'s hand. */
const onlyHand = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};

// Real oracle text (Scryfall).
const verdeloth = (): CardDef => ({"oracleId": "8222321f-b74d-4f74-9ee7-79455433345a", "name": "Verdeloth the Ancient", "manaCost": "{4}{G}{G}", "cmc": 6, "typeLine": "Legendary Creature — Treefolk", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Treefolk"], "oracleText": "Kicker {X} (You may pay an additional {X} as you cast this spell.)\nSaproling creatures and other Treefolk creatures get +1/+1.\nWhen Verdeloth enters, if it was kicked, create X 1/1 green Saproling creature tokens.", "power": "4", "toughness": "7", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Kicker"], "imageUrl": "https://cards.scryfall.io/normal/front/7/2/72d5fab1-fa20-4006-b19d-179d36238c9b.jpg?1783945668", "artUrl": "https://cards.scryfall.io/art_crop/front/7/2/72d5fab1-fa20-4006-b19d-179d36238c9b.jpg?1783945668", "commanderLegal": "legal", "set": "inv", "releasedAt": "2000-10-02", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const fork = (): CardDef => ({"oracleId": "50c53ae0-51ba-4046-ac74-87c65e688032", "name": "Fork", "manaCost": "{R}{R}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Copy target instant or sorcery spell, except that the copy is red. You may choose new targets for the copy.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/e/6/e6b43916-fe2d-417a-a550-d7c795023297.jpg?1783948686", "artUrl": "https://cards.scryfall.io/art_crop/front/e/6/e6b43916-fe2d-417a-a550-d7c795023297.jpg?1783948686", "commanderLegal": "legal", "set": "lea", "releasedAt": "1993-08-05", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const linvala = (): CardDef => ({"oracleId": "afd8ff3e-1d57-4fc5-91dc-1a8400c98787", "name": "Linvala, Shield of Sea Gate", "manaCost": "{1}{W}{U}", "cmc": 3, "typeLine": "Legendary Creature — Angel Wizard", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Angel", "Wizard"], "oracleText": "Flying\nAt the beginning of combat on your turn, if you have a full party, choose target nonland permanent an opponent controls. Until your next turn, it can't attack or block, and its activated abilities can't be activated.\nSacrifice Linvala: Choose hexproof or indestructible. Creatures you control gain that ability until end of turn.", "power": "3", "toughness": "3", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/4/9/49b66956-82e1-402f-9088-2201bdc0d4b8.jpg?1783929323", "artUrl": "https://cards.scryfall.io/art_crop/front/4/9/49b66956-82e1-402f-9088-2201bdc0d4b8.jpg?1783929323", "commanderLegal": "legal", "set": "znr", "releasedAt": "2020-09-25", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const kraken = (): CardDef => ({"oracleId": "01590ff3-34fa-47aa-b5da-f0b8c1b031c6", "name": "Icebreaker Kraken", "manaCost": "{10}{U}{U}", "cmc": 12, "typeLine": "Snow Creature — Kraken", "supertypes": ["Snow"], "types": ["Creature"], "subtypes": ["Kraken"], "oracleText": "Affinity for snow lands (This spell costs {1} less to cast for each snow land you control.)\nWhen this creature enters, artifacts and creatures target opponent controls don't untap during that player's next untap step.\nReturn three snow lands you control to their owner's hand: Return this creature to its owner's hand.", "power": "8", "toughness": "8", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Affinity"], "imageUrl": "https://cards.scryfall.io/normal/front/f/1/f1fdb9bb-09a2-4ff7-bcd4-35ea33c1b752.jpg?1783928261", "artUrl": "https://cards.scryfall.io/art_crop/front/f/1/f1fdb9bb-09a2-4ff7-bcd4-35ea33c1b752.jpg?1783928261", "commanderLegal": "legal", "set": "khm", "releasedAt": "2021-02-05", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const bibliophile = (): CardDef => ({"oracleId": "dcc323d6-ddae-4fd9-9c9e-466b07895d73", "name": "Voracious Bibliophile", "manaCost": "{3}{U}", "cmc": 4, "typeLine": "Creature — Dragon", "supertypes": [], "types": ["Creature"], "subtypes": ["Dragon"], "oracleText": "Flying, vigilance\nWhenever you cast a spell with one or more targets, draw that many cards.", "power": "3", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying", "Vigilance"], "imageUrl": "https://cards.scryfall.io/normal/front/7/7/77d2c30b-3130-4d9d-bd3d-484fe6dc306d.jpg?1783907179", "artUrl": "https://cards.scryfall.io/art_crop/front/7/7/77d2c30b-3130-4d9d-bd3d-484fe6dc306d.jpg?1783907179", "commanderLegal": "legal", "set": "tdc", "releasedAt": "2025-04-11", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const welcome = (): CardDef => ({"oracleId": "affa0b6c-a9fd-49fc-b9ce-9a3486af8320", "name": "Welcome the Dead", "manaCost": "{3}{B}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards, then discard a card and you lose 2 life. Create X tapped 2/2 black Zombie Druid creature tokens, where X is the number of cards that were put into your graveyard from your hand or library this turn.\nFlashback {5}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Flashback"], "imageUrl": "https://cards.scryfall.io/normal/front/f/4/f472ea5c-191e-4b19-8ea7-f8649af91530.jpg?1783907174", "artUrl": "https://cards.scryfall.io/art_crop/front/f/4/f472ea5c-191e-4b19-8ea7-f8649af91530.jpg?1783907174", "commanderLegal": "legal", "set": "tdc", "releasedAt": "2025-04-11", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const scoutlander = (): CardDef => ({"oracleId": "b3f3d55c-a3f6-441b-a380-60c0734dc514", "name": "Larval Scoutlander", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Artifact — Spacecraft", "supertypes": [], "types": ["Artifact"], "subtypes": ["Spacecraft"], "oracleText": "When this Spacecraft enters, you may sacrifice a land or Lander. If you do, search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 7+.)\n7+ | Flying", "power": "3", "toughness": "3", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Station"], "imageUrl": "https://cards.scryfall.io/normal/front/d/6/d6083f43-58dc-46fc-aeff-347b1080417b.jpg?1783905936", "artUrl": "https://cards.scryfall.io/art_crop/front/d/6/d6083f43-58dc-46fc-aeff-347b1080417b.jpg?1783905936", "commanderLegal": "legal", "set": "eoe", "releasedAt": "2025-08-01", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const mistbreath = (): CardDef => ({"oracleId": "bf9221f5-a4b2-4074-901c-0fa3c2bda80c", "name": "Mistbreath Elder", "manaCost": "{G}", "cmc": 1, "typeLine": "Creature — Frog Warrior", "supertypes": [], "types": ["Creature"], "subtypes": ["Frog", "Warrior"], "oracleText": "At the beginning of your upkeep, return another creature you control to its owner's hand. If you do, put a +1/+1 counter on this creature. Otherwise, you may return this creature to its owner's hand.", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/e/5/e5246540-5a84-41d8-9e30-8e7a6c0e84e1.jpg?1783910806", "artUrl": "https://cards.scryfall.io/art_crop/front/e/5/e5246540-5a84-41d8-9e30-8e7a6c0e84e1.jpg?1783910806", "commanderLegal": "legal", "set": "blb", "releasedAt": "2024-08-02", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const irencrag = (): CardDef => ({"oracleId": "2d550e17-7340-4b11-8b25-1d4f1a58f82f", "name": "Irencrag Feat", "manaCost": "{1}{R}{R}{R}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Add seven {R}. You can cast only one more spell this turn.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "producedMana": ["R"], "imageUrl": "https://cards.scryfall.io/normal/front/b/5/b5bcf822-e129-45f6-9403-310ce9410f3b.jpg?1783932622", "artUrl": "https://cards.scryfall.io/art_crop/front/b/5/b5bcf822-e129-45f6-9403-310ce9410f3b.jpg?1783932622", "commanderLegal": "legal", "set": "eld", "releasedAt": "2019-10-04", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const fumiko = (): CardDef => ({"oracleId": "cba58942-b98c-45aa-8651-7dc666e31c93", "name": "Fumiko the Lowblood", "manaCost": "{2}{R}{R}", "cmc": 4, "typeLine": "Legendary Creature — Human Samurai", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Samurai"], "oracleText": "Fumiko has bushido X, where X is the number of attacking creatures. (Whenever this creature blocks or becomes blocked, it gets +X/+X until end of turn.)\nCreatures your opponents control attack each combat if able.", "power": "3", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/8/482678b8-bce6-4847-9f43-1761d61645d8.jpg?1783944191", "artUrl": "https://cards.scryfall.io/art_crop/front/4/8/482678b8-bce6-4847-9f43-1761d61645d8.jpg?1783944191", "commanderLegal": "legal", "set": "bok", "releasedAt": "2005-02-04", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const revenant = (): CardDef => ({"oracleId": "2ca969eb-3d79-4d1f-8d9d-7b8204ad166a", "name": "Starving Revenant", "manaCost": "{2}{B}{B}", "cmc": 4, "typeLine": "Creature — Spirit Horror", "supertypes": [], "types": ["Creature"], "subtypes": ["Spirit", "Horror"], "oracleText": "When this creature enters, surveil 2. Then for each card you put on top of your library, you draw a card and you lose 3 life.\nDescend 8 — Whenever you draw a card, if there are eight or more permanent cards in your graveyard, target opponent loses 1 life and you gain 1 life.", "power": "4", "toughness": "4", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Surveil", "Descend"], "imageUrl": "https://cards.scryfall.io/normal/front/f/2/f25ea466-eb48-4c4c-b5d4-35f58e46ebe1.jpg?1783913770", "artUrl": "https://cards.scryfall.io/art_crop/front/f/2/f25ea466-eb48-4c4c-b5d4-35f58e46ebe1.jpg?1783913770", "commanderLegal": "legal", "set": "lci", "releasedAt": "2023-11-17", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const spiderman = (): CardDef => ({"oracleId": "19845456-3d96-48a4-89fa-9b8e583774c9", "name": "Spider-Man 2099", "manaCost": "{U}{R}", "cmc": 2, "typeLine": "Legendary Creature — Spider Human Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Spider", "Human", "Hero"], "oracleText": "From the Future — You can't cast Spider-Man 2099 during your first, second, or third turns of the game.\nDouble strike, vigilance\nAt the beginning of your end step, if you've played a land or cast a spell this turn from anywhere other than your hand, Spider-Man 2099 deals damage equal to his power to any target.", "power": "2", "toughness": "3", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "keywords": ["Vigilance", "From the Future", "Double strike"], "imageUrl": "https://cards.scryfall.io/normal/front/2/a/2a72c7e7-34f5-4cb0-9959-35516e398e49.jpg?1785161499", "artUrl": "https://cards.scryfall.io/art_crop/front/2/a/2a72c7e7-34f5-4cb0-9959-35516e398e49.jpg?1785161499", "commanderLegal": "legal", "set": "spm", "releasedAt": "2025-09-26", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const brutality = (): CardDef => ({"oracleId": "3a06f4c1-2af1-495f-914f-1ac4e26f87d4", "name": "Widespread Brutality", "manaCost": "{1}{B}{R}{R}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Amass Zombies 2, then the Army you amassed deals damage equal to its power to each non-Army creature. (To amass Zombies 2, put two +1/+1 counters on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": ["Amass"], "imageUrl": "https://cards.scryfall.io/normal/front/9/7/97715d22-f432-4f67-b4ea-47b8fe6edca5.jpg?1783933385", "artUrl": "https://cards.scryfall.io/art_crop/front/9/7/97715d22-f432-4f67-b4ea-47b8fe6edca5.jpg?1783933385", "commanderLegal": "legal", "set": "war", "releasedAt": "2019-05-03", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const flamekin = (): CardDef => ({"oracleId": "7ea8426a-3b66-4fd0-9863-2b68d379671f", "name": "Soulbright Flamekin", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Creature — Elemental Shaman", "supertypes": [], "types": ["Creature"], "subtypes": ["Elemental", "Shaman"], "oracleText": "{2}: Target creature gains trample until end of turn. If this is the third time this ability has resolved this turn, you may add {R}{R}{R}{R}{R}{R}{R}{R}.", "power": "2", "toughness": "1", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "producedMana": ["R"], "imageUrl": "https://cards.scryfall.io/normal/front/e/a/eaf72b4d-a399-49fb-a890-653b184a9e95.jpg?1783942871", "artUrl": "https://cards.scryfall.io/art_crop/front/e/a/eaf72b4d-a399-49fb-a890-653b184a9e95.jpg?1783942871", "commanderLegal": "legal", "set": "lrw", "releasedAt": "2007-10-12", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;

const creature = (name: string, types: string, p = "2", t = "2") => card(name, `Creature — ${types}`, "{1}", { power: p, toughness: t });

describe("round 243", () => {
  it("parse", () => {
    supported(verdeloth(), fork(), linvala(), kraken(), bibliophile(), welcome(), scoutlander(), mistbreath(), irencrag(), fumiko(), revenant(), spiderman(), brutality(), flamekin());
  });
});

describe("round 243: statics, copies and untaps", () => {
  it("Verdeloth the Ancient: kicked for 2, two Saprolings; Saprolings and other Treefolk get +1/+1, anyone's, a Saproling Treefolk once; not Verdeloth", () => {
    const { s: s0, ap, ids, opp } = setup([verdeloth()]);
    const tree = putOnBattlefield(s0, ap, creature("Test Treefolk", "Treefolk"));
    const theirs = putOnBattlefield(s0, opp, creature("Their Saproling", "Saproling", "1", "1"));
    const both = putOnBattlefield(s0, ap, creature("Saproling Treefolk", "Saproling Treefolk", "1", "1"));
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { kicks: [0] })), { me: ap });
    const v = ids[0]!;
    expect(zone(s, v)).toBe("battlefield");
    const saps = named(s, "Saproling Token");
    expect(saps).toHaveLength(2);
    for (const id of saps) expect(pt(s, id)).toBe("2/2");
    expect(pt(s, tree)).toBe("3/3");
    expect(pt(s, theirs)).toBe("2/2");
    expect(pt(s, both)).toBe("2/2");
    expect(pt(s, bear)).toBe("2/2");
    expect(pt(s, v)).toBe("4/7");
    // As a Saproling too, it gives itself +1/+1 (rulings).
    addEffect(s, ap, [v], [{ kind: "addTypes", types: [], subtypes: ["Saproling"] }]);
    expect(pt(s, v)).toBe("5/8");
  });

  it("Fork: the copy is red, with the original's mana cost; you control it", () => {
    const draw = card("Test Insight", "Instant", "{U}", { colors: ["U"], oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([draw, fork()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const orig = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: orig.id }]));
    // Everyone passes once: Fork resolves, the copy goes on the stack above the original.
    for (let i = 0; i < 20 && s.stack.some((x) => x.objectId === ids[1]); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const copy = s.stack[s.stack.length - 1]!;
    expect(copy.copy).toBe(true);
    expect(copy.controller).toBe(ap);
    const o = s.objects[copy.objectId!]!;
    expect(characteristics(s, o).colors).toEqual(["R"]);
    expect(defOf(s, o).manaCost).toBe("{U}");
    expect(characteristics(s, s.objects[ids[0]!]!).colors).toEqual(["U"]);
    const hand = s.players[ap]!.hand.length;
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Linvala, Shield of Sea Gate: sacrifice it, choose indestructible; creatures you control then gain it until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, linvala());
    const b = putOnBattlefield(s0, ap, creature("Test Bear", "Bear"));
    const theirs = putOnBattlefield(s0, opp, creature("Their Bear", "Bear"));
    let s = run(s0, planActivate(s0, ap, l, 0));
    expect(zone(s, l)).toBe("graveyard");
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "keyword", options: ["Hexproof", "Indestructible"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "Indestructible" });
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(false);
    expect(objHasKeyword(s, s.objects[theirs]!, "Indestructible")).toBe(false);
  });

  it("Icebreaker Kraken: the target opponent's artifacts and creatures don't untap in their next untap step, also ones they get later; lands do", () => {
    const { s: s0, ap, ids, opp } = setup([kraken()]);
    const rock = putOnBattlefield(s0, opp, card("Test Rock", "Artifact", "{1}"));
    const bear = putOnBattlefield(s0, opp, creature("Their Bear", "Bear"));
    const land = putOnBattlefield(s0, opp, forest);
    for (const id of [rock, bear, land]) s0.objects[id]!.tapped = true;
    s0.players[ap]!.manaPool.U = 12;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap, targets: [{ kind: "player", id: opp }] });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // One they get after it resolved, tapped.
    const later = putOnBattlefield(s, opp, creature("Later Bear", "Bear"));
    s.objects[later]!.tapped = true;
    onlyHand(s, ap, []);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.objects[rock]!.tapped).toBe(true);
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(s.objects[later]!.tapped).toBe(true);
    expect(s.objects[land]!.tapped).toBe(false);
  });
});

describe("round 243: casts and counts", () => {
  it("Voracious Bibliophile: draws as many cards as the spell's targets; a spell with no target, none", () => {
    const arc = card("Arc Trail", "Sorcery", "{1}{R}", { colors: ["R"], oracleText: "Arc Trail deals 2 damage to any target and 1 damage to another target." });
    const pump = card("Test Boost", "Instant", "{G}", { colors: ["G"], oracleText: "Up to one target creature gets +1/+1 until end of turn." });
    const growth = card("Test Growth", "Sorcery", "{G}", { colors: ["G"], oracleText: "You gain 1 life." });
    const { s: s0, ap, ids, opp } = setup([arc, pump, growth]);
    putOnBattlefield(s0, ap, bibliophile());
    const theirs = putOnBattlefield(s0, opp, creature("Their Bear", "Bear"));
    let hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, tgt(theirs)])), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    hand = s.players[ap]!.hand.length;
    // "Up to one target" with none chosen: no targets, no trigger.
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "none" }])), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[2]!)), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Welcome the Dead: cards milled and discarded this turn count; a creature that died doesn't; the tokens enter tapped", () => {
    const mill = card("Test Mill", "Sorcery", "{1}", { oracleText: "Mill two cards." });
    const kill = card("Test Kill", "Instant", "{B}", { colors: ["B"], oracleText: "Destroy target creature." });
    const { s: s0, ap, ids } = setup([mill, kill, welcome()]);
    const doomed = putOnBattlefield(s0, ap, creature("Doomed Bear", "Bear"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    // A creature put into the graveyard from the battlefield isn't from the hand or library; the spell from the stack isn't.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(doomed)])), { me: ap });
    expect(zone(s, doomed)).toBe("graveyard");
    // Two milled, the two spells and the creature.
    expect(s.players[ap]!.graveyard.length).toBe(5);
    s = settle(run(s, planCast(s, ap, ids[2]!)), { me: ap });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] }), { me: ap });
    // Two milled and one discarded.
    const zombies = named(s, "Zombie Druid Token");
    expect(zombies).toHaveLength(3);
    for (const id of zombies) expect(s.objects[id]!.tapped).toBe(true);
  });
});

describe("round 243: enters, upkeep and spell limits", () => {
  it("Larval Scoutlander: you may sacrifice a land or a Lander (not another artifact); if you do, two basic lands tapped", () => {
    const { s: s0, ap, ids } = setup([scoutlander()]);
    const lander = putOnBattlefield(s0, ap, card("Lander", "Artifact — Lander", ""));
    s0.objects[lander]!.isToken = true;
    const rock = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{1}"));
    const lands = s0.battlefield.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap, may: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    const p = s.pending!;
    if (p.kind !== "pickPermanents") throw new Error();
    expect(p.options).toContain(lander);
    expect(p.options).not.toContain(rock);
    expect(p.options.some((id) => objIsType(s, s.objects[id]!, "Land"))).toBe(true);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [lander] }), { me: ap });
    expect(s.objects[lander]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const q = s.pending!;
    if (q.kind !== "searchLibrary") throw new Error();
    const found = q.cards.slice(0, 2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found }), { me: ap });
    for (const id of found) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
    // The Scoutlander and two lands in, the Lander out.
    expect(s.battlefield.length).toBe(lands + 2);
  });

  it("Mistbreath Elder: with another creature, it must go back to hand and the Elder gets a counter; alone, the Elder may return itself", () => {
    const { s: s0, ap } = setup([]);
    const elder = putOnBattlefield(s0, ap, mistbreath());
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear"));
    onlyHand(s0, ap, []);
    const start = s0.turn;
    let s = goUntil(s0, (x) => x.turn > start && x.activePlayer === ap && x.step === "draw");
    expect(zone(s, bear)).toBe("hand");
    expect(s.objects[elder]!.counters["+1/+1"]).toBe(1);
    // Alone: "Otherwise, you may return ~".
    const turn2 = s.turn;
    s = goUntil(s, (x) => x.turn > turn2 && x.pending?.kind === "chooseMay" && x.pending.player === ap);
    expect(zone(s, elder)).toBe("battlefield");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(zone(s, elder)).toBe("hand");
  });

  it("Irencrag Feat: seven {R}, then one more spell this turn, however many came before", () => {
    const a = card("Test Spark", "Instant", "{G}", { colors: ["G"], oracleText: "You gain 1 life." });
    const b = card("Test Flare", "Instant", "{R}", { colors: ["R"], oracleText: "You gain 1 life." });
    const c = card("Test Glow", "Instant", "{R}", { colors: ["R"], oracleText: "You gain 1 life." });
    const { s: s0, ap, ids } = setup([a, irencrag(), b, c]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    s = settle(run(s, planCast(s, ap, ids[1]!)), { me: ap });
    expect(s.players[ap]!.manaPool.R).toBe(7);
    expect(castProblem(s, ap, ids[2]!)).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[2]!)), { me: ap });
    expect(castProblem(s, ap, ids[3]!)).toMatch(/can't cast more spells this turn/);
  });

  it("Fumiko the Lowblood: bushido X counts the attacking creatures as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fumiko());
    const b1 = putOnBattlefield(s0, ap, creature("Test Bear", "Bear"));
    const b2 = putOnBattlefield(s0, ap, creature("Test Bear", "Bear"));
    const wall = putOnBattlefield(s0, opp, creature("Their Wall", "Wall", "0", "8"));
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [f, b1, b2].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 60 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [{ blocker: wall, attacker: f }] });
    for (let i = 0; i < 60 && s.stack.length === 0 && s.step === "declareBlockers"; i++) if (waitingOn(s) !== undefined && !s.pending) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s, { me: ap });
    expect(pt(s, f)).toBe("6/5");
  });

  it("Starving Revenant: for each card kept on top, a card drawn and 3 life lost", () => {
    const { s: s0, ap, ids } = setup([revenant()]);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "surveil" });
    const p = s.pending!;
    if (p.kind !== "arrangeTop") throw new Error();
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [p.cards[0]!], away: [p.cards[1]!] }), { me: ap });
    expect(s.players[ap]!.hand).toContain(p.cards[0]!);
    expect(zone(s, p.cards[1]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.life).toBe(life - 3);
  });
});

describe("round 243: end step, amass and the third time", () => {
  it("Spider-Man 2099: nothing at the end step after only casting from hand; after a flashback spell, damage equal to its power", () => {
    const flash = card("Test Recall", "Sorcery", "{1}", { oracleText: "You gain 1 life.\nFlashback {1}" });
    const plain = card("Test Plain", "Sorcery", "{1}", { oracleText: "You gain 1 life." });
    const { s: s0, ap, ids, opp } = setup([plain]);
    putOnBattlefield(s0, ap, spiderman());
    const yard = into(s0, ap, flash, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    onlyHand(s, ap, []);
    const life = s.players[opp]!.life;
    s = goUntil(s, (x) => x.step === "cleanup" || (x.pending?.kind === "chooseTargets" && x.pending.player === ap));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    // Next turn of ours: cast it from the graveyard.
    const t0 = s.turn;
    s = goUntil(s, (x) => x.turn > t0 && x.activePlayer === ap && x.step === "main1");
    s = settle(run(s, planCast(s, ap, yard, undefined, undefined, undefined, undefined, { via: "flashback" })), { me: ap });
    expect(zone(s, yard)).toBe("exile");
    s = goUntil(s, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === ap);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), { me: ap });
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Widespread Brutality: the amassed Army deals damage equal to its power to each non-Army creature, yours too", () => {
    const { s: s0, ap, ids, opp } = setup([brutality()]);
    const mine = putOnBattlefield(s0, ap, creature("Test Bear", "Bear"));
    const theirs = putOnBattlefield(s0, opp, creature("Their Ogre", "Ogre", "3", "3"));
    const army = putOnBattlefield(s0, ap, card("Zombie Army", "Creature — Zombie Army", "", { power: "0", toughness: "0" }));
    s0.objects[army]!.counters["+1/+1"] = 1;
    s0.objects[army]!.isToken = true;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.objects[army]!.counters["+1/+1"]).toBe(3);
    expect(zone(s, army)).toBe("battlefield");
    expect(s.objects[army]!.damage).toBe(0);
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Soulbright Flamekin: the third resolution this turn may add eight {R}; the first two don't", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, flamekin());
    let s = s0;
    const asked: number[] = [];
    for (let i = 1; i <= 3; i++) {
      s = run(s, planActivate(s, ap, f, 0, [tgt(f)]));
      for (let k = 0; k < 100 && (s.stack.length || s.pending); k++) {
        if (s.pending?.kind === "chooseMay" && s.pending.player === ap) {
          asked.push(i);
          // Declined on a copy: no mana.
          expect(act(s, { type: "chooseMay", player: ap, yes: false }).players[ap]!.manaPool.R ?? 0).toBe(0);
          s = act(s, { type: "chooseMay", player: ap, yes: true });
        } else if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
    }
    expect(asked).toEqual([3]);
    expect(s.players[ap]!.manaPool.R).toBe(8);
    expect(objHasKeyword(s, s.objects[f]!, "Trample")).toBe(true);
  });
});
