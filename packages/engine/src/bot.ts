import { allEffects, refCovers, type AbilityBody, type ActivatedAbility, type AdditionalCost, type ChosenTarget, type AltCostKind, type CastFromGraveyardKind, type ChoiceKind, type CompiledCard, type CounterKind, type PickAction, type Effect, type SpellCondition, type ObjRef, type TargetChoice, type TargetSpec, type UnlessPays } from "./abilities";
import { autoCrew, planActivate, planCast, planMana, planForetell, planPlot, planSuspend, planTurnFaceUp } from "./autopay";
import { abilitiesOf, basePower, baseToughness, defOf, isType, objHasKeyword, objIsType, power, toughness } from "./cards";
import { manaAbilitiesOn, manaActionAbility } from "./manaabilities";
import { bindChosen, changeTargetOptions, harmfulCounter, triggerBody, choiceOptions, unlessCost, damageTo, doesNothingNow, estimate, harmfulTargets, legalModes, legalTargets, lethalDamage, offerMany, modsAreHarmful, objectMatches, printedMatches, sameTarget, sourceQuality, COLOR_NAMES, ENTERS_COUNTER } from "./effects";
import { withModes, manySlot, gateTargets, hasGatedTargets, castConditionMet, type CastHow } from "./modes";
import {
  abilityProblem,
  faceUpWays,
  assistedRemaining,
  returnCandidates,
  attackProblem,
  attackTax,
  attackTaxPer,
  blockProblem,
  cantBlockNow,
  provokerOf,
  tapCostCandidates,
  maxBlocks,
  blockersNeeded,
  canEnterUntapped,
  entersRulesOf,
  conditionHolds,
  isSummoningSick,
  canActAtSorcerySpeed,
  legalActions,
  obj,
  opponents,
  canGainLife,
  player,
  potentialAttackers,
  foretoldCast,
  combatDamageOf,
  spellCost,
  graveyardWay,
  graveyardWays,
  altCost,
  delveRoom,
  spellTargets,
  availableMana,
  exilePlayable,
  topPlayable,
  castDef,
  casualtyCandidates,
  bargainCandidates,
  autoEvidence,
  evidenceProblem,
  altCostsFor,
  castExtraCosts,
  costsHaveX,
  bothModes,
  teamworkCandidates,
  teamworkPower,
  conspireCandidates,
} from "./game";
import { manaValue, parseManaCost, xCount } from "./mana";
import { characteristics, controllerOf } from "./layers";
import { castingBody, compileCard } from "./oracle";
import type { Action, CardDef, Chosen, Color, CostChoices, GameObject, GameState, ObjectId, PendingDecision, PlayerId, StackItem } from "./types";
import { evalAmount } from "./amounts";
import { CHOSEN_PROTECTION } from "./keywords";

/**
 * A simple heuristic opponent. Returns the sequence of actions it wants to take next
 * (usually one, or several mana taps followed by a cast).
 */
export function botActions(s: GameState, pid: PlayerId): Action[] {
  const pend = s.pending;
  if (pend?.player === pid) {
    if (pend.kind === "declareAttackers") return chooseAttacks(s, pid);
    if (pend.kind === "declareBlockers") return [chooseBlocks(s, pid)];
    if (pend.kind === "chooseModes") {
      const t = s.triggerQueue[0]!;
      const body = triggerBody(s, t);
      return [{ type: "chooseModes", player: pid, modes: chooseModes(s, pid, body, true, t.sourceId)!.modes }];
    }
    if (pend.kind === "chooseTargets") {
      const t = s.triggerQueue[0]!;
      const body = withModes(triggerBody(s, t), t.modes);
      return [{ type: "chooseTargets", player: pid, targets: chooseTargets(s, pid, body, true, t.sourceId)! }];
    }
    if (pend.kind === "copyTargets") {
      // New targets for a spell copy: the best ones for us, or keep the old ones (CR 707.10c).
      const sc = s.resolving?.scratch?.copies;
      const orig = sc ? (s.stack.find((x) => x.id === sc.of) ?? s.castItems?.[sc.of]) : undefined;
      const best = orig?.body ? chooseTargets(s, pid, orig.body, false) : null;
      return [{ type: "copyTargets", player: pid, ...(best ? { targets: best } : {}) }];
    }
    if (pend.kind === "changeTarget") return [{ type: "changeTarget", player: pid, target: newTargetFor(s, pid, pend) }];
    if (pend.kind === "castFree") {
      const plan = castPlan(s, pid, pend.objectId, true);
      return plan ?? [{ type: "chooseMay", player: pid, yes: false }];
    }
    if (pend.kind === "dredge") {
      const pick = chooseDredge(s, pid, pend.options);
      return [{ type: "dredge", player: pid, ...(pick ? { objectId: pick } : {}) }];
    }
    // "You may collect evidence N": yes, with cards we don't need in the graveyard.
    if (pend.kind === "collectEvidence") return [{ type: "collectEvidence", player: pid, ids: spareEvidence(s, pid, pend.n, pend.not) ?? [] }];
    if (pend.kind === "chooseMay" && pend.pay && pend.keep) {
      // Echo and cumulative upkeep: keep it while the price stays reasonable (CR 702.30a, 702.24a).
      const { mana, life = 0, energy = 0 } = pend.pay;
      const taps = mana ? planMana(s, pid, parseManaCost(mana)) : [];
      const ok = !!taps && (!mana || manaValue(parseManaCost(mana)) <= Math.max(4, lands(s, pid) - 2)) && player(s, pid).life > life + 5 && (player(s, pid).energy ?? 0) >= energy;
      return ok ? [...taps!, { type: "chooseMay", player: pid, yes: true }] : [{ type: "chooseMay", player: pid, yes: false }];
    }
    if (pend.kind === "chooseMay" && pend.pay) {
      // "You may pay {1}. If you do, ...": worth it when the rest is, and it leaves us some life.
      const { mana, life = 0 } = pend.pay;
      const taps = mana ? planMana(s, pid, parseManaCost(mana)) : [];
      const ok = !!taps && player(s, pid).life > life + 5 && wantsMay(s, pid);
      return ok ? [...taps!, { type: "chooseMay", player: pid, yes: true }] : [{ type: "chooseMay", player: pid, yes: false }];
    }
    // Clash (CR 701.30a): keep a card we'd like to draw on top, put the rest on the bottom.
    if (pend.kind === "chooseMay" && pend.clash) return [{ type: "chooseMay", player: pid, yes: !wantOnTop(s, pid, pend.card!) }];
    // "Each player may discard their hand and draw five cards": when that's more cards than we'd throw away.
    if (pend.kind === "chooseMay" && pend.wheel !== undefined) return [{ type: "chooseMay", player: pid, yes: player(s, pid).hand.length < pend.wheel }];
    if (pend.kind === "chooseMay") return [{ type: "chooseMay", player: pid, yes: pend.card ? millExplored(s, pid, pend.card) : wantsMay(s, pid) }];
    if (pend.kind === "payUnless" && pend.discard) return [{ type: "payUnless", player: pid, pay: player(s, pid).hand.length >= pend.discard }];
    if (pend.kind === "payUnless") {
      // Pay for ward whenever we can: the spell or ability was worth casting.
      const taps = planMana(s, pid, parseManaCost(pend.cost));
      return taps ? [...taps, { type: "payUnless", player: pid, pay: true }] : [{ type: "payUnless", player: pid, pay: false }];
    }
    if (pend.kind === "discard") return [{ type: "discard", player: pid, objectIds: chooseDiscards(s, pid, pend.count, undefined, pend.filter) }];
    // Brainstorm: back go the cards we'd most readily discard, the better of them on top.
    if (pend.kind === "handToTop") return [{ type: "handToTop", player: pid, objectIds: chooseDiscards(s, pid, pend.count).reverse() }];
    // Free from the hand: the most expensive card is the best deal.
    // From an opponent's revealed hand: take their most expensive card.
    if (pend.kind === "searchLibrary" && pend.hand !== undefined) return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => mv(s, b) - mv(s, a)).slice(0, pend.max) }];
    if (pend.kind === "searchLibrary" && pend.fromHand) return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => mv(s, b) - mv(s, a)).slice(0, pend.max) }];
    // Hideaway: the most expensive card, to play for free later.
    if (pend.kind === "searchLibrary" && pend.dig && /hideaway/.test(pend.dig.to)) return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => mv(s, b) - mv(s, a)).slice(0, 1) }];
    if (pend.kind === "searchLibrary" && pend.dig && /face down/.test(pend.dig.to)) return [{ type: "searchLibrary", player: pid, found: chooseManifest(s, pid, pend.cards, pend.max) }];
    if (pend.kind === "searchLibrary") return [{ type: "searchLibrary", player: pid, found: chooseSearch(s, pid, pend.cards, pend.max) }];
    // Soulbond: always pair, with the best creature (the bonus lands on both).
    if (pend.kind === "pickPermanents" && pend.action === "pair") return [{ type: "pickPermanents", player: pid, ids: choosePicks(s, pid, pend.options, 1, "populate") }];
    // Banding (CR 702.22c): the bot doesn't band; a block on one would block them all.
    if (pend.kind === "pickPermanents" && pend.action === "ringBearer") return [{ type: "pickPermanents", player: pid, ids: [chooseRingBearer(s, pid, pend.options)] }];
    if (pend.kind === "pickPermanents" && pend.action === "band") return [{ type: "pickPermanents", player: pid, ids: [] }];
    // Exert (CR 701.43d): for its "when you do" bonus, while there's life to spare for it not untapping.
    if (pend.kind === "pickPermanents" && pend.action === "exert") return [{ type: "pickPermanents", player: pid, ids: chooseExert(s, pid, pend.options) }];
    // "You may choose not to untap ~": keep it tapped while one of its "for as long as ~ remains tapped" effects lasts.
    if (pend.kind === "pickPermanents" && pend.action === "keepTapped") return [{ type: "pickPermanents", player: pid, ids: pend.options.filter((id) => s.effects.some((e) => e.whileTapped?.id === id)) }];
    if (pend.kind === "pickPermanents" && pend.action === "enlist") return [{ type: "pickPermanents", player: pid, ids: chooseEnlist(s, pid, pend.options) }];
    if (pend.kind === "pickPermanents" && pend.action === "unblocked") return [{ type: "pickPermanents", player: pid, ids: chooseUnblocked(s, pid, pend.options) }];
    // Amplify: reveal everything that counts, for the most counters (CR 702.38a).
    if (pend.kind === "pickPermanents" && pend.action === "reveal") return [{ type: "pickPermanents", player: pid, ids: pend.options }];
    // Champion: exile our least useful one (it comes back when the champion leaves), unless the champion is gone already.
    if (pend.kind === "pickPermanents" && pend.action === "champion") {
      const r = s.resolving?.item;
      const me = r?.sourceId ? s.objects[r.sourceId] : undefined;
      const here = !!me && me.zone === "battlefield" && (me.zoneChanges ?? 0) === r?.sourceZc;
      return [{ type: "pickPermanents", player: pid, ids: here ? choosePicks(s, pid, pend.options, 1, "sacrifice") : [] }];
    }
    // Cipher: encode it on the creature most likely to deal combat damage to a player.
    if (pend.kind === "pickPermanents" && pend.action === "encode") return [{ type: "pickPermanents", player: pid, ids: chooseEncode(s, pend.options) }];
    if (pend.kind === "pickPermanents" && pend.min !== undefined) return [{ type: "pickPermanents", player: pid, ids: chooseOptionalSacrifices(s, pid, pend) }];
    if (pend.kind === "pickPermanents") return [{ type: "pickPermanents", player: pid, ids: choosePicks(s, pid, pend.options, pend.count, pend.action, pend.counter) }];
    if (pend.kind === "chooseOption" && (pend.what === "riot" || pend.what === "unleash")) {
      // Riot: haste when it can still attack this turn, the counter otherwise. Unleash: the counter, unless we need blockers.
      const haste = pend.what === "riot" && s.activePlayer === pid && s.step === "main1";
      const counter = pend.what === "riot" ? !haste : player(s, pid).life > 12;
      return [{ type: "chooseOption", player: pid, choice: counter ? ENTERS_COUNTER : pend.options[1]! }];
    }
    // Tribute (CR 702.104a): ask the opponent with the most life, who can best afford to let its ability happen.
    if (pend.kind === "chooseOption" && pend.what === "tribute") {
      const best = [...pend.options].sort((a, b) => player(s, Number(b)).life - player(s, Number(a)).life)[0]!;
      return [{ type: "chooseOption", player: pid, choice: best }];
    }
    if (pend.kind === "chooseOption" && pend.what === "tributePay") return [{ type: "chooseOption", player: pid, choice: payTribute(s, pend.objectId!) ? "pay" : "no" }];
    if (pend.kind === "chooseOption" && pend.what === "copy") {
      // Clone the best permanent, but not a legendary one we already control (the legend rule, CR 704.5j).
      const ids = pend.options.filter((x) => x !== "none" && s.objects[x]);
      const ok = ids.filter((x) => !(characteristics(s, obj(s, x)).supertypes.includes("Legendary") && controllerOf(s, obj(s, x)) === pid));
      const best = ok.sort((a, b) => worth(s, pid, obj(s, b)) + mv(s, b) - worth(s, pid, obj(s, a)) - mv(s, a))[0];
      return [{ type: "chooseOption", player: pid, choice: best ?? "none" }];
    }
    // Assist (CR 702.132a): everyone else is an opponent, so we don't help pay for their spells.
    if (pend.kind === "assist") return [{ type: "assist", player: pid, n: 0 }];
    if (pend.kind === "assistCast") {
      const rest = assistedRemaining(s);
      const taps = rest && planMana(s, pid, rest.cost, rest.extra);
      return taps ? [...taps, { type: "finishAssistedCast", player: pid }] : [{ type: "finishAssistedCast", player: pid, cancel: true }];
    }
    // Endure (CR 701.63a): every card that endures is a creature, so grow it rather than make a separate Spirit.
    // Its own card back on top, to draw it again; someone else's card can't be on our library.
    // Read ahead (CR 702.155): start on chapter I, so every chapter happens.
    if (pend.kind === "chooseOption" && pend.what === "readAhead") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "topOrBottom") return [{ type: "chooseOption", player: pid, choice: "top" }];
    if (pend.kind === "chooseOption" && pend.what === "endure") return [{ type: "chooseOption", player: pid, choice: "counters" }];
    // Which opponent to clash with: nothing is known about their libraries, so the next one in turn order.
    if (pend.kind === "chooseOption" && pend.what === "clash") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    // Damage shields: the options come in the order we'd pick them (damage.ts shieldPreference).
    if (pend.kind === "chooseOption" && pend.what === "damageShield") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "venture") return [{ type: "chooseOption", player: pid, choice: chooseRoom(s, pid, pend.options) }];
    if (pend.kind === "chooseOption" && pend.what === "damageSource") return [{ type: "chooseOption", player: pid, choice: chooseDamageSource(s, pid, pend.options) }];
    if (pend.kind === "chooseOption") {
      const card = pend.objectId ? defOf(s, obj(s, pend.objectId)) : s.resolving ? s.cards[s.resolving.item.sourceCardId ?? obj(s, s.resolving.item.objectId!).cardId]! : undefined;
      return [{ type: "chooseOption", player: pid, choice: chooseOption(s, pid, pend.what as ChoiceKind, card, pend.options) }];
    }
    if (pend.kind === "arrangeTop" && pend.how === "order") {
      // Its own library: wanted cards first. Someone else's: the cards its owner wants least on top.
      const owner = pend.owner ?? pid;
      const rank = (id: ObjectId) => (wantOnTop(s, owner, id) ? 1 : 0) * (owner === pid ? -1 : 1);
      return [{ type: "arrangeTop", player: pid, top: [...pend.cards].sort((a, b) => rank(a) - rank(b)), away: [] }];
    }
    // Going to the bottom (CR 401.4): the order hardly matters to a bot.
    if (pend.kind === "arrangeTop" && pend.how === "bottom") return [{ type: "arrangeTop", player: pid, top: [...pend.cards], away: [] }];
    if (pend.kind === "arrangeTop") {
      const keep = pend.cards.filter((id) => wantOnTop(s, pid, id));
      return [{ type: "arrangeTop", player: pid, top: keep, away: pend.cards.filter((id) => !keep.includes(id)) }];
    }
    if (pend.kind === "mulligan") return [{ type: "mulligan", player: pid, keep: !pend.canMulligan || keepsHand(s, pid, pend.taken) }];
    if (pend.kind === "bottomCards") return [{ type: "bottomCards", player: pid, objectIds: chooseBottom(s, pid, pend.count) }];
    if (pend.kind === "discardToHandSize") {
      const hand = [...player(s, pid).hand].sort((a, b) => mv(s, b) - mv(s, a));
      return [{ type: "discard", player: pid, objectIds: hand.slice(0, pend.count) }];
    }
  }
  const deflect = chooseDeflection(s, pid);
  if (deflect) return deflect;
  // Respond to an opponent's spell with a counterspell if we have one: from hand, or an ability
  // like Spiketail Hatchling's. "Unless its controller pays" only if they can't pay.
  const top = s.stack[s.stack.length - 1];
  if (top && top.kind === "spell" && top.controller !== pid && top.objectId && mv(s, top.objectId) >= 3) {
    const worthIt = (body: AbilityBody, sourceId: ObjectId, x = 0) => {
      const c = body.effects.find((e) => e.type === "counterSpell");
      return !!c && (c.type !== "counterSpell" || !c.unless || !canPayUnless(s, top.controller, c.unless, pid, sourceId, x));
    };
    for (const id of player(s, pid).hand) {
      const d = defOf(s, obj(s, id));
      const body = compileCard(d).spell;
      // An X counterspell ("unless its controller pays {X}"): as big as we can make it.
      const cost = parseManaCost(d.manaCost);
      const x = cost.hasX ? Math.max(0, availableMana(s, pid) - manaValue(cost)) : undefined;
      if (!body || !worthIt(body, id, x)) continue;
      const targets = chooseTargets(s, pid, body, false, id, x) ?? undefined;
      const plan = planCast(s, pid, id, targets, undefined, "auto", x);
      if (plan && plan[plan.length - 1]!.type === "castSpell" && (plan[plan.length - 1] as { targets?: unknown }).targets) return plan;
      // Its alternative cost when the mana isn't there: Force of Will's blue card, Daze's Island (CR 118.9).
      if (targets && altCost(d, "alternative") && !cost.hasX) {
        const extra = chooseExtraCosts(s, pid, id, targets, undefined, "alternative");
        const alt = extra && planCast(s, pid, id, targets, undefined, "auto", undefined, { ...extra, alt: "alternative" });
        if (alt && alt[alt.length - 1]!.type === "castSpell") return alt;
      }
    }
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) !== pid) continue;
      const abilities = abilitiesOf(s, o).activated;
      for (let i = 0; i < abilities.length; i++) {
        const ab = abilities[i]!;
        if (ab.body.modal || parseManaCost(ab.manaCost).hasX || !worthIt(ab.body, id)) continue;
        const targets = chooseTargets(s, pid, ab.body, false, id);
        const plan = targets && planActivate(s, pid, id, i, targets);
        if (plan) return plan;
      }
    }
  }
  const regen = chooseRegeneration(s, pid) ?? chooseRedirect(s, pid) ?? chooseDamageShield(s, pid) ?? chooseProtection(s, pid) ?? chooseNinjutsu(s, pid) ?? chooseSneak(s, pid);
  if (regen) return regen;
  if (canActAtSorcerySpeed(s, pid)) {
    const land = chooseLand(s, pid);
    if (land) return [land];
    // Turn face-down creatures face up when we can pay for it (CR 702.37e).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (!o.faceDown || controllerOf(s, o) !== pid) continue;
      // A manifested card with morph has two ways (CR 701.40c): the cheaper first.
      const ways = faceUpWays(s, o).map((w, i) => ({ i, v: manaValue(parseManaCost(w.cost)) })).sort((a, b) => a.v - b.v);
      for (const w of ways) {
        const plan = planTurnFaceUp(s, pid, id, w.i);
        if (plan) return plan;
      }
    }
    const p = player(s, pid);
    const fromYard = p.graveyard.filter((id) => graveyardWays(s, obj(s, id)).length);
    // Cards exiled with "you may play them until ..." first: they won't wait (impulse draw).
    const options = [...exilePlayable(s, pid), ...topPlayable(s, pid), ...p.command, ...p.hand, ...fromYard]
      .filter((id) => !isType(defOf(s, obj(s, id)), "Land"))
      // Damage prevention waits for damage coming (chooseDamageShield).
      .filter((id) => !shieldBody(compileCard(defOf(s, obj(s, id))).spell))
      .map((id) => {
        const plan = obj(s, id).zone === "graveyard" ? graveyardCastPlan(s, pid, id) : (freerunPlan(s, pid, id) ?? bestowPlan(s, pid, id) ?? castPlan(s, pid, id, false) ?? altCastPlan(s, pid, id));
        return plan ? { plan, mv: mv(s, id) } : null;
      })
      .filter((x): x is { plan: Action[]; mv: number } => !!x)
      .sort((a, b) => b.mv - a.mv);
    const expiring = options.find((x) => x.plan.some((a) => a.type === "castSpell" && obj(s, a.objectId).zone === "exile" && /Turn$/.test(obj(s, a.objectId).mayPlay?.until ?? "")));
    if (expiring) return expiring.plan;
    if (options[0]) return options[0].plan;
    // A loyalty ability of each planeswalker we control, once spells are cast (CR 606.3).
    const loyalty = chooseLoyalty(s, pid);
    if (loyalty) return loyalty;
    // Suspend what we can't cast now (CR 702.62a).
    const sus = chooseSuspend(s, pid);
    if (sus) return sus;
    // Plot what we can't cast now with the mana left at the end of our turn (CR 702.170a).
    if (s.step === "main2") {
      const plot = choosePlot(s, pid);
      if (plot) return plot;
      const foretell = chooseForetell(s, pid);
      if (foretell) return foretell;
    }
    // Unearth a creature to attack with this turn (CR 702.84a).
    if (s.step === "main1") {
      const dig = chooseUnearth(s, pid);
      if (dig) return dig;
    }
    // Crew Vehicles and saddle Mounts before combat.
    if (s.step === "main1") {
      const crew = chooseCrew(s, pid) ?? chooseSaddle(s, pid);
      if (crew) return crew;
    }
    // Use activated abilities once we're done casting spells, then cycle what we can't use.
    if (s.step === "main2") {
      const act = chooseStation(s, pid) ?? chooseActivation(s, pid) ?? chooseCycling(s, pid);
      if (act) return act;
    }
  }
  return [{ type: "passPriority", player: pid }];
}

