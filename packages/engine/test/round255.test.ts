// Round 255: the top of the popularity list (earlier skip lists). Chandra, Dressed to Kill (up to one target player or
// planeswalker; "if it's red, you may cast it this turn"; red spells from among the exiled cards; the emblem), Tamiyo,
// the Moon Sage (an emblem that returns each card put into your graveyard), Zariel, Archduke of Avernus (an emblem
// untapping a creature and adding a combat after the first combat), Vivien, Monsters' Advocate (a creature card with
// lesser mana value when you next cast a creature spell), Hauntwoods Shrieker (reveal a face-down permanent, turn a
// creature card face up), Whisperwood Elemental (face-up nontoken creatures gain a manifest dies trigger), Squandered
// Resources (mana of a type the sacrificed land could produce), Interdimensional Web Watch (mana only for spells cast
// from exile), Horde of Notions (play an Elemental card from your graveyard free) and Carth the Lion (loyalty abilities
// cost [+1] more).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, runStateBasedActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const pool = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);
/** Removes every land `pid` controls. */
const noLands = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")));
  invalidateCharacteristics(s);
};

// Real oracle text (Scryfall).
const chandra = (): CardDef => ({"oracleId":"4686f776-2055-470c-bd99-7c4bb32902c0","name":"Chandra, Dressed to Kill","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Add {R}. Chandra deals 1 damage to up to one target player or planeswalker.\n+1: Exile the top card of your library. If it's red, you may cast it this turn.\n−7: Exile the top five cards of your library. You may cast red spells from among them this turn. You get an emblem with \"Whenever you cast a red spell, this emblem deals X damage to any target, where X is the amount of mana spent to cast that spell.\"","loyalty":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/de32b136-898a-48ea-8570-d7e4f7bea1e1.jpg?1783924210","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/de32b136-898a-48ea-8570-d7e4f7bea1e1.jpg?1783924210","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const tamiyo = (): CardDef => ({"oracleId":"f88be051-36ae-407e-bd5a-2b029c26414e","name":"Tamiyo, the Moon Sage","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Planeswalker — Tamiyo","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tamiyo"],"oracleText":"+1: Tap target permanent. It doesn't untap during its controller's next untap step.\n−2: Draw a card for each tapped creature target player controls.\n−8: You get an emblem with \"You have no maximum hand size\" and \"Whenever a card is put into your graveyard from anywhere, you may return it to your hand.\"","loyalty":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/2/5284b87f-d249-43c2-a198-dd03e961bedb.jpg?1783924017","artUrl":"https://cards.scryfall.io/art_crop/front/5/2/5284b87f-d249-43c2-a198-dd03e961bedb.jpg?1783924017","commanderLegal":"legal","set":"sld","releasedAt":"2022-02-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const zariel = (): CardDef => ({"oracleId":"04ddb495-e9b0-47bf-b892-c7ae7b87c10c","name":"Zariel, Archduke of Avernus","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Zariel","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Zariel"],"oracleText":"+1: Creatures you control get +1/+0 and gain haste until end of turn.\n0: Create a 1/1 red Devil creature token with \"When this token dies, it deals 1 damage to any target.\"\n−6: You get an emblem with \"At the end of the first combat phase on your turn, untap target creature you control. After this phase, there is an additional combat phase.\"","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7be5b866-d479-4698-98b2-87a973f6b8f6.jpg?1783926467","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7be5b866-d479-4698-98b2-87a973f6b8f6.jpg?1783926467","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const vivien = (): CardDef => ({"oracleId":"7256b03e-4fd5-4a0a-9b20-7b88870edfec","name":"Vivien, Monsters' Advocate","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Legendary Planeswalker — Vivien","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Vivien"],"oracleText":"You may look at the top card of your library any time.\nYou may cast creature spells from the top of your library.\n+1: Create a 3/3 green Beast creature token. Put your choice of a reach counter, a vigilance counter, or a trample counter on it.\n−2: When you next cast a creature spell this turn, search your library for a creature card with lesser mana value, put it onto the battlefield, then shuffle.","loyalty":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/504ebb84-7e7b-4119-a128-a9c183c5d9de.jpg?1783931029","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/504ebb84-7e7b-4119-a128-a9c183c5d9de.jpg?1783931029","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const shrieker = (): CardDef => ({"oracleId":"09c275bd-8323-485e-81f6-aff1f99d0d03","name":"Hauntwoods Shrieker","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Beast Mutant","supertypes":[],"types":["Creature"],"subtypes":["Beast","Mutant"],"oracleText":"Whenever this creature attacks, manifest dread. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)\n{1}{G}: Reveal target face-down permanent. If it's a creature card, you may turn it face up.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Manifest","Manifest dread"],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/744ef0bc-9973-450e-a0c4-056d8244f357.jpg?1783909453","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/744ef0bc-9973-450e-a0c4-056d8244f357.jpg?1783909453","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const whisperwood = (): CardDef => ({"oracleId":"8ec7c7ce-23a5-4ba7-8cfd-4caf8601a9c8","name":"Whisperwood Elemental","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"At the beginning of your end step, manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nSacrifice this creature: Until end of turn, face-up nontoken creatures you control gain \"When this creature dies, manifest the top card of your library.\"","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/66c61828-98b9-4264-b3dd-e83f881f4a67.jpg?1783938675","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/66c61828-98b9-4264-b3dd-e83f881f4a67.jpg?1783938675","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const squandered = (): CardDef => ({"oracleId":"620d0572-6d22-43e2-83a9-000e605c8a2b","name":"Squandered Resources","manaCost":"{B}{G}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Sacrifice a land: Add one mana of any type the sacrificed land could produce.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fcddbea7-3025-47b1-a597-2d2b2711fb81.jpg?1783946976","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fcddbea7-3025-47b1-a597-2d2b2711fb81.jpg?1783946976","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const webWatch = (): CardDef => ({"oracleId":"456dbec4-1b0e-48c4-abae-5c8205651872","name":"Interdimensional Web Watch","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, exile the top two cards of your library. Until the end of your next turn, you may play those cards.\n{T}: Add two mana in any combination of colors. Spend this mana only to cast spells from exile.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/87a8e112-e72f-413f-88a3-e7ce72c2ec53.jpg?1783905305","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/87a8e112-e72f-413f-88a3-e7ce72c2ec53.jpg?1783905305","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const horde = (): CardDef => ({"oracleId":"a7656948-4d7d-47f7-b8a1-fc9716155e37","name":"Horde of Notions","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Elemental","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Vigilance, trample, haste\n{W}{U}{B}{R}{G}: You may play target Elemental card from your graveyard without paying its mana cost.","power":"5","toughness":"5","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Vigilance","Haste","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/80b9ea46-ae9b-4729-b206-0ba3ddc7660d.jpg?1783942856","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/80b9ea46-ae9b-4729-b206-0ba3ddc7660d.jpg?1783942856","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const carth = (): CardDef => ({"oracleId":"e0709843-0a91-4a21-9512-d7481707f3c9","name":"Carth the Lion","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Whenever Carth enters or a planeswalker you control dies, look at the top seven cards of your library. You may reveal a planeswalker card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nPlaneswalkers' loyalty abilities you activate cost an additional [+1] to activate.","power":"3","toughness":"5","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e09e9b65-ff0e-4efe-b96a-ede69c96e2ea.jpg?1783926819","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e09e9b65-ff0e-4efe-b96a-ede69c96e2ea.jpg?1783926819","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const redBolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const blueStudy = card("Test Study", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Draw two cards." });
const redOgre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });
const bigBeast = card("Test Beast", "Creature — Beast", "{3}{G}", { cmc: 4, power: "4", toughness: "4" });
const smallElf = card("Test Elf", "Creature — Elf", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const hugeWurm = card("Test Wurm", "Creature — Wurm", "{5}{G}", { cmc: 6, power: "6", toughness: "6" });
const elemental = card("Test Elemental", "Creature — Elemental", "{4}{R}{R}", { cmc: 6, power: "6", toughness: "6" });
const plainBarren = card("Test Barrens", "Land", "", { oracleText: "" });
const dualLand = card("Test Dual", "Land", "", { oracleText: "{T}: Add {W} or {U}." });
const testWalker = card("Test Walker", "Legendary Planeswalker — Testwalker", "{2}{W}", { cmc: 3, loyalty: "3", oracleText: "+1: You gain 1 life.\n0: You gain 2 life.\n−2: You gain 3 life." });

describe("round 255", () => {
  it("every card of the round compiles fully", () => {
    supported(chandra(), tamiyo(), zariel(), vivien(), shrieker(), whisperwood(), squandered(), webWatch(), horde(), carth());
  });
});

describe("Chandra, Dressed to Kill", () => {
  it("+1: adds {R} and deals 1 damage to up to one target player or planeswalker (none too); it uses the stack", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 3;
    let s = run(s0, planActivate(s0, ap, c, 0, [{ kind: "player", id: opp }]));
    expect(s.stack.length).toBe(1);
    s = settle(s);
    expect([s.players[opp]!.life, s.players[ap]!.manaPool.R, s.objects[c]!.counters.loyalty]).toEqual([39, 1, 4]);
    const { s: t0, ap: bp, opp: bo } = setup([]);
    const c2 = putOnBattlefield(t0, bp, chandra());
    t0.objects[c2]!.counters.loyalty = 3;
    const t = settle(run(t0, planActivate(t0, bp, c2, 0, [{ kind: "none" }])));
    expect([t.players[bo]!.life, t.players[bp]!.manaPool.R]).toEqual([40, 1]);
  });

  it("+1: the exiled top card may be cast this turn only if it's red (either face of a red card, rulings)", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 3;
    const bolt = into(s0, ap, redBolt, "library");
    let s = settle(run(s0, planActivate(s0, ap, c, 1)));
    expect(zone(s, bolt)).toBe("exile");
    expect(planCast(s, ap, bolt, [{ kind: "player", id: s.turnOrder.find((p) => p !== ap)! }])).not.toBeNull();
    const { s: t0, ap: bp } = setup([]);
    const c2 = putOnBattlefield(t0, bp, chandra());
    t0.objects[c2]!.counters.loyalty = 3;
    const study = into(t0, bp, blueStudy, "library");
    s = settle(run(t0, planActivate(t0, bp, c2, 1)));
    expect(zone(s, study)).toBe("exile");
    expect(planCast(s, bp, study)).toBeNull();
    expect(castProblem(s, bp, study)).not.toMatch(/mana/);
  });

  it("−7: red spells from among the five exiled cards this turn; the emblem deals the mana spent on a red spell", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 7;
    const ogre = into(s0, ap, redOgre, "library");
    const study = into(s0, ap, blueStudy, "library");
    let s = settle(run(s0, planActivate(s0, ap, c, 2)));
    expect([zone(s, ogre), zone(s, study), zone(s, c)]).toEqual(["exile", "exile", "graveyard"]);
    expect(planCast(s, ap, study)).toBeNull();
    expect(castProblem(s, ap, study)).not.toMatch(/mana/);
    // Casting the red Ogre ({2}{R}) triggers the emblem: 3 damage to the opponent.
    s = run(s, planCast(s, ap, ogre));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(zone(s, ogre)).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(37);
  });
});

