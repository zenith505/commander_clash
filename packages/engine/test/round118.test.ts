// Round 118: round 117's rules gaps (Odric with a block tax, Agitator Ant's choices before counters, Dionus's granted
// ability after Dionus leaves and returns), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, passUntil, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { botActions, isFullySupported, planActivate, planCast, planMana, waitingOn, type Action, type GameState, type PlayerId } from "../src";
import { destroyPermanent, moveObject, spellCost, tapPermanent } from "../src/game";
import { parseManaCost } from "../src/mana";
import { characteristics, invalidateCharacteristics } from "../src/layers";

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const later = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;

// Real oracle text (Scryfall).
const dionus = card("Dionus, Elvish Archdruid", "Legendary Creature — Elf Druid", "{3}{G}", {
  power: "3",
  toughness: "3",
  oracleText: 'Elves you control have "Whenever this creature becomes tapped during your turn, untap it and put a +1/+1 counter on it. This ability triggers only once each turn."',
});
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const ant = card("Agitator Ant", "Creature — Insect", "{2}{R}", {
  power: "2",
  toughness: "2",
  keywords: ["Goad"],
  oracleText:
    "At the beginning of your end step, each player may put two +1/+1 counters on a creature they control. Goad each creature that had counters put on it this way. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)",
});
const odric = card("Odric, Master Tactician", "Legendary Creature — Human Soldier", "{2}{W}{W}", {
  power: "3",
  toughness: "4",
  keywords: ["First strike"],
  oracleText:
    "First strike (This creature deals combat damage before creatures without first strike.)\nWhenever Odric and at least three other creatures attack, you choose which creatures block this combat and how those creatures block.",
});
const archangel = card("Archangel of Tithes", "Creature — Angel", "{1}{W}{W}{W}", {
  power: "3",
  toughness: "5",
  keywords: ["Flying"],
  oracleText:
    "Flying\nAs long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.\nAs long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
});

