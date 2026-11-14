// Round 360 (Lane A): up to two creatures 0/3 with no abilities until your next turn and cheaper instant, sorcery and
// planeswalker spells for a target player until your next turn (Will Kenrith), Soldier tokens when you or a player you're
// attacking has the initiative (Undercellar Sweep), noncombat damage to opponents' creatures as -1/-1 counters (Soul-Scar
// Mage), keywords shared among your creatures at each upkeep, every landwalk and protection included (Concerted Effort), a
// creature card returned from a graveyard and exiled when ~ untaps or you lose control of it (Coffin Queen), and an instant
// or sorcery card cast from a target opponent's library (Knowledge Exploitation).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = moveTo("graveyard");
const toHand = moveTo("hand");
const toLibrary = moveTo("library");
const tgt = (id: ObjectId) => ({ kind: "object" as const, id });
const ptOf = (s: GameState, id: ObjectId) => { const c = characteristics(s, s.objects[id]!); return `${c.power}/${c.toughness}`; };
const kws = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).keywords;
const costOf = (s: GameState, pid: PlayerId, id: ObjectId) => { const c = spellCost(s, pid, s.objects[id]!); return manaValue(c.cost) + c.extra; };
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const will = (): CardDef => ({"oracleId":"20dbfc9a-172e-4065-bfde-d40de3131787","name":"Will Kenrith","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Legendary Planeswalker — Will","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Will"],"oracleText":"+2: Until your next turn, up to two target creatures each have base power and toughness 0/3 and lose all abilities.\n−2: Target player draws two cards. Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast.\n−8: Target player gets an emblem with \"Whenever you cast an instant or sorcery spell, copy it. You may choose new targets for the copy.\"\nPartner with Rowan Kenrith\nWill Kenrith can be your commander.","loyalty":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Partner with","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8a62032f-19cb-4bbb-9298-28e19c8ea189.jpg?1783934783","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8a62032f-19cb-4bbb-9298-28e19c8ea189.jpg?1783934783","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sweep = (): CardDef => ({"oracleId":"2a747cdb-afbe-451d-8b1b-9458401a5419","name":"Undercellar Sweep","manaCost":"{4}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, you take the initiative.\nWhenever you attack, if you or a player you're attacking has the initiative, you create two 1/1 white Soldier creature tokens that are tapped and attacking.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f8ca369b-4e04-4c80-923b-1212183419d8.jpg?1783922802","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f8ca369b-4e04-4c80-923b-1212183419d8.jpg?1783922802","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mage = (): CardDef => ({"oracleId":"009240f3-b7f8-4cbe-a3e9-974da66fb62c","name":"Soul-Scar Mage","manaCost":"{R}","cmc":1,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Prowess\nIf a source you control would deal noncombat damage to a creature an opponent controls, put that many -1/-1 counters on that creature instead.","power":"1","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Prowess"],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a8003786-6e2a-4e2d-a915-f23293c7273a.jpg?1783936483","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a8003786-6e2a-4e2d-a915-f23293c7273a.jpg?1783936483","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const concerted = (): CardDef => ({"oracleId":"fd4236e5-6a2c-45ec-afb3-cd4fc516fbf1","name":"Concerted Effort","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each upkeep, creatures you control gain flying until end of turn if a creature you control has flying. The same is true for fear, first strike, double strike, landwalk, protection, trample, and vigilance.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4afa3367-eb7e-4c92-96a1-2b6865b24f52.jpg?1783943704","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4afa3367-eb7e-4c92-96a1-2b6865b24f52.jpg?1783943704","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const queen = (): CardDef => ({"oracleId":"c19ec6aa-aadd-4767-b695-384fd07b4ded","name":"Coffin Queen","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Zombie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"You may choose not to untap this creature during your untap step.\n{2}{B}, {T}: Put target creature card from a graveyard onto the battlefield under your control. When this creature becomes untapped or you lose control of this creature, exile that creature.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/edf8af70-c26d-4b78-aad6-bd51b5afc590.jpg?1783946644","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/edf8af70-c26d-4b78-aad6-bd51b5afc590.jpg?1783946644","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const exploit = (): CardDef => ({"oracleId":"61ad3299-474a-400f-a1c1-b86024aca3e8","name":"Knowledge Exploitation","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Kindred Sorcery — Rogue","supertypes":[],"types":["Kindred","Sorcery"],"subtypes":["Rogue"],"oracleText":"Prowl {3}{U} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Rogue.)\nSearch target opponent's library for an instant or sorcery card. You may cast that card without paying its mana cost. Then that player shuffles.","colors":["U"],"colorIdentity":["U"],"keywords":["Prowl"],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d283c49-2e81-4b2e-956a-69152cc4704e.jpg?1783942799","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d283c49-2e81-4b2e-956a-69152cc4704e.jpg?1783942799","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const knight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const leviathan = (): CardDef => ({"oracleId":"853b02e1-fc0a-413b-8381-88596624440f","name":"Segovian Leviathan","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Leviathan","supertypes":[],"types":["Creature"],"subtypes":["Leviathan"],"oracleText":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Landwalk","Islandwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e5a814f1-7f8d-4c2c-b706-ee0ed5892f7b.jpg?1783948071","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e5a814f1-7f8d-4c2c-b706-ee0ed5892f7b.jpg?1783948071","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gideon = (): CardDef => ({"oracleId":"51eae7ff-fed9-4afe-8053-7690379449dd","name":"Gideon, Ally of Zendikar","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Gideon","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Gideon"],"oracleText":"+1: Until end of turn, Gideon becomes a 5/5 Human Soldier Ally creature with indestructible that's still a planeswalker. Prevent all damage that would be dealt to him this turn.\n0: Create a 2/2 white Knight Ally creature token.\n−4: You get an emblem with \"Creatures you control get +1/+1.\"","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/187e887c-c39d-4d25-a506-cdc95fc70316.jpg?1783938219","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/187e887c-c39d-4d25-a506-cdc95fc70316.jpg?1783938219","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const prey = (): CardDef => ({"oracleId":"b3c12848-528d-4005-878f-4f950a07240a","name":"Prey Upon","manaCost":"{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16979827-4011-454a-9886-18326cfa3e77.jpg?1783934147","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16979827-4011-454a-9886-18326cfa3e77.jpg?1783934147","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 360: compiles", () => {
  it("every card of the round", () => supported(will(), sweep(), mage(), concerted(), queen(), exploit()));
});

describe("Will Kenrith", () => {
  it("+2: up to two target creatures are 0/3 with no abilities until your next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, will());
    s0.objects[w]!.counters.loyalty = 4;
    const a = putOnBattlefield(s0, opp, serra());
    const b = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [tgt(a), tgt(b)])), ap);
    expect(s.objects[w]!.counters.loyalty).toBe(6);
    expect(ptOf(s, a)).toBe("0/3");
    expect(ptOf(s, b)).toBe("0/3");
    expect(kws(s, a)).not.toContain("Flying");
    // Still so on the next player's turn: it lasts until your next turn begins (CR 611.2b).
    s = passUntil(s, "main1", nextOf(s, ap));
    expect(ptOf(s, a)).toBe("0/3");
    expect(kws(s, a)).not.toContain("Flying");
    s = passUntil(passUntil(s, "upkeep", nextOf(s, nextOf(s, ap))), "main1", ap);
    expect(ptOf(s, a)).toBe("4/4");
    expect(kws(s, a)).toContain("Flying");
    expect(ptOf(s, b)).toBe("3/3");
  });

  it("+2 with one target changes only that creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, will());
    s0.objects[w]!.counters.loyalty = 4;
    const a = putOnBattlefield(s0, opp, serra());
    const b = putOnBattlefield(s0, opp, giant());
    const s = settle(run(s0, planActivate(s0, ap, w, 0, [tgt(a), { kind: "none" }])), ap);
    expect(ptOf(s, a)).toBe("0/3");
    expect(ptOf(s, b)).toBe("3/3");
  });

  it("−2: the target player draws two, and their instant, sorcery and planeswalker spells cost {2} less until your next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, will());
    s0.objects[w]!.counters.loyalty = 4;
    const div = toHand(s0, opp, divination());
    const gid = toHand(s0, opp, gideon());
    const hill = toHand(s0, opp, giant());
    const mine = toHand(s0, ap, divination());
    const hand = s0.players[opp]!.hand.length;
    expect([costOf(s0, opp, div), costOf(s0, opp, gid), costOf(s0, opp, hill)]).toEqual([3, 4, 4]);
    let s = settle(run(s0, planActivate(s0, ap, w, 1, [{ kind: "player", id: opp }])), ap);
    expect(s.objects[w]!.counters.loyalty).toBe(2);
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    // Generic mana only comes off (CR 118.7a); creature spells aren't changed, nor are your own spells.
    expect([costOf(s, opp, div), costOf(s, opp, gid), costOf(s, opp, hill)]).toEqual([1, 2, 4]);
    expect(costOf(s, ap, mine)).toBe(3);
    // On their own turn, after yours has ended, still cheaper.
    s = passUntil(s, "main1", opp);
    expect(costOf(s, opp, div)).toBe(1);
    // Over once your next turn begins.
    s = passUntil(passUntil(s, "upkeep", nextOf(s, opp)), "main1", ap);
    expect(costOf(s, opp, div)).toBe(3);
  });
});

