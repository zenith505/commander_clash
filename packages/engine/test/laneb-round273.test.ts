// Lane B round B273: Spellweaver Volute (an Aura enchanting an instant card in a graveyard; whenever you cast a sorcery
// spell, its card is copied and the copy may be cast free from the graveyard, then the card is exiled and the Aura moves
// to another instant card in a graveyard; CR 303.4a, 303.4f, 704.5m, 707.12, 701.3a) and Bludgeon Brawl (each
// noncreature, non-Equipment artifact is an Equipment with equip {X} and "Equipped creature gets +X/+0," X its mana
// value; CR 613.1d, 613.1f, 613.6, 613.8a, 704.5p).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { abilitiesOf, applyAction, characteristics, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const volute = (): CardDef => ({"oracleId":"3d92e5ce-9d30-4203-9f84-6c36117440cf","name":"Spellweaver Volute","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant instant card in a graveyard\nWhenever you cast a sorcery spell, copy the enchanted instant card. You may cast the copy without paying its mana cost. If you do, exile the enchanted card and attach this Aura to another instant card in a graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79cc73ea-3f07-4d11-9961-dc31ac598b73.jpg?1783943116","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79cc73ea-3f07-4d11-9961-dc31ac598b73.jpg?1783943116","layout":"normal"}) as CardDef;
const brawl = (): CardDef => ({"oracleId":"a9aa3bc7-db5a-4792-a53a-40acb6ca4b20","name":"Bludgeon Brawl","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each noncreature, non-Equipment artifact is an Equipment with equip {X} and \"Equipped creature gets +X/+0,\" where X is that artifact's mana value.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a30fa96d-64d1-423e-a62e-d43453ea838d.jpg?1783941309","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a30fa96d-64d1-423e-a62e-d43453ea838d.jpg?1783941309","layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","layout":"normal"}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","layout":"normal"}) as CardDef;
const march = (): CardDef => ({"oracleId":"51092634-308e-4779-aa51-182715dbc734","name":"March of the Machines","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each noncreature artifact is an artifact creature with power and toughness each equal to its mana value. (Equipment that's a creature can't equip a creature.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9bdcc966-7837-463f-ae26-1096f34ac8c0.jpg?1783944553","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9bdcc966-7837-463f-ae26-1096f34ac8c0.jpg?1783944553","layout":"normal"}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","layout":"normal"}) as CardDef;
const ashes = (): CardDef => ({"oracleId":"a75d5b54-5cc9-49c4-8e8c-3bef22d4c01c","name":"Ashes of the Abhorrent","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players can't cast spells from graveyards or activate abilities of cards in graveyards.\nWhenever a creature dies, you gain 1 life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4e8eb264-dadb-440c-af85-273e755f1db6.jpg?1783935806","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4e8eb264-dadb-440c-af85-273e755f1db6.jpg?1783935806","layout":"normal"}) as CardDef;
const cremate = (): CardDef => ({"oracleId":"c6a2e410-b182-48d1-aeb2-bc8de27e9cd2","name":"Cremate","manaCost":"{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target card from a graveyard.\nDraw a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/013d5260-f906-4f6a-97ed-725197743b60.jpg?1783940365","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/013d5260-f906-4f6a-97ed-725197743b60.jpg?1783940365","layout":"normal"}) as CardDef;
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","layout":"normal"}) as CardDef;

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
/** Lets the bots answer every question until `done`. */
const botsUntil = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max && !s.over && !done(s); i++) {
    const pid = waitingOn(s)!;
    for (const a of botActions(s, pid)) s = applyAction(s, a);
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const ptgt = (p: PlayerId) => ({ kind: "player" as const, id: p });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** A fresh copy of `def` in one of `pid`'s zones. */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const abilityIndex = (s: GameState, id: ObjectId, text: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.text === text);

describe("Spellweaver Volute", () => {
  it("is supported", () => supported(volute(), brawl()));

  /** Volute and Divination in your hand; Lightning Bolt in an opponent's graveyard, Shock in yours. */
  const board = (more: CardDef[] = []) => {
    const { s, ap, opp, ids } = setup([volute(), divination(), ...more]);
    const boltCard = putIn(s, opp, bolt(), "graveyard");
    const shockCard = putIn(s, ap, shock(), "graveyard");
    return { s, ap, opp, v: ids[0]!, div: ids[1]!, more: ids.slice(2), boltCard, shockCard };
  };
  /** The board with Volute cast onto Lightning Bolt. */
  const enchanted = (more: CardDef[] = []) => {
    const b = board(more);
    const s = settle(run(b.s, planCast(b.s, b.ap, b.v, [target(b.boltCard)])));
    return { ...b, s };
  };

  it("targets an instant card in a graveyard and stays on the battlefield attached to it", () => {
    const { s: s0, ap, v, boltCard, shockCard } = board();
    // Not a creature or a sorcery card, nor a card in a hand.
    expect(planCast(s0, ap, v, [target(boltCard)])).not.toBeNull();
    expect(planCast(s0, ap, v, [target(shockCard)])).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, v, [target(boltCard)])));
    expect(zone(s, v)).toBe("battlefield");
    expect(s.objects[v]!.attachedTo).toBe(boltCard);
    expect(s.objects[v]!.enchantsCard).toEqual({ id: boltCard, zc: s.objects[boltCard]!.zoneChanges ?? 0 });
    expect(zone(s, boltCard)).toBe("graveyard");
  });

  it("can't target a sorcery card in a graveyard or an instant card in a hand", () => {
    const { s, ap, v, more } = board([bolt()]);
    const sorc = putIn(s, ap, lavaAxe(), "graveyard");
    expect(planCast(s, ap, v, [target(sorc)])).toBeNull();
    expect(planCast(s, ap, v, [target(more[0]!)])).toBeNull();
  });

  it("casting a sorcery: the copy is cast from a graveyard, the card exiled, and ~ moves to the chosen instant card", () => {
    let { s, ap, opp, v, div, boltCard, shockCard } = enchanted();
    // A third instant card, in another opponent's graveyard.
    const other = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const crem = putIn(s, other, cremate(), "graveyard");
    const life = s.players[opp]!.life;
    const cards = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, div)));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    const copy = s.pending.objectId;
    expect(name(s, copy)).toBe("Lightning Bolt");
    // The copy is created in a graveyard (CR 707.12, rulings).
    expect(zone(s, copy)).toBe("graveyard");
    s = run(s, planCast(s, ap, copy, [ptgt(opp)]));
    // Cast: Bolt is exiled and another instant card is chosen (Bolt itself isn't one of them).
    expect(zone(s, boltCard)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect([...s.pending.options].sort()).toEqual([shockCard, crem].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: crem }));
    expect(zone(s, v)).toBe("battlefield");
    expect(s.objects[v]!.attachedTo).toBe(crem);
    expect(s.objects[v]!.enchantsCard?.id).toBe(crem);
    // The copy resolved (3 damage), then Divination (two cards).
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(cards - 1 + 2);
    expect(s.objects[copy]).toBeUndefined();
  });

  it("with only one other instant card, ~ goes to it; with none, it ends up in the graveyard", () => {
    let { s, ap, opp, v, div, shockCard } = enchanted();
    s = settle(run(s, planCast(s, ap, div)));
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    s = settle(run(s, planCast(s, ap, s.pending.objectId, [ptgt(opp)])));
    expect(s.objects[v]!.attachedTo).toBe(shockCard);
    // Now Shock is the only instant card in a graveyard: the next sorcery's copy is cast, Shock exiled, nothing to go to.
    s.players[ap]!.manaPool.U = 3;
    const div2 = putIn(s, ap, divination(), "hand");
    s = settle(run(s, planCast(s, ap, div2)));
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    expect(name(s, s.pending.objectId)).toBe("Shock");
    s = settle(run(s, planCast(s, ap, s.pending.objectId, [ptgt(opp)])));
    expect(zone(s, shockCard)).toBe("exile");
    expect(zone(s, v)).toBe("graveyard");
  });

  it("declining the copy: it ceases to exist, the card stays and so does ~", () => {
    let { s, ap, v, div, boltCard } = enchanted();
    s = settle(run(s, planCast(s, ap, div)));
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    const copy = s.pending.objectId;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[copy]).toBeUndefined();
    expect(s.players[ap]!.graveyard).not.toContain(copy);
    expect(zone(s, boltCard)).toBe("graveyard");
    expect(s.objects[v]!.attachedTo).toBe(boltCard);
  });

  it("instants and other players' sorceries don't trigger it", () => {
    let { s, ap, opp, v, more } = enchanted([bolt()]);
    s = settle(run(s, planCast(s, ap, more[0]!, [ptgt(opp)])));
    expect(s.pending).toBeFalsy();
    expect(logged(s, /copies/)).toBe(false);
    void v;
  });

  it("falls off when the enchanted card leaves the graveyard (rulings)", () => {
    let { s, ap, v, boltCard, more } = enchanted([cremate()]);
    s = settle(run(s, planCast(s, ap, more[0]!, [target(boltCard)])));
    expect(zone(s, boltCard)).toBe("exile");
    expect(zone(s, v)).toBe("graveyard");
  });

  it("the card exiled in response: ~ falls off, and nothing is copied (rulings)", () => {
    let { s, ap, div, v, boltCard } = enchanted();
    s = run(s, planCast(s, ap, div));
    // The trigger is on the stack; the Bolt card is exiled before it resolves.
    expect(s.stack.length).toBe(2);
    moveObject(s, boltCard, "exile");
    s = settle(s);
    expect(zone(s, v)).toBe("graveyard");
    expect(Object.values(s.objects).some((o) => o.spellCopy)).toBe(false);
    expect(logged(s, /isn't enchanting a card/)).toBe(true);
  });

  it("~ gone in response, then the card: it's still copied, as it last enchanted it (rulings)", () => {
    let { s, ap, opp, div, v, boltCard } = enchanted();
    s = run(s, planCast(s, ap, div));
    moveObject(s, v, "graveyard");
    moveObject(s, boltCard, "exile");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    if (s.pending?.kind !== "castFree") throw new Error("no cast");
    expect(name(s, s.pending.objectId)).toBe("Lightning Bolt");
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, s.pending.objectId, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    // Nothing to attach: ~ isn't on the battlefield.
    expect(zone(s, v)).toBe("graveyard");
  });

  it("can't cast the copy under Ashes of the Abhorrent (it's in a graveyard): nothing is exiled", () => {
    let { s, ap, opp, div, v, boltCard } = enchanted();
    putOnBattlefield(s, opp, ashes());
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, div)));
    expect(s.pending).toBeFalsy();
    expect(logged(s, /The copy of Lightning Bolt can't be cast/)).toBe(true);
    expect(zone(s, boltCard)).toBe("graveyard");
    expect(s.objects[v]!.attachedTo).toBe(boltCard);
    expect(Object.values(s.objects).some((o) => o.spellCopy)).toBe(false);
  });

  it("a bot casts the copy and moves ~ on", () => {
    let { s, ap, div, v, boltCard, shockCard } = enchanted();
    s = run(s, planCast(s, ap, div));
    s = botsUntil(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, boltCard)).toBe("exile");
    expect(s.objects[v]!.attachedTo).toBe(shockCard);
  });
});

