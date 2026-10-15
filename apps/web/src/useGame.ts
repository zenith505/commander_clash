import { useCallback, useEffect, useRef, useState } from "react";
import {
  abilityProblem,
  altCost,
  castProblem,
  topPlayable,
  invalidateCharacteristics,
  abilitiesOf,
  applyAction,
  controllerOf,
  objIsType,
  availableMana,
  botActions,
  compileCard,
  planActivate,
  planCast,
  createGame,
  defOf,
  doesNothingNow,
  realDefOf,
  planTurnFaceUp,
  takeShortcut,
  isType,
  obj,
  graveyardWays,
  waitingOn,
  RulesError,
  type Action,
  type CardDef,
  type GameState,
  type PlayerId,
  type Step,
  type TargetChoice,
} from "@cc/engine";

export const HUMAN: PlayerId = 0;
const BOT_DELAY_MS = 120;
/** Bots pass more slowly while something is on the stack, so you can read it. */
const STACK_DELAY_MS = 450;

export interface DeckBundle {
  /** `secondCommander`: a partner or a Background (CR 702.124). */
  decks: { name: string; commander: string; secondCommander?: string; cards: string[] }[];
  cards: CardDef[];
}

export function newGame(bundle: DeckBundle, humanDeck: number, seed = Date.now() >>> 0): GameState {
  const byName = new Map(bundle.cards.map((c) => [c.name, c]));
  const get = (n: string) => {
    const c = byName.get(n);
    if (!c) throw new Error(`deck card missing: ${n}`);
    return c;
  };
  const order = [humanDeck, ...bundle.decks.map((_, i) => i).filter((i) => i !== humanDeck)].slice(0, 4);
  const s = createGame(
    order.map((di, seat) => {
      const d = bundle.decks[di]!;
      return { name: seat === HUMAN ? "You" : d.commander.split(",")[0]!, commander: get(d.commander), ...(d.secondCommander ? { secondCommander: get(d.secondCommander) } : {}), deck: d.cards.map(get), isBot: seat !== HUMAN };
    }),
    seed,
    { mulligans: true },
  );
  stackOpeningHand(s);
  return s;
}

/**
 * For play-testing: "?hand=Card A|Card B" swaps those cards from your library into your
 * opening hand, so a particular card can be tried without waiting to draw it.
 */
function stackOpeningHand(s: GameState) {
  if (typeof location === "undefined") return;
  const wanted = new URLSearchParams(location.search).get("hand") ?? "";
  const me = s.players[HUMAN]!;
  // Swap out spells first, so the hand keeps its lands.
  const slots = me.hand.map((id, i) => ({ i, land: isLand(s, id) })).sort((a, b) => Number(a.land) - Number(b.land)).map((x) => x.i);
  for (const name of wanted ? wanted.split("|") : []) {
    const i = me.library.findIndex((id) => cardOf(s, id).name === name);
    const slot = slots.shift();
    if (i < 0 || slot === undefined) continue;
    const fromLib = me.library[i]!;
    const fromHand = me.hand[slot]!;
    me.library[i] = fromHand;
    me.hand[slot] = fromLib;
    s.objects[fromLib]!.zone = "hand";
    s.objects[fromHand]!.zone = "library";
  }
  // "?yard=Card A|Card B" starts those cards in your graveyard (for trying flashback, unearth...).
  const yard = new URLSearchParams(location.search).get("yard");
  for (const name of yard ? yard.split("|") : []) {
    const i = me.library.findIndex((id) => cardOf(s, id).name === name);
    if (i < 0) continue;
    const [id] = me.library.splice(i, 1);
    me.graveyard.push(id!);
    s.objects[id!]!.zone = "graveyard";
  }
  // "?board=Card A|Card B" starts those cards on your battlefield (for trying combos and clones).
  const board = new URLSearchParams(location.search).get("board");
  for (const name of board ? board.split("|") : []) {
    const i = me.library.findIndex((id) => cardOf(s, id).name === name);
    if (i < 0) continue;
    const [id] = me.library.splice(i, 1);
    const o = s.objects[id!]!;
    o.zone = "battlefield";
    o.timestamp = s.nextTimestamp++;
    o.controlledSinceTurn = -1;
    s.battlefield.push(id!);
  }
  invalidateCharacteristics(s);
}

