// Lane B round B201: Happily Ever After ("At the beginning of your upkeep, if there are five colors among permanents you
// control, there are six or more card types among permanents you control and/or cards in your graveyard, and your life
// total is greater than or equal to your starting life total, you win the game."), Delaying Shield ("At the beginning of
// your upkeep, remove all delay counters from this enchantment. For each delay counter removed this way, you lose 1 life
// unless you pay {1}{W}."), Crooked Scales ("{4}, {T}: Flip a coin. If you win the flip, destroy target creature an
// opponent controls. If you lose the flip, destroy target creature you control unless you pay {3} and repeat this
// process."), Liar's Pendulum ("{2}, {T}: Choose a card name. Target opponent guesses whether a card with that name is in
// your hand. You may reveal your hand. If you do and your opponent guessed wrong, draw a card."), Dust of Moments ("Remove
// two time counters from each permanent and each suspended card." / "Put two time counters on each permanent with a time
// counter on it and each suspended card.") and Power of Persuasion (a d20 table about the target, 20 | "Gain control of it
// until the end of your next turn.").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const happily = (): CardDef => ({"oracleId":"7a4cc57b-9f85-446c-9ca0-98c72b9bb732","name":"Happily Ever After","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, each player gains 5 life and draws a card.\nAt the beginning of your upkeep, if there are five colors among permanents you control, there are six or more card types among permanents you control and/or cards in your graveyard, and your life total is greater than or equal to your starting life total, you win the game.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d32d85d5-a6f0-4cc5-9fd6-6b329aae2e5b.jpg?1783932672","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d32d85d5-a6f0-4cc5-9fd6-6b329aae2e5b.jpg?1783932672","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pendulum = (): CardDef => ({"oracleId":"4f88ddfa-5478-426a-a978-dfc64c687db1","name":"Liar's Pendulum","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: Choose a card name. Target opponent guesses whether a card with that name is in your hand. You may reveal your hand. If you do and your opponent guessed wrong, draw a card.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/66372597-c182-4850-a630-231737b1482b.jpg?1783944515","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/66372597-c182-4850-a630-231737b1482b.jpg?1783944515","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const scales = (): CardDef => ({"oracleId":"49c47768-fcc7-4091-b06d-d8a2bd7d1cc9","name":"Crooked Scales","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{4}, {T}: Flip a coin. If you win the flip, destroy target creature an opponent controls. If you lose the flip, destroy target creature you control unless you pay {3} and repeat this process.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd7084ba-cca6-4fb9-b21b-b79e7d74c5c0.jpg?1783945914","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd7084ba-cca6-4fb9-b21b-b79e7d74c5c0.jpg?1783945914","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shield = (): CardDef => ({"oracleId":"e03b553a-3d0d-453e-ad3e-f7d4b9fb2624","name":"Delaying Shield","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If damage would be dealt to you, put that many delay counters on this enchantment instead.\nAt the beginning of your upkeep, remove all delay counters from this enchantment. For each delay counter removed this way, you lose 1 life unless you pay {1}{W}.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14e8195a-d0e4-4b11-b413-765ed1cae834.jpg?1783945280","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14e8195a-d0e4-4b11-b413-765ed1cae834.jpg?1783945280","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dust = (): CardDef => ({"oracleId":"41ccd197-aaec-45cb-9e8f-919c0fb54bb0","name":"Dust of Moments","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Remove two time counters from each permanent and each suspended card.\n• Put two time counters on each permanent with a time counter on it and each suspended card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/d/1d2c8f6f-8dcd-4b47-bc79-9657824cf1b7.jpg?1783943130","artUrl":"https://cards.scryfall.io/art_crop/front/1/d/1d2c8f6f-8dcd-4b47-bc79-9657824cf1b7.jpg?1783943130","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const persuasion = (): CardDef => ({"oracleId":"5c615c99-77b7-4bea-9286-1e8d257153fb","name":"Power of Persuasion","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target creature an opponent controls, then roll a d20.\n1—9 | Return it to its owner's hand.\n10—19 | Its owner puts it on their choice of the top or bottom of their library.\n20 | Gain control of it until the end of your next turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/d/8d84cb72-d0a0-4af0-aded-47e5fb7addef.jpg?1783926511","artUrl":"https://cards.scryfall.io/art_crop/front/8/d/8d84cb72-d0a0-4af0-aded-47e5fb7addef.jpg?1783926511","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The first random state from which `go` gives a game `ok` accepts (coin flips and die rolls come from it). */
const rigged = (s0: GameState, go: (s: GameState) => GameState, ok: (s: GameState) => boolean) => {
  for (let k = 1; k < 5000; k++) {
    const c = structuredClone(s0);
    c.rngState = k;
    const out = go(c);
    if (ok(out)) return out;
  }
  throw new Error("no random state gives that");
};
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
/** Answer a payUnless: paying taps lands for the cost first. */
const payOrNot = (s: GameState, pid: PlayerId, pay: boolean) => {
  const p = s.pending;
  if (p?.kind !== "payUnless") throw new Error("not asked to pay");
  return settle(run(s, [...(pay ? planMana(s, pid, parseManaCost(p.cost))! : []), { type: "payUnless", player: pid, pay }]));
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
/** Clear a player's hand (into the library), so a whole turn's cleanup has nothing to discard. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};

describe("round B201 cards are supported", () => {
  it("compiles every line", () => supported(happily(), pendulum(), scales(), shield(), dust(), persuasion()));
});

describe("Happily Ever After", () => {
  const colored = (c: string, i: number) => card(`Hue ${c} ${i}`, "Creature — Elf", `{${c}}`, { power: "1", toughness: "1" });
  const relic = card("Test Relic", "Artifact", "{1}", { cmc: 1 });
  const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1 });
  const rite = card("Test Rite", "Sorcery", "{B}", { cmc: 1 });
  const walker = card("Test Walker", "Legendary Planeswalker — Testa", "{3}", { cmc: 3, loyalty: "3" });
  /** You (the active player) to your next upkeep with Happily Ever After and five colors of creatures (Creature, Land,
   * Enchantment among your permanents), `extra` permanents and `yard` cards in your graveyard, at `life`. */
  const toUpkeep = (opts: { colors?: string[]; extra?: CardDef[]; yard?: CardDef[]; life?: number }) => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, happily());
    (opts.colors ?? ["W", "U", "B", "R", "G"]).forEach((c, i) => putOnBattlefield(s0, ap, colored(c, i)));
    for (const d of opts.extra ?? []) putOnBattlefield(s0, ap, d);
    for (const d of opts.yard ?? []) into(s0, ap, d, "graveyard");
    emptyHand(s0, ap);
    s0.players[ap]!.life = opts.life ?? 40;
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s.players[ap]!.life = opts.life ?? 40;
    return { s, ap };
  };
  it("its enters trigger: each player gains 5 life and draws a card", () => {
    const { s: s0, ap, ids } = setup([happily()]);
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(s0.turnOrder.map(() => 45));
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((n, i) => n + 1 - (s0.turnOrder[i] === ap ? 1 : 0)));
  });
  it("wins the game at your upkeep with five colors, six card types among permanents and graveyard, and 40 or more life", () => {
    const { s, ap } = toUpkeep({ extra: [relic], yard: [bolt, rite] });
    const won = settle(s);
    expect(won.winner).toBe(ap);
  });
  it("counts the card types of your permanents and your graveyard together", () => {
    // Creature, Land, Enchantment, Artifact on the battlefield; Instant, Planeswalker in the graveyard.
    const { s, ap } = toUpkeep({ extra: [relic], yard: [bolt, walker] });
    expect(settle(s).winner).toBe(ap);
    // Only five: Creature, Land, Enchantment, Instant, Sorcery.
    const five = toUpkeep({ yard: [bolt, rite] });
    expect(five.s.stack.length + five.s.triggerQueue.length).toBe(0);
    expect(settle(five.s).winner).toBe(null);
  });
  it("doesn't trigger with four colors or with less than your starting life total", () => {
    const four = toUpkeep({ colors: ["W", "U", "B", "R"], extra: [relic], yard: [bolt, rite] });
    expect(settle(four.s).winner).toBe(null);
    const low = toUpkeep({ extra: [relic], yard: [bolt, rite], life: 39 });
    expect(settle(low.s).winner).toBe(null);
  });
  it("checks again as it resolves (an intervening if): below 40 life by then, you don't win", () => {
    const { s, ap } = toUpkeep({ extra: [relic], yard: [bolt, rite] });
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    s.players[ap]!.life = 39;
    expect(settle(s).winner).toBe(null);
  });
});

