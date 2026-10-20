// Round 95: Banner of Kinship: "As this artifact enters, choose a creature type. This artifact enters with a fellowship
// counter on it for each creature you control of the chosen type." The counters are counted with the choice made, both
// part of how it enters (CR 614.12). "Creatures you control of the chosen type get +1/+1 for each fellowship counter on
// this artifact." (CR 611.3a)

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const banner = card("Banner of Kinship", "Artifact", "{5}", { oracleText: "As this artifact enters, choose a creature type. This artifact enters with a fellowship counter on it for each creature you control of the chosen type.\nCreatures you control of the chosen type get +1/+1 for each fellowship counter on this artifact." });
const elf = () => card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Banner of Kinship", () => {
  it("parse", () => expect(isFullySupported(banner)).toBe(true));

  it("enters with a fellowship counter for each creature you control of the chosen type, and pumps them", () => {
    const { s: s0, ap, ids, opp } = setup([banner]);
    const a = putOnBattlefield(s0, ap, elf());
    const b = putOnBattlefield(s0, ap, elf());
    const bearId = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, elf());
    let s = s0;
    for (const x of planCast(s, ap, ids[0]!)!) s = act(s, x);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    expect(s.objects[ids[0]!]!.counters.fellowship).toBe(2);
    expect(pt(s, a)).toBe("3/3");
    expect(pt(s, b)).toBe("3/3");
    expect(pt(s, bearId)).toBe("2/2");
    expect(pt(s, theirs)).toBe("1/1");
  });
});
