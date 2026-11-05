// Round 280: earlier skips from the top of the popularity list. Life bidding (Illicit Auction, Mages' Contest, Pain's
// Reward).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, objIsType, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const nextOpp = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % s.turnOrder.length]!;
/** Answers the bids in order: a number tops the high bid, "pass" declines. */
const bids = (s: GameState, answers: (number | "pass")[]) => {
  for (const a of answers) {
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "bid") throw new Error(`no bid asked for: ${JSON.stringify(p)}`);
    s = settle(act(s, { type: "chooseOption", player: p.player, choice: String(a) }));
  }
  return s;
};
const bidder = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "bid" ? s.pending.player : undefined);

// Real oracle text (Scryfall).
const auction = (): CardDef => ({"oracleId":"dea8c725-455e-4668-877a-df388fe22255","name":"Illicit Auction","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player may bid life for control of target creature. You start the bidding with a bid of 0. In turn order, each player may top the high bid. The bidding ends if the high bid stands. The high bidder loses life equal to the high bid and gains control of the creature. (This effect lasts indefinitely.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9c3f633f-538c-4581-b3cc-9285ed6bc4fe.jpg?1783947076","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9c3f633f-538c-4581-b3cc-9285ed6bc4fe.jpg?1783947076","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const contest = (): CardDef => ({"oracleId":"b0a6bf69-7e21-4d5c-ac72-5946d84fc2ca","name":"Mages' Contest","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You and target spell's controller bid life. You start the bidding with a bid of 1. In turn order, each player may top the high bid. The bidding ends if the high bid stands. The high bidder loses life equal to the high bid. If you win the bidding, counter that spell.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c516861c-68d9-4d02-a343-689dba0526c6.jpg?1783945683","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c516861c-68d9-4d02-a343-689dba0526c6.jpg?1783945683","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reward = (): CardDef => ({"oracleId":"4608c663-e088-40ca-a915-b6e39253eb98","name":"Pain's Reward","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player may bid life. You start the bidding with a bid of any number. In turn order, each player may top the high bid. The bidding ends if the high bid stands. The high bidder loses life equal to the high bid and draws four cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d16da68-85f6-4d54-9751-9cf046f5e99a.jpg?1783944152","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d16da68-85f6-4d54-9751-9cf046f5e99a.jpg?1783944152","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const truth = (): CardDef => ({"oracleId":"10674c2f-7920-4505-b8d5-e96f3da1cda3","name":"Truth or Tale","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Reveal the top five cards of your library and separate them into two piles. An opponent chooses one of those piles. Put a card from the chosen pile into your hand, then put all other cards revealed this way on the bottom of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5b3e301a-02a5-4d92-9cdd-5ab877bf8ed3.jpg?1783943238","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5b3e301a-02a5-4d92-9cdd-5ab877bf8ed3.jpg?1783943238","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const atris = (): CardDef => ({"oracleId":"8b2b00ab-f1c5-4057-9957-d7daac95a847","name":"Atris, Oracle of Half-Truths","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"Menace\nWhen Atris enters, target opponent looks at the top three cards of your library and separates them into a face-down pile and a face-up pile. Put one pile into your hand and the other into your graveyard.","power":"3","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3c7ca7d7-e706-4a6a-a198-2ee8ca808714.jpg?1783916801","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3c7ca7d7-e706-4a6a-a198-2ee8ca808714.jpg?1783916801","commanderLegal":"legal","set":"mul","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const parley = (): CardDef => ({"oracleId":"a3d048c8-e8df-4b50-a422-fc94a69f44bb","name":"Boneyard Parley","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile up to five target creature cards from graveyards. An opponent separates those cards into two piles. Put all cards from the pile of your choice onto the battlefield under your control and the rest into their owners' graveyards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/35989b1e-9bad-4f8d-a559-bf14d1342aa3.jpg?1783935765","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/35989b1e-9bad-4f8d-a559-bf14d1342aa3.jpg?1783935765","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const aurora = (): CardDef => ({"oracleId":"b9d7341e-10e7-43f9-bee2-e8053b287acd","name":"The Great Aurora","manaCost":"{6}{G}{G}{G}","cmc":9,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player shuffles all cards from their hand and all permanents they own into their library, then draws that many cards. Each player may put any number of land cards from their hand onto the battlefield. Exile The Great Aurora.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b1d0eb3b-00b9-42ca-9f7d-5543bffc3480.jpg?1783938322","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b1d0eb3b-00b9-42ca-9f7d-5543bffc3480.jpg?1783938322","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const collision = (): CardDef => ({"oracleId":"40cbf2c0-041a-44df-a775-580012caab67","name":"Collision of Realms","manaCost":"{6}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player shuffles all creatures they own into their library. Each player who shuffled a nontoken creature into their library this way reveals cards from the top of their library until they reveal a creature card, then puts that card onto the battlefield and the rest on the bottom of their library in a random order.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/49618217-1bbb-498a-a6f0-f269ce7166a6.jpg?1783923992","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/49618217-1bbb-498a-a6f0-f269ce7166a6.jpg?1783923992","commanderLegal":"legal","set":"nec","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sunburst = (): CardDef => ({"oracleId":"aee0388f-544e-4c28-a34f-29cc0a97d424","name":"Sculpted Sunburst","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a creature you control, then each opponent chooses a creature they control with equal or lesser power. If you chose a creature this way, exile each creature not chosen by any player this way.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2d16d8fe-a770-4bbd-bf20-447c0165de5a.jpg?1783922803","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2d16d8fe-a770-4bbd-bf20-447c0165de5a.jpg?1783922803","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const deliver = (): CardDef => ({"oracleId":"9e73f938-0aa4-4639-a97a-f7e68f645623","name":"Deliver Unto Evil","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose up to four target cards in your graveyard. If you control a Bolas planeswalker, return those cards to your hand. Otherwise, an opponent chooses two of them. Leave the chosen cards in your graveyard and put the rest into your hand.\nExile Deliver Unto Evil.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/7/67aa7104-7acc-4827-b763-ac053c99baab.jpg?1783933447","artUrl":"https://cards.scryfall.io/art_crop/front/6/7/67aa7104-7acc-4827-b763-ac053c99baab.jpg?1783933447","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const favor = (): CardDef => ({"oracleId":"9baff93e-4ef9-404d-884b-f651a11f3742","name":"Fortune's Favor","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target opponent looks at the top four cards of your library and separates them into a face-down pile and a face-up pile. Put one pile into your hand and the other into your graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a67dd08-0064-4750-adf5-07bacb0296eb.jpg?1783937499","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a67dd08-0064-4750-adf5-07bacb0296eb.jpg?1783937499","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const vanilla = () => bear({ name: "Test Bear" });
const named = (n: string, cmc = 2) => card(n, "Creature — Test", `{${cmc}}`, { cmc, power: "2", toughness: "2" });
/** Puts these cards on top of `pid`'s library, the first on top. */
const stackTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  invalidateCharacteristics(s);
  return ids;
};
const toGraveyard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Answers "choose an opponent" with `opp`, if asked. */
const pickOpp = (s: GameState, opp: PlayerId) => (s.pending?.kind === "chooseOption" && s.pending.what === "opponent" ? settle(act(s, { type: "chooseOption", player: s.pending.player, choice: String(opp) })) : s);

describe("round 280", () => {
  it("every card of the round compiles fully", () => {
    supported(auction(), contest(), reward(), truth(), atris(), parley(), aurora(), collision(), sunburst(), deliver(), favor());
  });
});

describe("Illicit Auction: each player may bid life for control of target creature", () => {
  it("you start at 0, the others top in turn order after you, around again until all but the high bidder decline", () => {
    const { s: s0, ap, ids } = setup([auction()]);
    const [p1, p2, p3] = [nextOpp(s0, ap, 1), nextOpp(s0, ap, 2), nextOpp(s0, ap, 3)];
    const theirs = putOnBattlefield(s0, p2, vanilla());
    invalidateCharacteristics(s0);
    const life = s0.players.map((p) => p.life);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    // Your opening bid of 0 stands for the next player to top.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "bid", player: p1, options: ["pass"], numberRange: { min: 1 } });
    s = bids(s, [3]);
    expect(bidder(s)).toBe(p2);
    expect(s.pending).toMatchObject({ numberRange: { min: 4 } });
    // A bid has to top the high bid.
    expect(() => act(s, { type: "chooseOption", player: p2, choice: "3" })).toThrow();
    s = bids(s, ["pass", "pass"]);
    // Back to you: you may top it too.
    expect(bidder(s)).toBe(ap);
    s = bids(s, [4, "pass", "pass"]);
    expect(bidder(s)).toBe(p3);
    s = bids(s, ["pass"]);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(life[ap]! - 4);
    expect(s.players[p1]!.life).toBe(life[p1]!);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    // Indefinitely: still yours on a later turn.
    s = passUntil(s, "upkeep");
    s = passUntil(s, "main1");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("another player who wins the bidding loses that life and gains control, even of a creature you control", () => {
    const { s: s0, ap, ids } = setup([auction()]);
    const p2 = nextOpp(s0, ap, 2);
    const mine = putOnBattlefield(s0, ap, vanilla());
    invalidateCharacteristics(s0);
    const life = s0.players[p2]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)])));
    s = bids(s, ["pass"]);
    // A bid can be more than the bidder's life total (rulings: it's a loss of life, not a payment).
    expect(s.pending?.kind === "chooseOption" && s.pending.numberRange!.max).toBeGreaterThan(life);
    s = bids(s, [10, "pass", "pass", "pass"]);
    expect(s.pending).toBeNull();
    expect(controllerOf(s, s.objects[mine]!)).toBe(p2);
    expect(s.players[p2]!.life).toBe(life - 10);
  });

  it("no one tops your bid of 0: you gain control for no life", () => {
    const { s: s0, ap, ids } = setup([auction()]);
    const theirs = putOnBattlefield(s0, nextOpp(s0, ap, 1), vanilla());
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    s = bids(s, ["pass", "pass", "pass"]);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(life);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("bots bid on it, by one at a time, up to about what the creature is worth", () => {
    const { s: s0, ap, ids } = setup([auction()]);
    const p1 = nextOpp(s0, ap, 1);
    const theirs = putOnBattlefield(s0, p1, vanilla());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    for (let i = 0; i < 40 && s.pending; i++) s = settle(run(s, botActions(s, s.pending.player)));
    expect(s.pending).toBeNull();
    // A 2/2 for {1}{G}... worth a few life: someone won it for a small bid.
    const lost = s.players.map((p, i) => s0.players[i]!.life - p.life);
    expect(Math.max(...lost)).toBeGreaterThan(0);
    expect(Math.max(...lost)).toBeLessThanOrEqual(6);
    const winner = lost.indexOf(Math.max(...lost)) as PlayerId;
    expect(controllerOf(s, s.objects[theirs]!)).toBe(winner);
  });
});

describe("Mages' Contest: you and target spell's controller bid life", () => {
  const spellOf = (s: GameState, id: ObjectId) => s.stack.find((x) => x.kind === "spell" && x.objectId === id)!;
  const opponentCasts = (opts: { win: boolean }) => {
    const { s: s0, ap, ids } = setup([contest()]);
    const p1 = nextOpp(s0, ap, 1);
    // On the next player's turn, they cast a creature spell and you answer with the contest.
    let s = passUntil(s0, "main1", p1);
    expect(s.activePlayer).toBe(p1);
    const theirs = putOnBattlefield(s, p1, vanilla());
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "hand";
    s.players[p1]!.hand.push(theirs);
    s.players[p1]!.manaPool.G = 2;
    s.players[ap]!.manaPool.R = 3;
    s = run(s, planCast(s, p1, theirs));
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const item = spellOf(s, theirs);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }]));
    s = settle(s);
    const life = s0.players.map((p) => p.life);
    // You start at 1; only the spell's controller may top it.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "bid", player: p1, numberRange: { min: 2 } });
    s = opts.win ? bids(s, ["pass"]) : bids(s, [2, "pass"]);
    return { s, ap, p1, theirs, life };
  };
  it("you win: you lose your bid and the spell is countered", () => {
    const { s, ap, p1, theirs, life } = opponentCasts({ win: true });
    expect(s.players[ap]!.life).toBe(life[ap]! - 1);
    expect(s.players[p1]!.life).toBe(life[p1]!);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });
  it("they win: they lose their bid and the spell resolves", () => {
    const { s, ap, p1, theirs, life } = opponentCasts({ win: false });
    expect(s.players[ap]!.life).toBe(life[ap]!);
    expect(s.players[p1]!.life).toBe(life[p1]! - 2);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });
});

describe("Pain's Reward: each player may bid life; the high bidder draws four cards", () => {
  it("you start with a bid of any number, 0 too; the others top it in turn order", () => {
    const { s: s0, ap, ids } = setup([reward()]);
    const p3 = nextOpp(s0, ap, 3);
    const life = s0.players.map((p) => p.life);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "bid", player: ap, options: [], numberRange: { min: 0 } });
    s = bids(s, [5]);
    expect(s.pending).toMatchObject({ numberRange: { min: 6 } });
    const hand = s.players[p3]!.hand.length;
    s = bids(s, ["pass", "pass", 6, "pass", "pass", "pass"]);
    expect(s.pending).toBeNull();
    expect(s.players[p3]!.life).toBe(life[p3]! - 6);
    expect(s.players[ap]!.life).toBe(life[ap]!);
    expect(s.players[p3]!.hand.length).toBe(hand + 4);
  });

  it("a bot starting it opens at 0", () => {
    const { s: s0, ap, ids } = setup([reward()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "0" }]);
  });
});

describe("Truth or Tale: you separate, an opponent chooses a pile, you take one card of it", () => {
  it("one card of the chosen pile into your hand, every other revealed card on the bottom in the order you choose", () => {
    const { s: s0, ap, ids } = setup([truth()]);
    const p2 = nextOpp(s0, ap, 2);
    const top = stackTop(s0, ap, [named("Card A"), named("Card B"), named("Card C"), named("Card D"), named("Card E")]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[1]!] }));
    s = pickOpp(s, p2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", player: p2, pileMode: "pickOne", piles: [[top[0], top[1]], [top[2], top[3], top[4]]] });
    s = settle(act(s, { type: "chooseOption", player: p2, choice: "1" }));
    // You choose one card of the chosen pile.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pileCard", player: ap, options: [top[2], top[3], top[4]] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: top[3]! }));
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect(s.objects[top[3]!]!.zone).toBe("hand");
    const lib = s.players[ap]!.library;
    for (const id of [top[0]!, top[1]!, top[2]!, top[4]!]) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 4);
  });

  it("an empty pile chosen: no card for you, all five go on the bottom", () => {
    const { s: s0, ap, ids } = setup([truth()]);
    const top = stackTop(s0, ap, [named("Card A"), named("Card B"), named("Card C"), named("Card D"), named("Card E")]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    // The opponent who chooses is chosen once the piles are made.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    s = pickOpp(s, nextOpp(s0, ap, 1));
    s = settle(act(s, { type: "chooseOption", player: (s.pending as { player: PlayerId }).player, choice: "0" }));
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect(s.pending).toBeNull();
    expect(top.every((id) => s.objects[id]!.zone === "library")).toBe(true);
    expect(s.players[ap]!.library.slice(-5).sort()).toEqual([...top].sort());
  });

  it("bots: separating, the best card alone; choosing for an opponent, the pile whose best card is worse", () => {
    const { s: s0, ap, ids } = setup([truth()]);
    const top = stackTop(s0, ap, [named("Card A", 1), named("Card B", 6), named("Card C", 2), named("Card D", 3), named("Card E", 1)]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(botActions(s, ap)).toEqual([{ type: "searchLibrary", player: ap, found: [top[1]] }]);
    s = settle(run(s, botActions(s, ap)));
    s = pickOpp(s, nextOpp(s0, ap, 1));
    const chooser = (s.pending as { player: PlayerId }).player;
    expect(botActions(s, chooser)).toEqual([{ type: "chooseOption", player: chooser, choice: "1" }]);
  });
});

