// Round 133: round 132's gaps (bots and automatic payment use Doubling Cube), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const emptyPools = (s: GameState) => {
  for (const p of Object.values(s.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
};

const doublingCube = card("Doubling Cube", "Artifact", "{2}", { oracleText: "{3}, {T}: Double the amount of each type of unspent mana you have." });

describe("Doubling Cube: automatic payment and bots use it when nothing else pays", () => {
  const wurm = card("Test Wurm", "Creature — Wurm", "{6}{G}{G}", { power: "8", toughness: "8" });
  /** `untapped` of the player's lands stay untapped, Forests first. */
  const withLands = (untapped: number, cube = true) => {
    const { s, ap, ids } = setup([wurm]);
    emptyPools(s);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap).sort((a, b) => Number(s.objects[b]!.cardId.includes("Forest")) - Number(s.objects[a]!.cardId.includes("Forest")));
    lands.forEach((id, i) => (s.objects[id]!.tapped = i >= untapped));
    const cubeId = cube ? putOnBattlefield(s, ap, doublingCube) : undefined;
    return { s, ap, wurm: ids[0]!, cubeId };
  };

  it("seven lands make {G}{6}: the Cube pays {3} from the pool and doubles the rest into {6}{G}{G}", () => {
    supported(doublingCube);
    const { s: s0, ap, wurm: id, cubeId } = withLands(7);
    const plan = planCast(s0, ap, id);
    expect(plan?.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, plan);
    expect(s.stack.map((x) => x.objectId)).toContain(id);
    expect(s.objects[cubeId!]!.tapped).toBe(true);
  });

  it("a bot casts the spell it couldn't otherwise pay for with the Cube", () => {
    const { s: s0, ap, wurm: id, cubeId } = withLands(7);
    // Only the Wurm in hand (no land to play first).
    const p = s0.players[ap]!;
    for (const other of p.hand.filter((x) => x !== id)) {
      s0.objects[other]!.zone = "library";
      p.library.push(other);
    }
    p.hand = [id];
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, acts);
    expect(s.stack.map((x) => x.objectId)).toContain(id);
  });

  it("without the Cube, or with too few lands for it, the spell can't be paid for", () => {
    expect(planCast(withLands(7, false).s, withLands(7, false).ap, withLands(7, false).wurm)).toBeNull();
    const { s, ap, wurm: id } = withLands(6);
    expect(planCast(s, ap, id)).toBeNull();
  });

  it("with enough lands, the Cube isn't used", () => {
    const { s, ap, wurm: id, cubeId } = withLands(8);
    const plan = planCast(s, ap, id);
    expect(plan).not.toBeNull();
    expect(plan!.some((a) => "objectId" in a && a.objectId === cubeId)).toBe(false);
  });
});
