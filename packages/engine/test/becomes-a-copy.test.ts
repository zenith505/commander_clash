// "Becomes a copy" (CR 707.4): copy effects that start while a permanent stays on the battlefield, with durations,
// exceptions (CR 707.9), copies of face-down permanents (CR 707.2-3), and activated abilities after an ability word.

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, characteristics, compileCard, faceUpCost, isFullySupported, objHasKeyword, planActivate, planCast, planTurnFaceUp, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const nameOf = (s: GameState, id: string) => ch(s, id).name;
/** The next turn of `pid`, passing everyone's priority (no attacks), stopping in its upkeep. */
const nextUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "draw"), "upkeep", pid);
/** Let the bot answer whatever `pid` is asked (targets, "you may", paying). */
const botAnswers = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 10 && s.pending && waitingOn(s) === pid; i++) for (const a of botActions(s, pid)) s = act(s, a);
  return settle(s);
};

// Real oracle text (Scryfall, Oct 2026).
const mirageMirror = card("Mirage Mirror", "Artifact", "{3}", { oracleText: "{2}: This artifact becomes a copy of target artifact, creature, enchantment, or land until end of turn." });
const mirrorweave = card("Mirrorweave", "Instant", "{2}{W/U}{W/U}", { oracleText: "Each other creature becomes a copy of target nonlegendary creature until end of turn." });
const cryptoplasm = card("Cryptoplasm", "Creature — Shapeshifter", "{1}{U}{U}", { power: "2", toughness: "2", oracleText: "At the beginning of your upkeep, you may have this creature become a copy of another target creature, except it has this ability." });
const truePolymorph = card("True Polymorph", "Instant", "{4}{U}{U}", { oracleText: "Target artifact or creature becomes a copy of another target artifact or creature." });
const shapesharer = card("Shapesharer", "Creature — Shapeshifter", "{1}{U}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\n{2}{U}: Target Shapeshifter becomes a copy of target creature until your next turn." });
const puca = card("Cemetery Puca", "Creature — Shapeshifter", "{1}{U/B}{U/B}", { power: "1", toughness: "2", oracleText: "Whenever a creature dies, you may pay {1}. If you do, this creature becomes a copy of that creature, except it has this ability." });
const vesuvan = card("Vesuvan Doppelganger", "Creature — Shapeshifter", "{3}{U}{U}", {
  power: "0",
  toughness: "0",
  oracleText:
    'You may have this creature enter as a copy of any creature on the battlefield, except it doesn\'t copy that creature\'s color and it has "At the beginning of your upkeep, you may have this creature become a copy of target creature, except it doesn\'t copy that creature\'s color and it has this ability."',
});
const cursedMirror = card("Cursed Mirror", "Artifact", "{2}{R}", { oracleText: "{T}: Add {R}.\nAs this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste." });
const impossibleMan = card("Impossible Man", "Legendary Creature — Alien Shapeshifter", "{2}{U}", { power: "1", toughness: "4", keywords: ["Flying"], oracleText: "Flying\n{2}{U}: Impossible Man becomes a copy of another target permanent until end of turn, except his name is Impossible Man." });
const dane = card("The Ever-Changing 'Dane", "Legendary Creature — Shapeshifter", "{W}{U}{B}", { power: "3", toughness: "3", oracleText: "{1}, Sacrifice another creature: The Ever-Changing 'Dane becomes a copy of the sacrificed creature, except it has this ability." });
const absorb = card("Absorb Identity", "Instant", "{1}{U}", { oracleText: "Return target creature to its owner's hand. You may have Shapeshifters you control become copies of that creature until end of turn." });
const loki = card("Loki, Lord of Misrule", "Legendary Creature — God Sorcerer Villain", "{3}{U}", {
  power: "3",
  toughness: "4",
  oracleText: "{U}, {T}: Choose target creature you control. Each creature you control other than the chosen creature becomes a copy of that creature until end of turn, except it isn't legendary. Activate only as a sorcery.",
});
const unstable = card("Unstable Shapeshifter", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "1", oracleText: "Whenever another creature enters, this creature becomes a copy of that creature, except it has this ability." });
const stallion = card("Stallion of Ashmouth", "Creature — Nightmare Horse", "{3}{B}", { power: "3", toughness: "3", keywords: ["Delirium"], oracleText: "Delirium — {1}{B}: This creature gets +1/+1 until end of turn. Activate only if there are four or more card types among cards in your graveyard." });
const clone = card("Clone", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield." });
const branchsnap = card("Branchsnap Lorian", "Creature — Beast", "{1}{G}{G}", { power: "4", toughness: "1", keywords: ["Morph", "Trample"], oracleText: "Trample\nMorph {G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const wanderingOnes = card("Wandering Ones", "Creature — Spirit", "{U}", { power: "1", toughness: "1" });
const grinningDemon = card("Grinning Demon", "Creature — Demon", "{2}{B}{B}", { power: "6", toughness: "6", keywords: ["Morph"], oracleText: "At the beginning of your upkeep, you lose 2 life.\nMorph {2}{B}{B}" });
const crawWurm = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });
const visionary = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", { power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

describe("becoming a copy (CR 707.4)", () => {
  it("compiles the templates, with 'this ability' bound to the ability's own text", () => {
    supported(mirageMirror, mirrorweave, cryptoplasm, truePolymorph, shapesharer, puca, vesuvan, cursedMirror, impossibleMan, dane, absorb, loki, unstable, stallion);
    const fx = compileCard(cryptoplasm).triggers[0]!.body.effects[0]!;
    expect(fx).toMatchObject({ type: "may", effects: [{ type: "becomeCopy", what: { ref: "self" }, of: { ref: "target", index: 0 }, duration: "game", except: { text: [expect.stringMatching(/^At the beginning of your upkeep, you may have ~ become a copy of another target creature, except it has this ability\.$/)] } }] });
    expect(compileCard(shapesharer).activated[0]!.body.effects[0]).toMatchObject({ type: "becomeCopy", what: { ref: "target", index: 0 }, of: { ref: "target", index: 1 }, duration: "yourNextTurn" });
    // Copies that need what isn't modeled stay unsupported: a copy "for as long as" something.
    expect(isFullySupported(card("Zygon Test", "Creature — Shapeshifter", "{2}{U}", { power: "2", toughness: "2", oracleText: "{2}{U}: Tap another target creature. This creature becomes a copy of that creature for as long as that creature remains tapped." }))).toBe(false);
  });

  it("Mirage Mirror: a copy until end of turn; earlier effects and counters stay, nothing enters (CR 707.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    const mirror = putOnBattlefield(s0, ap, mirageMirror);
    const wall = putOnBattlefield(s0, opp, visionary);
    s0.objects[mirror]!.counters["+1/+1"] = 1;
    addEffect(s0, ap, [mirror], [{ kind: "modifyPT", power: 3, toughness: 3 }]); // Giant Growth before it copies
    const hand = s0.players[ap]!.hand.length;
    let s = activate(s0, ap, mirror, 0, [target(wall)]);
    expect(nameOf(s, mirror)).toBe("Elvish Visionary");
    expect(ch(s, mirror).types).toEqual(["Creature"]);
    expect(pt(s, mirror)).toBe("5/5"); // 1/1, +1/+1 counter, +3/+3
    expect(s.players[ap]!.hand.length).toBe(hand); // its enters ability doesn't trigger
    expect(abilitiesOf(s, s.objects[mirror]!).activated).toHaveLength(0); // it lost its own ability
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(nameOf(s, mirror)).toBe("Mirage Mirror");
    expect(ch(s, mirror).types).toEqual(["Artifact"]);
    expect(s.log.some((l) => /Mirage Mirror becomes a copy of Elvish Visionary until end of turn/.test(l.text))).toBe(true);
  });

  it("Mirrorweave: each other creature becomes a copy of the target, then they all revert together", () => {
    const { s: s0, ap, ids, opp } = setup([mirrorweave]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, visionary);
    const wurm = putOnBattlefield(s0, opp, crawWurm);
    let s = cast(s0, ap, ids[0]!, [target(wurm)]);
    s = settle(s);
    expect([nameOf(s, mine), pt(s, mine)]).toEqual(["Craw Wurm", "6/4"]);
    expect([nameOf(s, theirs), pt(s, theirs)]).toEqual(["Craw Wurm", "6/4"]);
    expect(nameOf(s, wurm)).toBe("Craw Wurm");
    s = passUntil(s, "upkeep", opp);
    expect([nameOf(s, mine), nameOf(s, theirs)]).toEqual(["Grizzly Bears", "Elvish Visionary"]);
  });

  it("Cryptoplasm: lasts past the turn and keeps its ability; a Clone of it copies that too (CR 707.9a)", () => {
    const { s: s0, ap, ids, opp } = setup([clone]);
    const plasm = putOnBattlefield(s0, ap, cryptoplasm);
    const wurm = putOnBattlefield(s0, opp, crawWurm);
    let s = nextUpkeep(s0, ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(wurm)] });
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect([nameOf(s, plasm), pt(s, plasm)]).toEqual(["Craw Wurm", "6/4"]);
    expect(abilitiesOf(s, s.objects[plasm]!).triggers.map((t) => t.event)).toEqual(["yourUpkeep"]);
    s = passUntil(s, "main1", ap);
    s = settle(planCast(s, ap, ids[0]!)!.reduce((x, a) => act(x, a), s));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: plasm }));
    expect([nameOf(s, ids[0]!), pt(s, ids[0]!)]).toEqual(["Craw Wurm", "6/4"]);
    expect(abilitiesOf(s, s.objects[ids[0]!]!).triggers.map((t) => t.event)).toEqual(["yourUpkeep"]);
    s = passUntil(s, "upkeep", opp);
    expect(nameOf(s, plasm)).toBe("Craw Wurm");
  });

  it("True Polymorph has no duration; Unstable Shapeshifter copies what enters, keeping the copied values", () => {
    const { s: s0, ap, ids, opp } = setup([truePolymorph, clone]);
    const mine = putOnBattlefield(s0, ap, bear());
    const wurm = putOnBattlefield(s0, opp, crawWurm);
    const shifter = putOnBattlefield(s0, opp, unstable);
    let s = settle(cast(s0, ap, ids[0]!, [target(mine), target(wurm)]));
    expect([nameOf(s, mine), pt(s, mine)]).toEqual(["Craw Wurm", "6/4"]);
    s = passUntil(s, "upkeep", opp);
    expect(nameOf(s, mine)).toBe("Craw Wurm");
    expect(nameOf(s, shifter)).toBe("Unstable Shapeshifter");
    s = passUntil(s, "main1", ap);
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: mine }));
    // The Clone copies the bear's copiable values: Craw Wurm (CR 707.2). The Shapeshifter then copies the Clone.
    expect(nameOf(s, ids[1]!)).toBe("Craw Wurm");
    expect([nameOf(s, shifter), pt(s, shifter)]).toEqual(["Craw Wurm", "6/4"]);
    expect(abilitiesOf(s, s.objects[shifter]!).triggers).toHaveLength(1);
  });

  it("Shapesharer: until your next turn, through the other players' turns", () => {
    const { s: s0, ap, opp } = setup([]);
    const sharer = putOnBattlefield(s0, ap, shapesharer);
    const wurm = putOnBattlefield(s0, opp, crawWurm);
    let s = activate(s0, ap, sharer, 0, [target(sharer), target(wurm)]);
    expect(nameOf(s, sharer)).toBe("Craw Wurm");
    expect(ch(s, sharer).allCreatureTypes).toBe(false); // it no longer has changeling
    const last = s.turnOrder[(s.turnOrder.indexOf(ap) + 3) % 4]!;
    s = passUntil(s, "end", last);
    expect(nameOf(s, sharer)).toBe("Craw Wurm");
    s = passUntil(s, "upkeep", ap);
    expect(nameOf(s, sharer)).toBe("Shapesharer");
  });

  it("Cemetery Puca copies a creature that died as it last existed: a Clone copying something (CR 608.2h)", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const p = putOnBattlefield(s0, ap, puca);
    const cl = putOnBattlefield(s0, opp, clone);
    s0.objects[cl]!.copyOf = crawWurm.oracleId;
    s0.cards[crawWurm.oracleId] = crawWurm;
    let s = cast(s0, ap, ids[0]!, [target(cl)]);
    expect(s.objects[cl]!.zone).toBe("graveyard");
    expect(s.pending?.kind).toBe("chooseMay");
    s = botAnswers(s, ap); // a 6/4 is worth {1}
    expect([nameOf(s, p), pt(s, p)]).toEqual(["Craw Wurm", "6/4"]);
    expect(abilitiesOf(s, s.objects[p]!).triggers.map((t) => t.event)).toEqual(["permanentDies"]);
  });

  it("The Ever-Changing 'Dane copies the sacrificed creature; Absorb Identity copies one that was bounced", () => {
    const { s: s0, ap, ids, opp } = setup([absorb]);
    const d = putOnBattlefield(s0, ap, dane);
    const fodder = putOnBattlefield(s0, ap, crawWurm);
    let s = passAll(planActivateWith(s0, ap, d, fodder));
    s = settle(s);
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect([nameOf(s, d), pt(s, d)]).toEqual(["Craw Wurm", "6/4"]);
    expect(abilitiesOf(s, s.objects[d]!).activated).toHaveLength(1);
    const sharer = putOnBattlefield(s, ap, shapesharer);
    const v = putOnBattlefield(s, opp, visionary);
    s = cast(s, ap, ids[0]!, [target(v)]);
    expect(s.objects[v]!.zone).toBe("hand");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(nameOf(s, sharer)).toBe("Elvish Visionary");
  });

  it("Vesuvan Doppelganger keeps its own color, here and when its upkeep ability copies again (CR 707.9c)", () => {
    const { s: s0, ap, ids, opp } = setup([vesuvan]);
    const wurm = putOnBattlefield(s0, opp, crawWurm);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: wurm }));
    expect([nameOf(s, ids[0]!), pt(s, ids[0]!)]).toEqual(["Craw Wurm", "6/4"]);
    expect(ch(s, ids[0]!).colors).toEqual(["U"]);
    s = nextUpkeep(s, ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
    s = settle(act(settle(s), { type: "chooseMay", player: ap, yes: true }));
    expect([nameOf(s, ids[0]!), pt(s, ids[0]!)]).toEqual(["Grizzly Bears", "2/2"]);
    expect(ch(s, ids[0]!).colors).toEqual(["U"]);
    expect(abilitiesOf(s, s.objects[ids[0]!]!).triggers.map((t) => t.event)).toEqual(["yourUpkeep"]);
  });

  it("Cursed Mirror enters as a copy until end of turn with haste; the copied enters ability triggers", () => {
    const { s: s0, ap, ids, opp } = setup([cursedMirror]);
    const v = putOnBattlefield(s0, opp, visionary);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: v }));
    expect(nameOf(s, ids[0]!)).toBe("Elvish Visionary");
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand); // cast it, drew a card
    s = passUntil(s, "upkeep", opp);
    expect(nameOf(s, ids[0]!)).toBe("Cursed Mirror");
    expect(ch(s, ids[0]!).types).toEqual(["Artifact"]);
  });

  it("'his name is ~' keeps its name; Loki's copies aren't legendary and the chosen creature doesn't change", () => {
    const { s: s0, ap, opp } = setup([]);
    const man = putOnBattlefield(s0, ap, impossibleMan);
    const wurm = putOnBattlefield(s0, opp, crawWurm);
    let s = activate(s0, ap, man, 0, [target(wurm)]);
    expect([nameOf(s, man), pt(s, man)]).toEqual(["Impossible Man", "6/4"]);
    expect(ch(s, man).supertypes).toEqual([]);
    const l = putOnBattlefield(s, ap, loki);
    const b = putOnBattlefield(s, ap, bear());
    s = activate(s, ap, l, 0, [target(man)]);
    // Impossible Man is copying Craw Wurm, except his name: that's what the others copy (CR 707.3).
    expect([nameOf(s, b), pt(s, b)]).toEqual(["Impossible Man", "6/4"]);
    expect(nameOf(s, l)).toBe("Impossible Man");
    expect(ch(s, l).supertypes).toEqual([]);
    expect(s.objects[l]!.zone).toBe("battlefield");
  });
});

