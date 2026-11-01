// Card names (CR 201): choosing one (201.4), and what a chosen name does on a permanent: "Spells with the chosen name
// can't be cast" (Meddling Mage), "Activated abilities of sources with the chosen name can't be activated" (Pithing
// Needle), wherever those cards are.

import type { CardDef, GameObject, GameState, PlayerId } from "./types";
import type { TargetSpec } from "./abilities";
import { abilitiesOf, defOf } from "./cards";
import { characteristics, controllerOf } from "./layers";
import { printedMatches } from "./effects/targeting";
import { faceDef, hasName } from "./faces";

/**
 * An object's name now: a permanent's from its characteristics (a copy has the name it copies, CR 707.2), a card
 * elsewhere its own. Face down, it has none (CR 708.2a).
 */
export function currentName(s: GameState, o: GameObject): string | undefined {
  if (o.faceDown) return undefined;
  return o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name;
}

/**
 * The card names a player can choose (CR 201.4): those of the cards in this game, the ones matching `filter` by their
 * Oracle characteristics (201.4a), not a token's unless it's also a card's. Names of cards that aren't in the game are
 * left out: naming one would do nothing here.
 */
export function cardNameOptions(s: GameState, filter?: TargetSpec): string[] {
  const names = new Set<string>();
  for (const o of Object.values(s.objects)) {
    if (o.isToken) continue;
    const d: CardDef | undefined = s.cards[o.cardId];
    if (!d) continue;
    // A split card's halves, a double-faced card's back face, a flip or adventurer card's other name: each a name to
    // choose, matching `filter` by that face's characteristics (CR 201.4b-f).
    for (const f of d.faces?.length ? d.faces.map((_, i) => faceDef(d, i)) : [d]) if (!filter || printedMatches(filter, f)) names.add(f.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** The permanents whose chosen name is `name`, with what that name does to it (see CompiledCard.nameBans). */
function bansOn(s: GameState, name: string | undefined) {
  if (name === undefined) return [];
  const out: { o: GameObject; ban: NonNullable<ReturnType<typeof abilitiesOf>["nameBans"]>[number] }[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.chosen?.name === undefined || !hasName(name, o.chosen.name)) continue;
    for (const ban of abilitiesOf(s, o).nameBans ?? []) out.push({ o, ban });
  }
  return out;
}

/**
 * "Spells with the chosen name can't be cast" (Meddling Mage), "Your opponents can't cast spells with the chosen name"
 * (Gideon's Intervention): why `pid` can't cast this card, or null. A spell has its card's name (CR 201.2).
 */
export function nameCastBan(s: GameState, pid: PlayerId, d: CardDef): string | null {
  for (const b of s.namedBansUntil ?? []) if (hasName(d.name, b.name) && (!b.players || b.players.includes(pid))) return `${b.source}: spells named ${d.name} can't be cast${b.players ? " by you" : ""} until ${s.players[b.controller]!.name}'s next turn`;
  // Circu, Dimir Lobotomist: the names of the cards exiled with it, still exiled and face up (a face-down card has none,
  // CR 708.2a); a name in common is the same name (CR 201.2a).
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (!abilitiesOf(s, o).linkedNameCastBan || controllerOf(s, o) === pid) continue;
    const named = (s.linkedExile?.[`${o.id}@${o.zoneChanges ?? 0}`] ?? []).map((l) => s.objects[l.id]).find((c) => c?.zone === "exile" && !c.faceDown && !c.hiddenExile && (c.zoneChanges ?? 0) === (s.linkedExile![`${o.id}@${o.zoneChanges ?? 0}`]!.find((l) => l.id === c.id)!.zc) && defOf(s, c).name.split(" // ").some((n) => hasName(d.name, n)));
    if (named) return `${characteristics(s, o).name}: its controller's opponents can't cast spells named ${defOf(s, named).name}`;
  }
  for (const { o, ban } of bansOn(s, d.name)) {
    if (ban.kind !== "cast") continue;
    if (ban.who === "opponents" && controllerOf(s, o) === pid) continue;
    return `${characteristics(s, o).name}: spells named ${d.name} can't be cast${ban.who === "opponents" ? " by its controller's opponents" : ""}`;
  }
  return null;
}

/**
 * "Activated abilities of sources with the chosen name can't be activated [unless they're mana abilities]" (Phyrexian
 * Revoker, Pithing Needle): in every zone (rulings), so cycling from a hand too. Why it can't be activated, or null.
 */
export function nameActivationBan(s: GameState, o: GameObject, mana: boolean): string | null {
  for (const { o: src, ban } of bansOn(s, currentName(s, o))) {
    if (ban.kind !== "activate" || (mana && ban.exceptMana)) continue;
    return `${characteristics(s, src).name}: activated abilities of sources named ${currentName(s, o)} can't be activated${ban.exceptMana ? " unless they're mana abilities" : ""}`;
  }
  return null;
}

/** "Lands with the chosen name can't be played" (Conjurer's Ban): why `pid` can't play this land card, or null. */
export function nameLandBan(s: GameState, pid: PlayerId, d: CardDef): string | null {
  const b = (s.namedBansUntil ?? []).find((x) => x.lands && hasName(d.name, x.name) && (!x.players || x.players.includes(pid)));
  return b ? `${b.source}: lands named ${d.name} can't be played until ${s.players[b.controller]!.name}'s next turn` : null;
}
