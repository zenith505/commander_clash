// Round 377's whole lines (compile.ts, after round 376's): a hidden search of the damaged player's library that player
// tries to name (Sphinx Ambassador), an opponent chosen in secret by an enters trigger and revealed to exile one of their
// attackers (Stalking Leonin), and copies of six cards named by their Oracle text, made outside the game (Garth One-Eye).
import type { CompiledCard, Effect } from "../abilities";
import { namedCardDef, namedCopyNames } from "../meld-results";
import type { CardDef } from "../types";
import { parseActivated } from "./activated";
import { isFullySupported } from "./compile";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

export function round377Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, d: CardDef): boolean {
  // Sphinx Ambassador: "search that player's library for a card" finds one if there's any (CR 701.23d), kept hidden from
  // that player (rulings); "that player chooses a card name" as it resolves (CR 608.2d); a creature card (any card with
  // the type, rulings) that doesn't have that name may be put onto the battlefield under your control; whatever else is
  // found stays in the library unrevealed, and that player shuffles (rulings).
  if (line === "Whenever ~ deals combat damage to a player, search that player's library for a card, then that player chooses a card name. If you searched for a creature card that doesn't have that name, you may put it onto the battlefield under your control. Then that player shuffles.") {
    const t = isSpell ? null : parseTrigger("Whenever ~ deals combat damage to a player, that player discards a card.");
    const who = t && t !== "fail" && t.body.effects[0]?.type === "discard" ? t.body.effects[0].who : undefined;
    if (!t || t === "fail" || t.event !== "selfDealsCombatDamageToPlayer" || t.body.effects.length !== 1 || who?.ref !== "eventPlayer") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "searchTheyName", library: who }], text: line.slice("Whenever ~ deals combat damage to a player, ".length) } });
    return true;
  }
  // Stalking Leonin: "When ~ enters, secretly choose an opponent.": chosen as the trigger resolves (CR 608.2d) and kept on
  // the permanent while it's that object (CR 400.7), known only to its controller until it's revealed; a Leonin that left
  // first, or one that became a copy of it, has no player chosen (rulings).
  if (line === "When ~ enters, secretly choose an opponent.") {
    const t = isSpell ? null : parseTrigger("When ~ enters, choose an opponent.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || e?.type !== "choose" || e.choice !== "opponent") return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e, keepOnSource: true, secret: true }], text: "secretly choose an opponent." } });
    return true;
  }
  // Stalking Leonin: "Reveal the player you chose" is a cost, payable only with a player chosen (rulings on it and Guardian
  // Archon); the target is a creature attacking you, not a planeswalker you control (rulings); it's exiled only if the
  // chosen player controls it as the ability resolves (CR 608.2b-c). Once for this object (CR 602.5b).
  if (line === "Reveal the player you chose: Exile target creature that's attacking you if it's controlled by the chosen player. Activate only once.") {
    const a = isSpell ? null : parseActivated("Reveal the player you chose: Exile target creature that's attacking you. Activate only once.");
    const ex = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || !a.revealChosen || !a.onceEver || a.body.targets.length !== 1 || a.body.targets[0]!.combat !== "attackingYou" || ex?.type !== "exile") return fail(out, raw);
    const effects: Effect[] = [{ type: "if", cond: { kind: "targetControlledByChosen", index: 0 }, effects: [ex] }];
    out.activated.push({ ...a, body: { ...a.body, effects, text: "Exile target creature that's attacking you if it's controlled by the chosen player." }, text: line });
    return true;
  }
  // Garth One-Eye: the name is chosen as the ability resolves, one not chosen yet for this Garth (as this object, rulings);
  // the copy is made from the Oracle card with that name outside the game (CR 707.13) and may be cast as it resolves,
  // paying its costs, its timing ignored (CR 707.12, rulings). Only while every named card is known and plays.
  if (/^\{T\}: Choose a card name that hasn't been chosen from among .+\. Create a copy of the card with the chosen name\. You may cast the copy\.$/.test(line)) {
    const names = namedCopyNames(d);
    const a = isSpell ? null : parseActivated("{T}: Draw a card.");
    if (!a || a === "fail" || names.length < 2 || new Set(names).size !== names.length || names.some((n) => { const c = namedCardDef(undefined, n); return !c || !isFullySupported(c); })) return fail(out, raw);
    out.activated.push({ ...a, body: { targets: [], effects: [{ type: "copyNamedCard", names }], text: line.slice("{T}: ".length) }, text: line });
    return true;
  }
  return false;
}
