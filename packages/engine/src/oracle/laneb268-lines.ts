// Lane B round B268's lines, read by compileCard before the generic triggers (after round B267's): Selective
// Adaptation's keyword picks, Supper for Spiders's Foods and Brilliant Ultimatum's piles.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";

const SELECTIVE = "Reveal the top seven cards of your library. Choose from among them a card with flying, a card with first strike, and so on for double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance. Put one of the chosen cards onto the battlefield, the other chosen cards into your hand, and the rest into your graveyard.";

const KEYWORDS = ["Flying", "First strike", "Double strike", "Deathtouch", "Haste", "Hexproof", "Indestructible", "Lifelink", "Menace", "Reach", "Trample", "Vigilance"];

/** "A card with hexproof" finds a card with "hexproof from [quality]" too (CR 702.11e); first strike isn't double strike. */
const keywordCard = (k: string): TargetSpec =>
  k === "Hexproof"
    ? { kind: "card", anyOf: [{ kind: "card", keywords: ["Hexproof"], text: "card with hexproof" }, { kind: "card", keywords: ["Hexproof from"], text: "card with hexproof from a quality" }], text: "card with hexproof" }
    : { kind: "card", keywords: [k], text: `card with ${k.toLowerCase()}` };

const SUPPER = 'Put onto the battlefield under your control all creature cards in your opponents\' graveyards that were put there from the battlefield this turn. They are Food artifacts with "{2}, {T}, Sacrifice ~: You gain 3 life."';

const BRILLIANT = "Exile the top five cards of your library. An opponent separates those cards into two piles. You may play lands and cast spells from one of those piles. If you cast a spell this way, you cast it without paying its mana cost.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB268Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Selective Adaptation: the seven cards revealed (CR 701.20a), then a card chosen for each of the twelve keywords there's
  // a card with among them, a card with several of them chosen for any one (rulings), so a card is left over only if
  // every keyword it has is one a chosen card is for (dig oneOfEach `oneOfEachAll`). The keywords are the cards' own as
  // printed (they're in the library, CR 400.2 hasn't given them more); "hexproof from" is hexproof (CR 702.11e). Then one
  // of the chosen cards, the chooser's pick, is put onto the battlefield, the others into the hand and the rest into the
  // graveyard (`oneOnto`), one instruction (CR 608.2c).
  if (line === SELECTIVE) {
    const body = isSpell && !out.spell ? parseBody("Reveal the top seven cards of your library. Put a creature card from among them into your hand and the rest into your graveyard.", { spell: true }) : null;
    const dig = body?.effects.length === 1 ? body.effects[0] : undefined;
    if (!body || body.targets.length || dig?.type !== "dig" || dig.into !== "hand" || dig.rest !== "graveyard" || !dig.reveal) return fail();
    const anyOf = KEYWORDS.map(keywordCard);
    const { required: _, ...rest } = dig;
    const effects: Effect[] = [{ ...rest, count: anyOf.length, upTo: true, filter: { kind: "card", anyOf, text: "card with one of those keywords" }, oneOfEach: anyOf, oneOfEachAll: true, oneOnto: true }];
    out.spell = { ...body, effects, text: line };
    return true;
  }
  // Supper for Spiders: every creature card in an opponent's graveyard that got there from the battlefield this turn
  // (GameObject.fromBattlefieldTurn, as Cry of the Carnarium's), all at once under your control (CR 110.2a); as they enter
  // they're Food artifacts only (they enter that way, as Tezzeret, Cruel Machinist's rulings say of "Put ... onto the
  // battlefield ... They're 5/5 artifact creatures", and as Grimoire of the Dead's here), their other card types and subtypes gone (layer 4, CR 205.1a, 613.1d) but their
  // supertypes, names, mana costs and abilities kept, and they have the Food's ability (layer 6), for good (rulings: it
  // doesn't end in the cleanup step, CR 611.2c). The ability's "this artifact" is the permanent itself.
  if (line === SUPPER) {
    if (!isSpell || out.spell) return fail();
    const filter: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], fromBattlefieldThisTurn: true, text: "creature card that was put there from the battlefield this turn" };
    const effects: Effect[] = [{ type: "returnAllFromGraveyard", who: { ref: "eachOpponent" }, filter, alsoMods: [{ kind: "setTypes", types: ["Artifact"], subtypes: ["Food"] }, { kind: "addAbility", text: "{2}, {T}, Sacrifice ~: You gain 3 life." }] }];
    out.spell = { targets: [], effects, text: line };
    return true;
  }
  // Brilliant Ultimatum: the top five exiled face up (rulings), separated by an opponent you choose as it resolves (CR
  // 700.3; one pile may be empty), then lands played and spells cast from the pile you choose as it resolves, in any order,
  // ignoring timing but not other restrictions (rulings, CR 608.2g); a land only on your turn with a land play left
  // (rulings, CR 305.2); a spell without paying its mana cost (no alternative costs, X is 0, CR 118.9, 107.3b). The cards not
  // played, the other pile's too, stay exiled (rulings).
  if (line === BRILLIANT) {
    if (!isSpell || out.spell) return fail();
    out.spell = { targets: [], effects: [{ type: "castFromAmong", who: { ref: "you" }, n: 5, lands: true, piles: true }], text: line };
    return true;
  }
  return false;
}
