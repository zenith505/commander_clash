// Lane B round B202: Storm of Forms ("When you cast this spell, copy it for each kind of counter among permanents you
// control. You may choose new targets for the copies."), Tide of War ("Whenever one or more creatures block, flip a coin. If
// you win the flip, each blocking creature is sacrificed by its controller. If you lose the flip, each blocked creature is
// sacrificed by its controller."), Moorland Rescuer ("When this creature dies, return any number of other creature cards
// with total power X or less from your graveyard to the battlefield, where X is this creature's power. Exile this card."),
// Loki Laufeyson ("{1}, {T}: When you next cast an instant or sorcery spell with mana value less than or equal to Loki's
// power this turn, copy that spell. You may choose new targets for the copy.") and Darigaaz Reincarnated ("If Darigaaz would
// die, instead exile it with three egg counters on it." / "At the beginning of your upkeep, if this card is exiled with an
// egg counter on it, remove an egg counter from it. Then if this card has no egg counters on it, return it to the
// battlefield.") and Stitcher Geralf ("{2}{U}, {T}: Each player mills three cards. Exile up to two creature cards put into
// graveyards this way. Create an X/X blue Zombie creature token, where X is the total power of the cards exiled this way.").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const storm = (): CardDef => ({"oracleId":"e9a08492-3d2c-4c7a-8198-ef4193f5758a","name":"Storm of Forms","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"When you cast this spell, copy it for each kind of counter among permanents you control. You may choose new targets for the copies.\nReturn target nonland permanent to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e5e14342-bd45-4b3d-b4b5-ebc60dbc94ac.jpg?1783923321","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e5e14342-bd45-4b3d-b4b5-ebc60dbc94ac.jpg?1783923321","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tide = (): CardDef => ({"oracleId":"cb14b713-55e9-40cb-b769-6abe8e359580","name":"Tide of War","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever one or more creatures block, flip a coin. If you win the flip, each blocking creature is sacrificed by its controller. If you lose the flip, each blocked creature is sacrificed by its controller.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43b5bd60-87ed-41d2-bbcb-bd4a40a772c9.jpg?1783944293","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43b5bd60-87ed-41d2-bbcb-bd4a40a772c9.jpg?1783944293","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rescuer = (): CardDef => ({"oracleId":"f687a746-4807-41d5-848d-4053ddef6a76","name":"Moorland Rescuer","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"When this creature dies, return any number of other creature cards with total power X or less from your graveyard to the battlefield, where X is this creature's power. Exile this card.","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c293b8c-3ebc-4d14-b0a6-5e41d966cba1.jpg?1783925382","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c293b8c-3ebc-4d14-b0a6-5e41d966cba1.jpg?1783925382","commanderLegal":"legal","set":"mic","releasedAt":"2021-09-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const loki = (): CardDef => ({"oracleId":"9c78778a-6335-4949-8ade-11d0f085cb2b","name":"Loki Laufeyson","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — God Sorcerer Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God","Sorcerer","Villain"],"oracleText":"{1}, {T}: When you next cast an instant or sorcery spell with mana value less than or equal to Loki's power this turn, copy that spell. You may choose new targets for the copy.\nPower-up — {4}{R}: Put two +1/+1 counters on Loki. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Power-up"],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53b795a7-11f8-423a-b021-f811007fc82f.jpg?1783902928","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53b795a7-11f8-423a-b021-f811007fc82f.jpg?1783902928","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const darigaaz = (): CardDef => ({"oracleId":"c2f42c67-ff88-4248-bfa5-79a18c6473d5","name":"Darigaaz Reincarnated","manaCost":"{4}{B}{R}{G}","cmc":7,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying, trample, haste\nIf Darigaaz would die, instead exile it with three egg counters on it.\nAt the beginning of your upkeep, if this card is exiled with an egg counter on it, remove an egg counter from it. Then if this card has no egg counters on it, return it to the battlefield.","power":"7","toughness":"7","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Flying","Haste","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/9459ffca-5a1f-4641-88d4-8a499b261faa.jpg?1783934969","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/9459ffca-5a1f-4641-88d4-8a499b261faa.jpg?1783934969","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const geralf = (): CardDef => ({"oracleId":"da394a25-79c9-4b75-9ce6-741f64ae6913","name":"Stitcher Geralf","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{2}{U}, {T}: Each player mills three cards. Exile up to two creature cards put into graveyards this way. Create an X/X blue Zombie creature token, where X is the total power of the cards exiled this way.","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/156945db-4575-48ae-b9c9-e3b341353cd7.jpg?1783938871","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/156945db-4575-48ae-b9c9-e3b341353cd7.jpg?1783938871","commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

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
/** The first random state from which `go` gives a game `ok` accepts (coin flips come from it). */
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
/** Clear a player's hand (into the library), so a whole turn's cleanup has nothing to discard. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const doom = card("Test Doom", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const shock = card("Test Shock", "Instant", "{1}{R}", { cmc: 2, oracleText: "Test Shock deals 2 damage to any target." });
const blast = card("Test Blast", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Test Blast deals 3 damage to any target." });
const spark = card("Test Spark", "Instant", "{R}", { cmc: 1, oracleText: "Test Spark deals 1 damage to any target." });

describe("round B202 cards are supported", () => {
  it("compiles every line", () => supported(storm(), tide(), rescuer(), loki(), darigaaz(), geralf()));
});

describe("Storm of Forms", () => {
  it("is copied once for each kind of counter among permanents you control, not an opponent's", () => {
    const { s: s0, ap, ids, opp } = setup([storm()]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Countered Bear" }));
    s0.objects[a]!.counters["+1/+1"] = 2;
    const relic = putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{1}", { cmc: 1 }));
    s0.objects[relic]!.counters.charge = 1;
    s0.objects[relic]!.counters.shield = 1;
    const theirs = [1, 2, 3, 4].map((i) => putOnBattlefield(s0, opp, bear({ name: `Their Bear ${i}` })));
    // An opponent's stun counter is not among yours.
    s0.objects[theirs[3]!]!.counters.stun = 1;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs[0]!)])));
    // Three kinds: +1/+1, charge, shield.
    for (const t of [theirs[1]!, theirs[2]!, theirs[3]!]) {
      expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
      s = settle(act(s, { type: "copyTargets", player: ap, targets: [tgt(t)] }));
    }
    expect(s.pending).toBe(null);
    for (const t of theirs) expect(zoneOf(s, t)).toBe("hand");
  });
  it("isn't copied with no counters on your permanents", () => {
    const { s: s0, ap, ids, opp } = setup([storm()]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    s0.objects[theirs]!.counters["+1/+1"] = 1;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(s.pending).toBe(null);
    expect(zoneOf(s, theirs)).toBe("hand");
    expect(s.stack.length).toBe(0);
  });
});

describe("Tide of War", () => {
  /** You attack with two Bears; the next player blocks the first with one of theirs, or doesn't block. */
  const combat = (block: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tide());
    const [a1, a2] = [putOnBattlefield(s0, ap, bear({ name: "Attacker One" })), putOnBattlefield(s0, ap, bear({ name: "Attacker Two" }))] as const;
    const b = putOnBattlefield(s0, opp, bear({ name: "Their Blocker" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    for (let i = 0; i < 100 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: block ? [{ blocker: b, attacker: a1 }] : [] });
    for (let i = 0; i < 100 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    return { s, ap, opp, a1, a2, b };
  };
  it("a won flip: each blocking creature is sacrificed", () => {
    const { s, a1, a2, b } = combat(true);
    expect(s.stack.length + s.triggerQueue.length).toBe(1);
    const won = rigged(s, settle, (x) => zoneOf(x, b) === "graveyard");
    expect(zoneOf(won, a1)).toBe("battlefield");
    expect(zoneOf(won, a2)).toBe("battlefield");
    // Still blocked, its blocker gone (rulings).
    expect(won.objects[a1]!.blockedBy?.length ?? 0).toBe(0);
  });
  it("a lost flip: each blocked creature is sacrificed, not the unblocked one", () => {
    const { s, a1, a2, b } = combat(true);
    const lost = rigged(s, settle, (x) => zoneOf(x, a1) === "graveyard");
    expect(zoneOf(lost, a2)).toBe("battlefield");
    expect(zoneOf(lost, b)).toBe("battlefield");
  });
  it("doesn't trigger when no creature blocks", () => {
    const { s } = combat(false);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
  });
});

