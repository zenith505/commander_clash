// Round 410: keyword costs a permanent gives the spells you cast "as you cast them". Zinnia, Valley's Voice's "Creature
// spells you cast gain offspring {2} as you cast them." (CR 702.175a-b: an instance beside any of the spell's own, each
// paid once and triggering for its own payment) and Ashling, the Limitless's "Elemental permanent spells you cast from your
// hand gain evoke {4} as you cast them." (CR 702.74a, an alternative cost) with "Whenever you sacrifice a nontoken
// Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end
// step, sacrifice it unless you pay {W}{U}{B}{R}{G}." Either way the permanent keeps the ability that goes with what was
// paid, even once the giver is gone (CR 400.7b, 611.3d, rulings), and doesn't if it has lost its abilities as it enters.

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, applyAction, botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, moveObject, offspringGranted, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const zinnia = (): CardDef => ({"oracleId":"d8c16a3a-dd9d-410c-a5d5-06339a89970f","name":"Zinnia, Valley's Voice","manaCost":"{U}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Bird Bard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird","Bard"],"oracleText":"Flying\nZinnia gets +X/+0, where X is the number of other creatures you control with base power 1.\nCreature spells you cast gain offspring {2} as you cast them. (You may pay an additional {2} as you cast a creature spell. If you do, when that creature enters, create a 1/1 token copy of it.)","power":"1","toughness":"3","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/6263bd74-3f44-4206-8d4d-f90c333b601d.jpg?1783910705","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/6263bd74-3f44-4206-8d4d-f90c333b601d.jpg?1783910705","commanderLegal":"legal","set":"blc","releasedAt":"2024-08-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ashling = (): CardDef => ({"oracleId":"77a9e7cf-76e9-4323-8504-a5b831de00be","name":"Ashling, the Limitless","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Elemental Sorcerer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Sorcerer"],"oracleText":"Elemental permanent spells you cast from your hand gain evoke {4} as you cast them. (If you cast a spell for its evoke cost, it's sacrificed when it enters.)\nWhenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/5924c01f-2815-4e37-b700-3ba6cc81e0e4.jpg?1783904607","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/5924c01f-2815-4e37-b700-3ba6cc81e0e4.jpg?1783904607","commanderLegal":"legal","set":"ecc","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mulldrifter = (): CardDef => ({"oracleId":"24d0f5e7-0d9e-4b76-900e-a7274e80312d","name":"Mulldrifter","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Evoke"],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bdcae2f-fcf3-4dfd-8818-606d16a03beb.jpg?1783925153","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bdcae2f-fcf3-4dfd-8818-606d16a03beb.jpg?1783925153","commanderLegal":"legal","set":"sld","releasedAt":"2021-11-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const airElemental = (): CardDef => ({"oracleId":"7744bae4-a8b7-44a5-9b4c-0048ad4cc448","name":"Air Elemental","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Flying","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0fc9ba0a-2840-48cb-8cf4-ef2a5f273849.jpg?1783935788","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0fc9ba0a-2840-48cb-8cf4-ef2a5f273849.jpg?1783935788","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const swordmaster = (): CardDef => ({"oracleId":"523d075d-b577-4f24-8c14-9a76761a2eaf","name":"Flowerfoot Swordmaster","manaCost":"{W}","cmc":1,"typeLine":"Creature — Mouse Soldier","supertypes":[],"types":["Creature"],"subtypes":["Mouse","Soldier"],"oracleText":"Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)\nValiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, Mice you control get +1/+0 until end of turn.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Offspring","Valiant"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97ff118f-9c3c-43a2-8085-980c7fe7d227.jpg?1783910861","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97ff118f-9c3c-43a2-8085-980c7fe7d227.jpg?1783910861","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const humility = (): CardDef => ({"oracleId":"ed7bdb3e-5c51-4547-9266-76a791e0b2b0","name":"Humility","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"All creatures lose all abilities and have base power and toughness 1/1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a2fb7128-806b-4148-80fe-eb967f248021.jpg?1783946664","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a2fb7128-806b-4148-80fe-eb967f248021.jpg?1783946664","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":true}) as CardDef;
const outcast = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solitude = (): CardDef => ({"oracleId":"dcb9c2a7-ae54-4ddc-a567-640bf4bf4366","name":"Solitude","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Elemental Incarnation","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Incarnation"],"oracleText":"Flash\nLifelink\nWhen this creature enters, exile up to one other target creature. That creature's controller gains life equal to its power.\nEvoke—Exile a white card from your hand.","power":"3","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Lifelink","Evoke","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/47a6234f-309f-4e03-9263-66da48b57153.jpg?1783926885","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/47a6234f-309f-4e03-9263-66da48b57153.jpg?1783926885","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
/** Applies `pid`'s bot actions until it casts a spell: the state after that cast and the cast action. */
const botUntilCast = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 20; i++) {
    for (const a of botActions(s, pid)) {
      s = act(s, a);
      if (a.type === "castSpell") return { s, cast: a };
    }
  }
  return { s, cast: undefined };
};
const inYard = (s: GameState, pid: PlayerId, name: string) => s.players[pid]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name).length;

