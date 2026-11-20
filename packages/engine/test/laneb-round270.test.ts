// Lane B round B270: Draugr Necromancer (an opponent's nontoken creature exiled with an ice counter instead of dying, and
// cast from exile with snow mana as any color, CR 614.1a, 609.4b), Spellweaver Helix (two sorcery cards imprinted from a
// single graveyard; casting a card named like one copies the other, CR 607.2a, 707.12) and Abstract Performance (a
// face-down pile and a face-up pile, an opponent binning one, a free spell from the other, CR 406.3, 608.2g).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { moveObject } from "../src/game";
import { applyAction, botActions, castProblem, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const draugrNecromancer = (): CardDef => ({"oracleId":"ccdf3399-b836-47ab-802d-af5a9c24d759","name":"Draugr Necromancer","manaCost":"{3}{B}","cmc":4,"typeLine":"Snow Creature — Zombie Cleric","supertypes":["Snow"],"types":["Creature"],"subtypes":["Zombie","Cleric"],"oracleText":"If a nontoken creature an opponent controls would die, exile that card with an ice counter on it instead.\nYou may cast spells from among cards in exile your opponents own with ice counters on them, and you may spend mana from snow sources as though it were mana of any color to cast those spells.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/76d8e0ff-e720-41ca-af69-35585a2d7ae2.jpg?1783928251","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76d8e0ff-e720-41ca-af69-35585a2d7ae2.jpg?1783928251","layout":"normal"});
const spellweaverHelix = (): CardDef => ({"oracleId":"9aa8eef1-fc67-4d54-9783-4d0175a76741","name":"Spellweaver Helix","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Imprint — When this artifact enters, you may exile two target sorcery cards from a single graveyard.\nWhenever a player casts a card, if it has the same name as one of the cards exiled with this artifact, you may copy the other. If you do, you may cast the copy without paying its mana cost.","colors":[],"colorIdentity":[],"keywords":["Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a48d44b4-1c3b-4109-aaad-8351bf8a7624.jpg?1783944502","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a48d44b4-1c3b-4109-aaad-8351bf8a7624.jpg?1783944502","layout":"normal"});
const abstractPerformance = (): CardDef => ({"oracleId":"3e0e3676-e634-4e64-bdfd-4aaa5885461f","name":"Abstract Performance","manaCost":"{5}{U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the cards in the other pile. You may cast a spell from among them without paying its mana cost. Put the rest into your hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2795c812-0850-4405-b968-b624deaccd55.jpg?1783903863","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2795c812-0850-4405-b968-b624deaccd55.jpg?1783903863","layout":"normal"});
const snowCoveredMountain = (): CardDef => ({"oracleId":"ca9f660b-e07d-4f42-a46e-abd0ca72510c","name":"Snow-Covered Mountain","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Mountain","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/5474e67c-628f-41b0-aa31-3d85a267265a.jpg?1783928164","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/5474e67c-628f-41b0-aa31-3d85a267265a.jpg?1783928164","layout":"normal"});
const snowCoveredIsland = (): CardDef => ({"oracleId":"5b2460a5-6ae5-4cad-ba94-1a9e98e6e4c0","name":"Snow-Covered Island","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Island","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","layout":"normal"});
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","layout":"normal"});
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","layout":"normal"});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"});
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","layout":"normal"});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const doomBlade = (): CardDef => ({"oracleId":"59e7f2ae-4535-4191-98be-3e65b6b2befa","name":"Doom Blade","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","layout":"normal"});
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","layout":"normal"});
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","layout":"normal"});
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in one of `pid`'s zones. */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "exile" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Answers every question with the bots' answers until none is left (at most `max`). */
const bots = (s: GameState, max = 30) => {
  for (let i = 0; i < max && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
  return s;
};
/** Takes away all of `pid`'s lands, then gives them these. */
const lands = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")));
  const ids = defs.map((d) => putOnBattlefield(s, pid, d));
  invalidateCharacteristics(s);
  return ids;
};