describe("Undercellar Sweep", () => {
  const attackWith = (s0: GameState, ap: PlayerId, defender: PlayerId) => {
    const c = putOnBattlefield(s0, ap, bears());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender }] });
    s = settle(s, ap);
    // The tokens attack a player or planeswalker you choose, one question each (CR 508.4).
    for (let i = 0; i < 4 && s.pending?.player === ap; i++) s = settle(run(s, botActions(s, ap)), ap);
    return s;
  };
  const soldiers = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === "Soldier Token");

  it("you have the initiative: two 1/1 Soldiers tapped and attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sweep());
    s0.initiative = ap;
    const s = attackWith(s0, ap, opp);
    const t = soldiers(s, ap);
    expect(t).toHaveLength(2);
    expect(t.every((id) => s.objects[id]!.tapped && s.objects[id]!.attacking !== undefined)).toBe(true);
  });

  it("the player you're attacking has the initiative: the tokens too", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sweep());
    s0.initiative = opp;
    const s = attackWith(s0, ap, opp);
    expect(soldiers(s, ap)).toHaveLength(2);
  });

  it("another player you aren't attacking has it: no tokens", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sweep());
    s0.initiative = nextOf(s0, opp);
    const s = attackWith(s0, ap, opp);
    expect(soldiers(s, ap)).toHaveLength(0);
  });
});

