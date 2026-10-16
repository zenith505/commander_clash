// Modal spells and abilities (CR 700.2): "Choose one —", "Choose two —", "Choose one or
// both —", followed by a bulleted list of modes. The modes are chosen as the spell is cast
// or the ability is activated or put on the stack (CR 601.2b, 603.3c), and only the chosen
// modes' targets are chosen (CR 700.2c). After that the spell behaves exactly like one
// whose text is just the chosen modes, in printed order (CR 608.2c), which is what
// `withModes` builds.

import type { AbilityBody, SpellCondition, TargetChoice, TargetSpec } from "./abilities";
import type { PlayerId } from "./types";

/** Why `modes` isn't a valid choice for this modal body (ignoring targets), or null. `both`: see modeRange. */
export function modeCountProblem(body: AbilityBody, modes: number[], both = false): string | null {
  const m = body.modal;
  if (!m) return modes.length ? "this isn't modal" : null;
  if (modes.some((i) => !Number.isInteger(i) || i < 0 || i >= m.modes.length)) return "no such mode";
  // Unless "you may choose the same mode more than once" (CR 700.2d); a kicked Inscription can't (rulings).
  if (!m.repeat && new Set(modes).size !== modes.length) return "each mode can be chosen only once";
  // Pawprints (CR 700.2i): modes worth up to that many {P}, as many as fit.
  if (m.pawprints) return pawprintsOf(m, modes) > m.max ? `choose up to ${m.max} {P} worth of modes` : null;
  const [min, max] = modeRange(body, both);
  if (modes.length < min || (modes.length > max && !entwined(body, modes))) return `choose ${describeCount(min, max)}${m.entwine ? ", or all of them (entwine)" : ""}`;
  return null;
}

/** How many {P} these modes are worth (CR 700.2i). */
export const pawprintsOf = (m: NonNullable<AbilityBody["modal"]>, modes: number[]) => modes.reduce((n, i) => n + (m.pawprints?.[i] ?? 0), 0);

/**
 * How many modes may be chosen. `both`: "If this spell was cast using teamwork, choose both instead" (exactly two),
 * "If you control a commander as you cast this spell, you may choose both instead" (one or both), or "If this spell was
 * kicked, choose any number instead" (one to all of them) applies.
 */
