// Round 352 (Lane A): exiling cards with four or more card types among them from your graveyard (Nethergoyf's escape,
// Winter, Cynical Opportunist), casualty X with a copy that isn't legendary and has starting loyalty X (Ob Nixilis, the
// Adversary), and a Mirror copying one of the cards it imprinted (Panoptic Mirror).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, cardTypesAmong, cardTypesPick, castProblem, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes, other players' questions answered as the bots would, until `me` is asked something or all is done. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player, targets: p.current });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes on until `me` has a question (others answered as bots), at most `max` actions. */
const untilAsked = (s: GameState, me: PlayerId, max = 400) => {
  for (let i = 0; i < max && s.pending?.player !== me; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  (zone === "hand" ? s.players[pid]!.hand : s.players[pid]!.graveyard).push(id);
  return id;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};

// Real oracle text (Scryfall).
const nethergoyf = (): CardDef => ({"oracleId":"040cbd8a-a9e5-454b-a5ae-9b66bb66b8e9","name":"Nethergoyf","manaCost":"{B}","cmc":1,"typeLine":"Creature — Lhurgoyf","supertypes":[],"types":["Creature"],"subtypes":["Lhurgoyf"],"oracleText":"Nethergoyf's power is equal to the number of card types among cards in your graveyard and its toughness is equal to that number plus 1.\nEscape—{2}{B}, Exile any number of other cards from your graveyard with four or more card types among them. (You may cast this card from your graveyard for its escape cost.)","power":"*","toughness":"1+*","colors":["B"],"colorIdentity":["B"],"keywords":["Escape"],"commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const winter = (): CardDef => ({"oracleId":"e70a01dd-4dbe-4811-ac93-1c6d0142e06e","name":"Winter, Cynical Opportunist","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Deathtouch\nWhenever Winter attacks, mill three cards.\nDelirium — At the beginning of your end step, you may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it.","power":"2","toughness":"5","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Deathtouch","Delirium","Mill"],"commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const obNix = (): CardDef => ({"oracleId":"a6abb6af-7ea2-43f3-8718-2a077ad0c947","name":"Ob Nixilis, the Adversary","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Legendary Planeswalker — Nixilis","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Nixilis"],"oracleText":"Casualty X. The copy isn't legendary and has starting loyalty X. (As you cast this spell, you may sacrifice a creature with power X. When you do, copy this spell. The copy becomes a token.)\n+1: Each opponent loses 2 life unless they discard a card. If you control a Demon or Devil, you gain 2 life.\n−2: Create a 1/1 red Devil creature token with \"When this token dies, it deals 1 damage to any target.\"\n−7: Target player draws seven cards and loses 7 life.","loyalty":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Casualty"],"commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mirror = (): CardDef => ({"oracleId":"505cb78d-b292-4d16-b3f2-110164b4cc93","name":"Panoptic Mirror","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Imprint — {X}, {T}: You may exile an instant or sorcery card with mana value X from your hand.\nAt the beginning of your upkeep, you may copy a card exiled with this artifact. If you do, you may cast the copy without paying its mana cost.","colors":[],"colorIdentity":[],"keywords":["Imprint"],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"mythic","layout":"normal","gameChanger":true}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fire = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 352: compiles", () => {
  it("every card of the round", () => supported(nethergoyf(), winter(), obNix(), mirror()));
  it("the costs and copies as compiled", () => {
    expect(compileCard(obNix())).toMatchObject({ casualty: 0, casualtyX: true });
  });
});

describe("Nethergoyf", () => {
  const yard = (s: GameState, ap: PlayerId) => [toZone(s, ap, bolt(), "graveyard"), toZone(s, ap, solRing(), "graveyard"), toZone(s, ap, bears(), "graveyard"), toZone(s, ap, divination(), "graveyard")];

  it("escapes by exiling other cards with four or more card types among them", () => {
    const { s: s0, ap } = setup([]);
    // An instant, an artifact, a creature and a sorcery.
    const four = yard(s0, ap);
    const goyf = toZone(s0, ap, nethergoyf(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, goyf, undefined, undefined, undefined, undefined, { via: "escape", exileCards: four })));
    expect(s.objects[goyf]!.zone).toBe("battlefield");
    expect(s.players[ap]!.exile).toEqual(expect.arrayContaining(four));
  });

  it("three card types aren't enough, and it can't exile itself or count itself", () => {
    const { s: s0, ap } = setup([]);
    const [b, ring, bear] = yard(s0, ap);
    const goyf = toZone(s0, ap, nethergoyf(), "graveyard");
    expect(castProblem(s0, ap, goyf, undefined, undefined, undefined, undefined, undefined, { via: "escape", exileCards: [b!, ring!, bear!] })).toMatch(/4 or more card types/);
    expect(castProblem(s0, ap, goyf, undefined, undefined, undefined, undefined, undefined, { via: "escape", exileCards: [goyf, b!, ring!, bear!] })).toMatch(/4 or more card types/);
  });

  it("with fewer than four card types in the graveyard it can't escape", () => {
    const { s: s0, ap } = setup([]);
    toZone(s0, ap, bolt(), "graveyard");
    toZone(s0, ap, bears(), "graveyard");
    toZone(s0, ap, solRing(), "graveyard");
    const goyf = toZone(s0, ap, nethergoyf(), "graveyard");
    expect(castProblem(s0, ap, goyf, undefined, undefined, undefined, undefined, undefined, { via: "escape" })).toMatch(/card types/);
  });

  it("bots pick the fewest cards that make four card types", () => {
    const { s: s0, ap } = setup([]);
    const ids = yard(s0, ap);
    toZone(s0, ap, bolt(), "graveyard");
    const pick = cardTypesPick(s0, s0.players[ap]!.graveyard, 4)!;
    expect(pick).toHaveLength(4);
    expect(cardTypesAmong(s0, pick)).toBe(4);
    expect(new Set(pick)).toEqual(new Set(ids));
  });
});

describe("Winter, Cynical Opportunist", () => {
  const atEnd = (s0: GameState, ap: PlayerId) => untilAsked(passUntil(s0, "end", ap), ap);

  it("at your end step: exile cards with four or more card types among them, then one permanent card among them enters with a finality counter", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, winter());
    const b = toZone(s0, ap, bolt(), "graveyard");
    const ring = toZone(s0, ap, solRing(), "graveyard");
    const bear = toZone(s0, ap, bears(), "graveyard");
    const div = toZone(s0, ap, divination(), "graveyard");
    let s = atEnd(s0, ap);
    const p = pend(s, "searchLibrary");
    expect(p.cardTypes).toBe(4);
    // Three card types: refused.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [b, ring, bear] })).toThrow(/card types/);
    s = act(s, { type: "searchLibrary", player: ap, found: [b, ring, bear, div] });
    const q = pend(s, "searchLibrary");
    expect(new Set(q.cards)).toEqual(new Set([ring, bear]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bear] }), ap);
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(s.objects[bear]!.counters.finality).toBe(1);
    for (const id of [b, ring, div]) expect(s.objects[id]!.zone).toBe("exile");
  });

  it("choosing none exiles nothing", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, winter());
    const ids = [toZone(s0, ap, bolt(), "graveyard"), toZone(s0, ap, solRing(), "graveyard"), toZone(s0, ap, bears(), "graveyard"), toZone(s0, ap, divination(), "graveyard")];
    let s = atEnd(s0, ap);
    pend(s, "searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    for (const id of ids) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("with fewer than four card types in the graveyard, nothing is asked", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, winter());
    const ids = [toZone(s0, ap, bolt(), "graveyard"), toZone(s0, ap, solRing(), "graveyard"), toZone(s0, ap, bears(), "graveyard")];
    const s = untilAsked(passUntil(s0, "end", ap), ap, 60);
    expect(s.pending?.kind === "searchLibrary" && s.pending.cardTypes).toBeFalsy();
    for (const id of ids) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("a bot exiles the best permanent card with the fewest others and puts it onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, winter());
    toZone(s0, ap, bolt(), "graveyard");
    toZone(s0, ap, solRing(), "graveyard");
    const angelId = toZone(s0, ap, angel(), "graveyard");
    toZone(s0, ap, divination(), "graveyard");
    toZone(s0, ap, growth(), "graveyard");
    let s = atEnd(s0, ap);
    pend(s, "searchLibrary");
    const a = botActions(s, ap)[0]!;
    expect(a.type === "searchLibrary" && a.found).toContain(angelId);
    s = act(s, a);
    s = act(s, botActions(s, ap)[0]!);
    expect(s.objects[angelId]!.zone).toBe("battlefield");
    expect(s.objects[angelId]!.counters.finality).toBe(1);
  });
});

