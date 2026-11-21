// Lane B round B282's lines, read by compileCard before the generic triggers and statics (after round B281's): Ertai's
// Meddling's spell, Shared Fate's draw replacement and its permission.
import type { CompiledCard } from "../abilities";
import { parseManaCost } from "../mana";
import type { CardDef } from "../types";

const MEDDLE = "Target spell's controller exiles it with X delay counters on it.";
const MEDDLE_RETURN = "At the beginning of each of that player's upkeeps, if that card is exiled, remove a delay counter from it. If the card has no delay counters on it, the player puts it onto the stack as a copy of the original spell.";
const X_NOT_ZERO = "X can't be 0.";
const FATE_DRAW = "If a player would draw a card, that player exiles the top card of one of their opponents' libraries face down instead.";
const FATE_PLAY = "Each player may look at cards they exiled with ~, and they may play lands and cast spells from among those cards.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB282Line(line: string, out: CompiledCard, isSpell: boolean, d: CardDef): boolean {
  const fail = () => (out.unsupported.push(line), true);
  const text = d.oracleText ?? "";
  // Ertai's Meddling: the three paragraphs are one spell, read together here (each needs the others).
  const meddling = isSpell && text.includes(MEDDLE) && text.includes(MEDDLE_RETURN) && parseManaCost(d.manaCost).hasX;
  // "X can't be 0." on its own (CR 107.3b): it can't be cast without paying its mana cost (rulings).
  if (line === X_NOT_ZERO && meddling) {
    if (out.xMin) return fail();
    out.xMin = 1;
    return true;
  }
  // "Target spell's controller exiles it with X delay counters on it.": any spell (a copy too, which ceases to exist,
  // rulings), exiled rather than countered (CR 701.6a); counterSpell `exileSpell` `meddle`, effects/run-laneb282.ts.
  if (line === MEDDLE) {
    if (!meddling || out.spell) return fail();
    out.spell = {
      targets: [{ kind: "spell", types: [], notTypes: [], notColors: [], text: "target spell" }],
      effects: [{ type: "counterSpell", index: 0, exileSpell: true, meddle: true, meddleReturn: true }],
      text: `${MEDDLE} ${MEDDLE_RETURN}`,
    };
    return true;
  }
  // Its delayed triggered ability (CR 603.7), made as the spell resolves: part of the spell above (`meddleReturn`).
  if (line === MEDDLE_RETURN) return meddling ? true : fail();
  // Shared Fate: a replacement of every player's draws (CR 614.1a), game.ts drawReplacementChoices "fate:<id>:<opponent>".
  if (line === FATE_DRAW) {
    if (isSpell || out.drawSharedFate) return fail();
    out.drawSharedFate = true;
    return true;
  }
  // "Each player may look at cards they exiled with ~, and they may play lands and cast spells from among those cards.":
  // the cards its own draw replacement exiled (CR 607.2a), while it's on the battlefield as that object (GameObject.mayPlay
  // until "source"); no more than that is allowed with them (rulings).
  if (line === FATE_PLAY) {
    if (isSpell || out.sharedFatePlay || !text.includes(FATE_DRAW)) return fail();
    out.sharedFatePlay = true;
    return true;
  }
  return false;
}
