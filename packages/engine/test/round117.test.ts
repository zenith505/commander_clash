// Round 117, most played cards: Hazel's Brewmaster (Foods have the activated abilities of the creature cards it exiled),
// Not of This World ("costs {7} less if it targets a spell or ability that targets a creature you control with power 7 or
// greater"), Dionus (a granted "becomes tapped during your turn" trigger, once each turn), Druid of Purification ("each
// player may choose"), Agitator Ant (counters, then goad the creatures that got them) and Odric, Master Tactician (you
// choose how the defending players block).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, isFullySupported, planActivate, planCast, plotCost, spellCost, waitingOn, type Action, type GameState, type ObjectId, type PlayerId } from "../src";
import { moveObject, tapPermanent } from "../src/game";
import { characteristics, invalidateCharacteristics as invalidate } from "../src/layers";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const toYard = (s: GameState, pid: PlayerId, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
const later = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;

// Real oracle text (Scryfall).
const brewmaster = card("Hazel's Brewmaster", "Creature — Squirrel Warlock", "{3}{B}", {
  power: "3",
  toughness: "4",
  keywords: ["Food", "Menace"],
  oracleText:
    "Menace\nWhenever this creature enters or attacks, exile up to one target card from a graveyard and create a Food token.\nFoods you control have all activated abilities of all creature cards exiled with this creature.",
});
const pyromancer = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const scavenger = card("Scavenging Ooze", "Creature — Ooze", "{1}{G}", {
  power: "2",
  toughness: "2",
  oracleText: "{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this creature and you gain 1 life.",
});
const notOfThisWorld = card("Not of This World", "Kindred Instant — Eldrazi", "{7}", {
  oracleText:
    "Counter target spell or ability that targets a permanent you control.\nThis spell costs {7} less to cast if it targets a spell or ability that targets a creature you control with power 7 or greater.",
});
const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const dionus = card("Dionus, Elvish Archdruid", "Legendary Creature — Elf Druid", "{3}{G}", {
  power: "3",
  toughness: "3",
  oracleText: 'Elves you control have "Whenever this creature becomes tapped during your turn, untap it and put a +1/+1 counter on it. This ability triggers only once each turn."',
});
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const druid = card("Druid of Purification", "Creature — Human Druid", "{3}{G}", {
  power: "2",
  toughness: "3",
  oracleText: "When this creature enters, starting with you, each player may choose an artifact or enchantment you don't control. Destroy each permanent chosen this way.",
});
const relic = (n: string) => card(n, "Artifact", "{2}", { oracleText: "" });
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

describe("Hazel's Brewmaster", () => {
  it("Foods you control have the activated abilities of the creature cards it exiled, from enters and attack alike", () => {
    expect(isFullySupported(brewmaster)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([brewmaster]);
    let s = s0;
    const pyro = toYard(s, opp, pyromancer);
    const ooze = toYard(s, opp, scavenger);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(pyro)] });
    s = settle(s);
    expect(s.objects[pyro]!.zone).toBe("exile");
    const food = s.battlefield.find((id) => /^Food/.test(name(s, id)))!;
    expect(abilitiesOf(s, s.objects[food]!).activated.map((a) => a.text)).toContain("{T}: ~ deals 1 damage to any target.");
    // Not on the Brewmaster itself (not a Food), nor on another player's Food.
    expect(abilitiesOf(s, s.objects[ids[0]!]!).activated.some((a) => /1 damage/.test(a.text))).toBe(false);
    const theirFood = putOnBattlefield(s, opp, card("Food", "Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." }));
    expect(abilitiesOf(s, s.objects[theirFood]!).activated.some((a) => /1 damage/.test(a.text))).toBe(false);
    // Its attack trigger is the same ability: the card it exiles is linked too.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ids[0]!, defender: opp }] });
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(ooze)] });
    s = settle(s);
    expect(s.objects[ooze]!.zone).toBe("exile");
    const texts = abilitiesOf(s, s.objects[food]!).activated.map((a) => a.text);
    expect(texts.some((t) => /1 damage/.test(t)) && texts.some((t) => /Exile target card from a graveyard/.test(t))).toBe(true);
  });
});

