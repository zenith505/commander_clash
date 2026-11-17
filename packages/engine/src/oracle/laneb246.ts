// Lane B round B246's lines, read by compileCard before its triggers and activated abilities (after round B245's).
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB246Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Lagrella, the Magpie: "When ~ enters, exile any number of other target creatures controlled by different players until
  // ~ leaves the battlefield. When an exiled card enters under your control this way, put two +1/+1 counters on it.": no two
  // targets controlled by the same player (CR 115.3, as Chaos Mutation's), none too (CR 115.6); nothing is exiled if ~ has
  // already left (CR 610.3b), and the cards come back together under their owners' control when it leaves (CR 610.3c-d).
  // The second sentence is a delayed triggered ability made as the first resolves (rulings, CR 603.7a), controlled by this
  // ability's controller (603.7e): it triggers when ~ leaves even if ~ has lost its abilities by then (rulings), for a card
  // that returns under that player's control because ~ left (rulings), once (CR 603.7b; Effect exile `returnRider`).
  if (line === "When ~ enters, exile any number of other target creatures controlled by different players until ~ leaves the battlefield. When an exiled card enters under your control this way, put two +1/+1 counters on it.") {
    const t = parseTrigger("When ~ enters, exile any number of other target creatures controlled by different players.");
    const ex = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const spec = t && t !== "fail" ? t.body.targets[0] : undefined;
    const rider = parseBody("put two +1/+1 counters on it.", { subject: true, subjectIt: true });
    const counters = rider?.effects[0];
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.targets.length !== 1 || spec?.many !== "any" || !spec.differentControllers || !spec.notSource || ex?.type !== "exile" || ex.until || ex.what.ref !== "target" || !rider || rider.targets.length || rider.effects.length !== 1 || counters?.type !== "counters" || counters.what.ref !== "subject") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...ex, until: "sourceLeaves", returnRider: { ...rider, text: "put two +1/+1 counters on it." } }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  return false;
}
