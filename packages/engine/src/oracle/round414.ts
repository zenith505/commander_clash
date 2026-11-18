// Round 414's whole lines (compile.ts): Elrond of the White Council (a secret council vote whose voters give creatures
// away), Boltbender (new targets for any number of spells and abilities) and Confusion in the Ranks (a target chosen by
// the entering permanent's controller, then an exchange of control).
import type { Amount, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const ELROND = `When ~ enters, each player secretly votes for fellowship or aid, then those votes are revealed. For each fellowship vote, the voter chooses a creature they control. You gain control of each creature chosen this way, and they gain "~ can't attack its owner." Then for each aid vote, put a +1/+1 counter on each creature you control.`;
const BOLTBENDER = "When ~ is turned face up, you may choose new targets for any number of other spells and/or abilities.";
const CONFUSION = "Whenever an artifact, creature, or enchantment enters, its controller chooses target permanent another player controls that shares a card type with it. Exchange control of those permanents.";

/** One whole line of round 414's (compile.ts); false when it isn't one of these. */
export function round414Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Elrond of the White Council (rulings): no one votes until the ability resolves; each player votes in secret (CR
  // 701.38, Effect vote `secret`), extra votes included, and no one abstains. Then, starting with the player whose turn it
  // is, each player who voted fellowship chooses a creature they control for each such vote (the same one again allowed;
  // none with no creature), and the ability's controller gains control of all of them at once, for good, each gaining
  // "This creature can't attack its owner." (both layer 2 and 6 effects from the same resolution, CR 613.1b, 613.1f).
  // Finally a +1/+1 counter for each aid vote on each creature that player controls then, the gained ones included, all
  // of one creature's at once (as Lieutenants of the Guard's "put a +1/+1 counter on ~ for each strength vote").
  if (line === ELROND) {
    const t = isSpell ? null : parseTrigger("When ~ enters, each player secretly votes for fellowship or aid, then those votes are revealed.");
    const v = t && t !== "fail" ? t.body.effects[0] : undefined;
    const grant = parseBody(`Gain control of target creature. It gains "This creature can't attack its owner."`, {});
    const counters = parseBody("Put a +1/+1 counter on each creature you control.", {});
    const g = grant?.effects[1];
    const c = counters?.effects[0];
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.targets.length || t.body.effects.length !== 1 || v?.type !== "vote" || !v.secret || v.options?.join("|") !== "fellowship|aid") return fail(out, raw);
    if (grant?.effects.length !== 2 || g?.type !== "continuous" || g.mods.length !== 1 || g.mods[0]!.kind !== "addAbility" || g.duration !== "game") return fail(out, raw);
    if (counters?.effects.length !== 1 || c?.type !== "counters" || c.what.ref !== "each" || c.n !== 1) return fail(out, raw);
    const aid: Amount = { count: { kind: "votes", option: "aid" } };
    const effects: Effect[] = [
      v,
      { type: "controlFromEach", votedFor: "fellowship", voterChooses: true, duration: "game" },
      { ...g, what: { ref: "created" } },
      { type: "if", cond: { kind: "amountNow", amount: aid, min: 1 }, effects: [{ ...c, n: aid }] },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.slice("When ~ enters, ".length).replace('"~ can\'t', '"This creature can\'t') } });
    return true;
  }
  // Boltbender: as the trigger resolves, its controller may choose new targets for each other spell and ability on the
  // stack (CR 115.7d; Effect newTargetsAny): any of them, legal for that spell's or ability's controller (rulings: "those
  // new targets must be legal"); the number of targets and a division of damage or counters stay as they were (rulings).
  // None are targeted by the trigger, so it has no targets of its own.
  if (line === BOLTBENDER) {
    const t = isSpell ? null : parseTrigger("When ~ is turned face up, draw a card.");
    if (!t || t === "fail" || t.event !== "selfTurnedFaceUp" || t.body.targets.length) return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "newTargetsAny" }], text: line.slice("When ~ is turned face up, ".length) } });
    return true;
  }
  // Confusion in the Ranks (rulings): any player's artifact, creature or enchantment entering, Confusion itself too. The
  // entering permanent's controller (as it is, or last was, on the battlefield) chooses the target as the trigger is put
  // on the stack (CR 603.3d, TargetSpec.chosenBy "subjectController"): a permanent another player controls (with no teams,
  // every other player is an opponent, CR 102.3) that shares a card type with the entering one (any card type, so a land
  // if the entering permanent is an artifact land, rulings). It isn't optional; with no legal choice the trigger is
  // removed (CR 603.3d). As it resolves, the two are exchanged only if both are still on the battlefield and still share
  // a card type (rulings; Effect exchangeWithSubject).
  if (line === CONFUSION) {
    const t = isSpell ? null : parseTrigger("Whenever an artifact, creature, or enchantment enters, its controller draws a card.");
    const types = t && t !== "fail" ? t.enters?.filter.types : undefined;
    if (!t || t === "fail" || t.event !== "permanentEnters" || types?.join("|") !== "Artifact|Creature|Enchantment" || t.body.targets.length || t.body.effects[0]?.type !== "draw" || t.body.effects[0].who.ref !== "subjectController") return fail(out, raw);
    const target: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], chosenBy: "subjectController", opponentOfSubjectController: true, sharesCardTypeWithSubject: true, text: "permanent another player controls that shares a card type with it" };
    out.triggers.push({ ...t, body: { targets: [target], effects: [{ type: "exchangeWithSubject", index: 0 }], text: line.slice("Whenever an artifact, creature, or enchantment enters, ".length) } });
    return true;
  }
  return false;
}
