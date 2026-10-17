// Reflexive triggers of instants and sorceries (CR 603.12): "When you do, ..." in a spell is a triggered ability whose
// source is the spell (CR 113.7a). It's put on the stack after the spell has finished resolving and gone to the graveyard,
// its targets chosen then, and players can respond to it (rulings on Hypothesizzle, Faebloom Trick, Back for More, Curse
// of the Werefox, Foray of Orcs, Tip the Scales). "~ deals damage" is the spell as it last existed on the stack.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, isFullySupported, objIsType, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";
import { defOf } from "../src/cards";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const castIt = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => settle(run(s, planCast(s, pid, id, targets)));
const named = (s: GameState, re: RegExp) => s.battlefield.filter((id) => re.test(defOf(s, s.objects[id]!).name));
/** Only the cards the test put in hand: the rest of the opening hand goes back to the library. */
const onlyHand = (s: GameState, pid: PlayerId, ids: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !ids.includes(x))) moveObject(s, id, "library");
};

// Real oracle text (Scryfall).
const hypothesizzle = card("Hypothesizzle", "Instant", "{3}{U}{R}", { oracleText: "Draw two cards. Then you may discard a nonland card. When you do, Hypothesizzle deals 4 damage to target creature." });
const faebloom = card("Faebloom Trick", "Instant", "{2}{U}", { oracleText: "Create two 1/1 blue Faerie creature tokens with flying. When you do, tap target creature an opponent controls." });
const lithobraking = card("Lithobraking", "Instant", "{2}{R}", { oracleText: 'Create a Lander token. Then you may sacrifice an artifact. When you do, Lithobraking deals 2 damage to each creature. (A Lander token is an artifact with "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.")' });
const tipTheScales = card("Tip the Scales", "Sorcery", "{2}{B}", { oracleText: "Sacrifice a creature. When you do, all creatures get -X/-X until end of turn, where X is the sacrificed creature's toughness." });
const earthRumble = card("Earth Rumble", "Sorcery", "{3}{G}", { keywords: ["Fight", "Earthbend"], oracleText: "Earthbend 2. When you do, up to one target creature you control fights target creature an opponent controls. (To earthbend 2, target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped. Creatures that fight each deal damage equal to their power to the other.)" });
const foray = card("Foray of Orcs", "Sorcery", "{3}{R}", { keywords: ["Amass"], oracleText: "Amass Orcs 2. When you do, Foray of Orcs deals X damage to target creature an opponent controls, where X is the amassed Army's power. (To amass Orcs 2, put two +1/+1 counters on an Army you control. It's also an Orc. If you don't control an Army, create a 0/0 black Orc Army creature token first.)" });
const surrounded = card("Surrounded by Orcs", "Sorcery", "{3}{U}", { keywords: ["Amass", "Mill"], oracleText: "Amass Orcs 3, then target player mills X cards, where X is the amassed Army's power. (To amass Orcs 3, put three +1/+1 counters on an Army you control. It's also an Orc. If you don't control an Army, create a 0/0 black Orc Army creature token first.)" });
const backForMore = card("Back for More", "Instant", "{4}{B}{G}", { keywords: ["Fight"], oracleText: "Return target creature card from your graveyard to the battlefield. When you do, it fights up to one target creature you don't control. (Each deals damage equal to its power to the other.)" });
const werefox = card("Curse of the Werefox", "Sorcery", "{2}{G}", { keywords: ["Role token", "Fight"], oracleText: "Create a Monster Role token attached to target creature you control. When you do, that creature fights up to one target creature you don't control. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 and has trample. Creatures that fight each deal damage equal to their power to the other.)" });
const packGuardian = card("Pack Guardian", "Creature — Wolf Spirit", "{2}{G}{G}", { power: "4", toughness: "3", keywords: ["Flash"], oracleText: "Flash\nWhen this creature enters, you may discard a land card. If you do, create a 2/2 green Wolf creature token." });
const dokuchi = card("Dokuchi Silencer", "Creature — Human Ninja", "{1}{B}", { power: "2", toughness: "1", keywords: ["Ninjutsu"], oracleText: "Ninjutsu {1}{B} ({1}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, you may discard a creature card. When you do, destroy target creature or planeswalker that player controls." });
const rock = card("Big Rock", "Creature — Elemental", "{4}", { power: "1", toughness: "4" });
const proRed = card("Red Ward Knight", "Creature — Knight", "{1}{W}", { power: "2", toughness: "2", keywords: ["Protection"], oracleText: "Protection from red" });

