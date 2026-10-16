// Alternative costs with a condition or a text change: surge (CR 702.117a: if you've cast another spell this turn; no
// teammates in free-for-all), spectacle (702.137a: if an opponent lost life this turn), "if its surge / spectacle cost
// was paid"; overload (702.96a-b: "target" becomes "each", so the spell has no targets and hexproof doesn't stop it;
// its mana value doesn't change, and a copy is overloaded too, CR 707.10).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, characteristics, isFullySupported, loseLife, planCast, spellManaValue, type Action, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const rift = card("Cyclonic Rift", "Instant", "{1}{U}", { keywords: ["Overload"], oracleText: 'Return target nonland permanent you don\'t control to its owner\'s hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")' });
const damn = card("Damn", "Sorcery", "{B}{B}", { keywords: ["Overload"], oracleText: 'Destroy target creature. A creature destroyed this way can\'t be regenerated.\nOverload {2}{W}{W} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")' });
const electrickery = card("Electrickery", "Instant", "{R}", { keywords: ["Overload"], oracleText: 'Electrickery deals 1 damage to target creature you don\'t control.\nOverload {1}{R} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")' });
const vandalblast = card("Vandalblast", "Sorcery", "{R}", { keywords: ["Overload"], oracleText: 'Destroy target artifact you don\'t control.\nOverload {4}{R} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")' });
const skewer = card("Skewer the Critics", "Sorcery", "{2}{R}", { keywords: ["Spectacle"], oracleText: "Spectacle {R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nSkewer the Critics deals 3 damage to any target." });
const rafter = card("Rafter Demon", "Creature — Demon", "{2}{B}{R}", { power: "4", toughness: "2", keywords: ["Spectacle"], oracleText: "Spectacle {3}{B}{R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nWhen this creature enters, if its spectacle cost was paid, each opponent discards a card." });
const analysis = card("Comparative Analysis", "Instant", "{3}{U}", { keywords: ["Surge"], oracleText: "Surge {2}{U} (You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.)\nTarget player draws two cards." });
const crush = card("Crush of Tentacles", "Sorcery", "{4}{U}{U}", { keywords: ["Surge"], oracleText: "Surge {3}{U}{U} (You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.)\nReturn all nonland permanents to their owners' hands. If this spell's surge cost was paid, create an 8/8 blue Octopus creature token." });
const bushwhacker = card("Reckless Bushwhacker", "Creature — Goblin Warrior Ally", "{2}{R}", { power: "2", toughness: "1", keywords: ["Haste", "Surge"], oracleText: "Surge {1}{R} (You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.)\nHaste\nWhen this creature enters, if its surge cost was paid, other creatures you control get +1/+0 and gain haste until end of turn." });
const cheap = bear({ name: "Cheap Bear" });
const hexproofBear = bear({ name: "Slippery Bear", keywords: ["Hexproof"], oracleText: "Hexproof" });
const regenBear = bear({ name: "River Boa", oracleText: "{G}: Regenerate this creature." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
const flier = bear({ name: "Bird Bear", keywords: ["Flying"], oracleText: "Flying" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const castFor = (s: GameState, pid: number, id: string, alt: "overload" | "surge" | "spectacle", x?: number, targets?: ReturnType<typeof target>[]) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, { alt }));

describe("overload", () => {
  it("parses", () => supported(rift, damn, electrickery, vandalblast));

  it("Cyclonic Rift: one target normally; overloaded, each nonland permanent you don't control, hexproof or not", () => {
    const { s: s0, ap, ids, opp } = setup([rift, rift]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear()), shy = putOnBattlefield(s0, opp, hexproofBear), stone = putOnBattlefield(s0, opp, relic);
    expect(castProblem(s0, ap, ids[0]!, [target(shy)])).not.toBeNull(); // hexproof: can't be targeted
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)])));
    expect(s.players[opp]!.hand).toContain(theirs);
    s = castFor(s, ap, ids[1]!, "overload");
    const spell = s.stack[s.stack.length - 1]!;
    expect(spell.targets ?? []).toHaveLength(0);
    expect(spellManaValue(s, spell)).toBe(2); // its mana cost doesn't change
    s = passAll(s);
    expect(s.players[opp]!.hand).toEqual(expect.arrayContaining([shy, stone]));
    expect(s.battlefield).toContain(mine);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp && !/Basic Land/.test(s.cards[s.objects[id]!.cardId]!.typeLine))).toHaveLength(0);
  });

  it("Damn overloaded: each creature, and none can be regenerated", () => {
    const { s: s0, ap, ids, opp } = setup([damn]);
    const a = putOnBattlefield(s0, ap, bear()), boa = putOnBattlefield(s0, opp, regenBear);
    s0.objects[boa]!.regenShields = 1;
    const s = passAll(castFor(s0, ap, ids[0]!, "overload"));
    expect(s.battlefield).not.toContain(a);
    expect(s.battlefield).not.toContain(boa);
  });

  it("bots overload Electrickery into several creatures, and cast it normally into one", () => {
    const { s: s0, ap, ids, opp } = setup([electrickery]);
    s0.players[ap]!.hand = [...ids];
    s0.players[ap]!.command = [];
    putOnBattlefield(s0, opp, bear({ toughness: "1", name: "Frail Bear" }));
    const one = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(one?.type === "castSpell" ? one.alt : undefined).toBeUndefined();
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, bear({ toughness: "1", name: "Frail Bear" }));
    const many = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(many?.type === "castSpell" ? many.alt : undefined).toBe("overload");
  });

  it("Vandalblast overloaded only hits artifacts you don't control", () => {
    const { s: s0, ap, ids, opp } = setup([vandalblast]);
    const mineStone = putOnBattlefield(s0, ap, relic), theirs = [putOnBattlefield(s0, opp, relic), putOnBattlefield(s0, opp, relic)];
    const s = passAll(castFor(s0, ap, ids[0]!, "overload"));
    expect(s.battlefield).toContain(mineStone);
    for (const id of theirs) expect(s.battlefield).not.toContain(id);
  });
});

