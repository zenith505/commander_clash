// Round 388's sentences (read first by round373Sentence): copies of spells that gain abilities (Spider-Verse, Mizzix,
// Replica Rider, Choreographed Sparks) and The Brothers' War's chapter II, two target players whose creatures attack each
// other until your next turn.
import type { Effect, Modification } from "../abilities";
import type { Ctx } from "./body";
import { parseGrants } from "./grants";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** The copySpell effect `e` is, or the one effect of a "you may" it is. */
const copyIn = (e: Effect | undefined) => (e?.type === "copySpell" ? e : e?.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "copySpell" ? e.effects[0] : undefined);

/** Haste and granted abilities only: what a copy of a permanent spell keeps on the permanent it becomes (CR 400.7a). */
const copyMods = (text: string): Modification[] | null => {
  const mods = parseGrants(text);
  return mods?.length && mods.every((m) => m.kind === "addKeywords" || m.kind === "addAbility") ? mods : null;
};

/** A sentence of round 388's, read before round 387's. */
export function round388Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  const prev = effects[effects.length - 1];
  // Spider-Verse: "you may copy it. If you do, you may choose new targets for the copy.": the copy it may make (as "You may
  // copy that spell. You may choose new targets for the copy.", Invocation of the Founders).
  if (line === "If you do, you may choose new targets for the copy") {
    const copy = prev?.type === "may" && !prev.pay && !prev.otherwise ? copyIn(prev) : undefined;
    if (!copy || copy.newTargets) return "fail";
    copy.newTargets = true;
    effects.pop();
    return { effect: prev!, next: si + 1 };
  }
  // Spider-Verse: "If the copy is a permanent spell, it gains haste."; Mizzix, Replica Rider: "... it gains haste and "At
  // the beginning of your end step, sacrifice this permanent."": an effect on the copy that goes on applying to the token
  // it becomes (CR 400.7a, 608.3f, 707.10f), as Nalfeshnee's "If it's a permanent spell, the copy gains ...". A copy of a
  // spell that isn't a permanent spell never becomes a permanent, so the condition needs no check.
  const permanentGains = /^If the copy is a permanent spell, it gains (.+)$/.exec(line);
  if (permanentGains) {
    const copy = copyIn(prev);
    const mods = copyMods(permanentGains[1]!);
    if (!copy || copy.spell !== "cause" || copy.gains || !mods) return "fail";
    copy.gains = mods;
    effects.pop();
    return { effect: prev!, next: si + 1 };
  }
  // Choreographed Sparks: "Copy target creature spell you control. The copy gains haste and "At the beginning of the end
  // step, sacrifice this token."": a creature spell's copy is a permanent spell, and the token it becomes keeps these
  // (CR 400.7a, 111.13, 608.3f).
  const copyGains = /^The copy gains (.+)$/.exec(line);
  if (copyGains && prev?.type === "copySpell" && typeof prev.spell === "object" && "target" in prev.spell && !prev.spell.many) {
    const spec = ctx.targets[prev.spell.target];
    const mods = copyMods(copyGains[1]!);
    if (spec?.kind !== "spell" || !spec.types?.includes("Creature") || prev.gains || prev.n !== 1 || !mods) return "fail";
    prev.gains = mods;
    effects.pop();
    return { effect: prev, next: si + 1 };
  }
  // The Brothers' War, chapter II: "Choose two target players. Until your next turn, each creature they control attacks the
  // other chosen player each combat if able.": two different players (CR 115.3), the creatures each controls as it
  // resolves (CR 611.2c) made to attack the other each combat (CR 508.1d) until this ability's controller's next turn
  // begins (CR 611.2b). With one of them an illegal target, neither is made to (as Dulcet Sirens', rulings: an illegal
  // target isn't attacked or made to act, CR 608.2b).
  if (line === "Until your next turn, each creature they control attacks the other chosen player each combat if able" && plain(sentences[si - 1]) === "Choose two target players" && si === 1) {
    const first = ctx.manyPlayers;
    const a = first !== undefined ? ctx.targets[first] : undefined;
    const b = first !== undefined ? ctx.targets[first + 1] : undefined;
    if (first === undefined || a?.kind !== "player" || b?.kind !== "player" || a.optional || b.optional || ctx.targets.length !== first + 2) return "fail";
    const each = (i: number): Effect => ({
      type: "continuous",
      what: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creatures that player controls" }, of: { ref: "target", index: i } },
      mods: [{ kind: "mustAttackPlayer", player: { target: i === first ? first + 1 : first } }],
      duration: "yourNextTurn",
    });
    effects.push(each(first));
    return { effect: each(first + 1), next: si + 1 };
  }
  return null;
}
