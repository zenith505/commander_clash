// Lane B round B245's lines, read by compileCard before its triggers and activated abilities (after round B244's), and
// its whole spells, read after round B194's.
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { X } from "./words";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB245Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  // Caller of the Hunt: "As an additional cost to cast this spell, choose a creature type.": the type is chosen as the
  // permanent spell is cast (CR 601.2b, 601.2h), one existing creature type (CR 205.3m), as for Selective Snare's
  // (CompiledCard.castChooseType, CostChoices.creatureType). "The chosen type" of its other abilities is that choice (CR
  // 607.2d), for the spell and for the permanent it becomes (CR 400.7d, GameObject.castType); anywhere else, or if it
  // wasn't cast, no type was chosen, and nothing is of the chosen type.
  if (!isSpell && line === "As an additional cost to cast ~, choose a creature type.") {
    out.castChooseType = true;
    return true;
  }
  return false;
}

const NONLAND: TargetSpec = { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "nonland card" };

/** A whole instant or sorcery, read at once; undefined when it isn't one of these, null when it's one not understood. */
export function roundB245Spell(text: string): AbilityBody | null | undefined {
  // Reap Intellect: "Target opponent reveals their hand. You choose up to X nonland cards from it and exile them. For each
  // card exiled this way, search that player's graveyard, hand, and library for any number of cards with the same name as
  // that card and exile them. Then that player shuffles.": up to X of the revealed cards, none too (CR 107.1c); then one
  // search of that player's three zones for cards with any of those names, which the searcher may leave there (rulings,
  // CR 701.23b), as Haunting Echoes' "for each card exiled this way" is one search; with none exiled, no name to find
  // (rulings: the library isn't searched), and that player shuffles.
  if (text === "Target opponent reveals their hand. You choose up to X nonland cards from it and exile them. For each card exiled this way, search that player's graveyard, hand, and library for any number of cards with the same name as that card and exile them. Then that player shuffles.") {
    const who = { ref: "target" as const, index: 0 };
    return {
      targets: [{ kind: "player", opponent: true, text: "target opponent" }],
      effects: [
        { type: "lookAtHand", who, reveal: true },
        { type: "takeFromHand", who, filter: NONLAND, action: "exile", n: X, upTo: true },
        { type: "exileNamed", who, filter: { kind: "card", text: "card with the same name as a card exiled this way" }, sameName: { exiledThisWay: true } },
      ],
      text,
    };
  }
  // Deadly Cover-Up: "Destroy all creatures. If evidence was collected, exile a card from an opponent's graveyard. Then
  // search its owner's graveyard, hand, and library for any number of cards with that name and exile them. That player
  // shuffles, then draws a card for each card exiled from their hand this way.": the card is chosen as it resolves, after
  // the creatures are destroyed (CR 608.2c), not targeted, from any opponent's graveyard, a basic land too (rulings); the
  // search is of that card's owner's zones for cards with its name, any number of them (CR 701.23b), as Lost Legacy's.
  // With no evidence collected (CR 701.59c) or no card to exile, there's no name and no player for the rest.
  if (text === "Destroy all creatures. If evidence was collected, exile a card from an opponent's graveyard. Then search its owner's graveyard, hand, and library for any number of cards with that name and exile them. That player shuffles, then draws a card for each card exiled from their hand this way.") {
    const wipe = parseBody("Destroy all creatures.", { spell: true });
    if (!wipe || wipe.targets.length || wipe.effects.length !== 1 || wipe.effects[0]!.type !== "destroy") return null;
    const owner = { ref: "yardChosenOwner" as const };
    const rest: Effect[] = [
      { type: "chooseFromGraveyard", n: 1, anyGraveyard: true, opponentsYards: true, dest: "exile" },
      { type: "exileNamed", who: owner, filter: { kind: "card", text: "card with that name" }, sameName: { yardChosen: true } },
      { type: "draw", who: owner, n: { count: { kind: "exiledFromHandThisWay" }, times: 1 } },
    ];
    return { targets: [], effects: [...wipe.effects, { type: "if", cond: { kind: "evidence" }, effects: rest }], text };
  }
  return undefined;
}
