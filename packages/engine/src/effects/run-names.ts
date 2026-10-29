import type { Effect, SameNameRef } from "../abilities";
import { defOf, isType, objIsType } from "../cards";
import { attackingPermanentOf, creatureTypesOf, enterTogether, log, loseLife, moveObject, obj, player, shareCreatureType } from "../game";
import { currentName } from "../names";
import { CREATURE_TYPES } from "../keywords";
import { shuffle, shuffleLibrary } from "../rng";
import type { GameState, ObjectId } from "../types";
import { bindChosen, objectMatches, printedMatches } from "./targeting";
import { attackChoices, chooseAuraHosts } from "./run-zones";
import { cantSearch, searchBarred } from "./run-library";
import type { AuraHost } from "../game";
import { characteristics, controllerOf } from "../layers";
import { ResolveCtx, amountNow, players } from "./resolve";

/** Card names (CR 201): exiling the cards with a name from a player's graveyard, hand and library; revealing until one. */
export function runNamesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exileNamed": {
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const pid = players(s, e.who, ctx)[0];
      if (pid === undefined) return;
      const p = player(s, pid);
      // Pick the Brain: "the same name as the exiled card", the one its instruction before exiled.
      const names = e.sameName ? namesFrom(s, e.sameName, ctx) : undefined;
      const name = names ? names[0] : e.sameAs !== undefined ? targetName(s, ctx, e.sameAs) : ctx.chosen?.name;
      const filter = { ...bindChosen(e.filter, ctx.chosen), ...(names ? { namedAny: names } : name !== undefined ? { named: name } : {}) };
      // No name (none was chosen, or the card was face down): the zones are searched, but nothing can be found (CR 701.23c).
      const match = (id: ObjectId) => name !== undefined && printedMatches(filter, defOf(s, obj(s, id)));
      if (e.handOnly) {
        // Hour of Glory: the hand is revealed, so all of them, no choice (and no library to shuffle).
        const ids = p.hand.filter(match);
        for (const id of ids) moveObject(s, id, "exile");
        log(s, `${p.name} exiles ${ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no cards"} from their hand.`);
        return;
      }
      if (!sc.found) {
        r.exiledFromHand = 0;
        // "All cards": the ones in the graveyard, a public zone, must be found; in the hidden hand and library, the
        // searcher may leave some (CR 701.23b). "Any number", "up to four": any of them, from any of the zones (rulings).
        sc.forced = e.all ? p.graveyard.filter(match) : [];
        // Ashiok, Dream Render: not your own library, if it's yours this searches. Stranglehold: no library.
        const lib = (pid === ctx.controller && searchBarred(s, pid)) || cantSearch(s, ctx.controller) ? [] : p.library;
        const cards = [...(e.all ? [] : p.graveyard.filter(match)), ...p.hand.filter(match), ...lib.filter(match)];
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
      shuffleLibrary(s, p);
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
      const who = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (who === undefined) return;
      const p = player(s, who);
      const filter = bindChosen(e.filter, ctx.chosen);
      // "Shares a card type with that permanent": its types as it last existed if it's gone (CR 608.2h).
      const shared = e.sharesTypeWith === undefined ? undefined : targetTypes(s, ctx, e.sharesTypeWith);
      if (shared && !shared.length) return;
      // "Shares a creature type with it" (Heirloom Blade): the creature that died, as it last existed (rulings). With no
      // creature type, nothing shares one: the whole library is revealed.
      // Descendants' Fury: the creature sacrificed this way, as it last existed (rulings).
      const sacked = e.sharesCreatureTypeWithSacrificed ? s.resolving!.sacrificedThisWay?.[s.resolving!.sacrificedThisWay.length - 1] : undefined;
      const kin = e.sharesCreatureTypeWithSubject ? subjectCreatureTypes(s, ctx) : sacked ? (sacked.allCreatureTypes ? ("all" as const) : new Set((sacked.subtypes ?? []).filter((t) => CREATURE_TYPES.has(t)))) : undefined;
      const matches = (id: ObjectId) => printedMatches(filter, defOf(s, obj(s, id))) && (!shared || defOf(s, obj(s, id)).types.some((t) => shared.includes(t))) && (!(e.sharesCreatureTypeWithSubject || e.sharesCreatureTypeWithSacrificed) || (!!kin && shareCreatureType(kin, creatureTypesOf(s, obj(s, id)))));
      // "Until you reveal X land cards" (Open the Way): X of them, or as many as there are; with X = 0, none is revealed.
      const want = e.n === undefined ? 1 : Math.max(0, amountNow(s, e.n, ctx));
      const named = !(filter.chosen === "name" && ctx.chosen?.name === undefined);
      const hits: ObjectId[] = [];
      let end = want ? p.library.length : 0;
      for (let i = 0; named && i < end; i++)
        if (matches(p.library[i]!) && hits.push(p.library[i]!) === want) end = i + 1;
      const seen = p.library.slice(0, end);
      // Songbirds' Blessing: "You may put that card onto the battlefield. If you don't, put it into your hand." Asked first;
      // nothing has moved yet, so resuming reveals the same cards.
      const sc = (s.resolving!.scratch ??= {});
      // Hei Bai, Forest Guardian: "You may put that card onto the battlefield. Then shuffle.": if you don't, it stays.
      if ((e.mayElseHand || e.mayStay) && hits.length && sc.may === undefined) {
        s.pending = { kind: "chooseMay", player: p.id, prompt: `put ${defOf(s, obj(s, hits[0]!)).name} onto the battlefield`, otherwise: e.mayStay ? "If you don't, it stays in your library." : "If you don't, it goes into your hand.", source: src, card: hits[0]! };
        return "paused";
      }
      const declined = e.mayStay && !sc.may ? hits.splice(0) : [];
      const found = e.mayElseHand && !sc.may ? "hand" : e.found;
      // An Aura found for the battlefield: its new controller chooses what it enchants as it enters (CR 303.4f), or it
      // stays in the library (303.4g); with a hand to go to instead, it goes there (rulings on Songbirds' Blessing).
      const hosts = found === "battlefield" ? chooseAuraHosts(s, hits.map((id) => ({ o: obj(s, id), under: e.yours ? ctx.controller : p.id })), src) : new Map<ObjectId, AuraHost>();
      if (hosts === "paused") return "paused";
      const unattached = hits.filter((id) => found === "battlefield" && defOf(s, obj(s, id)).subtypes.includes("Aura") && !hosts.has(id));
      const stays = e.mayElseHand ? [] : unattached;
      const toHand = e.mayElseHand ? unattached : [];
      for (const id of [...stays, ...toHand]) hits.splice(hits.indexOf(id), 1);
      // "Tapped and attacking" (Raph & Mikey, CR 508.4): during combat, attacking a player, planeswalker or battle its
      // controller chooses as it enters (rulings), never declared as an attacker; outside combat only tapped (CR 506.3d).
      // Asked before anything moves, so resuming reveals the same cards.
      const attackOptions = e.attacking && found === "battlefield" && hits.some((id) => isType(defOf(s, obj(s, id)), "Creature")) ? attackChoices(s, p.id, ctx.sourceId) : [];
      if (attackOptions.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${defOf(s, obj(s, hits.find((id) => isType(defOf(s, obj(s, id)), "Creature"))!)).name} attacks` };
        return "paused";
      }
      const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
      const hit = hits[0];
      s.resolving!.revealedUntilCount = seen.length;
      if (hit) s.resolving!.revealedUntilMv = characteristics(s, obj(s, hit)).manaValue;
      else delete s.resolving!.revealedUntilMv;
      log(s, `${p.name} ${e.exile ? "exiles" : "reveals"} ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}${hit || !want ? "" : `, finding no ${filter.text}`}.`);
      // Venture Forth: the cards are exiled one at a time until a land card is (CR 406.3), then go on from exile.
      if (e.exile) for (const id of seen) moveObject(s, id, "exile");
      for (const id of stays) log(s, `${defOf(s, obj(s, id)).name} has nothing to enchant, so it stays in the library.`);
      // Several found for the battlefield enter at the same time (Open the Way, Kindred Summons).
      if (found === "graveyard") {
        // Old Stickfingers: all of them at once (CR 608.2c).
        for (const id of hits) moveObject(s, id, "graveyard");
        if (hits.length) log(s, `${p.name} puts ${hits.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their graveyard.`);
      } else
        enterTogether(s, () =>
          hits.forEach((id) => {
            moveObject(s, id, found, { ...(e.tapped ? { tapped: true } : {}), ...(found === "battlefield" ? { controller: e.yours ? ctx.controller : p.id, ...hosts.get(id) } : {}) });
            const o = obj(s, id);
            if (attack && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
              o.attacking = attack.player;
              if (attack.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
              log(s, `${defOf(s, o).name} is attacking ${attack.label}.`);
            }
          }),
        );
      if (e.remember && s.resolving) s.resolving.created = found === "battlefield" ? hits.filter((id) => obj(s, id).zone === "battlefield") : [];
      for (const id of toHand) {
        log(s, `${defOf(s, obj(s, id)).name} has nothing to enchant, so it goes into ${p.name}'s hand.`);
        moveObject(s, id, "hand");
      }
      if (e.mayElseHand && found === "hand") for (const id of hits) log(s, `${p.name} puts ${defOf(s, obj(s, id)).name} into their hand.`);
      for (const id of declined) log(s, `${p.name} leaves ${defOf(s, obj(s, id)).name} in their library.`);
      const rest = seen.filter((id) => !hits.includes(id) && !stays.includes(id) && !toHand.includes(id));
      if (e.rest === "bottom") {
        // "The rest on the bottom of your library in a random order" (CR 701.20a), every one of them if none was found.
        const order = [...rest];
        shuffle(s, order);
        for (const id of order) {
          if (e.exile) {
            if (obj(s, id).zone === "exile") moveObject(s, id, "library");
            continue;
          }
          p.library.splice(p.library.indexOf(id), 1);
          p.library.push(id);
        }
        if (order.length) log(s, `${p.name} puts ${order.length} card${order.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
      } else if (e.rest === "shuffle") {
        shuffleLibrary(s, p);
        log(s, `${p.name} shuffles their library.`);
      } else if (e.rest === "graveyard") {
        for (const id of rest) moveObject(s, id, "graveyard");
        if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} into their graveyard.`);
      } else for (const id of rest) moveObject(s, id, "exile");
      if (e.lifePerRest && rest.length) {
        loseLife(s, p.id, rest.length);
        log(s, `${p.name} loses ${rest.length} life.`);
      }
      return;
    }
  }
}

