// Lane B round B229's effects: Backdraft (halfSpellDamageBack) and Vodalian War Machine (destroyCostTapped).
import type { Effect } from "../abilities";
import { destroyPermanent, log, player } from "../game";
import { characteristics } from "../layers";
import type { GameState, PlayerId } from "../types";
import { runEffect, selfKeyThisTurn, type ResolveCtx } from "./resolve";
import { objectMatches } from "./targeting";

type B229Effect = Extract<Effect, { type: "halfSpellDamageBack" | "destroyCostTapped" }>;

/**
 * Backdraft's choices: each player still in the game who cast one or more sorcery spells this turn (copies aren't cast, CR
 * 707.10), with the damage each of those spells dealt this turn (TurnLog.spellDamage, the spell as the object it was, CR
 * 400.7), one option for each amount ("player:amount"); a sorcery spell that dealt none is 0.
 */
export function spellDamageBackOptions(s: GameState): { player: PlayerId; amount: number }[] {
  const out: { player: PlayerId; amount: number }[] = [];
  for (const pid of s.turnOrder) {
    if (player(s, pid).lost) continue;
    const cast = (s.castThisTurn ?? []).filter((c) => c.player === pid && !!c.types?.includes("Sorcery")).length;
    if (!cast) continue;
    const bySpell = new Map<string, number>();
    for (const d of s.turnLog?.spellDamage ?? []) if (d.cast && d.controller === pid && d.types.includes("Sorcery")) bySpell.set(d.key, (bySpell.get(d.key) ?? 0) + d.amount);
    const amounts = new Set(bySpell.values());
    if (bySpell.size < cast) amounts.add(0);
    for (const amount of [...amounts].sort((a, b) => b - a)) out.push({ player: pid, amount });
  }
  return out;
}

export function runLaneB229Effect(s: GameState, e: B229Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "halfSpellDamageBack": {
      // Backdraft: "Choose a player who cast one or more sorcery spells this turn. ~ deals damage to that player equal to half
      // the damage dealt by one of those sorcery spells this turn, rounded down.": the player and the spell are chosen as it
      // resolves (CR 608.2d), only a player who cast a sorcery spell this turn (one cast by its caster's opponent too, or by
      // Backdraft's own controller); with none, it does nothing. Half the damage that spell dealt to anything this turn,
      // rounded down (CR 107.1a).
      const sc = (s.resolving!.scratch ??= {});
      const options = spellDamageBackOptions(s);
      const id = (o: { player: PlayerId; amount: number }) => `${o.player}:${o.amount}`;
      let pick = options.find((o) => sc.spellDamageBack?.pick === id(o));
      if (!pick && options.length > 1 && !sc.spellDamageBack) {
        sc.spellDamageBack = {};
        s.pending = {
          kind: "chooseOption",
          player: ctx.controller,
          source: src,
          what: "spellDamageBack",
          options: options.map(id),
          labels: options.map((o) => `${player(s, o.player).name}: ${Math.floor(o.amount / 2)} (a sorcery spell that dealt ${o.amount})`),
          prompt: "choose a player who cast a sorcery spell this turn, and the damage one of those spells dealt (it's dealt half, rounded down)",
        };
        return "paused";
      }
      sc.spellDamageBack = undefined;
      pick ??= options[0];
      if (!pick) {
        log(s, `${src}: no player cast a sorcery spell this turn.`);
        return;
      }
      const half = Math.floor(pick.amount / 2);
      log(s, `${player(s, ctx.controller).name} chooses ${player(s, pick.player).name} and a sorcery spell of theirs that dealt ${pick.amount} damage this turn (${src}).`);
      if (!half) return;
      const r = s.resolving!;
      r.chosen = { ...r.chosen, player: pick.player };
      return runEffect(s, { type: "damage", amount: half, to: { ref: "chosenPlayer" } }, ctx);
    }
    case "destroyCostTapped": {
      // Vodalian War Machine: "When ~ dies, destroy all Merfolk tapped this turn to pay for its abilities.": the permanents
      // tapped for its abilities' costs this turn (rulings: as each was activated), by the War Machine as the permanent it
      // was (its dies trigger's source is the card in the graveyard, CR 400.7, 603.10a); each one still the same object on the
      // battlefield (CR 400.7) and a Merfolk now ("all Merfolk"), destroyed at the same time.
      const key = selfKeyThisTurn(s, ctx);
      const tapped = key ? (s.turnLog?.costTapped?.[key] ?? []) : [];
      const list = tapped.flatMap((k) => {
        const [id, zc] = k.split("@");
        const o = s.objects[id!];
        return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === Number(zc) && objectMatches(s, e.filter, o, ctx.controller, false) ? [o] : [];
      });
      if (!list.length) log(s, `${src}: no ${e.filter.text} tapped this turn to pay for its abilities is on the battlefield.`);
      for (const o of list) destroyPermanent(s, o, `${src} destroys ${characteristics(s, o).name}.`, false, ctx.controller);
      return;
    }
  }
}
