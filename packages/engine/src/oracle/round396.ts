// Round 396's whole lines (compile.ts): a permanent becoming a copy "for as long as" something stays so (CR 611.2b): Zygon
// Infiltrator's "for as long as that creature remains tapped", Blade of Shared Souls' and Assimilation Aegis's "for as long
// as ~ remains attached to it". The copies run in effects/run-copies.ts (becomeCopyWhile) and effects/run-round396.ts.
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** One whole line of round 396's (compile.ts); false when it isn't one of these. */
export function round396Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Zygon Infiltrator: "Body-print — {2}{U}: Tap another target creature and put a stun counter on it. ~ becomes a copy of
  // that creature for as long as that creature remains tapped. Activate only as a sorcery." (an ability word, CR 207.2c).
  // The copy begins only if that creature is still tapped as it would begin, and ends for good once it untaps, leaves or
  // phases out (CR 611.2b, 702.26f); its copiable values as they are then (CR 707.2, rulings).
  const zygon = /^(?:[A-Z][a-z-]+ — )?(\{[^:]+\}): Tap another target creature and put a stun counter on it\. ~ becomes a copy of that creature for as long as that creature remains tapped\. Activate only as a sorcery\.$/.exec(line);
  if (zygon) {
    const a = isSpell ? null : parseActivated(`${zygon[1]}: Tap another target creature and put a stun counter on it. Activate only as a sorcery.`);
    const [tap, stun] = a && a !== "fail" ? a.body.effects : [];
    if (!a || a === "fail" || !a.sorcerySpeed || a.body.targets.length !== 1 || !a.body.targets[0]!.notSource || a.body.effects.length !== 2 || tap?.type !== "tap" || stun?.type !== "counters") return fail(out, raw);
    const copy: Effect = { type: "becomeCopy", what: { ref: "self" }, of: { ref: "target", index: 0 }, duration: "whileTargetTapped" };
    out.activated.push({ ...a, body: { ...a.body, effects: [tap, stun, copy], text: "Tap another target creature and put a stun counter on it. ~ becomes a copy of that creature for as long as that creature remains tapped." }, text: line });
    return true;
  }
  // Blade of Shared Souls: "Whenever ~ becomes attached to a creature, for as long as ~ remains attached to it, you may have
  // that creature become a copy of another target creature you control." "Another": not that creature (fixed as the trigger
  // is put on the stack, TargetSpec.notSubject). Values locked in as it begins (rulings); never begun if ~ isn't attached
  // to it then, over for good once it's unattached (CR 611.2b).
  const blade = /^Whenever ~ becomes attached to a creature, for as long as ~ remains attached to it, (you may have that creature become a copy of another target creature you control\.)$/.exec(line);
  if (blade) {
    const t = isSpell ? null : parseTrigger(`Whenever ~ becomes attached to a creature, ${blade[1]}`);
    const may = t && t !== "fail" ? t.body.effects[0] : undefined;
    const copy = may?.type === "may" ? may.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfBecomesAttached" || t.body.targets.length !== 1 || t.body.effects.length !== 1 || may?.type !== "may" || may.effects.length !== 1 || copy?.type !== "becomeCopy" || copy.what.ref !== "subject" || copy.of.ref !== "target" || copy.duration !== "game") return fail(out, raw);
    const { notSource: _n, ...spec } = t.body.targets[0]!;
    const effects: Effect[] = [{ ...may, effects: [{ ...copy, duration: "whileSourceAttached" }], text: "have that creature become a copy of another target creature you control for as long as ~ remains attached to it" }];
    out.triggers.push({ ...t, body: { targets: [{ ...spec, notSubject: true, text: "another target creature you control" }], effects, text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  // Assimilation Aegis: "Whenever ~ becomes attached to a creature, for as long as ~ remains attached to it, that creature
  // becomes a copy of a creature card exiled with ~." Linked to its one exile ability (compile.ts linkExile, CR 607.2a).
  if (line === "Whenever ~ becomes attached to a creature, for as long as ~ remains attached to it, that creature becomes a copy of a creature card exiled with ~.") {
    const t = isSpell ? null : parseTrigger("Whenever ~ becomes attached to a creature, tap that creature.");
    if (!t || t === "fail" || t.event !== "selfBecomesAttached") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "becomeCopyOfLinked", what: { ref: "subject" } }], text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  return false;
}
