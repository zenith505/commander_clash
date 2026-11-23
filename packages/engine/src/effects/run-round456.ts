// Round 456's effects: Chef's Kiss's copy and random reselection (chefsKiss).
import type { Effect, TargetChoice } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { describeTargets, log } from "../game";
import { controllerOf } from "../layers";
import { spellTargetSpecs } from "../oracle";
import { nextRandom } from "../rng";
import type { GameState, PlayerId, StackItem } from "../types";
import type { ResolveCtx } from "./resolve";
import { runSpellsEffect } from "./run-spells";
import { canChooseTarget, itemQuality, legalTargets, sameTarget, spellQuality, stampTargets } from "./targeting";
import { fireEvent } from "./triggers";

type R456Effect = Extract<Effect, { type: "chefsKiss" }>;

/**
 * Chef's Kiss: "Copy it, then reselect the targets at random for the spell and the copy. The new targets can't be you or a
 * permanent you control." (after "Gain control of target spell ...", the controlSpell before this).
 *
 * The copy is made as any copy of a spell is (CR 707.10): its controller is this spell's, with the same targets, modes, X
 * and costs paid; no new targets are chosen for it (Twinning Staff's additional copy still may have them, CR 614.1a, and
 * isn't "the copy", rulings on Twinning Staff). Neither copying nor reselecting is casting (rulings).
 *
 * Then the spell (if it's still on the stack) and the copy have each of their targets reselected at random, one for each
 * instance of the word "target" (rulings), among every target that instance could have now for its controller (you, after
 * the control change, CR 115.7, 115.3), other than you and permanents you control. The target it has now is one of them if
 * it's still legal and not you or yours: "reselect" is to select again among the legal targets, and the rulings speak of
 * "legal targets that could be selected", not "other" ones, as Grip of Chaos's do ("it may still choose the original
 * one"); with "any legal targets that are not you or permanents you control, you must reselect" (rulings), the one it has
 * counts. With none, that target remains unchanged, illegal or not (rulings: Lava Spike still deals 3 to you). A divided
 * amount stays with its target (CR 115.7f). Only the final set is checked (CR 115.7e).
 */
export function runRound456Effect(s: GameState, e: R456Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const t = ctx.targets[e.index];
  const id = t?.kind === "stack" && ctx.legal[e.index] ? t.id : undefined;
  if (!sc.chef) sc.chef = { base: s.stack.length };
  const chef = sc.chef;
  if (!chef.copied) {
    const paused = runSpellsEffect(s, { type: "copySpell", spell: { target: e.index }, n: 1, newTargets: false }, ctx, src);
    // The original copy is the first one put on the stack (Twinning Staff's come after it).
    if (chef.copy === undefined && s.stack.length > chef.base && s.stack[chef.base]!.copy) chef.copy = s.stack[chef.base]!.id;
    if (paused === "paused") return "paused";
    chef.copied = true;
    sc.copies = undefined;
  }
  const items = [id !== undefined ? s.stack.find((x) => x.id === id) : undefined, chef.copy !== undefined ? s.stack.find((x) => x.id === chef.copy) : undefined];
  for (const item of items) if (item) reselect(s, item, ctx.controller, src);
  sc.chef = undefined;
}

function reselect(s: GameState, item: StackItem, you: PlayerId, src: string) {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (item.kind === "spell" && !o) return;
  const specs = item.body?.targets ?? (o ? spellTargetSpecs(defOf(s, o), item.modes) : []);
  const quality = o ? spellQuality(s, cardIdOf(o), item) : itemQuality(s, item);
  const old = item.targets ?? [];
  // The targets reselected so far; those still to come aren't chosen yet.
  const next: TargetChoice[] = old.map(() => ({ kind: "none" }));
  const yours = (c: TargetChoice) => (c.kind === "player" && c.id === you) || (c.kind === "object" && s.objects[c.id]?.zone === "battlefield" && controllerOf(s, s.objects[c.id]!) === you);
  let changed = false;
  for (let j = 0; j < old.length; j++) {
    const cur = old[j]!;
    const spec = specs[j];
    if (cur.kind === "none" || !spec) {
      next[j] = cur;
      continue;
    }
    const options = legalTargets(s, spec, item.controller, item.id, quality, item.sourceId).filter((c) => !yours(c) && canChooseTarget(s, specs, next, j, c, item.controller, quality, item.sourceId));
    if (!options.length) {
      next[j] = cur;
      continue;
    }
    const pick = options[Math.floor(nextRandom(s) * options.length)]!;
    const amount = cur.kind === "object" || cur.kind === "player" ? cur.amount : undefined;
    next[j] = sameTarget(cur, pick) ? cur : amount !== undefined && (pick.kind === "object" || pick.kind === "player") ? { ...pick, amount } : pick;
    if (!sameTarget(cur, pick)) changed = true;
  }
  const n = old.filter((x) => x.kind !== "none").length;
  if (!n) return;
  const what = n === 1 ? "target" : "targets";
  if (!changed) {
    log(s, `${src} reselects the ${what} of ${item.description} at random: ${n === 1 ? "it stays" : "they stay"}${describeTargets(s, old).replace(/^ targeting/, "")}.`);
    return;
  }
  item.targets = stampTargets(s, next);
  log(s, `${src} reselects the ${what} of ${item.description} at random${describeTargets(s, next).replace(/^ targeting/, ": now")}.`);
  // They become the targets of that spell (ward, "becomes the target" triggers); no player chose them (Psychic Battle).
  const now = next.flatMap((c, j) => (c.kind === "object" && !sameTarget(old[j], c) ? [c.id] : []));
  fireEvent(s, { type: "targeted", stackId: item.id, only: now });
}
