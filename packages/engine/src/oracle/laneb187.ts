// Lane B round B187's lines, read by compileCard before its triggers and activated abilities (after round B186's), and
// its sentences, read at the end of round B186's.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { roundB190Sentence } from "./laneb190";
import { parseObject } from "./targets";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB187Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Skyseer's Chariot: "Activated abilities of sources with the chosen name cost {2} more to activate.": as Pithing
  // Needle's name (chosen as it enters, CR 614.12), with no "unless they're mana abilities", so mana abilities too (CR
  // 605.1a, 602.2b); a card's abilities from any zone (cycling from a hand), its name as it is now.
  const tax = /^Activated abilities of sources with the chosen name cost \{(\d+)\} more to activate\.$/.exec(line);
  if (tax) {
    (out.activationTaxes ??= []).push({ filter: { kind: "card", chosen: "name", text: "sources with the chosen name" }, n: Number(tax[1]), manaToo: true, text: line });
    return true;
  }
  // The Ruinous Wrecking Crew: "When ~ enters, choose up to X — • ...": X is the X its spell was cast with (CR 107.3m), 0
  // if it wasn't cast; each mode at most once (CR 700.2d), so all of them when X is greater, the number fixed as the
  // trigger is put on the stack, when its modes are chosen (CR 603.3c), as with Bumi's "choose up to X, where X is ...".
  const crew = /^When ~ enters, choose up to X —\s*((?:•[^•]+)+)$/.exec(line);
  if (crew) {
    const t = parseTrigger(`When ~ enters, choose any number — ${crew[1]}`);
    if (!t || t === "fail" || t.event !== "selfEnters" || !t.body.modal || t.body.modal.min || t.body.modal.maxCount) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, modal: { ...t.body.modal, maxCount: { count: { kind: "x" } } }, text: line.replace(/^When ~ enters, /, "").replace(/^./, (c) => c.toUpperCase()) } });
    return true;
  }
  return false;
}

export function roundB187Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void sentences;
  void effects;
  // Graceful Takedown: "Any number of target enchanted creatures you control and up to one other target creature you
  // control each deal damage equal to their power to target creature you don't control."
  if (s === "Any number of target enchanted creatures you control and up to one other target creature you control each deal damage equal to their power to target creature you don't control") {
    // All the creatures you control deal their damage at once, each the source of its own (as Friendly Rivalry's, rulings):
    // a target that's illegal as it resolves deals none, the others still do; with the last target illegal, none at all.
    // CR 115.3: "other" keeps the one creature apart from the enchanted ones. The "up to one" slot is read first, so the
    // "any number" slot's targets all follow it and one reference covers both groups once the number is chosen (expandMany).
    const one = parseObject("up to one target creature you control", ctx);
    const many = one && parseObject("any number of other target enchanted creatures you control", ctx);
    const b = many && parseObject("target creature you don't control", ctx);
    if (one?.ref !== "target" || many?.ref !== "target" || many.index !== one.index + 1 || b?.ref !== "target" || b.n) return "fail";
    const spec = ctx.targets[many.index]!;
    if (spec.many !== "any" || spec.kind !== "object" || spec.status !== "enchanted" || !spec.distinctFrom?.includes(one.index)) return "fail";
    return { effect: { type: "bite", a: { ref: "target", index: one.index, n: 2 }, b }, next: si + 1 };
  }
  return roundB190Sentence(s, sentences, si, ctx, effects);
}
