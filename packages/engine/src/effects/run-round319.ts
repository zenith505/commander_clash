// Round 319's effects.
import type { Effect } from "../abilities";
import { defOf, isPermanentCard, objIsType } from "../cards";
import { defMv } from "../faces";
import { livingPlayers, log, moveObject, enterTogether, obj, player, syncControl, tapPermanent } from "../game";
import { controllerOf, characteristics, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId, PlayerId } from "../types";
import { type ResolveCtx, apnap, objects, players, runEffect } from "./resolve";
import { inCombat } from "./triggers";
import { chooseAnOpponent } from "./run-library";

/** Gollum's guess prompt starts with this (bots guess at random, see bot.ts). */
export const GUESS_PROMPT = "guess whether the top card of";

/**
 * Gollum, Scheming Guide: "An opponent guesses whether the top card of your library is the chosen kind. Reveal that card.
 * If they guessed right, remove ~ from combat. Otherwise, you draw a card and ~ can't be blocked this turn." The opponent
 * is one you choose as it resolves; the card is revealed whatever they guessed, and with an empty library no guess is
 * right (rulings).
 */
export function runGuessTopKindEffect(s: GameState, e: Extract<Effect, { type: "guessTopKind" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const p = player(s, ctx.controller);
  const kind = r.chosen?.landOrNonland ?? "land";
  const what = kind === "land" ? "a land card" : "a nonland card";
  if (sc.guessRight === undefined) {
    const opp: PlayerId | undefined | "paused" = chooseAnOpponent(s, ctx, src, "choose an opponent to guess");
    if (opp === "paused") return "paused";
    if (sc.either === undefined && opp !== undefined && !player(s, opp).lost) {
      s.pending = { kind: "chooseOption", player: opp, source: src, what: "either", options: ["0", "1"], labels: [`Guess it's ${what}`, `Guess it isn't ${what}`], prompt: `${GUESS_PROMPT} ${p.name}'s library is ${what} (${p.name} chose ${kind})` };
      return "paused";
    }
    const top = p.library[0] ? obj(s, p.library[0]) : undefined;
    const isKind = !!top && objIsType(s, top, "Land") === (kind === "land");
    // No opponent left to guess: nobody guessed right.
    sc.guessRight = !!top && sc.either !== undefined && (sc.either === 0) === isKind;
    sc.either = undefined;
    log(s, top ? `${p.name} reveals ${characteristics(s, top).name} from the top of their library: the guess was ${sc.guessRight ? "right" : "wrong"}.` : `${p.name}'s library is empty: the guess was wrong.`);
    sc.guessStep = 0;
  }
  const fx = sc.guessRight ? e.right : e.wrong;
  for (; sc.guessStep! < fx.length; sc.guessStep!++) if (runEffect(s, fx[sc.guessStep!]!, ctx) === "paused") return "paused";
}

/**
 * Vaevictis Asmadi, the Dire: "Those players sacrifice those permanents. Each player who sacrificed a permanent this way
 * reveals the top card of their library, then puts it onto the battlefield if it's a permanent card." Each target still
 * legal is sacrificed by whoever controls it now, all at once (CR 701.21a); one that wasn't (an illegal target) means no
 * reveal for its controller (rulings). Each player who sacrificed reveals their top card, and the permanent cards revealed
 * enter at the same time, each under its owner's control.
 */
export function runSacrificeTargetsRevealEffect(s: GameState, e: Extract<Effect, { type: "sacrificeTargetsReveal" }>, ctx: ResolveCtx): void {
  const sacrificed = new Set<PlayerId>();
  for (const o of objects(s, e.what, ctx)) {
    if (o.zone !== "battlefield") continue;
    const by = controllerOf(s, o);
    log(s, `${player(s, by).name} sacrifices ${characteristics(s, o).name}.`);
    moveObject(s, o.id, "graveyard", { sacrificed: true });
    if (s.objects[o.id]?.zone !== "battlefield") sacrificed.add(by);
  }
  invalidateCharacteristics(s);
  const put: ObjectId[] = [];
  for (const pid of apnap(s, [...sacrificed])) {
    const p = player(s, pid);
    const id = p.library[0];
    if (!id) continue;
    const c = obj(s, id);
    const permanent = isPermanentCard(defOf(s, c));
    log(s, `${p.name} reveals ${defOf(s, c).name}${permanent ? " and puts it onto the battlefield" : ""}.`);
    if (permanent) put.push(id);
  }
  if (put.length) enterTogether(s, () => put.forEach((id) => moveObject(s, id, "battlefield")));
}

/**
 * Midnight Crusader Shuttle: "If you gain control of a creature this way, tap it, and it's attacking that player." Only a
 * creature you control now (the control effect applied); it's tapped, then attacking that player if it's still a combat
 * this turn and they're still in the game. It wasn't declared as an attacker, so "whenever ~ attacks" doesn't trigger and
 * nothing it would cost to attack is paid (rulings, CR 506.3, 508.4).
 */
export function runAttackingNowEffect(s: GameState, e: Extract<Effect, { type: "attackingNow" }>, ctx: ResolveCtx): void {
  const whom = players(s, e.whom, ctx)[0];
  // The control change is seen first (it would take the creature out of combat afterwards, CR 506.4).
  syncControl(s);
  for (const o of objects(s, e.what, ctx)) {
    if (o.zone !== "battlefield" || controllerOf(s, o) !== ctx.controller) continue;
    if (!o.tapped) tapPermanent(s, o, undefined, ctx.controller);
    if (whom === undefined || whom === ctx.controller || !inCombat(s) || !livingPlayers(s).includes(whom)) continue;
    o.attacking = whom;
    o.attackingPermanent = undefined;
    log(s, `${characteristics(s, o).name} is tapped and attacking ${player(s, whom).name}.`);
  }
  invalidateCharacteristics(s);
}

/**
 * Danse Macabre: "Return a creature card put into a graveyard this way to the battlefield under your control" / "up to two
 * creature cards ...": you choose among the creature cards this resolution's sacrifice put into graveyards and that are
 * still there (one a replacement put elsewhere isn't, CR 400.7); a sacrificed commander is still in the graveyard until
 * the spell has resolved, so it can be chosen (rulings, CR 903.9a). They enter together under your control.
 */
export function runReturnSacrificedCardsEffect(s: GameState, e: Extract<Effect, { type: "returnSacrificedCards" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const cards = () => [...new Set((r.sacrificedThisWay ?? []).flatMap((l) => (l.id ? [l.id] : [])))].filter((id) => s.objects[id]?.zone === "graveyard" && defOf(s, obj(s, id)).types.includes("Creature"));
  if (!sc.found) {
    const options = cards();
    if (!options.length) return;
    s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: e.n === 1 ? "a creature card put into a graveyard this way" : `up to ${e.n} creature cards put into graveyards this way`, cards: options, min: e.upTo ? 0 : 1, max: Math.min(e.n, options.length), fromGraveyard: "battlefield", anyGraveyard: true };
    return "paused";
  }
  const found = sc.found.filter((id) => cards().includes(id));
  sc.found = undefined;
  for (const id of found) log(s, `${player(s, ctx.controller).name} returns ${defOf(s, obj(s, id)).name} to the battlefield under their control.`);
  enterTogether(s, () => found.forEach((id) => moveObject(s, id, "battlefield", { controller: ctx.controller })));
}

/** Eumidian Wastewaker's prompt (bots, see bot.ts). */
export const DISCARD_OR_SACRIFICE = "discard a card or sacrifice a permanent";

/**
 * Eumidian Wastewaker: "you and defending player each discard a card or sacrifice a permanent. You draw a card for each
 * land card put into a graveyard this way." You choose and do it first, then defending player (rulings); a player with no
 * card in hand must sacrifice, one with no permanent must discard, one with neither does nothing. The land cards counted are
 * those it put into graveyards, not a land token (rulings).
 */
export function runDiscardOrSacrificeEffect(s: GameState, e: Extract<Effect, { type: "discardOrSacrifice" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const yards = () => livingPlayers(s).flatMap((pid) => player(s, pid).graveyard);
  const st = (sc.discardOrSac ??= { queue: e.players.flatMap((w) => players(s, w, ctx)).filter((pid, i, all) => all.indexOf(pid) === i), keep: [...Object.keys(sc), "discardOrSac"], before: yards() });
  while (st.queue.length) {
    const pid = st.queue[0]!;
    const p = player(s, pid);
    if (st.pick === undefined) {
      const canDiscard = p.hand.length > 0;
      const canSacrifice = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid);
      if (p.lost || (!canDiscard && !canSacrifice)) {
        st.queue.shift();
        continue;
      }
      if (canDiscard && canSacrifice) {
        if (sc.either === undefined) {
          s.pending = { kind: "chooseOption", player: pid, source: src, what: "either", options: ["0", "1"], labels: ["Discard a card", "Sacrifice a permanent"], prompt: DISCARD_OR_SACRIFICE };
          return "paused";
        }
        st.pick = sc.either;
        sc.either = undefined;
      } else st.pick = canDiscard ? 0 : 1;
    }
    const sub: ResolveCtx = { ...ctx, eachOne: pid };
    const fx: Effect = st.pick === 0 ? { type: "discard", who: { ref: "eachOne" }, n: 1 } : { type: "pick", who: { ref: "eachOne" }, filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "permanent" }, n: 1, action: "sacrifice" };
    if (runEffect(s, fx, sub) === "paused") return "paused";
    for (const k of Object.keys(sc) as (keyof typeof sc)[]) if (!st.keep.includes(k)) delete sc[k];
    st.pick = undefined;
    st.queue.shift();
  }
  const lands = yards().filter((id) => !st.before.includes(id) && !obj(s, id).isToken && defOf(s, obj(s, id)).types.includes("Land")).length;
  sc.discardOrSac = undefined;
  if (e.drawPerLand && lands) runEffect(s, { type: "draw", who: { ref: "you" }, n: lands }, ctx);
}

