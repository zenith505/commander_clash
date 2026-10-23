// Round 124: round 123's gaps (ward—waterbend, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, castProblem, isFullySupported, manaValue, moveObject, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { characteristics, invalidateCharacteristics } from "../src/layers";
import { abilitiesOf, power, toughness } from "../src/cards";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass priority until something waits on a choice or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Tap all of `pid`'s lands but `keep` of them. */
const tapLands = (s: GameState, pid: number, keep: number) => {
  let left = keep;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller !== pid || !s.cards[o.cardId]!.types.includes("Land")) continue;
    if (left > 0 && s.cards[o.cardId]!.name === "Mountain") left--;
    else o.tapped = true;
  }
};

// Real oracle text (Scryfall).
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const unagi = card("The Unagi of Kyoshi Island", "Legendary Creature — Serpent", "{3}{U}{U}", {
  power: "5",
  toughness: "5",
  keywords: ["Ward", "Flash", "Waterbend"],
  oracleText: "Flash\nWard—Waterbend {4}. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {4}. They can tap their artifacts and creatures to help. Each one pays for {1}.)\nWhenever an opponent draws their second card each turn, you draw two cards.",
});

describe("ward—waterbend (The Unagi of Kyoshi Island)", () => {
  const scene = (creatures: number, lands: number) => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const u = putOnBattlefield(s0, opp, unagi);
    const mine = Array.from({ length: creatures }, (_, i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    tapLands(s0, ap, lands + 1);
    invalidateCharacteristics(s0);
    const s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: u }])));
    return { s, ap, opp, u, mine };
  };

  it("the targeting player is asked to pay {4}, and may tap artifacts and creatures for up to {4} of it", () => {
    supported(unagi);
    const { s: s0, ap } = scene(4, 0);
    expect(s0.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{4}", waterbend: 4 });
  });

  it("a bot taps four creatures to pay it with no mana left, and the spell resolves", () => {
    const { s: s0, u, mine } = scene(4, 0);
    const s = settle(s0);
    expect(mine.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(s.objects[u]!.damage).toBe(3);
  });

  it("two lands and two creatures: mana first, then two creatures (CR 701.67a)", () => {
    const { s: s0, mine } = scene(4, 2);
    const s = settle(s0);
    expect(mine.filter((id) => s.objects[id]!.tapped)).toHaveLength(2);
  });

  it("only three creatures and no mana: it can't be paid, and Lightning Bolt is countered", () => {
    const { s: s0, u, mine } = scene(3, 0);
    const s = settle(s0);
    expect(mine.some((id) => s.objects[id]!.tapped)).toBe(false);
    expect(s.objects[u]!.damage).toBe(0);
  });

  it("tapping more than four, or a tapped creature, is refused", () => {
    const { s: s0, ap, mine } = scene(5, 0);
    expect(() => act(s0, { type: "payUnless", player: ap, pay: true, tap: mine })).toThrow(/no more than 4/);
    s0.objects[mine[0]!]!.tapped = true;
    expect(() => act(s0, { type: "payUnless", player: ap, pay: true, tap: mine.slice(0, 4) })).toThrow(/already tapped/);
    const s = act(s0, { type: "payUnless", player: ap, pay: true, tap: mine.slice(1, 5) });
    expect(s.log.some((l) => /taps .* to waterbend/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });
});

const riverSpirit = card("Benevolent River Spirit", "Creature — Spirit", "{U}{U}", {
  power: "4",
  toughness: "5",
  keywords: ["Scry", "Flying", "Ward", "Waterbend"],
  oracleText: "As an additional cost to cast this spell, waterbend {5}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)\nFlying, ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nWhen this creature enters, scry 2.",
});
const katara = card("Katara, Seeking Revenge", "Legendary Creature — Human Warrior Ally", "{3}{U/B}", {
  power: "3",
  toughness: "3",
  keywords: ["Waterbend"],
  oracleText: "As an additional cost to cast this spell, you may waterbend {2}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)\nWhen Katara enters, draw a card, then discard a card unless her additional cost was paid.\nKatara gets +1/+1 for each Lesson card in your graveyard.",
});
const ruinous = card("Ruinous Waterbending", "Sorcery — Lesson", "{1}{B}{B}", {
  keywords: ["Waterbend"],
  oracleText: "As an additional cost to cast this spell, you may waterbend {4}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)\nAll creatures get -2/-2 until end of turn. If this spell's additional cost was paid, whenever a creature dies this turn, you gain 1 life.",
});
const revival = card("Spirit Water Revival", "Sorcery", "{1}{U}{U}", {
  keywords: ["Waterbend"],
  oracleText: "As an additional cost to cast this spell, you may waterbend {6}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)\nDraw two cards. If this spell's additional cost was paid, instead shuffle your graveyard into your library, draw seven cards, and you have no maximum hand size for the rest of the game.\nExile Spirit Water Revival.",
});
const wall = (name: string) => card(name, "Artifact Creature — Wall", "{2}", { power: "0", toughness: "4" });

describe("waterbend as an additional cost to cast a spell (CR 701.67a)", () => {
  it("Benevolent River Spirit: {U}{U} plus waterbend {5}; two Islands and five artifact creatures pay it all", () => {
    supported(riverSpirit, katara, ruinous, revival);
    const { s: s0, ap, ids } = setup([riverSpirit]);
    const walls = Array.from({ length: 5 }, (_, i) => putOnBattlefield(s0, ap, wall(`Wall ${i}`)));
    // Only two Islands untapped.
    let islands = 2;
    for (const id of s0.battlefield) {
      const o = s0.objects[id]!;
      if (o.controller !== ap || !s0.cards[o.cardId]!.types.includes("Land")) continue;
      if (s0.cards[o.cardId]!.name === "Island" && islands-- > 0) continue;
      o.tapped = true;
    }
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto");
    const c = plan?.at(-1);
    expect(c?.type === "castSpell" && [...(c.waterbend ?? [])].sort()).toEqual([...walls].sort());
    const s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(walls.every((id) => s.objects[id]!.tapped)).toBe(true);
    // Its mana value is still 2 (CR 202.3): the additional cost isn't part of it.
    expect(s.cards[s.objects[ids[0]!]!.cardId]!.manaCost).toBe("{U}{U}");
  });

  it("it can't be cast for {U}{U} alone, and isn't offered as an optional cost", () => {
    const { s: s0, ap, ids } = setup([riverSpirit]);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name !== "Island") s0.objects[id]!.tapped = true;
    // Three Islands: {U}{U} and one more, not five.
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { kicks: [0] })).toMatch(/always paid/);
  });

  it("no more than five can be tapped for it, and only untapped artifacts and creatures you control", () => {
    const { s: s0, ap, ids, opp } = setup([riverSpirit]);
    const walls = Array.from({ length: 6 }, (_, i) => putOnBattlefield(s0, ap, wall(`Wall ${i}`)));
    const theirs = putOnBattlefield(s0, opp, wall("Their Wall"));
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { waterbend: walls })).toMatch(/no more than 5/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { waterbend: [theirs] })).toMatch(/only artifacts and creatures you control/);
    // Five is fine (what's left is {U}{U}, and the mana pool is empty).
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { waterbend: walls.slice(0, 5) })).toMatch(/not enough mana/);
  });

  it("Katara, Seeking Revenge: with its waterbend cost paid, she draws a card and doesn't discard", () => {
    const { s: s0, ap, ids } = setup([katara]);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] });
    let s = run(s0, plan);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Katara without it: she draws, then discards a card", () => {
    const { s: s0, ap, ids } = setup([katara]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto"));
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Ruinous Waterbending: -2/-2 to all creatures, and with its cost paid, 1 life for each creature that dies this turn", () => {
    for (const kicks of [[0], []]) {
      const { s: s0, ap, ids, opp } = setup([ruinous]);
      putOnBattlefield(s0, opp, bear());
      putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
      const life = s0.players[ap]!.life;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, kicks.length ? { kicks } : {})));
      expect(s.players[ap]!.life).toBe(life + (kicks.length ? 2 : 0));
    }
  });

  it("Spirit Water Revival: two cards; with its cost paid, its graveyard shuffled in, seven cards and no hand size limit; then it's exiled", () => {
    const { s: s0, ap, ids } = setup([revival]);
    const yard = putOnBattlefield(s0, ap, bear({ name: "Yard Bear" }));
    s0.battlefield.splice(s0.battlefield.indexOf(yard), 1);
    s0.objects[yard]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(yard);
    const before = s0.players[ap]!.hand.length - 1;
    const plain = settle(run(structuredClone(s0), planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(plain.players[ap]!.hand.length).toBe(before + 2);
    expect(plain.objects[ids[0]!]!.zone).toBe("exile");
    expect(plain.objects[yard]!.zone).toBe("graveyard");
    const paid = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(paid.players[ap]!.hand.length).toBe(before + 7);
    expect(paid.objects[yard]!.zone).toBe("library");
    expect(paid.objects[ids[0]!]!.zone).toBe("exile");
    expect(paid.players[ap]!.noMaxHandSize).toBeTruthy();
  });
});

