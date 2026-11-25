// Round 370's whole texts (parseBodyText in oracle/body.ts reads these first) and whole lines (compile.ts, after
// round 368's): a free spell as big as the life gained this turn (Bre of Clan Stoutarm), spells from exile made cheaper by
// how many players are attacked (Commander Liara Portyr), a look as deep as the creatures that convoked it (Knight-Errant
// of Eos) and a search of graveyard and library for red spells to cast this turn (Chandra, Heart of Fire).
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";
import { colorTemplate, withColors } from "./color-template";

const CHANDRA_PLUS = "Discard your hand, then exile the top three cards of your library. Until end of turn, you may play cards exiled this way.";
const CHANDRA_ULT = "Search your graveyard and library for any number of red instant and/or sorcery cards, exile them, then shuffle. You may cast them this turn. Add six {R}.";

/** A whole ability's text read another way (a string), or null. */
export function round370WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  const t = text.trim();
  // Chandra, Heart of Fire's first +1: the three cards exiled (not the discarded ones) may be played this turn, with their
  // normal timing, a land only with a land play left (rulings); with no cards in hand the three are still exiled (rulings).
  if (t === CHANDRA_PLUS) return "Discard your hand, then exile the top three cards of your library. Until end of turn, you may play those cards.";
  // Chandra, Heart of Fire's −9: both zones searched together (CR 701.23a; the graveyard is public, the library hidden),
  // any number of cards that fit, none too (CR 701.23b); they're exiled face up and may be cast this turn, paying their
  // costs, with their normal timing (rulings); then the library is shuffled. A loyalty ability, so the mana is added as it
  // resolves, not as a mana ability (CR 605.1a, rulings).
  // Its color as a text change of color words leaves it (color-template.ts, round 462).
  const ult = colorTemplate(CHANDRA_ULT, t);
  if (ult) {
    const filter = parseSearchFilter(withColors("red instant or sorcery cards", ult));
    const mana = parse("Add six {R}.");
    const add = mana?.effects.length === 1 && mana.targets.length === 0 ? mana.effects[0] : undefined;
    if (!filter || add?.type !== "addMana") return null;
    return {
      targets: [],
      effects: [{ type: "search", filter, n: 99, upTo: true, andGraveyard: true, reveal: false, dest: { zone: "exile", play: { until: "thisTurn", castOnly: true } } }, add],
      text,
    };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const BRE = "At the beginning of your end step, if you gained life this turn, exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost if the spell's mana value is less than or equal to the amount of life you gained this turn. Otherwise, put it into your hand.";
const LIARA = "Whenever you attack, spells you cast from exile this turn cost {X} less to cast, where X is the number of players being attacked. Exile the top X cards of your library. Until end of turn, you may cast spells from among those exiled cards.";
const KNIGHT = "When ~ enters, look at the top six cards of your library. You may reveal up to two creature cards with mana value X or less from among them, where X is the number of creatures that convoked ~. Put the revealed cards into your hand, then shuffle.";

export function round370Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Bre of Clan Stoutarm: an intervening if (CR 603.4) checked as the end step begins and as it resolves (rulings). Any
  // nonland card stops it; it may be cast now, as this resolves, for free (CR 608.2g, 118.9; X is 0, rulings), only if its
  // mana value as a spell is no more than the life gained this turn, counted now; otherwise (too big, or not cast) it goes
  // into its owner's hand. The other cards exiled stay in exile.
  if (line === BRE) {
    const t = isSpell ? null : parseTrigger(
      "At the beginning of your end step, if you gained life this turn, exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost if the spell's mana value is less than the amount of life you gained this turn. If you don't cast that card this way, put it into your hand.",
    );
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourEndStep" || !t.ifCond || e?.type !== "exileUntilNonland" || e.then !== "castFree" || !e.orHand || typeof e.mvLessThan !== "object" || e.mvLessThan.plus !== undefined || e.mvLessThan.times !== undefined) return fail(out, raw);
    // "Less than or equal to N" is "less than N + 1".
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e, mvLessThan: { ...e.mvLessThan, plus: 1 } }], text: line.slice(line.indexOf(", if you gained life this turn, ") + ", if you gained life this turn, ".length) } });
    return true;
  }
  // Commander Liara Portyr: when you attack with any creatures, Liara among them or not (rulings, CR 508.3a). X is counted
  // as it resolves: the players being attacked (a planeswalker or battle alone doesn't make its controller one, rulings).
  // From then on this turn every spell you cast from exile costs {X} less, by whatever permission it's cast (rulings, CR
  // 611.2a; generic mana only, CR 601.2f); then the top X cards are exiled face up and may be cast this turn (not played
  // as lands), paying their costs.
  if (line === LIARA) {
    const t = isSpell ? null : parseTrigger("Whenever you attack, draw a card.");
    if (!t || t === "fail" || t.event !== "creaturesYouControlAttack" || t.ifCond) return fail(out, raw);
    const x = { count: { kind: "playersAttacked" as const } };
    const effects: Effect[] = [
      { type: "costModThisTurn", mod: { who: "you", filter: { kind: "spell", types: [], notTypes: [], notColors: [], text: "spells cast from exile" }, n: -1, fromZones: ["exile"], text: "Spells you cast from exile this turn cost {X} less to cast." }, times: x },
      { type: "impulse", n: x, until: "thisTurn", castOnly: true },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.slice("Whenever you attack, ".length) } });
    return true;
  }
  // Knight-Errant of Eos: X is how many creatures were tapped to convoke it (CR 702.51a), whether or not they're still on
  // the battlefield (rulings), as the permanent it became last existed if it has left (CR 608.2h). Up to two creature cards
  // with mana value X or less are revealed and put into your hand; the rest stay in the library, which is then shuffled.
  if (line === KNIGHT) {
    const t = isSpell ? null : parseTrigger("When ~ enters, draw a card.");
    if (!t || t === "fail" || t.event !== "selfEnters" || t.ifCond || !out.convoke) return fail(out, raw);
    const dig: Effect = {
      type: "dig",
      n: 6,
      count: 2,
      upTo: true,
      filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], bound: { key: "manaValue", at: "most", amount: { count: { kind: "convokedCount" } } }, text: "creature card with mana value X or less" },
      into: "hand",
      rest: "shuffle",
      reveal: true,
    };
    out.triggers.push({ ...t, body: { targets: [], effects: [dig], text: line.slice("When ~ enters, ".length) } });
    return true;
  }
  return false;
}
