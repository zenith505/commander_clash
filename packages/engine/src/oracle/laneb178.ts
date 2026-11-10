// Lane B round B178's lines, read by compileCard before its triggers and activated abilities (after round B177's), and
// its sentences, read at the end of round B177's.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseStaticCondition } from "./statics";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB178Line(_line: string, _raw: string, _out: CompiledCard, _isSpell: boolean): boolean {
  return false;
}

export function roundB178Sentence(s: string, sentences: string[], si: number, _ctx: Ctx, effects: Effect[]): Found {
  // Psychic Rebuttal, after "Counter target instant or sorcery spell that targets you": "Spell mastery — If there are two or
  // more instant and/or sorcery cards in your graveyard, you may copy the spell countered this way. You may choose new
  // targets for the copy.": checked as it resolves, after the counter (rulings); only a spell it really countered is
  // copied, as it last was on the stack (its X, mode and additional costs, CR 707.10), and the copy isn't cast.
  const mastery = /^If (there are \w+ or more instant and\/or sorcery cards in your graveyard), you may copy the spell countered this way$/.exec(s);
  if (mastery) {
    const last = effects[effects.length - 1];
    const cond = parseStaticCondition(mastery[1]!, { affects: { kind: "self" }, mods: [], text: "" });
    if (last?.type !== "counterSpell" || last.unless || last.exile || last.cause || !cond || sentences[si + 1]?.replace(/\.$/, "") !== "You may choose new targets for the copy") return "fail";
    last.copyCountered = true;
    return { effect: { type: "if", cond: { kind: "state", cond }, effects: [{ type: "may", effects: [{ type: "copySpell", spell: "countered", n: 1, newTargets: true }], text: "copy the spell countered this way" }] }, next: si + 2 };
  }
  return null;
}
