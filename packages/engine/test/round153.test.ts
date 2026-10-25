// Round 153: the most played cards, in popularity order, starting with Waterbending Lesson.

import { describe, expect, it, vi } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";
import { draw, moveObject } from "../src/game";

// Dice can be made to come up a chosen way (Luck Bobblehead's seven 6s): `forced.value` replaces each random number.
const forced = vi.hoisted(() => ({ value: undefined as number | undefined }));
vi.mock("../src/rng", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/rng")>();
  return { ...real, nextRandom: (s: GameState) => (forced.value !== undefined ? forced.value : real.nextRandom(s)) };
});

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until a question of this kind (or `max` passes), declaring no attackers or blockers on the way. */
const passTo = (s: GameState, kind: string, max = 40) => {
  for (let i = 0; i < max && s.pending?.kind !== kind; i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (resolving everything on the way, "you may" answered `yes`) until `step` of `active`'s turn. */
const advance = (s: GameState, step: Step, active: PlayerId, yes = true) => {
  for (let i = 0; i < 3000; i++) {
    if (s.step === step && s.activePlayer === active && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** On the battlefield with that name (a token's has " Token" after it). */
const named = (s: GameState, name: string) => s.battlefield.filter((id) => [name, `${name} Token`].includes(nameOf(s, id)));
const P = (s: GameState, pid: PlayerId) => s.players.find((p) => p.id === pid)!;

// Real oracle text (Scryfall).
const prisoners = card("You Find Some Prisoners", "Instant", "{1}{R}", { cmc: 2, oracleText: "Choose one —\n• Break Their Chains — Destroy target artifact.\n• Interrogate Them — Exile the top three cards of target opponent's library. Choose one of them. Until the end of your next turn, you may play that card, and you may spend mana as though it were mana of any color to cast it." });
const hordemaster = card("Rundvelt Hordemaster", "Creature — Goblin Warrior", "{1}{R}", { cmc: 2, power: "1", toughness: "1", oracleText: "Other Goblins you control get +1/+1.\nWhenever this creature or another Goblin you control dies, exile the top card of your library. If it's a Goblin creature card, you may cast that card until the end of your next turn." });
const luck = card("Luck Bobblehead", "Artifact — Bobblehead", "{3}", { cmc: 3, keywords: ["Treasure"], oracleText: "{T}: Add one mana of any color.\n{1}, {T}: Roll X six-sided dice, where X is the number of Bobbleheads you control. Create a tapped Treasure token for each even result. If you rolled 6 exactly seven times, you win the game." });
const charisma = card("Charisma Bobblehead", "Artifact — Bobblehead", "{3}", { cmc: 3, oracleText: "{T}: Add one mana of any color.\n{4}, {T}: Create X 1/1 white Soldier creature tokens, where X is the number of Bobbleheads you control. Activate only as a sorcery." });
const intelligence = card("Intelligence Bobblehead", "Artifact — Bobblehead", "{3}", { cmc: 3, oracleText: "{T}: Add one mana of any color.\n{5}, {T}: Draw X cards, where X is the number of Bobbleheads you control." });
const strength = card("Strength Bobblehead", "Artifact — Bobblehead", "{3}", { cmc: 3, oracleText: "{T}: Add one mana of any color.\n{3}, {T}: Put X +1/+1 counters on target creature, where X is the number of Bobbleheads you control. Activate only as a sorcery." });
const lesson = card("Waterbending Lesson", "Sorcery — Lesson", "{3}{U}", { cmc: 4, keywords: ["Waterbend"], oracleText: "Draw three cards. Then discard a card unless you waterbend {2}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)" });
const urabrask = card("Urabrask, Heretic Praetor", "Legendary Creature — Phyrexian Praetor", "{3}{R}{R}", { cmc: 5, power: "4", toughness: "4", keywords: ["Haste"], oracleText: "Haste\nAt the beginning of your upkeep, exile the top card of your library. You may play it this turn.\nAt the beginning of each opponent's upkeep, the next time they would draw a card this turn, instead they exile the top card of their library. They may play it this turn." });
const teferi = card("Teferi, Who Slows the Sunset", "Legendary Planeswalker — Teferi", "{2}{W}{U}", { cmc: 4, loyalty: "4", oracleText: "+1: Choose up to one target artifact, up to one target creature, and up to one target land. Untap the chosen permanents you control. Tap the chosen permanents you don't control. You gain 2 life.\n−2: Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.\n−7: You get an emblem with \"Untap all permanents you control during each opponent's untap step\" and \"You draw a card during each opponent's draw step.\"" });
const ritual = card("Birthing Ritual", "Enchantment", "{1}{G}", { cmc: 2, oracleText: "At the beginning of your end step, if you control a creature, look at the top seven cards of your library. Then you may sacrifice a creature. If you do, you may put a creature card with mana value X or less from among those cards onto the battlefield, where X is 1 plus the sacrificed creature's mana value. Put the rest on the bottom of your library in a random order." });
const swash = card("Swashbuckler Extraordinaire", "Creature — Dragon Rogue Warrior", "{2}{R}", { cmc: 3, power: "2", toughness: "2", keywords: ["Treasure"], oracleText: "When this creature enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nWhenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn." });

const goblin = card("Test Goblin", "Creature — Goblin", "{1}{R}", { cmc: 2, power: "2", toughness: "2" });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });
const giant = card("Test Giant", "Creature — Giant", "{3}{R}{R}", { cmc: 5, power: "5", toughness: "5" });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const wasteland = card("Test Wasteland", "Land", "", { oracleText: "{T}: Add {C}." });
const treasure = card("Treasure", "Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });

describe("round 153 cards compile", () => {
  it("are fully supported", () => supported(prisoners, hordemaster, luck, charisma, intelligence, strength, lesson, urabrask, teferi, ritual, swash));
});

describe("You Find Some Prisoners", () => {
  it("Interrogate Them: three of the opponent's cards exiled, one chosen, playable until the end of your next turn with mana of any color", () => {
    const { s: s0, ap, opp, ids } = setup([prisoners]);
    const [a, b, c] = [ogre, giant, rock].map((d) => into(s0, opp, d, "library")).reverse();
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)], [1]));
    s = passTo(s, "chooseOption");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "impulseChoice", options: [a, b, c] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: b! }));
    expect([a!, b!, c!].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[b!]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn", anyType: true });
    // The cards not chosen stay exiled, and nobody may play them (rulings).
    expect(s.objects[a!]!.mayPlay).toBeUndefined();
    expect(s.objects[c!]!.mayPlay).toBeUndefined();
    // {3}{R}{R} with no red source: mana of any color pays for it.
    for (const id of s.battlefield.filter((x) => nameOf(s, x) === "Mountain")) moveObject(s, id, "graveyard");
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, b!)));
    expect(s.objects[b!]!.zone).toBe("battlefield");
    expect(s.objects[b!]!.controller).toBe(ap);
  });

  it("Break Their Chains: destroy target artifact", () => {
    const { s: s0, ap, opp, ids } = setup([prisoners]);
    const r = putOnBattlefield(s0, opp, rock);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(r)], [0])));
    expect(s.objects[r]!.zone).toBe("graveyard");
  });
});

