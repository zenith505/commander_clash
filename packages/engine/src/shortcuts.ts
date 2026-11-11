import { planActivate, planCast } from "./autopay";
import { applyInPlace, cloneState, log, player, waitingOn } from "./game";
import { RulesError, type Action, type GameEvent, type GameState, type ObjectId, type PlayerId, type TurnLog } from "./types";

// Loops (CR 732). A player with priority may propose a shortcut: the game choices of one pass through a loop, for every
// player, repeated a number of times (732.2a). Each other player accepts or shortens it to the point where they'd
// choose differently (732.2b), and the game skips ahead to that point (732.2c). A loop of mandatory actions that no
// one breaks is a draw (104.4b, 732.4).

// ---------------------------------------------------------------------------
// Shortcuts (CR 732.2)

export interface ShortcutResult {
  state: GameState;
  /** How many more times the loop went round. */
  repeated: number;
  /** The player who shortened it (CR 732.2b): it stopped where they make a different choice, which they make now (732.2c). */
  stoppedBy?: PlayerId;
  /**
   * Why it stopped short otherwise: the loop doesn't go round the same way anymore, so it couldn't have been proposed
   * further (732.2a). It stops at the last place the proposer had priority before that.
   */
  problem?: string;
}

/**
 * What a player other than the proposer would do now (for a bot, `botActions`). A choice that differs from the proposed
 * one shortens the shortcut to this point (CR 732.2b).
 */
export type ShortcutChooser = (s: GameState, pid: PlayerId) => Action[];

/**
 * Repeat a loop `times` more times (CR 732.2). `start` is where the loop began and `body` every player's choices from
 * there, once round the loop, ending where `proposer` has priority again. The body is replayed: the same objects
 * stay the same, and an object the loop makes (a token, a triggered ability) stands for the matching object the next
 * time round, so "sacrifice the token it just made" keeps meaning the newest one. Each round, every choice the
 * proposal makes for another player is checked against what that player would do; the first difference stops the
 * shortcut there. Throws a RulesError if `body` isn't a legal way round from `start`.
 */
