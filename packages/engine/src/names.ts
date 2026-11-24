// Card names (CR 201): choosing one (201.4), and what a chosen name does on a permanent: "Spells with the chosen name
// can't be cast" (Meddling Mage), "Activated abilities of sources with the chosen name can't be activated" (Pithing
// Needle), wherever those cards are.

import type { CardDef, GameObject, GameState, PlayerId } from "./types";
import type { TargetSpec } from "./abilities";
import { abilitiesOf, defOf } from "./cards";
import { characteristics, controllerOf } from "./layers";
import { printedMatches } from "./effects/targeting";
import { faceDef, hasName } from "./faces";
import { nameFirstPrintedIn, OLD_SET_NAME } from "./first-printings";
import { defNamedAny, viewHasName, viewsShareName, type NameView } from "./all-names";

/**
 * An object's name now: a permanent's from its characteristics (a copy has the name it copies, CR 707.2), a card
 * elsewhere its own. Face down, it has none (CR 708.2a).
 */
export function currentName(s: GameState, o: GameObject): string | undefined {
  if (o.faceDown) return undefined;
  return o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name;
}

/**
 * An object's names now, as rules compare them (all-names.ts): a permanent's from its characteristics, Spy Kit's "all
 * names of nonlegendary creature cards" too (CR 612.7); a card elsewhere its own; face down, none (CR 708.2a).
 */
export function nameView(s: GameState, o: GameObject): NameView {
  if (o.faceDown) return { name: undefined };
  if (o.zone !== "battlefield") return { name: defOf(s, o).name };
  const c = characteristics(s, o);
  return c.allNames ? { name: c.name, all: true } : { name: c.name };
}

/** Does it have this name now (CR 201.2a)? See nameView. */
export const objHasName = (s: GameState, o: GameObject, name: string): boolean => viewHasName(s, nameView(s, o), name);

/** Do they have the same name now: a name in common (CR 201.2a)? See nameView. */
export const objsShareName = (s: GameState, a: GameObject, b: GameObject): boolean => viewsShareName(s, nameView(s, a), nameView(s, b));

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
function bansOn(s: GameState, name: string | undefined, view?: NameView) {
  if (name === undefined) return [];
  // A permanent with Spy Kit's names (view) has each nonlegendary creature card's name too (CR 612.7).
  const has = (n: string) => (view ? viewHasName(s, view, n) : hasName(name, n));
  const out: { o: GameObject; ban: NonNullable<ReturnType<typeof abilitiesOf>["nameBans"]>[number] }[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    // Null Chamber: either of its two names (Chosen.opponentName, the opponent's).
    if (![o.chosen?.name, o.chosen?.opponentName].some((n) => n !== undefined && has(n))) continue;
    for (const ban of abilitiesOf(s, o).nameBans ?? []) out.push({ o, ban });
  }
  return out;
}

/**
 * A card exiled with `o` (its linked exile abilities, CR 607.2a, and its "until ~ leaves" ones), still exiled and face up (a face-down card has no name,
 * CR 708.2a), with `name` (a name in common is the same name, CR 201.2a): Circle of Confinement.
 */
export function exiledWithNamed(s: GameState, o: GameObject, name: string | NameView): boolean {
  const view = typeof name === "string" ? { name } : name;
  const key = `${o.id}@${o.zoneChanges ?? 0}`;
  // "Until ~ leaves the battlefield" exiles are kept on the permanent (GameObject.exiledUntilLeaves).
  return [...(s.linkedExile?.[key] ?? []), ...(o.exiledUntilLeaves ?? [])].some((l) => {
    const c = s.objects[l.id];
    return !!c && c.zone === "exile" && !c.faceDown && !c.hiddenExile && (c.zoneChanges ?? 0) === l.zc && defOf(s, c).name.split(" // ").some((n) => viewHasName(s, view, n));
  });
}

/**
 * "Spells with the chosen name can't be cast" (Meddling Mage), "Your opponents can't cast spells with the chosen name"
 * (Gideon's Intervention): why `pid` can't cast this card, or null. A spell has its card's name (CR 201.2).
 */
