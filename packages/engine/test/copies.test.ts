// Copies (CR 707): clones entering as a copy, token copies, exceptions.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, characteristics, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castIt = (s: GameState, id: string, targets?: { kind: "object"; id: string }[]) => settle(planCast(s, s.activePlayer, id, targets)!.reduce((x, a) => act(x, a), s));
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

const clone = card("Clone Test", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield." });
const wall = card("Wall of Omens Test", "Creature — Wall", "{1}{W}", { power: "0", toughness: "4", oracleText: "Defender\nWhen this creature enters, draw a card." });
const behemoth = card("Behemoth Test", "Creature — Beast", "{5}{G}", { power: "6", toughness: "6", oracleText: "This creature enters tapped with two +1/+1 counters on it." });
const legend = card("Legend Test", "Legendary Creature — Human", "{2}", { power: "3", toughness: "3", oracleText: "" });
const metamorph = card("Metamorph Test", "Artifact Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: 'You may have this creature enter as a copy of any creature on the battlefield, except it isn\'t legendary, is an artifact in addition to its other types, and has "Whenever this creature attacks, it connives."' });
const twin = card("Twin Test", "Instant", "{2}{U}", { oracleText: "Create a token that's a copy of target creature you control, except it isn't legendary." });

describe("clones", () => {
  it("enters as a copy: name, power and toughness, its enters trigger, and how it enters (CR 707.5)", () => {
    supported(clone, wall, behemoth);
    const { s: s0, ap, ids } = setup([clone, clone]);
    const w = putOnBattlefield(s0, ap, wall);
    putOnBattlefield(s0, s0.turnOrder[1]!, behemoth);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: w }));
    expect(nameOf(s, ids[0]!)).toBe("Wall of Omens Test");
    expect(pt(s, ids[0]!)).toBe("0/4");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1); // cast one, drew one from the copied trigger
    const b = s.battlefield.find((x) => nameOf(s, x) === "Behemoth Test")!;
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }));
    expect(nameOf(s, ids[1]!)).toBe("Behemoth Test");
    expect(s.objects[ids[1]!]!.tapped).toBe(true);
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, ids[1]!)).toBe("8/8");
  });

  it("copying nothing leaves a 0/0 that dies; a copy stops being one when it leaves", () => {
    const { s: s0, ap, ids } = setup([clone]);
    putOnBattlefield(s0, ap, bear());
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(nameOf(s, ids[0]!)).toBe("Clone Test");
  });

  it("exceptions: not legendary, an artifact too, and an extra ability (CR 707.9)", () => {
    supported(metamorph);
    const { s: s0, ap, ids } = setup([metamorph]);
    const l = putOnBattlefield(s0, ap, legend);
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: l }));
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Legend Test");
    expect(c.supertypes).not.toContain("Legendary");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(s.objects[l]!.zone).toBe("battlefield"); // no legend rule
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("a clone of a clone copies what that clone copied (CR 707.3)", () => {
    const { s: s0, ap, ids } = setup([clone, clone]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }));
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ids[0]! }));
    expect(nameOf(s, ids[1]!)).toBe("Grizzly Bears");
    expect(pt(s, ids[1]!)).toBe("2/2");
  });
});

describe("token copies", () => {
  it("a token copy of a legendary creature, except it isn't legendary", () => {
    supported(twin);
    const { s: s0, ap, ids } = setup([twin]);
    const l = putOnBattlefield(s0, ap, legend);
    s0.objects[l]!.counters["+1/+1"] = 2; // counters aren't copied (CR 707.2)
    const s = castIt(s0, ids[0]!, [{ kind: "object", id: l }]);
    const tok = s.battlefield.find((x) => s.objects[x]!.isToken)!;
    expect(nameOf(s, tok)).toBe("Legend Test");
    expect(pt(s, tok)).toBe("3/3");
    expect(characteristics(s, s.objects[tok]!).supertypes).not.toContain("Legendary");
    expect(s.objects[l]!.zone).toBe("battlefield");
  });

  it("'create a token that's a copy of ~' on a combat damage trigger, doubled by Parallel Lives", () => {
    const naga = card("Naga Test", "Creature — Naga", "{2}{U}", { power: "3", toughness: "1", oracleText: "Ninjutsu {3}{U}\nWhenever this creature deals combat damage to a player, create a token that's a copy of this creature." });
    const parallelLives = card("Parallel Lives Test", "Enchantment", "{3}{G}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." });
    supported(naga);
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, naga);
    putOnBattlefield(s0, ap, parallelLives);
    let s = settle(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] }));
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    s = settle(passUntil(settle(s), "main2", ap));
    const toks = s.battlefield.filter((x) => s.objects[x]!.isToken && nameOf(s, x) === "Naga Test");
    expect(toks).toHaveLength(2);
    expect(toks.every((x) => !s.objects[x]!.tapped && s.objects[x]!.attacking === undefined)).toBe(true); // just copies, not attacking
  });
});

