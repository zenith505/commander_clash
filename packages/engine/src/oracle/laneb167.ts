// Lane B round B167's sentences, read first in parseBodyText's round chain (parseBodyText is at TS2563's limit).
import type { Effect } from "../abilities";
import { parseOne, type Ctx } from "./body";
import { NUM, num } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

export function roundB167Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Tatsumasa, the Dragon's Fang: "{6}, Exile ~: Create a 5/5 blue Dragon Spirit creature token with flying. Return ~ to
  // the battlefield under its owner's control when that token dies." A delayed trigger for that token (CR 603.7c, 400.7),
  // about the card the ability's cost exiled, which its effects can find (CR 400.7j), only while it's still that card in
  // exile; under its owner's control, whoever controlled the ability.
  if (s === "Return ~ to the battlefield under its owner's control when that token dies" && ctx.activated && !ctx.spell) {
    const made = effects[effects.length - 1];
    if (made?.type !== "createToken" || made.n !== 1 || (made.who && made.who.ref !== "you")) return "fail";
    return { effect: { type: "delayed", when: "dies", of: { ref: "created" }, withSource: true, effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard", exiledAsCost: true }, owner: true }], text: "return ~ to the battlefield under its owner's control" }, next: si + 1 };
  }
  // Fiend of the Shadows: "that player exiles a card from their hand. You may play that card for as long as it remains
  // exiled.": that player chooses the card; you may play it (cast it or play it as a land, not discard or cycle it) with
  // its usual timing and costs, even once ~ has left the battlefield or changed controllers (rulings).
  if (/^that player exiles a card from their hand$/.test(s) && (sentences[si + 1] ?? "").replace(/\.$/, "") === "You may play that card for as long as it remains exiled" && !ctx.spell) {
    const fx = parseOne(s, ctx);
    const d = fx?.length === 1 ? fx[0] : undefined;
    if (d?.type !== "discard" || !d.exile || d.ownerMay || d.until || d.linked || d.random || d.hand || d.filter) return "fail";
    return { effect: { ...d, controllerMay: true }, next: si + 2 };
  }
  // Ancestral Knowledge: "look at the top ten cards of your library, then exile any number of them and put the rest back
  // on top of your library in any order": not a surveil (CR 701.25a), so nothing that triggers on surveilling does; fewer
  // cards in the library, all of them (CR 401.4).
  // (", then" splits it into two sentences.)
  const exileTop = new RegExp(`^[Ll]ook at the top ${NUM} cards of your library$`).exec(s);
  if (exileTop && (sentences[si + 1] ?? "").replace(/\.$/, "") === "Exile any number of them and put the rest back on top of your library in any order")
    return Number.isInteger(num(exileTop[1]!)) ? { effect: { type: "exileAnyOfTop", n: num(exileTop[1]!) }, next: si + 2 } : "fail";
  return null;
}
