// Lane B round B284's lines, read by compileCard before the generic triggers and statics (after round B283's): Tahngarth,
// First Mate's attack trigger and Chorus of the Conclave's additional cost.
import type { CompiledCard } from "../abilities";

const TAHNGARTH_WHEN = "Whenever an opponent attacks with one or more creatures, if ~ is tapped, ";
const TAHNGARTH_BODY = "you may have that opponent gain control of ~ until end of combat. If you do, choose a player or planeswalker that opponent is attacking. ~ is attacking that player or planeswalker.";
const CHORUS = "As an additional cost to cast creature spells, you may pay any amount of mana. If you do, that creature enters with that many additional +1/+1 counters on it.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB284Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Tahngarth, First Mate: any other player's declaration of attackers with one or more creatures (CR 508.1, 603.2c; in
  // Commander every other player is an opponent), "that opponent" the attacking player; "if ~ is tapped" checked as it
  // triggers and as it resolves (CR 603.4). As it resolves, its controller may give it to that player until end of combat
  // (layer 2, CR 500.5a), then choose one of the players or planeswalkers that player's attacking creatures are attacking
  // then (rulings: not a player whose planeswalker alone is attacked, nor one no creature attacks any more; its owner too),
  // and it's attacking that one, never declared, so nothing about attacking triggers and no restriction applies (rulings,
  // CR 506.3, 508.4). It stays tapped (rulings). With nothing to choose, control still changes and it isn't attacking.
  if (line === TAHNGARTH_WHEN + TAHNGARTH_BODY) {
    if (isSpell) return fail();
    out.triggers.push({
      event: "creaturesYouControlAttack",
      anyoneAttacks: true,
      anotherPlayer: true,
      ifCond: { kind: "self", is: "tapped" },
      body: { targets: [], effects: [{ type: "may", effects: [{ type: "giveControlAttacking", to: { ref: "eventPlayer" } }], text: TAHNGARTH_BODY.replace(/\.$/, "") }], text: TAHNGARTH_BODY },
    });
    return true;
  }
  // Chorus of the Conclave: a static ability of the permanent (CR 113.6), so only while it's on the battlefield (rulings),
  // for its controller's creature spells as they're cast (rulings: not creatures put onto the battlefield), the amount
  // announced with the other additional costs (CR 601.2b) and added to the total cost as generic mana (601.2f).
  if (line === CHORUS) {
    if (isSpell || out.chorusCost) return fail();
    out.chorusCost = true;
    return true;
  }
  return false;
}
