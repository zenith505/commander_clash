import { allEffects, type AbilityBody, type CastFromGraveyardKind, type ChoiceKind, type CompiledCard, type Effect, type ObjRef, type TargetChoice, type UnlessPays } from "./abilities";
import { autoCrew, planActivate, planCast, planMana } from "./autopay";
import { abilitiesOf, defOf, isType, objHasKeyword, objIsType, power, toughness } from "./cards";
import { manaActionAbility } from "./manaabilities";
import { bindChosen, triggerBody, choiceOptions, unlessCost, damageTo, doesNothingNow, estimate, harmfulTargets, legalModes, legalTargets, lethalDamage, modsAreHarmful, objectMatches, printedMatches, sourceColors, COLOR_NAMES } from "./effects";
import { withModes } from "./modes";
import {
  abilityProblem,
  blockProblem,
  canEnterUntapped,
  conditionHolds,
  isSummoningSick,
  canActAtSorcerySpeed,
  legalActions,
  obj,
  opponents,
  player,
  potentialAttackers,
  spellCost,
  graveyardCast,
  spellTargets,
  availableMana,
} from "./game";
import { manaValue, parseManaCost, xCount } from "./mana";
import { characteristics, controllerOf } from "./layers";
import { castingBody, compileCard } from "./oracle";
import type { Action, CardDef, Chosen, Color, CostChoices, GameObject, GameState, ObjectId, PlayerId } from "./types";
import { evalAmount } from "./amounts";

/**
 * A simple heuristic opponent. Returns the sequence of actions it wants to take next
 * (usually one, or several mana taps followed by a cast).
 */
