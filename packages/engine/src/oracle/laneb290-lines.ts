// Lane B round B290's lines, read by compileCard before the generic triggers and statics (after round B289's): "a name
// originally printed in the ... expansion" (Golgothian Sylex, Apocalypse Chime, City in a Bottle), names first printed in
// one of three old sets (first-printings.ts, TargetSpec.firstPrintedIn).
import type { CompiledCard, TargetSpec } from "../abilities";
import { OLD_SET_NAME, type OldSet } from "../first-printings";
import { parseActivated } from "./activated";

const SET_OF: Record<string, OldSet> = { Antiquities: "atq", "Arabian Nights": "arn", Homelands: "hml" };
const SETS = Object.values(OLD_SET_NAME).join("|");

/** "(other) nontoken permanents with a name originally printed in the X expansion": any permanent type, never a token. */
const filterOf = (set: OldSet, text: string): TargetSpec => ({ kind: "object", types: [], notTypes: [], notColors: [], token: false, firstPrintedIn: set, text });

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB290Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Golgothian Sylex: "Each nontoken permanent with a name originally printed in the Antiquities expansion is sacrificed by
  // its controller." Each player sacrifices those they control (CR 701.21a: only a permanent's controller can sacrifice
  // it), all at once; Sylex itself too, being one of them. A token is never one, even a copy of one (CR 111.1).
  const sylex = new RegExp(`^(\\{[^:]+\\}(?:, \\{T\\})?): Each nontoken permanent with a name originally printed in the (${SETS}) expansion is sacrificed by its controller\\.$`).exec(line);
  if (sylex) {
    if (isSpell) return fail();
    const set = SET_OF[sylex[2]!]!;
    const ab = parseActivated(`${sylex[1]}: Each player sacrifices all nontoken artifacts they control.`);
    const e = ab && ab !== "fail" ? ab.body.effects[0] : undefined;
    if (!ab || ab === "fail" || ab.body.effects.length !== 1 || e?.type !== "sacrifice" || e.what.ref !== "each" || !e.byController) return fail();
    const rest = line.slice(sylex[1]!.length + 2);
    out.activated.push({ ...ab, body: { ...ab.body, effects: [{ ...e, what: { ref: "each", filter: filterOf(set, `nontoken permanents with a name originally printed in the ${sylex[2]} expansion`) } }], text: rest }, text: line });
    return true;
  }
  // Apocalypse Chime: "Destroy all nontoken permanents with a name originally printed in the Homelands expansion. They can't
  // be regenerated." (CR 701.8, 701.19c).
  const chime = new RegExp(`^(\\{[^:]+\\}(?:, \\{T\\})?(?:, Sacrifice (?:~|this artifact))?): Destroy all nontoken permanents with a name originally printed in the (${SETS}) expansion\\. They can't be regenerated\\.$`).exec(line);
  if (chime) {
    if (isSpell) return fail();
    const set = SET_OF[chime[2]!]!;
    const ab = parseActivated(`${chime[1]!.replace("this artifact", "~")}: Destroy all nontoken artifacts. They can't be regenerated.`);
    const e = ab && ab !== "fail" ? ab.body.effects[0] : undefined;
    if (!ab || ab === "fail" || ab.body.effects.length !== 1 || e?.type !== "destroy" || e.what.ref !== "each" || !e.noRegen) return fail();
    const rest = line.slice(chime[1]!.length + 2);
    out.activated.push({ ...ab, body: { ...ab.body, effects: [{ ...e, what: { ref: "each", filter: filterOf(set, `all nontoken permanents with a name originally printed in the ${chime[2]} expansion`) } }], text: rest }, text: line });
    return true;
  }
  // City in a Bottle's first line: a state trigger (CR 603.8): it triggers while at least one other such nontoken
  // permanent is on the battlefield, and not again until it has left the stack. "Them" are the ones on the battlefield as
  // it resolves (the rulings check whenever a player would receive priority), each sacrificed by its controller.
  const city = new RegExp(`^Whenever one or more other nontoken permanents with a name originally printed in the (${SETS}) expansion are on the battlefield, their controllers sacrifice them\\.$`).exec(line);
  if (city) {
    if (isSpell) return fail();
    const filter = filterOf(SET_OF[city[1]!]!, `other nontoken permanents with a name originally printed in the ${city[1]} expansion`);
    out.triggers.push({
      event: "state",
      state: { kind: "onBattlefield", filter, min: 1, other: true },
      body: { targets: [], effects: [{ type: "sacrifice", what: { ref: "each", filter, other: true }, byController: true }], text: "their controllers sacrifice them." },
    });
    return true;
  }
  // City in a Bottle's second line (CompiledCard.firstPrintedBan; names.ts): every player's spells and land plays.
  const ban = new RegExp(`^Players can't cast spells or play lands with a name originally printed in the (${SETS}) expansion\\.$`).exec(line);
  if (ban) {
    if (isSpell || out.firstPrintedBan) return fail();
    out.firstPrintedBan = SET_OF[ban[1]!]!;
    return true;
  }
  return false;
}
