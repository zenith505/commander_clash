// Round 427's whole lines (compile.ts, before round 426's): Sidequest: Play Blitzball's end of combat transform and attach,
// and Avatar Aang's bending trigger.
import type { CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const AANG_BENDS = "Whenever you waterbend, earthbend, firebend, or airbend, draw a card. Then if you've done all four this turn, transform ~.";
const AANG_UPKEEP = "At the beginning of each upkeep, you may transform ~. If you do, you gain 4 life, draw four cards, put four +1/+1 counters on ~, and ~ deals 4 damage to each opponent.";
const BLITZBALL = "At the end of combat on your turn, if a player was dealt 6 or more combat damage this turn, transform ~, then attach it to a creature you control.";

/** One whole line of round 427's (compile.ts); false when it isn't one of these. */
export function round427Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Sidequest: Play Blitzball: an intervening "if" (CR 603.4), checked as the end of combat step begins and again as it
  // resolves: the combat damage any one player was dealt this turn, in all, from every source and both combat damage steps
  // (CR 510.4), a player who has left the game since too (StaticCondition playerDealtCombatDamage). It transforms (CR
  // 701.27a; not if it has transformed since the ability was put on the stack, 701.27f), then is attached to a creature its
  // controller controls, chosen as it resolves, not targeted (CR 701.3a): only if it's an Equipment by then (a copy of it
  // that couldn't transform stays put, CR 701.3b, 301.5).
  if (line === BLITZBALL) {
    const t = isSpell ? null : parseTrigger("At the end of combat on your turn, if a player was dealt 6 or more combat damage this turn, transform ~.");
    if (!t || t === "fail" || t.event !== "yourEndCombat" || t.ifCond?.kind !== "playerDealtCombatDamage" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "transform") return fail(out, raw);
    out.triggers.push({
      ...t,
      body: {
        targets: [],
        effects: [t.body.effects[0]!, { type: "attachToChosen", source: { ref: "self" }, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "a creature you control" }, equipmentOnly: true }],
        text: "transform ~, then attach it to a creature you control.",
      },
    });
    return true;
  }
  // Avatar Aang: one trigger for each bending you do (TriggerEvent youBend; effects/triggers.ts bent: a waterbend cost paid,
  // CR 701.67a and rulings; earthbend's delayed trigger made, 701.66b; a firebending ability resolved, 702.189b; objects
  // exiled by an instruction to airbend, 701.65b). The four kinds are looked at over the whole turn as it resolves, before
  // Avatar Aang was on the battlefield too (rulings; StaticCondition bentAllFour).
  if (line === AANG_BENDS) {
    const draw = isSpell ? null : parseBody("Draw a card.");
    const flip = isSpell ? null : parseBody("Transform ~.");
    if (draw?.effects.length !== 1 || draw.effects[0]!.type !== "draw" || flip?.effects.length !== 1 || flip.effects[0]!.type !== "transform") return fail(out, raw);
    out.triggers.push({
      event: "youBend",
      bends: ["water", "earth", "fire", "air"],
      body: { targets: [], effects: [draw.effects[0]!, { type: "if", cond: { kind: "state", cond: { kind: "bentAllFour" } }, effects: [flip.effects[0]!] }], text: "draw a card. Then if you've done all four this turn, transform ~." },
    });
    return true;
  }
  // Aang, Master of Elements: at the beginning of every player's upkeep, a "may" (CR 603.5) and "if you do": the four parts
  // of the list in order, the counters and damage by the permanent it is now (it's the same object after transforming, CR
  // 712.18).
  if (line === AANG_UPKEEP) {
    const t = isSpell ? null : parseTrigger("At the beginning of each upkeep, you may transform ~. If you do, you gain 4 life.");
    const parts = ["You gain 4 life.", "Draw four cards.", "Put four +1/+1 counters on ~.", "~ deals 4 damage to each opponent."].map((p) => parseBody(p));
    if (!t || t === "fail" || t.event !== "eachUpkeep" || t.body.effects.length !== 2 || t.body.effects[0]!.type !== "may" || t.body.effects[1]!.type !== "if" || parts.some((p) => !p || p.targets.length || p.effects.length !== 1)) return fail(out, raw);
    const did = t.body.effects[1]! as Extract<Effect, { type: "if" }>;
    out.triggers.push({ ...t, body: { targets: [], effects: [t.body.effects[0]!, { ...did, effects: parts.map((p) => p!.effects[0]!) }], text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  return false;
}
