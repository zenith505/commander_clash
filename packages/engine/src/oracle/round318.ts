// Round 318's sentences, read before round 317's (see round317Sentence in body.ts).
import type { Effect, TriggeredAbility } from "../abilities";
import { parseTrigger } from "./triggers";
import { num } from "./words";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseSentence } from "./sentence";
import { round319Sentence } from "./round319";
import { round320Trigger } from "./round320";

type Found = { effect: Effect; next: number } | "fail" | null;

/** Several effects for one sentence: all but the last pushed before it. */
const pushed = (effects: Effect[], before: Effect[], last: Effect, next: number): Found => {
  effects.push(...before);
  return { effect: last, next };
};

export function round318Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void effects;
  // Round 319's sentences first (oracle/round319.ts).
  const r319 = round319Sentence(s, sentences, si, ctx, effects);
  if (r319 !== null) return r319;
    // Curator of Destinies: "look at the top five cards of your library and separate them into a face-down pile and a
  // face-up pile. An opponent chooses one of those piles. Put that pile into your hand and the other into your
  // graveyard." You only look (the cards aren't revealed); the opponent, one you choose as it resolves (rulings), sees the
  // face-up pile and how many cards the face-down one has. Either pile may be empty (rulings; CR 700.3c).
  const youSeparate = /^[Ll]ook at the top (two|three|four|five|six|seven) cards of your library and separate them into a face-down pile and a face-up pile$/.exec(s);
  if (youSeparate && sentences[si + 1] === "An opponent chooses one of those piles" && sentences[si + 2] === "Put that pile into your hand and the other into your graveyard")
    return { effect: { type: "piles", n: num(youSeparate[1]!), separator: "you", rest: "graveyard", faceDown: true }, next: si + 3 };
  // Sauron's Ransom: "Choose an opponent. They look at the top four cards of your library and separate them into a
  // face-down pile and a face-up pile. Put one pile into your hand and the other into your graveyard.": that opponent, not
  // targeted, chosen as it resolves; you choose the pile (rulings).
  const theySeparate = /^They look at the top (two|three|four|five|six|seven) cards of your library and separate them into a face-down pile and a face-up pile$/.exec(sentences[si + 1] ?? "");
  if (s === "Choose an opponent" && theySeparate && sentences[si + 2] === "Put one pile into your hand and the other into your graveyard")
    return { effect: { type: "piles", n: num(theySeparate[1]!), separator: "opponent", rest: "graveyard", faceDown: true }, next: si + 3 };
  // Hostile Negotiations: two face-down piles exiled from the top of your library, one turned face up, an opponent
  // choosing the one for your hand (see runFaceDownPilesEffect). The splitter may break the first sentence at ", then".
  if (ctx.spell && /^Exile the top (two|three|four|five) cards of your library in a face-down pile$/.test(s)) {
    const n = /^Exile the top (\w+) /.exec(s)![1]!;
    const want = [`Exile the top ${n} cards of your library in another face-down pile`, "Look at the cards in each pile", "Turn a pile of your choice face up", "An opponent chooses one of those piles", "Put that pile into your hand and the other into your graveyard"];
    if (want.some((w, i) => sentences[si + 1 + i] !== w)) return "fail";
    return { effect: { type: "faceDownPiles", n: num(n) }, next: si + 1 + want.length };
  }
  // Grave Sifter: "each player chooses a creature type and returns any number of cards of that type from their graveyard to
  // their hand.": in turn order from the active player (as Patriarch's Bidding), each player's own type applying only to
  // their own cards (rulings); not targeted, all returned at the same time.
  if (/^[Ee]ach player chooses a creature type and returns any number of cards of that type from their graveyard to their hand$/.test(s))
    return pushed(effects, [{ type: "choose", choice: "creatureType", each: true }], { type: "chooseFromGraveyard", who: { ref: "eachPlayer" }, n: 999, upTo: true, filter: { kind: "card", types: [], notTypes: [], notColors: [], chosen: "pickerType", text: "card of the chosen type" } }, si + 1);
  // Ghired's Belligerence: "~ deals X damage divided as you choose among any number of target creatures. Whenever a creature
  // dealt damage this way dies this turn, populate.": a delayed trigger for each creature the damage was dealt to (CR
  // 603.7c), whoever controls it and however it dies this turn (rulings), as Reckless Blaze's.
  if (/^Whenever a creature dealt damage this way dies this turn, populate$/.test(s)) {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "damage" || !prev.divided) return "fail";
    return { effect: { type: "delayed", when: "dies", of: { ref: "damagedThisWay", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" } }, effects: [{ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: ["Creature"], token: true, text: "creature token" }, n: 1, action: "populate" }], text: "populate", thisTurn: true }, next: si + 1 };
  }
  // Fisher's Talent: "look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish
  // creature token if you revealed it this way.": only a land card can be revealed, so you're asked only then (as for
  // Delver of Secrets); you don't have to (rulings). The card stays on top, and "Then draw a card" draws it.
  if (/^[Ll]ook at the top card of your library$/.test(s) && sentences[si + 1] === "You may reveal it if it's a land card" && !ctx.spell) {
    // Another color after a text change of color words (round 462).
    const token = /^Create (a 1\/1 (?:white|blue|black|red|green) Fish creature token) if you revealed it this way$/.exec(sentences[si + 2] ?? "");
    const filter = parseSearchFilter("land card");
    const create = token ? parseSentence(`Create ${token[1]!}`, ctx) : null;
    if (!token || !filter || create?.length !== 1 || create[0]!.type !== "createToken") return "fail";
    effects.push({ type: "revealTop", look: true });
    return { effect: { type: "if", cond: { kind: "revealedIs", filter }, effects: [{ type: "may", effects: create, text: `reveal the land card on top of your library and create ${token[1]!.replace(/^a /, "a ")}` }] }, next: si + 3 };
  }
  return null;
}

export function round318Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Round 320's triggers first (oracle/round320.ts).
  const r320 = round320Trigger(raw);
  if (r320 !== null) return r320;
  // Karplusan Minotaur: "Whenever you lose a coin flip, ~ deals 1 damage to any target of an opponent's choice.": as it's
  // put on the stack its controller chooses an opponent, who chooses the target (CR 603.3d; rulings on Cuombajj Witches);
  // only flips its controller lost (CR 705.2, rulings).
  const lost = /^(Whenever you lose a coin flip, ~ deals \d+ damage to any target) of an opponent's choice\.$/.exec(raw);
  if (lost) {
    const t = parseTrigger(`${lost[1]!}.`);
    if (!t || t === "fail" || t.event !== "youLoseFlip" || t.body.targets.length !== 1 || t.body.targets[0]!.chosenBy) return "fail";
    return { ...t, body: { ...t.body, targets: [{ ...t.body.targets[0]!, chosenBy: "opponent", text: "any target of an opponent's choice" }], text: raw.replace(/^Whenever you lose a coin flip, /, "") } };
  }
  return null;
}
