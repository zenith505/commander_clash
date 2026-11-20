// Lane B round B279's lines, read by compileCard before the generic triggers and statics (after round B278's): Emblazoned
// Golem's restriction on its kicker's X and its counters.
import type { CompiledCard } from "../abilities";
import type { CardDef } from "../types";
import { parseManaCost } from "../mana";
import { parseActivated } from "./activated";

const GOLEM_SPEND = "Spend only colored mana on X. No more than one mana of each color may be spent this way.";
const GOLEM_COUNTERS = "If ~ was kicked, it enters with X +1/+1 counters on it.";
const ALAUNDO =
  '{T}: Draw a card, then exile a card from your hand and put a number of time counters on it equal to its mana value. It gains "When the last time counter is removed from ~, if it\'s exiled, you may cast it without paying its mana cost. If you cast a creature spell this way, it gains haste until end of turn." Then remove a time counter from each other card you own in exile.';

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB279Line(line: string, out: CompiledCard, isSpell: boolean, d: CardDef): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // "Kicker {X}" alone, X in no other cost (CR 702.33a, 107.3a): the kicker's X is announced as it's cast, 0 unless it's
  // kicked (CR 601.2b).
  const kickX = !!out.kicker && !out.kicker.multi && !out.kicker.required && out.kicker.costs.length === 1 && out.kicker.costs[0] === "{X}" && !parseManaCost(d.manaCost).hasX && !d.faces?.length;
  // Emblazoned Golem: a restriction on how the total cost is paid (CR 601.2g-h): the mana paying X, which is generic mana in
  // the total cost (CR 107.4b), is colored, and no two of it are the same color, so X is at most 5 (less any reductions
  // that take it off, as they may off Drain Life's X, its rulings).
  if (line === GOLEM_SPEND) {
    if (isSpell || !kickX || out.kickXOneOfEachColor) return fail();
    out.kickXOneOfEachColor = true;
    return true;
  }
  // "If ~ was kicked, it enters with X +1/+1 counters on it": a replacement effect (CR 614.1c), the X announced for its
  // kicker (CR 107.3m), which is 0 unless it was kicked.
  if (line === GOLEM_COUNTERS) {
    if (isSpell || !kickX || out.entersWithCounters) return fail();
    out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "x" } } };
    return true;
  }
  // Alaundo the Seer: draw a card (CR 121.1), then exile a card of your choice from your hand (mandatory when there's one),
  // with time counters equal to its mana value (CR 122.1; none for 0, rulings); it gains a triggered ability that works in
  // exile (CR 113.6, 400.7: as long as it's that object there; GameObject.alaundoCast). It isn't suspend and doesn't make the
  // card suspended (rulings): nothing removes those counters each upkeep. Then a time counter comes off each other card you
  // own in exile, suspended ones included (rulings; Effect timeCounterFromOwnExiled).
  if (line === ALAUNDO) {
    const a = isSpell ? null : parseActivated("{T}: Draw a card.");
    const draw = a && a !== "fail" ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || !a.tap || a.manaCost || a.costs?.length || a.body.targets.length || a.body.effects.length !== 1 || draw?.type !== "draw") return fail();
    out.activated.push({
      ...a,
      text: line,
      body: {
        targets: [],
        effects: [draw, { type: "discard", who: { ref: "you" }, n: 1, exile: true, alaundoMv: true }, { type: "timeCounterFromOwnExiled" }],
        text: line.slice("{T}: ".length),
      },
    });
    return true;
  }
  return false;
}
