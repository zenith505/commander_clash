// Lane B round B224's lines, read by compileCard before its triggers and activated abilities (after round B223's).
import type { CompiledCard } from "../abilities";
import type { ManaType } from "../types";
import { parseActivated } from "./activated";

/** An activated ability line read the usual way, or null. */
const act = (text: string) => {
  const a = parseActivated(text);
  return a && a !== "fail" ? a : null;
};

const LAND_TYPES: Record<string, string> = { Plains: "Plains", Islands: "Island", Swamps: "Swamp", Mountains: "Mountain", Forests: "Forest" };
const HARVEST_MAGE = "Until end of turn, if you tap a land for mana, it produces one mana of a color of your choice instead of any other type and amount.";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB224Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Naked Singularity, Reality Twist: "If tapped for mana, Plains produce {R}, Islands produce {G}, Swamps produce {W},
  // Mountains produce {U}, and Forests produce {B} instead of any other type.": a replacement effect (CR 106.12b, 614.1a)
  // on the mana any player's land with one of those basic land types (CR 305.6) is tapped for, the same amount of the
  // listed color; with two of them, the color of the choice of the player tapping it, all the mana that one color
  // (rulings). A land type listed twice (after a text change) gives that choice too (rulings).
  const m = !isSpell ? /^If tapped for mana, (.+) instead of any other type\.$/.exec(line) : null;
  if (m) {
    const parts = m[1]!.replace(/,? and /, ", ").split(", ");
    const map: { subtype: string; mana: ManaType }[] = [];
    for (const part of parts) {
      const p = /^(Plains|Islands|Swamps|Mountains|Forests) produce \{([WUBRGC])\}$/.exec(part);
      if (!p) return fail();
      map.push({ subtype: LAND_TYPES[p[1]!]!, mana: p[2] as ManaType });
    }
    if (map.length < 2) return fail();
    (out.landManaBySubtype ??= []).push(map);
    return true;
  }
  // Pulse of Llanowar: "If a basic land you control is tapped for mana, it produces mana of a color of your choice instead
  // of any other type.": the same amount of mana (rulings), all of one color chosen each time it's tapped, the one it would
  // make included (rulings; CR 106.12b, 614.1a).
  if (!isSpell && line === "If a basic land you control is tapped for mana, it produces mana of a color of your choice instead of any other type.") {
    out.basicLandManaAnyColor = true;
    return true;
  }
  // Harvest Mage: "{G}, {T}, Discard a card: Until end of turn, if you tap a land for mana, it produces one mana of a color
  // of your choice instead of any other type and amount.": a replacement effect until the turn ends (CR 514.2, 614.1a) on
  // the mana you tap any land for, a land you come to control later this turn too, exactly one mana of the color you choose
  // each time. The lands you tap for mana are the ones you control (CR 106.12, 602.2).
  const at = !isSpell && line.endsWith(`: ${HARVEST_MAGE}`) ? line.slice(0, -HARVEST_MAGE.length - 2) : null;
  if (at !== null) {
    const a = act(`${at}: Until end of turn, if you tap a land you control for mana, it produces {G} instead of any other type.`);
    const [e] = a?.body.effects ?? [];
    if (!a || a.body.targets.length || a.body.effects.length !== 1 || e?.type !== "landManaUntilEndOfTurn" || !e.yours || e.nonbasic || e.subtype) return fail();
    out.activated.push({ ...a, body: { targets: [], effects: [{ ...e, mana: "any", one: true }], text: HARVEST_MAGE }, text: line });
    return true;
  }
  return false;
}
