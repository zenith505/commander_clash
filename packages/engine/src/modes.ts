// Modal spells and abilities (CR 700.2): "Choose one —", "Choose two —", "Choose one or
// both —", followed by a bulleted list of modes. The modes are chosen as the spell is cast
// or the ability is activated or put on the stack (CR 601.2b, 603.3c), and only the chosen
// modes' targets are chosen (CR 700.2c). After that the spell behaves exactly like one
// whose text is just the chosen modes, in printed order (CR 608.2c), which is what
// `withModes` builds.

import type { AbilityBody } from "./abilities";

/** Why `modes` isn't a valid choice for this modal body (ignoring targets), or null. */
export function modeCountProblem(body: AbilityBody, modes: number[]): string | null {
  const m = body.modal;
  if (!m) return modes.length ? "this isn't modal" : null;
  if (modes.some((i) => !Number.isInteger(i) || i < 0 || i >= m.modes.length)) return "no such mode";
  if (new Set(modes).size !== modes.length) return "each mode can be chosen only once"; // CR 700.2d
  if (modes.length < m.min || modes.length > m.max) return `choose ${describeCount(m.min, m.max)}`;
  return null;
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
    out.targets.push(...mode.targets);
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
