// Card templates beyond the basics: evasion keywords, uncounterable spells, entering with
// counters, Changeling, and multi-symbol activation costs.

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, island, passAll, passUntil, pt, putOnBattlefield, setup, swamp, target } from "./helpers";
import { blockProblem, compileCard, isFullySupported, planCast, waitingOn, type GameState } from "../src";

/** Get to `ap`'s declare blockers step with `attacker` attacking `defender`. */
function attackWith(s: GameState, ap: number, attacker: string, defender: number) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  while (s.pending?.kind !== "declareBlockers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("evasion", () => {
  it("flying, fear, intimidate and shadow restrict blockers (CR 702.9b, 702.36b, 702.13b, 702.28b)", () => {
    const { s, ap, opp } = setup([]);
    const at = (kw: string, cost = "{1}{B}") => putOnBattlefield(s, ap, bear({ name: `${kw} Bear`, manaCost: cost, colors: cost.includes("B") ? ["B"] : ["R"], keywords: [kw] }));
    const green = putOnBattlefield(s, opp, bear());
    const black = putOnBattlefield(s, opp, bear({ name: "Black Bear", colors: ["B"] }));
    const art = putOnBattlefield(s, opp, card("Construct", "Artifact Creature — Construct", "{2}", { power: "1", toughness: "1" }));
    const shade = putOnBattlefield(s, opp, bear({ name: "Shade", keywords: ["Shadow"] }));
    const o = (id: string) => s.objects[id]!;
    const can = (b: string, a: string) => blockProblem(s, o(b), o(a), opp) === null;
    const fear = at("Fear");
    expect([can(green, fear), can(black, fear), can(art, fear)]).toEqual([false, true, true]);
    const intim = at("Intimidate", "{1}{R}");
    expect([can(green, intim), can(black, intim), can(art, intim)]).toEqual([false, false, true]);
    const shadow = at("Shadow");
    expect([can(green, shadow), can(shade, shadow)]).toEqual([false, true]);
    const plain = at("Vigilance");
    expect(can(shade, plain)).toBe(false); // shadow creatures block only shadow
  });

  it("landwalk: unblockable while the defending player controls that land type (CR 702.14c)", () => {
    const { s, ap, opp } = setup([]);
    const walker = putOnBattlefield(s, ap, bear({ name: "Bog Walker", keywords: ["Swampwalk"] }));
    const blocker = putOnBattlefield(s, opp, bear());
    expect(blockProblem(s, s.objects[blocker]!, s.objects[walker]!, opp)).toBeNull();
    putOnBattlefield(s, opp, swamp);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[walker]!, opp)).toMatch(/swampwalk/);
  });

  it("an illegal block is rejected when declared", () => {
    const { s: s0, ap, opp } = setup([]);
    const flier = putOnBattlefield(s0, ap, bear({ name: "Bird", keywords: ["Flying"] }));
    const blocker = putOnBattlefield(s0, opp, bear());
    const s = attackWith(s0, ap, flier, opp);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: flier }] })).toThrow(/flying/);
  });
});

describe("other templates", () => {
  it("a spell that can't be countered stays on the stack when targeted by a counterspell (CR 101.2)", () => {
    const cancel = card("Cancel", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell." });
    const hard = card("Hard Spell", "Sorcery", "{2}{G}", { oracleText: "This spell can't be countered.\nDraw two cards." });
    expect(compileCard(hard).cantBeCountered).toBe(true);
    const { s: s0, ap, ids, opp } = setup([hard]);
    // Give the opponent a Cancel and mana.
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, island);
    const c = putOnBattlefield(s0, opp, cancel);
    s0.battlefield.splice(s0.battlefield.indexOf(c), 1);
    s0.objects[c]!.zone = "hand";
    s0.players[opp]!.hand.push(c);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    const handBefore = s.players[ap]!.hand.length;
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const a of planCast(s, opp, c, [{ kind: "stack", id: s.stack[0]!.id }])!) s = act(s, a);
    s = passAll(s); // Cancel resolves, does nothing
    expect(s.log.some((e) => /can't be countered/.test(e.text))).toBe(true);
    s = passAll(s); // Hard Spell resolves
    expect(s.players[ap]!.hand.length).toBe(handBefore + 2);
  });

  it("enters with +1/+1 counters, applied as it enters (CR 614.1c)", () => {
    const hydra = card("Little Hydra", "Creature — Hydra", "{1}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with two +1/+1 counters on it." });
    expect(isFullySupported(hydra)).toBe(true);
    const { s: s0, ap, ids } = setup([hydra]);
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield"); // a 0/0 that would otherwise die
    expect(pt(s, ids[0]!)).toBe("2/2");
  });

  it("Changeling counts as every creature type for lords", () => {
    const lord = card("Elvish Archdruid", "Creature — Elf Druid", "{1}{G}{G}", { power: "2", toughness: "2", oracleText: "Other Elf creatures you control get +1/+1." });
    const shapeshifter = card("Shapeshifter", "Creature — Shapeshifter", "{1}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling" });
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, lord);
    const c = putOnBattlefield(s, ap, shapeshifter);
    expect(pt(s, c)).toBe("2/2");
  });

  it("activated abilities with costs like {1}{R} (firebreathing) compile and work", () => {
    const shivan = card("Fire Drake", "Creature — Dragon", "{2}{R}", { power: "1", toughness: "1", oracleText: "{1}{R}: This creature gets +1/+0 until end of turn." });
    expect(compileCard(shivan).activated[0]?.manaCost).toBe("{1}{R}");
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, shivan);
    let s = activate(s0, ap, d, 0);
    s = activate(s, ap, d, 0);
    expect(pt(s, d)).toBe("3/1");
  });

  it("'doesn't untap during your untap step' keeps it tapped", () => {
    const sleepy = card("Sleepy Giant", "Creature — Giant", "{3}{R}", { power: "5", toughness: "5", oracleText: "This creature doesn't untap during your untap step." });
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, sleepy);
    s0.objects[g]!.tapped = true;
    const s = passUntil(s0, "upkeep", ap);
    expect(s.objects[g]!.tapped).toBe(true);
  });
});

