// Round 420's whole lines (compile.ts, before round 419's): Kotose, the Silent Spider's enters trigger, Allure of the
// Unknown, and Cloak and Dagger, Entwined's enters trigger.
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const KOTOSE_SEARCH = "When ~ enters, exile target card other than a basic land card from an opponent's graveyard. Search that player's graveyard, hand, and library for any number of cards with the same name as that card and exile them. Then that player shuffles.";
const KOTOSE = `${KOTOSE_SEARCH} For as long as you control ~, you may play one of the exiled cards, and you may spend mana as though it were mana of any color to cast it.`;
const ALLURE = "Reveal the top six cards of your library. An opponent exiles a nonland card from among them, then you put the rest into your hand. That opponent may cast the exiled card without paying its mana cost.";
const CLOAK = "When ~ enters, choose target opponent and up to one target creature they control. They reveal their hand. You may exile a nonland card from their hand or the chosen creature until ~ leave the battlefield.";

const NONLAND: TargetSpec = { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "nonland card" };

/** One whole line of round 420's (compile.ts); false when it isn't one of these. */
export function round420Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Kotose: the target card is exiled first, then its owner's graveyard, hand and library are searched for cards with its
  // name (CR 701.23; any number of them, so some may be left, rulings), then that player shuffles. "The exiled cards" are
  // all of those, the target too; one of them may be played (rulings), for as long as you control Kotose as the object
  // that triggered (rulings: not again after another player gained control or after it left and came back), spending
  // mana as though it were mana of any color to cast it (CR 609.4b). An illegal target (gone from the graveyard) means
  // the ability does nothing at all (CR 608.2b).
  if (line === KOTOSE) {
    const t = isSpell ? null : parseTrigger(KOTOSE_SEARCH);
    const [exile, named] = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.targets.length !== 1 || t.body.effects.length !== 2 || exile?.type !== "exile" || exile.what.ref !== "target" || exile.until || named?.type !== "exileNamed" || named.sameAs !== 0 || named.all || named.max !== undefined) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [exile, named, { type: "mayPlayOneExiledThisWay" }], text: line.slice("When ~ enters, ".length) } });
    return true;
  }
  // Allure of the Unknown (effects/run-round420.ts revealOpponentExilesCasts): "an opponent" is one its controller
  // chooses as it resolves (CR 608.2d), the one who then may cast the card (rulings).
  if (line === ALLURE) {
    if (!isSpell || out.spell) return fail(out, raw);
    out.spell = { targets: [], effects: [{ type: "revealOpponentExilesCasts", n: 6, filter: NONLAND }], text: line };
    return true;
  }
  // Cloak and Dagger, Entwined: two targets, the opponent and up to one creature that opponent controls (CR 115.1, 601.2c).
  // "They reveal their hand" (CR 701.20a), then you may exile one of their nonland cards or that creature until Cloak and
  // Dagger leave the battlefield (CR 610.3; effects/run-round420.ts exileFromHandOrTarget). "Leave", the plural for this
  // one permanent's name, is the same instruction as "leaves".
  if (line === CLOAK) {
    const t = isSpell ? null : parseTrigger("When ~ enters, choose target opponent. Destroy up to one target creature that player controls.");
    const [opp, cre] = t && t !== "fail" ? t.body.targets : [];
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.targets.length !== 2 || opp?.kind !== "player" || !opp.opponent || cre?.kind !== "object" || cre.controlledByTarget !== 0 || !cre.optional || cre.types?.join() !== "Creature") return fail(out, raw);
    out.triggers.push({
      ...t,
      body: {
        targets: [opp, { ...cre, text: "target creature they control" }],
        effects: [
          { type: "lookAtHand", who: { ref: "target", index: 0 }, reveal: true },
          { type: "exileFromHandOrTarget", player: 0, creature: 1, filter: NONLAND },
        ],
        text: line.slice("When ~ enters, ".length),
      },
    });
    return true;
  }
  return false;
}
