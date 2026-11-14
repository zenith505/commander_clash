// Round 367 (Lane A): a spell cheaper for each opponent's land that could produce {C} (Obsidian Charmaw); a land tapped
// for mana tapping its controller's other lands that could make the same mana (Mana Web); a cumulative upkeep paid in
// stolen lands that all go home when it leaves (Herald of Leshrac); a quest that copies instants and sorceries once it
// has two counters (Pyromancer Ascension); and a Saga that puts an Aura or Equipment from hand or graveyard onto the
// battlefield (Vault 101: Birthday Party).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { putCounters } from "../src/counters";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const landsOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && nameOf(s, id) === name);
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.tapped && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land")).length;
const pool = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, n) => a + n, 0);
/** Puts a fresh copy of `def` into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const bounce = card("Test Bounce", "Instant", "{U}", { cmc: 1, oracleText: "Return target creature to its owner's hand." });

// Real oracle text (Scryfall).
const charmaw = (): CardDef => ({"oracleId":"c995bc01-f278-4088-9ae2-1b50f87b2a61","name":"Obsidian Charmaw","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"This spell costs {1} less to cast for each land your opponents control that could produce {C}.\nFlying\nWhen this creature enters, destroy target nonbasic land an opponent controls.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89b7a09e-a28f-4153-81b0-c8dbb1aaa0e7.jpg?1783926754","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89b7a09e-a28f-4153-81b0-c8dbb1aaa0e7.jpg?1783926754","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const manaWeb = (): CardDef => ({"oracleId":"82909ff4-f6f7-44f1-bbd0-6e54afa5ee6d","name":"Mana Web","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a land an opponent controls is tapped for mana, tap all lands that player controls that could produce any type of mana that land could produce.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c72ec90-dacc-496f-a7f5-f18bfce5eb3e.jpg?1783946714","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c72ec90-dacc-496f-a7f5-f18bfce5eb3e.jpg?1783946714","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const herald = (): CardDef => ({"oracleId":"ed9e39ad-996c-4a68-8d11-e1c7d35f556c","name":"Herald of Leshrac","manaCost":"{6}{B}","cmc":7,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Flying\nCumulative upkeep—Gain control of a land you don't control. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nThis creature gets +1/+1 for each land you control but don't own.\nWhen this creature leaves the battlefield, each player gains control of each land they own that you control.","power":"2","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Cumulative upkeep","Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad6080b1-b032-4172-8594-4d894a60a80d.jpg?1783943348","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad6080b1-b032-4172-8594-4d894a60a80d.jpg?1783943348","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ascension = (): CardDef => ({"oracleId":"85845b6c-abb5-4591-b987-a375972cf25b","name":"Pyromancer Ascension","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you cast an instant or sorcery spell that has the same name as a card in your graveyard, you may put a quest counter on this enchantment.\nWhenever you cast an instant or sorcery spell while this enchantment has two or more quest counters on it, you may copy that spell. You may choose new targets for the copy.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/aeffd6f6-0fee-4afc-9256-04099d9d41aa.jpg?1783930750","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/aeffd6f6-0fee-4afc-9256-04099d9d41aa.jpg?1783930750","commanderLegal":"legal","set":"ss3","releasedAt":"2020-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vault = (): CardDef => ({"oracleId":"77322d69-330e-4b00-b984-62c6d45c9540","name":"Vault 101: Birthday Party","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 1/1 white Human Soldier creature token and a Food token. (A Food token is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nII, III — You may put an Aura or Equipment card from your hand or graveyard onto the battlefield. If an Equipment is put onto the battlefield this way, you may attach it to a creature you control.","colors":["W"],"colorIdentity":["W"],"keywords":["Food"],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fc513659-ea88-4d04-82bd-5bb2e740d957.jpg?1783912412","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fc513659-ea88-4d04-82bd-5bb2e740d957.jpg?1783912412","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const holyStrength = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wastes = (): CardDef => ({"oracleId":"05d24b0c-904a-46b6-b42a-96a4d91a0dd4","name":"Wastes","manaCost":"","cmc":0,"typeLine":"Basic Land","supertypes":["Basic"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60682c00-c661-4a9d-8326-f3f014a04e3e.jpg?1783937888","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60682c00-c661-4a9d-8326-f3f014a04e3e.jpg?1783937888","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ancientTomb = (): CardDef => ({"oracleId":"23467047-6dba-4498-b783-1ebc4f74b8c2","name":"Ancient Tomb","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}{C}. This land deals 2 damage to you.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/880ffa23-ed71-4f39-aa66-0953a1f20fe9.jpg?1783929430","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/880ffa23-ed71-4f39-aa66-0953a1f20fe9.jpg?1783929430","commanderLegal":"legal","set":"zne","releasedAt":"2020-09-25","rarity":"mythic","layout":"normal","gameChanger":true}) as CardDef;
const breedingPool = (): CardDef => ({"oracleId":"20283c4a-f1f0-42f0-bc08-6da87474426b","name":"Breeding Pool","manaCost":"","cmc":0,"typeLine":"Land — Forest Island","supertypes":[],"types":["Land"],"subtypes":["Forest","Island"],"oracleText":"({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","colors":[],"colorIdentity":["G","U"],"keywords":[],"producedMana":["G","U"],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/63e4dc07-c742-41bd-8301-861637908fd1.jpg?1784036820","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/63e4dc07-c742-41bd-8301-861637908fd1.jpg?1784036820","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reflectingPool = (): CardDef => ({"oracleId":"67f43ac6-2a58-4b53-b5d7-0330e2a252e2","name":"Reflecting Pool","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add one mana of any type that a land you control could produce.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cbc4281a-b70d-4f96-b309-38e986484829.jpg?1789644471","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cbc4281a-b70d-4f96-b309-38e986484829.jpg?1789644471","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grayOgre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 367: compiles", () => {
  it("every card of the round", () => supported(charmaw(), manaWeb(), herald(), ascension(), vault()));
});

describe("Obsidian Charmaw", () => {
  it("costs {1} less for each land your opponents control that could produce {C}, whether or not it could be activated now", () => {
    const { s: s0, ap, ids } = setup([charmaw()]);
    const [b, c] = [s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!];
    putOnBattlefield(s0, b, wastes());
    const tomb = putOnBattlefield(s0, b, ancientTomb());
    s0.objects[tomb]!.tapped = true; // tapped still could produce {C} (CR 106.7)
    putOnBattlefield(s0, b, breedingPool()); // {G} or {U}: not {C}
    // Reflecting Pool counts what the other lands its controller controls could produce: {C} with their Wastes.
    putOnBattlefield(s0, c, reflectingPool());
    putOnBattlefield(s0, c, wastes());
    // Your own Wastes doesn't count.
    putOnBattlefield(s0, ap, wastes());
    const plan = planCast(s0, ap, ids[0]!);
    const s = settle(run(s0, plan), ap);
    // {3}{R}{R} less {4}: {R}{R}, then its enters trigger asks for a target (or the bot picks one).
    expect(s.objects[ids[0]!]!.zone === "battlefield" || s.stack.some((x) => x.objectId === ids[0])).toBe(true);
    expect(tappedLands(s, ap)).toBe(2);
  });

  it("a Reflecting Pool whose controller has nothing else that makes {C} doesn't count", () => {
    const { s: s0, ap, ids } = setup([charmaw()]);
    const b = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s0, b, reflectingPool());
    putOnBattlefield(s0, b, breedingPool());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(tappedLands(s, ap)).toBe(5);
  });
});

describe("Mana Web", () => {
  it("an opponent's land tapped for mana taps their other lands that could produce a type it could, which make no mana", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, manaWeb());
    const pool0 = putOnBattlefield(s0, ap, breedingPool());
    const w = putOnBattlefield(s0, ap, wastes());
    const forestId = landsOf(s0, ap, "Forest")[0]!;
    let s = act(s0, { type: "activateMana", player: ap, objectId: forestId, mana: "G" });
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    s = settle(s, ap);
    // All three Forests and the Breeding Pool ({G} or {U}) are tapped; the Islands, Wastes and the rest aren't.
    for (const id of landsOf(s, ap, "Forest")) expect(s.objects[id]!.tapped).toBe(true);
    expect(s.objects[pool0]!.tapped).toBe(true);
    expect(s.objects[w]!.tapped).toBe(false);
    for (const id of landsOf(s, ap, "Island")) expect(s.objects[id]!.tapped).toBe(false);
    expect(tappedLands(s, ap)).toBe(4);
    expect(s.players[ap]!.manaPool).toMatchObject({ G: 1 });
    expect(pool(s, ap)).toBe(1);
  });

  it("every type the land could produce counts, not only the one it was tapped for; its controller's own lands are spared", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, manaWeb());
    const bp = putOnBattlefield(s0, ap, breedingPool());
    let s = act(s0, { type: "activateMana", player: ap, objectId: bp, mana: "U" });
    s = settle(s, ap);
    for (const id of [...landsOf(s, ap, "Forest"), ...landsOf(s, ap, "Island")]) expect(s.objects[id]!.tapped).toBe(true);
    for (const id of [...landsOf(s, ap, "Mountain"), ...landsOf(s, ap, "Swamp"), ...landsOf(s, ap, "Plains")]) expect(s.objects[id]!.tapped).toBe(false);
    // Mana Web's controller tapping their own land: nothing.
    const t0 = setup([]);
    putOnBattlefield(t0.s, t0.ap, manaWeb());
    let t = act(t0.s, { type: "activateMana", player: t0.ap, objectId: landsOf(t0.s, t0.ap, "Forest")[0]!, mana: "G" });
    t = settle(t, t0.ap);
    expect(tappedLands(t, t0.ap)).toBe(1);
  });
});

/** To `ap`'s next upkeep, with the cumulative upkeep asking whether to pay. */
const toUpkeep = (s0: GameState, ap: PlayerId) => {
  let s = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
  s = passUntil(s, "upkeep", ap);
  return settle(s, ap);
};

