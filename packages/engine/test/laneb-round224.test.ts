// Lane B round B224: Naked Singularity and Reality Twist (lands make another color by their basic land types, a land with
// two of them the color its controller chooses), Pulse of Llanowar (your basic lands make a color of your choice) and
// Harvest Mage (until end of turn, a land you tap makes one mana of a color of your choice): a color chosen as the land
// is tapped (ManaOption.instead).

import { describe, expect, it } from "vitest";
import { act, forest as forestCard, passUntil, putOnBattlefield, setup } from "./helpers";
import { defOf, isFullySupported, landCouldProduce, manaOptions, planActivate, planCast, type Action, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";

// Real card data (Scryfall).
const naked = (): CardDef => ({"oracleId":"fb5ec55d-4a35-432a-be6e-c295f1b2e603","name":"Naked Singularity","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Cumulative upkeep {3} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nIf tapped for mana, Plains produce {R}, Islands produce {G}, Swamps produce {W}, Mountains produce {U}, and Forests produce {B} instead of any other type.","colors":[],"colorIdentity":["B","G","R","U","W"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cabadfb2-93cd-4c7a-b901-59c3dd1a7c3c.jpg?1783947457","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cabadfb2-93cd-4c7a-b901-59c3dd1a7c3c.jpg?1783947457","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const twist = (): CardDef => ({"oracleId":"2c6f9fdb-ee27-4cd8-9d4d-1ea8b2830f73","name":"Reality Twist","manaCost":"{U}{U}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {1}{U}{U} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nIf tapped for mana, Plains produce {R}, Swamps produce {G}, Mountains produce {W}, and Forests produce {B} instead of any other type.","colors":["U"],"colorIdentity":["B","G","R","U","W"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1b7e955c-3de2-430c-93b9-0b39ccea5420.jpg?1783947510","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1b7e955c-3de2-430c-93b9-0b39ccea5420.jpg?1783947510","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pulse = (): CardDef => ({"oracleId":"dd1ef824-4e61-4dee-a8f0-9cf459008f2c","name":"Pulse of Llanowar","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a basic land you control is tapped for mana, it produces mana of a color of your choice instead of any other type.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/b/db09afe5-5f01-4f77-a239-12d7a6e59024.jpg?1783945673","artUrl":"https://cards.scryfall.io/art_crop/front/d/b/db09afe5-5f01-4f77-a239-12d7a6e59024.jpg?1783945673","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mage = (): CardDef => ({"oracleId":"6f82b01d-8975-42a1-87e2-99782272bbea","name":"Harvest Mage","manaCost":"{G}","cmc":1,"typeLine":"Creature — Human Spellshaper","supertypes":[],"types":["Creature"],"subtypes":["Human","Spellshaper"],"oracleText":"{G}, {T}, Discard a card: Until end of turn, if you tap a land for mana, it produces one mana of a color of your choice instead of any other type and amount.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95b29329-b9a3-4d59-b0f8-2abc67337760.jpg?1783945816","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95b29329-b9a3-4d59-b0f8-2abc67337760.jpg?1783945816","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const manaReflection = (): CardDef => ({"oracleId":"a3a8a044-283d-443e-bc40-c2f826d70c22","name":"Mana Reflection","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If you tap a permanent for mana, it produces twice as much of that mana instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","commanderLegal":"legal","set":"2xm","releasedAt":"2020-08-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const taiga = (): CardDef => ({"oracleId":"22e3cf1d-3559-4ce1-954c-8dc815342979","name":"Taiga","manaCost":"","cmc":0,"typeLine":"Land — Mountain Forest","supertypes":[],"types":["Land"],"subtypes":["Mountain","Forest"],"oracleText":"({T}: Add {R} or {G}.)","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60df6592-0b3b-4b87-aeb2-8fa94b4fb7be.jpg?1783948659","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60df6592-0b3b-4b87-aeb2-8fa94b4fb7be.jpg?1783948659","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ancientTomb = (): CardDef => ({"oracleId":"23467047-6dba-4498-b783-1ebc4f74b8c2","name":"Ancient Tomb","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}{C}. This land deals 2 damage to you.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/880ffa23-ed71-4f39-aa66-0953a1f20fe9.jpg?1783929430","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/880ffa23-ed71-4f39-aa66-0953a1f20fe9.jpg?1783929430","commanderLegal":"legal","set":"zne","releasedAt":"2020-09-25","rarity":"mythic","layout":"normal","gameChanger":true}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mountainCard = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const plainsCard = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const islandCard = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swampCard = (): CardDef => ({"oracleId":"56719f6a-1a6c-4c0a-8d21-18f7d7350b68","name":"Swamp","manaCost":"","cmc":0,"typeLine":"Basic Land — Swamp","supertypes":["Basic"],"types":["Land"],"subtypes":["Swamp"],"oracleText":"({T}: Add {B}.)","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId":"706ae742-1807-44b7-a4fa-f2e26f61519a","name":"Wild Growth","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const landOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.find((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && defOf(s, s.objects[id]!).name === name)!;
const emptyPool = (s: GameState, pid: PlayerId) => {
  for (const k of ["W", "U", "B", "R", "G", "C"] as const) s.players[pid]!.manaPool[k] = 0;
};
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([k, v]) => typeof v === "number" && v > 0 && k.length === 1));
/** What each way of tapping it for mana adds, with the color chosen for it (if any). */
const offers = (s: GameState, id: string) => manaOptions(s, s.objects[id]!).map((x) => `${x.adds.join("")}${x.instead ? `:${x.instead}` : ""}`);
const tap = (s: GameState, pid: PlayerId, id: string, mana: ManaType, instead?: ManaType) => act(s, { type: "activateMana", player: pid, objectId: id, mana, ...(instead ? { instead } : {}) });

describe("Lane B round B224", () => {
  it("compiles all four cards", () => {
    supported(naked(), twist(), pulse(), mage());
  });

  describe("Naked Singularity", () => {
    it("every player's lands make the color their basic land type is listed with, the same amount (CR 106.12b, 614.1a)", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, opp, naked());
      let s = s0;
      emptyPool(s, ap);
      for (const [name, mana] of [["Plains", "W"], ["Island", "U"], ["Swamp", "B"], ["Mountain", "R"], ["Forest", "G"]] as const) {
        const id = landOf(s, ap, name);
        expect(offers(s, id), name).toHaveLength(1);
        s = tap(s, ap, id, mana);
      }
      expect(pool(s, ap)).toEqual({ R: 1, G: 1, W: 1, U: 1, B: 1 });
      // Sol Ring isn't a land; a land with none of the listed types is unchanged.
      const ring = putOnBattlefield(s, ap, solRing());
      const tomb = putOnBattlefield(s, ap, ancientTomb());
      emptyPool(s, ap);
      s = tap(s, ap, ring, "C");
      s = tap(s, ap, tomb, "C");
      expect(pool(s, ap)).toEqual({ C: 4 });
      // What a land could produce counts the replacement (CR 106.7).
      expect(landCouldProduce(s, s.objects[landOf(s, ap, "Forest")]!)).toEqual(["B"]);
    });

    it("a land with two of the basic land types makes either color, as its controller chooses, all the mana of that one color (rulings)", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, opp, naked());
      const t = putOnBattlefield(s0, ap, taiga());
      let s = s0;
      // Taiga, a Mountain Forest: {U} or {B}, whichever mana it would make.
      expect(offers(s, t).sort()).toEqual(["B:B", "U:U"]);
      expect(landCouldProduce(s, s.objects[t]!)).toEqual(["U", "B"]);
      emptyPool(s, ap);
      s = tap(s, ap, t, "R", "B");
      expect(pool(s, ap)).toEqual({ B: 1 });
      // Not a color it doesn't offer.
      const t2 = putOnBattlefield(s, ap, taiga());
      expect(() => tap(s, ap, t2, "R", "G")).toThrow(/can't be made \{G\} instead/);
      // With Mana Reflection, twice as much, all of one color.
      putOnBattlefield(s, ap, manaReflection());
      expect(offers(s, t2).sort()).toEqual(["BB:B", "UU:U"]);
      emptyPool(s, ap);
      s = tap(s, ap, t2, "G", "U");
      expect(pool(s, ap)).toEqual({ U: 2 });
    });

    it("autopay counts on the colors it makes", () => {
      const { s: s0, ap, ids, opp } = setup([divination()]);
      putOnBattlefield(s0, opp, naked());
      // Only Forests (now {B}) and Mountains (now {U}) are left untapped: {2}{U} needs a Mountain.
      let s = s0;
      for (const id of s.battlefield) if (s.objects[id]!.controller === ap && ["Plains", "Island", "Swamp"].includes(defOf(s, s.objects[id]!).name)) s.objects[id]!.tapped = true;
      const plan = planCast(s, ap, ids[0]!);
      expect(plan).not.toBeNull();
      s = run(s, plan);
      expect(s.stack).toHaveLength(1);
      expect(plan!.filter((a) => a.type === "activateMana").some((a) => a.type === "activateMana" && defOf(s, s.objects[a.objectId]!).name === "Mountain")).toBe(true);
    });
  });

  describe("Reality Twist", () => {
    it("Plains make {R}, Swamps {G}, Mountains {W} and Forests {B}; Islands are unchanged", () => {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, twist());
      let s = s0;
      emptyPool(s, ap);
      for (const [name, mana] of [["Plains", "W"], ["Island", "U"], ["Swamp", "B"], ["Mountain", "R"], ["Forest", "G"]] as const) s = tap(s, ap, landOf(s, ap, name), mana);
      expect(pool(s, ap)).toEqual({ R: 1, G: 1, W: 1, B: 1, U: 1 });
      emptyPool(s, ap);
      s = tap(s, ap, landOf(s, ap, "Mountain"), "R");
      s = tap(s, ap, landOf(s, ap, "Forest"), "G");
      expect(pool(s, ap)).toEqual({ W: 1, B: 1 });
      // Taiga: {W} or {B}.
      const t = putOnBattlefield(s, ap, taiga());
      expect(offers(s, t).sort()).toEqual(["B:B", "W:W"]);
    });
  });

  describe("Pulse of Llanowar", () => {
    it("your basic lands make mana of a color of your choice, the same amount; the one they'd make by default", () => {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, pulse());
      let s = s0;
      const f = landOf(s, ap, "Forest");
      // Each color once.
      expect(offers(s, f)).toEqual(["W:W", "U:U", "B:B", "R:R", "G:G"]);
      expect(landCouldProduce(s, s.objects[f]!)).toEqual(["W", "U", "B", "R", "G"]);
      emptyPool(s, ap);
      s = tap(s, ap, f, "G", "U");
      expect(pool(s, ap)).toEqual({ U: 1 });
      // With no color chosen, it makes what it would have.
      s = tap(s, ap, landOf(s, ap, "Forest"), "G");
      expect(pool(s, ap)).toEqual({ U: 1, G: 1 });
      // With Mana Reflection: twice as much, of the one color chosen.
      putOnBattlefield(s, ap, manaReflection());
      emptyPool(s, ap);
      s = tap(s, ap, landOf(s, ap, "Plains"), "W", "R");
      expect(pool(s, ap)).toEqual({ R: 2 });
    });

    it("only basic lands you control: not Taiga, not an opponent's Forest", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, pulse());
      const t = putOnBattlefield(s0, ap, taiga());
      const theirs = putOnBattlefield(s0, opp, forestCard);
      expect(offers(s0, t).sort()).toEqual(["G", "R"]);
      expect(offers(s0, theirs)).toEqual(["G"]);
      expect(() => tap(s0, ap, t, "R", "U")).toThrow(/can't be made/);
    });

    it("autopay pays {U} with a Forest when that's all that's left", () => {
      const { s: s0, ap, ids } = setup([divination()]);
      putOnBattlefield(s0, ap, pulse());
      let s = s0;
      for (const id of s.battlefield) if (s.objects[id]!.controller === ap && defOf(s, s.objects[id]!).name !== "Forest") s.objects[id]!.tapped = true;
      const plan = planCast(s, ap, ids[0]!);
      expect(plan).not.toBeNull();
      expect(plan!.some((a) => a.type === "activateMana" && a.instead === "U")).toBe(true);
      s = run(s, plan);
      expect(s.stack).toHaveLength(1);
    });
  });

  describe("Harvest Mage", () => {
    it("until end of turn, a land you tap makes one mana of a color of your choice instead of any other type and amount", () => {
      const { s: s0, ap, ids, opp } = setup([divination()]);
      const hm = putOnBattlefield(s0, ap, mage(), { sick: false });
      const tomb = putOnBattlefield(s0, ap, ancientTomb());
      const ring = putOnBattlefield(s0, ap, solRing());
      const theirs = putOnBattlefield(s0, opp, forestCard);
      let s = run(s0, planActivate(s0, ap, hm, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] }));
      for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: s.priority! });
      expect(s.stack).toHaveLength(0);
      expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
      // Ancient Tomb: one mana, of a color of your choice (no {C}{C}).
      expect(offers(s, tomb)).toEqual(["W:W", "U:U", "B:B", "R:R", "G:G"]);
      emptyPool(s, ap);
      s = tap(s, ap, tomb, "C", "B");
      expect(pool(s, ap)).toEqual({ B: 1 });
      // Sol Ring isn't a land; an opponent's land isn't one you tap.
      s = tap(s, ap, ring, "C");
      expect(pool(s, ap)).toEqual({ B: 1, C: 2 });
      expect(offers(s, theirs)).toEqual(["G"]);
      // Until end of turn.
      s = passUntil(s, "upkeep", opp);
      expect(offers(s, landOf(s, ap, "Island"))).toEqual(["U"]);
    });
  });
});
