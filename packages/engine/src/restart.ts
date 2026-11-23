// Round 452: restarting the game (CR 727), Karn Liberated's "−14: Restart the game, leaving in exile all non-Aura
// permanent cards exiled with ~. Then put those cards onto the battlefield under your control."

import { defOf, isPermanentCard } from "./cards";
import { blankGame, enterTogether, log, moveObject, newObject, obj, openGame, player, seatPlayer, type PlayerSetup } from "./game";
import { invalidateCharacteristics } from "./layers";
import type { CardDef, Color, GameObject, GameState, Player, PlayerId } from "./types";

/** A card, not a token, a copy of a spell or card (CR 707.10, 707.12) or an emblem (CR 114.5): only cards begin a game. */
function isCard(o: GameObject): boolean {
  if (o.emblem || o.spellCopy) return false;
  // A merged permanent's own card or token (CR 730.2d); its other components are objects of their own.
  return !(o.merged ? o.merged.ownToken : o.isToken);
}

/** Whether `o` is its owner's commander (CR 903.3): a merged permanent's own card's status (CR 730.2d, 903.3c). */
const ownCommander = (o: GameObject): boolean => (o.merged ? o.merged.ownCommander : o.isCommander);

/**
 * The cards linked to `key` (GameState.linkedExile, CR 607.2a) that are still those objects in exile (CR 400.7) and are
 * non-Aura permanent cards there (CR 110.4b, 303), with the other cards of a merged permanent that left with them (CR
 * 730.3c). A token exiled this way has ceased to exist (CR 111.7, 704.5d).
 */
export function restartExempt(s: GameState, key: string | undefined): GameObject[] {
  const out: GameObject[] = [];
  const add = (id: string, zc: number) => {
    const o = s.objects[id];
    if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== zc || !isCard(o) || out.includes(o) || player(s, o.owner).lost) return;
    const d = defOf(s, o);
    if (!isPermanentCard(d) || d.subtypes.includes("Aura")) return;
    out.push(o);
  };
  for (const l of key ? (s.linkedExile?.[key] ?? []) : []) {
    add(l.id, l.zc);
    for (const m of s.objects[l.id]?.movedWith ?? []) add(m.id, m.zc);
  }
  return out;
}

/**
 * Restart the game (CR 727.1): it ends with no winner, loser or draw, and every player still in it begins a new one by the
 * procedure of rule 103, `controller` (who controlled the restarting ability) going first (727.1a). Every card each of
 * them owns is in it, wherever it is now, ownership unchanged (727.2): commanders in the command zone (903.6), the rest
 * shuffled as their library. Nothing else carries over (rulings): tokens, copies, emblems, counters, life totals (back to
 * the starting life total, 903.7), commander tax and commander damage, effects, the monarch, the initiative, day and night.
 * A player who has left the game isn't in the new one (rulings). The cards `exempt` names stay in exile (727.5), a
 * commander among them too, still that deck's commander (727.5a); the restarting effect puts them onto the battlefield
 * under `controller`'s control just before the first turn's untap step (727.4: GameState.restartEnters, finishRestart).
 * Players may take mulligans (rulings, CR 103.5). `s` is changed in place into the new game.
 */
