// Round 436's sentences (body.ts chain, before round 435's): Esper Terra's chapters, "If it's a Saga, put up to three lore
// counters on it" after a token copy and "Add {W}{W}, {U}{U}, {B}{B}, {R}{R}, and {G}{G}"; The Day of the Doctor's,
// exiling until a legendary card played while the Saga remains, and up to three Doctors kept from an optional exile.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { CREATURE_TYPES } from "../keywords";
import { parseSentence } from "./sentence";

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");
const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** One sentence of round 436's (body.ts chain); null when it isn't one of these. */
export function round436Sentence(s: string, _sentences: string[], _si: number, ctx: Ctx, effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  // Esper Terra: "Create a token that's a copy of target nonlegendary enchantment you control. It gains haste. If it's a
  // Saga, put up to three lore counters on it." "It" is the token just created (CR 111.1); whether it's a Saga is checked
  // as it now is on the battlefield, a copy of what it copied (CR 707.2). "Up to three" is a number from 0 to 3 chosen as
  // the ability resolves (CR 608.2d), all put at once (CR 122.6). Each chapter whose number the lore counters reach from
  // below triggers (CR 714.2b-c, 714.3c), even several at once; with as many lore counters as its final chapter's number,
  // the token is sacrificed once none of its chapter abilities is on the stack (CR 714.4).
  const loreUpTo = /^If it's a Saga, put up to (one|two|three|four|five) lore counters on it$/.exec(s);
  if (loreUpTo) {
    const made = effects.filter((e) => e.type === "createTokenCopy" || e.type === "createToken");
    const copy = made.length === 1 && made[0]!.type === "createTokenCopy" ? made[0] : undefined;
    if (!copy || copy.n !== 1 || copy.each) return "fail";
    const max = NUMBERS[loreUpTo[1]!]!;
    return {
      effect: {
        type: "if",
        cond: { kind: "state", cond: { kind: "subjectType", subtype: "Saga" }, subject: { ref: "created" } },
        effects: [
          { type: "choose", choice: "number", range: { min: 0, max }, prompt: `put how many lore counters on the token (0 to ${max})?` },
          { type: "counters", what: { ref: "created" }, counter: "lore", n: { count: { kind: "chosenNumber" } } },
        ],
      },
      next: _si + 1,
    };
  }
  // Esper Terra's chapter IV: "Add {W}{W}, {U}{U}, {B}{B}, {R}{R}, and {G}{G}.": all of that mana at once (CR 106.4), the
  // same as one run of the symbols. Not a mana ability, as a chapter ability (CR 605.5a; rulings).
  const list = /^Add ((?:\{[WUBRGC]\})+(?:, (?:\{[WUBRGC]\})+)+), and ((?:\{[WUBRGC]\})+)$/.exec(s);
  if (list) {
    const fx = parseSentence(`Add ${list[1]!.replaceAll(", ", "")}${list[2]!}`, ctx);
    return fx?.length === 1 && fx[0]!.type === "addMana" ? { effect: fx[0]!, next: _si + 1 } : "fail";
  }
  // The Day of the Doctor, chapters I-III: "Exile cards from the top of your library until you exile a legendary card. You
  // may play that card for as long as ~ remains on the battlefield. Put the rest of those exiled cards on the bottom of your
  // library in a random order." One at a time (rulings on Laelia), a legendary card of any type stopping it (CR 205.4d), a
  // land too, played only with a land play available (CR 305.2); the permission lasts while this Saga is this object (CR
  // 611.2b, 400.7). With no legendary card, every card is exiled and all go to the bottom.
  if (/^[Ee]xile cards from the top of your library until you exile a legendary card$/.test(s) && plain(_sentences[_si + 1]) === "You may play that card for as long as ~ remains on the battlefield" && plain(_sentences[_si + 2]) === "Put the rest of those exiled cards on the bottom of your library in a random order") {
    if (ctx.spell) return "fail";
    return { effect: { type: "exileUntilNonland", untilLegendary: true, then: "playWhileSource", restBottom: true }, next: _si + 3 };
  }
  // The Day of the Doctor, chapter IV: "Choose up to three Doctors. You may exile all other creatures. If you do, ~ deals 13
  // damage to you." Any player's Doctors (a creature type, CR 205.3m), chosen as it resolves, not targeted (CR 608.2d); then
  // the exile is optional even with no Doctors chosen, and then every creature goes (rulings). "If you do": you chose to
  // (CR 608.2c), and the Saga deals the damage, as it last existed if it's gone (CR 608.2h).
  const doctors = /^Choose up to (one|two|three|four|five) ([A-Z][a-z]+)s$/.exec(s);
  if (doctors && plain(_sentences[_si + 1]) === "You may exile all other creatures" && /^If you do, ~ deals \d+ damage to you$/.test(plain(_sentences[_si + 2]))) {
    if (ctx.spell || effects.length || !CREATURE_TYPES.has(doctors[2]!)) return "fail";
    const dmg = parseSentence(plain(_sentences[_si + 2]).replace(/^If you do, /, ""), ctx);
    if (dmg?.length !== 1 || dmg[0]!.type !== "damage") return "fail";
    const n = NUMBERS[doctors[1]!]!;
    const kind = doctors[2]!;
    const creature = { kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], text: "all other creatures" };
    effects.push(
      { type: "pick", who: { ref: "you" }, filter: { kind: "object", types: [], subtypes: [kind], notTypes: [], notColors: [], text: kind }, n, upTo: true, action: "choose", anyController: true, prompt: `click up to ${doctors[1]} ${kind}s (anyone's), then choose them: you may then exile all other creatures` },
      { type: "may", effects: [{ type: "exile", what: { ref: "each", filter: creature, notCreated: true } }], text: "exile all other creatures" },
    );
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: dmg }, next: _si + 3 };
  }
  return null;
}
