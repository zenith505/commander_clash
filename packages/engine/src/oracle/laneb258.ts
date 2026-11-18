// Lane B round B258's sentences, read at the end of round B257's chain (roundB257Sentence in oracle/laneb257.ts): Sorrow's
// Path's and General Jarkeld's swaps of blocks, and Worms of the Earth's upkeep choice.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parsePunisherOptions } from "./sentences/basics";
import { roundB259Sentence } from "./laneb259";
import { parseObject } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB258Sentence(s: string, sentences: string[], si: number, ctx: Ctx): Found {
  // Sorrow's Path: "Choose two target blocking creatures controlled by the same opponent. If each of those creatures could
  // block all creatures that the other is blocking, remove both of them from combat. Each one then blocks all creatures the
  // other was blocking.": both targets have one controller, an opponent, as they're chosen and as it resolves (CR 115.1,
  // 608.2b); whether the swap can be done is only worked out as it resolves (rulings). Effect swapBlockers.
  if (plain(s) === "Choose two target blocking creatures controlled by the same opponent") {
    if (plain(sentences[si + 1]) !== "If each of those creatures could block all creatures that the other is blocking, remove both of them from combat" || plain(sentences[si + 2]) !== "Each one then blocks all creatures the other was blocking") return "fail";
    if (!ctx.activated || ctx.targets.length) return "fail";
    const both = parseObject("two target blocking creatures an opponent controls", ctx);
    if (both?.ref !== "target" || both.index !== 0 || ctx.targets.length !== 2) return "fail";
    ctx.targets[1] = { ...ctx.targets[1]!, sameControllerAs: [0], text: `${ctx.targets[1]!.text} with the same controller` };
    return { effect: { type: "swapBlockers", a: { ref: "target", index: 0 }, b: { ref: "target", index: 1 } }, next: si + 3 };
  }
  // General Jarkeld: "Choose two target blocked attacking creatures. If each of those creatures could be blocked by all
  // creatures that the other is blocked by, each creature that's blocking exactly one of those attacking creatures stops
  // blocking it and is blocking the other attacking creature.": a blocked creature is an attacking one (CR 509.1h), anyone's.
  // Effect swapBlocked.
  if (plain(s) === "Choose two target blocked attacking creatures") {
    if (plain(sentences[si + 1]) !== "If each of those creatures could be blocked by all creatures that the other is blocked by, each creature that's blocking exactly one of those attacking creatures stops blocking it and is blocking the other attacking creature") return "fail";
    if (!ctx.activated || ctx.targets.length) return "fail";
    const both = parseObject("two target blocked creatures", ctx);
    if (both?.ref !== "target" || both.index !== 0 || ctx.targets.length !== 2 || ctx.targets.some((t) => t.kind !== "object" || t.combat !== "blocked")) return "fail";
    ctx.targets = ctx.targets.map((t) => ({ ...t, text: "target blocked attacking creature" }));
    return { effect: { type: "swapBlocked", a: { ref: "target", index: 0 }, b: { ref: "target", index: 1 } }, next: si + 2 };
  }
  // Worms of the Earth: "any player may sacrifice two lands of their choice or have ~ deal 5 damage to that player. If a
  // player does either, destroy ~.": a punisher whose instruction happens once if anyone did either (Vexing Devil's rulings:
  // each player in turn order chooses, CR 101.4; the damage counts as done even if it's prevented). Sacrificing needs two
  // lands to sacrifice (punisherOptions).
  if (plain(s) === "any player may sacrifice two lands of their choice or have ~ deal 5 damage to that player" && plain(sentences[si + 1]) === "If a player does either, destroy ~") {
    if (ctx.spell || ctx.activated) return "fail";
    const sac = parsePunisherOptions("sacrifices two lands of their choice", ctx);
    const dmg = parsePunisherOptions("have ~ deal 5 damage to that player", ctx);
    if (sac?.length !== 1 || dmg?.length !== 1) return "fail";
    return { effect: { type: "punisher", who: { ref: "eachPlayer" }, options: [...sac, ...dmg], effects: [{ type: "destroy", what: { ref: "self" } }], mode: "ifAny", thenText: "destroy ~" }, next: si + 2 };
  }
  return roundB259Sentence(s, sentences, si, ctx);
}