describe("Delaying Shield", () => {
  it("each delay counter removed at your upkeep is its own payment: pay {1}{W} or lose 1 life", () => {
    const { s: s0, ap } = setup([]);
    const sh = putOnBattlefield(s0, ap, shield());
    emptyHand(s0, ap);
    s0.objects[sh]!.counters.delay = 3;
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    const answers = [true, false, false];
    const asked: string[] = [];
    for (const pay of answers) {
      expect(s.pending?.kind).toBe("payUnless");
      if (s.pending?.kind === "payUnless") asked.push(s.pending.cost);
      s = payOrNot(s, ap, pay);
    }
    expect(asked).toEqual(["{1}{W}", "{1}{W}", "{1}{W}"]);
    expect(s.pending).toBe(null);
    expect(s.players[ap]!.life).toBe(38);
    expect(s.objects[sh]!.counters.delay ?? 0).toBe(0);
  });
  it("its damage replacement puts that many delay counters on it instead", () => {
    const zap = card("Test Zap", "Instant", "{R}", { cmc: 1, oracleText: "Test Zap deals 3 damage to any target." });
    const { s: s0, ap, ids } = setup([zap]);
    const sh = putOnBattlefield(s0, ap, shield());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    s = settle(s);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.objects[sh]!.counters.delay).toBe(3);
  });
});

