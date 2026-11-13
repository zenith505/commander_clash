// Lane B round B192's lines, read by compileCard before its triggers and activated abilities (after round B188's), and
// its sentences, read at the end of round B186's chain (after round B187's).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB192Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Colfenor's Plans: "You may look at the cards exiled with ~, and you may play lands and cast spells from among those
  // cards.": the cards its one "exile ... face down" exiled (CR 607.2a), seen by its controller (CR 406.3), played with
  // their usual costs and timing (rulings), while it's on the battlefield under your control; compileCard links the exile
  // (CompiledCard.playLinkedLook).
  if (line === "You may look at the cards exiled with ~, and you may play lands and cast spells from among those cards.") {
    if (isSpell || out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
    else (out.playLinkedWhile = { kind: "allOf", conds: [] }), (out.playLinkedLook = true);
    return true;
  }
  // Hedonist's Trove: "You may play lands from among cards exiled with ~." and "You may cast spells from among cards exiled
  // with ~. You can't cast more than one spell this way each turn.": the cards its one exile took (CR 607.2a), with their
  // usual costs and timing, a land only if you could play one (rulings); one spell a turn, any number of lands (rulings).
  if (line === "You may play lands from among cards exiled with ~.") {
    if (isSpell || out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
    else (out.playLinkedWhile = { kind: "allOf", conds: [] }), (out.playLinkedLandsOnly = true);
    return true;
  }
  if (line === "You may cast spells from among cards exiled with ~. You can't cast more than one spell this way each turn.") {
    if (isSpell || !out.playLinkedLandsOnly) out.unsupported.push(raw);
    else {
      delete out.playLinkedLandsOnly;
      out.playLinkedSpellOnce = true;
    }
    return true;
  }
  return false;
}

export function roundB192Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Disciple of Deceit: "you may discard a nonland card. If you do, search your library for a card with the same mana value
  // as that card, reveal it, put it into your hand, then shuffle.": the discarded card's mana value (X as 0, a split card's
  // halves together, rulings; CR 202.3), an exact bound on the search (Count discardedManaValue).
  if (s === "If you do, search your library for a card with the same mana value as that card, reveal it, put it into your hand, then shuffle") {
    const prev = effects[effects.length - 1];
    const d = prev?.type === "may" && !prev.otherwise && prev.effects.length === 1 ? prev.effects[0]! : undefined;
    if (d?.type !== "discard" || d.who.ref !== "you" || d.n !== 1 || d.exile || d.random) return "fail";
    const found = parseSentence("Search your library for a card, reveal it, put it into your hand, then shuffle", ctx);
    const e = found?.length === 1 ? found[0]! : undefined;
    if (e?.type !== "search" || e.filter || e.dest.zone !== "hand" || !e.reveal) return "fail";
    const filter = { kind: "card" as const, bound: { key: "manaValue" as const, at: "exact" as const, amount: { count: { kind: "discardedManaValue" as const } } }, text: "card with the same mana value as the discarded card" };
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: [{ ...e, filter }] }, next: si + 1 };
  }
  // Pinnacle Starcage: "Put each card exiled with ~ into its owner's graveyard, then create a 2/2 colorless Robot artifact
  // creature token for each card put into a graveyard this way.": its linked exile (CR 607.2a), then one token for each
  // card that got there (a replacement sending one elsewhere doesn't count; a token exiled with it ceased to exist,
  // rulings, CR 704.5d).
  if (s === "Put each card exiled with ~ into its owner's graveyard" && plain(sentences[si + 1]) === "Create a 2/2 colorless Robot artifact creature token for each card put into a graveyard this way" && ctx.activated) {
    const tokens = parseSentence("Create a 2/2 colorless Robot artifact creature token", ctx);
    const t = tokens?.length === 1 ? tokens[0]! : undefined;
    if (t?.type !== "createToken" || t.n !== 1) return "fail";
    effects.push({ type: "moveLinked", dest: "graveyard", countInGraveyard: true });
    return { effect: { ...t, n: { count: { kind: "movedLinkedThisWay" } } }, next: si + 2 };
  }
  // Flameskull: "When ~ dies, exile it. If you do, exile the top card of your library. Until the end of your next turn, you
  // may play one of those cards.": ~ only if it's still the card that went to the graveyard (rulings, CR 400.7), the top
  // card only if ~ was exiled; playing either ends the permission for the other (the reminder text), each with its usual
  // costs and timing (rulings).
  if (s === "exile it" || s === "Exile it") {
    if (plain(sentences[si + 1]) === "If you do, exile the top card of your library" && plain(sentences[si + 2]) === "Until the end of your next turn, you may play one of those cards" && sentences.length === si + 3 && ctx.selfCard) {
      return { effect: { type: "exileSelfAndTopOneOf" }, next: si + 3 };
    }
  }
  return null;
}
