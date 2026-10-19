// "~ is all colors" (Transguild Courier, Awaken the Maelstrom, O-Kagachi Made Manifest): a characteristic-defining
// ability (CR 604.3) that works in every zone; on the battlefield it applies first in layer 5 (613.3), so an effect that
// makes it a color wins; a copy whose exception sets its colors doesn't copy the ability (707.9d).

import { describe, expect, it } from "vitest";
import { addEffect, card, putOnBattlefield, setup } from "./helpers";
import { characteristics, compileCard, isFullySupported } from "../src";
import { copyKey } from "../src/copies";

const ALL = ["B", "G", "R", "U", "W"];
const courier = card("Transguild Courier", "Artifact Creature — Golem", "{4}", {
  power: "3",
  toughness: "3",
  cmc: 4,
  colors: ["B", "G", "R", "U", "W"],
  oracleText: "Transguild Courier is all colors.",
});
const fallaji = card("Fallaji Wayfarer", "Creature — Human Scout", "{3}{G}", {
  power: "4",
  toughness: "4",
  cmc: 4,
  colors: ["B", "G", "R", "U", "W"],
  oracleText: "Fallaji Wayfarer is all colors. This ability doesn't affect its color identity. (It can be in any deck whose commander's color identity includes green.)\nMulticolored spells you cast have convoke.",
});

describe("\"~ is all colors\" (CR 604.3)", () => {
  it("compiles when the card data has all five colors for it, as Scryfall does", () => {
    expect(isFullySupported(courier)).toBe(true);
    expect(compileCard(courier).allColors).toBe(true);
    expect(compileCard(fallaji).allColors).toBe(true);
    // A card whose data doesn't have the colors stays out.
    expect(isFullySupported({ ...courier, oracleId: "courier-colorless", colors: [] })).toBe(false);
  });

  it("is all colors on the battlefield; an effect making it red applies after it (CR 613.3)", () => {
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, courier);
    expect([...characteristics(s, s.objects[id]!).colors].sort()).toEqual(ALL);
    addEffect(s, ap, [id], [{ kind: "setColors", colors: ["R"] }]);
    expect(characteristics(s, s.objects[id]!).colors).toEqual(["R"]);
  });

  it("a copy of it with \"except it's black\" is black: the ability that defines its colors isn't copied (CR 707.9d)", () => {
    const { s, ap } = setup([]);
    const key = copyKey(s, courier, { colors: ["B"] });
    expect(compileCard(s.cards[key]!).allColors).toBeUndefined();
    const id = putOnBattlefield(s, ap, s.cards[key]!);
    expect(characteristics(s, s.objects[id]!).colors).toEqual(["B"]);
    // A plain copy is all colors.
    const plain = putOnBattlefield(s, ap, s.cards[copyKey(s, courier)]!);
    expect([...characteristics(s, s.objects[plain]!).colors].sort()).toEqual(ALL);
  });
});
