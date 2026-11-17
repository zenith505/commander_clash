// Round 383: a Words' shield making each opponent discard a card (Words of Waste; CR 614.1a, 614.6, 614.11a, 701.9b,
// 101.4), a reflexive trigger for each card drawn while a spell resolves, each with a random target (Explosion of Riches;
// CR 603.12, rulings), and a council's dilemma that searches and returns once for each vote (Travel Through Caradhras;
// CR 701.38a, 701.23b).

import { describe, expect, it } from "vitest";
import { act, bear, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, draw, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const waste = (): CardDef => ({"oracleId":"3fe5cfcd-b25f-49d8-9f60-8b4c388a9c68","name":"Words of Waste","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, each opponent discards a card instead.","colors":["B"],"colorIdentity":["B"],"keywords":[]});
const explosion = (): CardDef => ({"oracleId":"ffd469b4-413d-49f5-a873-e3f654240b31","name":"Explosion of Riches","manaCost":"{5}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw a card, then each other player may draw a card. Whenever a card is drawn this way, Explosion of Riches deals 5 damage to target opponent chosen at random from among your opponents.","colors":["R"],"colorIdentity":["R"],"keywords":[]});
const caradhras = (): CardDef => ({"oracleId":"2d47a98b-5700-4096-b080-32df4d79910c","name":"Travel Through Caradhras","manaCost":"{5}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Council's dilemma — Starting with you, each player votes for Redhorn Pass or Mines of Moria. For each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped. If you search your library this way, shuffle. For each Mines of Moria vote, return a card from your graveyard to your hand.\nExile Travel Through Caradhras.","colors":["G"],"colorIdentity":["G"],"keywords":["Council's dilemma"]});
const leng = (): CardDef => ({"oracleId":"867def48-4be8-4056-bcf1-d6b00450b9a3","name":"Library of Leng","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You have no maximum hand size.\nIf an effect causes you to discard a card, discard it, but you may put it on top of your library instead of into your graveyard.","colors":[],"colorIdentity":[],"keywords":[]});
const baloth = (): CardDef => ({"oracleId":"ee2ab1ab-be1e-4e56-99f2-7784f7350b41","name":"Obstinate Baloth","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"When this creature enters, you gain 4 life.\nIf a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield instead of putting it into your graveyard.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[]});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[]});
const wilding = (): CardDef => ({"oracleId":"888582df-4fe2-4d05-9b62-10c90aaa76f2","name":"Words of Wilding","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, create a 2/2 green Bear creature token instead.","colors":["G"],"colorIdentity":["G"],"keywords":[]});

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
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
/** Settle, the bots answering every question but `me`'s. */
const settleBots = (s: GameState, me: PlayerId) => {
  for (let i = 0; i < 300; i++) {
    s = settle(s);
    if (!s.pending) return s;
    const who = waitingOn(s)!;
    if (who === me) return s;
    for (const a of botActions(s, who)) s = act(s, a);
  }
  return s;
};
/** Puts `n` fresh cards in `pid`'s hand, its old cards into the library: their hand is exactly these. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = [];
  return defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    p.hand.push(id);
    return id;
  });
};
const toYard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);

describe("Words of Waste: the next draw this turn makes each opponent discard a card instead", () => {
  it("compiles", () => {
    for (const d of [waste(), explosion(), caradhras()]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("no card is drawn; each opponent with several cards chooses one in turn order, one with a single card discards it, and the second draw of two is drawn (CR 614.11a)", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, waste());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect(s.players[ap]!.nextDrawInstead).toEqual([expect.objectContaining({ discard: true, source: "Words of Waste" })]);
    const bHand = handOf(s, b!, [bear(), forest]);
    const [cOnly] = handOf(s, c!, [bear()]);
    const dHand = handOf(s, d!, [bear(), forest, bear()]);
    const hand = s.players[ap]!.hand.length;
    const top = s.players[ap]!.library.slice(0, 2);
    draw(s, ap, 2);
    // B chooses first (APNAP), then D; C has only one card.
    expect(s.pending).toMatchObject({ kind: "discard", player: b, count: 1, source: "Words of Waste" });
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = act(s, { type: "discard", player: b!, objectIds: [bHand[1]!] });
    expect(s.pending).toMatchObject({ kind: "discard", player: d, count: 1 });
    // Nobody has discarded yet: all at once, once every choice is made.
    expect(s.objects[bHand[1]!]!.zone).toBe("hand");
    expect(() => act(s, { type: "discard", player: d!, objectIds: [dHand[0]!, dHand[1]!] })).toThrow();
    s = act(s, { type: "discard", player: d!, objectIds: [dHand[2]!] });
    expect(s.pending).toBeNull();
    expect(s.objects[bHand[1]!]!.zone).toBe("graveyard");
    expect(s.objects[cOnly!]!.zone).toBe("graveyard");
    expect(s.objects[dHand[2]!]!.zone).toBe("graveyard");
    expect(s.players[b!]!.hand).toEqual([bHand[0]]);
    // The first draw was replaced; the second one was drawn: the top card then (the one below the first).
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[top[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
  });

  it("inside a resolving spell: Divination's second draw waits for the discards, then the spell finishes", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    const [b] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, waste());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    const bHand = handOf(s, b!, [bear(), forest]);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: b });
    s = settle(act(s, { type: "discard", player: b!, objectIds: [bHand[0]!] }));
    s = settleBots(s, -1 as PlayerId);
    expect(s.objects[bHand[0]!]!.zone).toBe("graveyard");
    // Divination left the hand (-1) and one card was drawn (+1).
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.stack).toHaveLength(0);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("with no card in its library the draw is still replaced (CR 614.11): nobody loses for drawing", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, waste());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    for (const pid of others(s, ap)) handOf(s, pid, [bear()]);
    for (const id of s.players[ap]!.library) s.objects[id]!.zone = "exile";
    s.players[ap]!.exile.push(...s.players[ap]!.library);
    s.players[ap]!.library = [];
    draw(s, ap, 1);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.drewFromEmptyLibrary).toBeFalsy();
    for (const pid of others(s, ap)) expect(s.players[pid]!.hand).toHaveLength(0);
  });

  it("an opponent's Obstinate Baloth discarded this way enters the battlefield (the Words' controller caused it)", () => {
    const { s: s0, ap } = setup([]);
    const [b] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, waste());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    const [ob] = handOf(s, b!, [baloth()]);
    for (const pid of others(s, ap).slice(1)) handOf(s, pid, []);
    draw(s, ap, 1);
    expect(s.objects[ob!]!.zone).toBe("battlefield");
  });

  it("Library of Leng: its controller may put the discarded card on top of their library instead", () => {
    const { s: s0, ap } = setup([]);
    const [b] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, waste());
    putOnBattlefield(s0, b!, leng());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    const bHand = handOf(s, b!, [bear(), forest]);
    for (const pid of others(s, ap).slice(1)) handOf(s, pid, []);
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "discard", player: b });
    s = act(s, { type: "discard", player: b!, objectIds: [bHand[0]!] });
    expect(s.pending).toMatchObject({ kind: "handToTop", player: b, discarding: [bHand[0]] });
    s = act(s, { type: "handToTop", player: b!, objectIds: [bHand[0]!] });
    expect(s.pending).toBeNull();
    expect(s.players[b!]!.library[0]).toBe(bHand[0]);
  });

  it("with a Words of Wilding shield too, the drawing player chooses which applies; the other waits for the next draw (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, waste());
    const wild = putOnBattlefield(s0, ap, wilding());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    s = settle(run(s, planActivate(s, ap, wild, 0)));
    for (const pid of others(s, ap)) handOf(s, pid, [bear()]);
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const labels = (s.pending as { labels: string[] }).labels;
    expect(labels).toContain("Each opponent discards a card (Words of Waste)");
    const key = (s.pending as { options: string[] }).options[labels.indexOf("Each opponent discards a card (Words of Waste)")]!;
    s = act(s, { type: "drawInstead", player: ap, choice: key });
    for (const pid of others(s, ap)) expect(s.players[pid]!.hand).toHaveLength(0);
    expect(s.players[ap]!.nextDrawInstead).toEqual([expect.objectContaining({ source: "Words of Wilding" })]);
  });

  it("a bot answers the discard", () => {
    const { s: s0, ap } = setup([]);
    const [b] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, waste());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    handOf(s, b!, [bear(), forest]);
    for (const pid of others(s, ap).slice(1)) handOf(s, pid, []);
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "discard", player: b });
    for (const a of botActions(s, b!)) s = act(s, a);
    expect(s.players[b!]!.hand).toHaveLength(1);
    expect(s.players[b!]!.graveyard).toHaveLength(1);
  });
});

describe("Explosion of Riches: a reflexive trigger for each card drawn, each at a random opponent", () => {
  it("you draw, each other player who chooses to draws, then 5 damage to a random opponent for each card drawn (rulings)", () => {
    const { s: s0, ap, ids } = setup([explosion()]);
    const [b, c, d] = others(s0, ap);
    const hands = Object.fromEntries([ap, b, c, d].map((pid) => [pid, s0.players[pid!]!.hand.length]));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Each other player in turn order is asked, then those who said yes draw.
    const yes = new Set([b, d]);
    for (let i = 0; i < 3; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: [b, c, d][i] });
      const who = (s.pending as { player: PlayerId }).player;
      s = act(s, { type: "chooseMay", player: who, yes: yes.has(who) });
    }
    const life = (pids: (PlayerId | undefined)[]): number => pids.reduce<number>((n, pid) => n + s.players[pid!]!.life, 0);
    const before = life([b, c, d]);
    s = settle(s);
    // The spell left the caster's hand, and the caster drew one.
    expect(s.players[ap]!.hand.length).toBe(hands[ap]!);
    expect(s.players[b!]!.hand.length).toBe(hands[b!]! + 1);
    expect(s.players[c!]!.hand.length).toBe(hands[c!]!);
    expect(s.players[d!]!.hand.length).toBe(hands[d!]! + 1);
    // Three cards drawn: three triggers, 5 each, all at opponents (never the caster).
    expect(before - life([b, c, d])).toBe(15);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.log.filter((l) => /ability targets [A-D], chosen at random\./.test(l.text))).toHaveLength(3);
  });
});

describe("Explosion of Riches: a draw replaced draws no card, so it triggers nothing", () => {
  it("the caster's draw replaced by a Words of Wilding shield: a Bear instead, and no trigger for it", () => {
    const { s: s0, ap, ids } = setup([explosion()]);
    const wild = putOnBattlefield(s0, ap, wilding());
    let s = settle(run(s0, planActivate(s0, ap, wild, 0)));
    const life = others(s, ap).reduce((n, pid) => n + s.players[pid]!.life, 0);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    // Only one opponent draws.
    for (let i = 0; i < 3; i++) {
      const who = (s.pending as { player: PlayerId }).player;
      s = act(s, { type: "chooseMay", player: who, yes: i === 0 });
    }
    s = settle(s);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Bear"))).toBe(true);
    expect(life - others(s, ap).reduce((n, pid) => n + s.players[pid]!.life, 0)).toBe(5);
  });
});

describe("Travel Through Caradhras: a land for each Redhorn Pass vote, a card back for each Mines of Moria vote", () => {
  const cast = (votes: string[]) => {
    const { s: s0, ap, ids } = setup([caradhras()]);
    const yard = [toYard(s0, ap, bear()), toYard(s0, ap, divination()), toYard(s0, ap, bear())];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const order = [ap, ...others(s, ap)];
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: order[i] });
      s = act(s, { type: "chooseOption", player: order[i]!, choice: votes[i]! });
    }
    return { s, ap, ids, yard };
  };

  it("two votes each: two basic lands onto the battlefield tapped, then two cards from the graveyard to the hand; the spell is exiled", () => {
    let { s, ap, ids, yard } = cast(["Redhorn Pass", "Mines of Moria", "Redhorn Pass", "Mines of Moria"]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    const lands = (s.pending as { cards: string[] }).cards.slice(0, 2);
    const field = s.battlefield.length;
    s = act(s, { type: "searchLibrary", player: ap, found: lands });
    expect(s.battlefield.length).toBe(field + 2);
    for (const id of lands) expect(s.objects[id]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [yard[1]!, yard[2]!] }));
    expect(s.objects[yard[1]!]!.zone).toBe("hand");
    expect(s.objects[yard[2]!]!.zone).toBe("hand");
    expect(s.objects[yard[0]!]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("no Redhorn Pass vote: no search (nothing shuffled), four cards back... as many as there are", () => {
    let { s, ap, yard } = cast(["Mines of Moria", "Mines of Moria", "Mines of Moria", "Mines of Moria"]);
    const library = [...s.players[ap]!.library];
    // Only three cards in the graveyard: all three come back, no choice to make.
    s = settle(s);
    if (s.pending) s = settle(act(s, { type: "searchLibrary", player: ap, found: yard }));
    for (const id of yard) expect(s.objects[id]!.zone).toBe("hand");
    expect(s.players[ap]!.library).toEqual(library);
    expect(s.log.some((l) => /shuffles/.test(l.text) && /Travel/.test(l.text))).toBe(false);
  });

  it("bots vote: the caster for what helps it, the others for what helps it less", () => {
    const { s: s0, ap, ids } = setup([caradhras()]);
    toYard(s0, ap, explosion());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4; i++) {
      const who = waitingOn(s)!;
      for (const a of botActions(s, who)) s = act(s, a);
    }
    // A land is worth 3 to the caster, its graveyard's 6-drop 2 + 3: the caster wants Mines of Moria, the others it less.
    const votes = (s.resolving?.votes ?? []).map((v) => v.choice);
    expect(votes).toEqual(["Mines of Moria", "Redhorn Pass", "Redhorn Pass", "Redhorn Pass"]);
  });
});
