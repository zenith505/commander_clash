// Lane B round B255: Coward // Killer (a split card whose face is named for a creature type, CR 205.3m; "target creature and
// each other creature that shares a creature type with it", CR 702.73a), Whims of the Fates (three piles of permanents each,
// one chosen at random, CR 700.3, rulings) and Gift of Doom ("Morph—Sacrifice another creature.", "As this Aura is turned face
// up, you may attach it to a creature.", CR 702.37e, 704.5m, rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, faceUpAttachOptions, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const whims = (): CardDef => ({"oracleId":"7d359434-eb1b-478e-a745-10e2c564d89f","name":"Whims of the Fates","manaCost":"{5}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Starting with you, each player separates all permanents they control into three piles. Then each player chooses one of their piles at random and sacrifices those permanents. (Piles can be empty.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a7ef2fc3-0072-450b-acab-7d19c4903128.jpg?1783939539","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a7ef2fc3-0072-450b-acab-7d19c4903128.jpg?1783939539","layout":"normal"});
const cowardKiller = (): CardDef => ({"oracleId":"21591447-c045-4317-8d0e-705627aa157b","name":"Coward // Killer","manaCost":"{1}{R} // {2}{R}{R}","cmc":6,"typeLine":"Sorcery // Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature can't block this turn and becomes a Coward in addition to its other types until end of turn.\nTime travel.","colors":["R"],"colorIdentity":["R"],"keywords":["Time Travel"],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/0717b6ee-99f8-4b02-91f4-6ca07a08b2c0.jpg?1783914411","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/0717b6ee-99f8-4b02-91f4-6ca07a08b2c0.jpg?1783914411","layout":"split","faces":[{"name":"Coward","manaCost":"{1}{R}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature can't block this turn and becomes a Coward in addition to its other types until end of turn.\nTime travel.","colors":["R"]},{"name":"Killer","manaCost":"{2}{R}{R}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Killer deals 3 damage to target creature and each other creature that shares a creature type with it.","colors":["R"]}]});
const giftOfDoom = (): CardDef => ({"oracleId":"2dd1450e-902e-480a-9c42-1c47549d2eeb","name":"Gift of Doom","manaCost":"{4}{B}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature has deathtouch and indestructible.\nMorph—Sacrifice another creature. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nAs this Aura is turned face up, you may attach it to a creature.","colors":["B"],"colorIdentity":["B"],"keywords":["Morph","Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad6e1ba7-047b-41a3-8ab4-17a5c5476749.jpg?1783932809","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad6e1ba7-047b-41a3-8ab4-17a5c5476749.jpg?1783932809","layout":"normal"});
const breakOpen = (): CardDef => ({"oracleId":"1fcec3b2-47ba-4c56-9ce1-a4807e8ad262","name":"Break Open","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Turn target face-down creature an opponent controls face up.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/5/a5ae8050-b644-41db-b1e9-d9bad2173485.jpg?1783945058","artUrl":"https://cards.scryfall.io/art_crop/front/a/5/a5ae8050-b644-41db-b1e9-d9bad2173485.jpg?1783945058","layout":"normal"});
const whiteKnight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","layout":"normal"});
const woodlandChangeling = (): CardDef => ({"oracleId":"338f0ab6-f744-4e5a-a358-05e71b93758d","name":"Woodland Changeling","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/a/a/aa41edf8-88a1-46dd-8315-b0afe7e14b7e.jpg?1783942855","artUrl":"https://cards.scryfall.io/art_crop/front/a/a/aa41edf8-88a1-46dd-8315-b0afe7e14b7e.jpg?1783942855","layout":"normal"});
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","layout":"normal"});
const elvishMystic = (): CardDef => ({"oracleId":"3f3b2c10-21f8-4e13-be83-4ef3fa36e123","name":"Elvish Mystic","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const memnite = (): CardDef => ({"oracleId":"7663ac7c-1de3-4250-b96a-fae9dbd66a27","name":"Memnite","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","layout":"normal"});

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const mine = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid);

describe("Lane B round B255", () => {
  it("are fully supported", () => {
    supported(whims(), cowardKiller(), giftOfDoom());
    const gift = compileCard(giftOfDoom());
    expect(gift.faceUpAttach).toBe(true);
    expect(gift.faceDownCast?.costs).toEqual([expect.objectContaining({ kind: "sacrifice", n: 1, other: true, filter: expect.objectContaining({ types: ["Creature"] }) })]);
  });
});

describe("Lane B round B255: Coward // Killer", () => {
  it("Coward: the target can't block this turn and is a Coward in addition to its other types until the turn ends", () => {
    const { s: s0, ap, ids, opp } = setup([cowardKiller()]);
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, "auto", undefined, { face: 0 })));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(subtypes(s, theirs)).toEqual(expect.arrayContaining(["Bear", "Coward"]));
    expect(characteristics(s, s.objects[theirs]!).cantBlock).toBe(true);
    // Its name stays "Coward" for the card, not the creature type ("becomes a ~" would be wrong).
    expect(logged(s, /Coward/)).toBe(true);
    // The next turn it's only a Bear again and can block.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 400 && s.activePlayer === ap; i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(subtypes(s, theirs)).toEqual(["Bear"]);
    expect(characteristics(s, s.objects[theirs]!).cantBlock).toBe(false);
  });

  it("Killer: 3 damage to the target and each other creature sharing a creature type with it, changelings included", () => {
    const { s: s0, ap, ids, opp } = setup([cowardKiller()]);
    const elves = putOnBattlefield(s0, opp, llanowarElves());
    const mystic = putOnBattlefield(s0, ap, elvishMystic());
    const changeling = putOnBattlefield(s0, opp, woodlandChangeling());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const construct = putOnBattlefield(s0, ap, memnite());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(elves)], undefined, "auto", undefined, { face: 1 })));
    expect(zone(s, elves)).toBe("graveyard");
    expect(zone(s, mystic)).toBe("graveyard"); // an Elf too, whoever controls it
    expect(zone(s, changeling)).toBe("graveyard"); // every creature type (CR 702.73a)
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.damage ?? 0).toBe(0);
    expect(zone(s, construct)).toBe("battlefield");
  });

  it("Killer aimed at a changeling hits every creature with a creature type, not a face-down one (it has none, CR 708.2a)", () => {
    const { s: s0, ap, ids, opp } = setup([cowardKiller()]);
    const changeling = putOnBattlefield(s0, opp, woodlandChangeling());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const construct = putOnBattlefield(s0, ap, memnite());
    const hidden = putOnBattlefield(s0, opp, grizzlyBears());
    s0.objects[hidden]!.faceDown = "morph";
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(changeling)], undefined, "auto", undefined, { face: 1 })));
    expect(zone(s, changeling)).toBe("graveyard");
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, construct)).toBe("graveyard");
    expect(zone(s, hidden)).toBe("battlefield");
    expect(s.objects[hidden]!.damage ?? 0).toBe(0);
  });

  it("rulings: with its target illegal as it resolves, Killer deals no damage at all", () => {
    const { s: s0, ap, ids, opp } = setup([cowardKiller()]);
    const elves = putOnBattlefield(s0, opp, llanowarElves());
    const mystic = putOnBattlefield(s0, opp, elvishMystic());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(elves)], undefined, "auto", undefined, { face: 1 }));
    expect(s.stack.length).toBe(1);
    moveObject(s, elves, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, mystic)).toBe("battlefield");
    expect(s.objects[mystic]!.damage ?? 0).toBe(0);
  });
});

