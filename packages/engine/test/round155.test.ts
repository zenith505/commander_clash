// Round 155: the most played cards, in popularity order, starting with Mechtitan Core.

import { describe, expect, it, vi } from "vitest";
import { act, bear, card, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { hasNoMaxHandSize } from "../src/game";

// Dice can be made to come up a chosen way: `forced.value` replaces each random number (a d20 shows 1 + floor(v * 20)).
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
/** Passes to the declare attackers question of this turn. */
const toAttack = (s: GameState) => {
  for (let i = 0; i < 40 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending?.kind).toBe("declareAttackers");
  return s;
};
/** No blocks, then passes until combat damage is done. */
const throughDamage = (s: GameState) => {
  for (let i = 0; i < 40 && s.step !== "endCombat"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
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
/** Only these cards in the player's hand: the opening hand goes to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
  invalidateCharacteristics(s);
};
/** Nothing else for a bot to do: no hand, and its commander out of the command zone. */
const idle = (s: GameState, pid: PlayerId) => {
  onlyInHand(s, pid);
  const p = s.players[pid]!;
  for (const id of p.command) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.command = [];
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const P = (s: GameState, pid: PlayerId) => s.players.find((p) => p.id === pid)!;
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
/** Sacrifice a Treasure (or tap a rock) for one mana of this kind. */
const tapFor = (s: GameState, pid: PlayerId, id: string, mana: "W" | "U" | "B" | "R" | "G" | "C") => act(s, { type: "activateMana", player: pid, objectId: id, mana });
const indexOf = (s: GameState, id: string, text: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));

// Real oracle text (Scryfall).
const mechtitan = card("Mechtitan Core", "Artifact — Vehicle", "{2}", { cmc: 2, power: "2", toughness: "4", keywords: ["Crew"], oracleText: "{5}, Exile this Vehicle and four other artifact creatures and/or Vehicles you control: Create Mechtitan, a legendary 10/10 Construct artifact creature token with flying, vigilance, trample, lifelink, and haste that's all colors. When that token leaves the battlefield, return all cards exiled with this Vehicle except this card to the battlefield tapped under their owners' control.\nCrew 2" });
const kalain = card("Kalain, Reclusive Painter", "Legendary Creature — Human Elf Bard", "{B}{R}", { cmc: 2, power: "1", toughness: "2", oracleText: "When Kalain enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nOther creatures you control enter with an additional +1/+1 counter on them for each mana from a Treasure spent to cast them." });
const deck = card("The Deck of Many Things", "Legendary Artifact", "{5}", { cmc: 5, oracleText: "{2}, {T}: Roll a d20 and subtract the number of cards in your hand. If the result is 0 or less, discard your hand.\n1—9 | Return a card at random from your graveyard to your hand.\n10—19 | Draw two cards.\n20 | Put a creature card from any graveyard onto the battlefield under your control. When that creature dies, its owner loses the game." });
const moonmist = card("Moonmist", "Instant", "{1}{G}", { cmc: 2, oracleText: "Transform all Humans. Prevent all combat damage that would be dealt this turn by creatures other than Werewolves and Wolves. (Only double-faced cards can be transformed.)" });
const nerdRage = card("Nerd Rage", "Enchantment — Aura", "{2}{U}", { cmc: 3, oracleText: "Enchant creature\nWhen this Aura enters, draw two cards.\nEnchanted creature has \"You have no maximum hand size\" and \"Whenever this creature attacks, if you have ten or more cards in hand, it gets +10/+10 until end of turn.\"" });
const valefor = card("Summon: Valefor", "Enchantment Creature — Saga Drake", "{4}{U}", { cmc: 5, power: "5", toughness: "4", keywords: ["Flying"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Sonic Wings — Each opponent chooses a creature with the greatest mana value among creatures they control. Return those creatures to their owners' hands.\nII, III, IV — Tap up to one target creature and put a stun counter on it.\nFlying" });
const coin = card("Coin of Mastery", "Artifact", "{4}", { cmc: 4, oracleText: "Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it.\n{T}: Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const minstrel = card("The Wandering Minstrel", "Legendary Creature — Human Bard", "{G}{U}", { cmc: 2, power: "1", toughness: "3", oracleText: "Lands you control enter untapped.\nThe Minstrel's Ballad — At the beginning of combat on your turn, if you control five or more Towns, create a 2/2 Elemental creature token that's all colors.\n{3}{W}{U}{B}{R}{G}: Other creatures you control get +X/+X until end of turn, where X is the number of Towns you control." });

const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const giant = card("Test Giant", "Creature — Giant", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
const golem = (i: number) => card(`Test Golem ${i}`, "Artifact Creature — Golem", "{2}", { cmc: 2, power: "2", toughness: "2" });
const cart = card("Test Cart", "Artifact — Vehicle", "{1}", { cmc: 1, power: "3", toughness: "3", keywords: ["Crew"], oracleText: "Crew 1" });
const thopter = card("Thopter", "Token Artifact Creature — Thopter", "", { power: "1", toughness: "1", keywords: ["Flying"] });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const wolf = card("Test Wolf", "Creature — Wolf", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const townA = card("Test Town", "Land — Town", "", { oracleText: "{T}: Add {C}." });
const villager = scry("transform", [
  { name: "Test Villager", mana_cost: "{1}{G}", type_line: "Creature — Human Werewolf", power: "2", toughness: "2", oracle_text: "" },
  { name: "Test Howler", type_line: "Creature — Werewolf", power: "4", toughness: "4", oracle_text: "", color_indicator: ["G"] },
], { keywords: ["Transform"] });
const human = card("Test Human", "Creature — Human", "{W}", { cmc: 1, power: "1", toughness: "1" });

describe("round 155 cards", () => {
  it("are fully supported", () => supported(mechtitan, kalain, deck, moonmist, nerdRage, valefor, coin, minstrel));
});

describe("Mechtitan Core", () => {
  const board = (s: GameState, ap: PlayerId) => {
    const core = putOnBattlefield(s, ap, mechtitan);
    const g = [1, 2, 3].map((i) => putOnBattlefield(s, ap, golem(i)));
    const c = putOnBattlefield(s, ap, cart);
    return { core, g, c };
  };

  it("exiles itself and four other artifact creatures and/or Vehicles, and makes a legendary 10/10 that's all colors", () => {
    const { s: s0, ap } = setup([]);
    const { core, g, c } = board(s0, ap);
    const i = indexOf(s0, core, /^\{5\}/);
    let s = resolveAll(run(s0, planActivate(s0, ap, core, i, [], undefined, undefined, undefined, { sacrifice: [...g, c] })));
    for (const id of [core, ...g, c]) expect(s.objects[id]!.zone).toBe("exile");
    const titan = s.battlefield.find((id) => nameOf(s, id) === "Mechtitan")!;
    expect(titan).toBeDefined();
    const ch = characteristics(s, s.objects[titan]!);
    expect(ch.colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(ch.supertypes).toContain("Legendary");
    expect(ch.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, titan)).toBe("10/10");
    for (const k of ["Flying", "Vigilance", "Trample", "Lifelink", "Haste"]) expect(objHasKeyword(s, s.objects[titan]!, k)).toBe(true);
    // The token leaves: the four come back tapped under their owners' control, Mechtitan Core stays in exile.
    const kill = into(s, ap, murder, "hand");
    s = resolveAll(run(s, planCast(s, ap, kill, [obj(titan)])));
    for (const id of [...g, c]) {
      const back = s.battlefield.find((b) => nameOf(s, b) === nameOf(s0, id));
      expect(back, nameOf(s0, id)).toBeDefined();
      expect(s.objects[back!]!.tapped).toBe(true);
      expect(s.objects[back!]!.controller).toBe(ap);
    }
    expect(s.players[ap]!.exile.some((id) => nameOf(s, id) === "Mechtitan Core")).toBe(true);
  });

  it("a token exiled for the cost is gone; another player's card comes back under its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const { core, g } = board(s0, ap);
    const t = putOnBattlefield(s0, ap, thopter);
    s0.objects[t]!.isToken = true;
    // A Golem Test Golem 3 owned by an opponent, controlled by you.
    s0.objects[g[2]!]!.owner = opp;
    invalidateCharacteristics(s0);
    const i = indexOf(s0, core, /^\{5\}/);
    let s = resolveAll(run(s0, planActivate(s0, ap, core, i, [], undefined, undefined, undefined, { sacrifice: [g[0]!, g[1]!, g[2]!, t] })));
    expect(s.objects[t]).toBeUndefined();
    const titan = s.battlefield.find((id) => nameOf(s, id) === "Mechtitan")!;
    const kill = into(s, ap, murder, "hand");
    s = resolveAll(run(s, planCast(s, ap, kill, [obj(titan)])));
    const back3 = s.battlefield.find((b) => nameOf(s, b) === "Test Golem 3")!;
    expect(s.objects[back3]!.controller).toBe(opp);
    expect(s.battlefield.filter((b) => nameOf(s, b) === "Thopter")).toHaveLength(0);
  });

  it("can't be activated with fewer than four other artifact creatures and/or Vehicles; a plain creature doesn't count", () => {
    const { s, ap } = setup([]);
    const core = putOnBattlefield(s, ap, mechtitan);
    const g = [1, 2, 3].map((i) => putOnBattlefield(s, ap, golem(i)));
    const b = putOnBattlefield(s, ap, bear());
    const i = indexOf(s, core, /^\{5\}/);
    expect(planActivate(s, ap, core, i, [], undefined, undefined, undefined, { sacrifice: [...g, b] })).toBeNull();
  });
});

describe("Kalain, Reclusive Painter", () => {
  it("other creatures enter with a +1/+1 counter for each mana from a Treasure spent to cast them", () => {
    const { s: s0, ap, ids } = setup([giant, giant]);
    putOnBattlefield(s0, ap, kalain);
    const t1 = putOnBattlefield(s0, ap, treasure);
    const t2 = putOnBattlefield(s0, ap, treasure);
    let s = tapFor(s0, ap, t1, "R");
    s = tapFor(s, ap, t2, "R");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, ids[0]!)).toBe("5/5");
    // Paid with lands only: none.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("its own enters trigger makes a Treasure, and it gets no counters itself", () => {
    const { s: s0, ap, ids } = setup([kalain]);
    const t1 = putOnBattlefield(s0, ap, treasure);
    let s = tapFor(s0, ap, t1, "B");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && nameOf(s, id).startsWith("Treasure"))).toHaveLength(1);
  });

  it("a creature put onto the battlefield without being cast gets none", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kalain);
    const g = into(s0, ap, giant, "graveyard");
    const reanimate = card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, oracleText: "Return target creature card from your graveyard to the battlefield." });
    const r = into(s0, ap, reanimate, "hand");
    const t1 = putOnBattlefield(s0, ap, treasure);
    let s = tapFor(s0, ap, t1, "B");
    s = resolveAll(run(s, planCast(s, ap, r, [obj(g)])));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Coin of Mastery", () => {
  it("counts mana from artifact sources, Treasures included, not from lands", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    putOnBattlefield(s0, ap, coin);
    const r = putOnBattlefield(s0, ap, rock);
    const t = putOnBattlefield(s0, ap, treasure);
    let s = tapFor(s0, ap, r, "C");
    s = tapFor(s, ap, t, "R");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("makes a Treasure", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, coin);
    const before = s0.battlefield.length;
    const s = resolveAll(run(s0, planActivate(s0, ap, c, 0)));
    expect(s.battlefield.length).toBe(before + 1);
  });
});

describe("The Deck of Many Things", () => {
  const roll = (n: number) => (n - 1 + 0.5) / 20;
  const activateDeck = (s: GameState, ap: PlayerId, d: string) => run(s, planActivate(s, ap, d, 0));

  it("a result of 0 or less discards your hand (the result is the roll minus your hand size, CR 706.2)", () => {
    const { s: s0, ap, ids } = setup([giant, giant, giant]);
    onlyInHand(s0, ap, ids);
    const d = putOnBattlefield(s0, ap, deck);
    forced.value = roll(2);
    try {
      const s = resolveAll(activateDeck(s0, ap, d));
      expect(s.players[ap]!.hand).toHaveLength(0);
      expect(s.players[ap]!.graveyard.filter((id) => nameOf(s, id) === "Test Giant")).toHaveLength(3);
    } finally {
      forced.value = undefined;
    }
  });

  it("1—9: a card at random from your graveyard to your hand", () => {
    const { s: s0, ap } = setup([]);
    onlyInHand(s0, ap);
    const d = putOnBattlefield(s0, ap, deck);
    const g = into(s0, ap, giant, "graveyard");
    forced.value = roll(5);
    try {
      const s = resolveAll(activateDeck(s0, ap, d));
      expect(s.objects[g]!.zone).toBe("hand");
    } finally {
      forced.value = undefined;
    }
  });

  it("10—19: draw two cards; with a card in hand, a natural 11 is a 10", () => {
    const { s: s0, ap, ids } = setup([giant]);
    onlyInHand(s0, ap, ids);
    const d = putOnBattlefield(s0, ap, deck);
    forced.value = roll(11);
    try {
      const s = resolveAll(activateDeck(s0, ap, d));
      expect(s.players[ap]!.hand).toHaveLength(3);
    } finally {
      forced.value = undefined;
    }
  });

  it("20: a creature card from any graveyard; when it dies, its owner loses the game", () => {
    const { s: s0, ap, opp } = setup([]);
    onlyInHand(s0, ap);
    const d = putOnBattlefield(s0, ap, deck);
    const theirs = into(s0, opp, ogre, "graveyard");
    into(s0, ap, giant, "graveyard");
    forced.value = roll(20);
    let s: GameState;
    try {
      s = resolveAll(activateDeck(s0, ap, d));
    } finally {
      forced.value = undefined;
    }
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect((s.pending as { cards: string[] }).cards).toContain(theirs);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    expect(P(s, opp).lost).toBeFalsy();
    const kill = into(s, ap, murder, "hand");
    s = resolveAll(run(s, planCast(s, ap, kill, [obj(theirs)])));
    // Its owner, not the player who controlled it.
    expect(P(s, opp).lost).toBe(true);
    expect(P(s, ap).lost).toBeFalsy();
  });

  it("20 with your own card: you lose when it dies", () => {
    const { s: s0, ap } = setup([]);
    onlyInHand(s0, ap);
    const d = putOnBattlefield(s0, ap, deck);
    const mine = into(s0, ap, giant, "graveyard");
    forced.value = roll(20);
    let s: GameState;
    try {
      s = resolveAll(activateDeck(s0, ap, d));
    } finally {
      forced.value = undefined;
    }
    if (s.pending?.kind === "searchLibrary") s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [mine] }));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    const kill = into(s, ap, murder, "hand");
    s = resolveAll(run(s, planCast(s, ap, kill, [obj(mine)])));
    expect(P(s, ap).lost).toBe(true);
  });
});

