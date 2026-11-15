// Lane B round B219: Dreamshaper Shaman (pay {2}{R} and sacrifice a nonland permanent at your end step to reveal until a
// nonland permanent card and put it onto the battlefield), Song of Inspiration (a d20 plus the total mana value of up to two
// target permanent cards; them back to hand, and life on 15+), Garruk, Curse Breaker's −4 (until your next turn, creatures
// attacking one of your opponents get +2/+2 and trample) and Trove of Temptation (each opponent must attack you or a
// planeswalker you control with at least one creature if able, weighed with goad, CR 508.1d).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const dreamshaper = (): CardDef => ({"oracleId":"d06ef178-f02a-45a4-8193-140dee52c99d","name":"Dreamshaper Shaman","manaCost":"{5}{R}","cmc":6,"typeLine":"Enchantment Creature — Minotaur Shaman","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Minotaur","Shaman"],"oracleText":"At the beginning of your end step, you may pay {2}{R} and sacrifice a nonland permanent. If you do, reveal cards from the top of your library until you reveal a nonland permanent card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f6b04ec8-68c9-468c-b137-707db994af68.jpg?1783931556","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f6b04ec8-68c9-468c-b137-707db994af68.jpg?1783931556","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const song = (): CardDef => ({"oracleId":"bdb80d7b-672c-4e2a-b93b-9b96721b93f2","name":"Song of Inspiration","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose up to two target permanent cards in your graveyard. Roll a d20 and add the total mana value of those cards.\n1—14 | Return those cards to your hand.\n15+ | Return those cards to your hand. You gain life equal to their total mana value.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a231a41f-1609-420f-9a9b-3c8358591da1.jpg?1783926242","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a231a41f-1609-420f-9a9b-3c8358591da1.jpg?1783926242","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const garruk = (): CardDef => ({"oracleId":"184d4672-05a9-4182-8b3f-3561fb33ed62","name":"Garruk, Curse Breaker","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Legendary Planeswalker — Garruk","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Garruk"],"oracleText":"Whenever a creature you control with power 4 or greater enters, draw a card.\n+2: Untap up to two target lands.\n−3: Create a 4/4 green Beast creature token with trample.\n−4: Until your next turn, whenever one or more creatures attack one of your opponents, those creatures get +2/+2 and gain trample until end of turn.","loyalty":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/90ca5812-ceb5-46bd-b049-aed7ff10e6af.jpg?1788329370","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/90ca5812-ceb5-46bd-b049-aed7ff10e6af.jpg?1788329370","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const trove = (): CardDef => ({"oracleId":"f624c0f1-1c09-4b7a-b140-11329f27e3c7","name":"Trove of Temptation","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each opponent must attack you or a planeswalker you control with at least one creature each combat if able.\nAt the beginning of your end step, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fb2df914-bb56-449e-9ef8-8b1012a76f64.jpg?1783935733","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fb2df914-bb56-449e-9ef8-8b1012a76f64.jpg?1783935733","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const impetus = (): CardDef => ({"oracleId":"dbb8a3d9-6b1b-4ad1-b8b9-f92ead03d1d9","name":"Coercive Impetus","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you draw a card and lose 1 life.","colors":["B"],"colorIdentity":["B"],"keywords":["Goad","Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/f/9/f98ca390-d2ea-41c8-93ed-57fcd22737d8.jpg?1783903858","artUrl":"https://cards.scryfall.io/art_crop/front/f/9/f98ca390-d2ea-41c8-93ed-57fcd22737d8.jpg?1783903858","commanderLegal":"legal","set":"soc","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const arbiter = (): CardDef => ({"oracleId":"1cdf30de-d88c-421a-80df-4917bbd2f09e","name":"Silent Arbiter","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"No more than one creature can attack each combat.\nNo more than one creature can block each combat.","power":"1","toughness":"5","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65229ebf-da43-476b-9e9d-8cc0102a24c3.jpg?1783944374","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65229ebf-da43-476b-9e9d-8cc0102a24c3.jpg?1783944374","commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const card = (id: string): TargetChoice => ({ kind: "object", id });
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard", top = false) => {
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
/** The other players, in turn order after `pid`. */
const others = (s: GameState, pid: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(pid) + i) % 4]!);

