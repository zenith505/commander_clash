import type { Effect, PlayerRef, SearchDest } from "../abilities";
import { abilitiesOf, cardIdOf, defOf, isPermanentCard, isType } from "../cards";
import { controllerOf } from "../layers";
import { compileCard } from "../oracle";
import { nextRandom, shuffle, shuffleLibrary } from "../rng";
import { gainLife, log, loseLife, moveObject, enterTogether, obj, oneOfEachFits, opponents, payableLife, player } from "../game";
import { manaValue, parseManaCost } from "../mana";
import type { GameState, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, printedMatches } from "./targeting";
import { ResolveCtx, apnap, players, amountNow, amountCtx, amountFor, objects } from "./resolve";
import { describeDest } from "./describe";
import { fireEvent } from "./triggers";
import { chooseAuraHosts } from "./run-zones";
import type { AuraHost } from "../game";
import { defMv, sameName } from "../faces";

/** Libraries, hands and graveyards: mill, discard, scry, surveil, search, look at the top cards. */
export function runLibraryEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "mill":
      // Kept for "if a card with the chosen name was milled this way" (Predict).
      s.resolving!.milled = [];
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = amountNow(s, e.n, { ...ctx, eachOne: pid });
        for (const id of p.library.slice(0, n)) {
          moveObject(s, id, "graveyard");
          if (obj(s, id).zone === "graveyard") s.resolving!.milled.push({ id, zc: obj(s, id).zoneChanges ?? 0 });
        }
        log(s, `${p.name} mills ${n} card${n === 1 ? "" : "s"}.`);
      }
      return;
    case "exileTop":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const ids = p.library.slice(0, amountNow(s, e.n, ctx));
        for (const id of ids) moveObject(s, id, "exile");
        if (ids.length === 1 && s.resolving) s.resolving.exiledTop = { id: ids[0]!, zc: s.objects[ids[0]!]!.zoneChanges ?? 0 };
        // An empty library: nothing happens (ingest rulings).
        if (ids.length) log(s, `${p.name} exiles ${ids.map((id) => defOf(s, s.objects[id]!).name).join(", ")} from the top of their library.`);
      }
      return;
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
        for (const pid of apnap(s, who)) {
          const hand = player(s, pid).hand;
          const picked: ObjectId[] = [];
          const pool = [...hand];
          const n = nFor[pid] ?? 0;
          for (let i = 0; i < n && pool.length; i++) picked.push(pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0]!);
          discardCards(s, pid, picked, " at random", false, false, ctx.controller);
        }
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
      for (const pid of apnap(s, who)) discardCards(s, pid, sc.chosen![pid] ?? [], "", false, false, ctx.controller);
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
      if (e.action === "discard") discardCards(s, pid, ids, "", false, false, ctx.controller);
      else if (e.action === "libraryThird")
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
      if (!sc.found) {
        const cards = p.library.slice(0, e.n);
        if (!cards.length) return;
        sc.looked = cards;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card", cards, min: 1, max: 1, dig: { looked: cards, to: "into exile face down (hideaway)", rest: "on the bottom of your library in a random order" } };
        return "paused";
      }
      const looked = sc.looked ?? [];
      const found = sc.found.filter((id) => obj(s, id).zone === "library");
      for (const id of found) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") continue;
        o.hiddenExile = { by: ctx.sourceId ?? "", seen: [p.id] };
        if (ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
        log(s, `${p.name} exiles a card face down (hideaway).`);
        log(s, `You exiled ${defOf(s, o).name} face down with ${src}.`, p.id);
      }
      const rest = looked.filter((id) => obj(s, id).zone === "library");
      shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library"); // to the bottom, in a random order
      if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
      return;
    }
    case "scry":
    case "surveil": {
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const arranged = r.scratch?.arranged;
      if (!arranged) {
        const cards = p.library.slice(0, amountNow(s, e.n, ctx));
        if (!cards.length) return; // scry 0 / empty library: nothing happens (CR 701.22b)
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
        s.pending = { kind: "arrangeTop", player: ctx.controller, how: look ? "look" : "order", cards, source: src, ...(owner !== ctx.controller ? { owner } : {}) };
        return "paused";
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
    case "shuffleZones":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const ids = [...(e.hand ? p.hand : []), ...(e.graveyard ? p.graveyard : [])];
        if (e.bottom) {
          // Endurance: "puts all the cards from their graveyard on the bottom of their library in a random order".
          shuffle(s, ids);
          for (const id of ids) moveObject(s, id, "library"); // to the bottom
          log(s, `${p.name} puts ${ids.length === 1 ? "the card" : `all ${ids.length} cards`} from their graveyard on the bottom of their library in a random order.`);
          continue;
        }
        for (const id of ids) moveObject(s, id, "library");
        shuffleLibrary(s, p);
        log(s, `${p.name} shuffles their ${e.hand && e.graveyard ? "hand and graveyard" : e.hand ? "hand" : "graveyard"} into their library.`);
      }
      return;
    case "shuffle":
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
      // "With mana value less than or equal to ..." (TargetSpec.bound): as it resolves.
      const filter0 = e.filter && bindBound(s, e.filter, amountCtx(s, ctx));
      const filter = filter0?.named === "~" ? { ...filter0, named: src } : filter0;
      const who = e.who ? (e.who.ref === "eachPlayer" || e.who.ref === "eachOpponent" ? apnap(s, players(s, e.who, ctx)) : players(s, e.who, ctx).slice(0, 1)) : [ctx.controller];
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
      while (e.may && queue.length && sc.may !== true) {
        if (sc.may === false) {
          queue.shift();
          sc.may = undefined;
          continue;
        }
        const kind = (filter?.text ?? "card").replace(/~/g, src);
        s.pending = { kind: "chooseMay", player: queue[0]!, source: src, prompt: `search your library for ${e.upTo ? "up to " : ""}${amountNow(s, e.n, ctx) === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${amountNow(s, e.n, ctx)} ${kind.replace(/\bcard\b/, "cards")}`}` };
        return "paused";
      }
      if (queue.length) {
        const p = player(s, queue[0]!);
        const n = (sc.n ??= amountNow(s, e.n, ctx));
        // "Search your library and/or graveyard": the library too, or not (then no shuffle), chosen before looking. Only
        // asked when the graveyard has a card that fits; otherwise both are searched.
        const fits = (id: ObjectId) => !filter || printedMatches(filter, defOf(s, obj(s, id)));
        if (e.orGraveyard && sc.searchZones === undefined) {
          if (p.graveyard.some(fits)) {
            s.pending = { kind: "chooseOption", player: p.id, source: src, what: "searchZones", options: ["both", "graveyard"], labels: ["Library and graveyard", "Graveyard only"], prompt: "search your library too (then shuffle), or only your graveyard?" };
            return "paused";
          }
          sc.searchZones = "both";
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
        let cards = [...(yardOnly ? [] : top === undefined ? lib : lib.slice(0, top)), ...(e.orGraveyard ? p.graveyard : [])].filter(fits);
        // At most one of each name: cards with the same name in a library are alike, so one of each is offered.
        if (e.oneEach) cards = cards.filter((id, i) => cards.findIndex((x) => sameName(defOf(s, obj(s, x)).name, defOf(s, obj(s, id)).name)) === i);
        const max = Math.min(n, cards.length);
        const min = filter || e.upTo ? 0 : max;
        // Opposition Agent: searching their own library, an opponent of its controller is controlled by them (CR 723.5).
        const agent = !yardOnly && libOf(p.id) === p ? searchAgent(s, p.id) : undefined;
        if (agent?.exileFor !== undefined) sc.searchExileFor = agent.exileFor;
        const kind = (filter?.text ?? "card").replace(/~/g, src);
        const what = e.oneOfEach ? `up to a ${kind}` : `${e.upTo ? "up to " : ""}${n === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${n >= 99 ? "any number of" : n} ${kind.replace(/\bcard\b/, "cards")}`}`;
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
          ...(e.others && agent?.exileFor === undefined ? { firstTo: describeDest(e.dest), othersTo: describeDest(e.others) } : {}),
          ...(e.shareLandType ? { shareLandType: true as const } : {}),
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
      const dest = (pid: PlayerId, id: ObjectId): SearchDest => (exiledFor(pid) !== undefined ? { zone: "exile" } : picked.includes(id) ? e.split!.to : foundBy(pid).indexOf(id) > 0 && e.others ? e.others : e.landTo && isType(defOf(s, obj(s, id)), "Land") ? e.landTo : e.dest);
      const onto = searchers.flatMap((pid) => foundBy(pid).filter((id) => dest(pid, id).zone === "battlefield").map((id) => ({ o: obj(s, id), under: pid })));
      const hosts = chooseAuraHosts(s, onto, src);
      if (hosts === "paused") return "paused";
      const moves: { pid: PlayerId; id: ObjectId }[] = [];
      for (const pid of searchers) {
        const p = player(s, pid);
        const lib = libOf(pid);
        const found = foundBy(pid).filter((id) => dest(pid, id).zone !== "battlefield" || !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id));
        lib.library = lib.library.filter((id) => !found.includes(id));
        const names = found.map((id) => defOf(s, obj(s, id)).name);
        // Found cards aren't revealed unless the effect says so (CR 701.23e).
        const shown = e.reveal || e.dest.zone === "battlefield" || (e.dest.zone === "exile" && !e.dest.faceDown) || exiledFor(pid) !== undefined ? ` (${names.join(", ")})` : "";
        const whose = lib === p ? "their" : `${lib.name}'s`;
        const yardOnly = sc.searchZones === "graveyard";
        const where = yardOnly ? `${whose} graveyard` : e.orGraveyard ? `${whose} library and graveyard` : `${whose} library`;
        log(s, `${p.name} searches ${where}${found.length ? `, finds ${found.length === 1 ? "a card" : `${found.length} cards`}${shown}${exiledFor(pid) !== undefined ? ` and exiles ${found.length === 1 ? "it" : "them"} for ${player(s, exiledFor(pid)!).name} to play` : ""}` : " and finds nothing"}${searchers.length > 1 || yardOnly ? "" : lib === p ? ", and shuffles" : `, and ${lib.name} shuffles`}.`);
        for (const id of found) moves.push({ pid, id });
        if (searchers.length === 1 && !yardOnly) shuffleLibrary(s, lib);
      }
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
          if (to.zone === "libraryTop") {
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
          // Opposition Agent: exiled face up (CR 406.3), its controller may play it for as long as it remains exiled, a land
          // too (following the normal timing rules) and spend mana as though it were mana of any color to cast it (CR
          // 609.4b: colored symbols paid with any mana).
          const agentPid = exiledFor(pid);
          const o = obj(s, id);
          if (agentPid !== undefined && o.zone === "exile") o.mayPlay = { player: agentPid, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, anyType: true };
        }
      });
      // "Then shuffles": after the cards are put onto the battlefield, each player who searched (CR 701.23, 701.20).
      if (searchers.length > 1)
        for (const pid of searchers) {
          shuffleLibrary(s, player(s, pid));
          log(s, `${player(s, pid).name} shuffles their library.`);
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
        for (const id of got) moveObject(s, id, e.to.zone === "libraryTop" ? "library" : e.to.zone, e.to.zone === "battlefield" ? { controller: p.id, ...(e.to.tapped ? { tapped: true } : {}) } : undefined);
        if (e.rest) for (const id of rest) moveObject(s, id, e.rest.zone === "libraryTop" ? "library" : e.rest.zone);
      });
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
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.looked) {
        sc.looked = p.library.slice(0, amountNow(s, e.n, ctx));
        if (!sc.looked.length) return;
        // "With mana value X or less": the X it was cast or activated with (TargetSpec.xRange), or an amount counted now
        // (TargetSpec.bound: Hatchery Spider's "where X is the number of creature cards in your graveyard").
        const filter = e.filter?.xRange ? (({ xRange: _, ...r }) => ({ ...r, manaValue: { max: ctx.x ?? 0 } }))(e.filter) : e.filter && bindBound(s, e.filter, amountCtx(s, ctx));
        const mvMax = filter?.manaValue?.max ?? ctx.x ?? 0;
        const options = sc.looked.filter((id) => !filter || printedMatches(filter, defOf(s, obj(s, id))));
        const max = Math.max(0, Math.min(e.count, options.length, sc.looked.length - (e.minRest ?? 0)));
        const min = e.required ? max : e.upTo || e.filter ? 0 : max;
        log(s, `${p.name} ${e.reveal ? "reveals" : "looks at"} the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of their library${e.reveal ? ` (${sc.looked.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}.`);
        if (max > 0 && !(min === max && options.length === max)) {
          const kind = (e.filter?.text ?? "card").replace(/~/g, src).replace(/ X or less$/, ` ${mvMax} or less`);
          // "Take none" says it's optional; "up to" only reads well with a number.
          const what = e.oneOfEach ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : max === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${min < max ? "up to " : ""}${max} ${kind.replace(/\bcard\b/, "cards")}`;
          const to = e.into === "hand" ? "into your hand" : e.into === "exile" ? `into exile${e.play ? " (you may play it this turn)" : ""}` : e.into === "battlefield" ? "onto the battlefield" : e.into === "manifest" ? "onto the battlefield face down (manifest)" : e.into === "cloak" ? "onto the battlefield face down (cloak)" : "back on top of your library";
          const rest = e.rest === "graveyard" ? "into your graveyard" : e.rest === "shuffle" ? "shuffled into your library" : e.rest === "hand" ? "into your hand" : e.rest === "keep" ? "left on top for now" : "on the bottom of your library";
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards: options, min, max, dig: { looked: sc.looked, to, rest }, ...(e.oneOfEach ? { oneOfEach: e.oneOfEach } : {}) };
          return "paused";
        }
        // Nothing to choose: all of them, or (one for each) as many as fit.
        sc.found = e.oneOfEach ? options.reduce<ObjectId[]>((a, id) => (oneOfEachFits(e.oneOfEach!, [...a, id].map((x) => defOf(s, obj(s, x)))) ? [...a, id] : a), []) : options.slice(0, max);
      }
      const looked = sc.looked;
      let found = (sc.found ?? []).filter((id) => looked.includes(id));
      const names = (ids: ObjectId[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      const faceDown = e.into === "manifest" || e.into === "cloak" ? e.into : undefined;
      // Resuming after the owner ordered the rest for the bottom: the cards taken have already moved.
      if (sc.moved) return toBottom(s, pid, looked.filter((id) => !found.includes(id) && obj(s, id).zone === "library"), src, false);
      // An Aura put onto the battlefield: its controller chooses what it enchants as it enters (CR 303.4f), or it stays
      // with the rest (303.4g).
      const hosts = e.into === "battlefield" ? chooseAuraHosts(s, found.map((id) => ({ o: obj(s, id), under: p.id })), src) : new Map<ObjectId, AuraHost>();
      if (hosts === "paused") return "paused";
      found = found.filter((id) => {
        if (e.into !== "battlefield" || !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id)) return true;
        log(s, `${defOf(s, obj(s, id)).name} has nothing to enchant, so it stays with the rest.`);
        return false;
      });
      const rest = looked.filter((id) => !found.includes(id) && obj(s, id).zone === "library");
      if (found.length && faceDown) log(s, `${p.name} ${faceDown}s ${found.length === 1 ? "a card" : `${found.length} cards`}: ${found.length === 1 ? "a" : "each a"} face-down 2/2 creature${faceDown === "cloak" ? " with ward {2}" : ""}.`);
      else if (found.length && e.into === "exile") log(s, `${p.name} exiles ${names(found)}${e.play ? " and may play it this turn" : ""}.`);
      else if (found.length) log(s, `${p.name} puts ${e.into === "hand" ? (e.reveal || e.filter ? names(found) : found.length === 1 ? "a card" : `${found.length} cards`) + " into their hand" : e.into === "battlefield" ? names(found) + " onto the battlefield" : names(found) + " back on top"}.`);
      if (e.into === "battlefield" || faceDown) r.created = [];
      enterTogether(s, () => {
        for (const id of found) {
          if (e.into === "hand") moveObject(s, id, "hand");
          else if (e.into === "exile") {
            // Face up (CR 406.3); "you may play the exiled card this turn" is that object's only (CR 400.7).
            moveObject(s, id, "exile");
            const o = obj(s, id);
            if (e.play) o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
          } else if (faceDown) {
            // One at a time (CR 701.40e, 701.58e), each a 2/2 face-down creature; "it" in what follows.
            moveObject(s, id, "battlefield", { controller: p.id, faceDown });
            if (obj(s, id).zone === "battlefield") r.created!.push(id);
          }
          else if (e.into === "battlefield") {
            moveObject(s, id, "battlefield", { controller: p.id, ...(e.tapped ? { tapped: true } : {}), ...(e.counters ? { counters: { [e.counters.counter]: e.counters.n } } : {}), ...hosts.get(id) });
            if (obj(s, id).zone === "battlefield") r.created!.push(id); // "it" in what follows
          } else p.library = [id, ...p.library.filter((x) => x !== id)];
        }
      });
      if (e.rest === "shuffle") {
        shuffleLibrary(s, p); // "Then shuffle" (CR 701.20)
        log(s, `${p.name} shuffles their library.`);
      } else if (e.rest === "graveyard") {
        if (rest.length) log(s, `${p.name} puts ${names(rest)} into their graveyard.`);
        for (const id of rest) moveObject(s, id, "graveyard");
      } else if (e.rest === "keep") {
        // They stay on top, in the order they were in.
      } else if (e.rest === "hand") {
        if (rest.length) log(s, `${p.name} puts ${rest.length === 1 ? "the other card" : `the other ${rest.length} cards`} into their hand.`);
        for (const id of rest) moveObject(s, id, "hand");
      } else {
        sc.moved = true;
        return toBottom(s, pid, rest, src, !!e.random);
      }
      return;
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
export function discardCards(s: GameState, pid: PlayerId, ids: ObjectId[], how = "", quiet = false, cycled = false, cause?: PlayerId, /** The X chosen for a cycling cost (Shark Typhoon). */ cycledX?: number) {
  if (!ids.length) return;
  if (s.resolving) (s.resolving.discarded ??= {})[pid] = (s.resolving.discarded[pid] ?? 0) + ids.length;
  const names = ids.map((id) => defOf(s, obj(s, id)).name);
  if (!quiet) log(s, `${player(s, pid).name} discards ${names.join(", ")}${how}.`);
  const cards = ids.map((id) => defOf(s, obj(s, id)));
  for (const id of ids) {
    const o = obj(s, id);
    const c = compileCard(defOf(s, o));
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
  // They were discarded at the same time (CR 701.9b); each one triggers "whenever you discard a card" (CR 603.2c).
  ids.forEach((id, i) => fireEvent(s, { type: "discarded", player: pid, id, card: cards[i]!, ...(cycled ? { cycled: true } : {}), ...(cycledX ? { x: cycledX } : {}) }));
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