describe("Moonmist", () => {
  it("transforms every double-faced Human, and only Werewolves and Wolves deal combat damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([moonmist]);
    const v = putOnBattlefield(s0, ap, villager);
    const h = putOnBattlefield(s0, ap, human);
    const w = putOnBattlefield(s0, ap, wolf);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(nameOf(s, v)).toBe("Test Howler");
    expect(nameOf(s, h)).toBe("Test Human");
    const life = P(s, opp).life;
    s = toAttack(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [v, h, w, b].map((attacker) => ({ attacker, defender: opp })) });
    s = throughDamage(s);
    // The Howler (now a Werewolf, 4) and the Wolf (2); the Human and the Bear deal none.
    expect(P(s, opp).life).toBe(life - 6);
  });
});

describe("Nerd Rage", () => {
  it("draws two; the enchanted creature's controller has no maximum hand size and it gets +10/+10 attacking with ten or more cards in hand", () => {
    const { s: s0, ap, ids, opp } = setup([nerdRage]);
    onlyInHand(s0, ap, ids);
    const b = putOnBattlefield(s0, ap, bear());
    for (let i = 0; i < 8; i++) into(s0, ap, giant, "hand");
    expect(hasNoMaxHandSize(s0, ap)).toBe(false);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)])));
    // 8 + 2 drawn.
    expect(s.players[ap]!.hand).toHaveLength(10);
    expect(hasNoMaxHandSize(s, ap)).toBe(true);
    expect(hasNoMaxHandSize(s, opp)).toBe(false);
    s = toAttack(s);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    expect(pt(s, b)).toBe("12/12");
  });

  it("with fewer than ten cards in hand the attack trigger does nothing (an intervening if, CR 603.4)", () => {
    const { s: s0, ap, ids, opp } = setup([nerdRage]);
    onlyInHand(s0, ap, ids);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)])));
    s = toAttack(s);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    expect(pt(s, b)).toBe("2/2");
  });

  it("on an opponent's creature, that opponent has no maximum hand size (CR 109.5)", () => {
    const { s: s0, ap, ids, opp } = setup([nerdRage]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(theirs)])));
    expect(hasNoMaxHandSize(s, opp)).toBe(true);
    expect(hasNoMaxHandSize(s, ap)).toBe(false);
  });
});

