// Phasing (CR 702.26).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isSummoningSick, botActions, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets, undefined, "auto")));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets?: TargetChoice[]) => settle(run(s, planActivate(s, pid, id, index, targets)));
const out = (s: GameState, id: string) => s.objects[id]?.zone === "phasedOut";

// Real oracle text (Scryfall).
const sandbarCrocodile = card("Sandbar Crocodile", "Creature — Crocodile", "{4}{U}", { power: "6", toughness: "5", keywords: ["Phasing"], oracleText: "Phasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)" });
const realityRipple = card("Reality Ripple", "Instant", "{1}{U}", { oracleText: "Target artifact, creature, or land phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before its controller untaps during their next untap step.)" });
const rainbowEfreet = card("Rainbow Efreet", "Creature — Efreet", "{3}{U}", { power: "3", toughness: "1", keywords: ["Flying"], oracleText: "Flying\n{U}{U}: This creature phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before you untap during your next untap step.)" });
const vanishing = card("Vanishing", "Enchantment — Aura", "{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\n{U}{U}: Enchanted creature phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before its controller untaps during their next untap step.)" });
const slipOutTheBack = card("Slip Out the Back", "Instant", "{U}", { oracleText: "Put a +1/+1 counter on target creature. It phases out. (Treat it and anything attached to it as though they don't exist until its controller's next turn.)" });
const crystalGolem = card("Crystal Golem", "Artifact Creature — Golem", "{4}", { power: "3", toughness: "3", oracleText: "At the beginning of your end step, this creature phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before you untap during your next untap step.)" });
const teferisIsle = card("Teferi's Isle", "Legendary Land", "", { keywords: ["Phasing"], oracleText: "Phasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)\nTeferi's Isle enters tapped.\n{T}: Add {U}{U}." });
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("phasing", () => {
  it("phases out during its controller's untap step, and back in during the next one, as the same object (CR 702.26a, d)", () => {
    supported(sandbarCrocodile, realityRipple, rainbowEfreet, vanishing, slipOutTheBack, crystalGolem, teferisIsle);
    const { s: s0, ap } = setup([]);
    const croc = putOnBattlefield(s0, ap, sandbarCrocodile);
    s0.objects[croc]!.counters["+1/+1"] = 1;
    const zc = s0.objects[croc]!.zoneChanges ?? 0;
    let s = passUntil(s0, "upkeep", ap);
    // The next turn of ours: the untap step phased it out.
    expect(s.turn).toBeGreaterThan(s0.turn);
    expect(out(s, croc)).toBe(true);
    expect(s.battlefield).not.toContain(croc);
    const turn = s.turn;
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "upkeep", ap);
    expect(s.turn).toBeGreaterThan(turn);
    expect(out(s, croc)).toBe(false);
    expect(s.battlefield).toContain(croc);
    // Same object, counters kept, and it can attack: it never left or changed control (CR 702.26d).
    expect(s.objects[croc]!.zoneChanges ?? 0).toBe(zc);
    expect(s.objects[croc]!.counters["+1/+1"]).toBe(1);
    expect(isSummoningSick(s, s.objects[croc]!)).toBe(false);
  });

  it("a phased-out permanent is treated as though it doesn't exist: Wrath of God doesn't destroy it (CR 702.26b)", () => {
    const { s: s0, ap, ids, opp } = setup([realityRipple, wrath]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = castNow(s0, ap, ids[0]!, [target(theirs)]);
    expect(out(s, theirs)).toBe(true);
    s = castNow(s, ap, ids[1]!);
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(out(s, theirs)).toBe(true);
    // It phases in during its controller's untap step, not ours.
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("phasing out removes it from combat (CR 702.26b, 506.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    const efreet = putOnBattlefield(s0, ap, rainbowEfreet);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: efreet, defender: opp }] });
    const life = s.players[opp]!.life;
    s = settle(s);
    s = activateNow(s, ap, efreet, 0);
    expect(out(s, efreet)).toBe(true);
    expect(s.objects[efreet]!.attacking).toBeUndefined();
    for (let i = 0; i < 100 && s.step !== "main2"; i++) s = s.pending ? run(s, botActions(s, waitingOn(s)!)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(life);
  });

  it("an Aura phases out with the creature it enchants, indirectly, and comes back attached (CR 702.26g)", () => {
    const { s: s0, ap, ids } = setup([vanishing]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = castNow(s0, ap, ids[0]!, [target(b)]);
    const aura = ids[0]!;
    expect(s.objects[aura]!.attachedTo).toBe(b);
    s = activateNow(s, ap, aura, 0);
    expect(out(s, b) && out(s, aura)).toBe(true);
    expect(s.objects[aura]!.phased?.indirect).toBe(true);
    s = passUntil(s, "upkeep", ap);
    s = passUntil(s, "main1", ap);
    // It phased in during our untap step, with the Aura still on it.
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(b);
  });

  it("'It phases out' after targeting it; damage on it is still removed in the cleanup step (CR 514.2)", () => {
    const { s: s0, ap, ids } = setup([shock, slipOutTheBack]);
    const b = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    let s = castNow(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.damage).toBe(2);
    s = castNow(s, ap, ids[1]!, [target(b)]);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(out(s, b)).toBe(true);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.objects[b]!.damage).toBe(0);
    expect(out(s, b)).toBe(true);
  });

  it("a phased-out token still exists (CR 702.26d); a phased-out permanent leaves with its owner (702.26k)", () => {
    const { s: s0, ap, ids, opp } = setup([realityRipple]);
    const tok = putOnBattlefield(s0, opp, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    let s = castNow(s0, ap, ids[0]!, [target(tok)]);
    expect(out(s, tok)).toBe(true);
    expect(s.objects[tok]).toBeDefined();
    s = act(s, { type: "concede", player: opp });
    expect(s.objects[tok]).toBeUndefined();
    expect(s.phasedOut ?? []).not.toContain(tok);
  });

  it("Crystal Golem phases out at the end step; a land with phasing too", () => {
    const { s: s0, ap } = setup([]);
    const golem = putOnBattlefield(s0, ap, crystalGolem);
    const isle = putOnBattlefield(s0, ap, teferisIsle);
    let s = passUntil(s0, "cleanup", ap);
    expect(out(s, golem)).toBe(true);
    s = passUntil(s, "upkeep", ap);
    expect(out(s, golem)).toBe(false);
    expect(out(s, isle)).toBe(true);
    expect(characteristics(s, s.objects[golem]!).types).toContain("Creature");
  });
});
