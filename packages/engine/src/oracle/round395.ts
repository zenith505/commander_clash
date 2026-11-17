// Round 395's whole lines (compile.ts): cards each opponent exiles, cast later (Krang & Shredder), and a spell copied when an
// opponent's revealed card shares a card type with it (Gandalf, Westward Voyager). The effects run in effects/run-round395.ts.
// (Impact Resonance's count is in oracle/counts.ts.)
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** One whole line of round 395's (compile.ts); false when it isn't one of these. */
export function round395Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Krang & Shredder: "Whenever ~ enter or attack, each opponent exiles cards from the top of their library until they exile
  // a nonland card." One ability with two trigger events (CR 603.2), so one exile ability that its "cast a card exiled with
  // ~" is linked to (CR 607.2a): the two triggers share the one effect (compile.ts linkExile counts it once).
  const krang = /^Whenever ~ enters? or attacks?, each opponent exiles cards from the top of their library until they exile a nonland card\.$/.exec(line);
  if (krang) {
    const enters = isSpell ? null : parseTrigger("When ~ enters, draw a card.");
    const attacks = isSpell ? null : parseTrigger("Whenever ~ attacks, draw a card.");
    if (!enters || enters === "fail" || enters.event !== "selfEnters" || !attacks || attacks === "fail" || attacks.event !== "selfAttacks") return fail(out, raw);
    const exile: Effect = { type: "exileUntilNonlandLinked", who: { ref: "eachOpponent" } };
    const text = "each opponent exiles cards from the top of their library until they exile a nonland card.";
    out.triggers.push({ ...enters, body: { targets: [], effects: [exile], text } }, { ...attacks, body: { targets: [], effects: [exile], text } });
    return true;
  }
  // Gandalf, Westward Voyager: "Whenever you cast a spell with mana value 5 or greater, each opponent reveals the top card of
  // their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for
  // the copy, and each opponent draws a card. Otherwise, you draw a card." Only one copy however many share a type (rulings).
  if (line === "Whenever you cast a spell with mana value 5 or greater, each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card.") {
    const t = isSpell ? null : parseTrigger("Whenever you cast a spell with mana value 5 or greater, draw a card.");
    if (!t || t === "fail" || t.event !== "castSpell") return fail(out, raw);
    const effects: Effect[] = [
      { type: "revealTopsShareType" },
      {
        type: "if",
        cond: { kind: "youDid" },
        effects: [
          { type: "copySpell", spell: "cause", n: 1, newTargets: true },
          { type: "draw", who: { ref: "eachOpponent" }, n: 1 },
        ],
        otherwise: [{ type: "draw", who: { ref: "you" }, n: 1 }],
      },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  return false;
}