describe("Summon: Valefor", () => {
  it("chapter I: each opponent chooses a creature with the greatest mana value they control; those return to their owners' hands", () => {
    const { s: s0, ap, ids } = setup([valefor]);
    const [b1, b2] = others(s0, ap);
    const small = putOnBattlefield(s0, b1!, bear());
    const big = putOnBattlefield(s0, b1!, ogre);
    const g1 = putOnBattlefield(s0, b2!, giant);
    const g2 = putOnBattlefield(s0, b2!, card("Test Giant Two", "Creature — Giant", "{1}{R}{R}", { cmc: 3, power: "3", toughness: "3" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    // Two tied for the greatest: that opponent chooses.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b2, count: 1 });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([g1, g2].sort());
    s = resolveAll(act(s, { type: "pickPermanents", player: b2!, ids: [g2] }));
    expect(s.objects[big]!.zone).toBe("hand");
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[g2]!.zone).toBe("hand");
    expect(s.objects[g1]!.zone).toBe("battlefield");
    // Valefor itself is a 5/4 flier with a lore counter.
    expect(s.objects[ids[0]!]!.counters.lore).toBe(1);
  });
});

describe("The Wandering Minstrel", () => {
  it("with five or more Towns, makes a 2/2 Elemental that's all colors at the beginning of combat", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, minstrel);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, townA);
    let s = s0;
    for (let i = 0; i < 40 && s.step !== "beginCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(s);
    const el = s.battlefield.find((id) => nameOf(s, id).startsWith("Elemental"));
    expect(el).toBeDefined();
    expect(characteristics(s, s.objects[el!]!).colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
  });
});

describe("bots", () => {
  it("keep their hand rather than gamble it on The Deck of Many Things with a full hand", () => {
    const { s: s1, ap, ids } = setup([giant, giant, giant, giant]);
    idle(s1, ap);
    for (const id of ids) {
      s1.objects[id]!.zone = "hand";
      s1.players[ap]!.hand.push(id);
    }
    const d = putOnBattlefield(s1, ap, deck);
    let s = s1;
    for (let i = 0; i < 40 && s.step !== "main2"; i++) s = s.pending?.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: ap, attacks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    // Tap the lands: no Giant to cast either.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === ap && s.cards[s.objects[x]!.cardId]!.types.includes("Land")).slice(0, 2)) s.objects[id]!.tapped = false;
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === d)).toBe(false);
  });
});

