// Lane B round B264's lines, read by compileCard before the generic triggers (after round B263's): Soul Echo's upkeep
// trigger. Its spells are in oracle/laneb264.ts.
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const ECHO = "At the beginning of your upkeep, sacrifice ~ if there are no echo counters on it. Otherwise, target opponent may choose that for each 1 damage that would be dealt to you until your next upkeep, you remove an echo counter from ~ instead.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB264Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (line !== ECHO) return false;
  // Soul Echo: one triggered ability with a target opponent (CR 603.3d, 115.1), chosen anew each upkeep (rulings); as it
  // resolves, with no echo counters on ~ it's sacrificed, otherwise that opponent may choose to create a replacement
  // effect (CR 614.1a, not prevention: damage that can't be prevented is replaced too, CR 615.12): each 1 damage that
  // would be dealt to you is a counter removed instead, from the moment it resolves (rulings: damage earlier in that
  // upkeep is dealt as usual) until your next upkeep. No player gets priority in an untap step (CR 502.4), so no damage
  // can be dealt between your next turn beginning and its upkeep: the effect ends as your next turn begins
  // (GameState.damageMods until "yourNextTurn"). With none left, it still replaces the damage (rulings). Several: the
  // player dealt the damage chooses which one applies (CR 616.1), and all that damage goes to that one (rulings).
  const t = parseTrigger("At the beginning of your upkeep, target opponent loses 1 life.");
  if (isSpell || !t || t === "fail" || t.event !== "yourUpkeep" || t.body.targets.length !== 1 || t.body.targets[0]!.kind !== "player") {
    out.unsupported.push(line);
    return true;
  }
  const text = "until its controller's next upkeep, for each 1 damage that would be dealt to them, they remove an echo counter from it instead";
  const replace: Effect = { type: "damageMod", mod: { op: "removeCounters", counter: "echo", to: { players: "you" }, text }, until: "yourNextTurn", fromSource: true };
  const choose: Effect = { type: "may", decider: { ref: "target", index: 0 }, effects: [replace], text: "Choose that for each 1 damage that would be dealt to ~'s controller until their next upkeep, they remove an echo counter from ~ instead?" };
  const body: Effect = { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "counters", counter: "echo", of: { ref: "self" } } }, max: 0 }, effects: [{ type: "sacrifice", what: { ref: "self" } }], otherwise: [choose] };
  out.triggers.push({ ...t, body: { targets: t.body.targets, effects: [body], text: line.replace(/^At the beginning of your upkeep, /, "") } });
  return true;
}