describe("Herald of Leshrac", () => {
  it("cumulative upkeep: gain control of a different land you don't control for each age counter; it gets +1/+1 for each", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, herald());
    const theirs = [putOnBattlefield(s0, opp, wastes()), putOnBattlefield(s0, opp, ancientTomb())];
    let s = toUpkeep(s0, ap);
    expect(s.objects[h]!.counters.age).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    // Two lands it could take (not targets): it asks which one.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...theirs].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [theirs[1]!] }), ap);
    expect(s.objects[h]!.zone).toBe("battlefield");
    expect(landsOf(s, ap, "Ancient Tomb").length).toBe(1);
    expect(landsOf(s, opp, "Wastes").length).toBe(1);
    const ch = characteristics(s, s.objects[h]!);
    expect([ch.power, ch.toughness]).toEqual([3, 5]);
  });

  it("with fewer lands you don't control than age counters it can't be paid and is sacrificed", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, herald());
    s0.objects[h]!.counters.age = 1;
    putOnBattlefield(s0, opp, wastes());
    const s = toUpkeep(s0, ap);
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(landsOf(s, opp, "Wastes").length).toBe(1);
  });

  it("declining sacrifices it; when it leaves, each land you control but don't own goes back to its owner, however you got it", () => {
    const { s: s0, ap, opp, ids } = setup([bounce]);
    const h = putOnBattlefield(s0, ap, herald());
    const stolen = putOnBattlefield(s0, opp, wastes());
    const other = putOnBattlefield(s0, opp, ancientTomb());
    // A land taken some other way.
    addEffect(s0, ap, [stolen], [{ kind: "control" }], "game");
    expect(landsOf(s0, ap, "Wastes").length).toBe(1);
    const ch = characteristics(s0, s0.objects[h]!);
    expect([ch.power, ch.toughness]).toEqual([3, 5]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: h }])), ap);
    expect(s.objects[h]!.zone).toBe("hand");
    expect(landsOf(s, opp, "Wastes").length).toBe(1);
    expect(landsOf(s, opp, "Ancient Tomb").length).toBe(1);
    void other;
    // Declining the upkeep: sacrificed.
    const t0 = setup([]);
    const h2 = putOnBattlefield(t0.s, t0.ap, herald());
    putOnBattlefield(t0.s, t0.opp, wastes());
    let t = toUpkeep(t0.s, t0.ap);
    expect(t.pending).toMatchObject({ kind: "chooseMay", player: t0.ap });
    t = settle(act(t, { type: "chooseMay", player: t0.ap, yes: false }), t0.ap);
    expect(t.objects[h2]!.zone).toBe("graveyard");
  });
});

