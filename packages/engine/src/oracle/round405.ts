// Round 405's sentences (read first by round373Sentence) and whole lines (compile.ts): Glorious Purpose's sacrifice, then
// cards cast from among those exiled, and Eye of Duskmantle's cards surveilled into your graveyard.
import type { CompiledCard, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import { parseBody, type Ctx } from "./body";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";

const LAZAV = "Whenever you sacrifice a Clue, you may have ~ become a copy of a creature card exiled with it until end of turn.";
const SPIRIT = "Whenever one or more cards leave your graveyard, put a +1/+1 counter on ~, then you may have ~ become a copy of an artifact or creature card from among those cards until end of turn.";

/** A triggered ability of round 405's; null when the line isn't one of these. */
export function round405Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Lazav, Wearer of Faces: any Clue you sacrifice, for any reason (rulings); "exiled with it" is what its attack trigger
  // exiled (compile.ts linkExile, CR 607.2a).
  if (raw === LAZAV) {
    const base = parseTrigger("Whenever you sacrifice a Clue, draw a card.");
    if (!base || base === "fail" || base.event !== "youSacrifice") return "fail";
    const filter: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card exiled with it" };
    return { ...base, body: { targets: [], effects: [{ type: "becomeCopyOfAmong", what: { ref: "self" }, from: "linked", filter }], text: raw.replace(/^Whenever you sacrifice a Clue, /, "") } };
  }
  // Spirit of Resilience: once for each event in which one or more cards leave your graveyard (CR 603.2c, rulings), the
  // counter first, then the copy of one of those cards (Effect becomeCopyOfAmong `eventGroup`).
  if (raw === SPIRIT) {
    const base = parseTrigger("Whenever one or more cards leave your graveyard, put a +1/+1 counter on ~.");
    if (!base || base === "fail" || base.event !== "batch" || base.batch?.what !== "leavesGraveyard" || base.body.effects.length !== 1) return "fail";
    const filter: TargetSpec = { kind: "card", types: ["Artifact", "Creature"], notTypes: [], notColors: [], text: "artifact or creature card" };
    return { ...base, body: { targets: [], effects: [...base.body.effects, { type: "becomeCopyOfAmong", what: { ref: "self" }, from: "eventGroup", filter }], text: raw.replace(/^Whenever one or more cards leave your graveyard, /, "") } };
  }
  return null;
}

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 405's, read before round 403's. */
export function round405Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Glorious Purpose: "sacrifice it. If you do, exile the top four cards of your library. You may cast any number of spells
  // from among them without paying their mana costs. Put the rest into your hand.": every instruction after "If you do"
  // depends on the sacrifice (CR 608.2c): none of them happens if it wasn't sacrificed (it had left the battlefield).
  if (/^[Ss]acrifice (?:~|it)$/.test(plain(s)) && /^If you do, exile the top /.test(sentences[si + 1] ?? "") && !ctx.spell) {
    const rest = [sentences[si + 1]!.replace(/^If you do, e/, "E"), ...sentences.slice(si + 2)].map((x) => plain(x) + ".").join(" ");
    const body = parseBody(rest);
    if (!body || body.targets.length || !body.effects.length || body.effects[0]!.type !== "exileTop" && body.effects[0]!.type !== "castFromAmong") return "fail";
    effects.push({ type: "sacrifice", what: { ref: "self" } });
    return { effect: { type: "if", cond: { kind: "sacrificedThisWay" }, effects: body.effects }, next: sentences.length };
  }
  return null;
}

const EYE = "You may play lands and cast spells from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.";

/** One whole line of round 405's (compile.ts); false when it isn't one of these. */
export function round405Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Eye of Duskmantle: its controller may play the land cards and cast the spells that their own surveils put into their
  // graveyard this turn, before or after it was on the battlefield (rulings, CR 701.25a), each still that card (CR 400.7);
  // lands with a land play (CR 305.2), spells with the usual timing, only for life equal to the mana value (AltCostKind
  // "citadel", CR 118.9: no other alternative cost, X at 0, additional costs still paid, rulings), a card with no mana cost
  // too (CR 118.6a). A static ability of the permanent (CR 113.6).
  if (line === EYE) {
    const f = parseTargetPhrase("card from a graveyard");
    if (isSpell || f?.kind !== "card") out.unsupported.push(raw);
    else {
      const { owner: _, ...rest } = f;
      out.landsFromGraveyardSurveilled = true;
      (out.graveyardGrants ??= []).push({ filter: { ...rest, text: "cards you've surveilled this turn" }, way: { kind: "permission", costs: [], exile: false, alt: "citadel" }, arrived: "surveilled" });
    }
    return true;
  }
  return false;
}
