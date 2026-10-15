// Combat choices: "as though it weren't blocked" (CR 510.1), enlist (CR 702.154) and banding (CR 702.22).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
type Answer = (s: GameState) => Action | null;
const bot: Answer = (s) => botActions(s, waitingOn(s)!)[0]!;

/** From the active player's main 1: attack, block, answer whatever combat asks with `answer`, to the end of combat. */
function fight(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = [], answer: Answer = bot) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && !(s.step === "endCombat" && !s.pending && !s.stack.length); i++) {
    const pend = s.pending;
    if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === pend.player) });
    else if (pend) s = act(s, answer(s) ?? bot(s)!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const pick = (ids: string[]): Answer => (s) => (s.pending?.kind === "pickPermanents" ? { type: "pickPermanents", player: s.pending.player, ids } : null);

// Real oracle text (Scryfall).
const loneWolf = card("Lone Wolf", "Creature — Wolf", "{2}{G}", { power: "2", toughness: "2", oracleText: "You may have this creature assign its combat damage as though it weren't blocked." });
const indomitableMight = card("Indomitable Might", "Enchantment — Aura", "{3}{G}", { keywords: ["Enchant", "Flash"], oracleText: "Flash\nEnchant creature\nEnchanted creature gets +3/+3.\nEnchanted creature's controller may have it assign its combat damage as though it weren't blocked." });
const siegeBehemoth = card("Siege Behemoth", "Creature — Beast", "{5}{G}{G}", { power: "7", toughness: "4", keywords: ["Hexproof"], oracleText: "Hexproof\nAs long as this creature is attacking, for each creature you control, you may have that creature assign its combat damage as though it weren't blocked." });
const proudWildbonder = card("Proud Wildbonder", "Creature — Human Warrior", "{2}{R/G}{R/G}", { power: "4", toughness: "3", keywords: ["Trample"], oracleText: 'Trample\nCreatures you control with trample have "You may have this creature assign its combat damage as though it weren\'t blocked."' });
const argivianCavalier = card("Argivian Cavalier", "Creature — Orc Knight", "{2}{W}", { power: "2", toughness: "2", keywords: ["Enlist"], oracleText: "Enlist (As this creature attacks, you may tap a nonattacking creature you control without summoning sickness. When you do, add its power to this creature's until end of turn.)\nWhen this creature enters, create a 1/1 white Soldier creature token." });
const coalitionWarbrute = card("Coalition Warbrute", "Creature — Minotaur Berserker", "{3}{R}", { power: "3", toughness: "4", keywords: ["Trample", "Enlist"], oracleText: "Enlist (As this creature attacks, you may tap a nonattacking creature you control without summoning sickness. When you do, add its power to this creature's until end of turn.)\nTrample" });
const guardian = (text: string) => card("Guardian of New Benalia", "Creature — Human Soldier", "{1}{W}", { power: "2", toughness: "2", keywords: ["Enlist", "Scry"], oracleText: text });
const wall = card("Wall of Wood", "Creature — Wall", "{G}", { power: "0", toughness: "3", keywords: ["Defender"], oracleText: "Defender" });

describe("as though it weren't blocked (CR 510.1)", () => {
  it("its controller chooses: all of its damage to the player, or to the blockers", () => {
    supported(loneWolf, indomitableMight, siegeBehemoth, proudWildbonder);
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, loneWolf);
    const b = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    let s = fight(structuredClone(s0), ap, [{ attacker: w, defender: opp }], [{ blocker: b, attacker: w }], pick([w]));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[w]!.zone).toBe("graveyard"); // the Bears still deal their damage
    s = fight(structuredClone(s0), ap, [{ attacker: w, defender: opp }], [{ blocker: b, attacker: w }], pick([]));
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("the bot hits the player when it can't kill a blocker", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, loneWolf);
    const wl = putOnBattlefield(s0, opp, wall);
    const life = s0.players[opp]!.life;
    const s = fight(s0, ap, [{ attacker: w, defender: opp }], [{ blocker: wl, attacker: w }]);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("granted by an Aura, by Siege Behemoth while it attacks, and to creatures with trample", () => {
    const { s: s0, ap, opp } = setup([]);
    const b1 = putOnBattlefield(s0, ap, bear());
    const aura = putOnBattlefield(s0, ap, indomitableMight);
    s0.objects[aura]!.attachedTo = b1;
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Trampling Bear", keywords: ["Trample"], oracleText: "Trample" }));
    const pw = putOnBattlefield(s0, ap, proudWildbonder);
    const sb = putOnBattlefield(s0, ap, siegeBehemoth);
    const b3 = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    const has = (s: GameState, id: string) => characteristics(s, s.objects[id]!).unblockedDamage;
    expect([has(s0, b1), has(s0, b2), has(s0, pw), has(s0, b3), has(s0, sb)]).toEqual([true, true, true, false, false]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sb, defender: opp }, { attacker: b3, defender: opp }] });
    expect([has(s, b3), has(s, sb)]).toEqual([true, true]);
  });
});

