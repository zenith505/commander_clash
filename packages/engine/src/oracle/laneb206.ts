// Lane B round B206's lines, read by compileCard before its triggers and activated abilities (after round B205's), its
// whole spells, read after round B205's, and its Saga chapters, read after round 345's.
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseLoyalty } from "./activated";
import { parseBody } from "./body";
import { roundB210Spell } from "./laneb210";

const CREATURE: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB206Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Kaya, Ghost Assassin: "0: Exile ~ or up to one target creature. Return that card to the battlefield under its owner's
  // control at the beginning of your next upkeep. You lose 2 life.": whether to target a creature is chosen as it's
  // activated; with one, Kaya or that creature is chosen as it resolves; with none, Kaya is exiled if she's still there
  // (rulings). An illegal target means it doesn't resolve at all, so nothing is exiled and no life is lost (CR 608.2b,
  // rulings). The card returns under its owner's control as a new object (CR 400.7), at that upkeep (CR 603.7).
  if (line === "0: Exile ~ or up to one target creature. Return that card to the battlefield under its owner's control at the beginning of your next upkeep. You lose 2 life.") {
    const ab = parseLoyalty("", "0", "Exile up to one target creature. Return that card to the battlefield under its owner's control at the beginning of the next end step. You lose 2 life.", raw);
    const [flicker, lose] = ab !== "fail" ? ab.body.effects : [];
    const [t] = ab !== "fail" ? ab.body.targets : [];
    if (ab === "fail" || ab.loyalty !== 0 || ab.body.targets.length !== 1 || ab.body.effects.length !== 2 || flicker?.type !== "flicker" || flicker.what.ref !== "target" || flicker.what.index !== 0 || flicker.under !== "owner" || flicker.at !== "nextEndStep" || Object.keys(flicker).length !== 4 || lose?.type !== "loseLife" || lose.who.ref !== "you" || t?.kind !== "object" || !t.optional || t.types?.join() !== "Creature") {
      out.unsupported.push(raw);
      return true;
    }
    const self: Effect = { type: "flicker", what: { ref: "self" }, under: "owner", at: "yourNextUpkeep" };
    const target: Effect = { ...flicker, at: "yourNextUpkeep" };
    const exile: Effect = { type: "if", cond: { kind: "targetIs", index: 0, filter: CREATURE }, effects: [{ type: "either", options: [[self], [target]], labels: ["Exile ~", "Exile the target creature"] }], otherwise: [self] };
    out.activated.push({ ...ab, body: { ...ab.body, effects: [exile, lose], text: line.replace(/^0: /, "") } });
    return true;
  }
  // Drach'Nyen: "Equipped creature has menace and gets +X/+0, where X is the exiled card's power." (after its flavor word,
  // CR 207.2d): the card its enters ability exiled (CR 607.2a, linked by linkExile), its power as it is in exile, a
  // characteristic-defining ability applying there; the total of them if more than one was exiled (a copied trigger),
  // 0 for a card with no printed power (rulings).
  if (line === "Equipped creature has menace and gets +X/+0, where X is the exiled card's power.") {
    out.statics.push({ affects: { kind: "attached" }, mods: [{ kind: "modifyPT", power: { count: { kind: "linkedExiledPT", stat: "power" } }, toughness: 0 }, { kind: "addKeywords", keywords: ["Menace"] }], text: line });
    return true;
  }
  return false;
}

/** Round B206's whole spells, read after round B205's: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB206Spell(text: string): AbilityBody | null | undefined {
  // Fumble: "Return target creature to its owner's hand. Gain control of all Auras and Equipment that were attached to it,
  // then attach them to another creature.": the Auras and Equipment attached to it just before it left, still on the
  // battlefield until state-based actions are checked (CR 704.5m-n); you gain control of them for good, then attach all of
  // them to one creature they can all legally be attached to, chosen as it resolves, not targeted (an opponent's or one
  // with hexproof too); if there's none, they stay unattached (rulings).
  if (text === "Return target creature to its owner's hand. Gain control of all Auras and Equipment that were attached to it, then attach them to another creature.") {
    const body = parseBody("Return target creature to its owner's hand.", { spell: true });
    const [bounce] = body?.effects ?? [];
    if (!body || body.targets.length !== 1 || body.effects.length !== 1 || bounce?.type !== "bounce" || bounce.what.ref !== "target" || bounce.what.index !== 0 || Object.keys(bounce).length !== 2) return null;
    const effects: Effect[] = [
      { type: "noteAttachments", what: { ref: "target", index: 0 } },
      bounce,
      { type: "continuous", what: { ref: "noted" }, mods: [{ kind: "control" }], duration: "game" },
      { type: "attachToChosen", source: { ref: "noted" }, filter: { ...CREATURE, text: "another creature" }, together: true },
    ];
    return { ...body, effects, text };
  }
  return roundB210Spell(text);
}

/** Round B206's Saga chapters, read after round 345's: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB206Chapter(text: string): AbilityBody | null | undefined {
  // The Three Seasons: "III — Choose three cards in each graveyard. Their owners shuffle those cards into their libraries.":
  // you choose them as it resolves (not targeted, CR 115.1), all of a graveyard's cards when it has three or fewer; then
  // they're shuffled in at once, and a player with none chosen doesn't shuffle (rulings).
  if (text === "Choose three cards in each graveyard. Their owners shuffle those cards into their libraries.") {
    return { targets: [], effects: [{ type: "chooseFromGraveyard", n: 3, who: { ref: "eachPlayer" }, youChoose: true, dest: "shuffleIn" }], text };
  }
  return undefined;
}
