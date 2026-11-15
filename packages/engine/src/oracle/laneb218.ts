// Lane B round B218's lines, read by compileCard before its triggers and activated abilities (after round B217's).
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseCount } from "./counts";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB218Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Bishop of Binding: "Whenever ~ attacks, target Vampire gets +X/+X until end of turn, where X is the power of the exiled
  // card.": the card its "exile target creature an opponent controls until ~ leaves the battlefield" exiled (CR 607.2a), the
  // one before this line, while it's still in exile (CR 400.7); X counted as this resolves and kept (CR 608.2h, rulings);
  // the card's power as it is in exile, a Vehicle's printed power too (rulings); none there, or no power, 0 (rulings).
  if (!isSpell && line === "Whenever ~ attacks, target Vampire gets +X/+X until end of turn, where X is the power of the exiled card.") {
    const t = trig("Whenever ~ attacks, target Vampire gets +1/+1 until end of turn.");
    const pump = t?.body.effects[0];
    const exiles = out.triggers.flatMap((tr) => tr.body.effects.filter((e) => e.type === "exile"));
    const ex = out.triggers.length === 1 && out.triggers[0]!.event === "selfEnters" && out.triggers[0]!.body.effects.length === 1 ? exiles[0] : undefined;
    if (!t || t.event !== "selfAttacks" || t.body.effects.length !== 1 || pump?.type !== "continuous" || pump.mods.length !== 1 || pump.duration !== "endOfTurn" || ex?.type !== "exile" || ex.until !== "sourceLeaves" || ex.what.ref !== "target" || out.activated.length || out.statics.length) return fail();
    ex.linked = true;
    const x = { count: { kind: "linkedExiledPT" as const, stat: "power" as const, anyCard: true as const } };
    const body = { ...t.body, effects: [{ ...pump, mods: [{ kind: "modifyPT" as const, power: x, toughness: x }] }], text: line.replace(/^Whenever ~ attacks, /, "") };
    out.triggers.push({ ...t, body });
    return true;
  }
  // Fugitive Codebreaker: "Disguise {5}{R}. This cost is reduced by {1} for each instant and sorcery card in your graveyard.":
  // the generic part of the cost to turn it face up is smaller (CR 601.2f, 118.7d: reductions never touch the colored part),
  // counted as it's turned face up (a special action, CR 116.2b, 702.168d). Casting it face down still costs {3}.
  const dis = !isSpell && /^Disguise ((?:\{[^}]+\})+)\. This cost is reduced by \{1\} for each (instant and sorcery card) in your graveyard\.$/.exec(line);
  if (dis) {
    const n = parseCount(`${dis[2]!}s in your graveyard`, null);
    if (!/^\{\d+\}\{[WUBRG]\}$/.test(dis[1]!) || !n || typeof n !== "object" || !("count" in n) || n.count.kind !== "cardsInGraveyard" || out.faceDownCast) return fail();
    out.faceDownCast = { kind: "disguise", cost: dis[1]!, reduceBy: n };
    return true;
  }
  // Conundrum Sphinx: "Whenever ~ attacks, each player chooses a card name. Then each player reveals the top card of their
  // library. If the card a player revealed has the name they chose, that player puts it into their hand. If it doesn't, that
  // player puts it on the bottom of their library.": the active player names a card first, then each other player in turn
  // order; then all reveal at once (rulings, CR 101.4); each player's own card goes to their hand only if it has the name
  // they chose, otherwise to the bottom, never staying on top (rulings). Effect "eachGuessTop".
  if (!isSpell && line === "Whenever ~ attacks, each player chooses a card name. Then each player reveals the top card of their library. If the card a player revealed has the name they chose, that player puts it into their hand. If it doesn't, that player puts it on the bottom of their library.") {
    const t = trig("Whenever ~ attacks, draw a card.");
    if (!t || t.event !== "selfAttacks" || t.ifCond) return fail();
    const text = line.replace(/^Whenever ~ attacks, /, "");
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "eachGuessTop" }], text } });
    return true;
  }
  // Mirror of Fate: "{T}, Sacrifice ~: Choose up to seven face-up exiled cards you own. Exile all the cards from your library,
  // then put the chosen cards on top of your library.": chosen as it resolves, however they got to exile (rulings); the
  // library's cards exiled face up; the chosen ones then put on top in an order their owner chooses (rulings, CR 401.4).
  if (!isSpell && line === "{T}, Sacrifice ~: Choose up to seven face-up exiled cards you own. Exile all the cards from your library, then put the chosen cards on top of your library.") {
    const a = parseActivated("{T}, Sacrifice ~: Draw a card.");
    if (!a || a === "fail" || !a.tap || a.manaCost || !a.sacrificeSelf || a.costs?.length) return fail();
    const effects: Effect[] = [{ type: "exiledToLibraryTop", n: 7 }];
    out.activated.push({ ...a, text: line, body: { targets: [], effects, text: line.replace(/^\{T\}, Sacrifice ~: /, "") } });
    return true;
  }
  return false;
}