describe("round 117 gaps", () => {
  it("Dionus that leaves and returns grants a new ability: an Elf that used the old one triggers again that turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const d = putOnBattlefield(s, ap, dionus);
    const e = putOnBattlefield(s, ap, elf);
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.counters["+1/+1"]).toBe(1);
    // Dionus blinks (CR 400.7): its ability is a new one (rulings).
    moveObject(s, d, "exile");
    moveObject(s, d, "battlefield");
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.tapped).toBe(false);
    expect(s.objects[e]!.counters["+1/+1"]).toBe(2);
    // And that one triggers only once too.
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.tapped).toBe(true);
    expect(s.objects[e]!.counters["+1/+1"]).toBe(2);
  });

  it("Agitator Ant: a bot chooses its best creature; one with no creature isn't asked; counters come after every choice", () => {
    expect(isFullySupported(ant)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c] = [later(s, ap, 1), later(s, ap, 2)];
    putOnBattlefield(s, ap, ant);
    const small = putOnBattlefield(s, b, bear({ name: "B Bear" }));
    const big = putOnBattlefield(s, b, card("B Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" }));
    const cb = putOnBattlefield(s, c, bear({ name: "C Bear" }));
    s = settle(passUntil(s, "end", ap));
    // The Ant's controller first (its own Ant is a creature they control).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: b });
    const pick = botActions(s, b)[0] as Extract<Action, { type: "chooseOption" }>;
    expect(pick.choice.startsWith(`${big}@`)).toBe(true);
    s = act(s, pick);
    expect(s.objects[big]!.counters["+1/+1"] ?? 0).toBe(0);
    // The fourth player has no creature: no question; the counters come after the third player's choice.
    s = act(s, { type: "chooseOption", player: c, choice: (s.pending as { options: string[] }).options.find((o) => o.startsWith(`${cb}@`))! });
    s = settle(s);
    expect(s.objects[big]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[cb]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[small]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(characteristics(s, s.objects[big]!).goadedBy).toContain(ap);
    expect(characteristics(s, s.objects[cb]!).goadedBy).toContain(ap);
  });

  describe("Odric with a block tax", () => {
    /** Ap attacks opp with Odric, the Archangel and two Bears; opp has a Wall and two Forests. */
    const attack = () => {
      const { s: s0, ap, opp } = setup([]);
      let s = s0;
      const o = putOnBattlefield(s, ap, odric);
      const angel = putOnBattlefield(s, ap, archangel);
      const bears = [0, 1].map((i) => putOnBattlefield(s, ap, bear({ name: `Bear ${i}` })));
      const wall = putOnBattlefield(s, opp, card("Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" }));
      for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, forest);
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [o, angel, ...bears].map((attacker) => ({ attacker, defender: opp })) });
      s = settle(s);
      s = passUntil(s, "declareBlockers", ap);
      return { s, ap, opp, bears, wall };
    };

    it("Odric's controller may choose blocks that cost mana; the blocking player decides whether to pay", () => {
      expect(isFullySupported(odric)).toBe(true);
      let { s, ap, opp, bears, wall } = attack();
      expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: opp });
      const blocks = [{ blocker: wall, attacker: bears[0]! }];
      s = act(s, { type: "declareBlockers", player: ap, blocks });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp, pay: { mana: "{1}" } });
      // They don't pay: Odric's controller proposes again (rulings).
      s = act(s, { type: "chooseMay", player: opp, yes: false });
      expect(s.pending).toEqual({ kind: "declareBlockers", player: ap, remaining: [], defender: opp });
      expect(s.objects[wall]!.blocking).toBeUndefined();
      s = act(s, { type: "declareBlockers", player: ap, blocks });
      // Now they pay, with a Forest's mana.
      expect(() => act(s, { type: "chooseMay", player: opp, yes: true })).toThrow(/mana/);
      s = [...planMana(s, opp, parseManaCost("{1}"))!, { type: "chooseMay", player: opp, yes: true } as Action].reduce(act, s);
      expect(s.objects[wall]!.blocking).toEqual([bears[0]!]);
      expect(s.pending).toBeNull();
      expect(s.log.some((l) => /pays \{1\} to block/.test(l.text))).toBe(true);
    });

    it("a bot blocking player doesn't pay for the blocks chosen for it; a bot choosing for another chooses none", () => {
      let { s, ap, opp, bears, wall } = attack();
      expect(botActions(s, ap)).toEqual([{ type: "declareBlockers", player: ap, blocks: [] }]);
      s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: wall, attacker: bears[1]! }] });
      expect(botActions(s, opp)).toEqual([{ type: "chooseMay", player: opp, yes: false }]);
    });
  });
});

const yuriko = card("Yuriko, the Tiger's Shadow", "Legendary Creature — Human Ninja", "{1}{U}{B}", {
  power: "1",
  toughness: "3",
  oracleText:
    "Commander ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand or the command zone tapped and attacking.)\nWhenever a Ninja you control deals combat damage to a player, reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card's mana value.",
});

describe("Yuriko, the Tiger's Shadow (commander ninjutsu)", () => {
  /** Ap's commander is Yuriko, in the command zone; ap attacks opp with a Bear, unblocked. */
  const unblocked = () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    s.cards[yuriko.oracleId] = yuriko;
    const y = s.players[ap]!.command[0]!;
    s.objects[y]!.cardId = yuriko.oracleId;
    const b = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    return { s: settle(s), ap, opp, y, b };
  };

  it("puts Yuriko onto the battlefield from the command zone tapped and attacking, with no commander tax", () => {
    expect(isFullySupported(yuriko)).toBe(true);
    let { s, ap, opp, y, b } = unblocked();
    s.players[ap]!.commanderCasts = { ...s.players[ap]!.commanderCasts, [y]: 2 };
    const plan = planActivate(s, ap, y, 0, undefined, undefined, undefined, undefined, { returnToHand: [b] })!;
    expect(plan).toBeTruthy();
    s = settle(plan.reduce(act, s));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[y]!.zone).toBe("battlefield");
    expect(s.objects[y]!.attacking).toBe(opp);
    expect(s.objects[y]!.tapped).toBe(true);
    // Two lands paid {U}{B}: no tax of {4}.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && s.objects[id]!.controller === ap).length).toBe(3);
    // Its combat damage: reveal the top card, put it into the hand, each opponent loses its mana value.
    const top = s.players[ap]!.library[0]!;
    const mv = s.cards[s.objects[top]!.cardId]!.cmc;
    const others = s.turnOrder.filter((p) => p !== ap && p !== opp);
    const before = others.map((p) => s.players[p]!.life);
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[top]!.zone).toBe("hand");
    expect(others.map((p) => s.players[p]!.life)).toEqual(before.map((l) => l - mv));
  });

  it("a bot uses it from the command zone", () => {
    const { s, ap, y } = unblocked();
    const tokenish = s.battlefield.find((id) => s.objects[id]!.attacking !== undefined)!;
    s.objects[tokenish]!.isToken = true;
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === y)).toBe(true);
  });
});

