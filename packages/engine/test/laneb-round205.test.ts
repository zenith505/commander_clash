// Lane B round B205: Don & Leo, Problem Solvers (two flicker targets, exiled and returned at once); Captain Marvel, Apex
// Avenger ("the same number and kind of counters", with an intervening "if it's not a Kree"); Knickknack Ouphe (Auras
// with mana value X or less from an enters trigger's X); Suspend Aggression (each card's owner may play it until the end
// of their next turn); Too Evil to Stay Dead and Earth's Mightiest Heroes (teamwork choosing the target or the count).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const donLeo = (): CardDef => ({"oracleId":"a4ae71c8-ea1b-4fa4-9e47-cf00ab60c5ee","name":"Don & Leo, Problem Solvers","manaCost":"{3}{W/U}{W/U}","cmc":5,"typeLine":"Legendary Creature — Mutant Ninja Turtle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Ninja","Turtle"],"oracleText":"Vigilance\nAt the beginning of your end step, exile up to one target artifact you control and up to one target creature you control. Then return them to the battlefield under their owners' control.","power":"4","toughness":"6","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d239beaf-4f5b-494e-be5c-ffa8b6e28bde.jpg?1783904079","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d239beaf-4f5b-494e-be5c-ffa8b6e28bde.jpg?1783904079","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const marvel = (): CardDef => ({"oracleId":"6d86d783-7116-4426-8c0f-718c2d904887","name":"Captain Marvel, Apex Avenger","manaCost":"{5}{R}{W}","cmc":7,"typeLine":"Legendary Creature — Human Kree Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Kree","Hero"],"oracleText":"Flying, double strike, indestructible\nWhenever you put one or more counters on another creature, if it's not a Kree, you may put the same number and kind of counters on Captain Marvel.","power":"4","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Flying","Indestructible","Double strike"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/516e14ce-9cc8-4be3-aacb-ba801f26a6bc.jpg?1783903271","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/516e14ce-9cc8-4be3-aacb-ba801f26a6bc.jpg?1783903271","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ouphe = (): CardDef => ({"oracleId":"55adf2f0-f023-4f41-ae9d-3c002e9e6e8d","name":"Knickknack Ouphe","manaCost":"{X}{G}","cmc":1,"typeLine":"Creature — Ouphe","supertypes":[],"types":["Creature"],"subtypes":["Ouphe"],"oracleText":"This creature enters with X +1/+1 counters on it.\nWhen this creature enters, reveal the top X cards of your library. You may put any number of Aura cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield on the bottom of your library in a random order.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08fe7e9c-7c3b-435f-bc0d-e380e6b852c0.jpg?1783914984","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08fe7e9c-7c3b-435f-bc0d-e380e6b852c0.jpg?1783914984","commanderLegal":"legal","set":"woc","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const suspendAggression = (): CardDef => ({"oracleId":"883267f0-be7e-43c3-b7f8-82981f6d8c23","name":"Suspend Aggression","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target nonland permanent and the top card of your library. For each of those cards, its owner may play it until the end of their next turn.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/3/135c0696-d86d-4e48-988c-5c218de451fc.jpg?1783903627","artUrl":"https://cards.scryfall.io/art_crop/front/1/3/135c0696-d86d-4e48-988c-5c218de451fc.jpg?1783903627","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tooEvil = (): CardDef => ({"oracleId":"e50fecff-8872-42f5-8882-41ad13d9d1ae","name":"Too Evil to Stay Dead","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Teamwork 4 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 4 or more.)\nChoose target creature card in your graveyard with mana value 4 or less. If this spell was cast using teamwork, instead choose target creature card in your graveyard. Return the chosen card to the battlefield.","colors":["B"],"colorIdentity":["B"],"keywords":["Teamwork"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f471e9ce-73bb-4090-98f2-f591c7cf4efe.jpg?1783902936","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f471e9ce-73bb-4090-98f2-f591c7cf4efe.jpg?1783902936","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const heroes = (): CardDef => ({"oracleId":"2b87bcac-ec64-4012-9e75-f459d3640eb3","name":"Earth's Mightiest Heroes","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Teamwork 5 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 5 or more.)\nReveal the top eight cards of your library. You may put a creature card from among them onto the battlefield. If this spell was cast using teamwork, put any number of creature cards from among them onto the battlefield instead. Put the rest into your graveyard.","colors":["G"],"colorIdentity":["G"],"keywords":["Teamwork"],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b38b9bd6-1dd7-4bbc-8a82-ce391c1172e1.jpg?1783902919","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b38b9bd6-1dd7-4bbc-8a82-ce391c1172e1.jpg?1783902919","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

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
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => nameOf(s, id) === name);
/** A new card for `def` in `pid`'s hand, library (on top), graveyard or exile. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes priority (and declares no attacks or blocks) until `ok` holds or a question other than those comes up. */
const goUntil = (s: GameState, ok: (s: GameState) => boolean, max = 3000) => {
  for (let i = 0; i < max && !ok(s); i++) {
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const relic = card("Mind Stone", "Artifact", "{2}", { cmc: 2 });
const growth = card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Put two +1/+1 counters on target creature." });
const wither = card("Test Wither", "Instant", "{B}", { cmc: 1, oracleText: "Put a -1/-1 counter on target creature." });

describe("round B205 cards are supported", () => {
  it("compiles every line", () => supported(donLeo(), marvel(), ouphe(), suspendAggression(), tooEvil(), heroes(), growth, wither));
});

describe("Don & Leo, Problem Solvers", () => {
  /** Don & Leo on your battlefield, on to your end step with its trigger asking for targets. */
  const atEnd = (extra: (s: GameState, ap: PlayerId, opp: PlayerId) => void) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, donLeo());
    extra(s0, ap, opp);
    const s = goUntil(s0, (c) => c.pending?.kind === "chooseTargets" && /Don & Leo/.test(c.pending.description));
    expect(s.pending?.kind).toBe("chooseTargets");
    return { s, ap, opp };
  };

  it("exiles an artifact and a creature at once and returns both as new objects, an opponent's creature to its owner", () => {
    let stone = "", theirs = "";
    const { s: s0, ap, opp } = atEnd((s, ap, opp) => {
      stone = putOnBattlefield(s, ap, relic);
      theirs = putOnBattlefield(s, opp, bear({ name: "Borrowed Bear" }));
      s.objects[theirs]!.controller = ap;
      s.objects[theirs]!.counters["+1/+1"] = 2;
      invalidateCharacteristics(s);
    });
    expect(controllerOf(s0, s0.objects[theirs]!)).toBe(ap);
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [tgt(stone), tgt(theirs)] }));
    const [stone2] = named(s, "Mind Stone");
    const [bear2] = named(s, "Borrowed Bear");
    expect(stone2 && bear2).toBeTruthy();
    // New objects (CR 400.7): the counters are gone, and the bear came back under its owner's control.
    expect(s.objects[stone2!]!.zoneChanges ?? 0).toBeGreaterThan(s0.objects[stone]!.zoneChanges ?? 0);
    expect(controllerOf(s, s.objects[stone2!]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bear2!]!)).toBe(opp);
    expect(s.objects[bear2!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.log.some((e) => /Don & Leo, Problem Solvers exiles Mind Stone/.test(e.text))).toBe(true);
  });

  it("the same artifact creature for both targets is exiled and returned once", () => {
    let thopter = "";
    const { s: s0, ap } = atEnd((s, ap) => {
      thopter = putOnBattlefield(s, ap, ornithopter());
    });
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [tgt(thopter), tgt(thopter)] }));
    expect(named(s, "Ornithopter").length).toBe(1);
    expect(s.log.filter((e) => /exiles Ornithopter/.test(e.text)).length).toBe(1);
  });

  it("an artifact can't be the creature target, nor a noncreature the artifact one", () => {
    let stone = "", grizzly = "";
    const { s: s0, ap } = atEnd((s, ap) => {
      stone = putOnBattlefield(s, ap, relic);
      grizzly = putOnBattlefield(s, ap, bear());
    });
    expect(() => act(structuredClone(s0), { type: "chooseTargets", player: ap, targets: [tgt(grizzly), { kind: "none" }] })).toThrow();
    expect(() => act(structuredClone(s0), { type: "chooseTargets", player: ap, targets: [{ kind: "none" }, tgt(stone)] })).toThrow();
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }, tgt(grizzly)] }));
    expect(zoneOf(s, stone)).toBe("battlefield");
    expect(zoneOf(s, grizzly)).toBe("battlefield");
    expect(s.objects[grizzly]!.zoneChanges ?? 0).toBeGreaterThan(s0.objects[grizzly]!.zoneChanges ?? 0);
  });

  it("a token chosen is exiled and doesn't come back (CR 111.7)", () => {
    let tok = "";
    const { s: s0, ap } = atEnd((s, ap) => {
      tok = putOnBattlefield(s, ap, bear({ name: "Bear Token" }));
      s.objects[tok]!.isToken = true;
    });
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }, tgt(tok)] }));
    expect(named(s, "Bear Token").length).toBe(0);
  });
});

