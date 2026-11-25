// Lane B round B256's sentences, read at the end of round B240's chain (roundB240Sentence in oracle/laneb240.ts): False
// Orders and Balduvian Warlord ("remove target ... from combat ..., then it blocks an attacking creature of your choice")
// and Raiding Party. Search the City's trigger is read in oracle/laneb256-lines.ts.
import { COLOR_OF_WORD } from "./color-template";
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseObject } from "./targets";
import { roundB257Sentence } from "./laneb257";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB256Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // False Orders: "Remove target creature defending player controls from combat. Creatures it was blocking that had become
  // blocked by only that creature this combat become unblocked. You may have it block an attacking creature of your
  // choice." Balduvian Warlord: "Remove target blocking creature from combat. Creatures it was blocking that hadn't become
  // blocked by another creature this combat become unblocked, then it blocks an attacking creature of your choice." Removed
  // from combat (CR 506.4), the attackers only it had blocked this combat unblocked again (rulings: even if their other
  // blockers are gone), then it blocks the attacker chosen as it resolves (CR 509.3a-d: an effect causing a creature to
  // block). One effect (Effect reblock).
  const first = /^Remove (target creature defending player controls|target blocking creature) from combat$/.exec(plain(s));
  const unblocks = /^Creatures it was blocking that (?:had become blocked by only that creature|hadn't become blocked by another creature) this combat become unblocked$/.test(plain(sentences[si + 1]));
  // "then it blocks ..." comes here as a sentence of its own.
  const then = plain(sentences[si + 2]);
  if (first && unblocks && (then === "You may have it block an attacking creature of your choice" || then === "It blocks an attacking creature of your choice")) {
    // False Orders is the spell ("defending player" any defending player, TargetSpec.defendingAny); the Warlord's ability
    // targets a blocking creature.
    if ((first[1] === "target blocking creature") === !!ctx.spell) return "fail";
    const what = parseObject(first[1]!, ctx);
    if (what?.ref !== "target" || what.n) return "fail";
    return { effect: { type: "reblock", what, ...(then.startsWith("You may") ? { may: true as const } : {}) }, next: si + 3 };
  }
  // Raiding Party: "Each player may tap any number of untapped white creatures they control. For each creature tapped this
  // way, that player chooses up to two Plains. Then destroy all Plains that weren't chosen this way by any player." Each
  // player in turn order from the active player (CR 101.4) chooses the creatures to tap and taps them, then up to two Plains
  // for each one tapped, anyone's, not targeted; then every Plains no player chose is destroyed at once (Effect
  // raidingParty). The color is white, not chosen anew (rulings).
  const raid = /^Each player may tap any number of untapped (white|blue|black|red|green) creatures they control$/.exec(plain(s));
  if (raid && plain(sentences[si + 1]) === "For each creature tapped this way, that player chooses up to two Plains" && plain(sentences[si + 2]) === "Then destroy all Plains that weren't chosen this way by any player")
    return ctx.activated ? { effect: { type: "raidingParty", ...(raid[1] !== "white" ? { color: COLOR_OF_WORD[raid[1]!]! } : {}) }, next: si + 3 } : "fail";
  return roundB257Sentence(s, sentences, si, ctx);
}