/**
 * Soulfire Eruption: "For each of them, exile the top card of your library, then ~ deals damage equal to that card's mana
 * value to that permanent or player. You may play the exiled cards until the end of your next turn." The targets still
 * legal are done one at a time: first the active player and the permanents they control, then the next player's in turn
 * order, and so on (APNAP), you choosing the order within each group (rulings). With an empty library no card is exiled
 * and no damage dealt. The exiled cards are played with their usual timing (rulings).
 */
export function runExileTopDamageEachEffect(s: GameState, e: Extract<Effect, { type: "exileTopDamageEach" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const p = player(s, ctx.controller);
  const done = (sc.eachTargetDone ??= []);
  const all = Array.from({ length: e.to.n ?? 1 }, (_, k) => e.to.index + k).filter((i) => ctx.legal[i] && ctx.targets[i] && ctx.targets[i]!.kind !== "none");
  const groupOf = (i: number): PlayerId | undefined => {
    const t = ctx.targets[i]!;
    if (t.kind === "player") return t.id as PlayerId;
    const o = t.kind === "object" ? s.objects[t.id] : undefined;
    return o?.zone === "battlefield" ? controllerOf(s, o) : undefined;
  };
  const deal = (): "paused" | void => {
    const d = sc.soulDamage;
    if (!d) return;
    if (d.n > 0 && runEffect(s, { type: "damage", amount: d.n, to: { ref: "anyTarget", index: d.index } }, ctx) === "paused") return "paused";
    sc.soulDamage = undefined;
  };
  if (deal() === "paused") return "paused";
  for (;;) {
    const left = all.filter((i) => !done.includes(i) && groupOf(i) !== undefined);
    if (!left.length) break;
    const g = apnap(s, [...new Set(left.map((i) => groupOf(i)!))])[0]!;
    const group = left.filter((i) => groupOf(i) === g);
    let next: number;
    if (group.length === 1) next = group[0]!;
    else if (sc.nextTarget !== undefined && group.includes(sc.nextTarget)) next = sc.nextTarget;
    else {
      const label = (i: number) => {
        const t = ctx.targets[i]!;
        return t.kind === "player" ? player(s, t.id as PlayerId).name : t.kind === "object" ? characteristics(s, obj(s, t.id)).name : "";
      };
      s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "nextTarget", options: group.map(String), labels: group.map(label), prompt: `choose which of ${player(s, g).name}'s group of targets is next (the top card of your library is exiled for it, then it's dealt damage equal to that card's mana value)` };
      return "paused";
    }
    sc.nextTarget = undefined;
    done.push(next);
    const top = p.library[0];
    let n = 0;
    if (top) {
      moveObject(s, top, "exile");
      const c = obj(s, top);
      n = defMv(defOf(s, c));
      log(s, `${p.name} exiles ${defOf(s, c).name} (mana value ${n}) from the top of their library.`);
      if (c.zone === "exile") c.mayPlay = { player: p.id, zc: c.zoneChanges ?? 0, until: "nextTurn", turn: s.turn };
    }
    sc.soulDamage = { index: next, n };
    if (deal() === "paused") return "paused";
  }
  sc.eachTargetDone = undefined;
}