describe("Atris, Oracle of Half-Truths: the target opponent separates your top three into a face-down and a face-up pile", () => {
  const enter = () => {
    const { s: s0, ap, ids } = setup([atris()]);
    const p1 = nextOpp(s0, ap, 1);
    const top = stackTop(s0, ap, [named("Card A"), named("Card B"), named("Card C")]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: p1 }] }));
    return { s, ap, p1, top };
  };
  it("they look (nothing is revealed) and make the face-down pile; you see only its size, and take either pile", () => {
    let { s, ap, p1, top } = enter();
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p1, piles: true, forPlayer: ap });
    expect(s.log.some((l) => l.text.includes("Card A"))).toBe(false);
    s = settle(act(s, { type: "searchLibrary", player: p1, found: [top[0]!, top[2]!] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", player: ap, pileMode: "faceDown" });
    const labels = s.pending?.kind === "chooseOption" ? s.pending.labels! : [];
    expect(labels[0]).toBe("Face-down pile: 2 cards");
    expect(labels[1]).toBe("Face-up pile: Card B");
    // The face-down cards stay unnamed in the log.
    expect(s.log.some((l) => l.text.includes("Card A") || l.text.includes("Card C"))).toBe(false);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[top[0]!]!.zone).toBe("hand");
    expect(s.objects[top[2]!]!.zone).toBe("hand");
    expect(s.objects[top[1]!]!.zone).toBe("graveyard");
    expect(s.log.some((l) => l.text.includes("Card A") || l.text.includes("Card C"))).toBe(false);
  });
  it("the face-up pile into your hand, the face-down one into your graveyard", () => {
    let { s, p1, ap, top } = enter();
    s = settle(act(s, { type: "searchLibrary", player: p1, found: [top[0]!] }));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[top[0]!]!.zone).toBe("graveyard");
    expect(s.objects[top[1]!]!.zone).toBe("hand");
    expect(s.objects[top[2]!]!.zone).toBe("hand");
  });
  it("a bot choosing judges the face-down pile by its size alone", () => {
    let { s, p1, ap, top } = enter();
    // Two cheap cards face up, one card face down: a bot can't tell what the face-down one is.
    s = settle(act(s, { type: "searchLibrary", player: p1, found: [top[0]!] }));
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "1" }]);
  });
});