describe("Moorland Rescuer", () => {
  /** Rescuer (pumped by two +1/+1 counters, power 6) dies with creature cards of power 2, 3 and 4 in your graveyard. */
  const dies = () => {
    const { s: s0, ap, ids } = setup([doom]);
    const r = putOnBattlefield(s0, ap, rescuer());
    s0.objects[r]!.counters["+1/+1"] = 2;
    const two = into(s0, ap, bear({ name: "Two Bear" }), "graveyard");
    const three = into(s0, ap, bear({ name: "Three Bear", power: "3", toughness: "3" }), "graveyard");
    const four = into(s0, ap, bear({ name: "Four Bear", power: "4", toughness: "4" }), "graveyard");
    const big = into(s0, ap, bear({ name: "Seven Bear", power: "7", toughness: "7" }), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(r)])));
    return { s, ap, r, two, three, four, big };
  };
  it("uses its power as it last existed: any number of other creature cards with total power 6 or less", () => {
    const { s, ap, r, two, three, four, big } = dies();
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, totalPower: 6, min: 0 });
    if (s.pending?.kind !== "searchLibrary") return;
    // Neither ~ itself nor a card with power above 6 is offered.
    expect(s.pending.cards).not.toContain(r);
    expect(s.pending.cards).not.toContain(big);
    expect([...s.pending.cards].sort()).toEqual([two, three, four].sort());
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [three, four] })).toThrow(/total power 6 or less/);
    const done = settle(act(s, { type: "searchLibrary", player: ap, found: [two, four] }));
    expect(zoneOf(done, two)).toBe("battlefield");
    expect(zoneOf(done, four)).toBe("battlefield");
    expect(zoneOf(done, three)).toBe("graveyard");
    // Then ~ is exiled.
    expect(zoneOf(done, r)).toBe("exile");
  });
  it("still returns the cards if ~ has left the graveyard first (rulings)", () => {
    const { s: s0, ap, r, two, three } = dies();
    // ~ leaves the graveyard before the choice.
    const s = structuredClone(s0);
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(r), 1);
    s.objects[r]!.zone = "library";
    s.players[ap]!.library.unshift(r);
    s.objects[r]!.zoneChanges = (s.objects[r]!.zoneChanges ?? 0) + 1;
    const done = settle(act(s, { type: "searchLibrary", player: ap, found: [two, three] }));
    expect(zoneOf(done, two)).toBe("battlefield");
    expect(zoneOf(done, three)).toBe("battlefield");
    expect(zoneOf(done, r)).toBe("library");
  });
  it("a bot returns cards that fit the total", () => {
    const { s, ap } = dies();
    const acts = botActions(s, ap);
    expect(acts[0]?.type).toBe("searchLibrary");
    if (acts[0]?.type !== "searchLibrary" || s.pending?.kind !== "searchLibrary") return;
    const total = acts[0].found.reduce((n, id) => n + power(s, s.objects[id]!), 0);
    expect(acts[0].found.length).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(6);
    const done = settle(run(s, acts));
    expect(s.pending.cards.filter((id) => zoneOf(done, id) === "battlefield").length).toBe(acts[0].found.length);
  });
});

