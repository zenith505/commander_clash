// Replacement effects on how many counters are put on a permanent or how many tokens are created
// (CR 614.1a, 616.1): Doubling Season, Hardened Scales, Parallel Lives, Xorn.

import type { CountMod, TokenSpec } from "./abilities";
import { PREDEFINED_TOKENS } from "./oracle/tokens";
import { CREATURE_TYPES } from "./keywords";
import { abilitiesOf } from "./cards";
import { controllerOf, characteristics, invalidateCharacteristics, keywordOfCounter } from "./layers";
import type { GameObject, GameState, ObjectId, PlayerId } from "./types";
import { opponents } from "./game";
import { fireEvent } from "./effects";

function modsInPlay(s: GameState): { mod: CountMod; controller: PlayerId; source: string; resolved?: true }[] {
  const out: { mod: CountMod; controller: PlayerId; source: string; resolved?: true }[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    for (const mod of abilitiesOf(s, o).countMods ?? []) out.push({ mod, controller: controllerOf(s, o), source: id });
  }
  // Kaya, Geist Hunter, Prairie Dog: those a resolved ability made for this turn (not a permanent's, so CR 614.12 doesn't
  // keep them off the permanent they came from as it enters).
  for (const x of s.turnCountMods ?? []) if (x.turn === s.turn) out.push({ mod: x.mod, controller: x.controller, source: x.source, resolved: true });
  return out;
}

/**
 * Who is putting counters on right now (Vorinclex's "if you would put ..."): the controller of the spell or ability
 * whose effect it is (set while an effect runs) or of the source dealing wither, infect or toxic damage. Unset, it's the
 * affected permanent's controller, as for a permanent entering with counters (rulings on Vorinclex, Monstrous Raider).
 * Only set for the length of one synchronous call, never kept in the game state.
 */
let putterNow: PlayerId | undefined;
/** While set, the counters being put come from a modular triggered ability (Zabaz, the Glimmerwasp). */
let modularNow = false;
export function withModular<T>(fn: () => T): T {
  const was = modularNow;
  modularNow = true;
  try {
    return fn();
  } finally {
    modularNow = was;
  }
}
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
  if (countersBanned(s, o, kind)) return 0;
  const owner = controllerOf(s, o);
  const putter = putterNow ?? owner;
  const { types, subtypes, allCreatureTypes } = characteristics(s, o);
  const isCreature = types.includes("Creature");
  const fits = (on: "creature" | "permanent" | "artifactOrCreature" | "creatureSpacecraftOrPlanet" | "creatureOrVehicle") => on === "permanent" || isCreature || (on === "artifactOrCreature" && types.includes("Artifact")) || (on === "creatureSpacecraftOrPlanet" && (subtypes.includes("Spacecraft") || subtypes.includes("Planet"))) || (on === "creatureOrVehicle" && subtypes.includes("Vehicle"));
  const ops = modsInPlay(s)
    .filter(({ mod, controller, source, resolved }) => {
      if (mod.what !== "counters" || "onPlayer" in mod) return false;
      if ("modular" in mod && mod.modular && !modularNow) return false;
      // Mowu, Loyal Companion: only on itself, as it enters too (it affects only that permanent, CR 614.12; rulings).
      if ("self" in mod && mod.self) return source === o.id && (mod.counter === undefined || mod.counter === kind);
      if (!resolved && (("other" in mod && mod.other) || entering) && source === o.id) return false;
      if ("putter" in mod && mod.putter)
        return putterFits(s, mod, controller, putter) && (mod.counter === undefined || mod.counter === kind) && (!mod.putOn || (owner === controller && (mod.putOn === "permanentYouControl" || isCreature || (mod.putOn !== "creatureYouControl" && types.includes("Planeswalker")))));
      return (mod.counter === undefined || mod.counter === kind) && fits(mod.on!) && (!mod.subtypes || mod.subtypes.some((st) => subtypes.includes(st) || (!!allCreatureTypes && CREATURE_TYPES.has(st)))) && (mod.who === "any" || controller === owner);
    })
    .map(({ mod }) => mod.op);
  return apply(n, ops, kind === "-1/-1" || kind === "stun");
}

