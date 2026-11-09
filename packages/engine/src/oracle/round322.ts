// Round 322's sentences and triggers, read before round 321's (round321Sentence and round321Trigger in oracle/round321.ts).
import type { Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { CREATURE_TYPES } from "../keywords";
import { parseSentence } from "./sentence";
import { parseTrigger } from "./triggers";
import { num } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round322Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void sentences;
  const prev = effects.at(-1);
  // Puca's Mischief: "exchange control of target nonland permanent you control and target nonland permanent an opponent
  // controls with equal or lesser mana value": the second's mana value at most the first's, the two chosen as a set (rulings),
  // checked again as it resolves (CR 608.2b); with either illegal then, no exchange (rulings, CR 701.12b).
  const lesser = /^([Yy]ou may )?([Ee]xchange control of target [a-z ]+ you control and target [a-z ]+ an opponent controls) with equal or lesser mana value$/.exec(s);
  if (lesser) {
    const before = ctx.targets.length;
    const fx = parseSentence(lesser[2]!.replace(/^e/, "E"), ctx);
    const swap = fx?.length === 1 ? fx[0] : undefined;
    if (swap?.type !== "exchangeControl" || swap.a.ref !== "target" || swap.b.ref !== "target" || ctx.targets.length !== before + 2 || swap.a.index !== before || swap.b.index !== before + 1) return "fail";
    const b = ctx.targets[swap.b.index]!;
    if (b.kind !== "object" || b.many || b.optional) return "fail";
    ctx.targets[swap.b.index] = { ...b, mvAtMostOf: [swap.a.index], text: `${b.text} with equal or lesser mana value` };
    return { effect: lesser[1] ? { type: "may", effects: [swap], text: s.replace(/^[Yy]ou may /, "") } : swap, next: si + 1 };
  }
  // Krothuss, Lord of the Deep: "create a tapped and attacking token that's a copy of another target attacking creature. If
  // that creature is a Kraken, Leviathan, Octopus, or Serpent, create two of those tokens instead.": the target's creature
  // types as it resolves (CR 608.2c), one or the other.
  const kinds = /^If that creature is an? ((?:[A-Z][a-z]+, )+or [A-Z][a-z]+|[A-Z][a-z]+), create (two|three) of those tokens instead$/.exec(s);
  if (kinds && prev?.type === "createTokenCopy" && prev.n === 1 && prev.what.ref === "target" && ctx.targets[prev.what.index]?.kind === "object") {
    const subtypes = kinds[1]!.split(/, (?:or )?/);
    if (!subtypes.every((x) => CREATURE_TYPES.has(x))) return "fail";
    effects.pop();
    const filter = { kind: "object" as const, types: [], notTypes: [], notColors: [], subtypes, text: `a ${kinds[1]!}` };
    return { effect: { type: "if", cond: { kind: "targetIs", index: prev.what.index, filter }, effects: [{ ...prev, n: num(kinds[2]!) }], otherwise: [prev] }, next: si + 1 };
  }
  return null;
}

