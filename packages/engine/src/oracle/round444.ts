// Round 444's whole lines (compile.ts, before round 443's): Altaïr Ibn-La'Ahad's and The Animus's memory counters on cards
// exiled from graveyards, Altaïr's attacking token copies of them and The Animus's copy of one.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";
import { counterKind } from "./words";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/**
 * "<trigger>, exile up to one target <kind> card from <a|your> graveyard with an? <counter> counter on it.": the trigger as
 * the plain exile reads it, then the counter put on the card as it's exiled (CR 122.1, 400.7: it goes on the card in
 * exile, not on a token or permanent). Null when the trigger isn't exactly that.
 */
function exileWithCounter(head: string, counter: string): { t: Extract<ReturnType<typeof parseTrigger>, object>; exile: Effect } | null {
  const t = parseTrigger(`${head}.`);
  const e0 = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
  if (!t || t === "fail" || e0?.type !== "exile" || e0.what.ref !== "target" || e0.counters || e0.until || e0.linked || t.body.targets.length !== 1) return null;
  const target = t.body.targets[0]!;
  if (target.kind !== "card" || !target.optional || target.inExile || target.linkedExile || target.many) return null;
  return { t, exile: { ...e0, counters: { [counterKind(counter)]: 1 } } };
}

/** One whole line of round 444's (compile.ts); false when it isn't one of these. */
export function round444Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Altaïr Ibn-La'Ahad: "Whenever ~ attacks, exile up to one target Assassin creature card from your graveyard with a
  // memory counter on it. Then for each creature card you own in exile with a memory counter on it, create a tapped and
  // attacking token that's a copy of it. Exile those tokens at end of combat." The exile first, its counter on the card in
  // exile; then every face-up creature card you own in exile with a memory counter, that one too and any other, whatever
  // exiled it (Effect tokenCopiesOfExiledWithCounter: copies of the cards as printed, CR 707.2, each attacking whom you
  // choose, CR 508.4, rulings); with no target, or an illegal one, the copies are still made (CR 608.2b: only that part
  // does nothing). Then a delayed trigger exiles those tokens at end of combat (CR 603.7, 511.1).
  const altair = /^(Whenever ~ attacks, exile up to one target .+ card from your graveyard) with an? ([a-z]+) counter on it\. Then for each ([a-z]+) card you own in exile with an? ([a-z]+) counter on it, create a tapped and attacking token that's a copy of it\. Exile those tokens at end of combat\.$/.exec(line);
  if (altair) {
    if (altair[2] !== altair[4] || altair[3] !== "creature") return fail(out, raw);
    const r = exileWithCounter(altair[1]!, altair[2]!);
    if (!r || r.t.event !== "selfAttacks" || r.t.body.targets[0]!.owner !== "you") return fail(out, raw);
    const filter: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
    const effects: Effect[] = [
      r.exile,
      { type: "tokenCopiesOfExiledWithCounter", counter: counterKind(altair[2]!), filter },
      { type: "delayed", when: "endOfCombat", each: "created", effects: [{ type: "exile", what: { ref: "subject" } }], text: "exile ~" },
    ];
    out.triggers.push({ ...r.t, body: { ...r.t.body, effects, text: line.slice("Whenever ~ attacks, ".length) } });
    return true;
  }
  // The Animus: "At the beginning of your end step, exile up to one target legendary creature card from a graveyard with a
  // memory counter on it.": any graveyard's, the counter on the card in exile (CR 122.1).
  const animusExile = /^(At the beginning of your end step, exile up to one target .+ card from a graveyard) with an? ([a-z]+) counter on it\.$/.exec(line);
  if (animusExile) {
    const r = exileWithCounter(animusExile[1]!, animusExile[2]!);
    if (!r || r.t.event !== "yourEndStep" || r.t.body.targets[0]!.owner) return fail(out, raw);
    out.triggers.push({ ...r.t, body: { ...r.t.body, effects: [r.exile], text: line.slice("At the beginning of your end step, ".length) } });
    return true;
  }
  // The Animus: "{T}: Until your next turn, target legendary creature you control becomes a copy of target creature card in
  // exile with a memory counter on it. Activate only as a sorcery.": read as the copy of "target exiled creature card" (a
  // face-up card in exile, CR 406.3, its printed characteristics, CR 707.2, rulings), that card with one or more memory
  // counters on it (TargetSpec.exiledWithCounter). Until your next turn (CR 611.2a). With either target illegal as it
  // resolves, nothing happens (rulings: there's nothing to copy, or nothing to become the copy).
  const animusCopy = /^(\{[^:]+\}: Until your next turn, target .+ becomes a copy of target) creature card in exile with an? ([a-z]+) counter on it(\. Activate only as a sorcery\.)$/.exec(line);
  if (animusCopy) {
    const a = parseActivated(`${animusCopy[1]} exiled creature card${animusCopy[3]}`);
    const e0 = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const card = a && a !== "fail" ? a.body.targets[1] : undefined;
    if (!a || a === "fail" || e0?.type !== "becomeCopy" || e0.duration !== "yourNextTurn" || e0.except || e0.what.ref !== "target" || e0.what.index !== 0 || e0.of.ref !== "target" || e0.of.index !== 1 || a.body.targets.length !== 2 || card?.kind !== "card" || !card.inExile || card.exiledWithCounter || !a.sorcerySpeed) return fail(out, raw);
    const counter = counterKind(animusCopy[2]!);
    const targets = [a.body.targets[0]!, { ...card, exiledWithCounter: counter, text: `target creature card in exile with a ${counter} counter on it` }];
    // The card as printed (CR 707.2), the front face of a double-faced card (CR 712.8a): `card`.
    const copy: Effect = { ...e0, of: { ref: "target", index: 1, card: true } };
    out.activated.push({ ...a, text: line, body: { ...a.body, targets, effects: [copy], text: line.slice(line.indexOf(": ") + 2) } });
    return true;
  }
  return false;
}
