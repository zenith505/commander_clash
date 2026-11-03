// Round 268, earlier skips from the top of the popularity list whose missing pieces now exist: Narset, Enlightened
// Master (cast noncreature spells from among the exiled cards free this turn), Venerable Warsinger (a target's mana value
// bounded by the trigger's combat damage), Rushed Rebirth (a this-turn dies trigger searching for lesser mana value),
// Sorcerous Squall (cast from that opponent's graveyard), Curse of Hospitality (trample for creatures attacking the
// enchanted player, an impulse for the creature's controller), Immerwolf (non-Human Werewolves can't transform), Pawpatch
// Recruit ("other than that creature"), Mog, Moogle Warrior (each player may discard, then checks on what was discarded).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { setDayNight } from "../src/daynight";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question but blockers (none declared). */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const sorcery = (name: string, cost: string, cmc: number, text = "Draw a card.") => card(name, "Sorcery", cost, { cmc, oracleText: text });
const instant = (name: string, cost: string, cmc: number, text = "Draw a card.") => card(name, "Instant", cost, { cmc, oracleText: text });
const creature = (name: string, cost: string, cmc: number, p = 2, t = 2, extra: Partial<CardDef> = {}) => card(name, "Creature — Bear", cost, { cmc, power: String(p), toughness: String(t), ...extra });
/** Attacks `defender` with `attackers` and passes until the first question after declaring blockers (none). */
const attack = (s: GameState, ap: PlayerId, attackers: ObjectId[], defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 80 && !(s.pending && s.pending.kind !== "declareBlockers"); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Declares the attack and stops there, with its triggers waiting. */
const declare = (s: GameState, ap: PlayerId, attackers: ObjectId[], defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;
const narset = (): CardDef => ({"oracleId":"aeaf7768-ed67-487d-8506-e667babb88ba","name":"Narset, Enlightened Master","manaCost":"{3}{U}{R}{W}","cmc":6,"typeLine":"Legendary Creature — Human Monk","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Monk"],"oracleText":"First strike, hexproof\nWhenever Narset attacks, exile the top four cards of your library. Until end of turn, you may cast noncreature spells from among those cards without paying their mana costs.","power":"3","toughness":"2","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Hexproof","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f210adb7-b389-4672-a3eb-0ced9bfe190c.jpg?1783939056","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f210adb7-b389-4672-a3eb-0ced9bfe190c.jpg?1783939056","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const warsinger = (): CardDef => ({"oracleId":"e286d1aa-bb74-4568-98b5-a693ac7a369d","name":"Venerable Warsinger","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Creature — Spirit Cleric","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Cleric"],"oracleText":"Vigilance, trample\nWhenever this creature deals combat damage to a player, you may return target creature card with mana value X or less from your graveyard to the battlefield, where X is the amount of damage this creature dealt to that player.","power":"3","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Vigilance","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/9/1/91cae78b-75a4-4c0e-92c3-f24379a23271.jpg?1783927226","artUrl":"https://cards.scryfall.io/art_crop/front/9/1/91cae78b-75a4-4c0e-92c3-f24379a23271.jpg?1783927226","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rebirth = (): CardDef => ({"oracleId":"8ee64f9d-54c4-4a75-a8ac-6bb0a060b960","name":"Rushed Rebirth","manaCost":"{B}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature. When that creature dies this turn, search your library for a creature card with lesser mana value, put it onto the battlefield tapped, then shuffle.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07b7c952-5ab7-4546-8369-4d213bf868bf.jpg?1783927295","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07b7c952-5ab7-4546-8369-4d213bf868bf.jpg?1783927295","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const squall = (): CardDef => ({"oracleId":"a986d83d-22f1-45c3-bc2d-f5b210c539fb","name":"Sorcerous Squall","manaCost":"{6}{U}{U}{U}","cmc":9,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nTarget opponent mills nine cards, then you may cast an instant or sorcery spell from that player's graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.","colors":["U"],"colorIdentity":["U"],"keywords":["Delve","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/c/0/c06274ff-892e-418b-8ba5-4d3b3231e327.jpg?1783914197","artUrl":"https://cards.scryfall.io/art_crop/front/c/0/c06274ff-892e-418b-8ba5-4d3b3231e327.jpg?1783914197","commanderLegal":"legal","set":"ltc","releasedAt":"2023-11-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const curse = (): CardDef => ({"oracleId":"0fb70b94-0847-4155-8953-cb53fef82ef1","name":"Curse of Hospitality","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nCreatures attacking enchanted player have trample.\nWhenever a creature deals combat damage to enchanted player, that player exiles the top card of their library. Until end of turn, that creature's controller may play that card and they may spend mana as though it were mana of any color to cast that spell.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a2c262a-5bf6-491e-b95e-beacab86ea99.jpg?1783924209","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a2c262a-5bf6-491e-b95e-beacab86ea99.jpg?1783924209","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const immerwolf = (): CardDef => ({"oracleId":"3c2445ee-84d5-47de-8b09-dbdc89ca2db7","name":"Immerwolf","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Creature — Wolf","supertypes":[],"types":["Creature"],"subtypes":["Wolf"],"oracleText":"Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nEach other creature you control that's a Wolf or a Werewolf gets +1/+1.\nNon-Human Werewolves you control can't transform.","power":"2","toughness":"2","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Transform","Intimidate"],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/637216e9-ff5f-4dd5-ac08-a26a334431fb.jpg?1783911047","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/637216e9-ff5f-4dd5-ac08-a26a334431fb.jpg?1783911047","commanderLegal":"legal","set":"sld","releasedAt":"2024-06-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pawpatch = (): CardDef => ({"oracleId":"50ab0194-c7dc-4f11-abc0-1a82393cc42e","name":"Pawpatch Recruit","manaCost":"{G}","cmc":1,"typeLine":"Creature — Rabbit Warrior","supertypes":[],"types":["Creature"],"subtypes":["Rabbit","Warrior"],"oracleText":"Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)\nTrample\nWhenever a creature you control becomes the target of a spell or ability an opponent controls, put a +1/+1 counter on target creature you control other than that creature.","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Offspring","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/7/d/7d4d88ba-0ee4-4f66-995b-2e50614f50ee.jpg?1783910805","artUrl":"https://cards.scryfall.io/art_crop/front/7/d/7d4d88ba-0ee4-4f66-995b-2e50614f50ee.jpg?1783910805","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mog = (): CardDef => ({"oracleId":"f18cce8c-8fb6-49a7-8f79-2529c0ee3ecc","name":"Mog, Moogle Warrior","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Moogle Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Moogle","Warrior"],"oracleText":"Lifelink\nDance — At the beginning of your end step, each player may discard a card. Each player who discarded a card this way draws a card. If a creature card was discarded this way, you create a 1/2 white Moogle creature token with lifelink. Then if a noncreature card was discarded this way, put a +1/+1 counter on each Moogle you control.","power":"1","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Lifelink","Dance"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e9cb8ac9-64a0-455d-a8dd-1579ee321bbd.jpg?1783906344","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e9cb8ac9-64a0-455d-a8dd-1579ee321bbd.jpg?1783906344","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tovolar = (): CardDef => ({"oracleId":"18563bc9-6090-4629-b304-89a67d93f635","name":"Tovolar's Huntmaster // Tovolar's Packleader","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Human Werewolf // Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"When this creature enters, create two 2/2 green Wolf creature tokens.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Transform","Daybound","Fight","Nightbound"],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/47f1be55-1a95-49e0-8943-4b8fa2f2f987.jpg?1783924362","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/47f1be55-1a95-49e0-8943-4b8fa2f2f987.jpg?1783924362","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Tovolar's Huntmaster","manaCost":"{4}{G}{G}","typeLine":"Creature — Human Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"When this creature enters, create two 2/2 green Wolf creature tokens.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)","power":"6","toughness":"6","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/47f1be55-1a95-49e0-8943-4b8fa2f2f987.jpg?1783924362","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/47f1be55-1a95-49e0-8943-4b8fa2f2f987.jpg?1783924362"},{"name":"Tovolar's Packleader","manaCost":"","typeLine":"Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Werewolf"],"oracleText":"Whenever this creature enters or attacks, create two 2/2 green Wolf creature tokens.\n{2}{G}{G}: Another target Wolf or Werewolf you control fights target creature you don't control.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)","power":"7","toughness":"7","colors":["G"],"colorIndicator":["G"],"imageUrl":"https://cards.scryfall.io/normal/back/4/7/47f1be55-1a95-49e0-8943-4b8fa2f2f987.jpg?1783924362","artUrl":"https://cards.scryfall.io/art_crop/back/4/7/47f1be55-1a95-49e0-8943-4b8fa2f2f987.jpg?1783924362"}]}) as CardDef;

describe("Round 268 cards", () => {
  it("are fully supported", () => {
    for (const c of [narset(), warsinger(), rebirth(), squall(), curse(), immerwolf(), pawpatch(), mog()]) expect([c.name, isFullySupported(c)]).toEqual([c.name, true]);
  });
});

describe("Narset, Enlightened Master", () => {
  it("exiles the top four; only the noncreature spells among them may be cast this turn, free, with their normal timing", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const n = putOnBattlefield(s0, ap, narset());
    const below = into(s0, ap, sorcery("Test Below", "{1}", 1), "library");
    const land = into(s0, ap, forest, "library");
    const beast = into(s0, ap, creature("Test Beast", "{1}{G}", 2), "library");
    const sorc = into(s0, ap, sorcery("Test Sorcery", "{4}{U}", 5), "library");
    const inst = into(s0, ap, instant("Test Instant", "{2}{U}", 3), "library");
    let s = settle(declare(s0, ap, [n], opp));
    expect([zone(s, inst), zone(s, sorc), zone(s, beast), zone(s, land), zone(s, below)]).toEqual(["exile", "exile", "exile", "exile", "library"]);
    // The instant now; the sorcery not while combat goes on; the creature and the land never (rulings).
    expect(castProblem(s, ap, inst)).toBeNull();
    expect(castProblem(s, ap, sorc)).not.toBeNull();
    expect(castProblem(s, ap, beast)).not.toBeNull();
    const lands = untapped(s, ap);
    s = settle(run(s, planCast(s, ap, inst, [])));
    expect(zone(s, inst)).toBe("graveyard");
    expect(untapped(s, ap)).toBe(lands);
    s = passUntil(s, "main2", ap);
    expect(castProblem(s, ap, sorc)).toBeNull();
    s = settle(run(s, planCast(s, ap, sorc, [])));
    expect(zone(s, sorc)).toBe("graveyard");
    expect(untapped(s, ap)).toBe(lands);
    expect(castProblem(s, ap, beast)).not.toBeNull();
    expect(zone(s, beast)).toBe("exile");
    // Next turn the permission is gone.
    s = passUntil(s, "upkeep", opp);
    expect(zone(s, land)).toBe("exile");
    expect(s.objects[land]!.mayPlay && s.objects[land]!.mayPlay.until === "thisTurn" && s.objects[land]!.mayPlay.turn === s.turn).toBeFalsy();
  });
});

describe("Venerable Warsinger", () => {
  it("returns a creature card with mana value up to the combat damage it dealt that player", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const w = putOnBattlefield(s0, ap, warsinger());
    const three = into(s0, ap, creature("Test Three", "{2}{G}", 3), "graveyard");
    const four = into(s0, ap, creature("Test Four", "{3}{G}", 4), "graveyard");
    let s = attack(s0, ap, [w], opp);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const spec = s.pending?.kind === "chooseTargets" ? s.pending.specs[0]! : undefined;
    expect(spec?.manaValue?.max).toBe(3);
    expect(spec?.text).toContain("mana value 3 or less");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: four }] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: three }] });
    s = settle(s);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, three)).toBe("battlefield");
    expect(zone(s, four)).toBe("graveyard");
  });

  it("with +1/+1 counters, the bigger damage lets a bigger card come back", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const w = putOnBattlefield(s0, ap, warsinger());
    s0.objects[w]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const four = into(s0, ap, creature("Test Four", "{3}{G}", 4), "graveyard");
    let s = attack(s0, ap, [w], opp);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: four }] });
    s = settle(s);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, four)).toBe("battlefield");
  });
});

