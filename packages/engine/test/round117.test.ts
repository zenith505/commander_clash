// Round 117, most played cards: Hazel's Brewmaster (Foods have the activated abilities of the creature cards it exiled),
// Not of This World ("costs {7} less if it targets a spell or ability that targets a creature you control with power 7 or
// greater"), Dionus (a granted "becomes tapped during your turn" trigger, once each turn), Druid of Purification ("each
// player may choose"), Agitator Ant (counters, then goad the creatures that got them) and Odric, Master Tactician (you
// choose how the defending players block).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, isFullySupported, planCast, spellCost, waitingOn, type Action, type GameState, type PlayerId } from "../src";
import { moveObject, tapPermanent } from "../src/game";
import { characteristics } from "../src/layers";

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
    s = act(s, { type: "chooseTargets", player: ap, sourceId: ids[0]!, targets: [target(pyro)] });
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
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, sourceId: ids[0]!, targets: [target(ooze)] });
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
