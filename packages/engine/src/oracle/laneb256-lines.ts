// Lane B round B256's lines, read by compileCard: Search the City's play trigger. roundB256Line before the generic static
// abilities (after round B255's).
import { allEffects, type CompiledCard, type Effect } from "../abilities";
import { parseTrigger } from "./triggers";
import { parseTargetPhrase } from "./targets";

const CITY = "Whenever you play a card with the same name as one of the exiled cards, you may put one of those cards with that name into its owner's hand. Then if there are no cards exiled with ~, sacrifice it. If you do, take an extra turn after this one.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB256Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell || line !== CITY) return false;
  // Search the City: "the exiled cards" are the ones its enters ability exiled from the top of the library (CR 607.2a), its
  // only exile, read before this line. Playing a card is casting it or playing it as a land (rulings, CR 305.1, 601.2), a
  // card only (a copy isn't one), with the name it has as it's played (a face-down spell has none, CR 708.2a). One trigger
  // for each card played; one exiled card returned each time (rulings).
  const exiles = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && e.who.ref === "you" && !e.bottom && !e.randomOf);
  const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "exileTop" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse");
  const t = parseTrigger("Whenever you cast a spell, draw a card.");
  const land = parseTargetPhrase("land");
  if (exiles.length !== 1 || others.length !== 1 || !t || t === "fail" || t.event !== "castSpell" || !t.cast || land?.kind !== "object") {
    out.unsupported.push(line);
    return true;
  }
  exiles[0]!.linked = true;
  out.triggers.push({ ...t, cast: { ...t.cast, cardOnly: true, nameExiledWithSelf: true, orPlaysLand: { ...land, text: "land" } }, body: { targets: [], effects: [{ type: "searchTheCity" }], text: CITY.replace(/^Whenever you play a card with the same name as one of the exiled cards, /, "") } });
  return true;
}
