// Blitz (CR 702.152), warp (CR 702.185) and plot (CR 702.170).

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, setup } from "./helpers";
import { botActions, castProblem, characteristics, isFullySupported, legalActions, planCast, planPlot, plotProblem, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const untappedLands = (s: GameState, pid: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

// Real oracle text (Scryfall).
const mayhemPatrol = card("Mayhem Patrol", "Creature — Devil Warrior", "{1}{R}", {
  power: "1",
  toughness: "2",
  keywords: ["Menace", "Blitz"],
  oracleText:
    'Menace (This creature can\'t be blocked except by two or more creatures.)\nWhenever this creature attacks, target creature gets +1/+0 until end of turn.\nBlitz {1}{R} (If you cast this spell for its blitz cost, it gains haste and "When this creature dies, draw a card." Sacrifice it at the beginning of the next end step.)',
});
const knightLuminary = card("Knight Luminary", "Creature — Human Knight", "{3}{W}", {
  power: "2",
  toughness: "3",
  keywords: ["Warp"],
  oracleText:
    "When this creature enters, create a 1/1 white Human Soldier creature token.\nWarp {1}{W} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)",
});
const cunningCoyote = card("Cunning Coyote", "Creature — Coyote", "{1}{R}{R}", {
  power: "2",
  toughness: "2",
  keywords: ["Haste", "Plot"],
  oracleText:
    "Haste\nWhen this creature enters, another target creature you control gets +1/+1 and gains haste until end of turn.\nPlot {1}{R} (You may pay {1}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
});
const slickshot = card("Slickshot Show-Off", "Creature — Bird Wizard", "{1}{R}", {
  power: "1",
  toughness: "2",
  keywords: ["Flying", "Haste", "Plot"],
  oracleText:
    "Flying, haste\nWhenever you cast a noncreature spell, this creature gets +2/+0 until end of turn.\nPlot {1}{R} (You may pay {1}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
});

describe("blitz (CR 702.152a)", () => {
  it("haste, sacrificed at the next end step, and its controller draws a card as it dies", () => {
    supported(mayhemPatrol);
    const { s: s0, ap, ids } = setup([mayhemPatrol]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "blitz" }));
    expect(s.log.some((l) => /for its blitz cost/.test(l.text))).toBe(true);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).toContain("Haste");
    const hand = s.players[ap]!.hand.length;
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("cast for its mana cost, it has no haste and stays", () => {
    const { s: s0, ap, ids } = setup([mayhemPatrol]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).not.toContain("Haste");
    s = passUntil(s, "cleanup", ap);
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });
});

describe("warp (CR 702.185a)", () => {
  it("exiled at the next end step, then its owner may cast it from exile on a later turn, for its mana cost", () => {
    supported(knightLuminary);
    const { s: s0, ap, ids } = setup([knightLuminary]);
    const id = ids[0]!;
    let s = run(s0, planCast(s0, ap, id, undefined, undefined, undefined, undefined, { alt: "warp" }));
    expect(zone(s, id)).toBe("battlefield");
    const tokens = () => s.battlefield.filter((x) => s.objects[x]!.isToken).length;
    expect(tokens()).toBe(1);
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, id)).toBe("exile");
    // Not this turn.
    expect(castProblem(s, ap, id)).not.toBeNull();
    s = passUntil(s, "main1", ap);
    expect(zone(s, id)).toBe("exile");
    // Not for its warp cost again: that works only from the hand.
    expect(castProblem(s, ap, id, undefined, undefined, undefined, undefined, undefined, { alt: "warp" })).toMatch(/only from your hand/);
    const before = untappedLands(s, ap);
    s = run(s, planCast(s, ap, id));
    expect(zone(s, id)).toBe("battlefield");
    expect(before - untappedLands(s, ap)).toBe(4);
    expect(tokens()).toBe(2);
    // Cast normally, it stays.
    s = passUntil(s, "cleanup", ap);
    expect(zone(s, id)).toBe("battlefield");
  });

  it("can't be cast for its warp cost from anywhere but the hand", () => {
    const { s, ap, ids } = setup([knightLuminary]);
    const o = s.objects[ids[0]!]!;
    s.players[ap]!.hand = [];
    o.zone = "graveyard";
    s.players[ap]!.graveyard.push(o.id);
    expect(castProblem(s, ap, o.id, undefined, undefined, undefined, undefined, undefined, { alt: "warp" })).not.toBeNull();
  });
});

describe("plot (CR 702.170)", () => {
  it("a special action at sorcery speed; cast free from exile, as a sorcery, on a later turn", () => {
    supported(cunningCoyote, slickshot);
    const { s: s0, ap, ids } = setup([slickshot]);
    const id = ids[0]!;
    expect(legalActions(s0, ap).some((a) => a.type === "plot")).toBe(false); // no mana in pool yet
    let s = run(s0, planPlot(s0, ap, id));
    expect(zone(s, id)).toBe("exile");
    expect(s.stack.length).toBe(0); // it doesn't use the stack
    expect(castProblem(s, ap, id)).not.toBeNull(); // not this turn
    // Not on another player's turn either: only as a sorcery.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(castProblem(s, ap, id)).not.toBeNull();
    s = passUntil(s, "main1", ap);
    expect(castProblem(s, ap, id)).toBeNull();
    const before = untappedLands(s, ap);
    s = run(s, planCast(s, ap, id));
    expect(zone(s, id)).toBe("battlefield");
    expect(untappedLands(s, ap)).toBe(before); // without paying its mana cost
  });

  it("only from your hand, during your main phase with the stack empty", () => {
    const { s, ap, ids, opp } = setup([slickshot]);
    expect(plotProblem(s, opp, ids[0]!)).toMatch(/hand/);
    s.step = "beginCombat";
    expect(plotProblem(s, ap, ids[0]!)).toMatch(/main phase/);
  });

  it("bots plot what they can't cast with the mana left in their second main phase", () => {
    const { s: s0, ap, ids } = setup([cunningCoyote]);
    let s = passUntil(s0, "main2", ap);
    // Only the plot card in hand (no lands or bears drawn to play first).
    for (const x of s.players[ap]!.hand.filter((x) => x !== ids[0])) {
      s.objects[x]!.zone = "library";
      s.players[ap]!.library.push(x);
    }
    s.players[ap]!.hand = [ids[0]!];
    // Leave only two Mountains untapped: enough to plot it ({1}{R}), not to cast it ({1}{R}{R}) or the commander ({1}{G}).
    let keep = 2;
    for (const x of s.battlefield) {
      const o = s.objects[x]!;
      if (o.controller !== ap || !s.cards[o.cardId]!.types.includes("Land")) continue;
      o.tapped = !(s.cards[o.cardId]!.name === "Mountain" && keep-- > 0);
    }
    for (let i = 0; i < 6 && zone(s, ids[0]!) === "hand"; i++) s = act(s, botActions(s, ap)[0]!);
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[ids[0]!]!.mayPlay?.until).toBe("plot");
    // On its next turn, the bot casts it for free.
    s = passUntil(s, "main1", ap);
    for (let i = 0; i < 10 && zone(s, ids[0]!) === "exile"; i++) s = act(s, botActions(s, ap)[0]!);
    expect(zone(s, ids[0]!)).toBe("stack");
  });
});
