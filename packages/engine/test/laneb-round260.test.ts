// Lane B round B260: Minamo's Meddling (the names of the cards spliced onto the countered spell, CR 702.47a, 608.2h),
// Brutal Suppression and Drought (sacrifices added to the costs of other spells and abilities, CR 601.2f, 602.2b, rulings).

import { describe, expect, it } from "vitest";
import { act, island, putOnBattlefield, setup, swamp } from "./helpers";
import { abilityProblem, applyAction, botActions, castProblem, invalidateCharacteristics, isFullySupported, legalActions, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const minamosMeddling = (): CardDef => ({"oracleId":"6c7239b0-e67f-4848-b244-8be9915bd2dc","name":"Minamo's Meddling","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. That spell's controller reveals their hand, then discards each card with the same name as a card spliced onto that spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/502c4aca-98f8-4c7d-89fd-ee42c938fac7.jpg?1783944206","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/502c4aca-98f8-4c7d-89fd-ee42c938fac7.jpg?1783944206","layout":"normal"});
const glacialRay = (): CardDef => ({"oracleId":"e65a8ab8-84a7-4fe2-b009-ceb87bec6b4e","name":"Glacial Ray","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant — Arcane","supertypes":[],"types":["Instant"],"subtypes":["Arcane"],"oracleText":"Glacial Ray deals 2 damage to any target.\nSplice onto Arcane {1}{R} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)","colors":["R"],"colorIdentity":["R"],"keywords":["Splice"],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/04c713fd-df47-4b35-bd37-ab65d853bdc8.jpg?1783944457","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/04c713fd-df47-4b35-bd37-ab65d853bdc8.jpg?1783944457","layout":"normal"});
const lavaSpike = (): CardDef => ({"oracleId":"2837888c-bfa8-4955-9334-0605ad409f7e","name":"Lava Spike","manaCost":"{R}","cmc":1,"typeLine":"Sorcery — Arcane","supertypes":[],"types":["Sorcery"],"subtypes":["Arcane"],"oracleText":"Lava Spike deals 3 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79c21c1f-eaa4-454d-a1c7-b41466d0a428.jpg?1783933803","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79c21c1f-eaa4-454d-a1c7-b41466d0a428.jpg?1783933803","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});

const brutalSuppression = (): CardDef => ({"oracleId":"b4971aa3-32d1-4bc7-8133-ed67763d2dc6","name":"Brutal Suppression","manaCost":"{R}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Activated abilities of nontoken Rebels cost an additional \"Sacrifice a land\" to activate.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17b3725b-924d-4137-9078-1a28f06c84fa.jpg?1783945780","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17b3725b-924d-4137-9078-1a28f06c84fa.jpg?1783945780","layout":"normal"});
const drought = (): CardDef => ({"oracleId":"ecba74bd-850e-4cbe-9b1c-b0d4d6f27d1c","name":"Drought","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you pay {W}{W}.\nSpells cost an additional \"Sacrifice a Swamp\" to cast for each black mana symbol in their mana costs.\nActivated abilities cost an additional \"Sacrifice a Swamp\" to activate for each black mana symbol in their activation costs.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97736696-3de3-416d-94cf-4fac792f23f0.jpg?1783947527","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97736696-3de3-416d-94cf-4fac792f23f0.jpg?1783947527","layout":"normal"});
const errantDoomsayers = (): CardDef => ({"oracleId":"82d4d70b-afb9-4ae7-8f30-16bc64dccf3e","name":"Errant Doomsayers","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Rebel","supertypes":[],"types":["Creature"],"subtypes":["Human","Rebel"],"oracleText":"{T}: Tap target creature with toughness 2 or less.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61a2daf3-4d66-43f8-beda-285d85eefb57.jpg?1783943255","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61a2daf3-4d66-43f8-beda-285d85eefb57.jpg?1783943255","layout":"normal"});
const trenchingSteed = (): CardDef => ({"oracleId":"31136103-535a-4d11-819a-1cbd57ad48a4","name":"Trenching Steed","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Horse Rebel","supertypes":[],"types":["Creature"],"subtypes":["Horse","Rebel"],"oracleText":"Sacrifice a land: This creature gets +0/+3 until end of turn.","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a359837-2e41-4ddc-9299-89a783d62014.jpg?1783945794","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a359837-2e41-4ddc-9299-89a783d62014.jpg?1783945794","layout":"normal"});
const rathiTrapper = (): CardDef => ({"oracleId":"0920d6aa-eab7-4116-b2f8-b13080d5d7e3","name":"Rathi Trapper","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Human Rebel Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rebel","Rogue"],"oracleText":"{B}, {T}: Tap target creature.","power":"1","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2968e01-2d04-4591-98de-24688bb087df.jpg?1783943150","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2968e01-2d04-4591-98de-24688bb087df.jpg?1783943150","layout":"normal"});
const lawbringer = (): CardDef => ({"oracleId":"15cc92c0-76ce-4b97-b1a2-a7d58bbfe857","name":"Lawbringer","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Kor Rebel","supertypes":[],"types":["Creature"],"subtypes":["Kor","Rebel"],"oracleText":"{T}, Sacrifice this creature: Exile target red creature.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2d76b7e3-6890-4120-8575-732909c8bdff.jpg?1783945843","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2d76b7e3-6890-4120-8575-732909c8bdff.jpg?1783945843","layout":"normal"});
const gravenCairns = (): CardDef => ({"oracleId":"5004b84a-33b7-4f6f-b2c2-7086b9087535","name":"Graven Cairns","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{B/R}, {T}: Add {B}{B}, {B}{R}, or {R}{R}.","colors":[],"colorIdentity":["B","R"],"keywords":[],"producedMana":["B","C","R"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f33cce1-1484-43da-a825-b090eb5403a4.jpg?1783906217","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f33cce1-1484-43da-a825-b090eb5403a4.jpg?1783906217","layout":"normal"});
const signInBlood = (): CardDef => ({"oracleId":"c6207f6a-a624-4754-88f5-dbe700c841ff","name":"Sign in Blood","manaCost":"{B}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player draws two cards and loses 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ef84fcc-7685-41e5-bcd0-25b974ce570f.jpg?1783927434","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ef84fcc-7685-41e5-bcd0-25b974ce570f.jpg?1783927434","layout":"normal"});
const boneSplinters = (): CardDef => ({"oracleId":"0c936582-d4c0-4da8-bc7e-49da5a433939","name":"Bone Splinters","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/0/106b5c96-d1bd-433d-955e-ace0b60d3bc3.jpg?1783921336","artUrl":"https://cards.scryfall.io/art_crop/front/1/0/106b5c96-d1bd-433d-955e-ace0b60d3bc3.jpg?1783921336","layout":"normal"});
const gempalmPolluter = (): CardDef => ({"oracleId":"bd532f8d-789f-4ee1-a2f3-ae30e8282c76","name":"Gempalm Polluter","manaCost":"{5}{B}","cmc":6,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Cycling {B}{B} ({B}{B}, Discard this card: Draw a card.)\nWhen you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield.","power":"4","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8e9943ac-9e3f-4ee0-b5fd-3b0fb17097d8.jpg?1783944913","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8e9943ac-9e3f-4ee0-b5fd-3b0fb17097d8.jpg?1783944913","layout":"normal"});
const pestilence = (): CardDef => ({"oracleId":"dafe63ef-f3d6-45e7-877a-573da92ba85e","name":"Pestilence","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment.\n{B}: This enchantment deals 1 damage to each creature and each player.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/f/2f1f5630-647f-4789-8506-e7fafcbdd671.jpg?1783946341","artUrl":"https://cards.scryfall.io/art_crop/front/2/f/2f1f5630-647f-4789-8506-e7fafcbdd671.jpg?1783946341","layout":"normal"});
const rakdosCackler = (): CardDef => ({"oracleId":"763a2d27-52a8-43d9-b649-0f6c0cf87a07","name":"Rakdos Cackler","manaCost":"{B/R}","cmc":1,"typeLine":"Creature — Devil","supertypes":[],"types":["Creature"],"subtypes":["Devil"],"oracleText":"Unleash (You may have this creature enter with a +1/+1 counter on it. It can't block as long as it has a +1/+1 counter on it.)","power":"1","toughness":"1","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Unleash"],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f873c0b-e779-4f09-8e9c-94a1765eb5da.jpg?1783940326","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f873c0b-e779-4f09-8e9c-94a1765eb5da.jpg?1783940326","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const chameleonColossus = (): CardDef => ({"oracleId":"7b8f1458-c638-4907-9363-f7cc22d04605","name":"Chameleon Colossus","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nProtection from black\n{2}{G}{G}: This creature gets +X/+X until end of turn, where X is its power.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Protection","Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/5459f1e6-7019-427d-9e2d-e494b3cd52d2.jpg?1783942781","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/5459f1e6-7019-427d-9e2d-e494b3cd52d2.jpg?1783942781","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pl = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** `pid`'s cards in hand, put there for the test. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const islands = (s: GameState, pid: PlayerId, n: number) => Array.from({ length: n }, () => putOnBattlefield(s, pid, island));

describe("Minamo's Meddling", () => {
  it("is supported", () => supported(minamosMeddling()));

  it("counters the spell; its controller reveals their hand and discards each card named like a spliced card, the spliced card too", () => {
    const { s: s0, ap, ids, opp } = setup([lavaSpike(), glacialRay(), glacialRay(), lightningBolt()]);
    const [spike, ray, ray2, bolt] = ids as [string, string, string, string];
    const mm = toHand(s0, opp, minamosMeddling());
    islands(s0, opp, 4);
    let s = run(s0, planCast(s0, ap, spike, [pl(opp), pl(opp)], undefined, "auto", undefined, { splice: [ray] }));
    expect(s.stack.at(-1)!.spliced).toEqual(["Glacial Ray"]);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const item = s.stack.at(-1)!;
    s = settle(run(s, planCast(s, opp, mm, [{ kind: "stack", id: item.id }])));
    expect(s.objects[spike]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(40);
    // Both Glacial Rays (the spliced one stayed in the hand, CR 702.47a); Lightning Bolt stays.
    expect(s.objects[ray]!.zone).toBe("graveyard");
    expect(s.objects[ray2]!.zone).toBe("graveyard");
    expect(s.objects[bolt]!.zone).toBe("hand");
    expect(logged(s, /reveals their hand: .*Glacial Ray/)).toBe(true);
  });

  it("a spell with nothing spliced onto it: the hand is revealed and nothing is discarded", () => {
    const { s: s0, ap, ids, opp } = setup([lavaSpike(), glacialRay()]);
    const [spike, ray] = ids as [string, string];
    const mm = toHand(s0, opp, minamosMeddling());
    islands(s0, opp, 4);
    let s = run(s0, planCast(s0, ap, spike, [pl(opp)]));
    expect(s.stack.at(-1)!.spliced).toBeUndefined();
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planCast(s, opp, mm, [{ kind: "stack", id: s.stack.at(-1)!.id }])));
    expect(s.objects[spike]!.zone).toBe("graveyard");
    expect(s.objects[ray]!.zone).toBe("hand");
    expect(logged(s, /reveals their hand: .*Glacial Ray/)).toBe(true);
  });
});

const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** What the plan's cast or activation sacrifices for Brutal Suppression's and Drought's added costs. */
const addedOf = (plan: Action[] | null) => {
  const a = plan?.at(-1);
  return a?.type === "castSpell" ? a.addedSacrifice : a?.type === "activateAbility" ? a.costs?.addedSacrifice : a?.type === "activateMana" ? a.sacrifice : undefined;
};

describe("Brutal Suppression", () => {
  it("is supported", () => supported(brutalSuppression(), errantDoomsayers(), trenchingSteed(), rathiTrapper(), chameleonColossus()));

  it("a nontoken Rebel's ability costs a land sacrificed too: no pick, no plan; with one, the land goes", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, brutalSuppression());
    const ed = putOnBattlefield(s0, ap, errantDoomsayers());
    const bear = putOnBattlefield(s0, opp, rakdosCackler());
    invalidateCharacteristics(s0);
    // A plan made without a pick takes a land itself; the action alone, without one, is refused.
    expect(addedOf(planActivate(s0, ap, ed, 0, [tgt(bear)]))).toHaveLength(1);
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: ed, index: 0, targets: [tgt(bear)] })).toThrow();
    const forest = named(s0, ap, "Forest")[0]!;
    const s = settle(run(s0, planActivate(s0, ap, ed, 0, [tgt(bear)], undefined, undefined, undefined, { addedSacrifice: [forest] })));
    expect(zone(s, forest)).toBe("graveyard");
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(logged(s, /sacrifices Forest/)).toBe(true);
    // A nonland can't pay it.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    putOnBattlefield(s1, opp1, brutalSuppression());
    const ed1 = putOnBattlefield(s1, ap1, errantDoomsayers());
    const other = putOnBattlefield(s1, ap1, hillGiant());
    invalidateCharacteristics(s1);
    expect(abilityProblem(s1, ap1, ed1, 0, [tgt(other)], undefined, undefined, undefined, { addedSacrifice: [other] })).not.toBeNull();
  });

  it("with no land to sacrifice, the ability can't be activated", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, brutalSuppression());
    const ed = putOnBattlefield(s0, ap, errantDoomsayers());
    const target = putOnBattlefield(s0, opp, rakdosCackler());
    for (const id of s0.battlefield.filter((x) => s0.objects[x]!.controller === ap && s0.cards[s0.objects[x]!.cardId]!.types.includes("Land"))) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    invalidateCharacteristics(s0);
    expect(abilityProblem(s0, ap, ed, 0, [tgt(target)])).toMatch(/sacrifice a land/);
  });

  it("a token Rebel's ability, and a non-Rebel's, cost nothing more; a changeling is a Rebel", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, brutalSuppression());
    const ed = putOnBattlefield(s0, ap, errantDoomsayers());
    s0.objects[ed]!.isToken = true;
    const target = putOnBattlefield(s0, opp, rakdosCackler());
    const colossus = putOnBattlefield(s0, ap, chameleonColossus());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, ed, 0, [tgt(target)])));
    expect(s.objects[target]!.tapped).toBe(true);
    expect(addedOf(planActivate(s0, ap, colossus, 0))).toHaveLength(1);
    expect(planActivate(s0, ap, colossus, 0, undefined, undefined, undefined, undefined, { addedSacrifice: [named(s0, ap, "Island")[0]!] })).not.toBeNull();
  });

  it("Trenching Steed: its own land and Brutal Suppression's are two different lands", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, brutalSuppression());
    const steed = putOnBattlefield(s0, ap, trenchingSteed());
    invalidateCharacteristics(s0);
    const [f1, f2] = named(s0, ap, "Forest") as [string, string];
    expect(abilityProblem(s0, ap, steed, 0, undefined, undefined, undefined, undefined, { sacrifice: [f1], addedSacrifice: [f1] })).toMatch(/two costs/);
    const s = settle(run(s0, planActivate(s0, ap, steed, 0, undefined, undefined, undefined, undefined, { sacrifice: [f1], addedSacrifice: [f2] })));
    expect(zone(s, f1)).toBe("graveyard");
    expect(zone(s, f2)).toBe("graveyard");
    expect(s.objects[steed]!.zone).toBe("battlefield");
  });

  it("Rathi Trapper with Drought too: a land and a Swamp, two different permanents", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, brutalSuppression());
    putOnBattlefield(s0, opp, drought());
    const trapper = putOnBattlefield(s0, ap, rathiTrapper());
    const target = putOnBattlefield(s0, opp, hillGiant());
    invalidateCharacteristics(s0);
    const [sw1, sw2] = named(s0, ap, "Swamp") as [string, string];
    const forest = named(s0, ap, "Forest")[0]!;
    expect(abilityProblem(s0, ap, trapper, 0, [tgt(target)], undefined, undefined, undefined, { addedSacrifice: [forest, named(s0, ap, "Island")[0]!] })).not.toBeNull();
    expect(abilityProblem(s0, ap, trapper, 0, [tgt(target)], undefined, undefined, undefined, { addedSacrifice: [sw1] })).not.toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, trapper, 0, [tgt(target)], undefined, undefined, undefined, { addedSacrifice: [forest, sw1] })));
    expect(zone(s, forest)).toBe("graveyard");
    expect(zone(s, sw1)).toBe("graveyard");
    expect(zone(s, sw2)).toBe("battlefield");
    expect(s.objects[target]!.tapped).toBe(true);
  });
});

