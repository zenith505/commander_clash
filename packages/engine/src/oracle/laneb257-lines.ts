// Lane B round B257's lines, read by compileCard: Arcum's Whistle's activated ability. roundB257Line before the generic
// static abilities (after round B256's).
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";

const WHISTLE = "{3}, {T}: Choose target non-Wall creature the active player has controlled continuously since the beginning of the turn. That player may pay {X}, where X is that creature's mana value. If they don't pay, the creature attacks this turn if able, and at the beginning of the next end step, destroy it if it didn't attack this turn. Activate only before attackers are declared.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB257Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell || line !== WHISTLE) return false;
  // Arcum's Whistle: Nettling Imp's ability (read from its words) behind a payment. "That player" is the active player,
  // who controls the target as long as it's legal (its target spec, checked again as it resolves, CR 608.2b), so the
  // target's controller decides whether to pay {X}, X its mana value as the ability resolves (CR 107.3, 202.3). Unpaid, it
  // attacks this turn if able (CR 508.1d) and is destroyed at the next end step if it didn't attack this turn. "Before
  // attackers are declared" is before the declare attackers step of the turn's first combat (rulings, CR 506.8a).
  const a = parseActivated("{3}, {T}: Choose target non-Wall creature the active player has controlled continuously since the beginning of the turn. That creature attacks this turn if able. Destroy it at the beginning of the next end step if it didn't attack this turn. Activate only before attackers are declared.");
  const t = a && a !== "fail" ? a.body.targets : [];
  if (!a || a === "fail" || t.length !== 1 || t[0]!.kind !== "object" || !t[0]!.activeController || !t[0]!.controlledSinceTurnBegan || a.body.effects.length !== 2 || a.activateIf?.kind !== "during" || a.activateIf.window !== "beforeAttackers" || a.activateIf.turn) {
    out.unsupported.push(line);
    return true;
  }
  const punisher: Effect = {
    type: "punisher",
    who: { ref: "targetController", index: 0 },
    options: [{ pay: { cost: "", generic: { count: { kind: "manaValue", of: { ref: "target", index: 0 } } } } }],
    effects: a.body.effects,
    penalty: "Let it attack this turn if able (destroyed at the next end step if it doesn't)",
  };
  out.activated.push({ ...a, body: { ...a.body, effects: [punisher], text: line.replace(/^\{3\}, \{T\}: /, "").replace(/ Activate only before attackers are declared\.$/, "") }, text: line });
  return true;
}
