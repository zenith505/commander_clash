// Lane B round B233's lines, read by compileCard before its triggers and activated abilities (after round B232's), and its
// whole spells (after round B232's).
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const VAMPIRE = "Whenever ~ deals combat damage to a player, any number of target players each mill that many cards. Then you may collect evidence 9. When you do, you may cast target nonland card from defending player's graveyard without paying its mana cost.";
const ORACLE = "{T}: Target opponent chooses any number of creatures they control. During that player's next turn, the chosen creatures attack if able, and other creatures can't attack. At the beginning of that turn's end step, destroy each of the chosen creatures that didn't attack this turn. Activate only during your turn.";
const KILLER_ENTERS = "When ~ enters, create a 1/1 white Human creature token, a 1/1 blue Merfolk creature token, and a 1/1 red Goblin creature token. Then secretly choose Human, Merfolk, or Goblin.";
const KILLER_REVEAL = "Sacrifice ~, Reveal the creature type you chose: If target attacking creature token is the chosen type, put three +1/+1 counters on it and it gains deathtouch until end of turn.";
const RIDDLES = "Look at the top four cards of your library and separate them into a face-down pile and a face-up pile. An opponent chooses one of the piles. Put that pile into your hand and the other into your graveyard.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB233Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Memory Vampire: read as the same trigger with an instant card, then the reflexive trigger's target made a nonland card
  // (CR 603.12: its target chosen as it's put on the stack, after the evidence is collected; rulings). Any number of target
  // players, none too (rulings, CR 601.2c); collecting evidence 9 is possible only with enough mana value in your graveyard
  // (CR 701.59a, rulings). "Defending player" is the player it dealt the combat damage to, as for every "deals combat damage
  // to a player" trigger here (CR 506.2, 510.1). The card is cast as the reflexive trigger resolves (CR 608.2g), goes where
  // it would after it resolves, and a land card can't be the target (CR 305.9 aside, "nonland").
  if (line === VAMPIRE) {
    const t = parseTrigger(VAMPIRE.replace("target nonland card from defending player's graveyard", "target instant card from that player's graveyard"));
    const effects = t && t !== "fail" ? t.body.effects : [];
    const iff = effects[2];
    const reflexive = iff?.type === "if" && iff.cond.kind === "youDid" && iff.effects.length === 1 ? iff.effects[0] : undefined;
    const card = reflexive?.type === "reflexive" && reflexive.body.targets.length === 1 ? reflexive.body.targets[0] : undefined;
    const cast = reflexive?.type === "reflexive" && reflexive.body.effects.length === 1 ? reflexive.body.effects[0] : undefined;
    if (!t || t === "fail" || iff?.type !== "if" || t.event !== "selfDealsCombatDamageToPlayer" || effects.length !== 3 || effects[0]!.type !== "mill" || effects[1]!.type !== "may" || reflexive?.type !== "reflexive" || card?.kind !== "card" || card.controller !== "eventPlayer" || card.types?.join() !== "Instant" || cast?.type !== "castTargetFree" || cast.exileAfter) {
      out.unsupported.push(raw);
      return true;
    }
    const target = { ...card, types: [], notTypes: ["Land"], text: "target nonland card from defending player's graveyard" };
    const text = "You may cast target nonland card from defending player's graveyard without paying its mana cost.";
    const body: AbilityBody = { ...t.body, effects: [effects[0]!, effects[1]!, { ...iff, effects: [{ ...reflexive, body: { ...reflexive.body, targets: [target], text } }] }], text: VAMPIRE.slice(VAMPIRE.indexOf(", ") + 2) };
    out.triggers.push({ ...t, body });
    return true;
  }
  // Oracle en-Vec: the target opponent chooses as it resolves (CR 608.2d), any number, none too. "That player's next turn"
  // is the first turn they begin after it resolves; during it the chosen creatures attack if able (CR 508.1d) and every
  // other creature can't attack (CR 508.1c), so creatures that player gets later can't either; chosen creatures that didn't
  // attack that turn are destroyed as its end step begins (a delayed trigger, CR 603.7), the others aren't affected
  // (rulings). Each chosen creature is the object it was (CR 400.7). See Effect chosenAttackNextTurn.
  if (line === ORACLE) {
    const a = parseActivated("{T}: Target opponent draws a card. Activate only during your turn.");
    const t = a && a !== "fail" && a.body.targets.length === 1 ? a.body.targets[0] : undefined;
    if (!a || a === "fail" || !a.tap || a.manaCost || a.costs?.length || a.activateIf?.kind !== "yourTurn" || t?.kind !== "player" || !t.opponent) {
      out.unsupported.push(raw);
      return true;
    }
    const text = ORACLE.slice(ORACLE.indexOf(": ") + 2, ORACLE.indexOf(" Activate only"));
    out.activated.push({ ...a, text: raw, body: { targets: [t], effects: [{ type: "chosenAttackNextTurn", who: { ref: "target", index: 0 } }], text } });
    return true;
  }
  // A Killer Among Us: the three tokens together, then the type chosen as the trigger resolves, kept secret from the other
  // players (rulings: written down) on this object (GameObject.secretType); each copy has its own (rulings).
  if (line === KILLER_ENTERS) {
    const t = parseTrigger(KILLER_ENTERS.slice(0, KILLER_ENTERS.indexOf(" Then secretly")));
    const made = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || made?.type !== "together" || made.effects.length !== 3 || made.effects.some((e) => e.type !== "createToken")) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { ...t.body, effects: [made, { type: "secretCreatureType", options: ["Human", "Merfolk", "Goblin"] }], text: KILLER_ENTERS.slice(KILLER_ENTERS.indexOf(", ") + 2) } });
    return true;
  }
  // A Killer Among Us: revealing the type is part of the cost (CR 601.2h, 602.2b), which only the player who chose it can
  // pay (rulings: another player who gains control of it can't activate it). The target is any attacking creature token,
  // whatever its type (rulings); whether it has the chosen type is checked as the ability resolves (CR 608.2c), with the
  // type the sacrificed enchantment had (its last known information, CR 608.2h). A changeling token has it (CR 702.73a).
  if (line === KILLER_REVEAL) {
    const a = parseActivated("Sacrifice ~: Put three +1/+1 counters on target attacking creature token. It gains deathtouch until end of turn.");
    const t = a && a !== "fail" && a.body.targets.length === 1 ? a.body.targets[0] : undefined;
    if (!a || a === "fail" || !a.sacrificeSelf || a.tap || a.manaCost || a.costs?.length || a.activateIf || t?.kind !== "object" || !t.token || t.combat !== "attacking" || a.body.effects.length !== 2) {
      out.unsupported.push(raw);
      return true;
    }
    const text = KILLER_REVEAL.slice(KILLER_REVEAL.indexOf(": ") + 2);
    out.activated.push({ ...a, text: raw, revealSecretType: true, body: { targets: [t], effects: [{ type: "if", cond: { kind: "targetIsSecretType", index: 0 }, effects: a.body.effects }], text } });
    return true;
  }
  return false;
}

/** Round B233's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB233Spell(text: string): AbilityBody | null | undefined {
  // Riddles in the Dark: Curator of Destinies' piles (round 318) from the top four cards. You only look; the opponent, one
  // you choose as it resolves, sees the face-up pile and how many cards the face-down one has; either pile may be empty
  // (rulings, CR 700.3c). The face-down pile isn't revealed if it goes to your hand (rulings).
  if (text === RIDDLES) return { targets: [], effects: [{ type: "piles", n: 4, separator: "you", rest: "graveyard", faceDown: true }], text };
  return undefined;
}
