// Round 376's effects: an opponent shuffling one of the cards a search exiled back into the library (Emergent Ultimatum),
// a draft of every exiled permanent card (Thieves' Auction) and every permanent shuffled away and replaced from the top of
// the library (Warp World).
import type { Effect } from "../abilities";
import { defOf, isPermanentCard, isType } from "../cards";
import { auraHostOptions, enterTogether, livingPlayers, log, moveObject, obj, player } from "../game";
import { shuffleLibrary } from "../rng";
import type { GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { runEffect } from "./resolve";
import { opponentPicks, toBottom } from "./run-library";
import { chooseAuraHosts } from "./run-zones";

/**
 * Emergent Ultimatum: "An opponent chooses one of those cards. Shuffle that card into your library." Of the cards this
 * resolution's search exiled that are still in exile (CR 400.7), an opponent you choose as it resolves picks one (CR
 * 608.2d); with only one there's nothing to choose, and that one is shuffled in (rulings). The others stay in exile, for
 * "You may cast the other cards" (castFromAmong fromExiledThisWay).
 */
export function runOpponentShufflesExiledInEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  if (sc.splitDone) return;
  const cards = [...new Set(r.exiledCards ?? [])].filter((id) => s.objects[id]?.zone === "exile");
  if (!cards.length) return;
  const me = player(s, ctx.controller);
  const got = opponentPicks(s, ctx, src, undefined, ctx.controller, cards, cards, 1, { zone: "libraryTop", shuffleIn: true }, { zone: "battlefield" }, `shuffled into ${me.name}'s library`, `may be cast by ${me.name} without paying their mana costs`);
  if (got === "paused") return "paused";
  sc.splitDone = true;
  const back = got.filter((id) => obj(s, id).zone === "exile");
  if (!back.length) return;
  const owner = player(s, obj(s, back[0]!).owner);
  moveObject(s, back[0]!, "library");
  shuffleLibrary(s, owner);
  log(s, `${defOf(s, obj(s, back[0]!)).name} is shuffled into ${owner.name}'s library (${src}).`);
}

const EXILE_NONTOKEN: Effect = { type: "exile", what: { ref: "each", filter: { kind: "object", types: [], notTypes: [], notColors: [], token: false, text: "all nontoken permanents" } } };

/** The players in turn order, starting with `first` (CR 101.4). */
const fromPlayer = (s: GameState, first: PlayerId): PlayerId[] => {
  const i = Math.max(0, s.turnOrder.indexOf(first));
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
};

/**
 * Thieves' Auction: every nontoken permanent is exiled at once; then, starting with you and in turn order (rulings),
 * each player chooses one of the cards exiled this way that's still in exile (CR 400.7) and puts it onto the battlefield
 * tapped under their control, one at a time, again and again until none is left that can be. Only a card that can be put
 * onto the battlefield can be chosen: a permanent card (an instant or sorcery card can't enter, CR 403.4), and an Aura
 * only while there's something it could enchant, chosen by its new controller and not targeted (CR 303.4f, rulings); one
 * with nothing stays exiled and can be chosen later, and stays exiled for good if nothing ever can be (rulings). A
 * commander exiled this way is still in exile until state-based actions are checked after the spell resolves (CR 903.9a),
 * so it can be chosen too. The triggers all wait until it has resolved (rulings, CR 603.3).
 */
export function runThievesAuctionEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  if (!sc.auction) {
    const before = (sc.auctionBefore ??= Object.fromEntries(Object.values(s.objects).filter((o) => o.zone === "exile").map((o) => [o.id, o.zoneChanges ?? 0])));
    if (runEffect(s, EXILE_NONTOKEN, ctx) === "paused") return "paused";
    const cards = s.players.flatMap((p) => p.exile).filter((id) => !obj(s, id).isToken && before[id] !== (obj(s, id).zoneChanges ?? 0));
    sc.auctionBefore = undefined;
    sc.auction = { cards: cards.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), at: 0, idle: 0 };
    if (!cards.length) return void log(s, `${src} exiles nothing.`);
  }
  const st = sc.auction;
  const order = fromPlayer(s, ctx.controller);
  const live = () => st.cards.filter((c) => s.objects[c.id]?.zone === "exile" && (obj(s, c.id).zoneChanges ?? 0) === c.zc).map((c) => c.id);
  const canPut = (id: ObjectId, pid: PlayerId) => {
    const d = defOf(s, obj(s, id));
    return isPermanentCard(d) && (!d.subtypes.includes("Aura") || auraHostOptions(s, obj(s, id), pid).length > 0);
  };
  if (st.asking) {
    st.asking = undefined;
    const pick = sc.found?.[0];
    sc.found = undefined;
    const pid = order[st.at % order.length]!;
    if (pick !== undefined && live().includes(pick) && canPut(pick, pid)) st.chosen = pick;
  }
  for (let guard = 0; guard < 10000; guard++) {
    const pid = order[st.at % order.length]!;
    if (st.chosen) {
      const o = obj(s, st.chosen);
      const hosts = chooseAuraHosts(s, [{ o, under: pid }], src);
      if (hosts === "paused") return "paused";
      const host = hosts.get(o.id);
      if (sc.auraHosts) delete sc.auraHosts[o.id];
      st.chosen = undefined;
      if (!defOf(s, o).subtypes.includes("Aura") || host) {
        log(s, `${player(s, pid).name} chooses ${defOf(s, o).name} and puts it onto the battlefield tapped (${src}).`);
        moveObject(s, o.id, "battlefield", { controller: pid, putBy: pid, tapped: true, ...host });
      }
      st.idle = 0;
      st.at++;
      continue;
    }
    const pool = live();
    if (!pool.length || st.idle >= order.length) break;
    const eligible = player(s, pid).lost ? [] : pool.filter((id) => canPut(id, pid));
    if (!eligible.length) {
      st.idle++;
      st.at++;
      continue;
    }
    if (eligible.length === 1) {
      st.chosen = eligible[0];
      continue;
    }
    st.asking = true;
    s.pending = { kind: "searchLibrary", player: pid, source: src, what: "one of the exiled cards", cards: eligible, min: 1, max: 1, exiled: true, dig: { looked: pool, to: "to put onto the battlefield tapped under your control", rest: "stay exiled, for the next player to choose from" } };
    return "paused";
  }
  const left = live();
  if (left.length) log(s, `${left.map((id) => defOf(s, obj(s, id)).name).join(", ")} ${left.length === 1 ? "stays" : "stay"} exiled: nothing could be done with ${left.length === 1 ? "it" : "them"} (${src}).`);
  sc.auction = undefined;
}

