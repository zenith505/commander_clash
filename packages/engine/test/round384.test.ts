// Round 384: a council's dilemma that mills and exiles once for each vote (Fateful Tempest; CR 701.38a, 701.17, rulings),
// lands made Islands by flood counters each player puts on their own (Quicksilver Fountain; CR 305.7, 603.4, rulings), a
// trigger on an attacker that enlisted (Aradesh, the Founder; CR 702.154a, 603.4, rulings) and a secret number an opponent
// guesses (The Toymaker's Trap; CR 400.7, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const tempest = (): CardDef => ({"oracleId":"9d2f02f7-adcd-4d23-a051-ebca70f22ba5","name":"Fateful Tempest","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Council's dilemma — Starting with you, each player votes for past or present. You mill a card for each past vote, then Fateful Tempest deals damage to each opponent equal to the total mana value of cards milled this way. Exile the top card of your library for each present vote. Until the end of your next turn, you may play the exiled cards.","colors":["R"],"colorIdentity":["R"],"keywords":["Council's dilemma","Mill"]});
const fountain = (): CardDef => ({"oracleId":"0e7cf14a-6149-4ba9-b3f5-c5faf9f772bc","name":"Quicksilver Fountain","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player puts a flood counter on target non-Island land they control of their choice. That land is an Island for as long as it has a flood counter on it.\nAt the beginning of each end step, if all lands on the battlefield are Islands, remove all flood counters from them.","colors":[],"colorIdentity":[],"keywords":[]});
const aradesh = (): CardDef => ({"oracleId":"32620b26-10b9-47a7-bfa7-ca590ab5fa50","name":"Aradesh, the Founder","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Enlist (As this creature attacks, you may tap a nonattacking creature you control without summoning sickness. When you do, add its power to this creature's until end of turn.)\nWhenever a creature you control attacks, if it enlisted a creature this combat, the creature that attacked gains double strike until end of turn. If that creature's power is 4 or greater, draw a card.","power":"1","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Enlist"]});
const trap = (): CardDef => ({"oracleId":"8e93ea21-5e3f-448e-a175-96c8438c328e","name":"The Toymaker's Trap","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, secretly choose a number between 1 and 5 that hasn't been chosen. If you do, an opponent guesses which number you chose, then you reveal the number you chose. If they guessed wrong, they lose life equal to the number they guessed and you draw a card. If they guessed right, sacrifice this enchantment.","colors":["B"],"colorIdentity":["B"],"keywords":[]});
const cavalier = card("Argivian Cavalier", "Creature — Orc Knight", "{2}{W}", { power: "2", toughness: "2", keywords: ["Enlist"], oracleText: "Enlist (As this creature attacks, you may tap a nonattacking creature you control without summoning sickness. When you do, add its power to this creature's until end of turn.)\nWhen this creature enters, create a 1/1 white Soldier creature token." });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const titan = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });

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
/** A fresh card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** Passes to `step` of `pid`'s turn, stopping early at a trigger's target choice; bots answer any other question. */
const passTo = (s: GameState, step: GameState["step"], pid: PlayerId) => {
  for (let i = 0; i < 2000; i++) {
    if (s.step === step && s.activePlayer === pid) return s;
    if (s.pending?.kind === "chooseTargets") return s;
    const who = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (pend) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`never reached ${step}`);
};
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;

