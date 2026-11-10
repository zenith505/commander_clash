// Round 338 (Lane A): One Last Job (spree, its third mode returning an Aura or Equipment card "attached to a creature you
// control", chosen as it resolves), Overencumbered (enchanted opponent's tokens, and "that player may pay {1} for each
// artifact they control. If they don't, creatures can't attack this combat"), Whiskervale Forerunner (valiant: "You may put
// it onto the battlefield if it's your turn"), Chancellor of the Annex (revealed from the opening hand: each opponent's
// first spell of the game), Hostile Hostel // Creeping Inn (soul counters, transform, then untap; creature cards exiled
// with it) and Extraordinary Journey (creatures that entered from exile or were cast from exile).

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, passUntil, putOnBattlefield, setup, forest } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, createGame, invalidateCharacteristics, isFullySupported, planActivate, planCast, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const moveTo = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  (zone === "hand" ? s.players[pid]!.hand : s.players[pid]!.graveyard).push(id);
  invalidateCharacteristics(s);
  return id;
};
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).map((id) => ch(s, id).name).sort();

// Real oracle text (Scryfall).
const oneLastJob = (): CardDef => ({"oracleId":"55cba59c-932c-4295-87dc-9179fbdfbd53","name":"One Last Job","manaCost":"{2}{W}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Spree (Choose one or more additional costs.)\n+ {2} — Return target creature card from your graveyard to the battlefield.\n+ {1} — Return target Mount or Vehicle card from your graveyard to the battlefield.\n+ {1} — Return target Aura or Equipment card from your graveyard to the battlefield attached to a creature you control.","colors":["W"],"colorIdentity":["W"],"keywords":["Spree"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const overencumbered = (): CardDef => ({"oracleId":"54400ec3-f2ab-4cdf-9731-e04281bf7e90","name":"Overencumbered","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant opponent\nWhen this Aura enters, enchanted opponent creates a Clue token, a Food token, and a Junk token.\nAt the beginning of combat on enchanted opponent's turn, that player may pay {1} for each artifact they control. If they don't, creatures can't attack this combat.","colors":["W"],"colorIdentity":["W"],"keywords":["Food","Enchant"],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const whiskervale = (): CardDef => ({"oracleId":"861e427f-cbb4-4ed5-8356-747ac638ac34","name":"Whiskervale Forerunner","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Mouse Bard","supertypes":[],"types":["Creature"],"subtypes":["Mouse","Bard"],"oracleText":"Valiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, look at the top five cards of your library. You may reveal a creature card with mana value 3 or less from among them. You may put it onto the battlefield if it's your turn. If you don't put it onto the battlefield, put it into your hand. Put the rest on the bottom of your library in a random order.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Valiant"],"commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const annex = (): CardDef => ({"oracleId":"85c0a376-da6f-4f69-853c-a093708d0952","name":"Chancellor of the Annex","manaCost":"{4}{W}{W}{W}","cmc":7,"typeLine":"Creature — Phyrexian Angel","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Angel"],"oracleText":"You may reveal this card from your opening hand. If you do, when each opponent casts their first spell of the game, counter that spell unless that player pays {1}.\nFlying\nWhenever an opponent casts a spell, counter it unless that player pays {1}.","power":"5","toughness":"6","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hostel = (): CardDef => ({"oracleId":"1b340f71-502f-48e9-85ed-9af62f356115","name":"Hostile Hostel // Creeping Inn","manaCost":"","cmc":0,"typeLine":"Land // Artifact Creature — Horror Construct","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice a creature: Put a soul counter on this land. Then if there are three or more soul counters on it, remove those counters, transform it, then untap it. Activate only as a sorcery.","colors":[],"colorIdentity":["B"],"keywords":["Transform"],"producedMana":["C"],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Hostile Hostel","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice a creature: Put a soul counter on this land. Then if there are three or more soul counters on it, remove those counters, transform it, then untap it. Activate only as a sorcery.","colors":[]},{"name":"Creeping Inn","manaCost":"","typeLine":"Artifact Creature — Horror Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Horror","Construct"],"oracleText":"Whenever this creature attacks, you may exile a creature card from your graveyard. If you do, each opponent loses X life and you gain X life, where X is the number of creature cards exiled with this creature.\n{4}: This creature phases out.","power":"3","toughness":"7","colors":["B"],"colorIndicator":["B"]}]}) as CardDef;
const journey = (): CardDef => ({"oracleId":"69288566-3015-45de-b391-6fe079865f0c","name":"Extraordinary Journey","manaCost":"{X}{X}{U}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile up to X target creatures. For each of those cards, its owner may play it for as long as it remains exiled.\nWhenever one or more nontoken creatures enter, if one or more of them entered from exile or was cast from exile, you draw a card. This ability triggers only once each turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const holyStrength = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const copter = (): CardDef => ({"oracleId":"49136bdc-bc50-49a2-999a-1ef9c16ea130","name":"Smuggler's Copter","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Flying","Crew"],"commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lion = (): CardDef => ({"oracleId":"e3c0b11e-7340-4e0a-98b7-91b38439d4f9","name":"Silvercoat Lion","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const vanguard = (): CardDef => ({"oracleId":"b3b9a87d-cb95-435c-90b6-037406cab32e","name":"Elite Vanguard","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const impulse = (): CardDef => ({"oracleId":"5bf49f39-b3d5-4148-8dc2-b5b5011769d2","name":"Adventurous Impulse","manaCost":"{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top three cards of your library. You may reveal a creature or land card from among them and put it into your hand. Put the rest on the bottom of your library in any order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cloudshift = (): CardDef => card("Cloudshift", "Instant", "{W}", { oracleText: "Exile target creature you control, then return that card to the battlefield under your control." });
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 338: compiles", () => {
  it("every card of the round", () => supported(oneLastJob(), overencumbered(), whiskervale(), annex(), hostel(), journey()));
});

describe("round 338: One Last Job", () => {
  it("the third mode: an Equipment onto a creature you control chosen as it resolves, the one the first mode returned too", () => {
    const { s: s0, ap, ids } = setup([oneLastJob()]);
    let s = s0;
    const vanguard_ = putOnBattlefield(s, ap, vanguard());
    const bears = moveTo(s, ap, bear(), "graveyard");
    const eq = moveTo(s, ap, bonesplitter(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears }, { kind: "object", id: eq }], [0, 2])), ap);
    const p = pend(s, "chooseOption");
    expect(p.what).toBe("attachHost");
    expect([...p.options].sort()).toEqual([bears, vanguard_].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: bears }), ap);
    expect(s.objects[bears]!.zone).toBe("battlefield");
    expect(s.objects[eq]!.zone).toBe("battlefield");
    expect(s.objects[eq]!.attachedTo).toBe(bears);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("round 338: One Last Job, Auras and Vehicles", () => {
  it("an Aura only onto a creature you control (an opponent's creature isn't offered); with none it stays in the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([oneLastJob(), oneLastJob()]);
    let s = s0;
    putOnBattlefield(s, opp, bear());
    const aura = moveTo(s, ap, holyStrength(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: aura }], [2])), ap);
    expect(s.objects[aura]!.zone).toBe("graveyard");
    // With one creature of yours, it goes there without a question.
    const lion_ = putOnBattlefield(s, ap, lion());
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: aura }], [2])), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[aura]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(lion_);
  });

  it("an Equipment with no creature of yours enters unattached; the second mode returns a Vehicle (rulings)", () => {
    const { s: s0, ap, ids } = setup([oneLastJob()]);
    let s = s0;
    const eq = moveTo(s, ap, bonesplitter(), "graveyard");
    const copter_ = moveTo(s, ap, copter(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: copter_ }, { kind: "object", id: eq }], [1, 2])), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[copter_]!.zone).toBe("battlefield");
    // The Vehicle isn't a creature as the third mode chooses (rulings), so the Equipment has nothing to go on.
    expect(s.objects[eq]!.zone).toBe("battlefield");
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
  });

  it("a bot puts the Equipment on its strongest creature", () => {
    const { s: s0, ap, ids } = setup([oneLastJob()]);
    let s = s0;
    putOnBattlefield(s, ap, vanguard());
    const big = putOnBattlefield(s, ap, whiskervale());
    const eq = moveTo(s, ap, bonesplitter(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: eq }], [2])));
    expect(s.objects[eq]!.attachedTo).toBe(big);
  });
});

