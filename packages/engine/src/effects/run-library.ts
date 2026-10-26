import type { Effect, PlayerRef, SearchDest } from "../abilities";
import { abilitiesOf, cardIdOf, defOf, isPermanentCard, isType, objIsType } from "../cards";
import { controllerOf, invalidateCharacteristics, staticConditionNow } from "../layers";
import { compileCard } from "../oracle";
import { nextRandom, shuffle, shuffleLibrary } from "../rng";
import { attackingPermanentOf, castProblem, freeCastable, draw, gainLife, log, loseLife, millCount, moveObject, enterTogether, obj, oneOfEachFits, opponents, payableLife, player } from "../game";
import { manaValue, parseManaCost } from "../mana";
import type { GameState, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, objectMatches, pickOptions, printedMatches, sayBound } from "./targeting";
import { ResolveCtx, apnap, players, amountNow, amountCtx, amountFor, objects } from "./resolve";
import { describeDest } from "./describe";
import { fireEvent } from "./triggers";
import { attackChoices, chooseAuraHosts } from "./run-zones";
import { addDelayed } from "./run-spells";
import type { AuraHost } from "../game";
import { defMv, sameName } from "../faces";
import { characteristics } from "../layers";
import type { TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";

/** "Shares a color with a legendary creature you control" (Ringsight): their colors now; a colorless one shares none (rulings). */
function legendColors(s: GameState, spec: TargetSpec, pid: PlayerId): TargetSpec {
  const { colorOfYourLegend: _, ...rest } = spec;
  const colors = [...new Set(Object.values(s.objects).filter((o) => o.zone === "battlefield" && controllerOf(s, o) === pid).map((o) => characteristics(s, o)).filter((c) => c.types.includes("Creature") && c.supertypes.includes("Legendary")).flatMap((c) => c.colors))];
  // No color to share: nothing fits.
  return colors.length ? { ...rest, colors } : { ...rest, colors: ["W"], notColors: ["W"] };
}

/** Libraries, hands and graveyards: mill, discard, scry, surveil, search, look at the top cards. */
export function runLibraryEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "nextDrawExile":
      // Urabrask, Heretic Praetor: a replacement effect for that player's next draw this turn (CR 614.1a), used up by the
      // draw it replaces (see draw in game.ts).
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (p.lost) continue;
        (p.nextDrawExiles ??= []).push({ turn: s.turn, source: src });
        log(s, `The next time ${p.name} would draw a card this turn, they exile the top card of their library instead and may play it this turn (${src}).`);
      }
      return;
    case "revealUntilLandToGraveyard":
      // Consuming Aberration: each one reveals until a land card, then puts all of them, that one too, into their
      // graveyard; with no land card, the whole library (rulings). Revealing, not milling (CR 701.20a, 701.17a).
      // Mind Grind: until X land cards, all of the library with fewer (rulings).
      for (const pid of apnap(s, players(s, e.who, ctx))) {
        const p = player(s, pid);
        let lands = e.n === undefined ? 1 : amountNow(s, e.n, ctx);
        const at = lands < 1 ? -1 : p.library.findIndex((id) => isType(defOf(s, obj(s, id)), "Land") && --lands === 0);
        const ids = p.library.slice(0, at < 0 ? p.library.length : at + 1);
        if (!ids.length) continue;
        log(s, `${p.name} reveals ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} and puts ${ids.length === 1 ? "it" : "them"} into their graveyard.`);
        for (const id of ids) moveObject(s, id, "graveyard");
      }
      return;
    case "exileUntilTotalMv":
      // Tasha's Hideous Laughter: one card at a time, each player in turn order (CR 101.4), until the mana values of the
      // cards they exiled this way add up to the total (a land's is 0, a split card's both halves' added, CR 202.3), or
      // their library is empty.
      for (const pid of apnap(s, players(s, e.who, ctx))) {
        const p = player(s, pid);
        const ids: ObjectId[] = [];
        let total = 0;
        while (total < e.total && p.library.length) {
          const id = p.library[0]!;
          total += defMv(defOf(s, obj(s, id)));
          moveObject(s, id, "exile");
          ids.push(id);
        }
        if (ids.length) log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library (total mana value ${total}).`);
      }
      return;
    case "mill":
      // Kept for "if a card with the chosen name was milled this way" (Predict).
      s.resolving!.milled = [];
      s.resolving!.milledExiled = [];
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = millCount(s, pid, amountNow(s, e.n, { ...ctx, eachOne: pid }));
        for (const id of p.library.slice(0, n)) {
          moveObject(s, id, "graveyard", { milled: true });
          if (obj(s, id).zone === "graveyard") s.resolving!.milled.push({ id, zc: obj(s, id).zoneChanges ?? 0 });
          else if (obj(s, id).zone === "exile") s.resolving!.milledExiled.push({ id, zc: obj(s, id).zoneChanges ?? 0 });
        }
        log(s, `${p.name} mills ${n} card${n === 1 ? "" : "s"}.`);
      }
      return;
    case "exileTop":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const ids = p.library.slice(0, Math.max(0, amountNow(s, e.n, { ...ctx, eachOne: pid })));
        for (const id of ids) {
          moveObject(s, id, "exile");
          const o = obj(s, id);
          if (e.linked && ctx.sourceId && o.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
        }
        if (ids.length === 1 && s.resolving) s.resolving.exiledTop = { id: ids[0]!, zc: s.objects[ids[0]!]!.zoneChanges ?? 0 };
        if (s.resolving) s.resolving.exiledTopCards = ids;
        // An empty library: nothing happens (ingest rulings).
        if (ids.length) log(s, `${p.name} exiles ${ids.map((id) => defOf(s, s.objects[id]!).name).join(", ")} from the top of their library.`);
        // Only permanent cards can be put onto the battlefield (CR 110.4b); they enter at the same time.
        const put = e.putAll ? ids.filter((id) => p.exile.includes(id) && printedMatches(e.putAll!, defOf(s, obj(s, id))) && isPermanentCard(defOf(s, obj(s, id)))) : [];
        if (put.length) {
          log(s, `${player(s, ctx.controller).name} puts ${put.map((id) => defOf(s, obj(s, id)).name).join(", ")} onto the battlefield.`);
          enterTogether(s, () => put.forEach((id) => moveObject(s, id, "battlefield", { controller: ctx.controller })));
        }
      }
      return;
    case "putFromExiledTop": {
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.impulseChoice) {
        // Only permanent cards can be put onto the battlefield (CR 110.4b).
        const ids = (s.resolving?.exiledTopCards ?? []).filter((id) => s.objects[id]?.zone === "exile" && printedMatches(e.filter, defOf(s, obj(s, id))) && isPermanentCard(defOf(s, obj(s, id))));
        sc.impulseChoice = { ids };
        if (ids.length > 1) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "impulseChoice", options: ids, labels: ids.map((id) => defOf(s, obj(s, id)).name), prompt: `choose ${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text} to put onto the battlefield under your control` };
          return "paused";
        }
      }
      const st = sc.impulseChoice;
      sc.impulseChoice = undefined;
      const id = st.pick ?? st.ids[0];
      if (!id || s.objects[id]?.zone !== "exile") return;
      log(s, `${player(s, ctx.controller).name} puts ${defOf(s, obj(s, id)).name} onto the battlefield.`);
      moveObject(s, id, "battlefield", { controller: ctx.controller });
      return;
    }
    case "returnDiedThisWay": {
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.impulseChoice) {
        // The cards still in the graveyard the destroy put them into (CR 400.7): a token there ceased to exist (CR 704.5d).
        const ids = (s.resolving?.destroyed ?? []).filter((x) => x.died && s.objects[x.o.id]?.zone === "graveyard" && (s.objects[x.o.id]!.zoneChanges ?? 0) === (x.o.zoneChanges ?? 0) + 1 && !s.objects[x.o.id]!.isToken && printedMatches(e.filter, defOf(s, obj(s, x.o.id)))).map((x) => x.o.id);
        if (e.each) {
          // Sorin, Lord of Innistrad: "Return each card put into a graveyard this way": all of them at once (CR 608.2f).
          if (ids.length) log(s, `${player(s, ctx.controller).name} returns ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} to the battlefield under their control.`);
          enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: ctx.controller })));
          return;
        }
        sc.impulseChoice = { ids };
        if (ids.length > 1) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "impulseChoice", options: ids, labels: ids.map((id) => defOf(s, obj(s, id)).name), prompt: `choose ${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text} put into a graveyard this way to put onto the battlefield under your control` };
          return "paused";
        }
      }
      const st = sc.impulseChoice;
      sc.impulseChoice = undefined;
      const id = st.pick ?? st.ids[0];
      if (!id || s.objects[id]?.zone !== "graveyard") return;
      log(s, `${player(s, ctx.controller).name} returns ${defOf(s, obj(s, id)).name} to the battlefield.`);
      moveObject(s, id, "battlefield", { controller: ctx.controller });
      const o = obj(s, id);
      if (e.alsoMods && o.zone === "battlefield") {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "game", affected: [o.id], mods: e.alsoMods });
        invalidateCharacteristics(s);
      }
      // A delayed trigger about the permanent it became (CR 603.7c, 400.7).
      if (e.atEndStep && o.zone === "battlefield") addDelayed(s, e.atEndStep, ctx.controller, o, { targets: [], effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "Sacrifice ~." });
      return;
    }
    case "revealTop": {
      // An empty library: nothing is revealed, and an "if it's a ... card" after it is false.
      const whose = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (whose === undefined) return;
      const p = player(s, whose);
      if (e.randomFromHand) {
        // An empty hand likewise (Cursed Scroll).
        const id = p.hand.length ? p.hand[Math.floor(nextRandom(s) * p.hand.length)] : undefined;
        s.resolving!.revealed = id ? { id, zc: s.objects[id]!.zoneChanges ?? 0 } : undefined;
        log(s, id ? `${p.name} reveals ${defOf(s, obj(s, id)).name} at random from their hand.` : `${p.name} has no card in hand to reveal.`);
        return;
      }
      const id = p.library[0];
      s.resolving!.revealed = id ? { id, zc: s.objects[id]!.zoneChanges ?? 0 } : undefined;
      if (id) log(s, e.look ? `${p.name} looks at the top card of their library.` : `${p.name} reveals ${defOf(s, obj(s, id)).name} from the top of their library.`);
      return;
    }
    case "parleyReveal": {
      // Parley: each player reveals the top card of their library, in turn order (CR 101.4); an empty library reveals nothing.
      const counts = { land: 0, nonland: 0 };
      for (const pid of apnap(s, s.turnOrder.filter((p) => !player(s, p).lost))) {
        const p = player(s, pid);
        const id = p.library[0];
        if (!id) continue;
        const d = defOf(s, obj(s, id));
        counts[isType(d, "Land") ? "land" : "nonland"]++;
        log(s, `${p.name} reveals ${d.name} from the top of their library.`);
      }
      s.resolving!.parley = counts;
      return;
    }
    case "revealRevealed": {
      const rv = s.resolving?.revealed;
      const o = rv && s.objects[rv.id];
      if (o && (o.zoneChanges ?? 0) === rv.zc) log(s, `${player(s, ctx.controller).name} reveals ${defOf(s, o).name}.`);
      return;
    }
    case "revealTopToHand": {
      const p = player(s, ctx.controller);
      const id = p.library[0];
      // An empty library: nothing is revealed, and the life is 0.
      if (!id) return;
      const d = defOf(s, obj(s, id));
      log(s, `${p.name} reveals ${d.name} and puts it into their hand.`);
      moveObject(s, id, "hand");
      const n = defMv(d);
      if (!e.life || n <= 0) return;
      for (const pid of players(s, e.life.who, ctx)) {
        if (e.life.gain) gainLife(s, pid, n);
        else loseLife(s, pid, n);
        log(s, `${player(s, pid).name} ${e.life.gain ? "gains" : "loses"} ${n} life.`);
      }
      if (e.life.drain) {
        gainLife(s, p.id, n);
        log(s, `${p.name} gains ${n} life.`);
      }
      return;
    }
    case "duelReveal": {
      // Both cards are revealed at once; an empty library reveals nothing, a mana value of 0 for the other player. Then
      // both lose life at once, then each puts their card into their hand.
      // With one of them no longer a legal target, the other still reveals and takes their card, losing nothing (CR 608.2b).
      const who = e.between.flatMap((r) => players(s, r, ctx)).slice(0, 2);
      const top = who.map((pid) => player(s, pid).library[0]);
      who.forEach((pid, i) => top[i] && log(s, `${player(s, pid).name} reveals ${defOf(s, obj(s, top[i]!)).name}.`));
      const mv = top.map((id) => (id ? defMv(defOf(s, obj(s, id))) : 0));
      who.forEach((pid, i) => {
        const n = mv[1 - i] ?? 0;
        if (n <= 0) return;
        loseLife(s, pid, n);
        log(s, `${player(s, pid).name} loses ${n} life.`);
      });
      who.forEach((pid, i) => {
        const id = top[i];
        if (id && s.objects[id]?.zone === "library" && player(s, pid).library.includes(id)) moveObject(s, id, "hand");
      });
      return;
    }
    case "discard": {
      const who = players(s, e.who, ctx);
      // "Discards all cards with that name" (Cabal Therapy): the name chosen as it resolved.
      const filter = e.filter && bindChosen(e.filter, ctx.chosen);
      // Worked out once, before anyone discards.
      const sc0 = (s.resolving!.scratch ??= {});
      // "Discards cards the same way" (Balancing Act): each keeps as many as the player with the fewest has, so
      // discards the rest (n is per player then).
      const fewest = e.downToFewest ? (sc0.n ??= who.length ? Math.min(...who.map((pid) => player(s, pid).hand.length)) : 0) : 0;
      const nFor = e.downToFewest ? {} : amountFor(s, e.n, ctx, who);
      if (e.random && !e.hand) {
        // Picked once, before anyone is asked about Library of Leng.
        const rp = (sc0.randomPicks ??= Object.fromEntries(
          apnap(s, who).map((pid) => {
            const picked: ObjectId[] = [];
            const pool = [...player(s, pid).hand];
            const n = nFor[pid] ?? 0;
            for (let i = 0; i < n && pool.length; i++) picked.push(pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0]!);
            return [pid, picked];
          }),
        ));
        const tops = discardToTopEach(s, rp, apnap(s, who), src, ctx);
        if (tops === "paused") return "paused";
        for (const pid of apnap(s, who)) discardCards(s, pid, rp[pid] ?? [], " at random", false, false, ctx.controller, undefined, tops[pid]);
        return;
      }
      // Each player chooses in APNAP order, then the cards are discarded at the same time (CR 101.4, 701.9b).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.queue) {
        sc.queue = apnap(s, who);
        sc.chosen = {};
      }
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        const hand = player(s, pid).hand.filter((id) => !filter || printedMatches(filter, defOf(s, obj(s, id))));
        if (e.downToFewest) {
          if (hand.length > fewest && fewest > 0) {
            s.pending = { kind: "discard", player: pid, count: hand.length - fewest, source: src };
            return "paused";
          }
          sc.chosen![pid] = fewest > 0 ? [] : [...hand];
          sc.queue.shift();
          continue;
        }
        const n = nFor[pid] ?? 0;
        if (e.upTo && !e.hand) {
          if (hand.length && n > 0) {
            s.pending = { kind: "discard", player: pid, count: Math.min(n, hand.length), source: src, upTo: true, ...(filter ? { filter } : {}), ...(e.exile ? { exile: true as const } : {}) };
            return "paused";
          }
          sc.chosen![pid] = [];
          sc.queue.shift();
          continue;
        }
        if (!e.hand && hand.length > n) {
          s.pending = { kind: "discard", player: pid, count: n, source: src, ...(filter ? { filter } : {}), ...(e.exile ? { exile: true as const } : {}) };
          return "paused";
        }
        sc.chosen![pid] = [...hand]; // no choice to make: the whole hand (all the cards that match)
        sc.queue.shift();
      }
      if (e.exile) {
        // "Exiles a card from their hand": they choose it, and it's exiled, not discarded (CR 701.9a, 406.3).
        for (const pid of apnap(s, who))
          for (const id of sc.chosen![pid] ?? []) {
            if (obj(s, id).zone !== "hand") continue;
            log(s, `${player(s, pid).name} exiles ${defOf(s, obj(s, id)).name} from their hand.`);
            moveObject(s, id, "exile");
            const o = obj(s, id);
            // Linked to the source as it was when the ability was put on the stack (CR 607.2a).
            if (o.zone === "exile" && e.linked && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
          }
        return;
      }
      const tops = discardToTopEach(s, sc.chosen!, apnap(s, who), src, ctx);
      if (tops === "paused") return "paused";
      for (const pid of apnap(s, who)) discardCards(s, pid, sc.chosen![pid] ?? [], "", false, false, ctx.controller, undefined, tops[pid]);
      return;
    }
    case "takeFromHand": {
      // Another player chooses the card (CR 701.9b): the ability's controller, among the matching cards in the hand.
      const pid = players(s, e.who, ctx)[0];
      if (pid === undefined) return;
      const p = player(s, pid);
      const sc = (s.resolving!.scratch ??= {});
      // "Until ~ leaves the battlefield": if it already left, the hand is revealed but nothing is exiled (CR 610.3b,
      // Kitesail Freebooter rulings).
      const me = e.until ? objects(s, { ref: "self" }, ctx)[0] : undefined;
      if (e.until && !me) {
        log(s, `${src} has left the battlefield, so nothing is exiled.`);
        return;
      }
      if (!sc.found) {
        const cards = p.hand.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
        s.resolving!.tookFromHand = 0;
        if (!cards.length) return;
        const kind = e.filter?.text ?? "card";
        const what = `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`;
        const to = e.action === "discard" ? `for ${p.name} to discard` : e.action === "libraryThird" ? `for ${p.name} to put into their library third from the top` : "to exile";
        s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what, cards, min: e.optional ? 0 : 1, max: 1, dig: { looked: [...p.hand], to, rest: `stay in ${p.name}'s hand` }, hand: pid };
        return "paused";
      }
      const ids = sc.found.filter((id) => obj(s, id).zone === "hand" && obj(s, id).owner === pid);
      s.resolving!.tookFromHand = ids.length;
      if (e.action === "discard") {
        const tops = discardToTop(s, pid, ids, src, ctx);
        if (tops === "paused") return "paused";
        discardCards(s, pid, ids, "", false, false, ctx.controller, undefined, tops);
      } else if (e.action === "libraryThird")
        for (const id of ids) {
          log(s, `${p.name} puts ${defOf(s, obj(s, id)).name} into their library third from the top.`);
          moveObject(s, id, "library", { top: true });
          // On the bottom of a library with fewer than 3 cards (rulings on Lost Hours).
          if (p.library[0] === id) p.library.splice(Math.min(2, p.library.length - 1), 0, p.library.shift()!);
        }
      else
        for (const id of ids) {
          log(s, `${player(s, ctx.controller).name} exiles ${defOf(s, obj(s, id)).name} from ${p.name}'s hand${me ? ` until ${src} leaves the battlefield` : ""}.`);
          moveObject(s, id, "exile");
          const o = obj(s, id);
          if (o.zone !== "exile") continue;
          if (me) (me.exiledUntilLeaves ??= []).push({ id, zc: o.zoneChanges ?? 0, hand: true });
          // "For as long as that card remains exiled, its owner may play it" (Elite Spellbinder): with its usual timing.
          if (e.ownerMay) o.mayPlay = { player: o.owner, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, ...(e.ownerMay.play ? {} : { castOnly: true as const }), ...(e.ownerMay.more ? { more: e.ownerMay.more } : {}) };
          // Linked to the source as it was when the ability triggered (CR 607.2a), like an exile ability's.
          if (e.linked && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
        }
      return;
    }
    case "hideaway": {
      // CR 702.75a. The card is exiled even if the permanent has left by now (rulings on Watcher for Tomorrow), linked to
      // the permanent as it was when the ability triggered (CR 607.2a): a new object can't play it.
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const fromId = e.from ? players(s, e.from, ctx)[0] : p.id;
      if (fromId === undefined) return;
      const lib = player(s, fromId);
      if (!sc.found) {
        const cards = lib.library.slice(0, e.n);
        if (!cards.length) return;
        sc.looked = cards;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card", cards, min: 1, max: 1, dig: { looked: cards, to: e.castAnyType ? "into exile face down: you may cast it while it's exiled, with mana of any type" : e.castCreature ? "into exile face down: you may cast it while it's exiled if it's a creature spell" : "into exile face down (hideaway)", rest: e.restToGraveyard ? `into ${lib.name}'s graveyard` : e.from ? `on the bottom of ${lib.name}'s library in a random order` : e.castCreature ? "on the bottom of your library" : "on the bottom of your library in a random order" } };
        return "paused";
      }
      const looked = sc.looked ?? [];
      const found = sc.found.filter((id) => obj(s, id).zone === "library");
      for (const id of found) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") continue;
        o.hiddenExile = { by: ctx.sourceId ?? "", seen: [p.id], ...(e.castAnyType ? { label: "Face down" } : {}) };
        // Gonti: its controller may cast it for as long as it remains exiled, even after Gonti has left (rulings).
        if (e.castAnyType) {
          o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, castOnly: true, anyType: true };
          log(s, `${p.name} exiles a card face down from ${lib.name}'s library.`);
          log(s, `You exiled ${defOf(s, o).name} face down with ${src}; you may cast it while it's exiled.`, p.id);
          continue;
        }
        // Vivien, Champion of the Wilds: only as a creature spell, with its usual timing (rulings), even after Vivien has left.
        if (e.castCreature) {
          o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, castOnly: true, creatureOnly: true };
          log(s, `${p.name} exiles a card face down.`);
          log(s, `You exiled ${defOf(s, o).name} face down with ${src}; you may cast it while it's exiled if it's a creature spell.`, p.id);
          continue;
        }
        if (ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
        log(s, `${p.name} exiles a card face down (hideaway).`);
        log(s, `You exiled ${defOf(s, o).name} face down with ${src}.`, p.id);
      }
      const rest = looked.filter((id) => obj(s, id).zone === "library");
      if (e.restToGraveyard) {
        for (const id of rest) moveObject(s, id, "graveyard");
        if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} into ${fromId === p.id ? "their" : `${lib.name}'s`} graveyard.`);
        return;
      }
      if (!e.castCreature) shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library"); // to the bottom, in a random order (or in the order looked at)
      if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} on the bottom of ${fromId === p.id ? "their" : `${lib.name}'s`} library${e.castCreature ? "" : " in a random order"}.`);
      return;
    }
    case "scry":
    case "surveil": {
      // "Target player scries X": that player, if they're still a legal target (CR 608.2b).
      const by = e.type === "scry" && e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (by === undefined) return;
      const p = player(s, by);
      const r = s.resolving!;
      const arranged = r.scratch?.arranged;
      if (!arranged) {
        const n = amountNow(s, e.n, ctx);
        const cards = p.library.slice(0, n);
        // Scry 0: no scry event (CR 701.22b, 701.25c). With an empty library it's done as far as it can be, and "whenever
        // you scry" triggers anyway (701.22d, 701.25d).
        if (!cards.length) {
          if (n > 0) fireEvent(s, { type: "scried", player: p.id, how: e.type, n: 0 });
          return;
        }
        s.pending = { kind: "arrangeTop", player: p.id, how: e.type, cards, source: src };
        return "paused";
      }
      const looked = new Set([...arranged.top, ...arranged.away]);
      const rest = p.library.filter((id) => !looked.has(id));
      if (e.type === "scry") {
        p.library = [...arranged.top, ...rest, ...arranged.away];
        log(s, `${p.name} scries ${looked.size}: ${arranged.top.length} on top, ${arranged.away.length} on the bottom.`);
      } else {
        p.library = [...arranged.top, ...rest, ...arranged.away];
        for (const id of arranged.away) moveObject(s, id, "graveyard");
        const names = arranged.away.map((id) => defOf(s, obj(s, id)).name);
        log(s, `${p.name} surveils ${looked.size}${names.length ? `, putting ${names.join(" and ")} into their graveyard` : ""}.`);
      }
      fireEvent(s, { type: "scried", player: p.id, how: e.type, n: looked.size });
      return;
    }
    case "clash": {
      // CR 701.30b: "Choose an opponent. You and that opponent each clash." Both reveal at once, decide in APNAP order
      // whether to put their card on the bottom, then the cards move at the same time (701.30c).
      const r = s.resolving!;
      const c = ((r.scratch ??= {}).clash ??= {});
      if (c.opp === undefined) {
        const opps = opponents(s, ctx.controller);
        if (!opps.length) {
          r.wonClash = false;
          return;
        }
        if (opps.length > 1) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "clash", options: opps.map(String), labels: opps.map((pid) => player(s, pid).name) };
          return "paused";
        }
        c.opp = opps[0]!;
      }
      const who = apnap(s, [ctx.controller, c.opp]);
      if (!c.revealed) {
        // An empty library reveals nothing (CR 701.30a).
        c.revealed = Object.fromEntries(who.map((pid) => [pid, player(s, pid).library[0] ?? null]));
        for (const pid of who) {
          const id = c.revealed[pid];
          log(s, `${player(s, pid).name} reveals ${id ? `${defOf(s, obj(s, id)).name} (mana value ${clashValue(s, id)})` : "nothing"} for the clash.`);
        }
        c.queue = who.filter((pid) => c.revealed![pid]);
        c.bottom = [];
      }
      while (c.queue!.length) {
        const pid = c.queue![0]!;
        if (c.answer === undefined) {
          const id = c.revealed[pid]!;
          s.pending = { kind: "chooseMay", player: pid, prompt: `put ${defOf(s, obj(s, id)).name} on the bottom of your library`, source: src, card: id, clash: true };
          return "paused";
        }
        if (c.answer) c.bottom!.push(pid);
        c.answer = undefined;
        c.queue!.shift();
      }
      for (const pid of c.bottom!) {
        const p = player(s, pid);
        const id = c.revealed[pid]!;
        p.library = [...p.library.filter((x) => x !== id), id];
        log(s, `${p.name} puts the revealed card on the bottom of their library.`);
      }
      // CR 701.30d: you win with a card of higher mana value than every other card revealed.
      const mine = c.revealed[ctx.controller];
      const theirs = c.revealed[c.opp];
      r.wonClash = !!mine && (!theirs || clashValue(s, mine) > clashValue(s, theirs));
      log(s, `${player(s, ctx.controller).name} ${r.wonClash ? "wins" : "doesn't win"} the clash.`);
      return;
    }
    case "orderTop": {
      // Each targeted player's library, one at a time (only one player can be named here).
      const r = s.resolving!;
      const owner = players(s, e.who, ctx)[0];
      if (owner === undefined) return;
      const lib = player(s, owner);
      const arranged = r.scratch?.arranged;
      if (!arranged) {
        const n = amountNow(s, e.n, ctx);
        const cards = lib.library.slice(0, n);
        // "Look at the top card of your library" (Brutal Deceiver): the player sees it; with more asked for, one card
        // has nothing to order.
        const look = n === 1 && cards.length === 1;
        if (cards.length < 2 && !look) return;
        s.pending = { kind: "arrangeTop", player: ctx.controller, how: e.mayBottom ? "scry" : look ? "look" : "order", cards, source: src, ...(owner !== ctx.controller ? { owner } : {}) };
        return "paused";
      }
      if (e.mayBottom) {
        const moved = new Set([...arranged.top, ...arranged.away]);
        lib.library = [...arranged.top, ...lib.library.filter((id) => !moved.has(id)), ...arranged.away];
        return void log(s, `${player(s, ctx.controller).name} looks at the top card of ${owner === ctx.controller ? "their" : `${lib.name}'s`} library${arranged.away.length ? " and puts it on the bottom" : " and leaves it on top"}.`);
      }
      const looked = new Set(arranged.top);
      lib.library = [...arranged.top, ...lib.library.filter((id) => !looked.has(id))];
      if (looked.size === 1) return void log(s, `${player(s, ctx.controller).name} looks at the top card of ${owner === ctx.controller ? "their" : `${lib.name}'s`} library.`);
      log(s, `${player(s, ctx.controller).name} looks at the top ${looked.size} cards of ${owner === ctx.controller ? "their" : `${lib.name}'s`} library and puts them back in any order.`);
      return;
    }
    case "handToTop": {
      // Brainstorm: with fewer cards in hand, all of them (rulings); the player picks the cards and their order.
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      let ids = sc.chosen?.[p.id];
      if (!ids) {
        const n = Math.min(amountNow(s, e.n, ctx), p.hand.length);
        if (!n) return;
        if (p.hand.length > 1) {
          s.pending = { kind: "handToTop", player: p.id, count: n, source: src, ...(e.bottom ? { bottom: true as const } : {}) };
          return "paused";
        }
        ids = [...p.hand];
      }
      const cards = ids.filter((id) => p.hand.includes(id));
      // On the bottom the first pick goes lowest; on top it ends on top.
      for (const id of [...cards].reverse()) moveObject(s, id, "library", e.bottom ? {} : { top: true });
      log(s, `${p.name} puts ${cards.length === 1 ? "a card" : `${cards.length} cards`} from their hand on ${e.bottom ? "the bottom" : "top"} of their library.`);
      return;
    }
    case "scrollRack": {
      // The player picks the cards and the order they go back in (the first pick ends on top) at once: they know them.
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const ids = sc.chosen?.[p.id];
      if (!ids) {
        if (!p.hand.length) return;
        s.pending = { kind: "handToTop", player: p.id, count: p.hand.length, source: src, upTo: true };
        return "paused";
      }
      const cards = ids.filter((id) => p.hand.includes(id));
      if (!cards.length) return;
      for (const id of cards) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone === "exile") o.hiddenExile = { by: ctx.sourceId ?? "", seen: [p.id], label: "Face down" };
      }
      log(s, `${p.name} exiles ${cards.length === 1 ? "a card" : `${cards.length} cards`} from their hand face down.`);
      // Only as many as the library has; not a draw (rulings).
      const top = p.library.slice(0, cards.length);
      for (const id of top) moveObject(s, id, "hand");
      log(s, `${p.name} puts ${top.length === 1 ? "a card" : `${top.length} cards`} from the top of their library into their hand.`);
      const back = cards.filter((id) => obj(s, id).zone === "exile");
      for (const id of [...back].reverse()) moveObject(s, id, "library", { top: true });
      log(s, `${p.name} puts ${back.length === 1 ? "the exiled card" : `the ${back.length} exiled cards`} on top of their library.`);
      return;
    }
    case "drawnPayOrTop": {
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const drawnNow = (id: string) => {
        const o = obj(s, id);
        return o.zone === "hand" && o.drawn?.turn === s.turn && o.drawn.zc === (o.zoneChanges ?? 0);
      };
      if (!sc.found) {
        const drawn = p.hand.filter(drawnNow);
        const k = Math.min(e.n, drawn.length);
        if (!k) return;
        // No actions in between (rulings): the cards are chosen as it resolves.
        if (drawn.length > k) {
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `${k === 1 ? "a card" : `${k} cards`} drawn this turn`, cards: drawn, min: k, max: k, dig: { looked: [...p.hand], to: `to pay ${e.life} life for or put back on top of your library`, rest: "stay in your hand" }, hand: p.id };
          return "paused";
        }
        sc.found = drawn;
      }
      const chosen = sc.found;
      const pt = (sc.payOrTop ??= { idx: 0 });
      for (; pt.idx < chosen.length; pt.idx++, pt.answer = undefined) {
        const id = chosen[pt.idx]!;
        if (!drawnNow(id)) continue;
        const name = defOf(s, obj(s, id)).name;
        // Paying life needs that much life (CR 119.4); otherwise it goes back.
        if (pt.answer === undefined && payableLife(s, p.id) >= e.life) {
          s.pending = { kind: "chooseOption", player: p.id, source: src, what: "payOrTop", options: ["pay", "top"], labels: [`Pay ${e.life} life to keep ${name}`, `Put ${name} on top of your library`], about: id, prompt: `pay ${e.life} life or put ${name} back` };
          return "paused";
        }
        if (pt.answer === "pay") {
          loseLife(s, p.id, e.life);
          log(s, `${p.name} pays ${e.life} life to keep a card (${src}).`);
        } else {
          moveObject(s, id, "library", { top: true });
          log(s, `${p.name} puts a card back on top of their library (${src}).`);
        }
      }
      return;
    }
    case "taintedPact": {
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const pact = (sc.pact ??= { names: [] });
      for (;;) {
        if (pact.asking !== undefined) {
          const id = pact.asking;
          const yes = sc.may;
          pact.asking = undefined;
          sc.may = undefined;
          if (yes && s.objects[id]?.zone === "exile") {
            log(s, `${p.name} puts ${defOf(s, obj(s, id)).name} into their hand.`);
            moveObject(s, id, "hand");
            return;
          }
        }
        const top = p.library[0];
        if (top === undefined) return;
        moveObject(s, top, "exile");
        const name = defOf(s, obj(s, top)).name;
        log(s, `${src}: ${p.name} exiles ${name} from the top of their library.`);
        if (pact.names.includes(name)) {
          log(s, `${p.name} has exiled two cards named ${name}.`);
          return;
        }
        pact.names.push(name);
        if (obj(s, top).zone !== "exile") continue;
        pact.asking = top;
        s.pending = { kind: "chooseMay", player: p.id, prompt: `put ${name} into your hand (otherwise exile the next card)`, source: src, card: top };
        return "paused";
      }
    }
    case "shuffleIntoLibrary":
    case "shuffleSpell": {
      // The owners whose libraries are shuffled, whether or not the card is still there (CR 701.24c).
      const owners = new Set<PlayerId>();
      if (e.type === "shuffleSpell") {
        const item = s.resolving?.item;
        const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        if (!o) return;
        if (e.nth) {
          // Under the top six cards, or on the bottom with fewer (rulings on Approach of the Second Sun).
          if (o.zone === "stack") {
            log(s, `${defOf(s, o).name} is put into its owner's library ${["top", "second", "third", "fourth", "fifth", "sixth", "seventh"][e.nth - 1] ?? `${e.nth}th`} from the top.`);
            moveObject(s, o.id, "library", { top: true });
            const lib = player(s, o.owner).library;
            if (s.objects[o.id]?.zone === "library" && lib[0] === o.id) lib.splice(Math.min(e.nth - 1, lib.length - 1), 0, lib.shift()!);
          }
          return;
        }
        if (e.bottom) {
          if (o.zone === "stack") {
            log(s, `${defOf(s, o).name} is put on the bottom of its owner's library.`);
            moveObject(s, o.id, "library"); // instead of its owner's graveyard (CR 608.2n); a copy ceases to exist (707.10a)
          }
          return;
        }
        owners.add(o.owner);
        if (o.zone === "stack") {
          log(s, `${defOf(s, o).name} is shuffled into its owner's library.`);
          moveObject(s, o.id, "library"); // instead of its owner's graveyard (CR 608.2n); a copy ceases to exist (707.10a)
        }
      } else {
        if (e.what.ref === "self" || e.what.ref === "selfCard") {
          const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          if (me) owners.add(me.owner);
        }
        if (e.yours) owners.add(ctx.controller);
        if (e.who) for (const pid of players(s, e.who, ctx)) owners.add(pid);
        for (const o of objects(s, e.what, ctx)) {
          owners.add(o.owner);
          log(s, `${src} shuffles ${defOf(s, o).name} into its owner's library.`);
          moveObject(s, o.id, "library");
        }
      }
      for (const pid of apnap(s, [...owners])) {
        const p = player(s, pid);
        if (p.lost) continue;
        shuffleLibrary(s, p);
        log(s, `${p.name} shuffles their library.`);
      }
      return;
    }
    case "shuffleZones": {
      const shuffled: [PlayerId, number][] = [];
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const ids = [...(e.hand ? p.hand : []), ...(e.graveyard ? p.graveyard : [])].filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
        if (e.bottom) {
          // Endurance: "puts all the cards from their graveyard on the bottom of their library in a random order".
          shuffle(s, ids);
          for (const id of ids) moveObject(s, id, "library"); // to the bottom
          log(s, `${p.name} puts ${ids.length === 1 ? "the card" : `all ${ids.length} cards`} from their graveyard on the bottom of their library in a random order.`);
          continue;
        }
        for (const id of ids) moveObject(s, id, "library");
        shuffleLibrary(s, p);
        shuffled.push([pid, ids.length]);
        log(s, `${p.name} shuffles ${e.filter ? `${ids.length === 1 ? "the" : `all ${ids.length}`} ${e.filter.text}${ids.length === 1 ? "" : "s"} from their graveyard` : `their ${e.hand && e.graveyard ? "hand and graveyard" : e.hand ? "hand" : "graveyard"}`} into their library.`);
      }
      // Winds of Change: each draws as many as they shuffled into their own library (rulings).
      if (e.drawThatMany) for (const [pid, n] of shuffled) if (n && !player(s, pid).lost) draw(s, pid, n);
      // Elixir: the controller gains as much life as cards went into their own library.
      if (e.gainThatMany) gainLife(s, ctx.controller, shuffled.filter(([pid]) => pid === ctx.controller).reduce((a, [, n]) => a + n, 0));
      return;
    }
    case "handToBottomDraw": {
      // Teferi's Puzzle Box, Mindmoil: the whole hand goes on the bottom in the order its owner chooses (CR 401.4), then
      // that many cards are drawn, which can be some of them if the library was short.
      const pid = players(s, e.who, ctx)[0];
      if (pid === undefined || player(s, pid).lost) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.bottomed === undefined) {
        const ids = [...player(s, pid).hand];
        if (toBottom(s, pid, ids, src, false) === "paused") return "paused";
        sc.arranged = undefined;
        sc.bottomed = ids.length;
      }
      const n = sc.bottomed;
      sc.bottomed = undefined;
      if (n) draw(s, pid, n);
      return;
    }
    case "shuffle":
      if (e.ifSearched && !s.resolving?.searchedHere) return;
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        shuffleLibrary(s, p);
        log(s, `${p.name} shuffles their library.`);
      }
      return;
    case "search": {
      // CR 701.23: look through the library for matching cards. With a stated quality ("a basic land
      // card") a player may find fewer than asked for, even none (701.23b); asked simply for "a card"
      // or "two cards", they must find as many as they can (701.23d). "Each player searches their library" (Field of
      // Ruin): each player chooses in APNAP order, then the cards are put where they go at the same time (CR 101.4).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (sc.topOrdered) return; // the cards it put on top have been ordered: done
      // "With mana value less than or equal to ..." (TargetSpec.bound): as it resolves.
      // Its text says the number (sayBound).
      const filter00 = e.filter && { ...bindBound(s, e.filter, amountCtx(s, ctx)), text: sayBound(s, e.filter.text, e.filter, amountCtx(s, ctx)) };
      // Pyre of Heroes: "that shares a creature type with the sacrificed creature", as it last existed (rulings): a card
      // with one of its creature types (none: nothing fits).
      const filter0 = filter00?.sharesCreatureTypeWithSacrificed ? sacrificedKin(s, ctx, filter00) : filter00;
      const filter1 = filter0?.named === "~" ? { ...filter0, named: src } : filter0?.notNamed === "~" ? { ...filter0, notNamed: src } : filter0;
      const filter2 = filter1?.colorOfYourLegend ? legendColors(s, filter1, ctx.controller) : filter1;
      // "With a different name than each Aura you control" (Light-Paws): the names of those you control as it resolves.
      const filter = filter2?.notNamedAsYours ? (({ notNamedAsYours: yours, ...rest }) => ({ ...rest, notNamedAny: s.battlefield.map((id) => s.objects[id]!).filter((o) => !o.faceDown && controllerOf(s, o) === ctx.controller && objectMatches(s, yours!, o, ctx.controller, false)).map((o) => characteristics(s, o).name) }))(filter2) : filter2;
      const who = e.who ? (e.who.ref === "eachPlayer" || e.who.ref === "eachOpponent" || (e.who.ref === "target" && (e.who.n ?? 1) > 1) ? apnap(s, players(s, e.who, ctx)) : players(s, e.who, ctx).slice(0, 1)) : [ctx.controller];
      const queue = (sc.searchQueue ??= who.filter((pid) => !player(s, pid).lost));
      const searchedBy = (sc.searchedBy ??= []);
      // "Search target opponent's library" (Bribery): you search it (CR 701.23a), and it's theirs that's shuffled.
      const theirs = e.library ? players(s, e.library, ctx)[0] : undefined;
      if (e.library && theirs === undefined) return;
      const libOf = (pid: PlayerId) => player(s, theirs ?? pid);
      if (sc.found && queue.length) {
        searchedBy.push({ pid: queue.shift()!, found: sc.found, ...(sc.searchExileFor !== undefined ? { exiledFor: sc.searchExileFor } : {}) });
        sc.found = undefined;
        sc.may = undefined;
        sc.searchExileFor = undefined;
      }
      // "Each player may search": a player who declines doesn't search, or shuffle (rulings on Veteran Explorer).
      // Ashiok, Dream Render: a player its controller can't make search their own library doesn't; "you may search ... If
      // you do, shuffle", "then shuffle" after a "may": they can't choose to, so no shuffle either (rulings).
      // Stranglehold: a player it bars searches no library at all.
      const barred = (pid: PlayerId) => (pid === ctx.controller && libOf(pid) === player(s, pid) && searchBarred(s, pid)) || cantSearch(s, pid);
      while (e.may && queue.length && sc.may !== true) {
        if (sc.may === false || barred(queue[0]!)) {
          if (sc.may !== false) log(s, `${player(s, queue[0]!).name} can't search ${libOf(queue[0]!) === player(s, queue[0]!) ? "their" : "that"} library.`);
          queue.shift();
          sc.may = undefined;
          continue;
        }
        const kind = (filter?.text ?? "card").replace(/~/g, src);
        s.pending = { kind: "chooseMay", player: queue[0]!, source: src, prompt: `search your library for ${e.upTo ? "up to " : ""}${amountNow(s, e.n, ctx) === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${amountNow(s, e.n, ctx)} ${kind.replace(/\bcard\b/, "cards")}`}` };
        return "paused";
      }
      // Without a "may": no search (nothing found), but the library is still shuffled if the effect says to (rulings).
      while (!e.orGraveyard && queue.length && barred(queue[0]!)) {
        log(s, `${player(s, queue[0]!).name} can't search ${libOf(queue[0]!) === player(s, queue[0]!) ? "their" : "that"} library.`);
        searchedBy.push({ pid: queue.shift()!, found: [] });
      }
      if (queue.length) {
        const p = player(s, queue[0]!);
        const n = (sc.n ??= amountNow(s, e.n, ctx));
        // "Search your library and/or graveyard": the library too, or not (then no shuffle), chosen before looking. Only
        // asked when the graveyard has a card that fits; otherwise both are searched.
        const fits = (id: ObjectId) => !filter || printedMatches(filter, defOf(s, obj(s, id)));
        if (e.orGraveyard && sc.searchZones === undefined) {
          if (!barred(p.id) && p.graveyard.some(fits)) {
            s.pending = { kind: "chooseOption", player: p.id, source: src, what: "searchZones", options: ["both", "graveyard"], labels: ["Library and graveyard", "Graveyard only"], prompt: "search your library too (then shuffle), or only your graveyard?" };
            return "paused";
          }
          // Ashiok, Dream Render: only the graveyard.
          sc.searchZones = barred(p.id) ? "graveyard" : "both";
        }
        const yardOnly = sc.searchZones === "graveyard";
        // They've searched, found something or not (Archive Trap rulings).
        const searched = ((s.turnLog ??= {}).searched ??= []);
        if (!yardOnly && !searched.includes(p.id)) searched.push(p.id);
        if (!yardOnly && libOf(p.id) === p) fireEvent(s, { type: "searchedLibrary", player: p.id });
        // Aven Mindcensor: an opponent of its controller searches only the top N cards of the library (the whole of it is
        // still shuffled after, rulings); the same top cards for the whole search.
        const top = searchTop(s, p.id);
        const lib = libOf(p.id).library;
        let cards = [...(yardOnly ? [] : top === undefined ? lib : lib.slice(0, top)), ...(e.orGraveyard || e.andGraveyard ? p.graveyard : [])].filter(fits);
        // At most one of each name: cards with the same name in a library are alike, so one of each is offered.
        if (e.oneEach) cards = cards.filter((id, i) => cards.findIndex((x) => sameName(defOf(s, obj(s, x)).name, defOf(s, obj(s, id)).name)) === i);
        if (e.totalMv !== undefined) cards = cards.filter((id) => defMv(defOf(s, obj(s, id))) <= e.totalMv!);
        const max = Math.min(n, cards.length);
        const min = filter || e.upTo ? 0 : max;
        // Opposition Agent: searching their own library, an opponent of its controller is controlled by them (CR 723.5).
        const agent = !yardOnly && libOf(p.id) === p ? searchAgent(s, p.id) : undefined;
        if (agent?.exileFor !== undefined) sc.searchExileFor = agent.exileFor;
        const kind = (filter?.text ?? "card").replace(/~/g, src);
        const what = e.oneOfEach ? `up to a ${kind}` : `${e.upTo && n < 99 ? "up to " : ""}${n === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${n >= 99 ? "any number of" : n} ${kind.replace(/\bcard\b/, "cards")}`}`;
        s.pending = {
          kind: "searchLibrary",
          player: agent?.controller ?? p.id,
          source: src,
          what,
          cards,
          min,
          max,
          ...(agent?.controller !== undefined ? { controlling: p.id } : {}),
          ...(agent?.exileFor !== undefined ? { foundExiled: true as const } : {}),
          ...(e.others && agent?.exileFor === undefined ? { firstTo: describeDest(e.dest), othersTo: describeDest(e.others), ...(e.firstN ? { firstN: e.firstN } : {}) } : {}),
          ...(e.shareLandType ? { shareLandType: true as const } : {}),
          ...(e.totalMv !== undefined ? { totalMv: e.totalMv } : {}),
          ...(e.oneOfEach ? { oneOfEach: e.oneOfEach } : {}),
        };
        return "paused";
      }
      // An Aura found for the battlefield: its controller chooses what it enchants as it enters (CR 303.4f); with nothing
      // to enchant it stays in the library (303.4g), and is shuffled with it.
      const searchers = searchedBy.map((x) => x.pid);
      const foundBy = (pid: PlayerId) => searchedBy.find((x) => x.pid === pid)!.found;
      // "Target opponent chooses two of those cards" (Gifts Ungiven): from the revealed cards, before any is put anywhere.
      const exiledFor = (pid: PlayerId) => searchedBy.find((x) => x.pid === pid)!.exiledFor;
      let picked: ObjectId[] = [];
      // Exiled by Opposition Agent, the found cards can't be seen by the rest of the effect (rulings).
      if (e.split && searchers.length === 1 && exiledFor(searchers[0]!) === undefined) {
        const got = opponentPicks(s, ctx, src, e.split.chooser, searchers[0]!, foundBy(searchers[0]!), foundBy(searchers[0]!), e.split.n, e.split.to, e.dest);
        if (got === "paused") return "paused";
        picked = got;
      }
      // Scholar of New Horizons: the one card found, onto the battlefield instead if the condition holds and the searcher
      // wants it there; asked after the search, before the shuffle.
      if (e.mayInstead && searchers.length === 1 && foundBy(searchers[0]!).length === 1 && exiledFor(searchers[0]!) === undefined && sc.mayInstead === undefined) {
        sc.mayInstead = false;
        if ((!e.mayInstead.cond || staticConditionNow(s, e.mayInstead.cond, ctx.sourceId ?? r.item.objectId!, ctx.controller)) && (!e.mayInstead.card || printedMatches(e.mayInstead.card, defOf(s, obj(s, foundBy(searchers[0]!)[0]!))))) {
          sc.may = undefined;
          sc.mayInstead = true;
          s.pending = { kind: "chooseMay", player: searchers[0]!, source: src, prompt: `put ${defOf(s, obj(s, foundBy(searchers[0]!)[0]!)).name} ${describeDest(e.mayInstead.dest)} (if you don't, ${describeDest(e.dest)})` };
          return "paused";
        }
      }
      // Transmute Artifact: a card with a greater mana value than the sacrificed artifact's goes onto the battlefield only
      // if the searcher pays the difference now (rulings: paid as it resolves; with X in its cost, X is 0, CR 202.3b).
      if (e.payDiff !== undefined && searchers.length === 1 && foundBy(searchers[0]!).length === 1 && exiledFor(searchers[0]!) === undefined && sc.payDiff === undefined) {
        const card = defOf(s, obj(s, foundBy(searchers[0]!)[0]!));
        const diff = defMv(card) - Math.max(0, amountNow(s, e.payDiff, ctx));
        sc.payDiff = diff > 0;
        if (diff > 0) {
          sc.may = undefined;
          s.pending = { kind: "chooseMay", player: searchers[0]!, source: src, prompt: `pay {${diff}} to put ${card.name} onto the battlefield`, otherwise: `If you don't, ${card.name} is put into its owner's graveyard.`, pay: { mana: `{${diff}}` } };
          return "paused";
        }
      }
      const condNow = !!e.condDest && staticConditionNow(s, e.condDest.cond, ctx.sourceId ?? r.item.objectId!, ctx.controller);
      const unpaid = !!sc.payDiff && sc.may !== true;
      const instead = !!sc.mayInstead && sc.may === true;
      const dest = (pid: PlayerId, id: ObjectId): SearchDest => (unpaid ? { zone: "graveyard" } : instead ? e.mayInstead!.dest : exiledFor(pid) !== undefined ? { zone: "exile" } : picked.includes(id) ? e.split!.to : foundBy(pid).indexOf(id) >= (e.firstN ?? 1) && e.others ? e.others : e.landTo && isType(defOf(s, obj(s, id)), "Land") ? e.landTo : e.condDest && condNow ? e.condDest.dest : e.dest);
      const onto = searchers.flatMap((pid) => foundBy(pid).filter((id) => dest(pid, id).zone === "battlefield").map((id) => ({ o: obj(s, id), under: pid })));
      // "Attached to ~" (Light-Paws): only to the source, if it's still on the battlefield as the same object (rulings,
      // CR 400.7).
      const me = ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined;
      const self = me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me.id : null;
      const hosts = chooseAuraHosts(s, onto, src, e.dest.attachToSelf ? self : undefined);
      if (hosts === "paused") return "paused";
      const moves: { pid: PlayerId; id: ObjectId }[] = [];
      for (const pid of searchers) {
        const p = player(s, pid);
        const lib = libOf(pid);
        const found = foundBy(pid).filter((id) => dest(pid, id).zone !== "battlefield" || !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id));
        // Sunforger: the card to cast stays where it is until it's cast (castSearched).
        lib.library = lib.library.filter((id) => !found.includes(id) || dest(pid, id).zone === "cast");
        const names = found.map((id) => defOf(s, obj(s, id)).name);
        // Found cards aren't revealed unless the effect says so (CR 701.23e).
        const shown = e.reveal || e.dest.zone === "battlefield" || (e.dest.zone === "exile" && !e.dest.faceDown) || exiledFor(pid) !== undefined ? ` (${names.join(", ")})` : "";
        const whose = lib === p ? "their" : `${lib.name}'s`;
        const yardOnly = sc.searchZones === "graveyard";
        const where = yardOnly ? `${whose} graveyard` : e.orGraveyard || e.andGraveyard ? `${whose} library and graveyard` : `${whose} library`;
        log(s, `${p.name} searches ${where}${found.length ? `, finds ${found.length === 1 ? "a card" : `${found.length} cards`}${shown}${exiledFor(pid) !== undefined ? ` and exiles ${found.length === 1 ? "it" : "them"} for ${player(s, exiledFor(pid)!).name} to play` : ""}` : " and finds nothing"}${(searchers.length > 1 && e.dest.zone !== "libraryTop") || yardOnly || e.noShuffle ? "" : lib === p ? ", and shuffles" : `, and ${lib.name} shuffles`}.`);
        for (const id of found) moves.push({ pid, id });
        // "And exile the rest" (Doomsday): every other card in the library and graveyard, before the chosen cards move.
        if (e.exileRest && !barred(pid)) {
          const rest = [...lib.library, ...(e.andGraveyard ? p.graveyard : [])].filter((id) => !found.includes(id));
          if (rest.length) log(s, `${p.name} exiles the rest of their library${e.andGraveyard ? " and graveyard" : ""} (${rest.length} card${rest.length === 1 ? "" : "s"}).`);
          for (const id of rest) moveObject(s, id, "exile");
        }
        // "Then shuffles and puts that card on top": the shuffle comes first, for each of them (Scheming Symmetry).
        if ((searchers.length === 1 || e.dest.zone === "libraryTop") && !yardOnly && !e.noShuffle) shuffleLibrary(s, lib);
        if (e.noShuffle && !yardOnly) r.searchedHere = true;
      }
      r.searchFound = moves.map((m) => m.id);
      // What it found and put onto the battlefield is "it" afterwards (Vision Quest's "it gains haste").
      if (e.n === 1 && !e.others && e.dest.zone === "battlefield") r.created = [];
      // Sword of Hearth and Home: the card exiled before enters with the found card, under your control (rulings: at the
      // same time). A permanent card still in exile as the object it became (CR 400.7).
      const held = e.withHeld ? (r.held ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (obj(s, l.id).zoneChanges ?? 0) === l.zc && isPermanentCard(defOf(s, obj(s, l.id)))).map((l) => l.id) : [];
      if (e.withHeld) r.held = undefined;
      enterTogether(s, () => {
        for (const id of held) {
          log(s, `${src} returns ${defOf(s, obj(s, id)).name} to the battlefield under ${player(s, ctx.controller).name}'s control.`);
          moveObject(s, id, "battlefield", { controller: ctx.controller });
        }
        for (const { pid, id } of moves) {
          const p = player(s, pid);
          const to = dest(pid, id);
          if (to.zone === "cast") r.searchCast = id;
          else if (to.zone === "libraryTop" && obj(s, id).zone === "graveyard") moveObject(s, id, "library", { top: true });
          else if (to.zone === "libraryTop") {
            obj(s, id).zone = "library";
            // Third from the top, or on the bottom of a library with fewer than 3 other cards (rulings on Long-Term Plans).
            p.library.splice(to.third ? Math.min(2, p.library.length) : 0, 0, id);
          } else if (to.zone === "battlefield") {
            // "With X additional +1/+1 counters on it" (CR 614.1c).
            const extra = to.counters ? Math.max(0, amountNow(s, to.counters.n, ctx)) : 0;
            moveObject(s, id, "battlefield", { controller: pid, ...(to.tapped ? { tapped: true } : {}), ...hosts.get(id), ...(extra ? { counters: { [to.counters!.counter]: extra } } : {}) });
            if (r.created && obj(s, id).zone === "battlefield") r.created.push(id);
          } else moveObject(s, id, to.zone);
          // "Exile it face down" (Beseech the Mirror): only its owner sees it (CR 406.3), for the rest of the effect.
          if (to.faceDown && to.zone === "exile" && obj(s, id).zone === "exile" && exiledFor(pid) === undefined) {
            obj(s, id).hiddenExile = { by: ctx.sourceId ?? "", seen: [pid], label: "Face down" };
            r.faceDownExiled = [...(r.faceDownExiled ?? []), id];
          }
          // Praetor's Grasp, Ugin: the player who searched may play it, this object only (CR 400.7).
          if (to.play && to.zone === "exile" && obj(s, id).zone === "exile" && exiledFor(pid) === undefined) {
            const { until, ...how } = to.play;
            obj(s, id).mayPlay = { player: pid, zc: obj(s, id).zoneChanges ?? 0, until, turn: s.turn, ...how };
          }
          // Opposition Agent: exiled face up (CR 406.3), its controller may play it for as long as it remains exiled, a land
          // too (following the normal timing rules) and spend mana as though it were mana of any color to cast it (CR
          // 609.4b: colored symbols paid with any mana).
          const agentPid = exiledFor(pid);
          const o = obj(s, id);
          if (agentPid !== undefined && o.zone === "exile") o.mayPlay = { player: agentPid, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, anyType: true };
        }
      });
      // "Then shuffles": after the cards are put onto the battlefield, each player who searched (CR 701.23, 701.20).
      if (searchers.length > 1 && e.dest.zone !== "libraryTop")
        for (const pid of searchers) {
          shuffleLibrary(s, player(s, pid));
          log(s, `${player(s, pid).name} shuffles their library.`);
        }
      // "Put those cards on top in any order" (Goblin Recruiter): the searcher orders the cards now on top.
      const onTop = moves.filter((m) => !e.dest.third && dest(m.pid, m.id).zone === "libraryTop" && obj(s, m.id).zone === "library");
      if (onTop.length > 1 && searchers.length === 1) {
        const lib = libOf(onTop[0]!.pid);
        sc.topOrdered = true;
        s.pending = { kind: "orderLibrary", player: onTop[0]!.pid, cards: lib.library.filter((id) => onTop.some((m) => m.id === id)), source: src };
        return "paused";
      }
      return;
    }
    case "piles": {
      // CR 700.3: the revealed cards are separated into two piles while still in the library (700.3c); one pile is chosen
      // and put into the hand, the other into the graveyard (or on the bottom of the library, in an order its owner
      // chooses). Piles can be empty (rulings).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const p = player(s, ctx.controller);
      const names = (ids: ObjectId[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      if (!sc.looked) {
        sc.looked = p.library.slice(0, Math.max(0, amountNow(s, e.n, ctx)));
        if (!sc.looked.length) return;
        log(s, `${p.name} reveals the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of their library (${names(sc.looked)}).`);
      }
      if (sc.moved) return toBottom(s, p.id, sc.looked.filter((id) => obj(s, id).zone === "library"), src, false);
      const looked = sc.looked.filter((id) => obj(s, id).zone === "library");
      const opp = chooseAnOpponent(s, ctx, src, e.separator === "opponent" ? "choose an opponent to separate the cards into two piles" : "choose an opponent to choose a pile");
      if (opp === "paused") return "paused";
      // No opponent left to separate or to choose: the game is over, and nothing more happens.
      if (opp === undefined || player(s, opp).lost) return;
      const separator = e.separator === "you" ? p.id : opp;
      const chooser = e.separator === "you" ? opp : p.id;
      if (sc.separating && sc.found) {
        sc.pileOne = sc.found;
        sc.separating = undefined;
        sc.found = undefined;
      }
      if (!sc.pileOne) {
        sc.separating = true;
        s.pending = { kind: "searchLibrary", player: separator, source: src, what: "the cards", cards: looked, min: 0, max: looked.length, dig: { looked, to: "for the first pile", rest: "form the second pile" }, piles: true, ...(separator !== p.id ? { forPlayer: p.id } : {}) };
        return "paused";
      }
      const one = sc.pileOne.filter((id) => looked.includes(id));
      const two = looked.filter((id) => !one.includes(id));
      if (sc.pileChoice === undefined) {
        log(s, `${player(s, separator).name} separates them into two piles: ${names(one) || "no cards"}; and ${names(two) || "no cards"}.`);
        const label = (pile: ObjectId[], i: number) => `Pile ${i + 1}: ${pile.length ? names(pile) : "no cards"}`;
        s.pending = { kind: "chooseOption", player: chooser, source: src, what: "pile", options: ["0", "1"], labels: [label(one, 0), label(two, 1)], piles: [one, two], of: p.id, prompt: `choose the pile to put into ${chooser === p.id ? "your" : `${p.name}'s`} hand (the other goes ${e.rest === "graveyard" ? "into the graveyard" : "on the bottom of the library"})` };
        return "paused";
      }
      const hand = sc.pileChoice === 0 ? one : two;
      const rest = sc.pileChoice === 0 ? two : one;
      log(s, `${p.name} puts ${hand.length ? names(hand) : "no cards"} into their hand${e.rest === "graveyard" ? ` and ${rest.length ? names(rest) : "no cards"} into their graveyard` : ""}.`);
      enterTogether(s, () => {
        for (const id of hand) moveObject(s, id, "hand");
        if (e.rest === "graveyard") for (const id of rest) moveObject(s, id, "graveyard");
      });
      if (e.rest !== "bottom") return;
      sc.moved = true;
      return toBottom(s, p.id, rest, src, false);
    }
    case "revealPick": {
      // "Reveal the top three cards of your library. An opponent chooses one of them." (Murmurs from Beyond): revealed
      // first, then the opponent chooses (one that fits, if it says what kind: Animal Magnetism), then the cards move.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const p = player(s, ctx.controller);
      if (!sc.looked) {
        sc.looked = p.library.slice(0, amountNow(s, e.n, ctx));
        if (!sc.looked.length) return;
        log(s, `${p.name} reveals ${sc.looked.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library.`);
      }
      const looked = sc.looked.filter((id) => obj(s, id).zone === "library");
      const fits = looked.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
      const got = opponentPicks(s, ctx, src, e.chooser, p.id, looked, fits, 1, e.to, e.rest);
      if (got === "paused") return "paused";
      const rest = looked.filter((id) => !got.includes(id));
      enterTogether(s, () => {
        const zone = (d: SearchDest) => (d.zone === "libraryTop" || d.zone === "cast" ? "library" : d.zone);
        for (const id of got) moveObject(s, id, zone(e.to), e.to.zone === "battlefield" ? { controller: p.id, ...(e.to.tapped ? { tapped: true } : {}) } : undefined);
        if (e.rest) for (const id of rest) moveObject(s, id, zone(e.rest));
      });
      // Karn, Scion of Urza: "exile the other with a silver counter on it".
      if (e.rest?.counter) {
        for (const id of rest) {
          const o = obj(s, id);
          if (o.zone === "exile") o.counters[e.rest.counter] = (o.counters[e.rest.counter] ?? 0) + 1;
        }
        if (rest.length) log(s, `${p.name} exiles ${rest.map((id) => defOf(s, obj(s, id)).name).join(", ")} with a ${e.rest.counter} counter on it.`);
      }
      return;
    }
    case "vault": {
      // Lim-Dûl's Vault (rulings): look at the top five. Each time the player pays 1 life, those go to the bottom in the
      // order they choose and they look at the top five again (the same ones with five or fewer cards). When they stop,
      // the rest of the library is shuffled and those five go back on top in any order. Paying life with 0 or less is
      // allowed only as far as they have life to pay (CR 119.4).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const names = (ids: ObjectId[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      for (let guard = 0; guard < 500; guard++) {
        if (!sc.vault) {
          const looked = p.library.slice(0, e.n);
          if (!looked.length) return;
          sc.vault = { stage: "ask", looked };
          log(s, `${p.name} looks at the top ${looked.length === 1 ? "card" : `${looked.length} cards`} of their library.`);
          log(s, `You look at ${names(looked)} (${src}).`, p.id);
        }
        const v = sc.vault;
        if (v.stage === "ask") {
          if (sc.may === undefined) {
            if (payableLife(s, p.id) < e.life) v.stage = "top";
            else {
              s.pending = { kind: "chooseMay", player: p.id, prompt: `pay ${e.life} life to put these cards on the bottom of your library and look at the top ${e.n} again`, source: src, pay: { life: e.life }, vault: v.looked };
              return "paused";
            }
          } else {
            v.stage = sc.may ? "bottom" : "top";
            if (sc.may) sc.vaultPaid = (sc.vaultPaid ?? 0) + 1;
            sc.may = undefined;
            sc.arranged = undefined;
          }
        }
        if (v.stage === "bottom") {
          if (toBottom(s, p.id, v.looked, src, false) === "paused") return "paused";
          sc.arranged = undefined;
          sc.vault = undefined;
          continue;
        }
        // "Then shuffle and put the last cards you looked at this way on top in any order."
        const looked = v.looked.filter((id) => obj(s, id).zone === "library" && obj(s, id).owner === p.id);
        if (!sc.arranged) {
          p.library = p.library.filter((id) => !looked.includes(id));
          shuffleLibrary(s, p);
          log(s, `${p.name} shuffles their library.`);
          p.library = [...looked, ...p.library];
          if (looked.length > 1) {
            s.pending = { kind: "arrangeTop", player: p.id, how: "order", cards: looked, source: src };
            return "paused";
          }
        } else {
          const order = sc.arranged.top.filter((id) => looked.includes(id));
          p.library = [...order, ...p.library.filter((id) => !order.includes(id))];
          sc.arranged = undefined;
        }
        log(s, `${p.name} puts ${looked.length === 1 ? "a card" : `${looked.length} cards`} on top of their library.`);
        sc.vault = undefined;
        return;
      }
      return;
    }
    case "dig": {
      if (e.each) {
        // "Each player looks at the top five cards of their library and may reveal ..." (Explore the Vastlands): one after
        // another in APNAP order, each seeing what the ones before took (CR 101.4).
        const sc = (s.resolving!.scratch ??= {});
        sc.digQueue ??= apnap(s, players(s, { ref: "eachPlayer" }, ctx));
        while (sc.digQueue.length) {
          if (dig(s, e, ctx, src, sc.digQueue[0]!) === "paused") return "paused";
          const r = s.resolving!.scratch!;
          r.looked = r.found = r.moved = r.arranged = undefined;
          r.digQueue!.shift();
        }
        s.resolving!.scratch!.digQueue = undefined;
        return;
      }
      const pid = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      return pid === undefined ? undefined : dig(s, e, ctx, src, pid);
    }
  }
}