describe("Draugr Necromancer", () => {
  it("is supported", () => supported(draugrNecromancer(), spellweaverHelix(), abstractPerformance()));

  it("exiles an opponent's nontoken creature that would die, with an ice counter on it; yours dies as usual", () => {
    const { s: s0, ap, opp, ids } = setup([doomBlade(), doomBlade()]);
    putOnBattlefield(s0, ap, draugrNecromancer());
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    const mine = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)])));
    expect(zone(s, theirs)).toBe("exile");
    expect(s.players[opp]!.exile).toContain(theirs);
    expect(s.objects[theirs]!.counters.ice).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(mine)])));
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("casts it from exile with mana from snow sources as though it were any color, and only that mana", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, draugrNecromancer());
    const bears = putIn(s0, opp, grizzlyBears(), "exile");
    s0.objects[bears]!.counters = { ice: 1 };
    // Two Mountains: red mana can't pay {G}.
    lands(s0, ap, [mountain(), mountain()]);
    expect(planCast(s0, ap, bears)).toBeNull();
    // A snow Mountain's red mana pays {G} (CR 609.4b); the plain Mountain pays {1}.
    lands(s0, ap, [mountain(), snowCoveredMountain()]);
    const s = settle(run(s0, planCast(s0, ap, bears)));
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.controller).toBe(ap);
  });

  it("only cards an opponent owns with an ice counter, not lands, and only while you control Draugr", () => {
    const { s: s0, ap, opp } = setup([]);
    const draugr = putOnBattlefield(s0, ap, draugrNecromancer());
    const bolt = putIn(s0, opp, lightningBolt(), "exile");
    s0.objects[bolt]!.counters = { ice: 1 };
    const noIce = putIn(s0, opp, lightningBolt(), "exile");
    const own = putIn(s0, ap, lightningBolt(), "exile");
    s0.objects[own]!.counters = { ice: 1 };
    const land = putIn(s0, opp, forest(), "exile");
    s0.objects[land]!.counters = { ice: 1 };
    lands(s0, ap, [snowCoveredIsland()]);
    // Snow blue mana pays {R}; an instant keeps its usual timing (rulings).
    expect(planCast(s0, ap, bolt, [ptgt(opp)])).not.toBeNull();
    expect(planCast(s0, ap, noIce, [ptgt(opp)])).toBeNull();
    expect(planCast(s0, ap, own, [ptgt(opp)])).toBeNull();
    // Lands can't be played this way (rulings).
    expect(() => act(s0, { type: "playLand", player: ap, objectId: land })).toThrow();
    // Draugr gone: nothing.
    const s = structuredClone(s0);
    s.battlefield.splice(s.battlefield.indexOf(draugr), 1);
    s.objects[draugr]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(draugr);
    invalidateCharacteristics(s);
    expect(planCast(s, ap, bolt, [ptgt(opp)])).toBeNull();
    // Cast with it: Lightning Bolt from the opponent's exile, paid with the snow Island.
    const life = s0.players[opp]!.life;
    const t = settle(run(s0, planCast(s0, ap, bolt, [ptgt(opp)])));
    expect(t.players[opp]!.life).toBe(life - 3);
    expect(zone(t, bolt)).toBe("graveyard");
    expect(t.players[opp]!.graveyard).toContain(bolt);
  });

  it("a sorcery card cast this way keeps its timing (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, draugrNecromancer());
    const axe = putIn(s0, opp, lavaAxe(), "exile");
    s0.objects[axe]!.counters = { ice: 1 };
    lands(s0, ap, [snowCoveredIsland(), snowCoveredIsland(), snowCoveredIsland(), snowCoveredIsland(), snowCoveredIsland()]);
    expect(castProblem(s0, ap, axe, [ptgt(opp)])).toMatch(/mana/);
    expect(planCast(s0, ap, axe, [ptgt(opp)])).not.toBeNull();
    // With a spell on the stack it can't be cast (CR 307.1).
    const bolt = putIn(s0, ap, lightningBolt(), "hand");
    s0.players[ap]!.manaPool.R = 1;
    let s = run(s0, planCast(s0, ap, bolt, [ptgt(opp)]));
    expect(s.stack.length).toBe(1);
    expect(planCast(s, ap, axe, [ptgt(opp)])).toBeNull();
    s = settle(s);
    expect(planCast(s, ap, axe, [ptgt(opp)])).not.toBeNull();
  });
});