describe("Not of This World", () => {
  it("costs {7} less when the spell it targets targets your creature with power 7 or greater", () => {
    expect(isFullySupported(notOfThisWorld)).toBe(true);
    const { s: s0, ap, ids } = setup([giantGrowth, notOfThisWorld]);
    let s = s0;
    const big = putOnBattlefield(s, ap, card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample" }));
    const huge = putOnBattlefield(s, ap, card("Ancient Brontodon", "Creature — Dinosaur", "{6}{G}{G}", { power: "9", toughness: "9" }));
    s = run(s, planCast(s, ap, ids[0]!, [target(big)]));
    const growth = s.stack[s.stack.length - 1]!;
    const nw = s.objects[ids[1]!]!;
    // Power 6: no reduction.
    expect(spellCost(s, ap, nw, 0, [], { targets: [{ kind: "stack", id: growth.id }] }).extra).toBe(7);
    // Retarget the same check at the 9-power creature: free.
    growth.targets = [target(huge)];
    expect(spellCost(s, ap, nw, 0, [], { targets: [{ kind: "stack", id: growth.id }] }).extra).toBe(0);
    const lands = s.battlefield.filter((id) => !s.objects[id]!.tapped && /Basic Land/.test(s.cards[s.objects[id]!.cardId]!.typeLine)).length;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: growth.id }]));
    expect(s.battlefield.filter((id) => !s.objects[id]!.tapped && /Basic Land/.test(s.cards[s.objects[id]!.cardId]!.typeLine)).length).toBe(lands);
    s = settle(s);
    expect(s.stack).toHaveLength(0);
    expect(characteristics(s, s.objects[huge]!).power).toBe(9); // Giant Growth was countered
  });
});

describe("Dionus, Elvish Archdruid", () => {
  it("an Elf that becomes tapped during your turn untaps and gets a +1/+1 counter, once each turn", () => {
    expect(isFullySupported(dionus)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, dionus);
    const e = putOnBattlefield(s, ap, elf);
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.tapped).toBe(false);
    expect(s.objects[e]!.counters["+1/+1"]).toBe(1);
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.tapped).toBe(true);
    expect(s.objects[e]!.counters["+1/+1"]).toBe(1);
  });

  it("not during another player's turn; two Dionus give two abilities that each trigger once", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, dionus);
    // "If you somehow control multiple copies" (rulings): a nonlegendary one, so the legend rule doesn't apply.
    putOnBattlefield(s, ap, { ...dionus, oracleId: "dionus-copy", typeLine: "Creature — Elf Druid", supertypes: [] });
    const e = putOnBattlefield(s, ap, elf);
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[e]!.tapped).toBe(false);
    s = passUntil(s, "upkeep", later(s, ap, 1));
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.tapped).toBe(true);
    expect(s.objects[e]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Druid of Purification", () => {
  it("each player in turn order may choose an artifact or enchantment its controller doesn't control; all of them are destroyed", () => {
    expect(isFullySupported(druid)).toBe(true);
    const { s: s0, ap, ids } = setup([druid]);
    let s = s0;
    const [b, c, d] = [1, 2, 3].map((n) => later(s, ap, n)) as [PlayerId, PlayerId, PlayerId];
    const mine = putOnBattlefield(s, ap, relic("My Relic"));
    const bs = putOnBattlefield(s, b, relic("B Relic"));
    const cs = putOnBattlefield(s, c, relic("C Relic"));
    const ds = putOnBattlefield(s, d, relic("D Relic"));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts.some((o) => o.startsWith(`${mine}@`))).toBe(false);
    expect(opts).toContain("none");
    const pick = (pid: PlayerId, id: string | null) => {
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: pid });
      s = act(s, { type: "chooseOption", player: pid, choice: id ? (s.pending as { options: string[] }).options.find((o) => o.startsWith(`${id}@`))! : "none" });
    };
    pick(ap, bs);
    pick(b, cs);
    pick(c, null);
    pick(d, cs); // the same one again
    s = settle(s);
    expect(s.objects[bs]!.zone).toBe("graveyard");
    expect(s.objects[cs]!.zone).toBe("graveyard");
    expect(s.objects[ds]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });

  it("a bot chooses nothing rather than its own artifact", () => {
    const { s: s0, ap, ids } = setup([druid]);
    let s = s0;
    const b = later(s, ap, 1);
    const bs = putOnBattlefield(s, b, relic("B Relic"));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: b });
    expect(botActions(s, b)).toEqual([{ type: "chooseOption", player: b, choice: "none" }]);
    expect((s.pending as { options: string[] }).options.some((o) => o.startsWith(`${bs}@`))).toBe(true);
  });
});

