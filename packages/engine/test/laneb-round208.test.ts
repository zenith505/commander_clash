// Lane B round B208: Lumbering Battlement (exile any number until it leaves, +2/+2 for each card exiled with it), Auratouched
// Mage (an Aura that could enchant it, attached if it's still there, else into your hand), Storm Herald (Auras from your
// graveyard attached to creatures you control, exiled at your next end step or if they'd leave), Liberated Livestock (an
// Aura from your hand or graveyard for each token it makes) and Hans Eriksson (the top card attacking, then a reflexive
// fight).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const battlement = (): CardDef => ({"oracleId":"dcf7d099-a726-4388-9744-70d37c5ea860","name":"Lumbering Battlement","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Vigilance\nWhen this creature enters, exile any number of other nontoken creatures you control until it leaves the battlefield.\nThis creature gets +2/+2 for each card exiled with it.","power":"4","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/2469bc93-57ca-4077-bda2-160b4160adad.jpg?1783933721","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/2469bc93-57ca-4077-bda2-160b4160adad.jpg?1783933721","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mage = (): CardDef => ({"oracleId":"3c7ffc6c-88be-4127-a673-fba8c1aa5fa1","name":"Auratouched Mage","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When this creature enters, search your library for an Aura card that could enchant it. If this creature is still on the battlefield, put that Aura card onto the battlefield attached to it. Otherwise, reveal the Aura card and put it into your hand. Then shuffle.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/942d6414-11e1-4822-9c5d-e4f96846a85f.jpg?1783943709","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/942d6414-11e1-4822-9c5d-e4f96846a85f.jpg?1783943709","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const herald = (): CardDef => ({"oracleId":"1692602a-0c44-485c-aadc-c9c70ed70ea8","name":"Storm Herald","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Shaman","supertypes":[],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"Haste\nWhen this creature enters, return any number of Aura cards from your graveyard to the battlefield attached to creatures you control. Exile those Auras at the beginning of your next end step. If those Auras would leave the battlefield, exile them instead of putting them anywhere else.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0594aa2-1c53-4271-a0d0-9002c07f3697.jpg?1783931544","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0594aa2-1c53-4271-a0d0-9002c07f3697.jpg?1783931544","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const livestock = (): CardDef => ({"oracleId":"d080cb03-b3e5-42e8-b289-2ce2151b4cb8","name":"Liberated Livestock","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Cat Bird Ox","supertypes":[],"types":["Creature"],"subtypes":["Cat","Bird","Ox"],"oracleText":"When this creature dies, create a 1/1 white Cat creature token with lifelink, a 1/1 white Bird creature token with flying, and a 2/4 white Ox creature token. For each of those tokens, you may put an Aura card from your hand and/or graveyard onto the battlefield attached to it.","power":"4","toughness":"6","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f22f4c5a-fe42-4511-be96-78e0e807e704.jpg?1783914989","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f22f4c5a-fe42-4511-be96-78e0e807e704.jpg?1783914989","commanderLegal":"legal","set":"woc","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hans = (): CardDef => ({"oracleId":"8a37ac5c-341b-48ab-9b0b-5ef8bf097aab","name":"Hans Eriksson","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Human Scout","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scout"],"oracleText":"Whenever Hans Eriksson attacks, reveal the top card of your library. If it's a creature card, put it onto the battlefield tapped and attacking defending player or a planeswalker they control. Otherwise, put that card into your hand. When you put a creature card onto the battlefield this way, it fights Hans Eriksson.","power":"1","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1bb5d3b3-d92f-4d2a-82cc-8cb166241dc5.jpg?1783928637","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1bb5d3b3-d92f-4d2a-82cc-8cb166241dc5.jpg?1783928637","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId":"706ae742-1807-44b7-a4fa-f2e26f61519a","name":"Wild Growth","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const doubling = (): CardDef => ({"oracleId":"01546b7d-a233-4176-8843-d732074dc5b6","name":"Doubling Season","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mantle = (): CardDef => ({"oracleId":"7424560f-557f-4bc9-a3e7-eb890c73aaa3","name":"Mantle of the Ancients","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\nWhen this Aura enters, return any number of target Aura and/or Equipment cards from your graveyard to the battlefield attached to enchanted creature.\nEnchanted creature gets +1/+1 for each Aura and Equipment attached to it.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/56ec4350-05fa-4452-ade3-3cf2c319eb0b.jpg?1783912368","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/56ec4350-05fa-4452-ade3-3cf2c319eb0b.jpg?1783912368","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ensoul = (): CardDef => ({"oracleId":"02628058-c9d8-4265-afd1-3fb697ec89f7","name":"Ensoul Artifact","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant artifact\nEnchanted artifact is a creature with base power and toughness 5/5 in addition to its other types.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/8351efc5-a392-4ec8-877f-15d5b3dc0929.jpg?1783939194","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/8351efc5-a392-4ec8-877f-15d5b3dc0929.jpg?1783939194","commanderLegal":"legal","set":"m15","releasedAt":"2014-07-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

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
/** Passes until the top of the stack is an ability (the spell under it resolved), or a question. */
const toTrigger = (s: GameState) => {
  for (let i = 0; i < 300 && !s.pending && !(s.stack.length && s.stack[s.stack.length - 1]!.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A new card for `def` in `pid`'s hand, graveyard or library (on top). */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else if (where === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const walker = card("Test Walker", "Legendary Planeswalker — Testwalker", "{3}", { loyalty: "5" });

describe("round B208 cards are supported", () => {
  it("compiles every line", () => supported(battlement(), mage(), herald(), livestock(), hans()));
});

describe("Lumbering Battlement", () => {
  const castIt = () => {
    const { s: s0, ap, ids } = setup([battlement()]);
    const a = putOnBattlefield(s0, ap, bear);
    const b = putOnBattlefield(s0, ap, elf);
    const s = toTrigger(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, me: ids[0]!, a, b };
  };

  it("exiles the creatures chosen as it resolves and gets +2/+2 for each; they come back when it leaves", () => {
    const { s: s1, ap, me, a, b } = castIt();
    const s2 = settle(s1);
    expect(s2.pending).toMatchObject({ kind: "pickPermanents", player: ap, anyNumber: true });
    expect((s2.pending as { options: ObjectId[] }).options).toEqual(expect.arrayContaining([a, b]));
    expect((s2.pending as { options: ObjectId[] }).options).not.toContain(me);
    let s = settle(act(s2, { type: "pickPermanents", player: ap, ids: [a, b] }));
    expect(zoneOf(s, a)).toBe("exile");
    expect(zoneOf(s, b)).toBe("exile");
    expect(pt(s, me)).toBe("8/9");
    moveObject(s, me, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zoneOf(s, a)).toBe("battlefield");
    expect(zoneOf(s, b)).toBe("battlefield");
    expect(controllerOf(s, s.objects[a]!)).toBe(ap);
  });

  it("choosing none leaves it a 4/5; a card that leaves exile stops counting", () => {
    const { s: s1, ap, me, a, b } = castIt();
    const none = settle(act(settle(s1), { type: "pickPermanents", player: ap, ids: [] }));
    expect(pt(none, me)).toBe("4/5");
    expect(zoneOf(none, a)).toBe("battlefield");
    const s = settle(act(settle(s1), { type: "pickPermanents", player: ap, ids: [a, b] }));
    expect(pt(s, me)).toBe("8/9");
    moveObject(s, a, "graveyard");
    invalidateCharacteristics(s);
    expect(pt(s, me)).toBe("6/7");
  });

  it("exiles nothing if it has left the battlefield before its ability resolves", () => {
    const { s: s1, a, me } = castIt();
    moveObject(s1, me, "graveyard");
    invalidateCharacteristics(s1);
    const s = settle(s1);
    expect(s.pending).toBeNull(); // nothing to choose
    expect(zoneOf(s, a)).toBe("battlefield");
  });
});

describe("Auratouched Mage", () => {
  const castIt = () => {
    const { s: s0, ap, ids } = setup([mage()]);
    const p = toZone(s0, ap, pacifism(), "library");
    const w = toZone(s0, ap, wildGrowth(), "library");
    const s = toTrigger(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, me: ids[0]!, p, w };
  };

  it("finds an Aura that could enchant it and puts it onto the battlefield attached to it", () => {
    const { s: s1, ap, me, p, w } = castIt();
    const s2 = settle(s1);
    expect(s2.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s2.pending as { cards: ObjectId[] }).cards;
    expect(cards).toContain(p);
    expect(cards).not.toContain(w); // Wild Growth enchants a land
    const s = settle(act(s2, { type: "searchLibrary", player: ap, found: [p] }));
    expect(zoneOf(s, p)).toBe("battlefield");
    expect(s.objects[p]!.attachedTo).toBe(me);
  });

  it("once it has left, the Aura (one that could have enchanted it) is revealed and put into your hand", () => {
    const { s: s1, ap, me, p, w } = castIt();
    moveObject(s1, me, "graveyard");
    invalidateCharacteristics(s1);
    const s2 = settle(s1);
    expect(s2.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s2.pending as { cards: ObjectId[] }).cards;
    expect(cards).toContain(p);
    expect(cards).not.toContain(w);
    const s = settle(act(s2, { type: "searchLibrary", player: ap, found: [p] }));
    expect(zoneOf(s, p)).toBe("hand");
    expect(s.log.some((l) => /finds a card \(Pacifism\)/.test(l.text))).toBe(true); // revealed
  });
});

describe("Auratouched Mage as it last existed", () => {
  it("made an artifact before it left: an Aura with enchant artifact is found, and goes into your hand", () => {
    const { s: s0, ap, ids } = setup([mage()]);
    const e = toZone(s0, ap, ensoul(), "library");
    const s1 = toTrigger(run(s0, planCast(s0, ap, ids[0]!)));
    const me = ids[0]!;
    const before = settle(s1);
    expect((before.pending as { cards: ObjectId[] }).cards).not.toContain(e); // not an artifact yet
    s1.effects.push({ id: "x1", timestamp: s1.nextTimestamp++, controller: ap, sourceName: "test", duration: "game", affected: [me], mods: [{ kind: "addTypes", types: ["Artifact"], subtypes: [] }] });
    invalidateCharacteristics(s1);
    moveObject(s1, me, "graveyard");
    invalidateCharacteristics(s1);
    const s2 = settle(s1);
    expect((s2.pending as { cards: ObjectId[] }).cards).toContain(e);
    const s = settle(act(s2, { type: "searchLibrary", player: ap, found: [e] }));
    expect(zoneOf(s, e)).toBe("hand");
  });
});

describe("Storm Herald", () => {
  const castIt = () => {
    const { s: s0, ap, ids } = setup([herald()]);
    const a = putOnBattlefield(s0, ap, bear);
    const r = toZone(s0, ap, rancor(), "graveyard");
    const p = toZone(s0, ap, pacifism(), "graveyard");
    const w = toZone(s0, ap, wildGrowth(), "graveyard");
    const s = toTrigger(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, me: ids[0]!, a, r, p, w };
  };

  it("returns the Auras chosen attached to creatures you control, then exiles them at your next end step", () => {
    const { s: s1, ap, me, a, r, p, w } = castIt();
    let s = settle(s1);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    const cards = (s.pending as { cards: ObjectId[] }).cards;
    expect(cards).toEqual(expect.arrayContaining([r, p]));
    expect(cards).not.toContain(w); // no land of yours? it enchants lands, not creatures
    s = act(s, { type: "searchLibrary", player: ap, found: [r, p] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([me, a]));
    s = act(s, { type: "chooseOption", player: ap, choice: a });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: me }));
    expect(s.objects[r]!.attachedTo).toBe(a);
    expect(s.objects[p]!.attachedTo).toBe(me);
    expect(pt(s, a)).toBe("4/2");
    s = passUntil(s, "cleanup", ap);
    expect(zoneOf(s, r)).toBe("exile");
    expect(zoneOf(s, p)).toBe("exile");
  });

  it("an Aura that would leave the battlefield is exiled instead (Rancor doesn't go to the graveyard)", () => {
    const { s: s1, ap, a, r } = castIt();
    let s = act(settle(s1), { type: "searchLibrary", player: ap, found: [r] });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: a });
    s = settle(s);
    expect(s.objects[r]!.attachedTo).toBe(a);
    moveObject(s, a, "graveyard");
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zoneOf(s, r)).toBe("exile");
  });

  it("choosing none returns nothing", () => {
    const { s: s1, ap, r, p } = castIt();
    const s = settle(act(settle(s1), { type: "searchLibrary", player: ap, found: [] }));
    expect(zoneOf(s, r)).toBe("graveyard");
    expect(zoneOf(s, p)).toBe("graveyard");
  });
});