describe("Fortune's Favor: the same face-down and face-up piles, of the top four, as a spell", () => {
  it("the target opponent separates; you choose which pile goes to your hand", () => {
    const { s: s0, ap, ids } = setup([favor()]);
    const p2 = nextOpp(s0, ap, 2);
    const top = stackTop(s0, ap, [named("Card A"), named("Card B"), named("Card C"), named("Card D")]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: p2 }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p2, piles: true });
    s = settle(act(s, { type: "searchLibrary", player: p2, found: [] }));
    // An empty face-down pile: you choose whether all four go to your hand or your graveyard (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", player: ap, pileMode: "faceDown", labels: ["Face-down pile: 0 cards", "Face-up pile: Card A, Card B, Card C, Card D"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(top.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
  });
});

describe("Boneyard Parley: an opponent separates the exiled creature cards; your pile onto the battlefield", () => {
  it("your pile enters under your control, the other goes to its owners' graveyards", () => {
    const { s: s0, ap, ids } = setup([parley()]);
    const [p1, p2] = [nextOpp(s0, ap, 1), nextOpp(s0, ap, 2)];
    const a = toGraveyard(s0, p1, named("Card A"));
    const b = toGraveyard(s0, p2, named("Card B"));
    const c = toGraveyard(s0, ap, named("Card C"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), tgt(c), { kind: "none" }, { kind: "none" }] as TargetChoice[])));
    s = pickOpp(s, p2);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p2, piles: true, exiled: true });
    expect([a, b, c].every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: p2, found: [a] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", player: ap, pileMode: "battlefield", piles: [[a], [b, c]] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.players[p1]!.graveyard).toContain(a);
  });
});

