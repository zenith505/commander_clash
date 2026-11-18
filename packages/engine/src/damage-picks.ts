// Round B253: the choices that Dralnu, Lich Lord's and Nefarious Lich's replacements of damage call for as they apply (CR
// 614.1a). They're made while the damage's plan is worked out (damage.ts planShields), so a resolving spell or ability and the
// combat damage step can stop to ask, the way the plan's other questions do (CR 616.1); where nothing can stop (a mana
// ability's damage), the way a bot would make them. The permanents and cards are then sacrificed and exiled as the rest of
// the damage is dealt (dealPlanned).

import { canBeSacrificed, defOf, objIsType } from "./cards";
import type { ShieldQuestion } from "./damage";
import { log, moveObject, obj, player, playerLoses, turnOrderFrom } from "./game";
import { characteristics, controllerOf, invalidateCharacteristics } from "./layers";
import type { GameState, ObjectId, PlayerId } from "./types";
import { worth } from "./value";
import { defMv } from "./faces";

/** What the replacements take instead of the damage, for each player. */
export interface ReplacementPicks {
  /** Dralnu: the permanents each player sacrifices. */
  sacrifices: { player: PlayerId; ids: ObjectId[]; card: string }[];
  /** Nefarious Lich: the graveyard cards each player exiles. */
  exiles: { player: PlayerId; ids: ObjectId[]; card: string }[];
  /** Nefarious Lich: the players with fewer cards in their graveyard than that ("If you can't, you lose the game"). */
  losers: { player: PlayerId; card: string }[];
}

/** The part of a plan's "modify" step these picks read: how much damage it replaced, and with what. */
interface ReplacedOp {
  kind: string;
  from?: number;
  n?: number;
  card?: string;
  player?: PlayerId;
  sacrifice?: PlayerId;
  exileYard?: true;
}

/** Labels for a list of objects, told apart where two have the same name. */
function labelsFor(s: GameState, ids: ObjectId[], battlefield: boolean): string[] {
  const name = (id: ObjectId) => (battlefield ? characteristics(s, obj(s, id)).name : defOf(s, obj(s, id)).name);
  const extra = (id: ObjectId) => {
    const o = obj(s, id);
    return battlefield ? [o.isToken ? "token" : "", o.tapped ? "tapped" : ""].filter(Boolean).join(", ") : "";
  };
  const counts = new Map<string, number>();
  return ids.map((id) => {
    const base = `${name(id)}${extra(id) ? ` (${extra(id)})` : ""}`;
    const dup = ids.filter((x) => `${name(x)}${extra(x) ? ` (${extra(x)})` : ""}` === base).length > 1;
    const k = (counts.get(base) ?? 0) + 1;
    counts.set(base, k);
    return `${base}${dup ? ` #${k}` : ""}`;
  });
}

/** `n` of `options` (in a bot's order of preference), one question at a time; all of them with no more than `n`. Null to ask. */
function pickSome(s: GameState, pid: PlayerId, options: ObjectId[], n: number, battlefield: boolean, prompt: (k: number) => string, choose: (q: ShieldQuestion) => number | null): ObjectId[] | null {
  if (n >= options.length) return [...options];
  const left = [...options];
  const out: ObjectId[] = [];
  for (let k = 0; k < n; k++) {
    const i = choose({ player: pid, prompt: prompt(k), labels: labelsFor(s, left, battlefield) });
    if (i === null) return null;
    out.push(...left.splice(i, 1));
  }
  return out;
}

/**
 * The picks the plan's replacements need: undefined with none, null when `choose` is waiting on an answer. Each player
 * chooses for all of the damage replaced at once (rulings on Lich: sacrificed simultaneously), in turn order.
 */
