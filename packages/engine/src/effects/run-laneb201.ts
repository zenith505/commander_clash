// Lane B round B201's effects.
import type { Effect, TargetSpec } from "../abilities";
import { abilitiesOf, defOf } from "../cards";
import { countersRemoved, putCounters, removableCounters } from "../counters";
import { log, obj, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { nextRandom } from "../rng";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { objects, players, runEffect } from "./resolve";
import { flipsRigged, noteFlipped } from "./run-dice";
import { paidUnless } from "./run-spells";
import { isSuspended } from "./run-zones";
import { bindChosen, printedMatches } from "./targeting";
import { fireEvent } from "./triggers";

type B201Effect = Extract<Effect, { type: "timeCountersEach" | "flipDestroyOrRepeat" | "guessNamedInHand" }>;

/** A run of lost flips this long is cut short, as paper Magic would (CR 732). */
const MAX_FLIPS = 100;

export function runLaneB201Effect(s: GameState, e: B201Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "timeCountersEach": {
      // Dust of Moments: every permanent with a time counter and every suspended card (CR 702.62b), anyone's, at once. A
      // permanent or card with fewer than two loses what it has (CR 122.8-like: as many as can be removed). Removing the
      // last one triggers suspend's cast ability and vanishing's sacrifice (CR 702.62a, 702.63a), after all have changed.
      const suspended = s.turnOrder.flatMap((pid) => player(s, pid).exile).filter((id) => isSuspended(s, obj(s, id)));
      const ids = [...s.battlefield.filter((id) => (obj(s, id).counters.time ?? 0) > 0), ...suspended];
      const changed: string[] = [];
      const last: ObjectId[] = [];
      const removedExiled: { id: ObjectId; n: number }[] = [];
      for (const id of ids) {
        const o = obj(s, id);
        const name = o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name;
        if (e.mode === "add") {
          const put = putCounters(s, o, "time", e.n);
          if (put) changed.push(`+${put} on ${name}`);
          continue;
        }
        const n = Math.min(e.n, removableCounters(s, o, "time"));
        if (n <= 0) continue;
        const left = (o.counters.time ?? 0) - n;
        if (left > 0) o.counters.time = left;
        else delete o.counters.time;
        changed.push(`-${n} from ${name}`);
        countersRemoved(s, o, "time", n);
        if (o.zone === "exile") removedExiled.push({ id, n });
        if (left <= 0) last.push(id);
      }
      invalidateCharacteristics(s);
      log(s, `${src}: ${changed.length ? `time counters ${changed.join(", ")}` : "nothing has a time counter"}.`);
      for (const x of removedExiled) fireEvent(s, { type: "timeCountersRemovedExiled", id: x.id, n: x.n, by: ctx.controller });
      for (const id of last) fireEvent(s, { type: "lastCounterRemoved", id, counter: "time" });
      return;
    }
    case "flipDestroyOrRepeat": {
      // Crooked Scales: its controller flips (CR 705.2); a won flip destroys target 0 and ends it; a lost one destroys target
      // 1 unless they pay, and paying repeats the process with the same targets (rulings). An illegal target is only left
      // alone (CR 608.2b): the flips and the payment are its controller's own. Edgar makes its controller's first flip this
      // turn won; with Krark's Thumb they keep a won coin if there is one (as Game of Chaos does).
      const you = ctx.controller;
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.flipRepeat ??= { flips: 0 });
      for (;;) {
        if (st.asking) {
          const target = objects(s, { ref: "target", index: 1 }, ctx)[0];
          const name = target ? characteristics(s, target).name : "your creature";
          const paid = paidUnless(s, ctx, you, { cost: e.pay }, src, `destroy ${name}`, `destroy ${name}`);
          if (paid === "paused") return "paused";
          sc.paid = undefined;
          st.asking = undefined;
          if (!paid) {
            sc.flipRepeat = undefined;
            return runEffect(s, { type: "destroy", what: { ref: "target", index: 1 } }, ctx);
          }
          log(s, `${player(s, you).name} pays ${e.pay} and repeats ${src}.`);
        }
        if (player(s, you).lost) {
          sc.flipRepeat = undefined;
          return;
        }
        if (st.flips >= MAX_FLIPS) {
          sc.flipRepeat = undefined;
          return void log(s, `${src}: ${MAX_FLIPS} flips lost in a row; the loop is cut short (CR 732).`);
        }
        st.flips++;
        const rig = flipsRigged(s, you);
        noteFlipped(s, you);
        const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === you && !!abilitiesOf(s, obj(s, id)).flipTwo);
        const won = rig || (thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]).some((h) => h);
        fireEvent(s, { type: "coinFlipped", player: you, won });
        log(s, `${player(s, you).name} ${won ? "wins" : "loses"} the flip for ${src}.`);
        if (won) {
          sc.flipRepeat = undefined;
          return runEffect(s, { type: "destroy", what: { ref: "target", index: 0 } }, ctx);
        }
        st.asking = true;
      }
    }
    case "guessNamedInHand": {
      // Liar's Pendulum (rulings): the name chosen first, then the target opponent guesses; its controller may then reveal
      // their hand, and draws only if they do and the guess was wrong. A card has the name if either of its names is it
      // (a split card, CR 709.4).
      const you = player(s, ctx.controller);
      const guesser = players(s, e.who, ctx).find((pid) => !player(s, pid).lost);
      const name = ctx.chosen?.name ?? s.resolving!.chosen?.name;
      if (guesser === undefined || name === undefined) return;
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.liarGuess ??= {});
      if (st.guess === undefined) {
        s.pending = { kind: "chooseOption", player: guesser, source: src, what: "liarGuess", options: ["in", "out"], labels: [`${name} is in their hand`, `${name} isn't in their hand`], prompt: `${you.name} named ${name}. Guess whether a card with that name is in their hand: if they reveal their hand and you guessed wrong, they draw a card` };
        return "paused";
      }
      const filter = bindChosen({ kind: "card", chosen: "name", text: "card with the chosen name" } as TargetSpec, { name });
      const there = you.hand.some((id) => printedMatches(filter, defOf(s, obj(s, id))));
      if (!st.asked) {
        st.asked = true;
        sc.may = undefined;
        s.pending = { kind: "chooseMay", player: you.id, source: src, prompt: `reveal your hand (${player(s, guesser).name} guessed ${name} ${st.guess === "in" ? "is" : "isn't"} in your hand; if you reveal it and they guessed wrong, you draw a card)`, liarReveal: { guessedRight: (st.guess === "in") === there } };
        return "paused";
      }
      const reveal = sc.may !== false;
      sc.may = undefined;
      sc.liarGuess = undefined;
      if (!reveal) return void log(s, `${you.name} doesn't reveal their hand.`);
      const hand = you.hand.map((id) => defOf(s, obj(s, id)).name);
      log(s, hand.length ? `${you.name} reveals their hand for ${src}: ${hand.join(", ")}.` : `${you.name} reveals an empty hand for ${src}.`);
      if ((st.guess === "in") === there) return void log(s, `${player(s, guesser).name} guessed right.`);
      log(s, `${player(s, guesser).name} guessed wrong.`);
      return runEffect(s, { type: "draw", who: { ref: "you" }, n: 1 }, ctx);
    }
  }
}
