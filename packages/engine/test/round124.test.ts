// Round 124: round 123's gaps (ward—waterbend, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
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