describe("Spellweaver Helix", () => {
  /** Helix cast with Lava Axe and Divination in the opponent's graveyard, both imprinted. */
  const imprinted = (hand: CardDef[] = []) => {
    const { s: s0, ap, opp, ids } = setup([spellweaverHelix(), ...hand]);
    const axe = putIn(s0, opp, lavaAxe(), "graveyard");
    const div = putIn(s0, opp, divination(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(axe), target(div)] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, axe)).toBe("exile");
    expect(zone(s, div)).toBe("exile");
    return { s, ap, opp, helix: ids[0]!, hand: ids.slice(1), axe, div };
  };

  it("casting a card named like one imprinted card lets you cast a copy of the other, free", () => {
    let { s, ap, opp, hand } = imprinted([lavaAxe()]);
    const life = s.players[opp]!.life;
    const cards = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, hand[0]!, [ptgt(opp)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    const copy = s.pending.objectId;
    expect(s.cards[s.objects[copy]!.cardId]!.name).toBe("Divination");
    s = settle(run(s, planCast(s, ap, copy)));
    // The copy resolves first (it's on top), then Lava Axe.
    expect(s.players[ap]!.hand.length).toBe(cards - 1 + 2);
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(s.objects[copy]).toBeUndefined();
  });

  it("a card with neither name doesn't trigger it, nor does a copy; declining the copy leaves nothing", () => {
    let { s, ap, opp, hand } = imprinted([lightningBolt(), divination()]);
    s = settle(run(s, planCast(s, ap, hand[0]!, [ptgt(opp)])));
    expect(s.pending).toBeNull();
    expect(logged(s, /copies/)).toBe(false);
    // Divination: Lava Axe's copy offered, declined.
    s = settle(run(s, planCast(s, ap, hand[1]!)));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    const copy = s.pending.objectId;
    expect(s.cards[s.objects[copy]!.cardId]!.name).toBe("Lava Axe");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[copy]?.zone ?? "gone").not.toBe("stack");
    expect(s.stack.length).toBe(0);
    expect(Object.values(s.objects).some((o) => o.spellCopy && o.zone === "exile")).toBe(false);
  });

  it("Helix gone while the trigger waits: the copy is still made (rulings, last known information)", () => {
    let { s, ap, opp, hand, helix } = imprinted([lavaAxe()]);
    s = run(s, planCast(s, ap, hand[0]!, [ptgt(opp)]));
    // The trigger is waiting to resolve; Helix leaves the battlefield.
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(1);
    moveObject(s, helix, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
  });

  it("two imprinted cards with the same name: one copy (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([spellweaverHelix(), lavaAxe()]);
    const a1 = putIn(s0, opp, lavaAxe(), "graveyard");
    const a2 = putIn(s0, opp, lavaAxe(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(a1), target(a2)] }));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [ptgt(opp)])));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    s = settle(run(s, planCast(s, ap, s.pending.objectId, [ptgt(opp)])));
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBe(life - 10);
  });

  it("with only one imprinted card left, nothing happens (rulings)", () => {
    let { s, ap, opp, hand, div } = imprinted([lavaAxe()]);
    // Divination leaves exile (a new object, CR 400.7).
    s.players[opp]!.exile.splice(s.players[opp]!.exile.indexOf(div), 1);
    s.objects[div]!.zone = "graveyard";
    s.objects[div]!.zoneChanges = (s.objects[div]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.graveyard.push(div);
    s = settle(run(s, planCast(s, ap, hand[0]!, [ptgt(opp)])));
    expect(s.pending).toBeNull();
    expect(logged(s, /only one card exiled with it/)).toBe(true);
  });

  it("an opponent casting the card triggers it too; a bot casts the copy", () => {
    let { s, ap, opp } = imprinted();
    const div = putIn(s, opp, divination(), "hand");
    // The opponent casts Divination on their own turn.
    s.activePlayer = opp;
    s.priority = opp;
    s.players[opp]!.manaPool.U = 3;
    const axeCast = s.players[ap]!.life;
    s = run(s, planCast(s, opp, div));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    s = bots(s, 3);
    s = settle(s);
    // Ap's bot cast the Lava Axe copy at an opponent.
    expect(logged(s, /Lava Axe/)).toBe(true);
    expect(s.players[ap]!.life).toBe(axeCast);
  });
});

