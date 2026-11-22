// Round 449's whole lines (compile.ts, before round 448's): Saruman of Many Colors, "Ward—Discard an enchantment,
// instant, or sorcery card." and its second-spell trigger, whose reflexive trigger exiles and copies a card no greater in
// mana value than that spell.
import type { CompiledCard, Effect } from "../abilities";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const SARUMAN =
  "Whenever you cast your second spell each turn, each opponent mills two cards. When one or more cards are milled this way, exile target enchantment, instant, or sorcery card with equal or lesser mana value than that spell from an opponent's graveyard. Copy the exiled card. You may cast the copy without paying its mana cost.";

/** One whole line of round 449's (compile.ts); false when it isn't one of these. */
export function round449Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // "Ward—Discard an enchantment, instant, or sorcery card." (Saruman of Many Colors): "Whenever this permanent becomes the
  // target of a spell or ability an opponent controls, counter that spell or ability unless that player pays [cost]" (CR
  // 702.21a), the cost a discard of one card of those types (CR 701.9a); with none in hand it can't be paid (CR 118.3,
  // rulings). A whole line here, as the keyword list splits its commas (keyword-abilities.ts).
  const ward = /^Ward—Discard (an? ([a-z, ]+? card))\.$/.exec(line);
  if (ward && ward[2] !== "card") {
    const filter = parseSearchFilter(ward[2]!);
    if (!filter || filter.kind !== "card") return fail(out, raw);
    out.triggers.push({
      event: "becomesTargetOfOpponent",
      body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", discard: 1, discardFilter: filter }, ward: true }], text: `Ward—Discard ${ward[1]}: counter that spell or ability unless its controller discards ${ward[1]}.` },
    });
    return true;
  }
  // Saruman of Many Colors: "Whenever you cast your second spell each turn, each opponent mills two cards. When one or more
  // cards are milled this way, exile target ... card with equal or lesser mana value than that spell from an opponent's
  // graveyard. Copy the exiled card. You may cast the copy without paying its mana cost." The target is chosen only as the
  // reflexive ability triggers, once if any card at all was milled (CR 603.12, rulings), from any opponent's graveyard; "that
  // spell" is the second spell, its mana value as it was cast (CR 202.3, X included, 608.2h), as Hammerhead Tyrant's
  // (TargetSpec.bound castSpell). The copy is cast as the reflexive ability resolves or not at all, X as 0, alternative
  // costs not allowed, and one not cast ceases to exist (CR 608.2g, 707.12, rulings).
  if (line === SARUMAN) {
    const mill = parseTrigger("Whenever you cast your second spell each turn, each opponent mills two cards.");
    const copy = parseTrigger("Whenever you cast a spell, exile target enchantment, instant, or sorcery card with mana value less than or equal to that spell's mana value from an opponent's graveyard and copy it. You may cast the copy without paying its mana cost.");
    if (!mill || mill === "fail" || !copy || copy === "fail" || mill.event !== "castSpell" || mill.cast?.nth !== 2 || mill.body.effects.length !== 1 || mill.body.effects[0]!.type !== "mill") return fail(out, raw);
    const t = copy.body.targets[0];
    if (copy.body.targets.length !== 1 || t?.kind !== "card" || t.bound?.amount.count.kind !== "manaValue" || copy.body.effects.length !== 1 || copy.body.effects[0]!.type !== "castFromAmong") return fail(out, raw);
    const text = line.slice(line.indexOf(", ") + 2);
    const reflexiveText = "Exile target enchantment, instant, or sorcery card with equal or lesser mana value than that spell from an opponent's graveyard. Copy the exiled card. You may cast the copy without paying its mana cost.";
    const reflexive: Effect = { type: "reflexive", body: { ...copy.body, targets: [{ ...t, text: "target enchantment, instant, or sorcery card with equal or lesser mana value than that spell from an opponent's graveyard" }], text: reflexiveText } };
    out.triggers.push({ ...mill, body: { targets: [], effects: [mill.body.effects[0]!, { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "milledThisWay" } }, min: 1 }, effects: [reflexive] }], text } });
    return true;
  }
  return false;
}
