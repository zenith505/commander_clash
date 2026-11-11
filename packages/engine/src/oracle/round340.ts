// Round 340's sentences, read before round 339's (round339Sentence in oracle/round339.ts, which reads these first).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { amt } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round340Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void effects;
  const line = plain(s);
  // Archmage's Newt: "target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost
  // is equal to its mana cost. That card gains flashback {0} until end of turn instead if ~ is saddled.": which one is
  // decided as the ability resolves, saddled as ~ last existed if it's gone (CR 608.2h, 702.171b); flashback {0} is a cost
  // even for a card with no mana cost, and with it X is 0 (rulings, CR 107.3b).
  const newt = /^(target instant or sorcery card in your graveyard) gains flashback with its mana cost until end of turn$/i.exec(line);
  if (newt && plain(sentences[si + 1]) === "That card gains flashback {0} until end of turn instead if ~ is saddled" && !ctx.spell) {
    const fx = parseSentence(line, ctx);
    const grant = fx?.length === 1 && fx[0]!.type === "grantFlashback" && fx[0]!.what?.ref === "target" ? fx[0]! : undefined;
    if (grant?.type !== "grantFlashback") return "fail";
    return { effect: { type: "if", cond: { kind: "state", cond: { kind: "self", is: "saddled" } }, effects: [{ ...grant, mana: "{0}" }], otherwise: [grant] }, next: si + 2 };
  }
  // Stumpsquall Hydra: "When ~ enters, distribute X +1/+1 counters among it and any number of commanders.": not targeted,
  // divided as it resolves (CR 608.2d), among ~ and any commanders on the battlefield, anyone's, creature or not (rulings).
  const stump = /^[Dd]istribute X (\+1\/\+1) counters among it and any number of commanders$/.exec(line);
  if (stump && !ctx.spell) return { effect: { type: "distribute", counter: "+1/+1", n: amt("X"), filter: { kind: "object", types: [], text: "it and commanders" }, selfAndCommanders: true }, next: si + 1 };
  return null;
}
