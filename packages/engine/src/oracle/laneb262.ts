// Lane B round B262's whole spells, read after round B250's (roundB250Spell in oracle/laneb250.ts): Winter's Chill.
import type { AbilityBody } from "../abilities";
import { parseBody } from "./body";
import { roundB263Spell } from "./laneb263";

const CHILL = "Choose X target attacking creatures. For each of those creatures, its controller may pay {1} or {2}. If that player doesn't, destroy that creature at end of combat. If that player pays only {1}, prevent all combat damage that would be dealt to and dealt by that creature this combat.";

export function roundB262Spell(text: string): AbilityBody | null | undefined {
  // Winter's Chill: X target attacking creatures (CR 601.2c, X announced first, 601.2b); as it resolves, each one's
  // controller chooses (rulings): pay {2} and it acts as normal, pay {1} and all combat damage dealt to and by it this
  // combat is prevented (CR 615.1), or pay nothing and it's destroyed at end of combat (a delayed trigger, CR 511.2, 603.7)
  // while it deals and is dealt damage as usual. Effect payFullOrPart (effects/run-laneb262.ts).
  if (text === CHILL) {
    const b = parseBody("Tap X target attacking creatures.", { spell: true });
    const t = b?.targets[0];
    if (!b || b.targets.length !== 1 || t?.kind !== "object" || t.many !== "exactX" || t.combat !== "attacking") return null;
    return { targets: [{ ...t, text: "target attacking creature" }], effects: [{ type: "payFullOrPart", index: 0, full: "{2}", part: "{1}" }], text };
  }
  return roundB263Spell(text);
}