describe("Crooked Scales", () => {
  const ready = () => {
    const { s: s0, ap } = setup([]);
    const sc = putOnBattlefield(s0, ap, scales());
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const opp = others(s0, ap)[0]!;
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const s = run(s0, planActivate(s0, ap, sc, 0, [tgt(theirs), tgt(mine)]));
    return { s, ap, sc, mine, theirs };
  };
  it("needs both targets as it's activated", () => {
    const { s: s0, ap } = setup([]);
    const sc = putOnBattlefield(s0, ap, scales());
    putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    expect(planActivate(s0, ap, sc, 0)).toBe(null);
  });
  it("a won flip destroys the opponent's creature", () => {
    const { s, mine, theirs } = ready();
    const out = rigged(s, settle, (x) => zoneOf(x, theirs) === "graveyard");
    expect(zoneOf(out, mine)).toBe("battlefield");
    expect(out.pending).toBe(null);
  });
  it("a lost flip destroys your creature unless you pay {3}; paying flips again with the same targets", () => {
    const { s, ap, mine, theirs } = ready();
    // Lost, then (after paying) won.
    const lost = rigged(s, settle, (x) => x.pending?.kind === "payUnless");
    expect(lost.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{3}" });
    expect(zoneOf(lost, mine)).toBe("battlefield");
    expect(zoneOf(lost, theirs)).toBe("battlefield");
    const won = rigged(lost, (x) => payOrNot(x, ap, true), (x) => zoneOf(x, theirs) === "graveyard" && !x.pending);
    expect(zoneOf(won, mine)).toBe("battlefield");
    // Lost again after paying: asked again.
    const again = rigged(lost, (x) => payOrNot(x, ap, true), (x) => x.pending?.kind === "payUnless");
    expect(zoneOf(again, mine)).toBe("battlefield");
    // Declining destroys yours.
    const no = payOrNot(lost, ap, false);
    expect(zoneOf(no, mine)).toBe("graveyard");
    expect(zoneOf(no, theirs)).toBe("battlefield");
  });
});

describe("Liar's Pendulum", () => {
  const known = card("Known Card", "Sorcery", "{1}", { cmc: 1 });
  const ready = () => {
    const { s: s0, ap, ids } = setup([known]);
    const p = putOnBattlefield(s0, ap, pendulum());
    const opp = others(s0, ap)[0]!;
    let s = run(s0, planActivate(s0, ap, p, 0, [{ kind: "player", id: opp }]));
    s = settle(s);
    return { s, ap, opp, card: ids[0]! };
  };
  const name = (s: GameState, ap: PlayerId, n: string) => {
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    return settle(act(s, { type: "chooseOption", player: ap, choice: n }));
  };
  it("names a card, then the target opponent guesses, then you may reveal: a wrong guess draws a card", () => {
    const { s: s0, ap, opp } = ready();
    let s = name(s0, ap, "Known Card");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "liarGuess", options: ["in", "out"] });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "out" }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(logged(s, /guessed wrong/)).toBe(true);
  });
  it("a right guess draws nothing, and without revealing you never draw", () => {
    const { s: s0, ap, opp } = ready();
    let s = name(s0, ap, "Known Card");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "in" }));
    const hand = s.players[ap]!.hand.length;
    const right = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(right.players[ap]!.hand.length).toBe(hand);
    // A card not in hand, guessed in hand (wrong), but not revealed: no card.
    let t = name(ready().s, ap, "Grizzly Bears");
    t = settle(act(t, { type: "chooseOption", player: opp, choice: "in" }));
    const n = t.players[ap]!.hand.length;
    t = settle(act(t, { type: "chooseMay", player: ap, yes: false }));
    expect(t.players[ap]!.hand.length).toBe(n);
  });
  it("bots: the guesser goes by what it has seen; the namer reveals only when the guess was wrong", () => {
    const { s: s0, ap, opp } = ready();
    // A nonbasic card on the namer's battlefield can't be in their hand (singleton deck).
    let s = name(s0, ap, "Liar's Pendulum");
    expect(botActions(s, opp)).toEqual([{ type: "chooseOption", player: opp, choice: "out" }]);
    s = name(ready().s, ap, "Known Card");
    expect(botActions(s, opp)).toEqual([{ type: "chooseOption", player: opp, choice: "in" }]);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "in" }));
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    let w = name(ready().s, ap, "Known Card");
    w = settle(act(w, { type: "chooseOption", player: opp, choice: "out" }));
    expect(botActions(w, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
  });
});

