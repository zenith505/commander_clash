// Lane B round B263's lines, read by compileCard before the generic triggers (after round B262's): Torrent of Lava's
// ability that works while it's on the stack. Its spell and the sentence of the ability it gives are in oracle/laneb263.ts.
import type { CompiledCard } from "../abilities";
import { compileGranted } from "./grants";

const TORRENT = /^As long as ~ is on the stack, each creature has "(\{T\}: Prevent the next 1 damage that would be dealt to ~ by ⟪source⟫ this turn\.)"$/;

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB263Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  // Torrent of Lava: an ability of a sorcery spell that functions while it's on the stack (CR 113.6), a static ability
  // giving each creature on the battlefield an activated ability (CR 613.1f, layer 6) with the spell's timestamp (CR
  // 613.7a). "Torrent of Lava" in the quoted ability is that spell (layers.ts binds it, CR 201.5).
  const m = TORRENT.exec(line);
  if (!m) return false;
  const g = isSpell ? compileGranted(m[1]!) : undefined;
  if (!g || g.unsupported.length || g.activated.length !== 1 || g.triggers.length || g.statics.length || g.mana.length) {
    out.unsupported.push(line);
    return true;
  }
  (out.stackGrants ??= []).push({ text: m[1]!, affects: { kind: "filter", types: ["Creature"] } });
  return true;
}
