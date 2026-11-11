// Round 339's effects.
import type { Effect } from "../abilities";
import { dealDamageBatch } from "../damage";
import { log, obj, player } from "../game";
import { controllerOf } from "../layers";
import { objIsType } from "../cards";
import type { GameState, PlayerId } from "../types";
import { amountNow, ctxSource, type ResolveCtx } from "./resolve";

type R339Effect = Extract<Effect, { type: "damageDefendingOthers" }>;

export function runRound339Effect(s: GameState, e: R339Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "damageDefendingOthers": {
      // Kusari-Gama: the defending player of the equipped creature as it dealt the damage, the player it was attacking
      // (CR 508.5). If it wasn't attacking, the ability's controller chooses one of the defending players (CR 508.5a), as
      // it resolves; with none (combat is over), there's no defending player and nothing is dealt.
      const sc = (s.resolving!.scratch ??= {});
      let dp: PlayerId | undefined = ctx.event?.player ?? sc.defendingChosen;
      if (dp === undefined) {
        const defenders = [...new Set(s.battlefield.map((id) => obj(s, id).attacking).filter((x): x is PlayerId => x !== undefined && !player(s, x).lost))].sort((a, b) => a - b);
        if (defenders.length > 1) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "defendingPlayer", options: defenders.map(String), labels: defenders.map((x) => player(s, x).name), prompt: "choose the defending player whose other creatures it deals the damage to" };
          return "paused";
        }
        dp = defenders[0];
      }
      sc.defendingChosen = undefined;
      if (dp === undefined) {
        log(s, `${src}: there's no defending player.`);
        return;
      }
      const n = amountNow(s, e.amount, ctx);
      const subject = ctx.subject;
      const hit = s.battlefield.map((id) => obj(s, id)).filter((o) => objIsType(s, o, "Creature") && controllerOf(s, o) === dp && !(subject && o.id === subject.id && (o.zoneChanges ?? 0) === subject.zc));
      if (n <= 0 || !hit.length) return;
      const from = ctxSource(s, ctx);
      dealDamageBatch(s, hit.map((o) => ({ src: from, to: { object: o.id }, n })));
      return;
    }
  }
}