export function takeShortcut(start: GameState, body: Action[], times: number, proposer: PlayerId, choose: ShortcutChooser): ShortcutResult {
  if (start.pending || waitingOn(start) !== proposer) throw new RulesError("a shortcut starts where you have priority (CR 732.2a)");
  if (!body.length) throw new RulesError("there's no loop to repeat yet");
  // The round already played, again, to learn what it made (the game is deterministic from a state).
  let round = new Round(start);
  for (const a of body) round.apply(a);
  let cur = round.s;
  if (cur.over || cur.pending || waitingOn(cur) !== proposer) throw new RulesError("a loop has to end where you have priority again (CR 732.2a)");
  const base = cur.log.length;
  const result: ShortcutResult = { state: cur, repeated: 0 };
  let partialFrom = -1;
  while (result.repeated < times) {
    const prev = round;
    const backup = cloneState(cur);
    round = new Round(cur, prev);
    let failed: string | undefined;
    const mark = cur.log.length;
    /** How far into this round the proposer last had priority: where the shortcut can still end (CR 732.2a). */
    let lastPoint = 0;
    const apply = (a: Action) => {
      round.apply(a);
      if (!cur.over && !cur.pending && !cur.triggerQueue.length && waitingOn(cur) === proposer) lastPoint = round.done.length;
    };
    try {
      for (let i = 0; i < prev.done.length; ) {
        const a = prev.done[i]!;
        // A player who has left the game makes no more choices (CR 800.4a).
        if (player(cur, a.player).lost) {
          i++;
          continue;
        }
        if (waitingOn(cur) !== a.player) throw new LoopChanged(`it's ${player(cur, waitingOn(cur)!).name}'s choice where ${player(cur, a.player).name} chose before`);
        if (a.player === proposer && a.type === "activateMana" && paidFor(prev.done, i, proposer) !== undefined) {
          // Mana for a spell or ability: the same sources if they can pay again, otherwise whatever pays now (in paper,
          // "I activate it ten times" doesn't name the lands tapped each time).
          const end = paidFor(prev.done, i, proposer)!;
          const group = prev.done.slice(i, end + 1).map((x) => round.translate(x));
          for (const x of canPay(cur, group.slice(0, -1)) ? group : repay(cur, group.at(-1)!)) apply(x);
          i = end + 1;
        } else if (a.player === proposer) {
          apply(round.translate(a));
          i++;
        } else {
          // The proposal's choices for this player, as many as they'd make in one go.
          const theirs = choose(cur, a.player);
          const proposed = prev.done.slice(i, i + theirs.length).map((x) => round.translate(x));
          if (!theirs.length || !sameActions(theirs, proposed)) {
            result.stoppedBy = a.player;
            break;
          }
          for (const x of proposed) apply(x);
          i += proposed.length;
        }
        if (cur.over) break;
      }
      if (result.stoppedBy === undefined && !cur.over && (cur.pending || waitingOn(cur) !== proposer)) throw new LoopChanged("it didn't come back round to you");
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      failed = e.message;
    }
    if (failed !== undefined) {
      // That round didn't go round the same way, so the shortcut could only have proposed going as far as the last
      // place in it where the proposer had priority.
      result.problem = failed;
      const taken = round.done.slice(0, lastPoint);
      cur = backup;
      for (const a of taken) applyInPlace(cur, a);
      partialFrom = mark;
      break;
    }
    if (result.stoppedBy !== undefined || cur.over) {
      partialFrom = mark;
      break;
    }
    result.repeated++;
  }
  // The log tells the shortcut, not every round of it, then anything after the last full round.
  const who = player(cur, proposer).name;
  const lines: string[] = [`${who} takes a shortcut: the loop goes round ${result.repeated} more time${result.repeated === 1 ? "" : "s"} (CR 732.2).`];
  if (result.stoppedBy !== undefined) lines.push(`${player(cur, result.stoppedBy).name} shortens the shortcut there, to do something else (CR 732.2b).`);
  if (result.problem) lines.push(`The loop can't go round again the same way: ${result.problem}.`);
  const after = partialFrom >= 0 ? cur.log.slice(partialFrom) : [];
  cur.log = cur.log.slice(0, base);
  for (const l of lines) log(cur, l);
  for (const e of after) cur.log.push({ ...e, seq: cur.log.length } as GameEvent);
  result.state = cur;
  return result;
}

class LoopChanged extends RulesError {}

/** If the proposer's mana abilities from `i` on pay for a spell or ability right after them, that action's index. */
function paidFor(body: Action[], i: number, proposer: PlayerId): number | undefined {
  let j = i;
  while (body[j]?.type === "activateMana" && body[j]!.player === proposer) j++;
  const main = body[j];
  return main && main.player === proposer && (main.type === "castSpell" || main.type === "activateAbility") ? j : undefined;
}

/** Can these mana abilities all be activated now? */
function canPay(s: GameState, mana: Action[]): boolean {
  const trial = cloneState(s);
  try {
    for (const a of mana) applyInPlace(trial, a);
    return true;
  } catch (e) {
    if (e instanceof RulesError) return false;
    throw e;
  }
}

/** A spell or ability with its mana paid from whatever can pay for it now. */
function repay(s: GameState, main: Action): Action[] {
  let plan: Action[] | null = null;
  if (main.type === "activateAbility") plan = planActivate(s, main.player, main.objectId, main.index, main.targets, main.modes, main.tapCreatures, main.x, main.costs);
  else if (main.type === "castSpell") {
    const { type: _t, player: pid, objectId, targets, modes, convoke, improvise: _i, x, ...choices } = main;
    plan = planCast(s, pid, objectId, targets, modes, convoke, x, choices);
  }
  if (!plan) throw new LoopChanged("there isn't the mana to pay for it again");
  return plan;
}

const idNumber = (id: string) => Number(/\d+$/.exec(id)?.[0] ?? -1);

