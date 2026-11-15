// Lane B round B215's lines, read by compileCard before its triggers and activated abilities (after round B214's), and its
// whole spells (chained from round B213's).
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB215Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  if (isSpell) return false;
  // Necrotic Plague: "When enchanted creature dies, its controller chooses target creature one of their opponents controls.
  // Return ~ from its owner's graveyard to the battlefield attached to that creature.": the dead creature's controller as
  // it last existed chooses the target (CR 603.3d, TargetSpec.chosenBy "subjectController"), a creature controlled by one
  // of their opponents; the Aura's controller as it triggered controls the ability (rulings) and returns the card under
  // their own control (CR 110.2a, rulings), from its owner's graveyard only. The ability is mandatory; with no legal target
  // it's removed, and with the target gone or the Aura unable to enchant it, the card stays in the graveyard (rulings, CR
  // 303.4f-g).
  if (line === "When enchanted creature dies, its controller chooses target creature one of their opponents controls. Return ~ from its owner's graveyard to the battlefield attached to that creature.") {
    const t = trig("When enchanted creature dies, draw a card.");
    if (!t || t.event !== "permanentDies" || !t.dies?.attached || t.zone || t.ifCond) return fail();
    const target: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], chosenBy: "subjectController", opponentOfSubjectController: true, harmsEnchanted: true, text: "creature one of your opponents controls" };
    const effects: Effect[] = [{ type: "putOntoBattlefield", what: { ref: "selfCard", moved: true }, attachToTarget: 0 }];
    out.triggers.push({ ...t, body: { targets: [target], effects, text: "its controller chooses target creature one of their opponents controls. Return ~ from its owner's graveyard to the battlefield attached to that creature." } });
    return true;
  }
  return false;
}

/** Round B215's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB215Spell(text: string): AbilityBody | null | undefined {
  // Reweave: "Target permanent's controller sacrifices it. If the player does, they reveal cards from the top of their
  // library until they reveal a permanent card that shares a card type with the sacrificed permanent, put that card onto
  // the battlefield, then shuffle.": only if it was sacrificed (rulings); the types it had right before it was sacrificed
  // (rulings, CR 608.2h); a permanent card (no instant or sorcery, the kindred errata); that player puts it onto the
  // battlefield under their control and shuffles (CR 701.20a: with none found, the whole library is revealed).
  if (text === "Target permanent's controller sacrifices it. If the player does, they reveal cards from the top of their library until they reveal a permanent card that shares a card type with the sacrificed permanent, put that card onto the battlefield, then shuffle.") {
    const body = parseBody("Target permanent's controller sacrifices it. Its controller reveals cards from the top of their library until they reveal a permanent card that shares a card type with that permanent. The player puts that card onto the battlefield, then shuffles the rest into their library.", { spell: true });
    const [sac, reveal] = body?.effects ?? [];
    if (!body || body.targets.length !== 1 || body.effects.length !== 2 || sac?.type !== "sacrifice" || !sac.byController || reveal?.type !== "revealUntil" || reveal.sharesTypeWith !== 0 || reveal.found !== "battlefield" || reveal.who?.ref !== "targetController") return null;
    const effects: Effect[] = [sac, { type: "if", cond: { kind: "sacrificedThisWay" }, effects: [reveal] }];
    return { targets: body.targets, effects, text };
  }
  // Cleansing: "For each land, destroy that land unless any player pays 1 life." (Effect eachLandUnlessAnyPaysLife.)
  if (text === "For each land, destroy that land unless any player pays 1 life.") {
    const filter: TargetSpec = { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "land" };
    return { targets: [], effects: [{ type: "eachLandUnlessAnyPaysLife", filter, life: 1 }], text };
  }
  return undefined;
}