describe("spectacle and surge", () => {
  it("parses", () => supported(skewer, rafter, analysis, crush, bushwhacker));

  it("Skewer the Critics: spectacle only once an opponent lost life this turn", () => {
    const { s: s0, ap, ids, opp } = setup([skewer]);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, { alt: "spectacle" })).toMatch(/alternative cost can't be paid now/);
    loseLife(s0, opp, 1);
    const s = passAll(castFor(s0, ap, ids[0]!, "spectacle", undefined, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(36);
  });

  it("Rafter Demon: each opponent discards only if its spectacle cost was paid", () => {
    const { s: s0, ap, ids, opp } = setup([rafter, rafter]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    const hand = s0.players[opp]!.hand.length;
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4 && (s.stack.length || s.triggerQueue.length); i++) s = passAll(s);
    expect(s.players[opp]!.hand.length).toBe(hand);
    loseLife(s, opp, 1);
    s = passAll(castFor(s, ap, ids[1]!, "spectacle"));
    for (let i = 0; i < 6 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "discard") break;
      s = passAll(s);
    }
    const discarded = s.players[opp]!.hand.length < hand || !!s.pending;
    expect(discarded).toBe(true);
  });

  it("Comparative Analysis: surge after you cast another spell this turn, not an opponent's", () => {
    const { s: s0, ap, ids } = setup([analysis, cheap]);
    const surge = { alt: "surge" as const };
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, undefined, surge)).toMatch(/alternative cost can't be paid now/);
    s0.castThisTurn = [{ player: (ap + 1) % 4, card: cheap.oracleId }];
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, undefined, surge)).toMatch(/alternative cost can't be paid now/);
    let s = passAll(run(s0, planCast(s0, ap, ids[1]!)));
    s = passAll(castFor(s, ap, ids[0]!, "surge", undefined, [{ kind: "player", id: ap }]));
    expect(s.stack).toHaveLength(0);
  });

  it("Crush of Tentacles: the Octopus only when surged", () => {
    const { s: s0, ap, ids, opp } = setup([cheap, crush]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = passAll(castFor(s, ap, ids[1]!, "surge"));
    expect(s.players[opp]!.hand).toContain(theirs);
    const octopus = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.power === "8");
    expect(octopus).toHaveLength(1);
  });

  it("Reckless Bushwhacker: its enters trigger only when surged, and bots surge it", () => {
    const { s: s0, ap, ids } = setup([cheap, bushwhacker]);
    const friend = putOnBattlefield(s0, ap, bear(), { sick: true });
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    s.players[ap]!.hand = [ids[1]!];
    s.players[ap]!.command = [];
    const plan = botActions(s, ap).find((a) => a.type === "castSpell" && a.objectId === ids[1]);
    expect(plan?.type === "castSpell" ? plan.alt : undefined).toBe("surge");
    s = passAll(castFor(s, ap, ids[1]!, "surge"));
    for (let i = 0; i < 4 && (s.stack.length || s.triggerQueue.length); i++) s = passAll(s);
    expect(characteristics(s, s.objects[friend]!).power).toBe(3);
  });
});