describe("Liberated Livestock", () => {
  const dies = (extra: CardDef[] = []) => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, livestock());
    for (const d of extra) putOnBattlefield(s0, ap, d);
    const p = toZone(s0, ap, pacifism(), "hand");
    const r = toZone(s0, ap, rancor(), "graveyard");
    const w = toZone(s0, ap, wildGrowth(), "graveyard");
    moveObject(s0, me, "graveyard");
    invalidateCharacteristics(s0);
    return { s: settle(act(s0, { type: "passPriority", player: waitingOn(s0)! })), ap, p, r, w };
  };
  const tokensOf = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap);

  it("creates the three tokens, then offers an Aura from your hand or graveyard for each, each card once", () => {
    let { s, ap, p, r, w } = dies();
    const toks = tokensOf(s, ap);
    expect(toks).toHaveLength(3);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "auraForToken", player: ap });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toEqual(expect.arrayContaining([p, r, "none"]));
    expect(opts).not.toContain(w);
    s = act(s, { type: "chooseOption", player: ap, choice: r });
    expect((s.pending as { options: string[] }).options).not.toContain(r);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect((s.pending as { options: string[] }).options).toEqual([p, "none"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: p }));
    const host = (id: ObjectId) => s.objects[s.objects[id]!.attachedTo!]!;
    expect(zoneOf(s, r)).toBe("battlefield");
    expect(zoneOf(s, p)).toBe("battlefield");
    expect(host(r).isToken).toBe(true);
    expect(host(p).isToken).toBe(true);
    expect(host(r).id).not.toBe(host(p).id);
    expect(zoneOf(s, w)).toBe("graveyard");
  });

  it("with Doubling Season, each extra token is offered an Aura too", () => {
    let { s, ap } = dies([doubling()]);
    expect(tokensOf(s, ap)).toHaveLength(6);
    let asked = 0;
    while (s.pending?.kind === "chooseOption" && s.pending.what === "auraForToken") {
      asked++;
      s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    }
    expect(asked).toBe(6);
  });
});

