// Lane B round B304: instructions that bring a card you own from outside the game into the game.
import type { AbilityBody, Effect } from "../abilities";

/**
 * The whole instruction, one sentence: put a card you own from outside the game into your hand or on top of your library,
 * reveal one of a kind (or named ~) and put it into your hand, shuffle up to N of them into your library, or cast any
 * number of spells of a creature type from among them.
 */
const OUTSIDE_THE_GAME = /^(?:[Yy]ou may )?(?:[Pp]ut a card you own from outside the game (?:into your hand|on top of your library)|reveal an? (?:[a-z]+ )?card you own (?:named ~ )?from outside the game and put it into your hand|[Ss]huffle up to (?:one|two|three|four|five) cards you own from outside the game into your library|[Cc]ast any number of [A-Z][a-z]+ spells from among cards you own outside the game without paying their mana costs)\.$/;

/**
 * Mastermind's Acquisition's second mode, North Wind Avatar, Legion Angel, Vivien, Arkbow Ranger's −5, The Raven's
 * Warning's chapter III, Granted, Research and Spawnsire of Ulamog's last ability: "Parts of abilities which bring other
 * traditional card(s) you own from outside the game into the game (such as Living Wish; Spawnsire of Ulamog; Karn, the
 * Great Creator; Wish) do not function in Commander" (Commander format rule 10), and players here have no sideboard (CR
 * 100.4: one is optional; CR 400.11a), as for learn, Invasion of Arcavios and Karn, the Great Creator. The ability still
 * exists, is activated or triggers, and resolves (its costs are paid, CR 602.2), doing nothing: no "you may" is asked, as
 * there is nothing to choose. Only a whole ability (or mode) that is this one instruction: a Wish's "Exile ~" (or Death
 * Wish's life loss) with nothing else is a card that would only exile itself, and those stay out by choice.
 */
export function outsideGameBody(text: string): AbilityBody | null {
  const t = text.trim();
  return OUTSIDE_THE_GAME.test(t) ? { targets: [], effects: [{ type: "outsideGame", text: t.replace(/\.$/, "") }], text: t } : null;
}

const DEVELOPMENT = "Create a 3/1 red Elemental creature token unless any opponent has you draw a card. Repeat this process two more times.";

/**
 * Development (Research // Development): "Create a 3/1 red Elemental creature token unless any opponent has you draw a card.
 * Repeat this process two more times.": three times in a row, each opponent in turn order may have you draw a card; once
 * one does, you draw it and no one else is asked, and if none does, you create the token (rulings: "each opponent, in
 * turn, has the option to let you draw a card. If no opponent does, you put a token onto the battlefield. Then the process
 * repeats two more times. A different opponent may let you draw a card each time"; three tokens, two and a card, one and
 * two cards, or three cards). `make` parses the token and the draw (body.ts parseBody, passed in to keep the import one way).
 */
export function developmentBody(text: string, make: (t: string) => AbilityBody | null): AbilityBody | null | undefined {
  if (text.trim() !== DEVELOPMENT) return undefined;
  const token = make("Create a 3/1 red Elemental creature token.");
  const draw = make("You draw a card.");
  const [tok] = token?.effects ?? [];
  const [dr] = draw?.effects ?? [];
  if (!token || !draw || token.targets.length || draw.targets.length || token.effects.length !== 1 || draw.effects.length !== 1 || tok?.type !== "createToken" || dr?.type !== "draw") return null;
  const once: Effect = { type: "punisher", who: { ref: "eachOpponent" }, options: [{ allow: "Have them draw a card" }], effects: [dr], mode: "ifAny", firstOnly: true, otherwise: [tok], thenText: "they draw a card (if no one does, they create a 3/1 red Elemental token)" };
  return { targets: [], effects: [once, structuredClone(once), structuredClone(once)], text: text.trim() };
}
