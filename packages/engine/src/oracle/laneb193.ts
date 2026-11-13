// Lane B round B193's sentences, read at the end of round B192's chain.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseObject } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function roundB193Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Demilich: "exile up to one target instant or sorcery card from your graveyard. Copy it. You may cast the copy.";
  // Founding the Third Path's III: "Exile target instant or sorcery card from your graveyard. Copy it. You may cast the
  // copy.": the copy is made in exile and cast as this resolves or never, paying all its costs (rulings: X as you choose,
  // timing ignored, CR 608.2g); one not cast ceases to exist and the card stays exiled either way (rulings, CR 707.12,
  // 704.5e). Nothing exiled with no target chosen.
  const paidCopy = /^[Ee]xile ((?:up to one )?target instant or sorcery card from your graveyard)$/.exec(s);
  if (paidCopy && plain(sentences[si + 1]) === "Copy it" && plain(sentences[si + 2]) === "You may cast the copy" && sentences.length === si + 3) {
    const what = parseObject(paidCopy[1]!, ctx, true);
    if (what?.ref !== "target") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: what.index }, paid: true }, next: si + 3 };
  }
  // Arcane Proxy: "exile target instant or sorcery card with mana value less than or equal to ~'s power from your
  // graveyard. Copy that card. You may cast the copy without paying its mana cost.": its power checked as the target is
  // chosen and again as this resolves (rulings: a card that's now too big is an illegal target, nothing exiled, CR
  // 608.2b); the copy cast as this resolves or never (rulings), X as 0 (CR 107.3b).
  const proxy = /^[Ee]xile (target instant or sorcery card with mana value less than or equal to ~'s power from your graveyard)$/.exec(s);
  if (proxy && plain(sentences[si + 1]) === "Copy that card" && plain(sentences[si + 2]) === "You may cast the copy without paying its mana cost" && sentences.length === si + 3) {
    const what = parseObject(proxy[1]!, ctx, true);
    if (what?.ref !== "target") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: what.index } }, next: si + 3 };
  }
  // Bilbo, Thief in the Night: "you may cast an artifact, instant, or sorcery spell from your graveyard. If an instant or
  // sorcery spell cast this way would be put into your graveyard, exile it instead.": one card there, picked and cast as
  // this resolves or none, paying its costs (CR 608.2g); the spell's types as it's cast (an Adventure's instant too,
  // rulings), and only an instant or sorcery spell is exiled instead (CR 614.1a), an artifact spell going back as usual.
  if (/^[Yy]ou may cast an artifact, instant, or sorcery spell from your graveyard$/.test(s) && plain(sentences[si + 1]) === "If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead" && sentences.length === si + 2) {
    const filter = parseSearchFilter("artifact, instant, or sorcery card");
    if (filter?.kind !== "card" || filter.types?.length !== 3) return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, yourYard: true, asSpell: true, filter: { ...filter, text: "artifact, instant, or sorcery card" }, max: 1, paid: true, exileCast: true, exileCastTypes: ["Instant", "Sorcery"] }, next: si + 2 };
  }
  return null;
}
