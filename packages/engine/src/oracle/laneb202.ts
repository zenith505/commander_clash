// Lane B round B202's lines, read by compileCard before its triggers and activated abilities (after round B201's).
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";
import { colorTemplate, withColors } from "./color-template";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB202Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Tide of War: "Whenever one or more creatures block, flip a coin. If you win the flip, each blocking creature is
  // sacrificed by its controller. If you lose the flip, each blocked creature is sacrificed by its controller.": once each
  // combat, only if one or more blockers were declared (rulings, CR 509.3a); Tide of War's controller flips (rulings);
  // "each blocked creature" is an attacking creature that was blocked, even if its blockers are gone (CR 509.1h, rulings),
  // each sacrificed by its controller at once (CR 701.21a).
  if (line === "Whenever one or more creatures block, flip a coin. If you win the flip, each blocking creature is sacrificed by its controller. If you lose the flip, each blocked creature is sacrificed by its controller.") {
    const body = parseBody("Flip a coin. If you win the flip, each player sacrifices all blocking creatures they control. If you lose the flip, each player sacrifices all blocked creatures they control.", {});
    const [flip, won, lost] = body?.effects ?? [];
    const sac = (e: Effect | undefined, combat: string) => e?.type === "if" && e.effects.length === 1 && e.effects[0]!.type === "sacrifice" && e.effects[0]!.what.ref === "each" && e.effects[0]!.what.filter.combat === combat && !!e.effects[0]!.byController;
    if (!body || body.effects.length !== 3 || body.targets.length || flip?.type !== "flipCoin" || !sac(won, "blocking") || !sac(lost, "blocked")) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ event: "creaturesBlock", body: { ...body, text: line.replace(/^Whenever one or more creatures block, /, "") } });
    return true;
  }
  // Moorland Rescuer: "When ~ dies, return any number of other creature cards with total power X or less from your graveyard
  // to the battlefield, where X is ~'s power. Exile ~.": X is its power as it last existed on the battlefield (rulings, CR
  // 608.2h); each card's power where it is, in the graveyard (CR 208.1, 604.3); not ~ itself; the cards come back even if ~
  // has left the graveyard (rulings), then ~ is exiled if it's still there.
  if (line === "When ~ dies, return any number of other creature cards with total power X or less from your graveyard to the battlefield, where X is ~'s power. Exile ~.") {
    const t = parseTrigger("When ~ dies, you gain life equal to ~'s power. Exile ~.");
    const [gain, exile] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "selfDies" || t.body.effects.length !== 2 || gain?.type !== "gainLife" || exile?.type !== "exile" || exile.what.ref !== "selfCard") {
      out.unsupported.push(raw);
      return true;
    }
    const yard: Effect = { type: "yardTotalPower", max: gain.n, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "other creature card" } };
    out.triggers.push({ ...t, body: { targets: [], effects: [yard, exile], text: line.replace(/^When ~ dies, /, "") } });
    return true;
  }
  // Loki Laufeyson: "{1}, {T}: When you next cast an instant or sorcery spell with mana value less than or equal to ~'s power
  // this turn, copy that spell. You may choose new targets for the copy.": a delayed trigger (CR 603.7c) checked as each such
  // spell is cast (CR 603.2), against ~'s power then: the permanent's if it's still on the battlefield, otherwise as it last
  // existed there (CR 113.7a, 608.2h); the spell's mana value on the stack, X counted (CR 202.3e).
  if (line === "{1}, {T}: When you next cast an instant or sorcery spell with mana value less than or equal to ~'s power this turn, copy that spell. You may choose new targets for the copy.") {
    const a = parseActivated("{1}, {T}: When you next cast an instant or sorcery spell with mana value 2 or less this turn, copy that spell. You may choose new targets for the copy.");
    const next = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || !a.tap || a.manaCost !== "{1}" || (a.costs ?? []).length || next?.type !== "nextCast" || next.filter.manaValue?.max !== 2 || next.effects.length !== 1 || next.effects[0]!.type !== "copySpell") {
      out.unsupported.push(raw);
      return true;
    }
    const { manaValue: _mv, ...filter } = next.filter;
    const text = "When you next cast an instant or sorcery spell with mana value less than or equal to ~'s power this turn, copy that spell. You may choose new targets for the copy.";
    out.activated.push({ ...a, text: line, body: { ...a.body, effects: [{ ...next, filter: { ...filter, text: "instant or sorcery spell with mana value less than or equal to ~'s power" }, mvMaxSourcePower: true }], text } });
    return true;
  }
  // Darigaaz Reincarnated: "If ~ would die, instead exile it with three egg counters on it." One replacement (CR 614.1a), the
  // counters on the card in exile (CR 122.1); its own applied before another "exile it instead" (rulings: its controller may,
  // and only this one gives it egg counters).
  if (line === "If ~ would die, instead exile it with three egg counters on it.") {
    if (out.exileInsteadOfDying) out.unsupported.push(raw);
    else out.exileInsteadOfDying = { self: true, counter: "egg", counterN: 3 };
    return true;
  }
  // Darigaaz Reincarnated: "At the beginning of your upkeep, if ~ is exiled with an egg counter on it, remove an egg counter
  // from it. Then if ~ has no egg counters on it, return it to the battlefield.": an ability of the card in exile, its owner
  // controlling it (CR 113.6, 113.8), with an intervening if (CR 603.4: not if it has no egg counter, rulings); it returns
  // under its owner's control (CR 110.2) once the last one is removed.
  if (line === "At the beginning of your upkeep, if ~ is exiled with an egg counter on it, remove an egg counter from it. Then if ~ has no egg counters on it, return it to the battlefield.") {
    const t = parseTrigger("At the beginning of your upkeep, draw a card.");
    if (!t || t === "fail" || t.event !== "yourUpkeep" || t.zone || t.ifCond) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, zone: "exile", ifCond: { kind: "selfInExile", counter: "egg" }, body: { targets: [], effects: [{ type: "removeCounterThenReturn", counter: "egg" }], text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  return roundB202Activated(line, raw, out);
}

/** Round B202's activated lines read before the general parser (Stitcher Geralf); false when it isn't one of these. */
export function roundB202Activated(line: string, raw: string, out: CompiledCard): boolean {
  // Stitcher Geralf: "{2}{U}, {T}: Each player mills three cards. Exile up to two creature cards put into graveyards this way.
  // Create an X/X blue Zombie creature token, where X is the total power of the cards exiled this way.": the cards milled
  // and still in a graveyard, chosen as it resolves from any of them (CR 608.2c); a card a replacement exiled instead isn't
  // one, and with none exiled the token is 0/0 (rulings); X is their total power in exile.
  // Its colors as a text change of color words leaves them (color-template.ts, round 462).
  const geralf = colorTemplate("{2}{U}, {T}: Each player mills three cards. Exile up to two creature cards put into graveyards this way. Create an X/X blue Zombie creature token, where X is the total power of the cards exiled this way.", line);
  if (geralf) {
    const a = parseActivated(withColors("{2}{U}, {T}: Each player mills three cards. Create an X/X blue Zombie creature token, where X is the number of cards in your hand.", geralf));
    const [mill, token] = a && a !== "fail" ? a.body.effects : [];
    if (!a || a === "fail" || !a.tap || a.manaCost !== "{2}{U}" || (a.costs ?? []).length || a.body.effects.length !== 2 || mill?.type !== "mill" || mill.who.ref !== "eachPlayer" || mill.n !== 3 || token?.type !== "createToken" || !token.pt || token.token.subtypes.join() !== "Zombie") {
      out.unsupported.push(raw);
      return true;
    }
    const exile: Effect = { type: "chooseFromGraveyard", anyGraveyard: true, milled: true, milledInYard: true, n: 2, upTo: true, dest: "exile", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card put into a graveyard this way" } };
    out.activated.push({ ...a, text: line, body: { targets: [], effects: [mill, exile, { ...token, pt: { count: { kind: "yardChosenPower" } } }], text: line.replace(/^\{2\}\{U\}, \{T\}: /, "") } });
    return true;
  }
  return false;
}
