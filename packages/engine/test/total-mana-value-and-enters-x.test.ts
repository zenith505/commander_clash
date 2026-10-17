// "Any number of target artifacts and/or enchantments with total mana value X or less" (TargetSpec.total): the targets
// chosen add up to no more than that (CR 601.2c), and over it as it resolves, every one is illegal (CR 608.2b; rulings on
// Nethroi and Reunion of the House). An enters trigger's X is the X its spell was cast with (CR 107.3m; rulings on Dune
// Drifter): for "with mana value X or less", "up to X target" and "if X is 5 or more". "Double the number of +1/+1
// counters on ..." puts as many more as each has (CR 701.10e).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";
import { chooseTargets } from "../src/bot";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
/** Casts `id` with this X and lets it resolve, up to its enters trigger asking for targets. */
const castX = (s: GameState, pid: PlayerId, id: string, x: number, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets, undefined, "auto", x)));

// Real oracle text (Scryfall).
const yaoGuai = card("Rampaging Yao Guai", "Creature — Bear Mutant", "{X}{G}{G}{G}", { power: "1", toughness: "1", keywords: ["Vigilance", "Trample"], oracleText: "Vigilance, trample\nThis creature enters with X +1/+1 counters on it.\nWhen this creature enters, destroy any number of target artifacts and/or enchantments with total mana value X or less." });
const orcus = card("Orcus, Prince of Undeath", "Legendary Creature — Demon", "{X}{2}{B}{R}", { power: "5", toughness: "3", keywords: ["Flying", "Trample"], oracleText: "Flying, trample\nWhen Orcus enters, choose one —\n• Each other creature gets -X/-X until end of turn. You lose X life.\n• Return up to X target creature cards with total mana value X or less from your graveyard to the battlefield. They gain haste until end of turn." });
const patchUp = card("Patch Up", "Sorcery", "{2}{W}", { oracleText: "Return up to three target creature cards with total mana value 3 or less from your graveyard to the battlefield." });
const march = card("March from the Tomb", "Sorcery", "{3}{W}{B}", { oracleText: "Return any number of target Ally creature cards with total mana value 8 or less from your graveyard to the battlefield." });
const kairi = card("Kairi, the Swirling Sky", "Legendary Creature — Dragon Spirit", "{4}{U}{U}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhen Kairi dies, choose one —\n• Return any number of target nonland permanents with total mana value 6 or less to their owners' hands.\n• Mill six cards, then return up to two instant and/or sorcery cards from your graveyard to your hand." });
const reunion = card("Reunion of the House", "Sorcery", "{5}{W}{W}", { oracleText: "Return any number of target creature cards with total power 10 or less from your graveyard to the battlefield. Exile Reunion of the House." });
const duneDrifter = card("Dune Drifter", "Artifact — Vehicle", "{X}{W}{B}", { power: "5", toughness: "3", keywords: ["Crew"], oracleText: "When this Vehicle enters, return target artifact or creature card with mana value X or less from your graveyard to the battlefield.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const kineticOoze = card("Kinetic Ooze", "Creature — Ooze", "{X}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\nWhen this creature enters, destroy up to one target artifact or enchantment with mana value X or less. If X is 5 or more, you draw a card. If X is 10 or more, double the number of +1/+1 counters on any number of other target creatures." });
const kalonian = card("Kalonian Hydra", "Creature — Hydra", "{3}{G}{G}", { power: "0", toughness: "0", keywords: ["Trample"], oracleText: "Trample\nThis creature enters with four +1/+1 counters on it.\nWhenever this creature attacks, double the number of +1/+1 counters on each creature you control." });
const deepglow = card("Deepglow Skate", "Creature — Fish", "{4}{U}", { power: "3", toughness: "3", oracleText: "When this creature enters, double the number of each kind of counter on any number of target permanents." });
const solidarity = card("Solidarity of Heroes", "Instant", "{1}{G}", { keywords: ["Strive"], oracleText: "Strive — This spell costs {1}{G} more to cast for each target beyond the first.\nChoose any number of target creatures. Double the number of +1/+1 counters on each of them." });
const study = card("Study the Classics", "Sorcery", "{2}{G}", { oracleText: "Put a +1/+1 counter on target creature, then double the number of +1/+1 counters on it. You gain life equal to the number of +1/+1 counters on that creature." });

const relic = (mv: number, name = `Relic ${mv}`) => card(name, "Artifact", `{${mv}}`);
const ally = (mv: number, name = `Ally ${mv}`) => card(name, "Creature — Human Ally", `{${mv}}`, { power: String(mv), toughness: "1" });
const dude = (mv: number, power = 1, name = `Dude ${mv}`) => card(name, "Creature — Human", `{${mv}}`, { power: String(power), toughness: "1" });

describe("total mana value and an enters trigger's own X", () => {
  it("parse", () => {
    supported(yaoGuai, orcus, patchUp, march, kairi, reunion, duneDrifter, kineticOoze, kalonian, deepglow, solidarity, study);
  });

  it("Rampaging Yao Guai: the artifacts it targets add up to X or less (CR 601.2c, 107.3m)", () => {
    const { s: s0, ap, ids, opp } = setup([yaoGuai]);
    const three = putOnBattlefield(s0, opp, relic(3));
    const two = putOnBattlefield(s0, opp, relic(2));
    const one = putOnBattlefield(s0, opp, relic(1));
    let s = castX(s0, ap, ids[0]!, 3);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // 3 + 1 is more than X = 3.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(three), target(one)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(two), target(one)] }));
    expect(s.objects[two]!.zone).toBe("graveyard");
    expect(s.objects[one]!.zone).toBe("graveyard");
    expect(s.objects[three]!.zone).toBe("battlefield");
  });

  it("Rampaging Yao Guai put onto the battlefield without being cast: X is 0, so only mana value 0 artifacts (CR 107.3m)", () => {
    const { s: s0, ap, opp } = setup([]);
    const one = putOnBattlefield(s0, opp, relic(1));
    const zero = putOnBattlefield(s0, opp, card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2" }));
    const g = inGraveyard(s0, ap, yaoGuai);
    moveObject(s0, g, "battlefield");
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(one)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(zero)] }));
    expect(s.objects[one]!.zone).toBe("battlefield");
    expect(s.objects[zero]!.zone).toBe("graveyard");
  });

  it("Patch Up: up to three creature cards with total mana value 3 or less", () => {
    const { s: s0, ap, ids } = setup([patchUp]);
    const a = inGraveyard(s0, ap, dude(1, 1, "One A"));
    const b = inGraveyard(s0, ap, dude(1, 1, "One B"));
    const c = inGraveyard(s0, ap, dude(2, 1, "Two"));
    expect(planCast(s0, ap, ids[0]!, [target(a), target(b), target(c)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b), target(c), { kind: "none" }])));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("March from the Tomb: any number of Allies with total mana value 8 or less", () => {
    const { s: s0, ap, ids } = setup([march]);
    const a = inGraveyard(s0, ap, ally(5));
    const b = inGraveyard(s0, ap, ally(3));
    const c = inGraveyard(s0, ap, ally(1));
    expect(planCast(s0, ap, ids[0]!, [target(a), target(b), target(c)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)])));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[c]!.zone).toBe("graveyard");
  });

  it("Reunion of the House: total power over 10 as it resolves makes every target illegal (rulings)", () => {
    const { s: s0, ap, ids } = setup([reunion]);
    const a = inGraveyard(s0, ap, dude(2, 6, "Six"));
    const b = inGraveyard(s0, ap, dude(2, 4, "Four"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)]));
    // Its power changes in the graveyard before it resolves (a characteristic-defining ability, say).
    s.cards[s.objects[b]!.cardId]!.power = "5";
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard"); // it doesn't resolve, so it isn't exiled
  });

  it("Orcus: up to X target creature cards with total mana value X or less, and they gain haste", () => {
    const { s: s0, ap, ids } = setup([orcus]);
    const a = inGraveyard(s0, ap, dude(1, 1, "One A"));
    const b = inGraveyard(s0, ap, dude(1, 1, "One B"));
    const c = inGraveyard(s0, ap, dude(1, 1, "One C"));
    const d = inGraveyard(s0, ap, dude(2, 1, "Two"));
    let s = castX(s0, ap, ids[0]!, 2);
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, x: 2 });
    // Three cards is more than X = 2; 1 + 2 is more than a total of 2.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(a), target(b), target(c)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(a), target(d)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(a), target(b)] }));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[c]!.zone).toBe("graveyard");
  });

  it("Dune Drifter: the card it returns has mana value X or less, X of its spell (rulings)", () => {
    const { s: s0, ap, ids } = setup([duneDrifter]);
    const two = inGraveyard(s0, ap, dude(2, 1, "Two"));
    const three = inGraveyard(s0, ap, dude(3, 1, "Three"));
    let s = castX(s0, ap, ids[0]!, 2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(three)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(two)] }));
    expect(s.objects[two]!.zone).toBe("battlefield");
    expect(s.objects[three]!.zone).toBe("graveyard");
  });

  it("Kinetic Ooze: X 5 draws a card; X 10 doubles the +1/+1 counters on the other creatures it targets", () => {
    const { s: s0, ap, ids, opp } = setup([kineticOoze, kineticOoze]);
    const art = putOnBattlefield(s0, opp, relic(4));
    const hand = s0.players[ap]!.hand.length;
    let s = castX(s0, ap, ids[0]!, 5);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(art)] }));
    expect(s.objects[art]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    // The second one, cast for 10 (the setup's 14 lands pay {10}{G} with one left over).
    const first = ids[0]!;
    const friend = putOnBattlefield(s, ap, bear());
    s.objects[friend]!.counters["+1/+1"] = 2;
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = castX(s, ap, ids[1]!, 10);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // "Other": not the Ooze itself.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }, target(ids[1]!)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }, target(friend), target(first)] }));
    expect(s.objects[friend]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[first]!.counters["+1/+1"]).toBe(10);
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(10);
  });

  it("Kalonian Hydra: attacking doubles the +1/+1 counters on each creature you control (CR 701.10e)", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, kalonian);
    s0.objects[h]!.counters["+1/+1"] = 4;
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    const plain = putOnBattlefield(s0, ap, bear());
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = settle(s);
    expect(s.objects[h]!.counters["+1/+1"]).toBe(8);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[plain]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Deepglow Skate: each kind of counter on each target permanent is doubled", () => {
    const { s: s0, ap, ids, opp } = setup([deepglow]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 2;
    s0.objects[b]!.counters.charge = 3;
    const foe = putOnBattlefield(s0, opp, bear());
    s0.objects[foe]!.counters["-1/-1"] = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b), target(foe)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[b]!.counters.charge).toBe(6);
    expect(s.objects[foe]!.zone).toBe("graveyard"); // two -1/-1 counters on a 2/2
  });

  it("Study the Classics: put a counter, then double them, then gain that much life", () => {
    const { s: s0, ap, ids } = setup([study]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 2;
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)])));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(6);
    expect(s.players[ap]!.life).toBe(life + 6);
  });

  it("bots keep to the total when choosing targets", () => {
    const { s, ap } = setup([]);
    const a = inGraveyard(s, ap, dude(2, 5, "Two A"));
    const b = inGraveyard(s, ap, dude(2, 5, "Two B"));
    const c = inGraveyard(s, ap, dude(1, 1, "One"));
    const picks = chooseTargets(s, ap, compileCard(patchUp).spell!, true)!.flatMap((t) => (t.kind === "object" ? [t.id] : []));
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.reduce((n, id) => n + ({ [a]: 2, [b]: 2, [c]: 1 } as Record<string, number>)[id]!, 0)).toBeLessThanOrEqual(3);
  });
});
