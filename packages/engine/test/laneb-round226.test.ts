// Lane B round B226: Steamflogger Boss (its Contraption line never applies in this game: nothing legal assembles one,
// CR 701.45a), Shimmer (each land of a land type chosen as it enters has phasing), Cosmos Charger (foretelling costs {1}
// less and can be done on any player's turn) and Hall of Gemstone (at each player's upkeep that player chooses a color;
// until end of turn lands make that color instead of any other color).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, defOf, foretellActionCost, foretellCostOf, foretellProblem, isFullySupported, planForetell, landCouldProduce, manaOptions, moveObject, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";

// Real card data (Scryfall).
const steamflogger = (): CardDef => ({"oracleId":"4d614c79-7934-4662-9ce1-22b57d5137f7","name":"Steamflogger Boss","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Goblin Rigger","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Rigger"],"oracleText":"Other Riggers you control get +1/+0 and have haste.\nIf a Rigger you control would assemble a Contraption, it assembles two Contraptions instead.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Assemble"],"imageUrl":"https://cards.scryfall.io/normal/front/0/0/007ce039-def1-4039-a0a0-ba72e8872dc5.jpg?1783943101","artUrl":"https://cards.scryfall.io/art_crop/front/0/0/007ce039-def1-4039-a0a0-ba72e8872dc5.jpg?1783943101","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rigger = (): CardDef => ({"oracleId":"9364b5bc-3e78-4b9d-9993-0081bbe2eef6","name":"Moriok Rigger","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Human Rogue Rigger","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue","Rigger"],"oracleText":"Whenever an artifact is put into a graveyard from the battlefield, you may put a +1/+1 counter on this creature.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/47ffdeb8-52d2-4059-b9c6-0ad71b96516a.jpg?1783944398","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/47ffdeb8-52d2-4059-b9c6-0ad71b96516a.jpg?1783944398","commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shimmer = (): CardDef => ({"oracleId":"f557fb2c-581b-4a8d-8766-1e46e92224fa","name":"Shimmer","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a land type.\nEach land of the chosen type has phasing. (It phases in or out before its controller untaps during each of their untap steps. While it's phased out, it's treated as though it doesn't exist.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c892daa-57fe-4712-b64a-6099d531bb26.jpg?1783947102","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c892daa-57fe-4712-b64a-6099d531bb26.jpg?1783947102","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hall = (): CardDef => ({"oracleId":"3da9fecc-064a-44e6-b88e-4b10194e367e","name":"Hall of Gemstone","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player chooses a color. Until end of turn, lands tapped for mana produce mana of the chosen color instead of any other color.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/18e4551f-9f6c-4421-ad66-a270df6d3463.jpg?1783947064","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/18e4551f-9f6c-4421-ad66-a270df6d3463.jpg?1783947064","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const taiga = (): CardDef => ({"oracleId":"22e3cf1d-3559-4ce1-954c-8dc815342979","name":"Taiga","manaCost":"","cmc":0,"typeLine":"Land — Mountain Forest","supertypes":[],"types":["Land"],"subtypes":["Mountain","Forest"],"oracleText":"({T}: Add {R} or {G}.)","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60df6592-0b3b-4b87-aeb2-8fa94b4fb7be.jpg?1783948659","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60df6592-0b3b-4b87-aeb2-8fa94b4fb7be.jpg?1783948659","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ancientTomb = (): CardDef => ({"oracleId":"23467047-6dba-4498-b783-1ebc4f74b8c2","name":"Ancient Tomb","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}{C}. This land deals 2 damage to you.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/880ffa23-ed71-4f39-aa66-0953a1f20fe9.jpg?1783929430","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/880ffa23-ed71-4f39-aa66-0953a1f20fe9.jpg?1783929430","commanderLegal":"legal","set":"zne","releasedAt":"2020-09-25","rarity":"mythic","layout":"normal","gameChanger":true}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const manaReflection = (): CardDef => ({"oracleId":"a3a8a044-283d-443e-bc40-c2f826d70c22","name":"Mana Reflection","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If you tap a permanent for mana, it produces twice as much of that mana instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","commanderLegal":"legal","set":"2xm","releasedAt":"2020-08-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const islandCard = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const cosmos = (): CardDef => ({"oracleId":"603e518c-8f12-432c-ae03-790db5be77bf","name":"Cosmos Charger","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Horse Spirit","supertypes":[],"types":["Creature"],"subtypes":["Horse","Spirit"],"oracleText":"Flash\nFlying\nForetelling cards from your hand costs {1} less and can be done on any player's turn.\nForetell {2}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Flash","Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4ec318c6-b718-436f-b9e8-e0c6154e5010.jpg?1783928268","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4ec318c6-b718-436f-b9e8-e0c6154e5010.jpg?1783928268","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const raven = (): CardDef => ({"oracleId":"ee05fc58-1356-4b2f-b9ce-bda8cc716aee","name":"Augury Raven","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Bird","supertypes":[],"types":["Creature"],"subtypes":["Bird"],"oracleText":"Flying\nForetell {1}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9947cfd-91d6-479e-a7f6-2a2050f020f3.jpg?1783928268","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9947cfd-91d6-479e-a7f6-2a2050f020f3.jpg?1783928268","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
/** Passes until someone has a question (or the stack is empty and nothing waits). */
const untilPending = (s: GameState) => {
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const emptyPool = (s: GameState, pid: PlayerId) => {
  for (const k of ["W", "U", "B", "R", "G", "C"] as const) s.players[pid]!.manaPool[k] = 0;
};
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([k, v]) => typeof v === "number" && v > 0 && k.length === 1));
const offers = (s: GameState, id: string) => manaOptions(s, s.objects[id]!).map((x) => x.adds.join(""));
const tap = (s: GameState, pid: PlayerId, id: string, mana: ManaType) => act(s, { type: "activateMana", player: pid, objectId: id, mana });
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && defOf(s, s.objects[id]!).name === name);

describe("Lane B round B226", () => {
  it("compiles all four cards", () => {
    supported(steamflogger(), shimmer(), cosmos(), hall());
  });

  describe("Steamflogger Boss", () => {
    it("other Riggers you control get +1/+0 and haste; its Contraption line does nothing (CR 701.45a)", () => {
      const { s, ap, opp } = setup([]);
      const boss = putOnBattlefield(s, ap, steamflogger(), { sick: true });
      const mine = putOnBattlefield(s, ap, rigger(), { sick: true });
      const theirs = putOnBattlefield(s, opp, rigger(), { sick: true });
      const b = putOnBattlefield(s, ap, bear(), { sick: true });
      expect(pt(s, mine)).toBe("3/2");
      expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(true);
      // Not itself ("other"), not an opponent's Rigger, not a non-Rigger.
      expect(pt(s, boss)).toBe("3/3");
      expect(objHasKeyword(s, s.objects[boss]!, "Haste")).toBe(false);
      expect(pt(s, theirs)).toBe("2/2");
      expect(objHasKeyword(s, s.objects[theirs]!, "Haste")).toBe(false);
      expect(pt(s, b)).toBe("2/2");
    });
  });

  describe("Shimmer", () => {
    it("a land type is chosen as it enters; each land of that type, anyone's, has phasing and phases out at its controller's untap step", () => {
      const { s: s0, ap, ids, opp } = setup([shimmer()]);
      const oppIslands = [putOnBattlefield(s0, opp, islandCard()), putOnBattlefield(s0, opp, islandCard())];
      const oppForest = putOnBattlefield(s0, opp, forestCard());
      let s = untilPending(run(s0, planCast(s0, ap, ids[0]!)));
      expect(s.pending?.kind).toBe("chooseOption");
      const pend = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
      expect(pend.player).toBe(ap);
      expect(pend.what).toBe("landType");
      // Any land type, basic or not (CR 205.3i, rulings).
      expect(pend.options).toEqual(expect.arrayContaining(["Island", "Forest", "Desert", "Gate", "Urza's"]));
      s = act(s, { type: "chooseOption", player: ap, choice: "Island" });
      s = untilPending(s);
      const sh = named(s, ap, "Shimmer")[0]!;
      expect(s.objects[sh]!.chosen?.landType).toBe("Island");
      for (const id of oppIslands) expect(objHasKeyword(s, s.objects[id]!, "Phasing")).toBe(true);
      expect(objHasKeyword(s, s.objects[named(s, ap, "Island")[0]!]!, "Phasing")).toBe(true);
      expect(objHasKeyword(s, s.objects[oppForest]!, "Phasing")).toBe(false);
      expect(objHasKeyword(s, s.objects[named(s, ap, "Forest")[0]!]!, "Phasing")).toBe(false);
      // The opponent's untap step: their Islands phase out (CR 702.26a), the Forest stays.
      s = passUntil(s, "upkeep", opp);
      for (const id of oppIslands) expect(s.objects[id]!.zone).toBe("phasedOut");
      expect(s.objects[oppForest]!.zone).toBe("battlefield");
      // Ours stay until our own untap step.
      expect(s.objects[named(s, ap, "Island")[0]!]!.zone).toBe("battlefield");
      // At their next untap step they phase back in (and have phasing again, so they'll go out the turn after).
      s = passUntil(s, "upkeep", nextOf(s, opp, 1));
      s = passUntil(s, "upkeep", opp);
      for (const id of oppIslands) expect(s.objects[id]!.zone).toBe("battlefield");
    });

    it("once Shimmer leaves, lands of that type lose phasing", () => {
      const { s: s0, ap, ids, opp } = setup([shimmer()]);
      const isl = putOnBattlefield(s0, opp, islandCard());
      let s = untilPending(run(s0, planCast(s0, ap, ids[0]!)));
      s = untilPending(act(s, { type: "chooseOption", player: ap, choice: "Island" }));
      expect(objHasKeyword(s, s.objects[isl]!, "Phasing")).toBe(true);
      const sh = named(s, ap, "Shimmer")[0]!;
      moveObject(s, sh, "graveyard");
      expect(objHasKeyword(s, s.objects[isl]!, "Phasing")).toBe(false);
      s = passUntil(s, "upkeep", opp);
      expect(s.objects[isl]!.zone).toBe("battlefield");
    });

    it("a bot chooses the land type its opponents have the most lands of, net of its own", () => {
      const { s: s0, ap, ids } = setup([shimmer()]);
      // We (ap) have three of each basic; each opponent gets four Forests: Forests hurt them 12 to our 9.
      for (let k = 1; k <= 3; k++) for (let i = 0; i < 4; i++) putOnBattlefield(s0, nextOf(s0, ap, k), forestCard());
      const s = untilPending(run(s0, planCast(s0, ap, ids[0]!)));
      const answer = botActions(s, ap);
      expect(answer).toEqual([{ type: "chooseOption", player: ap, choice: "Forest" }]);
    });

    it("a bot casts it only with a land type that hurts its opponents more than itself", () => {
      const { s: s0, ap, ids } = setup([shimmer()]);
      // Only Shimmer in hand, so the bot's first action is whether to cast it.
      for (const id of s0.players[ap]!.hand.filter((x) => x !== ids[0])) {
        s0.objects[id]!.zone = "library";
        s0.players[ap]!.library.push(id);
      }
      s0.players[ap]!.hand = [ids[0]!];
      const casts = (s: GameState) => botActions(s, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0]);
      expect(casts(s0)).toBe(false);
      for (let k = 1; k <= 3; k++) for (let i = 0; i < 4; i++) putOnBattlefield(s0, nextOf(s0, ap, k), forestCard());
      expect(casts(s0)).toBe(true);
    });

    it("a bot with only a losing land type chooses one no land has", () => {
      const { s: s0, ap, ids } = setup([shimmer()]);
      const s = untilPending(run(s0, planCast(s0, ap, ids[0]!)));
      const [a] = botActions(s, ap);
      expect(a?.type).toBe("chooseOption");
      const choice = a?.type === "chooseOption" ? a.choice : "";
      expect(s.battlefield.some((id) => (s.cards[s.objects[id]!.cardId]?.subtypes ?? []).includes(String(choice)))).toBe(false);
    });
  });

  describe("Hall of Gemstone", () => {
    /** Passes (bots answering every other player's question) until `pid` has Hall of Gemstone's question at their upkeep. */
    const toUpkeepChoice = (s0: GameState, pid: PlayerId) => {
      let s = s0;
      let left = s.activePlayer === pid;
      for (let i = 0; i < 3000; i++) {
        if (s.activePlayer !== pid) left = true;
        if (left && s.activePlayer === pid && s.step === "upkeep" && s.pending?.player === pid) return s;
        const p = s.pending;
        if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
        else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
        else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      throw new Error("never asked");
    };

    it("the player whose upkeep it is chooses a color; until end of turn every land's colored mana is that color, colorless unchanged", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, hall());
      const forest = putOnBattlefield(s0, opp, forestCard());
      const taigaId = putOnBattlefield(s0, opp, taiga());
      const tomb = putOnBattlefield(s0, opp, ancientTomb());
      const ring = putOnBattlefield(s0, opp, solRing());
      let s = toUpkeepChoice(s0, opp);
      expect(s.pending?.kind).toBe("chooseOption");
      const pend = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
      expect(pend.player).toBe(opp);
      expect(pend.what).toBe("color");
      s = untilPending(act(s, { type: "chooseOption", player: opp, choice: pend.options.find((o) => /blue/i.test(o))! }));
      expect(s.stack).toHaveLength(0);
      // Every land, anyone's: the opponent's Forest and Taiga, our Mountain.
      expect(offers(s, forest)).toEqual(["U"]);
      expect([...new Set(offers(s, taigaId))]).toEqual(["U"]);
      expect(landCouldProduce(s, s.objects[named(s, ap, "Mountain")[0]!]!)).toEqual(["U"]);
      // Colorless mana isn't affected (rulings), nor what isn't a land.
      expect(offers(s, tomb)).toEqual(["CC"]);
      expect(offers(s, ring)).toEqual(["CC"]);
      emptyPool(s, opp);
      s = tap(s, opp, forest, "G");
      s = tap(s, opp, taigaId, "R");
      s = tap(s, opp, tomb, "C");
      expect(pool(s, opp)).toEqual({ U: 2, C: 2 });
      // The next player's upkeep: a new choice, the old one gone.
      s = toUpkeepChoice(s, nextOf(s, opp, 1));
      const p2 = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
      expect(p2.player).toBe(nextOf(s, opp, 1));
      s = untilPending(act(s, { type: "chooseOption", player: p2.player, choice: p2.options.find((o) => /red/i.test(o))! }));
      expect(offers(s, forest)).toEqual(["R"]);
    });

    it("with Mana Reflection, twice as much of the chosen color", () => {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, hall());
      putOnBattlefield(s0, ap, manaReflection());
      let s = toUpkeepChoice(s0, ap);
      const pend = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
      s = untilPending(act(s, { type: "chooseOption", player: ap, choice: pend.options.find((o) => /black/i.test(o))! }));
      expect(offers(s, named(s, ap, "Forest")[0]!)).toEqual(["BB"]);
    });

    it("a bot answers the color question", () => {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, hall());
      const s = toUpkeepChoice(s0, ap);
      const [a] = botActions(s, ap);
      expect(a?.type).toBe("chooseOption");
      const t = act(s, a!);
      expect(t.pending).toBeFalsy();
    });
  });

  describe("Cosmos Charger", () => {
    /** A card put into `pid`'s hand. */
    const inHand = (s: GameState, pid: PlayerId, d: CardDef) => {
      const id = putOnBattlefield(s, pid, d);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.players[pid]!.hand.push(id);
      return id;
    };

    it("its controller may foretell on another player's turn, for {1} (CR 702.143a, rulings)", () => {
      const { s: s0, ap, opp } = setup([]);
      for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, islandCard());
      const card = inHand(s0, opp, raven());
      // Your turn, the opponent has priority: without a Charger they can't foretell now.
      let s = act(s0, { type: "passPriority", player: ap });
      expect(s.priority).toBe(opp);
      expect(foretellProblem(s, opp, card)).toMatch(/only foretell during your own turn/);
      // In hand it does nothing (rulings).
      const inHandCharger = inHand(s, opp, cosmos());
      expect(foretellProblem(s, opp, card)).toMatch(/only foretell during your own turn/);
      expect(foretellActionCost(s, opp)).toBe("{2}");
      // On the battlefield: any player's turn, {1}.
      s.players[opp]!.hand = s.players[opp]!.hand.filter((x) => x !== inHandCharger);
      delete s.objects[inHandCharger];
      putOnBattlefield(s, opp, cosmos());
      expect(foretellActionCost(s, opp)).toBe("{1}");
      expect(foretellActionCost(s, ap)).toBe("{2}");
      const plan = planForetell(s, opp, card);
      expect(plan).not.toBeNull();
      expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(1);
      s = run(s, plan);
      expect(s.objects[card]!.zone).toBe("exile");
      expect(s.objects[card]!.foretold).toBe(true);
      // The foretell cost it's later cast for is its own (rulings).
      expect(foretellCostOf(s, s.objects[card]!)).toBe("{1}{U}");
      expect(s.players[opp]!.manaPool.U).toBe(0);
    });

    it("two Chargers: foretelling costs {0}; a third doesn't make it cheaper (rulings)", () => {
      const { s, ap } = setup([]);
      putOnBattlefield(s, ap, cosmos());
      putOnBattlefield(s, ap, cosmos());
      expect(foretellActionCost(s, ap)).toBe("{0}");
      putOnBattlefield(s, ap, cosmos());
      expect(foretellActionCost(s, ap)).toBe("{0}");
      const card = inHand(s, ap, raven());
      for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
      expect(foretellProblem(s, ap, card)).toBeNull();
      const t = act(s, { type: "foretell", player: ap, objectId: card });
      expect(t.objects[card]!.zone).toBe("exile");
    });
  });
});
