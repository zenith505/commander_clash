// Lane B round B180: Nafs Asp, Glass Asp, Sabertooth Cobra and Quenchable Fire ("unless they pay {1} before that draw step":
// a delayed trigger the player may stop by paying, a special action), Lantern Flare (X in its cleave cost), Political
// Triumph ("sacrifice it, draw a card, and put ..."), Maeve, Insidious Singer ("whenever that creature attacks one of your
// opponents this turn").

import { describe, expect, it } from "vitest";
import { act, forest, island, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, planActivate, payableDelayed, payDelayedProblem, planCast, planPayDelayed, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const nafs = (): CardDef => ({"oracleId":"da7bc9d6-a0cc-407a-bed9-d677c2dd74f2","name":"Nafs Asp","manaCost":"{G}","cmc":1,"typeLine":"Creature — Snake","supertypes":[],"types":["Creature"],"subtypes":["Snake"],"oracleText":"Whenever this creature deals damage to a player, that player loses 1 life at the beginning of their next draw step unless they pay {1} before that draw step.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/e/3ecc8d7c-c64f-4ada-b389-756728401b64.jpg?1783948380","artUrl":"https://cards.scryfall.io/art_crop/front/3/e/3ecc8d7c-c64f-4ada-b389-756728401b64.jpg?1783948380","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const glass = (): CardDef => ({"oracleId":"22abc3e8-49bb-475a-8248-0ce85274913c","name":"Glass Asp","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Snake","supertypes":[],"types":["Creature"],"subtypes":["Snake"],"oracleText":"Whenever this creature deals combat damage to a player, that player loses 2 life at the beginning of their next draw step unless they pay {2} before that step.","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/118253e9-f33a-455d-b785-dd9df657e7cf.jpg?1783943212","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/118253e9-f33a-455d-b785-dd9df657e7cf.jpg?1783943212","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cobra = (): CardDef => ({"oracleId":"115c7ca7-c27b-43ca-9281-be6913e90059","name":"Sabertooth Cobra","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Snake","supertypes":[],"types":["Creature"],"subtypes":["Snake"],"oracleText":"Whenever this creature deals damage to a player, that player gets a poison counter. The player gets another poison counter at the beginning of their next upkeep unless they pay {2} before that step. (A player with ten or more poison counters loses the game.)","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48ead72b-f3f5-4065-a33c-0992cf1fdb34.jpg?1783947060","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48ead72b-f3f5-4065-a33c-0992cf1fdb34.jpg?1783947060","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fire = (): CardDef => ({"oracleId":"d2eeb1eb-38c0-4b76-ad96-a53b6bdc00e1","name":"Quenchable Fire","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Quenchable Fire deals 3 damage to target player or planeswalker. It deals an additional 3 damage to that player or planeswalker at the beginning of your next upkeep step unless that player or that planeswalker's controller pays {U} before that step.","colors":["R"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1c0ded-2a80-4ed4-b9fc-3a18bf5c3239.jpg?1783942478","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1c0ded-2a80-4ed4-b9fc-3a18bf5c3239.jpg?1783942478","commanderLegal":"legal","set":"con","releasedAt":"2009-02-06","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const flare = (): CardDef => ({"oracleId":"06a1c404-d76f-4206-8740-7ad7488fac33","name":"Lantern Flare","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cleave {X}{R}{W} (You may cast this spell for its cleave cost. If you do, remove the words in square brackets.)\nLantern Flare deals X damage to target creature or planeswalker and you gain X life. [X is the number of creatures you control.]","colors":["W"],"colorIdentity":["R","W"],"keywords":["Cleave"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/660313c5-7460-4ee0-8ead-0abb3d7ed7b6.jpg?1783924300","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/660313c5-7460-4ee0-8ead-0abb3d7ed7b6.jpg?1783924300","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const triumph = (): CardDef => ({"oracleId":"0bbceb51-1fb8-44d7-8afc-b4746d292262","name":"Political Triumph","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Plan","supertypes":[],"types":["Enchantment"],"subtypes":["Plan"],"oracleText":"Whenever a creature you control enters, scry 1 and put a plan counter on this enchantment.\nWhen the fourth plan counter is put on this enchantment, sacrifice it, draw a card, and put a +1/+1 counter on each creature you control.","colors":["W"],"colorIdentity":["W"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/dec3dd36-b8ca-432b-8973-d37c6efc4c1a.jpg?1783902968","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/dec3dd36-b8ca-432b-8973-d37c6efc4c1a.jpg?1783902968","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const maeve = (): CardDef => ({"oracleId":"2494daad-c81d-4a80-ba5d-e7011af8de46","name":"Maeve, Insidious Singer","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Creature — Siren","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Siren"],"oracleText":"{2}{U}: Goad target creature. Whenever that creature attacks one of your opponents this turn, you draw a card. (A goaded creature attacks each combat if able and attacks a player other than you if able, until your next turn.)","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Goad"],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2743136b-3610-4c43-8ed7-a00b1f58a874.jpg?1783920303","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2743136b-3610-4c43-8ed7-a00b1f58a874.jpg?1783920303","commanderLegal":"legal","set":"gn3","releasedAt":"2022-10-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes (no blocks) until `done` holds. */
const passTill = (s: GameState, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000 && !done(s); i++) {
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!done(s)) throw new Error("never got there");
  return s;
};
/** `ap` attacks `opp` with `attacker`, unblocked, through combat damage and its triggers. */
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, attacker: string) => {
  s = passTill(s, (x) => x.pending?.kind === "declareAttackers");
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
  return passTill(s, (x) => x.step === "main2");
};
const at = (step: GameState["step"], pid: PlayerId) => (x: GameState) => x.step === step && x.activePlayer === pid && waitingOn(x) === pid && !x.stack.length && !x.triggerQueue.length;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

describe("Lane B round B180: cards", () => {
  it("compile", () => supported(nafs(), glass(), cobra(), fire(), flare(), triumph(), maeve()));
});

describe("Nafs Asp and Glass Asp: loses life at the beginning of their next draw step unless they pay before it", () => {
  it("unpaid, the player loses the life as their draw step begins", () => {
    const { s: s0, ap, opp } = setup([]);
    const asp = putOnBattlefield(s0, ap, nafs());
    let s = attack(s0, ap, opp, asp);
    expect(life(s, opp)).toBe(39);
    expect(payableDelayed(s, opp)).toHaveLength(1);
    expect(payableDelayed(s, ap)).toHaveLength(0);
    // Their upkeep: nothing yet.
    s = passTill(s, at("upkeep", opp));
    expect(life(s, opp)).toBe(39);
    s = passTill(s, (x) => x.step === "draw" && x.activePlayer === opp && !x.stack.length && !x.triggerQueue.length && waitingOn(x) === opp);
    expect(life(s, opp)).toBe(38);
    expect(payableDelayed(s, opp)).toHaveLength(0);
  });

  it("paying is a special action while they have priority, once; then nothing happens", () => {
    const { s: s0, ap, opp } = setup([]);
    const asp = putOnBattlefield(s0, ap, nafs());
    putOnBattlefield(s0, opp, forest);
    let s = attack(s0, ap, opp, asp);
    const id = payableDelayed(s, opp)[0]!.unlessPaid!.id;
    // Not while someone else has priority.
    expect(payDelayedProblem(s, opp, id)).toMatch(/only while you have priority/);
    s = passTill(s, at("upkeep", opp));
    expect(payDelayedProblem(s, opp, id)).toMatch(/not enough mana/);
    s = run(s, planPayDelayed(s, opp, id));
    expect(s.players[opp]!.manaPool.G ?? 0).toBe(0);
    expect(s.stack).toHaveLength(0); // it doesn't use the stack
    expect(waitingOn(s)).toBe(opp); // and they get priority again
    expect(planPayDelayed(s, opp, id)).toBeNull(); // once only
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === opp);
    expect(life(s, opp)).toBe(39);
  });

  it("each time it deals damage is one more, each paid for apart (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a1 = putOnBattlefield(s0, ap, nafs());
    const a2 = putOnBattlefield(s0, ap, nafs());
    putOnBattlefield(s0, opp, forest);
    let s = passTill(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    s = passTill(s, (x) => x.step === "main2");
    expect(life(s, opp)).toBe(38);
    const due = payableDelayed(s, opp);
    expect(due).toHaveLength(2);
    s = passTill(s, at("upkeep", opp));
    // One Forest: one of them paid.
    s = run(s, planPayDelayed(s, opp, due[0]!.unlessPaid!.id));
    expect(planPayDelayed(s, opp, due[1]!.unlessPaid!.id)).toBeNull();
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === opp);
    expect(life(s, opp)).toBe(37);
  });

  it("the bot pays during its upkeep, before its draw step", () => {
    const { s: s0, ap, opp } = setup([]);
    const asp = putOnBattlefield(s0, ap, nafs());
    putOnBattlefield(s0, opp, forest);
    let s = attack(s0, ap, opp, asp);
    // Earlier, in the end step: not yet.
    s = passTill(s, (x) => x.step === "end" && waitingOn(x) === opp);
    expect(botActions(s, opp).some((a) => a.type === "payDelayed")).toBe(false);
    s = passTill(s, at("upkeep", opp));
    const plan = botActions(s, opp);
    expect(plan[plan.length - 1]).toMatchObject({ type: "payDelayed", player: opp });
    s = run(s, plan);
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === opp);
    expect(life(s, opp)).toBe(39);
  });

  it("Glass Asp: combat damage, 2 life unless {2}", () => {
    const { s: s0, ap, opp } = setup([]);
    const asp = putOnBattlefield(s0, ap, glass());
    let s = attack(s0, ap, opp, asp);
    expect(life(s, opp)).toBe(38);
    expect(payableDelayed(s, opp)[0]!.unlessPaid!.cost).toBe("{2}");
    s = passTill(s, (x) => x.step === "draw" && x.activePlayer === opp && !x.stack.length && !x.triggerQueue.length && waitingOn(x) === opp);
    expect(life(s, opp)).toBe(36);
  });
});

