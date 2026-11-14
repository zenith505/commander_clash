// Round 358's sentences, read before round 357's (round357Sentence in oracle/round357.ts reads these first), and its whole
// lines (compile.ts, after round 354's): a Vehicle exiled at end of combat and returned transformed (Conqueror's
// Galleon), a looted artifact card made into a Thopter token copy (Leonardo da Vinci), lands that are 8/8 Elementals while
// they keep an awakening counter (Liege of the Tangle), a Mount saddled or a Vehicle animated for the turn (Alacrian
// Armory), and keywords had while a creature card in any graveyard has them (Cairn Wanderer). The Ringhart Crest's mana
// is in mana-abilities.ts.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { canonicalKeyword, YARD_CREATURE_CARD_KEYWORD } from "../keywords";
import { addTarget, type Ctx } from "./body";
import { round359Sentence } from "./round359";
import { parseSentence } from "./sentence";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const ARTIFACT_CARD: TargetSpec = { kind: "card", types: ["Artifact"], notTypes: [], notColors: [], text: "artifact card" };

export function round358Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 359's sentences first (oracle/round359.ts).
  const r359 = round359Sentence(s, sentences, si, ctx, effects);
  if (r359) return r359;
  const line = plain(s);
  // Conqueror's Galleon: "When ~ attacks, exile it at end of combat, then return it to the battlefield transformed under
  // your control.": a delayed trigger (CR 603.7) about ~ as it is now; if it has left the battlefield by then, it's a new
  // object and nothing happens (CR 400.7; rulings: it isn't exiled if it doesn't survive combat). Returned, it's a new
  // object with its back face up (CR 712.14a), under the delayed trigger's controller's control (CR 603.7d), untapped.
  // (Read as two sentences, "then" splitting them.)
  if (!ctx.spell && !ctx.activated && /^[Ee]xile it at end of combat$/.test(line) && plain(sentences[si + 1]) === "Return it to the battlefield transformed under your control" && !ctx.targets.length && ctx.selfIt)
    return { effect: { type: "delayed", when: "endOfCombat", effects: [{ type: "flicker", what: { ref: "subject" }, under: "you", transformed: true }], text: "exile ~, then return it to the battlefield transformed under your control" }, next: si + 2 };
  // Leonardo da Vinci: "Draw a card, then discard a card. If the discarded card was an artifact card, exile it from your
  // graveyard. If you do, create a token that's a copy of it, except it's a 0/2 Thopter artifact creature with flying in
  // addition to its other types.": the card discarded this way, as it is in the graveyard; exiled only if it's still that
  // card there (CR 400.7), and "if you do" asks whether it was. The token copies what's printed on the card (CR 707.2,
  // rulings) with these exceptions as copiable values (CR 707.9b), X in its mana cost 0 (CR 107.3f).
  if (
    !ctx.spell &&
    line === "If the discarded card was an artifact card, exile it from your graveyard" &&
    plain(sentences[si + 1]) === "If you do, create a token that's a copy of it, except it's a 0/2 Thopter artifact creature with flying in addition to its other types"
  ) {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "discard" || prev.who.ref !== "you" || prev.n !== 1 || prev.upTo || prev.random) return "fail";
    return {
      effect: {
        type: "if",
        cond: { kind: "discardedThisWayIs", filter: ARTIFACT_CARD },
        effects: [
          { type: "exile", what: { ref: "discarded" }, setsDid: true },
          { type: "if", cond: { kind: "youDid" }, effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "exiledThisWay", cards: true }, except: { pt: [0, 2], keywords: ["Flying"], addTypes: ["Artifact", "Creature"], addSubtypes: ["Thopter"] } }] },
        ],
      },
      next: si + 2,
    };
  }
  // Liege of the Tangle: "you may choose any number of target lands you control and put an awakening counter on each of
  // them. Each of those lands is an 8/8 green Elemental creature for as long as it has an awakening counter on it. They're
  // still lands.": any number of targets, none if you choose not to; each land that gets the counter is an 8/8 green
  // Elemental creature (layers 4, 5 and 7b) until it has no awakening counter, even if one is put on it again later (CR
  // 611.2b). It doesn't matter whether ~ is still on the battlefield, and a counter moved to another land doesn't bring
  // that land along (rulings).
  if (
    !ctx.spell &&
    /^[Yy]ou may choose any number of target lands you control and put an awakening counter on each of them$/.test(line) &&
    plain(sentences[si + 1]) === "Each of those lands is an 8/8 green Elemental creature for as long as it has an awakening counter on it" &&
    plain(sentences[si + 2]) === "They're still lands"
  ) {
    const before = ctx.targets.length;
    const put = parseSentence("Put an awakening counter on each of any number of target lands you control", ctx);
    const become = put ? parseSentence("They become 8/8 green Elemental creatures that are still lands until end of turn", ctx) : null;
    const counters = put?.length === 1 && put[0]!.type === "counters" ? put[0]! : undefined;
    const animate = become?.length === 1 && become[0]!.type === "continuous" && become[0]!.duration === "endOfTurn" && become[0]!.mods.some((m) => m.kind === "addTypes" && m.types.includes("Creature")) && !become[0]!.mods.some((m) => m.kind === "setTypes") ? become[0]! : undefined;
    if (!counters || !animate || ctx.targets.length !== before + 1 || JSON.stringify(animate.what) !== JSON.stringify(counters.what)) return "fail";
    effects.push(counters);
    return { effect: { ...animate, duration: "game", whileCounter: "awakening" }, next: si + 3 };
  }
  // Alacrian Armory: "choose up to one target Mount or Vehicle you control. Until end of turn, that permanent becomes saddled
  // if it's a Mount and becomes an artifact creature if it's a Vehicle.": the target as it is as this resolves; saddled
  // until end of turn (CR 702.171b) if it's a Mount, an artifact creature until end of turn (layer 4) if it's a Vehicle,
  // both if it's both.
  if (!ctx.spell && /^[Cc]hoose up to one target Mount or Vehicle you control$/.test(line) && plain(sentences[si + 1]) === "Until end of turn, that permanent becomes saddled if it's a Mount and becomes an artifact creature if it's a Vehicle") {
    const index = addTarget(ctx, { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Mount", "Vehicle"], controller: "you", optional: true, text: "Mount or Vehicle you control" });
    const what = { ref: "target" as const, index };
    const isA = (sub: string): TargetSpec => ({ kind: "object", types: [], notTypes: [], notColors: [], subtypes: [sub], text: sub });
    effects.push({ type: "if", cond: { kind: "targetIs", index, filter: isA("Mount") }, effects: [{ type: "becomeSaddled", what }] });
    return { effect: { type: "if", cond: { kind: "targetIs", index, filter: isA("Vehicle") }, effects: [{ type: "continuous", what, mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }], duration: "endOfTurn" }] }, next: si + 2 };
  }
  return null;
}

/**
 * Cairn Wanderer: "As long as a creature card with flying is in a graveyard, ~ has flying. The same is true for fear, first
 * strike, ...": each keyword while a creature card in any graveyard has it (a double-faced card by its front face, CR
 * 712.8a), as the layers apply it (layer 6); "landwalk" and "protection" are each landwalk and protection ability such a
 * card has (rulings).
 */
export function round358Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const yardKw = /^As long as a creature card with ([a-z ]+) is in a graveyard, ~ has \1\. The same is true for ((?:[a-z ]+, )+)and ([a-z ]+)\.$/.exec(line);
  if (yardKw) {
    const kws = [yardKw[1]!, ...yardKw[2]!.split(", ").filter(Boolean), yardKw[3]!].map((k) => (k === "landwalk" ? "Landwalk" : k === "protection" ? "Protection" : canonicalKeyword(k)));
    if (isSpell || kws.some((k) => !k || !/^[A-Z][a-z]+(?: [a-z]+)?$/.test(k))) out.unsupported.push(raw);
    else out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addKeywords", keywords: kws.map((k) => `${YARD_CREATURE_CARD_KEYWORD}${k}`) }], text: line });
    return true;
  }
  return false;
}