/**
 * The names "the same name as ..." means as it resolves (CR 201.2; see SameNameRef): none if that object has none, a
 * face-down one (CR 708.2a), or is gone without a trace.
 */
export function namesFrom(s: GameState, ref: SameNameRef, ctx: ResolveCtx): string[] {
  const one = (n: string | undefined) => (n === undefined ? [] : [n]);
  if ("target" in ref) {
    if (!ref.card) return one(targetName(s, ctx, ref.target));
    // Deicide: "the exiled card", the card itself where it is now (rulings), not what the permanent was.
    const t = ctx.targets[ref.target];
    const o = t?.kind === "object" && ctx.legal[ref.target] ? s.objects[t.id] : undefined;
    return one(o && !o.faceDown ? currentName(s, o) : undefined);
  }
  if ("subject" in ref) {
    // Remembrance: the creature that died, as it last existed (a copy's copied name, rulings), one zone change ago.
    const sub = ctx.subject;
    const o = sub ? s.objects[sub.id] : undefined;
    if (!sub || !o) return [];
    if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === sub.zc) return one(currentName(s, o));
    const lk = s.lastKnown?.[o.id];
    if (!lk || (lk.zc !== sub.zc && lk.zc !== sub.zc - 1)) return [];
    return one(lk.source?.name ?? (lk.copyKey ? s.cards[lk.copyKey]?.name : undefined));
  }
  if ("spell" in ref) return one(ctx.cause !== undefined ? s.castItems?.[ctx.cause]?.castName : undefined);
  if ("permanents" in ref) {
    // Pattern Matcher: "another creature you control", each one's name now (a copy's copied name, rulings on Doubling
    // Chant); never a face-down one's (CR 708.2a). One entry for each permanent (Doubling Chant's one card for each).
    const whose = ref.whose ? players(s, ref.whose, ctx)[0] : ctx.controller;
    return s.battlefield
      .map((id) => s.objects[id]!)
      .filter((o) => !o.faceDown && controllerOf(s, o) === whose && !(ref.other && o.id === ctx.sourceId) && objectMatches(s, ref.permanents, o, ctx.controller, false))
      .map((o) => characteristics(s, o).name);
  }
  if ("yourGraveyard" in ref) return player(s, ctx.controller).graveyard.map((id) => defOf(s, obj(s, id)).name);
  // Assembly Hall: "that card", the one revealed from your hand, still there.
  if ("revealed" in ref) return (s.resolving?.revealedFromHandIds ?? []).filter((id) => s.objects[id]?.zone === "hand").map((id) => defOf(s, obj(s, id)).name);
  // "Each card exiled this way" (Haunting Echoes), "the exiled card" (Pick the Brain): those still in exile.
  return (s.resolving?.exiledCards ?? []).filter((id) => s.objects[id]?.zone === "exile").map((id) => defOf(s, obj(s, id)).name);
}

