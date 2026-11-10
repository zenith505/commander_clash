// Lane B round B178: Psychic Rebuttal (counter a spell that targets you, then copy the spell countered this way), Sphinx's
// Approach (exile it and four more for a Sphinx, after the draw), Makeshift Mannequin (a granted trigger for as long as it
// has a mannequin counter, from the moment it enters) and Churning Reservoir (an oil counter removed, or a permanent with
// one put into a graveyard, this turn).

import { describe, expect, it } from "vitest";
import { act, island, mountain, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const rebuttal = (): CardDef => ({"oracleId":"08dd393f-12d8-4801-882c-6d76009b4f12","name":"Psychic Rebuttal","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target instant or sorcery spell that targets you.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, you may copy the spell countered this way. You may choose new targets for the copy.","colors":["U"],"colorIdentity":["U"],"keywords":["Spell mastery"],"imageUrl":"https://cards.scryfall.io/normal/front/6/7/67a105f8-0c01-4c09-a3bf-8c912b6dc741.jpg?1783938349","artUrl":"https://cards.scryfall.io/art_crop/front/6/7/67a105f8-0c01-4c09-a3bf-8c912b6dc741.jpg?1783938349","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sphinx = (): CardDef => ({"oracleId":"48b1ac27-430f-4fd9-a71b-6ad125c57fe3","name":"Sphinx's Approach","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw two cards. Then you may exile this spell and four cards named Sphinx's Approach from your graveyard. If you do, search your library for a Sphinx creature card, put it onto the battlefield, then shuffle.\nA deck can have any number of cards named Sphinx's Approach.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f49be090-c745-40e5-bc1c-605b8d98acdf.jpg?1789644816","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f49be090-c745-40e5-bc1c-605b8d98acdf.jpg?1789644816","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mannequin = (): CardDef => ({"oracleId":"d9dfdbbb-75b3-43d3-8ed6-371cb98a0124","name":"Makeshift Mannequin","manaCost":"{3}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature card from your graveyard to the battlefield with a mannequin counter on it. For as long as that creature has a mannequin counter on it, it has \"When this creature becomes the target of a spell or ability, sacrifice it.\"","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79029161-a2c9-4cf6-94c0-31400daa0e8e.jpg?1783942888","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79029161-a2c9-4cf6-94c0-31400daa0e8e.jpg?1783942888","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const reservoir = (): CardDef => ({"oracleId":"9d1c5987-3572-4bf9-b01c-eb6e98a7da77","name":"Churning Reservoir","manaCost":"{R}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your upkeep, put an oil counter on another target nontoken artifact or creature you control.\n{2}, {T}: Create a 1/1 red Phyrexian Goblin creature token. Activate only if an oil counter was removed from a permanent you controlled this turn or a permanent with an oil counter on it was put into a graveyard this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c117239-8e40-4e7e-ab1b-82f2ddf55cf4.jpg?1783918032","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c117239-8e40-4e7e-ab1b-82f2ddf55cf4.jpg?1783918032","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hexmage = (): CardDef => ({"oracleId":"fcb2a95b-cef0-4b29-8b2b-538f380aff2b","name":"Vampire Hexmage","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"First strike\nSacrifice this creature: Remove all counters from target permanent.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/93d2c4d1-6205-404a-b03d-995b90a3a33a.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/93d2c4d1-6205-404a-b03d-995b90a3a33a.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sphinxC = (): CardDef => ({"oracleId":"d4246e4d-390d-4925-a5a8-89cd096a237c","name":"Sphinx of the Final Word","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"This spell can't be countered.\nFlying\nHexproof (This creature can't be the target of spells or abilities your opponents control.)\nInstant and sorcery spells you control can't be countered.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/866f92a3-2738-4e0f-adda-3ff9227dc17a.jpg?1783937917","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/866f92a3-2738-4e0f-adda-3ff9227dc17a.jpg?1783937917","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Everyone passes until the stack is empty; the bots answer any question. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until `pid` has it (the stack stays as it is). */
const passTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;

describe("Lane B round B178: cards", () => {
  it("compile", () => supported(rebuttal(), sphinx(), mannequin(), reservoir()));
});

describe("Psychic Rebuttal", () => {
  /** An opponent's Lightning Bolt aimed at `at` on the stack, and you holding priority with Psychic Rebuttal in hand. */
  const boltOnStack = (yard: number, at: (ap: PlayerId, opp: PlayerId, s: GameState) => TargetChoice) => {
    let { s, ap, opp, ids } = setup([rebuttal(), divination()]);
    for (let i = 0; i < yard; i++) into(s, ap, i % 2 ? opt() : shock(), "graveyard");
    putOnBattlefield(s, opp, mountain);
    const b = into(s, opp, bolt(), "hand");
    // Divination first, so the opponent gets priority with it on the stack.
    s = run(s, planCast(s, ap, ids[1]!));
    s = passTo(s, opp);
    s = run(s, planCast(s, opp, b, [at(ap, opp, s)]));
    s = passTo(s, ap);
    const item = s.stack.find((x) => x.objectId === b)!;
    return { s, ap, opp, ids, b, item };
  };

  it("counters a Lightning Bolt aimed at you; with two instants and/or sorceries in your graveyard, copies it at a new target", () => {
    let { s, ap, opp, ids, b, item } = boltOnStack(2, (ap) => ({ kind: "player", id: ap }));
    const lives = () => [s.players[ap]!.life, s.players[opp]!.life];
    const [meBefore, oppBefore] = lives();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }]));
    s = settle(s);
    expect(zone(s, b)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    // The copy is on the stack, controlled by you; it isn't cast.
    const copy = s.stack.find((x) => x.copy);
    expect(copy?.controller).toBe(ap);
    s = settle(s);
    expect(lives()).toEqual([meBefore, oppBefore! - 3]);
  });

  it("without spell mastery there's no copy; a Bolt aimed at a creature can't be targeted", () => {
    let { s, ap, opp, ids, b, item } = boltOnStack(1, (ap) => ({ kind: "player", id: ap }));
    const oppBefore = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }])));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(s.stack.some((x) => x.copy)).toBe(false);
    expect(s.players[opp]!.life).toBe(oppBefore);

    const other = boltOnStack(2, (_ap, opp, s) => tgt(putOnBattlefield(s, opp, bears())));
    expect(planCast(other.s, other.ap, other.ids[0]!, [{ kind: "stack", id: other.item.id }])).toBeNull();
  });

  it("declining the copy leaves only the counter", () => {
    let { s, ap, opp, ids, b, item } = boltOnStack(3, (ap) => ({ kind: "player", id: ap }));
    const oppBefore = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(oppBefore);
  });
});

