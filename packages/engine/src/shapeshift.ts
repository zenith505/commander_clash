// Volrath's Shapeshifter (round 459): "As long as the top card of your graveyard is a creature card, this creature has the
// full text of that card and has the text "{2}: Discard a card." (This creature has that card's name, mana cost, color,
// types, abilities, power, and toughness.)"
//
// Its ability sets its characteristics with a text-changing effect (rulings), so it applies in layer 3 (CR 613.1c), on top
// of its copiable values (layer 1): a copy of it copies the Shapeshifter, with the shapeshifting ability (rulings; text
// changes aren't copiable values, CR 707.2). Layers 4 to 7 apply to what it has become. It has the card's front face (CR
// 712.8a) or normal characteristics (715.4, 710.1), plus the quoted ability. Changing forms isn't entering, so the card's
// "enters" abilities don't trigger (rulings); entering while the top card is a creature card, it enters as that, and its
// own replacement effects and triggers as it enters are that card's (CR 614.12, 603.6a).
//
// The definition it has now is kept on it (GameObject.shapeOf) so that the engine's definition key, cardIdOf, which is read
// without the game state, finds it. It's worked out as the permanent enters (moveObject, finishEnteringAs) and again as
// each event ends (syncShapes: between the instructions of a resolution, and with each pass of state-based actions), as
// cards put into a graveyard at the same time are (graveyard.ts): during one event the Shapeshifter keeps the form it had
// as the event began, as it would with everything that event does happening at once.

import { compileCard } from "./oracle";
import { copiableKeyOf, ownDefOf } from "./cards";
import { restingDef } from "./faces";
import { controllerOf, invalidateCharacteristics } from "./layers";
import type { CardDef, GameObject, GameState } from "./types";

/** The form `o` should have now (GameObject.shapeOf), or undefined: not a Shapeshifter, or the top card isn't a creature card. */
export function shapeWanted(s: GameState, o: GameObject): GameObject["shapeOf"] {
  if (o.zone !== "battlefield" || o.faceDown || o.textFrom) return undefined;
  const own = ownDefOf(s, o);
  const ability = compileCard(own).shapeshifter;
  if (!ability) return undefined;
  const top = topCard(s, controllerOf(s, o));
  if (!top) return undefined;
  const card = s.cards[top.cardId];
  if (!card) return undefined;
  const d = restingDef(card);
  if (!d.types.includes("Creature")) return undefined;
  const base = copiableKeyOf(o);
  const key = `${base}|shape:${d.oracleId}`;
  s.cards[key] ??= shapeDef(own, d, ability.grant, key);
  return { base, key };
}

/**
 * The top card of a player's graveyard: the last put there (CR 404.1), not a token (a token isn't a card, CR 108.2, 111.1;
 * one in a graveyard ceases to exist as state-based actions are checked, 704.5d).
 */
function topCard(s: GameState, pid: string): GameObject | undefined {
  const yard = s.players[pid]?.graveyard ?? [];
  for (let i = yard.length - 1; i >= 0; i--) {
    const c = s.objects[yard[i]!];
    if (c && !c.isToken && !c.spellCopy) return c;
  }
  return undefined;
}

/**
 * The Shapeshifter (`own`) with the full text of `card`: its name, mana cost, color, types, abilities, power and toughness,
 * and the quoted ability after its own (rulings: "this card keeps the granted ability in addition to those from the card
 * being copied"). A characteristic the card doesn't have isn't taken: "If the top card in the graveyard has any other
 * undefined characteristics, then those characteristics are not acquired and the shapeshifter uses the characteristic
 * from its own card" (rulings), which is a mana cost for a creature card with none (Dryad Arbor). It isn't the card itself:
 * not double-faced, split, flip, meld or an adventurer, and its color identity is its own (CR 903.4).
 */
function shapeDef(own: CardDef, card: CardDef, grant: string, key: string): CardDef {
  const { faces: _f, faceOf: _fo, meld: _m, layout: _l, ...rest } = card;
  return {
    ...rest,
    oracleId: key,
    oracleText: card.oracleText ? `${card.oracleText}\n${grant}` : grant,
    ...(card.manaCost ? {} : { manaCost: own.manaCost, cmc: own.cmc }),
    colorIdentity: own.colorIdentity,
    layout: "normal",
    keywords: [...card.keywords],
  };
}

/**
 * As an event ends (an instruction of a resolution, a pass of state-based actions): each Shapeshifter on the battlefield
 * takes the form the top card of its controller's graveyard gives it now, or its own.
 */
export function syncShapes(s: GameState): void {
  let changed = false;
  for (const id of s.battlefield) {
    const o = s.objects[id];
    if (!o) continue;
    const want = shapeWanted(s, o);
    if (want?.key === o.shapeOf?.key && want?.base === o.shapeOf?.base) continue;
    if (want) o.shapeOf = want;
    else delete o.shapeOf;
    changed = true;
  }
  if (changed) invalidateCharacteristics(s);
}

/** As `o` enters the battlefield (moveObject, finishEnteringAs): its form, worked out as it enters (CR 614.12). */
export function enterShape(s: GameState, o: GameObject): void {
  const want = o.zone === "battlefield" ? shapeWanted(s, o) : undefined;
  if (want?.key === o.shapeOf?.key && want?.base === o.shapeOf?.base) return;
  if (want) o.shapeOf = want;
  else delete o.shapeOf;
  invalidateCharacteristics(s);
}
