// Lane B round B196's sentences, read at the end of round B195's chain, and its whole spells, read after round B195's.
import type { AbilityBody, Effect, TargetSpec } from "../abilities";
import { addTarget, type Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { stackSpec } from "./sentences/spells";
import { roundB197Sentence, roundB197Spell } from "./laneb197";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");
const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** Round B196's sentences, read at the end of round B195's chain. */
export function roundB196Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Munda, Ambush Leader: "you may look at the top four cards of your library. If you do, reveal any number of Ally cards
  // from among them, then put those cards on top of your library in any order and the rest on the bottom in any order.":
  // the cards revealed are any of the Ally cards among them (a changeling card is an Ally, CR 702.73a), none if you like;
  // their owner orders both groups (CR 401.4).
  const look = /^[Yy]ou may look at the top (\w+) cards of your library$/.exec(plain(s));
  const reveal = look ? /^If you do, reveal any number of (.+?) cards from among them, then put those cards on top of your library in any order and the rest on the bottom in any order$/.exec(plain(sentences[si + 1])) : null;
  if (look && reveal) {
    const n = NUM[look[1]!];
    const filter = parseSearchFilter(`${reveal[1]!} card`);
    if (!n || !filter || sentences.length !== si + 2) return "fail";
    return { effect: { type: "may", effects: [{ type: "dig", n, count: n, upTo: true, filter, into: "libraryTop", rest: "bottom", reveal: true }], text: `look at the top ${look[1]} cards of your library` }, next: si + 2 };
  }
  // Wurmquake: "Create an X/X ... token ..., where X is the amount of mana spent to cast ~. Then for each opponent with three
  // or more poison counters, you create another one of those tokens.": the first token enters first, then the others
  // together (rulings), each the same X/X, the opponents counted as this resolves.
  if (/^For each opponent with three or more poison counters, you create another one of those tokens$/.test(plain(s))) {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "createToken" || prev.n !== 1 || prev.who.ref !== "you" || si !== 1 || effects.length !== 1) return "fail";
    return { effect: { ...prev, n: { count: { kind: "players", opponents: true, poisonAtLeast: 3 } } }, next: si + 1 };
  }
  // Tunnel Vision: "Choose a card name. Target player reveals cards from the top of their library until a card with that
  // name is revealed. If it is, that player puts the rest of the revealed cards into their graveyard and puts the card with
  // the chosen name on top of their library. Otherwise, the player shuffles.": found, every card above it goes to the
  // graveyard and it's left on top, no shuffle; not found, the whole library is revealed, nothing goes to the graveyard and
  // it's shuffled (rulings, CR 701.20a).
  if (
    plain(s) === "Target player reveals cards from the top of their library until a card with that name is revealed" &&
    plain(sentences[si + 1]) === "If it is, that player puts the rest of the revealed cards into their graveyard and puts the card with the chosen name on top of their library" &&
    plain(sentences[si + 2]) === "Otherwise, the player shuffles" &&
    sentences.length === si + 3
  ) {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "choose" || prev.choice !== "cardName" || effects.length !== 1 || ctx.targets.length) return "fail";
    const index = addTarget(ctx, { kind: "player", opponent: false, text: "target player" });
    // A name of a card in that player's library is what a bot names (the target player's, as it resolves).
    effects[0] = { ...prev, purpose: "inLibrary" };
    return { effect: { type: "revealUntil", who: { ref: "target", index }, filter: { kind: "card", chosen: "name", text: "card with the chosen name" }, found: "top", rest: "graveyard" }, next: si + 3 };
  }
  // Reroute: "Change the target of target activated ability with a single target." (Mana abilities can't be targeted, CR
  // 605.3b.) The new target one it could have (CR 115.7a).
  if (plain(s) === "Change the target of target activated ability with a single target")
    return { effect: { type: "changeTarget", index: addTarget(ctx, { ...stackSpec("activated ability"), singleTarget: true, text: "target activated ability with a single target" }) }, next: si + 1 };
  // Muck Drubb: "When ~ enters, change the target of target spell that targets only a single creature to ~.": a spell whose
  // every target is one creature (the same creature targeted several times too), all of them changed to ~ only if ~ is a
  // legal target for each (rulings).
  if (/^[Cc]hange the target of target spell that targets only a single creature to ~$/.test(plain(s)) && !ctx.spell) {
    const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "a single creature" };
    return { effect: { type: "changeTarget", index: addTarget(ctx, { kind: "spell", targetsOnly: true, targetsWhat: creature, text: "target spell that targets only a single creature" }), toSelf: true, all: true }, next: si + 1 };
  }
  // Meticulous Excavation: "Return target permanent you control to its owner's hand. If it has unearth, instead exile it,
  // then return that card to its owner's hand.": with unearth as it resolves (CR 702.84a; a permanent that lost it doesn't
  // have it), it's exiled (an unearthed one's exile replacement doesn't stop that, rulings), then that card goes to its
  // owner's hand from exile (CR 400.7; a token ceases to exist, 704.5d).
  if (plain(s) === "If it has unearth, instead exile it, then return that card to its owner's hand") {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "bounce" || prev.what.ref !== "target" || effects.length !== 1 || ctx.targets.length !== 1 || sentences.length !== si + 1) return "fail";
    const what = prev.what;
    effects.pop();
    return {
      effect: { type: "if", cond: { kind: "targetIs", index: what.index, filter: { kind: "object", types: [], notTypes: [], notColors: [], keywords: ["Unearth"], text: "permanent with unearth" } }, effects: [{ type: "exile", what }, { type: "bounce", what: { ref: "exiledThisWay" } }], otherwise: [prev] },
      next: si + 1,
    };
  }
  return roundB197Sentence(s, sentences, si, ctx, effects);
}

/** A whole spell's text read at once; undefined when it isn't one of these, null when it is but fails. */
export function roundB196Spell(text: string): AbilityBody | null | undefined {
  return roundB197Spell(text);
}