describe("The Great Aurora: hands and permanents shuffled in, that many drawn, then lands from hand", () => {
  it("each player draws as many as their hand and the permanents they owned, tokens too; you put lands first, then the others in turn order", () => {
    const { s: s0, ap, ids } = setup([aurora(), vanilla(), vanilla()]);
    const [p1, p2] = [nextOpp(s0, ap, 1), nextOpp(s0, ap, 2)];
    const token = putOnBattlefield(s0, p1, vanilla());
    s0.objects[token]!.isToken = true;
    putOnBattlefield(s0, p1, vanilla());
    putOnBattlefield(s0, p2, forest);
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.G = 9;
    const owned = (pid: PlayerId) => s0.battlefield.filter((id) => s0.objects[id]!.owner === pid).length;
    const expected = s0.players.map((p) => p.hand.length + owned(p.id) - (p.id === ap ? 1 : 0));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "pool"));
    s = settle(s);
    // Before the lands go down, every player has drawn that many.
    expect(s.players.map((p) => p.hand.length)).toEqual(expected);
    // The token ceased to exist in the library (CR 111.7).
    expect(s.objects[token]?.zone === "battlefield" || s.players[p1]!.library.includes(token)).toBe(false);
    const askedOrder: PlayerId[] = [];
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending;
      expect(p.kind).toBe("searchLibrary");
      if (p.kind !== "searchLibrary") break;
      askedOrder.push(p.player);
      const lands = p.cards.filter((id) => s.objects[id]!.zone === "hand");
      s = settle(act(s, { type: "searchLibrary", player: p.player, found: p.player === ap ? lands : [] }));
    }
    expect(askedOrder[0]).toBe(ap);
    expect(s.pending).toBeNull();
    expect(s.battlefield.filter((id) => s.objects[id]!.owner === ap).length).toBeGreaterThan(0);
    expect(s.battlefield.every((id) => s.objects[id]!.owner === ap)).toBe(true);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});

