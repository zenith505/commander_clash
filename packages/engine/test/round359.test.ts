// Round 359 (Lane A): a token copy of each creature card exiled from graveyards, sacrificed at your next end step (Foggy
// Swamp Visions), three token copies of an artifact or an artifact card in a graveyard (Daretti, Ingenious Iconoclast), a
// creature card from your hand with +1/+1 counters if its mana cost has {X} (The First Tyrannic War), cards a damaged
// creature's controller exiles and may play until the end of their next turn (Expedited Inheritance), token copies of
// permanent cards exiled from your graveyard at random, again while they're land cards (Sin, Spira's Punishment), and a
// creature card exiled with a land returned, the rest to their owner's hand (Northampton Farm).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
const tgt = (id: ObjectId) => ({ kind: "object" as const, id });
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
/** Tokens on the battlefield named `name`. */
const tokens = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id) === name);

// Real oracle text (Scryfall).
const foggy = (): CardDef => ({"oracleId":"16af0a22-833e-47c6-ac27-002702194595","name":"Foggy Swamp Visions","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, waterbend {X}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)\nExile X target creature cards from graveyards. For each creature card exiled this way, create a token that's a copy of it. At the beginning of your next end step, sacrifice those tokens.","colors":["B"],"colorIdentity":["B"],"keywords":["Waterbend"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a46deaa-88f7-4eec-aa99-b85073847918.jpg?1783904969","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a46deaa-88f7-4eec-aa99-b85073847918.jpg?1783904969","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const daretti = (): CardDef => ({"oracleId":"add0f7e7-8990-4fd1-8ac7-8115f7802912","name":"Daretti, Ingenious Iconoclast","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Legendary Planeswalker — Daretti","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Daretti"],"oracleText":"+1: Create a 1/1 colorless Construct artifact creature token with defender.\n−1: You may sacrifice an artifact. If you do, destroy target artifact or creature.\n−6: Choose target artifact card in a graveyard or artifact on the battlefield. Create three tokens that are copies of it.","loyalty":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad30aec2-cb67-4c92-9694-d33bef1884ee.jpg?1783937339","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad30aec2-cb67-4c92-9694-d33bef1884ee.jpg?1783937339","commanderLegal":"legal","set":"cn2","releasedAt":"2016-08-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const tyrannic = (): CardDef => ({"oracleId":"85fd2f65-957e-446b-990a-8711a1e1c4f6","name":"The First Tyrannic War","manaCost":"{2}{G}{U}{R}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — You may put a creature card from your hand onto the battlefield. If its mana cost contains {X}, it enters with a number of +1/+1 counters on it equal to the number of lands you control.\nII, III — Double the number of each kind of counter on target creature you control.","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Double"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64c814f3-8d4e-4c64-ad00-fd8b836b48b1.jpg?1783920851","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64c814f3-8d4e-4c64-ad00-fd8b836b48b1.jpg?1783920851","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const expedited = (): CardDef => ({"oracleId":"11e2f581-7c3c-4f2f-877f-e41540ab967e","name":"Expedited Inheritance","manaCost":"{R}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature is dealt damage, its controller may exile that many cards from the top of their library. They may play those cards until the end of their next turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b65209da-cf48-4d37-b045-7d181070fd05.jpg?1783912881","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b65209da-cf48-4d37-b045-7d181070fd05.jpg?1783912881","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sin = (): CardDef => ({"oracleId":"3bcc378c-4470-4757-a0d5-025a32c918ea","name":"Sin, Spira's Punishment","manaCost":"{4}{B}{G}{U}","cmc":7,"typeLine":"Legendary Creature — Leviathan Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Leviathan","Avatar"],"oracleText":"Flying\nWhenever Sin enters or attacks, exile a permanent card from your graveyard at random, then create a tapped token that's a copy of that card. If the exiled card is a land card, repeat this process.","power":"7","toughness":"7","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/659be746-bd31-4a70-8cec-7798da78b0b5.jpg?1783906563","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/659be746-bd31-4a70-8cec-7798da78b0b5.jpg?1783906563","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const farm = (): CardDef => ({"oracleId":"e05f1a43-16ce-4e88-b0ad-2202efb25516","name":"Northampton Farm","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}: Exile target creature you own.\n{2}, {T}, Sacrifice this land: Return a creature card exiled with this land to the battlefield under your control. Return each other card exiled with this land to its owner's hand.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/d/b/dbca168e-095f-4fbc-88f8-3048d83caf94.jpg?1783904063","artUrl":"https://cards.scryfall.io/art_crop/front/d/b/dbca168e-095f-4fbc-88f8-3048d83caf94.jpg?1783904063","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hangarback = (): CardDef => ({"oracleId":"dde55256-5259-44e7-a267-fca45a7f0d04","name":"Hangarback Walker","manaCost":"{X}{X}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature.\n{1}, {T}: Put a +1/+1 counter on this creature.","power":"0","toughness":"0","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c246b845-dfca-47a3-aa56-074d30590320.jpg?1783937251","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c246b845-dfca-47a3-aa56-074d30590320.jpg?1783937251","commanderLegal":"legal","set":"mps","releasedAt":"2016-09-30","rarity":"special","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const omens = (): CardDef => ({"oracleId":"5f601f48-d24b-4883-9fde-b3f620e7c9ea","name":"Wall of Omens","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender\nWhen this creature enters, draw a card.","power":"0","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79c9e989-b3fd-43ca-b2a5-d051f3b504b3.jpg?1783921774","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79c9e989-b3fd-43ca-b2a5-d051f3b504b3.jpg?1783921774","commanderLegal":"legal","set":"2x2","releasedAt":"2022-07-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("round 359: compiles", () => {
  it("every card of the round", () => supported(foggy(), daretti(), tyrannic(), expedited(), sin(), farm()));
});

describe("Foggy Swamp Visions", () => {
  it("exiles X target creature cards from graveyards, copies each, and sacrifices the tokens at your next end step", () => {
    const { s: s0, ap, opp, ids } = setup([foggy()]);
    const b = toYard(s0, opp, bears());
    const w = toYard(s0, ap, omens());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b), tgt(w)], undefined, "auto", 2)), ap);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[w]!.zone).toBe("exile");
    // A copy of each, under your control; the Wall's copy draws a card as it enters (rulings).
    expect(tokens(s, "Grizzly Bears")).toHaveLength(1);
    expect(tokens(s, "Wall of Omens")).toHaveLength(1);
    expect(s.objects[tokens(s, "Grizzly Bears")[0]!]!.controller).toBe(ap);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(passUntil(s, "end"), ap);
    expect(tokens(s, "Grizzly Bears")).toHaveLength(0);
    expect(tokens(s, "Wall of Omens")).toHaveLength(0);
  });

  it("a target that has left its graveyard isn't exiled or copied", () => {
    const { s: s0, ap, opp, ids } = setup([foggy()]);
    const b = toYard(s0, opp, bears());
    const w = toYard(s0, opp, omens());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(b), tgt(w)], undefined, "auto", 2));
    // The Bears card leaves the graveyard in response (CR 608.2b).
    const yard = s.players[opp]!.graveyard;
    yard.splice(yard.indexOf(b), 1);
    s.players[opp]!.hand.push(b);
    s.objects[b]!.zone = "hand";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s = settle(s, ap);
    expect(s.objects[b]!.zone).toBe("hand");
    expect(tokens(s, "Grizzly Bears")).toHaveLength(0);
    expect(tokens(s, "Wall of Omens")).toHaveLength(1);
  });
});

describe("Daretti, Ingenious Iconoclast", () => {
  const withDaretti = () => {
    const { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, daretti());
    s.objects[d]!.counters.loyalty = 6;
    return { s, ap, opp, d };
  };

  it("−6 on an artifact card in a graveyard: three token copies of the card", () => {
    const { s: s0, ap, opp, d } = withDaretti();
    const m = toYard(s0, opp, mindStone());
    const s = settle(run(s0, planActivate(s0, ap, d, 2, [tgt(m)])), ap);
    expect(tokens(s, "Mind Stone")).toHaveLength(3);
    expect(tokens(s, "Mind Stone").every((id) => s.objects[id]!.controller === ap)).toBe(true);
    // The card stays where it was.
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.objects[d]!.zone).toBe("graveyard");
  });

  it("−6 on an artifact on the battlefield; gone before it resolves, no tokens even with its card in a graveyard (rulings)", () => {
    const { s: s0, ap, opp, d } = withDaretti();
    const m = putOnBattlefield(s0, opp, mindStone());
    let s = settle(run(s0, planActivate(s0, ap, d, 2, [tgt(m)])), ap);
    expect(tokens(s, "Mind Stone")).toHaveLength(3);
    const { s: s1, ap: ap1, opp: opp1, d: d1 } = withDaretti();
    const m1 = putOnBattlefield(s1, opp1, mindStone());
    s = run(s1, planActivate(s1, ap1, d1, 2, [tgt(m1)]));
    // Destroyed in response: its card in the graveyard is a new object (CR 400.7).
    s.battlefield.splice(s.battlefield.indexOf(m1), 1);
    s.objects[m1]!.zone = "graveyard";
    s.objects[m1]!.zoneChanges = (s.objects[m1]!.zoneChanges ?? 0) + 1;
    s.players[opp1]!.graveyard.push(m1);
    invalidateCharacteristics(s);
    s = settle(s, ap1);
    expect(tokens(s, "Mind Stone")).toHaveLength(0);
  });
});

