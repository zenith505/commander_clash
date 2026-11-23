// Round 458: Illusionary Mask. "{X}: You may choose a creature card in your hand whose mana cost could be paid by some
// amount of, or all of, the mana you spent on {X}. If you do, you may cast that card face down as a 2/2 creature spell
// without paying its mana cost. If the creature that spell becomes as it resolves has not been turned face up and would
// assign or deal damage, be dealt damage, or become tapped, instead it's turned face up and assigns or deals damage, is
// dealt damage, or becomes tapped."
import { defOf, isType } from "../cards";
import { objectSource, planShields, type DamageEvent } from "../damage";
import { castProblem, faceUpCopies, faceUpCopyOptions, faceUpFormsOf, log, nameOf, player, turnFaceUpByEffect } from "../game";
import { controllerOf } from "../layers";
import { parseManaCost, type CostSymbol } from "../mana";
import { moveAnswer } from "../move-questions";
import type { GameObject, GameState, ManaType, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";

/** One mana spent on {X}: its type, and whether a snow source made it (CR 107.4h). */
export interface MaskMana {
  type: ManaType;
  snow: boolean;
}

/**
 * Could `cost` be paid by some of, or all of, `mana`, no more than `cap` of it (the mana spent on {X} when the ability cost
 * more than X, rulings: "both the amount and types of mana you spent on {X} are taken into account")? Each symbol takes mana
 * it could be paid with (CR 107.4, 202.1a): a colored or Phyrexian symbol mana of its color (not life: only the mana spent
 * counts), a hybrid symbol mana of either half ({C/W}: colorless too), {2/W} one mana of its color or two of any type, {S} one
 * from a snow source, generic mana any type; {X} is 0 (CR 107.3b, the card isn't cast for its mana cost). A card with no mana
 * cost has an unpayable one (CR 118.6, 202.1b), and a symbol not understood pays nothing.
 */
export function maskCanPay(cost: string, mana: readonly MaskMana[], cap = mana.length): boolean {
  if (!cost) return false;
  const parsed = parseManaCost(cost);
  if (!parsed.supported) return false;
  const specific = parsed.symbols.filter((y) => y.kind !== "generic" && y.kind !== "x");
  const generic = parsed.symbols.reduce((n, y) => n + (y.kind === "generic" ? y.amount : 0), 0);
  const fits = (y: CostSymbol, m: MaskMana): boolean => {
    switch (y.kind) {
      case "colored":
        return m.type === y.color;
      case "phyrexian":
        return m.type === y.color;
      case "hybrid":
        return (y.options as readonly ManaType[]).includes(m.type) || (!!y.orC && m.type === "C");
      case "twoHybrid":
        return m.type === y.color;
      case "snow":
        return m.snow;
      default:
        return false;
    }
  };
  const used = new Array<boolean>(mana.length).fill(false);
  // Each specific symbol in turn takes one unused mana (or {2/W} two of any type); then the generic part takes any of
  // what's left, all within `cap`.
  const go = (i: number, spent: number): boolean => {
    if (spent > cap) return false;
    if (i === specific.length) return mana.length - spent >= generic && spent + generic <= cap;
    const y = specific[i]!;
    for (let k = 0; k < mana.length; k++) {
      if (used[k] || !fits(y, mana[k]!)) continue;
      used[k] = true;
      if (go(i + 1, spent + 1)) return true;
      used[k] = false;
    }
    // {2/W}: two mana of any type instead (CR 107.4e).
    if (y.kind === "twoHybrid") {
      for (let a = 0; a < mana.length; a++) {
        if (used[a]) continue;
        used[a] = true;
        for (let b = a + 1; b < mana.length; b++) {
          if (used[b]) continue;
          used[b] = true;
          if (go(i + 1, spent + 2)) return true;
          used[b] = false;
        }
        used[a] = false;
      }
    }
    return false;
  };
  return go(0, 0);
}

/** The mana spent on {X} of the resolving Illusionary Mask ability, and how much of it pays X itself. */
function maskManaOf(s: GameState): { mana: MaskMana[]; cap: number } {
  const item = s.resolving!.item;
  const types = (item.manaSpentTypes ?? []).filter((m): m is ManaType => "WUBRGC".includes(m));
  const snowLeft: Partial<Record<ManaType, number>> = { ...(item.manaSpentSnow ?? {}) };
  const mana = types.map((type) => {
    const snow = (snowLeft[type] ?? 0) > 0;
    if (snow) snowLeft[type] = snowLeft[type]! - 1;
    return { type, snow };
  });
  // A cost increase (an ability that costs {1} more) is paid with the X too: the mana for it is the activator's choice, so
  // no more than X of the mana spent is the mana spent on {X}; a reduction leaves all of what was spent paying X.
  return { mana, cap: Math.min(mana.length, item.x ?? 0) };
}

/** The creature cards in `pid`'s hand whose mana cost the mana spent on {X} could pay (maskCanPay). */
export function maskCards(s: GameState, pid: PlayerId, mana: readonly MaskMana[], cap: number): ObjectId[] {
  return player(s, pid).hand.filter((id) => {
    const d = defOf(s, s.objects[id]!);
    return isType(d, "Creature") && maskCanPay(d.manaCost, mana, cap);
  });
}

/**
 * The ability's effect. Its controller may choose one of those cards (chooseOption "maskCard", not revealed: rulings, the
 * card is shown only to them), then may cast it face down as a 2/2 creature spell without paying its mana cost, timing
 * ignored as it resolves (CR 608.2g, 708.4, 118.9; castFree `how` "mask"): the spell and the creature it becomes have
 * GameObject.maskFaceUp. Cost increases still apply (CR 118.9d). It can be responded to and countered like any spell (rulings).
 */
export function runIllusionaryMaskEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const pid = ctx.controller;
  const p = player(s, pid);
  if (!sc.mask) {
    const { mana, cap } = maskManaOf(s);
    const ids = maskCards(s, pid, mana, cap);
    if (!ids.length) {
      log(s, `${p.name} has no creature card in their hand that the mana spent on X could pay for (${src}).`);
      return;
    }
    sc.mask = { card: "" };
    const what = cap ? `${cap} mana spent on X` : "no mana spent on X";
    s.pending = {
      kind: "chooseOption",
      player: pid,
      source: src,
      what: "maskCard",
      options: [...ids, "none"],
      labels: [...ids.map((id) => defOf(s, s.objects[id]!).name), "Don't choose a card"],
      prompt: `you may choose a creature card in your hand whose mana cost the ${what} could pay (${mana.map((m) => `{${m.type}}`).join("") || "none"}), to cast it face down as a 2/2 creature spell without paying its mana cost`,
      secret: true,
    };
    return "paused";
  }
  const chosen = sc.mask.card;
  if (!chosen || chosen === "none") return;
  if (sc.mask.offered) return; // cast, or declined (chooseMay)
  sc.mask.offered = true;
  const o = s.objects[chosen];
  if (!o || o.zone !== "hand" || o.owner !== pid) return;
  s.pending = { kind: "castFree", player: pid, objectId: o.id, source: src, how: "mask" };
  const problem = castProblem(s, pid, o.id, undefined, undefined, undefined, undefined, undefined, { faceDown: true });
  // Mana abilities can still be activated for a cost increase (CR 601.2g), so only the mana in the pool may be short.
  if (problem === null || /^not enough mana/.test(problem)) return "paused";
  s.pending = null;
  log(s, `${p.name} can't cast the chosen card face down (${problem}).`);
}

