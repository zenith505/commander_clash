// Lane B round B255's sentences, read at the end of round B254's chain (roundB254Sentence in oracle/laneb254.ts): Coward
// (Coward // Killer) and Whims of the Fates. Killer's recipients are read with the other "target creature and each other
// creature that shares ... with it" phrases (oracle/targets.ts); Gift of Doom's lines in oracle/keyword-abilities.ts.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseObject } from "./targets";
import { CREATURE_TYPES } from "../keywords";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB255Sentence(s: string, _sentences: string[], si: number, ctx: Ctx): Found {
  let m: RegExpExecArray | null;
  // Coward: "Target creature can't block this turn and becomes a Coward in addition to its other types until end of turn.":
  // one effect on the target until the turn ends (CR 514.2), the creature type added in layer 4 (CR 205.1b, 613.1d) and its
  // other types kept; nothing if it's an illegal target as the spell resolves (CR 608.2b).
  if (ctx.spell && (m = /^Target creature can't block this turn and becomes an? ([A-Z][a-z]+) in addition to its other types until end of turn$/.exec(plain(s))) && CREATURE_TYPES.has(m[1]!)) {
    const what = parseObject("target creature", ctx);
    if (what?.ref !== "target" || what.n) return "fail";
    return { effect: { type: "continuous", what, mods: [{ kind: "cantBlock" }, { kind: "addTypes", types: [], subtypes: [m[1]!] }], duration: "endOfTurn" }, next: si + 1 };
  }
  // Whims of the Fates: "Starting with you, each player separates all permanents they control into three piles. Then each
  // player chooses one of their piles at random and sacrifices those permanents." (the reminder "(Piles can be empty.)" is
  // gone by now).
  if (ctx.spell && plain(s) === "Starting with you, each player separates all permanents they control into three piles" && plain(_sentences[si + 1]) === "Then each player chooses one of their piles at random and sacrifices those permanents")
    return { effect: { type: "whimsPiles" }, next: si + 2 };
  return null;
}