/**
 * Exert (CR 701.43d): for what it triggers (its own "when you do", or "whenever you exert a creature"), while there's
 * life to spare for it not untapping to block.
 */
function chooseExert(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId[] {
  if (player(s, pid).life <= 10) return [];
  const onExert = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).triggers.some((t) => t.event === "youExert"));
  return options.filter((id) => onExert || abilitiesOf(s, obj(s, id)).triggers.some((t) => t.event === "selfExerted"));
}

/**
 * Enlist (CR 702.154a): tap the creature with the most power for the bonus, unless we're low on life and it's the
 * last creature we have left to block with.
 */
function chooseEnlist(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId[] {
  const best = [...options].sort((a, b) => power(s, obj(s, b)) - power(s, obj(s, a)))[0];
  if (!best || power(s, obj(s, best)) <= 0) return [];
  const blockers = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature") && !obj(s, id).tapped);
  return player(s, pid).life <= 8 && blockers.length <= 1 ? [] : [best];
}

/**
 * Blocked attackers to assign combat damage as though they weren't blocked (CR 510.1). Their controller sends it to
 * the player unless it can kill a blocker and the player wouldn't die anyway; a defending player choosing (banding)
 * takes it themselves only to save a blocker, with life to spare.
 */
function chooseUnblocked(s: GameState, pid: PlayerId, ids: ObjectId[]): ObjectId[] {
  return ids.filter((id) => {
    const at = obj(s, id);
    const dmg = power(s, at);
    const pw = at.attackingPermanent && s.objects[at.attackingPermanent.id];
    const life = pw ? (pw.counters.loyalty ?? 0) : player(s, at.attacking!).life;
    const kills = (at.blockedBy ?? []).some((b) => s.objects[b]?.zone === "battlefield" && (objHasKeyword(s, at, "Deathtouch") || toughness(s, obj(s, b)) - obj(s, b).damage <= dmg));
    return controllerOf(s, at) === pid ? !kills || life <= dmg : kills && life > dmg + 5;
  });
}

/**
 * Play a land that enters untapped if there is one. A land that can enter untapped by revealing a
 * card does; paying life for it (a shock land) is worth it while life is comfortable.
 */
function chooseLand(s: GameState, pid: PlayerId): Action | null {
  const lands = legalActions(s, pid).filter((a): a is Extract<Action, { type: "playLand" }> => a.type === "playLand");
  const p = player(s, pid);
  const options = lands.map((a) => {
    const c = entersRulesOf(s, pid, a.objectId); // under Blood Moon a nonbasic land has none of its abilities (CR 614.12)
    const untapped = c.entersTappedChoice ? canEnterUntapped(s, pid, a.objectId) && (c.entersTappedChoice.kind === "reveal" || p.life >= 16) : undefined;
    const tapped = c.entersTapped || (c.entersTappedUnless ? !conditionHolds(s, c.entersTappedUnless, pid) : c.entersTappedChoice ? !untapped : false);
    return { action: { ...a, ...(untapped ? { untapped } : {}) }, tapped };
  });
  // A land from the graveyard (Crucible of Worlds) first: it keeps a card in hand.
  options.sort((a, b) => Number(obj(s, b.action.objectId).zone === "graveyard") - Number(obj(s, a.action.objectId).zone === "graveyard"));
  return (options.find((x) => !x.tapped) ?? options[0])?.action ?? null;
}

/** Keep 2 to 5 lands out of 7; after two mulligans take whatever comes rather than shrink further. */
function keepsHand(s: GameState, pid: PlayerId, taken: number): boolean {
  const lands = player(s, pid).hand.filter((id) => isType(defOf(s, obj(s, id)), "Land")).length;
  return taken >= 2 || (lands >= 2 && lands <= 5);
}

/** Cards to put on the bottom after a mulligan: spare lands if the hand is land-heavy, else the most expensive spells. */
function chooseBottom(s: GameState, pid: PlayerId, count: number): string[] {
  const isLand = (id: string) => isType(defOf(s, obj(s, id)), "Land");
  const left = [...player(s, pid).hand];
  const out: string[] = [];
  while (out.length < count && left.length) {
    const lands = left.filter(isLand);
    const spells = left.filter((id) => !isLand(id)).sort((a, b) => mv(s, b) - mv(s, a));
    const pick = lands.length > Math.max(3, Math.ceil(left.length / 2)) || !spells.length ? lands[0]! : spells[0]!;
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}

const mv = (s: GameState, id: string) => manaValue(parseManaCost(defOf(s, obj(s, id)).manaCost));

/** Ward costs of the opponents' permanents among these targets (each permanent once). */
export function wardCosts(s: GameState, pid: PlayerId, targets: TargetChoice[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    if (t.kind !== "object" || seen.has(t.id)) continue;
    seen.add(t.id);
    const o = obj(s, t.id);
    if (o.zone !== "battlefield" || controllerOf(s, o) === pid) continue;
    for (const tr of abilitiesOf(s, o).triggers)
      if (tr.event === "becomesTargetOfOpponent") for (const e of tr.body.effects) if (e.type === "counterUnlessPays") out.push(e.unless.cost);
  }
  return out;
}

/**
 * Could `payer` pay what a "counter unless" asks, with the mana sources they have now?
 */
function canPayUnless(s: GameState, payer: PlayerId, unless: UnlessPays, pid: PlayerId, sourceId: ObjectId, x: number): boolean {
  if (unless.life && player(s, payer).life < unless.life) return false;
  const n = unless.generic === undefined ? 0 : evalAmount(s, unless.generic, { controller: pid, sourceId, x });
  return !!planMana(s, payer, parseManaCost(unlessCost(unless.cost, n)));
}

/** After the taps in `plan`, could other sources still make the mana for ward on these targets? (Rough: ignores mana already floating.) */
function canAlsoPayWard(s: GameState, pid: PlayerId, plan: Action[], targets: TargetChoice[]): boolean {
  const ward = wardCosts(s, pid, targets).join("");
  if (!ward) return true;
  const used = plan.flatMap((a) => (a.type === "activateMana" ? [a.objectId] : a.type === "castSpell" ? (a.convoke ?? []) : []));
  return !!planMana(s, pid, parseManaCost(ward), 0, undefined, used);
}
const isCounterOnly = (b: AbilityBody) => b.effects.some((e) => e.type === "counterSpell");

/**
 * Pick targets for an ability body: harmful effects go at opponents (preferring things
 * they'd kill or the biggest threat), helpful ones at our own stuff. Returns null when
 * there's no sensible choice. With `forced`, always returns some legal choice.
 */
export function chooseTargets(s: GameState, pid: PlayerId, printed: AbilityBody, forced = false, sourceId?: string, x = 0): TargetChoice[] | null {
  // "Any number of target creatures": each one there could be, as an "up to" target (CR 601.2c); none there, not worth it.
  const body = offerMany(s, printed, pid, x, sourceId ? sourceQuality(s, sourceId) : undefined, sourceId);
  const many = manySlot(printed.targets);
  if (!forced && many >= 0 && !printed.targets[many]!.skip && body.targets[many]!.skip) return null;
  const harm = harmfulTargets(body);
  const out: TargetChoice[] = [];
  // Damage a target will take from a fight or "damage equal to its power": the other creature's power.
  const fightDamage = (i: number) => {
    let n = 0;
    for (const e of allEffects(body.effects)) {
      if (e.type !== "fight" && e.type !== "bite") continue;
      if (e.b.ref !== "target" || e.b.index !== i) continue;
      const chosen = e.a.ref === "target" ? out[e.a.index] : undefined;
      const a = e.a.ref === "self" ? (sourceId ? s.objects[sourceId] : undefined) : chosen?.kind === "object" ? obj(s, chosen.id) : undefined;
      if (a) n += power(s, a);
    }
    return n;
  };
  for (let i = 0; i < body.targets.length; i++) {
    const spec = body.targets[i]!;
    // A target the spell is cast as if it didn't have (CR 702.33g).
    if (spec.skip) {
      out.push({ kind: "none" });
      continue;
    }
    if (spec.divided?.first === i) {
      // Shields divided as you choose (Remedy) help, like +1/+1 counters.
      const shields = allEffects(body.effects).some((e) => e.type === "preventNext" && e.divided && e.to.ref === "anyTarget" && e.to.index === i);
      const picks = spec.divided.counter === "+1/+1" || shields ? distributeCounters(s, pid, body, i, out, forced, sourceId) : divideDamage(s, pid, body, i, out, forced, sourceId);
      if (!picks) return null;
      out.push(...picks);
      i += spec.divided.n - 1;
      continue;
    }
    // The source's colors matter for protection (CR 702.16b): a spell's card, or the ability's source.
    // Bots never pick the same thing twice, which also keeps "another target" apart.
    // "Remove all counters from", "move all counters from": only something with counters on it.
    const countersFrom = allEffects(body.effects).some((e) => (e.type === "removeAllCounters" && e.what.ref === "target" && refCovers(e.what, i)) || (e.type === "moveAllCounters" && e.from.ref === "target" && e.from.index === i));
    const all = legalTargets(s, spec, pid, undefined, sourceId ? sourceQuality(s, sourceId) : undefined, sourceId).filter(
      (t) => !out.some((o) => sameTarget(o, t)) && !(spec.notSource && t.kind === "object" && t.id === sourceId) && !(countersFrom && t.kind === "object" && !Object.values(obj(s, t.id).counters).some((n) => n > 0)),
    );
    // Reanimating takes the best creature from any graveyard it may.
    const reanimate = allEffects(body.effects).some((e) => e.type === "putOntoBattlefield" && e.what.ref === "target" && i >= e.what.index && i < e.what.index + (e.what.n ?? 1));
    // "Becomes a copy of target creature": the best one anywhere, but not a legendary one of ours (the legend rule
    // would cost us one of them) or the source itself; what becomes the copy is our weakest.
    const copies = allEffects(body.effects).filter((e): e is Extract<Effect, { type: "becomeCopy" }> => e.type === "becomeCopy");
    const copied = copies.some((e) => e.of.ref === "target" && e.of.index === i);
    const copying = copies.some((e) => e.what.ref === "target" && e.what.index === i);
    const preferred = copied
      ? all.filter((t) => t.kind !== "object" || (t.id !== sourceId && !(isMine(s, pid, t) && objIsLegendary(s, t.id))))
      : reanimate
        ? all
        : all.filter((t) => (harm[i] ? !isMine(s, pid, t) : isMine(s, pid, t)));
    // Provoke: a creature ours kills without dying (wantsMay then says yes), else anything (and it says no).
    const provoke = allEffects(body.effects).some((e) => e.type === "mustBlockSource" && e.what.ref === "target" && e.what.index === i);
    if (provoke && sourceId && s.objects[sourceId]) {
      const good = all.filter((t) => t.kind === "object" && provokeGood(s, obj(s, sourceId), obj(s, t.id)));
      out.push(good.length ? best(s, pid, good, true, 0) : all[0] ?? { kind: "none" });
      continue;
    }
    // An "up to" target is only chosen when there's something we'd like it to be (CR 115.6).
    const pool = preferred.length ? preferred : forced && !spec.optional ? all : [];
    if (!pool.length) {
      if (!spec.optional) return null;
      out.push({ kind: "none" });
      continue;
    }
    out.push(copying ? worst(s, pid, pool) : best(s, pid, pool, harm[i]!, damageTo(body, i, x) + fightDamage(i)));
  }
  // Only "up to" targets, none of them worth choosing: not worth doing.
  if (!forced && body.targets.some((t) => !t.skip) && out.every((t) => t.kind === "none")) return null;
  // "Divided evenly among any number of targets" (Fireball), each one more to pay for: all of it at the best one.
  if (many >= 0 && allEffects(body.effects).some((e) => e.type === "damage" && e.evenly)) {
    const end = many + body.targets.length - printed.targets.length + 1; // the targets it was offered as
    const keep = out.findIndex((t, i) => i >= many && i < end && t.kind !== "none");
    return out.map((t, i) => (i >= many && i < end && i !== keep ? { kind: "none" as const } : t));
  }
  return out;
}

/**
 * Targets and their parts for damage "divided as you choose" among the targets from `first` (CR 601.2d): just enough to
 * kill each of the opponents' creatures and planeswalkers worth the most, the rest at the opponent lowest on life, or
 * onto one of the others.
 */
function divideDamage(s: GameState, pid: PlayerId, body: AbilityBody, first: number, before: TargetChoice[], forced: boolean, sourceId?: string): TargetChoice[] | null {
  const spec = body.targets[first]!;
  const { n, total } = spec.divided!;
  const all = legalTargets(s, spec, pid, undefined, sourceId ? sourceQuality(s, sourceId) : undefined, sourceId).filter(
    (t) => !before.some((o) => sameTarget(o, t)) && !(spec.notSource && t.kind === "object" && t.id === sourceId),
  );
  const foes = all.filter((t) => !isMine(s, pid, t));
  const need = (t: ChosenTarget) => {
    if (t.kind !== "object") return Infinity;
    const o = obj(s, t.id);
    // -1/-1 counters kill by toughness, whatever damage or indestructible (CR 704.5f).
    if (spec.divided!.counter) return objIsType(s, o, "Creature") ? Math.max(1, toughness(s, o)) : Infinity;
    return objIsType(s, o, "Creature") ? Math.max(1, lethalDamage(s, o)) : objIsType(s, o, "Planeswalker") ? Math.max(1, o.counters.loyalty ?? 0) : Infinity;
  };
  const picks: { t: ChosenTarget; n: number }[] = [];
  let left = total;
  const killable = foes.filter((t) => need(t) <= total).sort((a, b) => targetWorth(s, pid, b, true, need(b)) - targetWorth(s, pid, a, true, need(a)));
  for (const t of killable)
    if (picks.length < n && need(t) <= left) {
      picks.push({ t, n: need(t) });
      left -= need(t);
    }
  if (left > 0) {
    const face = foes.filter((t) => t.kind === "player").sort((a, b) => player(s, a.id as PlayerId).life - player(s, b.id as PlayerId).life)[0];
    if (face && picks.length < n) picks.push({ t: face, n: left });
    else if (picks.length) picks[0]!.n += left;
    else if (foes.length) picks.push({ t: best(s, pid, foes, true, left), n: left });
    else if (forced && all.length) picks.push({ t: worst(s, pid, all), n: left });
  }
  if (!picks.length) return null;
  return Array.from({ length: n }, (_, k): TargetChoice => (picks[k] ? { ...picks[k]!.t, amount: picks[k]!.n } as TargetChoice : { kind: "none" }));
}

/**
 * "Distribute +1/+1 counters among" targets, prevention shields divided among them (CR 601.2d): all of it on our best
 * creature (or ourselves) among the legal targets.
 */
function distributeCounters(s: GameState, pid: PlayerId, body: AbilityBody, first: number, before: TargetChoice[], forced: boolean, sourceId?: string): TargetChoice[] | null {
  const spec = body.targets[first]!;
  const { n, total, upTo } = spec.divided!;
  const all = legalTargets(s, spec, pid, undefined, sourceId ? sourceQuality(s, sourceId) : undefined, sourceId).filter(
    (t) => !before.some((o) => sameTarget(o, t)) && !(spec.notSource && t.kind === "object" && t.id === sourceId),
  );
  const mine = all.filter((t) => isMine(s, pid, t));
  const pick = mine.length ? best(s, pid, mine, false, 0) : forced && !upTo && all.length ? worst(s, pid, all) : undefined;
  if (!pick && !upTo) return null;
  return Array.from({ length: n }, (_, k): TargetChoice => (k === 0 && pick ? ({ ...pick, amount: total } as TargetChoice) : { kind: "none" }));
}

/**
 * Turn an opponent's spell aimed at us or ours onto one of theirs (Deflection, CR 115.7a), when there's one it could
 * go to. "Unless that spell's controller pays" only if they can't.
 */
function chooseDeflection(s: GameState, pid: PlayerId): Action[] | null {
  const top = s.stack[s.stack.length - 1];
  if (!top || top.kind !== "spell" || top.controller === pid || !top.objectId) return null;
  const chosen = (top.targets ?? []).filter((t) => t.kind !== "none");
  const j = (top.targets ?? []).findIndex((t) => t.kind !== "none");
  const current = top.targets?.[j];
  if (chosen.length !== 1 || !current || current.kind === "none" || !isMine(s, pid, current)) return null;
  const body = top.body ?? castingBody(defOf(s, obj(s, top.objectId)));
  const spec = body?.targets[j];
  if (!body || !spec || !harmfulTargets(body)[j]) return null;
  if (!changeTargetOptions(s, top, spec, current).some((t) => t.kind !== "none" && !isMine(s, pid, t))) return null;
  for (const id of player(s, pid).hand) {
    const spell = compileCard(defOf(s, obj(s, id))).spell;
    const e = spell?.effects.find((x) => x.type === "changeTarget");
    if (!spell || e?.type !== "changeTarget" || spell.targets.length !== 1) continue;
    if (e.unless && canPayUnless(s, top.controller, e.unless, pid, id, 0)) continue;
    const plan = planCast(s, pid, id, [{ kind: "stack", id: top.id }], undefined, "auto");
    if (plan && plan[plan.length - 1]!.type === "castSpell") return plan;
  }
  return null;
}

/**
 * A spell's new target as our spell changes it: its effect at one of theirs if it hurts, at ours if it helps. A
 * counterspell can be turned onto the spell changing it (rulings on Deflection), which leaves the stack first.
 */
function newTargetFor(s: GameState, pid: PlayerId, pend: Extract<PendingDecision, { kind: "changeTarget" }>): TargetChoice {
  const item = s.stack.find((x) => x.id === pend.stackId);
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  const body = item?.body ?? (o ? castingBody(defOf(s, o)) : undefined);
  const harm = !!body && !!harmfulTargets(body)[pend.index];
  const options = pend.options.filter((t): t is ChosenTarget => t.kind !== "none");
  const preferred = options.filter((t) => (harm ? !isMine(s, pid, t) : isMine(s, pid, t)));
  if (preferred.length) return best(s, pid, preferred, harm, body ? damageTo(body, pend.index, item?.x ?? 0) : 0);
  return options.find((t) => t.kind === "stack" && t.id === s.resolving?.item.id) ?? (harm ? worst(s, pid, options) : best(s, pid, options, false, 0));
}

/** Is this target ours: our permanent or spell, a card we own, or us? */
function isMine(s: GameState, pid: PlayerId, t: ChosenTarget): boolean {
  if (t.kind === "player") return t.id === pid;
  if (t.kind === "stack") return (s.stack.find((x) => x.id === t.id) ?? (s.resolving?.item.id === t.id ? s.resolving.item : undefined))?.controller === pid;
  const o = obj(s, t.id);
  return o.zone === "battlefield" ? controllerOf(s, o) === pid : o.owner === pid;
}

/** The target an effect touches, if any. */
function targetIndexOf(e: Effect): number | undefined {
  const refs = [("what" in e ? e.what : undefined), ("who" in e ? e.who : undefined), ("to" in e ? e.to : undefined), ("a" in e ? e.a : undefined), ("b" in e ? e.b : undefined)];
  for (const r of refs) if (r && "index" in r && (r.ref === "target" || r.ref === "anyTarget")) return r.index;
  if (e.type === "counterSpell") return e.index;
  return undefined;
}

/**
 * "You may ...": do it unless it would hurt us (a harmful effect that ended up aimed at our
 * own stuff, or making ourselves lose life or discard).
 */
/**
 * How to cast this card, with modes and targets we like, or null if it isn't worth it. `free`: cascade
 * lets us cast it without paying (then even a counterspell is cast if it has something to counter).
 */
function castPlan(s: GameState, pid: PlayerId, id: string, free: boolean, via?: CastFromGraveyardKind, alt?: AltCostKind): Action[] | null {
  const d = defOf(s, obj(s, id));
  // A foretold card is cast for its foretell cost (CR 702.143a).
  if (!free && !via && alt === undefined && foretoldCast(s, pid, obj(s, id))) alt = "foretell";
  const cost = parseManaCost(graveyardWay(s, obj(s, id), via)?.mana ?? altCost(d, alt)?.mana ?? d.manaCost);
  // X spells: as big an X as we can pay for. Cast for free, X is 0 (CR 107.3b), which is rarely worth it.
  if (cost.hasX && free) return null;
  // A ritual, a spell that only adds mana (Dark Ritual): worth it when what it nets lets us cast a card we can't yet.
  const effects = compileCard(d).spell?.effects ?? [];
  if (!free && effects.length && effects.every((e) => e.type === "addMana" || e.type === "choose")) {
    const added = effects.reduce((n, e) => n + (e.type !== "addMana" ? 0 : (e.mana?.match(/\{/g)?.length ?? e.chosen ?? 0)), 0);
    const avail = availableMana(s, pid);
    const gain = added - manaValue(cost);
    if (!player(s, pid).hand.some((h) => h !== id && !isType(defOf(s, obj(s, h)), "Land") && mv(s, h) > avail && mv(s, h) <= avail + gain)) return null;
  }
  let xs: (number | undefined)[] = cost.hasX ? xChoices(availableMana(s, pid) + delveRoom(s, pid, id, { via, alt }) - totalWithoutX(s, pid, id, via), xCount(cost)) : [undefined];
  // "Pay X life", "sacrifice X creatures" (CR 107.3a): no bigger an X than we'd pay that way too.
  if (costsHaveX(d, { via, alt })) {
    const most = costXRoom(s, pid, id, castExtraCosts(d, { via, alt }));
    xs = cost.hasX ? xs.filter((x) => x! <= most) : xChoices(most, 1);
  }
  for (const x of xs) {
    const plan = castPlanWithX(s, pid, id, free, x, via, alt);
    if (plan) return plan;
  }
  return null;
}

/**
 * Casting a card from our hand for an alternative cost, when its mana cost is out of reach: dash it
 * (CR 702.109a), or evoke it (CR 702.74a) when it does something as it enters before it's sacrificed.
 */
function altCastPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const c = compileCard(defOf(s, obj(s, id)));
  // Morph and disguise: a 2/2 for {3} now, turned face up later (CR 702.37c).
  if (c.faceDownCast) {
    const plan = planCast(s, pid, id, undefined, undefined, "auto", undefined, { faceDown: true });
    if (plan) return plan;
  }
  // Conspiracy Unraveler's "collect evidence 10 rather than pay the mana cost" too (CR 118.9).
  for (const a of [...(c.altCosts ?? []), ...altCostsFor(s, pid, obj(s, id)).filter((x) => x.kind === "evidence")]) {
    if (a.kind === "evoke" && !c.triggers.some((t) => t.event === "selfEnters" && !t.ifEvoked)) continue;
    if (a.kind === "bestow") continue; // tried first, see bestowPlan
    const plan = castPlan(s, pid, id, false, undefined, a.kind);
    if (plan) return plan;
  }
  return null;
}

/** Freerunning is cheaper than the mana cost: pay it whenever it's allowed (CR 702.173a). */
function freerunPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const o = obj(s, id);
  if (o.zone !== "hand" || !altCost(defOf(s, o), "freerunning") || !(s.freerunningThisTurn ?? []).includes(pid)) return null;
  return castPlan(s, pid, id, false, undefined, "freerunning");
}

/** Bestow it on one of our creatures when we can afford to (CR 702.103a): the bonus now, and a creature later. */
function bestowPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const o = obj(s, id);
  if (o.zone !== "hand" || !altCost(defOf(s, o), "bestow")) return null;
  return castPlan(s, pid, id, false, undefined, "bestow");
}

