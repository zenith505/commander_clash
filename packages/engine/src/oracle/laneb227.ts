// Lane B round B227's lines, read by compileCard before its triggers and activated abilities (after round B226's).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const ANAFENZA = "If a nontoken creature an opponent owns would die or a creature card not on the battlefield would be put into an opponent's graveyard, exile that card instead.";
const AEON = "{T}, Exile ~: Reverse the game's turn order.";
const HATCHLING = 'When ~ dies, you may cast Dinosaur spells this turn as though they had flash, and whenever you cast a Dinosaur spell this turn, it gains "When ~ enters, you may have it fight another target creature."';

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB227Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Anafenza, the Foremost: "If a nontoken creature an opponent owns would die or a creature card not on the battlefield
  // would be put into an opponent's graveyard, exile that card instead.": a replacement effect (CR 614.1a) on cards an
  // opponent owns going to their graveyard (CR 404.2), from the battlefield only as a creature (dying, CR 700.4), from
  // anywhere else only as a creature card (a spell on the stack, a card in a hand or library): what it is in the zone it's
  // leaving, not in the graveyard (rulings: an animated land card dies and is exiled, a bestowed Aura goes to the
  // graveyard). Tokens aren't cards (CR 111.1) and aren't affected (rulings), nor copies of spells (CR 707.10).
  if (line === ANAFENZA) {
    if (out.graveyardExile) return fail();
    out.graveyardExile = { whose: "opponents", typesNow: ["Creature"] };
    return true;
  }
  // Cherished Hatchling: 'When this creature dies, you may cast Dinosaur spells this turn as though they had flash, and
  // whenever you cast a Dinosaur spell this turn, it gains "When this creature enters, you may have it fight another target
  // creature."': two effects of the trigger as it resolves, for the rest of the turn (CR 514.2): permission to cast Dinosaur
  // spells as though they had flash (CR 702.8a; their costs still paid, rulings) and a delayed triggered ability (CR 603.7c)
  // that gives each Dinosaur spell you cast the enters trigger, kept by the permanent it becomes (CR 400.7a); the target is
  // chosen as that trigger goes on the stack, whether they fight as it resolves (rulings). Only a card with the Dinosaur
  // subtype is a Dinosaur spell (rulings).
  if (line === HATCHLING) {
    const dies = parseTrigger("When ~ dies, draw a card.");
    const cast = parseTrigger('Whenever you cast a Dinosaur spell, it gains "When ~ enters, you may have it fight another target creature."');
    if (!dies || dies === "fail" || dies.event !== "selfDies" || !cast || cast === "fail" || cast.event !== "castSpell" || cast.body.effects[0]?.type !== "spellGains" || cast.cast?.spell?.kind !== "spell") return fail();
    const filter: TargetSpec = { ...cast.cast.spell, text: "Dinosaur spells" };
    const effects: Effect[] = [
      { type: "flashUntilNextTurn", filter, thisTurn: true },
      { type: "floatingTrigger", trigger: { ...cast, body: { ...cast.body, text: 'it gains "When ~ enters, you may have it fight another target creature."' } }, until: "endOfTurn" },
    ];
    out.triggers.push({ ...dies, body: { targets: [], effects, text: line.replace(/^When ~ dies, /, "") } });
    return true;
  }
  // Aeon Engine: "{T}, Exile this artifact: Reverse the game's turn order.": an activated ability (it uses the stack), the
  // permanent exiled as the cost is paid (CR 602.2b); see the reverseTurnOrder effect.
  if (line === AEON) {
    const ab = parseActivated("{T}, Exile ~: Draw a card.");
    if (!ab || ab === "fail" || !ab.tap || !ab.exileSelf || ab.body.effects.length !== 1) return fail();
    out.activated.push({ ...ab, body: { targets: [], effects: [{ type: "reverseTurnOrder" }], text: "Reverse the game's turn order." }, text: line });
    return true;
  }
  return false;
}
