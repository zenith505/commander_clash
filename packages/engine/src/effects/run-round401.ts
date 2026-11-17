// Round 401's effects: Mairsil, the Pretender's "you may exile an artifact or creature card from your hand or graveyard and
// put a cage counter on it" (Effect exileFromHandOrYard).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, obj, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import { printedMatches } from "./targeting";
import type { ResolveCtx } from "./resolve";

/**
 * "You may exile a `filter` card from your hand or graveyard and put `counters` on it": one card of its controller's,
 * chosen as this resolves (not targeted), or none; the counters are put on it in exile (CR 122.1). Choosing is a
 * searchLibrary pick from the hand (`fromHand`) with the graveyard's cards too.
 */
export function runExileFromHandOrYardEffect(s: GameState, e: Extract<Effect, { type: "exileFromHandOrYard" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const p = player(s, ctx.controller);
  const sc = (s.resolving!.scratch ??= {});
  s.resolving!.did = false;
  if (!sc.found) {
    const cards = [...p.hand, ...p.graveyard].filter((id) => printedMatches(e.filter, defOf(s, obj(s, id))));
    if (!cards.length) return;
    const what = `${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text} from your hand or graveyard`;
    s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: 0, max: 1, fromHand: true, dig: { looked: [...p.hand, ...p.graveyard], to: `to exile with ${counterText(e.counters)} on it`, rest: "stay where they are" } };
    return "paused";
  }
  const found = sc.found as string[];
  sc.found = undefined;
  const o = found.length ? s.objects[found[0]!] : undefined;
  if (!o || o.owner !== p.id || (o.zone !== "hand" && o.zone !== "graveyard")) return;
  const from = o.zone;
  moveObject(s, o.id, "exile");
  if (obj(s, o.id).zone !== "exile") return;
  for (const [k, n] of Object.entries(e.counters)) o.counters[k] = (o.counters[k] ?? 0) + n;
  invalidateCharacteristics(s);
  s.resolving!.did = true;
  log(s, `${p.name} exiles ${defOf(s, o).name} from their ${from} with ${counterText(e.counters)} on it.`);
}

const counterText = (counters: Record<string, number>) =>
  Object.entries(counters)
    .map(([k, n]) => (n === 1 ? `${/^[aeiou]/i.test(k) ? "an" : "a"} ${k} counter` : `${n} ${k} counters`))
    .join(" and ");
