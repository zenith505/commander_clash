// Round 430's whole lines (compile.ts, before round 429's).
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/** One whole line of round 430's (compile.ts); false when it isn't one of these. */
export function round430Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Nephalia Academy: "If a spell or ability an opponent controls causes you to discard a card, you may reveal that card and
  // put it on top of your library instead of putting it anywhere else." (CR 614.1a): a replacement for each card such a
  // discard moves, madness's exile and Obstinate Baloth's battlefield too, as its owner chooses (CR 616.1, rulings); a
  // discard they chose to make because of it counts ("unless that player discards a card", ward), and the card is still
  // discarded (rulings). run-library.ts academyName / discardToTop.
  if (line === "If a spell or ability an opponent controls causes you to discard a card, you may reveal that card and put it on top of your library instead of putting it anywhere else.") {
    if (isSpell) return fail(out, raw);
    out.discardToTopFromOpponents = true;
    return true;
  }
  // C.A.M.P.: "Whenever fortified land is tapped for mana, put a +1/+1 counter on target creature you control. If that creature
  // shares a color with the mana that land produced, create a Junk token.": the land this Fortification is attached to
  // (CR 301.6) tapped for mana by anyone (CR 106.12); not a mana ability, as it targets (CR 605.1b), so it uses the stack.
  // "The mana that land produced": what its mana ability made, as replacement effects changed it (CR 106.12b), not mana
  // other abilities added because it was tapped; one color of several is enough, and the creature's colors are read as
  // the ability resolves (rulings). A target that's gone by then means nothing happens (CR 608.2b, rulings).
  const camp = /^Whenever fortified land is tapped for mana, (put a \+1\/\+1 counter on target creature you control\.) If that creature shares a color with the mana that land produced, (create a Junk token\.)$/.exec(line);
  if (camp) {
    if (isSpell) return fail(out, raw);
    const first = parseBody(camp[1]!);
    const then = parseBody(camp[2]!);
    if (!first || !then || first.targets.length !== 1 || then.targets.length) return fail(out, raw);
    out.triggers.push({
      event: "tappedForMana",
      manaTap: { by: "any", attached: true },
      body: { ...first, effects: [...first.effects, { type: "if", cond: { kind: "targetSharesColorWithManaMade", index: 0 }, effects: then.effects }], text: line.slice("Whenever fortified land is tapped for mana, ".length) },
    });
    return true;
  }
  return false;
}
