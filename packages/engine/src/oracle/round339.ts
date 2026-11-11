// Round 339's sentences, read before round 338's (round338Sentence in oracle/round338.ts, which reads these first).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseBody } from "./body";
import { pickFilter } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round339Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void effects;
  const line = plain(s);
  // Kadena's Silencer: "When this creature is turned face up, counter all abilities your opponents control.": each activated
  // and triggered ability an opponent controls already on the stack as it resolves, not spells, nor any activated or
  // triggered later (rulings; CR 701.6b; mana abilities never use the stack, CR 605.3a).
  if (/^[Cc]ounter all abilities your opponents control$/.test(line) && !ctx.spell) return { effect: { type: "counterOpponentsStack", abilitiesOnly: true }, next: si + 1 };
  // Reservoir Kraken: "any opponent may tap an untapped creature they control. If they do, tap ~ and create a 1/1 blue Fish
  // creature token with "~ can't be blocked."": each opponent in turn order may tap one, even after another has (rulings);
  // then, if any did, the instructions happen once (one Fish however many were tapped, rulings). Tapping it isn't a cost,
  // so a creature with summoning sickness can be tapped (CR 302.6 is about {T} costs only).
  const tapAny = /^[Aa]ny (opponent|player) may tap an (untapped (?:creature|artifact|land|permanent)) they control$/.exec(line);
  const tapThen = tapAny ? /^If they do, (.+)$/.exec(plain(sentences[si + 1])) : null;
  if (tapAny && tapThen) {
    const filter = pickFilter(tapAny[2]!);
    const body = parseBody(`${tapThen[1]!.charAt(0).toUpperCase()}${tapThen[1]!.slice(1)}.`, { selfIt: true });
    if (filter?.kind !== "object" || !body || body.targets.length || !body.effects.length) return "fail";
    return { effect: { type: "punisher", who: { ref: tapAny[1] === "player" ? "eachPlayer" : "eachOpponent" }, options: [{ tap: { ...filter, text: `${tapAny[2]!} you control` } }], effects: body.effects, mode: "ifAny", thenText: tapThen[1]! }, next: si + 2 };
  }
  return null;
}