describe("Loki Laufeyson", () => {
  const ready = (hand: CardDef[]) => {
    const { s: s0, ap, ids, opp } = setup(hand);
    const l = putOnBattlefield(s0, ap, loki());
    const s = settle(run(s0, planActivate(s0, ap, l, 0)));
    return { s, ap, ids, opp, l };
  };
  it("copies the next instant or sorcery spell with mana value up to its power (2)", () => {
    const { s: s0, ap, ids, opp } = ready([shock]);
    expect(s0.objects[ids[0]!]).toBeDefined();
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(36);
  });
  it("a spell with greater mana value isn't copied and doesn't use it up", () => {
    const { s: s0, ap, ids, opp } = ready([blast, spark]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toBe(null);
    expect(s.players[opp]!.life).toBe(37);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(35);
  });
  it("reads its power as the spell is cast: pumped to 3, a mana value 3 spell is copied", () => {
    const { s: s0, ap, ids, opp, l } = ready([blast]);
    s0.objects[l]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(34);
  });
  it("gone from the battlefield (destroyed in response), its power as it last existed there", () => {
    const { s: s0, ap, ids, opp } = setup([doom, shock, blast]);
    const l = putOnBattlefield(s0, ap, loki());
    let s = run(s0, planActivate(s0, ap, l, 0));
    expect(s.stack.length).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(l)])));
    expect(zoneOf(s, l)).toBe("graveyard");
    // Power 2 as it last existed: Test Blast (3) isn't copied, Test Shock (2) is.
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toBe(null);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
  });
});

