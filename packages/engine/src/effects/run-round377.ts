// Round 377's effects: a hidden search of a player's library that they try to name (Sphinx Ambassador), and a copy of a
// card made by name outside the game (Garth One-Eye).
import type { Effect } from "../abilities";
import { defOf, isType } from "../cards";
import { sameName } from "../faces";
import { log, moveObject, newObject, obj, player } from "../game";
import { namedCardDef } from "../meld-results";
import { shuffleLibrary } from "../rng";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { players, runEffect } from "./resolve";
import { cantSearch, searchTop } from "./run-library";
import { removeCopy } from "./run-spells";

/**
 * Sphinx Ambassador: "search that player's library for a card, then that player chooses a card name. If you searched for
 * a creature card that doesn't have that name, you may put it onto the battlefield under your control. Then that player
 * shuffles." You search it (CR 701.23a) and must find a card if there's one, "a card" being a quantity (701.23d); the card
 * stays hidden from that player (rulings). That player names a card as it resolves (CR 608.2d). A creature card is any
 * card with the type (rulings), judged in the library by its card (CR 400.7, still that card there). Not put in, it stays
 * unrevealed, and the library is shuffled either way.
 */
export function runSearchTheyNameEffect(s: GameState, e: Extract<Effect, { type: "searchTheyName" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const pid = players(s, e.library, ctx)[0];
  if (pid === undefined || player(s, pid).lost) return;
  const them = player(s, pid);
  const me = player(s, ctx.controller);
  const st = (sc.ambassador ??= {});
  if (!st.found) {
    if (sc.found) {
      const id = sc.found[0];
      sc.found = undefined;
      st.found = id !== undefined ? { id, zc: obj(s, id).zoneChanges ?? 0 } : "none";
      log(s, st.found === "none" ? `${me.name} searches ${them.name}'s library and finds nothing.` : `${me.name} searches ${them.name}'s library and chooses a card, keeping it hidden.`);
    } else {
      // Stranglehold, Shadow of Doubt: no search, but the name is still chosen and the library still shuffled.
      if (cantSearch(s, ctx.controller)) {
        log(s, `${me.name} can't search ${them.name}'s library.`);
        st.found = "none";
      } else {
        // Aven Mindcensor: an opponent of its controller searches only the top cards (the whole library is still shuffled).
        const top = searchTop(s, ctx.controller);
        const cards = top === undefined ? [...them.library] : them.library.slice(0, top);
        // Not "searched their library" (Archive Trap): it's that player's library being searched, by you.
        if (cards.length) {
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `a card in ${them.name}'s library (${them.name} then names a card; a creature card without that name you may put onto the battlefield under your control)`, cards, min: 1, max: 1 };
          return "paused";
        }
        log(s, `${me.name} searches ${them.name}'s library, which is empty.`);
        st.found = "none";
      }
    }
  }
  if (!st.named) {
    // The name is that player's, chosen without seeing the card (CR 608.2d); a bot guesses its own best creature card.
    const got = runEffect(s, { type: "choose", choice: "cardName", who: { ref: "eachOne" }, purpose: "guardLibrary" }, { ...ctx, eachOne: pid });
    if (got === "paused") return "paused";
    st.named = true;
    sc.asked = undefined;
  }
  const found = st.found;
  const card = found !== "none" && found && s.objects[found.id]?.zone === "library" && (s.objects[found.id]!.zoneChanges ?? 0) === found.zc && obj(s, found.id).owner === pid ? obj(s, found.id) : undefined;
  const name = r.chosen?.name;
  const takeable = !!card && isType(defOf(s, card), "Creature") && !sameName(defOf(s, card).name, name);
  if (takeable && !st.asked) {
    st.asked = true;
    s.pending = { kind: "chooseMay", player: ctx.controller, source: src, prompt: `put ${defOf(s, card!).name} onto the battlefield under your control (${them.name} named ${name ?? "nothing"})`, card: card!.id };
    return "paused";
  }
  if (takeable && sc.may === true) {
    moveObject(s, card!.id, "battlefield", { controller: ctx.controller });
    log(s, `${me.name} puts ${defOf(s, card!).name} from ${them.name}'s library onto the battlefield under their control (${them.name} named ${name ?? "nothing"}).`);
  } else if (card) log(s, `The card ${me.name} found stays in ${them.name}'s library${takeable ? "" : `: ${them.name} named ${name ?? "nothing"}`}.`);
  sc.may = undefined;
  shuffleLibrary(s, them);
  log(s, `${them.name} shuffles their library.`);
}

/**
 * Garth One-Eye: "Choose a card name that hasn't been chosen from among [names]. Create a copy of the card with the chosen
 * name. You may cast the copy." The name is chosen as the ability resolves (rulings), one not chosen yet for this source
 * as this object (GameState.namesChosenFor, CR 400.7; it keeps them when another player gains control, rulings); with all
 * chosen it does nothing. The copy is made from the Oracle card outside the game (CR 707.13), owned by you (CR 112.2a),
 * and cast now or never, paying its costs (CR 707.12, rulings); a copy not cast ceases to exist (CR 704.5e). A copy of a
 * permanent spell becomes a token as it resolves (CR 707.10, 111.12), handled by the stack.
 */
export function runCopyNamedCardEffect(s: GameState, e: Extract<Effect, { type: "copyNamedCard" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const st = (sc.garth ??= {});
  const me = player(s, ctx.controller);
  if (st.copy !== undefined) {
    // Offered already: a copy not cast ceases to exist (CR 704.5e).
    if (st.copy && s.objects[st.copy]?.zone === "exile") removeCopy(s, st.copy);
    return;
  }
  const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
  const chosen = (s.namesChosenFor ??= {})[key] ?? [];
  if (st.pick === undefined) {
    const left = e.names.filter((n) => !chosen.includes(n));
    if (!left.length) {
      log(s, `Every name has been chosen for ${src}: it does nothing.`);
      st.copy = "";
      return;
    }
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "namedCopy", options: left, prompt: "choose a card name that hasn't been chosen: you create a copy of that card and may cast it, paying its costs" };
    return "paused";
  }
  s.namesChosenFor[key] = [...chosen, st.pick];
  const def = namedCardDef(s, st.pick);
  if (!def) {
    log(s, `${me.name} chooses ${st.pick} for ${src}, but that card isn't known.`);
    st.copy = "";
    return;
  }
  // Made outside the game (CR 707.13): exile stands in for that zone, as for the other copies of cards cast from nowhere.
  const copy = newObject(s, def, ctx.controller, "exile");
  copy.spellCopy = true;
  me.exile.push(copy.id);
  st.copy = copy.id;
  log(s, `${me.name} chooses ${st.pick} for ${src} and creates a copy of it.`);
  s.pending = { kind: "castFree", player: ctx.controller, objectId: copy.id, source: src, how: "paid" };
  return "paused";
}
