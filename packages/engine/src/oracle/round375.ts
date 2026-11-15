// Round 375's whole lines (compile.ts, after round 374's): control for as long as a player is the monarch (Garland, Royal
// Kidnapper), a creature card put into an opponent's graveyard bought for life (Lorcan, Warlock Collector) and a dies
// trigger that gives the card to the target opponent at the next end step (Endless Whispers' granted ability), and a
// creature given away goaded for the rest of the game, with draws when creatures you own but don't control attack (Jon
// Irenicus, Shattered One).
import type { CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

export function round375Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Garland, Royal Kidnapper: "Whenever an opponent becomes the monarch, gain control of target creature that player
  // controls for as long as they're the monarch.": a control change (layer 2, CR 613.1b) lasting while the event player is
  // the monarch (CR 611.2b, 725.3); if they've stopped being it before the ability resolves, you don't gain control at all
  // (rulings).
  if (line === "Whenever an opponent becomes the monarch, gain control of target creature that player controls for as long as they're the monarch.") {
    const t = isSpell ? null : parseTrigger("Whenever an opponent becomes the monarch, gain control of target creature that player controls.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "opponentBecomesMonarch" || t.body.targets.length !== 1 || e?.type !== "continuous" || e.duration !== "game" || e.mods.length !== 1 || e.mods[0]!.kind !== "control") return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e, whileMonarch: { ref: "eventPlayer" } }], text: line.slice("Whenever an opponent becomes the monarch, ".length) } });
    return true;
  }
  // Lorcan, Warlock Collector: once for each creature card (CR 603.2c), a creature card as it is in the graveyard (rulings);
  // the life is its mana value as the trigger resolves (CR 608.2h); "If you do" puts it onto the battlefield under your
  // control if it's still that card in the graveyard (CR 400.7), a Warlock from then on (an effect of the ability, CR
  // 611.2c; a Warlock it makes is still a Warlock after Lorcan leaves).
  const LORCAN = "Whenever a creature card is put into an opponent's graveyard from anywhere, you may pay life equal to its mana value. If you do, put it onto the battlefield under your control. It's a Warlock in addition to its other types.";
  if (line === LORCAN) {
    const t = isSpell ? null : parseTrigger("Whenever a creature card is put into an opponent's graveyard from anywhere, you draw a card.");
    if (!t || t === "fail" || t.event !== "batch" || t.batch?.what !== "toGraveyard" || t.batch.whose !== "opponent" || !t.batch.each || t.batch.from || t.batch.filter?.types?.join() !== "Creature" || t.activeIf) return fail(out, raw);
    const put: Effect = { type: "putOntoBattlefield", what: { ref: "eventGroup" }, alsoMods: [{ kind: "addTypes", types: [], subtypes: ["Warlock"] }] };
    const text = line.slice("Whenever a creature card is put into an opponent's graveyard from anywhere, ".length);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "may", payLife: { count: { kind: "manaValue", of: { ref: "eventGroup" } } }, effects: [put], text: text.replace(/^you may /, "") }], text } });
    return true;
  }
  // Endless Whispers' granted "When this creature dies, choose target opponent. That player puts this card from its owner's
  // graveyard onto the battlefield under their control at the beginning of the next end step.": the creature's controller
  // targets one of their opponents (rulings) as the dies trigger is put on the stack (CR 603.3d); the delayed trigger
  // (CR 603.7) remembers that player, and returns the card only if it's still that card in the graveyard (CR 400.7) and the
  // player is still in the game (CR 800.4a).
  if (line === "When ~ dies, choose target opponent. That player puts ~ from its owner's graveyard onto the battlefield under their control at the beginning of the next end step.") {
    const t = isSpell ? null : parseTrigger("When ~ dies, return it to the battlefield under its owner's control at the beginning of the next end step.");
    const d = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const put = d?.type === "delayed" && d.effects.length === 1 ? d.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfDies" || t.body.targets.length || d?.type !== "delayed" || d.when !== "nextEndStep" || d.each !== "selfCard" || put?.type !== "putOntoBattlefield" || !put.owner) return fail(out, raw);
    const { owner: _owner, ...rest } = put;
    const delayed: Effect = { ...d, event: { player: { ref: "target", index: 0 } }, effects: [{ ...rest, under: { ref: "eventPlayer" }, putByUnder: true }], text: "that player puts ~ from its owner's graveyard onto the battlefield under their control" };
    out.triggers.push({ ...t, body: { targets: [{ kind: "player", opponent: true, text: "target opponent" }], effects: [delayed], text: line.slice("When ~ dies, ".length) } });
    return true;
  }
  // Jon Irenicus, Shattered One: at the beginning of your end step (CR 513.1a), the opponent gains control of up to one
  // target creature you control (layer 2, CR 613.1b) for the rest of the game; two +1/+1 counters, tapped, goaded by you
  // (CR 701.15a) for the rest of the game, and "can't be sacrificed", all as it resolves, with no window for that player
  // to sacrifice it first (rulings). Each part needs its target legal as it resolves (CR 608.2b).
  if (line === "At the beginning of your end step, target opponent gains control of up to one target creature you control. Put two +1/+1 counters on it and tap it. It's goaded for the rest of the game and it gains \"~ can't be sacrificed.\"") {
    const t = isSpell ? null : parseTrigger("At the beginning of your end step, draw a card.");
    const b = parseBody("Target opponent gains control of target creature you control. Put two +1/+1 counters on it and tap it. Goad it.");
    const [give, counters, tap, goad] = b?.effects ?? [];
    const it = { ref: "target" as const, index: 1 };
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.ifCond || !b || b.targets.length !== 2 || b.targets[1]!.kind !== "object" || b.effects.length !== 4 || give?.type !== "continuous" || !give.giveTo || give.duration !== "game" || counters?.type !== "counters" || tap?.type !== "tap" || goad?.type !== "continuous" || goad.mods[0]?.kind !== "goad") return fail(out, raw);
    const targets = [b.targets[0]!, { ...b.targets[1]!, optional: true as const }];
    const effects: Effect[] = [give, counters, tap, { ...goad, duration: "game" }, { type: "continuous", what: it, mods: [{ kind: "cantBeSacrificed" }], duration: "game" }];
    out.triggers.push({ ...t, body: { targets, effects, text: line.slice("At the beginning of your end step, ".length) } });
    return true;
  }
  // Jon Irenicus: "Whenever a creature you own but don't control attacks, you draw a card.": any creature declared as an
  // attacker (CR 508.3a) that you own (CR 108.3) and another player controls.
  if (line === "Whenever a creature you own but don't control attacks, you draw a card.") {
    const t = isSpell ? null : parseTrigger("Whenever a creature attacks, you draw a card.");
    if (!t || t === "fail" || t.event !== "creatureYouControlAttacks" || !t.attacker?.anyone || t.attacker.filter.kind !== "object" || t.attacker.filter.controller || t.attacker.filter.owner) return fail(out, raw);
    out.triggers.push({ ...t, attacker: { ...t.attacker, filter: { ...t.attacker.filter, owner: "you", controller: "opponent", text: "creature you own but don't control" } } });
    return true;
  }
  return false;
}