export function modeRange(body: AbilityBody, both = false): [number, number] {
  const m = body.modal!;
  if (!both || !m.both) return [m.min, m.max];
  return m.both === "teamwork" ? [2, 2] : m.both === "kicked" ? [1, m.modes.length] : [1, 2];
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
  evidence?: boolean;
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
    case "evidence":
      return !!how.evidence;
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

/** The target entry that stands for "any number of target ..." or "up to X target ..." (TargetSpec.many), or -1. */
export const manySlot = (specs: TargetSpec[]): number => specs.findIndex((t) => t.many);

/**
 * The body with its "any number of target ..." entry made into the `k` targets announced for it (CR 601.2c): each a
 * target of its own, none the same as another (115.3), and the effects' references to it covering them all; the
 * targets after it move up. With none announced it stays one target, cast as if it didn't have it (115.6), so nothing
 * is chosen for it. `optional`: each may still be left unchosen (offering the most there could be, to choose from).
 */
export function expandMany(body: AbilityBody, k: number, optional = false): AbilityBody {
  const i = manySlot(body.targets);
  if (i < 0) return body;
  const n = Math.max(1, k);
  const shift = (j: number) => (j > i ? j + n - 1 : j);
  const fix = (t: TargetSpec): TargetSpec => ({
    ...t,
    ...(t.distinctFrom ? { distinctFrom: t.distinctFrom.map(shift) } : {}),
    ...(t.sameGraveyardAs ? { sameGraveyardAs: t.sameGraveyardAs.map(shift) } : {}),
    ...(t.sharesCreatureTypeWith ? { sharesCreatureTypeWith: t.sharesCreatureTypeWith.map(shift) } : {}),
    ...(t.divided ? { divided: { ...t.divided, first: shift(t.divided.first) } } : {}),
  });
  const { many: _many, ...spec0 } = fix(body.targets[i]!);
  // "X damage divided as you choose among any number of targets": divided among the ones announced.
  const spec: TargetSpec = spec0.divided ? { ...spec0, divided: { ...spec0.divided, first: i, n } } : spec0;
  const copies: TargetSpec[] =
    k === 0
      ? [{ ...spec, skip: true }]
      : Array.from({ length: k }, (_, c) => {
          const distinct = [...(spec.distinctFrom ?? []), ...Array.from({ length: c }, (_, j) => i + j)];
          return { ...spec, ...(optional ? { optional: true as const } : {}), ...(distinct.length ? { distinctFrom: distinct } : {}) };
        });
  return { ...body, targets: [...body.targets.slice(0, i).map(fix), ...copies, ...body.targets.slice(i + 1).map(fix)], effects: body.effects.map((e) => spreadRefs(e, i, n)) };
}

/**
 * The body with its "for each opponent, ... up to one target ... that player controls" entry (TargetSpec.perOpponent)
 * made into one "up to one" target for each of these opponents, controlled by that opponent (CR 601.2c, 115.6): the
 * effects' references to it cover them all, and the targets after it move up. With no opponent it stays one target,
 * cast as if it didn't have it. Already done, as is.
 */
export function expandPerOpponent(body: AbilityBody, opponents: PlayerId[]): AbilityBody {
  const i = body.targets.findIndex((t) => t.perOpponent);
  if (i < 0) return body;
  const n = Math.max(1, opponents.length);
  const shift = (j: number) => (j > i ? j + n - 1 : j);
  const fix = (t: TargetSpec): TargetSpec => ({
    ...t,
    ...(t.distinctFrom ? { distinctFrom: t.distinctFrom.map(shift) } : {}),
    ...(t.sameGraveyardAs ? { sameGraveyardAs: t.sameGraveyardAs.map(shift) } : {}),
    ...(t.sharesCreatureTypeWith ? { sharesCreatureTypeWith: t.sharesCreatureTypeWith.map(shift) } : {}),
    ...(t.divided ? { divided: { ...t.divided, first: shift(t.divided.first) } } : {}),
  });
  const { perOpponent: _p, controller: _c, ...spec } = body.targets[i]!;
  const copies: TargetSpec[] = opponents.length ? opponents.map((pid) => ({ ...spec, optional: true, controlledBy: pid })) : [{ ...spec, skip: true }];
  return { ...body, targets: [...body.targets.slice(0, i).map(fix), ...copies, ...body.targets.slice(i + 1).map(fix)], effects: body.effects.map((e) => spreadRefs(e, i, n)) };
}

/**
 * The body as cast with these targets, and the targets (CR 601.2c): its "any number of target ..." entry becomes as many
 * targets as were chosen for it, the ones left unchosen dropped. A reason it can't be, or with nothing of the kind, as is.
 * `x`: the X announced, which "up to X target ..." can't choose more than.
 */
export function fitMany(body: AbilityBody, targets: TargetChoice[], x = 0): { body: AbilityBody; targets: TargetChoice[] } | string {
  const i = manySlot(body.targets);
  if (i < 0) return { body, targets };
  const spec = body.targets[i]!;
  const end = targets.length - (body.targets.length - 1 - i);
  if (end < i) return `choose ${body.targets.length - 1} target(s) besides ${spec.text}`;
  const group = targets.slice(i, end).filter((t) => t.kind !== "none");
  if (spec.skip && group.length) return `${spec.text} isn't a target this spell has, cast this way`;
  if (spec.many === "x" && group.length > x) return `choose at most X (${x}) targets for ${spec.text}`;
  if (spec.many === "exactX" && group.length !== x) return `choose X (${x}) targets for ${spec.text}`;
  // Divided as you choose (CR 601.2d): at least 1 each, so no more targets than the amount, and at least one if there's
  // anything to divide (none if it's 0, rulings on Rolling Thunder).
  // "Divided among X target creatures" (Meteor Swarm): X of them, so X is no more than the amount.
  const d = spec.divided;
  if (d && (d.amount || spec.many === "exactX") && !spec.skip) {
    if (group.length > d.total) return `choose at most ${d.total} target(s) to divide ${d.total} among`;
    if (d.total > 0 && !group.length && spec.many !== "exactX") return `choose at least one target to divide ${d.total} among`;
  }
  return { body: expandMany(body, group.length), targets: [...targets.slice(0, i), ...(group.length ? group : [{ kind: "none" as const }]), ...targets.slice(end)] };
}

/** Copy of an effect with its references to target `i` covering `n` targets, and the ones after moved up. */
function spreadRefs<T>(x: T, i: number, n: number): T {
  if (Array.isArray(x)) return x.map((y) => spreadRefs(y, i, n)) as T;
  if (!x || typeof x !== "object") return x;
  const o = x as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(o)) copy[key] = spreadRefs(v, i, n);
  // Every reference to a target by its number: { ref: "target", index }, "its controller", "any target", the spell a
  // counterspell or redirect targets, Twincast's { target }.
  if (typeof o.index === "number" && (typeof o.ref === "string" || o.type === "counterSpell" || o.type === "changeTarget")) {
    if (o.index > i) copy.index = o.index + n - 1;
    else if (o.index === i && (o.ref === "target" || o.ref === "anyTarget")) copy.n = n;
  }
  if (typeof o.target === "number" && Object.keys(o).length === 1 && o.target > i) copy.target = o.target + n - 1;
  return copy as T;
}