/** The trigger subject's creature types: as it is on the battlefield, or as it last existed there (CR 608.2h). */
function subjectCreatureTypes(s: GameState, ctx: ResolveCtx): Set<string> | "all" | undefined {
  const sub = ctx.subject;
  const o = sub ? s.objects[sub.id] : undefined;
  if (!sub || !o) return undefined;
  if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === sub.zc) return creatureTypesOf(s, o);
  // A dies trigger's subject is the card in its new zone, one zone change after it left the battlefield.
  const lk = s.lastKnown?.[o.id];
  if (!lk?.creatureTypes || (lk.zc !== sub.zc && lk.zc !== sub.zc - 1)) return undefined;
  return lk.creatureTypes === "all" ? "all" : new Set(lk.creatureTypes);
}

/** The card types of target `index`: as it is on the battlefield, or as it last existed there (CR 608.2h). */
function targetTypes(s: GameState, ctx: ResolveCtx, index: number): string[] {
  const t = ctx.targets[index];
  if (!ctx.legal[index] || t?.kind !== "object") return [];
  const o = s.objects[t.id];
  if (!o) return [];
  if (o.zone === "battlefield") return characteristics(s, o).types;
  const lk = s.lastKnown?.[o.id];
  return lk && lk.zc === (o.zoneChanges ?? 0) - 1 ? (lk.source?.types ?? []) : [];
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
