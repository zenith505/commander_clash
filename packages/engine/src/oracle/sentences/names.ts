// Sentences about card names (CR 201): what's done with the name chosen as it resolves ("Choose a nonland card name",
// read in parseBody), or with a target's name ("cards with the same name as that spell").

import type { Effect, TargetSpec } from "../../abilities";
import { num } from "../words";
import { parsePlayer } from "../targets";
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
  if ((m = /^Search (target player|target opponent|that player|its controller|its owner)'s graveyard, hand, and library for (any number of|all|up to (?:two|three|four)) cards with (that name|the chosen name|the same name as that (spell|land|card|creature|artifact|enchantment|permanent)) and exile them$/.exec(s))) {
    const [, whose, how, , sameKind] = m;
    let sameAs: number | undefined;
    if (sameKind) {
      // The target the sentence before chose, the only one.
      if (ctx.targets.length !== 1 || ctx.targets[0]!.many) return null;
      const t = ctx.targets[0]!;
      const fits = sameKind === "spell" ? t.kind === "spell" : sameKind === "card" ? t.kind === "card" : t.kind === "object";
      if (!fits) return null;
      sameAs = 0;
    }
    const who = parsePlayer(whose!, ctx);
    if (!who) return null;
    // "Its controller", "its owner": that same target's (CR 608.2h).
    if (sameAs !== undefined ? !((who.ref === "targetController" || who.ref === "targetOwner") && who.index === sameAs) : who.ref !== "target") return null;
    // "That player shuffles, then draws a card for each card exiled from their hand this way" (Test of Talents): the one
    // whose cards were searched.
    if (who.ref === "targetController" && ctx.lastObjectTarget === who.index && ctx.lastPlayerTarget === undefined) ctx.controllerNamed = who.index;
    const filter: TargetSpec = sameAs !== undefined ? { kind: "card", text: `card with the same name as that ${sameKind}` } : CHOSEN_NAME;
    return [{ type: "exileNamed", who, filter, ...(how === "all" ? { all: true as const } : {}), ...(/^up to /.test(how!) ? { max: num(how!.slice(6)) } : {}), ...(sameAs !== undefined ? { sameAs } : {}) }];
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
  if ((m = /^(Target player|Target opponent) reveals their hand and discards all (.+?) cards$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = parseSearchFilter(`${m[2]} card`);
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
