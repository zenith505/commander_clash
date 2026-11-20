// Round 423's whole lines (compile.ts, before round 422's): Verrak, Warped Sengir's copy trigger and Dermotaxi's imprint
// and the copy linked to it.
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const DERMOTAXI_IMPRINT = "As ~ enters, exile a creature card from a graveyard.";
const DERMOTAXI_COPY = "Tap two untapped creatures you control: Until end of turn, ~ becomes a copy of the exiled card, except it's a Vehicle artifact in addition to its other types.";

const VERRAK = "Whenever you activate an ability that isn't a mana ability, if life was paid to activate it, you may pay that much life again. If you do, copy that ability. You may choose new targets for the copy.";

/** One whole line of round 423's (compile.ts); false when it isn't one of these. */
export function round423Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Verrak, Warped Sengir: an ability you activate, of any source, not a mana ability (CR 605.1a), whose costs paid life
  // (CR 602.2b; Phyrexian mana paid with life counts, CR 107.4f; paying 0 life pays none, CR 119.4): an intervening if (CR
  // 603.4), and once paid it stays true. As it resolves you may pay that much life again (a payment, CR 119.4, 119.8: not
  // with less life than that), and only if you do, the ability is copied (CR 707.10): its cost choices and modes kept,
  // new targets may be chosen (CR 707.10c, rulings). The copy isn't activated, so it doesn't trigger this again (rulings).
  if (line === VERRAK) {
    const t = isSpell ? null : parseTrigger("Whenever you activate an ability that isn't a mana ability, you may pay 1 life. If you do, copy that ability. You may choose new targets for the copy.");
    if (!t || t === "fail" || t.event !== "abilityActivated" || t.activates?.by !== "you" || t.activates.mana || t.activates.of || t.ifCond) return fail(out, raw);
    const may = t.body.effects[0];
    if (t.body.effects.length !== 1 || may?.type !== "may" || may.pay?.life !== 1 || may.effects.length !== 1 || may.effects[0]!.type !== "copySpell") return fail(out, raw);
    const effects: Effect[] = [{ ...may, pay: {}, payLife: { count: { kind: "eventAmount" } }, text: "pay that much life again. If you do, copy that ability" }];
    out.triggers.push({ ...t, activates: { ...t.activates, costLifePaid: true }, body: { ...t.body, effects, text: line.slice(line.indexOf("you may")) } });
    return true;
  }
  // Dermotaxi's imprint (an ability word, CR 207.2c): a replacement effect as it enters (CR 614.1c, 614.12a; rulings: no
  // one can respond), one creature card from any player's graveyard, mandatory if there's one (CR 609.3: none, nothing).
  if (line === DERMOTAXI_IMPRINT) {
    if (isSpell || out.entersExileFromYard) return fail(out, raw);
    out.entersExileFromYard = { filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, n: "one", anyGraveyard: true };
    return true;
  }
  // Dermotaxi: tapping two untapped creatures you control is a cost (CR 602.2b), not crewing (rulings: no crew triggers).
  // "The exiled card" is the one its imprint exiled (linked, CR 607.2a), even if it's a copy of something that exiles
  // others then (rulings), while it's still that card in exile (CR 400.7). It becomes a copy of that card as printed (CR
  // 707.2), the front face of a double-faced card (CR 712.8a), plus Vehicle and artifact (CR 707.9b), until end of turn
  // (CR 611.2a). With no such card, nothing (rulings).
  if (line === DERMOTAXI_COPY) {
    const imprint = out.entersExileFromYard;
    const ab = isSpell || !imprint?.anyGraveyard || imprint.n !== "one" ? null : parseActivated("Tap two untapped creatures you control: Until end of turn, ~ becomes a copy of target creature, except it's a Vehicle artifact in addition to its other types.");
    const e = ab && ab !== "fail" && ab.body.targets.length === 1 && ab.body.effects.length === 1 ? ab.body.effects[0] : undefined;
    if (!ab || ab === "fail" || e?.type !== "becomeCopy" || e.what.ref !== "self" || e.duration !== "endOfTurn") return fail(out, raw);
    out.activated.push({ ...ab, text: line, body: { targets: [], effects: [{ ...e, of: { ref: "linkedCard" } }], text: line.slice(line.indexOf(": ") + 2) } });
    return true;
  }
  return false;
}