describe("Collision of Realms: creatures shuffled in, each who shuffled a nontoken creature reveals until a creature", () => {
  it("a token alone reveals nothing; the creature cards enter together, the rest go to the bottom", () => {
    const { s: s0, ap, ids } = setup([collision()]);
    const [p1, p2] = [nextOpp(s0, ap, 1), nextOpp(s0, ap, 2)];
    const mine = putOnBattlefield(s0, ap, vanilla());
    const theirs = putOnBattlefield(s0, p1, vanilla());
    const token = putOnBattlefield(s0, p2, vanilla());
    s0.objects[token]!.isToken = true;
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.R = 7;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "pool")));
    expect(s.pending).toBeNull();
    expect(s.objects[token]?.zone === "battlefield" || s.players[p2]!.library.includes(token)).toBe(false);
    const creaturesOf = (pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.owner === pid && objIsType(s, s.objects[id]!, "Creature"));
    expect(creaturesOf(ap)).toHaveLength(1);
    expect(creaturesOf(p1)).toHaveLength(1);
    expect(creaturesOf(p2)).toHaveLength(0);
    expect([mine, theirs].every((id) => s.objects[id]!.zone !== "battlefield" || creaturesOf(s.objects[id]!.owner).includes(id))).toBe(true);
    // Their libraries still hold all their other cards: the revealed non-creatures went to the bottom.
    expect(s.players[ap]!.library.length + s.players[ap]!.hand.length + s.battlefield.filter((id) => s.objects[id]!.owner === ap).length + s.players[ap]!.graveyard.length).toBe(
      s0.players[ap]!.library.length + s0.players[ap]!.hand.length + s0.battlefield.filter((id) => s0.objects[id]!.owner === ap).length + s0.players[ap]!.graveyard.length,
    );
  });
});