describe("Sabertooth Cobra: another poison counter at the beginning of their next upkeep unless they pay {2}", () => {
  it("one now, one at their upkeep, even with the Cobra gone (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cobra());
    let s = attack(s0, ap, opp, c);
    expect(s.players[opp]!.poison).toBe(1);
    // The Cobra leaves the battlefield.
    s.battlefield.splice(s.battlefield.indexOf(c), 1);
    s.objects[c]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(c);
    s = passTill(s, (x) => x.step === "upkeep" && x.activePlayer === opp && !x.stack.length && !x.triggerQueue.length && waitingOn(x) === opp);
    expect(s.players[opp]!.poison).toBe(2);
  });

  it("paid before their upkeep, no second counter; the bot pays in the end step before it", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cobra());
    putOnBattlefield(s0, opp, forest);
    putOnBattlefield(s0, opp, forest);
    let s = attack(s0, ap, opp, c);
    s = passTill(s, (x) => x.step === "end" && waitingOn(x) === opp);
    const plan = botActions(s, opp);
    expect(plan[plan.length - 1]).toMatchObject({ type: "payDelayed", player: opp });
    s = run(s, plan);
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === opp);
    expect(s.players[opp]!.poison).toBe(1);
  });
});

describe("Quenchable Fire: 3 more damage at the beginning of your next upkeep unless that player pays {U}", () => {
  const tp = (id: PlayerId): TargetChoice => ({ kind: "player", id });
  it("to a player, unpaid: 3 now and 3 at the caster's next upkeep", () => {
    const { s: s0, ap, ids, opp } = setup([fire()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tp(opp)]));
    s = passTill(s, (x) => !x.stack.length);
    expect(life(s, opp)).toBe(37);
    expect(payableDelayed(s, opp)[0]!.unlessPaid!.cost).toBe("{U}");
    // The target's own upkeep and turn come and go.
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === opp);
    expect(life(s, opp)).toBe(37);
    s = passTill(s, (x) => x.step === "upkeep" && x.activePlayer === ap && !x.stack.length && !x.triggerQueue.length && waitingOn(x) === ap);
    expect(life(s, opp)).toBe(34);
  });

  it("paid with {U} on their turn: nothing more", () => {
    const { s: s0, ap, ids, opp } = setup([fire()]);
    putOnBattlefield(s0, opp, island);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tp(opp)]));
    s = passTill(s, (x) => !x.stack.length);
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === opp && waitingOn(x) === opp);
    const id = payableDelayed(s, opp)[0]!.unlessPaid!.id;
    s = run(s, planPayDelayed(s, opp, id));
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === ap);
    expect(life(s, opp)).toBe(37);
  });

  it("to a planeswalker: its controller may pay; unpaid, it's dealt 3 more", () => {
    const { s: s0, ap, ids, opp } = setup([fire()]);
    const pw = putOnBattlefield(s0, opp, jace());
    s0.objects[pw]!.counters = { loyalty: 7 };
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: pw }]));
    s = passTill(s, (x) => !x.stack.length);
    expect(s.objects[pw]!.counters.loyalty).toBe(4);
    expect(payableDelayed(s, opp)).toHaveLength(1);
    expect(payableDelayed(s, ap)).toHaveLength(0);
    s = passTill(s, (x) => x.step === "upkeep" && x.activePlayer === ap && !x.stack.length && !x.triggerQueue.length && waitingOn(x) === ap);
    expect(s.objects[pw]!.counters.loyalty).toBe(1);
    expect(life(s, opp)).toBe(40);
  });
});

