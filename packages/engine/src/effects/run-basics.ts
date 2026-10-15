import type { Effect } from "../abilities";
import { defOf, objIsType, power, toughness } from "../cards";
import { draw, gainLife, giveCitysBlessing, log, loseLife, player } from "../game";
import { MONARCH } from "../oracle";
import { invalidateCharacteristics } from "../layers";
import { dealDamage, objectSource } from "../damage";
import type { GameObject, GameState, PlayerId } from "../types";
import { ResolveCtx, objects, players, amountNow, runEffectInner, damageRecipients, ctxSource } from "./resolve";
import { fireEvent } from "./triggers";

/** Damage, prevention, drawing, energy, life, the monarch, fighting. */
export function runBasicsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "ascend":
      giveCitysBlessing(s, ctx.controller, true); // CR 702.131a
      return;
    case "damage": {
      const amount = amountNow(s, e.amount, ctx);
      const all = [e.to, ...(e.also ?? [])].map((to) => damageRecipients(s, to, ctx));
      const objs = all.flatMap((x) => x.objs);
      const pids = all.flatMap((x) => x.pids);
      const from = ctxSource(s, ctx);
      // All dealt at once: lifelink is one life-gain event (CR 119.10).
      const lifelink = { n: 0 };
      let dealt = 0;
      for (const o of objs) {
        const n = dealDamage(s, from, { object: o }, amount, { lifelink });
        dealt += n;
        if (n > 0 && s.resolving) (s.resolving.damagedThisWay ??= []).push(o.id);
      }
      for (const pid of pids) dealt += dealDamage(s, from, { player: pid }, amount, { lifelink });
      gainLife(s, from.controller, lifelink.n);
      if (dealt && from.id) fireEvent(s, { type: "dealtDamage", id: from.id, amount: dealt, combat: false });
      return;
    }
    case "preventNext": {
      // A shield for the next N damage this turn (CR 615.7), used up by damage from any source.
      const n = amountNow(s, e.n, ctx);
      const { objs, pids } = damageRecipients(s, e.to, ctx);
      for (const x of [...objs, ...pids.map((pid) => player(s, pid))]) {
        x.preventNext = (x.preventNext ?? 0) + n;
        log(s, `${src} will prevent the next ${n} damage to ${"cardId" in x ? defOf(s, x).name : x.name} this turn.`);
      }
      return;
    }
    case "preventCombatDamage":
      s.preventCombatDamage = true;
      log(s, `${src}: all combat damage will be prevented this turn.`);
      return;
    case "pumpPerBlocker":
      for (const o of objects(s, e.what, ctx)) {
        // Counted as it resolves (CR 702.23b).
        const n = (o.blockedBy?.length ?? 0) - (e.beyondFirst ? 1 : 0);
        if (n <= 0) continue;
        runEffectInner(s, { type: "continuous", what: e.what, mods: [{ kind: "modifyPT", power: e.power * n, toughness: e.toughness * n }], duration: "endOfTurn" }, ctx);
      }
      return;
    case "draw": {
      // Worked out for each player in turn: "draws cards equal to the number of cards in their hand". A draw that
      // stops for dredge (CR 702.52a) is finished by the answer, and this carries on with the next player.
      const sc = (s.resolving!.scratch ??= {});
      const queue = (sc.drawQueue ??= players(s, e.who, ctx));
      while (queue.length) {
        const pid = queue.shift()!;
        const n = amountNow(s, e.n, ctx);
        log(s, `${player(s, pid).name} draws ${n} card${n === 1 ? "" : "s"}.`);
        if (!draw(s, pid, n)) return "paused";
      }
      return;
    }
    case "getEnergy":
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        const p = player(s, pid);
        p.energy = (p.energy ?? 0) + n;
        log(s, `${p.name} gets ${"{E}".repeat(Math.min(n, 10))}${n > 10 ? ` (${n})` : ""}.`);
      }
      return;
    case "becomeMonarch":
      for (const pid of players(s, e.who, ctx)) becomeMonarch(s, pid);
      return;
    case "increaseSpeed": {
      // The intervening "if your speed is less than 4" again as it resolves (CR 603.4).
      const p = player(s, ctx.controller);
      if ((p.speed ?? 0) >= 4) return;
      p.speed = (p.speed ?? 0) + 1;
      invalidateCharacteristics(s); // max speed abilities
      log(s, `${p.name}'s speed increases to ${p.speed}${p.speed === 4 ? " (max speed)" : ""}.`);
      return;
    }
    case "gainLife":
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (!n) continue;
        gainLife(s, pid, n);
        log(s, `${player(s, pid).name} gains ${n} life.`);
      }
      return;
    case "loseLife": {
      let total = 0;
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        loseLife(s, pid, n);
        total += n;
        log(s, `${player(s, pid).name} loses ${n} life.`);
      }
      if (e.drain && total > 0) {
        gainLife(s, ctx.controller, total);
        log(s, `${player(s, ctx.controller).name} gains ${total} life.`);
      }
      return;
    }
    case "fight":
    case "bite": {
      // CR 701.14b: if either creature is gone, isn't a creature, or is an illegal target, no damage is dealt.
      const a = objects(s, e.a, ctx)[0];
      // "Deals damage equal to its power to each of two other target creatures": each one that's still a creature.
      const bs = (e.type === "bite" ? objects(s, e.b, ctx) : objects(s, e.b, ctx).slice(0, 1)).filter((b) => objIsType(s, b, "Creature"));
      if (!a || !bs.length || !objIsType(s, a, "Creature")) {
        log(s, `${src}: no damage is dealt.`);
        return;
      }
      // Noncombat damage from the creatures themselves: their own deathtouch, lifelink, infect apply.
      const pa = power(s, a);
      const pbs = bs.map((b) => power(s, b));
      // Fighting: each creature deals damage at the same time, so each is one event per source.
      const fromA = objectSource(s, a);
      const fromB = e.type === "fight" ? objectSource(s, bs[0]!) : undefined;
      let byA = 0;
      for (const b of bs) byA += dealDamage(s, fromA, { object: b }, pa);
      const byB = fromB ? dealDamage(s, fromB, { object: a }, pbs[0]!) : 0; // a creature fighting itself takes twice its power (CR 701.14c)
      if (byA) fireEvent(s, { type: "dealtDamage", id: a.id, amount: byA, combat: false });
      if (byB) fireEvent(s, { type: "dealtDamage", id: bs[0]!.id, amount: byB, combat: false });
      return;
    }
  }
}

/**
 * One of the monarch's inherent triggered abilities (CR 725.2): no source, controlled by the
 * player who was the monarch when it triggered. `subject` is the creature that dealt the damage.
 */
export function monarchTrigger(s: GameState, index: number, subject?: GameObject) {
  s.cards[MONARCH.oracleId] ??= MONARCH;
  s.triggerQueue.push({
    sourceId: "",
    sourceCardId: MONARCH.oracleId,
    controller: s.monarch!,
    index,
    ...(subject ? { subject: { id: subject.id, zc: subject.zoneChanges ?? 0 } } : {}),
  });
}

/** A player becomes the monarch, and whoever was stops being it (CR 725.3). */
export function becomeMonarch(s: GameState, pid: PlayerId) {
  const p = player(s, pid);
  if (p.lost || s.monarch === pid) return;
  s.cards[MONARCH.oracleId] ??= MONARCH;
  s.monarch = pid;
  invalidateCharacteristics(s); // "as long as you're the monarch"
  log(s, `${p.name} becomes the monarch.`);
}