describe("round 338: Overencumbered", () => {
  /** Overencumbered cast on `opp`, who has a creature and three Forests; then on to `opp`'s beginning of combat. */
  const enchanted = () => {
    const { s: s0, ap, ids, opp } = setup([overencumbered()]);
    let s = s0;
    const theirs = putOnBattlefield(s, opp, bear());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, forest);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.objects[ids[0]!]!.attachedToPlayer).toBe(opp);
    return { s, ap, opp, theirs, aura: ids[0]! };
  };

  it("enchanted opponent creates a Clue, a Food and a Junk token", () => {
    const { s, ap, opp } = enchanted();
    expect(tokensOf(s, opp)).toEqual(["Clue Token", "Food Token", "Junk Token"]);
    expect(tokensOf(s, ap)).toEqual([]);
  });

  it("on that player's turn: not paying {1} for each artifact means creatures can't attack this combat", () => {
    const { s: s0, opp, theirs } = enchanted();
    let s = passUntil(s0, "beginCombat", opp);
    s = settle(s, opp);
    const p = pend(s, "payUnless");
    expect(p.cost).toBe("{3}");
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }), opp);
    expect(potentialAttackers(s, opp).map((o) => o.id)).not.toContain(theirs);
    // Only this combat: the next turn's combat isn't affected by it.
    expect(s.cantAttackThisTurn?.[0]?.combat).toBe(s.combatsThisTurn ?? 0);
  });

  it("paying lets them attack; a bot pays only with a creature that could attack", () => {
    const { s: s0, opp, theirs } = enchanted();
    let s = passUntil(s0, "beginCombat", opp);
    const forests = s.battlefield.filter((id) => s.objects[id]!.controller === opp && ch(s, id).name === "Forest");
    s = settle(s);
    // Three artifacts (the tokens), so {3}: all three Forests.
    expect(forests.filter((id) => s.objects[id]!.tapped).length).toBe(3);
    expect(s.cantAttackThisTurn ?? []).toEqual([]);
    expect(potentialAttackers(s, opp).map((o) => o.id)).toContain(theirs);
  });

  it("a bot with nothing to attack with doesn't pay", () => {
    const { s: s0, opp, theirs } = enchanted();
    let s = s0;
    s.objects[theirs]!.tapped = true;
    s = passUntil(s, "beginCombat", opp);
    // Untapped in its untap step: tap it again before the trigger resolves.
    s.objects[theirs]!.tapped = true;
    const forests = s.battlefield.filter((id) => s.objects[id]!.controller === opp && ch(s, id).name === "Forest");
    s = settle(s);
    expect(forests.every((id) => !s.objects[id]!.tapped)).toBe(true);
    expect(s.cantAttackThisTurn?.length).toBe(1);
  });
});