describe("Agitator Ant", () => {
  it("each player who puts two +1/+1 counters on a creature has it goaded; one who declines doesn't", () => {
    expect(isFullySupported(ant)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c] = [later(s, ap, 1), later(s, ap, 2)];
    putOnBattlefield(s, ap, ant);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const bb = putOnBattlefield(s, b, bear({ name: "B Bear" }));
    const cb = putOnBattlefield(s, c, bear({ name: "C Bear" }));
    s = passUntil(s, "end", ap);
    s = settle(s);
    const answer = (pid: PlayerId, yes: boolean) => {
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: pid });
      s = act(s, { type: "chooseMay", player: pid, yes });
    };
    answer(ap, false);
    answer(b, true);
    answer(c, false);
    // D has no creature (beyond none), so isn't asked; B's one creature is the one.
    while (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: s.pending.player, ids: [s.pending.options[0]!] });
    s = settle(s);
    expect(s.objects[bb]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[bb]!).goadedBy).toContain(ap);
    expect(characteristics(s, s.objects[cb]!).goadedBy).not.toContain(ap);
    expect(characteristics(s, s.objects[mine]!).goadedBy).toEqual([]);
  });
});

describe("Odric, Master Tactician", () => {
  const attackWith = (n: number) => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, odric);
    const others = Array.from({ length: n }, (_, i) => putOnBattlefield(s, ap, bear({ name: `Bear ${i}` })));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const mineHome = putOnBattlefield(s, ap, bear({ name: "Home Bear" }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [o, ...others].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s);
    s = passUntil(s, "declareBlockers", ap);
    return { s, ap, opp, o, others, theirs, mineHome };
  };

  it("with three other attackers, its controller declares the defending player's blocks", () => {
    expect(isFullySupported(odric)).toBe(true);
    let { s, ap, opp, others, theirs, mineHome } = attackWith(3);
    expect(s.pending).toEqual({ kind: "declareBlockers", player: ap, remaining: [], defender: opp });
    // Only the defending player's creatures, and only legal blocks.
    expect(() => act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: mineHome, attacker: others[0]! }] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: others[0]! }] });
    expect(s.objects[theirs]!.blocking).toEqual([others[0]!]);
    expect(s.pending).toBeNull();
  });

  it("with only two others, the defending player blocks as usual; a bot choosing for them chooses no blocks", () => {
    const two = attackWith(2);
    expect(two.s.pending).toEqual({ kind: "declareBlockers", player: two.opp, remaining: [] });
    const three = attackWith(3);
    expect(botActions(three.s, three.ap)).toEqual([{ type: "declareBlockers", player: three.ap, blocks: [] }]);
  });
});

const bridge = card("The Prismatic Bridge", "Legendary Enchantment", "{W}{U}{B}{R}{G}", {
  oracleText:
    "At the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.",
});
const gallery = card("Porcelain Gallery", "Enchantment — Room", "{4}{W}{W}", {
  oracleText:
    "Creatures you control have base power and toughness each equal to the number of creatures you control.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)",
});
const doc = card("Doc Aurlock, Grizzled Genius", "Legendary Creature — Bear Druid", "{G}{U}", {
  power: "2",
  toughness: "3",
  oracleText: "Spells you cast from your graveyard or from exile cost {2} less to cast.\nPlotting cards from your hand costs {2} less.",
});
const kogla = card("Kogla and Yidaro", "Legendary Creature — Ape Dinosaur Turtle", "{2}{R}{R}{G}{G}", {
  power: "7",
  toughness: "7",
  oracleText:
    "When Kogla and Yidaro enters, choose one —\n• It gains trample and haste until end of turn.\n• It fights target creature you don't control.\n{2}{R}{G}, Discard this card: Destroy up to one target artifact or enchantment. Shuffle this card into your library from your graveyard, then draw a card.",
});
const zul = card("Zul Ashur, Lich Lord", "Legendary Creature — Zombie Warlock", "{1}{B}", {
  power: "2",
  toughness: "2",
  keywords: ["Ward"],
  oracleText:
    "Ward—Pay 2 life. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays 2 life.)\n{T}: You may cast target Zombie creature card from your graveyard this turn.",
});
const tinybones = card("Tinybones, the Pickpocket", "Legendary Creature — Skeleton Rogue", "{B}", {
  power: "1",
  toughness: "1",
  keywords: ["Deathtouch"],
  oracleText:
    "Deathtouch\nWhenever Tinybones deals combat damage to a player, you may cast target nonland permanent card from that player's graveyard, and mana of any type can be spent to cast that spell.",
});
const zombie = card("Gravecrawler", "Creature — Zombie", "{B}", { power: "2", toughness: "1", oracleText: "" });