describe("Captain Marvel, Apex Avenger", () => {
  const withMarvel = (hand: CardDef[]) => {
    const { s, ap, ids, opp } = setup(hand);
    const marv = putOnBattlefield(s, ap, marvel());
    return { s, ap, ids, opp, marv };
  };

  it("two +1/+1 counters you put on another creature: you may put two on Captain Marvel too", () => {
    const { s: s0, ap, ids, marv } = withMarvel([growth]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(b)]));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[marv]!.counters["+1/+1"]).toBe(2);
    expect(power(s, s.objects[marv]!)).toBe(6);
  });

  it("the same kind: a -1/-1 counter on an opponent's creature is a -1/-1 counter, and a bot declines it", () => {
    const { s: s0, ap, ids, opp, marv } = withMarvel([wither]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(b)]));
    expect(s.pending?.kind).toBe("chooseMay");
    // A bot in Captain Marvel's controller's seat says no to a -1/-1 counter.
    const bot = botActions(s, ap);
    expect(bot).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[marv]!.counters["-1/-1"]).toBe(1);
    expect(toughness(s, s.objects[marv]!)).toBe(3);
  });

  it("a bot takes +1/+1 counters", () => {
    const { s: s0, ap, ids, marv } = withMarvel([growth]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(b)]));
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    expect(s.objects[marv]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("not for a Kree, as it triggers or as it resolves (CR 603.4)", () => {
    const { s: s0, ap, ids } = withMarvel([growth, growth]);
    const kree = putOnBattlefield(s0, ap, card("Kree Soldier", "Creature — Kree Soldier", "{1}{W}", { cmc: 2, power: "2", toughness: "2" }));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(kree)]));
    expect(s.objects[kree]!.counters["+1/+1"]).toBe(2);
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    // A creature that becomes a Kree before the trigger resolves: it does nothing.
    const b = putOnBattlefield(s, ap, bear());
    s = castNow(s, ap, ids[1]!, [tgt(b)]);
    for (let i = 0; i < 20 && s.stack.some((x) => x.kind === "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.stack.length).toBe(1);
    addEffect(s, ap, [b], [{ kind: "addTypes", types: [], subtypes: ["Kree"] }], "game");
    expect(characteristics(s, s.objects[b]!).subtypes).toContain("Kree");
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
  });

  it("counters you put on Captain Marvel itself don't trigger it", () => {
    const { s: s0, ap, ids, marv } = withMarvel([growth]);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(marv)]));
    expect(s.objects[marv]!.counters["+1/+1"]).toBe(2);
    expect(s.pending).toBeFalsy();
  });

  it("counters an opponent puts don't trigger it", () => {
    const { s: s0, ap, opp } = withMarvel([]);
    const b = putOnBattlefield(s0, opp, bear());
    const g = toZone(s0, opp, growth, "hand");
    for (const l of [forest]) putOnBattlefield(s0, opp, l);
    // The opponent casts it on their own turn.
    let s = goUntil(s0, (c) => c.activePlayer === opp && c.step === "main1" && !c.stack.length);
    s = settle(castNow(s, opp, g, [tgt(b)]));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.pending).toBeFalsy();
  });
});

