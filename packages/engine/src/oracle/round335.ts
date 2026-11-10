// Round 335's sentences, read before round 334's (round334Sentence in oracle/round334.ts).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { counterKind } from "./words";
import { pickFilter } from "./targets";
import { parseSearchFilter } from "./search";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round335Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void ctx;
  const line = plain(s);
  // The Master, Formed Anew's Body Thief: "you may exile a creature you control and put a takeover counter on it": one
  // chosen as the trigger resolves (not targeted), and the counter on the card it became in exile (CR 400.7, 122.1); a
  // token ceases to exist there (CR 111.7), so it gets none.
  const exileCounter = /^[Yy]ou may exile an? ([a-z]+) you control and put an? ([a-z]+) counter on it$/.exec(line);
  if (exileCounter) {
    const filter = pickFilter(exileCounter[1]!);
    if (filter?.kind !== "object") return "fail";
    const pick: Effect = { type: "pick", who: { ref: "you" }, filter: { ...filter, controller: "you", text: `${exileCounter[1]} you control` }, n: 1, action: "exile", exiledCounter: counterKind(exileCounter[2]!) };
    return { effect: { type: "may", effects: [pick], text: line.replace(/^[Yy]ou may /, "") }, next: si + 1 };
  }
  // Tezzeret, Cruel Machinist: "Put any number of cards from your hand onto the battlefield face down. They're 5/5
  // artifact creatures.": one instruction, any cards, chosen as it resolves; they enter as 5/5 artifact creatures with no
  // name, color, subtype or ability (CR 708.2a; rulings: they don't enter as themselves and then become 5/5s).
  if (/^Put any number of cards from your hand onto the battlefield face down$/.test(line)) {
    if (plain(sentences[si + 1]) !== "They're 5/5 artifact creatures") return "fail";
    return { effect: { type: "putFromHand", may: true, any: true, faceDown: "artifact55" }, next: si + 2 };
  }
  // Tazri, Stalwart Survivor: "Put all creature cards with activated abilities that aren't mana abilities from among the
  // milled cards into your hand": every such card, no choice; abilities that work only in other zones count (cycling,
  // unearth), mana abilities don't (CR 605.1a).
  const allNonMana = /^(?:Then )?[Pp]ut all ([a-z]+) cards with activated abilities that aren't mana abilities from among (?:them|the milled cards|the cards milled this way) into your hand$/.exec(line);
  if (allNonMana) {
    const prev = effects[effects.length - 1];
    const filter = parseSearchFilter(`${allNonMana[1]} card`);
    if (prev?.type !== "mill" || prev.who.ref !== "you" || filter?.kind !== "card") return "fail";
    return { effect: { type: "chooseFromGraveyard", n: 99, milled: true, all: true, filter: { ...filter, nonManaActivated: true, text: `${allNonMana[1]} card with an activated ability that isn't a mana ability` } }, next: si + 1 };
  }
  return null;
}