describe("round 384 cards compile", () => {
  it("every line is supported", () => {
    for (const d of [tempest(), fountain(), aradesh(), trap()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Fateful Tempest: a mill for each past vote and damage by the milled mana value, an exiled card to play for each present vote", () => {
  const cast = (votes: string[]) => {
    const { s: s0, ap, ids } = setup([tempest()]);
    // From the top: a 6-drop, a 3-drop, then the two cards a present vote would exile.
    const later = [onTop(s0, ap, bear({ name: "Second Bear" })), onTop(s0, ap, bear({ name: "First Bear" }))];
    const milled = [onTop(s0, ap, ogre), onTop(s0, ap, titan)];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const order = [ap, ...others(s, ap)];
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: order[i], options: ["past", "present"] });
      s = act(s, { type: "chooseOption", player: order[i]!, choice: votes[i]! });
    }
    return { s: settle(s), ap, ids, milled: milled.reverse(), later: later.reverse() };
  };

  it("two votes each: the top two cards milled, 6 + 3 damage to each opponent, then the next two exiled to play until the end of the caster's next turn", () => {
    const { s, ap, ids, milled, later } = cast(["past", "present", "past", "present"]);
    for (const id of milled) expect(s.objects[id]!.zone).toBe("graveyard");
    for (const pid of others(s, ap)) expect(s.players[pid]!.life).toBe(40 - 9);
    expect(s.players[ap]!.life).toBe(40);
    for (const id of later) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
    }
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("all present: nothing milled and no damage, four cards exiled to play", () => {
    const { s, ap, milled, later } = cast(["present", "present", "present", "present"]);
    for (const id of [...milled, ...later]) expect(s.objects[id]!.zone).toBe("exile");
    for (const pid of others(s, ap)) expect(s.players[pid]!.life).toBe(40);
  });

  it("all past: four cards milled (a 2-drop each below the top two), 13 damage to each opponent, nothing exiled", () => {
    const { s, ap, milled, later } = cast(["past", "past", "past", "past"]);
    for (const id of [...milled, ...later]) expect(s.objects[id]!.zone).toBe("graveyard");
    for (const pid of others(s, ap)) expect(s.players[pid]!.life).toBe(40 - 13);
    expect(s.players[ap]!.exile.length).toBe(0);
  });

  it("bots vote and the spell finishes", () => {
    const { s: s0, ap, ids } = setup([tempest()]);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)), -1 as PlayerId);
    expect(s.resolving).toBeFalsy();
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // The caster votes past (damage to three opponents), each opponent present (no damage to them).
    expect(s.log.some((l) => /votes? for past/.test(l.text))).toBe(true);
  });
});

describe("Quicksilver Fountain: each upkeep, that player floods a non-Island land of theirs", () => {
  it("the upkeep's player chooses the target among their own non-Island lands; it's only an Island while flooded, even after the Fountain leaves", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const fq = putOnBattlefield(s0, ap, fountain());
    const bForest = putOnBattlefield(s0, b, forest);
    const bIsland = putOnBattlefield(s0, b, island);
    let s = passTo(s0, "upkeep", b);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b, controller: ap });
    // Not an Island, not another player's land.
    expect(() => act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: bIsland }] })).toThrow();
    const apLand = s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land") && !subtypes(s, id).includes("Island"))!;
    expect(() => act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: apLand }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: bForest }] }));
    expect(s.objects[bForest]!.counters.flood).toBe(1);
    // An Island and only that: no longer a Forest (CR 305.7).
    expect(subtypes(s, bForest)).toEqual(["Island"]);
    expect(s.log.some((l) => /B puts a flood counter|flood counter/.test(l.text))).toBe(true);
    // The Fountain leaves: still an Island while the counter stays (rulings).
    s.battlefield.splice(s.battlefield.indexOf(fq), 1);
    s.objects[fq]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(fq);
    invalidateCharacteristics(s);
    expect(subtypes(s, bForest)).toEqual(["Island"]);
    delete s.objects[bForest]!.counters.flood;
    invalidateCharacteristics(s);
    expect(subtypes(s, bForest)).toEqual(["Forest"]);
  });

  it("with no non-Island land of theirs, no target and nothing happens; a bot chooses one of its own lands", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const c = next(s0, b);
    putOnBattlefield(s0, ap, fountain());
    putOnBattlefield(s0, b, island);
    const cForest = putOnBattlefield(s0, c, forest);
    let s = passTo(s0, "upkeep", b);
    // B has only an Island: no target, so the trigger is removed (CR 603.3d).
    expect(s.pending?.kind === "chooseTargets").toBe(false);
    s = passTo(s, "upkeep", c);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: c });
    for (const a of botActions(s, c)) s = act(s, a);
    s = settle(s);
    expect(s.objects[cForest]!.counters.flood).toBe(1);
    expect(subtypes(s, cForest)).toEqual(["Island"]);
  });

  it("at each end step, with every land on the battlefield an Island, all flood counters are removed", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    // Only Islands on the battlefield, and one Forest of B's.
    for (const id of [...s0.battlefield]) if (characteristics(s0, s0.objects[id]!).types.includes("Land") && !subtypes(s0, id).includes("Island")) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    invalidateCharacteristics(s0);
    putOnBattlefield(s0, ap, fountain());
    const f = putOnBattlefield(s0, b, forest);
    let s = passTo(s0, "upkeep", b);
    s = settle(act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: f }] }));
    expect(subtypes(s, f)).toEqual(["Island"]);
    s = passTo(s, "end", b);
    s = settle(s);
    expect(s.objects[f]!.counters.flood ?? 0).toBe(0);
    expect(subtypes(s, f)).toEqual(["Forest"]);
  });

  it("with a non-Island land on the battlefield, the end step trigger doesn't trigger", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, fountain());
    const f = putOnBattlefield(s0, b, forest);
    let s = passTo(s0, "upkeep", b);
    s = settle(act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: f }] }));
    s = passTo(s, "end", b);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = settle(s);
    expect(s.objects[f]!.counters.flood).toBe(1);
  });
});