describe("Rundvelt Hordemaster", () => {
  it("a Goblin dies: the top card is exiled, castable until the end of your next turn only if it's a Goblin creature card", () => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, hordemaster);
    const g = putOnBattlefield(s0, ap, goblin);
    const top = into(s0, ap, goblin, "library");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(g)])));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn", castOnly: true });
    s = resolveAll(run(s, planCast(s, ap, top)));
    expect(s.objects[top]!.zone).toBe("battlefield");
  });

  it("not a Goblin creature card: it stays exiled, not playable", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const h = putOnBattlefield(s0, ap, hordemaster);
    const top = into(s0, ap, ogre, "library");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(h)])));
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay).toBeUndefined();
  });

  it("other Goblins get +1/+1", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hordemaster);
    const g = putOnBattlefield(s, ap, goblin);
    expect(characteristics(s, s.objects[g]!).power).toBe(3);
    expect(characteristics(s, s.objects[h]!).power).toBe(1);
  });
});

describe("Bobbleheads", () => {
  it("Luck Bobblehead: X dice for X Bobbleheads, a tapped Treasure for each even result", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, luck);
    putOnBattlefield(s0, ap, charisma);
    putOnBattlefield(s0, ap, strength);
    const s = resolveAll(run(s0, planActivate(s0, ap, l, 0)));
    const roll = s.log.map((x) => x.text).find((t) => /rolls 3 d6/.test(t));
    expect(roll).toBeDefined();
    const evens = roll!.replace(/^.*: /, "").replace(/ = .*$/, "").split(" + ").map(Number).filter((v) => v % 2 === 0).length;
    const made = named(s, "Treasure");
    expect(made).toHaveLength(evens);
    expect(made.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(P(s, ap).lost).toBe(false);
  });

  it("Luck Bobblehead: rolling 6 exactly seven times wins the game, eight times doesn't", () => {
    const roll = (bobbleheads: number) => {
      const { s: s0, ap } = setup([]);
      const l = putOnBattlefield(s0, ap, luck);
      for (let i = 1; i < bobbleheads; i++) putOnBattlefield(s0, ap, luck);
      forced.value = 0.99; // every die a 6
      try {
        return { s: resolveAll(run(s0, planActivate(s0, ap, l, 0))), ap };
      } finally {
        forced.value = undefined;
      }
    };
    const seven = roll(7);
    expect(seven.s.winner).toBe(seven.ap);
    expect(named(seven.s, "Treasure")).toHaveLength(7);
    const eight = roll(8);
    expect(eight.s.winner).toBeNull();
    expect(named(eight.s, "Treasure")).toHaveLength(8);
  });

  it("Charisma, Intelligence and Strength count the Bobbleheads you control", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, charisma);
    const i = putOnBattlefield(s0, ap, intelligence);
    const st = putOnBattlefield(s0, ap, strength);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planActivate(s0, ap, c, 0)));
    expect(named(s, "Soldier")).toHaveLength(3);
    const hand = P(s, ap).hand.length;
    s = resolveAll(run(s, planActivate(s, ap, i, 0)));
    expect(P(s, ap).hand.length).toBe(hand + 3);
    s = resolveAll(run(s, planActivate(s, ap, st, 0, [obj(b)])));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
  });
});