describe("Ob Nixilis, the Adversary", () => {
  it("casualty X: the copy isn't legendary and has starting loyalty X, the sacrificed creature's power", () => {
    const { s: s0, ap, ids } = setup([obNix()]);
    const a = putOnBattlefield(s0, ap, angel());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { casualty: a }));
    expect(s.objects[a]!.zone).toBe("graveyard");
    s = settle(s, ap);
    const mine = s.battlefield.map((id) => s.objects[id]!).filter((o) => s.cards[o.cardId]!.name === "Ob Nixilis, the Adversary");
    expect(mine).toHaveLength(2);
    const token = mine.find((o) => o.isToken)!;
    const card = mine.find((o) => !o.isToken)!;
    expect(token.counters.loyalty).toBe(4);
    expect(card.counters.loyalty).toBe(3);
    expect(s.cards[token.cardId]!.supertypes).not.toContain("Legendary");
  });

  it("a 2-power creature makes a copy with 2 loyalty; without casualty there's no copy", () => {
    const { s: s0, ap, ids } = setup([obNix()]);
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { casualty: b })), ap);
    const token = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken && s.cards[o.cardId]!.name === "Ob Nixilis, the Adversary")!;
    expect(token.counters.loyalty).toBe(2);
    const { s: t0, ap: ap2, ids: ids2 } = setup([obNix()]);
    s = settle(run(t0, planCast(t0, ap2, ids2[0]!)), ap2);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Ob Nixilis, the Adversary")).toHaveLength(1);
  });
});

