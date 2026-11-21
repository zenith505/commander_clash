// Round 432's whole lines (compile.ts, before round 431's) and sentences (body.ts chain, before round 431's).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";
import { counterKind, num } from "./words";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);
const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One whole line of round 432's (compile.ts); false when it isn't one of these. */
export function round432Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // The Fourteenth Doctor: "You may have ~ enter as a copy of a Doctor card in your graveyard that was put there from your
  // library this turn. If you do, it gains haste until end of turn.": a copy replacement as it enters (CR 707.5, 614.1c)
  // of a card in its controller's graveyard by its printed characteristics (CR 707.2), one put there from their library
  // this turn (GameObject.fromLibraryTurn: a card is a new object in each zone, CR 400.7); then haste until end of turn
  // for the permanent it became, only if it copied one.
  const doctor = /^You may have ~ enter as a copy of an? ([A-Z][a-z]+) card in your graveyard that was put there from your library this turn\. If you do, it gains haste until end of turn\.$/.exec(line);
  if (doctor) {
    const filter = parseSearchFilter(`${doctor[1]!} card`);
    if (isSpell || out.entersAsCopy || !filter || filter.kind !== "card" || filter.subtypes?.length !== 1 || filter.types?.length) return fail(out, raw);
    out.entersAsCopy = { filter: { ...filter, owner: "you", fromLibraryThisTurn: true, text: `${doctor[1]!} card in your graveyard that was put there from your library this turn` }, hasteIfCopied: true };
    return true;
  }
  // Lara Croft, Tomb Raider: "Whenever ~ attacks, exile up to one target legendary artifact card or legendary land card from
  // a graveyard and put a discovery counter on it. You may play a card from exile with a discovery counter on it this
  // turn.": the counter goes on the card in exile (CR 122.1), not on a token (CR 704.5d); then the ability's controller may
  // play one face-up card in exile with that counter this turn, any such card, whoever owns it and whatever exiled it
  // (Effect playCounteredThisTurn): a land as the turn's land play, a spell with its usual timing and costs (CR 305.1,
  // 601.3).
  const lara = /^(Whenever ~ attacks, exile up to one target .+ card from a graveyard) and put an? ([a-z]+) counter on it\. You may play a card from exile with an? ([a-z]+) counter on it this turn\.$/.exec(line);
  if (lara) {
    if (isSpell || lara[2] !== lara[3]) return fail(out, raw);
    const t = parseTrigger(`${lara[1]!}.`);
    const e0 = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || e0?.type !== "exile" || e0.what.ref !== "target" || e0.counters || e0.until || e0.linked || t.body.targets.length !== 1 || t.body.targets[0]!.kind !== "card") return fail(out, raw);
    const counter = counterKind(lara[2]!);
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e0, counters: { [counter]: 1 } }, { type: "playCounteredThisTurn", counter }], text: line.slice("Whenever ~ attacks, ".length) } });
    return true;
  }
  // Hauken's Insight: "Once during each of your turns, you may play a land or cast a spell from among the cards exiled with
  // ~ without paying its mana cost.": a static ability (CR 113.6), once during each of your turns for this object (CR
  // 400.7), a land played as the turn's land play and a spell cast with their usual timing (rulings), a spell for free (CR
  // 118.9; additional costs still paid). "Exiled with ~": by its exile abilities, its front face's too (rulings; compile.ts
  // links them).
  if (line === "Once during each of your turns, you may play a land or cast a spell from among the cards exiled with ~ without paying its mana cost.") {
    if (isSpell || out.linkedFreeOnce) return fail(out, raw);
    out.linkedFreeOnce = { hauken: true };
    return true;
  }
  return false;
}

/** One sentence of an ability's effect (body.ts); null when it isn't one of these, "fail" when it's one we can't do. */
export function round432Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  const line = plain(s);
  // The Fourteenth Doctor: "Reveal the top fourteen cards of your library. Put all Doctor cards revealed this way into your
  // graveyard and the rest on the bottom of your library in a random order.": every card of that kind revealed goes to
  // the graveyard (from the library, GameObject.fromLibraryTurn), the others to the bottom in a random order (CR 401.4).
  const reveal = /^[Rr]eveal the top ([a-z]+) cards of your library$/.exec(line);
  const yard = reveal ? /^Put all ([A-Z][a-z]+) cards revealed this way into your graveyard and the rest on the bottom of your library in a random order$/.exec(plain(sentences[si + 1])) : null;
  if (reveal && yard) {
    const n = num(reveal[1]!);
    const filter = parseSearchFilter(`${yard[1]!} card`);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 2 || !filter || filter.kind !== "card" || filter.subtypes?.length !== 1) return "fail";
    return { effect: { type: "dig", n, count: n, upTo: false, filter, into: "graveyard", rest: "bottom", random: true, reveal: true, required: true }, next: si + 2 };
  }
  // Jacob Hauken, Inspector: "exile a card from your hand face down. You may look at that card for as long as it remains
  // exiled.": the card chosen as it resolves, face down (CR 406.3), seen by the one who exiled it.
  if (line === "You may look at that card for as long as it remains exiled") {
    const prev = _effects[_effects.length - 1];
    if (prev?.type !== "exileFaceDown" || prev.from !== "handCard" || prev.look || prev.play || prev.actor || prev.who) return "fail";
    _effects.pop();
    return { effect: { ...prev, look: true }, next: si + 1 };
  }
  return null;
}
