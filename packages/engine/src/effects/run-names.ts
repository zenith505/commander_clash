import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, loseLife, moveObject, obj, player } from "../game";
import { currentName } from "../names";
import { shuffle } from "../rng";
import type { GameState, ObjectId } from "../types";
import { bindChosen, printedMatches } from "./targeting";
import { ResolveCtx, players } from "./resolve";

/** Card names (CR 201): exiling the cards with a name from a player's graveyard, hand and library; revealing until one. */
export function runNamesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exileNamed": {
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const pid = players(s, e.who, ctx)[0];
      if (pid === undefined) return;
      const p = player(s, pid);
      const name = e.sameAs !== undefined ? targetName(s, ctx, e.sameAs) : ctx.chosen?.name;
      const filter = { ...bindChosen(e.filter, ctx.chosen), ...(name !== undefined ? { named: name } : {}) };
      // No name (none was chosen, or the card was face down): the zones are searched, but nothing can be found (CR 701.23c).
      const match = (id: ObjectId) => name !== undefined && printedMatches(filter, defOf(s, obj(s, id)));
      if (!sc.found) {
        r.exiledFromHand = 0;
        // "All cards": the ones in the graveyard, a public zone, must be found; in the hidden hand and library, the
        // searcher may leave some (CR 701.23b). "Any number", "up to four": any of them, from any of the zones (rulings).
        sc.forced = e.all ? p.graveyard.filter(match) : [];
        const cards = [...(e.all ? [] : p.graveyard.filter(match)), ...p.hand.filter(match), ...p.library.filter(match)];
        const max = Math.min(e.max ?? cards.length, cards.length);
        if (cards.length) {
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `cards named ${name}`, cards, min: 0, max, zonesOf: pid, ...(sc.forced.length ? { also: sc.forced } : {}) };
          return "paused";
        }
        sc.found = [];
      }
      const ids = [...(sc.forced ?? []), ...sc.found].filter((id) => obj(s, id).owner === pid && ["graveyard", "hand", "library"].includes(obj(s, id).zone));
      const fromHand = ids.filter((id) => obj(s, id).zone === "hand").length;
      for (const id of ids) moveObject(s, id, "exile");
      r.exiledFromHand = fromHand;
      log(s, `${player(s, ctx.controller).name} searches ${p.name}'s graveyard, hand and library${name ? ` for cards named ${name}` : ""} and exiles ${ids.length || "none"}${ids.length ? ` (${fromHand} from their hand)` : ""}.`);
      shuffle(s, p.library);
      log(s, `${p.name} shuffles their library.`);
      return;
    }
    case "banName": {
      const name = e.sameAs !== undefined ? targetName(s, ctx, e.sameAs) : ctx.chosen?.name;
      if (name === undefined) return;
      const who = e.who && players(s, e.who, ctx);
      (s.namedBansUntil ??= []).push({ name, ...(who ? { players: who } : {}), ...(e.lands ? { lands: true as const } : {}), controller: ctx.controller, source: src });
      const until = `until ${player(s, ctx.controller).name}'s next turn`;
      log(s, who ? `${who.map((p) => player(s, p).name).join(", ")} can't cast spells named ${name} ${until}.` : `Spells named ${name} can't be cast${e.lands ? " and lands named it can't be played" : ""} ${until}.`);
      return;
    }
    case "revealUntil": {
      // "Reveal cards from the top of your library until you reveal a card with the chosen name" (CR 701.20a): with none,
      // the whole library is revealed (rulings on Demonic Consultation).
      const p = player(s, ctx.controller);
      const filter = bindChosen(e.filter, ctx.chosen);
      const at = ctx.chosen?.name === undefined ? -1 : p.library.findIndex((id) => printedMatches(filter, defOf(s, obj(s, id))));
      const seen = p.library.slice(0, at < 0 ? p.library.length : at + 1);
      const hit = at < 0 ? undefined : p.library[at];
      log(s, `${p.name} reveals ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}${hit ? "" : `, finding no ${filter.text}`}.`);
      if (hit) moveObject(s, hit, "hand");
      const rest = seen.filter((id) => id !== hit);
      for (const id of rest) moveObject(s, id, "exile");
      if (e.lifePerRest && rest.length) {
        loseLife(s, p.id, rest.length);
        log(s, `${p.name} loses ${rest.length} life.`);
      }
      return;
    }
  }
}

/**
 * The name of target `index` for "the same name as that spell" (Counterbore), "as that land" (Crumble to Dust): a spell's
 * card's, even once it's been countered; a permanent's as it last existed on the battlefield, if this moved it (CR 608.2h);
 * a card's in a graveyard. A face-down one has none (CR 708.2a).
 */
function targetName(s: GameState, ctx: ResolveCtx, index: number): string | undefined {
  const t = ctx.targets[index];
  if (!ctx.legal[index] || !t) return undefined;
  if (t.kind === "stack") {
    const id = ctx.spellObjects?.[index];
    const o = id ? s.objects[id] : undefined;
    return o && !o.faceDown ? defOf(s, o).name : undefined;
  }
  if (t.kind !== "object") return undefined;
  const o = s.objects[t.id];
  if (!o) return undefined;
  const lk = s.lastKnown?.[o.id];
  if (o.zone !== "battlefield" && lk && lk.zc === (o.zoneChanges ?? 0) - 1) return lk.copyKey ? s.cards[lk.copyKey]?.name : defOf(s, o).name;
  return currentName(s, o);
}
