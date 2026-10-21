// Replacement effects on how many counters are put on a permanent or how many tokens are created
// (CR 614.1a, 616.1): Doubling Season, Hardened Scales, Parallel Lives, Xorn.

import type { CountMod, TokenSpec } from "./abilities";
import { PREDEFINED_TOKENS } from "./oracle/tokens";
import { abilitiesOf } from "./cards";
import { controllerOf, characteristics, invalidateCharacteristics, keywordOfCounter } from "./layers";
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
 * Who is putting counters on right now (Vorinclex's "if you would put ..."): the controller of the spell or ability
 * whose effect it is (set while an effect runs) or of the source dealing wither, infect or toxic damage. Unset, it's the
 * affected permanent's controller, as for a permanent entering with counters (rulings on Vorinclex, Monstrous Raider).
 * Only set for the length of one synchronous call, never kept in the game state.
 */
let putterNow: PlayerId | undefined;
export function withPutter<T>(pid: PlayerId | undefined, fn: () => T): T {
  const was = putterNow;
  putterNow = pid;
  try {
    return fn();
  } finally {
    putterNow = was;
  }
}

/**
 * Applies "plus one" before "twice that many": the affected permanent's controller chooses the order
 * (CR 616.1, Hardened Scales rulings), and this order gives them the most. "Minus one" (Vizier of Remedies, on -1/-1
 * counters) goes first, which gives them the fewest. "Half that many, rounded down" (Vorinclex) goes last for counters
 * they want and first for harmful ones (-1/-1, stun, poison), whichever gives them more or fewer.
 */
function apply(n: number, ops: CountMod["op"][], harmful = false): number {
  if (n <= 0) return n;
  const half = () => {
    for (const op of ops) if (op === "halfDown") n = Math.floor(n / 2);
  };
  if (harmful) half();
  for (const op of ops) if (op === "minusOne") n = Math.max(0, n - 1);
  for (const op of ops) if (op === "plusOne") n += 1;
  for (const op of ops) if (op === "double") n *= 2;
  if (!harmful) half();
  return n;
}

/** Does a "putter" mod (Vorinclex) apply to counters put by `putter`, the mod's permanent controlled by `controller`? */
const putterFits = (s: GameState, mod: CountMod, controller: PlayerId, putter: PlayerId) =>
  mod.what === "counters" && "putter" in mod && (mod.putter === "you" ? putter === controller : putter !== controller && !s.players.find((p) => p.id === putter)?.lost);

/**
 * How many `kind` counters an effect putting `n` on `o` really puts (o is on the battlefield). A permanent
 * entering with counters isn't affected by its own doubler, since that one applies to a general subset of
 * permanents and only those already on the battlefield count (CR 614.12).
 */
export function countersToPut(s: GameState, o: GameObject, kind: string, n: number, entering = false): number {
  if (n <= 0 || o.zone !== "battlefield") return n;
  const owner = controllerOf(s, o);
  const putter = putterNow ?? owner;
  const types = characteristics(s, o).types;
  const isCreature = types.includes("Creature");
  const fits = (on: "creature" | "permanent" | "artifactOrCreature") => on === "permanent" || isCreature || (on === "artifactOrCreature" && types.includes("Artifact"));
  const ops = modsInPlay(s)
    .filter(({ mod, controller, source }) => {
      if (mod.what !== "counters" || ((mod.other || entering) && source === o.id)) return false;
      if ("putter" in mod && mod.putter) return putterFits(s, mod, controller, putter);
      return (mod.counter === undefined || mod.counter === kind) && fits(mod.on!) && (mod.who === "any" || controller === owner);
    })
    .map(({ mod }) => mod.op);
  return apply(n, ops, kind === "-1/-1" || kind === "stun");
}

/** How many `kind` counters (poison, energy) a player really gets when `n` would be put on them: only Vorinclex-style mods apply. */
export function playerCountersToPut(s: GameState, pid: PlayerId, kind: string, n: number): number {
  if (n <= 0) return n;
  const putter = putterNow ?? pid;
  const ops = modsInPlay(s)
    .filter(({ mod, controller }) => "putter" in mod && !!mod.putter && putterFits(s, mod, controller, putter))
    .map(({ mod }) => mod.op);
  return apply(n, ops, kind === "poison");
}

type TokenKind = Pick<TokenSpec, "types" | "subtypes">;
/** What an effect creating tokens really creates: `same` of its own token, and `extra` other tokens replacements add. */
export interface TokenBatch {
  same: number;
  extra: { token: TokenSpec; n: number }[];
}

/**
 * What `pid` really creates when an effect would create `n` of this token (CR 614.1a). The player creating them orders
 * the replacements (CR 616.1), each applying once to the event as it then is; this order gives the most tokens: the
 * ones adding a token (Xorn, Peregrin Took), then a token for each of a kind (Bilbo), then Academy Manufactor's one of
 * each (two Manufactors make three of each, rulings), then a token for each token (Chatterfang), then the doublers.
 */
export function tokenBatch(s: GameState, pid: PlayerId, token: TokenKind, n: number): TokenBatch {
  const mods = modsInPlay(s).flatMap(({ mod, controller }) => (mod.what === "tokens" && (mod.who === "any" || controller === pid) ? [mod] : []));
  if (n <= 0 || !mods.length) return { same: n, extra: [] };
  // The original token is the entry with no `spec`.
  const entries: { kind: TokenKind; spec?: TokenSpec; n: number }[] = [{ kind: token, n }];
  const fits = (k: TokenKind, mod: CountMod) => (!("subtype" in mod) || !mod.subtype || k.subtypes.includes(mod.subtype)) && (!("type" in mod) || !mod.type || k.types.includes(mod.type));
  const add = (spec: TokenSpec, k: number) => {
    if (k <= 0) return;
    const key = JSON.stringify(spec);
    const e = entries.find((x) => x.spec && JSON.stringify(x.spec) === key);
    if (e) e.n += k;
    else entries.push({ kind: spec, spec, n: k });
  };
  const live = () => entries.filter((e) => e.n > 0);
  // Those adding one token: one may make another apply (Peregrin Took's Food for Stridehangar Automaton).
  const adders = mods.filter((m) => m.op === "plusOne" || m.op === "plusToken");
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of [...adders]) {
      const at = live().find((e) => fits(e.kind, m));
      if (!at) continue;
      adders.splice(adders.indexOf(m), 1);
      if (m.op === "plusToken") add(m.token, 1);
      else at.n += 1;
      changed = true;
    }
  }
  for (const m of mods) if (m.op === "andEach") add(m.token, live().filter((e) => e.kind.subtypes.includes(m.subtype)).reduce((a, e) => a + e.n, 0));
  for (const m of mods) {
    if (m.op !== "oneOfEach") continue;
    const of = live().filter((e) => m.subtypes.some((st) => e.kind.subtypes.includes(st)));
    const k = of.reduce((a, e) => a + e.n, 0);
    if (!k) continue;
    for (const e of of) e.n = 0;
    for (const st of m.subtypes) {
      const own = of.find((e) => e.kind.subtypes.includes(st));
      if (own) own.n = k;
      else add(PREDEFINED_TOKENS[st]!, k);
    }
  }
  for (const m of mods) if (m.op === "plusThatMany") add(m.token, live().reduce((a, e) => a + e.n, 0));
  for (const m of mods) if (m.op === "double" || m.op === "triple") for (const e of live()) if (fits(e.kind, m)) e.n *= m.op === "double" ? 2 : 3;
  return { same: entries[0]!.n, extra: entries.slice(1).flatMap((e) => (e.n > 0 ? [{ token: e.spec!, n: e.n }] : [])) };
}

