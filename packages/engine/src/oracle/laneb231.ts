// Lane B round B231's lines, read by compileCard before its triggers and activated abilities (after round B230's), and its
// whole spells (after round B230's).
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { roundB232Spell } from "./laneb232";
import { parseTrigger } from "./triggers";

const KHERU_TRIGGER = "Whenever ~ deals combat damage to a player, that player exiles a card from their hand face down.";
const KHERU_PLAY = "You may look at cards exiled with ~, and you may play lands and cast spells from among those cards.";
const TOMB_LEAVES = "When ~ is put into a graveyard from the battlefield, at the beginning of each of your upkeeps for the rest of the game, remove all mire counters from a land that a mire counter was put onto with ~ but that a mire counter has not been removed from with ~.";
const TOMB_MIRE = "Put a mire counter on target non-Swamp land. That land is a Swamp for as long as it has a mire counter on it.";
const BRINK = "Exile a creature card from your graveyard and pay its mana cost: Create a token that's a copy of that card. Activate only as a sorcery.";
const RAIN_OF_GORE = "If a spell or ability would cause its controller to gain life, that player loses that much life instead.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB231Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Rain of Gore: a replacement effect (CR 614.1a) on every player's life gain that a spell or ability causes for the
  // player who controls it, lifelink's excepted (CR 702.15b: the damage causes it, rulings). See game.ts gainLife.
  if (line === RAIN_OF_GORE) {
    out.causedGainLose = true;
    return true;
  }
  // Kheru Mind-Eater: the damaged player chooses the card from their hand and exiles it face down (CR 406.3); linked to this
  // object (CR 607.2a). Whoever controls it may look at the cards and keeps that once allowed (rulings, as Grimoire Thief's
  // lookControllers), and may play them with their usual costs and timing (rulings; CompiledCard.playLinkedWhile and
  // playLinkedLook, linked by compileCard). They're lost once it leaves (rulings).
  if (line === KHERU_TRIGGER) {
    const t = parseTrigger("Whenever ~ deals combat damage to a player, that player discards a card.");
    if (!t || t === "fail" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "discard") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "exileFaceDown", from: "handCard", actor: { ref: "eventPlayer" }, look: true, lookControllers: true }], text: "that player exiles a card from their hand face down." } });
    return true;
  }
  // Cyclopean Tomb: its activated ability (compiled before this line) notes each land it put a mire counter onto (Effect
  // tombNote); its leaves trigger sets up the delayed trigger for every upkeep of its controller's for the rest of the
  // game (Effect tombLeaves, tombRemove). The land stays a Swamp while it has a mire counter, whatever put it there, with or
  // without the Tomb (rulings; the continuous effect's whileCounter), and keeps its supertypes (CR 305.7, rulings: snow).
  if (line === TOMB_LEAVES) {
    const t = parseTrigger("When ~ is put into a graveyard from the battlefield, you gain 1 life.");
    const mire = out.activated.find((a) => a.body.text === TOMB_MIRE && a.body.effects.length === 2 && a.body.effects[0]!.type === "counters" && a.body.effects[0]!.counter === "mire" && a.body.effects[1]!.type === "continuous" && a.body.effects[1]!.whileCounter === "mire");
    if (!t || t === "fail" || !mire || out.activated.length !== 1) {
      out.unsupported.push(raw);
      return true;
    }
    mire.body = { ...mire.body, effects: [...mire.body.effects, { type: "tombNote" }] };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "tombLeaves" }], text: "at the beginning of each of your upkeeps for the rest of the game, remove all mire counters from a land that a mire counter was put onto with ~ but that a mire counter has not been removed from with ~." } });
    return true;
  }
  // Back from the Brink: the cost is the exiled creature card and its mana cost (ActivatedAbility.manaCostOfExiled, {X} as
  // 0, rulings), paid as it's activated (CR 602.2b); the token is a copy of that card as it is in exile (CR 707.2,
  // StackItem.costExiled), a double-faced card's front face (rulings), its enters abilities working as usual (rulings).
  if (line === BRINK) {
    const a = parseActivated("{0}, Exile a creature card from your graveyard: Create a token that's a copy of the exiled card. Activate only as a sorcery.");
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const c = a && a !== "fail" && a.costs?.length === 1 ? a.costs[0] : undefined;
    if (!a || a === "fail" || e?.type !== "createTokenCopy" || e.what.ref !== "costExiled" || c?.kind !== "exileFromGraveyard" || c.n !== 1 || !a.sorcerySpeed || a.tap) out.unsupported.push(raw);
    else out.activated.push({ ...a, manaCost: "{0}", manaCostOfExiled: true, text: raw, body: { ...a.body, text: "Create a token that's a copy of that card." } });
    return true;
  }
  if (line === KHERU_PLAY) {
    if (out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
    else (out.playLinkedWhile = { kind: "allOf", conds: [] }), (out.playLinkedLook = true);
    return true;
  }
  return false;
}

/** Round B231's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB231Spell(text: string): AbilityBody | null | undefined {
  return roundB232Spell(text);
}
