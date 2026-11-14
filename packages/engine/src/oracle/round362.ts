// Round 362's sentences, read before round 361's (round361Sentence in oracle/round361.ts reads these first), and its whole
// lines (compile.ts, after round 361's): becoming a copy of a creature card exiled from a graveyard, with this ability
// (Dimir Doppelganger), or of a milled one (Shadow Kin); two mana of one color and two of another (Open the Omenpaths);
// damage equal to the power of what the spell's behold-like cost chose or revealed (Monstrous Emergence); any amount of
// life paid to look at that many cards (Plunge into Darkness); and redistributing life totals (Reverse the Sands).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { parseCopyExcept } from "./tokens";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round362Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  const prev = effects[effects.length - 1];
  // Dimir Doppelganger: "{1}{U}{B}: Exile target creature card from a graveyard. ~ becomes a copy of that card, except it
  // has this ability.": the card as it is in exile, its copiable values as printed (CR 707.2, 707.4), with this ability's
  // own text (CR 707.9a); for the rest of the game, a later copy effect overwriting it by timestamp (rulings, CR 613.7).
  // With the card gone from the graveyard first, the ability's only target is illegal and it doesn't resolve (CR 608.2b).
  if (ctx.activated && !ctx.spell && line === "~ becomes a copy of that card, except it has this ability") {
    const i = ctx.targets.length - 1;
    const card = ctx.targets[i];
    const except = parseCopyExcept("it has this ability");
    if (effects.length !== 1 || prev?.type !== "exile" || prev.what.ref !== "target" || prev.what.index !== i || prev.what.n || card?.kind !== "card" || card.many || ctx.lastObjectTarget !== undefined || !except?.thisAbility || sentences.length !== si + 1) return "fail";
    return { effect: { type: "becomeCopy", what: { ref: "self" }, of: { ref: "target", index: i, card: true }, except, duration: "game" }, next: si + 1 };
  }
  // Shadow Kin: "At the beginning of your upkeep, each player mills three cards. You may exile a creature card from among
  // the cards milled this way. If you do, ~ becomes a copy of that card, except it has this ability.": one of the cards
  // milled just before, still in a graveyard (CR 400.7), chosen as it resolves, then the copy of that card as it is in
  // exile (CR 707.2, 707.4) with this ability's own text (CR 707.9a), for the rest of the game; a later copy effect
  // overwrites it by timestamp (CR 613.7).
  if (!ctx.spell && !ctx.activated && line === "You may exile a creature card from among the cards milled this way" && plain(sentences[si + 1]) === "If you do, ~ becomes a copy of that card, except it has this ability" && sentences.length === si + 2) {
    const except = parseCopyExcept("it has this ability");
    if (effects.length !== 1 || prev?.type !== "mill" || prev.who.ref !== "eachPlayer" || ctx.targets.length || !except?.thisAbility) return "fail";
    const creature: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
    effects.push({ type: "chooseFromGraveyard", filter: creature, n: 1, upTo: true, dest: "exile", anyGraveyard: true, milled: true, inGraveyards: true });
    return { effect: { type: "if", cond: { kind: "yardChosenIs", filter: creature }, effects: [{ type: "becomeCopy", what: { ref: "self" }, of: { ref: "chosenFromYard" }, except, duration: "game" }] }, next: si + 2 };
  }
  // Open the Omenpaths: "Add two mana of any one color and two mana of any other color.": a color chosen as it resolves,
  // then a second one that isn't it (CR 105.1, 608.2d), two of each (a spell's mana, not a mana ability, CR 605.1); a
  // "Spend this mana only ..." after it restricts all four (CR 106.6).
  if (line === "Add two mana of any one color and two mana of any other color") {
    const fx = parseSentence("Add two mana of any one color", ctx);
    const [pick, add] = fx?.length === 2 ? fx : [];
    if (pick?.type !== "choose" || pick.choice !== "color" || add?.type !== "addMana" || add.chosen !== 2 || add.who || add.times) return "fail";
    effects.push(pick, add, { ...pick, otherColor: true });
    return { effect: { ...add }, next: si + 1 };
  }
  // Monstrous Emergence: "~ deals damage equal to the power of the creature you chose or the card you revealed to target
  // creature.": the one its additional cost chose or revealed (Amount beheldPower; compile checks that cost): a creature's
  // power as the spell resolves, or as it last existed on the battlefield (rulings, CR 608.2h); a card's in the hand.
  if (ctx.spell && line === "~ deals damage equal to the power of the creature you chose or the card you revealed to target creature" && !effects.length && !ctx.targets.length) {
    const fx = parseSentence("~ deals 1 damage to target creature", ctx);
    const dmg = fx?.length === 1 ? fx[0]! : undefined;
    if (dmg?.type !== "damage" || dmg.to.ref !== "target" || dmg.also) return "fail";
    return { effect: { ...dmg, amount: { count: { kind: "beheldPower" } } }, next: si + 1 };
  }
  // Plunge into Darkness: "Pay any amount of life, then look at that many cards from the top of your library. Put one of
  // those cards into your hand and exile the rest.": the amount chosen and paid as it resolves (rulings), up to the life
  // the player could pay (CR 119.4), 0 being the same as paying none (as Vizkopa Confessor's), then a look at that many.
  if (line === "Pay any amount of life" && plain(sentences[si + 1]) === "Look at that many cards from the top of your library" && plain(sentences[si + 2]) === "Put one of those cards into your hand and exile the rest" && !ctx.targets.length) {
    const dig: Effect = { type: "dig", n: { count: { kind: "x" } }, reveal: false, count: 1, upTo: false, into: "hand", rest: "exile" };
    return { effect: { type: "may", effects: [dig], pay: {}, payX: { life: true }, text: "pay any amount of life, then look at that many cards from the top of your library. Put one of those cards into your hand and exile the rest" }, next: si + 3 };
  }
  return null;
}

export function round362Line(line: string, _raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Reverse the Sands: "Redistribute any number of players' life totals.": the whole spell (effects/run-round362.ts), with
  // no targets; who gets which total is chosen as it resolves (rulings).
  if (isSpell && line === "Redistribute any number of players' life totals." && !out.spell) {
    out.spell = { targets: [], effects: [{ type: "redistributeLife" }], text: line };
    return true;
  }
  return false;
}
