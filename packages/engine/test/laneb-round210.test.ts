// Lane B round B210: Kaboom! (for each target player or planeswalker, reveal until a nonland card, damage equal to its mana
// value, the revealed cards on the bottom in any order), Thought Lash (cumulative upkeep: exile the top card of your library
// for each age counter; a player who doesn't pay exiles their whole library), Mystic Barrier (left or right as it enters and
// each upkeep; attacks only the nearest opponent that way) and Martyrdom (a granted redirect only its caster's side may use).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, applyAction, attackProblem, botActions, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const kaboom = (): CardDef => ({"oracleId":"c92802ff-484c-4d55-aba4-c3a000264113","name":"Kaboom!","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose any number of target players or planeswalkers. For each of them, reveal cards from the top of your library until you reveal a nonland card, Kaboom! deals damage equal to that card's mana value to that player or planeswalker, then you put the revealed cards on the bottom of your library in any order.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1e81e5fc-0e18-4dd8-a505-aa7dba8521a8.jpg?1783945054","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1e81e5fc-0e18-4dd8-a505-aa7dba8521a8.jpg?1783945054","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lash = (): CardDef => ({"oracleId":"81fe7c5e-503e-488c-b06c-1615ed38e5a3","name":"Thought Lash","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep—Exile the top card of your library. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen a player doesn't pay this enchantment's cumulative upkeep, that player exiles all cards from their library.\nExile the top card of your library: Prevent the next 1 damage that would be dealt to you this turn.","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d59bbac1-ca51-4c72-9f1f-5fc6c82a4a27.jpg?1783947191","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d59bbac1-ca51-4c72-9f1f-5fc6c82a4a27.jpg?1783947191","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const barrier = (): CardDef => ({"oracleId":"0caf42f5-abff-48aa-9bbf-df6cba169ef3","name":"Mystic Barrier","manaCost":"{4}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters and at the beginning of your upkeep, choose left or right.\nEach player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ffb70bd4-e876-4242-b5b4-bb7493710f0f.jpg?1783939689","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ffb70bd4-e876-4242-b5b4-bb7493710f0f.jpg?1783939689","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const martyrdom = (): CardDef => ({"oracleId":"f6a6da20-52c8-4921-9884-29d3a3051b0d","name":"Martyrdom","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, target creature you control gains \"{0}: The next 1 damage that would be dealt to target creature, planeswalker, or player this turn is dealt to this creature instead.\" Only you may activate this ability.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07f91817-8e79-4885-a57b-d26241c4791f.jpg?1783947201","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07f91817-8e79-4885-a57b-d26241c4791f.jpg?1783947201","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const portcullis = (): CardDef => ({"oracleId":"6230c179-0263-4fa4-b0ff-f2cb621de147","name":"Portcullis","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a creature enters, if there are two or more other creatures on the battlefield, exile that creature. Return that card to the battlefield under its owner's control when this artifact leaves the battlefield.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a4de4af2-fa75-4a87-b0e1-0117727917a5.jpg?1783946536","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a4de4af2-fa75-4a87-b0e1-0117727917a5.jpg?1783946536","commanderLegal":"legal","set":"sth","releasedAt":"1998-03-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or `me` has a question. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const obj = (s: GameState, id: ObjectId) => s.objects[id]!;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
/** A new card for `def` on top of `pid`'s library (the last one put there ends on top). */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  obj(s, id).zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const forestDef = (s: GameState, pid: PlayerId) => s.cards[obj(s, s.players[pid]!.library.find((id) => s.cards[obj(s, id).cardId]!.name === "Forest")!).cardId]!;
const toUpkeep = (s0: GameState, ap: PlayerId) => {
  let s = passUntil(s0, "end", nextOf(s0, ap, 3));
  s = passUntil(s, "upkeep", ap);
  return settle(s, ap);
};

describe("round B210 cards are supported", () => {
  it("compiles every line", () => supported(kaboom(), lash(), barrier(), martyrdom(), portcullis()));
});

