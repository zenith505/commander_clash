// Lane B round B207: who puts a permanent onto the battlefield (GameObject.putter), for "Whenever a player puts ... onto
// the battlefield, ... that player": Tourach's Chant and Thelon's Chant (3 damage unless that player blights 1), Nature's
// Wrath (that player sacrifices an Island or blue permanent, a Swamp or black permanent), Overburden (that player returns
// a land they control to its owner's hand). And Delif's Cone and Delif's Cube: a delayed "when target creature you control
// attacks and isn't blocked" trigger made by an activated ability.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const tourach = (): CardDef => ({"oracleId":"bdf4e225-23b5-47d9-9936-ddcec8aa1ca4","name":"Tourach's Chant","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you pay {B}.\nWhenever a player puts a Forest onto the battlefield, this enchantment deals 3 damage to that player unless they put a -1/-1 counter on a creature they control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/06883fd2-eccd-47c6-8c34-10d95e923685.jpg?1783947899","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/06883fd2-eccd-47c6-8c34-10d95e923685.jpg?1783947899","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thelon = (): CardDef => ({"oracleId":"ff4ccf8d-7d3d-4a44-a9ab-6bc88e90d6a7","name":"Thelon's Chant","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you pay {G}.\nWhenever a player puts a Swamp onto the battlefield, this enchantment deals 3 damage to that player unless the player puts a -1/-1 counter on a creature they control.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d970195-0a09-4cb4-a2c0-c16fcab5c859.jpg?1783947884","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d970195-0a09-4cb4-a2c0-c16fcab5c859.jpg?1783947884","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wrath = (): CardDef => ({"oracleId":"5a647f28-6e26-4262-8593-d582e0a691f7","name":"Nature's Wrath","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you pay {G}.\nWhenever a player puts an Island or blue permanent onto the battlefield, that player sacrifices an Island or blue permanent of their choice.\nWhenever a player puts a Swamp or black permanent onto the battlefield, that player sacrifices a Swamp or black permanent of their choice.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/450759f0-5d60-4f05-9011-b0b66dbb06a7.jpg?1783947169","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/450759f0-5d60-4f05-9011-b0b66dbb06a7.jpg?1783947169","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const overburden = (): CardDef => ({"oracleId":"8104e454-77f5-4d38-894e-41ed0d74c17c","name":"Overburden","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player puts a nontoken creature onto the battlefield, that player returns a land they control to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7e6cf6b6-b4c1-4742-9be4-b3b15fbb0202.jpg?1783945791","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7e6cf6b6-b4c1-4742-9be4-b3b15fbb0202.jpg?1783945791","commanderLegal":"legal","set":"pcy","releasedAt":"2000-06-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const path = (): CardDef => ({"oracleId":"d683d985-9888-4d21-8b5f-69e69ce4a03b","name":"Path to Exile","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95ca89ea-1200-4bb4-ae4b-af35d3ccd35b.jpg?1783903242","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95ca89ea-1200-4bb4-ae4b-af35d3ccd35b.jpg?1783903242","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const oring = (): CardDef => ({"oracleId":"bd9b9772-f5f9-4c6b-913e-7193bea5d0a7","name":"Oblivion Ring","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/895c270d-84d8-4c7f-9df3-5a595e113dd7.jpg?1783942580","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/895c270d-84d8-4c7f-9df3-5a595e113dd7.jpg?1783942580","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const usea = (): CardDef => ({"oracleId":"4b22be3a-8ce1-47d1-b82e-6c3ccfb0548b","name":"Underground Sea","manaCost":"","cmc":0,"typeLine":"Land — Island Swamp","supertypes":[],"types":["Land"],"subtypes":["Island","Swamp"],"oracleText":"({T}: Add {U} or {B}.)","colors":[],"colorIdentity":["B","U"],"keywords":[],"producedMana":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ff76ac86-8a8a-47fe-9388-8950ca3e26c3.jpg?1783948658","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ff76ac86-8a8a-47fe-9388-8950ca3e26c3.jpg?1783948658","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const alarm = (): CardDef => ({"oracleId":"5b2364d7-a811-4595-a1b4-224c70555ffa","name":"Raise the Alarm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const cone = (): CardDef => ({"oracleId":"8af33199-d3ad-44fe-8ee0-abbe36a2278b","name":"Delif's Cone","manaCost":"{0}","cmc":0,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Sacrifice this artifact: This turn, when target creature you control attacks and isn't blocked, you may gain life equal to its power. If you do, it assigns no combat damage this turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/262b8788-c5a0-4c8e-9d58-b769b1b0a2ff.jpg?1783947881","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/262b8788-c5a0-4c8e-9d58-b769b1b0a2ff.jpg?1783947881","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cube = (): CardDef => ({"oracleId":"3106ba15-08d7-474c-a384-6848b713ba8d","name":"Delif's Cube","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: This turn, when target creature you control attacks and isn't blocked, it assigns no combat damage this turn and you put a cube counter on this artifact.\n{2}, Remove a cube counter from this artifact: Regenerate target creature.","colors":[],"colorIdentity":[],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14749600-9eca-4122-b04f-30ddda091b74.jpg?1783947881","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14749600-9eca-4122-b04f-30ddda091b74.jpg?1783947881","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** A new card for `def` in `pid`'s hand or library (on top). */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these lands of `pid`'s stay on the battlefield (the test lands setup gives the active player go). */
const onlyLands = (s: GameState, pid: PlayerId, keep: ObjectId[] = []) => {
  s.battlefield = s.battlefield.filter((id) => keep.includes(id) || controllerOf(s, s.objects[id]!) !== pid || !s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
  invalidateCharacteristics(s);
};
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const ox = card("Test Ox", "Creature — Ox", "{1}{W}", { power: "2", toughness: "4" });
const forest = card("Forest", "Basic Land — Forest");
const swamp = card("Swamp", "Basic Land — Swamp");

describe("round B207 cards are supported", () => {
  it("compiles every line", () => supported(tourach(), thelon(), wrath(), overburden(), cone(), cube()));
});

describe("Tourach's Chant", () => {
  /** An opponent's Tourach's Chant; you play a Forest from your hand with `creatures` on your battlefield. */
  const playForest = (creatures: CardDef[]) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, tourach());
    const mine = creatures.map((c) => putOnBattlefield(s0, ap, c));
    const f = toZone(s0, ap, forest, "hand");
    const life = s0.players[ap]!.life;
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: f }));
    return { s, ap, opp, mine, f, life };
  };

  it("the player who played the Forest may blight 1 instead: a -1/-1 counter on their only creature, no damage", () => {
    const { s: s1, ap, mine, life } = playForest([ox]);
    expect(s1.pending).toMatchObject({ kind: "payUnless", player: ap, blight: 1 });
    const s = settle(act(s1, { type: "payUnless", player: ap, pay: true }));
    expect(s.objects[mine[0]!]!.counters["-1/-1"]).toBe(1);
    expect(s.players[ap]!.life).toBe(life);
  });

  it("with two creatures they choose which gets the counter", () => {
    const { s: s1, ap, mine, life } = playForest([ox, bear]);
    let s = act(s1, { type: "payUnless", player: ap, pay: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "counters", counter: "-1/-1" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine[1]!] }));
    expect(s.objects[mine[1]!]!.counters["-1/-1"]).toBe(1);
    expect(s.objects[mine[0]!]!.counters["-1/-1"]).toBeUndefined();
    expect(s.players[ap]!.life).toBe(life);
  });

  it("declining, the Chant deals 3 damage to that player", () => {
    const { s: s1, ap, mine, life } = playForest([ox]);
    const s = settle(act(s1, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[mine[0]!]!.counters["-1/-1"]).toBeUndefined();
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("with no creature there's no choice: 3 damage", () => {
    const { s, ap, opp, life } = playForest([]);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("a land that isn't a Forest doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, tourach());
    const sw = toZone(s0, ap, swamp, "hand");
    const life = s0.players[ap]!.life;
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: sw }));
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(s.players[ap]!.life).toBe(life);
  });
});

