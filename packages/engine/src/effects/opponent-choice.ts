// "Target ... of an opponent's choice" in a spell or an activated ability (Evangelize, Magus of the Arena, Cuombajj
// Witches, Volcanic Offering): its controller chooses an opponent, and that opponent chooses the target, as it's cast or
// activated (CR 601.2c, 602.2b; rulings: "This is not a choice made on resolution"). The controller still controls it
// and targets with it, so the target must be legal for them (hexproof, protection), and "they control" means the chosen
// opponent controls it, then and as it resolves (rulings on Evangelize: it won't resolve otherwise, and a new target
// must be one of theirs too).

import type { TargetChoice, TargetSpec } from "../abilities";
import type { CostChoices, GameState, PlayerId } from "../types";
import type { SourceQuality } from "../keywords";
import { canChooseTarget, legalTargets } from "./targeting";

/** The slots of these targets another player chooses: an opponent the controller chooses (TargetSpec.chosenBy "opponent"). */
export const chooserSlots = (specs: TargetSpec[]): number[] => specs.flatMap((t, i) => (t.chosenBy === "opponent" ? [i] : []));

/**
 * The targets with each slot's opponent known (CostChoices.targetChoosers, in slot order): "of an opponent's choice they
 * control" becomes "controlled by that opponent" (TargetSpec.chooserControls).
 */
export function bindChoosers(specs: TargetSpec[], choosers: PlayerId[] | undefined): TargetSpec[] {
  let k = 0;
  return specs.map((t) => {
    if (t.chosenBy !== "opponent") return t;
    const who = choosers?.[k++];
    if (who === undefined || !t.chooserControls) return t;
    const { controller: _, ...rest } = t;
    return { ...rest, controlledBy: who };
  });
}

/**
 * The targets with the opponents' picks in their slots (CostChoices.chooserPicks, in slot order), the slots not picked
 * yet left as none. Or why not: the controller doesn't choose those (they come as none from them).
 */
export function withChooserPicks(specs: TargetSpec[], targets: TargetChoice[], picks: TargetChoice[] | undefined): TargetChoice[] | string {
  const slots = chooserSlots(specs);
  if (!slots.length) return targets;
  const out = [...targets];
  for (const [k, i] of slots.entries()) {
    const given = out[i];
    if (given && given.kind !== "none") return `an opponent chooses ${specs[i]!.text}`;
    out[i] = picks?.[k] ?? { kind: "none" };
  }
  return out;
}

/** The opponents' picks so far and the opponents chosen to make them, from a cast's or an activation's choices. */
export const chooserChoices = (c: CostChoices | undefined) => ({ choosers: c?.targetChoosers ?? [], picks: c?.chooserPicks ?? [] });

/**
 * The targets with a stand-in for each slot an opponent hasn't picked yet: the first legal one there is for it (bound to
 * its opponent once that one's chosen), so whatever else makes it illegal shows up before anyone is asked. Or why it
 * can't be cast or activated: nothing that opponent (or any opponent, before one is chosen) could choose.
 */
export function withStandIns(s: GameState, specs: TargetSpec[], targets: TargetChoice[], controller: PlayerId, src?: SourceQuality, sourceId?: string): TargetChoice[] | string {
  const out = [...targets];
  for (const i of chooserSlots(specs)) {
    if (out[i] && out[i]!.kind !== "none") continue;
    const spec = specs[i]!;
    const pick = legalTargets(s, spec, controller, undefined, src, sourceId).find((c) => canChooseTarget(s, specs, out.slice(0, i), i, c, controller, src, sourceId));
    if (!pick) return `nothing can be chosen for ${spec.text}`;
    out[i] = pick;
  }
  return out;
}

/** The targets as their controller chooses them: the ones an opponent chooses are skipped then (they come as none). */
export const forController = (specs: TargetSpec[]): TargetSpec[] => specs.map((t) => (t.chosenBy === "opponent" ? { ...t, skip: true as const } : t));

/**
 * "An opponent chooses one —" (Fatal Lore): "target creatures that player controls" in the chosen mode is controlled by the
 * opponent who chose it (TargetSpec controller "modeChooser"), bound for good as it's cast (CR 700.2e, 601.2c).
 */
export function bindModeChooser(specs: TargetSpec[], chooser: PlayerId | undefined): TargetSpec[] {
  if (chooser === undefined) return specs;
  return specs.map((t) => {
    if (t.controller !== "modeChooser") return t;
    const { controller: _, ...rest } = t;
    return { ...rest, controlledBy: chooser };
  });
}