describe("The First Tyrannic War", () => {
  /** The Saga cast; its chapter I trigger waits on `ap`'s choice. */
  const chapterOne = (hand: CardDef[], board: (s: GameState, ap: PlayerId) => void = () => {}) => {
    const { s: s0, ap, ids } = setup([tyrannic(), ...hand]);
    board(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, ids };
  };
  const lands = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
  /** `ap` puts this card from their hand. */
  const answer = (s: GameState, ap: PlayerId, id: ObjectId) => {
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1, fromHand: true });
    return settle(act(s, { type: "searchLibrary", player: ap, found: [id] }), ap);
  };

  it("a creature card with {X} in its mana cost enters with a +1/+1 counter for each land you control", () => {
    let { s, ap, ids } = chapterOne([hangarback()]);
    s = answer(s, ap, ids[1]!);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(lands(s, ap));
    expect(lands(s, ap)).toBeGreaterThan(0);
  });

  it("one without {X} enters with none", () => {
    let { s, ap, ids } = chapterOne([bears()]);
    s = answer(s, ap, ids[1]!);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a Clone entering as a copy of a creature with {X} in its mana cost gets them (rulings)", () => {
    let h = "";
    let { s, ap, ids } = chapterOne([clone()], (s, ap) => {
      h = putOnBattlefield(s, ap, hangarback());
      s.objects[h]!.counters["+1/+1"] = 2;
    });
    s = answer(s, ap, ids[1]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "copy" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: h }), ap);
    const c = s.objects[ids[1]!]!;
    expect(c.zone).toBe("battlefield");
    expect(characteristics(s, c).name).toBe("Hangarback Walker");
    expect(c.counters["+1/+1"]).toBe(lands(s, ap));
  });
});

