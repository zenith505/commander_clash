// Lane B round B286's draw replacement: Unpredictable Cyclone's "If a cycling ability of another nonland card would cause you
// to draw a card, instead exile cards from the top of your library until you exile a card that shares a card type with the
// cycled card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on
// the bottom of your library in a random order." (CR 614.1a, 702.29a; from game.ts drawReplacementChoices and
// applyDrawReplacement).
import { abilitiesOf, defOf } from "../cards";
import { continueDraws, freeCastable, log, moveObject, nameOf, obj, player } from "../game";
import { controllerOf } from "../layers";
import { shuffle } from "../rng";
import type { CycloneRest, DrawAfter, GameState, ObjectId, PlayerId } from "../types";

/**
 * The Unpredictable Cyclone `pid` controls that would replace their next draw, if the resolving ability is a cycling ability
 * (CR 702.29a) its controller `pid` activated by cycling a nonland card (its card types as it was cycled, StackItem.cycled);
 * "another" is any card but that Cyclone itself, which is on the battlefield. Typecycling searches, so it draws nothing.
 */
export function cycloneFor(s: GameState, pid: PlayerId): ObjectId | undefined {
  const item = s.resolving?.item;
  if (!item?.cycled || item.controller !== pid || item.cycled.types.includes("Land")) return undefined;
  return s.battlefield.find((id) => id !== item.cycled!.card && controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).drawCycloneCycled);
}

/**
 * The draw is replaced (CR 614.6: nothing is drawn): cards are exiled from the top of the library one at a time until one
 * shares a card type with the cycled card (any one of them, rulings; a card in the library has its front face's types, CR
 * 712.8a), which may be cast without paying its mana cost as part of this, timing for its card type ignored (CR 608.2g,
 * rulings); a card that can't be cast (a land, or one with no legal targets) stays exiled for the rest. With none found, the
 * whole library was exiled and goes back in a random order (rulings). "paused" while the cast is offered.
 */
export function cycloneInstead(s: GameState, pid: PlayerId, src: ObjectId, left: number, after: DrawAfter | undefined, made: number[]): "paused" | void {
  const p = player(s, pid);
  const name = nameOf(s, src);
  const types = s.resolving!.item.cycled!.types;
  const cycled = defOf(s, obj(s, s.resolving!.item.cycled!.card)).name;
  s.resolving!.drawReplaced = true; // a draw replaced (Sindbad rulings)
  const exiled: ObjectId[] = [];
  let hit: ObjectId | undefined;
  while (p.library.length) {
    const top = p.library[0]!;
    moveObject(s, top, "exile");
    if (obj(s, top).zone !== "exile") break;
    exiled.push(top);
    if (defOf(s, obj(s, top)).types.some((t) => types.includes(t))) {
      hit = top;
      break;
    }
  }
  log(s, `${p.name} exiles ${exiled.length === 1 ? "a card" : `${exiled.length} cards`} from the top of their library instead of drawing (${name}, cycling ${cycled})${hit ? `, finding ${nameOf(s, hit)}` : exiled.length ? ", none sharing a card type with it" : ""}.`);
  const rest: CycloneRest = { exiled, left, made: [...made], ...(after ? { after } : {}) };
  if (hit) {
    s.pending = { kind: "castFree", player: pid, objectId: hit, source: name, cyclone: rest };
    if (freeCastable(s, pid, hit)) return "paused";
    s.pending = null;
    log(s, `${nameOf(s, hit)} can't be cast.`);
  }
  bottomRest(s, pid, exiled);
}

/** The exiled cards that weren't cast, to the bottom of `pid`'s library in a random order. */
function bottomRest(s: GameState, pid: PlayerId, exiled: ObjectId[]) {
  const rest = exiled.filter((id) => s.objects[id]?.zone === "exile");
  shuffle(s, rest);
  for (const id of rest) moveObject(s, id, "library"); // to the bottom
  if (rest.length) log(s, `${player(s, pid).name} puts ${rest.length === 1 ? "a card" : `${rest.length} cards`} on the bottom of their library in a random order.`);
}

/** After the Cyclone's free cast was made or declined: the rest to the bottom, then the draws after this one go on. */
export function cycloneDone(s: GameState, pid: PlayerId, rest: CycloneRest): void {
  bottomRest(s, pid, rest.exiled);
  continueDraws(s, pid, rest.left, rest.after, [...rest.made]);
}