describe("Knickknack Ouphe", () => {
  /** Ouphe in hand; your library's top cards are, from the top, `top`. */
  const withTop = (top: CardDef[]) => {
    const { s, ap, ids, opp } = setup([ouphe()]);
    const lib = [...top].reverse().map((d) => toZone(s, ap, d, "library")).reverse();
    return { s, ap, ids, opp, lib };
  };

  it("X=2: reveals two, any Aura with mana value 2 or less may enter attached as you choose; the rest go to the bottom", () => {
    const { s: s0, ap, ids, lib } = withTop([rancor(), pacifism(), card("Big Aura", "Enchantment — Aura", "{3}{W}", { cmc: 4, oracleText: "Enchant creature" }), bear()]);
    const grizzly = putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, ids[0]!, [], {}, 2));
    const me = ids[0]!;
    expect(s.objects[me]!.counters["+1/+1"]).toBe(2);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    // Only the top two are revealed; both are Auras with mana value 2 or less.
    expect(p?.cards.sort()).toEqual([lib[0]!, lib[1]!].sort());
    expect(p?.dig?.looked.length).toBe(2);
    s = act(s, { type: "searchLibrary", player: ap, found: [lib[0]!] });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("enchant");
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    const onBear = opts.find((o) => o.includes(grizzly))!;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: onBear }));
    expect(zoneOf(s, lib[0]!)).toBe("battlefield");
    expect(s.objects[lib[0]!]!.attachedTo).toBe(grizzly);
    expect(power(s, s.objects[grizzly]!)).toBe(4);
    // Pacifism wasn't taken: it's at the bottom, below the cards that were under it.
    const library = s.players[ap]!.library;
    expect(library[library.length - 1]).toBe(lib[1]!);
    expect(library[0]).toBe(lib[2]!);
  });

  it("an Aura with mana value over X isn't offered", () => {
    const { s: s0, ap, ids, lib } = withTop([pacifism(), rancor()]);
    putOnBattlefield(s0, ap, bear());
    const s = settle(castNow(s0, ap, ids[0]!, [], {}, 1));
    // Nothing it could take: Pacifism goes to the bottom, Rancor stays on top.
    expect(s.pending).toBeFalsy();
    expect(zoneOf(s, lib[0]!)).toBe("library");
    const library = s.players[ap]!.library;
    expect(library[library.length - 1]).toBe(lib[0]!);
    expect(library[0]).toBe(lib[1]!);
  });

  it("X=0 reveals nothing", () => {
    const { s: s0, ap, ids, lib } = withTop([rancor()]);
    const s = settle(castNow(s0, ap, ids[0]!, [], {}, 0));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.library[0]).toBe(lib[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});

describe("Suspend Aggression", () => {
  it("exiles the target and your top card; each owner may play theirs until the end of their next turn", () => {
    const { s: s0, ap, ids, opp } = setup([suspendAggression()]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const top = toZone(s0, ap, card("Top Spell", "Sorcery", "{1}{G}", { cmc: 2, oracleText: "Draw a card." }), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    expect(zoneOf(s, theirs)).toBe("exile");
    expect(zoneOf(s, top)).toBe("exile");
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: opp, until: "nextTurn", turn: s0.turn });
    expect(s.objects[theirs]!.mayPlay?.castOnly).toBeUndefined();
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn", turn: s0.turn });
    // Still there for both after this turn ends: the opponent's next turn is the next one.
    s = goUntil(s, (c) => c.activePlayer === opp && c.step === "main1");
    expect(s.objects[theirs]!.mayPlay?.player).toBe(opp);
    expect(s.objects[top]!.mayPlay?.player).toBe(ap);
    // The opponent may cast their bear from exile now.
    for (const l of [forest, forest]) putOnBattlefield(s, opp, l);
    expect(planCast(s, opp, theirs)).not.toBeNull();
    expect(planCast(s, ap, top)).toBeNull(); // a sorcery, on someone else's turn
    // Over when that turn ends for the opponent's card; yours lasts until your own next turn ends.
    s = goUntil(s, (c) => c.activePlayer !== opp && c.step === "upkeep");
    expect(s.objects[theirs]!.mayPlay).toBeUndefined();
    expect(s.objects[top]!.mayPlay?.player).toBe(ap);
  });

  it("an illegal target: nothing is exiled (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([suspendAggression(), card("Test Bounce", "Instant", "{U}", { cmc: 1, oracleText: "Return target creature to its owner's hand." })]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const top = s0.players[ap]!.library[0]!;
    let s = castNow(s0, ap, ids[0]!, [tgt(theirs)]);
    s = castNow(s, ap, ids[1]!, [tgt(theirs)]);
    s = settle(s);
    expect(zoneOf(s, theirs)).toBe("hand");
    expect(zoneOf(s, top)).toBe("library");
  });

  it("a token target is exiled and gone; your top card still is", () => {
    const { s: s0, ap, ids, opp } = setup([suspendAggression()]);
    const tok = putOnBattlefield(s0, opp, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    const top = s0.players[ap]!.library[0]!;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(tok)]));
    expect(s.objects[tok]?.zone === "battlefield").toBe(false);
    expect(zoneOf(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay?.player).toBe(ap);
  });
});

