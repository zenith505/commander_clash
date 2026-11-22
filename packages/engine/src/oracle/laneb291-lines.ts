// Lane B round B291's lines, read by compileCard before the generic triggers and statics (after round B290's): God-Eternal
// Kefnet's reveal of the first card drawn each turn; and its whole spell (roundB291Spell, after round B265's): Glyph of
// Delusion's "target creature that target Wall blocked this turn".
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { roundB294Spell } from "./laneb294-lines";

const KEFNET =
  "You may reveal the first card you draw each turn as you draw it. Whenever you reveal an instant or sorcery card this way, copy that card and you may cast the copy. That copy costs {2} less to cast.";
const GLYPH_DELUSION =
  'Put X glyph counters on target creature that target Wall blocked this turn, where X is the power of that blocked creature. The creature gains "~ doesn\'t untap during your untap step if it has a glyph counter on it" and "At the beginning of your upkeep, remove a glyph counter from ~."';
const GLYPH_UNTAP = "~ doesn't untap during your untap step if it has a glyph counter on it.";
const GLYPH_UPKEEP = "At the beginning of your upkeep, remove a glyph counter from ~.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB291Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // God-Eternal Kefnet: a static ability that lets its controller reveal the first card they draw each turn as it's drawn,
  // before it joins the other cards in hand (rulings), and a triggered ability of the same permanent for an instant or
  // sorcery card revealed this way (CR 603.2): the card is copied in that hand and the copy may be cast from there as the
  // trigger resolves, for {2} less (generic mana, CR 601.2f), or never (rulings). game.ts kefnetAsk asks; Effect kefnetCopy.
  if (line === KEFNET) {
    if (isSpell || out.kefnetReveal) return fail();
    out.kefnetReveal = { less: 2, text: "copy that card and you may cast the copy. That copy costs {2} less to cast." };
    return true;
  }
  return false;
}

/** Round B291's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB291Spell(text: string): AbilityBody | null | undefined {
  // Glyph of Delusion: two targets, the Wall (any Wall, as for Glyph of Reincarnation) and a creature it blocked this turn
  // as the objects they are now (CR 400.7), whether it was assigned to block that creature, blocked it as part of a band,
  // or was moved into or out of that block (rulings; TurnLog.blocks, TargetSpec.blockedByTarget), checked as the targets
  // are chosen and again as it resolves (CR 601.2c, 608.2b). The Wall is chosen first since the creature depends on it.
  // X is that creature's power as it resolves (CR 608.2h). The two abilities it gains have no duration (CR 611.2a): the
  // untap restriction is a static ability (CR 502.3), the upkeep trigger its controller's.
  if (text === GLYPH_DELUSION) {
    const wall = parseBody("Destroy target Wall.", { spell: true });
    const counters = parseBody("Put X glyph counters on target creature, where X is that creature's power.", { spell: true });
    const untap = parseBody(`Tap target creature. It gains "${GLYPH_UNTAP}"`, { spell: true });
    const upkeep = parseBody(`Tap target creature. It gains "${GLYPH_UPKEEP}"`, { spell: true });
    const w = wall?.targets[0];
    const c = counters?.targets[0];
    const put = counters?.effects[0];
    const gainA = untap?.effects[1];
    const gainB = upkeep?.effects[1];
    if (!wall || wall.targets.length !== 1 || w?.kind !== "object" || !w.subtypes?.includes("Wall") || !counters || counters.targets.length !== 1 || c?.kind !== "object" || counters.effects.length !== 1 || put?.type !== "counters" || put.counter !== "glyph") return null;
    if (gainA?.type !== "continuous" || gainB?.type !== "continuous" || gainA.duration !== "game" || gainB.duration !== "game" || gainA.mods.length !== 1 || gainB.mods.length !== 1 || gainA.mods[0]!.kind !== "addAbility" || gainB.mods[0]!.kind !== "addAbility") return null;
    const it = { ref: "target" as const, index: 1 };
    return {
      targets: [w, { ...c, blockedByTarget: 0, text: "target creature that target Wall blocked this turn" }],
      effects: [
        { ...put, what: it, n: { count: { kind: "power", of: it } } },
        { ...gainA, what: it },
        { ...gainB, what: it },
      ],
      text,
    };
  }
  // Round B294 (Channel, False Dawn): the same.
  return roundB294Spell(text);
}
