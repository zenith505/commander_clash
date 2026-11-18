// Round 413's whole lines (compile.ts): Perplexing Chimera and Sudden Substitution (exchanging control of a spell and a
// permanent, then new targets for the spell).
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const CHIMERA = "Whenever an opponent casts a spell, you may exchange control of ~ and that spell. If you do, you may choose new targets for the spell.";
const SUBSTITUTION = "Exchange control of target noncreature spell and target creature. Then the spell's controller may choose new targets for it.";

/** One whole line of round 413's (compile.ts); false when it isn't one of these. */
export function round413Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Perplexing Chimera: any spell an opponent casts, with targets or not (rulings). Whether to exchange is decided as the
  // trigger resolves (rulings); the Chimera and the spell, each still where it was, swap controllers (CR 701.12a, Effect
  // exchangeSpellControl `cause`), and only if they did (rulings: not once the Chimera or the spell has left), this
  // ability's controller may choose new targets for the spell (CR 115.7d), legal ones for its new controller (rulings),
  // even if that isn't who controls the spell now (rulings).
  if (line === CHIMERA) {
    const t = isSpell ? null : parseTrigger("Whenever an opponent casts a spell, you may draw a card.");
    if (!t || t === "fail" || t.event !== "castSpell" || t.body.targets.length || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "may") return fail(out, raw);
    out.triggers.push({
      ...t,
      body: {
        targets: [],
        effects: [
          { type: "may", text: "exchange control of ~ and that spell", effects: [{ type: "exchangeSpellControl", spell: -1, cause: true, perm: { ref: "self" } }] },
          { type: "if", cond: { kind: "youDid" }, effects: [{ type: "newTargets", index: -1, cause: true }] },
        ],
        text: line.slice("Whenever an opponent casts a spell, ".length),
      },
    });
    return true;
  }
  // Sudden Substitution: a noncreature spell and a creature, each still a legal target as it resolves, swap controllers
  // (CR 701.12a; with either illegal or both under one player's control, no exchange, rulings, CR 701.12b). Then whoever
  // controls the spell (after the exchange, or as it was without one, rulings) may choose new targets for it (CR 115.7d),
  // if it's still a legal target. The exchange lasts indefinitely (rulings).
  if (line === SUBSTITUTION) {
    const body = isSpell && !out.spell ? parseBody("Gain control of target noncreature spell. Tap target creature.", { spell: true }) : null;
    const [spell, creature] = body?.targets ?? [];
    if (!body || body.targets.length !== 2 || spell?.kind !== "spell" || creature?.kind !== "object" || creature.controller || body.effects[0]?.type !== "controlSpell") return fail(out, raw);
    out.spell = {
      targets: [spell, creature],
      effects: [
        { type: "exchangeSpellControl", spell: 0, perm: { ref: "target", index: 1 } },
        { type: "newTargets", index: 0, bySpellController: true },
      ],
      text: line,
    };
    return true;
  }
  return false;
}