describe("Darigaaz Reincarnated", () => {
  it("dying, it's exiled with three egg counters instead", () => {
    const { s: s0, ap, ids } = setup([doom]);
    const d = putOnBattlefield(s0, ap, darigaaz());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(d)])));
    expect(zoneOf(s, d)).toBe("exile");
    expect(s.objects[d]!.counters.egg).toBe(3);
    expect(s.players[ap]!.graveyard).not.toContain(d);
  });
  /** Darigaaz in your exile with `eggs` egg counters, on to your next upkeep. */
  const toUpkeep = (eggs: number) => {
    const { s: s0, ap } = setup([]);
    const d = into(s0, ap, darigaaz(), "exile");
    if (eggs) s0.objects[d]!.counters.egg = eggs;
    emptyHand(s0, ap);
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    return { s, ap, d };
  };
  it("at your upkeep an egg counter is removed; with some left it stays exiled", () => {
    const { s, d } = toUpkeep(3);
    const after = settle(s);
    expect(zoneOf(after, d)).toBe("exile");
    expect(after.objects[d]!.counters.egg).toBe(2);
  });
  it("the last egg counter removed, it returns to the battlefield under its owner's control", () => {
    const { s, ap, d } = toUpkeep(1);
    const after = settle(s);
    expect(zoneOf(after, d)).toBe("battlefield");
    expect(after.objects[d]!.controller).toBe(ap);
    expect(after.objects[d]!.counters.egg ?? 0).toBe(0);
  });
  it("exiled without an egg counter, it doesn't trigger (rulings)", () => {
    const { s, d } = toUpkeep(0);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(zoneOf(settle(s), d)).toBe("exile");
  });
  it("checks again as it resolves: no egg counter by then, nothing happens", () => {
    const { s, d } = toUpkeep(1);
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    s.objects[d]!.counters = {};
    const after = settle(s);
    expect(zoneOf(after, d)).toBe("exile");
  });
});

describe("Stitcher Geralf", () => {
  /** Geralf on your battlefield; on top of each library three cards (the next player's start with Hill Giant, 3/3). */
  const ready = (extra?: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, geralf());
    if (extra) putOnBattlefield(s0, ap, extra);
    const old = into(s0, ap, bear({ name: "Old Bear", power: "5", toughness: "5" }), "graveyard");
    const tops: Record<number, ObjectId[]> = {};
    for (const pid of s0.turnOrder) {
      const names = pid === opp ? ["Hill Giant", "Their Forest", "Their Elf"] : [`Bear ${pid}`, `Land ${pid}`, `Land ${pid}b`];
      tops[pid] = names.reverse().map((n) => into(s0, pid, /Land|Forest/.test(n) ? card(n, "Land") : /Elf/.test(n) ? bear({ name: n, power: "1", toughness: "1" }) : /Giant/.test(n) ? bear({ name: n, power: "3", toughness: "3" }) : bear({ name: n }), "library")).reverse();
    }
    const s = settle(run(s0, planActivate(s0, ap, g, 0)));
    return { s, ap, opp, g, old, tops };
  };
  it("exiles up to two creature cards milled this way and makes an X/X Zombie, X their total power", () => {
    const { s, ap, opp, old, tops } = ready();
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    if (s.pending?.kind !== "searchLibrary") return;
    // Only creature cards milled this way: not the one already in your graveyard, not the lands.
    expect(s.pending.cards).not.toContain(old);
    expect(s.pending.cards).toContain(tops[opp]![0]);
    expect(s.pending.cards).toContain(tops[opp]![2]);
    expect(s.pending.cards).toHaveLength(5);
    const done = settle(act(s, { type: "searchLibrary", player: ap, found: [tops[opp]![0]!, tops[ap]![0]!] }));
    expect(zoneOf(done, tops[opp]![0]!)).toBe("exile");
    expect(zoneOf(done, tops[ap]![0]!)).toBe("exile");
    const zombie = done.battlefield.map((id) => done.objects[id]!).find((o) => o.isToken && done.cards[o.cardId]?.name === "Zombie Token");
    expect(zombie && `${power(done, zombie)}`).toBe("5");
  });
  it("with nothing exiled the Zombie is 0/0 and dies", () => {
    const { s, ap } = ready();
    const done = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(done.battlefield.some((id) => done.objects[id]!.isToken)).toBe(false);
  });
  it("cards a replacement exiled instead of milling into a graveyard can't be exiled this way (rulings)", () => {
    const voidE = card("Test Void", "Enchantment", "{1}{W}", { cmc: 2, oracleText: "If a card or token would be put into a graveyard from anywhere, exile it instead." });
    expect(isFullySupported(voidE)).toBe(true);
    const { s } = ready(voidE);
    expect(s.pending).toBe(null);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
});
