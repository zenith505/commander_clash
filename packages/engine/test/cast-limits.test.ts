// "Each player can't cast more than one spell each turn" (Rule of Law), "... one noncreature spell" (Deafening
// Silence), Ethersworn Canonist: a "can't" (CR 101.2) that counts every matching spell the player cast this turn,
// including those cast before the permanent was on the battlefield (rulings).

import { describe, expect, it } from "vitest";
import { bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, planCast } from "../src";

// Real oracle text (Scryfall).
const ruleOfLaw = card("Rule of Law", "Enchantment", "{2}{W}", { oracleText: "Each player can't cast more than one spell each turn." });
const silence = card("Deafening Silence", "Enchantment", "{W}", { oracleText: "Each player can't cast more than one noncreature spell each turn." });
const canonist = card("Ethersworn Canonist", "Artifact Creature — Human Cleric", "{1}{W}", { power: "2", toughness: "2", oracleText: "Each player who has cast a nonartifact spell this turn can't cast additional nonartifact spells." });
const moderation = card("Moderation", "Enchantment", "{1}{W}{U}", { oracleText: "You can't cast more than one spell each turn.\nWhenever you cast a spell, draw a card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("can't cast more than one spell each turn", () => {
  it("is supported", () => [ruleOfLaw, silence, canonist, moderation].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Rule of Law: a second spell can't be cast; the spell cast before it entered counts", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).not.toBeNull();
    putOnBattlefield(s, opp, ruleOfLaw);
    expect(castProblem(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toMatch(/Rule of Law/);
  });

  it("Deafening Silence lets creature spells through; Ethersworn Canonist artifact spells", () => {
    const art = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
    const { s: s0, ap, opp, ids } = setup([shock, bear(), shock, art]);
    putOnBattlefield(s0, opp, silence);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
    expect(castProblem(s, ap, ids[2]!, [{ kind: "player", id: opp }])).toMatch(/Deafening Silence/);
    const { s: t0, ap: a2, opp: o2, ids: ids2 } = setup([shock, art, shock]);
    putOnBattlefield(t0, o2, canonist);
    s = cast(t0, a2, ids2[0]!, [{ kind: "player", id: o2 }]);
    expect(planCast(s, a2, ids2[1]!)).not.toBeNull();
    expect(castProblem(s, a2, ids2[2]!, [{ kind: "player", id: o2 }])).toMatch(/Ethersworn Canonist/);
  });

  it("Moderation limits only its controller", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    putOnBattlefield(s0, opp, moderation);
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).not.toBeNull();
  });
});
