// Round 382's whole lines: mana of any color for one permanent's own abilities (Manascape Refractor), draws from the bottom
// of the library and a trigger on an opponent's scry, surveil or search (River Song), and a Saga goading creatures by the
// names chosen for it (Day of the Moon).
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { parseCardNameChoice } from "./search";
import { parseTrigger } from "./triggers";

/** A whole line of round 382's (compile.ts, after round 381's). */
export function round382Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Manascape Refractor: "You may spend mana as though it were mana of any color to pay the activation costs of ~'s
  // abilities." (CR 609.4b): the costs of every activated ability it has, mana abilities among them (CR 602.1, 605.1a), its
  // borrowed ones too; not costs that aren't an activation's (cumulative upkeep, turning it face up).
  if (line === "You may spend mana as though it were mana of any color to pay the activation costs of ~'s abilities.") {
    if (isSpell) out.unsupported.push(raw);
    else out.spendAnyColorOwnAbilities = true;
    return true;
  }
  // River Song: "You draw cards from the bottom of your library rather than the top.": every card its controller draws while
  // it's on the battlefield, the draw otherwise the same as any other (rulings).
  if (line === "Meet in Reverse — You draw cards from the bottom of your library rather than the top." || line === "You draw cards from the bottom of your library rather than the top.") {
    if (isSpell) out.unsupported.push(raw);
    else out.drawsFromBottom = true;
    return true;
  }
  // River Song: "Whenever an opponent scries, surveils, or searches their library, put a +1/+1 counter on ~. Then ~ deals
  // damage to that player equal to its power.": once for each scry, surveil (CR 701.22, 701.25) or search of their own
  // library (CR 701.23); its power as the damage is dealt, the counter counted (CR 608.2h if it's gone).
  const spoilers = /^(?:Spoilers — )?Whenever an opponent scries, surveils, or searches their library, (put a \+1\/\+1 counter on ~)\. Then ~ deals damage to that player equal to its power\.$/.exec(line);
  if (spoilers) {
    const body = isSpell ? null : parseBody(`${spoilers[1]!}. Then ~ deals damage equal to its power to that player.`, { eventPlayer: true });
    const [put, hit] = body?.effects ?? [];
    if (!body || body.targets.length || body.effects.length !== 2 || put?.type !== "counters" || put.what.ref !== "self" || hit?.type !== "damage" || hit.to.ref !== "eventPlayer") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ event: "opponentScriesSurveilsOrSearches", body: { ...body, text: line.replace(/^(?:Spoilers — )?Whenever an opponent scries, surveils, or searches their library, /, "") } });
    return true;
  }
  return false;
}

const KANG = "For each opponent, tap up to one target creature that player controls. Goad those creatures. Until your next turn, whenever any of those creatures deals combat damage to a player, draw a card.";
const MOON = "Choose a creature card name, then goad all creatures with a name chosen for ~.";

/** A Saga chapter's effect (compile.ts, the Sagas): a body, null when it should be supported but isn't, undefined when not this round's. */
export function round382Chapter(text: string): AbilityBody | null | undefined {
  // Day of the Moon: the name is chosen as the chapter resolves (CR 608.2d), any creature card name (CR 201.4); "a name
  // chosen for ~" is any name its chapters chose for this Saga as this object (CR 400.7), the new one included. Every
  // creature with one of them is goaded by you, whoever controls it (CR 701.15a), as it resolves (CR 611.2c).
  if (text === MOON) {
    const c = parseCardNameChoice("a creature card name");
    if (!c?.names) return null;
    return { targets: [], effects: [{ type: "choose", choice: "cardName", ...c, purpose: "goadTheirs" }, { type: "goadChosenNames" }], text };
  }
  // Kang Dynasty: up to one target creature for each opponent, that player's (CR 601.2c, 115.6), tapped and goaded by you
  // (CR 701.15a); then a delayed trigger about each of them until your next turn (CR 603.7b-c), as the object it is (CR
  // 400.7): each one dealing combat damage to a player draws you a card, two at once draw two (as Tamiyo, Field Researcher's).
  if (text === KANG) {
    const body = parseBody("For each opponent, tap up to one target creature that player controls. Goad them.", {});
    const [tap, goad] = body?.effects ?? [];
    const trigger = parseTrigger("Whenever ~ deals combat damage to a player, draw a card.");
    if (!body || body.targets.length !== 1 || !body.targets[0]!.perOpponent || body.effects.length !== 2 || tap?.type !== "tap" || goad?.type !== "continuous" || goad.what.ref !== "target" || goad.what.index !== 0 || !goad.what.n) return null;
    if (!trigger || trigger === "fail" || trigger.event !== "selfDealsCombatDamageToPlayer" || trigger.ifCond || trigger.body.targets.length || trigger.body.effects.length !== 1 || trigger.body.effects[0]!.type !== "draw") return null;
    return { ...body, effects: [tap, goad, { type: "floatingTrigger", trigger: { ...trigger, body: { ...trigger.body, text: "draw a card." } }, until: "yourNextTurn", about: 0, each: goad.what.n }], text };
  }
  return undefined;
}