describe("Tamiyo, the Moon Sage: −8", () => {
  it("the emblem returns a card put into your graveyard from anywhere, if you want; not an opponent's", () => {
    const { s: s0, ap, opp, ids } = setup([blueStudy]);
    const t = putOnBattlefield(s0, ap, tamiyo());
    s0.objects[t]!.counters.loyalty = 8;
    let s = settle(run(s0, planActivate(s0, ap, t, 2)));
    // Tamiyo went to the graveyard before the emblem was made (rulings): she isn't returned.
    expect(zone(s, t)).toBe("graveyard");
    expect(s.emblems?.length).toBe(1);
    // A sorcery resolves and goes to your graveyard: the emblem asks; yes returns it to your hand.
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, ids[0]!)).toBe("hand");
    // An opponent's card put into their own graveyard doesn't trigger it.
    const theirs = putOnBattlefield(s, opp, smallElf);
    s.objects[theirs]!.damage = 5;
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.pending).toBeFalsy();
  });

  it("each card is its own trigger; saying no leaves it in the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tamiyo());
    s0.objects[t]!.counters.loyalty = 8;
    let s = settle(run(s0, planActivate(s0, ap, t, 2)));
    const a = putOnBattlefield(s, ap, smallElf);
    const b = putOnBattlefield(s, ap, bigBeast);
    s.objects[a]!.damage = 5;
    s.objects[b]!.damage = 5;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    let asked = 0;
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") {
        asked++;
        s = act(s, { type: "chooseMay", player: ap, yes: asked === 1 });
      } else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toBe(2);
    expect([zone(s, a), zone(s, b)].sort()).toEqual(["graveyard", "hand"]);
  });
});