describe("copies and face-down permanents (CR 707.2-707.3)", () => {
  const faceDown = (s0: GameState, ap: number, id: string) => settle(planCast(s0, ap, id, undefined, undefined, "auto", undefined, { faceDown: true })!.reduce((x, a) => act(x, a), s0));

  it("a copy of a face-down creature is a face-up 2/2 with no name or abilities that can't be turned face up", () => {
    const { s: s0, ap, ids } = setup([grinningDemon, clone]);
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ids[0]! }));
    expect(pt(s, ids[1]!)).toBe("2/2");
    expect(s.objects[ids[1]!]!.faceDown).toBeUndefined();
    expect(faceUpCost(s, s.objects[ids[1]!]!)).toBeUndefined();
    expect(abilitiesOf(s, s.objects[ids[1]!]!).triggers).toHaveLength(0);
  });

  it("a face-down creature that becomes a copy stays face down; face up it's the copy, for the copy's morph cost", () => {
    const { s: s0, ap, ids, opp } = setup([grinningDemon, truePolymorph, grinningDemon, truePolymorph]);
    const lorian = putOnBattlefield(s0, opp, branchsnap);
    const ones = putOnBattlefield(s0, opp, wanderingOnes);
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(cast(s, ap, ids[1]!, [target(ids[0]!), target(lorian)]));
    expect(s.objects[ids[0]!]!.faceDown).toBe("morph");
    expect(pt(s, ids[0]!)).toBe("2/2");
    expect(faceUpCost(s, s.objects[ids[0]!]!)).toEqual({ kind: "morph", cost: "{G}" });
    s = planTurnFaceUp(s, ap, ids[0]!)!.reduce((x, a) => act(x, a), s);
    expect([nameOf(s, ids[0]!), pt(s, ids[0]!)]).toEqual(["Branchsnap Lorian", "4/1"]);
    // A copy of something without morph can't be turned face up (it has no morph cost). (Fresh mana for it.)
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = faceDown(s, ap, ids[2]!);
    s = settle(cast(s, ap, ids[3]!, [target(ids[2]!), target(ones)]));
    expect(s.objects[ids[2]!]!.faceDown).toBe("morph");
    expect(faceUpCost(s, s.objects[ids[2]!]!)).toBeUndefined();
  });
});

describe("activated abilities after an ability word (CR 207.2c)", () => {
  it("Delirium — {1}{B}: activate only with four card types in the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const horse = putOnBattlefield(s0, ap, stallion);
    expect(compileCard(stallion).activated[0]).toMatchObject({ manaCost: "{1}{B}", activateIf: { kind: "graveyardTypes", n: 4 } });
    expect(() => activate(s0, ap, horse, 0)).toThrow();
    for (const d of [bear(), murder, mirageMirror, card("Island", "Basic Land — Island")]) {
      const id = putOnBattlefield(s0, ap, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    const s = activate(s0, ap, horse, 0);
    expect(pt(s, horse)).toBe("4/4");
  });
});

/** Activate The Ever-Changing 'Dane, sacrificing `victim`. */
function planActivateWith(s: GameState, pid: PlayerId, id: string, victim: string): GameState {
  const ab = abilitiesOf(s, s.objects[id]!).activated[0]!;
  expect(ab.costs?.[0]?.kind).toBe("sacrifice");
  const plan = planActivate(s, pid, id, 0, undefined, undefined, undefined, undefined, { sacrifice: [victim] })!;
  return plan.reduce((x, a) => act(x, a), s);
}
