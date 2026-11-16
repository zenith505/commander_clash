// Round 386: Parallel Thoughts' face-down pile and its replacement of each draw (CR 614.1a, 607.2a, 406.3, 701.23d,
// rulings); Fabrication Foundry's artifacts exiled with total mana value X, X announced (CR 107.3a, 601.2b-h); Memory Vessel's seven exiled cards played instead of the hand until its controller's next turn (CR 611.2b,
// 101.2, 800.4m).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, draw, isFullySupported, legalActions, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const thoughts = (): CardDef => ({"oracleId":"2daee7cb-6736-4aa6-9921-0371c1abe69f","name":"Parallel Thoughts","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, search your library for seven cards, exile them in a face-down pile, and shuffle that pile. Then shuffle your library.\nIf you would draw a card, you may instead put the top card of the pile you exiled into your hand.","colors":["U"],"colorIdentity":["U"],"keywords":[]});
const vessel = (): CardDef => ({"oracleId":"0179bc62-823e-46b9-b536-342904fedafc","name":"Memory Vessel","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Exile this artifact: Each player exiles the top seven cards of their library. Until your next turn, players may play cards they exiled this way, and they can't play cards from their hand. Activate only as a sorcery.","colors":["R"],"colorIdentity":["R"],"keywords":[]});
const foundry = (): CardDef => ({"oracleId":"0bb20c36-689f-4a7c-80b5-a12bda821847","name":"Fabrication Foundry","manaCost":"{1}{W}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {W}. Spend this mana only to cast an artifact spell or activate an ability of an artifact source.\n{2}{W}, {T}, Exile one or more other artifacts you control with total mana value X: Return target artifact card with mana value X or less from your graveyard to the battlefield. Activate only as a sorcery.","colors":["W"],"colorIdentity":["W"],"keywords":[],"producedMana":["W"]});
const familiar = (): CardDef => ({"oracleId":"fbfa8b3f-58a7-44ca-8c22-6747b56fdcb9","name":"Obstinate Familiar","manaCost":"{R}","cmc":1,"typeLine":"Creature — Lizard","supertypes":[],"types":["Creature"],"subtypes":["Lizard"],"oracleText":"If you would draw a card, you may skip that draw instead.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[]});

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
/** Puts a fresh card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const named = (name: string) => bear({ name });

describe("round 386 cards compile", () => {
  it("Parallel Thoughts, Memory Vessel and Fabrication Foundry are fully supported", () => {
    for (const d of [thoughts(), vessel(), foundry()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Parallel Thoughts: seven cards exiled in a face-down pile; each draw may take its top card instead", () => {
  const enter = () => {
    const { s: s0, ap, ids } = setup([thoughts()]);
    const picks = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"].map((n) => onTop(s0, ap, named(n)));
    const t = ids[0]!;
    let s = settle(run(s0, planCast(s0, ap, t)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 7 });
    s = act(s, { type: "searchLibrary", player: ap, found: picks });
    s = settle(s);
    return { s, ap, t, picks };
  };
  const pileOf = (s: GameState, t: string) => (s.linkedExile?.[`${t}@${s.objects[t]!.zoneChanges ?? 0}`] ?? []).map((l) => l.id);

  it("the search finds seven cards (CR 701.23d), exiled face down where nobody may look at them (CR 406.3), linked to it (CR 607.2a)", () => {
    const { s, t, picks } = enter();
    for (const id of picks) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    }
    expect([...pileOf(s, t)].sort()).toEqual([...picks].sort());
  });

  it("each draw asks: the pile's top card goes into the hand instead (not drawn, CR 614.6), or the card is drawn", () => {
    let { s, ap, t } = enter();
    const pile = pileOf(s, t);
    const top = s.players[ap]!.library[0]!;
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap, options: [`pthoughts:${t}`, "draw"] });
    s = act(s, { type: "drawInstead", player: ap, choice: `pthoughts:${t}` });
    expect(s.objects[pile[0]!]!.zone).toBe("hand");
    expect(s.objects[top]!.zone).toBe("library");
    // The next draw may just draw.
    draw(s, ap, 1);
    s = act(s, { type: "drawInstead", player: ap, choice: "draw" });
    expect(s.objects[top]!.zone).toBe("hand");
    expect(s.objects[pile[1]!]!.zone).toBe("exile");
  });

  it("two draws at once ask for each of them (CR 614.11a)", () => {
    let { s, ap, t } = enter();
    const pile = pileOf(s, t);
    draw(s, ap, 2);
    s = act(s, { type: "drawInstead", player: ap, choice: `pthoughts:${t}` });
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    s = act(s, { type: "drawInstead", player: ap, choice: `pthoughts:${t}` });
    expect(s.objects[pile[0]!]!.zone).toBe("hand");
    expect(s.objects[pile[1]!]!.zone).toBe("hand");
    expect(s.pending).toBeNull();
  });

  it("with the pile empty it may still replace a draw, and nothing happens: it skips the draw (rulings)", () => {
    let { s, ap, t, picks } = enter();
    for (const id of picks) {
      const o = s.objects[id]!;
      s.players[o.owner]!.exile.splice(s.players[o.owner]!.exile.indexOf(id), 1);
      o.zone = "graveyard";
      o.zoneChanges = (o.zoneChanges ?? 0) + 1;
      s.players[o.owner]!.graveyard.push(id);
    }
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", labels: [expect.stringContaining("empty"), "Draw the card"] });
    s = act(s, { type: "drawInstead", player: ap, choice: `pthoughts:${t}` });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("its pile is the one this object exiled: a Parallel Thoughts that left and came back has none (CR 607.2a, 400.7)", () => {
    let { s, ap, t } = enter();
    // Blinked: a new object with no pile of its own.
    const o = s.objects[t]!;
    o.zoneChanges = (o.zoneChanges ?? 0) + 2;
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", labels: [expect.stringContaining("empty"), "Draw the card"] });
    s = act(s, { type: "drawInstead", player: ap, choice: `pthoughts:${t}` });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("with Obstinate Familiar too, its controller chooses which applies (CR 616.1)", () => {
    const { s, ap, t } = enter();
    putOnBattlefield(s, ap, familiar());
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "drawInstead" }>;
    expect(p.options).toEqual(expect.arrayContaining([`pthoughts:${t}`, "draw"]));
    expect(p.options.some((k) => k.startsWith("mayskip:"))).toBe(true);
  });

  it("an opponent's draw isn't replaced", () => {
    const { s, ap } = enter();
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const hand = s.players[opp]!.hand.length;
    draw(s, opp, 1);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
  });

  it("a bot takes the pile's card while it has one", () => {
    let { s, ap, t } = enter();
    const pile = pileOf(s, t);
    draw(s, ap, 1);
    const acts = botActions(s, ap);
    expect(acts).toEqual([{ type: "drawInstead", player: ap, choice: `pthoughts:${t}` }]);
    s = act(s, acts[0]!);
    expect(s.objects[pile[0]!]!.zone).toBe("hand");
  });
});

describe("Memory Vessel: each player exiles seven cards and plays them, not cards from their hand, until your next turn", () => {
  const activateVessel = () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vessel());
    const tops = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.library.slice(0, 7)]));
    const s = settle(run(s0, planActivate(s0, ap, v, 0)));
    return { s, ap, v, tops };
  };

  it("each player's top seven cards are exiled face up, each player's own to play (CR 401.7); the Vessel was exiled as a cost", () => {
    const { s, ap, v, tops } = activateVessel();
    expect(s.objects[v]!.zone).toBe("exile");
    expect(s.objects[v]!.mayPlay).toBeUndefined();
    for (const p of s.turnOrder)
      for (const id of tops[p]!) {
        expect(s.objects[id]!.zone).toBe("exile");
        expect(s.objects[id]!.mayPlay).toMatchObject({ player: p, until: "yourNextTurn", ...(p === ap ? {} : { untilOf: ap }) });
      }
  });

  it("nobody plays cards from their hand, its controller included; the exiled cards can be played with the usual timing", () => {
    const { s, ap, tops } = activateVessel();
    const legal = legalActions(s, ap);
    const hand = s.players[ap]!.hand;
    expect(hand.length).toBeGreaterThan(0);
    expect(legal.some((a) => (a.type === "playLand" || a.type === "castSpell") && hand.includes(a.objectId))).toBe(false);
    // A Forest among the exiled cards: played from exile (a land play, CR 305.1).
    const land = tops[ap]!.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    expect(legal).toContainEqual({ type: "playLand", player: ap, objectId: land });
    const s2 = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s2.objects[land]!.zone).toBe("battlefield");
    // A card from the hand can't be played.
    const handLand = hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    if (handLand) expect(() => act(s, { type: "playLand", player: ap, objectId: handLand })).toThrow(/hand/);
  });

  it("on the next player's turn they too play only their exiled cards, not their hand", () => {
    const { s: s0, ap, tops } = activateVessel();
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const s = passUntil(s0, "main1", next);
    const legal = legalActions(s, next);
    const hand = s.players[next]!.hand;
    expect(legal.some((a) => (a.type === "playLand" || a.type === "castSpell") && hand.includes(a.objectId))).toBe(false);
    const land = tops[next]!.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    if (land) expect(legal).toContainEqual({ type: "playLand", player: next, objectId: land });
    // Another player's exiled cards aren't theirs to play.
    expect(legal.some((a) => a.type === "playLand" && tops[ap]!.includes(a.objectId))).toBe(false);
  });

  it("it all ends as its controller's next turn begins (CR 611.2b), and the permissions don't come back after that turn", () => {
    const { s: s0, ap, tops } = activateVessel();
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    expect(s.handPlayBansUntil).toBeUndefined();
    const left = tops[ap]!.filter((id) => s.objects[id]!.zone === "exile");
    expect(left.length).toBeGreaterThan(0);
    for (const id of left) expect(s.objects[id]!.mayPlay).toBeUndefined();
    for (const p of s.turnOrder) for (const id of tops[p]!) if (s.objects[id]!.zone === "exile") expect(s.objects[id]!.mayPlay).toBeUndefined();
    const hand = s.players[ap]!.hand;
    expect(legalActions(s, ap).some((a) => (a.type === "playLand" || a.type === "castSpell") && hand.includes(a.objectId))).toBe(true);
    // The next player's turn: still nothing from exile.
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    expect(legalActions(s, next).some((a) => a.type === "playLand" && tops[next]!.includes(a.objectId))).toBe(false);
  });

  it("a bot activates it in its main phase only with at most one card in hand", () => {
    const { s, ap } = setup([]);
    const v = putOnBattlefield(s, ap, vessel());
    const isVessel = (a: Action) => a.type === "activateAbility" && a.objectId === v;
    expect(s.players[ap]!.hand.length).toBeGreaterThan(1);
    expect(botActions(s, ap).some(isVessel)).toBe(false);
    for (const id of s.players[ap]!.hand.slice(1)) {
      s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
    }
    // With one card left, maybe after other plays first: it's among what the bot would do.
    let t = s;
    for (let i = 0; i < 10 && !botActions(t, ap).some(isVessel); i++) {
      const acts = botActions(t, ap);
      if (!acts.length || acts[0]!.type === "passPriority") break;
      for (const a of acts) t = act(t, a);
      t = settle(t);
    }
    expect(botActions(t, ap).some(isVessel)).toBe(true);
  });
});

describe("Fabrication Foundry: exile other artifacts with total mana value X, return an artifact card with mana value X or less", () => {
  const art = (name: string, cost: string) => card(name, "Artifact", cost);
  const make = () => {
    const { s, ap } = setup([]);
    const f = putOnBattlefield(s, ap, foundry());
    const one = putOnBattlefield(s, ap, art("Brass Widget", "{1}"));
    const two = putOnBattlefield(s, ap, art("Copper Widget", "{2}"));
    const four = putOnBattlefield(s, ap, art("Iron Widget", "{4}"));
    const toYard = (d: CardDef) => {
      const id = putOnBattlefield(s, ap, d);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
      return id;
    };
    const three = toYard(art("Silver Trinket", "{3}"));
    const five = toYard(art("Gold Trinket", "{5}"));
    const i = abilitiesOf(s, s.objects[f]!).activated.findIndex((a) => a.costs?.some((c) => c.kind === "sacrifice" && c.totalMvX));
    return { s, ap, f, i, one, two, four, three, five };
  };

  it("X = 3: Brass and Copper Widget (1 + 2) are exiled, and the mana value 3 artifact card returns", () => {
    const { s, ap, f, i, one, two, three } = make();
    expect(i).toBeGreaterThanOrEqual(0);
    const t = settle(run(s, planActivate(s, ap, f, i, [{ kind: "object", id: three }], undefined, undefined, 3, { sacrifice: [one, two] })));
    expect(t.objects[one]!.zone).toBe("exile");
    expect(t.objects[two]!.zone).toBe("exile");
    expect(t.objects[three]!.zone).toBe("battlefield");
    expect(t.objects[f]!.tapped).toBe(true);
  });

  it("the artifacts exiled must add up to X exactly, at least one of them, and not the Foundry itself (CR 601.2h)", () => {
    const { s, ap, f, i, one, two, four, three } = make();
    const t = [{ kind: "object" as const, id: three }];
    expect(abilityProblem(s, ap, f, i, t, undefined, undefined, 3, { sacrifice: [four] })).toMatch(/total mana value 3/);
    expect(abilityProblem(s, ap, f, i, t, undefined, undefined, 3, { sacrifice: [one] })).toMatch(/total mana value 3/);
    expect(abilityProblem(s, ap, f, i, t, undefined, undefined, 3, { sacrifice: [] })).toMatch(/total mana value 3/);
    expect(abilityProblem(s, ap, f, i, t, undefined, undefined, 3, { sacrifice: [f, one] })).toMatch(/total mana value 3/);
    expect(planActivate(s, ap, f, i, t, undefined, undefined, 3, { sacrifice: [one, two] })).not.toBeNull();
    // X = 4 with the Iron Widget alone, or with all three (7) for X = 7.
    expect(planActivate(s, ap, f, i, t, undefined, undefined, 4, { sacrifice: [four] })).not.toBeNull();
    expect(planActivate(s, ap, f, i, t, undefined, undefined, 7, { sacrifice: [one, two, four] })).not.toBeNull();
  });

  it("the target's mana value is X or less (CR 601.2c, after X is announced): the mana value 5 card needs X of 5 or more", () => {
    const { s, ap, f, i, one, four, five } = make();
    const t = [{ kind: "object" as const, id: five }];
    expect(abilityProblem(s, ap, f, i, t, undefined, undefined, 4, { sacrifice: [four] })).toMatch(/illegal target/);
    expect(planActivate(s, ap, f, i, t, undefined, undefined, 5, { sacrifice: [one, four] })).not.toBeNull();
  });

  it("an X no artifacts add up to can't be announced; with no other artifacts it can't be activated at all", () => {
    const { s, ap, f, i, one, two, four } = make();
    // 1, 2, 4: every total from 1 to 7 works, 8 doesn't.
    expect(planActivate(s, ap, f, i, undefined, undefined, undefined, 8)).toBeNull();
    expect(planActivate(s, ap, f, i, undefined, undefined, undefined, 6)).not.toBeNull();
    for (const id of [one, two, four]) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
    }
    expect(abilityProblem(s, ap, f, i)).not.toBeNull();
  });

  it("only as a sorcery (CR 602.5d)", () => {
    const { s, ap, f, i, one, two, three } = make();
    s.step = "beginCombat";
    expect(abilityProblem(s, ap, f, i, [{ kind: "object", id: three }], undefined, undefined, 3, { sacrifice: [one, two] })).not.toBeNull();
  });

  it("a bot in its second main phase brings back its most expensive artifact card for cheaper artifacts", () => {
    const { s, ap, f, one, four, five } = make();
    s.step = "main2";
    // Nothing else to do first: no cards in hand.
    for (const id of [...s.players[ap]!.hand]) {
      s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
    }
    // Whatever it does first (its commander), then the Foundry.
    let t = s;
    let a: Action | undefined;
    for (let n = 0; n < 10 && !a; n++) {
      const acts = botActions(t, ap);
      a = acts.find((x) => x.type === "activateAbility" && x.objectId === f);
      if (a || !acts.length || acts[0]!.type === "passPriority") break;
      for (const x of acts) t = act(t, x);
      t = settle(t);
    }
    expect(a).toMatchObject({ x: 5, targets: [{ kind: "object", id: five }], costs: { sacrifice: expect.arrayContaining([one, four]) } });
  });
});
