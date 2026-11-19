// Round 416 (Lane A): Vault 11: Voter's Dilemma ("Each player secretly votes for up to one creature, then those votes
// are revealed. If no creature got votes, each player draws a card. Otherwise, destroy each creature with the most votes
// or tied for most votes.", CR 701.38), Blim, Comedic Genius ("that player gains control of target permanent you control.
// Then each player loses life and discards cards equal to the number of permanents they control but don't own.", CR
// 108.3), and counters put at the same time as one event, CR 122.6: Invisible Woman, Sue Storm ("Whenever you put one or
// more +1/+1 counters on one or more other Heroes you control") and Aragorn, Company Leader ("Whenever you put one or more
// counters on Aragorn, put one of each of those kinds of counters on up to one other target creature.").

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { controllerOf, invalidateCharacteristics } from "../src/layers";
import { putCounters, withPutter } from "../src/counters";
import { applyAction, botActions, isFullySupported, planCast, ringBearer, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const amateur = (): CardDef => ({"oracleId": "fc8ee6e1-a2e1-4033-a164-7968fc79dd27", "name": "Amateur Hero", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Creature — Human Hero", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Hero"], "oracleText": "When this creature enters, you gain 2 life.", "power": "3", "toughness": "3", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/3/8/38d3b35d-3ae7-4f41-879f-e05146112b24.jpg?1783905375", "artUrl": "https://cards.scryfall.io/art_crop/front/3/8/38d3b35d-3ae7-4f41-879f-e05146112b24.jpg?1783905375", "commanderLegal": "legal", "set": "spe", "releasedAt": "2025-09-26", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const aragorn = (): CardDef => ({"oracleId": "1b841e8f-9484-4737-bd37-dfa11bd06883", "name": "Aragorn, Company Leader", "manaCost": "{1}{G}{W}", "cmc": 3, "typeLine": "Legendary Creature — Human Ranger", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Ranger"], "oracleText": "Whenever the Ring tempts you, if you chose a creature other than Aragorn as your Ring-bearer, put your choice of a counter from among first strike, vigilance, deathtouch, and lifelink on Aragorn.\nWhenever you put one or more counters on Aragorn, put one of each of those kinds of counters on up to one other target creature.", "power": "3", "toughness": "3", "colors": ["G", "W"], "colorIdentity": ["G", "W"], "keywords": ["Vigilance", "Deathtouch"], "imageUrl": "https://cards.scryfall.io/normal/front/7/3/73ca5f48-0117-49d6-8b00-b8482e3545b3.jpg?1783916260", "artUrl": "https://cards.scryfall.io/art_crop/front/7/3/73ca5f48-0117-49d6-8b00-b8482e3545b3.jpg?1783916260", "commanderLegal": "legal", "set": "ltr", "releasedAt": "2023-06-23", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const battlegrowth = (): CardDef => ({"oracleId": "650bf82e-7f83-470c-bf4a-34281bfe9341", "name": "Battlegrowth", "manaCost": "{G}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Put a +1/+1 counter on target creature.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/b/2b34e76b-86b3-464e-93e7-c3f2074028fb.jpg?1783944536", "artUrl": "https://cards.scryfall.io/art_crop/front/2/b/2b34e76b-86b3-464e-93e7-c3f2074028fb.jpg?1783944536", "commanderLegal": "legal", "set": "mrd", "releasedAt": "2003-10-02", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const blim = (): CardDef => ({"oracleId": "c7cf9574-e2cf-4137-a224-73f76c5d11d7", "name": "Blim, Comedic Genius", "manaCost": "{2}{B}{R}", "cmc": 4, "typeLine": "Legendary Creature — Imp", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Imp"], "oracleText": "Flying\nWhenever Blim deals combat damage to a player, that player gains control of target permanent you control. Then each player loses life and discards cards equal to the number of permanents they control but don't own.", "power": "4", "toughness": "3", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/3/d/3d8cd7dc-028a-4da2-b2a1-435d40cf48ca.jpg?1783928776", "artUrl": "https://cards.scryfall.io/art_crop/front/3/d/3d8cd7dc-028a-4da2-b2a1-435d40cf48ca.jpg?1783928776", "commanderLegal": "legal", "set": "cmr", "releasedAt": "2020-11-20", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const brago = (): CardDef => ({"oracleId": "8877b896-8458-4828-9ff6-9e0ecc180cf7", "name": "Brago's Representative", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Creature — Human Advisor", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Advisor"], "oracleText": "While voting, you get an additional vote. (The votes can be for different choices or for the same choice.)", "power": "1", "toughness": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/b/f/bfa2b59c-eaeb-4946-80e0-f937a206aa0c.jpg?1783939378", "artUrl": "https://cards.scryfall.io/art_crop/front/b/f/bfa2b59c-eaeb-4946-80e0-f937a206aa0c.jpg?1783939378", "commanderLegal": "legal", "set": "cns", "releasedAt": "2014-06-06", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const hawkeye = (): CardDef => ({"oracleId": "c9efec35-823f-4c78-be36-d1a57d8b6f44", "name": "Hawkeye, Clint Barton", "manaCost": "{3}{W}", "cmc": 4, "typeLine": "Legendary Creature — Human Archer Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Archer", "Hero"], "oracleText": "Vigilance (Attacking doesn't cause this creature to tap.)", "power": "3", "toughness": "5", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Vigilance"], "imageUrl": "https://cards.scryfall.io/normal/front/1/6/162754cc-cf00-4de5-ad88-845ed1ddea40.jpg?1783902996", "artUrl": "https://cards.scryfall.io/art_crop/front/1/6/162754cc-cf00-4de5-ad88-845ed1ddea40.jpg?1783902996", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const roar = (): CardDef => ({"oracleId": "96cf2810-35b8-437e-b609-f9765604b8cf", "name": "Inspiring Roar", "manaCost": "{3}{W}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Put a +1/+1 counter on each creature you control.", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/e/4ef9708e-bfe4-4d24-8304-1618daa1c3ee.jpg?1783936715", "artUrl": "https://cards.scryfall.io/art_crop/front/4/e/4ef9708e-bfe4-4d24-8304-1618daa1c3ee.jpg?1783936715", "commanderLegal": "legal", "set": "aer", "releasedAt": "2017-01-20", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const sue = (): CardDef => ({"oracleId": "e9d20b6d-fa4f-473b-9866-230fd92a1319", "name": "Invisible Woman, Sue Storm", "manaCost": "{4}{W}", "cmc": 5, "typeLine": "Legendary Creature — Human Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Hero"], "oracleText": "Lifelink\nWhenever you put one or more +1/+1 counters on one or more other Heroes you control, you may create a 0/4 colorless Wall creature token with defender.", "power": "2", "toughness": "5", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Lifelink"], "imageUrl": "https://cards.scryfall.io/normal/front/2/f/2f80394b-2f7e-40a7-8203-720bcf39d71b.jpg?1783902974", "artUrl": "https://cards.scryfall.io/art_crop/front/2/f/2f80394b-2f7e-40a7-8203-720bcf39d71b.jpg?1783902974", "commanderLegal": "legal", "set": "msh", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const angel = (): CardDef => ({"oracleId": "4b7ac066-e5c7-43e6-9e7e-2739b24a905d", "name": "Serra Angel", "manaCost": "{3}{W}{W}", "cmc": 5, "typeLine": "Creature — Angel", "supertypes": [], "types": ["Creature"], "subtypes": ["Angel"], "oracleText": "Flying\nVigilance (Attacking doesn't cause this creature to tap.)", "power": "4", "toughness": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Flying", "Vigilance"], "imageUrl": "https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759", "artUrl": "https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759", "commanderLegal": "legal", "set": "sld", "releasedAt": "2023-10-02", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const progress = (): CardDef => ({"oracleId": "d2145ad3-fe7e-459b-b155-1b3ed089e936", "name": "Steady Progress", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Proliferate"], "imageUrl": "https://cards.scryfall.io/normal/front/6/f/6fe212ed-31cb-4f10-8ba7-e97af1d30d24.jpg?1783941737", "artUrl": "https://cards.scryfall.io/art_crop/front/6/f/6fe212ed-31cb-4f10-8ba7-e97af1d30d24.jpg?1783941737", "commanderLegal": "legal", "set": "som", "releasedAt": "2010-10-01", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const travel = (): CardDef => ({"oracleId": "8432729e-5fd4-4661-8b79-e41b1d03eb7b", "name": "Travel Preparations", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Put a +1/+1 counter on each of up to two target creatures.\nFlashback {1}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", "colors": ["G"], "colorIdentity": ["G", "W"], "keywords": ["Flashback"], "imageUrl": "https://cards.scryfall.io/normal/front/e/9/e9654ae7-af2c-4956-be3a-68befa33f523.jpg?1783940907", "artUrl": "https://cards.scryfall.io/art_crop/front/e/9/e9654ae7-af2c-4956-be3a-68befa33f523.jpg?1783940907", "commanderLegal": "legal", "set": "isd", "releasedAt": "2011-09-30", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const vault = (): CardDef => ({"oracleId": "e2c00aff-696c-4b20-acd4-95b71b5f8b10", "name": "Vault 11: Voter's Dilemma", "manaCost": "{2}{W}{B}", "cmc": 4, "typeLine": "Enchantment — Saga", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — For each opponent, you create a 1/1 white Human Soldier creature token.\nII, III — Each player secretly votes for up to one creature, then those votes are revealed. If no creature got votes, each player draws a card. Otherwise, destroy each creature with the most votes or tied for most votes.", "colors": ["B", "W"], "colorIdentity": ["B", "W"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/b/4bafcd4e-5693-4c23-be79-75653fcd214c.jpg?1783912383", "artUrl": "https://cards.scryfall.io/art_crop/front/4/b/4bafcd4e-5693-4c23-be79-75653fcd214c.jpg?1783912383", "commanderLegal": "legal", "set": "pip", "releasedAt": "2024-03-08", "rarity": "rare", "layout": "saga", "gameChanger": false} as CardDef);
// Real oracle text (Scryfall), as in ring.test.ts.
const birthdayEscape = card("Birthday Escape", "Sorcery", "{U}", { oracleText: "Draw a card. The Ring tempts you." });

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets, undefined, "auto")));
const log = (s: GameState) => s.log.map((e) => e.text).join("\n");
const order = (s: GameState, ap: PlayerId) => s.turnOrder.slice(s.turnOrder.indexOf(ap)).concat(s.turnOrder.slice(0, s.turnOrder.indexOf(ap))) as [PlayerId, PlayerId, PlayerId, PlayerId];
const optionOf = (s: GameState, id: ObjectId) => `${id}@${s.objects[id]!.zoneChanges ?? 0}`;
/** Answers the vote that's asked now with `choice` (an object id, or "none"). */
const vote = (s: GameState, voter: PlayerId, choice: ObjectId | "none") => {
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: voter });
  return act(s, { type: "chooseOption", player: voter, choice: choice === "none" ? "none" : optionOf(s, choice) });
};
/** Puts a lore counter on the Saga (as after your draw step) and lets its chapter ability trigger. */
const lore = (s: GameState, id: ObjectId) => {
  putCounters(s, s.objects[id]!, "lore", 1);
  invalidateCharacteristics(s);
  return settle(s);
};
const hands = (s: GameState) => s.players.map((p) => p.hand.length);
const plus = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;

