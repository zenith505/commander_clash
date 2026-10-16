// More ways to choose modes (CR 700.2): "You may choose the same mode more than once" (700.2d, the Confluences),
// pawprints (700.2i, the Seasons), escalate (702.120), and "If this spell was kicked, choose any number instead" (the
// Inscriptions).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, compileCard, isFullySupported, manaValue, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const mystic = card("Mystic Confluence", "Instant", "{3}{U}{U}", { oracleText: "Choose three. You may choose the same mode more than once.\n• Counter target spell unless its controller pays {3}.\n• Return target creature to its owner's hand.\n• Draw a card." });
const fiery = card("Fiery Confluence", "Sorcery", "{2}{R}{R}", { oracleText: "Choose three. You may choose the same mode more than once.\n• Fiery Confluence deals 1 damage to each creature.\n• Fiery Confluence deals 2 damage to each opponent.\n• Destroy target artifact." });
const righteous = card("Righteous Confluence", "Sorcery", "{3}{W}{W}", { oracleText: "Choose three. You may choose the same mode more than once.\n• Create a 2/2 white Knight creature token with vigilance.\n• Exile target enchantment.\n• You gain 5 life." });
const verdant = card("Verdant Confluence", "Sorcery", "{4}{G}{G}", { oracleText: "Choose three. You may choose the same mode more than once.\n• Put two +1/+1 counters on target creature.\n• Return target permanent card from your graveyard to your hand.\n• Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." });
const wretched = card("Wretched Confluence", "Instant", "{3}{B}{B}", { oracleText: "Choose three. You may choose the same mode more than once.\n• Target player draws a card and loses 1 life.\n• Target creature gets -2/-2 until end of turn.\n• Return target creature card from your graveyard to your hand." });
const brokers = card("Brokers Confluence", "Instant", "{2}{G}{W}{U}", { keywords: ["Proliferate"], oracleText: "Choose three. You may choose the same mode more than once.\n• Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)\n• Target creature phases out. (Treat it and anything attached to it as though they don't exist until its controller's next turn.)\n• Counter target activated or triggered ability." });
const loss = card("Season of Loss", "Sorcery", "{3}{B}{B}", { oracleText: "Choose up to five {P} worth of modes. You may choose the same mode more than once.\n{P} — Each player sacrifices a creature of their choice.\n{P}{P} — Draw a card for each creature that died under your control this turn.\n{P}{P}{P} — Each opponent loses X life, where X is the number of creature cards in your graveyard." });
const brutality = card("Collective Brutality", "Sorcery", "{1}{B}", { keywords: ["Escalate"], oracleText: "Escalate—Discard a card. (Pay this cost for each mode chosen beyond the first.)\nChoose one or more —\n• Target opponent reveals their hand. You choose an instant or sorcery card from it. That player discards that card.\n• Target creature gets -2/-2 until end of turn.\n• Target opponent loses 2 life and you gain 2 life." });
const defiance = card("Collective Defiance", "Sorcery", "{1}{R}{R}", { keywords: ["Escalate"], oracleText: "Escalate {1} (Pay this cost for each mode chosen beyond the first.)\nChoose one or more —\n• Target player discards all the cards in their hand, then draws that many cards.\n• Collective Defiance deals 4 damage to target creature.\n• Collective Defiance deals 3 damage to target opponent or planeswalker." });
const effort = card("Collective Effort", "Sorcery", "{1}{W}{W}", { keywords: ["Escalate"], oracleText: "Escalate—Tap an untapped creature you control. (Pay this cost for each mode chosen beyond the first.)\nChoose one or more —\n• Destroy target creature with power 4 or greater.\n• Destroy target enchantment.\n• Put a +1/+1 counter on each creature target player controls." });
const grace = card("Borrowed Grace", "Instant", "{2}{W}", { keywords: ["Escalate"], oracleText: "Escalate {1}{W} (Pay this cost for each mode chosen beyond the first.)\nChoose one or both —\n• Creatures you control get +2/+0 until end of turn.\n• Creatures you control get +0/+2 until end of turn." });
const ruin = card("Inscription of Ruin", "Sorcery", "{2}{B}", { keywords: ["Kicker"], oracleText: "Kicker {2}{B}{B}\nChoose one. If this spell was kicked, choose any number instead.\n• Target opponent discards two cards.\n• Return target creature card with mana value 2 or less from your graveyard to the battlefield.\n• Destroy target creature with mana value 3 or less." });
const plainThree = card("Plain Three Test", "Sorcery", "{1}", { oracleText: "Choose two —\n• Draw a card.\n• You gain 1 life.\n• You lose 1 life." });
const glory = card("Glorious Anthem Test", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });
const relic = card("Relic Test", "Artifact", "{1}");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const cost = (s: GameState, pid: PlayerId, id: string, modes: number[], kicks: number[] = []) => {
  const c = spellCost(s, pid, s.objects[id]!, 0, kicks, { modes });
  return manaValue(c.cost) + c.extra;
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
/** Resolve the stack, the other players answering their own decisions as bots. */
const resolveAll = (s: GameState, me: PlayerId) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = waitingOn(s)!;
    if (s.pending && who !== me) for (const a of botActions(s, who)) s = act(s, a);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: who });
  }
  return s;
};
/** Bots act for `pid` until something is on the stack. */
const botCasts = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 10 && !s.stack.length; i++) for (const a of botActions(s, pid)) s = act(s, a);
  return s;
};