describe("Lantern Flare: Cleave {X}{R}{W}", () => {
  it("not cleaved, X is the number of creatures you control; cleaved, X is announced", () => {
    const { s: s0, ap, ids, opp } = setup([flare()]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, glass());
    const pw = putOnBattlefield(s0, opp, jace());
    s0.objects[pw]!.counters = { loyalty: 9 };
    const tgt: TargetChoice[] = [{ kind: "object", id: pw }];
    // {1}{W}: 3 damage and 3 life with three creatures.
    let s = run(s0, planCast(s0, ap, ids[0]!, tgt));
    s = passTill(s, (x) => !x.stack.length);
    expect(s.objects[pw]!.counters.loyalty).toBe(6);
    expect(life(s, ap)).toBe(43);
    // Cast for its cleave cost with X 5: the bracketed sentence is gone, X is 5 (rulings).
    const c = setup([flare()]);
    for (let i = 0; i < 3; i++) putOnBattlefield(c.s, c.ap, glass());
    const pw2 = putOnBattlefield(c.s, c.opp, jace());
    c.s.objects[pw2]!.counters = { loyalty: 9 };
    let t = run(c.s, planCast(c.s, c.ap, c.ids[0]!, [{ kind: "object", id: pw2 }], undefined, undefined, 5, { alt: "cleave" }));
    t = passTill(t, (x) => !x.stack.length);
    expect(t.objects[pw2]!.counters.loyalty).toBe(4);
    expect(life(t, c.ap)).toBe(45);
    // Its mana value stays 2 (rulings).
    expect(compileCard(flare()).altCosts?.[0]).toMatchObject({ kind: "cleave", mana: "{X}{R}{W}" });
  });
});

