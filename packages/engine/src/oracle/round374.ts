// Round 374's whole lines (compile.ts, after round 373's): a chosen creature type for the creature cards in your graveyard
// (Ashes of the Fallen), an opponent splitting the cards a cost exiled (Coin of Fate) and a target card returned with the
// sacrificed card at your next upkeep (Rescue from the Underworld), and creature cards chosen in an opponent's graveyard
// and in yours, returned together (Dawnbreak Reclaimer).
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

export function round374Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ashes of the Fallen: "Each creature card in your graveyard has the chosen creature type in addition to its other
  // types.": layer 4 (CR 613.1d, 205.1b) for the creature cards in its controller's graveyard only (a graveyard holds only
  // its owner's cards, CR 404.2), from the type chosen as it entered (CR 614.12); nothing on the battlefield. Added as the
  // cards enter the graveyard, so a soulshift trigger can target one (rulings).
  if (line === "Each creature card in your graveyard has the chosen creature type in addition to its other types.") {
    if (isSpell || !out.entersChoose?.some((c) => c.what === "creatureType")) return fail(out, raw);
    out.statics.push({ affects: { kind: "none" }, mods: [{ kind: "addTypes", types: [], subtypes: [], chosenType: true }], text: line, offFieldCards: "yardCreature" });
    return true;
  }
  // Coin of Fate: the cost exiles two creature cards from your graveyard (CR 602.2b), and its ability is about those cards
  // (StackItem.costExiled): an opponent you choose picks the one for the bottom of your library, the other returns tapped
  // (Effect opponentSplitsCostExiled); then you become the monarch (CR 725).
  const coin = /^(\{[^:]+, Exile two creature cards from your graveyard, Sacrifice ~): An opponent chooses one of the exiled cards\. You put that card on the bottom of your library and return the other to the battlefield tapped\. You become the monarch\.$/.exec(line);
  if (coin) {
    const a = isSpell ? null : parseActivated(`${coin[1]}: You become the monarch.`);
    const exile = a && a !== "fail" ? a.costs?.find((c) => c.kind === "exileFromGraveyard") : undefined;
    const monarch = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || a.body.targets.length || exile?.kind !== "exileFromGraveyard" || exile.n !== 2 || exile.x || exile.singleGraveyard || exile.filter?.types?.join() !== "Creature" || monarch?.type !== "becomeMonarch") return fail(out, raw);
    const costs = a.costs!.map((c) => (c === exile ? { ...exile, costCards: true as const } : c));
    out.activated.push({ ...a, costs, body: { ...a.body, effects: [{ type: "opponentSplitsCostExiled" }, monarch], text: line.slice(line.indexOf(": ") + 2) }, text: line });
    return true;
  }
  // Rescue from the Underworld: the target is chosen before the creature is sacrificed (CR 601.2c, 601.2h), so it's never
  // that creature; one delayed trigger returns both (Effect returnWithSacrificedAtYourNextUpkeep), and the spell is exiled
  // as it resolves, not later (rulings, CR 608.2n).
  if (line === "Choose target creature card in your graveyard. Return that card and the sacrificed card to the battlefield under your control at the beginning of your next upkeep. Exile ~.") {
    const sac = out.additionalCosts?.length === 1 ? out.additionalCosts[0] : undefined;
    if (!isSpell || out.spell || sac?.kind !== "sacrifice" || sac.n !== 1 || sac.filter?.types?.join() !== "Creature" || sac.filter.subtypes?.length) return fail(out, raw);
    const b = parseBody("Return target creature card in your graveyard to the battlefield. Exile ~.", { spell: true });
    const [put, exile] = b?.effects ?? [];
    if (!b || b.targets.length !== 1 || b.effects.length !== 2 || put?.type !== "putOntoBattlefield" || put.what.ref !== "target" || exile?.type !== "exileSpell") return fail(out, raw);
    out.spell = { targets: b.targets, effects: [{ type: "returnWithSacrificedAtYourNextUpkeep", what: put.what }, exile], text: line };
    return true;
  }
  // Dawnbreak Reclaimer: at the beginning of your end step (CR 513.1a), both choices made as it resolves, the second by
  // the first card's owner (Effect swapFromGraveyards).
  const DAWN = "At the beginning of your end step, choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control.";
  if (line === DAWN) {
    const t = isSpell ? null : parseTrigger("At the beginning of your end step, draw a card.");
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.ifCond) return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "swapFromGraveyards" }], text: line.slice("At the beginning of your end step, ".length) } });
    return true;
  }
  return false;
}
