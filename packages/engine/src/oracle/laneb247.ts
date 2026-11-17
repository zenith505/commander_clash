// Lane B round B247's lines, read by compileCard before its triggers and activated abilities (after round B246's).
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB247Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Urgent Necropsy: "As an additional cost to cast this spell, collect evidence X, where X is the total mana value of the
  // permanents this spell targets.": not a "you may", so it's always paid (CR 601.2b, 701.59a); X is the sum of the mana
  // values of the permanents it targets (each permanent once, however many of its targets it is), worked out once the
  // targets are chosen and locked in before costs are paid (CR 601.2c, 601.2f, rulings); with no targets, X is 0 and no
  // cards are exiled (CR 701.59a). See castSpell's evidence and evidenceCastProblem.
  if (line === "As an additional cost to cast ~, collect evidence X, where X is the total mana value of the permanents ~ targets.") {
    if (!isSpell || out.evidence !== undefined) out.unsupported.push(raw);
    else out.evidenceTargetsMv = true;
    return true;
  }
  if (isSpell) return false;
  // Expert-Level Safe: "{1}, {T}: You and target opponent each secretly choose 1, 2, or 3. Then those choices are revealed. If
  // they match, sacrifice ~ and put all cards exiled with it into their owners' hands. Otherwise, exile the top card of your
  // library face down.": the two numbers chosen secretly and revealed at once (rulings; Effect secretNumbers "match"), then
  // the sacrifice and the cards exiled with ~ (by its enters trigger and this ability, CR 607.2a, put into their owners'
  // hands even after ~ has left, CR 607.2a) or one more card exiled face down, which nobody may look at (rulings, CR 406.3).
  const safe = /^(\{[^:]+): You and target opponent each secretly choose 1, 2, or 3\. Then those choices are revealed\. If they match, sacrifice ~ and put all cards exiled with it into their owners' hands\. Otherwise, exile the top card of your library face down\.$/.exec(line);
  if (safe) {
    const opp = parseActivated(`${safe[1]}: Target opponent draws a card.`);
    const match = parseActivated(`${safe[1]}: Sacrifice ~. Put all cards exiled with ~ into their owners' hands.`);
    const miss = parseActivated(`${safe[1]}: Exile the top card of your library face down.`);
    const spec = opp && opp !== "fail" ? opp.body.targets[0] : undefined;
    if (!opp || opp === "fail" || !match || match === "fail" || !miss || miss === "fail" || opp.body.targets.length !== 1 || spec?.kind !== "player" || match.body.targets.length || miss.body.targets.length || miss.body.effects.length !== 1 || miss.body.effects[0]!.type !== "exileFaceDown") {
      out.unsupported.push(raw);
      return true;
    }
    out.activated.push({
      ...opp,
      body: {
        targets: [spec],
        effects: [
          { type: "secretNumbers", then: "match", with: { ref: "target", index: 0 } },
          { type: "if", cond: { kind: "numbersMatched" }, effects: match.body.effects, otherwise: miss.body.effects },
        ],
        text: line.slice(line.indexOf(": ") + 2),
      },
      text: line,
    });
    return true;
  }
  // Inniaz, the Gale Force: "Whenever three or more creatures you control with flying attack, each player gains control of a
  // nonland permanent of your choice controlled by the player to their right.": once for the declaration of attackers, as
  // "you attack with three or more creatures with flying" (rulings: just once, however many more). As it resolves, you
  // choose for each player one of the nonland permanents the player to their right (the one before them in turn order, CR
  // 101.4) controls, none if that player has none (rulings); then every control change happens at once, for good (rulings,
  // CR 613.1b). A creature given away is removed from combat (CR 506.4).
  const inniaz = /^Whenever three or more creatures you control with flying attack, each player gains control of a nonland permanent of your choice controlled by the player to their right\.$/.exec(line);
  if (inniaz) {
    const t = parseTrigger("Whenever you attack with three or more creatures with flying, draw a card.");
    if (!t || t === "fail" || t.event !== "creaturesYouControlAttack" || t.minAttackers !== 3) {
      out.unsupported.push(raw);
      return true;
    }
    const filter: TargetSpec = { kind: "object", types: [], notTypes: ["Land"], notColors: [], text: "nonland permanent" };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "successionControl", side: "right", youChoose: true, filter }], text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  return false;
}
