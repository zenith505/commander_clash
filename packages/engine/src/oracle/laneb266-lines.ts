// Lane B round B266's lines, read by compileCard before the generic triggers (after round B265's): Mirror-Shield Hoplite's
// copy of a backup ability, Defensive Formation's damage assignment and Power Pack's free cast at your next upkeep.
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

const HOPLITE = "Whenever a creature you control becomes the target of a backup ability, copy that ability. You may choose new targets for the copy. This ability triggers only once each turn.";
const FORMATION = "Rather than the attacking player, you assign the combat damage of each creature attacking you. You can divide that creature's combat damage as you choose among any of the creatures blocking it.";
const POWER_PACK = "Whenever ~ deals combat damage to a player, exile target instant or sorcery card from your graveyard chosen at random. At the beginning of your next upkeep, you may cast that card without paying its mana cost. If that spell would be put into your graveyard, exile it instead.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB266Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Mirror-Shield Hoplite (rulings): any player's backup ability (CR 702.165a) targeting a creature you control, once each
  // turn (CR 603.2h, GameObject.triggeredThisTurn). As it resolves, a copy of that ability while it's still on the stack
  // (CR 707.10), yours (CR 707.10c), its source the original's (so if the copy ends up aimed at the creature with backup, it
  // gets the counter but no abilities, rulings); you may choose new targets for it (CR 707.10c). Its counters and abilities
  // are the original's, fixed as it triggered (CR 702.165d).
  if (line === HOPLITE) {
    const t = isSpell ? null : parseTrigger("Whenever a creature you control becomes the target of a spell or ability, draw a card. This ability triggers only once each turn.");
    const copy = parseTrigger("Whenever you activate an ability that isn't a mana ability, copy that ability. You may choose new targets for the copy.");
    const e = copy && copy !== "fail" ? copy.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "permanentBecomesTarget" || !t.oncePerTurn || t.subjectFilter?.controller !== "you" || t.body.targets.length || e?.type !== "copySpell" || e.spell !== "cause" || !e.newTargets) return fail();
    out.triggers.push({ ...t, targeted: { ...t.targeted, ability: true, backup: true }, body: { targets: [], effects: [e], text: "copy that ability. You may choose new targets for the copy." } });
    return true;
  }
  // Defensive Formation: banding's rule (CR 702.22j) for every creature attacking you (not a planeswalker or battle you
  // control, CR 506.3): you decide how its combat damage is assigned, divided as you choose among the creatures blocking it,
  // and the choices of trample and the other ways it could assign its damage are yours (rulings).
  if (line === FORMATION) {
    if (isSpell || out.assignsAttackersDamage) return fail();
    out.assignsAttackersDamage = true;
    return true;
  }
  // Power Pack: a random target among the legal ones as the trigger is put on the stack (CR 603.3d, as Scab-Clan Giant's
  // rulings); exiled as it resolves, then a delayed trigger about that card in exile (CR 603.7c, 400.7), at the beginning of
  // your next upkeep; as that resolves you may cast it if it's still there, ignoring timing (CR 608.2g), without paying its
  // mana cost (X is 0, CR 118.9), and the spell is exiled instead of going to your graveyard.
  if (line === POWER_PACK) {
    const t = isSpell ? null : parseTrigger("Whenever ~ deals combat damage to a player, exile target instant or sorcery card from your graveyard chosen at random.");
    const ex = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.body.targets.length !== 1 || t.body.effects.length !== 1 || ex?.type !== "exile" || !("ref" in ex.what) || ex.what.ref !== "target") return fail();
    const rest = line.slice(line.indexOf("At the beginning"));
    out.triggers.push({ ...t, body: { ...t.body, effects: [...t.body.effects, { type: "delayedCastExiledTarget", index: 0, text: rest }], text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  return false;
}
