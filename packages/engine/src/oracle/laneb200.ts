// Lane B round B200's lines, read by compileCard before its triggers and activated abilities (after round B199's), its
// sentences, read at the end of round B197's chain, and its whole spells, read after round B197's.
import type { AbilityBody, CompiledCard, Effect, Modification } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";
import { parseBody } from "./body";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB200Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Tenth District Hero: "{2}{W}, Collect evidence 4: If ~ is a Detective, it becomes a legendary creature named Mileva, the
  // Stalwart, it has base power and toughness 5/5, and it gains "Other creatures you control have indestructible."": its
  // creature types checked as it resolves (rulings); with no duration, for as long as it stays on the battlefield (CR 611.2a,
  // rulings): legendary, still a creature with its creature types (CR 205.1b, 205.4b), the new name (layer 3, CR 613.1c),
  // base 5/5 (layer 7b, overwriting only earlier setting effects, rulings) and the static ability (layer 6).
  const mileva = /^(\{2\}\{W\}, Collect evidence 4): If ~ is a Detective, it becomes a legendary creature named (Mileva, the Stalwart), it has base power and toughness 5\/5, and it gains ("Other creatures you control have indestructible\.")$/.exec(line);
  if (mileva) {
    const a = parseActivated(`${mileva[1]}: If ~ is a Detective, ~ gains ${mileva[3]}`);
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const inner = e?.type === "if" && e.effects.length === 1 ? e.effects[0] : undefined;
    const cond = e?.type === "if" ? e.cond : undefined;
    if (!a || a === "fail" || a.body.targets.length || cond?.kind !== "state" || cond.cond.kind !== "selfIs" || inner?.type !== "continuous" || inner.what.ref !== "self" || inner.duration !== "game" || inner.mods.length !== 1 || inner.mods[0]!.kind !== "addAbility" || !(a.costs ?? []).some((c) => c.kind === "collectEvidence")) {
      out.unsupported.push(raw);
      return true;
    }
    const mods: Modification[] = [
      { kind: "addTypes", types: ["Creature"], subtypes: [], supertypes: ["Legendary"] },
      { kind: "setName", name: mileva[2]! },
      { kind: "setPT", power: 5, toughness: 5 },
      inner.mods[0]!,
    ];
    const text = line.replace(/^[^:]+: /, "");
    out.activated.push({ ...a, text: line, body: { ...a.body, effects: [{ ...e!, effects: [{ ...inner, mods }] } as Effect], text } });
    return true;
  }
  // Livio, Oathsworn Sentinel: "{1}{W}: Choose another target creature. Its controller may exile it with an aegis counter on
  // it.": that creature's controller decides as it resolves; the counter goes on the card in exile (CR 122.1), and a token
  // that's exiled ceases to exist (CR 111.7).
  if (line === "{1}{W}: Choose another target creature. Its controller may exile it with an aegis counter on it.") {
    const a = parseActivated("{1}{W}: Exile another target creature.");
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || a.body.targets.length !== 1 || e?.type !== "exile" || e.what.ref !== "target" || e.what.index !== 0 || Object.keys(e).length !== 2) {
      out.unsupported.push(raw);
      return true;
    }
    const may: Effect = { type: "may", decider: { ref: "targetController", index: 0 }, effects: [{ ...e, counters: { aegis: 1 } }], text: "exile it with an aegis counter on it" };
    out.activated.push({ ...a, text: line, body: { ...a.body, effects: [may], text: line.replace(/^\{1\}\{W\}: /, "") } });
    return true;
  }
  // Its "{2}{W}, {T}: Return all exiled cards with aegis counters on them to the battlefield under their owners' control.":
  // every face-up card in any exile zone with one, whoever exiled it (rulings), all at once.
  if (line === "{2}{W}, {T}: Return all exiled cards with aegis counters on them to the battlefield under their owners' control.") {
    const a = parseActivated("{2}{W}, {T}: Draw a card.");
    if (!a || a === "fail" || !a.tap || (a.costs ?? []).length) out.unsupported.push(raw);
    else out.activated.push({ ...a, text: line, body: { targets: [], effects: [{ type: "returnExiledWithCounter", counter: "aegis" }], text: line.replace(/^\{2\}\{W\}, \{T\}: /, "") } });
    return true;
  }
  // Yannik, Scavenging Sentinel: "When ~ enters, exile another creature you control until ~ leaves the battlefield. When you
  // do, distribute X +1/+1 counters among any number of target creatures, where X is the exiled creature's power.": the
  // creature chosen as it resolves, not targeted, and nothing exiled if ~ has left (rulings, CR 610.3c); the reflexive
  // trigger (CR 603.12) only if one was exiled, X its power as it last existed on the battlefield (rulings, CR 608.2h), the
  // counters divided as it's put on the stack, at least one each (CR 601.2d), zero targets allowed (rulings).
  if (line === "When ~ enters, exile another creature you control until ~ leaves the battlefield. When you do, distribute X +1/+1 counters among any number of target creatures, where X is the exiled creature's power.") {
    const t = parseTrigger("When ~ enters, sacrifice another creature. When you do, distribute X +1/+1 counters among any number of target creatures, where X is the sacrificed creature's power.");
    const [pick, guard] = t && t !== "fail" ? t.body.effects : [];
    const refl = guard?.type === "if" && guard.effects.length === 1 ? guard.effects[0] : undefined;
    const sacPower = '{"count":{"kind":"power","of":{"ref":"sacrificed"}}}';
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.effects.length !== 2 || t.body.targets.length || pick?.type !== "pick" || pick.action !== "sacrifice" || pick.who.ref !== "you" || !pick.filter.notSource || guard?.type !== "if" || guard.cond.kind !== "sacrificedThisWay" || refl?.type !== "reflexive" || !refl.sacrificed || JSON.stringify(refl.body).split(sacPower).length !== 3) {
      out.unsupported.push(raw);
      return true;
    }
    const { sacrificed: _s, ...reflRest } = refl;
    const body: AbilityBody = { ...JSON.parse(JSON.stringify(refl.body).split(sacPower).join('{"count":{"kind":"x"}}')), text: "Distribute X +1/+1 counters among any number of target creatures, where X is the exiled creature's power." };
    const effects: Effect[] = [
      { ...pick, action: "exile", untilSourceLeaves: true, filter: { ...pick.filter, controller: "you", text: "other creature you control" } },
      { type: "if", cond: { kind: "exiledThisWay" }, effects: [{ ...reflRest, body, xAmount: { count: { kind: "exiledPowerOf", who: { ref: "you" } } } }] },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Arcane Artisan: "{2}{U}, {T}: Target player draws a card, then exiles a card from their hand. If a creature card is
  // exiled this way, that player creates a token that's a copy of that card.": the player chooses the card (CR 701.9a-like,
  // not a discard), the token a copy of it as it is in exile, X as 0 (rulings, CR 707.2, 107.3).
  if (line === "{2}{U}, {T}: Target player draws a card, then exiles a card from their hand. If a creature card is exiled this way, that player creates a token that's a copy of that card.") {
    const a = parseActivated("{2}{U}, {T}: Target player draws a card.");
    const b = parseActivated("{2}{U}, {T}: Target player exiles a card from their hand.");
    const draw = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const ex = b && b !== "fail" && b.body.effects.length === 1 ? b.body.effects[0] : undefined;
    if (!a || a === "fail" || !a.tap || a.body.targets.length !== 1 || a.body.targets[0]!.kind !== "player" || draw?.type !== "draw" || draw.who.ref !== "target" || ex?.type !== "discard" || !ex.exile || ex.who.ref !== "target" || ex.n !== 1 || Object.keys(ex).length !== 4) {
      out.unsupported.push(raw);
      return true;
    }
    const creature = { kind: "card" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
    const copy: Effect = { type: "if", cond: { kind: "exiledFromHandIs", filter: creature }, effects: [{ type: "createTokenCopy", who: { ref: "target", index: 0 }, n: 1, what: { ref: "exiledFromHand" } }] };
    out.activated.push({ ...a, text: line, body: { ...a.body, effects: [draw, ex, copy], text: line.replace(/^\{2\}\{U\}, \{T\}: /, "") } });
    return true;
  }
  // Its "When ~ leaves the battlefield, exile all tokens created with it at the beginning of the next end step.".
  if (line === "When ~ leaves the battlefield, exile all tokens created with it at the beginning of the next end step.") {
    const t = parseTrigger("When ~ leaves the battlefield, draw a card.");
    if (!t || t === "fail" || t.event !== "selfLeaves") out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "exileCreatedWithAtEndStep" }], text: line.replace(/^When ~ leaves the battlefield, /, "") } });
    return true;
  }
  return false;
}