describe("Hans Eriksson", () => {
  const attack = (top: CardDef, opts: { walker?: boolean } = {}) => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, hans());
    const w = opts.walker ? putOnBattlefield(s0, opp, walker) : undefined;
    if (w) s0.objects[w]!.counters.loyalty = 5;
    const t = toZone(s0, ap, top, "library");
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] }));
    return { s, ap, opp, me, t, w };
  };

  it("a creature card enters tapped and attacking the defending player, then fights Hans", () => {
    const { s, opp, me, t } = attack(bear);
    expect(zoneOf(s, t)).toBe("battlefield");
    expect(s.objects[t]!.tapped).toBe(true);
    expect(s.objects[t]!.attacking).toBe(opp);
    expect(s.objects[me]!.damage).toBe(2);
    expect(s.objects[t]!.damage).toBe(1);
  });

  it("any other card goes into your hand, and nothing fights", () => {
    const { s, me, t } = attack(card("Forest", "Basic Land — Forest"));
    expect(zoneOf(s, t)).toBe("hand");
    expect(s.objects[me]!.damage).toBe(0);
  });

  it("asks whether it attacks the defending player or a planeswalker they control", () => {
    const { s: s1, ap, t, w } = attack(bear, { walker: true });
    expect(s1.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom", player: ap });
    expect((s1.pending as { options: string[] }).options).toHaveLength(2);
    const key = (s1.pending as { options: string[] }).options.find((k) => k.includes(":"))!;
    const s = settle(act(s1, { type: "chooseOption", player: ap, choice: key }));
    expect(s.objects[t]!.attackingPermanent?.id).toBe(w);
  });
});