describe("bots and Mechtitan Core", () => {
  it("make Mechtitan in their first main phase from small artifact creatures", () => {
    const { s, ap } = setup([]);
    idle(s, ap);
    const core = putOnBattlefield(s, ap, mechtitan);
    [1, 2, 3, 4].map((i) => putOnBattlefield(s, ap, golem(i)));
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === core && (a.costs?.sacrifice?.length ?? 0) === 4)).toBe(true);
  });

  it("not when the four are worth more than the 10/10", () => {
    const { s, ap } = setup([]);
    idle(s, ap);
    const core = putOnBattlefield(s, ap, mechtitan);
    [1, 2, 3, 4].map((i) => putOnBattlefield(s, ap, card(`Test Colossus ${i}`, "Artifact Creature — Golem", "{6}", { cmc: 6, power: "6", toughness: "6" })));
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === core)).toBe(false);
  });
});

describe("bots and The Deck of Many Things", () => {
  it("roll it with an empty hand", () => {
    const { s: s1, ap } = setup([]);
    idle(s1, ap);
    const d = putOnBattlefield(s1, ap, deck);
    // Abilities come after the spells, in the second main phase.
    let s = s1;
    for (let i = 0; i < 40 && s.step !== "main2"; i++) s = s.pending?.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: ap, attacks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === d)).toBe(true);
  });
});

