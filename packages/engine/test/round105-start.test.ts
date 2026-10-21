// Round 105, the first popular cards: Avatar's Wrath (airbend all but up to one target; opponents can't cast spells from
// anywhere but their hands until your next turn), Exploration Broodship (a once-each-turn graveyard permission with a
// sacrifice of its own, at 8+), Malcolm ("you may cast the discarded card without paying its mana cost"), Resourceful
// Defense (leaving counters onto a target; moving any number of counters), Phelia ("if it entered under your control"),
// Morophon (colored cost reductions only, CR 118.7).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, isFullySupported, planActivate, planCast, power, spellCost, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const wrath = card("Avatar's Wrath", "Sorcery", "{2}{W}{W}", { keywords: ["Airbend"], oracleText: "Choose up to one target creature, then airbend all other creatures. (Exile them. While each one is exiled, its owner may cast it for {2} rather than its mana cost.)\nUntil your next turn, your opponents can't cast spells from anywhere other than their hands.\nExile Avatar's Wrath." });
const broodship = card("Exploration Broodship", "Artifact — Spacecraft", "{G}", { power: "4", toughness: "4", keywords: ["Station"], oracleText: "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 8+.)\n3+ | You may play an additional land on each of your turns.\n8+ | Flying\nOnce during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs." });
const maestros = card("Maestros Ascendancy", "Enchantment", "{U}{B}{R}", { oracleText: "Once during each of your turns, you may cast an instant or sorcery spell from your graveyard by sacrificing a creature in addition to paying its other costs. If a spell cast this way would be put into your graveyard, exile it instead." });
const karador = card("Karador, Ghost Chieftain", "Legendary Creature — Centaur Spirit", "{5}{B}{G}{W}", { power: "3", toughness: "4", oracleText: "This spell costs {1} less to cast for each creature card in your graveyard.\nOnce during each of your turns, you may cast a creature spell from your graveyard." });
const malcolm = card("Malcolm, Alluring Scoundrel", "Legendary Creature — Siren Pirate", "{1}{U}", { power: "2", toughness: "1", keywords: ["Flying", "Flash"], oracleText: "Flash\nFlying\nWhenever Malcolm deals combat damage to a player, put a chorus counter on it. Draw a card, then discard a card. If there are four or more chorus counters on Malcolm, you may cast the discarded card without paying its mana cost." });
const defense = card("Resourceful Defense", "Enchantment", "{2}{W}", { oracleText: "Whenever a permanent you control leaves the battlefield, if it had counters on it, put those counters on target permanent you control.\n{4}{W}: Move any number of counters from target permanent you control onto a second target permanent you control." });
const phelia = card("Phelia, Exuberant Shepherd", "Legendary Creature — Dog", "{1}{W}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash\nWhenever Phelia attacks, exile up to one other target nonland permanent. At the beginning of the next end step, return that card to the battlefield under its owner's control. If it entered under your control, put a +1/+1 counter on Phelia." });
const morophon = card("Morophon, the Boundless", "Legendary Creature — Shapeshifter", "{7}", { power: "6", toughness: "6", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\nAs Morophon enters, choose a creature type.\nSpells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.\nOther creatures you control of the chosen type get +1/+1." });
const edgewalker = card("Edgewalker", "Creature — Human Cleric", "{1}{W}{B}", { power: "2", toughness: "2", oracleText: "Cleric spells you cast cost {W}{B} less to cast. This effect reduces only the amount of colored mana you pay." });

// Test cards.
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const ox = card("Test Ox", "Creature — Ox", "{3}{G}", { power: "3", toughness: "3" });
const lore = card("Test Lore", "Sorcery", "{1}{U}", { oracleText: "Draw two cards." });
const elf = (name: string, cost: string) => card(name, "Creature — Elf", cost, { power: "1", toughness: "1" });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const toYard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const via = { via: "turnPermission" as const };
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, ids: string[]) => {
  while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: ap, attacks: ids.map((a) => ({ attacker: a, defender: opp })) });
};
/** Pass (no blocks) until a pending decision of this kind. */
const until = (s: GameState, kind: string) => {
  for (let i = 0; i < 60 && s.pending?.kind !== kind; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const landOf = (s: GameState, pid: PlayerId) => s.battlefield.find((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))!;

describe("round 105: the first popular cards", () => {
  it("parse", () => [wrath, broodship, maestros, malcolm, defense, phelia, morophon, edgewalker].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Avatar's Wrath: all creatures but the target are airbent; the spell is exiled", () => {
    const { s: s0, ap, opp, ids } = setup([wrath]);
    const keep = putOnBattlefield(s0, ap, bear({ name: "Kept Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(keep)]));
    expect(s.objects[keep]!.zone).toBe("battlefield");
    for (const id of [mine, theirs]) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.mayPlay).toMatchObject({ cost: "{2}" });
    }
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("Avatar's Wrath: with no target, every creature; opponents can't cast from exile until your next turn, you can", () => {
    const { s: s0, ap, opp, ids } = setup([wrath]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "none" }]));
    expect(s.objects[mine]!.zone).toBe("exile");
    expect(s.objects[theirs]!.zone).toBe("exile");
    // The caster may cast theirs back for {2}.
    expect(planCast(s, ap, mine)).not.toBeNull();
    // On the opponent's turn, they can't cast theirs from exile.
    s = passUntil(s, "main1", opp);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, card(`Land ${i}`, "Basic Land — Forest"));
    expect(castProblem(s, opp, theirs)).toMatch(/anywhere other than their hands/);
    // From the caster's next turn on, they can.
    s = passUntil(s, "main1", ap);
    expect(s.handOnlyUntil).toBeUndefined();
  });

  it("Exploration Broodship: below 8 charge counters nothing; at 8+, a permanent spell from the graveyard for a land", () => {
    const { s: s0, ap } = setup([]);
    const ship = putOnBattlefield(s0, ap, broodship);
    const o = toYard(s0, ap, ox);
    s0.objects[ship]!.counters.charge = 3;
    expect(castProblem(s0, ap, o, undefined, undefined, undefined, undefined, undefined, via)).not.toBeNull();
    s0.objects[ship]!.counters.charge = 8;
    // Saying nothing about the land isn't enough: it's an additional cost (CR 601.2h).
    expect(() => run(s0, planCast(s0, ap, o, undefined, undefined, "auto", undefined, via))).toThrow(/additional cost/);
    const land = landOf(s0, ap);
    let s = run(s0, planCast(s0, ap, o, undefined, undefined, "auto", undefined, { ...via, sacrifice: [land] }));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(s.objects[land]!.zone).toBe("graveyard");
    // Once each turn.
    const o2 = toYard(s, ap, ox);
    expect(castProblem(s, ap, o2, undefined, undefined, undefined, undefined, undefined, via)).toMatch(/once-each-turn/);
    // Not instants or sorceries.
    s.turnLog = undefined;
    const l = toYard(s, ap, lore);
    expect(castProblem(s, ap, l, undefined, undefined, undefined, undefined, undefined, via)).not.toBeNull();
  });

  it("Exploration Broodship and Karador: Karador's permission is taken first, with no land", () => {
    const { s: s0, ap } = setup([]);
    const ship = putOnBattlefield(s0, ap, broodship);
    s0.objects[ship]!.counters.charge = 8;
    putOnBattlefield(s0, ap, karador);
    const o = toYard(s0, ap, ox);
    const lands = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")).length;
    let s = run(s0, planCast(s0, ap, o, undefined, undefined, "auto", undefined, via));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length).toBe(lands);
    // The Broodship's is still there, with its land.
    const o2 = toYard(s, ap, ox);
    const land = landOf(s, ap);
    s = run(s, planCast(s, ap, o2, undefined, undefined, "auto", undefined, { ...via, sacrifice: [land] }));
    expect(s.objects[o2]!.zone).toBe("battlefield");
    expect(s.objects[land]!.zone).toBe("graveyard");
  });

  it("Maestros Ascendancy: an instant from the graveyard for a creature, exiled afterwards", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, maestros);
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Fodder" }));
    const sh = toYard(s0, ap, shock);
    const s = run(s0, planCast(s0, ap, sh, [{ kind: "player", id: opp }], undefined, "auto", undefined, { ...via, sacrifice: [fodder] }));
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.objects[sh]!.zone).toBe("exile");
  });

  it("Malcolm: a chorus counter, loot; with four counters the discarded card may be cast free", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, malcolm);
    s0.objects[m]!.counters.chorus = 3;
    const o = putOnBattlefield(s0, ap, ox);
    s0.battlefield.splice(s0.battlefield.indexOf(o), 1);
    s0.objects[o]!.zone = "hand";
    s0.players[ap]!.hand.push(o);
    let s = until(attack(s0, ap, opp, [m]), "discard");
    expect(s.objects[m]!.counters.chorus).toBe(4);
    s = act(s, { type: "discard", player: ap, objectIds: [o] });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: o });
    s = act(s, { type: "castSpell", player: ap, objectId: o });
    s = settle(s);
    expect(s.objects[o]!.zone).toBe("battlefield");
  });

  it("Malcolm: with fewer than four counters, no cast", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, malcolm);
    let s = until(attack(s0, ap, opp, [m]), "discard");
    const d = s.players[ap]!.hand[0]!;
    s = act(s, { type: "discard", player: ap, objectIds: [d] });
    expect(s.pending?.kind).not.toBe("castFree");
    expect(s.objects[m]!.counters.chorus).toBe(1);
  });

  it("Resourceful Defense: a leaving permanent's counters go on a target permanent you control", () => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, defense);
    const b = putOnBattlefield(s0, ap, bear({ name: "Countered Bear" }));
    const other = putOnBattlefield(s0, ap, ox);
    s0.objects[b]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters.charge = 2;
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(other)] }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[other]!.counters).toMatchObject({ "+1/+1": 1, charge: 2 });
  });

  it("Resourceful Defense: move any number of counters, one kind or another, onto a second permanent", () => {
    const { s: s0, ap } = setup([]);
    const rd = putOnBattlefield(s0, ap, defense);
    const a = putOnBattlefield(s0, ap, ox);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[a]!.counters["+1/+1"] = 3;
    s0.objects[a]!.counters.charge = 1;
    const plan = planActivate(s0, ap, rd, 0, [target(a), target(b)]);
    expect(plan).not.toBeNull();
    let s = plan!.reduce((x, y) => act(x, y), s0);
    s = settle(s);
    for (const pick of ["+1/+1", "+1/+1", "done"]) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter" });
      s = act(s, { type: "chooseOption", player: ap, choice: pick });
    }
    s = settle(s);
    expect(s.objects[a]!.counters).toMatchObject({ "+1/+1": 1, charge: 1 });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("Phelia: exiles another nonland permanent until the end step; yours coming back gives Phelia a counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, phelia);
    const mine = putOnBattlefield(s0, ap, ox);
    let s = attack(s0, ap, opp, [p]);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(mine)] });
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("exile");
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[p]!.counters["+1/+1"]).toBe(1);
  });

  it("Phelia: an opponent's permanent comes back to them, no counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, phelia);
    const theirs = putOnBattlefield(s0, opp, ox);
    let s = attack(s0, ap, opp, [p]);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] });
    s = settle(s);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(s.objects[p]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Morophon: spells of the chosen type cost up to one less of each color, never generic", () => {
    const { s: s0, ap, ids } = setup([elf("Green Elf", "{2}{G}{G}"), elf("Hybrid Elf", "{1}{W/U}{W/U}"), elf("Colorless Elf", "{3}"), ox]);
    const m = putOnBattlefield(s0, ap, morophon);
    s0.objects[m]!.chosen = { type: "Elf" };
    const [green, hybrid, colorless, notElf] = ids as [string, string, string, string];
    const cost = (id: string) => spellCost(s0, ap, s0.objects[id]!, 0);
    const show = (c: ReturnType<typeof cost>) => `${c.cost.symbols.map((y) => (y.kind === "colored" ? y.color : y.kind === "hybrid" ? y.options.join("/") : y.kind)).join("")}+${c.extra}`;
    expect(show(cost(green))).toBe("G+2");
    expect(show(cost(hybrid))).toBe("+1"); // one {W/U} paid as W, the other as U
    expect(show(cost(colorless))).toBe("+3");
    expect(show(cost(notElf))).toBe("G+3");
    // And other Elves get +1/+1.
    const e = putOnBattlefield(s0, ap, elf("Board Elf", "{G}"));
    expect(power(s0, s0.objects[e]!)).toBe(2);
  });

  it("Edgewalker: Cleric spells cost {W}{B} less", () => {
    const { s: s0, ap } = setup([card("Test Cleric", "Creature — Human Cleric", "{1}{W}{B}{B}", { power: "1", toughness: "1" })]);
    putOnBattlefield(s0, ap, edgewalker);
    const c = spellCost(s0, ap, s0.objects[s0.players[ap]!.hand.at(-1)!]!, 0);
    expect(c.cost.symbols).toEqual([{ kind: "colored", color: "B" }]);
    expect(c.extra).toBe(1);
  });
});