/**
 * A card to suspend (CR 702.62a): one we can't cast now, whose suspend cost we can pay, when it's worth the wait (a
 * card with no mana cost, or one costing more than we can make soon). The cheapest wait first.
 */
function chooseSuspend(s: GameState, pid: PlayerId): Action[] | null {
  const mana = availableMana(s, pid);
  const options = player(s, pid)
    .hand.map((id) => ({ id, sus: compileCard(defOf(s, obj(s, id))).suspend }))
    .filter((x): x is { id: string; sus: { n: number; cost: string } } => !!x.sus)
    .filter((x) => !defOf(s, obj(s, x.id)).manaCost || mv(s, x.id) > mana + 1)
    .sort((a, b) => a.sus.n - b.sus.n);
  for (const x of options) {
    const plan = planSuspend(s, pid, x.id);
    if (plan) return plan;
  }
  return null;
}

/** A card to plot (CR 702.170a) with mana we'd otherwise not use this turn: the biggest one, cast free on a later turn. */
function choosePlot(s: GameState, pid: PlayerId): Action[] | null {
  const options = player(s, pid)
    .hand.filter((id) => compileCard(defOf(s, obj(s, id))).plot)
    .sort((a, b) => mv(s, b) - mv(s, a));
  for (const id of options) {
    const plan = planPlot(s, pid, id);
    if (plan) return plan;
  }
  return null;
}

/**
 * A card to foretell (CR 702.143a) with mana we'd otherwise not use this turn: the one whose foretell cost saves the
 * most on a later turn.
 */
function chooseForetell(s: GameState, pid: PlayerId): Action[] | null {
  const saving = (id: string) => mv(s, id) - manaValue(parseManaCost(compileCard(defOf(s, obj(s, id))).foretell ?? ""));
  const options = player(s, pid)
    .hand.filter((id) => compileCard(defOf(s, obj(s, id))).foretell)
    .sort((a, b) => saving(b) - saving(a));
  for (const id of options) {
    const plan = planForetell(s, pid, id);
    if (plan) return plan;
  }
  return null;
}

/**
 * Which room to venture into, or which dungeon to start (CR 701.49): damage and bodies first, the counters only with a
 * creature to put them on, goad only with an opponent's creature to goad.
 */
function chooseRoom(s: GameState, pid: PlayerId, options: string[]): string {
  const creatures = (mine: boolean) => s.battlefield.some((id) => objIsType(s, obj(s, id), "Creature") && (controllerOf(s, obj(s, id)) === pid) === mine);
  const score = (room: string) =>
    ({ "Trap!": 5, Catacombs: 4, Forge: creatures(true) ? 4 : 0, Stash: 3, Archives: 3, "Lost Well": 2, Arena: creatures(false) ? 2 : 0 })[room] ?? 1;
  return [...options].sort((a, b) => score(b) - score(a))[0]!;
}

/**
 * Dredge instead of drawing (CR 702.52a) when the library can spare the cards: the most expensive card we could get
 * back, if it's worth more than a random draw (mana value 3 or more, or a creature).
 */
function chooseDredge(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId | undefined {
  const lib = player(s, pid).library.length;
  const ok = options.filter((id) => lib - (compileCard(defOf(s, obj(s, id))).dredge ?? 0) >= 20 && (mv(s, id) >= 3 || isType(defOf(s, obj(s, id)), "Creature")));
  return ok.sort((a, b) => mv(s, b) - mv(s, a))[0];
}

/** Cipher (CR 702.99a): an evasive creature first, then the strongest; always encode, the card is otherwise lost to the graveyard. */
function chooseEncode(s: GameState, options: ObjectId[]): ObjectId[] {
  const evasive = (id: ObjectId) => (["Flying", "Shadow", "Horsemanship", "Fear", "Intimidate", "Menace", "Trample"].some((k) => objHasKeyword(s, obj(s, id), k)) ? 10 : 0);
  const best = [...options].sort((a, b) => evasive(b) + power(s, obj(s, b)) - evasive(a) - power(s, obj(s, a)))[0];
  return best ? [best] : [];
}

/** A creature we can tap for a cost without losing an attack or a block: it can't attack this turn, or combat is over. */
function spare_(s: GameState, pid: PlayerId, id: ObjectId): boolean {
  const o = obj(s, id);
  const afterCombat = s.activePlayer === pid && (s.step === "main2" || s.step === "end");
  return afterCombat || o.controlledSinceTurn >= s.turn;
}

/** Spare creatures (see spare_) with total power `n` or more for teamwork, the strongest first, or undefined. */
function spareTappers(s: GameState, pid: PlayerId, spell: ObjectId, n: number, busy: (id: ObjectId) => boolean = () => false): ObjectId[] | undefined {
  if (n <= 0) return undefined;
  const pool = teamworkCandidates(s, pid)
    .filter((id) => id !== spell && !busy(id) && spare_(s, pid, id) && teamworkPower(s, id) > 0)
    .sort((a, b) => teamworkPower(s, b) - teamworkPower(s, a));
  const out: ObjectId[] = [];
  let total = 0;
  for (const id of pool) {
    if (total >= n) break;
    out.push(id);
    total += teamworkPower(s, id);
  }
  return total >= n ? out : undefined;
}

/**
 * Whom to promise a gift to, or undefined not to: only a card, a Food, a Treasure or a tapped Fish, and only when the
 * card does more with the gift promised ("if the gift was promised, ..."). The opponent with the least life gets it.
 */
function chooseGiftee(s: GameState, pid: PlayerId, c: CompiledCard): PlayerId | undefined {
  if (!["a card", "a Food", "a Treasure", "a tapped Fish"].includes(c.gift!.what)) return undefined;
  const bodies = [...(c.spell ? [c.spell] : []), ...c.triggers.filter((t) => !(t.ifGift && t.body.effects === c.gift!.effects)).map((t) => ({ ...t.body, ifGift: t.ifGift }))];
  const better = bodies.some((b) => ("ifGift" in b && b.ifGift) || allEffects(b.effects).some((e) => e.type === "if" && e.cond.kind === "gift" && e.effects.length > 0 && e.effects !== c.gift!.effects));
  if (!better) return undefined;
  return [...opponents(s, pid)].sort((a, b) => player(s, a).life - player(s, b).life)[0];
}

/**
 * Asked to pay tribute on an opponent's creature: pay (making it bigger) unless its "if tribute wasn't paid" ability
 * only helps its controller a little (gaining life, haste, a bonus until end of turn), or the counters are many.
 */
function payTribute(s: GameState, id: ObjectId): boolean {
  const c = compileCard(defOf(s, obj(s, id)));
  const n = c.tribute ?? 0;
  const mild = (e: Effect) => e.type === "gainLife" || (e.type === "continuous" && e.what.ref === "self");
  const unpaid = c.triggers.filter((t) => t.ifTributeUnpaid).flatMap((t) => allEffects(t.body.effects));
  return n <= 4 && unpaid.some((e) => !mild(e));
}

/** Casting a card from our graveyard (flashback, escape, ...): the first way that works. */
function graveyardCastPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  for (const g of graveyardWays(s, obj(s, id))) {
    const plan = castPlan(s, pid, id, false, g.kind);
    if (plan) return plan;
  }
  return null;
}

