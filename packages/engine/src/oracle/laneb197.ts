// Lane B round B197's lines, read by compileCard before its triggers and activated abilities (after round B194's), its
// sentences, read at the end of round B196's chain, and its whole spells, read after round B196's.
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseSentence } from "./sentence";
import { parseStaticCondition } from "./statics";
import { parseTrigger } from "./triggers";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB197Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Chandra's Phoenix: "Whenever an opponent is dealt damage by a red instant or sorcery spell you control or by a red
  // planeswalker you control, return ~ from your graveyard to your hand.": an ability that works only in the graveyard (CR
  // 113.6m), once for each opponent dealt damage by each such source (CR 603.2c). A spell dealing damage and a planeswalker
  // dealing damage are different events, so it reads as one trigger for each kind of source; the planeswalker's color and
  // types as it dealt the damage (CR 113.7a), whichever ability of it that was (a red planeswalker that's a creature too,
  // in combat).
  if (line === "Whenever an opponent is dealt damage by a red instant or sorcery spell you control or by a red planeswalker you control, return ~ from your graveyard to your hand.") {
    const spell = parseTrigger("Whenever a red instant or sorcery spell you control deals damage to an opponent, return ~ from your graveyard to your hand.");
    if (!spell || spell === "fail" || spell.event !== "spellYouControlDealsDamage" || spell.zone !== "graveyard") {
      out.unsupported.push(raw);
      return true;
    }
    const text = "Return ~ from your graveyard to your hand.";
    out.triggers.push({ ...spell, body: { ...spell.body, text } });
    out.triggers.push({ event: "sourceYouControlDamagesOpponent", zone: "graveyard", damageSourceIs: { colors: ["R"], types: ["Planeswalker"] }, body: { targets: [], effects: [{ type: "bounce", what: { ref: "selfCard" } }], text } });
    return true;
  }
  // Abby, Merciless Soldier: "When you cast ~, create a number of 1/1 black Fungus Zombie creature tokens named Cordyceps
  // Infected equal to the amount of mana spent to cast it.": the mana spent to cast that spell (CR 601.2h), counted as the
  // cast trigger resolves; the tokens have that name, not their subtypes (CR 111.4).
  const abby = /^When you cast ~, create a number of (\d+\/\d+ [a-z]+ (?:[A-Z][a-z]+ )+creature tokens named [A-Z][a-z]+(?: [A-Z][a-z]+)*) equal to the amount of mana spent to cast it\.$/.exec(line);
  if (abby) {
    const t = parseTrigger(`When you cast ~, create X ${abby[1]}, where X is the amount of mana spent to cast it.`);
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfCast" || e?.type !== "createToken" || !e.token.named) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, text: line.replace(/^When you cast ~, /, "") } });
    return true;
  }
  // Jocasta, Automaton Avenger: "Whenever you attack with your commander, if this card is in your graveyard, you may return
  // it to the battlefield tapped and attacking.": an ability that works only in the graveyard (CR 113.6m), "your commander"
  // one you own (CR 903.3); it enters attacking a player or planeswalker of your choice, never declared as an attacker (CR
  // 508.4).
  if (line === "Whenever you attack with your commander, if ~ is in your graveyard, you may return it to the battlefield tapped and attacking.") {
    const t = parseTrigger("Whenever you attack with your commander, you may return ~ from your graveyard to the battlefield tapped and attacking.");
    if (!t || t === "fail" || t.event !== "creaturesYouControlAttack" || t.zone !== "graveyard" || !t.group?.commander) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, text: "You may return ~ to the battlefield tapped and attacking." } });
    return true;
  }
  // Phyrexian Devourer: "Exile the top card of your library: Put X +1/+1 counters on ~, where X is the exiled card's mana
  // value.": the card its cost exiled (StackItem.costExiled), its mana value as it is in exile (a land's is 0, CR 202.3);
  // with no card in the library it can't be activated (CR 118.3).
  if (line === "Exile the top card of your library: Put X +1/+1 counters on ~, where X is the exiled card's mana value.") {
    const a = parseActivated(line);
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const n = e?.type === "counters" && typeof e.n === "object" && "count" in e.n ? e.n : undefined;
    const costs = a && a !== "fail" ? (a.costs ?? []) : [];
    if (!a || a === "fail" || e?.type !== "counters" || n?.count.kind !== "manaValue" || costs.length !== 1 || costs[0]!.kind !== "mill" || !costs[0]!.exile || costs[0]!.n !== 1) out.unsupported.push(raw);
    else out.activated.push({ ...a, body: { ...a.body, effects: [{ ...e, n: { ...n, count: { kind: "manaValue", of: { ref: "costExiled" } } } }] } });
    return true;
  }
  return false;
}

/** Round B197's sentences, read at the end of round B196's chain. */
export function roundB197Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Outmaneuver: "X target blocked creatures assign their combat damage this turn as though they weren't blocked.": each one
  // assigns all its combat damage to the player or planeswalker it's attacking (CR 510.1c), even if its blockers are gone
  // (rulings); decided as the spell resolves, so no choice is left for the damage step. Anyone's blocked creatures.
  if (plain(s) === "X target blocked creatures assign their combat damage this turn as though they weren't blocked" && ctx.spell && !effects.length && !ctx.targets.length) {
    const tap = parseSentence("Tap X target blocked creatures", ctx);
    const e = tap?.length === 1 ? tap[0] : undefined;
    if (e?.type !== "tap" || e.what.ref !== "target" || ctx.targets.length !== 1 || ctx.targets[0]!.many !== "exactX") return "fail";
    return { effect: { type: "noCombatDamage", what: e.what, asUnblocked: true }, next: si + 1 };
  }
  // Fight for the Throne: "When the creature an opponent controls dies this turn, if you control your commander, you become
  // the monarch.": a delayed trigger about that target as it is now (CR 603.7c), made only if it's still legal (CR
  // 608.2b); "if you control your commander" an intervening if (CR 603.4), checked as it dies and as it resolves.
  const throne = /^When the (creature an opponent controls) dies this turn, if (you control your commander), (you become the monarch)$/.exec(plain(s));
  if (throne) {
    const index = ctx.targets.findIndex((t) => t.text === `target ${throne[1]}`);
    const cond = parseStaticCondition(throne[2]!, { affects: { kind: "self" }, mods: [], text: "" });
    const then = parseSentence("You become the monarch", ctx);
    if (index < 0 || ctx.targets.filter((t) => t.text === `target ${throne[1]}`).length !== 1 || !cond || then?.length !== 1 || sentences.length !== si + 1) return "fail";
    return { effect: { type: "delayed", when: "dies", of: { ref: "target", index }, thisTurn: true, ifCond: cond, effects: then, text: throne[3]! }, next: si + 1 };
  }
  return null;
}

/** A whole spell's text read at once; undefined when it isn't one of these, null when it is but fails. */
export function roundB197Spell(_text: string): AbilityBody | null | undefined {
  return undefined;
}
