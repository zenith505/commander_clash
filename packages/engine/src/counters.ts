// Replacement effects on how many counters are put on a permanent or how many tokens are created
// (CR 614.1a, 616.1): Doubling Season, Hardened Scales, Parallel Lives, Xorn.

import type { CountMod, TokenSpec } from "./abilities";
import { PREDEFINED_TOKENS } from "./oracle/tokens";
import { CREATURE_TYPES } from "./keywords";
import { abilitiesOf } from "./cards";
import { controllerOf, characteristics, invalidateCharacteristics, keywordOfCounter } from "./layers";
import type { GameObject, GameState, PlayerId } from "./types";
import { opponents } from "./game";
import { fireEvent } from "./effects";

function modsInPlay(s: GameState): { mod: CountMod; controller: PlayerId; source: string }[] {
  const out: { mod: CountMod; controller: PlayerId; source: string }[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    for (const mod of abilitiesOf(s, o).countMods ?? []) out.push({ mod, controller: controllerOf(s, o), source: id });
  }
  // Kaya, Geist Hunter: those a resolved ability made for this turn.
  for (const x of s.turnCountMods ?? []) if (x.turn === s.turn) out.push({ mod: x.mod, controller: x.controller, source: x.source });
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
  if (countersBanned(s, o)) return 0;
  const owner = controllerOf(s, o);
  const putter = putterNow ?? owner;
  const { types, subtypes, allCreatureTypes } = characteristics(s, o);
  const isCreature = types.includes("Creature");
  const fits = (on: "creature" | "permanent" | "artifactOrCreature" | "creatureSpacecraftOrPlanet") => on === "permanent" || isCreature || (on === "artifactOrCreature" && types.includes("Artifact")) || (on === "creatureSpacecraftOrPlanet" && (subtypes.includes("Spacecraft") || subtypes.includes("Planet")));
  const ops = modsInPlay(s)
    .filter(({ mod, controller, source }) => {
      if (mod.what !== "counters" || "onPlayer" in mod || ((("other" in mod && mod.other) || entering) && source === o.id)) return false;
      if ("putter" in mod && mod.putter) return putterFits(s, mod, controller, putter) && (!mod.putOn || (owner === controller && (mod.putOn === "permanentYouControl" || isCreature || types.includes("Planeswalker"))));
      return (mod.counter === undefined || mod.counter === kind) && fits(mod.on!) && (!mod.subtypes || mod.subtypes.some((st) => subtypes.includes(st) || (!!allCreatureTypes && CREATURE_TYPES.has(st)))) && (mod.who === "any" || controller === owner);
    })
    .map(({ mod }) => mod.op);
  return apply(n, ops, kind === "-1/-1" || kind === "stun");
}

/** How many `kind` counters (poison, energy) a player really gets when `n` would be put on them: only Vorinclex-style mods apply. */
export function playerCountersToPut(s: GameState, pid: PlayerId, kind: string, n: number): number {
  if (n <= 0) return n;
  if (playerCountersBanned(s)) return 0;
  const putter = putterNow ?? pid;
  const ops = modsInPlay(s)
    .filter(({ mod, controller }) => ("onPlayer" in mod && pid === controller) || ("putter" in mod && !!mod.putter && putterFits(s, mod, controller, putter) && (!mod.putOn || (mod.putOn === "creatureOrPlaneswalkerYouControlOrYou" && pid === controller))))
    .map(({ mod }) => mod.op);
  return apply(n, ops, kind === "poison" || kind === "rad");
}

/**
 * While set, the counters put on players at the same time (by combat damage from several sources with infect or toxic),
 * keyed "player|putter|kind": one event for them all (rulings on All Will Be One).
 */
let playerCounterBatch: Map<string, number> | null = null;
export function batchPlayerCounters<T>(s: GameState, fn: () => T): T {
  const outer = playerCounterBatch;
  playerCounterBatch = new Map();
  let out: T;
  const batch = playerCounterBatch;
  try {
    out = fn();
  } finally {
    playerCounterBatch = outer;
  }
  for (const [key, amount] of batch) {
    const [player, by, counter] = key.split("|") as [string, string, string];
    fireEvent(s, { type: "playerCountersPut", player: Number(player), counter, amount, by: Number(by) });
  }
  return out;
}