const titanic = card("RMS Titanic", "Legendary Artifact — Vehicle", "{3}{R}", { cmc: 4, power: "7", toughness: "1", keywords: ["Flying", "Trample", "Crew"], oracleText: "Flying, trample\nWhen RMS Titanic deals combat damage to a player, sacrifice it and create that many Treasure tokens.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const stadium = card("Strixhaven Stadium", "Artifact", "{3}", { cmc: 3, oracleText: "{T}: Add {C}. Put a point counter on this artifact.\nWhenever a creature deals combat damage to you, remove a point counter from this artifact.\nWhenever a creature you control deals combat damage to an opponent, put a point counter on this artifact. Then if it has ten or more point counters on it, remove them all and that player loses the game." });
const glowing = card("Glowing One", "Creature — Zombie Mutant", "{2}{G}", { cmc: 3, power: "2", toughness: "2", keywords: ["Deathtouch"], oracleText: "Deathtouch\nWhenever this creature deals combat damage to a player, they get four rad counters.\nWhenever a player mills a nonland card, you gain 1 life." });
const flood = card("Flood of Tears", "Sorcery", "{4}{U}{U}", { cmc: 6, oracleText: "Return all nonland permanents to their owners' hands. If you return four or more nontoken permanents you control this way, you may put a permanent card from your hand onto the battlefield." });
const mill3 = card("Test Mill", "Sorcery", "{U}", { cmc: 1, oracleText: "Target player mills three cards." });

describe("more round 155 cards", () => {
  it("are fully supported", () => supported(titanic, stadium, glowing, flood));
});

describe("RMS Titanic", () => {
  it("crewed, it deals 7 combat damage to a player: it's sacrificed and you create seven Treasures", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, titanic);
    const crew = putOnBattlefield(s0, ap, giant);
    const ab = abilitiesOf(s0, s0.objects[v]!).activated.findIndex((a) => a.crew !== undefined);
    let s = resolveAll(run(s0, planActivate(s0, ap, v, ab, undefined, undefined, [crew])));
    s = toAttack(s);
    const life = P(s, opp).life;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    s = resolveAll(throughDamage(s));
    expect(P(s, opp).life).toBe(life - 7);
    expect(s.objects[v]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes("Treasure"))).toHaveLength(7);
  });
});