describe("The Prismatic Bridge (Esika's back face)", () => {
  it("reveals until a creature or planeswalker card and puts it onto the battlefield, a planeswalker with its loyalty", () => {
    expect(isFullySupported(bridge)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, bridge);
    const walker = card("Jace Beleren", "Legendary Planeswalker — Jace", "{1}{U}{U}", { loyalty: "3", oracleText: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." });
    const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
    const ids = [shock, shock, walker].map((d) => {
      const id = putOnBattlefield(s, ap, d);
      moveObject(s, id, "library");
      return id;
    });
    s.players[ap]!.library = [...ids, ...s.players[ap]!.library.filter((id) => !ids.includes(id))];
    s = passUntil(s, "upkeep", later(s, ap, 4));
    s = settle(s);
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[2]!]!.counters.loyalty).toBe(3);
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([ids[0]!, ids[1]!].sort());
  });
});

describe("Porcelain Gallery", () => {
  it("creatures you control have base power and toughness equal to the number of creatures you control", () => {
    expect(isFullySupported(gallery)).toBe(true);
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, gallery);
    const bears = [1, 2, 3].map((i) => putOnBattlefield(s, ap, bear({ name: `Bear ${i}` })));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s.objects[bears[0]!]!.counters["+1/+1"] = 1;
    invalidate(s);
    expect(characteristics(s, s.objects[bears[1]!]!).power).toBe(3);
    expect(characteristics(s, s.objects[bears[0]!]!).toughness).toBe(4); // base 3, then the counter (layer 7c)
    expect(characteristics(s, s.objects[theirs]!).power).toBe(2);
  });
});

