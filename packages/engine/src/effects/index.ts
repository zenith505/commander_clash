// Executes the effect language: legal targets, resolving ability bodies, and the triggered-ability queue.
//
//   targeting.ts     legal targets and modes (CR 115, 700.2)
//   resolve.ts       resolving a spell or ability body step by step; pausing for choices; which objects/players a reference means
//   run-*.ts         what each effect does, grouped by area (run-basics, run-zones, run-permanents, run-tokens,
//                    run-spells, run-library, run-choices); resolve.ts dispatches on the effect type
//   triggers.ts      events, triggered abilities and the trigger queue (CR 603)
//   describe.ts      text for costs, destinations and changes
//   heuristics.ts    estimates the bots use (is this harmful, how much damage)

export { objectMatches, bindChosen, bindAttachedToSource, ENTERS_COUNTER, choiceOptions, withChoice, sourceQuality, spellQuality, activatedQuality, itemQuality, peaceTalksNow, printedMatches, isLegalTarget, legalTargets, offerMany, manyX, manyOfferSizes, offerTargets, settleDivided, bindBound, targetingCtx, spellManaValue, sameTarget, canChooseTarget, totalOk, targetProblem, flagbearerProblem, flagbearerAllows, flagbearers, flagbearerRuleFor, divisionProblem, stampTargets, hasLegalTargets, legalModes, modesUsed, noteModesChosen, canChooseModes, modesProblem, pickOptions, sameNamed, sameManaValued, spellMatches, spellPT, cardPT } from "./targeting";
export { beginResolution, continueResolution, resolveManaAbility, type Resolution } from "./resolve";
export { becomeMonarch } from "./run-basics";
export { takeInitiative, dungeonSBAs } from "./run-dungeons";
export { ringBearer, isRingBearer, timesTempted, loseRingBearer, ringBearerOptions } from "./run-ring";
export { harmfulCounter, reselectOptions } from "./run-permanents";
export { tokenDef } from "./run-tokens";
export { unlessCost, addDelayed, kickedMatches, changeTargetOptions } from "./run-spells";
export { discardCards } from "./run-library";
export { isSuspended, enterAttacking } from "./run-zones";
export { canPayNow, timesPay } from "./run-choices";
export { COLOR_NAMES, describePay, describeDest, describeMods } from "./describe";
export { inCombat, attackDefault, attackingYouNow, bent, declareAttackersDue, echoDue, evolves, fireEvent, processTriggerQueue, checkStateTriggers, checkLostControl, closeZoneBatch, triggerBody, pushTrigger, type TriggerSourceEvent } from "./triggers";
export { chooserSlots, bindChoosers, withChooserPicks, chooserChoices, withStandIns, forController } from "./opponent-choice";
export { doesNothingNow, harmfulTargets, modsAreHarmful, damageTo, lethalDamage, estimate } from "./heuristics";
