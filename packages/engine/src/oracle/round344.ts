// Round 344's sentences, read before round 343's (round343Sentence in oracle/round343.ts, which reads these first).
import type { CompiledCard, Effect } from "../abilities";
import type { CardDef } from "../types";
import { parseTargetPhrase } from "./targets";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { round345Sentence } from "./round345";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round344Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 345's sentences first (oracle/round345.ts).
  const r345 = round345Sentence(s, sentences, si, ctx, effects);
  if (r345 !== null) return r345;
  const line = plain(s);
  // The Foretold Soldier: "Whenever this creature deals damage, exile it face down. It becomes foretold." (CR 702.143a, d):
  // the permanent itself, still on the battlefield, castable by its owner on a later turn for its foretell cost.
  if (!ctx.spell && ctx.selfIt && /^[Ee]xile (?:it|~) face down$/.test(line) && plain(sentences[si + 1]) === "It becomes foretold") return { effect: { type: "foretellSelf" }, next: si + 2 };
  // The Eagles Are Coming!: "Choose target creature you own. If this spell was kicked, instead choose any number of target
  // creatures you own. Return each chosen creature to your hand.": one target or the other, whichever the kicker allows,
  // chosen as it's cast (CR 702.33g, as Expel the Unworthy); creatures you own, whoever controls them now.
  if (ctx.spell && si === 0 && line === "Choose target creature you own" && plain(sentences[1]) === "If ~ was kicked, instead choose any number of target creatures you own" && plain(sentences[2]) === "Return each chosen creature to your hand") {
    const at = ctx.targets.length;
    const one = parseSentence("Return target creature you own to your hand", ctx);
    const many = ctx.targets.length === at + 1 ? parseSentence("Return any number of target creatures you own to your hand", ctx) : null;
    const bounces = (fx: Effect[] | null | undefined) => fx?.length === 1 && fx[0]!.type === "bounce";
    if (!bounces(one) || !bounces(many) || ctx.targets.length !== at + 2 || ctx.targets.slice(at).some((t) => t.kind !== "object" || t.owner !== "you" || !t.types?.includes("Creature"))) return "fail";
    ctx.targets[at] = { ...ctx.targets[at]!, onlyIf: { cond: { kind: "kicked" }, not: true } };
    ctx.targets[at + 1] = { ...ctx.targets[at + 1]!, onlyIf: { cond: { kind: "kicked" } } };
    return { effect: { type: "if", cond: { kind: "kicked" }, effects: many!, otherwise: one! }, next: si + 3 };
  }
  // ... "At the beginning of the next upkeep, create a 4/4 white Bird Soldier creature token with flying for each creature
  // returned to your hand this way.": a delayed trigger (CR 603.7) at the next upkeep to begin, any player's, counting as
  // this resolves each creature the return put into your hand, tokens too (rulings; they cease to exist there, CR 111.7).
  const eagles = ctx.spell ? /^At the beginning of the next upkeep, (create .+) for each creature returned to your hand this way$/.exec(line) : null;
  const lastIf = effects[effects.length - 1];
  if (eagles && lastIf?.type === "if" && lastIf.cond.kind === "kicked" && [...lastIf.effects, ...(lastIf.otherwise ?? [])].every((x) => x.type === "bounce")) {
    const before = ctx.targets.length;
    const made = parseSentence(eagles[1]!.replace(/^c/, "C"), ctx);
    const token = made?.length === 1 && made[0]!.type === "createToken" && made[0]!.n === 1 && made[0]!.who?.ref === "you" ? made[0]! : undefined;
    if (!token || ctx.targets.length !== before) return "fail";
    return { effect: { type: "delayed", when: "nextTurnUpkeep", effects: [{ ...token, n: { count: { kind: "eventAmount" } } }], text: `${eagles[1]!} for each creature returned to your hand this way`, event: { amount: { count: { kind: "returnedFromCount" } } } }, next: si + 1 };
  }
  // Identity Thief: "you may exile another target nontoken creature. If you do, ~ becomes a copy of that creature until
  // end of turn. Return the exiled card to the battlefield under its owner's control at the beginning of the next end
  // step.": the return only for a card it exiled (a commander put into the command zone instead wasn't, CR 903.9a), one
  // delayed trigger (CR 603.7); the copy is of the creature as it last existed (CR 608.2h, 707.2), still a copy during
  // that end step (rulings).
  if (!ctx.spell && line === "Return the exiled card to the battlefield under its owner's control at the beginning of the next end step" && effects.length >= 2) {
    const [may, ifDid] = effects.slice(-2);
    const exile = may?.type === "may" && may.effects.length === 1 && may.effects[0]!.type === "exile" && may.effects[0]!.what.ref === "target" && !may.effects[0]!.what.n ? may.effects[0]! : undefined;
    const copy = ifDid?.type === "if" && ifDid.cond.kind === "amountNow" && ifDid.effects.length === 1 && ifDid.effects[0]!.type === "becomeCopy" ? ifDid.effects[0]! : undefined;
    if (exile?.type === "exile" && exile.what.ref === "target" && copy?.type === "becomeCopy" && copy.of.ref === "target" && copy.of.index === exile.what.index && !(ifDid as Extract<Effect, { type: "if" }>).otherwise && may!.type === "may") {
      const keys = Object.keys(exile).filter((k) => k !== "type" && k !== "what");
      if (keys.length) return "fail";
      may.effects = [{ type: "flicker", what: exile.what, under: "owner", at: "nextEndStep" }];
      effects.pop();
      return { effect: ifDid!, next: si + 1 };
    }
  }
  return null;
}