describe("Dust of Moments", () => {
  const vanisher = card("Test Vanisher", "Creature — Spirit", "{1}{W}", { power: "3", toughness: "3", keywords: ["Vanishing"], oracleText: "Vanishing 3 (This creature enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)" });
  const rift = card("Test Rift", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Suspend 3—{R}\nTest Rift deals 1 damage to any target.", keywords: ["Suspend"], colors: ["R"] });
  const ready = () => {
    const { s: s0, ap, ids } = setup([dust()]);
    const opp = others(s0, ap)[0]!;
    const big = putOnBattlefield(s0, ap, vanisher);
    s0.objects[big]!.counters.time = 3;
    const small = putOnBattlefield(s0, opp, { ...vanisher, oracleId: "test-vanisher-2", name: "Other Vanisher" });
    s0.objects[small]!.counters.time = 1;
    const plain = putOnBattlefield(s0, opp, bear());
    const sus = into(s0, opp, rift, "exile");
    s0.objects[sus]!.counters.time = 2;
    const loose = into(s0, opp, { ...rift, oracleId: "test-rift-2", name: "Plain Rift", oracleText: "Plain Rift deals 1 damage to any target.", keywords: [] }, "exile");
    s0.objects[loose]!.counters.time = 2;
    invalidateCharacteristics(s0);
    return { s0, ap, opp, spell: ids[0]!, big, small, plain, sus, loose };
  };
  it("removes two time counters from each permanent and each suspended card, triggering the last ones", () => {
    const { s0, ap, opp, spell, big, small, plain, sus, loose } = ready();
    let s = run(s0, planCast(s0, ap, spell, [], [0]));
    for (let i = 0; i < 300 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[big]!.counters.time).toBe(1);
    // The 1-counter vanisher is sacrificed; the suspended card may be cast (suspend), the card without suspend keeps its counters.
    expect(s.objects[loose]!.counters.time).toBe(2);
    expect(s.objects[plain]!.counters.time ?? 0).toBe(0);
    // Suspend's cast ability for the opponent's card, and the vanishing sacrifice on the stack below it.
    expect(s.pending).toMatchObject({ kind: "castFree", player: opp, objectId: sus, how: "suspend" });
    expect(logged(s, /Other Vanisher's ability triggers \(Vanishing/)).toBe(true);
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay" || p?.kind === "castFree") s = act(s, { type: "chooseMay", player: p.player, yes: false });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zoneOf(s, small)).toBe("graveyard");
    expect(s.objects[sus]!.counters.time ?? 0).toBe(0);
  });
  it("puts two time counters on each permanent with a time counter and each suspended card", () => {
    const { s0, ap, spell, big, small, plain, sus, loose } = ready();
    const s = settle(run(s0, planCast(s0, ap, spell, [], [1])));
    expect(s.objects[big]!.counters.time).toBe(5);
    expect(s.objects[small]!.counters.time).toBe(3);
    expect(s.objects[plain]!.counters.time ?? 0).toBe(0);
    expect(s.objects[sus]!.counters.time).toBe(4);
    expect(s.objects[loose]!.counters.time).toBe(2);
  });
});

describe("Power of Persuasion", () => {
  const ready = () => {
    const { s: s0, ap, ids } = setup([persuasion()]);
    const opp = others(s0, ap)[0]!;
    const foe = putOnBattlefield(s0, opp, bear({ name: "Foe Bear" }));
    const s = run(s0, planCast(s0, ap, ids[0]!, [tgt(foe)]));
    return { s, ap, opp, foe };
  };
  it("targets only a creature an opponent controls", () => {
    const { s: s0, ap, ids } = setup([persuasion()]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    expect(planCast(s0, ap, ids[0]!, [tgt(mine)])).toBe(null);
  });
  it("1-9 returns it to its owner's hand", () => {
    const { s, opp, foe } = ready();
    const out = rigged(s, settle, (x) => zoneOf(x, foe) === "hand");
    expect(out.players[opp]!.hand).toContain(foe);
  });
  it("20 gains control of it until the end of your next turn", () => {
    const { s, ap, opp, foe } = ready();
    const out = rigged(s, settle, (x) => zoneOf(x, foe) === "battlefield" && controllerOf(x, x.objects[foe]!) === ap);
    expect(controllerOf(out, out.objects[foe]!)).toBe(ap);
    // Still yours on the next turns, back to its owner after your next turn's cleanup.
    let t = passUntil(out, "upkeep", others(out, ap)[0]!);
    expect(controllerOf(t, t.objects[foe]!)).toBe(ap);
    emptyHand(t, ap);
    t = passUntil(t, "end", ap);
    expect(controllerOf(t, t.objects[foe]!)).toBe(ap);
    t = passUntil(t, "upkeep", others(t, ap)[0]!);
    expect(controllerOf(t, t.objects[foe]!)).toBe(opp);
  });
});
