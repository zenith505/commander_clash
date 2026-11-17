// Round 394's whole lines (compile.ts): tokens created under your control instead (Crafty Cutpurse), one of the attacking
// creatures that died returned (Rinoa, Angel Wing), and Curses returned attached to you, then moved to an opponent (Lynde,
// Cheerful Tormentor). The effects run in effects/run-round394.ts.
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** One whole line of round 394's (compile.ts); false when it isn't one of these. */
export function round394Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Crafty Cutpurse: a replacement effect for the rest of the turn (CR 611.2a, 616.1b; counters.ts tokenMaker).
  const cut = /^When (~|this creature) enters, each token that would be created under an opponent's control this turn is created under your control instead\.$/.exec(line);
  if (cut) {
    const t = isSpell ? null : parseTrigger("When ~ enters, draw a card.");
    if (!t || t === "fail" || t.event !== "selfEnters") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "stealTokensThisTurn" }], text: "each token that would be created under an opponent's control this turn is created under your control instead." } });
    return true;
  }
  // Rinoa, Angel Wing: one trigger for each event in which attacking creatures you control die (CR 603.2c, 603.10a: as
  // they last existed, Rinoa itself too, rulings), "them" the cards they became (BatchTrigger `them`).
  const rinoa = /^Whenever one or more attacking creatures you control die, you may return one of them to the battlefield tapped under its owner's control with an? (flying) counter on it\. Do this only once each turn\.$/.exec(line);
  if (rinoa) {
    const t = isSpell ? null : parseTrigger("Whenever one or more attacking creatures you control die, draw a card.");
    if (!t || t === "fail" || t.event !== "batch" || t.batch?.what !== "leaves" || !t.batch.dies || t.batch.filter?.combat !== "attacking") return fail(out, raw);
    const effects: Effect[] = [{ type: "returnOneOfThem", counters: { [rinoa[1]!]: 1 } }];
    out.triggers.push({ ...t, batch: { ...t.batch, them: true }, body: { targets: [], effects, text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  // Lynde, Cheerful Tormentor: "Whenever a Curse is put into your graveyard from the battlefield, return it to the
  // battlefield attached to you at the beginning of the next end step." The Curse card, if it's still in your graveyard
  // then (CR 400.7, 603.7), under your control; only if it could enchant you, else it stays there (CR 303.4f-g).
  if (line === "Whenever a Curse is put into your graveyard from the battlefield, return it to the battlefield attached to you at the beginning of the next end step.") {
    const t = isSpell ? null : parseTrigger("Whenever a Curse is put into your graveyard from the battlefield, return it to the battlefield at the beginning of the next end step.");
    const put = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || put?.type !== "putOntoBattlefield" || !put.atNextEndStep || put.what.ref !== "subjectCard") return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...put, attachToYou: true }], text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  // Lynde: "At the beginning of your upkeep, you may attach a Curse attached to you to one of your opponents. If you do,
  // draw two cards." (moveCurseToOpponent sets "did").
  if (line === "At the beginning of your upkeep, you may attach a Curse attached to you to one of your opponents. If you do, draw two cards.") {
    const t = isSpell ? null : parseTrigger("At the beginning of your upkeep, draw two cards.");
    const draw = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || draw?.type !== "draw") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "moveCurseToOpponent" }, { type: "if", cond: { kind: "youDid" }, effects: [draw] }], text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  return false;
}