describe("round 416: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [vault(), blim(), sue(), aragorn(), roar(), battlegrowth(), progress(), travel(), amateur(), hawkeye(), birthdayEscape]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 416: Vault 11: Voter's Dilemma", () => {
  /** Vault 11 on the active player's battlefield with one lore counter; the next player has a Serra Angel, the one after a Grizzly Bears. */
  function vaultGame() {
    const { s, ap } = setup([]);
    const [a, b, c, d] = order(s, ap);
    const v = putOnBattlefield(s, a, vault());
    s.objects[v]!.counters.lore = 1;
    const angelId = putOnBattlefield(s, b, angel());
    const bearId = putOnBattlefield(s, c, bears());
    invalidateCharacteristics(s);
    return { s, a, b, c, d, v, angelId, bearId };
  }

  it("chapter I: for each opponent, you create a 1/1 white Human Soldier creature token", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vault());
    const s = lore(s0, v);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap);
    expect(tokens.length).toBe(3);
  });

  it("chapter II: each player votes in turn order starting with you; the creature with the most votes is destroyed", () => {
    const g = vaultGame();
    let s = lore(g.s, g.v);
    s = vote(s, g.a, g.angelId);
    // A secret vote: the next voter sees only their own votes, not A's (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: g.b });
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.prompt).not.toContain("Serra Angel");
    // Each vote may be for no creature.
    expect(p.options).toContain("none");
    expect(log(s)).not.toMatch(/votes for Serra Angel/);
    s = vote(s, g.b, g.bearId);
    s = vote(s, g.c, g.angelId);
    s = vote(s, g.d, "none");
    s = settle(s);
    expect(log(s)).toMatch(/The votes are revealed/);
    expect(s.objects[g.angelId]!.zone).toBe("graveyard");
    expect(s.objects[g.bearId]!.zone).toBe("battlefield");
  });

  it("chapter II: creatures tied for the most votes are all destroyed, and nobody draws", () => {
    const g = vaultGame();
    let s = lore(g.s, g.v);
    const before = hands(s);
    s = vote(s, g.a, g.angelId);
    s = vote(s, g.b, g.bearId);
    s = vote(s, g.c, "none");
    s = vote(s, g.d, "none");
    s = settle(s);
    expect(s.objects[g.angelId]!.zone).toBe("graveyard");
    expect(s.objects[g.bearId]!.zone).toBe("graveyard");
    expect(hands(s)).toEqual(before);
  });

  it("chapter III: if no creature got votes, each player draws a card and nothing is destroyed", () => {
    const g = vaultGame();
    g.s.objects[g.v]!.counters.lore = 2;
    let s = lore(g.s, g.v);
    const before = hands(s);
    for (const pid of [g.a, g.b, g.c, g.d]) s = vote(s, pid, "none");
    s = settle(s);
    expect(hands(s)).toEqual(before.map((n) => n + 1));
    expect(s.objects[g.angelId]!.zone).toBe("battlefield");
    expect(s.objects[g.bearId]!.zone).toBe("battlefield");
    // Its final chapter: the Saga is sacrificed (CR 714.4).
    expect(s.objects[g.v]!.zone).toBe("graveyard");
  });

  it("with no creature on the battlefield, nobody votes and each player draws a card", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vault());
    s0.objects[v]!.counters.lore = 1;
    const before = hands(s0);
    const s = lore(s0, v);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(hands(s)).toEqual(before.map((n) => n + 1));
  });

  it("an extra vote (Brago's Representative) may be for nothing too", () => {
    const g = vaultGame();
    putOnBattlefield(g.s, g.a, brago());
    invalidateCharacteristics(g.s);
    let s = lore(g.s, g.v);
    s = vote(s, g.a, "none");
    // A's second vote.
    s = vote(s, g.a, g.bearId);
    s = vote(s, g.b, "none");
    s = vote(s, g.c, "none");
    s = vote(s, g.d, "none");
    s = settle(s);
    expect(s.objects[g.bearId]!.zone).toBe("graveyard");
    expect(s.objects[g.angelId]!.zone).toBe("battlefield");
  });

  it("bots vote for an opponent's creature, never their own (they vote for nothing instead)", () => {
    const g = vaultGame();
    let s = lore(g.s, g.v);
    s = vote(s, g.a, "none");
    // B's only creature is the Serra Angel, and the Grizzly Bears is C's: B votes for the Bears.
    const b = botActions(s, g.b)[0]!;
    expect(b).toMatchObject({ type: "chooseOption", choice: optionOf(s, g.bearId) });
    s = act(s, b);
    s = vote(s, g.c, g.bearId);
    // D, with no creature of its own and both others' up: it votes for one of them, not nothing.
    const d = botActions(s, g.d)[0]!;
    expect(d.type === "chooseOption" && d.choice).not.toBe("none");
  });

  it("a bot whose own creature is the only one votes for nothing", () => {
    const { s: s0, ap } = setup([]);
    const [a, b] = order(s0, ap);
    const v = putOnBattlefield(s0, a, vault());
    s0.objects[v]!.counters.lore = 1;
    const angelId = putOnBattlefield(s0, b, angel());
    invalidateCharacteristics(s0);
    let s = lore(s0, v);
    s = vote(s, a, "none");
    expect(botActions(s, b)[0]).toMatchObject({ type: "chooseOption", choice: "none" });
    expect(s.objects[angelId]!.zone).toBe("battlefield");
  });
});