describe("Too Evil to Stay Dead", () => {
  const big = () => card("Big Dead", "Creature — Zombie Giant", "{4}{B}{B}", { cmc: 6, power: "6", toughness: "6" });
  it("without teamwork: only a creature card with mana value 4 or less", () => {
    const { s: s0, ap, ids } = setup([tooEvil()]);
    const small = toZone(s0, ap, bear({ name: "Small Dead", cmc: 2 }), "graveyard");
    const large = toZone(s0, ap, big(), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(large), { kind: "none" }])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(large)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(small), { kind: "none" }]));
    expect(zoneOf(s, small)).toBe("battlefield");
    expect(controllerOf(s, s.objects[small]!)).toBe(ap);
  });

  it("cast using teamwork: any creature card in your graveyard", () => {
    const { s: s0, ap, ids } = setup([tooEvil()]);
    const large = toZone(s0, ap, big(), "graveyard");
    const helpers = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    const s = settle(castNow(s0, ap, ids[0]!, [{ kind: "none" }, tgt(large)], { teamwork: helpers }));
    expect(zoneOf(s, large)).toBe("battlefield");
    expect(helpers.every((h) => s.objects[h]!.tapped)).toBe(true);
  });

  it("a bot in its second main phase pays teamwork with creatures that can't attack any more to bring back a big one", () => {
    const { s: s0, ap, ids } = setup([tooEvil()]);
    const large = toZone(s0, ap, big(), "graveyard");
    const helpers = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    s0.players[ap]!.hand = [ids[0]!]; // only the spell in hand
    s0.players[ap]!.command = []; // and no commander to cast instead
    let s = goUntil(s0, (c) => c.step === "main2" && c.activePlayer === ap);
    expect(s.step).toBe("main2");
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "castSpell" && a.objectId === ids[0] && (a.teamwork?.length ?? 0) > 0)).toBe(true);
    for (const a of plan) s = act(s, a);
    s = settle(s);
    expect(zoneOf(s, large)).toBe("battlefield");
    expect(helpers.every((h) => s.objects[h]!.tapped)).toBe(true);
  });
});