export function botActions(s: GameState, pid: PlayerId): Action[] {
  const pend = s.pending;
  if (pend?.player === pid) {
    if (pend.kind === "declareAttackers") return [chooseAttacks(s, pid)];
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
    if (pend.kind === "castFree") {
      const plan = castPlan(s, pid, pend.objectId, true);
      return plan ?? [{ type: "chooseMay", player: pid, yes: false }];
    }
    if (pend.kind === "chooseMay" && pend.pay) {
      // "You may pay {1}. If you do, ...": worth it when the rest is, and it leaves us some life.
      const { mana, life = 0 } = pend.pay;
      const taps = mana ? planMana(s, pid, parseManaCost(mana)) : [];
      const ok = !!taps && player(s, pid).life > life + 5 && wantsMay(s, pid);
      return ok ? [...taps!, { type: "chooseMay", player: pid, yes: true }] : [{ type: "chooseMay", player: pid, yes: false }];
    }
    if (pend.kind === "chooseMay") return [{ type: "chooseMay", player: pid, yes: pend.card ? millExplored(s, pid, pend.card) : wantsMay(s, pid) }];
    if (pend.kind === "payUnless") {
      // Pay for ward whenever we can: the spell or ability was worth casting.
      const taps = planMana(s, pid, parseManaCost(pend.cost));
      return taps ? [...taps, { type: "payUnless", player: pid, pay: true }] : [{ type: "payUnless", player: pid, pay: false }];
    }
    if (pend.kind === "discard") return [{ type: "discard", player: pid, objectIds: chooseDiscards(s, pid, pend.count) }];
    if (pend.kind === "searchLibrary") return [{ type: "searchLibrary", player: pid, found: chooseSearch(s, pid, pend.cards, pend.max) }];
    if (pend.kind === "chooseOption") {
      const card = pend.objectId ? defOf(s, obj(s, pend.objectId)) : s.resolving ? s.cards[s.resolving.item.sourceCardId ?? obj(s, s.resolving.item.objectId!).cardId]! : undefined;
      return [{ type: "chooseOption", player: pid, choice: chooseOption(s, pid, pend.what, card, pend.options) }];
    }
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
      const plan = planCast(s, pid, id, chooseTargets(s, pid, body, false, id, x) ?? undefined, undefined, "auto", x);
      if (plan && plan[plan.length - 1]!.type === "castSpell" && (plan[plan.length - 1] as { targets?: unknown }).targets) return plan;
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
  const regen = chooseRegeneration(s, pid);
  if (regen) return regen;
  if (canActAtSorcerySpeed(s, pid)) {
    const land = chooseLand(s, pid);
    if (land) return [land];
    const p = player(s, pid);
    const fromYard = p.graveyard.filter((id) => compileCard(defOf(s, obj(s, id))).fromGraveyard?.length);
    const options = [...p.command, ...p.hand, ...fromYard]
      .filter((id) => !isType(defOf(s, obj(s, id)), "Land"))
      .map((id) => {
        const plan = obj(s, id).zone === "graveyard" ? graveyardCastPlan(s, pid, id) : castPlan(s, pid, id, false);
        return plan ? { plan, mv: mv(s, id) } : null;
      })
      .filter((x): x is { plan: Action[]; mv: number } => !!x)
      .sort((a, b) => b.mv - a.mv);
    if (options[0]) return options[0].plan;
    // Unearth a creature to attack with this turn (CR 702.84a).
    if (s.step === "main1") {
      const dig = chooseUnearth(s, pid);
      if (dig) return dig;
    }
    // Crew Vehicles before combat.
    if (s.step === "main1") {
      const crew = chooseCrew(s, pid);
      if (crew) return crew;
    }
    // Use activated abilities once we're done casting spells, then cycle what we can't use.
    if (s.step === "main2") {
      const act = chooseActivation(s, pid) ?? chooseCycling(s, pid);
      if (act) return act;
    }
  }
  return [{ type: "passPriority", player: pid }];
}

/**
 * Play a land that enters untapped if there is one. A land that can enter untapped by revealing a
 * card does; paying life for it (a shock land) is worth it while life is comfortable.
 */
function chooseLand(s: GameState, pid: PlayerId): Action | null {
  const lands = legalActions(s, pid).filter((a): a is Extract<Action, { type: "playLand" }> => a.type === "playLand");
  const p = player(s, pid);
  const options = lands.map((a) => {
    const c = compileCard(defOf(s, obj(s, a.objectId)));
    const untapped = c.entersTappedChoice ? canEnterUntapped(s, pid, a.objectId) && (c.entersTappedChoice.kind === "reveal" || p.life >= 16) : undefined;
    const tapped = c.entersTapped || (c.entersTappedUnless ? !conditionHolds(s, c.entersTappedUnless, pid) : c.entersTappedChoice ? !untapped : false);
    return { action: { ...a, ...(untapped ? { untapped } : {}) }, tapped };
  });
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
export function chooseTargets(s: GameState, pid: PlayerId, body: AbilityBody, forced = false, sourceId?: string, x = 0): TargetChoice[] | null {
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
    // The source's colors matter for protection (CR 702.16b): a spell's card, or the ability's source.
    const all = legalTargets(s, body.targets[i]!, pid, undefined, sourceId ? sourceColors(s, sourceId) : undefined).filter((t) => !out.some((o) => o.kind === t.kind && o.id === t.id));
    if (!all.length) return null;
    // Reanimating takes the best creature from any graveyard it may.
    const reanimate = allEffects(body.effects).some((e) => e.type === "putOntoBattlefield" && e.what.ref === "target" && e.what.index === i);
    const preferred = reanimate ? all : all.filter((t) => (harm[i] ? !isMine(s, pid, t) : isMine(s, pid, t)));
    const pool = preferred.length ? preferred : forced ? all : [];
    if (!pool.length) return null;
    out.push(best(s, pid, pool, harm[i]!, damageTo(body, i, x) + fightDamage(i)));
  }
  return out;
}

/** Is this target ours: our permanent or spell, a card we own, or us? */
function isMine(s: GameState, pid: PlayerId, t: TargetChoice): boolean {
  if (t.kind === "player") return t.id === pid;
  if (t.kind === "stack") return s.stack.find((x) => x.id === t.id)?.controller === pid;
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
function castPlan(s: GameState, pid: PlayerId, id: string, free: boolean, via?: CastFromGraveyardKind): Action[] | null {
  const d = defOf(s, obj(s, id));
  const cost = parseManaCost(graveyardCast(d, via)?.mana ?? d.manaCost);
  // X spells: as big an X as we can pay for. Cast for free, X is 0 (CR 107.3b), which is rarely worth it.
  if (cost.hasX && free) return null;
  const xs = cost.hasX ? xChoices(availableMana(s, pid) - totalWithoutX(s, pid, id, via), xCount(cost)) : [undefined];
  for (const x of xs) {
    const plan = castPlanWithX(s, pid, id, free, x, via);
    if (plan) return plan;
  }
  return null;
}

/** Casting a card from our graveyard (flashback, escape, ...): the first way that works. */
function graveyardCastPlan(s: GameState, pid: PlayerId, id: string): Action[] | null {
  for (const g of compileCard(defOf(s, obj(s, id))).fromGraveyard ?? []) {
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

/** What casting it costs apart from X: its mana value plus commander tax, less reductions. */
function totalWithoutX(s: GameState, pid: PlayerId, id: string, via?: CastFromGraveyardKind): number {
  const { cost, extra } = spellCost(s, pid, obj(s, id), 0, [], { via });
  return manaValue(cost) + extra;
}

function castPlanWithX(s: GameState, pid: PlayerId, id: string, free: boolean, x: number | undefined, via?: CastFromGraveyardKind): Action[] | null {
  const printed = castingBody(defOf(s, obj(s, id)));
  const choice = printed?.modal ? chooseModes(s, pid, printed, false, id) : null;
  if (printed?.modal && !choice) return null;
  const modes = choice?.modes;
  const body = printed && withModes(printed, modes);
  const specs = spellTargets(s, id, modes);
  const targets = specs.length && body ? chooseTargets(s, pid, body, false, id, x) : undefined;
  if (specs.length && !targets) return null;
  if (!free && body && isCounterOnly(body)) return null; // hold counterspells
  // "Destroy all creatures" and the like: only when it hurts the opponents more than us.
  if (body && (groupValue(s, pid, body, defOf(s, obj(s, id))) ?? 1) <= 0) return null;
  const extra = chooseExtraCosts(s, pid, id, targets ?? [], via);
  if (!extra) return null;
  // Buy it back if we can afford to (CR 702.27a), then kick it if we can: the most kicker costs first (CR 702.33).
  const buybacks = compileCard(defOf(s, obj(s, id))).buyback && !via ? [true, false] : [false];
  for (const buyback of buybacks)
    for (const kicks of kickOptions(s, pid, id, free)) {
      const plan = planCast(s, pid, id, targets ?? undefined, modes, "auto", x, { ...extra, ...(kicks.length ? { kicks } : {}), ...(via ? { via } : {}), ...(buyback ? { buyback } : {}) });
      // Leave mana for ward on what it targets, or don't bother (CR 702.21a).
      if (plan && targets && !canAlsoPayWard(s, pid, plan, targets)) continue;
      if (plan) return plan;
    }
  return null;
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
function chooseExtraCosts(s: GameState, pid: PlayerId, id: string, targets: TargetChoice[], via?: CastFromGraveyardKind): CostChoices | null {
  const out: CostChoices = {};
  const targeted = new Set(targets.map((t) => t.id));
  const d = defOf(s, obj(s, id));
  for (const c of [...(compileCard(d).additionalCosts ?? []), ...(graveyardCast(d, via)?.costs ?? [])]) {
    if (c.kind === "payLife") {
      if (player(s, pid).life < c.n + 15) return null;
    } else if (c.kind === "sacrifice") {
      const value = (o: GameObject) => (o.isToken ? 0 : 1 + mv(s, o.id));
      const pool = s.battlefield
        .map((x) => obj(s, x))
        .filter((o) => controllerOf(s, o) === pid && !o.isCommander && !targeted.has(o.id) && objectMatches(s, c.filter, o, pid, false))
        .filter((o) => value(o) <= 3 || (objIsType(s, o, "Land") && lands(s, pid) >= 7))
        .sort((a, b) => value(a) - value(b));
      if (pool.length < c.n) return null;
      out.sacrifice = pool.slice(0, c.n).map((o) => o.id);
    } else if (c.kind === "discard" && c.filter) {
      // Retrace: a spare land card, once we have enough lands out.
      const fits = player(s, pid).hand.filter((x) => x !== id && printedMatches(c.filter!, defOf(s, obj(s, x))));
      if (fits.length < c.n || lands(s, pid) < 5) return null;
      out.discard = fits.slice(0, c.n);
    } else if (c.kind === "discard") {
      const others = player(s, pid).hand.filter((x) => x !== id);
      if (others.length < c.n) return null;
      out.discard = chooseDiscards(s, pid, c.n, id);
    } else {
      const pool = player(s, pid).graveyard.filter((x) => x !== id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, x)))));
      if (pool.length < c.n) return null;
      out.exileCards = pool.slice(0, c.n);
    }
  }
  return out;
}

const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;

/** Explore revealed a nonland card: keep it on top if we could cast it soon, otherwise mill it. */
function millExplored(s: GameState, pid: PlayerId, card: string): boolean {
  const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  return manaValue(parseManaCost(defOf(s, obj(s, card)).manaCost)) > lands + 1;
}

function wantsMay(s: GameState, pid: PlayerId): boolean {
  const r = s.resolving;
  const e = r?.body.effects[r.next];
  if (!r || e?.type !== "may") return true;
  const harm = harmfulTargets(r.body);
  const targets = r.item.targets ?? [];
  let v = 0;
  for (const inner of allEffects(e.effects)) {
    if (inner.type === "may") continue;
    const i = targetIndexOf(inner);
    if (i !== undefined) {
      const t = targets[i];
      if (!t || !r.legal[i]) continue;
      v += harm[i] !== isMine(s, pid, t) ? 1 : -1;
    } else if ((inner.type === "loseLife" || inner.type === "discard") && "who" in inner && inner.who.ref === "you") v -= 1;
    else v += 1;
  }
  return v >= 0;
}

/**
 * Pick modes for a modal body (CR 700.2): the most useful modes that have sensible targets,
 * as many as allowed. Returns null when not enough modes are worth choosing, unless
 * `forced` (a trigger has to choose), in which case any legal modes fill the gap.
 */
export function chooseModes(s: GameState, pid: PlayerId, body: AbilityBody, forced = false, sourceId?: string): { modes: number[] } | null {
  const m = body.modal;
  if (!m) return { modes: [] };
  const legal = legalModes(s, body, pid, sourceId ? sourceColors(s, sourceId) : undefined);
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
  return { modes: modes.sort((a, b) => a - b) };
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
    if (e.type === "destroy" || e.type === "exile" || e.type === "bounce" || e.type === "tap" || e.type === "putInLibrary") add(objs, true);
    else if (e.type === "untap") add(objs.filter((o) => o.tapped), false, () => 0.5);
    else if (e.type === "counters") add(objs, e.counter === "-1/-1", () => estimate(e.n) / 2);
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
    if (typeof o.type === "string") h = ["destroy", "exile", "bounce", "tap", "damage", "putInLibrary"].includes(o.type) || (o.type === "counters" && o.counter === "-1/-1") || (o.type === "continuous" && modsAreHarmful(o.mods as never));
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
  const c = card ? compileCard(card) : undefined;
  const hurts = c ? choiceHurts(c) : false;
  const tally = new Map<string, number>();
  const count = (name: string, n = 1) => options.includes(name) && tally.set(name, (tally.get(name) ?? 0) + n);
  const theirs = (o: GameObject) => (hurts ? controllerOf(s, o) !== pid : controllerOf(s, o) === pid);
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
      case "putOntoBattlefield":
        v += 8;
        break;
      case "putInLibrary":
        v += 1;
        break;
      case "exileGraveyard":
        v += 2;
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
function chooseDiscards(s: GameState, pid: PlayerId, count: number, except?: string): string[] {
  const lands = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
  const keepScore = (id: string) => {
    const d = defOf(s, obj(s, id));
    if (isType(d, "Land")) return lands >= 6 ? 0 : 10 - lands;
    return 8 - Math.max(0, mv(s, id) - lands);
  };
  return player(s, pid)
    .hand.filter((id) => id !== except)
    .sort((a, b) => keepScore(a) - keepScore(b))
    .slice(0, count);
}

/** Scry/surveil: keep lands while we need them and spells we can cast soon. */
function wantOnTop(s: GameState, pid: PlayerId, id: string): boolean {
  const lands = s.battlefield.filter((x) => controllerOf(s, obj(s, x)) === pid && objIsType(s, obj(s, x), "Land")).length;
  return isType(defOf(s, obj(s, id)), "Land") ? lands < 6 : mv(s, id) <= lands + 2;
}

function best(s: GameState, pid: PlayerId, pool: TargetChoice[], harmful: boolean, damage: number): TargetChoice {
  const threat = (t: TargetChoice) => {
    if (t.kind === "player") return harmful ? 100 - player(s, t.id).life : player(s, t.id).life === 0 ? 0 : 1;
    if (t.kind === "stack") return 50;
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
  };
  // Burn goes face only when it can't kill anything worthwhile.
  return [...pool].sort((a, b) => threat(b) - threat(a))[0]!;
}

function chooseActivation(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      // Keep our permanents (but cash in Food and Clues), and avoid free loops.
      const cashIn = ab.sacrificeSelf && o.isToken && !objIsType(s, o, "Creature");
      if ((ab.sacrificeSelf && !cashIn) || (!ab.tap && !ab.manaCost)) continue;
      if (o.attachedTo && ab.body.effects.some((e) => e.type === "attach")) continue; // already equipped
      if (isSelfRegeneration(ab.body)) continue; // only when something threatens it (chooseRegeneration)
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
        plan = planActivate(s, pid, id, i, targets.length ? targets : undefined, modes, undefined, x);
        if (plan) break;
      }
      // Not worth sacrificing a Treasure to cash in a Food or Clue.
      if (cashIn && plan?.some((a) => a.type === "activateMana" && manaActionAbility(s, a)?.sacrificeSelf)) continue;
      if (plan) return plan;
    }
  }
  return null;
}

