// Round 443's whole lines (compile.ts, before round 442's): Etrata, Deadly Fugitive's granted "Turn this creature face up.
// If you can't, exile it, then you may cast the exiled card without paying its mana cost.", and Cryptic Spires' colors
// circled as its deck is built.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const ETRATA_FACE_UP = /^(\{[^:]+\}): Turn ~ face up\. If you can't, exile it, then you may cast the exiled card without paying its mana cost\.$/;
export const CIRCLE_TWO = "As you create your deck, circle two of the colors below.";

/** One whole line of round 443's (compile.ts); false when it isn't one of these. */
export function round443Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Cryptic Spires: "As you create your deck, circle two of the colors below." A choice made as the deck is built, before
  // any game (CR 207.5, rulings): the mana symbols of the two colors circled are part of the card's printed rules text, so
  // its copiable values (CR 613.1, 707.2) and its color identity (CR 903.4). It does nothing in the game; the colors are
  // CardDef.circledColors (cards.ts circleColors), which its mana ability reads (manaabilities.ts, ManaProduce "circled").
  if (line === CIRCLE_TWO) {
    out.circleTwoColors = true;
    return true;
  }
  // Etrata, Deadly Fugitive, the ability it gives face-down creatures you control: "{2}{U}{B}: Turn this creature face up.
  // If you can't, exile it, then you may cast the exiled card without paying its mana cost." As it resolves, the creature,
  // still that object on the battlefield (CR 400.7), is turned face up by the effect, no cost paid (CR 708.8,
  // turnFaceUpByEffect). It can't be when it's a manifested or cloaked instant or sorcery card (revealed, it stays face
  // down, CR 701.40g, 701.58g) or an effect says it can't be (Unable to Scream), and nor can a permanent that's face up
  // already or gone (CR 609.3). Then it's exiled, if it's still there, and its controller may cast that card as this
  // resolves, timing ignored, X as 0 (CR 608.2g, 107.3b, rulings); a land card, or a card that can't be cast, stays exiled.
  const m = ETRATA_FACE_UP.exec(line);
  if (m) {
    const a = parseActivated(`${m[1]}: Draw a card.`);
    if (!a || a === "fail" || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "draw" || a.body.targets.length) {
      out.unsupported.push(raw);
      return true;
    }
    const text = line.slice(m[1]!.length + 2);
    out.activated.push({
      ...a,
      text: line,
      body: {
        targets: [],
        effects: [
          { type: "turnFaceUp", what: { ref: "self" }, setDid: true },
          { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: [{ type: "exileSelfCastFree" }] },
        ],
        text,
      },
    });
    return true;
  }
  return false;
}
