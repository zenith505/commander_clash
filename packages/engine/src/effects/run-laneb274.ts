// Lane B round B274's effects: Dimensional Breach (dimensionalBreach, breachReturn), and Next of Kin's "with lesser mana
// value" (subjectLastMv, used by putFromHand in run-zones.ts).
import type { Effect, TargetSpec } from "../abilities";
import { defOf, isType } from "../cards";
import { defMv } from "../faces";
import { auraHostOptions, landsCantEnterBy, log, moveObject, player } from "../game";
import { newObjects } from "../mutate";
import type { GameState, ObjectId } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";
import { chooseAuraHosts, runZonesEffect } from "./run-zones";

type B274Effect = Extract<Effect, { type: "dimensionalBreach" | "breachReturn" }>;

/**
 * The mana value of a dies trigger's subject as it last existed on the battlefield (CR 603.10a, 608.2h): its copiable values
 * then (a copy's, a face-down one's 0, CR 707.2, 708.2), an {X} in its cost counting 0 (CR 202.3e). The subject is the card
 * it became in the graveyard, one zone change later; undefined if that isn't known.
 */
export function subjectLastMv(s: GameState, ctx: ResolveCtx): number | undefined {
  const subj = ctx.subject;
  const lk = subj ? s.lastKnown?.[subj.id] : undefined;
  if (!subj || !lk || lk.zc !== subj.zc - 1 || !lk.copyKey) return undefined;
  const d = s.cards[lk.copyKey];
  return d ? defMv(d) : undefined;
}

const PERMANENTS: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], text: "all permanents" };

/** The cards of `cards` still in exile as the objects they became there (CR 400.7). */
function stillExiled(s: GameState, cards: { id: ObjectId; zc: number }[]): ObjectId[] {
  return cards.filter((c) => s.objects[c.id]?.zone === "exile" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc).map((c) => c.id);
}

export function runLaneB274Effect(s: GameState, e: B274Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "dimensionalBreach": {
      // "Exile all permanents": every one on the battlefield (phased-out ones aren't there, CR 702.26b), as one event.
      const ids = objects(s, { ref: "each", filter: PERMANENTS }, ctx).map((o) => o.id);
      const paused = runZonesEffect(s, { type: "exile", what: { ref: "each", filter: PERMANENTS } }, ctx, src);
      if (paused) return paused;
      // "Those cards": the cards exiled this way, each as the object it became in exile (CR 400.7), a merged permanent's
      // other cards too (CR 730.3c); tokens aren't cards and cease to exist (CR 111.7, 704.5d). A commander its owner moves
      // to the command zone (CR 903.9a) no longer remains exiled.
      const cards = ids.flatMap((id) => {
        const o = s.objects[id];
        return o && o.zone === "exile" ? newObjects(o) : [];
      }).filter((c) => s.objects[c.id]?.zone === "exile" && !s.objects[c.id]!.isToken);
      if (!cards.length) return;
      // One delayed triggered ability (CR 603.7) for as long as any of them remains exiled (CR 610.3): it triggers at the
      // beginning of each player's upkeep, from the next turn on (triggers.ts), controlled by this spell's controller (CR
      // 603.7d); "that player" is that upkeep's active player.
      const anchor = s.objects[cards[0]!.id]!;
      addDelayed(s, "eachUpkeepWhileExiled", ctx.controller, anchor, { targets: [], effects: [{ type: "breachReturn", cards }], text: "that player returns one of the exiled cards they own to the battlefield." }, ctx.sourceDef.oracleId);
      return;
    }
    case "breachReturn": {
      // "That player returns one of the exiled cards they own to the battlefield": chosen as it resolves (CR 608.2d; rulings:
      // each player chooses during their own upkeep), only one that can legally be put onto the battlefield (rulings: an Aura
      // with nothing it could enchant, CR 303.4g, or a land while lands can't enter); with none, nothing happens. It enters
      // under that player's control (CR 110.2a), an Aura enchanting what they choose as it enters (CR 303.4f).
      const who = ctx.event?.player;
      if (who === undefined || player(s, who).lost) return;
      const sc = (s.resolving!.scratch ??= {});
      const legal = (id: ObjectId) => {
        const o = s.objects[id]!;
        const d = defOf(s, o);
        if (d.subtypes.includes("Aura") && !auraHostOptions(s, o, who).length) return false;
        return !(isType(d, "Land") && landsCantEnterBy(s));
      };
      const options = stillExiled(s, e.cards).filter((id) => s.objects[id]!.owner === who && legal(id));
      if (!options.length) return void log(s, `${player(s, who).name} has none of the cards exiled with ${src} to return.`);
      let pick = options.find((id) => id === sc.breachReturn?.pick);
      if (pick === undefined && options.length > 1 && !sc.breachReturn) {
        sc.breachReturn = {};
        s.pending = { kind: "chooseOption", player: who, source: src, what: "breachReturn", options, labels: options.map((id) => defOf(s, s.objects[id]!).name), prompt: "choose one of your exiled cards to return to the battlefield" };
        return "paused";
      }
      pick ??= options[0]!;
      sc.breachReturn = { pick };
      const card = s.objects[pick]!;
      const hosts = chooseAuraHosts(s, [{ o: card, under: who }], src);
      if (hosts === "paused") return "paused";
      const host = hosts.get(card.id);
      if (defOf(s, card).subtypes.includes("Aura") && !host) return void log(s, `${defOf(s, card).name} has nothing to enchant, so it stays in exile.`);
      log(s, `${player(s, who).name} returns ${defOf(s, card).name} to the battlefield (${src}).`);
      moveObject(s, card.id, "battlefield", { controller: who, ...host });
      return;
    }
  }
}
