// Lane B round B174's lines, read by compileCard before its triggers and activated abilities (after round B173's), and
// its sentences, read at the end of round B173's.
import type { CompiledCard, Effect, TriggeredAbility } from "../abilities";
import type { Color } from "../types";
import type { Ctx } from "./body";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";
import { COLOR_WORDS } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const COLOR = "white|blue|black|red|green";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB174Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Cryptid Inspector: "Whenever a face-down permanent you control enters and whenever ~ or another permanent you control is
  // turned face up, put a +1/+1 counter on ~.": one ability with two trigger events, which works as two with the same effect
  // (as Cryoshatter's); turning face up isn't entering (CR 708.8), so no event is both.
  const enterOrUp = /^Whenever (a face-down permanent you control enters) and whenever (~ or another permanent you control is turned face up), (.+)$/.exec(line);
  if (enterOrUp) {
    const both = [`Whenever ${enterOrUp[1]}, ${enterOrUp[3]}`, `Whenever ${enterOrUp[2]}, ${enterOrUp[3]}`].map((l) => parseTrigger(l));
    if (both.some((t) => !t || t === "fail")) out.unsupported.push(raw);
    else out.triggers.push(...(both as TriggeredAbility[]));
    return true;
  }
  // Reckless Velocitaur, Canyon Vaulter: "Whenever ~ saddles a Mount or crews a Vehicle during your main phase, that Mount or
  // Vehicle gets ...": it's tapped to pay a saddle cost (CR 702.171c) or a crew cost (CR 702.122d), once for each such
  // ability, in a main phase of its controller's turn (CR 505.1); "that Mount or Vehicle" is the permanent it saddled or
  // crewed.
  const saddleOrCrew = /^Whenever ~ saddles a Mount or crews a Vehicle during your main phase, (.+)$/.exec(line);
  if (saddleOrCrew) {
    const t = parseTrigger(`Whenever ~ crews a Vehicle, ${saddleOrCrew[1]!.replace(/\bthat Mount or Vehicle\b/g, "that Vehicle")}`);
    if (!t || t === "fail" || t.event !== "selfCrewsVehicle") out.unsupported.push(raw);
    else out.triggers.push({ ...t, orSaddles: true, yourMainPhase: true });
    return true;
  }
  // Tunnel Tipster: "At the beginning of your end step, if a face-down creature entered the battlefield under your control
  // this turn, ...": one that was face down as it entered, even if it has turned face up or left since; one that entered
  // face up and was turned face down later doesn't count (rulings). An intervening if (CR 603.4).
  const faceDownIn = /^(At the beginning of your end step), if a face-down creature entered the battlefield under your control this turn, (.+)$/.exec(line);
  if (faceDownIn) {
    const t = parseTrigger(`${faceDownIn[1]}, if a creature entered the battlefield under your control this turn, ${faceDownIn[2]}`);
    if (!t || t === "fail" || t.ifCond?.kind !== "youEntered" || t.ifCond.n !== 1 || t.ifCond.other || t.ifCond.lastTurn) out.unsupported.push(raw);
    else out.triggers.push({ ...t, ifCond: { ...t.ifCond, faceDown: true } });
    return true;
  }
  // Veiled Ascension: "Face-down creatures you control enter with a flying counter on them.": a replacement effect of this
  // permanent on face-down creatures entering under its controller's control (CR 614.1c), judged as each would exist on the
  // battlefield, face down (CR 614.12, 708.2); not on itself, an enchantment (face down, it has no abilities, CR 708.2).
  const faceDownCounter = /^Face-down creatures you control enter with an? (flying) counter on them\.$/.exec(line);
  if (faceDownCounter) {
    const filter = parseTargetPhrase("face-down creature you control");
    if (filter?.kind !== "object" || !filter.faceDown) out.unsupported.push(raw);
    else (out.othersEnterWithCounters ??= []).push({ filter: { ...filter, text: "face-down creature you control" }, counter: "flying", n: 1, text: line });
    return true;
  }
  // Sanctifier en-Vec: "When ~ enters, exile all cards that are black or red from all graveyards." The same as "all black
  // or red cards": a card of either color (CR 105.2).
  const yardColors = new RegExp(`^(When ~ enters), exile all cards that are (${COLOR}) or (${COLOR}) from all graveyards\\.$`).exec(line);
  if (yardColors) {
    const t = parseTrigger(`${yardColors[1]}, exile all ${yardColors[2]} or ${yardColors[3]} cards from all graveyards.`);
    if (!t || t === "fail" || t.body.effects[0]?.type !== "exileGraveyard") out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Sanctifier en-Vec: "If a black or red permanent, spell, or card not on the battlefield would be put into a graveyard,
  // exile it instead.": any object of either color going to any graveyard from anywhere (CR 614.1a), a token too (it's a
  // permanent), with its colors in the zone it's leaving (rulings): a permanent's as the layers give them, a spell's as it's
  // cast. A spell that makes ~ leave as it resolves goes to the graveyard (it's gone first, rulings); one it leaves with at
  // the same time is exiled (rulings, game.ts graveyardExileFor's leftTogether).
  const colorExile = new RegExp(`^If an? (${COLOR}) or (${COLOR}) permanent, spell, or card not on the battlefield would be put into a graveyard, exile it instead\\.$`).exec(line);
  if (colorExile) {
    if (out.graveyardExile) out.unsupported.push(raw);
    else out.graveyardExile = { whose: "any", tokens: true, colorsNow: [COLOR_WORDS[colorExile[1]!]!, COLOR_WORDS[colorExile[2]!]!] as Color[] };
    return true;
  }
  return false;
}

export function roundB174Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Predatory Focus: "You may have creatures you control assign their combat damage this turn as though they weren't
  // blocked.": chosen as it resolves; if you do, every creature you control this turn deals its combat damage to the player
  // or planeswalker it's attacking, blocked or not, ones that come later too (rulings, CR 510.1c).
  if (/^You may have creatures you control assign their combat damage this turn as though they weren't blocked$/.test(s) && ctx.spell && !effects.length) {
    return { effect: { type: "may", effects: [{ type: "yourCreaturesUnblockedThisTurn" }], text: "have creatures you control assign their combat damage this turn as though they weren't blocked" }, next: si + 1 };
  }
  // Liliana, the Necromancer: "Put up to two creature cards from graveyards onto the battlefield under your control.": not
  // targeted, chosen as it resolves, after the destruction before it, so the destroyed creatures can be among them (rulings);
  // they enter at once.
  if (/^Put up to two creature cards from graveyards onto the battlefield under your control$/.test(s)) {
    return { effect: { type: "chooseFromGraveyard", n: 2, upTo: true, dest: "battlefield", anyGraveyard: true, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" } }, next: si + 1 };
  }
  return null;
}