/**
 * Bronzehide Lion: "When ~ dies, return it to the battlefield. It's an Aura enchantment with enchant creature you control
 * and "{G}{W}: Enchanted creature gains indestructible until end of turn," and it loses all other abilities."; Old-Growth
 * Troll: "When ~ dies, if it was a creature, return it to the battlefield. It's an Aura enchantment with enchant Forest
 * you control and "Enchanted Forest has '{T}: Add {G}{G}' and '{1}, {T}, Sacrifice this land: Create ...'"" (a permanent
 * that dies is a creature here, CR 700.4, so the intervening if always holds). The ability it's given must compile on
 * that Aura (`compile`), or the line is unsupported.
 */
export function round344Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, d: CardDef, compile: (d: CardDef) => CompiledCard): boolean {
  // Harold and Bob, First Numens (round B295): "... and "Enchanted Forest has '...'" ~ loses all other abilities." The same
  // as Bronzehide Lion's "and it loses all other abilities", a sentence of its own (rulings: only the granted abilities).
  const m = /^When ~ dies, (?:if it was a creature, )?return it to the battlefield\. It's an Aura enchantment with enchant ((?:creature|Forest|land) you control) and "(.+?),?"(,? and it loses all other abilities| ~ loses all other abilities)?\.?$/.exec(line);
  if (!m || isSpell || !d.types.includes("Creature")) return false;
  const spec = parseTargetPhrase(m[1]!);
  // The granted text with its inner quotes as quotes ("Enchanted Forest has '{T}: Add {G}{G}'" ...), each ability ending in a period.
  // "Sacrifice this land" inside it (read as "~" on the creature card) is the land it's granted to.
  const land = /^(?:Forest|land) /.test(m[1]!);
  if (!land && m[2]!.includes("~")) return false;
  const ability = m[2]!.replace(/'([^']+?)\.?'/g, (_, x: string) => `"${x}."`).replace(/([^.!"])$/, "$1.").replaceAll("~", "this land");
  const enchantText = m[1]!;
  const check = spec?.kind === "object" ? compile({ ...d, oracleText: `Enchant ${enchantText}\n${ability}`, typeLine: "Enchantment — Aura", types: ["Enchantment"], subtypes: ["Aura"], keywords: [], faces: undefined } as CardDef) : undefined;
  if (spec?.kind !== "object" || !check || check.unsupported.length || !check.enchant) {
    out.unsupported.push(raw);
    return true;
  }
  out.triggers.push({ event: "selfDies", body: { targets: [], effects: [{ type: "returnAsAura", enchant: { ...spec, text: `${enchantText} to enchant` }, ability, ...(m[3] ? { loseOthers: true as const } : {}) }], text: line.replace(/^When ~ dies, /, "") } });
  return true;
}