describe("round 338: Whiskervale Forerunner", () => {
  /** Whiskervale on `pid`'s battlefield, a Silvercoat Lion on top of their library, Giant Growth in their hand. */
  const ready = (s: GameState, pid: PlayerId) => {
    const w = putOnBattlefield(s, pid, whiskervale());
    const top = moveTo(s, pid, lion(), "hand");
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(top), 1);
    s.objects[top]!.zone = "library";
    s.players[pid]!.library.unshift(top);
    const growth = moveTo(s, pid, giantGrowth(), "hand");
    return { w, top, growth };
  };

  it("on your turn: the revealed creature card onto the battlefield or into your hand, your choice; the rest to the bottom", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const { w, top, growth } = ready(s, ap);
    const lib = s.players[ap]!.library.length;
    const others = s.players[ap]!.library.slice(1, 5);
    s = settle(run(s, planCast(s, ap, growth, [{ kind: "object", id: w }])), ap);
    const p = pend(s, "searchLibrary");
    expect(p.cards).toContain(top);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), ap);
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.players[ap]!.library.length).toBe(lib - 1);
    // The other four went to the bottom.
    expect([...s.players[ap]!.library.slice(-4)].sort()).toEqual([...others].sort());
  });

  it("on another player's turn it goes into your hand, with no choice", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("upkeep");
    const { w, top, growth } = ready(s, ap);
    s = settle(run(s, planCast(s, ap, growth, [{ kind: "object", id: w }])), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[top]!.zone).toBe("hand");
  });

  it("only the first time each turn it becomes the target of your spell", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const { w, growth } = ready(s, ap);
    const second = moveTo(s, ap, giantGrowth(), "hand");
    s = settle(run(s, planCast(s, ap, growth, [{ kind: "object", id: w }])));
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, second, [{ kind: "object", id: w }])), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("round 338: Chancellor of the Annex", () => {
  /** Player 0's deck is all Chancellors and Forests, so the opening hand has Chancellors; the others play forests and bears. */
  const game = () => {
    const others = () => [...Array.from({ length: 50 }, () => forest), ...Array.from({ length: 49 }, () => bear())];
    const mine = [...Array.from({ length: 60 }, () => annex()), ...Array.from({ length: 39 }, () => forest)];
    return createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: i === 0 ? mine : others() })), 7);
  };
  const reveal = (s: GameState, n: number) => {
    const p = pend(s, "searchLibrary");
    expect(p).toMatchObject({ opening: true, reveal: true, player: 0 });
    return act(s, { type: "searchLibrary", player: 0, found: p.cards.slice(0, n) });
  };
  const draw = () => card("Test Draw", "Instant", "{G}", { oracleText: "Draw a card." });
  /** Player `pid` casts a "Draw a card." instant with `lands` untapped Forests of theirs, everyone else passing. */
  const castDraw = (s0: GameState, pid: PlayerId, lands: number) => {
    let s = s0;
    for (const id of s.battlefield) if (s.objects[id]!.controller === pid && ch(s, id).name === "Forest") s.objects[id]!.tapped = true;
    for (let i = 0; i < lands; i++) putOnBattlefield(s, pid, forest);
    const id = moveTo(s, pid, draw(), "hand");
    while (waitingOn(s) !== pid) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, pid, id, [])));
    return { s, id };
  };

  it("revealed: each opponent's first spell of the game is countered unless they pay {1}; their next one isn't", () => {
    let s = reveal(game(), 1);
    expect(s.log.some((l) => /A reveals Chancellor of the Annex from their opening hand/.test(l.text))).toBe(true);
    expect(s.floatingTriggers?.map((f) => f.forPlayer).sort()).toEqual([1, 2, 3]);
    s = passUntil(s, "main1");
    // B, with no mana left for the {1}: countered.
    const first = castDraw(s, 1, 1);
    s = first.s;
    expect(s.objects[first.id]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /Test Draw/.test(l.text) && /counter/i.test(l.text))).toBe(true);
    expect(s.floatingTriggers?.map((f) => f.forPlayer).sort()).toEqual([2, 3]);
    // B's second spell: no trigger, so it resolves (the instant leaves the hand, a card is drawn).
    const hand = s.players[1]!.hand.length;
    const second = castDraw(s, 1, 1);
    s = second.s;
    expect(s.players[1]!.hand.length).toBe(hand + 1);
    // C pays the {1} and draws.
    const handC = s.players[2]!.hand.length;
    const c = castDraw(s, 2, 2);
    s = c.s;
    expect(s.objects[c.id]!.zone).toBe("graveyard");
    expect(s.floatingTriggers?.map((f) => f.forPlayer)).toEqual([3]);
    expect(s.players[2]!.hand.length).toBe(handC + 1);
  });

  it("two revealed: two triggers on that first spell, {1} for each (rulings)", () => {
    let s = reveal(game(), 2);
    expect(s.floatingTriggers).toHaveLength(6);
    s = passUntil(s, "main1");
    const hand = s.players[1]!.hand.length;
    const { s: s1, id } = castDraw(s, 1, 2);
    s = s1;
    // One {1} paid, the second not payable: countered, nothing drawn.
    expect(s.players[1]!.hand.length).toBe(hand);
    // Both Forests were tapped: one for the spell, one for the first {1}.
    expect(s.battlefield.filter((x) => s.objects[x]!.controller === 1 && ch(s, x).name === "Forest").every((x) => s.objects[x]!.tapped)).toBe(true);
    expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.floatingTriggers).toHaveLength(4);
  });

  it("not revealed: nothing", () => {
    let s = reveal(game(), 0);
    expect(s.floatingTriggers ?? []).toHaveLength(0);
  });
});