/** Spending all of `mana` on X ({X}{X} takes two each), then smaller values; never 0. A few tries at most. */
function xChoices(mana: number, perX: number): number[] {
  const most = Math.floor(mana / Math.max(1, perX));
  const out: number[] = [];
  for (let x = most; x >= 1 && out.length < 4; x--) out.push(x);
  return out;
}

/**
 * The most X we'd pay costs like "pay X life", "discard X cards", "sacrifice X lands" with (see chooseExtraCosts):
 * life to spare, the cards in hand besides this one, our cheap permanents, the cards in our graveyard.
 */
function costXRoom(s: GameState, pid: PlayerId, id: string, costs: AdditionalCost[]): number {
  const p = player(s, pid);
  let most = Infinity;
  for (const c of costs) {
    if (!("x" in c) || !c.x) continue;
    const room =
      c.kind === "payLife"
        ? p.life - 15
        : c.kind === "discard"
          ? p.hand.filter((x) => x !== id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x))))).length
          : c.kind === "exileFromGraveyard"
            ? p.graveyard.filter((x) => x !== id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x))))).length
            : c.kind === "sacrifice"
              ? sacrificePool(s, pid, c, new Set()).length
              : returnCandidates(s, pid, c).length;
    most = Math.min(most, room);
  }
  return Math.max(0, most === Infinity ? 0 : most);
}

/** What casting it costs apart from X: its mana value plus commander tax, less reductions. */
function totalWithoutX(s: GameState, pid: PlayerId, id: string, via?: CastFromGraveyardKind, alt?: AltCostKind): number {
  const { cost, extra } = spellCost(s, pid, obj(s, id), 0, [], { via, alt });
  return manaValue(cost) + extra;
}

function castPlanWithX(s: GameState, pid: PlayerId, id: string, free: boolean, x: number | undefined, via?: CastFromGraveyardKind, alt?: AltCostKind): Action[] | null {
  const printed = castingBody(castDef(s, id, alt));
  const choice = printed?.modal ? chooseModes(s, pid, printed, false, id) : null;
  if (printed?.modal && !choice) return null;
  // Entwine (CR 702.42a): every mode, when we can pay for it and they all have targets.
  if (printed?.modal?.entwine && legalModes(s, printed, pid).every(Boolean)) {
    const plan = castPlanWithModes(s, pid, id, free, x, via, alt, printed.modal.modes.map((_, i) => i));
    if (plan) return plan;
  }
  // "Choose both instead" (teamwork, or controlling a commander): both modes when both can be chosen.
  const both = printed?.modal?.both;
  if (both && legalModes(s, printed!, pid).every(Boolean)) {
    const tw = both === "teamwork" ? spareTappers(s, pid, id, compileCard(defOf(s, obj(s, id))).teamwork ?? 0) : undefined;
    if (both === "commander" ? bothModes(s, pid, printed!) : tw) {
      const plan = castPlanWithModes(s, pid, id, free, x, via, alt, [0, 1], tw);
      if (plan) return plan;
    }
  }
  if (!printed?.modal?.costs) return castPlanWithModes(s, pid, id, free, x, via, alt, choice?.modes);
  // Spree (CR 702.172a): each mode costs more, so the most useful modes we can pay for.
  for (let n = choice!.ranked.length; n >= 1; n--) {
    const plan = castPlanWithModes(s, pid, id, free, x, via, alt, choice!.ranked.slice(0, n).sort((a, b) => a - b));
    if (plan) return plan;
  }
  return null;
}

function castPlanWithModes(s: GameState, pid: PlayerId, id: string, free: boolean, x: number | undefined, via: CastFromGraveyardKind | undefined, alt: AltCostKind | undefined, modes: number[] | undefined, teamwork?: ObjectId[]): Action[] | null {
  const printed = castingBody(castDef(s, id, alt));
  const all = printed && withModes(printed, modes);
  // Targets that only a kicked (bargained, ...) part needs (CR 702.33g): with those costs paid first, then without.
  if (all && hasGatedTargets(all.targets)) {
    const conds = all.targets.flatMap((t) => (t.onlyIf ? [t.onlyIf.cond] : []));
    return castPlanPaying(s, pid, id, free, x, via, alt, modes, teamwork, { paid: true, conds }) ?? castPlanPaying(s, pid, id, free, x, via, alt, modes, teamwork, { paid: false, conds });
  }
  return castPlanPaying(s, pid, id, free, x, via, alt, modes, teamwork);
}

/**
 * Casting it with these modes. `gate`: the optional costs some of its targets depend on, all of them paid or none (an
 * undefined gate leaves them to the usual choices below).
 */
function castPlanPaying(s: GameState, pid: PlayerId, id: string, free: boolean, x: number | undefined, via: CastFromGraveyardKind | undefined, alt: AltCostKind | undefined, modes: number[] | undefined, teamwork: ObjectId[] | undefined, gate?: { paid: boolean; conds: SpellCondition[] }): Action[] | null {
  const printed = castingBody(castDef(s, id, alt));
  // Whether a cost of this kind must be paid (true), must not be (false), or is up to the usual choice (undefined).
  const must = (kind: SpellCondition["kind"]) => (gate && gate.conds.some((c) => c.kind === kind) ? gate.paid : undefined);
  const kickOk = (kicks: number[]) => !gate || !gate.conds.some((c) => c.kind === "kicked") || gate.conds.filter((c) => c.kind === "kicked").every((c) => castConditionMet(c, { kicks }) === gate.paid);
  const how: CastHow = gate?.paid ? { kicks: [0, 1], bargained: true, teamwork: true, gift: true, evidence: true } : {};
  const body = printed && gateBody(withModes(printed, modes), how);
  const specs = body?.targets ?? spellTargets(s, id, modes, alt);
  const targets = specs.length && body ? chooseTargets(s, pid, body, false, id, x) : undefined;
  if (specs.length && !targets) return null;
  // Strive: each target beyond the first costs more (rulings), so only as many of the best ones as we can pay for.
  if (targets && compileCard(defOf(s, obj(s, id))).strive) {
    const way = { ...(via ? { via } : {}), ...(alt ? { alt } : {}) };
    for (let i = targets.length - 1; i > 0 && !planCast(s, pid, id, targets, modes, "auto", x, way); i--) if (targets[i]!.kind !== "none") targets[i] = { kind: "none" };
  }
  if (!free && body && isCounterOnly(body)) return null; // hold counterspells
  // "Destroy all creatures" and the like: only when it hurts the opponents more than us.
  if (body && (groupValue(s, pid, body, defOf(s, obj(s, id))) ?? 1) <= 0) return null;
  // "Sacrifice a creature or pay {3}{B}" (CR 601.2b): the first way we're willing and able to pay.
  const ors = compileCard(defOf(s, obj(s, id))).costOr?.map((_, i) => i) ?? [undefined];
  let extra: CostChoices | null = null;
  for (const costOr of ors) {
    const e = chooseExtraCosts(s, pid, id, targets ?? [], via, alt, costOr, x ?? 0);
    if (!e) continue;
    if (costOr !== undefined) e.costOr = costOr;
    if (costOr === undefined || planCast(s, pid, id, targets ?? undefined, modes, "auto", x, { ...e, ...(via ? { via } : {}), ...(alt ? { alt } : {}) })) {
      extra = e;
      break;
    }
  }
  if (extra) {
    // Casualty: a token or a cheap creature for a copy of the spell (CR 702.153a).
    const victim = casualtyCandidates(s, pid, castDef(s, id, alt))
      .map((x) => obj(s, x))
      .filter((o) => !o.isCommander && !extra.sacrifice?.includes(o.id) && !(targets ?? []).some((t) => t.kind === "object" && t.id === o.id))
      .filter((o) => o.isToken || worth(s, pid, o) <= 3)
      .sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
    if (victim) extra.casualty = victim.id;
    // Bargain (CR 702.166a): a spare token for what being bargained adds.
    const spare = bargainCandidates(s, pid, id)
      .map((x) => obj(s, x))
      .filter((o) => o.isToken && o.id !== victim?.id && !extra.sacrifice?.includes(o.id) && !(targets ?? []).some((t) => t.kind === "object" && t.id === o.id) && worth(s, pid, o) <= 2)
      .sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
    if (spare && must("bargained") !== false) extra.bargain = spare.id;
    if (must("bargained") && !spare) return null;
    const c = compileCard(defOf(s, obj(s, id)));
    // "You may collect evidence N" (CR 701.59a): when being collected does something, with cards we can spare.
    if (c.evidence !== undefined && must("evidence") !== false && (must("evidence") || wantsEvidence(c))) {
      const ids = spareEvidence(s, pid, c.evidence, id, [...(extra.exileCards ?? []), ...(extra.collect ?? [])]);
      if (ids) extra.evidence = ids;
    }
    if (must("evidence") && !extra.evidence) return null;
    const busy = (o: ObjectId) => o === victim?.id || o === spare?.id || !!extra.sacrifice?.includes(o) || (targets ?? []).some((t) => t.kind === "object" && t.id === o);
    // Teamwork: with creatures that wouldn't be attacking or blocking anyway; a "choose both" spell gets it with both modes.
    const tw = teamwork ?? (c.teamwork !== undefined && !c.spell?.modal?.both && must("teamwork") !== false ? spareTappers(s, pid, id, c.teamwork, busy) : undefined);
    if (tw) extra.teamwork = tw;
    if (must("teamwork") && !tw) return null;
    // Conspire (CR 702.78a): two such creatures for a copy of the spell.
    if (c.conspire) {
      const two = conspireCandidates(s, pid, id).filter((o) => !busy(o) && !tw?.includes(o) && spare_(s, pid, o)).slice(0, 2);
      if (two.length === 2) extra.conspire = two;
    }
    // Gift (CR 702.174): promised only for a small gift that turns on something of the spell's own.
    // When it has targets only with the gift promised, it's promised for those.
    const giftee = !c.gift || must("gift") === false ? undefined : (chooseGiftee(s, pid, c) ?? (must("gift") ? [...opponents(s, pid)].sort((a, b) => player(s, a).life - player(s, b).life)[0] : undefined));
    if (giftee !== undefined) extra.gift = giftee;
    if (must("gift") && giftee === undefined) return null;
  }
  if (!extra) return null;
  if (alt) extra.alt = alt;
  // Delve away as much as we can (CR 702.66a): the cards that do nothing more in the graveyard first.
  const room = free ? 0 : delveRoom(s, pid, id, { ...extra, ...(via ? { via } : {}) }, x);
  if (room) {
    const keep = (c: string) => (usefulInGraveyard(s, c) ? 1 : 0);
    extra.delve = player(s, pid)
      .graveyard.filter((c) => c !== id && !extra.exileCards?.includes(c) && !extra.evidence?.includes(c) && !extra.collect?.includes(c))
      .sort((a, b) => keep(a) - keep(b))
      .slice(0, room);
  }
  // Buy it back if we can afford to (CR 702.27a), then kick it if we can: the most kicker costs first (CR 702.33).
  const buybacks = compileCard(defOf(s, obj(s, id))).buyback && !via ? [true, false] : [false];
  for (const buyback of buybacks)
    for (const kicks of kickOptions(s, pid, id, free).filter(kickOk)) {
      const plan = planCast(s, pid, id, targets ?? undefined, modes, "auto", x, { ...extra, ...(kicks.length ? { kicks } : {}), ...(via ? { via } : {}), ...(buyback ? { buyback } : {}) });
      // Leave mana for ward on what it targets, or don't bother (CR 702.21a).
      if (plan && targets && !canAlsoPayWard(s, pid, plan, targets)) continue;
      if (plan) return plan;
    }
  return null;
}

const gateBody = (b: AbilityBody, how: CastHow): AbilityBody => (hasGatedTargets(b.targets) ? { ...b, targets: gateTargets(b.targets, how) } : b);

/** A card that does more from our graveyard: flashback and the like, or an ability that works there. */
const usefulInGraveyard = (s: GameState, id: ObjectId) => !!compileCard(defOf(s, obj(s, id))).fromGraveyard?.length || abilitiesOf(s, obj(s, id)).activated.some((ab) => ab.zone === "graveyard");

/** Cards to collect evidence N with (CR 701.59a): the fewest that do it, none we'd use from the graveyard; null if there aren't. */
function spareEvidence(s: GameState, pid: PlayerId, n: number, not?: ObjectId, taken: ObjectId[] = []): ObjectId[] | null {
  const keepers = player(s, pid).graveyard.filter((c) => usefulInGraveyard(s, c));
  if (evidenceProblem(s, pid, n, undefined, not, [...taken, ...keepers])) return null;
  return autoEvidence(s, pid, n, not, [...taken, ...keepers]);
}

/** Does the spell do more if evidence was collected for it (CR 701.59c): a part of it, its enters trigger, or a lower cost? */
function wantsEvidence(c: CompiledCard): boolean {
  if (c.evidenceReduction) return true;
  return JSON.stringify([c.spell ?? null, c.triggers]).includes('"kind":"evidence"') || c.triggers.some((t) => t.ifEvidence);
}

/** Kicker choices to try, most kicked first, ending with not kicking it. */
function kickOptions(s: GameState, pid: PlayerId, id: string, free: boolean): number[][] {
  const k = compileCard(defOf(s, obj(s, id))).kicker;
  if (!k) return [[]];
  if (k.multi) {
    const each = manaValue(parseManaCost(k.costs[0]!));
    const spare = availableMana(s, pid) - (free ? 0 : totalWithoutX(s, pid, id));
    const most = each > 0 ? Math.min(6, Math.floor(spare / each)) : 0;
    return Array.from({ length: most + 1 }, (_, i) => Array(most - i).fill(0) as number[]);
  }
  return k.costs.length === 2 ? [[0, 1], [0], [1], []] : [[0], []];
}

/**
 * What to pay a spell's additional costs with (CR 601.2b), or null if it isn't worth it: only tokens
 * and cheap permanents get sacrificed, never the commander or something it targets; the least useful
 * cards get discarded; life is paid only with plenty to spare.
 */
function chooseExtraCosts(s: GameState, pid: PlayerId, id: string, targets: TargetChoice[], via?: CastFromGraveyardKind, alt?: AltCostKind, costOr?: number, x = 0): CostChoices | null {
  const out: CostChoices = {};
  const targeted = new Set(targets.flatMap((t) => (t.kind === "none" ? [] : [t.id])));
  const d = defOf(s, obj(s, id));
  for (const c of castExtraCosts(d, { via, alt, costOr }, x, s, pid)) {
    if (c.kind === "revealHand") continue; // nothing to choose
    if (c.kind === "giveLife") {
      // Invigorate: the opponent with the least life gets it (the least threat to us); "each other player": nothing to choose.
      if (c.each) continue;
      const to = opponents(s, pid).filter((q) => canGainLife(s, q)).sort((a, b) => player(s, a).life - player(s, b).life)[0];
      if (to === undefined) return null;
      out.lifeTo = to;
      continue;
    }
    if (!c.n && "x" in c && c.x) continue; // "pay X life" with X = 0
    if (c.kind === "returnToHand" && c.unblockedAttacker) {
      // Sneak: the least valuable unblocked attacker that isn't our commander (see chooseSneak).
      const pool = returnCandidates(s, pid, c)
        .map((x) => obj(s, x))
        .filter((o) => !o.isCommander)
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
      if (pool.length < c.n) return null;
      out.returnToHand = pool.slice(0, c.n).map((o) => o.id);
    } else if (c.kind === "returnToHand") {
      // A Borderpost's basic land: a tapped one (its mana may already be paying for this), and only with lands to spare.
      const pool = returnCandidates(s, pid, c)
        .map((x) => obj(s, x))
        .filter((o) => !targeted.has(o.id))
        .sort((a, b) => Number(b.tapped) - Number(a.tapped));
      if (pool.length < c.n || lands(s, pid) < 4) return null;
      out.returnToHand = pool.slice(0, c.n).map((o) => o.id);
    } else if (c.kind === "tap") {
      // "Tap an untapped creature you control" (Lashknife): the least valuable ones, not something it targets.
      const pool = tapCostCandidates(s, pid, obj(s, id), c)
        .map((x) => obj(s, x))
        .filter((o) => !targeted.has(o.id) && o.attacking === undefined)
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
      if (pool.length < c.n) return null;
      out.tap = pool.slice(0, c.n).map((o) => o.id);
    } else if (c.kind === "exileFromHand") {
      // Pitching cards (Force of Will): the cheapest that fit, and only with another card left in hand after.
      const others = player(s, pid).hand.filter((x) => x !== id);
      const fits = others.filter((x) => !c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))).sort((a, b) => mv(s, a) - mv(s, b));
      if (fits.length < c.n || others.length < c.n + 1) return null;
      out.exileFromHand = fits.slice(0, c.n);
    } else if (c.kind === "reveal") {
      const fits = player(s, pid).hand.filter((x) => x !== id && printedMatches(c.filter, defOf(s, obj(s, x))));
      if (fits.length < c.n) return null;
      out.reveal = fits.slice(0, c.n);
    }
    else if (c.kind === "payLife") {
      if (player(s, pid).life < c.n + 15) return null;
    } else if (c.kind === "sacrifice") {
      const pool = sacrificePool(s, pid, c, targeted, alt);
      if (pool.length < c.n) return null;
      out.sacrifice = pool.slice(0, c.n).map((o) => o.id);
    } else if (c.kind === "discard" && c.oneOf) {
      // Foil's "an Island card and another card": the cheapest of each, with a card left in hand after.
      const others = player(s, pid).hand.filter((x) => x !== id).sort((a, b) => mv(s, a) - mv(s, b));
      const first = others.find((x) => printedMatches(c.oneOf!, defOf(s, obj(s, x))));
      if (!first || others.length < c.n + 1) return null;
      out.discard = [first, ...others.filter((x) => x !== first).slice(0, c.n - 1)];
    } else if (c.kind === "discard" && c.filter) {
      // Retrace: a spare land card, once we have enough lands out.
      const fits = player(s, pid).hand.filter((x) => x !== id && printedMatches(c.filter!, defOf(s, obj(s, x))));
      if (fits.length < c.n || lands(s, pid) < 5) return null;
      out.discard = fits.slice(0, c.n);
    } else if (c.kind === "discard" && c.random) {
      // At random: worth it only with cards to spare.
      if (player(s, pid).hand.filter((x) => x !== id).length < c.n + 2) return null;
    } else if (c.kind === "discard") {
      const others = player(s, pid).hand.filter((x) => x !== id);
      if (others.length < c.n) return null;
      out.discard = chooseDiscards(s, pid, c.n, id);
    } else if (c.kind === "collectEvidence") {
      // Conspiracy Unraveler's alternative cost: the fewest cards that make it up.
      const ids = spareEvidence(s, pid, c.n, id, out.exileCards);
      if (!ids) return null;
      out.collect = ids;
    } else {
      const pool = player(s, pid).graveyard.filter((x) => x !== id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))));
      if (pool.length < c.n) return null;
      out.exileCards = pool.slice(0, c.n);
    }
  }
  return out;
}