describe("Bludgeon Brawl", () => {
  /** Brawl, Sol Ring, Mind Stone, Bonesplitter, Ornithopter and Grizzly Bears on your battlefield. */
  const board = () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, brawl());
    const ring = putOnBattlefield(s, ap, solRing());
    const stone = putOnBattlefield(s, ap, mindStone());
    const bone = putOnBattlefield(s, ap, bonesplitter());
    const thopter = putOnBattlefield(s, ap, ornithopter());
    const bear = putOnBattlefield(s, ap, bears());
    invalidateCharacteristics(s);
    return { s, ap, opp, b, ring, stone, bone, thopter, bear };
  };
  const equip = (s: GameState, pid: PlayerId, id: string, cost: string, host: string) => {
    const i = abilityIndex(s, id, cost);
    expect(i, cost).toBeGreaterThanOrEqual(0);
    return settle(run(s, planActivate(s, pid, id, i, [target(host)])));
  };

  it("noncreature, non-Equipment artifacts are Equipment with equip {X} and +X/+0, X their mana value", () => {
    let { s, ap, ring, stone, bone, thopter, bear } = board();
    const c = characteristics(s, s.objects[ring]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Equipment"]);
    expect(abilitiesOf(s, s.objects[ring]!).activated.map((a) => a.text)).toContain("Equip {1}");
    expect(abilitiesOf(s, s.objects[stone]!).activated.map((a) => a.text)).toContain("Equip {2}");
    // Bonesplitter already is an Equipment: only its own equip ability. Ornithopter is a creature: nothing.
    expect(abilitiesOf(s, s.objects[bone]!).activated.filter((a) => /^Equip/.test(a.text)).length).toBe(1);
    expect(characteristics(s, s.objects[thopter]!).subtypes).toEqual(["Thopter"]);
    expect(abilitiesOf(s, s.objects[thopter]!).activated.some((a) => /^Equip/.test(a.text))).toBe(false);
    s = equip(s, ap, ring, "Equip {1}", bear);
    expect(s.objects[ring]!.attachedTo).toBe(bear);
    expect(pt(s, bear)).toBe("3/2");
    s = equip(s, ap, stone, "Equip {2}", bear);
    expect(pt(s, bear)).toBe("5/2");
    // Sol Ring still taps for mana while attached.
    expect(abilitiesOf(s, s.objects[ring]!).mana.length).toBeGreaterThan(0);
  });

  it("affects other players' artifacts too; a second Brawl adds nothing more (CR 613.6, 613.8b)", () => {
    let { s, ap, opp, ring, bear } = board();
    const theirs = putOnBattlefield(s, opp, mindStone());
    putOnBattlefield(s, opp, brawl());
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[theirs]!).subtypes).toEqual(["Equipment"]);
    expect(abilitiesOf(s, s.objects[ring]!).activated.filter((a) => /^Equip/.test(a.text)).length).toBe(1);
    s = equip(s, ap, ring, "Equip {1}", bear);
    expect(pt(s, bear)).toBe("3/2");
  });

  it("an artifact that becomes a creature (March of the Machines) stops being an Equipment and falls off (rulings, CR 704.5p)", () => {
    let { s, ap, ring, bear } = board();
    s = equip(s, ap, ring, "Equip {1}", bear);
    putOnBattlefield(s, ap, march());
    invalidateCharacteristics(s);
    const c = characteristics(s, s.objects[ring]!);
    expect(c.types).toContain("Creature");
    expect(c.subtypes).not.toContain("Equipment");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[ring]!.attachedTo).toBeUndefined();
    expect(zone(s, ring)).toBe("battlefield");
    expect(pt(s, bear)).toBe("2/2");
  });

  it("when Brawl leaves, the artifacts aren't Equipment and become unattached (rulings)", () => {
    let { s, ap, b, ring, bear } = board();
    s = equip(s, ap, ring, "Equip {1}", bear);
    moveObject(s, b, "graveyard");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[ring]!).subtypes).toEqual([]);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[ring]!.attachedTo).toBeUndefined();
    expect(zone(s, ring)).toBe("battlefield");
    expect(pt(s, bear)).toBe("2/2");
  });

  it("a bot equips its artifacts and its turn still ends (it doesn't move them back and forth)", () => {
    const { s: s0, ap, ring, stone, bear } = board();
    const turn = s0.turn;
    const s = botsUntil(s0, (x) => x.turn > turn, 3000);
    expect(s.turn).toBeGreaterThan(turn);
    // On one of its creatures (whichever it judged best).
    const hosts = [s.objects[ring]!.attachedTo, s.objects[stone]!.attachedTo].filter((h) => h !== undefined);
    expect(hosts.length).toBeGreaterThan(0);
    for (const h of hosts) expect(characteristics(s, s.objects[h!]!).types).toContain("Creature");
    void ap; void bear;
  });
});
