// Round 327's sentences, triggers and whole texts, read before round 326's (round326Sentence, round326Trigger and
// round326WholeText in oracle/round326.ts).
import type { AbilityBody, AmountExpr, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import { parseStaticCondition } from "./statics";
import { parseTrigger } from "./triggers";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round327Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void s, sentences, si, ctx, effects;
  return null;
}

export function round327Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Wild Pair: "Whenever a creature enters, if you cast it from your hand, you may search your library for a creature card
  // with the same total power and toughness, put it onto the battlefield, then shuffle.": anyone's creature you cast
  // from your hand (CR 603.4, checked again as it resolves); its power plus toughness as it is on the battlefield as this
  // resolves, or as it last existed if it has left (rulings); "same total": any split of that sum (rulings).
  if (raw === "Whenever a creature enters, if you cast it from your hand, you may search your library for a creature card with the same total power and toughness, put it onto the battlefield, then shuffle.") {
    const t = parseTrigger("Whenever a creature enters, you may search your library for a creature card, put it onto the battlefield, then shuffle.");
    const may = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const search = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    if (!t || t === "fail" || t.ifCond || t.event !== "permanentEnters" || search?.type !== "search" || !search.filter || search.filter.bound) return "fail";
    const sum: AmountExpr = { count: { kind: "sum", of: [{ kind: "power", of: { ref: "subject" } }, { kind: "toughness", of: { ref: "subject" } }] } };
    const filter: TargetSpec = { ...search.filter, bound: { key: "totalPT", at: "exact", amount: sum }, text: "creature card with the same total power and toughness" };
    const text = raw.replace(/^Whenever a creature enters, if you cast it from your hand, /, "");
    return { ...t, ifCond: { kind: "subjectCastFromHand", byYou: true }, body: { ...t.body, effects: [{ ...may!, effects: [{ ...search, filter }], text: text.replace(/^you may /, "").replace(/\.$/, "") } as Effect], text } };
  }
  return null;
}

const creature = (text: string): TargetSpec => ({ kind: "object", types: ["Creature"], text });

