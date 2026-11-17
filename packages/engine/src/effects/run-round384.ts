// Round 384's effects: The Toymaker's Trap's secret number and an opponent's guess (Effect secretNumberGuess).
import type { Effect } from "../abilities";
import { log, loseLife, player } from "../game";
import type { GameState } from "../types";
import { type ResolveCtx, runEffect } from "./resolve";
import { chooseAnOpponent } from "./run-library";

/** The Toymaker's Trap's guess prompt starts with this (bots guess at random, see bot.ts). */
export const TOY_GUESS_PROMPT = "guess which number";

/**
 * The Toymaker's Trap: "secretly choose a number between 1 and 5 that hasn't been chosen. If you do, an opponent guesses
 * which number you chose, then you reveal the number you chose. If they guessed wrong, they lose life equal to the number
 * they guessed and you draw a card. If they guessed right, sacrifice ~." The numbers already chosen are this object's
 * (GameState.numbersChosenFor, CR 400.7: a new object, or a second Trap, remembers none, rulings); with all of them
 * chosen, nothing happens. The number is chosen first, in secret (written down, rulings), then you choose the opponent who
 * guesses (CR 608.2d: the controller of the ability chooses "an opponent"), and they may guess any number from 1 to 5.
 */
export function runSecretNumberGuessEffect(s: GameState, e: Extract<Effect, { type: "secretNumberGuess" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const st = (sc.toy ??= {});
  const me = player(s, ctx.controller);
  const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
  if (st.done) return;
  if (sc.guessStep === undefined) {
    if (st.pick === undefined) {
      const chosen = s.numbersChosenFor?.[key] ?? [];
      const left = Array.from({ length: e.max }, (_, i) => i + 1).filter((n) => !chosen.includes(n));
      if (!left.length) {
        log(s, `Every number has been chosen for ${src}: it does nothing.`);
        st.done = true;
        return;
      }
      s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "toyNumber", options: left.map(String), prompt: `secretly choose a number between 1 and ${e.max} that hasn't been chosen for ${src} (chosen: ${chosen.length ? chosen.join(", ") : "none"}); an opponent guesses it` };
      return "paused";
    }
    if (st.guesser === undefined) {
      if (!st.kept) {
        (s.numbersChosenFor ??= {})[key] = [...(s.numbersChosenFor[key] ?? []), st.pick];
        st.kept = true;
        log(s, `${me.name} secretly chooses a number for ${src}.`);
      }
      const opp = chooseAnOpponent(s, ctx, src, "choose an opponent to guess the number");
      if (opp === "paused") return "paused";
      if (opp === undefined || player(s, opp).lost) {
        // Nobody left to guess: the number is revealed, and nothing else happens.
        log(s, `${me.name} reveals ${st.pick}.`);
        st.done = true;
        return;
      }
      st.guesser = opp;
    }
    if (st.guess === undefined) {
      const chosen = s.numbersChosenFor?.[key] ?? [];
      const earlier = chosen.slice(0, -1);
      s.pending = { kind: "chooseOption", player: st.guesser, source: src, what: "toyGuess", options: Array.from({ length: e.max }, (_, i) => String(i + 1)), prompt: `${TOY_GUESS_PROMPT} ${me.name} chose for ${src} (chosen before: ${earlier.length ? earlier.join(", ") : "none"}): if you're wrong, you lose life equal to your guess and ${me.name} draws a card; if you're right, ${me.name} sacrifices it` };
      return "paused";
    }
    const right = st.guess === st.pick;
    log(s, `${player(s, st.guesser).name} guesses ${st.guess}; ${me.name} reveals ${st.pick}: the guess was ${right ? "right" : "wrong"}.`);
    sc.guessRight = right;
    sc.guessStep = 0;
    if (!right && !player(s, st.guesser).lost) loseLife(s, st.guesser, st.guess);
  }
  const fx: Effect[] = sc.guessRight ? [{ type: "sacrifice", what: { ref: "self" } }] : [{ type: "draw", who: { ref: "you" }, n: 1 }];
  for (; sc.guessStep! < fx.length; sc.guessStep!++) if (runEffect(s, fx[sc.guessStep!]!, ctx) === "paused") return "paused";
}