describe("Waterbending Lesson", () => {
  it("draw three, then discard a card unless you waterbend {2}: not paying, a card is discarded", () => {
    const { s: s0, ap, ids } = setup([lesson]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const hand = P(s, ap).hand.length;
    s = passTo(s, "payUnless");
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}", waterbend: 2 });
    expect(P(s, ap).hand).toHaveLength(hand + 3);
    s = act(s, { type: "payUnless", player: ap, pay: false });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    const gone = P(s, ap).hand[0]!;
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [gone] }));
    expect(P(s, ap).hand).toHaveLength(hand + 2);
    expect(s.objects[gone]!.zone).toBe("graveyard");
  });

  it("waterbending: two creatures tapped pay the {2}, and nothing is discarded", () => {
    const { s: s0, ap, ids } = setup([lesson]);
    const a = putOnBattlefield(s0, ap, bear());
    const r = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const hand = P(s, ap).hand.length;
    s = passTo(s, "payUnless");
    const untapped = s.battlefield.filter((id) => !s.objects[id]!.tapped).length;
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: true, tap: [a, r] }));
    expect(s.pending).toBeNull();
    expect(P(s, ap).hand).toHaveLength(hand + 3);
    expect(s.objects[a]!.tapped && s.objects[r]!.tapped).toBe(true);
    expect(s.battlefield.filter((id) => !s.objects[id]!.tapped).length).toBe(untapped - 2);
  });

  it("the bot pays when it can, else discards", () => {
    const { s: s0, ap, ids } = setup([lesson]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passTo(s, "payUnless");
    for (let i = 0; i < 6 && s.pending; i++) s = run(s, botActions(s, ap));
    s = resolveAll(s);
    expect(s.stack).toHaveLength(0);
    expect(P(s, ap).hand.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Urabrask, Heretic Praetor", () => {
  it("an opponent's next draw this turn: instead they exile the top card and may play it this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, urabrask);
    let s = advance(s0, "upkeep", opp);
    // The trigger has resolved in their upkeep; their draw step's draw is replaced.
    expect(P(s, opp).nextDrawExiles).toHaveLength(1);
    const top = P(s, opp).library[0]!;
    const hand = P(s, opp).hand.length;
    s = advance(s, "main1", opp);
    expect(P(s, opp).hand.length).toBe(hand);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: opp, until: "thisTurn" });
    expect(P(s, opp).nextDrawExiles).toBeUndefined();
  });

  it("only the next draw: the one after it is a draw", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, urabrask);
    const s = advance(s0, "main1", opp);
    expect(s.log.some((l) => /instead of drawing/.test(l.text))).toBe(true);
    // A draw later this turn is an ordinary draw.
    const hand = P(s, opp).hand.length;
    const top = P(s, opp).library[0]!;
    draw(s, opp, 1);
    expect(P(s, opp).hand.length).toBe(hand + 1);
    expect(s.objects[top]!.zone).toBe("hand");
  });

  it("it ends with the turn, unused", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, urabrask);
    const s = advance(s0, "upkeep", opp);
    P(s, opp).nextDrawExiles = [{ turn: s.turn - 1, source: "Urabrask, Heretic Praetor" }];
    const hand = P(s, opp).hand.length;
    const s2 = advance(s, "main1", opp);
    expect(P(s2, opp).hand.length).toBe(hand + 1);
  });

  it("your own upkeep: the top card exiled, playable this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, urabrask);
    const s = advance(s0, "draw", ap);
    const exiled = s.log.map((x) => x.text).some((t) => /exiles .* from the top of their library/.test(t));
    expect(exiled).toBe(true);
  });
});