describe("Abstract Performance", () => {
  /** Ap casts it with these cards on top of their library (the first four face down). */
  const perform = (top: CardDef[]) => {
    const { s: s0, ap, opp, ids } = setup([abstractPerformance()]);
    const cards = top.map((d) => putIn(s0, ap, d, "library"));
    const lib = s0.players[ap]!.library;
    s0.players[ap]!.library = [...cards, ...lib.filter((id) => !cards.includes(id))];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    return { s, ap, opp, cards, spell: ids[0]! };
  };

  it("the opponent bins the face-up pile; you look at the face-down one, cast a spell from it free and take the rest", () => {
    let { s, ap, opp, cards } = perform([lavaAxe(), hillGiant(), forest(), grizzlyBears(), divination(), mindRot(), shock(), fireball()]);
    const down = cards.slice(0, 4);
    const up = cards.slice(4);
    for (const id of down) expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    for (const id of up) expect(s.objects[id]!.hiddenExile).toBeUndefined();
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", player: opp, pileMode: "faceDownYard", piles: [down, up], of: ap });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "1" }));
    for (const id of up) expect(zone(s, id)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.options).toEqual(expect.arrayContaining([down[0], down[1], down[3], "none"]));
    // Hill Giant, free and ignoring timing (rulings).
    s = act(s, { type: "chooseOption", player: ap, choice: down[1]! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: down[1] });
    s = settle(run(s, planCast(s, ap, down[1]!)));
    expect(zone(s, down[1]!)).toBe("battlefield");
    for (const id of [down[0]!, down[2]!, down[3]!]) expect(zone(s, id)).toBe("hand");
    expect(s.players[opp]!.life).toBe(40);
  });

  it("the opponent bins the face-down pile; you may cast nothing and take all of the face-up one", () => {
    let { s, ap, opp, cards } = perform([lavaAxe(), hillGiant(), forest(), grizzlyBears(), divination(), mindRot(), shock(), fireball()]);
    const down = cards.slice(0, 4);
    const up = cards.slice(4);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }));
    for (const id of down) {
      expect(zone(s, id)).toBe("graveyard");
      expect(s.objects[id]!.hiddenExile).toBeUndefined();
    }
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    for (const id of up) expect(zone(s, id)).toBe("hand");
  });

  it("with fewer than eight cards the face-up pile is smaller (rulings); a bot opponent bins the bigger pile", () => {
    const { s: s0, ap, ids } = setup([abstractPerformance()]);
    const cards = [lavaAxe(), hillGiant(), forest(), grizzlyBears(), divination(), mindRot()].map((d) => putIn(s0, ap, d, "library"));
    s0.players[ap]!.library = cards;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = bots(s, 1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", pileMode: "faceDownYard", piles: [cards.slice(0, 4), cards.slice(4)] });
    s = bots(s, 1);
    // The face-down pile (four cards, guessed at by size) goes.
    for (const id of cards.slice(0, 4)) expect(zone(s, id)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
  });
});
