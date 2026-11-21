// Lane B round B288's effects: Nihiloor's enters trigger (nihiloorTap). Ashiok, Wicked Manipulator's life payments are in
// game.ts payLife.
import type { Effect, TargetSpec } from "../abilities";
import { cardIdOf, defOf, objIsType, power } from "../cards";
import { batchTaps, log, obj, player, tapPermanent } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";

type B288Effect = Extract<Effect, { type: "nihiloorTap" }>;

/** The untapped creatures `pid` controls now, other than those already chosen. */
function untappedCreatures(s: GameState, pid: PlayerId, taken: ObjectId[]): ObjectId[] {
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return !o.tapped && !taken.includes(id) && controllerOf(s, o) === pid && objIsType(s, o, "Creature");
  });
}

export function runLaneB288Effect(s: GameState, e: B288Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "nihiloorTap": {
      // Nihiloor: for each opponent (in turn order from its controller, CR 101.4, those still in the game, CR 800.4a), its
      // controller chooses up to one untapped creature they control, a different one for each since they're tapped all at
      // the same time (rulings) once all are chosen (CR 608.2d), any player too with no creatures to take. Then a separate
      // reflexive trigger for each creature tapped this way (CR 603.12), all put on the stack in the order its controller
      // chooses the next time a player would receive priority (rulings, CR 603.3b), each targeting a creature that opponent
      // controls with power at most the tapped creature's, as it is or as it last existed, checked as the target is chosen
      // and again as it resolves (rulings; TargetSpec powerAtMostOfObject). The control lasts for as long as this ability's
      // controller controls Nihiloor (CR 611.2b): none at all if it's gone by then (rulings).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const me = ctx.controller;
      if (!sc.nihiloor) {
        const i = s.turnOrder.indexOf(me);
        const opps = [...s.turnOrder.slice(i + 1), ...s.turnOrder.slice(0, i)].filter((pid) => !player(s, pid).lost);
        sc.nihiloor = { opps, picks: {} };
      }
      const st = sc.nihiloor;
      for (const opp of st.opps) {
        if (st.picks[opp] !== undefined) continue;
        const answer = sc.chosen?.[opp];
        if (answer !== undefined) {
          st.picks[opp] = answer[0] ?? null;
          delete sc.chosen![opp];
          continue;
        }
        const taken = Object.values(st.picks).filter((x): x is ObjectId => !!x);
        const options = untappedCreatures(s, me, taken);
        if (!options.length) {
          st.picks[opp] = null;
          continue;
        }
        const them = player(s, opp).name;
        sc.queue = [me];
        sc.chosen ??= {};
        s.pending = {
          kind: "pickPermanents",
          player: me,
          source: src,
          action: "tap",
          what: "untapped creature you control",
          options,
          count: 1,
          min: 0,
          pickFor: opp,
          nihiloor: opp,
          prompt: `for ${them}, tap up to one untapped creature you control: when you do, gain control of target creature ${them} controls with power less than or equal to the tapped creature's power for as long as you control ${src}. Click it, then tap it (or tap none).`,
        };
        return "paused";
      }
      sc.queue = undefined;
      sc.chosen = undefined;
      // Tapped all at once (one event, CR 608.2c); one still untapped and ours as this happens.
      const tapped: { opp: PlayerId; id: ObjectId }[] = [];
      batchTaps(s, () => {
        for (const opp of st.opps) {
          const id = st.picks[opp];
          const o = id ? s.objects[id] : undefined;
          if (!o || o.zone !== "battlefield" || o.tapped || controllerOf(s, o) !== me || !objIsType(s, o, "Creature")) continue;
          tapPermanent(s, o, undefined, me);
          tapped.push({ opp, id: o.id });
        }
      });
      invalidateCharacteristics(s);
      log(s, tapped.length ? `${player(s, me).name} taps ${tapped.map((t) => `${defOf(s, obj(s, t.id)).name} (for ${player(s, t.opp).name})`).join(", ")}.` : `${player(s, me).name} taps nothing.`);
      const item = r.item;
      const sourceId = ctx.sourceId ?? item.objectId ?? "";
      const cardId = item.sourceCardId ?? (sourceId && s.objects[sourceId] ? cardIdOf(s.objects[sourceId]!) : undefined);
      if (!cardId) return;
      for (const t of tapped) {
        const o = obj(s, t.id);
        const them = player(s, t.opp).name;
        const name = defOf(s, o).name;
        const spec: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controlledBy: t.opp, powerAtMostOfObject: { id: o.id, zc: o.zoneChanges ?? 0, power: power(s, o) }, text: `target creature ${them} controls with power less than or equal to ${name}'s power` };
        s.triggerQueue.push({
          sourceId,
          sourceCardId: cardId,
          controller: me,
          index: -1,
          ...(item.sourceZc !== undefined ? { sourceZc: item.sourceZc } : {}),
          subject: { id: o.id, zc: o.zoneChanges ?? 0 },
          body: {
            targets: [spec],
            effects: [{ type: "continuous", what: { ref: "target", index: 0 }, mods: [{ kind: "control" }], duration: "whileControlled" }],
            text: `When you do, gain control of target creature ${them} controls with power less than or equal to ${name}'s power for as long as you control ~.`,
          },
        });
      }
      return;
    }
  }
}
