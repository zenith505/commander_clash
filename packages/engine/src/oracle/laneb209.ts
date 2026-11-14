// Lane B round B209's lines, read by compileCard before its triggers and activated abilities (after round B208's).
import type { CompiledCard, Effect, TriggeredAbility } from "../abilities";
import { parseActivated } from "./activated";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB209Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Laccolith Rig: "Whenever enchanted creature becomes blocked, you may have it deal damage equal to its power to target
  // creature. If you do, the first creature assigns no combat damage this turn.": the Aura's controller chooses the target,
  // any creature, and decides as it resolves (rulings, even on an opponent's creature); the enchanted creature deals the
  // damage, its power then, and doing it means it assigns no combat damage this turn (CR 510.1). It triggers however it
  // became blocked (rulings, CR 509.1h), and the creatures are fixed as it triggers (rulings: moving the Aura later changes
  // nothing): "it" and "the first creature" are the trigger's subject.
  if (line === "Whenever enchanted creature becomes blocked, you may have it deal damage equal to its power to target creature. If you do, the first creature assigns no combat damage this turn.") {
    const base = parseTrigger("Whenever enchanted creature becomes blocked, it gets +1/+0 until end of turn.");
    const creature = parseTargetPhrase("creature");
    if (!base || base === "fail" || base.event !== "selfBecomesBlocked" || base.host !== "attached" || creature?.kind !== "object") return fail();
    const effects: Effect[] = [
      { type: "may", effects: [{ type: "damage", amount: { count: { kind: "power", of: { ref: "subject" } } }, to: { ref: "target", index: 0 }, by: "subject" }], text: "have it deal damage equal to its power to target creature" },
      { type: "if", cond: { kind: "youDid" }, effects: [{ type: "noCombatDamage", what: { ref: "subject" } }] },
    ];
    out.triggers.push({ ...base, body: { targets: [{ ...creature, text: "target creature" }], effects, text: line.replace(/^Whenever enchanted creature becomes blocked, /, "") } });
    return true;
  }
  // Bill Potts: "Whenever you cast an instant or sorcery spell that targets only ~ or activate an ability that targets only
  // ~, copy that spell or ability. You may choose new targets for the copy. This ability triggers only once each turn.":
  // two events, each its own trigger with the same text, so "only once each turn" counts both (GameObject
  // triggeredThisTurn, CR 603.2h). Every target of it this permanent (rulings: several targets all naming it count), as it
  // was cast or activated; the copy is made on the stack, not cast or activated (rulings, CR 707.10).
  if (line === "Whenever you cast an instant or sorcery spell that targets only ~ or activate an ability that targets only ~, copy that spell or ability. You may choose new targets for the copy. This ability triggers only once each turn.") {
    const cast = parseTrigger("Whenever you cast an instant or sorcery spell that targets only ~, copy that spell. You may choose new targets for the copy. This ability triggers only once each turn.");
    const act = parseTrigger("Whenever you activate an ability that isn't a mana ability, copy that ability. You may choose new targets for the copy. This ability triggers only once each turn.");
    if (!cast || cast === "fail" || !act || act === "fail" || cast.cast?.targetsOnly !== "self" || !cast.oncePerTurn || !act.oncePerTurn || act.event !== "abilityActivated" || !act.activates || act.activates.of) return fail();
    const text = "copy that spell or ability. You may choose new targets for the copy.";
    const halves: TriggeredAbility[] = [
      { ...cast, body: { ...cast.body, text } },
      { ...act, activates: { ...act.activates, targetsOnlySelf: true }, body: { ...act.body, text } },
    ];
    out.triggers.push(...halves);
    return true;
  }
  // Beamsplitter Mage: "Whenever you cast an instant or sorcery spell that targets only ~, if you control one or more other
  // creatures that spell could target, choose one of those creatures. Copy that spell. The copy targets the chosen
  // creature.": an intervening if (CR 603.4), checked as it's cast and again as it resolves (rulings); one copy, aimed at
  // the chosen creature in every target, made only while the spell is on the stack and only if the copy could target it
  // (rulings, CR 707.10c); ~ having left doesn't matter (rulings).
  if (line === "Whenever you cast an instant or sorcery spell that targets only ~, if you control one or more other creatures that spell could target, choose one of those creatures. Copy that spell. The copy targets the chosen creature.") {
    const t = parseTrigger("Whenever you cast an instant or sorcery spell that targets only ~, copy that spell.");
    const yours = parseTargetPhrase("creature you control");
    if (!t || t === "fail" || t.cast?.targetsOnly !== "self" || yours?.kind !== "object") return fail();
    const among = { ...yours, text: "other creature you control" };
    out.triggers.push({
      ...t,
      cast: { ...t.cast, otherYoursCouldTarget: among },
      body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among, self: true, chooseOne: true } }], text: line.replace(/^Whenever [^,]+, /, "") },
    });
    return true;
  }
  // Shuriken's granted "{T}, Unattach Shuriken: Shuriken deals 2 damage to target creature. That creature's controller gains
  // control of Shuriken unless it was unattached from a Ninja.": the target's controller as it resolves, for the rest of
  // the game (layer 2, CR 613.1b), unless the creature its cost unattached it from was a Ninja as that was paid. With the
  // target illegal, nothing happens (CR 608.2b).
  if (line === "{T}, Unattach ⟪source⟫: ⟪source⟫ deals 2 damage to target creature. That creature's controller gains control of ⟪source⟫ unless it was unattached from a Ninja.") {
    const ab = parseActivated("{T}, Unattach ⟪source⟫: ⟪source⟫ deals 2 damage to target creature.");
    if (!ab || ab === "fail" || ab.grantSourceCost?.action !== "unattach" || ab.body.targets.length !== 1 || ab.body.effects.length !== 1) return fail();
    const give: Effect = { type: "continuous", what: { ref: "grantSource" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "targetController", index: 0 } };
    out.activated.push({ ...ab, body: { ...ab.body, effects: [...ab.body.effects, { type: "if", cond: { kind: "unattachedFromNinja" }, effects: [], otherwise: [give] }], text: line.replace(/^[^:]+: /, "") }, text: line });
    return true;
  }
  return false;
}
