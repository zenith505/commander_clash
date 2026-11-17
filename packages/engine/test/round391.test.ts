// Round 391: cards exiled in a face-down pile, shuffled, then manifested or cloaked (CR 701.40a, 701.58a, 406.3, 708.5):
// Ghastly Conscription's "Exile all creature cards from target player's graveyard in a face-down pile, shuffle that pile,
// then manifest those cards.", Become Anonymous's "Exile target nontoken creature you own and the top two cards of your
// library in a face-down pile, shuffle that pile, then cloak those cards. They enter tapped.", and Expose the Culprit's
// "Exile any number of face-up creatures you control with disguise in a face-down pile, shuffle that pile, then cloak
// them." beside "Turn target face-down creature face up."

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, faceUpWays, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const ghastly = (): CardDef => ({"oracleId":"3bf20e68-0e19-4242-bfba-a8a1bb244685","name":"Ghastly Conscription","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile all creature cards from target player's graveyard in a face-down pile, shuffle that pile, then manifest those cards. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)","colors":["B"],"colorIdentity":["B"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/1/2/120f7d4a-27b3-43e8-a301-c81d4d403a8f.jpg?1783938696","artUrl":"https://cards.scryfall.io/art_crop/front/1/2/120f7d4a-27b3-43e8-a301-c81d4d403a8f.jpg?1783938696","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const anon = (): CardDef => ({"oracleId":"bac0fcee-9c1a-46b7-86c8-ffbfcc1e96de","name":"Become Anonymous","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target nontoken creature you own and the top two cards of your library in a face-down pile, shuffle that pile, then cloak those cards. They enter tapped. (To cloak a card, put it onto the battlefield face down as a 2/2 creature with ward {2}. Turn it face up any time for its mana cost if it's a creature card.)","colors":["U"],"colorIdentity":["U"],"keywords":["Cloak"],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f4c9ebe-996a-44ae-9f97-46f0e8096da4.jpg?1783910927","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f4c9ebe-996a-44ae-9f97-46f0e8096da4.jpg?1783910927","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const expose = (): CardDef => ({"oracleId":"4f7e4aff-ef68-44fe-a0dc-b9ab0ecd7146","name":"Expose the Culprit","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one or both —\n• Turn target face-down creature face up.\n• Exile any number of face-up creatures you control with disguise in a face-down pile, shuffle that pile, then cloak them. (To cloak a card, put it onto the battlefield face down as a 2/2 creature with ward {2}. Turn it face up any time for its mana cost if it's a creature card.)","colors":["R"],"colorIdentity":["R"],"keywords":["Cloak"],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/31aadd3d-5ce1-44ba-ac6d-b192a9ea491b.jpg?1783912881","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/31aadd3d-5ce1-44ba-ac6d-b192a9ea491b.jpg?1783912881","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const assailant = (): CardDef => ({"oracleId":"57eba48e-87bd-4b54-8635-7348020f2ba4","name":"Alley Assailant","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Vampire Rogue","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Rogue"],"oracleText":"This creature enters tapped.\nDisguise {4}{B}{B} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhen this creature is turned face up, target opponent loses 3 life and you gain 3 life.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/edf238c9-61de-4f3a-b82f-05af46e5e81b.jpg?1783912903","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/edf238c9-61de-4f3a-b82f-05af46e5e81b.jpg?1783912903","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const humility = (): CardDef => ({"oracleId":"ed7bdb3e-5c51-4547-9266-76a791e0b2b0","name":"Humility","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"All creatures lose all abilities and have base power and toughness 1/1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a2fb7128-806b-4148-80fe-eb967f248021.jpg?1783946664","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a2fb7128-806b-4148-80fe-eb967f248021.jpg?1783946664","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":true}) as CardDef;
const rowan = (): CardDef => ({"oracleId":"e191976c-6ab1-4a23-aeb8-8a88bd4bd203","name":"Rowan Kenrith","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Planeswalker — Rowan","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Rowan"],"oracleText":"+2: During target player's next turn, each creature that player controls attacks if able.\n−2: Rowan Kenrith deals 3 damage to each tapped creature target player controls.\n−8: Target player gets an emblem with \"Whenever you activate an ability that isn't a mana ability, copy it. You may choose new targets for the copy.\"\nPartner with Will Kenrith\nRowan Kenrith can be your commander.","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Partner with","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/41d7ff4b-c454-4282-ab7c-438e22bbb779.jpg?1783934783","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/41d7ff4b-c454-4282-ab7c-438e22bbb779.jpg?1783934783","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass, and let bots answer every other choice, until the stack and trigger queue are empty; `answer` gives the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | Action[] | undefined) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) for (const a of Array.isArray(mine) ? mine : [mine]) s = act(s, a);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** A card of `pid`'s moved to `zone` (library: on top). */
function put(s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "library" | "exile" | "graveyard") {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
/**
 * On to \`pid\`'s declare attackers step on a later turn (\`afterTurn\`), no one attacking or blocking on the way and other
 * questions answered as bots.
 */
function toAttackStep(s: GameState, pid: PlayerId, afterTurn: number) {
  for (let i = 0; i < 4000; i++) {
    const p = s.pending;
    if (p?.kind === "declareAttackers" && p.player === pid && s.turn > afterTurn) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, p.count) });
    else if (p) s = act(s, botActions(s, who)[0]!);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error("never reached that attack step");
}
const opponentsOf = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const faceDown = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.faceDown && s.objects[id]!.controller === pid);

describe("round 391", () => {
  it("Ghastly Conscription, Become Anonymous and Expose the Culprit are fully supported", () => {
    for (const d of [ghastly(), anon(), expose()]) expect(isFullySupported(d), d.name).toBe(true);
  });

  describe("Ghastly Conscription", () => {
    it("manifests every creature card from the target player's graveyard under your control; the rest stay", () => {
      const { s: s0, ap, ids } = setup([ghastly()]);
      const [b] = opponentsOf(s0, ap);
      const bear = put(s0, b!, bears(), "graveyard");
      const craw = put(s0, b!, wurm(), "graveyard");
      const zap = put(s0, b!, bolt(), "graveyard");
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: b! }]));
      s = settle(s);
      for (const id of [bear, craw]) {
        const o = s.objects[id]!;
        expect(o.zone).toBe("battlefield");
        expect(o.faceDown).toBe("manifest");
        expect(o.controller).toBe(ap);
        expect(o.owner).toBe(b);
        expect(o.tapped).toBe(false);
        const c = characteristics(s, o);
        expect([c.power, c.toughness]).toEqual([2, 2]);
        expect(c.types).toEqual(["Creature"]);
        expect(c.colors).toEqual([]);
      }
      expect(s.objects[zap]!.zone).toBe("graveyard");
      expect(s.players[b!]!.graveyard).toEqual([zap]);
      expect(faceDown(s, ap).length).toBe(2);
      // A manifested creature card can be turned face up for its mana cost (CR 701.40b).
      expect(faceUpWays(s, s.objects[craw]!).map((w) => w.cost)).toEqual(["{4}{G}{G}"]);
      // The log names the cards exiled (they were public in the graveyard), not which face-down creature is which.
      const line = s.log.find((l) => l.text.includes("face-down pile"))!.text;
      expect(line).toContain("Grizzly Bears");
      expect(s.log.some((l) => /manifests 2 cards/.test(l.text))).toBe(true);
    });

    it("can target your own graveyard; with no creature cards there it manifests nothing", () => {
      const { s: s0, ap, ids } = setup([ghastly()]);
      const mine = put(s0, ap, bears(), "graveyard");
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
      s = settle(s);
      expect(s.objects[mine]!.zone).toBe("battlefield");
      expect(s.objects[mine]!.faceDown).toBe("manifest");

      const t = setup([ghastly()]);
      const [b] = opponentsOf(t.s, t.ap);
      const zap = put(t.s, b!, bolt(), "graveyard");
      let u = run(t.s, planCast(t.s, t.ap, t.ids[0]!, [{ kind: "player", id: b! }]));
      u = settle(u);
      expect(faceDown(u, t.ap)).toEqual([]);
      expect(u.objects[zap]!.zone).toBe("graveyard");
    });

    it("bots target the player with the most creature cards in their graveyard", () => {
      const { s: s0, ap, ids } = setup([ghastly()]);
      const [b, c] = opponentsOf(s0, ap);
      put(s0, b!, bears(), "graveyard");
      for (let i = 0; i < 3; i++) put(s0, c!, wurm(), "graveyard");
      // Bots cast it from their own main phase (their only spell).
      s0.players[ap]!.hand = [ids[0]!];
      const acts = botActions(s0, ap);
      const castIt = acts.find((a) => a.type === "castSpell" && a.objectId === ids[0]) as Extract<Action, { type: "castSpell" }> | undefined;
      expect(castIt).toBeDefined();
      expect(castIt!.targets).toEqual([{ kind: "player", id: c }]);
    });
  });

  describe("Become Anonymous", () => {
    it("exiles the creature and your top two cards, then cloaks all three under your control, tapped, each a 2/2 with ward {2}", () => {
      const { s: s0, ap, ids } = setup([anon()]);
      const bear = putOnBattlefield(s0, ap, bears());
      const top1 = put(s0, ap, wurm(), "library");
      const top2 = put(s0, ap, bolt(), "library");
      const libBefore = s0.players[ap]!.library.length;
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bear }]));
      s = settle(s);
      for (const id of [bear, top1, top2]) {
        const o = s.objects[id]!;
        expect(o.zone).toBe("battlefield");
        expect(o.faceDown).toBe("cloak");
        expect(o.controller).toBe(ap);
        expect(o.tapped).toBe(true);
        const c = characteristics(s, o);
        expect([c.power, c.toughness]).toEqual([2, 2]);
        expect(objHasKeyword(s, o, "Ward")).toBe(true);
      }
      expect(s.players[ap]!.library.length).toBe(libBefore - 2);
      // The Bears is a new object (CR 400.7) and the Bolt, an instant card, can't be turned face up (rulings).
      expect(faceUpWays(s, s.objects[bear]!).map((w) => w.cost)).toEqual(["{1}{G}"]);
      expect(faceUpWays(s, s.objects[top2]!)).toEqual([]);
      expect(s.log.some((l) => /cloaks 3 cards/.test(l.text) && l.text.includes("tapped"))).toBe(true);
    });

    it("can target a creature you own that an opponent controls; the cloaked cards are yours to control", () => {
      const { s: s0, ap, ids } = setup([anon()]);
      const [b] = opponentsOf(s0, ap);
      const bear = putOnBattlefield(s0, ap, bears());
      s0.objects[bear]!.controller = b!;
      const theirs = putOnBattlefield(s0, b!, wurm());
      invalidateCharacteristics(s0);
      // Their own Craw Wurm isn't a legal target (you don't own it).
      expect(planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }])).toBeNull();
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bear }]));
      s = settle(s);
      expect(s.objects[bear]!.faceDown).toBe("cloak");
      expect(s.objects[bear]!.controller).toBe(ap);
      expect(faceDown(s, ap).length).toBe(3);
    });

    it("with its target gone, it doesn't resolve: nothing is exiled from the library", () => {
      const { s: s0, ap, ids } = setup([anon()]);
      const bear = putOnBattlefield(s0, ap, bears());
      const libBefore = [...s0.players[ap]!.library];
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bear }]));
      moveObject(s, bear, "graveyard");
      invalidateCharacteristics(s);
      s = settle(s);
      expect(s.players[ap]!.library).toEqual(libBefore);
      expect(faceDown(s, ap)).toEqual([]);
    });

    it("with one card in the library, only it and the creature are cloaked", () => {
      const { s: s0, ap, ids } = setup([anon()]);
      const bear = putOnBattlefield(s0, ap, bears());
      for (const id of s0.players[ap]!.library) delete s0.objects[id];
      s0.players[ap]!.library = [];
      const last = put(s0, ap, wurm(), "library");
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bear }]));
      s = settle(s);
      expect(faceDown(s, ap).sort()).toEqual([bear, last].sort());
    });
  });

  describe("Expose the Culprit", () => {
    const face = (s: GameState, id: string, kind: "disguise") => {
      s.objects[id]!.faceDown = kind;
      invalidateCharacteristics(s);
    };

    it("its second mode offers only face-up creatures you control with disguise; those chosen are cloaked, untapped", () => {
      const { s: s0, ap, ids } = setup([expose()]);
      const [b] = opponentsOf(s0, ap);
      const a1 = putOnBattlefield(s0, ap, assailant());
      const a2 = putOnBattlefield(s0, ap, assailant());
      s0.objects[a2]!.tapped = true;
      const bear = putOnBattlefield(s0, ap, bears());
      const theirs = putOnBattlefield(s0, b!, assailant());
      const hidden = putOnBattlefield(s0, ap, assailant());
      face(s0, hidden, "disguise");
      let offered: string[] = [];
      let s = run(s0, planCast(s0, ap, ids[0]!, [], [1]));
      s = settle(s, (x) => {
        const p = x.pending;
        if (p?.kind === "pickPermanents" && p.player === ap) {
          offered = [...p.options];
          expect(p.min).toBe(0);
          return { type: "pickPermanents", player: ap, ids: [a2] };
        }
        return undefined;
      });
      expect(offered.sort()).toEqual([a1, a2].sort());
      expect(s.objects[a2]!.faceDown).toBe("cloak");
      expect(s.objects[a2]!.tapped).toBe(false);
      expect(s.objects[a1]!.faceDown).toBeUndefined();
      expect(s.objects[bear]!.faceDown).toBeUndefined();
      expect(s.objects[theirs]!.faceDown).toBeUndefined();
      // Cloaked, it can be turned face up for its disguise cost or its mana cost (CR 701.58c-d).
      expect(faceUpWays(s, s.objects[a2]!).map((w) => w.cost).sort()).toEqual(["{2}{B}", "{4}{B}{B}"].sort());
    });

    it("choosing none cloaks nothing", () => {
      const { s: s0, ap, ids } = setup([expose()]);
      const a1 = putOnBattlefield(s0, ap, assailant());
      let s = run(s0, planCast(s0, ap, ids[0]!, [], [1]));
      s = settle(s, (x) => (x.pending?.kind === "pickPermanents" && x.pending.player === ap ? { type: "pickPermanents", player: ap, ids: [] } : undefined));
      expect(s.objects[a1]!.faceDown).toBeUndefined();
      expect(s.objects[a1]!.zone).toBe("battlefield");
    });

    it("with both modes, the creature the first turns face up can be cloaked by the second", () => {
      const { s: s0, ap, ids } = setup([expose()]);
      const hidden = putOnBattlefield(s0, ap, assailant());
      face(s0, hidden, "disguise");
      let offered: string[] = [];
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: hidden }], [0, 1]));
      s = settle(s, (x) => {
        const p = x.pending;
        if (p?.kind === "pickPermanents" && p.player === ap) {
          offered = [...p.options];
          return { type: "pickPermanents", player: ap, ids: [hidden] };
        }
        return undefined;
      });
      expect(offered).toEqual([hidden]);
      // Turned face up (its "When this creature is turned face up" trigger fired), then cloaked again.
      expect(s.log.some((l) => /turns a face-down permanent of .* face up: it's Alley Assailant/.test(l.text))).toBe(true);
      expect(s.log.some((l) => /Alley Assailant's ability triggers/.test(l.text))).toBe(true);
      expect(s.objects[hidden]!.faceDown).toBe("cloak");
    });

    it("a creature that lost its abilities has no disguise, so it isn't offered", () => {
      const { s: s0, ap, ids } = setup([expose()]);
      const a1 = putOnBattlefield(s0, ap, assailant());
      putOnBattlefield(s0, ap, humility());
      let asked = false;
      let s = run(s0, planCast(s0, ap, ids[0]!, [], [1]));
      s = settle(s, (x) => {
        if (x.pending?.kind === "pickPermanents" && x.pending.player === ap) asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
      expect(s.objects[a1]!.faceDown).toBeUndefined();
    });

    it("bots cloak again only disguise creatures with no counters and nothing attached", () => {
      const { s: s0, ap, ids } = setup([expose()]);
      const a1 = putOnBattlefield(s0, ap, assailant());
      const a2 = putOnBattlefield(s0, ap, assailant());
      s0.objects[a2]!.counters = { "+1/+1": 1 };
      invalidateCharacteristics(s0);
      let s = run(s0, planCast(s0, ap, ids[0]!, [], [1]));
      s = settle(s);
      expect(s.objects[a1]!.faceDown).toBe("cloak");
      expect(s.objects[a2]!.faceDown).toBeUndefined();
    });
  });

  describe("Rowan Kenrith", () => {
    /** Rowan on the battlefield with that much loyalty, a Bear for the next player. */
    const ready = (loyalty: number) => {
      const { s, ap } = setup([]);
      const [b, c] = opponentsOf(s, ap);
      const rk = putOnBattlefield(s, ap, rowan());
      s.objects[rk]!.counters.loyalty = loyalty;
      const bear = putOnBattlefield(s, b!, bears());
      invalidateCharacteristics(s);
      return { s, ap, b: b!, c: c!, rk, bear };
    };

    it("is fully supported", () => {
      expect(isFullySupported(rowan())).toBe(true);
    });

    it("+2: during the target player's next turn, each creature they control attacks if able, one that came later too, anyone it likes", () => {
      const r = ready(4);
      let s = run(r.s, planActivate(r.s, r.ap, r.rk, 0, [{ kind: "player", id: r.b }]));
      s = settle(s);
      expect(s.objects[r.rk]!.counters.loyalty).toBe(6);
      expect(s.log.some((l) => /During B's next turn, each creature they control attacks if able|each creature they control attacks if able/.test(l.text))).toBe(true);
      s = passUntil(s, "main1", r.b);
      // A creature that comes under their control during that turn has to attack too (a rule, CR 611.2c).
      const late = putOnBattlefield(s, r.b, wurm());
      invalidateCharacteristics(s);
      s = passUntil(s, "declareAttackers", r.b);
      expect(s.pending).toMatchObject({ kind: "declareAttackers", player: r.b });
      expect(() => act(s, { type: "declareAttackers", player: r.b, attacks: [] })).toThrow();
      expect(() => act(s, { type: "declareAttackers", player: r.b, attacks: [{ attacker: r.bear, defender: r.c }] })).toThrow();
      // Summoning sick, the Craw Wurm can't attack, so it isn't required to (CR 508.1d); the Bear may attack anyone.
      s.objects[late]!.controlledSinceTurn = -1;
      invalidateCharacteristics(s);
      expect(() => act(s, { type: "declareAttackers", player: r.b, attacks: [{ attacker: r.bear, defender: r.c }] })).toThrow();
      expect(() => act(s, { type: "declareAttackers", player: r.b, attacks: [{ attacker: r.bear, defender: r.c }, { attacker: late, defender: r.ap }] })).not.toThrow();
    });

    it("+2: a summoning-sick creature needn't attack; the requirement is over after that turn", () => {
      const r = ready(4);
      let s = run(r.s, planActivate(r.s, r.ap, r.rk, 0, [{ kind: "player", id: r.b }]));
      s = settle(s);
      s = passUntil(s, "main1", r.b);
      putOnBattlefield(s, r.b, wurm(), { sick: true });
      invalidateCharacteristics(s);
      s = passUntil(s, "declareAttackers", r.b);
      expect(s.pending).toMatchObject({ kind: "declareAttackers", player: r.b });
      const turn = s.turn;
      s = act(s, { type: "declareAttackers", player: r.b, attacks: [{ attacker: r.bear, defender: r.ap }] });
      // B's next turn after that: no requirement any more.
      s = toAttackStep(s, r.b, turn);
      expect(s.activePlayer).toBe(r.b);
      expect(() => act(s, { type: "declareAttackers", player: r.b, attacks: [] })).not.toThrow();
    });

    it("+2 on yourself: not this turn, your next one", () => {
      const r = ready(4);
      const mine = putOnBattlefield(r.s, r.ap, bears());
      invalidateCharacteristics(r.s);
      let s = run(r.s, planActivate(r.s, r.ap, r.rk, 0, [{ kind: "player", id: r.ap }]));
      s = settle(s);
      s = passUntil(s, "declareAttackers", r.ap);
      expect(s.turn).toBe(r.s.turn);
      expect(s.pending).toMatchObject({ kind: "declareAttackers", player: r.ap });
      expect(() => act(s, { type: "declareAttackers", player: r.ap, attacks: [] })).not.toThrow();
      const turn = s.turn;
      s = act(s, { type: "declareAttackers", player: r.ap, attacks: [] });
      s = toAttackStep(s, r.ap, turn);
      expect(s.activePlayer).toBe(r.ap);
      expect(() => act(s, { type: "declareAttackers", player: r.ap, attacks: [] })).toThrow();
      expect(() => act(s, { type: "declareAttackers", player: r.ap, attacks: [{ attacker: mine, defender: r.b }] })).not.toThrow();
    });

    it("bots aim +2 at the opponent with the most creatures, never themselves, and −8 at themselves", () => {
      for (const loyalty of [4, 8]) {
        const r = ready(loyalty);
        putOnBattlefield(r.s, r.c, bears());
        putOnBattlefield(r.s, r.c, wurm());
        invalidateCharacteristics(r.s);
        r.s.players[r.ap]!.hand = [];
        r.s.players[r.ap]!.command = [];
        const a = botActions(r.s, r.ap).find((x) => x.type === "activateAbility" && x.objectId === r.rk) as Extract<Action, { type: "activateAbility" }> | undefined;
        expect(a?.index).toBe(loyalty === 8 ? 2 : 0);
        expect(a?.targets).toEqual([{ kind: "player", id: loyalty === 8 ? r.ap : r.c }]);
      }
    });

    it("−8: the target player's emblem copies each ability they activate that isn't a mana ability, not mana abilities or other players'", () => {
      const r = ready(8);
      const pyro = putOnBattlefield(r.s, r.ap, pyromancer());
      const elf = putOnBattlefield(r.s, r.ap, elves());
      const theirs = putOnBattlefield(r.s, r.b, pyromancer());
      invalidateCharacteristics(r.s);
      let s = run(r.s, planActivate(r.s, r.ap, r.rk, 2, [{ kind: "player", id: r.ap }]));
      s = settle(s);
      const emblems = (s.emblems ?? []).filter((id) => s.objects[id]!.owner === r.ap);
      expect(emblems.length).toBe(1);
      // Rowan with 0 loyalty is put into its owner's graveyard (CR 704.5i).
      expect(s.objects[r.rk]!.zone).not.toBe("battlefield");
      const life = s.players[r.b]!.life;
      s = run(s, planActivate(s, r.ap, pyro, 0, [{ kind: "player", id: r.b }]));
      // The copy's trigger is on the stack above the ability (CR 707.10).
      expect(s.stack.length + s.triggerQueue.length).toBeGreaterThanOrEqual(1);
      s = settle(s);
      expect(s.players[r.b]!.life).toBe(life - 2);
      expect(s.log.some((l) => /copies|copy/i.test(l.text))).toBe(true);
      // A mana ability doesn't trigger it.
      const stackBefore = s.stack.length;
      s = act(s, { type: "activateMana", player: r.ap, objectId: elf, mana: "G" });
      expect(s.players[r.ap]!.manaPool.G).toBe(1);
      expect(s.stack.length).toBe(stackBefore);
      expect(s.triggerQueue.length).toBe(0);
      // Another player's activation doesn't either.
      s.priority = r.b;
      const myLife = s.players[r.ap]!.life;
      s = act(s, { type: "activateAbility", player: r.b, objectId: theirs, index: 0, targets: [{ kind: "player", id: r.ap }] } as Action);
      s = settle(s);
      expect(s.players[r.ap]!.life).toBe(myLife - 1);
    });
  });
});