describe("Aradesh, the Founder: double strike for an attacker that enlisted, and a card if its power is 4 or more", () => {
  const attack = (attackers: string[], s0: GameState, ap: PlayerId, opp: PlayerId) => {
    let s = passUntil(s0, "declareAttackers", ap);
    return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  };

  it("an attacker that enlisted a 3-power creature gets double strike; with enlist's +3 first, its power is 4 and you draw", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aradesh());
    const helper = putOnBattlefield(s0, ap, bear({ name: "Hill Bear", power: "3", toughness: "3" }));
    let s = attack([a], s0, ap, opp);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "enlist" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [helper] });
    const hand = s.players[ap]!.hand.length;
    s = settleBots(s, -1 as PlayerId);
    expect(objHasKeyword(s, s.objects[a]!, "Double strike")).toBe(true);
    expect(power(s, s.objects[a]!)).toBe(4);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("an attacker that didn't enlist: no trigger; another creature's enlist counts for that creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aradesh());
    const cav = putOnBattlefield(s0, ap, cavalier);
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    const helper = putOnBattlefield(s0, ap, bear({ name: "Hill Bear", power: "1", toughness: "1" }));
    let s = attack([a, cav, plain], s0, ap, opp);
    // Aradesh enlists nothing, the Cavalier the 1/1.
    for (let i = 0; i < 2 && s.pending?.kind === "pickPermanents"; i++) {
      const p = s.pending as { objectId?: string };
      s = act(s, { type: "pickPermanents", player: ap, ids: p.objectId === cav ? [helper] : [] });
    }
    const hand = s.players[ap]!.hand.length;
    s = settleBots(s, -1 as PlayerId);
    expect(objHasKeyword(s, s.objects[cav]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[a]!, "Double strike")).toBe(false);
    expect(objHasKeyword(s, s.objects[plain]!, "Double strike")).toBe(false);
    // The Cavalier is 3/2: no card.
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.log.filter((l) => /Aradesh, the Founder's ability (triggers|resolves)/.test(l.text)).length).toBeGreaterThan(0);
  });

  it("in a later combat, an earlier enlist doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aradesh());
    const helper = putOnBattlefield(s0, ap, bear({ name: "Hill Bear", power: "3", toughness: "3" }));
    let s = attack([a], s0, ap, opp);
    s = act(s, { type: "pickPermanents", player: ap, ids: [helper] });
    expect(s.enlistedThisCombat?.keys).toEqual([`${a}@0`]);
    // The next combat: a different combat number.
    s.combatsThisTurn = (s.combatsThisTurn ?? 0) + 1;
    expect(s.enlistedThisCombat!.combat).not.toBe(s.combatsThisTurn);
  });
});