describe("the same mode more than once (CR 700.2d)", () => {
  it("parses the Confluences", () => {
    supported(mystic, fiery, righteous, verdant, wretched, brokers);
    expect(compileCard(mystic).spell!.modal).toMatchObject({ min: 3, max: 3, repeat: true });
  });

  it("a mode chosen three times happens three times", () => {
    const { s: s0, ap, ids } = setup([mystic]);
    const before = hand(s0, ap);
    const s = cast(s0, ap, ids[0]!, undefined, [2, 2, 2]);
    expect(hand(s, ap)).toBe(before - 1 + 3);
  });

  it("each opponent takes 2 damage for each time that mode was chosen", () => {
    const { s: s0, ap, opp, ids } = setup([fiery]);
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, undefined, [1, 1, 1]);
    expect(s.players[opp]!.life).toBe(life - 6);
    expect(s.log.some((e) => /deals 2 damage to each opponent\. Fiery Confluence deals 2 damage/.test(e.text))).toBe(true);
  });

  it("each instance of a targeted mode has its own target, the same one or another (CR 700.2d)", () => {
    const { s: s0, ap, opp, ids } = setup([verdant]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, opp, bear());
    // The same creature twice: four counters.
    const s = cast(s0, ap, ids[0]!, [target(a), target(a)], [0, 0, 2]);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(4);
    // Two different ones.
    const { s: t0, ap: ap2, opp: opp2, ids: ids2 } = setup([verdant]);
    const c = putOnBattlefield(t0, ap2, bear());
    const d = putOnBattlefield(t0, opp2, bear());
    const t = cast(t0, ap2, ids2[0]!, [target(c), target(d)], [0, 0, 2]);
    expect(t.objects[c]!.counters["+1/+1"]).toBe(2);
    expect(t.objects[d]!.counters["+1/+1"]).toBe(2);
    expect(b).toBeTruthy();
  });

  it("can be cast with only one mode that can be chosen (no artifact to destroy)", () => {
    const { s, ap, ids } = setup([fiery]);
    expect(castProblem(s, ap, ids[0]!)).not.toMatch(/no mode/);
    expect(castProblem(s, ap, ids[0]!, undefined, [1, 1, 2])).toMatch(/no legal targets/);
  });

  it("exactly three modes, and a list without the instruction still can't repeat", () => {
    const { s, ap, ids } = setup([mystic, plainThree]);
    expect(castProblem(s, ap, ids[0]!, undefined, [2, 2])).toMatch(/choose three modes/);
    expect(castProblem(s, ap, ids[1]!, undefined, [0, 0])).toMatch(/only once/);
    expect(planCast(s, ap, ids[1]!, undefined, [0, 1])).not.toBeNull();
  });

  it("a bot repeats the useful modes", () => {
    const { s: s0, ap, ids } = setup([fiery]);
    const s = botCasts(s0, ap);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids[0], modes: [1, 1, 1] });
  });
});

describe("pawprints (CR 700.2i)", () => {
  it("parses Season of Loss", () => {
    supported(loss);
    expect(compileCard(loss).spell!.modal).toMatchObject({ min: 0, max: 5, pawprints: [1, 2, 3], repeat: true });
  });

  it("any modes worth up to five pawprints, repeats included, and none at all (rulings)", () => {
    const { s, ap, ids } = setup([loss]);
    expect(castProblem(s, ap, ids[0]!, undefined, [2, 2])).toMatch(/up to 5 \{P\}/);
    expect(planCast(s, ap, ids[0]!, undefined, [0, 0, 0, 0, 0])).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, undefined, [1, 2])).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, undefined, [0, 1, 1])).not.toBeNull();
    expect(castProblem(s, ap, ids[0]!, undefined, [0, 0, 0, 0, 0, 0])).toMatch(/up to 5/);
    expect(planCast(s, ap, ids[0]!, undefined, [])).not.toBeNull();
  });

  it("the modes happen in printed order: sacrifices first, then the drain counts the creature cards", () => {
    const { s: s0, ap, opp, ids } = setup([loss]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, undefined, [2, 0, 0])!) s = act(s, a);
    // Each player sacrifices a creature, twice; the bots choose theirs.
    for (let i = 0; i < 40 && s.stack.length; i++) {
      const who = waitingOn(s)!;
      const pend = s.pending;
      if (pend && who === ap && pend.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: pend.options.slice(0, pend.count) } as Action);
      else if (pend && who !== ap) for (const a of botActions(s, who)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: who });
    }
    expect(s.players[ap]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Creature"))).toHaveLength(1);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
});

