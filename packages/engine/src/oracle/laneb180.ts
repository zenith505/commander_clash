// Lane B round B180's sentences, read at the end of round B179's.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseManaCost } from "../mana";

type Found = { effect: Effect; next: number } | "fail" | null;

const NUM: Record<string, number> = { "1": 1, "2": 2, "3": 3, a: 1, an: 1, another: 1 };

/** A mana cost a player may pay as a special action ("unless they pay {2} before that step"): plain mana symbols only. */
const payable = (cost: string): boolean => {
  const c = parseManaCost(cost);
  return c.supported && !c.hasX && c.symbols.length > 0;
};

export function roundB180Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Nafs Asp, Glass Asp, in a "whenever ~ deals (combat) damage to a player" trigger: "that player loses 1 life at the
  // beginning of their next draw step unless they pay {1} before that draw step": a delayed trigger (CR 603.7) the player
  // may stop by paying, a special action any time they have priority, once, until that draw step begins (rulings: each
  // time it deals damage is one more; it's life loss, not damage).
  const asp = /^[Tt]hat player loses (\d+) life at the beginning of their next draw step unless they pay ((?:\{[^}]+\})+) before that (?:draw )?step$/.exec(s);
  if (asp) {
    if (!ctx.eventPlayer || ctx.spell || effects.length || !payable(asp[2]!)) return "fail";
    const n = Number(asp[1]);
    return { effect: { type: "delayedUnlessPaid", whom: "eventPlayer", when: "theirNextDraw", cost: asp[2]!, effects: [{ type: "loseLife", who: { ref: "eventPlayer" }, n }], text: `that player loses ${n} life` }, next: si + 1 };
  }
  // Sabertooth Cobra, after "that player gets a poison counter": "The player gets another poison counter at the beginning
  // of their next upkeep unless they pay {2} before that step." (rulings: even if the Cobra has left the battlefield).
  const cobra = /^The player gets (another|a) poison counter at the beginning of their next upkeep unless they pay ((?:\{[^}]+\})+) before that step$/.exec(s);
  if (cobra) {
    const last = effects[effects.length - 1];
    if (!ctx.eventPlayer || ctx.spell || effects.length !== 1 || last?.type !== "poison" || last.who.ref !== "eventPlayer" || !payable(cobra[2]!)) return "fail";
    return { effect: { type: "delayedUnlessPaid", whom: "eventPlayer", when: "theirNextUpkeep", cost: cobra[2]!, effects: [{ type: "poison", who: { ref: "eventPlayer" }, n: NUM[cobra[1]!]! }], text: "that player gets a poison counter" }, next: si + 1 };
  }
  // Quenchable Fire, after "~ deals 3 damage to target player or planeswalker": "It deals an additional 3 damage to that
  // player or planeswalker at the beginning of your next upkeep step unless that player or that planeswalker's controller
  // pays {U} before that step.": about the target chosen, even if the first damage was prevented or redirected (rulings);
  // a planeswalker's controller pays for it while it's still that permanent.
  const fire = /^It deals an additional (\d+) damage to that player or planeswalker at the beginning of your next upkeep(?: step)? unless that player or that planeswalker's controller pays ((?:\{[^}]+\})+) before that step$/.exec(s);
  if (fire) {
    const last = effects[effects.length - 1];
    if (!ctx.spell || effects.length !== 1 || last?.type !== "damage" || last.to.ref !== "anyTarget" || last.also || last.divided || ctx.targets.length !== 1 || ctx.targets[0]?.kind !== "any" || ctx.targets[0].types?.join() !== "Planeswalker" || !payable(fire[2]!)) return "fail";
    return { effect: { type: "delayedUnlessPaid", whom: "target", index: 0, when: "yourNextUpkeep", cost: fire[2]!, effects: [{ type: "damage", amount: Number(fire[1]), to: { ref: "eventPlayer" } }], text: `~ deals ${fire[1]} damage to that player or planeswalker` }, next: si + 1 };
  }
  // Maeve, Insidious Singer, after "Goad target creature": "Whenever that creature attacks one of your opponents this
  // turn, you draw a card.": a delayed trigger about that creature as it is now (CR 603.7b-c), each time it attacks one
  // of your opponents this turn (the player, not a planeswalker).
  if (s === "Whenever that creature attacks one of your opponents this turn, you draw a card") {
    const last = effects[effects.length - 1];
    const goad = last?.type === "continuous" && last.mods.length === 1 && last.mods[0]!.kind === "goad" && last.what.ref === "target" && last.what.index === 0;
    if (effects.length !== 1 || !goad || ctx.targets.length !== 1 || !ctx.activated) return "fail";
    return { effect: { type: "delayed", when: "attacksOpponent", of: { ref: "target", index: 0 }, effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "you draw a card", thisTurn: true }, next: si + 1 };
  }
  return null;
}