describe("The Toymaker's Trap: a secret number, an opponent's guess", () => {
  const atUpkeep = () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, trap());
    // Around the table to ap's next upkeep.
    let s = s0;
    for (let i = 0; i < 4000 && !(s.pending?.kind === "chooseOption" && s.pending.what === "toyNumber"); i++) {
      const who = waitingOn(s)!;
      const pend = s.pending;
      if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
      else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
      else if (pend) for (const a of botActions(s, who)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: who });
    }
    return { s, ap, t };
  };

  it("a wrong guess: the guesser loses life equal to their guess and you draw; that number can't be chosen again", () => {
    let { s, ap, t } = atUpkeep();
    expect(s.step).toBe("upkeep");
    expect(s.activePlayer).toBe(ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "toyNumber", player: ap, options: ["1", "2", "3", "4", "5"] });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "6" })).toThrow();
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    // The number isn't in the log.
    expect(s.log.some((l) => /3/.test(l.text) && /secretly/.test(l.text))).toBe(false);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    const guesser = others(s, ap)[1]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(guesser) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "toyGuess", player: guesser, options: ["1", "2", "3", "4", "5"] });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseOption", player: guesser, choice: "4" }));
    expect(s.players[guesser]!.life).toBe(36);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.numbersChosenFor?.[`${t}@0`]).toEqual([3]);
    expect(s.log.some((l) => /guesses 4; \w+ reveals 3: the guess was wrong/.test(l.text))).toBe(true);
  });

  it("a right guess: the Trap is sacrificed, and nobody loses life or draws", () => {
    let { s, ap, t } = atUpkeep();
    s.numbersChosenFor = { [`${t}@0`]: [1, 2] };
    s = act(s, { type: "chooseOption", player: ap, choice: "5" });
    const guesser = others(s, ap)[0]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(guesser) });
    expect(s.pending).toMatchObject({ what: "toyGuess" });
    expect((s.pending as { prompt: string }).prompt).toMatch(/chosen before: 1, 2/);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseOption", player: guesser, choice: "5" }));
    expect(s.objects[t]!.zone).toBe("graveyard");
    expect(s.players[guesser]!.life).toBe(40);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("with all five numbers chosen for it, nothing happens at the next upkeep; a new object remembers none (CR 400.7)", () => {
    let { s, ap, t } = atUpkeep();
    s.numbersChosenFor = { [`${t}@0`]: [1, 2, 4, 5] };
    expect(s.pending).toMatchObject({ what: "toyNumber" });
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(others(s, ap)[0]) });
    s = settle(act(s, { type: "chooseOption", player: others(s, ap)[0]!, choice: "1" }));
    expect(s.numbersChosenFor[`${t}@0`]).toEqual([1, 2, 4, 5, 3]);
    // Around the table again: no number left, so no choice and no guess.
    const turn = s.turn;
    for (let i = 0; i < 4000 && !(s.turn > turn && s.activePlayer === ap && s.step === "draw"); i++) {
      expect(s.pending?.kind === "chooseOption" && (s.pending.what === "toyNumber" || s.pending.what === "toyGuess")).toBe(false);
      const who = waitingOn(s)!;
      const pend = s.pending;
      if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
      else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
      else if (pend) for (const a of botActions(s, who)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: who });
    }
    expect(s.log.some((l) => /Every number has been chosen for The Toymaker's Trap/.test(l.text))).toBe(true);
    expect(s.objects[t]!.zone).toBe("battlefield");
    // Another object (zone changes 1) would start a fresh list.
    expect(s.numbersChosenFor?.[`${t}@1`]).toBeUndefined();
  });

  it("bots choose and guess, and the game goes on", () => {
    let { s, ap } = atUpkeep();
    s = settleBots(s, -1 as PlayerId);
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /guesses [1-5]; \w+ reveals [1-5]/.test(l.text))).toBe(true);
    expect(s.activePlayer).toBe(ap);
  });
});
