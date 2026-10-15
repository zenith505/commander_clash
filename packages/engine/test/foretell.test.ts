// Foretell (CR 702.143): a special action that exiles a card face down, cast on a later turn for its foretell cost.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, foretellProblem, isFullySupported, legalActions, manaValue, planCast, planForetell, spellCost, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const poisonTheCup = card("Poison the Cup", "Instant", "{1}{B}{B}", { keywords: ["Foretell", "Scry"], oracleText: "Destroy target creature. If this spell was foretold, scry 2.\nForetell {1}{B} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
const crushTheWeak = card("Crush the Weak", "Sorcery", "{2}{R}", { keywords: ["Foretell"], oracleText: "Crush the Weak deals 2 damage to each creature. If a creature dealt damage this way would die this turn, exile it instead.\nForetell {R} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
const sawItComing = card("Saw It Coming", "Instant", "{1}{U}{U}", { keywords: ["Foretell"], oracleText: "Counter target spell.\nForetell {1}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });

const nextTurnOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const total = (c: { cost: Parameters<typeof manaValue>[0]; extra: number }) => manaValue(c.cost) + c.extra;

describe("foretell", () => {
  it("pays {2} and exiles the card face down; only its owner learns which card it is (CR 702.143a)", () => {
    supported(poisonTheCup, crushTheWeak, sawItComing);
    const { s: s0, ap, ids } = setup([crushTheWeak]);
    expect(foretellProblem(s0, ap, ids[0]!)).toMatch(/not enough mana/);
    const plan = planForetell(s0, ap, ids[0]!)!;
    expect(plan.filter((a) => a.type === "activateMana").length).toBe(2);
    let s = s0;
    for (const a of plan) s = act(s, a);
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("exile");
    expect(o.foretold).toBe(true);
    const pub = s.log.filter((l) => l.to === undefined).map((l) => l.text);
    expect(pub.some((t) => /foretells a card/.test(t))).toBe(true);
    expect(pub.some((t) => /Crush the Weak/.test(t))).toBe(false);
    expect(s.log.some((l) => l.to === ap && /Crush the Weak/.test(l.text))).toBe(true);
    // Not this turn (CR 702.143a: after the current turn has ended).
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "foretell" })).toBeTruthy();
  });

  it("only during your own turn, even with a spell on the stack", () => {
    const { s: s0, ap, ids } = setup([crushTheWeak, bear()]);
    // Cast a creature: we keep priority with it on the stack (CR 117.3c).
    let s = s0;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    expect(s.stack.length).toBe(1);
    expect(waitingOn(s)).toBe(ap);
    expect(planForetell(s, ap, ids[0]!)).not.toBeNull();
    // Another player's turn: no.
    const other = passUntil(s, "main1", nextTurnOf(s, ap));
    other.players[ap]!.hand.push(ids[0]!); // still in hand, whatever happened
    other.objects[ids[0]!]!.zone = "hand";
    expect(foretellProblem(other, ap, ids[0]!)).toMatch(/your own turn|priority/);
  });

  it("cast on a later turn for its foretell cost, not its mana cost; an instant on another player's turn", () => {
    const { s: s0, ap, ids, opp } = setup([poisonTheCup]);
    let s = s0;
    for (const id of s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === "Forest").slice(0, 2)) s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "G" });
    s = act(s, { type: "foretell", player: ap, objectId: ids[0]! });
    const victim = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "main1", opp);
    // On the opponent's turn, with priority: the foretell cost {1}{B}.
    const o = s.objects[ids[0]!]!;
    expect(total(spellCost(s, ap, o, 0, [], { alt: "foretell" }))).toBe(2);
    s = act(s, { type: "passPriority", player: opp });
    expect(waitingOn(s)).not.toBe(opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(castProblem(s, ap, ids[0]!, [target(victim)])).toMatch(/foretell cost/);
    expect(castProblem(s, ap, ids[0]!, [target(victim)], undefined, undefined, undefined, undefined, { alt: "foretell" })).toMatch(/not enough mana/);
    const plan = planCast(s, ap, ids[0]!, [target(victim)], undefined, "auto", undefined, { alt: "foretell" })!;
    expect(plan).not.toBeNull();
    expect(plan.filter((a) => a.type === "activateMana").length).toBe(2);
    for (const a of plan) s = act(s, a);
    for (let i = 0; i < 8 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[victim]!.zone).toBe("graveyard");
    // "If this spell was foretold, scry 2."
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", player: ap });
  });

  it("is a legal action, and the bot foretells with mana to spare, then casts it on a later turn", () => {
    const { s: s0, ap, ids } = setup([crushTheWeak]);
    expect(legalActions(s0, ap).some((a) => a.type === "foretell")).toBe(false); // no mana in the pool yet
    let s = passUntil(s0, "main2", ap);
    s.players[ap]!.hand = [ids[0]!];
    // Its mana cost is in reach, so it's cast now rather than foretold; make it unaffordable but {2} affordable.
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"));
    for (const id of lands) s.objects[id]!.tapped = true;
    for (const id of lands.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains").slice(0, 2)) s.objects[id]!.tapped = false;
    const a = botActions(s, ap);
    expect(a[a.length - 1]).toMatchObject({ type: "foretell", objectId: ids[0] });
    for (const x of a) s = act(s, x);
    expect(s.objects[ids[0]!]!.foretold).toBe(true);
    // Its next turn: it casts it for {R}.
    s = passUntil(s, "main1", ap);
    putOnBattlefield(s, nextTurnOf(s, ap), bear());
    s.players[ap]!.hand = [];
    const b = botActions(s, ap);
    const cast = b.find((x) => x.type === "castSpell");
    expect(cast).toMatchObject({ type: "castSpell", objectId: ids[0], alt: "foretell" });
  });
});
