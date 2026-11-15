// Lane B round B213's lines, read by compileCard before its triggers and activated abilities (after round B211's).
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB213Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Desolation: "At the beginning of each end step, each player who tapped a land for mana this turn sacrifices a land of
  // their choice. ~ deals 2 damage to each player who sacrificed a Plains this way.": the players who activated a mana
  // ability of a land with {T} in its cost this turn (CR 106.12), even before ~ was on the battlefield (rulings), each
  // sacrificing one land as it resolves, in APNAP order (CR 101.4); then 2 damage to each whose land was a Plains as it
  // last existed (CR 608.2h). Each Desolation does this once (rulings).
  if (line === "At the beginning of each end step, each player who tapped a land for mana this turn sacrifices a land of their choice. ~ deals 2 damage to each player who sacrificed a Plains this way.") {
    const t = trig("At the beginning of each end step, each player sacrifices a land of their choice. ~ deals 2 damage to each player.");
    const [sac, dmg] = t?.body.effects ?? [];
    if (!t || t.event !== "eachEndStep" || t.body.targets.length || t.body.effects.length !== 2 || sac?.type !== "pick" || sac.action !== "sacrifice" || sac.who.ref !== "eachPlayer" || sac.n !== 1 || dmg?.type !== "damage" || dmg.to.ref !== "eachPlayer" || dmg.amount !== 2) return fail();
    const effects: Effect[] = [{ ...sac, who: { ref: "tappedLandForMana" } }, { ...dmg, to: { ref: "sacrificedThisWay", subtype: "Plains" } }];
    out.triggers.push({ ...t, body: { ...t.body, effects, text: "each player who tapped a land for mana this turn sacrifices a land of their choice. ~ deals 2 damage to each player who sacrificed a Plains this way." } });
    return true;
  }
  // Kodama of the Center Tree: "~ has soulshift X, where X is the number of Spirits you control.": soulshift's dies trigger
  // (CR 702.46a), X the Spirits you controlled just before it died, itself included, so at least 1 (rulings, CR 603.10a),
  // fixed as it triggers for the target's mana value (TriggeredAbility.xLookBackSubtype); it can return itself (rulings).
  if (line === "~ has soulshift X, where X is the number of Spirits you control.") {
    const spec: TargetSpec = { kind: "card", owner: "you", subtypes: ["Spirit"], xRange: { key: "manaValue", at: "most" }, text: "target Spirit card with mana value x or less" };
    const text = "return target Spirit card with mana value X or less from your graveyard to your hand";
    out.triggers.push({
      event: "selfDies",
      xLookBackSubtype: "Spirit",
      body: { targets: [spec], effects: [{ type: "may", effects: [{ type: "bounce", what: { ref: "target", index: 0 } }], text }], text: `Soulshift X: you may ${text}, where X is the number of Spirits you controlled.` },
    });
    return true;
  }
  // Corrosive Ooze: "Whenever ~ blocks or becomes blocked by an equipped creature, destroy all Equipment attached to that
  // creature at end of combat.": one delayed trigger for each such creature (CR 603.7), the Equipment found as it resolves
  // (rulings), even if ~ has left; if that creature has left, the Equipment attached to it just before it left that's
  // still on the battlefield (rulings, CR 400.7).
  if (line === "Whenever ~ blocks or becomes blocked by an equipped creature, destroy all Equipment attached to that creature at end of combat.") {
    const t = trig("Whenever ~ blocks or becomes blocked by an equipped creature, destroy that creature at end of combat.");
    const d = t?.body.effects[0];
    if (!t || t.event !== "selfBlocksOrBlockedByCreature" || t.subjectFilter?.status !== "equipped" || t.body.effects.length !== 1 || d?.type !== "delayed" || d.when !== "endOfCombat" || d.each !== "subject" || d.effects.length !== 1 || d.effects[0]!.type !== "destroy") return fail();
    const equipment: TargetSpec = { kind: "object", types: ["Artifact"], subtypes: ["Equipment"], text: "Equipment" };
    const effects: Effect[] = [{ ...d, effects: [{ type: "destroy", what: { ref: "attachedToSubject", filter: equipment, lastKnown: true } }], text: "destroy all Equipment attached to that creature" }];
    out.triggers.push({ ...t, body: { ...t.body, effects, text: "destroy all Equipment attached to that creature at end of combat." } });
    return true;
  }
  return false;
}

/** Round B213's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB213Spell(text: string): AbilityBody | null | undefined {
  // Light Up the Night: "~ deals X damage to any target. It deals X plus 1 damage instead if that target is a creature or
  // planeswalker.": the one target, checked as it resolves (CR 608.2h); a player or a battle is dealt X.
  if (text === "~ deals X damage to any target. It deals X plus 1 damage instead if that target is a creature or planeswalker.") {
    const body = parseBody("~ deals X damage to any target.", { spell: true });
    const dmg = body?.effects[0];
    if (!body || body.targets.length !== 1 || body.targets[0]!.kind !== "any" || body.effects.length !== 1 || dmg?.type !== "damage" || dmg.to.ref !== "anyTarget") return null;
    const creatureOrPw: TargetSpec = { kind: "object", types: ["Creature", "Planeswalker"], notTypes: [], notColors: [], text: "creature or planeswalker" };
    const effects: Effect[] = [{ type: "if", cond: { kind: "targetIs", index: 0, filter: creatureOrPw }, effects: [{ ...dmg, amount: { count: { kind: "x" }, plus: 1 } }], otherwise: [dmg] }];
    return { targets: body.targets, effects, text };
  }
  return undefined;
}