const squire = card("Selfless Squire", "Creature — Human Soldier", "{3}{W}", {
  power: "1",
  toughness: "1",
  keywords: ["Flash"],
  oracleText: "Flash\nWhen this creature enters, prevent all damage that would be dealt to you this turn.\nWhenever damage that would be dealt to you is prevented, put that many +1/+1 counters on this creature.",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const fog = card("Fog", "Instant", "{G}", { oracleText: "Prevent all combat damage that would be dealt this turn." });

describe("Selfless Squire", () => {
  it("prevents all damage to you this turn and gets a +1/+1 counter for each 1 prevented", () => {
    expect(isFullySupported(squire)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([squire, shock]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const sq = ids[0]!;
    expect(s.objects[sq]!.zone).toBe("battlefield");
    // Shock at yourself (its controller doesn't matter).
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[sq]!.counters["+1/+1"]).toBe(2);
    // Not damage to someone else.
    expect(s.players[opp]!.life).toBeGreaterThan(0);
  });

  it("counts combat damage prevented by Fog, attackers together", () => {
    const { s: s0, ap } = setup([fog]);
    let s = s0;
    const opp = later(s, ap, 3);
    const sq = putOnBattlefield(s, ap, squire);
    const attackers = [bear({ name: "A" }), bear({ name: "B" })].map((d) => putOnBattlefield(s, opp, d));
    // Plenty of Forests for the Fog on the other player's turn: ap's lands untap.
    s = passUntil(s, "declareAttackers", opp);
    s = settle(act(s, { type: "declareAttackers", player: opp, attacks: attackers.map((attacker) => ({ attacker, defender: ap })) }));
    s = passUntil(s, "declareBlockers", opp);
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    // Ap casts Fog with priority in declare blockers.
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Fog")!)));
    const life = s.players[ap]!.life;
    s = settle(passUntil(s, "endCombat", opp));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[sq]!.counters["+1/+1"]).toBe(4);
  });
});

const gogo = card("Gogo, Mysterious Mime", "Legendary Creature — Wizard", "{3}{R}", {
  power: "1",
  toughness: "3",
  oracleText:
    "At the beginning of combat on your turn, you may have Gogo become a copy of another target creature you control until end of turn, except its name is Gogo, Mysterious Mime. If you do, Gogo and that creature each get +2/+0 and gain haste until end of turn and attack this turn if able.",
});
const knight = card("Legendary Knight", "Legendary Creature — Human Knight", "{2}{W}{W}", { power: "4", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance" });

describe("Gogo, Mysterious Mime", () => {
  const atCombat = () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const g = putOnBattlefield(s, ap, gogo, { sick: true });
    const k = putOnBattlefield(s, ap, knight, { sick: true });
    s = passUntil(s, "beginCombat", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, g, k };
  };

  it("becomes a copy named Gogo; both get +2/+0, haste and must attack; the legend rule doesn't apply", () => {
    expect(isFullySupported(gogo)).toBe(true);
    let { s, ap, g, k } = atCombat();
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: k }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const gc = characteristics(s, s.objects[g]!);
    expect(gc.name).toBe("Gogo, Mysterious Mime");
    expect(gc.power).toBe(6);
    expect(gc.toughness).toBe(4);
    expect(gc.keywords).toEqual(expect.arrayContaining(["Vigilance", "Haste"]));
    expect(characteristics(s, s.objects[k]!).power).toBe(6);
    expect(characteristics(s, s.objects[k]!).keywords).toContain("Haste");
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[k]!.zone).toBe("battlefield");
    // Both must attack (they have haste although they came this turn).
    s = passUntil(s, "declareAttackers", ap);
    const opp = later(s, ap, 1);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [g, k].map((attacker) => ({ attacker, defender: opp })) });
    expect(s.objects[g]!.attacking).toBe(opp);
    // Until end of turn only.
    s = passUntil(s, "upkeep", later(s, ap, 1));
    expect(characteristics(s, s.objects[g]!).power).toBe(1);
  });

  it("declining changes nothing", () => {
    let { s, ap, g, k } = atCombat();
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: k }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(characteristics(s, s.objects[g]!).power).toBe(1);
    expect(characteristics(s, s.objects[k]!).power).toBe(4);
  });
});

