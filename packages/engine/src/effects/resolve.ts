import { allEffects, type AbilityBody, type Amount, type DamageRecipient, type Effect, type ManaAbility, type Modification, type ObjRef, type PlayerRef, type TargetChoice } from "../abilities";
import { tokenChoicesPossible, TokenQuestionPause, withPutter, withTokenAnswers, batchCountersPut } from "../counters";
import { abilitiesOf, cardIdOf, defOf, objIsType, pairedWith, power, toughness } from "../cards";
import { seatOrder, addTriggeredMana, askAuraReturns, batchTaps, cloneState, creatureTypesOf, damageDrawsMade, draw, endTheCombatPhase, endTheTurn, enterTogether, inCombatPhase, gainLife, livingPlayers, log, moveObject, obj, opponents, player, shareCreatureType } from "../game";
import { characteristics, controllerOf, everyCreatureType, invalidateCharacteristics, uniqueMostPlayer } from "../layers";
import { CAST_BY_SOURCE, casterMark, compileCard, SPELL_CONTROLLER, playerMark } from "../oracle";
import { bindChosenKeywords, CREATURE_TYPES, CHOSEN_KEYWORD, CHOSEN_LANDWALK, SACRIFICED_LANDWALK, landwalkLand, CHOSEN_SNOW_LANDWALK, chosenLandwalk, CHOSEN_LAND_TYPE, CHOSEN_HEXPROOF, CHOSEN_PLAYER_PROTECTION, TARGET_PLAYER_PROTECTION, CHOSEN_PROTECTION, CHOSEN_TYPE, CHOSEN_TYPE_PROTECTION, protectionFromPlayer, TARGET_COLORS_PROTECTION, CAST_SPELL_COLORS_PROTECTION, isLandwalk } from "../keywords";
import { evalAmount, type AmountCtx } from "../amounts";
import { cardSource, objectSource, shieldChoicesPossible, ShieldQuestionPause, withShieldAnswers, type DamageSource } from "../damage";
import { RulesError, type CardDef, type Chosen, type Color, type GameObject, type GameState, type LastKnown, type ManaType, type ObjectId, type PlayerId, type StackItem, type TriggerEventInfo } from "../types";
import { manaTriggerResults } from "../manaabilities";
import { askGraveyardOrder, closeGraveyardBatch, graveyardEnd } from "../graveyard";
import type { ManaSpent } from "../mana";
import { COLOR_NAMES } from "./describe";
import { objectMatches, bindChosen, bindAttachedToSource, bindBound, targetingCtx, sourceQuality, spellManaValue, spellQuality, isLegalTarget, lesserPowerOk, sameNamed, sameNamedAnywhere, sharingName, sharingAColor, sharingACreatureType, sameManaValued, checkTotals, relatedOk, printedMatches, spellMatches, saddledSource, itemQuality } from "./targeting";
import { runPreventionEffect } from "./run-prevention";
import { runBasicsEffect, becomeMonarch } from "./run-basics";
import { runGameOfChaosEffect, runCoinEachEffect, runFlipClashEffect, runEachPlayerFlipsEffect, runFlipEachOpponentEffect, runCoinEffect, runDiceEffect } from "./run-dice";
import { runDungeonsEffect } from "./run-dungeons";
import { runZonesEffect, suspendExiled } from "./run-zones";
import { proliferate, runPermanentsEffect } from "./run-permanents";
import { runTextEffect } from "./run-text";
import { runTokensEffect, createToken } from "./run-tokens";
import { runCopiesEffect } from "./run-copies";
import { runSpellsEffect, addDelayed } from "./run-spells";
import { runNamesEffect } from "./run-names";
import { runLibraryEffect } from "./run-library";
import { runFaceDownPilesEffect } from "./run-round318";
import { runExileRandomTokenCopyEffect } from "./run-round359";
import { runKinCountersEffect } from "./run-round361";
import { runRedistributeLifeEffect } from "./run-round362";
import { runMayCastExiledSpellEffect, runUntilLeavesToBottomEffect } from "./run-round363";
import { runRound420Effect } from "./run-round420";
import { runRound421Effect } from "./run-round421";
import { runRound424Effect } from "./run-round424";
import { runChooseSourceNowEffect } from "./run-round364";
import { runMillUntilEffect } from "./run-round373";
import { runOpponentSplitsCostExiledEffect, runReturnWithSacrificedEffect, runSwapFromGraveyardsEffect } from "./run-round374";
import { runFaceDownPileEffect } from "./run-round391";
import { runPlayTopOrHandEffect, runPowerToPlayersEffect } from "./run-round392";
import { runMoveCurseEffect, runReturnOneOfThemEffect, runStealTokensEffect } from "./run-round394";
import { runExileUntilNonlandLinkedEffect, runRevealTopsShareTypeEffect } from "./run-round395";
import { runGuffRewriteEffect } from "./run-round411";
import { runExchangeSpellControlEffect } from "./run-round413";
import { runExchangeWithSubjectEffect } from "./run-round414";
import { runBecomeCopyOfLinkedEffect } from "./run-round396";
import { runBecomeCopyOfAmongEffect } from "./run-round405";
import { runBecomeCopyOfLinkedXEffect, runEachOpponentTakesEffect } from "./run-round408";
import { runChooseLinkedCardEffect } from "./run-round399";
import { runGainActivatedOfEffect, runWhenCastGainsActivatedEffect } from "./run-round400";
import { runExileFromHandOrYardEffect } from "./run-round401";
import { runGlimpseOfTomorrowEffect } from "./run-round390";
import { runOpponentShufflesExiledInEffect, runThievesAuctionEffect, runWarpWorldEffect } from "./run-round376";
import { runNoteCreatureTypeEffect } from "./run-round380";
import { runGoadChosenNamesEffect } from "./run-round382";
import { runCopyNamedCardEffect, runSearchTheyNameEffect } from "./run-round377";
import { runAttachSelfToPlayerEffect } from "./run-round365";
import { runFlickerWithAurasEffect, runReturnAurasAttachedEffect } from "./run-round366";
import { runTapLandsSharingManaEffect } from "./run-round367";
import { runAuraCopiesOnAttackersEffect } from "./run-round368";
import { runAttackingNowEffect, runDiscardOrSacrificeEffect, runExileTopDamageEachEffect, runGuessTopKindEffect, runReturnSacrificedCardsEffect, runSacrificeTargetsRevealEffect } from "./run-round319";
import { runSecretNumberGuessEffect } from "./run-round384";
import { runShuffleExiledPileEffect } from "./run-round385";
import { runNoHandPlaysEffect } from "./run-round386";
import { runOverTheTopEffect, runPhaseInSubjectEffect } from "./run-round389";
import { runRepeatIfDidEffect } from "./run-round320";
import { runChooseHostOrNamedEffect, runPutMilledPairEffect, runSearchEachExileEffect } from "./run-round321";
import { runLaneB160Effect } from "./run-laneb160";
import { runLaneB166Effect } from "./run-laneb166";
import { runLaneB167Effect } from "./run-laneb167";
import { runLaneB168Effect } from "./run-laneb168";
import { runLaneB169Effect } from "./run-laneb169";
import { runLaneB170Effect } from "./run-laneb170";
import { runLaneB172Effect } from "./run-laneb172";
import { runLaneB174Effect } from "./run-laneb174";
import { runLaneB177Effect } from "./run-laneb177";
import { runLaneB180Effect } from "./run-laneb180";
import { runLaneB184Effect } from "./run-laneb184";
import { runLaneB185Effect } from "./run-laneb185";
import { runLaneB186Effect } from "./run-laneb186";
import { runLaneB189Effect } from "./run-laneb189";
import { runLaneB192Effect } from "./run-laneb192";
import { runLaneB199Effect } from "./run-laneb199";
import { runLaneB200Effect } from "./run-laneb200";
import { runLaneB201Effect } from "./run-laneb201";
import { runLaneB202Effect } from "./run-laneb202";
import { runLaneB208Effect } from "./run-laneb208";
import { runLaneB210Effect } from "./run-laneb210";
import { runLaneB212Effect } from "./run-laneb212";
import { runLaneB214Effect } from "./run-laneb214";
import { runLaneB215Effect } from "./run-laneb215";
import { runLaneB216Effect } from "./run-laneb216";
import { runLaneB218Effect } from "./run-laneb218";
import { runLaneB220Effect } from "./run-laneb220";
import { runLaneB221Effect } from "./run-laneb221";
import { runLaneB222Effect } from "./run-laneb222";
import { runLaneB223Effect } from "./run-laneb223";
import { runLaneB227Effect } from "./run-laneb227";
import { runLaneB229Effect } from "./run-laneb229";
import { runLaneB230Effect } from "./run-laneb230";
import { runLaneB231Effect } from "./run-laneb231";
import { runLaneB232Effect } from "./run-laneb232";
import { runLaneB233Effect } from "./run-laneb233";
import { runLaneB234Effect } from "./run-laneb234";
import { runLaneB235Effect } from "./run-laneb235";
import { runLaneB236Effect } from "./run-laneb236";
import { runLaneB238Effect } from "./run-laneb238";
import { runLaneB254Effect } from "./run-laneb254";
import { runLaneB255Effect } from "./run-laneb255";
import { runLaneB256Effect } from "./run-laneb256";
import { runLaneB258Effect } from "./run-laneb258";
import { runLaneB259Effect } from "./run-laneb259";
import { runLaneB260Effect } from "./run-laneb260";
import { runLaneB262Effect } from "./run-laneb262";
import { runLaneB263Effect } from "./run-laneb263";
import { runLaneB264Effect } from "./run-laneb264";
import { runLaneB265Effect } from "./run-laneb265";
import { runLaneB266Effect } from "./run-laneb266";
import { runLaneB267Effect } from "./run-laneb267";
import { runLaneB270Effect } from "./run-laneb270";
import { runLaneB272Effect } from "./run-laneb272";
import { runLaneB273Effect } from "./run-laneb273";
import { runLaneB274Effect } from "./run-laneb274";
import { runLaneB275Effect } from "./run-laneb275";
import { runLaneB276Effect } from "./run-laneb276";
import { runLaneB241Effect } from "./run-laneb241";
import { runLaneB250Effect } from "./run-laneb250";
import { runRound327Effect } from "./run-round327";
import { runRound328Effect } from "./run-round328";
import { runRound329Effect } from "./run-round329";
import { runRound330Effect } from "./run-round330";
import { runRound333Effect } from "./run-round333";
import { runRound339Effect } from "./run-round339";
import { runRound344Effect } from "./run-round344";
import { runRound345Effect } from "./run-round345";
import { runRound349Effect } from "./run-round349";
import { runRound350Effect } from "./run-round350";
import { runRound352Effect } from "./run-round352";
import { runRound353Effect } from "./run-round353";
import { runChoicesEffect } from "./run-choices";
import { runVotesEffect, votedObjects } from "./run-votes";
import { ringBearer } from "./run-ring";
import { checkStateConditions, closeZoneBatch, fireEvent } from "./triggers";
import { foundWith } from "../mutate";

export interface ResolveCtx {
  controller: PlayerId;
  sourceId?: ObjectId;
  sourceZc?: number;
  sourceDef: CardDef;
  targets: TargetChoice[];
  legal: boolean[]; // which targets are still legal on resolution
  spellControllers?: (PlayerId | null)[];
  spellObjects?: (ObjectId | null)[];
  /** The stack item that triggered this ability, for ward's "that spell or ability". */
  cause?: string;
  /** The object the trigger event was about (ObjRef "subject"). */
  subject?: { id: ObjectId; zc: number };
  lki?: LastKnown;
  /** The announced X (CR 107.3a). */
  x?: number;
  /** Its instructions are run as a cost paid as it resolves ("You may discard a card. If you do, ...", CR 118.12). */
  asCost?: true;
  event?: TriggerEventInfo;
  /** Kicker costs paid for it (CR 702.33d). */
  kicked?: number[];
  /** Colors of mana spent to cast it, or the spell its permanent was (CR 207.2c). */
  colorsSpent?: number;
  /** Mana from Treasures spent to cast it (or the spell its permanent was) or to activate it (CR 106.3). */
  treasureSpent?: number;
  /** The mana spent to cast the spell, the spell its permanent was, or the spell a cast trigger is about, by type (CR 601.2h). */
  spent?: ManaSpent;
  /** How much mana was spent to cast the spell, or the spell an enters trigger's permanent was (CR 601.2h): 0 if it wasn't cast. */
  manaSpent?: number;
  /** What was sacrificed to cast it, as it last existed. */
  sacrificed?: LastKnown[];
  /** A station ability's tapped creature (CR 702.184a). */
  stationed?: StackItem["stationed"];
  costTapped?: StackItem["costTapped"];
  sourceUntaps?: number;
  sourceTransforms?: number;
  /** The creature type or color chosen as it resolves, or else as its source entered. */
  chosen?: Chosen;
  /** The player an instruction for each player is being done to now (PlayerRef "eachOne"). */
  eachOne?: PlayerId;
}

export type Resolution = "fizzled" | "done" | "paused";

/**
 * The opponent the gift was promised to (CR 702.174a, k): a spell's own choice, or for a permanent's gift trigger, the
 * choice its spell made, carried by the trigger (CR 702.174b). Undefined if no gift was promised.
 */
/** "If evidence was collected" (CR 701.59c): for a spell, as it was cast; for its permanent's enters trigger, as its spell was. */
export function evidenceCollected(s: GameState, ctx: ResolveCtx): boolean {
  const item = s.resolving?.item;
  if (item?.kind === "spell") return !!s.objects[item.objectId ?? ""]?.evidence;
  return !!ctx.event?.evidence;
}

export function gifteeOf(s: GameState, ctx: ResolveCtx): PlayerId | undefined {
  const item = s.resolving?.item;
  if (item?.kind === "spell") return s.objects[item.objectId ?? ""]?.gift;
  return ctx.event?.gift;
}

/**
 * Start resolving a spell or ability whose stack item has been removed from the stack.
 * Targets are re-checked first: if every target is now illegal it does nothing (CR 608.2b),
 * and effects aimed at individual illegal targets are skipped. Effects then run in order
 * (CR 608.2c); one that needs a player's choice pauses the resolution (see continueResolution).
 */
export function beginResolution(s: GameState, item: StackItem, body: AbilityBody): Resolution {
  const targets = item.targets ?? [];
  // Peace Talks (round B254): an activated ability, not a triggered one (itemQuality).
  const src = itemQuality(s, item);
  // An amount bound ("with power less than or equal to ~'s power") is worked out again now (CR 608.2b), with the source as
  // it last existed if it has left (608.2h).
  const now: AmountCtx = { ...targetingCtx(s, item.controller, item.sourceId), ...(item.sourceZc !== undefined ? { sourceZc: item.sourceZc } : {}), ...(item.lki ? { lki: item.lki } : {}), x: item.x ?? 0 };
  const legal = body.targets.map((spec, i) => !!targets[i] && isLegalTarget(s, bindBound(s, spec, now), targets[i]!, item.controller, src) && lesserPowerOk(s, spec, targets[i]!, item.sourceId, item.sourceZc, item.hostThen));
  checkTotals(s, body.targets, targets, legal);
  // Requirements about the other targets, checked again too (CR 608.2b): "controlled by different players" (Run Away
  // Together), "with the same controller" (Simic Guildmage), "in that player's graveyard" (Goblin Welder).
  body.targets.forEach((spec, i) => {
    if (legal[i] && (spec.differentControllerFrom?.length || spec.sameControllerAs?.length || spec.sharesCardTypeWith?.length || spec.powerAtMostOf?.length || spec.mvAtMostOf?.length || spec.sharesNoCreatureTypeWith?.length || spec.inGraveyardOfControllerOf?.length || spec.inGraveyardOfTarget !== undefined || spec.controlledByTarget !== undefined || spec.attachedToTarget !== undefined) && !relatedOk(s, spec, targets, targets[i]!)) legal[i] = false;
  });
  // Fiery Annihilation: with the creature it's attached to an illegal target, the Equipment isn't exiled either (rulings).
  body.targets.forEach((spec, i) => {
    if (spec.attachedToTarget !== undefined && !legal[spec.attachedToTarget]) legal[i] = false;
  });
  // With every target it chose now illegal, it doesn't resolve (CR 608.2b). One that chose none of its
  // "up to" targets isn't targeted at all, and resolves (CR 115.6).
  const chose = targets.some((t) => t.kind !== "none");
  if (body.targets.length && chose && !legal.some(Boolean) && !body.resolvesAnyway) return "fizzled";
  const spellControllers = targets.map((t) => (t.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.controller ?? null) : null));
  const spellObjects = targets.map((t) => (t.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.objectId ?? null) : null));
  // Round B260: Minamo's Meddling's "a card spliced onto that spell", after it's countered.
  const spellSpliced = targets.map((t) => (t.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.spliced ?? null) : null));
  // "If this is the second time this ability has resolved this turn": counted as it resolves, for this object's ability
  // only (a new object's start over, CR 400.7).
  const nth = item.kind === "ability" && item.sourceId && asksResolutions(body) ? countResolution(s, `${item.sourceId}@${item.sourceZc ?? 0}|${body.text ?? item.description}`) : undefined;
  s.resolving = {
    item,
    body,
    legal,
    next: 0,
    ...(spellControllers.some((c) => c !== null) ? { spellControllers } : {}),
    ...(spellObjects.some((c) => c !== null) ? { spellObjects } : {}),
    ...(spellSpliced.some((c) => c !== null) ? { spellSpliced } : {}),
    ...(nth !== undefined ? { nth } : {}),
    ...(item.countersRemoved !== undefined ? { countersRemoved: item.countersRemoved } : {}),
    ...(item.chosenNumber !== undefined ? { chosen: { number: item.chosenNumber } } : {}),
    // Celestial Reunion (round 426): "the chosen type", chosen with its additional cost as it was cast (StackItem.chosenType).
    ...(item.chosenType && item.kind === "spell" && item.objectId && s.objects[item.objectId] && compileCard(defOf(s, s.objects[item.objectId]!)).kickChooseType ? { chosen: { ...(item.chosenNumber !== undefined ? { number: item.chosenNumber } : {}), type: item.chosenType } } : {}),
  };
  return continueResolution(s);
}

