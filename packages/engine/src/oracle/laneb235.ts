// Lane B round B235's lines, read by compileCard before its triggers and activated abilities (after round B234's).
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const MIRROR = "{X}, {T}: Change the target of target spell with a single target if that target is you. The new target must be a player. X is twice the mana value of that spell.";
const SCRIVENER = "If you would draw a card while you have no cards in hand, instead you draw two cards and you lose 1 life.";
const WHIPPOORWILL = "{G}{G}, {T}: Target creature can't be regenerated this turn. Damage that would be dealt to that creature this turn can't be prevented or dealt instead to another permanent or player. When the creature dies this turn, exile the creature.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB235Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Whippoorwill: the target creature can't be regenerated this turn (CR 701.19c); damage that would be dealt to it this turn
  // can't be prevented (CR 615.12) or redirected to another permanent or player (CR 614.9), whatever its source, while it's
  // the object it was (CR 400.7: GameObject.damageUnalterableTurn); and a delayed trigger (CR 603.7c) exiles the card it
  // becomes in the graveyard if it dies this turn (a token ceases to exist instead, CR 704.5d).
  if (line === WHIPPOORWILL) {
    const a = parseActivated("{G}{G}, {T}: Target creature can't be regenerated this turn.");
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || a.body.targets.length !== 1 || e?.type !== "noRegen" || e.what.ref !== "target" || e.what.index !== 0) {
      out.unsupported.push(raw);
      return true;
    }
    const what = { ref: "target" as const, index: 0 };
    out.activated.push({
      ...a,
      text: raw,
      body: {
        ...a.body,
        effects: [e, { type: "damageUnalterable", what }, { type: "delayed", when: "dies", of: what, effects: [{ type: "exile", what: { ref: "subjectCard", zone: "graveyard" } }], text: "exile the creature", thisTurn: true }],
        text: WHIPPOORWILL.slice(WHIPPOORWILL.indexOf(": ") + 2),
      },
    });
    return true;
  }
  // Reflecting Mirror: Deflection's "change the target of target spell with a single target" (CR 115.7a), only if that one
  // target is you as it resolves, to another player it could target (Rebound's "The new target must be a player"). X is
  // defined by the target spell, twice its mana value with its X (CR 107.3c, 202.3e), worked out after targets as its cost
  // is (CR 601.2c, 601.2f: ActivatedAbility.xIs twiceTargetSpellMv). Only spells, not abilities (rulings).
  if (line === MIRROR) {
    const a = parseActivated("{X}, {T}: Change the target of target spell with a single target.");
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const spec = a && a !== "fail" ? a.body.targets[0] : undefined;
    if (!a || a === "fail" || a.body.targets.length !== 1 || spec?.kind !== "spell" || !spec.singleTarget || e?.type !== "changeTarget" || e.index !== 0 || e.unless || e.toSelf || e.all || e.anyOne || e.mustBe || e.ifOnly || a.xIs) {
      out.unsupported.push(raw);
      return true;
    }
    out.activated.push({ ...a, text: raw, xIs: { twiceTargetSpellMv: 0 }, body: { ...a.body, effects: [{ ...e, ifOnly: "you", mustBe: "player" }], text: MIRROR.slice(MIRROR.indexOf(": ") + 2) } });
    return true;
  }
  // Blood Scrivener: a replacement of each draw while its controller's hand is empty (CR 614.1a), applied in game.ts draw
  // (drawReplacementChoices "scrivener"), once in each chain of draws it made (CR 614.5).
  if (line === SCRIVENER) {
    if (out.drawTwoLoseLifeEmptyHand) out.unsupported.push(raw);
    else out.drawTwoLoseLifeEmptyHand = true;
    return true;
  }
  return false;
}
