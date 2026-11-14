// Lane B round B208's lines, read by compileCard before its triggers and activated abilities (after round B207's).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const AURA_CARD: TargetSpec = { kind: "card", types: [], notTypes: [], notColors: [], subtypes: ["Aura"], text: "Aura card that could enchant it" };

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB208Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Lumbering Battlement: "When ~ enters, exile any number of other nontoken creatures you control until it leaves the
  // battlefield." ("it" is ~): chosen as it resolves, none too, exiled together, and nothing exiled if ~ has already left
  // (CR 610.3c, rulings); back under their owners' control as new objects when it leaves (CR 610.3a, 400.7). The cards are
  // "exiled with it" for its "+2/+2 for each card exiled with it" (CR 607.2a), only while each stays in exile (rulings).
  if (line === "When ~ enters, exile any number of other nontoken creatures you control until it leaves the battlefield.") {
    const t = parseTrigger("When ~ enters, exile any number of other nontoken creatures you control until ~ leaves the battlefield.");
    const [pick, ex] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.effects.length !== 2 || pick?.type !== "pick" || !pick.anyNumber || pick.action !== "choose" || pick.who.ref !== "you" || ex?.type !== "exile" || ex.until !== "sourceLeaves" || ex.what.ref !== "created") {
      out.unsupported.push(raw);
      return true;
    }
    // Nothing to choose once ~ has left (the exile would do nothing, CR 610.3c).
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ type: "if", cond: { kind: "selfHere" }, effects: [pick, { ...ex, linked: true }] }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Auratouched Mage: "When ~ enters, search your library for an Aura card that could enchant it. If ~ is still on the
  // battlefield, put that Aura card onto the battlefield attached to it. Otherwise, reveal the Aura card and put it into
  // your hand. Then shuffle.": an Aura that could enchant ~ as it is, or as it last existed on the battlefield once it has
  // left (rulings, CR 608.2h); nothing can move ~ in the middle of the resolution, so where ~ is decides it from the start.
  // A search for a card with a stated quality may find nothing (CR 701.23b); the library is shuffled either way.
  if (line === "When ~ enters, search your library for an Aura card that could enchant it. If ~ is still on the battlefield, put that Aura card onto the battlefield attached to it. Otherwise, reveal the Aura card and put it into your hand. Then shuffle.") {
    const t = parseTrigger("When ~ enters, draw a card.");
    if (!t || t === "fail" || t.event !== "selfEnters") {
      out.unsupported.push(raw);
      return true;
    }
    const attach: Effect = { type: "search", filter: AURA_CARD, n: 1, upTo: false, reveal: false, dest: { zone: "battlefield", attachTo: { ref: "self" } }, couldEnchantDest: true };
    const toHand: Effect = { type: "search", filter: AURA_CARD, n: 1, upTo: false, reveal: true, dest: { zone: "hand" }, couldEnchantSelfGone: true };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "if", cond: { kind: "selfHere" }, effects: [attach], otherwise: [toHand] }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Storm Herald: "When ~ enters, return any number of Aura cards from your graveyard to the battlefield attached to creatures
  // you control. Exile those Auras at the beginning of your next end step. If those Auras would leave the battlefield, exile
  // them instead of putting them anywhere else.": only the Auras returned (rulings), a delayed trigger for each as the
  // permanent it became (CR 603.7, 400.7) and a replacement for each (CR 614.1a); an effect that exiles one first exiles it
  // itself, and one returned from there is a new object, free of both (rulings).
  if (line === "When ~ enters, return any number of Aura cards from your graveyard to the battlefield attached to creatures you control. Exile those Auras at the beginning of your next end step. If those Auras would leave the battlefield, exile them instead of putting them anywhere else.") {
    const t = parseTrigger("When ~ enters, draw a card.");
    if (!t || t === "fail" || t.event !== "selfEnters") {
      out.unsupported.push(raw);
      return true;
    }
    const effects: Effect[] = [
      { type: "aurasFromYardToYourCreatures" },
      { type: "delayed", when: "yourNextEndStep", of: { ref: "created" }, effects: [{ type: "exile", what: { ref: "subject" } }], text: "Exile that Aura" },
      { type: "exileIfLeaves", what: { ref: "created" } },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Liberated Livestock: "When ~ dies, create a 1/1 white Cat creature token with lifelink, a 1/1 white Bird creature token
  // with flying, and a 2/4 white Ox creature token. For each of those tokens, you may put an Aura card from your hand and/or
  // graveyard onto the battlefield attached to it.": the tokens made together, then an Aura for each (extra tokens a
  // replacement made too, rulings), one that can't legally enchant its token staying where it is (rulings, CR 303.4g).
  const livestock = /^(When ~ dies, create .+ token\.) For each of those tokens, you may put an Aura card from your hand and\/or graveyard onto the battlefield attached to it\.$/.exec(line);
  if (livestock) {
    const t = parseTrigger(livestock[1]!);
    const made = t && t !== "fail" ? t.body.effects : [];
    const tokens = made.length === 1 && made[0]!.type === "together" ? made[0]!.effects : made;
    if (!t || t === "fail" || t.event !== "selfDies" || t.body.targets.length || made.length !== 1 || !tokens.length || tokens.some((x) => x.type !== "createToken" || x.who.ref !== "you" || x.attachTo || x.tapped || x.attacking)) {
      out.unsupported.push(raw);
      return true;
    }
    const create: Effect[] = made.length === 1 && made[0]!.type === "together" ? [{ ...made[0]!, allCreated: true }] : made;
    out.triggers.push({ ...t, body: { targets: [], effects: [...create, { type: "auraOntoEachCreated" }], text: line.replace(/^When ~ dies, /, "") } });
    return true;
  }
  // Hans Eriksson: "Whenever ~ attacks, reveal the top card of your library. If it's a creature card, put it onto the
  // battlefield tapped and attacking defending player or a planeswalker they control. Otherwise, put that card into your
  // hand. When you put a creature card onto the battlefield this way, it fights ~.": the fight is a reflexive trigger
  // (CR 603.12, rulings) about the creature put there, which players may respond to; neither deals or is dealt damage if
  // either is gone or no longer a creature as it resolves (rulings, CR 701.14b).
  if (line === "Whenever ~ attacks, reveal the top card of your library. If it's a creature card, put it onto the battlefield tapped and attacking defending player or a planeswalker they control. Otherwise, put that card into your hand. When you put a creature card onto the battlefield this way, it fights ~.") {
    const t = parseTrigger("Whenever ~ attacks, draw a card.");
    const fight = parseBody("It fights ~.", { subjectIt: true });
    if (!t || t === "fail" || t.event !== "selfAttacks" || !fight || fight.effects.length !== 1 || fight.effects[0]!.type !== "fight") {
      out.unsupported.push(raw);
      return true;
    }
    const effects: Effect[] = [{ type: "revealTopAttackingOrHand" }, { type: "reflexive", about: "created", body: { ...fight, text: "It fights ~." } }];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^Whenever ~ attacks, /, "") } });
    return true;
  }
  return false;
}
