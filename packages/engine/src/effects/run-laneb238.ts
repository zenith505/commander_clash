// Lane B round B238's effects: Captured by the Consulate (consulateRedirect), Piracy (piracy).
import type { Effect } from "../abilities";
import { log, player } from "../game";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { changeTarget } from "./run-spells";

type B238Effect = Extract<Effect, { type: "consulateRedirect" | "piracy" }>;

export function runLaneB238Effect(s: GameState, e: B238Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "consulateRedirect": {
      // The spell whose cast triggered this, still on the stack (a countered one is gone, and nothing changes).
      const item = ctx.cause !== undefined ? s.stack.find((x) => x.id === ctx.cause) : undefined;
      if (!item) return;
      // The intervening if again as it resolves (CR 603.4): still a single target (the number of targets doesn't change,
      // CR 115.7, but it's checked anyway).
      if ((item.targets ?? []).filter((t) => t.kind !== "none").length !== 1) {
        log(s, `${item.description} doesn't have a single target, so ${src} does nothing.`);
        return;
      }
      // "Enchanted creature": the one this Aura is attached to as this resolves, or was as it last existed (CR 608.2h).
      const host = objects(s, { ref: "attached" }, ctx)[0];
      if (!host || host.zone !== "battlefield") {
        log(s, `${src} enchants no creature, so the target of ${item.description} stays the same.`);
        return;
      }
      // "If able" (rulings): only to a legal target for that spell, as if its controller chose it now; otherwise unchanged.
      return changeTarget(s, ctx, item.id, src, undefined, true, undefined, undefined, host.id);
    }
    case "piracy": {
      (s.turnRules ??= []).push({ turn: s.turn, player: ctx.controller, rule: "tapOthersLands" });
      log(s, `Until end of turn, ${player(s, ctx.controller).name} may tap lands they don't control for mana, spending that mana only to cast spells (${src}).`);
      return;
    }
  }
}
