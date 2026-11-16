// Lane B round B226's lines, read by compileCard before its triggers and activated abilities (after round B225's).
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

const STEAMFLOGGER = "If a Rigger you control would assemble a Contraption, it assembles two Contraptions instead.";
const SHIMMER_CHOICE = "As ~ enters, choose a land type.";
const SHIMMER = "Each land of the chosen type has phasing.";
const COSMOS = "Foretelling cards from your hand costs {1} less and can be done on any player's turn.";
const HALL = "At the beginning of each player's upkeep, that player chooses a color. Until end of turn, lands tapped for mana produce mana of the chosen color instead of any other color.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 * `lines` is the card's other lines, as compileCard reads them.
 */
export function roundB226Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, lines: readonly string[]): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Steamflogger Boss: "If a Rigger you control would assemble a Contraption, it assembles two Contraptions instead.":
  // assembling is a keyword action of the Unstable set, whose cards and mechanics aren't in the rules (CR 701.45a); no
  // Commander-legal card assembles a Contraption or has a Contraption deck, so in this game there is never an event for
  // the replacement to apply to (CR 614.1). The line is read and does nothing, like the draft-matters cards' (CR 905.2).
  if (line === STEAMFLOGGER) return true;
  // Shimmer: "As this enchantment enters, choose a land type." then "Each land of the chosen type has phasing.": any land
  // type, basic or not, an existing one (CR 205.3i, rulings), chosen as it enters (CR 614.12) and kept as Chosen.landType;
  // every land with that subtype, anyone's, has phasing (CR 702.26a) for as long as Shimmer is on the battlefield, in the
  // ability-adding layer (CR 613.1f), whichever lands have that type then.
  if (line === SHIMMER_CHOICE && lines.includes(SHIMMER)) {
    if (out.entersChoose?.length) return fail();
    out.entersChoose = [{ what: "landType" }];
    return true;
  }
  if (line === SHIMMER) {
    if (!out.entersChoose?.some((c) => c.what === "landType")) return fail();
    out.statics.push({ affects: { kind: "filter", types: ["Land"], spec: { kind: "object", types: ["Land"], chosen: "landType", text: "each land of the chosen type" } }, mods: [{ kind: "addKeywords", keywords: ["Phasing"] }], text: raw });
    return true;
  }
  // Cosmos Charger: "Foretelling cards from your hand costs {1} less and can be done on any player's turn.": the cost of the
  // special action (CR 702.143a, 116.2h), {2}, not the foretell cost a foretold card is later cast for; each Cosmos Charger
  // takes off {1}, to no less than {0} (CR 601.2f, rulings). With one on the battlefield, its controller may foretell any
  // time they have priority (rulings). A static ability of the permanent, so not while it's in hand (rulings, CR 113.6).
  if (line === COSMOS) {
    out.foretellActionLess = 1;
    return true;
  }
  // Hall of Gemstone: "At the beginning of each player's upkeep, that player chooses a color. Until end of turn, lands
  // tapped for mana produce mana of the chosen color instead of any other color.": the player whose upkeep it is chooses
  // as it resolves (CR 608.2d); then, until the turn ends (CR 514.2), a replacement effect (CR 106.12b, 614.1a) on the mana
  // any land is tapped for: each colored mana becomes that color, the same amount, colorless mana unchanged and any
  // restriction on the mana kept (rulings). A land that makes no mana isn't affected (rulings).
  if (line === HALL) {
    const t = trig("At the beginning of each player's upkeep, that player draws a card.");
    if (t?.event !== "eachUpkeep" || t.body.effects[0]?.type !== "draw" || t.body.effects[0].who.ref !== "eventPlayer") return fail();
    const effects: Effect[] = [
      { type: "choose", choice: "color", who: { ref: "eventPlayer" } },
      { type: "landManaUntilEndOfTurn", mana: "chosen", colored: true },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: "that player chooses a color. Until end of turn, lands tapped for mana produce mana of the chosen color instead of any other color." } });
    return true;
  }
  return false;
}
