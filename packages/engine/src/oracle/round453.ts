// Round 453's whole lines (compile.ts, before round 452's): Psychic Battle's "Whenever a player chooses one or more
// targets, each player reveals the top card of their library. The player who reveals the card with the greatest mana value
// may change the target or targets. If two or more cards are tied for greatest, the target or targets remain unchanged.
// Changing targets this way doesn't trigger abilities of permanents named ~."
import type { CompiledCard } from "../abilities";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const BATTLE = "Whenever a player chooses one or more targets, each player reveals the top card of their library. The player who reveals the card with the greatest mana value may change the target or targets. If two or more cards are tied for greatest, the target or targets remain unchanged. Changing targets this way doesn't trigger abilities of permanents named ~.";

/** One whole line of round 453's (compile.ts); false when it isn't one of these. */
export function round453Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // "Chooses one or more targets" (TriggerEvent "targetsChosen", triggers.ts): any player choosing at least one target for a
  // spell or ability as it's cast, activated or put on the stack (CR 601.2c, 602.2b, 603.3d), or choosing new ones for a
  // copy (707.10c) or as an effect lets them (115.7), Psychic Battle's own change excepted; not a copy's copied targets
  // (707.10) or targets an effect specifies (707.10d-e, "change the target to ~"), nor a random reselection (Grip of Chaos):
  // no player chooses those. The trigger has no target, so it never triggers itself.
  if (line === BATTLE) {
    if (isSpell) return fail(out, raw);
    out.triggers.push({ event: "targetsChosen", body: { targets: [], effects: [{ type: "psychicBattle" }], text: BATTLE.replace(/^Whenever a player chooses one or more targets, /, "") } });
    return true;
  }
  return false;
}
