// Lane B round B182's lines, read by compileCard before its triggers and activated abilities (after round B179's), and
// its sentences, read at the end of round B181's.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { canonicalKeyword, LINKED_CREATURE_CARD_KEYWORD } from "../keywords";
import { parseActivated } from "./activated";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";
import { COUNTER, counterKind } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

/** The compiled cards whose "exiled with it" these lines linked to their delve, for roundB182Finish. */
const delveLinks = new WeakSet<CompiledCard>();

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB182Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Murktide Regent: "~ enters with a +1/+1 counter on it for each instant and sorcery card exiled with it.": the cards its
  // delve exiled as it was cast (CR 607.2q), still those cards in exile (CR 400.7), counted as it enters (CR 614.1c);
  // none if it wasn't cast or delve exiled none. Checked against its other abilities in roundB182Finish.
  const delveCount = new RegExp(`^~ enters with an? ${COUNTER} counter on it for each ((?:[a-z]+ and )?[a-z]+) card exiled with it\\.$`).exec(line);
  if (delveCount) {
    const filter = parseSearchFilter(`${delveCount[2]!.replace(" and ", " or ")} card`);
    if (!filter || out.entersWithCounters || !out.delve) out.unsupported.push(raw);
    else {
      out.entersWithCounters = { counter: counterKind(delveCount[1]!), n: { count: { kind: "linkedExiled", filter } } };
      out.delveLinked = true;
      delveLinks.add(out);
    }
    return true;
  }
  // Soulflayer: "If a creature card with flying was exiled with ~'s delve ability, ~ has flying. The same is true for first
  // strike, ...": each keyword while a creature card its delve exiled as it was cast (CR 607.2q), still that card in exile
  // and face up, has that keyword itself (a printed keyword, not one it gives itself, and a "hexproof from" variant as that
  // variant: rulings), layer 6.
  const delveKw = /^If a creature card with ([a-z ]+) was exiled with ~'s delve ability, ~ has \1\. The same is true for ((?:[a-z ]+, )+)and ([a-z ]+)\.$/.exec(line);
  if (delveKw) {
    const kws = [delveKw[1]!, ...delveKw[2]!.split(", ").filter(Boolean), delveKw[3]!].map((k) => canonicalKeyword(k));
    if (!out.delve || kws.some((k) => !k || !/^[A-Z][a-z]+(?: [a-z]+)?$/.test(k))) out.unsupported.push(raw);
    else {
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addKeywords", keywords: kws.map((k) => `${LINKED_CREATURE_CARD_KEYWORD}${k}`) }], text: line });
      out.delveLinked = true;
      delveLinks.add(out);
    }
    return true;
  }
  // Lochmere Serpent: "{U}{B}: Exile five target cards from an opponent's graveyard. Return ~ from your graveyard to your
  // hand. Activate only as a sorcery.": an ability that works only in the graveyard (CR 113.6m), the five targets all in one
  // opponent's graveyard (rulings). If some are illegal as it resolves the rest are exiled and it's still returned; if all
  // are, it doesn't resolve and it isn't (rulings, CR 608.2b).
  const yardExile = /^((?:\{[^}]+\})+): (Exile .+? target cards from an opponent's graveyard)\. Return ~ from your graveyard to your hand\. Activate only as a sorcery\.$/.exec(line);
  if (yardExile) {
    const field = parseActivated(`${yardExile[1]}: ${yardExile[2]}.`);
    const yard = parseActivated(`${yardExile[1]}: Return ~ from your graveyard to your hand. Activate only as a sorcery.`);
    const ok = field && field !== "fail" && !field.zone && !field.costs?.length && !field.tap && field.body.targets.length > 0 && field.body.effects.length === 1 && field.body.effects[0]!.type === "exile";
    if (!ok || !yard || yard === "fail" || yard.zone !== "graveyard" || yard.body.targets.length || !yard.sorcerySpeed) out.unsupported.push(raw);
    else out.activated.push({ ...yard, body: { ...yard.body, targets: field.body.targets, effects: [...field.body.effects, ...yard.body.effects], text: line.replace(/^[^:]+: /, "") }, text: line });
    return true;
  }
  // Skyclave Shade: "Landfall — Whenever a land you control enters, if ~ is in your graveyard and it's your turn, you may
  // cast it from your graveyard this turn.": an ability of the card in the graveyard (CR 113.6m), there just after the land
  // entered (rulings); a permission for that card this turn, paying its costs (kicker too) and following its timing, not
  // for the new object it becomes (rulings, CR 400.7).
  const yardCast = /^((?:[A-Z][a-z]+ — )?Whenever [^,]+), if ~ is in your graveyard and it's your turn, you may cast it from your graveyard this turn\.$/.exec(line);
  if (yardCast) {
    const t = parseTrigger(`${yardCast[1]}, if it's your turn, draw a card.`);
    if (!t || t === "fail" || t.ifCond?.kind !== "yourTurn" || t.zone || t.body.targets.length) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "mayCastFromGraveyard", what: { ref: "selfCard" } }], text: "You may cast ~ from your graveyard this turn." }, zone: "graveyard" });
    return true;
  }
  // Nightshade Assassin: "When ~ enters, you may reveal X black cards in your hand. If you do, target creature gets -X/-X
  // until end of turn.": which cards and how many, chosen as it resolves (rulings), none being the same as not revealing;
  // an illegal target means none are revealed (rulings, CR 608.2b).
  const revealX = /^(When ~ enters), you may reveal X ([a-z]+) cards in your hand\. If you do, (target [a-z ]+) gets -X\/-X until end of turn\.$/.exec(line);
  if (revealX) {
    const t = parseTrigger(`${revealX[1]}, reveal any number of ${revealX[2]} cards in your hand. ${revealX[3]!.replace(/^./, (c) => c.toUpperCase())} gets -X/-X until end of turn, where X is the number of cards revealed this way.`);
    if (!t || t === "fail" || t.body.targets.length !== 1 || t.body.effects[0]?.type !== "revealFromHand") out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, text: line.replace(/^When ~ enters, /, "").replace(/^./, (c) => c.toUpperCase()) } });
    return true;
  }
  // Shadow Urchin: "Whenever a creature you control with one or more counters on it dies, exile that many cards from the top
  // of your library. Until your next end step, you may play those cards.": the counters of every kind on it as it last
  // existed, +1/+1 and -1/-1 counters both, even those state-based actions would have removed (rulings, CR 603.10a).
  const thatMany = /^(Whenever a creature you control with one or more counters on it dies), exile that many cards from the top of your library\. (Until your next end step, you may play those cards\.)$/.exec(line);
  if (thatMany) {
    const t = parseTrigger(`${thatMany[1]}, exile the top X cards of your library, where X is the number of counters on it. ${thatMany[2]}`);
    const fx = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || fx.length !== 1 || fx[0]!.type !== "impulse") out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, text: line.replace(/^[^,]+, /, "").replace(/^./, (c) => c.toUpperCase()) } });
    return true;
  }
  // Curse of Chaos: "Whenever a player attacks enchanted player with one or more creatures, that attacking player may discard
  // a card. If the player does, they draw a card.": once for the attack, not for one on their planeswalkers (rulings, as
  // Curse of Shallow Graves); the attacking player is the active player (CR 506.2), asked only with a card in hand (CR
  // 101.3), who chooses the card (CR 701.9b) and draws.
  if (line === "Whenever a player attacks enchanted player with one or more creatures, that attacking player may discard a card. If the player does, they draw a card." && out.enchant?.kind === "player") {
    const them = { ref: "choseThisWay" } as const;
    out.triggers.push({ event: "enchantedPlayerAttacked", body: { targets: [], effects: [{ type: "eachMay", who: { ref: "activePlayer" }, need: { zone: "hand", filter: { kind: "card", types: [], notTypes: [], notColors: [], text: "card" } }, effects: [{ type: "discard", who: them, n: 1, random: false }, { type: "draw", who: them, n: 1 }], text: "discard a card. If you do, draw a card" }], text: "That attacking player may discard a card. If the player does, they draw a card." } });
    return true;
  }
  return false;
}

