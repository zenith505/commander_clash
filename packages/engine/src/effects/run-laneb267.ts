// Lane B round B267's effects: Grip of Chaos's random reselection (gripReselect).
import type { Effect, TargetChoice } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { describeTargets, log } from "../game";
import { spellTargetSpecs } from "../oracle";
import { nextRandom } from "../rng";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { changeTargetOptions } from "./run-spells";
import { isLegalTarget, itemQuality, sameTarget, spellQuality, stampTargets } from "./targeting";
import { fireEvent } from "./triggers";

type B267Effect = Extract<Effect, { type: "gripReselect" }>;

export function runLaneB267Effect(s: GameState, e: B267Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "gripReselect": {
      // The spell or ability that triggered it, still on the stack (gone: nothing happens).
      const item = ctx.cause !== undefined ? s.stack.find((x) => x.id === ctx.cause) : undefined;
      if (!item) return;
      const o = item.objectId ? s.objects[item.objectId] : undefined;
      if (item.kind === "spell" && !o) return;
      // The intervening if again as it resolves (CR 603.4): it still has a single target.
      const chosen = (item.targets ?? []).flatMap((t, j) => (t.kind !== "none" ? [j] : []));
      if (chosen.length !== 1) {
        log(s, `${item.description} doesn't have a single target, so ${src} does nothing.`);
        return;
      }
      const j = chosen[0]!;
      const current = item.targets![j]!;
      const specs = item.body?.targets ?? (o ? spellTargetSpecs(defOf(s, o), item.modes) : []);
      const spec = specs[j];
      if (!spec) return;
      // "Select from among all legal targets" (rulings): the legal ones now, for that spell or ability as if it were choosing
      // (CR 115.7), the original among them if it's still legal; with no other, it keeps its target.
      const quality = o ? spellQuality(s, cardIdOf(o), item) : itemQuality(s, item);
      const others = changeTargetOptions(s, item, spec, current);
      const options: TargetChoice[] = [...(isLegalTarget(s, spec, current, item.controller, quality) ? [current] : []), ...others];
      if (!others.length) {
        log(s, `${item.description} has no other legal target, so it keeps its target (${src}).`);
        return;
      }
      const pick = options[Math.floor(nextRandom(s) * options.length)]!;
      if (sameTarget(pick, current)) {
        log(s, `${src} reselects the target of ${item.description} at random: it stays${describeTargets(s, [current]).replace(/^ targeting/, "")}.`);
        return;
      }
      // A divided amount stays with the one target (CR 601.2d).
      const amount = current.kind === "object" || current.kind === "player" ? current.amount : undefined;
      const next = amount !== undefined && (pick.kind === "object" || pick.kind === "player") ? { ...pick, amount } : pick;
      item.targets = item.targets!.map((x, i) => (i === j ? stampTargets(s, [next])![0]! : x));
      log(s, `${src} reselects the target of ${item.description} at random${describeTargets(s, [next]).replace(/^ targeting/, ": now")}.`);
      // It becomes the target of that spell or ability (ward, "becomes the target" triggers), but nothing was put onto the
      // stack, so Grip of Chaos doesn't trigger again (`only`).
      fireEvent(s, { type: "targeted", stackId: item.id, only: next.kind === "object" ? [next.id] : [] });
      return;
    }
  }
}
