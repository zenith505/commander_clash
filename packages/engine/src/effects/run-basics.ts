import type { DamageRecipient, Effect } from "../abilities";
import { cardIdOf, defOf, objIsType, power, toughness } from "../cards";
import { addPhases, draw, gainLife, giveCitysBlessing, log, loseLife, obj, player, playerLoses, winGame } from "../game";
import { MONARCH } from "../oracle";
import { characteristics, invalidateCharacteristics } from "../layers";
import { dealDamage, dealDamageBatch, objectSource, type DamageEvent } from "../damage";
import type { GameObject, GameState, ManaType, PlayerId, RedirectShield } from "../types";
import { ResolveCtx, objects, players, amountNow, runEffectInner, damageRecipients, ctxSource } from "./resolve";
import { fireEvent } from "./triggers";
import { ringTempts } from "./run-ring";

/** Damage, prevention, drawing, energy, life, the monarch, fighting. */
/** Is the source of what's resolving a snow object (CR 106.3, 107.4h): the spell itself, or the ability's source? */
function snowSource(s: GameState, ctx: ResolveCtx): boolean {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (o && o.zone === "battlefield") return characteristics(s, o).supertypes.includes("Snow");
  const item = s.resolving?.item;
  const spell = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  if (spell) return characteristics(s, spell).supertypes.includes("Snow");
  // A permanent that's gone: as it last existed (CR 113.7a), its printed card here.
  return !!ctx.sourceDef?.supertypes?.includes("Snow");
}

