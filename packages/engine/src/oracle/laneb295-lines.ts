// Lane B round B295's lines, read by compileCard before the generic triggers and activated abilities (after round B293's):
// Nick Fury, Agent of S.H.I.E.L.D.'s power-up, which may transform the double-faced card it puts onto the battlefield.
// (Harold and Bob, First Numens, the round's other card, is read with Bronzehide Lion's line in oracle/round344.ts, its
// granted "You get two rad counters." in oracle/mana-abilities.ts.)
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";

const NICK_FURY =
  "Power-up — {W}{U}{B}{R}{G}: Put two +1/+1 counters on ~, then look at the top seven cards of your library. You may put a Hero, Equipment, or Vehicle card from among them onto the battlefield. If it's a double-faced card, you may transform it. Put the rest on the bottom of your library in a random order.";
const TRANSFORM_IT = "If it's a double-faced card, you may transform it. ";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB295Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Nick Fury, Agent of S.H.I.E.L.D.: the power-up (CR 702.190a: once, its cost reduced by his mana cost the turn he
  // entered) without its transform sentence, then that sentence after the card is put onto the battlefield (CR 608.2c).
  // "It" is the card put onto the battlefield, the permanent it became (CR 400.7). It enters front face up (CR 712.14),
  // so its front face's enters abilities trigger, then it may transform (CR 701.27a): a nonmodal or a modal double-faced
  // card, which can transform under CR 712.9; not a meld card (712.4c) or a card whose other face is an instant or
  // sorcery (701.27d, 712.10). For those, and for any card that isn't double-faced, transforming does nothing (701.27c),
  // so nobody's asked (SpellCondition createdDoubleFaced). The rest go to the bottom after it, as the dig ends; nothing in
  // between sees the library.
  if (line === NICK_FURY) {
    if (isSpell) return fail();
    const a = parseActivated(line.replace(TRANSFORM_IT, ""));
    if (!a || a === "fail" || a.keyword !== "Power-up" || a.body.targets.length || a.body.effects.length !== 2) return fail();
    const [counters, dig] = a.body.effects;
    if (counters?.type !== "counters" || dig?.type !== "dig" || dig.into !== "battlefield" || dig.count !== 1 || !dig.upTo || dig.rest !== "bottom" || !dig.random) return fail();
    const transform: Effect = { type: "if", cond: { kind: "createdDoubleFaced" }, effects: [{ type: "may", effects: [{ type: "transform", what: { ref: "created" } }], text: "transform the double-faced card put onto the battlefield" }] };
    out.activated.push({ ...a, text: line, body: { ...a.body, effects: [counters, dig, transform], text: line.replace(/^Power-up — [^:]+: /, "") } });
    return true;
  }
  return false;
}