const deadpool = card("Deadpool, Trading Card", "Legendary Creature — Mutant Mercenary Hero", "{2}{B}{R}", {
  power: "5",
  toughness: "3",
  oracleText: "As Deadpool enters, you may exchange his text box and another creature's.\nAt the beginning of your upkeep, you lose 3 life.\n{3}, Sacrifice this creature: Each other player draws a card.",
});
const serra = card("Serra Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying\nVigilance (Attacking doesn't cause this creature to tap.)" });
const visionary = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", { power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." });

describe("Deadpool, Trading Card: exchanging text boxes (CR 612.5, 701.12h)", () => {
  const enter = (other: CardDef, theirs = true) => {
    const { s: s0, ap, ids, opp } = setup([deadpool]);
    const o = putOnBattlefield(s0, theirs ? opp : ap, other);
    const s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, opp, dp: ids[0]!, o };
  };

  it("as it enters, its controller may choose another creature; then each has the other's text, keeping its name and P/T", () => {
    supported(deadpool);
    const { s: s0, ap, opp, dp, o } = enter(serra);
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "exchangeText", player: ap, options: [o, "none"] });
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: o }));
    const d = characteristics(s, s.objects[dp]!);
    expect(d.name).toBe("Deadpool, Trading Card");
    expect(d.keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    expect(`${power(s, s.objects[dp]!)}/${toughness(s, s.objects[dp]!)}`).toBe("5/3");
    expect(characteristics(s, s.objects[o]!).keywords).not.toContain("Flying");
    // Serra Angel now has "At the beginning of your upkeep, you lose 3 life" for its controller, and the sacrifice ability.
    expect(abilitiesOf(s, s.objects[o]!).activated).toHaveLength(1);
    let t = passUntil(s, "upkeep", opp);
    const life = t.players[opp]!.life;
    t = settle(t);
    expect(t.players[opp]!.life).toBe(life - 3);
  });

  it("an enters ability it gets this way triggers: it enters with that text (CR 614.12)", () => {
    const { s: s0, ap, dp, o } = enter(visionary, false);
    let s = act(s0, { type: "chooseOption", player: ap, choice: o });
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(abilitiesOf(s, s.objects[dp]!).activated).toHaveLength(0);
  });

  it("choosing not to: nothing changes, and Deadpool keeps its own text", () => {
    const { s: s0, ap, dp, o } = enter(serra);
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: "none" }));
    expect(characteristics(s, s.objects[o]!).keywords).toContain("Flying");
    expect(abilitiesOf(s, s.objects[dp]!).activated).toHaveLength(1);
  });

  it("the other creature keeps Deadpool's text after Deadpool leaves; a bot trades its text onto an opponent's best creature", () => {
    const { s: s0, ap, dp, o } = enter(serra);
    let s = settle(s0);
    expect(characteristics(s, s.objects[dp]!).keywords).toContain("Flying");
    s = moveObject(s, dp, "graveyard") ?? s;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[o]!).keywords).not.toContain("Flying");
    expect(abilitiesOf(s, s.objects[o]!).activated).toHaveLength(1);
    expect(s.objects[dp]!.textFrom).toBeUndefined();
    void ap;
  });
});

