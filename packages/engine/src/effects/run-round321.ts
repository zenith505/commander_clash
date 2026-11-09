// Round 321's effects.
import type { Effect } from "../abilities";
import { defOf, isPermanentCard, objIsType } from "../cards";
import { characteristics, controllerOf } from "../layers";
import { enterTogether, log, moveObject, obj, player } from "../game";
import { shuffleLibrary } from "../rng";
import type { GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { printedMatches } from "./targeting";

/**
 * Eivor, Wolf-Kissed: "you mill that many cards. You may put a Saga card and/or a land card from among them onto the
 * battlefield.": up to one card for each filter, from among the cards the mill just before milled, still those cards
 * (CR 400.7), found where they went if a replacement put them elsewhere (CR 701.17c). Picked one filter after the other,
 * so a card fitting both can be either one and any pair is possible; only permanent cards (CR 110.4b). They enter
 * together, under your control (CR 608.2f).
 */
export function runPutMilledPairEffect(s: GameState, e: Extract<Effect, { type: "putMilledPair" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const same = (m: { id: ObjectId; zc: number }) => (obj(s, m.id).zoneChanges ?? 0) === m.zc;
  const milled = () => [...(r.milled ?? []).filter((m) => same(m) && obj(s, m.id).zone === "graveyard"), ...(r.milledExiled ?? []).filter((m) => same(m) && obj(s, m.id).zone === "exile")].map((m) => m.id);
  const picked = (sc.milledPair ??= []);
  if (sc.found) {
    picked.push(sc.found.find((id) => milled().includes(id) && !picked.includes(id)) ?? null);
    sc.found = undefined;
  }
  while (picked.length < e.filters.length) {
    const filter = e.filters[picked.length]!;
    const cards = milled().filter((id) => !picked.includes(id) && printedMatches(filter, defOf(s, obj(s, id))) && isPermanentCard(defOf(s, obj(s, id))));
    if (!cards.length) {
      picked.push(null);
      continue;
    }
    const exiled = cards.some((id) => obj(s, id).zone === "exile");
    s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `${/^[aeiou]/i.test(filter.text) ? "an" : "a"} ${filter.text}`, cards, min: 0, max: 1, fromGraveyard: "battlefield", ...(exiled ? { exiled: true as const } : {}) };
    return "paused";
  }
  sc.milledPair = undefined;
  const ids = picked.filter((id): id is ObjectId => !!id && milled().includes(id));
  if (!ids.length) return;
  log(s, `${player(s, ctx.controller).name} puts ${ids.map((id) => defOf(s, obj(s, id)).name).join(" and ")} onto the battlefield.`);
  enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: ctx.controller })));
}

/** The prompt for Hand of Vecna's choice (bots pick the biggest creature, see bot.ts). */
export const HOST_OR_NAMED_PROMPT = "choose the creature that gets the bonus";

/**
 * Hand of Vecna: "equipped creature or a creature you control named Vecna gets +X/+X until end of turn": the creature
 * the source is attached to (whoever controls it) or a creature you control with that name (CR 201.2), one of them,
 * chosen as it resolves if there are several (rulings); it's "created" for the instructions after. None, nothing.
 */
export function runChooseHostOrNamedEffect(s: GameState, e: Extract<Effect, { type: "chooseHostOrNamed" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  if (!sc.impulseChoice) {
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const host = me?.zone === "battlefield" && me.attachedTo ? s.objects[me.attachedTo] : undefined;
    const ids = [...(host?.zone === "battlefield" && objIsType(s, host, "Creature") ? [host.id] : []), ...s.battlefield.map((id) => obj(s, id)).filter((o) => objIsType(s, o, "Creature") && controllerOf(s, o) === ctx.controller && characteristics(s, o).name === e.named && o.id !== host?.id).map((o) => o.id)];
    sc.impulseChoice = { ids };
    if (ids.length > 1) {
      s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "impulseChoice", options: ids, labels: ids.map((id) => characteristics(s, obj(s, id)).name), prompt: HOST_OR_NAMED_PROMPT };
      return "paused";
    }
  }
  const st = sc.impulseChoice;
  sc.impulseChoice = undefined;
  const id = st.pick ?? st.ids[0];
  r.created = id && s.objects[id]?.zone === "battlefield" ? [id] : [];
}

/**
 * Jace, Architect of Thought: "For each player, search that player's library for a nonland card and exile it, then that
 * player shuffles.": you search each library in turn order starting with yours (the order doesn't matter, rulings),
 * finding one card or none (CR 701.19b), each exiled face up as found (the rulings: none is cast before all are exiled),
 * then that library shuffled. The cards exiled are ResolvingInfo.searchedExiled.
 */
export function runSearchEachExileEffect(s: GameState, e: Extract<Effect, { type: "searchEachExile" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  if (!sc.searchEach) {
    sc.searchEach = apnapFrom(s, ctx.controller);
    r.searchedExiled = [];
  }
  const you = player(s, ctx.controller);
  while (sc.searchEach.length) {
    const pid = sc.searchEach[0]!;
    const p = player(s, pid);
    if (sc.found) {
      const id = sc.found.find((x) => p.library.includes(x));
      sc.found = undefined;
      sc.searchEach.shift();
      if (id) {
        moveObject(s, id, "exile");
        log(s, `${you.name} exiles ${defOf(s, obj(s, id)).name} from ${pid === you.id ? "their" : `${p.name}'s`} library.`);
        (r.searchedExiled ??= []).push({ id, zc: obj(s, id).zoneChanges ?? 0 });
      } else log(s, `${you.name} finds nothing in ${pid === you.id ? "their" : `${p.name}'s`} library.`);
      shuffleLibrary(s, p);
      continue;
    }
    if (p.lost) {
      sc.searchEach.shift();
      continue;
    }
    const cards = p.library.filter((id) => printedMatches(e.filter, defOf(s, obj(s, id))));
    // Nothing there to find: searched, nothing found (CR 701.19b).
    if (!cards.length) {
      sc.found = [];
      continue;
    }
    s.pending = { kind: "searchLibrary", player: you.id, source: src, what: `${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text} in ${pid === you.id ? "your" : `${p.name}'s`} library`, cards, min: 0, max: 1 };
    return "paused";
  }
  sc.searchEach = undefined;
}

/** Living players in turn order, starting with `pid`. */
function apnapFrom(s: GameState, pid: PlayerId): PlayerId[] {
  const i = s.turnOrder.indexOf(pid);
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)].filter((x) => !player(s, x).lost);
}
