// Round 410's whole lines (compile.ts): Zinnia, Valley's Voice ("Creature spells you cast gain offspring {2} as you cast
// them") and Ashling, the Limitless ("Elemental permanent spells you cast from your hand gain evoke {4} as you cast them",
// and its token copy of each nontoken Elemental you sacrifice, kept only if you pay {W}{U}{B}{R}{G}).
import type { CompiledCard, Effect } from "../abilities";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const GAIN = /^(Creature|Elemental permanent) spells you cast( from your hand)? gain (offspring|evoke) ((?:\{\d+\})+) as you cast them\.$/;
const ASHLING = "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.";

/** One whole line of round 410's (compile.ts); false when it isn't one of these. */
export function round410Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Zinnia, Valley's Voice: an instance of offspring for each creature spell its controller casts (CR 702.175a), beside any
  // the spell has, each paid once and triggering only for its own payment (CR 702.175b; game.ts offspringGranted).
  // Ashling, the Limitless: evoke {4} for each Elemental permanent spell its controller casts from their hand (CR 702.74a),
  // an alternative cost beside any evoke the spell has (AltCostKind "grantedEvoke"). Either way the permanent the spell
  // becomes keeps the trigger that goes with what was paid, even if the giver has left (CR 400.7b, 611.3d, rulings).
  // Checked by the spell's characteristics as it's cast (CR 601.2a, printedMatches).
  const gain = GAIN.exec(line);
  if (gain) {
    const filter = parseTargetPhrase(`${gain[1]} spell`);
    const offspring = gain[3] === "offspring";
    // Zinnia's has no "from your hand"; Ashling's has it. Anything else isn't one of these cards.
    if (isSpell || filter?.kind !== "spell" || offspring === !!gain[2]) return fail(out, raw);
    const f = { ...filter, text: `${gain[1]} spell` };
    if (offspring) (out.spellsGainOffspring ??= []).push({ filter: f, cost: gain[4]!, text: line });
    else (out.spellsGainEvoke ??= []).push({ filter: f, mana: gain[4]!, fromHand: true, text: line });
    return true;
  }
  // Ashling, the Limitless: "Whenever you sacrifice a nontoken Elemental" (CR 701.21a), a copy of it as it last existed on
  // the battlefield (CR 707.2, 608.2h; a copy of what it was copying, if anything, rulings), with haste until end of turn;
  // then a delayed trigger at the beginning of your next end step (CR 603.7, 513.1) about that token: you may pay
  // {W}{U}{B}{R}{G}, and if you don't, you sacrifice it (CR 118.12: "unless" is a choice made as that resolves).
  if (line === ASHLING) {
    const parsed = isSpell ? null : parseTrigger(line.replace(" unless you pay {W}{U}{B}{R}{G}.", "."));
    const t = parsed && parsed !== "fail" ? parsed : null;
    const eff = t?.body.effects;
    const later = eff?.[2];
    if (!t || t.event !== "youSacrifice" || eff?.length !== 3 || eff[0]!.type !== "createTokenCopy" || eff[1]!.type !== "continuous" || later?.type !== "delayed" || later.when !== "yourNextEndStep" || later.each !== "created" || later.effects.length !== 1 || later.effects[0]!.type !== "sacrifice") return fail(out, raw);
    const keep: Effect = { type: "may", effects: [], pay: { mana: "{W}{U}{B}{R}{G}" }, otherwise: [later.effects[0]!], keep: true, text: "Pay {W}{U}{B}{R}{G} to keep ~" };
    out.triggers.push({ ...t, body: { ...t.body, effects: [eff[0]!, eff[1]!, { ...later, effects: [keep], text: "sacrifice ~ unless you pay {W}{U}{B}{R}{G}" }], text: line.replace(/^Whenever you sacrifice a nontoken Elemental, /, "") } });
    return true;
  }
  return false;
}