describe("Kaboom!", () => {
  it("for each target player in turn order: reveals until a nonland card, deals its mana value, and the revealed cards go on the bottom in the order chosen", () => {
    const { s: s0, ap, ids, opp } = setup([kaboom()]);
    const opp2 = nextOf(s0, ap, 2);
    const forest = forestDef(s0, ap);
    // From the top: Forest, Martyrdom (3), Forest, Forest, Grizzly Bears (2).
    const g = onTop(s0, ap, grizzly());
    const f3 = onTop(s0, ap, forest);
    const f2 = onTop(s0, ap, forest);
    const m = onTop(s0, ap, martyrdom());
    const f1 = onTop(s0, ap, forest);
    const below = s0.players[ap]!.library[5]!;
    // Targets listed opp2 first: they're still done in turn order, opp first.
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp2 }, { kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(life(s, opp)).toBe(37);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "bottom", cards: [f1, m] });
    s = act(s, { type: "arrangeTop", player: ap, top: [m, f1], away: [] });
    s = settle(s, ap);
    expect(life(s, opp2)).toBe(38);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "bottom", cards: [f2, f3, g] });
    s = act(s, { type: "arrangeTop", player: ap, top: [g, f3, f2], away: [] });
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(life(s, ap)).toBe(40);
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(below);
    expect(lib.slice(-5)).toEqual([m, f1, g, f3, f2]);
    expect(obj(s, ids[0]!).zone).toBe("graveyard");
  });

  it("with only lands left, no damage; all of them go on the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([kaboom()]);
    const forest = forestDef(s0, ap);
    for (const id of [...s0.players[ap]!.library]) obj(s0, id).zone = "exile";
    s0.players[ap]!.library = [];
    const a = onTop(s0, ap, forest);
    const b = onTop(s0, ap, forest);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", cards: [b, a] });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [a, b], away: [] }), ap);
    expect(life(s, opp)).toBe(40);
    expect(s.players[ap]!.library).toEqual([a, b]);
  });

  it("a single revealed card needs no order; a planeswalker can be a target", () => {
    const { s: s0, ap, ids, opp } = setup([kaboom()]);
    const pw = putOnBattlefield(s0, opp, { ...bear({ name: "Test Walker" }), typeLine: "Legendary Planeswalker — Test", types: ["Planeswalker"], supertypes: ["Legendary"], subtypes: ["Test"], loyalty: "5", power: undefined, toughness: undefined } as CardDef);
    obj(s0, pw).counters.loyalty = 5;
    onTop(s0, ap, grizzly());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: pw }]));
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(obj(s, pw).counters.loyalty).toBe(3);
  });

  it("a bot casting it orders the cards itself", () => {
    const { s: s0, ap, ids, opp } = setup([kaboom()]);
    const forest = forestDef(s0, ap);
    onTop(s0, ap, grizzly());
    onTop(s0, ap, forest);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(life(s, opp)).toBe(38);
  });
});

describe("Thought Lash", () => {
  it("cumulative upkeep: the top card of your library exiled for each age counter", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, lash());
    let s = toUpkeep(s0, ap);
    expect(obj(s, t).counters.age).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const top = s.players[ap]!.library[0]!;
    const n = s.players[ap]!.library.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(obj(s, top).zone).toBe("exile");
    expect(s.players[ap]!.library.length).toBe(n - 1);
    expect(obj(s, t).zone).toBe("battlefield");
  });

  it("not paid: sacrificed, then that player exiles all cards from their library", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, lash());
    let s = toUpkeep(s0, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(obj(s, t).zone).toBe("graveyard");
    expect(s.players[ap]!.library.length).toBe(0);
    expect(s.pending).toBeFalsy();
  });

  it("can't be paid with fewer cards in the library than age counters", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, lash());
    obj(s0, t).counters.age = 2;
    const keep = s0.players[ap]!.library.slice(0, 2);
    for (const id of s0.players[ap]!.library.slice(2)) obj(s0, id).zone = "exile";
    s0.players[ap]!.library = keep;
    // The draw step would draw one; the upkeep comes first: three age counters, two cards.
    const s = toUpkeep(s0, ap);
    expect(s.pending).toBeFalsy();
    expect(obj(s, t).zone).toBe("graveyard");
    expect(keep.every((id) => obj(s, id).zone === "exile")).toBe(true);
  });

  it("its prevention ability exiles the top card as its cost", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, lash());
    const top = s0.players[ap]!.library[0]!;
    const i = abilitiesOf(s0, obj(s0, t)).activated.findIndex((ab) => /Prevent the next 1 damage/.test(ab.text));
    const s = settle(run(s0, planActivate(s0, ap, t, i)), ap);
    expect(obj(s, top).zone).toBe("exile");
    expect(s.players[ap]!.preventNext).toBe(1);
  });

  it("a bot pays it", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, opp, lash());
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(obj(s, t).zone).toBe("battlefield");
    expect(s.players[opp]!.library.length).toBeGreaterThan(50);
  });
});