describe("Pyromancer Ascension", () => {
  it("a quest counter for an instant or sorcery with the same name as a card in your graveyard; not for another name", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt(), shock()]);
    const asc = putOnBattlefield(s0, ap, ascension());
    into(s0, ap, lightningBolt(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[asc]!.counters.quest).toBe(1);
    expect(life(s, opp)).toBe(37);
    // Shock: no Shock in the graveyard, no trigger.
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[asc]!.counters.quest).toBe(1);
    expect(life(s, opp)).toBe(35);
  });

  it("with two quest counters already on it, it may copy the spell; the second counter put by that spell is too late", () => {
    const { s: s0, ap, opp, ids } = setup([shock(), lightningBolt()]);
    const asc = putOnBattlefield(s0, ap, ascension());
    s0.objects[asc]!.counters.quest = 1;
    into(s0, ap, lightningBolt(), "graveyard");
    // The Bolt makes the second counter, but it had only one as it was cast: no copy.
    let s = settle(run(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[asc]!.counters.quest).toBe(2);
    expect(life(s, opp)).toBe(37);
    // Now any instant or sorcery may be copied.
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    // The copy may be aimed elsewhere: at the next opponent instead (CR 707.10c).
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: other }] }), ap);
    expect(s.pending).toBeFalsy();
    expect(life(s, opp)).toBe(35);
    expect(life(s, other)).toBe(38);
  });
});

