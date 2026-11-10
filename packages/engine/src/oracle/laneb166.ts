// Lane B round B166's sentences, read first in parseBodyText's round chain (parseBodyText is at TS2563's limit).
import type { Effect, TargetSpec } from "../abilities";
import { parseOne, type Ctx } from "./body";
import { X } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

export function roundB166Sentence(s: string, sentences: string[], si: number, ctx: Ctx): Found {
  // Welcome to the Fold: "Gain control of target creature if its toughness is 2 or less. If ~'s madness cost was paid,
  // instead gain control of that creature if its toughness is X or less.": any creature can be targeted, and its toughness
  // is checked only as the spell resolves (rulings); cast for its madness cost (CR 702.35b), X takes the 2's place.
  const fold = ctx.spell && ctx.targets.length === 0 ? /^(Gain control of target creature) if its toughness is (\d+) or less$/.exec(s) : null;
  if (fold && (sentences[si + 1] ?? "").replace(/\.$/, "") === "If ~'s madness cost was paid, instead gain control of that creature if its toughness is X or less") {
    const fx = parseOne(fold[1]!, ctx);
    if (!fx || fx.length !== 1 || fx[0]!.type !== "continuous" || fx[0]!.duration !== "game" || fx[0]!.mods.length !== 1 || fx[0]!.mods[0]!.kind !== "control" || ctx.targets.length !== 1 || ctx.targets[0]!.kind !== "object" || ctx.targets[0]!.optional) return "fail";
    const n = Number(fold[2]);
    const small: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], toughness: { max: n }, text: `with toughness ${n} or less` };
    const toughness = { count: { kind: "toughness" as const, of: { ref: "target" as const, index: 0 } } };
    return {
      effect: {
        type: "if",
        cond: { kind: "altPaid", alt: "madness" },
        effects: [{ type: "if", cond: { kind: "amountsCompare", a: X, atLeast: toughness }, effects: structuredClone(fx) }],
        otherwise: [{ type: "if", cond: { kind: "targetIs", index: 0, filter: small }, effects: fx }],
      },
      next: si + 2,
    };
  }
  // Avacyn's Judgment: "~ deals 2 damage divided as you choose among any number of targets. If ~'s madness cost was paid,
  // it deals X damage divided as you choose among those permanents and/or players instead.": the amount to divide is known
  // once the madness cost is chosen (CR 601.2b), before the division (601.2d), so it's X when cast that way and 2 otherwise,
  // any number of targets with at least 1 each (CR 601.2d).
  const judgment = ctx.spell && ctx.targets.length === 0 ? /^~ deals (\d+) damage divided as you choose among any number of targets$/.exec(s) : null;
  if (judgment && (sentences[si + 1] ?? "").replace(/\.$/, "") === "If ~'s madness cost was paid, it deals X damage divided as you choose among those permanents and/or players instead") {
    const fx = parseOne("~ deals X damage divided as you choose among any number of targets", ctx);
    const t = ctx.targets[0];
    if (!fx || fx.length !== 1 || fx[0]!.type !== "damage" || ctx.targets.length !== 1 || !t?.divided?.amount || t.divided.amount.count.kind !== "x" || !t.many) return "fail";
    t.divided = { ...t.divided, amount: { count: { kind: "constant", n: Number(judgment[1]) } }, altAmount: { alt: "madness", amount: X } };
    return { effect: { ...fx[0]!, amount: { count: { kind: "constant", n: Number(judgment[1]) } } }, next: si + 2 };
  }
  // Rogues' Gallery: "For each color, return up to one target creature card of that color from your graveyard to your hand":
  // one optional target for each of the five colors (CR 105.1), all for one instance of the word "target", so a
  // multicolored card fills only one of them (CR 601.2c).
  if (ctx.spell && ctx.targets.length === 0 && sentences.length === 1 && /^For each color, return up to one target creature card of that color from your graveyard to your hand$/.test(s)) {
    for (const color of ["white", "blue", "black", "red", "green"]) {
      const at: number = ctx.targets.length;
      const fx = parseOne(`Return up to one target ${color} creature card from your graveyard to your hand`, ctx);
      const spec = ctx.targets[at];
      if (!fx || fx.length !== 1 || fx[0]!.type !== "bounce" || ctx.targets.length !== at + 1 || spec?.kind !== "card" || !spec.optional || spec.colors?.length !== 1) return "fail";
      if (at) spec.distinctFrom = Array.from({ length: at }, (_, j) => j);
    }
    // The five returned together, as one instruction.
    return { effect: { type: "bounce", what: { ref: "target", index: 0, n: 5 } }, next: si + 1 };
  }
  // Bribe Taker: "for each kind of counter on permanents you control, you may put your choice of a +1/+1 counter or a
  // counter of that kind on ~" (its enters trigger).
  if (!ctx.spell && /^[Ff]or each kind of counter on permanents you control, you may put your choice of a \+1\/\+1 counter or a counter of that kind on ~$/.test(s))
    return { effect: { type: "counterKindsBribe" }, next: si + 1 };
  return null;
}