describe("Lane B round B255: Whims of the Fates", () => {
  it("starting with its caster, each player makes three piles; one of each is chosen at random and sacrificed", () => {
    const { s: s0, ap, ids } = setup([whims()]);
    const order = [...s0.turnOrder.slice(s0.turnOrder.indexOf(ap)), ...s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap))];
    const others = order.slice(1);
    for (const pid of others) for (let i = 0; i < 3; i++) putOnBattlefield(s0, pid, grizzlyBears());
    const before = mine(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), [ap]);
    // The caster first: the first pile from every permanent they control.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "pile", piles3: 1 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...before].sort());
    const one = before.slice(0, 4);
    s = act(s, { type: "pickPermanents", player: ap, ids: one });
    // Then the second from the rest; the rest is the third.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, piles3: 2 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual(before.filter((id) => !one.includes(id)).sort());
    const two = before.slice(4, 9);
    s = act(s, { type: "pickPermanents", player: ap, ids: two });
    const three = before.slice(9);
    // The others separate theirs next, in turn order from the caster.
    const asked: PlayerId[] = [];
    for (let i = 0; i < 40 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "pickPermanents" && p.piles3 === 1) asked.push(p.player);
      for (const a of botActions(s, p.player)) s = act(s, a);
    }
    s = settle(s);
    expect(asked).toEqual(others);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // Exactly one of the caster's three piles is gone, the other two stay.
    const gone = before.filter((id) => zone(s, id) !== "battlefield");
    expect([one, two, three].some((pile) => pile.length === gone.length && pile.every((id) => gone.includes(id)))).toBe(true);
    expect(logged(s, /separates their permanents into three piles/)).toBe(true);
    expect(logged(s, /of A's is chosen at random|is chosen at random/)).toBe(true);
    // Each other player lost exactly one of their piles too: 0 to 3 of their Bears.
    for (const pid of others) expect(mine(s, pid).length).toBeLessThanOrEqual(3);
  });

  it("rulings: everything in one pile is all or nothing, and piles can be empty", () => {
    const outcomes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s: s0, ap, ids } = setup([whims()], seed);
      const before = mine(s0, ap);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)), [ap]);
      s = act(s, { type: "pickPermanents", player: ap, ids: before });
      // Nothing is left for the second pile, so it isn't asked.
      expect(s.pending?.player === ap && s.pending.kind === "pickPermanents").toBe(false);
      s = settle(s);
      const left = before.filter((id) => zone(s, id) === "battlefield").length;
      expect(left === 0 || left === before.length).toBe(true);
      outcomes.add(left ? "kept" : "lost");
    }
    expect(outcomes).toEqual(new Set(["kept", "lost"]));
  });

  it("a player with no permanents isn't asked; bots split theirs into three even piles", () => {
    const { s: s0, ap, ids } = setup([whims()]);
    const [b, c, d] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!) as [PlayerId, PlayerId, PlayerId];
    for (let i = 0; i < 9; i++) putOnBattlefield(s0, b, grizzlyBears());
    putOnBattlefield(s0, d, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), [ap, b, c, d]);
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b, piles3: 1 });
    const [first] = botActions(s, b);
    expect(first).toMatchObject({ type: "pickPermanents" });
    expect((first as { ids: string[] }).ids.length).toBe(3);
    s = act(s, first!);
    const [second] = botActions(s, b);
    expect((second as { ids: string[] }).ids.length).toBeGreaterThanOrEqual(3);
    expect((second as { ids: string[] }).ids.length).toBeLessThanOrEqual(3);
    s = act(s, second!);
    // C controls nothing: D is next.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: d, piles3: 1 });
    s = settle(s);
    expect(mine(s, b).length).toBe(6);
  });
});

