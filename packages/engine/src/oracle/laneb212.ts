// Lane B round B212's whole spells, read after round B210's.
import type { AbilityBody, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";

/** Round B212's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB212Spell(text: string): AbilityBody | null | undefined {
  // Decoy Gambit: "For each opponent, choose up to one target creature that player controls, then return that creature to
  // its owner's hand unless its controller has you draw a card.": one "up to one" target for each opponent (CR 601.2c);
  // as it resolves, each opponent whose creature is still a legal target chooses, the active player first if it's an
  // opponent, then the others in turn order, each knowing the choices before; you draw that many cards, then the creatures
  // not paid for are all returned (rulings). One whose creature isn't a legal target any more can't choose (rulings,
  // CR 608.2b).
  if (text === "For each opponent, choose up to one target creature that player controls, then return that creature to its owner's hand unless its controller has you draw a card.") {
    const body = parseBody("For each opponent, return up to one target creature that player controls to its owner's hand.", { spell: true });
    const [bounce] = body?.effects ?? [];
    if (!body || body.targets.length !== 1 || !body.targets[0]!.perOpponent || body.effects.length !== 1 || bounce?.type !== "bounce" || bounce.what.ref !== "target") return null;
    const effects: Effect[] = [{ type: "bounceUnlessDraw", what: bounce.what }];
    return { targets: body.targets, effects, text };
  }
  // Fade Away: "For each creature, its controller sacrifices a permanent of their choice unless they pay {1}.": each
  // player counts the creatures they control as it starts, then, the active player first, makes that many choices,
  // paying {1} (mana abilities allowed) or choosing a permanent to sacrifice, some of each if they like; the permanents
  // are sacrificed all at once afterwards, so sacrificing one creature doesn't spare paying for another (rulings).
  if (text === "For each creature, its controller sacrifices a permanent of their choice unless they pay {1}.") {
    const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
    const permanent: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], text: "permanent" };
    const effects: Effect[] = [{ type: "punisher", who: { ref: "eachPlayer" }, options: [{ pay: { cost: "{1}" } }, { sacrifice: permanent }], effects: [], picksEach: { count: { kind: "permanents", filter: creature, whose: { ref: "eachOne" } } }, required: true }];
    return { targets: [], effects, text };
  }
  return undefined;
}
