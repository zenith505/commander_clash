// Lane B round B233's effects: Oracle en-Vec (chosenAttackNextTurn, chosenAttackDestroy), A Killer Among Us
// (secretCreatureType).
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { damagedNoRegen, destroyPermanent, log, obj, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import { players, type ResolveCtx } from "./resolve";

type B233Effect = Extract<Effect, { type: "chosenAttackNextTurn" | "chosenAttackDestroy" | "secretCreatureType" }>;

export function runLaneB233Effect(s: GameState, e: B233Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "chosenAttackNextTurn": {
      // Oracle en-Vec: the target opponent chooses as it resolves (CR 608.2d), any number of the creatures they control now,
      // none too. During their next turn the chosen ones attack if able (a requirement for combats of that player's turns
      // only, CR 508.1d) and other creatures can't attack (GameState.chosenAttackers, CR 508.1c); both are over as that
      // turn's cleanup step begins (CR 514.2). At the beginning of that turn's end step, a delayed trigger destroys the
      // chosen creatures that didn't attack that turn (CR 603.7). Each is the object it was (CR 400.7).
      const [opp] = players(s, e.who, ctx);
      if (opp === undefined || player(s, opp).lost) return;
      const mine = s.battlefield.filter((id) => !s.phasedOut?.includes(id) && objIsType(s, obj(s, id), "Creature") && controllerOf(s, obj(s, id)) === opp);
      let chosen: string[];
      if (sc.chosen?.[opp] !== undefined) {
        chosen = sc.chosen[opp]!;
        sc.chosen = undefined;
        sc.queue = undefined;
      } else if (!mine.length) chosen = [];
      else {
        sc.queue = [opp];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: opp, source: src, action: "choose", what: "creatures you control", options: mine, count: mine.length, min: 0, anyNumber: true, prompt: "choose any number of creatures you control: during your next turn they attack if able and no other creature can attack; at that turn's end step each of them that didn't attack is destroyed" };
        return "paused";
      }
      const keys = chosen.filter((id) => s.objects[id]?.zone === "battlefield").map((id) => `${id}@${s.objects[id]!.zoneChanges ?? 0}`);
      const key = `ev${s.nextId++}`;
      (s.chosenAttackers ??= {})[key] = { player: opp, sinceTurn: s.turn, chosen: keys, source: src };
      if (keys.length) {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, ...(ctx.sourceId ? { sourceId: ctx.sourceId } : {}), duration: "endOfYourNextTurn", turnOf: opp, sinceTurn: s.turn, affected: keys.map((k) => k.slice(0, k.lastIndexOf("@"))), mods: [{ kind: "attacksIfAble", turnOf: opp }] });
        invalidateCharacteristics(s);
      }
      // The delayed trigger is the ability's source's (CR 603.7d), whether or not it's still on the battlefield.
      (s.delayed ??= []).push({ when: "playersNextTurnEndStep", player: opp, controller: ctx.controller, sourceCardId: ctx.sourceDef.oracleId, subject: { id: ctx.sourceId ?? key, zc: ctx.sourceZc ?? 0 }, event: { player: opp }, body: { targets: [], effects: [{ type: "chosenAttackDestroy", key }], text: "destroy each of the chosen creatures that didn't attack this turn." }, turn: s.turn, step: s.step });
      const names = keys.map((k) => defOf(s, obj(s, k.slice(0, k.lastIndexOf("@")))).name);
      log(s, `${player(s, opp).name} chooses ${names.length ? names.join(", ") : "no creatures"}: during their next turn, ${names.length ? "those creatures attack if able and other creatures can't attack" : "no creature can attack"}.`);
      return;
    }
    case "chosenAttackDestroy": {
      // As the end step of that turn begins: each chosen creature, as the object it was, that wasn't declared as an attacker
      // this turn (CR 508.1a), destroyed at once (Bone Shaman's damage checked before any of them is).
      const c = s.chosenAttackers?.[e.key];
      if (!c) return;
      const list = c.chosen.flatMap((k) => {
        const id = k.slice(0, k.lastIndexOf("@"));
        const o = s.objects[id];
        return o && o.zone === "battlefield" && `${id}@${o.zoneChanges ?? 0}` === k && !o.attackedTurns?.includes(s.turn) ? [o] : [];
      });
      const barred = list.length > 1 ? damagedNoRegen(s) : undefined;
      for (const o of list) destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}, which didn't attack this turn.`, !!barred?.has(o.id), ctx.controller);
      return;
    }
    case "secretCreatureType": {
      // A Killer Among Us: chosen as the trigger resolves (CR 608.2d), kept on the object it is now (rulings: each copy its
      // own); only its chooser sees it until it's revealed.
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const st = (sc.secretType ??= {});
      if (st.pick === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "secretType", options: e.options, prompt: `secretly choose ${e.options.slice(0, -1).join(", ")}, or ${e.options[e.options.length - 1]}` };
        return "paused";
      }
      const type = st.pick;
      sc.secretType = undefined;
      if (me) me.secretType = { type, by: ctx.controller, zc: ctx.sourceZc ?? me.zoneChanges ?? 0 };
      log(s, `${player(s, ctx.controller).name} secretly chooses a creature type for ${src}.`);
      return;
    }
  }
}