describe("Round 410", () => {
  it("are fully supported", () => {
    supported(zinnia(), ashling());
  });
});

describe("Round 410: Zinnia, Valley's Voice", () => {
  it("gives a creature spell offspring {2}: paid, a 1/1 token copy of it is created as it enters", () => {
    const { s: s0, ap, ids } = setup([grizzly()]);
    putOnBattlefield(s0, ap, zinnia());
    invalidateCharacteristics(s0);
    expect(offspringGranted(s0, ap, grizzly()).map((g) => g.cost)).toEqual(["{2}"]);
    const s1 = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { offspring: [1] }));
    expect(tappedLands(s1, ap)).toBe(4); // {1}{G} and {2}
    expect(s1.log.some((l) => /casts Grizzly Bears, paying offspring \{2\} \(from Zinnia, Valley's Voice\)/.test(l.text))).toBe(true);
    const s2 = settle(s1);
    const bears = named(s2, "Grizzly Bears");
    expect(bears.length).toBe(2);
    const token = bears.find((id) => s2.objects[id]!.isToken)!;
    expect(characteristics(s2, s2.objects[token]!).power).toBe(1);
    expect(characteristics(s2, s2.objects[token]!).toughness).toBe(1);
    // The token isn't cast and copies only what's printed, so it has no offspring of its own (rulings): one token.
    expect(bears.filter((id) => s2.objects[id]!.isToken).length).toBe(1);
  });

  it("does nothing when the offspring cost isn't paid", () => {
    const { s: s0, ap, ids } = setup([grizzly()]);
    putOnBattlefield(s0, ap, zinnia());
    invalidateCharacteristics(s0);
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(tappedLands(s1, ap)).toBe(2);
    expect(named(s1, "Grizzly Bears").length).toBe(1);
  });

  it("the permanent keeps the offspring trigger after Zinnia has left (CR 400.7b, 611.3d)", () => {
    const { s: s0, ap, ids } = setup([grizzly()]);
    const z = putOnBattlefield(s0, ap, zinnia());
    invalidateCharacteristics(s0);
    const s1 = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { offspring: [1] }));
    moveObject(s1, z, "graveyard");
    invalidateCharacteristics(s1);
    const s2 = settle(s1);
    expect(named(s2, "Grizzly Bears").length).toBe(2);
  });

  it("is an instance beside the spell's own offspring: each paid apart, each making its own token (CR 702.175b)", () => {
    const { s: s0, ap, ids } = setup([swordmaster()]);
    putOnBattlefield(s0, ap, zinnia());
    invalidateCharacteristics(s0);
    // Its own offspring is its kicker (kicks [0]); Zinnia's is the first granted instance.
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0], offspring: [1] })));
    expect(tappedLands(s1, ap)).toBe(5);
    expect(named(s1, "Flowerfoot Swordmaster").filter((id) => s1.objects[id]!.isToken).length).toBe(2);
    const s2 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { offspring: [1] })));
    expect(named(s2, "Flowerfoot Swordmaster").filter((id) => s2.objects[id]!.isToken).length).toBe(1);
  });

  it("is paid once or not at all, and only for an instance that's there", () => {
    const { s: s0, ap, ids } = setup([grizzly(), airElemental()]);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { offspring: [1] })).toMatch(/instances of offspring/);
    putOnBattlefield(s0, ap, zinnia());
    invalidateCharacteristics(s0);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { offspring: [2] })).toMatch(/once or not at all/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { offspring: [1, 1] })).toMatch(/instances of offspring/);
    // Only creature spells: Zinnia's opponents' spells and noncreature spells get none.
    expect(offspringGranted(s0, ap, humility()).length).toBe(0);
  });

  it("makes no token when the creature has lost its abilities as it enters", () => {
    const { s: s0, ap, ids } = setup([grizzly()]);
    putOnBattlefield(s0, ap, zinnia());
    invalidateCharacteristics(s0);
    const s1 = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { offspring: [1] }));
    // Humility, newer than Zinnia: the trigger Zinnia gave it (with Zinnia's timestamp) is gone as it enters (CR 613.7, rulings).
    putOnBattlefield(s1, ap, humility());
    invalidateCharacteristics(s1);
    const s2 = settle(s1);
    expect(named(s2, "Grizzly Bears").length).toBe(1);
  });

  it("a bot pays offspring with spare mana, not for a legendary creature", () => {
    const { s: s0, ap, ids } = setup([grizzly()]);
    putOnBattlefield(s0, ap, zinnia());
    invalidateCharacteristics(s0);
    // The bot's first creature spell (its land drop first), a Grizzly Bears from its hand (its commander set aside).
    s0.players[ap]!.command = [];
    const { s: s1, cast } = botUntilCast(s0, ap);
    expect(cast?.offspring).toEqual([1]);
    const s2 = settle(s1);
    expect(named(s2, "Grizzly Bears").filter((id) => s2.objects[id]!.isToken).length).toBe(1);
    // A legendary creature's token copy would be lost to the legend rule (CR 704.5j): the bot doesn't pay.
    const { s: s3, ap: ap3 } = setup([]);
    for (const id of [...s3.players[ap3]!.hand]) moveObject(s3, id, "library");
    const legend = putOnBattlefield(s3, ap3, ashling());
    moveObject(s3, legend, "hand");
    putOnBattlefield(s3, ap3, zinnia());
    s3.players[ap3]!.command = [];
    invalidateCharacteristics(s3);
    const { cast: cast3 } = botUntilCast(s3, ap3);
    expect(cast3?.objectId).toBe(legend);
    expect(cast3?.offspring).toBeUndefined();
  });
});

