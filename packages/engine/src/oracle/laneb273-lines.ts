// Lane B round B273's lines, read by compileCard before the generic triggers and statics (after round B272's):
// Spellweaver Volute's enchant ability and trigger, and Bludgeon Brawl's static ability.
import type { CardDef } from "../types";
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const VOLUTE = "Whenever you cast a sorcery spell, copy the enchanted instant card. You may cast the copy without paying its mana cost. If you do, exile the enchanted card and attach ~ to another instant card in a graveyard.";

const BRAWL = 'Each noncreature, non-Equipment artifact is an Equipment with equip {X} and "Equipped creature gets +X/+0," where X is that artifact\'s mana value.';

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB273Line(line: string, out: CompiledCard, isSpell: boolean, d: CardDef): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Spellweaver Volute: an Aura spell that targets an instant card in a graveyard and enters attached to it, staying on
  // the battlefield attached to a card in another zone (CR 303.4a, 303.4f; rulings: the first Aura to enchant something
  // that's neither a permanent nor a player). It falls off as a state-based action once that card changes zones (CR
  // 400.7, 704.5m; rulings), game.ts.
  if (line === "Enchant instant card in a graveyard") {
    if (!d.subtypes.includes("Aura") || out.enchant) return fail();
    out.enchant = { kind: "card", types: ["Instant"], text: "instant card in a graveyard to enchant" };
    return true;
  }
  // Its trigger: as it resolves, the enchanted card is copied (the copy created in a graveyard, CR 707.12, rulings) and
  // may be cast from there, free (CR 118.9), while the ability resolves, timing ignored (CR 608.2g); a copy not cast
  // ceases to exist (CR 704.5e, 707.10a). Only if it's cast, the enchanted card is exiled and ~ is attached to another
  // instant card in a graveyard, chosen as it resolves (not targeted, CR 701.3a); with none, it's left attached to
  // nothing and goes to the graveyard (rulings). Effect copyEnchantedCard (run-laneb273.ts).
  if (line === VOLUTE) {
    const t = isSpell ? undefined : parseTrigger("Whenever you cast a sorcery spell, draw a card.");
    if (!t || t === "fail" || t.event !== "castSpell" || !out.enchant || out.enchant.kind !== "card") return fail();
    const effects: Effect[] = [{ type: "copyEnchantedCard" }];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^Whenever you cast a sorcery spell, /, "") } });
    return true;
  }
  // Bludgeon Brawl: every such artifact on the battlefield, whoever controls it, gets the Equipment subtype in layer 4 and
  // the two abilities in layer 6 (CR 613.1d, 613.1f), the same group in both (CR 613.6). "Noncreature" makes it depend on
  // effects that make artifacts creatures (March of the Machines applies first, CR 613.8a), so one that becomes a
  // creature stops being affected (rulings) and becomes unattached (CR 704.5p); "non-Equipment" leaves out artifacts
  // that already are Equipment, a second Brawl's included (its effect then applies to none, CR 613.8b, 613.6). X is the
  // mana value of each artifact (Modification addAbility `mvX`). The artifacts keep their other types and abilities.
  if (line === BRAWL) {
    if (isSpell) return fail();
    out.statics.push({
      affects: { kind: "filter", types: ["Artifact"], spec: { kind: "object", types: ["Artifact"], notTypes: ["Creature"], notSubtypes: ["Equipment"], notColors: [], text: "noncreature, non-Equipment artifact" } },
      mods: [
        { kind: "addTypes", types: [], subtypes: ["Equipment"] },
        { kind: "addAbility", text: "Equip {X}", mvX: true },
        { kind: "addAbility", text: "Equipped creature gets +X/+0.", mvX: true },
      ],
      text: line,
    });
    return true;
  }
  return false;
}
