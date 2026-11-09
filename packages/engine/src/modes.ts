// Modal spells and abilities (CR 700.2): "Choose one —", "Choose two —", "Choose one or
// both —", followed by a bulleted list of modes. The modes are chosen as the spell is cast
// or the ability is activated or put on the stack (CR 601.2b, 603.3c), and only the chosen
// modes' targets are chosen (CR 700.2c). After that the spell behaves exactly like one
// whose text is just the chosen modes, in printed order (CR 608.2c), which is what
// `withModes` builds.

import type { AbilityBody, AltCostKind, SpellCondition, TargetChoice, TargetSpec } from "./abilities";
import type { PlayerId } from "./types";

/** "Choose X" (Doomsday Confluence, AbilityBody.modal.xCount): no more modes than this, whatever X is. */
export const X_MODES_MAX = 20;

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
  if (m.optional && !modes.length) return null;
  if (modes.length < min || (modes.length > max && !entwined(body, modes))) return `choose ${describeCount(min, max)}${m.entwine !== undefined ? ", or all of them (entwine)" : ""}`;
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
  return m.both === "teamwork" || m.bothExactly ? [2, 2] : m.both === "kicked" || m.bothAny ? [1, m.modes.length] : [1, 2]; // "commander", "control": one or two
}

/** All the modes of a spell with entwine were chosen, so it costs its entwine cost more (CR 702.42a). */
export function entwined(body: AbilityBody, modes: number[] | undefined): boolean {
  const m = body.modal;
  return m?.entwine !== undefined && !!modes && modes.length === m.modes.length && modes.length > m.max;
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
    // "Each mode must target a different player": not the same as any target of the modes before it.
    const earlier = body.modal.distinctTargets ? Array.from({ length: offset }, (_, j) => j) : [];
    out.targets.push(...mode.targets.map((spec0) => {
      // A target's relation to another of its mode's targets, moved with them.
      const spec = spec0.inGraveyardOfTarget !== undefined ? { ...spec0, inGraveyardOfTarget: spec0.inGraveyardOfTarget + offset } : spec0;
      return spec.distinctFrom || earlier.length ? { ...spec, distinctFrom: [...earlier, ...(spec.distinctFrom ?? []).map((j) => j + offset)] } : spec;
    }));
    out.effects.push(...mode.effects.map((e) => shiftTargets(e, offset)));
    texts.push(mode.text);
  }
  out.text = texts.join(" ");
  return out;
}

/**
 * Splice (CR 702.47a, c-d): the spell gains the rules text of each spliced card, whose effects happen after the main
 * spell's, in the order given (702.47b). Their targets are chosen with the spell's, after its own.
 */
export function withSplices(body: AbilityBody, spliced: AbilityBody[]): AbilityBody {
  if (!spliced.length) return body;
  const out: AbilityBody = { ...body, targets: [...body.targets], effects: [...body.effects] };
  for (const b of spliced) {
    const offset = out.targets.length;
    out.targets.push(...b.targets.map((spec) => (spec.distinctFrom ? { ...spec, distinctFrom: spec.distinctFrom.map((j) => j + offset) } : spec)));
    out.effects.push(...b.effects.map((e) => shiftTargets(e, offset)));
  }
  out.text = [body.text, ...spliced.map((b) => b.text)].join(" ");
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
  const refersToTarget = o.ref === "target" || o.ref === "targetController" || o.ref === "targetOwner" || o.ref === "anyTarget" || o.type === "counterSpell";
  if (refersToTarget && typeof o.index === "number") copy.index = o.index + offset;
  // A damage effect's source that's one of the targets: "target creature you control deals damage equal to its power to
  // any other target" (Special Move's third mode).
  const by = o.by as { target?: unknown } | undefined;
  if (by && typeof by === "object" && typeof by.target === "number") copy.by = { ...(copy.by as object), target: by.target + offset };
  return copy as T;
}

/** The optional costs announced for a spell (CR 601.2b) that decide which of its targets it has (see TargetSpec.onlyIf). */
export interface CastHow {
  kicks?: number[];
  bargained?: boolean;
  teamwork?: boolean;
  gift?: boolean;
  evidence?: boolean;
  /** The alternative cost it's cast for: awaken's target is chosen only then (CR 702.113b). */
  alt?: AltCostKind;
  /** The face of a card with several it's cast as (CR 709.3, 712.11b, 715.3): spellTargets looks at that face. */
  face?: number;
  /**
   * Selective Snare: the creature type chosen as it's cast (CompiledCard.castChooseType), its targets' type. Unset, any type
   * could still be chosen: they're any creatures (only for asking whether it could be cast).
   */
  castType?: string;
}

