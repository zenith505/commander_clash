// Lane B round B270's lines, read by compileCard before the generic triggers (after round B269's): Draugr Necromancer,
// Spellweaver Helix's cast trigger (its imprint ability word already gone, CR 207.2c) and Abstract Performance.
import type { CompiledCard, Effect } from "../abilities";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";

const DRAUGR_DIES = "If a nontoken creature an opponent controls would die, exile that card with an ice counter on it instead.";

const DRAUGR_CAST = "You may cast spells from among cards in exile your opponents own with ice counters on them, and you may spend mana from snow sources as though it were mana of any color to cast those spells.";

const HELIX = "Whenever a player casts a card, if it has the same name as one of the cards exiled with ~, you may copy the other. If you do, you may cast the copy without paying its mana cost.";

const ABSTRACT = "Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the cards in the other pile. You may cast a spell from among them without paying its mana cost. Put the rest into your hand.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB270Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Draugr Necromancer: a replacement effect (CR 614.1a) on a nontoken creature an opponent controls dying, as Ravenloft
  // Adventurer's "instead exile it and put a hit counter on it": the card in exile gets the counter (CR 122.1); a land
  // that's become a creature too (rulings).
  if (line === DRAUGR_DIES) {
    const filter = parseTargetPhrase("nontoken creature an opponent controls");
    if (isSpell || filter?.kind !== "object" || out.exileInsteadOfDying) return fail();
    out.exileInsteadOfDying = { filter, counter: "ice" };
    return true;
  }
  // Its cast permission: any face-up card an opponent owns in exile with an ice counter, whatever exiled it (rulings: an
  // earlier Draugr's too), cast as a spell with the usual timing and costs (rulings); lands can't be played this way
  // (rulings). Mana from snow sources pays colored symbols as though it were that color (CR 609.4b); {S} still needs snow
  // mana and {C} colorless (rulings: snow isn't a type).
  if (line === DRAUGR_CAST) {
    if (isSpell || out.castOpponentsCountered) return fail();
    out.castOpponentsCountered = "ice";
    return true;
  }
  // Spellweaver Helix: any player casting a card (a copy isn't one, CR 707.12), if it has the name of one of the sorcery
  // cards its imprint ability exiled (CR 607.2a; either name of a split card, rulings), checked again as it resolves (CR
  // 603.4). Its controller may copy the other card in exile and cast the copy as it resolves, free (CR 707.12, 118.9;
  // rulings: timing ignored, additional costs paid, X is 0), a copy not cast ceasing to exist (CR 704.5e).
  if (line === HELIX) {
    const t = isSpell ? null : parseTrigger("Whenever a player casts a spell, you draw a card.");
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.by !== "any" || t.cast.orCopy || t.ifCond) return fail();
    const effects: Effect[] = [{ type: "castLinkedCopy", other: true }];
    out.triggers.push({ ...t, cast: { ...t.cast, spell: { ...t.cast.spell, text: "card" }, cardOnly: true, nameExiledWithSelf: true }, body: { targets: [], effects, text: "if it has the same name as one of the cards exiled with ~, you may copy the other. If you do, you may cast the copy without paying its mana cost." } });
    return true;
  }
  // Abstract Performance: four cards face down in a pile (nobody may look, rulings), then four face up in another (fewer
  // with a short library, rulings), an opponent chosen as it resolves picking the pile for your graveyard (rulings); then
  // you look at the other pile and may cast a spell from it as this resolves, free, timing ignored (rulings, CR 608.2g,
  // 118.9); the rest go into your hand.
  if (line === ABSTRACT) {
    if (!isSpell) return fail();
    out.spell = { targets: [], effects: [{ type: "abstractPiles", n: 4 }, { type: "castFromAmong", who: { ref: "you" }, n: 0, fromDug: true, max: 1, rest: { dest: "hand" } }], text: line };
    return true;
  }
  return false;
}