describe("Thelon's Chant", () => {
  it("Path to Exile's land is put onto the battlefield by the exiled creature's controller, who takes the damage", () => {
    const { s: s0, ap, opp, ids } = setup([path()]);
    putOnBattlefield(s0, ap, thelon());
    const b = putOnBattlefield(s0, opp, bear);
    const sw = toZone(s0, opp, swamp, "library");
    const [apLife, oppLife] = [s0.players[ap]!.life, s0.players[opp]!.life];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zoneOf(s, b)).toBe("exile");
    for (let i = 0; i < 5 && s.pending; i++) {
      const p = s.pending!;
      if (p.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: p.player, yes: true }));
      else if (p.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: p.player, found: [sw] }));
      else break;
    }
    expect(zoneOf(s, sw)).toBe("battlefield");
    expect(controllerOf(s, s.objects[sw]!)).toBe(opp);
    expect(s.objects[sw]!.putter).toBe(opp);
    // The opponent has no creature now, so no blight to offer: 3 damage to them, none to the Path's caster.
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBe(oppLife - 3);
    expect(s.players[ap]!.life).toBe(apLife);
  });
});

describe("Nature's Wrath", () => {
  it("an Underground Sea triggers both abilities: its player sacrifices it to the first, and has nothing left for the second", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, wrath());
    const sea = toZone(s0, ap, usea(), "hand");
    onlyLands(s0, ap);
    let s = act(s0, { type: "playLand", player: ap, objectId: sea });
    for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zoneOf(s, sea)).toBe("graveyard");
    expect(s.log.filter((l) => /sacrifices Underground Sea/.test(l.text ?? String(l))).length).toBe(1);
  });

  it("a blue creature an opponent casts: they sacrifice an Island or blue permanent of their choice, here their only Island", () => {
    const { s: s0, ap, opp, ids } = setup([card("Test Merfolk", "Creature — Merfolk", "{U}", { power: "1", toughness: "1", colors: ["U"] })]);
    putOnBattlefield(s0, opp, wrath());
    onlyLands(s0, ap);
    const isl = putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Their choice: the Island or the Merfolk itself (a blue permanent).
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [isl] }));
    expect(zoneOf(s, isl)).toBe("graveyard");
    expect(zoneOf(s, ids[0]!)).toBe("battlefield");
  });
});

