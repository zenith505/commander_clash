// Round 418's sentences (round373Sentence in oracle/round373.ts reads these first) and whole lines (compile.ts, before
// round 417's): Surge to Victory's delayed trigger copying the card it exiled, Gale, Waterdeep Prodigy's cast of a card
// of the other type from your graveyard, and Zethi, Arcane Blademaster's kick counters on exiled instant cards.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");
const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

export function round418Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  // Surge to Victory: "Whenever a creature you control deals combat damage to a player this turn, copy the exiled card.
  // You may cast the copy without paying its mana cost." A delayed triggered ability lasting the turn (CR 603.7b), one
  // trigger for each creature dealing combat damage to a player; "the exiled card" is the card this spell exiled, the
  // target card as it is now in exile (CR 400.7), remembered with the trigger. The copy is made in exile and cast as the
  // trigger resolves or ceases to exist (CR 707.12, 704.5e), timing ignored, for free: no alternative costs, X is 0,
  // additional costs allowed (rulings), as cipher's (Effect castCipher). Copying it isn't casting it (rulings: magecraft
  // triggers on the cast, not the copy). If the card left exile before the spell made the trigger, nothing is made.
  if (line === "Whenever a creature you control deals combat damage to a player this turn, copy the exiled card" && plain(sentences[si + 1]) === "You may cast the copy without paying its mana cost" && ctx.spell) {
    const exile = effects.find((e) => e.type === "exile");
    if (exile?.type !== "exile" || exile.what.ref !== "target" || ctx.targets[exile.what.index]?.kind !== "card") return "fail";
    const made = parseBody("Whenever a creature you control deals combat damage to a player this turn, draw a card.", { spell: true });
    const ft = made?.effects[0];
    if (made?.targets.length || made?.effects.length !== 1 || ft?.type !== "floatingTrigger" || ft.until !== "endOfTurn" || ft.trigger.event !== "creatureYouControlDealsCombatDamageToPlayer") return "fail";
    return {
      effect: { ...ft, bindExiled: exile.what.index, trigger: { ...ft.trigger, body: { targets: [], effects: [{ type: "castCipher", card: "", zc: -1 }], text: "copy the exiled card. You may cast the copy without paying its mana cost." } } },
      next: si + 2,
    };
  }
  return null;
}

const GALE = "Whenever you cast an instant or sorcery spell from your hand, you may cast up to one target card of the other type from your graveyard. If a spell cast from your graveyard this way would be put into your graveyard, exile it instead.";

const ZETHI_ENTERS = "When ~ enters, exile up to X target instant cards from your graveyard, where X is the number of times ~ was kicked. Put a kick counter on each of them.";
const ZETHI_ATTACKS = "Whenever ~ attacks, copy each exiled card you own with a kick counter on it. You may cast the copies.";

/** One whole line of round 418's (compile.ts); false when it isn't one of these. */
export function round418Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Zethi, Arcane Blademaster: "up to X target instant cards", X the times it was kicked (multikicker, CR 702.33c-d,
  // 702.33f; none unkicked), chosen as the trigger goes on the stack (CR 603.3d); each one exiled gets a kick counter
  // there (CR 122.1, 400.7: the card in exile is the target's new object, followed by the ability as it moved it).
  if (line === ZETHI_ENTERS) {
    const t = isSpell ? null : parseTrigger("When ~ enters, exile up to X target instant cards from your graveyard, where X is the number of times ~ was kicked.");
    const ex = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || !t.xKicked || t.body.targets.length !== 1 || t.body.targets[0]!.many !== "x" || t.body.targets[0]!.kind !== "card" || t.body.effects.length !== 1 || ex?.type !== "exile" || ex.what.ref !== "target") return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [ex, { type: "counters", what: ex.what, counter: "kick", n: 1 }], text: line.slice("When ~ enters, ".length) } });
    return true;
  }
  // "Copy each exiled card you own with a kick counter on it. You may cast the copies.": every card you own in exile with
  // a kick counter on it, whatever put it there (as Goliath Daydreamer's dream counters); each is copied (CR 707.12) and
  // the copies may be cast as this resolves, in the order you choose, paying their costs since nothing says otherwise
  // (CR 601.2f-h), timing ignored (CR 608.2g); the ones not cast cease to exist (CR 704.5e), the cards staying exiled
  // with their counters, as with The Tale of Tamiyo's copies.
  if (line === ZETHI_ATTACKS) {
    const t = isSpell ? null : parseTrigger("Whenever ~ attacks, draw a card.");
    if (!t || t === "fail" || t.event !== "selfAttacks" || t.body.targets.length) return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, ownExileCounter: "kick", paid: true }], text: line.slice("Whenever ~ attacks, ".length) } });
    return true;
  }
  // Gale, Waterdeep Prodigy: "the other type" is the one of instant and sorcery the spell that triggered it isn't, by its
  // card types as it was cast (TargetSpec.otherTypeThanCause, fixed as the trigger goes on the stack, CR 603.3d); "up to
  // one target" may be none (CR 115.6). The card is cast as the trigger resolves or not at all, paying its costs, timing
  // ignored (CR 608.2g, 601.2), as Harness the Storm's; that spell is exiled instead of going to your graveyard from
  // anywhere (CR 614.1a; Effect castNow `exileAfter`).
  if (line === GALE) {
    const t = isSpell ? null : parseTrigger("Whenever you cast an instant or sorcery spell from your hand, you may cast target instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile it instead.");
    const spec = t && t !== "fail" ? t.body.targets[0] : undefined;
    const cast = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.from !== "hand" || t.cast.by !== "you" || t.body.targets.length !== 1 || t.body.effects.length !== 1 || spec?.kind !== "card" || spec.owner !== "you" || cast?.type !== "castNow" || !cast.exileAfter) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, targets: [{ ...spec, optional: true, otherTypeThanCause: true, text: "up to one target card of the other type from your graveyard" }], text: line.slice("Whenever you cast an instant or sorcery spell from your hand, ".length) } });
    return true;
  }
  return false;
}
