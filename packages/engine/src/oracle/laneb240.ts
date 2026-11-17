// Lane B round B240's lines, read by compileCard before its triggers and activated abilities (after round B239's), and its
// sentences (at the end of round B203's chain).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

const PURE_INTENTIONS = "Whenever a spell or ability an opponent controls causes you to discard cards this turn, return those cards from your graveyard to your hand.";
const SARCOPHAGUS_CAST = "You may cast spells that have a cycling ability from your graveyard.";
const SARCOPHAGUS_EXILE = "If a card that has a cycling ability would be put into your graveyard from anywhere and it wasn't cycled, exile it instead.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB240Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Pure Intentions: the instant's first paragraph is its effect (rulings), a delayed triggered ability for the rest of the
  // turn (CR 603.7b), once for each event in which a spell or ability one of its controller's opponents controls makes them
  // discard cards (CR 603.2c, rulings: whoever chose the cards), returning those of them still in their graveyard (CR 400.7)
  // to their hand. Its second paragraph is a triggered ability of the card (oracle/triggers.ts).
  if (isSpell && line === PURE_INTENTIONS) {
    if (out.spell) out.unsupported.push(raw);
    else
      out.spell = {
        targets: [],
        effects: [
          {
            type: "floatingTrigger",
            trigger: { event: "batch", batch: { what: "discards", whose: "you", byOpponent: true }, body: { targets: [], effects: [{ type: "bounce", what: { ref: "eventGroup", inYourGraveyard: true } }], text: "return those cards from your graveyard to your hand." } },
            until: "endOfTurn",
          },
        ],
        text: line,
      };
    return true;
  }
  if (isSpell) return false;
  // Abandoned Sarcophagus: a permission to cast the cards with cycling or typecycling in its controller's graveyard (the
  // card data lists "Cycling" with every kind, CR 702.29e), any number, paying their mana costs with the usual timing; only
  // casting them (rulings: not cycling them from there).
  if (line === SARCOPHAGUS_CAST) {
    (out.graveyardGrants ??= []).push({ filter: { kind: "card", types: [], notTypes: ["Land"], notColors: [], keywords: ["Cycling"], text: "cards with a cycling ability" }, way: { kind: "permission", costs: [], exile: false } });
    return true;
  }
  // Its replacement effect (CR 614.1a): a card, not a token or a copy of a spell (rulings: a token with cycling goes to the
  // graveyard), owned by its controller, that has a cycling ability as it is in the zone it's leaving, unless it was
  // discarded to pay a cycling cost (game.ts graveyardExileFor).
  if (line === SARCOPHAGUS_EXILE) {
    if (out.graveyardExile) out.unsupported.push(raw);
    else out.graveyardExile = { whose: "yours", cyclingNotCycled: true };
    return true;
  }
  return false;
}

/** Round B240's sentences, read at the end of round B203's chain. */
export function roundB240Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Bösium Strip: "Until end of turn, you may cast instant and sorcery spells from the top of your graveyard. If a spell cast
  // this way would be put into a graveyard, exile it instead.": a permission for the rest of the turn (Effect graveyardTurn
  // `topOnly`), any number of them, each the card on top of its owner's graveyard as it's cast (CR 404.1-2).
  if (plain(s) === "Until end of turn, you may cast instant and sorcery spells from the top of your graveyard" && plain(sentences[si + 1]) === "If a spell cast this way would be put into a graveyard, exile it instead" && ctx.activated) {
    return { effect: { type: "graveyardTurn", cast: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant and sorcery card" }, exileCast: true, topOnly: true }, next: si + 2 };
  }
  return null;
}