function chooseUnearth(s: GameState, pid: PlayerId): Action[] | null {
  for (const id of player(s, pid).graveyard) {
    const abilities = abilitiesOf(s, obj(s, id)).activated;
    for (let i = 0; i < abilities.length; i++) {
      if (abilities[i]!.zone !== "graveyard") continue;
      const plan = planActivate(s, pid, id, i);
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
const isSelfRegeneration = (body: AbilityBody) => body.effects.length > 0 && body.effects.every((e) => e.type === "regenerate" && e.what.ref === "self");

function chooseRegeneration(s: GameState, pid: PlayerId): Action[] | null {
  const top = s.stack[s.stack.length - 1];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const abilities = abilitiesOf(s, o).activated;
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i]!;
      if (!isSelfRegeneration(ab.body) || (o.regenShields ?? 0) > 0) continue;
      const aimedAt = !!top && top.controller !== pid && top.targets?.some((t) => t.kind === "object" && t.id === id);
      const foes = s.step === "declareBlockers" && !top ? (o.blocking ? [o.blocking] : o.attacking !== undefined ? (o.blockedBy ?? []) : []) : [];
      const losing = foes.reduce((n, f) => n + (s.objects[f] ? power(s, obj(s, f)) : 0), 0) >= Math.max(1, lethalDamage(s, o));
      if (!aimedAt && !losing) continue;
      if (abilityProblem(s, pid, id, i) && !/not enough mana/.test(abilityProblem(s, pid, id, i)!)) continue;
      const plan = planActivate(s, pid, id, i, undefined, undefined);
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
    const i = abilities.findIndex((ab) => ab.crew !== undefined);
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

function chooseAttacks(s: GameState, pid: PlayerId): Action {
  const opps = opponents(s, pid);
  // Pressure whoever is lowest on life, but take the crown from an opponent who's the monarch
  // (CR 725.2) unless someone else is low enough to finish.
  const lowest = [...opps].sort((a, b) => player(s, a).life - player(s, b).life)[0]!;
  const reach = potentialAttackers(s, pid).reduce((n, o) => n + Math.max(0, power(s, o)), 0);
  const target = s.monarch !== undefined && opps.includes(s.monarch) && player(s, lowest).life > reach ? s.monarch : lowest;
  const theirBlockers = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === target && !o.tapped && objIsType(s, o, "Creature"));
  const biggestBlocker = Math.max(0, ...theirBlockers.map((o) => power(s, o)));
  const ready = potentialAttackers(s, pid).filter((o) => power(s, o) > 0);
  // Swing with everything when we outnumber their untapped blockers; otherwise only with creatures that survive a block.
  const allIn = ready.length > theirBlockers.length;
  // Creatures that attack each combat if able have to (CR 508.1d), whatever their power.
  const must = potentialAttackers(s, pid).filter((o) => characteristics(s, o).attacksIfAble && !ready.includes(o));
  const attacks = [...ready.filter((o) => allIn || characteristics(s, o).attacksIfAble || toughness(s, o) > biggestBlocker || theirBlockers.every((b) => blockProblem(s, b, o, target))), ...must]
    .map((o) => ({ attacker: o.id, defender: target }));
  return { type: "declareAttackers", player: pid, attacks };
}

function chooseBlocks(s: GameState, pid: PlayerId): Action {
  const me = player(s, pid);
  const incoming = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking === pid);
  const mine = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === pid && !o.tapped && objIsType(s, o, "Creature") && !characteristics(s, o).cantBlock);
  const used = new Set<string>();
  const blocks: { blocker: string; attacker: string }[] = [];
  const totalIncoming = incoming.reduce((n, a) => n + power(s, a), 0);
  const desperate = totalIncoming >= me.life;
  for (const at of [...incoming].sort((a, b) => power(s, b) - power(s, a))) {
    if (objHasKeyword(s, at, "Menace") || characteristics(s, at).cantBeBlocked) continue;
    const canBlock = mine.filter((b) => !used.has(b.id) && !blockProblem(s, b, at));
    const good = canBlock.find((b) => toughness(s, b) > power(s, at) && !objHasKeyword(s, at, "Deathtouch"));
    const trade = canBlock.find((b) => power(s, b) >= toughness(s, at));
    const pick = good ?? trade ?? (desperate ? canBlock[0] : undefined);
    if (pick) {
      used.add(pick.id);
      blocks.push({ blocker: pick.id, attacker: at.id });
    }
  }
  return { type: "declareBlockers", player: pid, blocks };
}