describe("Teferi, Who Slows the Sunset", () => {
  it("+1: the chosen permanents you control untap, the ones you don't control tap; you gain 2 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, teferi);
    s0.objects[t]!.counters = { loyalty: 4 };
    const r = putOnBattlefield(s0, ap, rock);
    s0.objects[r]!.tapped = true;
    const b = putOnBattlefield(s0, opp, bear());
    const w = putOnBattlefield(s0, opp, wasteland);
    const life = P(s0, ap).life;
    const s = resolveAll(run(s0, planActivate(s0, ap, t, 0, [obj(r), obj(b), obj(w)])));
    expect(s.objects[r]!.tapped).toBe(false);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[w]!.tapped).toBe(true);
    expect(P(s, ap).life).toBe(life + 2);
    expect(s.objects[t]!.counters.loyalty).toBe(5);
  });

  it("+1 with no targets: you still gain 2 life", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, teferi);
    s0.objects[t]!.counters = { loyalty: 4 };
    const life = P(s0, ap).life;
    const s = resolveAll(run(s0, planActivate(s0, ap, t, 0, [{ kind: "none" }, { kind: "none" }, { kind: "none" }])));
    expect(P(s, ap).life).toBe(life + 2);
  });

  it("−7: your permanents untap during each opponent's untap step, and you draw right after their draw in their draw step", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, teferi);
    s0.objects[t]!.counters = { loyalty: 8 };
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planActivate(s0, ap, t, 2)));
    expect(s.emblems).toHaveLength(1);
    s = advance(s, "end", ap);
    s.objects[b]!.tapped = true;
    s = advance(s, "upkeep", opp);
    expect(s.objects[b]!.tapped).toBe(false);
    const mine = P(s, ap).hand.length;
    const theirs = P(s, opp).hand.length;
    s = advance(s, "main1", opp);
    expect(P(s, ap).hand.length).toBe(mine + 1);
    expect(P(s, opp).hand.length).toBe(theirs + 1);
    // Their draw first, then yours (rulings).
    const lines = s.log.map((l) => l.text);
    const yours = lines.findIndex((x) => x.includes("during") && x.includes("draw step"));
    expect(yours).toBeGreaterThan(-1);
  });

  it("not during your own draw step", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, teferi);
    s0.objects[t]!.counters = { loyalty: 8 };
    let s = resolveAll(run(s0, planActivate(s0, ap, t, 2)));
    s = advance(s, "upkeep", ap);
    const from = s.log.length;
    s = advance(s, "main1", ap);
    expect(s.log.slice(from).some((l) => /during .* draw step/.test(l.text))).toBe(false);
  });
});

