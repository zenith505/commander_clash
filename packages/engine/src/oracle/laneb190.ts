// Lane B round B190's lines, read by compileCard before its triggers and activated abilities (after round B187's), and
// its sentences, read at the end of round B187's.
import type { CompiledCard, Effect, ObjRef } from "../abilities";
import { reflexiveBody, type Ctx } from "./body";
import { parseStaticCondition } from "./statics";
import { parsePlayer } from "./targets";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB190Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Awesome Presence: "Enchanted creature can't be blocked unless defending player pays {3} for each creature they control
  // that's blocking it.": a cost to block it, {3} for each creature blocking it, totalled with the other block costs and
  // paid as blockers are declared (CR 509.1d-f); nothing obliges paying it, so no requirement makes one block it (CR
  // 509.1c). A creature blocking it as well as another attacker pays for this one only (rulings: once per creature).
  const blocked = /^Enchanted creature can't be blocked unless defending player pays \{(\d+)\} for each creature they control that's blocking it\.$/.exec(line);
  if (blocked) {
    out.statics.push({ affects: { kind: "attached" }, mods: [{ kind: "blockedTax", n: Number(blocked[1]) }], text: line });
    return true;
  }
  // Wall of Mourning: "Coven — At the beginning of your end step, if you control three or more creatures with different
  // powers, put a card exiled with ~ into its owner's hand.": the cards its enters ability exiled face down, which nobody
  // may look at, so with more than one it's chosen at random (rulings, CR 607.2a).
  const coven = /^((?:Coven — )?At the beginning of your end step, if you control three or more creatures with different powers, )put a card exiled with ~ into its owner's hand\.$/.exec(line);
  if (coven) {
    const t = parseTrigger(`${coven[1]}draw a card.`);
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.ifCond?.kind !== "coven" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "draw") out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "moveLinked", dest: "hand", one: true, random: true }], text: "put a card exiled with ~ into its owner's hand." } });
    return true;
  }
  return false;
}

export function roundB190Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Wall of Mourning: "exile a card from the top of your library face down for each opponent you have": one for each
  // opponent you have as it resolves (CR 102.2; one who left the game isn't, CR 800.4a); nobody may look at them, not even
  // you (rulings, CR 406.3).
  if (/^[Ee]xile a card from the top of your library face down for each opponent you have$/.test(s))
    return { effect: { type: "exileFaceDown", from: "top", n: { count: { kind: "players", opponents: true }, times: 1 } }, next: si + 1 };
  // Induced Amnesia: "target player exiles all cards from their hand face down, then draws that many cards": as many as
  // they exiled; nobody may look at those cards (rulings, CR 406.3), returned by its other ability (CR 607.2a).
  // (Split in two sentences: "That player draws that many cards".)
  if (/^[Tt]arget player exiles all cards from their hand face down$/.test(s) && sentences[si + 1] === "That player draws that many cards") {
    const who = parsePlayer("target player", ctx);
    if (who?.ref !== "target") return "fail";
    effects.push({ type: "exileFaceDown", from: "hand", who, actor: who });
    return { effect: { type: "draw", who, n: { count: { kind: "faceDownExiledThisWay" } } }, next: si + 2 };
  }
  // Triton Tactics: "At this turn's next end of combat, tap each creature that was blocked by one of those creatures this
  // turn and it doesn't untap during its controller's next untap step.": the attackers each of the targets blocked this
  // turn (TurnLog.blocks), those targets as they are as the spell resolves, the illegal ones left out (CR 608.2b), as
  // Venomous Breath's (rulings), found when the delayed ability resolves (CR 603.7c).
  if (s === "At this turn's next end of combat, tap each creature that was blocked by one of those creatures this turn and it doesn't untap during its controller's next untap step") {
    const prev = effects[effects.length - 1];
    if (!ctx.spell || prev?.type !== "untap" || prev.what.ref !== "target" || !prev.what.n) return "fail";
    const them: ObjRef = { ref: "blockHistory", of: prev.what, blocked: true };
    return { effect: { type: "delayed", when: "endOfCombat", thisTurn: true, effects: [{ type: "tap", what: them }, { type: "skipUntap", what: them }], text: "tap each creature that was blocked by one of those creatures this turn and it doesn't untap during its controller's next untap step" }, next: si + 1 };
  }
  // Evolving Door: "Count the colors of the sacrificed creature, then search your library for a creature card that's exactly
  // that many colors plus one. Exile that card, then shuffle. You may cast the exiled card.": the creature as it last
  // existed on the battlefield (rulings, CR 608.2h), only how many colors it was, not which (rulings); the card cast as
  // this resolves or not at all, paying its costs (rulings, CR 608.2g).
  // (Split in four sentences.)
  if (s === "Count the colors of the sacrificed creature" && sentences[si + 1] === "Search your library for a creature card that's exactly that many colors plus one" && sentences[si + 2] === "Exile that card, then shuffle" && sentences[si + 3] === "You may cast the exiled card") {
    if (!ctx.activated || ctx.spell || si + 4 !== sentences.length) return "fail";
    effects.push({ type: "search", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card that's exactly that many colors plus one", bound: { key: "colorsN", at: "exact", amount: { count: { kind: "colorsOf", of: { ref: "sacrificed" } }, plus: 1 } } }, n: 1, upTo: false, reveal: false, dest: { zone: "exile" }, rememberExiled: true });
    return { effect: { type: "castNow", what: { ref: "exiledTop" } }, next: si + 4 };
  }
  // Blood Spatter Analysis: "Then sacrifice it if it has five or more bloodstain counters on it. When you do, return target
  // creature card from your graveyard to your hand.": checked only as this ability resolves (rulings), the source still on
  // the battlefield as that object and yours to sacrifice (CR 701.21a); sacrificing it this way triggers the reflexive
  // ability, whose target is chosen as it's put on the stack (CR 603.12, rulings).
  const sac = /^(?:Then )?[Ss]acrifice it if it has (\w+) or more (\w+) counters on it$/.exec(s);
  const when = sac ? /^When you do, (.+)$/.exec(sentences[si + 1] ?? "") : null;
  if (sac && when) {
    if (ctx.spell || si + 2 !== sentences.length) return "fail";
    const cond = parseStaticCondition(`~ has ${sac[1]} or more ${sac[2]} counters on it`, { affects: { kind: "self" }, mods: [], text: "" });
    const reflexive = reflexiveBody(when[1]!, ctx);
    if (!cond || !reflexive) return "fail";
    return { effect: { type: "if", cond: { kind: "selfHere", yours: true }, effects: [{ type: "if", cond: { kind: "state", cond }, effects: [{ type: "sacrifice", what: { ref: "self" } }, { type: "reflexive", body: reflexive }] }] }, next: si + 2 };
  }
  return null;
}
