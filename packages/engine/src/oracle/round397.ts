// Round 397's whole lines (compile.ts): Jeskai Infiltrator (itself and the top card of your library exiled in a face-down
// pile, then manifested), The Spot, Living Portal (two exiles as it enters, linked to its dies ability, CR 607.2a),
// Tetsuo, Imperial Champion (the greatest mana value among Equipment attached to it) and Absorbing Man (a copy with
// exceptions until your next turn).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** One whole line of round 397's (compile.ts); false when it isn't one of these. */
export function round397Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Jeskai Infiltrator: "When ~ deals combat damage to a player, exile it and the top card of your library in a face-down
  // pile, shuffle that pile, then manifest those cards." Effect faceDownPile (effects/run-round391.ts): with ~ no longer on
  // the battlefield (or a new object, CR 400.7) only the top card is manifested (rulings); both under your control.
  if (line === "When ~ deals combat damage to a player, exile it and the top card of your library in a face-down pile, shuffle that pile, then manifest those cards.") {
    const t = isSpell ? null : parseTrigger("When ~ deals combat damage to a player, draw a card.");
    if (!t || t === "fail" || t.event !== "selfDealsCombatDamageToPlayer") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "faceDownPile", what: { ref: "self" }, top: 1, into: "manifest" }], text: line.replace(/^When [^,]+, /, "") } });
    return true;
  }
  // The Spot, Living Portal: "When ~ enters, exile up to one target nonland permanent and up to one target nonland permanent
  // card from a graveyard." Two targets of one ability, each exiled, both linked to its dies ability (compile.ts linkExile,
  // CR 607.2a). A target that's illegal as it resolves isn't exiled; the other still is (CR 608.2b).
  if (line === "When ~ enters, exile up to one target nonland permanent and up to one target nonland permanent card from a graveyard.") {
    const a = isSpell ? null : parseTrigger("When ~ enters, exile up to one target nonland permanent.");
    const b = isSpell ? null : parseTrigger("When ~ enters, exile up to one target nonland permanent card from a graveyard.");
    if (!a || a === "fail" || !b || b === "fail" || a.event !== "selfEnters" || b.event !== "selfEnters" || a.body.targets.length !== 1 || b.body.targets.length !== 1) return fail(out, raw);
    const [ea] = a.body.effects;
    const [eb] = b.body.effects;
    if (a.body.effects.length !== 1 || b.body.effects.length !== 1 || ea?.type !== "exile" || eb?.type !== "exile" || ea.what.ref !== "target" || eb.what.ref !== "target" || ea.until || eb.until) return fail(out, raw);
    const permanent: TargetSpec = { ...a.body.targets[0]!, text: "up to one target nonland permanent" };
    const card: TargetSpec = { ...b.body.targets[0]!, text: "up to one target nonland permanent card from a graveyard" };
    const effects: Effect[] = [
      { ...ea, what: { ref: "target", index: 0 } },
      { ...eb, what: { ref: "target", index: 1 } },
    ];
    out.triggers.push({ ...a, body: { targets: [permanent, card], effects, text: line.replace(/^When [^,]+, /, "") } });
    return true;
  }
  // The Spot's "When ~ dies, put him on the bottom of his owner's library. If you do, return the exiled cards to their
  // owners' hands.": the card that died, still in the graveyard as that object (CR 400.7); a token can't be moved from
  // there (it ceased to exist, CR 704.5d, rulings), nor a commander its owner put into the command zone (CR 903.9a), so
  // nothing comes back then. "The exiled cards" are the ones its enters ability exiled (CR 607.2a, compile.ts linkExile).
  if (/^When ~ dies, put (?:~|him|her|it) on the bottom of (?:~'s|his|her|its) owner's library\. If you do, return the exiled cards to their owners' hands\.$/.test(line)) {
    const t = isSpell ? null : parseTrigger("When ~ dies, draw a card.");
    if (!t || t === "fail" || t.event !== "selfDies") return fail(out, raw);
    const effects: Effect[] = [
      { type: "putInLibrary", what: { ref: "selfCard" }, position: "bottom", setsDid: true },
      { type: "if", cond: { kind: "youDid" }, effects: [{ type: "returnLinked", dest: "hand" }] },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: "put ~ on the bottom of its owner's library. If you do, return the exiled cards to their owners' hands." } });
    return true;
  }
  // Tetsuo, Imperial Champion: "Whenever ~ attacks, if it's equipped, choose one — • ~ deals damage equal to the greatest
  // mana value among Equipment attached to it to any target. • You may cast an instant or sorcery spell from your hand with
  // mana value less than or equal to the greatest mana value among Equipment attached to ~ without paying its mana cost."
  // An intervening if, checked again as it resolves (CR 603.4, rulings); the greatest mana value as it resolves, 0 with
  // none (CR 202.3). The cast ignores timing, X is 0 (CR 608.2g, 107.3b).
  if (line === "Whenever ~ attacks, if it's equipped, choose one — • ~ deals damage equal to the greatest mana value among Equipment attached to it to any target. • You may cast an instant or sorcery spell from your hand with mana value less than or equal to the greatest mana value among Equipment attached to ~ without paying its mana cost.") {
    const t = isSpell ? null : parseTrigger("Whenever ~ attacks, if it's equipped, choose one — • ~ deals 1 damage to any target. • You may cast an instant or sorcery spell with mana value 1 or less from your hand without paying its mana cost.");
    const modes = t && t !== "fail" ? t.body.modal?.modes : undefined;
    const dmg = modes?.[0]?.effects[0];
    const cast = modes?.[1]?.effects[0];
    if (!t || t === "fail" || t.event !== "selfAttacks" || t.ifCond?.kind !== "self" || t.ifCond.is !== "equipped" || modes?.length !== 2 || t.body.modal!.min !== 1 || t.body.modal!.max !== 1 || modes[0]!.effects.length !== 1 || modes[1]!.effects.length !== 1 || dmg?.type !== "damage" || dmg.amount !== 1 || cast?.type !== "castFromHand" || cast.filter.manaValue?.max !== 1) return fail(out, raw);
    const greatest = { count: { kind: "attachedToSelf" as const, subtypes: ["Equipment"], greatestMv: true as const } };
    const { manaValue: _mv, ...filter } = cast.filter;
    const castMode = { ...modes[1]!, effects: [{ ...cast, filter: { ...filter, bound: { key: "manaValue" as const, at: "most" as const, amount: greatest }, text: "instant or sorcery spell with mana value less than or equal to the greatest mana value among Equipment attached to ~" } }], text: "You may cast an instant or sorcery spell from your hand with mana value less than or equal to the greatest mana value among Equipment attached to ~ without paying its mana cost." };
    const dmgMode = { ...modes[0]!, effects: [{ ...dmg, amount: greatest }], text: "~ deals damage equal to the greatest mana value among Equipment attached to it to any target." };
    out.triggers.push({ ...t, body: { ...t.body, modal: { ...t.body.modal!, modes: [dmgMode, castMode] }, text: line.replace(/^Whenever [^,]+, if it's equipped, /, "") } });
    return true;
  }
  // Absorbing Man: "At the beginning of your first main phase, until your next turn, ~ becomes a copy of up to one target
  // artifact, non-Aura enchantment, or land, except his name is ~, he's a legendary 4/4 Human Villain creature in addition
  // to his other types, and he has vigilance." The exceptions are copiable values of the copy (CR 707.9b); with no target
  // chosen (or the target gone, CR 608.2b) nothing happens. Over as your next turn begins (CR 611.2a).
  if (line === "At the beginning of your first main phase, until your next turn, ~ becomes a copy of up to one target artifact, non-Aura enchantment, or land, except his name is ~, he's a legendary 4/4 Human Villain creature in addition to his other types, and he has vigilance.") {
    const t = isSpell ? null : parseTrigger("At the beginning of your first main phase, ~ becomes a copy of up to one target artifact, non-Aura enchantment, or land until your next turn.");
    const copy = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourFirstMain" || t.body.targets.length !== 1 || !t.body.targets[0]!.optional || t.body.effects.length !== 1 || copy?.type !== "becomeCopy" || copy.what.ref !== "self" || copy.duration !== "yourNextTurn" || copy.except) return fail(out, raw);
    const except = { name: "~", legendary: true, pt: [4, 4] as [number, number], addTypes: ["Creature"], addSubtypes: ["Human", "Villain"], keywords: ["Vigilance"] };
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...copy, except }], text: line.replace(/^At the beginning of your first main phase, /, "") } });
    return true;
  }
  return false;
}