/** Is this a face-down permanent Illusionary Mask's replacement applies to (it hasn't been turned face up since)? */
export const maskApplies = (o: GameObject | undefined): o is GameObject => !!o && o.zone === "battlefield" && !!o.faceDown && !!o.maskFaceUp;

/**
 * Illusionary Mask's replacement: the face-down creature is turned face up (CR 708.8) before the event it would have, which
 * then happens to it as it is face up. Not a special action and no cost; "as it's turned face up" choices (Aquamorph
 * Entity's form, Vesuvan Shapeshifter's copy) are its controller's, asked in the middle of the event (move-questions.ts). One
 * that can't be turned face up (Unable to Scream) stays face down, and the replacement goes on applying to it.
 */
export function maskTurnsUp(s: GameState, o: GameObject): void {
  if (!maskApplies(o)) return;
  const pid = controllerOf(s, o);
  const zc = o.zoneChanges ?? 0;
  const forms = faceUpFormsOf(s, o);
  let form: number | undefined;
  if (forms?.length) {
    const key = `maskForm:${o.id}@${zc}`;
    const name = defOf(s, { ...o, faceDown: undefined }).name;
    form = Number(moveAnswer(s, key, () => ({ player: pid, key, about: o.id, source: "Illusionary Mask", prompt: `${name} is turned face up (Illusionary Mask): what does it become?`, options: forms.map((_, i) => String(i)), labels: forms.map((f) => f.text), botChoice: "0" })));
  }
  let copy: ObjectId | "none" | undefined;
  if (faceUpCopies(s, o)) {
    const key = `maskCopy:${o.id}@${zc}`;
    const name = defOf(s, { ...o, faceDown: undefined }).name;
    const opts = faceUpCopyOptions(s, o);
    const a = moveAnswer(s, key, () => ({ player: pid, key, about: o.id, source: "Illusionary Mask", prompt: `${name} is turned face up (Illusionary Mask): a creature for it to copy, or none`, options: [...opts, "none"], labels: [...opts.map((id) => nameOf(s, id)), "Don't copy a creature"], botChoice: opts[0] ?? "none" }));
    copy = a === "none" ? "none" : a;
  }
  turnFaceUpByEffect(s, o, "Illusionary Mask", undefined, form, undefined, copy);
}

