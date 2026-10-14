import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  abilityProblem,
  canCast,
  castProblem,
  planTurnFaceUp,
  faceUpCost,
  turnFaceUpProblem,
  delveRoom,
  graveyardCast,
  mayPlayFromExile,
  commanderTax,
  abilitiesOf,
  controllerOf,
  describeTargets,
  describeCount,
  canChooseTarget,
  legalModes,
  spellModes,
  withModes,
  planActivate,
  spellTargets,
  isSummoningSick,
  legalActions,
  manaAbilitiesOn,
  manaOptions,
  spellCost,
  freeCastOf,
  manaPenalty,
  planManaAbility,
  type ManaOption,
  doesNothingNow,
  attackProblem,
  blockProblem,
  blockRequirementProblem,
  maxBlocks,
  pairedWith,
  legalTargets,
  characteristics,
  modifications,
  opponents,
  planCast,
  planMana,
  objectMatches,
  printedMatches,
  parseManaCost,
  autoConvoke,
  autoCrew,
  compileCard,
  canEnterUntapped,
  crewPower,
  potentialAttackers,
  returnCandidates,
  power,
  toughness,
  waitingOn,
  type CardDef,
  type GameObject,
  type GameState,
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
} from "@cc/engine";
import { HUMAN, STOPPABLE, cardOf, seenCardOf, isCreature, isLand, newGame, useGame, type DeckBundle, type PriorityMode } from "./useGame";
import { Arrows, targetSelectors as baseSelectors, type ArrowSpec } from "./Arrows";
import { ManaCost, ManaPoolView, RulesText } from "./Mana";

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

