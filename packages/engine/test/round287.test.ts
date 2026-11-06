// Round 287: from the top of the popularity list. A spell exiled instead of going to the graveyard as it resolves: back
// to your hand at the next end step (Feather, the Redeemed), plotted (Lilah, Undefeated Slickshot), suspended with three
// time counters (Gandalf of the Secret Fire), linked to an artifact that casts one of them at random (River Song's
// Diary), with a dream counter, cast later by an attack trigger (Goliath Daydreamer). Time counters and suspend: a card
// exiled from your hand with its mana value in time counters (The Eleventh Doctor), a spell that exiles itself as you
// cast it (Rory Williams), a dead creature that suspends itself and another creature (Sinister Concierge).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, isFullySupported, isSuspended, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const growth = () => card("Giant Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });
const peek = (name = "Peek") => card(name, "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const charm = () => card("Twin Charm", "Instant", "{U}{R}", { cmc: 2, oracleText: "Draw a card." });

// Real oracle text (Scryfall).
const feather = (): CardDef => ({"oracleId": "aa219936-661b-4ccb-8741-78b70cff2b1a", "name": "Feather, the Redeemed", "manaCost": "{R}{W}{W}", "cmc": 3, "typeLine": "Legendary Creature — Angel", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Angel"], "oracleText": "Flying\nWhenever you cast an instant or sorcery spell that targets a creature you control, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step.", "power": "3", "toughness": "4", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "keywords": ["Flying"], "commanderLegal": "legal", "set": "war", "releasedAt": "2019-05-03", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const lilah = (): CardDef => ({"oracleId": "0757c5a7-e51b-4c39-bb4d-b32657c10cb4", "name": "Lilah, Undefeated Slickshot", "manaCost": "{1}{U}{R}", "cmc": 3, "typeLine": "Legendary Creature — Human Rogue", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Rogue"], "oracleText": "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhenever you cast a multicolored instant or sorcery spell from your hand, exile that spell instead of putting it into your graveyard as it resolves. If you do, it becomes plotted. (You may cast it as a sorcery on a later turn without paying its mana cost.)", "power": "3", "toughness": "3", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "keywords": ["Plot", "Prowess"], "commanderLegal": "legal", "set": "otj", "releasedAt": "2024-04-19", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const gandalf = (): CardDef => ({"oracleId": "cbad35cd-9026-43ea-8333-94f3b34459e3", "name": "Gandalf of the Secret Fire", "manaCost": "{1}{U}{R}{W}", "cmc": 4, "typeLine": "Legendary Creature — Avatar Wizard", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Avatar", "Wizard"], "oracleText": "Whenever you cast an instant or sorcery spell from your hand during an opponent's turn, exile that card with three time counters on it instead of putting it into your graveyard as it resolves. Then if the exiled card doesn't have suspend, it gains suspend. (At the beginning of your upkeep, remove a time counter. When the last is removed, you may play it without paying its mana cost.)", "power": "3", "toughness": "4", "colors": ["R", "U", "W"], "colorIdentity": ["R", "U", "W"], "keywords": [], "commanderLegal": "legal", "set": "ltc", "releasedAt": "2023-11-03", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const diary = (): CardDef => ({"oracleId": "60a63eb4-b0f7-4930-9bf6-afd42261d4d0", "name": "River Song's Diary", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact — Book", "supertypes": [], "types": ["Artifact"], "subtypes": ["Book"], "oracleText": "Imprint — Whenever a player casts an instant or sorcery spell from their hand, exile it instead of putting it into a graveyard as it resolves.\nAt the beginning of your upkeep, if there are four or more cards exiled with this artifact, choose one of them at random. You may cast it without paying its mana cost.", "colors": [], "colorIdentity": [], "keywords": ["Imprint"], "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const goliath = (): CardDef => ({"oracleId": "9207facd-fbf9-4faa-ac44-6c0bcac81551", "name": "Goliath Daydreamer", "manaCost": "{2}{R}{R}", "cmc": 4, "typeLine": "Creature — Giant Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant", "Wizard"], "oracleText": "Whenever you cast an instant or sorcery spell from your hand, exile that card with a dream counter on it instead of putting it into your graveyard as it resolves.\nWhenever this creature attacks, you may cast a spell from among cards you own in exile with dream counters on them without paying its mana cost.", "power": "4", "toughness": "4", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "commanderLegal": "legal", "set": "ecl", "releasedAt": "2026-01-23", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const eleventh = (): CardDef => ({"oracleId": "721e8249-ff1b-4c15-964b-4ba2a96beb75", "name": "The Eleventh Doctor", "manaCost": "{1}{W}{U}", "cmc": 3, "typeLine": "Legendary Creature — Time Lord Doctor", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Time Lord", "Doctor"], "oracleText": "I. AM. TALKING! — Whenever The Eleventh Doctor deals combat damage to a player, you may exile a card from your hand with a number of time counters on it equal to its mana value. If it doesn't have suspend, it gains suspend.\n{2}: Target creature with power 3 or less can't be blocked this turn.", "power": "3", "toughness": "2", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["I. AM. TALKING!"], "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const rory = (): CardDef => ({"oracleId": "16a44586-ea1d-45f1-b9de-da1c11f729df", "name": "Rory Williams", "manaCost": "{W}{U}", "cmc": 2, "typeLine": "Legendary Creature — Human Soldier", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Soldier"], "oracleText": "Partner with Amy Pond\nFirst strike, lifelink\nThe Last Centurion — When you cast this spell from anywhere other than exile, exile it with three time counters on it. It gains suspend. Then investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")", "power": "3", "toughness": "3", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Lifelink", "Investigate", "The Last Centurion", "Partner with", "First strike", "Partner"], "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const concierge = (): CardDef => ({"oracleId": "9b14c20f-c4ee-42ea-99cd-099b4eb25883", "name": "Sinister Concierge", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Creature — Human Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Wizard"], "oracleText": "When this creature dies, you may exile it and put three time counters on it. If you do, exile up to one target creature and put three time counters on it. Each card exiled this way that doesn't have suspend gains suspend. (For each card with suspend, its owner removes a time counter from it at the beginning of their upkeep. When the last is removed, they may cast it without paying its mana cost. Those creature spells have haste.)", "power": "2", "toughness": "1", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "commanderLegal": "legal", "set": "ncc", "releasedAt": "2022-04-29", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;

describe("round 287", () => {
  it("every card of the round compiles fully", () => {
    supported(feather(), lilah(), gandalf(), diary(), goliath(), eleventh(), rory(), concierge(), wedding(), rod(), soulfire(), hellcarver(), beauty());
  });
});

/** Pass priority until `pid` has it (an instant on another player's turn). */
function priorityTo(s: GameState, pid: PlayerId) {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
}

describe("Feather, the Redeemed", () => {
  it("an instant that targets a creature you control is exiled as it resolves and returns to your hand at the next end step", () => {
    const { s: s0, ap, ids } = setup([growth()]);
    putOnBattlefield(s0, ap, feather());
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.players[ap]!.graveyard).not.toContain(ids[0]);
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("the replacement holds with Feather gone, but not for a spell that targets another player's creature or never resolves (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([growth(), growth(), growth()]);
    const f = putOnBattlefield(s0, ap, feather());
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    // Feather leaves after its trigger resolved, before the spell resolves: still exiled.
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)]));
    for (let i = 0; i < 8 && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    moveObject(s, f, "graveyard");
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("exile");
    // A target that's another player's creature: no trigger, to the graveyard.
    const { s: t0, ap: tp, ids: tids, opp: topp } = setup([growth(), growth()]);
    putOnBattlefield(t0, tp, feather());
    const tb = putOnBattlefield(t0, tp, bear());
    const ob = putOnBattlefield(t0, topp, bear());
    let t = settle(run(t0, planCast(t0, tp, tids[0]!, [tgt(ob)])));
    expect(zone(t, tids[0]!)).toBe("graveyard");
    // Its only target gone as it would resolve: it doesn't resolve, so it goes to the graveyard (CR 608.2b).
    t = run(t, planCast(t, tp, tids[1]!, [tgt(tb)]));
    for (let i = 0; i < 8 && t.stack.length > 1; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    moveObject(t, tb, "graveyard");
    t = settle(t);
    expect(zone(t, tids[1]!)).toBe("graveyard");
    void theirs;
  });
});

describe("Lilah, Undefeated Slickshot", () => {
  it("a multicolored instant cast from your hand is exiled as it resolves and becomes plotted; a mono-colored one isn't", () => {
    const { s: s0, ap, ids } = setup([charm(), peek()]);
    putOnBattlefield(s0, ap, lilah());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[ids[0]!]!.mayPlay).toMatchObject({ player: ap, until: "plot" });
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    // Plotted: castable without paying its mana cost on a later turn, not this one (CR 702.170d).
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 4) % 4]!);
    s = passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "main1", ap);
    for (const c of ["W", "U", "B", "R", "G", "C"] as const) s.players[ap]!.manaPool[c] = 0;
    const plan = planCast(s, ap, ids[0]!);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    // Cast from exile, not from the hand: no new trigger, so it goes to the graveyard.
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Gandalf of the Secret Fire", () => {
  it("an instant cast from your hand during an opponent's turn is exiled with three time counters and gains suspend; on your turn it isn't", () => {
    const { s: s0, ap, ids, opp } = setup([peek(), peek("Glance")]);
    putOnBattlefield(s0, ap, gandalf());
    let s = settle(run(s0, planCast(s0, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    s = priorityTo(passUntil(s, "upkeep", opp), ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("exile");
    expect(o.counters.time).toBe(3);
    expect(isSuspended(s, o)).toBe(true);
  });
});

const trinket = (name: string) => card(name, "Instant", "{1}", { cmc: 1, oracleText: "Draw a card." });
const murder = () => card("Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });

/** Pass priority (no blocks) until a question comes up that isn't about combat. */
function toQuestion(s: GameState, max = 200) {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("no question");
}

describe("River Song's Diary", () => {
  it("every player's instant cast from their hand is exiled with it; at your upkeep with four or more, one at random may be cast free", () => {
    const { s: s0, ap, ids, opp } = setup([trinket("Bauble A"), trinket("Bauble B"), trinket("Bauble C")]);
    const d = putOnBattlefield(s0, ap, diary());
    let s = s0;
    for (const id of ids) s = settle(run(s, planCast(s, ap, id)));
    for (const id of ids) expect(zone(s, id)).toBe("exile");
    // An opponent's, cast from their hand on your turn: exiled with it too ("a graveyard").
    const theirs = toHand(s, opp, trinket("Bauble D"));
    s = priorityTo(s, opp);
    s.players[opp]!.manaPool.C = 1;
    s = settle(run(s, planCast(s, opp, theirs)));
    expect(zone(s, theirs)).toBe("exile");
    expect(s.linkedExile?.[`${d}@0`]?.map((l) => l.id).sort()).toEqual([...ids, theirs].sort());
    // Your next upkeep: one of them at random, cast without paying its mana cost (as the trigger resolves, rulings).
    s = passUntil(passUntil(s, "upkeep", opp), "upkeep", ap);
    s = toQuestion(s);
    // Only the one chosen at random is offered.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    const opts = (s.pending as { options: string[] }).options.filter((x) => x !== "none");
    expect(opts.length).toBe(1);
    const picked = opts[0]!;
    expect([...ids, theirs]).toContain(picked);
    s = act(s, { type: "chooseOption", player: ap, choice: picked });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: picked });
    s = settle(run(s, planCast(s, ap, picked)));
    // Cast from exile, so not exiled again: its owner's graveyard.
    expect(zone(s, picked)).toBe("graveyard");
    expect(s.players[s.objects[picked]!.owner]!.graveyard).toContain(picked);
  });

  it("with three cards exiled with it, nothing happens at your upkeep (an intervening if, CR 603.4)", () => {
    const { s: s0, ap, ids, opp } = setup([trinket("Bauble A"), trinket("Bauble B"), trinket("Bauble C")]);
    putOnBattlefield(s0, ap, diary());
    let s = s0;
    for (const id of ids) s = settle(run(s, planCast(s, ap, id)));
    s = passUntil(passUntil(s, "upkeep", opp), "upkeep", ap);
    s = settle(s);
    expect(s.pending).toBeNull();
    for (const id of ids) expect(zone(s, id)).toBe("exile");
  });
});

describe("Goliath Daydreamer", () => {
  it("an instant from your hand is exiled with a dream counter; when it attacks, you may cast a card you own in exile with one, free", () => {
    const { s: s0, ap, ids, opp } = setup([peek()]);
    const g = putOnBattlefield(s0, ap, goliath());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[ids[0]!]!.counters.dream).toBe(1);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    s = toQuestion(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    expect((s.pending as { options: string[] }).options).toContain(ids[0]);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0] });
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("The Eleventh Doctor", () => {
  it("combat damage to a player: you may exile a card from your hand with time counters equal to its mana value, and it gains suspend", () => {
    const big = card("Tall Golem", "Artifact Creature — Golem", "{4}", { cmc: 4, power: "4", toughness: "4" });
    const { s: s0, ap, ids, opp } = setup([big, peek()]);
    const doc = putOnBattlefield(s0, ap, eleventh());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: doc, defender: opp }] });
    s = toQuestion(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, exile: true });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[0]!] }));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("exile");
    expect(o.counters.time).toBe(4);
    expect(isSuspended(s, o)).toBe(true);
    expect(zone(s, ids[1]!)).toBe("hand");
  });
});