/**
 * What we'd sacrifice for a spell's cost: tokens and cheap permanents (lands once we have plenty), never our commander
 * or something the spell targets; the least valuable first. Emerge: a small creature that cost a lot, as its mana
 * value comes off the cost (CR 702.119a).
 */
function sacrificePool(s: GameState, pid: PlayerId, c: Extract<AdditionalCost, { kind: "sacrifice" }>, targeted: Set<string | number>, alt?: AltCostKind): GameObject[] {
  const value = (o: GameObject) => (o.isToken ? 0 : 1 + mv(s, o.id));
  return s.battlefield
    .map((x) => obj(s, x))
    .filter((o) => controllerOf(s, o) === pid && !o.isCommander && !targeted.has(o.id) && objectMatches(s, c.filter, o, pid, false))
    .filter((o) => (alt === "emerge" ? o.isToken || power(s, o) <= 3 : value(o) <= 3 || (objIsType(s, o, "Land") && lands(s, pid) >= 7)))
    .sort((a, b) => (alt === "emerge" ? mv(s, b.id) - mv(s, a.id) : value(a) - value(b)));
}

/**
 * The Ring tempts us (CR 701.54a): our best creature, but not one the legend rule would then make us lose (another
 * legendary permanent of ours has its name, CR 704.5j), and not one whose "if you chose a creature other than ~" ability would then miss.
 */
function chooseRingBearer(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId {
  const score = (id: ObjectId) => {
    const o = obj(s, id);
    const c = characteristics(s, o);
    const clash = !c.supertypes.includes("Legendary") && s.battlefield.some((x) => {
      const other = characteristics(s, obj(s, x));
      return x !== id && other.controller === pid && other.name === c.name && other.supertypes.includes("Legendary");
    });
    const wantsOther = abilitiesOf(s, o).triggers.some((t) => t.event === "ringTemptsYou" && t.ifOtherBearer);
    return worth(s, pid, o) - (clash ? 1000 : 0) - (wantsOther ? 100 : 0);
  };
  return [...options].sort((a, b) => score(b) - score(a))[0]!;
}

/**
 * Which of our permanents to sacrifice or return to hand: the least valuable. Returning a land, a
 * tapped one that's already been used this turn, and not the one that asked for it if we can help it.
 */
function choosePicks(s: GameState, pid: PlayerId, options: ObjectId[], count: number, action: PickAction, counter?: CounterKind): ObjectId[] {
  const self = s.resolving?.item.sourceId;
  // Good counters go on the best creature; stun and -1/-1 counters on the least useful one.
  if (action === "populate" || action === "pair" || (action === "counters" && (counter === "+1/+1" || counter === "shield" || counter === "loyalty"))) return [...options].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))).slice(0, count);
  const cost = (id: ObjectId) => {
    const o = obj(s, id);
    return worth(s, pid, o) + (action === "bounce" && id === self ? 10 : 0) - (action === "bounce" && o.tapped ? 1 : 0);
  };
  return [...options].sort((a, b) => cost(a) - cost(b)).slice(0, count);
}

/**
 * Devour (any number) and exploit (none or one): sacrifice only what's worth less than what we get. Devour N gives
 * +N/+N for each, so tokens up to that size go; exploit's payoff is worth a small token or a small creature.
 */
function chooseOptionalSacrifices(s: GameState, pid: PlayerId, pend: Extract<PendingDecision, { kind: "pickPermanents" }>): ObjectId[] {
  const ok = pend.options.map((id) => obj(s, id)).filter((o) => !o.isCommander && !objIsType(s, o, "Land"));
  if (pend.objectId) {
    const n = compileCard(defOf(s, obj(s, pend.objectId))).devour?.n;
    const per = typeof n === "number" ? n : 2;
    return ok.filter((o) => o.isToken && worth(s, pid, o) <= 2 * per).map((o) => o.id).slice(0, pend.count);
  }
  const cheapest = ok.sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
  return cheapest && (cheapest.isToken || worth(s, pid, cheapest) <= 3) ? [cheapest.id] : [];
}

const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;

/** Explore revealed a nonland card: keep it on top if we could cast it soon, otherwise mill it. */
function millExplored(s: GameState, pid: PlayerId, card: string): boolean {
  const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  return manaValue(parseManaCost(defOf(s, obj(s, card)).manaCost)) > lands + 1;
}

/** Provoking `target` into blocking `attacker` is good for us: it dies in the block, and ours doesn't. */
function provokeGood(s: GameState, attacker: GameObject, target: GameObject): boolean {
  const deadly = (a: GameObject) => objHasKeyword(s, a, "Deathtouch");
  return (power(s, attacker) >= toughness(s, target) || deadly(attacker)) && power(s, target) < toughness(s, attacker) && !deadly(target);
}

function wantsMay(s: GameState, pid: PlayerId): boolean {
  const r = s.resolving;
  const e = r?.body.effects[r.next];
  if (!r || e?.type !== "may") return true;
  // "Sacrifice it unless you discard a creature card", "discard two cards unless you discard an artifact card": the
  // smaller loss (only asked when it can be done).
  if (e.keep && e.otherwise?.some((x) => (x.type === "sacrifice" || x.type === "exile") && x.what.ref === "self") && e.effects.every((x) => x.type === "discard" || x.type === "pick")) return true;
  if (e.keep && e.otherwise?.length === 1 && e.otherwise[0]!.type === "discard" && e.effects.length === 1 && e.effects[0]!.type === "discard") return true;
  const provoke = e.effects.find((x) => x.type === "mustBlockSource");
  if (provoke?.type === "mustBlockSource" && provoke.what.ref === "target") {
    const t = r.item.targets?.[provoke.what.index];
    const src = r.item.sourceId ? s.objects[r.item.sourceId] : undefined;
    return !!src && t?.kind === "object" && !!s.objects[t.id] && provokeGood(s, src, obj(s, t.id));
  }
  const harm = harmfulTargets(r.body);
  const targets = r.item.targets ?? [];
  let v = 0;
  // "You may discard a card. If you do, draw a card": what follows counts too.
  const then = r.body.effects[r.next + 1];
  const follows = then?.type === "if" && then.cond.kind === "youDid" ? then.effects : [];
  for (const inner of allEffects([...e.effects, ...follows])) {
    if (inner.type === "may") continue;
    if (inner.type === "becomeCopy") {
      v += copyGain(s, pid, inner) >= 0 ? 1 : -2;
      continue;
    }
    const i = targetIndexOf(inner);
    if (i !== undefined) {
      const t = targets[i];
      if (!t || t.kind === "none" || !r.legal[i]) continue;
      v += harm[i] !== isMine(s, pid, t) ? 1 : -1;
    } else if ((inner.type === "loseLife" || inner.type === "discard") && "who" in inner && inner.who.ref === "you") v -= 1;
    else if (inner.type === "pick" && inner.action === "bounce" && inner.who.ref === "you") v -= 1; // our own permanent back to hand
    else if (inner.type === "moveCounter") {
      // Graft: only onto our own creatures.
      const to = r.item.subject && s.objects[r.item.subject.id];
      if (!to || controllerOf(s, to) !== pid) v -= 2;
    }
    else v += 1;
  }
  return v >= 0;
}

/** A permanent's printed worth, to compare what a copy effect would make it: size for creatures, else mana value. */
const defWorth = (d: CardDef) => (isType(d, "Creature") ? 3 * basePower(d) + baseToughness(d) : manaValue(parseManaCost(d.manaCost)));

/**
 * How much the resolving ability's source gains by becoming a copy ("you may have ~ become a copy of ..."): worse
 * when the copy is smaller, or a legendary permanent we already control (the legend rule, CR 704.5j).
 */
function copyGain(s: GameState, pid: PlayerId, e: Extract<Effect, { type: "becomeCopy" }>): number {
  const item = s.resolving!.item;
  const me = item.sourceId ? s.objects[item.sourceId] : undefined;
  if (e.what.ref !== "self" || me?.zone !== "battlefield") return 0;
  const t = e.of.ref === "target" ? item.targets?.[e.of.index] : undefined;
  const sub = item.subject && s.objects[item.subject.id];
  const d =
    t?.kind === "object"
      ? defOf(s, obj(s, t.id))
      : e.of.ref === "subject" && sub
        ? defOf(s, sub)
        : e.of.ref === "subjectCard" && item.lki?.copyKey
          ? s.cards[item.lki.copyKey]
          : undefined;
  if (!d) return 0;
  const legend = d.supertypes.includes("Legendary") && s.battlefield.some((id) => id !== me.id && controllerOf(s, obj(s, id)) === pid && defOf(s, obj(s, id)).name === d.name);
  return legend ? -1 : defWorth(d) - defWorth(defOf(s, me));
}

/**
 * Pick modes for a modal body (CR 700.2): the most useful modes that have sensible targets,
 * as many as allowed. Returns null when not enough modes are worth choosing, unless
 * `forced` (a trigger has to choose), in which case any legal modes fill the gap.
 */
export function chooseModes(s: GameState, pid: PlayerId, body: AbilityBody, forced = false, sourceId?: string): { modes: number[]; ranked: number[] } | null {
  const m = body.modal;
  if (!m) return { modes: [], ranked: [] };
  const legal = legalModes(s, body, pid, sourceId ? sourceQuality(s, sourceId) : undefined);
  const scored = m.modes
    .map((mode, i) => {
      if (!legal[i]) return null;
      const targets = mode.targets.length ? chooseTargets(s, pid, mode, false, sourceId) : [];
      return targets ? { i, value: modeValue(s, pid, mode, targets) } : null;
    })
    .filter((x): x is { i: number; value: number } => !!x && x.value > 0)
    .sort((a, b) => b.value - a.value);
  let modes = scored.slice(0, m.max).map((x) => x.i);
  if (modes.length < m.min) {
    if (!forced) return null;
    const rest = legal.flatMap((ok, i) => (ok && !modes.includes(i) ? [i] : []));
    modes = [...modes, ...rest].slice(0, m.min);
  }
  if (!modes.length && m.min > 0) return null;
  // `ranked`: the same modes, most useful first.
  return { ranked: [...modes], modes: modes.sort((a, b) => a - b) };
}

/** How much a permanent matters, for weighing effects on many at once. */
function worth(s: GameState, pid: PlayerId, o: GameObject): number {
  const c = characteristics(s, o);
  if (c.types.includes("Creature")) return Math.max(1, power(s, o) + toughness(s, o)) + (o.isCommander ? 6 : 0) + (o.isToken ? 0 : 1);
  if (c.types.includes("Land")) return 3;
  return 1 + mv(s, o.id);
}

/**
 * What effects on groups of permanents ("destroy all creatures", "each creature gets -1/-1", "untap all
 * creatures you control") do for us: the worth of what they hurt of the opponents' and help of ours,
 * less the reverse. Null if the body has none. `card` is the source, for guessing what we'd choose.
 */
function groupValue(s: GameState, pid: PlayerId, body: AbilityBody, card?: CardDef, sourceId?: string): number | null {
  let v: number | null = null;
  const chosen = card ? guessChosen(s, pid, card) : undefined;
  const group = (r: ObjRef) => {
    if (r.ref !== "each") return [];
    const filter = bindChosen(r.filter, sourceId ? (obj(s, sourceId).chosen ?? chosen) : chosen);
    return s.battlefield.map((id) => obj(s, id)).filter((o) => !(r.other && o.id === sourceId) && objectMatches(s, filter, o, pid, false));
  };
  const add = (objs: GameObject[], harmful: boolean, scale = (_: GameObject) => 1) => {
    for (const o of objs) v = (v ?? 0) + (controllerOf(s, o) === pid ? -1 : 1) * (harmful ? 1 : -1) * worth(s, pid, o) * scale(o);
  };
  for (const e of allEffects(body.effects)) {
    if (e.type === "damage") {
      const amount = estimate(e.amount);
      if (e.to.ref === "each") add(group(e.to), true, (o) => (lethalDamage(s, o) <= amount ? 1 : 0.2));
      // Hitting every player costs us as much as any one opponent; it's worth it against several.
      if (e.to.ref === "eachPlayer") v = (v ?? 0) + (amount * (opponents(s, pid).length - 2)) / 2;
      continue;
    }
    if (!("what" in e) || typeof e.what !== "object" || e.what.ref !== "each") continue;
    const objs = group(e.what);
    if (e.type === "destroy" || e.type === "exile" || e.type === "bounce" || e.type === "tap" || e.type === "putInLibrary" || e.type === "phaseOut") add(objs, true);
    else if (e.type === "untap") add(objs.filter((o) => o.tapped), false, () => 0.5);
    else if (e.type === "counters") add(objs, harmfulCounter(e.counter), () => estimate(e.n) / 2);
    else if (e.type === "continuous") add(objs, modsAreHarmful(e.mods), () => 0.5);
    else v = v ?? 0;
  }
  // A group we'd mostly empty of our own things: also nothing gained if both sides are empty.
  return v;
}

/** Which creature type or color a choice would hurt or help: "-1/-1 to the chosen type" is aimed at opponents. */
function choiceHurts(c: CompiledCard): boolean {
  let hurts = false;
  let own = false;
  const visit = (v: unknown, harmful: boolean): void => {
    if (Array.isArray(v)) return v.forEach((x) => visit(x, harmful));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (o.chosen === "notType" || o.chosen === "notColor") own = true;
    else if (typeof o.chosen === "string") ((harmful && o.controller !== "you") || o.controller === "opponent" ? (hurts = true) : (own = true));
    let h = harmful;
    if (typeof o.type === "string") h = ["destroy", "exile", "bounce", "tap", "damage", "putInLibrary"].includes(o.type) || (o.type === "counters" && harmfulCounter(o.counter as string)) || (o.type === "continuous" && modsAreHarmful(o.mods as never));
    if (Array.isArray(o.mods) && "affects" in o) h = modsAreHarmful(o.mods as never);
    for (const [k, x] of Object.entries(o)) if (k !== "chosen") visit(x, h);
  };
  visit([c.spell, c.triggers, c.activated, c.statics], false);
  return hurts && !own;
}

/** The creature type or color we'd choose for this card (see chooseOption). */
function guessChosen(s: GameState, pid: PlayerId, card: CardDef): Chosen | undefined {
  const c = compileCard(card);
  const kinds = new Set<ChoiceKind>([...(c.entersChoose ?? []).map((x) => x.what), ...allEffects([...(c.spell?.effects ?? []), ...c.triggers.flatMap((t) => t.body.effects), ...c.activated.flatMap((a) => a.body.effects)]).flatMap((e) => (e.type === "choose" ? [e.choice] : []))]);
  if (!kinds.size) return undefined;
  let out: Chosen = {};
  if (kinds.has("creatureType")) out = { ...out, type: chooseOption(s, pid, "creatureType", card, choiceOptions("creatureType")) };
  if (kinds.has("color")) {
    const name = chooseOption(s, pid, "color", card, choiceOptions("color"));
    out = { ...out, color: (Object.keys(COLOR_NAMES) as Color[]).find((k) => COLOR_NAMES[k] === name) };
  }
  return out;
}

/**
 * Name a creature type or color. Against opponents ("creatures of the chosen type get -1/-1"): what
 * they have most of. Otherwise our own most common creature type, or the color we use most (for
 * mana, the colors our commander needs).
 */
function chooseOption(s: GameState, pid: PlayerId, what: ChoiceKind, card: CardDef | undefined, options: string[]): string {
  if (what === "basicLandType") return chooseLandType(s, pid, options);
  const c = card ? compileCard(card) : undefined;
  // Protection from the chosen color is against what opponents have, above all the spell or ability
  // that's about to resolve against us.
  const protects = !!c && what === "color" && JSON.stringify(c).includes(CHOSEN_PROTECTION);
  const hurts = protects || (c ? choiceHurts(c) : false);
  const tally = new Map<string, number>();
  const count = (name: string, n = 1) => options.includes(name) && tally.set(name, (tally.get(name) ?? 0) + n);
  const theirs = (o: GameObject) => (hurts ? controllerOf(s, o) !== pid : controllerOf(s, o) === pid);
  if (protects)
    for (const item of s.stack)
      if (item.controller !== pid) sourceQuality(s, item.sourceId ?? item.objectId, item.sourceCardId).colors.forEach((col) => count(COLOR_NAMES[col as Color], 10));
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (!theirs(o)) continue;
    const ch = characteristics(s, o);
    if (what === "creatureType") {
      if (ch.types.includes("Creature")) ch.subtypes.forEach((st) => count(st, 2));
    } else ch.colors.forEach((col) => count(COLOR_NAMES[col], 2));
  }
  if (!hurts) {
    // Cards still to come count too: the hand, and the commander's colors for mana.
    for (const id of [...player(s, pid).hand, ...player(s, pid).command]) {
      const d = defOf(s, obj(s, id));
      if (what === "creatureType") {
        if (d.types.includes("Creature")) d.subtypes.forEach((st) => count(st));
      } else (c?.mana.length ? d.colorIdentity : d.colors).forEach((col) => count(COLOR_NAMES[col], c?.mana.length ? 3 : 1));
    }
  }
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? options[0]!;
}