describe("round 338: Hostile Hostel // Creeping Inn", () => {
  it("a soul counter each time; the third removes them, transforms it and untaps it (CR 701.28a)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const inn = putOnBattlefield(s, ap, hostel());
    const fodder = [bear(), bear(), bear()].map((d) => putOnBattlefield(s, ap, d));
    const index = abilitiesOf(s, s.objects[inn]!).activated.findIndex((a) => a.costs?.some((c) => c.kind === "sacrifice"));
    for (let i = 0; i < 3; i++) {
      s.objects[inn]!.tapped = false;
      s = settle(run(s, planActivate(s, ap, inn, index, undefined, undefined, undefined, undefined, { sacrifice: [fodder[i]!] })), ap);
      expect(s.objects[fodder[i]!]!.zone).toBe("graveyard");
      if (i < 2) {
        expect(s.objects[inn]!.counters.soul).toBe(i + 1);
        expect(s.objects[inn]!.tapped).toBe(true);
        expect(ch(s, inn).types).toEqual(["Land"]);
      }
    }
    expect(s.objects[inn]!.counters.soul ?? 0).toBe(0);
    expect(s.objects[inn]!.face).toBe(1);
    expect(s.objects[inn]!.tapped).toBe(false);
    expect(ch(s, inn).name).toBe("Creeping Inn");
    expect(ch(s, inn).types).toEqual(["Artifact", "Creature"]);
  });

  it("Creeping Inn: each attack exiles a creature card, and X counts every creature card exiled with it", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const inn = putOnBattlefield(s, ap, hostel());
    s.objects[inn]!.face = 1;
    const dead = [bear(), lion()].map((d) => moveTo(s, ap, d, "graveyard"));
    invalidateCharacteristics(s);
    const opps = s.turnOrder.filter((p) => p !== ap);
    const life = (p: PlayerId) => s.players[p]!.life;
    const before = [ap, ...opps].map(life);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: inn, defender: opps[0]! }] });
    s = settle(s, ap);
    expect(pend(s, "chooseMay").prompt).toMatch(/exile a creature card/);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect([...pend(s, "searchLibrary").cards].sort()).toEqual([...dead].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dead[0]!] }), ap);
    expect(s.objects[dead[0]!]!.zone).toBe("exile");
    // One creature card exiled with it: each opponent loses 1 and you gain 1.
    expect([ap, ...opps].map(life)).toEqual([before[0]! + 1, ...before.slice(1).map((l) => l - 1)]);
    // The next attack: the card exiled before counts too (CR 607.2a), X is 2.
    s = passUntil(passUntil(s, "upkeep"), "declareAttackers", ap);
    const mid = [ap, ...opps].map(life);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: inn, defender: opps[0]! }] }), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(pend(s, "searchLibrary").cards).toContain(dead[1]!);
    expect(pend(s, "searchLibrary").cards).not.toContain(dead[0]!);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dead[1]!] }), ap);
    expect([ap, ...opps].map(life)).toEqual([mid[0]! + 2, ...mid.slice(1).map((l) => l - 2)]);
  });
});