describe("Rushed Rebirth", () => {
  const killer = () => instant("Test Kill", "{B}", 1, "Destroy target creature.");
  it("when that creature dies this turn, searches for a creature card with lesser mana value, onto the battlefield tapped", () => {
    const { s: s0, ap, ids } = setup([rebirth(), killer()]);
    s0.players[ap]!.command = [];
    const victim = putOnBattlefield(s0, ap, creature("Test Victim", "{2}{G}{G}", 4));
    const lib = s0.players[ap]!.library;
    const big = into(s0, ap, creature("Test Big", "{4}{G}", 5), "library");
    const same = into(s0, ap, creature("Test Same", "{3}{G}", 4), "library");
    const small = into(s0, ap, creature("Test Small", "{2}{G}", 3), "library");
    void lib;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: victim }])));
    expect(zone(s, victim)).toBe("graveyard");
    // The search: only the card with lesser mana value fits.
    expect(s.pending?.kind).toBe("searchLibrary");
    const found = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(found).toContain(small);
    expect(found).not.toContain(same);
    expect(found).not.toContain(big);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [small] }));
    expect(zone(s, small)).toBe("battlefield");
    expect(s.objects[small]!.tapped).toBe(true);
  });

  it("does nothing if the creature dies on a later turn", () => {
    const { s: s0, ap, ids } = setup([rebirth()]);
    s0.players[ap]!.command = [];
    const victim = putOnBattlefield(s0, ap, creature("Test Victim", "{2}{G}{G}", 4));
    const small = into(s0, ap, creature("Test Small", "{2}{G}", 3), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }])));
    s = passUntil(s, "upkeep", opps(s, ap)[0]!);
    const k = into(s, opps(s, ap)[0]!, killer(), "hand");
    s.players[opps(s, ap)[0]!]!.manaPool.B = 1;
    void k;
    s.objects[victim]!.damage = 10;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.pending?.kind).not.toBe("searchLibrary");
    expect(zone(s, small)).toBe("library");
  });
});