export function App() {
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

type ZoneView = { pid: PlayerId; zone: "graveyard" | "exile" };

/** The human is picking targets for a spell, an activated ability, or a triggered ability (after its modes, if modal). */
type Targeting =
  | { mode: "cast"; draft: CastDraft; specs: TargetSpec[]; chosen: TargetChoice[]; label: string }
  | { mode: "activate"; objectId: string; index: number; specs: TargetSpec[]; chosen: TargetChoice[]; label: string; modes?: number[]; x?: number }
  | { mode: "trigger"; specs: TargetSpec[]; chosen: TargetChoice[]; label: string }
  /** New targets for a copy of a spell (CR 707.10c), or keep the old ones. */
  | { mode: "copy"; specs: TargetSpec[]; chosen: TargetChoice[]; label: string };

/** The human is choosing modes for a modal spell or activated ability they're casting (CR 700.2a). */
type ModePick = { mode: "cast"; objectId: string; label: string; body: AbilityBody; convoke?: string[] } | { mode: "activate"; objectId: string; index: number; label: string; body: AbilityBody };

/** Picking creatures to tap: to crew a Vehicle (CR 702.122a) or to convoke a spell (CR 702.51a). */
type TapPick = { kind: "crew"; objectId: string; index: number; n: number; chosen: string[] } | { kind: "convoke"; objectId: string; chosen: string[] };

/**
 * A spell being cast, built up step by step in the order of CR 601.2b-h: modes, kicker, X,
 * targets, then additional costs to pay. Convoke creatures are picked first, as a shortcut.
 */
type CastDraft = {
  objectId: string;
  convoke?: string[];
  modes?: number[];
  kicks?: number[];
  x?: number;
  targets?: TargetChoice[];
  sacrifice?: string[];
  discard?: string[];
  exileCards?: string[];
  /** Cast from your graveyard this way (flashback, escape, ...). */
  via?: CastFromGraveyardKind;
  buyback?: boolean;
  /** Cast for its evoke or dash cost (CR 118.9). */
  alt?: AltCostKind;
  /** Cards exiled from your graveyard for delve (CR 702.66a). */
  delve?: string[];
};

/** Choosing cards to exile for delve: any number up to `max`. */
type DelvePick = { draft: CastDraft; label: string; max: number; candidates: string[]; chosen: string[] };

/** Paying buyback or not (CR 702.27). */
type BuybackPick = { draft: CastDraft; label: string; cost: string };

/** Choosing which kicker costs to pay (CR 702.33). */
type KickPick = { draft: CastDraft; label: string; costs: string[]; multi: boolean; chosen: number[] };

/** Choosing what pays an additional cost: permanents to sacrifice, cards to discard or to exile from your graveyard. */
type CostPick = ({ draft: CastDraft; activate?: undefined } | { activate: ActivateDraft; draft?: undefined }) & {
  kind: "sacrifice" | "discard" | "exileCards" | "returnToHand";
  label: string;
  what: string;
  n: number;
  candidates: string[];
  chosen: string[];
};

/** An activated ability being activated, in the order of CR 602.2b: modes, X, targets, then costs. */
type ActivateDraft = { objectId: string; index: number; modes?: number[]; x?: number; targets?: TargetChoice[]; sacrifice?: string[]; discard?: string[]; returnToHand?: string[] };

/** Announcing X for a spell or activated ability with {X} in its cost (CR 107.3a, 601.2b, 602.2b). */
type XPick =
  | { mode: "cast"; draft: CastDraft; label: string; cost: string; max: number; value: number }
  | { mode: "activate"; objectId: string; index: number; label: string; cost: string; max: number; value: number; modes?: number[] };

/** The biggest X you can pay for (`plan(x)` is null when you can't), up to 99. */
/** How many "up to" targets in a row start at `i`. */
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

function Table({ initial, onQuit }: { initial: GameState; onQuit: () => void }) {
  const { state: s, dispatch, error, intent, priorityMode, setPriorityMode, stops, toggleStop } = useGame(initial);
  const [hover, setHover] = useState<CardDef | null>(null);
  const [attacks, setAttacks] = useState<Record<string, PlayerId>>({});
  /** The creature you've clicked to attack with, waiting for you to click the player it attacks. */
  const [aim, setAim] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Record<string, string[]>>({});
  const [blocker, setBlocker] = useState<string | null>(null);
  const [discards, setDiscards] = useState<string[]>([]);
  const [viewing, setViewing] = useState<ZoneView | null>(null);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [modePick, setModePick] = useState<ModePick | null>(null);
  const [menu, setMenu] = useState<string | null>(null); // permanent (or card in hand) whose abilities are shown
  const [tapPick, setTapPick] = useState<TapPick | null>(null);
  const [xPick, setXPick] = useState<XPick | null>(null);
  const [kickPick, setKickPick] = useState<KickPick | null>(null);
  const [buybackPick, setBuybackPick] = useState<BuybackPick | null>(null);
  const [costPick, setCostPick] = useState<CostPick | null>(null);
  const [delvePick, setDelvePick] = useState<DelvePick | null>(null);
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
    if (pending?.kind === "chooseTargets") setTargeting({ mode: "trigger", specs: pending.specs, chosen: [], label: pending.description });
    else if (pending?.kind === "copyTargets") setTargeting({ mode: "copy", specs: pending.specs, chosen: [], label: `${pending.source === pending.copyOf.replace(/ \(X=\d+\)$/, "") ? `${pending.copyOf} (copy)` : `${pending.source}: copy of ${pending.copyOf}`}${pending.left > 1 ? ` (${pending.left} copies left)` : ""}` });
    else setTargeting((t) => (t?.mode === "trigger" || t?.mode === "copy" ? null : t));
  }, [pending?.kind, pending?.kind === "chooseTargets" ? pending.description : pending?.kind === "copyTargets" ? `${pending.copyOf}#${pending.left}` : ""]);

  const opps = useMemo(() => (s ? opponents(s, HUMAN) : []), [s]);

  // Space passes priority (or resolves); Escape cancels targeting or closes the ability menu.
  const picking = !!(xPick || kickPick || costPick || delvePick);
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
        setAim(null);
        setBlocker(null);
        setTargeting((t) => (t?.mode === "trigger" || t?.mode === "copy" ? t : null));
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
  const pickingFromHand = pending?.kind === "discard" || pending?.kind === "discardToHandSize" || pending?.kind === "bottomCards";
  const handTucked = handMinimized && !pickingFromHand && pending?.kind !== "mulligan";

  const nextSpec = targeting ? targeting.specs[targeting.chosen.length] : undefined;
  // "Another target creature" on a permanent's ability can't be that permanent.
  const targetSource = targeting?.mode === "activate" ? targeting.objectId : targeting?.mode === "trigger" && pending?.kind === "chooseTargets" ? pending.sourceId : undefined;
  const canTarget = (c: TargetChoice) => !!s && !!targeting && !!nextSpec && canChooseTarget(s, targeting.specs, targeting.chosen, targeting.chosen.length, c, HUMAN, undefined, targetSource);

  function pickTarget(c: TargetChoice) {
    if (!s || !targeting || !nextSpec) return;
    if (!canTarget(c)) return;
    finishTargets([...targeting.chosen, c]);
  }

  /** "Up to two target creatures": leave the rest of them unchosen (CR 115.6). */
  function skipTargets() {
    if (!targeting) return;
    const chosen = [...targeting.chosen];
    while (chosen.length < targeting.specs.length && targeting.specs[chosen.length]!.optional) chosen.push({ kind: "none" });
    finishTargets(chosen);
  }

  function finishTargets(chosen: TargetChoice[]) {
    if (!targeting) return;
    if (chosen.length < targeting.specs.length) return setTargeting({ ...targeting, chosen });
    setTargeting(null);
    if (targeting.mode === "trigger") return dispatch([{ type: "chooseTargets", player: HUMAN, targets: chosen }]);
    if (targeting.mode === "copy") return dispatch([{ type: "copyTargets", player: HUMAN, targets: chosen }]);
    if (targeting.mode === "cast") return continueCast({ ...targeting.draft, targets: chosen });
    continueActivate({ objectId: targeting.objectId, index: targeting.index, modes: targeting.modes, x: targeting.x, targets: chosen });
  }

  function useAbility(objectId: string, index: number, modes?: number[], x?: number) {
    if (!s) return;
    setMenu(null);
    const ab = abilitiesOf(s, s.objects[objectId]!).activated[index]!;
    const label = `${cardOf(s, objectId).name}: ${ab.text}`;
    // Crew: pick the creatures to tap, starting from a suggestion.
    if (ab.crew !== undefined) return setTapPick({ kind: "crew", objectId, index, n: ab.crew, chosen: autoCrew(s, HUMAN, objectId, ab.crew) ?? [] });
    if (ab.body.modal && !modes) return setModePick({ mode: "activate", objectId, index, label, body: ab.body });
    // X is announced after modes and before targets (CR 602.2b, 601.2b-c).
    if (x === undefined && parseManaCost(ab.manaCost).hasX) {
      const max = maxX((n) => planActivate(s, HUMAN, objectId, index, undefined, modes, undefined, n));
      return setXPick({ mode: "activate", objectId, index, label, cost: ab.manaCost, max, value: max, modes });
    }
    const body = withModes(ab.body, modes);
    if (body.targets.length) return setTargeting({ mode: "activate", objectId, index, specs: body.targets, chosen: [], label, modes, x });
    continueActivate({ objectId, index, modes, x });
  }

  /** After targets: pick what to sacrifice or discard for the ability's costs (CR 602.2b, 601.2h), then activate. */
  function continueActivate(d: ActivateDraft) {
    if (!s) return;
    const ab = abilitiesOf(s, s.objects[d.objectId]!).activated[d.index]!;
    for (const c of ab.costs ?? []) {
      if (c.kind === "returnToHand") {
        // Ninjutsu: click the unblocked attacker to return (CR 702.49a).
        if (d.returnToHand !== undefined) continue;
        return setCostPick({ activate: d, kind: c.kind, label: cardOf(s, d.objectId).name, what: `return ${c.n === 1 ? "an" : c.n} ${c.filter.text} to hand`, n: c.n, candidates: returnCandidates(s, HUMAN, c), chosen: [] });
      }
      if (c.kind !== "sacrifice" && c.kind !== "discard") continue;
      if (d[c.kind] !== undefined) continue;
      const candidates =
        c.kind === "sacrifice"
          ? s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === HUMAN && !(c.other && id === d.objectId) && objectMatches(s, c.filter, s.objects[id]!, HUMAN, false))
          : s.players[HUMAN]!.hand.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id))));
      const what = c.kind === "sacrifice" ? c.filter.text : (c.filter?.text ?? "card");
      const article = c.kind === "sacrifice" && c.other ? "another" : /^[aeiou]/i.test(what) ? "an" : "a";
      return setCostPick({ activate: d, kind: c.kind, label: cardOf(s, d.objectId).name, what: `${c.kind} ${c.n === 1 ? article : c.n} ${what}${c.n > 1 ? "s" : ""}`, n: c.n, candidates, chosen: [] });
    }
    const costs = { ...(d.sacrifice?.length ? { sacrifice: d.sacrifice } : {}), ...(d.discard?.length ? { discard: d.discard } : {}), ...(d.returnToHand?.length ? { returnToHand: d.returnToHand } : {}) };
    dispatch(
      planActivate(s, HUMAN, d.objectId, d.index, d.targets, d.modes, undefined, d.x, costs) ?? [
        { type: "activateAbility", player: HUMAN, objectId: d.objectId, index: d.index, targets: d.targets, modes: d.modes, ...(d.x ? { x: d.x } : {}), costs },
      ],
    );
  }

  /** Done picking what to sacrifice, discard or exile: carry on casting or activating. */
  function finishCostPick(pick: CostPick) {
    setCostPick(null);
    if (pick.activate) continueActivate({ ...pick.activate, [pick.kind]: pick.chosen });
    else if (pick.kind !== "returnToHand") continueCast({ ...pick.draft, [pick.kind]: pick.chosen });
  }

  /**
   * The next step of casting a spell, after modes: kicker and X are announced, then targets
   * chosen (CR 601.2b-c), then additional costs paid along with the mana (601.2h).
   */
  function continueCast(d: CastDraft) {
    if (!s) return;
    const card = cardOf(s, d.objectId);
    const compiled = compileCard(card);
    const free = freeCastOf(s, HUMAN) === d.objectId;
    const how = { ...(d.via ? { via: d.via } : {}), ...(d.buyback ? { buyback: true } : {}), ...(d.alt ? { alt: d.alt } : {}) };
    const kicks = { ...how, ...(d.kicks?.length ? { kicks: d.kicks } : {}) };
    if (d.kicks === undefined && compiled.kicker)
      return setKickPick({ draft: d, label: card.name, costs: compiled.kicker.costs, multi: !!compiled.kicker.multi, chosen: [] });
    if (d.buyback === undefined && compiled.buyback) return setBuybackPick({ draft: d, label: card.name, cost: compiled.buyback });
    // Cast without paying its mana cost, X is 0 (CR 107.3b).
    if (d.x === undefined && parseManaCost(card.manaCost).hasX && !free && !d.via && !d.alt) {
      const max = maxX((n) => planCast(s, HUMAN, d.objectId, undefined, d.modes, d.convoke ?? "auto", n, kicks));
      return setXPick({ mode: "cast", draft: d, label: card.name, cost: card.manaCost, max, value: max });
    }
    const specs = spellTargets(s, d.objectId, d.modes);
    if (d.targets === undefined && specs.length) return setTargeting({ mode: "cast", draft: d, specs, chosen: [], label: d.x !== undefined ? `${card.name} (X=${d.x})` : card.name });
    for (const c of [...(compiled.additionalCosts ?? []), ...(graveyardCast(card, d.via)?.costs ?? [])]) {
      if (c.kind === "payLife" || c.kind === "returnToHand") continue; // no spell asks to return a permanent yet
      const key = c.kind === "exileFromGraveyard" ? "exileCards" : c.kind;
      if (d[key] !== undefined) continue;
      const me = s.players[HUMAN]!;
      const candidates =
        c.kind === "sacrifice"
          ? s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === HUMAN && objectMatches(s, c.filter, s.objects[id]!, HUMAN, false))
          : c.kind === "discard"
            ? me.hand.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id))))
            : me.graveyard.filter((id) => id !== d.objectId && (!c.filter || printedMatches(c.filter, cardOf(s, id))));
      const what = c.kind === "sacrifice" ? c.filter.text : c.kind === "discard" ? (c.filter?.text ?? "card") : (c.filter?.text ?? (d.via === "escape" ? "other card" : "card"));
      const verb = c.kind === "sacrifice" ? "sacrifice" : c.kind === "discard" ? "discard" : "exile from your graveyard";
      return setCostPick({ draft: d, kind: key, label: card.name, what: `${verb} ${c.n === 1 ? (/^[aeiou]/i.test(what) ? "an" : "a") : c.n} ${what}${c.n > 1 ? "s" : ""}`, n: c.n, candidates, chosen: [] });
    }
    const choices = {
      ...kicks,
      ...(d.sacrifice?.length ? { sacrifice: d.sacrifice } : {}),
      ...(d.discard?.length ? { discard: d.discard } : {}),
      ...(d.exileCards?.length ? { exileCards: d.exileCards } : {}),
      ...(d.delve?.length ? { delve: d.delve } : {}),
    };
    // Delve: pick cards to exile from your graveyard, suggesting just enough to pay (CR 702.66a).
    if (d.delve === undefined && !free) {
      const max = delveRoom(s, HUMAN, d.objectId, choices, d.x ?? 0);
      if (max > 0) {
        const candidates = s.players[HUMAN]!.graveyard.filter((id) => id !== d.objectId && !d.exileCards?.includes(id));
        let need = 0;
        while (need < max && !planCast(s, HUMAN, d.objectId, d.targets, d.modes, d.convoke ?? "auto", d.x, { ...choices, ...(need ? { delve: candidates.slice(0, need) } : {}) })) need++;
        return setDelvePick({ draft: d, label: card.name, max, candidates, chosen: candidates.slice(0, need) });
      }
    }
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
    else useAbility(pick.objectId, pick.index, pick.modes, pick.value);
  }

  /**
   * Start casting a card from your hand or command zone. A convoke spell first asks which
   * creatures to tap (suggesting some only when your mana can't pay), then modes, then targets.
   */
  function startCast(id: string, convoke?: string[], via?: CastFromGraveyardKind, alt?: AltCostKind) {
    if (!s) return;
    const d = cardOf(s, id);
    if (via) return continueCast({ objectId: id, via }); // from a graveyard: the usual steps, without convoke
    if (alt) return continueCast({ objectId: id, alt }); // evoke or dash
    if (convoke === undefined && compileCard(d).convoke && convokers(s).length && freeCastOf(s, HUMAN) !== id) {
      const fromMana = planCast(s, HUMAN, id) !== null;
      const total = spellCost(s, HUMAN, s.objects[id]!);
      const auto = fromMana ? null : autoConvoke(s, HUMAN, total.cost, total.extra);
      return setTapPick({ kind: "convoke", objectId: id, chosen: auto?.creatures ?? [] });
    }
    const modal = spellModes(s, id);
    const specs = spellTargets(s, id);
    if (modal || specs.length || parseManaCost(d.manaCost).hasX || compileCard(d).kicker || compileCard(d).additionalCosts) {
      if (!canCastWithTaps(s, id, convoke)) return dispatch([{ type: "castSpell", player: HUMAN, objectId: id, ...(convoke?.length ? { convoke } : {}) }]); // shows why not
      if (modal) return setModePick({ mode: "cast", objectId: id, label: d.name, body: { targets: [], effects: [], text: d.oracleText, modal }, convoke });
    }
    return continueCast({ objectId: id, convoke });
  }

  function finishTapPick() {
    if (!s || !tapPick) return;
    setTapPick(null);
    if (tapPick.kind === "convoke") return startCast(tapPick.objectId, tapPick.chosen);
    const { objectId, index, chosen } = tapPick;
    dispatch(planActivate(s, HUMAN, objectId, index, undefined, undefined, chosen) ?? [{ type: "activateAbility", player: HUMAN, objectId, index, tapCreatures: chosen }]);
  }

  function pickModes(modes: number[]) {
    const pick = modePick;
    setModePick(null);
    if (pending?.kind === "chooseModes") return dispatch([{ type: "chooseModes", player: HUMAN, modes }]);
    if (!pick) return;
    if (pick.mode === "cast") continueCast({ objectId: pick.objectId, modes, convoke: pick.convoke });
    else useAbility(pick.objectId, pick.index, modes);
  }

  function clickCard(o: GameObject) {
    if (!s) return;
    const d = cardOf(s, o.id);
    if (targeting) {
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
      const chosen = tapPick.chosen.includes(o.id) ? tapPick.chosen.filter((x) => x !== o.id) : [...tapPick.chosen, o.id];
      return setTapPick({ ...tapPick, chosen });
    }
    // Attacking: click a creature, then the player it attacks (an arrow follows the mouse).
    // Clicking an attacking creature again takes it out of the attack.
    if (pending?.kind === "declareAttackers") {
      if (controllerOf(s, o) !== HUMAN || !potentialAttackers(s, HUMAN).some((a) => a.id === o.id)) return;
      if (o.id in attacks) {
        const next = { ...attacks };
        delete next[o.id];
        setAttacks(next);
        setAim(null);
      } else if (opps.length === 1) setAttacks({ ...attacks, [o.id]: opps[0]! }); // potentialAttackers checked it can attack them
      else setAim(aim === o.id ? null : o.id);
      return;
    }
    // Blocking: click one of your untapped creatures, then the attacker it blocks. One that can block more
    // than one creature (CR 509.1a) stays picked until it's full; clicking one of its attackers again unblocks it.
    if (pending?.kind === "declareBlockers") {
      if (controllerOf(s, o) === HUMAN && o.zone === "battlefield" && isCreature(s, o.id) && !o.tapped) {
        const mine = blocks[o.id] ?? [];
        if (blocker === o.id) setBlocker(null);
        else if (mine.length && mine.length >= maxBlocks(s, o)) {
          const next = { ...blocks };
          delete next[o.id];
          setBlocks(next);
          setBlocker(null);
        } else setBlocker(o.id);
      } else if (blocker && o.attacking === HUMAN) {
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
    if (pending?.kind === "discardToHandSize" || pending?.kind === "discard" || pending?.kind === "bottomCards") {
      if (o.zone === "hand" && o.owner === HUMAN)
        setDiscards((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id].slice(-pending.count)));
      return;
    }
    if (controllerOf(s, o) !== HUMAN && o.owner !== HUMAN) return;
    // A card with cycling, evoke or dash: choose between casting (or playing) it and the other way.
    if (o.zone === "hand" && (handAbilities(s, o.id).length || compileCard(cardOf(s, o.id)).altCosts?.length || compileCard(cardOf(s, o.id)).faceDownCast)) return setMenu(o.id);
    // A land that may enter untapped by paying life or revealing a card: ask which.
    if (o.zone === "hand" && isLand(s, o.id) && compileCard(cardOf(s, o.id)).entersTappedChoice) return setMenu(o.id);
    if (o.zone === "hand" && isLand(s, o.id)) return dispatch([{ type: "playLand", player: HUMAN, objectId: o.id }]);
    if (o.zone === "hand" || o.zone === "command") return startCast(o.id);
    if (o.zone === "battlefield" && controllerOf(s, o) === HUMAN) {
      const mana = usableManaOptions(s, o);
      const abs = manaAbilitiesOn(s, o);
      // A menu when there's a choice to make: other abilities, a color, or a cost beyond tapping it.
      if (o.faceDown || abilitiesOf(s, o).activated.length || mana.length > 1 || mana.some((x) => manaPenalty(abs[x.ability]!) > 0)) return setMenu(o.id);
      const plan = mana[0] && planManaAbility(s, HUMAN, o.id, mana[0].ability, mana[0].mana);
      if (plan) dispatch(plan);
    }
  }

  // Creatures that can still be told to attack or block glow, like playable cards.
  const attackers = pending?.kind === "declareAttackers" ? new Set(potentialAttackers(s, HUMAN).map((a) => a.id)) : null;
  const attackingMe = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.attacking === HUMAN);
  const canBlockWith = (o: GameObject) =>
    pending?.kind === "declareBlockers" && controllerOf(s, o) === HUMAN && o.zone === "battlefield" && (blocks[o.id]?.length ?? 0) < maxBlocks(s, o) &&
    attackingMe.some((a) => !blockProblem(s, o, a));
  // Only attackers this blocker could legally block (flying, menace's partner aside) light up.
  const blockable = (id: string) => {
    const a = s.objects[id];
    return !!blocker && a?.attacking === HUMAN && !blockProblem(s, s.objects[blocker]!, a);
  };
  const cardProps: CardProps = {
    s,
    onClick: clickCard,
    onHover: setHover,
    attacks,
    blocks,
    blocker: blocker ?? aim,
    discards: [...discards, ...(tapPick?.chosen ?? []), ...(costPick?.chosen ?? [])],
    targetable: (id) => canTarget({ kind: "object", id }) || blockable(id),
    ready: (o) =>
      (!!attackers?.has(o.id) && !(o.id in attacks) && aim !== o.id) ||
      (canBlockWith(o) && blocker !== o.id) ||
      (!!tapPick && !tapPick.chosen.includes(o.id) && tapCandidates(s, tapPick).some((c) => c.id === o.id)) ||
      (!!costPick && !costPick.chosen.includes(o.id) && costPick.candidates.includes(o.id)) ||
      (pending?.kind === "pickPermanents" && pending.player === HUMAN && pending.options.includes(o.id) && !discards.includes(o.id)),
  };
  const waiting = waitingOn(s);
  const corners = seatCorners(s);
  const combat: Combat = { attacks, aim, blocks, blocker, crew: tapPick?.kind === "crew" ? { vehicle: tapPick.objectId, chosen: tapPick.chosen } : undefined };
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
                setAttacks({ ...attacks, [aim]: pid });
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
          <GameLog s={s} />
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
            {waiting !== null && waiting !== HUMAN && <span className="thinking">{s.players[waiting]!.name} is thinking…</span>}
          </div>
          <PhaseTrack s={s} stops={stops} onToggle={toggleStop} />
          {targeting && (
            <div className="targeting">
              <span>
                <strong>{targeting.label}</strong>: choose {nextSpec?.text}{" "}
                {nextSpec?.optional ? `(optional, up to ${optionalLeft(targeting.specs, targeting.chosen.length)} more)` : `(${targeting.chosen.length + 1}/${targeting.specs.length})`}
              </span>
              {nextSpec?.optional && <button onClick={skipTargets}>{targeting.chosen.some((c) => c.kind !== "none") ? "Done" : "Choose none"}</button>}
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
              {targeting.mode !== "trigger" && targeting.mode !== "copy" && <button onClick={() => setTargeting(null)}>Cancel</button>}
            </div>
          )}
          {targeting && nextSpec?.kind === "card" && (
            <GraveyardPicker
              s={s}
              label={targeting.label}
              spec={nextSpec}
              allowed={(id) => canTarget({ kind: "object", id })}
              onSkip={nextSpec.optional ? skipTargets : undefined}
              onHover={setHover}
              onPick={(id) => pickTarget({ kind: "object", id })}
              onCancel={targeting.mode === "trigger" || targeting.mode === "copy" ? undefined : () => setTargeting(null)}
            />
          )}
          {(modePick || pending?.kind === "chooseModes") && (
            <ModeMenu
              key={modePick ? `${modePick.mode}:${modePick.objectId}` : `trigger:${pending?.kind === "chooseModes" ? pending.description : ""}`}
              {...(pending?.kind === "chooseModes"
                ? { label: pending.description.split(":")[0]!, min: pending.min, max: pending.max, modes: pending.modes, legal: pending.legal }
                : { label: modePick!.label, min: modePick!.body.modal!.min, max: modePick!.body.modal!.max, modes: modePick!.body.modal!.modes.map((m) => m.text), legal: legalModes(s, modePick!.body, HUMAN) })}
              sourceName={(pending?.kind === "chooseModes" ? cardOf(s, pending.sourceId) : cardOf(s, modePick!.objectId)).name}
              onDone={pickModes}
              onCancel={pending?.kind === "chooseModes" ? undefined : () => setModePick(null)}
            />
          )}
          {pending?.kind === "chooseOption" && pending.what === "creatureType" && pending.player === HUMAN && (
            <TypePicker key={pending.source} s={s} pending={pending} onDone={(choice) => dispatch([{ type: "chooseOption", player: HUMAN, choice }])} />
          )}
          {pending?.kind === "searchLibrary" && (
            <LibrarySearch
              key={pending.source + pending.cards.join(",")}
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
              source={pending.source}
              cards={pending.cards}
              onHover={setHover}
              onDone={(top, away) => dispatch([{ type: "arrangeTop", player: HUMAN, top, away }])}
            />
          )}
          {menu && s.objects[menu] && (
            <AbilityMenu
              s={s}
              objectId={menu}
              onUse={useAbility}
              onMana={(x) => {
                setMenu(null);
                const plan = planManaAbility(s, HUMAN, menu, x.ability, x.mana);
                if (plan) dispatch(plan);
              }}
              onPlay={(untapped) => {
                setMenu(null);
                if (isLand(s, menu)) dispatch([{ type: "playLand", player: HUMAN, objectId: menu, ...(untapped ? { untapped } : {}) }]);
                else startCast(menu);
              }}
              onCastVia={(via) => {
                setMenu(null);
                startCast(menu, undefined, via);
              }}
              onCastAlt={(alt) => {
                setMenu(null);
                startCast(menu, undefined, undefined, alt);
              }}
              onCastFaceDown={() => {
                setMenu(null);
                dispatch(planCast(s, HUMAN, menu, undefined, undefined, "auto", undefined, { faceDown: true }) ?? [{ type: "castSpell", player: HUMAN, objectId: menu, faceDown: true }]);
              }}
              onTurnFaceUp={() => {
                setMenu(null);
                dispatch(planTurnFaceUp(s, HUMAN, menu) ?? [{ type: "turnFaceUp", player: HUMAN, objectId: menu }]);
              }}
              onClose={() => setMenu(null)}
            />
          )}
          {tapPick && <TapPickBar s={s} pick={tapPick} onDone={finishTapPick} onCancel={() => setTapPick(null)} />}
          {xPick && <XPickBar pick={xPick} onChange={(value) => setXPick({ ...xPick, value })} onDone={finishXPick} onCancel={() => setXPick(null)} />}
          {buybackPick && (
            <div className="targeting">
              <span>
                <strong>{buybackPick.label}</strong>: pay buyback <ManaCost cost={buybackPick.cost} size="sm" /> too? It returns to your hand as it resolves.
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
          {costPick && (costPick.kind === "sacrifice" || costPick.kind === "returnToHand") && (
            <CostPickBar
              pick={costPick}
              onDone={() => finishCostPick(costPick)}
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
          {costPick && costPick.kind !== "sacrifice" && costPick.kind !== "returnToHand" && (
            <CardChoice
              s={s}
              title={`${costPick.label}: ${costPick.what}`}
              cards={costPick.candidates}
              chosen={costPick.chosen}
              n={costPick.n}
              onHover={setHover}
              onToggle={(id) =>
                setCostPick({ ...costPick, chosen: costPick.chosen.includes(id) ? costPick.chosen.filter((x) => x !== id) : [...costPick.chosen, id].slice(-costPick.n) })
              }
              onDone={() => finishCostPick(costPick)}
              onCancel={() => setCostPick(null)}
            />
          )}
          {!targeting && !modePick && !tapPick && !picking && pending?.kind !== "chooseModes" && <Controls s={s} pending={pending} attacks={attacks} aim={aim} blocks={blocks} blocker={blocker} discards={discards} dispatch={dispatch} onCastFree={(id) => startCast(id)} onHover={setHover} />}
          <PriorityToggle mode={priorityMode} onChange={setPriorityMode} />
          {error && <div className="error">{error}</div>}
          {s.over && (
            <div className="game-over">
              {s.winner === HUMAN ? "You win!" : `${s.winner !== null ? s.players[s.winner]!.name : "Nobody"} wins.`}
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
          canPick={(id) => !pending && (viewing.zone === "graveyard" ? viewing.pid === HUMAN && graveyardOptions(s, id) : exileOptions(s, id))}
          onPick={(id) => {
            setViewing(null);
            setMenu(id);
          }}
        />
      )}
      <HoverCard d={hover} onGone={() => setHover(null)} />
    </div>
  );
}

const PHASES: Step[] = ["untap", "upkeep", "draw", "main1", "beginCombat", "declareAttackers", "declareBlockers", "combatDamage", "endCombat", "main2", "end"];

function canPlayLand(s: GameState, id: string) {
  return legalActions(s, HUMAN).some((a) => a.type === "playLand" && a.objectId === id);
}

const VIA_NAMES: Record<CastFromGraveyardKind, string> = { flashback: "Flashback", jumpStart: "Jump-start", retrace: "Retrace", escape: "Escape" };

/** "discard a card", "pay 3 life", "exile two other cards from your graveyard". */
function describeExtraCost(c: AdditionalCost): string {
  const n = (k: number, what: string) => (k === 1 ? `${/^[aeiou]/i.test(what) ? "an" : "a"} ${what}` : `${k} ${what}s`);
  if (c.kind === "payLife") return `pay ${c.n} life`;
  if (c.kind === "sacrifice") return `sacrifice ${n(c.n, c.filter.text)}`;
  if (c.kind === "discard") return `discard ${n(c.n, c.filter?.text ?? "card")}`;
  if (c.kind === "returnToHand") return `return ${n(c.n, c.filter.text)} to hand`;
  return `exile ${n(c.n, c.filter?.text ?? "other card")} from your graveyard`;
}

/** Could you cast this card from your graveyard this way now, tapping mana as needed (costs like discards aside)? */
function canCastFromGraveyard(s: GameState, id: string, via: CastFromGraveyardKind) {
  const problem = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, undefined, { via });
  return !problem || (/not enough mana/.test(problem) && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { via }) !== null);
}

