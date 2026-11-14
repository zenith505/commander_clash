// Round 361's sentences, read before round 360's (round360Sentence in oracle/round360.ts reads these first), and its whole
// lines (compile.ts, after round 360's): damage to each opponent equal to how many more lands they control than you, then
// Treasures for the damage dealt (Spiteful Repossession); a "choose one that hasn't been chosen" trigger that also costs
// life (Zuko, Conflicted); a reflexive trigger about the card exiled from your graveyard (Resplendent Marshal); a creature
// given to an opponent, goaded for as long as they control it (Vislor Turlough); and an end step draw whose discard is
// skipped after a face-down permanent entered or one was turned face up (Oblivious Bookworm).
import type { AbilityBody, CompiledCard, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseCount } from "./counts";
import { parseSentence } from "./sentence";
import { parseTrigger } from "./triggers";
import { round362Sentence } from "./round362";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round361Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 362's sentences first (oracle/round362.ts).
  const r362 = round362Sentence(s, sentences, si, ctx, effects);
  if (r362) return r362;
  const line = plain(s);
  const next = plain(sentences[si + 1]);
  // Spiteful Repossession: "~ deals damage to each opponent who controls more lands than you equal to the difference. Then
  // create a number of Treasure tokens equal to the damage dealt this way.": each opponent's own amount, the lands they
  // control less the lands you control as it resolves, all dealt at once (CR 120.3); an opponent with no more lands than
  // you is dealt none (CR 120.8). The Treasures are as many as the damage actually dealt, after prevention (CR 120.4).
  if (ctx.spell && line === "~ deals damage to each opponent who controls more lands than you equal to the difference" && next === "Then create a number of Treasure tokens equal to the damage dealt this way" && !effects.length && !ctx.targets.length && sentences.length === si + 2) {
    const fx = parseSentence("~ deals damage to each opponent equal to the number of lands that player controls", ctx);
    const dmg = fx?.length === 1 ? fx[0]! : undefined;
    const theirs = dmg?.type === "damage" && typeof dmg.amount === "object" && "count" in dmg.amount ? dmg.amount.count : undefined;
    const yours = parseCount("the number of lands you control", ctx);
    const tr = parseSentence("Create a Treasure token", ctx);
    const treasure = tr?.length === 1 ? tr[0]! : undefined;
    if (dmg?.type !== "damage" || dmg.to.ref !== "eachOpponent" || dmg.also || theirs?.kind !== "permanents" || theirs.whose?.ref !== "eachOne" || !yours || !("count" in yours) || yours.count.kind !== "permanents" || treasure?.type !== "createToken" || treasure.n !== 1) return "fail";
    effects.push({ ...dmg, amount: { count: { kind: "difference", of: [theirs, yours.count] } } });
    return { effect: { ...treasure, n: { count: { kind: "damageThisWay" } } }, next: si + 2 };
  }
  return null;
}

/** Zuko, Conflicted's whole line. */
const ZUKO = /^At the beginning of your first main phase, choose one that hasn't been chosen and you lose (\d+) life — ((?:• [^•]+)+)$/;
/** Resplendent Marshal's whole line. */
const MARSHAL = "When ~ enters or dies, you may exile another creature card from your graveyard. When you do, put a +1/+1 counter on each creature you control other than ~ that shares a creature type with the exiled card.";
/** Vislor Turlough's whole line (after its flavor word). */
const VISLOR = /^(?:Deal with the Black Guardian — )?When ~ enters, you may have an opponent gain control of it\. If you do, it's goaded for as long as they control it\.$/;
/** Oblivious Bookworm's whole line. */
const BOOKWORM = "At the beginning of your end step, you may draw a card. If you do, discard a card unless a permanent entered the battlefield face down under your control this turn or you turned a permanent face up this turn.";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

