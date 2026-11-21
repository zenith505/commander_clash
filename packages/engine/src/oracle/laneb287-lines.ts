// Lane B round B287's lines, read by compileCard before the generic triggers and statics (after round B286's): Mimeoplasm,
// Revered One's "As ~ enters, exile up to X creature cards from your graveyard" and Sanar, Innovative First-Year's Vivid
// trigger.
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseTrigger } from "./triggers";

const CREATURE_CARD: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
const MIMEOPLASM = "As ~ enters, exile up to X creature cards from your graveyard. It enters with three +1/+1 counters on it for each creature card exiled this way.";
const SANAR =
  /^(?:Vivid — )?At the beginning of your first main phase, (reveal cards from the top of your library until you reveal X nonland cards, where X is the number of colors among permanents you control\. For each of those colors, you may exile a card of that color from among the revealed cards\. Then shuffle\. You may cast the exiled cards this turn\.)$/;

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB287Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Mimeoplasm, Revered One: a choice as it enters (CR 614.1c, 614.12a) of up to X creature cards from its controller's
  // graveyard, X as it was cast (0 when it wasn't, CR 107.3m), none too; never itself, which isn't in the graveyard then.
  // The cards are exiled by its replacement, so they're the ones "exiled with it" (CR 607.2b), and it enters with three
  // +1/+1 counters for each one exiled (CR 614.1c, 122.6), so it isn't a 0/0 that dies (CR 704.5f) if it exiled any.
  if (line === MIMEOPLASM) {
    if (isSpell || out.entersExileFromYard) return fail();
    out.entersExileFromYard = { filter: CREATURE_CARD, n: "upToX", countersEach: { counter: "+1/+1", n: 3 } };
    return true;
  }
  // Sanar, Innovative First-Year: "Vivid" is an ability word (CR 207.2c); the trigger is the generic "At the beginning of your
  // first main phase" (CR 505.1a), its whole effect one (revealColorsExile, effects/run-laneb287.ts).
  const sanar = SANAR.exec(line);
  if (sanar) {
    if (isSpell) return fail();
    const t = parseTrigger("At the beginning of your first main phase, draw a card.");
    if (!t || t === "fail" || t.event !== "yourFirstMain") return fail();
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "revealColorsExile" }], text: sanar[1]! } });
    return true;
  }
  return false;
}