/** How many `kind` counters (poison, energy) a player really gets when `n` would be put on them: only Vorinclex-style mods apply. */
export function playerCountersToPut(s: GameState, pid: PlayerId, kind: string, n: number): number {
  if (n <= 0) return n;
  if (playerCountersBanned(s)) return 0;
  // Suncleanser: "That player can't get counters for as long as ~ remains on the battlefield".
  if (counterBans(s).some((b) => b.player === pid)) return 0;
  // Melira, Sylvok Outcast: "You can't get poison counters" (the ones already there stay, rulings).
  if (kind === "poison" && s.battlefield.some((id) => abilitiesOf(s, s.objects[id]!).noPoisonForYou && controllerOf(s, s.objects[id]!) === pid)) return 0;
  // Melira, the Living Cure: once her replacement has applied this turn, no more (rulings).
  if (kind === "poison" && s.turnLog?.noMorePoison?.includes(pid)) return 0;
  const putter = putterNow ?? pid;
  const ops = modsInPlay(s)
    .filter(({ mod, controller }) => ("onPlayer" in mod && pid === controller && (!mod.counter || mod.counter === kind)) || ("putter" in mod && !!mod.putter && putterFits(s, mod, controller, putter) && (mod.counter === undefined || mod.counter === kind) && (!mod.putOn || (mod.putOn === "creatureOrPlaneswalkerYouControlOrYou" && pid === controller))))
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
  let m = playerCountersToPut(s, pid, kind, n);
  if (m <= 0) return 0;
  // Melira, the Living Cure: one poison counter instead, applied after the counter-doubling mods (the player getting them
  // orders the replacements, CR 616.1, and gets the fewest this way), then none more this turn.
  if (kind === "poison" && s.battlefield.some((id) => abilitiesOf(s, s.objects[id]!).onePoisonForYou && controllerOf(s, s.objects[id]!) === pid)) {
    m = 1;
    ((s.turnLog ??= {}).noMorePoison ??= []).push(pid);
  }
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
  /** Who creates them, under whose control they enter (Crafty Cutpurse can change it, tokenMaker): every caller creates them for this player. */
  pid: PlayerId;
  same: number;
  /** `copyOf`: tokens that are copies of that permanent instead (Esix, Mirrormind Crown; createExtraTokens). */
  extra: ({ token: TokenSpec; n: number; copyOf?: undefined; /** Created instead of all the others (Jinnie Fay). */ instead?: true } | { copyOf: ObjectId; n: number; token?: undefined })[];
}

/** A question about an optional token replacement (CountMod mayInstead): what `player` creates instead, if anything. */
export interface TokenQuestion {
  player: PlayerId;
  source: string;
  prompt: string;
  /** "none", then the index of each replacement result. */
  options: string[];
  labels: string[];
  /** The option a bot picks (tokenInsteadPick). */
  botChoice: string;
}

/**
 * The players' answers to the token replacement questions met while a resolving spell or ability runs one instruction
 * (resolve.ts runAsking, like the damage shields' in damage.ts): the instruction runs again from its start once each
 * answer is in, `used` of them taken so far. Null elsewhere: the choice is made the way a bot makes it.
 */
let tokenAnswers: { answers: string[]; used: number; ask?: TokenQuestion } | null = null;

/** Thrown out of a resolving instruction that needs a player's answer about a token replacement (CR 616.1). */
export class TokenQuestionPause extends Error {}

/** Run `fn` with these answers for the token replacement questions; null runs it without asking. */
export function withTokenAnswers<T>(answers: string[] | null, fn: (asked: () => TokenQuestion | undefined) => T): T {
  const outer = tokenAnswers;
  const mine: typeof tokenAnswers = answers ? { answers, used: 0 } : null;
  tokenAnswers = mine;
  try {
    return fn(() => mine?.ask);
  } finally {
    tokenAnswers = outer;
  }
}

/** The optional token replacements on the battlefield (CountMod mayInstead), with their sources. */
function mayInsteads(s: GameState): { mod: Extract<CountMod, { op: "mayInstead" }>; o: GameObject; controller: PlayerId }[] {
  const out: { mod: Extract<CountMod, { op: "mayInstead" }>; o: GameObject; controller: PlayerId }[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    for (const mod of abilitiesOf(s, o).countMods ?? []) if (mod.what === "tokens" && mod.op === "mayInstead") out.push({ mod, o, controller: controllerOf(s, o) });
  }
  return out;
}

/** Could a token creation now meet an optional replacement (so a resolving instruction must be able to stop and ask)? */
export function tokenChoicesPossible(s: GameState): boolean {
  const had = s.turnLog?.tokenEvents ?? [];
  // Crafty Cutpurse: two players' effects this turn can make the would-be controller choose (tokenMaker).
  if (new Set(liveSteals(s).map((x) => x.player)).size > 1) return true;
  return mayInsteads(s).some(({ mod, controller }) => !mod.first || !had.includes(controller));
}

