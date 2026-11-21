// Lane B round B281's effects: Drain Power (drainPower). Celestial Dawn's abilities are statics (layers.ts, spend.ts).
import type { Effect } from "../abilities";
import { activateManaForEffect, log, obj, player } from "../game";
import { controllerOf, characteristics, invalidateCharacteristics } from "../layers";
import { manaAbilitiesOn, manaAbilityCostOf, manaAbilityProblem, manaOptions, type ManaOption } from "../manaabilities";
import { addedAbilityCosts } from "../added-costs";
import { emptyPool } from "../mana";
import type { GameObject, GameState, ManaType, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";

type B281Effect = Extract<Effect, { type: "drainPower" }>;

/** One way to activate a mana ability, as a chooseOption "drainLand" option. */
export const drainKey = (x: ManaOption): string => `${x.ability}|${x.mana}|${x.combo ?? ""}|${x.instead ?? ""}|${(x.extra ?? []).join("")}`;

const symbols = (ms: ManaType[]) => (ms.length ? ms.map((m) => `{${m}}`).join("") : "no mana");

/**
 * The ways `pid` could activate a mana ability of land `o` now, as Drain Power has them (CR 605.3a): each mana ability they
 * can activate, with each choice of the mana it makes (rulings: "that player can choose how to draw the mana if a land they
 * control has multiple mana abilities, or mana abilities with choices"), its costs paid as usual, mana from their pool too
 * (CR 118.3). Abilities whose activation would ask something more (a creature to tap, a permanent to sacrifice, another
 * player paying or choosing, a card milled first) aren't offered (round B281's known gaps).
 */
export function drainOptions(s: GameState, pid: PlayerId, o: GameObject): ManaOption[] {
  const abs = manaAbilitiesOn(s, o);
  const seen = new Set<string>();
  return manaOptions(s, o).filter((x) => {
    const ab = abs[x.ability];
    if (!ab || ab.tapCost || ab.unlessAnyPays || ab.getterChooses || ab.toChosenPlayer || ab.millCost || x.mills || ab.produces.kind === "doublePool" || ab.discardHand) return false;
    if (addedAbilityCosts(s, pid, o, ab.manaCost, ab.sacrificeSelf)[0]) return false;
    if (manaAbilityProblem(s, pid, o, x.ability)) return false;
    const key = drainKey(x);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** How `pid` would put one of these: the mana it adds, and what else the ability costs. */
export function drainLabel(s: GameState, pid: PlayerId, o: GameObject, x: ManaOption): string {
  const ab = manaAbilitiesOn(s, o)[x.ability]!;
  const costs = [manaAbilityCostOf(s, pid, o, ab) ? `pay ${ab.manaCost}` : "", ab.lifeCost ? `pay ${ab.lifeCost} life` : "", ab.sacrificeSelf ? "sacrifice it" : "", ab.selfDamage ? `${ab.selfDamage} damage to you` : ""].filter(Boolean);
  return `Add ${symbols(x.adds)}${costs.length ? ` (${costs.join(", ")})` : ""}`;
}

export function runLaneB281Effect(s: GameState, e: B281Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "drainPower": {
      // Drain Power: "Target player activates a mana ability of each land they control." Each land they control as this
      // resolves, one at a time, its mana ability chosen by them along with what it makes (rulings): a tapped land, or one
      // whose abilities can't be activated or paid for, isn't (CR 101.3); lands with an ability costing no mana come first,
      // so mana they make may pay a costlier one's cost (the order is theirs to choose; this one activates the most).
      // "Then that player loses all unspent mana and you add the mana lost this way": their whole pool, its restrictions,
      // riders and sources unchanged (CR 106.13), to the spell's controller (the same player, nothing changes).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const t = ctx.targets[0];
      if (!sc.drain) {
        if (t?.kind !== "player" || ctx.legal[0] === false) return;
        const tp = t.id;
        const lands = s.battlefield.map((id) => obj(s, id)).filter((o) => characteristics(s, o).types.includes("Land") && controllerOf(s, o) === tp);
        const free = (o: GameObject) => drainOptions(s, tp, o).some((x) => !manaAbilityCostOf(s, tp, o, manaAbilitiesOn(s, o)[x.ability]!));
        const ordered = [...lands.filter(free), ...lands.filter((o) => !free(o))];
        sc.drain = { player: tp, queue: ordered.map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 })) };
      }
      const d = sc.drain;
      if (d.done) return;
      const tp = d.player;
      while (d.queue.length && !player(s, tp).lost) {
        const next = d.queue[0]!;
        const o = s.objects[next.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== next.zc || controllerOf(s, o) !== tp) {
          d.queue.shift();
          sc.drainPick = undefined;
          continue;
        }
        const opts = drainOptions(s, tp, o);
        const pick = sc.drainPick !== undefined ? opts.find((x) => drainKey(x) === sc.drainPick) : opts.length === 1 ? opts[0] : undefined;
        sc.drainPick = undefined;
        if (!opts.length) {
          d.queue.shift();
          continue;
        }
        if (!pick) {
          s.pending = { kind: "chooseOption", player: tp, source: src, what: "drainLand", options: opts.map(drainKey), labels: opts.map((x) => drainLabel(s, tp, o, x)), about: o.id, prompt: `choose the mana ability of ${characteristics(s, o).name} you activate` };
          return "paused";
        }
        d.queue.shift();
        activateManaForEffect(s, tp, o.id, pick);
      }
      d.done = true;
      const from = player(s, tp);
      const to = player(s, ctx.controller);
      const lost = (Object.keys(from.manaPool) as ManaType[]).flatMap((m) => Array.from({ length: from.manaPool[m] }, () => m));
      if (tp === ctx.controller || from.lost) {
        if (tp === ctx.controller) log(s, `${from.name} loses ${symbols(lost)} and adds it again.`);
        return;
      }
      const lots = from.manaLots ?? [];
      from.manaPool = emptyPool();
      from.manaLots = undefined;
      if (!to.lost) {
        for (const m of Object.keys(to.manaPool) as ManaType[]) to.manaPool[m] += lost.filter((x) => x === m).length;
        if (lots.length) to.manaLots = [...(to.manaLots ?? []), ...lots];
      }
      log(s, `${from.name} loses ${symbols(lost)}${to.lost ? "" : `, and ${to.name} adds it`}.`);
      invalidateCharacteristics(s);
      return;
    }
  }
}