describe("enlist (CR 702.154)", () => {
  it("as it attacks, tap a creature that isn't attacking: +X/+0 where X is its power", () => {
    supported(argivianCavalier, coalitionWarbrute);
    const { s: s0, ap, opp } = setup([]);
    const cav = putOnBattlefield(s0, ap, argivianCavalier);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const sick = putOnBattlefield(s0, ap, bear({ name: "New Bear" }), { sick: true });
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cav, defender: opp }] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "enlist", options: [big] }); // not the summoning-sick one
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [sick] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [big] });
    expect(s.objects[big]!.tapped).toBe(true);
    s = fight(s0, ap, [{ attacker: cav, defender: opp }], [], pick([big]));
    expect(s.players[opp]!.life).toBe(life - 6);
    expect(s.objects[big]!.attacking).toBeUndefined();
  });

  it("each creature can be enlisted once; the bot enlists its biggest creature; a creature that enlists none gets nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, argivianCavalier);
    const b = putOnBattlefield(s0, ap, coalitionWarbrute);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = act(s, bot(s)!);
    expect(s.objects[big]!.tapped).toBe(true);
    expect(s.pending).toBeNull(); // nothing left for the second one to enlist
    s = fight(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    expect(s.players[opp]!.life).toBe(life - 9);
  });

  it("Whenever ~ enlists a creature", () => {
    const g = guardian("Enlist\nWhenever this creature enlists a creature, scry 2.");
    const { s: s0, ap, opp } = setup([]);
    const id = putOnBattlefield(s0, ap, g);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: opp }] });
    s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
    for (let i = 0; i < 10 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, s.pending ? bot(s)! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry" });
  });
});

const banding = "Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)";
const shieldBearer = card("Shield Bearer", "Creature — Human Soldier", "{1}{W}", { power: "0", toughness: "3", keywords: ["Banding"], oracleText: banding });
const benalishHero = card("Benalish Hero", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1", keywords: ["Banding"], oracleText: banding });
const kjeldoranSkyknight = card("Kjeldoran Skyknight", "Creature — Human Knight", "{2}{W}", { power: "1", toughness: "1", keywords: ["Flying", "First strike", "Banding"], oracleText: `Flying; first strike; ${banding.replace(/^B/, "b")}` });
const knightsOfThorn = card("Knights of Thorn", "Creature — Human Knight", "{3}{W}", { power: "2", toughness: "2", keywords: ["Protection", "Banding"], oracleText: `Protection from red; ${banding.replace(/^B/, "b")}` });

describe("banding (CR 702.22)", () => {
  it("attackers declared in a band are all blocked by a creature that blocks one, and the attacker divides its damage", () => {
    supported(shieldBearer, benalishHero, kjeldoranSkyknight, knightsOfThorn);
    const { s: s0, ap, opp } = setup([]);
    const sb = putOnBattlefield(s0, ap, shieldBearer);
    const b = putOnBattlefield(s0, ap, bear());
    const bl = putOnBattlefield(s0, opp, bear({ name: "Blocking Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sb, defender: opp }, { attacker: b, defender: opp }] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "band" });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [b] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [sb, b] });
    expect(s.objects[sb]!.band).toBeDefined();
    expect(s.objects[sb]!.band).toBe(s.objects[b]!.band);
    s = fight(s0, ap, [{ attacker: sb, defender: opp }, { attacker: b, defender: opp }], [{ blocker: bl, attacker: b }], (x) => (x.pending?.kind === "pickPermanents" && x.pending.action === "band" ? { type: "pickPermanents", player: ap, ids: [sb, b] } : null));
    // The Blocking Bear blocked both; its 2 damage went to Shield Bearer, which survives it.
    expect(s.log.some((e) => /Blocking Bear also blocks Shield Bearer/.test(e.text))).toBe(true);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[sb]!.zone).toBe("battlefield");
    expect(s.objects[bl]!.zone).toBe("graveyard");
  });

  it("a band needs creatures with banding and at most one without, attacking the same player", () => {
    const { s: s0, ap, opp } = setup([]);
    const hero = putOnBattlefield(s0, ap, benalishHero);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const b3 = putOnBattlefield(s0, ap, bear({ name: "Third Bear" }));
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hero, defender: opp }, { attacker: b1, defender: opp }, { attacker: b2, defender: opp }, { attacker: b3, defender: other }] });
    expect(s.pending).toMatchObject({ options: expect.not.arrayContaining([b3]) });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [hero, b1, b2] })).toThrow(/only one creature without banding/);
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [hero, b3] })).toThrow();
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [hero] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [hero, b1] });
    expect(s.pending).toBeNull(); // no one left with banding to band with
  });

  it("blocked by a creature with banding, the defending player divides the attacker's damage, trample or not", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Trampling Brute", power: "3", toughness: "3", keywords: ["Trample"], oracleText: "Trample" }));
    const sb = putOnBattlefield(s0, opp, shieldBearer);
    const b = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    const s = fight(s0, ap, [{ attacker: big, defender: opp }], [{ blocker: sb, attacker: big }, { blocker: b, attacker: big }]);
    expect(s.objects[sb]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("then the defending player also decides whether it assigns damage as though it weren't blocked", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, loneWolf);
    const sb = putOnBattlefield(s0, opp, shieldBearer);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "pickPermanents" && s.pending.action === "unblocked"); i++) {
      const pend = s.pending;
      s = pend?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pend.player, blocks: pend.player === opp ? [{ blocker: sb, attacker: w }] : [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "unblocked", player: opp });
  });
});
