import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { nextRandom, shuffle } from "../rng";
import { log, moveObject, obj, player } from "../game";
import type { GameState, ObjectId, PlayerId } from "../types";
import { printedMatches } from "./targeting";
import { ResolveCtx, apnap, players, amountNow } from "./resolve";
import { describeDest } from "./describe";

/** Libraries, hands and graveyards: mill, discard, scry, surveil, search, look at the top cards. */
export function runLibraryEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "mill":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = amountNow(s, e.n, ctx);
        for (const id of p.library.slice(0, n)) moveObject(s, id, "graveyard");
        log(s, `${p.name} mills ${n} card${n === 1 ? "" : "s"}.`);
      }
      return;
    case "discard": {
      const who = players(s, e.who, ctx);
      // Worked out once, before anyone discards.
      const sc0 = (s.resolving!.scratch ??= {});
      const n = (sc0.n ??= amountNow(s, e.n, ctx));
      if (e.random) {
        for (const pid of apnap(s, who)) {
          const hand = player(s, pid).hand;
          const picked: ObjectId[] = [];
          const pool = [...hand];
          for (let i = 0; i < n && pool.length; i++) picked.push(pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0]!);
          discardCards(s, pid, picked, " at random");
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
        const hand = player(s, pid).hand;
        if (hand.length > n) {
          s.pending = { kind: "discard", player: pid, count: n, source: src };
          return "paused";
        }
        sc.chosen![pid] = [...hand]; // no choice to make: the whole hand
        sc.queue.shift();
      }
      for (const pid of apnap(s, who)) discardCards(s, pid, sc.chosen![pid] ?? []);
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
    case "search": {
      // CR 701.23: look through the library for matching cards. With a stated quality ("a basic land
      // card") a player may find fewer than asked for, even none (701.23b); asked simply for "a card"
      // or "two cards", they must find as many as they can (701.23d).
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const filter = e.filter?.named === "~" ? { ...e.filter, named: src } : e.filter;
      if (!sc.found) {
        const n = (sc.n ??= amountNow(s, e.n, ctx));
        const cards = p.library.filter((id) => !filter || printedMatches(filter, defOf(s, obj(s, id))));
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
      const found = sc.found;
      p.library = p.library.filter((id) => !found.includes(id));
      shuffle(s, p.library);
      const names = found.map((id) => defOf(s, obj(s, id)).name);
      // Found cards aren't revealed unless the effect says so (CR 701.23e).
      const shown = e.reveal || e.dest.zone === "battlefield" ? ` (${names.join(", ")})` : "";
      log(s, `${p.name} searches their library${found.length ? `, finds ${found.length === 1 ? "a card" : `${found.length} cards`}${shown}` : " and finds nothing"}, and shuffles.`);
      found.forEach((id, i) => {
        const to = i > 0 && e.others ? e.others : e.dest;
        if (to.zone === "libraryTop") {
          obj(s, id).zone = "library";
          p.library.unshift(id);
        } else if (to.zone === "battlefield") moveObject(s, id, "battlefield", { controller: p.id, ...(to.tapped ? { tapped: true } : {}) });
        else moveObject(s, id, to.zone);
      });
      return;
    }
    case "dig": {
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.looked) {
        sc.looked = p.library.slice(0, amountNow(s, e.n, ctx));
        if (!sc.looked.length) return;
        const options = sc.looked.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
        const max = Math.min(e.count, options.length);
        const min = e.upTo || e.filter ? 0 : max;
        log(s, `${p.name} ${e.reveal ? "reveals" : "looks at"} the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of their library${e.reveal ? ` (${sc.looked.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}.`);
        if (max > 0 && !(min === max && options.length === max)) {
          const kind = (e.filter?.text ?? "card").replace(/~/g, src);
          // "Take none" says it's optional; "up to" only reads well with a number.
          const what = max === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${min < max ? "up to " : ""}${max} ${kind.replace(/\bcard\b/, "cards")}`;
          const to = e.into === "hand" ? "into your hand" : "back on top of your library";
          const rest = e.rest === "graveyard" ? "into your graveyard" : "on the bottom of your library";
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards: options, min, max, dig: { looked: sc.looked, to, rest } };
          return "paused";
        }
        sc.found = options.slice(0, max);
      }
      const looked = sc.looked;
      const found = (sc.found ?? []).filter((id) => looked.includes(id));
      const rest = looked.filter((id) => !found.includes(id) && obj(s, id).zone === "library");
      const names = (ids: ObjectId[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      if (found.length) log(s, `${p.name} puts ${e.into === "hand" ? (e.reveal || e.filter ? names(found) : found.length === 1 ? "a card" : `${found.length} cards`) + " into their hand" : names(found) + " back on top"}.`);
      for (const id of found) {
        if (e.into === "hand") moveObject(s, id, "hand");
        else p.library = [id, ...p.library.filter((x) => x !== id)];
      }
      if (e.rest === "graveyard") {
        if (rest.length) log(s, `${p.name} puts ${names(rest)} into their graveyard.`);
        for (const id of rest) moveObject(s, id, "graveyard");
      } else {
        // "On the bottom in any order" or "in a random order": random either way.
        const bottom = [...rest];
        shuffle(s, bottom);
        p.library = [...p.library.filter((x) => !rest.includes(x)), ...bottom];
        if (rest.length) log(s, `${p.name} puts ${rest.length === 1 ? "a card" : `${rest.length} cards`} on the bottom of their library.`);
      }
      return;
    }
  }
}

/** Move cards from a player's hand to their graveyard (CR 701.9a). */
export function discardCards(s: GameState, pid: PlayerId, ids: ObjectId[], how = "") {
  if (!ids.length) return;
  const names = ids.map((id) => defOf(s, obj(s, id)).name);
  for (const id of ids) moveObject(s, id, "graveyard");
  log(s, `${player(s, pid).name} discards ${names.join(", ")}${how}.`);
}