export function round361Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Zuko, Conflicted: "choose one that hasn't been chosen and you lose 2 life —": a mode this object hasn't had chosen
  // (CR 700.2, 400.7), and the life lost whichever mode it is, first, as the text has it; with no mode left to choose, the
  // ability is removed from the stack and no life is lost (CR 603.3c). Under an opponent's control it triggers in their
  // first main phase, and they make the choices (rulings). "Exile ~, then return him to the battlefield under an
  // opponent's control": an opponent chosen as it resolves, and a new object, with no modes chosen yet (CR 400.7).
  const zuko = ZUKO.exec(line);
  if (zuko) {
    const bullets = zuko[2]!.split("•").map((b) => b.trim()).filter(Boolean);
    const lose = `You lose ${zuko[1]} life.`;
    const rewritten = bullets.map((b) => `• ${lose} ${b.replace(/^Exile ~, then return (?:~|him|her|it) to the battlefield under an opponent's control\.$/, "Exile ~, then return it to the battlefield under an opponent's control.")}`);
    const t = isSpell ? null : parseTrigger(`At the beginning of your first main phase, choose one that hasn't been chosen — ${rewritten.join(" ")}`);
    const modal = t && t !== "fail" ? t.body.modal : undefined;
    if (!t || t === "fail" || t.event !== "yourFirstMain" || !modal || modal.unchosen !== "ever" || modal.modes.length !== bullets.length || modal.modes.some((m) => m.effects[0]?.type !== "loseLife")) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, text: raw.replace(/^At the beginning of your first main phase, /, ""), modal: { ...modal, modes: modal.modes.map((m, i) => ({ ...m, text: `${bullets[i]!} (You lose ${zuko[1]} life.)` })) } } });
    return true;
  }
  // Resplendent Marshal: "When ~ enters or dies, you may exile another creature card from your graveyard. When you do, put a
  // +1/+1 counter on each creature you control other than ~ that shares a creature type with the exiled card.": two
  // triggers. The card is chosen as it resolves (not a target), not ~ itself (in the graveyard when it died); exiling one
  // triggers the reflexive ability (CR 603.12), about that card: players can respond knowing its creature types (rulings).
  if (line === MARSHAL) {
    const both = isSpell ? [] : [parseTrigger("When ~ enters, you may exile a creature card other than ~ from your graveyard. When you do, draw a card."), parseTrigger("When ~ dies, you may exile a creature card other than ~ from your graveyard. When you do, draw a card.")];
    if (both.length !== 2 || both.some((x) => !x || x === "fail")) return fail(out, raw);
    const filter: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature you control other than ~ that shares a creature type with the exiled card" };
    const reflexive: AbilityBody = { targets: [], effects: [{ type: "kinCounters", counter: "+1/+1", n: 1, filter }], text: "Put a +1/+1 counter on each creature you control other than ~ that shares a creature type with the exiled card." };
    for (const x of both as TriggeredAbility[]) {
      const [may, did] = x.body.effects;
      const pick = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
      const r = did?.type === "if" && did.cond.kind === "youDid" && did.effects.length === 1 ? did.effects[0] : undefined;
      if (x.body.effects.length !== 2 || pick?.type !== "chooseFromGraveyard" || pick.dest !== "exile" || pick.n !== 1 || !pick.notSelf || pick.who || r?.type !== "reflexive") return fail(out, raw);
      out.triggers.push({ ...x, body: { targets: [], effects: [may!, { type: "if", cond: { kind: "youDid" }, effects: [{ type: "reflexive", body: reflexive, aboutYardChosen: true }] }], text: MARSHAL.replace(/^When ~ enters or dies, /, "") } });
    }
    return true;
  }
  // Vislor Turlough: "When ~ enters, you may have an opponent gain control of it. If you do, it's goaded for as long as they
  // control it.": the opponent chosen as it resolves (not a target); control for the rest of the game (CR 611.2a), only if
  // ~ is still this object on the battlefield. Then it's goaded by you, the trigger's controller (CR 701.15a), for as long
  // as that player controls it rather than until your next turn (CR 611.2b): over once it leaves or anyone else gains
  // control of it, and not again if they regain it.
  if (VISLOR.test(line)) {
    const t = isSpell ? null : parseTrigger("When ~ enters, exile ~, then return it to the battlefield under an opponent's control.");
    const choose = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || choose?.type !== "choose" || choose.choice !== "opponent") return fail(out, raw);
    const give: Effect = { type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" }, setsDid: true };
    const goad: Effect = { type: "continuous", what: { ref: "self" }, mods: [{ kind: "goad" }], duration: "whileControlled", whileControlledBy: { ref: "chosenPlayer" } };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "may", effects: [choose, give], text: "have an opponent gain control of ~" }, { type: "if", cond: { kind: "youDid" }, effects: [goad] }], text: "you may have an opponent gain control of it. If you do, it's goaded for as long as they control it." } });
    return true;
  }
  // Oblivious Bookworm: "At the beginning of your end step, you may draw a card. If you do, discard a card unless a
  // permanent entered the battlefield face down under your control this turn or you turned a permanent face up this
  // turn.": checked as it resolves, after the draw (rulings): one that was face down as it entered, whatever happened to
  // it since (TurnLog.entered), or one you turned face up, by the special action or an effect of yours (CR 116.2b, 708.8).
  if (line === BOOKWORM) {
    const t = isSpell ? null : parseTrigger("At the beginning of your end step, you may draw a card. If you do, discard a card.");
    const [may, did] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.body.effects.length !== 2 || may?.type !== "may" || did?.type !== "if" || did.cond.kind !== "youDid" || did.effects.length !== 1 || did.effects[0]!.type !== "discard") return fail(out, raw);
    const spared = { kind: "anyOf" as const, conds: [{ kind: "youEntered" as const, types: [], n: 1, faceDown: true as const }, { kind: "youTurnedFaceUp" as const }] };
    out.triggers.push({ ...t, body: { ...t.body, effects: [may, { ...did, effects: [{ type: "if", cond: { kind: "state", cond: spared }, effects: [], otherwise: did.effects }] }], text: BOOKWORM.replace(/^At the beginning of your end step, /, "") } });
    return true;
  }
  return false;
}
