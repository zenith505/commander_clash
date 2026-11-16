// Lane B round B223: Chaos Moon (each upkeep, an odd or even number of permanents pumps or shrinks red creatures and changes
// what Mountains make), Maddening Imp (the active player's non-Wall creatures must attack; those that don't are destroyed at
// the end step), Goblin Artisans (a coin flip: a card, or your own artifact spell countered) and Disciple of Caelus Nin (each
// player keeps five permanents, the rest phase out, and nothing phases in while it's around).

import { describe, expect, it } from "vitest";
import { act, bear, forest as forestCard, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject, runStateBasedActions } from "../src/game";
import { phaseOut } from "../src/phasing";
import { legalTargets } from "../src/effects/targeting";

// Real card data (Scryfall).
const chaosMoon = (): CardDef => ({"oracleId":"728e2960-1d85-4b3f-8b5b-915f9b9ffd2f","name":"Chaos Moon","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each upkeep, count the number of permanents. If the number is odd, until end of turn, red creatures get +1/+1 and whenever a player taps a Mountain for mana, that player adds an additional {R}. If the number is even, until end of turn, red creatures get -1/-1 and if a player taps a Mountain for mana, that Mountain produces colorless mana instead of any other type.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/a/a/aae0543f-7f8b-4327-b735-ac21244e9936.jpg?1783947491","artUrl":"https://cards.scryfall.io/art_crop/front/a/a/aae0543f-7f8b-4327-b735-ac21244e9936.jpg?1783947491","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const imp = (): CardDef => ({"oracleId":"97dea59e-2090-4653-9ed9-86820a20605f","name":"Maddening Imp","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Imp","supertypes":[],"types":["Creature"],"subtypes":["Imp"],"oracleText":"Flying\n{T}: Non-Wall creatures the active player controls attack this turn if able. At the beginning of the next end step, destroy each of those creatures that didn't attack this turn. Activate only during an opponent's turn and only before combat.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/dda08eb5-c75c-4c21-bfd1-1f04a3575241.jpg?1783946637","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/dda08eb5-c75c-4c21-bfd1-1f04a3575241.jpg?1783946637","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const artisans = (): CardDef => ({"oracleId":"ec85a375-fe38-4b11-af0e-f2b466181dd7","name":"Goblin Artisans","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Artificer","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Artificer"],"oracleText":"{T}: Flip a coin. If you win the flip, draw a card. If you lose the flip, counter target artifact spell you control that isn't the target of an ability from another creature named Goblin Artisans.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/6669d96e-9a7b-4427-a477-f4e76831f593.jpg?1783948368","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/6669d96e-9a7b-4427-a477-f4e76831f593.jpg?1783948368","commanderLegal":"legal","set":"atq","releasedAt":"1994-03-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const disciple = (): CardDef => ({"oracleId":"2e5440ef-6887-4c79-98f5-49db82406d71","name":"Disciple of Caelus Nin","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When this creature enters, starting with you, each player chooses up to five permanents they control. All permanents other than this creature that weren't chosen this way phase out.\nPermanents can't phase in.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e001d843-3a1b-4669-b3b7-c7d1f67b617e.jpg?1783919708","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e001d843-3a1b-4669-b3b7-c7d1f67b617e.jpg?1783919708","commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wallOfStone = (): CardDef => ({"oracleId":"cd4cadb4-3156-49bd-b36e-12ba5c85938b","name":"Wall of Stone","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"8","colors":["R"],"colorIdentity":["R"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mountainCard = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const taiga = (): CardDef => ({"oracleId":"22e3cf1d-3559-4ce1-954c-8dc815342979","name":"Taiga","manaCost":"","cmc":0,"typeLine":"Land — Mountain Forest","supertypes":[],"types":["Land"],"subtypes":["Mountain","Forest"],"oracleText":"({T}: Add {R} or {G}.)","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60df6592-0b3b-4b87-aeb2-8fa94b4fb7be.jpg?1783948659","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60df6592-0b3b-4b87-aeb2-8fa94b4fb7be.jpg?1783948659","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shivanDragon = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oubliette = (): CardDef => ({"oracleId":"c753e9e3-9374-4e3c-8622-94576a8c1da3","name":"Oubliette","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, target creature phases out until this enchantment leaves the battlefield. Tap that creature as it phases in this way. (Auras and Equipment phase out with it. While permanents are phased out, they're treated as though they don't exist.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/4/d4800a7d-c229-4ced-97ff-0e58645d58d6.jpg?1783930177","artUrl":"https://cards.scryfall.io/art_crop/front/d/4/d4800a7d-c229-4ced-97ff-0e58645d58d6.jpg?1783930177","commanderLegal":"legal","set":"2xm","releasedAt":"2020-08-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const card = (id: string): TargetChoice => ({ kind: "object", id });
/** Passes until someone has a question or the stack and trigger queue are empty. */
const passToQuestion = (s: GameState, max = 60) => {
  for (let i = 0; i < max && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The first random state from which `go` gives a game `ok` accepts (coin flips come from it). */
const rigged = (s0: GameState, go: (s: GameState) => GameState, ok: (s: GameState) => boolean) => {
  for (let k = 1; k < 5000; k++) {
    const c = structuredClone(s0);
    c.rngState = k;
    const out = go(c);
    if (ok(out)) return out;
  }
  throw new Error("no random state gives that");
};
/** Moves a new card for `def` into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const mine = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid);
const landOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.find((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && defOf(s, s.objects[id]!).name === name)!;
const emptyPool = (s: GameState, pid: PlayerId) => {
  for (const k of ["W", "U", "B", "R", "G", "C"] as const) s.players[pid]!.manaPool[k] = 0;
};
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([k, v]) => typeof v === "number" && v > 0 && k.length === 1));

describe("Lane B round B223", () => {
  it("compiles all four cards", () => {
    supported(chaosMoon(), imp(), artisans(), disciple());
  });

  describe("Chaos Moon", () => {
    /** Chaos Moon on the active player's side, then on to the next player's upkeep with its trigger resolved, with `extra` permanents more. */
    const atUpkeep = (extra: number) => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, chaosMoon());
      const giant = putOnBattlefield(s0, opp, hillGiant());
      const bears = putOnBattlefield(s0, opp, bear());
      const theirMountain = putOnBattlefield(s0, opp, mountainCard());
      const taigaId = putOnBattlefield(s0, opp, taiga());
      const theirForest = putOnBattlefield(s0, opp, forestCard);
      for (let i = 0; i < extra; i++) putOnBattlefield(s0, opp, bear({ name: `Extra Bear ${i}` }));
      let s = passUntil(s0, "upkeep", opp);
      const n = s.battlefield.length;
      s = passToQuestion(s);
      return { s, ap, opp, giant, bears, theirMountain, taigaId, theirForest, n };
    };

    it("an odd number: red creatures get +1/+1 and Mountains make an additional {R} until end of turn", () => {
      const first = atUpkeep(0);
      const { s: s0, opp, giant, bears, theirMountain, taigaId, n } = first.n % 2 === 1 ? first : atUpkeep(1);
      expect(n % 2).toBe(1);
      let s = s0;
      expect(pt(s, giant)).toBe("4/4");
      expect(pt(s, bears)).toBe("2/2");
      emptyPool(s, opp);
      s = act(s, { type: "activateMana", player: opp, objectId: theirMountain, mana: "R" });
      expect(pool(s, opp)).toEqual({ R: 2 });
      // A Mountain Forest tapped for {G} is a Mountain tapped for mana too.
      s = act(s, { type: "activateMana", player: opp, objectId: taigaId, mana: "G" });
      expect(pool(s, opp)).toEqual({ R: 3, G: 1 });
      // Until end of turn: a fresh count next upkeep.
      s = passUntil(s, "end", opp);
      expect(pt(s, giant)).toBe("4/4");
      s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
      expect(s.manaTriggersThisTurn ?? []).toHaveLength(0);
    });

    it("an even number: red creatures get -1/-1 and Mountains make colorless mana until end of turn", () => {
      const first = atUpkeep(0);
      const { s: s0, opp, giant, bears, theirMountain, taigaId, theirForest, n } = first.n % 2 === 0 ? first : atUpkeep(1);
      expect(n % 2).toBe(0);
      let s = s0;
      expect(pt(s, giant)).toBe("2/2");
      expect(pt(s, bears)).toBe("2/2");
      emptyPool(s, opp);
      s = act(s, { type: "activateMana", player: opp, objectId: theirMountain, mana: "R" });
      s = act(s, { type: "activateMana", player: opp, objectId: taigaId, mana: "G" });
      expect(pool(s, opp)).toEqual({ C: 2 });
      // A Forest is unchanged.
      s = act(s, { type: "activateMana", player: opp, objectId: theirForest, mana: "G" });
      expect(pool(s, opp)).toEqual({ C: 2, G: 1 });
    });

    it("the red creatures are those red as it resolves (CR 611.2c); phased-out permanents aren't counted", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, chaosMoon());
      const giant = putOnBattlefield(s0, opp, hillGiant());
      // Make the count odd without the phased-out bears (the active player's: they phase in at that player's next untap
      // step), even with them.
      const away = putOnBattlefield(s0, ap, bear());
      phaseOut(s0, [away]);
      if (s0.battlefield.length % 2 === 0) putOnBattlefield(s0, opp, bear({ name: "Odd Bear" }));
      let s = passUntil(s0, "upkeep", opp);
      expect(s.battlefield.length % 2).toBe(1);
      s = passToQuestion(s);
      expect(pt(s, giant)).toBe("4/4");
      // A red creature arriving later isn't pumped.
      const late = putOnBattlefield(s, opp, shivanDragon());
      expect(pt(s, late)).toBe("5/5");
    });
  });

  describe("Maddening Imp", () => {
    /** The Imp under the next player; the active player has Hill Giant, Wall of Stone and tapped bears, in their first main phase. */
    const ready = () => {
      const { s, ap, opp } = setup([]);
      const im = putOnBattlefield(s, opp, imp());
      const giant = putOnBattlefield(s, ap, hillGiant());
      const wall = putOnBattlefield(s, ap, wallOfStone());
      const tired = putOnBattlefield(s, ap, bear());
      s.objects[tired]!.tapped = true;
      return { s, ap, opp, im, giant, wall, tired };
    };
    /** `pid` activates the Imp now: the active player passes priority to them first. */
    const activateImp = (s0: GameState, ap: PlayerId, opp: PlayerId, im: string) => {
      let s = act(s0, { type: "passPriority", player: ap });
      while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      return run(s, planActivate(s, opp, im, 0));
    };

    it("only during an opponent's turn, before combat", () => {
      const { s, ap, opp, im } = ready();
      // Not on its controller's own turn.
      const own = passUntil(structuredClone(s), "main1", opp);
      expect(planActivate(own, opp, im, 0)).toBeNull();
      // Not once combat has begun.
      const combat = passUntil(structuredClone(s), "beginCombat", ap);
      expect(waitingOn(combat)).toBe(ap);
      let c = act(combat, { type: "passPriority", player: ap });
      expect(waitingOn(c)).toBe(opp);
      expect(planActivate(c, opp, im, 0)).toBeNull();
      // Before combat, yes (the upkeep too).
      const up = activateImp(s, ap, opp, im);
      expect(up.stack).toHaveLength(1);
    });

    it("non-Wall creatures must attack; at the end step the ones that didn't are destroyed, a tapped one too (rulings)", () => {
      const { s: s0, ap, opp, im, giant, wall, tired } = ready();
      let s = passToQuestion(activateImp(s0, ap, opp, im));
      expect(s.objects[im]!.tapped).toBe(true);
      // A creature that comes under their control later isn't one of "those creatures".
      const late = putOnBattlefield(s, ap, bear({ name: "Late Bear" }));
      s.objects[late]!.tapped = true;
      s = passUntil(s, "declareAttackers", ap);
      // Hill Giant must attack (CR 508.1d).
      expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }] });
      s = passUntil(s, "end", ap);
      s = passToQuestion(s);
      expect(zone(s, tired)).toBe("graveyard");
      expect(zone(s, giant)).toBe("battlefield");
      expect(zone(s, wall)).toBe("battlefield");
      expect(zone(s, late)).toBe("battlefield");
    });

    it("the delayed trigger still destroys them with the Imp gone", () => {
      const { s: s0, ap, opp, im, tired, giant } = ready();
      let s = passToQuestion(activateImp(s0, ap, opp, im));
      moveObject(s, im, "graveyard");
      invalidateCharacteristics(s);
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }] });
      s = passUntil(s, "end", ap);
      s = passToQuestion(s);
      expect(zone(s, tired)).toBe("graveyard");
    });
  });

  describe("Goblin Artisans", () => {
    /** Goblin Artisans on the battlefield; Sol Ring cast and on the stack, its caster holding priority. */
    const ready = () => {
      const { s: s0, ap, opp } = setup([]);
      const ga = putOnBattlefield(s0, ap, artisans());
      const ring = toHand(s0, ap, solRing());
      const s = run(s0, planCast(s0, ap, ring));
      const spell = s.stack.find((x) => x.kind === "spell" && x.objectId === ring)!.id;
      return { s, ap, opp, ga, ring, spell };
    };

    it("needs an artifact spell you control to target; not an opponent's, not a nonartifact one", () => {
      const { s, ap, opp, ga, spell } = ready();
      expect(planActivate(s, ap, ga, 0, [{ kind: "stack", id: spell }])).not.toBeNull();
      // Nothing on the stack: no target, no activation.
      const { s: e0, ap: eap } = setup([]);
      const ga2 = putOnBattlefield(e0, eap, artisans());
      expect(planActivate(e0, eap, ga2, 0)).toBeNull();
      // An opponent's Goblin Artisans can't target your spell.
      const theirs = putOnBattlefield(s, opp, artisans());
      expect(legalTargets(s, { kind: "spell", types: ["Artifact"], controller: "you", notTargetOfAbilityFrom: { types: ["Creature"], name: "Goblin Artisans" }, text: "x" }, opp, undefined, undefined, theirs)).toHaveLength(0);
    });

    it("a won flip draws a card and the spell resolves; a lost flip counters it", () => {
      const { s, ap, ga, ring, spell } = ready();
      const go = (x: GameState) => passToQuestion(run(x, planActivate(x, ap, ga, 0, [{ kind: "stack", id: spell }])), 10);
      const hand = s.players[ap]!.hand.length;
      const won = rigged(s, go, (x) => x.players[ap]!.hand.length === hand + 1);
      expect(zone(won, ring)).toBe("battlefield");
      const lost = rigged(s, go, (x) => zone(x, ring) === "graveyard");
      expect(lost.players[ap]!.hand.length).toBe(hand);
    });

    it("not a spell another Goblin Artisans' ability targets; one targeted since then makes this ability do nothing (CR 608.2b)", () => {
      const { s: s0, ap, ga, spell } = ready();
      const ga2 = putOnBattlefield(s0, ap, artisans());
      const s = run(s0, planActivate(s0, ap, ga, 0, [{ kind: "stack", id: spell }]));
      // The other Artisans can't target it now; this one's own ability doesn't stop it ("another creature"), untapped again.
      expect(planActivate(s, ap, ga2, 0, [{ kind: "stack", id: spell }])).toBeNull();
      s.objects[ga]!.tapped = false;
      expect(planActivate(s, ap, ga, 0, [{ kind: "stack", id: spell }])).not.toBeNull();
      // An ability of another Goblin Artisans that came to target the spell after this one was activated (put on the stack
      // under it here, as a copy or a change of target could do): as this one resolves, its target is illegal.
      const { s: t0, ap: tap } = ready();
      const g1 = t0.battlefield.find((id) => defOf(t0, t0.objects[id]!).name === "Goblin Artisans")!;
      const g2 = putOnBattlefield(t0, tap, artisans());
      const sp = t0.stack[0]!.id;
      let t = run(t0, planActivate(t0, tap, g1, 0, [{ kind: "stack", id: sp }]));
      const top = t.stack[t.stack.length - 1]!;
      t.stack.splice(t.stack.length - 1, 0, { ...structuredClone(top), id: `${top.id}-g2`, sourceId: g2, sourceZc: t.objects[g2]!.zoneChanges ?? 0 });
      const hand = t.players[tap]!.hand.length;
      t = act(t, { type: "passPriority", player: waitingOn(t)! });
      while (t.stack.length === 3) t = act(t, { type: "passPriority", player: waitingOn(t)! });
      // g1's ability did nothing at all: no card drawn, the spell still there.
      expect(t.players[tap]!.hand.length).toBe(hand);
      expect(t.stack.some((x) => x.kind === "spell")).toBe(true);
      expect(t.log.some((e) => /flips a coin|wins the flip|loses the flip/i.test(e.text))).toBe(false);
      expect(t.log.some((e) => /Goblin Artisans's ability does nothing/.test(e.text))).toBe(true);
    });

    it("bots never activate it (losing the flip counters their own spell)", () => {
      const { s, ap, ga } = ready();
      const acts = botActions(s, ap);
      expect(acts.some((a) => a.type === "activateAbility" && a.objectId === ga)).toBe(false);
    });
  });

  describe("Disciple of Caelus Nin", () => {
    /** The Disciple cast by the active player, who has the setup's lands; the next player has Hill Giant with the active player's Pacifism on it and bears. */
    const ready = () => {
      const { s: s0, ap, opp } = setup([]);
      const d = toHand(s0, ap, disciple());
      const giant = putOnBattlefield(s0, opp, hillGiant());
      const theirBears = putOnBattlefield(s0, opp, bear());
      const pac = putOnBattlefield(s0, ap, pacifism());
      s0.objects[pac]!.attachedTo = giant;
      invalidateCharacteristics(s0);
      let s = run(s0, planCast(s0, ap, d));
      s = passToQuestion(s);
      return { s, ap, opp, d, giant, theirBears, pac };
    };

    it("starting with you, each player keeps up to five; the rest but the Disciple phase out at once, attachments with them", () => {
      let { s, ap, opp, d, giant, theirBears, pac } = ready();
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", count: 5, min: 0 });
      if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
      // The Disciple isn't offered.
      expect(s.pending.options).not.toContain(d);
      expect(s.pending.prompt).toMatch(/phase out/);
      const keepMine = [pac, ...s.pending.options.filter((id) => defOf(s, s.objects[id]!).name === "Mountain").slice(0, 3)];
      s = act(s, { type: "pickPermanents", player: ap, ids: keepMine });
      // Then the next player in turn order.
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "keep" });
      s = act(s, { type: "pickPermanents", player: opp, ids: [theirBears] });
      // The other two players control nothing.
      for (let i = 0; i < 4 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: [] });
      s = passToQuestion(s);
      expect(zone(s, d)).toBe("battlefield");
      expect(zone(s, theirBears)).toBe("battlefield");
      for (const id of keepMine.slice(1)) expect(zone(s, id)).toBe("battlefield");
      expect(zone(s, giant)).toBe("phasedOut");
      // Pacifism was chosen, but it phases out with the Giant it's attached to (CR 702.26g).
      expect(zone(s, pac)).toBe("phasedOut");
      expect(mine(s, ap)).toHaveLength(4);
    });

    it("nothing phases in while it's on the battlefield; once it's gone, they phase in at their controllers' untap steps", () => {
      let { s, ap, opp, d, giant, pac } = ready();
      for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: [] });
      s = passToQuestion(s);
      const out = s.phasedOut!.length;
      expect(zone(s, giant)).toBe("phasedOut");
      s = passUntil(s, "upkeep", opp);
      expect(zone(s, giant)).toBe("phasedOut");
      s = passUntil(s, "upkeep", ap);
      expect(s.phasedOut!.length).toBe(out);
      moveObject(s, d, "graveyard");
      invalidateCharacteristics(s);
      s = passUntil(s, "upkeep", opp);
      // The Giant phases in with Pacifism still on it.
      expect(zone(s, giant)).toBe("battlefield");
      expect(zone(s, pac)).toBe("battlefield");
      expect(s.objects[pac]!.attachedTo).toBe(giant);
    });

    it("phased out itself, it stops nothing; it phases in with the rest at its controller's untap step (rulings)", () => {
      let { s, ap, d } = ready();
      for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: [] });
      s = passToQuestion(s);
      phaseOut(s, [d]);
      s = passUntil(s, "upkeep", ap);
      expect(zone(s, d)).toBe("battlefield");
      expect(s.phasedOut?.some((id) => s.objects[id]!.phased?.by === ap) ?? false).toBe(false);
    });

    it("something phased out until an event that happens meanwhile stays phased out for good (rulings)", () => {
      let { s, opp, d, theirBears } = ready();
      for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: s.pending.player === opp ? [theirBears] : [] });
      s = passToQuestion(s);
      // As Oubliette does: phased out until a permanent leaves, which then leaves.
      const holder = putOnBattlefield(s, opp, oubliette());
      phaseOut(s, [theirBears]);
      s.objects[theirBears]!.phased = { ...s.objects[theirBears]!.phased!, until: { id: holder, zc: s.objects[holder]!.zoneChanges ?? 0 } };
      moveObject(s, holder, "graveyard");
      invalidateCharacteristics(s);
      expect(zone(s, theirBears)).toBe("phasedOut");
      moveObject(s, d, "graveyard");
      invalidateCharacteristics(s);
      s = passUntil(s, "upkeep", opp);
      expect(zone(s, theirBears)).toBe("phasedOut");
    });

    it("when it enters on another player's turn, its controller chooses first", () => {
      const { s: s0, ap, opp } = setup([]);
      const d = toHand(s0, opp, disciple());
      putOnBattlefield(s0, opp, bear());
      let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!);
      s = passUntil(s, "main1");
      const active = s.activePlayer;
      expect(active).not.toBe(opp);
      moveObject(s, d, "battlefield");
      runStateBasedActions(s);
      s = passToQuestion(s);
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp });
      // Then on in turn order from them: the active player and the one after control nothing, so the setup's player with
      // the lands, who chooses last in APNAP order, is next.
      s = act(s, { type: "pickPermanents", player: opp, ids: [] });
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    });

    it("bots cast it only while they'd keep every permanent of theirs", () => {
      const { s, ap } = setup([]);
      // Nothing else in hand to play first.
      for (const id of [...s.players[ap]!.hand]) moveObject(s, id, "graveyard");
      const d = toHand(s, ap, disciple());
      expect(botActions(s, ap).some((a) => a.type === "castSpell" && a.objectId === d)).toBe(false);
      // Five lands only, a Plains among them: it's cast then.
      const plainsId = mine(s, ap).find((x) => defOf(s, s.objects[x]!).name === "Plains")!;
      const keep = [plainsId, ...mine(s, ap).filter((x) => defOf(s, s.objects[x]!).name !== "Plains").slice(0, 4)];
      for (const id of mine(s, ap)) if (!keep.includes(id)) moveObject(s, id, "graveyard");
      invalidateCharacteristics(s);
      expect(mine(s, ap)).toHaveLength(5);
      expect(botActions(s, ap).some((a) => a.type === "castSpell" && a.objectId === d)).toBe(true);
    });
  });
});