const diviner = card("Twilight Diviner", "Creature — Elf Cleric", "{2}{B}", {
  power: "3",
  toughness: "3",
  keywords: ["Surveil"],
  oracleText: "When this creature enters, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nWhenever one or more other creatures you control enter, if they entered or were cast from a graveyard, create a token that's a copy of one of them. This ability triggers only once each turn.",
});
const reanimate = card("Test Reanimate", "Sorcery", "{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });

describe("Twilight Diviner", () => {
  const inYard = (s: GameState, pid: number, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    invalidateCharacteristics(s);
    return id;
  };
  const tokens = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === name);

  it("a creature returned from your graveyard: a token copy of it; only once each turn", () => {
    supported(diviner);
    const { s: s0, ap, ids } = setup([reanimate, reanimate]);
    putOnBattlefield(s0, ap, diviner);
    const a = inYard(s0, ap, serra);
    const b = inYard(s0, ap, visionary);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a }])));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(tokens(s, "Serra Angel")).toHaveLength(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: b }])));
    expect(tokens(s, "Elvish Visionary")).toHaveLength(0);
  });

  it("a creature cast from your hand doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, diviner);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(tokens(s, "Grizzly Bears")).toHaveLength(0);
  });
});

const emet = card("Emet-Selch of the Third Seat", "Legendary Creature — Elder Wizard", "{2}{U}{B}", {
  power: "3",
  toughness: "4",
  oracleText: "Spells you cast from your graveyard cost {2} less to cast.\nWhenever one or more opponents lose life, you may cast target instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile it instead. Do this only once each turn.",
});
const drain = card("Test Drain", "Sorcery", "{B}", { oracleText: "Each opponent loses 1 life." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("Emet-Selch of the Third Seat", () => {
  const scene = () => {
    const { s: s0, ap, ids } = setup([drain, drain]);
    putOnBattlefield(s0, ap, emet);
    const div = putOnBattlefield(s0, ap, divination);
    s0.battlefield.splice(s0.battlefield.indexOf(div), 1);
    s0.objects[div]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(div);
    invalidateCharacteristics(s0);
    return { s0, ap, ids, div };
  };
  /** Cast a drain, and let its Emet-Selch trigger(s) reach the stack. */
  const castDrain = (s: GameState, ap: number, id: string) => {
    s = run(s, planCast(s, ap, id));
    for (let i = 0; i < 10 && s.stack.some((x) => x.kind === "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("three opponents losing life at once trigger it once; Divination is cast for {1}{U} and exiled after", () => {
    supported(emet);
    const { s0, ap, ids, div } = scene();
    let s = castDrain(s0, ap, ids[0]!);
    // One trigger for the three opponents, its target chosen as it's put on the stack.
    expect(s.triggerQueue).toHaveLength(1);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = untilChoice(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: div }] }));
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid", objectId: div });
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.objects[div]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // Done once this turn: the next drain doesn't trigger it.
    s = castDrain(s, ap, ids[1]!);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("not casting it doesn't use it up: it triggers again", () => {
    const { s0, ap, ids, div } = scene();
    let s = untilChoice(act(castDrain(s0, ap, ids[0]!), { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: div }] }));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[div]!.zone).toBe("graveyard");
    s = castDrain(s, ap, ids[1]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
  });
});