/** "Look at the top N cards of your library": `pid` looks at them, takes some, and the rest go where they go. */
function dig(s: GameState, e: Extract<Effect, { type: "dig" }>, ctx: ResolveCtx, src: string, pid: PlayerId): "paused" | undefined {
    {
      if (player(s, pid).lost) return;
      const p = player(s, pid);
      // "Of that player's library" (Orochi Soul-Reaver): their cards, `pid` getting them.
      const from = e.library ? players(s, e.library, ctx)[0] : pid;
      if (from === undefined || player(s, from).lost) return;
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.looked || (e.sacrificeFirst && !sc.digSacrificed)) {
        if (!sc.looked) {
          sc.looked = player(s, from).library.slice(0, amountNow(s, e.n, ctx));
          if (!sc.looked.length && !e.sacrificeFirst) return;
          if (e.sacrificeFirst) log(s, `${p.name} looks at the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of their library.`);
        }
        // Birthing Ritual: "Then you may sacrifice a creature. If you do, you may put a creature card with mana value X or
        // less from among those cards onto the battlefield": knowing the cards (CR 608.2c), even with none to look at.
        if (e.sacrificeFirst && !sc.digSacrificed) {
          if (sc.queue?.length === 0 && sc.chosen) {
            for (const id of sc.chosen[pid] ?? []) {
              const o = s.objects[id];
              if (o?.zone !== "battlefield") continue;
              const ch = characteristics(s, o);
              log(s, `${p.name} sacrifices ${defOf(s, o).name}.`);
              // As it last existed (CR 608.2h): "1 plus the sacrificed creature's mana value".
              (r.sacrificedThisWay ??= []).push({ id, power: ch.power, toughness: ch.toughness, manaValue: defMv(defOf(s, o)), counters: { ...o.counters }, copyKey: cardIdOf(o), controller: pid, types: [...ch.types], subtypes: [...ch.subtypes] });
              moveObject(s, id, "graveyard", { sacrificed: true });
            }
            sc.queue = sc.chosen = undefined;
            sc.digSacrificed = true;
          } else {
            const can = pickOptions(s, { filter: e.sacrificeFirst, action: "sacrifice" }, pid, ctx.sourceId, ctx.sourceZc);
            if (!can.length) sc.digSacrificed = true;
            else {
              sc.queue = [pid];
              sc.chosen = {};
              s.pending = { kind: "pickPermanents", player: pid, source: src, action: "sacrifice", what: e.sacrificeFirst.text, options: can, count: 1, min: 0, looked: [...sc.looked], prompt: `you may sacrifice ${/^[aeiou]/i.test(e.sacrificeFirst.text) ? "an" : "a"} ${e.sacrificeFirst.text}; if you do, you may put ${/^[aeiou]/i.test(e.filter?.text ?? "") ? "an" : "a"} ${(e.filter?.text ?? "card").replace(/ X or less$/, " up to 1 more than its mana value")} from among the cards you looked at onto the battlefield` };
              return "paused";
            }
          }
          if (!sc.looked.length) return;
          if (!r.sacrificedThisWay?.length) {
            // Not sacrificed: nothing is put onto the battlefield; the rest still go to the bottom.
            sc.found = [];
            return dig(s, e, ctx, src, pid);
          }
        }
        // "With mana value X or less": the X it was cast or activated with (TargetSpec.xRange), or an amount counted now
        // (TargetSpec.bound: Hatchery Spider's "where X is the number of creature cards in your graveyard").
        // "Of the chosen type" (Icon of Ancestry): the choice made as the permanent entered; none chosen, none matches.
        const chosenFilter = e.filter?.chosen ? bindChosen(e.filter, ctx.chosen) : e.filter;
        const filter = chosenFilter?.xRange ? (({ xRange: _, ...r }) => ({ ...r, manaValue: { max: ctx.x ?? 0 } }))(chosenFilter) : chosenFilter && bindBound(s, chosenFilter, amountCtx(s, ctx));
        const mvMax = filter?.manaValue?.max ?? ctx.x ?? 0;
        const options = sc.looked.filter((id) => (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (e.totalMv === undefined || defMv(defOf(s, obj(s, id))) <= e.totalMv));
        // "If ~ was kicked, put two of those cards into your hand instead" (Consult the Star Charts, CR 702.33e).
        const yardHas = (f: TargetSpec) => player(s, ctx.controller).graveyard.some((id) => printedMatches(f, defOf(s, obj(s, id))));
        const count = e.countX ? Math.max(0, ctx.x ?? 0) : e.kickedCount !== undefined && ctx.kicked?.length ? e.kickedCount : (e.countIfYard?.min ? player(s, ctx.controller).graveyard.filter((id) => printedMatches(e.countIfYard!.has[0]!, defOf(s, obj(s, id)))).length >= e.countIfYard.min : e.countIfYard?.has.every(yardHas)) ? e.countIfYard!.count : e.count;
        const max = Math.max(0, Math.min(count, options.length, sc.looked.length - (e.minRest ?? 0)));
        const min = e.required ? max : e.upTo || e.filter ? 0 : max;
        if (!e.sacrificeFirst) log(s, `${p.name} ${e.reveal ? "reveals" : "looks at"} the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of ${from === pid ? "their" : `${player(s, from).name}'s`} library${e.reveal ? ` (${sc.looked.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}.`);
        if (max > 0 && !(min === max && options.length === max)) {
          const kind = (e.filter?.text ?? "card").replace(/~/g, src).replace(/ X or less$/, ` ${mvMax} or less`);
          // "Take none" says it's optional; "up to" only reads well with a number.
          // "Any number of ... with total mana value 4 or less" (Ao, the Dawn Sky): the total is the limit.
          const what = e.totalMv !== undefined ? `any number of ${kind.replace(/\bcard\b/, "cards")}` : e.oneOfEach ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : max === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${min < max ? "up to " : ""}${max} ${kind.replace(/\bcard\b/, "cards")}`;
          const to = e.into === "hand" ? "into your hand" : e.into === "exile" ? `into exile${e.playFree ? " (you may cast it this turn without paying its mana cost)" : e.play ? " (you may play it this turn)" : ""}` : e.into === "battlefield" ? "onto the battlefield" : e.into === "manifest" ? "onto the battlefield face down (manifest)" : e.into === "cloak" ? "onto the battlefield face down (cloak)" : "back on top of your library";
          const rest = e.rest === "graveyard" ? "into your graveyard" : e.rest === "shuffle" ? "shuffled into your library" : e.rest === "hand" ? "into your hand" : e.rest === "keep" ? "left on top for now" : from !== pid ? `on the bottom of ${player(s, from).name}'s library` : "on the bottom of your library";
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards: options, min, max, dig: { looked: sc.looked, to, rest }, ...(e.oneOfEach ? { oneOfEach: e.oneOfEach } : {}), ...(e.totalMv !== undefined ? { totalMv: e.totalMv } : {}) };
          return "paused";
        }
        // Nothing to choose: all of them, or (one for each) as many as fit.
        sc.found = e.oneOfEach ? options.reduce<ObjectId[]>((a, id) => (oneOfEachFits(e.oneOfEach!, [...a, id].map((x) => defOf(s, obj(s, x)))) ? [...a, id] : a), []) : options.slice(0, max);
      }
      const looked = sc.looked;
      let found = (sc.found ?? []).filter((id) => looked.includes(id));
      const names = (ids: ObjectId[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      const faceDown = e.into === "manifest" || e.into === "cloak" ? e.into : undefined;
      // The Key to the Vault: the exiled card cast (or not) as this resolves, after the rest went to the bottom (CR 608.2g).
      const castExiled = (): "paused" | undefined => {
        if (!e.castFree || sc.castingTarget !== undefined) return;
        const o = found.length === 1 ? s.objects[found[0]!] : undefined;
        if (!o || o.zone !== "exile") return;
        sc.castingTarget = o.id;
        s.pending = { kind: "castFree", player: p.id, objectId: o.id, source: src };
        if (freeCastable(s, p.id, o.id)) return "paused";
        s.pending = null;
        log(s, `${defOf(s, o).name} can't be cast.`);
        return;
      };
      if (sc.castingTarget !== undefined && e.castFree) return;
      // Resuming after the owner ordered the rest for the bottom: the cards taken have already moved.
      if (sc.moved) return toBottom(s, from, looked.filter((id) => !found.includes(id) && obj(s, id).zone === "library"), src, false) ?? castExiled();
      // An Aura put onto the battlefield: its controller chooses what it enchants as it enters (CR 303.4f), or it stays
      // with the rest (303.4g).
      const hosts = e.into === "battlefield" ? chooseAuraHosts(s, found.map((id) => ({ o: obj(s, id), under: p.id })), src) : new Map<ObjectId, AuraHost>();
      if (hosts === "paused") return "paused";
      found = found.filter((id) => {
        if (e.into !== "battlefield" || !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id)) return true;
        log(s, `${defOf(s, obj(s, id)).name} has nothing to enchant, so it stays with the rest.`);
        return false;
      });
      // "Tapped and attacking" (Winota, CR 508.4): during combat, attacking a player or planeswalker its controller chooses
      // as it enters (rulings: not necessarily the one the trigger's creature attacks); never declared as an attacker.
      // Outside combat it's only tapped (CR 506.3d).
      const attackOptions = e.attacking && found.some((id) => isType(defOf(s, obj(s, id)), "Creature")) ? attackChoices(s, p.id, ctx.sourceId) : [];
      if (attackOptions.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${defOf(s, obj(s, found.find((id) => isType(defOf(s, obj(s, id)), "Creature"))!)).name} attacks` };
        return "paused";
      }
      const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
      const rest = looked.filter((id) => !found.includes(id) && obj(s, id).zone === "library");
      if (found.length && faceDown) log(s, `${p.name} ${faceDown}s ${found.length === 1 ? "a card" : `${found.length} cards`}: ${found.length === 1 ? "a" : "each a"} face-down 2/2 creature${faceDown === "cloak" ? " with ward {2}" : ""}.`);
      else if (found.length && e.into === "exile") log(s, `${p.name} exiles ${names(found)}${e.playFree ? " and may cast it this turn without paying its mana cost" : e.play ? " and may play it this turn" : ""}.`);
      else if (found.length) log(s, `${p.name} puts ${e.into === "hand" ? (e.reveal || e.filter ? names(found) : found.length === 1 ? "a card" : `${found.length} cards`) + " into their hand" : e.into === "battlefield" ? names(found) + " onto the battlefield" : names(found) + " back on top"}.`);
      if (e.into === "battlefield" || faceDown) r.created = [];
      r.digTook = found.length > 0;
      enterTogether(s, () => {
        for (const id of found) {
          if (e.into === "hand") moveObject(s, id, "hand");
          else if (e.into === "exile") {
            // Face up (CR 406.3); "you may play the exiled card this turn" is that object's only (CR 400.7).
            moveObject(s, id, "exile");
            const o = obj(s, id);
            if (e.play) o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, ...(e.playFree ? { castOnly: true as const, free: true as const } : {}) };
          } else if (faceDown) {
            // One at a time (CR 701.40e, 701.58e), each a 2/2 face-down creature; "it" in what follows.
            moveObject(s, id, "battlefield", { controller: p.id, faceDown });
            if (obj(s, id).zone === "battlefield") r.created!.push(id);
          }
          else if (e.into === "battlefield") {
            const extra = e.countersIfMv && manaValue(parseManaCost(defOf(s, obj(s, id)).manaCost)) <= e.countersIfMv.max ? e.countersIfMv : e.counters;
            moveObject(s, id, "battlefield", { controller: p.id, ...(e.tapped ? { tapped: true } : {}), ...(extra ? { counters: { [extra.counter]: extra.n } } : {}), ...hosts.get(id) });
            const o = obj(s, id);
            if (attack && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
              o.attacking = attack.player;
              if (attack.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
              log(s, `${defOf(s, o).name} is attacking ${attack.label}.`);
            }
            if (o.zone === "battlefield") r.created!.push(id); // "it" in what follows
          } else player(s, from).library = [id, ...player(s, from).library.filter((x) => x !== id)];
        }
      });
      if (e.rest === "shuffle") {
        shuffleLibrary(s, p); // "Then shuffle" (CR 701.20)
        log(s, `${p.name} shuffles their library.`);
      } else if (e.rest === "graveyard") {
        if (rest.length) log(s, `${p.name} puts ${names(rest)} into their graveyard.`);
        for (const id of rest) moveObject(s, id, "graveyard");
        // "For each card put into your graveyard this way" (Dihada): those that got there.
        if (s.resolving) s.resolving.movedLinked = rest.filter((id) => s.objects[id]?.zone === "graveyard").length;
      } else if (e.rest === "keep") {
        // They stay on top, in the order they were in.
      } else if (e.rest === "hand") {
        if (rest.length) log(s, `${p.name} puts ${rest.length === 1 ? "the other card" : `the other ${rest.length} cards`} into their hand.`);
        for (const id of rest) moveObject(s, id, "hand");
      } else {
        sc.moved = true;
        // Another player's library (Lonis, Cryptozoologist): the rest go to the bottom of theirs.
        return toBottom(s, from, rest, src, !!e.random) ?? castExiled();
      }
      return castExiled();
    }
}

/**
 * Cards of `pid`'s library (or elsewhere) going to the bottom of `pid`'s library at the same time. Their owner orders
 * them (CR 401.4), "paused" while they choose; `random`: "in a random order".
 */
export function toBottom(s: GameState, pid: PlayerId, ids: ObjectId[], src: string, random: boolean): "paused" | undefined {
  const p = player(s, pid);
  const sc = (s.resolving!.scratch ??= {});
  let order = [...ids];
  if (random) shuffle(s, order);
  else if (ids.length > 1) {
    if (!sc.arranged) {
      s.pending = { kind: "arrangeTop", player: pid, how: "bottom", cards: ids, source: src };
      return "paused";
    }
    order = sc.arranged.top.filter((id) => ids.includes(id));
  }
  for (const id of order) {
    if (obj(s, id).zone === "library") p.library = [...p.library.filter((x) => x !== id), id];
    else moveObject(s, id, "library"); // to the bottom
  }
  if (order.length) log(s, `${p.name} puts ${order.length === 1 ? "a card" : `${order.length} cards`} on the bottom of their library${random && order.length > 1 ? " in a random order" : ""}.`);
  return undefined;
}

/**
 * Move cards from a player's hand to their graveyard (CR 701.9a). A card with madness is exiled instead, and its
 * madness ability triggers (CR 702.35a): it's still discarded. `quiet`: the caller says what happened (cycling).
 */
/** `cause`: the controller of the spell or ability that made them discard, if one did. */
export function discardCards(s: GameState, pid: PlayerId, ids: ObjectId[], how = "", quiet = false, cycled = false, cause?: PlayerId, /** The X chosen for a cycling cost (Shark Typhoon). */ cycledX?: number, /** Library of Leng: those that go on top of the library instead, the first ending on top (see discardToTop). */ toTop: ObjectId[] = []) {
  if (!ids.length) return;
  if (s.resolving) (s.resolving.discarded ??= {})[pid] = (s.resolving.discarded[pid] ?? 0) + ids.length;
  if (s.resolving) (s.resolving.discardedAll ??= []).push(...ids);
  const names = ids.map((id) => defOf(s, obj(s, id)).name);
  if (!quiet) log(s, `${player(s, pid).name} discards ${names.join(", ")}${how}.`);
  const cards = ids.map((id) => defOf(s, obj(s, id)));
  for (const id of ids) {
    const o = obj(s, id);
    const c = compileCard(defOf(s, o));
    // Library of Leng: its owner chose this replacement over any other (CR 616.1); put on top below, in their order.
    if (toTop.includes(id)) continue;
    // Obstinate Baloth: its owner picks this replacement over madness or a graveyard one (CR 616.1, rulings).
    if (c.discardedToBattlefield && cause !== undefined && cause !== pid) {
      log(s, `${defOf(s, o).name} is put onto the battlefield instead.`);
      moveObject(s, id, "battlefield", { controller: pid });
      continue;
    }
    const madness = c.madness;
    if (!madness) {
      moveObject(s, id, "graveyard");
      if (o.zone === "graveyard") o.discardedTurn = s.turn; // mayhem (CR 702.187b)
      continue;
    }
    moveObject(s, id, "exile");
    if (o.zone !== "exile") continue;
    log(s, `${defOf(s, o).name} is exiled instead (madness).`);
    // Its owner controls the trigger (CR 113.8): "its owner may cast it by paying [cost]".
    s.triggerQueue.push({
      sourceId: id,
      sourceCardId: cardIdOf(o),
      controller: o.owner,
      index: -1,
      subject: { id, zc: o.zoneChanges ?? 0 },
      body: { targets: [], effects: [{ type: "madness" }], text: `Madness ${madness}: you may cast ~ for its madness cost. If you don't, put it into your graveyard.` },
    });
  }
  const tops = toTop.filter((id) => ids.includes(id));
  for (const id of [...tops].reverse()) moveObject(s, id, "library", { top: true });
  if (tops.length) log(s, `${player(s, pid).name} puts ${tops.length === 1 ? names[ids.indexOf(tops[0]!)] : `${tops.length} of them`} on top of their library instead (${lengName(s, pid)}).`);
  // They were discarded at the same time (CR 701.9b); each one triggers "whenever you discard a card" (CR 603.2c).
  ids.forEach((id, i) => fireEvent(s, { type: "discarded", player: pid, id, card: cards[i]!, ...(cycled ? { cycled: true } : {}), ...(cycledX ? { x: cycledX } : {}) }));
  if (s.resolving) s.resolving.discardedCards = ids.flatMap((id) => (obj(s, id).zone === "graveyard" ? [{ id, zc: obj(s, id).zoneChanges ?? 0 }] : []));
}

