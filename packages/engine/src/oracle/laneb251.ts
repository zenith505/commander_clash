// Lane B round B251's lines, read by compileCard: Sharkey, Tyrant of the Shire, Kasmina, Enigma Sage and Tamiyo, Collector
// of Tales. roundB251Line before the generic static abilities (after round B249's), roundB251Loyalty beside the other
// rounds' loyalty abilities.
import type { CompiledCard } from "../abilities";
import { parseLoyalty } from "./activated";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB251Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Sharkey, Tyrant of the Shire: "Mana of any type can be spent to activate ~'s abilities." It changes only how the costs
  // of its activated abilities may be paid, its borrowed ones among them (CR 609.4b, rulings); spend.ts payableCost.
  if (line === "Mana of any type can be spent to activate ~'s abilities.") {
    out.spendAnyTypeOwnAbilities = true;
    return true;
  }
  // Kasmina, Enigma Sage: "Each other planeswalker you control has the loyalty abilities of ~." (cards.ts withKasmina).
  if (line === "Each other planeswalker you control has the loyalty abilities of ~.") {
    out.lendsLoyaltyToPlaneswalkers = true;
    return true;
  }
  // Tamiyo, Collector of Tales: "Spells and abilities your opponents control can't cause you to discard cards or sacrifice
  // permanents." As a spell or ability an opponent controls resolves, a discard or sacrifice it would make you do just
  // doesn't happen, and an option it gives you to discard or sacrifice can't be taken (rulings); game rules (cleanup's
  // discard, the legend rule, lethal damage) and your own costs aren't affected (rulings). The sacrifice half is Sigarda,
  // Host of Herons' (cards.ts opponentForbidsSacrifice), the discard half cards.ts opponentForbidsDiscard.
  if (line === "Spells and abilities your opponents control can't cause you to discard cards or sacrifice permanents.") {
    out.opponentsCantMakeYouSacrifice = true;
    out.opponentsCantMakeYouDiscard = true;
    return true;
  }
  return false;
}

const TAMIYO = "+1: Choose a nonland card name, then reveal the top four cards of your library. Put all cards with the chosen name from among them into your hand and the rest into your graveyard.";
const KASMINA = "−8: Search your library for an instant or sorcery card that shares a color with this planeswalker, exile that card, then shuffle. You may cast that card without paying its mana cost.";

/** A planeswalker's loyalty ability, read before the other loyalty abilities; false when it isn't one of these. */
export function roundB251Loyalty(line: string, raw: string, out: CompiledCard): boolean {
  // Tamiyo, Collector of Tales' +1: Desperate Research's "Reveal the top N cards of your library and put all of them with
  // that name into your hand. Put the rest into your graveyard.", said another way: every revealed card with the name
  // chosen as it resolves (CR 201.2), the rest milled.
  if (line === TAMIYO) {
    const ab = parseLoyalty("+", "1", "Choose a nonland card name. Reveal the top four cards of your library and put all of them with that name into your hand. Put the rest into your graveyard.", raw);
    const [choose, dig] = ab === "fail" ? [] : ab.body.effects;
    if (ab === "fail" || ab.loyalty !== 1 || ab.body.targets.length || ab.body.effects.length !== 2 || choose?.type !== "choose" || choose.choice !== "cardName" || dig?.type !== "dig" || dig.filter?.chosen !== "name" || dig.into !== "hand" || dig.rest !== "graveyard" || dig.n !== 4) {
      out.unsupported.push(raw);
      return true;
    }
    out.activated.push({ ...ab, body: { ...ab.body, text: line.replace(/^\+1: /, "") }, text: line });
    return true;
  }
  // Kasmina, Enigma Sage's −8: "an instant or sorcery card that shares a color with this planeswalker": the planeswalker
  // it's activated from (another one Kasmina lends it to, rulings), its colors as the search is made (or as it last
  // existed, CR 608.2h); a colorless one shares no color, so no card can be found (rulings). TargetSpec
  // sharesColorWithSource, bound in the search (effects/run-library.ts).
  if (line === KASMINA.replace("this planeswalker", "~")) {
    const ab = parseLoyalty("−", "8", "Search your library for an instant or sorcery card, exile that card, then shuffle. You may cast that card without paying its mana cost.", raw);
    const [search, cast] = ab === "fail" ? [] : ab.body.effects;
    if (ab === "fail" || ab.loyalty !== -8 || ab.body.effects.length !== 2 || search?.type !== "search" || search.filter?.text !== "instant or sorcery card" || search.n !== 1 || search.dest.zone !== "exile" || cast?.type !== "castSearched") {
      out.unsupported.push(raw);
      return true;
    }
    const text = "instant or sorcery card that shares a color with this planeswalker";
    out.activated.push({ ...ab, body: { ...ab.body, effects: [{ ...search, filter: { ...search.filter, sharesColorWithSource: true, text } }, cast], text: KASMINA.replace(/^−8: /, "") }, text: KASMINA });
    return true;
  }
  return false;
}