/** Every id in a state (objects and stack items) with what kind of thing it is, so one round's can stand for the next's. */
function idsOf(s: GameState): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, o] of Object.entries(s.objects)) out.set(id, `o|${o.cardId}|${o.isToken ? 1 : 0}`);
  for (const item of s.stack) out.set(item.id, `s|${item.kind}|${item.sourceCardId ?? (item.objectId ? s.objects[item.objectId]?.cardId : "")}`);
  return out;
}

/** One time round a loop: the state it changes in place, what it made, and the actions it took. */
class Round {
  readonly s: GameState;
  /** The actions taken, as they were taken this round. */
  readonly done: Action[] = [];
  /** The ids that existed as this round began, with their kinds. */
  private readonly startIds: Map<string, string>;
  /** Every id seen so far this round. */
  private readonly seen: Map<string, string>;
  /** Ids made this round, in the order they appeared, by kind. */
  private readonly made = new Map<string, string[]>();
  /** For each id made this round: its kind and how many of that kind came before it. */
  private readonly madeIndex = new Map<string, { kind: string; n: number }>();
  /** Things the last round began with and used up, each standing for what that round made in its place. */
  private readonly replaced = new Map<string, string>();

  /** The first round copies `s`; each later one carries on in the same state as the round before it. */
  constructor(
    s: GameState,
    private readonly prev?: Round,
  ) {
    this.s = prev ? s : cloneState(s);
    this.startIds = idsOf(this.s);
    this.seen = new Map(this.startIds);
    if (!prev) return;
    // What the last round began with and is gone was replaced by what it made that's still here, kind by kind in
    // order: the token sacrificed last time round stands for the one made last time round.
    const gone = new Map<string, string[]>();
    for (const [id, kind] of prev.startIds) if (!this.startIds.has(id)) gone.set(kind, [...(gone.get(kind) ?? []), id]);
    for (const [kind, ids] of prev.made) {
      const left = ids.filter((id) => this.startIds.has(id));
      const old = (gone.get(kind) ?? []).sort((a, b) => idNumber(a) - idNumber(b));
      old.forEach((id, i) => {
        if (left[i] !== undefined) this.replaced.set(id, left[i]!);
      });
    }
  }

  apply(a: Action) {
    applyInPlace(this.s, a);
    this.done.push(a);
    const now = idsOf(this.s);
    for (const [id, kind] of [...now].sort((x, y) => idNumber(x[0]) - idNumber(y[0]))) {
      if (this.seen.has(id)) continue;
      const list = this.made.get(kind) ?? [];
      this.madeIndex.set(id, { kind, n: list.length });
      list.push(id);
      this.made.set(kind, list);
    }
    for (const [id, kind] of now) this.seen.set(id, kind);
  }

  /** The last round's action `a`, as it is this round. */
  translate(a: Action): Action {
    const prev = this.prev!;
    const mapId = (id: string): string => {
      const m = prev.madeIndex.get(id);
      if (m) {
        const now = this.made.get(m.kind)?.[m.n];
        if (!now) throw new LoopChanged("something it made last time round isn't there this time");
        return now;
      }
      return this.replaced.get(id) ?? id;
    };
    const known = (id: string) => prev.madeIndex.has(id) || this.replaced.has(id);
    const walk = (v: unknown): unknown => {
      if (typeof v === "string") return known(v) ? mapId(v) : v;
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        // A chosen object: the same object as it is now (a new zone made it a new object, CR 400.7).
        if (o.kind === "object" && typeof o.id === "string") {
          const id = mapId(o.id);
          const cur = this.s.objects[id];
          return { ...o, id, ...(o.zc !== undefined ? { zc: cur?.zoneChanges ?? 0 } : {}) };
        }
        return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
      }
      return v;
    };
    return walk(a) as Action;
  }
}