/** A whole ability's text read another way (a string), or null. */
export function round327WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  void parse;
  const t = text.trim();
  // The Nipton Lottery: "Choose a creature at random. You gain control of that creature until end of turn. Untap it. It
  // gains haste until end of turn. Then destroy all other creatures.": any player's creature, not targeted (hexproof and
  // shroud don't matter), chosen as it resolves with nothing in between (rulings); then every creature but that one is
  // destroyed at once. With no creature, nothing is chosen and nothing destroyed.
  if (t === "Choose a creature at random. You gain control of that creature until end of turn. Untap it. It gains haste until end of turn. Then destroy all other creatures.") {
    const chosen = { ref: "created" } as const;
    return {
      targets: [],
      effects: [
        { type: "chooseRandom", filter: creature("a creature") },
        { type: "continuous", what: chosen, mods: [{ kind: "control" }], duration: "endOfTurn" },
        { type: "untap", what: chosen },
        { type: "continuous", what: chosen, mods: [{ kind: "addKeywords", keywords: ["Haste"] }], duration: "endOfTurn" },
        { type: "destroy", what: { ref: "each", filter: creature("all other creatures"), notCreated: true } },
      ],
      text: t,
    };
  }
  // Retraced Image: "Reveal a card in your hand, then put that card onto the battlefield if it has the same name as a
  // permanent." (effect revealPutIfNamedAsPermanent).
  if (t === "Reveal a card in your hand, then put that card onto the battlefield if it has the same name as a permanent.") return { targets: [], effects: [{ type: "revealPutIfNamedAsPermanent" }], text: t };
  // Mitotic Manipulation: "Look at the top seven cards of your library. You may put one of those cards onto the
  // battlefield if it has the same name as a permanent. Put the rest on the bottom of your library in any order.": only
  // one, however many match, named like a permanent on the battlefield as it resolves (rulings); a permanent card, as
  // no other card can be put onto the battlefield (CR 400.4a).
  const mitotic = /^(Look at the top (?:[a-z]+) cards of your library\.) You may put one of those cards onto the battlefield if it has the same name as a permanent\. (Put the rest on the bottom of your library in any order\.)$/.exec(t);
  if (mitotic) {
    const body = parse(`${mitotic[1]} You may put a permanent card from among them onto the battlefield. ${mitotic[2]}`);
    const dig = body?.effects.length === 1 ? body.effects[0] : undefined;
    if (!body || body.targets.length || dig?.type !== "dig" || dig.into !== "battlefield" || dig.count !== 1 || !dig.upTo || !dig.filter || dig.filter.kind !== "card") return null;
    return { ...body, effects: [{ ...dig, filter: { ...dig.filter, sameNameAsPermanent: true, text: "card with the same name as a permanent" } }], text: t };
  }
  // See the Unwritten: "Reveal the top eight cards of your library. You may put a creature card from among them onto the
  // battlefield. Put the rest into your graveyard." and "Ferocious — If you control a creature with power 4 or greater,
  // you may put two creature cards onto the battlefield instead of one.": checked as it resolves, before any is put
  // (rulings); the two enter at the same time.
  const unwritten = /^(Reveal the top (?:[a-z]+) cards of your library\. You may put a creature card from among them onto the battlefield\. Put the rest into your graveyard\.) If (you control a creature with power 4 or greater), you may put two creature cards onto the battlefield instead of one\.$/.exec(t);
  if (unwritten) {
    const body = parse(unwritten[1]!);
    const dig = body?.effects.length === 1 ? body.effects[0] : undefined;
    const cond = parseStaticCondition(unwritten[2]!, { affects: { kind: "self" }, mods: [], text: "" });
    if (!body || body.targets.length || !cond || dig?.type !== "dig" || dig.into !== "battlefield" || dig.count !== 1 || !dig.upTo || dig.rest !== "graveyard" || dig.countIfCond || dig.kickedCount !== undefined) return null;
    return { ...body, effects: [{ ...dig, countIfCond: { cond, count: 2 } }], text: t };
  }
  // Fated Clash: "Target creature you control and target creature an opponent controls each gain indestructible until end
  // of turn. Then destroy all creatures.": each target that's still legal gains it (CR 608.2b); with neither legal, the
  // spell doesn't resolve.
  const clash = /^(Target creature you control) and (target creature an opponent controls) each gain (indestructible) until end of turn\. (Then destroy all creatures\.)$/.exec(t);
  if (clash) return `${clash[1]} gains ${clash[3]} until end of turn. ${clash[2]!.charAt(0).toUpperCase()}${clash[2]!.slice(1)} gains ${clash[3]} until end of turn. ${clash[4]}`;
  // Delirium (after "Cast this spell only during an opponent's turn."): "Tap target creature that player controls. That
  // creature deals damage equal to its power to the player. Prevent all combat damage that would be dealt to and dealt
  // by the creature this turn.": "that player" is the opponent whose turn it is, the active player (the creature must
  // still be theirs as it resolves, CR 608.2b); a tapped creature can be the target (rulings: tapping isn't a cost).
  if (t === "Tap target creature that player controls. That creature deals damage equal to its power to the player. Prevent all combat damage that would be dealt to and dealt by the creature this turn.") {
    const it = { ref: "target", index: 0 } as const;
    return {
      targets: [{ kind: "object", types: ["Creature"], activeController: true, text: "target creature the player whose turn it is controls" }],
      effects: [
        { type: "tap", what: it },
        { type: "damage", amount: { count: { kind: "power", of: it } }, to: { ref: "activePlayer" }, by: { target: 0 } },
        { type: "continuous", what: it, mods: [{ kind: "preventDamage", to: true, by: true, combat: "only" }], duration: "endOfTurn" },
      ],
      text: t,
    };
  }
  // Push the Limit: "Return all Mount and Vehicle cards from your graveyard to the battlefield. Sacrifice them at the
  // beginning of the next end step." then "Vehicles you control become artifact creatures until end of turn. Creatures you
  // control gain haste until end of turn.": a card with either subtype; the Vehicles and creatures you control then,
  // those returned included, are the ones affected (CR 611.2c).
  const limit = /^Return all Mount and Vehicle cards from your graveyard to the battlefield\. (Sacrifice them at the beginning of the next end step\.) (Vehicles you control become artifact creatures until end of turn\. Creatures you control gain haste until end of turn\.)$/.exec(t);
  if (limit) {
    const first = parse(`Return all creature cards from your graveyard to the battlefield. ${limit[1]}`);
    const then = parse(limit[2]!);
    const back = first?.effects[0];
    if (!first || !then || first.targets.length || then.targets.length || first.effects.length !== 2 || then.effects.length !== 2 || back?.type !== "returnAllFromGraveyard" || back.toHand || back.who.ref !== "you" || back.filter.types?.join() !== "Creature") return null;
    return { targets: [], effects: [{ ...back, filter: { kind: "card", subtypes: ["Mount", "Vehicle"], text: "Mount and Vehicle cards" } }, ...first.effects.slice(1), ...then.effects], text: t };
  }
  return null;
}