function asksResolutions(body: AbilityBody): boolean {
  return allEffects(body.effects).some((e) => e.type === "if" && e.cond.kind === "resolvedNth") || JSON.stringify(body.effects).includes('"kind":"resolvedThisTurn"');
}

function countResolution(s: GameState, key: string): number {
  if (s.resolutionCounts?.turn !== s.turn) s.resolutionCounts = { turn: s.turn, counts: {} };
  return (s.resolutionCounts.counts[key] = (s.resolutionCounts.counts[key] ?? 0) + 1);
}

/**
 * Run the resolving item's remaining effects. Returns "paused" when an effect is waiting on
 * a player (s.pending says who and what); the decision's action calls this again. When it
 * finishes, a resolved instant or sorcery goes to its owner's graveyard (CR 608.2n).
 */
export function continueResolution(s: GameState): Resolution {
  const r = s.resolving;
  if (!r) return "done";
  const { item } = r;
  const sourceDef = item.kind === "spell" ? defOf(s, obj(s, item.objectId!)) : s.cards[item.sourceCardId!]!;
  const ctx: ResolveCtx = {
    controller: item.controller,
    sourceId: item.kind === "spell" ? undefined : item.sourceId,
    sourceZc: item.sourceZc,
    sourceDef,
    targets: item.targets ?? [],
    legal: r.legal,
    spellControllers: r.spellControllers,
    spellObjects: r.spellObjects,
    cause: item.cause,
    subject: item.subject,
    lki: item.lki,
    x: item.x,
    event: item.event,
    kicked: item.kicked,
    colorsSpent: item.kind === "spell" ? (s.objects[item.objectId!]?.colorsSpent?.length ?? 0) : item.colorsSpent,
    // A spell's own; an activated ability's; an enters or cast trigger's, its spell's (CR 106.3).
    treasureSpent: item.kind === "spell" ? (s.objects[item.objectId!]?.treasureSpent ?? 0) : (item.treasureSpent ?? item.event?.treasureSpent ?? 0),
    // A copy of a spell wasn't cast: no mana was spent on it (rulings on adamant).
    spent: item.kind === "spell" ? (item.copy ? undefined : s.objects[item.objectId!]?.spent) : item.event?.spent,
    manaSpent: item.kind === "spell" ? (item.copy ? 0 : (s.objects[item.objectId!]?.manaSpent ?? 0)) : (item.event?.manaSpent ?? 0),
    sacrificed: item.sacrificed,
    stationed: item.stationed,
    costTapped: item.costTapped,
    sourceUntaps: item.sourceUntaps,
    sourceTransforms: item.sourceTransforms,
  };
  Object.defineProperty(ctx, "chosen", { get: () => r.chosen ?? sourceChosen(s, ctx), enumerable: true });
  for (;;) {
    // Between instructions: the cards the last one put into a graveyard together are arranged by their owner before
    // the next one, and before the spell itself goes to the graveyard (CR 404.3, 608.2n). Not inside a mana ability,
    // which can't stop for a choice: the event it's part of ends later.
    if (!r.scratch && !item.manaAbility) {
      closeZoneBatch(s); // its "one or more" triggers (CR 603.2c)
      closeGraveyardBatch(s);
      // Auras coming back because the last instruction made an "until ~ leaves" source leave (CR 303.4f, 610.3).
      if (askAuraReturns(s) === "asked") return "paused";
      if (askGraveyardOrder(s)) return "paused";
      // A state true only partway through the resolution still triggers (CR 603.8).
      if (r.next > 0) checkStateConditions(s);
    }
    if (r.next >= r.body.effects.length) break;
    if (!r.scratch) s.leftTogether = undefined; // a new instruction, not one resuming after a choice
    // "~ deals 3 damage to target player and 3 damage to target creature": both parts at once (Effect damage `sameEvent`).
    const together = sameDamageEvent(r.body.effects[r.next]!, r.body.effects[r.next + 1]);
    // An instruction's taps happen at the same time (CR 608.2c): "one or more ... become tapped" triggers once.
    if (batchTaps(s, () => runAsking(s, together ?? r.body.effects[r.next]!, ctx)) === "paused") return "paused";
    r.next += together ? 2 : 1;
    r.scratch = undefined;
    // Swans of Bryn Argoll (round B252): the draws its prevention calls for, made right after the damage event (CR 615.5),
    // before the next instruction. A draw replacement that stops to ask (dredge) carries on here (game.ts drawsDone).
    if (s.damageDraws?.length && damageDrawsMade(s)) return "paused";
  }
  s.leftTogether = undefined;
  s.resolving = null;
  if (r.endTurn) return endTheTurn(s, item), "done";
  if (r.endCombat) return endTheCombatPhase(s, item), "done";
  // Narci, Fable Singer: it has finished resolving and left the stack (rulings).
  if (item.finalChapter !== undefined) fireEvent(s, { type: "finalChapterResolved", player: item.controller, amount: item.finalChapter });
  if (item.kind === "spell" && item.objectId && s.objects[item.objectId]?.zone === "stack") finishSpell(s, item.objectId, item);
  if (item.manaAbility) manaAbilityResolved(s, item, r.made ?? []);
  return "done";
}

/**
 * Run one instruction of the resolving spell or ability, letting the players choose among the shields of the damage
 * it deals (which redirection or prevention applies first, which damage a shield takes, CR 616.1) when they could
 * have a choice. Such a choice comes partway through dealing the damage, so the instruction is run on a copy-backed
 * state: at a question, the state goes back to how it was before the instruction, the question is asked, and the
 * instruction runs again from its start with the answers so far, which give the same plan up to the next question.
 */
function runAsking(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  const r = s.resolving!;
  const shields = !r.item.manaAbility && shieldChoicesPossible(s);
  // Jinnie Fay, Esix: an optional replacement of tokens it creates (CR 616.1), asked the same way (counters.ts).
  const tokens = !r.item.manaAbility && tokenChoicesPossible(s);
  if (!shields && !tokens) return runEffect(s, e, ctx);
  const before = cloneState(s);
  const restore = () => {
    for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k];
    Object.assign(s, before);
    invalidateCharacteristics(s);
  };
  return withTokenAnswers(tokens ? (r.tokenAnswers ?? []) : null, (tokenAsked) =>
    withShieldAnswers(shields ? (r.shieldAnswers ?? []) : null, (asked) => {
      try {
        const out = runEffect(s, e, ctx);
        r.shieldAnswers = undefined;
        // Kept while the instruction waits on another choice of its own: it runs again with the same answers.
        if (out !== "paused") r.tokenAnswers = undefined;
        return out;
      } catch (err) {
        if (err instanceof TokenQuestionPause) {
          const q = tokenAsked();
          if (!q) throw err;
          restore();
          s.resolving!.tokenAnswers ??= [];
          s.pending = { kind: "chooseOption", player: q.player, source: q.source, what: "tokenInstead", prompt: q.prompt, options: q.options, labels: q.labels, botChoice: q.botChoice };
          return "paused";
        }
        const q = asked();
        if (!(err instanceof ShieldQuestionPause) || !q) throw err;
        restore();
        s.resolving!.shieldAnswers ??= [];
        s.pending = { kind: "chooseOption", player: q.player, source: ctx.sourceDef.name, what: "damageShield", prompt: q.prompt, options: q.labels.map((_, i) => String(i)), labels: q.labels };
        return "paused";
      }
    }),
  );
}

/**
 * An activated mana ability resolves as soon as it's activated, without the stack (CR 605.3b), even while another
 * spell or ability is partway through resolving and waiting on a payment (605.3a). That one carries on afterwards.
 * Inside another decision, it can't stop for a choice of its own: the activation is refused instead.
 */
export function resolveManaAbility(s: GameState, item: StackItem, body: AbilityBody, color?: Color): void {
  const outer = s.resolving;
  const inside = !!outer || !!s.pending;
  const left = s.leftTogether;
  s.resolving = { item, body, legal: [], next: 0, ...(color ? { chosen: { color } } : {}) };
  // Its damage can't stop for a question (its shields are chosen the way a bot would), nor its tokens (Jinnie Fay).
  if (withTokenAnswers(null, () => withShieldAnswers(null, () => continueResolution(s))) === "paused" && inside) throw new RulesError(`${s.cards[item.sourceCardId!]?.name ?? "That"}'s mana ability needs a choice that can't be made now`);
  if (!inside) return;
  s.resolving = outer;
  s.leftTogether = left;
}

/**
 * After an activated mana ability resolves (with {T} in its cost, its source was tapped for mana, CR 106.12): the
 * triggered mana abilities that triggers add their mana right away (CR 605.4a), as for `ManaAbility`s.
 */
function manaAbilityResolved(s: GameState, item: StackItem, made: ManaType[]): void {
  const m = item.manaAbility!;
  const o = item.sourceId ? s.objects[item.sourceId] : undefined;
  if (!o) return;
  if (m.tapped && o.zone === "battlefield") fireEvent(s, { type: "tappedForMana", id: o.id, player: item.controller });
  // Tyvar the Bellicose: "Whenever a mana ability of this creature resolves", while it's still that permanent.
  if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === (item.sourceZc ?? o.zoneChanges ?? 0)) fireEvent(s, { type: "manaAbilityResolved", id: o.id, amount: made.length });
  const results = manaTriggerResults(s, item.controller, o, { tap: !!m.tapped } as ManaAbility, made);
  const extra = m.extra ?? [];
  const picked = results.length === 1 ? results[0]! : results.find((r) => r.extra.length === extra.length && r.extra.every((x, i) => x === extra[i]));
  if (!picked) throw new RulesError(`choose the mana that tapping ${defOf(s, o).name} also adds`);
  addTriggeredMana(s, item.controller, picked);
  if (picked.skipUntap && o.zone === "battlefield") o.skipNextUntap = true; // Winter's Night
  if (picked.adds.length) log(s, `${player(s, item.controller).name} adds ${picked.adds.map((x) => `{${x}}`).join("")}.`);
}

/** What was chosen as the ability's source entered ("the chosen type"), while it's still that object. */
function sourceChosen(s: GameState, ctx: { sourceId?: ObjectId; sourceZc?: number }): Chosen | undefined {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc) ? o.chosen : undefined;
}

/** Players in APNAP order: the active player first, then in turn order (CR 101.4). */
export function apnap(s: GameState, pids: PlayerId[]): PlayerId[] {
  return startingWith(s, s.activePlayer, pids);
}

/** These players in turn order starting with `first` ("starting with you", Disciple of Caelus Nin). */
export function startingWith(s: GameState, first: PlayerId, pids: PlayerId[]): PlayerId[] {
  const i = s.turnOrder.indexOf(first);
  const order = [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
  return order.filter((p) => pids.includes(p));
}

/** The creatures that convoked the resolving spell, or for an ability (an enters trigger), its source's spell (CR 702.51a). */
export function convokedFor(s: GameState, ctx: ResolveCtx): { id: ObjectId; zc: number }[] {
  const item = s.resolving?.item;
  const o = item?.kind === "spell" ? s.objects[item.objectId ?? ""] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o?.convoked ?? [];
}

/** The creature types of each creature that convoked the resolving spell, as it is or last was on the battlefield (CR 608.2h). */
function convokerTypes(s: GameState, ctx: ResolveCtx): (Set<string> | "all")[] {
  return convokedFor(s, ctx).flatMap((c) => {
    const o = s.objects[c.id];
    if (o?.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc) return [creatureTypesOf(s, o)];
    const lk = s.lastKnown?.[c.id];
    return lk?.zc === c.zc && lk.creatureTypes ? [lk.creatureTypes === "all" ? "all" : new Set(lk.creatureTypes)] : [];
  });
}

/**
 * What the Aura or Equipment an ability came from is attached to, while it's still that object (CR 400.7); if it's
 * gone (sacrificed to pay for the ability), what it was attached to as it last existed (CR 608.2h). `here`: that
 * permanent is still on the battlefield as the same object.
 */
/**
 * The source as the permanent it is, "id@zoneChanges"; gone (a dies trigger's source is the card in its new zone, CR
 * 400.7), the permanent it was as it last existed on the battlefield (CR 603.10a, 608.2h).
 */
export function selfKeyThisTurn(s: GameState, ctx: ResolveCtx): string | undefined {
  const self = ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined;
  if (!self) return undefined;
  if (self.zone === "battlefield" && (ctx.sourceZc === undefined || (self.zoneChanges ?? 0) === ctx.sourceZc)) return `${self.id}@${self.zoneChanges ?? 0}`;
  const lk = ctx.sourceZc !== undefined ? s.lastKnown?.[self.id] : undefined;
  return lk && (lk.zc === ctx.sourceZc! - 1 || lk.zc === ctx.sourceZc) ? `${self.id}@${lk.zc}` : undefined;
}

/** Whose blocks a "blockHistory" ref is about: the object it remembers, or the source or target as it is now. */
export function blockHistoryAt(s: GameState, ref: Extract<ObjRef, { ref: "blockHistory" }>, ctx: ResolveCtx): { id: ObjectId; zc: number } | undefined {
  if (ref.at) return ref.at;
  if (ref.diedSelf) {
    // A leaves-the-battlefield trigger's source is the object it became, one zone change later (CR 400.7).
    const lk = ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
    return lk && (ctx.sourceZc === undefined || lk.zc + 1 === ctx.sourceZc) ? { id: ctx.sourceId!, zc: lk.zc } : undefined;
  }
  if (ref.of.ref === "self" && ctx.sourceId) return { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0 };
  // Ib Halfheart: the trigger's attacker, as it was when it became blocked (even once it's gone).
  if (ref.of.ref === "subject") return ctx.subject;
  const t = ref.of.ref === "target" ? ctx.targets[ref.of.index] : undefined;
  return t?.kind === "object" ? { id: t.id, zc: t.zc ?? s.objects[t.id]?.zoneChanges ?? 0 } : undefined;
}

function attachedHost(s: GameState, ctx: ResolveCtx): { id: ObjectId; zc: number; here: boolean } | undefined {
  const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (!me) return undefined;
  const same = ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc;
  let was: { id: ObjectId; zc: number } | undefined;
  if (me.zone === "battlefield" && same) was = me.attachedTo ? { id: me.attachedTo, zc: s.objects[me.attachedTo]?.zoneChanges ?? 0 } : undefined;
  else {
    const lk = s.lastKnown?.[me.id];
    // A leaves-the-battlefield trigger (Reality Acid) carries the zone change it made: what it was attached to as it left
    // (CR 603.10a, 608.2h).
    was = lk && (lk.zc === ctx.sourceZc || (ctx.sourceZc !== undefined && lk.zc === ctx.sourceZc - 1)) ? lk.attachedTo : undefined;
  }
  if (!was) return undefined;
  const o = s.objects[was.id];
  return { ...was, here: o?.zone === "battlefield" && (o.zoneChanges ?? 0) === was.zc };
}

/** The creature types of what the source enchants, or last enchanted as it last existed (CR 608.2h); none without one. */
export function attachedHostTypes(s: GameState, ctx: ResolveCtx): Set<string> | "all" | undefined {
  const host = attachedHost(s, ctx);
  if (!host) return undefined;
  if (host.here) return creatureTypesOf(s, s.objects[host.id]!);
  const lk = s.lastKnown?.[host.id];
  return lk?.zc === host.zc && lk.creatureTypes ? (lk.creatureTypes === "all" ? "all" : new Set(lk.creatureTypes)) : undefined;
}

/** The trigger subject's creature types: as it is on the battlefield, or as it last existed there (CR 608.2h). */
export function subjectCreatureTypes(s: GameState, ctx: ResolveCtx): Set<string> | "all" | undefined {
  const sub = ctx.subject;
  const o = sub ? s.objects[sub.id] : undefined;
  if (!sub || !o) return undefined;
  if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === sub.zc) return creatureTypesOf(s, o);
  // A dies trigger's subject is the card in its new zone, one zone change after it left the battlefield.
  const lk = s.lastKnown?.[o.id];
  if (!lk?.creatureTypes || (lk.zc !== sub.zc && lk.zc !== sub.zc - 1)) return undefined;
  return lk.creatureTypes === "all" ? "all" : new Set(lk.creatureTypes);
}

/** The trigger subject's colors as it is on the battlefield, or as it last existed there (CR 608.2h); undefined if neither. */
export function subjectColors(s: GameState, ctx: ResolveCtx): Color[] | undefined {
  const sub = ctx.subject;
  const o = sub ? s.objects[sub.id] : undefined;
  if (!sub || !o) return undefined;
  if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === sub.zc) return characteristics(s, o).colors;
  const lk = s.lastKnown?.[o.id];
  if (!lk?.source || (lk.zc !== sub.zc && lk.zc !== sub.zc - 1)) return undefined;
  return lk.source.colors;
}

