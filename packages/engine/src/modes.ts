// Modal spells and abilities (CR 700.2): "Choose one —", "Choose two —", "Choose one or
// both —", followed by a bulleted list of modes. The modes are chosen as the spell is cast
// or the ability is activated or put on the stack (CR 601.2b, 603.3c), and only the chosen
// modes' targets are chosen (CR 700.2c). After that the spell behaves exactly like one
// whose text is just the chosen modes, in printed order (CR 608.2c), which is what
// `withModes` builds.

import type { AbilityBody, SpellCondition, TargetSpec } from "./abilities";

/** Why `modes` isn't a valid choice for this modal body (ignoring targets), or null. `both`: see modeRange. */
export function modeCountProblem(body: AbilityBody, modes: number[], both = false): string | null {
  const m = body.modal;
  if (!m) return modes.length ? "this isn't modal" : null;
  if (modes.some((i) => !Number.isInteger(i) || i < 0 || i >= m.modes.length)) return "no such mode";
  if (new Set(modes).size !== modes.length) return "each mode can be chosen only once"; // CR 700.2d
  const [min, max] = modeRange(body, both);
  if (modes.length < min || (modes.length > max && !entwined(body, modes))) return `choose ${describeCount(min, max)}${m.entwine ? ", or all of them (entwine)" : ""}`;
  return null;
}

/**
 * How many modes may be chosen. `both`: "If this spell was cast using teamwork, choose both instead" (exactly two) or
 * "If you control a commander as you cast this spell, you may choose both instead" (one or both) applies.
 */
export function modeRange(body: AbilityBody, both = false): [number, number] {
  const m = body.modal!;
  if (!both || !m.both) return [m.min, m.max];
  return m.both === "teamwork" ? [2, 2] : [1, 2];
}

/** All the modes of a spell with entwine were chosen, so it costs its entwine cost more (CR 702.42a). */
export function entwined(body: AbilityBody, modes: number[] | undefined): boolean {
  const m = body.modal;
  return !!m?.entwine && !!modes && modes.length === m.modes.length && modes.length > m.max;
}

export function describeCount(min: number, max: number): string {
  const words = ["zero", "one", "two", "three", "four", "five"];
  const w = (n: number) => words[n] ?? String(n);
  if (min === max) return `${w(min)} mode${min === 1 ? "" : "s"}`;
  if (min === 0) return `up to ${w(max)}`;
  if (min === 1 && max === 2) return "one or both";
  return `${w(min)} to ${w(max)} modes`;
}

/**
 * The body made of just the chosen modes, in printed order. Each mode's targets are
 * appended in turn, and its effects' target references are shifted to match.
 * A body that isn't modal is returned unchanged.
 */
export function withModes(body: AbilityBody, modes: number[] | undefined): AbilityBody {
  if (!body.modal) return body;
  const chosen = [...(modes ?? [])].sort((a, b) => a - b);
  const out: AbilityBody = { targets: [], effects: [], text: "" };
  const texts: string[] = [];
  for (const i of chosen) {
    const mode = body.modal.modes[i]!;
    const offset = out.targets.length;
    out.targets.push(...mode.targets.map((spec) => (spec.distinctFrom ? { ...spec, distinctFrom: spec.distinctFrom.map((j) => j + offset) } : spec)));
    out.effects.push(...mode.effects.map((e) => shiftTargets(e, offset)));
    texts.push(mode.text);
  }
  out.text = texts.join(" ");
  return out;
}

/** Copy of an effect with every target index moved up by `offset`. */
function shiftTargets<T>(x: T, offset: number): T {
  if (offset === 0) return x;
  if (Array.isArray(x)) return x.map((y) => shiftTargets(y, offset)) as T;
  if (!x || typeof x !== "object") return x;
  const o = x as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) copy[k] = shiftTargets(v, offset);
  // References into the targets list: { ref: "target" | "targetController" | "anyTarget", index } and counterSpell's index.
  const refersToTarget = o.ref === "target" || o.ref === "targetController" || o.ref === "anyTarget" || o.type === "counterSpell";
  if (refersToTarget && typeof o.index === "number") copy.index = o.index + offset;
  return copy as T;
}

/** The optional costs announced for a spell (CR 601.2b) that decide which of its targets it has (see TargetSpec.onlyIf). */
export interface CastHow {
  kicks?: number[];
  bargained?: boolean;
  teamwork?: boolean;
  gift?: boolean;
}

/** Whether a spell cast this way meets a condition on how it was cast ("if ~ was kicked", "if the gift was promised"). */
export function castConditionMet(cond: SpellCondition, how: CastHow): boolean {
  switch (cond.kind) {
    case "kicked":
      return cond.which === undefined ? !!how.kicks?.length : !!how.kicks?.includes(cond.which);
    case "bargained":
      return !!how.bargained;
    case "teamwork":
      return !!how.teamwork;
    case "gift":
      return !!how.gift;
    default:
      return true;
  }
}

/**
 * The targets a spell cast this way has: one only a part it won't do would need is skipped, so nothing is chosen for it
 * (CR 702.33g, 702.166d, 702.194c, 702.174m: "the spell is cast as if it did not have those targets").
 */
export function gateTargets(specs: TargetSpec[], how: CastHow = {}): TargetSpec[] {
  if (!specs.some((t) => t.onlyIf)) return specs;
  return specs.map((t) => (t.onlyIf && castConditionMet(t.onlyIf.cond, how) === !!t.onlyIf.not ? { ...t, skip: true } : t));
}

/** Whether some of these targets depend on how the spell is cast (see gateTargets). */
export const hasGatedTargets = (specs: TargetSpec[]) => specs.some((t) => t.onlyIf);
