// Lane B round B241's lines, read by compileCard before its triggers and activated abilities (after round B240's).
// Wiretapping's draw-step trigger is parsed in oracle/triggers.ts (parseDrawTrigger).
import type { CompiledCard, TargetSpec } from "../abilities";

const SCAPEGOAT = "Whenever one or more other creatures you control enter, if ~ is suspected, you may suspect one of the other creatures. If you do, ~ is no longer suspected.";
const LUCIUS = "When ~ dies, exile it and choose target creature an opponent controls. When that creature leaves the battlefield, return ~ from exile to the battlefield under its owner's control.";
const RISKY = "When you gain control of ~ from another player, choose a creature you control and an opponent. Flip a coin. If you lose the flip, that opponent gains control of that creature.";

const creature = (text: string, controller?: "you" | "opponent"): TargetSpec => ({ kind: "object", types: ["Creature"], notTypes: [], notColors: [], ...(controller ? { controller } : {}), text });

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB241Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Frantic Scapegoat: a batch trigger (CR 603.2c) for other creatures entering under its controller's control, with an
  // intervening if (CR 603.4) checked as they enter and as it resolves. "One of the other creatures" is one of those that
  // entered, still on the battlefield as that object (CR 400.7), not targeted; only one that can become suspected (CR
  // 701.60d), so choosing one is suspecting it, and "if you do" (CR 608.2c) then ends ~'s being suspected (CR 701.60a).
  if (line === SCAPEGOAT) {
    out.triggers.push({
      event: "batch",
      batch: { what: "enters", filter: creature("creatures you control", "you"), other: true },
      ifCond: { kind: "suspected" },
      body: {
        targets: [],
        effects: [
          { type: "pick", who: { ref: "you" }, filter: creature("creature"), n: 1, upTo: true, action: "choose", fromGroup: true, suspectable: true, prompt: "you may suspect one of the other creatures that entered (then ~ is no longer suspected): click it, then choose." },
          { type: "suspect", what: { ref: "created" }, fromSelf: true },
        ],
        text: "you may suspect one of the other creatures. If you do, ~ is no longer suspected.",
      },
    });
    return true;
  }
  // Lucius the Eternal: a leaves-the-battlefield trigger (CR 603.6c, 603.10a) with one target, so with that target illegal it
  // doesn't resolve and Lucius stays in the graveyard (CR 608.2b, rulings). Effect exileSelfUntilTargetLeaves.
  if (line === LUCIUS || line === `Armour of Shrieking Souls — ${LUCIUS}`) {
    out.triggers.push({ event: "selfDies", body: { targets: [creature("target creature an opponent controls", "opponent")], effects: [{ type: "exileSelfUntilTargetLeaves" }], text: LUCIUS.replace(/^When ~ dies, /, "") } });
    return true;
  }
  // Risky Move: a trigger for the player who gains control of it from another player (TriggerEvent selfGainedControl).
  // Nothing is targeted (rulings): the creature and then the opponent are chosen as it resolves (CR 608.2d), the coin is
  // flipped even with no creature to give (CR 705), and a lost flip gives that creature to that opponent for good (layer 2,
  // CR 613.1b; rulings: not only until end of turn, nor only while Risky Move stays).
  if (line === RISKY) {
    out.triggers.push({
      event: "selfGainedControl",
      body: {
        targets: [],
        effects: [
          { type: "pick", who: { ref: "you" }, filter: creature("creature you control", "you"), n: 1, action: "choose", prompt: "choose a creature you control (if you lose ~'s coin flip, the opponent you choose next gains control of it): click it, then choose." },
          { type: "choose", choice: "opponent" },
          { type: "flipCoin" },
          { type: "if", cond: { kind: "wonFlip", lost: true }, effects: [{ type: "continuous", what: { ref: "created" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }] },
        ],
        text: "choose a creature you control and an opponent. Flip a coin. If you lose the flip, that opponent gains control of that creature.",
      },
    });
    return true;
  }
  return false;
}
