// Lane B round B238's lines, read by compileCard before its triggers and activated abilities (after round B237's), and its
// whole spells (after round B236's).
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { roundB239Spell } from "./laneb239";
import { parseTrigger } from "./triggers";

const CONSULATE = "Whenever an opponent casts a spell, if it has a single target, change the target to enchanted creature if able.";
const DENIZEN = "At the beginning of your upkeep, sacrifice two Swamps. If you can't, tap ~, and an opponent may gain control of a creature you control of their choice for as long as ~ remains on the battlefield.";
const PIRACY = "Until end of turn, you may tap lands you don't control for mana. Spend this mana only to cast spells.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB238Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Captured by the Consulate: a cast trigger with an intervening if (CR 603.4) on the spell having exactly one target as
  // it was cast (the same object chosen for two targets is two, rulings), checked again as it resolves; the new target is
  // the creature this Aura enchants, only if that's legal for the spell (CR 115.7; rulings: otherwise it stays the same).
  if (line === CONSULATE) {
    const t = parseTrigger("Whenever an opponent casts a spell, counter that spell.");
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.by !== "opponent") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, cast: { ...t.cast, singleTarget: true }, body: { targets: [], effects: [{ type: "consulateRedirect" }], text: "if it has a single target, change the target to enchanted creature if able." } });
    return true;
  }
  // Infernal Denizen: its controller must sacrifice two Swamps if they can; with fewer, they sacrifice what they have
  // (CR 609.3, rulings: "you must sacrifice the Swamps if you can"), and "if you can't" is then true. Its controller chooses
  // the opponent (rulings: in a multiplayer game, you choose which opponent takes the prescribed action as it resolves);
  // that opponent may take any creature its controller controls, ~ too (rulings), for as long as ~ stays on the battlefield
  // whoever controls it (layer 2; none if it has left already, CR 611.2b).
  if (line === DENIZEN) {
    const t = parseTrigger("At the beginning of your upkeep, sacrifice two Swamps.");
    const sac = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourUpkeep" || sac?.type !== "pick" || sac.action !== "sacrifice" || t.body.effects.length !== 1) {
      out.unsupported.push(raw);
      return true;
    }
    const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
    const otherwise: Effect[] = [
      { type: "tap", what: { ref: "self" } },
      { type: "choose", choice: "opponent" },
      { type: "pick", who: { ref: "chosenPlayer" }, among: { ref: "you" }, filter: creature, n: 1, upTo: true, action: "choose", prompt: "you may choose one of the creatures of ~'s controller and gain control of it for as long as ~ remains on the battlefield" },
      { type: "continuous", what: { ref: "created" }, mods: [{ kind: "control" }], duration: "whileControlled", whileOnBattlefield: true, giveTo: { ref: "chosenPlayer" } },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects: [sac, { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "sacrificedThisWayCount" } }, min: 2 }, effects: [], otherwise }], text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  return false;
}

/** Round B238's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB238Spell(text: string): AbilityBody | null | undefined {
  // Piracy: for the rest of the turn its controller may activate the mana abilities with {T} in their costs of lands
  // other players control (CR 106.12, 605.3a); that mana can only be spent to cast spells (CR 106.6).
  if (text === PIRACY) return { targets: [], effects: [{ type: "piracy" }], text };
  return roundB239Spell(text);
}