describe("Soul-Scar Mage", () => {
  it("noncombat damage from your source to an opponent's creature is -1/-1 counters instead", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    putOnBattlefield(s0, ap, mage());
    const g = putOnBattlefield(s0, opp, giant());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)])), ap);
    expect(s.objects[g]!.counters["-1/-1"]).toBe(2);
    expect(s.objects[g]!.damage ?? 0).toBe(0);
    expect(ptOf(s, g)).toBe("1/1");
  });

  it("not to a player, nor to your own creature", () => {
    const { s: s0, ap, opp, ids } = setup([shock(), shock()]);
    putOnBattlefield(s0, ap, mage());
    const mineG = putOnBattlefield(s0, ap, giant());
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 2);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mineG)])), ap);
    expect(s.objects[mineG]!.damage).toBe(2);
    expect(s.objects[mineG]!.counters["-1/-1"] ?? 0).toBe(0);
  });

  it("a fight: your creature's damage becomes counters, the other's damage is dealt (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([prey()]);
    putOnBattlefield(s0, ap, mage());
    const mineG = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, serra());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mineG), tgt(theirs)])), ap);
    expect(s.objects[theirs]!.counters["-1/-1"]).toBe(3);
    expect(s.objects[theirs]!.damage ?? 0).toBe(0);
    expect(ptOf(s, theirs)).toBe("1/1");
    // Serra Angel's 4 damage kills the Giant.
    expect(s.objects[mineG]!.zone).toBe("graveyard");
  });

  it("combat damage is dealt as usual", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mage());
    const a = putOnBattlefield(s0, ap, giant());
    const blocker = putOnBattlefield(s0, opp, serra());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }), ap);
    for (let i = 0; i < 50 && s.step !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [{ blocker, attacker: a }] });
    s = settle(passUntil(s, "endCombat"), ap);
    expect(s.objects[blocker]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[blocker]!.damage).toBe(3);
  });
});