export function objects(s: GameState, ref: ObjRef, ctx: ResolveCtx): GameObject[] {
  if (ref.ref === "castSpell") return []; // only counted (amounts.ts)
  // Dack Fayden's emblem: the permanents the triggering spell targets, on the stack now or as it was cast (as Orvar's
  // "one of those permanents"), each still that object (CR 400.7).
  if (ref.ref === "causeTargets") {
    const item = ctx.cause !== undefined ? (s.stack.find((x) => x.id === ctx.cause) ?? s.castItems?.[ctx.cause]) : undefined;
    const ids = new Set<ObjectId>();
    for (const t of item?.targets ?? []) {
      const o = t.kind === "object" ? s.objects[t.id] : undefined;
      if (o?.zone === "battlefield" && (t.kind !== "object" || t.zc === undefined || (o.zoneChanges ?? 0) === t.zc) && objectMatches(s, ref.filter, o, ctx.controller, false)) ids.add(o.id);
    }
    return [...ids].map((id) => s.objects[id]!);
  }
  if (ref.ref === "ringBearer") {
    const b = ringBearer(s, ctx.controller);
    return b ? [b] : [];
  }
  if (ref.ref === "voted") return votedObjects(s, !!ref.any);
  // Dauntless Bodyguard: the creature chosen as the source entered, while it's that permanent; Tyrannical Pitlord's
  // leaves trigger: the choice of the source as it last existed (CR 608.2h): an ability activated by sacrificing it is the
  // object it was, a leaves-the-battlefield trigger's source the object it became (one zone change later, CR 400.7).
  if (ref.ref === "chosenObject") {
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const here = me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
    const lk = !here && ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
    const c = here ? me.chosen?.object : lk && (ctx.sourceZc === undefined || lk.zc === ctx.sourceZc || lk.zc + 1 === ctx.sourceZc) ? lk.chosenObject : undefined;
    const o = c && s.objects[c.id];
    return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc ? [o] : [];
  }
  // Eye of Singularity: "that name" is the entering permanent's, now, or as it last existed (CR 608.2h).
  if (ref.ref === "sharingName") {
    if (!ref.subject) return sharingName(s);
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    if (!o) return [];
    const here = o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc;
    if (here && o.faceDown) return [];
    const lk = s.lastKnown?.[o.id];
    const name = here ? characteristics(s, o).name : (lk?.source?.name ?? (lk?.copyKey ? s.cards[lk.copyKey]?.name : undefined) ?? defOf(s, o).name);
    return sharingName(s, name, here ? o.id : undefined);
  }
  if (ref.ref === "countersPutThisWay")
    return [...new Set((s.resolving?.countersPutThisWay ?? []).filter((c) => !ref.kind || c.kind === ref.kind).map((c) => c.id))].flatMap((id) => {
      const o = s.objects[id];
      return o?.zone === "battlefield" && (s.resolving!.countersPutThisWay ?? []).some((c) => c.id === id && (o.zoneChanges ?? 0) === c.zc) ? [o] : [];
    });
  // Urge to Feed: "each of those Vampires", the ones its tapAnyNumber tapped, while each is still that permanent (CR 400.7).
  if (ref.ref === "costTapped") {
    const st = ctx.stationed;
    const o = st && s.objects[st.id];
    return o?.zone === "battlefield" && (o.zoneChanges ?? 0) === st!.zc ? [o] : [];
  }
  if (ref.ref === "wonFlipThisWay")
    return (s.resolving?.wonFlipIds ?? []).flatMap((c) => {
      const o = s.objects[c.id];
      return o?.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc ? [o] : [];
    });
  if (ref.ref === "tappedThisWay")
    return (s.resolving?.tappedIds ?? []).flatMap((c) => {
      const o = s.objects[c.id];
      return o?.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc ? [o] : [];
    });
  if (ref.ref === "convoker" || ref.ref === "convokers") {
    const list = convokedFor(s, ctx);
    return (ref.ref === "convoker" ? list.slice(ref.index, ref.index + 1) : list).flatMap((c) => {
      const o = s.objects[c.id];
      return o?.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc ? [o] : [];
    });
  }
  // The Equipment or Aura that gave this ability, while it's still that permanent (CR 400.7).
  if (ref.ref === "grantSource") {
    const o = ref.id ? s.objects[ref.id] : undefined;
    return o?.zone === "battlefield" && (o.zoneChanges ?? 0) === ref.zc ? [o] : [];
  }
  if (ref.ref === "self") {
    const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    // If it left the battlefield (even if it came back), it's a different object now (CR 400.7).
    if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) return [];
    return [o];
  }
  if (ref.ref === "target") {
    const out: GameObject[] = [];
    for (let i = ref.index; i < ref.index + (ref.n ?? 1); i++) {
      const t = ctx.targets[i];
      if (ctx.legal[i] && t?.kind === "object" && !(ref.notYours && controllerOf(s, obj(s, t.id)) === ctx.controller) && !(ref.with && !objectMatches(s, ref.with, obj(s, t.id), ctx.controller, false))) out.push(obj(s, t.id));
    }
    if (ref.sameName && out[0]) out.push(...sameNamed(s, out[0], ref.sameName, ctx.controller));
    if (ref.sameNameYardsAndPermanents && out[0]) out.push(...sameNamedAnywhere(s, out[0]));
    if (ref.sharesColor && out[0]) out.push(...sharingAColor(s, out[0], ref.sharesColor, ctx.controller));
    if (ref.sharesType && out[0]) out.push(...sharingACreatureType(s, out[0], ref.sharesType, ctx.controller));
    if (ref.sameMv && out[0]) out.push(...sameManaValued(s, out[0], ref.sameMv, ctx.controller));
    if (ref.attachedToo) {
      const hosts = new Set(out.map((o) => o.id));
      const attached = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attachedTo !== undefined && hosts.has(o.attachedTo) && objectMatches(s, ref.attachedToo!.filter, o, ctx.controller, false));
      if (ref.attachedToo.only) return attached;
      out.push(...attached.filter((o) => !hosts.has(o.id)));
    }
    if (ref.andSelf) {
      const me = objects(s, { ref: "self" }, ctx)[0];
      if (me && !out.includes(me)) out.unshift(me);
    }
    if (ref.andSelfCard) {
      const me = objects(s, { ref: "selfCard" }, ctx)[0];
      if (me && !out.includes(me)) out.unshift(me);
    }
    return out;
  }
  if (ref.ref === "tokensCreatedWithSelf") {
    // Dance of Many's "When ~ leaves the battlefield, exile the token": a leaves-the-battlefield trigger's source is the
    // object it became (CR 603.10a, 400.7), so the tokens are those the permanent it was created, one zone change before.
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const zc = me && me.zone !== "battlefield" && ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) === ctx.sourceZc ? ctx.sourceZc - 1 : ctx.sourceZc;
    return s.battlefield.map((id) => obj(s, id)).filter((o) => o.createdWith?.id === ctx.sourceId && o.createdWith?.zc === zc && !s.resolving?.created?.includes(o.id));
  }
  if (ref.ref === "selfCard") {
    const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    // An Aura's card in the graveyard it went to from the battlefield, as its creature died or since (Angelic Destiny
    // rulings): one zone change after the trigger, or none if it was already there.
    // Craft's "Return this card": the card the ability's own cost exiled, one zone change after it was activated (CR 400.7j).
    if (ref.exiledAsCost) return o && o.zone === "exile" && ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) === ctx.sourceZc + 1 ? [o] : [];
    // Evershrike: the permanent the card became as this returned it to the battlefield (CR 400.7).
    if (ref.returned) return o && o.zone === "battlefield" && ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) === ctx.sourceZc + 1 ? [o] : [];
    if (ref.moved) return o && o.zone === "graveyard" && ctx.sourceZc !== undefined && ((o.zoneChanges ?? 0) === ctx.sourceZc || (o.zoneChanges ?? 0) === ctx.sourceZc + 1) && (!ref.yours || o.owner === ctx.controller) ? [o] : [];
    // The card a leaves-the-battlefield trigger came from, in its new zone, while it's still that object (CR 400.7).
    // A merged permanent's other cards too, for an ability triggered by its leaving (CR 730.3c).
    // "Exile ~ from your graveyard" (Skyfisher Spider): that card only, there.
    if (ref.yours) return o && o.zone === "graveyard" && o.owner === ctx.controller && (o.zoneChanges ?? 0) === ctx.sourceZc ? [o] : [];
    return [...(o && o.zone !== "battlefield" && (o.zoneChanges ?? 0) === ctx.sourceZc ? [o] : []), ...foundWith(s, ctx.lki, ctx.sourceId)];
  }
  if (ref.ref === "milled") return (s.resolving?.milled ?? []).flatMap((c) => (s.objects[c.id]?.zone === "graveyard" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc && (!ref.filter || printedMatches(ref.filter, defOf(s, s.objects[c.id]!))) ? [s.objects[c.id]!] : []));
  if (ref.ref === "subjectCard") {
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    if (ref.zone === "public") return o && (o.zone === "graveyard" || o.zone === "exile" || o.zone === "command") && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : [];
    if (ref.zone) return o && o.zone === ref.zone && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : [];
    return [...(o && o.zone !== "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : []), ...foundWith(s, ctx.lki, ctx.subject?.id)];
  }
  // The objects a batch trigger was about, still where they went (CR 400.7): permanents that entered, cards put into a graveyard.
  // Pure Intentions (round B240): "those cards from your graveyard": only those still there (CR 400.7), not a madness card
  // in exile or one Library of Leng put on top of the library.
  if (ref.ref === "eventGroup") return (ctx.event?.group ?? []).flatMap((g) => (s.objects[g.id] && (s.objects[g.id]!.zoneChanges ?? 0) === g.zc && (!ref.inYourGraveyard || (s.objects[g.id]!.zone === "graveyard" && s.objects[g.id]!.owner === ctx.controller)) ? [s.objects[g.id]!] : []));
  if (ref.ref === "pairedWithTarget") {
    const t = objects(s, { ref: "target", index: ref.index }, ctx)[0];
    const other = t && pairedWith(s, t);
    return other ? [other] : [];
  }
  if (ref.ref === "damagedThisWay") return [...new Set(s.resolving?.damagedThisWay ?? [])].map((id) => obj(s, id)).filter((o) => o.zone === "battlefield" && (!ref.filter || objectMatches(s, ref.filter, o, ctx.controller, false)));
  if (ref.ref === "sacrificed") return []; // gone: only its last known information is used
  if (ref.ref === "linkedCard") {
    // Linked to the source as it is, or as it was if it has left since (CR 607.2a, 400.7).
    const zc = ctx.sourceZc ?? 0;
    const key = s.linkedExile?.[`${ctx.sourceId}@${zc}`] ? `${ctx.sourceId}@${zc}` : `${ctx.sourceId}@${zc - 1}`;
    return (s.linkedExile?.[key] ?? []).flatMap((l) => (s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc ? [s.objects[l.id]!] : []));
  }
  if (ref.ref === "counteredSource") {
    const c = ref.targeted ? s.resolving?.targetedAbilitySource : s.resolving?.counteredSource;
    const o = c && s.objects[c.id];
    return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc && objectMatches(s, ref.filter, o, ctx.controller, false) ? [o] : [];
  }
  if (ref.ref === "sacrificedThisWayCards") return (s.resolving?.sacrificedThisWay ?? []).flatMap((l) => (l.id !== undefined && l.cardZc !== undefined && s.objects[l.id]?.zone === "graveyard" && (s.objects[l.id]!.zoneChanges ?? 0) === l.cardZc ? [s.objects[l.id]!] : []));
  if (ref.ref === "sacrificedCards") return (ctx.sacrificed ?? []).flatMap((l) => (l.id !== undefined && l.cardZc !== undefined && s.objects[l.id]?.zone === "graveyard" && (s.objects[l.id]!.zoneChanges ?? 0) === l.cardZc ? [s.objects[l.id]!] : []));
  // Rescue from the Underworld: the cards remembered, each still that object outside the battlefield in a public zone.
  if (ref.ref === "remembered") return ref.cards.flatMap((c) => ((o) => (o && (o.zone === "graveyard" || o.zone === "exile" || o.zone === "command") && (o.zoneChanges ?? 0) === c.zc ? [o] : []))(s.objects[c.id]));
  // Maddening Imp: the permanents remembered, each still that object on the battlefield (CR 400.7), matching the filter now.
  if (ref.ref === "rememberedPermanents") return ref.cards.flatMap((c) => ((o) => (o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc && (!ref.filter || objectMatches(s, ref.filter, o, ctx.controller, false)) ? [o] : []))(s.objects[c.id]));
  if (ref.ref === "costExiled") return (s.resolving?.item.costExiled ?? []).flatMap((c) => (s.objects[c.id]?.zone === "exile" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc ? [s.objects[c.id]!] : []));
  if (ref.ref === "yourGraveyard") return player(s, ctx.controller).graveyard.map((id) => obj(s, id)).filter((o) => printedMatches(ref.filter, defOf(s, o)));
  // Fumble: the Auras and Equipment noted before it left, still those objects on the battlefield (CR 400.7).
  if (ref.ref === "noted") return (s.resolving?.noted ?? []).flatMap((c) => (s.objects[c.id]?.zone === "battlefield" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc ? [s.objects[c.id]!] : []));
  if (ref.ref === "putThisWay") return (s.resolving?.item.putThisWay ?? []).flatMap((c) => (s.objects[c.id]?.zone === "battlefield" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc ? [s.objects[c.id]!] : []));
  if (ref.ref === "amassed") {
    const a = s.resolving?.amassed ?? s.resolving?.item.amassed;
    const o = a && s.objects[a.id];
    return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === a.zc ? [o] : [];
  }
  if (ref.ref === "discarded") {
    const o = s.resolving?.discardedCards?.length === 1 ? s.objects[s.resolving.discardedCards[0]!.id] : undefined;
    return o && o.zone === "graveyard" && (o.zoneChanges ?? 0) === s.resolving!.discardedCards![0]!.zc ? [o] : [];
  }
  if (ref.ref === "exiledThisWay" && ref.cards) return (s.resolving?.exiledCards ?? []).map((id) => s.objects[id]).filter((o): o is GameObject => o?.zone === "exile");
  if (ref.ref === "exiledThisWay")
    return (s.resolving?.exiled ?? []).map((x) => s.objects[x.o.id]).filter((o, i): o is GameObject => o?.zone === "exile" && (o.zoneChanges ?? 0) === (s.resolving!.exiled![i]!.o.zoneChanges ?? 0) + 1);
  if (ref.ref === "exiledFromHand") {
    const ex = s.resolving?.exiledFromHandCards;
    const o = ex?.length === 1 ? s.objects[ex[0]!.id] : undefined;
    return o && o.zone === "exile" && (o.zoneChanges ?? 0) === ex![0]!.zc ? [o] : [];
  }
  if (ref.ref === "exiledTop") {
    const ex = s.resolving?.exiledTop;
    const o = ex && s.objects[ex.id];
    return o && o.zone === "exile" && (o.zoneChanges ?? 0) === ex.zc ? [o] : [];
  }
  if (ref.ref === "searchFound") return (s.resolving?.searchFound ?? []).map((id) => s.objects[id]).filter((o): o is GameObject => o?.zone === ref.zone);
  if (ref.ref === "chosenFromYard") {
    const c = s.resolving?.chosenFromYard;
    const o = c && s.objects[c.id];
    return o && (o.zoneChanges ?? 0) === c.zc ? [o] : [];
  }
  // Haunting Imitation: the cards a parley reveal showed, still on top of their libraries (rulings), like `filter`.
  if (ref.ref === "parleyRevealed") return (s.resolving?.parley?.ids ?? []).map((id) => s.objects[id]).filter((o): o is GameObject => o?.zone === "library" && (!ref.filter || printedMatches(ref.filter, defOf(s, o))));
  if (ref.ref === "revealed") {
    const rv = s.resolving?.revealed;
    const o = rv && s.objects[rv.id];
    // A card revealed at random from a hand stays there (Planeswalker's Mirth). Undying Flames: the card exiled from the
    // library ("that card"), in exile.
    return o && (o.zone === "library" || o.zone === "hand" || o.zone === "exile") && (o.zoneChanges ?? 0) === rv.zc ? [o] : [];
  }
  if (ref.ref === "affected")
    return (s.resolving?.affected ?? []).map((a) => s.objects[a.id]).filter((o): o is GameObject => o?.zone === "battlefield" && (o.zoneChanges ?? 0) === s.resolving!.affected!.find((a) => a.id === o.id)!.zc);
  if (ref.ref === "graveyardEnd")
    return players(s, ref.who, ctx)
      .map((pid) => graveyardEnd(s, pid, { ...(ref.filter ? { filter: ref.filter } : {}), ...(ref.bottom ? { bottom: true } : {}), ...(ref.only ? { only: true } : {}) }))
      .filter((o): o is GameObject => !!o);
  if (ref.ref === "bandedWithSelf") {
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || !me.band || me.attacking === undefined) return [];
    return s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== me.id && o.band === me.band && o.attacking !== undefined);
  }
  if (ref.ref === "inCombatWithSelf" && ref.lastKnown) {
    const lk = ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
    // A leaves-the-battlefield trigger's source is the object it became (one zone change later, CR 400.7).
    if (!lk || (ctx.sourceZc !== undefined && lk.zc + 1 !== ctx.sourceZc)) return [];
    // The creatures that were blocking it, still blocking creatures, and those it blocked, still attacking (CR 506.4).
    return s.battlefield.map((id) => obj(s, id)).filter((o) => (lk.blockedBy?.includes(o.id) && o.blocking !== undefined) || (lk.blocking?.includes(o.id) && o.attacking !== undefined));
  }
  if (ref.ref === "inCombatWithSelf") {
    const me = ref.ofTarget !== undefined ? objects(s, { ref: "target", index: ref.ofTarget }, ctx)[0] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    if (!me || me.zone !== "battlefield" || (ref.ofTarget === undefined && ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) {
      // "~ and each creature blocking or blocked by it" with ~ gone (Vortex Elemental, Gomazoa): those in combat with it as
      // it last existed on the battlefield (CR 608.2h; rulings on Vortex Elemental), still blocking or attacking.
      const lk = ref.andSelf && ref.ofTarget === undefined && ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
      if (!lk || ctx.sourceZc === undefined || lk.zc !== ctx.sourceZc) return [];
      return s.battlefield.map((id) => obj(s, id)).filter((o) => (!ref.blocked && lk.blockedBy?.includes(o.id) && o.blocking !== undefined) || (lk.blocking?.includes(o.id) && o.attacking !== undefined));
    }
    // Blocking it (CR 509.1h), or attacking and blocked by it, while both are in combat.
    const them = s.battlefield.map((id) => obj(s, id)).filter((o) => (!ref.blocked && o.blocking?.includes(me.id) && me.attacking !== undefined) || (me.blocking?.includes(o.id) && o.attacking !== undefined));
    return ref.andSelf ? [me, ...them] : them;
  }
  if (ref.ref === "blockHistory" && ref.anyone) {
    const all = new Set((s.turnLog?.blocks ?? []).flatMap((b) => [b.blocker, b.attacker]));
    return s.battlefield.map((id) => obj(s, id)).filter((o) => all.has(`${o.id}@${o.zoneChanges ?? 0}`));
  }
  if (ref.ref === "blockHistory") {
    // Triton Tactics: several of them.
    const ats = ref.ats ?? [blockHistoryAt(s, ref, ctx)].filter((a): a is { id: ObjectId; zc: number } => !!a);
    if (!ats.length) return [];
    const keys = new Set(ats.map((at) => `${at.id}@${at.zc}`));
    const with_ = new Set((s.turnLog?.blocks ?? []).filter((b) => !ref.thisCombat || b.combat === (s.combatsThisTurn ?? 0)).flatMap((b) => [...(ref.blockers && keys.has(b.attacker) ? [b.blocker] : []), ...(ref.blocked && keys.has(b.blocker) ? [b.attacker] : [])]));
    if (ref.andSelf) for (const key of keys) with_.add(key);
    return s.battlefield.map((id) => obj(s, id)).filter((o) => with_.has(`${o.id}@${o.zoneChanges ?? 0}`) && (!ref.stillBlocking || o.blocking !== undefined));
  }
  if (ref.ref === "blockingIt") {
    const me = ref.subject ? objects(s, { ref: "subject" }, ctx)[0] : objects(s, { ref: "self" }, ctx)[0];
    // Wall of Nets: the creatures it's blocking, still on the battlefield (only while it's there itself, rulings).
    if (ref.blocked) return me && me.zone === "battlefield" && me.blocking ? me.blocking.flatMap((id) => (s.objects[id]?.zone === "battlefield" ? [obj(s, id)] : [])) : [];
    // Blocking it (CR 509.1h) while it's attacking.
    if (!me || me.attacking === undefined) return [];
    const blockers = s.battlefield.map((id) => obj(s, id)).filter((o) => o.blocking?.includes(me.id));
    return ref.filter ? blockers.filter((o) => objectMatches(s, ref.filter!, o, ctx.controller, false)) : blockers;
  }
  if (ref.ref === "damagedSelfThisTurn") {
    const key = selfKeyThisTurn(s, ctx);
    const by = new Set((key ? s.turnLog?.damageDealtTo?.[key] ?? [] : []).flatMap((d) => (d.src ? [d.src] : [])));
    return s.battlefield.map((id) => obj(s, id)).filter((o) => by.has(`${o.id}@${o.zoneChanges ?? 0}`) && objIsType(s, o, "Creature"));
  }
  if (ref.ref === "diedDamagedBySelf") {
    const out: GameObject[] = [];
    for (const d of s.turnLog?.diedDamaged ?? []) {
      const o = s.objects[d.id];
      if (ctx.sourceId !== undefined && d.by.includes(ctx.sourceId) && o?.zone === "graveyard" && (o.zoneChanges ?? 0) === d.zc && !out.includes(o)) out.push(o);
    }
    return out;
  }
  if (ref.ref === "created") return (s.resolving?.created ?? []).map((id) => s.objects[id]).filter((o): o is GameObject => o?.zone === "battlefield");
  if (ref.ref === "attached") {
    const host = attachedHost(s, ctx);
    // Orcish Mine: "destroy enchanted land and ~ deals 2 damage to that land's controller": its controller as it last
    // existed on the battlefield (CR 608.2h), kept for "hostController".
    if (host?.here && s.resolving) s.resolving.hostControllerWas = controllerOf(s, s.objects[host.id]!);
    if (!host?.here) return [];
    const it = s.objects[host.id]!;
    if (!ref.aurasToo) return [it];
    const auras = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attachedTo === it.id && characteristics(s, o).subtypes.includes("Aura"));
    return [it, ...auras];
  }
  if (ref.ref === "attachedHost") {
    // Artificer's Hex: the creature the enchanted Equipment is attached to as this resolves, which may not be the one it was
    // attached to as it triggered (rulings).
    const host = attachedHost(s, ctx);
    const it = host?.here ? s.objects[host.id] : undefined;
    const next = it?.attachedTo ? s.objects[it.attachedTo] : undefined;
    return next?.zone === "battlefield" ? [next] : [];
  }
  if (ref.ref === "targetHost") {
    // Unforge: the permanent the target Equipment is attached to, or was attached to as it was destroyed (rulings).
    const t = ctx.targets[ref.index];
    if (!ctx.legal[ref.index] || t?.kind !== "object") return [];
    const me = s.objects[t.id];
    const here = me?.zone === "battlefield" && (t.zc === undefined || (me.zoneChanges ?? 0) === t.zc);
    const lk = !here ? s.lastKnown?.[t.id] : undefined;
    const was = here ? (me!.attachedTo ? { id: me!.attachedTo, zc: s.objects[me!.attachedTo]?.zoneChanges ?? 0 } : undefined) : lk && lk.zc === t.zc ? lk.attachedTo : undefined;
    const host = was && (s.objects[was.id]?.zoneChanges ?? 0) === was.zc ? s.objects[was.id] : undefined;
    return host?.zone === "battlefield" ? [host] : [];
  }
  if (ref.ref === "attachedToSubject") {
    const host = objects(s, { ref: "subject" }, ctx)[0];
    if (!host && ref.lastKnown && ctx.subject) {
      const lk = s.lastKnown?.[ctx.subject.id];
      if (lk?.zc !== ctx.subject.zc) return [];
      return (lk.attached ?? []).flatMap((a) => {
        const o = s.objects[a.id];
        return o?.zone === "battlefield" && (o.zoneChanges ?? 0) === a.zc && objectMatches(s, ref.filter, o, ctx.controller, false) ? [o] : [];
      });
    }
    return host ? s.battlefield.map((id) => obj(s, id)).filter((o) => o.attachedTo === host.id && objectMatches(s, ref.filter, o, ctx.controller, false)) : [];
  }
  if (ref.ref === "subject") {
    // Only while it's still the same object on the battlefield (CR 400.7).
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : [];
  }
  if (ref.ref === "each" && ref.andAttached) {
    // Crown of Vigor: the creature it enchanted (or as it last existed, CR 608.2h) and the others sharing a type with it.
    const filter = bindBound(s, bindChosen(ref.filter, ctx.chosen), amountCtx(s, ctx));
    const host = attachedHost(s, ctx);
    const h = host && s.objects[host.id];
    const lk = host && !host.here ? s.lastKnown?.[host.id] : undefined;
    const types = host?.here ? creatureTypesOf(s, h!) : lk?.zc === host?.zc && lk?.creatureTypes ? (lk.creatureTypes === "all" ? "all" : new Set(lk.creatureTypes)) : undefined;
    const others = !types ? [] : s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== host!.id && objectMatches(s, filter, o, ctx.controller, false) && shareCreatureType(types, creatureTypesOf(s, o)));
    return host?.here ? [h!, ...others] : others;
  }
  if (ref.ref === "each" && ref.andSubject) {
    const filter = bindBound(s, bindChosen(ref.filter, ctx.chosen), amountCtx(s, ctx));
    const subj = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    const here = subj?.zone === "battlefield" && (subj.zoneChanges ?? 0) === ctx.subject!.zc;
    const lk = !here && ctx.subject ? s.lastKnown?.[ctx.subject.id] : undefined;
    const types = here ? creatureTypesOf(s, subj!) : lk?.zc === ctx.subject?.zc && lk?.creatureTypes ? (lk.creatureTypes === "all" ? "all" : new Set(lk.creatureTypes)) : undefined;
    const others = !types ? [] : s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== ctx.subject!.id && objectMatches(s, filter, o, ctx.controller, false) && shareCreatureType(types, creatureTypesOf(s, o)));
    return here ? [subj!, ...others] : others;
  }
  if (ref.ref === "each") {
    // Hakim, Loreweaver: "all Auras attached to ~", the source (a filter with `attachedTo.objectId` "~").
    const filter0 = bindAttachedToSource(bindBound(s, bindChosen(ref.filter, ctx.chosen), amountCtx(s, ctx)), ctx.sourceId);
    // "Named ~" (Gruff Triplets): its name now, or as it last existed (CR 201.5, 608.2h).
    const me0 = filter0.named === "~" && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const filter1a = filter0.named === "~" ? { ...filter0, named: me0?.zone === "battlefield" ? characteristics(s, me0).name : ctx.sourceDef.name } : filter0;
    // Dual Nature: the subject's name as it is, or last was, on the battlefield; none (face down, or not known) matches nothing.
    let filter1 = filter1a;
    if (ref.sameNameAsSubject) {
      const subj = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      const here = subj?.zone === "battlefield" && (subj.zoneChanges ?? 0) === ctx.subject!.zc;
      const lk = !here && ctx.subject ? s.lastKnown?.[ctx.subject.id] : undefined;
      // Gone from the battlefield, the subject is the card in its new zone, one zone change on from what last existed.
      const name = here ? (subj!.faceDown ? "" : characteristics(s, subj!).name) : lk && (lk.zc === ctx.subject!.zc || lk.zc === ctx.subject!.zc - 1) ? (lk.source?.name ?? "") : "";
      if (!name) return [];
      filter1 = { ...filter1a, named: name };
    }
    // Sanguine Praetor, Endemic Plague: the sacrificed creature as it last existed; none matches without one.
    const sacked = ref.sacrificedKin ? (ctx.sacrificed?.[0] ?? s.resolving?.sacrificedThisWay?.at(-1)) : undefined;
    if (ref.sacrificedKin && !sacked) return [];
    // Golden Argosy: "each creature that crewed it this turn" (CR 702.122d), the source as the object it was.
    const { crewedSource, ...filter2 } = filter1;
    const filter3 = ref.sacrificedKin === "manaValue" ? { ...filter2, manaValue: { min: sacked!.manaValue ?? 0, max: sacked!.manaValue ?? 0 } } : filter2;
    // Namor, Atlantean King: "other creatures you control attacking that player": the trigger's player.
    const filter = filter3.attackingWhom === "eventPlayer" && ctx.event?.player !== undefined ? { ...filter3, attackingWhom: ctx.event.player } : filter3;
    const sackedTypes = ref.sacrificedKin === "creatureType" ? (sacked!.allCreatureTypes ? ("all" as const) : new Set((sacked!.subtypes ?? []).filter((x) => CREATURE_TYPES.has(x)))) : undefined;
    const t = ref.otherThan !== undefined ? ctx.targets[ref.otherThan] : undefined;
    const except = t?.kind === "object" ? t.id : ref.other ? ctx.sourceId : ref.otherThanSubject ? ctx.subject?.id : undefined;
    const whose = ref.of && players(s, ref.of, ctx);
    const mine = ref.sharesTypeWithSelf ? sourceCreatureTypes(s, ctx) : ref.sharesTypeWithSubject ? subjectCreatureTypes(s, ctx) : undefined;
    if (ref.sharesTypeWithSubject && !mine) return [];
    // Spreading Plague: sharing a color with the subject (CR 105.2); a colorless one, or one not known, shares none.
    const hues = ref.sharesColorWithSubject ? subjectColors(s, ctx) : undefined;
    if (ref.sharesColorWithSubject && !hues?.length) return [];
    const made = ref.notCreated ? (s.resolving?.created ?? []) : [];
    const spared = ref.spareConvokerTypes ? convokerTypes(s, ctx) : [];
    const spare = (o: GameObject) => spared.length > 0 && objIsType(s, o, "Creature") && !objIsType(s, o, "Artifact") && !objIsType(s, o, "Enchantment") && spared.some((t) => shareCreatureType(t, creatureTypesOf(s, o)));
    const others = s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== except && !made.includes(o.id) && (!whose || whose.includes(ref.ofOwner ? o.owner : controllerOf(s, o))) && objectMatches(s, filter, o, ctx.controller, false) && (!mine || shareCreatureType(mine, creatureTypesOf(s, o))) && (!hues || characteristics(s, o).colors.some((c) => hues.includes(c))) && (!sackedTypes || shareCreatureType(sackedTypes, creatureTypesOf(s, o))) && !spare(o) && (!crewedSource || saddledSource(s, o.id, ctx.sourceId, ctx.sourceZc, "crewedBy")));
    if (!ref.andSelf) return others;
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const here = me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
    return here && !others.includes(me) ? [me, ...others] : others;
  }
  return s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => objIsType(s, o, "Creature") && !(ref.other && o.id === ctx.sourceId) && !(ref.attacking && o.attacking === undefined))
    .filter((o) => {
      const c = controllerOf(s, o);
      return ref.controller === "you" ? c === ctx.controller : ref.controller === "opponent" ? c !== ctx.controller : true;
    });
}