describe("Sculpted Sunburst: you choose a creature, each opponent one with equal or lesser power; the rest are exiled", () => {
  it("opponents choose among creatures no stronger than yours; every creature not chosen is exiled", () => {
    const { s: s0, ap, ids } = setup([sunburst()]);
    const [p1, p2, p3] = [nextOpp(s0, ap, 1), nextOpp(s0, ap, 2), nextOpp(s0, ap, 3)];
    const big = card("Test Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
    const mineBig = putOnBattlefield(s0, ap, big);
    const mineSmall = putOnBattlefield(s0, ap, vanilla());
    const theirBig = putOnBattlefield(s0, p1, big);
    const theirSmall = putOnBattlefield(s0, p1, vanilla());
    const p2Big = putOnBattlefield(s0, p2, big);
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.W = 5;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "pool")));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([mineBig, mineSmall].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mineSmall] }));
    // The next opponent may choose only a creature with power 2 or less.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: p1, options: [theirSmall] });
    s = settle(act(s, { type: "pickPermanents", player: p1, ids: [theirSmall] }));
    // p2 has nothing small enough; p3 has no creatures: no one else is asked.
    expect(s.pending).toBeNull();
    void p3;
    expect(s.objects[mineSmall]!.zone).toBe("battlefield");
    expect(s.objects[theirSmall]!.zone).toBe("battlefield");
    for (const id of [mineBig, theirBig, p2Big]) expect(s.objects[id]!.zone).toBe("exile");
  });

  it("without a creature of yours, nothing is exiled", () => {
    const { s: s0, ap, ids } = setup([sunburst()]);
    const theirs = putOnBattlefield(s0, nextOpp(s0, ap, 1), vanilla());
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.W = 5;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "pool")));
    expect(s.pending).toBeNull();
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });
});

