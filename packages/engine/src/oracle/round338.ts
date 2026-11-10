// Round 338's sentences, read before round 337's (round337Sentence in oracle/round337.ts, which reads these first).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseUnlessPays } from "./body";
import { parseSearchFilter } from "./search";
import { parseSentence } from "./sentence";
import { parsePlayer } from "./targets";
import { num } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round338Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  // Overencumbered: "At the beginning of combat on enchanted opponent's turn, that player may pay {1} for each artifact they
  // control. If they don't, creatures can't attack this combat.": that player's choice, the amount counted as it's offered
  // (CR 608.2h; paying {0} is allowed, CR 118.5); not paying makes a rule for this combat only, so a creature that arrives
  // later can't attack either (CR 611.2c, 508.1c).
  const tax = /^that player may pay \{(\d+)\} for each ([a-z]+) they control$/.exec(line);
  if (tax && ctx.eventPlayer && plain(sentences[si + 1]) === "If they don't, creatures can't attack this combat") {
    const pay = parseUnlessPays(`{${tax[1]}} for each ${tax[2]} that player controls`, ctx);
    if (!pay?.generic || typeof pay.generic === "number") return "fail";
    return {
      effect: { type: "punisher", who: { ref: "eventPlayer" }, options: [{ pay }], effects: [{ type: "cantAttackRule", filter: { kind: "object", types: ["Creature"], text: "creatures" }, combat: true }], penalty: "Creatures can't attack this combat" },
      next: si + 2,
    };
  }
  // Overencumbered: "When this Aura enters, enchanted opponent creates a Clue token, a Food token, and a Junk token.": each of
  // them, that player's, all at the same time (CR 608.2f, 111.2).
  const creates = /^(enchanted opponent|enchanted player) creates (an? [A-Z][a-z]+ token, .+ token)$/.exec(line);
  if (creates) {
    const who = parsePlayer(creates[1]!, ctx);
    const fx = parseSentence(`Create ${creates[2]}`, ctx);
    const each = fx?.length === 1 && fx[0]!.type === "together" ? fx[0]!.effects : undefined;
    if (!who || !each?.length || each.some((x) => x.type !== "createToken" || x.who.ref !== "you" || x.attachTo || x.tapped || x.attacking)) return "fail";
    return { effect: { type: "together", effects: each.map((x) => ({ ...x, who }) as Effect) }, next: si + 1 };
  }
  // Whiskervale Forerunner: "look at the top five cards of your library. You may reveal a creature card with mana value 3 or
  // less from among them. You may put it onto the battlefield if it's your turn. If you don't put it onto the battlefield, put
  // it into your hand. Put the rest on the bottom of your library in a random order.": the card revealed goes onto the
  // battlefield or into the hand, the choice there only during your turn, as it resolves (as Break Out's).
  const look = /^[Ll]ook at the top (one|two|three|four|five|six|seven|eight|nine|ten) cards of your library$/.exec(line);
  const reveal = look ? /^You may reveal an? ([a-z]+ card(?: with mana value \d+ or less)?) from among them$/.exec(plain(sentences[si + 1])) : null;
  if (look && reveal && plain(sentences[si + 2]) === "You may put it onto the battlefield if it's your turn" && plain(sentences[si + 3]) === "If you don't put it onto the battlefield, put it into your hand" && plain(sentences[si + 4]) === "Put the rest on the bottom of your library in a random order") {
    const filter = parseSearchFilter(reveal[1]!);
    if (!filter || effects.length) return "fail";
    return { effect: { type: "dig", n: num(look[1]!), reveal: true, count: 1, upTo: true, filter, into: "battlefield", orHand: true, orHandIf: { kind: "yourTurn" }, rest: "bottom", random: true }, next: si + 5 };
  }
  return null;
}