export function replacementPicks(s: GameState, ops: readonly ReplacedOp[], choose: (q: ShieldQuestion) => number | null): ReplacementPicks | undefined | null {
  const sac = new Map<PlayerId, { n: number; card: string }>();
  const ex = new Map<PlayerId, { n: number; card: string }>();
  for (const op of ops) {
    if (op.kind !== "modify") continue;
    const n = (op.from ?? 0) - (op.n ?? 0);
    if (n <= 0) continue;
    if (op.sacrifice !== undefined) sac.set(op.sacrifice, { n: (sac.get(op.sacrifice)?.n ?? 0) + n, card: sac.get(op.sacrifice)?.card ?? op.card ?? "" });
    else if (op.exileYard && op.player !== undefined) ex.set(op.player, { n: (ex.get(op.player)?.n ?? 0) + n, card: ex.get(op.player)?.card ?? op.card ?? "" });
  }
  if (!sac.size && !ex.size) return undefined;
  const out: ReplacementPicks = { sacrifices: [], exiles: [], losers: [] };
  for (const pid of turnOrderFrom(s, s.activePlayer)) {
    const p = player(s, pid);
    if (p.lost) continue;
    const a = sac.get(pid);
    if (a) {
      // Its controller's permanents that can be sacrificed (CR 701.21a), the least worth first for a bot.
      const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && canBeSacrificed(s, obj(s, id)));
      mine.sort((x, y) => worth(s, pid, obj(s, x)) - worth(s, pid, obj(s, y)) || (x < y ? -1 : 1));
      const ids = pickSome(s, pid, mine, a.n, true, (k) => `${a.card}: sacrifice ${a.n === 1 ? "a permanent" : `${a.n} permanents`} instead of the damage${a.n > 1 ? ` (${k + 1} of ${a.n})` : ""}. Which one?`, choose);
      if (!ids) return null;
      out.sacrifices.push({ player: pid, ids, card: a.card });
    }
    const b = ex.get(pid);
    if (b) {
      // "If you can't": with fewer cards there, none is exiled (rulings on Egon, God of Death).
      if (b.n > p.graveyard.length) out.losers.push({ player: pid, card: b.card });
      else {
        // A bot exiles lands first, then the cheapest cards.
        const yard = [...p.graveyard].sort((x, y) => (objIsType(s, obj(s, y), "Land") ? 1 : 0) - (objIsType(s, obj(s, x), "Land") ? 1 : 0) || defMv(defOf(s, obj(s, x))) - defMv(defOf(s, obj(s, y))) || (x < y ? -1 : 1));
        const ids = pickSome(s, pid, yard, b.n, false, (k) => `${b.card}: exile ${b.n === 1 ? "a card" : `${b.n} cards`} from your graveyard instead of the damage${b.n > 1 ? ` (${k + 1} of ${b.n})` : ""}. Which one?`, choose);
        if (!ids) return null;
        out.exiles.push({ player: pid, ids, card: b.card });
      }
    }
  }
  return out;
}

/** Sacrifice and exile what the replacements took, as the rest of the damage is dealt; then the players who couldn't lose. */
export function makeReplacementPicks(s: GameState, r: ReplacementPicks): void {
  for (const x of r.sacrifices) {
    const ids = x.ids.filter((id) => s.objects[id]?.zone === "battlefield");
    if (!ids.length) continue;
    log(s, `${player(s, x.player).name} sacrifices ${ids.map((id) => characteristics(s, obj(s, id)).name).join(", ")} (${x.card}).`);
    for (const id of ids) moveObject(s, id, "graveyard", { sacrificed: true });
  }
  for (const x of r.exiles) {
    const ids = x.ids.filter((id) => s.objects[id]?.zone === "graveyard");
    if (!ids.length) continue;
    log(s, `${player(s, x.player).name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their graveyard (${x.card}).`);
    for (const id of ids) moveObject(s, id, "exile");
  }
  if (r.sacrifices.length || r.exiles.length) invalidateCharacteristics(s);
  for (const x of r.losers) {
    if (player(s, x.player).lost) continue;
    log(s, `${player(s, x.player).name} can't exile that many cards from their graveyard (${x.card}).`);
    playerLoses(s, x.player, x.card);
  }
}
