// Round 345's sentences, read before round 344's (round344Sentence in oracle/round344.ts, which reads these first).
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { parsePlayer } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** Last Night Together: the targets "Choose two target creatures" chose, for "the chosen creatures" later in the same text. */
const chosenTargets = new WeakMap<Ctx, { index: number; n: number }>();

export function round345Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void effects;
  const line = plain(s);
  // Last Night Together: "Choose two target creatures. Untap them.": two different target creatures (CR 115.3), chosen as
  // it's cast (CR 601.2c), untapped as it resolves.
  if (ctx.spell && line === "Choose two target creatures" && plain(sentences[si + 1]) === "Untap them") {
    const at = ctx.targets.length;
    const untap = parseSentence("Untap two target creatures", ctx);
    if (untap?.length !== 1 || untap[0]!.type !== "untap" || ctx.targets.length !== at + 2) return "fail";
    chosenTargets.set(ctx, { index: at, n: 2 });
    return { effect: untap[0]!, next: si + 2 };
  }
  // ... "After this main phase, there is an additional combat phase. Only the chosen creatures can attack during that
  // combat phase.": the added combat phase only (as the rulings on Bumi, Unleashed say for its own), and only the creatures
  // chosen; the turn's other combat phases as usual (CR 500.8, 506.1).
  // Extract Brain: "Target opponent chooses X cards from their hand. Look at those cards. You may cast a spell from among
  // them without paying its mana cost." One spell, cast from that hand as this resolves, ignoring timing (CR 608.2g); X is
  // 0 for it and no alternative cost can be paid (CR 107.3b, 118.9).
  if (ctx.spell && line === "Target opponent chooses X cards from their hand" && plain(sentences[si + 1]) === "Look at those cards" && plain(sentences[si + 2]) === "You may cast a spell from among them without paying its mana cost") {
    const who = parsePlayer("target opponent", ctx);
    if (who?.ref !== "target") return "fail";
    return { effect: { type: "handChooseCast", who, n: { count: { kind: "x" } } }, next: si + 3 };
  }
  const chosen = chosenTargets.get(ctx);
  if (chosen && line === "After this main phase, there is an additional combat phase" && plain(sentences[si + 1]) === "Only the chosen creatures can attack during that combat phase") {
    return { effect: { type: "addPhases", phases: ["combat"], after: "main", onlyAttackTargets: chosen }, next: si + 2 };
  }
  return null;
}

/** Round 345's whole lines (compile.ts, after round 344's). */
export function round345Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  // Enduring Angel: a replacement effect of its own (game.ts lifeZeroReplaced), on a permanent only.
  if (!isSpell && line === "If your life total would be reduced to 0 or less, instead transform ~ and your life total becomes 3. Then if ~ didn't transform this way, you lose the game.") {
    out.lifeZeroTransform = true;
    return true;
  }
  return false;
}

/**
 * The Aesir Escape Valhalla's chapters (compile.ts, in the Saga lines), linked by "the exiled card" (CR 607.2a): chapter
 * I's exile is what chapters II and III refer to, the cards exiled by this object's chapter I (all of them if it was
 * copied, CR 607.3: their mana values added up). Null for any other chapter text.
 */
export function round345Chapter(text: string, parse: (text: string) => AbilityBody | null): AbilityBody | null | "fail" {
  if (text === "Exile a permanent card from your graveyard. You gain life equal to its mana value.") {
    // "Its": the card this exiled (the one chosen as it resolves, CR 608.2d), its mana value in exile (X is 0, CR 202.3e).
    const body = parse("Exile a permanent card from your graveyard. You gain life equal to that card's mana value.");
    const [ex, gain] = body?.effects ?? [];
    if (body?.effects.length !== 2 || ex?.type !== "chooseFromGraveyard" || ex.dest !== "exile" || gain?.type !== "gainLife") return "fail";
    return { ...body, effects: [{ ...ex, linked: true }, gain], text };
  }
  const counters = /^Put a number of \+1\/\+1 counters on (target creature you control) equal to the mana value of the exiled card\.$/.exec(text);
  if (counters) {
    const body = parse(`Put a +1/+1 counter on ${counters[1]}.`);
    const put = body?.effects[0];
    if (body?.effects.length !== 1 || body.targets.length !== 1 || put?.type !== "counters" || put.n !== 1) return "fail";
    return { ...body, effects: [{ ...put, n: { count: { kind: "manaValue", of: { ref: "linkedCard" }, total: true } } }], text };
  }
  // "Return ~ and the exiled card to their owner's hand.": both at once; the card only while this is still the object
  // whose chapter I exiled it (CR 400.7, as The Princess Takes Flight's), and ~ only while it's still on the battlefield.
  if (text === "Return ~ and the exiled card to their owner's hand.") return { targets: [], effects: [{ type: "returnLinked", dest: "hand", here: true }, { type: "bounce", what: { ref: "self" } }], text };
  return null;
}
