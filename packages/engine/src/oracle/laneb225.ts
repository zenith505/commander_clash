// Lane B round B225's lines, read by compileCard before its triggers and activated abilities (after round B224's).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};
/** An activated ability line read the usual way, or null. */
const act = (text: string) => {
  const a = parseActivated(text);
  return a && a !== "fail" ? a : null;
};

const HEART = "When a player doesn't pay ~'s cumulative upkeep, ~ deals X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls, where X is twice the number of age counters on ~ minus 2.";
const WEREWOLF = "{B}: If ~'s power is 1 or more, it gets -1/-0 until end of turn and put a -0/-1 counter on target creature blocking or blocked by ~. Activate only during the declare blockers step.";
const FLOTILLA = "At the beginning of each combat, unless you pay {R}, whenever ~ blocks or becomes blocked by a creature this combat, that creature gains first strike until end of turn.";
const DAGGER = "{4}, {T}: Whenever target creature deals combat damage to a non-Wall creature this turn, destroy that non-Wall creature. When the targeted creature leaves the battlefield this turn, sacrifice ~. Activate only before blockers are declared.";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB225Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Heart of Bogardan: "When a player doesn't pay ~'s cumulative upkeep, ~ deals X damage to target player or planeswalker
  // and each creature that player or that planeswalker's controller controls, where X is twice the number of age counters
  // on ~ minus 2.": it triggers as the upkeep goes unpaid (CR 702.24a) and resolves after ~ is sacrificed, so the age
  // counters are those it had as it last existed on the battlefield (CR 608.2h): X is (twice the counters) minus 2, the
  // mana last spent on its upkeep {2} (rulings), 0 with one counter or none (CR 107.1b). ~ is the source of the damage, as
  // it last existed (CR 113.7a); the creatures are the target player's, or the target planeswalker's controller's, as it
  // resolves. The trigger event is Thought Lash's (round B210).
  if (line === HEART) {
    const b = parseBody("~ deals 1 damage to target player or planeswalker and each creature that player or that planeswalker's controller controls.", { spell: false });
    const dmg = b?.effects[0];
    if (b?.effects.length !== 1 || b.targets.length !== 1 || dmg?.type !== "damage" || dmg.amount !== 1) return fail();
    const amount = { count: { kind: "counters" as const, counter: "age" as const, of: { ref: "self" as const } }, times: 2, plus: -2 };
    out.triggers.push({ event: "selfCumulativeUpkeepUnpaid", body: { targets: b.targets, effects: [{ ...dmg, amount }], text: line.replace(/^When [^,]+, /, "") } });
    return true;
  }
  // Lesser Werewolf: "{B}: If ~'s power is 1 or more, it gets -1/-0 until end of turn and put a -0/-1 counter on target
  // creature blocking or blocked by ~. Activate only during the declare blockers step.": it can be activated whatever its
  // power is; its power is checked as the ability resolves, and at 0 or less the ability does nothing (rulings). The target
  // is chosen as it's activated (CR 602.2b) and checked again as it resolves (CR 608.2b).
  if (line === WEREWOLF) {
    const a = act("{B}: ~ gets -1/-0 until end of turn and put a -0/-1 counter on target creature blocking or blocked by ~. Activate only during the declare blockers step.");
    const [shrink, counter] = a?.body.effects ?? [];
    if (!a || a.body.effects.length !== 2 || a.body.targets.length !== 1 || shrink?.type !== "continuous" || shrink.what.ref !== "self" || counter?.type !== "counters" || counter.counter !== "-0/-1" || a.activateIf?.kind !== "during") return fail();
    const cond: Effect = { type: "if", cond: { kind: "state", cond: { kind: "amount", amount: { count: { kind: "power", of: { ref: "self" } } }, min: 1 } }, effects: [shrink, counter] };
    out.activated.push({ ...a, body: { ...a.body, effects: [cond], text: line.replace(/^\{B\}: /, "").replace(/ Activate only during the declare blockers step\.$/, "") }, text: line });
    return true;
  }
  // Goblin Flotilla: "At the beginning of each combat, unless you pay {R}, whenever ~ blocks or becomes blocked by a
  // creature this combat, that creature gains first strike until end of turn.": at every player's beginning of combat,
  // its controller may pay {R} as it resolves (CR 118.12); if they don't, a delayed trigger about ~ as it is then (CR
  // 603.7b-c) lasts until that combat ends: once for each creature it blocks or that blocks it (CR 509.3b, 509.3d), that creature
  // gaining first strike, before the combat damage step begins (CR 510.4).
  if (line === FLOTILLA) {
    const t = trig("At the beginning of each combat, sacrifice ~ unless you pay {R}.");
    const fs = trig("Whenever ~ blocks or becomes blocked by a creature, that creature gains first strike until end of turn.");
    const pay = t?.body.effects[0];
    if (t?.event !== "eachBeginCombat" || t.body.effects.length !== 1 || pay?.type !== "may" || pay.pay?.mana !== "{R}" || fs?.event !== "selfBlocksOrBlockedByCreature" || fs.body.effects.length !== 1) return fail();
    const floating: Effect = { type: "floatingTrigger", trigger: fs, until: "endOfCombat" };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "may", effects: [], pay: { mana: "{R}" }, otherwise: [floating], keep: true, text: "Pay {R} so that ~ doesn't give first strike this combat" }], text: line.replace(/^At the beginning of each combat, /, "") } });
    return true;
  }
  // Acidic Dagger: "{4}, {T}: Whenever target creature deals combat damage to a non-Wall creature this turn, destroy that
  // non-Wall creature. When the targeted creature leaves the battlefield this turn, sacrifice ~. Activate only before
  // blockers are declared.": two delayed triggers about the target (CR 603.7b-c), for the rest of the turn: one for each
  // non-Wall creature it deals combat damage to (none when all of it is prevented or redirected, rulings), destroying that
  // creature; one sacrificing ~ when the target leaves the battlefield. "Before blockers are declared" is before the
  // declare blockers step of the turn's first combat (rulings, CR 506.8b).
  if (line === DAGGER) {
    const a = act("{4}, {T}: Choose target creature. When that creature leaves the battlefield this turn, sacrifice ~. Activate only before blockers are declared.");
    const hit = trig("Whenever ~ deals combat damage to a creature, destroy that creature.");
    const [leaves] = a?.body.effects ?? [];
    if (!a || a.body.effects.length !== 1 || leaves?.type !== "delayed" || leaves.when !== "leaves" || a.body.targets.length !== 1 || a.activateIf?.kind !== "during" || a.activateIf.window !== "beforeBlockers" || hit?.event !== "selfDealsCombatDamageToCreature" || hit.body.effects.length !== 1 || hit.body.effects[0]!.type !== "destroy") return fail();
    const nonWall: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], notSubtypes: ["Wall"], text: "non-Wall creature" };
    const floating: Effect = { type: "floatingTrigger", trigger: { ...hit, subjectFilter: nonWall, body: { ...hit.body, text: "destroy that non-Wall creature." } }, until: "endOfTurn", about: 0 };
    out.activated.push({ ...a, body: { ...a.body, effects: [floating, leaves], text: line.replace(/^\{4\}, \{T\}: /, "").replace(/ Activate only before blockers are declared\.$/, "") }, text: line });
    return true;
  }
  return false;
}
