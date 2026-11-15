// Lane B round B222: Phyrexian Splicer (a keyword chosen as it's activated, taken from one creature and given to another),
// Elemental Expressionist (magecraft: a creature you control exiled instead of leaving any other way, and a 4/4 Elemental
// when it's exiled), Time Reaper (a face-up card the damaged player owns in exile put on the bottom of their library, and 3
// life), Equipoise (the target player's lands, then artifacts, then creatures beyond yours phase out) and Meeting of the Five
// (ten cards exiled, spells with exactly three colors cast from among them, and ten mana only for such spells).

import { describe, expect, it } from "vitest";
import { act, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, defOf, isFullySupported, objHasKeyword, invalidateCharacteristics, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";
import { legalTargets } from "../src/effects/targeting";

// Real card data (Scryfall).
const splicer = (): CardDef => ({"oracleId":"4433a5fd-2daa-440a-b9cc-4ad028358cbc","name":"Phyrexian Splicer","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}, Choose flying, first strike, trample, or shadow: Until end of turn, target creature with the chosen ability loses it and another target creature gains it.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b1e9061a-b9e6-49ec-bc7e-c18557da9fd5.jpg?1783946601","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b1e9061a-b9e6-49ec-bc7e-c18557da9fd5.jpg?1783946601","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const expressionist = (): CardDef => ({"oracleId":"dfc45c58-821c-42f3-ab48-05b912748bdf","name":"Elemental Expressionist","manaCost":"{U/R}{U/R}{U/R}{U/R}","cmc":4,"typeLine":"Creature — Orc Wizard","supertypes":[],"types":["Creature"],"subtypes":["Orc","Wizard"],"oracleText":"Magecraft — Whenever you cast or copy an instant or sorcery spell, choose target creature you control. Until end of turn, it gains \"If this creature would leave the battlefield, exile it instead of putting it anywhere else\" and \"When this creature is put into exile, create a 4/4 blue and red Elemental creature token.\" (Each instance of that ability triggers separately.)","power":"4","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Magecraft"],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/34b6e53f-f605-430e-9455-b3653cbd8e1d.jpg?1783927233","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/34b6e53f-f605-430e-9455-b3653cbd8e1d.jpg?1783927233","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reaper = (): CardDef => ({"oracleId":"a3f9126f-5797-4436-ac5c-c6911d22ffc2","name":"Time Reaper","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Alien Horror","supertypes":[],"types":["Creature"],"subtypes":["Alien","Horror"],"oracleText":"Flying, haste\nConsume Anomaly — Whenever this creature deals combat damage to a player, put target face-up card they own in exile on the bottom of their library. If you do, you gain 3 life.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Consume Anomaly","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69807079-995f-4b15-a9f1-cad3eb66c526.jpg?1783914549","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69807079-995f-4b15-a9f1-cad3eb66c526.jpg?1783914549","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const equipoise = (): CardDef => ({"oracleId":"aab905ef-b945-4523-b26f-fb5e6932bb56","name":"Equipoise","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, for each land target player controls in excess of the number you control, choose a land that player controls, then the chosen permanents phase out. Repeat this process for artifacts and creatures. (While they're phased out, they're treated as though they don't exist. They phase in before that player untaps during their next untap step.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53783312-3551-4361-ab02-c9651ce2a926.jpg?1783947008","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53783312-3551-4361-ab02-c9651ce2a926.jpg?1783947008","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const meeting = (): CardDef => ({"oracleId":"60fc4c2d-1bf9-4c9a-a240-ab9b1c9c6817","name":"Meeting of the Five","manaCost":"{3}{W}{U}{B}{R}{G}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile the top ten cards of your library. You may cast spells with exactly three colors from among them this turn. Add {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}. Spend this mana only to cast spells with exactly three colors.","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6c3c08f-ae9d-4932-ba0e-65652b8b318b.jpg?1783923081","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6c3c08f-ae9d-4932-ba0e-65652b8b318b.jpg?1783923081","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const esperCharm = (): CardDef => ({"oracleId":"d40ea3d9-8c48-4846-b1f4-99018d4fd789","name":"Esper Charm","manaCost":"{W}{U}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Destroy target enchantment.\n• Draw two cards.\n• Target player discards two cards.","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3d70a07-8d91-462c-aa96-901cc9a81531.jpg?1783942545","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3d70a07-8d91-462c-aa96-901cc9a81531.jpg?1783942545","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mantisRider = (): CardDef => ({"oracleId":"5c1a0a7a-dea4-4b8e-b9c0-8c19942a01ef","name":"Mantis Rider","manaCost":"{U}{R}{W}","cmc":3,"typeLine":"Creature — Human Monk","supertypes":[],"types":["Creature"],"subtypes":["Human","Monk"],"oracleText":"Flying, vigilance, haste","power":"3","toughness":"3","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Flying","Vigilance","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82d5ce46-7118-4ede-ba1d-c387e7ce16e7.jpg?1783939056","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82d5ce46-7118-4ede-ba1d-c387e7ce16e7.jpg?1783939056","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const card = (id: string): TargetChoice => ({ kind: "object", id });
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile", top = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  const p = s.players[pid]!;
  if (where === "library") {
    if (top) p.library.unshift(id);
    else p.library.push(id);
  } else p[where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes until someone has a question or the stack and trigger queue are empty. */
const passToQuestion = (s: GameState, max = 60) => {
  for (let i = 0; i < max && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Answers a pending target question of `pid`'s with `targets`. */
const aim = (s: GameState, pid: PlayerId, targets: TargetChoice[]) => {
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: pid });
  return act(s, { type: "chooseTargets", player: pid, targets });
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name);

describe("Lane B round B222", () => {
  it("compiles all five cards", () => {
    supported(splicer(), expressionist(), reaper(), equipoise(), meeting());
  });

  describe("Phyrexian Splicer", () => {
    it("choosing flying: the opponent's flier loses it and your creature gains it until end of turn", () => {
      const { s: s0, ap, opp } = setup([]);
      const sp = putOnBattlefield(s0, ap, splicer());
      const angel = putOnBattlefield(s0, opp, serraAngel());
      const giant = putOnBattlefield(s0, ap, hillGiant());
      let s = run(s0, planActivate(s0, ap, sp, 0, [card(angel), card(giant)], [0]));
      s = passToQuestion(s);
      expect(objHasKeyword(s, s.objects[angel]!, "Flying")).toBe(false);
      expect(objHasKeyword(s, s.objects[giant]!, "Flying")).toBe(true);
      expect(s.objects[sp]!.tapped).toBe(true);
      // Until end of turn.
      s = passUntil(s, "upkeep", opp);
      expect(objHasKeyword(s, s.objects[angel]!, "Flying")).toBe(true);
      expect(objHasKeyword(s, s.objects[giant]!, "Flying")).toBe(false);
    });

    it("the first target must have the chosen ability, and the second must be another creature", () => {
      const { s, ap, opp } = setup([]);
      const sp = putOnBattlefield(s, ap, splicer());
      const angel = putOnBattlefield(s, opp, serraAngel());
      const giant = putOnBattlefield(s, ap, hillGiant());
      // Trample (the third choice): Serra Angel doesn't have it.
      expect(planActivate(s, ap, sp, 0, [card(angel), card(giant)], [2])).toBeNull();
      // Flying: not the same creature twice.
      expect(planActivate(s, ap, sp, 0, [card(angel), card(angel)], [0])).toBeNull();
      expect(planActivate(s, ap, sp, 0, [card(angel), card(giant)], [0])).not.toBeNull();
    });

    it("with the first target gone, the other creature still gains the ability (rulings)", () => {
      const { s: s0, ap, opp } = setup([]);
      const sp = putOnBattlefield(s0, ap, splicer());
      const angel = putOnBattlefield(s0, opp, serraAngel());
      const giant = putOnBattlefield(s0, ap, hillGiant());
      let s = run(s0, planActivate(s0, ap, sp, 0, [card(angel), card(giant)], [0]));
      moveObject(s, angel, "graveyard");
      invalidateCharacteristics(s);
      s = passToQuestion(s);
      expect(zone(s, angel)).toBe("graveyard");
      expect(objHasKeyword(s, s.objects[giant]!, "Flying")).toBe(true);
    });
  });

  describe("Elemental Expressionist", () => {
    it("magecraft twice on the same creature: dying, it's exiled instead and makes a 4/4 blue and red Elemental for each instance", () => {
      const { s: s0, ap, opp, ids } = setup([lightningBolt(), lightningBolt()]);
      putOnBattlefield(s0, ap, expressionist());
      const giant = putOnBattlefield(s0, ap, hillGiant());
      const [b1, b2] = ids as [string, string];
      // The first Bolt at the opponent; the magecraft trigger targets Hill Giant.
      let s = run(s0, planCast(s0, ap, b1, [{ kind: "player", id: opp }]));
      s = aim(s, ap, [card(giant)]);
      s = passToQuestion(s);
      expect(s.stack).toHaveLength(0);
      expect(s.players[opp]!.life).toBe(37);
      // The second at Hill Giant itself, and the trigger at it again.
      s = run(s, planCast(s, ap, b2, [card(giant)]));
      s = aim(s, ap, [card(giant)]);
      s = passToQuestion(s);
      expect(zone(s, giant)).toBe("exile");
      const elementals = named(s, "Elemental Token");
      expect(elementals).toHaveLength(2);
      for (const id of elementals) {
        expect(s.objects[id]!.isToken).toBe(true);
        expect(pt(s, id)).toBe("4/4");
        expect(defOf(s, s.objects[id]!).colors).toEqual(["U", "R"]);
      }
    });

    it("a token targeted is still exiled, briefly, and makes the Elemental (rulings)", () => {
      const { s: s0, ap, ids } = setup([lightningBolt()]);
      putOnBattlefield(s0, ap, expressionist());
      const tok = putOnBattlefield(s0, ap, hillGiant());
      s0.objects[tok]!.isToken = true;
      let s = run(s0, planCast(s0, ap, ids[0]!, [card(tok)]));
      s = aim(s, ap, [card(tok)]);
      s = passToQuestion(s);
      expect(s.battlefield).not.toContain(tok);
      expect(named(s, "Elemental Token")).toHaveLength(1);
    });

    it("the abilities last until end of turn: next turn the creature dies as usual", () => {
      const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
      putOnBattlefield(s0, ap, expressionist());
      const giant = putOnBattlefield(s0, ap, hillGiant());
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
      s = aim(s, ap, [card(giant)]);
      s = passToQuestion(s);
      s = passUntil(s, "upkeep", opp);
      s.objects[giant]!.damage = 3;
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(zone(s, giant)).toBe("graveyard");
      expect(named(s, "Elemental Token")).toHaveLength(0);
    });
  });

  describe("Time Reaper", () => {
    const attack = () => {
      const { s: s0, ap, opp } = setup([]);
      const tr = putOnBattlefield(s0, ap, reaper());
      const theirs = toZone(s0, opp, crawWurm(), "exile");
      const foretold = toZone(s0, opp, hillGiant(), "exile");
      s0.objects[foretold]!.foretold = true;
      const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
      const notTheirs = toZone(s0, other, serraAngel(), "exile");
      let s = passUntil(s0, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: tr, defender: opp }] });
      for (let i = 0; i < 200 && !(s.pending?.kind === "chooseTargets" && s.pending.player === ap); i++)
        s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
      return { s, ap, opp, theirs, foretold, notTheirs };
    };

    it("puts a face-up card the damaged player owns in exile on the bottom of their library, and you gain 3 life", () => {
      let { s, ap, opp, theirs, foretold, notTheirs } = attack();
      expect(s.players[opp]!.life).toBe(36);
      if (s.pending?.kind !== "chooseTargets") throw new Error("no target question");
      const options = legalTargets(s, s.pending.specs[0]!, ap).map((t) => (t.kind === "object" ? t.id : ""));
      expect(options).toContain(theirs);
      // Not a face-down (foretold) card, nor a card another player owns.
      expect(options).not.toContain(foretold);
      expect(options).not.toContain(notTheirs);
      s = aim(s, ap, [card(theirs)]);
      s = passToQuestion(s);
      expect(zone(s, theirs)).toBe("library");
      expect(s.players[opp]!.library.at(-1)).toBe(theirs);
      expect(s.players[ap]!.life).toBe(43);
    });

    it("with the card gone from exile first, nothing happens and no life is gained", () => {
      let { s, ap, opp, theirs } = attack();
      s = aim(s, ap, [card(theirs)]);
      moveObject(s, theirs, "graveyard");
      s = passToQuestion(s);
      expect(zone(s, theirs)).toBe("graveyard");
      expect(s.players[opp]!.library).not.toContain(theirs);
      expect(s.players[ap]!.life).toBe(40);
    });
  });

  describe("Equipoise", () => {
    /** You: Equipoise, one Forest and one creature; the opponent: three lands, Sol Ring, Ornithopter and two creatures. */
    const board = () => {
      const { s: s0, ap, opp } = setup([]);
      const forestDef = s0.cards[s0.objects[s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!]!.cardId]!;
      for (const id of [...s0.battlefield])
        if (s0.objects[id]!.controller === ap) {
          s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
          delete s0.objects[id];
        }
      putOnBattlefield(s0, ap, equipoise());
      putOnBattlefield(s0, ap, forestDef);
      putOnBattlefield(s0, ap, hillGiant());
      const lands = [putOnBattlefield(s0, opp, forestDef), putOnBattlefield(s0, opp, forestDef), putOnBattlefield(s0, opp, forestDef)];
      const ring = putOnBattlefield(s0, opp, solRing());
      const thopter = putOnBattlefield(s0, opp, ornithopter());
      const creatures = [putOnBattlefield(s0, opp, hillGiant()), putOnBattlefield(s0, opp, crawWurm())];
      return { s: s0, ap, opp, lands, ring, thopter, creatures };
    };
    const theirs = (s: GameState, opp: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === opp);

    it("lands, then artifacts, then creatures, each counted after the last pass phased out (rulings)", () => {
      const { s: s0, ap, opp, lands, ring, thopter, creatures } = board();
      let s = passUntil(s0, "upkeep", ap);
      s = aim(s, ap, [{ kind: "player", id: opp }]);
      s = passToQuestion(s);
      // Three lands to your one: you choose two of them.
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", count: 2 });
      if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
      expect([...s.pending.options].sort()).toEqual([...lands].sort());
      s = act(s, { type: "pickPermanents", player: ap, ids: [lands[0]!, lands[1]!] });
      // Two artifacts to none: both phase out with no question. Then creatures: Ornithopter is gone already, so two to one.
      expect(zone(s, ring)).toBe("phasedOut");
      expect(zone(s, thopter)).toBe("phasedOut");
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1 });
      if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
      expect([...s.pending.options].sort()).toEqual([...creatures].sort());
      s = act(s, { type: "pickPermanents", player: ap, ids: [creatures[1]!] });
      s = passToQuestion(s);
      expect(theirs(s, opp).sort()).toEqual([lands[2]!, creatures[0]!].sort());
      // They phase in as that player untaps.
      s = passUntil(s, "upkeep", opp);
      expect(theirs(s, opp)).toEqual(expect.arrayContaining([...lands, ring, thopter, ...creatures]));
    });

    it("targeting yourself, nothing phases out", () => {
      const { s: s0, ap } = board();
      let s = passUntil(s0, "upkeep", ap);
      s = aim(s, ap, [{ kind: "player", id: ap }]);
      s = passToQuestion(s);
      expect(s.pending).toBeFalsy();
      expect(s.phasedOut ?? []).toHaveLength(0);
    });

    it("a bot aims it at an opponent and phases out their permanents", () => {
      const { s: s0, ap } = board();
      let s = passUntil(s0, "upkeep", ap);
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i < 10 && s.pending?.player === ap; i++) s = run(s, botActions(s, ap));
        s = passToQuestion(s);
      }
      expect((s.phasedOut ?? []).length).toBeGreaterThan(0);
      expect((s.phasedOut ?? []).every((id) => s.objects[id]!.controller !== ap)).toBe(true);
    });
  });

  describe("Meeting of the Five", () => {
    const meet = () => {
      const { s: s0, ap, ids } = setup([meeting(), lightningBolt(), esperCharm()]);
      const rider = toZone(s0, ap, mantisRider(), "library", true);
      const bolt = toZone(s0, ap, lightningBolt(), "library", true);
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = passToQuestion(s);
      // Every land tapped: only the ten mana is left.
      for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
      return { s, ap, rider, bolt, handBolt: ids[1]!, charm: ids[2]! };
    };

    it("exiles the top ten cards and adds ten mana; a three-color spell among them can be cast with it", () => {
      const { s, ap, rider, bolt } = meet();
      expect(zone(s, rider)).toBe("exile");
      expect(zone(s, bolt)).toBe("exile");
      expect(s.players[ap]!.exile).toHaveLength(10);
      expect(Object.values(s.players[ap]!.manaPool).reduce((a, b) => a + b, 0)).toBe(10);
      const after = run(s, planCast(s, ap, rider));
      expect(after.stack.map((it) => it.objectId)).toContain(rider);
    });

    it("a one-color spell among them can't be cast, and the mana can't pay for one from your hand", () => {
      const { s, ap, bolt, handBolt, charm } = meet();
      const foe = s.turnOrder.find((p) => p !== ap)!;
      expect(planCast(s, ap, bolt, [{ kind: "player", id: foe }])).toBeNull();
      expect(planCast(s, ap, handBolt, [{ kind: "player", id: foe }])).toBeNull();
      // Esper Charm (white, blue and black) from your hand: yes ("Draw two cards").
      expect(planCast(s, ap, charm, undefined, [1])).not.toBeNull();
    });
  });
});