const xantcha = card("Xantcha, Sleeper Agent", "Legendary Creature — Phyrexian Minion", "{1}{B}{R}", {
  power: "5",
  toughness: "5",
  oracleText: "Xantcha enters under the control of an opponent of your choice.\nXantcha attacks each combat if able and can't attack its owner or planeswalkers its owner controls.\n{3}: Xantcha's controller loses 2 life and you draw a card. Any player may activate this ability.",
});
const audience = card("Captive Audience", "Enchantment", "{5}{B}{R}", {
  oracleText: "This enchantment enters under the control of an opponent of your choice.\nAt the beginning of your upkeep, choose one that hasn't been chosen —\n• Your life total becomes 4.\n• Discard your hand.\n• Each opponent creates five 2/2 black Zombie creature tokens.",
});

describe("Xantcha, Sleeper Agent", () => {
  it("it enters under the control of an opponent its caster chooses (CR 614.1c); its caster still owns it", () => {
    supported(xantcha, audience);
    const { s: s0, ap, ids, opp } = setup([xantcha]);
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "controlOpponent", player: ap });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toHaveLength(3);
    expect(s.pending?.kind === "chooseOption" && s.pending.options).not.toContain(String(ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const x = s.objects[ids[0]!]!;
    expect(x.zone).toBe("battlefield");
    expect(x.controller).toBe(opp);
    expect(x.owner).toBe(ap);
  });

  it("any player may activate its last ability: its controller loses 2 life and the activator draws", () => {
    const { s: s0, ap, opp } = setup([]);
    const x = putOnBattlefield(s0, opp, xantcha);
    s0.objects[x]!.owner = ap;
    const [life, oppLife, hand] = [s0.players[ap]!.life, s0.players[opp]!.life, s0.players[ap]!.hand.length];
    const s = settle(run(s0, planActivate(s0, ap, x, 0)));
    expect(s.players[opp]!.life).toBe(oppLife - 2);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("it must attack, but not its owner; a bot attacks someone else with it", () => {
    const { s: s0, ap, opp } = setup([]);
    const x = putOnBattlefield(s0, opp, xantcha);
    s0.objects[x]!.owner = ap;
    const s = passUntil(s0, "declareAttackers", opp);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: x, defender: ap }] })).toThrow(/owner/);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow();
    const bot = botActions(s, opp).find((a) => a.type === "declareAttackers");
    const mine = bot?.type === "declareAttackers" ? bot.attacks.find((a) => a.attacker === x) : undefined;
    expect(mine).toBeDefined();
    expect(mine!.defender).not.toBe(ap);
    expect(mine!.defender).not.toBe(opp);
  });

  it("a bot gives it to the opponent with the least life", () => {
    const { s: s0, ap, ids } = setup([xantcha]);
    const low = s0.turnOrder.find((p) => p !== ap)!;
    s0.players[low]!.life = 7;
    const s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: String(low) }]);
  });
});