/** Rough value of one mode for a bot: removal and card advantage first. */
function modeValue(s: GameState, pid: PlayerId, body: AbilityBody, targets: TargetChoice[]): number {
  const harm = harmfulTargets(body);
  let v = groupValue(s, pid, body) ?? 0;
  for (const e of body.effects) {
    switch (e.type) {
      case "destroy":
      case "exile":
        v += e.what.ref === "target" ? 10 : 0;
        break;
      case "bounce":
        v += e.what.ref === "target" ? 5 : 0;
        break;
      case "phaseOut":
        v += e.what.ref === "target" ? 3 : 0;
        break;
      case "putOntoBattlefield":
        v += 8;
        break;
      case "putInLibrary":
        v += 1;
        break;
      case "exileGraveyard":
        v += 2;
        break;
      case "shuffleIntoLibrary":
        v += e.what.ref === "target" ? 8 : 0;
        break;
      case "may":
        v += Math.max(0, modeValue(s, pid, { ...body, effects: e.effects }, targets));
        break;
      case "damage": {
        const i = "index" in e.to ? e.to.index : -1;
        const t = targets[i];
        if (t?.kind === "object") v += lethalDamage(s, obj(s, t.id)) <= estimate(e.amount) ? 8 : 0;
        else if (e.to.ref !== "each" && e.to.ref !== "eachPlayer") v += e.to.ref === "eachOpponent" ? 2 * estimate(e.amount) : estimate(e.amount);
        break;
      }
      case "draw":
        v += e.who.ref === "you" ? 3 * estimate(e.n) : 0;
        break;
      case "gainLife":
        v += e.who.ref === "you" ? estimate(e.n) / 2 : 0;
        break;
      case "loseLife":
        v += e.who.ref === "you" ? -estimate(e.n) / 2 : estimate(e.n);
        break;
      case "createToken":
        v += e.who.ref === "you" ? 3 * estimate(e.n) : 0;
        break;
      case "counters":
        v += e.counter === "+1/+1" ? 2 * estimate(e.n) : 3 * estimate(e.n);
        break;
      case "counterSpell":
        v += 9;
        break;
      case "discard":
        v += e.who.ref === "you" ? -2 * estimate(e.n) : 3 * estimate(e.n);
        break;
      case "takeFromHand":
        v += 4;
        break;
      case "scry":
      case "surveil":
        v += estimate(e.n);
        break;
      case "fight":
      case "bite":
        v += 7;
        break;
      case "continuous":
        v += e.what.ref === "target" && harm[e.what.index] ? 5 : 2;
        break;
      default:
        v += 1;
    }
  }
  return v;
}

/** Which cards to discard: extra lands once we have enough, otherwise what we're furthest from casting. */
function chooseDiscards(s: GameState, pid: PlayerId, count: number, except?: string, filter?: TargetSpec): string[] {
  const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  const keepScore = (id: string) => {
    const d = defOf(s, obj(s, id));
    if (isType(d, "Land")) return lands >= 6 ? 0 : 10 - lands;
    return 8 - Math.max(0, mv(s, id) - lands);
  };
  return player(s, pid)
    .hand.filter((id) => id !== except && (!filter || printedMatches(filter, defOf(s, obj(s, id)))))
    .sort((a, b) => keepScore(a) - keepScore(b))
    .slice(0, count);
}

/** Scry/surveil: keep lands while we need them and spells we can cast soon. */
function wantOnTop(s: GameState, pid: PlayerId, id: string): boolean {
  const lands = s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;
  return isType(defOf(s, obj(s, id)), "Land") ? lands < 6 : mv(s, id) <= lands + 2;
}

const objIsLegendary = (s: GameState, id: ObjectId) => s.objects[id]?.zone === "battlefield" && characteristics(s, obj(s, id)).supertypes.includes("Legendary");

/** The least valuable of these targets: what a copy effect should change ("target Shapeshifter becomes a copy of ..."). */
function worst(s: GameState, pid: PlayerId, pool: ChosenTarget[]): ChosenTarget {
  return [...pool].sort((a, b) => targetWorth(s, pid, a, false, 0) - targetWorth(s, pid, b, false, 0))[0]!;
}

/** How much a target is worth aiming at: for harmful effects, the biggest threat; for helpful ones, the most valuable. */
function targetWorth(s: GameState, pid: PlayerId, t: ChosenTarget, harmful: boolean, damage: number): number {
  if (t.kind === "player") return harmful ? 100 - player(s, t.id).life : player(s, t.id).life === 0 ? 0 : 1;
  // On the stack: a spell before an ability, the newest first (what a counterspell usually answers).
  if (t.kind === "stack") {
    const i = s.stack.findIndex((x) => x.id === t.id);
    return 50 + (s.stack[i]?.kind === "spell" ? 10 : 0) + Math.max(0, i) / 100;
  }
  const o = obj(s, t.id);
  const d = defOf(s, o);
  // A card in a graveyard: what it would be worth back in play.
  if (o.zone !== "battlefield") return manaValue(parseManaCost(d.manaCost)) + (isType(d, "Creature") ? 2 * (Number.parseInt(d.power ?? "0", 10) || 0) : 0) + (o.isCommander ? 10 : 0);
  if (!objIsType(s, o, "Creature")) return 5 + manaValue(parseManaCost(d.manaCost)) - (harmful && wardCosts(s, pid, [t]).length ? 15 : 0);
  let n = power(s, o) * 3 + toughness(s, o) + (o.isCommander ? 10 : 0);
  if (harmful && damage > 0) n += lethalDamage(s, o) <= damage ? 50 : -100; // only burn what dies
  if (!harmful && o.attacking !== undefined) n += 20;
  if (harmful && wardCosts(s, pid, [t]).length) n -= 15; // ward makes it cost more
  return n;
}

function best(s: GameState, pid: PlayerId, pool: ChosenTarget[], harmful: boolean, damage: number): ChosenTarget {
  // Burn goes face only when it can't kill anything worthwhile.
  return [...pool].sort((a, b) => targetWorth(s, pid, b, harmful, damage) - targetWorth(s, pid, a, harmful, damage))[0]!;
}

/** How many times a bot activates one ability in a turn at most, so it can't go round a loop forever. */
const BOT_LOOP_LIMIT = 8;