describe("Mystic Barrier", () => {
  it("as it enters and each upkeep: left or right; only the nearest opponent that way can be attacked", () => {
    const { s: s0, ap, ids, opp } = setup([barrier()]);
    const right = nextOf(s0, ap, 3);
    const across = nextOf(s0, ap, 2);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, across, bear({ name: "Across Bear" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    // Nothing chosen yet before the trigger resolves; now it asks.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "direction" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "left" }), ap);
    expect(obj(s, ids[0]!).chosen?.direction).toBe("left");
    expect(attackProblem(s, obj(s, mine), opp)).toBeNull();
    expect(attackProblem(s, obj(s, mine), right)).toMatch(/nearest opponent/);
    expect(attackProblem(s, obj(s, mine), across)).toMatch(/nearest opponent/);
    // The player across: their nearest opponent to the left is the player after them.
    expect(attackProblem(s, obj(s, theirs), nextOf(s, across, 1))).toBeNull();
    expect(attackProblem(s, obj(s, theirs), opp)).toMatch(/nearest opponent/);
    // Next upkeep: right this time.
    s = toUpkeep(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "direction" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "right" }), ap);
    expect(obj(s, ids[0]!).chosen?.direction).toBe("right");
    expect(attackProblem(s, obj(s, mine), right)).toBeNull();
    expect(attackProblem(s, obj(s, mine), opp)).toMatch(/nearest opponent/);
  });

  it("a bot chooses a direction", () => {
    const { s: s0, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, barrier());
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(["left", "right"]).toContain(obj(s, b).chosen?.direction);
  });
});

describe("Martyrdom", () => {
  /** We cast Martyrdom on our bear: it gains the {0} redirect. A Shock stays in hand. */
  const granted = () => {
    const { s: s0, ap, ids, opp } = setup([martyrdom(), shock()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }]));
    s = settle(s, ap);
    const i = abilitiesOf(s, obj(s, b)).activated.findIndex((ab) => /The next 1 damage/.test(ab.text));
    return { s, ap, opp, b, i, shockId: ids[1]! };
  };

  it("the creature gains a {0} ability that redirects the next 1 damage to it", () => {
    const { s: s1, ap, b, i, shockId } = granted();
    expect(i).toBeGreaterThanOrEqual(0);
    expect(abilitiesOf(s1, obj(s1, b)).activated[i]!.onlyPlayer).toBe(ap);
    // The next 1 damage dealt to us goes to the bear instead.
    let s = settle(run(s1, planActivate(s1, ap, b, i, [{ kind: "player", id: ap }])), ap);
    s = settle(run(s, planCast(s, ap, shockId, [{ kind: "player", id: ap }])), ap);
    expect(life(s, ap)).toBe(39);
    expect(obj(s, b).damage).toBe(1);
  });

  it("only Martyrdom's controller may activate it, even once another player controls the creature", () => {
    const { s: s1, ap, opp, b, i } = granted();
    const s = s1;
    s.effects.push({ id: "xc", timestamp: s.nextTimestamp++, controller: opp, sourceName: "test", duration: "game", affected: [b], mods: [{ kind: "control" }] });
    invalidateCharacteristics(s);
    expect(controllerOf(s, obj(s, b))).toBe(opp);
    expect(abilityProblem(s, opp, b, i, [{ kind: "player", id: opp }])).toMatch(/only/);
    expect(abilityProblem(s, ap, b, i, [{ kind: "player", id: ap }])).toBeNull();
  });

  it("ends at end of turn", () => {
    const { s: s1, ap, b } = granted();
    const s = passUntil(s1, "upkeep", nextOf(s1, ap, 1));
    expect(abilitiesOf(s, obj(s, b)).activated.some((ab) => /The next 1 damage/.test(ab.text))).toBe(false);
  });
});