/** Whether a spell cast this way meets a condition on how it was cast ("if ~ was kicked", "if the gift was promised"). */
export function castConditionMet(cond: SpellCondition, how: CastHow): boolean {
  switch (cond.kind) {
    case "kicked":
      if (cond.times) return (how.kicks?.length ?? 0) >= cond.times;
      return cond.which === undefined ? !!how.kicks?.length : !!how.kicks?.includes(cond.which);
    case "bargained":
      return !!how.bargained;
    case "teamwork":
      return !!how.teamwork;
    case "gift":
      return !!how.gift;
    case "evidence":
      return !!how.evidence;
    case "altPaid":
      return how.alt === cond.alt;
    default:
      return true;
  }
}

/**
 * The targets a spell cast this way has: one only a part it won't do would need is skipped, so nothing is chosen for it
 * (CR 702.33g, 702.166d, 702.194c, 702.174m: "the spell is cast as if it did not have those targets").
 */
export function gateTargets(specs: TargetSpec[], how: CastHow = {}): TargetSpec[] {
  return gateBody({ targets: specs, effects: [], text: "" }, how).targets;
}

/**
 * The body as cast this way (see gateTargets); "another target for each time it was kicked" (Comet Storm) becomes that
 * many targets (CR 601.2c, 702.33d), the effects' references to it covering them all.
 */
export function gateBody(b0: AbilityBody, how: CastHow = {}): AbilityBody {
  // "Target creatures of the creature type of your choice": of the type chosen (CR 601.2b-c), bound for good.
  const b = b0.targets.some((t) => t.chosen === "type") ? { ...b0, targets: b0.targets.map((t) => (t.chosen !== "type" ? t : (({ chosen: _, ...rest }) => (how.castType ? { ...rest, subtypes: [...(rest.subtypes ?? []), how.castType] } : rest))(t))) } : b0;
  if (!hasGatedTargets(b.targets)) return b;
  // Avacyn's Judgment: the amount divided, known once the alternative cost is chosen (CR 601.2b), before it's divided (601.2d).
  if (b.targets.some((t) => t.divided?.altAmount)) return gateBody({ ...b, targets: b.targets.map((t) => (t.divided?.altAmount ? { ...t, divided: (({ altAmount, ...d }) => (how.alt === altAmount!.alt ? { ...d, amount: altAmount!.amount } : d))(t.divided) } : t)) }, how);
  const gated = b.targets.some((t) => t.onlyIf) ? { ...b, targets: b.targets.map((t) => (t.onlyIf && castConditionMet(t.onlyIf.cond, how) === !!t.onlyIf.not ? { ...t, skip: true as const } : t)) } : b;
  return gated.targets.some((t) => t.many === "kicked") ? expandMany(gated, how.kicks?.length ?? 0) : gated;
}

/** Whether some of these targets depend on how the spell is cast (see gateTargets). */
export const hasGatedTargets = (specs: TargetSpec[]) => specs.some((t) => t.onlyIf || t.many === "kicked" || t.divided?.altAmount);

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
    ...(t.inGraveyardOfTarget !== undefined ? { inGraveyardOfTarget: shift(t.inGraveyardOfTarget) } : {}),
    ...(t.sharesCreatureTypeWith ? { sharesCreatureTypeWith: t.sharesCreatureTypeWith.map(shift) } : {}),
    ...(t.differentNameFrom ? { differentNameFrom: t.differentNameFrom.map(shift) } : {}),
    ...(t.differentManaValueFrom ? { differentManaValueFrom: t.differentManaValueFrom.map(shift) } : {}),
    ...(t.divided ? { divided: { ...t.divided, first: shift(t.divided.first) } } : {}),
  });
  const { many: _many, differentManaValues, singleGraveyard, differentControllers, ...spec0 } = fix(body.targets[i]!);
  // "X damage divided as you choose among any number of targets": divided among the ones announced.
  const spec: TargetSpec = spec0.divided ? { ...spec0, divided: { ...spec0.divided, first: i, n } } : spec0;
  const copies: TargetSpec[] =
    k === 0
      ? [{ ...spec, skip: true }]
      : Array.from({ length: k }, (_, c) => {
          const distinct = [...(spec.distinctFrom ?? []), ...Array.from({ length: c }, (_, j) => i + j)];
          const group = Array.from({ length: c }, (_, j) => i + j);
          return { ...spec, ...(optional ? { optional: true as const } : {}), ...(distinct.length ? { distinctFrom: distinct } : {}), ...(differentManaValues && c ? { differentManaValueFrom: group } : {}), ...(singleGraveyard && c ? { sameGraveyardAs: group } : {}), ...(differentControllers && k > 1 ? { differentControllerFrom: Array.from({ length: k }, (_, j) => i + j).filter((j) => j !== i + c) } : {}) };
        });
  return { ...body, targets: [...body.targets.slice(0, i).map(fix), ...copies, ...body.targets.slice(i + 1).map(fix)], effects: body.effects.map((e) => spreadRefs(e, i, n)) };
}

