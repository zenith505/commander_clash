// Round 433's effects: Jace's Machinations' instant-speed loyalty abilities this turn, and The Creation of Avacyn's
// chapters II and III about the card its chapter I exiled face down.
import { characteristics } from "../layers";
import { defOf } from "../cards";
import { log, loseLife, moveObject, obj, player } from "../game";
import type { GameObject, GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { returnFromExile } from "./run-zones";

/**
 * Jace's Machinations: "Until end of turn, you may activate loyalty abilities of Jace planeswalkers you control on any
 * player's turn any time you could cast an instant.": the spell's controller, this turn, for each planeswalker of that
 * subtype they control as they activate (TurnLog loyaltyAtInstantSpeed, game.ts loyaltyAtInstantSpeed); still one loyalty
 * ability of each permanent each turn (CR 606.3, rulings).
 */
export function runLoyaltyAtInstantThisTurnEffect(s: GameState, ctx: ResolveCtx, subtype: string): void {
  ((s.turnLog ??= {}).loyaltyAtInstantSpeed ??= []).push({ player: ctx.controller, subtype });
  log(s, `Until end of turn, ${player(s, ctx.controller).name} may activate loyalty abilities of ${subtype} planeswalkers they control any time they could cast an instant.`);
}

/**
 * "The exiled card" of a Saga's chapters: the cards its chapter I exiled (CR 607.2a), linked to the Saga as this object
 * (the chapter's source as it triggered, CR 400.7), still in exile as the same objects.
 */
function linkedCards(s: GameState, ctx: ResolveCtx): GameObject[] {
  const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
  return (s.linkedExile?.[key] ?? []).map((l) => ({ o: s.objects[l.id], zc: l.zc })).filter((x): x is { o: GameObject; zc: number } => x.o?.zone === "exile" && (x.o.zoneChanges ?? 0) === x.zc).map((x) => x.o);
}

/** A card in exile as it is now: a face-down one has no characteristics (CR 406.3a). */
const isCreatureCard = (s: GameState, c: GameObject) => !c.hiddenExile && characteristics(s, c).types.includes("Creature");
const isPermanentCardNow = (s: GameState, c: GameObject) => !c.hiddenExile && characteristics(s, c).types.some((t) => ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"].includes(t));

/**
 * The Creation of Avacyn, chapter II: "Turn the exiled card face up. If it's a creature card, you lose life equal to its
 * mana value.": every card its chapter I exiled, turned face up for all to see (CR 406.3); if one of them is a creature
 * card, the chapter's controller loses life equal to the total mana value of all of them (rulings: two or more cards
 * exiled face down if chapter I resolved more than once).
 */
export function runLinkedFaceUpLoseLifeEffect(s: GameState, ctx: ResolveCtx, src: string): void {
  const cards = linkedCards(s, ctx);
  const turned = cards.filter((c) => c.hiddenExile);
  for (const c of turned) delete c.hiddenExile;
  if (turned.length) log(s, `${src} turns ${turned.map((c) => defOf(s, c).name).join(", ")} face up.`);
  if (!cards.some((c) => isCreatureCard(s, c))) return;
  const n = cards.reduce((t, c) => t + characteristics(s, c).manaValue, 0);
  if (n <= 0) return;
  log(s, `${player(s, ctx.controller).name} loses ${n} life (${src}).`);
  loseLife(s, ctx.controller, n);
}

/**
 * The Creation of Avacyn, chapter III: "You may put the exiled card onto the battlefield if it's a creature card. If you
 * don't put it onto the battlefield, put it into its owner's hand.": if one of the cards its chapter I exiled is a creature
 * card as it is now (a face-down one has no characteristics, CR 406.3a), the chapter's controller may put all the
 * permanent cards among them onto the battlefield under their control (CR 110.2a), or none (rulings); every card not put
 * onto the battlefield goes to its owner's hand, a face-down one still unseen by the others.
 */
export function runLinkedCreatureOrHandEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.avacyn) {
    const cards = linkedCards(s, ctx);
    if (!cards.length) return;
    const put = cards.some((c) => isCreatureCard(s, c)) ? cards.filter((c) => isPermanentCardNow(s, c)) : [];
    sc.avacyn = { cards: cards.map((c) => ({ id: c.id, zc: c.zoneChanges ?? 0 })), put: put.map((c) => c.id) };
  }
  const st = sc.avacyn;
  const still = () => st.cards.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === st.cards[i]!.zc);
  if (st.put.length && sc.may === undefined && !st.entered) {
    const names = st.put.map((id) => defOf(s, obj(s, id)).name).join(", ");
    s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `put ${names} onto the battlefield`, source: src, card: st.put[0], otherwise: "If you don't, it goes into its owner's hand." };
    return "paused";
  }
  if (st.put.length && sc.may && !st.entered) {
    const back = still().filter((c) => st.put.includes(c.id));
    const r = returnFromExile(s, back, () => ctx.controller, src);
    if (r === "paused") return "paused";
  }
  st.entered = true;
  sc.may = undefined;
  for (const c of still()) {
    if (c.hiddenExile) {
      log(s, `${src} puts a face-down card into ${player(s, c.owner).name}'s hand.`);
      log(s, `${src} puts ${defOf(s, c).name} into your hand.`, c.owner);
    } else log(s, `${src} puts ${defOf(s, c).name} into its owner's hand.`);
    moveObject(s, c.id, "hand");
  }
}
