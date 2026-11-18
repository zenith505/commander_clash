// Round 415's whole lines (compile.ts): copies of a spell or ability aimed at the other things it could target.
// Mischievous Quanar (copy target instant or sorcery spell as it's turned face up), Radiate and Radiant Performer (a copy
// for each other permanent or player), Agrus Kos, Eternal Soldier (a copy of an ability for each other creature you
// control) and Exterminator Magmarch (a copy aimed at another opponent's permanent).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { stackSpec } from "./sentences/spells";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const QUANAR = "When ~ is turned face up, copy target instant or sorcery spell. You may choose new targets for that copy.";
const RADIATE = "Choose target instant or sorcery spell that targets only a single permanent or player. Copy that spell for each other permanent or player the spell could target. Each copy targets a different one of those permanents and players.";
const PERFORMER = "When ~ enters, if you cast it from your hand, choose target spell or ability that targets only a single permanent or player. Copy that spell or ability for each other permanent or player the spell or ability could target. Each copy targets a different one of those permanents and players.";
const AGRUS = "Whenever ~ becomes the target of an ability that targets only it, you may pay {1}{R/W}. If you do, copy that ability for each other creature you control that ability could target. Each copy targets a different one of those creatures.";
const MAGMARCH = "Whenever you cast an instant or sorcery spell that targets only a single nonland permanent an opponent controls, if another opponent controls one or more nonland permanents that spell could target, choose one of those permanents. Copy that spell. The copy targets the chosen permanent.";

/** "A permanent", for copySpell eachOther `orPlayers` (every permanent, each checked against the spell's own targets). */
const PERMANENT: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], text: "permanent" };

/** Radiate's and Radiant Performer's copy: one for each other permanent or player, each aimed at that one (CR 707.10c). */
const eachOtherAny: Effect = { type: "copySpell", spell: { target: 0 }, n: "eachOther", newTargets: false, eachOther: { among: PERMANENT, orPlayers: true } };

