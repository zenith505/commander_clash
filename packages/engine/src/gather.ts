// Round B250: Gather Specimens, "If a creature would enter the battlefield under an opponent's control this turn, it enters
// under your control instead." A control-changing replacement of how a creature enters (CR 614.1c, 614.12), applied before
// any other replacement that modifies how it enters (CR 616.1b, rulings): what else happens as it enters ("as ~ enters"
// choices, "enters with" counters, copy effects) is for the player it enters under.
import { opponents } from "./game";
import type { GameState, PlayerId } from "./types";

/** The Gather Specimens instances in effect this turn (GameState.gatherSpecimens), oldest first. */
function live(s: GameState) {
  return (s.gatherSpecimens ?? []).filter((g) => g.turn === s.turn && !s.players[g.player]?.lost);
}

/**
 * The control replacements that would apply next to a creature that would enter under `c`'s control: one Gather Specimens
 * instance of each player it isn't used up for (CR 614.5) whose opponent `c` is. Several instances of one player do the
 * same thing, so only the oldest is offered.
 */
export function gatherOptions(s: GameState, c: PlayerId, used: string[]): { id: string; player: PlayerId }[] {
  const opps = new Set<PlayerId>();
  const out: { id: string; player: PlayerId }[] = [];
  for (const g of live(s)) {
    if (used.includes(g.id) || g.player === c || opps.has(g.player)) continue;
    if (!opponents(s, g.player).includes(c)) continue;
    opps.add(g.player);
    out.push({ id: g.id, player: g.player });
  }
  return out;
}

/**
 * Apply the Gather Specimens replacements to a creature that would enter under `c`'s control, as long as only one can
 * apply at each step (CR 616.1b: with several, the player it would enter under chooses one, then the new one chooses
 * among those left, rulings). `isCreature(c)`: whether it would enter as a creature under `c`'s control (CR 614.12).
 * `self`: its own "enters under the control of an opponent of your choice" (Xantcha) is still to apply, another control
 * replacement its would-be controller orders with these. Returns where it stands, and the choice to ask if one is due.
 */
export function gatherSteps(s: GameState, c: PlayerId, used: string[], isCreature: (c: PlayerId) => boolean, self: boolean): { controller: PlayerId; used: string[]; choice?: string[] } {
  let ctl = c;
  let done = used;
  for (let guard = 0; guard < 16; guard++) {
    const opts = isCreature(ctl) ? gatherOptions(s, ctl, done) : [];
    if (!opts.length) return { controller: ctl, used: done };
    if (opts.length > 1 || self) return { controller: ctl, used: done, choice: [...opts.map((g) => String(g.player)), ...(self ? ["self"] : [])] };
    ctl = opts[0]!.player;
    done = [...done, opts[0]!.id];
  }
  return { controller: ctl, used: done };
}

/** The instance of `player`'s that `gatherSteps` offered for this choice (the oldest not used up). */
export function gatherInstance(s: GameState, c: PlayerId, used: string[], player: PlayerId): string | undefined {
  return gatherOptions(s, c, used).find((g) => g.player === player)?.id;
}