/** Two lists of actions are the same choices (ignoring key order and unset fields). */
function sameActions(a: Action[], b: Action[]): boolean {
  return a.length === b.length && a.every((x, i) => stable(x) === stable(b[i]));
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, y]) => y !== undefined).sort(([p], [q]) => (p < q ? -1 : 1))) : x,
  );
}

// ---------------------------------------------------------------------------
// Mandatory loops (CR 104.4b, 732.4)

/** Resolutions in a row with only passing before states are compared (cheap for ordinary play). */
const WATCH_AFTER = 6;
/** States remembered: a loop longer than this many resolutions is caught by MAX_UNBROKEN instead. */
const WATCH_SIZE = 400;
/**
 * Resolutions in a row in one step with no player doing anything but passing priority. Each one has to come from a
 * triggered ability, so a chain this long only happens in a loop that changes a number each time round (life, counters)
 * and never ends; no game of Commander has life totals that would let one end after this many.
 */
const MAX_UNBROKEN = 5000;

/**
 * After each action (`allPassed`: it was the last of a round of passes): a loop that repeats with every player only passing priority is a loop of mandatory actions, and
 * the game is a draw (CR 104.4b, 732.4). Any other choice (a spell, an ability, a target) starts the count again,
 * since a loop with an optional action isn't a draw (104.4b); no one is forced to break it either (732.5).
 */
export function watchForMandatoryLoop(s: GameState, action: Action, allPassed: boolean) {
  if (s.over) return;
  if (action.type !== "passPriority") {
    s.loopWatch = undefined;
    return;
  }
  // Only a full round of passing changes anything: the top of the stack resolved, or the step ended.
  if (!allPassed) return;
  const w = s.loopWatch;
  if (!w || w.turn !== s.turn || w.step !== s.step) {
    s.loopWatch = { turn: s.turn, step: s.step, resolutions: 1, seen: [] };
    return;
  }
  w.resolutions++;
  if (w.resolutions >= MAX_UNBROKEN) return drawByLoop(s);
  if (w.resolutions < WATCH_AFTER) return;
  const h = stateHash(s);
  if (w.seen.includes(h)) return drawByLoop(s);
  w.seen.push(h);
  if (w.seen.length > WATCH_SIZE) w.seen.shift();
}

function drawByLoop(s: GameState) {
  s.over = true;
  s.winner = null;
  s.pending = null;
  s.loopWatch = undefined;
  log(s, "The game is a draw: it's in a loop of mandatory actions that no one breaks (CR 104.4b, 732.4).");
}

/**
 * A hash of everything about the game that matters to what happens next, the same for two states that differ only in
 * names that don't matter: ids (a new triggered ability each time round), timestamps (only their order counts) and zone
 * change counts (only whether a remembered one is still current counts).
 */