describe("round 416: Blim, Comedic Genius", () => {
  /** Blim attacking the next player, its controller with a Grizzly Bears too; returns the state after combat damage, with the trigger's target asked. */
  function blimGame() {
    const { s: s0, ap } = setup([]);
    const [a, b, c] = order(s0, ap);
    const blimId = putOnBattlefield(s0, a, blim());
    const bearId = putOnBattlefield(s0, a, bears());
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", a);
    s = act(s, { type: "declareAttackers", player: a, attacks: [{ attacker: blimId, defender: b }] });
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseTargets"); i++) s = s.pending ? act(s, botActions(s, waitingOn(s)!)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, a, b, c, blimId, bearId };
  }

  it("the damaged player gains control of the permanent you choose, then loses life and discards for each permanent they control but don't own", () => {
    const g = blimGame();
    expect(g.s.pending).toMatchObject({ kind: "chooseTargets", player: g.a });
    let s = act(g.s, { type: "chooseTargets", player: g.a, targets: [{ kind: "object", id: g.bearId }] });
    const life = s.players[g.b]!.life;
    const hand = s.players[g.b]!.hand.length;
    s = settle(s);
    // B discards one card (the choice is theirs).
    for (let i = 0; i < 10 && s.pending; i++) s = act(s, botActions(s, waitingOn(s)!)[0]!);
    s = settle(s);
    expect(controllerOf(s, s.objects[g.bearId]!)).toBe(g.b);
    expect(s.players[g.b]!.life).toBe(life - 1);
    expect(s.players[g.b]!.hand.length).toBe(hand - 1);
    // A controls only what A owns: no loss.
    expect(s.players[g.a]!.life).toBe(40);
  });

  it("counts every permanent a player controls but doesn't own, not only Blim's gifts (rulings)", () => {
    const g = blimGame();
    // C already controls a creature A owns (taken for good).
    const lent = putOnBattlefield(g.s, g.a, bears());
    addEffect(g.s, g.c, [lent], [{ kind: "control" }], "game");
    expect(controllerOf(g.s, g.s.objects[lent]!)).toBe(g.c);
    const lifeC = g.s.players[g.c]!.life;
    const handC = g.s.players[g.c]!.hand.length;
    let s = act(g.s, { type: "chooseTargets", player: g.a, targets: [{ kind: "object", id: g.bearId }] });
    s = settle(s);
    for (let i = 0; i < 10 && s.pending; i++) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    expect(s.players[g.c]!.life).toBe(lifeC - 1);
    expect(s.players[g.c]!.hand.length).toBe(handC - 1);
    expect(log(s)).toMatch(/loses 1 life/);
  });

  it("with its target gone, nothing happens: no control change, no life loss, no discards (rulings)", () => {
    const g = blimGame();
    let s = act(g.s, { type: "chooseTargets", player: g.a, targets: [{ kind: "object", id: g.bearId }] });
    // The Bears leaves before the trigger resolves.
    const life = s.players[g.b]!.life;
    s.battlefield.splice(s.battlefield.indexOf(g.bearId), 1);
    s.objects[g.bearId]!.zone = "graveyard";
    s.objects[g.bearId]!.zoneChanges = (s.objects[g.bearId]!.zoneChanges ?? 0) + 1;
    s.players[g.a]!.graveyard.push(g.bearId);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.players[g.b]!.life).toBe(life);
  });

  it("a bot gives away its least useful permanent, a land before Blim itself", () => {
    const g = blimGame();
    const t = botActions(g.s, g.a)[0]!;
    expect(t.type).toBe("chooseTargets");
    const id = t.type === "chooseTargets" && t.targets[0]?.kind === "object" ? t.targets[0].id : "";
    expect(id).not.toBe(g.blimId);
    expect(id).not.toBe(g.bearId);
    expect(g.s.objects[id]!.cardId).toMatch(/Mountain|Island|Forest|Plains|Swamp/);
  });
});

