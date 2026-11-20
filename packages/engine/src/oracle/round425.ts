// Round 425's whole lines (compile.ts, before round 424's): Redemptor Dreadnought's optional exile as it's cast and its
// attack trigger linked to that card, and Kaya, Spirits' Justice's exile trigger and −2.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseLoyalty } from "./activated";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const REDEMPTOR_COST = "As an additional cost to cast ~, you may exile a creature card from your graveyard.";
const REDEMPTOR_ATTACK = "Whenever ~ attacks, if a card is exiled with it, it gets +X/+X until end of turn, where X is the power of the exiled card.";

const KAYA_TRIGGER = "Whenever one or more creatures you control and/or creature cards in your graveyard are put into exile, you may choose a creature card from among them. Until end of turn, target token you control becomes a copy of it, except it has flying.";
const KAYA_MINUS = "−2: Exile target creature you control. For each other player, exile up to one target creature that player controls.";

const creatureCard: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };

/** One whole line of round 425's (compile.ts); false when it isn't one of these. */
export function round425Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Redemptor Dreadnought's Fallen Warrior (a flavor word, CR 207.2c): an optional additional cost (CR 601.2b, 601.2h),
  // chosen and paid like a kicker cost with no mana, as "you may sacrifice an artifact" is (CompiledCard.kicker
  // `optional`); one creature card from your own graveyard. The card it exiles is linked to the permanent the spell
  // becomes (CR 607.2q, CompiledCard.costExileLinked), not to a later object (CR 400.7).
  if (line === REDEMPTOR_COST) {
    if (isSpell || out.kicker || out.costExileLinked) return fail(out, raw);
    out.kicker = { costs: [""], extraCosts: [{ kind: "exileFromGraveyard", n: 1, filter: creatureCard, linkSpell: true }], text: "exile a creature card from your graveyard", optional: true };
    out.costExileLinked = true;
    return true;
  }
  // Plasma Incinerator: an intervening if (CR 603.4), checked as it triggers and as it resolves: a card exiled to pay for
  // the spell that became this permanent, still that card in exile (CR 607.2q, 400.7). X is that card's power as a card
  // in exile (CR 208.1, 604.3: a characteristic-defining ability works there), counted as it resolves (CR 608.2h); all
  // of them added if there were several (CR 607.3).
  if (line === REDEMPTOR_ATTACK) {
    const t = isSpell || !out.costExileLinked ? null : parseTrigger("Whenever ~ attacks, it gets +1/+1 until end of turn.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfAttacks" || t.ifCond || e?.type !== "continuous" || e.duration !== "endOfTurn" || e.mods.length !== 1 || e.mods[0]!.kind !== "modifyPT") return fail(out, raw);
    const x = { count: { kind: "linkedExiledPT" as const, stat: "power" as const } };
    const effects: Effect[] = [{ ...e, mods: [{ ...e.mods[0]!, power: x, toughness: x }] }];
    out.triggers.push({ ...t, ifCond: { kind: "amount", amount: { count: { kind: "linkedExiled" } }, min: 1 }, body: { targets: [], effects, text: line.slice(line.indexOf(", if ") + 2) } });
    return true;
  }
  // Kaya, Spirits' Justice: once for each event (CR 603.2c) that exiles creatures you control (as they last existed on the
  // battlefield, CR 603.10a; tokens too, though no card of theirs can be chosen) and/or creature cards from your graveyard.
  // The token is targeted as it triggers (CR 603.3d); the card is chosen as it resolves, only one still in exile (rulings,
  // CR 400.7), or none ("you may"). The token copies that card as printed (rulings, CR 707.2; a double-faced card's front
  // face, CR 712.8a), plus flying (CR 707.9a), until end of turn (CR 611.2a).
  if (line === KAYA_TRIGGER) {
    const t = isSpell ? null : parseTrigger("Whenever one or more creature cards leave your graveyard, target token you control gains flying until end of turn.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "batch" || t.body.targets.length !== 1 || !t.body.targets[0]!.token || t.body.targets[0]!.controller !== "you" || e?.type !== "continuous" || e.duration !== "endOfTurn") return fail(out, raw);
    const effects: Effect[] = [{ type: "becomeCopyOfAmong", what: { ref: "target", index: 0 }, from: "eventGroup", filter: creatureCard, inExile: true, except: { keywords: ["Flying"] } }];
    out.triggers.push({ ...t, batch: { what: "exiledYourCreatures" }, body: { targets: [t.body.targets[0]!], effects, text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  // Kaya's −2: you choose every target (rulings): one creature you control, then up to one creature for each other player,
  // in a free-for-all game each of them an opponent (CR 102.3, 800.4a: a player who has left the game is none), as for
  // "for each opponent" (TargetSpec.perOpponent, CR 601.2c, 115.6). Exiled in that order, one event each (CR 608.2c).
  if (line === KAYA_MINUS) {
    const mine = isSpell ? null : parseLoyalty("−", "2", "Exile target creature you control.", raw);
    const theirs = isSpell ? null : parseLoyalty("−", "2", "For each opponent, exile up to one target creature that player controls.", raw);
    if (!mine || mine === "fail" || !theirs || theirs === "fail" || mine.loyalty !== -2 || theirs.loyalty !== -2 || mine.body.targets.length !== 1 || theirs.body.targets.length !== 1 || !theirs.body.targets[0]!.perOpponent || theirs.body.effects.length !== 1) return fail(out, raw);
    const other = theirs.body.effects[0]!;
    if (other.type !== "exile" || other.what.ref !== "target" || other.what.index !== 0) return fail(out, raw);
    const body = { targets: [...mine.body.targets, theirs.body.targets[0]!], effects: [...mine.body.effects, { ...other, what: { ref: "target" as const, index: 1 } }], text: line.slice(line.indexOf(": ") + 2) };
    out.activated.push({ ...mine, body, text: line });
    return true;
  }
  return false;
}
