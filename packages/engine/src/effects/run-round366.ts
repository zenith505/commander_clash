// Round 366's effects: an Aura that exiles its creature with every Aura on it and brings them back together at the next
// end step (Flickerform).
import type { Effect } from "../abilities";
import { characteristics } from "../layers";
import { defOf, isPermanentCard } from "../cards";
import { enterTogether, log, moveObject } from "../game";
import type { GameObject, GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { objects } from "./resolve";
import { chooseAuraHosts } from "./run-zones";
import { addDelayed } from "./run-spells";

/**
 * Flickerform: "Exile enchanted creature and all Auras attached to it": the creature ~ enchants as this resolves and every
 * Aura attached to it then (~ itself among them), all at once. "At the beginning of the next end step, return that card":
 * one delayed trigger (CR 603.7a) that returns the creature card if it's still in exile (a token ceased to exist, CR
 * 111.7: then nothing returns, the Auras stay exiled, rulings), then the Aura cards (returnAurasAttached).
 */
export function runFlickerWithAurasEffect(s: GameState, ctx: ResolveCtx, src: string): void {
  const host = objects(s, { ref: "attached" }, ctx).find((o) => o.zone === "battlefield");
  if (!host) return;
  const auras = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.attachedTo === host.id && characteristics(s, o).subtypes.includes("Aura"));
  const names = [host, ...auras].map((o) => characteristics(s, o).name);
  log(s, `${src} exiles ${names.join(", ")}.`);
  s.leftTogether = undefined; // all at once
  for (const o of [host, ...auras]) moveObject(s, o.id, "exile");
  s.leftTogether = undefined;
  const exiled = (o: GameObject) => (s.objects[o.id]?.zone === "exile" && !o.isToken ? [{ id: o.id, zc: s.objects[o.id]!.zoneChanges ?? 0 }] : []);
  const card = exiled(host)[0];
  if (!card) return;
  const cards = auras.flatMap(exiled);
  const back = obj(s, card.id);
  addDelayed(s, "nextEndStep", ctx.controller, back, {
    targets: [],
    effects: [
      { type: "returnExiled", under: "owner" },
      { type: "returnAurasAttached", cards },
    ],
    text: `Return ${defOf(s, back).name} to the battlefield under its owner's control${cards.length ? ", then the Auras exiled with it attached to it" : ""}.`,
  });
}

const obj = (s: GameState, id: ObjectId) => s.objects[id]!;

/**
 * Flickerform's "If you do, return the other cards exiled this way to the battlefield under their owners' control attached
 * to that creature": only if the creature card came back (as the new object it is, CR 400.7), whether or not it's still
 * a creature; each Aura card still in exile that could legally enchant it returns attached to it (CR 303.4f), the rest
 * stay exiled (rulings). A bestow or other non-Aura card returns unattached, as what it is (rulings).
 */
export function runReturnAurasAttachedEffect(s: GameState, e: Extract<Effect, { type: "returnAurasAttached" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const subj = ctx.subject;
  const host = subj ? s.objects[subj.id] : undefined;
  if (!host || host.zone !== "battlefield" || (host.zoneChanges ?? 0) !== subj!.zc + 1) return;
  const cards = e.cards.map((c) => s.objects[c.id]).filter((o, i): o is GameObject => o?.zone === "exile" && (o.zoneChanges ?? 0) === e.cards[i]!.zc && isPermanentCard(defOf(s, o)));
  if (!cards.length) return;
  const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: o.owner })), src, host.id);
  if (hosts === "paused") return "paused";
  enterTogether(s, () => {
    for (const c of cards) {
      const d = defOf(s, c);
      const to = hosts.get(c.id);
      if (d.subtypes.includes("Aura") && !to) {
        log(s, `${d.name} can't enchant ${characteristics(s, host).name}, so it stays in exile.`);
        continue;
      }
      log(s, `${src} returns ${d.name} to the battlefield${to ? ` attached to ${characteristics(s, host).name}` : ""}.`);
      moveObject(s, c.id, "battlefield", { controller: c.owner, ...to });
    }
  });
}