describe("Earth's Mightiest Heroes", () => {
  const withTop = () => {
    const { s, ap, ids } = setup([heroes()]);
    const top = [bear({ name: "Hero A" }), bear({ name: "Hero B" }), bear({ name: "Hero C" }), forest, forest, forest, forest, forest];
    const lib = [...top].reverse().map((d) => toZone(s, ap, d, "library")).reverse();
    return { s, ap, ids, lib };
  };

  it("without teamwork: one creature card; the rest into your graveyard", () => {
    const { s: s0, ap, ids, lib } = withTop();
    let s = settle(castNow(s0, ap, ids[0]!));
    const p = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    expect(p?.max).toBe(1);
    expect(() => act(structuredClone(s), { type: "searchLibrary", player: ap, found: [lib[0]!, lib[1]!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[1]!] }));
    expect(zoneOf(s, lib[1]!)).toBe("battlefield");
    expect([0, 2, 3, 4, 5, 6, 7].every((i) => zoneOf(s, lib[i]!) === "graveyard")).toBe(true);
  });

  it("cast using teamwork: any number of them, entering together", () => {
    const { s: s0, ap, ids, lib } = withTop();
    const helpers = [putOnBattlefield(s0, ap, card("Big Helper", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" }))];
    let s = settle(castNow(s0, ap, ids[0]!, [], { teamwork: helpers }));
    const p = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    expect(p?.max).toBeGreaterThanOrEqual(3);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, lib[1]!, lib[2]!] }));
    expect([0, 1, 2].every((i) => zoneOf(s, lib[i]!) === "battlefield")).toBe(true);
    expect([3, 4, 5, 6, 7].every((i) => zoneOf(s, lib[i]!) === "graveyard")).toBe(true);
  });
});
