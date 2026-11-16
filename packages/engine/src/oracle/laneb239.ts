// Lane B round B239's lines, read by compileCard before its triggers and activated abilities (after round B238's), and its
// whole spells (after round B238's).
import type { AbilityBody, CompiledCard } from "../abilities";

const BORCA_NOTE = "Note the mana value of each card as it's put into exile.";
const BORCA_POWER = "~'s power is equal to the greatest number noted for it this turn.";
const PENDANT = "{T}, Mill a card: For each colored mana symbol in the milled card's mana cost, add one mana of that color.";
const SILHOUETTE = "Choose target creature. If a spell or ability that targets that creature would cause a source to deal damage to that creature this turn, prevent that damage.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB239Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Bell Borca, Spectral Sergeant: while it's on the battlefield, the mana value of each card put into exile, from anywhere,
  // is noted for it as the card is in exile (rulings: look at the card there, X is 0), in game.ts moveObject.
  if (line === BORCA_NOTE) {
    if (out.notesExiledMv) out.unsupported.push(raw);
    else out.notesExiledMv = true;
    return true;
  }
  // Its power, a characteristic-defining ability (CR 604.3, layer 7a): the greatest number noted for it this turn, 0 before
  // any is noted each turn and while it isn't on the battlefield (rulings).
  if (line === BORCA_POWER) {
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "definePT", power: { count: { kind: "selfNotedExiledMv" } } }], text: line });
    return true;
  }
  // Charmed Pendant: a mana ability (rulings: it doesn't use the stack), activated only when its controller could cast an
  // instant (the rulings and its reminder text), never while paying; its mana is read from the card its cost mills.
  if (line === PENDANT) {
    out.mana.push({ text: line, manaCost: "", tap: true, sacrificeSelf: false, millCost: true, instantOnly: true, produces: { kind: "milledSymbols" } });
    return true;
  }
  return false;
}

/** Round B239's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB239Spell(text: string): AbilityBody | null | undefined {
  // Silhouette: a prevention effect for the turn (CR 615.1) on the target creature, as the object it is (CR 400.7), for the
  // damage any source would deal it as a spell or ability resolves that targets it (DamageRule.by.targetingCause).
  if (text === SILHOUETTE)
    return {
      targets: [{ kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "target creature" }],
      effects: [{ type: "damageRule", rule: { to: { target: { ref: "target", index: 0 } }, by: { targetingCause: true } } }],
      text,
    };
  return undefined;
}