const treasureMap = scry(
  "transform",
  [
    { name: "Treasure Map", mana_cost: "{2}", type_line: "Artifact", oracle_text: "{1}, {T}: Scry 1. Put a landmark counter on this artifact. Then if there are three or more landmark counters on it, remove those counters, transform this artifact, and create three Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")" },
    { name: "Treasure Cove", type_line: "Land", oracle_text: "(Transforms from Treasure Map.)\n{T}: Add {C}.\n{T}, Sacrifice a Treasure: Draw a card." },
  ],
  { keywords: ["Transform", "Treasure", "Scry"] },
);
const treasures = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Treasure"));

describe("Treasure Map", () => {
  it("a landmark counter each time; at three, they're removed, it transforms into Treasure Cove, and three Treasures are made", () => {
    supported(treasureMap);
    const { s: s0, ap } = setup([]);
    const map = putOnBattlefield(s0, ap, treasureMap);
    let s = settle(run(s0, planActivate(s0, ap, map, 0)));
    expect(s.objects[map]!.counters.landmark).toBe(1);
    expect(treasures(s, ap)).toHaveLength(0);
    s.objects[map]!.counters.landmark = 2;
    s.objects[map]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, map, 0)));
    expect(s.objects[map]!.counters.landmark ?? 0).toBe(0);
    expect(characteristics(s, s.objects[map]!).name).toBe("Treasure Cove");
    expect(treasures(s, ap)).toHaveLength(3);
  });
});

const abdel = card("Abdel Adrian, Gorion's Ward", "Legendary Creature — Human Warrior", "{4}{W}", {
  power: "4",
  toughness: "4",
  keywords: ["Choose a background"],
  oracleText: "When Abdel Adrian enters, exile any number of other nonland permanents you control until Abdel Adrian leaves the battlefield. Create a 1/1 white Soldier creature token for each permanent exiled this way.\nChoose a Background (You can have a Background as a second commander.)",
});
const soldiers = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Soldier"));

describe("Abdel Adrian, Gorion's Ward", () => {
  const scene = () => {
    const { s: s0, ap, ids } = setup([abdel]);
    const bear1 = putOnBattlefield(s0, ap, bear());
    const vision = putOnBattlefield(s0, ap, visionary);
    const s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, ab: ids[0]!, bear1, vision };
  };

  it("its controller chooses any number of other nonland permanents; they're exiled, and a Soldier is made for each", () => {
    supported(abdel);
    const { s: s0, ap, ab, bear1, vision } = scene();
    expect(s0.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", anyNumber: true, min: 0 });
    expect(s0.pending?.kind === "pickPermanents" && s0.pending.options).not.toContain(ab);
    expect(s0.pending?.kind === "pickPermanents" && s0.pending.options.some((id) => s0.objects[id]!.cardId.includes("orest"))).toBe(false);
    let s = settle(act(s0, { type: "pickPermanents", player: ap, ids: [bear1, vision] }));
    expect(s.objects[bear1]!.zone).toBe("exile");
    expect(s.objects[vision]!.zone).toBe("exile");
    expect(soldiers(s, ap)).toHaveLength(2);
    // They come back when Abdel leaves (CR 610.3); the Soldiers stay. Elvish Visionary's enters ability triggers again.
    const hand = s.players[ap]!.hand.length;
    s = settle(moveObject(s, ab, "graveyard") ?? s);
    expect(s.battlefield.filter((id) => s.objects[id]!.cardId === bear().oracleId || defName(s, id) === "Grizzly Bears").length).toBeGreaterThan(0);
    expect(s.battlefield.some((id) => defName(s, id) === "Elvish Visionary")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(soldiers(s, ap)).toHaveLength(2);
  });

  it("choosing none: nothing is exiled and no Soldiers; a bot exiles what comes back with an enters ability", () => {
    const { s: s0, ap, vision } = scene();
    const none = settle(act(structuredClone(s0), { type: "pickPermanents", player: ap, ids: [] }));
    expect(soldiers(none, ap)).toHaveLength(0);
    expect(botActions(s0, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [vision] }]);
  });
});
const defName = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