/** This turn's Crafty Cutpurse effects of players still in the game (CR 800.4a: a player who left controls nothing). */
const liveSteals = (s: GameState) => (s.turnLog?.tokenSteals ?? []).filter((x) => !s.players[x.player]?.lost);

/**
 * Crafty Cutpurse (round 394): "each token that would be created under an opponent's control this turn is created under
 * your control instead". Such an effect changes under whose control the tokens enter, so it applies before every other
 * replacement of the event (CR 616.1b): the token doublers and the like of the player who now creates them apply after
 * it, an opponent's not at all (rulings: "if an opponent controls Anointed Procession, your Crafty Cutpurse's effect
 * applies before that of Anointed Procession and you won't get twice as many tokens"). The player who creates a token
 * owns it (CR 111.2). With several players' effects, the would-be controller chooses one to apply, then the new would-be
 * controller among the rest, and so on, each effect applying once (CR 616.1, 616.1f; rulings): so a player's own effect
 * can bring the tokens back to them. A real choice (the outcomes differ) is asked like Jinnie Fay's (TokenQuestion);
 * `probe` and bots take the first option.
 */
export function tokenMaker(s: GameState, pid: PlayerId, probe = false): PlayerId {
  const steals = liveSteals(s);
  if (!steals.length) return pid;
  // Where the tokens end up from `cur`, with the effects not yet `used`, always taking the first that applies.
  const applicable = (cur: PlayerId, used: number[]) => steals.flatMap((x, i) => (!used.includes(i) && x.player !== cur && opponents(s, x.player).includes(cur) ? [i] : []));
  const settle = (cur: PlayerId, used: number[]): PlayerId => {
    const next = applicable(cur, used)[0];
    return next === undefined ? cur : settle(steals[next]!.player, [...used, next]);
  };
  let cur = pid;
  const used: number[] = [];
  for (let at = applicable(cur, used); at.length; at = applicable(cur, used)) {
    let pick = at[0]!;
    const ends = at.map((i) => settle(steals[i]!.player, [...used, i]));
    if (!probe && new Set(ends).size > 1) {
      const name = (p: PlayerId) => s.players[p]!.name;
      const q: TokenQuestion = {
        player: cur,
        source: [...new Set(at.map((i) => steals[i]!.source))].join(" and "),
        prompt: "tokens you would create are created under another player's control instead: whose effect applies first?",
        options: at.map(String),
        labels: at.map((i, k) => `${name(steals[i]!.player)}'s ${steals[i]!.source} (they end up under ${name(ends[k]!)}'s control)`),
        botChoice: String(at[0]),
      };
      const ask = tokenAnswers;
      let answer: string;
      if (!ask) answer = q.botChoice;
      else if (ask.used < ask.answers.length) answer = ask.answers[ask.used++]!;
      else {
        ask.ask = q;
        throw new TokenQuestionPause(q.prompt);
      }
      if (q.options.includes(answer)) pick = Number(answer);
    }
    used.push(pick);
    cur = steals[pick]!.player;
  }
  return cur;
}

/** What a token or a copy of a permanent is worth to a bot, roughly (tokenInsteadPick). */
function tokenWorth(s: GameState, pid: PlayerId, x: { token: TokenSpec } | { copyOf: ObjectId }, n: number): number {
  if ("token" in x) {
    const t = x.token;
    // A card a token copy is made of has its power and toughness as text.
    const one = t.types.includes("Creature") ? (Number(t.power) || 0) + (Number(t.toughness) || 0) + (t.keywords?.length ?? 0) + (t.abilities ? 1 : 0) : 2;
    return one * n;
  }
  const o = s.objects[x.copyOf]!;
  const c = characteristics(s, o);
  const d = o.isToken ? undefined : s.cards[o.cardId];
  const one = Math.max(c.types.includes("Creature") ? (Number(c.power) || 0) + (Number(c.toughness) || 0) : 0, 2 * (d?.cmc ?? 1));
  // Only one of a legendary permanent's copies stays (CR 704.5j), none if it already has one by that name.
  if (c.supertypes.includes("Legendary")) return s.battlefield.some((id) => id !== o.id && controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === c.name) || controllerOf(s, o) === pid ? 0 : one;
  return one * n;
}

