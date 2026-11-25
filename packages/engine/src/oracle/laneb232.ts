// Lane B round B232's lines, read by compileCard before its triggers and activated abilities (after round B231's), and its
// whole spells (after round B231's).
import type { AbilityBody, CompiledCard, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { colorTemplate, withColors } from "./color-template";
import { roundB233Spell } from "./laneb233";
import { parseTrigger } from "./triggers";

const FALLEN = "Whenever ~'s cumulative upkeep is paid, it gets +1/+0 until end of turn for each {B} or {R} spent this way.";
const HEROISM = "Sacrifice a white creature: For each attacking red creature, prevent all combat damage that would be dealt by that creature this turn unless its controller pays {2}{R}.";
const ORGG = "You may assign ~'s combat damage divided as you choose among defending player and/or any number of creatures they control.";
const ENFORCER = "~ can't be destroyed by lethal damage unless lethal damage dealt by a single source is marked on it.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB232Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Balduvian Fallen: "Whenever ~'s cumulative upkeep is paid" is Hibernation's End's event (CR 702.24a: paid as its
  // upkeep trigger resolves, while it's still on the battlefield); "for each {B} or {R} spent this way" counts the mana
  // spent on that payment (TriggerEventInfo.spent, Amount "eventSpent"), worked out as the trigger resolves (CR 608.2h).
  // Only the card's own cumulative upkeep {1}, compiled before this line, is read here.
  if (line === FALLEN) {
    const t = parseTrigger("Whenever you pay ~'s cumulative upkeep, ~ gets +1/+0 until end of turn.");
    const pump = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const upkeep = out.triggers.some((x) => x.body.effects.length === 1 && x.body.effects[0]!.type === "cumulativeUpkeep");
    if (!t || t === "fail" || t.event !== "selfCumulativeUpkeepPaid" || pump?.type !== "continuous" || pump.mods.length !== 1 || pump.mods[0]!.kind !== "modifyPT" || !upkeep) {
      out.unsupported.push(raw);
      return true;
    }
    const mod = { ...pump.mods[0]!, power: { count: { kind: "eventSpent" as const, types: ["B" as const, "R" as const] }, times: 1 } };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ ...pump, mods: [mod] }], text: "it gets +1/+0 until end of turn for each {B} or {R} spent this way." } });
    return true;
  }
  // Heroism: the attacking red creatures as it resolves, each controller asked in turn order (CR 101.4) whether to pay
  // {2}{R} for each of theirs, then (rulings) paid or not; one not paid for has all the combat damage it would deal this
  // turn prevented, as the creature it is (CR 615.1, 611.2c). Paying stops only this activation's prevention (rulings).
  const heroism = colorTemplate(HEROISM, line);
  if (heroism) {
    const a = parseActivated(withColors("Sacrifice a white creature: Tap all attacking red creatures.", heroism));
    const tap = a && a !== "fail" ? a.body.effects[0] : undefined;
    const cost = a && a !== "fail" && a.costs?.length === 1 ? a.costs[0] : undefined;
    if (!a || a === "fail" || a.tap || a.manaCost || cost?.kind !== "sacrifice" || cost.n !== 1 || a.body.effects.length !== 1 || tap?.type !== "tap" || tap.what.ref !== "each") {
      out.unsupported.push(raw);
      return true;
    }
    const filter: TargetSpec = { ...tap.what.filter, text: withColors("attacking red creature", [heroism[1]!]) };
    const text = line.slice(line.indexOf(": ") + 2);
    out.activated.push({ ...a, text: raw, body: { targets: [], effects: [{ type: "attackersPayOrPrevent", filter, cost: "{2}{R}" }], text } });
    return true;
  }
  // Butcher Orgg: an exception to CR 510.1a-c chosen as its combat damage is assigned, while it's attacking: all of it
  // divided among the player it's attacking or the controller of the planeswalker it's attacking (CR 508.5) and any
  // creatures that player controls, at least 1 to each chosen (rulings), blocked or not; none if it's blocked by no
  // creature any more (rulings). See game.ts askDivideCombatDamage.
  if (line === ORGG) {
    out.divideCombatDamage = true;
    return true;
  }
  // Ogre Enforcer: lethal damage (CR 120.6) destroys it as a state-based action (CR 704.5g) only if one source's damage
  // marked on it is lethal by itself (rulings: sources don't add up); deathtouch damage (704.5h) and 0 toughness (704.5f)
  // still put it into the graveyard (rulings). See GameObject.damageFrom.
  if (line === ENFORCER) {
    out.lethalFromOneSource = true;
    return true;
  }
  return false;
}

/** Round B232's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB232Spell(text: string): AbilityBody | null | undefined {
  return roundB233Spell(text);
}
