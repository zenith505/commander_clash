// Targets that only an optional part of a spell needs: "If part of a spell's ability has its effect only if that spell
// was kicked, and that part of the ability includes any targets, the spell's controller chooses those targets only if
// that spell was kicked. Otherwise, the spell is cast as if it did not have those targets" (CR 702.33g), and the same
// for bargain (702.166d), teamwork (702.194c) and gift (702.174m). With "instead", the targets of the part it replaces
// are chosen only if it wasn't paid (rulings on gift: "alternative or additional targets").
// Also "sacrifices a creature with the greatest power among creatures they control" (Crackling Doom).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, characteristics, controllerOf, isFullySupported, nameOf, objHasKeyword, planCast, power, spellTargets, toughness, waitingOn, type Action, type CardDef, type GameState, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const MANA_ONLY = /^not enough mana/;
const NONE: TargetChoice = { kind: "none" };
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

// Real oracle text (Scryfall).
const floodMaw = card("Into the Flood Maw", "Instant", "{U}", { keywords: ["Gift"], oracleText: "Gift a tapped Fish (You may promise an opponent a gift as you cast this spell. If you do, they create a tapped 1/1 blue Fish creature token before its other effects.)\nReturn target creature an opponent controls to its owner's hand. If the gift was promised, instead return target nonland permanent an opponent controls to its owner's hand." });
const wearDown = card("Wear Down", "Sorcery", "{1}{G}", { keywords: ["Gift"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nDestroy target artifact or enchantment. If the gift was promised, instead destroy two target artifacts and/or enchantments." });
const mindSpiral = card("Mind Spiral", "Sorcery", "{4}{U}", { keywords: ["Gift"], oracleText: "Gift a tapped Fish (You may promise an opponent a gift as you cast this spell. If you do, they create a tapped 1/1 blue Fish creature token before its other effects.)\nTarget player draws three cards. If the gift was promised, tap target creature an opponent controls and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const cruelAlliance = card("Cruel Alliance", "Sorcery", "{2}{B}", { keywords: ["Teamwork"], oracleText: "Teamwork 2 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 2 or more.)\nExile target creature with mana value 3 or less. If this spell was cast using teamwork, instead exile target creature and you gain 3 life." });
const thirst = card("Bloodchief's Thirst", "Sorcery", "{B}", { keywords: ["Kicker"], oracleText: "Kicker {2}{B} (You may pay an additional {2}{B} as you cast this spell.)\nDestroy target creature or planeswalker with mana value 2 or less. If this spell was kicked, instead destroy target creature or planeswalker." });
const jilt = card("Jilt", "Instant", "{1}{U}", { keywords: ["Kicker"], oracleText: "Kicker {1}{R} (You may pay an additional {1}{R} as you cast this spell.)\nReturn target creature to its owner's hand. If this spell was kicked, it deals 2 damage to another target creature." });
const braveTheWilds = card("Brave the Wilds", "Sorcery", "{G}", { keywords: ["Bargain"], oracleText: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nIf this spell was bargained, target land you control becomes a 3/3 Elemental creature with haste that's still a land.\nSearch your library for a basic land card, reveal it, put it into your hand, then shuffle." });
const tearAsunder = card("Tear Asunder", "Instant", "{1}{G}", { keywords: ["Kicker"], oracleText: "Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)\nExile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead." });
const wildfireHowl = card("Wildfire Howl", "Sorcery", "{1}{R}{R}", { keywords: ["Gift"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nWildfire Howl deals 2 damage to each creature. If the gift was promised, instead Wildfire Howl deals 1 damage to any target and 2 damage to each creature." });
const consumedByGreed = card("Consumed by Greed", "Instant", "{1}{B}{B}", { keywords: ["Gift"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nTarget opponent sacrifices a creature with the greatest power among creatures they control. If the gift was promised, return target creature card from your graveyard to your hand." });
const cracklingDoom = card("Crackling Doom", "Instant", "{R}{W}{B}", { oracleText: "Crackling Doom deals 2 damage to each opponent. Each opponent sacrifices a creature with the greatest power among creatures that player controls." });
const fightWithFire = card("Fight with Fire", "Sorcery", "{2}{R}", { keywords: ["Kicker"], oracleText: "Kicker {5}{R} (You may pay an additional {5}{R} as you cast this spell.)\nFight with Fire deals 5 damage to target creature. If this spell was kicked, it deals 10 damage divided as you choose among any number of targets instead. (Those targets can include players and planeswalkers.)" });
const giant = (name = "Hill Giant Test") => card(name, "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" });
const relic = (name = "Relic Test") => card(name, "Artifact", "{2}");
const clue = card("Clue Test", "Token Artifact — Clue", "");

describe("targets only an optional part needs", () => {
  it("parses", () => {
    supported(fightWithFire, floodMaw, wearDown, mindSpiral, cruelAlliance, thirst, jilt, braveTheWilds, tearAsunder, wildfireHowl, consumedByGreed, cracklingDoom);
  });

  it("instead (gift): one target without the gift, the other with it", () => {
    const { s, ap, opp, ids } = setup([floodMaw]);
    const b = putOnBattlefield(s, opp, bear());
    const r = putOnBattlefield(s, opp, relic());
    const id = ids[0]!;
    expect(spellTargets(s, id).map((t) => !!t.skip)).toEqual([false, true]);
    expect(spellTargets(s, id, undefined, undefined, { gift: true }).map((t) => !!t.skip)).toEqual([true, false]);
    // Without the gift: the creature, and nothing for the other.
    expect(castProblem(s, ap, id, [target(b), NONE])).toMatch(MANA_ONLY);
    expect(castProblem(s, ap, id, [NONE, target(r)])).toMatch(/illegal target/);
    expect(castProblem(s, ap, id, [target(b), target(r)])).toMatch(/illegal target/);
    // With it: any nonland permanent, and nothing for the creature.
    expect(castProblem(s, ap, id, [NONE, target(r)], undefined, undefined, undefined, undefined, { gift: opp })).toMatch(MANA_ONLY);
    expect(castProblem(s, ap, id, [target(b), NONE], undefined, undefined, undefined, undefined, { gift: opp })).toMatch(/illegal target/);
  });

  it("instead (gift): resolves on the target it has", () => {
    const { s: s0, ap, opp, ids } = setup([floodMaw]);
    putOnBattlefield(s0, opp, bear());
    const r = putOnBattlefield(s0, opp, relic());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [NONE, target(r)], undefined, "auto", undefined, { gift: opp })));
    expect(s.objects[r]!.zone).toBe("hand");
    expect(s.battlefield.some((x) => controllerOf(s, s.objects[x]!) === opp && nameOf(s, x).startsWith("Fish"))).toBe(true);
  });

  it("can be cast if only the paid version has legal targets", () => {
    const { s, ap, opp, ids } = setup([floodMaw]);
    putOnBattlefield(s, opp, relic());
    expect(castProblem(s, ap, ids[0]!)).toMatch(MANA_ONLY);
    // But not without the gift.
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, {})).toMatch(/no legal targets/);
  });

  it("instead (gift, two targets): two artifacts and/or enchantments", () => {
    const { s: s0, ap, opp, ids } = setup([wearDown]);
    const r1 = putOnBattlefield(s0, opp, relic());
    const r2 = putOnBattlefield(s0, opp, relic("Other Relic"));
    expect(spellTargets(s0, ids[0]!, undefined, undefined, { gift: true }).filter((t) => !t.skip)).toHaveLength(2);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [NONE, target(r1), target(r2)], undefined, "auto", undefined, { gift: opp })));
    expect(s.objects[r1]!.zone).toBe("graveyard");
    expect(s.objects[r2]!.zone).toBe("graveyard");
  });

  it("additional (gift): no second target without the gift", () => {
    const { s: s0, ap, opp, ids } = setup([mindSpiral]);
    const b = putOnBattlefield(s0, opp, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }, NONE])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    expect(s.objects[b]!.tapped).toBe(false);
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([mindSpiral]);
    const b1 = putOnBattlefield(s1, opp1, bear());
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [{ kind: "player", id: ap1 }, target(b1)], undefined, "auto", undefined, { gift: opp1 })));
    expect(s.objects[b1]!.tapped).toBe(true);
    expect(s.objects[b1]!.counters.stun).toBe(1);
  });

  it("instead (teamwork): any creature, and 3 life", () => {
    const { s: s0, ap, opp, ids } = setup([cruelAlliance]);
    const g = putOnBattlefield(s0, opp, giant());
    const helper = putOnBattlefield(s0, ap, bear());
    // Without teamwork the 4-mana giant isn't a legal target.
    expect(castProblem(s0, ap, ids[0]!, [target(g), NONE])).toMatch(/illegal target/);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [NONE, target(g)], undefined, "auto", undefined, { teamwork: [helper] })));
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(43);
  });

  it("instead (kicker): any creature or planeswalker when kicked", () => {
    const { s: s0, ap, opp, ids } = setup([thirst]);
    const g = putOnBattlefield(s0, opp, giant());
    expect(castProblem(s0, ap, ids[0]!, [target(g), NONE])).toMatch(/illegal target/);
    expect(castProblem(s0, ap, ids[0]!, [target(g), NONE], undefined, undefined, undefined, undefined, { kicks: [0] })).toMatch(/illegal target/);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [NONE, target(g)], undefined, "auto", undefined, { kicks: [0] })));
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("instead (kicker, trailing): exile a nonland permanent", () => {
    const { s: s0, ap, opp, ids } = setup([tearAsunder]);
    const g = putOnBattlefield(s0, opp, giant());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [NONE, target(g)], undefined, "auto", undefined, { kicks: [0] })));
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("additional (kicker): another target creature only when kicked", () => {
    const { s: s0, ap, opp, ids } = setup([jilt]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    expect(castProblem(s0, ap, ids[0]!, [target(a), target(b)])).toMatch(/illegal target/);
    expect(castProblem(s0, ap, ids[0]!, [target(a), NONE], undefined, undefined, undefined, undefined, { kicks: [0] })).toMatch(/illegal target/);
    expect(castProblem(s0, ap, ids[0]!, [target(a), target(a)], undefined, undefined, undefined, undefined, { kicks: [0] })).toMatch(/illegal target/);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)], undefined, "auto", undefined, { kicks: [0] })));
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("graveyard");
    // Not kicked: just the bounce.
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([jilt]);
    const c = putOnBattlefield(s1, opp1, bear());
    const d = putOnBattlefield(s1, opp1, bear({ name: "Other Bear" }));
    const s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!, [target(c), NONE])));
    expect(s2.objects[c]!.zone).toBe("hand");
    expect(s2.objects[d]!.damage).toBe(0);
  });

  it("instead (kicker, divided): 10 damage divided among any number of targets, or 5 to one creature", () => {
    const { s: s0, ap, opp, ids } = setup([fightWithFire]);
    const g = putOnBattlefield(s0, opp, giant());
    const none = Array.from({ length: 10 }, () => NONE);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(g), ...none])));
    expect(s.objects[g]!.zone).toBe("graveyard");
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([fightWithFire]);
    const g1 = putOnBattlefield(s1, opp1, giant());
    const split: TargetChoice[] = [{ kind: "object", id: g1, amount: 4 }, { kind: "player", id: opp1, amount: 6 }, ...none.slice(2)];
    expect(castProblem(s1, ap1, ids1[0]!, [NONE, ...split], undefined, undefined, undefined, undefined, { kicks: [0] })).toMatch(MANA_ONLY);
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [NONE, ...split], undefined, "auto", undefined, { kicks: [0] })));
    expect(s.objects[g1]!.zone).toBe("graveyard");
    expect(s.players[opp1]!.life).toBe(34);
  });

  it("bargain: a land becomes a 3/3 Elemental with haste that's still a land", () => {
    const { s: s0, ap, ids } = setup([braveTheWilds]);
    const token = putOnBattlefield(s0, ap, clue);
    s0.objects[token]!.isToken = true;
    const land = s0.battlefield.find((x) => controllerOf(s0, s0.objects[x]!) === ap && nameOf(s0, x) === "Forest")!;
    expect(spellTargets(s0, ids[0]!).every((t) => t.skip)).toBe(true);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(land)], undefined, "auto", undefined, { bargain: token }));
    s = settle(s);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    const c = characteristics(s, s.objects[land]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Elemental"]));
    expect(power(s, s.objects[land]!)).toBe(3);
    expect(toughness(s, s.objects[land]!)).toBe(3);
    expect(objHasKeyword(s, s.objects[land]!, "Haste")).toBe(true);
  });

  it("bargain: not bargained, it has no target and just searches", () => {
    const { s: s0, ap, ids } = setup([braveTheWilds]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [NONE]));
    expect(s.stack.at(-1)?.targets).toEqual([NONE]);
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
  });

  it("instead (gift): 1 damage to any target as well", () => {
    const { s: s0, ap, opp, ids } = setup([wildfireHowl]);
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", undefined, { gift: opp })));
    expect(s.players[opp]!.life).toBe(39);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("a copy keeps the targets the original has (CR 707.10)", () => {
    const { s, ap, opp, ids } = setup([floodMaw]);
    putOnBattlefield(s, opp, relic());
    const s1 = run(s, planCast(s, ap, ids[0]!, [NONE, target(s.battlefield.find((x) => nameOf(s, x) === "Relic Test")!)], undefined, "auto", undefined, { gift: opp }));
    expect(s1.stack.at(-1)?.body?.targets.map((t) => !!t.skip)).toEqual([true, false]);
  });

  it("bots kick Bloodchief's Thirst for a creature it couldn't otherwise destroy", () => {
    const { s: s0, ap, opp, ids } = setup([thirst]);
    const g = putOnBattlefield(s0, opp, giant());
    // Nothing else to cast first, with one of the two Swamps.
    s0.players[ap]!.command = [];
    s0.players[ap]!.hand = [ids[0]!];
    let s = s0;
    for (let i = 0; i < 30 && s.stack.at(-1)?.objectId !== ids[0]; i++)
      if (s.stack.length || waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else for (const x of botActions(s, ap)) s = act(s, x);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids[0], kicked: [0], targets: [NONE, { kind: "object", id: g }] });
  });
});

describe("sacrifices a creature with the greatest power", () => {
  it("only the greatest, or a choice among those tied for it", () => {
    const { s: s0, ap, opp, ids } = setup([cracklingDoom]);
    const small = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, giant());
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const t1 = putOnBattlefield(s0, others[0]!, giant("Giant A"));
    const t2 = putOnBattlefield(s0, others[0]!, giant("Giant B"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: others[0], options: expect.arrayContaining([t1, t2]) });
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toHaveLength(2);
    s = settle(act(s, { type: "pickPermanents", player: others[0]!, ids: [t2] }));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[t2]!.zone).toBe("graveyard");
    expect(s.objects[t1]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(38);
  });

  it("gift: also returns a creature card from your graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([consumedByGreed]);
    putOnBattlefield(s0, opp, giant());
    const dead = putOnBattlefield(s0, ap, bear());
    s0.battlefield.splice(s0.battlefield.indexOf(dead), 1);
    s0.objects[dead]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(dead);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: opp }, target(dead)])).toMatch(/illegal target/);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, target(dead)], undefined, "auto", undefined, { gift: opp })));
    expect(s.objects[dead]!.zone).toBe("hand");
  });
});
