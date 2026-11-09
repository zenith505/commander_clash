import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  asFace,
  dredgeAmount,
  castableFaces,
  isType,
  landFaces,
  registerFace,
  abilityProblem,
  definedX,
  altCost,
  isEmerge,
  altCostsFor,
  canCast,
  castProblem,
  planTurnFaceUp,
  planUnlock,
  planEndEffect,
  endableEffect,
  endEffectProblem,
  planIgnoreEffect,
  ignorableBy,
  ignoreEffectProblem,
  forageWays,
  untapChoiceProblem,
  unlockCost,
  unlockProblem,
  restingDef,
  faceUpWays,
  faceUpFormsOf,
  turnFaceUpProblem,
  delveRoom,
  graveyardCast,
  graveyardWays,
  permissionWay,
  permitLabel,
  byTypeChoices,
  castExtraCosts,
  costsHaveX,
  mayPlayFromExile,
  mayPlayLandFromGraveyard,
  mayPlayFromTop,
  topVisible,
  topPlayable,
  handRevealed,
  deciderOf,
  assistedRemaining,
  dungeonByName,
  commanderTax,
  commanderTaxLife,
  abilitiesOf,
  controllerOf,
  describeTargets,
  describeCount,
  canChooseTarget,
  flagbearerAllows,
  sameTarget,
  divisionProblem,
  legalModes,
  spellModes,
  withModes,
  planActivate,
  spellTargets,
  offerTargets,
  forController,
  sourceQuality,
  spellQuality,
  copyTargetQuality,
  stackItemQuality,
  castHow,
  lifeCostOffers,
  isSummoningSick,
  legalActions,
  manaAbilitiesOn,
  livingPlayers,
  manaOptions,
  activatedManaOptions,
  spellCost,
  freeCastOf,
  manaPenalty,
  planManaAbility,
  type ManaOption,
  doesNothingNow,
  attackablePermanentProblem,
  attackProblem,
  attackCost,
  attackTaxPer,
  attackLifeCost,
  payableLife,
  blockCost,
  blockLifeCost,
  blocksMayCostLife,
  blockProblem,
  blockRequirementProblem,
  maxBlocks,
  pairedWith,
  hauntedBy,
  cardIdOf,
  realDefOf,
  legalTargets,
  characteristics,
  modifications,
  opponents,
  canGainLife,
  planCast,
  planMana,
  autoWaterbend,
  objectMatches,
  printedMatches,
  parseManaCost,
  manaValue,
  namesDiffer,
  autoConvoke,
  hasConvoke,
  autoCrew,
  casualtyCandidates,
  casualtyInstances,
  spliceCandidates,
  splicedBodies,
  withSplices,
  bargainCandidates,
  offeringCandidates,
  autoEvidence,
  evidenceCandidates,
  evidenceValue,
  bothModes,
  teamworkCandidates,
  teamworkPower,
  conspireCandidates,
  conspireInstances,
  dredgeOptions,
  madnessCastOf,
  planSuspend,
  suspendProblem,
  planPlot,
  planForetell,
  foretellProblem,
  foretellCostOf,
  foretoldCast,
  plotProblem,
  discardAnyTimeProblem,
  plotCost,
  plottedCast,
  compileCard,
  kickerName,
  canEnterUntapped,
  entersRulesOf,
  crewPower,
  potentialAttackers,
  walkersFreeToAttack,
  attackedName,
  returnCandidates,
  beholdCandidates,
  beholdWhat,
  linkedExileCards,
  linkedCostCards,
  processCandidates,
  hiddenInExile,
  tapCostCandidates,
  counterOnCandidates,
  untapViaMana,
  counterCostCandidates,
  counterCostKinds,
  craftCandidates,
  ringBearer,
  power,
  toughness,
  waitingOn,
  keywordLabel,
  type CardDef,
  type ManaType,
  type GameEvent,
  type GameObject,
  type GameState,
  type CostChoices,
  type PlayerId,
  type PTPart,
  type AbilityBody,
  type AdditionalCost,
  type CastFromGraveyardKind,
  type AltCostKind,
  type StackItem,
  type Step,
  type TargetChoice,
  type TargetSpec,
  COLOR_NAMES,
  COLORS,
  anyColorsCount,
  colorCombos,
  type Color,
  FACE_DOWN,
  FACE_DOWN_WARD,
  faceDef,
  pickOptions,
  blightOptions,
  shareLandType,
  oneOfEachFits,
  activatedCosts,
  abilityCostsHaveX,
  spellManaValue,
  blockWithoutCompany,
  showGrantSource,
  sameName,
  costChoiceShares,
  mayPayUse,
  canActAtSorcerySpeed,
} from "@cc/engine";
import { HUMAN, YOU, actAs, STOPPABLE, cardOf, seenCardOf, isCreature, isLand, loopReady, newGame, useGame, type DeckBundle, type LoopRecording, type PriorityMode } from "./useGame";
import { Arrows, targetSelectors as baseSelectors, type ArrowSpec } from "./Arrows";
import { ManaCost, ManaPoolView, RulesText } from "./Mana";

/** A player's pending "skip your next ..." effects (CR 614.10), e.g. "next 2 turns, next draw step". */
function skipsText(skips: NonNullable<GameState["players"][number]["skips"]>): string {
  const words = { turn: "turn", untap: "untap step", draw: "draw step", combat: "combat phase" } as const;
  return (["turn", "untap", "draw", "combat"] as const)
    .map((w) => [w, skips.filter((k) => k.what === w).length] as const)
    .filter(([, n]) => n)
    .map(([w, n]) => `next ${n > 1 ? `${n} ${words[w]}s` : words[w]}${skips.some((k) => k.what === w && k.turn !== undefined) ? " this turn" : ""}`)
    .join(", ");
}

/** Each seat's color for targeting arrows and stack labels. */
const PLAYER_COLORS = ["#c77dff", "#ff9f43", "#4cc9f0", "#ff5d8f"];
const playerColor = (pid: PlayerId) => PLAYER_COLORS[pid % PLAYER_COLORS.length]!;

const STEP_LABEL: Record<Step, string> = {
  untap: "Untap",
  upkeep: "Upkeep",
  draw: "Draw",
  main1: "Main 1",
  beginCombat: "Begin combat",
  declareAttackers: "Attackers",
  declareBlockers: "Blockers",
  firstStrikeDamage: "First strike",
  combatDamage: "Damage",
  endCombat: "End combat",
  main2: "Main 2",
  end: "End",
  cleanup: "Cleanup",
};

/**
 * Browser tests (apps/web/e2e) start the app straight into a game state they built with the engine
 * (`window.__ccTestState`, set before the page loads). Only in the dev server and the e2e build (`vite build --mode e2e`),
 * never in a production build.
 */
const testState = import.meta.env.DEV || import.meta.env.MODE === "e2e" ? (window as { __ccTestState?: GameState }).__ccTestState : undefined;

export function App() {
  if (testState) return <Table initial={testState} onQuit={() => location.reload()} />;
  return <DeckLoader />;
}

function DeckLoader() {
  const [bundle, setBundle] = useState<DeckBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/data/sample-decks.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setBundle)
      .catch(() => setLoadError("Card data not found. Run `npm run build:cards` first (see README)."));
  }, []);
  if (loadError) return <div className="splash">{loadError}</div>;
  if (!bundle) return <div className="splash">Loading cards…</div>;
  return <Lobby bundle={bundle} />;
}

function Lobby({ bundle }: { bundle: DeckBundle }) {
  const [game, setGame] = useState<GameState | null>(null);
  if (game) return <Table key={game.seed} initial={game} onQuit={() => setGame(null)} />;
  return (
    <div className="lobby">
      <h1>Commander Clash</h1>
      <p>Pick your deck. The other three are played by bots.</p>
      <div className="deck-list">
        {bundle.decks.map((d, i) => {
          const cmd = bundle.cards.find((c) => c.name === d.commander);
          return (
            <button key={d.name} className="deck-choice" onClick={() => setGame(newGame(bundle, i))}>
              {cmd?.imageUrl && <img src={cmd.imageUrl} alt={cmd.name} />}
              <span>{d.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Corner = "tl" | "tr" | "bl" | "br";

/**
 * Seats go clockwise in turn order with you in the bottom right:
 * you -> bottom left -> top left -> top right -> back to you.
 */
function seatCorners(s: GameState): Record<Corner, PlayerId | undefined> {
  const order = s.turnOrder;
  const h = order.indexOf(HUMAN);
  const at = (k: number) => order[(h + k) % order.length];
  return { br: HUMAN, bl: at(1), tl: at(2), tr: at(3) };
}

type ZoneView = { pid: PlayerId; zone: "graveyard" | "exile" | "hand" };

/** The human is picking targets for a spell, an activated ability, or a triggered ability (after its modes, if modal). */
type Targeting = (
  | { mode: "cast"; draft: CastDraft; specs: TargetSpec[]; chosen: TargetChoice[]; label: string }
  | { mode: "activate"; objectId: string; index: number; specs: TargetSpec[]; chosen: TargetChoice[]; label: string; modes?: number[]; x?: number }
  | { mode: "trigger"; specs: TargetSpec[]; chosen: TargetChoice[]; label: string }
  /** New targets for a copy of a spell (CR 707.10c), or keep the old ones. */
  | { mode: "copy"; specs: TargetSpec[]; chosen: TargetChoice[]; label: string }
  /** The new target of a spell whose target a resolving spell changes (CR 115.7a): one of the pending options. */
  | { mode: "change"; specs: TargetSpec[]; chosen: TargetChoice[]; label: string }
  /** New targets for a spell or ability a resolving spell lets us choose (CR 115.7d), or keep them. */
  | { mode: "retarget"; specs: TargetSpec[]; chosen: TargetChoice[]; label: string }
) & {
  /** The picks so far in a run of per-opponent slots starting at the next one (see perOpponentRun), by slot. */
  ahead?: (TargetChoice | undefined)[];
};

/** Targeting the engine is waiting on, which can't be cancelled. */
const answering = (t: Targeting | null | undefined) => t?.mode === "trigger" || t?.mode === "copy" || t?.mode === "change" || t?.mode === "retarget";

/** Targets chosen for damage "divided as you choose" (CR 601.2d): how much each gets, at least 1 each. */
type Dividing = { targeting: Targeting; chosen: TargetChoice[] };

/** Each chosen target of a divided amount gets an even part to start with, the first ones any remainder. */
function evenDivision(specs: TargetSpec[], chosen: TargetChoice[]): TargetChoice[] {
  const out = [...chosen];
  for (let i = 0; i < specs.length; i++) {
    const d = specs[i]!.divided;
    if (d?.first !== i) continue;
    const slots = Array.from({ length: d.n }, (_, k) => d.first + k).filter((k) => out[k]?.kind === "object" || out[k]?.kind === "player");
    slots.forEach((k, j) => {
      out[k] = { ...(out[k] as Extract<TargetChoice, { kind: "object" | "player" }>), amount: Math.floor(d.total / slots.length) + (j < d.total % slots.length ? 1 : 0) };
    });
  }
  return out;
}

/** The human is choosing modes for a modal spell or activated ability they're casting (CR 700.2a). */
type ModePick = { mode: "cast"; objectId: string; label: string; body: AbilityBody; convoke?: string[]; teamwork?: string[]; /** Kicker already announced (Inscriptions): the cast goes on from here. */ draft?: CastDraft; /** The face it's cast as. */ face?: number } | { mode: "activate"; objectId: string; index: number; label: string; body: AbilityBody };

/** Picking creatures to tap: to crew a Vehicle (CR 702.122a), to station (CR 702.184a, one creature) or to convoke a spell (CR 702.51a). */
type TapPick =
  | { kind: "crew"; objectId: string; index: number; n: number; chosen: string[]; saddle?: boolean }
  | { kind: "station"; objectId: string; index: number; chosen: string[] }
  | { kind: "convoke"; objectId: string; chosen: string[]; face?: number }
  /** Teamwork N: tap creatures with total power N or more as you cast it, or none. */
  | { kind: "teamwork"; objectId: string; n: number; chosen: string[]; convoke?: string[]; face?: number }
  /** Harmonize (CR 702.180a-b): tap up to one untapped creature you control, its power off the cost. */
  | { kind: "harmonize"; objectId: string; chosen: string[]; draft: CastDraft };

/**
 * A spell being cast, built up step by step in the order of CR 601.2b-h: modes, kicker, X,
 * targets, then additional costs to pay. Convoke creatures are picked first, as a shortcut.
 */
type CastDraft = {
  objectId: string;
  /** Which once-each-turn graveyard permission it's cast with (Muldrotha's artifact or creature slot). */
  permit?: string;
  /** Aminatou's Augury: the card type it's cast as. */
  asType?: string;
  /** The face of a card with several it's cast as: a split card's half, an Adventure, a modal double-faced card's back. */
  face?: number;
  convoke?: string[];
  modes?: number[];
  kicks?: number[];
  x?: number;
  targets?: TargetChoice[];
  sacrifice?: string[];
  discard?: string[];
  exileCards?: string[];
  /** A Borderpost's basic land returned to hand, Daze's Island. */
  returnToHand?: string[];
  /** Cards exiled from your hand for Force of Will's alternative cost. */
  exileFromHand?: string[];
  /** The Defilers whose "you may pay 2 life" this spell pays. */
  lifeFor?: string[];
  /** Untapped creatures tapped for Lashknife's alternative cost. */
  tap?: string[];
  /** Counters removed for Quilled Greatwurm's "removing six counters from among creatures you control". */
  counters?: { id: string; kind: string }[];
  /** The creature blighted for "blight 1 or pay {3}" (Bogslither's Embrace) or "you may blight 1" (Cinder Strike). */
  counterOn?: string[];
  /** Cast from your graveyard this way (flashback, escape, ...). */
  via?: CastFromGraveyardKind;
  buyback?: boolean;
  /** Arcane cards in your hand spliced onto it, revealed as it's cast (CR 702.47a-b). */
  splice?: string[];
  /** Cast for its evoke or dash cost (CR 118.9). */
  alt?: AltCostKind;
  /** Cast prototyped as well as for `alt` (One with the Multiverse's {0}: prototyped isn't an alternative cost, CR 718.3). */
  prototyped?: true;
  /** Cards exiled from your graveyard for delve (CR 702.66a). */
  delve?: string[];
  /** The creatures sacrificed for casualty, one for each instance paid, or none (CR 702.153a-b). */
  casualty?: string[];
  /** No more instances of casualty are to be paid (the last pick was skipped). */
  casualtyDone?: boolean;
  /** The artifact, enchantment, or token sacrificed for bargain, or none (CR 702.166a). */
  bargain?: string[];
  /** The permanent sacrificed for offering, or none (CR 702.48a). */
  offering?: string[];
  /** Assist (CR 702.132a): the player asked to help pay its generic mana. */
  assist?: PlayerId;
  /** Cards revealed from your hand for a cost ("reveal a Pirate card from your hand"). */
  reveal?: string[];
  /** Which way to pay "sacrifice a creature or pay {3}{B}" (CR 601.2b). */
  costOr?: number;
  /** Liquid Fire: the number chosen as an additional cost (CR 601.2b). */
  number?: number;
  /** Creatures tapped for teamwork; empty when it isn't paid. */
  teamwork?: string[];
  /** Cast using harmonize: the creature tapped for it, or null for none (CR 702.180a-b). */
  harmonize?: string | null;
  /** The creatures tapped for conspire, two for each instance paid (CR 702.78a-b), or none. */
  conspire?: string[];
  /** No more instances of conspire to ask about (one skipped, CR 702.78b). */
  conspireDone?: boolean;
  /** The opponent promised the gift (CR 702.174a), or null for no gift. */
  gift?: PlayerId | null;
  /** Invigorate's "have an opponent gain 3 life": who gains it. */
  lifeTo?: PlayerId;
  /** "You may collect evidence N" as you cast it: the cards exiled, or none (CR 701.59a). */
  evidence?: string[];
  /** Collecting evidence for Conspiracy Unraveler's alternative cost: the cards exiled. */
  collect?: string[];
};

/**
 * Picking cards in your graveyard with total mana value `n` or more to collect evidence (CR 701.59a): as you cast a
 * spell (its optional additional cost, or Conspiracy Unraveler's alternative cost), or activate an ability.
 */
/** "Remove three counters from among ... you control" (Tekuthal): which counters, as the ability is activated. */
type CounterPick = { label: string; what: string; n: number; candidates: { id: string; kind: string; n: number }[] } & ({ activate: ActivateDraft; draft?: undefined } | { draft: CastDraft; activate?: undefined });
type EvidencePick = { label: string; n: number; candidates: string[]; optional: boolean; /** The Capitoline Triad: its own words, not collecting evidence. */ title?: string } & ({ draft: CastDraft; key: "evidence" | "collect"; activate?: undefined } | { activate: ActivateDraft; draft?: undefined; key?: undefined });

/** Choosing how to pay "sacrifice a creature or pay {3}{B}" (CR 601.2b). */
type CostOrPick = { draft: CastDraft; label: string; options: string[] };
/** Liquid Fire: "As an additional cost to cast this spell, choose a number between 0 and 5" (CR 601.2b). */
type NumberPick = { draft: CastDraft; label: string; min: number; max: number };

/** How to forage for an ability's cost (CR 701.61a): exile three cards from your graveyard or sacrifice a Food. */
type ForagePick = { label: string } & ({ activate: ActivateDraft; draft?: undefined } | { draft: CastDraft; activate?: undefined });

/** Choosing cards to exile for delve: any number up to `max`. */
type DelvePick = { draft: CastDraft; label: string; max: number; candidates: string[]; chosen: string[] };

/** Promising a gift to an opponent, or not (CR 702.174a). */
/** Gift's opponent (CR 702.174a), or with `life`, the opponent had gain that much life for an alternative cost (Invigorate). */
type GiftPick = { draft: CastDraft; label: string; what: string; options: PlayerId[]; life?: number };

/** Paying buyback or not (CR 702.27). */
type BuybackPick = { draft: CastDraft; label: string; cost: string; /** A cost that isn't mana: "sacrifice a land". */ text?: string };

/** Choosing which kicker costs to pay (CR 702.33). */
type KickPick = { draft: CastDraft; label: string; costs: string[]; multi: boolean; name: ReturnType<typeof kickerName>; chosen: number[]; /** "Kicker—Sacrifice two lands": the cost in words. */ text?: string };

/** Choosing what pays an additional cost: permanents to sacrifice, cards to discard or to exile from your graveyard. */
type CostPick = ({ draft: CastDraft; activate?: undefined; mana?: undefined; faceUp?: undefined; ignore?: undefined } | { activate: ActivateDraft; draft?: undefined; mana?: undefined; faceUp?: undefined; ignore?: undefined } | { mana: { objectId: string; ability: number; mana: ManaType; extra?: ManaType[] }; draft?: undefined; activate?: undefined; faceUp?: undefined; ignore?: undefined } | { faceUp: FaceUpDraft; draft?: undefined; activate?: undefined; mana?: undefined; ignore?: undefined } | { /** Paying to ignore this permanent's effect this turn (CR 116.2d): Volrath's Curse, Lost in Thought. */ ignore: string; draft?: undefined; activate?: undefined; mana?: undefined; faceUp?: undefined }) & {
  kind: "sacrifice" | "discard" | "exileCards" | "returnToHand" | "casualty" | "bargain" | "offering" | "tap" | "reveal" | "conspire" | "exileFromHand" | "splice" | "lifeFor" | "craft" | "counterOn";
  label: string;
  /** "Any number of": fewer than `n` are fine, down to this many (splice). */
  min?: number;
  /** The Shoals: the card picked sets X, its mana value (CR 107.3a). */
  setsX?: true;
  /** Foil: one of the cards picked must be this. */
  oneOf?: TargetSpec;
  /** Sphinx of the Chimes: the cards picked all have the same name. */
  sameName?: true;
  /** Ormos, Archive Keeper: no two of the cards picked may share a name. */
  differentNames?: true;
  /** Weight of Conscience, Illuminated Folio: the cost the picks must share a creature type or a color for (costChoiceShares). */
  share?: AdditionalCost;
  /** "Untap a tapped creature you control": the permanents picked are untapped, not tapped. */
  untap?: true;
  /** Offering when it can't be cast now without it: no skipping. */
  required?: true;
  /** "Exile four other artifact creatures you control" (Mechtitan Core): a sacrifice-kind cost that exiles instead. */
  exile?: true;
  what: string;
  n: number;
  candidates: string[];
  chosen: string[];
};

/** An activated ability being activated, in the order of CR 602.2b: modes, X, targets, then costs. */
/** `pick`: for a mana ability, the mana chosen in the menu ("one mana of any color", Fertile Ground's extra). */
/** Turning a face-down permanent face up for a morph cost that isn't mana ("Morph—Sacrifice two Mountains", CR 702.37e). */
type FaceUpDraft = { objectId: string; way: number; sacrifice?: string[]; discard?: string[]; returnToHand?: string[]; reveal?: string[] };
type ActivateDraft = { objectId: string; index: number; modes?: number[]; x?: number; targets?: TargetChoice[]; sacrifice?: string[]; discard?: string[]; reveal?: string[]; returnToHand?: string[]; tap?: string[]; exileFromHand?: string[]; exileCards?: string[]; collect?: string[]; counters?: { id: string; kind: string }[]; craft?: string[]; counterOn?: string[]; pick?: ManaPick };
type ManaPick = { mana?: ManaType; extra?: ManaType[] };

/** Announcing X for a spell or activated ability with {X} in its cost (CR 107.3a, 601.2b, 602.2b). */
type XPick =
  /** `extra`: an additional cost with X in it, "pay X life" (CR 107.3a). */
  /** `min`: "X can't be 0" (Thieving Skydiver's kicker). */
  | { mode: "cast"; draft: CastDraft; label: string; cost: string; max: number; value: number; extra?: string; min?: number }
  | { mode: "activate"; objectId: string; index: number; label: string; cost: string; max: number; value: number; modes?: number[]; extra?: string; /** "One or more" (Radiant Lotus): X can't be 0. */ min?: number }
  /** Turning a face-down permanent face up for "Disguise {X}{3}{W}" (CR 107.3d). */
  | { mode: "faceUp"; objectId: string; way: number; label: string; cost: string; max: number; value: number; extra?: string }
  /** "Suspend X—{X}{3}{U}. X can't be 0." (Aeon Chronicler): X time counters, `min` 1 (CR 702.62a). */
  | { mode: "suspend"; objectId: string; label: string; cost: string; max: number; value: number; extra?: string; min: number };

/** The biggest X you can pay for (`plan(x)` is null when you can't), up to 99. */
/** How many "up to" targets in a row start at `i`. */
/** Targets chosen so far, then nothing for each next one the spell is cast as if it didn't have (CR 702.33g). */
const NONE: TargetChoice = { kind: "none" };

const skipped = (specs: TargetSpec[], chosen: TargetChoice[]): TargetChoice[] => {
  const out = [...chosen];
  while (out.length < specs.length && specs[out.length]!.skip) out.push({ kind: "none" });
  return out;
};

/**
 * "For each opponent, … up to one target … that player controls" (CR 601.2c): one optional slot per opponent, in turn
 * order. The slots from `i` on that are part of such a run, so a click goes to the slot of the target's controller.
 */
const perOpponentRun = (specs: TargetSpec[], i: number) => {
  let end = i;
  while (specs[end]?.optional && specs[end]!.controlledBy !== undefined && !specs[end]!.skip) end++;
  return end - i > 1 ? end : i;
};

const optionalLeft = (specs: TargetSpec[], i: number) => {
  let n = 0;
  while (specs[i + n]?.optional) n++;
  return n;
};

function maxX(plan: (x: number) => unknown): number {
  if (!plan(0)) return 0;
  let lo = 0;
  let hi = 1;
  while (hi < 99 && plan(hi)) [lo, hi] = [hi, Math.min(99, hi * 2)];
  if (plan(hi)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (plan(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The X values a cost that gets cheaper as X grows can be paid with (Rottenmouth Viper: each permanent sacrificed takes
 * {1} off): from the fewest the mana allows to the most there are, none if none can be paid.
 */
function xRange(plan: (x: number) => unknown, limit = 60): { min: number; max: number } | undefined {
  let min = -1;
  let max = -1;
  for (let n = 0; n <= limit; n++) {
    if (plan(n)) {
      if (min < 0) min = n;
      max = n;
    } else if (min >= 0) break;
  }
  return min < 0 ? undefined : { min, max };
}

function Table({ initial, onQuit }: { initial: GameState; onQuit: () => void }) {
  const { state: s, dispatch, error, intent, priorityMode, setPriorityMode, stops, toggleStop, loop, startLoop, cancelLoop, repeatLoop, shortcutNote } = useGame(initial);
  // While you control another player, you see the table as they do and act for them (CR 723.4, 723.5).
  actAs(s);
  const [hover, setHover] = useState<CardDef | null>(null);
  const [attacks, setAttacks] = useState<Record<string, AttackTo>>({});
  /** The creature you've clicked to attack with, waiting for you to click the player it attacks. */
  const [aim, setAim] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Record<string, string[]>>({});
  const [blocker, setBlocker] = useState<string | null>(null);
  const [discards, setDiscards] = useState<string[]>([]);
  const [viewing, setViewing] = useState<ZoneView | null>(null);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  /** "Creatures from the battlefield and/or creature cards from graveyards": the graveyard cards are being looked at. */
  const [yardTargets, setYardTargets] = useState(false);
  const [dividing, setDividing] = useState<Dividing | null>(null);
  const [modePick, setModePick] = useState<ModePick | null>(null);
  const [menu, setMenu] = useState<string | null>(null); // permanent (or card in hand) whose abilities are shown
  const [tapPick, setTapPick] = useState<TapPick | null>(null);
  const [xPick, setXPick] = useState<XPick | null>(null);
  const [mixPick, setMixPick] = useState<MixPick | null>(null);
  const [kickPick, setKickPick] = useState<KickPick | null>(null);
  const [buybackPick, setBuybackPick] = useState<BuybackPick | null>(null);
  const [giftPick, setGiftPick] = useState<GiftPick | null>(null);
  const [costOrPick, setCostOrPick] = useState<CostOrPick | null>(null);
  const [numberPick, setNumberPick] = useState<NumberPick | null>(null);
  const [foragePick, setForagePick] = useState<ForagePick | null>(null);
  const [costPick, setCostPick] = useState<CostPick | null>(null);
  const [delvePick, setDelvePick] = useState<DelvePick | null>(null);
  const [evidencePick, setEvidencePick] = useState<EvidencePick | null>(null);
  const [counterPick, setCounterPick] = useState<CounterPick | null>(null);
  const [stackHidden, setStackHidden] = useState(false);
  const [handMinimized, toggleHand] = useHandTucked();

  // Bring the stack back into view whenever something new goes on it.
  const stackSize = s?.stack.length ?? 0;
  const prevStack = useRef(stackSize);
  useEffect(() => {
    if (stackSize > prevStack.current) setStackHidden(false);
    prevStack.current = stackSize;
  }, [stackSize]);

  const pending = s?.pending?.player === HUMAN ? s.pending : null;
  useEffect(() => {
    setAttacks({});
    setAim(null);
    setBlocks({});
    setBlocker(null);
    setDiscards([]);
    setTapPick(null);
    if (pending?.kind === "chooseTargets") {
      // Choosing the target of another player's ability ("target creature of your choice", TargetSpec.chosenBy): legal for them.
      const specs = offerTargets(s!, pending.specs, pending.controller ?? HUMAN, pending.x ?? 0, sourceQuality(s!, pending.sourceId), pending.sourceId);
      const forWhom = pending.controller !== undefined && pending.controller !== HUMAN ? (pending.deferred ? `${s!.players[pending.controller]!.name} asks you to choose a target for ` : `You choose the target for ${s!.players[pending.controller]!.name}'s ability: `) : "";
      setTargeting({ mode: "trigger", specs, chosen: skipped(specs, []), label: `${forWhom}${pending.description}` });
    } else if (pending?.kind === "copyTargets") setTargeting({ mode: "copy", specs: pending.specs, chosen: skipped(pending.specs, []), label: `${pending.source === pending.copyOf.replace(/ \(X=\d+\)$/, "") ? `${pending.copyOf} (copy)` : `${pending.source}: copy of ${pending.copyOf}`}${pending.left > 1 ? ` (${pending.left} copies left)` : ""}` });
    else if (pending?.kind === "changeTarget") setTargeting({ mode: "change", specs: [pending.spec], chosen: [], label: `${pending.source}: the new target of ${pending.spell}` });
    else if (pending?.kind === "newTargets") setTargeting({ mode: "retarget", specs: pending.specs, chosen: skipped(pending.specs, []), label: `${pending.source}: new targets for ${pending.spell}${pending.allOrNone ? " (change all of them, or keep them)" : ""}` });
    else setTargeting((t) => (answering(t) ? null : t));
  }, [pending?.kind, pending?.kind === "chooseTargets" ? pending.description : pending?.kind === "copyTargets" ? `${pending.copyOf}#${pending.left}` : pending?.kind === "changeTarget" || pending?.kind === "newTargets" ? pending.stackId : pending?.kind === "pickPermanents" ? `${pending.action}#${pending.what}#${pending.options.join(",")}` : ""]);

  const opps = useMemo(() => (s ? opponents(s, HUMAN) : []), [s]);
  // Who defends a permanent that can be attacked: a planeswalker's controller, a battle's protector (CR 506.2, 310.9b).
  const defenderOf = (id: string) => (s?.objects[id]?.protector !== undefined && characteristics(s, s.objects[id]!).types.includes("Battle") ? s.objects[id]!.protector! : controllerOf(s!, s!.objects[id]!));
  // Opponents' planeswalkers and the battles opponents protect, our own Sieges too, which can be attacked.
  const opponentWalkers = useMemo(
    () => (s ? s.battlefield.filter((id) => opps.includes(defenderOf(id)) && attackablePermanentProblem(s, HUMAN, defenderOf(id), id) === null) : []),
    [s, opps],
  );
  const attackablePlaneswalker = (id: string) => !!s && !!aim && opponentWalkers.includes(id) && !attackProblem(s, s.objects[aim]!, defenderOf(id), true);

  // Space passes priority (or resolves); Escape cancels targeting or closes the ability menu.
  const picking = !!(xPick || kickPick || costPick || costOrPick || numberPick || foragePick || delvePick || dividing || giftPick || buybackPick);
  const keys = useRef({ s, pending, targeting, modePick, tapPick, picking, dispatch });
  keys.current = { s, pending, targeting, modePick, tapPick, picking, dispatch };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = keys.current;
      if (e.key === "Escape") {
        setMenu(null);
        setModePick(null);
        setTapPick(null);
        setXPick(null);
        setKickPick(null);
        setCostPick(null);
        setCostOrPick(null);
        setNumberPick(null);
        setForagePick(null);
        setGiftPick(null);
        setAim(null);
        setBlocker(null);
        setTargeting((t) => (answering(t) ? t : null));
        setDividing((d) => (d?.targeting.mode === "trigger" ? d : null));
      } else if (e.key === " " && k.s && !k.targeting && !k.modePick && !k.tapPick && !k.picking && !k.pending && waitingOn(k.s) === HUMAN) {
        e.preventDefault();
        k.dispatch([{ type: "passPriority", player: HUMAN }]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!s) return null;
  const me = s.players[HUMAN]!;
  // Discarding, mulligans and bottoming mean looking at or picking from your hand, so it comes out even if you'd tucked it away.
  const pickingFromHand = pending?.kind === "discard" || pending?.kind === "discardToHandSize" || pending?.kind === "bottomCards" || pending?.kind === "handToTop";
  const handTucked = handMinimized && !pickingFromHand && pending?.kind !== "mulligan";

  const nextSpec = targeting ? targeting.specs[targeting.chosen.length] : undefined;
  // "Another target creature" on a permanent's ability can't be that permanent.
  // A spell or ability getting new targets: legal for it, as its controller (CR 115.7d).
  const retargeted = targeting?.mode === "retarget" && pending?.kind === "newTargets" ? s?.stack.find((x) => x.id === pending.stackId) : undefined;
  const targetController = retargeted?.controller ?? (targeting?.mode === "trigger" && pending?.kind === "chooseTargets" ? (pending.controller ?? HUMAN) : HUMAN);
  const targetSource = targeting?.mode === "activate" ? targeting.objectId : targeting?.mode === "trigger" && pending?.kind === "chooseTargets" ? pending.sourceId : retargeted?.sourceId;
  // The spell's own colors, or the ability's source's, for protection and "can't be the target of black spells" (CR 115.4).
  const castObj = targeting?.mode === "cast" && s ? s.objects[targeting.draft.objectId] : undefined;
  const targetQuality = !s ? undefined : castObj ? spellQuality(s, cardIdOf(castObj)) : targeting?.mode === "copy" ? copyTargetQuality(s) : retargeted ? stackItemQuality(s, retargeted) : targetSource ? sourceQuality(s, targetSource) : undefined;
  const runEnd = targeting && targeting.mode !== "change" && targeting.mode !== "retarget" ? perOpponentRun(targeting.specs, targeting.chosen.length) : 0;
  const inRun = !!targeting && runEnd > targeting.chosen.length;
  /** In a run of per-opponent slots, the slot this target would fill: the one for its controller (CR 601.2c). */
  const runSlot = (c: TargetChoice) => {
    if (!s || !targeting || !inRun) return -1;
    const from = targeting.chosen.length;
    for (let j = from; j < runEnd; j++) {
      const before = [...targeting.chosen, ...Array.from({ length: j - from }, (_, k) => targeting.ahead?.[from + k] ?? NONE)];
      if (canChooseTarget(s, targeting.specs, before, j, c, targetController, targetQuality, targetSource)) return j;
    }
    return -1;
  };
  const canTarget = (c: TargetChoice) =>
    !!s &&
    !!targeting &&
    !!nextSpec &&
    (targeting.mode === "change"
      ? pending?.kind === "changeTarget" && pending.options.some((o) => sameTarget(o, c))
      : targeting.mode === "retarget" && pending?.kind === "newTargets" && sameTarget(pending.current[targeting.chosen.length], c)
        ? true // kept, legal or not (CR 115.7d)
        : inRun
          ? runSlot(c) >= 0
          : !(retargeted && c.kind === "stack" && c.id === retargeted.id) &&
            canChooseTarget(s, targeting.specs, targeting.chosen, targeting.chosen.length, c, targetController, targetQuality, targetSource) &&
            // Coalition Honor Guard: a Flagbearer must be among the targets of a spell cast or an ability activated, if able.
            ((targeting.mode !== "cast" && targeting.mode !== "activate") || flagbearerAllows(s, targeting.specs, targeting.chosen, c, targetController, targetQuality, targetSource)));

  function pickTarget(c: TargetChoice) {
    if (!s || !targeting || !nextSpec) return;
    if (!canTarget(c)) return;
    if (inRun) {
      // One for each opponent, in any order; picking another for the same opponent replaces the first.
      const ahead = [...(targeting.ahead ?? [])];
      ahead[runSlot(c)] = c;
      if (ahead.slice(targeting.chosen.length, runEnd).filter(Boolean).length < runEnd - targeting.chosen.length) return setTargeting({ ...targeting, ahead });
      return finishRun(ahead);
    }
    finishTargets([...targeting.chosen, c]);
  }

  /** The per-opponent picks are made: the opponents without one get no target (CR 115.6). */
  function finishRun(ahead: (TargetChoice | undefined)[]) {
    if (!targeting) return;
    const run = Array.from({ length: runEnd - targeting.chosen.length }, (_, k) => ahead[targeting.chosen.length + k] ?? NONE);
    finishTargets([...targeting.chosen, ...run], undefined, { ...targeting, ahead: undefined });
  }

  /** "Up to two target creatures": leave the rest of them unchosen (CR 115.6). */
  function skipTargets() {
    if (!targeting) return;
    if (inRun) return finishRun(targeting.ahead ?? []);
    const chosen = [...targeting.chosen];
    while (chosen.length < targeting.specs.length && targeting.specs[chosen.length]!.optional) chosen.push({ kind: "none" });
    finishTargets(chosen);
  }

  function finishTargets(chosen0: TargetChoice[], divided?: Targeting, current?: Targeting) {
    const tg = divided ?? current ?? targeting;
    if (!tg) return;
    const chosen = skipped(tg.specs, chosen0);
    if (chosen.length < tg.specs.length) return setTargeting({ ...tg, chosen });
    setTargeting(null);
    setDividing(null);
    // Then how a divided amount is split among them (CR 601.2d); a copy keeps the division it has.
    if (!divided && tg.mode !== "copy" && tg.mode !== "change" && tg.mode !== "retarget" && tg.specs.some((x) => x.divided && !x.skip)) return setDividing({ targeting: tg, chosen: evenDivision(tg.specs, chosen) });
    if (tg.mode === "trigger") return dispatch([{ type: "chooseTargets", player: HUMAN, targets: chosen }]);
    if (tg.mode === "copy") return dispatch([{ type: "copyTargets", player: HUMAN, targets: chosen }]);
    if (tg.mode === "change") return dispatch([{ type: "changeTarget", player: HUMAN, target: chosen[0]! }]);
    if (tg.mode === "retarget") return dispatch([{ type: "newTargets", player: HUMAN, targets: chosen }]);
    if (tg.mode === "cast") return continueCast({ ...tg.draft, targets: chosen });
    continueActivate({ objectId: tg.objectId, index: tg.index, modes: tg.modes, x: tg.x, targets: chosen });
  }

  function useAbility(objectId: string, index: number, modes?: number[], x?: number, pick?: ManaPick) {
    if (!s) return;
    setMenu(null);
    const ab = abilitiesOf(s, s.objects[objectId]!).activated[index]!;
    const label = `${cardOf(s, objectId).name}: ${ab.text}`;
    // Crew: pick the creatures to tap, starting from a suggestion.
    if (ab.crew !== undefined) return setTapPick({ kind: "crew", objectId, index, n: ab.crew, chosen: autoCrew(s, HUMAN, objectId, ab.crew, ab.saddle) ?? [], ...(ab.saddle ? { saddle: true } : {}) });
    // Station: pick the one creature to tap, starting from the one with the greatest power.
    if (ab.station) {
      const best = convokers(s).filter((o) => o.id !== objectId).sort((a, b) => power(s, b) - power(s, a))[0];
      return setTapPick({ kind: "station", objectId, index, chosen: best ? [best.id] : [] });
    }
    if (ab.body.modal && !modes) return setModePick({ mode: "activate", objectId, index, label, body: ab.body });
    // Prototype Portal: an X the ability's text sets isn't chosen (CR 107.3c).
    const fixedX = definedX(s, s.objects[objectId]!, ab);
    if (x === undefined && fixedX != null) x = fixedX;
    // X is announced after modes and before targets (CR 602.2b, 601.2b-c).
    if (x === undefined && parseManaCost(ab.manaCost).hasX) {
      // Osgir, the Reconstructor: "Exile an artifact card with mana value X from your graveyard": only some X work, so the
      // greatest that does.
      const mvCard = ab.costs?.find((c) => c.kind === "exileFromGraveyard" && c.mvX);
      if (mvCard) {
        const fits = (n: number) => !!planActivate(s, HUMAN, objectId, index, undefined, modes, undefined, n);
        const max = Array.from({ length: 21 }, (_, n) => 20 - n).find(fits) ?? 0;
        return setXPick({ mode: "activate", objectId, index, label, cost: ab.manaCost, max, value: max, modes, extra: `exile ${mvCard.kind === "exileFromGraveyard" && mvCard.filter ? `${/^[aeiou]/i.test(mvCard.filter.text) ? "an" : "a"} ${mvCard.filter.text}` : "a card"} from your graveyard` });
      }
      const max = maxX((n) => planActivate(s, HUMAN, objectId, index, undefined, modes, undefined, n));
      return setXPick({ mode: "activate", objectId, index, label, cost: ab.manaCost, max, value: max, modes });
    }
    // "Sacrifice X Squirrels" (Chatterfang): X is announced first, up to how many you could sacrifice (CR 107.3a, 602.2b).
    if (x === undefined && abilityCostsHaveX(ab)) {
      // "Discard a card with mana value X" (Kozilek): only some X work, so the greatest that does, starting at the mana value
      // of the spell on top of the stack when that one does.
      // "Sacrifice a creature you control with mana value X other than ~" (Sidisi, Regent of the Mire): likewise.
      const mvX = ab.costs?.find((c) => (c.kind === "discard" || c.kind === "sacrifice") && c.mvX);
      if (mvX) {
        const fits = (n: number) => !!planActivate(s, HUMAN, objectId, index, undefined, modes, undefined, n);
        const max = Array.from({ length: 21 }, (_, n) => 20 - n).find(fits) ?? 0;
        const top = s.stack[s.stack.length - 1];
        const mv = mvX.kind === "discard" && top?.kind === "spell" && top.controller !== HUMAN ? spellManaValue(s, top) : undefined;
        const extra = mvX.kind === "sacrifice" ? `sacrifice ${/^[aeiou]/i.test(mvX.filter.text) ? "an" : "a"} ${mvX.filter.text.replace(/~/g, cardOf(s, objectId).name)}` : "discard a card with mana value X";
        return setXPick({ mode: "activate", objectId, index, label, cost: ab.manaCost, max, value: mv !== undefined && mv <= max && fits(mv) ? mv : max, modes, extra });
      }
      // "Exile one or more ...": X can't be 0 (Corpseweft), so 0 is never what we ask about.
      const max = maxX((n) => planActivate(s, HUMAN, objectId, index, undefined, modes, undefined, Math.max(n, ab.xMin ?? 0)));
      // "Tap X untapped Knights you control" (Aryel): the noun before "you control" in the plural.
      const extra = [...(ab.energyX ? ["pay X energy"] : []), ...(ab.removeCounters?.x ? [`remove X ${ab.removeCounters.counter} counters`] : []), ...(ab.costs ?? []).flatMap((c) => ("x" in c && c.x ? [c.kind === "removeCounters" ? `remove X ${c.counter ?? ""} counters from among ${c.filter.text}`.replace(/  +/g, " ") : `${c.kind === "sacrifice" ? "sacrifice" : c.kind === "exileFromGraveyard" ? "exile" : c.kind} X ${c.kind === "sacrifice" ? c.filter.text.replace(/s?$/, "s") : c.kind === "tap" ? c.filter.text.replace(/(\w)( you control)$/, "$1s$2") : c.kind === "reveal" ? `${plural(c.filter.text)} from your hand` : c.kind === "exileFromGraveyard" ? `${plural(c.filter?.text ?? "card")} from your graveyard` : ""}`.trim()] : []))].join(" and ");
      return setXPick({ mode: "activate", objectId, index, label, cost: ab.manaCost, max, value: Math.min(max, Math.max(ab.xMin ?? 0, 1)), modes, extra, ...(ab.xMin ? { min: ab.xMin } : {}) });
    }
    // −X loyalty abilities: X loyalty counters, up to how many it has (CR 606.6).
    if (x === undefined && ab.loyaltyX) {
      const max = s.objects[objectId]!.counters.loyalty ?? 0;
      return setXPick({ mode: "activate", objectId, index, label, cost: "−X loyalty", max, value: max, modes });
    }
    const body = withModes(ab.body, modes);
    // "Any number of target ...": an "up to" target for each there could be (CR 601.2c).
    // "Target ... of an opponent's choice" (Magus of the Arena): that opponent chooses it, after you choose yours.
    const offered = forController(offerTargets(s, body.targets, HUMAN, x ?? 0, sourceQuality(s, objectId), objectId));
    if (offered.length && offered.every((t) => t.skip) && body.targets.some((t) => t.chosenBy === "opponent")) return continueActivate({ objectId, index, modes, x, targets: offered.map(() => ({ kind: "none" as const })), ...(pick ? { pick } : {}) });
    // Goblin Test Pilot: "any target chosen at random", which the game picks as it's activated.
    if (offered.length && !body.targets.some((t) => t.random)) return setTargeting({ mode: "activate", objectId, index, specs: offered, chosen: skipped(offered, []), label, modes, x });
    continueActivate({ objectId, index, modes, x, ...(pick ? { pick } : {}) });
  }

  /** After targets: pick what to sacrifice or discard for the ability's costs (CR 602.2b, 601.2h), then activate. */
  function continueActivate(d: ActivateDraft) {
    if (!s) return;
    const ab = abilitiesOf(s, s.objects[d.objectId]!).activated[d.index]!;
    for (const c of activatedCosts(ab, d.x, s.objects[d.objectId])) {
      if (c.kind === "forage") {
        // Forage (CR 701.61a): three cards from your graveyard or a Food, whichever you can and choose.
        if (d.sacrifice !== undefined || d.exileCards !== undefined) continue;
        const label = cardOf(s, d.objectId).name;
        const ways = forageWays(s, HUMAN, s.objects[d.objectId]);
        if (ways.foods.length && ways.cards.length >= 3) return setForagePick({ activate: d, label });
        if (ways.foods.length) return setCostPick({ activate: d, kind: "sacrifice", label, what: "sacrifice a Food to forage", n: 1, candidates: ways.foods, chosen: [] });
        return setCostPick({ activate: d, kind: "exileCards", label, what: "exile three cards from your graveyard to forage", n: 3, candidates: ways.cards, chosen: [] });
      }
      if ("x" in c && c.x && c.n === 0) continue; // X is 0: nothing to pick
      if (c.kind === "collectEvidence") {
        // "Collect evidence 3": click cards in your graveyard until their mana values add up (CR 701.59a).
        if (d.collect !== undefined) continue;
        return setEvidencePick({ activate: d, label: cardOf(s, d.objectId).name, n: c.n, candidates: evidenceCandidates(s, HUMAN, undefined, [], c.filter), optional: false, ...(c.notEvidence && c.filter ? { title: `exile ${c.filter.text}s from your graveyard with total mana value ${c.n} or more` } : {}) });
      }
      if (c.kind === "craft") {
        // Craft's materials (CR 702.167a): click permanents you control and/or cards in your graveyard that fit.
        if (d.craft !== undefined) continue;
        const what = c.n === 1 ? `${/^[aeiou]/i.test(c.filter.text) ? "an" : "a"} ${c.filter.text}` : `${c.n} ${c.filter.text}`;
        return setCostPick({ activate: d, kind: "craft", label: cardOf(s, d.objectId).name, what: `craft: exile ${what} you control or from your graveyard`, n: c.n, candidates: craftCandidates(s, HUMAN, s.objects[d.objectId]!, c), chosen: [] });
      }
      if (c.kind === "removeCounters") {
        // "Remove three counters from among other artifacts, creatures, and planeswalkers you control": pick them (CR 602.2b).
        if (d.counters !== undefined) continue;
        return setCounterPick({ activate: d, label: cardOf(s, d.objectId).name, what: `remove ${c.n} ${counterCostKinds(c)}counter${c.n === 1 ? "" : "s"} ${c.self ? "from it" : `from among ${c.filter.text}`}`, n: c.n, candidates: counterCostCandidates(s, HUMAN, s.objects[d.objectId]!, c) });
      }
      if (c.kind === "putCounter") {
        // "Put a -1/-1 counter on a creature you control" (Hatchet Bully): click the creature (CR 602.2b).
        if (d.counterOn !== undefined) continue;
        return setCostPick({ activate: d, kind: "counterOn", label: cardOf(s, d.objectId).name, what: counterOnWhat(c), n: 1, candidates: counterOnCandidates(s, HUMAN, c), chosen: [] });
      }
      if (c.kind === "returnToHand") {
        // Ninjutsu: click the unblocked attacker to return (CR 702.49a).
        if (d.returnToHand !== undefined) continue;
        return setCostPick({ activate: d, kind: c.kind, label: cardOf(s, d.objectId).name, what: `return ${c.n === 1 ? "an" : c.n} ${c.filter.text} to hand`, n: c.n, candidates: returnCandidates(s, HUMAN, c), chosen: [] });
      }
      if (c.kind === "tap") {
        // "Tap an untapped creature you control": click what to tap (CR 602.2b).
        if (d.tap !== undefined) continue;
        // "Untap a tapped creature you control" (Halo Fountain) likewise, or one to tap for mana first.
        return setCostPick({ activate: d, kind: "tap", ...(c.untap ? { untap: true as const } : {}), ...(c.shareCreatureType ? { share: c } : {}), label: cardOf(s, d.objectId).name, what: `${c.untap ? "untap" : "tap"} ${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : c.n} ${c.n === 1 ? c.filter.text : c.filter.text.replace(/([^s])( you control)$/, "$1s$2")}${c.shareCreatureType ? " that share a creature type" : ""}`, n: c.n, candidates: [...tapCostCandidates(s, HUMAN, s.objects[d.objectId]!, c), ...(c.untap ? untapViaMana(s, HUMAN, s.objects[d.objectId]!, c) : [])].filter((id) => !d.sacrifice?.includes(id)), chosen: [] });
      }
      if (c.kind === "exileFromHand" && c.toLibrary) {
        // "Put a card from your hand on top of your library" (Penance): click the cards in your hand.
        if (d.exileFromHand !== undefined) continue;
        return setCostPick({ activate: d, kind: "exileFromHand", label: cardOf(s, d.objectId).name, what: `put ${c.n === 1 ? "a card" : `${c.n} cards`} from your hand on top of your library`, n: c.n, candidates: s.players[HUMAN]!.hand.filter((id) => id !== d.objectId), chosen: [] });
      }
      if (c.kind === "exileFromHand" && !c.anyNumber && !c.mvX) {
        // "Exile a nonland card from your hand" (Jhoira of the Ghitu): click the cards in your hand.
        if (d.exileFromHand !== undefined) continue;
        const what = c.filter?.text ?? "card";
        return setCostPick({ activate: d, kind: "exileFromHand", label: cardOf(s, d.objectId).name, what: `exile from your hand ${c.n === 1 ? (/^[aeiou]/i.test(what) ? "an" : "a") : c.n} ${what}${c.n > 1 ? "s" : ""}`, n: c.n, candidates: s.players[HUMAN]!.hand.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id)))), chosen: [] });
      }
      if (c.kind === "exileFromGraveyard" && c.process) {
        // The Eldrazi processors (Void Attendant): a card an opponent owns in exile, into its owner's graveyard.
        if (d.exileCards !== undefined) continue;
        return setCostPick({ activate: d, kind: "exileCards", label: cardOf(s, d.objectId).name, what: "put a card an opponent owns from exile into that player's graveyard", n: 1, candidates: processCandidates(s, HUMAN), chosen: [] });
      }
      if (c.kind === "exileFromGraveyard" && c.linked) {
        // Jester's Scepter: pick one of the cards exiled with it (you may look at them) to put into its owner's graveyard.
        if (d.exileCards !== undefined) continue;
        const label = cardOf(s, d.objectId).name;
        // Shelob, Dread Weaver: a creature card among them.
        const what = c.filter ? `${/^[aeiou]/i.test(c.filter.text) ? "an" : "a"} ${c.filter.text}` : "a card";
        return setCostPick({ activate: d, kind: "exileCards", label, what: `put ${what} exiled with ${label} into its owner's graveyard`, n: 1, candidates: linkedCostCards(s, s.objects[d.objectId]!, c.filter), chosen: [] });
      }
      if (c.kind === "exileFromGraveyard" && !c.top) {
        // "Exile a card from your graveyard" (Stonerise Spirit): click the cards in your graveyard.
        if (d.exileCards !== undefined) continue;
        const what = c.filter?.text ?? "card";
        const candidates = s.players[HUMAN]!.graveyard.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id))));
        if (c.toBottom) return setCostPick({ activate: d, kind: "exileCards", label: cardOf(s, d.objectId).name, what: `put ${c.n} cards from your graveyard on the bottom of your library`, n: c.n, candidates, chosen: [] });
        return setCostPick({ activate: d, kind: "exileCards", label: cardOf(s, d.objectId).name, what: `exile from your graveyard ${c.n === 1 ? (/^[aeiou]/i.test(what) ? "an" : "a") : c.n} ${what}${c.n > 1 ? "s" : ""}`, n: c.n, candidates, chosen: [] });
      }
      if (c.kind === "reveal" && !c.orControl) {
        // "Reveal X red cards from your hand" (Martyr of Ashes): click the cards in your hand; they stay there.
        if (d.reveal !== undefined) continue;
        const what = c.filter.text;
        return setCostPick({ activate: d, kind: "reveal", ...(c.shareColor ? { share: c } : {}), label: cardOf(s, d.objectId).name, what: `reveal ${c.n === 1 ? (/^[aeiou]/i.test(what) ? "an" : "a") : c.n} ${c.n > 1 ? plural(what) : what} from your hand${c.shareColor ? " that share a color" : ""}`, n: c.n, candidates: s.players[HUMAN]!.hand.filter((id) => id !== d.objectId && printedMatches(c.filter, cardOf(s, id))), chosen: [] });
      }
      if (c.kind !== "sacrifice" && c.kind !== "discard") continue;
      if (c.kind === "discard" && c.random) continue; // the game picks it (CR 701.9b)
      if (c.kind === "discard" && c.lastDrawn) continue; // Jandor's Ring: the last card drawn, nothing to choose
      if (d[c.kind] !== undefined) continue;
      const candidates =
        c.kind === "sacrifice"
          ? s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === HUMAN && !(c.other && id === d.objectId && !(c.selfIf && objectMatches(s, c.selfIf, s.objects[id]!, HUMAN, false))) && objectMatches(s, c.filter, s.objects[id]!, HUMAN, false))
          : s.players[HUMAN]!.hand.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id))));
      const what = c.kind === "sacrifice" ? c.filter.text.replace(/~/g, cardOf(s, d.objectId).name) : (c.filter?.text ?? "card");
      // "Sacrifice a creature with mana value 2 other than Sidisi": its text already says which.
      // Bloodfire Infusion: "Sacrifice enchanted creature": that one permanent.
      const article = c.kind === "sacrifice" && c.filter.objectId !== undefined ? "the" : c.kind === "sacrifice" && c.other && !/ other than /.test(c.filter.text) ? "another" : /^[aeiou]/i.test(what) ? "an" : "a";
      // "Sacrifice a Swamp and a Forest" (Jarad): its text names both.
      // Ormos, Archive Keeper: "Discard three cards with different names".
      const many = c.kind === "sacrifice" && c.oneOfEach ? `a ${what}` : `${c.n === 1 ? article : c.n} ${c.n > 1 ? plural(what) : what}${c.kind === "discard" && c.differentNames ? " with different names" : c.kind === "discard" && c.sameName ? " with the same name" : ""}`;
      return setCostPick({ activate: d, kind: c.kind, label: cardOf(s, d.objectId).name, what: `${c.kind === "sacrifice" && c.exile ? "exile" : c.kind} ${many}`, n: c.n, candidates, chosen: [], ...(c.kind === "sacrifice" && c.exile ? { exile: true as const } : {}), ...(c.kind === "discard" && c.differentNames ? { differentNames: true as const } : {}), ...(c.kind === "discard" && c.sameName ? { sameName: true as const } : {}) });
    }
    const costs = { ...(d.sacrifice?.length ? { sacrifice: d.sacrifice } : {}), ...(d.discard?.length ? { discard: d.discard } : {}), ...(d.reveal?.length ? { reveal: d.reveal } : {}), ...(d.returnToHand?.length ? { returnToHand: d.returnToHand } : {}), ...(d.tap?.length ? { tap: d.tap } : {}), ...(d.exileFromHand?.length ? { exileFromHand: d.exileFromHand } : {}), ...(d.exileCards?.length ? { exileCards: d.exileCards } : {}), ...(d.collect ? { collect: d.collect } : {}), ...(d.counters?.length ? { counters: d.counters } : {}), ...(d.craft?.length ? { craft: d.craft } : {}), ...(d.counterOn?.length ? { counterOn: d.counterOn } : {}) };
    dispatch(
      planActivate(s, HUMAN, d.objectId, d.index, d.targets, d.modes, undefined, d.x, costs, d.pick) ?? [
        { type: "activateAbility", player: HUMAN, objectId: d.objectId, index: d.index, targets: d.targets, modes: d.modes, ...(d.x ? { x: d.x } : {}), costs, ...d.pick },
      ],
    );
  }

  /** Turning a face-down permanent face up: pick what pays a morph cost that isn't mana, then do it (CR 702.37e). */
  function continueFaceUp(d: FaceUpDraft) {
    if (!s) return;
    const up = faceUpWays(s, s.objects[d.objectId]!)[d.way];
    if (!up) return;
    const label = `Turn face up (${up.kind} ${up.text ?? ""})`.replace(/ \)$/, ")");
    for (const c of up.costs ?? []) {
      if (c.kind !== "sacrifice" && c.kind !== "returnToHand" && c.kind !== "discard" && c.kind !== "reveal") continue;
      if (d[c.kind] !== undefined) continue;
      const me = s.players[HUMAN]!;
      const candidates =
        c.kind === "sacrifice"
          ? s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === HUMAN && objectMatches(s, c.filter, s.objects[id]!, HUMAN, false))
          : c.kind === "returnToHand"
            ? returnCandidates(s, HUMAN, c)
            : me.hand.filter((id) => !c.filter || printedMatches(c.filter, cardOf(s, id)));
      const what = c.kind === "sacrifice" || c.kind === "returnToHand" ? c.filter.text : (c.filter?.text ?? "card");
      const verb = c.kind === "returnToHand" ? "return" : c.kind;
      return setCostPick({ faceUp: d, kind: c.kind, label, what: `${verb} ${c.n === 1 ? (/^[aeiou]/i.test(what) ? "an" : "a") : c.n} ${c.n > 1 ? plural(what) : what}${c.kind === "returnToHand" ? " to hand" : ""}`, n: c.n, candidates, chosen: [] });
    }
    const costs = { ...(d.sacrifice?.length ? { sacrifice: d.sacrifice } : {}), ...(d.discard?.length ? { discard: d.discard } : {}), ...(d.returnToHand?.length ? { returnToHand: d.returnToHand } : {}), ...(d.reveal?.length ? { reveal: d.reveal } : {}) };
    dispatch(planTurnFaceUp(s, HUMAN, d.objectId, d.way, 0, costs) ?? [{ type: "turnFaceUp", player: HUMAN, objectId: d.objectId, ...(d.way ? { way: d.way } : {}), costs }]);
  }

  /** Done picking what to sacrifice, discard or exile: carry on casting or activating. */
  function finishCostPick(pick: CostPick) {
    setCostPick(null);
    if (pick.ignore !== undefined) {
      const costs = { [pick.kind]: pick.chosen };
      if (s) dispatch(planIgnoreEffect(s, HUMAN, pick.ignore, costs) ?? [{ type: "ignoreEffect", player: HUMAN, objectId: pick.ignore, costs }]);
      return;
    }
    if (pick.mana) {
      // A mana ability that taps other permanents too (Springleaf Drum).
      const plan = s && planManaAbility(s, HUMAN, pick.mana.objectId, pick.mana.ability, pick.mana.mana, pick.chosen, pick.mana.extra);
      if (plan) dispatch(plan);
      return;
    }
    if (pick.faceUp) continueFaceUp({ ...pick.faceUp, [pick.kind]: pick.chosen });
    else if (pick.activate) continueActivate({ ...pick.activate, [pick.kind]: pick.chosen });
    else if (pick.setsX && s) continueCast({ ...pick.draft, [pick.kind]: pick.chosen, x: manaValue(parseManaCost(cardOf(s, pick.chosen[0]!).manaCost)) });
    else if (pick.kind === "casualty" && pick.draft) {
      // Each instance of casualty is its own pick (CR 702.153b): add this creature to the ones already chosen.
      const before = pick.draft.casualty ?? [];
      continueCast({ ...pick.draft, casualty: [...before, ...pick.chosen], ...(pick.chosen.length ? {} : { casualtyDone: true }) });
    } else if (pick.kind === "conspire" && pick.draft) {
      // Each instance of conspire is its own pick (CR 702.78b): add this pair to the ones already chosen.
      const before = pick.draft.conspire ?? [];
      continueCast({ ...pick.draft, conspire: [...before, ...pick.chosen], ...(pick.chosen.length ? {} : { conspireDone: true }) });
    } else continueCast({ ...pick.draft, [pick.kind]: pick.chosen });
  }

  /**
   * The next step of casting a spell, after modes: kicker and X are announced, then targets
   * chosen (CR 601.2b-c), then additional costs paid along with the mana (601.2h).
   */
  /** Go on casting, with the face it's cast as up while its cost, modes and targets are worked out (CR 709.3, 715.3). */
  function continueCast(d: CastDraft): void {
    if (!s) return;
    const o = s.objects[d.objectId];
    if (o && d.face !== undefined) return asFace(s, o, d.face, () => continueCastAs(d));
    continueCastAs(d);
  }

  function continueCastAs(d: CastDraft): void {
    if (!s) return;
    const card = cardOf(s, d.objectId);
    const compiled = compileCard(card);
    const free = freeCastOf(s, HUMAN) === d.objectId;
    const how = { ...(d.face !== undefined ? { face: d.face } : {}), ...(d.via ? { via: d.via } : {}), ...(d.buyback ? { buyback: true } : {}), ...(d.splice?.length ? { splice: d.splice } : {}), ...(d.alt ? { alt: d.alt } : {}), ...(d.prototyped ? { prototyped: d.prototyped } : {}), ...(d.costOr !== undefined ? { costOr: d.costOr } : {}), ...(d.teamwork?.length ? { teamwork: d.teamwork } : {}), ...(d.harmonize ? { harmonize: d.harmonize } : {}), ...(d.permit ? { permit: d.permit } : {}), ...(d.asType ? { asType: d.asType } : {}), ...(d.exileFromHand?.length && compiled.exiledReduction ? { exileFromHand: d.exileFromHand } : {}), ...(d.lifeFor?.length ? { lifeFor: d.lifeFor } : {}), ...(d.offering?.length ? { offering: d.offering[0]! } : {}) };
    const kicks = { ...how, ...(d.kicks?.length ? { kicks: d.kicks } : {}) };
    // Offering: the permanent to sacrifice is chosen as the spell is announced (CR 702.48b), and sets its cost and when
    // it can be cast. Skipping isn't offered when it couldn't be cast now without it.
    if (d.offering === undefined && compiled.offering && !free) {
      const candidates = offeringCandidates(s, HUMAN, d.objectId);
      if (candidates.length) {
        const needed = /sorcery speed/.test(castProblem(s, HUMAN, d.objectId, undefined, undefined, undefined, undefined, undefined, {}) ?? "");
        return setCostPick({ draft: d, kind: "offering", label: card.name, what: `${compiled.offering.text} offering: ${needed ? "" : "you may "}sacrifice ${/^[aeiou]/i.test(compiled.offering.text) ? "an" : "a"} ${compiled.offering.text}; it costs that permanent's mana cost less${needed ? "" : " and can be cast any time you could cast an instant"}`, n: 1, candidates, chosen: [], ...(needed ? { required: true as const } : {}) });
      }
    }
    // Harmonize: which creature to tap is chosen as the cost is (CR 702.180b), first of all.
    if (d.via === "harmonize" && d.harmonize === undefined) {
      if (!convokers(s).length) return continueCast({ ...d, harmonize: null });
      return setTapPick({ kind: "harmonize", objectId: d.objectId, chosen: [], draft: d });
    }
    // The Dragons of Tarkir reveal cycle: with a Dragon of yours on the battlefield, revealing one adds nothing (rulings).
    const ifControl = compiled.kicker?.ifControl;
    if (d.kicks === undefined && ifControl && s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === HUMAN && objectMatches(s, ifControl, s.objects[id]!, HUMAN, false))) return continueCast({ ...d, kicks: [] });
    // Molten Exhale: beholding is the price of casting it at instant speed (CR 601.3c), nothing to ask when it needn't be.
    if (d.kicks === undefined && compiled.flashIfKicked && canActAtSorcerySpeed(s, HUMAN)) return continueCast({ ...d, kicks: [] });
    if (d.kicks === undefined && compiled.kicker && !compiled.kicker.required)
      return setKickPick({ draft: d, label: card.name, costs: compiled.kicker.costs, multi: !!compiled.kicker.multi, name: kickerName(compiled.kicker), chosen: [], ...(compiled.kicker.text ? { text: compiled.kicker.text } : {}) });
    // Inscriptions: one mode, or any number of them when kicked (CR 601.2b).
    const kickedModal = compiled.spell?.modal?.both === "kicked" ? compiled.spell : undefined;
    if (d.modes === undefined && kickedModal) {
      const body = { targets: [], effects: [], text: card.oracleText, modal: kickedModal.modal! };
      return setModePick({ mode: "cast", objectId: d.objectId, label: card.name, body: d.kicks?.length ? { ...body, modal: { ...body.modal, max: body.modal.modes.length } } : body, draft: d });
    }
    // Splice onto Arcane: reveal any number of cards in your hand to splice onto it, each adding its rules text and
    // its splice cost (CR 702.47a-b, 601.2b).
    const splices = d.splice === undefined ? spliceCandidates(s, HUMAN, d.objectId) : [];
    if (splices.length) return setCostPick({ draft: d, kind: "splice", label: card.name, what: "splice onto it any number of cards from your hand", n: splices.length, min: 0, candidates: splices, chosen: [] });
    if (d.buyback === undefined && compiled.buyback !== undefined) return setBuybackPick({ draft: d, label: card.name, cost: compiled.buyback, ...(compiled.buybackText ? { text: compiled.buybackText } : {}) });
    if (d.costOr === undefined && compiled.costOr) return setCostOrPick({ draft: d, label: card.name, options: compiled.costOr.map((c) => c.text) });
    if (d.number === undefined && compiled.castNumber) return setNumberPick({ draft: d, label: card.name, ...compiled.castNumber });
    // Gift: you may promise an opponent a gift as you cast it (CR 702.174a), announced with the other costs (601.2b).
    if (d.gift === undefined && compiled.gift && opps.length) return setGiftPick({ draft: d, label: card.name, what: compiled.gift.what, options: opps });
    // Cast without paying its mana cost, X is 0 (CR 107.3b); not so for "pay X life" and the like, an X in an
    // additional cost (Toxic Deluge's rulings).
    // The Marches: "you may exile any number of blue cards from your hand", each one {2} off (CR 601.2b, 601.2f). Asked
    // before X, so the X offered counts the reduction.
    const anyExile = compiled.additionalCosts?.find((c) => c.kind === "exileFromHand" && c.anyNumber);
    if (d.exileFromHand === undefined && anyExile?.kind === "exileFromHand") {
      const candidates = s.players[HUMAN]!.hand.filter((id) => id !== d.objectId && (!anyExile.filter || printedMatches(anyExile.filter, cardOf(s, id))));
      if (candidates.length)
        return setCostPick({ draft: d, kind: "exileFromHand", label: card.name, what: `you may exile any number of ${anyExile.filter?.text ?? "card"}s from your hand, each making it {${compiled.exiledReduction ?? 0}} cheaper`, n: candidates.length, min: 0, candidates, chosen: [] });
    }
    // The Defilers: "you may pay 2 life" for each one that applies, each taking a colored mana off (CR 601.2b, 601.2f).
    const lifeOffers = d.lifeFor === undefined ? lifeCostOffers(s, HUMAN, d.objectId, d.x ?? 0) : [];
    if (lifeOffers.length)
      return setCostPick({ draft: d, kind: "lifeFor", label: card.name, what: `you may pay ${lifeOffers[0]!.life} life for each to make it cost one colored mana less`, n: lifeOffers.length, min: 0, candidates: lifeOffers.map((l) => l.id), chosen: [] });
    const costX = costsHaveX(card, d);
    // An alternative cost with X in it: overloaded Street Spasm's {X}{X}{R}{R} (CR 107.3a).
    const altMana = d.alt ? altCost(card, d.alt, s, HUMAN)?.mana : undefined;
    const altX = !!altMana && parseManaCost(altMana).hasX;
    // A madness cost with an {X} the mana cost doesn't have: "Madness {X}{B}{B}" (From Under the Floorboards).
    const madnessX = free && parseManaCost(madnessCastOf(s, HUMAN, d.objectId) ?? "").hasX;
    if (d.x === undefined && ((parseManaCost(card.manaCost).hasX && (!free || madnessX) && !d.via && !d.alt) || altX || costX || madnessX)) {
      // Rottenmouth Viper: with as many sacrificed as X (the ones picked later may differ).
      const plan = (n: number) => planCast(s, HUMAN, d.objectId, undefined, d.modes, d.convoke ?? "auto", n, compiled.sacrificedReduction ? { ...kicks, ...reducingChoices(s, d.objectId, n) } : kicks);
      // "You may sacrifice one or more creatures" (Plumb the Forbidden): X is how many, none unless you pick more.
      const optional = compiled.additionalCosts?.find((c) => c.kind === "sacrifice" && c.optional);
      // Explosive Singularity, Burn at the Stake, Hierophant Bio-Titan: "tap any number of untapped creatures you control",
      // "remove any number of +1/+1 counters from among creatures you control", X the number.
      const anyNumber = compiled.additionalCosts?.find((c) => (c.kind === "tap" || c.kind === "removeCounters") && c.x && !(c.kind === "removeCounters" && c.self));
      const anyText = anyNumber?.kind === "tap" ? `tap X ${anyNumber.filter.text.replace(/(\w)( you control)$/, "$1s$2")}` : anyNumber?.kind === "removeCounters" ? `remove X ${anyNumber.counter ?? ""} counters from among ${anyNumber.filter.text}`.replace(/  +/g, " ") : undefined;
      // Rottenmouth Viper: each one sacrificed makes it cheaper, so the X that can be paid runs from the fewest
      // sacrifices the mana allows to as many as there are; the fewest is offered (none payable: the engine says why).
      const range = compiled.sacrificedReduction ? xRange(plan) : undefined;
      // Nahiri's Sacrifice: "sacrifice an artifact or creature with mana value X": only some X work, so the greatest that does.
      const mvSac = compiled.additionalCosts?.some((c) => c.kind === "sacrifice" && c.mvX);
      const max = range ? range.max : mvSac ? (Array.from({ length: 21 }, (_, n) => 20 - n).find((n) => !!plan(n)) ?? 0) : maxX(plan);
      const extra = optional?.kind === "sacrifice" ? (compiled.sacrificedReduction ? `sacrifice X ${optional.filter.text.replace(/s?$/, "s")}, each making it {${compiled.sacrificedReduction}} cheaper` : `sacrifice X ${optional.filter.text.replace(/s?$/, "s")} (X can be 0)`) : anyText ? (compiled.sacrificedReduction ? `${anyText}, each making it {${compiled.sacrificedReduction}} cheaper` : `${anyText} (X can be 0)`) : costX ? (/\b(?:(?:pay|discard|sacrifice|return|exile) X [^.(]*|sacrifice an? [^.(]*?with mana value X)/i.exec(card.oracleText)?.[0]?.trim().replace(/^./, (c) => c.toLowerCase()) ?? "its cost") : undefined;
      return setXPick({ mode: "cast", draft: d, label: card.name, cost: (free && madnessCastOf(s, HUMAN, d.objectId)) || (altX ? altMana! : card.manaCost), max, value: range ? range.min : optional ? 0 : Math.max(max, compiled.xMin ?? 0), ...(range?.min ? { min: range.min } : !costX && compiled.xMin ? { min: compiled.xMin } : {}), ...(extra ? { extra } : {}) });
    }
    // "Kicker {X}": X is announced once it's kicked (CR 601.2b), "X can't be 0" (Thieving Skydiver).
    // Waterbender's Restoration: a required "waterbend {X}", always paid, so X is always announced.
    const requiredX = compiled.kicker?.required && parseManaCost(compiled.kicker.costs[0]!).hasX ? compiled.kicker.costs[0]! : undefined;
    const kickX = requiredX ?? d.kicks?.map((i) => compiled.kicker?.costs[i] ?? "").find((c) => parseManaCost(c).hasX);
    if (d.x === undefined && kickX) {
      const min = compiled.kicker?.xMin ?? 0;
      const max = maxX((n) => planCast(s, HUMAN, d.objectId, undefined, d.modes, d.convoke ?? "auto", Math.max(n, min), kicks));
      return setXPick({ mode: "cast", draft: d, label: requiredX ? `${card.name} (waterbend {X})` : `${card.name} (kicked)`, cost: kickX, max: Math.max(max, min), value: Math.max(max, min), ...(min ? { min } : {}) });
    }
    // The optional costs announced so far decide which targets it has (CR 702.33g, 702.166d, 702.174m); bargain is
    // asked before them when a target depends on it.
    const gated = spellTargets(s, d.objectId, d.modes, d.alt, { bargained: true });
    if (d.bargain === undefined && compiled.bargain && gated.some((t) => t.onlyIf?.cond.kind === "bargained")) {
      const candidates = bargainCandidates(s, HUMAN, d.objectId).filter((id) => !d.casualty?.includes(id));
      if (candidates.length) return setCostPick({ draft: d, kind: "bargain", label: card.name, what: "bargain: you may sacrifice an artifact, enchantment, or token", n: 1, candidates, chosen: [] });
    }
    // "Any number of target ...": an "up to" target for each there could be, "up to X" no more than X (CR 601.2c).
    // The spliced cards' targets come after the spell's own (CR 702.47b).
    const own = spellTargets(s, d.objectId, d.modes, d.alt, castHow({ ...(d.alt ? { alt: d.alt } : {}), ...(d.kicks ? { kicks: d.kicks } : {}), ...(d.bargain?.length ? { bargain: d.bargain[0]! } : {}), ...(d.teamwork ? { teamwork: d.teamwork } : {}), ...(d.gift !== undefined && d.gift !== null ? { gift: d.gift } : {}) }));
    // "Target ... of an opponent's choice" (Evangelize): that opponent chooses it, after you choose yours.
    const specs = forController(offerTargets(s, d.splice?.length ? withSplices({ targets: own, effects: [], text: "" }, splicedBodies(s, d.splice)).targets : own, HUMAN, d.x ?? 0, sourceQuality(s, d.objectId), d.objectId));
    // Every target skipped: it's cast as if it had none.
    if (d.targets === undefined && specs.length && specs.every((t) => t.skip)) return continueCast({ ...d, targets: specs.map(() => ({ kind: "none" })) });
    if (d.targets === undefined && specs.length) return setTargeting({ mode: "cast", draft: d, specs, chosen: skipped(specs, []), label: d.x !== undefined ? `${card.name} (X=${d.x})` : card.name });
    for (const c of castExtraCosts(card, d, d.x ?? 0, s, HUMAN)) {
      if (c.kind === "payLife" || c.kind === "payEnergy" || c.kind === "revealHand" || c.kind === "sacrificeAll" || c.kind === "discardHand" || c.kind === "mill" || (c.kind === "discard" && c.random)) continue;
      // Conspiracy Unraveler: collect evidence 10 rather than pay the mana cost (CR 701.59a, 118.9).
      if (c.kind === "collectEvidence") {
        if (d.collect !== undefined) continue;
        return setEvidencePick({ draft: d, key: "collect", label: card.name, n: c.n, candidates: evidenceCandidates(s, HUMAN, d.objectId, d.exileCards ?? []), optional: false });
      }
      // "Have an opponent gain 3 life": pick which (a player who can't gain life can't be picked, CR 119.7).
      if (c.kind === "giveLife") {
        if (c.each || d.lifeTo !== undefined) continue;
        return setGiftPick({ draft: d, label: card.name, what: `have an opponent gain ${c.n} life`, options: opps.filter((p) => canGainLife(s, p)), life: c.n });
      }
      if (c.kind === "forage") {
        // Forage (CR 701.61a), Feed the Cycle's way to pay: three cards from your graveyard or a Food.
        if (d.sacrifice !== undefined || d.exileCards !== undefined) continue;
        const ways = forageWays(s, HUMAN, s.objects[d.objectId]);
        if (ways.foods.length && ways.cards.length >= 3) return setForagePick({ draft: d, label: card.name });
        if (ways.foods.length) return setCostPick({ draft: d, kind: "sacrifice", label: card.name, what: "sacrifice a Food to forage", n: 1, candidates: ways.foods, chosen: [] });
        return setCostPick({ draft: d, kind: "exileCards", label: card.name, what: "exile three cards from your graveyard to forage", n: 3, candidates: ways.cards, chosen: [] });
      }
      if (!c.n) continue; // "sacrifice X creatures" with X = 0
      if (c.kind === "exileFromGraveyard" && c.top) continue; // "the top three black cards of your graveyard": no choice
      if (c.kind === "craft") continue; // an ability's cost only (CR 702.167a)
      // Blight N (CR 701.68a): the one creature you control to put the counters on.
      if (c.kind === "putCounter") {
        if (d.counterOn !== undefined) continue;
        return setCostPick({ draft: d, kind: "counterOn", label: card.name, what: counterOnWhat(c), n: 1, candidates: counterOnCandidates(s, HUMAN, c), chosen: [] });
      }
      // "Removing six counters from among creatures you control" (Quilled Greatwurm): pick them (CR 601.2h).
      if (c.kind === "removeCounters") {
        if (d.counters !== undefined) continue;
        return setCounterPick({ draft: d, label: card.name, what: `remove ${c.n} ${counterCostKinds(c)}counter${c.n === 1 ? "" : "s"} ${c.self ? "from it" : `from among ${c.filter.text}`}`, n: c.n, candidates: counterCostCandidates(s, HUMAN, s.objects[d.objectId]!, c) });
      }
      const key = c.kind === "exileFromGraveyard" ? "exileCards" : c.kind;
      if (d[key] !== undefined) continue;
      // Processor Assault: a card an opponent owns in exile, into its owner's graveyard (a face-down one shows its back).
      if (c.kind === "exileFromGraveyard" && c.process)
        return setCostPick({ draft: d, kind: "exileCards", label: card.name, what: "put a card an opponent owns from exile into that player's graveyard", n: 1, candidates: processCandidates(s, HUMAN), chosen: [] });
      if (c.kind === "returnToHand")
        return setCostPick({ draft: d, kind: "returnToHand", label: card.name, what: `return ${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : c.n} ${c.filter.text} to hand`, n: c.n, candidates: returnCandidates(s, HUMAN, c), chosen: [] });
      // "Tap an untapped creature you control" (Lashknife's alternative cost): clicked on the battlefield.
      if (c.kind === "tap")
        return setCostPick({ draft: d, kind: "tap", label: card.name, what: `tap ${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : c.n} ${c.n === 1 ? c.filter.text : c.filter.text.replace(/([^s])( you control)$/, "$1s$2")}`, n: c.n, candidates: tapCostCandidates(s, HUMAN, s.objects[d.objectId]!, c).filter((id) => !d.convoke?.includes(id)), chosen: [] });
      // Behold (CR 701.4a): a card from your hand or a permanent you control, picked from both together.
      if (c.kind === "reveal" && c.orControl) {
        const kind = beholdWhat(c);
        return setCostPick({ draft: d, kind: "reveal", label: card.name, what: `behold ${kind}${c.exile ? " and exile it" : ""} (${kind.replace(/^an? /, "")} you control or ${kind.replace(/^an? /, "")} card from your hand)`, n: c.n, candidates: beholdCandidates(s, HUMAN, s.objects[d.objectId]!, c), chosen: [] });
      }
      const me = s.players[HUMAN]!;
      const candidates =
        c.kind === "sacrifice"
          ? s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === HUMAN && !d.bargain?.includes(id) && objectMatches(s, c.filter, s.objects[id]!, HUMAN, false))
          : c.kind === "discard" || c.kind === "reveal" || c.kind === "exileFromHand"
            ? me.hand.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id))))
            : me.graveyard.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id))));
      // The Shoals: X is announced as the card is picked, its mana value (CR 107.3a), so any card of that color.
      const shoal = c.kind === "exileFromHand" && c.mvX && d.x === undefined ? altCost(card, d.alt)?.costs?.find((x) => x.kind === "exileFromHand" && x.mvX) : undefined;
      if (shoal?.kind === "exileFromHand") {
        const filter = { ...shoal.filter!, text: shoal.filter!.text.replace(/ with mana value X$/, "") };
        return setCostPick({ draft: d, kind: "exileFromHand", label: card.name, what: `exile from your hand ${/^[aeiou]/i.test(filter.text) ? "an" : "a"} ${filter.text}: X is its mana value`, n: 1, candidates: me.hand.filter((id) => id !== d.objectId && printedMatches(filter, cardOf(s, id))), chosen: [], setsX: true });
      }
      // Foil: "an Island card and another card".
      if (c.kind === "discard" && c.oneOf)
        return setCostPick({ draft: d, kind: "discard", label: card.name, what: `discard ${/^[aeiou]/i.test(c.oneOf.text) ? "an" : "a"} ${c.oneOf.text} and another card`, n: c.n, candidates: me.hand.filter((id) => id !== d.objectId), chosen: [], oneOf: c.oneOf });
      const what = c.kind === "sacrifice" ? c.filter.text : c.kind === "discard" || c.kind === "reveal" || c.kind === "exileFromHand" ? (c.filter?.text ?? "card") : (c.filter?.text ?? (d.via === "escape" ? "other card" : "card"));
      const verb = c.kind === "sacrifice" ? (c.exile ? "exile" : "sacrifice") : c.kind === "discard" ? "discard" : c.kind === "reveal" ? "reveal" : c.kind === "exileFromHand" ? (c.toLibrary ? "put on top of your library" : "exile from your hand") : "exile from your graveyard";
      // Ormos, Archive Keeper: "Discard three cards with different names".
      const named = c.kind === "discard" && c.differentNames ? " with different names" : "";
      return setCostPick({ draft: d, kind: key, label: card.name, what: `${verb} ${c.n === 1 ? (/^[aeiou]/i.test(what) ? "an" : "a") : c.n} ${c.n > 1 ? plural(what) : what}${named}`, n: c.n, candidates, chosen: [], ...(c.kind === "sacrifice" && c.exile ? { exile: true as const } : {}), ...(c.kind === "discard" && c.differentNames ? { differentNames: true as const } : {}) });
    }
    // Casualty N: you may sacrifice a creature with power N or greater as you cast it (CR 702.153a); its own and the ones
    // permanents give it (Silverquill, the Disputant), asked again for each further instance (each paid separately, 702.153b).
    const casualties = casualtyInstances(s, HUMAN, card, s.objects[d.objectId]);
    const casualtyPaid = d.casualty?.length ?? 0;
    if (casualties.length && !d.casualtyDone && casualtyPaid < casualties.length && (d.casualty === undefined || casualtyPaid > 0)) {
      // Only creatures that still leave each chosen one an instance it can pay: the strongest for the greatest N's.
      const fits = (ids: string[]) => {
        const want = [...casualties].sort((a, b) => a - b).slice(0, ids.length).sort((a, b) => b - a);
        const have = ids.map((id) => power(s, s.objects[id]!)).sort((a, b) => b - a);
        return have.every((p, i) => p >= want[i]!);
      };
      const before = d.casualty ?? [];
      const candidates = casualtyCandidates(s, HUMAN, card, s.objects[d.objectId]).filter((id) => !d.sacrifice?.includes(id) && !before.includes(id) && fits([...before, id]));
      const ns = [...casualties].sort((a, b) => b - a).join(" and ");
      if (candidates.length)
        return setCostPick({
          draft: d,
          kind: "casualty",
          label: card.name,
          what: casualties.length === 1 ? `casualty ${casualties[0]}: you may sacrifice a creature with power ${casualties[0]} or greater to copy it` : `casualty ${ns} (instance ${casualtyPaid + 1} of ${casualties.length}): you may sacrifice ${casualtyPaid ? "another" : "a"} creature with enough power for another copy`,
          n: 1,
          candidates,
          chosen: [],
        });
    }
    // Bargain: you may sacrifice an artifact, enchantment, or token as you cast it (CR 702.166a).
    if (d.bargain === undefined && compiled.bargain) {
      const candidates = bargainCandidates(s, HUMAN, d.objectId).filter((id) => !d.sacrifice?.includes(id) && !d.casualty?.includes(id));
      if (candidates.length) return setCostPick({ draft: d, kind: "bargain", label: card.name, what: "bargain: you may sacrifice an artifact, enchantment, or token", n: 1, candidates, chosen: [] });
    }
    // "As an additional cost to cast this spell, you may collect evidence N" (CR 701.59a): only offered with enough in
    // the graveyard (701.59b).
    if (d.evidence === undefined && compiled.evidence !== undefined) {
      const candidates = evidenceCandidates(s, HUMAN, d.objectId, [...(d.exileCards ?? []), ...(d.collect ?? [])]);
      if (evidenceValue(s, candidates) >= compiled.evidence) return setEvidencePick({ draft: d, key: "evidence", label: card.name, n: compiled.evidence, candidates, optional: true });
    }
    // Conspire: you may tap two untapped creatures you control that share a color with it (CR 702.78a), asked again for
    // each further instance it has (two Raiding Schemes; each paid separately, 702.78b).
    const conspires = conspireInstances(s, HUMAN, s.objects[d.objectId]!);
    const conspirePaid = (d.conspire?.length ?? 0) / 2;
    if (conspires > 0 && !d.conspireDone && (d.conspire === undefined || (conspirePaid > 0 && conspirePaid < conspires))) {
      const candidates = conspireCandidates(s, HUMAN, d.objectId).filter((id) => !d.convoke?.includes(id) && !d.teamwork?.includes(id) && !d.conspire?.includes(id));
      if (candidates.length >= 2)
        return setCostPick({ draft: d, kind: "conspire", label: card.name, what: conspirePaid ? `conspire again (instance ${conspirePaid + 1} of ${conspires}): you may tap two more untapped creatures you control that share a color with it for another copy` : `conspire${conspires > 1 ? ` (${conspires} instances)` : ""}: you may tap two untapped creatures you control that share a color with it to copy it`, n: 2, candidates, chosen: [] });
    }
    const choices = {
      ...kicks,
      ...(d.casualty?.length ? { casualty: d.casualty[0]!, ...(d.casualty.length > 1 ? { casualtyMore: d.casualty.slice(1) } : {}) } : {}),
      ...(d.bargain?.length ? { bargain: d.bargain[0]! } : {}),
      ...(d.offering?.length ? { offering: d.offering[0]! } : {}),
      ...(d.evidence?.length ? { evidence: d.evidence } : {}),
      ...(d.collect ? { collect: d.collect } : {}),
      ...(d.conspire?.length ? { conspire: d.conspire } : {}),
      ...(d.gift !== undefined && d.gift !== null ? { gift: d.gift } : {}),
      ...(d.lifeTo !== undefined ? { lifeTo: d.lifeTo } : {}),
      ...(d.number !== undefined ? { number: d.number } : {}),
      ...(d.sacrifice?.length ? { sacrifice: d.sacrifice } : {}),
      ...(d.discard?.length ? { discard: d.discard } : {}),
      ...(d.exileCards?.length ? { exileCards: d.exileCards } : {}),
      ...(d.returnToHand?.length ? { returnToHand: d.returnToHand } : {}),
      ...(d.reveal?.length ? { reveal: d.reveal } : {}),
      ...(d.exileFromHand?.length ? { exileFromHand: d.exileFromHand } : {}),
      ...(d.lifeFor?.length ? { lifeFor: d.lifeFor } : {}),
      ...(d.tap?.length ? { tap: d.tap } : {}),
      ...(d.counters?.length ? { counters: d.counters } : {}),
      ...(d.counterOn?.length ? { counterOn: d.counterOn } : {}),
      ...(d.delve?.length ? { delve: d.delve } : {}),
    };
    // Delve: pick cards to exile from your graveyard, suggesting just enough to pay (CR 702.66a).
    if (d.delve === undefined && !free) {
      const max = delveRoom(s, HUMAN, d.objectId, choices, d.x ?? 0);
      if (max > 0) {
        const candidates = s.players[HUMAN]!.graveyard.filter((id) => id !== d.objectId && !d.exileCards?.includes(id) && !d.evidence?.includes(id) && !d.collect?.includes(id));
        let need = 0;
        while (need < max && !planCast(s, HUMAN, d.objectId, d.targets, d.modes, d.convoke ?? "auto", d.x, { ...choices, ...(need ? { delve: candidates.slice(0, need) } : {}) })) need++;
        return setDelvePick({ draft: d, label: card.name, max, candidates, chosen: candidates.slice(0, need) });
      }
    }
    // Assist: the other player chooses first, then you pay the rest (CR 702.132a).
    if (d.assist !== undefined)
      return dispatch([{ type: "castSpell", player: HUMAN, objectId: d.objectId, targets: d.targets, modes: d.modes, ...(d.convoke?.length ? { convoke: d.convoke } : {}), ...(d.x ? { x: d.x } : {}), ...choices, assist: d.assist }]);
    dispatch(
      planCast(s, HUMAN, d.objectId, d.targets, d.modes, d.convoke ?? "auto", d.x, choices) ?? [
        { type: "castSpell", player: HUMAN, objectId: d.objectId, targets: d.targets, modes: d.modes, ...(d.convoke?.length ? { convoke: d.convoke } : {}), ...(d.x ? { x: d.x } : {}), ...choices },
      ],
    );
  }

  function finishXPick() {
    const pick = xPick;
    setXPick(null);
    if (!pick) return;
    if (pick.mode === "cast") continueCast({ ...pick.draft, x: pick.value });
    else if (pick.mode === "suspend") dispatch(planSuspend(s!, HUMAN, pick.objectId, pick.value) ?? [{ type: "suspend", player: HUMAN, objectId: pick.objectId, x: pick.value }]);
    else if (pick.mode === "faceUp") dispatch(planTurnFaceUp(s!, HUMAN, pick.objectId, pick.way, pick.value) ?? [{ type: "turnFaceUp", player: HUMAN, objectId: pick.objectId, ...(pick.way ? { way: pick.way } : {}), ...(pick.value ? { x: pick.value } : {}) }]);
    else useAbility(pick.objectId, pick.index, pick.modes, pick.value);
  }

  /**
   * Start casting a card from your hand or command zone. A convoke spell first asks which
   * creatures to tap (suggesting some only when your mana can't pay), then modes, then targets.
   */
  function startCast(id: string, convoke?: string[], via?: CastFromGraveyardKind, alt?: AltCostKind, teamwork?: string[], face?: number): void {
    if (!s) return;
    // Cast as one of its faces: that face is looked at from the start (CR 709.3a, 712.11c, 715.3a).
    if (face !== undefined && s.objects[id] && s.objects[id]!.face !== face) return asFace(s, s.objects[id]!, face, () => startCast(id, convoke, via, alt, teamwork, face));
    const f = face !== undefined ? { face } : {};
    const d = cardOf(s, id);
    if (via) return continueCast({ objectId: id, via, ...(alt ? { alt } : {}), ...f }); // from a graveyard: the usual steps, without convoke
    if (alt) return continueCast({ objectId: id, alt, ...f }); // evoke or dash
    if (convoke === undefined && hasConvoke(s, HUMAN, s.objects[id]!) && convokers(s).length && freeCastOf(s, HUMAN) !== id) {
      const fromMana = planCast(s, HUMAN, id, undefined, undefined, undefined, undefined, f) !== null;
      const total = spellCost(s, HUMAN, s.objects[id]!, 0, [], f);
      const auto = fromMana ? null : autoConvoke(s, HUMAN, total.cost, total.extra);
      return setTapPick({ kind: "convoke", objectId: id, chosen: auto?.creatures ?? [], ...f });
    }
    // Teamwork N: you may tap creatures with total power N or more as you cast it, when you have enough.
    const tw = compileCard(d).teamwork;
    if (teamwork === undefined && tw !== undefined) {
      const candidates = teamworkCandidates(s, HUMAN).filter((c) => !convoke?.includes(c));
      if (candidates.reduce((n, c) => n + teamworkPower(s, c), 0) >= tw) return setTapPick({ kind: "teamwork", objectId: id, n: tw, chosen: [], ...(convoke ? { convoke } : {}), ...f });
    }
    const modal = spellModes(s, id);
    const specs = spellTargets(s, id);
    if (modal || specs.length || parseManaCost(d.manaCost).hasX || compileCard(d).kicker || compileCard(d).additionalCosts) {
      if (!canCastWithTaps(s, id, convoke, teamwork)) return dispatch([{ type: "castSpell", player: HUMAN, objectId: id, ...(convoke?.length ? { convoke } : {}), ...(teamwork?.length ? { teamwork } : {}), ...f }]); // shows why not
      // "An opponent chooses one —" (Misfortune): cast without a mode; the opponent you choose chooses it, then you its targets.
      if (modal?.chooser) return continueCast({ objectId: id, convoke, teamwork, ...f });
      if (modal) {
        const body = { targets: [], effects: [], text: d.oracleText, modal };
        const both = bothModes(s, HUMAN, body, { ...(teamwork?.length ? { teamwork } : {}) });
        // "If this spell was cast using teamwork, choose both instead": no choice left to make.
        if (both && modal.both === "teamwork") return continueCast({ objectId: id, convoke, teamwork, modes: [0, 1], ...f });
        // "If this spell was kicked, choose any number instead": kicker is announced first, then the modes.
        if (modal.both === "kicked") return continueCast({ objectId: id, convoke, teamwork, ...f });
        // "If you control a commander as you cast this spell, you may choose both instead"; "choose one or more instead"
        // (Let's Play a Game).
        return setModePick({ mode: "cast", objectId: id, label: d.name, body: both ? { ...body, modal: { ...modal, max: modal.bothAny ? modal.modes.length : 2 } } : body, convoke, teamwork, ...f });
      }
    }
    return continueCast({ objectId: id, convoke, teamwork, ...f });
  }

  function finishTapPick() {
    if (!s || !tapPick) return;
    setTapPick(null);
    if (tapPick.kind === "convoke") return startCast(tapPick.objectId, tapPick.chosen, undefined, undefined, undefined, tapPick.face);
    if (tapPick.kind === "teamwork") return startCast(tapPick.objectId, tapPick.convoke, undefined, undefined, tapPick.chosen, tapPick.face);
    if (tapPick.kind === "harmonize") return continueCast({ ...tapPick.draft, harmonize: tapPick.chosen[0] ?? null });
    const { objectId, index, chosen } = tapPick;
    dispatch(planActivate(s, HUMAN, objectId, index, undefined, undefined, chosen) ?? [{ type: "activateAbility", player: HUMAN, objectId, index, tapCreatures: chosen }]);
  }

  function pickModes(modes: number[]) {
    const pick = modePick;
    setModePick(null);
    if (pending?.kind === "chooseModes") return dispatch([{ type: "chooseModes", player: HUMAN, modes }]);
    if (!pick) return;
    // "Choose X" (Doomsday Confluence): X is announced with the modes, as many as were chosen (CR 601.2b).
    const xs = pick.body.modal?.xCount ? { x: modes.length } : {};
    if (pick.mode === "cast" && pick.draft) continueCast({ ...pick.draft, modes, ...xs });
    else if (pick.mode === "cast") continueCast({ objectId: pick.objectId, modes, convoke: pick.convoke, teamwork: pick.teamwork, ...(pick.face !== undefined ? { face: pick.face } : {}), ...xs });
    else useAbility(pick.objectId, pick.index, modes);
  }

  function clickCard(o: GameObject, e?: React.MouseEvent) {
    if (!s) return;
    const d = cardOf(s, o.id);
    if (targeting) {
      // The click is for this permanent only: it mustn't also reach the seat around it, which would choose its
      // controller as the target ("any target" would hit the player instead).
      e?.stopPropagation();
      if (o.zone === "battlefield") pickTarget({ kind: "object", id: o.id });
      return;
    }
    if (modePick || pending?.kind === "chooseModes") return;
    // Paying an additional cost: click what to sacrifice or discard.
    if (costPick) {
      if (!costPick.candidates.includes(o.id)) return;
      const chosen = costPick.chosen.includes(o.id) ? costPick.chosen.filter((x) => x !== o.id) : [...costPick.chosen, o.id].slice(-costPick.n);
      return setCostPick({ ...costPick, chosen });
    }
    // Crewing or convoking: click your untapped creatures to tap them for it.
    if (tapPick) {
      if (!tapCandidates(s, tapPick).some((c) => c.id === o.id)) return;
      const chosen = tapPick.chosen.includes(o.id) ? tapPick.chosen.filter((x) => x !== o.id) : tapPick.kind === "station" || tapPick.kind === "harmonize" ? [o.id] : [...tapPick.chosen, o.id];
      return setTapPick({ ...tapPick, chosen });
    }
    // Attacking: click a creature, then the player it attacks (an arrow follows the mouse).
    // Clicking an attacking creature again takes it out of the attack.
    if (pending?.kind === "declareAttackers") {
      // An opponent's planeswalker can be attacked instead of the player (CR 506.2, 508.1b).
      if (aim && attackablePlaneswalker(o.id)) {
        // Not also the seat around it, whose click would make this an attack on the player.
        e?.stopPropagation();
        setAttacks({ ...attacks, [aim]: { defender: defenderOf(o.id), planeswalker: o.id } });
        setAim(null);
        return;
      }
      if (controllerOf(s, o) !== HUMAN || !potentialAttackers(s, HUMAN).some((a) => a.id === o.id)) return;
      if (o.id in attacks) {
        const next = { ...attacks };
        delete next[o.id];
        setAttacks(next);
        setAim(null);
      } else if (opps.length === 1 && !opponentWalkers.length) setAttacks({ ...attacks, [o.id]: { defender: opps[0]! } }); // potentialAttackers checked it can attack them
      else setAim(aim === o.id ? null : o.id);
      return;
    }
    // Blocking: click one of your untapped creatures, then the attacker it blocks. One that can block more
    // than one creature (CR 509.1a) stays picked until it's full; clicking one of its attackers again unblocks it.
    // Odric, Master Tactician: you may be choosing another player's blocks (pending.defender).
    if (pending?.kind === "declareBlockers") {
      const defender = pending.defender ?? HUMAN;
      if (controllerOf(s, o) === defender && o.zone === "battlefield" && isCreature(s, o.id) && !o.tapped) {
        const mine = blocks[o.id] ?? [];
        if (blocker === o.id) setBlocker(null);
        else if (mine.length && mine.length >= maxBlocks(s, o)) {
          const next = { ...blocks };
          delete next[o.id];
          setBlocks(next);
          setBlocker(null);
        } else setBlocker(o.id);
      } else if (blocker && o.attacking === defender) {
        const mine = blocks[blocker] ?? [];
        const now = mine.includes(o.id) ? mine.filter((a) => a !== o.id) : [...mine, o.id];
        const next = { ...blocks, [blocker]: now };
        if (!now.length) delete next[blocker];
        setBlocks(next);
        if (now.length >= maxBlocks(s, s.objects[blocker]!)) setBlocker(null);
      }
      return;
    }
    // "Sacrifice a creature", "return a land you control": click your permanents to pick them.
    if (pending?.kind === "pickPermanents") {
      if (pending.player === HUMAN && pending.options.includes(o.id))
        setDiscards((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id].slice(-pending.count)));
      return;
    }
    if (pending?.kind === "chooseMay" || pending?.kind === "payUnless" || pending?.kind === "mulligan") return;
    if (pending?.kind === "discardToHandSize" || pending?.kind === "discard" || pending?.kind === "bottomCards" || pending?.kind === "handToTop") {
      if (o.zone === "hand" && o.owner === HUMAN && (pending.kind !== "handToTop" || !pending.discarding || pending.discarding.includes(o.id)))
        setDiscards((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id].slice(-pending.count)));
      return;
    }
    // A permanent with an effect you may pay to end (a Licid that's an Aura), whoever controls it now (CR 116.2c).
    if (o.zone === "battlefield" && endableEffect(s, HUMAN, o.id)) return setMenu(o.id);
    // A permanent whose effect you may pay to ignore this turn (Leonin Arbiter, Volrath's Curse; CR 116.2d).
    if (o.zone === "battlefield" && ignorableBy(s, HUMAN, o.id)) return setMenu(o.id);
    // Another player's permanent with an ability any player may activate (Feral Hydra, Quicksilver Wall).
    if (o.zone === "battlefield" && controllerOf(s, o) !== HUMAN && abilitiesOf(s, o).activated.some((ab) => ab.anyPlayer && (!ab.ownerOnly || o.owner === HUMAN) && (!ab.opponentsOnly || opponents(s, controllerOf(s, o)).includes(HUMAN)))) return setMenu(o.id);
    if (controllerOf(s, o) !== HUMAN && o.owner !== HUMAN) return;
    // A card with cycling, evoke or dash: choose between casting (or playing) it and the other way.
    if (o.zone === "hand" && (handAbilities(s, o.id).length || altCostsFor(s, HUMAN, o).length || compileCard(cardOf(s, o.id)).faceDownCast || compileCard(cardOf(s, o.id)).suspend || compileCard(cardOf(s, o.id)).plot || foretellCostOf(s, o) || compileCard(cardOf(s, o.id)).assist || compileCard(cardOf(s, o.id)).discardAnyTime)) return setMenu(o.id);
    // A card with several faces to cast or play it as (a split card's halves, an Adventure, a modal double-faced card's
    // back): choose which.
    if ((o.zone === "hand" || o.zone === "command" || (o.zone === "library" && mayPlayFromTop(s, o, HUMAN)) || (o.zone === "exile" && mayPlayFromExile(s, o, HUMAN) && o.mayPlay?.until !== "adventure")) && (castableFaces(s, o).length || landFaces(s, o).some((f) => f !== 0))) return setMenu(o.id);
    // A land that may enter untapped by paying life or revealing a card: ask which.
    if (o.zone === "hand" && isLand(s, o.id) && entersRulesOf(s, HUMAN, o.id).entersTappedChoice) return setMenu(o.id);
    if (o.zone === "hand" && isLand(s, o.id)) return dispatch([{ type: "playLand", player: HUMAN, objectId: o.id }]);
    // A commander with an alternative cost (sneak): choose how to cast it.
    if (o.zone === "command" && o.owner === HUMAN && (altCostsFor(s, HUMAN, o).length || handAbilities(s, o.id).length)) return setMenu(o.id);
    if (o.zone === "hand" || o.zone === "command") return startCast(o.id);
    // Courser of Kruphix, Future Sight: play the top card of your library.
    if (o.zone === "library" && mayPlayFromTop(s, o, HUMAN)) {
      // Bolas's Citadel: for life instead of its mana cost, a choice in the menu.
      if (!isLand(s, o.id)) return altCostsFor(s, HUMAN, o).length ? setMenu(o.id) : startCast(o.id);
      if (entersRulesOf(s, HUMAN, o.id).entersTappedChoice) return setMenu(o.id);
      return dispatch([{ type: "playLand", player: HUMAN, objectId: o.id }]);
    }
    if (o.zone === "battlefield" && controllerOf(s, o) === HUMAN) {
      const mana = usableManaOptions(s, o);
      const abs = manaAbilitiesOn(s, o);
      // A menu when there's a choice to make: other abilities, a color, or a cost beyond tapping it.
      // A Room with a locked door to unlock (CR 709.5e) has a menu too.
      if (o.faceDown || abilitiesOf(s, o).activated.length || mana.length > 1 || mana.some((x) => manaPenalty(abs[x.ability]!) > 0 || !!abs[x.ability]!.toChosenPlayer) || [0, 1].some((door) => unlockCost(s, o, door) !== undefined)) return setMenu(o.id);
      const plan = mana[0] && planManaAbility(s, HUMAN, o.id, mana[0].ability, mana[0].mana, undefined, mana[0].extra, mana[0].combo);
      if (plan) dispatch(plan);
    }
  }

  // Creatures that can still be told to attack or block glow, like playable cards.
  const attackers = pending?.kind === "declareAttackers" ? new Set(potentialAttackers(s, HUMAN).map((a) => a.id)) : null;
  const blockingFor = pending?.kind === "declareBlockers" ? (pending.defender ?? HUMAN) : HUMAN;
  const attackingMe = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.attacking === blockingFor);
  const canBlockWith = (o: GameObject) =>
    pending?.kind === "declareBlockers" && controllerOf(s, o) === blockingFor && o.zone === "battlefield" && (blocks[o.id]?.length ?? 0) < maxBlocks(s, o) &&
    attackingMe.some((a) => !blockProblem(s, o, a));
  // Only attackers this blocker could legally block (flying, menace's partner aside) light up.
  const blockable = (id: string) => {
    const a = s.objects[id];
    return !!blocker && a?.attacking === blockingFor && !blockProblem(s, s.objects[blocker]!, a);
  };
  const cardProps: CardProps = {
    s,
    onClick: clickCard,
    onHover: setHover,
    attacks,
    blocks,
    blocker: blocker ?? aim,
    discards: [...discards, ...(tapPick?.chosen ?? []), ...(costPick?.chosen ?? [])],
    targetable: (id) => canTarget({ kind: "object", id }) || blockable(id) || attackablePlaneswalker(id),
    ready: (o) =>
      (!!attackers?.has(o.id) && !(o.id in attacks) && aim !== o.id) ||
      (canBlockWith(o) && blocker !== o.id) ||
      (!!tapPick && !tapPick.chosen.includes(o.id) && tapCandidates(s, tapPick).some((c) => c.id === o.id)) ||
      (!!costPick && !costPick.chosen.includes(o.id) && costPick.candidates.includes(o.id)) ||
      (pending?.kind === "pickPermanents" && pending.player === HUMAN && pending.options.includes(o.id) && !discards.includes(o.id)),
  };
  const waiting = waitingOn(s);
  const corners = seatCorners(s);
  const combat: Combat = { attacks, aim, blocks, blocker, crew: tapPick?.kind === "crew" || tapPick?.kind === "station" ? { vehicle: tapPick.objectId, chosen: tapPick.chosen } : undefined };
  const arrows = targetingArrows(s, targeting, intent, combat);
  // While aiming, the arrow snaps onto whatever the click would choose.
  const snap = targeting
    ? canTarget
    : aim
      ? (c: TargetChoice) => c.kind === "player" && opps.includes(c.id)
      : blocker
        ? (c: TargetChoice) => c.kind === "object" && blockable(c.id)
        : undefined;

  return (
    <div className={`table ${handTucked ? "hand-tucked" : ""}`}>
      {(Object.keys(corners) as Corner[]).map((c) => {
        const pid = corners[c];
        if (pid === undefined) return <div key={c} className={`seat empty ${c}`} />;
        return (
          <Seat
            key={c}
            corner={c}
            s={s}
            pid={pid}
            waiting={waiting === pid}
            targetable={canTarget({ kind: "player", id: pid }) || (!!aim && opps.includes(pid) && !attackProblem(s, s.objects[aim]!, pid))}
            onSelect={() => {
              if (targeting) return pickTarget({ kind: "player", id: pid });
              if (aim && opps.includes(pid) && !attackProblem(s, s.objects[aim]!, pid)) {
                setAttacks({ ...attacks, [aim]: { defender: pid } });
                setAim(null);
              }
            }}
            onViewZone={(zone) => setViewing({ pid, zone })}
            cardProps={cardProps}
          />
        );
      })}

      <Hand s={s} ids={me.hand} cardProps={cardProps} tucked={handTucked} onToggle={toggleHand} />

      <aside className="side">
        <div className="side-main">
          <GameLog s={s} onHover={setHover} />
          {s.stack.length > 0 && (
            <StackOverlay
              s={s}
              hidden={stackHidden}
              onToggle={() => setStackHidden((h) => !h)}
              canTarget={(id) => canTarget({ kind: "stack", id })}
              onPick={(id) => pickTarget({ kind: "stack", id })}
              onHover={setHover}
            />
          )}
        </div>
        <div className="control-pane">
          <div className="turn-info">
            <strong>{s.mulligans ? "Mulligans" : `Turn ${s.turn}`}</strong>
            {s.dayNight && (
              <span className="day-night" title={s.dayNight === "day" ? "Day: it becomes night next turn if this turn's player casts no spells." : "Night: it becomes day next turn if this turn's player casts two or more spells."}>
                {s.dayNight === "day" ? "☀ Day" : "☾ Night"}
              </span>
            )}
            {waiting !== null && waiting !== HUMAN && (
              <span className="thinking">{deciderOf(s, waiting) === waiting ? `${s.players[waiting]!.name} is thinking…` : `${s.players[deciderOf(s, waiting)]!.name} is thinking for ${waiting === YOU ? "you" : s.players[waiting]!.name}…`}</span>
            )}
            {s.controlledTurn && deciderOf(s, s.controlledTurn.controlled) !== s.controlledTurn.controlled && (
              <span className="control-note" title="Controlling another player (CR 723): the controller makes all of that player's choices and decisions this turn, with that player's cards and mana.">
                {s.controlledTurn.controller === YOU
                  ? `You control ${s.players[s.controlledTurn.controlled]!.name} this turn`
                  : `${s.players[s.controlledTurn.controller]!.name} controls ${s.controlledTurn.controlled === YOU ? "you" : s.players[s.controlledTurn.controlled]!.name} this turn`}
              </span>
            )}
          </div>
          <PhaseTrack s={s} stops={stops} onToggle={toggleStop} />
          {targeting && (
            <div className="targeting">
              <span>
                {/* Blatant Thievery: one required target for each opponent, named. */}
                <strong>{targeting.label}</strong>: choose {(nextSpec?.controlledBy !== undefined && !inRun ? nextSpec.text.replace(/\bthat player controls\b/, nextSpec.controlledBy === HUMAN ? "you control" : `${s.players[nextSpec.controlledBy]!.name} controls`).replace(/\bthat player\b/, nextSpec.controlledBy === HUMAN ? "you" : s.players[nextSpec.controlledBy]!.name) : (nextSpec?.text ?? "")).replace(/ of (?:their|defending player's|an opponent's) choice$/, "")}{" "}
                {inRun
                  ? `(optional, one for each ${targeting.specs.slice(targeting.chosen.length, runEnd).some((sp) => sp.controlledBy === HUMAN) ? "player" : "opponent"}: ${targeting.specs
                      .slice(targeting.chosen.length, runEnd)
                      .map((sp, k) => {
                        const c = targeting.ahead?.[targeting.chosen.length + k];
                        return `${s.players[sp.controlledBy!]!.name} ${c?.kind === "object" ? cardOf(s, c.id).name : "—"}`;
                      })
                      .join(", ")})`
                  : nextSpec?.optional
                    ? `(optional, up to ${optionalLeft(targeting.specs, targeting.chosen.length)} more)`
                    : `(${targeting.specs.slice(0, targeting.chosen.length).filter((t) => !t.skip).length + 1}/${targeting.specs.filter((t) => !t.skip).length})`}
              </span>
              {nextSpec?.optional && <button onClick={skipTargets}>{targeting.chosen.some((c) => c.kind !== "none") || targeting.ahead?.some(Boolean) ? "Done" : "Choose none"}</button>}
              {(nextSpec?.orCard ?? nextSpec?.orPermanent?.orCard) && <button onClick={() => setYardTargets(true)}>From a graveyard</button>}
              {nextSpec?.orSuspended && <button onClick={() => setYardTargets(true)}>A suspended card</button>}
              {targeting.mode === "copy" && pending?.kind === "copyTargets" && (
                <button
                  onClick={() => {
                    setTargeting(null);
                    dispatch([{ type: "copyTargets", player: HUMAN }]);
                  }}
                >
                  Keep {pending.current.length === 1 ? "target" : "targets"}
                  {describeTargets(s, pending.current).replace(/^ targeting /, ": ")}
                </button>
              )}
              {targeting.mode === "retarget" && pending?.kind === "newTargets" && (
                <button
                  onClick={() => {
                    setTargeting(null);
                    dispatch([{ type: "newTargets", player: HUMAN }]);
                  }}
                >
                  Keep {pending.current.length === 1 ? "target" : "targets"}
                  {describeTargets(s, pending.current).replace(/^ targeting /, ": ")}
                </button>
              )}
              {/* The spell doing the changing is still on the stack (CR 608.2n), though not shown there: a button for it. */}
              {targeting.mode === "change" &&
                pending?.kind === "changeTarget" &&
                pending.options
                  .filter((o) => o.kind === "stack" && !s.stack.some((x) => x.id === o.id))
                  .map((o) => (
                    <button key={o.kind === "stack" ? o.id : ""} onClick={() => pickTarget(o)}>
                      {pending.source}
                    </button>
                  ))}
              {!answering(targeting) && <button onClick={() => setTargeting(null)}>Cancel</button>}
            </div>
          )}
          {dividing && (
            <div className="targeting">
              <span>
                <strong>{dividing.targeting.label}</strong>: {dividing.targeting.specs.find((x) => x.divided)?.divided?.atMost ? `distribute up to ${dividing.targeting.specs.find((x) => x.divided)!.divided!.total} ${dividing.targeting.specs.find((x) => x.divided)!.divided!.counter} counters` : dividing.targeting.specs.find((x) => x.divided)?.divided?.counter ? `distribute the ${dividing.targeting.specs.find((x) => x.divided)!.divided!.counter} counters` : "divide the damage"}
              </span>
              {dividing.chosen.map((c, i) => {
                if ((c.kind !== "object" && c.kind !== "player") || c.amount === undefined) return null;
                const set = (n: number) => setDividing({ ...dividing, chosen: dividing.chosen.map((x, j) => (j === i ? { ...c, amount: n } : x)) });
                return (
                  <span key={i} className="divide">
                    {c.kind === "player" ? s.players[c.id]!.name : cardOf(s, c.id).name}{" "}
                    <button className="ghost" disabled={c.amount <= 1} onClick={() => set(c.amount! - 1)}>
                      −
                    </button>
                    <strong>{c.amount}</strong>
                    <button className="ghost" onClick={() => set(c.amount! + 1)}>
                      +
                    </button>
                  </span>
                );
              })}
              <button disabled={divisionProblem(dividing.targeting.specs, dividing.chosen) !== null} onClick={() => finishTargets(dividing.chosen, dividing.targeting)}>
                {divisionProblem(dividing.targeting.specs, dividing.chosen) ?? "Done"}
              </button>
              {dividing.targeting.mode !== "trigger" && <button onClick={() => setDividing(null)}>Cancel</button>}
            </div>
          )}
          {targeting && nextSpec?.kind === "card" && (
            <GraveyardPicker
              s={s}
              label={targeting.label}
              // "For each opponent, ... from that player's graveyard": every opponent's cards, each click to its owner's slot.
              spec={inRun ? (({ controlledBy: _c, ...rest }) => rest)(nextSpec) : nextSpec}
              sourceId={targetSource}
              allowed={(id) => canTarget({ kind: "object", id })}
              onSkip={nextSpec.optional ? skipTargets : undefined}
              onHover={setHover}
              onPick={(id) => pickTarget({ kind: "object", id })}
              onCancel={answering(targeting) ? undefined : () => setTargeting(null)}
            />
          )}
          {targeting && yardTargets && (nextSpec?.orCard ?? nextSpec?.orPermanent?.orCard ?? nextSpec?.orSuspended) && (
            // The card half of "creatures from the battlefield and/or creature cards from graveyards"; a creature is
            // clicked on the battlefield as usual.
            <GraveyardPicker
              s={s}
              label={targeting.label}
              // "Target permanent or suspended card" (TargetSpec.orSuspended): the suspended cards in exile.
              spec={nextSpec.orCard ?? nextSpec.orPermanent?.orCard ?? nextSpec}
              sourceId={targetSource}
              allowed={(id) => canTarget({ kind: "object", id }) && (!nextSpec.orSuspended || s.objects[id]?.zone === "exile")}
              onHover={setHover}
              onPick={(id) => {
                setYardTargets(false);
                pickTarget({ kind: "object", id });
              }}
              onCancel={() => setYardTargets(false)}
            />
          )}
          {(modePick || pending?.kind === "chooseModes") && (
            <ModeMenu
              key={modePick ? `${modePick.mode}:${modePick.objectId}` : `trigger:${pending?.kind === "chooseModes" ? pending.description : ""}`}
              {...(pending?.kind === "chooseModes"
                ? { label: pending.deferred ? pending.description : pending.description.split(":")[0]!, min: pending.min, max: pending.max, modes: pending.modes, legal: pending.legal, ...(pending.optional ? { optional: true } : {}) }
                : modeMenuProps(s, modePick!))}
              sourceName={(pending?.kind === "chooseModes" ? cardOf(s, pending.sourceId) : cardOf(s, modePick!.objectId)).name}
              onDone={pickModes}
              onCancel={pending?.kind === "chooseModes" ? undefined : () => setModePick(null)}
            />
          )}
          {pending?.kind === "chooseOption" && (pending.what === "creatureType" || ((pending.what === "textFrom" || pending.what === "textTo") && pending.options.length > 10)) && pending.player === HUMAN && (
            <TypePicker key={pending.source} s={s} pending={pending} onDone={(choice) => dispatch([{ type: "chooseOption", player: HUMAN, choice }])} />
          )}
          {pending?.kind === "chooseOption" && pending.what === "cardName" && pending.player === HUMAN && (
            <NamePicker key={pending.source} s={s} pending={pending} onHover={setHover} onDone={(choice) => dispatch([{ type: "chooseOption", player: HUMAN, choice }])} />
          )}
          {pending?.kind === "chooseOption" && pending.what === "pile" && pending.player === HUMAN && (
            <PilePicker key={pending.source} s={s} pending={pending} onHover={setHover} onDone={(choice) => dispatch([{ type: "chooseOption", player: HUMAN, choice }])} />
          )}
          {pending?.kind === "searchLibrary" && (
            <LibrarySearch
              key={`${pending.source}${pending.min}-${pending.max}${pending.cards.join(",")}`}
              s={s}
              pending={pending}
              onHover={setHover}
              onDone={(found) => dispatch([{ type: "searchLibrary", player: HUMAN, found }])}
            />
          )}
          {pending?.kind === "arrangeTop" && (
            <ArrangeTop
              key={pending.cards.join(",")}
              s={s}
              how={pending.how}
              owner={pending.owner ? s.players[pending.owner]?.name : undefined}
              source={pending.source}
              cards={pending.cards}
              onHover={setHover}
              onDone={(top, away) => dispatch([{ type: "arrangeTop", player: HUMAN, top, away }])}
            />
          )}
          {pending?.kind === "chooseMay" && pending.vault && pending.player === HUMAN && (
            <VaultLook
              key={pending.vault.join(",")}
              s={s}
              source={pending.source}
              cards={pending.vault}
              life={pending.pay?.life ?? 1}
              onHover={setHover}
              onDone={(yes) => dispatch([{ type: "chooseMay", player: HUMAN, yes }])}
            />
          )}
          {pending?.kind === "orderLibrary" && pending.player === HUMAN && (
            <ArrangeTop
              key={pending.cards.join(",")}
              s={s}
              how={pending.bottom ? "bottom" : "libraryTop"}
              owner={pending.owner !== undefined ? s.players[pending.owner]?.name : undefined}
              source={pending.source}
              cards={pending.cards}
              onHover={setHover}
              onDone={(order) => dispatch([{ type: "orderLibrary", player: HUMAN, order }])}
            />
          )}
          {pending?.kind === "orderGraveyard" && pending.player === HUMAN && (
            <ArrangeTop
              key={pending.cards.join(",")}
              s={s}
              how={pending.whole ? "wholeGraveyard" : "graveyard"}
              source={pending.source}
              cards={pending.cards}
              onHover={setHover}
              onDone={(order) => dispatch([{ type: "orderGraveyard", player: HUMAN, order }])}
            />
          )}
          {menu && s.objects[menu] && (
            <AbilityMenu
              s={s}
              objectId={menu}
              onUse={useAbility}
              onMix={(ability, n, extra, colors) => {
                setMenu(null);
                setMixPick({ objectId: menu, ability, n, ...(extra ? { extra } : {}), ...(colors ? { colors } : {}), label: cardOf(s, menu).name, counts: {} });
              }}
              onMana={(x, to) => {
                setMenu(null);
                // "{T}, Tap an untapped creature you control: Add ...": pick what to tap first.
                const tapCost = manaAbilitiesOn(s, s.objects[menu]!)[x.ability]?.tapCost;
                if (tapCost) {
                  const candidates = tapCostCandidates(s, HUMAN, s.objects[menu]!, tapCost);
                  return setCostPick({ mana: { objectId: menu, ability: x.ability, mana: x.mana, ...(x.extra ? { extra: x.extra } : {}) }, kind: "tap", label: cardOf(s, menu).name, what: `tap ${tapCost.n === 1 ? (/^[aeiou]/i.test(tapCost.filter.text) ? "an" : "a") : tapCost.n} ${tapCost.filter.text}`, n: tapCost.n, candidates, chosen: [] });
                }
                const plan = planManaAbility(s, HUMAN, menu, x.ability, x.mana, undefined, x.extra, x.combo);
                // Victory Chimes: "a player of your choice adds {C}".
                if (plan) dispatch(to === undefined ? plan : plan.map((a) => (a.type === "activateMana" && a.objectId === menu ? { ...a, to } : a)));
              }}
              onPlay={(untapped) => {
                setMenu(null);
                if (isLand(s, menu)) dispatch([{ type: "playLand", player: HUMAN, objectId: menu, ...(untapped ? { untapped } : {}) }]);
                else startCast(menu);
              }}
              onCastVia={(via, face, permit, alt) => {
                setMenu(null);
                if (permit) continueCast({ objectId: menu, via, permit, ...(alt ? { alt } : {}) });
                else startCast(menu, undefined, via, alt, undefined, face);
              }}
              onCastFace={(face) => {
                setMenu(null);
                startCast(menu, undefined, undefined, undefined, undefined, face);
              }}
              onCastAsType={(asType) => {
                setMenu(null);
                continueCast({ objectId: menu, asType });
              }}
              onPlayFace={(face, untapped) => {
                setMenu(null);
                dispatch([{ type: "playLand", player: HUMAN, objectId: menu, face, ...(untapped ? { untapped } : {}) }]);
              }}
              onCastAlt={(alt, prototyped) => {
                setMenu(null);
                if (prototyped) continueCast({ objectId: menu, alt, prototyped });
                else startCast(menu, undefined, undefined, alt);
              }}
              onCastAssist={(pid) => {
                setMenu(null);
                continueCast({ objectId: menu, assist: pid });
              }}
              onCastFaceDown={() => {
                setMenu(null);
                dispatch(planCast(s, HUMAN, menu, undefined, undefined, "auto", undefined, { faceDown: true }) ?? [{ type: "castSpell", player: HUMAN, objectId: menu, faceDown: true }]);
              }}
              onSuspend={() => {
                setMenu(null);
                // "Suspend X—{X}{3}{U}. X can't be 0." (Aeon Chronicler): X first, as many time counters (CR 702.62a).
                const sus = compileCard(cardOf(s, menu)).suspend;
                if (sus?.x) {
                  const max = Math.max(1, maxX((n) => planSuspend(s, HUMAN, menu, Math.max(1, n))));
                  return setXPick({ mode: "suspend", objectId: menu, label: `Suspend ${cardOf(s, menu).name}`, cost: sus.cost, max, value: Math.min(max, 1), min: 1 });
                }
                dispatch(planSuspend(s, HUMAN, menu) ?? [{ type: "suspend", player: HUMAN, objectId: menu }]);
              }}
              onPlot={() => {
                setMenu(null);
                dispatch(planPlot(s, HUMAN, menu) ?? [{ type: "plot", player: HUMAN, objectId: menu }]);
              }}
              onForetell={() => {
                setMenu(null);
                dispatch(planForetell(s, HUMAN, menu) ?? [{ type: "foretell", player: HUMAN, objectId: menu }]);
              }}
              onDiscardAnyTime={() => {
                setMenu(null);
                dispatch([{ type: "discardAnyTime", player: HUMAN, objectId: menu }]);
              }}
              onUnlock={(door) => {
                setMenu(null);
                dispatch(planUnlock(s, HUMAN, menu, door) ?? [{ type: "unlockDoor", player: HUMAN, objectId: menu, door }]);
              }}
              onEndEffect={() => {
                setMenu(null);
                dispatch(planEndEffect(s, HUMAN, menu) ?? [{ type: "endEffect", player: HUMAN, objectId: menu }]);
              }}
              onIgnore={() => {
                setMenu(null);
                const ig = ignorableBy(s, HUMAN, menu);
                const c = ig?.costs?.[0];
                const label = `Ignore ${cardOf(s, menu).name}'s effect this turn`;
                // Volrath's Curse: a permanent of your choice; Lost in Thought: three cards from your graveyard.
                if (c?.kind === "sacrifice") return setCostPick({ ignore: menu, kind: "sacrifice", label, what: "sacrifice a permanent", n: 1, candidates: s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === HUMAN), chosen: [] });
                if (c?.kind === "exileFromGraveyard") return setCostPick({ ignore: menu, kind: "exileCards", label, what: `exile ${c.n} cards from your graveyard`, n: c.n, candidates: [...s.players[HUMAN]!.graveyard], chosen: [] });
                dispatch(planIgnoreEffect(s, HUMAN, menu) ?? [{ type: "ignoreEffect", player: HUMAN, objectId: menu }]);
              }}
              onTurnFaceUp={(way, form) => {
                setMenu(null);
                // "Disguise {X}{3}{W}": X first, chosen as it's turned face up (CR 107.3d).
                const up = faceUpWays(s, s.objects[menu]!)[way];
                if (up && parseManaCost(up.cost).hasX) {
                  const max = maxX((n) => planTurnFaceUp(s, HUMAN, menu, way, n));
                  return setXPick({ mode: "faceUp", objectId: menu, way, label: `Turn face up (${up.kind})`, cost: up.cost, max, value: max });
                }
                if (up?.costs) return continueFaceUp({ objectId: menu, way });
                dispatch(planTurnFaceUp(s, HUMAN, menu, way, 0, undefined, form) ?? [{ type: "turnFaceUp", player: HUMAN, objectId: menu, ...(way ? { way } : {}), ...(form !== undefined ? { form } : {}) }]);
              }}
              onClose={() => setMenu(null)}
            />
          )}
          {tapPick && (
            <TapPickBar
              s={s}
              pick={tapPick}
              onDone={finishTapPick}
              onSkip={
                tapPick.kind === "teamwork"
                  ? () => {
                      setTapPick(null);
                      startCast(tapPick.objectId, tapPick.convoke, undefined, undefined, [], tapPick.face);
                    }
                  : tapPick.kind === "harmonize"
                    ? () => {
                        setTapPick(null);
                        continueCast({ ...tapPick.draft, harmonize: null });
                      }
                    : undefined
              }
              onCancel={() => setTapPick(null)}
            />
          )}
          {giftPick && (
            <div className="targeting gift-pick">
              <span>
                <strong>{giftPick.label}</strong>: {giftPick.life !== undefined ? giftPick.what : `promise an opponent a gift (${giftPick.what})?`}
              </span>
              {giftPick.options.map((pid) => (
                <button
                  key={pid}
                  onClick={() => {
                    setGiftPick(null);
                    continueCast(giftPick.life !== undefined ? { ...giftPick.draft, lifeTo: pid } : { ...giftPick.draft, gift: pid });
                  }}
                >
                  {giftPick.life !== undefined ? `${s.players[pid]!.name} gains ${giftPick.life} life` : `Gift ${s.players[pid]!.name}`}
                </button>
              ))}
              {giftPick.life === undefined && (
                <button
                  onClick={() => {
                    setGiftPick(null);
                    continueCast({ ...giftPick.draft, gift: null });
                  }}
                >
                  No gift
                </button>
              )}
              <button className="ghost" onClick={() => setGiftPick(null)}>
                Cancel
              </button>
            </div>
          )}
          {xPick && <XPickBar pick={xPick} onChange={(value) => setXPick({ ...xPick, value })} onDone={finishXPick} onCancel={() => setXPick(null)} />}
          {mixPick && (
            <ManaMixBar
              pick={mixPick}
              onChange={(counts) => setMixPick({ ...mixPick, counts })}
              onCancel={() => setMixPick(null)}
              onDone={() => {
                setMixPick(null);
                // The combination these counts are, numbered as the engine numbers them (ManaProduce "anyColors").
                const want = COLORS.flatMap((c) => Array<Color>(mixPick.counts[c] ?? 0).fill(c));
                const combo = colorCombos(mixPick.n, mixPick.colors).findIndex((c) => c.join() === want.join());
                const plan = combo >= 0 ? planManaAbility(s, HUMAN, mixPick.objectId, mixPick.ability, want[0] ?? "W", undefined, mixPick.extra, combo) : null;
                if (plan) dispatch(plan);
              }}
            />
          )}
          {buybackPick && (
            <div className="targeting">
              <span>
                <strong>{buybackPick.label}</strong>: pay buyback {buybackPick.text ? `(${buybackPick.text})` : <ManaCost cost={buybackPick.cost} size="sm" />} too? It returns to your hand as it resolves.
              </span>
              <button
                disabled={planCast(s, HUMAN, buybackPick.draft.objectId, undefined, buybackPick.draft.modes, buybackPick.draft.convoke ?? "auto", undefined, { buyback: true, ...(buybackPick.draft.kicks?.length ? { kicks: buybackPick.draft.kicks } : {}) }) === null}
                onClick={() => {
                  setBuybackPick(null);
                  continueCast({ ...buybackPick.draft, buyback: true });
                }}
              >
                Buy it back
              </button>
              <button
                onClick={() => {
                  setBuybackPick(null);
                  continueCast({ ...buybackPick.draft, buyback: false });
                }}
              >
                Don&apos;t
              </button>
              <button className="ghost" onClick={() => setBuybackPick(null)}>
                Cancel
              </button>
            </div>
          )}
          {foragePick && (
            <div className="targeting forage-pick">
              <span>
                <strong>{foragePick.label}</strong>: forage by
              </span>
              {(["exileCards", "sacrifice"] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => {
                    const ways = forageWays(s, HUMAN, s.objects[(foragePick.activate ?? foragePick.draft).objectId]);
                    const pick = kind === "sacrifice" ? { kind, what: "sacrifice a Food to forage", n: 1, candidates: ways.foods } : { kind, what: "exile three cards from your graveyard to forage", n: 3, candidates: ways.cards };
                    setForagePick(null);
                    setCostPick({ ...(foragePick.activate ? { activate: foragePick.activate } : { draft: foragePick.draft! }), label: foragePick.label, ...pick, chosen: [] });
                  }}
                >
                  {kind === "sacrifice" ? "Sacrificing a Food" : "Exiling three cards from your graveyard"}
                </button>
              ))}
              <button className="ghost" onClick={() => setForagePick(null)}>
                Cancel
              </button>
            </div>
          )}
          {numberPick && (
            <div className="targeting">
              <span>
                <strong>{numberPick.label}</strong>: as an additional cost, choose a number
              </span>
              {Array.from({ length: numberPick.max - numberPick.min + 1 }, (_, i) => numberPick.min + i).map((n) => (
                <button
                  key={n}
                  data-number={n}
                  onClick={() => {
                    setNumberPick(null);
                    continueCast({ ...numberPick.draft, number: n });
                  }}
                >
                  {n}
                </button>
              ))}
              <button className="ghost" onClick={() => setNumberPick(null)}>
                Cancel
              </button>
            </div>
          )}
          {costOrPick && (
            <div className="targeting">
              <span>
                <strong>{costOrPick.label}</strong>: as an additional cost,
              </span>
              {costOrPick.options.map((text, i) => (
                <button
                  key={i}
                  disabled={planCast(s, HUMAN, costOrPick.draft.objectId, undefined, costOrPick.draft.modes, costOrPick.draft.convoke ?? "auto", undefined, { costOr: i, ...(costOrPick.draft.kicks?.length ? { kicks: costOrPick.draft.kicks } : {}), ...(costOrPick.draft.buyback ? { buyback: true } : {}) }) === null}
                  onClick={() => {
                    setCostOrPick(null);
                    continueCast({ ...costOrPick.draft, costOr: i });
                  }}
                >
                  {text.charAt(0).toUpperCase() + text.slice(1)}
                </button>
              ))}
              <button className="ghost" onClick={() => setCostOrPick(null)}>
                Cancel
              </button>
            </div>
          )}
          {kickPick && (
            <KickPickBar
              s={s}
              pick={kickPick}
              onChange={(chosen) => setKickPick({ ...kickPick, chosen })}
              onDone={(kicks) => {
                setKickPick(null);
                continueCast({ ...kickPick.draft, kicks });
              }}
              onCancel={() => setKickPick(null)}
            />
          )}
          {costPick && (costPick.kind === "sacrifice" || costPick.kind === "returnToHand" || costPick.kind === "casualty" || costPick.kind === "bargain" || costPick.kind === "offering" || costPick.kind === "tap" || costPick.kind === "conspire" || costPick.kind === "counterOn") && (
            <CostPickBar
              pick={costPick}
              valid={!costPick.share || costChoiceShares(s, costPick.share, costPick.chosen)}
              onDone={() => finishCostPick(costPick)}
              onSkip={costPick.kind === "casualty" || costPick.kind === "bargain" || costPick.kind === "conspire" || (costPick.kind === "offering" && !costPick.required) ? () => finishCostPick({ ...costPick, chosen: [] }) : undefined}
              onCancel={() => setCostPick(null)}
            />
          )}
          {delvePick && (
            <CardChoice
              s={s}
              title={`${delvePick.label}: delve, exile up to ${delvePick.max} card${delvePick.max === 1 ? "" : "s"} from your graveyard, each paying for {1}`}
              cards={delvePick.candidates}
              chosen={delvePick.chosen}
              n={delvePick.max}
              min={0}
              onHover={setHover}
              onToggle={(id) =>
                setDelvePick({ ...delvePick, chosen: delvePick.chosen.includes(id) ? delvePick.chosen.filter((x) => x !== id) : [...delvePick.chosen, id].slice(-delvePick.max) })
              }
              onDone={() => {
                setDelvePick(null);
                continueCast({ ...delvePick.draft, delve: delvePick.chosen });
              }}
              onCancel={() => setDelvePick(null)}
            />
          )}
          {counterPick && (
            <CounterChoice
              key={`${counterPick.label}:${counterPick.n}`}
              s={s}
              title={`${counterPick.label}: ${counterPick.what}`}
              n={counterPick.n}
              candidates={counterPick.candidates}
              onHover={setHover}
              onDone={(counters) => {
                setCounterPick(null);
                if (counterPick.draft) continueCast({ ...counterPick.draft, counters });
                else continueActivate({ ...counterPick.activate, counters });
              }}
              onCancel={() => setCounterPick(null)}
            />
          )}
          {evidencePick && (
            <EvidenceChoice
              key={`${evidencePick.label}:${evidencePick.n}:${evidencePick.key ?? "ability"}`}
              s={s}
              title={evidencePick.title ? `${evidencePick.label}: ${evidencePick.title}` : `${evidencePick.label}: ${evidencePick.optional ? "you may collect" : "collect"} evidence ${evidencePick.n}, exiling cards with total mana value ${evidencePick.n} or more from your graveyard`}
              n={evidencePick.n}
              cards={evidencePick.candidates}
              onHover={setHover}
              onDone={(ids) => {
                setEvidencePick(null);
                if (evidencePick.activate) continueActivate({ ...evidencePick.activate, collect: ids });
                else continueCast({ ...evidencePick.draft, [evidencePick.key]: ids });
              }}
              onSkip={evidencePick.optional ? () => (setEvidencePick(null), continueCast({ ...evidencePick.draft!, evidence: [] })) : undefined}
              onCancel={() => setEvidencePick(null)}
            />
          )}
          {pending?.kind === "collectEvidence" && pending.player === HUMAN && (
            <EvidenceChoice
              key={`${pending.source}:${pending.n}`}
              s={s}
              title={pending.forUnless ? `${pending.source}: collect evidence ${pending.n}, exiling cards with total mana value ${pending.n} or more from your graveyard` : `${pending.source}: you may collect evidence ${pending.n}, exiling cards with total mana value ${pending.n} or more from your graveyard`}
              n={pending.n}
              cards={evidenceCandidates(s, HUMAN, pending.not)}
              onHover={setHover}
              onDone={(ids) => dispatch([{ type: "collectEvidence", player: HUMAN, ids }])}
              onSkip={() => dispatch([{ type: "collectEvidence", player: HUMAN, ids: [] }])}
            />
          )}
          {costPick && costPick.kind !== "sacrifice" && costPick.kind !== "returnToHand" && costPick.kind !== "casualty" && costPick.kind !== "bargain" && costPick.kind !== "offering" && costPick.kind !== "conspire" && costPick.kind !== "tap" && costPick.kind !== "counterOn" && (
            <CardChoice
              s={s}
              title={`${costPick.label}: ${costPick.what}`}
              cards={costPick.candidates}
              chosen={costPick.chosen}
              n={costPick.n}
              {...(costPick.min !== undefined ? { min: costPick.min } : {})}
              valid={(!costPick.oneOf || costPick.chosen.some((id) => printedMatches(costPick.oneOf!, cardOf(s, id)))) && (!costPick.differentNames || namesDiffer(s, costPick.chosen)) && (!costPick.sameName || costPick.chosen.every((id) => sameName(cardOf(s, id).name, cardOf(s, costPick.chosen[0]!).name))) && (!costPick.share || costChoiceShares(s, costPick.share, costPick.chosen))}
              onHover={setHover}
              onToggle={(id) =>
                setCostPick({ ...costPick, chosen: costPick.chosen.includes(id) ? costPick.chosen.filter((x) => x !== id) : [...costPick.chosen, id].slice(-costPick.n) })
              }
              onDone={() => finishCostPick(costPick)}
              onCancel={() => setCostPick(null)}
            />
          )}
          {!targeting && !modePick && !tapPick && !picking && pending?.kind !== "chooseModes" && <Controls s={s} pending={pending} attacks={attacks} aim={aim} blocks={blocks} blocker={blocker} discards={discards} dispatch={dispatch} onCastFree={(id, face, alt) => startCast(id, undefined, undefined, alt, undefined, face)} onHover={setHover} />}
          <PriorityToggle mode={priorityMode} onChange={setPriorityMode} />
          {!s.over && <LoopBar s={s} loop={loop} note={shortcutNote} onStart={startLoop} onCancel={cancelLoop} onRepeat={repeatLoop} />}
          {error && <div className="error">{error}</div>}
          {s.over && (
            <div className="game-over">
              {s.winner === HUMAN ? "You win!" : s.winner !== null ? `${s.players[s.winner]!.name} wins.` : "The game is a draw."}
              <button onClick={onQuit}>Back to lobby</button>
            </div>
          )}
        </div>
        <button className="quit" onClick={onQuit}>
          Quit game
        </button>
      </aside>

      <Arrows arrows={arrows} snap={snap} />

      {viewing && (
        <ZoneViewer
          s={s}
          view={viewing}
          onClose={() => setViewing(null)}
          onHover={setHover}
          canPick={(id) => !pending && viewing.zone !== "hand" && (viewing.zone === "graveyard" ? (viewing.pid === HUMAN || castsFromAnyGraveyard(s)) && graveyardOptions(s, id) : exileOptions(s, id))}
          onPick={(id) => {
            setViewing(null);
            setMenu(id);
          }}
        />
      )}
      <HoverCard d={hover} onGone={() => setHover(null)} />
      <GameOverPopup s={s} onQuit={onQuit} />
    </div>
  );
}

/**
 * Once you're out of the game, or it's over: a window saying whether you won or lost, with the way out. Closing it
 * leaves the table to look at; if you lost while the others play on, it comes back when the game ends.
 */
function GameOverPopup({ s, onQuit }: { s: GameState; onQuit: () => void }) {
  const lost = s.players[HUMAN]!.lost;
  const moment = s.over ? "over" : lost ? "lost" : null;
  const [closed, setClosed] = useState<string | null>(null);
  if (!moment || closed === moment) return null;
  const won = s.over && s.winner === HUMAN;
  const winner = s.winner !== null ? s.players[s.winner]! : undefined;
  // A card that says its controller wins logs "X wins the game (<card>)."
  const how = s.over && winner ? /wins the game \((.+)\)\.$/.exec([...s.log].reverse().find((e) => e.text.startsWith(`${winner.name} wins the game (`))?.text ?? "")?.[1] : undefined;
  return (
    <div className="modal-backdrop game-end-backdrop">
      <div className={`modal game-end ${won ? "won" : "lost"}`} role="dialog" aria-label="Game over">
        <h2>{won ? "You won!" : s.over && !winner ? "It's a draw." : "You lost."}</h2>
        <p className="muted">
          {won
            ? how ? `${how} won you the game.` : "You're the last player standing."
            : !s.over ? "The others play on without you." : winner ? `${winner.name} wins the game${how ? ` with ${how}` : ""}.` : "No one wins the game."}
        </p>
        <div className="game-end-buttons">
          <button onClick={onQuit}>Back to lobby</button>
          <button className="ghost" onClick={() => setClosed(moment)}>
            {s.over ? "Look at the table" : "Watch the rest"}
          </button>
        </div>
      </div>
    </div>
  );
}

const PHASES: Step[] = ["untap", "upkeep", "draw", "main1", "beginCombat", "declareAttackers", "declareBlockers", "combatDamage", "endCombat", "main2", "end"];

function canPlayLand(s: GameState, id: string, face?: number) {
  return legalActions(s, HUMAN).some((a) => a.type === "playLand" && a.objectId === id && a.face === face);
}

/** Could you cast this card as this face now, tapping mana as needed (CR 709.3, 712.11b, 715.3)? */
function canCastFace(s: GameState, id: string, face: number) {
  const problem = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, undefined, { face });
  if (problem && !/not enough mana/.test(problem)) return false;
  return asFace(s, s.objects[id]!, face, () => canCastWithTaps(s, id));
}

/** Could you cast or play this card as one of its other faces now? */
function canUseFace(s: GameState, id: string) {
  const o = s.objects[id]!;
  return castableFaces(s, o).some((f) => canCastFace(s, id, f)) || landFaces(s, o).some((f) => f !== 0 && canPlayLand(s, id, f));
}

/** Alternative costs that aren't the card's own, which a prototype card may be cast prototyped for (CR 718.3). */
const PROTOTYPE_WITH: AltCostKind[] = ["payZero", "wubrg", "omniscience", "citadel"];
const ALT_NAMES: Record<AltCostKind, string> = { payZero: "Cast it for", impending: "Impending", citadel: "Cast it:", foretell: "Cast it for its foretell cost", evoke: "Evoke", dash: "Dash", bestow: "Bestow", madness: "Madness", blitz: "Blitz", warp: "Warp", grantedWarp: "Warp", alternative: "Cast it for", prototype: "Prototype", wubrg: "Cast it for", evidence: "Cast it:", emerge: "Emerge", freerunning: "Freerunning", grantedFreerunning: "Freerunning", grantedWebSlinging: "Web-slinging", grantedBlitz: "Blitz", grantedEmerge: "Emerge", sneak: "Sneak", surge: "Surge", spectacle: "Spectacle", overload: "Overload", awaken: "Awaken", miracle: "Miracle", mutate: "Mutate", convert: "More Than Meets the Eye", omniscience: "Cast it:", cleave: "Cleave", lifeForMv: "Cast it:", nextFree: "Cast it:", nextLife: "Cast it:", linkedFree: "Cast it:", prowl: "Prowl", genericMv: "Cast it for", energyForSpell: "Cast it:" };
const ALT_NOTES: Record<AltCostKind, string> = {
  impending: "enters with time counters and isn't a creature until the last is removed (one at each of your end steps)",
  citadel: "life equal to its mana value instead of its mana cost (Bolas's Citadel, Valgavoth); X is 0",
  lifeForMv: "life equal to its mana value instead of its mana cost, once during each of your turns (Demon of Fate's Design); X is 0",
  genericMv: "generic mana equal to its mana value instead of its mana cost (Kentaro, the Smiling Cat); X is 0",
  energyForSpell: "energy instead of its mana cost (Nissa, Worldsoul Speaker; Primal Prayers, which also lets you cast it any time you could cast an instant); X is 0",
  evoke: "it's sacrificed as it enters",
  dash: "haste, back to your hand at the end step",
  bestow: "an Aura on a creature; a creature again if it's ever unattached",
  madness: "",
  blitz: "haste, and you draw a card when it dies; sacrificed at the end step",
  warp: "exiled at the end step; you may cast it from exile on a later turn",
  grantedWarp: "exiled at the end step; you may cast it from exile on a later turn",
  alternative: "an alternative cost: it's still the same spell, with the same mana value",
  prototype: "the smaller version: the prototype's mana cost, color, power and toughness",
  wubrg: "instead of its mana cost (Fist of Suns); X is 0",
  evidence: "instead of its mana cost (Conspiracy Unraveler): exile cards from your graveyard with that much total mana value; X is 0",
  emerge: "sacrifice a creature as you cast it: the cost is reduced by its mana value",
  freerunning: "only if a player was dealt combat damage this turn by an Assassin or a commander you controlled",
  grantedFreerunning: "only if a player was dealt combat damage this turn by an Assassin or a commander you controlled",
  grantedWebSlinging: "return a tapped creature you control to its owner's hand",
  grantedBlitz: "haste, and you draw a card when it dies; sacrificed at the end step",
  grantedEmerge: "its mana cost, sacrificing a creature as you cast it: the cost is reduced by its mana value",
  foretell: "a foretold card is cast for its foretell cost",
  sneak: "during your declare blockers step: return an unblocked attacker to your hand; a creature enters tapped and attacking",
  surge: "only if you've cast another spell this turn",
  spectacle: "only if an opponent lost life this turn",
  prowl: "only if a player was dealt combat damage this turn by a creature you controlled with one of its creature types",
  overload: "\"target\" in its text becomes \"each\": no targets, it affects all of them",
  cleave: "the words in square brackets are gone from its text",
  awaken: "also put +1/+1 counters on target land you control: it becomes a 0/0 Elemental creature with haste",
  miracle: "",
  mutate: "target a non-Human creature you own: it merges with it, on top or underneath, and the merged creature has the abilities of both",
  convert: "cast it converted: its back face is the spell, and it enters with that face up",
  omniscience: "from your hand, for nothing (Omniscience, Chandra, Flame's Catalyst); X is 0",
  linkedFree: "a card exiled with Court of Locthwain, for nothing; X is 0",
  nextFree: "the next such spell you cast this turn, for nothing (World War Hulk); X is 0",
  nextLife: "life equal to its mana value instead of its mana cost, for the next spell you cast this turn (Marshland Bloodcaster); X is 0",
  payZero: "{0} instead of its mana cost (As Foretold, Rooftop Storm); X is 0",
};

const VIA_NAMES: Record<CastFromGraveyardKind, string> = { flashback: "Flashback", grantedFlashback: "Flashback", grantedEscape: "Escape", grantedRetrace: "Retrace", jumpStart: "Jump-start", retrace: "Retrace", escape: "Escape", mayhem: "Mayhem", harmonize: "Harmonize", permission: "Cast from graveyard", turnPermission: "Cast from graveyard", aftermath: "Aftermath:", disturb: "Disturb:" };

/** "creature" to "creatures"; a text that is plural already ("other artifact creatures and/or Vehicles") stays. */
const plural = (what: string) => (/s$/.test(what) ? what : `${what}s`);

/** "put a -1/-1 counter on a creature you control", "blight 2 (put two -1/-1 counters on a creature you control)". */
function counterOnWhat(c: Extract<AdditionalCost, { kind: "putCounter" }>): string {
  const put = `put ${c.n === 1 ? `a ${c.counter} counter` : `${c.n} ${c.counter} counters`} on ${/^[aeiou]/i.test(c.filter.text) ? "an" : "a"} ${c.filter.text}`;
  return c.blight ? `blight ${c.n} (${put})` : put;
}

/** "discard a card", "pay 3 life", "exile two other cards from your graveyard". */
function describeExtraCost(c: AdditionalCost): string {
  const n = (k: number, what: string) => (k === 1 ? `${/^[aeiou]/i.test(what) ? "an" : "a"} ${what}` : `${k} ${plural(what)}`);
  if (c.kind === "payLife") return `pay ${c.n} life`;
  if (c.kind === "payEnergy") return `pay ${c.n} energy`;
  if (c.kind === "forage") return "forage (exile three cards from your graveyard or sacrifice a Food)";
  if (c.kind === "sacrifice") return `${c.exile ? "exile" : "sacrifice"} ${c.oneOfEach ? `a ${c.filter.text}` : n(c.n, c.filter.text)}${c.exile ? " you control" : ""}`;
  if (c.kind === "discard") return `discard ${n(c.n, c.filter?.text ?? "card")}${c.random ? " at random" : ""}`;
  if (c.kind === "returnToHand") return `return ${n(c.n, c.filter.text)} to hand`;
  if (c.kind === "revealHand") return "reveal your hand";
  if (c.kind === "sacrificeAll") return `sacrifice all ${c.creatures ? "creatures" : c.lands ? "lands" : "permanents"} you control`;
  if (c.kind === "discardHand") return "discard your hand";
  if (c.kind === "giveLife") return c.each ? `have each other player gain ${c.n} life` : `have an opponent gain ${c.n} life`;
  if (c.kind === "tap") return `${c.untap ? "untap" : "tap"} ${n(c.n, c.filter.text)}`;
  if (c.kind === "reveal" && c.orControl) return `behold ${beholdWhat(c)}${c.exile ? " and exile it" : ""}`;
  if (c.kind === "reveal") return `reveal ${n(c.n, c.filter.text)} from your hand`;
  if (c.kind === "collectEvidence") return c.notEvidence && c.filter ? `exile ${c.filter.text}s with total mana value ${c.n} or more from your graveyard` : `collect evidence ${c.n}`;
  if (c.kind === "putCounter") return counterOnWhat(c);
  if (c.kind === "mill") return c.exile ? `exile the top ${c.n === 1 ? "card" : `${c.n} cards`} of your library` : `mill ${c.n === 1 ? "a card" : `${c.n} cards`}`;
  if (c.kind === "exileFromHand") return c.toLibrary ? `put ${n(c.n, "card")} from your hand on top of your library` : `exile ${n(c.n, c.filter?.text ?? "card")} from your hand`;
  return `exile ${n(c.n, c.filter?.text ?? "other card")} from your graveyard`;
}

/** Could you cast this card from your graveyard this way now, tapping mana as needed (costs like discards aside)? */
function canCastFromGraveyard(s: GameState, id: string, via: CastFromGraveyardKind, face?: number, alt?: AltCostKind) {
  const can = (choices0: { via: CastFromGraveyardKind; harmonize?: string }) => {
    const choices = alt ? { ...choices0, alt } : choices0;
    const problem = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, undefined, { ...choices, face });
    return !problem || (/not enough mana/.test(problem) && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { ...choices, face }) !== null);
  };
  // Harmonize: tapping a creature can take enough off its cost (CR 702.180a).
  return can({ via }) || (via === "harmonize" && convokers(s).some((c) => can({ via, harmonize: c.id })));
}

/** A card exiled with "you may play it until ..." that you could play now. */
function exileOptions(s: GameState, id: string): boolean {
  // Mister Immortal: an ability that works from exile too (ActivatedAbility.orExile).
  if (s.objects[id]!.owner === HUMAN && abilitiesOf(s, s.objects[id]!).activated.some((ab, i) => ab.orExile && planActivate(s, HUMAN, id, i) !== null)) return true;
  if (!mayPlayFromExile(s, s.objects[id]!, HUMAN)) return false;
  if (foretoldCast(s, HUMAN, s.objects[id]!)) return canCastAlt(s, id, "foretell");
  // Valgavoth's cards: only for life (its "pay life equal to its mana value").
  // An alternative cost: Valgavoth's life, Warped Space's {0}.
  return (isLand(s, id) ? canPlayLand(s, id) : canCastWithTaps(s, id) || altCostsFor(s, HUMAN, s.objects[id]!).some((a) => canCastAlt(s, id, a.kind))) || canUseFace(s, id);
}

/** You may cast spells from other players' graveyards this turn (The Great Work; Locke, Treasure Hunter's milled cards). */
const castsFromAnyGraveyard = (s: GameState) => !!s.graveyardTurn?.some((g) => g.anyGraveyard && g.player === HUMAN && g.turn === s.turn) || !!s.graveGrants?.some((g) => (g.cards || g.fromYardOf !== undefined) && g.player === HUMAN && g.turn === s.turn);

/** Does this card in your graveyard (or another's, with The Great Work) have something you could do with it now (flashback, unearth, ...)? */
function graveyardOptions(s: GameState, id: string): boolean {
  const d = cardOf(s, id);
  if (mayPlayLandFromGraveyard(s, s.objects[id]!, HUMAN) && canPlayLand(s, id)) return true; // Crucible of Worlds
  const o = s.objects[id]!;
  if (graveyardWays(s, o, HUMAN).some((g) => canCastFromGraveyard(s, id, g.kind, g.face) || (permissionWay(g) && altCostsFor(s, HUMAN, o).some((a) => canCastFromGraveyard(s, id, g.kind, undefined, a.kind))))) return true;
  return abilitiesOf(s, s.objects[id]!).activated.some((ab, i) => ab.zone === "graveyard" && planActivate(s, HUMAN, id, i) !== null);
}

/**
 * What Rottenmouth Viper's "you may sacrifice any number of nonland permanents" could take, those that make no mana
 * first (sacrificing one of them takes its mana away).
 */
function reducingSacrifices(s: GameState, id: string): string[] {
  const c = compileCard(cardOf(s, id)).additionalCosts?.find((x) => x.kind === "sacrifice" && x.optional);
  if (c?.kind !== "sacrifice") return [];
  const makesMana = (x: string) => abilitiesOf(s, s.objects[x]!).mana.length > 0;
  return s.battlefield.filter((x) => x !== id && controllerOf(s, s.objects[x]!) === HUMAN && objectMatches(s, c.filter, s.objects[x]!, HUMAN, false)).sort((a, b) => Number(makesMana(a)) - Number(makesMana(b)));
}

/**
 * The cost that makes it cheaper for each one paid, n of them: Rottenmouth Viper's sacrifices, Explosive Singularity's
 * tapped creatures (those that make no mana first), Hierophant Bio-Titan's removed +1/+1 counters.
 */
function reducingChoices(s: GameState, id: string, n: number): Pick<CostChoices, "sacrifice" | "tap" | "counters"> {
  const costs = compileCard(cardOf(s, id)).additionalCosts ?? [];
  const tap = costs.find((x) => x.kind === "tap" && x.x);
  if (tap?.kind === "tap") {
    const makesMana = (x: string) => abilitiesOf(s, s.objects[x]!).mana.length > 0;
    return { tap: tapCostCandidates(s, HUMAN, s.objects[id]!, tap).sort((a, b) => Number(makesMana(a)) - Number(makesMana(b))).slice(0, n) };
  }
  const counters = costs.find((x) => x.kind === "removeCounters" && x.x);
  if (counters?.kind === "removeCounters") return { counters: counterCostCandidates(s, HUMAN, s.objects[id]!, counters).flatMap((x) => Array.from({ length: x.n }, () => ({ id: x.id, kind: x.kind }))).slice(0, n) };
  return { sacrifice: reducingSacrifices(s, id).slice(0, n) };
}

/** How many of reducingChoices' there are to pay with. */
function reducingRoom(s: GameState, id: string): number {
  const c = reducingChoices(s, id, Infinity);
  return (c.tap ?? c.counters ?? c.sacrifice ?? []).length;
}

function canCastWithTaps(s: GameState, id: string, convoke?: string[], teamwork?: string[]) {
  if (teamwork?.length) return planCast(s, HUMAN, id, undefined, undefined, convoke ?? "auto", undefined, { teamwork }) !== null;
  if ((!convoke && canCast(s, HUMAN, id)) || planCast(s, HUMAN, id, undefined, undefined, convoke ?? "auto") !== null) return true;
  // "You may cast this as though it had flash if it's cast using teamwork": try tapping the strongest creatures.
  const c = s.objects[id] && compileCard(cardOf(s, id));
  if (teamwork === undefined && c?.teamworkFlash && c.teamwork !== undefined) {
    const pick: string[] = [];
    let total = 0;
    for (const x of teamworkCandidates(s, HUMAN).sort((a, b) => teamworkPower(s, b) - teamworkPower(s, a))) {
      if (total >= c.teamwork) break;
      pick.push(x);
      total += teamworkPower(s, x);
    }
    if (total >= c.teamwork && pick.length && planCast(s, HUMAN, id, undefined, undefined, convoke ?? "auto", undefined, { teamwork: pick }) !== null) return true;
  }
  // Rottenmouth Viper: cheaper for each permanent sacrificed as it's cast, so with some of them.
  if (!convoke && c?.sacrificedReduction) {
    const most = reducingRoom(s, id);
    for (let n = 1; n <= most; n++) if (planCast(s, HUMAN, id, undefined, undefined, "auto", n, reducingChoices(s, id, n)) !== null) return true;
  }
  // Offering (CR 702.48a): castable now, or cheap enough, with one of the permanents it could sacrifice.
  if (!convoke && c?.offering && offeringCandidates(s, HUMAN, id).some((x) => planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { offering: x }) !== null)) return true;
  // Cheaper if you collect evidence as you cast it (Bite Down on Crime): with the cards it would pick (CR 701.59a).
  if (!convoke && c?.evidence !== undefined && c.evidenceReduction) {
    const ev = autoEvidence(s, HUMAN, c.evidence, id);
    if (evidenceValue(s, ev) >= c.evidence && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { evidence: ev }) !== null) return true;
  }
  // With delve's help: as many cards from your graveyard as it can use (CR 702.66a).
  const room = convoke ? 0 : delveRoom(s, HUMAN, id);
  return room > 0 && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { delve: s.players[HUMAN]!.graveyard.filter((c) => c !== id).slice(0, room) }) !== null;
}

/** Could you begin casting this card now if mana were no object? With assist, another player may pay some of it. */
function canCastNowIgnoringMana(s: GameState, id: string) {
  const problem = castProblem(s, HUMAN, id);
  return !problem || /not enough mana/.test(problem);
}

/** Could you cast this card from your hand for its evoke or dash cost now, tapping mana as needed? */
function canCastAlt(s: GameState, id: string, alt: AltCostKind, prototyped?: true): boolean {
  if (prototyped) {
    const p = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, undefined, { alt, prototyped });
    return !p || (/not enough mana/.test(p) && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { alt, prototyped }) !== null);
  }
  // The Shoals: X is the mana value of the card exiled (CR 107.3a), so each X a card in hand could give.
  if (altCost(cardOf(s, id), alt)?.costs?.some((c) => c.kind === "exileFromHand" && c.mvX)) {
    const xs = new Set(s.players[HUMAN]!.hand.filter((h) => h !== id).map((h) => manaValue(parseManaCost(cardOf(s, h).manaCost))));
    return [...xs].some((x) => {
      const p = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, x, { alt });
      return !p || (/not enough mana/.test(p) && planCast(s, HUMAN, id, undefined, undefined, "auto", x, { alt }) !== null);
    });
  }
  const problem = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, undefined, { alt });
  if (!problem) return true;
  if (!/not enough mana/.test(problem)) return false;
  if (planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { alt }) !== null) return true;
  // Emerge: what's sacrificed lowers the cost (CR 702.119a), so try each permanent that could be.
  const sac = isEmerge(alt) ? altCost(cardOf(s, id), alt, s, HUMAN)?.costs?.find((c) => c.kind === "sacrifice") : undefined;
  return !!sac && s.battlefield.some((x) => controllerOf(s, s.objects[x]!) === HUMAN && objectMatches(s, sac.filter, s.objects[x]!, HUMAN, false) && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { alt, sacrifice: [x] }) !== null);
}

/** Indices of a card's abilities that work from your hand (cycling, CR 702.29a), or from the command zone for a commander (commander ninjutsu, CR 702.49d; Derevi's). */
function handAbilities(s: GameState, id: string): number[] {
  const o = s.objects[id]!;
  return abilitiesOf(s, o).activated.flatMap((ab, i) => ((ab.zone === "hand" && (o.zone !== "command" || ab.orCommand)) || (ab.zone === "command" && o.zone === "command") ? [i] : []));
}

/** Could you cycle this card right now, tapping mana as needed? */
const canCycle = (s: GameState, id: string) => handAbilities(s, id).some((i) => planActivate(s, HUMAN, id, i) !== null);

/** Your untapped creatures, which convoke can tap (CR 702.51a). */
const convokers = (s: GameState) => s.battlefield.map((id) => s.objects[id]!).filter((o) => controllerOf(s, o) === HUMAN && !o.tapped && isCreature(s, o.id));

/** Creatures that can be clicked for a crew or convoke pick: your untapped creatures, other than the Vehicle being crewed. */
function tapCandidates(s: GameState, pick: TapPick): GameObject[] {
  if (pick.kind === "teamwork") return convokers(s).filter((o) => !pick.convoke?.includes(o.id));
  if (pick.kind === "harmonize") return convokers(s);
  // Not one that "can't crew Vehicles" (Revoke Privileges); saddling isn't crewing.
  return convokers(s).filter((o) => !(pick.kind !== "convoke" && o.id === pick.objectId) && !(pick.kind === "crew" && !pick.saddle && characteristics(s, o).cantCrew));
}

/** The bar shown while announcing X. */
function XPickBar({ pick, onChange, onDone, onCancel }: { pick: XPick; onChange: (x: number) => void; onDone: () => void; onCancel: () => void }) {
  const min = pick.mode === "faceUp" ? 0 : (pick.min ?? 0);
  const set = (n: number) => onChange(Math.max(min, Math.min(pick.max, Math.floor(n) || 0)));
  return (
    <div className="targeting x-pick">
      <span>
        <strong>{pick.label}</strong> <ManaCost cost={pick.cost} size="sm" />
        {pick.extra ? ` and ${pick.extra}: choose X (up to ${pick.max})` : `: choose X (up to ${pick.max} with your mana)`}
      </span>
      <button className="ghost" disabled={pick.value <= min} onClick={() => set(pick.value - 1)} aria-label="X minus one">
        −
      </button>
      <input
        type="number"
        min={min}
        max={pick.max}
        value={pick.value}
        autoFocus
        onChange={(e) => set(Number(e.target.value))}
        onKeyDown={(e) => (e.key === "Enter" ? onDone() : e.key === "Escape" && onCancel())}
        aria-label="X"
      />
      <button className="ghost" disabled={pick.value >= pick.max} onClick={() => set(pick.value + 1)} aria-label="X plus one">
        +
      </button>
      <button onClick={onDone}>X = {pick.value}</button>
      <button className="ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** "Add X mana in any combination of colors" (Selvala, Heart of the Wilds): how much of each color, `n` in all (CR 106.1b). */
interface MixPick {
  objectId: string;
  ability: number;
  n: number;
  extra?: ManaType[];
  label: string;
  counts: Partial<Record<Color, number>>;
  /** "In any combination of {U} and/or {R}" (Vivi Ornitier): only these colors. */
  colors?: Color[];
}

function ManaMixBar({ pick, onChange, onDone, onCancel }: { pick: Pick<MixPick, "n" | "label" | "counts" | "colors">; onChange: (counts: Partial<Record<Color, number>>) => void; onDone: () => void; onCancel?: () => void }) {
  const total = COLORS.reduce((a, c) => a + (pick.counts[c] ?? 0), 0);
  const set = (c: Color, k: number) => onChange({ ...pick.counts, [c]: Math.max(0, k) });
  return (
    <div className="targeting mana-mix">
      <span>
        <strong>{pick.label}</strong>: add {pick.n} mana in any combination of {pick.colors ? pick.colors.map((c) => COLOR_NAMES[c].toLowerCase()).join(" and/or ") : "colors"} ({pick.n - total} left)
      </span>
      {COLORS.filter((c) => !pick.colors || pick.colors.includes(c)).map((c) => {
        const k = pick.counts[c] ?? 0;
        return (
          <span key={c} className="divide" data-mix-color={c}>
            <ManaCost cost={`{${c}}`} size="sm" />{" "}
            <button className="ghost" disabled={k <= 0} onClick={() => set(c, k - 1)} aria-label={`${COLOR_NAMES[c]} minus one`}>
              −
            </button>
            <strong>{k}</strong>
            <button className="ghost" disabled={total >= pick.n} onClick={() => set(c, k + 1)} aria-label={`${COLOR_NAMES[c]} plus one`}>
              +
            </button>
          </span>
        );
      })}
      <button disabled={total !== pick.n} onClick={onDone}>
        Add
      </button>
      {onCancel && (
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

/** "Add X mana in any combination of colors" from a spell or a triggered ability (Klauth, Manamorphose), as it resolves. */
function ManaMixChoice({ pending, dispatch }: { pending: Extract<NonNullable<GameState["pending"]>, { kind: "manaMix" }>; dispatch: ReturnType<typeof useGame>["dispatch"] }) {
  const [counts, setCounts] = useState<Partial<Record<Color, number>>>({});
  return (
    <ManaMixBar
      pick={{ n: pending.n, label: pending.source, counts, ...(pending.colors ? { colors: pending.colors } : {}) }}
      onChange={setCounts}
      onDone={() => dispatch([{ type: "manaMix", player: HUMAN, counts }])}
    />
  );
}

/**
 * Kicker (CR 702.33): pay the kicker cost or not; with two kicker costs, either or both; with
 * multikicker, any number of times. Options your mana can't pay for are disabled.
 */
function KickPickBar({
  s,
  pick,
  onChange,
  onDone,
  onCancel,
}: {
  s: GameState;
  pick: KickPick;
  onChange: (chosen: number[]) => void;
  onDone: (kicks: number[]) => void;
  onCancel: () => void;
}) {
  const d = pick.draft;
  // "Kicker {X}. X can't be 0" (Thieving Skydiver): affordable with the smallest X allowed.
  const can = (kicks: number[]) => [undefined, 1].some((x) => planCast(s, HUMAN, d.objectId, undefined, d.modes, d.convoke ?? "auto", x, { ...(d.via ? { via: d.via } : {}), ...(kicks.length ? { kicks } : {}) }) !== null);
  const cancel = (
    <button className="ghost" onClick={onCancel}>
      Cancel
    </button>
  );
  if (pick.multi) {
    const n = pick.chosen.length;
    const set = (k: number) => onChange(Array(Math.max(0, k)).fill(0) as number[]);
    return (
      <div className="targeting x-pick">
        <span>
          <strong>{pick.label}</strong>: {pick.name} {pick.text && !pick.costs[0] ? `(${pick.text})` : <ManaCost cost={pick.costs[0]!} size="sm" />}, how many times?
        </span>
        <button className="ghost" disabled={n <= 0} onClick={() => set(n - 1)} aria-label="Kick one time fewer">
          −
        </button>
        <span className="kick-count">{n}</span>
        <button className="ghost" disabled={!can([...pick.chosen, 0])} onClick={() => set(n + 1)} aria-label="Kick one more time">
          +
        </button>
        <button onClick={() => onDone(pick.chosen)}>{n ? `${pick.name === "multikicker" ? "Kick" : "Pay"} ${n === 1 ? "once" : `${n} times`}` : pick.name === "multikicker" ? "Don't kick" : "Don't pay"}</button>
        {cancel}
      </div>
    );
  }
  // "As an additional cost to cast this spell, you may blight 1", "you may behold a Dragon": pay it or not.
  if (pick.name === "additional cost" && pick.text)
    return (
      <div className="targeting">
        <span>
          <strong>{pick.label}</strong>: as an additional cost, you may {pick.text}
        </span>
        <button disabled={!can([0])} onClick={() => onDone([0])}>
          {pick.text.charAt(0).toUpperCase() + pick.text.slice(1)}
        </button>
        <button onClick={() => onDone([])}>Don't</button>
        {cancel}
      </div>
    );
  if (pick.costs.length === 1)
    return (
      <div className="targeting">
        <span>
          <strong>{pick.label}</strong>: pay {pick.name} {pick.text ? `(${pick.text})` : <ManaCost cost={pick.costs[0]!} size="sm" />}?
        </span>
        <button disabled={!can([0])} onClick={() => onDone([0])}>
          {pick.name === "kicker" ? "Kick it" : `Pay ${pick.name}`}
        </button>
        <button onClick={() => onDone([])}>{pick.name === "kicker" ? "Don't kick" : "Don't pay"}</button>
        {cancel}
      </div>
    );
  const toggle = (i: number) => onChange(pick.chosen.includes(i) ? pick.chosen.filter((x) => x !== i) : [...pick.chosen, i].sort());
  return (
    <div className="targeting">
      <span>
        <strong>{pick.label}</strong>: pay either kicker, both, or neither
      </span>
      {pick.costs.map((c, i) => (
        <button key={c} className={pick.chosen.includes(i) ? "" : "ghost"} disabled={!pick.chosen.includes(i) && !can([...pick.chosen, i])} onClick={() => toggle(i)} aria-pressed={pick.chosen.includes(i)}>
          <ManaCost cost={c} size="sm" />
        </button>
      ))}
      <button onClick={() => onDone(pick.chosen)}>{pick.chosen.length ? "Cast kicked" : "Don't kick"}</button>
      {cancel}
    </div>
  );
}

/** Sacrificing as an additional cost (CR 601.2h): click the permanents to sacrifice. */
function CostPickBar({ pick, valid = true, onDone, onSkip, onCancel }: { pick: CostPick; valid?: boolean; onDone: () => void; onSkip?: () => void; onCancel: () => void }) {
  return (
    <div className="targeting">
      <span>
        <strong>{pick.label}</strong>: {pick.what} (click {pick.n === 1 ? "it" : "them"})
      </span>
      <button disabled={pick.chosen.length !== pick.n || !valid} onClick={onDone}>
        {pick.kind === "conspire" ? "Tap and cast" : pick.kind === "counterOn" ? `${pick.what.startsWith("blight") ? "Blight" : "Put the counter"} and ${pick.draft ? "cast" : "activate"}` : pick.kind === "returnToHand" ? (pick.faceUp ? "Return and turn face up" : pick.activate ? "Return and activate" : "Return and cast") : pick.kind === "tap" ? (pick.mana ? "Tap for mana" : pick.draft ? "Tap and cast" : pick.untap ? "Untap and activate" : "Tap and activate") : pick.ignore ? "Sacrifice" : `${pick.exile ? "Exile" : "Sacrifice"} and ${pick.faceUp ? "turn face up" : pick.activate ? "activate" : "cast"}`}
      </button>
      {onSkip && <button onClick={onSkip}>Cast without</button>}
      <button className="ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** Picking cards to pay a cost with: to discard from your hand, or to exile from your graveyard. */
function CardChoice({
  s,
  title,
  cards,
  chosen,
  n,
  min,
  valid = true,
  onHover,
  onToggle,
  onDone,
  onCancel,
}: {
  s: GameState;
  title: string;
  cards: string[];
  chosen: string[];
  n: number;
  /** "Up to n": fewer are fine, down to this many. */
  min?: number;
  /** False while the cards chosen don't make up the cost (Foil's "an Island card and another card"). */
  valid?: boolean;
  onHover: (d: CardDef | null) => void;
  onToggle: (id: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <strong>{title}</strong>
          <span className="muted"> chosen {chosen.length} of {min === undefined ? n : `up to ${n}`}</span>
          <button disabled={!valid || (min === undefined ? chosen.length !== n : chosen.length < min || chosen.length > n)} onClick={onDone}>
            Done
          </button>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <div className="modal-cards">
          {cards.map((id) => {
            const d = cardOf(s, id);
            // A card in exile face down that you may not look at (CR 406.3): its back, and whose it is.
            if (hiddenInExile(s.objects[id]!, HUMAN))
              return (
                <div key={id} className={`card big back ${chosen.includes(id) ? "selected" : "targetable"}`} data-pick={id} onClick={() => onToggle(id)}>
                  <div className="back-design" />
                  <span className="zone-label">{`${s.players[s.objects[id]!.owner]!.name}'s, face down`}</span>
                </div>
              );
            return (
              <div key={id} className={`card big ${chosen.includes(id) ? "selected" : "targetable"}`} data-pick={id} onClick={() => onToggle(id)} {...hoverProps(d, onHover)}>
                <CardFace d={d} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A number to choose secretly (Wheel of Misfortune), a bid of life (Illicit Auction: "Don't bid" passes), life paid round after round (Plague of Vermin: "Pay no life"), or how much life or energy to pay (Necrodominance, Galvanic Discharge, Minion of the Wastes as it enters), or the X of "you may collect evidence X" (Incinerator of the Guilty): any whole number in the range the decision allows. */
function NumberChoice({ pending, dispatch }: { pending: Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>; dispatch: ReturnType<typeof useGame>["dispatch"] }) {
  const range = pending.numberRange ?? { min: 0, max: 999 };
  const [n, setN] = useState(range.min);
  const set = (x: number) => setN(Math.max(range.min, Math.min(range.max, Math.floor(x) || 0)));
  const done = () => dispatch([{ type: "chooseOption", player: HUMAN, choice: String(n) }]);
  return (
    <div className="controls number-pick">
      <span>
        <strong>{pending.source}:</strong> {pending.prompt}
      </span>
      <button className="ghost" disabled={n <= range.min} onClick={() => set(n - 1)} aria-label="Number minus one">
        −
      </button>
      <input type="number" min={range.min} max={range.max} value={n} autoFocus onChange={(e) => set(Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && done()} aria-label="Number" />
      <button className="ghost" disabled={n >= range.max} onClick={() => set(n + 1)} aria-label="Number plus one">
        +
      </button>
      <button onClick={done}>{pending.what === "payLife" || pending.what === "lifeAsEnters" || pending.what === "payLifeRound" ? `Pay ${n} life` : pending.what === "payEnergy" ? `Pay ${n} energy` : pending.what === "evidenceX" ? `Collect evidence ${n}` : pending.what === "bid" ? `Bid ${n} life` : `Choose ${n}`}</button>
      {pending.what === "bid" && pending.options.includes("pass") && (
        <button className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: "pass" }])}>
          Don't bid
        </button>
      )}
      {pending.what === "evidenceX" && (
        <button className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: "none" }])}>
          Don't collect evidence
        </button>
      )}
      {pending.what === "payLifeRound" && (
        <button className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: "0" }])}>
          Pay no life
        </button>
      )}
    </div>
  );
}

/** "The color or colors of your choice" (CR 105.3): toggle one or more colors, then Done. */
function ColorsPick({ pending, dispatch }: { pending: Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>; dispatch: ReturnType<typeof useGame>["dispatch"] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const colors = (Object.keys(COLOR_NAMES) as (keyof typeof COLOR_NAMES)[]).filter((c) => pending.options.includes(COLOR_NAMES[c]));
  const toggle = (name: string) => setPicked((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  // In WUBRG order, whatever order they were clicked in.
  const choice = colors.map((c) => COLOR_NAMES[c]).filter((n) => picked.includes(n));
  return (
    <div className="controls color-pick">
      <span>
        <strong>{pending.source}:</strong> choose one or more colors
      </span>
      {colors.map((c) => (
        <button key={c} className={picked.includes(COLOR_NAMES[c]) ? "" : "ghost"} aria-pressed={picked.includes(COLOR_NAMES[c])} title={COLOR_NAMES[c]} onClick={() => toggle(COLOR_NAMES[c])}>
          <ManaCost cost={`{${c}}`} size="sm" /> {COLOR_NAMES[c]}
        </button>
      ))}
      <button disabled={!choice.length} onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: choice.join(",") }])}>
        Done
      </button>
    </div>
  );
}

/** Cards from your graveyard to collect evidence N with (CR 701.59a): Done once their mana values add up to N or more. */
/** "Distribute X +1/+1 counters among any number of creatures you control": − and + for each, until all are given out. */
function DistributeChoice({
  s,
  pending,
  dispatch,
  onHover,
}: {
  s: GameState;
  pending: Extract<NonNullable<GameState["pending"]>, { kind: "distribute" }>;
  dispatch: ReturnType<typeof useGame>["dispatch"];
  onHover: (d: CardDef | null) => void;
}) {
  const [parts, setParts] = useState<Record<string, number>>({});
  const given = Object.values(parts).reduce((a, n) => a + n, 0);
  const left = pending.total - given;
  const set = (id: string, n: number) => setParts({ ...parts, [id]: Math.max(0, n) });
  return (
    <div className="controls">
      <span>
        <strong>{pending.source}:</strong>{" "}
        {pending.remove ? `remove up to ${pending.total} ${pending.counter} counter${pending.total > 1 ? "s" : ""} from among ${pending.what}, if you want (${left} left)` : pending.move ? `move up to ${pending.total} ${pending.counter} counter${pending.total > 1 ? "s" : ""} from it onto ${pending.what}, if you want (${left} left)` : `distribute ${pending.total} ${pending.counter} counter${pending.total > 1 ? "s" : ""} among any number of ${pending.what} (${left} left)`}
      </span>
      {pending.options.map((id) => {
        const n = parts[id] ?? 0;
        const d = cardOf(s, id);
        return (
          <span key={id} className="divide" data-distribute={id} onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)}>
            {d.name}
            {pending.remove ? ` (${pending.has?.[id] ?? 0})` : ""}{" "}
            <button className="ghost" disabled={n <= 0} onClick={() => set(id, n - 1)}>
              −
            </button>
            <strong>{n}</strong>
            <button className="ghost" disabled={left <= 0 || (!!pending.remove && n >= (pending.has?.[id] ?? 0))} onClick={() => set(id, n + 1)}>
              +
            </button>
          </span>
        );
      })}
      <button disabled={pending.move || pending.remove ? left < 0 : left !== 0} onClick={() => dispatch([{ type: "distribute", player: HUMAN, parts }])}>
        Done
      </button>
    </div>
  );
}

/** Which counters pay "Remove three counters from among ... you control": a count for each kind on each permanent. */
function CounterChoice({
  s,
  title,
  n,
  candidates,
  onHover,
  onDone,
  onCancel,
}: {
  s: GameState;
  title: string;
  n: number;
  candidates: { id: string; kind: string; n: number }[];
  onHover: (d: CardDef | null) => void;
  onDone: (counters: { id: string; kind: string }[]) => void;
  onCancel: () => void;
}) {
  const [taken, setTaken] = useState<number[]>(() => candidates.map(() => 0));
  const total = taken.reduce((a, b) => a + b, 0);
  const set = (i: number, v: number) => setTaken(taken.map((t, j) => (j === i ? v : t)));
  return (
    <div className="modal-backdrop">
      <div className="modal counter-pick">
        <header>
          <strong>{title}</strong>
          <span className="muted">
            {" "}
            {total} of {n} chosen
          </span>
          <button disabled={total !== n} onClick={() => onDone(candidates.flatMap((c, i) => Array.from({ length: taken[i]! }, () => ({ id: c.id, kind: c.kind }))))}>
            Done
          </button>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <div className="modal-cards">
          {candidates.map((c, i) => {
            const d = cardOf(s, c.id);
            return (
              <div key={`${c.id}:${c.kind}`} className="counter-row" data-counter={`${c.id}:${c.kind}`}>
                <div className={`card big ${taken[i] ? "selected" : "targetable"}`} onClick={() => set(i, taken[i]! < c.n && total < n ? taken[i]! + 1 : 0)} {...hoverProps(d, onHover)}>
                  <CardFace d={d} />
                </div>
                <span>
                  <button className="ghost" disabled={!taken[i]} onClick={() => set(i, taken[i]! - 1)}>
                    −
                  </button>
                  <strong>
                    {taken[i]} / {c.n} {c.kind}
                  </strong>
                  <button className="ghost" disabled={taken[i]! >= c.n || total >= n} onClick={() => set(i, taken[i]! + 1)}>
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EvidenceChoice({
  s,
  title,
  n,
  cards,
  onHover,
  onDone,
  onSkip,
  onCancel,
}: {
  s: GameState;
  title: string;
  n: number;
  cards: string[];
  onHover: (d: CardDef | null) => void;
  onDone: (ids: string[]) => void;
  /** "You may": not collecting evidence at all. */
  onSkip?: () => void;
  onCancel?: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const total = evidenceValue(s, chosen);
  return (
    <div className="modal-backdrop">
      <div className="modal evidence-pick">
        <header>
          <strong>{title}</strong>
          <span className="muted"> total mana value {total} of {n}</span>
          <button disabled={total < n} onClick={() => onDone(chosen)}>
            Done
          </button>
          {onSkip && (
            <button className="ghost" onClick={onSkip}>
              Don&apos;t collect evidence
            </button>
          )}
          {onCancel && (
            <button className="ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
        </header>
        <div className="modal-cards">
          {cards.map((id) => {
            const d = cardOf(s, id);
            return (
              <div key={id} className={`card big ${chosen.includes(id) ? "selected" : "targetable"}`} data-pick={id} onClick={() => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])} {...hoverProps(d, onHover)}>
                <CardFace d={d} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TapPickBar({ s, pick, onDone, onSkip, onCancel }: { s: GameState; pick: TapPick; onDone: () => void; onSkip?: () => void; onCancel: () => void }) {
  const name = cardOf(s, pick.objectId).name;
  if (pick.kind === "teamwork") {
    const total = pick.chosen.reduce((n, id) => n + teamworkPower(s, id), 0);
    return (
      <div className="targeting teamwork-pick">
        <span title="An optional additional cost. Tapping creatures this way isn't a {T} cost, so summoning-sick creatures can help.">
          <strong>Teamwork {pick.n}:</strong> tap creatures with total power {pick.n} or more to cast {name} using teamwork (now {total})
        </span>
        <button disabled={total < pick.n || !canCastWithTaps(s, pick.objectId, pick.convoke, pick.chosen)} onClick={onDone}>
          Tap and cast
        </button>
        {onSkip && <button onClick={onSkip}>Cast without</button>}
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
  if (pick.kind === "harmonize") {
    const tapped = pick.chosen[0];
    const off = tapped ? Math.max(0, power(s, s.objects[tapped]!)) : 0;
    return (
      <div className="targeting harmonize-pick">
        <span title="Tapping a creature this way isn't a {T} cost, so a summoning-sick creature can do it.">
          <strong>Harmonize:</strong> you may tap an untapped creature you control to cast {name} for less, by its power{tapped ? ` (${cardOf(s, tapped).name}: {${off}} less)` : ""}
        </span>
        <button disabled={!tapped} onClick={onDone}>
          Tap and cast
        </button>
        {onSkip && <button onClick={onSkip}>Cast without</button>}
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
  if (pick.kind === "crew") {
    const total = pick.chosen.reduce((n, id) => n + crewPower(s, s.objects[id]!, pick.saddle), 0);
    const verb = pick.saddle ? "Saddle" : "Crew";
    return (
      <div className="targeting">
        <span>
          <strong>
            {verb} {name}:
          </strong>{" "}
          tap creatures with total power {pick.n} (now {total})
        </span>
        <button disabled={total < pick.n} onClick={onDone}>
          {verb}
        </button>
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
  if (pick.kind === "station") {
    const tapped = pick.chosen[0] ? s.objects[pick.chosen[0]] : undefined;
    return (
      <div className="targeting">
        <span title="Put charge counters equal to the tapped creature's power on it. Station only as a sorcery.">
          <strong>Station {name}:</strong> tap another creature you control{tapped ? ` (${cardOf(s, tapped.id).name}, ${Math.max(0, power(s, tapped))} charge counters)` : ""}
        </span>
        <button disabled={!tapped} onClick={onDone}>
          Station
        </button>
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
  const d = cardOf(s, pick.objectId);
  const o = s.objects[pick.objectId]!;
  const tax = o.zone === "command" ? commanderTax(s.players[HUMAN]!, o, d) : 0;
  const ok = canCastWithTaps(s, pick.objectId, pick.chosen);
  return (
    <div className="targeting">
      <span title="Each creature you tap pays for {1} or one mana of its color.">
        <strong>Convoke {name}</strong> <ManaCost cost={d.manaCost} size="sm" />
        {tax ? ` + ${tax} tax` : ""}: tap creatures to help pay
      </span>
      <button disabled={!ok} onClick={onDone}>
        {pick.chosen.length ? `Cast, tapping ${pick.chosen.length}` : "Cast with mana"}
      </button>
      <button className="ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

interface CardProps {
  s: GameState;
  targetable: (id: string) => boolean;
  /** Can be declared as an attacker or blocker right now. */
  ready?: (o: GameObject) => boolean;
  onClick: (o: GameObject, e?: React.MouseEvent) => void;
  onHover: (d: CardDef | null) => void;
  attacks: Record<string, AttackTo>;
  blocks: Record<string, string[]>;
  blocker: string | null;
  discards: string[];
}

function CardView(props: CardProps & { o: GameObject; playable?: boolean }) {
  const { o, s } = props;
  const attached = o.zone === "battlefield" ? s.battlefield.map((id) => s.objects[id]!).filter((a) => a.attachedTo === o.id) : [];
  if (!attached.length) return <SingleCard {...props} />;
  // Attachments peek out above the permanent they're attached to.
  return (
    <div className="attach-group" style={{ ["--n" as string]: attached.length }}>
      {attached.map((a, i) => (
        <div key={a.id} className="attached" style={{ ["--i" as string]: i }}>
          <SingleCard {...props} o={a} playable={false} />
        </div>
      ))}
      <SingleCard {...props} />
    </div>
  );
}

function SingleCard({ o, s, onClick, onHover, attacks, blocks, blocker, discards, playable, targetable, ready }: CardProps & { o: GameObject; playable?: boolean }) {
  const d = cardOf(s, o.id);
  const seen = seenCardOf(s, o.id);
  const classes = ["card"];
  if (o.tapped) classes.push("tapped");
  if (o.zone === "battlefield" && targetable(o.id)) classes.push("targetable");
  if (playable || (o.zone === "battlefield" && ready?.(o))) classes.push("playable");
  if (o.id in attacks || o.attacking !== undefined) classes.push("attacking");
  if (o.id in blocks || o.blocking) classes.push("blocking");
  if (blocker === o.id || discards.includes(o.id)) classes.push("selected");
  if (o.zone === "battlefield" && isCreature(s, o.id) && isSummoningSick(s, o)) classes.push("sick");
  const onField = o.zone === "battlefield";
  return (
    <div className={`slot ${o.tapped ? "slot-tapped" : ""}`}>
      <div className={classes.join(" ")} data-obj={o.id} onClick={(e) => onClick(o, e)} {...hoverProps(seen, onHover)}>
        <CardFace d={d} peek={seen !== d ? seen : undefined} />
        {onField && <Modified s={s} o={o} />}
        {o.attacking !== undefined && <span className="badge attack-badge">→ {attackedName(s, o)}</span>}
      </div>
    </div>
  );
}

/** Hovering a card shows it large next to the mouse (see HoverCard). */
const hoverProps = (d: CardDef, onHover: (d: CardDef | null) => void) => ({
  onMouseEnter: () => onHover(d),
  onMouseLeave: () => onHover(null),
});

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * What effects have done to a permanent: granted keywords across the top, counters and
 * temporary bonuses as chips, and the current power/toughness, colored when it differs
 * from the printed value (green when higher, red when lower).
 */
function Modified({ s, o }: { s: GameState; o: GameObject }) {
  const m = modifications(s, o);
  const c = characteristics(s, o);
  const creature = isCreature(s, o.id);
  const tone = (now: number, printed: number) => (now > printed ? "up" : now < printed ? "down" : "");
  const effects = m.effectPower !== 0 || m.effectToughness !== 0;
  const describe = (p: PTPart) =>
    p.kind === "set"
      ? `${p.source}: base ${p.power}/${p.toughness}`
      : p.kind === "switch"
        ? `${p.source}: switched to ${p.power}/${p.toughness}`
        : `${p.source}: ${signed(p.power)}/${signed(p.toughness)}`;
  const tip = [
    `Printed ${c.printedPower}/${c.printedToughness}`,
    ...m.pt.map((p) => describe(p) + (p.untilEndOfTurn ? " (until end of turn)" : "")),
    o.damage ? `${o.damage} damage marked` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const stolen = c.controller !== o.owner;
  const paired = pairedWith(s, o);
  const haunts = hauntedBy(s, o);
  // A copy (CR 707): it looks like what it copies, so say what it really is.
  const copying = !o.faceDown && cardIdOf(o) !== o.cardId ? cardOf(s, o.id) : undefined;
  const copyEnds = o.copyEffects?.[o.copyEffects.length - 1]?.until;
  const chosen = chosenText(s, o);
  return (
    <>
      {(m.grantedKeywords.length > 0 || m.grantedAbilities.length > 0 || m.lostKeywords.length > 0 || m.lostAllAbilities) && (
        <span className="kw-overlay">
          {m.lostAllAbilities && <span className="kw none">No abilities</span>}
          {m.grantedKeywords.map((k) => (
            <span key={k} className="kw">
              {keywordLabel(k, (x) => s.players[x]!.name)}
            </span>
          ))}
          {m.grantedAbilities.length > 0 && (
            <span className="kw" title={m.grantedAbilities.map((t) => `Has "${showGrantSource(t).replace(/~/g, c.name)}"`).join("\n")}>
              +{m.grantedAbilities.length} {m.grantedAbilities.length === 1 ? "ability" : "abilities"}
            </span>
          )}
          {!m.lostAllAbilities &&
            m.lostKeywords.map((k) => (
              <span key={k} className="kw lost" title={`Lost ${k.toLowerCase()}`}>
                {k}
              </span>
            ))}
        </span>
      )}
      {stolen && <span className="owner-badge" title={`Controlled by ${s.players[c.controller]!.name}, owned by ${s.players[o.owner]!.name}`}>{s.players[o.owner]!.name}'s</span>}
      <span className="chips">
        {m.plusCounters !== 0 && (
          <span className={`chip counter ${m.plusCounters < 0 ? "minus" : ""}`} title={`${Math.abs(m.plusCounters)} ${m.plusCounters > 0 ? "+1/+1" : "-1/-1"} counter(s)`}>
            {signed(m.plusCounters)}/{signed(m.plusCounters)}
          </span>
        )}
        {creature && effects && (
          <span className={`chip ${m.temporary ? "temp" : "static"}`} title={tip}>
            {signed(m.effectPower)}/{signed(m.effectToughness)}
          </span>
        )}
        {Object.entries(m.otherCounters).filter(([k]) => !(k === "loyalty" && c.types.includes("Planeswalker")) && !(k === "defense" && c.types.includes("Battle"))).map(([k, n]) => (
          <span key={k} className="chip other" title={`${n} ${k} counter(s)`}>
            {n} {k}
          </span>
        ))}
        {(o.regenShields ?? 0) > 0 && (
          <span className="chip shield" title="Regeneration shield: the next time it would be destroyed this turn, it's tapped and removed from combat instead.">
            Regen{o.regenShields! > 1 ? ` ×${o.regenShields}` : ""}
          </span>
        )}
        {(o.redirectNext ?? []).map((r) => (
          <span key={r.id} className="chip shield" title={`${r.source}: the next ${r.n} damage that would be dealt to it this turn is dealt to ${"object" in r.to ? (s.objects[r.to.object] ? cardOf(s, r.to.object).name : "a creature that's gone") : s.players[r.to.player]!.name} instead.`}>
            Redirect {r.n}
          </span>
        ))}
        {(o.preventNext ?? 0) > 0 && (
          <span className="chip shield" title={`The next ${o.preventNext} damage that would be dealt to it this turn is prevented.`}>
            Prevent {o.preventNext}
          </span>
        )}
        {o.merged && o.melded && (
          <span className="chip other" title={`Melded: ${o.merged.parts.map((id) => s.cards[s.objects[id]!.cardId]!.name).join(" and ")}, one permanent with the characteristics of their combined back face. If it leaves the battlefield, both cards go there.`}>
            Melded
          </span>
        )}
        {o.merged && !o.melded && (
          <span className="chip other" title={`Mutated ${o.mutations ?? 1} time${(o.mutations ?? 1) === 1 ? "" : "s"}: ${o.merged.parts.map((id) => s.cards[s.objects[id]!.cardId]!.name).join(", ")}, top to bottom. It has the top card's characteristics and every card's abilities.`}>
            Mutated
          </span>
        )}
        {paired && (
          <span className="chip other" title={`Paired with ${cardOf(s, paired.id).name} (soulbond).`}>
            Paired
          </span>
        )}
        {haunts.length > 0 && (
          <span className="chip other" title={`Haunted by ${haunts.map((h) => cardOf(s, h.id).name).join(" and ")}: when it dies, ${haunts.length === 1 ? "that card's" : "those cards'"} haunt abilities trigger.`}>
            Haunted
          </span>
        )}
        {o.saddled && (
          <span className="chip temp" title="Saddled until end of turn.">
            Saddled
          </span>
        )}
        {o.suspected !== undefined && (
          <span className="chip other" title="Suspected: it has menace and can't block, until it leaves the battlefield or stops being suspected.">
            Suspected
          </span>
        )}
        {o.solved && (
          <span className="chip other" title="Solved: this Case's Solved ability works now. It stays solved until it leaves the battlefield.">
            Solved
          </span>
        )}
        {o.prepared && (
          <span className="chip other" title="Prepared: you may cast the copy of its prepare spell from exile. Doing so unprepares it.">
            Prepared
          </span>
        )}
        {o.classLevel !== undefined && (
          <span className="chip other" title={`This Class is level ${o.classLevel}: it has the abilities of level ${o.classLevel} and below.`}>
            Level {o.classLevel}
          </span>
        )}
        {o.attachedToPlayer !== undefined && (
          <span className="chip other" title={`${s.players[controllerOf(s, o)]!.name}'s Aura, enchanting ${s.players[o.attachedToPlayer]!.name}.`}>
            On {s.players[o.attachedToPlayer]!.name}
          </span>
        )}
        {chosen && (
          <span className="chip other chosen" title={`Chosen: ${chosen}`}>
            {chosen}
          </span>
        )}
        {copying && (
          <span
            className={`chip ${copyEnds ? "temp" : "other"}`}
            title={`${realDefOf(s, o).name}, a copy of ${copying.name}${copyEnds === "endOfTurn" ? " until end of turn" : copyEnds ? ` until ${s.players[copyEnds.turnOf]!.name}'s next turn` : ""}.`}
          >
            Copy
          </span>
        )}
      </span>
      {c.types.includes("Battle") && o.protector !== undefined && s.players[o.protector] && (
        <span className="chip other protector" title={`${s.players[o.protector]!.name} protects it: they can block creatures attacking it, and everyone else can attack it (CR 310.9).`}>
          Protected by {s.players[o.protector]!.name}
        </span>
      )}
      {c.types.includes("Battle") && (
        <span className={`pt defense ${creature ? "with-pt" : ""}`} title={`Defense ${o.counters.defense ?? 0} (printed ${cardOf(s, o.id).defense ?? "?"})`}>
          {o.counters.defense ?? 0}
        </span>
      )}
      {c.types.includes("Planeswalker") && (
        <span className={`pt loyalty ${creature ? "with-pt" : ""}`} title={`Loyalty ${o.counters.loyalty ?? 0} (printed ${cardOf(s, o.id).loyalty ?? "?"})`}>
          {o.counters.loyalty ?? 0}
        </span>
      )}
      {creature && (
        <span className={`pt ${m.setOrSwitched ? "set" : ""}`} title={tip}>
          <b className={tone(c.power, c.printedPower)}>{c.power}</b>/<b className={tone(c.toughness, c.printedToughness)}>{c.toughness}</b>
          {o.damage > 0 && <em> −{o.damage}</em>}
        </span>
      )}
    </>
  );
}

/**
 * What was chosen for a permanent as it entered or by its abilities (CR 614.12): a creature type, a color, a player
 * (Sower of Discord's two), a card name, a number. A secretly chosen player shows only to its controller.
 */
function chosenText(s: GameState, o: GameObject): string {
  const ch = o.chosen;
  if (!ch) return "";
  const name = (pid: PlayerId) => s.players[pid]?.name ?? "?";
  const parts = [
    ch.type,
    ch.color && COLOR_NAMES[ch.color],
    ch.landType,
    ch.keyword,
    ch.cardType,
    ch.anchor,
    ch.name,
    ch.number !== undefined ? String(ch.number) : undefined,
    ...(ch.types ?? []),
    ...Object.entries(ch.colorsBy ?? {}).map(([pid, c]) => `${name(Number(pid))}: ${COLOR_NAMES[c]}`),
    ch.player !== undefined ? (ch.secret && controllerOf(s, o) !== HUMAN ? "a secret player" : name(ch.player)) : undefined,
    ...(ch.players ?? []).map(name),
  ];
  return [...new Set(parts.filter((x): x is string => !!x))].join(", ");
}

/** The card image, or a text frame when there's no image or it fails to load (offline). */
function CardFace({ d, peek }: { d: CardDef; /** Your own face-down card: what it really is (CR 708.5). */ peek?: CardDef }) {
  const [failed, setFailed] = useState(false);
  if (d.oracleId.startsWith("face-down"))
    return (
      <div className="card-text face-down-face" title={peek ? `Face down: ${peek.name}. Only you can see this.` : "A face-down 2/2 creature (morph or disguise)"}>
        <div className="ct-name">Face-down</div>
        <div className="ct-type">2/2 creature{d.keywords.includes("Ward") ? ", ward {2}" : ""}</div>
        {peek && <div className="ct-peek">{peek.name}</div>}
      </div>
    );
  if (d.imageUrl && !failed) return <img src={d.imageUrl} alt={d.name} loading="lazy" draggable={false} onError={() => setFailed(true)} />;
  return (
    <div className="card-text">
      <div className="ct-name">{d.name}</div>
      <ManaCost cost={d.manaCost} size="sm" />
      <div className="ct-type">{d.typeLine}</div>
    </div>
  );
}

/** Face-down card, used for libraries and opponents' hands. */
function CardBack({ count, label }: { count?: number; label?: string }) {
  return (
    <div className="card back">
      <div className="back-design" />
      {count !== undefined && <span className="zone-count">{count}</span>}
      {label && <span className="zone-label">{label}</span>}
    </div>
  );
}

/** Group identical permanents (same card, same tapped state) into overlapping stacks to save space. */
function groupPermanents(s: GameState, objs: GameObject[]): GameObject[][] {
  const groups = new Map<string, GameObject[]>();
  for (const o of objs) {
    const plain = o.attacking === undefined && !o.blocking && !s.battlefield.some((x) => s.objects[x]!.attachedTo === o.id);
    const key = isLand(s, o.id) && plain ? `${o.cardId}:${o.tapped}` : o.id;
    const g = groups.get(key);
    if (g) g.push(o);
    else groups.set(key, [o]);
  }
  return [...groups.values()];
}

function PermanentRow({ s, objs, cardProps, className }: { s: GameState; objs: GameObject[]; cardProps: CardProps; className: string }) {
  return (
    <div className={`row ${className}`}>
      {groupPermanents(s, objs).map((g) =>
        g.length === 1 ? (
          <CardView key={g[0]!.id} o={g[0]!} {...cardProps} />
        ) : (
          <div key={g[0]!.id} className="pile" style={{ ["--n" as string]: g.length }}>
            {g.map((o) => (
              <CardView key={o.id} o={o} {...cardProps} />
            ))}
            <span className="pile-count">×{g.length}</span>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Shrink a crowded battlefield's cards until everything fits, down to 55% of full size;
 * past that the battlefield scrolls. Re-fits after every game update and on resize.
 */
function useFitCards(s: GameState) {
  const ref = useRef<HTMLDivElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    for (let k = 1; ; k -= 0.075) {
      el.style.setProperty("--bf-card", `calc(clamp(62px, 5.4vw, 124px) * ${k.toFixed(3)})`);
      if (el.scrollHeight <= el.clientHeight + 1 || k <= 0.55) break;
    }
  };
  useLayoutEffect(fit, [s]);
  useEffect(() => {
    const ro = new ResizeObserver(fit);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return ref;
}

function Seat({
  s,
  pid,
  corner,
  waiting,
  targetable,
  onSelect,
  onViewZone,
  cardProps,
}: {
  s: GameState;
  pid: PlayerId;
  corner: Corner;
  waiting: boolean;
  targetable?: boolean;
  onSelect?: () => void;
  onViewZone: (zone: ZoneView["zone"]) => void;
  cardProps: CardProps;
}) {
  const p = s.players[pid]!;
  const yardPlayable = (pid === HUMAN || castsFromAnyGraveyard(s)) && !s.pending && p.graveyard.some((id) => graveyardOptions(s, id));
  const exilePlayableHere = !s.pending && p.exile.some((id) => exileOptions(s, id));
  // The top of a library is shown when it's revealed (CR 401.5), to you when you may look at it any time (Vizier of
  // the Menagerie), or when you may play it.
  const topCanPlay = pid === HUMAN && !s.pending && topPlayable(s, HUMAN).some((id) => (isLand(s, id) ? canPlayLand(s, id) : canCastWithTaps(s, id) || altCostsFor(s, HUMAN, s.objects[id]!).some((a) => canCastAlt(s, id, a.kind))));
  const topShown = topVisible(s, pid, HUMAN) || (pid === HUMAN && topPlayable(s, HUMAN).length > 0);
  // Auras and Equipment sit with whatever they're attached to, even in another player's area; a Curse with the
  // player it enchants.
  const onField = new Set(s.battlefield);
  const mine = s.battlefield
    .map((id) => s.objects[id]!)
    .filter((o) => (o.attachedToPlayer !== undefined ? o.attachedToPlayer === pid : controllerOf(s, o) === pid && !(o.attachedTo && onField.has(o.attachedTo))));
  const phasedOut = (s.phasedOut ?? []).filter((id) => s.objects[id]!.phased?.by === pid);
  const lands = mine.filter((o) => isLand(s, o.id));
  const others = mine.filter((o) => !isLand(s, o.id));
  const topOf = (ids: string[]) => (ids.length ? s.objects[ids[ids.length - 1]!] : undefined);
  const fitRef = useFitCards(s);
  const classes = ["seat", corner];
  if (pid === HUMAN) classes.push("me");
  if (s.activePlayer === pid) classes.push("active");
  if (p.lost) classes.push("lost");
  if (targetable) classes.push("targetable");
  if (onSelect && (pid !== HUMAN || targetable)) classes.push("clickable");
  return (
    <section className={classes.join(" ")} onClick={onSelect} data-seat={pid}>
      <header>
        <PlayerName s={s} pid={pid} waiting={waiting} />
        <span className="life">
          ♥ {p.life}
        </span>
        {(p.preventNext ?? 0) > 0 && (
          <span className="shield-note" title={`The next ${p.preventNext} damage that would be dealt to ${p.name} this turn is prevented.`}>
            🛡 {p.preventNext}
          </span>
        )}
        {s.monarch === pid && (
          <span className="monarch" title="The monarch: draws a card at the beginning of their end step. Deal combat damage to them to take it.">
            👑 Monarch
          </span>
        )}
        {s.initiative === pid && (
          <span className="monarch" title="The initiative: ventures into Undercity as they take it and at the beginning of their upkeep. Deal combat damage to them to take it.">
            🗝 Initiative
          </span>
        )}
        {p.dungeon && (
          <span
            className="monarch"
            title={`${p.dungeon.name}, in ${dungeonByName(p.dungeon.name)?.rooms[p.dungeon.room]?.name ?? "?"}. Rooms: ${(dungeonByName(p.dungeon.name)?.rooms ?? []).map((r) => `${r.name}: ${r.text}`).join(" | ")}${p.completedDungeons?.length ? `. Completed: ${p.completedDungeons.join(", ")}` : ""}`}
          >
            🏰 {dungeonByName(p.dungeon.name)?.rooms[p.dungeon.room]?.name}
          </span>
        )}
        {!p.dungeon && !!p.completedDungeons?.length && (
          <span className="monarch" title={`Completed dungeons: ${p.completedDungeons.join(", ")}`}>
            🏰 {p.completedDungeons.length} completed
          </span>
        )}
        {p.citysBlessing && (
          <span className="monarch blessing" title="The city's blessing (ascend): kept for the rest of the game.">
            🏙 City's blessing
          </span>
        )}
        {p.enduringStory && (
          <span className="monarch blessing" title="An enduring story (storied): kept for the rest of the game.">
            📜 Enduring story
          </span>
        )}
        {p.ring && (
          <span
            className="monarch"
            title={`The Ring has tempted ${p.name} ${p.ring.tempted} time${p.ring.tempted === 1 ? "" : "s"}. Their Ring-bearer is legendary and can't be blocked by creatures with greater power${p.ring.tempted >= 2 ? "; when it attacks, they draw then discard a card" : ""}${p.ring.tempted >= 3 ? "; a creature blocking it is sacrificed at end of combat" : ""}${p.ring.tempted >= 4 ? "; when it deals combat damage to a player, each opponent loses 3 life" : ""}.`}
          >
            💍 {p.ring.tempted}
            {ringBearer(s, pid) ? `: ${cardOf(s, ringBearer(s, pid)!.id).name}` : ""}
          </span>
        )}
        {(s.emblems ?? [])
          .filter((id) => s.objects[id]!.owner === pid)
          .map((id) => (
            <span key={id} className="monarch" data-emblem={id} title={`${cardOf(s, id).name} (in the command zone): ${cardOf(s, id).oracleText.replace(/~/g, "this emblem").replace(/\n/g, " ")}`}>
              ✦ Emblem: {cardOf(s, id).name.replace(/ emblem$/, "").split(",")[0]}
            </span>
          ))}
        {p.gained?.length ? (
          <span className="muted" title={`Until end of turn, ${p.name} has ${p.gained.map((k) => keywordLabel(k, (x) => s.players[x]!.name).toLowerCase()).join(" and ")}.`}>
            🛡 {p.gained.map((k) => keywordLabel(k, (x) => s.players[x]!.name)).join(", ")}
          </span>
        ) : null}
        {phasedOut.length > 0 && (
          <span className="muted" title={`Phased out (treated as though they don't exist until they phase in during their controller's untap step): ${phasedOut.map((id) => cardOf(s, id).name).join(", ")}`}>
            ◌ Phased out {phasedOut.length}
          </span>
        )}
        {p.skips?.length ? (
          <span className="muted" title={`Will skip: ${skipsText(p.skips)}.`}>
            ⏭ Skips {skipsText(p.skips)}
          </span>
        ) : null}
        {(p.energy ?? 0) > 0 && (
          <span className="energy" title={`${p.energy} energy counter${p.energy === 1 ? "" : "s"}, spent to pay {E} costs.`}>
            ⚡ {p.energy}
          </span>
        )}
        {(p.experience ?? 0) > 0 && (
          <span className="energy" title={`${p.experience} experience counter${p.experience === 1 ? "" : "s"}.`}>
            ★ XP {p.experience}
          </span>
        )}
        {(p.rad ?? 0) > 0 && (
          <span className="poison" title={`${p.rad} rad counter${p.rad === 1 ? "" : "s"}: at the beginning of their precombat main phase they mill that many cards, then lose 1 life and remove a rad counter for each nonland card milled.`}>
            ☢ {p.rad}
          </span>
        )}
        {p.speed !== undefined && (
          <span className="energy" title={`Speed ${p.speed}${p.speed === 4 ? " (max speed)" : ""}: it increases once on each of their turns when an opponent loses life. Max speed is 4.`}>
            🏁 {p.speed === 4 ? "Max speed" : `Speed ${p.speed}`}
          </span>
        )}
        {(p.poison ?? 0) > 0 && (
          <span className="poison" title="Poison counters: ten or more and this player loses.">
            ☠ {p.poison}
          </span>
        )}
        {!p.lost && !canGainLife(s, pid) && (
          <span
            className="poison"
            data-no-lifegain={pid}
            title={`${p.name} can't gain life ${p.cantGainLifeForGame ? "for the rest of the game" : p.lifeCantChange || p.lifeCantChangeTurn === s.turn ? "(their life total can't change)" : (s.noLifeGain ?? []).some((e) => e.turn === s.turn) ? "this turn" : "while a permanent says so"} (CR 119.7).`}
          >
            🚫♥ No life gain{p.cantGainLifeForGame ? " (game)" : ""}
          </span>
        )}
        {pid !== HUMAN &&
          (handRevealed(s, pid, HUMAN) || pid === YOU ? (
            <button className="hand-peek" data-hand={pid} onClick={(e) => (e.stopPropagation(), onViewZone("hand"))} title={pid === YOU && pid !== HUMAN ? "Your hand. Click to see it." : "This hand is revealed (Telepathy, Revelation). Click to see it."}>
              Hand {p.hand.length} 👁
            </button>
          ) : (
            <span className="muted" data-hand={pid}>
              Hand {p.hand.length}
            </span>
          ))}
        {p.lost && <span className="error">Out: {p.lossReason}</span>}
        <span className="pool-slot">{(pid === HUMAN || Object.values(p.manaPool).some((n) => n > 0)) && <ManaPoolView pool={p.manaPool} restricted={p.manaLots?.flatMap((l) => (l.only ? [{ mana: l.mana, n: l.n, only: l.only }] : []))} />}</span>
      </header>
      <div className="seat-body">
        <div className="zones" onClick={(e) => e.stopPropagation()}>
          <div className="zone">
            <div className="zone-title">Command</div>
            {p.command.length ? (
              p.command.map((id) => (
                <div key={id} className="zone-card">
                  <CardView o={s.objects[id]!} {...cardProps} playable={pid === HUMAN && canCastWithTaps(s, id)} />
                  <span className="small muted">Tax {commanderTaxLife(p, s.objects[id]!, cardOf(s, id)) ? `${commanderTaxLife(p, s.objects[id]!, cardOf(s, id))} life` : commanderTax(p, s.objects[id]!, cardOf(s, id))}</span>
                </div>
              ))
            ) : (
              <div className="zone-empty">on battlefield</div>
            )}
          </div>
          <div
            className={`zone${topCanPlay ? " has-options" : ""}`}
            title={
              topCanPlay
                ? "Library: you may play its top card. Click it to play it."
                : topShown
                  ? "Library: played with its top card revealed (CR 401.5)."
                  : "Library: hidden, in order. Only the number of cards is public (CR 401.2)."
            }
          >
            <div className="zone-title">Library{topCanPlay ? " ✦" : ""}</div>
            {!p.library.length ? (
              <div className="zone-empty">empty</div>
            ) : topShown ? (
              <div className="zone-card">
                <CardView o={s.objects[p.library[0]!]!} {...cardProps} playable={topCanPlay} />
                <span className="small muted">{p.library.length} cards</span>
              </div>
            ) : (
              <CardBack count={p.library.length} />
            )}
          </div>
          <div
            className={`zone clickable-zone${yardPlayable ? " has-options" : ""}`}
            data-graveyard={pid}
            onClick={() => onViewZone("graveyard")}
            title={yardPlayable ? "Graveyard: you can cast or use a card here (flashback, unearth...). Click to see them." : "Graveyard: public, newest on top. Click to see all."}
          >
            <div className="zone-title">Graveyard{yardPlayable ? " ✦" : ""}</div>
            <ZoneTop s={s} o={topOf(p.graveyard)} count={p.graveyard.length} onHover={cardProps.onHover} />
          </div>
          <div
            className={`zone clickable-zone${exilePlayableHere ? " has-options" : ""}`}
            onClick={() => onViewZone("exile")}
            title={exilePlayableHere ? "Exile: you may play a card here for now. Click to see them." : "Exile (formerly 'removed from the game'). Click to see all."}
          >
            <div className="zone-title">Exile{exilePlayableHere ? " ✦" : ""}</div>
            <ZoneTop s={s} o={topOf(p.exile)} count={p.exile.length} onHover={cardProps.onHover} />
          </div>
        </div>
        <div className="battlefield" ref={fitRef}>
          <PermanentRow s={s} objs={others} cardProps={cardProps} className="nonlands" />
          <PermanentRow s={s} objs={lands} cardProps={cardProps} className="lands" />
        </div>
      </div>
    </section>
  );
}

function ZoneTop({ s, o, count, onHover }: { s: GameState; o: GameObject | undefined; count: number; onHover: (d: CardDef | null) => void }) {
  if (!o) return <div className="zone-empty">empty</div>;
  // Someone else's foretold card is face down (CR 702.143a); a hideaway card, to those who haven't controlled its permanent
  // (CR 702.75a); a card exiled face down by Duplicity or Gustha's Scepter, to those who may not look (CR 406.3).
  if (o.foretold && o.owner !== HUMAN) return <CardBack count={count} label="Foretold" />;
  if (o.hiddenExile && !o.hiddenExile.seen.includes(HUMAN)) return <CardBack count={count} label={o.hiddenExile.label ?? "Hideaway"} />;
  const d = cardOf(s, o.id);
  return (
    <div className="card" data-obj={o.id} {...hoverProps(d, onHover)}>
      <CardFace d={d} />
      <span className="zone-count">{count}</span>
    </div>
  );
}

function ZoneViewer({
  s,
  view,
  onClose,
  onHover,
  canPick,
  onPick,
}: {
  s: GameState;
  view: ZoneView;
  onClose: () => void;
  onHover: (d: CardDef | null) => void;
  canPick: (id: string) => boolean;
  onPick: (id: string) => void;
}) {
  const p = s.players[view.pid]!;
  const ids = [...p[view.zone]].reverse(); // newest first
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>
            {view.pid === HUMAN || view.pid === YOU ? "Your" : `${p.name}'s`} {view.zone === "graveyard" ? "graveyard" : view.zone === "hand" ? (view.pid === YOU ? "hand" : "revealed hand") : "exile"}
          </strong>
          <span className="muted"> {ids.length} card(s){view.zone === "hand" ? "" : ", newest first"}</span>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="modal-cards">
          {ids.length === 0 && <span className="muted">Nothing here yet.</span>}
          {ids.map((id) => {
            const d = cardOf(s, id);
            const pickable = canPick(id);
            // Someone else's foretold card is face down; only its owner may look at it (CR 702.143a).
            if (s.objects[id]!.foretold && s.objects[id]!.owner !== HUMAN) return <CardBack key={id} label="Foretold" />;
            // Exiled face down with hideaway: only players who controlled its permanent may look (CR 702.75a).
            const hidden = s.objects[id]!.hiddenExile;
            if (hidden && !hidden.seen.includes(HUMAN)) return <CardBack key={id} label={hidden.label ?? "Hideaway"} />;
            return (
              <div
                key={id}
                className={`card big${pickable ? " playable" : ""}`}
                title={pickable ? `Click to ${view.zone === "exile" ? "play" : "cast or use"} it from ${view.pid === HUMAN ? "your " : ""}${view.zone}` : view.zone === "exile" && s.objects[id]!.mayPlay?.player === HUMAN ? "You may play this card for now" : undefined}
                onClick={pickable ? () => onPick(id) : undefined}
                {...hoverProps(d, onHover)}
              >
                <CardFace d={d} />
                {view.zone === "exile" && s.objects[id]!.foretold && (
                  <span className="zone-tag" title={`Foretold: only you can see it. On a later turn, cast it for ${foretellCostOf(s, s.objects[id]!, d) ?? "its foretell cost"}.`}>
                    foretold
                  </span>
                )}
                {view.zone === "exile" && hidden && (
                  <span className="zone-tag" title={`Exiled face down${hidden.label ? "" : " with hideaway"}: ${hidden.seen.length === 1 ? "only you" : "you"} can see it.`}>
                    {hidden.label ? hidden.label.toLowerCase() : "hideaway"}
                  </span>
                )}
                {view.zone === "exile" && s.objects[id]!.mayPlay?.until === "adventure" && s.objects[id]!.mayPlay?.player === HUMAN && (
                  <span className="zone-tag" title="It went on an adventure: you may cast it from exile (not as an Adventure again).">
                    on an adventure
                  </span>
                )}
                {view.zone === "exile" && !!s.objects[id]!.counters.time && (
                  <span className="zone-tag" title="Suspended: one time counter comes off in each of its owner's upkeeps">
                    {s.objects[id]!.counters.time} time counter{s.objects[id]!.counters.time === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Choosing a target card in a graveyard ("target creature card from your graveyard",
 * CR 109.2a), or in exile linked to the source ("target creature card exiled with ~", CR 607.2a). Only the legal
 * choices are shown, grouped by whose graveyard (or cards) they are.
 */
function GraveyardPicker({
  s,
  label,
  spec,
  sourceId,
  allowed,
  onSkip,
  onHover,
  onPick,
  onCancel,
}: {
  s: GameState;
  label: string;
  spec: TargetSpec;
  /** The ability's source: "with mana value less than or equal to this creature's power" is counted from it. */
  sourceId?: string;
  /** Also left out: one already chosen for another of the same targets. */
  allowed: (id: string) => boolean;
  /** For an "up to" target: choose no more. */
  onSkip?: () => void;
  onHover: (d: CardDef | null) => void;
  onPick: (id: string) => void;
  onCancel?: () => void;
}) {
  const legal = legalTargets(s, spec, HUMAN, undefined, undefined, sourceId)
    .map((t) => t.id as string)
    .filter(allowed);
  // Grouped by owner and zone: Sorceress's Schemes offers graveyard and exiled cards together (TargetSpec.orExile).
  const groupOf = (id: string) => `${s.objects[id]!.owner}:${s.objects[id]!.zone === "exile" ? "exile" : "graveyard"}`;
  const owners = [...new Set(legal.map(groupOf))];
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <strong>{label}</strong>
          <span className="muted">
            {" "}
            choose {spec.text}
            {spec.optional ? " (optional)" : ""}
          </span>
          {onSkip && <button onClick={onSkip}>Done</button>}
          {onCancel && <button onClick={onCancel}>Cancel</button>}
        </header>
        {owners.length === 0 && <span className="muted">No legal targets.</span>}
        <div className="modal-body">
          {owners.map((g) => {
            const [pidText, zone] = g.split(":");
            const pid = Number(pidText);
            return (
              <div key={g}>
                <h4>{zone === "exile" ? (pid === HUMAN ? "Your cards in exile" : `${s.players[pid]!.name}'s cards in exile`) : pid === HUMAN ? "Your graveyard" : `${s.players[pid]!.name}'s graveyard`}</h4>
                <div className="modal-cards">
                  {legal
                    .filter((id) => groupOf(id) === g)
                    .map((id) => {
                      const d = cardOf(s, id);
                      return (
                        <div key={id} className="card big targetable" data-pick={id} onClick={() => onPick(id)} {...hoverProps(d, onHover)}>
                          <CardFace d={d} />
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Scry or surveil (CR 701.22, 701.25): look at the top cards of your library, then put any
 * number back on top in any order and the rest on the bottom (scry) or into your graveyard
 * (surveil). Clicking a card moves it between the two rows; the arrows reorder the top row,
 * whose leftmost card ends up on top. Also used to arrange cards put into your graveyard at the
 * same time (CR 404.3), or all of it ("reorder your graveyard as you choose").
 */
/** Lim-Dûl's Vault: the cards looked at, and whether to pay life to put them on the bottom and look at the next ones. */
function VaultLook({ s, source, cards, life, onHover, onDone }: { s: GameState; source: string; cards: string[]; life: number; onHover: (d: CardDef | null) => void; onDone: (yes: boolean) => void }) {
  const canPay = s.players[HUMAN]!.life >= life;
  return (
    <div className="modal-backdrop">
      <div className="modal arrange vault-look">
        <header>
          <strong>{source}: the top {cards.length === 1 ? "card" : `${cards.length} cards`} of your library</strong>
          <button disabled={!canPay} onClick={() => onDone(true)}>
            Pay {life} life: bottom, look again
          </button>
          <button className="ghost" onClick={() => onDone(false)}>
            Keep these on top
          </button>
        </header>
        <div className="modal-body">
          <div className="modal-cards arrange-row">
            {cards.map((id) => {
              const d = cardOf(s, id);
              return (
                <div key={id} className="arrange-card">
                  <div className="card big" data-vault={id} {...hoverProps(d, onHover)}>
                    <CardFace d={d} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArrangeTop({
  s,
  how,
  owner,
  source,
  cards,
  onHover,
  onDone,
}: {
  s: GameState;
  how: "scry" | "surveil" | "order" | "bottom" | "look" | "graveyard" | "wholeGraveyard" | "libraryTop";
  /** Whose library, when it isn't yours. */
  owner?: string;
  source: string;
  cards: string[];
  onHover: (d: CardDef | null) => void;
  onDone: (top: string[], away: string[]) => void;
}) {
  const [top, setTop] = useState<string[]>(cards);
  const [away, setAway] = useState<string[]>([]);
  const awayName = how === "scry" ? "Bottom of library" : "Graveyard";
  const together = how !== "scry" && how !== "surveil"; // they all go back together
  const toggle = (id: string) => {
    if (together) return;
    if (top.includes(id)) {
      setTop(top.filter((x) => x !== id));
      setAway([...away, id]);
    } else {
      setAway(away.filter((x) => x !== id));
      setTop([...top, id]);
    }
  };
  const move = (ids: string[], set: (ids: string[]) => void, i: number, by: number) => {
    const next = [...ids];
    const [id] = next.splice(i, 1);
    next.splice(i + by, 0, id!);
    set(next);
  };
  // The cards for the bottom are ordered too (CR 401.4): the rightmost ends up at the very bottom.
  const row = (ids: string[], ordered: boolean, set: (ids: string[]) => void = setTop, bottom = false) => (
    <div className="modal-cards arrange-row">
      {ids.length === 0 && <span className="muted">No cards.</span>}
      {ids.map((id, i) => {
        const d = cardOf(s, id);
        return (
          <div key={id} className="arrange-card">
            <div className="card big" data-arrange={id} onClick={() => toggle(id)} {...hoverProps(d, onHover)} title={together ? undefined : "Click to move to the other row"}>
              <CardFace d={d} />
            </div>
            {ordered && ids.length > 1 && (
              <div className="arrange-order">
                <button className="ghost" disabled={i === 0} onClick={() => move(ids, set, i, -1)} aria-label="Move toward the top">
                  ◀
                </button>
                <span>{bottom ? (i === ids.length - 1 ? "Bottom" : `#${i + 1}`) : i === 0 ? "Top" : `#${i + 1}`}</span>
                <button className="ghost" disabled={i === ids.length - 1} onClick={() => move(ids, set, i, 1)} aria-label="Move deeper">
                  ▶
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="modal-backdrop">
      <div className="modal arrange">
        <header>
          <strong>
            {source}:{" "}
            {how === "look"
              ? `the top ${cards.length === 1 ? "card" : `${cards.length} cards`} of ${owner ? `${owner}'s` : "your"} library`
              : how === "order"
              ? `put the top ${cards.length} cards of ${owner ? `${owner}'s` : "your"} library back in any order`
              : how === "bottom"
                ? `put ${cards.length} cards on the bottom of ${owner ? `${owner}'s` : "your"} library in any order`
                : how === "libraryTop"
                ? `put these ${cards.length} cards on top of ${owner ? `${owner}'s` : "your"} library in any order`
                : how === "graveyard"
                  ? `put these ${cards.length} cards into your graveyard in any order`
                  : how === "wholeGraveyard"
                    ? "reorder your graveyard as you choose"
                    : how === "scry" && owner
                      ? cards.length === 1
                        ? `the top card of ${owner}'s library: leave it on top or put it on the bottom`
                        : `the top ${cards.length} cards of ${owner}'s library: leave any on top and put the rest on the bottom, in any order`
                      : `${how} ${cards.length}`}
          </strong>
          {how !== "look" && <span className="muted">{together ? " Use the arrows to order them." : " Click a card to move it between rows."}</span>}
          <button onClick={() => onDone(top, away)}>Done</button>
        </header>
        <div className="modal-body">
          <h4>
            {how === "bottom"
              ? "Bottom of library (rightmost at the very bottom)"
              : how === "graveyard" || how === "wholeGraveyard"
                ? "Top of graveyard (leftmost on top)"
                : "Top of library (leftmost on top)"}
          </h4>
          {row(top, how !== "look", setTop, how === "bottom")}
          {!together && (
            <>
              <h4>{how === "scry" ? `${awayName} (rightmost at the very bottom)` : awayName}</h4>
              {row(away, how === "scry", setAway, true)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Searching your library (CR 701.23). Only the cards that match are shown, copies of a card
 * grouped together; click a card to find one, click a found card to put it back. Searching for a
 * kind of card, you may find fewer, even none (701.23b).
 */
/**
 * Naming a creature type (CR 205.3m): the types of creatures on the battlefield and in your hand
 * first, with how many each player has, then every type, narrowed by what you type.
 */
function TypePicker({
  s,
  pending,
  onDone,
}: {
  s: GameState;
  pending: Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
  onDone: (choice: string) => void;
}) {
  const [query, setQuery] = useState("");
  const counts = new Map<string, { yours: number; theirs: number; yard: number }>();
  const tally = (types: string[], whose: "yours" | "theirs" | "yard") =>
    types.forEach((t) => {
      if (!pending.options.includes(t)) return;
      const c = counts.get(t) ?? { yours: 0, theirs: 0, yard: 0 };
      c[whose]++;
      counts.set(t, c);
    });
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const ch = characteristics(s, o);
    if (ch.types.includes("Creature")) tally(ch.subtypes, ch.controller === HUMAN ? "yours" : "theirs");
  }
  for (const id of s.players[HUMAN]!.hand) {
    const d = cardOf(s, id);
    if (d.types.includes("Creature")) tally(d.subtypes, "yours");
  }
  // Haunting Voyage: "return up to two creature cards of that type from your graveyard".
  for (const id of s.players[HUMAN]!.graveyard) {
    const d = cardOf(s, id);
    if (d.types.includes("Creature")) tally(d.subtypes, "yard");
  }
  const total = (c: { yours: number; theirs: number; yard: number }) => c.yours + c.theirs + c.yard;
  const seen = [...counts].sort((a, b) => total(b[1]) - total(a[1]) || a[0].localeCompare(b[0]));
  const q = query.trim().toLowerCase();
  // Names that start with what was typed first ("el": Elf, Elk, ... then Angel, Camel).
  const matches = pending.options.filter((t) => t.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)));
  const exact = matches.find((t) => t.toLowerCase() === q) ?? (matches.length === 1 ? matches[0] : undefined);
  return (
    <div className="modal-backdrop">
      <div className="modal type-pick">
        <header>
          <strong>
            {pending.source}: {pending.what === "creatureType" ? "choose a creature type" : pending.prompt}
          </strong>
          <input
            autoFocus
            placeholder="Type to search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && exact && onDone(exact)}
          />
        </header>
        <div className="modal-body">
          {seen.length > 0 && !q && (
            <>
              <h4>On the battlefield, in your hand and in your graveyard</h4>
              <div className="type-list">
                {seen.map(([t, c]) => (
                  <button key={t} className="ghost" data-type={t} onClick={() => onDone(t)}>
                    {t}{" "}
                    <span className="muted small">
                      {[c.yours ? `${c.yours} yours` : "", c.theirs ? `${c.theirs} theirs` : "", c.yard ? `${c.yard} in your graveyard` : ""].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {/* Eclipsed Realms: only the eight types it names. */}
          <h4>{q ? `Types matching “${query.trim()}”` : pending.options.length <= 20 ? "The creature types it offers" : "All creature types"}</h4>
          <div className="type-list">
            {matches.length === 0 && <span className="muted">No creature type matches.</span>}
            {matches.map((t) => (
              <button key={t} className="ghost" data-type={t} onClick={() => onDone(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Choosing a card name (CR 201.4): Meddling Mage, Pithing Needle, Cabal Therapy. The names of cards you've seen (on the
 * battlefield, in graveyards, exile and command zones, in your hand) first, then a search over every name offered.
 */
function NamePicker({
  s,
  pending,
  onHover,
  onDone,
}: {
  s: GameState;
  pending: Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
  onHover: (d: CardDef | null) => void;
  onDone: (choice: string) => void;
}) {
  const [query, setQuery] = useState("");
  const offered = new Set(pending.options);
  const seen = new Map<string, { d: CardDef; where: Set<string> }>();
  const note = (id: string, where: string) => {
    const o = s.objects[id];
    if (!o || o.faceDown || o.isToken) return;
    const d = cardOf(s, id);
    if (!offered.has(d.name)) return;
    const e = seen.get(d.name) ?? { d, where: new Set<string>() };
    e.where.add(where);
    seen.set(d.name, e);
  };
  for (const id of s.battlefield) note(id, s.objects[id]!.controller === HUMAN ? "your battlefield" : "battlefield");
  for (const p of s.players) {
    for (const id of p.graveyard) note(id, "graveyard");
    for (const id of p.command) note(id, "command zone");
    for (const id of p.exile) note(id, "exile");
  }
  for (const id of s.players[HUMAN]!.hand) note(id, "your hand");
  const shown = [...seen].sort((a, b) => a[0].localeCompare(b[0]));
  const q = query.trim().toLowerCase();
  const matches = q ? pending.options.filter((n) => n.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)) || a.localeCompare(b)) : [];
  const exact = matches.find((n) => n.toLowerCase() === q) ?? (matches.length === 1 ? matches[0] : undefined);
  const about = pending.of !== undefined ? s.players[pending.of]?.name : undefined;
  return (
    <div className="modal-backdrop">
      <div className="modal type-pick">
        <header>
          <strong>
            {pending.source}: {pending.prompt ?? "choose a card name"}
            {about ? ` (about ${about}'s cards)` : ""}
          </strong>
          <input autoFocus placeholder="Type a card name…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && exact && onDone(exact)} />
        </header>
        <div className="modal-body">
          {q ? (
            <>
              <h4>Names matching “{query.trim()}”</h4>
              <div className="type-list">
                {matches.length === 0 && <span className="muted">No card in this game has a name like that.</span>}
                {matches.slice(0, 60).map((n) => (
                  <button key={n} className="ghost" data-name={n} onClick={() => onDone(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h4>Cards you've seen</h4>
              <div className="type-list">
                {shown.length === 0 && <span className="muted">Type to search for a name.</span>}
                {shown.map(([n, e]) => (
                  <button key={n} className="ghost" data-name={n} onClick={() => onDone(n)} {...hoverProps(e.d, onHover)}>
                    {n} <span className="muted small">{[...e.where].join(", ")}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Fact or Fiction (CR 700.3): the two piles side by side, and which one goes to the hand. */
function PilePicker({
  s,
  pending,
  onHover,
  onDone,
}: {
  s: GameState;
  pending: Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
  onHover: (d: CardDef | null) => void;
  onDone: (choice: string) => void;
}) {
  const whose = pending.of === HUMAN ? "your" : `${s.players[pending.of ?? 0]!.name}'s`;
  const faceDown = pending.pileMode === "faceDown";
  return (
    <div className="modal-backdrop">
      <div className="modal search">
        <header>
          <strong>{`${pending.source}: ${pending.prompt}`}</strong>
        </header>
        <div className="modal-body">
          {(pending.piles ?? [[], []]).map((pile, i) => (
            <div key={i} data-pile={i}>
              <h4>
                {faceDown ? (i === 0 ? "Face-down pile" : "Face-up pile") : `Pile ${i + 1}`} ({pile.length === 1 ? `1 ${pending.sacrificePile ? "permanent" : "card"}` : `${pile.length} ${pending.sacrificePile ? "permanents" : "cards"}`}){" "}
                <button onClick={() => onDone(String(i))}>{pending.destroyPile ? `Destroy pile ${i + 1}` : pending.sacrificePile ? `Sacrifice pile ${i + 1}` : pending.pileMode === "pickOne" ? `Choose pile ${i + 1}` : pending.pileMode === "battlefield" ? `Put pile ${i + 1} onto the battlefield` : faceDown ? `Put the ${i === 0 ? "face-down" : "face-up"} pile into ${whose} hand` : `Put pile ${i + 1} into ${whose} hand`}</button>
              </h4>
              <div className="modal-cards">
                {pile.length === 0 && <span className="muted">{pending.sacrificePile ? "No permanents" : "No cards"}</span>}
                {/* Atris: the face-down pile's cards stay hidden from the player choosing (rulings). */}
                {faceDown && i === 0 && pile.map((id) => <CardBack key={id} label="Face down" />)}
                {!(faceDown && i === 0) && pile.map((id) => {
                  const d = cardOf(s, id);
                  return (
                    <div key={id} className="card big" {...hoverProps(d, onHover)}>
                      <CardFace d={d} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LibrarySearch({
  s,
  pending,
  onHover,
  onDone,
}: {
  s: GameState;
  pending: Extract<NonNullable<GameState["pending"]>, { kind: "searchLibrary" }>;
  onHover: (d: CardDef | null) => void;
  onDone: (found: string[]) => void;
}) {
  const [found, setFound] = useState<string[]>([]);
  const groups = new Map<string, string[]>();
  // Looking at the top cards: all of them are shown, in order, and only the ones that qualify can be taken.
  const dig = pending.dig;
  // Memoricide's search of a player's graveyard, hand and library: the cards by the zone they're in.
  const zones = pending.zonesOf !== undefined;
  const ZONE_ORDER = ["graveyard", "hand", "library"];
  // "Exile a card from a graveyard" (Cemetery Prowler): cards of one name in different graveyards stay apart, by owner.
  const owned = (id: string) => (pending.anyGraveyard ? `${s.objects[id]!.owner}\u0000` : "");
  for (const id of dig ? [] : pending.cards) {
    const name = zones ? s.objects[id]!.zone : owned(id) + cardOf(s, id).name;
    groups.set(name, [...(groups.get(name) ?? []), id]);
  }
  const sorted = [...groups].sort((a, b) => (zones ? ZONE_ORDER.indexOf(a[0]) - ZONE_ORDER.indexOf(b[0]) : a[0].localeCompare(b[0])));
  const whose = zones ? s.players[pending.zonesOf!]!.name : "";
  // "Cards with different mana values" (Seasons Past): a card can't join one with the same mana value.
  const mvOf = (id: string) => manaValue(parseManaCost(cardOf(s, id).manaCost));
  // "Cards with different powers" (Rip, Spawn Hunter): a card can't join one with the same power.
  const powerOf = (id: string) => characteristics(s, s.objects[id]!).power;
  // "Basic land cards that share a land type" (Myriad Landscape): a card joins only ones it shares a land type with.
  // "A Forest card and a Plains card" (Krosan Verge): a card joins only if each found card can still be a different one.
  // "With total mana value 4 or less" (Lively Dirge): a card joins only if the total stays within it.
  const clashes = (id: string) => (pending.totalMv !== undefined && [...found, id].reduce((n, x) => n + mvOf(x), 0) > pending.totalMv) || (!!pending.distinctManaValues && found.some((f) => mvOf(f) === mvOf(id))) || (!!pending.distinctPowers && found.some((f) => powerOf(f) === powerOf(id))) || (!!pending.shareLandType && !shareLandType([...found, id].map((x) => cardOf(s, x)))) || (!!pending.oneName && found.some((f) => !sameName(cardOf(s, f).name, cardOf(s, id).name))) || (!!pending.oneOfEach && !oneOfEachFits(pending.oneOfEach, [...found, id].map((x) => cardOf(s, x))));
  const add = (ids: string[]) => {
    const next = ids.find((id) => !found.includes(id) && !clashes(id));
    if (next && found.length < pending.max) setFound([...found, next]);
  };
  const where = (i: number) => (pending.firstTo ? (i < (pending.firstN ?? 1) ? pending.firstTo : pending.othersTo) : null);
  return (
    <div className="modal-backdrop">
      <div className="modal search">
        <header>
          <strong>
            {pending.piles
              ? `${pending.source}: separate ${pending.forPlayer !== undefined ? `${s.players[pending.forPlayer]!.name}'s` : "your"} ${pending.exiled ? "exiled" : "revealed"} cards into two piles. Choose the cards for the first pile`
              : dig && (pending.hand !== undefined || pending.forPlayer !== undefined || pending.exiled)
              ? `${pending.source}: choose ${pending.what} ${dig.to}`
              : dig
              ? `${pending.source}: put ${pending.what} ${dig.to}`
              : pending.behold
                ? `${pending.source}: you may behold ${pending.what} (reveal one from your hand or choose one you control)`
              : pending.reveal
                ? `${pending.source}: ${pending.min ? "reveal" : "you may reveal"} ${pending.what} from your hand${pending.revealFor !== undefined ? `; ${pending.revealFor === HUMAN ? "you choose" : `${s.players[pending.revealFor]!.name} chooses`} one of them for you to discard` : ""}`
                : pending.bottom
                ? `${pending.source}: put ${pending.what} from your hand on the bottom of your library`
                : pending.fromHand && pending.shuffle
                ? `${pending.source}: shuffle ${pending.what} from your hand into your library`
                : pending.fromHand && pending.exile
                ? `${pending.source}: exile ${pending.what} from your hand`
                : pending.fromHand && pending.manifest
                ? `${pending.source}: ${pending.cloak ? "cloak" : "manifest"} ${pending.what} from your hand (each a face-down 2/2 creature${pending.cloak ? " with ward {2}" : ""})`
                : pending.fromHand && pending.swap
                ? `${pending.source}: you may exchange it with ${pending.what} from your hand (aura swap)`
                : pending.fromHand
                ? `${pending.source}: ${pending.min ? "put" : "you may put"} ${pending.what} from your hand onto the battlefield`
                : pending.fromGraveyard === "exile" && pending.copiedBy !== undefined
                  ? `${pending.source}: exile ${pending.what} from your graveyard. ${pending.copiedBy === pending.player ? "You copy it and may cast the copy" : `${s.players[pending.copiedBy]!.name} copies it and may cast the copy`} without paying its mana cost`
                : pending.fromGraveyard === "exile"
                  ? `${pending.source}: ${pending.min ? "exile" : "you may exile"} ${pending.what} from ${pending.anyGraveyard ? "a" : "your"} graveyard`
                  : pending.fromGraveyard === "battlefield" && pending.under !== undefined
                  ? `${pending.source}: put ${pending.what} from your graveyard onto the battlefield under ${s.players[pending.under]!.name}'s control`
                  : pending.fromGraveyard === "battlefield" && pending.anyGraveyard
                  ? `${pending.source}: put ${pending.what} from a graveyard onto the battlefield under your control`
                  : pending.fromGraveyard === "castThisTurn"
                  ? `${pending.source}: choose ${pending.what} in your graveyard; you may cast it this turn`
                  : pending.fromGraveyard === "libraryTop"
                  ? `${pending.source}: ${pending.min ? "put" : "you may put"} ${pending.what} from your graveyard on top of your library`
                  : pending.fromGraveyard === "libraryBottom"
                  ? `${pending.source}: put ${pending.what} from your graveyard on the bottom of your library`
                  : pending.fromGraveyard === "keep"
                  ? `${pending.source}: choose ${pending.what} in your graveyard to keep; the rest of your graveyard is exiled`
                  : pending.fromGraveyard
                  ? `${pending.source}: ${pending.min ? "return" : "you may return"} ${pending.what} from your graveyard to ${pending.fromGraveyard === "battlefield" ? "the battlefield" : "your hand"}`
                  : zones
                    ? `${pending.source}: search ${whose}'s graveyard, hand and library for ${pending.what} to exile`
                    : pending.controlling !== undefined
                    ? `${pending.source}: you control ${s.players[pending.controlling]!.name}'s search. Find ${pending.what} in their library`
                    : `${pending.source}: search your library for ${pending.what}`}
          </strong>
          <span className="muted">
            {" "}
            {pending.piles
              ? `The rest form the second pile. A pile may be empty. ${pending.forPlayer !== undefined ? `${s.players[pending.forPlayer]!.name} chooses one for their hand` : "An opponent chooses one for your hand"}, the other goes ${/bottom/.test(dig?.rest ?? "") ? "on the bottom of the library" : "to the graveyard"}.`
              : dig && (pending.hand !== undefined || pending.forPlayer !== undefined || pending.exiled)
              ? `The rest ${dig.rest}.`
              : dig
              ? `The rest go ${dig.rest}.${pending.distinctPowers ? " Each must have a different power." : ""}${pending.totalMv !== undefined ? ` Total mana value ${found.reduce((n, x) => n + mvOf(x), 0)} of at most ${pending.totalMv}.` : ""}${dig.lifeEach ? ` You'll lose ${found.length * dig.lifeEach} life.` : ""}`
              : pending.firstTo
                ? pending.firstN && pending.firstN > 1 ? `The first ${pending.firstN} you find go ${pending.firstTo}, the other ${pending.othersTo}.` : `The first you find goes ${pending.firstTo}, the other ${pending.othersTo}.`
                : pending.reveal
                ? `Revealing ${found.length}.`
                : pending.bottom
                ? `Chosen ${found.length}; the first goes lowest.`
                : pending.totalMv !== undefined
                  ? `Chosen ${found.length} of ${pending.max}, total mana value ${found.reduce((n, x) => n + mvOf(x), 0)} of at most ${pending.totalMv}.`
                : pending.exactly
                  ? `Found ${found.length}: exactly ${pending.max} or none.`
                : pending.distinctManaValues
                  ? `Chosen ${found.length}. Each must have a different mana value.`
                  : pending.shareLandType
                  ? `Found ${found.length} of ${pending.max}. They must share a land type.`
                  : pending.oneName
                  ? `Found ${found.length} of ${pending.max}. They must have the same name.`
                  : pending.oneOfEach
                  ? `Found ${found.length} of ${pending.max}: one for each of ${pending.oneOfEach.map((f) => f.text).join(" and ")}.`
                  : pending.also?.length
                    ? `Found ${found.length} of ${pending.max}. The ${pending.also.length} in the graveyard ${pending.also.length === 1 ? "is" : "are"} exiled too.`
                    : `Found ${found.length} of ${pending.max}.${pending.distinctPowers ? " Each must have a different power." : ""}`}
            {pending.foundExiled ? (pending.controlling !== undefined ? " They're exiled, and you may play them." : " They're exiled, and an opponent may play them.") : ""}
          </span>
          <button disabled={found.length < pending.min || (!!pending.exactly && found.length > 0 && found.length !== pending.max)} onClick={() => onDone(found)}>
            {pending.piles ? (found.length ? "Done" : "Done (the first pile empty)") : pending.behold ? (found.length ? "Behold" : "Behold nothing") : pending.reveal ? (found.length ? "Reveal" : "Reveal none") : pending.bottom ? (found.length ? "Put on bottom" : "Keep them all") : pending.shuffle ? (found.length ? "Shuffle in" : "Keep them all") : found.length || pending.min > 0 ? "Done" : dig || pending.fromHand || pending.fromGraveyard ? "Take none" : "Find nothing"}
          </button>
        </header>
        <div className="modal-body">
          {found.length > 0 && (
            <>
              <h4>{pending.piles ? "First pile" : "Found"}</h4>
              <div className="modal-cards">
                {found.map((id, i) => {
                  const d = cardOf(s, id);
                  if (pending.exiled && hiddenInExile(s.objects[id]!, HUMAN))
                    return (
                      <div key={id} className="arrange-card">
                        <div className="card big back" data-found={id} onClick={() => setFound(found.filter((x) => x !== id))} title="Click to put it back">
                          <div className="back-design" />
                        </div>
                      </div>
                    );
                  return (
                    <div key={id} className="arrange-card">
                      <div className="card big" data-found={id} onClick={() => setFound(found.filter((x) => x !== id))} {...hoverProps(d, onHover)} title="Click to put it back">
                        <CardFace d={d} />
                      </div>
                      {where(i) && <span className="muted small">{where(i)}</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {dig && (
            <>
              <h4>{pending.piles ? "Second pile (click a card to move it to the first)" : pending.exiled ? "Exiled cards" : pending.hand !== undefined ? `${s.players[pending.hand]!.name}'s hand${pending.handYard ? " and graveyard" : ""}` : pending.forPlayer !== undefined ? `The cards ${s.players[pending.forPlayer]!.name} revealed` : (() => {
                const o = dig.looked.length ? s.objects[dig.looked[0]!]?.owner : undefined;
                return o !== undefined && o !== pending.player ? `The top of ${s.players[o]!.name}'s library` : "The top of your library";
              })()}</h4>
              <div className="modal-cards">
                {dig.looked
                  .filter((id) => !found.includes(id))
                  .map((id) => {
                    const d = cardOf(s, id);
                    const can = pending.cards.includes(id) && found.length < pending.max && !clashes(id);
                    // A processor's pick: a card exiled face down that you may not look at shows its back (CR 406.3).
                    if (pending.exiled && hiddenInExile(s.objects[id]!, HUMAN))
                      return (
                        <div key={id} className={`card big back ${can ? "targetable" : "dim"}`} data-pick={id} onClick={() => can && setFound([...found, id])}>
                          <div className="back-design" />
                          <span className="zone-label">{`${s.players[s.objects[id]!.owner]!.name}'s, face down`}</span>
                        </div>
                      );
                    return (
                      <div key={id} className={`card big ${can ? "targetable" : "dim"}`} data-pick={id} onClick={() => can && setFound([...found, id])} {...hoverProps(d, onHover)} title={pending.cards.includes(id) && clashes(id) && pending.oneOfEach ? "You already took a card of this kind" : undefined}>
                        <CardFace d={d} />
                        {/* Never Happened: the graveyard's cards after the hand's. */}
                        {pending.handYard && <span className="zone-label">{s.objects[id]!.zone === "graveyard" ? "graveyard" : "hand"}</span>}
                      </div>
                    );
                  })}
              </div>
            </>
          )}
          {!dig && <h4>{zones ? `${whose}'s graveyard, hand and library` : pending.anyGraveyard ? "Graveyards" : pending.fromGraveyard ? "Your graveyard" : pending.behold ? "Your hand and permanents" : pending.fromHand ? "Your hand" : "Your library"}</h4>}
          <div className="modal-cards">
            {!dig && sorted.length === 0 && <span className="muted">No cards in your library match.</span>}
            {sorted.map(([name, ids]) => {
              const left = ids.filter((id) => !found.includes(id)).length;
              const d = cardOf(s, ids[0]!);
              const can = left > 0 && found.length < pending.max && !clashes(ids[0]!);
              return (
                <div key={name} className={`card big ${can ? "targetable" : "dim"}`} data-pick={ids[0]} onClick={() => can && add(ids)} {...hoverProps(d, onHover)} title={left > 0 && clashes(ids[0]!) ? (pending.oneOfEach ? "You already found a card of this kind" : pending.shareLandType ? "It doesn't share a land type with the cards you chose" : pending.oneName ? "It doesn't have the same name as the cards you chose" : pending.totalMv !== undefined ? "The total mana value would be too high" : "You already chose a card with this mana value") : undefined}>
                  <CardFace d={d} />
                  {ids.length > 1 && <span className="zone-count">×{left}</span>}
                  {zones && <span className="muted small" data-zone={name}>in {name}</span>}
                  {pending.anyGraveyard && (
                    <span className="muted small" data-owner={s.objects[ids[0]!]!.owner}>
                      {s.objects[ids[0]!]!.owner === HUMAN ? "yours" : `${s.players[s.objects[ids[0]!]!.owner]!.name}'s`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Choosing modes for a modal spell or ability (CR 700.2). With one mode to choose, clicking
 * it chooses it; otherwise modes toggle and "Done" confirms. Modes that can't be chosen
 * (no legal targets, CR 700.2a) are disabled.
 */
/** What the mode menu shows for a spell being cast or an ability being activated. */
function modeMenuProps(s: GameState, pick: ModePick) {
  const m = pick.body.modal!;
  const text = (t: string, i: number) => (m.costs ? `+ ${m.costs[i]} — ${t}` : m.pawprints ? `${"{P}".repeat(m.pawprints[i]!)} — ${t}` : t);
  const legal = legalModes(s, pick.body, HUMAN, undefined, pick.mode === "activate" ? pick.objectId : undefined);
  // "Choose X" (Doomsday Confluence): X is how many modes are chosen (CR 601.2b), as many as the mana pays for.
  const first = legal.findIndex(Boolean);
  const xMax = m.xCount && pick.mode === "cast" && first >= 0 ? Math.min(m.max, maxX((n) => planCast(s, HUMAN, pick.objectId, undefined, Array.from({ length: n }, () => first), pick.convoke ?? "auto", n))) : undefined;
  return {
    label: pick.label,
    min: m.min,
    max: xMax ?? m.max,
    ...(m.xCount ? { xCount: true } : {}),
    modes: m.modes.map((x, i) => text(x.text, i)),
    legal,
    entwine: m.entwine,
    ...(m.entwineText ? { entwineText: m.entwineText } : {}),
    ...(m.repeat ? { repeat: true } : {}),
    ...(m.pawprints ? { pawprints: m.pawprints } : {}),
    ...(m.escalate ? { escalate: m.escalate.mana ?? m.escalate.text.toLowerCase() } : {}),
  };
}

function ModeMenu({
  label,
  sourceName,
  min,
  max,
  modes,
  legal,
  entwine,
  entwineText,
  repeat,
  pawprints,
  escalate,
  optional,
  xCount,
  onDone,
  onCancel,
}: {
  label: string;
  sourceName: string;
  min: number;
  max: number;
  modes: string[];
  legal: boolean[];
  /** Entwine's cost: all the modes, for that much more (CR 702.42a). */
  entwine?: string;
  /** An entwine cost that isn't mana, in words ("sacrifice three lands", Betrayal of Flesh). */
  entwineText?: string;
  /** "You may choose the same mode more than once" (CR 700.2d): each click adds the mode once more. */
  repeat?: boolean;
  /** Each mode's {P}: any modes worth up to `max` of them (CR 700.2i). */
  pawprints?: number[];
  /** Escalate's cost, for each mode beyond the first (CR 702.120a). */
  escalate?: string;
  /** "You may choose two" (Shadrix Silverquill): none at all is allowed too. */
  optional?: boolean;
  /** "Choose X" (Doomsday Confluence): X is how many are chosen, up to `max` (what the mana pays for). */
  xCount?: boolean;
  onDone: (modes: number[]) => void;
  onCancel?: () => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  const single = max === 1 && min === 1 && !pawprints;
  const used = pawprints ? chosen.reduce((n, i) => n + pawprints[i]!, 0) : chosen.length;
  const room = (i: number) => (pawprints ? used + pawprints[i]! <= max : chosen.length < max);
  const toggle = (i: number) => {
    if (single) return onDone([i]);
    if (repeat) return room(i) && setChosen((c) => [...c, i]);
    setChosen((c) => (c.includes(i) ? c.filter((x) => x !== i) : room(i) ? [...c, i] : c));
  };
  const less = (i: number) => setChosen((c) => c.filter((_, k) => k !== c.lastIndexOf(i)));
  const times = (i: number) => chosen.filter((x) => x === i).length;
  const ok = pawprints ? used <= max : (chosen.length >= min && chosen.length <= max) || (optional && chosen.length === 0);
  return (
    <div className="ability-menu mode-menu">
      <strong>{label}</strong>
      <span className="muted">
        {pawprints ? `choose up to ${max} {P} worth of modes (${max - used} left)` : xCount ? `choose X modes, X being how many you choose (up to ${max} with your mana): X is ${chosen.length}` : `${optional ? "you may " : ""}choose ${describeCount(min, max)}${optional ? " or none" : ""}`}
        {repeat && !pawprints ? ", the same one more than once if you like" : ""}
        {escalate ? `; escalate ${escalate} for each mode beyond the first` : ""}
      </span>
      {modes.map((m, i) => (
        <span key={i} className="mode-choice">
          <button
            className={times(i) ? "chosen" : ""}
            disabled={!legal[i] || (repeat && !room(i))}
            title={legal[i] ? "" : "This mode can't be chosen now: no legal targets, or it has been chosen already"}
            onClick={() => toggle(i)}
          >
            {m.replace(/~/g, sourceName)}
            {repeat && times(i) > 0 && <b className="times"> ×{times(i)}</b>}
          </button>
          {repeat && times(i) > 0 && (
            <button className="ghost less" aria-label="Choose it one time fewer" onClick={() => less(i)}>
              −
            </button>
          )}
        </span>
      ))}
      {entwine !== undefined && (
        <button className="entwine" disabled={!legal.every(Boolean)} title={legal.every(Boolean) ? "" : "Every mode needs a legal target"} onClick={() => onDone(modes.map((_, i) => i))}>
          Entwine {entwineText ? `(${entwineText})` : <ManaCost cost={entwine} />}: all of them
        </button>
      )}
      {!single && (
        <button disabled={!ok} onClick={() => onDone([...chosen].sort((a, b) => a - b))}>
          {chosen.length === 0 && (min === 0 || pawprints || optional) ? "Choose none" : "Done"}
        </button>
      )}
      {onCancel && (
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

/**
 * Ways to make mana with this permanent right now (paying any mana they cost with other sources). A storage land can
 * also be tapped removing no counters, to start storing them (Bottomless Vault).
 */
function usableManaOptions(s: GameState, o: GameObject): ManaOption[] {
  return manaOptions(s, o).filter((x) => (x.adds.length > 0 || x.removes === 0) && planManaAbility(s, HUMAN, o.id, x.ability, x.mana, undefined, undefined, x.combo) !== null);
}

function AbilityMenu({
  s,
  objectId,
  onUse,
  onMana,
  onMix,
  onPlay,
  onCastVia,
  onCastFace,
  onCastAsType,
  onPlayFace,
  onCastAlt,
  onCastAssist,
  onCastFaceDown,
  onSuspend,
  onPlot,
  onForetell,
  onDiscardAnyTime,
  onTurnFaceUp,
  onUnlock,
  onEndEffect,
  onIgnore,
  onClose,
}: {
  s: GameState;
  objectId: string;
  onUse: (id: string, index: number, modes?: number[], x?: number, pick?: ManaPick) => void;
  onMana: (x: ManaOption, to?: PlayerId) => void;
  /** "Add X mana in any combination of colors" (Selvala): choose the colors (`n` mana in all). */
  onMix: (ability: number, n: number, extra?: ManaType[], colors?: Color[]) => void;
  /** For a card in hand: cast it, or play it if it's a land (`untapped`: pay life or reveal so it enters untapped). */
  onPlay: (untapped?: boolean) => void;
  /** For a card in your graveyard: cast it with flashback, escape, ... */
  /** `face`: the split card's half cast this way (an aftermath half). */
  onCastVia: (via: CastFromGraveyardKind, face?: number, permit?: string, alt?: AltCostKind) => void;
  /** For a card with several faces: cast it as this one (a split card's half, an Adventure, a modal double-faced card's back). */
  onCastFace: (face: number) => void;
  /** Aminatou's Augury: cast it as this one of its card types. */
  onCastAsType: (asType: string) => void;
  /** For a modal double-faced card: play it as this land face (`untapped`: pay life or reveal so it enters untapped). */
  onPlayFace: (face: number, untapped?: boolean) => void;
  /** For a card in hand: cast it for its evoke or dash cost. */
  onCastAlt: (alt: AltCostKind, prototyped?: true) => void;
  /** For a card with assist: cast it, asking this player to help pay (CR 702.132a). */
  onCastAssist: (pid: PlayerId) => void;
  /** For a card in hand with morph or disguise: cast it face down for {3}. */
  onCastFaceDown: () => void;
  /** For a card in hand with suspend: exile it with time counters (CR 702.62a). */
  onSuspend: () => void;
  /** For a card in hand with plot: exile it, to cast it free on a later turn (CR 702.170a). */
  onPlot: () => void;
  /** For a card in hand with foretell: pay {2} and exile it face down, to cast it on a later turn (CR 702.143a). */
  onForetell: () => void;
  /** Circling Vultures: "You may discard ~ any time you could cast an instant", a special action (CR 116.2e). */
  onDiscardAnyTime: () => void;
  /** For your face-down permanent: turn it face up. */
  onTurnFaceUp: (way: number, form?: number) => void;
  /** For your Room: unlock this locked door by paying its mana cost (CR 709.5e). */
  onUnlock: (door: number) => void;
  /** "You may pay {W} to end this effect" (a Licid): pay it, a special action (CR 116.2c). */
  onEndEffect: () => void;
  /** "Any player may pay {2} for that player to ignore this effect until end of turn" (Leonin Arbiter): a special action (CR 116.2d). */
  onIgnore: () => void;
  onClose: () => void;
}) {
  const o = s.objects[objectId]!;
  const d = seenCardOf(s, objectId);
  // A card you may play from exile for now works like one in your hand (impulse draw), and so does a land you may
  // play from your graveyard (Crucible of Worlds).
  const inHand = o.zone === "hand" || o.zone === "command" || mayPlayFromExile(s, o, HUMAN) || mayPlayLandFromGraveyard(s, o, HUMAN) || mayPlayFromTop(s, o, HUMAN);
  const faceDownCast = inHand ? compileCard(d).faceDownCast : undefined;
  const suspend = o.zone === "hand" ? compileCard(d).suspend : undefined;
  const plot = o.zone === "hand" ? plotCost(s, HUMAN, d) : undefined;
  const foretell = o.zone === "hand" ? foretellCostOf(s, o, d) : undefined;
  const discardAnyTime = o.zone === "hand" && !!compileCard(d).discardAnyTime;
  // A foretold card: cast only for its foretell cost (CR 702.143a).
  const foretold = foretoldCast(s, HUMAN, o) ? foretellCostOf(s, o, d) : undefined;
  // A manifested card with morph can be turned face up either way (CR 701.40c).
  const upWays = o.zone === "battlefield" ? faceUpWays(s, o) : [];
  const inYard = o.zone === "graveyard";
  const land = isLand(s, objectId);
  const playable = inHand && (land ? canPlayLand(s, objectId) : canCastWithTaps(s, objectId));
  // The faces of a card with several that it can be cast as or played as (CR 709.3, 712.11b, 712.12, 715.3).
  const faces = inHand && !foretold ? castableFaces(s, o) : [];
  const split = s.cards[o.cardId]?.layout === "split";
  const lands = inHand ? landFaces(s, o).filter((f) => f !== 0) : [];
  const choice = inHand && land ? entersRulesOf(s, HUMAN, objectId).entersTappedChoice : undefined;
  // Airbend's "{2} rather than its mana cost", "without paying its mana cost" (Release to the Wind).
  const exiledFor = o.zone === "exile" && o.mayPlay?.player === HUMAN ? o.mayPlay : undefined;
  const asTypes = byTypeChoices(s, o, HUMAN);
  // Leonin Arbiter, Volrath's Curse: pay to ignore its effect this turn, whoever controls it (CR 116.2d).
  const ignoreButton = (() => {
    const ig = ignorableBy(s, HUMAN, objectId);
    if (!ig) return null;
    // With the cards or the permanent still to choose, only whether it could be done with some choice.
    const problem = ig.costs ? (ig.costs[0]?.kind === "exileFromGraveyard" ? (s.players[HUMAN]!.graveyard.length < ig.costs[0].n ? `you need ${ig.costs[0].n} cards in your graveyard` : s.priority !== HUMAN || s.pending ? "you can do that only while you have priority" : null) : s.priority !== HUMAN || s.pending ? "you can do that only while you have priority" : null) : planIgnoreEffect(s, HUMAN, objectId) ? null : ignoreEffectProblem(s, HUMAN, objectId);
    return (
      <button disabled={!!problem} title={problem ?? "A special action: it doesn't use the stack."} onClick={onIgnore}>
        Ignore {seenCardOf(s, objectId).name}&apos;s effect this turn: {ig.mana ? <ManaCost cost={ig.mana} size="sm" /> : ig.costs?.[0]?.kind === "sacrifice" ? "sacrifice a permanent" : "exile three cards from your graveyard"}
      </button>
    );
  })();
  // Another player's permanent: only its abilities any player may activate (CR 602.2), which you'd control (CR 113.8).
  if (o.zone === "battlefield" && controllerOf(s, o) !== HUMAN)
    return (
      <div className="ability-menu">
        <strong>{d.name}</strong>
        {ignoreButton}
        {abilitiesOf(s, o).activated.map((ab, i) => {
          if (!ab.anyPlayer || (ab.ownerOnly && o.owner !== HUMAN) || (ab.opponentsOnly && !opponents(s, controllerOf(s, o)).includes(HUMAN))) return null;
          const problem = abilityProblem(s, HUMAN, objectId, i);
          const ok = !problem || (/not enough mana/.test(problem) && planActivate(s, HUMAN, objectId, i) !== null);
          return (
            <button key={i} disabled={!ok} title={problem ?? (ab.ownerOnly ? "Only its owner may activate this ability; you control it." : ab.opponentsOnly ? "Only its controller's opponents may activate this ability; you control it." : "Any player may activate this ability; you control it.")} onClick={() => onUse(objectId, i)}>
              <RulesText text={ab.text.replace(/~/g, d.name).replace(/ Any player may activate this ability\.$/, "")} />
            </button>
          );
        })}
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    );
  return (
    <div className="ability-menu">
      <strong>{d.name}</strong>
      {choice && (
        <button disabled={!playable || !canEnterUntapped(s, HUMAN, objectId)} onClick={() => onPlay(true)}>
          {choice.kind === "mayTapRad" ? "Play it untapped" : <>Play it untapped ({choice.kind === "payLife" ? `pay ${choice.n} life` : `reveal ${/^[AEIOU]/.test(choice.filter.text) ? "an" : "a"} ${choice.filter.text}`})</>}
        </button>
      )}
      {foretold && (
        <button disabled={!canCastAlt(s, objectId, "foretell")} title={castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { alt: "foretell" }) ?? "You foretold it on an earlier turn."} onClick={() => onCastAlt("foretell")}>
          Cast it for its foretell cost <ManaCost cost={foretold} size="sm" />
        </button>
      )}
      {/* Aminatou's Augury: cast as one of its card types still free (rulings: an artifact creature as either). */}
      {inHand &&
        !foretold &&
        !split &&
        asTypes.length > 1 &&
        asTypes.map((t) => (
          <button key={`as-${t}`} data-as-type={t} disabled={!playable} onClick={() => onCastAsType(t)}>
            Cast it as {/^[AEIOU]/.test(t) ? "an" : "a"} {t.toLowerCase()} without paying its mana cost
          </button>
        ))}
      {inHand && !foretold && !split && asTypes.length < 2 && (
        <button disabled={!playable} onClick={() => onPlay()}>
          {land ? (choice?.kind === "mayTapRad" ? `Play it tapped (you get ${choice.n} rad counters)` : choice ? "Play it tapped" : "Play it") : plottedCast(s, HUMAN, o) ? "Cast it free (plotted)" : exiledFor?.cost ? <>Cast it for <ManaCost cost={exiledFor.cost} size="sm" /></> : exiledFor?.free ? "Cast it without paying its mana cost" : <>Cast it <ManaCost cost={d.manaCost} size="sm" /></>}
        </button>
      )}
      {faces.map((face) => {
        const fd = s.cards[registerFace(s, o, face)]!;
        if (isType(fd, "Land")) return null;
        const problem = castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { face });
        return (
          <button key={`face${face}`} className="face-cast" disabled={!canCastFace(s, objectId, face)} title={problem && !/not enough mana/.test(problem) ? problem : fd.oracleText} onClick={() => onCastFace(face)}>
            Cast {fd.name}
            {fd.subtypes.includes("Adventure") ? " (Adventure)" : face === s.cards[o.cardId]!.faces!.length ? " (fused)" : ""} <ManaCost cost={fd.manaCost} size="sm" />
          </button>
        );
      })}
      {lands.map((face) => {
        const fd = s.cards[registerFace(s, o, face)]!;
        const ok = canPlayLand(s, objectId, face);
        const untap = asFace(s, o, face, () => entersRulesOf(s, HUMAN, objectId).entersTappedChoice);
        return (
          <span key={`land${face}`} className="face-play">
            {untap && (
              <button disabled={!ok || !asFace(s, o, face, () => canEnterUntapped(s, HUMAN, objectId))} onClick={() => onPlayFace(face, true)}>
                Play {fd.name} untapped{untap.kind === "mayTapRad" ? "" : ` (${untap.kind === "payLife" ? `pay ${untap.n} life` : `reveal ${/^[AEIOU]/.test(untap.filter.text) ? "an" : "a"} ${untap.filter.text}`})`}
              </button>
            )}
            <button disabled={!ok} title={fd.oracleText} onClick={() => onPlayFace(face)}>
              Play {fd.name}
              {untap ? " tapped" : ""}
            </button>
          </span>
        );
      })}
      {inHand &&
        !foretold &&
        altCostsFor(s, HUMAN, o).map((a) => {
          const ok = canCastAlt(s, objectId, a.kind);
          const problem = ok ? "" : (castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { alt: a.kind }) ?? "");
          return (
            <button key={a.kind} disabled={!ok} title={problem || ALT_NOTES[a.kind]} onClick={() => onCastAlt(a.kind)}>
              {a.text && !a.mana ? (
                <>
                  {a.kind === "evoke" ? "Evoke:" : "Cast it:"} {a.text}
                </>
              ) : (
                <>
                  {ALT_NAMES[a.kind]} <ManaCost cost={a.mana} size="sm" />
                  {a.text ? ` and ${a.text}` : ""}
                  {a.treasureOnly ? " (mana from Treasures only)" : ""}
                </>
              )}
            </button>
          );
        })}
      {/* Without paying its mana cost, a prototype card can still be cast prototyped (CR 718.3, rulings on One with the Multiverse). */}
      {inHand &&
        !foretold &&
        !!altCost(d, "prototype") &&
        altCostsFor(s, HUMAN, o)
          .filter((a) => PROTOTYPE_WITH.includes(a.kind))
          .map((a) => (
            <button key={`${a.kind}-prototyped`} data-alt={`${a.kind}-prototyped`} disabled={!canCastAlt(s, objectId, a.kind, true)} title={ALT_NOTES[a.kind]} onClick={() => onCastAlt(a.kind, true)}>
              Cast it prototyped for <ManaCost cost={a.mana} size="sm" />
              {a.text ? ` and ${a.text}` : ""}
            </button>
          ))}
      {inHand &&
        !land &&
        compileCard(d).assist &&
        s.turnOrder
          .filter((pid) => pid !== HUMAN && !s.players[pid]!.lost)
          .map((pid) => (
            <button key={`assist-${pid}`} className="ghost" disabled={!canCastNowIgnoringMana(s, objectId)} title={`Assist: ${s.players[pid]!.name} may pay for some of its generic mana, then you pay the rest.`} onClick={() => onCastAssist(pid)}>
              Cast, asking {s.players[pid]!.name} to assist
            </button>
          ))}
      {suspend && (
        <button disabled={!planSuspend(s, HUMAN, objectId)} title={suspendProblem(s, HUMAN, objectId) ?? `Exile it with ${suspend.x ? "X" : suspend.n} time counter${suspend.n === 1 ? "" : "s"}${suspend.x ? " (you choose X, at least 1)" : ""}. One comes off in each of your upkeeps; when the last does, you may cast it for free.`} onClick={onSuspend}>
          Suspend {suspend.x ? "X" : suspend.n} <ManaCost cost={suspend.cost} size="sm" />
        </button>
      )}
      {foretell && (
        <button disabled={!planForetell(s, HUMAN, objectId)} title={foretellProblem(s, HUMAN, objectId) ?? `Exile it face down now (only you can see it). On a later turn you may cast it for ${foretell}.`} onClick={onForetell}>
          Foretell <ManaCost cost="{2}" size="sm" />
        </button>
      )}
      {discardAnyTime && (
        <button disabled={!!discardAnyTimeProblem(s, HUMAN, objectId)} title={discardAnyTimeProblem(s, HUMAN, objectId) ?? "Discard it now (any time you could cast an instant). It doesn't use the stack."} onClick={onDiscardAnyTime}>
          Discard
        </button>
      )}
      {plot && (
        <button disabled={!planPlot(s, HUMAN, objectId)} title={plotProblem(s, HUMAN, objectId) ?? "Exile it now. On a later turn you may cast it without paying its mana cost, during your main phase."} onClick={onPlot}>
          Plot <ManaCost cost={plot} size="sm" />
        </button>
      )}
      {faceDownCast && (
        <button
          disabled={!planCast(s, HUMAN, objectId, undefined, undefined, "auto", undefined, { faceDown: true })}
          title={castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { faceDown: true }) ?? `A 2/2 that only you can see. Turn it face up later for ${faceDownCast.cost}.`}
          onClick={onCastFaceDown}
        >
          Cast face down <ManaCost cost="{3}" size="sm" /> ({faceDownCast.kind})
        </button>
      )}
      {[0, 1].flatMap((door) => {
        const cost = unlockCost(s, o, door);
        if (cost === undefined || controllerOf(s, o) !== HUMAN) return [];
        return [
          <button key={`unlock${door}`} disabled={!planUnlock(s, HUMAN, objectId, door)} title={unlockProblem(s, HUMAN, objectId, door) ?? "A special action: it doesn't use the stack."} onClick={() => onUnlock(door)}>
            Unlock {restingDef(s.cards[o.cardId]!).faces![door]!.name} <ManaCost cost={cost} size="sm" />
          </button>,
        ];
      })}
      {(() => {
        const e = endableEffect(s, HUMAN, objectId);
        return (
          e && (
            <button disabled={!planEndEffect(s, HUMAN, objectId)} title={endEffectProblem(s, HUMAN, objectId) ?? "A special action: it doesn't use the stack."} onClick={onEndEffect}>
              End {e.sourceName}&apos;s effect <ManaCost cost={e.endable!.cost} size="sm" />
            </button>
          )
        );
      })()}
      {ignoreButton}
      {upWays.flatMap((upCost, way) => {
        // Aquamorph Entity: what it becomes is chosen as it's turned face up (CR 614.1e), a button for each.
        const forms = faceUpFormsOf(s, o);
        return (forms ? forms.map((_, i) => i) : [undefined]).map((form) => (
          <button key={`up${way}-${form ?? ""}`} data-face-up-form={form} disabled={!planTurnFaceUp(s, HUMAN, objectId, way, 0, undefined, form)} title={turnFaceUpProblem(s, HUMAN, objectId, way) ?? "A special action: it doesn't use the stack."} onClick={() => onTurnFaceUp(way, form)}>
            Turn face up: {upCost.kind === "manifest" || upCost.kind === "cloak" ? "mana cost" : upCost.kind} {upCost.text ?? <ManaCost cost={upCost.cost} size="sm" />}
            {form !== undefined ? ` as ${forms![form]!.text}` : null}
          </button>
        ));
      })}
      {inYard &&
        graveyardWays(s, o, HUMAN).flatMap((g) => {
          // Muldrotha: an artifact creature can use the artifact or the creature permission, the player's choice (rulings).
          // Each with the card's alternative costs too, which the permission doesn't rule out (rulings on Muldrotha).
          if (g.kind === "turnPermission" && (g.permits?.length ?? 0) > 1)
            return g.permits!.flatMap((permit) => {
              const problem = castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { via: g.kind, permit });
              const ok = !problem || (/not enough mana/.test(problem) && planCast(s, HUMAN, objectId, undefined, undefined, "auto", undefined, { via: g.kind, permit }) !== null);
              const altOk = (alt: AltCostKind) => {
                const p = castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { via: g.kind, permit, alt });
                return !p || (/not enough mana/.test(p) && planCast(s, HUMAN, objectId, undefined, undefined, "auto", undefined, { via: g.kind, permit, alt }) !== null);
              };
              return [
                <button key={`permit-${permit}`} data-permit={permit} disabled={!ok} title={problem ?? ""} onClick={() => onCastVia(g.kind, undefined, permit)}>
                  Cast from graveyard with {permitLabel(s, permit)} <ManaCost cost={g.mana ?? d.manaCost} size="sm" />
                </button>,
                ...altCostsFor(s, HUMAN, o)
                  .filter((a) => altOk(a.kind))
                  .map((a) => (
                    <button key={`permit-${permit}-${a.kind}`} data-permit={permit} data-alt={a.kind} title={ALT_NOTES[a.kind]} onClick={() => onCastVia(g.kind, undefined, permit, a.kind)}>
                      Cast from graveyard with {permitLabel(s, permit)}: {a.text && !a.mana ? a.text : <>{ALT_NAMES[a.kind]} <ManaCost cost={a.mana} size="sm" /></>}
                      {a.text && a.mana ? ` and ${a.text}` : ""}
                    </button>
                  )),
              ];
            });
          const ok = canCastFromGraveyard(s, objectId, g.kind, g.face);
          const problem = ok ? "" : (castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { via: g.kind, face: g.face }) ?? "");
          const half = g.face !== undefined ? s.cards[registerFace(s, o, g.face)]! : undefined;
          // With a permission that names no cost (Yawgmoth's Will, Muldrotha), its alternative costs too (rulings).
          const alts = permissionWay(g) && g.face === undefined ? altCostsFor(s, HUMAN, o).filter((a) => canCastFromGraveyard(s, objectId, g.kind, undefined, a.kind)) : [];
          return [
            <button key={`${g.kind}${g.face ?? ""}`} disabled={!ok} title={problem || half?.oracleText} onClick={() => onCastVia(g.kind, g.face)}>
              {VIA_NAMES[g.kind]}
              {half ? ` ${half.name}` : ""} <ManaCost cost={g.mana ?? half?.manaCost ?? d.manaCost} size="sm" />
              {g.costs.length ? `, ${g.costs.map(describeExtraCost).join(", ")}` : ""}
            </button>,
            ...alts.map((a) => (
              <button key={`${g.kind}-${a.kind}`} data-alt={a.kind} title={ALT_NOTES[a.kind]} onClick={() => onCastVia(g.kind, undefined, undefined, a.kind)}>
                {VIA_NAMES[g.kind]}: {a.text && !a.mana ? a.text : <>{ALT_NAMES[a.kind]} <ManaCost cost={a.mana} size="sm" /></>}
                {a.text && a.mana ? ` and ${a.text}` : ""}
              </button>
            )),
          ];
        })}
      {!inHand &&
        !inYard &&
        usableManaOptions(s, o).map((x, i, all) => {
          const ab = manaAbilitiesOn(s, o)[x.ability]!;
          // "In any combination of colors": one button, then a choice of how much of each color.
          if (ab.produces.kind === "anyColors") {
            if (all.findIndex((y) => y.ability === x.ability) !== i) return null;
            const n = anyColorsCount(s, o, ab.produces);
            return (
              <button key={`mix-${x.ability}`} className="ghost" data-mix={x.ability} onClick={() => onMix(x.ability, n, x.extra, ab.produces.kind === "anyColors" ? ab.produces.colors : undefined)}>
                <RulesText text={ab.text.slice(0, ab.text.indexOf(": Add")).replace(/~/g, "it")} />: add {n} mana in any combination of colors…
              </button>
            );
          }
          // A storage land's: how many counters this button removes.
          // Doubling Cube's text doesn't say "Add": its costs end at the first colon.
          // Metalworker's: how many cards this button reveals.
          const cost = ab.produces.kind === "revealX" ? `${ab.text.slice(0, ab.text.indexOf(": "))}, reveal ${x.combo === 0 ? "no" : x.combo} ${ab.produces.filter.text}${x.combo === 1 ? "" : "s"}` : ab.text
            .slice(0, ab.text.includes(": Add") ? ab.text.indexOf(": Add") : ab.text.indexOf(": "))
            .replace(/~/g, "it")
            .replace(/Remove (?:any number of|X) (\S+) counters/, (_, k: string) => (x.removes === 1 ? `Remove a ${k} counter` : `Remove ${x.removes === 0 ? "no" : x.removes} ${k} counters`));
          const button = (
            <button key={`${x.ability}-${x.mana}-${x.combo ?? ""}-${x.extra?.join("") ?? ""}`} className="ghost" onClick={() => onMana(x)}>
              <RulesText text={cost} />: {x.pays ? <>pay with <ManaCost cost={x.pays.map((m) => `{${m}}`).join("")} size="sm" />, </> : null}
              {x.adds.length ? <>add <ManaCost cost={x.adds.map((m) => `{${m}}`).join("")} size="sm" /></> : "add no mana"}
              {ab.selfDamage ? ` (${ab.selfDamage} damage to you)` : ""}
            </button>
          );
          // Victory Chimes: "a player of your choice adds {C}": you, or one of the others.
          if (!ab.toChosenPlayer) return button;
          return [
            button,
            ...livingPlayers(s)
              .filter((pid) => pid !== HUMAN)
              .map((pid) => (
                <button key={`${x.ability}-${x.mana}-to${pid}`} className="ghost" data-mana-to={pid} onClick={() => onMana(x, pid)}>
                  <RulesText text={cost} />: {s.players[pid]!.name} adds <ManaCost cost={x.adds.map((m) => `{${m}}`).join("")} size="sm" />
                </button>
              )),
          ];
        })}
      {abilitiesOf(s, o).activated.map((ab, i) => {
        // From your hand, only cycling and the like; from your graveyard, unearth; on the battlefield, everything else.
        // Commander ninjutsu works from the command zone too (CR 702.49d).
        // Mister Immortal's works from exile too.
        if ((ab.zone ?? "battlefield") !== o.zone && !(ab.orCommand && o.zone === "command") && !(ab.orExile && o.zone === "exile")) return null;
        const problem = abilityProblem(s, HUMAN, objectId, i);
        const ok = !problem || (/not enough mana/.test(problem) && planActivate(s, HUMAN, objectId, i) !== null);
        // A mana ability with a choice of mana (CR 605.1a): a button for each, like a land's.
        const picks = ab.mana ? (activatedManaOptions(s, o, i) ?? []).filter((x) => x.adds.length) : [];
        if (picks.length > 1) {
          const cost = ab.text.slice(0, ab.text.indexOf(": ")).replace(/~/g, "it");
          return picks.map((x) => (
            <button key={`${i}-${x.mana}-${x.extra?.join("") ?? ""}`} disabled={!ok} title={problem ?? ""} onClick={() => onUse(objectId, i, undefined, undefined, { mana: x.mana, ...(x.extra ? { extra: x.extra } : {}) })}>
              <RulesText text={cost} />: add <ManaCost cost={x.adds.map((m) => `{${m}}`).join("")} size="sm" />
            </button>
          ));
        }
        // Legal, but pointless right now (like untapping something that's untapped, CR 602.2).
        const noop = doesNothingNow(s, objectId, ab.body);
        return (
          <button key={i} disabled={!ok} className={noop ? "noop" : ""} title={problem ?? (noop ? "Legal, but it does nothing right now" : "")} onClick={() => onUse(objectId, i)}>
            <RulesText text={ab.text.replace(/~/g, d.name)} />
            {noop && <span className="noop-tag">does nothing now</span>}
          </button>
        );
      })}
      <button className="ghost" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function Controls({
  s,
  pending,
  attacks,
  aim,
  blocks,
  blocker,
  discards,
  dispatch,
  onCastFree,
  onHover,
}: {
  s: GameState;
  pending: GameState["pending"];
  attacks: Record<string, AttackTo>;
  aim: string | null;
  blocks: Record<string, string[]>;
  blocker: string | null;
  discards: string[];
  dispatch: ReturnType<typeof useGame>["dispatch"];
  /** Cascade's free cast: go through modes and targets as usual. */
  onCastFree: (id: string, face?: number, alt?: AltCostKind) => void;
  onHover: (d: CardDef | null) => void;
}) {
  if (s.over) return null;
  if (pending?.kind === "castFree") {
    const d = cardOf(s, pending.objectId);
    const o = s.objects[pending.objectId]!;
    // A card with several faces may be cast as one of them: a split card only as a half (CR 709.3).
    // A defeated Siege is cast transformed only (CR 310.12b).
    const transformed = pending.how === "transformed";
    const faces = transformed ? [1] : castableFaces(s, o).filter((f) => !isType(s.cards[registerFace(s, o, f)]!, "Land"));
    const prototype = !pending.how && !!altCost(d, "prototype");
    return (
      <div className="controls">
        <span onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)}>
          {pending.how === "madness" ? (
            <>
              <strong>Madness:</strong> cast <strong>{d.name}</strong> for <ManaCost cost={madnessCastOf(s, HUMAN, pending.objectId) ?? ""} size="sm" />
              {compileCard(d).madnessLife ? ` and ${compileCard(d).madnessLife} life` : ""}? If you don&apos;t, it goes to your graveyard.
            </>
          ) : pending.how === "miracle" ? (
            <>
              <strong>Miracle:</strong> cast <strong>{d.name}</strong> for <ManaCost cost={madnessCastOf(s, HUMAN, pending.objectId) ?? ""} size="sm" />? If you don&apos;t, it stays in your hand.
            </>
          ) : pending.how === "paid" ? (
            <>
              {/* Chandra, Torch of Defiance: the card just exiled, cast now or not at all. */}
              <strong>{pending.source}:</strong> cast <strong>{d.name}</strong> from {o.zone === "exile" ? "exile" : "your graveyard"} for <ManaCost cost={madnessCastOf(s, HUMAN, pending.objectId) ?? ""} size="sm" />? Only now{o.zone === "exile" ? "." : <>, and then you can&apos;t cast other spells this turn.</>}
            </>
          ) : pending.how === "discover" ? (
            <>
              <strong>{pending.source}:</strong> discover. Cast <strong>{d.name}</strong> without paying its mana cost? If you don&apos;t, it goes to your hand.
            </>
          ) : transformed ? (
            <>
              <strong>{pending.source}:</strong> it&apos;s defeated. Cast <strong>{s.cards[registerFace(s, o, 1)]!.name}</strong> transformed without paying its mana cost? If you don&apos;t, it stays in exile.
            </>
          ) : pending.how === "suspend" ? (
            <>
              <strong>Suspend:</strong> the last time counter is gone. Cast <strong>{d.name}</strong> without paying its mana cost? If you don&apos;t, it stays in exile.
            </>
          ) : o.zone === "command" ? (
            <>
              {/* Geode Golem: the commander tax is still paid (CR 903.8). */}
              <strong>{pending.source}:</strong> cast <strong>{d.name}</strong> from the command zone without paying its mana cost?
              {commanderTax(s.players[HUMAN]!, o, d) ? <> You still pay the commander tax, <ManaCost cost={`{${commanderTax(s.players[HUMAN]!, o, d)}}`} size="sm" />.</> : commanderTaxLife(s.players[HUMAN]!, o, d) ? <> You still pay the commander tax, {commanderTaxLife(s.players[HUMAN]!, o, d)} life.</> : null}
            </>
          ) : (
            <>
              <strong>{pending.source}:</strong> cast <strong>{d.name}</strong> without paying its mana cost?
            </>
          )}
        </span>
        {s.cards[o.cardId]?.layout !== "split" && !transformed && (
          <button
            disabled={((pending.how === "madness" || pending.how === "miracle" || pending.how === "paid" || (o.zone === "command" && commanderTax(s.players[HUMAN]!, o, d) > 0)) && planCast(s, HUMAN, pending.objectId, undefined, undefined, "auto") === null) || (!!pending.mv && /mana value/.test(castProblem(s, HUMAN, pending.objectId) ?? ""))}
            title={pending.how === "madness" || pending.how === "miracle" || pending.how === "paid" || pending.mv ? (castProblem(s, HUMAN, pending.objectId) ?? "") : ""}
            onClick={() => onCastFree(pending.objectId)}
          >
            Cast it
          </button>
        )}
        {/* Prototyped isn't an alternative cost (CR 718.3): a free cast may be prototyped. */}
        {prototype && (
          <button data-alt="prototype" disabled={/mana value/.test(castProblem(s, HUMAN, pending.objectId, undefined, undefined, undefined, undefined, undefined, { alt: "prototype" }) ?? "")} onClick={() => onCastFree(pending.objectId, undefined, "prototype")}>
            Cast it prototyped <ManaCost cost={altCost(d, "prototype")!.mana} size="sm" />
          </button>
        )}
        {faces.map((face) => (
          <button key={face} className="face-cast" disabled={/^(?!not enough mana)/.test(castProblem(s, HUMAN, pending.objectId, undefined, undefined, undefined, undefined, undefined, { face }) ?? "not enough mana")} onClick={() => onCastFree(pending.objectId, face)}>
            Cast {s.cards[registerFace(s, o, face)]!.name}
            {face === s.cards[o.cardId]!.faces!.length ? " (fused)" : ""}
          </button>
        ))}
        <button className="ghost" onClick={() => dispatch([{ type: "chooseMay", player: HUMAN, yes: false }])}>
          Don't
        </button>
      </div>
    );
  }
  if (pending?.kind === "drawLook" && pending.keep && pending.player === HUMAN) {
    // Underrealm Lich: keep one of the top cards; the rest go to the graveyard. Or another replacement of that draw first.
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> instead of drawing, put one of the top {pending.cards.length === 1 ? "card" : `${pending.cards.length} cards`} of your library into your hand and the rest {pending.bottom ? "on the bottom of your library in any order" : "into your graveyard"}.
          {pending.instead ? " Or replace the draw another way:" : ""}
        </span>
        {pending.cards.length < 2 ? (
          <button onClick={() => dispatch([{ type: "drawLook", player: HUMAN }])}>{pending.cards.length ? `${cardOf(s, pending.cards[0]!).name} to hand` : "Nothing to look at"}</button>
        ) : (
          pending.cards.map((id) => {
            const d = cardOf(s, id);
            return (
              <button key={id} onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)} onClick={() => dispatch([{ type: "drawLook", player: HUMAN, objectId: id }])}>
                {d.name} to hand
              </button>
            );
          })
        )}
        {pending.instead?.archive ? (
          <button className="ghost" onClick={() => dispatch([{ type: "drawLook", player: HUMAN, instead: "archive" }])}>
            Draw 2 instead
          </button>
        ) : null}
        {pending.instead?.abundance
          ? (["land", "nonland"] as const).map((kind) => (
              <button key={kind} className="ghost" onClick={() => dispatch([{ type: "drawLook", player: HUMAN, instead: { abundance: kind } }])}>
                Reveal until a {kind} ({pending.instead!.abundance})
              </button>
            ))
          : null}
        {(pending.instead?.dredge ?? []).map((id) => {
          const d = cardOf(s, id);
          return (
            <button key={id} className="ghost" onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)} onClick={() => dispatch([{ type: "drawLook", player: HUMAN, instead: { dredge: id } }])}>
              Dredge {d.name} (mill {dredgeAmount(s, HUMAN, id)})
            </button>
          );
        })}
      </div>
    );
  }
  if (pending?.kind === "drawLook" && pending.player === HUMAN) {
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> instead of drawing, put one of the top two cards of your library into your graveyard; the other stays on top, then you draw it.
          {pending.instead ? " Or replace the draw another way first, and don't look:" : ""}
        </span>
        {pending.cards.length < 2 ? (
          <button onClick={() => dispatch([{ type: "drawLook", player: HUMAN }])}>{pending.cards.length ? `${cardOf(s, pending.cards[0]!).name} to graveyard` : "Look"}</button>
        ) : (
          pending.cards.map((id) => {
            const d = cardOf(s, id);
            return (
              <button key={id} onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)} onClick={() => dispatch([{ type: "drawLook", player: HUMAN, objectId: id }])}>
                {d.name} to graveyard
              </button>
            );
          })
        )}
        {pending.instead?.archive ? (
          <button className="ghost" onClick={() => dispatch([{ type: "drawLook", player: HUMAN, instead: "archive" }])}>
            Draw {pending.instead.archive} instead
          </button>
        ) : null}
        {(pending.instead?.dredge ?? []).map((id) => {
          const d = cardOf(s, id);
          return (
            <button key={id} className="ghost" onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)} onClick={() => dispatch([{ type: "drawLook", player: HUMAN, instead: { dredge: id } }])}>
              Dredge {d.name} (mill {dredgeAmount(s, HUMAN, id)})
            </button>
          );
        })}
        {pending.instead?.dig ? (
          <button className="ghost" onClick={() => dispatch([{ type: "drawLook", player: HUMAN, instead: "dig" }])}>
            {pending.instead.dig} instead
          </button>
        ) : null}
      </div>
    );
  }
  if (pending?.kind === "drawEmptyReturn" && pending.player === HUMAN) {
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> your library is empty, so instead of drawing, return a creature card from your graveyard to the battlefield
          {pending.left > 0 ? ` (${pending.left} more draw${pending.left === 1 ? "" : "s"} after this)` : ""}
        </span>
        {pending.cards.map((id) => {
          const d = cardOf(s, id);
          return (
            <button key={id} onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)} onClick={() => dispatch([{ type: "drawEmptyReturn", player: HUMAN, objectId: id }])}>
              Return {d.name}
            </button>
          );
        })}
      </div>
    );
  }
  if (pending?.kind === "drawInstead" && pending.player === HUMAN) {
    return (
      <div className="controls">
        <span>
          <strong>Replace this draw:</strong> choose which effect applies instead of drawing a card (CR 616.1); a "next time" shield not chosen waits for your next draw this turn
          {pending.left > 0 ? ` (${pending.left} more draw${pending.left === 1 ? "" : "s"} after this)` : ""}
        </span>
        {pending.options.map((choice, i) => (
          <button key={choice} onClick={() => dispatch([{ type: "drawInstead", player: HUMAN, choice }])}>
            {pending.labels[i]}
          </button>
        ))}
      </div>
    );
  }
  if (pending?.kind === "dredge" && pending.player === HUMAN) {
    const options = pending.options.filter((id) => dredgeOptions(s, HUMAN).includes(id));
    return (
      <div className="controls">
        <span>
          <strong>{options.length ? "Dredge" : pending.abundance}:</strong>{" "}
          {pending.archive && options.length
            ? "Alhammarret's Archive would make this draw two cards. Dredge first instead, milling to return a card from your graveyard to your hand?"
            : options.length
              ? "draw a card, or mill instead to return a card from your graveyard to your hand?"
              : "draw a card, or instead reveal cards from the top of your library until a land or nonland card and put it into your hand?"}
          {pending.left > 1 ? ` (${pending.left} draws left)` : ""}
        </span>
        {options.map((id) => {
          const d = cardOf(s, id);
          return (
            <button key={id} onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)} onClick={() => dispatch([{ type: "dredge", player: HUMAN, objectId: id }])}>
              Dredge {d.name} (mill {dredgeAmount(s, HUMAN, id)})
            </button>
          );
        })}
        {pending.abundance &&
          (["land", "nonland"] as const).map((kind) => (
            <button key={kind} title={`${pending.abundance}: the other revealed cards go on the bottom of your library`} onClick={() => dispatch([{ type: "dredge", player: HUMAN, abundance: kind }])}>
              Reveal until a {kind} card
            </button>
          ))}
        <button className="ghost" onClick={() => dispatch([{ type: "dredge", player: HUMAN }])}>
          {pending.archive ? "Draw two instead (Archive first)" : "Draw"}
        </button>
      </div>
    );
  }
  if (pending?.kind === "declareAttackers") {
    // Creatures that attack each combat if able have to be declared (CR 508.1d).
    // Not when attacking would cost something (Ghostly Prison): nothing obliges paying (CR 508.1d).
    const free = (o: GameObject, d: PlayerId) => !attackProblem(s, o, d) && !attackTaxPer(s, d, false, o.id);
    const must = potentialAttackers(s, HUMAN).filter((o) => characteristics(s, o).attacksIfAble && !(o.id in attacks) && opponents(s, HUMAN).some((d) => free(o, d)));
    // Encore tokens attack their opponent if able (CR 508.1d).
    const bound = potentialAttackers(s, HUMAN).flatMap((o) => {
      const able = characteristics(s, o).mustAttack.filter((d) => opponents(s, HUMAN).includes(d) && free(o, d));
      const a = attacks[o.id];
      return able.length && !walkersFreeToAttack(s, o).length && (!a || a.planeswalker || !able.includes(a.defender)) ? [`${cardOf(s, o.id).name} must attack ${able.map((d) => s.players[d]!.name).join(" or ")}.`] : [];
    });
    // Gideon: "attacks ~ if able" (CR 508.1d), when it isn't goaded or bound to a player as well (the engine weighs those).
    const toWalker = potentialAttackers(s, HUMAN).flatMap((o) => {
      const ws = walkersFreeToAttack(s, o);
      const a = attacks[o.id];
      if (!ws.length || characteristics(s, o).goadedBy.length || characteristics(s, o).mustAttack.length || (a?.planeswalker && ws.includes(a.planeswalker))) return [];
      return [`${cardOf(s, o.id).name} must attack ${ws.map((w) => cardOf(s, w).name).join(" or ")} if able: click it, then ${ws.length === 1 ? "that planeswalker" : "one of them"}.`];
    });
    bound.unshift(...toWalker);
    // "Can't attack alone" (CR 506.5).
    const ids = Object.keys(attacks);
    // Ghostly Prison and the like: what attacking costs, paid from your lands as you declare (CR 508.1g-i).
    const declared = Object.entries(attacks).map(([attacker, a]) => ({ attacker, defender: a.defender, ...(a.planeswalker ? { planeswalker: a.planeswalker } : {}) }));
    const tax = attackCost(s, declared);
    const taxTaps = tax ? planMana(s, HUMAN, parseManaCost(tax)) : [];
    // Sivitri, Dragon Master: life for each creature attacking that player.
    const lifeTax = attackLifeCost(s, declared);
    const lifeShort = lifeTax > 0 && payableLife(s, HUMAN) < lifeTax;
    const alone = ids.length === 1 && characteristics(s, s.objects[ids[0]!]!).cantAttackAlone ? `${cardOf(s, ids[0]!).name} can't attack alone.` : null;
    return (
      <div className="controls">
        <span>
          {alone && !aim
            ? alone
            : bound.length && !aim
            ? bound[0]
            : must.length && !aim
            ? `${must.map((o) => cardOf(s, o.id).name).join(" and ")} attack${must.length === 1 ? "s" : ""} each combat if able: click ${must.length === 1 ? "it" : "them"}, then a player.`
            : aim
            ? `Now click the player or planeswalker ${cardOf(s, aim).name} attacks.`
            : opponents(s, HUMAN).length === 1 && !s.battlefield.some((id) => controllerOf(s, s.objects[id]!) !== HUMAN && characteristics(s, s.objects[id]!).types.includes("Planeswalker"))
              ? "Click your creatures to attack. Click an attacker again to take it back."
              : "Click a creature, then the player it attacks. Click an attacker again to take it back."}
        </span>
        <button
          disabled={must.length > 0 || bound.length > 0 || !!alone || !taxTaps || lifeShort}
          title={lifeShort ? `Attacking costs ${lifeTax} life and you can't pay it` : tax && !taxTaps ? `Attacking costs ${tax} and you can't pay it` : tax.includes("/P}") ? "Phyrexian mana: paid with mana in your pool, otherwise 2 life each" : undefined}
          onClick={() => dispatch([...(taxTaps ?? []), { type: "declareAttackers", player: HUMAN, attacks: declared }])}
        >
          {Object.keys(attacks).length ? `Attack with ${Object.keys(attacks).length}${tax || lifeTax ? ` (pay ${[tax, lifeTax ? `${lifeTax} life` : ""].filter(Boolean).join(" and ")})` : ""}` : "No attacks"}
        </button>
      </div>
    );
  }
  if (pending?.kind === "declareBlockers") {
    // Blocking requirements and "can't block alone" (CR 509.1c, 506.5): say what's still needed.
    const list = Object.entries(blocks).flatMap(([b, atts]) => atts.map((attacker) => ({ blocker: b, attacker })));
    const earlier = s.battlefield.some((id) => s.objects[id]!.blocking !== undefined);
    const alone = Object.keys(blocks).length === 1 && !earlier && characteristics(s, s.objects[list[0]!.blocker]!).cantBlockAlone ? `${cardOf(s, list[0]!.blocker).name} can't block alone.` : null;
    // Orcish Conscripts: "can't block unless at least two other creatures block" (CR 509.1b).
    const lonely = blockWithoutCompany(s, list, s.battlefield.filter((id) => s.objects[id]!.blocking !== undefined).length);
    // Archangel of Tithes: what blocking costs, paid from your lands as you declare (CR 509.1d-f); with a cost, no
    // requirement makes a creature block (CR 509.1c).
    // Qal Sisma Behemoth: what blocking with each of them costs, too.
    // Hipparion: what blocking a creature with enough power costs it.
    const blockTax = blockCost(s, Object.keys(blocks).length, Object.keys(blocks), list);
    // Odric, Master Tactician: choosing another player's blocks; they decide whether to pay what blocking costs.
    const defender = pending.defender ?? HUMAN;
    const theirs = defender !== HUMAN ? s.players[defender]!.name : null;
    // Heat Wave: life for some blocks, paid with them (CR 509.1d); only with that much life to pay (CR 119.4).
    const blockLife = blockLifeCost(s, list);
    const blockTaps = blockTax || blockLife ? (theirs ? [] : blockLife && s.players[HUMAN]!.life < blockLife ? null : blockTax ? planMana(s, HUMAN, parseManaCost(blockTax)) : []) : [];
    const blockPay = [blockTax, blockLife ? `${blockLife} life` : ""].filter(Boolean).join(" and ");
    const needed = alone ?? lonely ?? (blockCost(s, 1) || blocksMayCostLife(s) ? null : blockRequirementProblem(s, defender, list));
    return (
      <div className="controls">
        <span>
          {blocker
            ? maxBlocks(s, s.objects[blocker]!) > 1
              ? `Now click the attackers ${cardOf(s, blocker).name} blocks (${maxBlocks(s, s.objects[blocker]!) === Infinity ? "any number" : `up to ${maxBlocks(s, s.objects[blocker]!)}`}), then confirm.`
              : `Now click the attacker ${cardOf(s, blocker).name} blocks.`
            : needed
              ? `${needed.charAt(0).toUpperCase()}${needed.slice(1)}.`
              : theirs
                ? `You choose ${theirs}'s blocks: click one of their untapped creatures, then the attacker it blocks.`
                : "Click one of your untapped creatures, then the attacker it blocks."}
        </span>
        <button
          disabled={!!needed || !blockTaps}
          title={blockPay && !blockTaps ? `Blocking costs ${blockPay} and you can't pay it` : undefined}
          onClick={() =>
            dispatch([
              ...(blockTaps ?? []),
              {
                type: "declareBlockers",
                player: HUMAN,
                blocks: list,
              },
            ])
          }
        >
          {Object.keys(blocks).length ? `Block with ${Object.keys(blocks).length}${blockPay ? (theirs ? ` (${theirs} may pay ${blockPay})` : ` (pay ${blockPay})`) : ""}` : "No blocks"}
        </button>
      </div>
    );
  }
  // "You may cast a spell with mana value 3 or less from your hand without paying its mana cost": which card, or none;
  // the legend rule's "keep which one?" (CR 704.5j); Gilgamesh's "attach one of them": hovering shows each card.
  if (pending?.kind === "chooseOption" && (pending.what === "castFromHand" || pending.what === "castFromAmong" || pending.what === "impulseChoice" || pending.what === "takeExiled" || pending.what === "pileCard" || pending.what === "legend" || pending.what === "revealHandOrTop" || pending.what === "exileHandOrPermanent" || pending.what === "copyOrder" || pending.what === "nextRevealed" || pending.what === "nextExiled" || pending.what === "attachWhich" || pending.what === "predicamentCard" || pending.what === "alternatePick" || pending.what === "struggleExile") && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt}
        </span>
        {pending.options.map((o, i) => (
          <button key={o} className={o === "none" ? "ghost" : ""} onMouseEnter={() => o !== "none" && o !== "top" && onHover(cardOf(s, o))} onMouseLeave={() => onHover(null)} onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {pending.labels?.[i] ?? o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && (pending.what === "secretNumber" || pending.what === "bid" || pending.what === "number" || pending.what === "payLife" || pending.what === "lifeAsEnters" || pending.what === "payEnergy" || pending.what === "evidenceX" || pending.what === "payLifeRound") && pending.player === HUMAN) return <NumberChoice key={`${pending.source}:${s.log.length}`} pending={pending} dispatch={dispatch} />;
  if (pending?.kind === "chooseOption" && (pending.what === "damageShield" || pending.what === "form" || pending.what === "faceUpForm" || pending.what === "topOrBottom" || pending.what === "attackWhom" || pending.what === "reselectAttack" || pending.what === "searchZones" || pending.what === "tapOrUntap" || pending.what === "punisher" || pending.what === "tribute" || pending.what === "tributePay" || pending.what === "readAhead" || pending.what === "player" || pending.what === "protector" || pending.what === "chosenObject" || pending.what === "anchor" || pending.what === "playerWord" || pending.what === "exchangeText" || pending.what === "controlOpponent" || pending.what === "opponent" || pending.what === "rollResult" || pending.what === "mutate" || pending.what === "commander" || pending.what === "drawUpTo" || pending.what === "payX" || pending.what === "either" || pending.what === "word" || pending.what === "payOrTop" || pending.what === "discardInstead" || pending.what === "sacrificeInstead" || pending.what === "counterKind" || pending.what === "removeCounter" || pending.what === "targetSlot" || pending.what === "unlessWay" || pending.what === "nthPlayer" || pending.what === "villainous" || pending.what === "unlockDoor" || pending.what === "damageWhom" || pending.what === "counterChoice" || pending.what === "timeTravel" || pending.what === "addOrRemoveCounter" || pending.what === "landOrNonland" || pending.what === "predicamentGuess" || pending.what === "splitTargets" || pending.what === "greatestTie" || pending.what === "untapType" || pending.what === "giveLife" || pending.what === "targetChooser" || pending.what === "modeChooser" || pending.what === "direction" || pending.what === "skipChoice" || pending.what === "payLifeOrDestroy" || ((pending.what === "textFrom" || pending.what === "textTo" || pending.what === "typeOrder") && pending.options.length <= 10)) && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {pending.what === "nthPlayer" ? `choose a player ${pending.prompt}.` : pending.prompt}
        </span>
        {pending.options.map((o, i) => (
          <button key={o} className={i === 0 ? "" : "ghost"} onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {pending.labels?.[i] ?? o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && (pending.what === "riot" || pending.what === "unleash") && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}</strong>
          {pending.what === "riot" ? " (riot): enter with a +1/+1 counter, or with haste?" : " (unleash): enter with a +1/+1 counter? It can't block while it has one."}
        </span>
        {pending.options.map((o) => (
          <button key={o} className={o === pending.options[0] ? "" : "ghost"} onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "manaMix" && pending.player === HUMAN) return <ManaMixChoice key={`${pending.source}:${pending.n}`} pending={pending} dispatch={dispatch} />;
  if (pending?.kind === "distribute" && pending.player === HUMAN)
    return <DistributeChoice key={`${pending.source}:${pending.total}:${pending.options.join(",")}`} s={s} pending={pending} dispatch={dispatch} onHover={onHover} />;
  if (pending?.kind === "pickPermanents" && pending.player === HUMAN) {
    const theirs = pending.of !== undefined && pending.of !== HUMAN ? s.players[pending.of]!.name : undefined;
    // Drake Familiar: "return an enchantment to its owner's hand": anyone's permanents to choose from.
    const anyones = pending.of === undefined && pending.options.some((id) => s.objects[id] && controllerOf(s, s.objects[id]!) !== HUMAN);
    const verb = pending.action === "sacrifice" ? "sacrifice" : pending.action === "exile" ? "exile" : pending.action === "libraryTop" ? "put on top of its owner's library" : pending.action === "counters" ? `put a ${pending.counter} counter on` : pending.action === "populate" ? "copy" : pending.action === "choose" ? "choose" : pending.action === "flicker" ? "exile and return" : theirs ? "return to their owner's hand" : anyones ? "return to its owner's hand" : "return to your hand";
    // "other creature" reads "another creature".
    const an = /^other /.test(pending.what) ? `an${pending.what}` : `${/^[aeiou]/i.test(pending.what) ? "an" : "a"} ${pending.what}`;
    // Devour: any number of them; exploit: none or one (pending.min).
    const what = pending.objectId ? `any number of ${pending.what} permanents` : pending.anyNumber ? `any number of ${/s$/.test(pending.what) ? pending.what : `${pending.what.replace(/y$/, "ie")}s`}` : pending.min !== undefined && pending.count === 1 ? `${an}, if you want,` : pending.count === 1 ? an : `${pending.count} (${pending.what})`;
    const n = discards.length;
    // Slaughter the Strong: the chosen creatures' total power, a negative power subtracting.
    const totalPower = pending.maxTotalPower !== undefined || pending.minTotalPower !== undefined ? discards.reduce((t, id) => t + power(s, s.objects[id]!), 0) : 0;
    const untapProblem = pending.action === "untapLimited" ? untapChoiceProblem(s, HUMAN, pending.options, discards) : undefined;
    // Battle for Bretagard: "with different names".
    const sameNames = !!pending.differentNames && !namesDiffer(s, discards);
    // Sigarda's Vanguard: "with different powers".
    const samePowers = !!pending.differentPowers && new Set(discards.map((id) => power(s, s.objects[id]!))).size !== discards.length;
    // Thelon's Curse: "pay {U} for each creature chosen this way": the whole payment, from lands tapped for it.
    const payTaps = pending.payEach ? (n ? planMana(s, HUMAN, parseManaCost(pending.payEach.repeat(n))) : []) : [];
    const ok = (pending.min !== undefined ? n >= pending.min && n <= pending.count : n === pending.count) && !!payTaps && !(pending.action === "band" && n === 1) && (pending.maxTotalPower === undefined || totalPower <= pending.maxTotalPower) && (pending.minTotalPower === undefined || totalPower >= pending.minTotalPower) && !untapProblem && !sameNames && !samePowers;
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong>{" "}
          {pending.prompt
            ? `${pending.prompt}${pending.minTotalPower !== undefined ? ` (total power now ${totalPower})` : ""}${pending.payEach && n && !payTaps ? ` (not enough mana for ${pending.payEach.repeat(n)})` : ""}${sameNames ? " (two of them have the same name)" : ""}${samePowers ? " (two of them have the same power)" : ""}`
            : pending.action === "ringBearer"
            ? `the Ring tempts you: click a creature of yours to be your Ring-bearer. It's legendary and can't be blocked by creatures with greater power, and gains the Ring's other abilities as the Ring tempts you more times.`
            : pending.action === "attach"
            ? `click any number of your Auras and Equipment to attach to ${pending.what}, then attach them (or attach none).`
            : pending.action === "pair"
            ? pending.options.length === 1
              ? `click ${cardOf(s, pending.options[0]!).name} to pair the two (soulbond), if you want.`
              : "click a creature of yours to pair it with (soulbond), if you want."
            : pending.action === "reveal"
              ? `reveal any number of cards in your hand that share a creature type with it (amplify): click them, then reveal.`
              : pending.action === "band"
                ? `put attacking creatures in a band if you want: click creatures with banding and up to one without, all attacking the same player. Blocking one blocks them all, and you divide blockers' damage among them.`
                : pending.action === "tap"
                ? pending.min === undefined
                  ? `click ${pending.count} ${pending.what} of yours to tap.`
                  : `tap any number of ${pending.what}: click them, then tap them. Each one tapped counts for what comes next.`
                : pending.action === "untap"
                ? `click up to ${pending.count} tapped land${pending.count === 1 ? "" : "s"} to untap (any player's), then untap them.`
                : pending.action === "phaseOut"
                ? `choose any number of ${pending.what} to phase out: click them, then phase them out. They're treated as though they don't exist until your next untap step.`
                : pending.action === "keepTapped"
                ? `click the permanents you want to keep tapped (anything "for as long as it remains tapped" keeps going); the rest untap.`
                : pending.action === "untapLimited"
                ? `you can't untap more than ${pending.what}: click the ones to untap; the others stay tapped.${untapProblem && n ? ` (${untapProblem})` : ""}`
                : pending.action === "exert"
                ? `exert attacking creatures if you want: click them. An exerted creature doesn't untap during your next untap step, and its "when you do" ability triggers.`
                : pending.action === "enlist"
                ? `enlist a creature that isn't attacking, if you want: click it to tap it, and ${pending.source} gets +X/+0 until end of turn, where X is its power.`
                : pending.action === "damageCreature"
                ? `${pending.source} is unblocked: click a ${pending.what}, or assign its damage to the player as usual.`
                : pending.action === "unblocked"
                ? `click the blocked attackers that assign their combat damage to the player they're attacking, as though they weren't blocked (the rest damage their blockers).`
                : pending.action === "champion"
                ? `champion: click another ${pending.what} of yours to exile until ${pending.source} leaves the battlefield, or exile none and sacrifice ${pending.source}.`
                : pending.action === "encode"
                ? `cipher: click a creature of yours to exile ${pending.source} encoded on it. Whenever that creature deals combat damage to a player, you may cast a copy of ${pending.source} for free.`
                : pending.action === "unattach"
                ? `click an Equipment to unattach from the creature of yours it's attached to. That creature becomes tapped and gains indestructible until end of turn.`
                : pending.action === "pile"
                ? `separate all permanents ${theirs ?? "you"} control${theirs ? "s" : ""} into two piles: click the ones for the first pile (the rest form the second). ${theirs ?? "You"} sacrifice${theirs ? "s" : ""} all permanents in the pile of ${theirs ? "their" : "your"} choice.`
                : pending.action === "meld"
                ? `meld: click the ${pending.what} to exile with ${pending.source} and meld them into one permanent. A token or a copy can't meld and stays in exile.`
                : pending.action === "keep" && pending.payLife !== undefined
                ? `click the creatures of yours to keep, paying ${pending.payLife} life for each (up to ${pending.count}). The rest are sacrificed.`
                : pending.action === "keep" && pending.maxTotalPower !== undefined
                ? `click any number of your creatures with total power ${pending.maxTotalPower} or less to keep (now ${totalPower}). The rest are sacrificed.`
                : pending.action === "keep" && pending.sparesKin
                ? `click a creature ${pending.of === undefined ? "of yours" : `for ${s.players[pending.of]!.name}`} to keep. The rest that share no creature type with it are sacrificed.`
                : pending.action === "keep"
                ? `click ${pending.count === 1 ? (pending.min === 0 ? `up to one ${pending.what}` : an) : `${pending.min === 0 ? "up to " : ""}${pending.count} ${pending.what}s`} ${pending.destroy ? "to keep (anyone's)" : pending.of === undefined ? "of yours to keep" : `for ${s.players[pending.of]!.name} to keep`}. The rest are ${pending.destroy ? "destroyed" : pending.bounce ? "returned to their owners' hands" : "sacrificed"}.`
                : pending.owned
                ? `click a permanent ${theirs ? `${theirs} owns` : "you own"} (whoever controls it) to gain control of it.`
                : `click ${what} ${theirs ? `${theirs} controls` : anyones ? "(anyone's)" : "of yours"} to ${verb}.`}
          {pending.looked?.length ? (
            <>
              {" "}
              Looked at:{" "}
              {pending.looked.map((id, i) => (
                <span key={id} className="looked-card" data-looked={id} {...hoverProps(cardOf(s, id), onHover)}>
                  {i ? ", " : ""}
                  {cardOf(s, id).name}
                </span>
              ))}
              .
            </>
          ) : null}
        </span>
        <button disabled={!ok} onClick={() => dispatch([...(payTaps ?? []), { type: "pickPermanents", player: HUMAN, ids: discards }])}>
          {pending.payEach ? (n ? `Pay ${pending.payEach.repeat(n)} and untap ${n}` : "Untap none") : pending.action === "attach" ? (n ? `Attach ${n}` : "Attach none") : pending.action === "keep" ? (n ? `Keep ${n}` : "Keep none") : pending.action === "ringBearer" ? "Choose Ring-bearer" : pending.action === "encode" ? (n ? "Encode" : "Don't encode") : pending.action === "champion" ? (n ? "Exile" : `Sacrifice ${pending.source}`) : pending.action === "band" ? (n ? `Band ${n}` : "No band") : pending.action === "enlist" ? (n ? "Enlist" : "Don't enlist") : pending.action === "exert" ? (n ? `Exert ${n}` : "Don't exert") : pending.action === "keepTapped" ? (n ? `Keep ${n} tapped` : "Untap all") : pending.action === "untapLimited" ? `Untap ${n}` : pending.action === "phaseOut" ? (n ? `Phase out ${n}` : "Phase out none") : pending.action === "untap" ? (n ? `Untap ${n}` : "Untap none") : pending.action === "tap" ? (n ? `Tap ${n}` : "Tap none") : pending.action === "unblocked" ? (n ? `Assign ${n} as unblocked` : "Damage the blockers") : pending.action === "damageCreature" ? (n ? "Damage that creature" : "Damage the player") : pending.action === "reveal" ? (n ? `Reveal ${n}` : "Reveal none") : pending.action === "discard" ? (n ? `Discard ${n}` : "Discard none") : pending.action === "pile" ? `First pile: ${n}, second pile: ${pending.count - n}` : pending.action === "flicker" ? (n ? `Exile and return ${n}` : "Exile none") : pending.prompt && pending.action === "counters" ? (n ? "Put counters" : "Put none") : pending.min !== undefined && n === 0 ? (pending.action === "pair" ? "Don't pair" : pending.action === "choose" ? "Choose none" : pending.action === "bounce" ? "Return none" : "Sacrifice none") : pending.action === "pair" ? "Pair" : pending.action === "sacrifice" ? "Sacrifice" : pending.action === "exile" ? "Exile" : pending.action === "libraryTop" ? "Put on top" : pending.action === "counters" ? "Put counter" : pending.action === "populate" ? "Copy" : pending.action === "choose" ? "Choose" : pending.action === "meld" ? "Meld" : pending.action === "unattach" ? "Unattach" : "Return"}
        </button>
      </div>
    );
  }
  if (pending?.kind === "chooseOption" && (pending.what === "copy" || pending.what === "copyOther") && pending.player === HUMAN)
    return (
      <div className="controls copy-pick">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt ?? "enter as a copy of"}
        </span>
        {pending.options.map((o, i) => (
          <button
            key={o}
            className={o === "none" ? "ghost" : ""}
            onMouseEnter={() => o !== "none" && s.objects[o] && onHover(cardOf(s, o))}
            onMouseLeave={() => onHover(null)}
            onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}
          >
            {pending.labels?.[i] ?? o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "damageSource" && pending.player === HUMAN)
    // A source of damage for a prevention or redirection effect (CR 609.7a): a permanent, a spell, or an ability's source.
    return (
      <div className="controls source-pick">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt}
        </span>
        {pending.options.map((o, i) => {
          const id = o.split("@")[0]!;
          return (
            <button
              key={o}
              className="ghost"
              onMouseEnter={() => s.objects[id] && onHover(cardOf(s, id))}
              onMouseLeave={() => onHover(null)}
              onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}
            >
              {pending.labels?.[i] ?? o}
            </button>
          );
        })}
      </div>
    );
  if (pending?.kind === "chooseOption" && (pending.what === "enchant" || pending.what === "attachHost") && pending.player === HUMAN)
    // An Aura put onto the battlefield without being cast: what it enchants (CR 303.4f). Grifter's Blade: the creature
    // you control it enters attached to (CR 614.12).
    return (
      <div className="controls enchant-pick">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt}
        </span>
        {pending.options.map((o, i) => (
          <button
            key={o}
            className="ghost"
            onMouseEnter={() => s.objects[o] && onHover(cardOf(s, o))}
            onMouseLeave={() => onHover(null)}
            onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}
          >
            {pending.labels?.[i] ?? o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "vote" && pending.player === HUMAN)
    // A vote (CR 701.38): a word, or a permanent or card ("id@zc"), shown with whose it is; the earlier votes in the prompt.
    return (
      <div className="controls vote-pick">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt}
        </span>
        {pending.options.map((o, i) => {
          const id = o.split("@")[0]!;
          const card = o.includes("@") && s.objects[id];
          return (
            <button
              key={o}
              className={o === "none" ? "ghost" : ""}
              onMouseEnter={() => card && onHover(cardOf(s, id))}
              onMouseLeave={() => onHover(null)}
              onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}
            >
              {pending.labels?.[i] ?? o}
            </button>
          );
        })}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "keyword" && pending.player === HUMAN)
    return (
      <div className="controls keyword-pick">
        <span>
          <strong>{pending.source}:</strong> choose an ability
        </span>
        {pending.options.map((o) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "cardType" && pending.player === HUMAN)
    return (
      <div className="controls card-type-pick">
        <span>
          <strong>{pending.source}:</strong> choose a card type
        </span>
        {pending.options.map((o) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "basicLandType" && pending.player === HUMAN)
    return (
      <div className="controls color-pick">
        <span>
          <strong>{pending.source}:</strong> choose a basic land type
        </span>
        {pending.options.map((o) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            <ManaCost cost={`{${({ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" } as Record<string, string>)[o] ?? "C"}}`} size="sm" /> {o}
          </button>
        ))}
      </div>
    );
  // "Choose a land type" (Traveler's Cloak, Illusionary Presence, Barbarian Guides): any land type, basic or not.
  if (pending?.kind === "chooseOption" && pending.what === "landType" && pending.player === HUMAN)
    return (
      <div className="controls color-pick">
        <span>
          <strong>{pending.source}:</strong> choose a land type
        </span>
        {pending.options.map((o) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {o}
          </button>
        ))}
      </div>
    );
  // "Choose odd or even" (Extinction Event, Gollum): zero is even.
  if (pending?.kind === "chooseOption" && pending.what === "parity" && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> choose odd or even (zero is even)
        </span>
        {pending.options.map((o) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {o === "odd" ? "Odd" : "Even"}
          </button>
        ))}
      </div>
    );
  // Sarpadian Empires, Vol. VII: "choose white Citizen, blue Camarid, ...": a color and a creature type at once.
  if (pending?.kind === "chooseOption" && pending.what === "colorAndType" && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> choose a color and creature type
        </span>
        {pending.options.map((o) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            <ManaCost cost={`{${({ white: "W", blue: "U", black: "B", red: "R", green: "G" } as Record<string, string>)[o.split(" ")[0]!] ?? "C"}}`} size="sm" /> {o.charAt(0).toUpperCase() + o.slice(1)}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "colors" && pending.player === HUMAN) return <ColorsPick key={pending.source} pending={pending} dispatch={dispatch} />;
  if (pending?.kind === "chooseOption" && pending.what === "color" && pending.player === HUMAN)
    return (
      <div className="controls color-pick">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt ?? "choose a color"}
        </span>
        {(Object.keys(COLOR_NAMES) as (keyof typeof COLOR_NAMES)[])
          .filter((c) => pending.options.includes(COLOR_NAMES[c]))
          .map((c) => (
            <button key={c} className="ghost" title={COLOR_NAMES[c]} onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: COLOR_NAMES[c] }])}>
              <ManaCost cost={`{${c}}`} size="sm" /> {COLOR_NAMES[c]}
            </button>
          ))}
      </div>
    );
  if (pending?.kind === "assist" && pending.player === HUMAN) {
    const caster = s.players[pending.caster]!.name;
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {caster} asks you to help pay for it (assist): up to {"{"}
          {pending.max}
          {"}"} of its generic mana.
        </span>
        <button className="ghost" onClick={() => dispatch([{ type: "assist", player: HUMAN, n: 0 }])}>
          Don&apos;t help
        </button>
        {Array.from({ length: pending.max }, (_, i) => i + 1).map((n) => {
          const taps = planMana(s, HUMAN, parseManaCost(`{${n}}`));
          return (
            <button key={n} disabled={!taps} onClick={() => dispatch([...(taps ?? []), { type: "assist", player: HUMAN, n }])}>
              Pay <ManaCost cost={`{${n}}`} size="sm" />
            </button>
          );
        })}
      </div>
    );
  }
  if (pending?.kind === "assistCast" && pending.player === HUMAN) {
    const rest = assistedRemaining(s);
    const taps = rest && planMana(s, HUMAN, rest.cost, rest.extra);
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {pending.n ? `${s.players[pending.helper]!.name} pays {${pending.n}}.` : `${s.players[pending.helper]!.name} doesn't help.`} Pay the rest?
        </span>
        <button disabled={!taps} onClick={() => dispatch([...(taps ?? []), { type: "finishAssistedCast", player: HUMAN }])}>
          Cast it
        </button>
        <button className="ghost" onClick={() => dispatch([{ type: "finishAssistedCast", player: HUMAN, cancel: true }])}>
          Don&apos;t cast it
        </button>
      </div>
    );
  }
  if (pending?.kind === "chooseOption" && pending.what === "endure" && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> endure with
        </span>
        {pending.options.map((o, i) => (
          <button key={o} className={i === 0 ? "" : "ghost"} onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {pending.labels?.[i] ?? o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "demonstrate" && pending.player === HUMAN)
    return (
      <div className="controls demonstrate-pick">
        <span>
          <strong>{pending.source}:</strong> which opponent also copies it?
        </span>
        {pending.options.map((o, i) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {pending.labels?.[i] ?? o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "clash" && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> clash with which opponent?
        </span>
        {pending.options.map((o, i) => (
          <button key={o} className="ghost" onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {pending.labels?.[i] ?? o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption" && pending.what === "venture" && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {pending.labels ? "venture into which room?" : "venture into which dungeon?"}
        </span>
        {pending.options.map((o, i) => (
          <button key={o} className="ghost" title={pending.labels?.[i]} onClick={() => dispatch([{ type: "chooseOption", player: HUMAN, choice: o }])}>
            {o}
          </button>
        ))}
      </div>
    );
  if (pending?.kind === "chooseOption")
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {pending.what === "cardName" ? `${pending.prompt ?? "choose a card name"}.` : "choose a creature type."}
        </span>
      </div>
    );
  if (pending?.kind === "chooseMay" && pending.vault)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> keep these cards or pay life to look at the next ones.
        </span>
      </div>
    );
  if (pending?.kind === "chooseMay" && pending.pay) {
    // "You may pay {1}. If you do, ...": Pay taps what's needed, like ward's prompt.
    const { mana, life = 0, energy = 0 } = pending.pay;
    const me = s.players[HUMAN]!;
    const taps = me.life >= life && (me.energy ?? 0) >= energy ? (mana ? planMana(s, HUMAN, parseManaCost(mana), 0, undefined, [], mayPayUse(s, pending)) : []) : null;
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> <RulesText text={pending.prompt.charAt(0).toUpperCase() + pending.prompt.slice(1)} />?{pending.otherwise ? ` ${pending.otherwise}` : ""}
        </span>
        <button disabled={!taps} onClick={() => dispatch([...(taps ?? []), { type: "chooseMay", player: HUMAN, yes: true }])}>
          Pay
        </button>
        <button className="ghost" onClick={() => dispatch([{ type: "chooseMay", player: HUMAN, yes: false }])}>
          Don&apos;t pay
        </button>
      </div>
    );
  }
  // Fiery Gambit: flip again, or stop with the flips won so far.
  if (pending?.kind === "chooseMay" && pending.flipAgain)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> you've won {pending.flipAgain.wins === 1 ? "a flip" : `${pending.flipAgain.wins} flips in a row`}. Flip another coin? If you lose a flip, {pending.source} has no effect{pending.flipAgain.wins >= pending.flipAgain.enough ? ` (more wins than ${pending.flipAgain.enough} do nothing more)` : ""}.
        </span>
        <button onClick={() => dispatch([{ type: "chooseMay", player: HUMAN, yes: true }])}>Flip again</button>
        <button className="ghost" onClick={() => dispatch([{ type: "chooseMay", player: HUMAN, yes: false }])}>
          Stop flipping
        </button>
      </div>
    );
  if (pending?.kind === "chooseMay")
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt.charAt(0).toUpperCase() + pending.prompt.slice(1)}?{pending.otherwise ? ` ${pending.otherwise}` : ""}
        </span>
        <button onClick={() => dispatch([{ type: "chooseMay", player: HUMAN, yes: true }])}>Yes</button>
        <button className="ghost" onClick={() => dispatch([{ type: "chooseMay", player: HUMAN, yes: false }])}>
          No
        </button>
      </div>
    );
  if (pending?.kind === "payUnless") {
    // You can tap mana by hand first (CR 605.3a); Pay taps whatever else is needed.
    const life = pending.life ?? 0;
    const discard = pending.discard ?? pending.discardRandom ?? 0;
    // "Ward—Sacrifice a creature": you pick which after choosing to pay.
    const sac = pending.sacrifice;
    const canSacrifice = !sac || pickOptions(s, sac, HUMAN).length >= sac.n;
    // "Ward—Blight 2": only with a creature to put the counters on (CR 701.68b); you pick it after choosing to pay.
    const canBlight = !pending.blight || blightOptions(s, HUMAN, pending.blight).length > 0;
    // "Ward—Collect evidence 4": only with enough mana value in your graveyard (rulings); you pick the cards after.
    const canEvidence = !pending.collectEvidence || evidenceValue(s, evidenceCandidates(s, HUMAN)) >= pending.collectEvidence;
    const taps = s.players[HUMAN]!.life >= life && s.players[HUMAN]!.hand.length >= discard && canSacrifice && canBlight && canEvidence ? planMana(s, HUMAN, parseManaCost(pending.cost)) : null;
    // Ward—Waterbend: mana first, then your artifacts and creatures pay {1} each of the rest (CR 701.67a).
    const water = !taps && pending.waterbend ? autoWaterbend(s, HUMAN, parseManaCost(pending.cost), 0, pending.waterbend, []) : null;
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong>{" "}
          {sac ? (
            `sacrifice ${sac.n === 1 ? (/^[aeiou]/i.test(sac.filter.text) ? "an" : "a") : sac.n === 2 ? "two" : sac.n === 3 ? "three" : sac.n} ${sac.filter.text}${sac.n === 1 ? "" : "s"}`
          ) : pending.discardHand ? (
            "discard your hand"
          ) : pending.exileGraveyard ? (
            "exile all cards from your graveyard"
          ) : discard ? (
            `discard ${discard === 1 ? "a card" : `${discard} cards`}${pending.discardRandom ? " at random" : ""}`
          ) : pending.collectEvidence ? (
            `collect evidence ${pending.collectEvidence} (exile cards with total mana value ${pending.collectEvidence} or more from your graveyard)`
          ) : pending.blight ? (
            `blight ${pending.blight} (put ${pending.blight === 1 ? "a -1/-1 counter" : `${pending.blight} -1/-1 counters`} on a creature you control)`
          ) : pending.poison ? (
            `get ${pending.poison} poison counter${pending.poison === 1 ? "" : "s"}`
          ) : pending.cost === "{0}" && life ? (
            `pay ${life} life`
          ) : (
            <>
              pay <ManaCost cost={pending.cost} size="sm" />
            </>
          )}
          {life && !(pending.cost === "{0}" && !discard && !sac && !pending.blight && !pending.collectEvidence) ? ` and ${life} life` : ""}
          {pending.waterbend ? ` (waterbend: your artifacts and creatures can each pay {1} of up to ${pending.waterbend})` : ""} or {pending.otherwise ?? `${pending.what} is countered`}.
        </span>
        <button disabled={!taps && !water} onClick={() => dispatch(water ? [...water.taps, { type: "payUnless", player: HUMAN, pay: true, tap: water.tapped }] : [...(taps ?? []), { type: "payUnless", player: HUMAN, pay: true }])}>
          {water ? `Pay, tapping ${water.tapped.length === 1 ? "1 artifact or creature" : `${water.tapped.length} artifacts or creatures`}` : "Pay"}
        </button>
        <button className="ghost" onClick={() => dispatch([{ type: "payUnless", player: HUMAN, pay: false }])}>
          Don&apos;t pay
        </button>
      </div>
    );
  }
  if (pending?.kind === "mulligan") {
    const keepSize = s.players[HUMAN]!.hand.length - pending.bottomIfKept;
    return (
      <div className="controls">
        <span>
          <strong>Opening hand.</strong>{" "}
          {pending.bottomIfKept
            ? `Keep ${keepSize} (${pending.bottomIfKept} to the bottom) or mulligan?`
            : pending.taken === 0
              ? "Keep 7 or mulligan? The first one is free."
              : "Keep 7 or mulligan again?"}
        </span>
        <button onClick={() => dispatch([{ type: "mulligan", player: HUMAN, keep: true }])}>Keep</button>
        <button
          className="ghost"
          disabled={!pending.canMulligan}
          title={`Shuffle your hand away and draw 7. Keeping after that puts ${pending.taken} card${pending.taken === 1 ? "" : "s"} on the bottom.`}
          onClick={() => dispatch([{ type: "mulligan", player: HUMAN, keep: false }])}
        >
          Mulligan
        </button>
      </div>
    );
  }
  if (pending?.kind === "bottomCards")
    return (
      <div className="controls">
        <span>
          Click {pending.count} card{pending.count === 1 ? "" : "s"} to put on the bottom of your library{pending.count > 1 ? " (first pick goes lowest)" : ""}.
        </span>
        <button disabled={discards.length !== pending.count} onClick={() => dispatch([{ type: "bottomCards", player: HUMAN, objectIds: discards }])}>
          Put on bottom
        </button>
      </div>
    );
  // Library of Leng: which of the cards being discarded go on top of the library instead.
  if (pending?.kind === "handToTop" && pending.player === HUMAN && pending.discarding)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}: </strong>you discard {pending.discarding.map((id) => cardOf(s, id).name).join(", ")}. Click any of {pending.discarding.length === 1 ? "it" : "them"} to put on top of your
          library instead of into your graveyard{discards.length > 1 ? " (first pick ends on top)" : ""}.
        </span>
        <button onClick={() => dispatch([{ type: "handToTop", player: HUMAN, objectIds: discards }])}>
          {discards.length ? `Put ${discards.length} on top` : "All to the graveyard"}
        </button>
      </div>
    );
  // Scroll Rack: any number of cards, traded for as many from the top of the library.
  if (pending?.kind === "handToTop" && pending.player === HUMAN && pending.upTo)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}: </strong>click any number of cards to exile face down and trade for as many from the top of your library; they go back on top
          {discards.length > 1 ? " (first pick ends on top)" : ""}.
        </span>
        <button onClick={() => dispatch([{ type: "handToTop", player: HUMAN, objectIds: discards }])}>
          {discards.length ? `Trade ${discards.length} card${discards.length === 1 ? "" : "s"}` : "Trade none"}
        </button>
      </div>
    );
  if (pending?.kind === "handToTop" && pending.player === HUMAN && pending.shuffle)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}: </strong>click {pending.count} card{pending.count === 1 ? "" : "s"} to shuffle into your library.
        </span>
        <button disabled={discards.length !== pending.count} onClick={() => dispatch([{ type: "handToTop", player: HUMAN, objectIds: discards }])}>
          Shuffle in
        </button>
      </div>
    );
  if (pending?.kind === "handToTop" && pending.player === HUMAN)
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}: </strong>click {pending.count} card{pending.count === 1 ? "" : "s"} to put on {pending.bottom ? "the bottom" : "top"} of your library
          {pending.count > 1 ? (pending.bottom ? " (first pick goes lowest)" : " (first pick ends on top)") : ""}.
        </span>
        <button disabled={discards.length !== pending.count} onClick={() => dispatch([{ type: "handToTop", player: HUMAN, objectIds: discards }])}>
          {pending.bottom ? "Put on bottom" : "Put on top"}
        </button>
      </div>
    );
  if (pending?.kind === "discardToHandSize" || pending?.kind === "discard")
    return (
      <div className="controls">
        <span>
          {pending.kind === "discard" ? <strong>{pending.source}: </strong> : "Hand size: "}
          click {pending.kind === "discard" && pending.upTo ? "up to " : ""}
          {pending.count} {pending.kind === "discard" && pending.filter ? pending.filter.text.replace(/^(?:an? )/, "") : "card"}
          {pending.count === 1 ? "" : "s"} {pending.kind === "discard" && pending.among && !pending.exile ? `of the ones you just drew (${pending.among.map((id) => cardOf(s, id).name).join(", ")})` : "in your hand"} to {pending.kind === "discard" && pending.exile ? "exile" : "discard"}.
        </span>
        <button
          disabled={(pending.kind === "discard" && pending.upTo ? discards.length > pending.count : discards.length !== pending.count) || (pending.kind === "discard" && !!pending.filter && discards.some((id) => !printedMatches(pending.filter!, cardOf(s, id)))) || (pending.kind === "discard" && !!pending.among && discards.some((id) => !pending.among!.includes(id)))}
          onClick={() => dispatch([{ type: "discard", player: HUMAN, objectIds: discards }])}
        >
          {pending.kind === "discard" && pending.exile ? "Exile" : "Discard"}
        </button>
      </div>
    );
  const mine = waitingOn(s) === HUMAN;
  return (
    <div className="controls">
      <button disabled={!mine} onClick={() => dispatch([{ type: "passPriority", player: HUMAN }])}>
        {s.stack.length ? "Resolve" : "Pass"}
      </button>
    </div>
  );
}

/** The phases of a turn (CR 500.1), which the log groups each turn's lines by. */
const PHASE_LABEL: Record<Step, string> = {
  untap: "Beginning",
  upkeep: "Beginning",
  draw: "Beginning",
  main1: "Main 1",
  beginCombat: "Combat",
  declareAttackers: "Combat",
  declareBlockers: "Combat",
  firstStrikeDamage: "Combat",
  combatDamage: "Combat",
  endCombat: "Combat",
  main2: "Main 2",
  end: "End",
  cleanup: "End",
};

const isTurnLine = (e: GameEvent) => e.text.startsWith("— Turn ");

interface LogPhase {
  key: string;
  label?: string;
  entries: GameEvent[];
}

/** The log's last `max` lines you may see, by turn and, within a turn, by phase, in the order they happened. */
function logGroups(s: GameState, max: number): { key: string; head: string; phases: LogPhase[] }[] {
  // Hidden information is only shown to the player who may see it (CR 402.3).
  const seen = s.log.filter((e) => e.to === undefined || e.to === HUMAN);
  const heads = new Map(seen.filter(isTurnLine).map((e) => [e.turn, e.text.replace(/^— | —$/g, "")]));
  const turns: { key: string; turn: number; head: string; phases: LogPhase[] }[] = [];
  for (const e of seen.slice(-max)) {
    let t = turns[turns.length - 1];
    if (!t || t.turn !== e.turn) turns.push((t = { key: `t${e.seq}`, turn: e.turn, head: heads.get(e.turn) ?? `Turn ${e.turn}`, phases: [] }));
    if (isTurnLine(e)) continue;
    const label = e.step && PHASE_LABEL[e.step];
    let ph = t.phases[t.phases.length - 1];
    if (!ph || ph.label !== label) t.phases.push((ph = { key: `p${e.seq}`, ...(label ? { label } : {}), entries: [] }));
    ph.entries.push(e);
  }
  return turns;
}

/** The names of the cards in this game, each with the card it shows when hovered in the log: whole cards and each face. */
function logCardNames(s: GameState): { names: Map<string, CardDef>; pattern: RegExp | null } {
  const names = new Map<string, CardDef>();
  for (const d of Object.values(s.cards)) {
    if (d.oracleId === FACE_DOWN.oracleId || d.oracleId === FACE_DOWN_WARD.oracleId) continue;
    if (!names.has(d.name)) names.set(d.name, d);
    d.faces?.forEach((f, i) => {
      if (!names.has(f.name)) names.set(f.name, faceDef(d, i));
    });
  }
  const escaped = [...names.keys()]
    .filter((n) => n.length > 1)
    .sort((a, b) => b.length - a.length) // the longest name first: "Llanowar Elves" before "Llanowar"
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // A whole name only, not part of a longer word.
  return { names, pattern: escaped.length ? new RegExp(`(?<![\\p{L}\\p{N}'])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "gu") : null };
}

/** A log line with the cards it names underlined; hovering one shows the card. */
function LogLine({ text, names, pattern, onHover }: { text: string; names: Map<string, CardDef>; pattern: RegExp | null; onHover: (d: CardDef | null) => void }) {
  if (!pattern) return <RulesText text={text} />;
  const parts = text.split(pattern); // the names land at the odd indexes
  return (
    <>
      {parts.map((part, i) => {
        const d = i % 2 ? names.get(part) : undefined;
        return d ? (
          <span key={i} className="card-ref" data-card-ref={part} {...hoverProps(d, onHover)}>
            {part}
          </span>
        ) : (
          <RulesText key={i} text={part} />
        );
      })}
    </>
  );
}

function GameLog({ s, onHover }: { s: GameState; onHover: (d: CardDef | null) => void }) {
  const cardCount = Object.keys(s.cards).length;
  // The game's cards only ever grow (tokens, copies): look them up again when there are more.
  const { names, pattern } = useMemo(() => logCardNames(s), [cardCount]);
  // Newest first: the latest turn on top, and in it the latest phase, each under its heading.
  return useMemo(() => {
    const turns = logGroups(s, 80).reverse();
    return (
      <div className="log">
        {turns.map((t) => (
          <section key={t.key} className="log-turn">
            <div className="turn-line">{youGrammar(t.head)}</div>
            {[...t.phases].reverse().map((ph) => (
              <div key={ph.key} className="log-phase" data-phase={ph.label}>
                {ph.label && <div className="phase-line">{ph.label}</div>}
                {[...ph.entries].reverse().map((e) => (
                  <div key={e.seq} className="log-entry">
                    <LogLine text={youGrammar(e.text)} names={names} pattern={pattern} onHover={onHover} />
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    );
    // Only a new line changes it, not every hover elsewhere on the table.
  }, [s.log, names, pattern, onHover]);
}

/** The engine logs "<name> plays X"; read naturally when the name is "You". */
function youGrammar(text: string) {
  if (/(^|: )You /.test(text)) text = text.replace(/^You (surveils|scries)\b/, (_, v: string) => `You ${v === "scries" ? "scry" : "surveil"}`).replace(/ their (graveyard|library|hand|next turn)\b/g, " your $1");
  // "You faces a villainous choice and chooses: ..." (CR 701.55).
  text = text.replace(/(^|\. |: )You faces a villainous choice and chooses\b/g, "$1You face a villainous choice and choose");
  return text.replace(/(^|\. |: )You (plays|casts|declares|discards|loses|draws|gains|mills|activates|chooses|sacrifices|goes|cycles|crews|saddles|stations|pays|takes|keeps|exiles|reveals|puts|turns|gets|wins|searches|becomes|returns|attaches|creates|deals|taps|untaps|destroys|counters|regenerates|attacks|blocks|looks|connives|proliferates|amasses|copies|votes)\b/g, (_, pre: string, v: string) =>
    `${pre}You ${v === "loses" ? "lose" : v === "goes" ? "go" : v === "searches" ? "search" : v === "amasses" ? "amass" : v === "copies" ? "copy" : v.slice(0, -1)}`,
  );
}

/** Whom a creature you're declaring as an attacker attacks: a player, or a planeswalker they control. */
type AttackTo = { defender: PlayerId; planeswalker?: string };

/** Attacks and blocks you're lining up, before you confirm them. */
interface Combat {
  attacks: Record<string, AttackTo>;
  aim: string | null;
  blocks: Record<string, string[]>;
  blocker: string | null;
  /** Creatures picked to crew a Vehicle, shown as arrows into it. */
  crew?: { vehicle: string; chosen: string[] };
}

const ATTACK_COLOR = "#e65a43";
const BLOCK_COLOR = "#4596e6";

/**
 * Arrows for everything aimed right now: stack items' targets, a bot lining up, your own
 * choice in progress, and combat: each attacker to the player it attacks, each blocker to
 * what it blocks, whether declared or still being chosen.
 */
function targetingArrows(s: GameState, targeting: Targeting | null, intent: ReturnType<typeof useGame>["intent"], combat: Combat): ArrowSpec[] {
  const out: ArrowSpec[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.attacking !== undefined)
      out.push({ key: `atk:${id}`, from: [`[data-obj="${id}"]`], to: [o.attackingPermanent ? `[data-obj="${o.attackingPermanent.id}"]` : `[data-player="${o.attacking}"]`], color: ATTACK_COLOR });
    for (const a of o.blocking ?? []) out.push({ key: `blk:${id}:${a}`, from: [`[data-obj="${id}"]`], to: [`[data-obj="${a}"]`], color: BLOCK_COLOR });
  }
  // Attacks and blocks still being chosen; for the render right after they're declared, the arrows above have them.
  const drawn = new Set(out.map((a) => a.key));
  for (const [id, a] of Object.entries(combat.attacks))
    if (!drawn.has(`atk:${id}`)) out.push({ key: `atk:${id}`, from: [`[data-obj="${id}"]`], to: [a.planeswalker ? `[data-obj="${a.planeswalker}"]` : `[data-player="${a.defender}"]`], color: ATTACK_COLOR });
  for (const [id, atts] of Object.entries(combat.blocks))
    for (const att of atts) if (!drawn.has(`blk:${id}:${att}`)) out.push({ key: `blk:${id}:${att}`, from: [`[data-obj="${id}"]`], to: [`[data-obj="${att}"]`], color: BLOCK_COLOR });
  if (combat.aim) out.push({ key: "aim", from: [`[data-obj="${combat.aim}"]`], to: "cursor", color: ATTACK_COLOR, aiming: true });
  if (combat.blocker) out.push({ key: "aim", from: [`[data-obj="${combat.blocker}"]`], to: "cursor", color: BLOCK_COLOR, aiming: true });
  for (const id of combat.crew?.chosen ?? [])
    out.push({ key: `crew:${id}`, from: [`[data-obj="${id}"]`], to: [`[data-obj="${combat.crew!.vehicle}"]`], color: playerColor(HUMAN), aiming: true });
  // A card in a graveyard is pointed at in the graveyard window while that's open, else at its owner's graveyard pile.
  const targetSelectors = (t: TargetChoice) => {
    const o = t.kind === "object" ? s.objects[t.id] : undefined;
    return [...baseSelectors(t), ...(o && o.zone === "graveyard" ? [`[data-graveyard="${o.owner}"]`] : [])];
  };
  // Only the top of the stack shows its targets: it's the one about to resolve, and arrows from
  // everything below would pile up. The others show theirs once they're on top.
  for (const it of s.stack.slice(-1))
    (it.targets ?? []).forEach((t, i) =>
      out.push({
        key: `${it.id}:${i}`,
        from: [`[data-stack="${it.id}"]`, ...(it.sourceId ? [`[data-obj="${it.sourceId}"]`] : []), "[data-stack-tab]"],
        to: targetSelectors(t),
        color: playerColor(it.controller),
      }),
    );
  if (intent) {
    // Bots' hands are hidden, so a spell's arrow starts from their hand count.
    const from = [intent.sourceId ? `[data-obj="${intent.sourceId}"]` : `[data-hand="${intent.player}"]`, `[data-player="${intent.player}"]`];
    intent.targets.forEach((t, i) => out.push({ key: `intent:${i}`, from, to: targetSelectors(t), color: playerColor(intent.player), aiming: true }));
  }
  if (targeting) {
    const sourceId = targeting.mode === "trigger" ? (s.pending?.kind === "chooseTargets" ? s.pending.sourceId : undefined) : targeting.mode === "copy" || targeting.mode === "change" || targeting.mode === "retarget" ? undefined : targeting.mode === "cast" ? targeting.draft.objectId : targeting.objectId;
    const from = [...(sourceId ? [`[data-obj="${sourceId}"]`] : []), `[data-player="${HUMAN}"]`];
    const color = playerColor(HUMAN);
    targeting.chosen.forEach((t, i) => out.push({ key: `mine:${i}`, from, to: targetSelectors(t), color }));
    if (targeting.chosen.length < targeting.specs.length) out.push({ key: "cursor", from, to: "cursor", color, aiming: true });
  }
  return out;
}

/** The stack as real cards, covering the side panel while anything is on it. Top of the stack first. */
function StackOverlay({
  s,
  hidden,
  onToggle,
  canTarget,
  onPick,
  onHover,
}: {
  s: GameState;
  hidden: boolean;
  onToggle: () => void;
  canTarget: (id: string) => boolean;
  onPick: (id: string) => void;
  onHover: (d: CardDef | null) => void;
}) {
  const items = [...s.stack].reverse();
  if (hidden)
    return (
      <button className="stack-tab" data-stack-tab onClick={onToggle}>
        Stack ({items.length}) · show
      </button>
    );
  return (
    <div className="stack-overlay" data-stack-tab>
      <header>
        <strong>Stack</strong>
        <span className="muted small">{items.length === 1 ? "1 item" : `${items.length} items, top resolves first`}</span>
        <button className="ghost" onClick={onToggle}>
          Show log
        </button>
      </header>
      <div className="stack-cards">
        {items.map((it, i) => (
          <StackCard key={it.id} s={s} it={it} top={i === 0} targetable={canTarget(it.id)} onPick={() => onPick(it.id)} onHover={onHover} />
        ))}
      </div>
    </div>
  );
}

function StackCard({
  s,
  it,
  top,
  targetable,
  onPick,
  onHover,
}: {
  s: GameState;
  it: StackItem;
  top: boolean;
  targetable: boolean;
  onPick: () => void;
  onHover: (d: CardDef | null) => void;
}) {
  const d = it.objectId ? cardOf(s, it.objectId) : it.sourceCardId ? s.cards[it.sourceCardId] : undefined;
  const seen = it.objectId ? seenCardOf(s, it.objectId) : d;
  const who = s.players[it.controller]!;
  const targets = describeTargets(s, it.targets).replace(/^ targeting /, "");
  return (
    <div
      className={`stack-card ${top ? "top" : ""} ${targetable ? "targetable" : ""}`}
      style={{ ["--who" as string]: playerColor(it.controller) }}
      onClick={onPick}
    >
      <div className={`card ${it.kind === "ability" ? "ability" : ""}`} data-stack={it.id} {...(seen ? hoverProps(seen, onHover) : {})}>
        {d ? <CardFace d={d} peek={seen !== d ? seen : undefined} /> : <div className="card-text">{it.description}</div>}
        {it.kind === "ability" && <span className="ability-banner">Ability</span>}
      </div>
      <div className="stack-info">
        <div className="stack-who">{who.name}</div>
        <div className="stack-desc">{it.kind === "ability" || !d ? <RulesText text={it.description} /> : d.name}</div>
        {d && it.kind === "spell" && <ManaCost cost={d.manaCost} size="sm" />}
        {it.x !== undefined && <div className="stack-x">X = {it.x}</div>}
        {it.kind === "spell" && it.modes && it.body && <div className="stack-modes">{it.body.text.replace(/~/g, d?.name ?? "")}</div>}
        {targets && <div className="stack-targets">→ {targets}</div>}
        {top && <div className="muted small">resolves next</div>}
      </div>
    </div>
  );
}

/**
 * The steps of the turn with the current one lit. Clicking a step marks it as a stop: on
 * opponents' turns you get to act there even with auto-pass on.
 */
function PhaseTrack({ s, stops, onToggle }: { s: GameState; stops: ReadonlySet<Step>; onToggle: (st: Step) => void }) {
  return (
    <span className="phase-track">
      {PHASES.map((st) => {
        const now = !s.mulligans && (st === s.step || (st === "combatDamage" && s.step === "firstStrikeDamage"));
        const can = STOPPABLE.includes(st);
        const stop = stops.has(st);
        return (
          <button
            key={st}
            className={["step", now ? "on" : "", stop ? "stop" : ""].join(" ")}
            disabled={!can}
            aria-pressed={can ? stop : undefined}
            title={can ? (stop ? `You'll stop at the next ${STEP_LABEL[st].toLowerCase()} on an opponent's turn, once. Click to cancel.` : `Click to stop at the next ${STEP_LABEL[st].toLowerCase()} on an opponent's turn, even with auto-pass on. The stop clears after you pass there.`) : "No one gets priority in this step."}
            onClick={() => onToggle(st)}
          >
            {STEP_LABEL[st]}
          </button>
        );
      })}
    </span>
  );
}

const HOVER_DELAY_MS = 160;

/**
 * The card under the mouse, shown large beside it: on the battlefield, in your hand, on the
 * stack, or in a picker. It waits a moment before appearing (so sweeping across the table
 * doesn't flash cards) and then follows the mouse, flipping to the other side near an edge.
 */
function HoverCard({ d, onGone }: { d: CardDef | null; onGone: () => void }) {
  const [shown, setShown] = useState<CardDef | null>(null);
  const showing = useRef(false);
  showing.current = !!shown;
  const ref = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const gone = useRef(onGone);
  gone.current = onGone;
  // A card that leaves the table under the mouse (a spell resolving) never reports the mouse
  // leaving it, so after every update check there's still a card under the mouse.
  const check = () => {
    const { x, y } = mouse.current;
    if (!document.elementFromPoint(x, y)?.closest(".card, .card-ref")) gone.current();
  };

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = mouse.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // A card in your hand shows above the hand, so it covers neither its neighbours nor the way to them.
    const slot = document.elementFromPoint(x, y)?.closest<HTMLElement>(".hand .fan-slot");
    if (slot) {
      const fan = slot.parentElement!.getBoundingClientRect();
      const card = slot.querySelector<HTMLElement>(".card");
      // Clear of the hovered card, which rises a quarter of its height (styles.css).
      const room = fan.top - (card?.offsetHeight ?? 0) * 0.25 - 16;
      const k = Math.min(1, Math.max(0.5, room / h)); // shrunk to fit on a short screen
      const r = slot.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.left + r.width / 2 - (w * k) / 2), innerWidth - w * k - 8);
      el.style.transform = `translate(${left}px, ${Math.max(8, room - h * k)}px) scale(${k})`;
      return;
    }
    const gap = 28;
    let left = x + gap;
    if (left + w > innerWidth - 8) left = x - gap - w;
    left = Math.max(8, left);
    const top = Math.min(Math.max(8, y - h / 2), innerHeight - h - 8);
    el.style.transform = `translate(${left}px, ${top}px)`;
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      place();
      if (showing.current) check();
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  useEffect(() => {
    // Moving from one card to the next switches at once; leaving waits a moment in case
    // the mouse is just crossing a gap between cards.
    const t = setTimeout(() => setShown(d), !d ? 80 : showing.current ? 0 : HOVER_DELAY_MS);
    return () => clearTimeout(t);
  }, [d]);

  useLayoutEffect(place);
  useEffect(() => {
    if (d) check();
  });
  if (!shown) return null;
  return createPortal(
    <div className="hover-card" ref={ref}>
      <BigCardFace key={shown.name} d={shown} />
    </div>,
    document.body,
  );
}

/** A large card: its image, or its full rules text when there's no image (offline). */
function BigCardFace({ d }: { d: CardDef }) {
  const [failed, setFailed] = useState(false);
  if (d.imageUrl && !failed) return <img src={d.imageUrl} alt={d.name} draggable={false} onError={() => setFailed(true)} />;
  return (
    <div className="big-text">
      <div className="oracle-head">
        <strong>{d.name}</strong> <ManaCost cost={d.manaCost} />
      </div>
      <div className="muted">{d.typeLine}</div>
      <p>
        <RulesText text={d.oracleText} />
      </p>
      {d.power !== undefined && (
        <div className="big-pt">
          {d.power}/{d.toughness}
        </div>
      )}
    </div>
  );
}

const HAND_KEY = "cc.handMinimized";

/**
 * Your hand, fanned out over the bottom right of your play area. The arrow tucks it almost
 * off screen (and brings it back); hovering a card lifts it, and the large preview shows it
 * next to the mouse.
 */
function useHandTucked() {
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem(HAND_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setMinimized(!minimized);
    try {
      localStorage.setItem(HAND_KEY, minimized ? "0" : "1");
    } catch {
      // Storage unavailable: the choice lasts for this game only.
    }
  };
  return [minimized, toggle] as const;
}

function Hand({ s, ids, cardProps, tucked, onToggle }: { s: GameState; ids: string[]; cardProps: CardProps; tucked: boolean; onToggle: () => void }) {
  // Overlap the cards just enough to fit in about two thirds of your play area.
  const dock = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0.62); // the fraction of each card not covered by the next
  useLayoutEffect(() => {
    const fit = () => {
      const el = dock.current;
      const card = el?.querySelector<HTMLElement>(".fan .card");
      if (!el || !card || ids.length < 2) return;
      const room = el.clientWidth * 0.66 - 100;
      setShown(Math.min(0.62, Math.max(0.22, (room / card.offsetWidth - 1) / (ids.length - 1))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (dock.current) ro.observe(dock.current);
    return () => ro.disconnect();
  }, [ids.length]);

  const mid = (ids.length - 1) / 2;
  const step = Math.min(4, 22 / Math.max(1, ids.length)); // degrees between neighbours
  return (
    <div className="hand-dock" ref={dock}>
      <div className={`hand ${tucked ? "tucked" : ""}`} style={{ ["--shown" as string]: shown }}>
        <button className="hand-toggle" onClick={onToggle} title={tucked ? "Show your hand" : "Tuck your hand away"} aria-expanded={!tucked}>
          <span className="hand-arrow">{tucked ? "▲" : "▼"}</span> Hand {ids.length}
        </button>
        <div className="fan">
          {ids.map((id, i) => {
            const off = i - mid;
            return (
              <div
                key={id}
                className="fan-slot"
                style={{ ["--rot" as string]: `${off * step}deg`, ["--drop" as string]: (off / Math.max(1, mid)) ** 2 * 0.06 }}
              >
                <CardView o={s.objects[id]!} {...cardProps} playable={(isLand(s, id) ? canPlayLand(s, id) : canCastWithTaps(s, id)) || canUseFace(s, id) || canCycle(s, id) || altCostsFor(s, HUMAN, s.objects[id]!).some((a) => canCastAlt(s, id, a.kind)) || (!!compileCard(cardOf(s, id)).faceDownCast && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { faceDown: true }) !== null) || (!!compileCard(cardOf(s, id)).suspend && planSuspend(s, HUMAN, id) !== null) || (!!compileCard(cardOf(s, id)).plot && planPlot(s, HUMAN, id) !== null) || (!!compileCard(cardOf(s, id)).foretell && planForetell(s, HUMAN, id) !== null)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Hold priority (the default), or auto-pass everything except your stops. */
function PriorityToggle({ mode, onChange }: { mode: PriorityMode; onChange: (m: PriorityMode) => void }) {
  return (
    <div className="prio-toggle" role="radiogroup" aria-label="Priority">
      <span className="muted small">Priority</span>
      <button
        role="radio"
        aria-checked={mode === "hold"}
        className={mode === "hold" ? "on" : ""}
        onClick={() => onChange("hold")}
        title="Stop whenever something happens you could respond to, even when you're tapped out or have nothing to play, so opponents can't read your hand."
      >
        Hold
      </button>
      <button
        role="radio"
        aria-checked={mode === "auto"}
        className={mode === "auto" ? "on" : ""}
        onClick={() => onChange("auto")}
        title="Always pass and let things resolve, even when you could respond. You still stop on your own main phases, for attacks, blocks and choices, and at the steps you've marked on the phase track."
      >
        Auto-pass
      </button>
    </div>
  );
}

/**
 * Shortcuts for loops (CR 732.2): mark where a loop starts, play it once by hand, then have it go round as many more
 * times as you like. The bots go along with it, or stop it where they'd do something else.
 */
function LoopBar({ s, loop, note, onStart, onCancel, onRepeat }: { s: GameState; loop: LoopRecording | null; note: string | null; onStart: () => void; onCancel: () => void; onRepeat: (times: number) => void }) {
  const [times, setTimes] = useState(10);
  const canStart = waitingOn(s) === HUMAN && !s.pending;
  if (!loop)
    return (
      <div className="loop-bar">
        <button
          disabled={!canStart}
          onClick={onStart}
          title="For a loop you can repeat (a combo): start here, play it once, and when you're back here with priority, repeat it as many times as you like. This is a shortcut, like in paper Magic (CR 732)."
        >
          Start a loop
        </button>
        {note && <span className="small">{note}</span>}
      </div>
    );
  const ready = loopReady(s, loop);
  return (
    <div className="loop-bar recording">
      <span className="small">
        {ready ? "Back where the loop began." : `Recording a loop (${loop.body.length} action${loop.body.length === 1 ? "" : "s"}): play it once, until you have priority here again.`}
      </span>
      {ready && (
        <>
          <input type="number" min={1} max={999} value={times} onChange={(e) => setTimes(Math.max(1, Math.min(999, Math.floor(Number(e.target.value)) || 1)))} aria-label="Times to repeat" />
          <button onClick={() => onRepeat(times)} title="Repeat the loop this many more times. Each opponent can stop it where they'd do something else (CR 732.2b).">
            Repeat
          </button>
        </>
      )}
      <button onClick={onCancel}>{ready ? "Done" : "Cancel"}</button>
    </div>
  );
}

/** The player's name; hovering it shows the commander damage they've taken. */
function PlayerName({ s, pid, waiting }: { s: GameState; pid: PlayerId; waiting: boolean }) {
  const [at, setAt] = useState<DOMRect | null>(null);
  const p = s.players[pid]!;
  const ids = new Set([
    ...Object.values(s.objects)
      .filter((o) => o.isCommander && o.owner !== pid)
      .map((o) => o.id),
    ...Object.keys(p.commanderDamage),
  ]);
  const rows = [...ids]
    .map((id) => {
      const o = s.objects[id];
      return { id, n: p.commanderDamage[id] ?? 0, name: o ? cardOf(s, id).name : "Commander", owner: o ? s.players[o.owner]!.name : "" };
    })
    .sort((a, b) => b.n - a.n);
  return (
    <span className="name" onMouseEnter={(e) => setAt(e.currentTarget.getBoundingClientRect())} onMouseLeave={() => setAt(null)}>
      {/* Always there (just hidden off-turn) so the name never shifts: arrows aimed at a player point at it. */}
      <span className={`turn-dot${s.activePlayer === pid ? "" : " off"}`} title={s.activePlayer === pid ? "Active player" : undefined} />
      <span className="name-text" data-player={pid}>
        {p.name}
      </span>
      {waiting && <span className="priority-tag">priority</span>}
      {at &&
        createPortal(
          <div className="cmd-pop" style={{ left: at.left, top: at.bottom + 6 }}>
            <div className="cmd-pop-title">Commander damage taken</div>
            {rows.map((r) => (
              <div key={r.id} className={`cmd-row ${r.n >= 15 ? "danger" : r.n > 0 ? "hit" : ""}`}>
                <span className="cmd-name">
                  {r.name} <span className="muted small">({r.owner})</span>
                </span>
                <span className="cmd-n">{r.n}/21</span>
                <span className="cmd-bar">
                  <span style={{ width: `${Math.min(100, (r.n / 21) * 100)}%` }} />
                </span>
              </div>
            ))}
            {rows.length === 0 && <div className="muted small">No commanders yet.</div>}
          </div>,
          document.body,
        )}
    </span>
  );
}
