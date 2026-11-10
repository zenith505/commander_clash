// Lane B round B170's sentences, read at the end of round B169's (parseBodyText is at TS2563's limit), and its whole
// texts, read by wholeTextForms after round B155's.
import type { AbilityBody, Effect, TargetSpec } from "../abilities";
import { parseOne, type Ctx } from "./body";
import { parseStaticCondition } from "./statics";
import { roundB171Sentence } from "./laneb171";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");
const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const CREATURE_CARD: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };

export function roundB170Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const last = effects.at(-1);
  // Random Encounter: "Shuffle your library, then mill four cards. Put each creature card milled this way onto the
  // battlefield. They gain haste. At the beginning of the next end step, return those creatures to their owner's hand.":
  // each creature card that mill put into your graveyard and still there (CR 400.7), all at once under your control; haste
  // for as long as each is that permanent, and one return for each of them at the next end step, while it's still that
  // object (CR 603.7c).
  if (s === "Put each creature card milled this way onto the battlefield" && plain(sentences[si + 1]) === "They gain haste" && plain(sentences[si + 2]) === "At the beginning of the next end step, return those creatures to their owner's hand") {
    if (last?.type !== "mill" || last.who.ref !== "you") return "fail";
    return { effect: { type: "putOntoBattlefield", what: { ref: "milled", filter: CREATURE_CARD }, haste: "game", atEndStep: "hand" }, next: si + 3 };
  }
  // Mordor on the March: "Exile a creature card from your graveyard. Create a token that's a copy of it.": the card just
  // exiled, as it is in exile (CR 707.2; the God-Pharaoh's Gift form, "a copy of that card").
  if (s === "Create a token that's a copy of it" && ctx.chosenFromYard && !ctx.targets.length && last?.type === "chooseFromGraveyard" && last.dest === "exile" && last.n === 1 && !last.who && !last.upTo) {
    const fx = parseOne("Create a token that's a copy of that card", ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    return e?.type === "createTokenCopy" && e.what.ref === "chosenFromYard" ? { effect: e, next: si + 1 } : "fail";
  }
  // Heart-Shaped Herb: "You may sacrifice a creature. If you do, return that card to the battlefield under its owner's
  // control with three +1/+1 counters on it and you become the monarch.": the card the sacrifice put into a graveyard,
  // while it's still there (CR 400.7: a token is gone, CR 111.7), under its owner's control with the counters it enters
  // with (CR 614.1c); you become the monarch whether or not a card came back, as long as you sacrificed one.
  const herb = /^If you do, return that card to the battlefield under its owner's control with (a|two|three|four|five) \+1\/\+1 counters? on it and you become the monarch$/.exec(s);
  if (herb) {
    const sac = last?.type === "may" && !last.pay && !last.otherwise && last.effects.length === 1 ? last.effects[0] : undefined;
    if (sac?.type !== "pick" || sac.action !== "sacrifice" || sac.filter?.kind !== "object" || !sac.filter.types?.includes("Creature")) return "fail";
    const n = { a: 1, two: 2, three: 3, four: 4, five: 5 }[herb[1]!]!;
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: [{ type: "putOntoBattlefield", what: { ref: "sacrificedThisWayCards" }, owner: true, counters: { "+1/+1": n } }, { type: "becomeMonarch", who: { ref: "you" } }] }, next: si + 1 };
  }
  // Kamahl's Summons: "Each player may reveal any number of creature cards from their hand. Then each player creates a 2/2
  // green Bear creature token for each card they revealed this way.": each chooses in turn order from the active player
  // (CR 101.4), revealing none if they like; then each creates as many tokens as they revealed cards.
  if (s === "Each player may reveal any number of creature cards from their hand") {
    const then = /^Then each player creates (an? .+ token) for each card they revealed this way$/.exec(plain(sentences[si + 1]));
    if (!then || effects.length || si + 2 !== sentences.length) return null;
    const fx = parseOne(`Create ${then[1]!}`, ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    if (e?.type !== "createToken" || e.who.ref !== "you" || e.n !== 1 || e.tapped || e.counters) return "fail";
    return { effect: { type: "eachRevealFromHand", filter: CREATURE_CARD, then: e }, next: si + 2 };
  }
  // Vivien's Stampede: "At the beginning of the next main phase this turn, draw a card for each player who was dealt
  // combat damage this turn.": a delayed trigger (CR 603.7) for a later main phase of this turn, none if no main phase is
  // left; the count is made as it resolves.
  const nextMain = /^At the beginning of the next main phase this turn, (.+)$/.exec(s);
  if (nextMain) {
    const before = ctx.targets.length;
    const fx = parseOne(capital(nextMain[1]!), ctx);
    if (!fx?.length || ctx.targets.length !== before) return "fail";
    return { effect: { type: "delayed", when: "nextMainThisTurn", effects: fx, text: nextMain[1]! }, next: si + 1 };
  }
  return roundB171Sentence(s, sentences, si, ctx, effects);
}

export function roundB170WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | null {
  // Follow the Lumarets: "Look at the top four cards of your library. You may reveal a creature or land card from among
  // them and put it into your hand. If you gained life this turn, you may instead reveal two creature and/or land cards
  // from among them and put them into your hand. Put the rest on the bottom of your library in a random order.": whether
  // you gained life this turn is checked as it resolves, and then up to two of those cards.
  const lumarets = /^(Look at the top (?:[a-z]+) cards of your library\. You may reveal an? ([a-z]+ or [a-z]+) card from among them and put it into your hand\.) If (you gained life this turn), you may instead reveal two ([a-z]+) and\/or ([a-z]+) cards from among them and put them into your hand\. (Put the rest on the bottom of your library in a random order\.)$/.exec(text.trim());
  if (lumarets && lumarets[2] === `${lumarets[4]} or ${lumarets[5]}`) {
    const body = parse(`${lumarets[1]} ${lumarets[6]}`);
    const dig = body?.effects.length === 1 ? body.effects[0] : undefined;
    const cond = parseStaticCondition(lumarets[3]!, { affects: { kind: "self" }, mods: [], text: "" });
    if (!body || body.targets.length || !cond || dig?.type !== "dig" || dig.into !== "hand" || dig.count !== 1 || !dig.upTo || dig.rest !== "bottom" || !dig.random || dig.countIfCond || dig.kickedCount !== undefined) return null;
    return { ...body, effects: [{ ...dig, countIfCond: { cond, count: 2 } }], text };
  }
  return null;
}
