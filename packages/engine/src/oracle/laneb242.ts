// Lane B round B242's lines, read by compileCard before its triggers and activated abilities (after round B241's).
// Blaster, Combat DJ's granted modular is parsed in oracle/grants.ts.
import type { CompiledCard, TargetSpec } from "../abilities";

const WEB_ATTACK = "If a creature with a magnet counter on it attacks, all creatures with magnet counters on them attack if able.";
const WEB_BLOCK = "Whenever a creature with a magnet counter on it attacks, all creatures with magnet counters on them block that creature this turn if able.";
const LAST_LIGHT = "Whenever a Mountain you control enters, put a quest counter on ~. If it has six or more quest counters on it, sacrifice it. If you do, search your hand and/or library for a Dragon card and put it onto the battlefield. If you search your library this way, shuffle.";

const MORALE = "{X}, {T}: Move X +1/+1 counters from ~ onto another target artifact. That artifact gains haste until end of turn. If ~ has no +1/+1 counters on it, convert it. Activate only as a sorcery.";

const magnetized = (text: string): TargetSpec => ({ kind: "object", types: ["Creature"], notTypes: [], notColors: [], counter: "magnet", text });

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB242Line(line: string, _raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Magnetic Web: a requirement (CR 508.1d), not a trigger, on the attacking player's creatures with magnet counters once one
  // of them is declared as an attacker (game.ts declareAttackers), whoever controls the Web; only the active player's
  // creatures can attack (CR 508.1a).
  if (line === WEB_ATTACK) {
    out.allAttackIfOneWithCounter = "magnet";
    return true;
  }
  // Magnetic Web: for each creature with a magnet counter declared as an attacker (CR 508.3a), every creature with a magnet
  // counter as it resolves gets a blocking requirement (CR 509.1c) for that attacker, as long as it's that object (CR
  // 400.7), for the rest of the turn; only the creatures of the player it attacks can block it (CR 509.1a). With several
  // magnetized attackers, a creature blocking any one of them obeys as many requirements as it can (CR 509.1c).
  if (line === WEB_BLOCK) {
    out.triggers.push({
      event: "creatureYouControlAttacks",
      attacker: { filter: magnetized("creature with a magnet counter on it"), anyone: true },
      body: {
        targets: [],
        effects: [{ type: "mustBlockSource", what: { ref: "each", filter: magnetized("all creatures with magnet counters on them") }, attacker: { ref: "subject" }, thisTurn: true }],
        text: "all creatures with magnet counters on them block that creature this turn if able.",
      },
    });
    return true;
  }
  // Last Light of Durin's Day: the counter, then, if ~ has six or more quest counters as this resolves (CR 608.2c), it's
  // sacrificed; only if it was (CR 608.2c, "if you do") its controller searches their hand, and their library too if they
  // choose, for a Dragon card, shuffling only if they searched the library (CR 701.23); only a Dragon permanent card can
  // be put onto the battlefield (rulings). A hidden zone: they may find nothing (CR 701.23b).
  if (line === LAST_LIGHT) {
    out.triggers.push({
      event: "permanentEnters",
      enters: { filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Mountain"], controller: "you", text: "Mountain you control" } },
      body: {
        targets: [],
        effects: [
          { type: "counters", what: { ref: "self" }, counter: "quest", n: 1 },
          {
            type: "if",
            cond: { kind: "state", cond: { kind: "selfCounters", counter: "quest", min: 6 } },
            effects: [
              { type: "sacrifice", what: { ref: "self" } },
              {
                type: "if",
                cond: { kind: "sacrificedThisWay" },
                effects: [{ type: "search", filter: { kind: "card", types: ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"], notTypes: [], notColors: [], subtypes: ["Dragon"], text: "Dragon permanent card" }, n: 1, upTo: false, reveal: false, dest: { zone: "battlefield" }, orHand: true }],
              },
            ],
          },
        ],
        text: LAST_LIGHT.replace(/^Whenever a Mountain you control enters, /, ""),
      },
    });
    return true;
  }
  // Blaster, Morale Booster: X counters moved, all of them if it has fewer (rulings); the target gains haste even if it isn't
  // a creature (it matters if it becomes one, CR 302.6); then, only if ~ has no +1/+1 counters as it resolves (CR 608.2c),
  // it converts, which is transforming (CR 701.28, 712.8).
  if (line === MORALE) {
    out.activated.push({
      manaCost: "{X}",
      tap: true,
      sacrificeSelf: false,
      sorcerySpeed: true,
      body: {
        targets: [{ kind: "object", types: ["Artifact"], notTypes: [], notColors: [], text: "another target artifact", notSource: true }],
        effects: [
          { type: "removeAnyCounters", what: { ref: "self" }, n: { count: { kind: "x" } }, moveTo: { ref: "target", index: 0 }, moveN: true, kinds: ["+1/+1"] },
          { type: "continuous", what: { ref: "target", index: 0 }, mods: [{ kind: "addKeywords", keywords: ["Haste"] }], duration: "endOfTurn" },
          { type: "if", cond: { kind: "state", cond: { kind: "selfCounters", counter: "+1/+1", min: 0, max: 0 } }, effects: [{ type: "transform", what: { ref: "self" } }] },
        ],
        text: MORALE.replace(/^\{X\}, \{T\}: /, "").replace(/ Activate only as a sorcery\.$/, ""),
      },
      text: MORALE,
    });
    return true;
  }
  return false;
}
