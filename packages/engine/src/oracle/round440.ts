// Round 440's whole lines (compile.ts, before round 439's): Forger's Foundry's mana that exiles the spell it pays for as
// that spell resolves, and Calamity, Galloping Inferno's token copies of the creatures that saddled it.
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseManaAbility } from "./mana-abilities";
import { pickFilter } from "./targets";
import { parseTrigger } from "./triggers";

const FOUNDRY = /^(\{T\}: Add \{[WUBRGC]\}\.) When you spend this mana to cast (an instant or sorcery spell with mana value \d+ or less), you may exile that spell instead of putting it into its owner's graveyard as it resolves\.$/;
const FOUNDRY_CAST = /^(\{[^:]+: )You may cast any number of spells from among cards exiled with ~ without paying their mana costs\.( Activate only as a sorcery\.)$/;
const CALAMITY = "Whenever ~ attacks while saddled, choose a nonlegendary creature that saddled it this turn and create a tapped and attacking token that's a copy of it. Sacrifice that token at the beginning of the next end step. Repeat this process once.";

/** One whole line of round 440's (compile.ts); false when it isn't one of these. */
export function round440Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  if (line === CALAMITY) {
    calamity(raw, out);
    return true;
  }
  // Forger's Foundry: "{T}: Add {U}. When you spend this mana to cast an instant or sorcery spell with mana value 3 or
  // less, you may exile that spell instead of putting it into its owner's graveyard as it resolves." A mana ability (CR
  // 605.1a) whose {U} makes a delayed triggered ability (CR 106.6, 603.7a), its source the Foundry's (CR 603.7d), so it
  // triggers whether or not the Foundry is still there (rulings). It triggers when that mana is spent on an instant or
  // sorcery spell whose mana value is 3 or less as it's cast, X counted as chosen (rulings, CR 202.3e); the mana can pay
  // for anything else too (rulings). As the trigger resolves, its controller may make a replacement effect for that
  // spell's move to its owner's graveyard as it resolves (CR 608.2n, 614.1a): it goes to exile instead, while it's still
  // that spell (CR 400.7); a copy isn't a card (CR 707.10a). Countered, it goes to the graveyard as usual. The exiled
  // card is "exiled with" the Foundry (CR 607.2a), as the object it was when it made that mana (CR 400.7), for its "cast
  // any number of spells from among cards exiled with ~" (linked in compile.ts).
  // Its "{3}{U}{U}, {T}: You may cast any number of spells from among cards exiled with ~ without paying their mana costs.
  // Activate only as a sorcery.": Izzet Chemister's "Cast any number of cards exiled with ~ without paying their mana
  // costs" (none too, so "you may" asks nothing more): one at a time as it resolves, timing ignored, X as 0 (rulings,
  // CR 608.2g, 107.3); a land card can't be cast (CR 305.9).
  const cast = FOUNDRY_CAST.exec(line);
  if (cast) {
    const a = parseActivated(`${cast[1]}Cast any number of cards exiled with ~ without paying their mana costs.${cast[2]}`);
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || e?.type !== "castFromAmong" || !e.fromLinked || Object.keys(e).length !== 4) out.unsupported.push(raw);
    else out.activated.push({ ...a, text: line, body: { ...a.body, text: "You may cast any number of spells from among cards exiled with ~ without paying their mana costs." } });
    return true;
  }
  const m = FOUNDRY.exec(line);
  if (!m) return false;
  const ab = parseManaAbility(`${m[1]} When you spend this mana to cast ${m[2]}, draw a card.`);
  const spell = ab?.spentTrigger && "spell" in ab.spentTrigger ? ab.spentTrigger.spell : undefined;
  if (!ab || ab.manaCost || !ab.tap || ab.spendOnly || spell?.kind !== "spell" || !spell.types?.length) {
    out.unsupported.push(raw);
    return true;
  }
  const text = "You may exile that spell instead of putting it into its owner's graveyard as it resolves.";
  const exile: Effect = { type: "may", effects: [{ type: "exileAsResolves", anyGraveyard: true, linked: true }], text };
  const body: AbilityBody = { targets: [], effects: [exile], text };
  out.mana.push({ ...ab, text: line, spentTrigger: { spell, body } });
  return true;
}

/**
 * Calamity, Galloping Inferno: "Whenever ~ attacks while saddled, choose a nonlegendary creature that saddled it this turn
 * and create a tapped and attacking token that's a copy of it. Sacrifice that token at the beginning of the next end step.
 * Repeat this process once." It triggers only if Calamity was saddled as it was declared as an attacker (rulings, CR
 * 702.171b). As it resolves (CR 608.2d), you choose a nonlegendary creature on the battlefield that was tapped for
 * Calamity's saddle cost this turn, as the object it was then (CR 702.171c, 400.7), not targeted, and create a token copy
 * of it (CR 707.2: what it copies, X as 0, no counters, tapped state or other effects, rulings), tapped and attacking
 * whichever player, planeswalker or battle you choose (CR 508.4, rulings: never declared as an attacker, so its attack
 * triggers don't trigger), then a delayed trigger sacrifices it at the beginning of the next end step (CR 603.7). Then all
 * that again, the same creature or another (rulings). None left to choose: no token.
 */
function calamity(raw: string, out: CompiledCard): void {
  const t = parseTrigger("Whenever ~ attacks while saddled, draw a card.");
  const filter = pickFilter("nonlegendary creature that saddled it this turn");
  if (!t || t === "fail" || t.event !== "selfAttacks" || t.activeIf?.kind !== "self" || !filter?.saddledSource || !filter.notSupertypes?.includes("Legendary")) {
    out.unsupported.push(raw);
    return;
  }
  const once: Effect[] = [
    { type: "pick", who: { ref: "you" }, filter, n: 1, action: "choose", anyController: true, prompt: "click a nonlegendary creature that saddled ~ this turn: you create a tapped and attacking token that's a copy of it" },
    { type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "created" }, tapped: true, attacking: true },
    { type: "delayed", when: "nextEndStep", each: "created", effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "sacrifice ~" },
  ];
  const text = CALAMITY.replace(/^Whenever ~ attacks while saddled, /, "");
  out.triggers.push({ ...t, body: { targets: [], effects: [...once, ...once], text: text[0]!.toUpperCase() + text.slice(1) } });
}
