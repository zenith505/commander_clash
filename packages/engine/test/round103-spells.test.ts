// Round 103: Grab the Prize and the discard-cost cards ("if the discarded card wasn't a land card": the card the cost
// discarded, CR 601.2h).

import { describe, expect, it } from "vitest";
import { act, card, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const grab = card("Grab the Prize", "Sorcery", "{1}{R}", { oracleText: "As an additional cost to cast this spell, discard a card.\nDraw two cards. If the discarded card wasn't a land card, Grab the Prize deals 2 damage to each opponent." });
const scavenger = card("Moria Scavenger", "Creature — Goblin Rogue", "{1}{R}", { power: "1", toughness: "2", oracleText: "{T}, Discard a card: Draw a card. If the discarded card was a creature card, amass Orcs 1. (Put a +1/+1 counter on an Army you control. It's also an Orc. If you don't control one, create a 0/0 black Orc Army creature token first.)" });
const bearCard = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const comet = card("Comet Storm", "Instant", "{X}{R}{R}", { keywords: ["Multikicker"], oracleText: "Multikicker {1} (You may pay an additional {1} any number of times as you cast this spell.)\nChoose any target, then choose another target for each time this spell was kicked. Comet Storm deals X damage to each of them." });

const run = (s: GameState, plan: ReturnType<typeof planCast> | ReturnType<typeof planActivate>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 103: the discarded card", () => {
  it("parse", () => [grab, scavenger].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Grab the Prize: a nonland card discarded deals 2 to each opponent", () => {
    const { s: s0, ap, ids } = setup([grab, bearCard]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { discard: [ids[1]!] })));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2);
    for (const pid of s.turnOrder) expect(s.players[pid]!.life).toBe(pid === ap ? 40 : 38);
  });

  it("Grab the Prize: a land card discarded deals nothing", () => {
    const { s: s0, ap, ids } = setup([grab, forest]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { discard: [ids[1]!] })));
    for (const pid of s.turnOrder) expect(s.players[pid]!.life).toBe(40);
  });

  it("Moria Scavenger: amass only for a creature card", () => {
    const { s: s0, ap, ids } = setup([bearCard, forest]);
    const m = putOnBattlefield(s0, ap, scavenger);
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [], undefined, undefined, undefined, { discard: [ids[1]!] })));
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]?.subtypes.includes("Army"))).toBe(false);
    s.objects[m]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, m, 0, [], undefined, undefined, undefined, { discard: [ids[0]!] })));
    const army = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.counters["+1/+1"]);
    expect(army).toBeDefined();
  });
});

describe("round 103: Comet Storm", () => {
  it("parse", () => expect(isFullySupported(comet)).toBe(true));

  it("one target more than the times it was kicked, all different, X damage to each", () => {
    const { s: s0, ap, ids, opp } = setup([comet]);
    const a = putOnBattlefield(s0, opp, bearCard);
    const b = putOnBattlefield(s0, opp, bearCard);
    const kicks = { kicks: [0, 0] };
    const t = (id: string) => ({ kind: "object" as const, id });
    expect(planCast(s0, ap, ids[0]!, [t(a), t(b)], undefined, undefined, 3, kicks)).toBeNull(); // three targets
    expect(planCast(s0, ap, ids[0]!, [t(a), t(b), t(a)], undefined, undefined, 3, kicks)).toBeNull(); // all different
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(a), t(b), { kind: "player", id: opp }], undefined, undefined, 3, kicks)));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(37);
  });

  it("not kicked: one target", () => {
    const { s: s0, ap, ids, opp } = setup([comet]);
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "player", id: ap }], undefined, undefined, 2)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "none" }], undefined, undefined, 2)));
    expect(s.players[opp]!.life).toBe(38);
  });
});