describe("Overburden", () => {
  it("the player who cast a nontoken creature returns a land they control to its owner's hand", () => {
    const { s: s0, ap, opp, ids } = setup([bear]);
    putOnBattlefield(s0, opp, overburden());
    onlyLands(s0, ap);
    const lands = [putOnBattlefield(s0, ap, forest), putOnBattlefield(s0, ap, forest)];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [lands[0]!] }));
    expect(zoneOf(s, lands[0]!)).toBe("hand");
    expect(s.objects[ids[0]!]!.putter).toBe(ap);
  });

  it("tokens don't trigger it", () => {
    const { s: s0, ap, opp, ids } = setup([alarm()]);
    putOnBattlefield(s0, opp, overburden());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(2);
  });

  it("Oblivion Ring's exiled creature returns under its owner's control, but Oblivion Ring's controller put it there and returns the land", () => {
    const { s: s0, ap, opp, ids } = setup([oring()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, third, overburden());
    const b = putOnBattlefield(s0, opp, bear);
    onlyLands(s0, ap, s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === s0.activePlayer && nameOf(s0, id) === "Plains"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Its enters trigger targets the Bear.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(zoneOf(s, b)).toBe("exile");
    const ring = s.battlefield.find((id) => nameOf(s, id) === "Oblivion Ring")!;
    const plains = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && nameOf(s, id) === "Plains");
    moveObject(s, ring, "graveyard");
    s = settle(s);
    const [back] = s.battlefield.filter((id) => nameOf(s, id) === "Grizzly Bears");
    expect(back).toBeTruthy();
    expect(controllerOf(s, s.objects[back!]!)).toBe(opp);
    expect(s.objects[back!]!.putter).toBe(ap);
    // Oblivion Ring's controller returns one of their lands; the Bear's owner keeps theirs.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [plains[0]!] }));
    expect(zoneOf(s, plains[0]!)).toBe("hand");
  });
});