export function players(s: GameState, ref: PlayerRef, ctx: ResolveCtx): PlayerId[] {
  switch (ref.ref) {
    case "you":
      return [ctx.controller];
    case "linkedPlayer": {
      // The leaves ability triggered after the source moved: its enters ability was the object before (CR 400.7).
      const pid = s.linkedPlayer?.[`${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`];
      return pid !== undefined && !player(s, pid).lost ? [pid] : [];
    }
    case "eachOpponent":
      return opponents(s, ctx.controller);
    case "eachPlayer":
      return livingPlayers(s);
    case "teammates":
      // Imperial Mask: no teams in this free-for-all game, so no teammates (CR 102.3).
      return [];
    case "attackedThisTurnBySelf": {
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      return o?.attacked?.turn === s.turn ? livingPlayers(s).filter((p) => o.attacked!.players?.includes(p)) : [];
    }
    case "target": {
      // "Any number of target players": each of them still a legal target (CR 608.2b).
      const out: PlayerId[] = [];
      for (let i = ref.index; i < ref.index + (ref.n ?? 1); i++) {
        const t = ctx.targets[i];
        if (ctx.legal[i] && t?.kind === "player") out.push(t.id);
      }
      return out;
    }
    case "eventPlayer": {
      // Archfiend of Spite: "that source's controller" as it resolves, if the source is still that object.
      const src = ctx.event?.sourceOf ? s.objects[ctx.event.sourceOf.id] : undefined;
      const now = src && (src.zoneChanges ?? 0) === ctx.event!.sourceOf!.zc ? (src.zone === "battlefield" ? controllerOf(s, src) : src.zone === "stack" ? s.stack.find((i) => i.objectId === src.id)?.controller : undefined) : undefined;
      const who = now ?? ctx.event?.player;
      return who !== undefined && !player(s, who).lost ? [who] : [];
    }
    case "eventPlayers":
      return s.turnOrder.filter((p) => ctx.event?.players?.includes(p) && !player(s, p).lost);
    case "votedWithYou": {
      const votes = ctx.event?.votes ?? [];
      const mine = new Set(votes.filter((v) => v.voter === ctx.controller).map((v) => v.choice));
      return opponents(s, ctx.controller).filter((p) => votes.some((v) => v.voter === p && mine.has(v.choice)));
    }
    case "votedNoneOfYours": {
      const votes = ctx.event?.votes ?? [];
      const mine = new Set(votes.filter((v) => v.voter === ctx.controller).map((v) => v.choice));
      return opponents(s, ctx.controller).filter((p) => votes.some((v) => v.voter === p) && !votes.some((v) => v.voter === p && mine.has(v.choice)));
    }
    case "youAndVotedWithYou": {
      const votes = ctx.event?.votes ?? [];
      const mine = new Set(votes.filter((v) => v.voter === ctx.controller).map((v) => v.choice));
      return apnap(s, livingPlayers(s).filter((p) => p === ctx.controller || (opponents(s, ctx.controller).includes(p) && votes.some((v) => v.voter === p && mine.has(v.choice)))));
    }
    case "youAndEventPlayer":
      return s.turnOrder.filter((p) => (p === ctx.controller || p === ctx.event?.player) && !player(s, p).lost);
    case "youAndChosenPlayer": {
      const p = s.resolving?.chosen?.player;
      return apnap(s, livingPlayers(s).filter((x) => x === ctx.controller || x === p));
    }
    case "yardChosenOwner": {
      // Deadly Cover-Up (round B245): the owner of the card exiled from an opponent's graveyard (CR 108.3).
      const c = s.resolving?.chosenFromYard;
      const o = c ? s.objects[c.id] : undefined;
      return o && !player(s, o.owner).lost ? [o.owner] : [];
    }
    case "sacrificedThisWay": {
      const by = new Set((s.resolving?.sacrificedThisWay ?? []).filter((x) => !ref.subtype || !!x.subtypes?.includes(ref.subtype)).map((x) => x.controller));
      return apnap(s, livingPlayers(s).filter((x) => by.has(x)));
    }
    case "tappedLandForMana": {
      const by = new Set(s.turnLog?.tappedLandForMana ?? []);
      return apnap(s, livingPlayers(s).filter((x) => by.has(x)));
    }
    case "lastSpellDamagedYou": {
      // Suffocation (round B229): the latest damage to you from such a spell this turn, its controller as it dealt it.
      const last = (s.turnLog?.spellDamage ?? []).filter((d) => d.player === ctx.controller && d.colors.includes(ref.color) && d.types.some((t) => ref.types.includes(t))).at(-1);
      return last && !player(s, last.controller).lost ? [last.controller] : [];
    }
    case "youAndEventPlayers":
      return apnap(s, livingPlayers(s).filter((p) => p === ctx.controller || !!ctx.event?.players?.includes(p)));
    case "attackingPlayer":
      return ctx.event?.attacker !== undefined && !player(s, ctx.event.attacker).lost ? [ctx.event.attacker] : [];
    case "otherOpponents":
      return opponents(s, ctx.controller).filter((p) => p !== ctx.event?.player);
    case "otherPlayers":
      return livingPlayers(s).filter((p) => p !== ctx.event?.player);
    case "otherThanTarget": {
      // Nothing happens if the target player is no longer legal: the spell does nothing (CR 608.2b).
      const t = ctx.targets[ref.index];
      return ctx.legal[ref.index] && t?.kind === "player" ? livingPlayers(s).filter((p) => p !== t.id) : [];
    }
    case "otherThanTargetController": {
      // The target as it last existed if it has left (CR 608.2h); none if it's illegal, as nothing of the spell happens then.
      const them = players(s, { ref: "targetController", index: ref.index }, ctx);
      return them.length ? livingPlayers(s).filter((p) => !them.includes(p)) : [];
    }
    case "enchantedPlayer": {
      // The player this Aura is attached to, or was as it last existed (CR 608.2h).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me) return [];
      const lk = s.lastKnown?.[me.id];
      const p = me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me.attachedToPlayer : lk && lk.zc === ctx.sourceZc ? lk.attachedToPlayer : undefined;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "eachOne":
      return ctx.eachOne !== undefined ? [ctx.eachOne] : [];
    case "chosenPlayer": {
      const p = ref.nth !== undefined ? s.resolving?.chosen?.players?.[ref.nth] : s.resolving?.chosen?.player;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "selfChosenPlayer": {
      // The source as this ability's source, or as it last existed on the battlefield (CR 608.2h).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const lk = me && s.lastKnown?.[me.id];
      const p = me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me.chosen?.player : lk && lk.zc === ctx.sourceZc ? lk.chosenPlayer : undefined;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "hostOwner": {
      // Enslave: the enchanted creature's owner (an owner never changes, CR 108.3), the creature as it last existed if the
      // Aura or it has left (CR 608.2h).
      const host = attachedHost(s, ctx);
      const o = host ? s.objects[host.id] : undefined;
      return o && !player(s, o.owner).lost ? [o.owner] : [];
    }
    case "grantSourceController": {
      // Hold for Ransom: the Aura that gave the ability, while it's that permanent, else as it last existed (CR 608.2h).
      const g = ref.id ? s.objects[ref.id] : undefined;
      const was = g?.zone === "battlefield" && (g.zoneChanges ?? 0) === ref.zc ? controllerOf(s, g) : ref.id && s.lastKnown?.[ref.id]?.zc === ref.zc ? s.lastKnown![ref.id]!.controller : undefined;
      return was !== undefined && !player(s, was).lost ? [was] : [];
    }
    case "hostController": {
      // Gremlin Infestation: "enchanted artifact's controller", the permanent the source is attached to now.
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const host = me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) && me.attachedTo ? s.objects[me.attachedTo] : undefined;
      // Strangling Grasp: "enchanted permanent's controller sacrifices a nonland permanent of their choice, then that player
      // loses 1 life": the same player even if they sacrificed the enchanted permanent (as it last existed, CR 608.2h).
      if (host?.zone === "battlefield") {
        if (s.resolving) s.resolving.hostControllerWas = controllerOf(s, host);
        return !player(s, controllerOf(s, host)).lost ? [controllerOf(s, host)] : [];
      }
      const was = s.resolving?.hostControllerWas;
      return was !== undefined && !player(s, was).lost ? [was] : [];
    }
    case "linkedExileOwners": {
      // The leaves ability triggered after the source moved, so the object its exile ability belongs to is the one before
      // (CR 400.7, 607.2a), as for Skyclave Apparition's token.
      const key = `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`;
      const owners = (s.linkedExile?.[key] ?? []).flatMap((l) => {
        const o = s.objects[l.id];
        return o?.zone === "exile" && (o.zoneChanges ?? 0) === l.zc ? [o.owner] : [];
      });
      return apnap(s, [...new Set(owners)]).filter((pid) => !player(s, pid).lost);
    }
    case "selfController": {
      // The source's controller now, or as it last existed on the battlefield (CR 608.2h).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const lk = me && s.lastKnown?.[me.id];
      const p = me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? controllerOf(s, me) : lk && lk.zc === ctx.sourceZc ? lk.controller : undefined;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "selfDefending": {
      // The player the source is attacking (CR 506.2).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const p = me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me.attacking : undefined;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "neighbor": {
      // Seats follow turn order, which goes to each player's left (CR 101.4); players who left the game have no seat.
      const seats = seatOrder(s).filter((p) => !player(s, p).lost || p === ctx.controller);
      const i = seats.indexOf(ctx.controller);
      const p = seats[(i + (ref.side === "left" ? 1 : seats.length - 1)) % seats.length];
      return i >= 0 && p !== undefined && p !== ctx.controller ? [p] : [];
    }
    case "selfOwner": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      return me && !player(s, me.owner).lost ? [me.owner] : [];
    }
    case "otherThanSelfOwner": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      return me ? livingPlayers(s).filter((p) => p !== me.owner) : [];
    }
    case "activePlayer":
      return player(s, s.activePlayer).lost ? [] : [s.activePlayer];
    case "combatDamagedBySelf": {
      // This object as the ability's source, the same one that dealt the damage (CR 400.7).
      const key = ctx.sourceId !== undefined ? `${ctx.sourceId}@${ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0}` : undefined;
      return s.turnOrder.filter((p) => !player(s, p).lost && !!key && !!s.turnLog?.combatDamagedBy?.[p]?.includes(key));
    }
    case "mostCreatures": {
      const n = (p: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === p && objIsType(s, obj(s, id), ref.lands ? "Land" : "Creature")).length;
      const most = ref.fewest ? Math.min(...livingPlayers(s).map(n)) : Math.max(0, ...livingPlayers(s).map(n));
      return apnap(s, livingPlayers(s).filter((p) => n(p) === most));
    }
    case "uniqueMost": {
      const p = uniqueMostPlayer(s, ref.stat, (who, f) => s.battlefield.filter((id) => { const o = obj(s, id); return controllerOf(s, o) === who && objectMatches(s, f, o, ctx.controller, false); }).length);
      return p === undefined ? [] : [p];
    }
    case "opponentsControllingNo":
      return opponents(s, ctx.controller).filter((p) => !s.battlefield.some((id) => { const o = obj(s, id); return controllerOf(s, o) === p && objectMatches(s, ref.filter, o, ctx.controller, false); }));
    case "playersControlling": {
      // "A permanent named ~" (Bonder's Ornament): its name now, or as it last existed (CR 201.5, 608.2h).
      const me = ref.filter.named === "~" && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const filter = ref.filter.named === "~" ? { ...ref.filter, named: me?.zone === "battlefield" ? characteristics(s, me).name : ctx.sourceDef.name } : ref.filter;
      return apnap(s, livingPlayers(s).filter((p) => s.battlefield.some((id) => { const o = obj(s, id); return controllerOf(s, o) === p && objectMatches(s, filter, o, ctx.controller, false); })));
    }
    case "opponentsNotDiscarded":
      return (ref.players ? apnap(s, livingPlayers(s)) : opponents(s, ctx.controller)).filter((p) => !(s.resolving?.discardedAll ?? []).some((id) => s.objects[id]?.owner === p && printedMatches(ref.filter, defOf(s, s.objects[id]!))));
    case "opponentsLostLife":
      return opponents(s, ctx.controller).filter((p) => (s.turnLog?.lifeLost?.[p] ?? 0) >= ref.n);
    case "subjectControllerOpponents": {
      const ctl = players(s, { ref: "subjectController" }, ctx)[0];
      return ctl === undefined ? [] : apnap(s, livingPlayers(s).filter((p) => p !== ctl));
    }
    case "opponentsWithPoison":
      return opponents(s, ctx.controller).filter((p) => (player(s, p).poison ?? 0) >= ref.n);
    case "playersWithLife":
      return livingPlayers(s).filter((p) => player(s, p).life === ref.n);
    case "playersWithoutMaxSpeed":
      return apnap(s, livingPlayers(s)).filter((p) => (player(s, p).speed ?? 0) !== 4);
    case "opponentsEmptyHanded":
      return opponents(s, ctx.controller).filter((p) => !player(s, p).hand.length);
    case "opponentsCombatDamagedByName": {
      // The name the ability says, its source's (CR 201.4); it doesn't matter who controlled those creatures (rulings).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const name = me ? defOf(s, me).name : undefined;
      return opponents(s, ctx.controller).filter((p) => !!name && !!player(s, p).combatDamagedByNames?.includes(name));
    }
    case "choseWord":
      return apnap(s, Object.entries(s.resolving?.chose ?? {}).filter(([, w]) => w === ref.option).map(([k]) => Number(k) as PlayerId)).filter((p) => !player(s, p).lost);
    case "flippedTails":
      return (s.resolving?.flippedTails ?? []).filter((p) => !player(s, p).lost);
    case "choseThisWay":
      return (s.resolving?.scratch?.mayers ?? s.resolving?.choseThisWay ?? []).filter((p) => !player(s, p).lost && (!ref.opponents || p !== ctx.controller));
    case "notChoseThisWay": {
      const did = s.resolving?.scratch?.mayers ?? s.resolving?.choseThisWay ?? [];
      return (ref.opponents ? opponents(s, ctx.controller) : apnap(s, s.players.map((p) => p.id))).filter((p) => !did.includes(p) && !player(s, p).lost);
    }
    case "punished":
      return (s.resolving?.scratch?.punished ?? []).filter((p) => !player(s, p).lost);
    case "couldntPick":
      return (s.resolving?.couldntPick ?? []).filter((p) => !player(s, p).lost);
    case "damagedThisWay":
      return (s.resolving?.playersDamagedThisWay ?? []).filter((p) => !player(s, p).lost);
    case "clashOpponent": {
      const p = s.resolving?.clashOpp;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "giftee": {
      const p = gifteeOf(s, ctx);
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "yardPlayer": {
      // Lodestone Bauble (round 417): the player chosen as it was activated, if still in the game.
      const p = s.resolving?.item.yardPlayer;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "modeChooser": {
      // "That player" in a mode an opponent chose (Misfortune, CR 700.2e): them, as they were chosen as it was cast.
      const item = s.resolving?.item;
      const p = item?.kind === "spell" ? item.modeChooser : undefined;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "opponentsAttackingEventPlayer": {
      // "A player is attacking another player if they control a creature that's attacking that player" (rulings).
      const p = ctx.event?.player;
      if (p === undefined) return [];
      return opponents(s, ctx.controller).filter((q) => s.battlefield.some((id) => s.objects[id]!.attacking === p && !s.objects[id]!.attackingPermanent && controllerOf(s, s.objects[id]!) === q));
    }
    case "subjectController": {
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      // A token that has ceased to exist (CR 704.5d, a Clue sacrificed): its controller as it last existed, when the
      // trigger carries it (CR 608.2h).
      if (!o) return ctx.lki?.controller !== undefined && !player(s, ctx.lki.controller).lost ? [ctx.lki.controller] : [];
      if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc) return [controllerOf(s, o)];
      // It left the battlefield: its controller as it last existed (CR 608.2h). A dies trigger saw it leave, so its
      // subject is the card where it went, and the trigger carries who controlled it.
      const lk = s.lastKnown?.[o.id];
      if (lk && lk.zc === ctx.subject!.zc) return [lk.controller];
      // "When that creature dies this turn, its controller gets a poison counter" (Virulent Wound): a delayed trigger
      // about the card in the graveyard, its controller as it last existed on the battlefield, one zone change earlier.
      if (lk && o.zone !== "battlefield" && lk.zc === ctx.subject!.zc - 1 && !ctx.lki) return player(s, lk.controller).lost ? [] : [lk.controller];
      return ctx.lki?.controller !== undefined && !player(s, ctx.lki.controller).lost ? [ctx.lki.controller] : [];
    }
    case "subjectOwner": {
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      return o && !player(s, o.owner).lost ? [o.owner] : [];
    }
    case "sourceOwner": {
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      return o && !player(s, o.owner).lost ? [o.owner] : [];
    }
    case "targetOwner": {
      const t = ctx.targets[ref.index];
      const o = ctx.legal[ref.index] && t?.kind === "object" ? s.objects[t.id] : undefined;
      return o ? [o.owner] : [];
    }
    case "targetOrController": {
      const t = ctx.targets[ref.index];
      return players(s, { ref: t?.kind === "player" ? "target" : "targetController", index: ref.index }, ctx);
    }
    case "targetController": {
      const t = ctx.targets[ref.index];
      if (!ctx.legal[ref.index] || !t) return [];
      // A spell that's been countered by now: its controller as it was (last known information, CR 608.2h).
      if (t.kind === "stack") {
        const c = ctx.spellControllers?.[ref.index];
        return c === null || c === undefined ? [] : [c];
      }
      if (t.kind !== "object") return [];
      const o = s.objects[t.id];
      if (!o) return [];
      // Gone from the battlefield (destroyed by an earlier part of this): its controller as it last existed (CR 608.2h).
      const lk = s.lastKnown?.[o.id];
      if (o.zone !== "battlefield" && lk && lk.zc === (o.zoneChanges ?? 0) - 1) return [lk.controller];
      return [controllerOf(s, o)];
    }
  }
}

/**
 * A damage effect and the `sameEvent` one after it as one effect, dealt at once (CR 120.3): the second recipient in
 * `also` with its own amount, one amount for a recipient that's both (`merge`). Only when nothing else about them differs.
 */
function sameDamageEvent(a: Effect, b: Effect | undefined): Effect | undefined {
  if (a.type !== "damage" || b?.type !== "damage" || !b.sameEvent || a.also || b.also || a.alsoAmount !== undefined || a.merge || b.merge) return undefined;
  const { amount: _a, to: _t, ...restA } = a;
  const { amount: _b, to: _u, sameEvent: _s, ...restB } = b;
  if (JSON.stringify(restA) !== JSON.stringify(restB) || a.divided || a.evenly || a.excessToController || a.preventOf !== undefined) return undefined;
  // Each its own amount per player or per permanent, or a choice of player or planeswalker for the second: apart, as before.
  if (/"eachOne"|"attachedToAffected"/.test(JSON.stringify([a.amount, b.amount])) || b.to.ref === "playerOrPlaneswalker") return undefined;
  return { ...a, also: [b.to], alsoAmount: b.amount, merge: true };
}

export function runEffect(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  // Counters an effect puts on are put by the ability's controller (Vorinclex rulings), all at once (round 416).
  const result = withPutter(ctx.controller, () => batchCountersPut(s, () => runEffectInner(s, e, ctx)));
  invalidateCharacteristics(s);
  return result;
}

/** An amount as the ability works it out now (CR 608.2h). A negative result counts as 0 (CR 107.1b). */
export function amountNow(s: GameState, a: Amount, ctx: ResolveCtx): number {
  return Math.max(0, evalAmount(s, a, amountCtx(s, ctx)));
}

/**
 * The amount for each of `who`, worked out once before any of them acts and kept while it waits on their choices: their
 * own when it counts "their" things ("half the cards in their hand", PlayerRef eachOne), else the same for all.
 */
export function amountFor(s: GameState, a: Amount, ctx: ResolveCtx, who: PlayerId[]): Record<string, number> {
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.nFor) {
    const each = JSON.stringify(a).includes('"eachOne"');
    const same = each ? 0 : amountNow(s, a, ctx);
    sc.nFor = Object.fromEntries(who.map((pid) => [pid, each ? amountNow(s, a, { ...ctx, eachOne: pid }) : same]));
  }
  return sc.nFor;
}

export const amountCtx = (s: GameState, ctx: ResolveCtx): AmountCtx => ({
  controller: ctx.controller,
  sourceId: ctx.sourceId,
  ...(ctx.sourceDef ? { sourceName: ctx.sourceDef.name } : {}),
  sourceZc: ctx.sourceZc,
  x: ctx.x,
  event: ctx.event,
  ...(ctx.cause !== undefined ? { cause: ctx.cause } : {}),
  lki: ctx.lki,
  ...(ctx.subject ? { subject: ctx.subject } : {}),
  kicked: ctx.kicked,
  colorsSpent: ctx.colorsSpent,
  treasureSpent: ctx.treasureSpent,
  spent: ctx.spent,
  manaSpent: ctx.manaSpent,
  sacrificed: ctx.sacrificed,
  stationed: ctx.stationed,
  chosen: ctx.chosen,
  objects: (r) => {
    if (r.ref === "subject") return subjectEvenIfGone(s, ctx);
    // A targeted spell: its card, even after it's been countered ("its mana value").
    const spell = r.ref === "target" && ctx.legal[r.index] ? ctx.spellObjects?.[r.index] : undefined;
    if (spell && s.objects[spell]) return [s.objects[spell]!];
    return objects(s, r, ctx);
  },
  players: (r) => players(s, r, ctx),
});

/** The trigger's subject, also after it left the battlefield, so its last known power can be used (CR 608.2h). */
function subjectEvenIfGone(s: GameState, ctx: ResolveCtx): GameObject[] {
  const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
  if (!o) return [];
  const zc = o.zoneChanges ?? 0;
  return zc === ctx.subject!.zc ? [o] : zc === ctx.subject!.zc + 1 && o.zone !== "battlefield" ? [o] : [];
}

/** The colors of the ability's one object target: as it is, or as it last existed if it has left the battlefield (CR 608.2h). */
function targetColors(s: GameState, ctx: ResolveCtx): Color[] {
  const t = ctx.targets.find((x) => x?.kind === "object");
  if (t?.kind !== "object") return [];
  const o = s.objects[t.id];
  if (o?.zone === "battlefield" && (o.zoneChanges ?? 0) === t.zc) return characteristics(s, o).colors;
  return s.lastKnown?.[t.id]?.source?.colors ?? [];
}

/** The colors of the spell that triggered this cast trigger: as it is on the stack, or as it last existed there (its colors as cast). */
function castSpellColors(s: GameState, ctx: ResolveCtx): Color[] {
  const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
  if (!item) return [];
  const o = item.objectId !== undefined ? s.objects[item.objectId] : undefined;
  if (o?.zone === "stack" && s.stack.some((x) => x.id === ctx.cause)) return characteristics(s, o).colors;
  return item.castColors ?? [];
}

/** The player chosen for the source as it entered ("the chosen player"), as the ability was activated or as it is now. */
export function chosenPlayerOf(s: GameState, ctx: ResolveCtx): PlayerId | undefined {
  if (ctx.lki?.chosenPlayer !== undefined) return ctx.lki.chosenPlayer;
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc) ? o.chosen?.player : undefined;
}

/**
 * A resolving effect's changes with their numbers worked out now: "gets +X/+X" doesn't change
 * later if X's count does (CR 608.2h, 611.2c).
 */
/** Of `keywords`, the ones (or their "hexproof from" variants, CR 702.11d) a creature `pid` controls has. */
function sharedKeywords(s: GameState, pid: PlayerId, keywords: string[], where: true | "graveyard" = true): string[] {
  const out = new Set<string>();
  for (const id of where === "graveyard" ? s.players[pid]!.graveyard : s.battlefield) {
    const o = s.objects[id]!;
    if (!objIsType(s, o, "Creature") || (where !== "graveyard" && controllerOf(s, o) !== pid)) continue;
    // Concerted Effort: "landwalk" and "protection", each variant any of them has (rulings).
    for (const k of characteristics(s, o).keywords) if (keywords.some((w) => (k === w && w !== "Landwalk" && w !== "Protection") || (w === "Hexproof" && k.startsWith("Hexproof from ")) || (w === "Landwalk" && isLandwalk(k)) || (w === "Protection" && /^Protection from /i.test(k)))) out.add(k);
  }
  return [...out];
}

/** The opponents of `pid` who had the highest result of the last "each player rolls" (none if `pid`'s was higher than all theirs). */
function highestRollers(s: GameState, pid: PlayerId): PlayerId[] {
  const each = s.resolving?.rolledEach ?? {};
  const top = Math.max(...Object.values(each).map((v) => v ?? 0));
  return s.turnOrder.filter((p) => p !== pid && each[p] === top);
}

/** Hellish Rebuke: the player who cast the resolving spell (undefined for a copy, which wasn't cast, or an ability). */
function spellCaster(s: GameState): PlayerId | undefined {
  const item = s.resolving?.item;
  const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  return o && !o.spellCopy ? o.castBy : undefined;
}

/** Hellish Rebuke: the resolving spell's name, for the ability it gives (shown as "the player who cast Hellish Rebuke"). */
function resolvingSpellName(s: GameState): string {
  const item = s.resolving?.item;
  const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  return o ? defOf(s, o).name : "";
}

export function fixMods(s: GameState, mods: Modification[], ctx: ResolveCtx, affected?: ObjectId): Modification[] {
  const c = { ...amountCtx(s, ctx), ...(affected !== undefined ? { affected } : {}) };
  // Hellish Rebuke: "the player who cast ~" in the ability it gives is the player who cast this spell, fixed now (that
  // player even if another controls the spell; a copy no one cast names no one, rulings).
  // Martyrdom: "Only you may activate this ability": this spell's controller, fixed now (CR 109.5).
  return mods.map((m) => (m.kind === "addAbility" && m.text.includes(CAST_BY_SOURCE) ? { ...m, text: m.text.replaceAll(CAST_BY_SOURCE, casterMark(spellCaster(s), resolvingSpellName(s))) } : m.kind === "addAbility" && m.text.includes(SPELL_CONTROLLER) ? { ...m, text: m.text.replaceAll(SPELL_CONTROLLER, playerMark(ctx.controller, s.players[ctx.controller]?.name ?? "")) } : m)).map((m) =>
    // "Attacks this combat if able": the combat going on as it resolves.
    m.kind === "attacksIfAble" && m.combat === "this"
      ? { kind: "attacksIfAble", combat: s.combatsThisTurn ?? 0 }
      : // "Attacks during its controller's next combat phase if able" (Trench Behemoth): that player as it resolves, and not
        // a combat of theirs going on then (it isn't their next one).
        m.kind === "attacksIfAble" && m.turnOf === "controller" && affected !== undefined && s.objects[affected]
        ? { ...m, turnOf: controllerOf(s, s.objects[affected]!), ...(inCombatPhase(s) && s.activePlayer === controllerOf(s, s.objects[affected]!) ? { notCombat: { turn: s.turn, combat: s.combatsThisTurn ?? 0 } } : {}) }
      : // "~ attacks that player this combat if able" (Raving Dead): the player chosen as it resolved, in the combat going on.
        m.kind === "mustAttackPlayer"
        ? { ...m, ...(m.player === "chosen" && s.resolving?.chosen?.player !== undefined ? { player: s.resolving.chosen.player } : {}), ...(m.player === "you" ? { player: ctx.controller } : {}), ...(m.player === "eventPlayer" ? { player: ctx.event?.player ?? -1 } : {}), ...(typeof m.player === "object" && ctx.targets[m.player.target]?.kind === "player" ? { player: (ctx.targets[m.player.target] as { id: PlayerId }).id } : {}), ...(m.combat === "this" ? { combat: s.combatsThisTurn ?? 0 } : {}) }
      : m.kind === "mustBeBlocked" && m.combat === "this"
      ? { kind: "mustBeBlocked", combat: s.combatsThisTurn ?? 0 }
      : // "Those players" (Chaos Dragon): the opponents with the highest result of the roll just made, ties included.
      m.kind === "cantBeSacrificedBy" && m.player === "you"
      ? { kind: "cantBeSacrificedBy", player: ctx.controller }
      : m.kind === "cantAttackPlayers"
      ? { kind: "cantAttackPlayers", players: m.players === "highestRoll" ? highestRollers(s, ctx.controller) : m.players, ...(m.combat !== undefined ? { combat: m.combat === "this" ? s.combatsThisTurn ?? 0 : m.combat } : {}) }
      : // "Power and toughness each equal to its mana value" (Karn, the Great Creator): each affected object's own, worked
        // out in the layers (a permanent's mana value doesn't change but by a copy effect).
        (m.kind === "modifyPT" || m.kind === "setPT") && [m.power, m.toughness].some((a) => typeof a === "object" && a.count.kind === "affectedManaValue")
      ? m
      : m.kind === "modifyPT" || m.kind === "setPT"
      ? { ...m, power: evalAmount(s, m.power, c), toughness: evalAmount(s, m.toughness, c) }
      : m.kind === "setPower"
      ? { ...m, power: evalAmount(s, m.power, c) }
      : // Wall of Tombstones: the number is locked in as the effect resolves (CR 608.2h).
        m.kind === "setToughness"
      ? { ...m, toughness: evalAmount(s, m.toughness, c) }
      : // Odric, Lunarch Marshal: the keywords creatures its controller controls have now (CR 611.2c), variants included;
        // Bleeding Effect: the ones creature cards in its controller's graveyard have.
        m.kind === "addKeywords" && m.sharedAmongYours
        ? { kind: "addKeywords", keywords: sharedKeywords(s, ctx.controller, m.keywords, m.sharedAmongYours) }
        : // "Gains protection from the color of your choice": the color chosen as it resolved; "the card type of your choice"
        // (Pippin), the card type.
        m.kind === "addKeywords" && (m.keywords.includes(CHOSEN_PROTECTION) || m.keywords.includes(CHOSEN_HEXPROOF) || m.keywords.includes(CHOSEN_TYPE_PROTECTION))
        ? { ...m, keywords: bindChosenKeywords(m.keywords, s.resolving?.chosen?.color, undefined, s.resolving?.chosen?.cardType) }
        : // Éowyn: "protection from each of that creature's colors": its target's, as it last existed if it has left (rulings).
          m.kind === "addKeywords" && m.keywords.includes(TARGET_COLORS_PROTECTION)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== TARGET_COLORS_PROTECTION ? [k] : targetColors(s, ctx).map((c) => `Protection from ${COLOR_NAMES[c].toLowerCase()}`))) }
        : // Opal Titan: "protection from each of that spell's colors": the triggering spell's, as it last existed on the stack.
          m.kind === "addKeywords" && m.keywords.includes(CAST_SPELL_COLORS_PROTECTION)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== CAST_SPELL_COLORS_PROTECTION ? [k] : castSpellColors(s, ctx).map((c) => `Protection from ${COLOR_NAMES[c].toLowerCase()}`))) }
        : // "Gains protection from the chosen player" (Guardian Archon): the player chosen for its source.
          m.kind === "addKeywords" && m.keywords.includes(CHOSEN_PLAYER_PROTECTION)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== CHOSEN_PLAYER_PROTECTION ? [k] : chosenPlayerOf(s, ctx) !== undefined ? [protectionFromPlayer(chosenPlayerOf(s, ctx)!)] : [])) }
        : // "Protection from that player" after "target opponent takes an extra turn" (Eon Frolicker): that target player.
          m.kind === "addKeywords" && m.keywords.includes(TARGET_PLAYER_PROTECTION)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== TARGET_PLAYER_PROTECTION ? [k] : ((t) => (t?.kind === "player" ? [protectionFromPlayer(t.id)] : []))(ctx.targets.find((t) => t.kind === "player")))) }
        : // "Gains your choice of menace or lifelink", "loses your choice of flying, first strike, or trample" (Walking
          // Sponge): the keyword chosen as it resolved.
          (m.kind === "addKeywords" || m.kind === "removeKeywords") && m.keywords.includes(CHOSEN_KEYWORD)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== CHOSEN_KEYWORD ? [k] : s.resolving?.chosen?.keyword ? [s.resolving.chosen.keyword] : [])) }
        : // Excavator: "landwalk of each of the land types of the sacrificed land", as it last existed (CR 608.2h).
          m.kind === "addKeywords" && m.keywords.includes(SACRIFICED_LANDWALK)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== SACRIFICED_LANDWALK ? [k] : [...new Set(ctx.sacrificed?.[0]?.subtypes ?? [])].map((t) => `${t}walk`).filter((w) => !!landwalkLand(w)))) }
        : // Giant Slug: "gains landwalk of the chosen type": that land type's landwalk (CR 702.14a); Barbarian Guides: "snow
          // landwalk of the chosen type", a snow land of that type (CR 702.14c).
          m.kind === "addKeywords" && (m.keywords.includes(CHOSEN_LANDWALK) || m.keywords.includes(CHOSEN_SNOW_LANDWALK))
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== CHOSEN_LANDWALK && k !== CHOSEN_SNOW_LANDWALK ? [k] : chosenLandwalk(k, s.resolving?.chosen?.landType))) }
        : // "Becomes the creature type of your choice": the type chosen as it resolved.
          (m.kind === "setSubtypes" || m.kind === "addTypes") && m.subtypes.includes(CHOSEN_TYPE)
          ? { ...m, subtypes: m.subtypes.flatMap((st) => (st !== CHOSEN_TYPE ? [st] : s.resolving?.chosen?.type ? [s.resolving.chosen.type] : [])) }
          : // "Becomes the basic land type of your choice", "becomes the color of your choice".
            // "Can't be blocked by creatures that player controls" (The Black Gate): the player chosen as it resolved.
            m.kind === "cantBeBlockedBy" && m.filter.controller === "chosenPlayer"
            ? { ...m, filter: (({ controller: _, ...rest }) => ({ ...rest, controlledBy: s.resolving?.chosen?.player ?? -1 }))(m.filter) }
            : // "Can't be blocked by creatures your opponents control this turn" (Rikku): the opponents of its controller.
              m.kind === "cantBeBlockedBy" && m.filter.controller === "opponent"
            ? { ...m, filter: (({ controller: _, ...rest }) => ({ ...rest, notControlledBy: ctx.controller }))(m.filter) }
            : // "Can't be blocked by creatures of that color this turn" (Skrelv): the color chosen as it resolved.
              m.kind === "cantBeBlockedBy" && m.filter.chosen === "color"
            ? { ...m, filter: (({ chosen: _, ...rest }) => (s.resolving?.chosen?.color ? { ...rest, colors: [s.resolving.chosen.color] } : { ...rest, controlledBy: -1 }))(m.filter) }
            : (m.kind === "setLandTypes" || m.kind === "addTypes") && m.subtypes.includes(CHOSEN_LAND_TYPE)
            ? { ...m, subtypes: m.subtypes.flatMap((st) => (st !== CHOSEN_LAND_TYPE ? [st] : s.resolving?.chosen?.landType ? [s.resolving.chosen.landType] : [])) }
            : // "Becomes the color or colors of your choice" (Prismatic Lace): the colors chosen as it resolved.
              m.kind === "setColors" && m.chosen === "colors"
              ? { kind: "setColors", colors: [...(s.resolving?.chosen?.colors ?? [])] }
              : m.kind === "setColors" && m.chosen
              ? { kind: "setColors", colors: s.resolving?.chosen?.color ? [s.resolving.chosen.color] : [] }
              : m,
  ).flatMap((m0): Modification[] => {
    const m = m0 as Modification;
    // Gabriel Angelfire: "rampage 3" chosen is the keyword and its triggered ability (CR 702.23a), as "gains rampage 3" is.
    const ramp = m.kind === "addKeywords" ? m.keywords.find((k) => /^Rampage \d+$/.test(k)) : undefined;
    return ramp && m.kind === "addKeywords" ? [{ ...m, keywords: m.keywords.map((k) => (k === ramp ? "Rampage" : k)) }, { kind: "addAbility", text: ramp }] : [m];
  });
}