describe("Rushed Rebirth, mana value 0", () => {
  it("finds nothing when the creature that died had mana value 0 (nothing is less than 0)", () => {
    const { s: s0, ap, ids } = setup([rebirth(), instant("Test Kill", "{B}", 1, "Destroy target creature.")]);
    s0.players[ap]!.command = [];
    const victim = putOnBattlefield(s0, ap, card("Test Zero", "Artifact Creature — Construct", "{0}", { cmc: 0, power: "1", toughness: "1" }));
    const zero = into(s0, ap, card("Test Other Zero", "Artifact Creature — Construct", "{0}", { cmc: 0, power: "1", toughness: "1" }), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: victim }])));
    expect(zone(s, victim)).toBe("graveyard");
    const found = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(found).not.toContain(zero);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(zone(s, zero)).toBe("library");
  });
});

describe("Sorcerous Squall", () => {
  it("mills nine, then casts an instant or sorcery from that player's whole graveyard free, exiled after", () => {
    const { s: s0, ap, ids } = setup([squall()]);
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[1]!;
    s0.players[ap]!.manaPool = { W: 0, U: 9, B: 0, R: 0, G: 0, C: 0 };
    const old = into(s0, opp, sorcery("Test Old Sorcery", "{3}{U}", 4, "You gain 3 life."), "graveyard");
    const beast = into(s0, opp, creature("Test Beast", "{1}{G}", 2), "graveyard");
    const milled = into(s0, opp, instant("Test Milled Instant", "{1}{U}", 2, "You gain 2 life."), "library");
    const tenth = into(s0, opp, sorcery("Test Tenth", "{U}", 1), "library");
    // The instant ninth from the top, the tenth card stays.
    const lib = s0.players[opp]!.library;
    lib.splice(lib.indexOf(milled), 1);
    lib.splice(lib.indexOf(tenth), 1);
    lib.splice(8, 0, milled);
    lib.splice(9, 0, tenth);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(zone(s, milled)).toBe("graveyard");
    expect(zone(s, tenth)).toBe("library");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).toEqual(expect.arrayContaining([old, milled]));
    expect(opts).not.toContain(beast);
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseOption", player: ap, choice: old });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: old });
    s = settle(run(s, planCast(s, ap, old, [])));
    expect(s.players[ap]!.life).toBe(life + 3);
    // "If that spell would be put into a graveyard, exile it instead."
    expect(zone(s, old)).toBe("exile");
    expect(zone(s, milled)).toBe("graveyard");
  });
});