/** After all lines: Murktide Regent's and Soulflayer's "exiled with it" is linked to its delve only with no other exile. */
export function roundB182Finish(out: CompiledCard, allEffects: Effect[]) {
  if (!delveLinks.has(out)) return;
  const others = allEffects.some((e) => e.type === "exile" || e.type === "exileTop" || e.type === "exileGraveyard" || e.type === "impulse" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "exileHand" || (e.type === "search" && e.dest.zone === "exile") || (e.type === "chooseFromGraveyard" && e.dest === "exile") || (e.type === "discard" && !!e.exile) || e.type === "castFromAmong");
  if (out.spell || others || out.additionalCosts?.some((c) => "exile" in c && c.exile) || out.exileInsteadOfDying) out.unsupported.push("(counts cards exiled with it that it can't link to its delve)");
}

export function roundB182Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Barbed Wire: "{2}: Prevent the next 1 damage that would be dealt by ~ this turn.": a shield on the damage this object
  // deals, to anything (CR 615.7), as the object it is as it resolves (CR 400.7); each activation one more.
  const byMe = /^Prevent the next (\d+) damage that would be dealt by ~ this turn$/.exec(s);
  if (byMe) {
    if (ctx.spell || effects.length || ctx.targets.length) return null;
    return { effect: { type: "damageRule", rule: { by: { target: { ref: "self" } }, n: Number(byMe[1]) } }, next: si + 1 };
  }
  return null;
}
