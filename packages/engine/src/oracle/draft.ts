// Conspiracy's draft-matters cards (CR 905.2). Their abilities that work during a draft do nothing in a game, and the
// game abilities that refer to what was noted or chosen as cards were drafted (CR 905.2b) find nothing: no draft comes
// before a Commander game here, so nothing was noted, removed or exiled with them. The rulings say what each card does
// then: "If you gain control of a Custodi Peacekeeper, but you didn't draft one, the highest noted number is considered
// to be 0", "there will be no applicable noted names" (Noble Banneret, Smuggler Captain), Paliano, the High City "won't
// add mana", Regicide can't be cast "because you won't be able to choose a legal target", and so on.

/** A draft-matters ability that's still there in a game but does nothing without a draft (AbilityBody.inert). */
export type InertAbility = { kind: "activated"; cost: string } | { kind: "triggered"; when: string };

/**
 * How a line of a draft-matters card reads in a game no draft came before: null if it only works during the draft (or
 * never applies without one), an ability that does nothing, the line to compile in its place, or undefined if it isn't
 * about a draft.
 */
export function draftLine(line: string): string | InertAbility | null | undefined {
  if (!/\b(?:draft|noted|guessed correctly|exiled with cards named)/i.test(line)) return undefined;
  // Abilities that function during the draft (CR 905.2): "Draft ~ face up" (905.2c), "Reveal ~ as you draft it" and
  // what's noted then (905.2b), "As you draft a card, ...", "During the draft, ...", passing and adding booster packs.
  if (/^Draft ~ face up\.$/.test(line)) return null;
  if (/^Reveal ~ as you draft it\b[^"]*\.$/.test(line)) return null;
  if (/^(?:As you draft (?:a|an) |During the draft, |Instead of drafting a card from a booster pack, |As long as ~ is face up during the draft, |Immediately after the draft, )[^"]*\.$/.test(line)) return null;
  if (/^Each player passes the last card from each booster pack to a player who drafted a card named ~\.$/.test(line)) return null;
  // Arcane Savant, Caller of the Untamed, Volatile Chimera: exiling drafted cards that aren't in your deck before the game
  // starts. Without a draft there are none.
  if (/^Before you shuffle your deck to start the game, you may reveal ~ from your deck and exile (?:an?|three or more) [a-z ]+ cards? you drafted that (?:isn't|aren't) in your deck\.$/.test(line)) return null;

  // Game abilities about what was noted, with nothing noted.
  // Garbage Fire: "the highest noted number is considered to be 0, so Garbage Fire won't deal any damage" (rulings). It
  // still targets a creature.
  if (/^~ deals damage to target creature equal to the highest number you noted for cards named ~\.$/.test(line)) return "~ deals 0 damage to target creature.";
  // Custodi Peacekeeper: "You can only use it to tap creatures with power 0 or less" (rulings).
  const custodi = /^(.+) with power less than or equal to the highest number you noted for cards named ~\.$/.exec(line);
  if (custodi) return `${custodi[1]} with power 0 or less.`;
  // Pyretic Hunter, Lurking Automaton, Cogwork Grinder: X is 0, so no counters.
  if (/^~ enters with X \+1\/\+1 counters on it, where X is (?:the highest number you noted for|the number of cards you removed from the draft with) cards named ~\.$/.test(line)) return null;
  // Noble Banneret, Paliano Vanguard, Animus of Predation: statics about noted names, types or removed cards, which
  // never apply.
  if (/^As long as you control one or more creatures with a name you noted for cards named ~, [^"]*\.$/.test(line)) return null;
  if (/^Other creatures you control of a type you noted for cards named ~ get [+-]\d+\/[+-]\d+\.$/.test(line)) return null;
  if (/^If you removed a creature card with [^"]* from the draft with cards named ~, [^"]*\.$/.test(line)) return null;
  // Cogwork Tracker: "If the noted player isn't in the game, Cogwork Tracker's last ability won't do anything" (rulings);
  // there's no noted player. Its "attacks each combat if able" is a line of its own.
  if (/^~ attacks a player you noted for cards named ~ each combat if able\.$/.test(line)) return null;
  // Spire Phantasm: nobody guessed, so the intervening "if" is false and it doesn't trigger (CR 603.4).
  if (/^When ~ enters, if you guessed correctly for a card named ~, draw a card\.$/.test(line)) return null;
  // Arcane Savant: it triggers, but there's no card exiled with it to copy.
  if (/^When ~ enters, copy a card you exiled with cards named ~\. You may cast the copy without paying its mana cost\.$/.test(line)) return { kind: "triggered", when: "When ~ enters" };
  // Volatile Chimera: it can be activated, but there's no card to choose, so it doesn't become a copy of anything.
  const chimera = /^((?:\{[0-9WUBRGC]\})+): Choose a card at random you exiled with cards named ~\. ~ becomes a copy of that card, except it has this ability\.$/.exec(line);
  if (chimera) return { kind: "activated", cost: chimera[1]! };
  // Paliano, the High City: "its second ability won't add mana. Notably, Paliano won't produce colorless mana" (rulings).
  // Since it can't add mana it isn't a mana ability (CR 605.1a): tapping it does nothing.
  if (/^\{T\}: Add one mana of any color chosen as you drafted cards named ~\.$/.test(line)) return { kind: "activated", cost: "{T}" };
  // Caller of the Untamed: X is the mana value of a card exiled with it, chosen as it's activated; with no such card
  // there's no X to choose, so it can't be activated (CR 602.2b, 601.2b).
  if (/^\{X\}, \{T\}: Create a token that's a copy of a card you exiled with cards named ~\. X is the mana value of that card\.$/.test(line)) return null;
  // Smuggler Captain, Aether Searcher: the search finds nothing ("You may search and shuffle your library, but you can't
  // find any cards"; the filter is TargetSpec.drafted). Aether Searcher's hand is searched too, which does nothing, and
  // its library only if you choose to, then shuffled; nothing is cast.
  if (/^When ~ enters, you may search your library for a card with a name you noted for cards named ~, reveal it, put it into your hand, then shuffle\.$/.test(line)) return line;
  if (/^When ~ enters, you may search your hand and\/or library for a card with a name noted as you drafted cards named ~\. You may cast it without paying its mana cost\. If you search your library this way, shuffle\.$/.test(line))
    return "When ~ enters, you may search your library for a card with a name you noted for cards named ~, reveal it, put it into your hand, then shuffle.";
  return undefined;
}

/** "A card with a name you noted for cards named ~" in a search (Smuggler Captain): see TargetSpec.drafted. */
export const DRAFTED_NAME = /^card with a name you noted for cards named ~$/;