const deeps = card("Echoing Deeps", "Land — Cave", "", {
  oracleText: "You may have this land enter tapped as a copy of any land card in a graveyard, except it's a Cave in addition to its other types.\n{T}: Add {C}.",
});
const crossroads = card("Kabira Crossroads", "Land", "", { oracleText: "Kabira Crossroads enters tapped.\nWhen Kabira Crossroads enters, you gain 2 life.\n{T}: Add {W}." });

describe("Echoing Deeps", () => {
  it("enters tapped as a copy of a land card in a graveyard, a Cave too; its enters ability triggers", () => {
    expect(isFullySupported(deeps)).toBe(true);
    const { s: s0, ap, ids } = setup([deeps]);
    let s = s0;
    const opp = later(s, ap, 2);
    const yard = putOnBattlefield(s, opp, crossroads);
    moveObject(s, yard, "graveyard");
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy", options: [yard, "none"] });
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: yard }]);
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: yard }));
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Kabira Crossroads");
    expect(c.subtypes).toContain("Cave");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("not copying anything, it enters untapped", () => {
    const { s: s0, ap, ids } = setup([deeps]);
    let s = s0;
    const yard = putOnBattlefield(s, ap, crossroads);
    moveObject(s, yard, "graveyard");
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("Echoing Deeps");
  });
});

const powerbalance = card("Powerbalance", "Enchantment", "{R}{R}", {
  oracleText:
    "Whenever an opponent casts a spell, you may reveal the top card of your library. If you do, you may cast that card without paying its mana cost if the two spells have the same mana value.",
});

describe("Powerbalance", () => {
  const withTop = (top: ReturnType<typeof card>) => {
    const { s: s0, ap, ids } = setup([bear({ name: "Cast Bear" })]);
    let s = s0;
    const b = later(s, ap, 1);
    putOnBattlefield(s, b, powerbalance);
    const t = putOnBattlefield(s, b, top);
    moveObject(s, t, "library");
    s.players[b]!.library = [t, ...s.players[b]!.library.filter((x) => x !== t)];
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, b, t };
  };

  it("an opponent's spell with mana value 2: you may cast the revealed top card with mana value 2 for free", () => {
    expect(isFullySupported(powerbalance)).toBe(true);
    let { s, b, t } = withTop(bear({ name: "Free Bear" }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b });
    s = act(s, { type: "chooseMay", player: b, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: b, options: [t, "none"] });
    s = act(s, { type: "chooseOption", player: b, choice: t });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: t });
    s = run(s, planCast(s, b, t));
    expect(s.objects[t]!.zone).toBe("stack");
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
  });

  it("a card with another mana value stays on top", () => {
    let { s, b, t } = withTop(card("Big Thing", "Creature — Beast", "{4}{G}", { power: "5", toughness: "5" }));
    s = settle(act(s, { type: "chooseMay", player: b, yes: true }));
    expect(s.objects[t]!.zone).toBe("library");
    expect(s.players[b]!.library[0]).toBe(t);
  });
});

