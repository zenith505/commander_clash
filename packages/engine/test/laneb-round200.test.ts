// Lane B round B200: Tenth District Hero ("{2}{W}, Collect evidence 4: If this creature is a Detective, it becomes a
// legendary creature named Mileva, the Stalwart, it has base power and toughness 5/5, and it gains "Other creatures you
// control have indestructible.""), Livio, Oathsworn Sentinel ("{1}{W}: Choose another target creature. Its controller may
// exile it with an aegis counter on it." and "{2}{W}, {T}: Return all exiled cards with aegis counters on them to the
// battlefield under their owners' control."), Sudden Salvation ("Choose up to three target permanent cards in graveyards that
// were put there from the battlefield this turn. Return them to the battlefield tapped under their owners' control. You draw
// a card for each opponent who controls one or more of those permanents.") and Fortunate Few ("Choose a nonland permanent you
// don't control, then each other player chooses a nonland permanent they don't control that hasn't been chosen this way.
// Destroy all other nonland permanents.") and Yannik, Scavenging Sentinel ("When Yannik enters, exile another creature you
// control until Yannik leaves the battlefield. When you do, distribute X +1/+1 counters among any number of target
// creatures, where X is the exiled creature's power.") and Arcane Artisan ("{2}{U}, {T}: Target player draws
// a card, then exiles a card from their hand. If a creature card is exiled this way, that player creates a token that's a
// copy of that card." and "When this creature leaves the battlefield, exile all tokens created with it at the beginning of
// the next end step.").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const tenth = (): CardDef => ({"oracleId":"0953772c-9374-4616-9c04-5838aaf626c9","name":"Tenth District Hero","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"{1}{W}, Collect evidence 2: This creature becomes a Human Detective with base power and toughness 4/4 and gains vigilance.\n{2}{W}, Collect evidence 4: If this creature is a Detective, it becomes a legendary creature named Mileva, the Stalwart, it has base power and toughness 5/5, and it gains \"Other creatures you control have indestructible.\"","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Collect evidence"],"imageUrl":"https://cards.scryfall.io/normal/front/7/c/7c65a79e-f28a-4f30-95a4-1ea55fd84564.jpg?1783912919","artUrl":"https://cards.scryfall.io/art_crop/front/7/c/7c65a79e-f28a-4f30-95a4-1ea55fd84564.jpg?1783912919","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const livio = (): CardDef => ({"oracleId":"53c6f2cf-ed3e-4c0c-ad42-56a6ce1622b6","name":"Livio, Oathsworn Sentinel","manaCost":"{1}{W}","cmc":2,"typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"{1}{W}: Choose another target creature. Its controller may exile it with an aegis counter on it.\n{2}{W}, {T}: Return all exiled cards with aegis counters on them to the battlefield under their owners' control.\nPartner (You can have two commanders if both have partner.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/02bce846-8049-4d5c-b0ad-8abd484e5a27.jpg?1783928881","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/02bce846-8049-4d5c-b0ad-8abd484e5a27.jpg?1783928881","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const salvation = (): CardDef => ({"oracleId":"a5b0f351-5536-41ec-aa09-1e5344a0effb","name":"Sudden Salvation","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose up to three target permanent cards in graveyards that were put there from the battlefield this turn. Return them to the battlefield tapped under their owners' control. You draw a card for each opponent who controls one or more of those permanents.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/c/7cbeb9bc-5731-4976-b59f-62935760b917.jpg?1783924989","artUrl":"https://cards.scryfall.io/art_crop/front/7/c/7cbeb9bc-5731-4976-b59f-62935760b917.jpg?1783924989","commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fortunate = (): CardDef => ({"oracleId":"d732d9b8-dea0-41c4-8cff-67b2b3d36ecb","name":"Fortunate Few","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a nonland permanent you don't control, then each other player chooses a nonland permanent they don't control that hasn't been chosen this way. Destroy all other nonland permanents.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/8/d84361bb-abc3-4b2d-9475-700fd262703b.jpg?1783935951","artUrl":"https://cards.scryfall.io/art_crop/front/d/8/d84361bb-abc3-4b2d-9475-700fd262703b.jpg?1783935951","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const yannik = (): CardDef => ({"oracleId":"81ab8947-8046-4944-ae58-006a6eefa08a","name":"Yannik, Scavenging Sentinel","manaCost":"{2}{G}{W}","cmc":4,"typeLine":"Legendary Creature — Hyena Beast","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Hyena","Beast"],"oracleText":"Partner with Nikara, Lair Scavenger\nVigilance\nWhen Yannik enters, exile another creature you control until Yannik leaves the battlefield. When you do, distribute X +1/+1 counters among any number of target creatures, where X is the exiled creature's power.","power":"3","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Partner with","Vigilance","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11c0e89b-ab29-4739-a88e-1e7966d87d25.jpg?1783931226","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11c0e89b-ab29-4739-a88e-1e7966d87d25.jpg?1783931226","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const artisan = (): CardDef => ({"oracleId":"7dbf5f59-1246-4156-bb21-090cfddd9111","name":"Arcane Artisan","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{2}{U}, {T}: Target player draws a card, then exiles a card from their hand. If a creature card is exiled this way, that player creates a token that's a copy of that card.\nWhen this creature leaves the battlefield, exile all tokens created with it at the beginning of the next end step.","power":"0","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b2441e0-06f6-4455-8fa8-a34c3e241a56.jpg?1783934867","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b2441e0-06f6-4455-8fa8-a34c3e241a56.jpg?1783934867","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const wrath = card("Test Wrath", "Sorcery", "{1}", { cmc: 1, oracleText: "Destroy all creatures." });
const relic = (name: string, mv: number) => card(name, "Artifact", `{${mv}}`, { cmc: mv, oracleText: "" });

