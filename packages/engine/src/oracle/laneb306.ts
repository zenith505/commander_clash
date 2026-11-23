// Lane B round B306: The Celestial Toymaker.
import type { AbilityBody } from "../abilities";

const TOY_PILES = "look at the top three cards of your library. Exile any number of them in a face-down pile and the rest in a face-up pile. Defending player chooses one of those piles. Put that pile into your hand.";
const TOY_LOSS = "each opponent loses 2 life for each spell or ability that caused one or more players to guess or to group cards or permanents into a pile this turn.";

/**
 * The Celestial Toymaker's two abilities' bodies. "Whenever ~ attacks, ...": the whole instruction, one effect
 * (exilePilesDefenderChooses, effects/run-laneb306.ts), "defending player" the trigger's player (`defending`). "At the
 * beginning of each end step, ...": each opponent of its controller loses 2 life for each spell or ability counted this
 * turn (Count pileOrGuessSources), worked out as it resolves (CR 608.2h).
 */
export function toymakerBody(text: string, opts: { defending?: boolean }): AbilityBody | null {
  const t = text.trim();
  if (t === TOY_PILES && opts.defending) return { targets: [], effects: [{ type: "exilePilesDefenderChooses", n: 3 }], text: t };
  if (t === TOY_LOSS) return { targets: [], effects: [{ type: "loseLife", who: { ref: "eachOpponent" }, n: { count: { kind: "pileOrGuessSources" }, times: 2 } }], text: t };
  return null;
}