/** The Library of Leng `pid` controls, if any: its name. */
function lengName(s: GameState, pid: PlayerId): string | undefined {
  const o = s.battlefield.map((id) => obj(s, id)).find((o) => controllerOf(s, o) === pid && abilitiesOf(s, o).discardToTop);
  return o && defOf(s, o).name;
}

/**
 * Library of Leng: "If an effect causes you to discard a card, discard it, but you may put it on top of your library
 * instead of into your graveyard." (CR 614.1a). Asked as an effect makes `pid` discard `ids` (never for a cost:
 * rulings), before they're discarded: which of them go on top, each card on its own, in the order they choose (the
 * first ending on top), a randomly discarded one too, once it's been picked (rulings). "paused" while they choose.
 */
export function discardToTop(s: GameState, pid: PlayerId, ids: ObjectId[], src: string, ctx: ResolveCtx): ObjectId[] | "paused" {
  if (!ids.length || !s.resolving || ctx.asCost) return [];
  const sc = (s.resolving.scratch ??= {});
  const done = sc.toTop?.[pid];
  if (done) return done;
  if (!lengName(s, pid)) return [];
  s.pending = { kind: "handToTop", player: pid, count: ids.length, source: src, upTo: true, discarding: ids };
  return "paused";
}

/** discardToTop for each player of `who` in turn (APNAP, CR 101.4): "paused" while one of them chooses. */
function discardToTopEach(s: GameState, chosen: Record<string, ObjectId[]>, who: PlayerId[], src: string, ctx: ResolveCtx): Record<string, ObjectId[]> | "paused" {
  const out: Record<string, ObjectId[]> = {};
  for (const pid of who) {
    const t = discardToTop(s, pid, chosen[pid] ?? [], src, ctx);
    if (t === "paused") return "paused";
    out[pid] = t;
  }
  return out;
}