describe("Rory Williams", () => {
  it("cast from your hand, it's exiled with three time counters and suspended, then you investigate; cast from exile, it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([rory()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("exile");
    expect(o.counters.time).toBe(3);
    expect(isSuspended(s, o)).toBe(true);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Clue Token" || s.objects[id]!.isToken)).toBe(true);
    // The last time counter removed: cast from exile, so no trigger this time.
    s.objects[ids[0]!]!.counters.time = 1;
    s = toQuestion(passUntil(passUntil(s, "upkeep", opp), "upkeep", ap));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0], how: "suspend" });
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });
});

describe("Sinister Concierge", () => {
  it("when it dies you may exile it with three time counters; if you do, up to one target creature is exiled the same way; both gain suspend", () => {
    const { s: s0, ap, ids, opp } = setup([murder()]);
    const c = putOnBattlefield(s0, ap, concierge());
    const b = putOnBattlefield(s0, opp, bear());
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)])));
    if (s.pending?.kind === "chooseTargets") s = toQuestion(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    for (const id of [c, b]) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.counters.time).toBe(3);
      expect(isSuspended(s, s.objects[id]!)).toBe(true);
    }
    // Its owner's upkeep removes the bear's counters (CR 702.62a).
    s = passUntil(s, "draw", opp);
    expect(s.objects[b]!.counters.time).toBe(2);
  });

  it("if it isn't exiled (it left the graveyard), the target stays", () => {
    const { s: s0, ap, ids, opp } = setup([murder()]);
    const c = putOnBattlefield(s0, ap, concierge());
    const b = putOnBattlefield(s0, opp, bear());
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)])));
    if (s.pending?.kind === "chooseTargets") s = toQuestion(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    moveObject(s, c, "hand");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, b)).toBe("battlefield");
  });
});
const wedding = (): CardDef => ({"oracleId": "1ff91cc1-2233-4ceb-91ba-6a49c7147f32", "name": "The Wedding of River Song", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards, then you may exile a nonland card from your hand with a number of time counters on it equal to its mana value. Then target opponent does the same. Cards exiled this way that don't have suspend gain suspend.\nTime travel. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter.)", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Time Travel"], "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const rod = (): CardDef => ({"oracleId": "d32345c1-ed20-4bfc-a5fa-6ac7b99542ec", "name": "Rod of Absorption", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "Whenever a player casts an instant or sorcery spell, exile it instead of putting it into a graveyard as it resolves.\n{X}, {T}, Sacrifice this artifact: You may cast any number of spells from among cards exiled with this artifact with total mana value X or less without paying their mana costs.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "commanderLegal": "legal", "set": "afc", "releasedAt": "2021-07-23", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const soulfire = (): CardDef => ({"oracleId": "e65769f4-50ae-482b-933b-ac5cf3843f2a", "name": "Soulfire Grand Master", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Creature — Human Monk", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Monk"], "oracleText": "Lifelink\nInstant and sorcery spells you control have lifelink.\n{2}{U/R}{U/R}: The next time you cast an instant or sorcery spell from your hand this turn, put that card into your hand instead of into your graveyard as it resolves.", "power": "2", "toughness": "2", "colors": ["W"], "colorIdentity": ["R", "U", "W"], "keywords": ["Lifelink"], "commanderLegal": "legal", "set": "frf", "releasedAt": "2015-01-23", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const hellcarver = (): CardDef => ({"oracleId": "90514aa5-84b6-4be7-b6d0-b05529c97140", "name": "Hellcarver Demon", "manaCost": "{3}{B}{B}{B}", "cmc": 6, "typeLine": "Creature — Demon", "supertypes": [], "types": ["Creature"], "subtypes": ["Demon"], "oracleText": "Flying\nWhenever this creature deals combat damage to a player, sacrifice all other permanents you control and discard your hand. Exile the top six cards of your library. You may cast any number of spells from among cards exiled this way without paying their mana costs.", "power": "6", "toughness": "6", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Flying"], "commanderLegal": "legal", "set": "roe", "releasedAt": "2010-04-23", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;

describe("The Wedding of River Song", () => {
  it("you, then the target opponent, may exile a nonland card from hand with its mana value in time counters; then you time travel", () => {
    const golem = card("Tall Golem", "Artifact Creature — Golem", "{4}", { cmc: 4, power: "4", toughness: "4" });
    const { s: s0, ap, ids, opp } = setup([wedding(), golem]);
    const theirs = toHand(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" }));
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, exile: true });
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: opp, objectIds: [theirs] });
    for (const id of [ids[1]!, theirs]) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.counters.time).toBe(4);
      expect(isSuspended(s, s.objects[id]!)).toBe(true);
    }
    // Time travel: your suspended card only (CR 701.56a), one counter removed.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "timeTravel", about: ids[1] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "remove" }));
    expect(s.objects[ids[1]!]!.counters.time).toBe(3);
    expect(s.objects[theirs]!.counters.time).toBe(4);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Rod of Absorption", () => {
  it("every player's instants are exiled with it as they resolve; sacrificed for {X}, you cast any of them with total mana value X or less", () => {
    const two = card("Twin Bauble", "Instant", "{2}", { cmc: 2, oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([trinket("Bauble A"), two, trinket("Bauble C")]);
    const r = putOnBattlefield(s0, ap, rod());
    let s = s0;
    for (const id of ids) s = settle(run(s, planCast(s, ap, id)));
    for (const id of ids) expect(zone(s, id)).toBe("exile");
    // X = 3: the 2 and one of the 1s, not all three (total 4).
    s = toQuestion(run(s, planActivate(s, ap, r, 0, [], undefined, undefined, 3)));
    expect(zone(s, r)).toBe("graveyard");
    const cast: string[] = [];
    for (let i = 0; i < 6 && s.pending?.kind === "chooseOption"; i++) {
      const opts = (s.pending as { options: string[] }).options.filter((x) => x !== "none" && !cast.includes(x));
      const pick = opts.includes(ids[1]!) ? ids[1]! : opts[0];
      if (!pick) break;
      cast.push(pick);
      s = act(s, { type: "chooseOption", player: ap, choice: pick });
      expect(s.pending).toMatchObject({ kind: "castFree", objectId: pick });
      s = run(s, planCast(s, ap, pick));
    }
    expect(cast.length).toBe(2);
    s = settle(s);
    expect(ids.filter((id) => zone(s, id) === "exile").length).toBe(1);
  });
});

describe("Soulfire Grand Master", () => {
  it("the next instant or sorcery you cast from your hand this turn returns to your hand as it resolves; only that one", () => {
    const { s: s0, ap, ids } = setup([peek(), peek("Glance")]);
    const g = putOnBattlefield(s0, ap, soulfire());
    let s = settle(run(s0, planActivate(s0, ap, g, 0)));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("hand");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("used up by the next one even if it doesn't resolve (rulings)", () => {
    const { s: s0, ap, ids } = setup([growth(), peek()]);
    const g = putOnBattlefield(s0, ap, soulfire());
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, g, 0)));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    moveObject(s, b, "graveyard");
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });
});