export function restartGame(s: GameState, controller: PlayerId, exempt: GameObject[], source: string) {
  const fresh = blankGame(s.seed);
  // Randomness goes on from the same seeded generator; object ids go on counting, so none is used twice.
  fresh.rngState = s.rngState;
  fresh.nextId = s.nextId;
  fresh.cards = s.cards;
  fresh.log = s.log;
  fresh.turnOrder = s.turnOrder;
  if (s.seating) fresh.seating = s.seating;
  const kept = new Set(exempt.map((o) => o.id));
  const exemptCards: { owner: PlayerId; def: CardDef; commander: boolean; pregameColor?: Color }[] = [];
  for (const p of s.players) {
    if (p.lost) {
      // Not in the new game (rulings): their seat stays empty.
      const gone: Player = { ...p, library: [], hand: [], graveyard: [], exile: [], command: [], manaPool: { ...p.manaPool } };
      for (const k of Object.keys(gone.manaPool) as (keyof Player["manaPool"])[]) (gone.manaPool as Record<string, number>)[k] = 0;
      fresh.players.push(gone);
      continue;
    }
    const owned = Object.values(s.objects)
      .filter((o) => o.owner === p.id && isCard(o))
      .sort((a, b) => Number(a.id.replace(/\D/g, "")) - Number(b.id.replace(/\D/g, "")));
    const commanders = owned.filter((o) => ownCommander(o));
    const deck: CardDef[] = [];
    for (const o of owned) {
      const def = s.cards[o.cardId]!;
      if (kept.has(o.id)) exemptCards.push({ owner: p.id, def, commander: ownCommander(o), ...(o.pregameColor ? { pregameColor: o.pregameColor } : {}) });
      else if (!ownCommander(o)) deck.push(def);
    }
    const [first, second] = commanders;
    const setup: PlayerSetup = {
      name: p.name,
      commander: s.cards[first!.cardId]!,
      ...(first!.pregameColor ? { commanderColor: first!.pregameColor } : {}),
      ...(second ? { secondCommander: s.cards[second.cardId]!, ...(second.pregameColor ? { secondCommanderColor: second.pregameColor } : {}) } : {}),
      deck,
      isBot: p.isBot,
    };
    const np = seatPlayer(fresh, setup, p.id);
    // A commander exempted from the restart doesn't begin the new game in the command zone; it's still that deck's
    // commander (CR 727.5a): it waits in exile with the others.
    // (seatPlayer puts them into the command zone in the order given: the first commander, then the second.)
    const placed = np.command.filter((_, i) => kept.has(commanders[i]!.id));
    np.command = np.command.filter((id) => !placed.includes(id));
    for (const id of placed) {
      fresh.objects[id]!.zone = "exile";
      np.exile.push(id);
    }
  }
  const entering: { id: string; zc: number }[] = [];
  for (const p of fresh.players) for (const id of p.exile) entering.push({ id, zc: 0 });
  for (const c of exemptCards) {
    if (c.commander) continue;
    const o = newObject(fresh, c.def, c.owner, "exile");
    player(fresh, c.owner).exile.push(o.id);
    entering.push({ id: o.id, zc: 0 });
  }
  if (entering.length) fresh.restartEnters = { controller, cards: entering, source };
  for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k];
  Object.assign(s, fresh);
  invalidateCharacteristics(s);
  log(s, `${source}: the game restarts.${exempt.length ? ` ${exempt.map((o) => o.cardId && s.cards[o.cardId]?.name).join(", ")} stay${exempt.length === 1 ? "s" : ""} in exile.` : ""}`);
  openGame(s, controller, true);
}

/**
 * CR 727.4: the restarting effect finishes resolving just before the first turn's untap step, after the mulligans and the
 * opening hands' actions: the cards left in exile are put onto the battlefield under its controller's control, all at
 * once, no player having priority. What that triggers waits for the next time a player would receive priority (the first
 * upkeep, rulings). They've been under that player's control continuously since that player's first turn began (rulings),
 * so creatures among them can attack and use {T} abilities that turn (CR 302.6). An "as it enters" choice they ask
 * (GameState.entersChoices) is made before the first turn begins (game.ts runStateBasedActions).
 */
export function finishRestart(s: GameState): void {
  const r = s.restartEnters;
  if (!r || r.entered) return;
  r.entered = true;
  const cards = r.cards.map((c) => s.objects[c.id]).filter((o, i): o is GameObject => !!o && o.zone === "exile" && (o.zoneChanges ?? 0) === r.cards[i]!.zc);
  enterTogether(s, () => {
    for (const o of cards) {
      log(s, `${r.source} puts ${defOf(s, o).name} onto the battlefield under ${player(s, r.controller).name}'s control.`);
      moveObject(s, o.id, "battlefield", { controller: r.controller });
      const now = obj(s, o.id);
      if (now.zone === "battlefield") {
        now.controlledSinceTurn = 0;
        now.seenController = r.controller;
      }
    }
  });
  invalidateCharacteristics(s);
}
