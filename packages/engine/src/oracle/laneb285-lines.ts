// Lane B round B285's lines, read by compileCard before the generic triggers and statics (after round B284's): Ice
// Cauldron's two abilities.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const CAULDRON_CHARGE =
  "{X}, {T}: You may exile a nonland card from your hand. You may cast that card for as long as it remains exiled. Put a charge counter on ~ and note the type and amount of mana spent to pay this activation cost. Activate only if there are no charge counters on ~.";
const CAULDRON_MANA = "{T}, Remove a charge counter from ~: Add ~'s last noted type and amount of mana. Spend this mana only to cast the last card exiled with ~.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB285Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  const text = line.replace(/\bthis artifact\b/g, "~");
  // Ice Cauldron: "{X}, {T}": X may be 0 (rulings); only with no charge counters on it. As it resolves, a nonland card of
  // your choice from your hand, or none (CR 609.3), exiled; you may cast it for as long as it remains exiled, with its usual
  // timing, even once ~ has left (rulings; MayPlay "exiled"). A charge counter goes on ~ and each mana spent on the cost is
  // noted (Effect noteCauldron), whatever reduced the cost (rulings).
  if (text === CAULDRON_CHARGE) {
    const a = isSpell ? null : parseActivated("{X}, {T}: You may exile a nonland card from your hand. Put a charge counter on ~. Activate only if there are no charge counters on ~.");
    const may = a && a !== "fail" ? a.body.effects[0] : undefined;
    const take = may?.type === "may" ? may.effects[0] : undefined;
    const counter = a && a !== "fail" ? a.body.effects[1] : undefined;
    if (!a || a === "fail" || !a.tap || a.manaCost !== "{X}" || a.costs?.length || !a.activateIf || a.body.targets.length || a.body.effects.length !== 2 || take?.type !== "takeFromHand" || take.action !== "exile" || !take.filter || counter?.type !== "counters") return fail();
    out.activated.push({
      ...a,
      text: line,
      body: { targets: [], effects: [{ ...take, optional: true, youMay: {} }, counter, { type: "noteCauldron" }], text: text.slice("{X}, {T}: ".length).replace(/ Activate only .*$/, "") },
    });
    return true;
  }
  // "{T}, Remove a charge counter from ~: Add ~'s last noted type and amount of mana.": a mana ability (CR 605.1a), each
  // mana noted (rulings: none if nothing was noted or X was 0). "Spend this mana only to cast the last card exiled with ~"
  // (CR 106.6): bound to that card as the mana is made (spend.ts boundSpend), so a card exiled later doesn't change it.
  if (text === CAULDRON_MANA) {
    if (isSpell) return fail();
    out.mana.push({
      text: line,
      manaCost: "",
      tap: true,
      sacrificeSelf: false,
      produces: { kind: "noted", all: true },
      removeCounters: { counter: "charge", n: 1 },
      spendOnly: { lastExiled: true, text: "Spend this mana only to cast the last card exiled with ~." },
    });
    return true;
  }
  return false;
}
