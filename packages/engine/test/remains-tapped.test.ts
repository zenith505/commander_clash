// "You may choose not to untap ~ during your untap step" (CR 502.3) and "for as long as ~ remains tapped" (CR 611.2b):
// Tawnos's Weaponry, Rubinia Soulsinger, Mana Leech, Thran Weaponry. The effect ends when the source untaps, leaves the
// battlefield, or (with "for as long as you control ~") changes control; if the source untapped before the ability
// resolved, it does nothing even when tapped again (rulings on Rubinia Soulsinger and Preacher).

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, forest, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, untapPermanent, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const weaponry = card("Tawnos's Weaponry", "Artifact", "{2}", { oracleText: "You may choose not to untap this artifact during your untap step.\n{2}, {T}: Target creature gets +1/+1 for as long as this artifact remains tapped." });
const rubinia = card("Rubinia Soulsinger", "Legendary Creature — Faerie", "{2}{G}{W}{U}", { power: "2", toughness: "3", oracleText: "You may choose not to untap Rubinia Soulsinger during your untap step.\n{T}: Gain control of target creature for as long as you control Rubinia Soulsinger and Rubinia Soulsinger remains tapped." });
const leech = card("Mana Leech", "Creature — Leech", "{2}{B}", { power: "1", toughness: "1", oracleText: "You may choose not to untap this creature during your untap step.\n{T}: Tap target land. It doesn't untap during its controller's untap step for as long as this creature remains tapped." });
const squid = card("Sand Squid", "Creature — Squid Beast", "{3}{U}", { power: "2", toughness: "2", keywords: ["Landwalk", "Islandwalk"], oracleText: "Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nYou may choose not to untap this creature during your untap step.\n{T}: Tap target creature. That creature doesn't untap during its controller's untap step for as long as this creature remains tapped." });
const thran = card("Thran Weaponry", "Artifact", "{4}", { keywords: ["Echo"], oracleText: "Echo {4} (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)\nYou may choose not to untap this artifact during your untap step.\n{2}, {T}: All creatures get +2/+2 for as long as this artifact remains tapped." });
const courier = card("Everglove Courier", "Creature — Elf", "{2}{G}", { power: "2", toughness: "1", oracleText: "You may choose not to untap this creature during your untap step.\n{2}{G}, {T}: Target Elf creature gets +2/+2 and has trample for as long as this creature remains tapped." });
const satyr = card("Willow Satyr", "Creature — Satyr", "{2}{G}{G}", { power: "1", toughness: "1", oracleText: "You may choose not to untap this creature during your untap step.\n{T}: Gain control of target legendary creature for as long as you control this creature and this creature remains tapped." });
const helm = card("Helm of Possession", "Artifact", "{4}", { oracleText: "You may choose not to untap this artifact during your untap step.\n{2}, {T}, Sacrifice a creature: Gain control of target creature for as long as you control this artifact and this artifact remains tapped." });
const dreamsower = card("Thalakos Dreamsower", "Creature — Thalakos Wizard", "{2}{U}", { power: "1", toughness: "1", keywords: ["Shadow"], oracleText: "Shadow (This creature can block or be blocked by only creatures with shadow.)\nYou may choose not to untap this creature during your untap step.\nWhenever this creature deals damage to an opponent, tap target creature. That creature doesn't untap during its controller's untap step for as long as this creature remains tapped." });
const oldMan = card("Old Man of the Sea", "Creature — Djinn", "{1}{U}{U}", { power: "2", toughness: "3", oracleText: "You may choose not to untap this creature during your untap step.\n{T}: Gain control of target creature with power less than or equal to this creature's power for as long as this creature remains tapped and that creature's power remains less than or equal to this creature's power." });

/** Pass until `pid`'s next untap step, where they choose what stays tapped. */
const toUntap = (s: GameState, pid: PlayerId) => passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "untap", pid);
const keep = (s: GameState, pid: PlayerId, ids: string[]) => act(s, { type: "pickPermanents", player: pid, ids });