describe("Doc Aurlock, Grizzled Genius", () => {
  it("spells you cast from exile cost {2} less, and plotting costs {2} less", () => {
    expect(isFullySupported(doc)).toBe(true);
    const plotter = card("Slickshot Show-Off", "Creature — Bird Wizard", "{1}{R}", {
      power: "1",
      toughness: "2",
      keywords: ["Flying", "Haste", "Plot"],
      oracleText: "Flying, haste\nWhenever you cast a noncreature spell, this creature gets +2/+0 until end of turn.\nPlot {3}{R} (You may pay {3}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
    });
    const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
    const { s, ap, ids } = setup([plotter, giant]);
    expect(plotCost(s, ap, plotter)).toBe("{3}{R}");
    const exiled = s.objects[ids[1]!]!;
    moveObject(s, exiled.id, "exile");
    exiled.mayPlay = { player: ap, zc: exiled.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
    expect(spellCost(s, ap, exiled).extra).toBe(3);
    putOnBattlefield(s, ap, doc);
    expect(plotCost(s, ap, plotter)).toBe("{1}{R}");
    expect(spellCost(s, ap, exiled).extra).toBe(1);
  });
});

describe("Kogla and Yidaro", () => {
  it("discarded for its ability: destroys the artifact, shuffles itself into your library from your graveyard and draws", () => {
    expect(isFullySupported(kogla)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([kogla]);
    let s = s0;
    const relicId = putOnBattlefield(s, opp, relic("Their Relic"));
    const hand = s.players[ap]!.hand.length;
    const ab = abilitiesOf(s, s.objects[ids[0]!]!).activated.findIndex((a) => /Discard ~/.test(a.text));
    s = run(s, planActivate(s, ap, ids[0]!, ab, [target(relicId)]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.objects[relicId]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("library");
    expect(s.players[ap]!.hand.length).toBe(hand); // discarded one, drew one
  });
});

describe("Zul Ashur, Lich Lord", () => {
  it("lets you cast the targeted Zombie creature card from your graveyard this turn, paying its cost", () => {
    expect(isFullySupported(zul)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const z = putOnBattlefield(s, ap, zul);
    const crawler = toYard(s, ap, zombie);
    const other = toYard(s, ap, bear());
    const via = { via: "permission" as const };
    expect(planCast(s, ap, crawler, undefined, undefined, undefined, undefined, via)).toBeNull();
    s = run(s, planActivate(s, ap, z, 0, [target(crawler)]));
    s = settle(s);
    expect(planCast(s, ap, other, undefined, undefined, undefined, undefined, via)).toBeNull();
    s = settle(run(s, planCast(s, ap, crawler, undefined, undefined, undefined, undefined, via)));
    expect(s.objects[crawler]!.zone).toBe("battlefield");
  });
});

describe("Tinybones, the Pickpocket", () => {
  it("combat damage to a player: cast a nonland permanent card from their graveyard, with mana of any type", () => {
    expect(isFullySupported(tinybones)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const t = putOnBattlefield(s, ap, tinybones);
    // Only Swamps untapped: the white card's {W} is paid with black mana.
    for (const id of s.battlefield) if (/Basic Land/.test(s.cards[s.objects[id]!.cardId]!.typeLine) && !/Swamp/.test(name(s, id))) s.objects[id]!.tapped = true;
    const knight = toYard(s, opp, card("White Knight", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", keywords: ["First strike"], oracleText: "First strike" }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = passUntil(s, "combatDamage", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets" && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(knight)] });
    for (let i = 0; i < 20 && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: knight, how: "paid", anyType: true });
    s = settle(run(s, planCast(s, ap, knight)));
    expect(s.objects[knight]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[knight]!).controller).toBe(ap);
  });
});

const awakening = card("Animist's Awakening", "Sorcery", "{X}{G}", {
  oracleText:
    "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands.",
});
const onTop = (s: GameState, pid: PlayerId, defs: ReturnType<typeof card>[]): ObjectId[] => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
};

describe("Animist's Awakening", () => {
  const play = (mastery: boolean) => {
    const { s: s0, ap, ids } = setup([awakening]);
    let s = s0;
    const [l1, b, l2, deep] = onTop(s, ap, [forest, bear(), forest, forest]);
    if (mastery) for (const t of ["Instant", "Sorcery"]) toYard(s, ap, card(`Old ${t}`, t, "{1}", { oracleText: "Draw a card." }));
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 3)));
    return { s, l1: l1!, b: b!, l2: l2!, deep: deep!, ap };
  };
  it("puts the land cards among the top X onto the battlefield tapped, the rest on the bottom", () => {
    expect(isFullySupported(awakening)).toBe(true);
    const { s, l1, b, l2, deep, ap } = play(false);
    for (const l of [l1, l2]) expect(s.objects[l]).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.objects[deep]!.zone).toBe("library");
    expect(s.objects[b]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(b);
  });
  it("spell mastery: with two instant and/or sorcery cards in your graveyard, those lands are untapped", () => {
    const { s, l1, l2 } = play(true);
    for (const l of [l1, l2]) expect(s.objects[l]).toMatchObject({ zone: "battlefield", tapped: false });
  });
});

const fangs = card("Fangs of Kalonia", "Sorcery", "{1}{G}", {
  keywords: ["Overload"],
  oracleText:
    'Put a +1/+1 counter on target creature you control, then double the number of +1/+1 counters on each creature that had a +1/+1 counter put on it this way.\nOverload {4}{G}{G} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")',
});
const hardened = card("Hardened Scales", "Enchantment", "{G}", {
  oracleText: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.",
});

describe("Fangs of Kalonia", () => {
  it("one counter on the target, then its +1/+1 counters doubled", () => {
    expect(isFullySupported(fangs)).toBe(true);
    const { s: s0, ap, ids } = setup([fangs]);
    let s = s0;
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters["+1/+1"] = 2;
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(b)])));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(6);
  });
  it("overloaded: each creature you control gets one, then each one's counters are doubled; a replacement adds to both", () => {
    const { s: s0, ap, ids, opp } = setup([fangs]);
    let s = s0;
    putOnBattlefield(s, ap, hardened);
    const [a, b] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[a]!.counters["+1/+1"] = 1;
    s.objects[theirs]!.counters["+1/+1"] = 1;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "overload" })));
    // Hardened Scales: 1 + 2 = 3, then 3 + (3 + 1) = 7; and 0 + 2 = 2, then 2 + 3 = 5 (rulings: doubling is putting counters).
    expect(s.objects[a]!.counters["+1/+1"]).toBe(7);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(5);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
  });
});