describe("Vault 101: Birthday Party", () => {
  it("II: an Equipment card from your graveyard onto the battlefield, then attached to a creature you choose", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, vault());
    s0.objects[saga]!.counters.lore = 1;
    const ogre = putOnBattlefield(s0, ap, grayOgre());
    const ogre2 = putOnBattlefield(s0, ap, grayOgre());
    const eq = into(s0, ap, bonesplitter(), "graveyard");
    const aura = into(s0, ap, holyStrength(), "hand");
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = settle(s0, ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([eq, aura].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [eq] }), ap);
    expect(s.objects[eq]!.zone).toBe("battlefield");
    // "You may attach it to a creature you control": which one, or none.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([ogre, ogre2, "none"].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ogre2 }), ap);
    expect(s.objects[eq]!.attachedTo).toBe(ogre2);
    expect(characteristics(s, s.objects[ogre2]!).power).toBe(4);
  });

  it("an Aura card with nothing it could enchant can't be chosen; an Aura put this way isn't attached by the second sentence", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, vault());
    s0.objects[saga]!.counters.lore = 1;
    const eq = into(s0, ap, bonesplitter(), "hand");
    into(s0, ap, holyStrength(), "graveyard");
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = settle(s0, ap);
    // No creature on the battlefield: only the Bonesplitter.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect((s.pending as { cards: string[] }).cards).toEqual([eq]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [eq] }), ap);
    expect(s.objects[eq]!.zone).toBe("battlefield");
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    expect(s.pending).toBeFalsy();
    // III with a creature: the Aura card is chosen, enters attached to what it enchants, and nothing more is asked.
    const t0 = setup([]);
    const saga2 = putOnBattlefield(t0.s, t0.ap, vault());
    t0.s.objects[saga2]!.counters.lore = 2;
    const o = putOnBattlefield(t0.s, t0.ap, grayOgre());
    const a = into(t0.s, t0.ap, holyStrength(), "graveyard");
    putCounters(t0.s, t0.s.objects[saga2]!, "lore", 1);
    let t = settle(t0.s, t0.ap);
    expect(t.pending).toMatchObject({ kind: "searchLibrary", player: t0.ap });
    t = settle(act(t, { type: "searchLibrary", player: t0.ap, found: [a] }), t0.ap);
    expect(t.objects[a]!.attachedTo).toBe(o);
    expect(t.pending).toBeFalsy();
  });
});

describe("Herald of Leshrac under a bot", () => {
  it("the bot answers its cumulative upkeep (pays and picks a land, or lets it go)", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, opp, herald());
    putOnBattlefield(s0, ap, wastes());
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(s.objects[h]!.counters.age ?? 0).toBeGreaterThanOrEqual(s.objects[h]!.zone === "battlefield" ? 1 : 0);
    if (s.objects[h]!.zone === "battlefield") expect(landsOf(s, opp, "Wastes").length).toBe(1);
  });
});