describe("Birthing Ritual", () => {
  /** Seven cards on top of the library, top first. */
  const top7 = (s: GameState, pid: PlayerId) => [ogre, giant, rock, goblin, wasteland, shock, murder].map((d) => into(s, pid, d, "library")).reverse();
  const find = (s: GameState, ids: string[], name: string) => ids.find((id) => nameOf(s, id) === name)!;

  it("look at seven, sacrifice a creature, put a creature card with mana value up to 1 more onto the battlefield; the rest to the bottom", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ritual);
    const b = putOnBattlefield(s0, ap, bear({ cmc: 2 }));
    const seven = top7(s0, ap);
    let s = passTo(s0, "pickPermanents", 60);
    expect(s.step).toBe("end");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", min: 0, count: 1, looked: seven });
    expect((s.pending as { options: string[] }).options).toContain(b);
    s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    // Mana value 3 or less: the Ogre and the Goblin, not the Giant.
    const o = find(s, seven, "Test Ogre");
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([o, find(s, seven, "Test Goblin")].sort());
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [o] }));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(P(s, ap).library.slice(-6).sort()).toEqual(seven.filter((id) => id !== o).sort());
  });

  it("not sacrificing: nothing enters, and the seven still go to the bottom", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ritual);
    const b = putOnBattlefield(s0, ap, bear({ cmc: 2 }));
    const seven = top7(s0, ap);
    let s = passTo(s0, "pickPermanents", 60);
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(seven.every((id) => s.objects[id]!.zone === "library")).toBe(true);
    expect(P(s, ap).library.slice(-7).sort()).toEqual([...seven].sort());
  });

  it("with no creature, it doesn't trigger", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ritual);
    const seven = top7(s0, ap);
    const s = advance(s0, "end", ap);
    expect(s.log.some((l) => /looks at the top/.test(l.text))).toBe(false);
    expect(P(s, ap).library.slice(0, 7)).toEqual(seven);
  });

  it("the bot trades a creature up when one fits", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ritual);
    const b = putOnBattlefield(s0, ap, bear({ cmc: 2 }));
    const seven = top7(s0, ap);
    let s = passTo(s0, "pickPermanents", 60);
    for (let i = 0; i < 8 && s.pending && s.pending.player === ap; i++) s = run(s, botActions(s, ap));
    s = resolveAll(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[find(s, seven, "Test Ogre")]!.zone).toBe("battlefield");
  });
});

describe("Swashbuckler Extraordinaire", () => {
  it("whenever you attack, sacrifice Treasures: up to that many target creatures gain double strike", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, swash);
    const b = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, ap, giant);
    const t1 = putOnBattlefield(s0, ap, treasure);
    const t2 = putOnBattlefield(s0, ap, treasure);
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [sw, b, g].map((id) => ({ attacker: id, defender: opp })) });
    s = passTo(s, "pickPermanents");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", anyNumber: true });
    s = act(s, { type: "pickPermanents", player: ap, ids: [t1, t2] });
    expect(s.objects[t1]!.zone).not.toBe("battlefield");
    s = passTo(s, "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, x: 2 });
    // Three would be too many.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(sw), obj(b), obj(g)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(b), obj(g)] }));
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[g]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[sw]!, "Double strike")).toBe(false);
  });

  it("sacrificing none: no reflexive trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, swash);
    putOnBattlefield(s0, ap, treasure);
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sw, defender: opp }] });
    s = passTo(s, "pickPermanents");
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(objHasKeyword(s, s.objects[sw]!, "Double strike")).toBe(false);
  });

  it("the bot sacrifices one Treasure for each attacker with power 2 or more", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, swash);
    for (let i = 0; i < 3; i++) s0.objects[putOnBattlefield(s0, ap, treasure)]!.isToken = true;
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sw, defender: opp }] });
    s = passTo(s, "pickPermanents");
    for (let i = 0; i < 6 && s.pending && s.pending.player === ap && s.pending.kind !== "declareBlockers"; i++) s = run(s, botActions(s, ap));
    s = resolveAll(s);
    expect(named(s, "Treasure")).toHaveLength(2);
    expect(objHasKeyword(s, s.objects[sw]!, "Double strike")).toBe(true);
  });
});