const skyhunter = card("Armored Skyhunter", "Creature — Cat Knight", "{3}{W}", {
  power: "3",
  toughness: "3",
  keywords: ["Flying"],
  oracleText:
    "Flying\nWhenever this creature attacks, look at the top six cards of your library. You may put an Aura or Equipment card from among them onto the battlefield. If an Equipment is put onto the battlefield this way, you may attach it to a creature you control. Put the rest of those cards on the bottom of your library in a random order.",
});
const sword = card("Bone Saw", "Artifact — Equipment", "{0}", { oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
const stonehewer = card("Stonehewer Giant", "Creature — Giant Warrior", "{3}{W}{W}", {
  power: "4",
  toughness: "4",
  keywords: ["Vigilance"],
  oracleText: "Vigilance\n{1}{W}, {T}: Search your library for an Equipment card, put it onto the battlefield, attach it to a creature you control, then shuffle.",
});
const holyRelic = card("Quest for the Holy Relic", "Enchantment", "{W}", {
  oracleText:
    "Whenever you cast a creature spell, you may put a quest counter on this enchantment.\nRemove five quest counters from this enchantment and sacrifice it: Search your library for an Equipment card, put it onto the battlefield, attach it to a creature you control, then shuffle.",
});

describe("Armored Skyhunter", () => {
  it("attacks: an Equipment from the top six onto the battlefield, then you may attach it to a creature you control", () => {
    expect(isFullySupported(skyhunter)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const sky = putOnBattlefield(s, ap, skyhunter);
    const b = putOnBattlefield(s, ap, bear({ power: "5", toughness: "5", name: "Big Bear" }));
    const [, saw] = onTop(s, ap, [forest, sword, forest]);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sky, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [saw], min: 0, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [saw!] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", options: [b, sky, "none"], labels: ["Big Bear", "Armored Skyhunter", "Don't attach it"] });
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.objects[saw!]).toMatchObject({ zone: "battlefield", attachedTo: b });
  });
  it("you may attach nothing; an Aura enters attached as usual and isn't moved", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const sky = putOnBattlefield(s, ap, skyhunter);
    const [saw] = onTop(s, ap, [sword]);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sky, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "searchLibrary", player: ap, found: [saw!] });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.objects[saw!]!.zone).toBe("battlefield");
    expect(s.objects[saw!]!.attachedTo).toBeUndefined();
  });
});

describe("Stonehewer Giant and Quest for the Holy Relic", () => {
  it("searches for an Equipment and attaches it to a creature you control, chosen as it resolves", () => {
    expect(isFullySupported(stonehewer)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const g = putOnBattlefield(s, ap, stonehewer);
    const b = putOnBattlefield(s, ap, bear());
    const [saw] = onTop(s, ap, [sword]);
    s = run(s, planActivate(s, ap, g, 0));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "searchLibrary", player: ap, found: [saw!] });
    // No "none": the attach isn't optional.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", options: [g, b] });
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.objects[saw!]).toMatchObject({ zone: "battlefield", attachedTo: b });
  });
  it("Quest for the Holy Relic: remove five quest counters and sacrifice it; with one creature, no question", () => {
    expect(isFullySupported(holyRelic)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const q = putOnBattlefield(s, ap, holyRelic);
    const b = putOnBattlefield(s, ap, bear());
    const [saw] = onTop(s, ap, [sword]);
    s.objects[q]!.counters.quest = 4;
    expect(planActivate(s, ap, q, 0)).toBeNull();
    s.objects[q]!.counters.quest = 5;
    s = run(s, planActivate(s, ap, q, 0));
    expect(s.objects[q]!.zone).toBe("graveyard");
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "searchLibrary", player: ap, found: [saw!] });
    s = settle(s);
    expect(s.objects[saw!]).toMatchObject({ zone: "battlefield", attachedTo: b });
  });
});