describe("reflexive triggers of spells: parse", () => {
  it("the new shapes compile", () => supported(hypothesizzle, faebloom, lithobraking, tipTheScales, earthRumble, foray, surrounded, backForMore, werefox, packGuardian, dokuchi));
});

describe('"Then you may discard a nonland card. When you do"', () => {
  it("Hypothesizzle: only a nonland card can be discarded; the damage's target is chosen after the spell is gone", () => {
    const { s: s0, ap, ids, opp } = setup([hypothesizzle, bear(), forest]);
    const victim = putOnBattlefield(s0, opp, rock);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1, filter: { notTypes: ["Land"] } });
    expect(() => act(s, { type: "discard", player: ap, objectIds: [ids[2]!] })).toThrow(/nonland card/);
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    // The spell has finished resolving: it's in the graveyard before its reflexive trigger is put on the stack.
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] });
    expect(s.stack).toHaveLength(1);
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /Hypothesizzle deals 4 damage to Big Rock/.test(l.text))).toBe(true);
  });

  it("Hypothesizzle: with no nonland card to discard, nothing is asked and nothing triggers", () => {
    const { s: s0, ap, ids, opp } = setup([hypothesizzle, forest]);
    putOnBattlefield(s0, opp, rock);
    onlyHand(s0, ap, ids);
    // The two cards drawn are lands too.
    const lib = s0.players[ap]!.library;
    lib.sort((a, b) => Number(defOf(s0, s0.objects[b]!).types.includes("Land")) - Number(defOf(s0, s0.objects[a]!).types.includes("Land")));
    const s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("Hypothesizzle: its source is a red spell, so a creature with protection from red can't be its target", () => {
    const { s: s0, ap, ids, opp } = setup([hypothesizzle, bear()]);
    const knight = putOnBattlefield(s0, opp, proRed);
    const victim = putOnBattlefield(s0, opp, rock);
    let s = castIt(s0, ap, ids[0]!);
    s = settle(act(act(s, { type: "chooseMay", player: ap, yes: true }), { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(knight)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

  it("Pack Guardian: only a land card can be discarded for the Wolf", () => {
    const { s: s0, ap, ids } = setup([packGuardian, bear(), forest]);
    let s = castIt(s0, ap, ids[0]!);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", filter: { types: ["Land"] } });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[2]!] }));
    expect(named(s, /Wolf/)).toHaveLength(1);
  });
});

describe('"Create ... When you do" and "you may sacrifice ... When you do" in a spell', () => {
  it("Faebloom Trick: two Faeries, then the target to tap is chosen", () => {
    const { s: s0, ap, ids, opp } = setup([faebloom]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!);
    expect(named(s, /Faerie/)).toHaveLength(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("Lithobraking: sacrificing the Lander deals 2 damage to each creature; declining does nothing", () => {
    const { s: s0, ap, ids, opp } = setup([lithobraking, lithobraking]);
    const b = putOnBattlefield(s0, opp, bear());
    const r = putOnBattlefield(s0, opp, rock);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(named(s, /Lander/)).toHaveLength(1);
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = castIt(s, ap, ids[1]!);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Two Landers to choose from.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [named(s, /Lander/)[0]!] }));
    expect(named(s, /Lander/)).toHaveLength(1);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[r]!.damage).toBe(2);
  });

  it("Lithobraking: a bot sacrifices only when the damage hurts the opponents more", () => {
    const { s: s0, ap, ids, opp } = setup([lithobraking, lithobraking]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, bear());
    let s = castIt(s0, ap, ids[0]!);
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    for (const id of s.battlefield.filter((x) => objIsType(s, s.objects[x]!, "Creature") && s.objects[x]!.controller === ap)) moveObject(s, id, "graveyard");
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, bear());
    s = castIt(s, ap, ids[1]!);
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
  });

  it("Tip the Scales: X is the sacrificed creature's toughness as it last existed; with no creature, nothing", () => {
    const { s: s0, ap, ids, opp } = setup([tipTheScales, tipTheScales]);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    const mine = putOnBattlefield(s, ap, rock);
    const theirs = putOnBattlefield(s, opp, card("Huge Thing", "Creature — Beast", "{6}", { power: "6", toughness: "6" }));
    s.objects[mine]!.counters["+1/+1"] = 1;
    s = castIt(s, ap, ids[1]!);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    // 2/5 when sacrificed: -5/-5.
    expect(characteristics(s, s.objects[theirs]!).power).toBe(1);
    expect(characteristics(s, s.objects[theirs]!).toughness).toBe(1);
  });
});

describe('"Amass Orcs N. When you do" and "the amassed Army"', () => {
  it("Foray of Orcs: X is the amassed Army's power, an existing Army's too", () => {
    const { s: s0, ap, ids, opp } = setup([foray, foray]);
    const r = putOnBattlefield(s0, opp, rock);
    const b = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    let s = castIt(s0, ap, ids[0]!);
    const army = named(s, /Orc Army/)[0]!;
    expect(characteristics(s, s.objects[army]!).power).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(r)] }));
    expect(s.objects[r]!.damage).toBe(2);
    // The same Army gets two more: 4 damage.
    s = castIt(s, ap, ids[1]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(named(s, /Orc Army/)).toHaveLength(1);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Surrounded by Orcs: the target player mills the amassed Army's power", () => {
    const { s: s0, ap, ids, opp } = setup([surrounded]);
    const before = s0.players[opp]!.library.length;
    const s = castIt(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.library.length).toBe(before - 3);
  });
});