describe("Panoptic Mirror", () => {
  const imprint = (s: GameState, ap: PlayerId, m: string, x: number, card: string) => {
    s = untilAsked(run(s, planActivate(s, ap, m, 0, undefined, undefined, undefined, x)), ap, 40);
    if (s.pending?.kind === "chooseMay") s = untilAsked(act(s, { type: "chooseMay", player: ap, yes: true }), ap, 40);
    const p = pend(s, "searchLibrary");
    expect(p.cards).toEqual([card]);
    return settle(act(s, { type: "searchLibrary", player: ap, found: [card] }), ap);
  };

  it("imprints instants and sorceries with mana value X; at your upkeep, copy one of them and cast the copy free", () => {
    const { s: s0, ap, ids, opp } = setup([bolt(), divination()]);
    const m = putOnBattlefield(s0, ap, mirror());
    let s = imprint(s0, ap, m, 1, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s.objects[m]!.tapped = false;
    s = imprint(s, ap, m, 3, ids[1]!);
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    // On to our next upkeep.
    s = passUntil(s, "upkeep", ap);
    s = untilAsked(s, ap);
    const p = pend(s, "searchLibrary");
    expect(new Set(p.cards)).toEqual(new Set(ids));
    s = untilAsked(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }), ap);
    const free = pend(s, "castFree");
    expect(free.objectId).not.toBe(ids[0]);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, free.objectId, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[free.objectId]).toBeUndefined();
  });

  it("only a card with mana value exactly X can be imprinted", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const m = putOnBattlefield(s0, ap, mirror());
    let s = untilAsked(run(s0, planActivate(s0, ap, m, 0, undefined, undefined, undefined, 2)), ap, 40);
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, ap);
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.includes(ids[0]!)).toBe(false);
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
  });

  it("with one card imprinted, the upkeep goes straight to casting the copy; with none, nothing happens", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const m = putOnBattlefield(s0, ap, mirror());
    let s = imprint(s0, ap, m, 1, ids[0]!);
    s = untilAsked(passUntil(s, "upkeep", ap), ap);
    expect(pend(s, "castFree").player).toBe(ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[ap]!.exile).toEqual([ids[0]!]);
  });
});
