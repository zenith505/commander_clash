import { cardPT, linkedCards, playerProtectedFrom, playerProtection } from "./effects/targeting";
import { allEffects, NON_AURA_ENCHANTMENT, refCovers, timedCondition, type AbilityBody, type ActivatedAbility, type Amount, type AdditionalCost, type ChosenTarget, type AltCostKind, type CastFromGraveyardKind, type ChoiceKind, type CompiledCard, type CounterKind, type PickAction, type Effect, type SpellCondition, type ObjRef, type PlayerRef, type TargetChoice, type TargetSpec, type UnlessPays } from "./abilities";
import { topGraveyardCards } from "./graveyard";
import { chooseVote } from "./bot-votes";
import { mayPayUse } from "./spend";
import { autoCrew, autoWaterbend, planActivate, planCubeMana, planCast, planMana, planForetell, planPlot, planSuspend, planTurnFaceUp, planUnlock } from "./autopay";
import { abilitiesOf, basePower, baseToughness, canBeSacrificed, canSacrificeForCost, defOf, faceUpDefOf, isPermanentCard, isType, objHasKeyword, objIsType, power, realDefOf, shareLandType, toughness } from "./cards";
import { commanderIdentity, manaAbilitiesOn, manaAbilityProblem, manaActionAbility, manaChoices } from "./manaabilities";
import { reselectOptions, flagbearers, flagbearerRuleFor, bindChosen, bindAttachedToSource, canChooseTarget, changeTargetOptions, harmfulCounter, triggerBody, choiceOptions, unlessCost, damageTo, doesNothingNow, estimate, harmfulTargets, legalModes, legalTargets, lethalDamage, offerMany, totalOk, modsAreHarmful, objectMatches, printedMatches, pickOptions, spellMatches, sameNamed, sameManaValued, sameTarget, sourceQuality, spellManaValue, COLOR_NAMES, ENTERS_COUNTER } from "./effects";
import { withModes, modeRange, manySlot, gateBody, hasGatedTargets, castConditionMet, type CastHow } from "./modes";
import {
  applyAction,
  applyInPlace,
  cloneState,
  waitingOn,
  untapChoiceProblem,
  blockCost,
  blockLifeCost,
  blocksMayCostLife,
  blocksMayCost,
  livingPlayers,
  abilityProblem,
  loyaltyChange,
  definedX,
  faceUpWays,
  faceUpFormsOf,
  faceUpManaCost,
  dredgeAmount,
  assistedRemaining,
  returnCandidates,
  beholdCandidates,
  attackablePermanentProblem,
  attackProblem,
  nearestOpponent,
  attackCost,
  attackCostOptions,
  attackCostsPayable,
  attackTaxOf,
  attackLifeCost,
  attackYouLimit,
  attackAllIfOne,
  combatLimit,
  playerBlockLimit,
  attackTaxPer,
  blockProblem,
  blockRequirementProblem,
  cantBlockNow,
  cantBeBlockedNow,
  provokerOf,
  lureBinds,
  withoutCompany,
  blockWithoutCompany,
  lonelyBlocker,
  tapCostCandidates,
  shareablePick,
  craftCandidates,
  untapViaMana,
  counterCostCandidates,
  counterOnCandidates,
  maxBlocks,
  blockersNeeded,
  canEnterUntapped,
  othersMakeItEnterUntapped,
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
  foretellCostOf,
  combatDamageOf,
  spellCost,
  graveyardWay,
  graveyardWays,
  altCost,
  delveRoom,
  spellTargets,
  activationLessCost,
  availableMana,
  exilePlayable,
  topPlayable,
  castDef,
  casualtyCandidates,
  bargainCandidates,
  offeringCandidates,
  autoEvidence,
  evidenceProblem,
  altCostsFor,
  isEmerge,
  payZeroSource,
  linkedFreeGrant,
  commanderTax,
  legendBotKeep,
  unlockCost,
  forageWays,
  castExtraCosts,
  lifeCostOffers,
  costsHaveX,
  bothModes,
  teamworkCandidates,
  teamworkPower,
  conspireCandidates,
  spliceCandidates,
  madnessCastOf,
  auraHostFor,
  auraHostKey,
  payableLife,
  halfLifeCost,
  linkedExileCards,
  linkedCostCards,
  processCandidates,
  hiddenInExile,
  maxHandSize,
  stackItemQuality,
  oneOfEachFits,
  differentlyNamed,
  abilityCostsHaveX,
  deciderOf,
  landsAllowed,
  landUntappedOffer,
  creatureTypesOf,
  shareCreatureType,
  mustAttackPlayers,
  conspireInstances,
  walkersFreeToAttack,
  attackTargetScore,
  discardKeywordKinds,
  auraHostOptions,
  lastDrawnInHand,
  deferredChoice,
} from "./game";
import { manaValue, parseManaCost, xCount } from "./mana";
import { asFace, castableFaces, defMv, layoutOf, registerFace, sameName } from "./faces";
import { characteristics, controllerOf, staticConditionNow } from "./layers";
import { prepareSpellOf } from "./prepare";
import { castingBody, castTimeTargets, compileCard } from "./oracle";
import { COLORS, type Action, type CardDef, type Chosen, type Color, type CostChoices, type GameObject, type GameState, type ManaType, type ObjectId, type PendingDecision, type PlayerId, type StackItem, type DeferredAct } from "./types";
import { evalAmount } from "./amounts";
import { CHOSEN_HEXPROOF, CHOSEN_PARITY_PROTECTION, CHOSEN_PROTECTION, CHOSEN_TYPE_PROTECTION } from "./keywords";
import { groupValue, ofPlayerPick, ofPlayerTargets, worth } from "./value";
import { damageEstimate } from "./damage";
import { blightOptions, removableCounters } from "./counters";

/**
 * A simple heuristic opponent. Returns the sequence of actions it wants to take next
 * (usually one, or several mana taps followed by a cast).
 */
export function botActions(s: GameState, pid: PlayerId): Action[] {
  const pend = s.pending;
  // A bot controlling another player's turn (CR 723.5) makes them do nothing they don't have to: no spells, abilities,
  // land or attacks. The choices they must make (blocks, discards, what their own triggers target) are made for them
  // as they'd make them.
  if (deciderOf(s, pid) !== pid) {
    if (!pend) return [{ type: "passPriority", player: pid }];
    if (pend.player === pid && pend.kind === "declareAttackers") return [{ type: "declareAttackers", player: pid, attacks: [] }];
  }
  if (pend?.player === pid) {
    if (pend.kind === "declareAttackers") return chooseAttacks(s, pid);
    if (pend.kind === "declareBlockers") return pend.defender !== undefined ? [blocksForOpponent(s, pid, pend.defender)] : payForBlocks(s, pid, chooseBlocks(s, pid));
    // "An opponent chooses one —" (Misfortune): the mode of another player's spell, as it's cast.
    if (pend.kind === "chooseModes" && pend.deferred) return [{ type: "chooseModes", player: pid, modes: [modeForOther(s, pid, pend.deferred, pend.legal)] }];
    if (pend.kind === "chooseModes") {
      const t = s.triggerQueue[0]!;
      const printed = triggerBody(s, t);
      // "You may choose both instead" (SOLDIER Military Program): one or both, now. "Each mode must target a different
      // player" (Vindictive Lich): no more than there are players to target (the question's range).
      const range = t.both ? modeRange(printed, true) : printed.modal?.distinctTargets ? [pend.min, pend.max] : undefined;
      const body = range ? { ...printed, modal: { ...printed.modal!, min: range[0]!, max: range[1]! } } : printed;
      return [{ type: "chooseModes", player: pid, modes: chooseModes(s, pid, body, true, t.sourceId)!.modes }];
    }
    if (pend.kind === "chooseTargets" && pend.deferred?.own) {
      // Our own spell's targets, once an opponent has chosen its mode (askModeChooser): as we'd choose them for that mode.
      const act = pend.deferred.act;
      const printed = act.type === "castSpell" ? castingBody(castDef(s, act.objectId, act.alt)) : undefined;
      const body = printed ? { ...withModes(printed, act.modes), targets: pend.specs } : undefined;
      return [{ type: "chooseTargets", player: pid, targets: (body && chooseTargets(s, pid, body, true, act.objectId)) ?? pend.specs.map((): TargetChoice => ({ kind: "none" })) }];
    }
    if (pend.kind === "chooseTargets" && pend.deferred) {
      // A target of another player's spell or ability "of an opponent's choice", as it's cast or activated (askChoosers).
      const dc = deferredChoice(s, pend.deferred);
      const any = legalTargets(s, pend.specs[0]!, pend.controller ?? pid, undefined, botSource(s, pend.sourceId), pend.sourceId)[0];
      return [{ type: "chooseTargets", player: pid, targets: dc ? targetForOther(s, pid, pend.controller ?? pid, dc.body, pend.sourceId, dc.slot, dc.targets) : [any ?? { kind: "none" }] }];
    }
    if (pend.kind === "chooseTargets") {
      const t = s.triggerQueue[0]!;
      const body = withModes(triggerBody(s, t), t.modes);
      // Choosing the target of another player's ability (TargetSpec.chosenBy): the one best for us.
      if (pend.controller !== undefined && pend.controller !== pid) return [{ type: "chooseTargets", player: pid, targets: targetForOther(s, pid, pend.controller, body, t.sourceId) }];
      return [{ type: "chooseTargets", player: pid, targets: chooseTargets(s, pid, body, true, t.sourceId, t.x ?? 0)! }];
    }
    if (pend.kind === "copyTargets") {
      // New targets for a spell copy: the best ones for us, or keep the old ones (CR 707.10c).
      const sc = s.resolving?.scratch?.copies;
      const orig = sc ? (s.stack.find((x) => x.id === sc.of) ?? s.castItems?.[sc.of]) : undefined;
      // The copy is a spell like the original, for protection and "can't be the target of" (CR 707.10).
      const best = orig?.body ? chooseTargets(s, pid, orig.body, false, orig.objectId) : null;
      return [{ type: "copyTargets", player: pid, ...(best ? { targets: best } : {}) }];
    }
    if (pend.kind === "changeTarget") return [{ type: "changeTarget", player: pid, target: newTargetFor(s, pid, pend) }];
    if (pend.kind === "newTargets") {
      const targets = newTargetsFor(s, pid, pend);
      return [{ type: "newTargets", player: pid, ...(targets ? { targets } : {}) }];
    }
    if (pend.kind === "castFree" && pend.how === "transformed") {
      // A defeated Siege: its back face, for free (CR 310.12b).
      const plan = asFace(s, obj(s, pend.objectId), 1, () => castPlan(s, pid, pend.objectId, true));
      return plan ? plan.map((a) => (a.type === "castSpell" && a.objectId === pend.objectId ? { ...a, face: 1 } : a)) : [{ type: "chooseMay", player: pid, yes: false }];
    }
    if (pend.kind === "castFree") {
      // Prototyped when it can't be cast whole (CR 718.3): "the same mana value" may allow only that (Powerbalance).
      const plan = facePlan(s, pid, pend.objectId, true, "first") ?? castPlan(s, pid, pend.objectId, true) ?? facePlan(s, pid, pend.objectId, true, "after") ?? (altCost(defOf(s, obj(s, pend.objectId)), "prototype") ? castPlan(s, pid, pend.objectId, true, undefined, "prototype") : null);
      return plan ?? [{ type: "chooseMay", player: pid, yes: false }];
    }
    if (pend.kind === "drawLook" && pend.keep) {
      // Underrealm Lich: keep the card we'd most like to draw (what scry would keep, the most expensive of those).
      if (pend.cards.length < 2) return [{ type: "drawLook", player: pid }];
      const best = [...pend.cards].sort((a, b) => Number(wantOnTop(s, pid, b)) - Number(wantOnTop(s, pid, a)) || mv(s, b) - mv(s, a))[0]!;
      return [{ type: "drawLook", player: pid, objectId: best }];
    }
    if (pend.kind === "drawLook") {
      // The look first, even when Alhammarret's Archive or dredge could replace that draw: they can still replace the
      // draw it makes. Keep the card we'd rather draw (what scry would keep), and bin the other.
      if (pend.cards.length < 2) return [{ type: "drawLook", player: pid }];
      const [a, b] = pend.cards as [string, string];
      const bin = wantOnTop(s, pid, a) && !wantOnTop(s, pid, b) ? b : !wantOnTop(s, pid, a) && wantOnTop(s, pid, b) ? a : mv(s, a) >= mv(s, b) ? b : a;
      return [{ type: "drawLook", player: pid, objectId: bin }];
    }
    // Out of the Tombs: the creature card that costs the most comes back.
    if (pend.kind === "drawEmptyReturn") return [{ type: "drawEmptyReturn", player: pid, objectId: [...pend.cards].sort((a, b) => mv(s, b) - mv(s, a))[0]! }];
    if (pend.kind === "drawInstead") {
      // Its own Words before an opponent's Urabrask; the life when it's low, otherwise the token.
      const words = pend.options.filter((k) => k.startsWith("words:"));
      const w = (k: string) => player(s, pid).nextDrawInstead?.[Number(k.slice("words:".length))];
      const low = player(s, pid).life <= 10;
      // Then our own replacements: the Archive's two cards, a look (Underrealm Lich, Tomorrow, Scion), a dredge we'd take;
      // an opponent's Notion Thief last.
      const has = (k: string) => pend.options.find((o) => o === k || o.startsWith(`${k}:`));
      const dredges = pend.options.filter((k) => k.startsWith("dredge:")).map((k) => k.slice("dredge:".length));
      const dredge = dredges.length ? chooseDredge(s, pid, dredges) : undefined;
      // Pursuit of Knowledge: a counter until it has three (then seven cards); Obstinate Familiar: skip only with a short library.
      const counter = pend.options.find((k) => k.startsWith("counter:") && (s.objects[k.slice("counter:".length)]!.counters[abilitiesOf(s, s.objects[k.slice("counter:".length)]!).drawMayCounter ?? ""] ?? 0) < 3);
      const skip = player(s, pid).library.length <= 5 ? has("mayskip") : undefined;
      const declinable = (k: string) => k === "thief" || /^(?:dredge|mayskip|counter):/.test(k);
      const pick = words.find((k) => (low ? w(k)?.gain !== undefined : w(k)?.token !== undefined)) ?? words[0] ?? has("archive") ?? has("dig") ?? has("look") ?? has("tutor") ?? (dredge !== undefined ? `dredge:${dredge}` : undefined) ?? counter ?? skip ?? pend.options.find((k) => !declinable(k)) ?? pend.options[0]!;
      return [{ type: "drawInstead", player: pid, choice: pick }];
    }
    if (pend.kind === "dredge") {
      // With an Alhammarret's Archive too, the Archive first: each of the two draws it makes can still be dredged.
      const pick = pend.archive ? undefined : chooseDredge(s, pid, pend.options);
      if (!pick && pend.abundance && !pend.archive) {
        // Abundance: a land while we're short of them, otherwise a spell. Always when the library is empty: revealing
        // nothing doesn't lose the game the way drawing from it would (CR 704.5b).
        const me = s.players[pid]!;
        const lands = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && objIsType(s, s.objects[id]!, "Land")).length + me.hand.filter((id) => isType(defOf(s, s.objects[id]!), "Land")).length;
        return [{ type: "dredge", player: pid, abundance: lands < 5 && me.library.length ? "land" : "nonland" }];
      }
      return [{ type: "dredge", player: pid, ...(pick ? { objectId: pick } : {}) }];
    }
    // "You may collect evidence N": yes, with cards we don't need in the graveyard.
    if (pend.kind === "collectEvidence") return [{ type: "collectEvidence", player: pid, ids: spareEvidence(s, pid, pend.n, pend.not) ?? [] }];
    // Lim-Dûl's Vault: keep five cards with at least two we'd like to draw; otherwise dig on while life allows, a few times.
    // Blocks an opponent chose for us with Odric: we don't pay for their plan; they choose again.
    if (pend.kind === "chooseMay" && pend.blockTax) return [{ type: "chooseMay", player: pid, yes: false }];
    // Fasting: skip the draw step for the life while the hand still holds three or more cards (drawing destroys it).
    if (pend.kind === "chooseMay" && pend.skipDraw) return [{ type: "chooseMay", player: pid, yes: player(s, pid).hand.length >= 3 }];
    // Dance with Calamity: another card while there's room for one of about average mana value under the limit.
    const luck = pend.kind === "chooseMay" ? /^exile the top card of your library \(total mana value so far: (\d+); (\d+) or less/.exec(pend.prompt) : null;
    if (luck) return [{ type: "chooseMay", player: pid, yes: Number(luck[2]) - Number(luck[1]) >= 4 }];
    if (pend.kind === "chooseMay" && pend.vault) {
      const paid = s.resolving?.scratch?.vaultPaid ?? 0;
      const good = pend.vault.filter((id) => wantOnTop(s, pid, id)).length;
      const dig = good < Math.min(2, pend.vault.length) && paid < 4 && player(s, pid).life > (pend.pay?.life ?? 1) + 10 && player(s, pid).library.length > pend.vault.length;
      return [{ type: "chooseMay", player: pid, yes: dig }];
    }
    // Aboroth's cumulative upkeep in -1/-1 counters: keep it while it survives them with some toughness to spare.
    const upkeepFx = s.resolving?.body.effects[s.resolving.next];
    if (pend.kind === "chooseMay" && pend.keep && upkeepFx?.type === "cumulativeUpkeep" && upkeepFx.selfCounter) {
      const self = s.resolving?.item.sourceId ? s.objects[s.resolving.item.sourceId] : undefined;
      const n = s.resolving?.scratch?.n ?? 0;
      const left = self?.zone === "battlefield" ? toughness(s, self) - (upkeepFx.selfCounter === "-1/-1" ? n : 0) : 0;
      return [{ type: "chooseMay", player: pid, yes: left >= 2 }];
    }
    // Wall of Shards: a wall worth a few life for the opponents, while the total stays small.
    if (pend.kind === "chooseMay" && pend.keep && upkeepFx?.type === "cumulativeUpkeep" && upkeepFx.giveLife) return [{ type: "chooseMay", player: pid, yes: (s.resolving?.scratch?.n ?? 0) * upkeepFx.giveLife <= 4 }];
    // Braid of Fire: adding the mana costs nothing, so keep it.
    if (pend.kind === "chooseMay" && pend.keep && upkeepFx?.type === "cumulativeUpkeep" && upkeepFx.addMana) return [{ type: "chooseMay", player: pid, yes: true }];
    // Psychic Vortex: keep drawing while the library has plenty left and the hand isn't overfull.
    if (pend.kind === "chooseMay" && pend.keep && upkeepFx?.type === "cumulativeUpkeep" && upkeepFx.drawCost) {
      const n = s.resolving?.scratch?.n ?? 0;
      return [{ type: "chooseMay", player: pid, yes: player(s, pid).library.length > n + 10 && n <= 4 }];
    }
    // Johan: give up its own attack when two or more other creatures of ours could attack untapped and stay back as blockers.
    if (pend.kind === "chooseMay" && s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "attackWithoutTapping")) {
      const others = s.battlefield.filter((id) => id !== s.resolving!.item.sourceId && controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature") && !obj(s, id).tapped && !objHasKeyword(s, obj(s, id), "Vigilance"));
      return [{ type: "chooseMay", player: pid, yes: others.length >= 2 }];
    }
    if (pend.kind === "chooseMay" && pend.pay && pend.keep) {
      // Echo and cumulative upkeep: keep it while the price stays reasonable (CR 702.30a, 702.24a).
      const { mana, life = 0, energy = 0 } = pend.pay;
      const taps = mana ? planMana(s, pid, parseManaCost(mana), 0, undefined, [], mayPayUse(s, pend)) : [];
      const ok = !!taps && (!mana || manaValue(parseManaCost(mana)) <= Math.max(4, lands(s, pid) - 2)) && player(s, pid).life > life + 5 && (player(s, pid).energy ?? 0) >= energy;
      return ok ? [...taps!, { type: "chooseMay", player: pid, yes: true }] : [{ type: "chooseMay", player: pid, yes: false }];
    }
    // Shrouded Lore: the opponent chooses the card that helps us least, so each payment can only get us a better one.
    if (pend.kind === "chooseMay" && pend.pay?.mana && s.resolving?.body.effects[s.resolving.next]?.type === "loreChoices") {
      const taps = planMana(s, pid, parseManaCost(pend.pay.mana));
      return taps ? [...taps, { type: "chooseMay", player: pid, yes: true }] : [{ type: "chooseMay", player: pid, yes: false }];
    }
    if (pend.kind === "chooseMay" && pend.pay) {
      // "You may pay {1}. If you do, ...": worth it when the rest is, and it leaves us some life.
      const { mana, life = 0 } = pend.pay;
      const taps = mana ? planMana(s, pid, parseManaCost(mana)) : [];
      // A Pact's "If you don't, you lose the game": always pay when we can.
      const e = s.resolving?.body.effects[s.resolving.next];
      const orLose = e?.type === "may" && !!e.otherwise?.some((x) => x.type === "loseGame");
      // Transmute Artifact: unpaid, the card found goes to the graveyard; pay when we can.
      const orYard = !!s.resolving?.scratch?.payDiff;
      // Join forces: the amount was ours to choose (payX), so pay it.
      const joining = !!s.resolving?.scratch?.join;
      // Tester of the Tangential, Isareth the Awakener: the X we chose (above) was the decision.
      const ownX = !!paidXReflexive(s) && s.resolving?.scratch?.payX !== undefined && s.resolving.scratch.payX !== "none";
      const ok = !!taps && (orLose || orYard || joining || ownX || (player(s, pid).life > life + 5 && wantsMay(s, pid)));
      return ok ? [...taps!, { type: "chooseMay", player: pid, yes: true }] : [{ type: "chooseMay", player: pid, yes: false }];
    }
    // Clash (CR 701.30a): keep a card we'd like to draw on top, put the rest on the bottom.
    if (pend.kind === "chooseMay" && pend.clash) return [{ type: "chooseMay", player: pid, yes: !wantOnTop(s, pid, pend.card!) }];
    // "Each player may discard their hand and draw five cards": when that's more cards than we'd throw away.
    // Ad Nauseam: another card while there's life to spare (a loss is a state-based action once it stops, CR 704.5a).
    // Kindle the Carnage: again only while an opponent still has a creature and we have none to lose.
    const discardPass = s.resolving?.body.effects.some((e) => e.type === "repeatMay" && e.needsHand);
    if (pend.kind === "chooseMay" && pend.repeat && discardPass) return [{ type: "chooseMay", player: pid, yes: !s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature")) && s.battlefield.some((id) => controllerOf(s, obj(s, id)) !== pid && objIsType(s, obj(s, id), "Creature")) }];
    if (pend.kind === "chooseMay" && pend.repeat) return [{ type: "chooseMay", player: pid, yes: player(s, pid).life > 15 && player(s, pid).hand.length < 12 }];
    if (pend.kind === "chooseMay" && pend.wheel !== undefined) return [{ type: "chooseMay", player: pid, yes: player(s, pid).hand.length < pend.wheel }];
    // A land played as an effect resolves (Gix): untapped as we'd play it ourselves (see chooseLand).
    if (pend.kind === "chooseMay" && pend.card && pend.prompt === landUntappedOffer(s, pid, pend.card)) return [{ type: "chooseMay", player: pid, yes: /^(?:reveal|have)/.test(pend.prompt) || player(s, pid).life >= 16 }];
    // Sepulchral Primordial: each opponent's creature card comes back under our control.
    if (pend.kind === "chooseMay" && pend.eachTarget) return [{ type: "chooseMay", player: pid, yes: true }];
    // Krark's Thumb: keep the won flip.
    // Odds with Krark's Thumb: heads counters the target, tails copies it: heads against an opponent's spell, tails for ours.
    if (pend.kind === "chooseMay" && pend.thumb && s.resolving?.scratch?.thumbUncalled) {
      const t = s.resolving.item.targets?.[0];
      const spell = t?.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
      return [{ type: "chooseMay", player: pid, yes: !spell || spell.controller !== pid }];
    }
    if (pend.kind === "chooseMay" && pend.thumb) return [{ type: "chooseMay", player: pid, yes: true }];
    // Fiery Gambit: flip again until more wins do nothing more (each flip risks the whole spell).
    // Game of Chaos: having just won, flip again only to win back what the game has cost us, or for a chance to finish the
    // opponent, and only while losing the next stake wouldn't kill us.
    if (pend.kind === "chooseMay" && pend.chaosAgain) {
      const { stake, net, against } = pend.chaosAgain;
      const safe = player(s, pid).life > stake;
      return [{ type: "chooseMay", player: pid, yes: safe && (net < 0 || player(s, against).life <= stake) }];
    }
    if (pend.kind === "chooseMay" && pend.flipAgain) return [{ type: "chooseMay", player: pid, yes: pend.flipAgain.wins < pend.flipAgain.enough }];
    // Rona, Tolarian Obliterator: a land exiled from a hand at random, ours to put onto the battlefield.
    if (pend.kind === "chooseMay" && pend.card && s.resolving?.body.effects[s.resolving.next]?.type === "exileRandomThenPlay") return [{ type: "chooseMay", player: pid, yes: true }];
    // Primal Surge: every permanent is worth having, and saying no ends it.
    if (pend.kind === "chooseMay" && pend.card && s.resolving?.body.effects[s.resolving.next]?.type === "surge") return [{ type: "chooseMay", player: pid, yes: true }];
    // Dina's Guidance: the creature card found goes into the hand, not the graveyard (bots don't plan reanimation).
    const searching = s.resolving?.body.effects[s.resolving.next];
    if (pend.kind === "chooseMay" && searching?.type === "search" && searching.mayInstead?.dest.zone === "graveyard") return [{ type: "chooseMay", player: pid, yes: false }];
    // Omnath, Locus of All: revealing the card only adds mana (it goes to the hand either way).
    const mayAt = (e: Effect | undefined): Effect[] => (e?.type === "may" ? e.effects : e?.type === "if" ? [...e.effects, ...(e.otherwise ?? [])].flatMap((x) => (x.type === "may" ? x.effects : [])) : []);
    const mayFx = mayAt(searching);
    if (pend.kind === "chooseMay" && mayFx.some((x) => x.type === "addMana" && x.revealedColors)) return [{ type: "chooseMay", player: pid, yes: true }];
    // Manabond: put the lands in the hand onto the battlefield and discard the rest only when the rest is one card or none.
    if (pend.kind === "chooseMay" && mayFx.some((x) => x.type === "putFromHand" && x.all)) {
      const hand = player(s, pid).hand.map((id) => defOf(s, obj(s, id)));
      const lands = hand.filter((d) => isType(d, "Land")).length;
      return [{ type: "chooseMay", player: pid, yes: lands >= 1 && hand.length - lands <= 1 }];
    }
    // Stromgald Spy: a revealed hand tells a bot nothing it uses; the combat damage is worth more.
    if (pend.kind === "chooseMay" && mayFx.some((x) => x.type === "revealHandWhile")) return [{ type: "chooseMay", player: pid, yes: false }];
    // Retriever Phoenix back on the battlefield rather than learning (discarding a card to draw one): always.
    if (pend.kind === "chooseMay") return [{ type: "chooseMay", player: pid, yes: pend.insteadOfLearn ? true : pend.card ? (revealedMay(s, pend.card) ?? millExplored(s, pid, pend.card)) : wantsMay(s, pid) }];
    // Perplex: discard the whole hand to keep the spell only when that hand is one card or none.
    // Grip of Amnesia: keep the spell unless the graveyard holds more than a few cards (they may be worth more).
    if (pend.kind === "payUnless" && pend.exileGraveyard) return [{ type: "payUnless", player: pid, pay: player(s, pid).graveyard.length <= 3 }];
    if (pend.kind === "payUnless" && pend.discardHand) return [{ type: "payUnless", player: pid, pay: player(s, pid).hand.length <= 1 }];
    if (pend.kind === "payUnless" && pend.discard) return [{ type: "payUnless", player: pid, pay: player(s, pid).hand.length >= pend.discard }];
    if (pend.kind === "payUnless" && pend.discardRandom) return [{ type: "payUnless", player: pid, pay: player(s, pid).hand.length >= pend.discardRandom }];
    // Poison counters as a payment: only while we'd stay well short of ten (CR 704.5c).
    if (pend.kind === "payUnless" && pend.poison) return [{ type: "payUnless", player: pid, pay: (player(s, pid).poison ?? 0) + pend.poison < 8 }];
    // "Ward—Blight 2": pay with a creature of ours that survives the -1/-1 counters, never our commander.
    // "Ward—Collect evidence 4": pay whenever our graveyard has enough (the cards we'd miss least, see spareEvidence).
    if (pend.kind === "payUnless" && pend.collectEvidence) return [{ type: "payUnless", player: pid, pay: (spareEvidence(s, pid, pend.collectEvidence) ?? []).length > 0 }];
    if (pend.kind === "payUnless" && pend.blight) return [{ type: "payUnless", player: pid, pay: blightHost(s, pid, blightOptions(s, pid, pend.blight), pend.blight) !== null }];
    if (pend.kind === "payUnless") {
      // Pay for ward whenever we can: the spell or ability was worth casting. Life only while we have that much (CR 119.4),
      // and a sacrifice only with enough permanents that aren't our commander.
      if (pend.life && payableLife(s, pid) <= pend.life) return [{ type: "payUnless", player: pid, pay: false }];
      if (pend.sacrifice && pickOptions(s, pend.sacrifice, pid).filter((id) => !obj(s, id).isCommander).length < pend.sacrifice.n) return [{ type: "payUnless", player: pid, pay: false }];
      // A tax whose penalty is only a card or a Treasure for its controller (Rhystic Study, Smothering Tithe, Mystic Remora):
      // {1} is worth paying, more only with plenty of mana to spare.
      const pu = s.resolving?.scratch?.punish;
      const generic = [...pend.cost.matchAll(/\{(\d+)\}|\{[^}]+\}/g)].reduce((n, x) => n + (x[1] ? Number(x[1]) : 1), 0);
      if (pu && pu.lose === undefined && generic >= 2 && !planMana(s, pid, parseManaCost(`{${generic + 3}}`))) return [{ type: "payUnless", player: pid, pay: false }];
      const taps = planMana(s, pid, parseManaCost(pend.cost));
      // Ward—Waterbend: mana first, then artifacts and creatures for the rest (CR 701.67a).
      const wb = !taps && pend.waterbend ? autoWaterbend(s, pid, parseManaCost(pend.cost), 0, pend.waterbend, []) : null;
      if (wb) return [...wb.taps, { type: "payUnless", player: pid, pay: true, tap: wb.tapped }];
      return taps ? [...taps, { type: "payUnless", player: pid, pay: true }] : [{ type: "payUnless", player: pid, pay: false }];
    }
    if (pend.kind === "discard") return [{ type: "discard", player: pid, objectIds: chooseDiscards(s, pid, pend.count, undefined, pend.filter, pend.upTo, pend.among) }];
    // Library of Leng: back on top go the spells we'd draw again, lands only while we're short of them; not a card
    // that wants the graveyard (madness, flashback and the like).
    if (pend.kind === "handToTop" && pend.discarding) {
      const wantsYard = (d: CardDef) => !!compileCard(d).madness || d.keywords.some((k) => ["Flashback", "Unearth", "Escape", "Embalm", "Eternalize", "Disturb", "Retrace", "Jump-start", "Aftermath", "Scavenge", "Dredge"].includes(k));
      const keep = pend.discarding.filter((id) => {
        const d = defOf(s, obj(s, id));
        return !wantsYard(d) && (!isType(d, "Land") || lands(s, pid) < 5);
      });
      return [{ type: "handToTop", player: pid, objectIds: keep }];
    }
    // Brainstorm: back go the cards we'd most readily discard, the better of them on top.
    // Scroll Rack: the lands we don't need, traded for fresh cards (a library short of cards trades fewer).
    if (pend.kind === "handToTop" && pend.upTo) {
      const hand = player(s, pid).hand;
      const landsInHand = hand.filter((id) => isType(defOf(s, obj(s, id)), "Land")).length;
      const spare = Math.max(0, landsInHand - (lands(s, pid) >= 5 ? 0 : 1));
      const k = Math.min(spare, player(s, pid).library.length);
      return [{ type: "handToTop", player: pid, objectIds: k ? chooseDiscards(s, pid, k).reverse() : [] }];
    }
    if (pend.kind === "handToTop") return [{ type: "handToTop", player: pid, objectIds: chooseDiscards(s, pid, pend.count).reverse() }];
    // Free from the hand: the most expensive card is the best deal.
    // From an opponent's revealed hand: take their most expensive card.
    // Memoricide's search: every card with the name it can take; from the hand last, which may give that player cards back.
    // Benthic Anomaly: the creature most worth copying (its power and toughness will be the totals anyway).
    // Phyrexian Grimoire: exile the card its controller would rather have back (the other goes to their hand); our own
    // pick (no opponent to choose) keeps the better one.
    if (pend.kind === "searchLibrary" && pend.cards.length === 2 && s.resolving?.body.effects[s.resolving.next]?.type === "topYardSplit") {
      const ranked = [...pend.cards].sort((a, b) => handWorth(s, b) - handWorth(s, a));
      return [{ type: "searchLibrary", player: pid, found: [pid === s.resolving.item.controller ? ranked[1]! : ranked[0]!] }];
    }
    // Signal the Clans: only cards with different names give a card, so the best of each name.
    if (pend.kind === "searchLibrary" && !pend.dig && s.resolving && allEffects(s.resolving.body.effects).some((x) => x.type === "search" && !!x.randomOfDistinct)) {
      const seen = new Set<string>();
      const found = chooseSearch(s, pid, pend.cards, pend.cards.length).filter((id) => !seen.has(defOf(s, obj(s, id)).name) && !!seen.add(defOf(s, obj(s, id)).name)).slice(0, pend.max);
      return [{ type: "searchLibrary", player: pid, found }];
    }
    if (pend.kind === "searchLibrary" && pend.what === "one of those creatures to copy") return [{ type: "searchLibrary", player: pid, found: [[...pend.cards].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)))[0]!] }];
    if (pend.kind === "searchLibrary" && pend.zonesOf !== undefined) {
      const rank = (id: string) => (s.objects[id]!.zone === "hand" ? 1 : 0);
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => rank(a) - rank(b)).slice(0, pend.max) }];
    }
    // Separating cards into two piles (Fact or Fiction): as even as can be, by what the cards are worth in that player's
    // hand. An opponent choosing for them takes the worse pile, they take the better one, so both ways the evener the better.
    // Truth or Tale (we separate, an opponent chooses the pile we take one card from): the best card alone, so the worse
    // pile still holds the second best, the most an opponent can be made to give.
    const pickOnePiles = pend.kind === "searchLibrary" && pend.piles && s.resolving && allEffects(s.resolving.body.effects).some((x) => x.type === "piles" && !!x.pickOne);
    if (pend.kind === "searchLibrary" && pend.piles && pickOnePiles && pend.cards.length) return [{ type: "searchLibrary", player: pid, found: [[...pend.cards].sort((a, b) => handWorth(s, b) - handWorth(s, a))[0]!] }];
    if (pend.kind === "searchLibrary" && pend.piles) return [{ type: "searchLibrary", player: pid, found: evenPiles(s, pend.forPlayer ?? pid, pend.cards) }];
    // Another player's permanents into two piles, for them to sacrifice one: as even as can be, so either pile costs them half.
    // A cost to attack (Exalted Dragon): the least valuable permanents that leave the other costs payable.
    if (pend.kind === "pickPermanents" && pend.attackCost) {
      const rest = s.declaring?.costs?.slice(1) ?? [];
      const ids: ObjectId[] = [];
      for (const id of [...pend.options].sort((a, b) => permanentWorth(s, pid, a) - permanentWorth(s, pid, b))) {
        if (ids.length < pend.count && attackCostsPayable(s, pid, rest, [...ids, id])) ids.push(id);
      }
      return [{ type: "pickPermanents", player: pid, ids }];
    }
    // Thelon's Curse: "pay {U} for each creature chosen this way": the best creatures we can pay for. On our own upkeep only
    // with half our lands at most, so the turn's spells still have mana; on another player's, as many as we can, to block.
    if (pend.kind === "pickPermanents" && pend.payEach) {
      const per = parseManaCost(pend.payEach);
      const best = [...pend.options].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)));
      const cap = s.activePlayer === pid ? Math.floor(lands(s, pid) / 2 / Math.max(1, manaValue(per))) : best.length;
      let ids: ObjectId[] = [];
      let taps: Action[] = [];
      for (let k = Math.min(cap, best.length); k > 0; k--) {
        const plan = planMana(s, pid, parseManaCost(pend.payEach.repeat(k)));
        if (plan) {
          ids = best.slice(0, k);
          taps = plan;
          break;
        }
      }
      return [...taps, { type: "pickPermanents", player: pid, ids }];
    }
    if (pend.kind === "pickPermanents" && pend.action === "pile") return [{ type: "pickPermanents", player: pid, ids: evenPiles(s, pid, pend.options, (id) => permanentWorth(s, pid, id)) }];
    // Choosing among an opponent's revealed cards (Gifts Ungiven, Intuition): the ones they'd least like where the chosen
    // ones go, by how they'd rank them for themselves.
    // Wildfire Devils: the card exiled is copied for that player to cast: our best one for us, the least useful for an opponent.
    if (pend.kind === "searchLibrary" && pend.copiedBy !== undefined) {
      const ranked = chooseSearch(s, pend.copiedBy, pend.cards, pend.cards.length);
      return [{ type: "searchLibrary", player: pid, found: pend.copiedBy === pid ? ranked.slice(0, pend.max) : ranked.slice(ranked.length - pend.max) }];
    }
    if (pend.kind === "searchLibrary" && pend.forPlayer !== undefined) {
      const ranked = chooseSearch(s, pend.forPlayer, pend.cards, pend.cards.length);
      // Guided Passage: one of each kind, the ones that help them least (a set that fits, built greedily, is as big as
      // any: the kinds are a transversal matroid).
      if (pend.oneOfEach) {
        const found: string[] = [];
        for (const id of pend.helps ? [...ranked].reverse() : ranked) if (found.length < pend.max && oneOfEachFits(pend.oneOfEach, [...found, id].map((x) => defOf(s, obj(s, x))))) found.push(id);
        return [{ type: "searchLibrary", player: pid, found }];
      }
      return [{ type: "searchLibrary", player: pid, found: pend.helps ? ranked.slice(ranked.length - pend.max) : ranked.slice(0, pend.max) }];
    }
    // Strata Scythe: the land whose name the most lands on the battlefield share.
    const scythe = pend.kind === "searchLibrary" && !pend.dig && !pend.fromHand && !pend.fromGraveyard && s.resolving?.item.sourceId ? s.objects[s.resolving.item.sourceId] : undefined;
    if (pend.kind === "searchLibrary" && scythe && compileCard(defOf(s, scythe)).statics.some((st) => JSON.stringify(st.mods).includes('"sameNameAsLinked":true'))) {
      const named = (id: string) => s.battlefield.filter((x) => objIsType(s, obj(s, x), "Land") && characteristics(s, obj(s, x)).name === defOf(s, obj(s, id)).name).length;
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => named(b) - named(a)).slice(0, Math.min(pend.max, Math.max(1, pend.min))) }];
    }
    if (pend.kind === "searchLibrary" && pend.hand !== undefined) return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => mv(s, b) - mv(s, a)).slice(0, pend.max) }];
    // "Put any number of cards from your hand on the bottom of your library, then draw that many plus one": lands once
    // there are enough of them out, spells too costly for a while.
    // Credit Voucher's shuffle into the library: the same cards as one put on the bottom.
    if (pend.kind === "searchLibrary" && pend.fromHand && (pend.bottom || pend.shuffle)) {
      const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
      return [{ type: "searchLibrary", player: pid, found: pend.cards.filter((id) => (isType(defOf(s, obj(s, id)), "Land") ? lands >= 5 : mv(s, id) > lands + 2)) }];
    }
    // Gemstone Caverns: exile a spare land when there are three or more, else the most expensive card.
    if (pend.kind === "searchLibrary" && pend.exile) {
      const lands = pend.cards.filter((id) => isType(defOf(s, obj(s, id)), "Land"));
      const pick = lands.length >= 3 ? lands : [...pend.cards].sort((a, b) => mv(s, b) - mv(s, a));
      return [{ type: "searchLibrary", player: pid, found: pick.slice(0, pend.max) }];
    }
    // Opening hand (CR 103.6a): each card that may begin on the battlefield, one of each name (Gemstone Caverns is
    // legendary, and each one costs a card from the hand).
    // Opening hand (CR 103.6b): reveal the Chancellors, but not a Providence that would lower our life total (Commander
    // starts at 40, CR 903.7).
    if (pend.kind === "searchLibrary" && pend.opening && pend.reveal) {
      const lowers = (id: ObjectId) => (compileCard(defOf(s, obj(s, id))).openingReveal?.body.effects ?? []).some((e) => e.type === "setLife" && !e.double && !e.lowest && !e.highest && !e.amount && e.n < s.players[pid]!.life);
      return [{ type: "searchLibrary", player: pid, found: pend.cards.filter((id) => !lowers(id)) }];
    }
    if (pend.kind === "searchLibrary" && pend.opening) {
      const names = new Set<string>();
      return [{ type: "searchLibrary", player: pid, found: pend.cards.filter((id) => { const n = defOf(s, obj(s, id)).name; return !names.has(n) && !!names.add(n); }) }];
    }
    // Manifesting (Kozilek, the Broken Reality): creature cards first, which can be turned face up later for their mana
    // cost (CR 701.40b), the cheapest first; then the least costly of the rest.
    if (pend.kind === "searchLibrary" && pend.fromHand && pend.manifest) {
      const creature = (id: ObjectId) => (isType(defOf(s, obj(s, id)), "Creature") ? 0 : 1);
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => creature(a) - creature(b) || mv(s, a) - mv(s, b)).slice(0, pend.max) }];
    }
    // Revealing cards from our hand for an opponent to choose one we discard (Disciple of Phenax): the cheapest ones.
    if (pend.kind === "searchLibrary" && pend.fromHand && pend.revealFor !== undefined) return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => mv(s, a) - mv(s, b)).slice(0, pend.max) }];
    // Revealing from the hand for a search for its name (Assembly Hall, Infernal Tutor): a card with another copy left in
    // our library first. Otherwise the costliest.
    // Vault 21: House Gambit: cards whose mana value others share, the biggest groups first.
    if (pend.kind === "searchLibrary" && pend.fromHand && pend.reveal && JSON.stringify(s.resolving?.body.effects ?? []).includes('"revealedSharedMv"')) {
      const same = (id: ObjectId) => pend.cards.filter((x) => mv(s, x) === mv(s, id)).length;
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => same(b) - same(a) || mv(s, a) - mv(s, b)).slice(0, pend.max) }];
    }
    if (pend.kind === "searchLibrary" && pend.fromHand) {
      const forName = pend.reveal && /"sameName":\{"revealed":true\}/.test(JSON.stringify(s.resolving?.body.effects ?? []));
      const copies = (id: ObjectId) => (forName && libraryCopies(s, pid, defOf(s, obj(s, id)).name) > 0 ? 1 : 0);
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => copies(b) - copies(a) || mv(s, b) - mv(s, a)).slice(0, pend.max) }];
    }
    // "Put any number of ... from exile onto the battlefield under your control" (Oblivion Sower): all of them.
    if (pend.kind === "searchLibrary" && pend.exiled && pend.max > 1 && pend.dig && /battlefield/.test(pend.dig.to)) return [{ type: "searchLibrary", player: pid, found: pend.cards.slice(0, pend.max) }];
    // The Eldrazi processors: the cards their owners could still play from exile first.
    if (pend.kind === "searchLibrary" && pend.exiled && pend.dig && /owners?'s? graveyards?/.test(pend.dig.to)) return [{ type: "searchLibrary", player: pid, found: processOrder(s, pid, pend.cards).slice(0, pend.max) }];
    // Dauthi Voidwalker: the most expensive spell, to cast for free now (a land only if that's all there is).
    if (pend.kind === "searchLibrary" && pend.exiled) {
      const land = (id: string) => (isType(defOf(s, obj(s, id)), "Land") ? 1 : 0);
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => land(a) - land(b) || mv(s, b) - mv(s, a)).slice(0, 1) }];
    }
    // Hideaway: the most expensive card, to play for free later.
    if (pend.kind === "searchLibrary" && pend.dig && /hideaway/.test(pend.dig.to)) return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => mv(s, b) - mv(s, a)).slice(0, 1) }];
    if (pend.kind === "searchLibrary" && pend.dig && /face down/.test(pend.dig.to)) return [{ type: "searchLibrary", player: pid, found: chooseManifest(s, pid, pend.cards, pend.max) }];
    // "Exile a card from a graveyard" (Cemetery Prowler): an opponent's card if there is one, the one sharing the most card
    // types with the cards in our hand (the exiled card's types matter to these cards), the dearest first.
    if (pend.kind === "searchLibrary" && pend.fromGraveyard === "exile" && pend.cards.some((id) => obj(s, id).owner !== pid)) {
      const ours = player(s, pid).hand.flatMap((id) => defOf(s, obj(s, id)).types);
      const score = (id: ObjectId) => defOf(s, obj(s, id)).types.reduce((n, t) => n + ours.filter((x) => x === t).length, 0);
      const theirs = pend.cards.filter((id) => obj(s, id).owner !== pid).sort((a, b) => score(b) - score(a) || mv(s, b) - mv(s, a));
      return [{ type: "searchLibrary", player: pid, found: theirs.slice(0, pend.min) }];
    }
    // Watchers of the Dead: the cards to keep (the rest are exiled), those we can use there first, then the dearest.
    if (pend.kind === "searchLibrary" && pend.fromGraveyard === "keep")
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => Number(usefulInGraveyard(s, b)) - Number(usefulInGraveyard(s, a)) || mv(s, b) - mv(s, a)).slice(0, pend.max) }];
    // Grave Consequences: "Then each player loses 1 life for each card in their graveyard": every card we have no use for
    // there, or all of them when that life would hurt.
    const perCard = pend.kind === "searchLibrary" && pend.fromGraveyard === "exile" && s.resolving ? s.resolving.body.effects.slice(s.resolving.next ?? 0).some((x) => x.type === "loseLife" && typeof x.n === "object" && x.n.count.kind === "cardsInGraveyard") : false;
    if (pend.kind === "searchLibrary" && perCard) {
      const keep = player(s, pid).life - pend.cards.length > 10 ? pend.cards.filter((id) => usefulInGraveyard(s, id)) : [];
      return [{ type: "searchLibrary", player: pid, found: pend.cards.filter((id) => !keep.includes(id)).slice(0, pend.max) }];
    }
    // Exiling cards from our own graveyard: the ones we have no use for there, the cheapest first.
    if (pend.kind === "searchLibrary" && pend.fromGraveyard === "exile")
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => Number(usefulInGraveyard(s, a)) - Number(usefulInGraveyard(s, b)) || mv(s, a) - mv(s, b)).slice(0, pend.min) }];
    // "Exactly two cards" (Burning-Rune Demon): the best ones, all of them, or none if there aren't enough.
    if (pend.kind === "searchLibrary" && pend.exactly) {
      const best = chooseSearch(s, pid, pend.cards, pend.max);
      return [{ type: "searchLibrary", player: pid, found: best.length === pend.max ? best : [] }];
    }
    // "Cards with different mana values" (Seasons Past): the best card of each mana value.
    if (pend.kind === "searchLibrary" && pend.distinctManaValues) {
      const ranked = chooseSearch(s, pid, pend.cards, pend.cards.length);
      return [{ type: "searchLibrary", player: pid, found: ranked.filter((id, i) => ranked.findIndex((x) => mv(s, x) === mv(s, id)) === i) }];
    }
    // "Cards with different powers" (Rip, Spawn Hunter): the best card of each power.
    if (pend.kind === "searchLibrary" && pend.distinctPowers) {
      const ranked = chooseSearch(s, pid, pend.cards, pend.cards.length);
      const pow = (id: string) => characteristics(s, s.objects[id]!).power;
      return [{ type: "searchLibrary", player: pid, found: ranked.filter((id, i) => ranked.findIndex((x) => pow(x) === pow(id)) === i).slice(0, pend.max) }];
    }
    // "With total mana value 4 or less" (Lively Dirge): the best-ranked cards that still fit.
    if (pend.kind === "searchLibrary" && pend.totalMv !== undefined) {
      const found: string[] = [];
      let left = pend.totalMv;
      for (const id of chooseSearch(s, pid, pend.cards, pend.cards.length)) {
        if (found.length >= pend.max || mv(s, id) > left) continue;
        found.push(id);
        left -= mv(s, id);
      }
      return [{ type: "searchLibrary", player: pid, found }];
    }
    // "Basic land cards that share a land type" (Myriad Landscape): as many as we can of one type, the best-ranked first.
    if (pend.kind === "searchLibrary" && pend.shareLandType) {
      const ranked = chooseSearch(s, pid, pend.cards, pend.cards.length);
      const groups = ranked.map((first) => [first, ...ranked.filter((id) => id !== first && shareLandType([defOf(s, obj(s, first)), defOf(s, obj(s, id))]))].slice(0, pend.max));
      const best = groups.reduce<string[]>((a, g) => (g.length > a.length ? g : a), []);
      return [{ type: "searchLibrary", player: pid, found: best }];
    }
    // Canoptek Wraith: "basic land cards which have the same name": as many as we can of one name, the best-ranked first.
    if (pend.kind === "searchLibrary" && pend.oneName) {
      const ranked = chooseSearch(s, pid, pend.cards, pend.cards.length);
      const groups = ranked.map((first) => ranked.filter((id) => sameName(defOf(s, obj(s, id)).name, defOf(s, obj(s, first)).name)).slice(0, pend.max));
      const best = groups.reduce<string[]>((a, g) => (g.length > a.length ? g : a), []);
      return [{ type: "searchLibrary", player: pid, found: best }];
    }
    // "A Forest card and a Plains card" (Krosan Verge): the best-ranked cards that still fit one each.
    if (pend.kind === "searchLibrary" && pend.oneOfEach) {
      const found: string[] = [];
      for (const id of chooseSearch(s, pid, pend.cards, pend.cards.length)) if (found.length < pend.max && oneOfEachFits(pend.oneOfEach, [...found, id].map((x) => defOf(s, obj(s, x))))) found.push(id);
      return [{ type: "searchLibrary", player: pid, found }];
    }
    // Foresight: the cards it wants least (as many as it must); "any number of" (Selective Memory): none.
    if (pend.kind === "searchLibrary" && pend.away) return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b))).slice(0, pend.min) }];
    // Search for Blex: each card taken costs life; at most two, keeping 10 life.
    if (pend.kind === "searchLibrary" && pend.dig?.lifeEach) return [{ type: "searchLibrary", player: pid, found: chooseSearch(s, pid, pend.cards, Math.max(0, Math.min(pend.max, 2, Math.floor((player(s, pid).life - 10) / pend.dig.lifeEach)))) }];
    // Wand of Denial: pay life to mill an opponent's nonland card, keeping 10 life; never its own.
    if (pend.kind === "searchLibrary" && pend.dig?.payLife) {
      const theirs = pend.cards.filter((id) => obj(s, id).owner !== pid);
      return [{ type: "searchLibrary", player: pid, found: player(s, pid).life - pend.dig.payLife >= 10 ? theirs.slice(0, pend.max) : [] }];
    }
    // Puresight Merrow: "Look at the top card of your library. You may exile that card.": exile it only to skip a land it
    // doesn't need (five or more lands already).
    if (pend.kind === "searchLibrary" && pend.dig?.to === "into exile" && pend.min === 0 && pend.cards.every((id) => obj(s, id).owner === pid)) {
      const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
      return [{ type: "searchLibrary", player: pid, found: lands >= 5 ? pend.cards.filter((id) => defOf(s, obj(s, id)).types.includes("Land")).slice(0, pend.max) : [] }];
    }
    // Descent into Madness: what we'd miss least, hand cards (lands first) before permanents, then the smallest.
    if (pend.kind === "searchLibrary" && s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "eachExilesPermanentsOrHand")) {
      const cost = (id: ObjectId) => {
        const o = obj(s, id);
        if (o.zone === "hand") return isType(defOf(s, o), "Land") ? 1 : 2 + defMv(defOf(s, o));
        return 3 + worth(s, pid, o);
      };
      return [{ type: "searchLibrary", player: pid, found: [...pend.cards].sort((a, b) => cost(a) - cost(b)).slice(0, pend.min) }];
    }
    if (pend.kind === "searchLibrary") return [{ type: "searchLibrary", player: pid, found: chooseSearch(s, pid, pend.cards, pend.max) }];
    if (pend.kind === "manaMix") return [{ type: "manaMix", player: pid, counts: chooseManaMix(s, pid, pend.n, pend.colors) }];
    if (pend.kind === "distribute") return [{ type: "distribute", player: pid, parts: pend.remove ? chooseCounterRemoval(s, pid, pend.options, pend.total, pend.has ?? {}) : pend.move ? chooseCounterMove(s, pid, pend.options, pend.total, pend.counter) : chooseDistribution(s, pid, pend.options, pend.total, pend.counter) }];
    // Soulbond: always pair, with the best creature (the bonus lands on both).
    // Malik, Grim Manipulator: their best creature goes; of our own, the least useful one (the other choice is hidden).
    // The Caves of Androzani: ours with a counter that helps, others' with one that hurts (as proliferate decides), and
    // that kind.
    if (s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "counterOfKindEach")) {
      const helpful = (k: string) => k !== "-1/-1" && k !== "stun" && k !== "age" && k !== "time" && k !== "fade" && k !== "doom";
      const good = (o: GameObject) => Object.keys(o.counters).filter((k) => (o.counters[k] ?? 0) > 0 && (controllerOf(s, o) === pid ? helpful(k) : harmfulCounter(k)));
      if (pend.kind === "pickPermanents" && pend.anyNumber) return [{ type: "pickPermanents", player: pid, ids: pend.options.filter((id) => good(obj(s, id)).length > 0) }];
      if (pend.kind === "chooseOption" && pend.what === "counterKind" && pend.about) {
        const g = good(obj(s, pend.about));
        return [{ type: "chooseOption", player: pid, choice: g.includes("+1/+1") ? "+1/+1" : g.find((k) => pend.options.includes(k)) ?? pend.options[0]! }];
      }
    }
    // Order of Succession: the best of the creatures we gain control of.
    if (pend.kind === "pickPermanents" && pend.action === "choose" && s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "successionControl"))
      return [{ type: "pickPermanents", player: pid, ids: [[...pend.options].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)))[0]!] }];
    if (pend.kind === "pickPermanents" && pend.secret) {
      const sorted = [...pend.options].sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b)));
      return [{ type: "pickPermanents", player: pid, ids: [pend.secret === "theirs" ? sorted[sorted.length - 1]! : sorted[0]!] }];
    }
    if (pend.kind === "pickPermanents" && pend.action === "pair") return [{ type: "pickPermanents", player: pid, ids: choosePicks(s, pid, pend.options, 1, "populate") }];
    // Banding (CR 702.22c): the bot doesn't band; a block on one would block them all.
    if (pend.kind === "pickPermanents" && pend.action === "ringBearer") return [{ type: "pickPermanents", player: pid, ids: [chooseRingBearer(s, pid, pend.options)] }];
    if (pend.kind === "pickPermanents" && pend.action === "band") return [{ type: "pickPermanents", player: pid, ids: [] }];
    // Exert (CR 701.43d): for its "when you do" bonus, while there's life to spare for it not untapping.
    if (pend.kind === "pickPermanents" && pend.action === "exert") return [{ type: "pickPermanents", player: pid, ids: chooseExert(s, pid, pend.options) }];
    // "You may choose not to untap ~": keep it tapped while one of its "for as long as ~ remains tapped" effects lasts.
    // Keep tapped what an effect lasts for while it's tapped, and a storage land saving up (Bottomless Vault gets a counter
    // at upkeep while tapped) until it has three.
    if (pend.kind === "pickPermanents" && pend.action === "keepTapped") {
      const saving = (id: string) => manaAbilitiesOn(s, obj(s, id)).some((ab) => ab.produces.kind === "removeX" && (obj(s, id).counters[ab.produces.counter] ?? 0) < 3);
      return [{ type: "pickPermanents", player: pid, ids: pend.options.filter((id) => s.effects.some((e) => e.whileTapped?.id === id) || saving(id)) }];
    }
    // Winter Orb and the like: untap the most useful ones the limits allow (lands making a color we lack first).
    if (pend.kind === "pickPermanents" && pend.action === "untapLimited") return [{ type: "pickPermanents", player: pid, ids: chooseLimitedUntap(s, pid, pend.options) }];
    // Ripples of Potential: phase out what an opponent's spell or ability on the stack is aimed at, to save it.
    if (pend.kind === "pickPermanents" && pend.action === "phaseOut") {
      const aimed = new Set(s.stack.filter((it) => it.controller !== pid).flatMap((it) => it.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])));
      return [{ type: "pickPermanents", player: pid, ids: pend.options.filter((id) => aimed.has(id)) }];
    }
    if (pend.kind === "pickPermanents" && pend.action === "enlist") return [{ type: "pickPermanents", player: pid, ids: chooseEnlist(s, pid, pend.options) }];
    if (pend.kind === "pickPermanents" && pend.action === "unblocked") return [{ type: "pickPermanents", player: pid, ids: chooseUnblocked(s, pid, pend.options) }];
    // Cunning Giant: its combat damage to the most valuable creature it kills, unless it would finish the player it's attacking.
    if (pend.kind === "pickPermanents" && pend.action === "damageCreature") {
      const c = s.creatureDamageChoice;
      const at = c?.current ? s.objects[c.current] : undefined;
      const n = at ? combatDamageOf(s, at) : 0;
      const finishes = !!at && at.attacking !== undefined && !at.attackingPermanent && player(s, at.attacking).life <= n;
      const kills = pend.options.map((id) => obj(s, id)).filter((x) => !objHasKeyword(s, x, "Indestructible") && (objHasKeyword(s, at!, "Deathtouch") || toughness(s, x) - (x.damage ?? 0) <= n));
      const best = finishes ? undefined : kills.sort((a, b) => power(s, b) + toughness(s, b) - (power(s, a) + toughness(s, a)))[0];
      return [{ type: "pickPermanents", player: pid, ids: best && power(s, best) + toughness(s, best) >= 4 ? [best.id] : [] }];
    }
    // Indominus Rex: a card only for a keyword counter no card chosen so far gives (each counter draws a card back), the
    // cheapest first.
    if (pend.kind === "pickPermanents" && pend.action === "discard" && pend.objectId) {
      const rex = s.objects[pend.objectId]!;
      const ids: ObjectId[] = [];
      for (const id of [...pend.options].sort((a, b) => mv(s, a) - mv(s, b)))
        if (discardKeywordKinds(s, rex, [...ids, id]).length > discardKeywordKinds(s, rex, ids).length) ids.push(id);
      return [{ type: "pickPermanents", player: pid, ids }];
    }
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
    if (pend.kind === "pickPermanents" && pend.action === "untap") return [{ type: "pickPermanents", player: pid, ids: choosePicks(s, pid, pend.options, pend.count, "untap") }];
    if (pend.kind === "pickPermanents" && pend.action === "tap") {
      // Exactly that many ("you may tap three untapped creatures you control", Aziza, once we said yes): creatures that
      // could still attack too, if it takes them.
      const ids = choosePicks(s, pid, pend.options, pend.count, "tap");
      if (pend.min === undefined && !pend.anyNumber && ids.length < pend.count) ids.push(...pend.options.filter((id) => !ids.includes(id)).slice(0, pend.count - ids.length));
      return [{ type: "pickPermanents", player: pid, ids }];
    }
    // SOLDIER Military Program: "a +1/+1 counter on each of up to two Soldiers you control": as many as it allows, our own.
    if (pend.kind === "pickPermanents" && pend.action === "counters" && pend.min === 0 && pend.count > 1 && s.resolving?.item.controller === pid)
      return [{ type: "pickPermanents", player: pid, ids: choosePicks(s, pid, pend.options, pend.count, "counters", pend.counter) }];
    // Orzhov Advokist: the counters on our best creature, unless its controller is the only opponent we could attack.
    if (pend.kind === "pickPermanents" && pend.action === "counters" && pend.min === 0 && pend.count === 1) {
      const giver = s.resolving?.item.controller;
      const others = opponents(s, pid).filter((p) => p !== giver);
      return [{ type: "pickPermanents", player: pid, ids: giver === pid || others.length ? choosePicks(s, pid, pend.options, 1, "counters", pend.counter) : [] }];
    }
    // Blighting for ward (see payUnless): the least useful creature that survives the counters, else the least useful.
    if (pend.kind === "pickPermanents" && pend.action === "counters" && pend.counter === "-1/-1" && /^blight \d+:/.test(pend.prompt ?? "")) {
      const n = Number(/^blight (\d+)/.exec(pend.prompt!)![1]);
      return [{ type: "pickPermanents", player: pid, ids: [blightHost(s, pid, pend.options, n) ?? [...pend.options].sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b)))[0]!] }];
    }
    // Nahiri's Resolve: gone until our next upkeep, a creature can't block meanwhile: only noncreature ones then.
    if (pend.kind === "pickPermanents" && pend.action === "flicker") {
      const next = s.resolving?.body.effects[s.resolving.next + 1];
      const untilUpkeep = next?.type === "flicker" && next.at === "yourNextUpkeep";
      return [{ type: "pickPermanents", player: pid, ids: chooseFlickers(s, pid, pend.options).filter((id) => !untilUpkeep || !objIsType(s, obj(s, id), "Creature")) }];
    }
    // Birthing Ritual: sacrifice a creature (never a commander) for a better one among the cards looked at, one with
    // mana value 1 more (or a token for one with mana value 1 or less), the cheapest such creature first.
    if (pend.kind === "pickPermanents" && pend.looked && pend.action === "sacrifice") {
      const creatures = pend.looked.map((id) => defOf(s, obj(s, id))).filter((d) => isType(d, "Creature"));
      const pick = pend.options
        .map((id) => obj(s, id))
        .filter((o) => !o.isCommander)
        .filter((o) => {
          const mv = o.isToken ? 0 : defMv(defOf(s, o));
          return creatures.some((d) => defMv(d) <= mv + 1 && (defMv(d) > mv || (o.isToken && defMv(d) >= 1)));
        })
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
      return [{ type: "pickPermanents", player: pid, ids: pick ? [pick.id] : [] }];
    }
    // Spry and Mighty: "X is the difference between the chosen creatures' powers": the strongest and the weakest.
    if (pend.kind === "pickPermanents" && pend.action === "choose" && pend.count === 2 && s.resolving && JSON.stringify(s.resolving.body.effects).includes('"powerDifference"')) {
      const byPower = [...pend.options].sort((a, b) => power(s, obj(s, b)) - power(s, obj(s, a)) || worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)));
      return [{ type: "pickPermanents", player: pid, ids: byPower.length > 1 ? [byPower[0]!, byPower[byPower.length - 1]!] : byPower }];
    }
    // Battle for Bretagard: "For each of them, create a token that's a copy of it": one of each name, the best first.
    if (pend.kind === "pickPermanents" && pend.differentNames && pend.action === "choose") return [{ type: "pickPermanents", player: pid, ids: differentlyNamed(s, [...pend.options].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)))) }];
    // Sigarda's Vanguard: double strike for its own creatures, one of each power, the best of each first (others' creatures
    // would only gain it too).
    // Celestial Judgment: one of each power, the rest destroyed: our own best of each power, else the other player's least
    // valuable, so the better ones go.
    if (pend.kind === "pickPermanents" && pend.differentPowers && pend.action === "choose" && !pend.anyNumber) {
      const byPower = new Map<number, ObjectId[]>();
      for (const id of pend.options) byPower.set(power(s, obj(s, id)), [...(byPower.get(power(s, obj(s, id))) ?? []), id]);
      const ids = [...byPower.values()].map((group) => {
        const mine = group.filter((id) => controllerOf(s, obj(s, id)) === pid).sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)));
        return mine[0] ?? [...group].sort((a, b) => worth(s, controllerOf(s, obj(s, a)), obj(s, a)) - worth(s, controllerOf(s, obj(s, b)), obj(s, b)))[0]!;
      });
      return [{ type: "pickPermanents", player: pid, ids: ids.slice(0, pend.count) }];
    }
    if (pend.kind === "pickPermanents" && pend.differentPowers && pend.action === "choose") {
      const seen = new Set<number>();
      const ids = pend.options.filter((id) => controllerOf(s, obj(s, id)) === pid).sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))).filter((id) => {
        const pw = power(s, obj(s, id));
        if (seen.has(pw)) return false;
        seen.add(pw);
        return true;
      });
      return [{ type: "pickPermanents", player: pid, ids }];
    }
    // "Remove a lore counter from each of any number of Sagas you control. Put a +1/+1 counter on ~ for each lore counter
    // removed this way" (Garnet): each of ours that has one, for the counters, and its chapter comes again.
    const removing = pend.kind === "pickPermanents" && pend.action === "choose" && pend.anyNumber ? s.resolving?.body.effects[s.resolving.next + 1] : undefined;
    if (pend.kind === "pickPermanents" && removing?.type === "removeCounters" && removing.what.ref === "created")
      // Chandra, Legacy of Fire (loyalty counters, a card each): only planeswalkers that keep one, so none of ours dies.
      return [{ type: "pickPermanents", player: pid, ids: pend.options.filter((id) => controllerOf(s, obj(s, id)) === pid && (obj(s, id).counters[removing.counter] ?? 0) > (removing.counter === "loyalty" ? 1 : 0)) }];
    // "Remove a counter from a creature or planeswalker you control" (Sanctuary Warden, Mister Hyde, Chisei), "a +1/+1
    // counter from each of two creatures you control" (Dyadrine): ours with a harmful counter first (-1/-1, stun), then
    // those with the most counters to spare; never a planeswalker's last loyalty counter while another will do.
    // The pick may sit inside a "may" (Sanctuary Warden): the effect after it, in the body's preorder, comes next.
    const flat = pend.kind === "pickPermanents" && pend.action === "choose" && !pend.anyNumber && pend.min === undefined && s.resolving ? allEffects(s.resolving.body.effects) : [];
    const at = flat.findIndex((x) => x.type === "pick" && pend.kind === "pickPermanents" && x.prompt === pend.prompt);
    const unloading = at >= 0 ? flat[at + 1] : undefined;
    if (pend.kind === "pickPermanents" && (unloading?.type === "removeAnyCounters" || unloading?.type === "removeCounters") && unloading.what.ref === "created" && pend.options.every((id) => controllerOf(s, obj(s, id)) === pid)) {
      const score = (id: ObjectId) => {
        const c = obj(s, id).counters;
        const harmful = Object.entries(c).some(([k, n]) => n > 0 && harmfulCounter(k));
        const total = Object.values(c).reduce((a, b) => a + Math.max(0, b), 0);
        const lastLoyalty = objIsType(s, obj(s, id), "Planeswalker") && (c.loyalty ?? 0) <= 1 && total <= 1;
        return (harmful ? 100 : 0) + total - (lastLoyalty ? 1000 : 0);
      };
      return [{ type: "pickPermanents", player: pid, ids: [...pend.options].sort((a, b) => score(b) - score(a)).slice(0, pend.count) }];
    }
    // Flaming Gambit: its damage to one of our creatures instead of us or our planeswalker: one that survives it, or the
    // least valuable when the damage would kill us (or the planeswalker); otherwise none.
    const redirect = pend.kind === "pickPermanents" && pend.action === "choose" && pend.min === 0 && pend.count === 1 ? s.resolving?.body.effects[s.resolving.next + 1] : undefined;
    if (pend.kind === "pickPermanents" && redirect?.type === "if" && redirect.cond.kind === "createdNone" && redirect.effects[0]?.type === "damage" && redirect.otherwise?.[0]?.type === "damage") {
      const r = s.resolving!;
      const n = evalAmount(s, redirect.effects[0].amount, { controller: r.item.controller, ...(r.item.sourceId ? { sourceId: r.item.sourceId } : {}), x: r.item.x ?? 0 });
      const ours = pend.options.filter((id) => controllerOf(s, obj(s, id)) === pid).sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b)));
      const lasting = ours.filter((id) => toughness(s, obj(s, id)) - (obj(s, id).damage ?? 0) > n);
      const t = r.item.targets?.[0];
      const pw = t?.kind === "object" ? s.objects[t.id] : undefined;
      const kills = pw ? (pw.counters.loyalty ?? 0) <= n : player(s, pid).life <= n;
      return [{ type: "pickPermanents", player: pid, ids: n <= 0 ? [] : lasting.length ? [lasting[0]!] : kills && ours.length ? [ours[0]!] : [] }];
    }
    // Krenko's Buzzcrusher: for each player, up to one of their permanents to destroy: an opponent's best one, none of ours.
    const destroying = pend.kind === "pickPermanents" && pend.action === "choose" && pend.min === 0 && pend.count === 1 ? s.resolving?.body.effects[s.resolving.next + 1] : undefined;
    if (pend.kind === "pickPermanents" && destroying?.type === "destroy" && destroying.what.ref === "created") {
      const theirs = pend.options.filter((id) => controllerOf(s, obj(s, id)) !== pid).map((id) => ({ id, w: permanentWorth(s, pid, id) })).sort((a, b) => b.w - a.w);
      return [{ type: "pickPermanents", player: pid, ids: theirs[0] && theirs[0].w > 0 ? [theirs[0].id] : [] }];
    }
    // Thunderwave: "You may choose a creature. ~ deals 3 damage to each creature not chosen this way": spare our best one.
    const sparing = pend.kind === "pickPermanents" && pend.action === "choose" && pend.min === 0 && pend.count === 1 ? s.resolving?.body.effects : undefined;
    const spareAt = sparing ? allEffects(sparing).find((x) => x.type === "damage" && "ref" in x.to && x.to.ref === "each" && x.to.notCreated) : undefined;
    if (pend.kind === "pickPermanents" && spareAt) {
      const ours = pend.options.filter((id) => controllerOf(s, obj(s, id)) === pid).sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)));
      return [{ type: "pickPermanents", player: pid, ids: ours.slice(0, 1) }];
    }
    // Temporal Firestorm: "up to X creatures and/or planeswalkers you control" phase out before the damage: our best ones.
    const phasing = pend.kind === "pickPermanents" && pend.action === "choose" && pend.min === 0 ? s.resolving?.body.effects[s.resolving.next + 1] : undefined;
    if (pend.kind === "pickPermanents" && phasing?.type === "phaseOut" && phasing.what.ref === "created")
      return [{ type: "pickPermanents", player: pid, ids: pend.options.filter((id) => controllerOf(s, obj(s, id)) === pid).sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))).slice(0, pend.count) }];
    if (pend.kind === "pickPermanents" && pend.min !== undefined && pend.action !== "keep") return [{ type: "pickPermanents", player: pid, ids: chooseOptionalSacrifices(s, pid, pend) }];
    // Stick Together: for this slot of the party, the creature the most valuable whole party (this slot and the ones still
    // to come, each creature once) uses, or none.
    const partyFx = pend.kind === "pickPermanents" && pend.action === "keep" && s.resolving ? s.resolving.body.effects[s.resolving.next] : undefined;
    const partySlot = s.resolving?.scratch?.keepRest?.slot;
    if (pend.kind === "pickPermanents" && partyFx?.type === "keepRest" && partySlot !== undefined && partyFx.keep[partySlot]?.notKept) {
      const slots = partyFx.keep.slice(partySlot);
      const kept = s.resolving!.scratch!.keepRest!.kept[pid] ?? [];
      const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature") && !kept.includes(id));
      const fits = slots.map((k) => mine.filter((id) => objectMatches(s, { ...k.filter, controller: "you" }, obj(s, id), pid, false)));
      let best: { value: number; first?: ObjectId } = { value: -1 };
      const walk = (i: number, used: ObjectId[], value: number) => {
        if (i === slots.length) {
          if (value > best.value) best = { value, ...(used[0] !== "" && used[0] !== undefined ? { first: used[0] } : {}) };
          return;
        }
        walk(i + 1, [...used, ""], value);
        for (const id of fits[i]!) if (!used.includes(id)) walk(i + 1, [...used, id], value + Math.max(1, worth(s, pid, obj(s, id))));
      };
      walk(0, [], 0);
      return [{ type: "pickPermanents", player: pid, ids: best.first && pend.options.includes(best.first) ? [best.first] : [] }];
    }
    // Slaughter the Strong: our best creatures that fit in the total power, those with no power (or less) first.
    if (pend.kind === "pickPermanents" && pend.action === "keep" && pend.maxTotalPower !== undefined) {
      const ids: ObjectId[] = [];
      let total = 0;
      const pw = (id: ObjectId) => power(s, obj(s, id));
      for (const id of [...pend.options].sort((a, b) => Number(pw(a) > 0) - Number(pw(b) > 0) || worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))))
        if (total + pw(id) <= pend.maxTotalPower) (ids.push(id), (total += pw(id)));
      return [{ type: "pickPermanents", player: pid, ids }];
    }
    // Killing Wave: our best creatures, each while it's worth the life it costs (the more, the closer to 0), never all of it.
    if (pend.kind === "pickPermanents" && pend.action === "keep" && pend.payLife !== undefined) {
      const ids: ObjectId[] = [];
      let life = player(s, pid).life;
      for (const id of [...pend.options].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)))) {
        const n = pend.payLife;
        if (ids.length >= pend.count || (n > 0 && (n >= life || worth(s, pid, obj(s, id)) < n * (1 + 15 / Math.max(1, life - n))))) continue;
        ids.push(id);
        life -= n;
      }
      return [{ type: "pickPermanents", player: pid, ids }];
    }
    if (pend.kind === "pickPermanents") return [{ type: "pickPermanents", player: pid, ids: choosePicks(s, pid, pend.options, pend.count, pend.action, pend.counter) }];
    // A secret number, without looking at the others' (Wheel of Misfortune): 1 to get a new hand when ours is nearly empty
    // and we can take the damage, otherwise 0 (no damage, keep our hand). Menacing Ogre: its controller with plenty of
    // life goes for the counters.
    // Life bidding (Illicit Auction, Mages' Contest, Pain's Reward): start at 0, then top by one while the bid stays under
    // what the prize is roughly worth to us, never bidding our life below 11.
    if (pend.kind === "chooseOption" && pend.what === "bid") {
      const bl = s.resolving ? allEffects(s.resolving.body.effects).find((x) => x.type === "bidLife") : undefined;
      const me = player(s, pid);
      const t = s.resolving?.item.targets?.[0];
      const it = t?.kind === "object" ? s.objects[t.id] : undefined;
      const spell = t?.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
      const spellCard = spell?.kind === "spell" && spell.objectId ? s.objects[spell.objectId] : undefined;
      const prize = bl?.type === "bidLife" ? bl.prize : "draw";
      const worth =
        prize === "draw" ? 4
        : prize === "control" ? (it?.zone === "battlefield" ? 1 + defMv(defOf(s, it)) + Math.max(0, power(s, it)) : 0)
        : spell && spellCard ? (spell.controller === pid ? 2 : 1) + defMv(defOf(s, spellCard)) : 0;
      const most = Math.min(Math.max(0, me.life - 11), Math.round(worth));
      const next = pend.numberRange?.min ?? 0;
      if (!pend.options.includes("pass")) return [{ type: "chooseOption", player: pid, choice: "0" }];
      return [{ type: "chooseOption", player: pid, choice: next <= most ? String(next) : "pass" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "secretNumber") {
      const sn = s.resolving ? allEffects(s.resolving.body.effects).find((x) => x.type === "secretNumbers") : undefined;
      const me = player(s, pid);
      // Goblin Game: few items, but not so few that it's likely the fewest when life is high (half of it is the bigger loss).
      const n = sn?.type === "secretNumbers" && sn.then === "goblin" ? (me.life >= 16 ? 3 : 1) : sn?.type === "secretNumbers" && sn.then === "ogre" ? (s.resolving?.item.controller === pid && me.life > 20 ? 3 : 0) : me.hand.length <= 2 && me.life > 10 ? 1 : 0;
      return [{ type: "chooseOption", player: pid, choice: String(n) }];
    }
    if (pend.kind === "chooseOption" && (pend.what === "riot" || pend.what === "unleash")) {
      // Riot: haste when it can still attack this turn, the counter otherwise. Unleash: the counter, unless we need blockers.
      const haste = pend.what === "riot" && s.activePlayer === pid && s.step === "main1";
      const counter = pend.what === "riot" ? !haste : player(s, pid).life > 12;
      return [{ type: "chooseOption", player: pid, choice: counter ? ENTERS_COUNTER : pend.options[1]! }];
    }
    // Time travel (CR 701.56a): a suspended card or an impending permanent comes sooner with one fewer; a permanent with
    // vanishing lasts longer, and one whose mana or power counts its time counters grows, with one more. Anything else
    // stays as it is.
    // Quarry Hauler: on our own permanent, more of what helps it and less of what doesn't (proliferate's sense); on an
    // opponent's, the other way round.
    if (pend.kind === "chooseOption" && pend.what === "addOrRemoveCounter") {
      const o = pend.about ? s.objects[pend.about] : undefined;
      const k = pend.counterKind ?? "";
      const helpful = k !== "-1/-1" && k !== "stun" && k !== "age" && k !== "time" && k !== "fade";
      const mine = !!o && controllerOf(s, o) === pid;
      // Clockspinning, Jhoira's Timebug: a time counter on a suspended card (CR 702.62b), its owner's, comes off for our
      // own (sooner) and goes on for an opponent's (later); with "you may", a time counter on our own permanent goes on
      // (vanishing lasts longer), unless it's impending (it becomes a creature sooner).
      if (o?.zone === "exile" && k === "time") return [{ type: "chooseOption", player: pid, choice: o.owner === pid ? "remove" : "add" }];
      if (o && k === "time" && pend.options.includes("none")) return [{ type: "chooseOption", player: pid, choice: mine ? (o.castAlt === "impending" ? "remove" : "add") : "none" }];
      return [{ type: "chooseOption", player: pid, choice: (mine ? helpful : harmfulCounter(k)) ? "add" : "remove" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "timeTravel") {
      const o = pend.about ? s.objects[pend.about] : undefined;
      const mine = o?.zone === "battlefield" && controllerOf(s, o) === pid;
      const cc = o ? compileCard(defOf(s, o)) : undefined;
      const choice = !o
        ? "none"
        : o.zone === "exile" || (mine && o.castAlt === "impending")
          ? "remove"
          : mine && (cc!.triggers.some((t) => t.event === "selfLastTimeCounterRemoved") || /"counter":"time"/.test(JSON.stringify([cc!.mana, cc!.statics])))
            ? "add"
            : "none";
      return [{ type: "chooseOption", player: pid, choice }];
    }
    // "Enters with your choice of a flying counter or a first strike counter": evasion first, then what wins fights.
    if (pend.kind === "chooseOption" && pend.what === "counterChoice") {
      const rank = ["flying", "deathtouch", "menace", "trample", "+1/+1", "first strike", "hexproof", "lifelink", "reach", "vigilance"];
      const score = (k: string) => (rank.includes(k) ? rank.indexOf(k) : rank.length);
      // Grimdancer's pairs "a|b": the best two.
      const pairScore = (o: string) => o.split("|").reduce((t, k) => t + score(k), 0);
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => pairScore(a) - pairScore(b))[0]! }];
    }
    // "As ~ enters, it becomes your choice of a 3/3 creature with flying, ... or a 0/12 creature with defender": the one
    // that attacks best, flying first, never defender, then the most power.
    // Aquamorph Entity turned face up by an effect: as for the special action (botFaceUpForm).
    if (pend.kind === "chooseOption" && pend.what === "faceUpForm") return [{ type: "chooseOption", player: pid, choice: pend.options[botFormIndex(pend.labels ?? [])] ?? pend.options[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "form") {
      const score = (label: string) => (/defender/.test(label) ? -100 : 0) + (/flying/.test(label) ? 10 : 0) + Number(/(\d+)\//.exec(label)?.[1] ?? 0);
      const best = pend.options.map((o, i) => ({ o, sc: score(pend.labels?.[i] ?? "") })).sort((a, b) => b.sc - a.sc)[0]!;
      return [{ type: "chooseOption", player: pid, choice: best.o }];
    }
    // "As ~ enters, pay any amount of life" (Minion of the Wastes, Phyrexian Processor): up to 7, keeping 12 life, and at
    // least 1 while we can spare it (a 0/0 Minion dies at once).
    if (pend.kind === "chooseOption" && pend.what === "lifeAsEnters") {
      const life = player(s, pid).life;
      const max = pend.numberRange?.max ?? 0;
      const n = Math.max(Math.min(max, life > 5 ? 1 : 0), Math.min(max, life - 12, 7));
      return [{ type: "chooseOption", player: pid, choice: String(n) }];
    }
    // Grifter's Blade: on our strongest creature.
    if (pend.kind === "chooseOption" && pend.what === "attachHost") {
      const best = [...pend.options].sort((a, b) => power(s, obj(s, b)) - power(s, obj(s, a)))[0]!;
      return [{ type: "chooseOption", player: pid, choice: best }];
    }
    // Tribute (CR 702.104a): ask the opponent with the most life, who can best afford to let its ability happen.
    if (pend.kind === "chooseOption" && pend.what === "tribute") {
      const best = [...pend.options].sort((a, b) => player(s, Number(b)).life - player(s, Number(a)).life)[0]!;
      return [{ type: "chooseOption", player: pid, choice: best }];
    }
    // "As ~ enters, choose a player" (True-Name Nemesis's protection): the opponent with the most power on the battlefield.
    // "Choose an opponent. That player sacrifices a creature" (Myrkul's Edict): the same one.
    if (pend.kind === "chooseOption" && (pend.what === "player" || pend.what === "opponent")) {
      const might = (x: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === x && objIsType(s, obj(s, id), "Creature")).reduce((n, id) => n + Math.max(0, power(s, obj(s, id))), 0);
      const opps = pend.options.filter((x) => Number(x) !== pid);
      // Skullwinder: "That player returns a card from their graveyard to their hand", a gift, so the one with the fewest
      // cards there (none, ideally).
      const r = s.resolving;
      const next = r && pend.what === "opponent" ? r.body.effects[r.next + 1] : undefined;
      if (next?.type === "chooseFromGraveyard" && next.who?.ref === "chosenPlayer" && !next.dest && opps.length) {
        const fewest = [...opps].sort((a, b) => player(s, Number(a)).graveyard.length - player(s, Number(b)).graveyard.length)[0]!;
        return [{ type: "chooseOption", player: pid, choice: fewest }];
      }
      // Loxodon Peacekeeper: "that player gains control of ~": ourselves if we're among those tied, else the opponent with
      // the least power on the battlefield.
      if (next?.type === "continuous" && next.giveTo?.ref === "chosenPlayer" && next.what.ref === "self") {
        if (pend.options.includes(String(pid))) return [{ type: "chooseOption", player: pid, choice: String(pid) }];
        const weakest = [...pend.options].sort((a, b) => might(Number(a)) - might(Number(b)))[0]!;
        return [{ type: "chooseOption", player: pid, choice: weakest }];
      }
      // Rogue Skycaptain: "If you don't, ... an opponent gains control of it" (inside the unpaid branch): the opponent with
      // the least power on the battlefield.
      if (r && pend.what === "opponent" && opps.length && allEffects(r.body.effects).some((e) => e.type === "continuous" && e.giveTo?.ref === "chosenPlayer" && e.what.ref === "self" && e.mods.some((m) => m.kind === "control"))) {
        const weakest = [...opps].sort((a, b) => might(Number(a)) - might(Number(b)))[0]!;
        return [{ type: "chooseOption", player: pid, choice: weakest }];
      }
      // Sandstone Oracle: "If that player has more cards in hand than you, draw cards equal to the difference": the most.
      if (next?.type === "if" && next.cond.kind === "amountsCompare" && opps.length && JSON.stringify(next.cond.a).includes('"chosenPlayer"') && next.effects.some((e) => e.type === "draw")) {
        const most = [...opps].sort((a, b) => player(s, Number(b)).hand.length - player(s, Number(a)).hand.length)[0]!;
        return [{ type: "chooseOption", player: pid, choice: most }];
      }
      // A permanent that counts the chosen player's cards (Nyxathid, Sewer Nemesis) or hurts them on their upkeep (Black
      // Vise, The Rack): the opponent that makes it biggest or hurts most.
      const entering = pend.objectId !== undefined ? s.objects[pend.objectId] : undefined;
      const chosenScore = entering && opps.length ? chosenPlayerScore(s, entering, pid) : undefined;
      if (chosenScore) {
        const top = [...opps].sort((a, b) => chosenScore(Number(b)) - chosenScore(Number(a)))[0]!;
        return [{ type: "chooseOption", player: pid, choice: top }];
      }
      const best = [...(opps.length ? opps : pend.options)].sort((a, b) => might(Number(b)) - might(Number(a)) || player(s, Number(b)).life - player(s, Number(a)).life)[0]!;
      return [{ type: "chooseOption", player: pid, choice: best }];
    }
    // Gluntch: ourselves for the first gift we'd get something from (the counters only with a creature), the rest to the
    // opponent with the least power on the battlefield.
    // "That player or a planeswalker that player controls": the player while they're low on life, else their planeswalker
    // with the least loyalty, the easiest to finish off.
    if (pend.kind === "chooseOption" && pend.what === "damageWhom") {
      const [them, ...pws] = pend.options;
      const low = player(s, Number(them!.slice(1))).life <= 10;
      const pw = [...pws].sort((a, b) => (obj(s, a).counters.loyalty ?? 0) - (obj(s, b).counters.loyalty ?? 0))[0];
      return [{ type: "chooseOption", player: pid, choice: low || pw === undefined ? them! : pw }];
    }
    // Wall of Shards: the life to the opponent who has the most already, where it matters least.
    // "Target ... of an opponent's choice" (Mausoleum Turnkey): any one of them will choose against us; the next in turn order.
    // "An opponent chooses one —" (Misfortune): the opponent whose likely mode is the best for us.
    if (pend.kind === "chooseOption" && pend.what === "modeChooser" && pend.deferred) return [{ type: "chooseOption", player: pid, choice: bestModeChooser(s, pid, pend.options, pend.deferred) }];
    if (pend.kind === "chooseOption" && pend.what === "targetChooser" && pend.deferred) return [{ type: "chooseOption", player: pid, choice: bestChooser(s, pid, pend.options, pend.deferred) }];
    if (pend.kind === "chooseOption" && pend.what === "targetChooser") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    // Plague of Vermin: Rats for life we can spare (keeping 20) in the first round only, so the rounds end.
    if (pend.kind === "chooseOption" && pend.what === "payLifeRound") {
      const st = s.resolving?.scratch?.lifeRounds;
      const first = !st || st.next < st.order.length;
      const n = first ? Math.max(0, Math.min(pend.numberRange?.max ?? 0, player(s, pid).life - 20, 8)) : 0;
      return [{ type: "chooseOption", player: pid, choice: String(n) }];
    }
    // Fatespinner: the combat phase when none of ours could deal damage attacking, else the draw step (a main phase is
    // where everything else happens).
    if (pend.kind === "chooseOption" && pend.what === "skipChoice") {
      const hitters = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid && objIsType(s, o, "Creature") && power(s, o) > 0 && !objHasKeyword(s, o, "Defender"));
      return [{ type: "chooseOption", player: pid, choice: hitters.length ? "draw" : "combat" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "giveLife") return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => player(s, Number(b)).life - player(s, Number(a)).life)[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "nthPlayer") {
      const r = s.resolving;
      const next = r ? r.body.effects[r.next + 1] : undefined;
      const useful = next?.type !== "pick" || s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
      const might = (x: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === x && objIsType(s, obj(s, id), "Creature")).reduce((n, id) => n + Math.max(0, power(s, obj(s, id))), 0);
      const others = pend.options.filter((x) => Number(x) !== pid).sort((a, b) => might(Number(a)) - might(Number(b)) || player(s, Number(a)).life - player(s, Number(b)).life);
      const pick = pend.options.includes(String(pid)) && (useful || !others.length) ? String(pid) : others[0]!;
      return [{ type: "chooseOption", player: pid, choice: pick }];
    }
    // The legend rule (CR 704.5j): the one with Auras, Equipment or counters on it, else the card, else the oldest.
    if (pend.kind === "chooseOption" && pend.what === "legend") return [{ type: "chooseOption", player: pid, choice: legendBotKeep(s, pend.options) }];
    // A Siege's protector (CR 310.12a): the opponent least able to defend it, so we can defeat it and flip it.
    if (pend.kind === "chooseOption" && pend.what === "protector") {
      const guard = (x: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === x && objIsType(s, obj(s, id), "Creature")).reduce((n, id) => n + Math.max(0, toughness(s, obj(s, id))), 0);
      const pick = [...pend.options].sort((a, b) => guard(Number(a)) - guard(Number(b)))[0]!;
      return [{ type: "chooseOption", player: pid, choice: pick }];
    }
    // Dauntless Bodyguard, Tyrannical Pitlord: our most valuable other creature, the one most worth protecting or pumping.
    if (pend.kind === "chooseOption" && pend.what === "chosenObject") {
      const pick = [...pend.options].sort((a, b) => worth(s, pid, obj(s, b)) + mv(s, b) - (worth(s, pid, obj(s, a)) + mv(s, a)))[0]!;
      return [{ type: "chooseOption", player: pid, choice: pick }];
    }
    if (pend.kind === "chooseOption" && pend.what === "tributePay") return [{ type: "chooseOption", player: pid, choice: payTribute(s, pend.objectId!) ? "pay" : "no" }];
    // Xantcha, Captive Audience: the opponent with the least life, who loses the most from controlling it.
    if (pend.kind === "chooseOption" && pend.what === "controlOpponent") {
      const pick = [...pend.options].sort((a, b) => player(s, Number(a)).life - player(s, Number(b)).life)[0]!;
      return [{ type: "chooseOption", player: pid, choice: pick }];
    }
    if (pend.kind === "chooseOption" && pend.what === "exchangeText") {
      // Deadpool: its own text is a drawback ("you lose 3 life" each upkeep), so trade it to an opponent for the text of
      // their best creature; never onto one of our own.
      const theirs = pend.options.filter((x) => x !== "none" && s.objects[x] && controllerOf(s, obj(s, x)) !== pid && defOf(s, obj(s, x)).oracleText.trim() !== "");
      const best = theirs.sort((a, b) => worth(s, pid, obj(s, b)) + mv(s, b) - (worth(s, pid, obj(s, a)) + mv(s, a)))[0];
      return [{ type: "chooseOption", player: pid, choice: best ?? "none" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "copy") {
      // Clone the best permanent, but not a legendary one we already control (the legend rule, CR 704.5j).
      const ids = pend.options.filter((x) => x !== "none" && s.objects[x]);
      // A card in a graveyard (Lazotep Convert): the one with the highest mana value, not a legend we already have.
      const mine = (name: string) => s.battlefield.some((b) => controllerOf(s, obj(s, b)) === pid && characteristics(s, obj(s, b)).name === name);
      const ok = ids.filter((x) => (obj(s, x).zone === "graveyard" ? !(defOf(s, obj(s, x)).supertypes.includes("Legendary") && mine(defOf(s, obj(s, x)).name)) : !(characteristics(s, obj(s, x)).supertypes.includes("Legendary") && controllerOf(s, obj(s, x)) === pid)));
      // A land card (Echoing Deeps): a nonbasic one, the one with the most rules text.
      const landValue = (x: string) => (defOf(s, obj(s, x)).supertypes.includes("Basic") ? 0 : 1 + (defOf(s, obj(s, x)).oracleText?.length ?? 0) / 1000);
      const value = (x: string) => (obj(s, x).zone === "graveyard" ? (isType(defOf(s, obj(s, x)), "Land") ? landValue(x) : 0) : worth(s, pid, obj(s, x))) + mv(s, x);
      // Wall of Stolen Identity: the copied creature is tapped and stays tapped, so an opponent's is better.
      const locks = !!pend.objectId && s.objects[pend.objectId] && compileCard(defOf(s, obj(s, pend.objectId))).entersAsCopy?.tapCopied;
      const theirs = locks ? ok.filter((x) => controllerOf(s, obj(s, x)) !== pid) : [];
      const best = (theirs.length ? theirs : ok).sort((a, b) => value(b) - value(a))[0];
      return [{ type: "chooseOption", player: pid, choice: best ?? "none" }];
    }
    // The Mimeoplasm: the other card exiled gives +1/+1 counters equal to its power, so the one with the greatest power.
    if (pend.kind === "chooseOption" && pend.what === "copyOther") {
      const pw = (x: string) => characteristics(s, obj(s, x)).power;
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => pw(b) - pw(a))[0]! }];
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
    // The Sieges' Khans or Dragons (CR 614.12b): Khans, the long-term value (a card, counters, mana, a returned creature).
    // "Roll two d8 and choose one result" (the Endeavors): the higher one for the first instruction.
    if (pend.kind === "chooseOption" && pend.what === "rollResult") return [{ type: "chooseOption", player: pid, choice: Number(pend.labels?.[1]) > Number(pend.labels?.[0]) ? "1" : "0" }];
    // Mutate (CR 702.140c): on top when the new card is the bigger body, since the merged creature has its power and
    // toughness (730.2a); its abilities come along either way (702.140e).
    if (pend.kind === "chooseOption" && pend.what === "mutate") {
      const m = s.mutatingSpell;
      const size = (d: CardDef | undefined) => (Number(d?.power) || 0) + (Number(d?.toughness) || 0);
      const host = m && s.objects[m.host];
      return [{ type: "chooseOption", player: pid, choice: m && host && size(defOf(s, obj(s, m.id))) < size(defOf(s, host)) ? "bottom" : "top" }];
    }
    // Archangel of Strife: war (+3/+0) to press an attack while healthy, peace (+0/+3) to hold the ground when not.
    if (pend.kind === "chooseOption" && pend.what === "playerWord") return [{ type: "chooseOption", player: pid, choice: pend.options.join() === "war,peace" ? (player(s, pid).life >= 20 ? "war" : "peace") : pend.options[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "anchor") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    // Its owner keeps it on top (Subtlety); Hinder's controller sends another player's card to the bottom.
    // Temporal Cleansing's owner keeps it second from the top.
    if (pend.kind === "chooseOption" && pend.what === "topOrBottom") return [{ type: "chooseOption", player: pid, choice: pend.about && s.objects[pend.about] && s.objects[pend.about]!.owner !== pid ? "bottom" : pend.options[0]! }];
    // A creature put onto the battlefield attacking: the player the source attacks, offered first.
    // "Search your library and/or graveyard": both, for the most to choose from.
    if (pend.kind === "chooseOption" && pend.what === "searchZones") return [{ type: "chooseOption", player: pid, choice: "both" }];
    if (pend.kind === "chooseOption" && pend.what === "attackWhom") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "reselectAttack") {
      const o = pend.about ? s.objects[pend.about] : undefined;
      return [{ type: "chooseOption", player: pid, choice: (o && reselectPick(s, pid, o)) ?? (pend.options.includes("keep") ? "keep" : pend.options[0]!) }];
    }
    // Tap or untap: tap an opponent's untapped permanent, untap our own tapped one; otherwise leave it if we may.
    // "You may cast a spell with mana value 3 or less from your hand without paying its mana cost": the biggest one.
    if (pend.kind === "chooseOption" && pend.what === "castFromHand") {
      const cards = pend.options.filter((o) => o !== "none" && !isCounterOnly(compileCard(defOf(s, obj(s, o))).spell ?? { targets: [], effects: [], text: "" }));
      const pick = cards.sort((a, b) => mv(s, b) - mv(s, a))[0];
      return [{ type: "chooseOption", player: pid, choice: pick ?? "none" }];
    }
    // Nicol Bolas, Dragon-God's +1: a token, else the cheapest card in hand (an extra land once we have five), else the
    // cheapest permanent.
    if (pend.kind === "chooseOption" && pend.what === "exileHandOrPermanent") {
      const inHand = pend.options.filter((o) => obj(s, o).zone === "hand");
      const perms = pend.options.filter((o) => obj(s, o).zone === "battlefield");
      const token = perms.find((o) => obj(s, o).isToken && !obj(s, o).isCommander);
      const spare = (o: string) => (isType(defOf(s, obj(s, o)), "Land") ? (lands(s, pid) >= 5 ? -1 : 2) : mv(s, o));
      // Lich's Mastery: graveyard cards first; the permanent that keeps us in the game (it says "You can't lose the game")
      // only when nothing else is left.
      const yard = pend.options.filter((o) => obj(s, o).zone === "graveyard").sort((a, b) => mv(s, a) - mv(s, b));
      const keeps = (o: string) => (abilitiesOf(s, obj(s, o)).cantLose === "you" ? 1000 : 0);
      const pick = yard[0] ?? token ?? [...inHand].sort((a, b) => spare(a) - spare(b))[0] ?? [...perms].sort((a, b) => keeps(a) + mv(s, a) - keeps(b) - mv(s, b))[0]!;
      return [{ type: "chooseOption", player: pid, choice: pick }];
    }
    // Eladamri: the biggest creature card in hand, else the top card of the library (it may be one).
    if (pend.kind === "chooseOption" && pend.what === "revealHandOrTop") {
      const creatures = pend.options.filter((o) => o !== "top" && isType(defOf(s, obj(s, o)), "Creature"));
      const pick = creatures.sort((a, b) => mv(s, b) - mv(s, a))[0];
      return [{ type: "chooseOption", player: pid, choice: pick ?? (pend.options.includes("top") ? "top" : pend.options[0]!) }];
    }
    // Party Thrasher: the exiled card we'd rather play this turn, a land while we still have a land play, else the
    // costliest spell we can pay for, else the cheapest.
    // Lord of the Void: the costliest card to put onto the battlefield.
    if (pend.kind === "chooseOption" && pend.what === "impulseChoice" && /onto the battlefield/.test(pend.prompt ?? ""))
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => mv(s, b) - mv(s, a))[0]! }];
    // Sleight of Mind and the like (effect "changeText"): see textWordPick.
    if (pend.kind === "chooseOption" && (pend.what === "textFrom" || pend.what === "textTo")) return [{ type: "chooseOption", player: pid, choice: textWordPick(s, pid, pend) }];
    // Truth or Tale: the best card of the chosen pile.
    if (pend.kind === "chooseOption" && pend.what === "pileCard") return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => handWorth(s, b) - handWorth(s, a))[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "impulseChoice") {
      const p = player(s, pid);
      const land = pend.options.find((o) => isType(defOf(s, obj(s, o)), "Land"));
      const spells = pend.options.filter((o) => !isType(defOf(s, obj(s, o)), "Land")).sort((a, b) => mv(s, b) - mv(s, a));
      const mana = availableMana(s, pid);
      const pick = (land && p.landsPlayedThisTurn < landsAllowed(s, pid) && lands(s, pid) < 6 ? land : undefined) ?? spells.find((o) => mv(s, o) <= mana) ?? land ?? spells[spells.length - 1]!;
      return [{ type: "chooseOption", player: pid, choice: pick }];
    }
    // "You may cast any number of spells ... from among them": the biggest each time, until none is left or worth it.
    if (pend.kind === "chooseOption" && pend.what === "castFromAmong") {
      const cards = pend.options.filter((o) => o !== "none" && !isCounterOnly(compileCard(defOf(s, obj(s, o))).spell ?? { targets: [], effects: [], text: "" }));
      const pick = cards.sort((a, b) => mv(s, b) - mv(s, a))[0];
      // "Put which of them into your hand?" (Invasion of Alara): no "none".
      return [{ type: "chooseOption", player: pid, choice: pick ?? (pend.options.includes("none") ? "none" : pend.options[0]!) }];
    }
    if (pend.kind === "chooseOption" && pend.what === "tapOrUntap") return [{ type: "chooseOption", player: pid, choice: tapOrUntapChoice(s, pid, pend.options) }];
    // Mox Diamond: a land card if there is one.
    if (pend.kind === "chooseOption" && pend.what === "discardInstead") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    // Lake of the Dead: a tapped Swamp first (its mana is spent already), a token or a basic before anything else.
    if (pend.kind === "chooseOption" && pend.what === "sacrificeInstead") {
      const worth = (id: string) => (obj(s, id).tapped ? 0 : 2) + (obj(s, id).isToken || characteristics(s, obj(s, id)).supertypes.includes("Basic") ? 0 : 1);
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => worth(a) - worth(b))[0]! }];
    }
    if (pend.kind === "chooseOption" && pend.what === "endure") return [{ type: "chooseOption", player: pid, choice: "counters" }];
    // Sylvan Library: 4 life for a card only while well ahead on life; otherwise it goes back.
    if (pend.kind === "chooseOption" && pend.what === "payOrTop") return [{ type: "chooseOption", player: pid, choice: s.players[pid]!.life >= 30 ? "pay" : "top" }];
    // "A Food token or a Treasure token": the Treasure (mana now beats life later); otherwise the first.
    // "Add {B} or {G} for each ..." (Culling Ritual): the split that best matches the colored symbols in the hand.
    if (pend.kind === "chooseOption" && pend.what === "either" && pend.prompt === "choose the mana") {
      const want = (sym: string) => s.players[pid]!.hand.reduce((n, id) => n + (defOf(s, obj(s, id)).manaCost.split(sym).length - 1), 0);
      const score = (label: string) => [...new Set(label.match(/\{[WUBRG]\}/g) ?? [])].reduce((n, sym) => n + Math.min(label.split(sym).length - 1, want(sym)), 0);
      const best = pend.labels!.reduce((b, l, i) => (score(l) > score(pend.labels![b]!) ? i : b), 0);
      return [{ type: "chooseOption", player: pid, choice: pend.options[best]! }];
    }
    // Which counter to move: a +1/+1 counter if it has one (moved onto our creature), else the first.
    // Slippery Bogbonder: onto an opponent's creature, our harmful counters (-1/-1, stun); onto ours, none.
    if (pend.kind === "chooseOption" && pend.what === "removeCounter" && pend.options.some((o) => o.includes(":")) && pend.onto === undefined) {
      // Eventide's Shadow: removing them costs us a card's worth of life each (and gives a card), so a few at most, while
      // our life stays well up: helpful ones off opponents' permanents, harmful ones off ours.
      const so = Object.values(s.resolving?.scratch?.gathered ?? {}).reduce((a, b) => a + b, 0);
      const room = Math.min(4, player(s, pid).life - 10);
      const worth = pend.options.find((o) => {
        if (!o.includes(":")) return false;
        const x = s.objects[o.slice(0, o.indexOf(":"))];
        return !!x && harmfulCounter(o.slice(o.indexOf(":") + 1)) === (controllerOf(s, x) === pid);
      });
      return [{ type: "chooseOption", player: pid, choice: worth && so < room ? worth : "done" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "removeCounter" && pend.options.some((o) => o.includes(":"))) {
      const onto = pend.onto !== undefined ? s.objects[pend.onto] : undefined;
      const bad = onto && controllerOf(s, onto) !== pid ? pend.options.find((o) => o.includes(":") && harmfulCounter(o.slice(o.indexOf(":") + 1))) : undefined;
      return [{ type: "chooseOption", player: pid, choice: bad ?? "done" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "removeCounter") {
      // Off our own permanents the harmful kinds (-1/-1, stun), off others' the helpful ones (loyalty, +1/+1, ...).
      const o = pend.about ? s.objects[pend.about] : undefined;
      const mine = !!o && controllerOf(s, o) === pid;
      const kinds = pend.options.filter((k) => k !== "done");
      // Moving between our own permanents (Resourceful Defense): nothing worth moving is known, so none.
      const onto = pend.onto !== undefined ? s.objects[pend.onto] : undefined;
      if (onto && mine && controllerOf(s, onto) === pid && pend.options.includes("done")) return [{ type: "chooseOption", player: pid, choice: "done" }];
      const good = kinds.filter((k) => harmfulCounter(k) === mine).sort((a, b) => Number(b === "loyalty") - Number(a === "loyalty") || Number(b === "+1/+1") - Number(a === "+1/+1"));
      return [{ type: "chooseOption", player: pid, choice: good[0] ?? (pend.options.includes("done") ? "done" : kinds[0]!) }];
    }
    // Aven Courier: a helpful kind our target doesn't have yet (+1/+1 first), never a harmful one.
    if (pend.kind === "chooseOption" && pend.what === "counterKind" && pend.about && s.objects[pend.about] && s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "counterOfKindOnIt" && e.kindFromYours)) {
      const on = obj(s, pend.about);
      const fresh = pend.options.filter((k) => !harmfulCounter(k) && !["age", "time", "fade", "doom", "loyalty"].includes(k) && !((on.counters[k] ?? 0) > 0));
      return [{ type: "chooseOption", player: pid, choice: fresh.includes("+1/+1") ? "+1/+1" : fresh[0] ?? pend.options.find((k) => !harmfulCounter(k)) ?? pend.options[0]! }];
    }
    // Elspeth Conquers Death: a loyalty counter on a planeswalker that isn't a creature.
    if (pend.kind === "chooseOption" && pend.what === "counterKind" && pend.about && pend.options.includes("loyalty") && s.objects[pend.about] && objIsType(s, obj(s, pend.about), "Planeswalker") && !objIsType(s, obj(s, pend.about), "Creature"))
      return [{ type: "chooseOption", player: pid, choice: "loyalty" }];
    if (pend.kind === "chooseOption" && pend.what === "counterKind") return [{ type: "chooseOption", player: pid, choice: pend.options.includes("+1/+1") ? "+1/+1" : pend.options[0]! }];
    // Two piles: the better one for our own hand, the worse one for an opponent's.
    if (pend.kind === "chooseOption" && pend.what === "pile" && pend.piles) {
      // Our own permanents to sacrifice (Liliana of the Veil): the pile worth less.
      // Boneyard Parley: creature cards to put onto the battlefield, worth their mana value.
      const worth = pend.sacrificePile ? (id: string) => permanentWorth(s, pid, id) : pend.pileMode === "battlefield" ? (id: string) => 1 + mv(s, id) : (id: string) => handWorth(s, id);
      // Atris: a face-down pile is guessed at by its size alone; Truth or Tale: a pile is worth its best card.
      const [a, b] = pend.piles.map((pile, i) => (pend.pileMode === "faceDown" && i === 0 ? pile.length * 2 : pend.pileMode === "pickOne" ? Math.max(0, ...pile.map(worth)) : pile.reduce((n, id) => n + worth(id), 0)));
      // Make an Example: another player's pile for them to sacrifice, so the one worth more.
      const mine = pend.sacrificePile ? pend.of !== pid : pend.of === pid;
      return [{ type: "chooseOption", player: pid, choice: (mine ? a! >= b! : a! <= b!) ? "0" : "1" }];
    }
    // Liliana of the Dark Realms: +X/+X for our own creature, -X/-X for anyone else's.
    if (pend.kind === "chooseOption" && pend.what === "either" && pend.labels?.[0] === "It gets +X/+X until end of turn") {
      const t = s.resolving?.item.targets?.[0];
      const it = t?.kind === "object" ? s.objects[t.id] : undefined;
      return [{ type: "chooseOption", player: pid, choice: it && controllerOf(s, it) === pid ? "0" : "1" }];
    }
    // A villainous choice (CR 701.55): the option that costs us less, as roughly guessed.
    if (pend.kind === "chooseOption" && pend.what === "villainous") {
      const v = s.resolving ? allEffects(s.resolving.body.effects).find((e) => e.type === "villainous") : undefined;
      const costs = v?.type === "villainous" ? v.options.map((fx) => villainCost(s, pid, fx)) : [0, 0];
      return [{ type: "chooseOption", player: pid, choice: costs[1]! < costs[0]! ? "1" : "0" }];
    }
    // "Unlock a locked door" for free: the door that would cost the most to unlock (CR 709.5f).
    if (pend.kind === "chooseOption" && pend.what === "unlockDoor") {
      const cost = (o: string) => {
        const [id, door] = o.split(":");
        const c = s.objects[id!] && unlockCost(s, obj(s, id!), Number(door));
        return c ? manaValue(parseManaCost(c)) : 0;
      };
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => cost(b) - cost(a))[0]! }];
    }
    // Turnabout: untap our own permanents, tap anyone else's.
    if (pend.kind === "chooseOption" && pend.what === "either" && pend.labels?.[0] === TURNABOUT_TAP) {
      const t = s.resolving?.item.targets?.[0];
      return [{ type: "chooseOption", player: pid, choice: t?.kind === "player" && t.id === pid ? "1" : "0" }];
    }
    // Reign of Terror, Lava Storm: what costs the opponents most, net of what we'd lose.
    const either = pend.kind === "chooseOption" && pend.what === "either" && s.resolving ? allEffects(s.resolving.body.effects).find((e) => e.type === "either" && pend.options.every((o, i) => e.labels[Number(o)] === pend.labels?.[i])) : undefined;
    if (pend.kind === "chooseOption" && either?.type === "either" && either.options.every((o) => o.every((e) => e.type === "destroy" || e.type === "damage"))) {
      const v = (o: string) => groupValue(s, pid, { targets: [], effects: either.options[Number(o)]!, text: "" }) ?? 0;
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => v(b) - v(a))[0]! }];
    }
    // Retribution, Cannibalize: the picked target is the one hit hardest, so our own least worthy creature, or an
    // opponent's most worthy one.
    if (pend.kind === "chooseOption" && pend.what === "splitTargets" && s.resolving) {
      const targets = s.resolving.item.targets ?? [];
      const v = (o: string) => {
        const t = targets[Number(o)];
        const c = t?.kind === "object" ? s.objects[t.id] : undefined;
        return !c ? 0 : (controllerOf(s, c) === pid ? -1 : 1) * worth(s, pid, c);
      };
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => v(b) - v(a))[0]! }];
    }
    // Urborg: "loses first strike or swampwalk": one an opponent's creature has (one ours doesn't, for ours).
    if (pend.kind === "chooseOption" && either?.type === "either" && either.options.every((o) => o.length === 1 && o[0]!.type === "continuous" && o[0]!.what.ref === "target" && o[0]!.mods.length === 1 && o[0]!.mods[0]!.kind === "removeKeywords")) {
      const t = s.resolving?.item.targets?.[0];
      const c = t?.kind === "object" ? s.objects[t.id] : undefined;
      const has = (o: string) => {
        const e = either.options[Number(o)]![0]!;
        return !!c && e.type === "continuous" && e.mods[0]!.kind === "removeKeywords" && e.mods[0]!.keywords.some((k) => objHasKeyword(s, c, k));
      };
      const mine = !!c && controllerOf(s, c) === pid;
      return [{ type: "chooseOption", player: pid, choice: pend.options.find((o) => has(o) !== mine) ?? pend.options[0]! }];
    }
    // Vhati il-Dal: "base power 1 or base toughness 1": an opponent's creature loses the more of the two (toughness on a
    // tie, it may die to damage); our own gets whichever raises it, else the power (keeps it alive).
    if (pend.kind === "chooseOption" && either?.type === "either" && either.options.length === 2 && either.options.every((o) => o.length === 1 && o[0]!.type === "continuous" && o[0]!.what.ref === "target" && o[0]!.mods.length === 1 && (o[0]!.mods[0]!.kind === "setPower" || o[0]!.mods[0]!.kind === "setToughness"))) {
      const t = s.resolving?.item.targets?.[0];
      const c = t?.kind === "object" ? s.objects[t.id] : undefined;
      const at = (k: "setPower" | "setToughness") => String(either.options.findIndex((o) => o[0]!.type === "continuous" && o[0]!.mods[0]!.kind === k));
      if (!c || c.zone !== "battlefield") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
      const p = power(s, c);
      const tt = toughness(s, c);
      const pick = controllerOf(s, c) === pid ? (tt < 1 ? "setToughness" : "setPower") : p - 1 > tt - 1 ? "setPower" : "setToughness";
      return [{ type: "chooseOption", player: pid, choice: pend.options.includes(at(pick)) ? at(pick) : pend.options[0]! }];
    }
    if (pend.kind === "chooseOption" && pend.what === "either") {
      const i = pend.labels?.findIndex((l) => /Treasure/.test(l)) ?? -1;
      return [{ type: "chooseOption", player: pid, choice: pend.options[Math.max(0, i)]! }];
    }
    // Demonstrate: the opponent who also copies the spell is the one with the least on the battlefield.
    if (pend.kind === "chooseOption" && pend.what === "demonstrate") {
      const owned = (o: string) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === Number(o)).length;
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => owned(a) - owned(b))[0]! }];
    }
    // Zada's copies: the order hardly matters to a bot, so battlefield order.
    if (pend.kind === "chooseOption" && pend.what === "copyOrder") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    // Sword-Point Diplomacy: the cheapest revealed card first (its opponents pay life for the costly ones later).
    // Chaotic Transformation: the order of its own exiled permanents doesn't matter much; the first.
    if (pend.kind === "chooseOption" && pend.what === "nextExiled") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "nextRevealed") return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => mv(s, a) - mv(s, b))[0]! }];
    // Which opponent to clash with: nothing is known about their libraries, so the next one in turn order.
    if (pend.kind === "chooseOption" && pend.what === "clash") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    // Damage shields: the options come in the order we'd pick them (damage.ts shieldPreference).
    if (pend.kind === "chooseOption" && pend.what === "damageShield") return [{ type: "chooseOption", player: pid, choice: pend.options[0]! }];
    if (pend.kind === "chooseOption" && pend.what === "venture") return [{ type: "chooseOption", player: pid, choice: chooseRoom(s, pid, pend.options) }];
    // Friend or foe (Pir's Whim): a friend is the bot itself, every other player a foe.
    if (pend.kind === "chooseOption" && pend.what === "word" && pend.options.join() === "friend,foe") return [{ type: "chooseOption", player: pid, choice: pend.of === pid ? "friend" : "foe" }];
    if (pend.kind === "chooseOption" && pend.what === "word") return [{ type: "chooseOption", player: pid, choice: chooseWord(s, pid, pend.options) }];
    if (pend.kind === "chooseOption" && pend.what === "vote") return [{ type: "chooseOption", player: pid, choice: chooseVote(s, pid, pend.options) }];
    if (pend.kind === "chooseOption" && pend.what === "punisher") return [{ type: "chooseOption", player: pid, choice: choosePunisher(s, pid, pend.options) }];
    if (pend.kind === "chooseOption" && pend.what === "damageSource") return [{ type: "chooseOption", player: pid, choice: chooseDamageSource(s, pid, pend.options) }];
    // Storage Matrix: the type with the most of our tapped permanents; lands first on a tie (mana for the turn).
    if (pend.kind === "chooseOption" && pend.what === "untapType") {
      const tapped = s.battlefield.map((id) => obj(s, id)).filter((o) => o.tapped && controllerOf(s, o) === pid && !o.skipNextUntap && !characteristics(s, o).doesntUntap);
      const count = (t: string) => tapped.filter((o) => characteristics(s, o).types.includes(t)).length * 10 + (t === "Land" ? 2 : t === "Creature" ? 1 : 0);
      const best = [...pend.options].sort((a, b) => count(b) - count(a))[0];
      return [{ type: "chooseOption", player: pid, choice: best ?? pend.options[0]! }];
    }
    // Juxtapose: the tied permanent we give away: our least useful one.
    if (pend.kind === "chooseOption" && pend.what === "greatestTie") {
      const least = [...pend.options].filter((id) => s.objects[id]).sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b)))[0];
      return [{ type: "chooseOption", player: pid, choice: least ?? pend.options[0]! }];
    }
    // Gilgamesh: which of the Equipment to attach: the one with the greatest mana value.
    if (pend.kind === "chooseOption" && pend.what === "attachWhich") {
      // Goldwardens' Gambit: not one already moved onto an earlier token this way.
      const sc = s.resolving?.scratch;
      const earlier = sc?.attachEqAt !== undefined ? (sc.attachEach ?? []).slice(0, sc.attachEqAt) : [];
      const ids = pend.options.filter((o) => o !== "none" && s.objects[o] && !earlier.includes(s.objects[o]!.attachedTo ?? ""));
      const best = ids.sort((a, b) => defOf(s, s.objects[b]!).cmc - defOf(s, s.objects[a]!).cmc)[0];
      return [{ type: "chooseOption", player: pid, choice: best ?? (pend.options.includes("none") ? "none" : pend.options[0]!) }];
    }
    // What an Aura entering without being cast enchants (CR 303.4f): one of ours if it only helps, an opponent's otherwise.
    if (pend.kind === "chooseOption" && pend.what === "enchant") {
      const waiting = s.untilReturns?.auras[0];
      const aura = waiting?.asking ? waiting.id : s.resolving?.scratch?.auraAsking;
      const best = aura && s.objects[aura] ? auraHostFor(s, s.objects[aura]!, pid, pend.options) : undefined;
      const key = best && auraHostKey(best);
      return [{ type: "chooseOption", player: pid, choice: key && pend.options.includes(key) ? key : pend.options[0]! }];
    }
    if (pend.kind === "chooseOption" && pend.what === "cardName") return [{ type: "chooseOption", player: pid, choice: chooseCardName(s, pid, pend) }];
    // "Draw up to two cards": as many as we can without emptying our library.
    // "You may pay {X}. If you do, ...": as much as we can, keeping cards in our library.
    if (pend.kind === "chooseOption" && pend.what === "payX") {
      const nums = pend.options.filter((o) => o !== "none").map(Number);
      if (s.resolving?.scratch?.join) {
        const n = joinForcesAmount(s, pid, Math.max(...nums));
        return [{ type: "chooseOption", player: pid, choice: n > 0 ? String(n) : "none" }];
      }
      const reflexive = paidXReflexive(s);
      const self = s.resolving?.item.sourceId ? s.objects[s.resolving.item.sourceId] : undefined;
      if (reflexive) {
        // Tester of the Tangential: "move X +1/+1 counters from ~ onto another target creature": as many as it has, when
        // we have another creature to take them.
        const move = allEffects(reflexive.effects).find((x) => x.type === "removeAnyCounters" && x.moveN && x.what.ref === "self");
        if (move?.type === "removeAnyCounters") {
          const have = self ? (move.kinds ?? []).reduce((a, k) => a + Math.max(0, self.counters[k] ?? 0), 0) : 0;
          const other = s.battlefield.some((b) => b !== self?.id && controllerOf(s, obj(s, b)) === pid && objIsType(s, obj(s, b), "Creature"));
          const n = Math.min(have, Math.max(...nums));
          return [{ type: "chooseOption", player: pid, choice: other && n > 0 && nums.includes(n) ? String(n) : "none" }];
        }
        // Isareth the Awakener: "return target creature card with mana value X from your graveyard": X is the mana value of
        // the best such card we can pay for.
        const spec = reflexive.targets.find((t) => t.kind === "card" && t.xRange?.key === "manaValue" && t.xRange.at === "exact");
        if (spec) {
          const { xRange: _, ...rest } = spec;
          const cards = player(s, pid).graveyard.filter((id) => nums.includes(mv(s, id)) && printedMatches(rest, defOf(s, obj(s, id))));
          const best = chooseSearch(s, pid, cards, 1)[0];
          return [{ type: "chooseOption", player: pid, choice: best ? String(mv(s, best)) : "none" }];
        }
      }
      const draws = s.resolving && allEffects(s.resolving.body.effects).some((x) => x.type === "draw");
      const most = Math.max(...nums.filter((n) => !draws || n < player(s, pid).library.length - 1), -1);
      return [{ type: "chooseOption", player: pid, choice: most > 0 ? String(most) : "none" }];
    }
    // "You may pay any amount of life. If you do, draw that many cards" (Necrodominance): enough to fill our hand to five,
    // keeping 15 life and cards in our library.
    if (pend.kind === "chooseOption" && pend.what === "payLife") {
      const p = player(s, pid);
      const n = Math.max(0, Math.min(pend.numberRange?.max ?? 0, p.life - 15, p.library.length - 2, 5 - p.hand.length));
      return [{ type: "chooseOption", player: pid, choice: String(n) }];
    }
    // "You may pay any amount of {E}" (Galvanic Discharge, Die Young): enough to kill the target if it's another
    // player's creature or planeswalker (all of it if that's not enough), nothing for one of ours.
    // Memories Returning: our best card into our hand; as the opponent, their best card to the bottom.
    // Struggle for Sanity: the hand's owner keeps its best card (it comes back); its opponent takes the same one away.
    if (pend.kind === "chooseOption" && pend.what === "struggleExile") {
      const owner = obj(s, pend.options[0]!).owner;
      return [{ type: "chooseOption", player: pid, choice: chooseSearch(s, owner, pend.options, 1)[0] ?? pend.options[0]! }];
    }
    // Giant Albatross: 2 life for a creature worth keeping, while there's life to spare.
    if (pend.kind === "chooseOption" && pend.what === "payLifeOrDestroy") {
      const o = pend.about ? s.objects[pend.about] : undefined;
      const n = Number(/Pay (\d+) life/.exec(pend.labels?.[0] ?? "")?.[1] ?? 2);
      const spare = player(s, pid).life - n;
      return [{ type: "chooseOption", player: pid, choice: o && spare >= 8 && worth(s, pid, o) >= n ? "pay" : "none" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "alternatePick") {
      const owner = obj(s, pend.options[0]!).owner;
      return [{ type: "chooseOption", player: pid, choice: chooseSearch(s, owner, pend.options, 1)[0] ?? pend.options[0]! }];
    }
    // Master of Predicaments: most cards in a hand have mana value 4 or less, so we guess that; as the chooser, our
    // costliest nonland card, the one a wrong guess pays off most for.
    if (pend.kind === "chooseOption" && pend.what === "predicamentGuess") return [{ type: "chooseOption", player: pid, choice: "notOver" }];
    if (pend.kind === "chooseOption" && pend.what === "predicamentCard") {
      const spells = pend.options.filter((id) => !isType(defOf(s, obj(s, id)), "Land")).sort((a, b) => mv(s, b) - mv(s, a));
      return [{ type: "chooseOption", player: pid, choice: spells[0] ?? pend.options[0]! }];
    }
    if (pend.kind === "chooseOption" && pend.what === "payEnergy") {
      const most = pend.numberRange?.max ?? 0;
      // Aether Spike: "Counter that spell unless its controller pays {1} for each {E} paid this way": more than its
      // controller could pay, for another player's spell.
      const spell = s.resolving?.item.targets?.find((x) => x.kind === "stack");
      if (spell?.kind === "stack") {
        const it = s.stack.find((x) => x.id === spell.id);
        return [{ type: "chooseOption", player: pid, choice: String(!it || it.controller === pid ? 0 : Math.min(most, availableMana(s, it.controller) + 1)) }];
      }
      // Wrath of the Skies: "Destroy each artifact, creature, and enchantment with mana value less than or equal to the
      // amount of {E} paid this way": the amount that takes the most of the others' worth for the least of ours.
      const may = s.resolving && allEffects(s.resolving.body.effects).find((x): x is Extract<Effect, { type: "may" }> => x.type === "may" && !!x.payX?.energy);
      const wipe = may?.effects.length === 1 && may.effects[0]!.type === "destroy" && may.effects[0]!.what.ref === "each" ? may.effects[0]!.what.filter : undefined;
      if (wipe?.kind === "object" && !s.resolving?.item.targets?.length) {
        let best = 0;
        let bestScore = 0;
        for (let n = 1; n <= most; n++) {
          let score = 0;
          for (const id of s.battlefield) {
            const o = s.objects[id]!;
            const c = characteristics(s, o);
            if (c.manaValue > n || !(wipe.types ?? []).some((t) => c.types.includes(t))) continue;
            score += (controllerOf(s, o) === pid ? -1.5 : 1) * worth(s, pid, o);
          }
          if (score > bestScore) [best, bestScore] = [n, score];
        }
        return [{ type: "chooseOption", player: pid, choice: String(best) }];
      }
      // Localized Destruction: "each creature you control with power equal to the amount of {E} paid this way gains
      // indestructible": the power that saves the most of ours.
      const saved = may?.effects.length === 1 && may.effects[0]!.type === "continuous" && may.effects[0]!.what.ref === "each" && may.effects[0]!.what.filter.kind === "object" && may.effects[0]!.what.filter.bound?.key === "power" ? may.effects[0]!.what.filter : undefined;
      if (saved) {
        let best = 0;
        let bestScore = 0;
        for (let n = 1; n <= most; n++) {
          const score = s.battlefield.map((id) => s.objects[id]!).filter((o) => controllerOf(s, o) === pid && objIsType(s, o, "Creature") && power(s, o) === n).reduce((a, o) => a + worth(s, pid, o), 0);
          if (score > bestScore) [best, bestScore] = [n, score];
        }
        return [{ type: "chooseOption", player: pid, choice: String(best) }];
      }
      // Wheel of Potential: the {E} paid is how many each player who wheels draws; all we have, short of decking ourselves.
      const wheelPaid = s.resolving?.body.effects.some((x) => x.type === "eachMay" && typeof x.wheel === "object" && "count" in x.wheel && x.wheel.count.kind === "notedAmount");
      if (wheelPaid) return [{ type: "chooseOption", player: pid, choice: String(Math.max(0, Math.min(most, player(s, pid).library.length - 1))) }];
      const t = s.resolving?.item.targets?.find((x) => x.kind === "object");
      const o = t?.kind === "object" ? s.objects[t.id] : undefined;
      const theirs = !!o && o.zone === "battlefield" && controllerOf(s, o) !== pid;
      const need = !theirs ? 0 : objIsType(s, o!, "Creature") ? Math.max(0, toughness(s, o!) - (o!.damage ?? 0)) : (o!.counters.loyalty ?? 0);
      return [{ type: "chooseOption", player: pid, choice: String(Math.min(most, need)) }];
    }
    if (pend.kind === "chooseOption" && pend.what === "drawUpTo") {
      const left = player(s, pid).library.length;
      return [{ type: "chooseOption", player: pid, choice: pend.options.find((o) => Number(o) < left) ?? "0" }];
    }
    // Command Beacon with two commanders: the one that costs the most to cast from the command zone.
    // Spellskite: the target of ours the spell or ability would hurt most, else the first.
    // "Ward—Discard a card or pay {2}": the mana if we have it, else a card, else neither (the spell is countered).
    if (pend.kind === "chooseOption" && pend.what === "unlessWay") {
      const u = s.resolving?.body.effects.find((e) => e.type === "counterUnlessPays");
      const ways = u?.type === "counterUnlessPays" && u.unless.orElse ? [u.unless, u.unless.orElse] : [];
      const ok = (i: string) => {
        const w = ways[Number(i)];
        if (!w) return false;
        if (w.discard) return player(s, pid).hand.length >= w.discard;
        return !!planMana(s, pid, parseManaCost(w.cost));
      };
      const pick = [...pend.options].filter((o) => o !== "none").sort((a, b) => (ways[Number(b)]?.discard ? 0 : 1) - (ways[Number(a)]?.discard ? 0 : 1)).find(ok);
      return [{ type: "chooseOption", player: pid, choice: pick ?? "none" }];
    }
    if (pend.kind === "chooseOption" && pend.what === "targetSlot") return [{ type: "chooseOption", player: pid, choice: targetSlotFor(s, pid, pend.options) }];
    // Stinging Study: the commander with the biggest mana value we can lose that much life for and stay above 4.
    if (pend.kind === "chooseOption" && pend.what === "commander" && /mana value counts/.test(pend.prompt ?? "")) {
      const value = (id: string) => (obj(s, id).zone === "battlefield" ? characteristics(s, obj(s, id)).manaValue : mv(s, id));
      const by = [...pend.options].sort((a, b) => value(b) - value(a));
      return [{ type: "chooseOption", player: pid, choice: by.find((id) => player(s, pid).life - value(id) > 4) ?? by[by.length - 1]! }];
    }
    if (pend.kind === "chooseOption" && pend.what === "commander")
      return [{ type: "chooseOption", player: pid, choice: [...pend.options].sort((a, b) => mv(s, b) + 2 * (player(s, pid).commanderCasts[b] ?? 0) - mv(s, a) - 2 * (player(s, pid).commanderCasts[a] ?? 0))[0]! }];
    // The color of a mana ability's mana, chosen as it resolves (Food Chain): the one that pays for the dearest card we
    // could then cast from our hand or command zone.
    if (pend.kind === "chooseOption" && pend.what === "color" && s.resolving?.item.manaAbility) {
      const pick = manaColorFor(s, pid, pend.options);
      if (pick) return [{ type: "chooseOption", player: pid, choice: pick }];
    }
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
    if (pend.kind === "arrangeTop" && (pend.how === "bottom" || pend.how === "look")) return [{ type: "arrangeTop", player: pid, top: [...pend.cards], away: [] }];
    if (pend.kind === "arrangeTop") {
      // Someone else's library (Jace, the Mind Sculptor): keep on top only what its owner doesn't want.
      const owner = pend.owner ?? pid;
      const keep = pend.cards.filter((id) => wantOnTop(s, owner, id) === (owner === pid));
      return [{ type: "arrangeTop", player: pid, top: keep, away: pend.cards.filter((id) => !keep.includes(id)) }];
    }
    if (pend.kind === "orderGraveyard") return [{ type: "orderGraveyard", player: pid, order: orderOwnGraveyard(s, pend.cards) }];
    // A merged permanent's cards on top of its library: the cheapest drawn first; at the bottom it doesn't matter.
    // An opponent's library (Misinformation): the cards least useful to them first, lands and then the costliest.
    const isLand = (id: ObjectId) => (defOf(s, s.objects[id]!).types.includes("Land") ? 0 : 1);
    if (pend.kind === "orderLibrary" && pend.owner !== undefined) return [{ type: "orderLibrary", player: pid, order: [...pend.cards].sort((a, b) => isLand(a) - isLand(b) || mv(s, b) - mv(s, a)) }];
    if (pend.kind === "orderLibrary") return [{ type: "orderLibrary", player: pid, order: pend.bottom ? pend.cards : [...pend.cards].sort((a, b) => mv(s, a) - mv(s, b)) }];
    if (pend.kind === "mulligan") return [{ type: "mulligan", player: pid, keep: !pend.canMulligan || keepsHand(s, pid, pend.taken) }];
    if (pend.kind === "bottomCards") return [{ type: "bottomCards", player: pid, objectIds: chooseBottom(s, pid, pend.count) }];
    if (pend.kind === "discardToHandSize") {
      const hand = [...player(s, pid).hand].sort((a, b) => mv(s, b) - mv(s, a));
      return [{ type: "discard", player: pid, objectIds: hand.slice(0, pend.count) }];
    }
  }
  const shield = chooseFullShield(s, pid);
  if (shield) return shield;
  const deflect = chooseDeflection(s, pid);
  if (deflect) return deflect;
  const echo = chooseCopyWithTaps(s, pid);
  if (echo) return echo;
  // Respond to an opponent's spell with a counterspell if we have one: from hand, or an ability
  // like Spiketail Hatchling's. "Unless its controller pays" only if they can't pay.
  const top = s.stack[s.stack.length - 1];
  if (top && top.kind === "spell" && top.controller !== pid && top.objectId && mv(s, top.objectId) >= 3) {
    // "End the turn" and nothing else (Time Stop, Discontinuity, Sundial of the Infinite on our turn) exiles every spell
    // and ability on the stack (CR 724.1b): worth it when none of them is ours.
    const theirs = s.stack.every((x) => x.controller !== pid) && !s.triggerQueue.some((t) => t.controller === pid);
    // Also a counter inside a branch (Invert Polarity's lost flip) and taking the spell over (Commandeer).
    const worthIt = (body: AbilityBody, sourceId: ObjectId, x = 0) => {
      if (endsTurnOnly(body)) return theirs;
      // Glen Elendra's Answer counters only what opponents control: always worth it against their spell. Whirlwind
      // Denial: unless they can pay its {4} for it.
      const denial = body.effects.find((e) => e.type === "counterOpponentsStackUnless");
      if (denial?.type === "counterOpponentsStackUnless") return !canPayUnless(s, top.controller, denial.unless, pid, sourceId, x);
      if (countersTheirStack(body)) return true;
      const c = allEffects(body.effects).find((e) => e.type === "counterSpell" || e.type === "controlSpell");
      // Ertai's Trickery: only a kicked spell is countered.
      if (c?.type === "counterSpell" && c.ifKicked && !top.kicked?.length) return false;
      return !!c && (c.type !== "counterSpell" || !c.unless || !canPayUnless(s, top.controller, c.unless, pid, sourceId, x));
    };
    for (const id of player(s, pid).hand) {
      const d = defOf(s, obj(s, id));
      const body = compileCard(d).spell;
      // An X counterspell ("unless its controller pays {X}"): as big as we can make it.
      const cost = parseManaCost(d.manaCost);
      // "Counter target spell with mana value X" (Spell Blast): X is that spell's mana value (CR 202.3e).
      const exact = body?.targets.some((t) => t.xRange?.key === "manaValue" && t.xRange.at === "exact");
      const x = cost.hasX ? (exact ? spellManaValue(s, top) : Math.max(0, availableMana(s, pid) - manaValue(cost))) : undefined;
      if (!body || !worthIt(body, id, x)) continue;
      const targets = chooseTargets(s, pid, body, false, id, x) ?? undefined;
      // "If you control a commander, you may cast ~ without paying its mana cost" (Fierce Guardianship): free first.
      if (targets && freeAlt(d)) {
        const free = planCast(s, pid, id, targets, undefined, "auto", undefined, { alt: "alternative" });
        if (free && free[free.length - 1]!.type === "castSpell") return free;
      }
      const plan = planCast(s, pid, id, targets, undefined, "auto", x);
      if (plan && plan[plan.length - 1]!.type === "castSpell" && ((plan[plan.length - 1] as { targets?: unknown }).targets || endsTurnOnly(body) || countersTheirStack(body))) return plan;
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
        // Kozilek, the Great Distortion: X is the spell's mana value, paid with the least useful card with that mana value.
        if (!ab.body.modal && !parseManaCost(ab.manaCost).hasX && ab.costs?.length === 1 && ab.costs[0]!.kind === "discard" && ab.costs[0]!.mvX && worthIt(ab.body, id)) {
          const x = spellManaValue(s, top);
          const card = chooseDiscards(s, pid, player(s, pid).hand.length).find((h) => mv(s, h) === x);
          const plan = card && planActivate(s, pid, id, i, [{ kind: "stack", id: top.id }], undefined, undefined, x, { discard: [card] });
          if (plan) return plan;
          continue;
        }
        if (ab.body.modal || parseManaCost(ab.manaCost).hasX || abilityCostsHaveX(ab) || !worthIt(ab.body, id)) continue;
        const targets = chooseTargets(s, pid, ab.body, false, id);
        const plan = targets && planActivate(s, pid, id, i, targets);
        if (plan) return plan;
      }
    }
  }
  const dial = chooseEndTurnEscape(s, pid);
  if (dial) return dial;
  const regen = chooseRegeneration(s, pid) ?? chooseFlipEscape(s, pid) ?? chooseDeathReturn(s, pid) ?? chooseCommanderReturn(s, pid) ?? chooseRedirect(s, pid) ?? chooseDamageShield(s, pid) ?? chooseProtection(s, pid) ?? chooseNinjutsu(s, pid) ?? chooseSneak(s, pid) ?? chooseForecast(s, pid) ?? chooseTimed(s, pid);
  if (regen) return regen;
  if (canActAtSorcerySpeed(s, pid)) {
    const land = chooseLand(s, pid);
    if (land) return [land];
    const fetch = chooseFetch(s, pid);
    if (fetch) return fetch;
    // Turn face-down creatures face up when we can pay for it (CR 702.37e).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (!o.faceDown || controllerOf(s, o) !== pid) continue;
      // A manifested card with morph has two ways (CR 701.40c): the cheaper first.
      const ways = faceUpWays(s, o).map((w, i) => ({ i, v: manaValue(parseManaCost(w.cost)) })).sort((a, b) => a.v - b.v);
      for (const w of ways) {
        const extra = faceUpWays(s, o)[w.i]!.costs;
        const costs = extra ? faceUpCosts(s, pid, o, extra) : undefined;
        if (costs === null) continue;
        const plan = planTurnFaceUp(s, pid, id, w.i, faceUpX(s, pid, o, w.i), costs, botFaceUpForm(s, o));
        if (plan) return plan;
      }
    }
    const p = player(s, pid);
    // With The Great Work, any graveyard's instants and sorceries.
    const anyYard = s.graveyardTurn?.some((g) => g.anyGraveyard && g.player === pid && g.turn === s.turn);
    // Locke, Treasure Hunter: the cards it milled, in anyone's graveyard.
    // Whispersteel Dagger: the damaged player's graveyard.
    const milled = (s.graveGrants ?? []).flatMap((g) => (g.player === pid && g.turn === s.turn && !(s.turnLog?.gravePermits ?? []).includes(g.key) ? (g.cards ? g.cards.map((c) => c.id) : g.fromYardOf !== undefined ? [...(s.players[g.fromYardOf]?.graveyard ?? [])] : []) : []));
    const fromYard = [...new Set([...(anyYard ? s.players.flatMap((q) => q.graveyard) : p.graveyard), ...milled.filter((id) => s.objects[id]?.zone === "graveyard")])].filter((id) => graveyardWays(s, obj(s, id), pid).length);
    // Cards exiled with "you may play them until ..." first: they won't wait (impulse draw).
    const options = [...exilePlayable(s, pid), ...topPlayable(s, pid), ...p.command, ...p.hand, ...fromYard]
      // A land with an Adventure can still go on its adventure (CR 715.3).
      .filter((id) => !isType(defOf(s, obj(s, id)), "Land") || castableFaces(s, obj(s, id)).length)
      // Damage prevention waits for damage coming (chooseDamageShield).
      .filter((id) => !shieldBody(compileCard(defOf(s, obj(s, id))).spell))
      // Misleading Signpost waits for an attack to turn (chooseTimed); Windshaper Planetar is a creature worth casting anyway.
      .filter((id) => isType(defOf(s, obj(s, id)), "Creature") || !attackStepOnly(compileCard(defOf(s, obj(s, id)))))
      .map((id) => {
        const plan = obj(s, id).zone === "graveyard" ? graveyardCastPlan(s, pid, id) : (commandZonePlan(s, pid, id) ?? facePlan(s, pid, id, false, "first") ?? freerunPlan(s, pid, id) ?? overloadPlan(s, pid, id) ?? awakenPlan(s, pid, id) ?? cheaperAltPlan(s, pid, id) ?? bestowPlan(s, pid, id) ?? freeAltPlan(s, pid, id) ?? castPlan(s, pid, id, false) ?? altCastPlan(s, pid, id) ?? facePlan(s, pid, id, false, "after"));
        return plan ? { plan, mv: mv(s, id) } : null;
      })
      .filter((x): x is { plan: Action[]; mv: number } => !!x)
      .sort((a, b) => b.mv - a.mv);
    // Detection Tower first, when it lets a spell we'd cast target what has hexproof.
    const sight = chooseHexproofSight(s, pid);
    if (sight) return sight;
    // Court of Locthwain's free spell is for this turn only too.
    const expiring = options.find((x) => x.plan.some((a) => a.type === "castSpell" && obj(s, a.objectId).zone === "exile" && (a.alt === "linkedFree" || /Turn$|EndStep$/.test(obj(s, a.objectId).mayPlay?.until ?? ""))));
    if (expiring) return expiring.plan;
    if (options[0]) return cubeInstead(s, pid, options[0].plan) ?? options[0].plan;
    // Food Chain, Ashnod's Altar: a creature given up for mana, to cast a card that does more.
    const fed = chooseCreatureForMana(s, pid) ?? chooseForageForMana(s, pid);
    if (fed) return fed;
    // A loyalty ability of each planeswalker we control, once spells are cast (CR 606.3).
    const loyalty = chooseLoyalty(s, pid);
    if (loyalty) return loyalty;
    // Suspend what we can't cast now (CR 702.62a).
    const sus = chooseSuspend(s, pid);
    if (sus) return sus;
    // Unlock a door of a Room we control, the dearest we can pay for (CR 709.5e), once spells are cast.
    const unlock = chooseUnlock(s, pid);
    if (unlock) return unlock;
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
    // Crew Vehicles and saddle Mounts before combat; make Mechtitan (it has haste).
    if (s.step === "main1") {
      const crew = chooseActivation(s, pid, makesTitan) ?? chooseCrew(s, pid) ?? chooseSaddle(s, pid);
      if (crew) return crew;
    }
    // Use activated abilities once we're done casting spells, then cycle what we can't use.
    if (s.step === "main2") {
      const act = chooseStation(s, pid) ?? chooseActivation(s, pid) ?? chooseCycling(s, pid);
      if (act) return cubeInstead(s, pid, act) ?? act;
      // Then a spell that ends the turn (Ultima, Day's Undoing): the last thing we do this turn.
      const end = endTurnCast(s, pid);
      if (end) return end;
    }
  }
  return [{ type: "passPriority", player: pid }];
}

/**
 * How to forage (CR 701.61a): three cards from our graveyard that do nothing more there, else a Food that isn't a
 * creature (a Food token first), else any three cards from the graveyard; null if we can't. Not what's in `busy`.
 */
function forageChoice(s: GameState, pid: PlayerId, o: GameObject, busy: ObjectId[]): CostChoices | null {
  const ways = forageWays(s, pid, o);
  const cards = ways.cards.filter((c) => !busy.includes(c)).sort((a, b) => (usefulInGraveyard(s, a) ? 1 : 0) - (usefulInGraveyard(s, b) ? 1 : 0));
  if (cards.length >= 3 && !cards.slice(0, 3).some((c) => usefulInGraveyard(s, c))) return { exileCards: cards.slice(0, 3) };
  const food = ways.foods
    .map((x) => obj(s, x))
    .filter((x) => !busy.includes(x.id) && x.id !== o.id && !objIsType(s, x, "Creature"))
    .sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
  if (food) return { sacrifice: [food.id] };
  return cards.length >= 3 ? { exileCards: cards.slice(0, 3) } : null;
}

/** Ending this combat phase (Mandate of Peace) is worth it: an opponent's attack on us, of at least 4 power (or our life), before its damage. */
function endCombatWorth(s: GameState, pid: PlayerId): boolean {
  if (s.activePlayer === pid || !["declareAttackers", "declareBlockers"].includes(s.step)) return false;
  const coming = s.battlefield.map((x) => obj(s, x)).filter((o) => o.attacking === pid).reduce((n, o) => n + Math.max(0, power(s, o)), 0);
  return coming >= Math.min(4, player(s, pid).life);
}

/**
 * "End the turn" and nothing more (Time Stop, Discontinuity, Sundial of the Infinite), or "exile all other spells and
 * counter all abilities" (Summary Dismissal): it stops everything on the stack, so it's worth it only when none of it is ours.
 */
function endsTurnOnly(body: AbilityBody): boolean {
  return !body.targets.length && !body.modal && body.effects.length > 0 && (body.effects.every((e) => e.type === "endTurn") || body.effects.every((e) => e.type === "dismissStack"));
}

/** "Counter all spells your opponents control and all abilities your opponents control" (Glen Elendra's Answer). */
function countersTheirStack(body: AbilityBody): boolean {
  return !body.targets.length && body.effects.some((e) => e.type === "counterOpponentsStack" || e.type === "counterOpponentsStackUnless");
}

/**
 * What one option of a villainous choice we face would cost us, roughly, in life points: what we'd lose (life, cards,
 * permanents) plus what its controller would gain (cards, tokens, a free spell). "eventPlayer" in it is us.
 */
function villainCost(s: GameState, pid: PlayerId, fx: Effect[]): number {
  const me = player(s, pid);
  const n = (a: unknown, guess: number) => (typeof a === "number" ? a : guess);
  const us = (w: { ref: string } | undefined) => w?.ref === "eventPlayer";
  return fx.reduce((sum, e) => {
    switch (e.type) {
      case "loseLife":
        // Not the option that would lose us the game (CR 104.3b).
        return sum + (us(e.who) ? (typeof e.n === "number" && e.n >= me.life ? 100 : n(e.n, 3)) : 0);
      case "shuffleIntoLibrary":
        return sum;
      case "damage": {
        const to = e.to as { ref: string };
        if (!us(to)) return sum + 1;
        const c = typeof e.amount === "object" && "count" in e.amount ? e.amount.count : undefined;
        return sum + (c?.kind === "cardsInHand" ? me.hand.length : c?.kind === "exiledTopManaValue" ? 8 : n(e.amount, 4));
      }
      case "pick":
        // This Is How It Ends: one of our own creatures shuffled away, if we own any.
        if (us(e.who) && e.action === "choose" && e.anyController && e.filter.kind === "object" && e.filter.owner === "you") return sum + (s.battlefield.some((id) => obj(s, id).owner === pid && objectMatches(s, e.filter, obj(s, id), pid, false)) ? 5 : 0);
        return sum + (us(e.who) && e.action === "sacrifice" ? (s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, e.filter, obj(s, id), pid, false)) ? 5 : 0) : 2);
      case "discard":
        return sum + (us(e.who) ? Math.min(me.hand.length, e.hand ? me.hand.length : n(e.n, 1)) * 1.5 : 0);
      case "draw":
        return sum + (us(e.who) ? -1.5 * n(e.n, 1) : e.who.ref === "you" ? 1.5 * n(e.n, 1) : 0);
      case "exileTop":
        return sum + (us(e.who) ? 0.3 * n(e.n, 1) : 0);
      case "exileUntilNonland":
        return sum + 5;
      case "createToken":
        return sum + 3 * n(e.n, 1);
      default:
        return sum + 3;
    }
  }, 0);
}

/**
 * "Each player's life total becomes the number of creatures they control" (Biorhythm, Shaman of Forgotten Ways): only
 * when we'd stay above 0, and either not lose life or take an opponent to 0.
 */
function lifeSwapHurts(s: GameState, pid: PlayerId, effects: Effect[]): boolean {
  const e = allEffects(effects).find((x): x is Extract<Effect, { type: "setLife" }> => x.type === "setLife" && x.who.ref === "eachPlayer" && !!x.amount);
  if (!e) return false;
  const own = JSON.parse(JSON.stringify(e.amount).replace(/\{"ref":"eachOne"\}/g, '{"ref":"you"}')) as Amount;
  const after = (p: PlayerId) => evalAmount(s, own, { controller: p });
  const mine = after(pid);
  return mine <= 0 || (mine < player(s, pid).life && !opponents(s, pid).some((p) => after(p) <= 0));
}

/** castPlan may plan a spell that ends the turn (endTurnCast). */
let endingTurn = false;

/**
 * A spell that does something, then ends the turn (Ultima, Hurkyl's Final Meditation, Day's Undoing; CR 724.1): cast
 * as the last thing in our second main phase, the most expensive first, judged like any other spell of its kind (a
 * board wipe only when it hurts the opponents more). A wheel (Day's Undoing) only with two cards or fewer left in hand.
 * "End the turn" alone waits for a spell to stop (see the counterspell response), and Glorious End would lose us the
 * game: neither is cast here.
 */
function endTurnCast(s: GameState, pid: PlayerId): Action[] | null {
  if (s.activePlayer !== pid || s.stack.length) return null;
  const hand = player(s, pid).hand;
  const cards = hand
    .filter((id) => {
      const body = compileCard(defOf(s, obj(s, id))).spell;
      const all = allEffects(body?.effects ?? []);
      if (!body || !all.some((e) => e.type === "endTurn") || endsTurnOnly(body)) return false;
      if (all.some((e) => e.type === "loseGame" || (e.type === "delayed" && allEffects(e.effects).some((x) => x.type === "loseGame")))) return false;
      return !all.some((e) => e.type === "shuffleZones" && e.hand) || hand.length - 1 <= 2;
    })
    .sort((a, b) => mv(s, b) - mv(s, a));
  endingTurn = true;
  try {
    for (const id of cards) {
      const plan = castPlan(s, pid, id, false);
      if (plan) return plan;
    }
  } finally {
    endingTurn = false;
  }
  return null;
}

/**
 * Sundial of the Infinite in our end step: our own trigger on the stack would sacrifice, exile or bounce something of
 * ours that's on the battlefield (Sneak Attack, unearth, Mimic Vat) or lose us the game, so we end the turn and it's
 * exiled (CR 724.1b).
 */
function chooseEndTurnEscape(s: GameState, pid: PlayerId): Action[] | null {
  if (s.activePlayer !== pid || (s.step !== "end" && s.step !== "endCombat")) return null;
  const top = s.stack[s.stack.length - 1];
  if (!top || top.kind !== "ability" || top.controller !== pid || !top.body) return null;
  if (!s.stack.every((x) => x.controller === pid || x.kind === "ability")) return null;
  const mine = (r: ObjRef | undefined) => {
    if (!r) return false;
    const id = r.ref === "subject" ? top.subject?.id : r.ref === "self" ? top.sourceId : undefined;
    if (id) return s.objects[id]?.zone === "battlefield" && controllerOf(s, obj(s, id)) === pid;
    return r.ref === "each" && s.battlefield.some((b) => controllerOf(s, obj(s, b)) === pid && objectMatches(s, r.filter, obj(s, b), pid, false));
  };
  const hurts = allEffects(top.body.effects).some(
    (e) => (e.type === "loseGame" && e.who.ref === "you") || ((e.type === "sacrifice" || e.type === "exile" || e.type === "bounce" || e.type === "destroy") && "what" in e && mine(e.what as ObjRef)),
  );
  if (!hurts) return null;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      if (!endsTurnOnly(abilities[i]!.body)) continue;
      const plan = planActivate(s, pid, id, i, []);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Exert (CR 701.43d): for what it triggers (its own "when you do", or "whenever you exert a creature"), while there's
 * life to spare for it not untapping to block.
 */
/**
 * What we'd pay a morph cost that isn't mana with ("Morph—Discard a card", CR 702.37e), or null if we'd rather leave it
 * face down: life with plenty to spare; the cards in hand we'd discard first, keeping one; any card to reveal (it stays
 * in hand); tokens and cheap permanents to sacrifice or return, lands only once we have plenty. Never our commander.
 */
function faceUpCosts(s: GameState, pid: PlayerId, o: GameObject, costs: AdditionalCost[]): CostChoices | null {
  const out: CostChoices = {};
  const hand = player(s, pid).hand;
  for (const c of costs) {
    if (c.kind === "payLife") {
      if (player(s, pid).life < c.n + 15) return null;
    } else if (c.kind === "reveal" && !c.orControl) {
      const fits = hand.filter((x) => printedMatches(c.filter, defOf(s, obj(s, x))));
      if (fits.length < c.n) return null;
      out.reveal = fits.slice(0, c.n);
    } else if (c.kind === "discard" && !c.random) {
      const fits0 = chooseDiscards(s, pid, hand.length).filter((x) => !c.filter || printedMatches(c.filter, defOf(s, obj(s, x))));
      const fits = c.differentNames ? differentlyNamed(s, fits0) : fits0;
      if (fits.length < c.n || hand.length < c.n + 1) return null;
      out.discard = fits.slice(0, c.n);
    } else if (c.kind === "sacrifice" || c.kind === "returnToHand") {
      const pool = (c.kind === "sacrifice" ? s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objectMatches(s, c.filter, obj(s, x), pid, false) && canSacrificeForCost(s, obj(s, x))) : returnCandidates(s, pid, c))
        .map((x) => obj(s, x))
        .filter((x) => x.id !== o.id && !x.isCommander && (objIsType(s, x, "Land") ? lands(s, pid) >= 6 + c.n : x.isToken || worth(s, pid, x) <= 3))
        .sort((a, b) => Number(b.tapped) - Number(a.tapped) || worth(s, pid, a) - worth(s, pid, b));
      if (pool.length < c.n) return null;
      out[c.kind] = pool.slice(0, c.n).map((x) => x.id);
    } else return null;
  }
  return out;
}

/**
 * The X to turn a face-down permanent face up with, for an {X} in its morph or disguise cost (CR 107.3d): as much as we
 * can pay, except that "up to X targets" (Aurelia's Vindicator) takes only as many as we'd choose, and "all creatures
 * get -X/-X" (Bane of the Living) the X that kills the most worth of our opponents' creatures for the least of ours.
 */
/** The form scored best, as "As ~ enters, it becomes your choice of ..." picks: flying first, never defender, then the most power. */
function botFormIndex(labels: string[]): number {
  const score = (label: string) => (/defender/.test(label) ? -100 : 0) + (/flying/.test(label) ? 10 : 0) + Number(/(\d+)\//.exec(label)?.[1] ?? 0);
  return labels.map((l, i) => ({ i, sc: score(l) })).sort((a, b) => b.sc - a.sc)[0]?.i ?? 0;
}

/** Aquamorph Entity: the form it's turned face up as (CompiledCard.faceUpForms), undefined for the rest. */
function botFaceUpForm(s: GameState, o: GameObject): number | undefined {
  const forms = faceUpFormsOf(s, o);
  return forms ? botFormIndex(forms.map((f) => f.text)) : undefined;
}

function faceUpX(s: GameState, pid: PlayerId, o: GameObject, way: number): number {
  const cost = faceUpWays(s, o)[way]!.cost;
  const per = xCount(parseManaCost(cost));
  if (!per) return 0;
  const most = Math.max(0, Math.floor((availableMana(s, pid) - manaValue(parseManaCost(faceUpManaCost(cost)))) / per));
  const card = faceUpDefOf(s, o);
  const body = compileCard(card).triggers.find((t) => t.event === "selfTurnedFaceUp")?.body;
  if (!body || !most) return most;
  if (body.targets.some((t) => t.many === "x")) return (chooseTargets(s, pid, body, false, o.id, most) ?? []).filter((t) => t.kind !== "none").length;
  const shrinks = body.effects.some((e) => e.type === "continuous" && e.what.ref === "each" && e.mods.some((m) => m.kind === "modifyPT" && typeof m.toughness === "object" && !!m.toughness.negate));
  if (!shrinks) return most;
  // "All creatures get -X/-X" (Bane of the Living): each X tried on a copy of the game, turned face up and its trigger
  // resolved with everyone passing, so what else applies (indestructible, toughness boosts, regeneration, dies triggers)
  // counts. What leaves the battlefield is scored by its worth now (Bane's face up): an opponent's for us, ours 1.5 times against.
  const before = s.battlefield.filter((id) => objIsType(s, obj(s, id), "Creature") || id === o.id).map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0, v: (controllerOf(s, obj(s, id)) === pid ? -1.5 : 1) * (id === o.id ? Math.max(1, Number(card.power ?? 0) + Number(card.toughness ?? 0)) + 1 : worth(s, pid, obj(s, id))) }));
  const score = (x: number): number | null => {
    const plan = planTurnFaceUp(s, pid, o.id, way, x, undefined, botFaceUpForm(s, o));
    if (!plan) return null;
    const u = cloneState(s);
    try {
      for (const a of plan) applyInPlace(u, a);
      for (let k = 0; k < 20 && (u.stack.length || u.triggerQueue.length) && !u.pending; k++) applyInPlace(u, { type: "passPriority", player: waitingOn(u)! });
    } catch {
      return null;
    }
    return before.reduce((n, b) => (u.objects[b.id]?.zone === "battlefield" && (u.objects[b.id]!.zoneChanges ?? 0) === b.zc ? n : n + b.v), 0);
  };
  let best = 0;
  let bestScore = score(0) ?? 0;
  for (let x = 1; x <= most; x++) {
    const v = score(x);
    if (v !== null && v > bestScore) [best, bestScore] = [x, v];
  }
  return best;
}

/**
 * Another Round's "exile any number of creatures you control, then return them": ours that do something as they enter
 * (or come back face up), not tokens (they'd be gone, CR 111.7), commanders (they'd go to the command zone), what we don't
 * own (it would return to its owner), or what would lose counters or Auras on it.
 */
function chooseFlickers(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId[] {
  return options.filter((id) => {
    const o = obj(s, id);
    if (o.owner !== pid || o.isToken || o.isCommander || Object.values(o.counters).some((n) => (n ?? 0) > 0)) return false;
    if (s.battlefield.some((b) => obj(s, b).attachedTo === id && objIsType(s, obj(s, b), "Aura"))) return false;
    const c = compileCard(faceUpDefOf(s, o));
    return !!o.faceDown || c.triggers.some((tr) => tr.event === "selfEnters") || !!c.entersWithCounters;
  });
}

/**
 * Join forces (Minds Aglow, Collective Voyage, Alliance of Arms, Shared Trauma) and Liege of the Hollows: how much of the
 * `max` mana we could pay to pay. Our own share (Liege's Squirrels): all of it. A shared X does as much for every player,
 * so only what still does us good: cards we can draw without emptying our library, basic lands left to find, and no
 * milling for an opponent's spell. On an opponent's spell we also keep the mana for our dearest instant-speed card.
 */
function joinForcesAmount(s: GameState, pid: PlayerId, max: number): number {
  const r = s.resolving!;
  const fx = allEffects(r.body.effects);
  // Errant Minion: enough to prevent the damage, no more.
  const minion = fx.find((e) => e.type === "damage" && e.preventOf);
  if (minion?.type === "damage") return Math.min(max, typeof minion.amount === "number" ? minion.amount : max);
  if (JSON.stringify(fx).includes('"whose"')) return max;
  const paid = r.scratch?.join?.paid ?? 0;
  const me = player(s, pid);
  const mine = r.item.controller === pid;
  // Mana-Charged Dragon: "~ gets +X/+0 until end of turn" helps only its controller: nothing from anyone else.
  if (fx.every((e) => e.type === "joinForces" || (e.type === "continuous" && e.what.ref === "self"))) return mine ? max : 0;
  let room = Infinity;
  for (const e of fx) {
    if (e.type === "draw" || (e.type === "mill" && mine)) room = Math.min(room, me.library.length - 1 - paid);
    else if (e.type === "mill") room = 0;
    else if (e.type === "search") room = Math.min(room, me.library.filter((id) => (e.filter ? printedMatches(e.filter, defOf(s, obj(s, id))) : true)).length - paid);
  }
  const instants = mine ? [] : me.hand.map((id) => defOf(s, obj(s, id))).filter((d) => isType(d, "Instant") || d.keywords.includes("Flash"));
  const keep = Math.max(0, ...instants.map((d) => manaValue(parseManaCost(d.manaCost))));
  return Math.max(0, Math.min(max - keep, room));
}

function chooseExert(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId[] {
  if (player(s, pid).life <= 10) return [];
  const onExert = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).triggers.some((t) => t.event === "youExert"));
  return options.filter((id) => onExert || abilitiesOf(s, obj(s, id)).triggers.some((t) => t.event === "selfExerted"));
}

/**
 * What to untap under Winter Orb, Static Orb, Smoke and the like (CR 502.3): the best first, each one the limits still
 * allow, so the choice is as full as it can be. Lands making a color no other untapped land makes come first, then
 * creatures by what they're worth, then the rest.
 */
function chooseLimitedUntap(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId[] {
  const untapped = s.battlefield.filter((id) => !obj(s, id).tapped && controllerOf(s, obj(s, id)) === pid);
  const colors = new Set(untapped.flatMap((id) => manaAbilitiesOn(s, obj(s, id)).flatMap((ab) => manaChoices(s, obj(s, id), ab))));
  const value = (id: ObjectId) => {
    const o = obj(s, id);
    const fresh = manaAbilitiesOn(s, o).flatMap((ab) => manaChoices(s, o, ab)).filter((c) => !colors.has(c)).length;
    return fresh * 100 + (objIsType(s, o, "Creature") ? targetWorth(s, pid, { kind: "object", id }, false, 0) : 0) + (objIsType(s, o, "Land") ? 20 : 0);
  };
  const chosen: ObjectId[] = [];
  for (const id of [...options].sort((a, b) => value(b) - value(a))) if (!untapChoiceProblem(s, pid, [], [...chosen, id])) chosen.push(id);
  return chosen;
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
 * Crack a land that sacrifices itself to find lands (Fabled Passage, Myriad Landscape, Evolving Wilds): a free one in
 * our first main phase, one with a mana cost in the second, with mana left over. Command Beacon once our commander costs
 * four or more extra to cast from the command zone.
 */
function chooseFetch(s: GameState, pid: PlayerId): Action[] | null {
  const p = player(s, pid);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid || !objIsType(s, o, "Land")) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (!ab.sacrificeSelf || ab.body.targets.length || ab.costs?.length) continue;
      const fetches = ab.body.effects.every((e) => (e.type === "search" && e.dest.zone === "battlefield" && !!e.filter?.types?.includes("Land") && !e.who && !e.library) || e.type === "if");
      const lands = fetches && p.library.some((c) => { const d = defOf(s, obj(s, c)); return isType(d, "Land") && ab.body.effects.some((e) => e.type === "search" && printedMatches(e.filter!, d)); });
      const beacon = ab.body.effects.length === 1 && ab.body.effects[0]!.type === "commanderToHand" && p.command.some((c) => obj(s, c).isCommander && obj(s, c).owner === pid && (p.commanderCasts[c] ?? 0) >= 2);
      if (!lands && !beacon) continue;
      const free = !manaValue(parseManaCost(ab.manaCost));
      if (free ? s.step !== "main1" : s.step !== "main2") continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      const plan = planActivate(s, pid, id, i);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Play a land that enters untapped if there is one. A land that can enter untapped by revealing a
 * card does; paying life for it (a shock land) is worth it while life is comfortable.
 */
function chooseLand(s: GameState, pid: PlayerId): Action | null {
  const lands = legalActions(s, pid).filter((a): a is Extract<Action, { type: "playLand" }> => a.type === "playLand");
  const p = player(s, pid);
  const options = lands.map((a) =>
    // A modal double-faced card's land face, as it would enter (CR 712.12).
    asFace(s, obj(s, a.objectId), a.face, () => {
      const c = entersRulesOf(s, pid, a.objectId); // under Blood Moon a nonbasic land has none of its abilities (CR 614.12)
      // Spelunking: it enters untapped anyway, so no life is paid for it.
      const free = othersMakeItEnterUntapped(s, obj(s, a.objectId));
      const untapped = c.entersTappedChoice && !free ? canEnterUntapped(s, pid, a.objectId) && (c.entersTappedChoice.kind !== "payLife" || p.life >= 16) : undefined;
      const tapped = !free && (c.entersTapped || (c.entersTappedUnless ? !conditionHolds(s, c.entersTappedUnless, pid) : c.entersTappedChoice ? !untapped : false));
      return { action: { ...a, ...(untapped ? { untapped } : {}) }, tapped };
    }),
  );
  // A land from the graveyard (Crucible of Worlds) first: it keeps a card in hand. A modal double-faced card's land face
  // last: its other face is a spell we may want.
  const spellFace = (id: ObjectId) => !!s.cards[obj(s, id).cardId]?.faces?.some((f) => !f.types.includes("Land"));
  // Lake of the Dead costs a Swamp: last, and never with no Swamp to sacrifice (it would only go to the graveyard).
  // Sheltered Valley sacrifices the others with its name: a normal land with none of them, never played with one.
  const sacAll = (id: ObjectId) => !!compileCard(defOf(s, obj(s, id))).entersSacrificeInsteadAll;
  const sacInstead = (id: ObjectId) => (sacAll(id) ? undefined : compileCard(defOf(s, obj(s, id))).entersSacrificeInstead);
  const rank = (a: Extract<Action, { type: "playLand" }>) => (obj(s, a.objectId).zone === "graveyard" ? 0 : sacInstead(a.objectId) ? 3 : spellFace(a.objectId) ? 2 : 1);
  // Lotus Vale costs two untapped lands: only with five or more lands, so it still adds mana.
  options.splice(0, options.length, ...options.filter((x) => {
    if (sacAll(x.action.objectId)) return !s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && sameName(defOf(s, obj(s, id)).name, defOf(s, obj(s, x.action.objectId)).name));
    const f = sacInstead(x.action.objectId);
    const n = compileCard(defOf(s, obj(s, x.action.objectId))).entersSacrificeInsteadN ?? 1;
    const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);
    return !f || (mine.filter((id) => objectMatches(s, f, obj(s, id), pid, false)).length >= n && (n === 1 || mine.filter((id) => objIsType(s, obj(s, id), "Land")).length >= 5));
  }));
  options.sort((a, b) => rank(a.action) - rank(b.action));
  if (options.some((x) => rank(x.action) < 2)) return (options.find((x) => !x.tapped && rank(x.action) < 2) ?? options.find((x) => rank(x.action) < 2))!.action;
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

const mv = (s: GameState, id: string) => defMv(defOf(s, obj(s, id)));

/**
 * The reflexive ability of a resolving "you may pay {X}. When you do, ..." whose X bots choose for what it does: Tester of
 * the Tangential's "move X +1/+1 counters from ~", Isareth the Awakener's "target creature card with mana value X".
 */
function paidXReflexive(s: GameState): AbilityBody | undefined {
  const r = s.resolving && allEffects(s.resolving.body.effects).flatMap((x) => (x.type === "may" && x.payX && !x.payX.times && !x.payX.color ? x.effects : [])).find((x) => x.type === "reflexive");
  if (r?.type !== "reflexive") return undefined;
  const b = r.body;
  return allEffects(b.effects).some((x) => x.type === "removeAnyCounters" && x.moveN && x.what.ref === "self") || b.targets.some((t) => t.kind === "card" && t.xRange?.key === "manaValue" && t.xRange.at === "exact" && t.owner === "you") ? b : undefined;
}

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
  if (unless.life && payableLife(s, payer) < unless.life) return false;
  if (unless.lifeAmount && payableLife(s, payer) < evalAmount(s, unless.lifeAmount, { controller: pid, sourceId, x })) return false;
  if (unless.sacrifice && pickOptions(s, unless.sacrifice, payer).length < unless.sacrifice.n) return false;
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
const isCounterOnly = (b: AbilityBody) => allEffects(b.effects).some((e) => e.type === "counterSpell" || e.type === "controlSpell");
/** A battle: we don't aim spells at them, only creatures (damage to a Siege helps its controller flip it, CR 310.12b). */
const isBattleTarget = (s: GameState, t: ChosenTarget) => t.kind === "object" && !!s.objects[t.id] && objIsType(s, obj(s, t.id), "Battle");
/**
 * The source of what we're choosing targets for: a card that isn't on the battlefield is taken for a spell (it may be a
 * channel or cycling ability, but then "can't be the target of spells" only makes us skip a target we could have had).
 */
const botSource = (s: GameState, id: ObjectId) => (s.objects[id] && s.objects[id]!.zone !== "battlefield" ? { ...sourceQuality(s, id), spell: true as const } : sourceQuality(s, id));

/**
 * Pick targets for an ability body: harmful effects go at opponents (preferring things
 * they'd kill or the biggest threat), helpful ones at our own stuff. Returns null when
 * there's no sensible choice. With `forced`, always returns some legal choice.
 */
/** How many cards in `pid`'s library have this name (and fit `filter`, its own name left aside): what a search for it can find. */
function libraryCopies(s: GameState, pid: PlayerId, name: string, filter?: TargetSpec): number {
  const f = filter && { ...filter, namedAny: undefined };
  return player(s, pid).library.filter((id) => { const d = defOf(s, obj(s, id)); return sameName(d.name, name) && (!f || printedMatches(f, d)); }).length;
}

/** "Target creature cards with different names": `t` has the name of one of the group already chosen. */
function namedLike(s: GameState, spec: TargetSpec, out: TargetChoice[], t: TargetChoice): boolean {
  if (t.kind !== "object" || !spec.differentNameFrom) return false;
  const name = defOf(s, obj(s, t.id)).name;
  return spec.differentNameFrom.some((j) => { const c = out[j]; return c?.kind === "object" && sameName(defOf(s, obj(s, c.id)).name, name); });
}

/**
 * When everything the instructions do hangs on "if" conditions about target `i` (and on conditions of the game we can
 * check now, like revolt), the targets that would let some of it happen; undefined when the target always matters.
 */
function targetGuard(s: GameState, pid: PlayerId, effects: Effect[], i: number, sourceId?: string): ((t: TargetChoice) => boolean) | undefined {
  if (!effects.length || !effects.every((e) => e.type === "if")) return undefined;
  const tests: ((t: TargetChoice) => boolean)[] = [];
  for (const e of effects as Extract<Effect, { type: "if" }>[]) {
    let branch: Effect[];
    let test: (t: TargetChoice) => boolean = () => true;
    if (e.cond.kind === "targetIs" && e.cond.index === i && !e.cond.filter.bound && !e.otherwise?.length) {
      const f = e.cond.filter;
      test = (t) => {
        if (t.kind === "stack") {
          const item = s.stack.find((x) => x.id === t.id);
          return !!item && spellMatches(s, f, item);
        }
        return t.kind === "object" && !!s.objects[t.id] && objectMatches(s, { ...f, kind: "object" }, obj(s, t.id), pid, false);
      };
      branch = e.effects;
    } else if (e.cond.kind === "targetSharesColorWith" && e.cond.index === i && !e.otherwise?.length) {
      // Jaded Response: a spell sharing a color with one of those permanents now.
      const f = e.cond.filter;
      const colors = [...new Set(s.battlefield.map((id) => obj(s, id)).filter((o) => objectMatches(s, f, o, pid, false)).flatMap((o) => characteristics(s, o).colors))];
      test = (t) => {
        const item = t.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
        return !!item && colors.length > 0 && spellMatches(s, { kind: "spell", types: [], notTypes: [], notColors: [], colors, text: "shares a color" }, item);
      };
      branch = e.effects;
    } else if (e.cond.kind === "state" && sourceId) branch = staticConditionNow(s, e.cond.cond, sourceId, pid) ? e.effects : (e.otherwise ?? []);
    else if (e.cond.kind === "kicked" && e.effects.length && e.otherwise?.length) {
      // Prohibit: kicked or not isn't known here, so a target either branch would act on.
      const a = targetGuard(s, pid, e.effects, i, sourceId);
      const b = targetGuard(s, pid, e.otherwise, i, sourceId);
      if (!a || !b) return undefined;
      tests.push((t) => a(t) || b(t));
      continue;
    } else return undefined;
    if (!branch.length) continue;
    const inner = targetGuard(s, pid, branch, i, sourceId);
    tests.push(inner ? (t) => test(t) && inner(t) : test);
  }
  return (t) => tests.some((f) => f(t));
}

/** Whether what an ability does to its target `i` is bad for that target's controller: removal, damage, -3/-3. */
function harmsChosenTarget(body: AbilityBody, i = 0): boolean {
  // Inside "that player may" (Effect eachMay) too.
  const flat = (es: Effect[]): Effect[] => es.flatMap((e) => (e.type === "eachMay" ? flat(e.effects) : [e]));
  const effects = flat(body.effects);
  return (
    !!harmfulTargets({ ...body, effects })[i] ||
    allEffects(effects).some(
      (e) =>
        (e.type === "continuous" && e.what.ref === "target" && e.what.index === i && modsAreHarmful(e.mods)) ||
        // Nova Pentacle: damage dealt to it instead.
        (e.type === "damageRule" && e.rule.redirect?.ref === "target" && e.rule.redirect.index === i),
    )
  );
}

/**
 * The mode we choose for another player's spell "An opponent chooses one —" (askModeChooser, CR 700.2e). A mode about us
 * ("that player", PlayerRef modeChooser: Misfortune's counters and damage, Fatal Lore's destruction and draw) when it costs
 * us no creature and no more than a little life (damage keeping us above 10); otherwise, and when no mode is about us
 * (Library of Lat-Nam), the first one that can be chosen.
 */
function modeForOther(s: GameState, pid: PlayerId, d: DeferredAct, legal: boolean[]): number {
  const act = d.act;
  const modal = act.type === "castSpell" ? castingBody(castDef(s, act.objectId, act.alt))?.modal : undefined;
  const first = legal.findIndex(Boolean);
  if (!modal) return Math.max(0, first);
  const aboutUs = modal.modes.map((m) => JSON.stringify(m).includes('"modeChooser"'));
  const ours = modal.modes.findIndex((m, i) => aboutUs[i] && legal[i] && modeSparesUs(s, pid, m));
  return ours >= 0 ? ours : Math.max(0, legal.findIndex((ok, i) => ok && !aboutUs[i]), first);
}

/** A mode about us that costs us no creature, and damage that leaves us above 10 life; anything else in it, no. */
function modeSparesUs(s: GameState, pid: PlayerId, m: AbilityBody): boolean {
  const mine = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid && objIsType(s, o, "Creature"));
  let life = player(s, pid).life;
  for (const e of m.effects) {
    if (e.type === "counters" && e.counter === "-1/-1" && e.what.ref === "each" && typeof e.n === "number") {
      if (mine.some((o) => toughness(s, o) <= (e.n as number))) return false;
    } else if (e.type === "damage" && e.to.ref === "modeChooser" && typeof e.amount === "number") life -= e.amount;
    else if (e.type === "destroy") {
      if (mine.length) return false;
    } else if (!(e.type === "drawUpTo" && e.who.ref === "modeChooser")) return false;
  }
  return life > 10;
}

/** The opponent we ask to choose our spell's mode (askModeChooser): one whose likely choice is a mode about them, else the first. */
function bestModeChooser(s: GameState, pid: PlayerId, options: string[], d: DeferredAct): string {
  const act = d.act;
  const modal = act.type === "castSpell" ? castingBody(castDef(s, act.objectId, act.alt))?.modal : undefined;
  if (!modal) return options[0]!;
  return options.find((q) => modeSparesUs(s, Number(q), modal.modes.find((m) => JSON.stringify(m).includes('"modeChooser"')) ?? modal.modes[0]!)) ?? options[0]!;
}

/**
 * The opponent we ask to choose a target of our spell or ability "of an opponent's choice" (askChoosers): the one whose
 * likely choice (targetForOther, as they'd choose) is the best for us.
 */
function bestChooser(s: GameState, pid: PlayerId, options: string[], d: DeferredAct): string {
  const dc = deferredChoice(s, d);
  if (!dc || options.length < 2) return options[0]!;
  const o = s.objects[d.act.objectId];
  const sourceId = o?.id ?? d.act.objectId;
  const harm = harmsChosenTarget(dc.body, dc.slot);
  const score = (q: PlayerId) => {
    const spec = { ...dc.body.targets[dc.slot]!, ...(dc.body.targets[dc.slot]!.chooserControls ? { controlledBy: q } : {}) };
    const body = { ...dc.body, targets: dc.body.targets.map((t, i) => (i === dc.slot ? spec : t)) };
    const t = targetForOther(s, q, pid, body, sourceId, dc.slot, dc.targets)[0];
    if (t?.kind !== "object" || !s.objects[t.id]) return 0;
    const v = worth(s, pid, obj(s, t.id));
    return isMine(s, pid, t) === harm ? -v : v;
  };
  return [...options].sort((a, b) => score(Number(b)) - score(Number(a)))[0]!;
}

/**
 * The target of `controller`'s triggered ability that we choose for them ("target creature of their choice", TargetSpec
 * chosenBy): legal for the controller (rulings), and the best for us, our most valuable if what it does helps, else
 * theirs (an opponent's), our least valuable only when there's nothing else.
 */
function targetForOther(s: GameState, pid: PlayerId, controller: PlayerId, body: AbilityBody, sourceId: ObjectId, slot = 0, chosen: TargetChoice[] = []): TargetChoice[] {
  const spec = body.targets[slot]!;
  const all = legalTargets(s, spec, controller, undefined, botSource(s, sourceId), sourceId).filter((t) => canChooseTarget(s, body.targets, chosen.slice(0, slot), slot, t, controller, botSource(s, sourceId), sourceId));
  // "Target creature of an opponent's choice they control" (Evangelize, Echo Chamber, Preacher): what it does is for its
  // controller, so our least valuable one; to fight their creature (Magus of the Arena), one that kills it and survives,
  // or survives, or else the least valuable.
  if (spec.chooserControls) {
    const fight = allEffects(body.effects).find((e) => e.type === "fight" && ((e.a.ref === "target" && e.a.index === slot) || (e.b.ref === "target" && e.b.index === slot)));
    const otherRef = fight?.type === "fight" ? (fight.a.ref === "target" && fight.a.index === slot ? fight.b : fight.a) : undefined;
    const other = otherRef?.ref === "target" ? chosen[otherRef.index] : undefined;
    const foe = other?.kind === "object" ? s.objects[other.id] : undefined;
    const rank = (t: TargetChoice) => {
      if (t.kind !== "object") return 0;
      const o = obj(s, t.id);
      if (!foe) return -worth(s, pid, o);
      const kills = power(s, o) >= toughness(s, foe);
      const lives = power(s, foe) < toughness(s, o);
      return (kills && lives ? 2000 : lives ? 1000 : kills ? 500 : 0) - worth(s, pid, o);
    };
    return [[...all].sort((a, b) => rank(b) - rank(a))[0] ?? { kind: "none" }];
  }
  const harm = harmsChosenTarget(body, slot);
  const score = (t: TargetChoice) => {
    if (t.kind !== "object") return t.kind === "player" ? (t.id === pid) !== harm ? 1 : -1 : 0;
    const o = obj(s, t.id);
    const v = o.zone === "battlefield" ? worth(s, pid, o) : 1 + defMv(defOf(s, o));
    return (isMine(s, pid, t) !== harm ? 1 : -1) * v;
  };
  return [[...all].sort((a, b) => score(b) - score(a))[0] ?? { kind: "none" }];
}

export function chooseTargets(s: GameState, pid: PlayerId, printed: AbilityBody, forced = false, sourceId?: string, x = 0): TargetChoice[] | null {
  const out = pickTargets(s, pid, printed, forced, sourceId, x);
  return out && !forced ? withFlagbearer(s, pid, printed, out, sourceId) : out;
}

/**
 * Coalition Honor Guard's rule (flagbearerProblem): with no Flagbearer among the targets when one could be chosen, one
 * slot gets one: an opponent's for a harmful target, our own for a helpful one, else any legal one.
 */
function withFlagbearer(s: GameState, pid: PlayerId, printed: AbilityBody, targets: TargetChoice[], sourceId?: string): TargetChoice[] {
  if (!flagbearerRuleFor(s, pid) || targets.length !== printed.targets.length) return targets;
  const flags = flagbearers(s);
  if (!flags.length || targets.some((t) => t.kind === "object" && flags.includes(t.id))) return targets;
  const harm = harmfulTargets(printed);
  const src = sourceId ? botSource(s, sourceId) : undefined;
  let best: { i: number; id: ObjectId; score: number } | undefined;
  for (const [i, spec] of printed.targets.entries())
    for (const id of flags) {
      if (spec.divided || !canChooseTarget(s, printed.targets, targets, i, { kind: "object", id }, pid, src, sourceId)) continue;
      const mine = controllerOf(s, obj(s, id)) === pid;
      const score = (harm[i] ? !mine : mine) ? 2 : targets[i]!.kind === "none" ? 1 : 0;
      if (!best || score > best.score) best = { i, id, score };
    }
  if (!best) return targets;
  const out = [...targets];
  out[best.i] = { kind: "object", id: best.id };
  return out;
}

function pickTargets(s: GameState, pid: PlayerId, printed: AbilityBody, forced = false, sourceId?: string, x = 0): TargetChoice[] | null {
  // "Target ... of an opponent's choice" (askChoosers): an opponent chooses those, so we leave them none. Only when
  // whatever they choose is theirs (or another opponent's) and what it does is good for us: gaining control of it or a
  // copy (Evangelize, Echo Chamber, Preacher), destroying lands and creatures we don't control (Volcanic Offering). Not a
  // fight (Magus of the Arena) or a target that can be ours (Cuombajj Witches, Diaochan, Nova Pentacle).
  const chosenBy = printed.targets.flatMap((t, i) => (t.chosenBy === "opponent" ? [i] : []));
  if (chosenBy.length) {
    const fights = allEffects(printed.effects).some((e) => e.type === "fight");
    if (!forced && (fights || chosenBy.some((i) => printed.targets[i]!.controller !== "opponent"))) return null;
    const rest = pickTargets(s, pid, { ...printed, targets: printed.targets.map((t) => (t.chosenBy === "opponent" ? (({ chosenBy: _, ...r }) => ({ ...r, skip: true as const }))(t) : t)) }, forced, sourceId, x);
    if (!rest && chosenBy.length < printed.targets.length) return null;
    return printed.targets.map((t, i): TargetChoice => (t.chosenBy === "opponent" ? { kind: "none" } : (rest?.[i] ?? { kind: "none" })));
  }
  // Yare, Blaze of Glory: "target creature defending player controls": only one of ours, while we're attacked, untapped
  // before blockers are declared (to block more) or blocking after; never an opponent's (the effects help the creature).
  if (printed.targets.length === 1 && printed.targets[0]!.defendingAny) {
    const all = legalTargets(s, printed.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const attacked = s.battlefield.some((id) => obj(s, id).attacking === pid);
    const blocksDone = s.step !== "declareAttackers" && s.step !== "beginCombat";
    const ours = all.filter((t) => t.kind === "object" && controllerOf(s, obj(s, t.id)) === pid && (blocksDone ? obj(s, t.id).blocking !== undefined : !obj(s, t.id).tapped)).sort((a, b) => (a.kind === "object" && b.kind === "object" ? toughness(s, obj(s, b.id)) - toughness(s, obj(s, a.id)) : 0));
    if (forced) return ours[0] ? [ours[0]] : all[0] ? [all[0]] : null;
    return attacked && ours[0] ? [ours[0]] : null;
  }
  // "Any number of target creatures": each one there could be, as an "up to" target (CR 601.2c); none there, not worth it.
  const body = offerMany(s, printed, pid, x, sourceId ? botSource(s, sourceId) : undefined, sourceId);
  const many = manySlot(printed.targets);
  if (!forced && many >= 0 && !printed.targets[many]!.skip && body.targets[many]!.skip) return null;
  // Command the Dreadhorde: the cards' total mana value is dealt to us first: the costliest cards that still leave us
  // more than 6 life, none if that's nothing worth it.
  const selfMv = many >= 0 ? body.effects.find((e) => e.type === "damage" && JSON.stringify(e.to) === '{"ref":"you"}' && typeof e.amount === "object" && e.amount.count?.kind === "manaValue" && !!e.amount.count.total) : undefined;
  if (selfMv) {
    const slots = body.targets.length - printed.targets.length + 1;
    const cards = legalTargets(s, body.targets[many]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId).flatMap((t) => (t.kind === "object" ? [t.id] : [])).sort((a, b) => defMv(defOf(s, obj(s, b))) - defMv(defOf(s, obj(s, a))));
    let budget = player(s, pid).life - 7;
    const picked: string[] = [];
    for (const id of cards) {
      const cost = defMv(defOf(s, obj(s, id)));
      if (cost > budget || picked.length >= slots) continue;
      picked.push(id);
      budget -= cost;
    }
    if (!forced && picked.reduce((n, id) => n + defMv(defOf(s, obj(s, id))), 0) < 4) return null;
    if (body.targets.length !== printed.targets.length + slots - 1 || printed.targets.length !== 1) return null;
    return Array.from({ length: slots }, (_, k): TargetChoice => (picked[k] ? { kind: "object", id: picked[k]! } : { kind: "none" }));
  }
  // Portal Manipulator: the creatures attacking us (or our planeswalkers and battles) sent at the player with the most
  // life among those who don't control them, never ourselves.
  const turnAt = printed.effects.length === 1 && printed.effects[0]!.type === "reselectAttack" ? printed.effects[0]! : undefined;
  if (turnAt?.type === "reselectAttack" && turnAt.toPlayer?.ref === "target" && turnAt.toPlayer.index === 0 && many === 1 && printed.targets.length === 2) {
    const slots = body.targets.length - 1;
    const onUs = legalTargets(s, body.targets[1]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId).flatMap((t) => (t.kind === "object" && obj(s, t.id).attacking === pid ? [t.id] : []));
    const to = s.players.filter((p) => !p.lost && p.id !== pid && onUs.some((id) => controllerOf(s, obj(s, id)) !== p.id)).sort((a, b) => b.life - a.life)[0];
    const fallback = s.players.filter((p) => !p.lost && p.id !== pid).sort((a, b) => b.life - a.life)[0];
    if (!to && !forced) return null;
    const target = to ?? fallback;
    if (!target) return null;
    const picks = to ? onUs.filter((id) => controllerOf(s, obj(s, id)) !== to.id).slice(0, slots) : [];
    return [{ kind: "player", id: target.id }, ...Array.from({ length: slots }, (_, k): TargetChoice => (picks[k] ? { kind: "object", id: picks[k]! } : { kind: "none" }))];
  }
  // Halfdane: "~'s base power and toughness become equal to the power and toughness of another target creature": the
  // biggest one there is, whoever controls it.
  const copyPt = body.targets.length === 1 && body.effects.length === 1 && body.effects[0]!.type === "continuous" && body.effects[0]!.what.ref === "self" && body.effects[0]!.mods.length === 1 ? body.effects[0]!.mods[0]! : undefined;
  if (copyPt?.kind === "setPT" && typeof copyPt.power === "object" && copyPt.power.count?.kind === "power" && copyPt.power.count.of?.ref === "target") {
    const all = legalTargets(s, body.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const size = (t: TargetChoice) => (t.kind === "object" ? power(s, obj(s, t.id)) * 2 + toughness(s, obj(s, t.id)) : -1);
    const pick = [...all].sort((a, b) => size(b) - size(a))[0];
    return pick ? [pick] : null;
  }
  // Goblin Welder: our own cheapest artifact for a costlier artifact card in our graveyard.
  const weld = body.effects.find((e) => e.type === "weld");
  if (weld?.type === "weld") {
    const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Artifact") && id !== sourceId && !obj(s, id).isCommander).sort((a, b) => mv(s, a) - mv(s, b));
    const cards = player(s, pid).graveyard.filter((id) => isType(defOf(s, obj(s, id)), "Artifact") && isPermanentCard(defOf(s, obj(s, id)))).sort((a, b) => mv(s, b) - mv(s, a));
    if (mine[0] && cards[0] && mv(s, cards[0]) > mv(s, mine[0])) {
      const t: TargetChoice[] = [];
      t[weld.artifact] = { kind: "object", id: mine[0] };
      t[weld.card] = { kind: "object", id: cards[0] };
      return t;
    }
    return null;
  }
  // A Licid: in our main phase, an Aura on our best creature if it helps what it enchants (Gliding, Nurturing Licid), on
  // an opponent's otherwise (Calming, Leeching, Dominating Licid). Bots don't pay to end the effect.
  if (body.targets.length === 1 && body.effects.length === 1 && body.effects[0]!.type === "becomeLicid" && sourceId) {
    const own = compileCard(defOf(s, obj(s, sourceId)));
    const helps = own.statics.length ? !modsAreHarmful(own.statics.flatMap((st) => st.mods)) : !own.triggers.length && own.activated.length > 1;
    const all = legalTargets(s, body.targets[0]!, pid, undefined, botSource(s, sourceId), sourceId).filter((t) => t.kind === "object" && t.id !== sourceId);
    const ranked = all.filter((t) => t.kind === "object" && (controllerOf(s, obj(s, t.id)) === pid) === helps).sort((a, b) => (a.kind === "object" && b.kind === "object" ? worth(s, pid, obj(s, b.id)) - worth(s, pid, obj(s, a.id)) : 0));
    if (forced) return ranked[0] ? [ranked[0]] : all[0] ? [all[0]] : null;
    return ranked[0] && s.activePlayer === pid && s.step === "main1" && !s.stack.length ? [ranked[0]] : null;
  }
  // "Target creature becomes prepared" (Skycoach Waypoint): our best creature that has a prepare spell and isn't prepared;
  // "... becomes unprepared" (Biblioplex Tomekeeper): an opponent's prepared creature. Anything else does nothing (rulings).
  if (body.targets.length === 1 && body.effects.length === 1 && body.effects[0]!.type === "becomePrepared" && body.effects[0]!.what.ref === "target") {
    const un = !!body.effects[0]!.un;
    const all = legalTargets(s, body.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const ranked = all.filter((t) => t.kind === "object" && (un ? !!obj(s, t.id).prepared && controllerOf(s, obj(s, t.id)) !== pid : !obj(s, t.id).prepared && !!prepareSpellOf(s, obj(s, t.id)) && controllerOf(s, obj(s, t.id)) === pid)).sort((a, b) => (a.kind === "object" && b.kind === "object" ? worth(s, pid, obj(s, b.id)) - worth(s, pid, obj(s, a.id)) : 0));
    const pick = ranked[0] ?? (forced ? all[0] : undefined);
    return pick ? [pick] : null;
  }
  // Misleading Signpost: the attacker we'd turn, the strongest one attacking us first, then one of ours.
  if (body.targets.length === 1 && body.effects.length === 1 && body.effects[0]!.type === "reselectAttack") {
    const all = legalTargets(s, body.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const rank = (t: TargetChoice) => (t.kind !== "object" ? -1 : !reselectPick(s, pid, obj(s, t.id)) ? -1 : (obj(s, t.id).attacking === pid ? 1000 : 0) + power(s, obj(s, t.id)));
    const pick = [...all].sort((a, b) => rank(b) - rank(a))[0];
    return pick && rank(pick) >= 0 ? [pick] : forced && all[0] ? [all[0]] : null;
  }
  // Reins of Power: in our own first main phase, the opponent whose creatures are worth the most, if more than ours (we
  // attack with theirs, and they can block with ours).
  if (body.targets.length === 1 && body.effects.length === 1 && body.effects[0]!.type === "swapCreatures") {
    const all = legalTargets(s, body.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const army = (who: PlayerId) => s.battlefield.filter((id) => objIsType(s, obj(s, id), "Creature") && controllerOf(s, obj(s, id)) === who).reduce((n, id) => n + worth(s, who, obj(s, id)), 0);
    const ranked = all.filter((t): t is Extract<TargetChoice, { kind: "player" }> => t.kind === "player").sort((a, b) => army(b.id) - army(a.id));
    const pick = ranked[0];
    if (forced) return pick ? [pick] : null;
    return pick && s.activePlayer === pid && s.step === "main1" && army(pick.id) > army(pid) + 3 ? [pick] : null;
  }
  // Juxtapose: the opponent whose greatest mana value creature and artifact are worth the most more than ours.
  if (body.targets.length === 1 && body.effects.length === 1 && body.effects[0]!.type === "juxtapose") {
    const types = body.effects[0]!.types;
    const all = legalTargets(s, body.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const top = (who: PlayerId, type: string) => {
      const mine = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === who && objIsType(s, o, type));
      const mv = Math.max(-1, ...mine.map((o) => characteristics(s, o).manaValue));
      return mine.filter((o) => characteristics(s, o).manaValue === mv);
    };
    const gain = (them: PlayerId) => types.reduce((n, type) => {
      const [ours, theirs] = [top(pid, type), top(them, type)];
      if (!ours.length || !theirs.length) return n;
      return n + Math.min(...theirs.map((o) => worth(s, pid, o))) - Math.max(...ours.map((o) => (o.isCommander ? 100 : worth(s, pid, o))));
    }, 0);
    const ranked = all.filter((t): t is Extract<TargetChoice, { kind: "player" }> => t.kind === "player" && t.id !== pid).sort((a, b) => gain(b.id) - gain(a.id));
    const pick = ranked[0];
    if (forced) return pick ? [pick] : all[0] ? [all[0]] : null;
    return pick && gain(pick.id) > 2 ? [pick] : null;
  }
  // Exchanging control (Switcheroo, Avarice Totem): our least useful permanent for an opponent's most useful one, worth it
  // only when theirs is worth clearly more; an exchange between two of their permanents does us no good.
  const swap = body.effects.find((e): e is Extract<Effect, { type: "exchangeControl" }> => e.type === "exchangeControl");
  if (swap && body.targets.length <= 2 && (swap.a.ref === "target" || swap.a.ref === "self") && swap.b.ref === "target" && body.targets.every((t) => t.kind === "object")) {
    const me = sourceId ? s.objects[sourceId] : undefined;
    const options = (i: number) => legalTargets(s, body.targets[i]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId).flatMap((t) => (t.kind === "object" && s.objects[t.id]?.zone === "battlefield" ? [obj(s, t.id)] : []));
    const ours = (i: number) => options(i).filter((o) => controllerOf(s, o) === pid && !o.isCommander).sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
    const theirs = (i: number, not?: GameObject) => options(i).filter((o) => controllerOf(s, o) !== pid && o !== not).sort((a, b) => worth(s, pid, b) - worth(s, pid, a))[0];
    const picks: [GameObject | undefined, GameObject | undefined][] = swap.a.ref === "self" ? [[me?.isCommander ? undefined : me, theirs(swap.b.index)]] : [[ours(swap.a.index), theirs(swap.b.index)], [theirs(swap.a.index), ours(swap.b.index)]];
    for (const [a, b] of picks) {
      const [mine, other] = a && controllerOf(s, a) === pid ? [a, b] : [b, a];
      if (!a || !b || !mine || !other || worth(s, pid, other) < worth(s, pid, mine) + 2) continue;
      const t: TargetChoice[] = [];
      if (swap.a.ref === "target") t[swap.a.index] = { kind: "object", id: a.id };
      t[swap.b.index] = { kind: "object", id: b.id };
      return t;
    }
    return null;
  }
  // Ardenn: our best creature, where our Equipment and helpful Auras can go; with none, ourselves (it must target).
  if (body.targets.length === 1 && body.effects.length === 1 && body.effects[0]!.type === "attachAny") {
    const all = legalTargets(s, body.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const ours = all.filter((t) => t.kind === "object" && objIsType(s, obj(s, t.id), "Creature") && controllerOf(s, obj(s, t.id)) === pid).sort((a, b) => worth(s, pid, obj(s, (b as { id: string }).id)) - worth(s, pid, obj(s, (a as { id: string }).id)));
    const me = all.find((t) => t.kind === "player" && t.id === pid);
    const pick = ours[0] ?? me ?? (forced ? all[0] : undefined);
    return pick ? [pick] : null;
  }
  // Mardu Siegebreaker: the creature of ours that copies best for each opponent, the one with an enters ability first,
  // never a commander (it would leave the game for a while, and the tokens copy the card, not the commander).
  const ex0 = body.effects[0];
  const src = sourceId ? s.objects[sourceId] : undefined;
  if (body.targets.length === 1 && body.effects.length === 1 && ex0?.type === "exile" && ex0.until && ex0.what.ref === "target" && body.targets[0]!.controller === "you" && src && allEffects(compileCard(defOf(s, src)).triggers.flatMap((tr) => tr.body.effects)).some((e) => e.type === "createTokenCopy" && e.attackingEach)) {
    const all = legalTargets(s, body.targets[0]!, pid, undefined, botSource(s, sourceId!), sourceId).filter((t) => t.kind === "object" && t.id !== sourceId && !obj(s, t.id).isToken && !obj(s, t.id).isCommander);
    const rank = (t: TargetChoice) => (t.kind !== "object" ? 0 : worth(s, pid, obj(s, t.id)) + (compileCard(defOf(s, obj(s, t.id))).triggers.some((tr) => tr.event === "selfEnters") ? 5 : 0));
    const pick = [...all].sort((a, b) => rank(b) - rank(a))[0];
    return [pick ?? { kind: "none" }];
  }
  // Angel of Serenity: opponents' best creatures first; then, when they come back to their owners' hands as it leaves,
  // our own best creature cards from our graveyard.
  const ex1 = allEffects(body.effects).find((e) => e.type === "exile");
  if (body.targets.length && body.targets.every((t) => t.orCard && !t.skip) && ex1?.type === "exile" && ex1.what.ref === "target" && src) {
    const back = compileCard(defOf(s, src)).triggers.some((tr) => tr.event === "selfLeaves" && tr.body.effects.some((e) => e.type === "returnLinked" && e.dest === "hand"));
    const all = legalTargets(s, body.targets[0]!, pid, undefined, botSource(s, sourceId!), sourceId).filter((t) => t.kind === "object" && t.id !== sourceId);
    const rank = (t: TargetChoice) => {
      if (t.kind !== "object") return -1;
      const o = obj(s, t.id);
      if (o.zone === "battlefield") return controllerOf(s, o) === pid ? -1 : 100 + worth(s, pid, o);
      return back && o.owner === pid ? mv(s, o.id) : -1;
    };
    const picks = all.filter((t) => rank(t) >= 0).sort((a, b) => rank(b) - rank(a)).slice(0, body.targets.length);
    return body.targets.map((_, i) => picks[i] ?? { kind: "none" });
  }
  // "Search your library for a card with the same name as target creature" (Bifurcate, Pack Hunt, Secret Salvage): the
  // target whose name the most cards left in our library have (that the search can find); with none, not worth casting.
  const sameNamed = body.targets.length === 1 ? body.effects.find((e): e is Extract<Effect, { type: "search" }> => e.type === "search" && !!e.sameName && "target" in e.sameName && e.sameName.target === 0 && !e.library && !e.who) : undefined;
  if (sameNamed) {
    const all = legalTargets(s, body.targets[0]!, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const hits = (t: TargetChoice) => {
      const o = t.kind === "object" ? s.objects[t.id] : undefined;
      if (!o || o.faceDown) return 0;
      return libraryCopies(s, pid, o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name, sameNamed.filter);
    };
    const pick = [...all].sort((a, b) => hits(b) - hits(a))[0];
    return pick && hits(pick) > 0 ? [pick] : forced && all[0] ? [all[0]] : null;
  }
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
      if (a) n += e.type === "bite" && e.loyalty ? (a.counters.loyalty ?? 0) : e.type === "fight" && e.byToughness ? toughness(s, a) : power(s, a);
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
    const countersFrom = allEffects(body.effects).some((e) => ((e.type === "removeAllCounters" || e.type === "removeAnyCounters") && e.what.ref === "target" && refCovers(e.what, i)) || (e.type === "moveAllCounters" && e.from.ref === "target" && e.from.index === i));
    // Black Panther: "move all +1/+1 counters from target land": one with that kind on it.
    const countersKind = allEffects(body.effects).flatMap((e) => (e.type === "moveAllCounters" && e.from.ref === "target" && e.from.index === i && e.only !== undefined ? [e.only] : []))[0];
    // "Remove up to three counters from" (Glissa Sunslayer): counters worth removing, harmful ones from our own.
    const chosenCounters = allEffects(body.effects).some((e) => e.type === "removeAnyCounters" && e.what.ref === "target" && refCovers(e.what, i));
    // "Move any number of counters from target permanent ... onto a second target permanent" (Resourceful Defense): bots don't.
    if (!forced && allEffects(body.effects).some((e) => e.type === "removeAnyCounters" && e.moveTo)) return null;
    // "Counter target spell if it's blue" (Pyroblast), "Destroy target creature if it has mana value 2 or less" (Fatal
    // Push, with revolt checked now): when that's all it does, only a target it holds for now.
    const guard = targetGuard(s, pid, body.effects, i, sourceId);
    const holds = (t: TargetChoice) => !guard || guard(t);
    const all0 = legalTargets(s, spec, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId).filter(
      (t) => !out.some((o) => sameTarget(o, t)) && !(spec.notSource && t.kind === "object" && t.id === sourceId) && totalOk(s, body.targets, out, i, t) && !namedLike(s, spec, out, t) && !(countersFrom && t.kind === "object" && !Object.entries(obj(s, t.id).counters).some(([k, n]) => n > 0 && (countersKind === undefined || k === countersKind) && (!chosenCounters || harmfulCounter(k) === (controllerOf(s, obj(s, t.id)) === pid)))),
    );
    // A target only the guard rules out still has to be chosen when the ability must have one (a trigger): Triumph of
    // Cruelty's opponent when we don't control the greatest power now (it's checked again as it resolves).
    const held = all0.filter(holds);
    const all = held.length || !forced ? held : all0;
    // Reanimating takes the best creature from any graveyard it may.
    const reanimators = allEffects(body.effects).filter((e): e is Extract<Effect, { type: "putOntoBattlefield" }> => e.type === "putOntoBattlefield" && e.what.ref === "target" && i >= e.what.index && i < e.what.index + (e.what.n ?? 1));
    const reanimate = reanimators.length > 0 || allEffects(body.effects).some((e) => e.type === "animateDead" && e.target === i);
    // "Under its owner's control" (Bilbo): only our own cards do us good.
    const forOwner = reanimators.some((e) => e.owner);
    // "Becomes a copy of target creature": the best one anywhere, but not a legendary one of ours (the legend rule
    // would cost us one of them) or the source itself; what becomes the copy is our weakest.
    const copies = allEffects(body.effects).filter((e): e is Extract<Effect, { type: "becomeCopy" }> => e.type === "becomeCopy");
    const copied = copies.some((e) => e.of.ref === "target" && e.of.index === i);
    const copying = copies.some((e) => e.what.ref === "target" && e.what.index === i);
    // Portent Tracker: our own battle an opponent protects, a step closer to defeating it.
    const defenseOf = allEffects(body.effects).some((e) => e.type === "battleDefense" && e.what.ref === "target" && e.what.index === i);
    const preferred = defenseOf
      ? all.filter((t) => t.kind === "object" && controllerOf(s, obj(s, t.id)) === pid && obj(s, t.id).protector !== undefined && obj(s, t.id).protector !== pid)
      : copied
      ? all.filter((t) => t.kind !== "object" || (t.id !== sourceId && !(isMine(s, pid, t) && objIsLegendary(s, t.id))))
      : reanimate
        ? forOwner ? all.filter((t) => t.kind === "object" && obj(s, t.id).owner === pid) : all
        : all.filter((t) => (harm[i] ? !isMine(s, pid, t) : isMine(s, pid, t)) && !isBattleTarget(s, t));
    // Provoke: a creature ours kills without dying (wantsMay then says yes), else anything (and it says no).
    const provoke = allEffects(body.effects).some((e) => e.type === "mustBlockSource" && e.what.ref === "target" && e.what.index === i);
    if (provoke && sourceId && s.objects[sourceId]) {
      const good = all.filter((t) => t.kind === "object" && provokeGood(s, obj(s, sourceId), obj(s, t.id)));
      out.push(good.length ? best(s, pid, good, true, 0) : all[0] ?? { kind: "none" });
      continue;
    }
    // "Creatures target player controls get +2/+2", "tap all creatures target opponent controls": the player whose
    // permanents it does us the most good on.
    if (spec.kind === "player" && ofPlayerTargets(body).includes(i)) {
      const pick = ofPlayerPick(s, pid, body, i, all, sourceId);
      if (pick || !forced) {
        if (!pick) return null;
        out.push(pick);
        continue;
      }
    }
    // "Exchange life totals with target opponent", "two target players exchange life totals": us and the player with
    // the most life, when that's more than ours.
    const exchange = allEffects(body.effects).find((e): e is Extract<Effect, { type: "exchangeLife" }> => e.type === "exchangeLife" && [e.a, e.b].some((r) => r.ref === "target" && r.index === i));
    if (exchange && spec.kind === "player") {
      const mine = player(s, pid).life;
      // Psychic Transfer: only a total within its difference of ours swaps.
      const richest = all.filter((t) => t.kind === "player" && t.id !== pid && (exchange.maxDiff === undefined || Math.abs(player(s, t.id as PlayerId).life - mine) <= exchange.maxDiff)).sort((a, b) => player(s, b.id as PlayerId).life - player(s, a.id as PlayerId).life)[0];
      const ourSlot = exchange.a.ref === "target" && exchange.a.index === i && exchange.b.ref === "target";
      const me = all.find((t) => t.kind === "player" && t.id === pid);
      const pick = ourSlot ? me : richest;
      if (!pick || (!forced && (!richest || player(s, richest.id as PlayerId).life <= mine))) {
        if (!forced) return null;
        out.push(all[0] ?? { kind: "none" });
        continue;
      }
      out.push(pick);
      continue;
    }
    // "Target player's life total becomes 20" (Torgaar): the opponent with the most life above it, else us if we have
    // less.
    const setLife = allEffects(body.effects).find((e): e is Extract<Effect, { type: "setLife" }> => e.type === "setLife" && !e.double && e.who.ref === "target" && e.who.index === i);
    if (setLife && spec.kind === "player") {
      const richest = all.filter((t) => t.kind === "player" && t.id !== pid && player(s, t.id as PlayerId).life > setLife.n).sort((a, b) => player(s, b.id as PlayerId).life - player(s, a.id as PlayerId).life)[0];
      const me = player(s, pid).life < setLife.n ? all.find((t) => t.kind === "player" && t.id === pid) : undefined;
      const pick = richest && (!me || player(s, richest.id as PlayerId).life - setLife.n >= setLife.n - player(s, pid).life) ? richest : (me ?? richest);
      if (!pick && !spec.optional && !forced) return null;
      out.push(pick ?? (spec.optional ? { kind: "none" } : (all[0] ?? { kind: "none" })));
      continue;
    }
    // An "up to" target is only chosen when there's something we'd like it to be (CR 115.6).
    const pool = preferred.length ? preferred : forced && !spec.optional ? all : [];
    if (!pool.length) {
      if (!spec.optional) return null;
      out.push({ kind: "none" });
      continue;
    }
    const group = harm[i] ? sameNameGroup(body, i) : undefined;
    if (group) {
      // "And all other permanents with the same name" (Maelstrom Pulse): what else it hits counts, ours against it.
      const pick = bestGroupTarget(s, pid, pool, group, damageTo(body, i, x), forced);
      if (!pick) {
        if (!spec.optional) return null;
        out.push({ kind: "none" });
      } else out.push(pick);
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
  const all = legalTargets(s, spec, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId).filter(
    (t) => !before.some((o) => sameTarget(o, t)) && !(spec.notSource && t.kind === "object" && t.id === sourceId),
  );
  const foes = all.filter((t) => !isMine(s, pid, t) && !isBattleTarget(s, t));
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
  const all = legalTargets(s, spec, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId).filter(
    (t) => !before.some((o) => sameTarget(o, t)) && !(spec.notSource && t.kind === "object" && t.id === sourceId),
  );
  const mine = all.filter((t) => isMine(s, pid, t));
  const pick = mine.length ? best(s, pid, mine, false, 0) : forced && !upTo && all.length ? worst(s, pid, all) : undefined;
  if (!pick && !upTo) return null;
  return Array.from({ length: n }, (_, k): TargetChoice => (k === 0 && pick ? ({ ...pick, amount: total } as TargetChoice) : { kind: "none" }));
}

/**
 * "Until your next turn, your life total can't change and you gain protection from everything. All permanents you
 * control phase out" (Teferi's Protection): kept for when it saves the game, lethal combat damage coming at us once
 * blockers are declared, or an opponent's spell destroying or exiling all of a lot of ours.
 */
function chooseFullShield(s: GameState, pid: PlayerId): Action[] | null {
  const me = player(s, pid);
  const shields = me.hand.filter((id) => {
    const body = compileCard(defOf(s, obj(s, id))).spell;
    return !!body && body.effects.some((e) => e.type === "playerGains" && !e.who && (e.lifeCantChange || e.keywords.some((k) => /^protection from everything$/i.test(k))));
  });
  if (!shields.length) return null;
  const top = s.stack[s.stack.length - 1];
  let danger = false;
  if (top && top.controller !== pid) {
    const o = top.objectId ? s.objects[top.objectId] : undefined;
    const body = top.body ?? (o ? castingBody(defOf(s, o)) : undefined);
    let lost = 0;
    for (const e of body ? allEffects(body.effects) : [])
      if ((e.type === "destroy" || e.type === "exile" || e.type === "bounce") && e.what.ref === "each")
        for (const id of s.battlefield) {
          const x = obj(s, id);
          if (controllerOf(s, x) === pid && objectMatches(s, e.what.filter, x, top.controller, false) && !(e.type === "destroy" && objHasKeyword(s, x, "Indestructible"))) lost += worth(s, pid, x);
        }
    danger = lost >= 12;
  }
  if (!danger && s.step === "declareBlockers" && s.activePlayer !== pid) {
    const coming = s.battlefield.map((x) => obj(s, x)).filter((o) => o.attacking === pid && !o.attackingPermanent && !o.blockedBy?.length).reduce((n, o) => n + Math.max(0, power(s, o)), 0);
    danger = coming >= me.life;
  }
  if (!danger) return null;
  // Not through castPlan, which would see only the harm of phasing our own permanents out.
  for (const id of shields) {
    const plan = planCast(s, pid, id, undefined, undefined, "auto");
    if (plan && plan[plan.length - 1]!.type === "castSpell") return plan;
  }
  return null;
}

/** Which target of the spell or ability being changed becomes our Spellskite: one of ours it would hurt, else the first. */
function targetSlotFor(s: GameState, pid: PlayerId, options: string[]): string {
  const r = s.resolving;
  const t = r?.item.targets?.find((x) => x.kind === "stack");
  const item = t?.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
  const body = item?.body ?? (item?.objectId ? castingBody(defOf(s, obj(s, item.objectId))) : undefined);
  const harm = body ? harmfulTargets(body) : [];
  return options.find((o) => { const c = item?.targets?.[Number(o)]; return harm[Number(o)] && !!c && c.kind !== "none" && isMine(s, pid, c); }) ?? options[0]!;
}

/**
 * Spellskite: an opponent's spell or ability that hurts one of ours (not Spellskite itself) gets our Spellskite as that
 * target instead, if it can be.
 */
function chooseSpellskite(s: GameState, pid: PlayerId, top: StackItem): Action[] | null {
  if (top.controller === pid) return null;
  const o = top.objectId ? s.objects[top.objectId] : undefined;
  const body = top.body ?? (o ? castingBody(defOf(s, o)) : undefined);
  if (!body) return null;
  const harm = harmfulTargets(body);
  for (const id of s.battlefield) {
    const me = obj(s, id);
    if (controllerOf(s, me) !== pid) continue;
    const abilities = abilitiesOf(s, me).activated;
    for (let i = 0; i < abilities.length; i++) {
      // Torchling, Silver Wyvern: "change the target of target spell that targets only ~", when it's aimed only at this one
      // and could go to one of theirs instead.
      const away = abilities[i]!.body.effects.find((x) => x.type === "changeTarget" && x.all);
      if (away?.type === "changeTarget") {
        const chosen = (top.targets ?? []).filter((c) => c.kind !== "none");
        const j = (top.targets ?? []).findIndex((c) => c.kind !== "none");
        const aimedHere = chosen.length > 0 && chosen.every((c) => c.kind === "object" && c.id === id) && harm[j] && !!body.targets[j];
        const elsewhere = aimedHere && changeTargetOptions(s, top, body.targets[j]!, chosen[0]!).some((t) => t.kind !== "none" && !isMine(s, pid, t) && (away.mustBe !== "player" || t.kind === "player") && (away.mustBe !== "creature" || (t.kind === "object" && objIsType(s, obj(s, t.id), "Creature"))));
        const plan = elsewhere ? planActivate(s, pid, id, i, [{ kind: "stack", id: top.id }]) : null;
        if (plan) return plan;
        continue;
      }
      const e = abilities[i]!.body.effects.find((x) => x.type === "changeTarget" && x.anyOne);
      if (!e) continue;
      const specs = body.targets;
      const aimed = (top.targets ?? []).some((c, j) => c.kind !== "none" && harm[j] && isMine(s, pid, c) && !(c.kind === "object" && c.id === id) && !!specs[j] && changeTargetOptions(s, top, specs[j]!, c).some((x) => x.kind === "object" && x.id === id));
      if (!aimed) continue;
      const plan = planActivate(s, pid, id, i, [{ kind: "stack", id: top.id }]);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Turn an opponent's spell aimed at us or ours onto one of theirs (Deflection, CR 115.7a), when there's one it could
 * go to. "Unless that spell's controller pays" only if they can't.
 */
function chooseDeflection(s: GameState, pid: PlayerId): Action[] | null {
  const top = s.stack[s.stack.length - 1];
  const skite = top && chooseSpellskite(s, pid, top);
  if (skite) return skite;
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
    const e = spell?.effects.find((x) => x.type === "changeTarget" || x.type === "newTargets");
    if (!spell || !e || spell.targets.length !== 1) continue;
    if (e.type === "changeTarget" && e.unless && canPayUnless(s, top.controller, e.unless, pid, id, 0)) continue;
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

/**
 * New targets for a spell or ability as our spell lets us choose them (CR 115.7d): each harmful one aimed at us or ours
 * goes to one of theirs, each helpful one aimed at theirs to ours; the rest stay. Undefined keeps them all.
 */
function newTargetsFor(s: GameState, pid: PlayerId, pend: Extract<PendingDecision, { kind: "newTargets" }>): TargetChoice[] | undefined {
  const item = s.stack.find((x) => x.id === pend.stackId);
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  const body = item?.body ?? (o ? castingBody(defOf(s, o)) : undefined);
  if (!item || !body) return undefined;
  const harm = harmfulTargets(body);
  const q = stackItemQuality(s, item);
  const next = [...pend.current];
  let changed = false;
  for (let j = 0; j < next.length; j++) {
    const t = next[j]!;
    if (t.kind === "none" || (harm[j] ? !isMine(s, pid, t) : isMine(s, pid, t))) continue;
    // Not one a kept "another target" names (CR 115.7d).
    const clash = (x: ChosenTarget) => pend.specs.some((sp, k) => k !== j && sp.distinctFrom?.includes(j) && sameTarget(next[k], x));
    const options = changeTargetOptions(s, item, pend.specs[j]!, t).filter(
      (x): x is ChosenTarget => x.kind !== "none" && (harm[j] ? !isMine(s, pid, x) : isMine(s, pid, x)) && !(x.kind === "stack" && x.id === item.id) && !clash(x) && canChooseTarget(s, pend.specs, next, j, x, pend.controller, q, item.sourceId),
    );
    if (!options.length) continue;
    next[j] = best(s, pid, options, !!harm[j], damageTo(body, j, item.x ?? 0));
    changed = true;
  }
  // "Change the targets" (CR 115.7a): every target or none, so a partial change is kept as it was.
  if (changed && pend.allOrNone && next.some((t, j) => t.kind !== "none" && sameTarget(pend.current[j], t))) return undefined;
  return changed ? next : undefined;
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
  if (e.type === "attachAny") return e.self ? undefined : e.host;
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
  // Mox Diamond with no other land card to discard would only go to the graveyard.
  const discard = compileCard(d).entersDiscardInstead;
  if (discard && !player(s, pid).hand.some((c) => c !== id && printedMatches(discard, defOf(s, obj(s, c))))) return null;
  // A Pact: only when our lands can pay its upkeep cost, and any other Pact's we still owe.
  const pact = pactCost(compileCard(d).spell?.effects ?? []);
  if (pact && pact + owedPacts(s, pid) > lands(s, pid)) return null;
  // Stinging Study: only with a commander whose mana value in life we can lose and stay above 4.
  if (allEffects(compileCard(d).spell?.effects ?? []).some((e) => e.type === "chooseOwnCommander")) {
    const mine = [...s.battlefield, ...player(s, pid).command].filter((x) => obj(s, x).isCommander && obj(s, x).owner === pid);
    const value = (x: string) => (obj(s, x).zone === "battlefield" ? characteristics(s, obj(s, x)).manaValue : mv(s, x));
    if (!mine.some((x) => value(x) > 0 && player(s, pid).life - value(x) > 4)) return null;
  }
  // Doomsday exiles all but five cards of our library and graveyard: a combo piece bots have no plan for.
  if (allEffects(compileCard(d).spell?.effects ?? []).some((e) => e.type === "search" && e.exileRest)) return null;
  // "End the turn" (CR 724.1): see endTurnCast.
  if (!endingTurn && allEffects(compileCard(d).spell?.effects ?? []).some((e) => e.type === "endTurn")) return null;
  // Summary Dismissal: only in response to an opponent's spell (see the counterspell response).
  if (allEffects(compileCard(d).spell?.effects ?? []).some((e) => e.type === "dismissStack" || e.type === "counterOpponentsStack" || e.type === "counterOpponentsStackUnless")) return null;
  // Aggressive Mining: "You can't play lands" only once we have enough of them.
  if (compileCard(d).youCantPlayLands && lands(s, pid) < 6) return null;
  // Mandate of Peace: "End the combat phase" (CR 724.2) only against an attack on us that hasn't dealt its damage yet.
  if (allEffects(compileCard(d).spell?.effects ?? []).some((e) => e.type === "endCombatPhase") && !endCombatWorth(s, pid)) return null;
  if (lifeSwapHurts(s, pid, compileCard(d).spell?.effects ?? [])) return null;
  // A foretold card is cast for its foretell cost (CR 702.143a).
  if (!free && !via && alt === undefined && foretoldCast(s, pid, obj(s, id))) alt = "foretell";
  // Cast as madness or miracle resolves, for that cost (CR 702.35a, 702.94a): its X is paid then.
  const paidAs = free ? madnessCastOf(s, pid, id) : undefined;
  const cost = parseManaCost(paidAs ?? graveyardWay(s, obj(s, id), via, pid)?.mana ?? altCost(d, alt, s, pid, obj(s, id))?.mana ?? d.manaCost);
  // X spells: as big an X as we can pay for. Cast for free, X is 0 (CR 107.3b), which is rarely worth it.
  if (cost.hasX && free && !paidAs) return null;
  // A ritual, a spell that only adds mana (Dark Ritual): worth it when what it nets lets us cast a card we can't yet.
  const effects = compileCard(d).spell?.effects ?? [];
  if (!free && effects.length && effects.every((e) => e.type === "addMana" || e.type === "choose")) {
    const added = effects.reduce((n, e) => n + (e.type !== "addMana" ? 0 : (e.mana?.match(/\{/g)?.length ?? e.chosen ?? (e.anyColors && typeof e.times === "number" ? e.times : 0))), 0);
    const avail = availableMana(s, pid);
    const gain = added - manaValue(cost);
    if (!player(s, pid).hand.some((h) => h !== id && !isType(defOf(s, obj(s, h)), "Land") && mv(s, h) > avail && mv(s, h) <= avail + gain)) return null;
  }
  let xs: (number | undefined)[] = cost.hasX ? xChoices(availableMana(s, pid) + delveRoom(s, pid, id, { via, alt }) - totalWithoutX(s, pid, id, via, alt), xCount(cost)) : [undefined];
  // With Doubling Cube, the bigger X it pays for first (autopay's planCubeMana pays what the other sources can't).
  if (cost.hasX && !free) {
    const most = xs[0] ?? 0;
    const cubed = xChoices(cubeMana(s, pid) + delveRoom(s, pid, id, { via, alt }) - totalWithoutX(s, pid, id, via, alt), xCount(cost)).filter((x) => x > most);
    xs = [...cubed, ...xs];
  }
  // "Kicker {X}" (Thieving Skydiver): kicked with as big an X as we can pay, else not kicked.
  const kickX = compileCard(d).kicker?.costs.find((c) => parseManaCost(c).hasX);
  if (!cost.hasX && kickX && !via && !alt) {
    xs = [...xChoices(availableMana(s, pid) - totalWithoutX(s, pid, id) - manaValue(parseManaCost(kickX)), xCount(parseManaCost(kickX))), undefined];
    // "Target artifact with mana value X or less" as it enters: no more X than the best one an opponent has needs.
    const spec = compileCard(d).triggers.find((t) => t.event === "selfEnters")?.body.targets.find((t) => t.kind === "object" && t.xRange?.key === "manaValue" && t.xRange.at === "most");
    if (spec) {
      const best = Math.max(0, ...s.battlefield.filter((b) => controllerOf(s, obj(s, b)) !== pid && objectMatches(s, { ...spec, xRange: undefined }, obj(s, b), pid, false)).map((b) => mv(s, b)));
      const most = Math.max(0, ...xs.filter((x): x is number => x !== undefined));
      xs = best > 0 && best <= most ? [best, undefined] : [undefined];
    }
  }
  // "Pay X life", "sacrifice X creatures" (CR 107.3a): no bigger an X than we'd pay that way too.
  if (costsHaveX(d, { via, alt })) {
    const most = costXRoom(s, pid, id, castExtraCosts(d, { via, alt }));
    xs = cost.hasX ? xs.filter((x) => x! <= most) : xChoices(most, 1);
    // "You may sacrifice one or more creatures" (Plumb the Forbidden): none is fine too.
    if (castExtraCosts(d, { via, alt }).some((c) => c.kind === "sacrifice" && c.optional)) xs.push(0);
    // Rottenmouth Viper: each one sacrificed makes it cheaper, so as few as we can cast it with.
    if (compileCard(d).sacrificedReduction && !via && !alt) xs = Array.from({ length: most + 1 }, (_, i) => i);
  }
  // Nahiri's Lithoforming: "Sacrifice X lands ... You may play X additional lands this turn": no more lands than we have
  // in hand to play again.
  if (cost.hasX && effects.some((e) => e.type === "pick" && e.action === "sacrifice" && e.filter.types?.includes("Land") && typeof e.n === "object" && "count" in e.n && e.n.count.kind === "x")) {
    const lands = player(s, pid).hand.filter((h) => h !== id && isType(defOf(s, obj(s, h)), "Land")).length;
    xs = xs.filter((x) => x !== undefined && x >= 1 && x <= lands);
  }
  // Nissa, Steward of Elements: X loyalty, so X 0 would put it straight into the graveyard (CR 306.5b, 704.5i).
  if (cost.hasX && d.loyalty === "X") xs = xs.filter((x) => x !== undefined && x >= 1);
  for (const x of xs) {
    const plan = castPlanWithX(s, pid, id, free, x, via, alt);
    if (plan) return plan;
  }
  return null;
}

/**
 * The most mana we could have with Doubling Cube's "{3}, {T}: Double the amount of each type of unspent mana you have":
 * our other sources make all they can, the Cube's cost is paid from that and the rest doubled. 0 without a Cube we
 * could activate.
 */
function cubeMana(s: GameState, pid: PlayerId): number {
  let most = 0;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    manaAbilitiesOn(s, o).forEach((ab, i) => {
      if (ab.produces.kind !== "doublePool" || manaAbilityProblem(s, pid, o, i, true)) return;
      const cost = activationLessCost(s, o, parseManaCost(ab.manaCost));
      if (cost.symbols.some((x) => x.kind !== "generic")) return;
      // The Cube itself makes nothing on its own, so availableMana counts our other sources only.
      most = Math.max(most, 2 * (availableMana(s, pid) - manaValue(cost)));
    });
  }
  return most;
}

/**
 * Casting one of a card's other faces (faces.ts castableFaces). "first", before the card as it is: an Adventure, so the
 * creature can be cast from exile afterwards (CR 715.3d), and a split card's halves, the costlier one first (it's
 * cast only as a half, CR 709.3). "after": a modal double-faced card's back face when its front can't be cast
 * (CR 712.11b).
 */
function facePlan(s: GameState, pid: PlayerId, id: string, free: boolean, when: "first" | "after"): Action[] | null {
  const o = obj(s, id);
  const layout = layoutOf(s, o);
  if (!layout || (when === "first") !== (layout === "adventure" || layout === "split")) return null;
  const faces = castableFaces(s, o)
    .filter((f) => !isType(s.cards[registerFace(s, o, f)]!, "Land"))
    // Not as an Adventure again from exile (CR 715.3d).
    .filter((f) => !(layout === "adventure" && o.zone === "exile"))
    .sort((a, b) => defMv(s.cards[registerFace(s, o, b)]!) - defMv(s.cards[registerFace(s, o, a)]!));
  const halves = s.cards[o.cardId]!.faces!.length;
  for (const face of faces) {
    // Fused (CR 702.102): only when we'd cast each half on its own too, so neither half is wasted or hurts us.
    if (layout === "split" && face === halves && !Array.from({ length: halves }, (_, i) => i).every((i) => asFace(s, o, i, () => castPlan(s, pid, id, free)))) continue;
    const plan = asFace(s, o, face, () => castPlan(s, pid, id, free));
    if (plan) return plan.map((a) => (a.type === "castSpell" && a.objectId === id ? { ...a, face } : a));
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
  for (const a of [...(c.altCosts ?? []), ...altCostsFor(s, pid, obj(s, id)).filter((x) => x.kind === "evidence" || x.kind === "citadel" || x.kind === "lifeForMv" || x.kind === "nextLife" || x.kind === "genericMv" || x.kind === "energyForSpell" || x.kind === "grantedEmerge")]) {
    // Bolas's Citadel, Demon of Fate's Design: life rather than mana, while we'd still have 15 or more afterwards.
    if ((a.kind === "citadel" || a.kind === "lifeForMv" || a.kind === "nextLife") && player(s, pid).life - mv(s, id) < 15) continue;
    if (a.kind === "evoke" && !c.triggers.some((t) => t.event === "selfEnters" && !t.ifEvoked)) continue;
    if (a.kind === "bestow" || a.kind === "overload") continue; // tried first, see bestowPlan and overloadPlan
    const plan = castPlan(s, pid, id, false, undefined, a.kind);
    if (plan) return plan;
  }
  return null;
}

/** An alternative cost of nothing at all ("if you control a commander, you may cast ~ without paying its mana cost"). */
const freeAlt = (d: CardDef) => {
  const a = altCost(d, "alternative");
  return !!a && !a.mana && !a.costs?.length;
};

/** Cast it for nothing when its alternative cost is free and allowed now (CR 118.9): the mana stays for something else. */
function freeAltPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const o = obj(s, id);
  // Omniscience: every spell from our hand for nothing.
  if (o.zone === "hand" && altCost(defOf(s, o), "omniscience", s, pid)) {
    const plan = castPlan(s, pid, id, false, undefined, "omniscience");
    if (plan) return plan;
  }
  // World War Hulk: the next red or green creature spell, for nothing.
  if (altCost(defOf(s, o), "nextFree", s, pid)) {
    const plan = castPlan(s, pid, id, false, undefined, "nextFree");
    if (plan) return plan;
  }
  // Court of Locthwain: a card exiled with it, for nothing.
  if (linkedFreeGrant(s, o, pid) >= 0) {
    const plan = castPlan(s, pid, id, false, undefined, "linkedFree");
    if (plan) return plan;
  }
  // As Foretold, Rooftop Storm: {0} rather than the mana cost (a commander's tax is still paid).
  if (payZeroSource(s, pid, o)) {
    const plan = castPlan(s, pid, id, false, undefined, "payZero");
    if (plan) return plan;
  }
  if (o.zone !== "hand" || !freeAlt(defOf(s, o))) return null;
  return castPlan(s, pid, id, false, undefined, "alternative");
}

/** Freerunning is cheaper than the mana cost: pay it whenever it's allowed (CR 702.173a). */
function freerunPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const o = obj(s, id);
  if (o.zone !== "hand" || !(s.freerunningThisTurn ?? []).includes(pid)) return null;
  // Its own freerunning cost, else one a permanent gives it (Ezio Auditore da Firenze); the cheaper first.
  const ways = (["freerunning", "grantedFreerunning"] as const).flatMap((k) => {
    const a = altCost(defOf(s, o), k, s, pid, o);
    return a ? [{ k, mv: manaValue(parseManaCost(a.mana)) }] : [];
  }).sort((a, b) => a.mv - b.mv);
  for (const w of ways) {
    const plan = castPlan(s, pid, id, false, undefined, w.k);
    if (plan) return plan;
  }
  return null;
}

/**
 * Overload (CR 702.96a) when hitting each of them is worth clearly more than the best single permanent there is to target:
 * what the "each" spell does to everyone's permanents, for us (groupValue).
 */
function overloadPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const o = obj(s, id);
  if (o.zone !== "hand" || !altCost(defOf(s, o), "overload")) return null;
  const body = castingBody(castDef(s, id, "overload"));
  const v = body ? groupValue(s, pid, body, guessChosen(s, pid, defOf(s, o)), id) : null;
  const best = Math.max(1, ...s.battlefield.map((x) => worth(s, pid, obj(s, x))));
  if (v === null || v <= 1.5 * best) return null;
  return castPlan(s, pid, id, false, undefined, "overload");
}

/** Awaken (CR 702.113a) whenever we can pay it and have a land to awaken: the spell's effect, and a creature too. */
function awakenPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const o = obj(s, id);
  if (o.zone !== "hand" || !altCost(defOf(s, o), "awaken")) return null;
  return castPlan(s, pid, id, false, undefined, "awaken");
}

/** Surge and spectacle (CR 702.117a, 702.137a) whenever they're allowed: no more than the mana cost, and maybe a bonus. */
function cheaperAltPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  const o = obj(s, id);
  if (o.zone !== "hand") return null;
  for (const kind of ["surge", "spectacle"] as const) {
    if (!altCost(defOf(s, o), kind)) continue;
    const plan = castPlan(s, pid, id, false, undefined, kind);
    if (plan) return plan;
  }
  // Prowl (CR 702.76a): the card's own (it may do more then), or one given to it that costs less than the mana cost.
  const prowl = altCost(defOf(s, o), "prowl", s, pid);
  if (prowl && staticConditionNow(s, prowl.if!, id, pid) && (compileCard(defOf(s, o)).altCosts?.some((a) => a.kind === "prowl") || manaValue(parseManaCost(prowl.mana)) < mv(s, id))) {
    const plan = castPlan(s, pid, id, false, undefined, "prowl");
    if (plan) return plan;
  }
  return null;
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
    .filter((x): x is { id: string; sus: { n: number; cost: string; x?: true } } => !!x.sus)
    .filter((x) => !defOf(s, obj(s, x.id)).manaCost || mv(s, x.id) > mana + 1)
    .sort((a, b) => (a.sus.x ? 1 : a.sus.n) - (b.sus.x ? 1 : b.sus.n));
  for (const x of options) {
    // "Suspend X": the most time counters we can pay for, up to 4 (each one a trigger for Aeon Chronicler and its kin,
    // but a longer wait).
    if (x.sus.x) {
      for (let n = 4; n >= 1; n--) {
        const plan = planSuspend(s, pid, x.id, n);
        if (plan) return plan;
      }
      continue;
    }
    const plan = planSuspend(s, pid, x.id);
    if (plan) return plan;
  }
  return null;
}

/** A locked door of a Room we control to unlock (CR 709.5e): the dearest one we can pay for. */
function chooseUnlock(s: GameState, pid: PlayerId): Action[] | null {
  const doors = s.battlefield
    .flatMap((id) => [0, 1].map((door) => ({ id, door, cost: unlockCost(s, obj(s, id), door) })))
    .filter((x) => x.cost !== undefined && controllerOf(s, obj(s, x.id)) === pid)
    .sort((a, b) => manaValue(parseManaCost(b.cost!)) - manaValue(parseManaCost(a.cost!)));
  for (const x of doors) {
    const plan = planUnlock(s, pid, x.id, x.door);
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
  const saving = (id: string) => mv(s, id) - manaValue(parseManaCost(foretellCostOf(s, obj(s, id)) ?? ""));
  // Foretell from Dream Devourer: only a card it makes cheaper by the {2} paid now (rulings: generic mana only).
  const options = player(s, pid)
    .hand.filter((id) => compileCard(defOf(s, obj(s, id))).foretell || (foretellCostOf(s, obj(s, id)) !== undefined && saving(id) >= 2))
    .sort((a, b) => saving(b) - saving(a));
  for (const id of options) {
    const plan = planForetell(s, pid, id);
    if (plan) return plan;
  }
  return null;
}

/** "Tap or untap target permanent": what's best for us about the permanent it's about. */
function tapOrUntapChoice(s: GameState, pid: PlayerId, options: string[]): string {
  const pend = s.pending;
  const o = pend?.kind === "chooseOption" && pend.about ? s.objects[pend.about] : undefined;
  if (!o) return options[options.length - 1]!;
  const ours = controllerOf(s, o) === pid;
  if (ours && o.tapped) return "untap";
  if (!ours && !o.tapped) return "tap";
  return options.includes("neither") ? "neither" : ours ? "untap" : "tap";
}

/**
 * Which room to venture into, or which dungeon to start (CR 701.49): damage and bodies first, the counters only with a
 * creature to put them on, goad or "can't attack" only with an opponent's creature. Of the dungeons, the shortest one
 * that helps only us; Tomb of Annihilation's rooms hurt us too, and Oubliette costs us a card and three permanents.
 */
function chooseRoom(s: GameState, pid: PlayerId, options: string[]): string {
  const creatures = (mine: boolean) => s.battlefield.some((id) => objIsType(s, obj(s, id), "Creature") && (controllerOf(s, obj(s, id)) === pid) === mine);
  const scores: Record<string, number> = {
    "Lost Mine of Phandelver": 3,
    "Dungeon of the Mad Mage": 2,
    "Tomb of Annihilation": 1,
    "Trap!": 5,
    Catacombs: 4,
    Forge: creatures(true) ? 4 : 0,
    Stash: 3,
    Archives: 3,
    "Lost Well": 2,
    Arena: creatures(false) ? 2 : 0,
    "Goblin Lair": 3,
    "Mine Tunnels": 3,
    Storeroom: creatures(true) ? 3 : 0,
    "Dark Pool": 3,
    "Fungi Cavern": creatures(false) ? 2 : 0,
    "Goblin Bazaar": 3,
    "Twisted Caverns": creatures(false) ? 2 : 0,
    "Runestone Caverns": 3,
    "Muiral's Graveyard": 4,
    "Veils of Fear": 2,
    Oubliette: 0,
  };
  return [...options].sort((a, b) => (scores[b] ?? 1) - (scores[a] ?? 1))[0]!;
}

/**
 * A punisher (see its effect): the cheapest way out. Each option and the penalty get a cost in life points: life lost
 * weighs more the closer it brings us to 0 (and taking lethal is never chosen while there's another way); a card in
 * hand is worth a few life (a spare land little); a permanent its worth; a token for the punisher's controller about
 * a creature's worth; a payment its mana, if we can pay it.
 */
function choosePunisher(s: GameState, pid: PlayerId, options: string[]): string {
  const pu = s.resolving?.scratch?.punish;
  if (!pu) return "none";
  const p = player(s, pid);
  const made = pu.made[pid] ?? [];
  // Already picked this round (Rottenmouth Viper's several picks): not offered again.
  const takenDiscards = made.reduce((n, m) => {
    const o = pu.options[Number(m)];
    return n + (o && "discard" in o ? o.discard : 0);
  }, 0);
  const takenSacs = made.filter((m) => pu.options[Number(m)] && "sacrifice" in pu.options[Number(m)]!).length;
  // The life still to be lost this round from the "neither" picks already made.
  const lose = pu.lose ?? 0;
  const life = p.life - lose * made.filter((m) => m === "none").length;
  const lifeCost = (n: number) => (n >= life ? 1000 : n * (1 + 15 / Math.max(1, life - n)));
  const mode = pu.mode;
  // "Any player may ... If a player does" / "If no one does": worth it only to an opponent of its controller, about as
  // much as a card, and not once another player has already settled it.
  const controller = s.resolving?.item.controller;
  const settled = mode && Object.entries(pu.made).some(([q, m]) => Number(q) !== pid && m.some((x) => x !== "none"));
  const handCost = (n: number, filter?: TargetSpec, all = false) => {
    const cards = chooseDiscards(s, pid, takenDiscards + n, undefined, filter).slice(takenDiscards);
    if (cards.length < n && !all) return Infinity;
    return cards.reduce((t, id) => t + (isType(defOf(s, obj(s, id)), "Land") ? (lands(s, pid) >= 6 ? 1.5 : 5) : 4 + Math.min(3, mv(s, id) / 2)), 0);
  };
  // "Discards two cards unless ...": the two cards it would cost (as many as there are).
  const doomed = pu.destroys ? s.objects[pu.destroys] : undefined;
  // Icy Prison: its controller keeps it if no one else does; the others let it go.
  const sourceWorth = pu.losesSource && controller === pid && !settled && s.resolving?.item.sourceId && s.objects[s.resolving.item.sourceId]?.zone === "battlefield" ? Math.max(3, worth(s, pid, obj(s, s.resolving.item.sourceId))) : 0;
  // Craig Boone: the damage to that creature, worth the creature if it would die of it, little otherwise.
  const hurt = pu.hurts ? s.objects[pu.hurts.id] : undefined;
  const hurtCost = hurt && hurt.zone === "battlefield" ? (toughness(s, hurt) - (hurt.damage ?? 0) <= pu.hurts!.n && !objHasKeyword(s, hurt, "Indestructible") ? worth(s, pid, hurt) : 0.5) : 0;
  // Anthropede: "you may discard a card or pay {2}. When you do, destroy target Room": its controller's own payment buys a
  // reflexive destroy, worth about a card with an opponent's permanent to aim it at, nothing without one.
  const ownPun = mode && controller === pid && s.resolving ? allEffects(s.resolving.body.effects).find((x) => x.type === "punisher" && x.who.ref === "you" && x.mode === "ifAny") : undefined;
  const reflex = ownPun?.type === "punisher" && ownPun.effects.length === 1 && ownPun.effects[0]!.type === "reflexive" ? ownPun.effects[0]!.body : undefined;
  // Nimble Hobbit: "When you do, tap target creature an opponent controls": a little, with an untapped one to tap.
  const reflexKind = reflex && reflex.targets.length === 1 && reflex.effects.length === 1 ? reflex.effects[0]!.type : undefined;
  const buys = (reflexKind === "destroy" || reflexKind === "tap") && s.battlefield.some((id) => opponents(s, pid).includes(controllerOf(s, obj(s, id))) && !(reflexKind === "tap" && obj(s, id).tapped) && objectMatches(s, reflex!.targets[0]!, obj(s, id), pid, false)) ? (reflexKind === "destroy" ? 6 : 2) : 0;
  // Carrion Rats: "If a player does, ~ assigns no combat damage this turn": worth it only to the player it's attacking or
  // whose creature it's blocking, about the damage it would deal.
  const quiet = mode === "ifAny" && s.resolving ? allEffects(s.resolving.body.effects).find((x) => x.type === "punisher" && x.mode === "ifAny" && x.effects.length === 1 && x.effects[0]!.type === "noCombatDamage" && x.effects[0]!.what.ref === "self") : undefined;
  const rat = quiet && s.resolving?.item.sourceId ? s.objects[s.resolving.item.sourceId] : undefined;
  const ratThreat = rat?.zone === "battlefield" ? (rat.attacking === pid || (rat.blocking !== undefined && [rat.blocking].flat().some((b) => s.objects[b] && controllerOf(s, obj(s, b)) === pid)) ? Math.max(1, power(s, rat)) : 0) : 0;
  const penalty = quiet ? (controller === pid || settled ? 0 : ratThreat) : mode && pu.losesSource ? sourceWorth : mode ? (controller === pid ? buys : controller === undefined || !opponents(s, controller).includes(pid) || settled ? 0 : 5) : pu.hurts ? hurtCost : doomed ? (doomed.zone === "battlefield" && !objHasKeyword(s, doomed, "Indestructible") ? worth(s, pid, doomed) : 0) : pu.tokens ? 4 * pu.tokens : pu.lose !== undefined ? lifeCost(pu.lose) : pu.discards ? handCost(pu.discards, undefined, true) : 4;
  const cost = (o: string): number => {
    if (o === "none") return penalty;
    const w = pu.options[Number(o)];
    if (!w) return Infinity;
    if ("discard" in w) return handCost(w.discard, w.filter);
    if ("sacrifice" in w) {
      const worths = pickOptions(s, { filter: w.sacrifice }, pid)
        .map((id) => obj(s, id))
        .filter((x) => !x.isCommander)
        .map((x) => (objIsType(s, x, "Land") ? (lands(s, pid) >= 7 ? 2 : 6) : worth(s, pid, x)))
        .sort((a, b) => a - b);
      const n = w.n ?? 1;
      return worths.length < takenSacs + n ? Infinity : worths.slice(takenSacs, takenSacs + n).reduce((a, b) => a + b, 0);
    }
    if ("damage" in w) return lifeCost(typeof w.damage === "number" ? w.damage : 3);
    // Sin Prodder: the revealed card's mana value in damage to us, rather than that card in its controller's hand.
    if ("allow" in w && s.resolving && allEffects(s.resolving.body.effects).some((x) => x.type === "punisher" && x.firstOnly)) {
      const rv = s.resolving.revealed && s.objects[s.resolving.revealed.id];
      return rv ? lifeCost(defMv(defOf(s, rv))) : 0;
    }
    // Distant Memories: the one card it found, rather than the three cards it draws if no one does.
    if ("allow" in w) return 1;
    if ("halfLife" in w) return lifeCost(w.halfLife === "up" ? Math.ceil(Math.max(0, p.life) / 2) : Math.floor(Math.max(0, p.life) / 2));
    // Tainted Specter: a card from our hand put back on top, drawn again later: a turn's draw, less than losing it.
    if ("handToTop" in w) return p.hand.length - takenDiscards < w.handToTop ? Infinity : 1.5 * w.handToTop;
    // Carrion Wurm: cards from our own graveyard, little unless we have a use for them there.
    if ("exileFromGraveyard" in w) {
      const yard = [...p.graveyard].sort((a, b) => Number(usefulInGraveyard(s, a)) - Number(usefulInGraveyard(s, b)) || mv(s, a) - mv(s, b)).slice(0, w.exileFromGraveyard);
      return yard.length < w.exileFromGraveyard ? Infinity : yard.reduce((t, id) => t + (usefulInGraveyard(s, id) ? 4 : 0.5), 0);
    }
    const mana = (w.pay.generic === undefined ? 0 : typeof w.pay.generic === "number" ? w.pay.generic : 3) + manaValue(parseManaCost(w.pay.cost));
    return availableMana(s, pid) >= mana ? mana / 2 + (w.pay.life ?? 0) : Infinity;
  };
  return [...options].sort((a, b) => cost(a) - cost(b) || (a === "none" ? -1 : b === "none" ? 1 : 0))[0] ?? "none";
}

/**
 * Dredge instead of drawing (CR 702.52a) when the library can spare the cards: the most expensive card we could get
 * back, if it's worth more than a random draw (mana value 3 or more, or a creature). A land card (The Necrobloom's
 * dredge 2) while we have no land in hand and fewer than seven lands out.
 */
function chooseDredge(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId | undefined {
  const me = player(s, pid);
  const lib = me.library.length;
  const spare = options.filter((id) => lib - (dredgeAmount(s, pid, id) ?? 0) >= 20);
  const ok = spare.filter((id) => mv(s, id) >= 3 || isType(defOf(s, obj(s, id)), "Creature"));
  const best = ok.sort((a, b) => mv(s, b) - mv(s, a))[0];
  if (best) return best;
  const landsOut = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  if (landsOut >= 7 || me.hand.some((id) => isType(defOf(s, obj(s, id)), "Land"))) return undefined;
  return spare.find((id) => isType(defOf(s, obj(s, id)), "Land"));
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
  const better = bodies.some((b) => ("ifGift" in b && b.ifGift) || allEffects(b.effects).some((e) => ((e.type === "if" && e.cond.kind === "gift" && e.effects.length > 0 && e.effects !== c.gift!.effects) || (e.type === "takeFromHand" && !!e.youMay?.ifGift))));
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
  for (const g of graveyardWays(s, obj(s, id), pid)) {
    // A split card's half (an aftermath half): cast as that face.
    const plan = asFace(s, obj(s, id), g.face, () => castPlan(s, pid, id, false, g.kind, g.alt));
    if (plan) return g.face === undefined ? plan : plan.map((a) => (a.type === "castSpell" && a.objectId === id ? { ...a, face: g.face } : a));
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
              ? sacrificePool(s, pid, c, new Set()).filter((o) => !c.optional || o.isToken).length
              : c.kind === "putCounter"
                ? // Blight X (Soul Immolation): no more than the greatest toughness among our creatures (its own cap).
                  Math.max(0, ...s.battlefield.map((x) => obj(s, x)).filter((b) => controllerOf(s, b) === pid && objIsType(s, b, "Creature")).map((b) => toughness(s, b)))
              : c.kind === "tap" || c.kind === "reveal" || c.kind === "removeCounters"
                ? 0 // "Tap X untapped ... you control", "Reveal X red cards from your hand", "Remove X +1/+1 counters from among ..." are activated abilities' costs only
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
  // "An opponent chooses one —" (Misfortune, Fatal Lore, Library of Lat-Nam): cast without a mode, which that opponent
  // chooses (askModeChooser); each mode is good for us.
  if (printed?.modal?.chooser) return castPlanWithModes(s, pid, id, free, x, via, alt, undefined);
  // "Choose X" (Doomsday Confluence): exactly X modes, the useful ones in turn; never for X 0, which does nothing.
  if (printed?.modal?.xCount) {
    const n = x ?? 0;
    const xChoice = n >= 1 ? chooseModes(s, pid, { ...printed, modal: { ...printed.modal, min: n, max: n } }, false, id) : null;
    return xChoice ? castPlanWithModes(s, pid, id, free, x, via, alt, xChoice.modes) : null;
  }
  const choice = printed?.modal ? chooseModes(s, pid, printed, false, id) : null;
  if (printed?.modal && !choice) return null;
  // Entwine (CR 702.42a): every mode, when we can pay for it and they all have targets.
  // An entwine cost beyond mana (Solar Tide's "sacrifice two lands"): only when every mode together is worth it.
  if (printed?.modal?.entwine !== undefined && legalModes(s, printed, pid).every(Boolean) && (!printed.modal.entwineCosts || (landsToSpare(s, pid, printed.modal.entwineCosts) && (groupValue(s, pid, withModes(printed, printed.modal.modes.map((_, i) => i))) ?? 0) > 2))) {
    const plan = castPlanWithModes(s, pid, id, free, x, via, alt, printed.modal.modes.map((_, i) => i));
    if (plan) return plan;
  }
  // "Choose both instead" (teamwork, or controlling a commander): both modes when both can be chosen.
  const both = printed?.modal?.both;
  // Flame of Anor with a Wizard: the two best modes.
  if (both === "control" && bothModes(s, pid, printed!)) {
    // Let's Play a Game with delirium: as many as are useful.
    const two = chooseModes(s, pid, { ...printed!, modal: { ...printed!.modal!, max: printed!.modal!.bothAny ? printed!.modal!.modes.length : 2 } }, false, id);
    if (two && two.modes.length > 1) {
      const plan = castPlanWithModes(s, pid, id, free, x, via, alt, two.modes);
      if (plan) return plan;
    }
  }
  if (both && both !== "kicked" && both !== "control" && legalModes(s, printed!, pid).every(Boolean)) {
    const tw = both === "teamwork" ? spareTappers(s, pid, id, compileCard(defOf(s, obj(s, id))).teamwork ?? 0) : undefined;
    if (both === "commander" ? bothModes(s, pid, printed!) : tw) {
      const plan = castPlanWithModes(s, pid, id, free, x, via, alt, [0, 1], tw);
      if (plan) return plan;
    }
  }
  // "If this spell was kicked, choose any number instead" (Inscriptions): all the useful modes, kicked, if we can pay.
  if (both === "kicked") {
    const all = chooseModes(s, pid, { ...printed!, modal: { ...printed!.modal!, max: printed!.modal!.modes.length } }, false, id);
    if (all && all.modes.length > 1) {
      const plan = castPlanWithModes(s, pid, id, free, x, via, alt, all.modes);
      if (plan) return plan;
    }
  }
  if (!printed?.modal?.costs && !printed?.modal?.escalate) return castPlanWithModes(s, pid, id, free, x, via, alt, choice?.modes);
  // Spree (CR 702.172a) and escalate (CR 702.120a): each mode costs more, so the most useful modes we can pay for.
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
 * Liquid Fire: the number chosen as it's cast (CR 601.2b), X damage to the target creature and the rest to its
 * controller: just enough to destroy the creature, the rest at the player.
 */
function castNumberFor(s: GameState, id: ObjectId, targets: TargetChoice[] | undefined): number | undefined {
  const r = compileCard(defOf(s, obj(s, id))).castNumber;
  if (!r) return undefined;
  const t = targets?.find((x) => x.kind === "object");
  const o = t?.kind === "object" ? s.objects[t.id] : undefined;
  const need = o?.zone === "battlefield" ? Math.max(0, toughness(s, o) - (o.damage ?? 0)) : r.max;
  return Math.min(r.max, Math.max(r.min, need));
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
  const how: CastHow = { ...(gate?.paid ? { kicks: [0, 1], bargained: true, teamwork: true, gift: true, evidence: true } : {}), ...(alt ? { alt } : {}) };
  const gated = printed && gateBody(withModes(printed, modes), how);
  // Rules about choosing its targets as it's cast (Dream Leash: a tapped permanent only).
  const body = gated && { ...gated, targets: castTimeTargets(castDef(s, id, alt), gated.targets) };
  const specs = body?.targets ?? spellTargets(s, id, modes, alt);
  const targets = specs.length && body ? chooseTargets(s, pid, body, false, id, x) : undefined;
  if (specs.length && !targets) return null;
  // Strive: each target beyond the first costs more (rulings), so only as many of the best ones as we can pay for.
  if (targets && compileCard(defOf(s, obj(s, id))).strive) {
    const way = { ...(via ? { via } : {}), ...(alt ? { alt } : {}) };
    for (let i = targets.length - 1; i > 0 && !planCast(s, pid, id, targets, modes, "auto", x, way); i--) if (targets[i]!.kind !== "none") targets[i] = { kind: "none" };
  }
  if (!free && body && isCounterOnly(body)) return null; // hold counterspells
  // Cut the Tethers: only when the opponents own more of them than we do.
  const tethers = body ? allEffects(body.effects).find((e) => e.type === "bounceEachUnless") : undefined;
  if (tethers?.type === "bounceEachUnless") {
    const hit = s.battlefield.filter((b) => objectMatches(s, tethers.filter, obj(s, b), pid, false)).map((b) => obj(s, b).owner);
    if (hit.filter((p) => p !== pid).length <= hit.filter((p) => p === pid).length) return null;
  }
  // Epic: no more spells for the rest of the game (CR 702.50a), so only as our last spell in hand.
  if (compileCard(defOf(s, obj(s, id))).epic && player(s, pid).hand.some((h) => h !== id && !isType(defOf(s, obj(s, h)), "Land"))) return null;
  // "Destroy all creatures" and the like: only when it hurts the opponents more than us.
  if (body && (groupValue(s, pid, body, guessChosen(s, pid, defOf(s, obj(s, id)))) ?? 1) <= 0) return null;
  // "Sacrifice a creature or pay {3}{B}" (CR 601.2b): the first way we're willing and able to pay.
  const ors = compileCard(defOf(s, obj(s, id))).costOr?.map((_, i) => i) ?? [undefined];
  let extra: CostChoices | null = null;
  for (const costOr of ors) {
    const e = chooseExtraCosts(s, pid, id, targets ?? [], via, alt, costOr, x ?? 0, modes);
    if (!e) continue;
    if (costOr !== undefined) e.costOr = costOr;
    const num = castNumberFor(s, id, targets ?? undefined);
    if (num !== undefined) e.number = num;
    if (costOr === undefined || planCast(s, pid, id, targets ?? undefined, modes, "auto", x, { ...e, ...(via ? { via } : {}), ...(alt ? { alt } : {}) })) {
      extra = e;
      break;
    }
  }
  if (extra) {
    // Casualty: a token or a cheap creature for a copy of the spell (CR 702.153a).
    // Not the permanent giving it casualty (Silverquill, the Disputant): that would take the copy away.
    const victim = casualtyCandidates(s, pid, castDef(s, id, alt), obj(s, id))
      .map((x) => obj(s, x))
      .filter((o) => !o.isCommander && !abilitiesOf(s, o).spellsHaveCasualty && !extra.sacrifice?.includes(o.id) && !(targets ?? []).some((t) => t.kind === "object" && t.id === o.id))
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
    // Conspire (CR 702.78a): two such creatures for a copy of the spell, for each instance it has (702.78b).
    const conspires = conspireInstances(s, pid, obj(s, id));
    if (conspires > 0) {
      const spareOnes = conspireCandidates(s, pid, id).filter((o) => !busy(o) && !tw?.includes(o) && spare_(s, pid, o));
      const pairs = Math.min(conspires, Math.floor(spareOnes.length / 2));
      if (pairs > 0) extra.conspire = spareOnes.slice(0, 2 * pairs);
    }
    // Harmonize (CR 702.180a): the strongest creature we can spare, for the most generic mana off.
    if (via === "harmonize") {
      const h = teamworkCandidates(s, pid)
        .filter((o) => !busy(o) && !tw?.includes(o) && !extra.conspire?.includes(o) && spare_(s, pid, o) && teamworkPower(s, o) > 0)
        .sort((a, b) => teamworkPower(s, b) - teamworkPower(s, a))[0];
      if (h) extra.harmonize = h;
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
  // A buyback cost that isn't mana ("sacrifice a land", "discard two cards"): paid only as our other costs would be.
  const bb = compileCard(defOf(s, obj(s, id)));
  const bbCosts = bb.buybackCosts && !via && !extra.sacrifice && !extra.discard ? chooseExtraCosts(s, pid, id, targets ?? [], via, alt, extra.costOr, x ?? 0, modes, true) : undefined;
  const buybacks = bb.buyback !== undefined && !via && (!bb.buybackCosts || bbCosts) ? [true, false] : [false];
  // "Kicker—Sacrifice two lands" (CR 702.33a): kicked only when we'd pay its costs as we would our other ones.
  const kickCosts = bb.kicker?.extraCosts && !extra.sacrifice && !extra.discard && !extra.returnToHand && !extra.tap ? chooseExtraCosts(s, pid, id, targets ?? [], via, alt, extra.costOr, x ?? 0, modes, false, [0]) : undefined;
  // Splice (CR 702.47a): the cards in hand worth adding, with their own targets after the spell's; then without.
  const spliced = chooseSplices(s, pid, id, x ?? 0);
  // Offering (CR 702.48a): only when it can't be cast otherwise (not now, or not with our mana), for the cheapest
  // permanent we can spare.
  const offering = free
    ? undefined
    : offeringCandidates(s, pid, id)
        .map((o) => obj(s, o))
        .filter((o) => !o.isCommander && !extra.sacrifice?.includes(o.id) && extra.casualty !== o.id && extra.bargain !== o.id && !(targets ?? []).some((t) => t.kind === "object" && t.id === o.id) && (o.isToken || worth(s, pid, o) <= 3))
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
  for (const offer of offering ? [undefined, offering.id] : [undefined])
    for (const splice of spliced.ids.length ? [spliced, undefined] : [undefined])
      for (const buyback of buybacks)
        for (const kicks of kickOptions(s, pid, id, free, x).filter(kickOk).filter((k) => !(printed?.modal?.both === "kicked" && (modes?.length ?? 0) < 2 && k.length) && !(k.length && bb.kicker?.extraCosts && (!kickCosts || buyback || k.length > 1)))) {
          const all = splice ? [...(targets ?? []), ...splice.targets] : targets;
          // Splice costs beyond mana (Torrent of Stone's "sacrifice two Mountains"): paid as our other costs would be.
          const spliceCosts = splice?.costly && !buyback && !kicks.length ? chooseExtraCosts(s, pid, id, all ?? [], via, alt, extra.costOr, x ?? 0, modes, false, undefined, splice.ids) : undefined;
          if (splice?.costly && !spliceCosts) continue;
          const plan = planCast(s, pid, id, all?.length ? all : (targets ?? undefined), modes, "auto", x, { ...extra, ...(buyback && bbCosts ? bbCosts : {}), ...(kicks.length && kickCosts ? kickCosts : {}), ...(spliceCosts ?? {}), ...(kicks.length ? { kicks } : {}), ...(via ? { via } : {}), ...(buyback ? { buyback } : {}), ...(splice ? { splice: splice.ids } : {}), ...(offer ? { offering: offer } : {}) });
          // Leave mana for ward on what it targets, or don't bother (CR 702.21a).
          if (plan && all && !canAlsoPayWard(s, pid, plan, all)) continue;
          if (plan) return plan;
        }
  return null;
}

/**
 * Cards to splice onto this spell (CR 702.47a): ones whose text does something for us now (not only mana, which would
 * come too late), each with targets of its own we'd pick.
 */
function chooseSplices(s: GameState, pid: PlayerId, id: ObjectId, x: number): { ids: ObjectId[]; targets: TargetChoice[]; costly?: true } {
  const out: { ids: ObjectId[]; targets: TargetChoice[]; costly?: true } = { ids: [], targets: [] };
  for (const c of spliceCandidates(s, pid, id)) {
    const body = compileCard(defOf(s, obj(s, c))).spell!;
    if (body.effects.every((e) => e.type === "addMana")) continue;
    if ((groupValue(s, pid, body, guessChosen(s, pid, defOf(s, obj(s, c)))) ?? 1) <= 0) continue;
    const t = body.targets.length ? chooseTargets(s, pid, body, false, id, x) : [];
    if (!t || t.some((x) => x.kind === "none")) continue;
    out.ids.push(c);
    out.targets.push(...t);
    const costs = compileCard(defOf(s, obj(s, c))).splice?.costs;
    if (costs && !landsToSpare(s, pid, costs)) {
      out.ids.pop();
      out.targets.splice(out.targets.length - t.length, t.length);
      continue;
    }
    if (costs) out.costly = true;
  }
  return out;
}


/** A card that does more from our graveyard: flashback and the like, or an ability that works there. */
const usefulInGraveyard = (s: GameState, id: ObjectId) => !!compileCard(defOf(s, obj(s, id))).fromGraveyard?.length || abilitiesOf(s, obj(s, id)).activated.some((ab) => ab.zone === "graveyard");

/** Cards to collect evidence N with (CR 701.59a): the fewest that do it, none we'd use from the graveyard; null if there aren't. */
function spareEvidence(s: GameState, pid: PlayerId, n: number, not?: ObjectId, taken: ObjectId[] = [], filter?: TargetSpec): ObjectId[] | null {
  const keepers = player(s, pid).graveyard.filter((c) => usefulInGraveyard(s, c));
  if (evidenceProblem(s, pid, n, undefined, not, [...taken, ...keepers], filter)) return null;
  return autoEvidence(s, pid, n, not, [...taken, ...keepers], filter);
}

/** Does the spell do more if evidence was collected for it (CR 701.59c): a part of it, its enters trigger, or a lower cost? */
function wantsEvidence(c: CompiledCard): boolean {
  if (c.evidenceReduction) return true;
  return JSON.stringify([c.spell ?? null, c.triggers]).includes('"kind":"evidence"') || c.triggers.some((t) => t.ifEvidence);
}

/** Kicker choices to try, most kicked first, ending with not kicking it. */
function kickOptions(s: GameState, pid: PlayerId, id: string, free: boolean, x?: number): number[][] {
  const k = compileCard(defOf(s, obj(s, id))).kicker;
  if (!k) return [[]];
  // "As an additional cost to cast this spell, waterbend {5}": always paid, nothing to choose.
  if (k.required) return [[]];
  // Molten Exhale, Tegwyll's Scouring: the price of casting it as though it had flash, not paid when it needn't be.
  if (compileCard(defOf(s, obj(s, id))).flashIfKicked) return canActAtSorcerySpeed(s, pid) ? [[]] : [[0]];
  // "Kicker {X}": kicked only with an X chosen for it, else not.
  if (parseManaCost(k.costs[0]!).hasX && !parseManaCost(defOf(s, obj(s, id)).manaCost).hasX) return x ? [[0]] : [[]];
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
function chooseExtraCosts(s: GameState, pid: PlayerId, id: string, targets: TargetChoice[], via?: CastFromGraveyardKind, alt?: AltCostKind, costOr?: number, x = 0, modes?: number[], buyback?: boolean, kicks?: number[], splice?: ObjectId[]): CostChoices | null {
  const out: CostChoices = {};
  const targeted = new Set(targets.flatMap((t) => (t.kind === "none" ? [] : [t.id])));
  const d = defOf(s, obj(s, id));
  for (const c of castExtraCosts(d, { via, alt, costOr, objectId: id, ...(modes ? { modes } : {}), ...(buyback ? { buyback } : {}), ...(kicks ? { kicks } : {}), ...(splice?.length ? { splice } : {}) }, x, s, pid)) {
    if (c.kind === "revealHand") continue; // nothing to choose
    // Kaervek's Spite: everything we have, only to finish an opponent at 5 life or less.
    // Soulblast: all our creatures, only to finish an opponent with their total power.
    if (c.kind === "sacrificeAll" && c.creatures) {
      const total = s.battlefield.map((x) => obj(s, x)).filter((o) => controllerOf(s, o) === pid && objIsType(s, o, "Creature")).reduce((n, o) => n + Math.max(0, power(s, o)), 0);
      if (!targets.some((t) => t.kind === "player" && t.id !== pid && player(s, t.id).life <= total)) return null;
      continue;
    }
    if (c.kind === "sacrificeAll" || c.kind === "discardHand") {
      if (!targets.some((t) => t.kind === "player" && t.id !== pid && player(s, t.id).life <= 5)) return null;
      continue;
    }
    if (c.kind === "forage") {
      const f = forageChoice(s, pid, obj(s, id), [...targeted].map(String));
      if (!f) return null;
      Object.assign(out, f);
      continue;
    }
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
      // "Tap two untapped artifacts, creatures, and/or lands you control" (Warlord's Elite): what can't pay the spell's
      // mana first, then lands whose basic types make none of the colors its cost asks for.
      const colors = new Set((d.manaCost ?? "").match(/[WUBRG]/g) ?? []);
      const needed = (o: GameObject) => (manaAbilitiesOn(s, o).some((m) => m.tap) ? 1 + Number(characteristics(s, o).subtypes.some((t) => colors.has(({ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" } as Record<string, string>)[t] ?? ""))) : 0);
      const pool = tapCostCandidates(s, pid, obj(s, id), c)
        .map((x) => obj(s, x))
        .filter((o) => !targeted.has(o.id) && o.attacking === undefined)
        .sort((a, b) => needed(a) - needed(b) || worth(s, pid, a) - worth(s, pid, b));
      if (pool.length < c.n) return null;
      out.tap = pool.slice(0, c.n).map((o) => o.id);
    } else if (c.kind === "exileFromHand" && c.anyNumber) {
      continue; // the Marches: bots exile none
    } else if (c.kind === "exileFromHand") {
      // Pitching cards (Force of Will): the cheapest that fit, and only with another card left in hand after.
      const others = player(s, pid).hand.filter((x) => x !== id);
      const fits = others.filter((x) => !c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))).sort((a, b) => mv(s, a) - mv(s, b));
      if (fits.length < c.n || others.length < c.n + 1) return null;
      out.exileFromHand = fits.slice(0, c.n);
    } else if (c.kind === "reveal" && c.orControl) {
      // Behold: a permanent we control (nothing is given away), or with "and exile it" a card from our hand first (it
      // comes back when the spell's permanent leaves), else the least valuable nontoken permanent that isn't our
      // commander (a token exiled is gone for good, CR 111.7).
      const pool = beholdCandidates(s, pid, obj(s, id), c).filter((x) => !targeted.has(x));
      const field = pool.filter((x) => obj(s, x).zone === "battlefield" && !(c.exile && (obj(s, x).isToken || obj(s, x).isCommander))).sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b)));
      const hand = pool.filter((x) => obj(s, x).zone === "hand").sort((a, b) => mv(s, a) - mv(s, b));
      const fits = c.exile ? [...hand, ...field] : [...field, ...hand];
      if (fits.length < c.n) return null;
      // Dragon's Fire: the strongest Dragon, and only when its power beats the damage dealt without one.
      const beheldIf = compileCard(defOf(s, obj(s, id))).spell?.effects.find((e) => e.type === "if" && JSON.stringify(e.effects).includes('"kind":"beheldPower"'));
      if (beheldIf?.type === "if") {
        const pw = (x: ObjectId) => (obj(s, x).zone === "battlefield" ? power(s, obj(s, x)) : cardPT(s, obj(s, x), "power"));
        const best = [...field, ...hand].sort((a, b) => pw(b) - pw(a))[0]!;
        const plain = beheldIf.otherwise?.[0]?.type === "damage" && typeof beheldIf.otherwise[0].amount === "number" ? beheldIf.otherwise[0].amount : 0;
        if (pw(best) <= plain) return null;
        out.reveal = [best];
        continue;
      }
      out.reveal = fits.slice(0, c.n);
    } else if (c.kind === "reveal") {
      const fits = player(s, pid).hand.filter((x) => x !== id && printedMatches(c.filter, defOf(s, obj(s, x))));
      if (fits.length < c.n) return null;
      out.reveal = fits.slice(0, c.n);
    }
    else if (c.kind === "payLife") {
      if (player(s, pid).life < c.n + 15) return null;
    } else if (c.kind === "sacrifice" && c.oneOfEach) {
      // "A Swamp and a Forest" (Jarad): for each in turn, the cheapest that fits it and as few of the others as can be
      // (a plain Swamp before an Overgrown Tomb), each a different permanent.
      const pool = sacrificePool(s, pid, c, targeted, alt);
      const picked: ObjectId[] = [];
      for (const [i, f] of c.oneOfEach.entries()) {
        const later = (x: GameObject) => c.oneOfEach!.slice(i + 1).filter((g) => objectMatches(s, g, x, pid, false)).length;
        const o = pool.filter((x) => !picked.includes(x.id) && objectMatches(s, f, x, pid, false)).sort((a, b) => later(a) - later(b))[0];
        if (!o) return null;
        picked.push(o.id);
      }
      out.sacrifice = picked;
    } else if (c.kind === "sacrifice") {
      const pool0 = sacrificePool(s, pid, c, targeted, alt);
      // "With different names" (Transmutation Font): the first of each name.
      const pool = c.differentNames ? differentlyNamed(s, pool0.map((o) => o.id)).map((id) => obj(s, id)) : pool0;
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
    } else if (c.kind === "discard" && c.differentNames) {
      // Ormos, Archive Keeper: the cards we'd discard first, one of each name.
      const picks = differentlyNamed(s, chooseDiscards(s, pid, player(s, pid).hand.length, id)).slice(0, c.n);
      if (picks.length < c.n) return null;
      out.discard = picks;
    } else if (c.kind === "discard") {
      const others = player(s, pid).hand.filter((x) => x !== id);
      if (others.length < c.n) return null;
      out.discard = chooseDiscards(s, pid, c.n, id);
    } else if (c.kind === "collectEvidence") {
      // Conspiracy Unraveler's alternative cost: the fewest cards that make it up.
      const ids = spareEvidence(s, pid, c.n, id, out.exileCards, c.filter);
      if (!ids) return null;
      out.collect = ids;
    } else if (c.kind === "exileFromGraveyard" && c.top) {
      // "The top three black cards of your graveyard": no choice (CR 404.1).
      if (topGraveyardCards(s, pid, c.n, c.filter).length < c.n) return null;
    } else if (c.kind === "mill") {
      if (player(s, pid).library.length < c.n + 10) return null;
    } else if (c.kind === "removeCounters") {
      const picks = spareCounters(s, pid, obj(s, id), c);
      if (!picks) return null;
      out.counters = picks;
    } else if (c.kind === "putCounter") {
      const pick = spareCounterHost(s, pid, c, targeted);
      if (!pick) return null;
      out.counterOn = [pick];
    } else if (c.kind === "payEnergy") {
      if ((player(s, pid).energy ?? 0) < c.n) return null;
    } else {
      const pool = player(s, pid).graveyard.filter((x) => x !== id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))));
      if (pool.length < c.n) return null;
      out.exileCards = pool.slice(0, c.n);
    }
  }
  // The Defilers: 2 life for a colored mana, with plenty of life to spare.
  const offers = lifeCostOffers(s, pid, id, x);
  const life = offers.reduce((n, l) => n + l.life, 0);
  if (offers.length && player(s, pid).life - life >= 20) out.lifeFor = offers.map((l) => l.id);
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
    .filter((o) => controllerOf(s, o) === pid && !o.isCommander && !targeted.has(o.id) && objectMatches(s, c.filter, o, pid, false) && (c.exile || canSacrificeForCost(s, o)))
    .filter((o) => (isEmerge(alt) ? o.isToken || power(s, o) <= 3 : value(o) <= 3 || (objIsType(s, o, "Land") && lands(s, pid) >= 7)))
    .sort((a, b) => (isEmerge(alt) ? mv(s, b.id) - mv(s, a.id) : value(a) - value(b)));
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
/** An untargeted ability that sets its source's base power and toughness for good no higher than they are now. */
function shrinksSelf(s: GameState, o: GameObject, body: AbilityBody): boolean {
  const top = body.effects.filter((e) => e.type === "continuous" && e.what.ref === "self" && e.duration === "game");
  const set = top.flatMap((e) => (e.type === "continuous" ? e.mods : [])).find((m) => m.kind === "setPT");
  if (!set || set.kind !== "setPT" || typeof set.power !== "number" || typeof set.toughness !== "number" || !objIsType(s, o, "Creature")) return false;
  const plus = (o.counters["+1/+1"] ?? 0) - (o.counters["-1/-1"] ?? 0);
  return set.power + set.toughness <= power(s, o) + toughness(s, o) - 2 * plus;
}

/**
 * Distributing counters among our own permanents: harmful ones all on the least useful one; +1/+1 counters first to
 * creatures they lift to power 4 (what "for each creature you control with power 4 or greater" counts), the nearest
 * first, the rest on the best creature.
 */
/**
 * Moving the counters off its own permanent onto other creatures (Forgotten Ancient): all of them onto our strongest
 * creature that's hard to block, where they're worth more in combat; otherwise they stay where they are. Never onto
 * another player's creature.
 */
function chooseCounterMove(s: GameState, pid: PlayerId, options: ObjectId[], total: number, counter: CounterKind): Record<ObjectId, number> {
  if (counter !== "+1/+1") return {};
  const evasive = options.filter((id) => {
    const o = obj(s, id);
    return controllerOf(s, o) === pid && objIsType(s, o, "Creature") && ["Flying", "Trample", "Menace", "Shadow", "Horsemanship"].some((k) => objHasKeyword(s, o, k));
  });
  const best = evasive.sort((a, b) => power(s, obj(s, b)) - power(s, obj(s, a)))[0];
  return best ? { [best]: total } : {};
}

/** Sensational Spider-Man: as many as it may (each is a card drawn), off its own permanents first, then the least worthy. */
function chooseCounterRemoval(s: GameState, pid: PlayerId, options: ObjectId[], total: number, has: Record<ObjectId, number>): Record<ObjectId, number> {
  const order = [...options].sort((a, b) => Number(controllerOf(s, obj(s, b)) === pid) - Number(controllerOf(s, obj(s, a)) === pid) || worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b)));
  const parts: Record<ObjectId, number> = {};
  let left = total;
  for (const id of order) {
    const k = Math.min(left, has[id] ?? 0);
    if (k > 0) parts[id] = k;
    left -= k;
  }
  return parts;
}

function chooseDistribution(s: GameState, pid: PlayerId, options: ObjectId[], total: number, counter: CounterKind): Record<ObjectId, number> {
  const byWorth = [...options].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)));
  if (harmfulCounter(counter)) return { [byWorth[byWorth.length - 1]!]: total };
  const parts: Record<ObjectId, number> = {};
  let left = total;
  if (counter === "+1/+1")
    for (const { id, need } of options.map((id) => ({ id, need: 4 - power(s, obj(s, id)) })).filter((x) => x.need > 0).sort((a, b) => a.need - b.need)) {
      if (need > left) break;
      parts[id] = need;
      left -= need;
    }
  if (left > 0) parts[byWorth[0]!] = (parts[byWorth[0]!] ?? 0) + left;
  return parts;
}

/**
 * "Each opponent chooses fame or fortune" (Seize the Spotlight): fame lends the caster one of our creatures for a turn,
 * fortune gives them a card and a Treasure. Fame when we have no creature worth more than a card, else fortune.
 */
function chooseWord(s: GameState, pid: PlayerId, options: string[]): string {
  if (options.join() === "fame,fortune") {
    const best = Math.max(0, ...s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature")).map((id) => power(s, obj(s, id))));
    return best <= 2 ? "fame" : "fortune";
  }
  // Prisoner's Dilemma: snitch costs less whatever the others choose (0 or 8 damage, against 4 or 12 for silence).
  if (options.join() === "silence,snitch") return "snitch";
  // Master of Ceremonies: a card with a short hand, a creature with few of them, else a Treasure.
  if (options.join() === "money,friends,secrets") {
    if (player(s, pid).hand.length <= 3) return "secrets";
    return s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature")).length <= 2 ? "friends" : "money";
  }
  return options[0]!;
}

/** Azra Oddsmaker: a choose-pick right before an "aboutCreated" combat-damage floating trigger, at any nesting depth. */
function pickThenCombatDamageTrigger(effects: Effect[]): boolean {
  return effects.some((e, i) => {
    const next = effects[i + 1];
    if (e.type === "pick" && e.action === "choose" && next?.type === "floatingTrigger" && next.aboutCreated && next.trigger.event === "selfDealsCombatDamageToPlayer") return true;
    return "effects" in e && Array.isArray(e.effects) && pickThenCombatDamageTrigger(e.effects as Effect[]);
  });
}

function choosePicks(s: GameState, pid: PlayerId, options: ObjectId[], count: number, action: PickAction, counter?: CounterKind): ObjectId[] {
  const self = s.resolving?.item.sourceId;
  if (action === "attach") return attachPicks(s, pid, options);
  // Akiri, Fearless Voyager: save our best creature (it's tapped and indestructible).
  if (action === "unattach") return [...options].sort((a, b) => worth(s, pid, obj(s, obj(s, b).attachedTo!)) - worth(s, pid, obj(s, obj(s, a).attachedTo!))).slice(0, count);
  // Call the Spirit Dragons: "if you put +1/+1 counters on five Dragons this way, you win": a Dragon not given one yet first.
  if (action === "counters" && s.resolving && JSON.stringify(s.resolving.body.effects).includes('"countersPutOnThisWay"')) {
    const given = new Set((s.resolving.countersPutThisWay ?? []).map((c) => c.id));
    return [...options].sort((a, b) => Number(given.has(a)) - Number(given.has(b)) || worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))).slice(0, count);
  }
  const after = action === "choose" && s.resolving ? s.resolving.body.effects[s.resolving.next + 1] : undefined;
  // Azra Oddsmaker: the creature whose combat damage to a player draws us cards this turn: ours that can attack an
  // opponent now, the strongest first; else our best one.
  // The pick is nested in "if you do" there, so look for a choose-pick followed by that trigger anywhere in the body.
  const azra = action === "choose" && s.resolving !== null && pickThenCombatDamageTrigger(s.resolving.body.effects);
  if (azra || (after?.type === "floatingTrigger" && after.aboutCreated && after.trigger.event === "selfDealsCombatDamageToPlayer")) {
    const able = (id: ObjectId) => opponents(s, pid).some((q) => attackProblem(s, obj(s, id), q) === null);
    const rank = (id: ObjectId) => (controllerOf(s, obj(s, id)) !== pid ? -1e6 : (able(id) ? 1e5 : 0) + power(s, obj(s, id)) * 100 + worth(s, pid, obj(s, id)) / 1e3);
    return [...options].sort((a, b) => rank(b) - rank(a)).slice(0, count);
  }
  // Drop of Honey, Purging Scythe: a tied creature of anyone's to destroy or damage: an opponent's, worth the most to them;
  // else our least useful one.
  // Eye of Doom: a doom counter (the Eye destroys them later) likewise.
  // Chaos Defiler: one of the chosen is destroyed at random: each opponent's most useful.
  if ((after?.type === "destroy" && after.what.ref === "created") || (after?.type === "destroyRandomTarget" && after.what.ref === "created") || (after?.type === "damage" && JSON.stringify(after.to) === '{"ref":"created"}') || (after?.type === "counters" && after.what.ref === "created" && (after.counter === "doom" || after.counter === "aim"))) {
    const rank = (id: ObjectId) => (controllerOf(s, obj(s, id)) !== pid ? -1000 - worth(s, pid, obj(s, id)) : worth(s, pid, obj(s, id)));
    return [...options].sort((a, b) => rank(a) - rank(b)).slice(0, count);
  }
  // Mist of Stagnation: permanents to untap, anyone's: our tapped ones, the best first; then ones already untapped (no
  // change); an opponent's tapped one last.
  if (after?.type === "untap" && after.what.ref === "created") {
    const rank = (id: ObjectId) => {
      const o = obj(s, id);
      const mine = controllerOf(s, o) === pid;
      return mine && o.tapped ? 2000 + worth(s, pid, o) : !o.tapped ? 1000 : -worth(s, pid, o);
    };
    return [...options].sort((a, b) => rank(b) - rank(a)).slice(0, count);
  }
  // Imperial Edict: "Target opponent chooses a creature they control. Destroy that creature.": our least useful one.
  // Riches: "Each opponent chooses a creature they control. You gain control of those creatures.": the same.
  const lose = after?.type === "continuous" && after.what.ref === "created" && after.mods.some((m) => m.kind === "control");
  if (((after?.type === "destroy" || after?.type === "exile") && after.what.ref === "created") || lose) return [...options].sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b))).slice(0, count);
  // Good counters go on the best creature; stun and -1/-1 counters on the least useful one.
  if (action === "populate" || action === "pair" || action === "choose" || (action === "counters" && (counter === "+1/+1" || counter === "shield" || counter === "loyalty"))) return [...options].sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))).slice(0, count);
  // Meld (CR 701.42b): the card of the pair itself, not a token or a Clone, which would stay in exile; of those, the one
  // worth least as it is (counters, Auras and the like don't come along).
  if (action === "meld") {
    const real = (id: ObjectId) => (!obj(s, id).isToken && realDefOf(s, obj(s, id)).name === characteristics(s, obj(s, id)).name ? 0 : 1);
    return [...options].sort((a, b) => real(a) - real(b) || worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b))).slice(0, count);
  }
  // "Choose ..., then sacrifice the rest": keep our best permanents, and choosing for another player (Mythos of Snapdax),
  // leave them their least useful ones.
  // Winnowing: the creature kept spares those sharing a creature type with it: ours, the one saving the most worth; another
  // player's, the one saving the least.
  const keeping = action === "keep" && count === 1 && s.resolving ? s.resolving.body.effects[s.resolving.next] : undefined;
  if (keeping?.type === "keepRest" && keeping.sparesTypeOfKept) {
    const saved = (id: ObjectId) => options.filter((o2) => o2 === id || shareCreatureType(creatureTypesOf(s, obj(s, id)), creatureTypesOf(s, obj(s, o2)))).reduce((n, o2) => n + worth(s, pid, obj(s, o2)), 0);
    const mine = options.every((id) => controllerOf(s, obj(s, id)) === pid);
    return [...options].sort((a, b) => (mine ? 1 : -1) * (saved(b) - saved(a))).slice(0, 1);
  }
  if (action === "keep") {
    // Mount Doom: every player's are among them; ours, best first.
    if (options.some((id) => controllerOf(s, obj(s, id)) !== pid) && options.some((id) => controllerOf(s, obj(s, id)) === pid))
      return options.filter((id) => controllerOf(s, obj(s, id)) === pid).sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))).slice(0, count);
    const mine = options.every((id) => controllerOf(s, obj(s, id)) === pid);
    return [...options].sort((a, b) => (mine ? 1 : -1) * (worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a)))).slice(0, count);
  }
  // Planar Overlay: a land already chosen for another basic land type (a dual land) goes back only once, so that one first.
  const overlay = action === "bounce" && s.resolving ? s.resolving.body.effects[s.resolving.next] : undefined;
  if (overlay?.type === "keepRest" && overlay.bounceChosen) {
    const before = new Set(Object.values(s.resolving!.scratch?.keepRest?.kept ?? {}).flat());
    return [...options].sort((a, b) => (before.has(a) ? 0 : 1) - (before.has(b) ? 0 : 1) || worth(s, pid, obj(s, a)) - (obj(s, a).tapped ? 1 : 0) - (worth(s, pid, obj(s, b)) - (obj(s, b).tapped ? 1 : 0))).slice(0, count);
  }
  // "Untap up to seven lands": ours, not an opponent's.
  if (action === "untap") return options.filter((id) => controllerOf(s, obj(s, id)) === pid).slice(0, count);
  // "Tap any number of untapped creatures you control. ... for each creature tapped this way": all of them, but on our
  // own turn before attackers are declared, not the creatures that could still attack.
  if (action === "tap") {
    // Augusta, Dean of Order: "untap each creature you control, then tap any number of creatures you control", nothing
    // counting the creatures tapped: the attacking ones (tapped +1/+0), the others stay untapped to block.
    const body = s.resolving?.body.effects ?? [];
    const last = body.findIndex((e) => e.type === "tapAnyNumber") === body.length - 1;
    if (last && s.activePlayer === pid && options.some((id) => obj(s, id).attacking !== undefined)) return options.filter((id) => obj(s, id).attacking !== undefined).slice(0, count);
    const beforeAttacks = s.activePlayer === pid && ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.step);
    const attackers = beforeAttacks ? new Set(potentialAttackers(s, pid).map((o) => o.id)) : new Set<ObjectId>();
    return options.filter((id) => !attackers.has(id)).slice(0, count);
  }
  // Another player's permanents (Split the Party): theirs worth the most.
  const theirs = options.some((id) => controllerOf(s, obj(s, id)) !== pid);
  const cost = (id: ObjectId) => {
    const o = obj(s, id);
    // Drake Familiar: anyone's enchantment: an opponent's worth the most first, else our least useful one.
    if (theirs) return controllerOf(s, o) !== pid ? -1000 - worth(s, pid, o) : worth(s, pid, o);
    return worth(s, pid, o) + (action === "bounce" && id === self ? 10 : 0) - (action === "bounce" && o.tapped ? 1 : 0);
  };
  return [...options].sort((a, b) => cost(a) - cost(b)).slice(0, count);
}

/**
 * Devour (any number) and exploit (none or one): sacrifice only what's worth less than what we get. Devour N gives
 * +N/+N for each, so tokens up to that size go; exploit's payoff is worth a small token or a small creature.
 */
function chooseOptionalSacrifices(s: GameState, pid: PlayerId, pend: Extract<PendingDecision, { kind: "pickPermanents" }>): ObjectId[] {
  // Phyrexian Dreadnought: the least worth creatures that reach the total power (wantsMay checked they're worth less than it).
  if (pend.minTotalPower !== undefined) return powerFloorSet(s, pid, pend.options, pend.minTotalPower) ?? [];
  const ok = pend.options.map((id) => obj(s, id)).filter((o) => !o.isCommander && !objIsType(s, o, "Land"));
  if (pend.objectId) {
    const devour = compileCard(defOf(s, obj(s, pend.objectId))).devour;
    // Wood Elemental's P/T is the number of untapped Forests sacrificed: those beyond the four lands we keep, at least one.
    if (devour?.defines === "count") {
      const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
      return pend.options.slice(0, Math.max(Math.min(1, pend.options.length), lands - 4));
    }
    // Dracoplasm's is their total: the cheap tokens, or else the least worth creature, since a 0/0 dies at once.
    if (devour?.defines === "total") {
      const tokens = ok.filter((o) => o.isToken && worth(s, pid, o) <= 4).map((o) => o.id);
      return tokens.length ? tokens.slice(0, pend.count) : [...ok].sort((a, b) => worth(s, pid, a) - worth(s, pid, b)).slice(0, 1).map((o) => o.id);
    }
    // Rescuer Sphinx: a cheap nontoken permanent to cast again (a token would cease to exist, CR 111.8), or nothing.
    if (devour?.bounce) return [...ok].filter((o) => !o.isToken && mv(s, o.id) <= 2).sort((a, b) => mv(s, a.id) - mv(s, b.id)).slice(0, 1).map((o) => o.id);
    const n = devour?.n;
    const per = typeof n === "number" ? n : 2;
    return ok.filter((o) => o.isToken && worth(s, pid, o) <= 2 * per).map((o) => o.id).slice(0, pend.count);
  }
  // "Sacrifice any number of ...": for Scapeshift's "search for up to that many land cards", the tapped lands (they come
  // back tapped, as better lands); to draw that many (Sephiroth, Bontu), the cheap tokens.
  const r = s.resolving;
  const here = r?.body.effects[r.next];
  if (here?.type === "pick" && here.anyNumber) {
    const next = r!.body.effects[r!.next + 1];
    // Swashbuckler Extraordinaire: a Treasure for each of our attackers with power 2 or more that lacks double strike.
    if (next?.type === "if" && next.effects.some((e) => e.type === "reflexive" && e.xSacrificed)) {
      const strikers = s.battlefield.filter((id) => {
        const o = obj(s, id);
        return o.attacking !== undefined && controllerOf(s, o) === pid && power(s, o) >= 2 && !objHasKeyword(s, o, "Double strike");
      }).length;
      return ok.filter((o) => o.isToken).slice(0, strikers).map((o) => o.id);
    }
    if (next?.type === "search" && next.filter?.types?.includes("Land")) return pend.options.filter((id) => objIsType(s, obj(s, id), "Land") && obj(s, id).tapped);
    // Sweep (Plow Through Reito), Landslide: the lands already tapped for mana, each one more for the spell.
    if (here.filter.subtypes?.length && (here.action === "bounce" || next?.type === "damage")) return pend.options.filter((id) => objIsType(s, obj(s, id), "Land") && obj(s, id).tapped);
    // "Exile any number of ... until ~ leaves the battlefield" (Abdel Adrian, Glorious Protector): the nontoken ones that
    // come back with an enters ability, and, when a token is made for each, cheap tokens.
    if (next?.type === "exile" && next.until) {
      const tokensFor = r!.body.effects.slice(r!.next + 2).some((e) => e.type === "createToken");
      return ok.filter((o) => (o.isToken ? tokensFor && worth(s, pid, o) <= 1 : !o.isCommander && compileCard(defOf(s, o)).triggers.some((t) => t.event === "selfEnters"))).map((o) => o.id);
    }
    return ok.filter((o) => o.isToken && worth(s, pid, o) <= 2).map((o) => o.id);
  }
  const cheapest = ok.sort((a, b) => worth(s, pid, a) - worth(s, pid, b))[0];
  return cheapest && (cheapest.isToken || worth(s, pid, cheapest) <= 3) ? [cheapest.id] : [];
}

/** What a Pact's "pay {2}{B}. If you don't, you lose the game" asks for at the next upkeep, as mana value. */
function pactCost(effects: Effect[]): number {
  for (const e of effects) {
    const lose = e.type === "delayed" ? e.effects.find((x) => x.type === "may" && x.otherwise?.some((y) => y.type === "loseGame")) : undefined;
    if (lose?.type === "may" && lose.pay?.mana) return manaValue(parseManaCost(lose.pay.mana));
  }
  return 0;
}
/** The Pacts this player still has to pay for. */
const owedPacts = (s: GameState, pid: PlayerId) => (s.delayed ?? []).filter((d) => d.controller === pid).reduce((n, d) => n + pactCost([{ type: "delayed", when: "yourNextUpkeep", effects: d.body.effects, text: "" }]), 0);
/** A cost of sacrificing lands (Torrent of Stone's splice, Solar Tide's entwine): paid only with five lands left after. */
const LAND_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
function landsToSpare(s: GameState, pid: PlayerId, costs: AdditionalCost[]): boolean {
  const n = costs.reduce((a, c) => a + (c.kind === "sacrifice" && (c.filter.types?.includes("Land") || c.filter.subtypes?.some((t) => LAND_TYPES.includes(t))) ? c.n : 0), 0);
  return !n || lands(s, pid) - n >= 5;
}
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;

/** Explore revealed a nonland card: keep it on top if we could cast it soon, otherwise mill it. */
/**
 * "You may put it into your hand / onto the battlefield" about the card "reveal/look at the top card" found: yes. Undefined
 * when it isn't that, or it's about getting rid of the card (into the graveyard, on the bottom), decided like a mill.
 */
function revealedMay(s: GameState, card: string): boolean | undefined {
  const r = s.resolving;
  if (r?.revealed?.id !== card) return undefined;
  const may = allEffects(r.body.effects).find((e) => e.type === "may" && e.effects.some((x) => "what" in x && (x.what as { ref?: string } | undefined)?.ref === "revealed"));
  if (may?.type !== "may") {
    // Sorin the Mirthless: the card, for life equal to its mana value, when that leaves plenty.
    const toHand = allEffects(r.body.effects).find((e) => e.type === "may" && e.effects.some((x) => x.type === "revealTopToHand"));
    if (toHand) {
      const n = defMv(defOf(s, obj(s, card)));
      return n <= 4 && player(s, r.item.controller).life - n >= 10;
    }
    return undefined;
  }
  return may.effects.some((x) => x.type === "bounce" || x.type === "putOntoBattlefield") ? true : undefined;
}

function millExplored(s: GameState, pid: PlayerId, card: string): boolean {
  const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  return defMv(defOf(s, obj(s, card))) > lands + 1;
}

/** Provoking `target` into blocking `attacker` is good for us: it dies in the block, and ours doesn't. */
function provokeGood(s: GameState, attacker: GameObject, target: GameObject): boolean {
  const deadly = (a: GameObject) => objHasKeyword(s, a, "Deathtouch");
  return (power(s, attacker) >= toughness(s, target) || deadly(attacker)) && power(s, target) < toughness(s, attacker) && !deadly(target);
}

/** Cards `pid` owns exiled with this permanent (any of its linked exile piles, CR 607.2a). */
function linkedOwned(s: GameState, sourceId: ObjectId | undefined, pid: PlayerId): number {
  if (!sourceId) return 0;
  return Object.entries(s.linkedExile ?? {})
    .filter(([k]) => k.startsWith(`${sourceId}@`))
    .flatMap(([, v]) => v)
    .filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc && s.objects[l.id]!.owner === pid).length;
}

function wantsMay(s: GameState, pid: PlayerId): boolean {
  const r = s.resolving;
  const e = r?.body.effects[r.next];
  // Purgatory: "you may pay {4} and 2 life. If you do, return a card exiled with ~ to the battlefield": only with a card
  // there to return (CR 607.2a).
  if (r && e?.type === "may" && e.effects.length && e.effects.every((x) => x.type === "moveLinked")) return linkedCards(s, r.item.sourceId, r.item.sourceZc).length > 0;
  // Neera, Wild Mage: "you may put it on the bottom of its owner's library. If you do, reveal ... until you reveal a nonland
  // card. You may cast that card without paying its mana cost": a cheap spell for a free card worth more on average.
  if (r && e?.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "causeToBottom") {
    const spell = s.stack.find((x) => x.id === r.item.cause && x.kind === "spell");
    const o = spell?.objectId ? s.objects[spell.objectId] : undefined;
    return !!o && !o.spellCopy && !o.isCommander && defMv(defOf(s, o)) <= 2 && player(s, pid).library.some((id) => !isType(defOf(s, obj(s, id)), "Land"));
  }
  // Iroh, Tea Master: "you may have target opponent gain control of target permanent you control": only a noncreature
  // token (a Food, a Treasure), for the Ally token it makes.
  const gift = e?.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "continuous" && e.effects[0]!.giveTo ? e.effects[0]! : undefined;
  if (r && gift?.type === "continuous" && gift.what.ref === "target") {
    const t = r.item.targets?.[gift.what.index];
    const o = t?.kind === "object" ? s.objects[t.id] : undefined;
    return !!o && o.zone === "battlefield" && o.isToken && !objIsType(s, o, "Creature");
  }
  // World Queller: "you may choose a card type. If you do, each player sacrifices ...": only for a type that costs the
  // opponents more than us.
  if (e?.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "choose" && e.effects[0]!.choice === "cardType" && edictsChosenType(s)) return (e.effects[0]!.options ?? []).some((ty) => edictTypeScore(s, pid, ty) > 0);
  // Belligerent Yearling: "you may have ~'s base power become equal to that creature's power": only when that's more than
  // its power now, counters aside (they apply on top either way).
  const setPow = e?.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "continuous" && e.effects[0]!.what.ref === "self" && e.effects[0]!.mods.length === 1 && e.effects[0]!.mods[0]!.kind === "setPower" ? e.effects[0]!.mods[0]! : undefined;
  if (r && setPow?.kind === "setPower") {
    const me = r.item.sourceId ? s.objects[r.item.sourceId] : undefined;
    if (!me || me.zone !== "battlefield") return false;
    const now = power(s, me) - (me.counters["+1/+1"] ?? 0) + (me.counters["-1/-1"] ?? 0);
    const sub = r.item.subject ? s.objects[r.item.subject.id] : undefined;
    return !!sub && sub.zone === "battlefield" && power(s, sub) > now;
  }
  // Eternity Vessel: "you may have your life total become the number of charge counters on ~": when that's more life.
  const set = e?.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "setLife" && e.effects[0]!.who.ref === "you" ? e.effects[0]! : undefined;
  if (r && set?.type === "setLife" && set.amount) return evalAmount(s, set.amount, { controller: pid, sourceId: r.item.sourceId }) > player(s, pid).life;
  // Wicked Guardian: "you may have it deal 2 damage to another creature you control. If you do, draw a card": only with a
  // creature that survives it.
  const [chosen, hurt] = e?.type === "may" && e.effects.length === 2 ? e.effects : [];
  if (r && chosen?.type === "pick" && chosen.action === "choose" && hurt?.type === "damage" && "ref" in hurt.to && hurt.to.ref === "created" && typeof hurt.amount === "number") {
    const n = hurt.amount;
    return pickOptions(s, chosen, pid, r.item.sourceId).some((id) => toughness(s, obj(s, id)) - (obj(s, id).damage ?? 0) > n);
  }
  // "You may get two rad counters" (Tato Farmer): milling ourselves, while the library and life can take it.
  if (e?.type === "may" && e.effects.length && e.effects.every((x) => x.type === "getRad" && x.who.ref === "you")) return player(s, pid).library.length >= 20 && player(s, pid).life >= 12;
  // Descendants' Fury: "you may sacrifice one of them. If you do, reveal cards ... until you reveal a creature card that
  // shares a creature type with the sacrificed creature": only a token of the group that has a creature type, which costs
  // little (our library's contents aren't known to us).
  const next = r?.body.effects[r.next + 1];
  if (r && e?.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "pick" && e.effects[0]!.fromGroup && e.effects[0]!.action === "sacrifice" && next?.type === "if" && next.effects.some((x) => x.type === "revealUntil" && x.sharesCreatureTypeWithSacrificed))
    return (r.item.event?.group ?? []).some((g) => {
      const o = s.objects[g.id];
      const kin = o?.zone === "battlefield" && o.isToken ? creatureTypesOf(s, o) : undefined;
      return kin === "all" || (!!kin && kin.size > 0);
    });
  // "You may discard your hand, then draw cards equal to ..." (Knollspine Dragon, Clive, Ifrit's Dominant): when it's
  // more cards than the hand.
  const [dis, draw] = e?.type === "may" && e.effects.length === 2 ? e.effects : [];
  if (r && dis?.type === "discard" && dis.hand && dis.who.ref === "you" && draw?.type === "draw" && draw.who.ref === "you") {
    const targets = r.item.targets ?? [];
    const players = (ref: PlayerRef) => (ref.ref === "you" ? [pid] : ref.ref === "target" ? targets.slice(ref.index, ref.index + 1).flatMap((t) => (t.kind === "player" ? [t.id] : [])) : []);
    return evalAmount(s, draw.n, { controller: pid, sourceId: r.item.sourceId, players }) > player(s, pid).hand.length;
  }
  // The Chain cards' copy (Chain of Vapor): only with a target of an opponent's worth it, and for a land only with lands
  // to spare (each copy can go on back and forth, so this ends it).
  if (r && e?.type === "eachMay" && e.chain) {
    // "They may copy ~", asked after the land is sacrificed: what it was for.
    if (r.scratch?.offer) return true;
    const spec = r.body.targets[0];
    const cost = e.effects[0]?.type === "pick";
    const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
    if (!spec || (cost && lands < 7)) return false;
    // Chain of Plasma's discard: only with cards to spare.
    if (e.effects[0]?.type === "discard" && player(s, pid).hand.length < 4) return false;
    // Chain Lightning, Chain of Smog: an opponent can be the copy's target too.
    // Chain of Smog's discard only at someone with cards left, so copying back and forth ends.
    const damage = r.body.effects.some((x) => x.type === "damage");
    const discard = r.body.effects.some((x) => x.type === "discard");
    if ((damage || discard) && legalTargets(s, spec, pid).some((t) => t.kind === "player" && t.id !== pid && (!discard || player(s, t.id).hand.length > 0))) return true;
    return legalTargets(s, spec, pid).some((t) => t.kind === "object" && controllerOf(s, obj(s, t.id)) !== pid && (!cost || defMv(defOf(s, obj(s, t.id))) >= 3));
  }
  // "Target opponent may have you draw three cards. If the player doesn't, you mill three cards, then ~ deals damage to
  // that player ..." (Combustible Gearhulk): the cards only when the other way could hurt too much; "defending player may
  // have you draw a card. If they do, ... remove it from combat" (Shakedown Heavy): when the attack hurts.
  const after = r?.body.effects[r.next + 1];
  if (r && e?.type === "eachMay" && !e.each && after?.type === "if" && after.cond.kind === "theyChose") {
    const life = player(s, pid).life;
    // Mtenda Lion: "defending player may pay {U}. If that player does, prevent all combat damage that would be dealt by
    // ~": always, it's cheap and the attacker is ours to fear.
    if (e.pay && !e.effects.length && !after.cond.not && after.effects.every((x) => x.type === "continuous" && x.what.ref === "self" && x.mods.every((m) => m.kind === "preventDamage" && m.by))) return true;
    // Shrouded Serpent: "If that player doesn't, ~ can't be blocked this turn": pay only with a creature that could block.
    if (e.pay && !e.effects.length && after.cond.not && after.effects.every((x) => x.type === "continuous" && x.what.ref === "self" && x.mods.every((m) => m.kind === "cantBeBlocked")))
      return s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && !obj(s, id).tapped && objIsType(s, obj(s, id), "Creature"));
    if (!after.cond.not) return life <= 20;
    // Wandering Archaic: "they may pay {2}. If they don't, you may copy that spell": pay, so it isn't copied.
    if (e.pay && !e.effects.length && allEffects(after.effects).some((x) => x.type === "copySpell")) return true;
    // Charismatic Conqueror: tap what entered unless it's a creature that may need to block.
    if (e.untappedSubject) {
      const sub = r.item.subject && s.objects[r.item.subject.id];
      return !!sub && !objIsType(s, sub, "Creature");
    }
    // Star Athlete: "its controller may sacrifice it. If they don't, ~ deals 5 damage to that player": a cheap
    // permanent, or everything when the damage would leave us low.
    const sac = e.effects.length === 1 && e.effects[0]!.type === "sacrifice" && e.effects[0]!.what.ref === "target" ? r.item.targets?.[e.effects[0]!.what.index] : undefined;
    if (sac?.kind === "object" && s.objects[sac.id]) return life <= 10 || worth(s, pid, s.objects[sac.id]!) <= 2;
    // Risk Factor: "may have ~ deal 4 damage to them. If that player doesn't, you draw three cards": the damage while it
    // leaves plenty of life.
    const hit = e.effects.length === 1 && e.effects[0]!.type === "damage" ? e.effects[0]! : undefined;
    if (hit?.type === "damage" && typeof hit.amount === "number") return life - hit.amount > 10;
    return allEffects(after.effects).some((x) => x.type === "damage" || x.type === "loseLife") ? life <= 15 : false;
  }
  // "Each opponent may sacrifice a nontoken creature of their choice. Each opponent who doesn't loses 2 life for each ..."
  // (Fandaniel): the creature when the life would hurt (a lot of it, or a quarter of what's left), a spare one sooner.
  if (r && e?.type === "eachMay" && e.each && e.need && after?.type === "loseLife" && after.who.ref === "notChoseThisWay") {
    const loss = evalAmount(s, after.n, { controller: r.item.controller, sourceId: r.item.sourceId });
    const life = player(s, pid).life;
    const sac = e.effects[0];
    const spare = sac?.type === "pick" && pickOptions(s, sac, pid, r.item.sourceId).some((id) => !obj(s, id).isCommander && worth(s, pid, obj(s, id)) <= 3);
    return loss >= life || loss * 4 >= life || (spare && loss >= 4);
  }
  // The Second Doctor: "each player may draw a card. Each opponent who does can't attack you ... during their next turn":
  // the card, unless that player is the only opponent left to attack.
  if (r && e?.type === "eachMay" && e.each && after?.type === "attackBanNextTurn" && pid !== r.item.controller) return opponents(s, pid).length > 1;
  // Requiem Monolith: "That creature's controller may have ~ deal 1 damage to it" (after it gained "whenever this creature
  // is dealt damage, you draw that many cards and lose that much life"): only if the creature survives it, with life and
  // cards to spare.
  const hurtOwn = r && e?.type === "eachMay" && !e.each && e.effects.length === 1 && e.effects[0]!.type === "damage" && "ref" in e.effects[0]!.to && e.effects[0]!.to.ref === "target" ? e.effects[0]! : undefined;
  if (r && hurtOwn?.type === "damage" && typeof hurtOwn.amount === "number" && "index" in hurtOwn.to) {
    const t = r.item.targets?.[hurtOwn.to.index];
    const o = t?.kind === "object" ? s.objects[t.id] : undefined;
    if (!o || o.zone !== "battlefield") return false;
    const me = player(s, pid);
    return toughness(s, o) - (o.damage ?? 0) > hurtOwn.amount && me.life > 10 + hurtOwn.amount && me.library.length > 3;
  }
  // Obeka, Brute Chronologist: "the player whose turn it is may end the turn": bots don't end their own turn early.
  if (r && e?.type === "eachMay" && e.effects.some((x) => x.type === "endTurn")) return false;
  // Farrel's Mantle, Gaze of Pain: our unblocked attacker deals its damage to the target creature instead of combat damage:
  // only to an opponent's creature it kills, and not when the combat damage would finish the player it's attacking.
  const instead = r && e?.type === "eachMay" && e.each && e.effects.some((x) => x.type === "noCombatDamage" && x.what.ref === "subject") ? e.effects.find((x) => x.type === "damage" && x.by === "subject") : undefined;
  if (r && instead?.type === "damage") {
    const t = r.item.targets?.[0];
    const victim = t?.kind === "object" ? s.objects[t.id] : undefined;
    const attacker = r.item.subject ? s.objects[r.item.subject.id] : undefined;
    if (!victim || victim.zone !== "battlefield" || !attacker || attacker.zone !== "battlefield" || controllerOf(s, victim) === pid) return false;
    const n = power(s, attacker) + (typeof instead.amount === "object" && "plus" in instead.amount ? Number(instead.amount.plus ?? 0) : 0);
    const kills = !objHasKeyword(s, victim, "Indestructible") && (objHasKeyword(s, attacker, "Deathtouch") || toughness(s, victim) - (victim.damage ?? 0) <= n);
    const finishes = attacker.attacking !== undefined && !attacker.attackingPermanent && player(s, attacker.attacking).life <= combatDamageOf(s, attacker);
    return kills && !finishes;
  }
  // The Oaths: what the first player may do is theirs (TargetSpec.outnumbers): Oath of Scholars' new hand only for a small
  // one, Oath of Druids' reveal only with a creature card left to find (else it mills the whole library); the rest always.
  if (r && e?.type === "eachMay" && e.each && r.body.targets[0]?.outnumbers) {
    if (e.effects.some((x) => x.type === "discard" && x.hand)) return player(s, pid).hand.length < 3;
    if (e.effects.some((x) => x.type === "revealUntil")) return player(s, pid).library.some((id) => isType(defOf(s, obj(s, id)), "Creature"));
    return true;
  }
  // Ley Line, Death Match: "that player may ..." to the target they chose for it (TargetSpec.chosenBy): only when it's
  // good for us, a counter on ours or -3/-3 on an opponent's.
  if (r && e?.type === "eachMay" && r.body.targets.length === 1 && r.body.targets[0]!.chosenBy) {
    const t = r.item.targets?.[0];
    // Pandemonium: damage to a player, only to an opponent of ours.
    if (t?.kind === "player") return harmsChosenTarget(r.body) ? t.id !== pid && !player(s, t.id).lost : t.id === pid;
    return !!t && t.kind === "object" && !!s.objects[t.id] && isMine(s, pid, t) !== harmsChosenTarget(r.body);
  }
  if (!r || e?.type !== "may") return true;
  // Phyrexian Dreadnought: keep it only by sacrificing other creatures worth less than it, together.
  const floor = e.keep && e.effects.length === 1 && e.effects[0]!.type === "pick" ? e.effects[0]!.minTotalPower : undefined;
  if (floor !== undefined) {
    const me = r.item.sourceId ? s.objects[r.item.sourceId] : undefined;
    const others = s.battlefield.filter((id) => id !== r.item.sourceId && controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
    const set = powerFloorSet(s, pid, others, floor);
    return !!set && !!me && me.zone === "battlefield" && set.reduce((t, id) => t + worth(s, pid, obj(s, id)), 0) < worth(s, pid, me);
  }
  // "Sacrifice it unless you discard a creature card", "discard two cards unless you discard an artifact card": the
  // smaller loss (only asked when it can be done).
  if (e.keep && e.otherwise?.some((x) => (x.type === "sacrifice" || x.type === "exile") && x.what.ref === "self") && e.effects.every((x) => x.type === "discard" || x.type === "pick")) return true;
  if (e.keep && e.otherwise?.length === 1 && e.otherwise[0]!.type === "discard" && e.effects.length === 1 && e.effects[0]!.type === "discard") return true;
  // Duplicity: swap our hand for the cards exiled with it when that's at least as many cards.
  if (e.effects.length === 1 && e.effects[0]!.type === "exileFaceDown" && e.effects[0]!.from === "hand") return linkedOwned(s, r.item.sourceId, pid) >= player(s, pid).hand.length;
  // Misleading Signpost: only to turn an attack away from us, or one of ours toward the opponent with the least life.
  if (e.effects.length === 1 && e.effects[0]!.type === "reselectAttack") {
    const t = r.item.targets?.find((x) => x.kind === "object");
    const o = t?.kind === "object" ? s.objects[t.id] : undefined;
    return !!o && reselectPick(s, pid, o) !== undefined;
  }
  // Demonstrate: a copy for us and one for one opponent, ahead of the other two (CR 702.144a).
  if (e.effects.length === 1 && e.effects[0]!.type === "copySpell" && e.effects[0]!.demonstrate) return true;
  // Hydroelectric Specimen: take an opponent's spell aimed at us or ours, not one of ours (or a helpful one) at theirs.
  const toSelf = e.effects.find((x) => x.type === "changeTarget" && x.toSelf);
  if (toSelf?.type === "changeTarget") {
    const t = r.item.targets?.[toSelf.index];
    const item = t?.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
    const current = item?.targets?.find((x) => x.kind !== "none");
    const body = item?.body ?? (item?.objectId ? castingBody(defOf(s, obj(s, item.objectId))) : undefined);
    return !!item && !!current && !!body && item.controller !== pid && isMine(s, pid, current) && !!harmfulTargets(body).some(Boolean);
  }
  const provoke = e.effects.find((x) => x.type === "mustBlockSource");
  if (provoke?.type === "mustBlockSource" && provoke.what.ref === "target") {
    const t = r.item.targets?.[provoke.what.index];
    const src = r.item.sourceId ? s.objects[r.item.sourceId] : undefined;
    return !!src && t?.kind === "object" && !!s.objects[t.id] && provokeGood(s, src, obj(s, t.id));
  }
  // Slicer, Hired Muscle: "you may have that player gain control of ~ until end of turn. If you do, ... goad it": only
  // while there's another opponent for it to attack (goaded, it attacks a player other than us if able, CR 701.15b).
  // Assault Suit: "... gain control of equipped creature until end of turn": the same, the creature it equips can't attack us.
  if (e.effects.length === 1 && e.effects[0]!.type === "continuous" && (e.effects[0]!.what.ref === "self" || e.effects[0]!.what.ref === "attached") && e.effects[0]!.giveTo?.ref === "eventPlayer" && e.effects[0]!.mods.some((m) => m.kind === "control"))
    return opponents(s, pid).filter((p) => p !== r.item.event?.player).length > 0;
  // Tanazir Quandrix: "you may have the base power and toughness of other creatures you control become equal to ~'s
  // power and toughness": only when that makes our other creatures bigger overall.
  const setAll = e.effects.length === 1 && e.effects[0]!.type === "continuous" && e.effects[0]!.what.ref === "each" && e.effects[0]!.mods.length === 1 && e.effects[0]!.mods[0]!.kind === "setPT" ? e.effects[0]! : undefined;
  if (setAll?.type === "continuous" && setAll.mods[0]!.kind === "setPT" && typeof setAll.mods[0]!.power === "object" && typeof setAll.mods[0]!.toughness === "object") {
    const ctx = { controller: pid, sourceId: r.item.sourceId };
    const [p, t] = [evalAmount(s, setAll.mods[0]!.power, ctx), evalAmount(s, setAll.mods[0]!.toughness, ctx)];
    const mine = s.battlefield.filter((id) => id !== r.item.sourceId && controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
    const base = (id: ObjectId) => {
      const c = characteristics(s, obj(s, id));
      const set = [...c.pt].reverse().find((x) => x.kind === "set");
      return set ? set.power + set.toughness : c.printedPower + c.printedToughness;
    };
    return mine.reduce((n, id) => n + p + t - base(id), 0) > 0;
  }
  // Scavenger's Talent: "you may sacrifice three other nonland permanents. If you do, return a creature card from your
  // graveyard to the battlefield": only when the best creature card there is worth more than the cheapest ones we'd give.
  const sacN = e.effects.length === 1 && e.effects[0]!.type === "pick" && e.effects[0]!.action === "sacrifice" && typeof e.effects[0]!.n === "number" && e.effects[0]!.n > 1 ? e.effects[0]! : undefined;
  const back = r.body.effects[r.next + 1];
  const reanimate = back?.type === "if" && back.cond.kind === "youDid" ? back.effects.find((x) => x.type === "chooseFromGraveyard" && x.dest === "battlefield") : undefined;
  if (sacN?.type === "pick" && reanimate) {
    const n = sacN.n as number;
    const given = pickOptions(s, sacN, pid, r.item.sourceId).map((id) => worth(s, pid, obj(s, id)) + (obj(s, id).isCommander ? 20 : 0)).sort((a, b) => a - b).slice(0, n);
    const size = (x: string | undefined) => (x !== undefined && /^\d+$/.test(x) ? Number(x) : 0);
    const best = Math.max(0, ...player(s, pid).graveyard.map((id) => defOf(s, obj(s, id))).filter((d) => d.types.includes("Creature")).map((d) => Math.max(1, size(d.power) + size(d.toughness), defMv(d)) + 1));
    return given.length === n && best > given.reduce((a, b) => a + b, 0);
  }
  const harm = harmfulTargets(r.body);
  const targets = r.item.targets ?? [];
  // Knight of the Mists: "you may pay {U}. If you don't, destroy target Knight": pay only when that would hit our own.
  // Without a target (Chaos Spewer's "If you don't, blight 2"), it's always ours: pay (below).
  if (e.pay && !e.effects.length && !e.keep && e.otherwise?.some((x) => allEffects([x]).some((y) => targetIndexOf(y) !== undefined))) {
    let hurt = 0;
    for (const inner of allEffects(e.otherwise)) {
      const i = targetIndexOf(inner);
      const t = i === undefined ? undefined : targets[i];
      if (i !== undefined && t && t.kind !== "none" && r.legal[i]) hurt += harm[i] === isMine(s, pid, t) ? 1 : -1;
    }
    return hurt > 0;
  }
  let v = 0;
  // "You may discard a card. If you do, draw a card": what follows counts too.
  const then = r.body.effects[r.next + 1];
  const follows = then?.type === "if" && then.cond.kind === "youDid" ? then.effects : [];
  for (const inner of allEffects([...e.effects, ...follows])) {
    if (inner.type === "may") continue;
    if (inner.type === "reflexive") {
      v += reflexiveWorth(s, pid, inner.body, r.item.sourceId);
      continue;
    }
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
    else if (inner.type === "pick" && inner.action === "sacrifice" && inner.who.ref === "you") {
      // "You may sacrifice a Zombie. If you do, draw a card": a token, a decayed creature or a spare land costs little.
      const options = pickOptions(s, inner, pid, r.item.sourceId).map((id) => obj(s, id)).filter((o) => !o.isCommander);
      const cost = (o: GameObject) => (o.isToken || objHasKeyword(s, o, "Decayed") ? 0.5 : objIsType(s, o, "Land") ? (lands(s, pid) >= 7 ? 0.5 : 3) : worth(s, pid, o) <= 3 ? 1.5 : 3);
      v -= options.length ? Math.min(...options.map(cost)) : 10;
    }
    else if (inner.type === "moveCounter") {
      // Graft: only onto our own creatures, and never the counter a 0/0 graft creature lives on (CR 704.5f).
      const to = r.item.subject && s.objects[r.item.subject.id];
      const from = r.item.sourceId ? s.objects[r.item.sourceId] : undefined;
      if (!to || controllerOf(s, to) !== pid) v -= 2;
      else if (from?.zone === "battlefield" && objIsType(s, from, "Creature") && toughness(s, from) - from.damage <= 1) v -= 2;
    }
    else v += 1;
  }
  return v >= 0;
}

/**
 * Whether a reflexive trigger ("When you do, ...", CR 603.12) is worth doing what triggers it: it needs a sensible mode
 * and sensible targets, chosen as it's put on the stack; with none, it's removed (CR 603.3c-d) and the payment is wasted.
 */
function reflexiveWorth(s: GameState, pid: PlayerId, body: AbilityBody, sourceId: ObjectId | undefined): number {
  if (body.modal) return chooseModes(s, pid, body, false, sourceId) ? 1 : -2;
  const t = body.targets.length ? chooseTargets(s, pid, body, false, sourceId) : [];
  if (!t || (body.targets.length && !t.some((x) => x.kind !== "none"))) return -2;
  // "When you do, ~ deals 2 damage to each creature" (Lithobraking): not when it hurts us more than the opponents.
  if (!body.targets.length && (groupValue(s, pid, body) ?? 1) <= 0) return -2;
  // Removal is worth a spare creature: on the same scale as what "you may sacrifice" costs (see wantsMay).
  return Math.max(1, modeValue(s, pid, body, t) / 3);
}

/** A permanent's printed worth, to compare what a copy effect would make it: size for creatures, else mana value. */
const defWorth = (d: CardDef) => (isType(d, "Creature") ? 3 * basePower(d) + baseToughness(d) : defMv(d));

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
  const legal = legalModes(s, body, pid, sourceId ? botSource(s, sourceId) : undefined, sourceId);
  const scored = m.modes
    .map((mode, i) => {
      if (!legal[i]) return null;
      const targets = mode.targets.length ? chooseTargets(s, pid, mode, false, sourceId) : [];
      return targets ? { i, value: modeValue(s, pid, mode, targets) } : null;
    })
    .filter((x): x is { i: number; value: number } => !!x && x.value > 0)
    .sort((a, b) => b.value - a.value);
  let modes = scored.slice(0, m.max).map((x) => x.i);
  if (m.pawprints && scored.length) {
    // Pawprints (CR 700.2i): the most useful modes again and again, as long as their pawprints fit.
    modes = [];
    for (let left = m.max, added = true; added; ) {
      added = false;
      for (const x of scored)
        if (m.pawprints[x.i]! <= left) {
          modes.push(x.i);
          left -= m.pawprints[x.i]!;
          added = true;
        }
    }
  } else if (m.repeat && scored.length) {
    // "You may choose the same mode more than once" (CR 700.2d): the useful modes in turn, until there are enough.
    // "Choose up to four" (Moment of Reckoning): each useful mode once, so no two of them aim at the same target.
    modes = m.min === 0 ? scored.slice(0, m.max).map((x) => x.i) : Array.from({ length: m.max }, (_, k) => scored[k % scored.length]!.i);
  }
  if (modes.length < m.min) {
    if (!forced) return null;
    const rest = legal.flatMap((ok, i) => (ok && !modes.includes(i) ? [i] : []));
    modes = [...modes, ...rest].slice(0, m.min);
  }
  // Nothing worth choosing: not cast or activated at all (a Season could be cast with no modes, rulings).
  if (!modes.length && (m.min > 0 || !forced)) return null;
  // `ranked`: the same modes, most useful first.
  return { ranked: [...modes], modes: modes.sort((a, b) => a - b) };
}

/** How much a permanent matters, for weighing effects on many at once. */
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
    // "Discards all cards of the chosen color" (Persecute) is aimed at someone else's hand.
    if (typeof o.type === "string") h = ["destroy", "exile", "bounce", "tap", "damage", "putInLibrary", "discard"].includes(o.type) || (o.type === "counters" && harmfulCounter(o.counter as string)) || (o.type === "continuous" && modsAreHarmful(o.mods as never));
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
  const n = kinds.has("number") ? groupNumber(s, pid, card) : undefined;
  if (n !== undefined) out = { ...out, number: n };
  return out;
}

/**
 * "Choose a number between 0 and 10. Destroy all creatures with power greater than or equal to the chosen number."
 * (Expel the Interlopers): the number its spell does the most good with (groupValue), the highest of equals.
 */
function groupNumber(s: GameState, pid: PlayerId, card: CardDef): number | undefined {
  const body = compileCard(card).spell;
  const range = body && allEffects(body.effects).flatMap((e) => (e.type === "choose" && e.choice === "number" && e.range ? [e.range] : []))[0];
  if (!body || !range) return undefined;
  let best: { n: number; v: number } | undefined;
  for (let n = range.max; n >= range.min; n--) {
    const v = groupValue(s, pid, body, { number: n }) ?? 0;
    if (!best || v > best.v) best = { n, v };
  }
  return best?.n;
}

/**
 * Name a creature type or color. Against opponents ("creatures of the chosen type get -1/-1"): what
 * they have most of. Otherwise our own most common creature type, or the color we use most (for
 * mana, the colors our commander needs).
 */
/**
 * "Gains your choice of menace or lifelink": on our own turn what helps it attack (damage and evasion), on an
 * opponent's what keeps it alive or wins a block.
 */
function chooseKeyword(s: GameState, pid: PlayerId, options: string[]): string {
  const ours = ["Double strike", "Flying", "Deathtouch", "Indestructible", "Trample", "Menace", "First strike", "Lifelink", "Hexproof", "Haste", "Vigilance", "Reach"];
  const theirs = ["Indestructible", "Hexproof", "Deathtouch", "First strike", "Double strike", "Lifelink", "Reach", "Flying", "Vigilance", "Trample", "Menace", "Haste"];
  const order = s.activePlayer === pid ? ours : theirs;
  const rank = (k: string) => (order.indexOf(k) < 0 ? order.length : order.indexOf(k));
  return [...options].sort((a, b) => rank(a) - rank(b))[0]!;
}

/**
 * "Choose a number" (Talion, Sanctum Prelate): the mana value (and, for Talion, power or toughness) most common among the
 * nonland cards the opponents have shown, on the battlefield and in graveyards. Sanctum Prelate's ban counts only
 * noncreature cards, and avoids the mana values of our own noncreature cards in hand. With nothing shown, 2.
 */
function chooseNumber(s: GameState, pid: PlayerId, c: CompiledCard | undefined, options: string[], card?: CardDef): string {
  const r = (s.pending?.kind === "chooseOption" && s.pending.numberRange) || { min: Number(options[0] ?? 0), max: Number(options[0] ?? 0) };
  // Rites of Initiation: cards discarded at random for +1/+0 each, so all of a small hand (three or fewer) while our creatures
  // are attacking, else none.
  if (s.resolving && /^Discard any number of cards at random\./.test(card?.oracleText ?? "")) {
    const attackers = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && obj(s, id).attacking !== undefined);
    return String(attackers && r.max <= 3 ? r.max : r.min);
  }
  // Squee's Revenge: "flip a coin that many times or until you lose a flip": two cards for each flip, only if all are won,
  // so the number with the most cards expected (2n x p^n, p a half, three quarters with Krark's Thumb), the smaller on a
  // tie, and not more than the library can give.
  const untilLoss = s.resolving ? allEffects(s.resolving.body.effects).find((e) => e.type === "flipCoin" && !!e.nAmount && !!e.untilLose) : undefined;
  if (untilLoss) {
    const p = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).flipTwo) ? 0.75 : 0.5;
    const most = Math.min(r.max, Math.max(r.min, Math.floor((player(s, pid).library.length - 1) / 2)));
    let best = Math.max(r.min, Math.min(1, most));
    for (let n = best; n <= most; n++) if (2 * n * p ** n > 2 * best * p ** best + 1e-9) best = n;
    return String(best);
  }
  // Yusri, Fortune's Flame: "choose a number between 1 and 5. Flip that many coins": each coin is a card won or 2 damage
  // lost, and only five won lets us cast from hand for free; all five while that much damage is safe, fewer as life runs
  // low, and no more draws than the library holds.
  if (s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "flipCoin" && !!e.nAmount)) {
    const me = player(s, pid);
    const n = Math.min(me.life > 20 ? 5 : me.life > 12 ? 3 : 1, Math.max(1, me.library.length - 1));
    return String(Math.max(r.min, Math.min(r.max, n)));
  }
  // Shapeshifter: power the number, toughness 7 minus it, kept until our next upkeep: 4/3 while no opponent's creature
  // could kill it in combat, else 3/4.
  if (c && JSON.stringify(c.statics).includes('"selfChosenNumber"')) {
    const big = s.battlefield.some((id) => {
      const o = obj(s, id);
      return controllerOf(s, o) !== pid && objIsType(s, o, "Creature") && power(s, o) >= 3;
    });
    return String(Math.max(r.min, Math.min(r.max, big ? 3 : 4)));
  }
  // Scrying Glass: "exactly the chosen number of cards of the chosen color" in a hand we can't see: one is the likeliest.
  if (s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "choose" && !!e.maxHandOf)) return String(r.min);
  // Mindblaze: a Commander deck has one of each nonland card, so one is the number.
  if (s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "choose" && !!e.maxLibraryOf)) return String(r.min);
  // A resolving spell's own "choose a number" (Expel the Interlopers).
  const forSpell = s.resolving && card ? groupNumber(s, pid, card) : undefined;
  if (forSpell !== undefined) return String(forSpell);
  const ban = !!c?.noncreatureChosenMvCantBeCast;
  const tally = new Map<number, number>();
  const add = (n: number | undefined, w: number) => n !== undefined && Number.isFinite(n) && tally.set(n, (tally.get(n) ?? 0) + w);
  const count = (d: CardDef, w: number) => {
    if (isType(d, "Land") || (ban && isType(d, "Creature"))) return;
    add(defMv(d), w);
    if (!ban && isType(d, "Creature")) for (const v of [d.power, d.toughness]) if (v && /^\d+$/.test(v)) add(Number(v), w);
  };
  for (const p of s.players) {
    if (p.id === pid || p.lost) continue;
    for (const id of p.graveyard) count(defOf(s, obj(s, id)), 1);
  }
  for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) !== pid) count(defOf(s, obj(s, id)), 1);
  if (ban) for (const id of player(s, pid).hand) count(defOf(s, obj(s, id)), -3);
  let best = Math.max(r.min, Math.min(r.max, 2));
  for (const [n, w] of tally) if (n >= r.min && n <= r.max && w > (tally.get(best) ?? 0)) best = n;
  return String(best);
}

/** Turnabout's first option (oracle/body.ts). */
const TURNABOUT_TAP = "Tap all its untapped permanents of the chosen type";

/**
 * "Choose odd or even": while a spell or ability resolves (Extinction Event, Twins of Discord, Zimone's Hypothesis), the
 * quality whose creatures are worth more to opponents than to us; as a permanent enters (Ashling's Prerogative, Gollum),
 * the quality of most of our own creature cards' mana values.
 */
function chooseParity(s: GameState, pid: PlayerId, card?: CardDef): string {
  const odd = (n: number) => Math.abs(n) % 2 === 1;
  // Lavabrink Venturer: protection from the quality most of the opponents' creatures have (tokens' mana value is 0, even).
  if (card && JSON.stringify(compileCard(card).statics).includes(CHOSEN_PARITY_PROTECTION)) {
    const theirs = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) !== pid && objIsType(s, o, "Creature"));
    return theirs.filter((o) => odd(characteristics(s, o).manaValue ?? 0)).length > theirs.length / 2 ? "odd" : "even";
  }
  const r = s.resolving;
  if (r) {
    const f = allEffects(r.body.effects).map((e) => ("what" in e && e.what && typeof e.what === "object" && "filter" in e.what ? e.what.filter : "filter" in e ? e.filter : undefined)).find((x): x is TargetSpec => !!x && typeof x === "object" && !!(x as TargetSpec).parity);
    const of = f?.parity?.of ?? "manaValue";
    const score = (want: boolean) => s.battlefield.reduce((n, id) => {
      const o = obj(s, id);
      if (!objIsType(s, o, "Creature") || id === r.item.sourceId || odd(of === "power" ? power(s, o) : defMv(defOf(s, o))) !== want) return n;
      return n + (controllerOf(s, o) === pid ? -1 : 1) * worth(s, pid, o);
    }, 0);
    return score(true) >= score(false) ? "odd" : "even";
  }
  const mine = [...player(s, pid).hand, ...s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid)].map((id) => defOf(s, obj(s, id))).filter((d) => isType(d, "Creature"));
  return mine.filter((d) => odd(defMv(d))).length > mine.length / 2 ? "odd" : "even";
}

/** World Queller's edict: each player sacrifices their least worthy permanent of the type, ours counting against it. */
function edictTypeScore(s: GameState, pid: PlayerId, ty: string): number {
  return s.turnOrder.filter((p) => !s.players[p]!.lost).reduce((n, p) => {
    const ws = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === p && characteristics(s, o).types.includes(ty)).map((o) => Math.max(1, worth(s, pid, o)));
    return ws.length ? n + (p === pid ? -1 : 1) * Math.min(...ws) : n;
  }, 0);
}
const edictsChosenType = (s: GameState) => !!s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "pick" && e.action === "sacrifice" && e.filter.chosen === "cardType");

function chooseOption(s: GameState, pid: PlayerId, what: ChoiceKind, card: CardDef | undefined, options: string[]): string {
  if (what === "parity") return chooseParity(s, pid, card);
  // Order of Succession: the direction whose next player has the best creature for us to take (someone takes ours
  // either way).
  if (what === "direction" && s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "successionControl")) {
    const best = (side: "left" | "right") => {
      const p = nearestOpponent(s, pid, side);
      return Math.max(0, ...s.battlefield.map((id) => obj(s, id)).filter((o) => p !== undefined && controllerOf(s, o) === p && objIsType(s, o, "Creature")).map((o) => worth(s, pid, o)));
    };
    return best("right") > best("left") ? "right" : "left";
  }
  // Aminatou, the Fateshifter: the direction whose next player has the most worth taking (ours go the other way either
  // way).
  if (what === "direction" && s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "rotateControl")) {
    const gain = (side: "left" | "right") => {
      const p = nearestOpponent(s, pid, side);
      return s.battlefield.map((id) => obj(s, id)).filter((o) => p !== undefined && o.id !== s.resolving!.item.sourceId && controllerOf(s, o) === p && !objIsType(s, o, "Land")).reduce((n, o) => n + worth(s, pid, o), 0);
    };
    return gain("right") > gain("left") ? "right" : "left";
  }
  // Pramikon, Teyo: the direction whose player who could attack us then has the least creature power.
  if (what === "direction") {
    const threat = (side: "left" | "right") =>
      s.turnOrder
        .filter((p) => p !== pid && !player(s, p).lost && nearestOpponent(s, p, side) === pid)
        .reduce((n, p) => n + s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === p && objIsType(s, o, "Creature")).reduce((m, o) => m + Math.max(0, power(s, o)), 0), 0);
    return threat("right") < threat("left") ? "right" : "left";
  }
  // Rite of Ruin: the order costing opponents the most and us the least, each player losing the cheapest of what they have of
  // each type, one, two, then three of them (a permanent of two of the types counted for both: a rough guess).
  if (what === "typeOrder") {
    const loss = (p: PlayerId, ty: string, n: number) => s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === p && characteristics(s, o).types.includes(ty)).map((o) => Math.max(1, worth(s, pid, o))).sort((a, b) => a - b).slice(0, n).reduce((a, b) => a + b, 0);
    const score = (order: string) => order.split(",").reduce((v, ty, i) => v + s.turnOrder.filter((p) => !player(s, p).lost).reduce((m, p) => m + (p === pid ? -1.5 : 1) * loss(p, ty, i + 1), 0), 0);
    return [...options].sort((a, b) => score(b) - score(a))[0]!;
  }
  // Abundant Harvest: a land while short of lands (fewer than five on the battlefield and in hand), else a spell.
  if (what === "landOrNonland") {
    const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length + player(s, pid).hand.filter((id) => isType(defOf(s, obj(s, id)), "Land")).length;
    return lands < 5 ? "land" : "nonland";
  }
  // Sarpadian Empires, Vol. VII: the creature type most of its creatures have (a tribal payoff), else the first pair.
  if (what === "colorAndType") {
    const mine = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid && objIsType(s, o, "Creature"));
    const score = (opt: string) => mine.filter((o) => characteristics(s, o).subtypes.includes(opt.split(" ")[1]!)).length;
    return [...options].sort((a, b) => score(b) - score(a))[0]!;
  }
  if (what === "number") return chooseNumber(s, pid, card ? compileCard(card) : undefined, options, card);
  // Illusionary Presence, Barbarian Guides, Traveler's Cloak, Giant Slug: landwalk of the chosen type, so the type most
  // opponents control a land of (a snow one for snow landwalk).
  if ((what === "landType" || what === "basicLandType") && /landwalk of the chosen type/.test(card?.oracleText ?? "")) return chooseLandwalkType(s, pid, options, /snow landwalk of the chosen type/.test(card?.oracleText ?? ""));
  // Roots of Life: life whenever a land of the chosen type an opponent controls becomes tapped, so the type most opponents
  // control a land of.
  if (what === "basicLandType" && /land of the chosen type an opponent controls/.test(card?.oracleText ?? "")) return chooseLandwalkType(s, pid, options, false);
  if (what === "basicLandType" || what === "landType") return chooseLandType(s, pid, options);
  if (what === "keyword") return chooseKeyword(s, pid, options);
  // "The color or colors of your choice": one color is enough, the one it would choose alone.
  if (what === "colors") return chooseOption(s, pid, "color", card, options);
  const c = card ? compileCard(card) : undefined;
  // Serra's Emissary: protection from creatures for you and yours shuts off most attacks and blockers.
  if (what === "cardType" && c?.youProtectedFromChosenType && options.includes("Creature")) return "Creature";
  // Pippin: protection from the type of the opponent's spell or ability about to resolve, or else from creatures.
  if (what === "cardType" && c && JSON.stringify(c).includes(CHOSEN_TYPE_PROTECTION)) {
    const top = [...s.stack].reverse().find((x) => x.controller !== pid && x.objectId && s.objects[x.objectId]);
    const ty = top ? defOf(s, obj(s, top.objectId!)).types.find((x) => options.includes(x)) : undefined;
    return ty ?? (options.includes("Creature") ? "Creature" : options[0]!);
  }
  // Turnabout: an opponent's untapped permanents to tap, or our own tapped ones to untap, the type with the most worth.
  const turnabout = s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "either" && e.labels[0] === TURNABOUT_TAP);
  const tp = s.resolving?.item.targets?.[0];
  if (what === "cardType" && turnabout && tp?.kind === "player") {
    const score = (ty: string) => s.battlefield.reduce((n, id) => {
      const o = obj(s, id);
      return controllerOf(s, o) === tp.id && characteristics(s, o).types.includes(ty) && !!o.tapped === (tp.id === pid) ? n + Math.max(1, worth(s, pid, o)) : n;
    }, 0);
    return [...options].sort((a, b) => score(b) - score(a))[0]!;
  }
  // Creeping Renaissance: "Return all cards of the chosen type from your graveyard to your hand": the type with the most
  // cards there, a land worth half a spell.
  const regrow = s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "returnAllFromGraveyard" && e.filter.chosen === "cardType");
  if (what === "cardType" && regrow) {
    const score = (ty: string) => s.players[pid]!.graveyard.reduce((n, id) => (defOf(s, obj(s, id)).types.includes(ty) ? n + (ty === "Land" ? 0.5 : 1) : n), 0);
    return [...options].sort((a, b) => score(b) - score(a))[0]!;
  }
  // Archon of Valor's Reach: no one can cast spells of the chosen type, so the type of the fewest of our own cards still to
  // cast (in hand, library and command zone).
  if (what === "cardType" && c?.cantBeCast?.some((b) => b.filter.chosen === "cardType")) {
    const mine = [...player(s, pid).hand, ...player(s, pid).library, ...player(s, pid).command].map((id) => defOf(s, obj(s, id)));
    const score = (ty: string) => mine.filter((d) => d.types.includes(ty)).length;
    return [...options].sort((a, b) => score(a) - score(b))[0]!;
  }
  if (what === "cardType" && edictsChosenType(s)) return [...options].sort((a, b) => edictTypeScore(s, pid, b) - edictTypeScore(s, pid, a))[0]!;
  if (what === "cardType") {
    // "Destroy all permanents of the chosen type": the type that costs the opponents the most, net of what we'd lose.
    const hurts = c ? choiceHurts(c) : true;
    // Teferi's Realm: a non-Aura enchantment is an enchantment that isn't an Aura.
    const isOf = (o: GameObject, ty: string) => (ty === NON_AURA_ENCHANTMENT ? characteristics(s, o).types.includes("Enchantment") && !characteristics(s, o).subtypes.includes("Aura") : characteristics(s, o).types.includes(ty));
    const score = (ty: string) => s.battlefield.reduce((n, id) => {
      const o = obj(s, id);
      if (!isOf(o, ty)) return n;
      return n + (controllerOf(s, o) === pid ? -1 : 1) * (hurts ? 1 : -1) * Math.max(1, worth(s, pid, o));
    }, 0);
    return [...options].sort((a, b) => score(b) - score(a))[0]!;
  }
  // Darigaaz, the Igniter: damage for each card of the chosen color in the damaged player's hand, so the color most of
  // the cards they've shown have (their nonland permanents, graveyard and commander), not knowing their hand. Scrying
  // Glass: the same for the target opponent's hand.
  const handOf = s.resolving?.item.event?.player ?? (s.resolving && allEffects(s.resolving.body.effects).some((e) => e.type === "choose" && !!e.maxHandOf) ? (s.resolving.item.targets ?? []).flatMap((t) => (t?.kind === "player" ? [t.id] : []))[0] : undefined);
  if (what === "color" && /cards of that color revealed this way|cards of the chosen color/.test(card?.oracleText ?? "") && handOf !== undefined) {
    const them = handOf;
    const shown = new Map<string, number>();
    const add = (d: CardDef) => !isType(d, "Land") && d.colors.forEach((col) => shown.set(COLOR_NAMES[col], (shown.get(COLOR_NAMES[col]) ?? 0) + 1));
    for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === them) add(defOf(s, obj(s, id)));
    for (const id of [...player(s, them).graveyard, ...player(s, them).command]) add(defOf(s, obj(s, id)));
    return [...options].sort((a, b) => (shown.get(b) ?? 0) - (shown.get(a) ?? 0))[0]!;
  }
  // Selective Obliteration: the color of our own most worthy monocolored permanents, the ones it would spare.
  if (what === "color" && c && JSON.stringify(c.spell ?? null).includes('"notOnlyControllersColor":true')) {
    const kept = new Map<string, number>();
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const cols = characteristics(s, o).colors;
      if (controllerOf(s, o) === pid && cols.length === 1) kept.set(COLOR_NAMES[cols[0]!], (kept.get(COLOR_NAMES[cols[0]!]) ?? 0) + Math.max(1, worth(s, pid, o)));
    }
    return [...options].sort((a, b) => (kept.get(b) ?? 0) - (kept.get(a) ?? 0))[0]!;
  }
  // Protection from the chosen color is against what opponents have, above all the spell or ability
  // that's about to resolve against us.
  const protects = !!c && what === "color" && (JSON.stringify(c).includes(CHOSEN_PROTECTION) || JSON.stringify(c).includes(CHOSEN_HEXPROOF));
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
  // "Returns all creature cards of a type chosen this way from their graveyard" (Patriarch's Bidding), "return up to two
  // creature cards of that type from your graveyard" (Haunting Voyage): what's in ours.
  const fromYard = what === "creatureType" && !!c && allEffects([...(c.spell?.effects ?? []), ...c.triggers.flatMap((t) => t.body.effects)]).some((e) => (e.type === "returnAllFromGraveyard" && (e.filter.chosen === "typesChosen" || e.filter.chosen === "type")) || (e.type === "chooseFromGraveyard" && !e.who && e.filter?.chosen === "type"));
  if (fromYard)
    for (const id of player(s, pid).graveyard) {
      const d = defOf(s, obj(s, id));
      if (d.types.includes("Creature")) d.subtypes.forEach((st) => count(st, 3 + defMv(d)));
    }
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? options[0]!;
}

/**
 * Name a card (CR 201.4), from what it's for (NamePurpose) and only what this player could know: its own cards, and
 * the cards other players have shown (on the battlefield, in graveyards, face up in exile, commanders, spells).
 */
function chooseCardName(s: GameState, pid: PlayerId, pend: Extract<PendingDecision, { kind: "chooseOption" }>): string {
  const options = new Set(pend.options);
  const nameOf = (o: GameObject) => defOf(s, o).name;
  const tally = (ids: readonly ObjectId[]) => {
    const n = new Map<string, number>();
    for (const id of ids) {
      const o = s.objects[id];
      if (o && !o.isToken && options.has(nameOf(o))) n.set(nameOf(o), (n.get(nameOf(o)) ?? 0) + 1);
    }
    return n;
  };
  const most = (n: Map<string, number>) => [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const me = player(s, pid);
  const mine = new Set([...me.hand, ...me.library, ...me.graveyard, ...me.command, ...s.battlefield.filter((id) => obj(s, id).owner === pid)].map((id) => nameOf(obj(s, id))));
  const best = (ids: readonly ObjectId[], score: (o: GameObject) => number) => {
    let pick: string | undefined;
    let top = -Infinity;
    for (const id of ids) {
      const o = s.objects[id];
      if (!o || o.isToken || o.faceDown || !options.has(nameOf(o))) continue;
      const v = score(o);
      if (v > top) [pick, top] = [nameOf(o), v];
    }
    return pick;
  };
  const value = (o: GameObject) => defMv(defOf(s, o)) + (isType(defOf(s, o), "Land") ? -5 : 0);
  if (pend.purpose === "guess") {
    // The top card of a library: our own most common card left there; someone else's, what they've shown most of.
    const who = pend.of ?? pid;
    const seen = who === pid ? me.library : [...s.battlefield.filter((id) => obj(s, id).owner === who), ...player(s, who).graveyard];
    return most(tally(seen)) ?? pend.options[0]!;
  }
  if (pend.purpose === "guessHand") return most(tally(me.hand)) ?? pend.options[0]!;
  // Mindblaze: a card in that library. Ours we know; another player's, a card of theirs not yet seen anywhere (one they
  // have shown is out of their library in a singleton deck) is all there is to go on.
  if (pend.purpose === "inLibrary") {
    const who = pend.of ?? pid;
    if (who === pid) return best(me.library, value) ?? pend.options[0]!;
    const seen = new Set([...s.battlefield.filter((id) => obj(s, id).owner === who), ...player(s, who).graveyard, ...player(s, who).command, ...player(s, who).exile.filter((id) => !obj(s, id).faceDown)].map((id) => nameOf(obj(s, id))));
    return pend.options.find((n) => !seen.has(n) && !mine.has(n)) ?? pend.options[0]!;
  }
  if (pend.purpose === "find") return best(me.library, value) ?? pend.options[0]!;
  // The Clone Saga: our biggest creature that can attack this turn, else the biggest one.
  if (pend.purpose === "ownCreature") {
    const board = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
    const ready = board.filter((id) => !obj(s, id).tapped && !isSummoningSick(s, obj(s, id)));
    return best(ready.length ? ready : board, (o) => power(s, o)) ?? best([...me.hand, ...me.library], value) ?? pend.options[0]!;
  }
  if (pend.purpose === "own") return best([...me.hand, ...me.library], (o) => value(o) + (o.zone === "hand" ? 10 : 0)) ?? pend.options[0]!;
  const opps = pend.purpose === "theirs" && pend.of !== undefined && pend.of !== pid ? [pend.of] : opponents(s, pid);
  const shown = opps.flatMap((x) => [...player(s, x).command, ...player(s, x).graveyard, ...player(s, x).exile.filter((id) => !obj(s, id).faceDown), ...s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === x)]);
  const card = pend.objectId ? compileCard(defOf(s, obj(s, pend.objectId))) : undefined;
  const silences = !!card?.nameBans?.some((b) => b.kind === "activate") || !!card?.activationTaxes;
  const pick = best(shown, (o) => {
    let v = value(o) - (mine.has(nameOf(o)) ? 20 : 0);
    // A commander comes back again and again; an activated ability matters most to what stops activations.
    if (o.zone === "command") v += 8;
    // A hand, graveyard and library are what "theirs" reaches (Cabal Therapy, Memoricide): a singleton deck's card already
    // on the battlefield or in the command zone has no other copy there, but one in the graveyard is exiled with them.
    if (pend.purpose === "theirs") v += o.zone === "graveyard" ? 6 : -14;
    if (silences) v += o.zone === "battlefield" && abilitiesOf(s, o).activated.some((a) => !a.mana) ? 15 : -10;
    return v;
  });
  return pick ?? pend.options.find((n) => !mine.has(n)) ?? pend.options[0]!;
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
      // Cyber Conversion: an opponent's creature becomes a vanilla 2/2 (CR 708.2).
      case "turnFaceDown":
        v += e.what.ref === "target" ? 6 : 0;
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
      case "eachDealsDamage": {
        // "Each creature deals 1 damage to its controller": life off each player, by how many of them they control.
        if (e.what.ref !== "each" || e.to) break;
        const f = e.what.filter;
        // Sarkhan the Mad: each one's power to the target, worth it at an opponent.
        if (e.recipient) {
          const t = "index" in e.recipient ? targets[e.recipient.index] : undefined;
          const hurtsFoe = t?.kind === "player" ? t.id !== pid : t?.kind === "object" ? controllerOf(s, obj(s, t.id)) !== pid : false;
          for (const id of s.battlefield) if (objectMatches(s, f, obj(s, id), pid, false)) v += (hurtsFoe ? 1 : -1) * power(s, obj(s, id));
          break;
        }
        for (const id of s.battlefield) if (objectMatches(s, f, obj(s, id), pid, false)) v += (controllerOf(s, obj(s, id)) === pid ? -1 : 1) * estimate(e.amount);
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
      case "exchangeLife": {
        // The life we'd gain (or lose) by taking the other player's total.
        const who = (r: typeof e.a) => {
          const t = r.ref === "target" ? targets[r.index] : undefined;
          return r.ref === "you" ? pid : t?.kind === "player" ? t.id : undefined;
        };
        const [a, b] = [who(e.a), who(e.b)];
        if (a !== undefined && b !== undefined && e.maxDiff !== undefined && Math.abs(player(s, a).life - player(s, b).life) > e.maxDiff) break;
        if (a === pid && b !== undefined) v += (player(s, b).life - player(s, pid).life) / 2;
        else if (b === pid && a !== undefined) v += (player(s, a).life - player(s, pid).life) / 2;
        break;
      }
      case "createToken":
        v += e.who.ref === "you" ? 3 * estimate(e.n) : 0;
        break;
      case "counters":
        v += e.counter === "+1/+1" ? 2 * estimate(e.n) : 3 * estimate(e.n);
        break;
      case "counterSpell":
        v += 9;
        break;
      // Jhoira of the Ghitu: a card we can't afford now, cast for free in a few turns.
      case "suspendCard":
        v += 4;
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
/** `upTo`: "discard any number of cards" (then draw that many): only the cards hardly worth keeping. */
function chooseDiscards(s: GameState, pid: PlayerId, count: number, except?: string, filter?: TargetSpec, upTo?: boolean, among?: string[]): string[] {
  const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  const keepScore = (id: string) => {
    const d = defOf(s, obj(s, id));
    if (isType(d, "Land")) return lands >= 6 ? 0 : 10 - lands;
    return 8 - Math.max(0, mv(s, id) - lands);
  };
  return player(s, pid)
    .hand.filter((id) => id !== except && (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (!among || among.includes(id)) && (!upTo || keepScore(id) <= 2))
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
  if (o.zone !== "battlefield") return defMv(d) + (isType(d, "Creature") ? 2 * (Number.parseInt(d.power ?? "0", 10) || 0) : 0) + (o.isCommander ? 10 : 0);
  if (!objIsType(s, o, "Creature")) return 5 + defMv(d) - (harmful && wardCosts(s, pid, [t]).length ? 15 : 0);
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

/** With `mv`: the group is the others with the same mana value (Mists of Lórien), not the same name. */
type SameNameGroup = NonNullable<Extract<ObjRef, { ref: "target" }>["sameName"]> & { mv?: true };

/** The "and all other ... with the same name" (or mana value) group an effect gives target `i`, if any (Maelstrom Pulse). */
function sameNameGroup(body: AbilityBody, i: number): SameNameGroup | undefined {
  const walk = (v: unknown): SameNameGroup | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const r = v as { ref?: string; index?: number; sameName?: SameNameGroup; sameMv?: { filter: TargetSpec } };
    if (r.ref === "target" && r.index === i && r.sameName) return r.sameName;
    if (r.ref === "target" && r.index === i && r.sameMv) return { ...r.sameMv, mv: true };
    for (const x of Object.values(v)) {
      const g = walk(x);
      if (g) return g;
    }
    return undefined;
  };
  return walk(body.effects);
}

/**
 * A harmful "target X and all other Xs with the same name" target: the one where what it hits of the opponents' is worth
 * the most more than what it hits of ours. Unless `forced`, nothing that costs us as much as it gains.
 */
function bestGroupTarget(s: GameState, pid: PlayerId, pool: ChosenTarget[], group: SameNameGroup, damage: number, forced: boolean): ChosenTarget | undefined {
  const value = (t: ChosenTarget) => {
    if (t.kind !== "object") return targetWorth(s, pid, t, true, damage);
    const hit = [obj(s, t.id), ...(group.mv ? sameManaValued(s, obj(s, t.id), group, pid) : sameNamed(s, obj(s, t.id), group, pid))];
    // Damage that doesn't kill one of ours costs us nothing; one of theirs it doesn't kill gains us nothing.
    return hit.reduce((n, o) => {
      const w = Math.max(0, targetWorth(s, pid, { kind: "object", id: o.id }, true, damage));
      return controllerOf(s, o) === pid ? n - w : n + w;
    }, 0);
  };
  const ranked = pool.map((t) => ({ t, v: value(t) })).sort((a, b) => b.v - a.v);
  return ranked[0] && (forced || ranked[0].v > 0) ? ranked[0].t : undefined;
}

/** How many times a bot activates one ability in a turn at most, so it can't go round a loop forever. */
const BOT_LOOP_LIMIT = 8;

/** Mechtitan Core's ability: this permanent and other permanents exiled to make a 10/10 or bigger token. */
const makesTitan = (ab: ActivatedAbility) => !!ab.exileSelf && ab.body.effects.some((e) => e.type === "createToken" && (e.token.power ?? 0) >= 10) && !!ab.costs?.some((c) => c.kind === "sacrifice" && c.exile && c.other);

function chooseActivation(s: GameState, pid: PlayerId, only?: (ab: ActivatedAbility) => boolean): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    // An energy-for-a-target ability before the others ("{1}, {T}: You get {E}" would spend the permanent first, HELIOS One).
    const order = abilities.map((_, i) => i).sort((a, b) => Number(!!abilities[b]!.energyX) - Number(!!abilities[a]!.energyX));
    for (const i of order) {
      const ab = abilities[i]!;
      if (only && !only(ab)) continue;
      // Mana abilities are for paying costs (autopay), not used on their own: the mana would just empty.
      if (ab.mana) continue;
      // Fractured Powerstone's planar die outside Planechase: nothing to gain.
      if (ab.body.effects.every((e) => e.type === "noEffect")) continue;
      // Keep our permanents (but cash in Food and Clues), and avoid free loops.
      const cashIn = ab.sacrificeSelf && o.isToken && !objIsType(s, o, "Creature");
      // A cost of nothing, "{0}" included, could be paid over and over.
      // Removing named counters (spore, charge) runs out; removing +1/+1 counters shrinks the creature, so not for free.
      // Removing all of them (Sage of Hours) can't loop either: it's weighed below.
      const freeCost = !ab.tap && !manaValue(parseManaCost(ab.manaCost)) && !parseManaCost(ab.manaCost).hasX && !ab.costs?.length && !(ab.removeCounters && (ab.removeCounters.all || !/^[+-]1\/[+-]1$/.test(ab.removeCounters.counter)));
      // A coin flip's own cost is weighed with what winning and losing do (flipWorth).
      const flips = flipBranches(ab.body);
      // Necropotence's "Pay 1 life: ... into your hand at your next end step": a few cards a turn while life is plentiful.
      const necro = !!ab.lifeCost && ab.body.effects.some((e) => e.type === "exileFaceDown" && e.endStepHand) && player(s, pid).life >= 20 && (o.activatedThisTurn?.filter((n) => n === i).length ?? 0) < 3;
      // Dauthi Voidwalker: sacrificed in our main phase, with the stack empty, for an exiled spell with a void counter
      // worth more than it (mana value 4 or more) to cast for free right away.
      const voidPlay = ab.sacrificeSelf && ab.body.effects.some((e) => e.type === "playExiled") && s.activePlayer === pid && (s.step === "main1" || s.step === "main2") && !s.stack.length && voidSpells(s, pid, ab.body).some((c) => mv(s, c) >= 4);
      // "Pay X {E}, Sacrifice this land: Destroy target nonland permanent with mana value X" (HELIOS One), "..., Return this
      // enchantment to its owner's hand: Return target creature card with mana value X" (Chthonian Nightmare): the
      // permanent is given up for a target with mana value 3 or more, paid for in energy (see energyTargetX).
      const xTarget = !!ab.energyX && ab.body.targets.some((t) => t.xRange?.key === "manaValue");
      const energyTargetX = xTarget ? Math.min(player(s, pid).energy ?? 0, 15) : 0;
      if (((ab.sacrificeSelf && !cashIn && !flips && !voidPlay) || ab.returnSelf) && !(energyTargetX >= 3)) continue;
      // "Sacrifice Blazing Torch" in an ability the Equipment gives: keep the Equipment too.
      if (ab.grantSourceCost?.action === "sacrifice") continue;
      // Mechtitan Core: itself and four others exiled for a 10/10, in our main phase with the stack empty (and only when
      // those four have less total power than the token, below).
      const titan = makesTitan(ab) && s.activePlayer === pid && (s.step === "main1" || s.step === "main2") && !s.stack.length;
      // Craft: in our main phase with the stack empty, the back face being the point of it (materials: abilityCosts).
      const craft = ab.keyword === "Craft" && s.activePlayer === pid && (s.step === "main1" || s.step === "main2") && !s.stack.length;
      if ((ab.exileSelf && !titan && !craft) || (freeCost && !necro) || ab.station) continue;
      // "Pay half your life, rounded up" (Murderous Betrayal, Lurking Evil): only while that's a few life at most.
      if (halfLifeCost(s, pid, ab) > 3) continue;
      if (lifeSwapHurts(s, pid, ab.body.effects)) continue;
      // Goblin Test Pilot: a target chosen at random might be us or ours.
      if (ab.body.targets.some((x) => x.random)) continue;
      // The Deck of Many Things: "roll a d20 and subtract the number of cards in your hand. If the result is 0 or less,
      // discard your hand": with more than three cards in hand, the risk outweighs what the roll brings.
      if (ab.body.effects.some((e) => e.type === "if" && e.cond.kind === "rollIn" && e.cond.max !== undefined && e.cond.max <= 0 && e.effects.some((x) => x.type === "discard" && x.hand)) && player(s, pid).hand.length > 3) continue;
      // Level up (CR 702.87a) past the last level symbol does nothing more.
      if (ab.body.effects.some((e) => e.type === "counters" && e.counter === "level") && (o.counters.level ?? 0) >= lastStriation(s, o, "level")) continue;
      // Bots don't propose shortcuts (CR 732.2a): one that has found a loop goes round it only so many times a turn.
      if ((o.activatedThisTurn?.filter((n) => n === i).length ?? 0) >= BOT_LOOP_LIMIT) continue;
      // Dragon Whelp: not a fourth time, which would sacrifice it at the end step.
      if (ab.body.effects.some((e) => e.type === "if" && e.cond.kind === "activatedTimes" && (o.activatedThisTurn?.filter((n) => n === i).length ?? 0) >= e.cond.n - 1)) continue;
      if (o.attachedTo && ab.body.effects.some((e) => e.type === "attach")) continue; // already equipped
      // Aura swap (CR 702.65a): only with an Aura card in hand that could take its place.
      if (ab.body.effects.some((e) => e.type === "putFromHand" && e.auraSwap) && !(o.attachedTo && player(s, pid).hand.some((h) => defOf(s, obj(s, h)).subtypes.includes("Aura") && auraHostOptions(s, obj(s, h), pid).some((x) => "attachTo" in x && x.attachTo === o.attachedTo)))) continue;
      // "Equip—Sacrifice a creature": bots don't give up a permanent to move an Equipment.
      if (ab.equip && ab.costs?.some((c) => c.kind === "sacrifice")) continue;
      // "Equip planeswalker" (Luxior): bots keep their planeswalkers planeswalkers.
      if (ab.equip && ab.body.effects.some((e) => e.type === "attach" && e.asCreature)) continue;
      // "Sacrifice X Squirrels" (Chatterfang): bots don't weigh how many permanents to give up. "Discard X cards" (Gix):
      // the cards in hand we can do without (discardXCount).
      // "Pay X {E}: Draw X cards" (Sphinx of the Revelation): all our energy, leaving cards in the library.
      // "Pay X {E}, Sacrifice ...: ... target ... with mana value X" (Chthonian Nightmare, HELIOS One): the biggest X with
      // a target worth it (mana value 3 or more), as much energy as we have at most.
      const energyX = ab.energyX && !ab.costs?.length && !xTarget ? Math.min(player(s, pid).energy ?? 0, player(s, pid).library.length - 2) : 0;
      const discardX = discardXCount(s, pid, id, ab) ?? graveXCount(s, pid, id, ab);
      // "Remove X ki counters from ~" (the Bakus): as many as it has, or as the mana for an {X} allows (Talon of Pain).
      const counterX = ab.removeCounters?.x ? Math.min(removableCounters(s, o, ab.removeCounters.counter), parseManaCost(ab.manaCost).hasX ? Math.max(0, availableMana(s, pid) - (ab.tap ? 1 : 0) - manaValue(parseManaCost(ab.manaCost))) : Infinity) : 0;
      // Sidisi, Regent of the Mire: our least useful creature (never our commander) for the biggest creature card in our
      // graveyard with one more mana value.
      if (ab.costs?.some((c) => c.kind === "sacrifice" && c.mvX)) {
        const plan = sacrificeMvXPlan(s, pid, o, i, ab);
        if (plan) return plan;
        continue;
      }
      // Osgir, the Reconstructor: two copies of the most valuable artifact card in our graveyard we can pay for.
      if (ab.costs?.some((c) => c.kind === "exileFromGraveyard" && c.mvX)) {
        const plan = exileMvXPlan(s, pid, o, i, ab);
        if (plan) return plan;
        continue;
      }
      if (abilityCostsHaveX(ab) && discardX === undefined && !(energyX > 0) && !(energyTargetX >= 3) && !(counterX > 0)) continue;
      if (ab.body.effects.some((e) => e.type === "unattachSelf")) continue; // reconfigured Equipment stays on
      if (allEffects(ab.body.effects).some((e) => e.type === "endTurn")) continue; // Sundial of the Infinite, Obeka: bots don't end their turn early
      if (ab.body.effects.some((e) => e.type === "nextCast" && e.flash)) continue; // Progenitor's Icon: bots keep its mana instead
      // Saving a creature with a flip (Frenetic Efreet, Viashino Sandswimmer) waits for something to save it from (chooseFlipEscape).
      if (flips && flipEscape(flips)) continue;
      // Gustha's Scepter: in our second main phase, hide a card from a hand we'd discard from in the cleanup step
      // (CR 514.1), and take one back when there's room in the hand. Nothing else exiles our hand face down.
      const hand = player(s, pid).hand.length;
      const handRoom = maxHandSize(s, pid) - hand;
      if (!necro && ab.body.effects.some((e) => e.type === "exileFaceDown" && (e.from !== "handCard" || handRoom >= 0))) continue;
      if (ab.body.effects.some((e) => e.type === "moveLinked" && (!linkedOwned(s, id, pid) || (e.dest === "hand" && handRoom <= 0)))) continue;
      // An Incubator becomes a 0/0 Phyrexian: only worth it with +1/+1 counters on it (CR 701.53b).
      // "Discard your hand" (Tarrian's Journal): only with at most one card in it, which then becomes a land worth tapping.
      if (ab.discardHand && hand > 1) continue;
      // "Remove all +1/+1 counters from ~": only with some to remove, five for each extra turn (Sage of Hours).
      if (ab.removeCounters?.all && (o.counters[ab.removeCounters.counter] ?? 0) < (allEffects(ab.body.effects).some((e) => e.type === "extraTurn" && typeof e.n === "object" && !!e.n.per) ? 5 : 1)) continue;
      if (ab.body.effects.some((e) => e.type === "transformSelf") && !((o.counters["+1/+1"] ?? 0) > 0) && !(ab.discardHand && objIsType(s, o, "Artifact"))) continue;
      if (regenerates(s, o, ab.body) !== undefined) continue; // only when something threatens it (chooseRegeneration)
      if (ab.body.effects.some((e) => e.type === "redirectNext")) continue; // only in a combat it would lose (chooseRedirect)
      if (shieldBody(ab.body)) continue; // only when damage is coming (chooseDamageShield)
      // Sworn Defender: its power and toughness set from a creature in combat with it, which bots don't weigh.
      if (ab.body.targets.some((t) => t.blockingSource) && ab.body.effects.some((e) => e.type === "continuous" && e.what.ref === "self" && e.mods.some((m) => (m.kind === "setPower" && typeof m.power === "object") || (m.kind === "setToughness" && typeof m.toughness === "object")))) continue;
      // Prairie Dog's "until end of turn, ... that many plus one +1/+1 counters": bots don't plan their counters ahead.
      if (ab.body.effects.some((e) => e.type === "countModThisTurn" && e.mod.what === "counters")) continue;
      if (ab.body.effects.some((e) => e.type === "nextDrawInstead") && !(only && s.step === "upkeep" && s.activePlayer === pid)) continue; // only for the draw step's draw (chooseTimed)
      // Metzali's "Choose a creature at random that attacked this turn. Destroy that creature.": only when none of them are
      // ours and there is one.
      const randomKill = ab.body.effects.find((e) => e.type === "destroyRandom");
      if (randomKill?.type === "destroyRandom") {
        const pool = s.battlefield.filter((x) => objectMatches(s, randomKill.filter, obj(s, x), pid, false));
        if (!pool.length || pool.some((x) => controllerOf(s, obj(s, x)) === pid)) continue;
      }
      // "When that creature dies this turn, ..." alone (Together Forever): nothing until it would die, which bots don't foresee.
      if (ab.body.effects.length && ab.body.effects.every((e) => e.type === "delayed" && e.when === "dies")) continue;
      // Phasing out our own permanents ("~ phases out") only takes them away for a turn cycle.
      if (allEffects(ab.body.effects).some((e) => e.type === "phaseOut" && e.what.ref !== "target")) continue;
      // "Until your next upkeep, ~ can't phase out" (Ertai's Familiar): only to keep our own phasing permanent here, once;
      // Spatial Binding's "target permanent can't phase out" bots leave alone.
      const binds = ab.body.effects.length > 0 && ab.body.effects.every((e) => e.type === "continuous" && e.mods.every((m) => m.kind === "cantPhaseOut"));
      if (binds && !ab.body.effects.every((e) => e.type === "continuous" && e.what.ref === "self" && objHasKeyword(s, o, "Phasing") && !characteristics(s, o).cantPhaseOut)) continue;
      // Mirror-Mad Phantasm: shuffling itself into its owner's library, then revealing until a card of its name with the
      // rest milled, which for a bot is only its own library put into the graveyard.
      if (ab.body.effects.some((e) => e.type === "shuffleIntoLibrary" && e.what.ref === "self") && allEffects(ab.body.effects).some((e) => e.type === "revealUntil" && e.rest === "graveyard")) continue;
      // Gomazoa: shuffling itself away is only worth it to take an attacker it blocks along, one that costs at least as much.
      const takesBlocked = ab.body.effects.some((e) => e.type === "shuffleIntoLibrary" && e.what.ref === "inCombatWithSelf" && e.what.andSelf);
      // Vortex Elemental: also a creature blocking it while it attacks.
      const takesBlockers = takesBlocked && ab.body.effects.some((e) => e.type === "shuffleIntoLibrary" && e.what.ref === "inCombatWithSelf" && !e.what.blocked);
      if (takesBlocked && !(o.blocking ?? []).some((a) => s.objects[a]?.attacking !== undefined && mv(s, a) >= mv(s, id)) && !(takesBlockers && o.attacking !== undefined && (o.blockedBy ?? []).some((b) => s.objects[b]?.blocking !== undefined && mv(s, b) >= mv(s, id)))) continue;
      // Craft's "return this card" finds the card only once the cost has exiled it: the back face is what it's worth.
      if (!craft && doesNothingNow(s, id, ab.body)) continue;
      // "Search your library for a card named Sphinx Sovereign" (the Heralds): not with none of them left to find.
      if (ab.body.effects.some((e) => e.type === "search" && typeof e.filter?.named === "string" && e.filter.named !== "~" && !player(s, pid).library.some((c) => defOf(s, obj(s, c)).name === e.filter!.named))) continue;
      // Chainer, Nightmare Adept: a permission to cast from our graveyard only in our main phase, with none unused yet,
      // for a card there we could pay for afterwards.
      const yardCast = ab.body.effects.find((e) => e.type === "graveyardCastThisTurn");
      if (yardCast?.type === "graveyardCastThisTurn") {
        const unused = (s.graveGrants ?? []).some((g) => g.player === pid && g.turn === s.turn && !(s.turnLog?.gravePermits ?? []).includes(g.key));
        const mana = availableMana(s, pid) - manaValue(parseManaCost(ab.manaCost)) - (ab.tap ? 1 : 0);
        const worth = player(s, pid).graveyard.some((c) => { const d = defOf(s, obj(s, c)); return !!d.manaCost && printedMatches(yardCast.filter, d) && mv(s, c) >= 2 && mv(s, c) <= mana; });
        if (unused || !worth || s.activePlayer !== pid || (s.step !== "main1" && s.step !== "main2") || s.stack.length) continue;
      }
      // "~ becomes a Kithkin Spirit with base power and toughness 2/2" when it's that big already, or bigger (Figure of
      // Destiny after its later steps): it would only shrink.
      if (shrinksSelf(s, o, ab.body)) continue;
      // Biomancer's Familiar: only for a creature of ours with +1/+1 counters that could adapt again this turn.
      const refresh = ab.body.effects.some((e) => e.type === "adaptFresh") ? adaptAgain(s, pid) : undefined;
      if (refresh === null) continue;
      // "{1}: Look at the top card of your library" (Brutal Deceiver): nothing a bot can use.
      if (!ab.body.modal && ab.body.effects.every((e) => e.type === "orderTop" && e.n === 1)) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      const modes = ab.body.modal ? chooseModes(s, pid, ab.body, false, id)?.modes : undefined;
      if (ab.body.modal && !modes) continue;
      const body = withModes(ab.body, modes);
      if (!craft && (groupValue(s, pid, body, guessChosen(s, pid, defOf(s, o)), id) ?? 1) <= 0) continue;
      // An X ability: the biggest X we can pay for (never 0).
      const cost = parseManaCost(ab.manaCost);
      // Prototype Portal: X set by the ability (CR 107.3c).
      const fixedX = definedX(s, o, ab);
      // Kaho, Minamo Historian: "cast a spell with mana value X from among cards exiled with ~": X matching one of them.
      const linkedMvX = cost.hasX && body.effects.some((e) => e.type === "castFromAmong" && e.fromLinked && e.exactMv !== undefined) ? [...new Set(linkedCards(s, id).map((l) => defMv(defOf(s, obj(s, l.id)))))].filter((v) => v <= availableMana(s, pid) - (ab.tap ? 1 : 0) - manaValue(cost)).sort((a, b) => b - a) : undefined;
      if (linkedMvX && !linkedMvX.length) continue;
      const xs = fixedX != null ? [fixedX] : linkedMvX ? linkedMvX : discardX !== undefined ? [discardX] : energyX > 0 ? [energyX] : counterX > 0 ? Array.from({ length: counterX }, (_, k) => counterX - k) : energyTargetX >= 3 ? Array.from({ length: energyTargetX - 2 }, (_, k) => energyTargetX - k) : cost.hasX ? xChoices(availableMana(s, pid) - (ab.tap ? 1 : 0) - manaValue(cost), xCount(cost)) : [undefined];
      let plan: Action[] | null = null;
      for (const x of xs) {
        // Krumar Initiate: "Pay X life" too; keep at least 10 life.
        if (ab.lifeCostX && (x ?? 0) > player(s, pid).life - 10) continue;
        const targets: TargetChoice[] | null = refresh ? [{ kind: "object", id: refresh }] : body.targets.length ? chooseTargets(s, pid, body, false, id, x) : [];
        if (!targets || pointlessAttach(s, body, targets, id) || pointlessMove(s, pid, body, targets)) continue;
        // O-Naginata: not to a creature it can't be attached to (it would stay where it is, rulings).
        const only = ab.equip ? abilitiesOf(s, o).attachOnly : undefined;
        if (only && targets.some((t) => t.kind === "object" && !objectMatches(s, only, obj(s, t.id), pid, false))) continue;
        const costs = discardX !== undefined ? (graveXPool(s, pid, id, ab) ? graveXCosts(s, pid, o, ab, targets, discardX) : discardXCosts(s, pid, o, ab, targets, discardX)) : abilityCosts(s, pid, o, ab, targets);
        if (costs === null) continue;
        if (titan && (costs?.sacrifice ?? []).reduce((a, c) => a + Math.max(0, power(s, obj(s, c))), 0) >= 10) continue;
        if (flips && flipWorth(s, pid, o, ab, flips, targets) <= 0) continue;
        // Tree of Perdition, Tree of Redemption: only to lower an opponent's life total, or raise ours.
        const swap = body.effects.find((e) => e.type === "exchangeLifeWithSelf");
        if (swap?.type === "exchangeLifeWithSelf") {
          const t = swap.who.ref === "target" ? targets[swap.who.index] : undefined;
          const who = swap.who.ref === "you" ? pid : t?.kind === "player" ? t.id : undefined;
          const stat = swap.stat === "power" ? power(s, o) : toughness(s, o);
          if (who === undefined || (who === pid ? stat <= player(s, pid).life + 2 : stat >= player(s, who).life)) continue;
        }
        plan = planActivate(s, pid, id, i, targets.length ? targets : undefined, modes, undefined, x, costs);
        if (plan) break;
      }
      // Waterbend (CR 701.67a): not by tapping creatures that could still attack this turn.
      const wb = ab.waterbend !== undefined ? plan?.find((a) => a.type === "activateAbility" && a.objectId === id) : undefined;
      if (wb?.type === "activateAbility" && s.activePlayer === pid && (s.step === "main1" || s.step === "upkeep" || s.step === "draw" || s.step === "beginCombat") && wb.tapCreatures?.some((c) => objIsType(s, obj(s, c), "Creature") && !isSummoningSick(s, obj(s, c)))) continue;
      // Not worth sacrificing a Treasure to cash in a Food or Clue.
      if (cashIn && plan?.some((a) => a.type === "activateMana" && manaActionAbility(s, a)?.sacrificeSelf)) continue;
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Doubling Cube's "{3}, {T}: Double the amount of each type of unspent mana you have" instead of paying a spell's or an
 * ability's whole cost from our other sources, when that taps fewer of them (a cost of 8 or more: half of it made and
 * the Cube's {3}, then doubled), the rest kept for more spells or for instants. The doubled pool must hold as much mana
 * as the plan's own taps make (so {X}, taxes and reductions are as they were chosen), with the colors the cost names;
 * the same spell or ability is then paid from the pool, which keeps the mana until the step ends (CR 500.4). Only a
 * plan paid with mana abilities; the new plan is tried on a copy of the game and kept only if it works.
 */
function cubeInstead(s: GameState, pid: PlayerId, plan: Action[]): Action[] | null {
  const last = plan[plan.length - 1];
  const taps = plan.slice(0, -1);
  if ((last?.type !== "castSpell" && last?.type !== "activateAbility") || taps.length < 8 || taps.some((a) => a.type !== "activateMana")) return null;
  if (last.type === "castSpell" && (last.convoke?.length || last.improvise?.length)) return null;
  const t = cloneState(s);
  const before = { ...player(t, pid).manaPool };
  try {
    for (const a of taps) applyInPlace(t, a);
  } catch {
    return null;
  }
  const left = { ...player(t, pid).manaPool };
  let made = 0;
  for (const m of Object.keys(left) as ManaType[]) {
    left[m] -= before[m] ?? 0;
    if (left[m] < 0) return null;
    made += left[m];
  }
  // The colored mana the cost names, read from its printed symbols (a hybrid one as the color made more of; a
  // Phyrexian or {2/W} one only if its color was made, else it was paid with life or generic); the rest is generic.
  const printed = parseManaCost(last.type === "castSpell" ? defOf(s, obj(s, last.objectId)).manaCost : (abilitiesOf(s, obj(s, last.objectId)).activated[last.index]?.manaCost ?? ""));
  const colored: string[] = [];
  for (const x of printed.symbols) {
    const want = x.kind === "colored" ? x.color : x.kind === "hybrid" ? [...x.options].sort((a, b) => left[b] - left[a])[0]! : x.kind === "phyrexian" || x.kind === "twoHybrid" ? (left[x.color] > 0 ? x.color : undefined) : undefined;
    if (x.kind !== "generic" && x.kind !== "x" && x.kind !== "colored" && x.kind !== "hybrid" && x.kind !== "phyrexian" && x.kind !== "twoHybrid") return null;
    if (!want) continue;
    if (left[want] <= 0) return null;
    left[want]--;
    colored.push(`{${want}}`);
  }
  const doubled = planCubeMana(s, pid, parseManaCost(colored.join("") + `{${made - colored.length}}`), 0, [], "other");
  // The Cube itself is the last of `doubled`, tapped for nothing else.
  if (!doubled?.length || doubled.length - 1 >= taps.length) return null;
  const out = [...doubled, last];
  const u = cloneState(s);
  const stack = u.stack.length;
  try {
    for (const a of out) applyInPlace(u, a);
  } catch {
    return null;
  }
  return u.stack.length > stack || u.pending ? out : null;
}

/**
 * Detection Tower's "{1}, {T}: Until end of turn, your opponents and creatures your opponents control with hexproof can
 * be the targets of spells and abilities you control as though they didn't have hexproof" (CR 702.11e): with the stack
 * empty, when once it has resolved (tried on a copy of the game, everyone passing) a spell in our hand we could still
 * pay for, or an activated ability we'd use, would target an opponent or an opponent's creature that has hexproof.
 */
function chooseHexproofSight(s: GameState, pid: PlayerId): Action[] | null {
  if (s.stack.length || (s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === pid && r.rule === "seeHexproof")) return null;
  const shielded = (t: TargetChoice) =>
    t.kind === "player" ? t.id !== pid && playerProtection(s, t.id) === "hexproof" : t.kind === "object" && !!s.objects[t.id] && obj(s, t.id).zone === "battlefield" && controllerOf(s, obj(s, t.id)) !== pid && objHasKeyword(s, obj(s, t.id), "Hexproof");
  const anyShielded = opponents(s, pid).some((p) => shielded({ kind: "player", id: p })) || s.battlefield.some((id) => objIsType(s, obj(s, id), "Creature") && shielded({ kind: "object", id }));
  if (!anyShielded) return null;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.mana || ab.body.targets.length || !ab.body.effects.some((e) => e.type === "turnRules" && e.rules.includes("seeHexproof"))) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      const plan = planActivate(s, pid, id, i);
      if (!plan) continue;
      const u = cloneState(s);
      try {
        for (const a of plan) applyInPlace(u, a);
        for (let k = 0; k < 12 && u.stack.length && !u.pending; k++) applyInPlace(u, { type: "passPriority", player: waitingOn(u)! });
      } catch {
        continue;
      }
      if (u.pending || u.stack.length || u.priority !== pid) continue;
      for (const h of player(u, pid).hand) {
        if (isType(defOf(u, obj(u, h)), "Land")) continue;
        const cast = castPlan(u, pid, h, false)?.find((a) => a.type === "castSpell");
        if (cast?.type === "castSpell" && cast.targets?.some(shielded)) return plan;
      }
      // Or an ability we'd activate once our spells are cast (chooseActivation, in our second main phase).
      const act = chooseActivation(u, pid)?.find((a) => a.type === "activateAbility");
      if (act?.type === "activateAbility" && act.objectId !== id && act.targets?.some(shielded)) return plan;
    }
  }
  return null;
}

/**
 * "{T}, Tap X untapped artifacts you control: Copy target instant or sorcery spell you control with mana value X"
 * (Resonance Technician): our own instant or sorcery on top of the stack, with as many artifacts to tap as its mana
 * value, the ones that make no mana first (Clues before Treasures), then noncreatures.
 */
function chooseCopyWithTaps(s: GameState, pid: PlayerId): Action[] | null {
  const top = s.stack[s.stack.length - 1];
  if (!top || top.kind !== "spell" || top.controller !== pid || !top.objectId || s.pending) return null;
  const x = spellManaValue(s, top);
  if (x < 1) return null;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    for (const [i, ab] of abilitiesOf(s, o).activated.entries()) {
      const c = ab.costs?.length === 1 ? ab.costs[0]! : undefined;
      const spec = ab.body.targets.length === 1 ? ab.body.targets[0]! : undefined;
      if (c?.kind !== "tap" || !c.x || ab.body.effects.length !== 1 || ab.body.effects[0]!.type !== "copySpell" || spec?.xRange?.key !== "manaValue") continue;
      const pool = tapCostCandidates(s, pid, o, c)
        .map((t) => obj(s, t))
        .sort((a, b) => Number(manaAbilitiesOn(s, a).length > 0 || abilitiesOf(s, a).activated.some((m) => m.mana)) - Number(manaAbilitiesOn(s, b).length > 0 || abilitiesOf(s, b).activated.some((m) => m.mana)) || Number(objIsType(s, a, "Creature")) - Number(objIsType(s, b, "Creature")));
      if (pool.length < x) continue;
      const plan = planActivate(s, pid, id, i, [{ kind: "stack", id: top.id }], undefined, undefined, x, { tap: pool.slice(0, x).map((t) => t.id) });
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * What a bot makes an attacking creature attack instead (Misleading Signpost), or undefined to leave it: away from us
 * and our planeswalkers to the other player with the most life; our own toward the opponent with the least life, when
 * that's less than the life of the player it attacks.
 */
function reselectPick(s: GameState, pid: PlayerId, o: GameObject): string | undefined {
  if (o.zone !== "battlefield" || o.attacking === undefined) return undefined;
  const players = reselectOptions(s, o).filter((x) => x.planeswalker === undefined);
  const life = (x: { player: PlayerId }) => player(s, x.player).life;
  if (o.attacking === pid) return players.filter((x) => x.player !== pid).sort((a, b) => life(b) - life(a))[0]?.key;
  if (controllerOf(s, o) !== pid) return undefined;
  const low = players.sort((a, b) => life(a) - life(b))[0];
  return low && (o.attackingPermanent || life(low) < player(s, o.attacking).life) ? low.key : undefined;
}

/** A creature of ours with +1/+1 counters and an adapt ability, not yet refreshed this turn (Biomancer's Familiar). */
function adaptAgain(s: GameState, pid: PlayerId): ObjectId | null {
  return s.battlefield.find((id) => {
    const o = obj(s, id);
    return controllerOf(s, o) === pid && objIsType(s, o, "Creature") && (o.counters["+1/+1"] ?? 0) > 0 && o.adaptFresh !== s.turn && abilitiesOf(s, o).activated.some((a) => a.body.effects.some((e) => e.type === "adapt"));
  }) ?? null;
}

/** The cards in our hand and command zone we could cast now, the dearest first. */
/**
 * "Add X mana in any combination of colors" (Klauth, Manamorphose): the colored symbols of the cards in our hand and
 * command zone, dearest first, each one's colors met before the next's; what's left goes to the color most asked for
 * (our commander's first color if none is).
 */
function chooseManaMix(s: GameState, pid: PlayerId, n: number, colors?: Color[]): Partial<Record<Color, number>> {
  const allowed = colors ?? [...COLORS];
  const p = player(s, pid);
  const cards = [...p.command, ...p.hand].map((id) => defOf(s, obj(s, id))).filter((d) => !isType(d, "Land")).sort((a, b) => manaValue(parseManaCost(b.manaCost)) - manaValue(parseManaCost(a.manaCost)));
  const out: Partial<Record<Color, number>> = {};
  const demand: Partial<Record<Color, number>> = {};
  let left = n;
  for (const d of cards) {
    for (const c of allowed) {
      const k = d.manaCost.split(`{${c}}`).length - 1;
      demand[c] = (demand[c] ?? 0) + k;
      const add = Math.min(left, Math.max(0, k - (out[c] ?? 0)));
      if (add) out[c] = (out[c] ?? 0) + add;
      left -= add;
    }
  }
  if (left) {
    const identity = p.command.length ? defOf(s, obj(s, p.command[0]!)).colorIdentity : [];
    const best = [...allowed].sort((a, b) => (demand[b] ?? 0) - (demand[a] ?? 0) || Number(identity.includes(b)) - Number(identity.includes(a)))[0]!;
    out[best] = (out[best] ?? 0) + left;
  }
  return out;
}

function castableNow(s: GameState, pid: PlayerId): ObjectId[] {
  const p = player(s, pid);
  return [...p.command, ...p.hand].filter((id) => !isType(defOf(s, obj(s, id)), "Land") && castPlan(s, pid, id, false)).sort((a, b) => mv(s, b) - mv(s, a));
}

/**
 * For a mana ability's color chosen as it resolves: the color after which we could cast the dearest card, if any, one
 * of its colors if that's as good (the mana left over is more use).
 */
function manaColorFor(s: GameState, pid: PlayerId, options: string[]): string | undefined {
  let best: { choice: string; score: number } | undefined;
  for (const choice of options) {
    let after: GameState;
    try {
      after = applyAction(s, { type: "chooseOption", player: pid, choice });
    } catch {
      continue;
    }
    if (after.pending) continue;
    const top = castableNow(after, pid)[0];
    if (top === undefined) continue;
    const score = 2 * mv(s, top) + (defOf(s, obj(s, top)).colors.some((c) => COLOR_NAMES[c] === choice) ? 1 : 0);
    if (!best || score > best.score) best = { choice, score };
  }
  return best?.choice;
}

/**
 * An activated mana ability whose only cost is a creature we control, sacrificed or exiled (Food Chain, Ashnod's Altar,
 * Phyrexian Altar), when nothing in our hand or command zone can be cast without it: the least valuable creature that
 * makes the mana for a card that does more (a token, or a creature with a mana value at least two less than the card's),
 * never a commander. Checked by activating it and choosing its color: only when the card can then be cast.
 */
function chooseCreatureForMana(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      const c = ab.costs?.length === 1 ? ab.costs[0]! : undefined;
      if (!ab.mana || c?.kind !== "sacrifice" || c.n !== 1 || c.x || c.half || c.optional || c.oneOfEach || ab.manaCost || ab.tap || ab.sacrificeSelf) continue;
      if ((o.activatedThisTurn?.filter((n) => n === i).length ?? 0) >= BOT_LOOP_LIMIT) continue;
      const pool = s.battlefield
        .map((x) => obj(s, x))
        .filter((x) => controllerOf(s, x) === pid && x.id !== id && !x.isCommander && objIsType(s, x, "Creature") && objectMatches(s, c.filter, x, pid, false) && (c.exile || canSacrificeForCost(s, x)))
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b))
        .slice(0, 3);
      for (const fodder of pool) {
        const action: Action = { type: "activateAbility", player: pid, objectId: id, index: i, costs: { sacrifice: [fodder.id] } };
        let after: GameState;
        try {
          after = applyAction(s, action);
          if (after.pending?.kind === "chooseOption" && after.pending.player === pid && after.pending.what === "color") {
            const choice = manaColorFor(after, pid, after.pending.options);
            if (!choice) continue;
            after = applyAction(after, { type: "chooseOption", player: pid, choice });
          }
        } catch {
          continue;
        }
        if (after.pending) continue;
        const top = castableNow(after, pid)[0];
        if (top !== undefined && (fodder.isToken || mv(s, fodder.id) + 2 <= mv(s, top))) return [action];
      }
    }
  }
  return null;
}

/**
 * An activated mana ability whose only cost besides {T} is forage (Thornvault Forager, CR 701.61a), when nothing in our
 * hand or command zone can be cast without it: foraged the way forageChoice picks, and only when a card can then be
 * cast (checked by activating it and choosing its mana as we would).
 */
function chooseForageForMana(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (!ab.mana || ab.costs?.length !== 1 || ab.costs[0]!.kind !== "forage" || ab.manaCost || ab.sacrificeSelf) continue;
      const costs = forageChoice(s, pid, o, []);
      if (!costs || abilityProblem(s, pid, id, i, undefined, undefined, undefined, undefined, costs)) continue;
      const action: Action = { type: "activateAbility", player: pid, objectId: id, index: i, costs };
      let after: GameState;
      try {
        after = applyAction(s, action);
        for (let k = 0; k < 4 && after.pending?.player === pid; k++) after = botActions(after, pid).reduce((x, a) => applyAction(x, a), after);
      } catch {
        continue;
      }
      if (after.pending) continue;
      if (castableNow(after, pid).length) return [action];
    }
  }
  return null;
}

/**
 * X for an ability whose only X is "Discard X cards" (Gix, Yawgmoth Praetor), or undefined when we'd rather not: in our
 * main phase with an empty stack, every card in hand but the spells we could still cast after paying for it and a land
 * to play this turn. At least two cards, so it's worth seven mana.
 */
function discardXCount(s: GameState, pid: PlayerId, id: ObjectId, ab: ActivatedAbility): number | undefined {
  const xs = (ab.costs ?? []).filter((c) => "x" in c && c.x);
  const c = xs[0];
  if (xs.length !== 1 || c?.kind !== "discard" || c.filter || c.random || c.mvX || parseManaCost(ab.manaCost).hasX) return undefined;
  if (s.activePlayer !== pid || (s.step !== "main1" && s.step !== "main2") || s.stack.length) return undefined;
  const p = player(s, pid);
  const mana = availableMana(s, pid) - manaValue(parseManaCost(ab.manaCost)) - (ab.tap ? 1 : 0);
  const hand = p.hand.filter((x) => x !== id);
  const isLand = (x: ObjectId) => isType(defOf(s, obj(s, x)), "Land");
  const keep = hand.filter((x) => !isLand(x) && mv(s, x) <= mana).length + (p.landsPlayedThisTurn < landsAllowed(s, pid) && hand.some(isLand) ? 1 : 0);
  const x = hand.length - keep;
  return x >= 2 ? x : undefined;
}

/**
 * "Exile one or more creature cards from your graveyard: Create a tapped X/X ... token" (Corpseweft): the cards matching
 * the cost we have no use for in our graveyard, when the ability makes a token and targets nothing, or undefined.
 */
function graveXPool(s: GameState, pid: PlayerId, id: ObjectId, ab: ActivatedAbility): ObjectId[] | undefined {
  const xs = (ab.costs ?? []).filter((c) => "x" in c && c.x);
  const c = xs[0];
  if (xs.length !== 1 || c?.kind !== "exileFromGraveyard" || c.top || c.linked || c.process || parseManaCost(ab.manaCost).hasX) return undefined;
  if (!ab.body.effects.some((e) => e.type === "createToken") || ab.body.targets?.length) return undefined;
  return player(s, pid).graveyard.filter((x) => x !== id && !usefulInGraveyard(s, x) && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))));
}

/** X for graveXPool: all of those cards, in our main phase with an empty stack, two at least (and the ability's minimum). */
function graveXCount(s: GameState, pid: PlayerId, id: ObjectId, ab: ActivatedAbility): number | undefined {
  const pool = graveXPool(s, pid, id, ab);
  if (!pool || s.activePlayer !== pid || (s.step !== "main1" && s.step !== "main2") || s.stack.length) return undefined;
  return pool.length >= Math.max(2, ab.xMin ?? 0) ? pool.length : undefined;
}

/** The costs for graveXCount's X: the other costs as usual, and those graveyard cards. */
function graveXCosts(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, targets: TargetChoice[], x: number): CostChoices | null {
  const others = abilityCosts(s, pid, o, { ...ab, costs: (ab.costs ?? []).filter((c) => !("x" in c && c.x)) }, targets);
  const pool = graveXPool(s, pid, o.id, ab);
  if (others === null || !pool || pool.length < x) return null;
  return { ...others, exileCards: [...(others?.exileCards ?? []), ...pool.slice(0, x)] };
}

/** The costs for discardXCount's X: the other costs as usual, and the X cards we'd most readily discard. */
function discardXCosts(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, targets: TargetChoice[], x: number): CostChoices | null {
  const others = abilityCosts(s, pid, o, { ...ab, costs: (ab.costs ?? []).filter((c) => !("x" in c && c.x)) }, targets);
  if (others === null) return null;
  return { ...others, discard: chooseDiscards(s, pid, x, o.id) };
}

/** The exiled nonland cards an opponent owns with the counter `body`'s playExiled looks for (Dauthi Voidwalker). */
function voidSpells(s: GameState, pid: PlayerId, body: AbilityBody): ObjectId[] {
  const e = body.effects.find((x) => x.type === "playExiled");
  if (e?.type !== "playExiled") return [];
  return s.turnOrder.flatMap((p) => player(s, p).exile).filter((id) => obj(s, id).owner !== pid && (obj(s, id).counters[e.counter] ?? 0) > 0 && !isType(defOf(s, obj(s, id)), "Land"));
}

/** What winning and losing a coin flip do (CR 705.2): "If you win the flip, ..." and "If you lose the flip, ..." Undefined without a loss branch. */
function flipBranches(body: AbilityBody): { win: Effect[]; lose: Effect[] } | undefined {
  const ifs = body.effects.filter((e): e is Extract<Effect, { type: "if" }> => e.type === "if" && e.cond.kind === "wonFlip");
  const lost = (e: Extract<Effect, { type: "if" }>) => e.cond.kind === "wonFlip" && !!e.cond.lost;
  if (!body.effects.some((e) => e.type === "flipCoin") || !ifs.some(lost)) return undefined;
  return { win: ifs.filter((e) => !lost(e)).flatMap((e) => e.effects), lose: ifs.filter(lost).flatMap((e) => e.effects) };
}

/** A flip that only saves its source from what's about to happen to it: phased out or back to hand if won, sacrificed if lost. */
const flipEscape = (f: { win: Effect[]; lose: Effect[] }) =>
  f.win.length > 0 && f.win.every((e) => (e.type === "phaseOut" || e.type === "bounce") && e.what.ref === "self") && f.lose.every((e) => e.type === "sacrifice" && e.what.ref === "self");

/**
 * What an activated ability that flips a coin is worth to a bot: half what winning does and half what losing does (an even
 * chance, CR 705.1), less sacrificing its source as a cost unless that's all the permanent is for (Bottle of Suleiman).
 * Losing a creature counts as what it's worth, damage to us as the life it costs (after doublers and prevention), and
 * never what would kill us.
 */
function flipWorth(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, f: { win: Effect[]; lose: Effect[] }, targets: TargetChoice[]): number {
  const own = abilitiesOf(s, o);
  const onlyUse = !objIsType(s, o, "Creature") && !objIsType(s, o, "Land") && own.activated.length === 1 && !own.triggers.length && !own.statics.length;
  const cost = ab.sacrificeSelf && !onlyUse ? worth(s, pid, o) : 0;
  return (flipBranchWorth(s, pid, o, f.win, targets) + flipBranchWorth(s, pid, o, f.lose, targets)) / 2 - cost;
}

function flipBranchWorth(s: GameState, pid: PlayerId, o: GameObject, effects: Effect[], targets: TargetChoice[]): number {
  const target = (r: ObjRef) => {
    const t = r.ref === "target" ? targets[r.index] : r.ref === "self" ? { kind: "object" as const, id: o.id } : undefined;
    return t && !Array.isArray(t) && t.kind === "object" && s.objects[t.id]?.zone === "battlefield" ? obj(s, t.id) : undefined;
  };
  const loss = (x: GameObject) => (controllerOf(s, x) === pid ? -1 : 1) * worth(s, pid, x);
  let v = 0;
  for (const e of effects) {
    if ((e.type === "sacrifice" || e.type === "destroy" || e.type === "exile") && "what" in e && target(e.what)) v += loss(target(e.what)!);
    // Back to its owner's hand: casting it again costs its mana. Phased out, it can't block until our next turn (CR 702.26b).
    else if (e.type === "bounce" && target(e.what)) v += loss(target(e.what)!) / 2;
    else if (e.type === "phaseOut" && target(e.what)) v += controllerOf(s, target(e.what)!) === pid ? -1 : 1;
    else if (e.type === "damage" && e.to.ref === "you") {
      const n = damageEstimate(s, o, { player: pid }, estimate(e.amount), false);
      v -= n >= player(s, pid).life ? Infinity : n / 2;
    } else if (e.type === "createToken" && e.who.ref === "you" && "power" in e.token) v += estimate(e.n) * Math.max(2, Number(e.token.power ?? 0) + Number(e.token.toughness ?? 0));
    else if (e.type === "continuous" && target(e.what)) {
      // A pump until end of turn after combat does nothing; shrinking one of ours to 0 toughness kills it (CR 704.5f).
      const t = target(e.what)!;
      const dt = e.mods.reduce((n, m) => n + (m.kind === "modifyPT" ? estimate(m.toughness) : 0), 0);
      if (dt < 0 && lethalDamage(s, t) + dt <= 0) v += loss(t);
    } else v += modeValue(s, pid, { targets: [], effects: [e], text: "" }, targets);
  }
  return v;
}

/**
 * Ardenn: what to attach to the target. To a creature of ours: Equipment, unless it's on a creature of ours worth more,
 * and helpful Auras that are on an opponent's permanent. To an opponent's creature or an opponent: harmful Auras that
 * are on our own permanents. Nothing to ourselves.
 */
function attachPicks(s: GameState, pid: PlayerId, options: ObjectId[]): ObjectId[] {
  const item = s.resolving?.item;
  const e = item?.body?.effects.find((x) => x.type === "attachAny");
  const t = e?.type === "attachAny" ? (e.self && item?.sourceId ? ({ kind: "object", id: item.sourceId } as const) : item!.targets?.[e.host]) : undefined;
  if (!t || (t.kind !== "object" && t.kind !== "player")) return [];
  const host = t.kind === "object" ? s.objects[t.id] : undefined;
  const ourHost = host ? controllerOf(s, host) === pid : t.id === pid;
  const harmful = (o: GameObject) => compileCard(defOf(s, o)).statics.some((st) => modsAreHarmful(st.mods));
  const onOurs = (o: GameObject) => (o.attachedTo ? controllerOf(s, obj(s, o.attachedTo)) === pid : o.attachedToPlayer === pid);
  return options.filter((id) => {
    const o = obj(s, id);
    const aura = characteristics(s, o).subtypes.includes("Aura");
    if (!ourHost) return aura && harmful(o) && onOurs(o);
    if (!host || !objIsType(s, host, "Creature")) return false;
    if (aura) return !harmful(o) && (o.attachedTo ? !onOurs(o) : o.attachedToPlayer !== undefined && o.attachedToPlayer !== pid);
    const on = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    return !on || controllerOf(s, on) !== pid || worth(s, pid, on) < worth(s, pid, host);
  });
}

/** "Attach target Equipment you control to target creature you control" (Brass Squire) where it already is, or with no Equipment chosen. */
/**
 * "Move a counter from target creature an opponent controls onto target creature you control" (Rikku's Steal): only a
 * counter that helps, from one that has it, onto ours.
 */
function pointlessMove(s: GameState, pid: PlayerId, body: AbilityBody, targets: TargetChoice[]): boolean {
  const e = body.effects.find((x) => x.type === "moveCounter");
  if (e?.type !== "moveCounter" || e.from.ref !== "target" || e.to.ref !== "target") return false;
  const [from, to] = [targets[e.from.index], targets[e.to.index]].map((t) => (t?.kind === "object" ? s.objects[t.id] : undefined));
  if (!from || !to || controllerOf(s, to) !== pid) return true;
  return !Object.entries(from.counters).some(([k, n]) => (n ?? 0) > 0 && (e.counter === "any" ? !harmfulCounter(k) : k === e.counter) && !harmfulCounter(k));
}

function pointlessAttach(s: GameState, body: AbilityBody, targets: TargetChoice[], sourceId: ObjectId): boolean {
  const e = body.effects.find((x) => x.type === "attach" && x.source);
  if (e?.type !== "attach" || e.source?.ref !== "target") return false;
  const pick = (r: typeof e.what) => {
    const c = r.ref === "target" ? targets[r.index] : r.ref === "self" ? { kind: "object" as const, id: sourceId } : undefined;
    return c && !Array.isArray(c) && c.kind === "object" ? c.id : undefined;
  };
  const eq = pick(e.source);
  const host = pick(e.what);
  return !eq || !host || s.objects[eq]?.attachedTo === host;
}

/**
 * Spells and abilities usable only at certain times (CR 506.8, 601.3, 602.5b), once that time has come and the stack is
 * empty: "only during your upkeep", "only during combat", "only if you've been attacked this step". Not at the beginning
 * of combat, before anyone attacks; damage prevention (Heavy Fog) only when enough damage is attacking us.
 */
function chooseTimed(s: GameState, pid: PlayerId): Action[] | null {
  if (s.stack.length || s.step === "beginCombat") return null;
  for (const id of player(s, pid).hand) {
    const c = compileCard(defOf(s, obj(s, id)));
    if (!c.castOnly || !timedCondition(c.castOnly) || !staticConditionNow(s, c.castOnly, id, pid)) continue;
    if (c.spell && doesNothingNow(s, id, c.spell)) continue;
    if (shieldBody(c.spell)) {
      const coming = s.battlefield.map((x) => obj(s, x)).filter((o) => o.attacking === pid && !o.attackingPermanent).reduce((n, o) => n + Math.max(0, power(s, o)), 0);
      if (coming < Math.min(4, player(s, pid).life)) continue;
    }
    const plan = castPlan(s, pid, id, false);
    if (plan) return plan;
  }
  // Misleading Signpost: flashed in during the declare attackers step when there's an attack worth turning.
  if (s.step === "declareAttackers") {
    const turnable = s.battlefield.some((x) => reselectPick(s, pid, obj(s, x)) !== undefined);
    for (const id of turnable ? player(s, pid).hand : []) {
      if (!attackStepOnly(compileCard(defOf(s, obj(s, id))))) continue;
      const plan = castPlan(s, pid, id, false);
      if (plan) return plan;
    }
  }
  const timed = (ab: ActivatedAbility) => timedCondition(ab.activateIf);
  // The Words (Words of Wilding, Words of Worship): in our own upkeep, one to replace the draw step's draw.
  if (s.step === "upkeep" && s.activePlayer === pid && !player(s, pid).nextDrawInstead?.some((w) => w.turn === s.turn)) {
    const words = chooseActivation(s, pid, (ab) => ab.body.effects.some((e) => e.type === "nextDrawInstead"));
    if (words) return words;
  }
  return chooseActivation(s, pid, timed) ?? chooseUnearth(s, pid, timed);
}

/** A card whose point is an "enters during the declare attackers step" trigger (Misleading Signpost). */
function attackStepOnly(c: CompiledCard): boolean {
  return c.triggers.some((t) => t.event === "selfEnters" && t.activeIf?.kind === "during" && t.activeIf.window === "declareAttackers");
}

/**
 * Derevi: "Put ~ onto the battlefield from the command zone" instead of casting it, when the commander tax has made
 * casting it dearer than the ability, or it can't be cast now (it isn't a cast: no tax, rulings).
 */
function commandZonePlan(s: GameState, pid: PlayerId, id: ObjectId): Action[] | null {
  const o = obj(s, id);
  if (o.zone !== "command") return null;
  const abilities = abilitiesOf(s, o).activated;
  for (let i = 0; i < abilities.length; i++) {
    if (abilities[i]!.zone !== "command") continue;
    if (commanderTax(player(s, pid), o) < 2 && castPlan(s, pid, id, false)) return null;
    const plan = planActivate(s, pid, id, i);
    if (plan) return plan;
  }
  return null;
}

/**
 * Ninjutsu (CR 702.49a) once blockers are declared: swap the least valuable unblocked attacker (a token, or
 * anything smaller than the ninja) for the ninja, when the stack is empty.
 */
function chooseNinjutsu(s: GameState, pid: PlayerId): Action[] | null {
  if (s.activePlayer !== pid || s.step !== "declareBlockers" || s.stack.length) return null;
  for (const id of [...player(s, pid).hand, ...player(s, pid).command]) {
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      // Commander ninjutsu works from the command zone too (CR 702.49d).
      const cost = ab.zone === "hand" && (obj(s, id).zone === "hand" || ab.orCommand) ? ab.costs?.find((c) => c.kind === "returnToHand") : undefined;
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
    const value = isType(d, "Creature") ? (Number.parseInt(d.power ?? "0", 10) || 0) + (Number.parseInt(d.toughness ?? "0", 10) || 0) : defMv(d);
    const ok = returnCandidates(s, pid, cost).some((x) => !obj(s, x).isCommander && (obj(s, x).isToken || worth(s, pid, obj(s, x)) < value));
    if (!ok) continue;
    const plan = castPlan(s, pid, id, false, undefined, "sneak");
    if (plan) return plan;
  }
  return null;
}

function chooseUnearth(s: GameState, pid: PlayerId, only?: (ab: ActivatedAbility) => boolean): Action[] | null {
  // Mister Immortal: from exile too (ActivatedAbility.orExile).
  for (const id of [...player(s, pid).graveyard, ...player(s, pid).exile]) {
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.zone !== "graveyard" || (only && !only(ab)) || (obj(s, id).zone === "exile" && !ab.orExile)) continue;
      // Scavenge needs a creature to grow (CR 702.97a).
      const targets = ab.body.targets.length ? chooseTargets(s, pid, ab.body, false, id) : undefined;
      if (ab.body.targets.length && !targets) continue;
      // Jarad, Golgari Lich Lord's "Sacrifice a Swamp and a Forest": spare lands only (abilityCosts).
      const costs = abilityCosts(s, pid, obj(s, id), ab, targets ?? []);
      if (costs === null) continue;
      const plan = planActivate(s, pid, id, i, targets ?? undefined, undefined, undefined, undefined, costs);
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
export function abilityCosts(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, targets: TargetChoice[], keep?: ObjectId): CostChoices | null | undefined {
  if (!ab.costs?.length) return undefined;
  const out: CostChoices = {};
  const targeted = new Set(targets.flatMap((t) => (t.kind === "none" ? [] : [t.id])));
  for (const c0 of ab.costs) {
    // "Sacrifice a creature of the chosen type" (Etchings of the Chosen): the source's chosen type.
    const c1 = c0.kind === "sacrifice" && c0.filter.chosen ? { ...c0, filter: bindChosen(c0.filter, o.chosen) } : c0;
    // Ronin, Shadow Stalker: "an Equipment attached to ~", this permanent.
    const c = c1.kind === "sacrifice" ? { ...c1, filter: bindAttachedToSource(c1.filter, o.id, o.attachedTo) } : c1;
    if (c.kind === "forage") {
      const f = forageChoice(s, pid, o, [...[...targeted].map(String), ...(keep ? [keep] : [])]);
      if (!f) return null;
      Object.assign(out, f);
    } else if (c.kind === "sacrifice") {
      const pool = s.battlefield
        .map((x) => obj(s, x))
        .filter((x) => controllerOf(s, x) === pid && x.id !== o.id && x.id !== keep && !x.isCommander && !targeted.has(x.id) && !out.sacrifice?.includes(x.id))
        .filter((x) => objectMatches(s, c.filter, x, pid, false))
        // Mechtitan Core's four others: any of ours, the least valuable (chooseActivation weighs them against the token).
        .filter((x) => (objIsType(s, x, "Land") ? lands(s, pid) >= 8 : (x.isToken && worth(s, pid, x) <= 3) || (c.exile && makesTitan(ab))))
        .sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
      // "Sacrifice a Swamp and a Forest" (Jarad): one for each, the least valuable that fits.
      if (c.oneOfEach) {
        const picks: ObjectId[] = [];
        for (const f of c.oneOfEach) {
          const x = pool.find((y) => !picks.includes(y.id) && objectMatches(s, f, y, pid, false));
          if (!x) return null;
          picks.push(x.id);
        }
        out.sacrifice = [...(out.sacrifice ?? []), ...picks];
        continue;
      }
      const named = c.differentNames ? differentlyNamed(s, pool.map((x) => x.id)) : pool.map((x) => x.id);
      if (named.length < c.n) return null;
      out.sacrifice = [...(out.sacrifice ?? []), ...named.slice(0, c.n)];
    } else if (c.kind === "craft") {
      // Craft's materials: cards in our graveyard we have no use for there first, the cheapest; then tokens worth little
      // (exiled, a token is gone for good, CR 111.7). Never a commander, a target, or something paying another cost.
      const pool = craftCandidates(s, pid, o, c).filter((x) => x !== keep && !targeted.has(x) && !out.sacrifice?.includes(x) && !obj(s, x).isCommander);
      const yard = pool.filter((x) => obj(s, x).zone === "graveyard" && !usefulInGraveyard(s, x)).sort((a, b) => mv(s, a) - mv(s, b));
      const field = pool.filter((x) => obj(s, x).zone === "battlefield" && obj(s, x).isToken && worth(s, pid, obj(s, x)) <= 3).sort((a, b) => worth(s, pid, obj(s, a)) - worth(s, pid, obj(s, b)));
      const picks = [...yard, ...field];
      if (picks.length < c.n) return null;
      out.craft = picks.slice(0, c.n);
    } else if (c.kind === "tap" && c.untap) {
      // "Untap a tapped creature you control" (Halo Fountain): untapping is all gain, the most valuable first.
      // Then a mana creature, tapped for mana while paying and untapped for the cost (rulings).
      const pool = [...tapCostCandidates(s, pid, o, c).sort((a, b) => worth(s, pid, obj(s, b)) - worth(s, pid, obj(s, a))), ...untapViaMana(s, pid, o, c)].filter((x) => x !== keep && !out.sacrifice?.includes(x));
      if (pool.length < c.n) return null;
      out.tap = [...(out.tap ?? []), ...pool.slice(0, c.n)];
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
      // Weight of Conscience: the cheapest ones with a creature type in common.
      // Cryptic Gateway: the cheapest that each share a creature type with the biggest creature card in hand that has enough.
      const kin = ab.body.effects.some((e) => e.type === "putFromHand" && e.kinOfCostTapped);
      const gate = kin ? player(s, pid).hand.map((h) => obj(s, h)).filter((h) => isType(defOf(s, h), "Creature")).sort((a, b) => defMv(defOf(s, b)) - defMv(defOf(s, a))).map((h) => pool.filter((x) => shareCreatureType(creatureTypesOf(s, x), creatureTypesOf(s, h)))).find((fit) => fit.length >= c.n) : undefined;
      const picked = kin ? (gate ? gate.slice(0, c.n).map((x) => x.id) : null) : c.shareCreatureType ? shareablePick(s, c, pool.map((x) => x.id)) : pool.length >= c.n ? pool.slice(0, c.n).map((x) => x.id) : null;
      if (!picked) return null;
      out.tap = [...(out.tap ?? []), ...picked];
    } else if (c.kind === "reveal" && !c.orControl && !c.x) {
      // A card revealed from the hand stays there (CR 701.20a); Illuminated Folio: two sharing a color.
      const fits = player(s, pid).hand.filter((x) => x !== o.id && printedMatches(c.filter, defOf(s, obj(s, x))));
      const picked = c.shareColor ? shareablePick(s, c, fits) : fits.length >= c.n ? fits.slice(0, c.n) : null;
      if (!picked) return null;
      out.reveal = picked;
    } else if (c.kind === "collectEvidence") {
      const ids = spareEvidence(s, pid, c.n, undefined, [], c.filter);
      if (!ids) return null;
      out.collect = ids;
    } else if (c.kind === "discard" && c.lastDrawn) {
      // Jandor's Ring: trade the card just drawn only when it's a land we don't need.
      const last = lastDrawnInHand(s, pid);
      if (!last || !isType(defOf(s, obj(s, last)), "Land") || lands(s, pid) < 5) return null;
    } else if (c.kind === "discard" && c.random) {
      if (player(s, pid).hand.length < c.n + 4) return null;
    } else if (c.kind === "discard" && c.sameName) {
      // Sphinx of the Chimes: cards of one name (CR 201.2), the ones we'd rather discard first.
      const order = chooseDiscards(s, pid, player(s, pid).hand.length).filter((x) => x !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))));
      const group = order.map((x) => order.filter((y) => sameName(defOf(s, obj(s, y)).name, defOf(s, obj(s, x)).name))).find((g) => g.length >= c.n);
      if (!group) return null;
      out.discard = group.slice(0, c.n);
    } else if (c.kind === "discard") {
      const hand = player(s, pid).hand.filter((x) => !c.filter || printedMatches(c.filter, defOf(s, obj(s, x))));
      if (hand.length < c.n || player(s, pid).hand.length < c.n + 4) return null;
      const sorted = chooseDiscards(s, pid, player(s, pid).hand.length).filter((x) => hand.includes(x));
      // Ormos, Archive Keeper: one of each name.
      const picks = (c.differentNames ? differentlyNamed(s, sorted) : sorted).slice(0, c.n);
      if (picks.length < c.n) return null;
      out.discard = picks;
    } else if (c.kind === "exileFromGraveyard" && c.process) {
      const cards = processOrder(s, pid, processCandidates(s, pid));
      if (!cards.length) return null;
      out.exileCards = cards.slice(0, 1);
    } else if (c.kind === "exileFromGraveyard" && c.linked && c.filter) {
      // Shelob, Dread Weaver: the cheapest creature card exiled with it (the costlier ones are worth putting onto the
      // battlefield with its other ability).
      const card = linkedCostCards(s, o, c.filter).sort((a, b) => defMv(defOf(s, obj(s, a))) - defMv(defOf(s, obj(s, b))))[0];
      if (!card) return null;
      out.exileCards = [card];
    } else if (c.kind === "exileFromGraveyard" && c.linked) {
      // Jester's Scepter: the exiled card with the name of the spell we target, or not at all.
      const spell = targets.map((t) => (t.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined)).find((x) => x?.objectId);
      const name = spell?.objectId ? defOf(s, obj(s, spell.objectId)).name : undefined;
      const card = linkedExileCards(s, o).find((x) => name !== undefined && defOf(s, obj(s, x)).name.split(" // ").concat(defOf(s, obj(s, x)).name).includes(name));
      if (!card) return null;
      out.exileCards = [card];
    } else if (c.kind === "exileFromGraveyard" && c.top) {
      if (topGraveyardCards(s, pid, c.n, c.filter).length < c.n) return null;
    } else if (c.kind === "exileFromGraveyard" && !c.x) {
      // "Exile a card from your graveyard": cards we have no use for there, the cheapest first.
      const pool = player(s, pid)
        .graveyard.filter((x) => x !== o.id && !out.exileCards?.includes(x) && !usefulInGraveyard(s, x) && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))))
        .sort((a, b) => mv(s, a) - mv(s, b));
      if (pool.length < c.n) return null;
      out.exileCards = [...(out.exileCards ?? []), ...pool.slice(0, c.n)];
    } else if (c.kind === "exileFromHand" && !c.toLibrary && !c.anyNumber && c.n === 1 && ab.body.effects.some((e) => e.type === "suspendCard")) {
      // Jhoira of the Ghitu: the dearest nonland card we couldn't cast with the mana we have, suspended for later.
      const mana = availableMana(s, pid);
      const pick = player(s, pid)
        .hand.filter((x) => x !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))) && mv(s, x) > mana)
        .sort((a, b) => mv(s, b) - mv(s, a))[0];
      if (!pick) return null;
      out.exileFromHand = [pick];
    } else if (c.kind === "mill") {
      // Mill only with plenty of library left: not toward decking ourselves.
      if (player(s, pid).library.length < c.n + 10) return null;
    } else if (c.kind === "removeCounters") {
      const picks = spareCounters(s, pid, o, c);
      if (!picks) return null;
      out.counters = picks;
    } else if (c.kind === "putCounter") {
      const pick = spareCounterHost(s, pid, c, targeted);
      if (!pick) return null;
      out.counterOn = [pick];
    } else return null;
  }
  return out;
}

/**
 * "{T}, Sacrifice a creature you control with mana value X other than ~: Return target creature card with mana value X plus 1
 * from your graveyard to the battlefield" (Sidisi, Regent of the Mire): each X a creature of ours has, its least useful one
 * (never our commander), for the creature card with the most power and toughness among the legal targets; the biggest
 * card first.
 */
function sacrificeMvXPlan(s: GameState, pid: PlayerId, o: GameObject, i: number, ab: ActivatedAbility): Action[] | null {
  if (ab.body.modal || ab.body.targets.length !== 1 || parseManaCost(ab.manaCost).hasX) return null;
  const size = (id: ObjectId) => { const d = defOf(s, obj(s, id)); return Number(d.power ?? 0) + Number(d.toughness ?? 0); };
  const cards = [...player(s, pid).graveyard].filter((c) => isType(defOf(s, obj(s, c)), "Creature")).sort((a, b) => size(b) - size(a));
  const mine = s.battlefield.map((x) => obj(s, x)).filter((c) => c.id !== o.id && controllerOf(s, c) === pid && !c.isCommander && objIsType(s, c, "Creature")).sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
  for (const card of cards) {
    for (const c of mine) {
      const x = characteristics(s, c).manaValue;
      const t: TargetChoice[] = [{ kind: "object", id: card }];
      if (size(card) <= power(s, c) + toughness(s, c)) continue;
      if (abilityProblem(s, pid, o.id, i, t, undefined, undefined, x, { sacrifice: [c.id] })) continue;
      const plan = planActivate(s, pid, o.id, i, t, undefined, undefined, x, { sacrifice: [c.id] });
      if (plan) return plan;
    }
  }
  return null;
}

/** Osgir, the Reconstructor ("{X}, {T}, Exile an artifact card with mana value X from your graveyard: Create two tokens that are copies of the exiled card"): the card with the greatest mana value we can pay X for, never a land. */
function exileMvXPlan(s: GameState, pid: PlayerId, o: GameObject, i: number, ab: ActivatedAbility): Action[] | null {
  if (ab.body.modal || ab.body.targets.length || !ab.body.effects.every((e) => e.type === "createTokenCopy" && e.what.ref === "costExiled")) return null;
  const cost = ab.costs!.find((c) => c.kind === "exileFromGraveyard" && c.mvX)!;
  const cards = player(s, pid).graveyard.filter((c) => cost.kind === "exileFromGraveyard" && !!cost.filter && printedMatches(cost.filter, defOf(s, obj(s, c))) && !isType(defOf(s, obj(s, c)), "Land")).sort((a, b) => defMv(defOf(s, obj(s, b))) - defMv(defOf(s, obj(s, a))));
  for (const card of cards) {
    const x = defMv(defOf(s, obj(s, card)));
    const plan = planActivate(s, pid, o.id, i, undefined, undefined, undefined, x, { exileCards: [card] });
    if (plan) return plan;
  }
  return null;
}

/** Blight N for a payment: our least useful creature among `options` that survives N -1/-1 counters, never our commander; null if none. */
function blightHost(s: GameState, pid: PlayerId, options: ObjectId[], n: number): ObjectId | null {
  const pool = options.map((x) => obj(s, x)).filter((o) => !o.isCommander && toughness(s, o) > n).sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
  return pool[0]?.id ?? null;
}

/**
 * Where we'd put the -1/-1 counters for "Put a -1/-1 counter on a creature you control" (Hatchet Bully) or "blight N": a creature of ours
 * that survives them (toughness above N), the least valuable, never our commander or a target; null if there's none.
 */
function spareCounterHost(s: GameState, pid: PlayerId, c: Extract<AdditionalCost, { kind: "putCounter" }>, targeted: Set<string | number>): ObjectId | null {
  if (c.counter !== "-1/-1") return null;
  const pool = counterOnCandidates(s, pid, c)
    .map((x) => obj(s, x))
    .filter((o) => !o.isCommander && !targeted.has(o.id) && objIsType(s, o, "Creature") && toughness(s, o) > c.n)
    .sort((a, b) => worth(s, pid, a) - worth(s, pid, b));
  return pool[0]?.id ?? null;
}

/**
 * Counters to remove for "Remove three counters from among ... you control" (Tekuthal), or null if we'd rather not: the
 * -1/-1 and stun counters on our permanents first (good riddance), then other counters that do nothing by being there
 * (not lore, loyalty, time, or ones a permanent leaves without, CR 122.1), then +1/+1 counters from creatures with
 * several. Never a planeswalker's last loyalty.
 */
function spareCounters(s: GameState, pid: PlayerId, source: GameObject, c: Extract<AdditionalCost, { kind: "removeCounters" }>): { id: ObjectId; kind: string }[] | null {
  const rank = (k: string) => (harmfulCounter(k) ? 0 : k === "+1/+1" ? 2 : ["loyalty", "lore", "time", "fade", "age", "defense"].includes(k) ? 9 : 1);
  const pool = counterCostCandidates(s, pid, source, c)
    .filter((x) => rank(x.kind) < 9)
    .flatMap((x) => Array.from({ length: x.kind === "+1/+1" ? x.n - 1 : x.n }, () => ({ id: x.id, kind: x.kind })))
    .sort((a, b) => rank(a.kind) - rank(b.kind));
  return pool.length < c.n ? null : pool.slice(0, c.n);
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
 * Is our permanent about to die: an opponent's spell or ability on top of the stack would destroy, exile or kill it, or
 * once blockers are declared, the combat it's in would?
 */
function doomedNow(s: GameState, pid: PlayerId, o: GameObject): boolean {
  const top = s.stack[s.stack.length - 1];
  const hit = combatHits(s);
  if (top) {
    if (top.controller === pid) return false;
    const body = top.body ?? (top.objectId && s.objects[top.objectId] ? compileCard(defOf(s, obj(s, top.objectId))).spell : undefined);
    if (!body) return false;
    const at = (top.targets ?? []).flatMap((t, i) => (!Array.isArray(t) && t.kind === "object" && t.id === o.id ? [i] : []));
    const aimed = (r: { ref: string; index?: number } | undefined) => r?.ref === "target" && at.includes(r.index!);
    return allEffects(body.effects).some(
      (e) =>
        (["destroy", "exile", "putInLibrary", "shuffleIntoLibrary"].includes(e.type) && "what" in e && aimed(e.what)) ||
        (e.type === "damage" && "index" in e.to && aimed(e.to) && damageEstimate(s, top.sourceId && s.objects[top.sourceId] ? obj(s, top.sourceId) : o, { object: o.id }, estimate(e.amount), false) >= Math.max(1, lethalDamage(s, o))) ||
        (e.type === "continuous" && aimed(e.what) && e.mods.reduce((n, m) => n + (m.kind === "modifyPT" ? estimate(m.toughness) : 0), 0) + lethalDamage(s, o) <= 0),
    );
  }
  if (s.step !== "declareBlockers") return false;
  const foes = o.blocking ? o.blocking : o.attacking !== undefined ? (o.blockedBy ?? []) : [];
  const ids = Array.isArray(foes) ? foes : [foes];
  return ids.reduce((n, f) => n + (s.objects[f]?.zone === "battlefield" ? hit(obj(s, f), o) : 0), 0) >= Math.max(1, lethalDamage(s, o)) || ids.some((f) => s.objects[f]?.zone === "battlefield" && objHasKeyword(s, obj(s, f), "Deathtouch") && hit(obj(s, f), o) > 0);
}

/**
 * A coin flip that only saves its source (Frenetic Efreet's "phases out", Viashino Sandswimmer's "return to its owner's
 * hand"; if lost, sacrificed): when an opponent's spell or ability would destroy, exile or kill it, or it's in a combat it
 * would die in, there's nothing to lose by flipping.
 */
function chooseFlipEscape(s: GameState, pid: PlayerId): Action[] | null {
  const doomed = (o: GameObject) => doomedNow(s, pid, o);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid || objHasKeyword(s, o, "Indestructible")) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const f = flipBranches(abilities[i]!.body);
      if (!f || !flipEscape(f) || !doomed(o)) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      const plan = planActivate(s, pid, id, i);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * "Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand"
 * (Together Forever): only for a creature of ours that's about to die (doomedNow), once for it this turn.
 */
function chooseDeathReturn(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.body.targets.length !== 1 || !ab.body.effects.length || !ab.body.effects.every((e) => e.type === "delayed" && e.when === "dies" && e.of?.ref === "target")) continue;
      if (ab.tap || ab.sacrificeSelf || ab.costs?.length) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      for (const c of legalTargets(s, ab.body.targets[0]!, pid, undefined, sourceQuality(s, id), id)) {
        if (c.kind !== "object") continue;
        const t = obj(s, c.id);
        if (controllerOf(s, t) !== pid || !objIsType(s, t, "Creature") || objHasKeyword(s, t, "Indestructible") || t.isToken || !doomedNow(s, pid, t)) continue;
        // Already set up for it this turn (the delayed trigger is waiting), or the activation is on the stack.
        if ((s.delayed ?? []).some((d) => d.dies && d.subject.id === t.id && d.subject.zc === (t.zoneChanges ?? 0) && d.controller === pid)) continue;
        if (s.stack.some((x) => x.controller === pid && x.sourceId === id && x.targets?.some((y) => !Array.isArray(y) && y.kind === "object" && y.id === t.id))) continue;
        const plan = planActivate(s, pid, id, i, [{ kind: "object", id: t.id }]);
        if (plan) return plan;
      }
    }
  }
  return null;
}

/**
 * "Return target commander you own from the battlefield to your hand" (Sanctum of Eternity): a commander of ours that's
 * about to die or be exiled (doomedNow), or that an opponent controls, back to our hand, where it's cast again without
 * commander tax (CR 903.8 counts only casts from the command zone).
 */
function chooseCommanderReturn(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      const t = ab.body.targets[0];
      if (ab.body.targets.length !== 1 || t?.kind !== "object" || !t.commander || t.owner !== "you") continue;
      if (ab.body.effects.length !== 1 || ab.body.effects[0]!.type !== "bounce" || ab.sacrificeSelf || ab.costs?.length) continue;
      const problem = abilityProblem(s, pid, id, i);
      if (problem && !/not enough mana/.test(problem)) continue;
      for (const c of legalTargets(s, t, pid, undefined, sourceQuality(s, id), id)) {
        if (c.kind !== "object") continue;
        const cmd = obj(s, c.id);
        if (controllerOf(s, cmd) === pid && !doomedNow(s, pid, cmd)) continue;
        if (s.stack.some((x) => x.controller === pid && x.sourceId === id)) continue;
        const plan = planActivate(s, pid, id, i, [{ kind: "object", id: cmd.id }]);
        if (plan) return plan;
      }
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
  // Encircling Fissure: its awaken half only when cast for that cost, which the bot doesn't do here.
  return body.effects.some((e) => e.type === "damageRule") && body.effects.every((e) => e.type === "damageRule" || (e.type === "gainLife" && e.who.ref === "you") || (e.type === "if" && e.cond.kind === "altPaid"));
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
    // Redirections count when the damage can go to an opponent: any target, or back to the threat (Reverberation's spell's
    // controller, Aegis of Honor's, Turn the Tables' attacking creature).
    const back = (r.redirect?.ref === "targetController" && !!r.by?.target) || (r.redirect?.ref === "target" && t.kind === "combat" && r.combat === "only" && r.to?.players === "you" && !r.by);
    if (r.redirect && r.redirect.ref !== "anyTarget" && !back) continue;
    // Reflect Damage: a chosen attacker's damage goes back to its controller too.
    if (r.redirectToSourceController && t.kind !== "stack" && !r.by?.choose) continue;
    const me = !r.to || r.to.players === "you" || r.to.players === "all" || (!!r.to.target && r.to.target.ref === "anyTarget");
    const mine = !r.to || (!!r.to.objects && r.to.objects.controller !== "opponent") || !!r.to.target;
    const saved = (cs: GameObject[]) => (mine ? cs.reduce((n, c) => n + worth(s, pid, c), 0) : 0);
    const fits = (spec: TargetSpec, o: GameObject | undefined, d: CardDef) => (o?.zone === "battlefield" ? objectMatches(s, spec, o, pid, false) : printedMatches(spec, d));
    let v = 0;
    if (t.kind === "stack") {
      if (r.by?.choose && !fits(bindChosen(r.by.choose, chosen), t.source, t.def)) continue;
      if (r.by?.filter && !fits(bindChosen(r.by.filter, chosen), t.source, t.def)) continue;
      if (r.by?.target && t.item.kind !== "spell") continue;
      if (r.by?.spellOnly && t.item.kind !== "spell") continue;
      v = (me ? t.toMe : 0) + saved(t.creatures);
    } else {
      if (r.by?.target) continue;
      // Encircling Fissure: aimed at the attacking player (shieldTargets), whose creatures these all are.
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
    const legal = legalTargets(s, spec, pid, undefined, sourceId ? botSource(s, sourceId) : undefined, sourceId);
    const pick = (want: TargetChoice | undefined) => (want && legal.some((x) => sameTarget(x, want)) ? want : undefined);
    let choice: TargetChoice | undefined;
    if (rules.some((r) => r.to?.target && refCovers(r.to.target, i))) choice = pick(t.toMe > 0 ? { kind: "player", id: pid } : t.creatures[0] ? { kind: "object", id: t.creatures[0].id } : undefined);
    // Turn the Tables: the attacker that would deal the most.
    else if (rules.some((r) => r.redirect?.ref === "target" && refCovers(r.redirect, i)) && t.kind === "combat") choice = pick([...t.attackers].sort((a, b) => power(s, b) - power(s, a)).map((a) => ({ kind: "object" as const, id: a.id })).find((x) => legal.some((y) => sameTarget(x, y))));
    else if (rules.some((r) => r.redirect && r.redirect.ref !== "targetController" && refCovers(r.redirect, i))) choice = pick(foe !== undefined ? { kind: "player", id: foe } : undefined);
    else if (rules.some((r) => r.by?.target && refCovers(r.by.target, i)) && t.kind === "stack") choice = pick({ kind: "stack", id: t.item.id });
    // Encircling Fissure: the player whose creatures threaten it; its awaken land isn't a target unless cast for awaken.
    else if (rules.some((r) => r.by?.controllerTarget === i)) choice = pick(foe !== undefined ? { kind: "player", id: foe } : undefined);
    else if (spec.onlyIf?.cond.kind === "altPaid" && !spec.onlyIf.not) choice = { kind: "none" };
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
/** What a card is worth in a player's hand, for piles: a land a little, a spell more the more it costs. */
function handWorth(s: GameState, id: string): number {
  return isType(defOf(s, obj(s, id)), "Land") ? 1.5 : 1 + Math.min(mv(s, id), 7) * 0.5;
}

/** What a permanent is worth to its controller, for piles of permanents. */
function permanentWorth(s: GameState, pid: PlayerId, id: string): number {
  return targetWorth(s, pid, { kind: "object", id }, false, 0);
}

/** The first of two piles that splits `cards` as evenly as can be by handWorth (every split tried, up to 12 cards). */
function evenPiles(s: GameState, pid: PlayerId, cards: string[], worthOf: (id: string) => number = (id) => handWorth(s, id)): string[] {
  void pid;
  const worth = cards.map(worthOf);
  const total = worth.reduce((a, b) => a + b, 0);
  if (cards.length > 12) {
    // Greedy: the most valuable cards first, each into the lighter pile.
    const order = cards.map((id, i) => ({ id, w: worth[i]! })).sort((a, b) => b.w - a.w);
    const one: string[] = [];
    let w1 = 0;
    let w2 = 0;
    for (const c of order) {
      if (w1 <= w2) {
        one.push(c.id);
        w1 += c.w;
      } else w2 += c.w;
    }
    return one;
  }
  let best = 0;
  let gap = Infinity;
  for (let mask = 0; mask < 1 << cards.length; mask++) {
    let w = 0;
    for (let i = 0; i < cards.length; i++) if (mask & (1 << i)) w += worth[i]!;
    const g = Math.abs(total - 2 * w);
    if (g < gap) {
      gap = g;
      best = mask;
    }
  }
  return cards.filter((_, i) => best & (1 << i));
}

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

/** Cycle (CR 702.29a) lands we don't need and spells we're far from casting, or use their channel abilities and the like. */
/**
 * Forecast (CR 702.57): during our own upkeep, with the stack empty, reveal a card from our hand for its ability when it
 * does something and has a good target. The card stays in hand; "only once each turn" is checked by the rules.
 */
function chooseForecast(s: GameState, pid: PlayerId): Action[] | null {
  if (s.activePlayer !== pid || s.step !== "upkeep" || s.stack.length) return null;
  for (const id of player(s, pid).hand) {
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.keyword !== "Forecast" || doesNothingNow(s, id, ab.body)) continue;
      const targets = ab.body.targets.length ? chooseTargets(s, pid, ab.body, false, id) : undefined;
      if (ab.body.targets.length && !targets) continue;
      // Sky Hussar: "Tap two untapped white and/or blue creatures you control".
      const costs = abilityCosts(s, pid, obj(s, id), ab, targets ?? []);
      if (costs === null) continue;
      const plan = planActivate(s, pid, id, i, targets ?? undefined, undefined, undefined, undefined, costs);
      if (plan) return plan;
    }
  }
  return null;
}

function chooseCycling(s: GameState, pid: PlayerId): Action[] | null {
  const lands = s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;
  for (const id of player(s, pid).hand) {
    const o = obj(s, id);
    const d = defOf(s, o);
    const useless = isType(d, "Land") ? lands >= 6 : mv(s, id) > lands + 2;
    if (!useless) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (ab.zone !== "hand" || doesNothingNow(s, id, ab.body)) continue;
      // Channel and the like aim at something: only with a good target (an opponent's permanent to destroy).
      const targets = ab.body.targets.length ? chooseTargets(s, pid, ab.body, false, id) : undefined;
      if (ab.body.targets.length && !targets) continue;
      // Jarad, Golgari Lich Lord's "Sacrifice a Swamp and a Forest": spare lands only (abilityCosts).
      const costs = abilityCosts(s, pid, obj(s, id), ab, targets ?? []);
      if (costs === null) continue;
      const plan = planActivate(s, pid, id, i, targets ?? undefined, undefined, undefined, undefined, costs);
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
      // Carth the Lion: the cost as changed ([+1] more), what the planeswalker is left with.
      const cost = loyaltyChange(s, o, pid, ab, x);
      if (ab.loyaltyX && (x ?? 0) < 1) continue;
      const after = loyalty + cost;
      const ultimate = (ab.loyaltyX ? -(x ?? 0) : ab.loyalty!) <= -6;
      if (after < 0 || (after === 0 && !ultimate)) continue;
      const problem = abilityProblem(s, pid, id, i, undefined, undefined, undefined, x);
      if (problem && !/not enough mana/.test(problem)) continue;
      const modes = ab.body.modal ? chooseModes(s, pid, ab.body, false, id)?.modes : undefined;
      if (ab.body.modal && !modes) continue;
      const body = withModes(ab.body, modes);
      if ((groupValue(s, pid, body, guessChosen(s, pid, defOf(s, o)), id) ?? 1) <= 0) continue;
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
/**
 * The combat damage one creature would deal another or a player as things stand: its combat damage after the damage
 * amount replacements and prevention it would meet (doublers like Furnace of Rath and Torbran, halvers, Fog, protection;
 * damageEstimate). Worked out once per pair for one decision.
 */
function combatHits(s: GameState): (from: GameObject, to: GameObject | PlayerId) => number {
  const memo = new Map<string, number>();
  return (from, to) => {
    const k = `${from.id}>${typeof to === "number" ? `p${to}` : to.id}`;
    let n = memo.get(k);
    if (n === undefined) memo.set(k, (n = damageEstimate(s, from, typeof to === "number" ? { player: to } : { object: to.id }, Math.max(0, combatDamageOf(s, from)))));
    return n;
  };
}

function attackPlaneswalkers(s: GameState, pid: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[], hit = combatHits(s)) {
  const atPlayer = (d: PlayerId) => attacks.filter((a) => a.defender === d && a.planeswalker === undefined).reduce((n, a) => n + hit(obj(s, a.attacker), d), 0);
  const walkers = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => objIsType(s, o, "Planeswalker") && opponents(s, pid).includes(controllerOf(s, o)) && attackablePermanentProblem(s, pid, controllerOf(s, o), o.id) === null)
    .sort((a, b) => (b.counters.loyalty ?? 0) - (a.counters.loyalty ?? 0));
  for (const pw of walkers) {
    const owner = controllerOf(s, pw);
    if (atPlayer(owner) >= player(s, owner).life) continue;
    const blockers = s.battlefield.map((id) => obj(s, id)).filter((b) => controllerOf(s, b) === owner && !b.tapped && objIsType(s, b, "Creature"));
    const free = attacks
      .filter((a) => a.planeswalker === undefined && !characteristics(s, obj(s, a.attacker)).goadedBy.length && !mustAttackPlayers(s, obj(s, a.attacker)).length && !attackProblem(s, obj(s, a.attacker), owner))
      .filter((a) => blockers.every((b) => blockProblem(s, b, obj(s, a.attacker), owner)))
      .filter((a) => hit(obj(s, a.attacker), pw) > 0)
      .sort((a, b) => hit(obj(s, a.attacker), pw) - hit(obj(s, b.attacker), pw));
    let need = pw.counters.loyalty ?? 0;
    const moved: typeof attacks = [];
    for (const a of free) {
      if (need <= 0) break;
      moved.push(a);
      need -= hit(obj(s, a.attacker), pw);
    }
    if (need > 0 || moved.length > (abilitiesOf(s, pw).combatLimit?.attackSelf ?? Infinity)) continue;
    for (const a of moved) {
      a.defender = owner;
      a.planeswalker = pw.id;
    }
  }
  return attacks;
}

/**
 * Our own Sieges (CR 310.12): attackers that its protector can't block go at one when, together, they remove all its
 * defense this combat, so it flips (310.12b). Not when they're needed to finish off a player; other players' battles
 * we leave alone, as defeating one helps its controller.
 */
function attackBattles(s: GameState, pid: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[], hit = combatHits(s)) {
  const atPlayer = (d: PlayerId) => attacks.filter((a) => a.defender === d && a.planeswalker === undefined).reduce((n, a) => n + hit(obj(s, a.attacker), d), 0);
  const battles = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => objIsType(s, o, "Battle") && controllerOf(s, o) === pid && o.protector !== undefined && attackablePermanentProblem(s, pid, o.protector, o.id) === null)
    .sort((a, b) => (a.counters.defense ?? 0) - (b.counters.defense ?? 0));
  for (const b of battles) {
    const guard = b.protector!;
    const blockers = s.battlefield.map((id) => obj(s, id)).filter((x) => controllerOf(s, x) === guard && !x.tapped && objIsType(s, x, "Creature"));
    const free = attacks
      .filter((a) => a.planeswalker === undefined && !characteristics(s, obj(s, a.attacker)).goadedBy.length && !mustAttackPlayers(s, obj(s, a.attacker)).length && !attackProblem(s, obj(s, a.attacker), guard))
      .filter((a) => atPlayer(a.defender) < player(s, a.defender).life)
      .filter((a) => blockers.every((x) => blockProblem(s, x, obj(s, a.attacker), guard)))
      .filter((a) => hit(obj(s, a.attacker), b) > 0)
      .sort((x, y) => hit(obj(s, x.attacker), b) - hit(obj(s, y.attacker), b));
    let need = b.counters.defense ?? 0;
    const moved: typeof attacks = [];
    for (const a of free) {
      if (need <= 0) break;
      moved.push(a);
      need -= hit(obj(s, a.attacker), b);
    }
    if (need > 0) continue;
    for (const a of moved) {
      a.defender = guard;
      a.planeswalker = b.id;
    }
  }
  return attacks;
}

function chooseAttacks(s: GameState, pid: PlayerId): Action[] {
  // Damage to a player with protection from us is prevented (CR 702.16k): attack someone else when we can.
  const all = opponents(s, pid);
  const open = all.filter((d) => !playerProtectedFrom(s, d, pid));
  const opps = open.length ? open : all;
  // Pressure whoever is lowest on life, but take the crown from an opponent who's the monarch
  // (CR 725.2) unless someone else is low enough to finish.
  const lowest = [...opps].sort((a, b) => player(s, a).life - player(s, b).life)[0]!;
  // Damage doublers and halvers, prevention and protection count (CR 614.1a, 615).
  const hit = combatHits(s);
  const reach = potentialAttackers(s, pid).reduce((n, o) => n + hit(o, lowest), 0);
  const target = s.monarch !== undefined && opps.includes(s.monarch) && player(s, lowest).life > reach ? s.monarch : lowest;
  const theirBlockers = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === target && !o.tapped && objIsType(s, o, "Creature"));
  const ready = potentialAttackers(s, pid).filter((o) => hit(o, target) > 0 && !attackProblem(s, o, target));
  const survivesBlocks = (o: GameObject) => theirBlockers.every((b) => blockProblem(s, b, o, target) || hit(b, o) < toughness(s, o));
  // Swing with everything when we outnumber their untapped blockers; otherwise only with creatures that survive a block.
  const allIn = ready.length > theirBlockers.length;
  // Creatures that attack each combat if able have to (CR 508.1d), whatever their power, at whoever they can.
  const must = potentialAttackers(s, pid).filter((o) => characteristics(s, o).attacksIfAble && !ready.includes(o));
  let attacks = [
    ...ready
      .filter((o) => allIn || characteristics(s, o).attacksIfAble || survivesBlocks(o))
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
    const d = mustAttackPlayers(s, o).find((x) => opps.includes(x) && !attackProblem(s, o, x));
    if (d === undefined) continue;
    attacks = [...attacks.filter((a) => a.attacker !== o.id), { attacker: o.id, defender: d }];
  }
  // One that has to attack Gideon attacks him if able, unless attacking a player obeys more of its requirements (CR 508.1d).
  const walkerBound: { attacker: ObjectId; defender: PlayerId; planeswalker: ObjectId }[] = [];
  for (const o of potentialAttackers(s, pid)) {
    const ws = walkersFreeToAttack(s, o);
    if (!ws.length) continue;
    const other = Math.max(0, ...opps.filter((d) => !attackProblem(s, o, d)).map((d) => attackTargetScore(s, o, d)));
    if (other > 1) continue;
    attacks = attacks.filter((a) => a.attacker !== o.id);
    walkerBound.push({ attacker: o.id, defender: controllerOf(s, obj(s, ws[0]!)), planeswalker: ws[0]! });
  }
  // War's Toll: attacking with any means attacking with all that can (CR 508.1d); the rest join, at whoever they can.
  if (attacks.length && attackAllIfOne(s, pid) !== undefined)
    for (const o of potentialAttackers(s, pid)) {
      if (attacks.some((a) => a.attacker === o.id) || walkerBound.some((a) => a.attacker === o.id)) continue;
      const d = !attackProblem(s, o, target) ? target : opps.find((x) => !attackProblem(s, o, x));
      if (d !== undefined) attacks.push({ attacker: o.id, defender: d });
    }
  // Viashino Bey: with it attacking, all the others that can join it (CR 508.1d); Ekundu Cyclops joins any attack.
  if (attacks.length) {
    const bey = attacks.some((a) => abilitiesOf(s, obj(s, a.attacker)).allAttackIfSelfAttacks);
    for (const o of potentialAttackers(s, pid)) {
      if (attacks.some((a) => a.attacker === o.id) || walkerBound.some((a) => a.attacker === o.id) || !(bey || abilitiesOf(s, o).attacksIfOneAttacks)) continue;
      const d = !attackProblem(s, o, target) ? target : opps.find((x) => !attackProblem(s, o, x));
      if (d !== undefined) attacks.push({ attacker: o.id, defender: d });
    }
  }
  // One that can't attack alone stays home rather than attack by itself (CR 506.5).
  if (attacks.length === 1 && characteristics(s, obj(s, attacks[0]!.attacker)).cantAttackAlone) attacks = [];
  // Scarred Puma stays home without a black or green creature beside it (CR 508.1c).
  for (let i = 0; i < 4; i++) {
    const kept = attacks.filter((a) => !withoutCompany(s, a.attacker, attacks));
    if (kept.length === attacks.length) break;
    attacks = kept;
  }
  // One that can only attack alone (Master of Cruelties) stays home when others attack (CR 506.5).
  if (attacks.length > 1) attacks = attacks.filter((a) => !characteristics(s, obj(s, a.attacker)).onlyAttacksAlone);
  // Exalted Dragon, Leviathan: they attack when the lands to sacrifice are spare (seven left after), and only if all such
  // costs can be paid together (CR 508.1i). Floodtide Serpent's returning an enchantment isn't weighed: it stays home.
  const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  const costsOf = (a: { attacker: ObjectId }) => characteristics(s, obj(s, a.attacker)).ownAttackCosts;
  const spare = (a: { attacker: ObjectId }) => costsOf(a).every((c) => c.action === "sacrifice" && attackCostOptions(s, pid, c).every((id) => objIsType(s, obj(s, id), "Land")));
  attacks = attacks.filter((a) => !costsOf(a).length || spare(a));
  const landsPaid = attacks.reduce((n, a) => n + costsOf(a).reduce((t, c) => t + c.n, 0), 0);
  if (landsPaid && (lands - landsPaid < 7 || !attackCostsPayable(s, pid, attacks.flatMap(costsOf)))) attacks = attacks.filter((a) => !costsOf(a).length);
  let declared = [...attackBattles(s, pid, attackPlaneswalkers(s, pid, attacks, hit), hit), ...walkerBound];
  // "No more than one creature can attack each combat" (Silent Arbiter): the ones that have to attack, then the strongest.
  const cap = combatLimit(s, "attack");
  if (declared.length > cap) {
    const must = (a: { attacker: string }) => (characteristics(s, obj(s, a.attacker)).attacksIfAble ? 1 : 0);
    declared = [...declared].sort((a, b) => must(b) - must(a) || power(s, obj(s, b.attacker)) - power(s, obj(s, a.attacker))).slice(0, cap);
  }
  // Crawlspace: no more than its limit at that player; the ones that have to attack and the strongest stay, the rest go at
  // another opponent with room, or stay home.
  for (const d of opps) {
    const room = attackYouLimit(s, d);
    const at = declared.filter((a) => a.defender === d && a.planeswalker === undefined);
    if (at.length <= room) continue;
    const must = (a: { attacker: string }) => (characteristics(s, obj(s, a.attacker)).attacksIfAble ? 1 : 0);
    const extra = [...at].sort((a, b) => must(b) - must(a) || power(s, obj(s, b.attacker)) - power(s, obj(s, a.attacker))).slice(room);
    declared = declared.flatMap((a) => {
      if (!extra.includes(a)) return [a];
      const o = obj(s, a.attacker);
      const other = opps.find((x) => x !== d && !attackProblem(s, o, x) && !attackTaxPer(s, x, false, o.id) && declared.filter((y) => y.defender === x && y.planeswalker === undefined).length < attackYouLimit(s, x));
      return other === undefined ? [] : [{ attacker: a.attacker, defender: other }];
    });
  }
  // Ghostly Prison: pay what attacking costs if we can (CR 508.1g-i); otherwise send the weakest taxed attacker at
  // someone it costs nothing to attack, or keep it home. Nothing obliges paying for a requirement (CR 508.1d).
  for (;;) {
    const tax = attackCost(s, declared);
    // Phyrexian symbols the pool can't pay take 2 life each (Norn's Annex): not down to 10 or less.
    const symbols = parseManaCost(tax).symbols.filter((x) => x.kind === "phyrexian").length;
    const taps = tax && !(symbols && player(s, pid).life - 2 * symbols <= 10) ? planMana(s, pid, parseManaCost(tax)) : tax ? null : [];
    // Sivitri, Dragon Master: the life it costs, paid only while that leaves more than 10.
    const lifeTax = attackLifeCost(s, declared);
    if (taps && (!lifeTax || (payableLife(s, pid) >= lifeTax && player(s, pid).life - lifeTax - 2 * symbols > 10))) {
      if (declared.length === 1 && characteristics(s, obj(s, declared[0]!.attacker)).cantAttackAlone) declared = [];
      if (declared.some((a) => withoutCompany(s, a.attacker, declared))) declared = declared.filter((a) => !withoutCompany(s, a.attacker, declared));
      return [...(declared.length ? taps : []), { type: "declareAttackers", player: pid, attacks: declared }];
    }
    const taxed = declared.filter((a) => attackTaxOf(s, a)).sort((a, b) => power(s, obj(s, a.attacker)) - power(s, obj(s, b.attacker)))[0]!;
    const o = obj(s, taxed.attacker);
    const elsewhere = opps.find((d) => !attackTaxPer(s, d, false, o.id) && !attackProblem(s, o, d) && !characteristics(s, o).goadedBy.includes(d));
    declared = declared.flatMap((a) => (a !== taxed ? [a] : elsewhere !== undefined ? [{ attacker: a.attacker, defender: elsewhere }] : []));
  }
}

/**
 * Archangel of Tithes: the mana for blocking (CR 509.1d-f), tapped before the declaration. Blockers we can't pay for are
 * left out, the last chosen first (the chump blocks and extras), with any attacker then left with too few blockers.
 */
function payForBlocks(s: GameState, pid: PlayerId, a: Action): Action[] {
  if (a.type !== "declareBlockers" || !(blocksMayCost(s, pid) || blocksMayCostLife(s))) return [a];
  let blocks = a.blocks;
  for (;;) {
    const blockers = [...new Set(blocks.map((b) => b.blocker))];
    const cost = blockCost(s, blockers.length, blockers, blocks);
    // Heat Wave: life for blocks, only while 10 or more is left after paying.
    const life = blockLifeCost(s, blocks);
    const taps = cost ? planMana(s, pid, parseManaCost(cost)) : [];
    if (taps && (!life || player(s, pid).life - life >= 10)) return [...taps, { ...a, blocks }];
    // Qal Sisma Behemoth: the last one chosen that costs something to block.
    const drop = [...blockers].reverse().find((b) => !!blockCost(s, 1, [b], blocks.filter((x) => x.blocker === b)) || blockLifeCost(s, blocks.filter((x) => x.blocker === b)) > 0)!;
    blocks = blocks.filter((b) => b.blocker !== drop);
    blocks = blocks.filter((b) => blocks.filter((x) => x.attacker === b.attacker).length >= blockersNeeded(s, obj(s, b.attacker)));
    const earlier = s.battlefield.some((id) => obj(s, id).blocking !== undefined);
    if (blocks.length === 1 && !earlier && characteristics(s, obj(s, blocks[0]!.blocker)).cantBlockAlone) blocks = [];
    blocks = withCompany(s, blocks);
  }
}

/** Orcish Conscripts: leave out blockers without enough other blockers with them, until the rest are legal (CR 509.1b). */
function withCompany<B extends { blocker: ObjectId; attacker: ObjectId }>(s: GameState, blocks: B[]): B[] {
  const earlier = s.battlefield.filter((id) => obj(s, id).blocking !== undefined).length;
  for (let out = blocks; ; ) {
    if (!blockWithoutCompany(s, out, earlier)) return out;
    const lonely = lonelyBlocker(s, out, earlier)!;
    out = out.filter((b) => b.blocker !== lonely);
    out = out.filter((b) => out.filter((x) => x.attacker === b.attacker).length >= blockersNeeded(s, obj(s, b.attacker)));
  }
}

/**
 * Odric, Master Tactician: we choose `defender`'s blocks against our attack. No blocks lets every attacker through; when a
 * requirement makes some creature block (CR 509.1c), the blocks they'd choose themselves, which obey it.
 */
function blocksForOpponent(s: GameState, pid: PlayerId, defender: PlayerId): Action {
  // Blocks that cost mana (Archangel of Tithes) oblige no one (CR 509.1c): none, then.
  if (blockCost(s, 1) || !blockRequirementProblem(s, defender, [])) return { type: "declareBlockers", player: pid, blocks: [] };
  const theirs = chooseBlocks(s, defender);
  return { type: "declareBlockers", player: pid, blocks: theirs.type === "declareBlockers" ? theirs.blocks : [] };
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
  // Damage doublers and halvers, prevention and protection count (CR 614.1a, 615).
  const hit = combatHits(s);
  const totalIncoming = incoming.filter((a) => !a.attackingPermanent).reduce((n, a) => n + hit(a, pid), 0);
  const desperate = totalIncoming >= me.life;
  // Requirements first (CR 509.1c): every creature able to block a lure blocks one, and a creature that
  // must be blocked if able gets our sturdiest blocker (two against menace).
  for (const at of incoming.filter((a) => (characteristics(s, a).allMustBlock || characteristics(s, a).allMustBlockBy) && !characteristics(s, a).maxOneBlocker)) {
    const all = characteristics(s, at).allMustBlock;
    const able = mine.filter((b) => !used.has(b.id) && !blockProblem(s, b, at) && (all || lureBinds(s, at, b)));
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
    const at = able.find((a) => toughness(s, b) > hit(a, b)) ?? able.find((a) => hit(b, a) >= toughness(s, a)) ?? able[0];
    if (!at) continue;
    const helpers = mine.filter((o) => o.id !== b.id && !used.has(o.id) && !blockProblem(s, o, at)).sort((x, y) => toughness(s, y) - toughness(s, x)).slice(0, blockersNeeded(s, at) - 1);
    for (const o of [b, ...helpers]) {
      used.add(o.id);
      blocks.push({ blocker: o.id, attacker: at.id });
    }
  }
  // Blaze of Glory: one that must block each attacking creature blocks every one it can (CR 509.1c), with helpers against
  // menace.
  for (const b of mine.filter((o) => characteristics(s, o).mustBlockEach && !used.has(o.id))) {
    used.add(b.id);
    for (const at of incoming) {
      if (blocks.filter((x) => x.blocker === b.id).length >= maxBlocks(s, b) || blockProblem(s, b, at)) continue;
      const helpers = mine.filter((o) => o.id !== b.id && !used.has(o.id) && !blockProblem(s, o, at)).sort((x, y) => toughness(s, y) - toughness(s, x)).slice(0, blockersNeeded(s, at) - 1);
      if (helpers.length < blockersNeeded(s, at) - 1) continue;
      for (const o of [b, ...helpers]) {
        used.add(o.id);
        blocks.push({ blocker: o.id, attacker: at.id });
      }
    }
  }
  // Slayer's Cleaver: "must be blocked by an Eldrazi if able": our sturdiest one of those blocks it, with helpers against
  // menace.
  for (const at of incoming.filter((a) => !!characteristics(s, a).mustBeBlockedBy)) {
    for (const f of characteristics(s, at).mustBeBlockedBy!) {
      if (blocks.some((b) => b.attacker === at.id && objectMatches(s, f, obj(s, b.blocker), controllerOf(s, at), false))) continue;
      const able = mine.filter((b) => !used.has(b.id) && !blockProblem(s, b, at)).sort((a, b) => toughness(s, b) - toughness(s, a));
      const fits = able.find((b) => objectMatches(s, f, b, controllerOf(s, at), false));
      const n = blockersNeeded(s, at) - blocks.filter((b) => b.attacker === at.id).length;
      if (!fits || able.length < n) continue;
      for (const b of [fits, ...able.filter((x) => x !== fits)].slice(0, Math.max(1, n))) {
        used.add(b.id);
        blocks.push({ blocker: b.id, attacker: at.id });
      }
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
    if (blockersNeeded(s, at) > 1 || cantBeBlockedNow(s, at)) continue;
    const canBlock = mine.filter((b) => !used.has(b.id) && !blockProblem(s, b, at));
    const good = canBlock.find((b) => toughness(s, b) > hit(at, b) && !(objHasKeyword(s, at, "Deathtouch") && hit(at, b) > 0));
    const trade = canBlock.find((b) => hit(b, at) >= toughness(s, at));
    const pick = good ?? trade ?? (desperate ? canBlock[0] : undefined);
    if (pick) {
      used.add(pick.id);
      blocks.push({ blocker: pick.id, attacker: at.id });
    }
  }
  // A creature that can block more than one creature (CR 509.1a) also takes on attackers nobody blocks, as long
  // as it survives all of them together.
  const hurt = (b: GameObject) => blocks.filter((x) => x.blocker === b.id).reduce((n, x) => n + (objHasKeyword(s, obj(s, x.attacker), "Deathtouch") ? Infinity : hit(obj(s, x.attacker), b)), 0);
  for (const at of [...incoming].sort((a, b) => power(s, b) - power(s, a))) {
    if (blocks.some((b) => b.attacker === at.id) || blockersNeeded(s, at) > 1 || objHasKeyword(s, at, "Deathtouch") || cantBeBlockedNow(s, at)) continue;
    const extra = mine.find((b) => used.has(b.id) && blocks.filter((x) => x.blocker === b.id).length < maxBlocks(s, b) && !blockProblem(s, b, at) && toughness(s, b) > hurt(b) + hit(at, b));
    if (extra) blocks.push({ blocker: extra.id, attacker: at.id });
  }
  // "No more than one creature can block each combat" (Silent Arbiter): the first blockers chosen (requirements came
  // first), then none on an attacker left with too few to block it.
  // Mirri, Weatherlight Duelist: this player's own limit this combat too.
  const cap = Math.min(combatLimit(s, "block") - s.battlefield.filter((id) => obj(s, id).blocking !== undefined).length, playerBlockLimit(s, pid) - s.battlefield.filter((id) => obj(s, id).blocking !== undefined && controllerOf(s, obj(s, id)) === pid).length);
  const blockers = [...new Set(blocks.map((b) => b.blocker))];
  if (blockers.length > cap) {
    const kept = new Set(blockers.slice(0, Math.max(0, cap)));
    const left = blocks.filter((b) => kept.has(b.blocker));
    blocks.length = 0;
    blocks.push(...left.filter((b) => left.filter((x) => x.attacker === b.attacker).length >= blockersNeeded(s, obj(s, b.attacker))));
  }
  // One that can't block alone doesn't block by itself (CR 506.5).
  const earlier = s.battlefield.some((id) => obj(s, id).blocking !== undefined);
  if (blocks.length === 1 && !earlier && characteristics(s, obj(s, blocks[0]!.blocker)).cantBlockAlone) blocks.length = 0;
  const kept = withCompany(s, blocks);
  return { type: "declareBlockers", player: pid, blocks: kept };
}

const LAND_COLOR: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

/**
 * "Target land becomes the basic land type of your choice" (Reef Shaman): our own land makes the color our hand and
 * commander need most; an opponent's makes a color their commander can't use.
 */
/** The land type the most opponents control a land of (a snow land for snow landwalk), the first one on a tie. */
function chooseLandwalkType(s: GameState, pid: PlayerId, options: string[], snow: boolean): string {
  const score = (t: string) => s.players.filter((p) => p.id !== pid && !p.lost).filter(({ id: op }) => s.battlefield.some((id) => {
    const o = obj(s, id);
    const c = characteristics(s, o);
    return controllerOf(s, o) === op && c.types.includes("Land") && c.subtypes.includes(t) && (!snow || c.supertypes.includes("Snow"));
  })).length;
  return options.reduce((best, t) => (score(t) > score(best) ? t : best), options[0]!);
}

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

/**
 * Cards going into our graveyard together, or all of it (CR 404.3), top first: the biggest creature cards on top (for
 * Corpse Dance and Mistmoon Griffin), and a card that wants "a creature card directly above it" (Krovikan Horror,
 * Death Spark) just under one.
 */
function orderOwnGraveyard(s: GameState, cards: ObjectId[]): ObjectId[] {
  const d = (id: ObjectId) => defOf(s, obj(s, id));
  const creature = (id: ObjectId) => d(id).types.includes("Creature");
  const below = (id: ObjectId) => /directly above it/.test(d(id).oracleText ?? "");
  const order = [...cards].sort((a, b) => Number(creature(b)) - Number(creature(a)) || mv(s, b) - mv(s, a));
  for (const id of order.filter(below)) {
    order.splice(order.indexOf(id), 1);
    const over = order.findIndex((x) => creature(x) && !below(x));
    order.splice(over < 0 ? order.length : over + 1, 0, id);
  }
  return order;
}

/**
 * "As ~ enters, choose a player/an opponent" for a permanent whose own power and toughness count the chosen player's
 * cards (Nyxathid's -1/-1 per card in their hand, Sewer Nemesis's graveyard), or whose "at the beginning of the chosen
 * player's upkeep" trigger deals damage (Black Vise, The Rack): a score for each player, higher is better for us.
 * Undefined when the permanent's abilities don't depend on the chosen player that way.
 */
function chosenPlayerScore(s: GameState, o: GameObject, pid: PlayerId): ((x: PlayerId) => number) | undefined {
  const c = compileCard(defOf(s, o));
  const asEvent = <T>(v: T): T => JSON.parse(JSON.stringify(v).replaceAll('{"ref":"selfChosenPlayer"}', '{"ref":"eventPlayer"}'));
  const pts = (c.statics ?? []).filter((st) => st.affects.kind === "self").flatMap((st) => st.mods).filter((m) => (m.kind === "modifyPT" || m.kind === "definePT") && JSON.stringify(m).includes('"selfChosenPlayer"'));
  const hurts = (c.triggers ?? []).filter((t) => t.chosenPlayersTurn).flatMap((t) => t.body.effects).filter((e) => e.type === "damage" && JSON.stringify(e.to) === '{"ref":"eventPlayer"}');
  if (!pts.length && !hurts.length) return undefined;
  return (x) => {
    const ctx = { controller: pid, sourceId: o.id, event: { player: x } };
    let n = 0;
    for (const m of pts) if (m.kind === "modifyPT" || m.kind === "definePT") n += (m.power ? evalAmount(s, asEvent(m.power), ctx) : 0) + (m.toughness ? evalAmount(s, asEvent(m.toughness), ctx) : 0);
    for (const e of hurts) if (e.type === "damage") n += Math.max(0, evalAmount(s, e.amount, ctx));
    return n;
  };
}

/**
 * Which cards in exile a processor should put into their owners' graveyards: the ones an opponent could still play from
 * there (foretold, plotted, suspended, or with a permission to play), then the dearest of the face-up ones.
 */
export function processOrder(s: GameState, pid: PlayerId, cards: ObjectId[]): ObjectId[] {
  const playable = (id: ObjectId) => {
    const o = obj(s, id);
    return o.foretold || (o.mayPlay && o.mayPlay.player !== pid) || (o.counters.time ?? 0) > 0 ? 1 : 0;
  };
  const value = (id: ObjectId) => (hiddenInExile(obj(s, id), pid) ? 0 : mv(s, id));
  return [...cards].sort((a, b) => playable(b) - playable(a) || value(b) - value(a));
}

/**
 * A text change's words (effect "changeText"): the word to replace is one the permanent or spell has (in its text or on its
 * type line), so the change does something; a basic land type becomes one as chooseLandType picks. Otherwise the first
 * word offered.
 */
function textWordPick(s: GameState, pid: PlayerId, pend: Extract<PendingDecision, { kind: "chooseOption" }>): string {
  const o = pend.about ? s.objects[pend.about] : undefined;
  if (!o) return pend.options[0]!;
  const d = defOf(s, o);
  if (pend.what === "textFrom") {
    const has = (w: string) => d.subtypes.includes(w) || new RegExp(`(?<![a-z])${w}`, "i").test(d.oracleText.replace(new RegExp(d.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "~"));
    return pend.options.find((w) => d.subtypes.includes(w)) ?? pend.options.find(has) ?? pend.options[0]!;
  }
  // A basic land type: as for "becomes the basic land type of your choice" (Reef Shaman).
  if (pend.options.every((w) => LAND_COLOR[w])) return chooseLandType(s, pid, pend.options);
  return pend.options[0]!;
}

/** The least worth of these creatures (no commander) whose total power reaches `min`, taken best power for worth first; null if they can't. */
function powerFloorSet(s: GameState, pid: PlayerId, options: ObjectId[], min: number): ObjectId[] | null {
  const ok = options.map((id) => obj(s, id)).filter((o) => !o.isCommander && power(s, o) > 0);
  const ids: ObjectId[] = [];
  let total = 0;
  for (const o of [...ok].sort((a, b) => worth(s, pid, a) / power(s, a) - worth(s, pid, b) / power(s, b))) {
    if (total >= min) break;
    ids.push(o.id);
    total += power(s, o);
  }
  return total >= min ? ids : null;
}
