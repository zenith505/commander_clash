// Round 383's whole lines: a reflexive trigger for each card drawn while a spell resolves (Explosion of Riches) and a
// council's dilemma searching and returning once for each vote (Travel Through Caradhras).
import type { Amount, CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";

const EXPLOSION = "Draw a card, then each other player may draw a card. Whenever a card is drawn this way, ~ deals 5 damage to target opponent chosen at random from among your opponents.";
const CARADHRAS = "Starting with you, each player votes for Redhorn Pass or Mines of Moria. For each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped. If you search your library this way, shuffle. For each Mines of Moria vote, return a card from your graveyard to your hand.";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** A whole line of round 383's (compile.ts, after round 382's). */
export function round383Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Explosion of Riches (rulings): no target as it's cast. As it resolves, you draw a card, then each other player in turn
  // order chooses whether to draw a card, then each who chose to does (Effect eachMay `each`); with no teams, every other
  // player is an opponent (CR 102.3). Then its reflexive ability
  // triggers once for each card drawn while it resolved (CR 603.12; a draw replaced draws nothing, CR 614.6), and each
  // goes on the stack with its target opponent chosen at random among the legal ones (TargetSpec.random).
  if (line === EXPLOSION) {
    if (!isSpell || out.spell) return fail(out, raw);
    const hit = parseBody("~ deals 5 damage to target opponent.", {});
    const t = hit?.targets[0];
    if (!hit || hit.targets.length !== 1 || t?.kind !== "player" || !t.opponent || hit.effects.length !== 1 || hit.effects[0]!.type !== "damage") return fail(out, raw);
    out.spell = {
      targets: [],
      effects: [
        { type: "draw", who: { ref: "you" }, n: 1 },
        { type: "eachMay", who: { ref: "eachOpponent" }, effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "draw a card", each: true },
        { type: "reflexive", perDrawn: true, body: { ...hit, targets: [{ ...t, random: true, text: "target opponent chosen at random" }], text: "Explosion of Riches deals 5 damage to target opponent chosen at random from among your opponents." } },
      ],
      text: line,
    };
    return true;
  }
  // Travel Through Caradhras: every player votes, starting with you, for one of the two (CR 701.38a; no abstaining,
  // rulings). One search for each Redhorn Pass vote, each finding up to one basic land card (CR 701.23b), all of them one
  // search for that many, onto the battlefield tapped; with no such vote there's no search and no shuffle. Then a card
  // from your graveyard to your hand for each Mines of Moria vote, each chosen as it's returned (not targeted).
  if (line === CARADHRAS || line === `Council's dilemma — ${CARADHRAS}`) {
    if (!isSpell || out.spell) return fail(out, raw);
    const vote = parseBody("Starting with you, each player votes for Redhorn Pass or Mines of Moria.", { spell: true });
    const search = parseBody("Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.", { spell: true });
    const back = parseBody("Return two cards from your graveyard to your hand.", { spell: true });
    const v = vote?.effects[0];
    const se = search?.effects[0];
    const be = back?.effects[0];
    if (vote?.effects.length !== 1 || v?.type !== "vote" || v.options?.join("|") !== "Redhorn Pass|Mines of Moria" || search?.effects.length !== 1 || se?.type !== "search" || !se.upTo || back?.effects.length !== 1 || be?.type !== "chooseFromGraveyard" || Object.keys(be).some((k) => k !== "type" && k !== "n")) return fail(out, raw);
    const votes = (option: string): Amount => ({ count: { kind: "votes", option } });
    const effects: Effect[] = [
      v,
      { type: "if", cond: { kind: "amountNow", amount: votes("Redhorn Pass"), min: 1 }, effects: [{ ...se, n: votes("Redhorn Pass") }] },
      { type: "if", cond: { kind: "amountNow", amount: votes("Mines of Moria"), min: 1 }, effects: [{ type: "chooseFromGraveyard", n: 0, nAmount: votes("Mines of Moria") }] },
    ];
    out.spell = { targets: [], effects, text: line };
    return true;
  }
  return false;
}
