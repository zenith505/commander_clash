// Lane B round B297's lines, read by compileCard before the generic statics (after round B296's): Yixlid Jailer's "Cards in
// graveyards lose all abilities."
import type { CompiledCard } from "../abilities";

const JAILER = "Cards in graveyards lose all abilities.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB297Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (line !== JAILER) return false;
  if (isSpell) {
    out.unsupported.push(line);
    return true;
  }
  // A static ability of the permanent's (CR 113.6), a layer 6 effect (CR 613.1f) on every card in every graveyard, whoever
  // owns it, from the permanent's timestamp (CR 613.7a). layers.ts records it as it applies (OffFieldGrant.yardLoseAll);
  // the cards' definitions there then have no abilities (cards.ts yardLostDef). It changes nothing on the battlefield, so
  // it "affects" only its own permanent, which keeps it from applying once that permanent loses its abilities.
  out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "yardLoseAll" }], text: line });
  return true;
}
