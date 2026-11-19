// Lane B round B264's whole spells, read after round B263's (roundB263Spell in oracle/laneb263.ts): Close Encounter and
// Bend or Break. Soul Echo's line is roundB264Line in oracle/laneb264-lines.ts.
import type { AbilityBody } from "../abilities";
import { parseBody } from "./body";
import { roundB265Spell } from "./laneb265";

const ENCOUNTER = "~ deals damage equal to the power of the chosen creature or card to target creature.";
const BEND = "Each player separates all nontoken lands they control into two piles. For each player, one of their piles is chosen by one of their opponents of their choice. Destroy all lands in the chosen piles. Tap all lands in the other piles.";

export function roundB264Spell(text: string): AbilityBody | null | undefined {
  // Close Encounter: the creature or warped card its additional cost chose (Amount beheldPower; compile.ts checks that it
  // has that one cost): a creature's power as the spell resolves, or as it last existed on the battlefield (rulings, CR
  // 608.2h); a card still in exile, its power there.
  if (text === ENCOUNTER) {
    const b = parseBody("~ deals 1 damage to target creature.", { spell: true });
    const dmg = b?.effects.length === 1 ? b.effects[0]! : undefined;
    if (!b || b.targets.length !== 1 || dmg?.type !== "damage" || dmg.to.ref !== "target" || dmg.also) return null;
    return { ...b, effects: [{ ...dmg, amount: { count: { kind: "beheldPower" } } }], text };
  }
  // Bend or Break: piles (CR 700.3), each player's own nontoken lands, separated by that player in APNAP order (CR 101.4);
  // then for each player an opponent of their choice chooses one pile. Destroyed at once, then the rest tapped (Effect
  // bendOrBreak, effects/run-laneb264.ts).
  if (text === BEND) return { targets: [], effects: [{ type: "bendOrBreak" }], text };
  return roundB265Spell(text);
}
