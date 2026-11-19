// Lane B round B265's lines, read by compileCard before the generic triggers (after round B264's): Phyrexian Portal's
// activated ability and Raging River's attack trigger. Its spells are in oracle/laneb265.ts.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const PORTAL = "{3}: If your library has ten or more cards in it, target opponent looks at the top ten cards of your library and separates them into two face-down piles. Exile one of those piles. Search the other pile for a card, put it into your hand, then shuffle the rest of that pile into your library.";
const RIVER = 'Whenever one or more creatures you control attack, each defending player divides all creatures without flying they control into a "left" pile and a "right" pile. Then, for each attacking creature you control, choose "left" or "right." That creature can\'t be blocked this combat except by creatures with flying and creatures in a pile with the chosen label.';

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB265Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (line === PORTAL) {
    // Phyrexian Portal: an activated ability with a target opponent (CR 115.1); the library's size is checked as it
    // resolves (CR 608.2c). The opponent looks at the top ten cards and separates them into two face-down piles while
    // they're still in the library (CR 700.3, 700.3c), either possibly empty (rulings). You exile one pile without seeing
    // either (face down), then look through the other and put one of its cards into your hand (a card with no stated
    // quality, so one is found if the pile has one), and the rest of it is shuffled into the library (Effect portalPiles).
    const a = parseActivated("{3}: Target opponent loses 1 life.");
    if (isSpell || !a || a === "fail" || a.body.targets.length !== 1 || a.body.targets[0]!.kind !== "player") {
      out.unsupported.push(line);
      return true;
    }
    out.activated.push({ ...a, body: { targets: a.body.targets, effects: [{ type: "portalPiles", n: 10, by: 0 }], text: line.replace(/^\{3\}: /, "") }, text: line });
    return true;
  }
  if (line === RIVER) {
    // Raging River: one trigger for each declaration that includes creatures you control (CR 508.3a, "one or more"). As it
    // resolves, each defending player (CR 506.2) divides their creatures without flying into two piles (CR 700.3), in APNAP
    // order (CR 101.4); then you choose a label for each creature you control that's attacking, and each of them can't be
    // blocked this combat except by creatures with flying and the creatures in a pile with that label (CR 509.1b). A
    // creature that enters later, or isn't one of those creatures any more (CR 400.7), is in no pile; one put onto the
    // battlefield attacking afterwards has no restriction (rulings; GameObject.riverOnly).
    const t = parseTrigger("Whenever one or more creatures you control attack, draw a card.");
    if (isSpell || !t || t === "fail" || t.event !== "creaturesYouControlAttack") {
      out.unsupported.push(line);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "ragingRiver" }], text: line.replace(/^Whenever one or more creatures you control attack, /, "") } });
    return true;
  }
  return false;
}