/**
 * Put `n` poison, energy or experience counters on a player through Vorinclex-style mods (playerCountersToPut); returns how many were
 * put on. "Whenever you put one or more counters on a ... player" sees who put them (CR 122.6).
 */
export function putPlayerCounters(s: GameState, pid: PlayerId, kind: "poison" | "energy" | "experience" | "rad", n: number): number {
  const m = playerCountersToPut(s, pid, kind, n);
  if (m <= 0) return 0;
  const p = s.players.find((x) => x.id === pid)!;
  p[kind] = (p[kind] ?? 0) + m;
  const by = putterNow ?? pid;
  if (playerCounterBatch) playerCounterBatch.set(`${pid}|${by}|${kind}`, (playerCounterBatch.get(`${pid}|${by}|${kind}`) ?? 0) + m);
  else fireEvent(s, { type: "playerCountersPut", player: pid, counter: kind, amount: m, by });
  return m;
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
 * each (two Manufactors make three of each, rulings), then a token for each token (Chatterfang), then the doublers, then
 * Divine Visitation's Angels.
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
  // Divine Visitation last, so every creature token, the ones other replacements added too, becomes an Angel. Each applies
  // once, whenever it applies (CR 616.1e): Draconic Visitor's Dragon then becomes an Angel too.
  const insteads = mods.filter((m) => m.op === "instead");
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of [...insteads]) {
      const of = live().filter((e) => e.kind.types.includes(m.type) && JSON.stringify(e.spec) !== JSON.stringify(m.token));
      if (!of.length) continue;
      insteads.splice(insteads.indexOf(m), 1);
      for (const e of of) {
        const k = e.n;
        e.n = 0;
        add(m.token, k);
      }
      changed = true;
    }
  }
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
    const by = putterNow ?? controllerOf(s, o);
    if (kind === "+1/+1" && o.zone === "battlefield") {
      ((s.turnLog ??= {}).plusOnes ??= []).push({ by, controller: controllerOf(s, o), creature: characteristics(s, o).types.includes("Creature"), id: o.id, zc: o.zoneChanges ?? 0, n: m });
      invalidateCharacteristics(s); // "as long as you've put one or more +1/+1 counters on a creature this turn"
    }
    fireEvent(s, { type: "countersPut", id: o.id, counter: kind, amount: m, by });
  }
  return m;
}

/**
 * Solemnity: "Counters can't be put on artifacts, creatures, enchantments, or lands." A permanent with one of those card
 * types gets none: as it enters, from an effect, or as a cost, which then can't be paid (rulings). Cards elsewhere still
 * do (suspend's time counters).
 */
export function countersBanned(s: GameState, o: GameObject): boolean {
  if (o.zone !== "battlefield") return false;
  const types = characteristics(s, o).types;
  return s.battlefield.some((id) => abilitiesOf(s, s.objects[id]!).noCountersOn?.some((t) => types.includes(t)));
}

/** Solemnity: "Players can't get counters." No poison (infect damage then does nothing to a player), energy, experience or rad counters (rulings). */
export const playerCountersBanned = (s: GameState): boolean => s.battlefield.some((id) => abilitiesOf(s, s.objects[id]!).noPlayerCounters);

/**
 * Whether counters of `kind` can't be removed from `o` now: "Stun counters can't be removed from permanents your
 * opponents control" (Fear of Sleep Paralysis). They can't be moved off it either, and an untap they'd replace does
 * nothing (rulings).
 */
export function countersStay(s: GameState, o: GameObject, kind: string): boolean {
  if (o.zone !== "battlefield") return false;
  const pid = controllerOf(s, o);
  return s.battlefield.some((id) => {
    const x = s.objects[id]!;
    return abilitiesOf(s, x).opponentsCountersStay === kind && opponents(s, controllerOf(s, x)).includes(pid);
  });
}

/** How many counters of `kind` could be removed from `o` now (none that `countersStay`). */
export const removableCounters = (s: GameState, o: GameObject, kind: string): number => (countersStay(s, o, kind) ? 0 : Math.max(0, o.counters[kind] ?? 0));