const COLOR_WORD: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
const tokenWords = (t: TokenSpec) => `${t.power !== undefined ? `${t.power}/${t.toughness} ` : ""}${t.colors.length ? `${t.colors.map((c) => COLOR_WORD[c]).join(" and ")} ` : ""}${t.name}${t.types.includes("Creature") && t.power !== undefined ? " creature" : ""}`;

/**
 * The optional replacements of `pid` creating these tokens now (CountMod mayInstead), asked once for the whole event
 * after the replacements that change how many are created (so "that many" is all of them), each option one of them
 * applied. `first`: whether this is the first time `pid` would create tokens this turn. Each applies once to the event
 * (CR 616.1), and the "first time" ones are used up whether or not they apply (rulings on Moonlit Meditation and Esix).
 */
function applyMayInstead(s: GameState, pid: PlayerId, entries: { kind: TokenKind; spec?: TokenSpec; n: number }[], first: boolean): TokenBatch | undefined {
  const total = entries.reduce((a, e) => a + e.n, 0);
  if (total <= 0) return undefined;
  type Result = { token: TokenSpec } | { copyOf: ObjectId };
  const results: { label: string; result: Result; source: string }[] = [];
  const pl = total === 1 ? "" : "s";
  for (const { mod, o, controller } of mayInsteads(s)) {
    if (controller !== pid) continue;
    if (mod.first && (!first || (mod.first === "yourTurn" && s.activePlayer !== pid))) continue;
    const name = characteristics(s, o).name;
    for (const t of mod.tokens ?? []) results.push({ label: `${total} ${tokenWords(t)} token${pl}${t.keywords.length ? ` with ${t.keywords.join(", ").toLowerCase()}` : ""}`, result: { token: t }, source: name });
    if (mod.copy === "host") {
      const host = o.attachedTo !== undefined ? s.objects[o.attachedTo] : undefined;
      if (host?.zone === "battlefield" && (!mod.hostCreature || characteristics(s, host).types.includes("Creature"))) results.push({ label: `${total} token${pl} that ${total === 1 ? "is a copy" : "are copies"} of ${characteristics(s, host).name}`, result: { copyOf: host.id }, source: name });
    }
    if (mod.copy === "chosen")
      for (const id of s.battlefield) {
        const c = s.objects[id]!;
        if (c.id === o.id || !characteristics(s, c).types.includes("Creature")) continue;
        const whose = controllerOf(s, c) === pid ? "" : ` (${s.players[controllerOf(s, c)]!.name}'s)`;
        results.push({ label: `${total} token${pl} that ${total === 1 ? "is a copy" : "are copies"} of ${characteristics(s, c).name}${whose}`, result: { copyOf: c.id }, source: name });
      }
  }
  if (!results.length) return undefined;
  const what = entries.filter((e) => e.n > 0).map((e) => `${e.n} ${"name" in e.kind && typeof e.kind.name === "string" ? e.kind.name.replace(/ Token$/, "") : "other"} token${e.n === 1 ? "" : "s"}`).join(" and ");
  const sources = [...new Set(results.map((r) => r.source))];
  const original = entries.reduce((a, e) => a + (e.n > 0 ? tokenWorth(s, pid, { token: e.spec ?? (e.kind as TokenSpec) }, e.n) : 0), 0);
  const worths = results.map((r) => tokenWorth(s, pid, r.result, total));
  const best = worths.reduce((b, w, i) => (w > (b < 0 ? original : worths[b]!) ? i : b), -1);
  const q: TokenQuestion = {
    player: pid,
    source: sources.join(" and "),
    prompt: `you would create ${what}. Create ${total === 1 ? "another token" : "other tokens"} instead?`,
    options: ["none", ...results.map((_, i) => String(i))],
    labels: [`No, create the ${what}`, ...results.map((r) => `Create ${r.label}`)],
    botChoice: best < 0 ? "none" : String(best),
  };
  let pick: string;
  const ask = tokenAnswers;
  if (!ask) pick = q.botChoice;
  else if (ask.used < ask.answers.length) pick = ask.answers[ask.used++]!;
  else {
    ask.ask = q;
    throw new TokenQuestionPause(q.prompt);
  }
  if (pick === "none" || !q.options.includes(pick)) return undefined;
  const chosen = results[Number(pick)]!;
  return { pid, same: 0, extra: ["token" in chosen.result ? { token: chosen.result.token, n: total, instead: true as const } : { copyOf: chosen.result.copyOf, n: total }] };
}

