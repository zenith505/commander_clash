// Round 437's whole lines (compile.ts, before round 435's) and sentences (body.ts chain, before round 436's): Nathan Drake,
// Treasure Hunter's mana spent as any color for what you don't own and its paid cast from each player's top card; The
// Ur-Sphinx's free cast of a card each player milled; Pygmy Hippo's defending player drained of mana for {C} later.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parsePlayer } from "./targets";
import { parseSentence } from "./sentence";

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One whole line of round 437's (compile.ts); false when it isn't one of these. */
export function round437Line(line: string, _raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Nathan Drake, Treasure Hunter: "You may spend mana as though it were mana of any color to cast spells you don't own or to
  // activate abilities of permanents you control but don't own." (CR 609.4b): a spell whose owner isn't you as you cast it
  // (CR 108.3), and an ability of a permanent you control that someone else owns (a token's owner is the player who created
  // it, CR 111.2), mana abilities too (CR 605.1a). Colored symbols only: {C} still needs colorless mana (CR 106.1b, 107.4c).
  if (line === "You may spend mana as though it were mana of any color to cast spells you don't own or to activate abilities of permanents you control but don't own.") {
    if (isSpell) return false;
    out.spendAnyColorNotOwned = true;
    return true;
  }
  return false;
}

/** One sentence of round 437's (body.ts chain); null when it isn't one of these. */
export function round437Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  // Nathan Drake, Treasure Hunter: "Whenever ~ attacks, exile the top card of each player's library. You may cast a spell
  // from among those cards." Each player's top card, exiled face up (CR 406.3); one spell from among them, cast while this
  // resolves (CR 608.2g), its costs paid, timing ignored (as Sanwell's rulings say); a land can't be cast. The other cards
  // stay in exile, as Etali's do.
  if (/^[Ee]xile the top card of each player's library$/.test(s) && plain(sentences[si + 1]) === "You may cast a spell from among those cards") {
    if (ctx.spell) return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 1, each: true, max: 1, paid: true }, next: si + 2 };
  }
  // The Ur-Sphinx: "Whenever one or more Sphinxes you control attack, each player mills that many cards. For each player, you
  // may cast a card that player milled this way without paying its mana cost." The cards milled by the mill just before,
  // still in their owner's graveyard as that object (CR 400.7; a library's cards are its owner's, CR 400.3, so "that player
  // milled" is the card's owner): at most one of each player's, cast while this resolves (rulings: not later in the turn;
  // timing ignored; no alternative costs; mandatory additional costs paid; X is 0; CR 608.2g, 118.9, 107.3b). Lands can't be
  // cast (CR 305.1: a land is never a spell).
  if (/^[Ff]or each player, you may cast a card that player milled this way without paying its mana cost$/.test(s)) {
    const mill = effects[effects.length - 1];
    if (ctx.spell || mill?.type !== "mill" || mill.who.ref !== "eachPlayer") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, anyYard: true, onePerOwner: true, milledOnly: true }, next: si + 1 };
  }
  // Pygmy Hippo: "Whenever ~ attacks and isn't blocked, you may have defending player activate a mana ability of each land they
  // control and lose all unspent mana. If you do, ~ assigns no combat damage this turn and at the beginning of your next main
  // phase this turn, you add an amount of {C} equal to the amount of mana that player lost this way." Your choice; then that
  // player activates a mana ability of each land they control, their choice of ability and mana as with Drain Power (a tapped
  // land, or one with none they can activate, adds none, CR 605.3a), then empties their whole pool, mana that was already
  // there too (CR 106.4). "If you do": you chose to (CR 608.2c), with no land and no mana too. The amount is counted now and
  // remembered by the delayed trigger (CR 603.7c, 608.2h); your next main phase is this turn's postcombat main phase (CR
  // 505.1), whether or not ~ is still there. Assigning no combat damage isn't prevention (CR 510.1).
  if (/^[Yy]ou may have defending player activate a mana ability of each land they control and lose all unspent mana$/.test(s) && plain(sentences[si + 1]) === "If you do, ~ assigns no combat damage this turn and at the beginning of your next main phase this turn, you add an amount of {C} equal to the amount of mana that player lost this way") {
    const who = parsePlayer("defending player", ctx);
    const later = parseSentence("At the beginning of your next main phase, add {C}", ctx);
    const delayed = later?.length === 1 ? later[0] : undefined;
    const add = delayed?.type === "delayed" && delayed.effects.length === 1 ? delayed.effects[0] : undefined;
    if (ctx.spell || who?.ref !== "eventPlayer" || delayed?.type !== "delayed" || add?.type !== "addMana" || add.times !== undefined) return "fail";
    effects.push({ type: "may", effects: [{ type: "drainPower", who, lose: true }], text: "have defending player activate a mana ability of each land they control and lose all unspent mana" });
    return {
      effect: {
        type: "if",
        cond: { kind: "youDid" },
        effects: [
          { type: "noCombatDamage", what: { ref: "self" } },
          { ...delayed, effects: [{ ...add, times: { count: { kind: "eventAmount" } } }], text: "add an amount of {C} equal to the amount of mana that player lost this way", event: { amount: { count: { kind: "notedAmount" } } } },
        ],
      },
      next: si + 2,
    };
  }
  return null;
}
