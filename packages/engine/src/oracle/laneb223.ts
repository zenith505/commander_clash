// Lane B round B223's lines, read by compileCard before its triggers and activated abilities (after round B222's).
import type { CompiledCard, Effect, StaticCondition, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};
/** An activated ability line read the usual way, or null. */
const act = (text: string) => {
  const a = parseActivated(text);
  return a && a !== "fail" ? a : null;
};
/** The effects of one sentence of a spell or ability, or null. */
const body = (text: string) => parseBody(text, { spell: false })?.effects ?? null;

const CHAOS_MOON = "At the beginning of each upkeep, count the number of permanents. If the number is odd, until end of turn, red creatures get +1/+1 and whenever a player taps a Mountain for mana, that player adds an additional {R}. If the number is even, until end of turn, red creatures get -1/-1 and if a player taps a Mountain for mana, that Mountain produces colorless mana instead of any other type.";
const IMP = "{T}: Non-Wall creatures the active player controls attack this turn if able. At the beginning of the next end step, destroy each of those creatures that didn't attack this turn. Activate only during an opponent's turn and only before combat.";
const ARTISANS = "{T}: Flip a coin. If you win the flip, draw a card. If you lose the flip, counter target artifact spell you control that isn't the target of an ability from another creature named ~.";
const DISCIPLE = "When ~ enters, starting with you, each player chooses up to five permanents they control. All permanents other than ~ that weren't chosen this way phase out.";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB223Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, name: string): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Chaos Moon: "At the beginning of each upkeep, count the number of permanents. If the number is odd, until end of turn,
  // red creatures get +1/+1 and whenever a player taps a Mountain for mana, that player adds an additional {R}. If the
  // number is even, ... -1/-1 and if a player taps a Mountain for mana, that Mountain produces colorless mana instead of
  // any other type.": every player's permanents on the battlefield, counted as it resolves (phased-out ones are treated
  // as though they don't exist, CR 702.26b); the red creatures are those red as it resolves (CR 611.2c), and the mana
  // trigger (CR 605.1b) and replacement (CR 106.12b, 614.1a) last the turn, for any Mountain, one that arrives later too.
  if (!isSpell && line === CHAOS_MOON) {
    const t = trig("At the beginning of each upkeep, red creatures get +1/+1 until end of turn.");
    const up = body("Until end of turn, red creatures get +1/+1.");
    const down = body("Until end of turn, red creatures get -1/-1.");
    const mana = body("Until end of turn, whenever a player taps a Mountain for mana, that player adds an additional {R}.");
    const [grow] = up ?? [];
    const [shrink] = down ?? [];
    const [extra] = mana ?? [];
    const red = (e: Effect | undefined) => e?.type === "continuous" && e.what.ref === "each" && e.duration === "endOfTurn" && e.mods.length === 1 && e.mods[0]!.kind === "modifyPT" && e.what.filter.colors?.join() === "R" && !e.what.filter.controller;
    if (t?.event !== "eachUpkeep" || up?.length !== 1 || down?.length !== 1 || mana?.length !== 1 || !red(grow) || !red(shrink) || extra?.type !== "manaTriggerThisTurn" || extra.trigger.filter?.subtypes?.join() !== "Mountain" || extra.trigger.filter.controller) return fail();
    const permanents: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], text: "permanent" };
    const odd: StaticCondition = { kind: "amount", amount: { count: { kind: "permanents", filter: permanents } }, parity: "odd" };
    const colorless: Effect = { type: "landManaUntilEndOfTurn", mana: "C", subtype: "Mountain" };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "if", cond: { kind: "state", cond: odd }, effects: [grow!, extra], otherwise: [shrink!, colorless] }], text: line.replace(/^At the beginning of each upkeep, /, "") } });
    return true;
  }
  // Maddening Imp: "{T}: Non-Wall creatures the active player controls attack this turn if able. At the beginning of the
  // next end step, destroy each of those creatures that didn't attack this turn. Activate only during an opponent's turn
  // and only before combat.": the non-Wall creatures that player controls as it resolves (CR 611.2c), each made to attack
  // if able (CR 508.1d); at the next end step, those of them still on the battlefield that weren't declared as attackers
  // this turn are destroyed, whatever stopped them, being tapped too (rulings), all at once by one delayed trigger (CR
  // 603.7).
  if (!isSpell && line === IMP) {
    const a = act("{T}: Creatures the active player controls attack this turn if able. Activate only during an opponent's turn and only before combat.");
    const [must] = a?.body.effects ?? [];
    if (!a || a.body.targets.length || a.body.effects.length !== 1 || must?.type !== "continuous" || must.what.ref !== "each" || must.what.of?.ref !== "activePlayer" || must.mods.length !== 1 || must.mods[0]!.kind !== "attacksIfAble" || !a.activateIf) return fail();
    const nonWall: Effect = { ...must, what: { ...must.what, filter: { ...must.what.filter, notSubtypes: ["Wall"], text: "non-Wall creatures the active player controls" } } };
    const didnt: TargetSpec = { kind: "object", types: [], combat: "didntAttackThisTurn", text: "creature that didn't attack this turn" };
    const later: Effect = { type: "delayedForAffected", when: "nextEndStep", effects: [{ type: "destroy", what: { ref: "rememberedPermanents", cards: [], filter: didnt } }], text: "Destroy each of those creatures that didn't attack this turn." };
    out.activated.push({ ...a, body: { targets: [], effects: [nonWall, later], text: "Non-Wall creatures the active player controls attack this turn if able. At the beginning of the next end step, destroy each of those creatures that didn't attack this turn." }, text: line });
    return true;
  }
  // Goblin Artisans: "{T}: Flip a coin. If you win the flip, draw a card. If you lose the flip, counter target artifact spell
  // you control that isn't the target of an ability from another creature named Goblin Artisans.": the target is chosen as
  // it's activated, before the flip (CR 601.2c, 115.1), so there must be one; checked again as it resolves (CR 608.2b): a
  // spell another Goblin Artisans' ability targeted since then makes this one do nothing at all, flip included. The name is
  // the card's own name, any creature with it (not this one, CR 201.5 is about "this object").
  if (!isSpell && line === ARTISANS && name === "Goblin Artisans") {
    const a = act("{T}: Flip a coin. If you win the flip, draw a card. If you lose the flip, counter target artifact spell.");
    const spec = a?.body.targets[0];
    if (!a || a.body.targets.length !== 1 || spec?.kind !== "spell" || spec.types?.join() !== "Artifact" || a.body.effects.length !== 3 || a.body.effects[0]!.type !== "flipCoin") return fail();
    const target: TargetSpec = { ...spec, controller: "you", notTargetOfAbilityFrom: { types: ["Creature"], name }, text: `target artifact spell you control that isn't the target of an ability from another creature named ${name}` };
    out.activated.push({ ...a, body: { ...a.body, targets: [target], text: line.replace(/^\{T\}: /, "").replace(/~/g, name) }, text: line });
    return true;
  }
  // Disciple of Caelus Nin: "When ~ enters, starting with you, each player chooses up to five permanents they control. All
  // permanents other than ~ that weren't chosen this way phase out.": the choices in turn order from you, each seeing the
  // ones before (CR 608.2d), then every unchosen permanent but ~ itself phases out at once (CR 702.26b), with what's
  // attached to it (702.26g). ~ isn't offered: choosing it would only use up a slot.
  if (!isSpell && line === DISCIPLE) {
    const t = trig("When ~ enters, each player chooses up to five permanents they control, then sacrifices the rest.");
    const [keep] = t?.body.effects ?? [];
    if (t?.event !== "selfEnters" || t.body.effects.length !== 1 || keep?.type !== "keepRest" || keep.who.ref !== "eachPlayer" || keep.keep.length !== 1 || keep.keep[0]!.n !== 5 || !keep.keep[0]!.upTo || keep.destroy || keep.bounce || keep.tap) return fail();
    out.triggers.push({ ...t, body: { targets: [], effects: [{ ...keep, startingWithYou: true, phaseOut: true, notSource: true }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Disciple of Caelus Nin: "Permanents can't phase in." (CR 702.26c, rulings: anyone's, however they'd phase in).
  if (!isSpell && line === "Permanents can't phase in.") {
    out.permanentsCantPhaseIn = true;
    return true;
  }
  return false;
}