describe("Lane B round B219", () => {
  it("compiles all four cards", () => {
    supported(dreamshaper(), song(), garruk(), trove());
  });

  describe("Dreamshaper Shaman", () => {
    /** At `ap`'s end step with the trigger asking, and {2}{R} in the pool. */
    const toEndStep = (s0: GameState, ap: PlayerId) => {
      let s = passUntil(s0, "end", ap);
      for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}{R}" } });
      s.players[ap]!.manaPool.R += 3;
      return s;
    };

    it("pays {2}{R}, sacrifices itself and puts the first nonland permanent card revealed onto the battlefield", () => {
      let { s, ap } = setup([]);
      const shaman = putOnBattlefield(s, ap, dreamshaper());
      const giant = toZone(s, ap, hillGiant(), "library", true);
      const div = toZone(s, ap, divination(), "library", true);
      const land = toZone(s, ap, { ...hillGiant(), oracleId: "test-forest", name: "Forest", typeLine: "Basic Land — Forest", types: ["Land"], subtypes: ["Forest"], supertypes: ["Basic"], manaCost: "", cmc: 0, power: undefined, toughness: undefined, oracleText: "({T}: Add {G}.)" } as CardDef, "library", true);
      s = toEndStep(s, ap);
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [shaman] });
      s = settle(s, [ap]);
      expect(zone(s, shaman)).toBe("graveyard");
      expect(zone(s, giant)).toBe("battlefield");
      expect(s.objects[giant]!.controller).toBe(ap);
      // The other revealed cards go on the bottom (in a random order).
      const lib = s.players[ap]!.library;
      expect(lib.slice(-2).sort()).toEqual([div, land].sort());
      expect(s.players[ap]!.manaPool.R).toBe(0);
    });

    it("an Aura revealed enchants a creature as it enters (CR 303.4f)", () => {
      let { s, ap, opp } = setup([]);
      const shaman = putOnBattlefield(s, ap, dreamshaper());
      const other = putOnBattlefield(s, ap, ornithopter());
      const theirs = putOnBattlefield(s, opp, hillGiant());
      const aura = toZone(s, ap, pacifism(), "library", true);
      s = toEndStep(s, ap);
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [other] });
      for (let i = 0; i < 40 && s.pending?.kind !== "chooseOption" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      // The Aura's controller chooses what it enchants: the Shaman or the opponent's Hill Giant.
      if (s.pending?.kind === "chooseOption") {
        expect(s.pending.options).toEqual(expect.arrayContaining([shaman, theirs]));
        s = act(s, { type: "chooseOption", player: ap, choice: theirs });
      }
      s = settle(s, [ap]);
      expect(zone(s, other)).toBe("graveyard");
      expect(zone(s, aura)).toBe("battlefield");
      expect(s.objects[aura]!.attachedTo).toBe(theirs);
    });

    it("declined, nothing is paid, sacrificed or revealed", () => {
      let { s, ap } = setup([]);
      const shaman = putOnBattlefield(s, ap, dreamshaper());
      const giant = toZone(s, ap, hillGiant(), "library", true);
      s = toEndStep(s, ap);
      s = act(s, { type: "chooseMay", player: ap, yes: false });
      s = settle(s, [ap]);
      expect(zone(s, shaman)).toBe("battlefield");
      expect(s.players[ap]!.library[0]).toBe(giant);
      expect(s.players[ap]!.manaPool.R).toBe(3);
    });
  });

  describe("Song of Inspiration", () => {
    /** Casts Song at Hill Giant (4) and Craw Wurm (6) in the graveyard with seed `seed`; the roll's natural result too. */
    const sing = (seed: number, gone = false) => {
      let { s, ap, ids } = setup([song()], seed);
      const giant = toZone(s, ap, hillGiant(), "graveyard");
      const wurm = toZone(s, ap, crawWurm(), "graveyard");
      const life = s.players[ap]!.life;
      s = run(s, planCast(s, ap, ids[0]!, [card(giant), card(wurm)]));
      // A target that has left the graveyard is illegal: it adds nothing (CR 608.2b).
      if (gone) {
        const p = s.players[ap]!;
        p.graveyard.splice(p.graveyard.indexOf(wurm), 1);
        s.objects[wurm]!.zone = "exile";
        p.exile.push(wurm);
      }
      s = settle(s, [ap]);
      const line = s.log.map((l) => l.text).find((t) => /rolls a d20 for Song of Inspiration/.test(t))!;
      const m = /: (\d+) \+ (\d+) = (\d+)/.exec(line)!;
      return { s, ap, giant, wurm, gained: s.players[ap]!.life - life, natural: Number(m[1]), added: Number(m[2]), total: Number(m[3]) };
    };

    it("adds the total mana value of the targets to the roll; 15+ also gains that much life", () => {
      const seen = new Set<boolean>();
      for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
        const r = sing(seed);
        expect(r.added).toBe(10);
        expect(r.total).toBe(r.natural + 10);
        expect(zone(r.s, r.giant)).toBe("hand");
        expect(zone(r.s, r.wurm)).toBe("hand");
        expect(r.gained).toBe(r.total >= 15 ? 10 : 0);
        seen.add(r.total >= 15);
      }
      expect(seen.size).toBe(2);
    });

    it("an illegal target adds no mana value and isn't returned (CR 608.2b)", () => {
      for (let seed = 1; seed <= 6; seed++) {
        const r = sing(seed, true);
        expect(r.added).toBe(4);
        expect(zone(r.s, r.giant)).toBe("hand");
        expect(zone(r.s, r.wurm)).toBe("exile");
        expect(r.gained).toBe(r.total >= 15 ? 4 : 0);
      }
    });
  });

  describe("Garruk, Curse Breaker's −4", () => {
    const minusFour = () => {
      let { s, ap } = setup([]);
      const g = putOnBattlefield(s, ap, garruk());
      s.objects[g]!.counters.loyalty = 5;
      invalidateCharacteristics(s);
      s = settle(run(s, planActivate(s, ap, g, 2)), [ap]);
      expect(s.objects[g]!.counters.loyalty).toBe(1);
      return { s, ap, g };
    };

    it("until your next turn, creatures attacking one of your opponents get +2/+2 and trample, once for each opponent attacked", () => {
      let { s, ap } = minusFour();
      const [b, c, d] = others(s, ap) as [PlayerId, PlayerId, PlayerId];
      const atC = putOnBattlefield(s, b, bear());
      const atD = putOnBattlefield(s, b, bear());
      const atMe = putOnBattlefield(s, b, bear());
      s = passUntil(s, "declareAttackers", b);
      s = act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: atC, defender: c }, { attacker: atD, defender: d }, { attacker: atMe, defender: ap }] });
      const queued = s.triggerQueue.length + s.stack.length;
      expect(queued).toBe(2);
      s = settle(s, [ap]);
      expect(pt(s, atC)).toBe("4/4");
      expect(pt(s, atD)).toBe("4/4");
      expect(objHasKeyword(s, s.objects[atC]!, "Trample")).toBe(true);
      // Attacking Garruk's controller isn't attacking one of their opponents.
      expect(pt(s, atMe)).toBe("2/2");
    });

    it("lasts after Garruk is gone, and ends as its controller's next turn begins", () => {
      let { s, ap, g } = minusFour();
      const [b, c] = others(s, ap) as [PlayerId, PlayerId];
      s.battlefield.splice(s.battlefield.indexOf(g), 1);
      s.objects[g]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(g);
      invalidateCharacteristics(s);
      const x = putOnBattlefield(s, b, bear());
      s = passUntil(s, "declareAttackers", b);
      s = settle(act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: x, defender: c }] }), [ap]);
      expect(pt(s, x)).toBe("4/4");
      // Garruk's controller's own next turn: over.
      s = passUntil(s, "main1", ap);
      const mine = putOnBattlefield(s, ap, bear());
      s = passUntil(s, "declareAttackers", ap);
      s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: b }] }), [ap]);
      expect(pt(s, mine)).toBe("2/2");
    });
  });

  describe("Trove of Temptation", () => {
    /** Trove for `ap`; the next player `b` about to declare attackers. */
    const troveFor = () => {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, trove());
      const [b, c, d] = others(s0, ap) as [PlayerId, PlayerId, PlayerId];
      return { s0, ap, b, c, d };
    };
    const declare = (s: GameState, pid: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => act(s, { type: "declareAttackers", player: pid, attacks });

    it("an opponent must attack you or a planeswalker you control with at least one creature if able", () => {
      const { s0, ap, b, c } = troveFor();
      const x = putOnBattlefield(s0, b, bear());
      const y = putOnBattlefield(s0, b, bear());
      const walker = putOnBattlefield(s0, ap, jace());
      s0.objects[walker]!.counters.loyalty = 3;
      invalidateCharacteristics(s0);
      const s = passUntil(s0, "declareAttackers", b);
      expect(() => declare(s, b, [])).toThrow(/must attack .* with at least one creature/);
      expect(() => declare(s, b, [{ attacker: x, defender: c }])).toThrow(/must attack/);
      // One creature in all is enough; the rest attack anyone, or stay home (rulings).
      expect(() => declare(s, b, [{ attacker: x, defender: ap }, { attacker: y, defender: c }])).not.toThrow();
      expect(() => declare(s, b, [{ attacker: x, defender: ap }])).not.toThrow();
      expect(() => declare(s, b, [{ attacker: x, defender: ap, planeswalker: walker }])).not.toThrow();
    });

    it("no requirement when no creature can attack that player, and none on Trove's controller", () => {
      const { s0, ap, b, c } = troveFor();
      // Pacifism: that creature can't attack.
      const x = putOnBattlefield(s0, b, bear());
      const aura = putOnBattlefield(s0, c, pacifism());
      s0.objects[aura]!.attachedTo = x;
      // Trove's controller has a creature to attack with too.
      const mine = putOnBattlefield(s0, ap, bear());
      invalidateCharacteristics(s0);
      // Passing through that opponent's turn declares no attackers: nothing obliges any.
      expect(() => passUntil(s0, "end", b)).not.toThrow();
      const s = passUntil(s0, "declareAttackers", ap);
      expect(() => declare(s, ap, [])).not.toThrow();
      expect(() => declare(s, ap, [{ attacker: mine, defender: c }])).not.toThrow();
    });

    it("weighed with goad (CR 508.1d): goaded by Trove's controller, either attack obeys as many requirements", () => {
      const { s0, ap, b, c } = troveFor();
      const x = putOnBattlefield(s0, b, bear());
      // Coercive Impetus, controlled by Trove's controller, on that creature.
      const aura = putOnBattlefield(s0, ap, impetus());
      s0.objects[aura]!.attachedTo = x;
      invalidateCharacteristics(s0);
      const s = passUntil(s0, "declareAttackers", b);
      expect(() => declare(s, b, [{ attacker: x, defender: ap }])).not.toThrow();
      expect(() => declare(s, b, [{ attacker: x, defender: c }])).not.toThrow();
      expect(() => declare(s, b, [])).toThrow();
    });

    it("weighed with goad: goaded by another player, attacking Trove's controller obeys both", () => {
      const { s0, ap, b, c, d } = troveFor();
      const x = putOnBattlefield(s0, b, bear());
      const aura = putOnBattlefield(s0, c, impetus());
      s0.objects[aura]!.attachedTo = x;
      invalidateCharacteristics(s0);
      const s = passUntil(s0, "declareAttackers", b);
      expect(() => declare(s, b, [{ attacker: x, defender: ap }])).not.toThrow();
      expect(() => declare(s, b, [{ attacker: x, defender: d }])).toThrow(/must attack/);
      expect(() => declare(s, b, [{ attacker: x, defender: c }])).toThrow();
    });

    it("with only one attacker allowed (Silent Arbiter), a creature that has to attack may go elsewhere", () => {
      const { s0, ap, b, c } = troveFor();
      putOnBattlefield(s0, c, arbiter());
      const x = putOnBattlefield(s0, b, bear());
      const goaded = putOnBattlefield(s0, b, bear());
      const aura = putOnBattlefield(s0, c, impetus());
      s0.objects[aura]!.attachedTo = goaded;
      invalidateCharacteristics(s0);
      const s = passUntil(s0, "declareAttackers", b);
      // The goaded creature at Trove's controller obeys all three requirements; anything else obeys fewer.
      expect(() => declare(s, b, [{ attacker: goaded, defender: ap }])).not.toThrow();
      expect(() => declare(s, b, [{ attacker: x, defender: ap }])).toThrow(/instead of/);
      expect(() => declare(s, b, [{ attacker: goaded, defender: c }])).toThrow(/must attack/);
    });

    it("a bot obeys it, and Trove makes a Treasure at its controller's end step", () => {
      const { s0, ap, b } = troveFor();
      const x = putOnBattlefield(s0, b, bear());
      let s = passUntil(s0, "declareAttackers", b);
      const plan = botActions(s, b);
      const decl = plan.find((a) => a.type === "declareAttackers");
      expect(decl?.type === "declareAttackers" && decl.attacks.some((a) => a.attacker === x && a.defender === ap)).toBe(true);
      for (const a of plan) s = act(s, a);
      s = passUntil(s0, "end", ap);
      s = settle(s, [ap]);
      expect(s.battlefield.some((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name.startsWith("Treasure"))).toBe(true);
    });
  });
});
