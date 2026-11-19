// Lane B round B263's whole spells (read after round B262's, roundB262Spell in oracle/laneb262.ts) and sentences (read at
// the end of round B260's chain, roundB260Sentence in oracle/laneb260.ts): Guardian Angel, Blood of the Martyr, and the
// ability Torrent of Lava gives each creature (its line is roundB263Line in oracle/laneb263-lines.ts).
import type { AbilityBody, Effect, TargetSpec } from "../abilities";
import { parseBody, type Ctx } from "./body";
import { roundB264Spell } from "./laneb264";

type Found = { effect: Effect; next: number } | "fail" | null;

const ANGEL = "Prevent the next X damage that would be dealt to any target this turn. Until end of turn, you may pay {1} any time you could cast an instant. If you do, prevent the next 1 damage that would be dealt to that permanent or player this turn.";
const MARTYR = "Until end of turn, if damage would be dealt to any creature, you may have that damage dealt to you instead.";

const CREATURE: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };

export function roundB263Spell(text: string): AbilityBody | null | undefined {
  // Guardian Angel: a shield of X on its target (CR 615.7), then a permission for the rest of the turn: paying {1} is an
  // action the effect lets its controller take later, a special action (CR 116.2c) any time they have priority, each time
  // a shield of 1 more on "that permanent or player", its target (GameState.payShields, pay-shields.ts).
  if (text === ANGEL) {
    const b = parseBody("Prevent the next X damage that would be dealt to any target this turn.", { spell: true });
    if (!b || b.targets.length !== 1 || b.targets[0]!.kind !== "any" || b.effects.length !== 1 || b.effects[0]!.type !== "preventNext") return null;
    return { ...b, effects: [...b.effects, { type: "payShieldGrant", index: 0, cost: "{1}", n: 1 }], text };
  }
  // Blood of the Martyr: a redirection effect (CR 614.9) for the rest of the turn, for damage to any creature, whoever
  // controls it, from any source, combat or not; its controller chooses each time, for each source's damage to each
  // creature (DamageRule.redirectMay, damage.ts planShields). Redirected damage is still dealt by its source (CR 614.9).
  if (text === MARTYR) return { targets: [], effects: [{ type: "damageRule", rule: { to: { objects: CREATURE }, redirect: { ref: "you" }, redirectMay: true } }], text };
  return roundB264Spell(text);
}

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB263Sentence(s: string, _sentences: string[], si: number, _ctx: Ctx): Found {
  // Torrent of Lava's granted "{T}: Prevent the next 1 damage that would be dealt to this creature by Torrent of Lava this
  // turn": a shield of 1 on the creature (as the object it is, CR 400.7) against damage from that spell only (CR 615.7,
  // 609.7a), the spell bound as the layers give the ability (grants.ts bindGrantSource).
  if (plain(s) === "Prevent the next 1 damage that would be dealt to ~ by ⟪source⟫ this turn")
    return { effect: { type: "damageRule", rule: { to: { target: { ref: "self" } }, by: { target: { ref: "grantSource" } }, n: 1 } }, next: si + 1 };
  return null;
}
