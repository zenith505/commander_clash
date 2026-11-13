// Round 353's sentences, read before round 351's (round351Sentence in oracle/round351.ts reads these first), and its whole
// lines (compile.ts, after round 352's): copies of a spell for other players (Hive Mind, Curse of Echoes, Tempt with
// Mayhem) and copies that gain wither (Spinerock Tyrant). Magus Lucea Kane's mana ability is in mana-abilities.ts.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { addTarget, type Ctx } from "./body";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const INSTANT_OR_SORCERY_SPELL: TargetSpec = { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "target instant or sorcery spell" };

export function round353Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  const line = plain(s);
  // Tempt with Mayhem: "Choose target instant or sorcery spell. Each opponent may copy that spell and may choose new
  // targets for the copy they control. You copy that spell once plus an additional time for each opponent who copied the
  // spell this way. You may choose new targets for the copies you control.": a tempting offer (CR 207.2c), each opponent
  // deciding in turn order from the active player (or the next opponent after you, if you're active) and copying before
  // the next decides; then your copies, which resolve first (rulings). It can't target itself (CR 115.5).
  if (ctx.spell && line === "Choose target instant or sorcery spell") {
    const rest = sentences.slice(si + 1, si + 4).map(plain);
    if (rest[0] !== "Each opponent may copy that spell and may choose new targets for the copy they control" || rest[1] !== "You copy that spell once plus an additional time for each opponent who copied the spell this way" || rest[2] !== "You may choose new targets for the copies you control") return null;
    const target = addTarget(ctx, INSTANT_OR_SORCERY_SPELL);
    return { effect: { type: "copyForPlayers", spell: { target }, copiers: "opponents", may: true, thenYou: true }, next: si + 4 };
  }
  return null;
}

export function round353Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Hive Mind: "Whenever a player casts an instant or sorcery spell, each other player copies that spell. Each of those
  // players may choose new targets for their copy.": not optional (rulings); each other player than its caster, in turn
  // order from the active player, copies it and chooses its copy's targets before the next does (rulings, CR 101.4).
  // Curse of Echoes: "Whenever enchanted player casts an instant or sorcery spell, each other player may copy that spell
  // and may choose new targets for the copy they control.": likewise, each deciding whether to (rulings).
  const echo = /^Whenever (a player|enchanted player) casts an instant or sorcery spell, each other player (copies that spell\. Each of those players may choose new targets for their copy|may copy that spell and may choose new targets for the copy they control)\.$/.exec(line);
  if (echo && (echo[1] === "a player") === echo[2]!.startsWith("copies")) {
    const t = parseTrigger(`Whenever ${echo[1]} casts an instant or sorcery spell, draw a card.`);
    if (isSpell || !t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== (echo[1] === "a player" ? "any" : "enchanted")) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "copyForPlayers", spell: "cause", copiers: "otherThanCaster", ...(echo[1] === "a player" ? {} : { may: true as const }) }], text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  // Spinerock Tyrant: "Whenever you cast an instant or sorcery spell with a single target, you may copy it. If you do,
  // those spells gain wither. You may choose new targets for the copy.": exactly one target as it was cast (CR 115.1);
  // once copied, the spell (if it's still on the stack) and its copy have wither (CR 702.80a: their damage to creatures
  // is dealt as -1/-1 counters, rulings), a new target for the copy only if it's legal (rulings, CR 707.10c).
  if (line === "Whenever you cast an instant or sorcery spell with a single target, you may copy it. If you do, those spells gain wither. You may choose new targets for the copy.") {
    const t = parseTrigger("Whenever you cast an instant or sorcery spell, draw a card.");
    if (isSpell || !t || t === "fail" || t.event !== "castSpell" || !t.cast) {
      out.unsupported.push(raw);
      return true;
    }
    const copy: Effect = { type: "copySpell", spell: "cause", n: 1, newTargets: true, thoseGain: [{ kind: "addKeywords", keywords: ["Wither"] }] };
    out.triggers.push({ ...t, cast: { ...t.cast, singleTarget: true }, body: { targets: [], effects: [{ type: "may", effects: [copy], text: "copy it (it and the copy gain wither)" }], text: "you may copy it. If you do, those spells gain wither. You may choose new targets for the copy." } });
    return true;
  }
  return false;
}
