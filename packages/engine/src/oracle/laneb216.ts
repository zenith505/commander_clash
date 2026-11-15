// Lane B round B216's lines, read by compileCard before its triggers and activated abilities (after round B215's), and its
// whole spells (chained from round B215's).
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { roundB217Spell } from "./laneb217";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB216Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Preferred Selection: "At the beginning of your upkeep, look at the top two cards of your library. You may sacrifice ~
  // and pay {2}{G}{G}. If you do, put one of those cards into your hand. If you don't, put one of those cards on the bottom
  // of your library." (Effect lookTopMaySacrificePay.) Putting a card into your hand isn't drawing it (rulings).
  if (!isSpell && line === "At the beginning of your upkeep, look at the top two cards of your library. You may sacrifice ~ and pay {2}{G}{G}. If you do, put one of those cards into your hand. If you don't, put one of those cards on the bottom of your library.") {
    const t = trig("At the beginning of your upkeep, draw a card.");
    if (!t || t.event !== "yourUpkeep" || t.zone || t.ifCond) return fail();
    const effects: Effect[] = [{ type: "lookTopMaySacrificePay", n: 2, pay: { mana: "{2}{G}{G}" }, then: "hand", otherwise: "bottom", text: "sacrifice ~ and pay {2}{G}{G}" }];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  // Curse of the Cabal: "At the beginning of each player's upkeep, if ~ is suspended, that player may sacrifice a permanent
  // of their choice. If the player does, put two time counters on ~.": an ability of the card while it's suspended in exile
  // (CR 113.6, 702.62b), its owner controlling it (CR 113.8), with an intervening if (CR 603.4). The player whose upkeep it
  // is decides (CR 603.5) and picks the permanent; the counters only if they sacrificed one.
  if (isSpell && line === "At the beginning of each player's upkeep, if ~ is suspended, that player may sacrifice a permanent of their choice. If the player does, put two time counters on ~.") {
    const t = trig("At the beginning of each player's upkeep, that player sacrifices a permanent.");
    const sac = t?.body.effects[0];
    if (!t || t.event !== "eachUpkeep" || t.zone || t.ifCond || t.body.effects.length !== 1 || sac?.type !== "pick" || sac.action !== "sacrifice" || sac.who.ref !== "eventPlayer" || sac.n !== 1) return fail();
    const effects: Effect[] = [
      { type: "may", effects: [sac], decider: { ref: "eventPlayer" }, text: "sacrifice a permanent to put two time counters on ~" },
      { type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ type: "counters", what: { ref: "selfCard" }, counter: "time", n: 2 }] },
    ];
    out.triggers.push({ ...t, zone: "exile", ifCond: { kind: "selfSuspended" }, body: { targets: [], effects, text: "That player may sacrifice a permanent of their choice. If the player does, put two time counters on ~." } });
    return true;
  }
  return false;
}

/** Round B216's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB216Spell(text: string): AbilityBody | null | undefined {
  // Forbidden Ritual: "Sacrifice a nontoken permanent. If you do, target opponent loses 2 life unless that player sacrifices
  // a permanent of their choice or discards a card. You may repeat this process any number of times.": the sacrifice is
  // made as it resolves (rulings); the target opponent is chosen once, as it's cast, and stays for every pass (rulings);
  // each pass the opponent chooses again (Effect repeatMaySteps).
  if (text === "Sacrifice a nontoken permanent. If you do, target opponent loses 2 life unless that player sacrifices a permanent of their choice or discards a card. You may repeat this process any number of times.") {
    const body = parseBody("Sacrifice a nontoken permanent. If you do, target opponent loses 2 life unless that player sacrifices a permanent of their choice or discards a card.", { spell: true });
    const [sac, then] = body?.effects ?? [];
    if (!body || body.targets.length !== 1 || body.effects.length !== 2 || sac?.type !== "pick" || sac.action !== "sacrifice" || sac.who.ref !== "you" || sac.filter.token !== false || then?.type !== "if" || then.cond.kind !== "sacrificedThisWay" || then.effects[0]?.type !== "punisher") return null;
    const nontoken: TargetSpec = sac.filter;
    return { targets: body.targets, effects: [{ type: "repeatMaySteps", effects: body.effects, text: "sacrifice a nontoken permanent; if you do, that opponent loses 2 life unless they sacrifice a permanent or discard a card", while: nontoken }], text };
  }
  return roundB217Spell(text);
}
