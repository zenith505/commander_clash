// Round 328's effects.
import type { Effect } from "../abilities";
import { objIsType, power } from "../cards";
import { dealDamageBatch, hitsBy, objectSource, type DamageEvent } from "../damage";
import { controllerOf } from "../layers";
import { log, nameOf } from "../game";
import type { GameState, ObjectId } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { fireEvent } from "./triggers";

type R328Effect = Extract<Effect, { type: "dividedDamageBack" }>;

export function runRound328Effect(s: GameState, e: R328Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "dividedDamageBack": {
      const sc = (s.resolving!.scratch ??= {});
      // The creature, still one on the battlefield, deals damage equal to its power now; the creatures that can be dealt
      // it are those still on the battlefield as the same objects (Master of the Wild Hunt rulings: only the Wolves
      // tapped this way).
      const from = objects(s, e.from, ctx).find((o) => o.zone === "battlefield" && objIsType(s, o, "Creature"));
      const among = objects(s, e.among, ctx).filter((o) => o.zone === "battlefield");
      const n = from ? Math.max(0, power(s, from)) : 0;
      if (!from || n <= 0 || !among.length) {
        delete sc.dividedDamage;
        if (from && among.length) log(s, `${nameOf(s, from.id)} deals no damage.`);
        return;
      }
      let parts = sc.dividedDamage;
      if (!parts && among.length === 1) parts = { [among[0]!.id]: n };
      if (!parts) {
        s.pending = { kind: "divideDamage", player: controllerOf(s, from), source: src, by: from.id, total: n, options: among.map((o) => o.id), what: "creatures" };
        return "paused";
      }
      delete sc.dividedDamage;
      // Noncombat damage from that creature, all dealt at once: its deathtouch, lifelink and infect apply.
      const source = objectSource(s, from);
      const events: DamageEvent[] = among.flatMap((o) => ((parts![o.id] ?? 0) > 0 ? [{ src: source, to: { object: o.id as ObjectId }, n: parts![o.id]! }] : []));
      if (!events.length) return;
      const results = dealDamageBatch(s, events);
      const dealt = results.reduce((a, d) => a + d.dealt, 0);
      if (dealt) fireEvent(s, { type: "dealtDamage", id: from.id, amount: dealt, combat: false, hits: hitsBy(results, from.id) });
      return;
    }
  }
}
