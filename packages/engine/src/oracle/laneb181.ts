// Lane B round B181's sentences, read at the end of round B180's.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { LAND_TYPES } from "../keywords";
import { isGroup } from "./words";
import { parseObject } from "./targets";
import { parseSearchFilter } from "./search";

type Found = { effect: Effect; next: number } | "fail" | null;

export function roundB181Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Cosmium Confluence, after "Put three +1/+1 counters on a Cave you control": "It becomes a 0/0 Elemental creature with
  // haste. It's still a land.": the Cave chosen as it resolves (rulings: not a target), for the rest of the game (CR
  // 611.2a), its land types kept (CR 205.1b); no Cave chosen, nothing.
  if (s === "It becomes a 0/0 Elemental creature with haste" && (sentences[si + 1] ?? "").replace(/\.$/, "") === "It's still a land") {
    const last = effects[effects.length - 1];
    const land = last?.type === "pick" && last.action === "counters" && last.n === 1 && last.who.ref === "you" && !last.upTo && (last.filter.types?.includes("Land") || (!!last.filter.subtypes?.length && last.filter.subtypes.every((t) => LAND_TYPES.has(t))));
    // Anything else (Titania, Gaea Incarnate's target land) is read elsewhere.
    if (!land || !ctx.spell) return null;
    return { effect: { type: "continuous", what: { ref: "created" }, mods: [{ kind: "addTypes", types: ["Creature"], subtypes: ["Elemental"] }, { kind: "setPT", power: 0, toughness: 0 }, { kind: "addKeywords", keywords: ["Haste"] }], duration: "game" }, next: si + 2 };
  }
  // Silver Surfer, Galactus's Herald, in "Whenever ~ deals combat damage to a player": "until the end of your next turn,
  // target creature attacks that player each combat if able": that player, not a planeswalker of theirs (as Dulcet
  // Sirens'), each combat until your next turn ends (CR 508.1d); a creature that player controls can't attack them, so it
  // asks nothing of it.
  if (/^[Uu]ntil the end of your next turn, target creature attacks that player each combat if able$/.test(s)) {
    if (!ctx.eventPlayer || ctx.spell || effects.length) return null;
    const what = parseObject("target creature", ctx);
    if (!what || isGroup(what) || what.ref !== "target") return null;
    return { effect: { type: "continuous", what, mods: [{ kind: "mustAttackPlayer", player: "eventPlayer" }], duration: "endOfYourNextTurn" }, next: si + 1 };
  }
  // The Five Doctors: "Search your library and/or graveyard for up to five Doctor cards, reveal them, and put them into
  // your hand. If you search your library this way, shuffle. If ~ was kicked, put those cards onto the battlefield instead
  // of putting them into your hand.": up to five in all from either zone (CR 701.23), the library too or not, chosen as it
  // resolves (search.orGraveyard); a card with the Doctor creature type, not the word in its name (rulings); kicked, one
  // search that puts them onto the battlefield instead (CR 702.33d).
  const doctors = /^Search your library and\/or graveyard for up to (two|three|four|five) ([A-Z][a-z]+) cards, reveal them, and put them into your hand$/.exec(s);
  if (doctors) {
    const n = { two: 2, three: 3, four: 4, five: 5 }[doctors[1]!]!;
    const filter = parseSearchFilter(`${doctors[2]} card`);
    const plain = (i: number) => (sentences[si + i] ?? "").replace(/\.$/, "");
    if (!filter || !ctx.spell || plain(1) !== "If you search your library this way, shuffle" || plain(2) !== "If ~ was kicked, put those cards onto the battlefield instead of putting them into your hand") return null;
    const search = (zone: "hand" | "battlefield"): Effect => ({ type: "search", filter, n, upTo: true, reveal: true, dest: { zone }, orGraveyard: true });
    return { effect: { type: "if", cond: { kind: "kicked" }, effects: [search("battlefield")], otherwise: [search("hand")] }, next: si + 3 };
  }
  return null;
}
