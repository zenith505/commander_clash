// Round 392's effects: a land played or a spell cast from the top of your library as a trigger resolves, or that card put
// into your hand (Ziatora's Envoy).
import type { Effect } from "../abilities";
import { defOf, isType, objIsType, power } from "../cards";
import { dealDamageBatch, objectSource, type DamageEvent } from "../damage";
import { asFace, landFaces } from "../faces";
import { canPlayLandNow, freeCastable, landUntappedOffer, log, moveObject, obj, playLandByEffect, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { amountNow, objects, players } from "./resolve";
import { fireEvent } from "./triggers";

/**
 * Ziatora's Envoy: "look at the top card of your library. You may play a land from the top of your library or cast a spell
 * with mana value less than or equal to the damage dealt from the top of your library without paying its mana cost. If you
 * don't, put that card into your hand." The card is looked at, not revealed (CR 401.3). A land is played only on your turn
 * with a land play left, as your land play for the turn (CR 305.2, 305.3, 305.9), a modal double-faced card as its land face
 * (CR 712.12); its "enters tapped unless" choice is made as it enters (CR 614.12). A spell is cast as this resolves, its
 * timing ignored (CR 608.2g), with mana value (the face or half cast, X 0, CR 202.3, 107.3) at most the damage dealt
 * (`mvMax`, the trigger's amount). With neither done, the card goes into your hand ("If you don't" asks whether a land was
 * played or a spell cast, rulings). Asked in that order: play the land, else cast the spell, else the hand.
 */
export function runPlayTopOrHandEffect(s: GameState, e: Extract<Effect, { type: "playTopOrHand" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const p = player(s, ctx.controller);
  const sc = (s.resolving!.scratch ??= {});
  const st = sc.topPlay;
  const toHand = (id: string) => {
    sc.topPlay = undefined;
    if (s.objects[id]?.zone !== "library") return;
    moveObject(s, id, "hand");
    log(s, `${p.name} puts the card they looked at into their hand.`);
    log(s, `You put ${defOf(s, obj(s, id)).name} into your hand.`, p.id);
  };
  // Then the spell: cast free with its mana value at most the damage dealt, or (not cast, still on top) into the hand.
  const askCast = (id: string): "paused" | void => {
    const max = Math.max(0, amountNow(s, e.mvMax, ctx));
    sc.topPlay = { id, asked: "cast" };
    s.pending = { kind: "castFree", player: p.id, objectId: id, source: src, how: "orHand", mv: { max } };
    if (freeCastable(s, p.id, id)) return "paused";
    s.pending = null;
    return toHand(id);
  };
  if (!st) {
    const id = p.library[0];
    if (!id) return;
    const o = obj(s, id);
    const d = defOf(s, o);
    log(s, `${p.name} looks at the top card of their library.`);
    log(s, `You look at ${d.name}.`, p.id);
    // A land card, or a modal double-faced card played as its land face.
    const face = isType(d, "Land") ? undefined : landFaces(s, o)[0];
    const playable = isType(d, "Land") || face !== undefined ? asFace(s, o, face, () => canPlayLandNow(s, p.id, id)) : false;
    if (playable) {
      sc.topPlay = { id, asked: "land", ...(face !== undefined ? { face } : {}) };
      delete sc.may;
      const name = asFace(s, o, face, () => defOf(s, o).name);
      s.pending = { kind: "chooseMay", player: p.id, prompt: `play ${name} from the top of your library`, otherwise: isType(d, "Land") ? "If you don't, it goes into your hand." : "If you don't, you may cast it, or it goes into your hand.", source: src, card: id };
      return "paused";
    }
    return askCast(id);
  }
  const o = s.objects[st.id];
  // Gone from the top since (cast, or moved by something else): nothing more to do.
  if (!o || o.zone !== "library") {
    sc.topPlay = undefined;
    return;
  }
  if (st.asked === "land") {
    const yes = !!sc.may;
    delete sc.may;
    if (!yes) return askCast(st.id);
    // A land with "enters tapped unless you pay 2 life" and the like: chosen as it enters (CR 614.12).
    const offer = asFace(s, o, st.face, () => landUntappedOffer(s, p.id, st.id));
    if (offer) {
      sc.topPlay = { ...st, asked: "untapped" };
      s.pending = { kind: "chooseMay", player: p.id, prompt: offer, source: src, card: st.id };
      return "paused";
    }
    return playTop(s, p.id, st.id, st.face, false, () => (sc.topPlay = undefined));
  }
  if (st.asked === "untapped") {
    const yes = !!sc.may;
    delete sc.may;
    return playTop(s, p.id, st.id, st.face, yes, () => (sc.topPlay = undefined));
  }
  // Asked to cast it: not cast, so it goes into the hand.
  return toHand(st.id);
}

/** Plays the land on top of `pid`'s library (as `face`), if it still can be (CR 305.2). */
function playTop(s: GameState, pid: number, id: string, face: number | undefined, untapped: boolean, done: () => void): void {
  done();
  const o = obj(s, id);
  if (!asFace(s, o, face, () => canPlayLandNow(s, pid, id))) return;
  playLandByEffect(s, pid, id, untapped, face);
}

/**
 * Lukka, Coppercoat Outcast's −7: "Each creature you control deals damage equal to its power to each opponent.": each
 * creature you control as it resolves deals damage equal to its power then to each opponent, all of it at once, noncombat
 * damage from each creature itself, so its deathtouch, lifelink, infect and wither apply (CR 120.3, 702.15b). A creature
 * with 0 or less power deals none (CR 120.8).
 */
export function runPowerToPlayersEffect(s: GameState, e: Extract<Effect, { type: "powerToPlayers" }>, ctx: ResolveCtx, src: string): void {
  const as = objects(s, e.a, ctx).filter((o) => objIsType(s, o, "Creature"));
  const to = players(s, e.to, ctx);
  const events: DamageEvent[] = as.flatMap((o) => {
    const n = power(s, o);
    const from = objectSource(s, o);
    return n > 0 ? to.map((pid): DamageEvent => ({ src: from, to: { player: pid }, n })) : [];
  });
  if (!events.length) {
    log(s, `${src}: no damage is dealt.`);
    return;
  }
  const by = new Map<string, number>();
  for (const d of dealDamageBatch(s, events)) if (d.dealt && d.src.id) by.set(d.src.id, (by.get(d.src.id) ?? 0) + d.dealt);
  for (const [id, amount] of by) fireEvent(s, { type: "dealtDamage", id, amount, combat: false });
}