export function nameCastBan(s: GameState, pid: PlayerId, d: CardDef, faceDown?: boolean): string | null {
  const market = faceDown ? null : permanentNameBan(s, d, "cast");
  if (market) return market;
  const city = faceDown ? null : firstPrintedBan(s, d, "spells");
  if (city) return city;
  for (const b of s.namedBansUntil ?? []) if (defNamedAny(d, [b.name]) && (!b.players || b.players.includes(pid))) return `${b.source}: spells named ${d.name} can't be cast${b.players ? " by you" : ""} until ${s.players[b.controller]!.name}'s next turn`;
  // Circu, Dimir Lobotomist: the names of the cards exiled with it, still exiled and face up (a face-down card has none,
  // CR 708.2a); a name in common is the same name (CR 201.2a).
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    // Exclusion Ritual: every player, its controller too.
    const ban = abilitiesOf(s, o).linkedNameCastBan;
    if (!ban || (ban !== "players" && controllerOf(s, o) === pid)) continue;
    const named = (s.linkedExile?.[`${o.id}@${o.zoneChanges ?? 0}`] ?? []).map((l) => s.objects[l.id]).find((c) => c?.zone === "exile" && !c.faceDown && !c.hiddenExile && (c.zoneChanges ?? 0) === (s.linkedExile![`${o.id}@${o.zoneChanges ?? 0}`]!.find((l) => l.id === c.id)!.zc) && defOf(s, c).name.split(" // ").some((n) => hasName(d.name, n)));
    if (named) return `${characteristics(s, o).name}: ${ban === "players" ? "players" : "its controller's opponents"} can't cast spells named ${defOf(s, named).name}`;
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
  for (const { o: src, ban } of bansOn(s, currentName(s, o), nameView(s, o))) {
    if (ban.kind !== "activate" || (mana && ban.exceptMana)) continue;
    return `${characteristics(s, src).name}: activated abilities of sources named ${currentName(s, o)} can't be activated${ban.exceptMana ? " unless they're mana abilities" : ""}`;
  }
  return null;
}

/**
 * Cornered Market (CompiledCard.permanentNameBan): why a spell (`cast`) or a nonbasic land (`lands`) with `d`'s name can't
 * be cast or played while a nontoken permanent has that name, or null.
 */
function permanentNameBan(s: GameState, d: CardDef, what: "cast" | "lands"): string | null {
  if (what === "lands" && d.supertypes.includes("Basic")) return null;
  const market = s.battlefield.map((id) => s.objects[id]!).find((o) => !!abilitiesOf(s, o).permanentNameBan?.[what]);
  if (!market) return null;
  const twin = s.battlefield.map((id) => s.objects[id]!).find((o) => !o.isToken && !o.faceDown && viewsShareName(s, nameView(s, o), { name: d.name }));
  return twin ? `${characteristics(s, market).name}: ${what === "cast" ? "spells" : "nonbasic lands"} with the same name as a nontoken permanent (${characteristics(s, twin).name}) can't be ${what === "cast" ? "cast" : "played"}` : null;
}

/**
 * City in a Bottle (CompiledCard.firstPrintedBan): "Players can't cast spells or play lands with a name originally printed
 * in the Arabian Nights expansion": every player, its controller too. Why this card can't be cast or played, or null.
 */
function firstPrintedBan(s: GameState, d: CardDef, what: "spells" | "lands"): string | null {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const set = abilitiesOf(s, o).firstPrintedBan;
    if (set && nameFirstPrintedIn(d.name, set)) return `${characteristics(s, o).name}: players can't ${what === "spells" ? "cast spells" : "play lands"} with a name originally printed in the ${OLD_SET_NAME[set]} expansion (${d.name})`;
  }
  return null;
}

/** "Lands with the chosen name can't be played" (Conjurer's Ban): why `pid` can't play this land card, or null. */
export function nameLandBan(s: GameState, pid: PlayerId, d: CardDef): string | null {
  const market = permanentNameBan(s, d, "lands");
  if (market) return market;
  const city = firstPrintedBan(s, d, "lands");
  if (city) return city;
  const b = (s.namedBansUntil ?? []).find((x) => x.lands && defNamedAny(d, [x.name]) && (!x.players || x.players.includes(pid)));
  if (b) return `${b.source}: lands named ${d.name} can't be played until ${s.players[b.controller]!.name}'s next turn`;
  // Null Chamber: "lands with the chosen names can't be played", anyone's (CR 305.1).
  const chamber = bansOn(s, d.name).find(({ ban }) => ban.kind === "play");
  return chamber ? `${characteristics(s, chamber.o).name}: lands named ${d.name} can't be played` : null;
}