/** A card's mana value in a library: a split card's halves together (CR 709.4a). */
function clashValue(s: GameState, id: ObjectId): number {
  return defOf(s, obj(s, id))
    .manaCost.split(" // ")
    .reduce((n, half) => n + manaValue(parseManaCost(half)), 0);
}

/**
 * "An opponent chooses", "an opponent separates": an opponent you choose as it resolves, not targeted (rulings on Steam
 * Augury, Sphinx of Uthuun); kept as the resolving object's chosen player. None when no opponent is left.
 */
function chooseAnOpponent(s: GameState, ctx: ResolveCtx, src: string, prompt: string): PlayerId | undefined | "paused" {
  const r = s.resolving!;
  const opps = opponents(s, ctx.controller);
  if (r.chosen?.player === undefined && opps.length === 1) {
    r.chosen = { ...r.chosen, player: opps[0]! };
    log(s, `${player(s, ctx.controller).name} chooses ${player(s, opps[0]!).name} for ${src}.`);
  }
  if (r.chosen?.player === undefined && opps.length > 1) {
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "opponent", options: opps.map(String), labels: opps.map((x) => player(s, x).name), prompt };
    return "paused";
  }
  return r.chosen?.player;
}

/**
 * Opposition Agent, for a player about to search their own library: the controller of the one that entered the
 * battlefield most recently among those controlled by that player's opponents controls them during the search (CR 723.2,
 * rulings). Several Agents each try to exile what they find; the owner of the cards chooses which applies (CR 616.1), and
 * that's the controlling player, who takes them for themselves.
 */