/** A card exiled with "you may play it until ..." that you could play now. */
function exileOptions(s: GameState, id: string): boolean {
  if (!mayPlayFromExile(s, s.objects[id]!, HUMAN)) return false;
  return isLand(s, id) ? canPlayLand(s, id) : canCastWithTaps(s, id);
}

/** Does this card in your graveyard have something you could do with it now (flashback, unearth, ...)? */
function graveyardOptions(s: GameState, id: string): boolean {
  const d = cardOf(s, id);
  if ((compileCard(d).fromGraveyard ?? []).some((g) => canCastFromGraveyard(s, id, g.kind))) return true;
  return abilitiesOf(s, s.objects[id]!).activated.some((ab, i) => ab.zone === "graveyard" && planActivate(s, HUMAN, id, i) !== null);
}

function canCastWithTaps(s: GameState, id: string, convoke?: string[]) {
  if ((!convoke && canCast(s, HUMAN, id)) || planCast(s, HUMAN, id, undefined, undefined, convoke ?? "auto") !== null) return true;
  // With delve's help: as many cards from your graveyard as it can use (CR 702.66a).
  const room = convoke ? 0 : delveRoom(s, HUMAN, id);
  return room > 0 && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { delve: s.players[HUMAN]!.graveyard.filter((c) => c !== id).slice(0, room) }) !== null;
}

