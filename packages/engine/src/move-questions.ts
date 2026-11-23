// Round 457: optional replacement effects asked in the middle of a move (Pulmonic Sliver's "you may put it on top of its
// owner's library instead", CR 614.1a, 616.1). A move can happen almost anywhere: in a state-based action, a cost, any
// instruction of a resolving spell or ability. None of those can stop partway through, so the action that made the move is
// undone and the question asked instead; once it's answered, the same action is applied again from the same state (the
// state is plain JSON and its randomness is seeded in it), and it reaches the same move, which now takes the answer. A
// second question in the same action is asked the same way, with the first answer kept (GameState.moveAnswers).
//
// Only the state applyAction is applying an action to asks (`askingState`). Anywhere else (a bot looking ahead on a copy,
// a shortcut repeating a loop in place, a look ahead inside the engine) the choice is made the way a bot would make it.

import { applyInPlace, cloneState } from "./game";
import { invalidateCharacteristics } from "./layers";
import { RulesError, type Action, type GameState, type ObjectId, type PendingDecision, type PlayerId } from "./types";

/** The state applyAction is applying an action to: its moves may stop to ask. */
let askingState: GameState | null = null;

/** What a move asks. `botChoice` is what's done where nothing can be asked, and what a bot answers. */
export interface MoveQuestion {
  player: PlayerId;
  key: string;
  about: ObjectId;
  source: string;
  prompt: string;
  options: string[];
  labels: string[];
  botChoice: string;
}

/** Thrown out of a move that needs an answer; applyAction undoes the action and asks. */
export class MoveQuestionPause extends Error {
  constructor(readonly q: MoveQuestion) {
    super(q.prompt);
  }
}

/** Run applyInPlace's work on `s` as the state whose moves may ask (the outermost applyAction only). */
export function asking<T>(s: GameState, fn: () => T): T {
  if (askingState) return fn();
  askingState = s;
  try {
    return fn();
  } finally {
    askingState = null;
  }
}

/** The answer to a move's question: given already in this action, asked now (throws), or a bot's choice where it can't be asked. */
export function moveAnswer(s: GameState, key: string, question: () => MoveQuestion): string {
  const a = s.moveAnswers?.find((x) => x.key === key);
  if (a) return a.choice;
  const q = question();
  if (askingState === s) throw new MoveQuestionPause(q);
  return q.botChoice;
}

/** The pending decision that asks `q`, redoing `action` (with `pending` the decision before it) once answered. */
export function questionPending(q: MoveQuestion, action: Action, pending: PendingDecision | null): PendingDecision {
  return { kind: "chooseOption", player: q.player, source: q.source, what: "moveInstead", prompt: q.prompt, options: q.options, labels: q.labels, about: q.about, botChoice: q.botChoice, resume: { action, pending, key: q.key } };
}

/** Is this action the answer to a move's question? */
export const answersMoveQuestion = (s: GameState, action: Action) => action.type === "chooseOption" && s.pending?.kind === "chooseOption" && s.pending.what === "moveInstead";

/** The answer to a move's question: kept, then the action it stopped is applied again (and may ask the next question). */
export function answerMoveQuestion(s: GameState, action: Action) {
  const pend = s.pending;
  if (action.type !== "chooseOption" || pend?.kind !== "chooseOption" || pend.what !== "moveInstead" || !pend.resume) throw new RulesError("nothing to choose");
  if (action.player !== pend.player) throw new RulesError(`waiting on player ${pend.player}, not ${action.player}`);
  if (!pend.options.includes(action.choice)) throw new RulesError("choose one of the options");
  const { action: again, pending, key } = pend.resume;
  (s.moveAnswers ??= []).push({ key, choice: action.choice });
  s.pending = pending;
  if (askingState !== s) {
    applyInPlace(s, again);
    s.moveAnswers = undefined;
    return;
  }
  const before = cloneState(s);
  try {
    applyInPlace(s, again);
  } catch (e) {
    if (!(e instanceof MoveQuestionPause)) throw e;
    for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k];
    Object.assign(s, before);
    invalidateCharacteristics(s);
    s.pending = questionPending(e.q, again, pending);
    return;
  }
  s.moveAnswers = undefined;
}
