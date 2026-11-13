// Round 352's effects: a permanent card put onto the battlefield from among the cards a graveyard choice just exiled
// (Winter, Cynical Opportunist).
import type { Effect } from "../abilities";
import { defOf, isPermanentCard } from "../cards";
import { enterTogether, log, moveObject, player } from "../game";
import { printedMatches } from "./targeting";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { chooseAuraHosts } from "./run-zones";

type R352Effect = Extract<Effect, { type: "putFromYardChosen" }>;

export function runRound352Effect(s: GameState, e: R352Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "putFromYardChosen": {
      // Winter: "put a permanent card from among them onto the battlefield with a finality counter on it": one of the
      // cards the instruction before exiled from the graveyard, still in exile (CR 400.7), chosen as this resolves (CR
      // 608.2c); not optional when there is one. An Aura's controller chooses what it enchants as it enters (CR 303.4f).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const p = player(s, ctx.controller);
      const fits = (id: string) => s.objects[id]?.zone === "exile" && isPermanentCard(defOf(s, s.objects[id]!)) && printedMatches(e.filter, defOf(s, s.objects[id]!));
      if (!sc.found) {
        const exiled = (r.yardChosen ?? []).filter((id) => s.objects[id]?.zone === "exile");
        const cards = exiled.filter(fits);
        if (!cards.length) return;
        const kind = e.filter.text;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`, cards, min: 1, max: 1, exiled: true, dig: { looked: exiled, to: `to put onto the battlefield${e.counters?.finality ? " with a finality counter on it" : ""}`, rest: "stay in exile" } };
        return "paused";
      }
      const found = sc.found.filter(fits);
      if (!found.length) return;
      const hosts = chooseAuraHosts(s, found.map((id) => ({ o: s.objects[id]!, under: p.id })), src);
      if (hosts === "paused") return "paused";
      const ids = found.filter((id) => !defOf(s, s.objects[id]!).subtypes.includes("Aura") || hosts.has(id));
      if (!ids.length) return;
      log(s, `${p.name} puts ${ids.map((id) => defOf(s, s.objects[id]!).name).join(", ")} from exile onto the battlefield${e.counters?.finality ? " with a finality counter on it" : ""}.`);
      enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id, ...(e.counters ? { counters: { ...e.counters } } : {}), ...hosts.get(id) })));
      r.created = ids.filter((id) => s.objects[id]?.zone === "battlefield");
      return;
    }
  }
}