describe("Strixhaven Stadium", () => {
  const toDamage = (s: GameState, ap: PlayerId, attacker: string, defender: PlayerId) => {
    s = toAttack(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
    return resolveAll(throughDamage(s));
  };

  it("its mana ability adds {C} and a point counter", () => {
    const { s: s0, ap } = setup([]);
    const st = putOnBattlefield(s0, ap, stadium);
    const s = tapFor(s0, ap, st, "C");
    expect(s.objects[st]!.counters.point).toBe(1);
    expect(s.players[ap]!.manaPool.C).toBe(1);
  });

  it("the tenth point counter from combat damage: all are removed and that player loses the game", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, stadium);
    s0.objects[st]!.counters.point = 9;
    const b = putOnBattlefield(s0, ap, bear());
    const s = toDamage(s0, ap, b, opp);
    expect(P(s, opp).lost).toBe(true);
    expect(s.objects[st]!.counters.point ?? 0).toBe(0);
  });

  it("below ten, a counter is added and no one loses", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, stadium);
    s0.objects[st]!.counters.point = 7;
    const b = putOnBattlefield(s0, ap, bear());
    const s = toDamage(s0, ap, b, opp);
    expect(P(s, opp).lost).toBeFalsy();
    expect(s.objects[st]!.counters.point).toBe(8);
  });

  it("a creature dealing combat damage to its controller removes a point counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, opp, stadium);
    s0.objects[st]!.counters.point = 3;
    const b = putOnBattlefield(s0, ap, bear());
    const s = toDamage(s0, ap, b, opp);
    expect(s.objects[st]!.counters.point).toBe(2);
  });
});

