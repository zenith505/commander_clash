// Round 351's sentences, read before round 350's (round350Sentence in oracle/round350.ts, which reads these first), and
// its whole lines (compile.ts, after round 350's): copying the next loyalty ability (Jaya's Phoenix, Repeated
// Reverberation), keywords of the cards an Equipment exiled (Eater of Virtue), a planeswalker type chosen as it enters and
// the last loyalty counter kept (Deification), permanents phasing out and cards put into exile (The War Doctor), and Spirits
// that phase out when targeted and make Spirits as they phase in (King of the Oathbreakers).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { canonicalKeyword, LINKED_CARD_KEYWORD } from "../keywords";
import type { Ctx } from "./body";
import { parseStatic } from "./statics";
import { parseTrigger } from "./triggers";
import { round353Sentence } from "./round353";
import { colorTemplate, withColors } from "./color-template";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const COPY_CAUSE = (n: number): Effect => ({ type: "copySpell", spell: "cause", n, newTargets: true });

export function round351Sentence(s: string, sentences: string[], si: number, _ctx: Ctx, _effects: Effect[]): Found {
  // Round 353's sentences first (oracle/round353.ts).
  const r353 = round353Sentence(s, sentences, si, _ctx, _effects);
  if (r353) return r353;
  const line = plain(s);
  // Jaya's Phoenix: "copy the next loyalty ability you activate this turn when you activate it. You may choose new targets
  // for the copy.": a delayed triggered ability (CR 603.7a), triggering once (603.7c) as the next loyalty ability its
  // controller activates this turn is activated (CR 606.3), copying it (CR 707.10): the copy costs no loyalty, keeps any
  // X, and resolves first, even if that ability is countered (rulings).
  if (/^[Cc]opy the next loyalty ability you activate this turn when you activate it$/.test(line)) {
    if (!/^You may choose new targets for the copy\.?$/.test(sentences[si + 1] ?? "")) return "fail";
    return { effect: { type: "nextCast", filter: NO_SPELL, effects: [COPY_CAUSE(1)], text: "copy that ability", loyalty: "only" }, next: si + 2 };
  }
  // Repeated Reverberation: "When you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this
  // turn, copy that spell or ability twice. You may choose new targets for the copies.": one delayed trigger (CR 603.7c),
  // for whichever of those comes first; the copies aren't cast or activated, keep the modes and X, and resolve before the
  // original even if it's countered (rulings, CR 707.10).
  if (/^When you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice$/.test(line)) {
    if (!/^You may choose new targets for the copies\.?$/.test(sentences[si + 1] ?? "")) return "fail";
    const filter: TargetSpec = { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery spell" };
    return { effect: { type: "nextCast", filter, effects: [COPY_CAUSE(2)], text: "copy that spell or ability twice", loyalty: "also" }, next: si + 2 };
  }
  return null;
}

/** A spell filter nothing matches: a nextCast about loyalty abilities only (Jaya's Phoenix). */
const NO_SPELL: TargetSpec = { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "loyalty ability" };

const EATER = /^As long as a card exiled with ~ has ([a-z ]+), equipped creature has \1\. The same is true for ((?:[a-z ]+, )+)and ([a-z ]+)\.$/;

export function round351Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Eater of Virtue: "As long as a card exiled with ~ has flying, equipped creature has flying. The same is true for first
  // strike, ..., protection, reach, trample, and vigilance.": as Death-Mask Duplicant's (compile.ts linkedKw), for the
  // equipped creature, layer 6 (CR 613.1f): each keyword a face-up card exiled with this object still has in exile (CR
  // 607.2a, its "Whenever equipped creature dies, exile it" linked in compile.ts), every hexproof and protection ability
  // among them (rulings); a new object after it leaves and returns (rulings, CR 400.7).
  const eater = EATER.exec(line);
  if (eater) {
    const kws = [eater[1]!, ...eater[2]!.split(", ").filter(Boolean), eater[3]!].map((k) => (k === "protection" ? "Protection" : canonicalKeyword(k)));
    if (isSpell || kws.some((k) => !k || !/^[A-Z][a-z]+(?: [a-z]+)?$/.test(k))) out.unsupported.push(raw);
    else out.statics.push({ affects: { kind: "attached" }, mods: [{ kind: "addKeywords", keywords: kws.map((k) => `${LINKED_CARD_KEYWORD}${k}`) }], text: line });
    return true;
  }
  // Deification: "As ~ enters, choose a planeswalker type." (CR 614.12, one of CR 205.3j's), kept as
  // Chosen.planeswalkerType.
  if (line === "As ~ enters, choose a planeswalker type.") {
    if (isSpell || out.entersChoose?.length) out.unsupported.push(raw);
    else (out.entersChoose ??= []).push({ what: "planeswalkerType" });
    return true;
  }
  // Deification: "Planeswalkers you control of the chosen type have hexproof.": the planeswalker type chosen as it entered.
  if (line === "Planeswalkers you control of the chosen type have hexproof.") {
    const st = parseStatic(line);
    const f = st?.affects.kind === "filter" ? st.affects.spec : undefined;
    if (isSpell || !st || !f || f.chosen !== "type" || !out.entersChoose?.some((c) => c.what === "planeswalkerType")) {
      out.unsupported.push(raw);
      return true;
    }
    f.chosen = "planeswalkerType";
    out.statics.push(st);
    return true;
  }
  // Deification: "As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would
  // result in all loyalty counters on it being removed, instead all but one of those counters are removed.": a replacement
  // of the counters damage removes (CR 120.3c, 614.1), checked as the damage is dealt (rulings: a creature dying in that
  // damage step still counts); the damage itself is dealt (lifelink and the rest happen, rulings). damage.ts.
  if (line === "As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being removed, instead all but one of those counters are removed.") {
    if (isSpell || out.keepsLastLoyalty || !out.entersChoose?.some((c) => c.what === "planeswalkerType")) out.unsupported.push(raw);
    else out.keepsLastLoyalty = { filter: { kind: "object", types: ["Planeswalker"], notTypes: [], notColors: [], controller: "you", chosen: "planeswalkerType", text: "planeswalker you control of the chosen type" }, whileControl: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" } };
    return true;
  }
  // The War Doctor: "Whenever one or more other permanents phase out and whenever one or more other cards are put into exile
  // from anywhere, put a time counter on ~.": one ability with two trigger events (CR 603.2), each a batch (CR 603.2c):
  // permanents phasing out (not if ~ phases out with them, rulings) and cards put into exile (not tokens or copies, CR
  // 108.2, 111.1; from any zone but exile).
  if (line === "Whenever one or more other permanents phase out and whenever one or more other cards are put into exile from anywhere, put a time counter on ~.") {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    const t = parseTrigger("Whenever one or more cards are put into exile, put a time counter on ~.");
    if (!t || t === "fail" || t.event !== "batch" || t.batch?.what !== "exiled") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ event: "permanentsPhaseOut", body: structuredClone(t.body) });
    out.triggers.push({ ...t, batch: { ...t.batch, other: true } });
    return true;
  }
  // King of the Oathbreakers: "Whenever ~ or another Spirit you control becomes the target of a spell, it phases out.":
  // once for each such permanent a spell targets (rulings), "it" that permanent (CR 702.26).
  if (line === "Whenever ~ or another Spirit you control becomes the target of a spell, it phases out.") {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    const t = parseTrigger("Whenever a Spirit you control becomes the target of a spell, it phases out.");
    if (!t || t === "fail" || t.event !== "permanentBecomesTarget" || !t.subjectFilter) out.unsupported.push(raw);
    else out.triggers.push({ ...t, subjectOrSelf: true });
    return true;
  }
  // King of the Oathbreakers: "Whenever ~ or another Spirit you control phases in, create a tapped 1/1 white Spirit creature
  // token with flying.": once for each of them phasing in (rulings; CR 702.26c), ~ with them too.
  // Its colors as a text change of color words leaves them (color-template.ts, round 462).
  const oathbreakers = colorTemplate("Whenever ~ or another Spirit you control phases in, create a tapped 1/1 white Spirit creature token with flying.", line);
  if (oathbreakers) {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    const t = parseTrigger(withColors("Whenever ~ phases in, create a tapped 1/1 white Spirit creature token with flying.", oathbreakers));
    if (!t || t === "fail" || t.event !== "selfPhasesIn") out.unsupported.push(raw);
    else out.triggers.push({ event: "permanentYouControlPhasesIn", subjectFilter: SPIRIT_YOURS, subjectOrSelf: true, body: t.body });
    return true;
  }
  return false;
}

const SPIRIT_YOURS: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Spirit"], controller: "you", text: "Spirit you control" };