function chooseActivation(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      // Mana abilities are for paying costs (autopay), not used on their own: the mana would just empty.
      if (ab.mana) continue;
      // Keep our permanents (but cash in Food and Clues), and avoid free loops.
      const cashIn = ab.sacrificeSelf && o.isToken && !objIsType(s, o, "Creature");
      // A cost of nothing, "{0}" included, could be paid over and over.
      // Removing named counters (spore, charge) runs out; removing +1/+1 counters shrinks the creature, so not for free.
      const freeCost = !ab.tap && !manaValue(parseManaCost(ab.manaCost)) && !parseManaCost(ab.manaCost).hasX && !ab.costs?.length && !(ab.removeCounters && !/^[+-]1\/[+-]1$/.test(ab.removeCounters.counter));
      if ((ab.sacrificeSelf && !cashIn) || freeCost || ab.station) continue;
      // Level up (CR 702.87a) past the last level symbol does nothing more.
      if (ab.body.effects.some((e) => e.type === "counters" && e.counter === "level") && (o.counters.level ?? 0) >= lastStriation(s, o, "level")) continue;
      // Bots don't propose shortcuts (CR 732.2a): one that has found a loop goes round it only so many times a turn.
      if ((o.activatedThisTurn?.filter((n) => n === i).length ?? 0) >= BOT_LOOP_LIMIT) continue;
      if (o.attachedTo && ab.body.effects.some((e) => e.type === "attach")) continue; // already equipped
      if (ab.body.effects.some((e) => e.type === "unattachSelf")) continue; // reconfigured Equipment stays on
      // An Incubator becomes a 0/0 Phyrexian: only worth it with +1/+1 counters on it (CR 701.53b).
      if (ab.body.effects.some((e) => e.type === "transformSelf") && !((o.counters["+1/+1"] ?? 0) > 0)) continue;
      if (regenerates(s, o, ab.body) !== undefined) continue; // only when something threatens it (chooseRegeneration)
      if (ab.body.effects.some((e) => e.type === "redirectNext")) continue; // only in a combat it would lose (chooseRedirect)
      if (shieldBody(ab.body)) continue; // only when damage is coming (chooseDamageShield)
      // Phasing out our own permanents ("~ phases out") only takes them away for a turn cycle.
      if (allEffects(ab.body.effects).some((e) => e.type === "phaseOut" && e.what.ref !== "target")) continue;
      if (doesNothingNow(s, id, ab.body)) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      const modes = ab.body.modal ? chooseModes(s, pid, ab.body, false, id)?.modes : undefined;
      if (ab.body.modal && !modes) continue;
      const body = withModes(ab.body, modes);
      if ((groupValue(s, pid, body, defOf(s, o), id) ?? 1) <= 0) continue;
      // An X ability: the biggest X we can pay for (never 0).
      const cost = parseManaCost(ab.manaCost);
      const xs = cost.hasX ? xChoices(availableMana(s, pid) - (ab.tap ? 1 : 0) - manaValue(cost), xCount(cost)) : [undefined];
      let plan: Action[] | null = null;
      for (const x of xs) {
        const targets = body.targets.length ? chooseTargets(s, pid, body, false, id, x) : [];
        if (!targets) continue;
        const costs = abilityCosts(s, pid, o, ab, targets);
        if (costs === null) continue;
        plan = planActivate(s, pid, id, i, targets.length ? targets : undefined, modes, undefined, x, costs);
        if (plan) break;
      }
      // Not worth sacrificing a Treasure to cash in a Food or Clue.
      if (cashIn && plan?.some((a) => a.type === "activateMana" && manaActionAbility(s, a)?.sacrificeSelf)) continue;
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Ninjutsu (CR 702.49a) once blockers are declared: swap the least valuable unblocked attacker (a token, or
 * anything smaller than the ninja) for the ninja, when the stack is empty.
 */
function chooseNinjutsu(s: GameState, pid: PlayerId): Action[] | null {
  if (s.activePlayer !== pid || s.step !== "declareBlockers" || s.stack.length) return null;
  for (const id of player(s, pid).hand) {
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      const cost = ab.zone === "hand" ? ab.costs?.find((c) => c.kind === "returnToHand") : undefined;
      if (!cost || cost.kind !== "returnToHand") continue;
      const d = defOf(s, obj(s, id));
      const ninja = (Number.parseInt(d.power ?? "0", 10) || 0) + (Number.parseInt(d.toughness ?? "0", 10) || 0);
      const pool = returnCandidates(s, pid, cost)
        .map((x) => obj(s, x))
        .filter((x) => !x.isCommander && (x.isToken || worth(s, pid, x) < ninja))
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
      if (!pool.length) continue;
      const plan = planActivate(s, pid, id, i, undefined, undefined, undefined, undefined, { returnToHand: [pool[0]!.id] });
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Sneak (CR 702.190a) once blockers are declared, with the stack empty: trade the least valuable unblocked attacker (a
 * token, or anything worth less than the card) for the card, which costs less this way.
 */
function chooseSneak(s: GameState, pid: PlayerId): Action[] | null {
  if (s.activePlayer !== pid || s.step !== "declareBlockers" || s.stack.length) return null;
  const me = player(s, pid);
  for (const id of [...me.hand, ...me.command]) {
    const d = defOf(s, obj(s, id));
    const sneak = altCost(d, "sneak");
    const cost = sneak?.costs?.find((c) => c.kind === "returnToHand");
    if (!sneak || cost?.kind !== "returnToHand") continue;
    const value = isType(d, "Creature") ? (Number.parseInt(d.power ?? "0", 10) || 0) + (Number.parseInt(d.toughness ?? "0", 10) || 0) : manaValue(parseManaCost(d.manaCost));
    const ok = returnCandidates(s, pid, cost).some((x) => !obj(s, x).isCommander && (obj(s, x).isToken || worth(s, pid, obj(s, x)) < value));
    if (!ok) continue;
    const plan = castPlan(s, pid, id, false, undefined, "sneak");
    if (plan) return plan;
  }
  return null;
}

function chooseUnearth(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of player(s, pid).graveyard) {
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.zone !== "graveyard") continue;
      // Scavenge needs a creature to grow (CR 702.97a).
      const targets = ab.body.targets.length ? chooseTargets(s, pid, ab.body, false, id) : undefined;
      if (ab.body.targets.length && !targets) continue;
      const plan = planActivate(s, pid, id, i, targets ?? undefined);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Regenerate a creature that's about to be destroyed (CR 701.19a): one an opponent's spell or
 * ability on top of the stack is aimed at, or one in a combat it would lose, once blocks are
 * declared and before damage. One shield is enough.
 */
/**
 * What to sacrifice or discard to pay for an activated ability (CR 602.2b): only spare things, tokens
 * that aren't creatures we'd miss, or lands once we have plenty, and cards when our hand is full.
 * Undefined when it costs none of that; null when we'd rather not pay.
 */
function abilityCosts(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, targets: TargetChoice[], keep?: ObjectId): CostChoices | null | undefined {
  if (!ab.costs?.length) return undefined;
  const out: CostChoices = {};
  const targeted = new Set(targets.flatMap((t) => (t.kind === "none" ? [] : [t.id])));
  for (const c of ab.costs) {
    if (c.kind === "sacrifice") {
      const pool = s.battlefield
        .map((x) => obj(s, x))
        .filter((x) => controllerOf(s, x) === pid && x.id !== o.id && x.id !== keep && !x.isCommander && !targeted.has(x.id) && !out.sacrifice?.includes(x.id))
        .filter((x) => objectMatches(s, c.filter, x, pid, false))
        .filter((x) => (objIsType(s, x, "Land") ? lands(s, pid) >= 8 : x.isToken && worth(s, pid, x) <= 3))
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
      if (pool.length < c.n) return null;
      out.sacrifice = [...(out.sacrifice ?? []), ...pool.slice(0, c.n).map((x) => x.id)];
    } else if (c.kind === "tap") {
      // Tap creatures only once they're done for the turn (after our combat), anything else any time; the least
      // valuable first, and never one already paying a cost or a target.
      const late = s.activePlayer === pid && ["main2", "end"].includes(s.step);
      const pool = tapCostCandidates(s, pid, o, c)
        .map((x) => obj(s, x))
        .filter((x) => x.id !== keep && !targeted.has(x.id) && !out.sacrifice?.includes(x.id) && !out.tap?.includes(x.id))
        .filter((x) => late || !objIsType(s, x, "Creature"))
        .filter((x) => !manaAbilitiesOn(s, x).some((m) => m.tap) || late)
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
      if (pool.length < c.n) return null;
      out.tap = [...(out.tap ?? []), ...pool.slice(0, c.n).map((x) => x.id)];
    } else if (c.kind === "collectEvidence") {
      const ids = spareEvidence(s, pid, c.n);
      if (!ids) return null;
      out.collect = ids;
    } else if (c.kind === "discard" && c.random) {
      if (player(s, pid).hand.length < c.n + 4) return null;
    } else if (c.kind === "discard") {
      const hand = player(s, pid).hand.filter((x) => !c.filter || printedMatches(c.filter, defOf(s, obj(s, x))));
      if (hand.length < c.n || player(s, pid).hand.length < c.n + 4) return null;
      const picks = chooseDiscards(s, pid, player(s, pid).hand.length).filter((x) => hand.includes(x)).slice(0, c.n);
      if (picks.length < c.n) return null;
      out.discard = picks;
    } else return null;
  }
  return out;
}

/**
 * If the ability only regenerates its source or what the source is attached to ("Regenerate enchanted
 * creature"), that permanent (null when it's attached to nothing); undefined for any other ability.
 */
function regenerates(s: GameState, o: GameObject, body: AbilityBody): GameObject | null | undefined {
  if (!body.effects.length || !body.effects.every((e) => e.type === "regenerate" && (e.what.ref === "self" || e.what.ref === "attached"))) return undefined;
  const ref = (body.effects[0] as Extract<Effect, { type: "regenerate" }>).what.ref;
  if (ref === "self") return o;
  return o.attachedTo ? (s.objects[o.attachedTo] ?? null) : null;
}

function chooseRegeneration(s: GameState, pid: PlayerId): Action[] | null {
  const top = s.stack[s.stack.length - 1];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      // The creature it would regenerate: itself, or the one it enchants or equips, if that's ours.
      const c = regenerates(s, o, ab.body);
      if (!c || controllerOf(s, c) !== pid || (c.regenShields ?? 0) > 0) continue;
      const aimedAt = !!top && top.controller !== pid && top.targets?.some((t) => t.kind === "object" && t.id === c.id);
      const foes = s.step === "declareBlockers" && !top ? (c.blocking ? c.blocking : c.attacking !== undefined ? (c.blockedBy ?? []) : []) : [];
      const losing = foes.reduce((n, f) => n + (s.objects[f] ? power(s, obj(s, f)) : 0), 0) >= Math.max(1, lethalDamage(s, c));
      if (!aimedAt && !losing) continue;
      if (abilityProblem(s, pid, id, i) && !/not enough mana/.test(abilityProblem(s, pid, id, i)!)) continue;
      const costs = abilityCosts(s, pid, o, ab, [], c.id);
      if (costs === null) continue;
      const plan = planActivate(s, pid, id, i, undefined, undefined, undefined, undefined, costs);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Redirection shields in a combat (the en-Kor, Daughter of Autumn), once blocks are declared and before damage: when
 * one of our creatures would be dealt lethal combat damage, send 1 more of it at a time to a creature or player of an
 * opponent's if the ability allows it, else to a creature of ours that survives it, until the one in danger survives.
 */
function chooseRedirect(s: GameState, pid: PlayerId): Action[] | null {
  if (s.step !== "declareBlockers" || s.stack.length) return null;
  const foesOf = (c: GameObject) => (c.blocking ? c.blocking : c.attacking !== undefined ? (c.blockedBy ?? []) : []);
  const incoming = (c: GameObject) => foesOf(c).reduce((n, f) => n + (s.objects[f]?.zone === "battlefield" ? power(s, obj(s, f)) : 0), 0);
  const shielded = (c: GameObject) => (c.preventNext ?? 0) + (c.redirectNext ?? []).reduce((n, r) => n + r.n, 0);
  const sentTo = (c: GameObject) =>
    s.battlefield.reduce((n, id) => n + (obj(s, id).redirectNext ?? []).filter((r) => "object" in r.to && r.to.object === c.id).reduce((a, r) => a + r.n, 0), 0);
  const inDanger = (c: GameObject) => objIsType(s, c, "Creature") && incoming(c) + sentTo(c) - shielded(c) >= Math.max(1, lethalDamage(s, c));
  // A creature of ours that can take one more damage and live; theirs is better.
  const spare = (c: GameObject) => objIsType(s, c, "Creature") && incoming(c) + sentTo(c) - shielded(c) + 1 < lethalDamage(s, c) && !objHasKeyword(s, c, "Indestructible");
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      const e = ab.body.effects.length === 1 ? ab.body.effects[0]! : undefined;
      if (e?.type !== "redirectNext" || ab.body.targets.length !== 1 || ab.tap || ab.sacrificeSelf) continue;
      if ((o.activatedThisTurn?.filter((n) => n === i).length ?? 0) >= BOT_LOOP_LIMIT) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      const options = legalTargets(s, ab.body.targets[0]!, pid, undefined, sourceQuality(s, id), id);
      let target: TargetChoice | undefined;
      if (e.from.ref === "self" && inDanger(o)) {
        // Away from it: to an opponent, an opponent's creature, or one of ours that survives it.
        target =
          options.find((t) => t.kind === "player" && t.id !== pid) ??
          options.find((t) => t.kind === "object" && t.id !== id && controllerOf(s, obj(s, t.id)) !== pid && objIsType(s, obj(s, t.id), "Creature")) ??
          options.find((t) => t.kind === "object" && t.id !== id && controllerOf(s, obj(s, t.id)) === pid && spare(obj(s, t.id)));
      } else if (e.to.ref === "self" && spare(o)) {
        // Onto it (Daughter of Autumn): from one of ours in danger.
        target = options.find((t) => t.kind === "object" && t.id !== id && controllerOf(s, obj(s, t.id)) === pid && inDanger(obj(s, t.id)));
      }
      if (!target) continue;
      const costs = abilityCosts(s, pid, o, ab, [target]);
      if (costs === null) continue;
      const plan = planActivate(s, pid, id, i, [target], undefined, undefined, undefined, costs);
      if (plan) return plan;
    }
  }
  return null;
}

/** Damage about to be dealt to a bot or its creatures: an opponent's spell or ability on the stack, or unblocked attackers. */
type DamageThreat =
  | { kind: "stack"; item: StackItem; def: CardDef; source?: GameObject; toMe: number; creatures: GameObject[] }
  | { kind: "combat"; attackers: GameObject[]; toMe: number; creatures: GameObject[] };

function damageThreat(s: GameState, pid: PlayerId): DamageThreat | null {
  const top = s.stack[s.stack.length - 1];
  if (top && top.controller !== pid) {
    const spell = top.kind === "spell" && top.objectId ? s.objects[top.objectId] : undefined;
    const def = spell ? defOf(s, spell) : top.sourceCardId ? s.cards[top.sourceCardId] : undefined;
    const body = top.body ?? (spell ? castingBody(defOf(s, spell)) : undefined);
    if (!def || !body) return null;
    let toMe = 0;
    const creatures: GameObject[] = [];
    for (const e of allEffects(body.effects)) {
      if (e.type !== "damage") continue;
      const n = estimate(e.amount, top.x ?? 0);
      if (e.to.ref === "eachOpponent" || e.to.ref === "eachPlayer") toMe += n;
      for (const [i, t] of (top.targets ?? []).entries()) {
        if (!refCovers(e.to, i)) continue;
        if (t.kind === "player" && t.id === pid) toMe += t.amount ?? n;
        if (t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && controllerOf(s, obj(s, t.id)) === pid && lethalDamage(s, obj(s, t.id)) <= (t.amount ?? n)) creatures.push(obj(s, t.id));
      }
    }
    if (toMe < 3 && !creatures.some((c) => objIsType(s, c, "Creature"))) return null;
    const source = spell ?? (top.sourceId ? s.objects[top.sourceId] : undefined);
    return { kind: "stack", item: top, def, ...(source ? { source } : {}), toMe, creatures };
  }
  if (s.step !== "declareBlockers" || s.stack.length || s.activePlayer === pid) return null;
  const attackers = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking === pid && !o.blockedBy?.length);
  const toMe = attackers.reduce((n, o) => n + Math.max(0, power(s, o)), 0);
  return toMe >= Math.min(4, player(s, pid).life) ? { kind: "combat", attackers, toMe, creatures: [] } : null;
}

/** A body that only prevents or redirects damage this turn (and maybe gains life), which a bot keeps for when damage comes. */
function shieldBody(body: AbilityBody | undefined): boolean {
  if (!body || body.modal) return false;
  return body.effects.some((e) => e.type === "damageRule") && body.effects.every((e) => e.type === "damageRule" || (e.type === "gainLife" && e.who.ref === "you"));
}

/**
 * How much of the threatened damage a damage rule would stop or send elsewhere, roughly: damage to the bot, or the
 * worth of creatures it would save. Redirections only count when the damage can go to any target (an opponent).
 */
function shieldValue(s: GameState, pid: PlayerId, body: AbilityBody, t: DamageThreat, chosen: Chosen | undefined): number {
  let best = 0;
  for (const e of body.effects) {
    if (e.type !== "damageRule") continue;
    const r = e.rule;
    if (r.combat && (r.combat === "only") !== (t.kind === "combat")) continue;
    if (r.redirect && r.redirect.ref !== "anyTarget") continue;
    const me = !r.to || r.to.players === "you" || r.to.players === "all" || (!!r.to.target && r.to.target.ref === "anyTarget");
    const mine = !r.to || (!!r.to.objects && r.to.objects.controller !== "opponent") || !!r.to.target;
    const saved = (cs: GameObject[]) => (mine ? cs.reduce((n, c) => n + worth(s, pid, c), 0) : 0);
    const fits = (spec: TargetSpec, o: GameObject | undefined, d: CardDef) => (o?.zone === "battlefield" ? objectMatches(s, spec, o, pid, false) : printedMatches(spec, d));
    let v = 0;
    if (t.kind === "stack") {
      if (r.by?.choose && !fits(bindChosen(r.by.choose, chosen), t.source, t.def)) continue;
      if (r.by?.filter && !fits(bindChosen(r.by.filter, chosen), t.source, t.def)) continue;
      if (r.by?.target && t.item.kind !== "spell") continue;
      v = (me ? t.toMe : 0) + saved(t.creatures);
    } else {
      if (r.by?.target) continue;
      const hits = t.attackers.filter((a) => (!r.by?.choose || objectMatches(s, bindChosen(r.by.choose, chosen), a, pid, false)) && (!r.by?.filter || objectMatches(s, bindChosen(r.by.filter, chosen), a, pid, false)));
      const powers = hits.map((a) => Math.max(0, power(s, a))).sort((a, b) => b - a);
      // A source of one's choice is one attacker: the biggest.
      v = me ? (r.by?.choose ? (powers[0] ?? 0) : powers.reduce((a, b) => a + b, 0)) : 0;
    }
    if (r.n !== undefined) v = Math.min(v, estimate(r.n));
    best = Math.max(best, v);
  }
  return best;
}

/** Targets for a damage rule answering a threat: the bot itself as what's protected, the threat's controller for where damage is redirected, the threatening spell. */
function shieldTargets(s: GameState, pid: PlayerId, body: AbilityBody, t: DamageThreat, sourceId?: ObjectId): TargetChoice[] | null {
  const out: TargetChoice[] = [];
  const foe = t.kind === "stack" ? t.item.controller : (t.attackers[0] ? controllerOf(s, t.attackers[0]) : undefined);
  for (const [i, spec] of body.targets.entries()) {
    const rules = body.effects.flatMap((e) => (e.type === "damageRule" ? [e.rule] : []));
    const legal = legalTargets(s, spec, pid, undefined, sourceId ? sourceQuality(s, sourceId) : undefined, sourceId);
    const pick = (want: TargetChoice | undefined) => (want && legal.some((x) => sameTarget(x, want)) ? want : undefined);
    let choice: TargetChoice | undefined;
    if (rules.some((r) => r.to?.target && refCovers(r.to.target, i))) choice = pick(t.toMe > 0 ? { kind: "player", id: pid } : t.creatures[0] ? { kind: "object", id: t.creatures[0].id } : undefined);
    else if (rules.some((r) => r.redirect && refCovers(r.redirect, i))) choice = pick(foe !== undefined ? { kind: "player", id: foe } : undefined);
    else if (rules.some((r) => r.by?.target && refCovers(r.by.target, i)) && t.kind === "stack") choice = pick({ kind: "stack", id: t.item.id });
    if (!choice) return null;
    out.push(choice);
  }
  return out;
}

/**
 * Answer damage about to be dealt to us with a spell or ability that prevents or redirects it (CR 615, 614.9): an
 * opponent's damage spell or ability on the stack, or unblocked attackers once blocks are declared. Not when such an
 * effect of ours is already waiting for that damage.
 */
function chooseDamageShield(s: GameState, pid: PlayerId): Action[] | null {
  const t = damageThreat(s, pid);
  if (!t) return null;
  if ((s.damageRules ?? []).some((r) => r.controller === pid && r.turn === s.turn && (t.kind === "combat" || !r.by?.chosen || r.by.chosen.id === t.source?.id))) return null;
  const enough = Math.min(3, player(s, pid).life);
  for (const id of player(s, pid).hand) {
    const d = defOf(s, obj(s, id));
    const body = compileCard(d).spell;
    if (!body || !shieldBody(body) || parseManaCost(d.manaCost).hasX || shieldValue(s, pid, body, t, undefined) < enough) continue;
    const targets = shieldTargets(s, pid, body, t, id);
    const plan = targets && planCast(s, pid, id, targets.length ? targets : undefined, undefined, "auto");
    if (plan && plan[plan.length - 1]!.type === "castSpell") return plan;
  }
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.mana || !shieldBody(ab.body) || parseManaCost(ab.manaCost).hasX) continue;
      const v = shieldValue(s, pid, ab.body, t, o.chosen);
      // Sacrificing the permanent (or a creature) for it only against a lot of damage.
      if (v < enough || ((ab.sacrificeSelf || ab.costs?.some((c) => c.kind === "sacrifice")) && v < 5)) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      const targets = shieldTargets(s, pid, ab.body, t, id);
      if (!targets) continue;
      const costs = abilityCosts(s, pid, o, ab, targets);
      if (costs === null) continue;
      const plan = planActivate(s, pid, id, i, targets.length ? targets : undefined, undefined, undefined, undefined, costs);
      if (plan) return plan;
    }
  }
  return null;
}

/** The source a bot's prevention effect is about (CR 609.7a): the newest opponent's spell or ability on the stack, else the biggest creature attacking it, else the biggest opposing creature. */
function chooseDamageSource(s: GameState, pid: PlayerId, options: string[]): string {
  const score = (key: string) => {
    const o = s.objects[key.split("@")[0]!];
    if (!o) return -1000;
    let onStack = -1;
    s.stack.forEach((x, i) => ((x.kind === "spell" && x.objectId === o.id) || (x.kind === "ability" && x.sourceId === o.id)) && (onStack = i));
    const ctrl = onStack >= 0 ? s.stack[onStack]!.controller : o.zone === "battlefield" ? controllerOf(s, o) : o.owner;
    if (ctrl === pid) return -500;
    let v = onStack >= 0 ? 200 + onStack : 0;
    if (o.zone === "battlefield" && objIsType(s, o, "Creature")) v += Math.max(0, power(s, o)) * (o.attacking === pid ? 10 : 1);
    return v;
  };
  return [...options].sort((a, b) => score(b) - score(a))[0]!;
}

/**
 * Answer an opponent's colored spell or ability aimed at one of our creatures by giving it protection
 * from the color of our choice (CR 702.16b: the spell then has an illegal target): Gods Willing, Mother
 * of Runes. The color is chosen as that resolves (see chooseOption).
 */
function chooseProtection(s: GameState, pid: PlayerId): Action[] | null {
  const top = s.stack[s.stack.length - 1];
  if (!top || top.controller === pid) return null;
  const colors = sourceQuality(s, top.sourceId ?? top.objectId, top.sourceCardId).colors;
  const aimed = (top.targets ?? []).flatMap((t) => (t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && controllerOf(s, obj(s, t.id)) === pid && objIsType(s, obj(s, t.id), "Creature") ? [t.id] : []));
  if (!colors.length || !aimed.length) return null;
  const protects = (body: AbilityBody) => JSON.stringify(body.effects).includes(CHOSEN_PROTECTION);
  const targetsFor = (body: AbilityBody, sourceId: ObjectId): TargetChoice[] | null => {
    if (body.targets.length === 0) return aimed.includes(sourceId) ? [] : null;
    if (body.targets.length !== 1) return null;
    const ok = legalTargets(s, body.targets[0]!, pid, undefined, sourceQuality(s, sourceId), sourceId).find((t) => t.kind === "object" && aimed.includes(t.id));
    return ok ? [ok] : null;
  };
  for (const id of player(s, pid).hand) {
    const body = compileCard(defOf(s, obj(s, id))).spell;
    if (!body || !protects(body)) continue;
    const targets = targetsFor(body, id);
    const plan = targets && planCast(s, pid, id, targets);
    if (plan) return plan;
  }
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      if (!protects(abilities[i]!.body)) continue;
      const targets = targetsFor(abilities[i]!.body, id);
      const costs = targets && abilityCosts(s, pid, o, abilities[i]!, targets);
      const plan = targets && costs !== null && planActivate(s, pid, id, i, targets, undefined, undefined, undefined, costs ?? undefined);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Crew a Vehicle (CR 702.122a) when it's worth it: the creatures tapped for it give up less
 * attacking power than the Vehicle has, counting summoning-sick ones as free.
 */
function chooseCrew(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid || o.tapped || objIsType(s, o, "Creature") || isSummoningSick(s, o)) continue;
    const abilities = abilitiesOf(s, o).activated;
    const i = abilities.findIndex((ab) => ab.crew !== undefined && !ab.saddle);
    if (i < 0) continue;
    const crew = autoCrew(s, pid, id, abilities[i]!.crew!);
    if (!crew) continue;
    const vehiclePower = Number.parseInt(defOf(s, o).power ?? "0", 10) || 0;
    const givenUp = crew.reduce((n, c) => n + (isSummoningSick(s, obj(s, c)) ? 0 : power(s, obj(s, c))), 0);
    if (givenUp >= vehiclePower) continue;
    const plan = planActivate(s, pid, id, i, undefined, undefined, crew);
    if (plan) return plan;
  }
  return null;
}

/**
 * Saddle a Mount (CR 702.171a) that could attack this turn and has something that cares ("whenever ~ attacks while
 * saddled"), with creatures that couldn't attack anyway or that give up less power than the Mount has.
 */
function chooseSaddle(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid || o.tapped || o.saddled || !objIsType(s, o, "Creature") || isSummoningSick(s, o)) continue;
    const abilities = abilitiesOf(s, o);
    const i = abilities.activated.findIndex((ab) => ab.saddle);
    if (i < 0 || !abilities.triggers.some((t) => t.activeIf?.kind === "self" && t.activeIf.is === "saddled")) continue;
    const riders = autoCrew(s, pid, id, abilities.activated[i]!.crew!, true);
    if (!riders) continue;
    const givenUp = riders.reduce((n, c) => n + (isSummoningSick(s, obj(s, c)) ? 0 : Math.max(0, power(s, obj(s, c)))), 0);
    if (givenUp > 0 && givenUp >= power(s, o)) continue;
    const plan = planActivate(s, pid, id, i, undefined, undefined, riders);
    if (plan) return plan;
  }
  return null;
}

/** The counters a permanent needs for its last level or station symbol (CR 711.2, 721.2). */
function lastStriation(s: GameState, o: GameObject, counter: string): number {
  const conds = abilitiesOf(s, o).statics.map((st) => st.condition);
  return Math.max(0, ...conds.map((c) => (c?.kind === "selfCounters" && c.counter === counter ? c.min : 0)));
}

/**
 * Station (CR 702.184a) after combat, until the last station symbol: tap the creature with the greatest power that
 * couldn't have attacked, or any untapped creature while our life is comfortable.
 */
