// Lane B round B191's text, lines and spells: roundB191Text rewrites a card's whole text before it's split into
// abilities (compileCard), roundB191Line reads a line before its triggers and activated abilities (after round B187's),
// and roundB191Spell reads a spell's whole text before the usual reading.
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";

/**
 * The card's text (with its name as ~) as the rest of the compiler reads it: wordings that mean what another, already
 * read wording does.
 */
export function roundB191Text(text: string): string {
  return (
    text
      // Wild Shape: "Choose one. Until end of turn, target creature you control has that base power and toughness, becomes
      // that creature type, and gains that ability." then "• 1/3 Turtle with hexproof." and so on: each mode sets its
      // base power and toughness (layer 7b), replaces its creature types with that one and keeps its other types (CR
      // 205.1a) and abilities, and grants the keyword (layer 6), until end of turn (rulings). The mode and the target are
      // chosen as it's cast (CR 700.2a, 601.2b-c).
      .replace(
        /^Choose one\. Until end of turn, target creature you control has that base power and toughness, becomes that creature type, and gains that ability\.((?:\n• \d+\/\d+ [A-Z][a-z]+ with [a-z]+\.)+)$/m,
        (_, modes: string) => `Choose one —${modes.replace(/\n• (\d+\/\d+) ([A-Z][a-z]+) with ([a-z]+)\./g, "\n• Until end of turn, target creature you control becomes a $1 $2 and gains $3.")}`,
      )
      // Storm Cauldron: "Each player may play an additional land during each of their turns." is Rites of Flourishing's
      // "on each of their turns" (CR 305.2a); "Whenever a land is tapped for mana, return it to its owner's hand." is the
      // event "a player taps a land for mana" (CR 106.12), a triggered ability that isn't a mana ability, so it uses the
      // stack after the mana is added (CR 605.1b, 605.5a; rulings: returned as a triggered ability, and a land tapped and
      // sacrificed in one action is in the graveyard first).
      .replace(/^Each player may play an additional land during each of their turns\.$/m, "Each player may play an additional land on each of their turns.")
      .replace(/^Whenever a land is tapped for mana, return it to its owner's hand\.$/m, "Whenever a player taps a land for mana, return it to its owner's hand.")
      // Energy Field: "Prevent all damage that would be dealt to you by sources you don't control." Every other player is
      // an opponent in this game (CR 102.3, 806.2), so each source an opponent controls, as the damage would be dealt (CR
      // 615.1a). "When a card is put into your graveyard from anywhere, sacrifice ~.": each card, not a token (CR 111.1),
      // a discard too, not a spell cast with buyback (rulings).
      .replace(/^Prevent all damage that would be dealt to you by sources you don't control\.$/m, "If a source an opponent controls would deal damage to you, prevent that damage.")
      .replace(/^When a card is put into your graveyard from anywhere, sacrifice ~\.$/m, "Whenever a card is put into your graveyard from anywhere, sacrifice ~.")
  );
}

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB191Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Ward of Bones: "Each opponent who controls more creatures than you can't cast creature spells. The same is true for
  // artifacts and enchantments.": each of the three for itself (rulings: more artifacts, no artifact spells; more
  // enchantments, no enchantment spells), the counts as the spell would be cast, only while ~ is on the battlefield.
  if (line === "Each opponent who controls more creatures than you can't cast creature spells. The same is true for artifacts and enchantments.") {
    out.opponentsWithMoreCantCast = ["Creature", "Artifact", "Enchantment"];
    return true;
  }
  // "Each opponent who controls more lands than you can't play lands." (rulings: can't play land cards; putting one onto
  // the battlefield isn't playing it, CR 305.1).
  if (line === "Each opponent who controls more lands than you can't play lands.") {
    out.opponentsWithMoreLandsCantPlay = true;
    return true;
  }
  return false;
}

/**
 * A spell's whole text (its paragraphs joined), read as one body; undefined when it isn't one of these, null when it is
 * but doesn't read.
 */
export function roundB191Spell(text: string): AbilityBody | null | undefined {
  // Multiple Choice: "If X is 1, scry 1, then draw a card. If X is 2, you may choose a player. They return a creature
  // they control to its owner's hand. If X is 3, create a 4/4 blue and red Elemental creature token. If X is 4 or more,
  // do all of the above.": the X it was cast with (CR 107.3a; 0 if it was cast without paying its mana cost, rulings),
  // with 4 or more the three in that order. The player is chosen as it resolves, not targeted (rulings: no targets); that
  // player chooses which creature they control to return, none if they control none (CR 608.2d).
  if (text === "If X is 1, scry 1, then draw a card. If X is 2, you may choose a player. They return a creature they control to its owner's hand. If X is 3, create a 4/4 blue and red Elemental creature token. If X is 4 or more, do all of the above.") {
    const one = parseBody("Scry 1, then draw a card.", { spell: true });
    const three = parseBody("Create a 4/4 blue and red Elemental creature token.", { spell: true });
    const back = parseBody("Each opponent returns a creature they control to its owner's hand.", { spell: true });
    const pick = back?.effects.length === 1 && back.effects[0]!.type === "pick" ? back.effects[0]! : undefined;
    if (!one || !three || !pick || pick.type !== "pick" || one.targets.length || three.targets.length || back!.targets.length) return null;
    const two: Effect[] = [{ type: "may", effects: [{ type: "choosePlayer", prompt: "to return a creature they control to its owner's hand" }, { ...pick, who: { ref: "chosenPlayer", nth: 0 } }], text: "Choose a player to return a creature they control to its owner's hand" }];
    const exactly = (n: number, effects: Effect[], otherwise?: Effect[]): Effect => ({ type: "if", cond: { kind: "xAtLeast", n }, effects, ...(otherwise ? { otherwise } : {}) });
    return {
      targets: [],
      effects: [exactly(4, [...one.effects, ...two, ...three.effects], [exactly(3, three.effects, [exactly(2, two, [exactly(1, one.effects)])])])],
      text,
    };
  }
  return undefined;
}
