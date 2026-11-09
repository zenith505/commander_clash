// Round 319's sentences, read before round 318's (see round318Sentence in oracle/round318.ts).
import type { AbilityBody, Effect } from "../abilities";
import { addTarget, type Ctx } from "./body";
import { parseObject, parsePlayer } from "./targets";
import { parseSentence } from "./sentence";

type Found = { effect: Effect; next: number } | "fail" | null;

/** Several effects for one sentence: all but the last pushed before it. */
const pushed = (effects: Effect[], before: Effect[], last: Effect, next: number): Found => {
  effects.push(...before);
  return { effect: last, next };
};

export function round319Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Gollum, Scheming Guide: "look at the top two cards of your library, put them back in any order, then choose land or
  // nonland. An opponent guesses whether the top card of your library is the chosen kind. Reveal that card. If they
  // guessed right, remove ~ from combat. Otherwise, you draw a card and ~ can't be blocked this turn." You choose the
  // opponent who guesses as it resolves; with an empty library no guess is right (rulings), and the card is revealed
  // either way (rulings).
  // The sentence splitter breaks it at ", then".
  if (/^look at the top two cards of your library, put them back in any order$/.test(s) && sentences[si + 1] === "Choose land or nonland" && !ctx.spell) {
    const want = ["Choose land or nonland", "An opponent guesses whether the top card of your library is the chosen kind", "Reveal that card", "If they guessed right, remove ~ from combat"];
    if (want.some((w, i) => sentences[si + 1 + i] !== w)) return "fail";
    const right = parseSentence("Remove ~ from combat", ctx);
    if (sentences[si + 5] !== "Otherwise, you draw a card and ~ can't be blocked this turn") return "fail";
    const draw = parseSentence("You draw a card", ctx);
    const unblockable = parseSentence("~ can't be blocked this turn", ctx);
    if (right?.length !== 1 || draw?.length !== 1 || unblockable?.length !== 1) return "fail";
    const wrongFx = [...draw, ...unblockable];
    return pushed(effects, [{ type: "orderTop", who: { ref: "you" }, n: 2 }, { type: "choose", choice: "landOrNonland" }], { type: "guessTopKind", right, wrong: wrongFx }, si + 6);
  }
  // Vaevictis Asmadi, the Dire: "for each player, choose target permanent that player controls. Those players sacrifice
  // those permanents. Each player who sacrificed a permanent this way reveals the top card of their library, then puts it
  // onto the battlefield if it's a permanent card." One target for each player, you included (rulings), all of them
  // required: if any player controls nothing it could target, the ability is removed from the stack (rulings, CR
  // 603.3d). Only a player whose permanent was sacrificed reveals (rulings).
  if (/^for each player, choose target permanent that player controls$/.test(s) && !ctx.spell) {
    // The sentence splitter breaks the last one at ", then".
    const want = ["Those players sacrifice those permanents", "Each player who sacrificed a permanent this way reveals the top card of their library", "Puts it onto the battlefield if it's a permanent card"];
    if (want.some((w, i) => sentences[si + 1 + i] !== w)) return "fail";
    const before = ctx.targets.length;
    const what = parseObject("target permanent", ctx);
    if (what?.ref !== "target" || ctx.targets.length !== before + 1) return "fail";
    const spec = ctx.targets[before]!;
    if (spec.kind !== "object" || spec.controller) return "fail";
    ctx.targets[before] = { ...spec, perOpponent: true, perPlayer: true, perOpponentRequired: true, perPlayerAll: true, text: "target permanent that player controls" };
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = undefined;
    return { effect: { type: "sacrificeTargetsReveal", what }, next: si + 4 };
  }
  // Midnight Crusader Shuttle: "defending player faces a villainous choice — That player sacrifices a creature of their
  // choice, or you gain control of a creature of your choice that player controls until end of turn. If you gain control
  // of a creature this way, tap it, and it's attacking that player." The second option is all of the next sentence too
  // (CR 701.55a): you choose one of that player's creatures as it's done, gain control of it until end of turn, then tap
  // it and it's attacking that player, never declared as an attacker (rulings, CR 506.3).
  const shuttle = /^defending player faces a villainous choice — That player sacrifices a creature of their choice, or you gain control of a creature of your choice that player controls until end of turn$/.exec(s);
  if (shuttle && !ctx.spell) {
    if (sentences[si + 1] !== "If you gain control of a creature this way, tap it, and it's attacking that player") return "fail";
    const v = parseSentence("defending player faces a villainous choice — That player sacrifices a creature of their choice, or that player loses 1 life", ctx);
    const control = parseSentence("Gain control of target creature until end of turn", { ...ctx, targets: [] });
    if (v?.length !== 1 || v[0]!.type !== "villainous" || control?.length !== 1 || control[0]!.type !== "continuous") return "fail";
    const creature = { kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
    const steal: Effect[] = [
      { type: "pick", who: { ref: "eventPlayer" }, filter: creature, n: 1, action: "choose", youChoose: true, prompt: "click one of {player} creatures to gain control of it until end of turn, tapped and attacking them" },
      { ...control[0]!, what: { ref: "created" } },
      { type: "attackingNow", what: { ref: "created" }, whom: { ref: "eventPlayer" } },
    ];
    const labels: [string, string] = [v[0]!.labels[0]!, "You gain control of a creature of your choice that player controls until end of turn, tapped and attacking that player"];
    return { effect: { ...v[0]!, options: [v[0]!.options[0]!, steal], labels }, next: si + 2 };
  }
  // Genesis of the Daleks, chapter IV: "Target opponent faces a villainous choice — Destroy all Dalek creatures and each of
  // your opponents loses life equal to the total power of Daleks that died this turn, or destroy all non-Dalek creatures."
  // The first option is both, in order: the Daleks destroyed this way count, each as it last existed (CR 608.2h), and so
  // do the Daleks that died earlier this turn, anyone's.
  const daleks = /^Target opponent faces a villainous choice — Destroy all ([A-Z][a-z]+) creatures and each of your opponents loses life equal to the total power of \1s that died this turn, or destroy all non-\1 creatures$/.exec(s);
  if (daleks) {
    const kind = daleks[1]!;
    const v = parseSentence(`Target opponent faces a villainous choice — Destroy all ${kind} creatures, or destroy all non-${kind} creatures`, ctx);
    if (v?.length !== 1 || v[0]!.type !== "villainous" || v[0]!.options[0]!.length !== 1 || v[0]!.options[0]![0]!.type !== "destroy") return "fail";
    const lose: Effect = { type: "loseLife", who: { ref: "eachOpponent" }, n: { count: { kind: "diedThisTurnPower", subtype: kind } } };
    const labels: [string, string] = [`Destroy all ${kind} creatures and each of your opponents loses life equal to the total power of ${kind}s that died this turn`, v[0]!.labels[1]!];
    return { effect: { ...v[0]!, options: [[...v[0]!.options[0]!, lose], v[0]!.options[1]!], labels }, next: si + 1 };
  }
  // Danse Macabre: "1—14 | Return a creature card put into a graveyard this way to the battlefield under your control. 15+ |
  // Return up to two creature cards put into graveyards this way to the battlefield under your control." After "each
  // player sacrifices a nontoken creature of their choice"; you choose among those cards (rulings).
  if (ctx.spell && s === "Return a creature card put into a graveyard this way to the battlefield under your control") return { effect: { type: "returnSacrificedCards", n: 1 }, next: si + 1 };
  if (ctx.spell && s === "Return up to two creature cards put into graveyards this way to the battlefield under your control") return { effect: { type: "returnSacrificedCards", n: 2, upTo: true }, next: si + 1 };
  // Eumidian Wastewaker: "you and defending player each discard a card or sacrifice a permanent. You draw a card for each
  // land card put into a graveyard this way."
  if (!ctx.spell && s === "you and defending player each discard a card or sacrifice a permanent") {
    if (sentences[si + 1] !== "You draw a card for each land card put into a graveyard this way") return "fail";
    const them = parsePlayer("defending player", ctx);
    if (!them) return "fail";
    return { effect: { type: "discardOrSacrifice", players: [{ ref: "you" }, them], drawPerLand: true }, next: si + 2 };
  }
  // Soulfire Eruption: "Choose any number of target creatures, planeswalkers, and/or players. For each of them, exile the
  // top card of your library, then ~ deals damage equal to that card's mana value to that permanent or player. You may
  // play the exiled cards until the end of your next turn." The splitter breaks the second sentence at ", then".
  if (ctx.spell && s === "Choose any number of target creatures, planeswalkers, and/or players") {
    const want = ["For each of them, exile the top card of your library", "~ deals damage equal to that card's mana value to that permanent or player", "You may play the exiled cards until the end of your next turn"];
    if (want.some((w, i) => sentences[si + 1 + i] !== w) || ctx.targets.length) return "fail";
    const index = addTarget(ctx, { kind: "any", types: ["Creature", "Planeswalker"], many: "any", text: "any number of target creatures, planeswalkers, and/or players" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = undefined;
    return { effect: { type: "exileTopDamageEach", to: { ref: "anyTarget", index } }, next: si + 4 };
  }
  return null;
}

/**
 * Mogg Assassin: "You choose target creature an opponent controls, and that opponent chooses target creature. Flip a coin.
 * If you win the flip, destroy the creature you chose. If you lose the flip, destroy the creature your opponent chose."
 * Both targets are chosen as it's activated, yours first (rulings, CR 602.2b), the second by the controller of the first
 * (TargetSpec.chooserOf, askChoosers in game.ts); then the flip (CR 705.2).
 */
export function round319WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | null {
  if (text.trim() !== "You choose target creature an opponent controls, and that opponent chooses target creature. Flip a coin. If you win the flip, destroy the creature you chose. If you lose the flip, destroy the creature your opponent chose.") return null;
  const body = parse("Flip a coin. If you win the flip, destroy target creature an opponent controls. If you lose the flip, destroy target creature.");
  if (body?.targets.length !== 2 || body.targets[0]!.controller !== "opponent" || body.targets[1]!.controller) return null;
  return { ...body, targets: [body.targets[0]!, { ...body.targets[1]!, chosenBy: "opponent", chooserOf: 0 }], text };
}
