// Round 367's sentences, read before round 366's (round366Sentence in oracle/round366.ts reads these first), and its whole
// lines (compile.ts, after round 366's): a land tapped for mana tapping the rest that could make the same mana (Mana Web),
// stolen lands going home when a creature leaves (Herald of Leshrac), a quest that copies spells once it has two counters
// (Pyromancer Ascension) and an Equipment put onto the battlefield from hand or graveyard and attached (Vault 101:
// Birthday Party).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseTrigger } from "./triggers";
import { round368Sentence } from "./round368";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round367Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 368's sentences first (oracle/round368.ts).
  const r368 = round368Sentence(s, sentences, si, ctx, effects);
  if (r368 !== null) return r368;
  const line = plain(s);
  // Vault 101: Birthday Party: "You may put an Aura or Equipment card from your hand or graveyard onto the battlefield. If
  // an Equipment is put onto the battlefield this way, you may attach it to a creature you control.": the one card put, if
  // it's an Equipment, attached to a creature its controller chooses (not targeted, CR 701.3a), one it could equip (CR
  // 301.5c). An Aura card that couldn't be attached to anything can't be chosen at all (rulings, CR 303.4f).
  if (line === "If an Equipment is put onto the battlefield this way, you may attach it to a creature you control") {
    const last = effects.at(-1);
    if (ctx.spell || last?.type !== "putFromHand" || !last.may || !last.orGraveyard || last.any || last.upTo !== undefined || last.who || last.tapped || last.attacking || !last.filter?.subtypes?.includes("Equipment")) return null; // Armored Skyhunter's dig reads it (body.ts)
    effects[effects.length - 1] = { ...last, hostableAuras: true };
    return { effect: { type: "attachToChosen", source: { ref: "created" }, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "a creature you control" }, may: true, equipmentOnly: true }, next: si + 1 };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const MANA_WEB = "Whenever a land an opponent controls is tapped for mana, tap all lands that player controls that could produce any type of mana that land could produce.";
const HERALD_LEAVES = "When ~ leaves the battlefield, each player gains control of each land they own that you control.";
const PYRO_QUEST = "Whenever you cast an instant or sorcery spell that has the same name as a card in your graveyard, you may put a quest counter on ~.";
const PYRO_COPY = "Whenever you cast an instant or sorcery spell while ~ has two or more quest counters on it, you may copy that spell. You may choose new targets for the copy.";

export function round367Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Mana Web: a land an opponent controls tapped for mana (CR 106.12) by that opponent, since only a permanent's controller
  // can activate its mana abilities (CR 602.2). Not a mana ability (it adds no mana, CR 605.1b), so it uses the stack and
  // the opponent can tap lands in response (rulings). See runTapLandsSharingManaEffect (effects/run-round367.ts).
  if (line === MANA_WEB) {
    const t = isSpell ? null : parseTrigger("Whenever an opponent taps a land for mana, draw a card.");
    if (!t || t === "fail" || t.event !== "tappedForMana" || t.manaTap?.by !== "opponent" || !t.manaTap.filter) return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "tapLandsSharingMana" }], text: "tap all lands that player controls that could produce any type of mana that land could produce." } });
    return true;
  }
  // Herald of Leshrac: every land its controller controls but doesn't own, not only those it took (rulings), goes back to
  // its owner, each owner's own control effect (CR 613.1b), "you" being its controller as it last existed (CR 603.10a).
  if (line === HERALD_LEAVES) {
    const t = isSpell ? null : parseTrigger("When ~ leaves the battlefield, draw a card.");
    if (!t || t === "fail" || t.event !== "selfLeaves") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "ownersGainControl", filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], controller: "you", text: "land you control" } }], text: "each player gains control of each land they own that you control." } });
    return true;
  }
  // Pyromancer Ascension: a spell whose name a card in its caster's graveyard has as it becomes cast (Effect cast
  // nameInCasterYard, CR 201.2); a spell cast from the graveyard needs another card with that name there (rulings). The
  // counter is put even if that card has left or the spell is countered by then (rulings).
  if (line === PYRO_QUEST) {
    const t = isSpell ? null : parseTrigger("Whenever you cast an instant or sorcery spell, you may put a quest counter on ~.");
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.by !== "you") return fail(out, raw);
    out.triggers.push({ ...t, cast: { ...t.cast, nameInCasterYard: true } });
    return true;
  }
  // "While ~ has two or more quest counters on it": a condition on the cast event only (CR 603.2): two already on it as the
  // spell is cast, so a spell can't add the second and be copied, and removing ~ in response doesn't stop it (rulings).
  // The copy is created even if the spell has left the stack by then (rulings, CR 707.10).
  if (line === PYRO_COPY) {
    const t = isSpell ? null : parseTrigger("Whenever you cast an instant or sorcery spell, you may copy that spell. You may choose new targets for the copy.");
    if (!t || t === "fail" || t.event !== "castSpell" || t.activeIf) return fail(out, raw);
    out.triggers.push({ ...t, activeIf: { kind: "selfCounters", counter: "quest", min: 2 } });
    return true;
  }
  return false;
}