export function stateHash(s: GameState): string {
  const labels = new Map<string, string>();
  const label = (id: string) => {
    if (!labels.has(id)) labels.set(id, `#${labels.size}`);
    return labels.get(id)!;
  };
  // Ids are labeled in the order the game shows them: zones in order, the stack, then whatever is left.
  for (const p of s.players) for (const z of [p.library, p.hand, p.graveyard, p.exile, p.command]) z.forEach(label);
  s.battlefield.forEach(label);
  for (const item of s.stack) {
    label(item.id);
    if (item.objectId) label(item.objectId);
  }
  s.effects.forEach((e) => label(e.id));
  Object.keys(s.objects)
    .sort((a, b) => idNumber(a) - idNumber(b))
    .forEach(label);
  const stamps = new Set<number>();
  for (const o of Object.values(s.objects)) stamps.add(o.timestamp);
  for (const e of s.effects) stamps.add(e.timestamp);
  const rank = new Map([...stamps].sort((a, b) => a - b).map((t, i) => [t, i]));
  const zcOf = (id: unknown) => (typeof id === "string" ? (s.objects[id]?.zoneChanges ?? 0) : 0);
  const SKIP = new Set(["log", "cards", "nextId", "nextTimestamp", "loopWatch", "zoneChanges"]);
  const walk = (v: unknown, owner?: ObjectId): unknown => {
    if (typeof v === "string") return labels.get(v) ?? v;
    if (Array.isArray(v)) return v.map((x) => walk(x, owner));
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const byId = Object.keys(o).length > 0 && Object.keys(o).every((k) => labels.has(k.split("@")[0]!));
    for (const k of Object.keys(o).sort()) {
      if (SKIP.has(k) || o[k] === undefined) continue;
      let x = o[k];
      // A remembered zone change count: whether it's still that object is all that matters (CR 400.7).
      if (k === "zc" && typeof x === "number") x = x - zcOf(o.id ?? owner);
      else if (k === "sourceZc" && typeof x === "number") x = x - zcOf(o.sourceId);
      else if (k === "timestamp" && typeof x === "number") x = rank.get(x) ?? x;
      if (byId) {
        // A record keyed by id ("o12", or "o12@3" with a zone change count): relabel the key, and what's inside is about it.
        const [id, zc] = k.split("@");
        out[`${label(id!)}${zc !== undefined ? `@${Number(zc) - zcOf(id)}` : ""}`] = walk(x, id);
      } else out[k] = walk(x, owner);
    }
    return byId ? Object.fromEntries(Object.entries(out).sort(([p], [q]) => (p < q ? -1 : 1))) : out;
  };
  return hash(JSON.stringify(walk({ ...s, turnLog: turnLogSummary(s, s.turnLog) })));
}

/**
 * What of the turn's log can still matter: the Traps count no higher than three (Ravenous Trap's "three or more cards"),
 * so a loop that keeps adding to it repeats once each count reaches that.
 */
