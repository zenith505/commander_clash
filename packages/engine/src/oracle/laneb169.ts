// Lane B round B169's sentences, read at the end of round B168's (parseBodyText is at TS2563's limit).
import type { Amount, Effect } from "../abilities";
import { parseOne, type Ctx } from "./body";
import { NUM, num } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** An amount that counts the cards an exileTop just before took ("for each blue card exiled this way"). */
const countsExiledTop = (n: Amount | undefined) => typeof n === "object" && "count" in n && n.count.kind === "exiledTopMatching";

export function roundB169Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Culmination of Studies: "Exile the top X cards of your library. For each land card exiled this way, create a Treasure
  // token. For each blue card exiled this way, draw a card. For each red card exiled this way, ~ deals 1 damage to each
  // opponent.": every one about the cards that exile took (all exiled first, rulings), not only the sentence right after it;
  // a card both blue and red counts for both, and the damage to each opponent is one event (rulings, CR 120.2).
  const eachExiled = /^For each (.+? card) exiled this way, (.+)$/.exec(s);
  if (eachExiled && !ctx.afterExileTop) {
    const at = effects.map((e) => e.type).lastIndexOf("exileTop");
    const top = effects[at];
    if (top?.type !== "exileTop" || top.who.ref !== "you") return null;
    const between = effects.slice(at + 1);
    if (!between.length || !between.every((e) => (e.type === "createToken" && e.who.ref === "you" && countsExiledTop(e.n)) || (e.type === "draw" && e.who.ref === "you" && countsExiledTop(e.n)) || (e.type === "damage" && countsExiledTop(e.amount)))) return null;
    ctx.afterExileTop = true;
    let fx: Effect[] | null;
    try {
      fx = parseOne(`${eachExiled[2]!} for each ${eachExiled[1]!} exiled this way`, ctx);
    } finally {
      ctx.afterExileTop = false;
    }
    const e = fx?.length === 1 ? fx[0] : undefined;
    if (!e) return null;
    const ok = (e.type === "draw" && e.who.ref === "you" && countsExiledTop(e.n)) || (e.type === "damage" && countsExiledTop(e.amount)) || (e.type === "createToken" && e.who.ref === "you" && countsExiledTop(e.n));
    return ok ? { effect: e, next: si + 1 } : "fail";
  }
  // Wild Research: "Search your library for an enchantment card and reveal that card. Put it into your hand, then discard a
  // card at random. Then shuffle.": the card found goes to your hand before the random discard, so it can be the one
  // discarded (CR 701.9b); one shuffle at the end (CR 701.24a), and finding nothing is allowed (CR 701.23b, rulings).
  const wild = /^Search your library for (an? [a-z]+ card) and reveal that card$/.exec(s);
  if (wild && plain(sentences[si + 1]) === "Put it into your hand" && plain(sentences[si + 2]) === "Discard a card at random" && plain(sentences[si + 3]) === "Then shuffle" && si + 4 === sentences.length && !effects.length) {
    const fx = parseOne(`Search your library for ${wild[1]!}, reveal it, put it into your hand, then shuffle`, ctx);
    const search = fx?.length === 1 ? fx[0] : undefined;
    if (search?.type !== "search" || search.dest.zone !== "hand" || !search.reveal || search.n !== 1) return "fail";
    const disc = parseOne("Discard a card at random", ctx);
    const d = disc?.length === 1 ? disc[0] : undefined;
    if (d?.type !== "discard" || !d.random) return "fail";
    effects.push({ ...search, noShuffle: true }, d);
    return { effect: { type: "shuffle", who: { ref: "you" } }, next: si + 4 };
  }
  // Moonlight Bargain: "Look at the top five cards of your library. For each card, put that card into your graveyard unless
  // you pay 2 life. Then put the rest into your hand.": a payment of 2 life for each card kept, each a payment of its own
  // (CR 119.4: only while your life total is at least 2), the others into your graveyard, the kept ones into your hand.
  const bargain = new RegExp(`^Look at the top ${NUM} cards of your library$`).exec(s);
  const unless = bargain ? /^For each card, put that card into your graveyard unless you pay (\d+) life$/.exec(plain(sentences[si + 1])) : null;
  if (bargain && unless && plain(sentences[si + 2]) === "Then put the rest into your hand") {
    const n = num(bargain[1]!);
    if (!Number.isInteger(n)) return "fail";
    return { effect: { type: "dig", n, count: n, upTo: true, into: "hand", rest: "graveyard", reveal: false, payLife: Number(unless[1]), payLifeEach: true }, next: si + 3 };
  }
  // Spreading Plague: "Whenever a creature enters, destroy all other creatures that share a color with it. They can't be
  // regenerated.": other than the creature that entered, sharing a color with it as it is, or last was, on the battlefield
  // (CR 105.2, 608.2h); a colorless one shares a color with nothing; no regeneration (CR 701.19c).
  if (/^destroy all other creatures that share a color with it$/.test(s) && ctx.subjectIt && !ctx.selfIt && !ctx.spell && !ctx.activated && !effects.length) {
    const regen = plain(sentences[si + 1]) === "They can't be regenerated";
    if (!regen || si + 2 !== sentences.length) return null;
    return { effect: { type: "destroy", what: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "other creatures that share a color with it" }, otherThanSubject: true, sharesColorWithSubject: true }, noRegen: true }, next: si + 2 };
  }
  // Mercadia's Downfall: "Each attacking creature gets +1/+0 until end of turn for each nonbasic land defending player
  // controls."; Jurin, Leading the Charge: "each creature you control attacking a player gets +1/+0 until end of turn for
  // each creature that player controls.": each attacking creature's own defending player (CR 802.2a), the player it's
  // attacking (Jurin: a player, not a planeswalker or battle), counted for each one as it resolves (CR 608.2h); the
  // attacking creatures are those attacking then (rulings).
  const perDefender = /^(Each attacking creature|[Ee]ach creature you control attacking a player) gets \+(\d+)\/\+0 until end of turn for each (.+?) (defending player|that player) controls$/.exec(s);
  if (perDefender && (perDefender[4] === "that player") === perDefender[1]!.endsWith("a player") && !effects.length && si + 1 === sentences.length) {
    const fx = parseOne(`Each attacking creature gets +${perDefender[2]!}/+0 until end of turn for each ${perDefender[3]!} you control`, ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    const m = e?.type === "continuous" && e.mods.length === 1 ? e.mods[0] : undefined;
    const pow = m?.kind === "modifyPT" && m.toughness === 0 && typeof m.power === "object" && "count" in m.power ? m.power : undefined;
    if (e?.type !== "continuous" || e.what.ref !== "each" || e.duration !== "endOfTurn" || !pow || pow.count.kind !== "permanents" || pow.count.filter.kind !== "object" || pow.count.filter.controller !== "you" || pow.count.other || pow.count.whose) return "fail";
    const { controller: _, ...filter } = pow.count.filter;
    const what = perDefender[1]!.endsWith("a player") ? { ...e.what, filter: { ...e.what.filter, controller: "you" as const, combat: "attackingOpponent" as const, text: "each creature you control attacking a player" } } : e.what;
    return { effect: { ...e, what, mods: [{ ...m!, power: { ...pow, count: { kind: "affectedDefenderPermanents", filter: { ...filter, text: perDefender[3]! } } } } as typeof m & {}] }, next: si + 1 };
  }
  // Soulgorger Orgg: "When ~ enters, you lose all but 1 life.": the life lost noted for its leaves ability (CR 607.2e).
  const allBut = /^you lose all but (\d+) life$/.exec(s);
  if (allBut && !ctx.spell && !ctx.activated && !effects.length && si + 1 === sentences.length) return { effect: { type: "loseAllBut", keep: Number(allBut[1]) }, next: si + 1 };
  return null;
}