/**
 * Ashiok, Dream Render: an opponent's permanent keeps this player's spells and abilities from making them search their
 * own library.
 */
export function searchBarred(s: GameState, pid: PlayerId): boolean {
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    return controllerOf(s, o) !== pid && !player(s, controllerOf(s, o)).lost && !!abilitiesOf(s, o).opponentsCantSearchOwn;
  });
}

/** Stranglehold: an opponent's permanent keeps this player from searching any library. */
export function cantSearch(s: GameState, pid: PlayerId): boolean {
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    return controllerOf(s, o) !== pid && !player(s, controllerOf(s, o)).lost && !!abilitiesOf(s, o).opponentsCantSearch;
  });
}

/** The fewest top cards an opponent's Aven Mindcensor lets this player search, if any does. */
function searchTop(s: GameState, pid: PlayerId): number | undefined {
  const ns = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) !== pid && !player(s, controllerOf(s, o)).lost).map((o) => abilitiesOf(s, o).opponentsSearchTop).filter((n): n is number => n !== undefined);
  return ns.length ? Math.min(...ns) : undefined;
}

function searchAgent(s: GameState, pid: PlayerId): { controller?: PlayerId; exileFor?: PlayerId } | undefined {
  const agents = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) !== pid && !player(s, controllerOf(s, o)).lost)
    .sort((a, b) => b.timestamp - a.timestamp);
  const controller = agents.find((o) => abilitiesOf(s, o).controlsOpponentSearches);
  const exilers = agents.filter((o) => abilitiesOf(s, o).exilesOpponentFinds);
  if (!controller && !exilers.length) return undefined;
  const by = controller && controllerOf(s, controller);
  const exiler = exilers.find((o) => controllerOf(s, o) === by) ?? exilers[0];
  return { ...(by !== undefined ? { controller: by } : {}), ...(exiler ? { exileFor: controllerOf(s, exiler) } : {}) };
}

