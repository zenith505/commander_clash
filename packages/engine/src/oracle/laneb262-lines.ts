// Lane B round B262's lines, read by compileCard before the generic triggers (after round B261's): Immortal Coil, Bitter
// Feud and Winter's Chill's limit on X. Winter's Chill's spell is roundB262Spell (oracle/laneb262.ts).
import type { CompiledCard, DamageMod } from "../abilities";
import { parseBody } from "./body";
import { parseCount } from "./counts";

const COIL_PREVENT = "If damage would be dealt to you, prevent that damage. Exile a card from your graveyard for each 1 damage prevented this way.";
const COIL_LOSE = "When there are no cards in your graveyard, you lose the game.";
const FEUD = "If a source controlled by one of the chosen players would deal damage to the other chosen player or a permanent that player controls, that source deals double that damage to that player or permanent instead.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB262Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(line);
    return true;
  };
  // Winter's Chill: "X can't be greater than the number of snow lands you control.": a limit on the X announced as it's
  // cast (CR 601.2b), counted then (game.ts castProblem).
  if (line === "X can't be greater than the number of snow lands you control.") {
    if (!isSpell) return fail();
    out.xMaxSnowLands = true;
    return true;
  }
  if (isSpell) return false;
  // Immortal Coil: a prevention effect (CR 615.1a), so "damage can't be prevented" stops it (CR 615.12) and the player
  // orders it with the other replacement and prevention effects (CR 616.1). All the damage is prevented, however few cards
  // there are, and a card is exiled for each 1 prevented, all of them with fewer (rulings), right after the damage would
  // have been dealt (CR 615.5); the player chooses which (damage-picks.ts). Damage prevented this way counts as prevented
  // ("whenever damage that would be dealt to you is prevented").
  if (line === COIL_PREVENT) {
    const mod: DamageMod = { op: "exileYard", prevent: true, upTo: true, to: { players: "you" }, text: line };
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line });
    return true;
  }
  // Immortal Coil: a state trigger (CR 603.8): it checks the graveyard only as it triggers, and its controller loses the
  // game as it resolves even if a card is put there by then; once it has resolved or left the stack, it triggers again
  // while the graveyard is still empty (rulings).
  if (line === COIL_LOSE) {
    const amount = parseCount("the number of cards in your graveyard", null);
    const body = parseBody("You lose the game.", { selfIt: true });
    if (!amount || typeof amount !== "object" || !body || body.targets.length || body.effects.length !== 1 || body.effects[0]!.type !== "loseGame") return fail();
    out.triggers.push({ event: "state", state: { kind: "amount", amount, max: 0 }, body: { ...body, text: "you lose the game." } });
    return true;
  }
  // Bitter Feud: a replacement effect (CR 614.1a), not prevention, so "damage can't be prevented" doesn't stop it; the
  // player being dealt the damage, or the controller of the permanent, orders it with the other replacement and prevention
  // effects (CR 616.1, rulings), and two Bitter Feuds choosing the same players double it twice (rulings). The two players
  // chosen as it entered (CR 614.12, "As ~ enters, choose two players"); any source, not only combat damage (rulings).
  if (line === FEUD) {
    if (!out.entersChooseTwoPlayers) return fail();
    const mod: DamageMod = { op: "times", n: 2, feud: true, text: line };
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line });
    return true;
  }
  return false;
}
