// Meld (CR 701.42, 712.4): one card of a meld pair exiles itself and its counterpart and puts them onto the battlefield
// as one melded permanent, represented by both cards (712.4a), with only the characteristics of their combined back face
// (712.8g, meld-results.ts). It's the object of the card whose ability melded them (GameObject.melded), the other card
// part of it like a merged permanent's components (GameObject.merged, CR 730): as it leaves the battlefield, both cards
// go where it goes (712.21).

import { defOf, realDefOf } from "./cards";
import { attackingPermanentOf, log, moveObject, obj, player } from "./game";
import { characteristics, controllerOf, invalidateCharacteristics } from "./layers";
import { isMeldResult, meldPartnerName, meldResultDef } from "./meld-results";
import type { GameObject, GameState, ObjectId, PlayerId } from "./types";

/**
 * The permanents `pid` both owns and controls that have type `type` and are named `name` ("you both own and control ~
 * and a creature named Midnight Scavengers"), other than `except`. Any of them could be the one exiled (rulings).
 */
function ownedNamed(s: GameState, pid: PlayerId, name: string, type: string, except: ObjectId): GameObject[] {
  return s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => o.id !== except && o.owner === pid && controllerOf(s, o) === pid)
    .filter((o) => {
      const c = characteristics(s, o);
      return c.name === name && c.types.includes(type);
    });
}

/**
 * The permanents `src` could be exiled and melded with: "if you both own and control ~ and a creature named [its
 * counterpart]" (and "if ~ and a creature named ... are attacking", `attacking`). None if `src` isn't a meld card on the
 * battlefield that `pid` owns and controls. Its counterpart's name is from its copiable values.
 */
export function meldPartners(s: GameState, srcId: ObjectId | undefined, pid: PlayerId, type: string, attacking = false): GameObject[] {
  const src = srcId ? s.objects[srcId] : undefined;
  if (!src || src.zone !== "battlefield" || src.owner !== pid || controllerOf(s, src) !== pid) return [];
  if (attacking && src.attacking === undefined) return [];
  const partner = meldPartnerName(defOf(s, src));
  if (!partner) return [];
  return ownedNamed(s, pid, partner, type, src.id).filter((o) => !attacking || o.attacking !== undefined);
}

/** Is this a card (not a token or a copy of a spell) of the meld pair that melds into `result` (CR 701.42b)? */
const pairCard = (s: GameState, o: GameObject, result: string) => !o.isToken && !o.spellCopy && realDefOf(s, o).meld?.result === result && !isMeldResult(realDefOf(s, o));

/**
 * "Exile them, then meld them into [the combined back face]" (CR 701.42a): `src` and `partner` are exiled; then, if
 * they're the two cards of `src`'s meld pair, they're put onto the battlefield under `pid`'s control as one melded
 * permanent, tapped and attacking `attack` if given (it was never declared as an attacker, rulings). Anything else stays
 * in exile (701.42c): a token ceases to exist, a Clone stays a Clone in exile. Returns the melded permanent.
 */
export function meld(s: GameState, srcId: ObjectId, partnerId: ObjectId, pid: PlayerId, attack?: { player: PlayerId; planeswalker?: ObjectId }): GameObject | undefined {
  const src = obj(s, srcId);
  const result = defOf(s, src).meld!.result;
  log(s, `${player(s, pid).name} exiles ${defOf(s, src).name} and ${defOf(s, obj(s, partnerId)).name} to meld them.`);
  moveObject(s, srcId, "exile");
  moveObject(s, partnerId, "exile");
  const [a, b] = [s.objects[srcId], s.objects[partnerId]];
  const def = meldResultDef(s, result);
  // Two cards of the same pair, one of each (CR 701.42b), both still in exile.
  if (!a || !b || a.zone !== "exile" || b.zone !== "exile" || !pairCard(s, a, result) || !pairCard(s, b, result) || realDefOf(s, a).name === realDefOf(s, b).name || !def) {
    log(s, `They can't be melded, so they stay in exile.`);
    return undefined;
  }
  s.cards[def.oracleId] ??= def;
  moveObject(s, a.id, "battlefield", { controller: pid, meld: { with: b.id, key: def.oracleId }, ...(attack ? { tapped: true } : {}) });
  if (s.objects[a.id]?.zone !== "battlefield") return undefined; // a replacement effect may have sent it elsewhere
  if (attack && characteristics(s, a).types.includes("Creature")) {
    a.attacking = attack.player;
    if (attack.planeswalker) a.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
  }
  log(s, `${realDefOf(s, a).name} and ${realDefOf(s, b).name} meld into ${def.name}${attack ? `, tapped and attacking ${player(s, attack.player).name}` : ""}.`);
  return a;
}

/**
 * As `o` enters the battlefield melded with `otherId` (moveObject): one object represented by both cards (CR 712.4a),
 * `o`'s own, with the combined back face's characteristics (712.8g). The other card is part of it (zone "merged"). If
 * either card is a commander, the melded permanent is that player's commander (CR 903.3b).
 */
export function joinMeld(s: GameState, o: GameObject, otherId: ObjectId, key: string): void {
  const other = obj(s, otherId);
  const exile = other.zone === "exile" ? player(s, other.owner).exile : undefined;
  if (exile?.includes(otherId)) exile.splice(exile.indexOf(otherId), 1);
  o.melded = key;
  o.merged = { parts: [o.id, otherId], ownToken: o.isToken, ownCommander: o.isCommander };
  if (other.isCommander) o.isCommander = true;
  other.zone = "merged";
  other.mergedInto = o.id;
  other.zoneChanges = (other.zoneChanges ?? 0) + 1;
  invalidateCharacteristics(s);
}
