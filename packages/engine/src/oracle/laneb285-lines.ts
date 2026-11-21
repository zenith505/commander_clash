// Lane B round B285's lines, read by compileCard before the generic triggers and statics (after round B284's): Pygmy
// Hippo's attack trigger and Ice Cauldron's two abilities.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const HIPPO_WHEN = "Whenever ~ attacks and isn't blocked, ";
const HIPPO_MAY = "you may have defending player activate a mana ability of each land they control and lose all unspent mana";
const HIPPO_THEN = "If you do, ~ assigns no combat damage this turn and at the beginning of your next main phase this turn, you add an amount of {C} equal to the amount of mana that player lost this way.";
const CAULDRON_CHARGE =
  "{X}, {T}: You may exile a nonland card from your hand. You may cast that card for as long as it remains exiled. Put a charge counter on ~ and note the type and amount of mana spent to pay this activation cost. Activate only if there are no charge counters on ~.";
const CAULDRON_MANA = "{T}, Remove a charge counter from ~: Add ~'s last noted type and amount of mana. Spend this mana only to cast the last card exiled with ~.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB285Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  const text = line.replace(/\bthis (?:creature|artifact)\b/g, "~");
  // Pygmy Hippo: "attacks and isn't blocked" once blockers are declared (CR 509.1h, rulings), its event player the
  // defending player (CR 506.2). As it resolves, its controller may have that player activate a mana ability of each land
  // they control, their choices as for Drain Power (rulings), then lose all unspent mana (CR 106.4; Effect drainLose). Doing
  // it (even with no lands, or no mana lost) means ~ assigns no combat damage this turn (CR 510.1a, not prevention) and a
  // delayed trigger adds {C} for each mana that player lost, at the beginning of the next main phase this turn (CR 603.7;
  // an attacking creature's controller is the active player, CR 508.1, so it's theirs, CR 505.1). It's a triggered ability
  // with no mana ability's trigger, so it uses the stack (CR 605.5a). With no main phase left this turn, nothing.
  if (text === HIPPO_WHEN + HIPPO_MAY + ". " + HIPPO_THEN) {
    if (isSpell) return fail();
    const add = "add an amount of {C} equal to the amount of mana that player lost this way";
    out.triggers.push({
      event: "selfAttacksUnblocked",
      body: {
        targets: [],
        effects: [
          { type: "may", effects: [{ type: "drainLose", who: { ref: "eventPlayer" } }], text: HIPPO_MAY.replace(/^you may /, "") },
          {
            type: "if",
            cond: { kind: "youDid" },
            effects: [
              { type: "noCombatDamage", what: { ref: "self" } },
              { type: "delayed", when: "nextMainThisTurn", effects: [{ type: "addMana", mana: "{C}", times: { count: { kind: "eventAmount" } } }], text: add, event: { amount: { count: { kind: "manaLostThisWay" } } } },
            ],
          },
        ],
        text: (HIPPO_MAY + ". " + HIPPO_THEN).replace(/^y/, "Y"),
      },
    });
    return true;
  }
  // Ice Cauldron: "{X}, {T}": X may be 0 (rulings); only with no charge counters on it. As it resolves, a nonland card of
  // your choice from your hand, or none (CR 609.3), exiled; you may cast it for as long as it remains exiled, with its usual
  // timing, even once ~ has left (rulings; MayPlay "exiled"). A charge counter goes on ~ and each mana spent on the cost is
  // noted (Effect noteCauldron), whatever reduced the cost (rulings).
  if (text === CAULDRON_CHARGE) {
    const a = isSpell ? null : parseActivated("{X}, {T}: You may exile a nonland card from your hand. Put a charge counter on ~. Activate only if there are no charge counters on ~.");
    const may = a && a !== "fail" ? a.body.effects[0] : undefined;
    const take = may?.type === "may" ? may.effects[0] : undefined;
    const counter = a && a !== "fail" ? a.body.effects[1] : undefined;
    if (!a || a === "fail" || !a.tap || a.manaCost !== "{X}" || a.costs?.length || !a.activateIf || a.body.targets.length || a.body.effects.length !== 2 || take?.type !== "takeFromHand" || take.action !== "exile" || !take.filter || counter?.type !== "counters") return fail();
    out.activated.push({
      ...a,
      text: line,
      body: { targets: [], effects: [{ ...take, optional: true, youMay: {} }, counter, { type: "noteCauldron" }], text: text.slice("{X}, {T}: ".length).replace(/ Activate only .*$/, "") },
    });
    return true;
  }
  // "{T}, Remove a charge counter from ~: Add ~'s last noted type and amount of mana.": a mana ability (CR 605.1a), each
  // mana noted (rulings: none if nothing was noted or X was 0). "Spend this mana only to cast the last card exiled with ~"
  // (CR 106.6): bound to that card as the mana is made (spend.ts boundSpend), so a card exiled later doesn't change it.
  if (text === CAULDRON_MANA) {
    if (isSpell) return fail();
    out.mana.push({
      text: line,
      manaCost: "",
      tap: true,
      sacrificeSelf: false,
      produces: { kind: "noted", all: true },
      removeCounters: { counter: "charge", n: 1 },
      spendOnly: { lastExiled: true, text: "Spend this mana only to cast the last card exiled with ~." },
    });
    return true;
  }
  return false;
}