const augury = card("Aminatou's Augury", "Sorcery", "{6}{U}{U}", {
  oracleText:
    "Exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost.",
});

describe("Aminatou's Augury", () => {
  it("a land onto the battlefield, then one spell of each nonland card type for free; an artifact creature counts as either", () => {
    expect(isFullySupported(augury)).toBe(true);
    const { s: s0, ap, ids } = setup([augury]);
    let s = s0;
    const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
    const relicA = card("Relic A", "Artifact", "{2}", { oracleText: "" });
    const top = [forest, bear({ name: "Top Bear" }), golem, relicA, card("Relic B", "Artifact", "{1}", { oracleText: "" }), shock, forest, bear({ name: "Second Bear" })].map((d) => {
      const id = putOnBattlefield(s, ap, d);
      moveObject(s, id, "library");
      return id;
    });
    s.players[ap]!.library = [...top, ...s.players[ap]!.library.filter((x) => !top.includes(x))];
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(top.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [top[0], top[6], "none"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: top[0]! }));
    expect(s.objects[top[0]!]!.zone).toBe("battlefield");
    // The other land card stays exiled and can't be played.
    expect(() => act(s, { type: "playLand", player: ap, objectId: top[6]! })).toThrow();
    // A creature, then the artifact creature (as an artifact): no second creature, no second artifact.
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, top[1]!)));
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, top[2]!)));
    expect(s.objects[top[2]!]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(tapped);
    expect(planCast(s, ap, top[7]!)).toBeNull();
    expect(planCast(s, ap, top[3]!)).toBeNull();
    // An instant is still free.
    s = settle(run(s, planCast(s, ap, top[5]!, [{ kind: "player", id: later(s, ap, 1) }])));
    expect(s.objects[top[5]!]!.zone).toBe("graveyard");
    // Until end of turn only.
    s = passUntil(s, "upkeep", later(s, ap, 1));
    expect(planCast(s, ap, top[3]!)).toBeNull();
  });
});

const wand = card("Wand of Wonder", "Artifact", "{3}{R}", {
  oracleText:
    "{4}, {T}: Roll a d20. Each opponent exiles cards from the top of their library until they exile an instant or sorcery card, then shuffles the rest into their library. You may cast up to X instant and/or sorcery spells from among cards exiled this way without paying their mana costs.\n1—9 | X is one.\n10—19 | X is two.\n20 | X is three.",
});
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("Wand of Wonder", () => {
  it("each opponent exiles down to an instant or sorcery card, shuffles the rest back; you cast up to X of them for free", () => {
    expect(isFullySupported(wand)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const w = putOnBattlefield(s, ap, wand);
    const opps = [1, 2, 3].map((n) => later(s, ap, n));
    const hits = opps.map((pid) => {
      const ids = [forest, bear(), divination].map((d) => {
        const id = putOnBattlefield(s, pid, d);
        moveObject(s, id, "library");
        return id;
      });
      s.players[pid]!.library = [...ids, ...s.players[pid]!.library.filter((x) => !ids.includes(x))];
      return { pid, rest: ids.slice(0, 2), hit: ids[2]! };
    });
    const lib = opps.map((pid) => s.players[pid]!.library.length);
    s = settle(run(s, planActivate(s, ap, w, 0)));
    const rolled = s.log.map((l) => /rolls? (?:a )?(\d+)/.exec(l.text)).find(Boolean);
    const result = Number(rolled?.[1]);
    const x = result >= 20 ? 3 : result >= 10 ? 2 : 1;
    for (const h of hits) {
      expect(s.objects[h.hit]!.zone).toBe("exile");
      expect(h.rest.every((id) => s.objects[id]!.zone === "library")).toBe(true);
    }
    expect(opps.map((pid) => s.players[pid]!.library.length)).toEqual(lib.map((n) => n - 1));
    const hand = s.players[ap]!.hand.length;
    for (let i = 0; i < x; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap });
      const pick = hits.find((h) => s.objects[h.hit]!.zone === "exile")!.hit;
      s = act(s, { type: "chooseOption", player: ap, choice: pick });
      s = run(s, planCast(s, ap, pick));
    }
    // No more than X.
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong").toBe(false);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2 * x);
    expect(hits.filter((h) => s.objects[h.hit]!.zone === "exile").length).toBe(3 - x);
  });
});