const DEST_RANK: Record<string, number> = { battlefield: 4, hand: 3, libraryTop: 2, graveyard: 1, exile: 0 };

/**
 * "Target opponent chooses two of those cards" (Gifts Ungiven), "An opponent chooses one of them" (Murmurs from
 * Beyond): of `owner`'s revealed `cards`, the chooser picks `n` from `eligible`, to go `to`; the rest go `rest` (or
 * stay where they are). "An opponent" is one you choose as it resolves (rulings on Steam Augury). With no more cards
 * than that to choose from there's no choice: they're all chosen (rulings on Gifts Ungiven and Realms Uncharted).
 */
function opponentPicks(s: GameState, ctx: ResolveCtx, src: string, chooserRef: PlayerRef | undefined, owner: PlayerId, cards: ObjectId[], eligible: ObjectId[], n: number, to: SearchDest, rest: SearchDest | undefined): ObjectId[] | "paused" {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  if (sc.picking && sc.found) {
    sc.picked = sc.found;
    sc.picking = undefined;
    sc.found = undefined;
  }
  if (sc.picked) return sc.picked;
  if (eligible.length <= n) return (sc.picked = eligible);
  let chooser: PlayerId | undefined;
  if (chooserRef) chooser = players(s, chooserRef, ctx)[0];
  else {
    const opp = chooseAnOpponent(s, ctx, src, "choose an opponent to choose the cards");
    if (opp === "paused") return "paused";
    chooser = opp;
  }
  // No opponent to choose (they've all left the game): the cards it says to choose can't be chosen.
  if (chooser === undefined || player(s, chooser).lost) return (sc.picked = []);
  const whose = player(s, owner).name;
  const theirs = (d: SearchDest | undefined) => (d ? describeDest(d).replace(/\byour\b/, `${whose}'s`) : `stay on top of ${whose}'s library`);
  sc.picking = true;
  s.pending = {
    kind: "searchLibrary",
    player: chooser,
    source: src,
    what: n === 1 ? "one" : String(n),
    cards: eligible,
    min: n,
    max: n,
    dig: { looked: cards, to: `to put ${theirs(to)}`, rest: rest ? `go ${theirs(rest)}` : theirs(rest) },
    forPlayer: owner,
    ...(DEST_RANK[to.zone]! > (rest ? DEST_RANK[rest.zone]! : 2.5) ? { helps: true as const } : {}),
  };
  return "paused";
}

/** "A creature card that shares a creature type with the sacrificed creature": the filter with that creature's creature types, as it last existed. */
function sacrificedKin(s: GameState, ctx: ResolveCtx, f: TargetSpec): TargetSpec {
  const { sharesCreatureTypeWithSacrificed: _, ...rest } = f;
  const lk = ctx.sacrificed?.[0] ?? s.resolving?.sacrificedThisWay?.at(-1);
  const kin = !lk ? [] : lk.allCreatureTypes ? [...CREATURE_TYPES] : (lk.subtypes ?? []).filter((t) => CREATURE_TYPES.has(t));
  return { ...rest, subtypes: kin.length ? kin : ["(none)"] };
}
