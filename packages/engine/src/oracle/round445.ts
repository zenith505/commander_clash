// Round 445's whole lines (compile.ts, before round 444's): Flamewar, Brash Veteran's convert and intel counters on cards
// exiled face down, and Cosima, God of the Voyage's ability gained in exile and The Omenkeel's land plays from exile.
import type { CompiledCard, Effect, TriggeredAbility } from "../abilities";
import { parseActivated } from "./activated";
import { compileGranted } from "./grants";
import { parseTrigger } from "./triggers";
import { counterKind } from "./words";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/** "That many" of a "deals combat damage to a player" trigger: the damage dealt, as the mill this reads it as has it. */
function thatMany(head: string): { t: TriggeredAbility; n: Extract<Effect, { type: "mill" }>["n"] } | null {
  const t = parseTrigger(`${head}, that player mills that many cards.`);
  const e0 = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
  if (!t || t === "fail" || e0?.type !== "mill" || t.body.targets.length || t.zone) return null;
  const n = e0.n;
  if (typeof n !== "object" || !("count" in n) || n.count.kind !== "eventAmount") return null;
  return { t, n };
}

/** One whole line of round 445's (compile.ts); false when it isn't one of these. */
export function round445Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Flamewar, Brash Veteran: "Sacrifice another artifact: Put a +1/+1 counter on ~ and convert it. Activate only as a
  // sorcery.": "it" is ~, the one object named (CR 701.28a: converting is transforming it), read as the two sentences.
  const counterConvert = /^([^:]+): Put an? ([+-]\d\/[+-]\d|[a-z]+) counter on ~ and convert it\.( Activate only as a sorcery\.)?$/.exec(line);
  if (counterConvert) {
    const a = parseActivated(`${counterConvert[1]}: Put a ${counterConvert[2]} counter on ~. Convert ~.${counterConvert[3] ?? ""}`);
    const [put, conv] = a && a !== "fail" ? a.body.effects : [];
    if (!a || a === "fail" || a.body.effects.length !== 2 || put?.type !== "counters" || put.what.ref !== "self" || conv?.type !== "transform" || !conv.convert || conv.what.ref !== "self") return fail(out, raw);
    out.activated.push({ ...a, text: line, body: { ...a.body, text: line.slice(line.indexOf(": ") + 2) } });
    return true;
  }
  // Flamewar, Streetwise Operative: "Whenever ~ deals combat damage to a player, exile that many cards from the top of your
  // library face down. Put an intel counter on each of them. Convert ~.": the damage dealt (CR 510.2), cards nobody may
  // look at (CR 406.3, rulings: you don't either), each with an intel counter in exile (CR 122.1); then ~ converts (CR
  // 701.28a), if it's still that permanent.
  const intel = /^(Whenever ~ deals combat damage to a player), exile that many cards from the top of your library face down\. Put an? ([a-z]+) counter on each of them\. Convert ~\.$/.exec(line);
  if (intel) {
    const many = thatMany(intel[1]!);
    const base = parseTrigger(`${intel[1]}, exile the top two cards of your library face down. Convert ~.`);
    const [fd, conv] = base && base !== "fail" ? base.body.effects : [];
    if (!many || !base || base === "fail" || base.event !== many.t.event || base.body.effects.length !== 2 || fd?.type !== "exileFaceDown" || fd.from !== "top" || fd.look || fd.play || fd.who || fd.counter || conv?.type !== "transform" || !conv.convert) return fail(out, raw);
    const effects: Effect[] = [{ ...fd, n: many.n, counter: counterKind(intel[2]!) }, conv];
    out.triggers.push({ ...base, body: { ...base.body, effects, text: line.slice(intel[1]!.length + 2) } });
    return true;
  }
  // Flamewar, Brash Veteran: "{1}, Discard your hand: Put all exiled cards you own with intel counters on them into your
  // hand.": every card you own in exile with one, face down too (Effect exiledWithCounterToHand).
  const toHand = /^([^:]+): Put all exiled cards you own with ([a-z]+) counters on them into your hand\.$/.exec(line);
  if (toHand) {
    const a = parseActivated(`${toHand[1]}: Draw a card.`);
    if (!a || a === "fail" || a.body.targets.length || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "draw") return fail(out, raw);
    const effects: Effect[] = [{ type: "exiledWithCounterToHand", counter: counterKind(toHand[2]!) }];
    out.activated.push({ ...a, text: line, body: { ...a.body, effects, text: line.slice(line.indexOf(": ") + 2) } });
    return true;
  }
  // Cosima, God of the Voyage: "At the beginning of your upkeep, you may exile ~. If you do, it gains "Whenever a land you
  // control enters, if ~ is exiled, ..."": the exile, then, only if it went to exile (setsDid; a token or an object that
  // left first isn't, CR 400.7), the card there gains the ability (CR 400.7j, 611.2c; Effect gainInExile). Within the
  // quotes "Cosima" is that card (⟪source⟫ here). The rulings: it triggers only if ~ is on the battlefield as your upkeep
  // begins, and it's exiled only if it's still there.
  const voyage = /^(At the beginning of your upkeep), you may exile ~\. If you do, it gains "(.+)"$/.exec(line);
  if (voyage) {
    const text = voyage[2]!.replaceAll("⟪source⟫", "~");
    const t = parseTrigger(`${voyage[1]}, you may exile ~.`);
    const may = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const ex = may?.type === "may" && may.effects.length === 1 && !may.otherwise && !may.pay ? may.effects[0] : undefined;
    const gained = compileGranted(text);
    const g = gained.triggers[0];
    if (!t || t === "fail" || t.event !== "yourUpkeep" || ex?.type !== "exile" || ex.what.ref !== "self" || gained.unsupported.length || gained.triggers.length !== 1 || gained.activated.length || gained.statics.length || g?.zone !== "exile") return fail(out, raw);
    const effects: Effect[] = [
      { ...may!, effects: [{ ...ex, setsDid: true }] } as Effect,
      { type: "if", cond: { kind: "youDid" }, effects: [{ type: "gainInExile", text }] },
    ];
    out.triggers.push({ ...t, body: { ...t.body, effects, text: line.slice(voyage[1]!.length + 2) } });
    return true;
  }
  // Cosima's gained ability: "Whenever a land you control enters, if ~ is exiled, you may put a voyage counter on it. If you
  // don't, return ~ to the battlefield with X +1/+1 counters on it and draw X cards, where X is the number of voyage
  // counters on it.": an ability of the card in exile (CR 113.6k), controlled by its owner (CR 113.8), with an intervening
  // if (CR 603.4: checked again as it resolves; rulings: gone from exile by then, even if it came back, nothing happens).
  const voyageGained = /^(Whenever a land you control enters), if ~ is exiled, you may put an? ([a-z]+) counter on it\. If you don't, return ~ to the battlefield with X (\+1\/\+1) counters on it and draw X cards, where X is the number of ([a-z]+) counters on it\.$/.exec(line);
  if (voyageGained) {
    if (voyageGained[2] !== voyageGained[4]) return fail(out, raw);
    const t = parseTrigger(`${voyageGained[1]}, draw a card.`);
    if (!t || t === "fail" || t.event !== "permanentEnters" || !t.enters || t.zone || t.ifCond || t.body.targets.length) return fail(out, raw);
    const effects: Effect[] = [{ type: "exiledSelfCounterOrReturn", counter: counterKind(voyageGained[2]!), plus: counterKind(voyageGained[3]!) }];
    out.triggers.push({ ...t, zone: "exile", ifCond: { kind: "selfInExile" }, body: { ...t.body, effects, text: line.slice(voyageGained[1]!.length + 2) } });
    return true;
  }
  // The Omenkeel: "Whenever a Vehicle you control deals combat damage to a player, that player exiles that many cards from
  // the top of their library. You may play lands from among those cards for as long as they remain exiled." (Effect
  // exileTopLandsPlayable).
  const omen = /^(Whenever an? [A-Z][a-z]+ you control deals combat damage to a player), that player exiles that many cards from the top of their library\. You may play lands from among those cards for as long as they remain exiled\.$/.exec(line);
  if (omen) {
    const many = thatMany(omen[1]!);
    if (!many) return fail(out, raw);
    const effects: Effect[] = [{ type: "exileTopLandsPlayable", who: { ref: "eventPlayer" }, n: many.n }];
    out.triggers.push({ ...many.t, body: { ...many.t.body, effects, text: line.slice(omen[1]!.length + 2) } });
    return true;
  }
  return false;
}
