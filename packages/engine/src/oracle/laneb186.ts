// Lane B round B186's lines, read by compileCard before its triggers and activated abilities (after round B185's), and
// its sentences, read at the end of round B185's.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { addTarget, type Ctx } from "./body";
import { roundB189Sentence } from "./laneb189";
import { parseSentence } from "./sentence";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const FACE_DOWN_CREATURE: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], faceDown: true, text: "face-down creature" };

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB186Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  void line;
  void raw;
  void out;
  void isSpell;
  return false;
}

export function roundB186Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Revealing Wind: "You may look at each face-down creature that's attacking or blocking.": each one as it resolves, seen
  // by its caster only (CR 708.5, 708.6); with none, the rest of the spell still does what it does (rulings).
  if (s === "You may look at each face-down creature that's attacking or blocking") {
    return { effect: { type: "lookAtFaceDown", what: { ref: "each", filter: { ...FACE_DOWN_CREATURE, combat: "attackingOrBlocking", text: "face-down creature that's attacking or blocking" } } }, next: si + 1 };
  }
  // Spy Network: "Look at target player's hand, the top card of that player's library, and any face-down creatures they
  // control.": all seen by you only (rulings, CR 708.5); the top card stays where it is.
  if (s === "Look at target player's hand, the top card of that player's library, and any face-down creatures they control") {
    const index = addTarget(ctx, { kind: "player", opponent: false, text: "target player" });
    const who = { ref: "target" as const, index };
    effects.push({ type: "lookAtHand", who });
    effects.push({ type: "lookAtHand", who, topCard: true });
    return { effect: { type: "lookAtFaceDown", what: { ref: "each", filter: FACE_DOWN_CREATURE, of: who } }, next: si + 1 };
  }
  // Lumbering Laundry: "Until end of turn, you may look at face-down creatures you don't control any time." (rulings: for
  // the rest of the turn, whenever you want; not face-down spells).
  if (s === "Until end of turn, you may look at face-down creatures you don't control any time") return { effect: { type: "lookFaceDownThisTurn" }, next: si + 1 };
  // Temporal Aperture: "Shuffle your library, then reveal the top card. Until end of turn, for as long as that card remains
  // on top of your library, play with the top card of your library revealed and you may play that card without paying its
  // mana cost."
  // (The sentences arrive split at ", then".)
  if (s === "Shuffle your library" && sentences[si + 1] === "Reveal the top card" && plain(sentences[si + 2]) === "Until end of turn, for as long as that card remains on top of your library, play with the top card of your library revealed and you may play that card without paying its mana cost") {
    return { effect: { type: "shuffleRevealTopFree" }, next: si + 3 };
  }
  // Immovable Rod: "For as long as ~ remains tapped, another target permanent loses all abilities and can't attack or
  // block." (CR 611.2b): one continuous effect, in layer 6 and the rules for attacking and blocking, ending once ~ untaps
  // or leaves the battlefield; an Aura that loses enchant can't stay attached, an Equipment stays attached (rulings).
  if (s === "For as long as ~ remains tapped, another target permanent loses all abilities and can't attack or block") {
    if (ctx.spell) return "fail";
    const fx = parseSentence("Another target permanent loses all abilities until end of turn", ctx);
    const e = fx?.length === 1 ? fx[0]! : undefined;
    if (e?.type !== "continuous" || e.duration !== "endOfTurn" || e.what.ref !== "target" || e.mods.length !== 1 || e.mods[0]!.kind !== "loseAllAbilities") return "fail";
    return { effect: { ...e, mods: [...e.mods, { kind: "cantAttack" }, { kind: "cantBlock" }], duration: "whileTapped" }, next: si + 1 };
  }
  // Merieke Ri Berit: "When ~ leaves the battlefield or becomes untapped, destroy that creature. It can't be regenerated.",
  // after "Gain control of target creature for as long as you control ~": a delayed trigger watching ~ as it is now, about
  // the creature it targeted (CR 603.7c, 400.7), the first time ~ leaves for any zone or becomes untapped; untapping, you
  // still control the creature as it's destroyed; leaving, it's back with its controller first (rulings, CR 611.2b).
  if (s === "When ~ leaves the battlefield or becomes untapped, destroy that creature" && plain(sentences[si + 1]) === "It can't be regenerated") {
    const t = ctx.lastObjectTarget;
    if (!ctx.activated || ctx.spell || t === undefined || ctx.targets[t]?.kind !== "object" || ctx.targets[t]?.many || effects.length !== 1 || effects[0]!.type !== "continuous" || effects[0]!.duration !== "whileControlled") return "fail";
    return { effect: { type: "delayed", when: "leaves", of: { ref: "self" }, about: t, orUntaps: true, effects: [{ type: "destroy", what: { ref: "subject" }, noRegen: true }], text: "destroy that creature. It can't be regenerated" }, next: si + 2 };
  }
  return roundB189Sentence(s, sentences, si, ctx, effects);
}