describe("Zariel, Archduke of Avernus: −6", () => {
  it("at the end of the first combat on your turn, untap target creature you control; one more combat phase, and only once", () => {
    const { s: s0, ap, opp } = setup([]);
    const z = putOnBattlefield(s0, ap, zariel());
    s0.objects[z]!.counters.loyalty = 6;
    const beast = putOnBattlefield(s0, ap, bigBeast);
    let s = settle(run(s0, planActivate(s0, ap, z, 2)));
    expect(s.emblems?.length).toBe(1);
    s = passUntil(s, "declareAttackers");
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: beast, defender: opp }] }));
    s = passUntil(s, "endCombat");
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(beast)] }));
    expect(s.objects[beast]!.tapped).toBe(false);
    expect(s.players[opp]!.life).toBe(36);
    // The additional combat: it attacks again; no trigger at the end of that one.
    s = passUntil(s, "declareAttackers");
    expect(s.combatsThisTurn).toBe(2);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: beast, defender: opp }] }));
    s = passUntil(s, "endCombat");
    s = settle(s);
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(s.players[opp]!.life).toBe(32);
    s = passUntil(s, "main2");
    expect(s.objects[beast]!.tapped).toBe(true);
  });
});

describe("Vivien, Monsters' Advocate: −2", () => {
  it("when you next cast a creature spell this turn, a creature card with lesser mana value onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([bigBeast]);
    const v = putOnBattlefield(s0, ap, vivien());
    s0.objects[v]!.counters.loyalty = 3;
    const elf = into(s0, ap, smallElf, "library");
    const wurm = into(s0, ap, hugeWurm, "library");
    let s = settle(run(s0, planActivate(s0, ap, v, 1)));
    expect(s.objects[v]!.counters.loyalty).toBe(1);
    // The Beast (mana value 4): the trigger resolves before the spell, finding a creature card with mana value 3 or less.
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const offered = (s.pending as { cards: string[] }).cards;
    expect(offered).toContain(elf);
    expect(offered).not.toContain(wurm);
    expect(zone(s, ids[0]!)).toBe("stack");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [elf] }));
    expect([zone(s, elf), zone(s, ids[0]!), zone(s, wurm)]).toEqual(["battlefield", "battlefield", "library"]);
  });
});

