// Lane B round B180's effects.
import type { Effect } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { log, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";
import { players } from "./resolve";

type B180Effect = Extract<Effect, { type: "delayedUnlessPaid" }>;

const WHEN = { theirNextDraw: "playersNextDraw", theirNextUpkeep: "playersNextUpkeep", yourNextUpkeep: "yourNextUpkeep" } as const;

export function runLaneB180Effect(s: GameState, e: B180Effect, ctx: ResolveCtx, _src: string): "paused" | void {
  switch (e.type) {
    case "delayedUnlessPaid": {
      // The delayed trigger (CR 603.7): made now, about the player (or planeswalker) it names now, whoever's step it waits
      // for. Its source is this ability's source, or the spell (it's on its way to the graveyard), as for "delayed".
      const item = s.resolving?.item;
      const srcId = item?.kind === "spell" ? item.objectId : ctx.sourceId;
      const src = srcId ? s.objects[srcId] : undefined;
      if (!src) return;
      let who: number | undefined;
      let walker: { id: string; zc: number } | undefined;
      if (e.whom === "eventPlayer") who = players(s, { ref: "eventPlayer" }, ctx)[0];
      else {
        // Quenchable Fire: the target, even if its damage was prevented or dealt to another player or permanent (rulings);
        // not if it's an illegal target now (CR 608.2b).
        const t = ctx.targets[e.index ?? 0];
        if (!ctx.legal[e.index ?? 0] || !t) return;
        if (t.kind === "player") who = t.id;
        else if (t.kind === "object" && s.objects[t.id]?.zone === "battlefield") walker = { id: t.id, zc: s.objects[t.id]!.zoneChanges ?? 0 };
      }
      if (who === undefined && !walker) return;
      if (who !== undefined && player(s, who).lost) return;
      const id = (s.unlessPaidSeq = (s.unlessPaidSeq ?? 0) + 1);
      const text = e.text.replace(/^./, (c) => c.toUpperCase()) + ".";
      const name = defOf(s, src).name;
      if (walker) {
        // The planeswalker is the delayed trigger's subject ("that planeswalker"); the spell is its source ("~").
        const pw = s.objects[walker.id]!;
        addDelayed(s, WHEN[e.when], ctx.controller, pw, { targets: [], effects: e.effects.map((x): Effect => (x.type === "damage" ? { ...x, to: { ref: "subject" } } : x)), text }, cardIdOf(src));
        const d = s.delayed![s.delayed!.length - 1]!;
        d.source = { id: src.id, zc: ctx.sourceZc ?? src.zoneChanges ?? 0 };
        d.unlessPaid = { id, subjectController: true, cost: e.cost, source: name };
      } else {
        addDelayed(s, WHEN[e.when], ctx.controller, src, { targets: [], effects: e.effects, text }, cardIdOf(src), e.when === "yourNextUpkeep" ? undefined : who);
        const d = s.delayed![s.delayed!.length - 1]!;
        d.event = { player: who };
        d.unlessPaid = { id, player: who, cost: e.cost, source: name };
      }
      const step = e.when === "theirNextDraw" ? "their next draw step" : e.when === "theirNextUpkeep" ? "their next upkeep" : `${player(s, ctx.controller).name}'s next upkeep`;
      log(s, `${walker ? `${defOf(s, s.objects[walker.id]!).name}'s controller` : player(s, who!).name} may pay ${e.cost} before ${step} to stop ${name}'s delayed ability.`);
      return;
    }
  }
}