describe("Drought", () => {
  it("is supported", () => supported(drought(), signInBlood(), boneSplinters(), gempalmPolluter(), pestilence(), rakdosCackler(), gravenCairns()));

  it("a spell costs a Swamp for each black mana symbol in its mana cost, every player's", () => {
    const { s: s0, ap, ids, opp } = setup([signInBlood()]);
    putOnBattlefield(s0, opp, drought());
    putOnBattlefield(s0, ap, swamp);
    invalidateCharacteristics(s0);
    const [sw1, sw2, sw3] = named(s0, ap, "Swamp") as [string, string, string];
    expect(() => act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [pl(opp)] })).toThrow();
    expect(addedOf(planCast(s0, ap, ids[0]!, [pl(opp)]))).toHaveLength(2);
    expect(castProblem(s0, ap, ids[0]!, [pl(opp)], undefined, undefined, undefined, undefined, { addedSacrifice: [sw1] })).not.toBeNull();
    expect(castProblem(s0, ap, ids[0]!, [pl(opp)], undefined, undefined, undefined, undefined, { addedSacrifice: [sw1, named(s0, ap, "Forest")[0]!] })).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [pl(opp)], undefined, "auto", undefined, { addedSacrifice: [sw1, sw2] })));
    expect(zone(s, sw1)).toBe("graveyard");
    expect(zone(s, sw2)).toBe("graveyard");
    expect(zone(s, sw3)).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(38);
  });

  it("a hybrid black symbol counts, whatever pays it; a spell without black costs nothing more", () => {
    const { s: s0, ap, ids, opp } = setup([rakdosCackler(), hillGiant()]);
    putOnBattlefield(s0, opp, drought());
    invalidateCharacteristics(s0);
    const sw = named(s0, ap, "Swamp")[0]!;
    expect(addedOf(planCast(s0, ap, ids[0]!))).toEqual([sw]);
    // Hill Giant has no black symbol: nothing to pick.
    expect(addedOf(planCast(s0, ap, ids[1]!))).toBeUndefined();
    // Paid with red mana only: the hybrid symbol is still black.
    s0.players[ap]!.manaPool.R = 1;
    const s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, addedSacrifice: [sw] });
    expect(zone(s, ids[0]!)).toBe("stack");
    expect(zone(s, sw)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
  });

  it("Bone Splinters: its own creature and Drought's Swamp, picked apart", () => {
    const { s: s0, ap, ids, opp } = setup([boneSplinters()]);
    putOnBattlefield(s0, opp, drought());
    const mine = putOnBattlefield(s0, ap, hillGiant());
    const theirs = putOnBattlefield(s0, opp, hillGiant());
    invalidateCharacteristics(s0);
    const sw = named(s0, ap, "Swamp")[0]!;
    expect(addedOf(planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, "auto", undefined, { sacrifice: [mine] }))).toEqual([sw]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, "auto", undefined, { sacrifice: [mine], addedSacrifice: [sw] })));
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, sw)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("activated abilities: Pestilence's {B} and Gempalm Polluter's cycling {B}{B} from the hand", () => {
    const { s: s0, ap, ids, opp } = setup([gempalmPolluter()]);
    putOnBattlefield(s0, opp, drought());
    const pest = putOnBattlefield(s0, ap, pestilence());
    putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, ap, swamp);
    invalidateCharacteristics(s0);
    const swamps = named(s0, ap, "Swamp");
    expect(addedOf(planActivate(s0, ap, pest, 0))).toHaveLength(1);
    let s = settle(run(s0, planActivate(s0, ap, pest, 0, undefined, undefined, undefined, undefined, { addedSacrifice: [swamps[0]!] })));
    expect(zone(s, swamps[0]!)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(39);
    const cyc = 0; // Cycling {B}{B}, its only activated ability
    expect(addedOf(planActivate(s, ap, ids[0]!, cyc))).toHaveLength(2);
    s = settle(run(s, planActivate(s, ap, ids[0]!, cyc, undefined, undefined, undefined, undefined, { addedSacrifice: [swamps[1]!, swamps[2]!] })));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, swamps[1]!)).toBe("graveyard");
    expect(zone(s, swamps[2]!)).toBe("graveyard");
  });

  it("a mana ability with a black hybrid symbol (Graven Cairns): a Swamp picked as it's activated, never paid automatically", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, drought());
    const cairns = putOnBattlefield(s0, ap, gravenCairns());
    invalidateCharacteristics(s0);
    const sw = named(s0, ap, "Swamp") as [string, string];
    s0.players[ap]!.manaPool.R = 1;
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: cairns, mana: "B", ability: 1, combo: 0 })).toThrow(/Swamp/);
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: cairns, mana: "B", ability: 1, combo: 0, sacrifice: [named(s0, ap, "Forest")[0]!] })).toThrow();
    const s = act(s0, { type: "activateMana", player: ap, objectId: cairns, mana: "B", ability: 1, combo: 0, sacrifice: [sw[0]] });
    expect(zone(s, sw[0])).toBe("graveyard");
    expect(s.players[ap]!.manaPool.B).toBe(2);
    expect(legalActions(s0, ap).some((a) => a.type === "activateMana" && a.objectId === cairns && a.ability === 1 && a.sacrifice?.length === 1)).toBe(true);
  });

  it("bots play on with Drought out (no unpaid sacrifice ever asked of the engine)", () => {
    const { s: s0, ap, opp } = setup([signInBlood(), rakdosCackler()]);
    putOnBattlefield(s0, opp, drought());
    putOnBattlefield(s0, ap, pestilence());
    invalidateCharacteristics(s0);
    let s = s0;
    for (let i = 0; i < 60 && !s.over; i++) for (const a of botActions(s, waitingOn(s)!)) s = applyAction(s, a);
    expect(s.log.length).toBeGreaterThan(s0.log.length);
  });
});
