// Lane B round B296's lines, read by compileCard before the generic triggers and activated abilities (after round B295's):
// Havengul Mystery's "the creature put onto the battlefield with ~" and Taskmaster, Mercenary Mimic's copy of a creature on
// the battlefield or a creature card in a graveyard.
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseTrigger } from "./triggers";

const MYSTERY_LEAVES = "When the creature put onto the battlefield with ~ leaves the battlefield, transform ~.";
const TASKMASTER =
  "At the beginning of your first main phase, until your next turn, ~ becomes a copy of up to one target creature on the battlefield or creature card in a graveyard, except his name is ~ and he's a legendary Human Mercenary Villain creature.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB296Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  if (line !== MYSTERY_LEAVES && line !== TASKMASTER) return false;
  if (isSpell) return fail();
  // Taskmaster, Mercenary Mimic: "Photographic Reflexes" is an ability word (CR 207.2c), gone by now. One target, either a
  // creature on the battlefield or a creature card in any graveyard (TargetSpec.orCard), none too; Taskmaster itself can be
  // it. The copy lasts until its controller's next turn begins (CR 611.2a): a permanent's copiable values (CR 707.2, 707.3),
  // or the card's as printed, its front face if it's double-faced (CR 712.8a). The exception isn't "in addition to its
  // other types" (CR 205.1b), so it sets them (CR 205.1a, 707.9b): its card type is creature only (a copy of an artifact
  // creature isn't an artifact, and an Equipment Creature loses Equipment with it), its creature types are Human
  // Mercenary Villain instead of the copied ones, and a changeling's CDA for them isn't copied (CR 707.9d). Setting card
  // types leaves supertypes alone, and gaining one keeps the others (CR 205.4b; rulings on Machine God's Effigy, Benthic
  // Anomaly), so it's legendary in addition to any it copied, like snow. Everything else is copied, the abilities too (so
  // a copy no longer has Photographic Reflexes, and nothing triggers while it lasts).
  if (line === TASKMASTER) {
    const tr = parseTrigger("At the beginning of your first main phase, ~ becomes a copy of up to one target creature until your next turn.");
    const copy = tr && tr !== "fail" ? tr.body.effects[0] : undefined;
    const spec = tr && tr !== "fail" ? tr.body.targets[0] : undefined;
    if (!tr || tr === "fail" || tr.event !== "yourFirstMain" || tr.body.effects.length !== 1 || copy?.type !== "becomeCopy" || copy.what.ref !== "self" || copy.of.ref !== "target" || copy.except || copy.duration !== "yourNextTurn" || spec?.kind !== "object" || !spec.optional || tr.body.targets.length !== 1) return fail();
    const card: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card in a graveyard" };
    const target: TargetSpec = { ...spec, orCard: card, text: "target creature on the battlefield or creature card in a graveyard" };
    out.triggers.push({ ...tr, body: { targets: [target], effects: [{ ...copy, except: { name: "~", legendary: true, setTypes: ["Creature"], setSubtypes: ["Human", "Mercenary", "Villain"] } }], text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  // Havengul Mystery: linked to its "When this land transforms into Havengul Mystery, return target creature card from your
  // graveyard to the battlefield." (CR 607.2c), the line before it (Effect putWithLink after the return). Both are printed
  // on the same double-faced card, so the link holds whichever face is up (CR 607.1b), while the land stays the same
  // object (CR 400.7). It triggers when such a creature leaves the battlefield for any zone while Mystery's face is up
  // (CR 603.10a: leaving with it too), and transforms it only if it hasn't transformed since (CR 701.27f).
  const returns = out.triggers.find((t) => t.event === "selfTransformsInto" && t.body.targets.length === 1 && t.body.effects.length === 1 && t.body.effects[0]!.type === "putOntoBattlefield");
  const put = returns?.body.effects[0];
  const spec = returns?.body.targets[0];
  const t = parseTrigger("Whenever another creature leaves the battlefield, transform ~.");
  if (!returns || put?.type !== "putOntoBattlefield" || put.what.ref !== "target" || put.what.index !== 0 || spec?.kind !== "card" || spec.types?.[0] !== "Creature" || !t || t === "fail" || t.event !== "permanentDies" || !t.dies?.leaves || t.body.effects.length !== 1) return fail();
  returns.body = { ...returns.body, effects: [...returns.body.effects, { type: "putWithLink", target: 0 }] };
  out.triggers.push({ ...t, dies: { ...t.dies, other: false, putWithSelf: true }, body: { ...t.body, text: "transform ~." } });
  return true;
}
