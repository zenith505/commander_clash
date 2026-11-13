// Lane B round B198's lines, read by compileCard before its triggers and activated abilities (after round B197's).
import type { CompiledCard, CostMod, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseStatic } from "./statics";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB198Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Boneyard Mycodrax: "~'s power and toughness are each equal to the number of other creature cards in your graveyard.": a
  // characteristic-defining ability that works in every zone (CR 604.3, rulings); "other" leaves out the card itself while
  // it's in your graveyard, where its scavenge reads that power as the cost exiles it (rulings).
  if (line === "~'s power and toughness are each equal to the number of other creature cards in your graveyard.") {
    const st = parseStatic("~'s power and toughness are each equal to the number of creature cards in your graveyard.");
    const m = st?.mods.length === 1 ? st.mods[0] : undefined;
    const n = m?.kind === "definePT" && typeof m.power === "object" && "count" in m.power ? m.power : undefined;
    if (!st || st.condition || m?.kind !== "definePT" || n?.count.kind !== "cardsInGraveyard" || !n.count.filter) {
      out.unsupported.push(raw);
      return true;
    }
    const other = { count: { ...n.count, filter: { ...n.count.filter, notSource: true, text: `other ${n.count.filter.text}` } } };
    out.statics.push({ ...st, mods: [{ ...m, power: other, toughness: other }], text: line });
    return true;
  }
  // Templar Knight: "{W}, Tap five untapped attacking creatures you control named ~: Search your library for a legendary
  // artifact card, put it onto the battlefield, then shuffle.": any five of them, ~ itself one of them (no {T} in the cost),
  // each with ~'s name as the cost is paid (CR 201.2, 602.2b); only attacking ones, so only in combat.
  if (line === "{W}, Tap five untapped attacking creatures you control named ~: Search your library for a legendary artifact card, put it onto the battlefield, then shuffle.") {
    const a = parseActivated(line.replace(" you control named ~:", " you control:"));
    const costs = a && a !== "fail" ? (a.costs ?? []) : [];
    const tap = costs.length === 1 && costs[0]!.kind === "tap" ? costs[0] : undefined;
    if (!a || a === "fail" || tap?.kind !== "tap" || tap.n !== 5 || tap.other || tap.filter.combat !== "attacking" || tap.filter.named) out.unsupported.push(raw);
    else out.activated.push({ ...a, text: line, costs: [{ ...tap, filter: { ...tap.filter, named: "~", text: "untapped attacking creatures you control named ~" } }] });
    return true;
  }
  // Sea Gate Stormcaller: "When ~ enters, copy the next instant or sorcery spell with mana value 2 or less you cast this turn
  // when you cast it. If ~ was kicked, copy that spell twice instead. You may choose new targets for the copies.": a delayed
  // trigger made as the enters trigger resolves (CR 603.7), whether or not ~ is still there (rulings); its mana value with
  // the X chosen (CR 202.3e); the copies aren't cast and resolve before the spell (rulings, CR 707.10).
  if (line === "When ~ enters, copy the next instant or sorcery spell with mana value 2 or less you cast this turn when you cast it. If ~ was kicked, copy that spell twice instead. You may choose new targets for the copies.") {
    const t = parseTrigger("When ~ enters, when you next cast an instant or sorcery spell with mana value 2 or less this turn, copy that spell. You may choose new targets for the copy.");
    const next = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const copy = next?.type === "nextCast" && next.effects.length === 1 ? next.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || next?.type !== "nextCast" || copy?.type !== "copySpell" || copy.spell !== "cause" || copy.n !== 1 || !copy.newTargets || next.filter.manaValue?.max !== 2) {
      out.unsupported.push(raw);
      return true;
    }
    const twice: Effect = { ...next, effects: [{ ...copy, n: 2 }], text: "copy that spell twice" };
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ type: "if", cond: { kind: "kicked" }, effects: [twice], otherwise: [next] }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Dream Chisel, Obscuring Aether: "Face-down creature spells you cast cost {1} less to cast.", Kadena, Slinking Sorcerer:
  // "The first face-down creature spell you cast each turn costs {3} less to cast.": a face-down spell is a 2/2 creature
  // spell with no other characteristics (CR 708.4, 708.2a), and the reduction comes off its {3} (CR 702.37c, 601.2f);
  // face-down spells cast earlier this turn count for "the first" (CostMod.faceDown).
  const faceDown = /^(Face-down creature spells you cast cost|The first face-down creature spell you cast each turn costs) \{(\d)\} less to cast\.$/.exec(line);
  if (faceDown) {
    const mod: CostMod = { who: "you", filter: { kind: "spell", types: ["Creature"], notTypes: [], notColors: [], text: "face-down creature spells" }, n: -Number(faceDown[2]), faceDown: true, ...(faceDown[1]!.startsWith("The first") ? { nth: 1 } : {}), text: line };
    (out.costMods ??= []).push(mod);
    return true;
  }
  // Goblin Maskmaker: "Whenever ~ attacks, face-down spells you cast this turn cost {1} less to cast.": from then on this
  // turn (CR 611.2a), each face-down spell (CR 708.4).
  if (line === "Whenever ~ attacks, face-down spells you cast this turn cost {1} less to cast.") {
    const t = parseTrigger("Whenever ~ attacks, creature spells you cast this turn cost {1} less to cast.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfAttacks" || e?.type !== "costModThisTurn" || e.next || e.times || e.untilYourNextTurn) out.unsupported.push(raw);
    else {
      const text = "face-down spells you cast this turn cost {1} less to cast.";
      out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e, mod: { ...e.mod, filter: { ...e.mod.filter, types: [], text: "face-down spells" }, faceDown: true, text } }], text } });
    }
    return true;
  }
  // Gorm the Great: "~ must be blocked if able, and ~ must be blocked by two or more creatures if able.": two blocking
  // requirements (CR 509.1c); with only one creature able to block it, that one does (rulings); none needs to pay a cost
  // to block it (rulings, CR 509.1c).
  if (line === "~ must be blocked if able, and ~ must be blocked by two or more creatures if able.") {
    const st = parseStatic("~ must be blocked if able.");
    const m = st?.mods.length === 1 ? st.mods[0] : undefined;
    if (!st || st.condition || st.affects.kind !== "self" || m?.kind !== "mustBeBlocked" || m.by || m.combat !== undefined) out.unsupported.push(raw);
    else out.statics.push({ ...st, mods: [{ ...m, twoOrMore: true }], text: line });
    return true;
  }
  return false;
}
