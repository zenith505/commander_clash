// "You may pay {W}{U}{B}{R}{G} rather than pay ~'s mana cost" (the Bringers) and "You may pay {1} and return a basic land
// you control to its owner's hand rather than pay ~'s mana cost" (the Borderposts): alternative costs (CR 118.9). The
// land may be one just tapped for mana (rulings: mana abilities come before costs are paid, CR 601.2g-h).

import { describe, expect, it } from "vitest";
import { act, card, setup } from "./helpers";
import { castProblem, isFullySupported, planCast, type GameState } from "../src";

// Real oracle text (Scryfall).
const borderpost = card("Fieldmist Borderpost", "Artifact", "{1}{W}{U}", { oracleText: "You may pay {1} and return a basic land you control to its owner's hand rather than pay this spell's mana cost.\nThis artifact enters tapped.\n{T}: Add {W} or {U}." });
const bringer = card("Bringer of the White Dawn", "Creature — Bringer", "{7}{W}{W}", {
  power: "5",
  toughness: "5",
  keywords: ["Trample"],
  oracleText: "You may pay {W}{U}{B}{R}{G} rather than pay this spell's mana cost.\nTrample\nAt the beginning of your upkeep, you may return target artifact card from your graveyard to the battlefield.",
});

const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  for (const a of plan!) s = act(s, a);
  return s;
};

describe("alternative costs: Bringers and Borderposts", () => {
  it("is supported", () => [borderpost, bringer].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("a Borderpost for {1} and a basic land returned to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([borderpost]);
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Plains")!;
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).toMatch(/not enough mana/);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "alternative", returnToHand: [land] });
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(1);
    const s = run(s0, plan);
    expect(s.objects[land]!.zone).toBe("hand");
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    // Without a land to return, it can't be cast that way.
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative", returnToHand: [] })).toMatch(/return/);
  });

  it("a Bringer for one mana of each color", () => {
    const { s: s0, ap, ids } = setup([bringer]);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "alternative" });
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(5);
    expect(planCast(s0, ap, ids[0]!)!.filter((a) => a.type === "activateMana")).toHaveLength(9);
  });
});