describe("Portcullis", () => {
  /** Portcullis and `others` bears on the battlefield; Grizzly Bears in hand. */
  const table = (others: number) => {
    const { s: s0, ap, ids, opp } = setup([grizzly()]);
    const p = putOnBattlefield(s0, ap, portcullis());
    const bears = Array.from({ length: others }, (_, k) => putOnBattlefield(s0, k % 2 ? opp : ap, bear({ name: `Bear ${k}` })));
    return { s0, ap, opp, p, bears, g: ids[0]! };
  };
  /** Casts the Grizzly Bears and lets it resolve, stopping with Portcullis's trigger on the stack (if it triggered). */
  const enter = (s0: GameState, ap: PlayerId, g: ObjectId) => {
    let s = run(s0, planCast(s0, ap, g));
    for (let i = 0; i < 20 && obj(s, g).zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("a creature entering with two or more other creatures is exiled, and returns under its owner's control when Portcullis leaves", () => {
    const { s0, ap, p, g } = table(2);
    let s = enter(s0, ap, g);
    expect(s.stack.length).toBe(1);
    s = settle(s, ap);
    expect(obj(s, g).zone).toBe("exile");
    moveObject(s, p, "graveyard");
    s = settle(s, ap);
    expect(obj(s, g).zone).toBe("battlefield");
    expect(controllerOf(s, obj(s, g))).toBe(ap);
  });

  it("doesn't trigger with only one other creature", () => {
    const { s0, ap, g } = table(1);
    let s = enter(s0, ap, g);
    expect(s.stack.length).toBe(0);
    s = settle(s, ap);
    expect(obj(s, g).zone).toBe("battlefield");
  });

  it("counts again as it resolves: one of the others gone, nothing happens", () => {
    const { s0, ap, g, bears } = table(2);
    let s = enter(s0, ap, g);
    expect(s.stack.length).toBe(1);
    moveObject(s, bears[0]!, "graveyard");
    s = settle(s, ap);
    expect(obj(s, g).zone).toBe("battlefield");
  });

  it("if Portcullis has already left as it resolves, the creature stays exiled for good", () => {
    const { s0, ap, p, g } = table(3);
    let s = enter(s0, ap, g);
    moveObject(s, p, "graveyard");
    s = settle(s, ap);
    expect(obj(s, g).zone).toBe("exile");
    expect((s.delayed ?? []).length).toBe(0);
  });

  it("an opponent's creature comes back under its owner's control, even if Portcullis changed hands", () => {
    const { s0, ap, opp, p } = table(2);
    // The opponent casts a creature on their turn.
    let s = passUntil(s0, "main1", opp);
    const og = putOnBattlefield(s, opp, grizzly());
    s.battlefield.splice(s.battlefield.indexOf(og), 1);
    obj(s, og).zone = "hand";
    s.players[opp]!.hand.push(og);
    for (const l of ["Forest", "Forest"]) obj(s, putOnBattlefield(s, opp, { ...forestDef(s, ap), name: l }));
    s = enter(s, opp, og);
    s = settle(s);
    expect(obj(s, og).zone).toBe("exile");
    s.effects.push({ id: "xc", timestamp: s.nextTimestamp++, controller: opp, sourceName: "test", duration: "game", affected: [p], mods: [{ kind: "control" }] });
    invalidateCharacteristics(s);
    moveObject(s, p, "exile");
    s = settle(s);
    expect(obj(s, og).zone).toBe("battlefield");
    expect(controllerOf(s, obj(s, og))).toBe(opp);
  });
});
