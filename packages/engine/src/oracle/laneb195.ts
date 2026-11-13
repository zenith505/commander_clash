// Lane B round B195's sentences, read at the end of round B194's chain, and its whole spells, read after round B194's.
import type { AbilityBody, Effect } from "../abilities";
import { parseBody, parseOne, type Ctx } from "./body";
import { parseObject } from "./targets";
import { X } from "./words";
import { roundB196Sentence, roundB196Spell } from "./laneb196";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** Round B195's sentences, read at the end of round B194's chain. */
export function roundB195Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Roving Actuator: "exile up to one target instant or sorcery card with mana value 2 or less from your graveyard. Copy
  // it. You may cast the copy without paying its mana cost.": the copy made in exile and cast as this resolves or never
  // (rulings, CR 608.2g, 707.12), X as 0 (CR 107.3b); a card with {X} counts X as 0 for the target's mana value (CR
  // 202.3e, rulings). The card stays exiled either way.
  const freeCopy = /^[Ee]xile ((?:up to one )?target instant or sorcery card with mana value \d+ or less from your graveyard)$/.exec(s);
  if (freeCopy && plain(sentences[si + 1]) === "Copy it" && plain(sentences[si + 2]) === "You may cast the copy without paying its mana cost" && sentences.length === si + 3) {
    const what = parseObject(freeCopy[1]!, ctx, true);
    if (what?.ref !== "target") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: what.index } }, next: si + 3 };
  }
  // Unyielding Gatekeeper: "exile another target nonland permanent. If you controlled it, return it to the battlefield
  // tapped. Otherwise, its controller creates a 2/2 white and blue Detective creature token.": whether you controlled it as
  // it last existed on the battlefield, as this resolves (rulings, CR 608.2h); then it returns under your control (CR
  // 110.2a, rulings: whoever owns it), or the player who controlled it as it was exiled creates the token (rulings).
  if (plain(s) === "If you controlled it, return it to the battlefield tapped" && /^Otherwise, (its controller creates .+? token)\.?$/.test(sentences[si + 1] ?? "") && sentences.length === si + 2) {
    const prev = _effects[_effects.length - 1];
    const i = ctx.lastObjectTarget;
    if (prev?.type !== "exile" || prev.what.ref !== "target" || i === undefined || prev.what.index !== i || i !== ctx.targets.length - 1 || ctx.targets[i]?.kind !== "object" || ctx.targets[i]!.many) return "fail";
    // Checked before the exile, which is the same thing: you control it as this begins to resolve or you don't (rulings);
    // yours, it's exiled and returned (a flicker, CR 610.3c); not yours, it's exiled and then its controller as it last
    // existed creates the token.
    const token = parseOne(capital(/^Otherwise, (.+?)\.?$/.exec(sentences[si + 1]!)![1]!), ctx);
    if (token?.length !== 1 || token[0]!.type !== "createToken" || token[0]!.who.ref !== "targetController" || ctx.targets.length !== i + 1) return "fail";
    _effects.pop();
    return { effect: { type: "if", cond: { kind: "targetWasYours", index: i }, effects: [{ type: "flicker", what: prev.what, under: "you", tapped: true }], otherwise: [prev, ...token] }, next: si + 2 };
  }
  return roundB196Sentence(s, sentences, si, ctx, _effects);
}

const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** A whole spell's text read at once; undefined when it isn't one of these, null when it is but fails. */
export function roundB195Spell(text: string): AbilityBody | null | undefined {
  // Discover the Impossible: "Look at the top five cards of your library. Exile one of them face down and put the rest on
  // the bottom of your library in a random order. You may cast the exiled card without paying its mana cost if it's an
  // instant spell with mana value 2 or less. If you don't, put that card into your hand.": one card must be exiled (CR
  // 406.3: only you may look at it); it's cast as this resolves or not at all (CR 608.2g), and only as an instant spell
  // with mana value 2 or less, the spell it would be (a split card's half, an Adventure, a back face: rulings), X as 0
  // (CR 107.3b). Not cast, it goes into your hand.
  const discover = /^Look at the top (\w+) cards of your library\. Exile one of them face down and put the rest on the bottom of your library in a random order\. You may cast the exiled card without paying its mana cost if it's an (instant|sorcery) spell with mana value (\d+) or less\. If you don't, put that card into your hand\.$/.exec(text);
  if (discover) {
    const n = NUM[discover[1]!];
    if (!n) return null;
    const type = discover[2] === "instant" ? "Instant" : "Sorcery";
    return { targets: [], effects: [{ type: "exileFaceDown", from: "top", n, look: true, pickOne: true, bottomRandom: true, castOrHand: { types: [type], maxMv: Number(discover[3]) } }], text };
  }
  // Abuelo's Awakening: "Return target artifact or non-Aura enchantment card from your graveyard to the battlefield with X
  // additional +1/+1 counters on it. It's a 1/1 Spirit creature with flying in addition to its other types.": it enters
  // with the X counters (CR 614.1c, 122.6), X as the spell was cast (CR 107.3a, 0 if cast without paying its mana cost),
  // and is a 1/1 (layer 7b) Spirit creature (layer 4) with flying (layer 6) from then on (CR 611.2c, 613.1).
  const abuelo = /^(Return target .+? card from your graveyard to the battlefield) with X additional \+1\/\+1 counters on it\. (It's an? \d+\/\d+ [A-Z][a-z]+ creature with flying in addition to its other types\.)$/.exec(text);
  if (abuelo) {
    const body = parseBody(`${abuelo[1]} with an additional +1/+1 counter on it. ${abuelo[2]}`, { spell: true });
    const put = body?.effects.length === 1 ? body.effects[0] : undefined;
    if (!body || body.targets.length !== 1 || put?.type !== "putOntoBattlefield" || put.counters?.["+1/+1"] !== 1 || Object.keys(put.counters).length !== 1 || !put.alsoMods?.length) return null;
    const { counters: _one, ...rest } = put;
    return { ...body, effects: [{ ...rest, countersAmount: { kind: "+1/+1", n: X } }], text };
  }
  return roundB196Spell(text);
}

const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