describe("escalate (CR 702.120)", () => {
  it("parses mana and non-mana escalate costs", () => {
    supported(brutality, defiance, effort, grace);
    expect(compileCard(defiance).spell!.modal!.escalate).toMatchObject({ mana: "{1}" });
    expect(compileCard(brutality).spell!.modal!.escalate!.cost).toMatchObject({ kind: "discard", n: 1 });
    expect(compileCard(effort).spell!.modal!.escalate!.cost).toMatchObject({ kind: "tap", n: 1 });
  });

  it("each mode beyond the first adds the escalate cost", () => {
    const { s, ap, ids } = setup([defiance, grace]);
    expect(cost(s, ap, ids[0]!, [0])).toBe(3);
    expect(cost(s, ap, ids[0]!, [0, 2])).toBe(4);
    expect(cost(s, ap, ids[0]!, [0, 1, 2])).toBe(5);
    expect(cost(s, ap, ids[1]!, [0, 1])).toBe(5);
  });

  it("Collective Defiance with all three modes taps five lands", () => {
    const { s: s0, ap, opp, ids } = setup([defiance]);
    const b = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, target(b), { kind: "player", id: opp }], [0, 1, 2]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(5);
  });

  it("escalate—discard a card: one card for each mode beyond the first", () => {
    const { s: s0, ap, opp, ids } = setup([brutality, relic, relic]);
    const b = putOnBattlefield(s0, opp, bear());
    const t = [{ kind: "player" as const, id: opp }, target(b), { kind: "player" as const, id: opp }];
    expect(castProblem(s0, ap, ids[0]!, t, [0, 1, 2], undefined, undefined, 0, { discard: [ids[1]!] })).toMatch(/discard/);
    expect(planCast(s0, ap, ids[0]!, t, [0, 1, 2], "auto", undefined, { discard: [ids[1]!, ids[2]!] })).not.toBeNull();
    expect(castProblem(s0, ap, ids[0]!, [target(b)], [1], undefined, undefined, 0, { discard: [ids[1]!] })).toMatch(/doesn't ask you to discard/);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, t, [0, 1, 2], "auto", undefined, { discard: [ids[1]!, ids[2]!] })!) s = act(s, a);
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining([ids[1], ids[2]]));
    const life = s.players[opp]!.life;
    s = passAll(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("escalate—tap an untapped creature you control", () => {
    const { s: s0, ap, opp, ids } = setup([effort]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, glory);
    expect(castProblem(s0, ap, ids[0]!, [target(theirs), { kind: "player", id: ap }], [1, 2], undefined, undefined, 0, { tap: [] })).toMatch(/tap/);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(theirs), { kind: "player", id: ap }], [1, 2], "auto", undefined, { tap: [mine] })!) s = act(s, a);
    expect(s.objects[mine]!.tapped).toBe(true);
    s = passAll(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
  });

  it("a bot pays escalate for as many useful modes as it can afford", () => {
    const { s: s0, ap, opp, ids } = setup([defiance]);
    putOnBattlefield(s0, opp, bear());
    const s = botCasts(s0, ap);
    const item = s.stack.at(-1)!;
    expect(item).toMatchObject({ objectId: ids[0] });
    expect(item.modes!.length).toBeGreaterThan(1);
  });
});

describe("\"If this spell was kicked, choose any number instead\"", () => {
  it("parses Inscription of Ruin", () => {
    supported(ruin);
    expect(compileCard(ruin).spell!.modal).toMatchObject({ min: 1, max: 1, both: "kicked" });
  });

  it("one mode unless kicked, then any number, each once", () => {
    const { s: s0, ap, opp, ids } = setup([ruin]);
    putOnBattlefield(s0, ap, swamp); // {2}{B} and {2}{B}{B}
    const b = putOnBattlefield(s0, opp, bear());
    const t = [{ kind: "player" as const, id: opp }, target(b)];
    expect(castProblem(s0, ap, ids[0]!, t, [0, 2])).toMatch(/choose one mode/);
    expect(planCast(s0, ap, ids[0]!, t, [0, 2], "auto", undefined, { kicks: [0] })).not.toBeNull();
    expect(castProblem(s0, ap, ids[0]!, [target(b), target(b)], [2, 2], undefined, undefined, 0, { kicks: [0] })).toMatch(/only once/);
    expect(cost(s0, ap, ids[0]!, [0, 2], [0])).toBe(7);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, t, [0, 2], "auto", undefined, { kicks: [0] })!) s = act(s, a);
    const cards = hand(s, opp);
    s = resolveAll(s, ap);
    expect(hand(s, opp)).toBe(cards - 2);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("a bot kicks it for more than one mode, or casts it unkicked for one", () => {
    const { s: s0, ap, opp, ids } = setup([ruin]);
    putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, opp, bear());
    const s = botCasts(s0, ap);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids[0] });
    expect(s.stack.at(-1)!.modes!.length).toBeGreaterThan(1);
  });
});
