// Lane B round B217's lines, read by compileCard before its triggers and activated abilities (after round B216's), and its
// whole spells (chained from round B216's).
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { roundB219Spell } from "./laneb219";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB217Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Dark Intimations: "When you cast a Bolas planeswalker spell, exile ~ from your graveyard. That planeswalker enters with
  // an additional loyalty counter on it.": an ability of the card in your graveyard (CR 113.6m: it moves the card out of
  // there), triggering as the spell is cast (CR 603.2); the counter on the planeswalker that spell becomes (CR 614.1c), one
  // for each Dark Intimations exiled this way (rulings). Not "if you do": the counter doesn't depend on the exile.
  if (isSpell && line === "When you cast a Bolas planeswalker spell, exile ~ from your graveyard. That planeswalker enters with an additional loyalty counter on it.") {
    const t = trig("When you cast a Bolas planeswalker spell, draw a card.");
    const exile = parseBody("Exile ~ from your graveyard.", { selfCard: true })?.effects;
    const more = parseBody("That creature enters with an additional loyalty counter on it.", { castSpell: true })?.effects;
    if (!t || t.event !== "castSpell" || !t.cast || t.cast.by !== "you" || t.cast.orCopy || t.cast.from || t.zone || t.ifCond || t.host || !t.cast.spell.subtypes?.includes("Bolas") || exile?.length !== 1 || exile[0]!.type !== "exile" || more?.length !== 1 || more[0]!.type !== "spellEntersWith") return fail();
    const text = "exile ~ from your graveyard. That planeswalker enters with an additional loyalty counter on it.";
    out.triggers.push({ ...t, zone: "graveyard", body: { targets: [], effects: [...exile, ...more], text } });
    return true;
  }
  // Fires of Mount Doom: "{2}{R}: Exile the top card of your library. You may play that card this turn. When you play a card
  // this way, ~ deals 2 damage to each player.": face up (CR 406.3), played with its usual timing and costs (rulings), a land
  // as your land play; playing it with this permission, a land or a spell, triggers (CR 603.2); not playing it, nothing
  // (rulings). The damage is dealt by ~ (its last known information if it has left the battlefield).
  if (!isSpell && line === "{2}{R}: Exile the top card of your library. You may play that card this turn. When you play a card this way, ~ deals 2 damage to each player.") {
    const a = parseActivated("{2}{R}: Exile the top card of your library. You may play that card this turn.");
    const impulse = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const damage = parseBody("~ deals 2 damage to each player.");
    if (!a || a === "fail" || a.tap || a.manaCost !== "{2}{R}" || (a.costs ?? []).length || impulse?.type !== "impulse" || impulse.n !== 1 || impulse.until !== "thisTurn" || impulse.castOnly || !damage || damage.effects.length !== 1 || damage.effects[0]!.type !== "damage") return fail();
    const castTrigger: AbilityBody = { ...damage, text: "~ deals 2 damage to each player." };
    out.activated.push({ ...a, text: line, body: { targets: [], effects: [{ ...impulse, castTrigger, playTrigger: true }], text: line.replace(/^\{2\}\{R\}: /, "") } });
    return true;
  }
  // Forbidden Crypt: "If you would draw a card, return a card from your graveyard to your hand instead. If you can't, you lose
  // the game." (CompiledCard.drawReturnsFromGraveyard.)
  if (!isSpell && line === "If you would draw a card, return a card from your graveyard to your hand instead. If you can't, you lose the game.") {
    out.drawReturnsFromGraveyard = true;
    return true;
  }
  // Heart of Kiran: "You may remove a loyalty counter from a planeswalker you control rather than pay ~'s crew cost."
  // (CompiledCard.crewLoyaltyAlt): only for a permanent with a crew ability of its own.
  if (!isSpell && line === "You may remove a loyalty counter from a planeswalker you control rather than pay ~'s crew cost.") {
    if (!out.activated.some((a) => a.crew !== undefined && !a.saddle && !a.tapPower)) return fail();
    out.crewLoyaltyAlt = true;
    return true;
  }
  return false;
}

/** Round B217's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB217Spell(text: string): AbilityBody | null | undefined {
  // Long Rest: "Return X target cards with different mana values from your graveyard to your hand. If eight or more cards
  // were returned to your hand this way, your life total becomes equal to your starting life total. Exile ~.": each target a
  // mana value none of the others has (CR 601.2c); only the cards actually returned count (a target gone is not returned, CR
  // 608.2b); the life total set is gaining or losing life (rulings, CR 119.5); then it exiles itself (CR 608.2n).
  if (text === "Return X target cards with different mana values from your graveyard to your hand. If eight or more cards were returned to your hand this way, your life total becomes equal to your starting life total. Exile ~.") {
    const body = parseBody("Return X target cards with different mana values from your graveyard to your hand. Exile ~.", { spell: true });
    const life = parseBody("Your life total becomes equal to your starting life total.");
    const [bounce, exile] = body?.effects ?? [];
    const t = body?.targets[0];
    if (!body || !life || body.targets.length !== 1 || t?.many !== "exactX" || !t.differentManaValues || body.effects.length !== 2 || bounce?.type !== "bounce" || exile?.type !== "exileSpell" || life.effects.length !== 1 || life.effects[0]!.type !== "setLife") return null;
    const eight: Effect = { type: "if", cond: { kind: "state", cond: { kind: "amount", amount: { count: { kind: "returnedToYourHand" } }, min: 8 } }, effects: life.effects };
    return { targets: body.targets, effects: [bounce, eight, exile], text };
  }
  return roundB219Spell(text);
}