function chooseStation(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const i = abilitiesOf(s, o).activated.findIndex((ab) => ab.station);
    if (i < 0 || (o.counters.charge ?? 0) >= lastStriation(s, o, "charge")) continue;
    const comfortable = s.players[pid]!.life > 20;
    const crew = s.battlefield
      .map((x) => obj(s, x))
      .filter((c) => c.id !== id && controllerOf(s, c) === pid && !c.tapped && objIsType(s, c, "Creature") && power(s, c) > 0 && (comfortable || isSummoningSick(s, c)))
      .sort((a, b) => power(s, b) - power(s, a))[0];
    if (!crew || abilityProblem(s, pid, id, i, undefined, undefined, [crew.id])) continue;
    const plan = planActivate(s, pid, id, i, undefined, undefined, [crew.id]);
    if (plan) return plan;
  }
  return null;
}

/**
 * What to find in a library search: as many as allowed. Lands of a basic type we have the fewest
 * of (for the colors), otherwise the biggest spell we could cast soon.
 */
function chooseSearch(s: GameState, pid: PlayerId, cards: string[], max: number): string[] {
  const mine = s.battlefield.map((x) => obj(s, x)).filter((o) => controllerOf(s, o) === pid);
  const lands = mine.filter((o) => objIsType(s, o, "Land")).length;
  const have = (st: string) => mine.filter((o) => defOf(s, o).subtypes.includes(st)).length;
  const score = (id: string, taken: string[]) => {
    const d = defOf(s, obj(s, id));
    if (isType(d, "Land")) {
      const dupes = taken.filter((t) => defOf(s, obj(s, t)).name === d.name).length;
      return 100 - Math.min(...(d.subtypes.length ? d.subtypes.map(have) : [5])) * 3 - dupes * 3;
    }
    const v = mv(s, id);
    return v <= lands + 2 ? 50 + v : 20 - v;
  };
  const out: string[] = [];
  while (out.length < max) {
    const pool = cards.filter((id) => !out.includes(id));
    if (!pool.length) break;
    out.push(pool.reduce((a, b) => (score(b, out) > score(a, out) ? b : a)));
  }
  return out;
}

/**
 * Manifest dread: a creature card we can turn face up soon is worth the most (CR 701.40b); anything else stays a 2/2.
 */
function chooseManifest(s: GameState, pid: PlayerId, cards: string[], max: number): string[] {
  const lands = s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;
  const score = (id: string) => {
    const d = defOf(s, obj(s, id));
    if (!isType(d, "Creature") || !d.manaCost) return 0;
    const v = mv(s, id);
    return v <= lands + 2 ? 50 + v : 20 - v;
  };
  return [...cards].sort((a, b) => score(b) - score(a)).slice(0, max);
}

/** Cycle (CR 702.29a) lands we don't need and spells we're far from casting. */
function chooseCycling(s: GameState, pid: PlayerId): Action[] | null {
  const lands = s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;
  for (const id of player(s, pid).hand) {
    const o = obj(s, id);
    const d = defOf(s, o);
    const useless = isType(d, "Land") ? lands >= 6 : mv(s, id) > lands + 2;
    if (!useless) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      if (abilities[i]!.zone !== "hand") continue;
      const plan = planActivate(s, pid, id, i);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * A loyalty ability for one of our planeswalkers (CR 606): the ultimate when we can afford it, else a minus ability
 * that leaves the planeswalker at 2 or more and has something good to aim at, else a plus or zero ability. −X uses all
 * but 1 of its loyalty.
 */
function chooseLoyalty(s: GameState, pid: PlayerId): Action[] | null {
  let best: { score: number; plan: Action[] } | null = null;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid || !objIsType(s, o, "Planeswalker")) continue;
    const loyalty = o.counters.loyalty ?? 0;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.loyalty === undefined && !ab.loyaltyX) continue;
      const x = ab.loyaltyX ? loyalty - 1 : undefined;
      const cost = ab.loyaltyX ? -(x ?? 0) : ab.loyalty!;
      if (ab.loyaltyX && (x ?? 0) < 1) continue;
      const after = loyalty + cost;
      const ultimate = cost <= -6;
      if (after < 0 || (after === 0 && !ultimate)) continue;
      const problem = abilityProblem(s, pid, id, i, undefined, undefined, undefined, x);
      if (problem && !/not enough mana/.test(problem)) continue;
      const modes = ab.body.modal ? chooseModes(s, pid, ab.body, false, id)?.modes : undefined;
      if (ab.body.modal && !modes) continue;
      const body = withModes(ab.body, modes);
      if ((groupValue(s, pid, body, defOf(s, o), id) ?? 1) <= 0) continue;
      const targets = body.targets.length ? chooseTargets(s, pid, body, false, id, x) : [];
      if (!targets) continue;
      const score = ultimate ? 100 : cost < 0 ? (after >= 2 ? 50 - cost : -1) : 30 + cost;
      if (score < 0) continue;
      if (best && best.score >= score) continue;
      const plan = planActivate(s, pid, id, i, targets.length ? targets : undefined, modes, undefined, x);
      if (plan) best = { score, plan };
    }
  }
  return best?.plan ?? null;
}

/**
 * Opponents' planeswalkers worth attacking instead of the player: moves attackers that the planeswalker's controller
 * can't block (or all of them when they have no untapped creatures) onto it, smallest first, until their power
 * covers its loyalty. Not when the attack on the player would be lethal, and never a goaded creature (CR 701.15b).
 */
function attackPlaneswalkers(s: GameState, pid: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) {
  const atPlayer = (d: PlayerId) => attacks.filter((a) => a.defender === d && a.planeswalker === undefined).reduce((n, a) => n + Math.max(0, power(s, obj(s, a.attacker))), 0);
  const walkers = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => objIsType(s, o, "Planeswalker") && opponents(s, pid).includes(controllerOf(s, o)))
    .sort((a, b) => (b.counters.loyalty ?? 0) - (a.counters.loyalty ?? 0));
  for (const pw of walkers) {
    const owner = controllerOf(s, pw);
    if (atPlayer(owner) >= player(s, owner).life) continue;
    const blockers = s.battlefield.map((id) => obj(s, id)).filter((b) => controllerOf(s, b) === owner && !b.tapped && objIsType(s, b, "Creature"));
    const free = attacks
      .filter((a) => a.planeswalker === undefined && !characteristics(s, obj(s, a.attacker)).goadedBy.length && !characteristics(s, obj(s, a.attacker)).mustAttack.length && !attackProblem(s, obj(s, a.attacker), owner))
      .filter((a) => blockers.every((b) => blockProblem(s, b, obj(s, a.attacker), owner)))
      .sort((a, b) => power(s, obj(s, a.attacker)) - power(s, obj(s, b.attacker)));
    let need = pw.counters.loyalty ?? 0;
    const moved: typeof attacks = [];
    for (const a of free) {
      if (need <= 0) break;
      moved.push(a);
      need -= Math.max(0, power(s, obj(s, a.attacker)));
    }
    if (need > 0) continue;
    for (const a of moved) {
      a.defender = owner;
      a.planeswalker = pw.id;
    }
  }
  return attacks;
}

function chooseAttacks(s: GameState, pid: PlayerId): Action[] {
  const opps = opponents(s, pid);
  // Pressure whoever is lowest on life, but take the crown from an opponent who's the monarch
  // (CR 725.2) unless someone else is low enough to finish.
  const lowest = [...opps].sort((a, b) => player(s, a).life - player(s, b).life)[0]!;
  const reach = potentialAttackers(s, pid).reduce((n, o) => n + Math.max(0, combatDamageOf(s, o)), 0);
  const target = s.monarch !== undefined && opps.includes(s.monarch) && player(s, lowest).life > reach ? s.monarch : lowest;
  const theirBlockers = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === target && !o.tapped && objIsType(s, o, "Creature"));
  const biggestBlocker = Math.max(0, ...theirBlockers.map((o) => combatDamageOf(s, o)));
  const ready = potentialAttackers(s, pid).filter((o) => combatDamageOf(s, o) > 0 && !attackProblem(s, o, target));
  // Swing with everything when we outnumber their untapped blockers; otherwise only with creatures that survive a block.
  const allIn = ready.length > theirBlockers.length;
  // Creatures that attack each combat if able have to (CR 508.1d), whatever their power, at whoever they can.
  const must = potentialAttackers(s, pid).filter((o) => characteristics(s, o).attacksIfAble && !ready.includes(o));
  let attacks = [
    ...ready
      .filter((o) => allIn || characteristics(s, o).attacksIfAble || toughness(s, o) > biggestBlocker || theirBlockers.every((b) => blockProblem(s, b, o, target)))
      .map((o) => ({ attacker: o.id, defender: target })),
    ...must.map((o) => ({ attacker: o.id, defender: attackProblem(s, o, target) ? opps.find((d) => !attackProblem(s, o, d))! : target })),
  ];
  // A goaded creature attacks someone other than who goaded it, if it can (CR 701.15b).
  attacks = attacks.map((a) => {
    const o = obj(s, a.attacker);
    const by = characteristics(s, o).goadedBy;
    if (!by.includes(a.defender)) return a;
    const other = opps.find((d) => !by.includes(d) && !attackProblem(s, o, d));
    return other !== undefined ? { ...a, defender: other } : a;
  });
  // A token that has to attack a particular opponent (encore) attacks them if it can (CR 508.1d).
  for (const o of potentialAttackers(s, pid)) {
    const d = characteristics(s, o).mustAttack.find((x) => opps.includes(x) && !attackProblem(s, o, x));
    if (d === undefined) continue;
    attacks = [...attacks.filter((a) => a.attacker !== o.id), { attacker: o.id, defender: d }];
  }
  // One that can't attack alone stays home rather than attack by itself (CR 506.5).
  if (attacks.length === 1 && characteristics(s, obj(s, attacks[0]!.attacker)).cantAttackAlone) attacks = [];
  let declared = attackPlaneswalkers(s, pid, attacks);
  // Ghostly Prison: pay what attacking costs if we can (CR 508.1g-i); otherwise send the weakest taxed attacker at
  // someone it costs nothing to attack, or keep it home. Nothing obliges paying for a requirement (CR 508.1d).
  for (;;) {
    const tax = attackTax(s, declared);
    const taps = tax ? planMana(s, pid, parseManaCost(`{${tax}}`)) : [];
    if (taps) {
      if (declared.length === 1 && characteristics(s, obj(s, declared[0]!.attacker)).cantAttackAlone) declared = [];
      return [...(declared.length ? taps : []), { type: "declareAttackers", player: pid, attacks: declared }];
    }
    const taxed = declared.filter((a) => a.planeswalker === undefined && attackTaxPer(s, a.defender)).sort((a, b) => power(s, obj(s, a.attacker)) - power(s, obj(s, b.attacker)))[0]!;
    const o = obj(s, taxed.attacker);
    const elsewhere = opps.find((d) => !attackTaxPer(s, d) && !attackProblem(s, o, d) && !characteristics(s, o).goadedBy.includes(d));
    declared = declared.flatMap((a) => (a !== taxed ? [a] : elsewhere !== undefined ? [{ ...a, defender: elsewhere }] : []));
  }
}

function chooseBlocks(s: GameState, pid: PlayerId): Action {
  const me = player(s, pid);
  const incoming = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking === pid);
  const mine = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === pid && !o.tapped && objIsType(s, o, "Creature") && !cantBlockNow(s, o));
  const used = new Set<string>();
  const blocks: { blocker: string; attacker: string }[] = [];
  // Only damage to us counts toward our life; attackers of our planeswalkers are blocked when that's a good trade.
  const totalIncoming = incoming.filter((a) => !a.attackingPermanent).reduce((n, a) => n + combatDamageOf(s, a), 0);
  const desperate = totalIncoming >= me.life;
  // Requirements first (CR 509.1c): every creature able to block a lure blocks one, and a creature that
  // must be blocked if able gets our sturdiest blocker (two against menace).
  for (const at of incoming.filter((a) => characteristics(s, a).allMustBlock && !characteristics(s, a).maxOneBlocker)) {
    const able = mine.filter((b) => !used.has(b.id) && !blockProblem(s, b, at));
    if (able.length < blockersNeeded(s, at)) continue;
    for (const b of able) {
      used.add(b.id);
      blocks.push({ blocker: b.id, attacker: at.id });
    }
  }
  // A provoked creature blocks the creature that provoked it (CR 702.39a), with a second blocker against menace.
  for (const b of mine) {
    const at = provokerOf(s, b);
    if (!at || used.has(b.id) || blockProblem(s, b, at)) continue;
    const helpers = mine.filter((o) => o.id !== b.id && !used.has(o.id) && !blockProblem(s, o, at)).sort((x, y) => toughness(s, y) - toughness(s, x)).slice(0, blockersNeeded(s, at) - 1);
    if (helpers.length < blockersNeeded(s, at) - 1) continue;
    for (const o of [b, ...helpers]) {
      used.add(o.id);
      blocks.push({ blocker: o.id, attacker: at.id });
    }
  }
  // One that must block this turn blocks the attacker it fares best against (CR 509.1c).
  for (const b of mine.filter((o) => characteristics(s, o).mustBlock && !used.has(o.id))) {
    const able = incoming.filter((at) => !blockProblem(s, b, at) && mine.filter((o) => o.id !== b.id && !used.has(o.id) && !blockProblem(s, o, at)).length >= blockersNeeded(s, at) - 1);
    const at = able.find((a) => toughness(s, b) > power(s, a)) ?? able.find((a) => power(s, b) >= toughness(s, a)) ?? able[0];
    if (!at) continue;
    const helpers = mine.filter((o) => o.id !== b.id && !used.has(o.id) && !blockProblem(s, o, at)).sort((x, y) => toughness(s, y) - toughness(s, x)).slice(0, blockersNeeded(s, at) - 1);
    for (const o of [b, ...helpers]) {
      used.add(o.id);
      blocks.push({ blocker: o.id, attacker: at.id });
    }
  }
  for (const at of incoming.filter((a) => (characteristics(s, a).mustBeBlocked || characteristics(s, a).allMustBlock) && !blocks.some((b) => b.attacker === a.id))) {
    const able = mine.filter((b) => !used.has(b.id) && !blockProblem(s, b, at)).sort((a, b) => toughness(s, b) - toughness(s, a));
    const n = blockersNeeded(s, at);
    if (able.length < n) continue;
    for (const b of able.slice(0, n)) {
      used.add(b.id);
      blocks.push({ blocker: b.id, attacker: at.id });
    }
  }
  for (const at of [...incoming].sort((a, b) => power(s, b) - power(s, a))) {
    if (blocks.some((b) => b.attacker === at.id)) continue;
    if (blockersNeeded(s, at) > 1 || characteristics(s, at).cantBeBlocked) continue;
    const canBlock = mine.filter((b) => !used.has(b.id) && !blockProblem(s, b, at));
    const good = canBlock.find((b) => toughness(s, b) > combatDamageOf(s, at) && !objHasKeyword(s, at, "Deathtouch"));
    const trade = canBlock.find((b) => combatDamageOf(s, b) >= toughness(s, at));
    const pick = good ?? trade ?? (desperate ? canBlock[0] : undefined);
    if (pick) {
      used.add(pick.id);
      blocks.push({ blocker: pick.id, attacker: at.id });
    }
  }
  // A creature that can block more than one creature (CR 509.1a) also takes on attackers nobody blocks, as long
  // as it survives all of them together.
  const hurt = (b: GameObject) => blocks.filter((x) => x.blocker === b.id).reduce((n, x) => n + (objHasKeyword(s, obj(s, x.attacker), "Deathtouch") ? Infinity : Math.max(0, power(s, obj(s, x.attacker)))), 0);
  for (const at of [...incoming].sort((a, b) => power(s, b) - power(s, a))) {
    if (blocks.some((b) => b.attacker === at.id) || blockersNeeded(s, at) > 1 || objHasKeyword(s, at, "Deathtouch") || characteristics(s, at).cantBeBlocked) continue;
    const extra = mine.find((b) => used.has(b.id) && blocks.filter((x) => x.blocker === b.id).length < maxBlocks(s, b) && !blockProblem(s, b, at) && toughness(s, b) > hurt(b) + power(s, at));
    if (extra) blocks.push({ blocker: extra.id, attacker: at.id });
  }
  // One that can't block alone doesn't block by itself (CR 506.5).
  const earlier = s.battlefield.some((id) => obj(s, id).blocking !== undefined);
  if (blocks.length === 1 && !earlier && characteristics(s, obj(s, blocks[0]!.blocker)).cantBlockAlone) blocks.length = 0;
  return { type: "declareBlockers", player: pid, blocks };
}

const LAND_COLOR: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

/**
 * "Target land becomes the basic land type of your choice" (Reef Shaman): our own land makes the color our hand and
 * commander need most; an opponent's makes a color their commander can't use.
 */
function chooseLandType(s: GameState, pid: PlayerId, options: string[]): string {
  const t = s.resolving?.item.targets?.find((x) => x.kind === "object");
  const owner = t?.kind === "object" && s.objects[t.id] ? controllerOf(s, obj(s, t.id)) : pid;
  const identity = new Set<Color>();
  for (const o of Object.values(s.objects)) if (o.isCommander && o.owner === owner) defOf(s, o).colorIdentity.forEach((c) => identity.add(c));
  if (owner !== pid) return options.find((o) => !identity.has(LAND_COLOR[o]!)) ?? options[0]!;
  const want = new Map<string, number>();
  for (const id of player(s, pid).hand) for (const c of defOf(s, obj(s, id)).colors) want.set(c, (want.get(c) ?? 0) + 1);
  return [...options].sort((a, b) => (want.get(LAND_COLOR[b]!) ?? 0) + (identity.has(LAND_COLOR[b]!) ? 1 : 0) - (want.get(LAND_COLOR[a]!) ?? 0) - (identity.has(LAND_COLOR[a]!) ? 1 : 0))[0]!;
}