describe("Hellcarver Demon", () => {
  it("combat damage to a player: sacrifice all your other permanents, discard your hand, exile six and cast any of them free", () => {
    const { s: s0, ap, ids, opp } = setup([peek()]);
    const h = putOnBattlefield(s0, ap, hellcarver());
    const lib = s0.players[ap]!.library;
    const top = [trinket("Bauble A"), trinket("Bauble B")].map((d) => {
      const id = toHand(s0, ap, d);
      s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x !== id);
      s0.objects[id]!.zone = "library";
      lib.unshift(id);
      return id;
    });
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = toQuestion(s);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap)).toEqual([h]);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    for (const id of top) expect(zone(s, id)).toBe("exile");
    expect(s.players[ap]!.exile.length).toBeGreaterThanOrEqual(6);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    // Lands among them can't be cast (they stay exiled, rulings); both instants can.
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toEqual(expect.arrayContaining(top));
  });
});
const beauty = (): CardDef => ({"oracleId": "724d933c-6e5f-458c-9b39-83b4662693ea", "name": "Ecstatic Beauty", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Exile the top three cards of your library. You may play those cards until end of turn. Put four time counters on each of those cards that has suspend.\nSuspend 4—{R}", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Suspend"], "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;

describe("Ecstatic Beauty", () => {
  it("exiles the top three to play this turn; each of them with suspend gets four time counters, so it's suspended", () => {
    const bolt = card("Slow Bolt", "Sorcery", "{3}{R}", { cmc: 4, keywords: ["Suspend"], oracleText: "Slow Bolt deals 3 damage to any target.\nSuspend 1—{R} (Rather than cast this card from your hand, you may pay {R} and exile it with a time counter on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
    const { s: s0, ap, ids } = setup([beauty()]);
    const lib = s0.players[ap]!.library;
    const tops = [bolt, bear(), card("Stone Golem", "Artifact Creature — Golem", "{2}", { cmc: 2, power: "2", toughness: "2" })].map((d) => {
      const id = toHand(s0, ap, d);
      s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x !== id);
      s0.objects[id]!.zone = "library";
      return id;
    });
    lib.unshift(...tops);
    expect(isFullySupported(bolt)).toBe(true);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of tops) expect(zone(s, id)).toBe("exile");
    expect(s.objects[tops[0]!]!.counters.time).toBe(4);
    expect(isSuspended(s, s.objects[tops[0]!]!)).toBe(true);
    expect(s.objects[tops[1]!]!.counters.time ?? 0).toBe(0);
    expect(isSuspended(s, s.objects[tops[1]!]!)).toBe(false);
    // The others may be played this turn.
    expect(planCast(s, ap, tops[2]!)).not.toBeNull();
  });
});
