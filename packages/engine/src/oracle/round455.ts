// Round 455's whole lines (compile.ts, after round 451's): Ghostly Flame's "Black and/or red permanents and spells are
// colorless sources of damage." and North Star's "{4}, {T}: For one spell this turn, you may spend mana as though it were
// mana of any type to pay that spell's mana cost."
import type { CompiledCard } from "../abilities";
import type { Color } from "../types";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const COLOR_OF: Record<string, Color> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

const NORTH_STAR = "{4}, {T}: For one spell this turn, you may spend mana as though it were mana of any type to pay that spell's mana cost.";

/** One whole line of round 455's (compile.ts); false when it isn't one of these. */
export function round455Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ghostly Flame: damage from a permanent or spell of either color is seen as colorless wherever it's looked at (rulings:
  // prevention and protection see a colorless source, CR 609.7b, 702.16e); the objects keep their colors (they can't be
  // targeted by a red spell against protection from red, and what triggers on a red source dealing damage still does).
  const flame = /^(White|Blue|Black|Red|Green) and\/or (white|blue|black|red|green) permanents and spells are colorless sources of damage\.$/.exec(line);
  if (flame) {
    if (isSpell) return fail(out, raw);
    out.colorlessDamageSources = [...new Set([COLOR_OF[flame[1]!.toLowerCase()]!, COLOR_OF[flame[2]!]!])];
    return true;
  }
  // North Star: not a mana ability, it adds no mana (CR 605.1a). An activated ability that gives its controller one use of
  // "mana of any type" for a spell they cast this turn (CR 609.4b), the spell chosen as it's cast.
  if (line === NORTH_STAR) {
    if (isSpell) return fail(out, raw);
    out.activated.push({
      manaCost: "{4}",
      tap: true,
      sacrificeSelf: false,
      sorcerySpeed: false,
      body: { targets: [], effects: [{ type: "anyTypeOneSpell" }], text: NORTH_STAR.replace(/^\{4\}, \{T\}: /, "") },
      text: NORTH_STAR,
    });
    return true;
  }
  return false;
}