/** One whole line of round 415's (compile.ts); false when it isn't one of these. */
export function round415Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Mischievous Quanar: "copy target instant or sorcery spell. You may choose new targets for that copy." as Twincast's,
  // from a trigger as it's turned face up (CR 708.8: a special action, so even under split second, rulings); its target
  // is chosen as the trigger is put on the stack (CR 603.3d).
  if (line === QUANAR) {
    const t = isSpell ? null : parseTrigger("When ~ is turned face up, copy target instant or sorcery spell. You may choose new targets for the copy.");
    const e = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfTurnedFaceUp" || t.body.targets.length !== 1 || t.body.effects.length !== 1 || e?.type !== "copySpell" || !e.newTargets || e.n !== 1) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, text: line.slice("When ~ is turned face up, ".length) } });
    return true;
  }
  // Radiate: a target spell all of whose targets name one permanent or player (TargetSpec.targetsOnlyPermanentOrPlayer,
  // rulings on Radiant Performer: several targets naming it count). As it resolves, a copy for each other permanent and
  // player still in the game that every target of the spell could legally name for the copies' controller, Radiate's
  // (CR 707.10c), with the spell as their source (protection, hexproof); none for one it couldn't (rulings). Every copy
  // is one you control, aimed at that one in each of its targets, in the order you choose (rulings: the original resolves
  // after all of them). Modes, X and additional costs paid are copied (CR 707.10). No copy is made for the one it
  // targets, and nothing at all if Radiate's target is illegal by then (CR 608.2b).
  if (line === RADIATE) {
    const body = isSpell && !out.spell ? parseBody("Copy target instant or sorcery spell.", { spell: true }) : null;
    const spec = body?.targets[0];
    if (!body || body.targets.length !== 1 || spec?.kind !== "spell" || body.effects[0]?.type !== "copySpell") return fail(out, raw);
    out.spell = { targets: [{ ...spec, targetsOnlyPermanentOrPlayer: true, text: "target instant or sorcery spell that targets only a single permanent or player" }], effects: [eachOtherAny], text: line };
    return true;
  }
  // Radiant Performer: the same for a spell or an activated or triggered ability (CR 115.1, stackSpec), from an enters
  // trigger with an intervening "if you cast it from your hand" (CR 603.4). An ability's copies are this ability's
  // controller's too (CR 707.10c), its source the original's (CR 113.7a). The target is required (CR 603.3d): with none
  // on the stack the trigger is removed.
  if (line === PERFORMER) {
    const t = isSpell ? null : parseTrigger("When ~ enters, if you cast it from your hand, draw a card.");
    if (!t || t === "fail" || t.event !== "selfEnters" || !t.ifCastFromHand || t.body.targets.length || t.body.effects.length !== 1) return fail(out, raw);
    const spec: TargetSpec = { ...stackSpec("spell or ability"), targetsOnlyPermanentOrPlayer: true, text: "target spell or ability that targets only a single permanent or player" };
    out.triggers.push({ ...t, body: { targets: [spec], effects: [eachOtherAny], text: line.slice("When ~ enters, ".length) } });
    return true;
  }
  // Agrus Kos, Eternal Soldier (rulings): any player's activated or triggered ability all of whose targets are Agrus Kos
  // (several naming it count), once for each such ability. As the trigger resolves, if you pay {1}{R/W}, a copy for each
  // other creature you control that ability could target, aimed at it in each of its targets; any creature it couldn't
  // legally target (protection, targeting restrictions) is left out. You control the copies whoever controlled the
  // ability (CR 707.10c), and choose the order they go on the stack; the original resolves last. Modes and X are copied.
  // None if the ability has left the stack.
  if (line === AGRUS) {
    const t = isSpell ? null : parseTrigger("Whenever ~ becomes the target of a spell or ability, you may pay {1}{R/W}. If you do, draw a card.");
    const may = t && t !== "fail" ? t.body.effects[0] : undefined;
    const among = parseBody("Destroy target creature you control.", {})?.targets[0];
    if (!t || t === "fail" || t.event !== "selfBecomesTarget" || t.body.targets.length || t.body.effects.length !== 1 || may?.type !== "may" || may.pay?.mana !== "{1}{R/W}" || among?.kind !== "object" || among.controller !== "you") return fail(out, raw);
    const copy: Effect = { type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among: { ...among, text: "other creature you control" }, copier: true } };
    out.triggers.push({ ...t, targeted: { ability: true, onlySelf: true }, body: { targets: [], effects: [{ ...may, effects: [copy], text: "pay {1}{R/W}. If you do, copy that ability for each other creature you control that ability could target" }], text: line.slice("Whenever ~ becomes the target of an ability that targets only it, ".length) } });
    return true;
  }
  // Exterminator Magmarch (rulings): an instant or sorcery spell you cast all of whose targets name one nonland permanent
  // an opponent controls, with an intervening "if" (CR 603.4): another opponent (not the one who controls that permanent)
  // controls a nonland permanent every target of the spell could name. As it resolves you choose one such permanent, and
  // the copy (yours, not cast, CR 707.10) targets it in each of its targets; nothing if there's none by then. The copy is
  // made even if the spell has been countered, from it as it last was (CR 608.2h).
  if (line === MAGMARCH) {
    const t = isSpell ? null : parseTrigger("Whenever you cast an instant or sorcery spell that targets only a single nonland permanent an opponent controls, draw a card.");
    const only = t && t !== "fail" ? t.cast?.targetsOnly : undefined;
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "you" || !only || only === "self" || only.controller !== "opponent" || t.body.targets.length) return fail(out, raw);
    const among: TargetSpec = { ...only, text: "nonland permanent another opponent controls" };
    out.triggers.push({
      ...t,
      cast: { ...t.cast!, otherOpponentsCouldTarget: among },
      body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among, chooseOne: true, otherOpponentOfTarget: true, evenIfGone: true } }], text: line.replace(/^Whenever [^,]+, /, "") },
    });
    return true;
  }
  return false;
}