describe('"When you do, it / that creature fights up to one target creature"', () => {
  it("Back for More: the returned creature fights the target chosen after it's back", () => {
    const { s: s0, ap, ids, opp } = setup([backForMore]);
    const dead = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    moveObject(s0, dead, "graveyard");
    const b = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!, [target(dead)]);
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[dead]!.damage).toBe(2);
  });

  it("Back for More: choosing no creature to fight is allowed", () => {
    const { s: s0, ap, ids, opp } = setup([backForMore]);
    const dead = putOnBattlefield(s0, ap, bear());
    moveObject(s0, dead, "graveyard");
    const b = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!, [target(dead)]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[dead]!.zone).toBe("battlefield");
  });

  it("Curse of the Werefox: the creature with the Monster Role fights the creature chosen after", () => {
    const { s: s0, ap, ids, opp } = setup([werefox]);
    const mine = putOnBattlefield(s0, ap, bear());
    const r = putOnBattlefield(s0, opp, rock);
    let s = castIt(s0, ap, ids[0]!, [target(mine)]);
    expect(characteristics(s, s.objects[mine]!).power).toBe(3);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(r)] }));
    expect(s.objects[r]!.damage).toBe(3);
    expect(s.objects[mine]!.damage).toBe(1);
  });

  it("Earth Rumble: the land is earthbent, then up to one creature you control fights", () => {
    const { s: s0, ap, ids, opp } = setup([earthRumble]);
    const land = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest" && s0.objects[id]!.controller === ap)!;
    const b = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!, [target(land)]);
    expect(characteristics(s, s.objects[land]!).power).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(land), target(b)] }));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});