/** Could you cast this card from your hand for its evoke or dash cost now, tapping mana as needed? */
function canCastAlt(s: GameState, id: string, alt: AltCostKind) {
  const problem = castProblem(s, HUMAN, id, undefined, undefined, undefined, undefined, undefined, { alt });
  return !problem || (/not enough mana/.test(problem) && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { alt }) !== null);
}

/** Indices of a card's abilities that work from your hand (cycling, CR 702.29a). */
function handAbilities(s: GameState, id: string): number[] {
  return abilitiesOf(s, s.objects[id]!).activated.flatMap((ab, i) => (ab.zone === "hand" ? [i] : []));
}

/** Could you cycle this card right now, tapping mana as needed? */
const canCycle = (s: GameState, id: string) => handAbilities(s, id).some((i) => planActivate(s, HUMAN, id, i) !== null);

/** Your untapped creatures, which convoke can tap (CR 702.51a). */
const convokers = (s: GameState) => s.battlefield.map((id) => s.objects[id]!).filter((o) => controllerOf(s, o) === HUMAN && !o.tapped && isCreature(s, o.id));

/** Creatures that can be clicked for a crew or convoke pick: your untapped creatures, other than the Vehicle being crewed. */
function tapCandidates(s: GameState, pick: TapPick): GameObject[] {
  return convokers(s).filter((o) => !(pick.kind === "crew" && o.id === pick.objectId));
}