describe("target filters (CR 115.1, checked again on resolution per 608.2b)", () => {
  const legal = (s: GameState, spellId: string, t: string) => planCast(s, s.activePlayer, spellId, [target(t)]) !== null;

  it("'creature with flying': losing flying in response makes the target illegal", () => {
    const shot = card("Sky Shot", "Instant", "{G}", { oracleText: "Destroy target creature with flying." });
    const ground = card("Grounding", "Instant", "{U}", { oracleText: "Target creature loses flying until end of turn." });
    const { s: s0, ap, ids, opp } = setup([shot, ground]);
    const bird = putOnBattlefield(s0, opp, bear({ name: "Bird", keywords: ["Flying"], oracleText: "Flying" }));
    const bearId = putOnBattlefield(s0, opp, bear());
    expect(legal(s0, ids[0]!, bearId)).toBe(false);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(bird)])!) s = act(s, a);
    for (const a of planCast(s, ap, ids[1]!, [target(bird)])!) s = act(s, a);
    s = passAll(s); // Grounding resolves
    s = passAll(s); // Sky Shot: its target no longer has flying
    expect(s.objects[bird]!.zone).toBe("battlefield");
    expect(s.log.some((e) => /Sky Shot does nothing/.test(e.text))).toBe(true);
  });

  it("power filters use current power, after effects (layer 7)", () => {
    const pick = card("Big Game", "Sorcery", "{G}", { oracleText: "Destroy target creature with power 4 or greater." });
    const { s, ids, opp } = setup([pick]);
    const b = putOnBattlefield(s, opp, bear());
    expect(legal(s, ids[0]!, b)).toBe(false);
    addEffect(s, opp, [b], [{ kind: "modifyPT", power: 2, toughness: 0 }]);
    expect(legal(s, ids[0]!, b)).toBe(true);
  });

  it("mana value is the printed mana cost; a token's is 0 (CR 202.3)", () => {
    const decay = card("Small Decay", "Instant", "{B}{G}", { oracleText: "Destroy target nonland permanent with mana value 1 or less." });
    const { s, ids, opp } = setup([decay]);
    const b = putOnBattlefield(s, opp, bear());
    const token = putOnBattlefield(s, opp, card("Soldier", "Token Creature — Soldier", "", { power: "1", toughness: "1" }));
    expect(legal(s, ids[0]!, b)).toBe(false);
    expect(legal(s, ids[0]!, token)).toBe(true);
  });

  it("color filters use current color (layer 5), and nonbasic checks supertypes", () => {
    const blast = card("Blue Blast", "Instant", "{R}", { oracleText: "Destroy target blue permanent." });
    const miner = card("Land Breaker", "Sorcery", "{R}", { oracleText: "Destroy target nonbasic land." });
    const { s, ids, opp } = setup([blast, miner]);
    const b = putOnBattlefield(s, opp, bear());
    expect(legal(s, ids[0]!, b)).toBe(false);
    addEffect(s, opp, [b], [{ kind: "setColors", colors: ["U"] }]);
    expect(legal(s, ids[0]!, b)).toBe(true);
    const basic = putOnBattlefield(s, opp, island);
    const dual = putOnBattlefield(s, opp, card("Tundra", "Land — Plains Island"));
    expect(legal(s, ids[1]!, basic)).toBe(false);
    expect(legal(s, ids[1]!, dual)).toBe(true);
  });

  it("'attacking creature' only matches during combat", () => {
    const strike = card("Ambush", "Instant", "{W}", { oracleText: "Destroy target attacking creature." });
    const { s: s0, ap, ids, opp } = setup([strike]);
    const b = putOnBattlefield(s0, opp, bear());
    expect(legal(s0, ids[0]!, b)).toBe(false);
    // Give the opponent the turn and let the bear attack us.
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap }] });
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, ap, ids[0]!, [target(b)])).not.toBeNull();
  });

  it("two-faced cards aren't supported until their faces are modeled", () => {
    const adv = card("Giant // Stomp", "Creature — Giant // Instant — Adventure", "{3}{R} // {1}{R}", { power: "4", toughness: "3" });
    expect(isFullySupported(adv)).toBe(false);
  });
});

describe("zone changes make new objects (CR 400.7)", () => {
  it("removal misses a creature that was bounced and recast in response", () => {
    const murder = card("Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
    const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });
    const flashBear = bear({ name: "Flash Bear", keywords: ["Flash"], oracleText: "Flash" });
    const { s: s0, ap, ids } = setup([murder, unsummon]);
    const b = putOnBattlefield(s0, ap, flashBear);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    for (const a of planCast(s, ap, ids[1]!, [target(b)])!) s = act(s, a);
    s = passAll(s); // Unsummon resolves: the bear is in hand
    expect(s.objects[b]!.zone).toBe("hand");
    for (const a of planCast(s, ap, b)!) s = act(s, a);
    s = passAll(s); // the bear resolves and is back on the battlefield
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = passAll(s); // Murder: its target is gone, this is a new object
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.log.some((e) => /Murder does nothing/.test(e.text))).toBe(true);
  });
});
