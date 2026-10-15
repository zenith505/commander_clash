// Replacement effects on how many counters are put on a permanent or how many tokens are created
// (CR 614.1a, 616.1): Doubling Season, Hardened Scales, Parallel Lives, Xorn.

import type { CountMod, TokenSpec } from "./abilities";
import { abilitiesOf } from "./cards";
import { controllerOf, characteristics } from "./layers";
import type { GameObject, GameState, PlayerId } from "./types";
import { fireEvent } from "./effects";

function modsInPlay(s: GameState): { mod: CountMod; controller: PlayerId; source: string }[] {
  const out: { mod: CountMod; controller: PlayerId; source: string }[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    for (const mod of abilitiesOf(s, o).countMods ?? []) out.push({ mod, controller: controllerOf(s, o), source: id });
  }
  return out;
}

/**
 * Applies "plus one" before "twice that many": the affected permanent's controller chooses the order
 * (CR 616.1, Hardened Scales rulings), and this order gives them the most. "Minus one" (Vizier of Remedies, on -1/-1
 * counters) goes first, which gives them the fewest.
 */
function apply(n: number, ops: CountMod["op"][]): number {
  if (n <= 0) return n;
  for (const op of ops) if (op === "minusOne") n = Math.max(0, n - 1);
  for (const op of ops) if (op === "plusOne") n += 1;
  for (const op of ops) if (op === "double") n *= 2;
  return n;
}

/**
 * How many `kind` counters an effect putting `n` on `o` really puts (o is on the battlefield). A permanent
 * entering with counters isn't affected by its own doubler, since that one applies to a general subset of
 * permanents and only those already on the battlefield count (CR 614.12).
 */
export function countersToPut(s: GameState, o: GameObject, kind: string, n: number, entering = false): number {
  if (n <= 0 || o.zone !== "battlefield") return n;
  const owner = controllerOf(s, o);
  const isCreature = characteristics(s, o).types.includes("Creature");
  const ops = modsInPlay(s)
    .filter(({ mod, controller, source }) => mod.what === "counters" && (mod.counter === undefined || mod.counter === kind) && (mod.on === "permanent" || isCreature) && (mod.who === "any" || controller === owner) && !((mod.other || entering) && source === o.id))
    .map(({ mod }) => mod.op);
  return apply(n, ops);
}

/** How many of this token `pid` really creates when an effect would create `n`. */
export function tokensToCreate(s: GameState, pid: PlayerId, token: Pick<TokenSpec, "subtypes">, n: number): number {
  const ops = modsInPlay(s)
    .filter(({ mod, controller }) => mod.what === "tokens" && (mod.who === "any" || controller === pid) && (!mod.subtype || token.subtypes.includes(mod.subtype)))
    .map(({ mod }) => mod.op);
  return apply(n, ops);
}

/** Put counters on a permanent through those replacement effects; returns how many were put on. */
export function putCounters(s: GameState, o: GameObject, kind: string, n: number, entering = false): number {
  const m = countersToPut(s, o, kind, n, entering);
  if (m > 0) {
    o.counters[kind] = (o.counters[kind] ?? 0) + m;
    fireEvent(s, { type: "countersPut", id: o.id, counter: kind, amount: m });
  }
  return m;
}