const giant = card("Tectonic Giant", "Creature — Elemental Giant", "{2}{R}{R}", {
  power: "3",
  toughness: "4",
  oracleText: "Whenever this creature attacks or becomes the target of a spell an opponent controls, choose one —\n• This creature deals 3 damage to each opponent.\n• Exile the top two cards of your library. Choose one of them. Until the end of your next turn, you may play that card.",
});

describe("Tectonic Giant", () => {
  it("an opponent's spell targeting it: 3 damage to each opponent (first mode)", () => {
    supported(giant);
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const g = putOnBattlefield(s0, opp, giant);
    const lives = s0.turnOrder.map((p) => s0.players[p]!.life);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: g }]));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: opp });
    s = act(s, { type: "chooseModes", player: opp, modes: [0] });
    s = settle(s);
    s0.turnOrder.forEach((p, i) => expect(s.players[p]!.life).toBe(lives[i]! - (p === opp ? 0 : 3)));
  });

  it("second mode: two cards exiled, one chosen, and only that one may be played until the end of its controller's next turn", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, giant);
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: s.turnOrder.find((p) => p !== ap)! }] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice", options: top });
    expect(s.pending?.kind === "chooseOption" && s.pending.prompt).toContain("until the end of your next turn");
    s = act(s, { type: "chooseOption", player: ap, choice: top[1]! });
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.objects[top[1]!]!.mayPlay?.until).toBe("nextTurn");
    expect(s.objects[top[0]!]!.mayPlay).toBeUndefined();
  });
});

const harvester = card("Abyssal Harvester", "Creature — Demon Warlock", "{1}{B}{B}", {
  power: "3",
  toughness: "2",
  oracleText: "{T}: Exile target creature card from a graveyard that was put there this turn. Create a token that's a copy of it, except it's a Nightmare in addition to its other types. Then exile all other Nightmare tokens you control.",
});

describe("Abyssal Harvester", () => {
  it("only a creature card put into a graveyard this turn; the copy is a Nightmare, and other Nightmare tokens are exiled", () => {
    supported(harvester);
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, harvester);
    const old = putOnBattlefield(s0, opp, bear({ name: "Old Bear" }));
    const fresh = putOnBattlefield(s0, opp, serra);
    let s = moveObject(s0, old, "graveyard") ?? s0;
    s.objects[old]!.toGraveyardTurn = s.turn - 1;
    s = moveObject(s, fresh, "graveyard") ?? s;
    expect(planActivate(s, ap, h, 0, [{ kind: "object", id: old }])).toBeNull();
    s = settle(run(s, planActivate(s, ap, h, 0, [{ kind: "object", id: fresh }])));
    expect(s.objects[fresh]!.zone).toBe("exile");
    const nightmares = () => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Nightmare"));
    expect(nightmares()).toHaveLength(1);
    expect(defName(s, nightmares()[0]!)).toBe("Serra Angel");
    expect(characteristics(s, s.objects[nightmares()[0]!]!).subtypes).toEqual(expect.arrayContaining(["Angel", "Nightmare"]));
    // A second one: the first Nightmare token is exiled, the new one stays.
    const first = nightmares()[0]!;
    const another = putOnBattlefield(s, opp, visionary);
    s = moveObject(s, another, "graveyard") ?? s;
    s.objects[h]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, h, 0, [{ kind: "object", id: another }])));
    expect(nightmares()).toHaveLength(1);
    expect(defName(s, nightmares()[0]!)).toBe("Elvish Visionary");
    expect(s.objects[first]?.zone === "battlefield").toBe(false);
  });
});