/** The bar shown while announcing X. */
function XPickBar({ pick, onChange, onDone, onCancel }: { pick: XPick; onChange: (x: number) => void; onDone: () => void; onCancel: () => void }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(pick.max, Math.floor(n) || 0)));
  return (
    <div className="targeting x-pick">
      <span>
        <strong>{pick.label}</strong> <ManaCost cost={pick.cost} size="sm" />: choose X (up to {pick.max} with your mana)
      </span>
      <button className="ghost" disabled={pick.value <= 0} onClick={() => set(pick.value - 1)} aria-label="X minus one">
        −
      </button>
      <input
        type="number"
        min={0}
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
  const can = (kicks: number[]) => planCast(s, HUMAN, d.objectId, undefined, d.modes, d.convoke ?? "auto", undefined, { ...(d.via ? { via: d.via } : {}), ...(kicks.length ? { kicks } : {}) }) !== null;
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
          <strong>{pick.label}</strong>: multikicker <ManaCost cost={pick.costs[0]!} size="sm" />, how many times?
        </span>
        <button className="ghost" disabled={n <= 0} onClick={() => set(n - 1)} aria-label="Kick one time fewer">
          −
        </button>
        <span className="kick-count">{n}</span>
        <button className="ghost" disabled={!can([...pick.chosen, 0])} onClick={() => set(n + 1)} aria-label="Kick one more time">
          +
        </button>
        <button onClick={() => onDone(pick.chosen)}>{n ? `Kick ${n === 1 ? "once" : `${n} times`}` : "Don't kick"}</button>
        {cancel}
      </div>
    );
  }
  if (pick.costs.length === 1)
    return (
      <div className="targeting">
        <span>
          <strong>{pick.label}</strong>: pay kicker <ManaCost cost={pick.costs[0]!} size="sm" />?
        </span>
        <button disabled={!can([0])} onClick={() => onDone([0])}>
          Kick it
        </button>
        <button onClick={() => onDone([])}>Don't kick</button>
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
function CostPickBar({ pick, onDone, onCancel }: { pick: CostPick; onDone: () => void; onCancel: () => void }) {
  return (
    <div className="targeting">
      <span>
        <strong>{pick.label}</strong>: {pick.what} (click {pick.n === 1 ? "it" : "them"})
      </span>
      <button disabled={pick.chosen.length !== pick.n} onClick={onDone}>
        {pick.kind === "returnToHand" ? "Return and activate" : pick.activate ? "Sacrifice and activate" : "Sacrifice and cast"}
      </button>
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
          <button disabled={min === undefined ? chosen.length !== n : chosen.length < min || chosen.length > n} onClick={onDone}>
            Done
          </button>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <div className="modal-cards">
          {cards.map((id) => {
            const d = cardOf(s, id);
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

function TapPickBar({ s, pick, onDone, onCancel }: { s: GameState; pick: TapPick; onDone: () => void; onCancel: () => void }) {
  const name = cardOf(s, pick.objectId).name;
  if (pick.kind === "crew") {
    const total = pick.chosen.reduce((n, id) => n + crewPower(s, s.objects[id]!), 0);
    return (
      <div className="targeting">
        <span>
          <strong>Crew {name}:</strong> tap creatures with total power {pick.n} (now {total})
        </span>
        <button disabled={total < pick.n} onClick={onDone}>
          Crew
        </button>
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
  const d = cardOf(s, pick.objectId);
  const o = s.objects[pick.objectId]!;
  const tax = o.zone === "command" ? commanderTax(s.players[HUMAN]!, o) : 0;
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
  onClick: (o: GameObject) => void;
  onHover: (d: CardDef | null) => void;
  attacks: Record<string, PlayerId>;
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
      <div className={classes.join(" ")} data-obj={o.id} onClick={() => onClick(o)} {...hoverProps(seen, onHover)}>
        <CardFace d={d} peek={seen !== d ? seen : undefined} />
        {onField && <Modified s={s} o={o} />}
        {o.attacking !== undefined && <span className="badge attack-badge">→ {s.players[o.attacking]!.name}</span>}
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
  return (
    <>
      {(m.grantedKeywords.length > 0 || m.grantedAbilities.length > 0 || m.lostKeywords.length > 0 || m.lostAllAbilities) && (
        <span className="kw-overlay">
          {m.lostAllAbilities && <span className="kw none">No abilities</span>}
          {m.grantedKeywords.map((k) => (
            <span key={k} className="kw">
              {k}
            </span>
          ))}
          {m.grantedAbilities.length > 0 && (
            <span className="kw" title={m.grantedAbilities.map((t) => `Has "${t.replace(/~/g, c.name)}"`).join("\n")}>
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
        {Object.entries(m.otherCounters).map(([k, n]) => (
          <span key={k} className="chip other" title={`${n} ${k} counter(s)`}>
            {n} {k}
          </span>
        ))}
        {(o.regenShields ?? 0) > 0 && (
          <span className="chip shield" title="Regeneration shield: the next time it would be destroyed this turn, it's tapped and removed from combat instead.">
            Regen{o.regenShields! > 1 ? ` ×${o.regenShields}` : ""}
          </span>
        )}
        {(o.preventNext ?? 0) > 0 && (
          <span className="chip shield" title={`The next ${o.preventNext} damage that would be dealt to it this turn is prevented.`}>
            Prevent {o.preventNext}
          </span>
        )}
        {paired && (
          <span className="chip other" title={`Paired with ${cardOf(s, paired.id).name} (soulbond).`}>
            Paired
          </span>
        )}
      </span>
      {creature && (
        <span className={`pt ${m.setOrSwitched ? "set" : ""}`} title={tip}>
          <b className={tone(c.power, c.printedPower)}>{c.power}</b>/<b className={tone(c.toughness, c.printedToughness)}>{c.toughness}</b>
          {o.damage > 0 && <em> −{o.damage}</em>}
        </span>
      )}
    </>
  );
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
  onViewZone: (zone: "graveyard" | "exile") => void;
  cardProps: CardProps;
}) {
  const p = s.players[pid]!;
  const yardPlayable = pid === HUMAN && !s.pending && p.graveyard.some((id) => graveyardOptions(s, id));
  const exilePlayableHere = !s.pending && p.exile.some((id) => exileOptions(s, id));
  // Auras and Equipment sit with whatever they're attached to, even in another player's area.
  const onField = new Set(s.battlefield);
  const mine = s.battlefield
    .map((id) => s.objects[id]!)
    .filter((o) => controllerOf(s, o) === pid && !(o.attachedTo && onField.has(o.attachedTo)));
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
        {p.citysBlessing && (
          <span className="monarch blessing" title="The city's blessing (ascend): kept for the rest of the game.">
            🏙 City's blessing
          </span>
        )}
        {(p.energy ?? 0) > 0 && (
          <span className="energy" title={`${p.energy} energy counter${p.energy === 1 ? "" : "s"}, spent to pay {E} costs.`}>
            ⚡ {p.energy}
          </span>
        )}
        {(p.poison ?? 0) > 0 && (
          <span className="poison" title="Poison counters: ten or more and this player loses.">
            ☠ {p.poison}
          </span>
        )}
        {pid !== HUMAN && (
          <span className="muted" data-hand={pid}>
            Hand {p.hand.length}
          </span>
        )}
        {p.lost && <span className="error">Out: {p.lossReason}</span>}
        <span className="pool-slot">{(pid === HUMAN || Object.values(p.manaPool).some((n) => n > 0)) && <ManaPoolView pool={p.manaPool} />}</span>
      </header>
      <div className="seat-body">
        <div className="zones" onClick={(e) => e.stopPropagation()}>
          <div className="zone">
            <div className="zone-title">Command</div>
            {p.command.length ? (
              p.command.map((id) => (
                <div key={id} className="zone-card">
                  <CardView o={s.objects[id]!} {...cardProps} playable={pid === HUMAN && canCastWithTaps(s, id)} />
                  <span className="small muted">Tax {commanderTax(p, s.objects[id]!)}</span>
                </div>
              ))
            ) : (
              <div className="zone-empty">on battlefield</div>
            )}
          </div>
          <div className="zone" title="Library: hidden, in order. Only the number of cards is public (CR 401.2).">
            <div className="zone-title">Library</div>
            {p.library.length ? <CardBack count={p.library.length} /> : <div className="zone-empty">empty</div>}
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
            {view.pid === HUMAN ? "Your" : `${p.name}'s`} {view.zone === "graveyard" ? "graveyard" : "exile"}
          </strong>
          <span className="muted"> {ids.length} card(s), newest first</span>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="modal-cards">
          {ids.length === 0 && <span className="muted">Nothing here yet.</span>}
          {ids.map((id) => {
            const d = cardOf(s, id);
            const pickable = canPick(id);
            return (
              <div
                key={id}
                className={`card big${pickable ? " playable" : ""}`}
                title={pickable ? `Click to ${view.zone === "exile" ? "play" : "cast or use"} it from your ${view.zone}` : view.zone === "exile" && s.objects[id]!.mayPlay?.player === HUMAN ? "You may play this card for now" : undefined}
                onClick={pickable ? () => onPick(id) : undefined}
                {...hoverProps(d, onHover)}
              >
                <CardFace d={d} />
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
 * CR 109.2a). Only the legal choices are shown, grouped by whose graveyard they're in.
 */
function GraveyardPicker({
  s,
  label,
  spec,
  allowed,
  onSkip,
  onHover,
  onPick,
  onCancel,
}: {
  s: GameState;
  label: string;
  spec: TargetSpec;
  /** Also left out: one already chosen for another of the same targets. */
  allowed: (id: string) => boolean;
  /** For an "up to" target: choose no more. */
  onSkip?: () => void;
  onHover: (d: CardDef | null) => void;
  onPick: (id: string) => void;
  onCancel?: () => void;
}) {
  const legal = legalTargets(s, spec, HUMAN)
    .map((t) => t.id as string)
    .filter(allowed);
  const owners = [...new Set(legal.map((id) => s.objects[id]!.owner))];
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
          {owners.map((pid) => (
            <div key={pid}>
              <h4>{pid === HUMAN ? "Your graveyard" : `${s.players[pid]!.name}'s graveyard`}</h4>
              <div className="modal-cards">
                {legal
                  .filter((id) => s.objects[id]!.owner === pid)
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
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Scry or surveil (CR 701.22, 701.25): look at the top cards of your library, then put any
 * number back on top in any order and the rest on the bottom (scry) or into your graveyard
 * (surveil). Clicking a card moves it between the two rows; the arrows reorder the top row,
 * whose leftmost card ends up on top.
 */
function ArrangeTop({
  s,
  how,
  source,
  cards,
  onHover,
  onDone,
}: {
  s: GameState;
  how: "scry" | "surveil";
  source: string;
  cards: string[];
  onHover: (d: CardDef | null) => void;
  onDone: (top: string[], away: string[]) => void;
}) {
  const [top, setTop] = useState<string[]>(cards);
  const [away, setAway] = useState<string[]>([]);
  const awayName = how === "scry" ? "Bottom of library" : "Graveyard";
  const toggle = (id: string) => {
    if (top.includes(id)) {
      setTop(top.filter((x) => x !== id));
      setAway([...away, id]);
    } else {
      setAway(away.filter((x) => x !== id));
      setTop([...top, id]);
    }
  };
  const move = (i: number, by: number) => {
    const next = [...top];
    const [id] = next.splice(i, 1);
    next.splice(i + by, 0, id!);
    setTop(next);
  };
  const row = (ids: string[], ordered: boolean) => (
    <div className="modal-cards arrange-row">
      {ids.length === 0 && <span className="muted">No cards.</span>}
      {ids.map((id, i) => {
        const d = cardOf(s, id);
        return (
          <div key={id} className="arrange-card">
            <div className="card big" data-arrange={id} onClick={() => toggle(id)} {...hoverProps(d, onHover)} title="Click to move to the other row">
              <CardFace d={d} />
            </div>
            {ordered && ids.length > 1 && (
              <div className="arrange-order">
                <button className="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move toward the top">
                  ◀
                </button>
                <span>{i === 0 ? "Top" : `#${i + 1}`}</span>
                <button className="ghost" disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Move deeper">
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
            {source}: {how} {cards.length}
          </strong>
          <span className="muted"> Click a card to move it between rows.</span>
          <button onClick={() => onDone(top, away)}>Done</button>
        </header>
        <div className="modal-body">
          <h4>Top of library (leftmost on top)</h4>
          {row(top, true)}
          <h4>{awayName}</h4>
          {row(away, false)}
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
  const counts = new Map<string, { yours: number; theirs: number }>();
  const tally = (types: string[], yours: boolean) =>
    types.forEach((t) => {
      if (!pending.options.includes(t)) return;
      const c = counts.get(t) ?? { yours: 0, theirs: 0 };
      if (yours) c.yours++;
      else c.theirs++;
      counts.set(t, c);
    });
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const ch = characteristics(s, o);
    if (ch.types.includes("Creature")) tally(ch.subtypes, ch.controller === HUMAN);
  }
  for (const id of s.players[HUMAN]!.hand) {
    const d = cardOf(s, id);
    if (d.types.includes("Creature")) tally(d.subtypes, true);
  }
  const seen = [...counts].sort((a, b) => b[1].yours + b[1].theirs - (a[1].yours + a[1].theirs) || a[0].localeCompare(b[0]));
  const q = query.trim().toLowerCase();
  // Names that start with what was typed first ("el": Elf, Elk, ... then Angel, Camel).
  const matches = pending.options.filter((t) => t.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)));
  const exact = matches.find((t) => t.toLowerCase() === q) ?? (matches.length === 1 ? matches[0] : undefined);
  return (
    <div className="modal-backdrop">
      <div className="modal type-pick">
        <header>
          <strong>{pending.source}: choose a creature type</strong>
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
              <h4>On the battlefield and in your hand</h4>
              <div className="type-list">
                {seen.map(([t, c]) => (
                  <button key={t} className="ghost" data-type={t} onClick={() => onDone(t)}>
                    {t}{" "}
                    <span className="muted small">
                      {[c.yours ? `${c.yours} yours` : "", c.theirs ? `${c.theirs} theirs` : ""].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <h4>{q ? `Types matching “${query.trim()}”` : "All creature types"}</h4>
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
  for (const id of dig ? [] : pending.cards) {
    const name = cardOf(s, id).name;
    groups.set(name, [...(groups.get(name) ?? []), id]);
  }
  const sorted = [...groups].sort((a, b) => a[0].localeCompare(b[0]));
  const add = (ids: string[]) => {
    const next = ids.find((id) => !found.includes(id));
    if (next && found.length < pending.max) setFound([...found, next]);
  };
  const where = (i: number) => (pending.firstTo ? (i === 0 ? pending.firstTo : pending.othersTo) : null);
  return (
    <div className="modal-backdrop">
      <div className="modal search">
        <header>
          <strong>
            {dig ? `${pending.source}: put ${pending.what} ${dig.to}` : `${pending.source}: search your library for ${pending.what}`}
          </strong>
          <span className="muted">
            {" "}
            {dig
              ? `The rest go ${dig.rest}.`
              : pending.firstTo
                ? `The first you find goes ${pending.firstTo}, the other ${pending.othersTo}.`
                : `Found ${found.length} of ${pending.max}.`}
          </span>
          <button disabled={found.length < pending.min} onClick={() => onDone(found)}>
            {found.length || pending.min > 0 ? "Done" : dig ? "Take none" : "Find nothing"}
          </button>
        </header>
        <div className="modal-body">
          {found.length > 0 && (
            <>
              <h4>Found</h4>
              <div className="modal-cards">
                {found.map((id, i) => {
                  const d = cardOf(s, id);
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
              <h4>The top of your library</h4>
              <div className="modal-cards">
                {dig.looked
                  .filter((id) => !found.includes(id))
                  .map((id) => {
                    const d = cardOf(s, id);
                    const can = pending.cards.includes(id) && found.length < pending.max;
                    return (
                      <div key={id} className={`card big ${can ? "targetable" : "dim"}`} data-pick={id} onClick={() => can && setFound([...found, id])} {...hoverProps(d, onHover)}>
                        <CardFace d={d} />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
          {!dig && <h4>Your library</h4>}
          <div className="modal-cards">
            {!dig && sorted.length === 0 && <span className="muted">No cards in your library match.</span>}
            {sorted.map(([name, ids]) => {
              const left = ids.filter((id) => !found.includes(id)).length;
              const d = cardOf(s, ids[0]!);
              const can = left > 0 && found.length < pending.max;
              return (
                <div key={name} className={`card big ${can ? "targetable" : "dim"}`} data-pick={ids[0]} onClick={() => can && add(ids)} {...hoverProps(d, onHover)}>
                  <CardFace d={d} />
                  {ids.length > 1 && <span className="zone-count">×{left}</span>}
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
function ModeMenu({
  label,
  sourceName,
  min,
  max,
  modes,
  legal,
  onDone,
  onCancel,
}: {
  label: string;
  sourceName: string;
  min: number;
  max: number;
  modes: string[];
  legal: boolean[];
  onDone: (modes: number[]) => void;
  onCancel?: () => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  const single = max === 1 && min === 1;
  const toggle = (i: number) => {
    if (single) return onDone([i]);
    setChosen((c) => (c.includes(i) ? c.filter((x) => x !== i) : c.length < max ? [...c, i] : c));
  };
  const ok = chosen.length >= min && chosen.length <= max;
  return (
    <div className="ability-menu mode-menu">
      <strong>{label}</strong>
      <span className="muted">choose {describeCount(min, max)}</span>
      {modes.map((m, i) => (
        <button
          key={i}
          className={chosen.includes(i) ? "chosen" : ""}
          disabled={!legal[i]}
          title={legal[i] ? "" : "No legal targets for this mode"}
          onClick={() => toggle(i)}
        >
          {m.replace(/~/g, sourceName)}
        </button>
      ))}
      {!single && (
        <button disabled={!ok} onClick={() => onDone([...chosen].sort((a, b) => a - b))}>
          {chosen.length === 0 && min === 0 ? "Choose none" : "Done"}
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

/** Ways to make mana with this permanent right now (paying any mana they cost with other sources). */
function usableManaOptions(s: GameState, o: GameObject): ManaOption[] {
  return manaOptions(s, o).filter((x) => x.adds.length > 0 && planManaAbility(s, HUMAN, o.id, x.ability, x.mana) !== null);
}

function AbilityMenu({
  s,
  objectId,
  onUse,
  onMana,
  onPlay,
  onCastVia,
  onCastAlt,
  onCastFaceDown,
  onTurnFaceUp,
  onClose,
}: {
  s: GameState;
  objectId: string;
  onUse: (id: string, index: number) => void;
  onMana: (x: ManaOption) => void;
  /** For a card in hand: cast it, or play it if it's a land (`untapped`: pay life or reveal so it enters untapped). */
  onPlay: (untapped?: boolean) => void;
  /** For a card in your graveyard: cast it with flashback, escape, ... */
  onCastVia: (via: CastFromGraveyardKind) => void;
  /** For a card in hand: cast it for its evoke or dash cost. */
  onCastAlt: (alt: AltCostKind) => void;
  /** For a card in hand with morph or disguise: cast it face down for {3}. */
  onCastFaceDown: () => void;
  /** For your face-down permanent: turn it face up. */
  onTurnFaceUp: () => void;
  onClose: () => void;
}) {
  const o = s.objects[objectId]!;
  const d = seenCardOf(s, objectId);
  // A card you may play from exile for now works like one in your hand (impulse draw).
  const inHand = o.zone === "hand" || mayPlayFromExile(s, o, HUMAN);
  const faceDownCast = inHand ? compileCard(d).faceDownCast : undefined;
  const upCost = o.zone === "battlefield" ? faceUpCost(s, o) : undefined;
  const inYard = o.zone === "graveyard";
  const land = isLand(s, objectId);
  const playable = inHand && (land ? canPlayLand(s, objectId) : canCastWithTaps(s, objectId));
  const choice = inHand && land ? compileCard(d).entersTappedChoice : undefined;
  return (
    <div className="ability-menu">
      <strong>{d.name}</strong>
      {choice && (
        <button disabled={!playable || !canEnterUntapped(s, HUMAN, objectId)} onClick={() => onPlay(true)}>
          Play it untapped ({choice.kind === "payLife" ? `pay ${choice.n} life` : `reveal ${/^[AEIOU]/.test(choice.filter.text) ? "an" : "a"} ${choice.filter.text}`})
        </button>
      )}
      {inHand && (
        <button disabled={!playable} onClick={() => onPlay()}>
          {land ? (choice ? "Play it tapped" : "Play it") : <>Cast it <ManaCost cost={d.manaCost} size="sm" /></>}
        </button>
      )}
      {inHand &&
        (compileCard(d).altCosts ?? []).map((a) => {
          const ok = canCastAlt(s, objectId, a.kind);
          const problem = ok ? "" : (castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { alt: a.kind }) ?? "");
          const note = a.kind === "evoke" ? "it's sacrificed as it enters" : "haste, back to your hand at the end step";
          return (
            <button key={a.kind} disabled={!ok} title={problem || note} onClick={() => onCastAlt(a.kind)}>
              {a.kind === "evoke" ? "Evoke" : "Dash"} <ManaCost cost={a.mana} size="sm" />
            </button>
          );
        })}
      {faceDownCast && (
        <button
          disabled={!planCast(s, HUMAN, objectId, undefined, undefined, "auto", undefined, { faceDown: true })}
          title={castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { faceDown: true }) ?? `A 2/2 that only you can see. Turn it face up later for ${faceDownCast.cost}.`}
          onClick={onCastFaceDown}
        >
          Cast face down <ManaCost cost="{3}" size="sm" /> ({faceDownCast.kind})
        </button>
      )}
      {upCost && (
        <button disabled={!planTurnFaceUp(s, HUMAN, objectId)} title={turnFaceUpProblem(s, HUMAN, objectId) ?? "A special action: it doesn't use the stack."} onClick={onTurnFaceUp}>
          Turn face up: {upCost.kind} <ManaCost cost={upCost.cost} size="sm" />
        </button>
      )}
      {inYard &&
        (compileCard(d).fromGraveyard ?? []).map((g) => {
          const ok = canCastFromGraveyard(s, objectId, g.kind);
          const problem = ok ? "" : (castProblem(s, HUMAN, objectId, undefined, undefined, undefined, undefined, undefined, { via: g.kind }) ?? "");
          return (
            <button key={g.kind} disabled={!ok} title={problem} onClick={() => onCastVia(g.kind)}>
              {VIA_NAMES[g.kind]} <ManaCost cost={g.mana ?? d.manaCost} size="sm" />
              {g.costs.length ? `, ${g.costs.map(describeExtraCost).join(", ")}` : ""}
            </button>
          );
        })}
      {!inHand &&
        !inYard &&
        usableManaOptions(s, o).map((x) => {
          const ab = manaAbilitiesOn(s, o)[x.ability]!;
          const cost = ab.text.slice(0, ab.text.indexOf(": Add")).replace(/~/g, "it");
          return (
            <button key={`${x.ability}-${x.mana}`} className="ghost" onClick={() => onMana(x)}>
              <RulesText text={cost} />: add <ManaCost cost={x.adds.map((m) => `{${m}}`).join("")} size="sm" />
              {ab.selfDamage ? ` (${ab.selfDamage} damage to you)` : ""}
            </button>
          );
        })}
      {abilitiesOf(s, o).activated.map((ab, i) => {
        // From your hand, only cycling and the like; from your graveyard, unearth; on the battlefield, everything else.
        if ((ab.zone ?? "battlefield") !== o.zone) return null;
        const problem = abilityProblem(s, HUMAN, objectId, i);
        const ok = !problem || (/not enough mana/.test(problem) && planActivate(s, HUMAN, objectId, i) !== null);
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
  attacks: Record<string, PlayerId>;
  aim: string | null;
  blocks: Record<string, string[]>;
  blocker: string | null;
  discards: string[];
  dispatch: ReturnType<typeof useGame>["dispatch"];
  /** Cascade's free cast: go through modes and targets as usual. */
  onCastFree: (id: string) => void;
  onHover: (d: CardDef | null) => void;
}) {
  if (s.over) return null;
  if (pending?.kind === "castFree") {
    const d = cardOf(s, pending.objectId);
    return (
      <div className="controls">
        <span onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)}>
          <strong>{pending.source}:</strong> cast <strong>{d.name}</strong> without paying its mana cost?
        </span>
        <button onClick={() => onCastFree(pending.objectId)}>Cast it</button>
        <button className="ghost" onClick={() => dispatch([{ type: "chooseMay", player: HUMAN, yes: false }])}>
          Don't
        </button>
      </div>
    );
  }
  if (pending?.kind === "declareAttackers") {
    // Creatures that attack each combat if able have to be declared (CR 508.1d).
    const must = potentialAttackers(s, HUMAN).filter((o) => characteristics(s, o).attacksIfAble && !(o.id in attacks));
    // "Can't attack alone" (CR 506.5).
    const ids = Object.keys(attacks);
    const alone = ids.length === 1 && characteristics(s, s.objects[ids[0]!]!).cantAttackAlone ? `${cardOf(s, ids[0]!).name} can't attack alone.` : null;
    return (
      <div className="controls">
        <span>
          {alone && !aim
            ? alone
            : must.length && !aim
            ? `${must.map((o) => cardOf(s, o.id).name).join(" and ")} attack${must.length === 1 ? "s" : ""} each combat if able: click ${must.length === 1 ? "it" : "them"}, then a player.`
            : aim
            ? `Now click the player ${cardOf(s, aim).name} attacks.`
            : opponents(s, HUMAN).length === 1
              ? "Click your creatures to attack. Click an attacker again to take it back."
              : "Click a creature, then the player it attacks. Click an attacker again to take it back."}
        </span>
        <button
          disabled={must.length > 0 || !!alone}
          onClick={() =>
            dispatch([
              {
                type: "declareAttackers",
                player: HUMAN,
                attacks: Object.entries(attacks).map(([attacker, defender]) => ({ attacker, defender })),
              },
            ])
          }
        >
          {Object.keys(attacks).length ? `Attack with ${Object.keys(attacks).length}` : "No attacks"}
        </button>
      </div>
    );
  }
  if (pending?.kind === "declareBlockers") {
    // Blocking requirements and "can't block alone" (CR 509.1c, 506.5): say what's still needed.
    const list = Object.entries(blocks).flatMap(([b, atts]) => atts.map((attacker) => ({ blocker: b, attacker })));
    const earlier = s.battlefield.some((id) => s.objects[id]!.blocking !== undefined);
    const alone = Object.keys(blocks).length === 1 && !earlier && characteristics(s, s.objects[list[0]!.blocker]!).cantBlockAlone ? `${cardOf(s, list[0]!.blocker).name} can't block alone.` : null;
    const needed = alone ?? blockRequirementProblem(s, HUMAN, list);
    return (
      <div className="controls">
        <span>
          {blocker
            ? maxBlocks(s, s.objects[blocker]!) > 1
              ? `Now click the attackers ${cardOf(s, blocker).name} blocks (${maxBlocks(s, s.objects[blocker]!) === Infinity ? "any number" : `up to ${maxBlocks(s, s.objects[blocker]!)}`}), then confirm.`
              : `Now click the attacker ${cardOf(s, blocker).name} blocks.`
            : needed
              ? `${needed.charAt(0).toUpperCase()}${needed.slice(1)}.`
              : "Click one of your untapped creatures, then the attacker it blocks."}
        </span>
        <button
          disabled={!!needed}
          onClick={() =>
            dispatch([
              {
                type: "declareBlockers",
                player: HUMAN,
                blocks: list,
              },
            ])
          }
        >
          {Object.keys(blocks).length ? `Block with ${Object.keys(blocks).length}` : "No blocks"}
        </button>
      </div>
    );
  }
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
  if (pending?.kind === "pickPermanents" && pending.player === HUMAN) {
    const verb = pending.action === "sacrifice" ? "sacrifice" : pending.action === "counters" ? `put a ${pending.counter} counter on` : pending.action === "populate" ? "copy" : "return to your hand";
    const an = `${/^[aeiou]/i.test(pending.what) ? "an" : "a"} ${pending.what}`;
    // Devour: any number of them; exploit: none or one (pending.min).
    const what = pending.objectId ? `any number of ${pending.what} permanents` : pending.min !== undefined && pending.count === 1 ? `${an}, if you want,` : pending.count === 1 ? an : `${pending.count} (${pending.what})`;
    const n = discards.length;
    const ok = pending.min !== undefined ? n >= pending.min && n <= pending.count : n === pending.count;
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong>{" "}
          {pending.action === "pair" ? (pending.options.length === 1 ? `click ${cardOf(s, pending.options[0]!).name} to pair the two (soulbond), if you want.` : "click a creature of yours to pair it with (soulbond), if you want.") : `click ${what} of yours to ${verb}.`}
        </span>
        <button disabled={!ok} onClick={() => dispatch([{ type: "pickPermanents", player: HUMAN, ids: discards }])}>
          {pending.min !== undefined && n === 0 ? (pending.action === "pair" ? "Don't pair" : "Sacrifice none") : pending.action === "pair" ? "Pair" : pending.action === "sacrifice" ? "Sacrifice" : pending.action === "counters" ? "Put counter" : pending.action === "populate" ? "Copy" : "Return"}
        </button>
      </div>
    );
  }
  if (pending?.kind === "chooseOption" && pending.what === "copy" && pending.player === HUMAN)
    return (
      <div className="controls copy-pick">
        <span>
          <strong>{pending.source}:</strong> enter as a copy of
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
  if (pending?.kind === "chooseOption" && pending.what === "color")
    return (
      <div className="controls color-pick">
        <span>
          <strong>{pending.source}:</strong> choose a color
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
  if (pending?.kind === "chooseOption")
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> choose a creature type.
        </span>
      </div>
    );
  if (pending?.kind === "chooseMay" && pending.pay) {
    // "You may pay {1}. If you do, ...": Pay taps what's needed, like ward's prompt.
    const { mana, life = 0, energy = 0 } = pending.pay;
    const me = s.players[HUMAN]!;
    const taps = me.life >= life && (me.energy ?? 0) >= energy ? (mana ? planMana(s, HUMAN, parseManaCost(mana)) : []) : null;
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> <RulesText text={pending.prompt.charAt(0).toUpperCase() + pending.prompt.slice(1)} />?
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
  if (pending?.kind === "chooseMay")
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> {pending.prompt.charAt(0).toUpperCase() + pending.prompt.slice(1)}?
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
    const taps = s.players[HUMAN]!.life >= life ? planMana(s, HUMAN, parseManaCost(pending.cost)) : null;
    return (
      <div className="controls">
        <span>
          <strong>{pending.source}:</strong> pay <ManaCost cost={pending.cost} size="sm" />
          {life ? ` and ${life} life` : ""} or {pending.what} is countered.
        </span>
        <button disabled={!taps} onClick={() => dispatch([...(taps ?? []), { type: "payUnless", player: HUMAN, pay: true }])}>
          Pay
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
  if (pending?.kind === "discardToHandSize" || pending?.kind === "discard")
    return (
      <div className="controls">
        <span>
          {pending.kind === "discard" ? <strong>{pending.source}: </strong> : "Hand size: "}
          click {pending.count} card{pending.count === 1 ? "" : "s"} in your hand to discard.
        </span>
        <button
          disabled={discards.length !== pending.count}
          onClick={() => dispatch([{ type: "discard", player: HUMAN, objectIds: discards }])}
        >
          Discard
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

function GameLog({ s }: { s: GameState }) {
  const entries = s.log.slice(-80).reverse(); // newest first
  return (
    <div className="log">
      {entries.map((e) => (
        <div key={e.seq} className={e.text.startsWith("—") ? "turn-line" : ""}>
          <RulesText text={youGrammar(e.text)} />
        </div>
      ))}
    </div>
  );
}

/** The engine logs "<name> plays X"; read naturally when the name is "You". */
function youGrammar(text: string) {
  if (/(^|: )You /.test(text)) text = text.replace(/^You (surveils|scries)\b/, (_, v: string) => `You ${v === "scries" ? "scry" : "surveil"}`).replace(/ their (graveyard|library|hand|next turn)\b/g, " your $1");
  return text.replace(/(^|\. |: )You (plays|casts|declares|discards|loses|draws|gains|mills|activates|chooses|sacrifices|goes|cycles|crews|pays|takes|keeps|exiles|reveals|puts|turns|gets|wins|searches|becomes|returns|attaches|creates|deals|taps|untaps|destroys|counters|regenerates|attacks|blocks|looks|connives|proliferates|amasses|copies)\b/g, (_, pre: string, v: string) =>
    `${pre}You ${v === "loses" ? "lose" : v === "goes" ? "go" : v === "searches" ? "search" : v === "amasses" ? "amass" : v === "copies" ? "copy" : v.slice(0, -1)}`,
  );
}

/** Attacks and blocks you're lining up, before you confirm them. */
interface Combat {
  attacks: Record<string, PlayerId>;
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
    if (o.attacking !== undefined) out.push({ key: `atk:${id}`, from: [`[data-obj="${id}"]`], to: [`[data-player="${o.attacking}"]`], color: ATTACK_COLOR });
    for (const a of o.blocking ?? []) out.push({ key: `blk:${id}:${a}`, from: [`[data-obj="${id}"]`], to: [`[data-obj="${a}"]`], color: BLOCK_COLOR });
  }
  for (const [id, pid] of Object.entries(combat.attacks))
    out.push({ key: `atk:${id}`, from: [`[data-obj="${id}"]`], to: [`[data-player="${pid}"]`], color: ATTACK_COLOR });
  for (const [id, atts] of Object.entries(combat.blocks))
    for (const att of atts) out.push({ key: `blk:${id}:${att}`, from: [`[data-obj="${id}"]`], to: [`[data-obj="${att}"]`], color: BLOCK_COLOR });
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
    const sourceId = targeting.mode === "trigger" ? (s.pending?.kind === "chooseTargets" ? s.pending.sourceId : undefined) : targeting.mode === "copy" ? undefined : targeting.mode === "cast" ? targeting.draft.objectId : targeting.objectId;
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
    if (!document.elementFromPoint(x, y)?.closest(".card")) gone.current();
  };

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = mouse.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
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
                <CardView o={s.objects[id]!} {...cardProps} playable={(isLand(s, id) ? canPlayLand(s, id) : canCastWithTaps(s, id)) || canCycle(s, id) || (compileCard(cardOf(s, id)).altCosts ?? []).some((a) => canCastAlt(s, id, a.kind)) || (!!compileCard(cardOf(s, id)).faceDownCast && planCast(s, HUMAN, id, undefined, undefined, "auto", undefined, { faceDown: true }) !== null)} />
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
        title="Stop whenever something happens you could respond to and you have mana up, even with nothing to play, so opponents can't read your hand."
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