/** Can the human do something right now besides tapping mana: an instant, flash spell, cycling, or activated ability? */
function hasInstantPlay(s: GameState): boolean {
  const me = s.players[HUMAN]!;
  // An instant on top of your library you may cast (Future Sight).
  for (const id of topPlayable(s, HUMAN)) {
    const d = cardOf(s, id);
    if ((isType(d, "Instant") || d.keywords.includes("Flash")) && planCast(s, HUMAN, id, undefined, undefined, "auto")) return true;
  }
  for (const id of me.hand) {
    const d = cardOf(s, id);
    // Cycling works at instant speed from your hand (CR 702.29a).
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    if (abilities.some((ab, i) => ab.zone === "hand" && planActivate(s, HUMAN, id, i))) return true;
    if (!(isType(d, "Instant") || d.keywords.includes("Flash"))) continue;
    if (planCast(s, HUMAN, id, undefined, undefined, "auto")) return true;
  }
  // Ninjutsu once blockers are declared (CR 702.49a): an ability that works from your hand (cycling doesn't count here).
  for (const id of me.hand) {
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    for (let i = 0; i < abilities.length; i++) {
      if (abilities[i]!.zone !== "hand" || !abilities[i]!.costs?.some((c) => c.kind === "returnToHand")) continue;
      const problem = abilityProblem(s, HUMAN, id, i);
      if (!problem || (/not enough mana/.test(problem) && planActivate(s, HUMAN, id, i))) return true;
    }
  }
  // Sneak once blockers are declared (CR 702.190a): an alternative cost that returns an unblocked attacker.
  if (s.activePlayer === HUMAN && s.step === "declareBlockers")
    for (const id of [...me.hand, ...me.command]) {
      if (!altCost(cardOf(s, id), "sneak")) continue;
      const problem = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, undefined, { alt: "sneak" });
      if (!problem || (/not enough mana/.test(problem) && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { alt: "sneak" }))) return true;
    }
  // Turning a face-down permanent face up is a special action, any time you have priority (CR 702.37e).
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.faceDown && controllerOf(s, o) === HUMAN && planTurnFaceUp(s, HUMAN, id)) return true;
  }
  // Flashback and the like work from your graveyard, at instant speed for an instant (CR 702.34a).
  for (const id of me.graveyard) {
    const d = cardOf(s, id);
    if (!isType(d, "Instant")) continue;
    for (const g of graveyardWays(s, obj(s, id))) if (planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { via: g.kind })) return true;
  }
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== HUMAN) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      if (abilities[i]!.mana) continue; // making mana alone isn't a play (CR 605.1a)
      if (doesNothingNow(s, id, abilities[i]!.body)) continue; // e.g. "{1}: Untap ~" while it's untapped
      const problem = abilityProblem(s, HUMAN, id, i);
      if (!problem || (/not enough mana/.test(problem) && planActivate(s, HUMAN, id, i))) return true;
    }
  }
  return false;
}

/**
 * How the human handles priority:
 * - "hold": stop whenever a response could matter and you have mana up, even with no
 *   playable card, so opponents can't read your hand from how fast you pass (the default).
 * - "auto": always pass, even when you could respond, so everything just resolves.
 * Either way you stop on your own main phases, after blocks on your turn when you have
 * something you could play, for decisions only you can make (attacks,
 * blocks, targets, discards), and at a step you've marked as a stop, the next time it comes on an opponent's turn (each stop is used once).
 */
export type PriorityMode = "hold" | "auto";

/** Steps of an opponent's turn you can ask to stop at (no one gets priority in untap or cleanup). */
export const STOPPABLE: Step[] = ["upkeep", "draw", "main1", "beginCombat", "declareAttackers", "declareBlockers", "combatDamage", "endCombat", "main2", "end"];

/** The phase-track step the game is in (both combat damage steps share one marker). */
const trackStep = (s: GameState): Step => (s.step === "firstStrikeDamage" ? "combatDamage" : s.step);

/**
 * A loop being recorded for a shortcut (CR 732.2a): where it began, and every player's choices since. The human plays
 * it once by hand, then repeats it.
 */
export interface LoopRecording {
  start: GameState;
  body: Action[];
}

/** Back where the loop began: the human has priority again in the same step, with as much on the stack. */
export function loopReady(s: GameState, loop: LoopRecording | null): boolean {
  if (!loop?.body.length || s.over || s.pending || waitingOn(s) !== HUMAN) return false;
  return s.turn === loop.start.turn && s.step === loop.start.step && s.stack.length === loop.start.stack.length;
}

