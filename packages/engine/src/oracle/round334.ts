// Round 334's sentences, read before round 333's (round333Sentence in oracle/round333.ts).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { QUOTED_SOURCE_NAME } from "./compile";
import { pickFilter } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round334Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void effects;
  const line = plain(s);
  // Cosmium Catalyst: "Choose an exiled card used to craft ~ at random. You may cast that card without paying its mana
  // cost.": one of the cards its craft cost exiled, still in exile (CR 702.167c), chosen at random as this resolves; cast
  // then or never, its timing ignored, X as 0, no alternative costs (rulings, CR 608.2g).
  if (/^[Cc]hoose an exiled card used to craft ~ at random$/.test(line)) {
    if (plain(sentences[si + 1]) !== "You may cast that card without paying its mana cost" || ctx.spell) return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, fromLinked: true, randomOne: true, max: 1, crafted: true }, next: si + 2 };
  }
  // Dire Blunderbuss's granted "you may sacrifice an artifact other than Dire Blunderbuss": any artifact its controller
  // controls but the Equipment that gave the ability (bound to it, grants.ts), the creature itself if it's one.
  const other = new RegExp(`^(you may )?sacrifice an? (artifact|creature|permanent) other than ${QUOTED_SOURCE_NAME}$`).exec(line);
  if (other) {
    const filter = pickFilter(other[2]!);
    if (!filter || filter.kind !== "object") return "fail";
    const pick: Effect = { type: "pick", who: { ref: "you" }, filter: { ...filter, text: `${other[2]} other than ${QUOTED_SOURCE_NAME}`, notGrantSource: { ref: "grantSource" } }, n: 1, action: "sacrifice" };
    return { effect: other[1] ? { type: "may", effects: [pick], text: line.replace(/^you may /, "") } : pick, next: si + 1 };
  }
  // The Grim Captain: "Then you may put an exiled creature card used to craft ~ onto the battlefield under your control
  // tapped and attacking.": one of the creature cards its craft cost exiled (CR 702.167c), attacking whom its controller
  // chooses (CR 508.4; rulings), never declared as an attacker.
  if (/^(?:Then )?[Yy]ou may put an exiled creature card used to craft ~ onto the battlefield under your control tapped and attacking$/.test(line)) {
    if (ctx.spell) return "fail";
    const filter = { kind: "card" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
    return { effect: { type: "may", effects: [{ type: "moveLinked", dest: "battlefield", one: true, filter, attacking: true }], text: line.replace(/^(?:Then )?[Yy]ou may /, "") }, next: si + 1 };
  }
  return null;
}
