// Round 376's whole lines (compile.ts, after round 375's): a search whose cards an opponent splits, one shuffled back and
// the others cast for free (Emergent Ultimatum), a draft of every exiled permanent card (Thieves' Auction), every
// permanent shuffled away and replaced from the top of the library (Warp World), and an alternative cost of a discard for
// every player's spells (Dream Halls).
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

export function round376Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Emergent Ultimatum: the search exiles up to three monocolored cards (CR 105.2: exactly one color) with different names
  // (CR 201.2), face up; an opponent you choose picks one of them as it resolves (CR 608.2d) to shuffle into the library
  // (with one found, that one, rulings); the others may be cast as it resolves (CR 608.2g), in any order, without paying
  // their mana costs (X is 0, no alternative costs, CR 107.3b, 118.9; rulings), card-type timing ignored (rulings); those
  // not cast stay in exile. Then the spell exiles itself (CR 608.2n).
  if (line === "Search your library for up to three monocolored cards with different names and exile them. An opponent chooses one of those cards. Shuffle that card into your library. You may cast the other cards without paying their mana costs. Exile ~.") {
    const b = isSpell && !out.spell ? parseBody("Search your library for up to three monocolored cards with different names and exile them, then shuffle. Exile ~.", { spell: true }) : null;
    const [search, exile] = b?.effects ?? [];
    if (!b || b.targets.length || b.effects.length !== 2 || search?.type !== "search" || search.n !== 3 || !search.upTo || !search.oneEach || search.dest.zone !== "exile" || search.dest.faceDown || search.filter?.colorCount !== "monocolored" || exile?.type !== "exileSpell") return fail(out, raw);
    // The searcher wants these cards (to cast them), not gone.
    const { away: _, ...wanted } = search;
    out.spell = { targets: [], effects: [wanted, { type: "opponentShufflesExiledIn" }, { type: "castFromAmong", who: { ref: "you" }, n: 0, fromExiledThisWay: true }, exile], text: line };
    return true;
  }
  // Thieves' Auction: one exile of every nontoken permanent, then the draft (Effect thievesAuction).
  if (line === "Exile all nontoken permanents. Starting with you, each player chooses one of the exiled cards and puts it onto the battlefield tapped under their control. Repeat this process until all cards exiled this way have been chosen.") {
    if (!isSpell || out.spell) return fail(out, raw);
    out.spell = { targets: [], effects: [{ type: "thievesAuction" }], text: line };
    return true;
  }
  // Warp World: the whole instruction is one effect (Effect warpWorld), its steps as the rulings lay them out.
  if (line === "Each player shuffles all permanents they own into their library, then reveals that many cards from the top of their library. Each player puts all artifact, creature, and land cards revealed this way onto the battlefield, then does the same for enchantment cards, then puts all cards revealed this way that weren't put onto the battlefield on the bottom of their library.") {
    if (!isSpell || out.spell) return fail(out, raw);
    out.spell = { targets: [], effects: [{ type: "warpWorld" }], text: line };
    return true;
  }
  // Dream Halls: an alternative cost (CR 118.9) for every player's spells while it's on the battlefield (AltCostKind
  // "dreamHalls", game.ts dreamHallsCost); only the mana cost is replaced (rulings).
  if (line === "Rather than pay the mana cost for a spell, its controller may discard a card that shares a color with that spell.") {
    if (isSpell) return fail(out, raw);
    out.dreamHalls = true;
    return true;
  }
  return false;
}