const surge = card("Surge of Salvation", "Instant", "{W}", { oracleText: "You and permanents you control gain hexproof until end of turn. Prevent all damage that black and/or red sources would deal to creatures you control this turn." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to each creature." });

describe("Surge of Salvation", () => {
  it("you and your permanents gain hexproof; damage from red sources, your own too, to your creatures is prevented, but not to others'", () => {
    supported(surge);
    const { s: s0, ap, ids, opp } = setup([surge, shock]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(characteristics(s, s.objects[mine]!).keywords).toContain("Hexproof");
    expect(s.players[ap]!.gained).toContain("Hexproof");
    // Its own red sources too: "black and/or red sources" is any of them.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });
});

const blowfly = card("Blowfly Infestation", "Enchantment", "{2}{B}", { oracleText: "Whenever a creature dies, if it had a -1/-1 counter on it, put a -1/-1 counter on target creature." });

describe("Blowfly Infestation", () => {
  it("only a creature that had a -1/-1 counter on it as it died triggers it (CR 603.10a), not one with a +1/+1 counter", () => {
    supported(blowfly);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, blowfly);
    const [a, b, victim] = [putOnBattlefield(s0, opp, bear({ name: "Minus Bear" })), putOnBattlefield(s0, opp, bear({ name: "Plus Bear" })), putOnBattlefield(s0, opp, serra)];
    s0.objects[a]!.counters["-1/-1"] = 1;
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = moveObject(s0, b, "graveyard") ?? s0;
    s = settle(s);
    expect(s.objects[victim]!.counters["-1/-1"] ?? 0).toBe(0);
    s = moveObject(s, a, "graveyard") ?? s;
    for (let i = 0; i < 20 && !s.pending && (s.triggerQueue.length || s.stack.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: victim }] });
    s = settle(s);
    expect(s.objects[victim]!.counters["-1/-1"]).toBe(1);
  });
});

const inferno = card("Collective Inferno", "Enchantment", "{3}{R}{R}", {
  keywords: ["Double", "Convoke"],
  oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nAs this enchantment enters, choose a creature type.\nDouble all damage that sources you control of the chosen type would deal.",
});
const pinger = (name: string, type: string) => card(name, `Creature — ${type}`, "{1}{R}", { power: "1", toughness: "1", oracleText: `{T}: ${name} deals 1 damage to target player.` });

describe("Collective Inferno", () => {
  it("doubles damage from your sources of the chosen type only", () => {
    supported(inferno);
    const { s: s0, ap, opp } = setup([]);
    const inf = putOnBattlefield(s0, ap, inferno);
    s0.objects[inf]!.chosen = { type: "Goblin" };
    const gob = putOnBattlefield(s0, ap, pinger("Test Goblin", "Goblin"));
    const elf = putOnBattlefield(s0, ap, pinger("Test Elf", "Elf"));
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planActivate(s0, ap, gob, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 2);
    s = settle(run(s, planActivate(s, ap, elf, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

const fertilid = card("Fertilid", "Creature — Elemental", "{2}{G}", {
  power: "0",
  toughness: "0",
  oracleText: "This creature enters with two +1/+1 counters on it.\n{1}{G}, Remove a +1/+1 counter from this creature: Target player searches their library for a basic land card, puts it onto the battlefield tapped, then shuffles.",
});

describe("Fertilid", () => {
  it("the target player searches their own library, and the land enters tapped under their control", () => {
    supported(fertilid);
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fertilid);
    s0.objects[f]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    const lands = (s: GameState, p: number) => s.battlefield.filter((id) => s.objects[id]!.controller === p && characteristics(s, s.objects[id]!).types.includes("Land"));
    const [mine, theirs] = [lands(s0, ap).length, lands(s0, opp).length];
    let s = run(s0, planActivate(s0, ap, f, 0, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(lands(s, opp)).toHaveLength(theirs + 1);
    expect(lands(s, ap)).toHaveLength(mine);
    const got = lands(s, opp).find((id) => !lands(s0, opp).includes(id))!;
    expect(s.objects[got]!.tapped).toBe(true);
    expect(s.objects[got]!.owner).toBe(opp);
    expect(s.objects[f]!.counters["+1/+1"]).toBe(1);
  });
});

const splash = card("Splash Portal", "Sorcery", "{U}", { oracleText: "Exile target creature you control, then return it to the battlefield under its owner's control. If that creature is a Bird, Frog, Otter, or Rat, draw a card." });

describe("Splash Portal", () => {
  it("blinks your creature; a card only if it returns as a Bird, Frog, Otter, or Rat", () => {
    supported(splash);
    for (const [type, draws] of [["Frog", 1], ["Bear", 0]] as const) {
      const { s: s0, ap, ids } = setup([splash]);
      const c = putOnBattlefield(s0, ap, bear({ name: `Test ${type}`, typeLine: `Creature — ${type}`, subtypes: [type] }));
      const hand = s0.players[ap]!.hand.length - 1;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: c }])));
      expect(s.objects[c]!.zone).toBe("battlefield");
      expect(s.objects[c]!.zoneChanges).toBeGreaterThan(s0.objects[c]!.zoneChanges ?? 0);
      expect(s.players[ap]!.hand.length).toBe(hand + draws);
    }
  });
});

const ecd = card("Elspeth Conquers Death", "Enchantment — Saga", "{3}{W}{W}", {
  oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Exile target permanent an opponent controls with mana value 3 or greater.\nII — Noncreature spells your opponents cast cost {2} more to cast until your next turn.\nIII — Return target creature or planeswalker card from your graveyard to the battlefield. Put a +1/+1 counter or a loyalty counter on it.",
});
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{2}{W}", { loyalty: "3", oracleText: "+1: You gain 1 life." });

describe("Elspeth Conquers Death", () => {
  it("II: opponents' noncreature spells cost {2} more until your next turn; III: back from your graveyard with the counter you choose", () => {
    supported(ecd);
    const { s: s0, ap, ids, opp } = setup([ecd, divination]);
    const w = putOnBattlefield(s0, ap, walker);
    let s = moveObject(s0, w, "graveyard") ?? s0;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    // Chapter II on ap's next turn.
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "end", ap);
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(s.costModsThisTurn?.some((c) => c.untilYourNextTurn)).toBe(true);
    const div = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Divination")!;
    const cost = (p: number) => ((c) => manaValue(c.cost) + c.extra)(spellCost(s, p, s.objects[div]!));
    expect(cost(opp) - cost(ap)).toBe(2);
    // Still there on the opponent's turn, gone as ap's next turn begins (CR 611.2b).
    s = passUntil(s, "main1", opp);
    expect(s.costModsThisTurn?.length).toBeTruthy();
    s = passUntil(s, "upkeep", ap);
    expect(s.costModsThisTurn ?? []).toHaveLength(0);
    // Chapter III: the planeswalker card returns, and its controller chooses a loyalty counter.
    s = passUntil(s, "main1", ap);
    for (let i = 0; i < 20 && !s.pending && (s.triggerQueue.length || s.stack.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: w }] });
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterKind", options: ["+1/+1", "loyalty"], about: w });
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "loyalty" }]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "loyalty" }));
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(s.objects[w]!.counters.loyalty).toBe(4);
  });
});

