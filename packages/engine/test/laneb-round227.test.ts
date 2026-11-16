// Lane B round B227: Anafenza, the Foremost (an opponent's creature cards are exiled instead of going to the graveyard,
// by what they are in the zone they leave), Intermediate Chirography (level 3: "if a modified creature died under your
// control this turn", CR 700.9), Cherished Hatchling (Dinosaur spells with flash this turn, each with a fight trigger),
// Fishing Pole (a granted ability whose cost taps the Equipment) and Aeon Engine (reverse the game's turn order).

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, cast, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, moveObject, nearestOpponent, planActivate, planCast, seatOrder, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const anafenza = (): CardDef => ({"oracleId":"ebfafabc-5255-4024-be59-7403bdb16ee4","name":"Anafenza, the Foremost","manaCost":"{W}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Whenever Anafenza attacks, put a +1/+1 counter on another target tapped creature you control.\nIf a nontoken creature an opponent owns would die or a creature card not on the battlefield would be put into an opponent's graveyard, exile that card instead.","power":"4","toughness":"4","colors":["B","G","W"],"colorIdentity":["B","G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c8b432a7-53da-4480-b571-e6feb1364a3a.jpg?1783939061","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c8b432a7-53da-4480-b571-e6feb1364a3a.jpg?1783939061","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const chirography = (): CardDef => ({"oracleId":"6c948f71-5c86-450c-8828-df4d8deaf1dd","name":"Intermediate Chirography","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment — Class","supertypes":[],"types":["Enchantment"],"subtypes":["Class"],"oracleText":"(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, create a 2/1 white and black Inkling creature token with flying.\n{1}{B}: Level 2\nWhenever you lose life for the first time each turn, put a +1/+1 counter on target creature you control.\n{2}{B}: Level 3\nAt the beginning of each end step, if a modified creature died under your control this turn, create a 2/1 white and black Inkling creature token with flying. (Equipment, Auras you control, and counters are modifications.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d60c64aa-57a9-4082-82f4-af0d89c1a52d.jpg?1783903857","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d60c64aa-57a9-4082-82f4-af0d89c1a52d.jpg?1783903857","commanderLegal":"legal","set":"soc","releasedAt":"2026-04-24","rarity":"rare","layout":"class","gameChanger":false}) as CardDef;
const hatchling = (): CardDef => ({"oracleId":"bd7111bc-9b8f-4c4b-b61c-7841a857ce6b","name":"Cherished Hatchling","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"When this creature dies, you may cast Dinosaur spells this turn as though they had flash, and whenever you cast a Dinosaur spell this turn, it gains \"When this creature enters, you may have it fight another target creature.\"","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0a14fe6c-b272-415b-974d-c60d016ab786.jpg?1783935290","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0a14fe6c-b272-415b-974d-c60d016ab786.jpg?1783935290","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fishingPole = (): CardDef => ({"oracleId":"2c1d3e9e-213e-492a-ad5a-91139d70bc0f","name":"Fishing Pole","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{1}, {T}, Tap Fishing Pole: Put a bait counter on Fishing Pole.\"\nWhenever equipped creature becomes untapped, remove a bait counter from this Equipment. If you do, create a 1/1 blue Fish creature token.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c95ab836-3277-4223-9aaa-ef2c77256b65.jpg?1783909089","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c95ab836-3277-4223-9aaa-ef2c77256b65.jpg?1783909089","commanderLegal":"legal","set":"fdn","releasedAt":"2024-11-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const aeon = (): CardDef => ({"oracleId":"af471455-6b9f-4c14-bb90-a74a44ecd247","name":"Aeon Engine","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters tapped.\n{T}, Exile this artifact: Reverse the game's turn order. (For example, if play had proceeded clockwise around the table, it now goes counterclockwise.)","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ea4dfdd7-f35a-45d6-9fc7-2c096f92dd5f.jpg?1783932794","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ea4dfdd7-f35a-45d6-9fc7-2c096f92dd5f.jpg?1783932794","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const raptors = (): CardDef => ({"oracleId":"2a86b70b-34ca-45df-8aa1-c3fb2da72dc3","name":"Ranging Raptors","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Enrage — Whenever this creature is dealt damage, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Enrage"],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9e91efc6-0e6a-4a9e-a486-adf53e53d3f1.jpg?1783935720","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9e91efc6-0e6a-4a9e-a486-adf53e53d3f1.jpg?1783935720","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const brontodon = (): CardDef => ({"oracleId":"60bc63dc-ac9f-4a2f-aef5-c90d0aa31553","name":"Thrashing Brontodon","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"{1}, Sacrifice this creature: Destroy target artifact or enchantment.","power":"3","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d52ef7c1-dacb-4204-b64e-5fa3ae3b1ace.jpg?1783913737","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d52ef7c1-dacb-4204-b64e-5fa3ae3b1ace.jpg?1783913737","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Resolves the stack and answers any question the way a bot would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const toLibrary = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && defOf(s, s.objects[id]!).name === name);
const forestOf = (): CardDef => ({ ...bear(), oracleId: "b227-forest", name: "Test Forest", manaCost: "", cmc: 0, typeLine: "Land — Forest", types: ["Land"], subtypes: ["Forest"], oracleText: "", power: undefined, toughness: undefined, colors: [] }) as CardDef;

describe("Lane B round B227", () => {
  it("compiles all five cards", () => {
    supported(anafenza(), chirography(), hatchling(), fishingPole(), aeon());
  });

  describe("Anafenza, the Foremost", () => {
    it("an opponent's nontoken creature that would die is exiled instead, so it doesn't die; yours still dies", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, anafenza());
      const theirs = putOnBattlefield(s, opp, bear());
      const mine = putOnBattlefield(s, ap, bear());
      destroyPermanent(s, s.objects[theirs]!, "test");
      destroyPermanent(s, s.objects[mine]!, "test");
      expect(s.objects[theirs]!.zone).toBe("exile");
      expect(s.players[opp]!.exile).toContain(theirs);
      expect(s.objects[mine]!.zone).toBe("graveyard");
      // Only the one that reached the graveyard died (rulings: dies triggers don't see the exiled one).
      expect(s.diedThisTurn).toEqual([ap]);
    });

    it("an opponent's creature token isn't a card: it goes to the graveyard and dies (rulings)", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, anafenza());
      const tok = putOnBattlefield(s, opp, bear());
      s.objects[tok]!.isToken = true;
      destroyPermanent(s, s.objects[tok]!, "test");
      expect(s.diedThisTurn).toEqual([opp]);
      expect(s.players[opp]!.exile).not.toContain(tok);
    });

    it("an opponent's creature card leaving their hand or library for the graveyard is exiled; a land card isn't", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, anafenza());
      const inHand = toHand(s, opp, bear());
      const milled = toLibrary(s, opp, bear());
      const land = toLibrary(s, opp, forestOf());
      const mineInHand = toHand(s, ap, bear());
      moveObject(s, inHand, "graveyard");
      moveObject(s, milled, "graveyard");
      moveObject(s, land, "graveyard");
      moveObject(s, mineInHand, "graveyard");
      expect(s.objects[inHand]!.zone).toBe("exile");
      expect(s.objects[milled]!.zone).toBe("exile");
      expect(s.objects[land]!.zone).toBe("graveyard");
      expect(s.objects[mineInHand]!.zone).toBe("graveyard");
    });

    it("what it is in the zone it leaves counts (rulings): an animated land dies and is exiled; an opponent's creature turned into a noncreature isn't", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, anafenza());
      const land = putOnBattlefield(s, opp, forestOf());
      addEffect(s, opp, [land], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: 3, toughness: 3 }]);
      const statue = putOnBattlefield(s, opp, bear());
      addEffect(s, opp, [statue], [{ kind: "loseTypes", types: ["Creature"] }]);
      destroyPermanent(s, s.objects[land]!, "test");
      destroyPermanent(s, s.objects[statue]!, "test");
      expect(s.objects[land]!.zone).toBe("exile");
      expect(s.objects[statue]!.zone).toBe("graveyard");
    });

    it("an opponent's creature spell that's countered is exiled; Murder they cast goes to their graveyard", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, anafenza());
      const victim = putOnBattlefield(s0, ap, bear());
      let s = passUntil(s0, "main1", opp);
      const kill = toHand(s, opp, murder());
      for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, { ...forestOf(), oracleId: `b227-swamp-${i}`, name: `Test Swamp ${i}`, typeLine: "Basic Land — Swamp", subtypes: ["Swamp"], supertypes: ["Basic"] } as CardDef);
      const plan = planCast(s, opp, kill, [target(victim)]);
      expect(plan).not.toBeNull();
      for (const a of plan!) s = act(s, a);
      s = settle(s);
      expect(s.objects[victim]!.zone).toBe("graveyard"); // Anafenza's controller's own creature
      expect(s.objects[kill]!.zone).toBe("graveyard"); // not a creature card
      // A creature spell of theirs leaving the stack for the graveyard (countered) is a creature card not on the battlefield.
      const spell = toHand(s, opp, bear());
      s.objects[spell]!.zone = "stack";
      s.players[opp]!.hand = s.players[opp]!.hand.filter((x) => x !== spell);
      s.stack.push({ id: `si${s.nextId++}`, kind: "spell", objectId: spell, controller: opp, targets: [] } as unknown as GameState["stack"][number]);
      moveObject(s, spell, "graveyard");
      expect(s.objects[spell]!.zone).toBe("exile");
    });

    it("whenever it attacks, another target tapped creature you control gets a +1/+1 counter", () => {
      const { s: s0, ap, opp } = setup([]);
      const a = putOnBattlefield(s0, ap, anafenza());
      const other = putOnBattlefield(s0, ap, bear());
      s0.objects[other]!.tapped = true;
      let s = passUntil(s0, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
      s = settle(s);
      expect(s.objects[other]!.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Intermediate Chirography", () => {
    /** Chirography cast and raised to level 3, in `ap`'s first main phase. */
    const level3 = () => {
      const { s: s0, ap, ids, opp } = setup([chirography()]);
      for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
      let s = settle(cast(s0, ap, ids[0]!));
      s = settle(activate(s, ap, ids[0]!, 0));
      expect(s.objects[ids[0]!]!.classLevel).toBe(2);
      s = settle(activate(s, ap, ids[0]!, 1));
      expect(s.objects[ids[0]!]!.classLevel).toBe(3);
      return { s, ap, opp, cls: ids[0]! };
    };

    it("enters with an Inkling; at level 3, an end step after a modified creature (a counter on it) died under your control makes another", () => {
      const { s: s0, ap } = level3();
      expect(tokens(s0, ap, "Inkling Token")).toHaveLength(1);
      const b = putOnBattlefield(s0, ap, bear());
      s0.objects[b]!.counters["+1/+1"] = 1;
      destroyPermanent(s0, s0.objects[b]!, "test");
      let s = passUntil(s0, "end", ap);
      s = settle(s);
      expect(tokens(s, ap, "Inkling Token")).toHaveLength(2);
    });

    it("no modified creature died: nothing, even when an unmodified one did", () => {
      const { s: s0, ap } = level3();
      const b = putOnBattlefield(s0, ap, bear());
      destroyPermanent(s0, s0.objects[b]!, "test");
      let s = passUntil(s0, "end", ap);
      s = settle(s);
      expect(tokens(s, ap, "Inkling Token")).toHaveLength(1);
    });

    it("equipped counts whoever controls the Equipment; an opponent's Aura doesn't make it modified (rulings, CR 700.9)", () => {
      const { s: s0, ap, opp } = level3();
      const auraed = putOnBattlefield(s0, ap, bear());
      const aura = putOnBattlefield(s0, opp, pacifism());
      s0.objects[aura]!.attachedTo = auraed;
      destroyPermanent(s0, s0.objects[auraed]!, "test");
      let s = settle(passUntil(s0, "end", ap));
      expect(tokens(s, ap, "Inkling Token")).toHaveLength(1);
      // The next turn's end step, an opponent's: a creature of ours equipped with their Bonesplitter dies.
      s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
      const equipped = putOnBattlefield(s, ap, bear());
      const sword = putOnBattlefield(s, opp, bonesplitter());
      s.objects[sword]!.attachedTo = equipped;
      destroyPermanent(s, s.objects[equipped]!, "test");
      s = settle(passUntil(s, "end"));
      expect(tokens(s, ap, "Inkling Token")).toHaveLength(2);
    });

    it("a creature that died under an opponent's control doesn't count for you", () => {
      const { s: s0, ap, opp } = level3();
      const b = putOnBattlefield(s0, opp, bear());
      s0.objects[b]!.counters["+1/+1"] = 2;
      destroyPermanent(s0, s0.objects[b]!, "test");
      const s = settle(passUntil(s0, "end", ap));
      expect(tokens(s, ap, "Inkling Token")).toHaveLength(1);
    });
  });

  describe("Cherished Hatchling", () => {
    it("after it dies you may cast Dinosaur spells as though they had flash this turn, and each one fights as it enters if you like", () => {
      const { s: s0, ap, ids, opp } = setup([raptors(), raptors(), bear()]);
      const h = putOnBattlefield(s0, ap, hatchling());
      const theirs = putOnBattlefield(s0, opp, bear());
      let s = passUntil(s0, "beginCombat", ap);
      expect(planCast(s, ap, ids[0]!)).toBeNull(); // no flash yet
      destroyPermanent(s, s.objects[h]!, "test");
      s = settle(s);
      expect(s.objects[h]!.zone).toBe("graveyard");
      // Dinosaurs only (rulings): Grizzly Bears still waits for a main phase.
      expect(planCast(s, ap, ids[2]!)).toBeNull();
      const plan = planCast(s, ap, ids[0]!);
      expect(plan).not.toBeNull();
      for (const a of plan!) s = act(s, a);
      s = settle(s);
      // It entered with the granted trigger and fought the only other creature: 2 damage each way.
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      expect(abilitiesOf(s, s.objects[ids[0]!]!).triggers.some((t) => t.event === "selfEnters")).toBe(true);
      expect(s.objects[theirs]!.zone).toBe("graveyard");
      expect(s.objects[ids[0]!]!.damage).toBe(2);
      // Next turn of ours: no flash, and a Dinosaur cast then has no fight trigger.
      const turn = s.turn;
      s = passUntil(s, "end", ap);
      s = passUntil(s, "beginCombat", ap);
      expect(s.turn).toBe(turn + 4);
      expect(planCast(s, ap, ids[1]!)).toBeNull();
      s = passUntil(s, "main2", ap);
      const plan2 = planCast(s, ap, ids[1]!);
      expect(plan2).not.toBeNull();
      for (const a of plan2!) s = act(s, a);
      s = settle(s);
      expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
      expect(abilitiesOf(s, s.objects[ids[1]!]!).triggers.some((t) => t.event === "selfEnters")).toBe(false);
    });
  });

  describe("Fishing Pole", () => {
    it('equipped creature has "{1}, {T}, Tap Fishing Pole: put a bait counter on it"; when the creature untaps, a bait counter becomes a Fish', () => {
      const { s: s0, ap } = setup([]);
      const b = putOnBattlefield(s0, ap, bear());
      const pole = putOnBattlefield(s0, ap, fishingPole());
      s0.objects[pole]!.attachedTo = b;
      let s = s0;
      const plan = planActivate(s, ap, b, 0);
      expect(plan).not.toBeNull();
      for (const a of plan!) s = act(s, a);
      s = settle(s);
      expect(s.objects[pole]!.counters.bait).toBe(1);
      expect(s.objects[pole]!.tapped).toBe(true);
      expect(s.objects[b]!.tapped).toBe(true);
      // The Pole is tapped, so not again, even with the creature untapped.
      s.objects[b]!.tapped = false;
      expect(abilityProblem(s, ap, b, 0)).toMatch(/Fishing Pole is tapped/);
      s.objects[b]!.tapped = true;
      // Our next untap step: the creature untaps, the counter comes off, and a 1/1 blue Fish appears.
      s = settle(passUntil(s, "upkeep", ap));
      s = settle(passUntil(s, "upkeep", ap));
      expect(s.objects[pole]!.counters.bait ?? 0).toBe(0);
      expect(tokens(s, ap, "Fish Token")).toHaveLength(1);
      // Without a bait counter, untapping makes nothing.
      s.objects[b]!.tapped = true;
      s = settle(passUntil(s, "upkeep", ap));
      s = settle(passUntil(s, "upkeep", ap));
      expect(tokens(s, ap, "Fish Token")).toHaveLength(1);
    });

    it("the ability belongs to the creature it's attached to, not the Pole", () => {
      const { s, ap } = setup([]);
      const b = putOnBattlefield(s, ap, bear());
      const pole = putOnBattlefield(s, ap, fishingPole());
      expect(abilitiesOf(s, s.objects[b]!).activated).toHaveLength(0);
      s.objects[pole]!.attachedTo = b;
      invalidateCharacteristics(s);
      expect(abilitiesOf(s, s.objects[b]!).activated).toHaveLength(1);
    });
  });

  describe("Aeon Engine", () => {
    const prevOf = (s: GameState, pid: PlayerId) => seatOrder(s)[(seatOrder(s).indexOf(pid) + 3) % 4]!;
    const nextOf = (s: GameState, pid: PlayerId) => seatOrder(s)[(seatOrder(s).indexOf(pid) + 1) % 4]!;

    it("enters tapped; {T}, exile it: the turn order is reversed, so the player to our right goes next; seats stay", () => {
      const { s: s0, ap, ids } = setup([aeon()]);
      let s = settle(cast(s0, ap, ids[0]!));
      expect(s.objects[ids[0]!]!.tapped).toBe(true);
      expect(abilityProblem(s, ap, ids[0]!, 0)).not.toBeNull();
      s.objects[ids[0]!]!.tapped = false;
      const order = [...s.turnOrder];
      const left = nearestOpponent(s, ap, "left");
      s = settle(activate(s, ap, ids[0]!, 0));
      expect(s.objects[ids[0]!]!.zone).toBe("exile");
      expect(s.turnOrder).toEqual([...order].reverse());
      expect(seatOrder(s)).toEqual(order);
      expect(nearestOpponent(s, ap, "left")).toBe(left);
      s = passUntil(s, "upkeep", prevOf(s, ap));
      expect(s.turn).toBe(s0.turn + 1);
      s = passUntil(s, "upkeep", prevOf(s, prevOf(s, ap)));
      expect(s.turn).toBe(s0.turn + 2);
    });

    it("reversed twice, it's back to the order the game began with", () => {
      const { s: s0, ap } = setup([]);
      const a = putOnBattlefield(s0, ap, aeon());
      const b = putOnBattlefield(s0, ap, aeon());
      const order = [...s0.turnOrder];
      let s = settle(activate(s0, ap, a, 0));
      s = settle(activate(s, ap, b, 0));
      expect(s.turnOrder).toEqual(order);
      expect(s.seating).toBeUndefined();
      s = passUntil(s, "upkeep", nextOf(s, ap));
      expect(s.turn).toBe(s0.turn + 1);
    });

    it("reversed during an extra turn: the next turn goes to the player after the last one who took a normal turn, in the new order (rulings)", () => {
      const { s: s0, ap } = setup([]);
      const a = putOnBattlefield(s0, ap, aeon());
      s0.extraTurns = [{ player: nextOf(s0, ap) }];
      let s = passUntil(s0, "main1", nextOf(s0, ap));
      expect(s.extraTurn).toBeDefined();
      // Our Engine, activated during that extra turn: we get priority after the players before us.
      for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(waitingOn(s)).toBe(ap);
      s = settle(activate(s, ap, a, 0));
      expect(s.turnOrder).toEqual([...s0.turnOrder].reverse());
      // The last normal turn was ours: next, the player before us in seat order (after us in the new order).
      s = passUntil(s, "upkeep", prevOf(s, ap));
      expect(s.turn).toBe(s0.turn + 2);
    });
  });
});
