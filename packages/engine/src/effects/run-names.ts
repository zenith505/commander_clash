import type { Effect, SameNameRef } from "../abilities";
import { defOf, isType, objIsType } from "../cards";
import { attackingPermanentOf, creatureTypesOf, enterTogether, log, loseLife, moveObject, obj, player, shareCreatureType } from "../game";
import { currentName } from "../names";
import { defMv, restingDef } from "../faces";
import { addCopyEffect, copyKey } from "../copies";
import { CREATURE_TYPES } from "../keywords";
import { shuffle, shuffleLibrary } from "../rng";
import type { GameState, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, objectMatches, printedMatches } from "./targeting";
import { attackChoices, chooseAuraHosts } from "./run-zones";
import { cantSearch, searchBarred, toBottom } from "./run-library";
import type { AuraHost } from "../game";
import { characteristics, controllerOf } from "../layers";
import { ResolveCtx, amountCtx, amountNow, apnap, players, runEffect, subjectCreatureTypes } from "./resolve";

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
      // Reap Intellect (round B245): several names, any of them.
      const named = names && names.length > 1 ? names.join(" or ") : name;
      if (e.handOnly) {
        // Hour of Glory: the hand is revealed, so all of them, no choice (and no library to shuffle).
        // Legion's End: and from their graveyard, a public zone (CR 404.2), every one of them too.
        const ids = [...p.hand.filter(match), ...(e.andGraveyard ? p.graveyard.filter(match) : [])];
        for (const id of ids) moveObject(s, id, "exile");
        log(s, `${p.name} exiles ${ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no cards"} from their hand${e.andGraveyard ? " and graveyard" : ""}.`);
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
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `cards named ${named}`, cards, min: 0, max, zonesOf: pid, ...(sc.forced.length ? { also: sc.forced } : {}) };
          return "paused";
        }
        sc.found = [];
      }
      const ids = [...(sc.forced ?? []), ...sc.found].filter((id) => obj(s, id).owner === pid && ["graveyard", "hand", "library"].includes(obj(s, id).zone));
      const fromHand = ids.filter((id) => obj(s, id).zone === "hand").length;
      for (const id of ids) moveObject(s, id, "exile");
      // Kotose, the Silent Spider (round 420): "the exiled cards", the ones still in exile.
      for (const id of ids) if (obj(s, id).zone === "exile") (r.namedExiled ??= []).push(id);
      r.exiledFromHand = fromHand;
      log(s, `${player(s, ctx.controller).name} searches ${p.name}'s graveyard, hand and library${named ? ` for cards named ${named}` : ""} and exiles ${ids.length || "none"}${ids.length ? ` (${fromHand} from their hand)` : ""}.`);
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
    case "revealUntilPerExiled": {
      // Chaotic Transformation (rulings): the permanents were exiled at once; each one's controller as it last existed (CR
      // 608.2h) reveals until a card that shares a card type with it as it last existed, puts that card onto the
      // battlefield and shuffles, one permanent at a time; a player with several chooses the order.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.chaos) {
        const ex = (s.resolving!.exiled ?? []).filter((x) => x.controller !== undefined);
        const order = apnap(s, [...new Set(ex.map((x) => x.controller!))]);
        sc.chaos = { left: order.flatMap((pid) => ex.filter((x) => x.controller === pid).map((x) => ({ id: x.o.id, controller: pid, types: [...x.ch.types], name: x.ch.name }))) };
      }
      const st = sc.chaos;
      while (st.left.length) {
        if (st.current === undefined) {
          const pid = st.left[0]!.controller;
          const mine = st.left.filter((x) => x.controller === pid);
          let pick = mine[0]!;
          if (mine.length > 1 && !e.filter && !player(s, pid).lost) {
            if (sc.nextExiled === undefined) {
              s.pending = { kind: "chooseOption", player: pid, source: src, what: "nextExiled", options: mine.map((x) => x.id), labels: mine.map((x) => x.name), prompt: "choose the exiled permanent to reveal for next" };
              return "paused";
            }
            pick = mine.find((x) => x.id === sc.nextExiled) ?? pick;
            sc.nextExiled = undefined;
          }
          st.current = pick.id;
        }
        const cur = st.left.find((x) => x.id === st.current)!;
        if (!player(s, cur.controller).lost) {
          const r = runEffect(s, e.filter ? { type: "revealUntil", filter: e.filter, found: "battlefield", rest: e.rest ?? "shuffle", who: { ref: "eachOne" } } : { type: "revealUntil", filter: { kind: "card", types: [], notTypes: [], notColors: [], text: `card that shares a card type with ${cur.name}` }, found: "battlefield", rest: "shuffle", who: { ref: "eachOne" }, sharesTypes: cur.types }, { ...ctx, eachOne: cur.controller });
          if (r === "paused") return "paused";
        }
        st.left = st.left.filter((x) => x.id !== cur.id);
        st.current = undefined;
      }
      sc.chaos = undefined;
      return;
    }
    case "revealUntilPerDestroyed": {
      // Indomitable Creativity (rulings): each destroyed permanent's controller as it last existed, once for each, in
      // turn order; the revealed cards stay in the library (on top) until the shuffle, so a second reveal sees them again;
      // a player whose library has no such card reveals it all and exiles nothing. Then all the exiled cards enter at
      // once (CR 608.2c), and each of those players shuffles.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.creativity) {
        const by = new Map<PlayerId, number>();
        for (const d of s.resolving!.destroyed ?? []) if (d.controller !== undefined) by.set(d.controller, (by.get(d.controller) ?? 0) + 1);
        const exiled: { id: ObjectId; under: PlayerId }[] = [];
        const who = apnap(s, [...by.keys()]).filter((pid) => !player(s, pid).lost);
        for (const pid of who) {
          const p = player(s, pid);
          for (let i = 0; i < by.get(pid)!; i++) {
            const at = p.library.findIndex((id) => printedMatches(e.filter, defOf(s, obj(s, id))));
            const seen = at < 0 ? [...p.library] : p.library.slice(0, at + 1);
            log(s, `${p.name} reveals ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}${at < 0 ? `, finding no ${e.filter.text}` : ""}.`);
            if (at < 0) break;
            const hit = p.library[at]!;
            moveObject(s, hit, "exile");
            if (obj(s, hit).zone === "exile") {
              exiled.push({ id: hit, under: pid });
              log(s, `${p.name} exiles ${defOf(s, obj(s, hit)).name}.`);
            }
          }
        }
        sc.creativity = { exiled: exiled.map((x) => ({ ...x, zc: obj(s, x.id).zoneChanges ?? 0 })), shufflers: who };
      }
      const st = sc.creativity;
      const still = st.exiled.filter((x) => s.objects[x.id]?.zone === "exile" && (s.objects[x.id]!.zoneChanges ?? 0) === x.zc);
      // An Aura among them: its new controller chooses what it enchants as it enters, or it stays exiled (CR 303.4f-g).
      const hosts = chooseAuraHosts(s, still.map((x) => ({ o: obj(s, x.id), under: x.under })), src);
      if (hosts === "paused") return "paused";
      const entering = still.filter((x) => !defOf(s, obj(s, x.id)).subtypes.includes("Aura") || hosts.has(x.id));
      enterTogether(s, () => entering.forEach((x) => moveObject(s, x.id, "battlefield", { controller: x.under, ...hosts.get(x.id) })));
      if (entering.length) log(s, `${entering.map((x) => `${player(s, x.under).name} puts ${defOf(s, obj(s, x.id)).name}`).join(", ")} onto the battlefield.`);
      for (const pid of st.shufflers) {
        if (player(s, pid).lost) continue;
        shuffleLibrary(s, player(s, pid));
        log(s, `${player(s, pid).name} shuffles their library.`);
      }
      return;
    }
    case "revealUntil": {
      // "Reveal cards from the top of your library until you reveal a card with the chosen name" (CR 701.20a): with none,
      // the whole library is revealed (rulings on Demonic Consultation).
      const who = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (who === undefined) return;
      const p = player(s, who);
      // Bag of Tricks: "a creature card with mana value equal to the result", the roll's (TargetSpec.bound).
      const filter = bindBound(s, bindChosen(e.filter, ctx.chosen), amountCtx(s, ctx));
      // "Shares a card type with that permanent": its types as it last existed if it's gone (CR 608.2h).
      const shared = e.sharesTypes ?? (e.sharesTypeWith === undefined ? undefined : targetTypes(s, ctx, e.sharesTypeWith));
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
      // Thought Dissector: "or X cards are revealed, whichever comes first".
      let end = want ? (e.atMost === undefined ? p.library.length : Math.min(p.library.length, Math.max(0, amountNow(s, e.atMost, ctx)))) : 0;
      for (let i = 0; named && i < end; i++)
        if (matches(p.library[i]!) && hits.push(p.library[i]!) === want) end = i + 1;
      const seen = p.library.slice(0, end);
      // Fathom Trawl: "the rest ... on the bottom of your library in any order": their owner orders them (CR 401.4), asked
      // before anything moves, so resuming reveals the same cards. Proteus Staff: the same with the card found entering.
      if (e.rest === "bottomOrder" && seen.filter((id) => !hits.includes(id)).length > 1 && !s.resolving!.scratch?.arranged) {
        s.pending = { kind: "arrangeTop", player: p.id, how: "bottom", cards: seen.filter((id) => !hits.includes(id)), source: src };
        return "paused";
      }
      // Songbirds' Blessing: "You may put that card onto the battlefield. If you don't, put it into your hand." Asked first;
      // nothing has moved yet, so resuming reveals the same cards.
      const sc = (s.resolving!.scratch ??= {});
      // Hei Bai, Forest Guardian: "You may put that card onto the battlefield. Then shuffle.": if you don't, it stays.
      // Genesis Storm: "You may put that card onto the battlefield. Then put all cards revealed this way that weren't put onto
      // the battlefield on the bottom of your library in a random order."
      if ((e.mayElseHand || e.mayStay || e.mayElseBottom) && hits.length && sc.may === undefined) {
        s.pending = { kind: "chooseMay", player: p.id, prompt: `put ${defOf(s, obj(s, hits[0]!)).name} onto the battlefield`, otherwise: e.mayStay ? "If you don't, it stays in your library." : e.mayElseBottom ? "If you don't, it goes on the bottom of your library with the other revealed cards." : "If you don't, it goes into your hand.", source: src, card: hits[0]! };
        return "paused";
      }
      // Aurora Awakener (round 392): "Put any number of those permanent cards onto the battlefield": its controller picks
      // which of them, none too, asked before anything moves (so resuming reveals the same cards); those not picked go with
      // the rest of the revealed cards.
      if (e.anyNumber && hits.length && !sc.revealPicked) {
        sc.revealPicked = true;
        delete sc.found;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `any number of ${filter.text}s`, cards: [...hits], min: 0, max: hits.length, dig: { looked: seen, to: "onto the battlefield", rest: "on the bottom of your library in a random order" } };
        return "paused";
      }
      if (e.anyNumber) {
        const picked = sc.found ?? [];
        for (const id of hits.filter((h) => !picked.includes(h))) hits.splice(hits.indexOf(id), 1);
      }
      const declined = (e.mayStay || e.mayElseBottom) && !sc.may ? hits.splice(0) : [];
      // Part in Friendship: onto the battlefield only with a mana value (X as 0, rulings) at most the amount, else the hand.
      const found = (e.mayElseHand && !sc.may) || (e.ontoIfMvAtMost && hits[0] && defMv(defOf(s, obj(s, hits[0]))) > Math.max(0, amountNow(s, e.ontoIfMvAtMost, ctx))) ? "hand" : e.found;
      // An Aura found for the battlefield: its new controller chooses what it enchants as it enters (CR 303.4f), or it
      // stays in the library (303.4g); with a hand to go to instead, it goes there (rulings on Songbirds' Blessing).
      const hosts = found === "battlefield" ? chooseAuraHosts(s, hits.map((id) => ({ o: obj(s, id), under: e.yours ? ctx.controller : p.id })), src) : new Map<ObjectId, AuraHost>();
      if (hosts === "paused") return "paused";
      const unattached = hits.filter((id) => found === "battlefield" && defOf(s, obj(s, id)).subtypes.includes("Aura") && !hosts.has(id));
      const stays = e.mayElseHand || e.mayElseBottom || e.anyNumber ? [] : unattached;
      const toHand = e.mayElseHand ? unattached : [];
      // Genesis Storm: an Aura with nothing to enchant isn't put onto the battlefield, so it goes to the bottom (CR 303.4g).
      // Aurora Awakener: the same, it goes with the rest of the revealed cards.
      const bottomed = e.mayElseBottom || e.anyNumber ? unattached : [];
      for (const id of [...stays, ...toHand, ...bottomed]) hits.splice(hits.indexOf(id), 1);
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
      // Tunnel Vision: the card found stays where it is, the cards above it go to the graveyard, so it's on top; with none
      // found (or no name chosen) nothing goes there and the library is shuffled (rulings).
      if (found === "top") {
        if (hit) {
          const above = seen.filter((id) => id !== hit);
          for (const id of above) moveObject(s, id, "graveyard");
          log(s, above.length ? `${p.name} puts ${above.length} card${above.length === 1 ? "" : "s"} into their graveyard and leaves ${defOf(s, obj(s, hit)).name} on top of their library.` : `${defOf(s, obj(s, hit)).name} stays on top of ${p.name}'s library.`);
        } else {
          shuffleLibrary(s, p);
          log(s, `${p.name} shuffles their library.`);
        }
        return;
      }
      // Nascent Metamorph: the source, still the same object on the battlefield (CR 400.7), becomes a copy of the card found
      // until end of turn, its values as printed (CR 707.2); then that card goes on the bottom with the rest (rulings). With
      // none found, nothing is copied (rulings).
      if (found === "copySelf") {
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        if (hit && me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc)) {
          const base = restingDef(s.cards[obj(s, hit).cardId]!);
          const was = defOf(s, me).name;
          addCopyEffect(s, me, copyKey(s, base), "endOfTurn");
          log(s, `${was} becomes a copy of ${base.name} until end of turn.`);
        }
        hits.splice(0);
      }
      // Venture Forth: the cards are exiled one at a time until a land card is (CR 406.3), then go on from exile.
      if (e.exile) for (const id of seen) moveObject(s, id, "exile");
      for (const id of stays) log(s, `${defOf(s, obj(s, id)).name} has nothing to enchant, so it stays in the library.`);
      // Several found for the battlefield enter at the same time (Open the Way, Kindred Summons).
      if (found === "graveyard") {
        // Old Stickfingers: all of them at once (CR 608.2c).
        for (const id of hits) moveObject(s, id, "graveyard");
        if (hits.length) log(s, `${p.name} puts ${hits.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their graveyard.`);
      } else if (found !== "copySelf")
        enterTogether(s, () =>
          hits.forEach((id) => {
            // Rohirrim Chargers: attached to the exerted creature, if it's still that object and this could equip it.
            const d = defOf(s, obj(s, id));
            const host = e.equipToSubject && ctx.subject ? s.objects[ctx.subject.id] : undefined;
            const equip = host && found === "battlefield" && host.zone === "battlefield" && (host.zoneChanges ?? 0) === ctx.subject!.zc && d.subtypes.includes("Equipment") && !isType(d, "Creature") && objectMatches(s, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, host, p.id, false, d) ? { attachTo: host.id } : undefined;
            if (e.equipToSubject && found === "battlefield") log(s, `${p.name} puts ${d.name} onto the battlefield${equip ? ` attached to ${defOf(s, host!).name}` : ", unattached"}.`);
            moveObject(s, id, found, { ...(e.tapped ? { tapped: true } : {}), ...(found === "battlefield" ? { controller: e.yours ? ctx.controller : p.id, ...hosts.get(id), ...equip } : {}) });
            const o = obj(s, id);
            if (attack && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
              o.attacking = attack.player;
              if (attack.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
              log(s, `${defOf(s, o).name} is attacking ${attack.label}.`);
            }
          }),
        );
      if (e.remember && s.resolving) s.resolving.created = found === "battlefield" ? hits.filter((id) => obj(s, id).zone === "battlefield") : [];
      // Thought Dissector: "and sacrifice ~", once an artifact card was revealed, if ~ is still that permanent (CR 400.7).
      if (e.sacrificeSelfIfFound && hit) {
        runEffect(s, { type: "sacrifice", what: { ref: "self" } }, ctx);
      }
      for (const id of toHand) {
        log(s, `${defOf(s, obj(s, id)).name} has nothing to enchant, so it goes into ${p.name}'s hand.`);
        moveObject(s, id, "hand");
      }
      if (e.mayElseHand && found === "hand") for (const id of hits) log(s, `${p.name} puts ${defOf(s, obj(s, id)).name} into their hand.`);
      for (const id of declined) log(s, e.mayElseBottom ? `${p.name} doesn't put ${defOf(s, obj(s, id)).name} onto the battlefield.` : `${p.name} leaves ${defOf(s, obj(s, id)).name} in their library.`);
      for (const id of bottomed) log(s, `${defOf(s, obj(s, id)).name} has nothing to enchant, so it isn't put onto the battlefield.`);
      const rest = seen.filter((id) => !hits.includes(id) && !stays.includes(id) && !toHand.includes(id));
      if (e.rest === "bottomOrder") {
        if (toBottom(s, p.id, rest, src, false) === "paused") return "paused";
        sc.arranged = undefined;
      } else if (e.rest === "bottom") {
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
  if ("chosenThisWay" in ref)
    // Clarion Ultimatum: the chosen permanents still on the battlefield, by their names now (a copy's copied name, rulings).
    return (s.resolving?.created ?? []).map((id) => s.objects[id]).filter((o): o is NonNullable<typeof o> => !!o && o.zone === "battlefield" && !o.faceDown).map((o) => characteristics(s, o).name);
  // Deadly Cover-Up (round B245): the card exiled from an opponent's graveyard just before, still that card in exile.
  if ("yardChosen" in ref) {
    const c = s.resolving?.chosenFromYard;
    const o = c ? s.objects[c.id] : undefined;
    return o && o.zone === "exile" && (o.zoneChanges ?? 0) === c!.zc && !o.faceDown ? [defOf(s, o).name] : [];
  }
  if ("yourGraveyard" in ref) return player(s, ctx.controller).graveyard.map((id) => defOf(s, obj(s, id)).name);
  // Assembly Hall: "that card", the one revealed from your hand, still there.
  if ("revealed" in ref) return (s.resolving?.revealedFromHandIds ?? []).filter((id) => s.objects[id]?.zone === "hand").map((id) => defOf(s, obj(s, id)).name);
  // "Each card exiled this way" (Haunting Echoes), "the exiled card" (Pick the Brain): those still in exile.
  return (s.resolving?.exiledCards ?? []).filter((id) => s.objects[id]?.zone === "exile").map((id) => defOf(s, obj(s, id)).name);
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
