// Lane B round B211: Chromatic Armor (prevention from sources of the last chosen color, chosen again by its {X} ability),
// Call to Arms (white creatures get +1/+1 while the chosen color is the strict most common one among the chosen opponent's
// nontoken permanents; sacrificed otherwise), Nettlevine Blight (a granted end step trigger that sacrifices the permanent
// and moves the Aura on), Strax, Sontaran Nurse (a player chosen at random, then a reflexive fight with a creature of theirs)
// and Merseine (net counters keep the creature tapped; its controller pays the creature's mana cost to remove one).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, activationCost, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const armor = (): CardDef => ({"oracleId":"65b3a40e-1d2b-4b24-996f-c935414ded7d","name":"Chromatic Armor","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAs this Aura enters, choose a color.\nThis Aura enters with a sleight counter on it.\nPrevent all damage that would be dealt to enchanted creature by sources of the last chosen color.\n{X}: Put a sleight counter on this Aura and choose a color. X is the number of sleight counters on this Aura.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/2657e85b-8f77-41fa-9df2-233443efef43.jpg?1783947468","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/2657e85b-8f77-41fa-9df2-233443efef43.jpg?1783947468","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const arms = (): CardDef => ({"oracleId":"72eaaa73-3263-46e9-aa86-5862d3aed20a","name":"Call to Arms","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a color and an opponent.\nWhite creatures get +1/+1 as long as the chosen color is the most common color among nontoken permanents the chosen player controls but isn't tied for most common.\nWhen the chosen color isn't the most common color among nontoken permanents the chosen player controls or is tied for most common, sacrifice this enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a92f0d4a-23d8-47d4-b910-d142e0eefd3d.jpg?1783947529","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a92f0d4a-23d8-47d4-b910-d142e0eefd3d.jpg?1783947529","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const blight = (): CardDef => ({"oracleId":"11132bbe-985d-44fa-a5b4-4b4e0dc3a7cf","name":"Nettlevine Blight","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature or land\nEnchanted permanent has \"At the beginning of your end step, sacrifice this permanent and attach Nettlevine Blight to a creature or land you control.\"","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/dd6b1240-0bc3-401a-9cc3-3acaea871a3d.jpg?1783942885","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/dd6b1240-0bc3-401a-9cc3-3acaea871a3d.jpg?1783942885","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const strax = (): CardDef => ({"oracleId":"ffde2558-2168-4b40-a31a-86d160bdb289","name":"Strax, Sontaran Nurse","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Alien Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Alien","Cleric"],"oracleText":"Vigilance, trample\nGrenades! — {2}, {T}, Sacrifice an artifact: Choose a player at random. When you do, Strax fights another target creature that player controls.\nGlory of Battle — Whenever Strax deals damage to a creature, put a +1/+1 counter on Strax.","power":"5","toughness":"5","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Vigilance","Glory of Battle","Trample","Fight","Grenades!"],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e5aabb06-d4e5-40b5-84a8-4f74d4763567.jpg?1783914383","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e5aabb06-d4e5-40b5-84a8-4f74d4763567.jpg?1783914383","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const merseine = (): CardDef => ({"oracleId":"b6b6e085-eef8-486d-9d66-1b7f1ee7d0dc","name":"Merseine","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nThis Aura enters with three net counters on it.\nEnchanted creature doesn't untap during its controller's untap step if this Aura has a net counter on it.\nPay enchanted creature's mana cost: Remove a net counter from this Aura. Only the controller of the enchanted creature may activate this ability.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2dd197f8-ced0-461a-9672-2720a7b70803.jpg?1783947909","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2dd197f8-ced0-461a-9672-2720a7b70803.jpg?1783947909","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const savannah = (): CardDef => ({"oracleId":"60ba93eb-39e6-4af2-9c66-cd38f72daff2","name":"Savannah Lions","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sol = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or `me` has a question. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const obj = (s: GameState, id: ObjectId) => s.objects[id]!;
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
/** An Aura of `pid`'s put onto the battlefield attached to `host`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, host: ObjectId) => {
  const id = putOnBattlefield(s, pid, def);
  obj(s, id).attachedTo = host;
  invalidateCharacteristics(s);
  return id;
};
const forestDef = (s: GameState, pid: PlayerId) => s.cards[obj(s, s.players[pid]!.library.find((id) => s.cards[obj(s, id).cardId]!.name === "Forest")!).cardId]!;
const answer = (s: GameState, pid: PlayerId, choice: string) => act(s, { type: "chooseOption", player: pid, choice });

describe("round B211 cards are supported", () => {
  it("compiles every line", () => supported(armor(), arms(), blight(), strax(), merseine()));
});

describe("Chromatic Armor", () => {
  it("prevents damage from sources of the color chosen as it entered; its {X} ability (X = sleight counters) puts a counter on it and picks the color anew", () => {
    const { s: s0, ap, ids } = setup([armor(), bolt(), bolt()]);
    const bears = putOnBattlefield(s0, ap, grizzly());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bears }]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = settle(answer(s, ap, "Red"), ap);
    const a = ids[0]!;
    expect(obj(s, a).attachedTo).toBe(bears);
    expect(obj(s, a).counters.sleight).toBe(1);
    // Lightning Bolt is red: its damage is prevented.
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: bears }])), ap);
    expect(obj(s, bears).zone).toBe("battlefield");
    expect(obj(s, bears).damage).toBe(0);
    // X is the number of sleight counters as it's activated: 1 now.
    const ab = abilitiesOf(s, obj(s, a)).activated.findIndex((x) => x.xIs !== undefined);
    const untapped = () => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === ap && !obj(s, id).tapped && characteristics(s, obj(s, id)).types.includes("Land")).length;
    const before = untapped();
    s = run(s, planActivate(s, ap, a, ab));
    expect(before - untapped()).toBe(1);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = settle(answer(s, ap, "Blue"), ap);
    expect(obj(s, a).counters.sleight).toBe(2);
    expect(obj(s, a).chosen?.color).toBe("U");
    // Now the last chosen color is blue: red damage isn't prevented any more.
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: bears }])), ap);
    expect(obj(s, bears).zone).toBe("graveyard");
  });

  it("a bot picks the color its opponents' permanents have", () => {
    const { s: s0, ap, ids, opp } = setup([armor()]);
    const bears = putOnBattlefield(s0, ap, grizzly());
    putOnBattlefield(s0, opp, shivan());
    putOnBattlefield(s0, nextOf(s0, ap, 2), shivan());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bears }]));
    s = settle(s);
    expect(obj(s, ids[0]!).chosen?.color).toBe("R");
  });
});

describe("Call to Arms", () => {
  it("white creatures get +1/+1 while the chosen color is the strict most common among the chosen opponent's nontoken permanents; sacrificed once it's tied", () => {
    const { s: s0, ap, ids, opp } = setup([arms()]);
    const lions = putOnBattlefield(s0, ap, savannah());
    const theirLions = putOnBattlefield(s0, nextOf(s0, ap, 2), savannah());
    putOnBattlefield(s0, opp, shivan());
    putOnBattlefield(s0, opp, shivan());
    putOnBattlefield(s0, opp, serra());
    // A red token isn't counted; a white token wouldn't be either.
    const tok = putOnBattlefield(s0, opp, serra());
    obj(s0, tok).isToken = true;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = settle(answer(s, ap, "Red"), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "player" });
    s = settle(answer(s, ap, String(opp)), ap);
    const me = ids[0]!;
    expect(obj(s, me).zone).toBe("battlefield");
    expect(obj(s, me).chosen).toMatchObject({ color: "R", player: opp });
    // Every white creature, anyone's (rulings).
    expect(`${power(s, obj(s, lions))}/${toughness(s, obj(s, lions))}`).toBe("3/2");
    expect(`${power(s, obj(s, theirLions))}/${toughness(s, obj(s, theirLions))}`).toBe("3/2");
    // A second nontoken white permanent ties red: no bonus, and the state trigger sacrifices it.
    putOnBattlefield(s, opp, serra());
    expect(`${power(s, obj(s, lions))}/${toughness(s, obj(s, lions))}`).toBe("2/1");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(obj(s, me).zone).toBe("graveyard");
  });

  it("a color the opponent has no strict most of is sacrificed at once", () => {
    const { s: s0, ap, ids, opp } = setup([arms()]);
    putOnBattlefield(s0, opp, shivan());
    putOnBattlefield(s0, opp, serra());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    s = settle(answer(s, ap, "Red"), ap);
    s = settle(answer(s, ap, String(opp)), ap);
    expect(obj(s, ids[0]!).zone).toBe("graveyard");
  });

  it("a bot picks a color and the opponent who has the most of it", () => {
    const { s: s0, ap, ids } = setup([arms()]);
    const third = nextOf(s0, ap, 2);
    putOnBattlefield(s0, third, shivan());
    putOnBattlefield(s0, third, shivan());
    putOnBattlefield(s0, nextOf(s0, ap, 1), serra());
    putOnBattlefield(s0, nextOf(s0, ap, 1), shivan());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(obj(s, ids[0]!).zone).toBe("battlefield");
    expect(obj(s, ids[0]!).chosen).toMatchObject({ color: "R", player: third });
  });
});

describe("Nettlevine Blight", () => {
  it("at the end step of the enchanted permanent's controller, they sacrifice it and attach the Aura to a creature or land of theirs that they choose", () => {
    const { s: s0, ap, ids, opp } = setup([blight()]);
    const bears = putOnBattlefield(s0, opp, grizzly());
    const elf = putOnBattlefield(s0, opp, elves());
    const land = putOnBattlefield(s0, opp, forestDef(s0, ap));
    putOnBattlefield(s0, nextOf(s0, ap, 2), grizzly());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bears }])), ap);
    const b = ids[0]!;
    expect(obj(s, b).attachedTo).toBe(bears);
    // Not at its controller's end step: the ability is the enchanted creature's.
    s = passUntil(s, "end", ap);
    s = settle(s, ap);
    expect(obj(s, bears).zone).toBe("battlefield");
    s = passUntil(s, "end", opp);
    s = settle(s, opp);
    expect(obj(s, bears).zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant" });
    const options = (s.pending as { options: string[] }).options;
    expect([...options].sort()).toEqual([elf, land].sort());
    expect(options.every((x) => controllerOf(s, obj(s, x)) === opp)).toBe(true);
    s = settle(answer(s, opp, elf), opp);
    expect(obj(s, b).attachedTo).toBe(elf);
    expect(controllerOf(s, obj(s, b))).toBe(ap);
    // The Elf now has the ability.
    expect(characteristics(s, obj(s, elf)).grantedAbilities.length).toBe(1);
  });

  it("a bot moves it onto its least worth creature or land; with nothing to attach to, it goes to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([blight()]);
    const bears = putOnBattlefield(s0, opp, grizzly());
    const dragon = putOnBattlefield(s0, opp, shivan());
    const land = putOnBattlefield(s0, opp, forestDef(s0, ap));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bears }])), ap);
    s = passUntil(s, "end", opp);
    s = settle(s);
    const b = ids[0]!;
    expect(obj(s, bears).zone).toBe("graveyard");
    const host = obj(s, b).attachedTo!;
    expect(host).toBeDefined();
    expect(host).toBe(land);
    expect(obj(s, dragon).zone).toBe("battlefield");
    expect(controllerOf(s, obj(s, host))).toBe(opp);
  });

  it("with no creature or land left, the Aura is put into its owner's graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([blight()]);
    const bears = putOnBattlefield(s0, opp, grizzly());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bears }])), ap);
    s = passUntil(s, "end", opp);
    s = settle(s);
    expect(obj(s, bears).zone).toBe("graveyard");
    expect(obj(s, ids[0]!).zone).toBe("graveyard");
  });
});

describe("Strax, Sontaran Nurse", () => {
  it("chooses a player at random, then fights another creature that player controls, chosen as the reflexive ability goes on the stack", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, strax());
    const ring = putOnBattlefield(s0, ap, sol());
    const mine = putOnBattlefield(s0, ap, grizzly());
    const theirs = new Map<PlayerId, ObjectId>([[ap, mine]]);
    for (const p of s0.turnOrder) if (p !== ap) theirs.set(p, putOnBattlefield(s0, p, grizzly()));
    const i = abilitiesOf(s0, obj(s0, me)).activated.findIndex((a) => a.text.startsWith("Grenades!"));
    let s = run(s0, planActivate(s0, ap, me, i, undefined, undefined, undefined, undefined, { sacrifice: [ring] }));
    expect(obj(s, ring).zone).toBe("graveyard");
    s = settle(s, ap);
    const chosen = s.log.map((l) => /^(.+) is chosen at random for Strax/.exec(typeof l === "string" ? l : (l as { text: string }).text)?.[1]).find(Boolean);
    expect(chosen).toBeDefined();
    const who = s.players.find((p) => p.name === chosen)!.id;
    const victim = theirs.get(who)!;
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, specs: [{ controlledBy: who, notSource: true }] });
    // Only that player's creature, not Strax or another player's.
    for (const [p, id] of theirs) if (p !== who) expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id }] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: me }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: victim }] }), ap);
    expect(obj(s, victim).zone).toBe("graveyard");
    expect(obj(s, me).damage).toBe(2);
    // Glory of Battle: it dealt damage to a creature.
    expect(obj(s, me).counters["+1/+1"]).toBe(1);
    for (const [p, id] of theirs) if (p !== who) expect(obj(s, id).zone).toBe("battlefield");
  });

  it("with no other creature for the chosen player, nothing is fought", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, strax());
    const ring = putOnBattlefield(s0, ap, sol());
    const i = abilitiesOf(s0, obj(s0, me)).activated.findIndex((a) => a.text.startsWith("Grenades!"));
    let s = run(s0, planActivate(s0, ap, me, i, undefined, undefined, undefined, undefined, { sacrifice: [ring] }));
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(obj(s, me).damage).toBe(0);
    expect(obj(s, me).counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Merseine", () => {
  it("enters with three net counters; the creature stays tapped; only its controller may pay its mana cost to remove one", () => {
    const { s: s0, ap, ids, opp } = setup([merseine()]);
    const bears = putOnBattlefield(s0, opp, grizzly());
    obj(s0, bears).tapped = true;
    for (let k = 0; k < 6; k++) putOnBattlefield(s0, opp, forestDef(s0, ap));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: bears }])), ap);
    const m = ids[0]!;
    expect(obj(s, m).counters.net).toBe(3);
    const i = abilitiesOf(s, obj(s, m)).activated.findIndex((a) => !!a.enchantedControllerOnly);
    // Its own controller doesn't control the creature.
    expect(abilityProblem(s, ap, m, i)).toMatch(/only the controller of the creature/);
    expect(activationCost(s, opp, obj(s, m), abilitiesOf(s, obj(s, m)).activated[i]!).symbols).toEqual(activationCost(s, opp, obj(s, bears), { manaCost: "{1}{G}" } as never).symbols);
    // The creature's controller's untap step: still tapped.
    s = passUntil(s, "main1", opp);
    expect(obj(s, bears).tapped).toBe(true);
    // They pay {1}{G} each time, three times.
    for (let k = 0; k < 3; k++) {
      expect(abilityProblem(s, opp, m, i) ?? "").not.toMatch(/only the controller/);
      s = settle(run(s, planActivate(s, opp, m, i)), opp);
    }
    expect(obj(s, m).counters.net ?? 0).toBe(0);
    expect(controllerOf(s, obj(s, m))).toBe(ap);
    s = passUntil(passUntil(s, "upkeep", ap), "main1", opp);
    expect(obj(s, bears).tapped).toBe(false);
  });

  it("the cost is the creature's mana cost as it is now: {0} for Ornithopter, {X} as 0, unpayable for a token with none (CR 107.3h, 118.6)", () => {
    const { s: s0, ap } = setup([]);
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    const m1 = attach(s0, ap, merseine(), thopter);
    obj(s0, m1).counters.net = 3;
    const i = abilitiesOf(s0, obj(s0, m1)).activated.findIndex((a) => !!a.enchantedControllerOnly);
    expect(activationCost(s0, ap, obj(s0, m1), abilitiesOf(s0, obj(s0, m1)).activated[i]!).symbols).toEqual([{ kind: "generic", amount: 0 }]);
    let s = settle(run(s0, planActivate(s0, ap, m1, i)), ap);
    expect(obj(s, m1).counters.net).toBe(2);
    const hydra = putOnBattlefield(s, ap, { ...grizzly(), oracleId: "test-x-hydra", name: "Test Hydra", manaCost: "{X}{G}" } as CardDef);
    const m2 = attach(s, ap, merseine(), hydra);
    expect(activationCost(s, ap, obj(s, m2), abilitiesOf(s, obj(s, m2)).activated[i]!).symbols).toEqual([{ kind: "colored", color: "G" }]);
    const token = putOnBattlefield(s, ap, { ...grizzly(), oracleId: "test-plain-token", name: "Bear Token", manaCost: "" } as CardDef);
    obj(s, token).isToken = true;
    const m3 = attach(s, ap, merseine(), token);
    obj(s, m3).counters.net = 3;
    expect(abilityProblem(s, ap, m3, i)).toMatch(/no mana cost/);
    expect(planActivate(s, ap, m3, i)).toBeNull();
  });

  it("a bot pays at an opponent's end step to free its creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const bears = putOnBattlefield(s0, opp, grizzly());
    obj(s0, bears).tapped = true;
    for (let k = 0; k < 2; k++) putOnBattlefield(s0, opp, forestDef(s0, ap));
    const m = attach(s0, ap, merseine(), bears);
    obj(s0, m).counters.net = 3;
    let s = passUntil(s0, "end", ap);
    for (let k = 0; k < 40 && s.step === "end"; k++) {
      const p = waitingOn(s)!;
      for (const a of p === ap ? [{ type: "passPriority", player: p } as Action] : botActions(s, p)) s = act(s, a);
    }
    expect(obj(s, m).counters.net).toBe(2);
  });
});
