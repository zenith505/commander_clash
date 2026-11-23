// Lane B round B300's lines, read by compileCard before the generic triggers (after round B297's): Share the Spoils.
import type { CompiledCard, Effect } from "../abilities";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";

const EXILE_EACH = "When ~ enters and whenever an opponent loses the game, exile the top card of each player's library.";

const PLAY_EACH = "During each player's turn, that player may play a land or cast a spell from among cards exiled with ~, and they may spend mana as though it were mana of any color to cast that spell. When they do, exile the top card of their library.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB300Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Share the Spoils: one ability with two trigger events (CR 603.2), each exiling the top card of every library in the
  // game, face up (CR 406.3), in turn order. The cards are linked to the permanent's static ability (CR 607.2a: "cards
  // exiled with ~" are the ones its exile abilities exiled, the third ability's too). An opponent is any other player here
  // (no teams, CR 102.3); one who loses leaves with everything they own (CR 800.4a), so the trigger looks at the
  // permanents still on the battlefield, and a Share the Spoils that player owned is gone and doesn't trigger (rulings).
  if (line === EXILE_EACH) {
    const enters = isSpell ? null : parseTrigger("When ~ enters, draw a card.");
    const loses = isSpell ? null : parseTrigger("Whenever another player loses the game, draw a card.");
    if (!enters || enters === "fail" || enters.event !== "selfEnters" || !loses || loses === "fail" || loses.event !== "anotherPlayerLosesGame") return fail();
    const body = () => ({ targets: [], effects: [{ type: "exileTop", who: { ref: "eachPlayer" }, n: 1, linked: true }] as Effect[], text: "exile the top card of each player's library." });
    out.triggers.push({ ...enters, body: body() }, { ...loses, body: body() });
    return true;
  }
  // Its static ability (CR 604.1) lets each player, during their own turn, play one card from among those cards, whoever
  // owns it: a land as their land play or a spell with the usual timing (rulings), mana spent on the spell as though it
  // were mana of any color (CR 609.4b). One land or one spell each turn for this object (rulings; TurnLog.eachTurnLinked),
  // only while it's on the battlefield as that object (CR 400.7, rulings). "When they do" is a triggered ability of the
  // permanent's (CR 603.2): the card played with that permission (cast as a spell, CR 601.2i, or played as a land, CR
  // 305.1), its player's top card exiled, linked like the others.
  if (line === PLAY_EACH) {
    const t = isSpell ? null : parseTrigger("Whenever a player casts a spell, that player exiles the top card of their library.");
    const land = parseTargetPhrase("land");
    const ex = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.by !== "any" || t.cast.orCopy || t.ifCond || t.cast.from || ex?.type !== "exileTop" || ex.who.ref !== "eventPlayer" || land?.kind !== "object" || out.playLinkedEachTurn) return fail();
    out.playLinkedEachTurn = true;
    out.triggers.push({ ...t, cast: { ...t.cast, orPlaysLand: { ...land, text: "land" }, viaEachTurnLinked: true }, body: { targets: [], effects: [{ ...ex, linked: true }], text: "exile the top card of their library." } });
    return true;
  }
  return false;
}
