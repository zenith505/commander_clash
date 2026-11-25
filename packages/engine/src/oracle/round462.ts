// Round 462's whole lines (compile.ts): Swirl the Mists (swirl.ts) and Camouflage (camouflage.ts).
import type { CompiledCard } from "../abilities";

const CAMOUFLAGE =
  "This turn, instead of declaring blockers, each defending player chooses any number of creatures they control and divides them into a number of piles equal to the number of attacking creatures for whom that player is the defending player. Creatures those players control that can block additional creatures may likewise be put into additional piles. Assign each pile to a different one of those attacking creatures at random. Each creature in a pile that can block the creature that pile is assigned to does so.";

const SWIRL = "All instances of color words in the text of spells and permanents are changed to the chosen color word.";

/** One whole line of round 462's (compile.ts); false when it isn't one of these. */
export function round462Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Swirl the Mists: "As ~ enters, choose a color word." (CR 614.12): one of the five color words (CR 105.1), kept as the
  // color it names (Chosen.color).
  if (line === "As ~ enters, choose a color word.") {
    if (isSpell || out.entersChoose?.some((c) => c.what === "color")) out.unsupported.push(raw);
    else (out.entersChoose ??= []).push({ what: "color", word: true });
    return true;
  }
  // "All instances of color words in the text of spells and permanents are changed to the chosen color word.": a static
  // ability whose effect is a text-changing effect (CR 612.1-612.2) in layer 3 (CR 613.1c), on every spell and permanent,
  // those cast or entering later too, for as long as ~ is on the battlefield (rulings). swirl.ts applies it.
  if (line === SWIRL) {
    if (isSpell || out.swirlMists) out.unsupported.push(raw);
    else out.swirlMists = true;
    return true;
  }
  // Camouflage: its effect replaces declaring blockers for the rest of the turn (CR 509.1; camouflage.ts has how it's
  // read). "Cast this spell only during your declare attackers step" is its other line (CompiledCard.castOnly).
  if (line === CAMOUFLAGE) {
    if (!isSpell || out.spell) out.unsupported.push(raw);
    else out.spell = { targets: [], effects: [{ type: "camouflage" }], text: line };
    return true;
  }
  return false;
}
