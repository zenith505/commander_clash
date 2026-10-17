// Tectonic Split: "As an additional cost to cast this spell, sacrifice half the lands you control, rounded up": how many
// is worked out as the total cost is (CR 601.2f).

import { describe, expect, it } from "vitest";
import { act, card, setup } from "./helpers";
import { isFullySupported, planCast, type GameState } from "../src";
import { objIsType } from "../src/cards";

// Real oracle text (Scryfall).
const split = card("Tectonic Split", "Enchantment", "{4}{G}{G}", { keywords: ["Hexproof"], oracleText: 'As an additional cost to cast this spell, sacrifice half the lands you control, rounded up.\nHexproof\nLands you control have "{T}: Add three mana of any one color."' });
const myLands = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && objIsType(s, s.objects[id]!, "Land"));

describe("sacrifice half the lands you control, rounded up", () => {
  it("parse", () => expect(isFullySupported(split)).toBe(true));

  it("with 13 lands, 7 are sacrificed", () => {
    const { s: s0, ap, ids } = setup([split]);
    const lands = myLands(s0, ap);
    s0.battlefield = s0.battlefield.filter((id) => id !== lands[0]);
    delete s0.objects[lands[0]!];
    const rest = lands.slice(1);
    expect(rest.length).toBe(13);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { sacrifice: rest.slice(0, 6) })).toBeNull();
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { sacrifice: rest.slice(0, 7) })!;
    expect(plan).not.toBeNull();
    const s = plan.reduce((x, a) => act(x, a), s0);
    expect(rest.slice(0, 7).every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(myLands(s, ap).length).toBe(6);
    expect(s.stack.some((it) => it.objectId === ids[0])).toBe(true);
  });
});