describe("Deliver Unto Evil: an opponent chooses two of the targets to leave in your graveyard; the rest to your hand", () => {
  it("without a Bolas planeswalker: the two chosen stay, the others come back", () => {
    const { s: s0, ap, ids } = setup([deliver()]);
    const p1 = nextOpp(s0, ap, 1);
    const cards = ["Card A", "Card B", "Card C", "Card D"].map((n) => toGraveyard(s0, ap, named(n)));
    s0.players[ap]!.manaPool.B = 3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, cards.map(tgt), undefined, "pool")));
    s = pickOpp(s, p1);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p1, min: 2, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: p1, found: [cards[0]!, cards[2]!] }));
    expect(s.objects[cards[0]!]!.zone).toBe("graveyard");
    expect(s.objects[cards[2]!]!.zone).toBe("graveyard");
    expect(s.objects[cards[1]!]!.zone).toBe("hand");
    expect(s.objects[cards[3]!]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("with a Bolas planeswalker: all of them come back; with two targets or fewer and no Bolas, both stay", () => {
    const bolas = card("Test Bolas", "Legendary Planeswalker — Bolas", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." });
    {
      const { s: s0, ap, ids } = setup([deliver()]);
      const cards = ["Card A", "Card B", "Card C"].map((n) => toGraveyard(s0, ap, named(n)));
      const pw = putOnBattlefield(s0, ap, bolas);
      s0.objects[pw]!.counters.loyalty = 5;
      invalidateCharacteristics(s0);
      s0.players[ap]!.manaPool.B = 3;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [...cards.map(tgt), { kind: "none" }], undefined, "pool")));
      expect(s.pending).toBeNull();
      expect(cards.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    }
    {
      const { s: s0, ap, ids } = setup([deliver()]);
      const cards = ["Card A", "Card B"].map((n) => toGraveyard(s0, ap, named(n)));
      s0.players[ap]!.manaPool.B = 3;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [...cards.map(tgt), { kind: "none" }, { kind: "none" }], undefined, "pool")));
      expect(s.pending).toBeNull();
      expect(cards.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    }
  });

  it("a bot choosing leaves the two best cards in the graveyard", () => {
    const { s: s0, ap, ids } = setup([deliver()]);
    const p1 = nextOpp(s0, ap, 1);
    const cards = [named("Card A", 1), named("Card B", 6), named("Card C", 2), named("Card D", 5)].map((d) => toGraveyard(s0, ap, d));
    s0.players[ap]!.manaPool.B = 3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, cards.map(tgt), undefined, "pool")));
    s = pickOpp(s, p1);
    const found = (botActions(s, p1)[0] as { found: ObjectId[] }).found;
    expect([...found].sort()).toEqual([cards[1]!, cards[3]!].sort());
  });
});
