// Lane B round B272's lines, read by compileCard before the generic triggers (after round B271's): Cass, Hand of
// Vengeance's and Bruna, Light of Alabaster's triggers.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseTrigger } from "./triggers";

const CASS = "Whenever ~ or another creature you control dies, if it was enchanted or equipped, return any number of Aura cards that were attached to it from your graveyard to the battlefield attached to target creature, then attach any number of Equipment that were attached to it to that creature.";

const BRUNA = "Whenever ~ attacks or blocks, you may attach to it any number of Auras on the battlefield and you may put onto the battlefield attached to it any number of Aura cards that could enchant it from your graveyard and/or hand.";

const AURA_CARD: TargetSpec = { kind: "card", types: [], notTypes: [], notColors: [], subtypes: ["Aura"], text: "Aura card" };

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB272Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Cass: a leaves-the-battlefield ability that looks back in time (CR 603.10a): ~ or another creature you control that
  // had an Aura or an Equipment attached to it as it last existed (an intervening "if", CR 603.4, about the past, so
  // still true as it resolves). The target is chosen as it's put on the stack (CR 603.3d); with it illegal, nothing
  // happens (CR 608.2b). First the Aura cards, each only if it could legally enchant the target (rulings), then the
  // Equipment, still those objects on the battlefield (CR 400.7), each only if it could be attached (CR 701.3b), in the
  // order the text says (CR 608.2c).
  if (line === CASS) {
    const t = isSpell ? undefined : parseTrigger("Whenever ~ or another creature you control dies, if it was enchanted or equipped, target creature gets +1/+1 until end of turn.");
    if (!t || t === "fail" || t.event !== "permanentDies" || !t.dies?.orSelf || t.dies.filter.status !== "enchantedOrEquipped" || t.dies.filter.controller !== "you" || t.body.targets.length !== 1) return fail();
    const effects: Effect[] = [
      { type: "deadAurasOnto", host: 0 },
      { type: "attachAny", host: 0, deadEquipment: true },
    ];
    out.triggers.push({ ...t, body: { targets: t.body.targets, effects, text: line.replace(/^Whenever ~ or another creature you control dies, /, "") } });
    return true;
  }
  // Bruna: as it attacks or blocks (CR 508.1m, 509.1i; the Auras are attached before blockers are declared or before
  // combat damage, rulings), first any player's Auras on the battlefield, each still under its controller's control
  // (CR 701.3a), then Aura cards of yours from your graveyard and/or hand, put onto the battlefield under your control
  // (CR 110.2a), both only ones that could legally enchant it (rulings, CR 701.3b, 303.4f); with Bruna gone (or a new
  // object), nothing is attached (CR 400.7, 303.4g).
  if (line === BRUNA) {
    const t = isSpell ? undefined : parseTrigger("Whenever ~ attacks or blocks, draw a card.");
    if (!t || t === "fail" || t.event !== "selfAttacksOrBlocks") return fail();
    const effects: Effect[] = [
      { type: "attachAny", host: 0, self: true, anyAura: true },
      { type: "putFromHand", filter: AURA_CARD, may: true, any: true, orGraveyard: true, attachToSelf: true, couldEnchantSelf: true },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^Whenever ~ attacks or blocks, /, "") } });
    return true;
  }
  return false;
}
