// Round 385: three more shields for the next draw this turn (CR 614.1a, 614.6, 614.11): each player returning a
// permanent they control (Words of Wind; CR 101.4, 614.11a), the top card of a face-down pile its enters ability made
// (Mangara's Tome; CR 607.2a, 406.3, 701.23d) and a look at the top X cards before the draw (Aladdin's Lamp; CR 614.5,
// rulings).

import { describe, expect, it } from "vitest";
import { act, bear, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, draw, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const wind = (): CardDef => ({"oracleId":"523d3e3d-8fdf-44f8-868d-7b00995e4577","name":"Words of Wind","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, each player returns a permanent they control to its owner's hand instead.","colors":["U"],"colorIdentity":["U"],"keywords":[]});
const tome = (): CardDef => ({"oracleId":"f515c691-07be-47ea-8bc0-46221eab8b46","name":"Mangara's Tome","manaCost":"{5}","cmc":5,"typeLine":"Artifact — Book","supertypes":[],"types":["Artifact"],"subtypes":["Book"],"oracleText":"When this artifact enters, search your library for five cards, exile them in a face-down pile, and shuffle that pile. Then shuffle your library.\n{2}: The next time you would draw a card this turn, instead put the top card of the exiled pile into its owner's hand.","colors":[],"colorIdentity":[],"keywords":[]});
const lamp = (): CardDef => ({"oracleId":"2aa2f96b-5784-4767-b9ea-b8d9222cb1de","name":"Aladdin's Lamp","manaCost":"{10}","cmc":10,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{X}, {T}: The next time you would draw a card this turn, instead look at the top X cards of your library, put all but one of them on the bottom of your library in a random order, then draw a card. X can't be 0.","colors":[],"colorIdentity":[],"keywords":[]});
const archive = (): CardDef => ({"oracleId":"d5c4d36c-54b3-4149-906b-a57a670260fc","name":"Alhammarret's Archive","manaCost":"{5}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","colors":[],"colorIdentity":[],"keywords":[]});
const wilding = (): CardDef => ({"oracleId":"888582df-4fe2-4d05-9b62-10c90aaa76f2","name":"Words of Wilding","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, create a 2/2 green Bear creature token instead.","colors":["G"],"colorIdentity":["G"],"keywords":[]});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[]});

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
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
/** The permanents `pid` controls: only these (the rest leave the game for the test). */
const boardOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller !== pid) continue;
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    o.zone = "exile";
    s.players[o.owner]!.exile.push(id);
  }
  return defs.map((d) => putOnBattlefield(s, pid, d));
};
/** Puts a fresh card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const named = (name: string) => bear({ name });
const nameIn = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

describe("round 385 cards compile", () => {
  it("Words of Wind, Mangara's Tome and Aladdin's Lamp are fully supported", () => {
    for (const d of [wind(), tome(), lamp()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Words of Wind: the next draw this turn has each player return a permanent they control instead", () => {
  it("no card is drawn; each player with several permanents chooses one in APNAP order, one with a single permanent returns it, all at once; the second draw of two is drawn (CR 614.11a)", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, wind());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect(s.players[ap]!.nextDrawInstead).toEqual([expect.objectContaining({ wind: true, source: "Words of Wind" })]);
    const mine = boardOf(s, ap, [wind(), forest]);
    const bBoard = boardOf(s, b!, [bear(), forest]);
    const [cOnly] = boardOf(s, c!, [bear()]);
    boardOf(s, d!, []);
    const hand = s.players[ap]!.hand.length;
    const top = s.players[ap]!.library.slice(0, 2);
    draw(s, ap, 2);
    // The drawing player chooses first (APNAP: it's their turn), then B; C has one permanent, D none.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1, source: "Words of Wind", action: "bounce" });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [bBoard[0]!] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine[1]!] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b, count: 1 });
    // Nothing has been returned yet: all at once, once every choice is made.
    expect(s.objects[mine[1]!]!.zone).toBe("battlefield");
    s = act(s, { type: "pickPermanents", player: b!, ids: [bBoard[0]!] });
    expect(s.pending).toBeNull();
    expect(s.objects[mine[1]!]!.zone).toBe("hand");
    expect(s.objects[bBoard[0]!]!.zone).toBe("hand");
    expect(s.objects[cOnly!]!.zone).toBe("hand");
    expect(s.objects[bBoard[1]!]!.zone).toBe("battlefield");
    expect(s.objects[mine[0]!]!.zone).toBe("battlefield");
    // The first draw was replaced, the second one drawn: the top card then.
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[top[0]!]!.zone).toBe("hand");
    expect(s.objects[top[1]!]!.zone).toBe("library");
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
  });

  it("inside a resolving spell: Divination's second draw waits for the choices, then the spell finishes", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    const [b] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, wind());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    const bBoard = boardOf(s, b!, [bear(), forest]);
    for (const pid of others(s, ap).slice(1)) boardOf(s, pid, []);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    // Our own permanents first (several lands and the Words), then B's.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = act(s, { type: "pickPermanents", player: ap, ids: [w] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b });
    s = settle(act(s, { type: "pickPermanents", player: b!, ids: [bBoard[1]!] }));
    expect(s.objects[w]!.zone).toBe("hand");
    expect(s.objects[bBoard[1]!]!.zone).toBe("hand");
    // Divination left the hand (-1), the Words came back (+1) and one card was drawn (+1).
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.stack).toHaveLength(0);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("with no card in its library the draw is still replaced (CR 614.11): nobody loses for drawing", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wind());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    boardOf(s, ap, [wind()]);
    for (const pid of others(s, ap)) boardOf(s, pid, []);
    for (const id of s.players[ap]!.library) s.objects[id]!.zone = "exile";
    s.players[ap]!.exile.push(...s.players[ap]!.library);
    s.players[ap]!.library = [];
    draw(s, ap, 1);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.drewFromEmptyLibrary).toBeFalsy();
    expect(s.players[ap]!.hand.some((id) => nameIn(s, id) === "Words of Wind")).toBe(true);
  });

  it("with a Words of Wilding shield too, the drawing player chooses which applies (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wind());
    const wild = putOnBattlefield(s0, ap, wilding());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    s = settle(run(s, planActivate(s, ap, wild, 0)));
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const labels = (s.pending as { labels: string[] }).labels;
    expect(labels).toContain("Each player returns a permanent they control to its owner's hand (Words of Wind)");
  });

  it("a bot returns its least valuable permanent, and doesn't activate Words of Wind in its upkeep", () => {
    const { s: s0, ap } = setup([]);
    const [b] = others(s0, ap);
    const w = putOnBattlefield(s0, ap, wind());
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    boardOf(s, ap, [wind()]);
    const bBoard = boardOf(s, b!, [bear({ name: "Craw Wurm", power: "6", toughness: "4", manaCost: "{4}{G}{G}" }), forest]);
    for (const pid of others(s, ap).slice(1)) boardOf(s, pid, []);
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b });
    for (const a of botActions(s, b!)) s = act(s, a);
    expect(s.objects[bBoard[1]!]!.zone).toBe("hand");
    expect(s.objects[bBoard[0]!]!.zone).toBe("battlefield");
    // Its own Words of Wind in its upkeep: left alone.
    const w2 = putOnBattlefield(s, b!, wind());
    s.activePlayer = b!;
    s.step = "upkeep";
    expect(botActions(s, b!).some((a) => a.type === "activateAbility" && a.objectId === w2)).toBe(false);
  });
});

describe("Mangara's Tome: five cards exiled in a face-down pile, then draws replaced by its top card", () => {
  const enter = () => {
    const { s: s0, ap, ids } = setup([tome()]);
    const picks = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((n) => onTop(s0, ap, named(n)));
    const t = ids[0]!;
    let s = settle(run(s0, planCast(s0, ap, t)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 5 });
    s = act(s, { type: "searchLibrary", player: ap, found: picks });
    s = settle(s);
    return { s, ap, t, picks };
  };

  it("the search finds five cards (CR 701.23d), exiled face down where nobody may look at them (CR 406.3), linked to the Tome (CR 607.2a)", () => {
    const { s, t, picks } = enter();
    for (const id of picks) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    }
    const pile = s.linkedExile?.[`${t}@${s.objects[t]!.zoneChanges ?? 0}`] ?? [];
    expect(pile.map((l) => l.id).sort()).toEqual([...picks].sort());
  });

  it("{2}: the next draw puts the top card of the pile into its owner's hand instead; it isn't drawn (CR 614.6)", () => {
    let { s, ap, t } = enter();
    const pile = s.linkedExile![`${t}@${s.objects[t]!.zoneChanges ?? 0}`]!.map((l) => l.id);
    s = settle(run(s, planActivate(s, ap, t, 0)));
    expect(s.players[ap]!.nextDrawInstead).toEqual([expect.objectContaining({ pile: true, sourceId: t })]);
    const top = s.players[ap]!.library[0]!;
    const drawsBefore = s.players[ap]!.draws?.turn === s.turn ? s.players[ap]!.draws!.n : 0;
    draw(s, ap, 1);
    expect(s.objects[pile[0]!]!.zone).toBe("hand");
    expect(s.objects[top]!.zone).toBe("library");
    expect(s.players[ap]!.draws?.turn === s.turn ? s.players[ap]!.draws!.n : 0).toBe(drawsBefore);
    // The next one takes the next card of the pile.
    s = settle(run(s, planActivate(s, ap, t, 0)));
    draw(s, ap, 1);
    expect(s.objects[pile[1]!]!.zone).toBe("hand");
  });

  it("with the pile empty the ability still replaces the draw, and nothing happens (rulings)", () => {
    let { s, ap, t, picks } = enter();
    for (const id of picks) {
      const o = s.objects[id]!;
      s.players[o.owner]!.exile.splice(s.players[o.owner]!.exile.indexOf(id), 1);
      o.zone = "graveyard";
      o.zoneChanges = (o.zoneChanges ?? 0) + 1;
      s.players[o.owner]!.graveyard.push(id);
    }
    s = settle(run(s, planActivate(s, ap, t, 0)));
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
  });

  it("a bot activates the Tome in its upkeep while the pile has a card", () => {
    let { s, ap, t } = enter();
    const tomeAbility = (a: Action) => a.type === "activateAbility" && a.objectId === t;
    // Only in its own upkeep (as for the Words); here it's the main phase.
    expect(botActions(s, ap).some(tomeAbility)).toBe(false);
    s.step = "upkeep";
    expect(botActions(s, ap).some(tomeAbility)).toBe(true);
  });
});

describe("Aladdin's Lamp: look at the top X cards, keep one, the rest on the bottom in a random order, then draw", () => {
  it("X = 3: the card kept is the one drawn; the other two go on the bottom", () => {
    const { s: s0, ap } = setup([]);
    const [c3, c2, c1] = ["Gamma", "Beta", "Alpha"].map((n) => onTop(s0, ap, named(n)));
    const l = putOnBattlefield(s0, ap, lamp());
    let s = settle(run(s0, planActivate(s0, ap, l, 0, undefined, undefined, undefined, 3)));
    expect(s.players[ap]!.nextDrawInstead).toEqual([expect.objectContaining({ lamp: 3 })]);
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawLook", lamp: true, player: ap, cards: [c1, c2, c3] });
    s = act(s, { type: "drawLook", player: ap, objectId: c3! });
    expect(s.pending).toBeNull();
    expect(s.objects[c3!]!.zone).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    const lib = s.players[ap]!.library;
    expect(new Set(lib.slice(-2))).toEqual(new Set([c1, c2]));
  });

  it("two Lamps: the second replaces the draw the first one makes (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const [c3, c2, c1] = ["Gamma", "Beta", "Alpha"].map((n) => onTop(s0, ap, named(n)));
    const l1 = putOnBattlefield(s0, ap, lamp());
    const l2 = putOnBattlefield(s0, ap, lamp());
    let s = settle(run(s0, planActivate(s0, ap, l1, 0, undefined, undefined, undefined, 2)));
    s = settle(run(s, planActivate(s, ap, l2, 0, undefined, undefined, undefined, 2)));
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawLook", lamp: true, cards: [c1, c2] });
    s = act(s, { type: "drawLook", player: ap, objectId: c2! });
    // The first Lamp's draw is replaced by the second: c2 and c3 now on top.
    expect(s.pending).toMatchObject({ kind: "drawLook", lamp: true, cards: [c2, c3] });
    s = act(s, { type: "drawLook", player: ap, objectId: c3! });
    expect(s.objects[c3!]!.zone).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
  });

  it("with one card in the library there's nothing to choose: it's drawn", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lamp());
    let s = settle(run(s0, planActivate(s0, ap, l, 0, undefined, undefined, undefined, 4)));
    const p = s.players[ap]!;
    const last = p.library[0]!;
    for (const id of p.library.slice(1)) s.objects[id]!.zone = "exile";
    p.exile.push(...p.library.slice(1));
    p.library = [last];
    draw(s, ap, 1);
    expect(s.pending).toBeNull();
    expect(s.objects[last]!.zone).toBe("hand");
  });

  it("with Alhammarret's Archive applied first, the Lamp's draw is one of the Archive's two and isn't doubled again (CR 614.5)", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lamp());
    putOnBattlefield(s0, ap, archive());
    let s = settle(run(s0, planActivate(s0, ap, l, 0, undefined, undefined, undefined, 2)));
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    s = act(s, { type: "drawInstead", player: ap, choice: "archive" });
    expect(s.pending).toMatchObject({ kind: "drawLook", lamp: true });
    s = act(s, { type: "drawLook", player: ap, objectId: (s.pending as { cards: string[] }).cards[1]! });
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("the Lamp applied first: its draw can still be doubled by the Archive", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lamp());
    putOnBattlefield(s0, ap, archive());
    let s = settle(run(s0, planActivate(s0, ap, l, 0, undefined, undefined, undefined, 2)));
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    const key = (s.pending as { options: string[] }).options.find((k) => k.startsWith("words:"))!;
    s = act(s, { type: "drawInstead", player: ap, choice: key });
    s = act(s, { type: "drawLook", player: ap, objectId: (s.pending as { cards: string[] }).cards[0]! });
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("a bot activates its Lamp in its upkeep with X = 2", () => {
    const { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, lamp());
    s.step = "upkeep";
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === l && a.x === 2)).toBe(true);
  });

  it("a bot keeps a card on top for the Lamp", () => {
    const { s: s0, ap } = setup([]);
    ["Gamma", "Beta", "Alpha"].map((n) => onTop(s0, ap, named(n)));
    const l = putOnBattlefield(s0, ap, lamp());
    let s = settle(run(s0, planActivate(s0, ap, l, 0, undefined, undefined, undefined, 3)));
    draw(s, ap, 1);
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.pending).toBeNull();
  });
});
