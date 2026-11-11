// Lane B round B178's lines, read by compileCard before its triggers and activated abilities (after round B177's), and
// its sentences, read at the end of round B177's.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseStaticCondition } from "./statics";
import { parseObject } from "./targets";
import { QUOTED_SOURCE_NAME } from "./compile";
import { roundB179Sentence } from "./laneb179";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB178Line(line: string, _raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Gutter Grime's Ooze, Saproling Burst's Saproling: "This token's power and toughness are each equal to the number of
  // slime counters on Gutter Grime.", the name filled in as the token was created (createToken): a characteristic-defining
  // ability (CR 604.3) counting them on the permanent of that name whose ability created this token, the one it
  // remembers (rulings); 0 once that one has left the battlefield (rulings). Only a token's text names another card so.
  const onCreator = /^~'s power and toughness are each equal to the number of ([a-z]+) counters on ((?!~)[A-Z][^.]*)\.$/.exec(line);
  if (onCreator) {
    const n = { count: { kind: "countersOnCreator" as const, counter: onCreator[1]!, name: onCreator[2]! } };
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "definePT", power: n, toughness: n }], text: line });
    return true;
  }
  // Melira, the Living Cure: "If you would get one or more poison counters, instead you get one poison counter and you
  // can't get additional poison counters this turn.": a replacement effect on each event putting poison counters on you
  // (CR 614.1a), applied last among those (CR 616.1, its controller choosing the order: rulings); once it applies, no
  // more poison counters this turn, even after ~ is gone (rulings; TurnLog.noMorePoison).
  if (line === "If you would get one or more poison counters, instead you get one poison counter and you can't get additional poison counters this turn.") {
    out.onePoisonForYou = true;
    return true;
  }
  return false;
}

export function roundB178Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Melira, the Living Cure: "Exile ~: Choose another target creature or artifact. When it's put into a graveyard this turn,
  // return that card to the battlefield under its owner's control.": choosing the target is targeting it (CR 115.1); a
  // delayed trigger about it (CR 603.7), any permanent it is then put into a graveyard from the battlefield (CR 700.4),
  // the card it became there (CR 400.7: a token doesn't return); once only.
  if (s === "Choose another target creature or artifact" && sentences[si + 1]?.replace(/\.$/, "") === "When it's put into a graveyard this turn, return that card to the battlefield under its owner's control" && ctx.activated && !ctx.spell && !effects.length) {
    const what = parseObject("another target creature or artifact", ctx);
    if (what?.ref !== "target" || what.n) return "fail";
    return { effect: { type: "delayed", when: "dies", of: what, anyPermanent: true, effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" }, owner: true }], text: "return that card to the battlefield under its owner's control", thisTurn: true }, next: si + 2 };
  }
  // Heliod's Punishment's granted ability, after "Remove a task counter from Heliod's Punishment": "Then if it has no task
  // counters on it, destroy Heliod's Punishment.": "it" is the Aura giving the ability (rulings: only that one), counted
  // as this resolves; nothing happens once it has left the battlefield.
  const noneLeft = new RegExp(`^(?:Then )?[Ii]f it has no ([a-z]+) counters on it, destroy ${QUOTED_SOURCE_NAME}$`).exec(s);
  if (noneLeft) {
    const last = effects[effects.length - 1];
    if (last?.type !== "removeCounters" || last.what.ref !== "grantSource" || last.counter !== noneLeft[1]) return "fail";
    return { effect: { type: "if", cond: { kind: "state", cond: { kind: "amount", amount: { count: { kind: "counters", counter: noneLeft[1]!, of: { ref: "grantSource" } } }, max: 0 } }, effects: [{ type: "destroy", what: { ref: "grantSource" } }] }, next: si + 1 };
  }
  // Psychic Rebuttal, after "Counter target instant or sorcery spell that targets you": "Spell mastery — If there are two or
  // more instant and/or sorcery cards in your graveyard, you may copy the spell countered this way. You may choose new
  // targets for the copy.": checked as it resolves, after the counter (rulings); only a spell it really countered is
  // copied, as it last was on the stack (its X, mode and additional costs, CR 707.10), and the copy isn't cast.
  const mastery = /^If (there are \w+ or more instant and\/or sorcery cards in your graveyard), you may copy the spell countered this way$/.exec(s);
  if (mastery) {
    const last = effects[effects.length - 1];
    const cond = parseStaticCondition(mastery[1]!, { affects: { kind: "self" }, mods: [], text: "" });
    if (last?.type !== "counterSpell" || last.unless || last.exile || last.cause || !cond || sentences[si + 1]?.replace(/\.$/, "") !== "You may choose new targets for the copy") return "fail";
    last.copyCountered = true;
    return { effect: { type: "if", cond: { kind: "state", cond }, effects: [{ type: "may", effects: [{ type: "copySpell", spell: "countered", n: 1, newTargets: true }], text: "copy the spell countered this way" }] }, next: si + 2 };
  }
  return roundB179Sentence(s, sentences, si, ctx, effects);
}