describe("round 416: Invisible Woman, Sue Storm", () => {
  function sueGame(hand: CardDef[]) {
    const { s, ap, ids } = setup(hand);
    const sueId = putOnBattlefield(s, ap, sue());
    const h1 = putOnBattlefield(s, ap, amateur());
    const h2 = putOnBattlefield(s, ap, hawkeye());
    const bearId = putOnBattlefield(s, ap, bears());
    invalidateCharacteristics(s);
    return { s, ap, ids, sueId, h1, h2, bearId };
  }
  const walls = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && /^Wall/.test(s.cards[s.objects[id]!.cardId]?.name ?? "")).length;
  /** Answers each "you may" yes. */
  const yes = (s: GameState) => {
    for (let i = 0; i < 10 && s.pending?.kind === "chooseMay"; i++) s = settle(act(s, { type: "chooseMay", player: s.pending.player, yes: true }));
    return s;
  };

  it("counters put on two other Heroes at once (Inspiring Roar) trigger it once", () => {
    const g = sueGame([roar()]);
    let s = castNow(g.s, g.ap, g.ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = yes(s);
    expect(plus(s, g.h1)).toBe(1);
    expect(plus(s, g.h2)).toBe(1);
    expect(walls(s, g.ap)).toBe(1);
  });

  it("each of two instructions is its own event: Travel Preparations' two targets are one", () => {
    const g = sueGame([travel()]);
    let s = castNow(g.s, g.ap, g.ids[0]!, [{ kind: "object", id: g.h1 }, { kind: "object", id: g.h2 }]);
    s = yes(s);
    expect(walls(s, g.ap)).toBe(1);
  });

  it("not for counters on herself or on a non-Hero", () => {
    const g = sueGame([battlegrowth(), battlegrowth()]);
    let s = castNow(g.s, g.ap, g.ids[0]!, [{ kind: "object", id: g.sueId }]);
    expect(s.pending ?? undefined).toBeUndefined();
    s = castNow(s, g.ap, g.ids[1]!, [{ kind: "object", id: g.bearId }]);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(walls(s, g.ap)).toBe(0);
  });

  it("not for +1/+1 counters an opponent puts on your Heroes; yours do", () => {
    const g = sueGame([]);
    const [, b] = order(g.s, g.ap);
    withPutter(b, () => putCounters(g.s, g.s.objects[g.h1]!, "+1/+1", 1));
    expect(g.s.triggerQueue.length).toBe(0);
    withPutter(g.ap, () => putCounters(g.s, g.s.objects[g.h1]!, "+1/+1", 1));
    expect(g.s.triggerQueue.length).toBe(1);
  });

  it("proliferate on two Heroes is one event too", () => {
    const g = sueGame([progress()]);
    g.s.objects[g.h1]!.counters["+1/+1"] = 1;
    g.s.objects[g.h2]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(g.s);
    let s = run(g.s, planCast(g.s, g.ap, g.ids[0]!, undefined, undefined, "auto"));
    s = settle(s);
    // Proliferate's choice: both Heroes.
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: g.ap, ids: [g.h1, g.h2] }));
    s = yes(s);
    expect(plus(s, g.h1)).toBe(2);
    expect(plus(s, g.h2)).toBe(2);
    expect(walls(s, g.ap)).toBe(1);
  });
});