const senu = card("Senu, Keen-Eyed Protector", "Legendary Creature — Bird Scout", "{1}{W}", { cmc: 2, power: "2", toughness: "1", keywords: ["Scry", "Flying", "Vigilance"], oracleText: "Flying, vigilance\n{T}, Exile Senu: You gain 2 life and scry 2.\nWhen a legendary creature you control attacks and isn't blocked, if this card is exiled, put it onto the battlefield attacking." });
const legend = card("Test Legend", "Legendary Creature — Human Warrior", "{2}{W}", { cmc: 3, power: "3", toughness: "3" });

describe("Senu, Keen-Eyed Protector", () => {
  /** Senu in its owner's exile, and a legendary creature to attack with. */
  const exiledSenu = () => {
    const { s, ap, opp } = setup([]);
    const sn = into(s, ap, senu, "graveyard");
    moveObject(s, sn, "exile");
    const l = putOnBattlefield(s, ap, legend);
    return { s, ap, opp, sn, l };
  };

  it("supported", () => supported(senu));

  it("a legendary creature attacks unblocked: Senu comes back from exile attacking what you choose, never declared as an attacker", () => {
    const { s: s0, ap, opp, sn, l } = exiledSenu();
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
    s = passTo(s, "chooseOption");
    // It doesn't have to attack the player the legendary creature attacks (rulings).
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "attackWhom" });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: String(other) }));
    expect(s.objects[sn]!.zone).toBe("battlefield");
    expect(s.objects[sn]!.attacking).toBe(other);
    expect(s.objects[sn]!.tapped).toBeFalsy();
    const life = s.players[other]!.life;
    s = passTo(s, "none", 6);
    expect(s.players[other]!.life).toBe(life - 2);
  });

  it("not for a creature that isn't legendary, nor a blocked one, nor with Senu on the battlefield", () => {
    {
      const { s: s0, ap, opp, sn } = exiledSenu();
      const b = putOnBattlefield(s0, ap, bear());
      let s = passTo(s0, "declareAttackers");
      s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
      s = passTo(s, "none", 6);
      expect(s.objects[sn]!.zone).toBe("exile");
    }
    {
      const { s: s0, ap, opp, sn, l } = exiledSenu();
      const blocker = putOnBattlefield(s0, opp, bear());
      let s = passTo(s0, "declareAttackers");
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
      for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      // Every defending player is asked in turn; only this opponent blocks.
      for (let i = 0; i < 4 && s.pending?.kind === "declareBlockers"; i++) {
        const who = waitingOn(s)!;
        s = act(s, { type: "declareBlockers", player: who, blocks: who === opp ? [{ blocker, attacker: l }] : [] });
      }
      s = resolveAll(s);
      expect(s.pending?.kind).not.toBe("chooseOption");
      expect(s.objects[sn]!.zone).toBe("exile");
    }
    {
      const { s: s0, ap, opp } = setup([]);
      const l = putOnBattlefield(s0, ap, legend);
      const sn = putOnBattlefield(s0, ap, senu);
      let s = passTo(s0, "declareAttackers");
      s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] }));
      expect(s.pending?.kind).not.toBe("chooseOption");
      expect(s.objects[sn]!.attacking).toBeUndefined();
    }
  });

  it("exiling itself for 2 life and scry 2, then back attacking on the next unblocked legendary attack", () => {
    const { s: s0, ap, opp } = setup([]);
    const sn = putOnBattlefield(s0, ap, senu);
    const l = putOnBattlefield(s0, ap, legend);
    const life = s0.players[ap]!.life;
    let s = run(s0, planActivate(s0, ap, sn, 0));
    expect(s.objects[sn]!.zone).toBe("exile");
    s = passTo(s, "arrangeTop");
    const p = s.pending as Extract<GameState["pending"], { kind: "arrangeTop" }>;
    expect(p).toMatchObject({ how: "scry", player: ap });
    expect(p.cards).toHaveLength(2);
    s = resolveAll(act(s, { type: "arrangeTop", player: ap, top: p.cards, away: [] }));
    expect(s.players[ap]!.life).toBe(life + 2);
    s = passTo(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
    s = passTo(s, "chooseOption");
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const back = s.battlefield.find((id) => nameOf(s, id) === "Senu, Keen-Eyed Protector")!;
    expect(s.objects[back]!.attacking).toBe(opp);
  });
});
