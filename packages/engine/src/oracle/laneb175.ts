// Lane B round B175's lines, read by compileCard before its triggers and activated abilities (after round B174's), and
// its sentences, read at the end of round B174's.
import type { CompiledCard, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseActivated } from "./activated";
import { parseAdditionalCost } from "./keyword-abilities";
import { parseBecomes } from "./sentence";
import { parseConditionalStatic, parseStatic, parseStaticCondition } from "./statics";
import { parseTrigger } from "./triggers";
import { roundB176Sentence } from "./laneb176";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB175Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Seton's Desire: "Threshold — As long as there are seven or more cards in your graveyard, all creatures able to block
  // enchanted creature do so.": Lure's blocking requirement (CR 509.1c) while the condition holds; a creature that can't
  // block it, or would have to pay a cost to, doesn't have to (rulings).
  const lure = /^(?:[A-Z][a-z]+ — )?As long as ([^,]+), all creatures able to block (enchanted|equipped) creature do so\.$/.exec(line);
  if (lure) {
    const base = parseStatic(`All creatures able to block ${lure[2]} creature do so.`);
    const probe = parseConditionalStatic(`As long as ${lure[1]}, ${lure[2]} creature has flying.`);
    if (!base || base.condition || !probe?.condition || probe.affects.kind !== "attached") out.unsupported.push(raw);
    else out.statics.push({ ...base, condition: probe.condition, text: line });
    return true;
  }
  // Grand Master of Flowers: "As long as ~ has seven or more loyalty counters on ~, he's a 7/7 Dragon God creature with
  // flying and indestructible.": his card types become just creature, so he isn't a planeswalker then (CR 205.1a, rulings:
  // he can't be attacked, and damage to him is marked, not taken off his loyalty, CR 120.3), still legendary (CR 205.4);
  // his loyalty abilities can still be activated (CR 606.3, rulings). A characteristic-changing effect in layers 4, 6 and 7b
  // (CR 613.1d, f, 613.4b) while the condition holds.
  const pwBeast = /^As long as ~ has (seven|six|five|four|three) or more loyalty counters on (?:~|him|her|it), (?:he|she|it|~)(?:'s| is) (an? \d+\/\d+ (?:[A-Z][a-z]+ )+creature with [a-z ,]+)\.$/.exec(line);
  if (pwBeast) {
    const mods = parseBecomes(pwBeast[2]!);
    const self = { affects: { kind: "self" as const }, mods: mods ?? [], text: line };
    const condition = parseStaticCondition(`~ has ${pwBeast[1]} or more loyalty counters on it`, self);
    if (!mods || mods[0]?.kind !== "setTypes" || mods.some((m) => m.kind === "setColors") || condition?.kind !== "selfCounters") out.unsupported.push(raw);
    else out.statics.push({ ...self, condition });
    return true;
  }
  // Torrent Elemental: "{3}{B/G}{B/G}: Put ~ from exile onto the battlefield tapped. Activate only as a sorcery.": it works
  // only while the card is in exile (CR 113.6m), face up there (a face-down card has no abilities, CR 406.3, 708.2), by
  // its owner (CR 108.4a, 602.1); moved before it resolves, it's a new object and stays where it is (CR 400.7).
  const fromExile = /^((?:\{[^}]+\})+): Put ~ from exile onto the battlefield( tapped)?\.( Activate only as a sorcery\.)?$/.exec(line);
  if (fromExile) {
    const a = parseActivated(`${fromExile[1]}: Return ~ from your graveyard or from exile to the battlefield${fromExile[2] ?? ""}.${fromExile[3] ?? ""}`);
    if (!a || a === "fail" || a.zone !== "graveyard" || !a.orExile || a.tap || a.sacrificeSelf) out.unsupported.push(raw);
    else out.activated.push({ ...a, onlyExile: true, body: { ...a.body, text: `Put ~ from exile onto the battlefield${fromExile[2] ?? ""}.` }, text: line });
    return true;
  }
  // Sevinne, the Chronoclasm: "Whenever you cast your first instant or sorcery spell from your graveyard each turn, ...":
  // the first of your instant and sorcery spells this turn cast from your graveyard, counting those cast before ~ was on
  // the battlefield (rulings); a copy isn't cast (CR 707.10).
  const firstFromYard = /^Whenever you cast your first (instant or sorcery) spell from your graveyard each turn, (.+)$/.exec(line);
  if (firstFromYard) {
    const t = parseTrigger(`Whenever you cast an ${firstFromYard[1]} spell from your graveyard, ${firstFromYard[2]}`);
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.from !== "ownGraveyard" || t.cast.nth || t.cast.orCopy) out.unsupported.push(raw);
    else out.triggers.push({ ...t, cast: { ...t.cast, nth: 1, nthFromOwnGraveyard: true } });
    return true;
  }
  // Ian the Reckless: "Whenever ~ attacks, if it's modified, you may have it deal damage equal to its power to you and any
  // target.": one damage event to both (CR 120.3), the amount its power as the ability resolves, or as it last existed if
  // it has left (rulings); an intervening if (CR 603.4).
  const youAnd = /^(Whenever ~ attacks, if it's modified, you may have it deal damage equal to its power) to you and (any target)\.$/.exec(line);
  if (youAnd) {
    const t = parseTrigger(`${youAnd[1]} to ${youAnd[2]}.`);
    const may = t && t !== "fail" ? t.body.effects[0] : undefined;
    const dmg = may?.type === "may" ? may.effects[0] : undefined;
    if (!t || t === "fail" || t.body.effects.length !== 1 || may?.type !== "may" || may.effects.length !== 1 || dmg?.type !== "damage" || dmg.to.ref !== "anyTarget") out.unsupported.push(raw);
    else {
      const both: Effect = { ...may, effects: [dmg, { type: "damage", amount: dmg.amount, to: { ref: "you" }, sameEvent: true }], text: may.text.replace(" to any target", " to you and any target") };
      out.triggers.push({ ...t, body: { ...t.body, effects: [both], text: t.body.text.replace(" to any target", " to you and any target") } } as TriggeredAbility);
    }
    return true;
  }
  // Thrill-Kill Disciple: "Squad—{1}, Discard a card.": a squad cost of mana and a discard (CR 702.157a, 118.8), paid like
  // multikicker, a card discarded for each time it's paid.
  const squadDiscard = /^Squad—((?:\{[^}]+\})+), (Discard (?:a|one) card)\.$/.exec(line);
  if (squadDiscard) {
    const cost = parseAdditionalCost(squadDiscard[2]!.replace(/^D/, "d"));
    if (out.kicker || cost?.kind !== "discard" || cost.n !== 1 || cost.filter || cost.random) out.unsupported.push(raw);
    else {
      out.kicker = { costs: [squadDiscard[1]!], multi: true, squad: true, extraCosts: [cost], text: `${squadDiscard[1]}, discard a card` };
      out.triggers.push({ event: "selfEnters", ifKicked: { kind: "kicked" }, body: { targets: [], effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: { count: { kind: "kicked" } }, what: { ref: "self" } }], text: "Squad: create a token that's a copy of ~ for each time its squad cost was paid." } });
    }
    return true;
  }
  return false;
}

export function roundB175Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Fatal Fissure: "Choose target creature. When that creature dies this turn, you earthbend 4.": a delayed trigger about
  // the target (CR 603.7), for the rest of this turn, whatever makes it die; earthbend's land is that trigger's own target,
  // chosen as it's put on the stack (CR 603.3d, 701.68a).
  const diesBend = /^When that creature dies this turn, you earthbend (\d+)$/.exec(s);
  if (diesBend && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]!.many) {
    const n = Number(diesBend[1]);
    return {
      effect: {
        type: "delayed",
        when: "dies",
        of: { ref: "target", index: ctx.lastObjectTarget },
        thisTurn: true,
        targets: [{ kind: "object", types: ["Land"], controller: "you", text: "target land you control" }],
        effects: [{ type: "earthbend", what: { ref: "target", index: 0 }, n }],
        text: `you earthbend ${n}`,
      },
      next: si + 1,
    };
  }
  return roundB176Sentence(s, sentences, si, ctx, effects);
}