describe("Round 410: Ashling, the Limitless", () => {
  it("gives an Elemental in your hand evoke {4}: it's sacrificed, and Ashling makes a hasty token copy of it", () => {
    const { s: s0, ap, ids } = setup([airElemental()]);
    putOnBattlefield(s0, ap, ashling());
    invalidateCharacteristics(s0);
    expect(altCostsFor(s0, ap, s0.objects[ids[0]!]!).some((a) => a.kind === "grantedEvoke" && a.mana === "{4}")).toBe(true);
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "grantedEvoke" })));
    expect(tappedLands(s1, ap)).toBe(4);
    expect(inYard(s1, ap, "Air Elemental")).toBe(1);
    const tokens = named(s1, "Air Elemental");
    expect(tokens.length).toBe(1);
    expect(s1.objects[tokens[0]!]!.isToken).toBe(true);
    expect(characteristics(s1, s1.objects[tokens[0]!]!).keywords).toContain("Haste");
    expect(characteristics(s1, s1.objects[tokens[0]!]!).power).toBe(4);
  });

  it("at your next end step, the token is sacrificed unless you pay {W}{U}{B}{R}{G}", () => {
    const { s: s0, ap, ids } = setup([airElemental()]);
    putOnBattlefield(s0, ap, ashling());
    invalidateCharacteristics(s0);
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "grantedEvoke" })));
    let s = passUntil(s1, "end", ap);
    s = settle(s, [ap]);
    expect(s.pending?.kind).toBe("chooseMay");
    // {W}{U}{B}{R}{G} in the pool (mana abilities are activated before answering, CR 605.3a).
    for (const c of ["W", "U", "B", "R", "G"] as const) s.players[ap]!.manaPool[c] += 1;
    const declined = settle(act(s, { type: "chooseMay", player: ap, yes: false }), [ap]);
    expect(named(declined, "Air Elemental").length).toBe(0);
    const paid = settle(act(s, { type: "chooseMay", player: ap, yes: true }), [ap]);
    expect(named(paid, "Air Elemental").length).toBe(1);
    // It doesn't go on asking: the delayed trigger was only for that end step.
    const later = passUntil(paid, "end", ap);
    expect(named(settle(later, [ap]), "Air Elemental").length).toBe(1);
  });

  it("an evoked Mulldrifter draws twice: as it enters, and as its token copy enters", () => {
    const { s: s0, ap, ids } = setup([mulldrifter()]);
    putOnBattlefield(s0, ap, ashling());
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "grantedEvoke" })));
    expect(tappedLands(s1, ap)).toBe(4);
    expect(s1.players[ap]!.hand.length).toBe(hand - 1 + 4);
    expect(inYard(s1, ap, "Mulldrifter")).toBe(1);
    expect(named(s1, "Mulldrifter").length).toBe(1);
  });

  it("is only for Elemental permanent spells cast from your hand; a changeling is an Elemental", () => {
    const { s: s0, ap, ids } = setup([grizzly(), outcast()]);
    putOnBattlefield(s0, ap, ashling());
    invalidateCharacteristics(s0);
    expect(altCostsFor(s0, ap, s0.objects[ids[0]!]!).some((a) => a.kind === "grantedEvoke")).toBe(false);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "grantedEvoke" })).not.toBeNull();
    expect(altCostsFor(s0, ap, s0.objects[ids[1]!]!).some((a) => a.kind === "grantedEvoke")).toBe(true);
    // In the graveyard it has no evoke from Ashling.
    moveObject(s0, ids[1]!, "graveyard");
    expect(altCostsFor(s0, ap, s0.objects[ids[1]!]!).some((a) => a.kind === "grantedEvoke")).toBe(false);
  });

  it("the permanent is still sacrificed if Ashling left while it was a spell (rulings)", () => {
    const { s: s0, ap, ids } = setup([airElemental()]);
    const a = putOnBattlefield(s0, ap, ashling());
    invalidateCharacteristics(s0);
    const s1 = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "grantedEvoke" }));
    moveObject(s1, a, "graveyard");
    invalidateCharacteristics(s1);
    const s2 = settle(s1);
    expect(inYard(s2, ap, "Air Elemental")).toBe(1);
    expect(named(s2, "Air Elemental").length).toBe(0); // no Ashling, no token
  });

  it("copies only nontoken Elementals you sacrifice", () => {
    const { s: s0, ap, ids } = setup([grizzly()]);
    putOnBattlefield(s0, ap, ashling());
    invalidateCharacteristics(s0);
    // A Grizzly Bears evoked can't be: it isn't an Elemental. Cast normally and sacrificed some other way, no token.
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const bear = named(s1, "Grizzly Bears")[0]!;
    moveObject(s1, bear, "graveyard", { sacrificed: true });
    const s2 = settle(s1);
    expect(named(s2, "Grizzly Bears").length).toBe(0);
  });

  it("a bot evokes an Elemental for {4} when it can't pay the mana cost", () => {
    const { s: s0, ap, ids } = setup([airElemental()]);
    putOnBattlefield(s0, ap, ashling());
    // Leave exactly four lands untapped: {3}{U}{U} is out of reach, {4} isn't.
    const lands = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.types.includes("Land") && s0.objects[id]!.controller === ap);
    for (const id of lands) s0.objects[id]!.tapped = true;
    for (const id of lands.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name !== "Island").slice(0, 4)) s0.objects[id]!.tapped = false;
    invalidateCharacteristics(s0);
    s0.players[ap]!.command = [];
    const { cast } = botUntilCast(s0, ap);
    expect(cast?.objectId).toBe(ids[0]);
    expect(cast?.alt).toBe("grantedEvoke");
  });
});
