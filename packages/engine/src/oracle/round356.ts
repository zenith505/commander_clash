// Round 356's sentences, read before round 355's (round355Sentence in oracle/round355.ts reads these first): a hideaway
// card cast for free that sends its Vehicle home (Smuggler's Buggy), and an opponent's card cast for free below your artifact
// count or else cast later this turn (Rashmi and Ragavan), an opponent's cards cast for free until a creature spell
// (Strago and Relm), and a random opponent's top card played this turn, its owner losing life as it's cast (The Ruinous
// Powers), and a top card exiled with a cast-from-exile ability needing another spell cast this turn (Monk Class).
import type { AbilityBody, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseCount } from "./counts";
import { parseGrants } from "./grants";
import { parsePlayer } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round356Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  const line = plain(s);
  // Smuggler's Buggy: "you may cast the exiled card without paying its mana cost. If you do, return ~ to its owner's
  // hand.": the card its hideaway exiled (CR 702.75a, 607.2a), cast as this resolves or not at all (CR 608.2g), a land
  // never (CR 305.9); "if you do" asks whether it was cast.
  if (!ctx.spell && !ctx.activated && /^[Yy]ou may cast the exiled card without paying its mana cost$/.test(line) && plain(sentences[si + 1]) === "If you do, return ~ to its owner's hand") {
    _effects.push({ type: "playLinked", castOnly: true, setsDid: true });
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: [{ type: "bounce", what: { ref: "self" } }] }, next: si + 2 };
  }
  // Rashmi and Ragavan: "exile the top card of target opponent's library and create a Treasure token. Then you may cast the
  // exiled card without paying its mana cost if it's a spell with mana value less than the number of artifacts you
  // control. If you don't cast it this way, you may cast it this turn.": the card the exile took (ObjRef "exiledTop"),
  // cast as this resolves (CR 608.2g, timing ignored, X 0, rulings), its mana value as the spell it's cast as (CR 601.2b),
  // the artifacts counted as this resolves, the Treasure included (rulings). Not cast this way, it may be cast this turn
  // paying its costs, with its usual timing (rulings); a land can't be cast (CR 305.9) and stays exiled.
  const top = _effects.findIndex((e) => e.type === "exileTop");
  const exiled = _effects[top];
  if (ctx.castSpell && !ctx.spell && /^(?:Then y|y|Y)ou may cast the exiled card without paying its mana cost if it's a spell with mana value less than the number of artifacts you control$/.test(line) && plain(sentences[si + 1]) === "If you don't cast it this way, you may cast it this turn" && sentences.length === si + 2 && exiled?.type === "exileTop" && exiled.n === 1 && exiled.who.ref === "target" && _effects.filter((e) => e.type === "exileTop").length === 1) {
    const artifacts = parseCount("the number of artifacts you control", ctx);
    if (!artifacts) return "fail";
    _effects.push({ type: "castTargetFree", what: { ref: "exiledTop" }, mvLessThan: artifacts, setsDid: true });
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: [{ type: "mayCastFromGraveyard", what: { ref: "exiledTop" }, inExile: true }] }, next: si + 2 };
  }
  // Strago and Relm: "Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or
  // creature card. You may cast that card without paying its mana cost. If you cast a creature spell this way, it gains
  // haste and "At the beginning of the end step, sacrifice this creature."": the found card cast as this resolves (CR
  // 608.2g, timing ignored, X 0, rulings); the other cards, and the found one if it isn't cast, stay exiled. A creature
  // spell (as it's cast) gains both with no duration, kept by the creature it becomes (CR 400.7a).
  if (/^Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card$/.test(line) && plain(sentences[si + 1]) === "You may cast that card without paying its mana cost") {
    const gains = /^If you cast a creature spell this way, it gains (haste and "At the beginning of the end step, sacrifice ~\.")$/.exec(plain(sentences[si + 2]));
    if (!gains || sentences.length !== si + 3) return null;
    const mods = parseGrants(gains[1]!);
    const who = parsePlayer("Target opponent", ctx);
    if (!who || !mods?.length || !mods.every((m) => m.kind === "addKeywords" || m.kind === "addAbility")) return "fail";
    return { effect: { type: "exileUntilNonland", who, then: "castFree", untilTypes: ["Instant", "Sorcery", "Creature"], creatureSpellGains: { mods, text: 'haste and "At the beginning of the end step, sacrifice this creature."' } }, next: si + 3 };
  }
  // The Ruinous Powers: "choose an opponent at random. Exile the top card of that player's library. Until end of turn, you
  // may play that card and you may spend mana as though it were mana of any color to cast it. When you cast a spell this
  // way, its owner loses life equal to its mana value.": the card exiled face up (CR 406.3), played with its usual timing
  // and costs (rulings), a land as your land play; mana of any type for the spell (CR 609.4b). Casting it triggers (CR
  // 603.2): the spell's mana value as it is on the stack, or last was, X included (rulings, CR 202.3e).
  if (!ctx.spell && !ctx.eventPlayer && !ctx.chosenOpponent && ctx.lastPlayerTarget === undefined && /^[Cc]hoose an opponent at random$/.test(line) && plain(sentences[si + 1]) === "Exile the top card of that player's library" && plain(sentences[si + 2]) === "Until end of turn, you may play that card and you may spend mana as though it were mana of any color to cast it" && plain(sentences[si + 3]) === "When you cast a spell this way, its owner loses life equal to its mana value" && sentences.length === si + 4) {
    _effects.push({ type: "choose", choice: "opponent", random: true });
    ctx.chosenOpponent = true;
    const castTrigger: AbilityBody = { targets: [], effects: [{ type: "loseLife", who: { ref: "subjectOwner" }, n: { count: { kind: "manaValue", of: { ref: "castSpell" } } } }], text: "its owner loses life equal to its mana value." };
    return { effect: { type: "impulse", n: 1, until: "thisTurn", who: { ref: "chosenPlayer" }, anyType: true, castTrigger }, next: si + 4 };
  }
  // Monk Class, level 3: "exile the top card of your library. For as long as it remains exiled, it has "You may cast this
  // card from exile as long as you've cast another spell this turn."": face up (CR 406.3), cast with its usual timing and
  // costs (CR 601.3), while that card's owner, who exiled it, has cast a spell earlier this turn; a land can't be cast.
  if (!ctx.spell && /^[Ee]xile the top card of your library$/.test(line) && plain(sentences[si + 1]) === 'For as long as it remains exiled, it has "You may cast ~ from exile as long as you\'ve cast another spell this turn."' && sentences.length === si + 2)
    return { effect: { type: "impulse", n: 1, until: "exiled", castOnly: true, castAnotherThisTurn: true }, next: si + 2 };
  return null;
}
