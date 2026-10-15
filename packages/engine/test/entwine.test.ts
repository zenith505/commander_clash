// Entwine (CR 702.42): "You may choose all modes of this spell instead of just the number specified. If you do, you
// pay an additional [cost]." The modes then happen in the order written (CR 702.42b).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, isFullySupported, planCast, spellCost, manaValue, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const unsupported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(false));

// Real oracle text (Scryfall).
const rust = card("Rain of Rust", "Instant", "{3}{R}{R}", { keywords: ["Entwine"], oracleText: "Choose one —\n• Destroy target artifact.\n• Destroy target land.\nEntwine {3}{R} (Choose both if you pay the entwine cost.)" });
const plain = card("Plain Choice Test", "Instant", "{1}", { oracleText: "Choose one —\n• Destroy target artifact.\n• Destroy target land." });
const barbed = card("Barbed Lightning", "Instant", "{2}{R}", { keywords: ["Entwine"], oracleText: "Choose one —\n• Barbed Lightning deals 3 damage to target creature.\n• Barbed Lightning deals 3 damage to target player or planeswalker.\nEntwine {2} (Choose both if you pay the entwine cost.)" });
const betrayal = card("Betrayal of Flesh", "Instant", "{5}{B}", { keywords: ["Entwine"], oracleText: "Choose one —\n• Destroy target creature.\n• Return target creature card from your graveyard to the battlefield.\nEntwine—Sacrifice three lands. (Choose both if you pay the entwine cost.)" });
const bauble = card("Bauble Test", "Artifact", "{1}");
const wastes = card("Wastes Test", "Land");

const cost = (s: GameState, pid: PlayerId, id: string, modes: number[]) => {
  const c = spellCost(s, pid, s.objects[id]!, 0, [], { modes });
  return manaValue(c.cost) + c.extra;
};

describe("entwine", () => {
  it("parses mana entwine costs; a non-mana one stays unsupported", () => {
    supported(rust, barbed);
    unsupported(betrayal);
  });

  it("choosing every mode adds the entwine cost; more than allowed without all of them is still illegal", () => {
    const { s, ap, opp, ids } = setup([rust, plain]);
    expect(cost(s, ap, ids[0]!, [1])).toBe(5);
    expect(cost(s, ap, ids[0]!, [0, 1])).toBe(9);
    const land = putOnBattlefield(s, opp, wastes);
    const art = putOnBattlefield(s, opp, bauble);
    expect(castProblem(s, ap, ids[1]!, [target(art), target(land)], [0, 1])).toMatch(/choose one mode$/);
    expect(planCast(s, ap, ids[0]!, [target(art), target(land)], [0, 1])).not.toBeNull();
  });

  it("an entwined spell does every mode, in printed order (CR 702.42b)", () => {
    const { s: s0, ap, opp, ids } = setup([rust]);
    const art = putOnBattlefield(s0, opp, bauble);
    const land = putOnBattlefield(s0, opp, wastes);
    const s = cast(s0, ap, ids[0]!, [target(art), target(land)], [0, 1]);
    expect(s.objects[art]!.zone).toBe("graveyard");
    expect(s.objects[land]!.zone).toBe("graveyard");
    // {3}{R}{R} plus {3}{R}: nine of the fourteen lands.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(9);
  });

  it("every mode must have a legal target to entwine (CR 700.2a)", () => {
    const { s, ap, opp, ids } = setup([rust]);
    const land = putOnBattlefield(s, opp, wastes);
    expect(castProblem(s, ap, ids[0]!, [target(land), target(land)], [0, 1])).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [target(land)], [1])).not.toBeNull();
  });

  it("a bot entwines when it can pay and every mode has a target", () => {
    const { s: s0, ap, opp, ids } = setup([barbed]);
    putOnBattlefield(s0, opp, bear());
    let s = s0;
    for (let i = 0; i < 10 && !s.stack.length; i++) for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids[0], modes: [0, 1] });
  });
});
