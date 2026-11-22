// Lane B round B291's effects: God-Eternal Kefnet's copy of the card it revealed (kefnetCopy). Glyph of Delusion needed no
// effect of its own (TargetSpec.blockedByTarget, counters and granted abilities).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { freeCastable, log, newObject, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { removeCopy } from "./run-spells";

type B291Effect = Extract<Effect, { type: "kefnetCopy" }>;

export function runLaneB291Effect(s: GameState, e: B291Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "kefnetCopy": {
      // "Copy that card and you may cast the copy. That copy costs {2} less to cast.": the card revealed, wherever it is now
      // (rulings: one that left the hand is copied as it last existed there, which for a card is its card, CR 707.2). The
      // copy is created in its owner's hand and cast from there (rulings) as this resolves, timing ignored (CR 608.2g,
      // rulings: a sorcery too, on any turn), paying its costs less {2} of generic mana (CR 601.2f), or never: one not cast
      // ceases to exist (CR 704.5e, rulings). Exile stands in for the hand while it waits (GameObject.copyCastFrom "hand").
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.garth ??= {});
      if (st.copy !== undefined) {
        if (st.copy && s.objects[st.copy]?.zone === "exile") removeCopy(s, st.copy);
        return;
      }
      const card = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!card) {
        st.copy = "";
        return;
      }
      const me = player(s, ctx.controller);
      const copy = newObject(s, defOf(s, card), ctx.controller, "exile");
      copy.spellCopy = true;
      copy.copyCastFrom = "hand";
      me.exile.push(copy.id);
      st.copy = copy.id;
      log(s, `${me.name} copies ${defOf(s, card).name} (${src}).`);
      s.pending = { kind: "castFree", player: ctx.controller, objectId: copy.id, source: src, how: "paid", less: e.less };
      if (freeCastable(s, ctx.controller, copy.id, true)) return "paused";
      s.pending = null;
      log(s, `The copy of ${defOf(s, card).name} can't be cast, and ceases to exist.`);
      removeCopy(s, copy.id);
      return;
    }
  }
}
