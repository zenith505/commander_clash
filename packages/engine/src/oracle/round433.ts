// Round 433's sentences (body.ts chain, before round 432's) and the link of The Creation of Avacyn's chapters (compile.ts
// linkExile).
import { allEffects, type CompiledCard, type Effect } from "../abilities";
import type { Ctx } from "./body";
import { PLANESWALKER_TYPES } from "./targets";

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One sentence of an ability's effect (body.ts); null when it isn't one of these, "fail" when it's one we can't do. */
export function round433Sentence(s: string, sentences: string[], si: number, _ctx: Ctx, _effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  const line = plain(s);
  // Jace's Machinations: "Until end of turn, you may activate loyalty abilities of Jace planeswalkers you control on any
  // player's turn any time you could cast an instant.": a permission for this turn (CR 611.2a), its controller's, for their
  // planeswalkers with that subtype (CR 205.3j), one loyalty ability of each a turn still (CR 606.3, rulings).
  const loyalty = /^Until end of turn, you may activate loyalty abilities of ([A-Z][a-z]+) planeswalkers you control on any player's turn any time you could cast an instant$/.exec(line);
  if (loyalty) {
    if (!PLANESWALKER_TYPES.has(loyalty[1]!)) return "fail";
    return { effect: { type: "loyaltyAtInstantThisTurn", subtype: loyalty[1]! }, next: si + 1 };
  }
  // The Creation of Avacyn, chapter II: "Turn the exiled card face up. If it's a creature card, you lose life equal to its
  // mana value." (linked to chapter I's face-down exile by linkRound433).
  if (line === "Turn the exiled card face up") {
    if (plain(sentences[si + 1]) !== "If it's a creature card, you lose life equal to its mana value") return "fail";
    return { effect: { type: "linkedFaceUpLoseLife" }, next: si + 2 };
  }
  // Chapter III: "You may put the exiled card onto the battlefield if it's a creature card. If you don't put it onto the
  // battlefield, put it into its owner's hand."
  if (line === "You may put the exiled card onto the battlefield if it's a creature card") {
    if (plain(sentences[si + 1]) !== "If you don't put it onto the battlefield, put it into its owner's hand") return "fail";
    return { effect: { type: "linkedCreatureOrHand" }, next: si + 2 };
  }
  return null;
}

/**
 * The Creation of Avacyn: "the exiled card" of its chapters II and III is the card its chapter I's search exiled face
 * down (CR 607.2a; rulings: each Creation of Avacyn has its own), that search being its only exile instruction.
 */
export function linkRound433(out: CompiledCard): void {
  const bodies = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])];
  if (!bodies.some((b) => allEffects(b.effects).some((e) => e.type === "linkedFaceUpLoseLife" || e.type === "linkedCreatureOrHand"))) return;
  const exiles = bodies.flatMap((b) => allEffects(b.effects)).filter((e) => ["exile", "exileTop", "exileGraveyard", "impulse", "takeFromHand", "hideaway", "exileFaceDown", "exileHand", "castFromAmong", "search", "chooseFromGraveyard", "pick", "flicker", "exileUntilNonlandLinked", "dig"].includes(e.type) || (e.type === "discard" && !!e.exile));
  const chapterI = out.triggers.filter((t) => t.event === "chapter" && t.chapter === 1).flatMap((t) => allEffects(t.body.effects));
  const search = chapterI.find((e): e is Extract<Effect, { type: "search" }> => e.type === "search" && e.dest.zone === "exile" && !!e.dest.faceDown && !e.others && !e.split && !e.mayInstead && !e.condDest && !e.landTo && !e.cardTo && !e.who && !e.library);
  if (out.spell || exiles.length !== 1 || !search || exiles[0] !== search) {
    out.unsupported.push("(turns face up an exiled card it can't link to one exile ability)");
    return;
  }
  search.dest = { ...search.dest, linked: true };
}