const kozilek = card("Kozilek, the Broken Reality", "Legendary Creature — Eldrazi", "{9}", {
  power: "9",
  toughness: "9",
  oracleText:
    "When you cast this spell, up to two target players each manifest two cards from their hands. For each card manifested this way, you draw a card. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nOther colorless creatures you control get +3/+2.",
});
const donatello = card("Donatello's Science Lesson", "Sorcery", "{1}{U}", { oracleText: "Tap up to two target creatures. Up to two target players each draw a card." });

describe("Kozilek, the Broken Reality", () => {
  it("up to two target players each manifest two cards from their hands (one if they have one); you draw that many", () => {
    expect(isFullySupported(kozilek)).toBe(true);
    const { s: s0, ap, ids } = setup([kozilek]);
    let s = s0;
    const [b, c] = [later(s, ap, 1), later(s, ap, 2)];
    const handOf = (pid: PlayerId, n: number) => {
      for (const id of [...s.players[pid]!.hand]) moveObject(s, id, "library");
      return Array.from({ length: n }, (_, i) => {
        const id = putOnBattlefield(s, pid, bear({ name: `Bear ${pid}-${i}` }));
        moveObject(s, id, "hand");
        return id;
      });
    };
    const bHand = handOf(b, 3);
    const cHand = handOf(c, 1);
    const mine = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: b }, { kind: "player", id: c }] });
    s = settle(s);
    // B has three: they choose two. C's one card is manifested without a choice.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: b, fromHand: true, manifest: true, min: 2, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: b, found: [bHand[0]!, bHand[2]!] }));
    for (const id of [bHand[0]!, bHand[2]!, cHand[0]!]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.faceDown).toBe("manifest");
      expect(characteristics(s, s.objects[id]!).power).toBe(2);
    }
    expect(s.objects[bHand[1]!]!.zone).toBe("hand");
    expect(s.objects[bHand[0]!]!.controller).toBe(b);
    // Three cards manifested: three drawn (Kozilek itself left the hand).
    expect(s.players[ap]!.hand.length).toBe(mine - 1 + 3);
  });

  it("Donatello's Science Lesson: up to two target players each draw a card", () => {
    expect(isFullySupported(donatello)).toBe(true);
  });
});

const aclazotzFront =
  "Flying, lifelink\nWhenever Aclazotz attacks, each opponent discards a card. For each opponent who can't, you draw a card.\nWhenever an opponent discards a land card, create a 1/1 black Bat creature token with flying.\nWhen Aclazotz dies, return it to the battlefield tapped and transformed under its owner's control.";
const templeText = "(Transforms from Aclazotz, Deepest Betrayal.)\n{T}: Add {B}.\n{2}{B}, {T}: Transform this land. Activate only if a player has one or fewer cards in hand and only as a sorcery.";
const aclazotz = scry("transform", [
  { name: "Aclazotz, Deepest Betrayal", mana_cost: "{3}{B}{B}", type_line: "Legendary Creature — Bat God", oracle_text: aclazotzFront, power: "4", toughness: "4" },
  { name: "Temple of the Dead", type_line: "Land", oracle_text: templeText },
]);
/** Aclazotz's front face alone, to attack with. */
const aclazotzFace = card("Aclazotz, Deepest Betrayal", "Legendary Creature — Bat God", "{3}{B}{B}", { power: "4", toughness: "4", keywords: ["Flying", "Lifelink"], oracleText: aclazotzFront.split("\nWhen Aclazotz dies")[0]! });
const temple = card("Temple of the Dead", "Land", "", { oracleText: "{T}: Add {B}.\n{2}{B}, {T}: Draw a card. Activate only if a player has one or fewer cards in hand and only as a sorcery." });

