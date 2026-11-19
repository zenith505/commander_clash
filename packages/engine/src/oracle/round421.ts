// Round 421's whole lines (compile.ts, before round 420's): Lady Loki, Agent of Chaos's cast trigger, Medomai's
// Prophecy's chapter III and Squall, Gunblade Duelist's attack trigger.
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const LOKI = "Whenever you cast your first instant, sorcery, or Villain spell each turn, exile it, then exile cards from the top of your library until you exile a nonland card. ~ deals damage to each opponent equal to the difference between that spell's mana value and that nonland card's mana value. You may cast that card without paying its mana cost.";

const MEDOMAI_III = "III — When you cast a spell with the chosen name for the first time this turn, draw two cards.";

const SQUALL = "Whenever one or more creatures attack one of your opponents, if any of those creatures have power or toughness equal to the chosen number, ~ deals damage equal to its power to defending player.";

/** One whole line of round 421's (compile.ts); false when it isn't one of these. */
export function round421Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Lady Loki: the first spell you cast each turn that is an instant, a sorcery or a Villain (counting the turn's spells
  // of those kinds, as cast, also before Lady Loki was there: nthOfKind). The spell is exiled from the stack (not
  // countered), then cards are exiled from the top one at a time until a nonland card (they stay in exile). The damage is
  // the difference of the two mana values, the larger less the smaller: the spell's as it last existed on the stack, X
  // included (CR 202.3e, 608.2h), and the card's in exile; with no nonland card found, that one can't be determined and
  // is 0 (CR 107.2). Then that card may be cast as this resolves, without paying its mana cost (CR 608.2g).
  if (line === LOKI) {
    const t = isSpell ? null : parseTrigger("Whenever you cast your first instant or sorcery spell each turn, ~ deals damage to each opponent equal to that spell's mana value.");
    const kinds = isSpell ? null : parseTrigger("Whenever you cast an instant, sorcery, or Villain spell, draw a card.");
    if (!t || t === "fail" || !kinds || kinds === "fail" || t.event !== "castSpell" || t.cast?.nth !== 1 || !t.cast.nthOfKind || t.cast.by !== "you" || kinds.cast?.spell.anyOf?.length !== 3) return fail(out, raw);
    const [dmg] = t.body.effects;
    if (t.body.effects.length !== 1 || dmg?.type !== "damage" || typeof dmg.amount !== "object" || !("count" in dmg.amount) || dmg.amount.count.kind !== "manaValue") return fail(out, raw);
    const effects: Effect[] = [
      { type: "exileCause" },
      { type: "exileUntilNonland", then: "keep" },
      { ...dmg, amount: { count: { kind: "absDifference", of: [dmg.amount.count, { kind: "manaValue", of: { ref: "revealed" } }] } } },
      { type: "castRevealedFree" },
    ];
    out.triggers.push({ ...t, cast: { ...t.cast, spell: kinds.cast!.spell }, body: { targets: [], effects, text: line.slice(line.indexOf("each turn, ") + "each turn, ".length) } });
    return true;
  }
  // Medomai's Prophecy: chapter II's "Choose a card name." keeps the name on the Saga (the linked "the chosen name", CR
  // 607.2; a new object has none, CR 400.7), named by a bot for a card of its own. Chapter III makes a delayed trigger (CR
  // 603.7) for this turn only, triggering once (CR 603.7c), the first time this turn you cast a spell with that name
  // (counting the spells you cast earlier this turn: nthOfKind), the name bound as it resolves (floatingTrigger
  // `needsName`; with none chosen, none is made: it couldn't trigger, rulings).
  if (line === MEDOMAI_III) {
    const ii = out.triggers.find((t) => t.event === "chapter" && t.chapter === 2);
    const choose = ii?.body.effects[0];
    const t = isSpell ? null : parseTrigger("Whenever you cast a spell with the chosen name, draw two cards.");
    if (!ii || ii.body.effects.length !== 1 || choose?.type !== "choose" || choose.choice !== "cardName" || choose.names || choose.who || !t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "you" || t.cast.spell.chosen !== "name" || t.cast.nth) return fail(out, raw);
    ii.body = { ...ii.body, effects: [{ ...choose, keepOnSource: true, purpose: "own" }] };
    const trigger = { ...t, cast: { ...t.cast, nth: 1, nthOfKind: true as const }, body: { ...t.body, text: "draw two cards." } };
    out.triggers.push({ event: "chapter", chapter: 3, body: { targets: [], effects: [{ type: "floatingTrigger", trigger, until: "endOfTurn", once: true, needsName: true }], text: line.slice("III — ".length) } });
    return true;
  }
  // Squall, Gunblade Duelist: any player's creatures (CR 508.3e), once for each opponent of yours attacked, about the
  // creatures attacking that player; the intervening if (CR 603.4) checked on them as it triggers and again as it
  // resolves (TriggeredAbility.groupPTEqualsChosen), with the number chosen as ~ entered (CR 607.2; none chosen: 0, CR
  // 107.2). "Defending player" is the opponent attacked (CR 506.2). Its power as it resolves, or as it last existed on the
  // battlefield (rulings).
  if (line === SQUALL) {
    const t = isSpell ? null : parseTrigger("Whenever one or more creatures attack one of your opponents, ~ deals damage equal to its power to defending player.");
    const [dmg] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "creaturesYouControlAttack" || !t.anyoneAttacks || !t.attacksOpponent || t.attacksOpponent.orPlaneswalkers || t.ifCond || t.group || t.body.effects.length !== 1 || dmg?.type !== "damage" || !("ref" in dmg.to) || dmg.to.ref !== "eventPlayer" || !out.entersChoose?.some((c) => c.what === "number")) return fail(out, raw);
    out.triggers.push({ ...t, groupPTEqualsChosen: true, body: { ...t.body, text: "~ deals damage equal to its power to defending player." } });
    return true;
  }
  return false;
}