describe("Glowing One", () => {
  it("you gain 1 life for each nonland card a player mills (rulings: once per card)", () => {
    const { s: s0, ap, ids, opp } = setup([mill3]);
    putOnBattlefield(s0, ap, glowing);
    into(s0, opp, giant, "library");
    into(s0, opp, card("Test Mountain", "Land", "", { oracleText: "" }), "library");
    into(s0, opp, ogre, "library");
    const life = P(s0, ap).life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.graveyard).toHaveLength(3);
    expect(P(s, ap).life).toBe(life + 2);
  });
});

describe("Flood of Tears", () => {
  it("returns all nonland permanents; with four or more of your nontoken permanents returned, you may put a permanent card from your hand onto the battlefield", () => {
    const { s: s0, ap, ids, opp } = setup([flood]);
    onlyInHand(s0, ap, ids);
    const mine = [putOnBattlefield(s0, ap, giant), putOnBattlefield(s0, ap, ogre), putOnBattlefield(s0, ap, rock), putOnBattlefield(s0, ap, coin)];
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0, max: 1 });
    // One of the cards just returned (rulings).
    expect((s.pending as { cards: string[] }).cards).toEqual(expect.arrayContaining(mine));
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [mine[1]!] }));
    expect(s.objects[mine[1]!]!.zone).toBe("battlefield");
    expect(s.objects[mine[0]!]!.zone).toBe("hand");
  });

  it("tokens and other players' permanents don't count toward the four", () => {
    const { s: s0, ap, ids, opp } = setup([flood]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, giant);
    putOnBattlefield(s0, ap, ogre);
    putOnBattlefield(s0, ap, rock);
    const t = putOnBattlefield(s0, ap, thopter);
    s0.objects[t]!.isToken = true;
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand).toHaveLength(3);
  });

  it("your commander counts even though it goes to the command zone instead (rulings)", () => {
    const { s: s0, ap, ids } = setup([flood]);
    onlyInHand(s0, ap, ids);
    const p = s0.players[ap]!;
    const cmd = p.command[0]!;
    p.command = [];
    s0.objects[cmd]!.zone = "battlefield";
    s0.battlefield.push(cmd);
    invalidateCharacteristics(s0);
    putOnBattlefield(s0, ap, giant);
    putOnBattlefield(s0, ap, ogre);
    putOnBattlefield(s0, ap, rock);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && s.pending?.kind !== "searchLibrary" && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true });
  });
});
