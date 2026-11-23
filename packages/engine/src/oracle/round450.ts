// Round 450's whole lines (compile.ts, before round 449's): Finale of Promise, an instant card and a sorcery card cast from
// your graveyard as it resolves, each copied twice when X is 10 or more.
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseBody } from "./body";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const FINALE =
  "You may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value X or less without paying their mana costs. If a spell cast this way would be put into your graveyard, exile it instead. If X is 10 or more, copy each of those spells twice. You may choose new targets for the copies.";

/** One whole line of round 450's (compile.ts); false when it isn't one of these. */
export function round450Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Finale of Promise: two targets, "up to one" each (CR 115.6), cards in your graveyard with mana value no more than the
  // spell's X (CR 107.3a, 202.3; X chosen before targets, CR 601.2b-c), checked again as it resolves (CR 608.2b). As it
  // resolves you cast them in either order (rulings: castTargetFree `chooseOrder`), each or neither, without paying their
  // mana costs (X as 0, no alternative costs, mandatory additional costs paid, CR 118.9, 107.3b, rulings), timing ignored
  // (CR 608.2g); a split card that's both may be both targets but is cast once at most (rulings). A spell cast this way
  // is exiled instead of going to your graveyard (CR 614.1a). Then, if X is 10 or more, each spell cast this way is copied
  // twice (CR 707.10: copies aren't cast, rulings), the copies put on the stack in any order (rulings), new targets
  // allowed (CR 707.10c), modes and additional costs paid copied (CR 707.10, rulings).
  if (line === FINALE) {
    if (!isSpell || out.spell) return fail(out, raw);
    const one = (type: "instant" | "sorcery"): TargetSpec | null => {
      const b = parseBody(`You may cast target ${type} card with mana value X or less from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.`, { spell: true });
      const t = b?.targets[0];
      const e = b?.effects[0];
      if (!b || b.targets.length !== 1 || b.effects.length !== 1 || t?.kind !== "card" || t.owner !== "you" || t.types?.length !== 1 || t.xRange?.key !== "manaValue" || t.xRange.at !== "most" || e?.type !== "castTargetFree" || e.exileAfter !== true) return null;
      return { ...t, optional: true, text: `up to one target ${type} card with mana value X or less from your graveyard` };
    };
    const instant = one("instant");
    const sorcery = one("sorcery");
    if (!instant || !sorcery) return fail(out, raw);
    out.spell = {
      targets: [instant, sorcery],
      effects: [
        { type: "castTargetFree", what: { ref: "target", index: 0, n: 2 }, exileAfter: true, chooseOrder: true, notesCast: true },
        { type: "if", cond: { kind: "xAtLeast", n: 10 }, effects: [{ type: "copySpell", spell: "castThisWay", n: 2, newTargets: true }] },
      ],
      text: line,
    };
    return true;
  }
  return false;
}
