// Lane B round B229's lines, read by compileCard before its triggers and activated abilities (after round B228's), and its
// whole spells (after round B222's).
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";
import { roundB230Spell } from "./laneb230";
import { parseTrigger } from "./triggers";
import { colorTemplate } from "./color-template";

const DESPOILER = "As ~ enters, you may put two cards your opponents own from exile into their owners' graveyards. If you do, ~ enters with four +1/+1 counters on it.";
const WAR_MACHINE = "When ~ dies, destroy all Merfolk tapped this turn to pay for its abilities.";
const SUFFOCATION = "~ deals 4 damage to the controller of the last red instant or sorcery spell that dealt damage to you this turn. Draw a card at the beginning of the next turn's upkeep.";
const BACKDRAFT = "Choose a player who cast one or more sorcery spells this turn. ~ deals damage to that player equal to half the damage dealt by one of those sorcery spells this turn, rounded down.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB229Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Ulamog's Despoiler: "As this creature enters, you may put two cards your opponents own from exile into their owners'
  // graveyards. If you do, this creature enters with four +1/+1 counters on it.": part of how it enters (CR 614.1c, 614.12),
  // the cards chosen then, two or none, from different opponents too, never one card twice; a face-down card is chosen by its
  // group, then at random within it; with fewer than two there, it can't (rulings). The counters come with the cards put
  // there, even when a replacement effect keeps one in exile (rulings on Anafenza, the Foremost).
  if (line === DESPOILER) {
    if (out.entersProcess) return fail();
    out.entersProcess = { n: 2, counters: 4 };
    return true;
  }
  // Vodalian War Machine: "When this creature dies, destroy all Merfolk tapped this turn to pay for its abilities.": the
  // Merfolk tapped as its activated abilities' costs (rulings: as each is activated, CR 602.2b), kept for this War Machine
  // as the permanent it was (CompiledCard.logsCostTapped, Effect destroyCostTapped).
  if (line === WAR_MACHINE) {
    const t = parseTrigger("When ~ dies, draw a card.");
    if (!t || t === "fail" || t.event !== "selfDies" || t.body.effects.length !== 1 || out.logsCostTapped) return fail();
    const effects: Effect[] = [{ type: "destroyCostTapped", filter: { kind: "object", subtypes: ["Merfolk"], text: "Merfolk" } }];
    out.triggers.push({ ...t, body: { targets: [], effects, text: "destroy all Merfolk tapped this turn to pay for its abilities." } });
    out.logsCostTapped = true;
    return true;
  }
  return false;
}

/** Round B229's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB229Spell(text: string): AbilityBody | null | undefined {
  // Suffocation: "Suffocation deals 4 damage to the controller of the last red instant or sorcery spell that dealt damage to
  // you this turn. Draw a card at the beginning of the next turn's upkeep.": a red instant or a red sorcery (rulings), red as
  // it dealt the damage, the latest one; its controller as it dealt it (TurnLog.spellDamage). No target. Then the delayed
  // draw (CR 603.7).
  // Its color as a text change of color words leaves it (color-template.ts, round 462).
  const suffocation = colorTemplate(SUFFOCATION, text);
  if (suffocation) {
    const b = parseBody("~ deals 4 damage to each opponent. Draw a card at the beginning of the next turn's upkeep.", { spell: true });
    const [dmg, draw] = b?.effects ?? [];
    if (!b || b.targets.length || b.effects.length !== 2 || dmg?.type !== "damage" || dmg.to.ref !== "eachOpponent" || dmg.amount !== 4 || draw?.type !== "delayed") return null;
    return { targets: [], effects: [{ ...dmg, to: { ref: "lastSpellDamagedYou", color: suffocation[0]![0]!, types: ["Instant", "Sorcery"] } }, draw], text };
  }
  // Backdraft: see Effect halfSpellDamageBack.
  if (text === BACKDRAFT) return { targets: [], effects: [{ type: "halfSpellDamageBack" }], text };
  return roundB230Spell(text);
}
