// Blocking requirements from "target creature blocks ~ this turn if able" and "target creature blocks this turn if
// able" (CR 509.1c), and Brainstorm's "put two cards from your hand on top of your library in any order".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { blockRequirementProblem, botActions, isFullySupported, waitingOn, type CardDef } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const rampantElephant = card("Rampant Elephant", "Creature — Elephant", "{3}{W}", { power: "2", toughness: "2", oracleText: "{G}: Target creature blocks this creature this turn if able." });
const impetuousDevils = card("Impetuous Devils", "Creature — Devil", "{2}{R}{R}", { power: "6", toughness: "1", keywords: ["Trample", "Haste"], oracleText: "Trample, haste\nWhen this creature attacks, up to one target creature defending player controls blocks it this combat if able.\nAt the beginning of the end step, sacrifice this creature." });
const giantAmbushBeetle = card("Giant Ambush Beetle", "Creature — Insect", "{3}{B/G}{R}", { power: "4", toughness: "3", keywords: ["Haste"], oracleText: "Haste\nWhen this creature enters, you may have target creature block it this turn if able." });
const cullingMark = card("Culling Mark", "Sorcery", "{2}{G}", { oracleText: "Target creature blocks this turn if able." });
const predatoryRampage = card("Predatory Rampage", "Sorcery", "{3}{G}{G}", { oracleText: "Creatures you control get +3/+3 until end of turn. Each creature your opponents control blocks this turn if able." });
const brainstorm = card("Brainstorm", "Instant", "{U}", { oracleText: "Draw three cards, then put two cards from your hand on top of your library in any order." });
const conchHorn = card("Conch Horn", "Artifact", "{2}", { oracleText: "{1}, {T}, Sacrifice this artifact: Draw two cards, then put a card from your hand on top of your library." });
const flyer = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

describe("lures", () => {
  it("Rampant Elephant: the target must block it this turn if able, in this turn's combat (CR 509.1c)", () => {
    supported(rampantElephant, impetuousDevils, giantAmbushBeetle, cullingMark, predatoryRampage);
    const { s: s0, ap, opp } = setup([]);
    const el = putOnBattlefield(s0, ap, rampantElephant);
    const b = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = activate(s0, ap, el, 0, [target(b)]);
    expect(s.objects[b]!.provokedBy?.id).toBe(el);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: el, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    while (s.pending?.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] } as never);
    expect(blockRequirementProblem(s, opp, [])).toMatch(/must block Rampant Elephant/);
    expect(blockRequirementProblem(s, opp, [{ blocker: other, attacker: el }])).toMatch(/must block/);
    expect(blockRequirementProblem(s, opp, [{ blocker: b, attacker: el }])).toBeNull();
    const bot = botActions(s, opp)[0]!;
    expect(bot.type === "declareBlockers" && bot.blocks.some((x) => x.blocker === b && x.attacker === el)).toBe(true);
  });

  it("doesn't apply on a later turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const el = putOnBattlefield(s0, ap, rampantElephant);
    const b = putOnBattlefield(s0, opp, bear());
    let s = activate(s0, ap, el, 0, [target(b)]);
    s.objects[b]!.provokedBy!.turn = s.turn - 1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: el, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    while (s.pending?.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] } as never);
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
  });

  it("Culling Mark: the creature blocks some attacker if it can, any of them (CR 509.1c)", () => {
    const { s: s0, ap, opp, ids } = setup([cullingMark]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "Attacker One" }));
    const a2 = putOnBattlefield(s0, ap, flyer);
    const b = putOnBattlefield(s0, opp, bear({ name: "Marked Bear" }));
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    while (s.pending?.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] } as never);
    expect(blockRequirementProblem(s, opp, [])).toMatch(/Marked Bear must block/);
    expect(blockRequirementProblem(s, opp, [{ blocker: b, attacker: a1 }])).toBeNull();
    // It can't block the flyer, so that's no answer; the bot blocks the bear.
    const bot = botActions(s, opp)[0]!;
    expect(bot.type === "declareBlockers" && bot.blocks.some((x) => x.blocker === b && x.attacker === a1)).toBe(true);
  });

  it("Culling Mark: no requirement when the creature can't block any attacker", () => {
    const { s: s0, ap, opp, ids } = setup([cullingMark]);
    const a2 = putOnBattlefield(s0, ap, flyer);
    const b = putOnBattlefield(s0, opp, bear({ name: "Marked Bear" }));
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a2, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    while (s.pending?.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] } as never);
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
  });
});

describe("Brainstorm", () => {
  it("draws three, then puts two chosen cards back on top, the first on top", () => {
    supported(brainstorm, conchHorn);
    const { s: s0, ap, ids } = setup([brainstorm, bear({ name: "Keeper" })]);
    const hand0 = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending?.kind).toBe("handToTop");
    if (s.pending?.kind !== "handToTop") throw new Error();
    expect(s.pending.count).toBe(2);
    const hand = s.players[ap]!.hand;
    expect(hand.length).toBe(hand0 - 1 + 3);
    const [x, y] = [hand[0]!, hand[1]!];
    expect(() => act(s, { type: "handToTop", player: ap, objectIds: [x] })).toThrow();
    s = act(s, { type: "handToTop", player: ap, objectIds: [y, x] });
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([y, x]);
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1 + 1);
    expect(s.objects[x]!.zone).toBe("library");
  });

  it("the bot answers it", () => {
    const { s: s0, ap, ids } = setup([brainstorm]);
    let s = cast(s0, ap, ids[0]!);
    const a = botActions(s, waitingOn(s)!)[0]!;
    expect(a.type).toBe("handToTop");
    s = act(s, a);
    expect(s.pending).toBeNull();
  });
});