/** Should the human automatically pass right now? */
function shouldAutoPass(s: GameState, mode: PriorityMode, stops: ReadonlySet<Step>, loop: LoopRecording | null): boolean {
  if (waitingOn(s) !== HUMAN || s.pending) return false;
  // Recording a loop: stop once it's back where it began, so it can be repeated.
  if (loopReady(s, loop)) return false;
  if (s.activePlayer === HUMAN && (s.step === "main1" || s.step === "main2") && s.stack.length === 0) return false;
  // Never pass away mana you've just made: you're partway through paying for something.
  if (Object.values(s.players[HUMAN]!.manaPool).some((n) => n > 0)) return false;
  if (s.activePlayer !== HUMAN && stops.has(trackStep(s))) return false;
  // Once blocks are declared on your turn, stop before damage if you have a trick to play
  // (the active player gets priority first in each step, CR 117.3a).
  if (s.activePlayer === HUMAN && s.step === "declareBlockers" && s.stack.length === 0 && hasInstantPlay(s)) return false;
  if (mode === "auto") return true;
  const inCombat = (s.step === "declareBlockers" || s.step === "declareAttackers") &&
    (s.activePlayer === HUMAN || s.battlefield.some((id) => obj(s, id).attacking === HUMAN));
  const top = s.stack[s.stack.length - 1];
  const worthStopping = s.stack.length > 0 || inCombat || (s.step === "end" && s.activePlayer !== HUMAN);
  if (!worthStopping) return true;
  if (hasInstantPlay(s)) return false;
  // Holding: stop with mana up, except right after your own spell or ability (nothing to hide there).
  return top?.controller === HUMAN || availableMana(s, HUMAN) === 0;
}

/** A bot is about to target something; shown as an arrow for a moment before it acts. */
export interface Intent {
  player: PlayerId;
  /** The permanent the ability comes from, or undefined for a spell from the bot's hand. */
  sourceId?: string;
  targets: TargetChoice[];
}

const INTENT_MS = 700;

/** The targets a bot's chosen actions will use, if any. */
function intentOf(s: GameState, who: PlayerId, actions: Action[]): Intent | null {
  const a = actions[actions.length - 1];
  if (!a) return null;
  if (a.type === "castSpell" && a.targets?.length) return { player: who, targets: a.targets };
  if (a.type === "activateAbility" && a.targets?.length) return { player: who, sourceId: a.objectId, targets: a.targets };
  if (a.type === "chooseTargets" && s.pending?.kind === "chooseTargets") return { player: who, sourceId: s.pending.sourceId, targets: a.targets };
  return null;
}

const MODE_KEY = "cc.priorityMode";
const STOPS_KEY = "cc.stops";
function load<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private window): the choice lasts for this session only.
  }
}
const loadMode = () => load<PriorityMode>(MODE_KEY, (r) => (r === "auto" ? "auto" : "hold"));
const loadStops = () =>
  load<Set<Step>>(STOPS_KEY, (r) => {
    try {
      return new Set((JSON.parse(r ?? "[]") as Step[]).filter((x) => STOPPABLE.includes(x)));
    } catch {
      return new Set();
    }
  });

