// Text-changing effects (CR 612): "Change the text of target spell or permanent by replacing all instances of one color
// word with another" (Sleight of Mind, Mind Bend, Magical Hack, Artificial Evolution, New Blood).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import { CREATURE_TYPES } from "../keywords";
import { BASIC_LAND_TYPES, COLOR_WORDS, withTextChanges } from "../text-changes";
import type { CardDef, GameObject, GameState, TextChange } from "../types";
import { compileCard, isFullySupported } from "../oracle";
import { gateBody, withModes, type CastHow } from "../modes";
import { settleDivided } from "./targeting";
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
  const now = defOf(s, o);
  // "It can't change a word to the same word" (rulings); Artificial Evolution's new type can't be Wall.
  const tos = (from: string, kind: Kind) => (e.newWord !== undefined ? [e.newWord] : textWordOptions([kind]).filter((w) => w !== from && !e.notTo?.includes(w)));
  if (st.from === undefined) {
    // Only words with a new word to go with that leaves text the engine reads (readableSwap).
    const options = textWordOptions(e.kinds).filter((w) => {
      const kind = textWordKind(w, e.kinds)!;
      return tos(w, kind).some((to) => to === w || readableSwap(now, { kind, from: w, to }));
    });
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "textFrom", options, labels: labelsOf(options), about: o.id, prompt: `replace all instances of which ${describeKinds(e.kinds)} in ${name}'s text?` };
    return "paused";
  }
  const kind = textWordKind(st.from, e.kinds)!;
  if (st.to === undefined && e.newWord === undefined) {
    const options = tos(st.from, kind).filter((to) => readableSwap(now, { kind, from: st.from!, to }));
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "textTo", options, labels: labelsOf(options), about: o.id, prompt: `replace ${st.from} in ${name}'s text with which ${describeKinds([kind])}?` };
    return "paused";
  }
  const to = e.newWord ?? st.to!;
  // New Blood: "one creature type with Vampire": choosing Vampire itself changes nothing.
  if (to !== st.from) {
    const before = defOf(s, o);
    (o.textChanges ??= []).push({ kind, from: st.from, to, ...(e.endOfTurn ? { endOfTurn: true as const } : {}) });
    invalidateCharacteristics(s);
    const after = defOf(s, o); // registers its definition with the new text (cards.ts)
    if (o.zone === "stack") respell(s, o, before, after);
    // A few changed texts are ones the engine can't read (a "Plains" it takes as singular, Defiler of Faith's cost line):
    // said in the log, as those abilities are lost.
    if (!isFullySupported(after) && isFullySupported(before)) log(s, `(The engine can't read all of ${name}'s new text: ${compileCard(after).unsupported.join(" ")})`);
  }
  log(s, `${player(s, ctx.controller).name} changes the text of ${name}: ${st.from} becomes ${to}${e.endOfTurn ? " until end of turn" : ""} (${src}).`);
}

/**
 * Whether the text `d` has after this change is text the engine reads, when it reads `d`'s now. A few changed texts it
 * can't ("both red and red", Defiler of Faith's cost line, Hazezon Tamar's token colors with one repeated; review
 * follow-up 12): those swaps aren't offered, to bots or in the UI, so a supported card never loses an ability to one. A
 * word the text doesn't have changes nothing (rulings: it may still be chosen).
 */
function readableSwap(d: CardDef, c: TextChange): boolean {
  const after = withTextChanges(d, [c], `${d.oracleId}|probe:${c.kind}:${c.from}>${c.to}`);
  if (after.oracleText === d.oracleText && after.typeLine === d.typeLine && after.keywords.join() === d.keywords.join()) return true;
  return isFullySupported(after) || !isFullySupported(d);
}

const describeKinds = (kinds: Kind[]) => kinds.map((k) => (k === "color" ? "color word" : k === "basicLandType" ? "basic land type" : "creature type")).join(" or ");

/** "White", "Island", "Goblin": each word as a button shows it. */
const labelsOf = (words: string[]) => words.map((w) => w.charAt(0).toUpperCase() + w.slice(1));

/**
 * A spell's text changed (Glamerdye on Doom Blade): what it does as it resolves is its new text (CR 608.2b checks its
 * targets against it then; rulings: "the text change will probably cause it to be countered since the targets will be
 * illegal"). Its targets stay (rulings). The stack item keeps what was worked out as it was cast (castSpell), so that's
 * worked out again from the new text, the same way, when the old text gives what it has now.
 */
function respell(s: GameState, o: GameObject, before: CardDef, after: CardDef) {
  const item = s.stack.find((x) => x.kind === "spell" && x.objectId === o.id);
  if (!item?.body) return;
  const how: CastHow = {
    ...(o.kicked?.length ? { kicks: o.kicked } : {}),
    ...(o.bargained ? { bargained: true } : {}),
    ...(o.evidence ? { evidence: true } : {}),
    ...(o.teamwork ? { teamwork: true } : {}),
    ...(o.gift !== undefined ? { gift: true } : {}),
    ...(o.castAlt ? { alt: o.castAlt } : {}),
    ...(o.face !== undefined ? { face: o.face } : {}),
  };
  const body = (d: CardDef) => {
    const spell = compileCard(d).spell;
    return spell && settleDivided(s, gateBody(withModes(spell, item.modes), how), { controller: item.controller, sourceId: o.id, x: item.x ?? 0 });
  };
  const old = body(before);
  const now = body(after);
  if (old && now && JSON.stringify(old) === JSON.stringify(item.body) && now.targets.length === old.targets.length) item.body = now;
}