describe("Political Triumph: the fourth plan counter", () => {
  it("sacrifice it, draw a card, and put a +1/+1 counter on each creature you control", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    const plan = putOnBattlefield(s0, ap, triumph());
    s0.objects[plan]!.counters = { plan: 3 };
    const other = putOnBattlefield(s0, ap, glass());
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passTill(s, (x) => x.pending?.kind === "arrangeTop" || (!x.stack.length && !x.triggerQueue.length));
    // Scry 1, then the plan counter: the fourth.
    if (s.pending?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] });
    s = passTill(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.objects[plan]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand); // the Bears left the hand, a card was drawn
    expect(s.objects[other]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Maeve, Insidious Singer: whenever that creature attacks one of your opponents this turn, you draw a card", () => {
  /** On `opp`'s upkeep, `ap` goads `opp`'s Glass Asp with Maeve; then `opp` attacks with it as `attack` says. */
  const goadThenAttack = (attack: (s: GameState, opp: PlayerId, ap: PlayerId, asp: string) => { defender: PlayerId; planeswalker?: string }) => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, maeve());
    const asp = putOnBattlefield(s0, opp, glass());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const pw = putOnBattlefield(s0, third, jace());
    s0.objects[pw]!.counters = { loyalty: 5 };
    let s = passTill(s0, (x) => x.activePlayer === opp && x.step === "upkeep" && waitingOn(x) === ap && !x.stack.length);
    s = run(s, planActivate(s, ap, m, 0, [{ kind: "object", id: asp }]));
    s = passTill(s, (x) => !x.stack.length && !x.triggerQueue.length);
    const hand = s.players[ap]!.hand.length;
    s = passTill(s, (x) => x.pending?.kind === "declareAttackers");
    const where = attack(s, opp, ap, asp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: asp, defender: where.defender, ...(where.planeswalker ? { planeswalker: where.planeswalker } : {}) }] });
    s = passTill(s, (x) => x.step === "declareBlockers" || x.step === "combatDamage" || x.step === "endCombat");
    return { drew: s.players[ap]!.hand.length - hand, third, pw };
  };
  it("it attacks another opponent of yours: you draw a card", () => {
    let third = -1;
    const r = goadThenAttack((s, opp) => ({ defender: (third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!) }));
    expect(third).toBe(r.third);
    expect(r.drew).toBe(1);
  });
  it("only this turn: goaded on your own turn, it attacks on its controller's turn and you draw nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, maeve());
    const asp = putOnBattlefield(s0, opp, glass());
    let s = run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: asp }]));
    s = passTill(s, (x) => !x.stack.length && !x.triggerQueue.length);
    s = passTill(s, (x) => x.pending?.kind === "declareAttackers" && x.activePlayer === opp);
    const hand = s.players[ap]!.hand.length;
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: asp, defender: third }] });
    s = passTill(s, (x) => x.step === "declareBlockers" || x.step === "combatDamage" || x.step === "endCombat");
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.delayed?.some((d) => d.when === "attacksOpponent") ?? false).toBe(false);
  });
});
