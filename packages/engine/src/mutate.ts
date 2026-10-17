// Mutate (CR 702.140) and merged permanents (CR 730). A mutating creature spell whose target is still legal merges
// with it as it resolves: its controller puts it on top of the creature or underneath (702.140c). The merged permanent
// is the same object as before (730.2c): it has the characteristics of its topmost component (730.2a) and the abilities
// of every component (702.140e), a copy effect with the timestamp of the merge. The other components wait in the
// "merged" zone (GameObject.mergedInto) until the permanent leaves the battlefield, then all go to the same zone
// (730.3, see game.ts moveObject).

import { defOf, faceUpDefOf } from "./cards";
import { fireEvent } from "./effects";
import { invalidateCharacteristics } from "./layers";
import { normalizeSelf } from "./oracle";
import type { CardDef, GameObject, GameState, ObjectId } from "./types";

/**
 * The copiable values of a permanent `top` merged with `under` (CR 730.2a, 702.140e): `top`'s characteristics, and the
 * rules text of both, `under`'s calling itself by `top`'s name, since its abilities are the merged permanent's now.
 * Registered in `s.cards` under a key of its own.
 */
export function mergedDef(s: GameState, top: CardDef, under: CardDef): CardDef {
  const key = `${top.oracleId}|merged:${s.nextId++}`;
  const text = normalizeSelf(under).replace(/~/g, top.name);
  const keywords = [...top.keywords, ...under.keywords.filter((k) => !top.keywords.includes(k))];
  const d: CardDef = { ...top, oracleId: key, oracleText: [top.oracleText, text].filter(Boolean).join("\n"), keywords };
  s.cards[key] = d;
  return d;
}

/**
 * The mutating spell `spell` merges with `host` (CR 702.140c): on top of it or underneath. Neither enters the
 * battlefield (730.2b); the permanent keeps its counters, effects and attachments and hasn't come under anyone's control
 * (730.2c). Then it has mutated (702.140d).
 */
export function mergeSpell(s: GameState, spell: GameObject, host: GameObject, onTop: boolean) {
  spell.mutating = undefined;
  const spellDef = defOf(s, spell);
  // A face-down permanent with a face-up component on top is face up (CR 730.2e), without being turned face up.
  const hostDef = host.faceDown ? faceUpDefOf(s, host) : defOf(s, host);
  const merged = onTop ? mergedDef(s, spellDef, hostDef) : mergedDef(s, hostDef, spellDef);
  host.merged ??= { parts: [host.id], ownToken: host.isToken, ownCommander: host.isCommander };
  if (onTop) host.merged.parts.unshift(spell.id);
  else host.merged.parts.push(spell.id);
  (host.copyEffects ??= []).push({ key: merged.oracleId, timestamp: s.nextTimestamp++ });
  if (onTop) {
    host.faceDown = undefined;
    // A token only if its topmost component is (CR 730.2d): a copy of a spell is a token by now (608.3f).
    host.isToken = spell.isToken;
  }
  // A merged permanent with a commander among its components is that player's commander (CR 903.3c).
  if (spell.isCommander) host.isCommander = true;
  spell.zone = "merged";
  spell.mergedInto = host.id;
  spell.zoneChanges = (spell.zoneChanges ?? 0) + 1;
  spell.castFrom = undefined;
  spell.castVia = undefined;
  spell.castAlt = undefined;
  host.mutations = (host.mutations ?? 0) + 1;
  invalidateCharacteristics(s);
  fireEvent(s, { type: "mutates", id: host.id });
}

/** An object that has left the battlefield and the components of it that went along, if it was merged (CR 730.3c). */
export function newObjects(o: GameObject): { id: ObjectId; zc: number }[] {
  return [{ id: o.id, zc: o.zoneChanges ?? 0 }, ...(o.movedWith ?? [])];
}

/** The commander a merged permanent's damage counts for (CR 903.3c, 903.10a): its component that's a commander. */
export function commanderOf(s: GameState, o: GameObject): GameObject | undefined {
  if (!o.isCommander) return undefined;
  if (!o.merged) return o;
  for (const id of o.merged.parts) {
    const part = s.objects[id];
    if (part && (id === o.id ? o.merged.ownCommander : part.isCommander)) return part;
  }
  return o;
}