describe("Hauntwoods Shrieker", () => {
  it("reveals a face-down permanent; a creature card may be turned face up, any player's", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, shrieker());
    const hidden = putOnBattlefield(s0, opp, bigBeast);
    s0.objects[hidden]!.faceDown = "manifest";
    invalidateCharacteristics(s0);
    expect(pt(s0, hidden)).toBe("2/2");
    let s = run(s0, planActivate(s0, ap, h, 0, [tgt(hidden)]));
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.log.some((l) => /reveals a face-down permanent: it's Test Beast/.test(l.text) && l.to === undefined)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[hidden]!.faceDown).toBeFalsy();
    expect(pt(s, hidden)).toBe("4/4");
    expect(controllerOf(s, s.objects[hidden]!)).toBe(opp);
  });

  it("a noncreature card is only revealed: nothing is asked and it stays face down (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, shrieker());
    const hidden = putOnBattlefield(s0, ap, plainBarren);
    s0.objects[hidden]!.faceDown = "manifest";
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, h, 0, [tgt(hidden)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[hidden]!.faceDown).toBe("manifest");
    expect(s.log.some((l) => /it's Test Barrens/.test(l.text))).toBe(true);
    expect(abilityProblem(s0, ap, h, 0, [tgt(h)])).not.toBeNull();
  });
});

describe("Whisperwood Elemental", () => {
  it("sacrifice it: face-up nontoken creatures you control gain a dies trigger that manifests, until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, whisperwood());
    const elf = putOnBattlefield(s0, ap, smallElf);
    const hidden = putOnBattlefield(s0, ap, bigBeast);
    s0.objects[hidden]!.faceDown = "manifest";
    invalidateCharacteristics(s0);
    const top = into(s0, ap, hugeWurm, "library");
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect(zone(s, w)).toBe("graveyard");
    // The face-down one didn't get it (rulings: only the face-up ones as it resolved).
    s.objects[hidden]!.faceDown = undefined;
    invalidateCharacteristics(s);
    s.objects[hidden]!.damage = 5;
    s.objects[elf]!.damage = 5;
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect([zone(s, elf), zone(s, hidden)]).toEqual(["graveyard", "graveyard"]);
    // One manifest: the Elf's.
    expect(zone(s, top)).toBe("battlefield");
    expect(s.objects[top]!.faceDown).toBe("manifest");
    expect(s.battlefield.filter((id) => s.objects[id]!.faceDown).length).toBe(1);
  });
});