/** Round B200's sentences, read at the end of round B197's chain. */
export function roundB200Sentence(_s: string, _sentences: string[], _si: number, _ctx: Ctx, _effects: Effect[]): Found {
  return null;
}

/** A whole spell's text read at once; undefined when it isn't one of these, null when it is but fails. */
export function roundB200Spell(text: string): AbilityBody | null | undefined {
  // Sudden Salvation: "Choose up to three target permanent cards in graveyards that were put there from the battlefield this
  // turn. Return them to the battlefield tapped under their owners' control. You draw a card for each opponent who controls
  // one or more of those permanents.": any graveyards, the cards' owners' (CR 108.3); the draw counts the opponents who
  // control a permanent this put onto the battlefield, as it resolves (CR 608.2c).
  if (text === "Choose up to three target permanent cards in graveyards that were put there from the battlefield this turn. Return them to the battlefield tapped under their owners' control. You draw a card for each opponent who controls one or more of those permanents.") {
    const body = parseBody("Return up to three target permanent cards in your graveyard that were put there from the battlefield this turn to the battlefield tapped.", { spell: true });
    const put = body?.effects.length === 1 ? body.effects[0] : undefined;
    if (!body || body.targets.length !== 3 || put?.type !== "putOntoBattlefield" || !put.tapped || put.owner || put.what.ref !== "target" || put.what.n !== 3 || body.targets.some((t) => t.kind !== "card" || t.owner !== "you" || !t.fromBattlefieldThisTurn || !t.optional)) return null;
    const targets = body.targets.map(({ owner: _you, ...t }) => ({ ...t, text: "target permanent card in a graveyard that was put there from the battlefield this turn" }));
    const draw: Effect = { type: "draw", who: { ref: "you" }, n: { count: { kind: "putThisWayOpponentControllers" } } };
    return { targets, effects: [{ ...put, owner: true }, draw], text };
  }
  // Fortunate Few: "Choose a nonland permanent you don't control, then each other player chooses a nonland permanent they don't
  // control that hasn't been chosen this way. Destroy all other nonland permanents.": chosen as it resolves, not targeted
  // (CR 608.2d), in the order the rulings give; lands aren't chosen or destroyed (rulings).
  if (text === "Choose a nonland permanent you don't control, then each other player chooses a nonland permanent they don't control that hasn't been chosen this way. Destroy all other nonland permanents.") {
    const body = parseBody("Destroy all nonland permanents.", { spell: true });
    const d = body?.effects.length === 1 ? body.effects[0] : undefined;
    if (!body || body.targets.length || d?.type !== "destroy" || d.what.ref !== "each" || Object.keys(d).length !== 2) return null;
    return { targets: [], effects: [{ type: "othersChooseDestroyRest", filter: { ...d.what.filter, text: "nonland permanent" } }], text };
  }
  return undefined;
}
