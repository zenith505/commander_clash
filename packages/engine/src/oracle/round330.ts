// Round 330's sentences, triggers and whole texts, read before round 329's (round329Sentence, round329Trigger and
// round329WholeText in oracle/round329.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import { parseOne, replaceX, type Ctx } from "./body";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round330Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Karn, Living Legacy: "Pay any amount of mana. Look at that many cards from the top of your library, then put one of
  // those cards into your hand and the rest on the bottom of your library in a random order.": how much is chosen as it
  // resolves, then paid (rulings); with none paid, no card is looked at, and one looked at must go to the hand (rulings).
  // Disorienting Choice: "For each opponent, choose up to one target artifact or enchantment that player controls. For
  // each permanent chosen this way, its controller may exile it. Then if one or more of the chosen permanents are still
  // on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped,
  // then shuffle.": one "up to one" target for each opponent (CR 601.2c); each one's controller decides in turn order
  // from the next opponent on, seeing the earlier answers, then those chosen are exiled at once (rulings); then the
  // chosen ones still there count.
  const each = /^For each opponent, choose up to one target (.+?) that player controls$/.exec(s);
  const mayExile = /^For each permanent chosen this way, its controller may exile it$/.test(sentences[si + 1] ?? "");
  const then = /^Then if one or more of the chosen permanents are still on the battlefield, you (search your library for up to) that many (.+)$/.exec((sentences[si + 2] ?? "").replace(/\.$/, ""));
  if (each && mayExile && then && ctx.spell) {
    const before = ctx.targets.length;
    const fx = parseOne(`For each opponent, destroy up to one target ${each[1]!} that player controls`, ctx);
    const d = fx?.length === 1 ? fx[0] : undefined;
    if (d?.type !== "destroy" || d.what.ref !== "target" || d.what.index !== before || ctx.targets.length !== before + 1 || !ctx.targets[before]!.perOpponent) return "fail";
    ctx.whereX = true;
    const search = parseOne(`Search your library for up to X ${then[2]!}`, ctx);
    ctx.whereX = false;
    const sr = search?.length === 1 ? search[0] : undefined;
    if (sr?.type !== "search" || !sr.upTo || ctx.targets.length !== before + 1) return "fail";
    const what = { ref: "target" as const, index: before };
    const still = { count: { kind: "onBattlefieldOf" as const, of: what } };
    effects.push({ type: "controllersMayExile", what });
    return { effect: { type: "if", cond: { kind: "amountNow", amount: still, min: 1 }, effects: replaceX([sr], still) }, next: si + 3 };
  }
  if (/^Pay any amount of mana\.?$/.test(s)) {
    // The sentence list splits ", then" into its own sentence.
    const joined = [sentences[si + 1], sentences[si + 2]].join(" | ");
    const look = /^Look at that many cards from the top of your library \| (?:[Tt]hen )?put one of those cards into your hand and the rest on the bottom of your library in a random order\.?$/i.exec(joined);
    if (!look || ctx.spell) return null;
    effects.push({ type: "joinForces", who: { ref: "you" } });
    return { effect: { type: "dig", n: { count: { kind: "joinForcesPaid" } }, reveal: false, count: 1, upTo: false, into: "hand", rest: "bottom", random: true }, next: si + 3 };
  }
  return null;
}

export function round330Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Tyvar the Bellicose's granted "Whenever a mana ability of this creature resolves, put a number of +1/+1 counters on it
  // equal to the amount of mana this creature produced.": not a mana ability itself (it adds no mana, CR 605.1b), so it
  // goes on the stack, before the spell the mana paid for resolves (rulings); "This ability triggers only once each
  // turn" is read around it (parseTrigger).
  // Professor Hojo: "Whenever one or more creatures you control become the target of an activated ability, draw a card."
  // (with "This ability triggers only once each turn" read around it): anyone's activated ability, not a triggered one;
  // it resolves first, even if that ability is countered (rulings).
  const hojo = /^Whenever one or more creatures you control become the target of an activated ability, (.+)$/.exec(raw);
  if (hojo) {
    const t = parseTrigger(`Whenever a creature you control becomes the target of a spell or ability, ${hojo[1]!}`);
    if (!t || t === "fail" || t.event !== "permanentBecomesTarget" || t.targeted?.by || t.targeted?.spell || t.targeted?.first || t.subjectFilter?.kind !== "object" || !t.subjectFilter.types?.includes("Creature")) return "fail";
    return { ...t, targeted: { ...t.targeted, ability: true, activatedOnly: true } };
  }
  if (raw === "Whenever a mana ability of ~ resolves, put a number of +1/+1 counters on it equal to the amount of mana ~ produced.")
    return { event: "selfManaAbilityResolves", body: { targets: [], effects: [{ type: "counters", what: { ref: "self" }, counter: "+1/+1", n: { count: { kind: "eventAmount" } } }], text: "put a number of +1/+1 counters on it equal to the amount of mana it produced." } };
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round330WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  void text;
  void parse;
  return null;
}