export function runEffectInner(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  const src = ctx.sourceDef.name;
  switch (e.type) {
    case "damage":
    case "eachDealsDamage":
    case "preventNext":
    case "redirectNext":
    case "preventCombatDamage":
    case "noLifeGain":
    case "noLifeGainForGame":
    case "turnRules":
    case "landManaUntilEndOfTurn":
    case "blockTaxThisTurn":
    case "attackTaxThisTurn":
    case "revealHandWhile":
    case "flashUntilNextTurn":
    case "opponentsHandOnlyUntilNextTurn":
    case "graveyardCastThisTurn":
    case "graveyardTurn":
    case "topTurn":
    case "handTurn":
    case "revealHandTurn":
    case "cantCast":
    case "cantPlayLands":
    case "noPrevention":
    case "damageMod":
    case "pumpPerBlocker":
    case "rememberGroup":
    case "draw":
    case "drawUpTo":
    case "getEnergy":
    case "getExperience":
    case "getRad":
    case "radiation":
    case "poison":
    case "loseAllCounters":
    case "banCounters":
    case "doublePlayerCounters":
    case "emblem":
    case "becomeMonarch":
    case "cantBecomeMonarch":
    case "becomeDayNight":
    case "extraLandThisTurn":
    case "ringTempts":
    case "increaseSpeed":
    case "reduceSpeedIfFastest":
    case "ascend":
    case "gainLife":
    case "noteLife":
    case "noEffect":
    case "exchangeLife":
    case "exchangeLifeWithSelf":
    case "loseUnspentMana":
    case "loseLife":
    case "setLife":
    case "addCombatMana":
    case "addMana":
    case "cantBlockRule":
    case "cantAttackRule":
    case "cantBeBlockedRule":
    case "keepManaThisTurn":
    case "manaTriggerThisTurn":
    case "stealDrawsThisTurn":
    case "costModThisTurn":
    case "fight":
    case "createdFightEach":
    case "bite":
    case "extraTurn":
    case "timesifter":
    case "endTurn":
    case "endCombatPhase":
    case "controlPlayer":
    case "skip":
    case "attackDirection":
    case "skipChosenThisTurn":
    case "addPhases":
    case "addUpkeepStep":
    case "addUpkeepPhases":
    case "addEndStep":
    case "loseGame":
    case "winGame":
    case "rememberChosenObject":
    case "highestLifeWins":
      return runBasicsEffect(s, e, ctx, src);
    case "damageRule":
      return runPreventionEffect(s, e, ctx, src);
    case "train": {
      // CR 702.149c: it trains when its resolving training ability puts one or more +1/+1 counters on it.
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (me?.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const before = me.counters["+1/+1"] ?? 0;
      const r = runEffect(s, { type: "counters", what: { ref: "self" }, counter: "+1/+1", n: 1 }, ctx);
      if (r === "paused") return r;
      if ((me.counters["+1/+1"] ?? 0) > before) fireEvent(s, { type: "trained", id: me.id });
      return;
    }
    case "echoPaid": {
      // "When ~'s echo cost is paid" (Shah of Naar Isle): the permanent whose echo it is, still that object (CR 400.7).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc)) fireEvent(s, { type: "echoPaid", id: me.id });
      return;
    }
    case "returnToBattlefield":
    case "unearth":
    case "castFromExileFree":
    case "exileRandomThenPlay":
    case "castTargetFree":
    case "destroy":
    case "regenerate":
    case "removeDamageShield":
    case "exile":
    case "returnLinked":
    case "exileFaceDown":
    case "moveLinked":
    case "revealHandOrTop":
    case "exileHandOrPermanent":
    case "playLinked":
    case "mayPlayLinked":
    case "takeOneExiled":
    case "cipher":
    case "haunt":
    case "grantFlashback":
    case "grantYardKeyword":
    case "grantYardKeywordEach":
    case "grantYardCast":
    case "pick":
    case "meld":
    case "sacrificeEach":
    case "sacrificeRandom":
    case "secretChoose":
    case "secretChooseEach":
    case "eachExilesPermanentsOrHand":
    case "randomCounterKind":
    case "destroyRandom":
    case "chooseRandom":
    case "keepRest":
    case "keepDestroyRest":
    case "empowerJace":
    case "returnOneElsewhere":
    case "bounce":
    case "weld":
    case "putOntoBattlefield":
    case "randomFromGraveyard":
    case "randomTargetsToBottom":
    case "destroyRandomTarget":
    case "chooseFromGraveyard":
    case "loreChoices":
    case "reorderGraveyard":
    case "returnAllFromGraveyard":
    case "commandersOntoBattlefield":
    case "putFromHand":
    case "revealFromHand":
    case "exileHand":
    case "mayCastFromGraveyard":
    case "castNow":
    case "predicament":
    case "alternatePicks":
    case "struggleForHand":
    case "destroyEachUnlessLife":
    case "putInLibrary":
    case "exiledCardToGraveyard":
    case "putInGraveyard":
    case "exileGraveyard":
    case "livingDeath":
    case "putAllOnBottom":
    case "linkedToBottom":
    case "topYardSplit":
    case "pileOnTop":
    case "returnOtherUntilLeaves":
    case "untilLeavesToGraveyard":
    case "returnFaceDownExiled":
    case "exiledToGraveyard":
    case "exileRemembered":
    case "processExile":
    case "flicker":
    case "returnHeld":
    case "permanentPiles":
    case "returnExiled":
    case "exileIfDies":
    case "exileDyingThisTurn":
    case "exileUncastThisTurn":
    case "shuffleFromExileThisTurn":
    case "noSearchThisTurn":
    case "exileReturnThisTurn":
    case "exileIfLeaves":
    case "noRegen":
    case "noCombatDamage":
    case "attackWithoutTapping":
    case "lookAtHand":
    case "lookAtFaceDown":
    case "sacrifice":
    case "animateDead":
    case "sacrificeAnimated":
    case "exploit":
    case "champion":
    case "returnChampioned":
    case "soulbond":
    case "ninjutsu":
    case "impulse":
    case "playLinkedThisTurn":
    case "castLinkedFree":
    case "madness":
    case "miracle":
    case "castFromHand":
    case "castFromAmong":
    case "exileCastEachType":
    case "suspendTick":
    case "suspendCast":
    case "siegeDefeated":
    case "exileSelfWithTime":
    case "mayCastExiledSelf":
    case "exileSpell":
    case "warpExile":
    case "playExiled":
    case "returnExiledNamed":
    case "forEachThisWay":
    case "eachMayCounter":
    case "chooseOwnCommander":
    case "commanderToHand":
    case "commandersToHand":
    case "commanderToBattlefield":
    case "toCommandZone":
    case "suspendCard":
    case "suspendImpulsed":
    case "sunburstChoose":
      return runZonesEffect(s, e, ctx, src);
    case "changeText":
      return runTextEffect(s, e, ctx, src);
    case "tap":
    case "turnFaceUp":
    case "turnFaceDown":
    case "suspect":
    case "untap":
    case "untapUpTo":
    case "tapAnyNumber":
    case "tapOrUntap":
    case "becomeSaddled":
    case "replaceLandMana":
    case "becameCrewed":
    case "gaveGift":
    case "cumulativeUpkeepPaid":
    case "classLevel":
    case "solve":
    case "harness":
    case "transform":
    case "becomePrepared":
    case "flip":
    case "removeFromCombat":
    case "waiveShroud":
    case "becomeBlocked":
    case "reselectAttack":
    case "earthbend":
    case "mustBlockSource":
    case "cantBlockSource":
    case "blockLimitThisCombat":
    case "phaseOut":
    case "phaseSwap":
    case "toggleTapped":
    case "proliferate":
    case "timeTravel":
    case "counterKindsAddOrRemove":
    case "removeTimeSuspended":
    case "amass":
    case "connive":
    case "recruit":
    case "skipUntap":
    case "noUntapNext":
    case "enterTappedUntil":
    case "entersWithCountersThisTurn":
    case "noMaxHandSize":
    case "handSizeForGame":
    case "counters":
    case "distribute":
    case "lastKnownCounters":
    case "endure":
    case "moveCounter":
    case "counterOfKindOnIt":
    case "removeCounters":
    case "noteManaSpent":
    case "noteAmount":
    case "removeAnyCounters":
    case "gatherCounters":
    case "battleDefense":
    case "removeAllCounters":
    case "moveAllCounters":
    case "removeSelfCounter":
    case "renown":
    case "adapt":
    case "adaptFresh":
    case "monstrosity":
    case "evolve":
    case "explore":
    case "exploreEach":
    case "doublePT":
    case "continuous":
    case "ungoad":
    case "exchangePower":
    case "groupRules":
    case "ownersGainControl":
    case "scrambleControl":
    case "successionControl":
    case "rotateControl":
    case "counterOfKindEach":
    case "counterKindToOthers":
    case "swapCreatures":
    case "juxtapose":
    case "exchangeControl":
    case "playerGains":
    case "attackBanNextTurn":
    case "attackBanThisTurn":
    case "cantAttackNextTurn":
    case "attackWalkerNextTurn":
    case "attackYouNextTurn":
    case "attach":
    case "becomeLicid":
    case "landTypeSwap":
    case "attachAny":
    case "attachAll":
    case "attachLastKnown":
    case "attachEquipmentTo":
    case "doubleX":
    case "removeExiledCounter":
    case "attachElsewhere":
    case "attachToRandomOpponent":
    case "attachToChosen":
    case "noteAttachments":
    case "unattach":
    case "unattachSelf":
    case "transformSelf":
    case "unlockDoor":
      return runPermanentsEffect(s, e, ctx, src);
    case "becomeCopy":
    case "nextEntersAsCopy":
      return runCopiesEffect(s, e, ctx);
    case "together":
      // Each kind of token at the same time (CR 608.2f): entering together, each sees the others enter.
      enterTogether(s, () => {
        const all: ObjectId[] = [];
        for (const x of e.effects) {
          runEffect(s, x, ctx);
          if (e.allCreated && s.resolving) all.push(...(s.resolving.created ?? []).filter((id) => !all.includes(id)));
        }
        if (e.allCreated && s.resolving) s.resolving.created = all;
      });
      return;
    case "myriad":
    case "encore":
    case "createTokenCopy":
    case "copyChosenPerOpponent":
    case "createToken":
    case "linkedExileToken":
    case "countModThisTurn":
      return runTokensEffect(s, e, ctx, src);
    case "delayed":
    case "castSearched":
    case "castSelfFree":
    case "castCommanderFree":
    case "castCipher":
    case "castParadigm":
    case "castLinkedCopy":
    case "copySpell":
    case "nextCast":
    case "nextSpellImprovise":
    case "floatingTrigger":
    case "cascade":
    case "exileUntilNonland":
    case "castFaceDownExiled":
    case "discover":
    case "ripple":
    case "counterUnlessPays":
    case "counterCause":
    case "causeToBottom":
    case "counterSpell":
    case "exileAsResolves":
    case "spellUncounterable":
    case "spellEntersWith":
    case "spellGains":
    case "counterEach":
    case "dismissStack":
    case "counterOpponentsStack":
    case "counterOpponentsStackUnless":
    case "bounceEachUnless":
    case "changeTarget":
    case "newTargets":
    case "newTargetsAny":
    case "controlSpell":
      return runSpellsEffect(s, e, ctx, src);
    case "mill":
    case "bottomToGraveyard":
    case "revealUntilLandToGraveyard":
    case "revealTopLandsToGraveyard":
    case "exileUntilTotalMv":
    case "exileTop":
    case "suspendExiledTop":
    case "putFromExiledTop":
    case "putSearchFound":
    case "returnDiedThisWay":
    case "revealTopToHand":
    case "duelReveal":
    case "revealTop":
    case "revealedToGraveyardCopySelf":
    case "exileRevealedToCast":
    case "discardRevealed":
    case "revealedUntilToBottom":
    case "revealedTo":
    case "forEachRevealed":
    case "parleyReveal":
    case "parleyToGraveyards":
    case "revealRevealed":
    case "spellToHand":
    case "discard":
    case "takeFromHand":
    case "scry":
    case "hideaway":
    case "clash":
    case "revealDrawn":
    case "surveil":
    case "orderTop":
    case "handToTop":
    case "scrollRack":
    case "drawnPayOrTop":
    case "shuffle":
    case "handToBottomDraw":
    case "topToBottom":
    case "shuffleIntoLibrary":
    case "shuffleSpell":
    case "taintedPact":
    case "shuffleZones":
    case "search":
    case "revealPick":
    case "guildFeud":
    case "opponentSplitsTargets":
    case "piles":
    case "exiledPiles":
    case "shuffleCreaturesReveal":
    case "dig":
    case "vault":
    case "nextDrawExile":
    case "nextDrawInstead":
    case "surge":
      return runLibraryEffect(s, e, ctx, src);
    case "exileNamed":
    case "revealUntil":
    case "revealUntilPerDestroyed":
    case "revealUntilPerExiled":
    case "banName":
      return runNamesEffect(s, e, ctx, src);
    case "venture":
    case "takeInitiative":
      return runDungeonsEffect(s, e, ctx, src);
    case "roll":
      return runDiceEffect(s, e, ctx, src);
    case "repeatIfDid":
      return runRepeatIfDidEffect(s, e, ctx, src);
    case "putMilledPair":
      return runPutMilledPairEffect(s, e, ctx, src);
    case "chooseHostOrNamed":
      return runChooseHostOrNamedEffect(s, e, ctx, src);
    case "searchEachExile":
      return runSearchEachExileEffect(s, e, ctx, src);
    case "guessTopKind":
      return runGuessTopKindEffect(s, e, ctx, src);
    case "secretNumberGuess":
      return runSecretNumberGuessEffect(s, e, ctx, src);
    case "shuffleExiledPile":
      return runShuffleExiledPileEffect(s, ctx, src);
    case "noHandPlaysUntilYourNextTurn":
      return runNoHandPlaysEffect(s, ctx, src);
    case "exileRandomTokenCopy":
      return runExileRandomTokenCopyEffect(s, e, ctx, src);
    case "kinCounters":
      return runKinCountersEffect(s, e, ctx);
    case "redistributeLife":
      return runRedistributeLifeEffect(s, ctx, src);
    case "untilLeavesToBottom":
      return runUntilLeavesToBottomEffect(s, ctx, src);
    case "chooseSourceNow":
      return runChooseSourceNowEffect(s, e, ctx, src);
    case "millUntil":
      return runMillUntilEffect(s, e, ctx);
    case "opponentSplitsCostExiled":
      return runOpponentSplitsCostExiledEffect(s, ctx, src);
    case "returnWithSacrificedAtYourNextUpkeep":
      return runReturnWithSacrificedEffect(s, e, ctx, src);
    case "swapFromGraveyards":
      return runSwapFromGraveyardsEffect(s, ctx, src);
    case "opponentShufflesExiledIn":
      return runOpponentShufflesExiledInEffect(s, ctx, src);
    case "thievesAuction":
      return runThievesAuctionEffect(s, ctx, src);
    case "warpWorld":
      return runWarpWorldEffect(s, ctx, src);
    case "glimpseOfTomorrow":
      return runGlimpseOfTomorrowEffect(s, ctx, src);
    case "faceDownPile":
      return runFaceDownPileEffect(s, e, ctx, src);
    case "playTopOrHand":
      return runPlayTopOrHandEffect(s, e, ctx, src);
    case "powerToPlayers":
      return runPowerToPlayersEffect(s, e, ctx, src);
    case "stealTokensThisTurn":
      return runStealTokensEffect(s, ctx, src);
    case "returnOneOfThem":
      return runReturnOneOfThemEffect(s, e, ctx, src);
    case "moveCurseToOpponent":
      return runMoveCurseEffect(s, ctx, src);
    case "exileUntilNonlandLinked":
      return runExileUntilNonlandLinkedEffect(s, e, ctx, src);
    case "revealTopsShareType":
      return runRevealTopsShareTypeEffect(s, ctx, src);
    case "becomeCopyOfLinked":
      return runBecomeCopyOfLinkedEffect(s, e, ctx, src);
    case "becomeCopyOfAmong":
      return runBecomeCopyOfAmongEffect(s, e, ctx, src);
    case "becomeCopyOfLinkedX":
      return runBecomeCopyOfLinkedXEffect(s, e, ctx, src);
    case "eachOpponentTakes":
      return runEachOpponentTakesEffect(s, e, ctx);
    case "chooseLinkedCard":
      return runChooseLinkedCardEffect(s, e, ctx, src);
    case "gainActivatedOf":
      return runGainActivatedOfEffect(s, e, ctx, src);
    case "exileFromHandOrYard":
      return runExileFromHandOrYardEffect(s, e, ctx, src);
    case "whenCastGainsActivated":
      return runWhenCastGainsActivatedEffect(s, e, ctx, src);
    case "phaseInSubject":
      return runPhaseInSubjectEffect(s, ctx, src);
    case "overTheTop":
      return runOverTheTopEffect(s, ctx, src);
    case "searchTheyName":
      return runSearchTheyNameEffect(s, e, ctx, src);
    case "copyNamedCard":
      return runCopyNamedCardEffect(s, e, ctx, src);
    case "noteCreatureType":
      return runNoteCreatureTypeEffect(s, e, ctx, src);
    case "goadChosenNames":
      return runGoadChosenNamesEffect(s, e, ctx, src);
    case "attachSelfToPlayer":
      return runAttachSelfToPlayerEffect(s, e, ctx);
    case "flickerWithAuras":
      return runFlickerWithAurasEffect(s, ctx, src);
    case "returnAurasAttached":
      return runReturnAurasAttachedEffect(s, e, ctx, src);
    case "tapLandsSharingMana":
      return runTapLandsSharingManaEffect(s, ctx, src);
    case "auraCopiesOnAttackers":
      return runAuraCopiesOnAttackersEffect(s, ctx, src);
    case "mayPlayOneExiledThisWay":
    case "revealOpponentExilesCasts":
    case "exileFromHandOrTarget":
      return runRound420Effect(s, e, ctx, src);
    case "exileCause":
    case "castRevealedFree":
      return runRound421Effect(s, e, ctx, src);
    case "revealTopCounterSharing":
    case "giveEachToDifferentOpponent":
      return runRound424Effect(s, e, ctx, src);
    case "mayCastExiledSpell":
      return runMayCastExiledSpellEffect(s, e, ctx);
    case "sacrificeTargetsReveal":
      return runSacrificeTargetsRevealEffect(s, e, ctx);
    case "guffRewrite":
      return runGuffRewriteEffect(s, e, ctx, src);
    case "exchangeSpellControl":
      return runExchangeSpellControlEffect(s, e, ctx, src);
    case "exchangeWithSubject":
      return runExchangeWithSubjectEffect(s, e, ctx, src);
    case "attackingNow":
      return runAttackingNowEffect(s, e, ctx);
    case "returnSacrificedCards":
      return runReturnSacrificedCardsEffect(s, e, ctx, src);
    case "discardOrSacrifice":
      return runDiscardOrSacrificeEffect(s, e, ctx, src);
    case "exileTopDamageEach":
      return runExileTopDamageEachEffect(s, e, ctx, src);
    case "faceDownPiles":
      return runFaceDownPilesEffect(s, e, ctx, src);
    case "revealRandomDiscardNamed":
    case "counterCauseIfNamed":
    case "eachChoosesFromHand":
      return runLaneB160Effect(s, e, ctx, src);
    case "counterKindsBribe":
      return runLaneB166Effect(s, e, ctx, src);
    case "exileAnyOfTop":
      return runLaneB167Effect(s, e, ctx, src);
    case "counterKindsOnEither":
      return runLaneB168Effect(s, e, ctx, src);
    case "loseAllBut":
    case "gainLinkedLifeLost":
      return runLaneB169Effect(s, e, ctx, src);
    case "eachRevealFromHand":
      return runLaneB170Effect(s, e, ctx, src);
    case "putFromHandRounds":
      return runLaneB172Effect(s, e, ctx, src);
    case "yourCreaturesUnblockedThisTurn":
      return runLaneB174Effect(s, e, ctx, src);
    case "discardSharesTypeLoss":
    case "discardGreatestMvLoss":
      return runLaneB177Effect(s, e, ctx, src);
    case "delayedUnlessPaid":
      return runLaneB180Effect(s, e, ctx, src);
    case "playersPutCounterEach":
    case "keywordCountersFromYard":
      return runLaneB184Effect(s, e, ctx, src);
    case "opponentsChooseFromTop":
    case "copiesBlockingAttackers":
      return runLaneB185Effect(s, e, ctx, src);
    case "lookFaceDownThisTurn":
    case "shuffleRevealTopFree":
      return runLaneB186Effect(s, e, ctx, src);
    case "keepUpToShuffleRest":
    case "exileTopLandToHandElseCounter":
    case "faceUpLinkedCounterNamed":
      return runLaneB189Effect(s, e, ctx, src);
    case "exileSelfAndTopOneOf":
      return runLaneB192Effect(s, e, ctx, src);
    case "noLegendRuleThisTurn":
    case "exileReturnAttackingAtDeclare":
    case "returnExiledAttacking":
      return runLaneB199Effect(s, e, ctx, src);
    case "returnExiledWithCounter":
    case "othersChooseDestroyRest":
    case "exileCreatedWithAtEndStep":
    case "exileTokensCreatedBy":
      return runLaneB200Effect(s, e, ctx, src);
    case "timeCountersEach":
    case "flipDestroyOrRepeat":
    case "guessNamedInHand":
      return runLaneB201Effect(s, e, ctx, src);
    case "yardTotalPower":
    case "removeCounterThenReturn":
      return runLaneB202Effect(s, e, ctx, src);
    case "aurasFromYardToYourCreatures":
    case "auraOntoEachCreated":
    case "revealTopAttackingOrHand":
      return runLaneB208Effect(s, e, ctx, src);
    case "cumulativeUpkeepUnpaid":
    case "exileReturnWhenSourceLeaves":
      return runLaneB210Effect(s, e, ctx, src);
    case "bounceUnlessDraw":
      return runLaneB212Effect(s, e, ctx, src);
    case "othersPaySpellCostToCounter":
    case "attackersPayOrBlockersGain":
      return runLaneB214Effect(s, e, ctx, src);
    case "eachLandUnlessAnyPaysLife":
      return runLaneB215Effect(s, e, ctx, src);
    case "repeatMaySteps":
    case "lookTopMaySacrificePay":
      return runLaneB216Effect(s, e, ctx, src);
    case "eachGuessTop":
    case "exiledToLibraryTop":
      return runLaneB218Effect(s, e, ctx, src);
    case "exchangeGroups":
      return runLaneB220Effect(s, e, ctx, src);
    case "nextEntersCounters":
      return runLaneB221Effect(s, e, ctx, src);
    case "delayedForAffected":
      return runLaneB223Effect(s, e, ctx, src);
    case "reverseTurnOrder":
      return runLaneB227Effect(s, e, ctx, src);
    case "halfSpellDamageBack":
    case "destroyCostTapped":
      return runLaneB229Effect(s, e, ctx, src);
    case "glyphReincarnation":
    case "authorityLink":
    case "authorityDestroy":
      return runLaneB230Effect(s, e, ctx, src);
    case "tombNote":
    case "tombLeaves":
    case "tombRemove":
      return runLaneB231Effect(s, e, ctx, src);
    case "attackersPayOrPrevent":
      return runLaneB232Effect(s, e, ctx, src);
    case "chosenAttackNextTurn":
    case "chosenAttackDestroy":
    case "secretCreatureType":
      return runLaneB233Effect(s, e, ctx, src);
    case "pilesOnly":
      return runLaneB234Effect(s, e, ctx, src);
    case "damageUnalterable":
      return runLaneB235Effect(s, e, ctx, src);
    case "servitudeLink":
    case "servitudeExile":
      return runLaneB236Effect(s, e, ctx, src);
    case "consulateRedirect":
    case "piracy":
      return runLaneB238Effect(s, e, ctx, src);
    case "peaceTalks":
      return runLaneB254Effect(s, e, ctx, src);
    case "whimsPiles":
      return runLaneB255Effect(s, e, ctx, src);
    case "reblock":
    case "raidingParty":
    case "searchTheCity":
      return runLaneB256Effect(s, e, ctx, src);
    case "swapBlockers":
    case "swapBlocked":
      return runLaneB258Effect(s, e, ctx, src);
    case "gameIsDraw":
      return runLaneB259Effect(s, e, ctx, src);
    case "discardSplicedNames":
      return runLaneB260Effect(s, e, ctx, src);
    case "payFullOrPart":
      return runLaneB262Effect(s, e, ctx, src);
    case "payShieldGrant":
      return runLaneB263Effect(s, e, ctx, src);
    case "bendOrBreak":
      return runLaneB264Effect(s, e, ctx, src);
    case "portalPiles":
    case "ragingRiver":
      return runLaneB265Effect(s, e, ctx, src);
    case "delayedCastExiledTarget":
      return runLaneB266Effect(s, e, ctx, src);
    case "gripReselect":
      return runLaneB267Effect(s, e, ctx, src);
    case "abstractPiles":
      return runLaneB270Effect(s, e, ctx, src);
    case "deadAurasOnto":
      return runLaneB272Effect(s, e, ctx, src);
    case "copyEnchantedCard":
      return runLaneB273Effect(s, e, ctx, src);
    case "dimensionalBreach":
    case "breachReturn":
      return runLaneB274Effect(s, e, ctx, src);
    case "coffinNote":
    case "coffinWatch":
    case "coffinReturn":
    case "takklemaggot":
      return runLaneB275Effect(s, e, ctx, src);
    case "runeswordMark":
      return runLaneB276Effect(s, e, ctx, src);
    case "exileSelfUntilTargetLeaves":
      return runLaneB241Effect(s, e, ctx, src);
    case "gatherSpecimens":
      return runLaneB250Effect(s, e, ctx, src);
    case "phaseOutExcess":
      return runLaneB222Effect(s, e, ctx, src);
    case "revealPutIfNamedAsPermanent":
      return runRound327Effect(s, e, ctx, src);
    case "dividedDamageBack":
      return runRound328Effect(s, e, ctx, src);
    case "surveilledToHand":
    case "loseInsteadThisTurn":
    case "flipCoinEachWon":
      return runRound329Effect(s, e, ctx, src);
    case "controllersMayExile":
      return runRound330Effect(s, e, ctx, src);
    case "copyPerOtherOpponent":
    case "copyAttachedOnto":
      return runRound333Effect(s, e, ctx, src);
    case "damageDefendingOthers":
      return runRound339Effect(s, e, ctx, src);
    case "foretellSelf":
    case "returnAsAura":
      return runRound344Effect(s, e, ctx, src);
    case "handChooseCast":
      return runRound345Effect(s, e, ctx, src);
    case "exileTopAsIt":
    case "castItIfAble":
      return runRound349Effect(s, e, ctx, src);
    case "linkSubjectCardToCreated":
    case "putAtYourNextEndStep":
      return runRound350Effect(s, e, ctx);
    case "putFromYardChosen":
      return runRound352Effect(s, e, ctx, src);
    case "copyForPlayers":
      return runRound353Effect(s, e, ctx, src);
    case "flipCoin":
      return runCoinEffect(s, e, ctx, src);
    case "flipCoinEach":
      return runCoinEachEffect(s, e, ctx, src);
    case "flipClash":
      return runFlipClashEffect(s, e, ctx, src);
    case "gameOfChaos":
      return runGameOfChaosEffect(s, e, ctx, src);
    case "eachPlayerFlips":
      return runEachPlayerFlipsEffect(s, e, ctx, src);
    case "flipEachOpponent":
      return runFlipEachOpponentEffect(s, e, ctx, src);
    case "vote":
    case "eachChooses":
    case "controlFromEach":
    case "chooseVotes":
    case "chooseBlocks":
    case "chooseAttacks":
    case "secretNumbers":
    case "bidLife":
    case "payLifeRounds":
    case "playerVotes":
      return runVotesEffect(s, e, ctx, src);
    case "may":
    case "repeatMay":
    case "repeat":
    case "repeatIf":
    case "rollAgain":
    case "either":
    case "splitTargets":
    case "villainous":
    case "eachMay":
    case "joinForces":
    case "punisher":
    case "cumulativeUpkeep":
    case "collectEvidence":
    case "reflexive":
    case "choose":
    case "choosePlayer":
    case "if":
      return runChoicesEffect(s, e, ctx, src);
  }
}

/**
 * Where a resolved instant or sorcery goes (CR 608.2n): its owner's graveyard; its owner's hand
 * if buyback was paid (CR 702.27a); exile, to be cast again at its controller's next upkeep, if it
 * has rebound and was cast from their hand (CR 702.88a). Flashback's and jump-start's exile is a
 * replacement effect that applies whatever the destination (CR 702.34a, see moveObject).
 */
function finishSpell(s: GameState, id: ObjectId, item: StackItem) {
  const o = obj(s, id);
  const d = defOf(s, o);
  const controller = o.controller;
  // Epic's two spell abilities, last as it resolves (CR 702.50a-b); a copy has no epic ability. Its copies copy it as it
  // resolved, with its choices (X, modes, targets), CR 707.10.
  if (compileCard(d).epic && !item.copy) {
    player(s, controller).cantCastSpells = d.name;
    (s.epics ??= {})[item.id] = structuredClone(item);
    addDelayed(s, "eachYourUpkeep", controller, o, { targets: [], effects: [{ type: "copySpell", spell: { epic: item.id }, n: 1, newTargets: true }], text: "Epic: copy ~ except for its epic ability. You may choose new targets for the copy." });
    log(s, `${player(s, controller).name} can't cast spells for the rest of the game (epic).`);
  }
  // Paradigm (CR 702.192a): the first time a spell with this name resolves for its controller, a copy of it every
  // precombat main phase of theirs from now on; then this spell is exiled (a copy ceases to exist there, 704.5e).
  if (compileCard(d).paradigm) {
    const p = player(s, controller);
    if (!(p.paradigms ??= []).includes(d.name)) {
      p.paradigms.push(d.name);
      addDelayed(s, "eachYourPrecombatMain", controller, o, { targets: [], effects: [{ type: "castParadigm", card: cardIdOf(o) }], text: `Paradigm: you may cast a copy of ${d.name} from exile without paying its mana cost.` });
    }
    moveObject(s, id, "exile");
    if (s.objects[id]?.zone === "exile") log(s, `${d.name} is exiled (paradigm).`);
    return;
  }
  // "Exile ~." (Spirit Water Revival): its own last instruction, so it doesn't go to the graveyard.
  if (compileCard(d).exileSelfOnResolve) {
    moveObject(s, id, "exile");
    const card = s.objects[id];
    if (card?.zone !== "exile") return;
    // All Hallow's Eve: "with two scream counters on it", on the card in exile (CR 122.1).
    const extra = compileCard(d).exileSelfCounters;
    if (extra) card.counters[extra.counter] = (card.counters[extra.counter] ?? 0) + extra.n;
    log(s, extra ? `${d.name} is exiled with ${extra.n} ${extra.counter} counters on it.` : `${d.name} is exiled.`);
    return;
  }
  // "Exile that card instead of putting it into your graveyard as it resolves" (Feather, the Redeemed; Lilah; Gandalf of the
  // Secret Fire; River Song's Diary): a replacement of its move to the graveyard (CR 614.1a, 608.2n), the first one made.
  // With buyback, rebound or an Adventure's exile as well, its controller would choose which applies (CR 616.1): this one
  // is applied. Flashback's exile is applied after it, so the card comes back as Feather says (rulings).
  const asRes = o.exileAsResolves?.find((x) => x.zc === (o.zoneChanges ?? 0) && (x.anyGraveyard || o.owner === x.by));
  if (asRes) {
    o.exileAsResolves = undefined;
    moveObject(s, id, "exile");
    const card = s.objects[id];
    if (card?.zone !== "exile") return;
    const zc = card.zoneChanges ?? 0;
    if (asRes.link) (s.linkedExile ??= {})[asRes.link] = [...(s.linkedExile?.[asRes.link] ?? []), { id, zc }];
    // Goliath Daydreamer: "with a dream counter on it", on the card in exile (CR 122.1).
    for (const [k, n] of Object.entries(asRes.counters ?? {})) card.counters[k] = (card.counters[k] ?? 0) + n;
    if (asRes.suspend) {
      log(s, `${asRes.src}: ${d.name} is exiled instead of going to the graveyard.`);
      suspendExiled(s, card, asRes.suspend);
    } else if (asRes.then === "plot") {
      card.mayPlay = { player: card.owner, zc, until: "plot", turn: s.turn };
      log(s, `${asRes.src}: ${d.name} is exiled instead of going to the graveyard and becomes plotted: ${player(s, card.owner).name} may cast it without paying its mana cost on a later turn.`);
      fireEvent(s, { type: "plotted", id });
    } else {
      const cs = Object.entries(asRes.counters ?? {}).map(([k, n]) => `${n === 1 ? "a" : n} ${k} counter${n === 1 ? "" : "s"}`);
      log(s, `${asRes.src}: ${d.name} is exiled${cs.length ? ` with ${cs.join(" and ")} on it` : ""} instead of going to the graveyard${asRes.then === "returnEndStep" ? "; it returns to its owner's hand at the beginning of the next end step" : ""}.`);
      if (asRes.then === "returnEndStep") addDelayed(s, "nextEndStep", asRes.by, card, { targets: [], effects: [{ type: "bounce", what: { ref: "subjectCard", zone: "public" } }], text: `Return ${d.name} to your hand.` });
    }
    return;
  }
  // Cast Through Time: rebound from a permanent its controller controls as the spell finishes resolving (rulings). Buyback
  // paid as well is a choice between the two (rulings); the buyback the caster paid for is kept.
  const reboundFrom = !o.buyback && !compileCard(d).rebound && !o.reboundGained && o.castFrom === "hand" && s.battlefield.some((id) => controllerOf(s, obj(s, id)) === item.controller && (abilitiesOf(s, obj(s, id)).spellsHaveRebound ?? []).some((f) => spellMatches(s, f, item)));
  if ((compileCard(d).rebound || o.reboundGained || reboundFrom) && o.castFrom === "hand" && !o.exileIfLeaves) {
    moveObject(s, id, "exile");
    log(s, `${d.name} is exiled (rebound).`);
    addDelayed(s, "yourNextUpkeep", controller, o, { targets: [], effects: [{ type: "castFromExileFree" }], text: "Rebound: you may cast ~ from exile without paying its mana cost." });
    return;
  }
  // An Adventure that resolves is exiled instead of going to the graveyard, and its controller may cast the creature
  // later for as long as it stays exiled (CR 715.3d). A copy of one isn't a card (CR 707.10a).
  if (o.face === 1 && s.cards[o.cardId]?.layout === "adventure" && !o.spellCopy) {
    moveObject(s, id, "exile");
    if (o.zone === "exile") {
      o.mayPlay = { player: controller, zc: o.zoneChanges ?? 0, until: "adventure", turn: s.turn };
      log(s, `${d.name} is exiled: ${player(s, controller).name} may cast ${defOf(s, o).name} from exile (on an adventure).`);
    }
    return;
  }
  if (o.buyback || o.toHandOnResolve) {
    const how = o.buyback ? " (buyback)" : "";
    moveObject(s, id, "hand");
    if (o.zone === "hand") log(s, `${d.name} returns to ${player(s, o.owner).name}'s hand${how}.`);
    return;
  }
  moveObject(s, id, "graveyard");
  if (s.objects[id]?.zone === "graveyard") fireEvent(s, { type: "resolvedToGraveyard", id });
}

export function damageRecipients(s: GameState, to: DamageRecipient, ctx: ResolveCtx): { objs: GameObject[]; pids: PlayerId[] } {
  if (to.ref === "attackedBySelf") {
    // What it's attacking as this resolves, or what it was attacking as it last existed on the battlefield (rulings on
    // Myr Battlesphere). A planeswalker removed from combat leaves it attacking nothing (CR 506.4c); a battle isn't a
    // player or planeswalker.
    // "It" is the creature that attacked in a trigger about another creature (Hellrider; Mage Slayer's equipped creature).
    const who = to.subject ? ctx.subject : ctx.sourceId ? { id: ctx.sourceId, zc: ctx.sourceZc } : undefined;
    const o = who ? s.objects[who.id] : undefined;
    const here = !!o && o.zone === "battlefield" && (who!.zc === undefined || (o.zoneChanges ?? 0) === who!.zc);
    const lk = !here && who ? s.lastKnown?.[who.id] : undefined;
    const at = here ? o : lk && (who!.zc === undefined || lk.zc === who!.zc) ? lk : undefined;
    if (at?.attackingPermanent) {
      const pw = s.objects[at.attackingPermanent.id];
      const still = !at.attackingPermanent.battleController && pw?.zone === "battlefield" && (pw.zoneChanges ?? 0) === at.attackingPermanent.zc;
      return { objs: still ? [pw!] : [], pids: [] };
    }
    return { objs: [], pids: at?.attacking !== undefined && !s.players[at.attacking]?.lost ? [at.attacking] : [] };
  }
  // "That permanent or player" (Ghyrson Starn): the permanent dealt damage, while it's still that permanent, else the player.
  // The player or planeswalker chosen as it resolved (see runBasicsEffect "damage"), while it's still that permanent.
  if (to.ref === "playerOrPlaneswalker") {
    const whom = s.resolving?.scratch?.damageWhom;
    if (whom === undefined) return { objs: [], pids: [] };
    if (whom.startsWith("p")) return { objs: [], pids: [Number(whom.slice(1)) as PlayerId] };
    const o = s.objects[whom];
    return { objs: o?.zone === "battlefield" ? [o] : [], pids: [] };
  }
  if (to.ref === "damagedBySelf") {
    const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) return { objs: [], pids: [] };
    const objs = (o.damagedWalkers ?? []).flatMap((w) => {
      const pw = s.objects[w.id];
      return pw?.zone === "battlefield" && (pw.zoneChanges ?? 0) === w.zc && objIsType(s, pw, "Planeswalker") ? [pw] : [];
    });
    return { objs, pids: opponents(s, ctx.controller).filter((p) => o.damagedPlayers?.includes(p)) };
  }
  if (to.ref === "eventRecipient") return ctx.subject ? { objs: objects(s, { ref: "subject" }, ctx), pids: [] } : { objs: [], pids: players(s, { ref: "eventPlayer" }, ctx) };
  if (to.ref === "anyTarget") {
    const out: { objs: GameObject[]; pids: PlayerId[] } = { objs: [], pids: [] };
    for (let i = to.index; i < to.index + (to.n ?? 1); i++) {
      const t = ctx.targets[i];
      if (!ctx.legal[i] || !t) continue;
      if (t.kind === "player") out.pids.push(t.id);
      else if (t.kind === "object") out.objs.push(obj(s, t.id));
    }
    return out;
  }
  if (to.ref === "self" || to.ref === "created" || to.ref === "subject" || to.ref === "attached" || to.ref === "allCreatures" || to.ref === "each" || to.ref === "blockingIt" || to.ref === "blockHistory" || to.ref === "inCombatWithSelf" || to.ref === "bandedWithSelf" || to.ref === "eventGroup" || to.ref === "targetHost" || to.ref === "attachedHost" || (to.ref === "target" && (("n" in to && !!to.n) || isObjectTarget(ctx, to.index))))
    return { objs: objects(s, to as ObjRef, ctx), pids: [] };
  return { objs: [], pids: players(s, to as PlayerRef, ctx) };
}

