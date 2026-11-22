// Round 448's whole lines (compile.ts, before round 447's): Dinosaur Headdress (Paleontologist's Pick-Axe's back face),
// "As ~ becomes attached to a creature, choose an exiled creature card used to craft ~." and "Equipped creature is a copy
// of the last chosen card."
import type { CompiledCard } from "../abilities";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/** One whole line of round 448's (compile.ts); false when it isn't one of these. */
export function round448Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Dinosaur Headdress: "As ~ becomes attached to a creature, choose an exiled creature card used to craft ~.": asked each
  // time it becomes attached to a creature, as Sanctuary Blade's color is (CR 614.12; game.ts askAttachColor), among the
  // creature cards its craft cost exiled that are still in exile (CR 702.167c, rulings), the same one as last time or
  // another (rulings). With none left nothing is chosen, and the last chosen card stays the last chosen card.
  if (line === "As ~ becomes attached to a creature, choose an exiled creature card used to craft ~.") {
    if (isSpell || out.attachChooseColor || out.attachChooseNameAndType || out.attachChooseCrafted) return fail(out, raw);
    out.attachChooseCrafted = true;
    return true;
  }
  // Dinosaur Headdress: "Equipped creature is a copy of the last chosen card.": a static copy effect (CR 707.2, 611.3a) of
  // exactly what's printed on that card, X as 0 (rulings, CR 707.2, 202.3e), not of what it was before it was exiled
  // (rulings), with the Equipment's timestamp, a new one each time it becomes attached (CR 613.7e), as Metamorphic
  // Alteration's (game.ts syncAuraCopies). Its values are those of the card as it was chosen; a card in exile has only its
  // printed ones, so the copy stays the same if that card later leaves exile (as Metamorphic Alteration's rulings say of
  // its chosen creature leaving the battlefield).
  if (line === "Equipped creature is a copy of the last chosen card.") {
    if (isSpell || !out.attachChooseCrafted || out.equippedCopiesChosen) return fail(out, raw);
    out.equippedCopiesChosen = true;
    return true;
  }
  return false;
}
