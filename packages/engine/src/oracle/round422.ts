// Round 422's whole lines (compile.ts, before round 421's): Possibility Storm's and Knowledge Pool's cast triggers and
// Ashnod the Uncaring's copy trigger.
import type { CompiledCard, Effect, TriggeredAbility } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const STORM = "Whenever a player casts a spell from their hand, that player exiles it, then exiles cards from the top of their library until they exile a card that shares a card type with it. That player may cast that card without paying its mana cost. Then they put all cards exiled with ~ on the bottom of their library in a random order.";

const POOL = "Whenever a player casts a spell from their hand, that player exiles it. If the player does, they may cast a spell from among other cards exiled with ~ without paying its mana cost.";

const ASHNOD = "Whenever you activate an ability of an artifact or creature that isn't a mana ability, if one or more permanents were sacrificed to activate it, you may copy that ability. You may choose new targets for the copy.";

/** "Whenever a player casts a spell from their hand", read by the usual trigger parser; null if it doesn't read so. */
function castFromHand(): TriggeredAbility | null {
  const t = parseTrigger("Whenever a player casts a spell from their hand, draw a card.");
  if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "any" || t.cast.from !== "hand" || t.cast.orCopy || t.cast.nth) return null;
  return t;
}

/** One whole line of round 422's (compile.ts); false when it isn't one of these. */
export function round422Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Possibility Storm: any player's spell cast from their hand (a copy isn't cast; a miracle's is, rulings). That player
  // exiles it from the stack (not countered, Effect exileCause), then cards from the top of their library one at a time
  // until one that shares a card type with it (CR 205.2a; a land too: an artifact land stops an artifact spell), the
  // spell's types as it last existed on the stack (CR 608.2h; if something else exiled it first, it still goes on,
  // rulings). That player may cast that card as this resolves, free, or never (CR 608.2g; X is 0, CR 107.3b; no
  // alternative costs, mandatory additional costs paid, rulings). Then every card exiled with ~ this time, the original
  // spell among them, and the found card if it wasn't cast, goes to the bottom of their library in a random order (rulings).
  if (line === STORM) {
    const t = isSpell ? null : castFromHand();
    if (!t) return fail(out, raw);
    const effects: Effect[] = [
      { type: "exileCause" },
      { type: "exileUntilNonland", who: { ref: "eventPlayer" }, then: "castFree", ownerCasts: true, restBottom: true, untilSharesCauseType: true, withExiledCause: true },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  // Knowledge Pool: any player's spell cast from their hand. That player exiles it (not countered, so "can't be
  // countered" doesn't stop it, rulings), exiled with ~ (CR 607.2a); only if it was, they may cast one spell from among the
  // other cards exiled with ~ (its imprint's, and spells exiled by this, whoever owns them, rulings), as this resolves,
  // free (X is 0), timing ignored, other restrictions not (CR 608.2g, rulings). With several Knowledge Pools, the first to
  // resolve exiles the spell and the others do nothing (rulings).
  if (line === POOL) {
    const t = isSpell ? null : castFromHand();
    const imprint = out.triggers.find((x) => x.event === "selfEnters" && x.body.effects.length === 1 && x.body.effects[0]!.type === "exileTop");
    const top = imprint?.body.effects[0];
    if (!t || top?.type !== "exileTop" || top.who.ref !== "eachPlayer" || top.linked || out.triggers.length !== 1) return fail(out, raw);
    // Its imprint's cards are "cards exiled with ~" (CR 607.2a).
    top.linked = true;
    const effects: Effect[] = [{ type: "castFromAmong", who: { ref: "eventPlayer" }, castBy: { ref: "eventPlayer" }, n: 0, max: 1, fromYard: { causeLinked: true, othersOnly: true } }];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  // Ashnod the Uncaring: an ability of an artifact or creature you activate, not a mana ability (the source as it was
  // activated, CR 602.2), with a permanent sacrificed to pay its costs (CR 602.2b; one sacrificed for mana doesn't count,
  // rulings): an intervening if (CR 603.4), and once paid it stays true. The copy has the same cost information and
  // choices, new targets may be chosen (CR 707.10, 707.10c).
  if (line === ASHNOD) {
    const t = isSpell ? null : parseTrigger("Whenever you activate an ability of an artifact or creature that isn't a mana ability, you may copy that ability. You may choose new targets for the copy.");
    if (!t || t === "fail" || t.event !== "abilityActivated" || t.activates?.by !== "you" || t.activates.mana || !t.activates.of || t.ifCond) return fail(out, raw);
    out.triggers.push({ ...t, activates: { ...t.activates, costSacrificed: true } });
    return true;
  }
  return false;
}
