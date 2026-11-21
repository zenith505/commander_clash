// Round 434's whole lines (compile.ts, before round 432's) and sentences (body.ts chain, before round 433's): the back faces
// of Eye of Ojer Taq and The Enigma Jewel, about the exiled cards used to craft them (CR 702.167c).
import type { CompiledCard, Effect } from "../abilities";
import { CARD_TYPE_PLURAL } from "../keywords";
import type { Ctx } from "./body";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);
const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One whole line of round 434's (compile.ts); false when it isn't one of these. */
export function round434Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Apex Observatory: "~ enters tapped. As it enters, choose a card type shared among two exiled cards used to craft it.":
  // a choice as it enters (CR 614.12), among the card types two of the cards its craft cost exiled have in common, those
  // still in exile (CR 702.167c, 607.2a); with none, none is chosen (rulings: tokens used to craft it aren't cards and don't
  // stay in exile). Kindred would count (rulings); supertypes and subtypes don't.
  if (line === "~ enters tapped. As it enters, choose a card type shared among two exiled cards used to craft it.") {
    if (isSpell || out.entersChoose?.some((c) => c.what === "cardType")) return fail(out, raw);
    out.entersTapped = true;
    (out.entersChoose ??= []).push({ what: "cardType", options: Object.keys(CARD_TYPE_PLURAL), craftedShared: true });
    return true;
  }
  // Locus of Enlightenment: "~ has each activated ability of the exiled cards used to craft it. You may activate each of
  // those abilities only once each turn.": the activated abilities of the cards its craft cost exiled, while they stay
  // exiled (CR 702.167c; rulings: even after its controller or characteristics change), each card's an instance of its own,
  // once each turn each (rulings: two of the same card give two instances); "~" in them is this permanent (rulings). Only
  // activated abilities (rulings), mana and loyalty abilities among them (CR 605.1a, 606.3), as Mairsil's
  // (CompiledCard.borrows linked, crafted, oncePerTurn, withLoyalty).
  if (line === "~ has each activated ability of the exiled cards used to craft it. You may activate each of those abilities only once each turn.") {
    if (isSpell || out.borrows) return fail(out, raw);
    out.borrows = { filter: { kind: "card", types: [], notTypes: [], notColors: [], text: "cards" }, linked: true, crafted: true, oncePerTurn: true, withLoyalty: true };
    return true;
  }
  return false;
}

/** One sentence of an ability's effect (body.ts); null when it isn't one of these, "fail" when it's one we can't do. */
export function round434Sentence(s: string, _sentences: string[], si: number, _ctx: Ctx, _effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  const line = plain(s);
  // Apex Observatory: "The next spell you cast this turn of the chosen type can be cast without paying its mana cost.": the
  // card type chosen as it entered, bound as this resolves (nothing if none was chosen); an alternative cost (CR 118.9)
  // offered to the first spell of that type its controller casts this turn, which uses it up whatever cost it's cast for
  // (as World War Hulk's, rulings on Marshland Bloodcaster).
  if (line === "The next spell you cast this turn of the chosen type can be cast without paying its mana cost")
    return { effect: { type: "nextCast", filter: { kind: "spell", types: [], notTypes: [], notColors: [], chosen: "cardType", text: "spell of the chosen type" }, effects: [], text: "the next spell of the chosen type you cast this turn can be cast without paying its mana cost", alt: "free" }, next: si + 1 };
  return null;
}