/**
 * Warp World (rulings): each player counts the permanents they own (tokens too; a phased-out permanent is treated as
 * though it doesn't exist, CR 702.26b) and shuffles them into their library at once; a token ceases to exist (CR 111.8,
 * 704.5d) and is never revealed, and a commander that goes to the command zone instead (CR 903.9b) still counts. Each
 * then reveals that many cards from the top. All the artifact, creature and land cards revealed enter at once, each
 * under its owner's control; then the enchantment cards, an Aura enchanting something already on the battlefield (not an
 * enchantment entering with it), the active player choosing what their Auras enchant first, then each other player in
 * turn order (CR 303.4f, 101.4); then the other revealed cards (instants, sorceries, planeswalkers, battles, Auras with
 * nothing to enchant) go on the bottom of their owners' libraries in any order they choose.
 */
export function runWarpWorldEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  if (!sc.warp) {
    const counts: Record<number, number> = {};
    const mine = s.battlefield.filter((id) => !player(s, obj(s, id).owner).lost);
    for (const id of mine) counts[obj(s, id).owner] = (counts[obj(s, id).owner] ?? 0) + 1;
    for (const id of mine) moveObject(s, id, "library");
    const revealed: Record<number, ObjectId[]> = {};
    for (const pid of livingPlayers(s)) {
      const p = player(s, pid);
      shuffleLibrary(s, p);
      // Tokens are ignored as cards are revealed (rulings); they cease to exist as state-based actions are next checked.
      revealed[pid] = p.library.filter((id) => !obj(s, id).isToken).slice(0, counts[pid] ?? 0);
      log(s, `${p.name} shuffles ${counts[pid] ?? 0} permanent${counts[pid] === 1 ? "" : "s"} into their library${revealed[pid]!.length ? ` and reveals ${revealed[pid]!.map((id) => defOf(s, obj(s, id)).name).join(", ")}` : ""} (${src}).`);
    }
    sc.warp = { revealed, stage: 1 };
  }
  const st = sc.warp;
  const apnap = fromPlayer(s, s.activePlayer).filter((pid) => !player(s, pid).lost);
  const stillThere = (pid: PlayerId) => (st.revealed[pid] ?? []).filter((id) => s.objects[id]?.zone === "library" && player(s, pid).library.includes(id));
  const putIn = (want: (id: ObjectId) => boolean): "paused" | void => {
    const cards = apnap.flatMap((pid) => stillThere(pid).filter(want).map((id) => ({ o: obj(s, id), under: pid })));
    const hosts = chooseAuraHosts(s, cards, src);
    if (hosts === "paused") return "paused";
    const going = cards.filter(({ o }) => !defOf(s, o).subtypes.includes("Aura") || hosts.has(o.id));
    for (const { o } of cards) if (sc.auraHosts) delete sc.auraHosts[o.id];
    enterTogether(s, () => {
      for (const { o, under } of going) moveObject(s, o.id, "battlefield", { controller: under, putBy: under, ...hosts.get(o.id) });
    });
    if (going.length) log(s, `${going.map(({ o }) => defOf(s, o).name).join(", ")} ${going.length === 1 ? "is" : "are"} put onto the battlefield (${src}).`);
  };
  if (st.stage === 1) {
    if (putIn((id) => ["Artifact", "Creature", "Land"].some((t) => isType(defOf(s, obj(s, id)), t))) === "paused") return "paused";
    st.stage = 2;
  }
  if (st.stage === 2) {
    if (putIn((id) => isType(defOf(s, obj(s, id)), "Enchantment")) === "paused") return "paused";
    st.stage = 3;
    st.bottomAt = 0;
  }
  for (; st.bottomAt! < apnap.length; st.bottomAt!++) {
    const pid = apnap[st.bottomAt!]!;
    const rest = stillThere(pid);
    if (toBottom(s, pid, rest, src, false) === "paused") return "paused";
    sc.arranged = undefined;
  }
  sc.warp = undefined;
}