const isObjectTarget = (ctx: ResolveCtx, i: number) => ctx.targets[i]?.kind === "object";

/**
 * The damage source of a resolving spell or ability: the spell itself, or the ability's
 * source as it is now, or as it last was if it has left the battlefield (CR 702.90d).
 */
export function ctxSource(s: GameState, ctx: ResolveCtx): DamageSource {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (o && o.zone === "battlefield" && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc)) return { ...objectSource(s, o), controller: ctx.controller };
  // A spell is its own card on the stack; a gone permanent's ability, that permanent as it last existed (CR 609.7a):
  // with the colors, keywords and "can't be prevented" it had then (Vincent destroyed with its trigger on the stack).
  const lk = o && ctx.sourceZc !== undefined ? s.lastKnown?.[o.id] : undefined;
  if (lk?.source && lk.zc === ctx.sourceZc) return { ...lk.source, controller: ctx.controller, ref: { object: o!.id, zc: lk.zc } };
  const item = s.resolving?.item;
  const spell = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  const ref = spell ? { object: spell.id, zc: spell.zoneChanges ?? 0 } : ctx.sourceId ? { object: ctx.sourceId, zc: ctx.sourceZc ?? s.lastKnown?.[ctx.sourceId]?.zc ?? 0 } : undefined;
  // A spell's reflexive trigger: its source is the spell, gone from the stack, so as it last existed there (CR 113.7a).
  // "That spell gains deathtouch and lifelink" (Judith): keywords it gained while on the stack.
  const gained = spell?.zone === "stack" ? (spell.spellGains ?? []).flatMap((g) => g.mods.flatMap((m) => (m.kind === "addKeywords" ? m.keywords : []))) : [];
  // Soulfire Grand Master: "Instant and sorcery spells you control have lifelink", from a permanent its controller
  // controls as the damage is dealt.
  if (spell?.zone === "stack" && item) for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === item.controller) for (const g of abilitiesOf(s, obj(s, id)).spellsHaveKeywords ?? []) if (spellMatches(s, g.filter, item)) gained.push(g.keyword);
  const base = cardSource(ctx.sourceDef, ctx.controller, ref);
  return { ...base, ...(gained.length ? { keywords: [...new Set([...base.keywords, ...gained])] } : {}), ...(spell || item?.fromSpell ? { spell: true as const } : {}), ...(spell && item && !item.copy ? { cast: true as const } : {}), ...(spell && item ? { manaValue: spellManaValue(s, item) } : {}) };
}

/**
 * The creature types of this ability's source: as it is on the battlefield, or as it last existed there once it has
 * left (CR 608.2h), or its card if it never was. Changeling-like "every creature type" is "all" (CR 702.73a).
 */
export function sourceCreatureTypes(s: GameState, ctx: ResolveCtx): Set<string> | "all" {
  const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (src && src.zone === "battlefield" && (ctx.sourceZc === undefined || (src.zoneChanges ?? 0) === ctx.sourceZc)) return creatureTypesOf(s, src);
  const lk = ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
  const last = lk?.creatureTypes && (ctx.sourceZc === undefined || lk.zc === ctx.sourceZc) ? lk.creatureTypes : undefined;
  if (last) return last === "all" ? "all" : new Set(last);
  return everyCreatureType(ctx.sourceDef) ? "all" : new Set(ctx.sourceDef.subtypes.filter((t) => CREATURE_TYPES.has(t)));
}