describe("Tenth District Hero", () => {
  const ready = () => {
    const { s: s0, ap, ids } = setup([]);
    const hero = putOnBattlefield(s0, ap, tenth());
    const ally = putOnBattlefield(s0, ap, bear({ name: "Ally Bear" }));
    const foe = putOnBattlefield(s0, others(s0, ap)[0]!, bear({ name: "Foe Bear" }));
    const yard = [1, 2, 3, 4].map((i) => into(s0, ap, relic(`Old Relic ${i}`, 2), "graveyard"));
    void ids;
    return { s0, ap, hero, ally, foe, yard };
  };
  it("is fully supported", () => supported(tenth()));
  it("does nothing while it isn't a Detective, even with the evidence collected", () => {
    const { s0, ap, hero, yard } = ready();
    const s = settle(run(s0, planActivate(s0, ap, hero, 1, [], undefined, undefined, undefined, { collect: [yard[0]!, yard[1]!] })));
    expect(zoneOf(s, yard[0]!)).toBe("exile");
    expect(ch(s, hero).name).toBe("Tenth District Hero");
    expect(ch(s, hero).supertypes).not.toContain("Legendary");
    expect(`${power(s, s.objects[hero]!)}/${toughness(s, s.objects[hero]!)}`).toBe("2/3");
  });
  it("as a Detective becomes legendary Mileva, the Stalwart, a 5/5 that gives other creatures you control indestructible", () => {
    const { s0, ap, hero, ally, foe, yard } = ready();
    let s = settle(run(s0, planActivate(s0, ap, hero, 0, [], undefined, undefined, undefined, { collect: [yard[0]!] })));
    expect(ch(s, hero).subtypes).toEqual(["Human", "Detective"]);
    expect(`${power(s, s.objects[hero]!)}/${toughness(s, s.objects[hero]!)}`).toBe("4/4");
    s = settle(run(s, planActivate(s, ap, hero, 1, [], undefined, undefined, undefined, { collect: [yard[1]!, yard[2]!] })));
    const c = ch(s, hero);
    expect(c.name).toBe("Mileva, the Stalwart");
    expect(c.supertypes).toContain("Legendary");
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual(["Human", "Detective"]);
    expect(`${power(s, s.objects[hero]!)}/${toughness(s, s.objects[hero]!)}`).toBe("5/5");
    expect(objHasKeyword(s, s.objects[hero]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[ally]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[hero]!, "Indestructible")).toBe(false);
    expect(objHasKeyword(s, s.objects[foe]!, "Indestructible")).toBe(false);
    // Its first ability again: a 4/4 legendary Mileva still (rulings).
    s.players[ap]!.manaPool.W = 1;
    s.players[ap]!.manaPool.C = 1;
    s = settle(run(s, planActivate(s, ap, hero, 0, [], undefined, undefined, undefined, { collect: [yard[3]!] })));
    expect(ch(s, hero).name).toBe("Mileva, the Stalwart");
    expect(`${power(s, s.objects[hero]!)}/${toughness(s, s.objects[hero]!)}`).toBe("4/4");
    expect(objHasKeyword(s, s.objects[ally]!, "Indestructible")).toBe(true);
  });
  it("can't be activated without four mana value of evidence", () => {
    const { s0, ap, hero, yard } = ready();
    expect(planActivate(s0, ap, hero, 1, [], undefined, undefined, undefined, { collect: [yard[0]!] })).toBeNull();
  });
});

