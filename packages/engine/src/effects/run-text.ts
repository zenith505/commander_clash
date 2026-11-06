// Text-changing effects (CR 612): "Change the text of target spell or permanent by replacing all instances of one color
// word with another" (Sleight of Mind, Mind Bend, Magical Hack, Artificial Evolution, New Blood).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import { CREATURE_TYPES } from "../keywords";
import { BASIC_LAND_TYPES, COLOR_WORDS } from "../text-changes";
import type { GameObject, GameState, TextChange } from "../types";
import { objects, type ResolveCtx } from "./resolve";

type Kind = TextChange["kind"];

/** The words a text change of these kinds can replace (rulings: any of them, even one the text doesn't have). */
export function textWordOptions(kinds: Kind[]): string[] {
  return kinds.flatMap((k) => (k === "color" ? [...COLOR_WORDS] : k === "basicLandType" ? [...BASIC_LAND_TYPES] : [...CREATURE_TYPES].sort()));
}

/** Which kind a chosen word is (a color word, a basic land type, a creature type). */
export function textWordKind(word: string, kinds: Kind[]): Kind | undefined {
  return kinds.find((k) => (k === "color" ? (COLOR_WORDS as readonly string[]).includes(word) : k === "basicLandType" ? (BASIC_LAND_TYPES as readonly string[]).includes(word) : CREATURE_TYPES.has(word)));
}

/** The spell or permanent the text change is about: a target spell (by its stack item) or a permanent. */
function subjectOf(s: GameState, e: Extract<Effect, { type: "changeText" }>, ctx: ResolveCtx): GameObject | undefined {
  if (e.what.ref === "target") {
    if (!ctx.legal[e.what.index]) return undefined;
    const t = ctx.targets[e.what.index];
    if (t?.kind === "stack") {
      const item = s.stack.find((x) => x.id === t.id);
      const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      return o?.zone === "stack" ? o : undefined;
    }
  }
  return objects(s, e.what, ctx).find((o) => o.zone === "battlefield");
}

export function runTextEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  if (e.type !== "changeText") return;
  const o = subjectOf(s, e, ctx);
  if (!o) return;
  const r = s.resolving!;
  const st = ((r.scratch ??= {}).textWord ??= {});
  const name = defOf(s, o).name;
  // The words are chosen as it resolves (rulings), by its controller: the old one first.
  if (st.from === undefined) {
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "textFrom", options: textWordOptions(e.kinds), labels: labelsOf(textWordOptions(e.kinds)), about: o.id, prompt: `replace all instances of which ${describeKinds(e.kinds)} in ${name}'s text?` };
    return "paused";
  }
  const kind = textWordKind(st.from, e.kinds)!;
  // "It can't change a word to the same word" (rulings); Artificial Evolution's new type can't be Wall.
  if (st.to === undefined && e.newWord === undefined) {
    const options = textWordOptions([kind]).filter((w) => w !== st.from && !e.notTo?.includes(w));
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "textTo", options, labels: labelsOf(options), about: o.id, prompt: `replace ${st.from} in ${name}'s text with which ${describeKinds([kind])}?` };
    return "paused";
  }
  const to = e.newWord ?? st.to!;
  // New Blood: "one creature type with Vampire": choosing Vampire itself changes nothing.
  if (to !== st.from) {
    (o.textChanges ??= []).push({ kind, from: st.from, to, ...(e.endOfTurn ? { endOfTurn: true as const } : {}) });
    invalidateCharacteristics(s);
    defOf(s, o); // registers its definition with the new text (cards.ts)
  }
  log(s, `${player(s, ctx.controller).name} changes the text of ${name}: ${st.from} becomes ${to}${e.endOfTurn ? " until end of turn" : ""} (${src}).`);
}

const describeKinds = (kinds: Kind[]) => kinds.map((k) => (k === "color" ? "color word" : k === "basicLandType" ? "basic land type" : "creature type")).join(" or ");

/** "White", "Island", "Goblin": each word as a button shows it. */
const labelsOf = (words: string[]) => words.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
