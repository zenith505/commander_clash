// Round 393's sentences (read first by round373Sentence): a revealed card put onto the battlefield with a counter as an
// enchantment in addition to its other types (Arbiter of the Ideal), and a permanent another player of your choice may
// gain control of (Stardew Valley). Daring Thief's exchange is in sentences/permanents.ts.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 393's, read before round 392's. */
export function round393Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Arbiter of the Ideal: "reveal the top card of your library. If it's an artifact, creature, or land card, you may put it
  // onto the battlefield with a manifestation counter on it. That permanent is an enchantment in addition to its other
  // types." The reveal isn't optional; a card not put there stays on top (rulings). It's an enchantment as it enters, so
  // constellation sees it (rulings, CR 614.12), and from then on, the counter only a reminder: removing it changes nothing
  // (rulings, CR 611.2c, 613.1d).
  const put = /^If it's an artifact, creature, or land card, you may put it onto the battlefield with an? ([a-z]+) counter on it$/.exec(plain(sentences[si + 1]));
  if (/^[Rr]eveal the top card of your library$/.test(plain(s)) && put && plain(sentences[si + 2]) === "That permanent is an enchantment in addition to its other types" && sentences.length === si + 3) {
    const filter = parseSearchFilter("artifact, creature, or land card");
    if (!filter) return "fail";
    // The reveal goes before the "if" (the caller adds one effect).
    effects.push({ type: "revealTop" });
    const counter = put[1]!;
    return {
      effect: {
        type: "if",
        cond: { kind: "revealedIs", filter },
        effects: [
          {
            type: "may",
            effects: [{ type: "putOntoBattlefield", what: { ref: "revealed" }, counters: { [counter]: 1 }, alsoMods: [{ kind: "addTypes", types: ["Enchantment"], subtypes: [] }] }],
            text: `put the revealed card onto the battlefield with a ${counter} counter on it, an enchantment in addition to its other types`,
          },
        ],
      },
      next: si + 3,
    };
  }
  // Stardew Valley: "Choose target permanent you control. Draw a card, then another player of your choice may gain control
  // of that permanent." You draw, then choose one of the other players still in the game (all of them opponents here, CR
  // 102.3, 800.4a) as it resolves (CR 608.2d), and that player decides whether they gain control of it, for the rest of the
  // game (layer 2, CR 613.1b). The target illegal as it resolves, it doesn't resolve at all (CR 608.2b): no card.
  const drew = effects[effects.length - 1];
  if (plain(s) === "Another player of your choice may gain control of that permanent" && ctx.activated && !ctx.spell && sentences.length === si + 1 && si === 2 && plain(sentences[0]) === "Choose target permanent you control" && plain(sentences[1]) === "Draw a card" && effects.length === 1 && drew?.type === "draw" && drew.who?.ref === "you" && drew.n === 1) {
    const t = ctx.targets[0];
    if (ctx.targets.length !== 1 || t?.kind !== "object" || t.controller !== "you" || t.types?.length || t.many || t.optional) return "fail";
    // The choice goes before the "may" (the caller adds one effect).
    effects.push({ type: "choose", choice: "opponent" });
    return {
      effect: {
        type: "may",
        decider: { ref: "chosenPlayer" },
        effects: [{ type: "continuous", what: { ref: "target", index: 0 }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }],
        text: "gain control of the permanent ~'s ability targets",
      },
      next: si + 1,
    };
  }
  return null;
}