const TURN_LOG_CAP = 3;
const LIFE_CAP = 5;
function turnLogSummary(s: GameState, t: TurnLog | undefined) {
  if (!t) return undefined;
  const capped = (r: Record<number, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.min(v, TURN_LOG_CAP)]));
  const entered: Record<string, number> = {};
  // Which object entered matters only for "another" (Éowyn): whether it is that object as it is now, not its zone count.
  for (const { id, zc, ...e } of t.entered ?? []) {
    const k = JSON.stringify({ ...e, ...(id !== undefined && (s.objects[id]?.zoneChanges ?? 0) === zc ? { now: id } : {}) });
    entered[k] = Math.min((entered[k] ?? 0) + 1, TURN_LOG_CAP);
  }
  return {
    searched: t.searched,
    unblockedDamage: t.unblockedDamage ? [...t.unblockedDamage].sort() : undefined,
    attackPower: t.attackPower,
    cantBecomeMonarch: t.cantBecomeMonarch,
    scried: t.scried,
    surveilled: t.surveilled,
    coinsFlipped: t.coinsFlipped,
    gainedLife: t.gainedLife,
    cardExiled: t.cardExiled,
    destroyed: [...new Set((t.destroyed ?? []).map((e) => JSON.stringify(e)))].sort(),
    creaturesCountered: [...new Set((t.creaturesCountered ?? []).map((e) => JSON.stringify(e)))].sort(),
    entered,
    // "For the first time each turn" (Hercules): once or more.
    timesDealtDamage: Object.fromEntries(Object.entries(t.timesDealtDamage ?? {}).map(([k, v]) => [k, Math.min(v, 2)])),
    damagedBy: capped(Object.fromEntries(Object.entries(t.damagedBy ?? {}).map(([k, v]) => [k, v.length]))),
    toGraveyard: capped(t.toGraveyard ?? {}),
    toGraveyardFromHandOrLibrary: capped(t.toGraveyardFromHandOrLibrary ?? {}),
    toGraveyardFromLibrary: capped(t.toGraveyardFromLibrary ?? {}),
    landPlayedNotFromHand: t.landPlayedNotFromHand,
    playedFromExile: t.playedFromExile,
    lorePut: t.lorePut ? [...t.lorePut].sort() : undefined,
    counterPutOn: t.counterPutOn ? [...t.counterPutOn].sort() : undefined,
    permanentToHand: t.permanentToHand,
    ownCreatureTargeted: t.ownCreatureTargeted,
    creatureCardLeftGraveyard: t.creatureCardLeftGraveyard,
    descended: capped(t.descended ?? {}),
    creaturesExiled: capped(t.creaturesExiled ?? {}),
    // Bonecache Overseer counts to three; Kutzil's Flanker counts as it enters, not in a loop of passing.
    leftGraveyardCount: capped((t.leftGraveyardCount ?? {}) as Record<number, number>),
    // Dimir Strandcatcher counts to three.
    toGraveyardNotBattlefield: capped((t.toGraveyardNotBattlefield ?? {}) as Record<number, number>),
    activatedInGraveyard: t.activatedInGraveyard,
    oilRemoved: t.oilRemoved ? [...t.oilRemoved].sort() : undefined,
    oilPermanentToGraveyard: t.oilPermanentToGraveyard,
    noMorePoison: t.noMorePoison ? [...t.noMorePoison].sort() : undefined,
    creaturesLeft: capped((t.creaturesLeft ?? {}) as Record<number, number>),
    creaturesToYard: capped((t.creaturesToYard ?? []).reduce<Record<string, number>>((r, d) => ((r[`${d.owner}${d.token ? "t" : ""}`] = (r[`${d.owner}${d.token ? "t" : ""}`] ?? 0) + 1), r), {})),
    permanentTypesToYard: t.permanentTypesToYard,
    controlledTypesToYard: t.controlledTypesToYard,
    artifactsToYard: Math.min(t.artifactsToYard ?? 0, TURN_LOG_CAP),
    // The Cases count to three (sources, creature cards) and to 5 life.
    toGraveyardTypes: capped(t.toGraveyardTypes ?? {}),
    diedDamaged: Math.min(t.diedDamaged?.length ?? 0, TURN_LOG_CAP),
    // The most damage one source dealt counts to 5 (Dragon Cultist).
    // Vessel of the All-Consuming counts to 10.
    sourceToPlayer: Object.fromEntries(Object.entries(t.sourceToPlayer ?? {}).map(([k, v]) => [k, Math.min(Math.max(0, ...Object.values(v)), 10)])),
    sourceDamage: Object.fromEntries(Object.entries(t.sourceDamage ?? {}).map(([k, v]) => [k, Math.min(Math.max(0, ...Object.values(v)), 5)])),
    toOwnGraveyardTypes: t.toOwnGraveyardTypes,
    damageSources: capped(Object.fromEntries(Object.entries(t.damageSources ?? {}).map(([k, v]) => [k, v.length]))),
    blocks: [...new Set((t.blocks ?? []).map((b) => `${b.blocker}>${b.attacker}`))].sort(),
    energyLost: Object.fromEntries(Object.entries(t.energyLost ?? {}).map(([k, v]) => [k, Math.min(v, 10)])),
    lifeGained: Object.fromEntries(Object.entries(t.lifeGained ?? {}).map(([k, v]) => [k, Math.min(v, LIFE_CAP)])),
    // Counted with no cap (Neheb, the Eternal's mana), like the life totals themselves.
    lifeLost: t.lifeLost,
    // Valiant Rescuer: only the first cycle each turn matters.
    cycled: Object.fromEntries(Object.entries(t.cycled ?? {}).map(([k, v]) => [k, Math.min(v, 2)])),
    // Erdwal Illuminator: only the first investigation each turn matters.
    investigated: Object.fromEntries(Object.entries(t.investigated ?? {}).map(([k, v]) => [k, Math.min(v, 2)])),
    // Whispering Snitch: only the first surveil each turn matters.
    creatureCounterPutters: t.creatureCounterPutters,
    damagedCreature: t.damagedCreature && [...t.damagedCreature].sort(),
    combatDamagedCreature: t.combatDamagedCreature && [...t.combatDamagedCreature].sort(),
  };
}

/** cyrb53: a fast 53-bit string hash. */
function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
