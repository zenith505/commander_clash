// Sentences about card names (CR 201): what's done with the name chosen as it resolves ("Choose a nonland card name",
// read in parseBody), or with a target's name ("cards with the same name as that spell").

import type { Effect, TargetSpec } from "../../abilities";
import { num } from "../words";
import { parsePlayer, pickFilter } from "../targets";
import { parseSearchFilter } from "../search";
import type { Ctx } from "../body";

/** "Cards with that name" after "choose a card name". */
const CHOSEN_NAME: TargetSpec = { kind: "card", chosen: "name", text: "card with the chosen name" };

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseNamesSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;
  // "Search target player's graveyard, hand, and library for any number of cards with that name and exile them"
  // (Memoricide; "Then that player shuffles" follows), "... for all cards with the same name as that spell" (Counterbore,
  // after "Counter target spell"), "... as that card" (Surgical Extraction), CR 701.23.
  // Pick the Brain: "... for any number of cards with the same name as the exiled card, exile those cards, then that player
  // shuffles", the card the sentence before exiled from that player's hand. Invasive Surgery: "search the graveyard, hand,
  // and library of that spell's controller for ...". Deicide: "... as that card", the permanent the sentence before
  // exiled, by the card in exile (rulings).
  if ((m = /^Search (?:(target player|target opponent|that player|its controller|its owner)'s graveyard, hand, and library|the graveyard, hand, and library of (that spell's controller)) for (any number of|all|up to (?:two|three|four)) cards with (that name|the chosen name|the same name as the exiled card|the same name as that (spell|land|card|creature|artifact|enchantment|permanent))(?: and exile them|, exile those cards, then that player shuffles)$/.exec(s))) {
    const [, whose0, whose1, how, named, sameKind] = m;
    const whose = whose0 ?? whose1!;
    let sameAs: number | undefined;
    let exiledCard = false;
    if (sameKind) {
      // The target the sentence before chose, the only one.
      if (ctx.targets.length !== 1 || ctx.targets[0]!.many) return null;
      const t = ctx.targets[0]!;
      // Deicide: "that card", a permanent exiled by the sentence before (ctx.exiledTarget).
      exiledCard = sameKind === "card" && t.kind === "object" && ctx.exiledTarget === 0;
      const fits = sameKind === "spell" ? t.kind === "spell" : sameKind === "card" ? t.kind === "card" || exiledCard : t.kind === "object";
      if (!fits) return null;
      sameAs = 0;
    }
    // "The exiled card": the one exiled from that player's hand by the sentence before (takeFromHand).
    if (named === "the same name as the exiled card" && !ctx.exiledFromHand) return null;
    const who = parsePlayer(whose, ctx);
    if (!who) return null;
    // "Its controller", "its owner", "that spell's controller": that same target's (CR 608.2h).
    if (sameAs !== undefined ? !((who.ref === "targetController" || who.ref === "targetOwner") && who.index === sameAs) : who.ref !== "target") return null;
    // "That player shuffles, then draws a card for each card exiled from their hand this way" (Test of Talents): the one
    // whose cards were searched.
    if (who.ref === "targetController" && ctx.lastObjectTarget === who.index && ctx.lastPlayerTarget === undefined) ctx.controllerNamed = who.index;
    const exiled = named === "the same name as the exiled card";
    const filter: TargetSpec = sameAs !== undefined ? { kind: "card", text: `card with the same name as that ${sameKind}` } : exiled ? { kind: "card", text: "card with the same name as the exiled card" } : CHOSEN_NAME;
    const ref = exiledCard ? { sameName: { target: 0, card: true as const } } : exiled ? { sameName: { exiledThisWay: true as const } } : sameAs !== undefined ? { sameAs } : {};
    return [{ type: "exileNamed", who, filter, ...(how === "all" ? { all: true as const } : {}), ...(/^up to /.test(how!) ? { max: num(how!.slice(6)) } : {}), ...ref }];
  }
  // Haunting Echoes: "Exile all cards from target player's graveyard other than basic land cards. For each card exiled this
  // way, search that player's library for all cards with the same name as that card and exile them. Then that player
  // shuffles." One search of that library for cards with any of those names, which the searcher may leave there (a hidden
  // zone, CR 701.23b; rulings), shuffled after ("Then that player shuffles" is the search's).
  if (/^For each card exiled this way, search that player's library for all cards with the same name as that card and exile them$/.test(s) && ctx.exiledCards && ctx.lastPlayerTarget !== undefined && ctx.targets.length === 1)
    return [{ type: "search", n: 99, upTo: true, reveal: false, dest: { zone: "exile" }, library: { ref: "target", index: ctx.lastPlayerTarget }, filter: { kind: "card", text: "card with the same name as a card exiled this way" }, sameName: { exiledThisWay: true } }];
  // Dichotomancy (as parseBody joins its sentences): one search of that player's library, up to one card for each of
  // those permanents (the name each has now), each found card coming under your control.
  if ((m = /^Search (target opponent's) library for cards with the same name as each (.+?) that player controls and put them onto the battlefield under your control$/.exec(s))) {
    const library = parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    const permanents = pickFilter(m[2]!);
    if (!library || !permanents) return null;
    return [{ type: "search", n: 99, upTo: true, reveal: false, dest: { zone: "battlefield" }, library, filter: { kind: "card", text: `card with the same name as a ${m[2]} that player controls` }, sameName: { permanents, whose: library, each: true } }];
  }
  // "Target player reveals their hand and discards all cards with that name" (Cabal Therapy, CR 701.9b: no choice).
  if ((m = /^(Target player|Target opponent|That player) reveals their hand and discards all cards with (?:that|the chosen) name$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "lookAtHand", who, reveal: true }, { type: "discard", who, n: 0, hand: true, filter: CHOSEN_NAME }] : null;
  }
  // Hint of Insanity: "Target player reveals their hand. That player discards all nonland cards with the same name as
  // another card in their hand": every such card, no choice (CR 701.9b); two of a name both go.
  if ((m = /^That player discards all nonland cards with the same name as another card in their hand$/.exec(s)) && ctx.lastPlayerTarget !== undefined)
    return [{ type: "discard", who: { ref: "target", index: ctx.lastPlayerTarget }, n: 0, hand: true, filter: { kind: "card", notTypes: ["Land"], text: "nonland card" }, nameTwice: true }];
  // "Target player reveals their hand and discards all Trap cards" (Trapfinder's Trick): every card like that there.
  // Tsabo's Decree: "... discards all creature cards of the chosen type" (after "Choose a creature type"): the type
  // chosen as it resolves.
  if ((m = /^(Target player|Target opponent) reveals their hand and discards all (.+?) cards( of the chosen type)?$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const base = parseSearchFilter(`${m[2]} card`);
    const filter = base && m[3] ? { ...base, chosen: "type" as const, text: `${base.text} of the chosen type` } : base;
    return who && filter ? [{ type: "lookAtHand", who, reveal: true }, { type: "discard", who, n: 0, hand: true, filter }] : null;
  }
  // "Until your next turn, spells with the chosen name can't be cast and lands with the chosen name can't be played"
  // (Conjurer's Ban), "Opponents can't cast spells with the chosen name until your next turn" (Academic Probation).
  if (/^Until your next turn, spells with the chosen name can't be cast and lands with the chosen name can't be played$/.test(s)) return [{ type: "banName", lands: true }];
  if (/^(?:Your opponents|Opponents) can't cast spells with the chosen name until your next turn$/.test(s)) return [{ type: "banName", who: { ref: "eachOpponent" } }];
  // "Return target creature an opponent controls to its owner's hand. That creature's owner can't cast spells with the same
  // name as that creature until your next turn." (Reflector Mage): the name it had on the battlefield (CR 608.2h).
  if (/^That creature's owner can't cast spells with the same name as that creature until your next turn$/.test(s)) {
    const i = ctx.lastObjectTarget;
    if (i === undefined || ctx.targets[i]?.kind !== "object" || ctx.targets[i]!.many) return null;
    return [{ type: "banName", who: { ref: "targetOwner", index: i }, sameAs: i }];
  }
  return undefined;
}
