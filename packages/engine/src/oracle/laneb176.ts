// Lane B round B176's lines, read by compileCard before its triggers and activated abilities (after round B175's), and
// its sentences, read at the end of round B175's.
import type { CompiledCard, Effect } from "../abilities";
import { parseOne, type Ctx } from "./body";
import { CREATURE_TYPES } from "../keywords";
import { parseAffected, parseStatic } from "./statics";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB176Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Aurification: "Each creature with a gold counter on it is a Wall in addition to its other creature types and has
  // defender.": layers 4 and 6 for the same creatures (CR 613.1d, f), those with such a counter now (rulings: the type
  // and defender both).
  const isAndHas = /^Each (creature with an? [a-z]+ counter on it) is an? ([A-Z][a-z]+) in addition to its other creature types and has (.+)\.$/.exec(line);
  if (isAndHas) {
    const probe = parseStatic(`Each ${isAndHas[1]} has ${isAndHas[3]}.`);
    if (!probe || probe.condition || probe.affects.kind !== "filter" || !probe.affects.spec?.counter || !CREATURE_TYPES.has(isAndHas[2]!)) out.unsupported.push(raw);
    else out.statics.push({ affects: probe.affects, mods: [{ kind: "addTypes", types: [], subtypes: [isAndHas[2]!] }, ...probe.mods], text: line });
    return true;
  }
  // Sanctum Lurker: "Planeswalkers you control aren't put into their owners' graveyards for having 0 loyalty.": the
  // state-based action of CR 704.5i doesn't apply to them; one with no loyalty counters stays, and its abilities that
  // cost [0] or add loyalty can still be activated (rulings, CR 606.6).
  const noLoyalty = /^(Planeswalkers you control) aren't put into their owners' graveyards for having 0 loyalty\.$/.exec(line);
  if (noLoyalty) {
    const affects = parseAffected(noLoyalty[1]!);
    if (affects?.kind !== "filter") out.unsupported.push(raw);
    else out.statics.push({ affects, mods: [{ kind: "survivesZeroLoyalty" }], text: line });
    return true;
  }
  return false;
}

export function roundB176Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Thelon of Havenwood: "Put a spore counter on each Fungus on the battlefield": every permanent with the subtype, whoever
  // controls it, the same as "each Fungus" (CR 109.2).
  const onField = /^(Put an? [a-z]+ counter on each [A-Z][a-z]+) on the battlefield$/.exec(s);
  if (onField) {
    const fx = parseOne(onField[1]!, ctx);
    const one = fx?.length === 1 ? fx[0] : undefined;
    if (one?.type !== "counters" || one.what.ref !== "each" || one.what.filter.controller) return "fail";
    return { effect: one, next: si + 1 };
  }
  return null;
}