describe("Squandered Resources", () => {
  const sac = (s: GameState, sq: ObjectId, land: ObjectId): GameState => act(s, { type: "activateAbility", player: s.objects[sq]!.controller, objectId: sq, index: 0, costs: { sacrifice: [land] } });
  it("a mana ability: one mana of a type the sacrificed land could produce, chosen when it could make more than one", () => {
    const { s: s0, ap } = setup([]);
    noLands(s0, ap);
    const sq = putOnBattlefield(s0, ap, squandered());
    const forest = putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    const dual = putOnBattlefield(s0, ap, dualLand);
    const barren = putOnBattlefield(s0, ap, plainBarren);
    let s = sac(s0, sq, forest);
    expect(s.stack).toHaveLength(0);
    expect([zone(s, forest), s.players[ap]!.manaPool.G]).toEqual(["graveyard", 1]);
    s = sac(s, sq, dual);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Add {W}", "Add {U}"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.pending).toBeFalsy();
    // A land that can't produce mana can be sacrificed, for no mana (rulings).
    s = sac(s, sq, barren);
    expect([zone(s, barren), pool(s, ap), s.pending ?? null]).toEqual(["graveyard", 2, null]);
  });
});

describe("Interdimensional Web Watch", () => {
  it("exiles the top two cards to play until your next turn ends; its mana pays only for spells cast from exile", () => {
    const { s: s0, ap, ids } = setup([webWatch(), smallElf]);
    const study = into(s0, ap, blueStudy, "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, study)).toBe("exile");
    noLands(s, ap);
    // No lands: the Elf in hand can't be cast with the Web Watch's mana; the exiled sorcery can.
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    const plan = planCast(s, ap, study);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    expect(zone(s, study)).toBe("graveyard");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });
});

describe("Horde of Notions", () => {
  it("{W}{U}{B}{R}{G}: cast target Elemental card from your graveyard free as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, horde());
    const e = into(s0, ap, elemental, "graveyard");
    const elf = into(s0, ap, smallElf, "graveyard");
    s0.players[ap]!.manaPool = { W: 1, U: 1, B: 1, R: 1, G: 1, C: 0 };
    expect(abilityProblem(s0, ap, h, 0, [tgt(elf)])).not.toBeNull();
    let s = run(s0, planActivate(s0, ap, h, 0, [tgt(e)]));
    for (let i = 0; i < 20 && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: e });
    s = settle(run(s, planCast(s, ap, e)));
    expect(zone(s, e)).toBe("battlefield");
  });
});

describe("Carth the Lion", () => {
  it("your planeswalkers' loyalty abilities cost [+1] more: +1 puts two on, 0 puts one on, −2 removes one (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, carth());
    const w = putOnBattlefield(s0, ap, testWalker);
    s0.objects[w]!.counters.loyalty = 3;
    let s = settle(run(s0, planActivate(s0, ap, w, 2)));
    expect(s.objects[w]!.counters.loyalty).toBe(2);
    s.objects[w]!.activatedThisTurn = [];
    s = settle(run(s, planActivate(s, ap, w, 1)));
    expect(s.objects[w]!.counters.loyalty).toBe(3);
    s.objects[w]!.activatedThisTurn = [];
    s = settle(run(s, planActivate(s, ap, w, 0)));
    expect(s.objects[w]!.counters.loyalty).toBe(5);
    // An opponent's planeswalker isn't affected.
    const { s: t0, ap: bp, opp } = setup([]);
    putOnBattlefield(t0, opp, carth());
    const w2 = putOnBattlefield(t0, bp, testWalker);
    t0.objects[w2]!.counters.loyalty = 3;
    const t = settle(run(t0, planActivate(t0, bp, w2, 2)));
    expect(t.objects[w2]!.counters.loyalty).toBe(1);
  });

  it("with only one loyalty, a −2 ability can be activated ([-1] with Carth); without Carth it can't", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, carth());
    const w = putOnBattlefield(s0, ap, testWalker);
    s0.objects[w]!.counters.loyalty = 1;
    expect(abilityProblem(s0, ap, w, 2)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, w, 2)));
    expect([zone(s, w), s.players[ap]!.life]).toEqual(["graveyard", 43]);
    s0.battlefield.splice(s0.battlefield.indexOf(c), 1);
    invalidateCharacteristics(s0);
    expect(abilityProblem(s0, ap, w, 2)).not.toBeNull();
  });

  it("when it enters or a planeswalker you control dies: look at seven, a planeswalker card to hand", () => {
    const { s: s0, ap, ids } = setup([carth()]);
    const top = into(s0, ap, testWalker, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }));
    expect(zone(s, top)).toBe("hand");
    // A planeswalker of yours dying triggers it again.
    const next = into(s, ap, testWalker, "library");
    const w = putOnBattlefield(s, ap, testWalker);
    s.objects[w]!.counters.loyalty = 0;
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    for (let i = 0; i < 30 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, w)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [next] }));
    expect(zone(s, next)).toBe("hand");
  });
});
