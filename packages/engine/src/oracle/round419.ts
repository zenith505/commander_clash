// Round 419's whole lines (compile.ts, before round 418's): Missy's face-down Cybermen and villainous choice, Shifting
// Shadow's granted upkeep trigger, and Balthier and Fran's trigger for a Vehicle it crewed.
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const MISSY_DIES = "Whenever another nonartifact creature dies, return it to the battlefield under your control face down and tapped. It's a 2/2 Cyberman artifact creature.";
const MISSY_END = "At the beginning of your end step, each opponent faces a villainous choice — Each artifact creature you control deals 1 damage to that opponent, or you draw a card and chaos ensues.";
const SHIFTING = "At the beginning of your upkeep, destroy ~. Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and attach ⟪source⟫ to it, then put all other cards revealed this way on the bottom of your library in a random order.";
const BALTHIER = "Whenever a Vehicle crewed by ~ this turn attacks, if it's the first combat phase of the turn, you may pay {1}{R}{G}. If you do, after this phase, there is an additional combat phase.";

/** One whole line of round 419's (compile.ts); false when it isn't one of these. */
export function round419Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Missy: "return it to the battlefield under your control face down and tapped. It's a 2/2 Cyberman artifact creature."
  // The card, if it's still in the graveyard it went to (CR 400.7; a token has ceased to exist, CR 111.7-8, and a
  // commander its owner put into the command zone is gone too, CR 903.9a), enters face down as a nameless, colorless 2/2
  // Cyberman artifact creature (CR 708.2a, rulings), tapped. Whoever controlled it, it's yours. Turned face up, it's the
  // card again and the Cyberman effect ends (rulings, CR 708.8).
  if (line === MISSY_DIES) {
    const t = isSpell ? null : parseTrigger("Whenever another nonartifact creature dies, return it to the battlefield tapped under your control.");
    const put = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "permanentDies" || !t.dies?.other || t.body.targets.length || t.body.effects.length !== 1 || put?.type !== "putOntoBattlefield" || put.what.ref !== "subjectCard" || !put.tapped || put.owner || put.faceDown) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...put, faceDown: "cyberman" }], text: line.slice("Whenever another nonartifact creature dies, ".length) } });
    return true;
  }
  // Missy's villainous choice (CR 701.55): each opponent in turn order chooses, and what they chose is done before the next
  // one chooses (rulings, CR 701.55d). "Each artifact creature you control deals 1 damage to that opponent": each one its
  // own source, all at once (CR 120.3), to the opponent choosing. "Chaos ensues" only triggers the chaos abilities of
  // plane cards (CR 311.7), which only a Planechase game has, so here it does nothing, as with Will of the Planeswalkers.
  // Either option may be chosen even when it would do nothing (rulings).
  if (line === MISSY_END) {
    const t = isSpell ? null : parseTrigger("At the beginning of your end step, each opponent faces a villainous choice — ~ deals 1 damage to that opponent, or you draw a card.");
    const v = t && t !== "fail" ? t.body.effects[0] : undefined;
    const dmg = v?.type === "villainous" ? v.options[0][0] : undefined;
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.body.targets.length || t.body.effects.length !== 1 || v?.type !== "villainous" || v.who.ref !== "eachOpponent" || v.options[0].length !== 1 || dmg?.type !== "damage" || dmg.amount !== 1 || !dmg.to || !("ref" in dmg.to) || dmg.to.ref !== "eventPlayer" || v.options[1].length !== 1 || v.options[1][0]!.type !== "draw") return fail(out, raw);
    const each: Effect = { type: "eachDealsDamage", what: { ref: "each", filter: { kind: "object", types: [], allTypes: ["Artifact", "Creature"], notTypes: [], notColors: [], controller: "you", text: "each artifact creature you control" } }, amount: 1, recipient: { ref: "eventPlayer" } };
    const chaos: Effect = { type: "noEffect", text: "chaos ensues: only a Planechase game has plane cards for it to trigger (CR 311.7)" };
    out.triggers.push({
      ...t,
      body: {
        ...t.body,
        effects: [{ ...v, options: [[each], [...v.options[1], chaos]], labels: ["Each artifact creature you control deals 1 damage to that opponent", "You draw a card and chaos ensues"] }],
        text: line.slice("At the beginning of your end step, ".length),
      },
    });
    return true;
  }
  // Shifting Shadow's granted 'At the beginning of your upkeep, destroy this creature. Reveal cards ... until you reveal a
  // creature card. Put that card onto the battlefield and attach Shifting Shadow to it, then put all other cards revealed
  // this way on the bottom of your library in a random order.': an ability of the enchanted creature, so "your" is that
  // creature's controller, who reveals from their own library and puts the card onto the battlefield under their control.
  // State-based actions aren't checked while it resolves (CR 704.3), so the Aura is still on the battlefield after the
  // creature is destroyed and moves onto the new creature (CR 701.3a), the Aura as the object that gave the ability (CR
  // 400.7: gone, it attaches to nothing, rulings). An indestructible creature isn't destroyed but the Aura still moves
  // (rulings). If it can't enchant the new creature (protection from red), or no creature card is revealed, it doesn't
  // move (CR 701.3b): attached to the destroyed creature's empty spot, state-based actions put it into its owner's
  // graveyard (CR 704.5m, rulings). Without a creature card found, the whole library goes to the bottom in a random order.
  if (line === SHIFTING) {
    const t = isSpell ? null : parseTrigger("At the beginning of your upkeep, destroy ~. Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.");
    const [destroy, reveal] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "yourUpkeep" || t.body.targets.length || t.body.effects.length !== 2 || destroy?.type !== "destroy" || destroy.what.ref !== "self" || reveal?.type !== "revealUntil" || reveal.found !== "battlefield" || reveal.rest !== "bottom" || reveal.who || reveal.remember || reveal.filter.types?.join() !== "Creature") return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [destroy, { ...reveal, remember: true }, { type: "attach", what: { ref: "created" }, source: { ref: "grantSource" } }], text: line.slice("At the beginning of your upkeep, ".length) } });
    return true;
  }
  // Balthier and Fran: "Whenever a Vehicle crewed by ~ this turn attacks": any Vehicle, whoever controls it now, that this
  // permanent, as the object it is now, was tapped to crew this turn (CR 702.122d), each as the object it is now (CR
  // 400.7). "If it's the first combat phase of the turn" is an intervening if (CR 603.4, 506.1). Paying makes one more
  // combat phase right after this one, with no main phase between (CR 500.8, rulings); two Vehicles paid for make two.
  if (line === BALTHIER) {
    const t = isSpell ? null : parseTrigger("Whenever a Vehicle you control attacks, if it's the first combat phase of the turn, you may pay {1}{R}{G}. If you do, after this phase, there is an additional combat phase.");
    const may = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "creatureYouControlAttacks" || !t.attacker || t.attacker.other || t.attacker.anyone || t.attacker.attacksYou || t.attacker.filter.subtypes?.join() !== "Vehicle" || t.ifCond?.kind !== "phase" || !t.ifCond.first || t.body.effects.length !== 1 || may?.type !== "may" || may.effects[0]?.type !== "addPhases") return fail(out, raw);
    const { controller: _, ...filter } = t.attacker.filter;
    out.triggers.push({ ...t, attacker: { filter: { ...filter, text: "Vehicle crewed by ~ this turn" }, anyone: true, crewedBySelf: true } });
    return true;
  }
  return false;
}