export function round322Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Coveted Falcon: "Whenever this creature attacks, gain control of target permanent you own but don't control.": owned by
  // you, controlled by another player (every other player is an opponent, CR 102.3), for the rest of the game (layer 2).
  const owned = /^(Whenever ~ attacks, gain control of target permanent you own) but don't control\.$/.exec(raw);
  if (owned) {
    const t = parseTrigger(`${owned[1]!}.`);
    const spec = t && t !== "fail" ? t.body.targets[0] : undefined;
    if (!t || t === "fail" || t.body.targets.length !== 1 || spec?.kind !== "object" || spec.owner !== "you" || spec.controller || t.body.effects.length !== 1) return "fail";
    return { ...t, body: { ...t.body, targets: [{ ...spec, controller: "opponent", text: "target permanent you own but don't control" }], text: raw.replace(/^Whenever ~ attacks, /, "") } };
  }
  // Coveted Falcon: "When this creature is turned face up, target opponent gains control of any number of target permanents
  // you control. Draw a card for each one they gained control of this way.": each target still legal as it resolves (CR
  // 608.2b) given to that player for the rest of the game (layer 2); you draw one for each of them they now control.
  const given = /^(When ~ is turned face up), target opponent gains control of any number of target permanents you control\. Draw a card for each one they gained control of this way\.$/.exec(raw);
  if (given) {
    const t = parseTrigger(`${given[1]!}, Target opponent gains control of target permanent you control.`);
    const [opp, perm] = t && t !== "fail" ? t.body.targets : [];
    const e = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfTurnedFaceUp" || t.body.targets.length !== 2 || opp?.kind !== "player" || !opp.opponent || perm?.kind !== "object" || perm.controller !== "you" || t.body.effects.length !== 1 || e?.type !== "continuous" || e.giveTo?.ref !== "target" || e.what.ref !== "target" || e.what.index !== 1) return "fail";
    const draw: Effect = { type: "draw", who: { ref: "you" }, n: { count: { kind: "controlGivenThisWay", what: { ref: "target", index: 1 }, to: { ref: "target", index: 0 } } } };
    return { ...t, body: { targets: [opp, { ...perm, many: "any", text: "target permanent you control" }], effects: [e, draw], text: raw.replace(`${given[1]!}, `, "") } };
  }
  // Curse of Misfortunes: "At the beginning of your upkeep, you may search your library for a Curse card that doesn't have
  // the same name as a Curse attached to enchanted player, put it onto the battlefield attached to that player, then
  // shuffle.": not targeted; the names of the Curses attached to that player as it resolves (rulings), the Curse put onto
  // the battlefield attached to them if it could enchant them, else it stays in the library (CR 303.4f-g); no search, no
  // shuffle.
  const misfortunes = /^(At the beginning of your upkeep, you may search your library for a Curse card), that doesn't have the same name as a Curse attached to enchanted player(, put it onto the battlefield) attached to that player(, then shuffle\.)$/.exec(raw.replace(/ Curse card that/, " Curse card, that"));
  if (misfortunes) {
    const t = parseTrigger(`${misfortunes[1]!}${misfortunes[2]!} attached to target player${misfortunes[3]!}`);
    const may = t && t !== "fail" ? t.body.effects[0] : undefined;
    const sr = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourUpkeep" || t.body.targets.length !== 1 || t.body.effects.length !== 1 || may?.type !== "may" || sr?.type !== "search" || !sr.filter || sr.dest.attachToPlayer?.ref !== "target") return "fail";
    const curse = { kind: "object" as const, types: [], notTypes: [], notColors: [], subtypes: ["Curse"], text: "Curse attached to enchanted player" };
    const text = "Curse card that doesn't have the same name as a Curse attached to enchanted player";
    const search = { ...sr, filter: { ...sr.filter, notNamedAsAttachedTo: { player: { ref: "enchantedPlayer" as const }, filter: curse }, text }, dest: { ...sr.dest, attachToPlayer: { ref: "enchantedPlayer" as const } } };
    const body = raw.replace(/^At the beginning of your upkeep, /, "");
    return { ...t, body: { targets: [], effects: [{ ...may, effects: [search], text: body.replace(/^you may /, "").replace(/\.$/, "") }], text: body } };
  }
  // Ghost of Ramirez DePietro: "Whenever ~ deals combat damage to a player, choose up to one target card in a graveyard that
  // was discarded or put there from a library this turn. Put that card into its owner's hand.": a card discarded this turn
  // or put there from any library this turn (not on earlier turns, rulings), checked as it's targeted and as it resolves
  // (CR 608.2b); "choose up to one target" is an optional target (CR 115.1).
  const ghost = /^(Whenever ~ deals combat damage to a player), choose up to one target card in a graveyard that was discarded or put there from a library this turn\. Put that card into its owner's hand\.$/.exec(raw);
  if (ghost) {
    const t = parseTrigger(`${ghost[1]!}, return up to one target card from a graveyard to its owner's hand.`);
    const spec = t && t !== "fail" ? t.body.targets[0] : undefined;
    if (!t || t === "fail" || t.body.targets.length !== 1 || spec?.kind !== "card" || !spec.optional || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "bounce") return "fail";
    const text = "target card in a graveyard that was discarded or put there from a library this turn";
    return { ...t, body: { ...t.body, targets: [{ ...spec, discardedOrFromLibraryThisTurn: true, text }], text: raw.replace(`${ghost[1]!}, `, "") } };
  }
  // Suppressor Skyguard: "Whenever a player attacks you, if that player has another opponent who isn't being attacked,
  // prevent all combat damage that would be dealt to you this combat.": only an opponent can attack you (CR 506.2), once
  // each combat they attack you with creatures (CR 508.3e); an intervening if (CR 603.4), checked again as it resolves
  // (rulings), true if one of their other opponents isn't attacked themselves (attacking that player's planeswalkers or
  // battles doesn't count, rulings); the prevention lasts until this combat ends (CR 511.3).
  const skyguard = /^Whenever a player attacks you, if that player has another opponent who isn't being attacked, (prevent all combat damage that would be dealt to you) this combat\.$/.exec(raw);
  if (skyguard) {
    const t = parseTrigger(`Whenever an opponent attacks you, ${skyguard[1]!} this turn.`);
    const e = t && t !== "fail" ? t.body.effects : undefined;
    if (!t || t === "fail" || t.event !== "opponentAttacksYou" || t.ifCond || e?.length !== 1 || e[0]!.type !== "damageRule" || e[0]!.rule.untilYourNextTurn) return "fail";
    return { ...t, ifCond: { kind: "eventPlayerHasUnattackedOpponent" }, body: { ...t.body, effects: [{ ...e[0]!, rule: { ...e[0]!.rule, thisCombat: true } }], text: `${skyguard[1]!} this combat.` } };
  }
  return null;
}