const canopy = card("Canopy Gargantuan", "Creature — Dragon", "{5}{G}{G}", { power: "7", toughness: "7", keywords: ["Flying", "Ward"], oracleText: "Flying, ward {2}\nAt the beginning of your upkeep, put a number of +1/+1 counters on each other creature you control equal to that creature's toughness." });

describe("Canopy Gargantuan", () => {
  it("each other creature you control gets as many +1/+1 counters as its toughness", () => {
    supported(canopy);
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, canopy);
    const b = putOnBattlefield(s0, ap, bear());
    const a = putOnBattlefield(s0, ap, serra);
    let s = passUntil(s0, "upkeep", ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[g]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

const doubleMajor = card("Double Major", "Instant", "{G}{U}", { oracleText: "Copy target creature spell you control, except it isn't legendary if the spell is legendary. (A copy of a creature spell becomes a token.)" });
const legend = card("Test Legend", "Legendary Creature — Elf", "{G}", { power: "2", toughness: "2", oracleText: "" });

describe("Double Major", () => {
  it("copies your legendary creature spell; the token isn't legendary, so both stay (CR 707.9b, 704.5j)", () => {
    supported(doubleMajor);
    const { s: s0, ap, ids } = setup([legend, doubleMajor]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
    s = settle(s);
    const legends = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Test Legend");
    expect(legends).toHaveLength(2);
    const token = legends.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[token]!).supertypes).not.toContain("Legendary");
    expect(characteristics(s, s.objects[ids[0]!]!).supertypes).toContain("Legendary");
  });
});