describe("Delif's Cone and Delif's Cube", () => {
  /**
   * You control the artifact and a Bear; the next player has an Ox. You activate the artifact on the Bear in your first
   * main phase (or, with `late`, after blockers are declared), attack that player with the Bear, and they block with the
   * Ox or don't. Stops before combat damage, with any "may" answered `yes`.
   */
  const combat = (def: CardDef, opts: { block?: boolean; late?: boolean; yes?: boolean } = {}) => {
    const { s: s0, ap, opp } = setup([]);
    const art = putOnBattlefield(s0, ap, def);
    const a = putOnBattlefield(s0, ap, bear);
    const b = putOnBattlefield(s0, opp, ox);
    const activate = (s: GameState) => {
      s = settle(run(s, planActivate(s, ap, art, 0, [tgt(a)])));
      expect(s.pending).toBeNull();
      return s;
    };
    let s = opts.late ? s0 : activate(s0);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 100 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: opts.block ? [{ blocker: b, attacker: a }] : [] });
    for (let i = 0; i < 100 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    expect(s.step).toBe("declareBlockers");
    const triggered = s.stack.length + s.triggerQueue.length;
    if (opts.late) s = activate(s);
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: !!opts.yes });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, opp, art, a, b, triggered, life: { ap: s0.players[ap]!.life, opp: s0.players[opp]!.life } };
  };
  /** Through combat damage. */
  const damage = (s: GameState) => passUntil(s, "endCombat");

  it("the Cube: unblocked, the Bear assigns no combat damage and the Cube gets a cube counter", () => {
    const { s, opp, art, triggered, life } = combat(cube());
    expect(triggered).toBe(1);
    expect(s.objects[art]!.counters["cube"]).toBe(1);
    expect(damage(s).players[opp]!.life).toBe(life.opp);
  });

  it("the Cube: blocked, nothing triggers and the Bear deals its damage to the Ox", () => {
    const { s, art, a, b, triggered } = combat(cube(), { block: true });
    expect(triggered).toBe(0);
    expect(s.objects[art]!.counters["cube"] ?? 0).toBe(0);
    const after = damage(s);
    expect(after.objects[b]!.damage).toBe(2);
    expect(zoneOf(after, a)).toBe("graveyard");
  });

  it("the Cube: activated after blockers are declared, it never triggers (rulings)", () => {
    const { s, opp, art, triggered, life } = combat(cube(), { late: true });
    expect(triggered).toBe(0);
    expect(s.objects[art]!.counters["cube"] ?? 0).toBe(0);
    expect(damage(s).players[opp]!.life).toBe(life.opp - 2);
  });

  it("the Cube's counter pays for its regeneration", () => {
    const { s: s0, ap, art } = combat(cube());
    const s = passUntil(s0, "main2", ap);
    const plan = planActivate(s, ap, art, 1, [tgt(s.battlefield.find((id) => nameOf(s, id) === "Grizzly Bears")!)]);
    expect(plan).not.toBeNull();
    const after = settle(run(s, plan));
    expect(after.objects[art]!.counters["cube"] ?? 0).toBe(0);
  });

  it("the Cone, saying yes: gain life equal to the Bear's power, and it assigns no combat damage", () => {
    const { s, ap, opp, art, triggered, life } = combat(cone(), { yes: true });
    expect(triggered).toBe(1);
    expect(zoneOf(s, art)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life.ap + 2);
    expect(damage(s).players[opp]!.life).toBe(life.opp);
  });

  it("the Cone, saying no: no life, and the Bear deals its damage", () => {
    const { s, ap, opp, life } = combat(cone(), { yes: false });
    expect(s.players[ap]!.life).toBe(life.ap);
    expect(damage(s).players[opp]!.life).toBe(life.opp - 2);
  });
});