export function useGame(initial: GameState | null) {
  const [state, setState] = useState<GameState | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [priorityMode, setModeState] = useState<PriorityMode>(loadMode);
  const [stops, setStops] = useState<Set<Step>>(loadStops);
  const [loop, setLoopState] = useState<LoopRecording | null>(null);
  /** What the last shortcut did, until the next action. */
  const [shortcutNote, setShortcutNote] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Browser tests read the engine state to check what a click did.
  if (import.meta.env.DEV) (window as { __ccState?: GameState | null }).__ccState = state;
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const setLoop = useCallback((l: LoopRecording | null) => {
    loopRef.current = l;
    setLoopState(l);
  }, []);

  const setPriorityMode = useCallback((m: PriorityMode) => {
    setModeState(m);
    save(MODE_KEY, m);
  }, []);

  const toggleStop = useCallback((step: Step) => {
    setStops((prev) => {
      const next = new Set(prev);
      if (!next.delete(step)) next.add(step);
      save(STOPS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  /** A stop is good for one use: passing priority in it on an opponent's turn clears it. */
  const spendStop = useCallback((step: Step) => {
    setStops((prev) => {
      if (!prev.has(step)) return prev;
      const next = new Set(prev);
      next.delete(step);
      save(STOPS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const dispatch = useCallback((actions: Action[]) => {
    const s0 = stateRef.current;
    if (!s0) return;
    try {
      let s = s0;
      for (const a of actions) {
        if (a.type === "passPriority" && a.player === HUMAN && s.activePlayer !== HUMAN) spendStop(trackStep(s));
        s = applyAction(s, a);
      }
      const l = loopRef.current;
      if (l) setLoop(s.over ? null : { ...l, body: [...l.body, ...actions] });
      setError(null);
      setShortcutNote(null);
      setState(s);
    } catch (e) {
      if (e instanceof RulesError) setError(e.message);
      else throw e;
    }
  }, [spendStop, setLoop]);

  /** Mark this point as the start of a loop; every choice from here is recorded until it's repeated or cancelled. */
  const startLoop = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.over || s.pending || waitingOn(s) !== HUMAN) return;
    setLoop({ start: s, body: [] });
    setShortcutNote(null);
  }, [setLoop]);

  const cancelLoop = useCallback(() => setLoop(null), [setLoop]);

  /**
   * Propose the recorded loop as a shortcut, `times` more times (CR 732.2a). Each bot goes along with it or stops it
   * where it would do something else (732.2b).
   */
  const repeatLoop = useCallback(
    (times: number) => {
      const s = stateRef.current;
      const l = loopRef.current;
      if (!s || !loopReady(s, l)) return;
      try {
        const res = takeShortcut(l!.start, l!.body, times, HUMAN, (st, pid) => botActions(st, pid));
        setLoop(null);
        setError(null);
        const rounds = `${res.repeated} more time${res.repeated === 1 ? "" : "s"}`;
        setShortcutNote(
          res.stoppedBy !== undefined
            ? `The loop went round ${rounds}; then ${res.state.players[res.stoppedBy]!.name} stopped it to do something else.`
            : res.problem
              ? `The loop went round ${rounds}; it can't go round again the same way (${res.problem}).`
              : `The loop went round ${rounds}.`,
        );
        setState(res.state);
      } catch (e) {
        if (e instanceof RulesError) setError(e.message);
        else throw e;
      }
    },
    [setLoop],
  );

  // Drive bots and the human's auto-passes.
  useEffect(() => {
    if (!state || state.over) return;
    const who = waitingOn(state);
    if (who === null) return;
    const isBot = state.players[who]!.isBot;
    if (!isBot && !shouldAutoPass(state, priorityMode, stops, loopRef.current)) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const act = () => {
      if (!isBot) return dispatch([{ type: "passPriority", player: HUMAN }]);
      const actions = botActions(state, who);
      const shown = intentOf(state, who, actions);
      if (!shown) return dispatch(actions);
      // Show where the bot is aiming before it commits.
      setIntent(shown);
      timers.push(setTimeout(() => {
        setIntent(null);
        dispatch(actions);
      }, INTENT_MS));
    };
    timers.push(setTimeout(act, !isBot ? 0 : state.pending ? BOT_DELAY_MS * 3 : state.stack.length ? STACK_DELAY_MS : BOT_DELAY_MS));
    return () => {
      timers.forEach(clearTimeout);
      setIntent(null);
    };
  }, [state, dispatch, priorityMode, stops, loop]);

  return { state, setState, dispatch, error, setError, intent, priorityMode, setPriorityMode, stops, toggleStop, loop, startLoop, cancelLoop, repeatLoop, shortcutNote };
}

export const cardOf = (s: GameState, id: string) => defOf(s, obj(s, id));
/** What you see of a card: your own face-down spells and permanents show what they really are (CR 708.5). */
export const seenCardOf = (s: GameState, id: string) => {
  const o = obj(s, id);
  return o.faceDown && controllerOf(s, o) === HUMAN ? realDefOf(s, o) : defOf(s, o);
};
/** Card type right now: on the battlefield effects can change it (layer 4), elsewhere it's the printed type. */
export const isCreature = (s: GameState, id: string) => objIsType(s, obj(s, id), "Creature");
export const isLand = (s: GameState, id: string) => objIsType(s, obj(s, id), "Land");