describe("Lane B round B255: Gift of Doom", () => {
  /** Gift of Doom cast face down for {3} by `ap`, with two Bears of theirs. */
  function faceDownGift() {
    const { s: s0, ap, ids, opp } = setup([giftOfDoom()]);
    const fodder = putOnBattlefield(s0, ap, grizzlyBears());
    const keeper = putOnBattlefield(s0, ap, elvishMystic());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    return { s, ap, gift: ids[0]!, fodder, keeper, opp };
  }

  it("turned face up by sacrificing another creature, attached as it's turned face up to a creature chosen with it", () => {
    const { s: s0, ap, gift, fodder, keeper } = faceDownGift();
    // Not itself: it's the face-down 2/2 paying the cost.
    expect(planTurnFaceUp(s0, ap, gift, 0, 0, { sacrifice: [gift] }, undefined, keeper)).toBe(null);
    // The creature chosen to attach it to is chosen with the special action: none given is refused.
    expect(() => run(s0, planTurnFaceUp(s0, ap, gift, 0, 0, { sacrifice: [fodder] }))).toThrow(/attach Gift of Doom/);
    // Not the creature sacrificed for it.
    expect(faceUpAttachOptions(s0, s0.objects[gift]!, [fodder])).not.toContain(fodder);
    expect(() => run(s0, planTurnFaceUp(s0, ap, gift, 0, 0, { sacrifice: [fodder] }, undefined, fodder))).toThrow(/attach Gift of Doom/);
    const s = run(s0, planTurnFaceUp(s0, ap, gift, 0, 0, { sacrifice: [fodder] }, undefined, keeper));
    expect(s.objects[gift]!.faceDown).toBeFalsy();
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.objects[gift]!.attachedTo).toBe(keeper);
    expect(objHasKeyword(s, s.objects[keeper]!, "Deathtouch")).toBe(true);
    expect(objHasKeyword(s, s.objects[keeper]!, "Indestructible")).toBe(true);
    expect(s.pending).toBe(null);
  });

  it("rulings: not attached, it's put into its owner's graveyard; a creature with protection from black can't be chosen, an opponent's can", () => {
    const { s: s0, ap, gift, fodder, keeper, opp } = faceDownGift();
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    invalidateCharacteristics(s0);
    const options = faceUpAttachOptions(s0, s0.objects[gift]!, [fodder]);
    expect(options).toContain(keeper);
    expect(options).toContain(theirs);
    expect(options).not.toContain(knight);
    expect(options).not.toContain(gift);
    expect(() => run(s0, planTurnFaceUp(s0, ap, gift, 0, 0, { sacrifice: [fodder] }, undefined, knight))).toThrow(/attach Gift of Doom/);
    const s = settle(run(s0, planTurnFaceUp(s0, ap, gift, 0, 0, { sacrifice: [fodder] }, undefined, "none")));
    expect(zone(s, gift)).toBe("graveyard");
    expect(logged(s, /Gift of Doom isn't attached to a creature/)).toBe(true);
  });

  it("turned face up by an effect, its controller chooses the creature then", () => {
    const { s: s0, ap, ids, opp } = setup([breakOpen()]);
    const gift = putOnBattlefield(s0, opp, giftOfDoom());
    s0.objects[gift]!.faceDown = "morph";
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(gift)])), [ap, opp]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "faceUpAttach", about: gift });
    expect((s.pending as { options: string[] }).options).toEqual([bears, "none"]);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: bears }));
    expect(s.objects[gift]!.faceDown).toBeFalsy();
    expect(s.objects[gift]!.attachedTo).toBe(bears);
    expect(objHasKeyword(s, s.objects[bears]!, "Indestructible")).toBe(true);
  });

  it("bots attach it to their most valuable creature, and turn it face up only with one to attach it to", () => {
    const { s: s0, ap, ids, opp } = setup([breakOpen()]);
    const gift = putOnBattlefield(s0, opp, giftOfDoom());
    s0.objects[gift]!.faceDown = "morph";
    const small = putOnBattlefield(s0, opp, llanowarElves());
    const big = putOnBattlefield(s0, opp, whiteKnight());
    putOnBattlefield(s0, ap, grizzlyBears());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(gift)])), [ap]);
    expect(s.objects[gift]!.attachedTo).toBeDefined();
    expect([small, big]).toContain(s.objects[gift]!.attachedTo);
    // Its own bot turning it face up: the plan names a creature of its own, not the one it sacrifices.
    const { s: t0, ap: me, gift: g2, fodder, keeper } = faceDownGift();
    const token = putOnBattlefield(t0, me, { ...grizzlyBears(), oracleId: "b255-bear-token", name: "Bear" });
    t0.objects[token]!.isToken = true;
    // Nothing else to do first (the opening hand's lands).
    for (const h of [...t0.players[me]!.hand]) moveObject(t0, h, "library");
    invalidateCharacteristics(t0);
    const plan = botActions(t0, me);
    const up = plan.find((a) => a.type === "turnFaceUp");
    expect(up).toMatchObject({ type: "turnFaceUp", objectId: g2 });
    const { attach, costs } = up as { attach?: string; costs?: { sacrifice?: string[] } };
    expect(costs?.sacrifice).toHaveLength(1);
    expect([fodder, keeper, token]).toContain(attach);
    expect(costs!.sacrifice![0]).not.toBe(attach);
    const t = run(t0, plan);
    expect(t.objects[g2]!.attachedTo).toBe(attach);
    expect(zone(t, costs!.sacrifice![0]!)).not.toBe("battlefield");
    // With only the creature it would sacrifice, it stays face down.
    const u0 = structuredClone(t0);
    moveObject(u0, keeper, "graveyard");
    moveObject(u0, fodder, "graveyard");
    invalidateCharacteristics(u0);
    expect(botActions(u0, me).some((a) => a.type === "turnFaceUp")).toBe(false);
  });
});
