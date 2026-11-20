// Lane B round B269's lines, read by compileCard before the generic triggers (after round B268's): Prowl, Stoic
// Strategist's play trigger, Lucy MacLean, Positively Armed's Golden Rule (its ability word already gone, CR 207.2c) and
// Apple of Eden, Isu Relic's ability.
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";

const PROWL = "Whenever a player plays a card exiled with ~, you draw a card and convert ~.";

const LUCY = "Whenever a token enters, you may have target player other than its controller create a token that's a copy of it, then you draw a card if an opponent created a token this way. Do this only once each turn.";

const APPLE = "{T}, Pay 4 life, Sacrifice ~: Look at target opponent's hand and exile those cards face down. You may play those cards this turn, and mana of any type can be spent to cast them. Until end of turn, whenever you play a land or cast a spell this way, its owner draws a card. At the beginning of the next end step, return the exiled cards to their owner's hand. Activate only as a sorcery.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB269Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Prowl, Stoic Strategist: any player casting a spell or playing a land (CR 305.1, 601.2) from among the cards its
  // attack trigger exiled (CR 607.2a: linked in compile.ts), as Voltaic Visionary's "When you play a card exiled with ~"
  // but anyone's. The cards' owners play them with their usual timing and costs (rulings). It's an ability of the front
  // face only, so it triggers only while Prowl is Prowl, Stoic Strategist (rulings); converting is transforming (CR
  // 701.28a), so it doesn't convert again if it already has since the ability triggered (CR 701.27f).
  if (line === PROWL) {
    const t = isSpell ? null : parseTrigger("Whenever a player casts a spell, you draw a card and convert ~.");
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.by !== "any" || t.cast.orCopy || t.ifCond || t.cast.from) return fail();
    const land = parseTargetPhrase("land");
    if (land?.kind !== "object") return fail();
    out.triggers.push({ ...t, cast: { ...t.cast, orPlaysLand: { ...land, text: "land" }, fromLinked: true } });
    return true;
  }
  // Lucy MacLean, Positively Armed: any token entering, under anyone's control. The target is a player other than the
  // token's controller as the trigger is put on the stack (TargetSpec.notSubjectController); the copy is of the token as it
  // is, or as it last existed (CR 707.2, 608.2h), created by that player (CR 111.2). You draw only if that player was one
  // of your opponents and a token was created. "Do this only once each turn" (CR 603.2h): once you've chosen to do it this
  // turn, it doesn't trigger again (so the copy it makes doesn't); a "no" lets it trigger again.
  if (line === LUCY) {
    const t = isSpell ? null : parseTrigger("Whenever a token enters, target player creates a token that's a copy of it.");
    const spec = t && t !== "fail" && t.body.targets.length === 1 ? t.body.targets[0] : undefined;
    const copy = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "permanentEnters" || !t.enters?.filter?.token || spec?.kind !== "player" || spec.opponent || copy?.type !== "createTokenCopy" || copy.what.ref !== "subject" || copy.who.ref !== "target") return fail();
    const text = "have target player other than its controller create a token that's a copy of it, then you draw a card if an opponent created a token this way";
    const effects: Effect[] = [{ type: "may", effects: [copy, { type: "if", cond: { kind: "createdByOpponent" }, effects: [{ type: "draw", who: { ref: "you" }, n: 1 }] }], once: true, text }];
    out.triggers.push({ ...t, body: { targets: [{ ...spec, notSubjectController: true, text: "target player other than its controller" }], effects, text: `you may ${text}. Do this only once each turn.` } });
    return true;
  }
  // Apple of Eden, Isu Relic: the cards in that opponent's hand as it resolves (rulings), exiled face down (CR 406.3): you
  // looked at them, so you may go on looking (exileFaceDown `look`); their owner may not. You may play them this turn with
  // their usual timing and costs (rulings: a land in your main phase with the stack empty, as your land play), mana of any
  // type spent on them (CR 609.4b). Playing one with that permission triggers (a delayed triggered ability, CR 603.7) and
  // its owner draws a card (FaceDownPlay `onPlay`). At the next end step only the cards still exiled as the same
  // objects return to their owner's hand (CR 400.7, rulings).
  if (line === APPLE) {
    const a = isSpell ? null : parseActivated("{T}, Pay 4 life, Sacrifice ~: Target opponent loses 1 life. Activate only as a sorcery.");
    const tgt = a && a !== "fail" && a.body.targets.length === 1 ? a.body.targets[0] : undefined;
    if (!a || a === "fail" || !a.tap || a.manaCost || !a.sorcerySpeed || !a.sacrificeSelf || a.lifeCost !== 4 || (a.costs ?? []).length || tgt?.kind !== "player" || !tgt.opponent) return fail();
    const draws = { targets: [], effects: [{ type: "draw" as const, who: { ref: "subjectOwner" as const }, n: 1 }], text: "its owner draws a card." };
    const effects: Effect[] = [
      { type: "exileFaceDown", from: "hand", who: { ref: "target", index: 0 }, actor: { ref: "you" }, look: true, play: { until: "thisTurn", anyType: true, onPlay: draws } },
      { type: "delayed", when: "nextEndStep", effects: [{ type: "returnFaceDownExiled" }], text: "return the exiled cards to their owner's hand" },
    ];
    out.activated.push({ ...a, text: line, body: { targets: a.body.targets, effects, text: line.replace(/^\{T\}, Pay 4 life, Sacrifice ~: /, "").replace(/ Activate only as a sorcery\.$/, "") } });
    return true;
  }
  return false;
}