describe("Aclazotz, Deepest Betrayal", () => {
  it("each opponent discards; for each who can't, you draw", () => {
    expect(isFullySupported(aclazotz)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const a = putOnBattlefield(s, ap, aclazotzFace);
    const [b, c, d] = [1, 2, 3].map((n) => later(s, ap, n));
    // B and C have no cards; D has a land (a Bat for ap).
    for (const pid of [b!, c!, d!]) for (const id of [...s.players[pid]!.hand]) moveObject(s, id, "library");
    const land = putOnBattlefield(s, d!, forest);
    moveObject(s, land, "hand");
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: b! }] }));
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).length).toBe(1);
  });

  it("Temple of the Dead's condition: some player with one or fewer cards in hand", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const t = putOnBattlefield(s, ap, temple);
    for (const p of s.players) while (p.hand.length < 3) {
      const id = putOnBattlefield(s, p.id, bear());
      moveObject(s, id, "hand");
    }
    expect(planActivate(s, ap, t, 0)).toBeNull();
    const opp = later(s, ap, 2);
    for (const id of s.players[opp]!.hand.slice(1)) moveObject(s, id, "library");
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, t, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

const earthKing = card("The Earth King", "Legendary Creature — Human Noble Ally", "{3}{G}", {
  power: "2",
  toughness: "2",
  oracleText:
    "When The Earth King enters, create a 4/4 green Bear creature token.\nWhenever one or more creatures you control with power 4 or greater attack, search your library for up to that many basic land cards, put them onto the battlefield tapped, then shuffle.",
});

describe("The Earth King", () => {
  it("one basic land for each attacking creature with power 4 or greater", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, earthKing);
    const big = [0, 1].map(() => putOnBattlefield(s, ap, bear({ name: "Big Bear", power: "4", toughness: "4" })));
    const small = putOnBattlefield(s, ap, bear());
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [...big, small].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: s.pending!.kind === "searchLibrary" ? s.pending.cards.slice(0, 2) : [] }));
    const now = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    expect(now.length).toBe(lands.length + 2);
    expect(now.filter((id) => !lands.includes(id)).every((id) => s.objects[id]!.tapped)).toBe(true);
  });
});

const urDragon = card("The Ur-Dragon", "Legendary Creature — Dragon Avatar", "{4}{W}{U}{B}{R}{G}", {
  power: "10",
  toughness: "10",
  keywords: ["Flying"],
  oracleText:
    "Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.",
});
const edgar = card("Edgar Markov", "Legendary Creature — Vampire Knight", "{3}{R}{W}{B}", {
  power: "4",
  toughness: "4",
  keywords: ["First strike", "Haste"],
  oracleText:
    "Eminence — Whenever you cast another Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar Markov attacks, put a +1/+1 counter on each Vampire you control.",
});
const dragon = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn." });
const vampire = card("Vampire Interloper", "Creature — Vampire Scout", "{1}{B}", { power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nThis creature can't block." });

describe("Eminence", () => {
  const asCommander = (d: typeof urDragon, hand: (typeof urDragon)[]) => {
    const { s, ap, ids, opp } = setup(hand);
    s.cards[d.oracleId] = d;
    const c = s.players[ap]!.command[0]!;
    s.objects[c]!.cardId = d.oracleId;
    return { s, ap, ids, opp, c };
  };

  it("The Ur-Dragon in the command zone: other Dragon spells you cast cost {1} less, not it, nor other players' Dragons", () => {
    expect(isFullySupported(urDragon)).toBe(true);
    const { s, ap, ids, c } = asCommander(urDragon, [dragon]);
    // The generic part: {4} becomes {3}.
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(3);
    expect(spellCost(s, ap, s.objects[c]!).extra).toBe(4);
    const opp = later(s, ap, 1);
    const theirs = putOnBattlefield(s, opp, dragon);
    moveObject(s, theirs, "hand");
    expect(spellCost(s, opp, s.objects[theirs]!).extra).toBe(4);
  });

  it("The Ur-Dragon's attack trigger: draw that many cards, then you may put a permanent card onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const u = putOnBattlefield(s, ap, urDragon);
    const d = putOnBattlefield(s, ap, dragon);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [u, d].map((attacker) => ({ attacker, defender: opp })) }));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0, max: 1 });
  });

  it("Edgar Markov in the command zone: another Vampire spell makes a Vampire token; not once Edgar has left it", () => {
    expect(isFullySupported(edgar)).toBe(true);
    const { s: s0, ap, ids, c } = asCommander(edgar, [vampire, vampire]);
    let s = s0;
    putOnBattlefield(s, ap, swamp);
    const tokens = () => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(tokens()).toBe(1);
    // Edgar on the battlefield works too.
    s = settle(run(s, planCast(s, ap, c)));
    expect(s.objects[c]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(tokens()).toBe(2);
  });
});

