// Statics of Auras and Equipment and counter groups: "gets +10/+10 and loses flying", "as long as enchanted permanent is
// a creature", "creatures you control with +1/+1 counters on them".

import { describe, expect, it } from "vitest";
import { bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics, isFullySupported, objHasKeyword, type CardDef } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const colossusHammer = card("Colossus Hammer", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +10/+10 and loses flying.\nEquip {8} ({8}: Attach to target creature you control. Equip only as a sorcery.)" });
const akkiWarPaint = card("Akki War Paint", "Enchantment — Aura", "{R}", { keywords: ["Enchant"], oracleText: "Enchant artifact or creature\nAs long as enchanted permanent is a creature, it gets +2/+1." });
const trainingRegimen = card("Training Regimen", "Enchantment", "{3}{G}", { oracleText: "Creatures you control with +1/+1 counters on them have trample.\nAt the beginning of combat on your turn, put a +1/+1 counter on target creature you control." });
const flyer = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const relic = card("Relic", "Artifact", "{2}", { oracleText: "" });

describe("attached and counter statics", () => {
  it("Colossus Hammer: +10/+10 and the equipped creature loses flying (layer 6)", () => {
    supported(colossusHammer, akkiWarPaint, trainingRegimen);
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, flyer);
    const h = putOnBattlefield(s, ap, colossusHammer);
    s.objects[h]!.attachedTo = d;
    invalidateCharacteristics(s);
    expect(pt(s, d)).toBe("12/12");
    expect(objHasKeyword(s, s.objects[d]!, "Flying")).toBe(false);
  });

  it("Akki War Paint: the bonus only while the enchanted permanent is a creature", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const r = putOnBattlefield(s, ap, relic);
    const p1 = putOnBattlefield(s, ap, akkiWarPaint);
    const p2 = putOnBattlefield(s, ap, akkiWarPaint);
    s.objects[p1]!.attachedTo = b;
    s.objects[p2]!.attachedTo = r;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("4/3");
    expect(s.objects[r]!.zone).toBe("battlefield");
  });

  it("Training Regimen: creatures you control with +1/+1 counters on them have trample", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, trainingRegimen);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[a]!.counters["+1/+1"] = 1;
    s.objects[theirs]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[a]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(false);
    expect(objHasKeyword(s, s.objects[theirs]!, "Trample")).toBe(false);
  });
});
