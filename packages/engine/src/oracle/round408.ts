// Round 408's whole lines (compile.ts): Abstruse Appropriation's exile with "you may spend colorless mana as though it
// were mana of any color to cast that spell"; Valki, God of Lies's enters trigger and {X} copy; Tibalt, Cosmic Impostor's
// emblem as it enters (linked to that Tibalt), its +2, and its exiles linked to it.
import { allEffects, type CompiledCard, type Effect } from "../abilities";
import { parseActivated, parseLoyalty } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const ABSTRUSE = "Exile target nonland permanent. You may cast that card for as long as it remains exiled, and you may spend colorless mana as though it were mana of any color to cast that spell.";

const VALKI_ENTERS = "When ~ enters, each opponent reveals their hand. For each opponent, exile a creature card they revealed this way until ~ leaves the battlefield.";
const VALKI_X = "{X}: Choose a creature card exiled with ~ with mana value X. ~ becomes a copy of that card.";
/** Tibalt's emblem's ability, as the emblem has it (⟪source⟫: the Tibalt it's linked to). */
export const TIBALT_EMBLEM = "You may play cards exiled with ⟪source⟫, and you may spend mana as though it were mana of any color to cast those spells.";
const TIBALT_ENTERS = `As ~ enters, you get an emblem with "${TIBALT_EMBLEM}"`;

const creatureCard = { kind: "card" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/** One whole line of round 408's (compile.ts); false when it isn't one of these. */
export function round408Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Abstruse Appropriation: read as Hostage Taker's permission ("You may cast that card for as long as it remains exiled"):
  // its caster may cast the card, not a token (it ceases to exist, CR 704.5d, rulings), with its usual timing and costs
  // (rulings), for as long as it stays in exile as that object (CR 400.7), even after the turn. "Spend colorless mana as
  // though it were mana of any color" (CR 609.4b): colorless mana pays the spell's colored symbols too (MayPlay
  // `colorlessAny`, game.ts spellCost: CostSymbol `orC`); colored mana pays nothing it otherwise couldn't, and {C} still
  // takes colorless mana.
  if (line === ABSTRUSE) {
    const body = isSpell && !out.spell ? parseBody("Exile target nonland permanent. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell.", { spell: true }) : null;
    const ex = body?.effects.length === 1 ? body.effects[0] : undefined;
    if (!body || ex?.type !== "exile" || !ex.youMay?.anyType || Object.keys(ex.youMay).length !== 1 || body.targets.length !== 1) return fail(out, raw);
    out.spell = { ...body, effects: [{ ...ex, youMay: { colorlessAny: true } }], text: line };
    return true;
  }
  // Valki, God of Lies: each opponent reveals their whole hand (CR 701.20a), then, one opponent at a time (CR 101.4), its
  // controller chooses a creature card among those still in that hand and exiles it until Valki leaves the battlefield
  // (CR 610.3: then it returns to its owner's hand; with Valki already gone, the hands are revealed but nothing is exiled,
  // rulings). The cards are linked to Valki (CR 607.2a) for its {X} ability.
  if (line === VALKI_ENTERS) {
    const t = isSpell ? null : parseTrigger("When ~ enters, each opponent reveals their hand.");
    const reveal = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.targets.length || reveal?.type !== "lookAtHand" || reveal.who.ref !== "eachOpponent" || !reveal.reveal) return fail(out, raw);
    const take: Extract<Effect, { type: "takeFromHand" }> = { type: "takeFromHand", who: { ref: "eachOne" }, filter: creatureCard, action: "exile", until: "sourceLeaves", linked: true };
    out.triggers.push({ ...t, body: { targets: [], effects: [reveal, { type: "eachOpponentTakes", take }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Valki: "{X}: Choose a creature card exiled with ~ with mana value X. ~ becomes a copy of that card." The card is chosen as
  // it resolves (rulings; Effect becomeCopyOfLinkedX).
  if (line === VALKI_X) {
    const a = isSpell ? null : parseActivated("{X}: Draw a card.");
    if (!a || a === "fail" || a.manaCost !== "{X}" || a.tap || a.sacrificeSelf || a.sorcerySpeed || a.costs?.length) return fail(out, raw);
    out.activated.push({ ...a, body: { targets: [], effects: [{ type: "becomeCopyOfLinkedX", filter: creatureCard }], text: line.slice(5) }, text: line });
    return true;
  }
  // Tibalt, Cosmic Impostor: the emblem is its controller's as it enters (CR 614.1c, 114.2), game.ts finishEntering, linked to
  // that Tibalt as the object it is then (CR 400.7: another one, even from the same card, gives its own emblem, rulings).
  if (line === TIBALT_ENTERS) {
    if (isSpell) return fail(out, raw);
    out.entersLinkedEmblem = TIBALT_EMBLEM;
    return true;
  }
  // The emblem: its owner may play the cards exiled with that Tibalt for as long as they stay exiled, even after it has left
  // (rulings), with their usual timing and costs (a land only with a land play, rulings), spending mana as though it were
  // mana of any color on those spells (CR 609.4b: colored symbols; {C} still takes colorless mana).
  if (line === TIBALT_EMBLEM) {
    if (isSpell) return fail(out, raw);
    out.playLinkedEmblem = true;
    return true;
  }
  // Tibalt: "+2: Exile the top card of each player's library." Face up (rulings), every player's, in turn order from the
  // active player (CR 101.4); linked to Tibalt with its other exiles (linkTibaltExiles).
  if (line === "+2: Exile the top card of ~ player's library." || line === "+2: Exile the top card of each player's library.") {
    const a = isSpell ? "fail" : parseLoyalty("+", "2", "Each player exiles the top card of their library.", line);
    const top = a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (a === "fail" || top?.type !== "exileTop" || top.who.ref !== "eachPlayer" || top.n !== 1) return fail(out, raw);
    out.activated.push({ ...a, body: { ...a.body, text: line.slice(4) } });
    return true;
  }
  return false;
}

/**
 * Tibalt, Cosmic Impostor: "cards exiled with Tibalt" are those all three of its loyalty abilities exiled (CR 607.2a, rulings:
 * face up), so each of its exile instructions links what it exiles to it; an exile of another kind can't be.
 */
export function linkTibaltExiles(out: CompiledCard) {
  if (!out.entersLinkedEmblem) return;
  const effects = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
  const others = effects.filter((e) => ["impulse", "takeFromHand", "hideaway", "exileFaceDown", "exileHand", "castFromAmong", "search", "chooseFromGraveyard", "pick", "flicker", "exileUntilNonlandLinked"].includes(e.type) || (e.type === "discard" && !!e.exile) || (e.type === "exile" && (!!e.until || !!e.youMay || !!e.ownerMay)));
  if (out.spell || others.length) {
    out.unsupported.push("(its emblem plays exiled cards it can't link to its exile abilities)");
    return;
  }
  for (const e of effects) if (e.type === "exile" || e.type === "exileTop" || e.type === "exileGraveyard") e.linked = true;
}