describe("Expedited Inheritance", () => {
  it("the damaged creature's controller may exile that many cards and play them until the end of their next turn", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    putOnBattlefield(s0, ap, expedited());
    const b = putOnBattlefield(s0, opp, bears());
    const top = s0.players[opp]!.library.slice(0, 2);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])), ap);
    // The Bears died, and its controller (a bot, with a full library) exiled two cards.
    expect(s.objects[b]!.zone).toBe("graveyard");
    for (const id of top) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: opp, until: "nextTurn" });
    }
    // Still theirs after this turn ends, gone once their next turn ends.
    s = passUntil(s, "main1", opp);
    expect(s.objects[top[0]!]!.mayPlay?.player).toBe(opp);
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    expect(s.objects[top[0]!]!.mayPlay).toBeUndefined();
  });

  it("your own creature: you're asked, and declining exiles nothing", () => {
    const { s: s0, ap, ids } = setup([shock(), shock()]);
    putOnBattlefield(s0, ap, expedited());
    const w = putOnBattlefield(s0, ap, omens());
    const lib = s0.players[ap]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(w)])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[ap]!.library.length).toBe(lib);
    const top = s.players[ap]!.library.slice(0, 2);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(w)])), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    for (const id of top) expect(s.objects[id]!).toMatchObject({ zone: "exile", mayPlay: { player: ap, until: "nextTurn" } });
  });
});