describe("round 338: Extraordinary Journey", () => {
  it("a creature cast from exile draws a card, once each turn; one from the hand doesn't", () => {
    const { s: s0, ap, ids } = setup([journey(), lion()]);
    let s = s0;
    const a = putOnBattlefield(s, ap, vanguard());
    const b = putOnBattlefield(s, ap, bear());
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2));
    s = settle(s, ap);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }, { kind: "object", id: b }] }), ap);
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    const lib = () => s.players[ap]!.library.length;
    // From the hand: no card drawn.
    let n = lib();
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(lib()).toBe(n);
    // Cast from exile: a card drawn.
    s = settle(run(s, planCast(s, ap, a)), ap);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(lib()).toBe(n - 1);
    // Only once each turn.
    n = lib();
    s = settle(run(s, planCast(s, ap, b)), ap);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(lib()).toBe(n);
  });

  it("one from the graveyard doesn't count; one put onto the battlefield from exile does", () => {
    const { s: s0, ap, ids } = setup([journey(), oneLastJob(), cloudshift()]);
    let s = s0;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 0)), ap);
    const lib = () => s.players[ap]!.library.length;
    const n = lib();
    const dead = moveTo(s, ap, bear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: dead }], [0])), ap);
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(lib()).toBe(n);
    const v = putOnBattlefield(s, ap, vanguard());
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: v }])), ap);
    expect(s.log.some((l) => /Cloudshift resolves/.test(l.text))).toBe(true);
    expect(lib()).toBe(n - 1);
  });
});
