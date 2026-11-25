// Swirl the Mists (round 462): "As this enchantment enters, choose a color word. All instances of color words in the text
// of spells and permanents are changed to the chosen color word."
//
// Its second ability is a static ability whose effect is a text-changing effect (CR 612.1): every color word used as one
// (612.2), "nonblack" too, never a card name or a mana symbol, in the rules text and type line of each spell and permanent
// becomes the chosen word. It applies in layer 3 (CR 613.1c) with its timestamp, the permanent's (613.7a), among the other
// text changes on that object (613.7): a Sleight of Mind that resolved earlier applies first, one that resolves later applies
// to the text Swirl left. It applies to spells cast and permanents that enter later too, and ends as soon as Swirl the Mists
// leaves the battlefield (rulings). Reminder text isn't rules text (CR 207.2), so it isn't changed (text-changes.ts).
//
// The engine reads a definition by a key without the game state (cards.ts cardIdOf), so the change is kept on each object
// it applies to, as the object's own text changes are (GameObject.textChanges, with `by` naming the Swirl): as an object
// becomes a spell or permanent (moveObject, enterSwirl), and as each event ends (syncSwirls: between the instructions of a
// resolution and with each pass of state-based actions), when a Swirl enters or leaves or its word is chosen.

import { defOf } from "./cards";
import { invalidateCharacteristics } from "./layers";
import { compileCard } from "./oracle";
import { COLOR_WORDS } from "./text-changes";
import { respell } from "./effects/run-text";
import type { Color, GameObject, GameState, ObjectId, TextChange } from "./types";

const WORD: Record<Color, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };

interface Source {
  id: ObjectId;
  word: string;
  at: number;
}

/** The Swirls applying now: on the battlefield (not phased out, CR 702.26b; not face down, 708.2), a word chosen; oldest first. */
function sources(s: GameState): Source[] {
  const out: Source[] = [];
  for (const id of s.battlefield) {
    const o = s.objects[id];
    const color = o?.chosen?.color;
    if (!o || !color || o.faceDown || !compileCard(defOf(s, o)).swirlMists) continue;
    out.push({ id, word: WORD[color], at: o.timestamp ?? 0 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Whether `o` is a spell or permanent (or one phased out or merged, whose text matters again once it's back). */
const affected = (o: GameObject) => (o.zone === "battlefield" || o.zone === "stack" || o.zone === "phasedOut" || o.zone === "merged") && !o.faceDown;

/** `o`'s text changes with the Swirls' among its own, in timestamp order (CR 613.7). */
function wanted(o: GameObject, srcs: Source[], spell = false): TextChange[] | undefined {
  const own = (o.textChanges ?? []).filter((c) => c.by === undefined);
  if (!spell && !affected(o)) return own.length ? own : undefined;
  const out: TextChange[] = [];
  let i = 0;
  for (const src of srcs) {
    while (i < own.length && (own[i]!.at ?? -Infinity) < src.at) out.push(own[i++]!);
    for (const from of COLOR_WORDS) if (from !== src.word) out.push({ kind: "color", from, to: src.word, by: src.id, at: src.at });
  }
  while (i < own.length) out.push(own[i++]!);
  return out.length ? out : undefined;
}

/** Give `o` the text changes it should have; true if they changed. A spell's stack item is worked out again (run-text.ts respell). */
function apply(s: GameState, o: GameObject, srcs: Source[]): boolean {
  const want = wanted(o, srcs);
  if (JSON.stringify(want ?? []) === JSON.stringify(o.textChanges ?? [])) return false;
  const before = o.zone === "stack" ? defOf(s, o) : undefined;
  o.textChanges = want;
  invalidateCharacteristics(s);
  if (before) respell(s, o, before, defOf(s, o));
  return true;
}

/** As an event ends: every spell and permanent gets the text changes the Swirls on the battlefield make now. */
export function syncSwirls(s: GameState): void {
  if (!s.swirlOn && !s.battlefield.some((id) => s.objects[id]?.chosen?.color)) return;
  const srcs = sources(s);
  if (!srcs.length && !s.swirlOn) return;
  for (const o of Object.values(s.objects)) if (o.textChanges?.some((c) => c.by !== undefined) || (srcs.length && affected(o))) apply(s, o, srcs);
  if (srcs.length) s.swirlOn = true;
  else delete s.swirlOn;
}

/** As `o` becomes a spell or a permanent (moveObject): the Swirls' text changes apply to it at once (rulings). */
export function enterSwirl(s: GameState, o: GameObject): void {
  if (!s.swirlOn) return;
  apply(s, o, sources(s));
}

/**
 * `fn` with `o` read as the spell it becomes as it's cast: it's put on the stack first, and its targets, modes and costs
 * are chosen there (CR 601.2a-c), so a Swirl's change applies to them (the Doom Blade a Swirl made "nongreen" can't
 * target a green creature). For casting it (castSpell, which keeps the change) and for asking whether it can be cast
 * that way (castProblem, spellTargets), which put the card back as it was.
 */
export function asSpell<T>(s: GameState, o: GameObject, fn: () => T, keep = false): T {
  if (!s.swirlOn || o.zone === "stack" || o.zone === "battlefield" || o.faceDown) return fn();
  const want = wanted(o, sources(s), true);
  if (JSON.stringify(want ?? []) === JSON.stringify(o.textChanges ?? [])) return fn();
  const was = { changes: o.textChanges, zc: o.zoneChanges ?? 0 };
  o.textChanges = want;
  invalidateCharacteristics(s);
  if (keep) return fn();
  try {
    return fn();
  } finally {
    if ((o.zoneChanges ?? 0) === was.zc && (o.zone as string) !== "stack") {
      o.textChanges = was.changes;
      invalidateCharacteristics(s);
    }
  }
}
