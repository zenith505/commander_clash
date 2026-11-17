// Round 398's whole lines (compile.ts): Hurkyl, Master Wizard (one revealed card for each card type among the noncreature
// spells you've cast this turn), The Book of Vile Darkness (a token with the triggered abilities of the cards its cost
// exiled) and Grime Gorger (up to one card of each card type exiled from the defending player's graveyard).
import type { AdditionalCost, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** The card types a card in a graveyard or library can have (CR 205.2a; Grime Gorger's rulings). */
const CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Instant", "Kindred", "Land", "Planeswalker", "Sorcery"];

const HURKYL = "At the beginning of your end step, if you've cast a noncreature spell this turn, reveal the top five cards of your library. For each card type among noncreature spells you've cast this turn, you may put a card of that type from among the revealed cards into your hand. Put the rest on the bottom of your library in a random order.";
const BOOK = "{T}, Exile ~ and artifacts you control named Eye of Vecna and Hand of Vecna: Create Vecna, a legendary 8/8 black Zombie God creature token with indestructible and all triggered abilities of the exiled cards.";
const GORGER = "Whenever ~ attacks, exile up to one card of each card type from defending player's graveyard. Put a +1/+1 counter on ~ for each card exiled this way.";

/** One whole line of round 398's (compile.ts); false when it isn't one of these. */
export function round398Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Hurkyl, Master Wizard: an intervening if (CR 603.4), then Atraxa's dig (oracle/sentence.ts) with one card for each
  // card type among the noncreature spells you've cast this turn, worked out as it resolves (Effect dig
  // noncreatureCastTypes, effects/run-library.ts): Hurkyl needn't have been there as they were cast (rulings). A card with
  // several card types is taken for any one of them, as Atraxa's rulings say for "a card of that type".
  if (line === HURKYL) {
    const t = isSpell ? null : parseTrigger(HURKYL.replace("For each card type among noncreature spells you've cast this turn,", "For each card type,"));
    const dig = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.ifCond?.kind !== "castCount" || t.body.effects.length !== 1 || dig?.type !== "dig" || !dig.oneOfEach || dig.into !== "hand" || dig.rest !== "bottom" || !dig.random) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...dig, noncreatureCastTypes: true, filter: { ...dig.filter!, text: "card of a card type among noncreature spells you've cast this turn" } }], text: line.replace(/^At the beginning of your end step, if you've cast a noncreature spell this turn, /, "") } });
    return true;
  }
  // The Book of Vile Darkness: "{T}, Exile ~ and artifacts you control named Eye of Vecna and Hand of Vecna: Create Vecna,
  // ...": the costs are ~ itself and one artifact you control with each of those names (CR 201.2; a copy named so too,
  // rulings), all exiled as the cost is paid (CR 602.2b, 601.2h). The token has the triggered abilities of the cards
  // exiled (TokenSpec.triggersOfExiled, effects/run-tokens.ts): as they are in exile, part of its copiable values (rulings).
  if (line === BOOK) {
    const a = isSpell ? null : parseActivated("{T}, Exile ~: Create Vecna, a legendary 8/8 black Zombie God creature token with indestructible.");
    const create = a && a !== "fail" ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || !a.tap || !a.exileSelf || a.costs?.length || a.body.effects.length !== 1 || create?.type !== "createToken" || !create.token.named || !create.token.legendary) return fail(out, raw);
    const named = (name: string): TargetSpec => ({ kind: "object", types: ["Artifact"], notTypes: [], notColors: [], named: name, text: `artifact named ${name}` });
    const each = [named("Eye of Vecna"), named("Hand of Vecna")];
    const cost: AdditionalCost = { kind: "sacrifice", filter: { kind: "object", types: [], notTypes: [], notColors: [], anyOf: each, text: "artifact named Eye of Vecna and an artifact named Hand of Vecna" }, n: 2, exile: true, other: true, oneOfEach: each };
    const effects: Effect[] = [{ ...create, token: { ...create.token, triggersOfExiled: true } }];
    out.activated.push({ ...a, costs: [cost], body: { ...a.body, effects, text: line.slice(line.indexOf(": ") + 2) }, text: line });
    return true;
  }
  // Grime Gorger: you choose as it resolves (CR 608.2c), not targets, up to one card for each card type (CR 205.2a, its
  // rulings), a card with several card types taken for any one of them (Atraxa's rulings for "a card of that type"; as
  // Revival Experiment's "up to one card of that type"), from the graveyard of the player it attacks, or the controller of
  // the planeswalker or the protector of the battle it attacks (CR 506.2). Then a counter for each card exiled this way.
  if (line === GORGER) {
    const t = isSpell ? null : parseTrigger("Whenever ~ attacks, defending player mills two cards.");
    const mill = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfAttacks" || t.body.effects.length !== 1 || mill?.type !== "mill" || mill.who.ref !== "eventPlayer") return fail(out, raw);
    const oneOfEach: TargetSpec[] = CARD_TYPES.map((ty) => ({ kind: "card", types: [ty], notTypes: [], notColors: [], text: `${ty.toLowerCase()} card` }));
    const effects: Effect[] = [
      { type: "chooseFromGraveyard", who: mill.who, youChoose: true, filter: { kind: "card", anyOf: oneOfEach, text: "card of each card type" }, n: oneOfEach.length, upTo: true, dest: "exile", oneOfEach },
      { type: "counters", what: { ref: "self" }, counter: "+1/+1", n: { count: { kind: "yardChosenThisWay" } } },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^Whenever ~ attacks, /, "") } });
    return true;
  }
  return false;
}
