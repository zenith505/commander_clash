// Round 411's whole lines (compile.ts): Guff Rewrites History (a target for each player, shuffled away, then each of
// those players exiles until a nonland card and may cast it) and Mysterious Stranger (a target in each graveyard with an
// instant or sorcery card, then a copy of one of them at random).
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const GUFF =
  "For each player, choose target nonenchantment, nonland permanent that player controls. Those permanents' owners shuffle them into their libraries. Each player who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest on the bottom of their library in a random order. Each player may cast the nonland card they exiled without paying its mana cost.";
const STRANGER =
  "When ~ enters, for each graveyard with an instant or sorcery card in it, exile target instant or sorcery card from that graveyard. If two or more cards are exiled this way, choose one of them at random and copy it. You may cast the copy without paying its mana cost.";

/** One whole line of round 411's (compile.ts); false when it isn't one of these. */
export function round411Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Guff Rewrites History: "For each player, choose target ... that player controls": one target for each player, its
  // caster first (CR 601.2c, 102.2), each required, the same text as Vaevictis Asmadi, the Dire's, whose rulings say a
  // player who controls nothing it could target leaves it without enough legal targets: so it can't be cast then (CR
  // 601.2c), and if any of them is illegal as it resolves, only that one isn't affected (CR 608.2b). The rest is
  // effects/run-round411.ts.
  if (line === GUFF) {
    const body = isSpell && !out.spell ? parseBody("Exile target nonenchantment, nonland permanent.", { spell: true }) : null;
    const spec = body?.targets.length === 1 ? body.targets[0] : undefined;
    if (!body || spec?.kind !== "object" || spec.controller || body.effects.length !== 1) return fail(out, raw);
    out.spell = {
      targets: [{ ...spec, perOpponent: true, perPlayer: true, perOpponentRequired: true, perPlayerAll: true, text: "target nonenchantment, nonland permanent that player controls" }],
      effects: [{ type: "guffRewrite", what: { ref: "target", index: 0 } }],
      text: line,
    };
    return true;
  }
  // Mysterious Stranger: "for each graveyard with an instant or sorcery card in it, exile target instant or sorcery card
  // from that graveyard": one target in each such graveyard as the trigger is put on the stack, the controller's first
  // (CR 603.3d, 601.2c), required for each graveyard that has one and none for one that doesn't (TargetSpec
  // perOpponentRequired, as Sylvan Primordial's). Then the cards this exiled (each still a legal target, CR 608.2b): with
  // two or more, one chosen at random is copied and the copy may be cast as it resolves, or never, for free (rulings, CR
  // 707.12, 118.9: X is 0, no alternative costs); a copy not cast ceases to exist (CR 707.10a, 704.5d). The exiled cards
  // stay exiled.
  if (line === STRANGER) {
    const t = isSpell ? null : parseTrigger("When ~ enters, exile target instant or sorcery card from a graveyard.");
    const spec = t && t !== "fail" && t.body.targets.length === 1 ? t.body.targets[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || spec?.kind !== "card" || spec.owner || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "exile") return fail(out, raw);
    out.triggers.push({
      ...t,
      body: {
        targets: [{ ...spec, perOpponent: true, perPlayer: true, perOpponentRequired: true, text: "target instant or sorcery card from that player's graveyard" }],
        effects: [{ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: 0, many: true, randomOfAtLeast: 2 } }],
        text: line.slice("When ~ enters, ".length),
      },
    });
    return true;
  }
  return false;
}
