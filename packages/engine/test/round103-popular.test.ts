// Round 103, in popularity order: Fell the Mighty (a group bound by its own target's power), Guide of Souls (two kinds of
// counters on a target), Odric, Lunarch Marshal (keywords shared as it resolves, hexproof variants too), Arid Archway
// ("if another Desert was returned this way"), Westvale Abbey (transform, then untap it), Heliod's Intervention (twice X
// life), Chandra, Torch of Defiance (cast the exiled card now or take 2).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const fell = card("Fell the Mighty", "Sorcery", "{4}{W}", { oracleText: "Destroy all creatures with power greater than target creature's power." });
const guide = card("Guide of Souls", "Creature — Human Cleric", "{W}", { power: "1", toughness: "2", oracleText: "Whenever another creature you control enters, you gain 1 life and get {E} (an energy counter).\nWhenever you attack, you may pay {E}{E}{E}. When you do, put two +1/+1 counters and a flying counter on target attacking creature. It becomes an Angel in addition to its other types." });
const odric = card("Odric, Lunarch Marshal", "Legendary Creature — Human Soldier", "{3}{W}", { power: "3", toughness: "3", oracleText: "At the beginning of each combat, creatures you control gain first strike until end of turn if a creature you control has first strike. The same is true for flying, deathtouch, double strike, haste, hexproof, indestructible, lifelink, menace, reach, skulk, trample, and vigilance." });
const archway = card("Arid Archway", "Land — Desert", "", { keywords: ["Surveil"], oracleText: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand. If another Desert was returned this way, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{T}: Add {C}{C}." });
const desert = card("Desert", "Land — Desert", "", { oracleText: "{T}: Add {C}.\n{T}: Desert deals 1 damage to target attacking creature. Activate only during the end of combat step." });
const abbey = scry("transform", [
  { name: "Westvale Abbey", type_line: "Land", oracle_text: "{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it." },
  { name: "Ormendahl, Profane Prince", type_line: "Legendary Creature — Demon", color_indicator: ["B"], power: "9", toughness: "7", oracle_text: "Flying, lifelink, indestructible, haste" },
]);
const heliod = card("Heliod's Intervention", "Instant", "{X}{W}{W}", { oracleText: "Choose one —\n• Destroy X target artifacts and/or enchantments.\n• Target player gains twice X life." });
const chandra = card("Chandra, Torch of Defiance", "Legendary Planeswalker — Chandra", "{2}{R}{R}", { loyalty: "4", oracleText: "+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"" });

const creature = (name: string, p: number, extra: string[] = []) => card(name, "Creature — Beast", "{1}", { power: String(p), toughness: "4", keywords: extra, oracleText: extra.join("\n") });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const run = (s: GameState, plan: ReturnType<typeof planCast> | ReturnType<typeof planActivate>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const lives = (s: GameState) => Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.life]));

describe("round 103: popular cards", () => {
  it("parse", () => [fell, guide, odric, archway, abbey, heliod, chandra].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Fell the Mighty destroys each creature with greater power than the target's, hexproof ones too, not the target", () => {
    const { s: s0, ap, opp, ids } = setup([fell]);
    const two = putOnBattlefield(s0, ap, creature("Two", 2));
    const one = putOnBattlefield(s0, opp, creature("One", 1));
    const three = putOnBattlefield(s0, opp, creature("Three", 3, ["Hexproof"]));
    const twoToo = putOnBattlefield(s0, opp, creature("Two Too", 2));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(two)])));
    expect(s.objects[two]!.zone).toBe("battlefield");
    expect(s.objects[one]!.zone).toBe("battlefield");
    expect(s.objects[twoToo]!.zone).toBe("battlefield");
    expect(s.objects[three]!.zone).toBe("graveyard");
  });

  it("Fell the Mighty uses the target's power as it resolves", () => {
    const { s: s0, ap, opp, ids } = setup([fell]);
    const two = putOnBattlefield(s0, ap, creature("Two", 2));
    const three = putOnBattlefield(s0, opp, creature("Three", 3));
    const five = putOnBattlefield(s0, opp, creature("Five", 5));
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(two)]));
    // Before it resolves, the target gets +2/+0 (its power is now 4): only Five dies.
    s.objects[two]!.counters = { "+1/+1": 2 };
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[three]!.zone).toBe("battlefield");
    expect(s.objects[five]!.zone).toBe("graveyard");
  });

  it("Guide of Souls: energy for each creature entering; three energy puts the counters on an attacker and makes it an Angel", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, guide);
    const bear = putOnBattlefield(s0, ap, creature("Bear", 2));
    s0.players[ap]!.energy = 3;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bear)] }));
    expect(s.players[ap]!.energy).toBe(0);
    expect(s.objects[bear]!.counters).toMatchObject({ "+1/+1": 2, flying: 1 });
    const ch = characteristics(s, s.objects[bear]!);
    expect(ch.keywords).toContain("Flying");
    expect(ch.subtypes).toContain("Angel");
    expect(ch.power).toBe(4);
  });

  it("Odric: each listed keyword a creature you control has, all your creatures gain, hexproof from a color included", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, odric);
    const flier = putOnBattlefield(s0, ap, creature("Flier", 1, ["Flying"]));
    putOnBattlefield(s0, ap, card("Hexer", "Creature — Beast", "{1}", { power: "1", toughness: "1", oracleText: "Hexproof from blue" }));
    const plain = putOnBattlefield(s0, ap, creature("Plain", 2));
    let s = settle(passUntil(s0, "beginCombat", ap));
    const ch = characteristics(s, s.objects[plain]!);
    expect(ch.keywords).toContain("Flying");
    expect(ch.keywords).toContain("Hexproof from blue");
    expect(ch.keywords).not.toContain("Hexproof");
    expect(ch.keywords).not.toContain("First strike");
    expect(characteristics(s, s.objects[flier]!).keywords).toContain("Hexproof from blue");
  });

  it("Odric: a creature gaining a keyword later in the turn doesn't spread it (locked in as it resolves)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, odric);
    const plain = putOnBattlefield(s0, ap, creature("Plain", 2));
    let s = settle(passUntil(s0, "beginCombat", ap));
    putOnBattlefield(s, ap, creature("Late Flier", 1, ["Flying"]));
    expect(characteristics(s, s.objects[plain]!).keywords).not.toContain("Flying");
  });

  const playArchway = (bounce: "desert" | "self" | "other") => {
    const { s: s0, ap, ids } = setup([archway]);
    const d = putOnBattlefield(s0, ap, desert);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const pick = bounce === "desert" ? d : bounce === "self" ? ids[0]! : s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest" && s.objects[id]!.controller === ap)!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [pick] });
    return { s, ap, pick };
  };

  it("Arid Archway: returning another Desert surveils 1", () => {
    const { s, ap, pick } = playArchway("desert");
    expect(s.objects[pick]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "surveil", player: ap });
  });

  it("Arid Archway: returning itself or a land that isn't a Desert doesn't", () => {
    for (const which of ["self", "other"] as const) {
      const { s, pick } = playArchway(which);
      expect(s.objects[pick]!.zone).toBe("hand");
      expect(s.pending?.kind === "arrangeTop").toBe(false);
    }
  });

  it("Westvale Abbey: sacrificing five creatures transforms it into Ormendahl, untapped", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, abbey);
    const fodder = [1, 2, 3, 4, 5].map((i) => putOnBattlefield(s0, ap, creature(`Cleric ${i}`, 1)));
    let s = run(s0, planActivate(s0, ap, a, 1, [], undefined, undefined, undefined, { sacrifice: fodder }));
    expect(s.objects[a]!.tapped).toBe(true);
    s = settle(s);
    const ch = characteristics(s, s.objects[a]!);
    expect(ch.name).toBe("Ormendahl, Profane Prince");
    expect(ch.types).toContain("Creature");
    expect(s.objects[a]!.tapped).toBe(false);
    for (const f of fodder) expect(s.objects[f]!.zone).toBe("graveyard");
  });

  it("Heliod's Intervention: a player gains twice X life", () => {
    const { s: s0, ap, opp, ids } = setup([heliod]);
    s0.players[opp]!.life = 30;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], [1], undefined, 3)));
    expect(s.players[opp]!.life).toBe(36);
  });

  it("Chandra +1: casting the exiled card deals no damage; declining deals 2 to each opponent", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra);
    const top = putOnBattlefield(s0, ap, shock);
    s0.battlefield.splice(s0.battlefield.indexOf(top), 1);
    s0.objects[top]!.zone = "library";
    s0.players[ap]!.library.unshift(top);
    const before = lives(s0);
    let s = settle(run(s0, planActivate(s0, ap, c, 0)));
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid", objectId: top });
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s = settle(run(s, planCast(s, ap, top, [{ kind: "player", id: opp }], undefined, "auto")));
    expect(s.objects[top]!.zone).toBe("graveyard");
    for (const p of s.turnOrder) expect(s.players[p]!.life).toBe(before[p]! - (p === opp ? 2 : 0));

    // Declined: 2 to each opponent.
    const d0 = setup([]);
    const c2 = putOnBattlefield(d0.s, d0.ap, chandra);
    let d = settle(run(d0.s, planActivate(d0.s, d0.ap, c2, 0)));
    if (d.pending?.kind === "castFree") d = settle(act(d, { type: "chooseMay", player: d0.ap, yes: false }));
    for (const p of d.turnOrder) expect(d.players[p]!.life).toBe(p === d0.ap ? 40 : 38);
  });

  it("Chandra +1: a land exiled can't be cast, so 2 to each opponent", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra);
    const top = s0.players[ap]!.library[0]!;
    expect(s0.cards[s0.objects[top]!.cardId]!.name).toBe(forest.name);
    const s = settle(run(s0, planActivate(s0, ap, c, 0)));
    expect(s.pending).toBeNull();
    for (const p of s.turnOrder) expect(s.players[p]!.life).toBe(p === ap ? 40 : 38);
  });
});
