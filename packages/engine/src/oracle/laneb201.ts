// Lane B round B201's lines, read by compileCard before its triggers and activated abilities (after round B200's), its
// sentences, read at the end of round B200's chain, and its whole spells, read after round B200's.
import type { AbilityBody, CompiledCard, Effect, StaticCondition } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";
import { parseBody } from "./body";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string) => s.replace(/\.$/, "");

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB201Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Happily Ever After: "At the beginning of your upkeep, if there are five colors among permanents you control, there are
  // six or more card types among permanents you control and/or cards in your graveyard, and your life total is greater than
  // or equal to your starting life total, you win the game.": one intervening if (CR 603.4, rulings), all three true as
  // the upkeep begins and as it resolves. The card types (CR 205.2a) of your permanents and the cards in your graveyard
  // together; your starting life total is 40 (CR 903.7).
  if (line === "At the beginning of your upkeep, if there are five colors among permanents you control, there are six or more card types among permanents you control and/or cards in your graveyard, and your life total is greater than or equal to your starting life total, you win the game.") {
    const a = parseTrigger("At the beginning of your upkeep, if there are five colors among permanents you control, you win the game.");
    const b = parseTrigger("At the beginning of your upkeep, if there are six or more card types among cards in your graveyard, you win the game.");
    const c = parseTrigger("At the beginning of your upkeep, if your life total is greater than or equal to your starting life total, you win the game.");
    const ok = (t: typeof a) => !!t && t !== "fail" && t.event === "yourUpkeep" && t.body.effects.length === 1 && t.body.effects[0]!.type === "winGame" && !!t.ifCond;
    if (!ok(a) || !ok(b) || !ok(c) || a === "fail" || b === "fail" || c === "fail" || !a || !b || !c) {
      out.unsupported.push(raw);
      return true;
    }
    const types = b.ifCond!;
    if (types.kind !== "graveyardTypes" || types.n !== 6 || types.permanent || a.ifCond!.kind !== "colorsAmong" || c.ifCond!.kind !== "life") {
      out.unsupported.push(raw);
      return true;
    }
    const conds: StaticCondition[] = [a.ifCond!, { ...types, andPermanents: true }, c.ifCond!];
    out.triggers.push({ ...a, ifCond: { kind: "allOf", conds }, body: { ...a.body, text: "you win the game." } });
    return true;
  }
  // Delaying Shield: "At the beginning of your upkeep, remove all delay counters from ~. For each delay counter removed this
  // way, you lose 1 life unless you pay {1}{W}.": one choice for each counter removed, each paid or not in turn (CR 118.12).
  if (line === "At the beginning of your upkeep, remove all delay counters from ~. For each delay counter removed this way, you lose 1 life unless you pay {1}{W}.") {
    const t = parseTrigger("At the beginning of your upkeep, remove all delay counters from ~. You draw a card for each delay counter removed this way.");
    const p = parseTrigger("At the beginning of your upkeep, each opponent loses 1 life unless they pay {1}{W}.");
    const [remove, draw] = t && t !== "fail" ? t.body.effects : [];
    const pun = p && p !== "fail" && p.body.effects.length === 1 ? p.body.effects[0] : undefined;
    const n = draw?.type === "draw" && typeof draw.n === "object" && "count" in draw.n ? draw.n : undefined;
    if (!t || t === "fail" || t.event !== "yourUpkeep" || t.body.effects.length !== 2 || remove?.type !== "removeCounters" || remove.counter !== "delay" || n?.count.kind !== "countersRemovedThisWay" || pun?.type !== "punisher" || pun.options.length !== 1 || pun.effects.length !== 1 || pun.effects[0]!.type !== "loseLife") {
      out.unsupported.push(raw);
      return true;
    }
    const each: Effect = { ...pun, who: { ref: "you" }, times: { count: { kind: "countersRemovedThisWay" } } };
    out.triggers.push({ ...t, body: { targets: [], effects: [remove, each], text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  // Crooked Scales: "{4}, {T}: Flip a coin. If you win the flip, destroy target creature an opponent controls. If you lose the
  // flip, destroy target creature you control unless you pay {3} and repeat this process.": both targets chosen as it's
  // activated, the same ones each time it repeats (rulings).
  if (line === "{4}, {T}: Flip a coin. If you win the flip, destroy target creature an opponent controls. If you lose the flip, destroy target creature you control unless you pay {3} and repeat this process.") {
    const a = parseActivated("{4}, {T}: Destroy target creature an opponent controls. Destroy target creature you control.");
    const [d0, d1] = a && a !== "fail" ? a.body.effects : [];
    if (!a || a === "fail" || !a.tap || a.manaCost !== "{4}" || (a.costs ?? []).length || a.body.targets.length !== 2 || d0?.type !== "destroy" || d1?.type !== "destroy" || a.body.targets[0]!.controller !== "opponent" || a.body.targets[1]!.controller !== "you") {
      out.unsupported.push(raw);
      return true;
    }
    out.activated.push({ ...a, text: line, body: { targets: a.body.targets, effects: [{ type: "flipDestroyOrRepeat", pay: "{3}" }], text: line.replace(/^\{4\}, \{T\}: /, "") } });
    return true;
  }
  // Liar's Pendulum: "{2}, {T}: Choose a card name. Target opponent guesses whether a card with that name is in your hand.
  // You may reveal your hand. If you do and your opponent guessed wrong, draw a card.": the name first, then the guess
  // (rulings); you reveal only if you choose to, and draw only if you reveal and the guess was wrong (rulings).
  if (line === "{2}, {T}: Choose a card name. Target opponent guesses whether a card with that name is in your hand. You may reveal your hand. If you do and your opponent guessed wrong, draw a card.") {
    const a = parseActivated("{2}, {T}: Choose a card name. Target opponent reveals their hand.");
    const [name, look] = a && a !== "fail" ? a.body.effects : [];
    if (!a || a === "fail" || !a.tap || (a.costs ?? []).length || a.body.targets.length !== 1 || a.body.targets[0]!.kind !== "player" || name?.type !== "choose" || name.choice !== "cardName" || look?.type !== "lookAtHand") {
      out.unsupported.push(raw);
      return true;
    }
    out.activated.push({ ...a, text: line, body: { targets: a.body.targets, effects: [{ ...name, purpose: "own" }, { type: "guessNamedInHand", who: { ref: "target", index: 0 } }], text: line.replace(/^\{2\}, \{T\}: /, "") } });
    return true;
  }
  return false;
}

/** Round B201's sentences, read at the end of round B200's chain. */
export function roundB201Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Dust of Moments: "Remove two time counters from each permanent and each suspended card." / "Put two time counters on each
  // permanent with a time counter on it and each suspended card.": every player's, all at once; a suspended card is one in
  // exile with suspend and a time counter (CR 702.62b). Removing the last one triggers suspend and vanishing (CR 702.62a,
  // 702.63a).
  if (plain(s) === "Remove two time counters from each permanent and each suspended card" && ctx.spell && !effects.length) return { effect: { type: "timeCountersEach", mode: "remove", n: 2 }, next: si + 1 };
  if (plain(s) === "Put two time counters on each permanent with a time counter on it and each suspended card" && ctx.spell && !effects.length) return { effect: { type: "timeCountersEach", mode: "add", n: 2 }, next: si + 1 };
  return null;
}

/** A whole spell's text read at once; undefined when it isn't one of these, null when it is but fails. */
export function roundB201Spell(text: string): AbilityBody | null | undefined {
  // Power of Persuasion: "Choose target creature an opponent controls, then roll a d20. 1—9 | Return it to its owner's hand.
  // 10—19 | Its owner puts it on their choice of the top or bottom of their library. 20 | Gain control of it until the end of
  // your next turn.": the target chosen as it's cast, the roll as it resolves (rulings); control until the cleanup step of
  // your next turn (CR 514.2, 611.2a), layer 2.
  if (text === "Choose target creature an opponent controls, then roll a d20. 1—9 | Return it to its owner's hand. 10—19 | Its owner puts it on their choice of the top or bottom of their library. 20 | Gain control of it until the end of your next turn.") {
    const body = parseBody("Choose target creature an opponent controls, then roll a d20. 1—9 | Return it to its owner's hand. 10—19 | Its owner puts it on their choice of the top or bottom of their library. 20 | Destroy it.", { spell: true });
    const [roll, , , last] = body?.effects ?? [];
    const d = last?.type === "if" && last.effects.length === 1 ? last.effects[0] : undefined;
    if (!body || body.effects.length !== 4 || body.targets.length !== 1 || roll?.type !== "roll" || roll.sides !== 20 || last?.type !== "if" || last.cond.kind !== "rollIn" || last.cond.min !== 20 || d?.type !== "destroy" || d.what.ref !== "target" || d.what.index !== 0) return null;
    const control: Effect = { type: "continuous", what: { ref: "target", index: 0 }, mods: [{ kind: "control" }], duration: "endOfYourNextTurn" };
    return { ...body, effects: [...body.effects.slice(0, 3), { ...last, effects: [control] }], text };
  }
  return undefined;
}
