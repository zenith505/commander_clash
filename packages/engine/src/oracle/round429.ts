// Round 429's whole lines (compile.ts, before round 428's) and sentences (body.ts chain, before round 428's).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { counterKind } from "./words";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);
const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One whole line of round 429's (compile.ts); false when it isn't one of these. */
export function round429Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Metamorphic Alteration: "As this Aura enters, choose a creature." (CR 614.12): one already on the battlefield, anyone's,
  // the one it will enchant too, not one entering with it (rulings). Only with the copy line after it, which uses it.
  if (line === "As ~ enters, choose a creature.") {
    if (isSpell || out.entersChooseObject) return fail(out, raw);
    out.entersChooseObject = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "a creature" };
    return true;
  }
  // Metamorphic Alteration: "Enchanted creature is a copy of the chosen creature.": a static copy effect (CR 707.2, 611.3a)
  // of that creature's copiable values as they were when it was chosen (rulings), on whatever this Aura enchants.
  if (line === "Enchanted creature is a copy of the chosen creature.") {
    if (isSpell || out.entersChooseObject?.text !== "a creature" || out.entersChooseObject.controller) return fail(out, raw);
    out.enchantedCopiesChosen = true;
    return true;
  }
  // Evelyn, the Covetous: "Once each turn, you may play a card from exile with a collection counter on it if it was exiled
  // by an ability you controlled, and you may spend mana as though it were mana of any color to cast it.": a permission
  // (CR 601.3, 305.1) for one card each turn, a land as the turn's land play, with the usual timing (CR 305.2, 601.3), mana
  // as though of any color (CR 609.4b).
  const once = /^Once each turn, you may play a card from exile with an? ([a-z]+) counter on it if it was exiled by an ability you controlled, and you may spend mana as though it were mana of any color to cast it\.$/.exec(line);
  if (once) {
    if (isSpell || out.playExiledCounteredOnce) return fail(out, raw);
    out.playExiledCounteredOnce = counterKind(once[1]!);
    return true;
  }
  return false;
}

/** One sentence of an ability's effect (body.ts); null when it isn't one of these, "fail" when it's one we can't do. */
export function round429Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  const line = plain(s);
  // Evelyn, the Covetous: "exile the top card of each player's library with a collection counter on it": in turn order,
  // each card exiled face up with the counter on it (CR 122.1, 406.3), recorded as exiled by this ability's controller
  // (run-library.ts, GameObject.exiledByPlayer) for "if it was exiled by an ability you controlled".
  const eachCounter = /^[Ee]xile the top card of each player's library with an? ([a-z]+) counter on it$/.exec(line);
  if (eachCounter) {
    if (ctx.spell) return "fail";
    return { effect: { type: "exileTop", who: { ref: "eachPlayer" }, n: 1, counters: { [counterKind(eachCounter[1]!)]: 1 } }, next: si + 1 };
  }
  // Bloodthirsty Adversary's reflexive trigger: "... then exile up to that many target instant and/or sorcery cards with
  // mana value 3 or less from your graveyard and copy them. You may cast any number of the copies without paying their
  // mana costs.": "that many" is the times {2}{R} was paid, the reflexive trigger's X (CR 603.12, 601.2c), its targets
  // chosen as it's put on the stack (rulings). As it resolves the cards still legal targets are exiled and copied, and the
  // copies cast then or never, timing ignored (CR 608.2g, 707.12; rulings: the cards stay exiled either way).
  const copyThem = /^(Exile up to X target instant and\/or sorcery cards with mana value \d+ or less from your graveyard) and copy them$/.exec(line);
  if (copyThem) {
    if (plain(sentences[si + 1]) !== "You may cast any number of the copies without paying their mana costs" || sentences.length !== si + 2) return "fail";
    const before = ctx.targets.length;
    const ex = parseSentence(copyThem[1]!, ctx);
    const e0 = ex?.length === 1 ? ex[0] : undefined;
    const spec = ctx.targets[before];
    if (e0?.type !== "exile" || ctx.targets.length !== before + 1 || spec?.kind !== "card" || spec.many !== "x" || spec.owner !== "you") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: before, many: true } }, next: si + 2 };
  }
  return null;
}
