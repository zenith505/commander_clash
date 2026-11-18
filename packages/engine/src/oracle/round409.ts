// Round 409's whole lines (compile.ts): Portent of Calamity (a revealed card of each card type exiled, then a free cast
// if four or more were, the rest into your hand), Jadzi, Oracle of Arcavios's magecraft (the top card cast for {1}, or
// a land put onto the battlefield) and Arni Metalbrow ("Whenever a creature you control attacks or enters attacking").
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const PORTENT = "Reveal the top X cards of your library. For each card type, you may exile a card of that type from among them. Put the rest into your graveyard. You may cast a spell from among the exiled cards without paying its mana cost if you exiled four or more cards this way. Then put the rest of the exiled cards into your hand.";
const JADZI = "Whenever you cast or copy an instant or sorcery spell, reveal the top card of your library. If it's a nonland card, you may cast it by paying {1} rather than paying its mana cost. If it's a land card, put it onto the battlefield.";
const JOURNEY = "You may put any number of land cards from your hand onto the battlefield. Then if you control eight or more lands, you may discard a card. If you do, return ~ to its owner's hand.";
const ARNI = "Whenever a creature you control attacks or enters attacking, you may pay {1}{R}. If you do, you may put a creature card with mana value less than that creature's mana value from your hand onto the battlefield tapped and attacking.";

const landCard: TargetSpec = { kind: "card", types: ["Land"], notTypes: [], notColors: [], text: "land card" };