/**
 * What `pid` really creates when an effect would create `n` of this token (CR 614.1a). The player creating them orders
 * the replacements (CR 616.1), each applying once to the event as it then is; this order gives the most tokens: the
 * ones adding a token (Xorn, Peregrin Took), then a token for each of a kind (Bilbo), then Academy Manufactor's one of
 * each (two Manufactors make three of each, rulings), then a token for each token (Chatterfang), then the doublers, then
 * Divine Visitation's Angels.
 */
export function tokenBatch(s: GameState, pid0: PlayerId, token: TokenKind, n: number, /** Only how many: not the event itself (no optional replacement is asked about or used up). */ probe = false): TokenBatch {
  // Crafty Cutpurse first (CR 616.1b): then everything else is about the player who now creates them.
  const pid = n > 0 ? tokenMaker(s, pid0, probe) : pid0;
  // "The first time you would create one or more tokens each turn" (Moonlit Meditation): every such event counts, whether
  // or not something replaced it (rulings).
  let first = false;
  if (!probe && n > 0) {
    const had = ((s.turnLog ??= {}).tokenEvents ??= []);
    first = !had.includes(pid);
    if (first) had.push(pid);
  }
  const mods = modsInPlay(s).flatMap(({ mod, controller }) => (mod.what === "tokens" && mod.op !== "mayInstead" && (mod.who === "any" || controller === pid) ? [mod] : []));
  if (n <= 0) return { pid, same: n, extra: [] };
  if (!mods.length) return (!probe && applyMayInstead(s, pid, [{ kind: token, n }], first)) || { pid, same: n, extra: [] };
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
      // Fisher's Talent: by subtype ("a Fish token").
      const of = live().filter((e) => ("subtype" in m ? e.kind.subtypes.includes(m.subtype) : e.kind.types.includes(m.type)) && JSON.stringify(e.spec) !== JSON.stringify(m.token));
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
  // Jinnie Fay, Esix: optional, chosen last, for all of them (see applyMayInstead).
  const instead = !probe && applyMayInstead(s, pid, entries, first);
  if (instead) return instead;
  return { pid, same: entries[0]!.n, extra: entries.slice(1).flatMap((e) => (e.n > 0 ? [{ token: e.spec!, n: e.n }] : [])) };
}

/** How many of this token `pid` really creates when an effect would create `n` (without any other tokens added). */
export function tokensToCreate(s: GameState, pid: PlayerId, token: TokenKind, n: number): number {
  return tokenBatch(s, pid, token, n, true).same;
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
    // "If you put a counter on a creature this turn" (Lasting Tarfire): whoever put them (CR 122.6, 120.3d).
    if (o.zone === "battlefield" && characteristics(s, o).types.includes("Creature") && !(s.turnLog?.creatureCounterPutters ?? []).includes(by)) {
      ((s.turnLog ??= {}).creatureCounterPutters ??= []).push(by);
      invalidateCharacteristics(s);
    }
    // Fractal Tender: "if you put a counter on ~ this turn", any kind, on which object.
    if (o.zone === "battlefield") {
      const key = `${by}:${o.id}@${o.zoneChanges ?? 0}`;
      if (!(s.turnLog?.counterPutOn ?? []).includes(key)) ((s.turnLog ??= {}).counterPutOn ??= []).push(key);
    }
    // "During any turn you put a lore counter on ~" (Summon: Brynhildr): who put one on which object.
    if (kind === "lore" && o.zone === "battlefield") {
      const key = `${by}:${o.id}@${o.zoneChanges ?? 0}`;
      if (!(s.turnLog?.lorePut ?? []).includes(key)) ((s.turnLog ??= {}).lorePut ??= []).push(key);
    }
    if (kind === "+1/+1" && o.zone === "battlefield") {
      ((s.turnLog ??= {}).plusOnes ??= []).push({ by, controller: controllerOf(s, o), creature: characteristics(s, o).types.includes("Creature"), id: o.id, zc: o.zoneChanges ?? 0, n: m });
      invalidateCharacteristics(s); // "as long as you've put one or more +1/+1 counters on a creature this turn"
    }
    fireEvent(s, { type: "countersPut", id: o.id, counter: kind, amount: m, by });
  }
  return m;
}

/** While set, counter removals happening at the same time, gathered into one event each (see batchCountersRemoved). */
let removedBatch: { id: ObjectId; counter: string; n: number }[] | null = null;

/**
 * `n` counters of kind `counter` were just removed from `o` (CR 122): "whenever a +1/+1 counter is removed from ~", for any
 * reason (Protean Hydra's rulings: an effect, a cost, damage it prevents, +1/+1 and -1/-1 counters cancelling out, CR
 * 704.5q, or a counter moved off it, CR 122.5), and "whenever one or more loyalty counters are removed from ~" (Chandra,
 * Fire Artisan: damage, a loyalty cost or an effect). An object leaving the battlefield doesn't lose its counters this way
 * (CR 122.2, Chandra's rulings).
 */
