// Round 400's effects: "gains all activated abilities of ... until end of turn" (Effect gainActivatedOf): Quicksilver
// Elemental, Grell Philosopher and Havengul Lich. The abilities are carried in an `addAbility` text (grants.ts
// gainedAbilityText), so the layers give and take them like any other ability gained (CR 613.1f, 613.7).
import type { ActivatedAbility, Effect, ManaAbility } from "../abilities";
import { abilitiesOf, basicLandManaAbility, cardIdOf, defOf } from "../cards";
import { log, player } from "../game";
import { characteristics } from "../layers";
import { manaAbilitiesOn, manaLifeTax } from "../manaabilities";
import { compileCard, gainedAbilityText } from "../oracle";
import type { GameState } from "../types";
import { objects, runEffectInner, type ResolveCtx } from "./resolve";

/**
 * The activated abilities an object gains from this one: those working on the battlefield, not equip or loyalty abilities
 * (as "has all activated abilities of", cards.ts withBorrowed), without what marks them as this object's (borrowed, blue
 * mana), and not bound to this object's choices (cards.ts abilitiesOf `unbound`).
 */
const usable = (a: ActivatedAbility) => !a.zone && !a.equip && a.loyalty === undefined && !a.loyaltyX;
// Mairsil's once-each-turn key (round 401) is its own too: the gained ability isn't limited by it.
const plainActivated = ({ borrowed: _b, blueAsAny: _u, onceKey: _k, ...a }: ActivatedAbility): ActivatedAbility => a;
const plainMana = ({ blueAsAny: _u, onceKey: _k, ...a }: ManaAbility): ManaAbility => a;

/**
 * "`what` gains all activated abilities of `from` until end of turn." `from`'s activated abilities as this resolves (CR
 * 611.2c): those it has then from any source (CR 613.1f), its mana abilities among them (CR 605.1a, a land type's too, CR
 * 305.6), kept if it leaves or changes later (rulings: "you can activate the ability more than once, collecting abilities
 * from multiple creatures"). Each permanent of `what` there now gets them (CR 611.2c), "~" in them being that permanent
 * (rulings).
 */
export function runGainActivatedOfEffect(s: GameState, e: Extract<Effect, { type: "gainActivatedOf" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const lender = objects(s, e.from, ctx)[0];
  if (!lender || lender.zone !== "battlefield") {
    log(s, `${src}'s ability does nothing: there's no permanent to gain abilities from.`);
    return;
  }
  const name = characteristics(s, lender).name ?? defOf(s, lender).name;
  let activated = abilitiesOf(s, lender, true).activated.filter(usable).map(plainActivated);
  // Thran Portal's "Mana abilities of this land cost an additional 1 life" is about its own (rulings), not ones gained from it.
  const tax = manaLifeTax(s, lender);
  let mana = manaAbilitiesOn(s, lender).map((m) => plainMana(tax ? { ...m, lifeCost: (m.lifeCost ?? 0) - tax || undefined } : m));
  if (!activated.length && !mana.length) {
    log(s, `${name} has no activated abilities to gain.`);
    return;
  }
  // Grell Philosopher: "You may spend blue mana as though it were mana of any color to activate those abilities.": those only.
  if (e.blueAsAny) {
    activated = activated.map((a) => ({ ...a, blueAsAny: true as const }));
    mana = mana.map((m) => ({ ...m, blueAsAny: true as const }));
  }
  return runEffectInner(s, { type: "continuous", what: e.what, mods: [{ kind: "addAbility", text: gainedAbilityText(name, activated, mana) }], duration: "endOfTurn" }, ctx);
}

/**
 * Havengul Lich: "When you cast it this turn, ~ gains all activated abilities of that card until end of turn." A delayed
 * trigger (CR 603.7) on the target card, still that object in its graveyard (CR 400.7), being cast this turn by this
 * ability's controller (triggers.ts, GameState.nextCast `card`), as that card is put on the stack from there, whatever
 * permission it's cast with (CR 601.2a). Its abilities as it was in the graveyard (rulings): its printed ones there (CR
 * 113.6: effects giving a graveyard card abilities give ones that work there, which it couldn't use on the battlefield),
 * taken now. "~" is the Lich as the object it is now (PendingTrigger sourceZc, CR 400.7).
 */
export function runWhenCastGainsActivatedEffect(s: GameState, e: Extract<Effect, { type: "whenCastGainsActivated" }>, ctx: ResolveCtx, src: string): void {
  const card = objects(s, e.what, ctx)[0];
  const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (!card || card.zone !== "graveyard" || !me) return;
  const d = defOf(s, card);
  const c = compileCard(d);
  const activated = c.activated.filter(usable).map(plainActivated);
  // A basic land type's mana ability too (CR 305.6: Dryad Arbor's).
  const mana = [...d.subtypes.map(basicLandManaAbility).filter((x): x is ManaAbility => x !== null), ...c.mana].map(plainMana);
  const effects: Effect[] = activated.length || mana.length ? [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "addAbility", text: gainedAbilityText(d.name, activated, mana) }], duration: "endOfTurn" }] : [];
  (s.nextCast ??= []).push({
    controller: ctx.controller,
    filter: { kind: "card", types: [], notTypes: [], notColors: [], text: d.name },
    sourceId: me.id,
    sourceCardId: cardIdOf(me),
    sourceZc: ctx.sourceZc ?? me.zoneChanges ?? 0,
    card: { id: card.id, zc: card.zoneChanges ?? 0 },
    body: { targets: [], effects, text: `${src} gains all activated abilities of ${d.name} until end of turn.` },
    turn: s.turn,
  });
  log(s, `${src}: when ${player(s, ctx.controller).name} casts ${d.name} this turn, ${src} gains its activated abilities until end of turn.`);
}
