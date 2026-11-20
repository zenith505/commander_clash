// Lane B round B273's effects: Spellweaver Volute's copy of the instant card it enchants. (Bludgeon Brawl is a static
// ability: Modification addAbility `mvX` in layers.ts.)
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { auraHostKey, auraHostLabels, auraHostOptions, castProblem, log, moveObject, newObject, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import type { GameObject, GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";

type B273Effect = Extract<Effect, { type: "copyEnchantedCard" }>;

/** A copy of a card not cast ceases to exist (CR 704.5e, 707.10a), from the graveyard it was created in. */
function removeGraveyardCopy(s: GameState, id: ObjectId) {
  const o = s.objects[id];
  if (!o || o.zone !== "graveyard") return;
  const list = player(s, o.owner).graveyard;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  delete s.objects[id];
}

export function runLaneB273Effect(s: GameState, e: B273Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "copyEnchantedCard": {
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      const me: GameObject | undefined = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      // ~ still on the battlefield as the object whose ability this is (CR 400.7).
      const here = !!me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
      if (!sc.enchantedCopy) {
        // "The enchanted instant card": the one it enchants now; once it has left the battlefield, the one it enchanted as
        // it last existed there, copied even if that card has since left the graveyard (rulings). With the card gone
        // first, ~ fell off enchanting nothing, so nothing is copied (rulings).
        const lk = !here && ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
        const link = here ? me!.enchantsCard : lk && (ctx.sourceZc === undefined || lk.zc === ctx.sourceZc) ? lk.enchantsCard : undefined;
        const now = link && s.objects[link.id];
        const stillThere = !!now && now.zone === "graveyard" && (now.zoneChanges ?? 0) === link!.zc;
        if (!link || !now || (here && !stillThere)) return void log(s, `${src} isn't enchanting a card, so nothing is copied.`);
        // CR 707.12: the copy is created in the graveyard (in its caster's, as the engine keeps each card in its owner's
        // zones) and cast from there while this resolves.
        const d = defOf(s, now);
        const copy = newObject(s, d, p.id, "graveyard");
        copy.spellCopy = true;
        p.graveyard.push(copy.id);
        sc.enchantedCopy = { copy: copy.id, card: { ...link } };
        log(s, `${src} copies ${d.name}.`);
        s.pending = { kind: "castFree", player: p.id, objectId: copy.id, source: src };
        if (castProblem(s, p.id, copy.id) === null) return "paused";
        s.pending = null;
        removeGraveyardCopy(s, copy.id);
        return void log(s, `The copy of ${d.name} can't be cast.`);
      }
      const st = sc.enchantedCopy;
      if (!st.cast) {
        const copy = s.objects[st.copy];
        // Not cast: it ceases to exist, and nothing else happens ("If you do").
        if (copy?.zone === "graveyard") {
          removeGraveyardCopy(s, st.copy);
          return;
        }
        if (!copy) return;
        st.cast = true;
        // "Exile the enchanted card": that card, if it's still in the graveyard as that object (CR 400.7).
        const card = s.objects[st.card.id];
        if (card && card.zone === "graveyard" && (card.zoneChanges ?? 0) === st.card.zc) {
          log(s, `${src} exiles ${defOf(s, card).name}.`);
          moveObject(s, card.id, "exile");
        }
        if (!here) return;
        // "Attach ~ to another instant card in a graveyard": chosen as it resolves, any graveyard's (not targeted, CR 701.3a).
        const options = auraHostOptions(s, me!, ctx.controller).filter((h) => "attachTo" in h && h.attachTo !== st.card.id);
        if (!options.length) return void log(s, `There's no other instant card in a graveyard for ${src} to be attached to.`);
        if (options.length > 1) {
          sc.auraAsking = me!.id;
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "enchant", options: options.map(auraHostKey), labels: auraHostLabels(s, options), prompt: `choose another instant card in a graveyard to attach ${defOf(s, me!).name} to` };
          return "paused";
        }
        (sc.auraHosts ??= {})[me!.id] = auraHostKey(options[0]!);
      }
      if (!here) return;
      const key = sc.auraHosts?.[me!.id];
      const host = key ? s.objects[key] : undefined;
      if (!host || host.zone !== "graveyard") return;
      // Attached to it (CR 701.3a), with a new timestamp (CR 613.7e); it's still the same object on the battlefield.
      me!.attachedTo = host.id;
      me!.enchantsCard = { id: host.id, zc: host.zoneChanges ?? 0 };
      me!.timestamp = s.nextTimestamp++;
      invalidateCharacteristics(s);
      log(s, `${defOf(s, me!).name} is attached to ${defOf(s, host).name} in ${player(s, host.owner).name}'s graveyard.`);
      return;
    }
  }
}