describe("Curse of Hospitality", () => {
  it("creatures attacking the enchanted player have trample; the hit player's top card is playable by the creature's controller", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const [o1, o2] = opps(s0, ap);
    // An opponent's Curse on another opponent: whoever's creature hits that player gets the card.
    const c = putOnBattlefield(s0, o1!, curse());
    s0.objects[c]!.attachedToPlayer = o2!;
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Other Bears" }));
    const top = into(s0, o2!, sorcery("Test Top", "{1}{R}", 2, "You gain 4 life."), "library");
    invalidateCharacteristics(s0);
    expect(objHasKeyword(s0, s0.objects[b1]!, "Trample")).toBe(false);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: o2! }, { attacker: b2, defender: o1! }] });
    expect(objHasKeyword(s, s.objects[b1]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[b2]!, "Trample")).toBe(false);
    for (let i = 0; i < 80 && s.step !== "main2"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // Once, for the creature that hit the enchanted player (rulings).
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", anyType: true });
    expect(s.players[o2!]!.library[0]).not.toBe(top);
    // Mana of any type: two Forests pay {1}{R}.
    const life = s.players[ap]!.life;
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes("Mountain")) s.objects[id]!.tapped = true;
    const plan = planCast(s, ap, top, []);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    expect(s.players[ap]!.life).toBe(life + 4);
  });
});

