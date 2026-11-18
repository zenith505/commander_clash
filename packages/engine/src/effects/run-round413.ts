// Round 413's effects: Perplexing Chimera's and Sudden Substitution's exchange of control of a spell and a permanent.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import { type ResolveCtx, objects } from "./resolve";

/**
 * "Exchange control of ~ and that spell" (Perplexing Chimera), "Exchange control of target noncreature spell and target
 * creature" (Sudden Substitution): CR 701.12a. The spell must still be on the stack (a target still legal, or the spell
 * whose casting triggered this) and the permanent still on the battlefield as the same object (rulings: if the Chimera
 * has left or the spell has left the stack, there's no exchange); with both under one player's control, nothing happens
 * (CR 701.12b, rulings). Otherwise, at once, the spell's controller becomes the permanent's controller (a permanent spell
 * becomes a permanent under that player's control, CR 110.2b; an instant or sorcery still goes to its owner's graveyard)
 * and the permanent's controller becomes the spell's, for as long as it stays on the battlefield (layer 2, CR 613.1b).
 * Neither changes zones (rulings). The exchange is between the two objects' controllers, whoever controls this ability
 * (Perplexing Chimera's rulings). Sets "if you do".
 */
export function runExchangeSpellControlEffect(s: GameState, e: Extract<Effect, { type: "exchangeSpellControl" }>, ctx: ResolveCtx, src: string): void {
  if (s.resolving) s.resolving.did = false;
  const t = e.cause ? undefined : ctx.targets[e.spell];
  const stackId = e.cause ? ctx.cause : t?.kind === "stack" && ctx.legal[e.spell] ? t.id : undefined;
  const item = stackId !== undefined ? s.stack.find((x) => x.id === stackId && x.kind === "spell") : undefined;
  // "~" is this object only while it's still on the battlefield (CR 400.7).
  const perm = objects(s, e.perm, ctx)[0];
  const here = !!perm && perm.zone === "battlefield" && (e.perm.ref !== "self" || ctx.sourceZc === undefined || (perm.zoneChanges ?? 0) === ctx.sourceZc);
  if (!item || !perm || !here) {
    log(s, `${src}: ${!item ? "the spell has left the stack" : `${perm ? defOf(s, perm).name : "the permanent"} has left the battlefield`}, so nothing is exchanged.`);
    return;
  }
  const [cs, cp] = [item.controller, controllerOf(s, perm)];
  if (cs === cp) {
    log(s, `${src}: ${item.description} and ${defOf(s, perm).name} have the same controller, so nothing is exchanged.`);
    return;
  }
  item.controlledBefore = [...(item.controlledBefore ?? []), cs];
  item.controller = cp;
  item.controlTaken = true;
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (o) o.controller = cp;
  s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: cs, sourceName: src, sourceId: ctx.sourceId, duration: "game", affected: [perm.id], mods: [{ kind: "control" }] });
  invalidateCharacteristics(s);
  log(s, `${player(s, cs).name} and ${player(s, cp).name} exchange control of ${item.description} and ${defOf(s, perm).name} (${src}).`);
  if (s.resolving) s.resolving.did = true;
}
