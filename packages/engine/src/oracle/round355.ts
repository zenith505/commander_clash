// Round 355's sentences, read before round 354's (round354Sentence in oracle/round354.ts reads these first): copies of two
// graveyard cards that must be cast (Spelltwine), a free cast from hand bound by the triggering spell (Baral and Kari Zev),
// an exiled card cast with affinity for artifacts (Chiss-Goria, Forge Tyrant), and a delayed reveal for as many creatures
// as were exiled (Synthetic Destiny).
import type { Effect, TargetSpec } from "../abilities";
import { parseBody, type Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseObject } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round355Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  const line = plain(s);
  // Spelltwine: "Exile target instant or sorcery card from your graveyard and target instant or sorcery card from an
  // opponent's graveyard. Copy those cards. Cast the copies if able without paying their mana costs.": two targets, both
  // needed to cast it (rulings); either still legal is exiled and copied (rulings, CR 608.2b). The copies are made in
  // exile and cast from there as it resolves (CR 707.12, 608.2g), in either order (rulings), each one that can be cast
  // having to be (CR 101.3: one that can't isn't); X is 0 (CR 107.3b). The cards stay exiled (rulings).
  if (ctx.spell && line === "Exile target instant or sorcery card from your graveyard and target instant or sorcery card from an opponent's graveyard" && plain(sentences[si + 1]) === "Copy those cards" && plain(sentences[si + 2]) === "Cast the copies if able without paying their mana costs") {
    const yours = parseObject("target instant or sorcery card from your graveyard", ctx, true);
    const theirs = parseObject("target instant or sorcery card from an opponent's graveyard", ctx, true);
    if (yours?.ref !== "target" || theirs?.ref !== "target" || ctx.targets[yours.index]?.owner !== "you" || ctx.targets[theirs.index]?.owner !== "opponent") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: yours.index, alsoTarget: theirs.index }, must: true }, next: si + 3 };
  }
  // Baral and Kari Zev: "you may cast a spell with lesser mana value that shares a card type with it from your hand
  // without paying its mana cost. If you don't, create First Mate Ragavan, ... token. It gains haste until end of turn.":
  // cast as the trigger resolves, timing ignored (rulings, CR 608.2g), X as 0 (rulings); "it" is the spell that triggered
  // it, as it was cast. "If you don't": no spell cast this way, declined or none to cast.
  if (ctx.castSpell && !ctx.spell && /^[Yy]ou may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost$/.test(line)) {
    const dont = /^If you don't, (create .+)$/.exec(plain(sentences[si + 1]));
    if (!dont) return "fail";
    const rest = [`${dont[1]![0]!.toUpperCase()}${dont[1]!.slice(1)}`, ...sentences.slice(si + 2)].map((x) => `${plain(x)}.`).join(" ");
    const body = parseBody(rest);
    if (!body || body.targets.length || !body.effects.length) return "fail";
    const castIt: Effect = { type: "castFromHand", filter: { kind: "spell", types: [], notTypes: [], notColors: [], text: "spell with lesser mana value that shares a card type with it" }, setsDid: true, lesserSharingCast: true };
    _effects.push(castIt);
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: body.effects }, next: sentences.length };
  }
  // Chiss-Goria, Forge Tyrant: "exile the top five cards of your library. You may cast an artifact spell from among them
  // this turn. If you do, it has affinity for artifacts.": one spell, an artifact spell as it's cast (the face cast
  // counting), with its normal timing, paying its costs, {1} less for each artifact you control as it's cast (CR 702.41a,
  // 601.2f); the cards not cast stay exiled.
  if (!ctx.spell && /^[Ee]xile the top five cards of your library$/.test(line) && plain(sentences[si + 1]) === "You may cast an artifact spell from among them this turn" && plain(sentences[si + 2]) === "If you do, it has affinity for artifacts" && sentences.length === si + 3) {
    const spellFilter = parseSearchFilter("artifact card");
    if (!spellFilter) return "fail";
    const artifacts: TargetSpec = { kind: "object", types: ["Artifact"], notTypes: [], notColors: [], controller: "you", text: "artifact you control" };
    return { effect: { type: "impulse", n: 5, until: "thisTurn", castOnly: true, oneOf: true, spellFilter, affinity: artifacts }, next: si + 3 };
  }
  // Synthetic Destiny: "Exile all creatures you control. At the beginning of the next end step, reveal cards from the top
  // of your library until you reveal that many creature cards, put all creature cards revealed this way onto the
  // battlefield, then shuffle the rest of the revealed cards into your library.": a delayed trigger (CR 603.7a) remembering
  // how many creatures the exile took as it resolved, tokens and a commander too (rulings); the cards found enter together,
  // the whole library revealed if it has fewer (rulings), and the library shuffled even with nothing else revealed (rulings).
  const prev = _effects[_effects.length - 1];
  if (ctx.spell && line === "At the beginning of the next end step, reveal cards from the top of your library until you reveal that many creature cards, put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library" && sentences.length === si + 1 && prev?.type === "exile" && prev.what.ref === "each" && prev.what.filter.controller === "you" && prev.what.filter.types?.length === 1 && prev.what.filter.types[0] === "Creature" && !prev.what.filter.subtypes?.length && !ctx.targets.length) {
    const creatures: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creatures" };
    const reveal: Effect = { type: "revealUntil", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, found: "battlefield", rest: "shuffle", n: { count: { kind: "eventAmount" } } };
    return { effect: { type: "delayed", when: "nextEndStep", effects: [reveal], text: "reveal cards from the top of your library until you reveal that many creature cards, put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library", event: { amount: { count: { kind: "exiledThisWay", filter: creatures } } } }, next: si + 1 };
  }
  return null;
}