export function countersRemoved(s: GameState, o: GameObject, counter: string, n: number): void {
  if (n <= 0) return;
  // Churning Reservoir: "if an oil counter was removed from a permanent you controlled this turn": its controller then.
  if (counter === "oil" && o.zone === "battlefield") {
    const by = controllerOf(s, o);
    const list = ((s.turnLog ??= {}).oilRemoved ??= []);
    if (!list.includes(by)) list.push(by);
  }
  if (removedBatch) {
    const x = removedBatch.find((r) => r.id === o.id && r.counter === counter);
    if (x) x.n += n;
    else removedBatch.push({ id: o.id, counter, n });
    return;
  }
  fireEvent(s, { type: "countersRemoved", id: o.id, counter, n });
}

/**
 * Counters removed during `fn` are removed at the same time: damage dealt at once removes them in one event, so several
 * creatures dealing combat damage to Chandra, Fire Artisan at the same time trigger her once (rulings, CR 120.3c, 510.2).
 */
export function batchCountersRemoved<T>(s: GameState, fn: () => T): T {
  const outer = removedBatch;
  const mine: { id: ObjectId; counter: string; n: number }[] = [];
  removedBatch = mine;
  let out: T;
  try {
    out = fn();
  } finally {
    removedBatch = outer;
  }
  for (const r of mine) {
    const o = s.objects[r.id];
    if (o) countersRemoved(s, o, r.counter, r.n);
  }
  return out;
}

/**
 * Solemnity: "Counters can't be put on artifacts, creatures, enchantments, or lands." A permanent with one of those card
 * types gets none: as it enters, from an effect, or as a cost, which then can't be paid (rulings). Cards elsewhere still
 * do (suspend's time counters).
 */
export function countersBanned(s: GameState, o: GameObject, kind?: string): boolean {
  if (o.zone !== "battlefield") return false;
  const types = characteristics(s, o).types;
  if (s.battlefield.some((id) => abilitiesOf(s, s.objects[id]!).noCountersOn?.some((t) => types.includes(t)))) return true;
  // Tatterkite: "~ can't have counters put on it": none of any kind, by an effect, as a cost or as it enters (rulings).
  if (abilitiesOf(s, o).selfNoCounters) return true;
  // Blossombind: "Enchanted creature ... can't have counters put on it", from the layers (CR 613.1f).
  if (characteristics(s, o).cantHaveCounters) return true;
  // Suncleanser: "It can't have counters put on it for as long as ~ remains on the battlefield".
  if (counterBans(s).some((b) => b.id === o.id && b.objZc === (o.zoneChanges ?? 0))) return true;
  // Blightbeetle: "Creatures your opponents control can't have +1/+1 counters put on them." The ones already there stay;
  // one entering with them gets none, and a cost putting them can't be paid (rulings).
  if (kind === undefined || !types.includes("Creature")) return false;
  const pid = controllerOf(s, o);
  // Melira, Sylvok Outcast: "Creatures you control can't have -1/-1 counters put on them": the same for its controller's
  // (the ones already there stay, rulings).
  return s.battlefield.some((id) => (abilitiesOf(s, s.objects[id]!).opponentsCreaturesNoCounters === kind && controllerOf(s, s.objects[id]!) !== pid) || (abilitiesOf(s, s.objects[id]!).yourCreaturesNoCounters === kind && controllerOf(s, s.objects[id]!) === pid));
}

/** Suncleanser's bans whose source is still on the battlefield as the object that made them (CR 611.2b). */
const counterBans = (s: GameState) => s.battlefield.flatMap((id) => (s.objects[id]!.bansCounters ?? []).filter((b) => b.zc === (s.objects[id]!.zoneChanges ?? 0)));

/**
 * Blight N (CR 701.68a): the creatures `pid` controls that can have the -1/-1 counters put on them; none means they
 * can't choose to blight (701.68b). The counters all go on one of them (rulings).
 */
export function blightOptions(s: GameState, pid: PlayerId, _n: number): ObjectId[] {
  return s.battlefield.filter((id) => {
    const o = s.objects[id]!;
    return controllerOf(s, o) === pid && characteristics(s, o).types.includes("Creature") && !countersBanned(s, o, "-1/-1");
  });
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