/**
 * Damage to or from a face-down creature Illusionary Mask applies to that something else would prevent or redirect all of:
 * which applies first is `chooser`'s choice (CR 616.1). True if the Mask's does (the creature is turned face up, then the
 * damage is prevented or redirected as it is face up); false if the other does (no damage is dealt to or by it, so it stays
 * face down). `from`: the damage's source, when it's damage dealt to the creature.
 */
export function maskFirst(s: GameState, o: GameObject, chooser: PlayerId, from?: string): boolean {
  const key = `maskOrder:${o.id}@${o.zoneChanges ?? 0}:${s.turn}:${s.step}`;
  return (
    moveAnswer(s, key, () => ({
      player: chooser,
      key,
      about: o.id,
      source: "Illusionary Mask",
      prompt: `Damage ${from !== undefined ? `from ${from} to a face-down creature` : "from a face-down creature"} would be prevented or redirected: which applies first?`,
      options: ["up", "prevent"],
      labels: ["Turn the face-down creature face up first (Illusionary Mask)", "Prevent or redirect the damage first: it stays face down"],
      botChoice: "prevent",
    })) === "up"
  );
}

/**
 * Damage about to be dealt at once (before its shields are planned, damage.ts planDamage and game.ts finishCombatDamage):
 * each face-down creature Illusionary Mask applies to that would deal or be dealt some of it is turned face up first, and
 * then deals or is dealt it as it is face up (its source's characteristics are read again; the amounts stay as they were).
 *
 * When something else would prevent or redirect all of that damage (a prevention shield, protection, a redirection), both
 * apply to the same event and the affected player chooses which applies first (CR 616.1): the creature's controller for
 * damage dealt to it, the player dealt the damage or the controller of the permanent dealt it for damage it deals (the
 * rulings on damage replacements, as Torbran's). Prevented first, no damage is dealt and the creature stays face down. Only
 * then is there a choice: otherwise it's turned face up either way. Whether all of it would be prevented is worked out as
 * the shields would be chosen by bots (planShields `auto`).
 */
export function maskBeforeDamage(s: GameState, events: DamageEvent[]): DamageEvent[] {
  const masked = new Map<ObjectId, { deals: DamageEvent[]; dealt: DamageEvent[] }>();
  const note = (id: ObjectId | undefined, e: DamageEvent, side: "deals" | "dealt") => {
    const o = id ? s.objects[id] : undefined;
    if (!maskApplies(o)) return;
    const m = masked.get(o.id) ?? { deals: [], dealt: [] };
    m[side].push(e);
    masked.set(o.id, m);
  };
  for (const e of events) {
    if (e.n <= 0) continue;
    note(e.src.id, e, "deals");
    if ("object" in e.to) note(e.to.object, e, "dealt");
  }
  if (!masked.size) return events;
  const plan = planShields(s, events, [], true);
  const turned = new Set<ObjectId>();
  for (const [id, m] of masked) {
    const o = s.objects[id]!;
    if (!maskApplies(o)) continue;
    const still = plan.final.some((f) => f.n > 0 && (f.src.id === id || ("object" in f.to && f.to.object === id)));
    if (!still) {
      const first = m.dealt[0] ?? m.deals[0]!;
      const chooser = m.dealt.length ? controllerOf(s, o) : "player" in first.to ? first.to.player : controllerOf(s, s.objects[first.to.object]!);
      if (!maskFirst(s, o, chooser, m.dealt.length ? first.src.name : undefined)) continue;
    }
    maskTurnsUp(s, o);
    if (!o.faceDown) turned.add(id);
  }
  if (!turned.size) return events;
  return events.map((e) => (e.src.id && turned.has(e.src.id) ? { ...e, src: { ...e.src, ...objectSource(s, s.objects[e.src.id]!) } } : e));
}