/**
 * The body with its "for each opponent, ... up to one target ... that player controls" entry (TargetSpec.perOpponent)
 * made into one "up to one" target for each of these opponents, controlled by that opponent (CR 601.2c, 115.6): the
 * effects' references to it cover them all, and the targets after it move up. With no opponent it stays one target,
 * cast as if it didn't have it. Already done, as is.
 */
export function expandPerOpponent(body: AbilityBody, opponents: PlayerId[], able?: (spec: TargetSpec) => boolean): AbilityBody {
  const i = body.targets.findIndex((t) => t.perOpponent);
  if (i < 0) return body;
  const n = Math.max(1, opponents.length);
  const shift = (j: number) => (j > i ? j + n - 1 : j);
  const fix = (t: TargetSpec): TargetSpec => ({
    ...t,
    ...(t.distinctFrom ? { distinctFrom: t.distinctFrom.map(shift) } : {}),
    ...(t.sameGraveyardAs ? { sameGraveyardAs: t.sameGraveyardAs.map(shift) } : {}),
    ...(t.inGraveyardOfTarget !== undefined ? { inGraveyardOfTarget: shift(t.inGraveyardOfTarget) } : {}),
    ...(t.sharesCreatureTypeWith ? { sharesCreatureTypeWith: t.sharesCreatureTypeWith.map(shift) } : {}),
    ...(t.differentNameFrom ? { differentNameFrom: t.differentNameFrom.map(shift) } : {}),
    ...(t.differentManaValueFrom ? { differentManaValueFrom: t.differentManaValueFrom.map(shift) } : {}),
    ...(t.divided ? { divided: { ...t.divided, first: shift(t.divided.first) } } : {}),
  });
  const { perOpponent: _p, perPlayer: _e, controller: _c, perOpponentRequired: required, perPlayerAll: all, ...spec } = body.targets[i]!;
  // Not "up to one" (Blatant Thievery, Sylvan Primordial): one must be chosen for each opponent who has one (rulings),
  // none for an opponent who doesn't.
  // Vaevictis Asmadi, the Dire (perPlayerAll): every player's, so none for one leaves no legal choice (rulings).
  const one = (pid: PlayerId): TargetSpec => (required ? (!all && able && !able({ ...spec, controlledBy: pid }) ? { ...spec, controlledBy: pid, skip: true } : { ...spec, controlledBy: pid }) : { ...spec, optional: true, controlledBy: pid });
  const copies: TargetSpec[] = opponents.length ? opponents.map(one) : [{ ...spec, skip: true }];
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
  if (spec.manyMin && !spec.skip && group.length < spec.manyMin) return `choose at least one target for ${spec.text}`;
  if (spec.manyMax !== undefined && group.length > spec.manyMax) return `choose at most ${spec.manyMax} targets for ${spec.text}`;
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
  // A reflexive trigger's body has targets of its own (CR 603.12); only what it's about refers to these (Thorin).
  if (o.type === "reflexive") {
    const about = o.about as { target?: number } | undefined;
    return { ...o, ...(about && typeof about === "object" && typeof about.target === "number" && about.target > i ? { about: { ...about, target: about.target + n - 1 } } : {}) } as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(o)) copy[key] = spreadRefs(v, i, n);
  // Every reference to a target by its number: { ref: "target", index }, "its controller", "any target", the spell a
  // counterspell or redirect targets, Twincast's { target }.
  if (typeof o.index === "number" && (typeof o.ref === "string" || o.type === "counterSpell" || o.type === "changeTarget")) {
    if (o.index > i) copy.index = o.index + n - 1;
    else if (o.index === i && (o.ref === "target" || o.ref === "anyTarget" || o.type === "counterSpell")) copy.n = n;
    // "Choose any target, then choose another target for each time ~ was kicked. ~ deals X damage to each of them."
    // (Comet Storm): a reference to targets from before the slot through it covers them all.
    else if (o.index < i && typeof o.n === "number" && o.index + o.n > i && (o.ref === "target" || o.ref === "anyTarget")) copy.n = o.n + n - 1;
  }
  if (typeof o.target === "number" && Object.keys(o).length === 1 && o.target > i) copy.target = o.target + n - 1;
  // Display of Power's copySpell { target, many }: the slot's targets, all of them.
  if (typeof o.target === "number" && o.many === true && Object.keys(o).every((k) => k === "target" || k === "many" || k === "n")) {
    if (o.target > i) copy.target = o.target + n - 1;
    else if (o.target === i) copy.n = n;
  }
  return copy as T;
}
