import type { Effect } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { compileCard } from "../oracle";
import { nextRandom, shuffle } from "../rng";
import { gainLife, log, loseLife, moveObject, enterTogether, obj, opponents, player } from "../game";
import { manaValue, parseManaCost } from "../mana";
import type { GameState, ObjectId, PlayerId } from "../types";
import { bindBound, printedMatches } from "./targeting";
import { ResolveCtx, apnap, players, amountNow, amountCtx, amountFor, objects } from "./resolve";
import { describeDest } from "./describe";
import { fireEvent } from "./triggers";
import { chooseAuraHosts } from "./run-zones";
import type { AuraHost } from "../game";

/** Libraries, hands and graveyards: mill, discard, scry, surveil, search, look at the top cards. */
export function runLibraryEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "mill":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = amountNow(s, e.n, { ...ctx, eachOne: pid });
        for (const id of p.library.slice(0, n)) moveObject(s, id, "graveyard");
        log(s, `${p.name} mills ${n} card${n === 1 ? "" : "s"}.`);
      }
      return;
    case "exileTop":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const ids = p.library.slice(0, amountNow(s, e.n, ctx));
        for (const id of ids) moveObject(s, id, "exile");
        // An empty library: nothing happens (ingest rulings).
        if (ids.length) log(s, `${p.name} exiles ${ids.map((id) => defOf(s, s.objects[id]!).name).join(", ")} from the top of their library.`);
      }
      return;
    case "revealTop": {
      // An empty library: nothing is revealed, and an "if it's a ... card" after it is false.
      const p = player(s, ctx.controller);
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
      const n = manaValue(parseManaCost(d.manaCost));
      if (!e.life || n <= 0) return;
      for (const pid of players(s, e.life.who, ctx)) {
        if (e.life.gain) gainLife(s, pid, n);
        else loseLife(s, pid, n);
        log(s, `${player(s, pid).name} ${e.life.gain ? "gains" : "loses"} ${n} life.`);
      }
      return;
    }
    case "discard": {
      const who = players(s, e.who, ctx);
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
        const hand = player(s, pid).hand.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
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
          s.pending = { kind: "discard", player: pid, count: n, source: src, ...(e.filter ? { filter: e.filter } : {}) };
          return "paused";
        }
        sc.chosen![pid] = [...hand]; // no choice to make: the whole hand (all the cards that match)
        sc.queue.shift();
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
        if (!cards.length) return;
        const kind = e.filter?.text ?? "card";
        const what = `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`;
        const to = e.action === "discard" ? `for ${p.name} to discard` : e.action === "libraryThird" ? `for ${p.name} to put into their library third from the top` : "to exile";
        s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what, cards, min: 1, max: 1, dig: { looked: [...p.hand], to, rest: `stay in ${p.name}'s hand` }, hand: pid };
        return "paused";
      }
      const ids = sc.found.filter((id) => obj(s, id).zone === "hand" && obj(s, id).owner === pid);
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
          s.pending = { kind: "handToTop", player: p.id, count: n, source: src };
          return "paused";
        }
        ids = [...p.hand];
      }
      const cards = ids.filter((id) => p.hand.includes(id));
      for (const id of [...cards].reverse()) moveObject(s, id, "library", { top: true });
      log(s, `${p.name} puts ${cards.length === 1 ? "a card" : `${cards.length} cards`} from their hand on top of their library.`);
      return;
    }
    case "shuffleIntoLibrary":
    case "shuffleSpell": {
      // The owners whose libraries are shuffled, whether or not the card is still there (CR 701.24c).
      const owners = new Set<PlayerId>();
      if (e.type === "shuffleSpell") {
        const item = s.resolving?.item;
        const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        if (!o) return;
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
        shuffle(s, p.library);
        log(s, `${p.name} shuffles their library.`);
      }
      return;
    }
    case "shuffleZones":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const ids = [...(e.hand ? p.hand : []), ...(e.graveyard ? p.graveyard : [])];
        for (const id of ids) moveObject(s, id, "library");
        shuffle(s, p.library);
        log(s, `${p.name} shuffles their ${e.hand && e.graveyard ? "hand and graveyard" : e.hand ? "hand" : "graveyard"} into their library.`);
      }
      return;
    case "shuffle":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        shuffle(s, p.library);
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
      const who = e.who ? (e.who.ref === "eachPlayer" ? apnap(s, players(s, e.who, ctx)) : players(s, e.who, ctx).slice(0, 1)) : [ctx.controller];
      const queue = (sc.searchQueue ??= who.filter((pid) => !player(s, pid).lost));
      const searchedBy = (sc.searchedBy ??= []);
      // "Search target opponent's library" (Bribery): you search it (CR 701.23a), and it's theirs that's shuffled.
      const theirs = e.library ? players(s, e.library, ctx)[0] : undefined;
      if (e.library && theirs === undefined) return;
      const libOf = (pid: PlayerId) => player(s, theirs ?? pid);
      if (sc.found && queue.length) {
        searchedBy.push({ pid: queue.shift()!, found: sc.found });
        sc.found = undefined;
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
        let cards = [...(yardOnly ? [] : libOf(p.id).library), ...(e.orGraveyard ? p.graveyard : [])].filter(fits);
        // At most one of each name: cards with the same name in a library are alike, so one of each is offered.
        if (e.oneEach) cards = cards.filter((id, i) => cards.findIndex((x) => defOf(s, obj(s, x)).name === defOf(s, obj(s, id)).name) === i);
        const max = Math.min(n, cards.length);
        const min = filter || e.upTo ? 0 : max;
        const kind = (filter?.text ?? "card").replace(/~/g, src);
        const what = `${e.upTo ? "up to " : ""}${n === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${n >= 99 ? "any number of" : n} ${kind.replace(/\bcard\b/, "cards")}`}`;
        s.pending = {
          kind: "searchLibrary",
          player: p.id,
          source: src,
          what,
          cards,
          min,
          max,
          ...(e.others ? { firstTo: describeDest(e.dest), othersTo: describeDest(e.others) } : {}),
        };
        return "paused";
      }
      // An Aura found for the battlefield: its controller chooses what it enchants as it enters (CR 303.4f); with nothing
      // to enchant it stays in the library (303.4g), and is shuffled with it.
      const searchers = searchedBy.map((x) => x.pid);
      const foundBy = (pid: PlayerId) => searchedBy.find((x) => x.pid === pid)!.found;
      const dest = (pid: PlayerId, id: ObjectId) => (foundBy(pid).indexOf(id) > 0 && e.others ? e.others : e.dest);
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
        const shown = e.reveal || e.dest.zone === "battlefield" || e.dest.zone === "exile" ? ` (${names.join(", ")})` : "";
        const whose = lib === p ? "their" : `${lib.name}'s`;
        const yardOnly = sc.searchZones === "graveyard";
        const where = yardOnly ? `${whose} graveyard` : e.orGraveyard ? `${whose} library and graveyard` : `${whose} library`;
        log(s, `${p.name} searches ${where}${found.length ? `, finds ${found.length === 1 ? "a card" : `${found.length} cards`}${shown}` : " and finds nothing"}${searchers.length > 1 || yardOnly ? "" : lib === p ? ", and shuffles" : `, and ${lib.name} shuffles`}.`);
        for (const id of found) moves.push({ pid, id });
        if (searchers.length === 1 && !yardOnly) shuffle(s, lib.library);
      }
      // What it found and put onto the battlefield is "it" afterwards (Vision Quest's "it gains haste").
      if (e.n === 1 && !e.others && e.dest.zone === "battlefield") r.created = [];
      enterTogether(s, () => {
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
        }
      });
      // "Then shuffles": after the cards are put onto the battlefield, each player who searched (CR 701.23, 701.20).
      if (searchers.length > 1)
        for (const pid of searchers) {
          shuffle(s, player(s, pid).library);
          log(s, `${player(s, pid).name} shuffles their library.`);
        }
      return;
    }
    case "dig": {
      const pid = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (pid === undefined || player(s, pid).lost) return;
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
        const max = Math.min(e.count, options.length);
        const min = e.required ? max : e.upTo || e.filter ? 0 : max;
        log(s, `${p.name} ${e.reveal ? "reveals" : "looks at"} the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of their library${e.reveal ? ` (${sc.looked.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}.`);
        if (max > 0 && !(min === max && options.length === max)) {
          const kind = (e.filter?.text ?? "card").replace(/~/g, src).replace(/ X or less$/, ` ${mvMax} or less`);
          // "Take none" says it's optional; "up to" only reads well with a number.
          const what = max === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${min < max ? "up to " : ""}${max} ${kind.replace(/\bcard\b/, "cards")}`;
          const to = e.into === "hand" ? "into your hand" : e.into === "battlefield" ? "onto the battlefield" : e.into === "manifest" ? "onto the battlefield face down (manifest)" : e.into === "cloak" ? "onto the battlefield face down (cloak)" : "back on top of your library";
          const rest = e.rest === "graveyard" ? "into your graveyard" : e.rest === "shuffle" ? "shuffled into your library" : e.rest === "hand" ? "into your hand" : "on the bottom of your library";
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards: options, min, max, dig: { looked: sc.looked, to, rest } };
          return "paused";
        }
        sc.found = options.slice(0, max);
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
      else if (found.length) log(s, `${p.name} puts ${e.into === "hand" ? (e.reveal || e.filter ? names(found) : found.length === 1 ? "a card" : `${found.length} cards`) + " into their hand" : e.into === "battlefield" ? names(found) + " onto the battlefield" : names(found) + " back on top"}.`);
      if (e.into === "battlefield" || faceDown) r.created = [];
      enterTogether(s, () => {
        for (const id of found) {
          if (e.into === "hand") moveObject(s, id, "hand");
          else if (faceDown) {
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
        shuffle(s, p.library); // "Then shuffle" (CR 701.20)
        log(s, `${p.name} shuffles their library.`);
      } else if (e.rest === "graveyard") {
        if (rest.length) log(s, `${p.name} puts ${names(rest)} into their graveyard.`);
        for (const id of rest) moveObject(s, id, "graveyard");
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
export function discardCards(s: GameState, pid: PlayerId, ids: ObjectId[], how = "", quiet = false, cycled = false, cause?: PlayerId) {
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
  ids.forEach((id, i) => fireEvent(s, { type: "discarded", player: pid, id, card: cards[i]!, ...(cycled ? { cycled: true } : {}) }));
}

/** A card's mana value in a library: a split card's halves together (CR 709.4a). */
function clashValue(s: GameState, id: ObjectId): number {
  return defOf(s, obj(s, id))
    .manaCost.split(" // ")
    .reduce((n, half) => n + manaValue(parseManaCost(half)), 0);
}
