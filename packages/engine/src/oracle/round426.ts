// Round 426's whole lines (compile.ts, before round 425's): Jasmine Boreal of the Seven's evasion for creatures with no
// abilities, Niko, Light of Hope's exile that its Shards copy until the next end step, and Celestial Reunion's optional
// creature-type behold cost and its search.
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseStatic } from "./statics";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const JASMINE_EVASION = "Creatures you control with no abilities can't be blocked by creatures with abilities.";
const REUNION_COST = "As an additional cost to cast ~, you may choose a creature type and behold two creatures of that type.";
const REUNION_SEARCH = "Search your library for a creature card with mana value X or less, reveal it, put it into your hand, then shuffle. If ~'s additional cost was paid and the revealed card is the chosen type, put that card onto the battlefield instead of putting it into your hand.";
const NIKO_COPIES = "{2}, {T}: Exile target nonlegendary creature you control. Shards you control become copies of it until the next end step. Return it to the battlefield under its owner's control at the beginning of the next end step.";

/** One whole line of round 426's (compile.ts); false when it isn't one of these. */
export function round426Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Jasmine Boreal of the Seven: a blocking restriction (CR 509.1b) on each creature you control with no abilities (no rules
  // text, keywords or abilities an effect gave it; an effect that only says something is true of it gives none, rulings,
  // effects/targeting.ts hasNoAbilities), against blockers that have one or more (TargetSpec.hasAbilities). Checked as
  // blockers are declared only: a blocker that gains an ability later doesn't undo the block (rulings, CR 509.1).
  if (line === JASMINE_EVASION) {
    const st = isSpell ? null : parseStatic("Creatures you control with no abilities can't be blocked by creatures with flying.");
    const mod = st?.mods?.length === 1 ? st.mods[0] : undefined;
    if (!st || st.affects?.kind !== "filter" || !st.affects.spec?.noAbilities || mod?.kind !== "cantBeBlockedBy" || mod.filter.keywords?.length !== 1) return fail(out, raw);
    const { keywords: _k, ...rest } = mod.filter;
    out.statics.push({ ...st, mods: [{ kind: "cantBeBlockedBy", filter: { ...rest, hasAbilities: true, text: "creatures with abilities" } }], text: line });
    return true;
  }
  // Niko, Light of Hope: the creature is exiled, then each Shard you control (an enchantment subtype, CR 205.3h) becomes a
  // copy of it as it last existed on the battlefield (rulings, CR 707.2, 608.2h: its copiable values, those of what it was
  // copying too, and X is 0; not its counters, Auras, tapped status or other effects), until the next end step begins
  // (CR 611.2a; begun during an end step, the next turn's, as for the delayed trigger, CR 513.2). The card returns at the
  // beginning of the next end step (CR 603.7), a new object (CR 400.7). An illegal target: none of it happens (rulings).
  if (line === NIKO_COPIES) {
    const a = isSpell ? null : parseActivated("{2}, {T}: Exile target nonlegendary creature you control. Return it to the battlefield under its owner's control at the beginning of the next end step.");
    const shards = isSpell ? null : parseActivated("{2}, {T}: Artifacts you control become copies of target creature until end of turn.");
    if (!a || a === "fail" || !shards || shards === "fail" || a.body.targets.length !== 1 || a.body.effects.length !== 1 || shards.body.effects.length !== 1) return fail(out, raw);
    const flicker = a.body.effects[0]!;
    const copy = shards.body.effects[0]!;
    if (flicker.type !== "flicker" || flicker.at !== "nextEndStep" || flicker.under !== "owner" || flicker.what.ref !== "target" || copy.type !== "becomeCopy" || copy.what.ref !== "each" || copy.what.filter.types?.join() !== "Artifact" || copy.what.filter.controller !== "you" || copy.what.other) return fail(out, raw);
    const what = { ...copy.what, filter: { kind: "object" as const, subtypes: ["Shard"], controller: "you" as const, text: "Shards you control" } };
    const effects: Effect[] = [flicker, { ...copy, what, of: { ref: "target", index: 0 }, duration: "nextEndStep" }];
    out.activated.push({ ...a, body: { ...a.body, effects, text: line.slice(line.indexOf(": ") + 2) }, text: line });
    return true;
  }
  // Celestial Reunion: an optional additional cost (CR 601.2b), chosen and paid like a kicker cost with no mana
  // (CompiledCard.kicker `optional`): a creature type chosen as part of it (CompiledCard.kickChooseType, CostChoices
  // creatureType; CR 205.3m), then two creatures of that type beheld (CR 701.4a): two creature cards of that type revealed
  // from your hand, two creatures of that type you control, or one of each (rulings), never the same one twice. Only
  // creatures: not kindred cards or permanents (rulings). The filters are bound to the type chosen (game.ts castExtraCosts).
  if (line === REUNION_COST) {
    if (!isSpell || out.kicker || out.castChooseType) return fail(out, raw);
    const card = { kind: "card" as const, types: ["Creature"], chosen: "type" as const, text: "creature card of the chosen type" };
    const mine = { kind: "object" as const, types: ["Creature"], chosen: "type" as const, controller: "you" as const, text: "creature of the chosen type you control" };
    out.kicker = { costs: [""], extraCosts: [{ kind: "reveal", filter: card, n: 2, orControl: mine }], text: "choose a creature type and behold two creatures of that type", optional: true };
    out.kickChooseType = true;
    return true;
  }
  // Celestial Reunion's search (X as announced, CR 107.3; a card in a library with {X} in its mana cost has X 0, rulings),
  // then "instead" (a replacement, CR 614.1a): the one card found goes onto the battlefield, not into the hand, when the
  // additional cost was paid and it has the type chosen for it (CR 205.3m; a changeling card has every creature type, CR
  // 702.73a; "a [subtype] card" is only one with that subtype, rulings). Not "you may": always so then.
  if (line === REUNION_SEARCH) {
    const b = isSpell && out.kickChooseType ? parseBody("Search your library for a creature card with mana value X or less, reveal it, put it into your hand, then shuffle.", { spell: true }) : null;
    const e = b?.effects.length === 1 && !b.targets.length ? b.effects[0] : undefined;
    if (!b || e?.type !== "search" || e.dest.zone !== "hand" || e.mayInstead || !e.reveal || out.spell) return fail(out, raw);
    out.spell = { ...b, effects: [{ ...e, mayInstead: { dest: { zone: "battlefield" }, ifKicked: true, card: { kind: "card", types: ["Creature"], chosen: "type", text: "creature card of the chosen type" }, must: true } }], text: line };
    return true;
  }
  return false;
}
