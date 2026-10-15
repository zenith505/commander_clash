// Emerge (CR 702.119) and freerunning (CR 702.173): alternative costs.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, isFullySupported, manaValue, planCast, spellCost, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const wretchedGryff = card("Wretched Gryff", "Creature — Eldrazi Hippogriff", "{7}", { power: "3", toughness: "4", keywords: ["Flying", "Emerge"], oracleText: "Emerge {5}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, draw a card.\nFlying" });
const elderDeepFiend = card("Elder Deep-Fiend", "Creature — Eldrazi Octopus", "{8}", { power: "5", toughness: "6", keywords: ["Emerge", "Flash"], oracleText: "Flash\nEmerge {5}{U}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, tap up to four target permanents." });
const eagleVision = card("Eagle Vision", "Sorcery", "{4}{U}", { keywords: ["Freerunning"], oracleText: "Freerunning {1}{U} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nDraw three cards." });
const mercilessHarlequin = card("Merciless Harlequin", "Creature — Human Assassin", "{2}{B}", { power: "2", toughness: "1", keywords: ["Freerunning"], oracleText: "Freerunning {1}{B} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nWhen this creature enters, you draw a card and you lose 1 life." });
const achilles = card("Achilles Davenport", "Legendary Creature — Human Assassin", "{2}{U}{B}", { power: "3", toughness: "3", keywords: ["Freerunning", "Menace"], oracleText: "Freerunning {U}{B} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nMenace (This creature can't be blocked except by two or more creatures.)\nOther Assassins you control get +1/+1." });
const big = bear({ name: "Hulking Brute", manaCost: "{5}{G}{G}", power: "2", toughness: "2" });

const total = (c: { cost: Parameters<typeof manaValue>[0]; extra: number }) => manaValue(c.cost) + c.extra;

/** Attack `defender` with `attackers`, nobody blocks, through combat damage to the second main phase. */
function swing(s: GameState, ap: PlayerId, defender: PlayerId, attackers: string[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender })) });
  for (let i = 0; i < 60 && s.step !== "main2"; i++) {
    const p = s.pending;
    s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

describe("emerge", () => {
  it("the cost is reduced by the sacrificed creature's mana value, generic mana only (CR 702.119a)", () => {
    supported(wretchedGryff, elderDeepFiend);
    const { s, ap, ids } = setup([wretchedGryff]);
    const b = putOnBattlefield(s, ap, bear());
    const brute = putOnBattlefield(s, ap, big);
    const o = s.objects[ids[0]!]!;
    expect(total(spellCost(s, ap, o))).toBe(7);
    expect(total(spellCost(s, ap, o, 0, [], { alt: "emerge" }))).toBe(6);
    expect(total(spellCost(s, ap, o, 0, [], { alt: "emerge", sacrifice: [b] }))).toBe(4);
    // A 7-drop takes off all five generic, never the {U}.
    const c = spellCost(s, ap, o, 0, [], { alt: "emerge", sacrifice: [brute] });
    expect(total(c)).toBe(1);
    expect(c.cost.symbols.some((x) => x.kind === "colored")).toBe(true);
  });

  it("casting it sacrifices the creature; the cast trigger still happens", () => {
    const { s: s0, ap, ids } = setup([wretchedGryff]);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "emerge", sacrifice: [ids[0]!] })).toBeTruthy();
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "emerge", sacrifice: [b] })!;
    expect(plan.filter((a) => a.type === "activateMana").length).toBe(4);
    let s = s0;
    for (const a of plan) s = act(s, a);
    expect(s.objects[b]!.zone).toBe("graveyard");
    s = passAll(passAll(s));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("the bot emerges when it can't pay the mana cost, sacrificing its costliest small creature", () => {
    const { s: s0, ap, ids } = setup([wretchedGryff]);
    // Leave five lands: not enough for {7}, enough for {5}{U} less a creature's mana value.
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land"));
    for (const id of lands.filter((id) => !s0.cards[s0.objects[id]!.cardId]!.name.includes("Island")).slice(0, 10)) s0.objects[id]!.tapped = true;
    const b = putOnBattlefield(s0, ap, bear());
    const cheap = putOnBattlefield(s0, ap, bear({ name: "Cheap", manaCost: "{G}", power: "1", toughness: "1" }));
    s0.players[ap]!.hand = [ids[0]!];
    const plan = botActions(s0, ap);
    const cast = plan.find((a) => a.type === "castSpell");
    expect(cast?.type === "castSpell" && cast.objectId === ids[0] && cast.alt === "emerge" && cast.sacrifice?.[0] === b).toBe(true);
    expect(cheap).toBeTruthy();
  });
});

describe("freerunning", () => {
  it("only after an Assassin of yours dealt combat damage to a player this turn (CR 702.173a)", () => {
    supported(eagleVision, mercilessHarlequin, achilles);
    const { s: s0, ap, opp, ids } = setup([eagleVision]);
    const how = { alt: "freerunning" as const };
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, how)).toMatch(/Assassin or commander/);
    const plain = putOnBattlefield(s0, ap, bear());
    let s = swing(s0, ap, opp, [plain]);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, how)).toMatch(/Assassin or commander/);
    expect(s.freerunningThisTurn).toBeUndefined();
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([eagleVision]);
    const assassin = putOnBattlefield(s1, ap1, mercilessHarlequin);
    s = swing(s1, ap1, opp1, [assassin]);
    expect(planCast(s, ap1, ids1[0]!, undefined, undefined, "auto", undefined, how)).not.toBeNull();
    expect(total(spellCost(s, ap1, s.objects[ids1[0]!]!, 0, [], how))).toBe(2);
    // The bot casts it for that.
    s.players[ap1]!.hand = [ids1[0]!];
    const a = botActions(s, ap1).find((x) => x.type === "castSpell");
    expect(a?.type === "castSpell" && a.alt === "freerunning").toBe(true);
    // Not on a later turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap1) + 1) % 4]);
    expect(s.freerunningThisTurn).toBeUndefined();
  });

  it("a commander counts too", () => {
    const { s: s0, ap, opp, ids } = setup([eagleVision]);
    const cmd = putOnBattlefield(s0, ap, bear({ name: "My Commander" }), { commander: true });
    const s = swing(s0, ap, opp, [cmd]);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "freerunning" })).not.toBeNull();
  });
});