describe("Sphinx's Approach", () => {
  it("draws two, then exiles itself and four more from the graveyard for a Sphinx onto the battlefield", () => {
    let { s, ap, ids } = setup([sphinx()]);
    const yard = [0, 1, 2, 3].map(() => into(s, ap, sphinx(), "graveyard"));
    const sph = into(s, ap, sphinxC(), "library");
    // Two cards on top to draw.
    into(s, ap, bears(), "library");
    into(s, ap, bears(), "library");
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    // Exactly four in the graveyard: no choice of which.
    if (s.pending?.kind === "searchLibrary" && s.pending.cards.includes(yard[0]!)) s = settle(act(s, { type: "searchLibrary", player: ap, found: yard }));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [sph] }));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(yard.every((id) => zone(s, id) === "exile")).toBe(true);
    expect(zone(s, sph)).toBe("battlefield");
  });

  it("with three others it just draws two", () => {
    let { s, ap, ids } = setup([sphinx()]);
    [0, 1, 2].forEach(() => into(s, ap, sphinx(), "graveyard"));
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Makeshift Mannequin", () => {
  it("returns the creature with a mannequin counter; targeted by a spell, it's sacrificed", () => {
    let { s, ap, opp, ids } = setup([mannequin(), bolt()]);
    const dead = into(s, ap, bears(), "graveyard");
    s = settleBots(run(s, planCast(s, ap, ids[0]!, [tgt(dead)])));
    expect(zone(s, dead)).toBe("battlefield");
    expect(s.objects[dead]!.counters.mannequin).toBe(1);
    // Grizzly Bears has no triggered ability of its own.
    expect(abilitiesOf(s, s.objects[dead]!).triggers.length).toBe(1);
    // Lightning Bolt aimed at it: the trigger resolves first and sacrifices it; the Bolt then has no legal target.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(dead)]));
    s = settleBots(s);
    expect(zone(s, dead)).toBe("graveyard");
    expect(s.log.some((l) => /sacrific/i.test(l.text) && /Grizzly Bears/.test(l.text))).toBe(true);
    void opp;
  });

  it("once it has no mannequin counter, it doesn't have the ability", () => {
    let { s, ap, ids } = setup([mannequin()]);
    const dead = into(s, ap, bears(), "graveyard");
    s = settleBots(run(s, planCast(s, ap, ids[0]!, [tgt(dead)])));
    delete s.objects[dead]!.counters.mannequin;
    invalidateCharacteristics(s);
    s = settleBots(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(abilitiesOf(s, s.objects[dead]!).triggers.length).toBe(0);
  });
});

describe("Churning Reservoir", () => {
  const goblins = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;

  it("can't be activated until an oil counter is removed from a permanent you control", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, reservoir());
    const hex = putOnBattlefield(s, ap, hexmage());
    const oiled = putOnBattlefield(s, ap, bears());
    s.objects[oiled]!.counters.oil = 1;
    invalidateCharacteristics(s);
    expect(planActivate(s, ap, r, 0)).toBeNull();
    // Vampire Hexmage: "Sacrifice ~: Remove all counters from target permanent."
    s = settleBots(run(s, planActivate(s, ap, hex, 0, [tgt(oiled)])));
    expect(s.objects[oiled]!.counters.oil ?? 0).toBe(0);
    s = settleBots(run(s, planActivate(s, ap, r, 0)));
    expect(goblins(s, ap)).toBe(1);
  });

  it("an oil counter removed from an opponent's permanent doesn't count, but an opponent's permanent with one dying does", () => {
    let { s, ap, opp, ids } = setup([bolt()]);
    const r = putOnBattlefield(s, ap, reservoir());
    const hex = putOnBattlefield(s, ap, hexmage());
    const theirs = putOnBattlefield(s, opp, bears());
    const theirs2 = putOnBattlefield(s, opp, bears());
    s.objects[theirs]!.counters.oil = 1;
    s.objects[theirs2]!.counters.oil = 1;
    invalidateCharacteristics(s);
    s = settleBots(run(s, planActivate(s, ap, hex, 0, [tgt(theirs)])));
    expect(planActivate(s, ap, r, 0)).toBeNull();
    s = settleBots(run(s, planCast(s, ap, ids[0]!, [tgt(theirs2)])));
    expect(zone(s, theirs2)).toBe("graveyard");
    s = settleBots(run(s, planActivate(s, ap, r, 0)));
    expect(goblins(s, ap)).toBe(1);
  });
});