describe("Livio, Oathsworn Sentinel", () => {
  const ready = () => {
    const { s: s0, ap } = setup([]);
    const opp = others(s0, ap)[0]!;
    const livio1 = putOnBattlefield(s0, ap, livio());
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    return { s0, ap, opp, livio1, mine, theirs };
  };
  it("is fully supported", () => supported(livio()));
  it("can't target itself", () => {
    const { s0, ap, livio1 } = ready();
    expect(planActivate(s0, ap, livio1, 0, [tgt(livio1)])).toBeNull();
  });
  it("asks the target's controller, who may exile it with an aegis counter on it", () => {
    const { s0, ap, opp, livio1, theirs } = ready();
    let s = settle(run(s0, planActivate(s0, ap, livio1, 0, [tgt(theirs)])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const no = settle(act(structuredClone(s), { type: "chooseMay", player: opp, yes: false }));
    expect(zoneOf(no, theirs)).toBe("battlefield");
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(zoneOf(s, theirs)).toBe("exile");
    expect(s.objects[theirs]!.counters.aegis).toBe(1);
  });
  it("returns every exiled card with an aegis counter under its owner's control, without the counter", () => {
    const { s0, ap, opp, livio1, mine, theirs } = ready();
    let s = settle(run(s0, planActivate(s0, ap, livio1, 0, [tgt(mine)])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    s = settle(run(s, planActivate(s, ap, livio1, 0, [tgt(theirs)])));
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    // Another card with an aegis counter, exiled some other way, and one with a different counter.
    const stray = into(s, opp, bear({ name: "Stray Bear" }), "exile");
    s.objects[stray]!.counters.aegis = 1;
    const other = into(s, opp, bear({ name: "Other Bear" }), "exile");
    s.objects[other]!.counters.hit = 1;
    expect(zoneOf(s, mine)).toBe("exile");
    s = settle(run(s, planActivate(s, ap, livio1, 1, [])));
    for (const [id, owner] of [[mine, ap], [theirs, opp], [stray, opp]] as const) {
      expect(zoneOf(s, id)).toBe("battlefield");
      expect(controllerOf(s, s.objects[id]!)).toBe(owner);
      expect(s.objects[id]!.counters.aegis ?? 0).toBe(0);
    }
    expect(zoneOf(s, other)).toBe("exile");
    expect(s.objects[livio1]!.tapped).toBe(true);
  });
  it("a token exiled this way is gone for good", () => {
    const { s0, ap, livio1 } = ready();
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    let s = settle(run(s0, planActivate(s0, ap, livio1, 0, [tgt(tok)])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[tok]?.zone === "battlefield").toBe(false);
    s = settle(run(s, planActivate(s, ap, livio1, 1, [])));
    expect(s.objects[tok]?.zone === "battlefield").toBe(false);
  });
  it("a bot asked about its own creature keeps it", () => {
    const { s0, ap, opp, livio1, theirs } = ready();
    const s = settle(run(s0, planActivate(s0, ap, livio1, 0, [tgt(theirs)])));
    expect(botActions(s, opp)).toEqual([{ type: "chooseMay", player: opp, yes: false }]);
  });
});

describe("Sudden Salvation", () => {
  const ready = () => {
    const { s: s0, ap, ids } = setup([wrath, salvation()]);
    const [o1, o2] = others(s0, ap);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const a = putOnBattlefield(s0, o1!, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, o2!, bear({ name: "Bear B" }));
    const b2 = putOnBattlefield(s0, o2!, bear({ name: "Bear B2" }));
    const old = into(s0, o1!, bear({ name: "Old Bear" }), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([mine, a, b, b2].map((id) => zoneOf(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
    return { s, ap, o1: o1!, o2: o2!, ss: ids[1]!, mine, a, b, b2, old };
  };
  it("is fully supported", () => supported(salvation()));
  it("returns up to three of them tapped under their owners' control and draws a card for each opponent who controls one", () => {
    const { s: s0, ap, o1, o2, ss, mine, a, b } = ready();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ss, [tgt(mine), tgt(a), tgt(b)])));
    for (const [id, owner] of [[mine, ap], [a, o1], [b, o2]] as const) {
      expect(zoneOf(s, id)).toBe("battlefield");
      expect(controllerOf(s, s.objects[id]!)).toBe(owner);
      expect(s.objects[id]!.tapped).toBe(true);
    }
    // Two opponents control one of them; Sudden Salvation itself left the hand.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
  it("counts each opponent once, and draws nothing for your own permanents", () => {
    const { s: s0, ap, ss, mine, b, b2 } = ready();
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ss, [tgt(b), tgt(b2), { kind: "none" }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    void mine;
    void s;
  });
  it("draws nothing when it returns only your own", () => {
    const { s: s0, ap, ss, mine } = ready();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ss, [tgt(mine), { kind: "none" }, { kind: "none" }])));
    expect(zoneOf(s, mine)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
  it("can't target a card that wasn't put into a graveyard from the battlefield this turn", () => {
    const { s: s0, ap, ss, old } = ready();
    expect(planCast(s0, ap, ss, [tgt(old), { kind: "none" }, { kind: "none" }])).toBeNull();
  });
});

describe("Fortunate Few", () => {
  const ready = () => {
    const { s: s0, ap, ids } = setup([fortunate()]);
    const [o1, o2, o3] = others(s0, ap);
    const mine = putOnBattlefield(s0, ap, relic("My Relic", 3));
    const a = putOnBattlefield(s0, o1!, relic("Relic A", 1));
    const a2 = putOnBattlefield(s0, o1!, bear({ name: "Bear A2" }));
    const b = putOnBattlefield(s0, o2!, relic("Relic B", 4));
    const c = putOnBattlefield(s0, o3!, relic("Relic C", 2));
    const land = putOnBattlefield(s0, o3!, card("Artifact Land", "Artifact Land", "", { oracleText: "" }));
    return { s0, ap, o1: o1!, o2: o2!, o3: o3!, ff: ids[0]!, mine, a, a2, b, c, land };
  };
  it("is fully supported", () => supported(fortunate()));
  it("you choose first, then each other player in turn order; everything else nonland is destroyed", () => {
    const { s0, ap, o1, o2, o3, ff, mine, a, a2, b, c, land } = ready();
    let s = settle(run(s0, planCast(s0, ap, ff)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    expect(s.pending?.kind === "pickPermanents" && s.pending.options.sort()).toEqual([a, a2, b, c].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    // The next player can't choose their own, nor what's been chosen.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: o1 });
    expect(s.pending?.kind === "pickPermanents" && s.pending.options.sort()).toEqual([mine, c].sort());
    s = settle(act(s, { type: "pickPermanents", player: o1, ids: [mine] }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: o2 });
    expect(s.pending?.kind === "pickPermanents" && s.pending.options.sort()).toEqual([a, a2, c].sort());
    s = settle(act(s, { type: "pickPermanents", player: o2, ids: [a2] }));
    // The last player has only Relic A left, so it's chosen for them.
    expect(s.pending).toBeNull();
    void o3;
    for (const id of [b, mine, a2, a, land]) expect(zoneOf(s, id)).toBe("battlefield");
    expect(zoneOf(s, c)).toBe("graveyard");
    // Lands aren't touched, including the basic lands in play.
    expect(s.battlefield.filter((id) => ch(s, id).types.includes("Land")).length).toBe(15);
  });
  it("a bot spares the least of the others' permanents", () => {
    const { s0, ap, o1, ff, b } = ready();
    let s = settle(run(s0, planCast(s0, ap, ff)));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    const mine = s.pending?.kind === "pickPermanents" ? s.pending.options : [];
    expect(mine.length).toBe(2);
    const pick = botActions(s, o1);
    expect(pick).toEqual([{ type: "pickPermanents", player: o1, ids: [mine.find((id) => ch(s, id).name === "Relic C")!] }]);
  });
});

describe("Yannik, Scavenging Sentinel", () => {
  const part = (id: string, amount: number): TargetChoice => ({ kind: "object", id, amount });
  const plusOnes = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;
  const ready = () => {
    const { s: s0, ap, ids } = setup([yannik()]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "3", toughness: "3" }));
    const small = putOnBattlefield(s0, ap, bear({ name: "Small Bear", power: "1", toughness: "1" }));
    const theirs = putOnBattlefield(s0, others(s0, ap)[0]!, bear({ name: "Their Bear" }));
    return { s0, ap, y: ids[0]!, big, small, theirs };
  };
  /** Cast Yannik and let its enters trigger resolve to its question. */
  const enter = (s0: GameState, ap: PlayerId, y: ObjectId) => {
    let s = settle(run(s0, planCast(s0, ap, y)));
    // Its partner-with trigger first: you, declining the search.
    for (let i = 0; i < 20; i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets" && /Nikara/.test(p.description)) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] }));
      else if (p?.kind === "chooseMay" && /Nikara/.test(p.prompt)) s = settle(act(s, { type: "chooseMay", player: p.player, yes: false }));
      else if (p && p.kind !== "pickPermanents" && p.kind !== "chooseTargets") s = settle(botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s));
      else if (!p && (s.stack.length || s.triggerQueue.length)) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
      else break;
    }
    return s;
  };
  /** The partner-with search still on the stack below: declined. */
  const finish = (s: GameState) => {
    for (let i = 0; i < 10 && s.pending?.kind === "chooseMay" && /Nikara/.test(s.pending.prompt); i++) s = settle(act(s, { type: "chooseMay", player: s.pending.player, yes: false }));
    return s;
  };
  it("is fully supported", () => supported(yannik()));
  it("exiles another creature you control, chosen as it resolves, then distributes counters equal to its power", () => {
    const { s0, ap, y, big, small, theirs } = ready();
    let s = enter(s0, ap, y);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "exile" });
    expect(s.pending?.kind === "pickPermanents" && s.pending.options.sort()).toEqual([big, small].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [big] }));
    expect(zoneOf(s, big)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const slots = s.pending?.kind === "chooseTargets" ? s.pending.specs.length : 0;
    expect(() => act(structuredClone(s), { type: "chooseTargets", player: ap, targets: [part(y, 2), part(small, 2), ...Array.from({ length: slots - 2 }, () => ({ kind: "none" }) as TargetChoice)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [part(y, 2), part(theirs, 1), ...Array.from({ length: slots - 2 }, () => ({ kind: "none" }) as TargetChoice)] });
    s = finish(settle(s));
    expect([plusOnes(s, y), plusOnes(s, theirs), plusOnes(s, small)]).toEqual([2, 1, 0]);
    // Yannik leaves: the exiled card comes back at once, under its owner's control.
    s = settle(run(s, planCast(s, ap, into(s, ap, card("Test Doom", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." }), "hand"), [tgt(y)])));
    expect(zoneOf(s, y)).toBe("graveyard");
    expect(zoneOf(s, big)).toBe("battlefield");
    expect(controllerOf(s, s.objects[big]!)).toBe(ap);
  });
  it("uses the exiled creature's power as it last existed", () => {
    const { s0, ap, y, big, small } = ready();
    let s = enter(s0, ap, y);
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [small], mods: [{ kind: "modifyPT", power: 3, toughness: 0 }] });
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [small] }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const slots = s.pending?.kind === "chooseTargets" ? s.pending.specs.length : 0;
    s = finish(settle(act(s, { type: "chooseTargets", player: ap, targets: [part(big, 4), ...Array.from({ length: slots - 1 }, () => ({ kind: "none" }) as TargetChoice)] })));
    expect(plusOnes(s, big)).toBe(4);
  });
  it("may choose no targets at all", () => {
    const { s0, ap, y, big } = ready();
    let s = enter(s0, ap, y);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [big] }));
    const slots = s.pending?.kind === "chooseTargets" ? s.pending.specs.length : 0;
    s = finish(settle(act(s, { type: "chooseTargets", player: ap, targets: Array.from({ length: slots }, () => ({ kind: "none" }) as TargetChoice) })));
    expect(s.pending).toBeNull();
    expect(zoneOf(s, big)).toBe("exile");
  });
  it("exiles nothing, and doesn't trigger again, once Yannik has left", () => {
    const { s0, ap, y, big, small } = ready();
    let s = settle(run(s0, planCast(s0, ap, y)));
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] });
    // Its enters trigger waits on the stack; Yannik leaves first.
    expect(s.stack.some((x) => /exile another creature/.test(JSON.stringify(x)))).toBe(true);
    s.battlefield.splice(s.battlefield.indexOf(y), 1);
    s.objects[y]!.zone = "graveyard";
    s.objects[y]!.zoneChanges = (s.objects[y]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(y);
    invalidateCharacteristics(s);
    s = finish(settle(s));
    expect(s.pending).toBeNull();
    expect([zoneOf(s, big), zoneOf(s, small)]).toEqual(["battlefield", "battlefield"]);
  });
  it("with no other creature, nothing happens", () => {
    const { s: s0, ap, ids } = setup([yannik()]);
    const s = finish(enter(s0, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect(zoneOf(s, ids[0]!)).toBe("battlefield");
  });
  it("a bot exiles one of its creatures and puts the counters on its own", () => {
    const { s0, ap, y, big, small, theirs } = ready();
    let s = enter(s0, ap, y);
    for (let i = 0; i < 10 && s.pending; i++) for (const x of botActions(s, waitingOn(s)!)) s = settle(act(s, x));
    const exiled = [big, small].filter((id) => zoneOf(s, id) === "exile");
    expect(exiled.length).toBe(1);
    const total = [y, big, small].filter((id) => zoneOf(s, id) === "battlefield").reduce((n, id) => n + plusOnes(s, id), 0);
    expect(total).toBe(exiled[0] === big ? 3 : 1);
    expect(plusOnes(s, theirs)).toBe(0);
  });
});

describe("Arcane Artisan", () => {
  const ogre = card("Hill Ogre", "Creature — Ogre", "{X}{R}", { cmc: 1, power: "3", toughness: "3", oracleText: "" });
  const ready = () => {
    const { s: s0, ap } = setup([]);
    const opp = others(s0, ap)[0]!;
    const art = putOnBattlefield(s0, ap, artisan());
    s0.players[ap]!.hand = [];
    const og = into(s0, ap, ogre, "hand");
    const spell = into(s0, ap, card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." }), "hand");
    return { s0, ap, opp, art, og, spell };
  };
  const tokensOf = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && ch(s, id).name === name);
  it("is fully supported", () => supported(artisan()));
  it("the target player draws, exiles a creature card from hand, and gets a token copy of it (X as 0)", () => {
    const { s0, ap, art, og } = ready();
    let s = settle(run(s0, planActivate(s0, ap, art, 0, [{ kind: "player", id: ap }])));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, exile: true });
    expect(s.players[ap]!.hand.length).toBe(3);
    s = settle(act(s, { type: "discard", player: ap, objectIds: [og] }));
    expect(zoneOf(s, og)).toBe("exile");
    const [tok] = tokensOf(s, "Hill Ogre");
    expect(tok).toBeDefined();
    expect(controllerOf(s, s.objects[tok!]!)).toBe(ap);
    expect(characteristics(s, s.objects[tok!]!).manaValue).toBe(1);
  });
  it("a noncreature card exiled makes no token", () => {
    const { s0, ap, art, spell } = ready();
    let s = settle(run(s0, planActivate(s0, ap, art, 0, [{ kind: "player", id: ap }])));
    s = settle(act(s, { type: "discard", player: ap, objectIds: [spell] }));
    expect(zoneOf(s, spell)).toBe("exile");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
  it("an opponent targeted gets the token, and chooses the card", () => {
    const { s0, ap, opp, art } = ready();
    s0.players[opp]!.hand = [];
    const theirs = into(s0, opp, ogre, "hand");
    let s = settle(run(s0, planActivate(s0, ap, art, 0, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "discard", player: opp });
    // A bot exiles its best creature card.
    s = settle(botActions(s, opp).reduce((x, a) => act(x, a), s));
    expect(zoneOf(s, theirs)).toBe("exile");
    expect(tokensOf(s, "Hill Ogre").map((id) => controllerOf(s, s.objects[id]!))).toEqual([opp]);
  });
  it("when it leaves, its tokens are exiled at the beginning of the next end step, not other copies", () => {
    const { s0, ap, art, og } = ready();
    let s = settle(run(s0, planActivate(s0, ap, art, 0, [{ kind: "player", id: ap }])));
    s = settle(act(s, { type: "discard", player: ap, objectIds: [og] }));
    const [tok] = tokensOf(s, "Hill Ogre");
    // Another token named the same, not created with it.
    const other = putOnBattlefield(s, ap, ogre);
    s.objects[other]!.isToken = true;
    s = settle(run(s, planCast(s, ap, into(s, ap, card("Test Doom", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." }), "hand"), [tgt(art)])));
    expect(zoneOf(s, art)).toBe("graveyard");
    expect(s.objects[tok!]?.zone).toBe("battlefield");
    s = passUntil(s, "end");
    s = settle(s);
    expect(s.objects[tok!]?.zone === "battlefield").toBe(false);
    expect(zoneOf(s, other)).toBe("battlefield");
  });
  it("a token its ability makes after it has left is exiled too", () => {
    const { s0, ap, art, og } = ready();
    let s = run(s0, planActivate(s0, ap, art, 0, [{ kind: "player", id: ap }]));
    // In response, Artisan leaves the battlefield; its leaves trigger resolves first.
    const doom = into(s, ap, card("Test Doom", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." }), "hand");
    s.players[ap]!.manaPool.C = 1;
    s = run(s, planCast(s, ap, doom, [tgt(art)]));
    s = settle(s);
    expect(zoneOf(s, art)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [og] }));
    const [tok] = tokensOf(s, "Hill Ogre");
    expect(tok).toBeDefined();
    s = settle(passUntil(s, "end"));
    expect(s.objects[tok!]?.zone === "battlefield").toBe(false);
  });
});
