// Round 278: earlier skips from the top of the popularity list. "Creatures with no abilities" (Muraganda Petroglyphs,
// Ruxa, Patient Professor), a coin for each opponent (Mutalith Vortex Beast), a delayed sacrifice checked as it resolves
// (Angrath, the Flame-Chained), "you may have target creature block it this turn if able" (Grappling Hook), "whenever a
// creature you control fights" (Foe-Razer Regent) and one +1/+1 counter for each creature's combat damage prevented
// (Ironscale Hydra).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, addEffect } from "./helpers";
import { applyAction, castProblem, characteristics, closeZoneBatch, dealDamageBatch, destroyPermanent, moveObject, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets` and "you may"s with `may`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nextOpp = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const muraganda = (): CardDef => ({"oracleId":"e6eff050-f1f6-49ce-a92e-1d1e13e51084","name":"Muraganda Petroglyphs","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures with no abilities get +2/+2.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4091524c-569c-4668-b18a-7f869b1169f3.jpg?1783943095","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4091524c-569c-4668-b18a-7f869b1169f3.jpg?1783943095","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ruxa = (): CardDef => ({"oracleId":"d760f2f0-6653-47c4-bd7b-aab2f398ddf2","name":"Ruxa, Patient Professor","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Legendary Creature — Bear Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bear","Druid"],"oracleText":"Whenever Ruxa enters or attacks, return target creature card with no abilities from your graveyard to your hand.\nCreatures you control with no abilities get +1/+1.\nFor each creature you control with no abilities, you may have that creature assign its combat damage as though it weren't blocked.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e07b8142-6a49-46e7-b862-41f89a59b894.jpg?1783927589","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e07b8142-6a49-46e7-b862-41f89a59b894.jpg?1783927589","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mutalith = (): CardDef => ({"oracleId":"7e6ca948-a66d-46a9-9174-ac7b75d7b348","name":"Mutalith Vortex Beast","manaCost":"{4}{U}{R}","cmc":6,"typeLine":"Creature — Mutant Beast","supertypes":[],"types":["Creature"],"subtypes":["Mutant","Beast"],"oracleText":"Trample\nWarp Vortex — When this creature enters, flip a coin for each opponent you have. For each flip you win, draw a card. For each flip you lose, this creature deals 3 damage to that player.","power":"6","toughness":"6","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Warp Vortex","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a1b6cfe-8927-4d9d-ba32-82453f7157ca.jpg?1783920839","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a1b6cfe-8927-4d9d-ba32-82453f7157ca.jpg?1783920839","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const angrath = (): CardDef => ({"oracleId":"092ceffb-1ee4-452c-b15e-5b79267d42a6","name":"Angrath, the Flame-Chained","manaCost":"{3}{B}{R}","cmc":5,"typeLine":"Legendary Planeswalker — Angrath","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Angrath"],"oracleText":"+1: Each opponent discards a card and loses 2 life.\n−3: Gain control of target creature until end of turn. Untap it. It gains haste until end of turn. Sacrifice it at the beginning of the next end step if it has mana value 3 or less.\n−8: Each opponent loses life equal to the number of cards in their graveyard.","loyalty":"4","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a4d76d03-4fcf-42f8-8c2e-ad6b03d58677.jpg?1783935278","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a4d76d03-4fcf-42f8-8c2e-ad6b03d58677.jpg?1783935278","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hook = (): CardDef => ({"oracleId":"24c193cc-3f83-4414-8cac-8b9f48d5bb6d","name":"Grappling Hook","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has double strike.\nWhenever equipped creature attacks, you may have target creature block it this turn if able.\nEquip {4}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/54c29a90-639b-479d-b822-d5fb54b1d690.jpg?1783942126","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/54c29a90-639b-479d-b822-d5fb54b1d690.jpg?1783942126","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const regent = (): CardDef => ({"oracleId":"e7dd3e2c-34a5-4097-b6d1-2ccd097fe57f","name":"Foe-Razer Regent","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWhen this creature enters, you may have it fight target creature you don't control.\nWhenever a creature you control fights, put two +1/+1 counters on it at the beginning of the next end step.","power":"4","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Flying","Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/04a266c3-de47-4e94-bdc4-210e34981de3.jpg?1783938580","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/04a266c3-de47-4e94-bdc4-210e34981de3.jpg?1783938580","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hydra = (): CardDef => ({"oracleId":"cef72b9b-91b1-47ff-ab6e-91d3c548e98b","name":"Ironscale Hydra","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Hydra","supertypes":[],"types":["Creature"],"subtypes":["Hydra"],"oracleText":"If a creature would deal combat damage to this creature, prevent that damage and put a +1/+1 counter on this creature.","power":"5","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/0215cbbf-7bac-4ff7-bceb-23d728797848.jpg?1783931487","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/0215cbbf-7bac-4ff7-bceb-23d728797848.jpg?1783931487","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jaws = (): CardDef => ({"oracleId":"1202725c-170b-42d7-9f82-a431a987f30e","name":"Jaws, Relentless Predator","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Legendary Creature — Shark","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shark"],"oracleText":"Trample, haste\nWhenever Jaws deals combat damage to a player, create that many Blood tokens. (They're artifacts with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\nWhenever a noncreature artifact is sacrificed or destroyed, Jaws deals 1 damage to each opponent.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c6d16a9e-98c0-46e0-987c-f0de0915a204.jpg?1785419997","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c6d16a9e-98c0-46e0-987c-f0de0915a204.jpg?1785419997","commanderLegal":"legal","set":"sld","releasedAt":"2025-10-13","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const archon = (): CardDef => ({"oracleId":"baff00b8-b109-4e31-942b-38aeb1e45ab2","name":"Archon of Valor's Reach","manaCost":"{4}{G}{W}","cmc":6,"typeLine":"Creature — Archon","supertypes":[],"types":["Creature"],"subtypes":["Archon"],"oracleText":"Flying, vigilance, trample\nAs this creature enters, choose artifact, enchantment, instant, sorcery, or planeswalker.\nPlayers can't cast spells of the chosen type.","power":"5","toughness":"6","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Flying","Vigilance","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c43f47e3-ebb8-4d6e-a00c-4c190e2d3daf.jpg?1783934853","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c43f47e3-ebb8-4d6e-a00c-4c190e2d3daf.jpg?1783934853","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wreck = (): CardDef => ({"oracleId":"8eeb83b4-dca1-497e-a6b7-0485807aeef3","name":"Rise from the Wreck","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to one target creature card, up to one target Mount card, up to one target Vehicle card, and up to one target creature card with no abilities from your graveyard to your hand.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43e6ac32-a7a4-4c15-81b0-8485d6a0e7ca.jpg?1783907866","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43e6ac32-a7a4-4c15-81b0-8485d6a0e7ca.jpg?1783907866","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const vanilla = () => bear({ name: "Test Bear" });
const flyer = card("Test Flyer", "Creature — Bird", "{1}{U}", { cmc: 2, colors: ["U"], power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
const cycler = card("Test Cycler", "Creature — Beast", "{3}{G}", { cmc: 4, colors: ["G"], power: "4", toughness: "4", keywords: ["Cycling"], oracleText: "Cycling {2} ({2}, Discard this card: Draw a card.)" });
const big = card("Test Giant", "Creature — Giant", "{3}{R}", { cmc: 4, colors: ["R"], power: "4", toughness: "4" });

describe("round 278", () => {
  it("every card of the round compiles fully", () => {
    supported(muraganda(), ruxa(), wreck(), mutalith(), angrath(), hook(), regent(), hydra(), jaws(), archon());
  });
});

describe("Muraganda Petroglyphs: creatures with no abilities get +2/+2", () => {
  it("only creatures with no rules text, keywords or granted abilities; one that lost all its abilities counts", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, muraganda());
    const a = putOnBattlefield(s, ap, vanilla());
    const b = putOnBattlefield(s, opp, vanilla());
    const f = putOnBattlefield(s, opp, flyer);
    const c = putOnBattlefield(s, ap, cycler);
    const given = putOnBattlefield(s, opp, vanilla());
    const told = putOnBattlefield(s, opp, vanilla());
    invalidateCharacteristics(s);
    expect([pt(s, a), pt(s, b), pt(s, f)]).toEqual(["4/4", "4/4", "1/1"]);
    // An ability that works only in another zone is still an ability (rulings): the cycler gets nothing.
    expect(pt(s, c)).toBe("4/4");
    // "Gains flying": an ability. "Can't block": something true of it, not an ability (rulings).
    addEffect(s, ap, [given], [{ kind: "addKeywords", keywords: ["Flying"] }]);
    addEffect(s, ap, [told], [{ kind: "cantBlock" }]);
    expect(pt(s, given)).toBe("2/2");
    expect(pt(s, told)).toBe("4/4");
    // A flyer that loses all its abilities has none (CR 613.1f), so it gets +2/+2.
    addEffect(s, ap, [f], [{ kind: "loseAllAbilities" }]);
    expect(pt(s, f)).toBe("3/3");
  });

  it("a land creature with a basic land type has its intrinsic mana ability (rulings)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, muraganda());
    const arbor = putOnBattlefield(s, ap, card("Dryad Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1", colors: ["G"], oracleText: "(Dryad Arbor isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")" }));
    invalidateCharacteristics(s);
    expect(pt(s, arbor)).toBe("1/1");
  });
});

describe("Ruxa, Patient Professor", () => {
  it("returns a creature card with no abilities from your graveyard as it enters; not one with rules text", () => {
    const { s: s0, ap, ids } = setup([ruxa()]);
    const plain = into(s0, ap, vanilla(), "graveyard");
    const texty = into(s0, ap, flyer, "graveyard");
    // The flyer has rules text, so it isn't a legal target.
    expect(() => settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(texty)] })).toThrow(/illegal target/);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(plain)] });
    expect(zone(s, plain)).toBe("hand");
  });

  it("your creatures with no abilities get +1/+1 and may assign their combat damage as though unblocked; not once given an ability", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, ruxa());
    const a = putOnBattlefield(s, ap, vanilla());
    const theirs = putOnBattlefield(s, opp, vanilla());
    const f = putOnBattlefield(s, ap, flyer);
    const given = putOnBattlefield(s, ap, vanilla());
    invalidateCharacteristics(s);
    expect([pt(s, a), pt(s, theirs), pt(s, f)]).toEqual(["3/3", "2/2", "1/1"]);
    expect(characteristics(s, s.objects[a]!).unblockedDamage).toBe(true);
    expect(characteristics(s, s.objects[f]!).unblockedDamage).toBe(false);
    expect(characteristics(s, s.objects[theirs]!).unblockedDamage).toBe(false);
    // An effect giving it an ability applies first in layer 6 (CR 613.8a), whatever the timestamps: no bonus.
    addEffect(s, ap, [given], [{ kind: "addAbility", text: "{T}: You gain 1 life." }]);
    expect(pt(s, given)).toBe("2/2");
    expect(characteristics(s, s.objects[given]!).unblockedDamage).toBe(false);
  });
});

describe("Mutalith Vortex Beast: a coin for each opponent", () => {
  it("draws a card for each flip won and deals 3 damage to each opponent whose flip was lost", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s: s0, ap, ids } = setup([mutalith()], seed);
      const opps = [1, 2, 3].map((n) => nextOpp(s0, ap, n));
      const life = opps.map((p) => s0.players[p]!.life);
      const hand = s0.players[ap]!.hand.length;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const hurt = opps.filter((p, i) => s.players[p]!.life === life[i]! - 3);
      const same = opps.filter((p, i) => s.players[p]!.life === life[i]!);
      expect(hurt.length + same.length, `seed ${seed}`).toBe(3);
      // The Beast left the hand; each flip won drew one.
      expect(s.players[ap]!.hand.length - (hand - 1), `seed ${seed}`).toBe(same.length);
    }
  });
});

describe("Angrath, the Flame-Chained: −3", () => {
  const steal = (victimDef: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    const pw = putOnBattlefield(s0, ap, angrath());
    s0.objects[pw]!.counters.loyalty = 4;
    const victim = putOnBattlefield(s0, opp, victimDef);
    s0.objects[victim]!.tapped = true;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, pw, 1, [tgt(victim)])));
    return { s, ap, opp, victim };
  };

  it("gains control of it, untaps it, gives it haste; sacrificed at the next end step with mana value 3 or less", () => {
    const { s: s1, ap, opp, victim } = steal(vanilla());
    expect(characteristics(s1, s1.objects[victim]!).controller).toBe(ap);
    expect(s1.objects[victim]!.tapped).toBe(false);
    expect(characteristics(s1, s1.objects[victim]!).keywords).toContain("Haste");
    let s = passUntil(s1, "end", ap);
    s = settle(s);
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(victim);
  });

  it("mana value 4: kept until the turn ends, then it goes back (checked as the delayed trigger resolves)", () => {
    const { s: s1, ap, opp, victim } = steal(big);
    let s = passUntil(s1, "end", ap);
    s = settle(s);
    expect(zone(s, victim)).toBe("battlefield");
    s = passUntil(s, "upkeep", nextOpp(s, ap, 1));
    expect(characteristics(s, s.objects[victim]!).controller).toBe(opp);
  });
});

describe("Grappling Hook: you may have target creature block it this turn if able", () => {
  it("the target must block the equipped creature, as it was when the ability triggered", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hook());
    const mine = putOnBattlefield(s0, ap, vanilla());
    s0.objects[h]!.attachedTo = mine;
    const theirs = putOnBattlefield(s0, opp, vanilla());
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[mine]!).keywords).toContain("Double strike");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: opp }] });
    for (let i = 0; i < 50 && !(s.pending?.kind === "declareBlockers"); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [tgt(theirs)] });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p) throw new Error(p.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[theirs]!.provokedBy).toMatchObject({ id: mine, turn: s.turn });
  });
});

describe("Foe-Razer Regent: whenever a creature you control fights, two +1/+1 counters on it at the next end step", () => {
  it("it fights as it enters; the counters come at the beginning of the end step", () => {
    const { s: s0, ap, opp, ids } = setup([regent()]);
    const theirs = putOnBattlefield(s0, opp, vanilla());
    s0.players[ap]!.manaPool.G = 7;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { targets: [tgt(theirs)], may: true });
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, ids[0]!)).toBe("6/7");
  });

  it("declining the fight: nothing fought, no counters", () => {
    const { s: s0, ap, opp, ids } = setup([regent()]);
    const theirs = putOnBattlefield(s0, opp, vanilla());
    s0.players[ap]!.manaPool.G = 7;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(theirs)], may: false });
    expect(zone(s, theirs)).toBe("battlefield");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Ironscale Hydra: a creature's combat damage to it is prevented, one +1/+1 counter for each creature", () => {
  it("two creatures' combat damage: none dealt, two counters; noncombat damage from a creature is dealt", () => {
    const { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, hydra());
    const x = putOnBattlefield(s, opp, big);
    const y = putOnBattlefield(s, opp, vanilla());
    invalidateCharacteristics(s);
    dealDamageBatch(s, [
      { src: objectSource(s, s.objects[x]!), to: { object: h }, n: 4, combat: true },
      { src: objectSource(s, s.objects[y]!), to: { object: h }, n: 2, combat: true },
    ]);
    invalidateCharacteristics(s);
    expect(s.objects[h]!.damage).toBe(0);
    expect(s.objects[h]!.counters["+1/+1"]).toBe(2);
    dealDamageBatch(s, [{ src: objectSource(s, s.objects[y]!), to: { object: h }, n: 2 }]);
    expect(s.objects[h]!.damage).toBe(2);
    expect(s.objects[h]!.counters["+1/+1"]).toBe(2);
  });

  it("damage that can't be prevented is dealt, and the counter is still put on it (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, hydra());
    const x = putOnBattlefield(s, opp, big);
    invalidateCharacteristics(s);
    dealDamageBatch(s, [{ src: { ...objectSource(s, s.objects[x]!), unpreventable: "all" }, to: { object: h }, n: 4, combat: true }]);
    expect(s.objects[h]!.damage).toBe(4);
    expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Rise from the Wreck: up to one target creature card with no abilities", () => {
  it("the fourth target must have no rules text", () => {
    const { s: s0, ap, ids } = setup([wreck()]);
    const plain = into(s0, ap, vanilla(), "graveyard");
    const texty = into(s0, ap, flyer, "graveyard");
    const none: TargetChoice = { kind: "none" };
    expect(planCast(s0, ap, ids[0]!, [none, none, none, tgt(texty)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(texty), none, none, tgt(plain)])));
    expect(zone(s, plain)).toBe("hand");
    expect(zone(s, texty)).toBe("hand");
  });
});

describe("Jaws, Relentless Predator: whenever a noncreature artifact is sacrificed or destroyed", () => {
  const trinket = card("Test Trinket", "Artifact", "{1}", { cmc: 1, oracleText: "" });
  const golem = card("Test Golem", "Artifact Creature — Golem", "{2}", { cmc: 2, power: "2", toughness: "2" });

  it("anyone's, sacrificed or destroyed: 1 damage to each opponent each time; not an artifact creature", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, jaws());
    const a = putOnBattlefield(s0, opp, trinket);
    const b = putOnBattlefield(s0, ap, trinket);
    const g = putOnBattlefield(s0, opp, golem);
    invalidateCharacteristics(s0);
    const opps = [1, 2, 3].map((n) => nextOpp(s0, ap, n));
    const life = opps.map((p) => s0.players[p]!.life);
    destroyPermanent(s0, s0.objects[a]!, "destroyed");
    closeZoneBatch(s0);
    let s = settle(s0);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 1));
    moveObject(s, b, "graveyard", { sacrificed: true });
    closeZoneBatch(s);
    s = settle(s);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 2));
    destroyPermanent(s, s.objects[g]!, "destroyed");
    closeZoneBatch(s);
    s = settle(s);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 2));
    // Put into a graveyard otherwise (not destroyed, not sacrificed): nothing.
    const c = putOnBattlefield(s, opp, trinket);
    moveObject(s, c, "graveyard");
    closeZoneBatch(s);
    s = settle(s);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 2));
  });
});

describe("Archon of Valor's Reach: players can't cast spells of the chosen type", () => {
  const study = card("Test Study", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
  const zap = card("Test Zap", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Zap deals 1 damage to any target." });

  it("chosen as it enters; spells of that type can't be cast by anyone, others can", () => {
    const { s: s0, ap, ids } = setup([archon(), study, zap]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType", player: ap, options: ["Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Sorcery" }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s.players[ap]!.manaPool.U = 1;
    s.players[ap]!.manaPool.R = 1;
    expect(castProblem(s, ap, ids[1]!)).toMatch(/sorcery spells can't be cast/);
    expect(castProblem(s, ap, ids[2]!, [{ kind: "player", id: nextOpp(s, ap, 1) }])).toBeNull();
    // An opponent's sorcery too.
    const theirs = into(s, nextOpp(s, ap, 1), study, "hand");
    expect(castProblem(s, nextOpp(s, ap, 1), theirs)).toMatch(/sorcery spells can't be cast/);
  });
});