const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};
const doActivate = (s: GameState, pid: PlayerId, id: string) => settle(planActivate(s, pid, id, 0)!.reduce((x, a) => act(x, a), s));

describe("populate, embalm, eternalize", () => {
  const centaurs = card("Populate Test", "Sorcery", "{2}{G}{W}", { oracleText: "Create a 3/3 green Centaur creature token, then populate. (Create a token that's a copy of a creature token you control.)" });
  const justPopulate = card("Just Populate Test", "Sorcery", "{G}", { oracleText: "Populate." });
  const priest = card("Embalm Test", "Creature — Human Cleric", "{1}{W}", { power: "1", toughness: "3", oracleText: "Lifelink\nEmbalm {3}{W} ({3}{W}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Human Cleric with no mana cost. Embalm only as a sorcery.)", keywords: ["Lifelink", "Embalm"] });
  const champion = card("Eternalize Test", "Creature — Naga Wizard", "{2}{U}", { power: "2", toughness: "1", oracleText: "When this creature enters, draw a card.\nEternalize {5}{U}{U}" });

  it("populate copies a creature token you control, not a nontoken one; with none, nothing happens (CR 701.36)", () => {
    supported(centaurs, justPopulate);
    const { s: s0, ap, ids } = setup([justPopulate, centaurs]);
    putOnBattlefield(s0, ap, bear());
    let s = castIt(s0, ids[0]!);
    expect(s.battlefield.filter((x) => s.objects[x]!.isToken)).toHaveLength(0);
    s = castIt(s, ids[1]!);
    const toks = s.battlefield.filter((x) => s.objects[x]!.isToken);
    expect(toks.map((x) => nameOf(s, x))).toEqual(["Centaur Token", "Centaur Token"]);
    expect(toks.map((x) => pt(s, x))).toEqual(["3/3", "3/3"]);
  });

  it("populate with two kinds of tokens asks which to copy; the copy has the copied token's values, not its counters", () => {
    const spirit = card("Spirit Maker Test", "Sorcery", "{1}", { oracleText: "Create a 1/1 white Spirit creature token with flying." });
    supported(spirit);
    const { s: s0, ap, ids } = setup([spirit, justPopulate]);
    let s = castIt(s0, ids[0]!);
    const sp = s.battlefield.find((x) => s.objects[x]!.isToken)!;
    s.objects[sp]!.counters["+1/+1"] = 2;
    const soldier = putOnBattlefield(s, ap, card("Soldier Token", "Token Creature — Soldier", "", { power: "1", toughness: "1" }));
    s.objects[soldier]!.isToken = true;
    s = castIt(s, ids[1]!);
    expect(s.pending?.kind).toBe("pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [sp] }));
    const spirits = s.battlefield.filter((x) => nameOf(s, x) === "Spirit Token");
    expect(spirits).toHaveLength(2);
    expect(spirits.map((x) => pt(s, x)).sort()).toEqual(["1/1", "3/3"]);
  });

  it("embalm: exile it from the graveyard at sorcery speed for a white Zombie token copy with no mana cost", () => {
    supported(priest);
    const { s: s0, ap, ids } = setup([priest]);
    toGraveyard(s0, ap, ids[0]!);
    const s = doActivate(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    const tok = s.battlefield.find((x) => s.objects[x]!.isToken)!;
    const c = characteristics(s, s.objects[tok]!);
    expect(c.name).toBe("Embalm Test");
    expect(c.colors).toEqual(["W"]);
    expect(c.subtypes).toEqual(["Human", "Cleric", "Zombie"]);
    expect(pt(s, tok)).toBe("1/3");
    expect(s.cards[s.objects[tok]!.copyOf ?? s.objects[tok]!.cardId]!.manaCost).toBe("");
    expect(objHasKeyword(s, s.objects[tok]!, "Lifelink")).toBe(true);
  });

  it("eternalize: a 4/4 black Zombie copy, its enters trigger works; not at instant speed", () => {
    supported(champion);
    const { s: s0, ap, ids, opp } = setup([champion]);
    toGraveyard(s0, ap, ids[0]!);
    const upkeep = passUntil(s0, "upkeep", opp);
    expect(abilityProblem(upkeep, ap, ids[0]!, 0)).toBeTruthy();
    const hand = s0.players[ap]!.hand.length;
    const s = doActivate(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand + 1); // the copy's enters trigger
    const tok = s.battlefield.find((x) => s.objects[x]!.isToken)!;
    const c = characteristics(s, s.objects[tok]!);
    expect(pt(s, tok)).toBe("4/4");
    expect(c.colors).toEqual(["B"]);
    expect(c.subtypes).toContain("Zombie");
  });
});