describe("Concerted Effort", () => {
  it("at each upkeep, creatures you control gain each listed keyword one of them has, every landwalk and protection", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, concerted());
    putOnBattlefield(s0, ap, serra());
    putOnBattlefield(s0, ap, knight());
    putOnBattlefield(s0, ap, leviathan());
    const b = putOnBattlefield(s0, ap, bears());
    // An opponent's upkeep: "each upkeep".
    let s = settle(passUntil(s0, "upkeep", nextOf(s0, ap)), ap);
    const k = kws(s, b);
    for (const x of ["Flying", "Vigilance", "First strike", "Protection from black", "Islandwalk"]) expect(k, x).toContain(x);
    expect(k).not.toContain("Trample");
    expect(k).not.toContain("Landwalk");
    expect(s.effects.find((e) => e.affected.includes(b))?.duration).toBe("endOfTurn");
    // Kept even once the creature that had it is gone (rulings).
    const angel = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Serra Angel")!;
    s.battlefield.splice(s.battlefield.indexOf(angel), 1);
    s.objects[angel]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(angel);
    invalidateCharacteristics(s);
    expect(kws(s, b)).toContain("Flying");
  });
});

describe("Coffin Queen", () => {
  const returned = (s0: GameState, ap: PlayerId, opp: PlayerId) => {
    const q = putOnBattlefield(s0, ap, queen());
    const b = toYard(s0, opp, bears());
    const s = settle(run(s0, planActivate(s0, ap, q, 0, [tgt(b)])), ap);
    const bear = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Grizzly Bears" && controllerOf(s, s.objects[id]!) === ap)!;
    expect(bear).toBeDefined();
    expect(s.objects[q]!.tapped).toBe(true);
    return { s, q, bear };
  };

  it("puts a creature card from a graveyard onto the battlefield under your control; exiles it when ~ untaps", () => {
    const { s: s0, ap, opp } = setup([]);
    const { s: s1, bear } = returned(s0, ap, opp);
    // Your next untap step: untapped, so it triggers.
    const s = settle(passUntil(s1, "upkeep", ap), ap);
    expect(s.objects[bear]!.zone).toBe("exile");
    expect(s.players[opp]!.exile).toContain(bear);
  });

  it("kept tapped, the creature stays", () => {
    const { s: s0, ap, opp } = setup([]);
    const { s: s1, q, bear } = returned(s0, ap, opp);
    let s = passUntil(s1, "untap", ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "keepTapped" });
    expect((s.pending as { options: string[] }).options).toContain(q);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [q] }), ap);
    s = settle(passUntil(s, "main1", ap), ap);
    expect(s.objects[q]!.tapped).toBe(true);
    expect(s.objects[bear]!.zone).toBe("battlefield");
  });

  it("a bot keeps it tapped while the creature is there", () => {
    const { s: s0, ap, opp } = setup([]);
    const { s: s1, q } = returned(s0, ap, opp);
    const s = passUntil(s1, "untap", ap);
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [q] }]);
  });

  it("you lose control of it (it leaves the battlefield): the creature is exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const { s: s1, q, bear } = returned(s0, ap, opp);
    const sh = toHand(s1, ap, shock());
    const s = settle(run(s1, planCast(s1, ap, sh, [tgt(q)])), ap);
    expect(s.objects[q]!.zone).toBe("graveyard");
    expect(s.objects[bear]!.zone).toBe("exile");
  });

  it("if the creature has left, untapping ~ does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const { s: s1, bear } = returned(s0, ap, opp);
    const sh = toHand(s1, ap, bolt());
    let s = settle(run(s1, planCast(s1, ap, sh, [tgt(bear)])), ap);
    expect(s.objects[bear]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "upkeep", ap), ap);
    expect(s.objects[bear]!.zone).toBe("graveyard");
  });
});

describe("Knowledge Exploitation", () => {
  it("casts an instant or sorcery card from the target opponent's library for free, then they shuffle", () => {
    const { s: s0, ap, opp, ids } = setup([exploit()]);
    const d = toLibrary(s0, opp, divination());
    toLibrary(s0, opp, bolt());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [d] });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: d });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: d }), ap);
    // Divination drew you two; it goes to its owner's graveyard (CR 400.3).
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    expect(s.players[opp]!.graveyard).toContain(d);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("not cast, the card stays in that library", () => {
    const { s: s0, ap, opp, ids } = setup([exploit()]);
    const d = toLibrary(s0, opp, divination());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    s = act(s, { type: "searchLibrary", player: ap, found: [d] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[d]!.zone).toBe("library");
    expect(s.players[opp]!.library).toContain(d);
  });

  it("only instant and sorcery cards can be found", () => {
    const { s: s0, ap, opp, ids } = setup([exploit()]);
    toLibrary(s0, opp, divination());
    const g = toLibrary(s0, opp, giant());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect((s.pending as { cards: string[] }).cards).not.toContain(g);
  });
});