describe("for as long as ~ remains tapped", () => {
  it("parses; Old Man of the Sea's second condition is supported since round B163 (laneb-round163.test.ts)", () => {
    supported(weaponry, rubinia, leech, squid, thran, courier, satyr, helm, dreamsower, oldMan);
  });

  it("lasts while its source stays tapped; its controller chooses in the untap step (CR 502.3)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, weaponry);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activate(s0, ap, w, 0, [target(b)]);
    expect(pt(s, b)).toBe("3/3");
    s = toUntap(s, ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "keepTapped", player: ap, options: [w] });
    s = keep(s, ap, [w]);
    expect(s.objects[w]!.tapped).toBe(true);
    expect(pt(s, b)).toBe("3/3");
    expect(s.log.some((l) => /keeps Tawnos's Weaponry tapped/.test(l.text))).toBe(true);
    s = toUntap(s, ap);
    s = keep(s, ap, []);
    expect(s.objects[w]!.tapped).toBe(false);
    expect(pt(s, b)).toBe("2/2");
    expect(s.effects).toHaveLength(0);
  });

  it("doesn't ask when nothing could stay tapped", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, weaponry);
    const s = passUntil(act(s0, { type: "passPriority", player: ap }), "upkeep", ap);
    expect(s.step).toBe("upkeep");
  });

  it("ends when the source untaps another way, or leaves the battlefield (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rubinia);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = activate(s0, ap, r, 0, [target(theirs)]);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    untapPermanent(s, s.objects[r]!);
    invalidateCharacteristics(s);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const r1 = putOnBattlefield(s1, ap1, rubinia);
    const theirs1 = putOnBattlefield(s1, opp1, bear());
    s = activate(s1, ap1, r1, 0, [target(theirs1)]);
    moveObject(s, r1, "graveyard");
    invalidateCharacteristics(s);
    expect(controllerOf(s, s.objects[theirs1]!)).toBe(opp1);
  });

  it("'for as long as you control ~' ends when another player gains control of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rubinia);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = activate(s0, ap, r, 0, [target(theirs)]);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    const steal = addEffect(s, opp, [r], [{ kind: "control" }], "game");
    s = act(s, { type: "passPriority", player: waitingOn(s)! }); // state-based checks see it
    expect(s.objects[r]!.tapped).toBe(true);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    expect(s.effects.map((e) => e.id)).toEqual([steal.id]);
  });

  it("does nothing if the source untapped before it resolved, even if it's tapped again (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rubinia);
    const theirs = putOnBattlefield(s0, opp, bear());
    const plan = [{ type: "activateAbility" as const, player: ap, objectId: r, index: 0, targets: [target(theirs)] }];
    let s = plan.reduce((x, a) => act(x, a), s0);
    untapPermanent(s, s.objects[r]!);
    s.objects[r]!.tapped = true;
    for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    expect(s.effects).toHaveLength(0);
    expect(s.log.some((l) => /effect does nothing/.test(l.text))).toBe(true);
  });

  it("'doesn't untap during its controller's untap step' while the source stays tapped (Mana Leech)", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leech);
    const land = putOnBattlefield(s0, opp, forest);
    let s = activate(s0, ap, l, 0, [target(land)]);
    expect(s.objects[land]!.tapped).toBe(true);
    s = passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "upkeep", opp);
    expect(s.objects[land]!.tapped).toBe(true);
    s = toUntap(s, ap);
    s = keep(s, ap, []);
    expect(s.objects[l]!.tapped).toBe(false);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[land]!.tapped).toBe(false);
  });

  it("'all creatures' is the creatures there as it resolved (CR 611.2c)", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, thran);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activate(s0, ap, t, 0, []);
    expect(pt(s, b)).toBe("4/4");
    const later = putOnBattlefield(s, ap, bear());
    expect(pt(s, later)).toBe("2/2");
  });

  it("a bot keeps it tapped while its effect lasts", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rubinia);
    const w = putOnBattlefield(s0, ap, weaponry);
    s0.objects[w]!.tapped = true;
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = activate(s0, ap, r, 0, [target(theirs)]);
    s = toUntap(s, ap);
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [r] }]);
  });
});
