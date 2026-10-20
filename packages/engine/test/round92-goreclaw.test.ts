// Round 92: Goreclaw, Terror of Qal Sisma. "Creature spells you cast with power 4 or greater cost {2} less to cast." The
// spell's power as it's cast: not counters it would enter with (rulings), a "*" by its defining ability (CR 604.3).

import { describe, expect, it } from "vitest";
import { bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast } from "../src";

// Real oracle text (Scryfall).
const goreclaw = card("Goreclaw, Terror of Qal Sisma", "Legendary Creature — Bear", "{3}{G}", { power: "4", toughness: "3", oracleText: "Creature spells you cast with power 4 or greater cost {2} less to cast.\nWhenever Goreclaw attacks, each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn." });
const wurm = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });
const hydra = card("Hungering Hydra", "Creature — Hydra", "{X}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\nThis creature can't be blocked by more than one creature.\nWhenever this creature is dealt damage, put that many +1/+1 counters on it." });

const manaTaps = (plan: ReturnType<typeof planCast>) => plan!.filter((a) => a.type === "activateMana").length;

describe("Goreclaw", () => {
  it("parse", () => expect(isFullySupported(goreclaw)).toBe(true));

  it("a 6/4 costs {2} less; a 2/2 doesn't", () => {
    const { s, ap, ids } = setup([wurm, bear()]);
    putOnBattlefield(s, ap, goreclaw);
    expect(manaTaps(planCast(s, ap, ids[0]!))).toBe(4);
    expect(manaTaps(planCast(s, ap, ids[1]!))).toBe(2);
  });

  it("counters it would enter with don't count (Hungering Hydra is 0/0 as a spell)", () => {
    const { s, ap, ids } = setup([hydra]);
    putOnBattlefield(s, ap, goreclaw);
    expect(manaTaps(planCast(s, ap, ids[0]!, undefined, undefined, "auto", 5))).toBe(6);
  });
});