/** One whole line of round 409's (compile.ts); false when it isn't one of these. */
export function round409Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Portent of Calamity: Atraxa's reveal (oracle/sentence.ts, Effect dig `oneOfEach`: up to one card for each card type, CR
  // 205.2a, a card with several card types chosen for only one of them, rulings) with the cards chosen exiled (face up, CR
  // 406.3) instead of put into your hand; the rest into your graveyard. Then, only if four or more cards were exiled this way,
  // one spell may be cast from among them as this resolves, without paying its mana cost (timing ignored, X is 0, no
  // alternative costs, mandatory additional costs paid, rulings, CR 608.2g, 118.9, 107.3b); then every exiled card not cast
  // into your hand (castFromAmong `fromDug`, `minDug`, rest "hand").
  if (line === PORTENT) {
    const body = isSpell && !out.spell ? parseBody("Reveal the top X cards of your library. For each card type, you may put a card of that type from among the revealed cards into your hand. Put the rest into your graveyard.", { spell: true }) : null;
    const dig = body?.effects.length === 1 ? body.effects[0] : undefined;
    if (!body || body.targets.length || dig?.type !== "dig" || !dig.oneOfEach || dig.into !== "hand" || dig.rest !== "graveyard" || !dig.reveal) return fail(out, raw);
    const effects: Effect[] = [
      { ...dig, into: "exile", filter: { ...dig.filter!, text: "card of each card type" } },
      { type: "castFromAmong", who: { ref: "you" }, n: 0, fromDug: true, minDug: 4, max: 1, rest: { dest: "hand" } },
    ];
    out.spell = { ...body, effects, text: line };
    return true;
  }
  // Jadzi, Oracle of Arcavios: "Magecraft — " is an ability word (CR 207.2c), already gone from the line. It triggers on
  // casting or copying an instant or sorcery spell. The top card is revealed; a nonland card may be cast from the library as this resolves (timing ignored, rulings,
  // CR 608.2g) for the alternative cost {1} (CR 118.9: no other alternative cost, additional costs paid, X is 0, rulings);
  // not cast, it stays on top (rulings). A land card is put onto the battlefield (not played, rulings). A modal
  // double-faced card is a land only by its front face (CR 712.8a), and its back face can't be cast if it's a land.
  if (line === JADZI) {
    const t = isSpell ? null : parseTrigger("Whenever you cast or copy an instant or sorcery spell, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand.");
    const [reveal, branch] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.body.targets.length || t.body.effects.length !== 2 || reveal?.type !== "revealTop" || branch?.type !== "if" || branch.cond.kind !== "revealedIs" || branch.cond.not || branch.effects[0]?.type !== "putOntoBattlefield") return fail(out, raw);
    const effects: Effect[] = [
      reveal,
      { type: "if", cond: { kind: "revealedIs", filter: landCard, not: true }, effects: [{ type: "playLinked", revealed: true, pay: { kind: "mana", mana: "{1}" } }] },
      { type: "if", cond: { kind: "revealedIs", filter: landCard }, effects: branch.effects },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^Whenever you cast or copy an instant or sorcery spell, /, "") } });
    return true;
  }
  // Journey to the Oracle (Jadzi's back face): the lands put onto the battlefield aren't played (CR 305.4); then, counted
  // after that (CR 608.2c), with eight or more lands you control you may discard a card, and if you do this spell goes to
  // its owner's hand as it finishes resolving instead of the graveyard (Effect spellToHand, CR 608.2n).
  if (line === JOURNEY) {
    const lands = isSpell && !out.spell ? parseBody("You may put any number of land cards from your hand onto the battlefield.", { spell: true }) : null;
    const cond = isSpell ? parseBody("If you control eight or more lands, draw a card.", { spell: true }) : null;
    const discard = isSpell ? parseBody("You may discard a card. If you do, draw a card.", { spell: true }) : null;
    const put = lands?.effects.length === 1 ? lands.effects[0] : undefined;
    const iff = cond?.effects.length === 1 ? cond.effects[0] : undefined;
    const [may, did] = discard?.effects ?? [];
    if (put?.type !== "putFromHand" || !put.any || !put.may || iff?.type !== "if" || may?.type !== "may" || may.effects[0]?.type !== "discard" || did?.type !== "if" || did.cond.kind !== "youDid") return fail(out, raw);
    const effects: Effect[] = [put, { ...iff, effects: [may, { ...did, effects: [{ type: "spellToHand" }] }] }];
    out.spell = { targets: [], effects, text: line };
    return true;
  }
  // Arni Metalbrow: one ability with two trigger events (CR 603.2): a creature you control is declared as an attacker (CR
  // 508.1), or one enters the battlefield attacking (CR 506.3, 508.4: it was never declared, so only the second event). The
  // {1}{R} is paid or not as it resolves (rulings). "That creature's mana value": the trigger's creature as it is then, or
  // as it last existed on the battlefield if it has left (rulings, CR 608.2h); a card with mana value less than that (at
  // most one less: none below 0). The creature put onto the battlefield attacking triggers this ability again (rulings).
  if (line === ARNI) {
    const t = isSpell ? null : parseTrigger("Whenever a creature you control attacks, you may pay {1}{R}. If you do, you may put a creature card with mana value 2 or less from your hand onto the battlefield tapped and attacking.");
    const may = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const put = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "creatureYouControlAttacks" || t.body.targets.length || may?.type !== "may" || may.pay?.mana !== "{1}{R}" || put?.type !== "putFromHand" || !put.attacking || !put.tapped || !put.may || !put.filter?.manaValue) return fail(out, raw);
    const { manaValue: _, ...filter } = put.filter;
    const lessMv: TargetSpec = { ...filter, bound: { key: "manaValue", at: "most", amount: { count: { kind: "manaValue", of: { ref: "subject" } }, plus: -1, signed: true } }, text: "creature card with mana value less than that creature's mana value" };
    const effects: Effect[] = [{ ...may, effects: [{ ...put, filter: lessMv }], text: "pay {1}{R}. If you do, you may put a creature card with mana value less than that creature's mana value from your hand onto the battlefield tapped and attacking" }];
    const body = { targets: [], effects, text: line.replace(/^Whenever a creature you control attacks or enters attacking, /, "") };
    out.triggers.push({ ...t, body });
    // "Enters attacking": the creature is attacking as it enters (CR 508.4), so it's attacking when the event happens.
    const enters = parseTrigger("Whenever a creature you control enters, draw a card.");
    if (!enters || enters === "fail" || enters.event !== "permanentEnters" || !enters.enters?.filter) return fail(out, raw);
    out.triggers.push({ ...enters, enters: { ...enters.enters, filter: { ...enters.enters.filter, combat: "attacking", text: "attacking creature you control" } }, body });
    return true;
  }
  return false;
}
