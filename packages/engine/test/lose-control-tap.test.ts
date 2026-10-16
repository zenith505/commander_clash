// "When you lose control of the creature, tap it" (Ray of Command, Magus of the Unseen): a delayed triggered ability
// (CR 603.7) that triggers once, when the control effect ends in the cleanup step or another player takes it (rulings).

import { describe, expect, it } from "vitest";
import { activate, addEffect, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, controllerOf, isFullySupported, objHasKeyword } from "../src";

// Real oracle text (Scryfall).
const ray = card("Ray of Command", "Instant", "{3}{U}", { oracleText: "Untap target creature an opponent controls and gain control of it until end of turn. That creature gains haste until end of turn. When you lose control of the creature, tap it." });
const magus = card("Magus of the Unseen", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1", oracleText: "{1}{U}, {T}: Untap target artifact an opponent controls and gain control of it until end of turn. It gains haste until end of turn. When you lose control of the artifact, tap it." });
const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });

describe("when you lose control of it, tap it", () => {
  it("parse", () => {
    expect(isFullySupported(ray)).toBe(true);
    expect(isFullySupported(magus)).toBe(true);
  });

  it("Ray of Command: untap and take it with haste; it taps as control returns in the cleanup step", () => {
    const { s: s0, ap, opp, ids } = setup([ray]);
    const b = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    s0.objects[b]!.tapped = true;
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
    expect(s.delayed?.filter((d) => d.when === "lostControl")).toHaveLength(1);
    // Into the next turn: control came back to its owner in the cleanup step, and it tapped then.
    s = passUntil(s, "upkeep", opp);
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
    expect(s.delayed?.some((d) => d.when === "lostControl")).toBeFalsy();
    // It triggered in the cleanup step (and untapped again in its controller's untap step).
    expect(s.log.some((l) => l.text === "Ray of Command's ability triggers (Tap it).")).toBe(true);
  });

  it("it taps as soon as another player takes control of it, and only once", () => {
    const { s: s0, ap, opp, ids } = setup([ray]);
    const b = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    const third = s.turnOrder.find((x) => x !== ap && x !== opp)!;
    addEffect(s, third, [b], [{ kind: "control" }], "game");
    expect(characteristics(s, s.objects[b]!).controller).toBe(third);
    s = passAll(passAll(s));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.delayed?.some((d) => d.when === "lostControl")).toBeFalsy();
  });

  it("Magus of the Unseen: an artifact, the same way", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, magus);
    const g = putOnBattlefield(s0, opp, golem);
    s0.objects[g]!.tapped = true;
    let s = activate(s0, ap, m, 0, [target(g)]);
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
    expect(s.objects[g]!.tapped).toBe(false);
    s = passUntil(s, "upkeep", opp);
    expect(controllerOf(s, s.objects[g]!)).toBe(opp);
    expect(s.delayed?.some((d) => d.when === "lostControl")).toBeFalsy();
  });
});
