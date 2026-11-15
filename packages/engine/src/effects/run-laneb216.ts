// Lane B round B216's effects.
import type { Effect } from "../abilities";
import { canBeSacrificed, defOf } from "../cards";
import { log, moveObject, obj, player } from "../game";
import { controllerOf } from "../layers";
import type { GameState } from "../types";
import { canPayNow } from "./run-choices";
import { objects, runEffect, type ResolveCtx } from "./resolve";
import { objectMatches } from "./targeting";

type B216Effect = Extract<Effect, { type: "repeatMaySteps" | "lookTopMaySacrificePay" }>;

export function runLaneB216Effect(s: GameState, e: B216Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "repeatMaySteps": {
      // Forbidden Ritual: a pass is its instructions in order, each choice made as it comes (CR 608.2c); then its controller
      // decides whether to go again, having seen what happened (rulings on "repeat this process"). State-based actions wait
      // until the spell is done (CR 704.3). Each pass's own results ("if you do") are cleared before the next one.
      const st = (sc.repeatMaySteps ??= { keep: Object.keys(sc).filter((k) => k !== "repeatMaySteps") });
      if (st.asked) {
        const again = sc.may;
        sc.may = undefined;
        st.asked = undefined;
        if (!again) {
          sc.repeatMaySteps = undefined;
          return;
        }
        log(s, `${player(s, ctx.controller).name} repeats the process.`);
      }
      for (;;) {
        for (st.step ??= 0; st.step < e.effects.length; st.step++) if (runEffect(s, e.effects[st.step]!, ctx) === "paused") return "paused";
        st.step = undefined;
        for (const k of Object.keys(sc) as (keyof typeof sc)[]) if (k !== "repeatMaySteps" && !st.keep.includes(k)) delete sc[k];
        r.sacrificedThisWay = undefined;
        r.did = undefined;
        // Asked only while the pass could begin again: a permanent of theirs to sacrifice.
        const can = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === ctx.controller && objectMatches(s, e.while, obj(s, id), ctx.controller, false) && canBeSacrificed(s, obj(s, id)));
        if (!can || player(s, ctx.controller).lost) {
          sc.repeatMaySteps = undefined;
          return;
        }
        st.asked = true;
        s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `repeat the process: ${e.text}`, source: src, repeat: true };
        return "paused";
      }
    }
    case "lookTopMaySacrificePay": {
      // Preferred Selection: the cards are looked at first, seen only by their controller, and named in the question. "You
      // may sacrifice ~ and pay {2}{G}{G}": both or neither, so only with ~ still on the battlefield as this ability's source
      // (CR 400.7) and the mana payable (CR 608.2d). Then one of the cards still on top goes where the answer says; the
      // other stays on top (the ability says nothing more of it).
      const p = player(s, ctx.controller);
      const names = (ids: string[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(" and ");
      let st = sc.lookTopMay;
      if (!st) {
        st = sc.lookTopMay = { looked: p.library.slice(0, e.n) };
        log(s, `${p.name} looks at the top ${st.looked.length === 1 ? "card" : `${st.looked.length} cards`} of their library.`);
        if (st.looked.length) log(s, `You look at ${names(st.looked)} (${src}).`, p.id);
      }
      if (st.did === undefined) {
        if (sc.may === undefined) {
          const me = objects(s, { ref: "self" }, ctx).find((o) => o.zone === "battlefield" && controllerOf(s, o) === p.id && canBeSacrificed(s, o));
          if (!me || !canPayNow(s, p.id, e.pay)) st.did = false;
          else {
            const shown = st.looked.length ? names(st.looked) : "no cards";
            const take = (to: "hand" | "bottom") => (to === "hand" ? "into your hand" : "on the bottom of your library");
            s.pending = { kind: "chooseMay", player: p.id, prompt: `sacrifice ${src} and pay ${e.pay.mana ?? ""} to put one of ${shown} ${take(e.then)}`, otherwise: `If you don't, one of them goes ${take(e.otherwise)}.`, source: src, pay: e.pay };
            return "paused";
          }
        } else {
          st.did = sc.may;
          sc.may = undefined;
          // The mana is paid as the question is answered; the sacrifice is the other half of the same choice.
          if (st.did) runEffect(s, { type: "sacrifice", what: { ref: "self" } }, ctx);
        }
      }
      const to = st.did ? e.then : e.otherwise;
      const still = st.looked.filter((id) => s.objects[id]?.zone === "library" && p.library.slice(0, e.n).includes(id));
      if (!still.length) {
        sc.lookTopMay = undefined;
        return;
      }
      if (st.pick === undefined) {
        if (still.length === 1) st.pick = still[0]!;
        else {
          s.pending = { kind: "chooseOption", player: p.id, source: src, what: "lookedCard", options: still, labels: still.map((id) => defOf(s, obj(s, id)).name), prompt: `put one of those cards ${to === "hand" ? "into your hand" : "on the bottom of your library"}` };
          return "paused";
        }
      }
      const pick = still.includes(st.pick) ? st.pick : still[0]!;
      sc.lookTopMay = undefined;
      if (to === "hand") {
        moveObject(s, pick, "hand");
        log(s, `${p.name} puts a card into their hand (${src}).`);
      } else {
        p.library = [...p.library.filter((id) => id !== pick), pick];
        log(s, `${p.name} puts a card on the bottom of their library (${src}).`);
      }
      return;
    }
  }
}
