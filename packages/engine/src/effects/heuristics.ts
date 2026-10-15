import { allEffects, refCovers } from "../abilities";
import type { AbilityBody, Amount, Modification } from "../abilities";
import { toughness } from "../cards";
import { compileGranted } from "../oracle";
import type { GameObject, GameState, ObjectId } from "../types";
import { harmfulCounter } from "./run-permanents";

/**
 * Would this untargeted ability do nothing right now? "{1}: Untap ~" on an untapped
 * permanent is still legal to activate (only the {Q} cost needs it tapped, CR 107.6), but
 * bots shouldn't waste mana on it and the UI says so.
 */
export function doesNothingNow(s: GameState, sourceId: ObjectId, body: AbilityBody): boolean {
  const o = s.objects[sourceId];
  if (!o || body.modal || body.targets.length || !body.effects.length) return false;
  return body.effects.every((e) => (e.type === "untap" || e.type === "tap") && e.what.ref === "self" && o.tapped === (e.type === "tap"));
}

/** Which targets of a body are aimed at something bad for the target (damage, removal, shrink)? Used by bots and the UI. */
export function harmfulTargets(body: AbilityBody): boolean[] {
  const harm = body.targets.map(() => false);
  const mark = (i: number, n = 1) => {
    for (let j = i; j < i + n; j++) harm[j] = true;
  };
  for (const e of allEffects(body.effects)) {
    if (e.type === "damage" && "index" in e.to) mark(e.to.index, "n" in e.to ? e.to.n : 1);
    // Returning a card from a graveyard to its owner's hand helps its owner.
    if (e.type === "bounce" && e.what.ref === "target" && body.targets[e.what.index]?.kind === "card") continue;
    // Phasing out removes a permanent until its controller's next turn: used against opponents' things.
    if (["destroy", "exile", "bounce", "tap", "skipUntap", "phaseOut"].includes(e.type) && "what" in e && e.what?.ref === "target") mark(e.what.index, e.what.n);
    if (e.type === "counters" && harmfulCounter(e.counter) && e.what.ref === "target") mark(e.what.index, e.what.n);
    if (e.type === "continuous" && e.what.ref === "target" && modsAreHarmful(e.mods)) mark(e.what.index, e.what.n);
    if ((e.type === "loseLife" || e.type === "mill" || e.type === "poison") && e.who.ref === "target") mark(e.who.index);
    if (e.type === "counterSpell") mark(e.index);
    if ((e.type === "discard" || e.type === "takeFromHand" || (e.type === "lookAtHand" && e.reveal)) && e.who.ref === "target") mark(e.who.index);
    if ((e.type === "fight" || e.type === "bite") && e.b.ref === "target") mark(e.b.index);
  }
  return harm;
}

/**
 * Would these changes be bad for the permanent's controller? Shrinking, losing abilities,
 * restrictions, or being stolen. Used by bots to aim Auras and effects.
 */
export function modsAreHarmful(mods: Modification[]): boolean {
  let pt = 0;
  for (const m of mods) {
    if (m.kind === "modifyPT") pt += estimate(m.power) + estimate(m.toughness);
    if (m.kind === "addAbility") pt -= grantCost(m.text);
    if (["control", "loseAllAbilities", "removeKeywords", "cantAttack", "cantBlock", "doesntUntap", "setSubtypes", "setLandTypes", "goad", "cantActivate"].includes(m.kind)) return true;
    if (m.kind === "setPT" && estimate(m.power) + estimate(m.toughness) <= 2) return true;
  }
  return pt < 0;
}

/**
 * How much a granted triggered ability hurts the permanent's controller, in power/toughness points: an
 * upkeep edict ('Enchanted creature has "At the beginning of your upkeep, sacrifice a creature."') or life
 * loss makes the Aura one to put on an opponent's creature.
 */
function grantCost(text: string): number {
  let n = 0;
  for (const t of compileGranted(text).triggers)
    for (const e of allEffects(t.body.effects)) {
      if (e.type === "sacrifice" || (e.type === "pick" && e.action !== "counters") || e.type === "cumulativeUpkeep") n += 10;
      else if (e.type === "loseLife" && e.who.ref === "you") n += 4;
      else if (e.type === "discard" && e.who.ref === "you") n += 4;
      else if ((e.type === "tap" && e.what.ref === "self") || (e.type === "counters" && harmfulCounter(e.counter) && e.what.ref === "self")) n += 4;
    }
  return n;
}

/** How much damage an effect body deals to target `i`, for picking what to kill. */
export function damageTo(body: AbilityBody, i: number, x = 0): number {
  let n = 0;
  for (const e of allEffects(body.effects)) if (e.type === "damage" && refCovers(e.to, i)) n += estimate(e.amount, x);
  return n;
}

export const lethalDamage = (s: GameState, o: GameObject) => Math.max(0, toughness(s, o) - o.damage);

/**
 * A rough value for an amount before the game works it out, for bots and previews: X as `x`,
 * a count as 2 of whatever it counts.
 */
export function estimate(a: Amount, x = 0): number {
  if (typeof a === "number") return a;
  const n = Math.max(0, (a.count.kind === "x" ? x : 2) * (a.times ?? 1) + (a.plus ?? 0));
  return a.negate ? -n : n;
}
