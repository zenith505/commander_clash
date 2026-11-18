// Lane B round B257's sentences, read at the end of round B256's chain (roundB256Sentence in oracle/laneb256.ts): Shell of
// the Last Kappa's "Exile target instant or sorcery spell that targets you" and Eye for an Eye's damage rule.
import type { Effect } from "../abilities";
import { addTarget, parseBody, type Ctx } from "./body";
import { parseTargetPhrase } from "./targets";
import { roundB258Sentence } from "./laneb258";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB257Sentence(s: string, sentences: string[], si: number, ctx: Ctx): Found {
  // Shell of the Last Kappa: "Exile target instant or sorcery spell that targets you": a spell with you among its targets
  // (rulings), as Psychic Rebuttal's counter; it leaves the stack without being countered, so even one that can't be
  // countered goes (rulings, CR 701.6a). The card (a copy ceases to exist, CR 707.10a) is linked to the Shell for its other
  // ability (CR 607.2a, compile.ts).
  if (ctx.activated && plain(s) === "Exile target instant or sorcery spell that targets you") {
    const kinds = parseTargetPhrase("instant or sorcery spell");
    if (kinds?.kind !== "spell") return "fail";
    return { effect: { type: "counterSpell", index: addTarget(ctx, { ...kinds, targetsWhat: "you", text: "target instant or sorcery spell that targets you" }), exileSpell: true }, next: si + 1 };
  }
  // Eye for an Eye: "The next time a source of your choice would deal damage to you this turn, instead that source deals
  // that much damage to you and ~ deals that much damage to that source's controller.": Deflecting Palm's rule (a source
  // chosen as it resolves, CR 609.7a; the next damage event only, CR 615.8), a replacement that keeps the damage (CR
  // 614.1a) and adds the same amount, dealt by this card (rulings), to whoever controls the source as it would deal it
  // (DamageRule.echo, damage.ts planShields). It must resolve before the damage would be dealt (rulings).
  if (ctx.spell && plain(s) === "The next time a source of your choice would deal damage to you this turn, instead that source deals that much damage to you and ~ deals that much damage to that source's controller") {
    const b = parseBody("The next time a source of your choice would deal damage to you this turn, prevent that damage.", { spell: true });
    const e = b?.effects.length === 1 && !b.targets.length ? b.effects[0] : undefined;
    if (e?.type !== "damageRule" || !e.rule.nextTime || !e.rule.by?.choose || e.rule.to?.players !== "you" || e.rule.dealBack || e.rule.redirect) return "fail";
    return { effect: { ...e, rule: { ...e.rule, echoToSourceController: true } }, next: si + 1 };
  }
  return roundB258Sentence(s, sentences, si, ctx);
}