const impetus = card("Ghoulish Impetus", "Enchantment — Aura", "{2}{B}", {
  oracleText:
    "Enchant creature\nEnchanted creature gets +1/+1, has deathtouch, and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhen enchanted creature dies, return this card to the battlefield at the beginning of the next end step.",
});

describe("Ghoulish Impetus", () => {
  it("+1/+1, deathtouch, goaded; when the creature dies, the Aura returns at the next end step, on a creature its controller chooses", () => {
    expect(isFullySupported(impetus)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = later(s, ap, 1);
    const victim = putOnBattlefield(s, opp, bear());
    const other = putOnBattlefield(s, opp, bear({ name: "Other Bear" }));
    const aura = putOnBattlefield(s, ap, impetus);
    s.objects[aura]!.attachedTo = victim;
    invalidateCharacteristics(s);
    const ch = characteristics(s, s.objects[victim]!);
    expect([ch.power, ch.keywords.includes("Deathtouch")]).toEqual([3, true]);
    destroyPermanent(s, s.objects[victim]!, "test");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    expect(s.objects[aura]!.zone).toBe("graveyard");
    s = passUntil(s, "end", ap);
    s = settle(s);
    for (let i = 0; i < 5 && s.pending; i++) {
      if (s.pending.kind === "chooseTargets" || s.pending.kind === "chooseOption") s = settle(run(s, botActions(s, s.pending.player)));
    }
    expect(s.objects[aura]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.controller).toBe(ap);
    expect(s.objects[aura]!.attachedTo).toBeDefined();
    expect(characteristics(s, s.objects[s.objects[aura]!.attachedTo!]!).power).toBe(3);
    void other;
  });
});

const conquest = card("Lich-Knights' Conquest", "Sorcery", "{B}", {
  oracleText: "Sacrifice any number of artifacts, enchantments, and/or tokens. Return that many creature cards from your graveyard to the battlefield.",
});

describe("Lich-Knights' Conquest", () => {
  it("sacrifice any number of artifacts, enchantments and tokens; return that many creature cards", () => {
    expect(isFullySupported(conquest)).toBe(true);
    const { s: s0, ap, ids } = setup([conquest]);
    let s = s0;
    const relic = putOnBattlefield(s, ap, card("Relic", "Artifact", "{1}", { oracleText: "" }));
    const charm = putOnBattlefield(s, ap, card("Charm", "Enchantment", "{1}", { oracleText: "" }));
    const plainBear = putOnBattlefield(s, ap, bear());
    const dead = [0, 1, 2].map((i) => {
      const id = putOnBattlefield(s, ap, bear({ name: `Dead Bear ${i}` }));
      moveObject(s, id, "graveyard");
      return id;
    });
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    // A nontoken creature isn't one of them.
    expect(s.pending.options).toEqual(expect.arrayContaining([relic, charm]));
    expect(s.pending.options).not.toContain(plainBear);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [relic, charm] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "battlefield", min: 2, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dead[0]!, dead[2]!] }));
    expect([relic, charm].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(dead.map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "graveyard", "battlefield"]);
  });
});