export function runBasicsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "skip": {
      const words = { untap: "untap step", draw: "draw step", combat: "combat phase", turn: "turn" }[e.skip];
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        for (let i = 0; i < e.n; i++) (p.skips ??= []).push({ what: e.skip, ...(e.thisTurn ? { turn: s.turn } : {}) });
        log(s, `${p.name} will skip their next ${e.n > 1 ? `${e.n} ${words}s` : words}${e.thisTurn ? " this turn" : ""}.`);
      }
      return;
    }
    case "extraTurn":
      // CR 500.7: taken directly after this turn; the most recently created first.
      for (const pid of players(s, e.who, ctx)) {
        for (let i = 0; i < e.n; i++) {
          // The delayed trigger's source: the spell (or the permanent whose ability this is).
          const item = s.resolving?.item;
          const id = ctx.sourceId ?? (item?.kind === "spell" ? item.objectId : undefined);
          const card = id ? s.objects[id] : undefined;
          (s.extraTurns ??= []).push({
            player: pid,
            ...(e.loseAtEnd && card ? { loseAtEnd: { controller: ctx.controller, sourceCardId: cardIdOf(card), subject: { id: card.id, zc: card.zoneChanges ?? 0 } } } : {}),
          });
        }
        log(s, `${player(s, pid).name} will take ${e.n === 1 ? "an extra turn" : `${e.n} extra turns`} after this one.`);
      }
      return;
    case "addPhases":
      addPhases(s, e.phases, e.after);
      return;
    case "loseGame":
      for (const pid of players(s, e.who, ctx)) playerLoses(s, pid, `${src}`);
      return;
    case "winGame":
      for (const pid of players(s, e.who, ctx)) winGame(s, pid, src);
      return;
    case "ascend":
      giveCitysBlessing(s, ctx.controller, true); // CR 702.131a
      return;
    case "damage": {
      const amount = amountNow(s, e.amount, ctx);
      // "Divided as you choose": each target is dealt its part; a part for an illegal target isn't dealt (CR 608.2b,
      // rulings on Arc Lightning).
      // "Divided evenly, rounded down": among the targets still legal (rulings on Fireball).
      const evenly = e.evenly && e.to.ref === "anyTarget" ? damageRecipients(s, e.to, ctx) : undefined;
      const shares = evenly ? evenly.objs.length + evenly.pids.length : 0;
      const parts = (to: DamageRecipient) =>
        evenly
          ? [{ ...evenly, n: shares ? Math.floor(amount / shares) : 0 }]
          : e.divided && to.ref === "anyTarget"
          ? Array.from({ length: to.n ?? 1 }, (_, k) => {
              const t = ctx.targets[to.index + k];
              return { ...damageRecipients(s, { ref: "anyTarget", index: to.index + k }, ctx), n: t && t.kind !== "none" && t.kind !== "stack" ? (t.amount ?? 0) : 0 };
            })
          : [{ ...damageRecipients(s, to, ctx), n: amount }];
      const all = [e.to, ...(e.also ?? [])].flatMap(parts);
      const from = ctxSource(s, ctx);
      // All dealt at once: lifelink is one life-gain event (CR 119.10).
      const lifelink = { n: 0 };
      const events: DamageEvent[] = [
        ...all.flatMap((x) => x.objs.map((o): DamageEvent => ({ src: from, to: { object: o.id }, n: x.n }))),
        ...all.flatMap((x) => x.pids.map((pid): DamageEvent => ({ src: from, to: { player: pid }, n: x.n }))),
      ];
      let dealt = 0;
      for (const e of dealDamageBatch(s, events, { lifelink })) {
        dealt += e.dealt;
        if (e.dealt > 0 && "object" in e.to && s.resolving) (s.resolving.damagedThisWay ??= []).push(e.to.object);
        if (e.dealt > 0 && "player" in e.to && s.resolving && !(s.resolving.playersDamagedThisWay ??= []).includes(e.to.player)) s.resolving.playersDamagedThisWay.push(e.to.player);
      }
      gainLife(s, from.controller, lifelink.n);
      if (dealt && from.id) fireEvent(s, { type: "dealtDamage", id: from.id, amount: dealt, combat: false });
      return;
    }
    case "preventNext": {
      // A shield for the next N damage this turn (CR 615.7), used up by damage from any source.
      // Divided as you choose: each target's part, none for a target that has become illegal (rulings on Remedy).
      const to = e.to;
      const parts =
        e.divided && to.ref === "anyTarget"
          ? Array.from({ length: to.n ?? 1 }, (_, k) => {
              const t = ctx.targets[to.index + k];
              return { ...damageRecipients(s, { ref: "anyTarget", index: to.index + k }, ctx), n: t && t.kind !== "none" && t.kind !== "stack" ? (t.amount ?? 0) : 0 };
            })
          : [{ ...damageRecipients(s, to, ctx), n: amountNow(s, e.n, ctx) }];
      for (const { objs, pids, n } of parts) {
        if (n <= 0) continue;
        for (const x of [...objs, ...pids.map((pid) => player(s, pid))]) {
          x.preventNext = (x.preventNext ?? 0) + n;
          log(s, `${src} will prevent the next ${n} damage to ${"cardId" in x ? defOf(s, x).name : x.name} this turn.`);
        }
      }
      return;
    }
    case "redirectNext": {
      // A redirection shield (CR 614.9) on each permanent or player, for damage from any source. Where the damage goes
      // is fixed now; a destination that isn't a legal target any more gets nothing (CR 608.2b).
      const n = amountNow(s, e.n, ctx);
      const dest = damageRecipients(s, e.to, ctx);
      const to: RedirectShield["to"] | undefined = dest.objs[0] ? { object: dest.objs[0].id, zc: dest.objs[0].zoneChanges ?? 0 } : dest.pids[0] !== undefined ? { player: dest.pids[0] } : undefined;
      if (!to || n <= 0) return;
      const toName = "object" in to ? defOf(s, obj(s, to.object)).name : player(s, to.player).name;
      const { objs, pids } = damageRecipients(s, e.from, ctx);
      for (const x of [...objs, ...pids.map((pid) => player(s, pid))]) {
        (x.redirectNext ??= []).push({ id: `r${s.nextId++}`, n, to, source: src });
        log(s, `${src}: the next ${n} damage that would be dealt to ${"cardId" in x ? defOf(s, x).name : x.name} this turn will be dealt to ${toName} instead.`);
      }
      return;
    }
    case "preventCombatDamage":
      s.preventCombatDamage = true;
      log(s, `${src}: all combat damage will be prevented this turn.`);
      return;
    case "cantCast":
      for (const pid of players(s, e.who, ctx)) {
        (s.cantCastThisTurn ??= []).push({ player: pid, turn: s.turn, ...(e.filter ? { filter: e.filter } : {}), source: src });
        log(s, `${player(s, pid).name} can't cast ${e.filter ? `${e.filter.text.replace(/ spell$/, "")} ` : ""}spells this turn.`);
      }
      return;
    case "cantPlayLands":
      for (const pid of players(s, e.who, ctx)) {
        (s.cantPlayLandsThisTurn ??= []).push({ player: pid, turn: s.turn, source: src });
        log(s, `${player(s, pid).name} can't play lands this turn.`);
      }
      return;
    case "noLifeGain":
      (s.noLifeGain ??= []).push({ turn: s.turn, controller: ctx.controller, who: e.players });
      log(s, `${src}: ${e.players === "all" ? "players" : `${player(s, ctx.controller).name}'s opponents`} can't gain life this turn.`);
      return;
    case "noPrevention":
      s.noPreventionTurn = s.turn;
      log(s, `${src}: damage can't be prevented this turn.`);
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
      if (!sc.drawQueue) s.resolving!.drawnThisWay = [];
      const queue = (sc.drawQueue ??= players(s, e.who, ctx));
      while (queue.length) {
        const pid = queue.shift()!;
        const n = amountNow(s, e.n, { ...ctx, eachOne: pid });
        log(s, `${player(s, pid).name} draws ${n} card${n === 1 ? "" : "s"}.`);
        if (!draw(s, pid, n)) return "paused";
      }
      return;
    }
    case "poison":
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        const p = player(s, pid);
        p.poison = (p.poison ?? 0) + n;
        log(s, `${p.name} gets ${n === 1 ? "a poison counter" : `${n} poison counters`}.`);
      }
      return;
    case "getEnergy":
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        const p = player(s, pid);
        p.energy = (p.energy ?? 0) + n;
        log(s, `${p.name} gets ${"{E}".repeat(Math.min(n, 10))}${n > 10 ? ` (${n})` : ""}.`);
      }
      return;
    case "ringTempts":
      return ringTempts(s, ctx, src);
    case "becomeMonarch":
      for (const pid of players(s, e.who, ctx)) becomeMonarch(s, pid);
      return;
    case "extraLandThisTurn": {
      // Only this turn; on another player's turn it lets them play none (rulings on Explore).
      const p = player(s, ctx.controller);
      p.extraLands = { turn: s.turn, n: (p.extraLands?.turn === s.turn ? p.extraLands.n : 0) + e.n };
      log(s, `${p.name} may play ${e.n === 1 ? "an additional land" : `${e.n} additional lands`} this turn.`);
      return;
    }
    case "increaseSpeed": {
      // The intervening "if your speed is less than 4" again as it resolves (CR 603.4).
      const p = player(s, ctx.controller);
      if ((p.speed ?? 0) >= 4) return;
      p.speed = (p.speed ?? 0) + 1;
      invalidateCharacteristics(s); // max speed abilities
      log(s, `${p.name}'s speed increases to ${p.speed}${p.speed === 4 ? " (max speed)" : ""}.`);
      return;
    }
    case "addMana": {
      // The mana empties from the pool as the step or phase ends (CR 106.4).
      const p = player(s, ctx.controller);
      const color = s.resolving?.chosen?.color;
      const added = e.mana ? e.mana.repeat(e.times === undefined ? 1 : amountNow(s, e.times, ctx)) : color && e.chosen ? `{${color}}`.repeat(e.chosen) : "";
      // Mana from a snow source is snow mana (CR 107.4h): a snow spell's, or a snow permanent's ability's (106.3).
      const snow = s.resolving?.item.manaAbility ? !!s.resolving.item.manaAbility.snow : snowSource(s, ctx);
      for (const m of added.matchAll(/\{([WUBRGC])\}/g)) {
        p.manaPool[m[1] as "W"]++;
        // A Treasure's mana ability: "mana from a Treasure" (CR 106.3).
        if (s.resolving?.item.manaAbility?.treasure) (p.treasureMana ??= {})[m[1] as ManaType] = (p.treasureMana[m[1] as ManaType] ?? 0) + 1;
        if (snow) (p.snowMana ??= {})[m[1] as ManaType] = (p.snowMana[m[1] as ManaType] ?? 0) + 1;
        // "Until end of turn, you don't lose this mana as steps and phases end."
        if (e.keep) {
          if (p.keptMana?.turn !== s.turn) p.keptMana = { turn: s.turn, mana: {} };
          p.keptMana.mana[m[1] as ManaType] = (p.keptMana.mana[m[1] as ManaType] ?? 0) + 1;
        }
        if (s.resolving?.item.manaAbility) (s.resolving.made ??= []).push(m[1] as ManaType);
      }
      if (added) log(s, `${p.name} adds ${added}.`);
      return;
    }
    case "cantAttackRule":
      (s.cantAttackThisTurn ??= []).push({ filter: e.filter, controller: ctx.controller });
      log(s, `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1)} can't attack this turn.`);
      return;
    case "cantBlockRule":
      (s.cantBlockThisTurn ??= []).push({ filter: e.filter, controller: ctx.controller });
      log(s, `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1)} can't block this turn.`);
      return;
    case "addCombatMana": {
      // Firebending (CR 702.189a): red mana that stays in the pool until end of combat (see advanceStep).
      const n = amountNow(s, e.n, ctx);
      const p = player(s, ctx.controller);
      p.manaPool.R += n;
      p.combatMana = (p.combatMana ?? 0) + n;
      if (n) log(s, `${p.name} adds ${"{R}".repeat(n)} (until end of combat).`);
      return;
    }
    case "gainLife":
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, { ...ctx, eachOne: pid });
        if (!n) continue;
        gainLife(s, pid, n);
        log(s, `${player(s, pid).name} gains ${n} life.`);
      }
      return;
    case "loseLife": {
      let total = 0;
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, { ...ctx, eachOne: pid });
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
      // "Each of those creatures deals damage equal to its power to ~": each target still legal and still a creature.
      const as = objects(s, e.a, ctx).filter((a) => objIsType(s, a, "Creature"));
      const a = as[0];
      // "Deals damage equal to its power to each of two other target creatures": each one still a legal target, a
      // planeswalker too where it could be targeted (Bite Down). Only fighting needs both to be creatures (CR 701.14b).
      const bs = e.type === "bite" ? objects(s, e.b, ctx).filter((b) => ["Creature", "Planeswalker", "Battle"].some((t) => objIsType(s, b, t))) : objects(s, e.b, ctx).slice(0, 1).filter((b) => objIsType(s, b, "Creature"));
      if (!a || !bs.length) {
        log(s, `${src}: no damage is dealt.`);
        return;
      }
      if (e.type === "bite") {
        // Noncombat damage from the creatures themselves, all dealt at once: their own deathtouch, lifelink, infect
        // apply. Their power as it resolves (rulings on Living Inferno).
        const events: DamageEvent[] = as.flatMap((x) => bs.map((b): DamageEvent => ({ src: objectSource(s, x), to: { object: b.id }, n: power(s, x) })));
        const by = new Map<string, number>();
        for (const d of dealDamageBatch(s, events)) if (d.dealt && d.src.id) by.set(d.src.id, (by.get(d.src.id) ?? 0) + d.dealt);
        for (const [id, amount] of by) fireEvent(s, { type: "dealtDamage", id, amount, combat: false });
        return;
      }
      // Fighting: each creature deals damage at the same time, so each is one event per source.
      const b = bs[0]!;
      const pa = power(s, a);
      const pb = power(s, b);
      const byA = dealDamage(s, objectSource(s, a), { object: b }, pa);
      const byB = dealDamage(s, objectSource(s, b), { object: a }, pb); // a creature fighting itself takes twice its power (CR 701.14c)
      if (byA) fireEvent(s, { type: "dealtDamage", id: a.id, amount: byA, combat: false });
      if (byB) fireEvent(s, { type: "dealtDamage", id: b.id, amount: byB, combat: false });
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