/** How many of this token `pid` really creates when an effect would create `n` (without any other tokens added). */
export function tokensToCreate(s: GameState, pid: PlayerId, token: TokenKind, n: number): number {
  return tokenBatch(s, pid, token, n).same;
}

/** Put counters on a permanent through those replacement effects; returns how many were put on. */
export function putCounters(s: GameState, o: GameObject, kind: string, n: number, entering = false): number {
  // A permanent entering with counters gets them from its controller, whoever's effect put it onto the battlefield
  // (rulings on Generous Patron and Vorinclex, Monstrous Raider).
  if (entering && putterNow !== undefined) return withPutter(undefined, () => putCounters(s, o, kind, n, entering));
  const m = countersToPut(s, o, kind, n, entering);
  if (m > 0) {
    o.counters[kind] = (o.counters[kind] ?? 0) + m;
    // Each counter of that kind gets a new timestamp (CR 613.7c); a keyword counter's matters in layer 6.
    if (keywordOfCounter(kind)) {
      (o.counterTimestamps ??= {})[kind] = s.nextTimestamp++;
      invalidateCharacteristics(s);
    }
    fireEvent(s, { type: "countersPut", id: o.id, counter: kind, amount: m, by: putterNow ?? controllerOf(s, o) });
  }
  return m;
}
