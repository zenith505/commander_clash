// Round 416's sentences (round373Sentence in oracle/round373.ts reads these first) and whole lines (compile.ts, before
// round 415's): a secret vote for up to one creature (Vault 11: Voter's Dilemma), a permanent given to the player Blim,
// Comedic Genius dealt combat damage to, then each player paying for the permanents they control but don't own, and
// counters put at the same time as one event (Invisible Woman, Sue Storm; Aragorn, Company Leader).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseTargetPhrase } from "./targets";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");
const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const CREATURE: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };

export function round416Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  // Vault 11: Voter's Dilemma: "Each player secretly votes for up to one creature, then those votes are revealed. If no
  // creature got votes, each player draws a card. Otherwise, destroy each creature with the most votes or tied for most
  // votes." (its "then those votes are revealed" folded into the vote by parseBodyText). Starting with you, in turn order,
  // each player writes down a creature or nothing for each vote they have (CR 701.38a, 701.38d), unseen by the others
  // (rulings), not targeted; then, as it resolves (CR 608.2c), with no vote for any creature (none on the battlefield
  // too), each player draws a card, else each creature with the most votes, or tied, is destroyed. Its "whenever players
  // finish voting" triggers only with a vote for a creature, as for any vote (run-votes.ts).
  if (line === "Each player secretly votes for up to one creature" && plain(sentences[si + 1]) === "If no creature got votes, each player draws a card" && plain(sentences[si + 2]) === "Otherwise, destroy each creature with the most votes or tied for most votes") {
    if (ctx.vote) return "fail";
    effects.push({ type: "vote", among: CREATURE, secret: true, upTo: true, text: "vote for up to one creature" });
    ctx.vote = { among: true };
    return {
      effect: { type: "if", cond: { kind: "noVotes" }, effects: [{ type: "draw", who: { ref: "eachPlayer" }, n: 1 }], otherwise: [{ type: "destroy", what: { ref: "voted" } }] },
      next: si + 3,
    };
  }
  return null;
}

const BLIM = "Whenever ~ deals combat damage to a player, that player gains control of target permanent you control. Then each player loses life and discards cards equal to the number of permanents they control but don't own.";
const SUE = "Whenever you put one or more +1/+1 counters on one or more other Heroes you control, you may create a 0/4 colorless Wall creature token with defender.";
const ARAGORN_RING = "Whenever the Ring tempts you, if you chose a creature other than ~ as your Ring-bearer, put your choice of a counter from among first strike, vigilance, deathtouch, and lifelink on ~.";
const ARAGORN_COUNTERS = "Whenever you put one or more counters on ~, put one of each of those kinds of counters on up to one other target creature.";

/** One whole line of round 416's (compile.ts); false when it isn't one of these. */
export function round416Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Blim, Comedic Genius: the player it dealt combat damage to (the trigger's player) gains control of the target, for
  // good (rulings: it doesn't end with cleanup or as Blim leaves; it ends as that player leaves the game, CR 800.4a);
  // you choose it as the trigger goes on the stack, not them (rulings, CR 603.3d), and they can't refuse it. Then each
  // player loses life and discards cards, each their own number: the permanents they control but don't own, all of them,
  // not only ones Blim gave (rulings), counted as it resolves (CR 608.2h), the same number for both. With the target
  // illegal as it resolves, the ability does nothing (rulings, CR 608.2b).
  if (line === BLIM) {
    const t = isSpell ? null : parseTrigger("Whenever ~ deals combat damage to a player, that player discards a card.");
    const spec = parseTargetPhrase("permanent you control");
    const d = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfDealsCombatDamageToPlayer" || t.body.targets.length || d?.type !== "discard" || d.who.ref !== "eventPlayer" || spec?.kind !== "object" || spec.controller !== "you") return fail(out, raw);
    const theirs = { count: { kind: "permanents" as const, filter: { kind: "object" as const, types: [], notTypes: [], notColors: [], text: "permanents they control but don't own" }, whose: { ref: "eachOne" as const }, notOwnedByController: true as const } };
    out.triggers.push({
      ...t,
      body: {
        targets: [{ ...spec, text: "target permanent you control" }],
        effects: [
          { type: "continuous", what: { ref: "target", index: 0 }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "eventPlayer" } },
          { type: "loseLife", who: { ref: "eachPlayer" }, n: theirs },
          { type: "discard", who: { ref: "eachPlayer" }, n: theirs, random: false },
        ],
        text: line.slice("Whenever ~ deals combat damage to a player, ".length),
      },
    });
    return true;
  }
  // Invisible Woman, Sue Storm: once for each event of putting +1/+1 counters, by you, on one or more other Heroes you
  // control at the same time (one instruction, counters.ts batchCountersPut; entering with them too, CR 122.6), however
  // many Heroes got them; not for counters an opponent puts on them, nor for those on herself.
  if (line === SUE) {
    const t = isSpell ? null : parseTrigger("Whenever you put one or more +1/+1 counters on another creature you control, you may create a 0/4 colorless Wall creature token with defender.");
    const hero = parseTargetPhrase("Hero you control");
    if (!t || t === "fail" || t.event !== "permanentCountersPut" || t.countersKind !== "+1/+1" || !t.countersByYou || !t.tappedFilter?.notSource || t.countersEach || hero?.kind !== "object" || hero.controller !== "you" || !hero.subtypes?.includes("Hero")) return fail(out, raw);
    out.triggers.push({ ...t, event: "countersPutBatch", tappedFilter: { ...hero, notSource: true, text: "other Heroes you control" }, body: { ...t.body, text: line.slice(line.indexOf(", you may ") + 2) } });
    return true;
  }
  // Aragorn, Company Leader: "if you chose a creature other than ~ as your Ring-bearer" (an intervening if, CR 603.4,
  // TriggeredAbility.ifOtherBearer, choosing the one you had again counts as choosing it, rulings), then one of the four
  // keyword counters of your choice as it resolves (CR 122.1b, 608.2d).
  if (line === ARAGORN_RING) {
    const t = isSpell ? null : parseTrigger("Whenever the Ring tempts you, if you chose a creature other than ~ as your Ring-bearer, put your choice of a first strike, vigilance, deathtouch, or lifelink counter on ~.");
    const e = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "ringTemptsYou" || !t.ifOtherBearer || t.body.effects.length !== 1 || e?.type !== "either" || e.options.length !== 4) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, text: line.slice(line.indexOf(", put ") + 2) } });
    return true;
  }
  // Aragorn: "Whenever you put one or more counters on ~": once for each event of putting counters on it, by you (one
  // instruction, or as it enters, CR 122.6), whatever kinds and however many; "one of each of those kinds" is each kind
  // put on it in that event (TriggerEventInfo.counterKinds), one counter of each, on up to one other target creature
  // (chosen as the trigger goes on the stack, CR 603.3d), all at once.
  if (line === ARAGORN_COUNTERS) {
    const t = isSpell ? null : parseTrigger("Whenever you put one or more counters on ~, put a +1/+1 counter on up to one other target creature.");
    const e = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfCountersPut" || !t.countersByYou || t.countersKind !== undefined || t.countersEach || t.body.targets.length !== 1 || !t.body.targets[0]!.optional || t.body.effects.length !== 1 || e?.type !== "counters" || e.n !== 1) return fail(out, raw);
    out.triggers.push({ ...t, event: "countersPutBatch", body: { ...t.body, effects: [{ ...e, eventCounterKinds: true }], text: line.slice(line.indexOf(", put ") + 2) } });
    return true;
  }
  return false;
}