describe("Sin, Spira's Punishment", () => {
  const castSin = (yard: (s: GameState, ap: PlayerId) => void, seed = 5) => {
    const { s: s0, ap, opp, ids } = setup([sin()], seed);
    yard(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, opp };
  };

  it("a nonland permanent card: one tapped token copy, and the process stops", () => {
    const { s, ap } = castSin((s, ap) => {
      toYard(s, ap, bears());
      toYard(s, ap, shock());
    });
    const t = tokens(s, "Grizzly Bears");
    expect(t).toHaveLength(1);
    expect(s.objects[t[0]!]!.tapped).toBe(true);
    // Shock isn't a permanent card.
    expect(s.players[ap]!.graveyard.map((id) => nameOf(s, id))).toEqual(["Shock"]);
  });

  it("a land card: its token copy, then the process again until a nonland card or none", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s, ap } = castSin((s, ap) => {
        toYard(s, ap, forest());
        toYard(s, ap, forest());
        toYard(s, ap, bears());
      }, seed);
      const forests = tokens(s, "Forest").length;
      // Lands first, then the Bears ends it; the Forests chosen before it were copied.
      expect(tokens(s, "Grizzly Bears")).toHaveLength(1);
      expect(s.players[ap]!.graveyard.filter((id) => nameOf(s, id) === "Forest")).toHaveLength(2 - forests);
      expect(tokens(s, "Forest").every((id) => s.objects[id]!.tapped)).toBe(true);
    }
    // Only lands: all of them, then nothing is left.
    const { s, ap } = castSin((s, ap) => {
      toYard(s, ap, forest());
      toYard(s, ap, forest());
    });
    expect(tokens(s, "Forest")).toHaveLength(2);
    expect(s.players[ap]!.graveyard).toHaveLength(0);
  });

  it("it does the same as it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, sin());
    toYard(s0, ap, bears());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    s = settle(s, ap);
    expect(tokens(s, "Grizzly Bears")).toHaveLength(1);
    expect(s.objects[tokens(s, "Grizzly Bears")[0]!]!.tapped).toBe(true);
    // Created tapped, not attacking: it was never declared as an attacker.
    expect(s.objects[tokens(s, "Grizzly Bears")[0]!]!.attacking).toBeUndefined();
  });

  it("an Aura card: its token copy enters attached to what you choose", () => {
    const { s: s0, ap, opp, ids } = setup([sin()]);
    toYard(s0, ap, pacifism());
    const b = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }), ap);
    const t = tokens(s, "Pacifism");
    expect(t).toHaveLength(1);
    expect(s.objects[t[0]!]!.attachedTo).toBe(b);
  });
});

describe("Northampton Farm", () => {
  it("returns a creature card exiled with it under your control, and the others to their owner's hand", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, farm());
    const b = putOnBattlefield(s0, ap, bears());
    const w = putOnBattlefield(s0, ap, omens());
    let s = settle(run(s0, planActivate(s0, ap, f, 0, [tgt(b)])), ap);
    s.objects[f]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, f, 0, [tgt(w)])), ap);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[w]!.zone).toBe("exile");
    s.objects[f]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, f, 1)), ap);
    // One creature card chosen among those exiled with it.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [w] }), ap);
    expect(s.objects[w]!).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[f]!.zone).toBe("graveyard");
  });
});
