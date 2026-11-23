// Round 458's whole lines (compile.ts): Illusionary Mask (a creature card cast face down with the mana spent on {X}, turned
// face up instead as it would deal or be dealt damage or become tapped).
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const MASK =
  "{X}: You may choose a creature card in your hand whose mana cost could be paid by some amount of, or all of, the mana you spent on {X}. If you do, you may cast that card face down as a 2/2 creature spell without paying its mana cost. If the creature that spell becomes as it resolves has not been turned face up and would assign or deal damage, be dealt damage, or become tapped, instead it's turned face up and assigns or deals damage, is dealt damage, or becomes tapped. Activate only as a sorcery.";

/** One whole line of round 458's (compile.ts); false when it isn't one of these. */
export function round458Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Illusionary Mask: an activated ability, its cost {X}, activated only as a sorcery (CR 602.5d). As it resolves, its
  // controller may choose a creature card in their hand whose mana cost the mana spent on {X} could pay, all or part of it
  // (the mana's amount and types, rulings), then may cast it face down as a 2/2 creature spell without paying its mana cost
  // (CR 708.4, 118.9, 608.2g); that spell and the creature it becomes are turned face up instead as they would assign or deal
  // damage, be dealt damage or become tapped, until they've been turned face up (a replacement effect, rulings;
  // GameObject.maskFaceUp, effects/run-round458.ts).
  if (line !== MASK) return false;
  const a = isSpell ? null : parseActivated("{X}: Draw a card. Activate only as a sorcery.");
  if (!a || a === "fail" || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "draw" || a.body.targets.length || !a.sorcerySpeed) {
    out.unsupported.push(raw);
    return true;
  }
  out.activated.push({ ...a, text: line, body: { targets: [], effects: [{ type: "illusionaryMask" }], text: line.slice("{X}: ".length, -" Activate only as a sorcery.".length) } });
  return true;
}
