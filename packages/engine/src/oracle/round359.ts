// Round 359's sentences, read before round 358's (round358Sentence in oracle/round358.ts reads these first), and its whole
// lines (compile.ts, after round 358's): a token copy of each creature card exiled from graveyards, sacrificed at your
// next end step (Foggy Swamp Visions); three token copies of an artifact on the battlefield or an artifact card in a
// graveyard (Daretti, Ingenious Iconoclast); a creature card put from your hand with +1/+1 counters if its mana cost has
// {X} (The First Tyrannic War); cards exiled from the top of a damaged creature's controller's library for them to play
// (Expedited Inheritance); and token copies of permanent cards exiled from your graveyard at random, again while they're
// land cards (Sin, Spira's Punishment); and a creature card exiled with a land returned, the rest to hand (Northampton
// Farm).
import type { CompiledCard, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import { addTarget, type Ctx } from "./body";
import { parseCount } from "./counts";
import { parseSentence } from "./sentence";
import { PERMANENT_TYPES } from "./targets";
import { parseTrigger } from "./triggers";
import { round360Sentence } from "./round360";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round359Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 360's sentences first (oracle/round360.ts).
  const r360 = round360Sentence(s, sentences, si, ctx, effects);
  if (r360) return r360;
  const line = plain(s);
  const next = plain(sentences[si + 1]);
  const prev = effects[effects.length - 1];
  // Foggy Swamp Visions: "Exile X target creature cards from graveyards. For each creature card exiled this way, create a
  // token that's a copy of it. At the beginning of your next end step, sacrifice those tokens.": one copy of each card
  // exiled (a target no longer legal isn't, CR 608.2b), of the card as printed (rulings, CR 707.2; X in its mana cost is 0),
  // all created at once; the tokens created are sacrificed by a delayed trigger at your next end step (CR 603.7), any that
  // are still there.
  if (
    ctx.spell &&
    line === "For each creature card exiled this way, create a token that's a copy of it" &&
    next === "At the beginning of your next end step, sacrifice those tokens" &&
    prev?.type === "exile" &&
    prev.what.ref === "target" &&
    !prev.until &&
    ctx.targets[prev.what.index]?.kind === "card" &&
    ctx.targets[prev.what.index]!.types?.join() === "Creature"
  ) {
    effects.push({ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "exiledThisWay", cards: true }, each: true });
    return { effect: { type: "delayed", when: "yourNextEndStep", each: "created", effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "sacrifice ~" }, next: si + 2 };
  }
  // Daretti, Ingenious Iconoclast: "Choose target artifact card in a graveyard or artifact on the battlefield. Create three
  // tokens that are copies of it.": one target, either one (TargetSpec.orCard); copies of the card as printed if it's a card
  // (CR 707.2), of the permanent's copiable values if it's a permanent. An artifact that has left the battlefield is an
  // illegal target, even if its card is now in a graveyard (a new object, CR 400.7), so no tokens (rulings, CR 608.2b).
  if (ctx.activated && !ctx.spell && line === "Choose target artifact card in a graveyard or artifact on the battlefield" && next === "Create three tokens that are copies of it" && !ctx.targets.length && !effects.length) {
    const card: TargetSpec = { kind: "card", types: ["Artifact"], notTypes: [], notColors: [], text: "artifact card from a graveyard" };
    const index = addTarget(ctx, { kind: "object", types: ["Artifact"], notTypes: [], notColors: [], orCard: card, text: "artifact card in a graveyard or artifact on the battlefield" });
    return { effect: { type: "createTokenCopy", who: { ref: "you" }, n: 3, what: { ref: "target", index } }, next: si + 2 };
  }
  // The First Tyrannic War: "You may put a creature card from your hand onto the battlefield. If its mana cost contains {X},
  // it enters with a number of +1/+1 counters on it equal to the number of lands you control.": a replacement effect as it
  // enters (CR 614.1c), the lands counted as this resolves; whether its mana cost has {X} is judged by what it enters as, a
  // copy's mana cost if it enters as a copy (rulings, CR 707.2). X in a mana cost is still {X} on the battlefield (CR 107.3g).
  if (
    !ctx.spell &&
    !ctx.activated &&
    /^[Yy]ou may put a creature card from your hand onto the battlefield$/.test(line) &&
    next === "If its mana cost contains {X}, it enters with a number of +1/+1 counters on it equal to the number of lands you control"
  ) {
    const put = parseSentence("You may put a creature card from your hand onto the battlefield", ctx);
    const n = parseCount("the number of lands you control", ctx);
    const fx = put?.length === 1 ? put[0]! : undefined;
    if (fx?.type !== "putFromHand" || !fx.may || fx.who || fx.any || fx.counters || fx.tapped || fx.attacking || !n) return "fail";
    return { effect: { ...fx, countersIfXCost: { counter: "+1/+1", n } }, next: si + 2 };
  }
  // Northampton Farm: "Return a creature card exiled with ~ to the battlefield under your control. Return each other card
  // exiled with ~ to its owner's hand.": the cards its exile ability exiled (CR 607.2a), the source sacrificed for the cost
  // (as it was, CR 400.7); one creature card among them chosen as it resolves, if there's one, then the rest (a token
  // exiled with it has ceased to exist, rulings, CR 111.7).
  if (ctx.activated && !ctx.spell && line === "Return a creature card exiled with ~ to the battlefield under your control" && next === "Return each other card exiled with ~ to its owner's hand" && sentences.length === si + 2 && !effects.length && !ctx.targets.length) {
    effects.push({ type: "moveLinked", dest: "battlefield", one: true, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" } });
    return { effect: { type: "moveLinked", dest: "hand" }, next: si + 2 };
  }
  return null;
}

/** Expedited Inheritance's whole line. */
const EXPEDITED = "Whenever a creature is dealt damage, its controller may exile that many cards from the top of their library. They may play those cards until the end of their next turn.";
/** Sin, Spira's Punishment's whole line. */
const SIN = "Whenever ~ enters or attacks, exile a permanent card from your graveyard at random, then create a tapped token that's a copy of that card. If the exiled card is a land card, repeat this process.";

export function round359Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Expedited Inheritance: "Whenever a creature is dealt damage, its controller may exile that many cards from the top of
  // their library. They may play those cards until the end of their next turn.": one trigger for each creature dealt
  // damage at once (CR 603.2c); the creature's controller as it resolves, or as it last existed (CR 608.2h), decides; "that
  // many" is the damage dealt to it (CR 120.3). The permission is theirs, with the usual costs and timing (rulings, a land
  // as their land play, CR 305.2), until their next turn ends: not this one, even if it's theirs.
  if (line === EXPEDITED) {
    const t = isSpell ? null : parseTrigger("Whenever a creature is dealt damage, its controller may draw a card.");
    if (!t || t === "fail" || t.event !== "permanentIsDealtDamage" || t.body.effects[0]?.type !== "eachMay") {
      out.unsupported.push(raw);
      return true;
    }
    const impulse: Effect = { type: "impulse", n: { count: { kind: "eventAmount" } }, until: "nextTurn", who: { ref: "choseThisWay" }, theyPlay: true };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "eachMay", who: { ref: "subjectController" }, effects: [impulse], text: "exile that many cards from the top of your library; you may play them until the end of your next turn" }], text: "its controller may exile that many cards from the top of their library. They may play those cards until the end of their next turn." } });
    return true;
  }
  // Sin, Spira's Punishment: see Effect "exileRandomTokenCopy". "Enters or attacks": two triggers, one for each event.
  if (line === SIN) {
    const events = isSpell ? [] : [parseTrigger("When ~ enters, draw a card."), parseTrigger("Whenever ~ attacks, draw a card.")];
    if (events.length !== 2 || events.some((t) => !t || t === "fail")) {
      out.unsupported.push(raw);
      return true;
    }
    const filter: TargetSpec = { kind: "card", types: [...PERMANENT_TYPES], notTypes: [], notColors: [], text: "permanent card" };
    const text = "exile a permanent card from your graveyard at random, then create a tapped token that's a copy of that card. If the exiled card is a land card, repeat this process.";
    for (const t of events as TriggeredAbility[]) out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "exileRandomTokenCopy", filter, tapped: true, repeatIfLand: true }], text } });
    return true;
  }
  return false;
}
