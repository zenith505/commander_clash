// Lane B round B205's lines, read by compileCard before its triggers and activated abilities (after round B204's), and its
// whole spells, read after round B204's.
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";
import { roundB206Spell } from "./laneb206";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB205Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Don & Leo, Problem Solvers: "At the beginning of your end step, exile up to one target artifact you control and up to
  // one target creature you control. Then return them to the battlefield under their owners' control.": two targets, the
  // same artifact creature allowed for both (CR 115.3: two uses of the word "target"), exiled at once, then returned at
  // once under their owners' control, each a new object (CR 400.7, rulings); one chosen twice is exiled and returned once,
  // a token not at all (CR 111.7, rulings).
  if (line === "At the beginning of your end step, exile up to one target artifact you control and up to one target creature you control. Then return them to the battlefield under their owners' control.") {
    const t = parseTrigger("At the beginning of your end step, exile up to two target creatures you control, then return them to the battlefield under their owners' control.");
    const [flicker] = t && t !== "fail" ? t.body.effects : [];
    const [first, second] = t && t !== "fail" ? t.body.targets : [];
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.ifCond || t.body.effects.length !== 1 || t.body.targets.length !== 2 || flicker?.type !== "flicker" || flicker.what.ref !== "target" || flicker.what.index !== 0 || flicker.what.n !== 2 || flicker.under !== "owner" || first?.kind !== "object" || second?.kind !== "object" || !first.optional || !second.optional || first.controller !== "you") {
      out.unsupported.push(raw);
      return true;
    }
    const { distinctFrom: _same, ...creature } = second;
    const targets: TargetSpec[] = [{ ...first, types: ["Artifact"], text: "target artifact you control" }, creature];
    out.triggers.push({ ...t, body: { targets, effects: [flicker], text: line.replace(/^At the beginning of your end step, /, "") } });
    return true;
  }
  // Captain Marvel, Apex Avenger: "Whenever you put one or more counters on another creature, if it's not a Kree, you may
  // put the same number and kind of counters on ~.": once for each kind put on each creature at once (CR 122.6, as with
  // Bold Plagiarist), that kind and that many; the creature not a Kree as it triggers and as it resolves, or as it last
  // existed if it's gone (CR 603.4, 608.2h).
  if (line === "Whenever you put one or more counters on another creature, if it's not a Kree, you may put the same number and kind of counters on ~.") {
    const t = parseTrigger("Whenever you put one or more counters on another creature, you may put a +1/+1 counter on ~.");
    const [may] = t && t !== "fail" ? t.body.effects : [];
    const put = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    if (!t || t === "fail" || may?.type !== "may" || t.event !== "permanentCountersPut" || !t.countersByYou || !t.tappedFilter?.notSource || t.ifCond || t.body.effects.length !== 1 || put?.type !== "counters" || put.what.ref !== "self") {
      out.unsupported.push(raw);
      return true;
    }
    const same: Effect = { ...put, eventCounter: true, n: { count: { kind: "eventAmount" } } };
    out.triggers.push({ ...t, ifCond: { kind: "not", cond: { kind: "subjectType", subtype: "Kree" } }, body: { targets: [], effects: [{ ...may, effects: [same], text: "put the same number and kind of counters on ~" }], text: "if it's not a Kree, you may put the same number and kind of counters on ~." } });
    return true;
  }
  // Knickknack Ouphe: "When ~ enters, reveal the top X cards of your library. You may put any number of Aura cards with
  // mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto
  // the battlefield on the bottom of your library in a random order.": X is what was paid for it as a spell, 0 otherwise
  // (CR 107.3m); an Aura enchants what you choose as it enters, not a target, and one with nothing to enchant can't be put
  // there (CR 303.4f, 303.4g, rulings).
  if (line === "When ~ enters, reveal the top X cards of your library. You may put any number of Aura cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield on the bottom of your library in a random order.") {
    const t = parseTrigger("When ~ enters, reveal the top X cards of your library. Put any number of Aura cards from among them onto the battlefield and the rest on the bottom of your library in a random order.");
    const [dig] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "selfEnters" || t.ifCond || t.body.effects.length !== 1 || dig?.type !== "dig" || typeof dig.n !== "object" || !("count" in dig.n) || dig.n.count.kind !== "x" || dig.into !== "battlefield" || !dig.upTo || dig.rest !== "bottom" || !dig.random || dig.filter?.kind !== "card" || dig.filter.subtypes?.join() !== "Aura") {
      out.unsupported.push(raw);
      return true;
    }
    const filter: TargetSpec = { ...dig.filter, xRange: { key: "manaValue", at: "most" }, text: "Aura card with mana value X or less" };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ ...dig, filter }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  return false;
}