describe("Immerwolf", () => {
  it("a non-Human Werewolf you control stays transformed as night becomes day; a Human one still transforms", () => {
    const { s: s0, ap } = setup([]);
    const opp = opps(s0, ap)[0]!;
    putOnBattlefield(s0, ap, immerwolf());
    const pack = putOnBattlefield(s0, ap, tovolar());
    s0.objects[pack]!.face = 1;
    const theirs = putOnBattlefield(s0, opp, tovolar());
    s0.objects[theirs]!.face = 1;
    s0.dayNight = "night";
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[pack]!).subtypes).toEqual(["Werewolf"]);
    setDayNight(s0, "day");
    invalidateCharacteristics(s0);
    // Yours is a non-Human Werewolf: it can't transform (CR 701.28f). Theirs isn't yours.
    expect([s0.objects[pack]!.face, s0.objects[theirs]!.face ?? 0]).toEqual([1, 0]);
    // The front face is a Human Werewolf: as day becomes night it transforms.
    const front = putOnBattlefield(s0, ap, tovolar());
    invalidateCharacteristics(s0);
    setDayNight(s0, "night");
    expect(s0.objects[front]!.face).toBe(1);
  });
});

describe("Pawpatch Recruit", () => {
  it("when an opponent targets a creature you control, a +1/+1 counter on another target creature you control", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const paw = putOnBattlefield(s0, ap, pawpatch());
    const b = putOnBattlefield(s0, ap, bear());
    const shock = into(s0, opp, instant("Test Shock", "{R}", 1, "Test Shock deals 2 damage to any target."), "hand");
    s0.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 };
    let s = s0;
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, shock, [{ kind: "object", id: b }]));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not the creature targeted.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: paw }] });
    s = settle(s);
    expect(s.objects[paw]!.counters["+1/+1"]).toBe(1);
    expect(zone(s, b)).toBe("graveyard");
  });
});

describe("Mog, Moogle Warrior", () => {
  it("each player may discard; those who did draw; a creature discarded makes a Moogle, a noncreature card puts counters on Moogles", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.command = [];
    s0.players[ap]!.hand = [];
    const [o1, o2, o3] = opps(s0, ap);
    const m = putOnBattlefield(s0, ap, mog());
    const mine = into(s0, ap, sorcery("Test Mine", "{U}", 1), "hand");
    const theirs = into(s0, o1!, creature("Test Theirs", "{G}", 1), "hand");
    s0.players[o2!]!.hand = [];
    const hands = Object.fromEntries([ap, o1!, o3!].map((p) => [p, s0.players[p]!.hand.length]));
    let s = passUntil(s0, "end", ap);
    // Asked in turn order from you; the player with no cards in hand isn't asked (CR 101.3).
    const asked: PlayerId[] = [];
    for (let i = 0; i < 20 && s.step === "end"; i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        asked.push(p.player);
        s = act(s, { type: "chooseMay", player: p.player, yes: p.player !== o3 });
      } else if (p?.kind === "discard") {
        s = act(s, { type: "discard", player: p.player, objectIds: [p.player === ap ? mine : p.player === o1 ? theirs : s.players[p.player]!.hand[0]!] });
      } else if (p) break;
      else if (!s.stack.length && !s.triggerQueue.length && asked.length) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual([ap, o1, o3]);
    expect([zone(s, mine), zone(s, theirs)]).toEqual(["graveyard", "graveyard"]);
    // Those who discarded drew one: their hands are as before.
    expect(s.players[ap]!.hand.length).toBe(hands[ap]);
    expect(s.players[o1!]!.hand.length).toBe(hands[o1!]);
    expect(s.players[o3!]!.hand.length).toBe(hands[o3!]);
    const moogles = s.battlefield.filter((id) => id !== m && characteristics(s, s.objects[id]!).subtypes.includes("Moogle"));
    expect(moogles.length).toBe(1);
    // The new token and Mog (a Moogle too) each get a counter.
    expect(s.objects[moogles[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(1);
  });
});