describe("round 416: Aragorn, Company Leader", () => {
  it("whenever you put counters on it, the target gets one of each of those kinds", () => {
    const { s: s0, ap, ids } = setup([battlegrowth()]);
    const arId = putOnBattlefield(s0, ap, aragorn());
    const bearId = putOnBattlefield(s0, ap, bears());
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: arId }], undefined, "auto"));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bearId }] }));
    expect(plus(s, arId)).toBe(1);
    expect(plus(s, bearId)).toBe(1);
  });

  it("several kinds put at once (proliferate) trigger it once, and the target gets one of each kind", () => {
    const { s: s0, ap, ids } = setup([progress()]);
    const arId = putOnBattlefield(s0, ap, aragorn());
    const bearId = putOnBattlefield(s0, ap, bears());
    s0.objects[arId]!.counters["+1/+1"] = 1;
    s0.objects[arId]!.counters.vigilance = 1;
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto"));
    s = settle(s);
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [arId] }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bearId }] }));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(plus(s, bearId)).toBe(1);
    expect(s.objects[bearId]!.counters.vigilance).toBe(1);
    // Its own trigger's counters go on the Bears, not on Aragorn: no loop.
    expect(plus(s, arId)).toBe(2);
  });

  it("the Ring tempting you with another creature as Ring-bearer: your choice of a keyword counter", () => {
    const { s: s0, ap, ids } = setup([birthdayEscape]);
    const arId = putOnBattlefield(s0, ap, aragorn());
    const bearId = putOnBattlefield(s0, ap, bears());
    invalidateCharacteristics(s0);
    let s = castNow(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "ringBearer" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bearId] }));
    expect(ringBearer(s, ap)?.id).toBe(bearId);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either" });
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.labels).toEqual(["Put a first strike counter", "Put a vigilance counter", "Put a deathtouch counter", "Put a lifelink counter"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: p.options[2]! }));
    expect(s.objects[arId]!.counters.deathtouch).toBe(1);
    // Then its other trigger: one deathtouch counter on up to one other target creature.
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bearId }] }));
    expect(s.objects[bearId]!.counters.deathtouch).toBe(1);
  });

  it("not when Aragorn itself is chosen as Ring-bearer (an intervening if)", () => {
    const { s: s0, ap, ids } = setup([birthdayEscape]);
    const arId = putOnBattlefield(s0, ap, aragorn());
    putOnBattlefield(s0, ap, bears());
    invalidateCharacteristics(s0);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [arId] }));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(Object.values(s.objects[arId]!.counters).filter((n) => (n ?? 0) > 0)).toEqual([]);
  });
});