/** Round B205's whole spells, read after round B204's: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB205Spell(text: string): AbilityBody | null | undefined {
  // Suspend Aggression: "Exile target nonland permanent and the top card of your library. For each of those cards, its
  // owner may play it until the end of their next turn.": both exiled as it resolves, nothing if the target is illegal
  // (CR 608.2b, rulings); each card's owner may play it with the usual costs and timing (rulings, a land as their land play,
  // CR 305.2) until their next turn ends, not the turn it's cast in even if that's theirs; a token can't be played.
  if (text === "Exile target nonland permanent and the top card of your library. For each of those cards, its owner may play it until the end of their next turn.") {
    const body = parseBody("Exile target nonland permanent. For as long as that card remains exiled, its owner may play it.", { spell: true });
    const [exile] = body?.effects ?? [];
    if (!body || body.targets.length !== 1 || body.effects.length !== 1 || exile?.type !== "exile" || exile.what.ref !== "target" || !exile.ownerMay?.play || exile.ownerMay.free || exile.ownerMay.more || exile.ownerMay.until) return null;
    const effects: Effect[] = [
      { ...exile, ownerMay: { ...exile.ownerMay, until: "nextTurn" } },
      { type: "impulse", n: 1, until: "nextTurn" },
    ];
    return { ...body, effects, text };
  }
  // Too Evil to Stay Dead: "Choose target creature card in your graveyard with mana value 4 or less. If ~ was cast using
  // teamwork, instead choose target creature card in your graveyard. Return the chosen card to the battlefield.": one
  // target or the other, whichever teamwork allows, decided as it's cast before its targets (CR 601.2b-c), as Expel the
  // Unworthy's kicker; the card returns under your control (CR 110.2a).
  if (text === "Choose target creature card in your graveyard with mana value 4 or less. If ~ was cast using teamwork, instead choose target creature card in your graveyard. Return the chosen card to the battlefield.") {
    const body = parseBody("Return target creature card with mana value 4 or less from your graveyard to the battlefield. Return target creature card from your graveyard to the battlefield.", { spell: true });
    const [small, any] = body?.effects ?? [];
    const [t0, t1] = body?.targets ?? [];
    if (!body || body.targets.length !== 2 || body.effects.length !== 2 || small?.type !== "putOntoBattlefield" || any?.type !== "putOntoBattlefield" || small.what.ref !== "target" || small.what.index !== 0 || any.what.ref !== "target" || any.what.index !== 1 || t0?.kind !== "card" || t1?.kind !== "card" || t0.manaValue?.max !== 4 || t1.manaValue) return null;
    const targets: TargetSpec[] = [
      { ...t0, text: "target creature card in your graveyard with mana value 4 or less", onlyIf: { cond: { kind: "teamwork" }, not: true } },
      { ...t1, text: "target creature card in your graveyard", onlyIf: { cond: { kind: "teamwork" } } },
    ];
    return { targets, effects: [{ type: "if", cond: { kind: "teamwork" }, effects: [any], otherwise: [small] }], text };
  }
  // Earth's Mightiest Heroes: "Reveal the top eight cards of your library. You may put a creature card from among them onto
  // the battlefield. If ~ was cast using teamwork, put any number of creature cards from among them onto the battlefield
  // instead. Put the rest into your graveyard.": one or any number, by whether its teamwork cost was paid (CR 702.194b),
  // entering together (CR 608.2f).
  if (text === "Reveal the top eight cards of your library. You may put a creature card from among them onto the battlefield. If ~ was cast using teamwork, put any number of creature cards from among them onto the battlefield instead. Put the rest into your graveyard.") {
    const one = parseBody("Reveal the top eight cards of your library. You may put a creature card from among them onto the battlefield. Put the rest into your graveyard.", { spell: true });
    const many = parseBody("Reveal the top eight cards of your library. You may put any number of creature cards from among them onto the battlefield. Put the rest into your graveyard.", { spell: true });
    const [a] = one?.effects ?? [];
    const [b] = many?.effects ?? [];
    if (!one || !many || one.targets.length || many.targets.length || one.effects.length !== 1 || many.effects.length !== 1 || a?.type !== "dig" || b?.type !== "dig" || a.count !== 1 || b.count !== 99 || a.into !== "battlefield" || b.into !== "battlefield" || a.rest !== "graveyard" || b.rest !== "graveyard") return null;
    return { targets: [], effects: [{ type: "if", cond: { kind: "teamwork" }, effects: [b], otherwise: [a] }], text };
  }
  return roundB206Spell(text);
}
