// Round 439's whole lines (compile.ts, before round 438's): mana that copies the spell or ability it's spent on (Sunken
// Palace), and Arvinox, the Mind Flail's cards from the bottom of each opponent's library.
import type { CompiledCard, StaticCondition } from "../abilities";
import { parseActivated } from "./activated";
import { parseConditionalStatic } from "./statics";
import { parseTrigger } from "./triggers";

const ARVINOX_TYPE = /^~ isn't a creature unless (you control (?:one|two|three|four|five) or more permanents you don't own)\.$/;
const ARVINOX_EXILE = "At the beginning of your end step, exile the bottom card of each opponent's library face down. For as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells.";

const SPENT_COPY = " When you spend this mana to cast a spell or activate an ability, copy that spell or ability. You may choose new targets for the copy.";

/** One whole line of round 439's (compile.ts); false when it isn't one of these. */
export function round439Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Sunken Palace: "{1}{U}, {T}, Exile seven cards from your graveyard: Add {U}. When you spend this mana to cast a spell or
  // activate an ability, copy that spell or ability. You may choose new targets for the copy." A mana ability (CR 605.1a)
  // whose mana makes a delayed triggered ability (CR 106.6, 603.7a), its source the Palace's (CR 603.7d), that triggers
  // when that mana is spent on the total cost of a spell being cast or an ability being activated (CR 601.2h, 602.2b),
  // not on a special action (CR 116.2) or a cost paid as something resolves. It copies that spell or ability as it
  // resolves, even if the original has left the stack by then, and the copy resolves first (rulings; CR 707.10, 707.10c:
  // its targets may be changed, its modes, X and paid costs kept). A copy of a permanent spell becomes a token (rulings,
  // CR 608.3f). Mana abilities can't be copied (its reminder text): spent on one, it copies nothing.
  if (!isSpell && arvinox(line, raw, out)) return true;
  if (isSpell || !line.endsWith(SPENT_COPY)) return false;
  const ab = parseActivated(line.slice(0, -SPENT_COPY.length));
  const add = ab && ab !== "fail" && ab.body.effects.length === 1 && !ab.body.targets.length ? ab.body.effects[0] : undefined;
  if (!ab || ab === "fail" || !ab.mana || add?.type !== "addMana" || !add.mana || add.times !== undefined || add.who || add.only || add.keep || Object.keys(add).length !== 2) {
    out.unsupported.push(raw);
    return true;
  }
  const copy = { type: "copySpell" as const, spell: "cause" as const, n: 1, newTargets: true };
  out.activated.push({ ...ab, text: line, body: { ...ab.body, effects: [{ ...add, spentTrigger: { spellOrAbility: true, body: { targets: [], effects: [copy], text: "Copy that spell or ability. You may choose new targets for the copy." } } }] } });
  return true;
}

/** Arvinox, the Mind Flail's two lines; false when it isn't one of them. */
function arvinox(line: string, raw: string, out: CompiledCard): boolean {
  // "~ isn't a creature unless you control three or more permanents you don't own.": a type-changing effect of its own
  // static ability (layer 4, CR 613.1d), the same as "As long as you don't control three or more permanents you don't
  // own, ~ isn't a creature." (a God's devotion line read the other way): it loses the card type creature and with it its
  // creature types (CR 205.3d), and is still an enchantment. A permanent you control whose owner is another player (CR
  // 108.3), counted continuously (CR 611.3a).
  const type = ARVINOX_TYPE.exec(line);
  if (type) {
    const st = parseConditionalStatic(`As long as ${type[1]}, ~ isn't a creature.`);
    const cond = st?.condition;
    if (!st || cond?.kind !== "control" || cond.filter.owner !== "opponent" || !st.mods.every((m) => m.kind === "loseTypes")) out.unsupported.push(raw);
    else out.statics.push({ ...st, condition: { kind: "not", cond } as StaticCondition, text: line });
    return true;
  }
  // "At the beginning of your end step, exile the bottom card of each opponent's library face down. For as long as those
  // cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as
  // though it were mana of any color to cast those spells.": one card from the bottom of each opponent's library (none
  // from an empty one), face down, which only you may look at (CR 406.3); you may cast them as permanent spells (CR
  // 110.4b; a land can't be played this way), with their usual timing and costs, any mana paying their colored symbols
  // (CR 609.4b), for as long as each stays exiled as that object (CR 400.7), whether or not Arvinox is still there.
  if (line === ARVINOX_EXILE) {
    const t = parseTrigger("At the beginning of your end step, exile the top card of each opponent's library face down. You may look at and play those cards for as long as they remain exiled.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourEndStep" || e?.type !== "exileFaceDown" || e.from !== "top" || e.n !== undefined || e.who?.ref !== "eachOpponent" || !e.look || e.play?.until !== "exiled" || Object.keys(e.play).length !== 1) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e, from: "bottom", play: { until: "exiled", castOnly: true, permanentOnly: true, anyColor: true } }], text: line.replace(/^At the beginning of your end step, /, "") } });
    return true;
  }
  return false;
}
