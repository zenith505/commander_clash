import type { DamageRecipient, Effect, PlayerRef } from "../abilities";
import { putPlayerCounters } from "../counters";
import { defMv } from "../faces";
import { abilitiesOf, cardIdOf, defOf, isType, objHasKeyword, objIsType, power, toughness } from "../cards";
import { addPhases, endWhileTapped, manaBurn, canPreventDamage, inCombatPhase, drawGame, loseEnergy, opponents, returnUntilLeaves, canGainLife, canLoseLife, draw, gainLife, giveCitysBlessing, livingPlayers, log, loseLife, millCount, moveObject, obj, player, playerLoses, simultaneousLifeLoss, winGame } from "../game";
import { MONARCH } from "../oracle";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow } from "../layers";
import { cardSource, dealDamage, dealDamageBatch, dealPlanned, excessOver, lethalAmounts, objectSource, planDamage, unpreventable, damageUnalterableTo, type DamageEvent, type DamageSource } from "../damage";
import { COLORS, type GameObject, type GameState, type ManaOrigin, type ManaType, type ObjectId, type PlayerId, type RedirectShield } from "../types";
import { addMana, manaOriginsOf } from "../spend";
import { emptyPool } from "../mana";
import { tappedForMana } from "../manaabilities";
import { ResolveCtx, apnap, objects, players, amountNow, amountCtx, runEffectInner, damageRecipients, ctxSource } from "./resolve";
import { evalAmount } from "../amounts";
import { fireEvent } from "./triggers";
import { bindBound, bindChosen, objectMatches } from "./targeting";
import { COLOR_NAMES } from "./describe";
import { ringTempts } from "./run-ring";
import { chooseDamageSource } from "./run-prevention";
import { createEmblem } from "../emblems";
import { addDelayed } from "./run-spells";
import { setDayNight } from "../daynight";

/** Damage, prevention, drawing, energy, life, the monarch, fighting. */
/**
 * What the source of the mana an effect adds is (CR 106.3): the spell itself, or the ability's source (a snow source's
 * mana is snow mana, 107.4h; a creature's is "mana from a creature").
 */
function manaSourceOrigins(s: GameState, ctx: ResolveCtx): ManaOrigin[] {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (o && o.zone === "battlefield") return manaOriginsOf(s, o);
  const item = s.resolving?.item;
  const spell = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  if (spell) return manaOriginsOf(s, spell);
  // A permanent that's gone: as it last existed (CR 113.7a), its printed card here.
  const d = ctx.sourceDef;
  if (!d) return [];
  const out: ManaOrigin[] = [];
  if (d.types.includes("Artifact")) out.push("artifact");
  if (d.types.includes("Creature")) out.push("creature");
  if (d.supertypes?.includes("Snow")) out.push("snow");
  if (d.subtypes?.includes("Treasure")) out.push("treasure");
  if (d.subtypes?.includes("Desert")) out.push("desert");
  if (d.subtypes?.includes("Cave")) out.push("cave");
  if (d.types.includes("Land") && d.supertypes?.includes("Basic")) out.push("basicLand");
  return out;
}

export function runBasicsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "attackDirection": {
      // Teyo: the direction chosen just before, for every player's attacks until its controller's next turn.
      const side = s.resolving?.chosen?.direction;
      if (!side) return;
      (s.attackDirections ??= []).push({ by: ctx.controller, side });
      log(s, `Until ${player(s, ctx.controller).name}'s next turn, each player may attack only the nearest opponent to their ${side} and that player's planeswalkers.`);
      invalidateCharacteristics(s);
      return;
    }
    case "skipChosenThisTurn": {
      // Fatespinner: that player chooses as it resolves (CR 608.2d); each instance this turn is skipped (CR 614.10).
      const pid = players(s, e.who, ctx)[0];
      if (pid === undefined || player(s, pid).lost) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.skipPick === undefined) {
        s.pending = { kind: "chooseOption", player: pid, source: src, what: "skipChoice", options: ["draw", "main", "combat"], labels: ["Draw step", "Main phase", "Combat phase"], prompt: "choose draw step, main phase, or combat phase: you skip each of them this turn" };
        return "paused";
      }
      const what = sc.skipPick as "draw" | "main" | "combat";
      sc.skipPick = undefined;
      (player(s, pid).skips ??= []).push({ what, turn: s.turn, wholeTurn: true });
      log(s, `${player(s, pid).name} chooses to skip each ${{ draw: "draw step", main: "main phase", combat: "combat phase" }[what]} this turn (${src}).`);
      return;
    }
    case "skip": {
      const words = { untap: "untap step", draw: "draw step", combat: "combat phase", turn: "turn", main: "main phase" }[e.skip];
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (e.wholeTurn) {
          (p.skips ??= []).push({ what: e.skip, wholeTurn: true });
          log(s, `${p.name} will skip all combat phases of their next turn.`);
          continue;
        }
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        for (let i = 0; i < n; i++) (p.skips ??= []).push({ what: e.skip, ...(e.thisTurn ? { turn: s.turn } : {}) });
        log(s, `${p.name} will skip their next ${n > 1 ? `${n} ${words}s` : words}${e.thisTurn ? " this turn" : ""}.`);
      }
      return;
    }
    case "endTurn":
      if (s.resolving) s.resolving.endTurn = true; // CR 724.1: once it's done resolving (continueResolution)
      return;
    case "endCombatPhase":
      // CR 724.2g: outside a combat phase, nothing happens.
      if (s.resolving && inCombatPhase(s)) s.resolving.endCombat = true; // CR 724.2: once it's done resolving
      return;
    case "extraTurn":
      // CR 500.7: taken directly after this turn; the most recently created first.
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        for (let i = 0; i < n; i++) {
          // The delayed trigger's source: the spell (or the permanent whose ability this is).
          const item = s.resolving?.item;
          const id = ctx.sourceId ?? (item?.kind === "spell" ? item.objectId : undefined);
          const card = id ? s.objects[id] : undefined;
          (s.extraTurns ??= []).push({
            player: pid,
            ...(e.skipUntap ? { skipUntap: true as const } : {}),
            ...(e.noPowerUp ? { noPowerUp: true as const } : {}),
            ...(e.noPrevention ? { noPrevention: true as const } : {}),
            ...(e.loseAtEnd && card ? { loseAtEnd: { controller: ctx.controller, sourceCardId: cardIdOf(card), subject: { id: card.id, zc: card.zoneChanges ?? 0 } } } : {}),
          });
        }
        log(s, `${player(s, pid).name} will take ${n === 1 ? "an extra turn" : `${n} extra turns`} after this one.`);
      }
      return;
    case "timesifter": {
      // Each round: everyone still in it exiles their top card at once (APNAP order makes no difference); a land is 0 (CR
      // 202.3). One greatest takes the turn; a tie goes again among the tied ones only (rulings); no card, out of it.
      let left = apnap(s, livingPlayers(s));
      while (left.length) {
        const mv = new Map<PlayerId, number>();
        for (const pid of left) {
          const top = player(s, pid).library[0];
          if (top === undefined) continue;
          moveObject(s, top, "exile");
          mv.set(pid, defMv(defOf(s, obj(s, top))));
          log(s, `${player(s, pid).name} exiles ${defOf(s, obj(s, top)).name} (mana value ${mv.get(pid)}) from the top of their library.`);
        }
        if (!mv.size) break;
        const most = Math.max(...mv.values());
        left = [...mv.keys()].filter((pid) => mv.get(pid) === most);
        if (left.length === 1) {
          (s.extraTurns ??= []).push({ player: left[0]! });
          log(s, `${player(s, left[0]!).name} exiled the greatest mana value and will take an extra turn after this one (${src}).`);
          break;
        }
        log(s, `${left.map((pid) => player(s, pid).name).join(" and ")} are tied; they exile again.`);
      }
      return;
    }
    case "controlPlayer": {
      // CR 723.1: it applies to the next turn that player actually takes, waiting through skipped turns (723.1b).
      const controller = players(s, e.controller, ctx)[0];
      if (controller === undefined) return;
      for (const pid of players(s, e.who, ctx)) {
        (s.playerControls ??= []).push({ controlled: pid, controller, ...(e.extraTurnAfter ? { extraTurnAfter: true as const } : {}) });
        const who = player(s, pid).name;
        log(s, `${player(s, controller).name} will control ${who} during ${who}'s next turn${e.extraTurnAfter ? `; after it, ${who} takes an extra turn` : ""}.`);
      }
      return;
    }
    case "addUpkeepStep":
      if (s.step === "upkeep" && (!e.you || ctx.controller === s.activePlayer)) s.extraUpkeeps = (s.extraUpkeeps ?? 0) + 1;
      return;
    case "addUpkeepPhases": {
      // Obeka: additional beginning phases after this phase, each only an upkeep step (rulings, CR 500.8); the most
      // recently added first (addPhases).
      const n = amountNow(s, e.n, ctx);
      if (n > 0 && ctx.controller === s.activePlayer && addPhases(s, Array.from({ length: n }, () => "upkeep" as const))) log(s, `${player(s, ctx.controller).name} gets ${n === 1 ? "an additional upkeep step" : `${n} additional upkeep steps`} after this phase.`);
      return;
    }
    case "addEndStep":
      if (s.step === "end" && (s.turnLog?.endSteps ?? 0) === 1) s.extraEndSteps = (s.extraEndSteps ?? 0) + 1;
      return;
    case "addPhases": {
      // "At the beginning of that combat, ...": a delayed trigger for this added combat phase only (CR 603.7; rulings on
      // Moraug: not the turn's regular combat).
      const key = e.thatCombat || e.onlyAttack || e.onlyAttackTargets || e.thoseAttack ? (s.combatKeys = (s.combatKeys ?? 0) + 1) : undefined;
      const item = s.resolving?.item;
      const me = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const added = addPhases(s, e.phases, e.after, key);
      if (added && e.onlyAttack && key !== undefined) (s.combatAttackOnly ??= {})[key] = e.onlyAttack;
      // Last Night Together: the creatures chosen as its targets, still those objects (CR 400.7). The restriction is on every
      // other creature; one that's no longer a legal target is only left alone by the spell (CR 608.2b), so it may attack.
      if (added && e.onlyAttackTargets && key !== undefined) {
        const { index, n } = e.onlyAttackTargets;
        (s.combatAttackOnlyIds ??= {})[key] = ctx.targets.slice(index, index + n).flatMap((t) => (t.kind === "object" ? [`${t.id}@${t.zc ?? s.objects[t.id]?.zoneChanges ?? 0}`] : []));
      }
      // Illusionist's Gambit: those creatures must attack in that combat, not you or your planeswalkers (CR 508.1c-d).
      const those = added && e.thoseAttack && key !== undefined ? objects(s, { ref: "created" }, ctx).map((o) => o.id) : [];
      if (those.length) {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "endOfTurn", affected: those, mods: [{ kind: "attacksIfAble", combatKey: key }, { kind: "cantAttackYou", combatKey: key }] });
        invalidateCharacteristics(s);
      }
      if (added && e.thatCombat && me) {
        addDelayed(s, "thatCombat", ctx.controller, me, { targets: [], effects: e.thatCombat.effects, text: e.thatCombat.text });
        s.delayed![s.delayed!.length - 1]!.combat = key;
      }
      return;
    }
    case "loseGame":
      for (const pid of players(s, e.who, ctx)) playerLoses(s, pid, `${src}`);
      return;
    case "winGame":
      for (const pid of players(s, e.who, ctx)) winGame(s, pid, src);
      return;
    case "rememberChosenObject": {
      // Zenos yae Galvus: noted on the source only while it's still the object whose ability this is (CR 400.7, 607.2d).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const picked = s.resolving?.created?.find((id) => s.objects[id]?.zone === "battlefield");
      if (!me || me.zone !== "battlefield" || (me.zoneChanges ?? 0) !== (ctx.sourceZc ?? me.zoneChanges ?? 0) || picked === undefined) return;
      me.chosen = { ...me.chosen, object: { id: picked, zc: obj(s, picked).zoneChanges ?? 0 } };
      return;
    }
    case "highestLifeWins": {
      // Celestial Convergence: among the players still in the game (CR 800.4a), the one with the most life wins (CR 104.2a);
      // two or more tied for it is a draw (CR 104.4c).
      const alive = livingPlayers(s);
      const most = Math.max(...alive.map((pid) => player(s, pid).life));
      const top = alive.filter((pid) => player(s, pid).life === most);
      if (top.length === 1) winGame(s, top[0]!, src);
      else if (top.length > 1) drawGame(s, `${src}: ${top.map((pid) => player(s, pid).name).join(" and ")} are tied for the highest life total`);
      return;
    }
    case "ascend":
      giveCitysBlessing(s, ctx.controller, true); // CR 702.131a
      return;
    case "damage": {
      // "That player or a planeswalker that player controls" (Vial Smasher the Fierce): the controller chooses which as it
      // resolves (rulings), asked only when there's a planeswalker to choose.
      if (e.to.ref === "playerOrPlaneswalker") {
        const sc = (s.resolving!.scratch ??= {});
        if (sc.damageWhom === undefined) {
          const pid = players(s, e.to.who, ctx).find((x) => !player(s, x).lost);
          if (pid === undefined) return;
          const pws = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Planeswalker"));
          if (pws.length) {
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "damageWhom", options: [`p${pid}`, ...pws], labels: [player(s, pid).name, ...pws.map((id) => defOf(s, obj(s, id)).name)], prompt: `deal the damage to ${player(s, pid).name} or a planeswalker they control` };
            return "paused";
          }
          sc.damageWhom = `p${pid}`;
        }
      }
      const amount = amountNow(s, e.amount, ctx);
      // Price of Progress: each player's own amount ("that player controls", PlayerRef eachOne).
      const perPlayer = typeof e.amount === "object" && JSON.stringify(e.amount).includes('"eachOne"');
      // Baki's Curse: "2 damage to each creature for each Aura attached to that creature": each its own, all at once.
      const perObject = typeof e.amount === "object" && JSON.stringify(e.amount).includes('"attachedToAffected"');
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
          : perPlayer
            ? ((r) => [
                ...r.pids.map((pid) => ({ objs: [], pids: [pid], n: amountNow(s, e.amount, { ...ctx, eachOne: pid }) })),
                // Incite Rebellion: "and each creature that player controls": each creature its controller's amount.
                ...r.objs.map((o) => ({ objs: [o], pids: [], n: amountNow(s, e.amount, { ...ctx, eachOne: controllerOf(s, o) }) })),
              ])(damageRecipients(s, to, ctx))
            : perObject
            ? ((r) => r.objs.map((o) => ({ objs: [o], pids: [], n: Math.max(0, evalAmount(s, e.amount, { ...amountCtx(s, ctx), affected: o.id })) })))(damageRecipients(s, to, ctx))
            : [{ ...damageRecipients(s, to, ctx), n: amount }];
      const alsoN = e.alsoAmount !== undefined ? amountNow(s, e.alsoAmount, ctx) : undefined;
      const all = [...parts(e.to), ...(e.also ?? []).flatMap((to) => parts(to).map((x) => (alsoN === undefined ? x : { ...x, n: alsoN })))];
      const host = e.by === "attached" ? objects(s, { ref: "attached" }, ctx)[0] : undefined;
      const made = e.by === "created" ? objects(s, { ref: "created" }, ctx) : e.by === "amassed" ? objects(s, { ref: "amassed" }, ctx) : [];
      const by = typeof e.by === "object" && "ref" in e.by ? grantSourceSource(s, e.by) : e.by === "subject" ? subjectSource(s, ctx) : e.by === "castSpell" ? castSpellSource(s, ctx) : e.by === "created" || e.by === "amassed" ? (made.length === 1 && made[0]!.zone === "battlefield" ? objectSource(s, made[0]!) : undefined) : e.by === "attached" ? (host?.zone === "battlefield" ? objectSource(s, host) : undefined) : e.by ? targetSource(s, ctx, e.by.target, e.by.lastKnown, e.by.exiled) : ctxSource(s, ctx);
      if (!by) return;
      const from = { ...by, ...(e.unpreventable || (e.unpreventableX !== undefined && (ctx.x ?? 0) >= e.unpreventableX) || (e.unpreventableIf && staticConditionNow(s, e.unpreventableIf, ctx.sourceId ?? "", ctx.controller, undefined, undefined, ctx.sourceZc)) ? { unpreventable: "all" as const } : {}) };
      // All dealt at once: lifelink is one life-gain event (CR 119.10).
      const lifelink = { n: 0 };
      let events: DamageEvent[] = [
        // Lava Burst: to a creature, the damage can't be prevented or redirected (CR 615.12, 614.9).
        ...all.flatMap((x) => x.objs.map((o): DamageEvent => ({ src: e.toCreaturesUnalterable && objIsType(s, o, "Creature") ? { ...from, unpreventable: "all", noRedirect: true } : from, to: { object: o.id }, n: x.n }))),
        ...all.flatMap((x) => x.pids.map((pid): DamageEvent => ({ src: from, to: { player: pid }, n: x.n }))),
      ];
      // Kaervek's Hex: each recipient's parts as one amount (Effect damage `merge`).
      if (e.merge) {
        const byKey = new Map<string, DamageEvent>();
        for (const ev of events) {
          const key = "object" in ev.to ? `o${ev.to.object}` : `p${ev.to.player}`;
          const had = byKey.get(key);
          if (had) had.n += ev.n;
          else byKey.set(key, { ...ev });
        }
        events = [...byKey.values()];
      }
      // "Excess damage is dealt to that creature's controller instead" (Flame Spill): the damage beyond lethal, worked out
      // before replacement and prevention, is dealt to its controller at the same time (CR 120.4a; rulings).
      if (e.excessToController)
        events = events.flatMap((ev) => {
          if (!("object" in ev.to)) return [ev];
          const o = obj(s, ev.to.object);
          const excess = excessOver(lethalAmounts(s, from, o), ev.n);
          if (excess && s.resolving) s.resolving.excessRedirected = (s.resolving.excessRedirected ?? 0) + excess;
          return excess ? [{ ...ev, n: ev.n - excess }, { src: from, to: { player: controllerOf(s, o) }, n: excess }] : [ev];
        });
      // Errant Minion: "Prevent X of that damage": prevented as it would be dealt (CR 615.1a), unless damage can't be
      // prevented (CR 615.12). Its controller applies it before any other prevention or replacement that could apply
      // (CR 616.1): an amount off this damage only is never worse for them than another shield first.
      const off = e.preventOf !== undefined ? Math.max(0, amountNow(s, e.preventOf, ctx)) : 0;
      if (off > 0 && canPreventDamage(s) && !unpreventable(from, false)) {
        // Whippoorwill (round B235): not damage to a creature whose damage can't be prevented this turn.
        events = events.map((ev) => (damageUnalterableTo(s, ev.to) ? ev : { ...ev, n: Math.max(0, ev.n - off) })).filter((ev) => ev.n > 0);
        log(s, `${src}: ${off} of that damage is prevented.`);
      }
      const dealt = dealtWithExcess(s, from, events, (evs) => dealDamageBatch(s, evs, { lifelink }));
      gainLife(s, from.controller, lifelink.n, "lifelink");
      if (dealt && from.id) fireEvent(s, { type: "dealtDamage", id: from.id, amount: dealt, combat: false });
      return;
    }
    case "eachDealsDamage": {
      // Each permanent deals its own damage, all at the same time (CR 120.3); lifelink is one life gain per player (CR 119.10).
      const n = amountNow(s, e.amount, ctx);
      const victim = e.to ? objects(s, e.to, ctx).find((o) => o.zone === "battlefield") : undefined;
      if (e.to && !victim) return;
      // A target player or planeswalker: none if it's no longer a legal target (CR 608.2b).
      const rec = e.recipient ? damageRecipients(s, e.recipient, ctx) : undefined;
      const recTo = rec ? (rec.objs[0] ? { object: rec.objs[0].id } : rec.pids[0] !== undefined ? { player: rec.pids[0] } : undefined) : undefined;
      if (e.recipient && !recTo) return;
      const hostOf = (o: GameObject) => (o.attachedTo && s.objects[o.attachedTo]?.zone === "battlefield" && objIsType(s, s.objects[o.attachedTo]!, "Creature") ? o.attachedTo : undefined);
      const events: DamageEvent[] = objects(s, e.what, ctx)
        .filter((o) => o.zone === "battlefield" && (!e.toHost || hostOf(o) !== undefined))
        .map((o) => ({ src: objectSource(s, o), to: e.toHost ? { object: hostOf(o)! } : recTo ?? (victim ? { object: victim.id } : { player: controllerOf(s, o) }), n: e.ownPower ? power(s, o) : n }));
      const gains = new Map<PlayerId, { n: number }>();
      const dealt = dealPlanned(s, planDamage(s, events), { lifelink: (ev) => gains.get(ev.src.controller) ?? gains.set(ev.src.controller, { n: 0 }).get(ev.src.controller)! });
      for (const [pid, g] of gains) gainLife(s, pid, g.n, "lifelink");
      const by = new Map<ObjectId, number>();
      for (const d of dealt) if (d.dealt > 0 && d.src.id) by.set(d.src.id, (by.get(d.src.id) ?? 0) + d.dealt);
      for (const [id, amount] of by) fireEvent(s, { type: "dealtDamage", id, amount, combat: false });
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
    case "cantCast": {
      const mvIs = e.mvIs !== undefined ? evalAmount(s, e.mvIs, amountCtx(s, ctx)) : undefined;
      for (const pid of players(s, e.who, ctx)) {
        if (e.oneMore) {
          // Irencrag Feat: one more spell this turn, counted from now (rulings); it doesn't lift any other ban.
          const cast = (s.castThisTurn ?? []).filter((c) => c.player === pid).length;
          (s.cantCastThisTurn ??= []).push({ player: pid, turn: s.turn, source: src, afterCasts: cast + 1 });
          log(s, `${player(s, pid).name} can cast only one more spell this turn.`);
          continue;
        }
        (s.cantCastThisTurn ??= []).push({ player: pid, turn: s.turn, ...(e.filter ? { filter: e.filter } : {}), ...(mvIs !== undefined ? { mv: mvIs } : {}), source: src, ...(e.untilYourNextTurnEnds ? { untilEndOfTurnOf: ctx.controller } : {}), ...(e.untilYourNextTurn ? { untilTurnOf: ctx.controller } : {}), ...(e.duringTheirNextTurn ? { untilEndOfTurnOf: pid, duringTheirNextTurn: true as const } : {}) });
        log(s, `${player(s, pid).name} can't cast ${e.filter ? `${e.filter.text.replace(/ spell$/, "")} ` : ""}spells ${mvIs !== undefined ? `with mana value ${mvIs} ` : ""}${e.duringTheirNextTurn ? "during their next turn" : e.untilYourNextTurnEnds ? `until the end of ${player(s, ctx.controller).name}'s next turn` : e.untilYourNextTurn ? `until ${player(s, ctx.controller).name}'s next turn` : "this turn"}.`);
      }
      return;
    }
    case "revealHandWhile": {
      // "For as long as ~ remains on the battlefield": nothing once it has left (CR 611.2b).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (me.zoneChanges ?? 0) !== (ctx.sourceZc ?? 0)) return;
      for (const pid of players(s, e.who, ctx)) {
        (player(s, pid).handRevealedWhile ??= []).push({ id: me.id, zc: me.zoneChanges ?? 0 });
        log(s, `${player(s, pid).name} plays with their hand revealed for as long as ${src} remains on the battlefield.`);
      }
      return;
    }
    case "attackTaxThisTurn": {
      const n = Math.max(0, evalAmount(s, e.n, amountCtx(s, ctx)));
      s.attackTaxes = [...(s.attackTaxes ?? []).filter((b) => b.turn === s.turn), { turn: s.turn, n }];
      log(s, `This turn, creatures can't attack unless their controller pays {${n}} for each attacking creature they control (${src}).`);
      return;
    }
    case "blockTaxThisTurn": {
      const n = Math.max(0, evalAmount(s, e.n, amountCtx(s, ctx)));
      s.blockTaxes = [...(s.blockTaxes ?? []).filter((b) => b.turn === s.turn), { turn: s.turn, n }];
      log(s, `This turn, creatures can't block unless their controller pays {${n}} for each blocking creature they control (${src}).`);
      return;
    }
    case "cantPlayLands":
      for (const pid of players(s, e.who, ctx)) {
        (s.cantPlayLandsThisTurn ??= []).push({ player: pid, turn: s.turn, source: src });
        log(s, `${player(s, pid).name} can't play lands this turn.`);
      }
      return;
    case "landManaUntilEndOfTurn":
      // Pale Moon, Deep Water: a replacement effect until the turn ends (CR 514.2), applied in manaabilities.ts tappedForMana.
      // Harvest Mage (round B224): "one mana of a color of your choice instead of any other type and amount" (mana "any", `one`).
      // Hall of Gemstone (round B226): "mana of the chosen color instead of any other color", the color chosen before it as
      // this resolves (none chosen, nothing changes), only colored mana (`colored`).
      if (e.mana === "chosen") {
        const color = s.resolving?.chosen?.color;
        if (!color) return;
        (s.landManaRules ??= []).push({ turn: s.turn, player: ctx.controller, mana: color, ...(e.colored ? { colored: true as const } : {}) });
        log(s, `Until end of turn, lands tapped for mana produce ${COLOR_NAMES[color].toLowerCase()} mana instead of any other color (${src}).`);
        return;
      }
      (s.landManaRules ??= []).push({ turn: s.turn, player: ctx.controller, mana: e.mana, ...(e.one ? { one: true as const } : {}), ...(e.nonbasic ? { nonbasic: true as const } : {}), ...(e.yours ? { yours: true as const } : {}), ...(e.subtype ? { subtype: e.subtype } : {}) });
      log(s, `Until end of turn, ${e.subtype ? `${e.subtype}s` : e.nonbasic ? "nonbasic lands" : `lands ${player(s, ctx.controller).name} controls`} tapped for mana produce ${e.mana === "any" ? `${e.one ? "one mana" : "mana"} of a color of ${player(s, ctx.controller).name}'s choice` : e.mana === "C" ? "colorless mana" : `{${e.mana}}`} instead.`);
      return;
    case "turnRules":
      if (e.everyone) {
        for (const pid of livingPlayers(s)) for (const rule of e.rules) (s.turnRules ??= []).push({ turn: s.turn, player: pid, rule });
        log(s, `Players${e.rules.map((r) => (r === "cantLoseLife" ? " can't lose life" : r === "cantLoseGame" ? " can't lose the game" : r === "cantWinGame" ? " can't win the game" : "")).join(",")} this turn.`);
        return;
      }
      if (e.who) {
        for (const pid of players(s, e.who, ctx)) {
          for (const rule of e.rules) (s.turnRules ??= []).push({ turn: s.turn, player: pid, rule });
          log(s, `${player(s, pid).name}${e.rules.map((r) => (r === "noActivations" ? " can't activate abilities that aren't mana abilities" : r === "noAbilities" ? " can't activate abilities" : "")).join(",")} this turn.`);
        }
        return;
      }
      if (e.opponents) {
        for (const pid of opponents(s, ctx.controller)) for (const rule of e.rules) (s.turnRules ??= []).push({ turn: s.turn, player: pid, rule });
        log(s, `${player(s, ctx.controller).name}'s opponents${e.rules.map((r) => (r === "noLoyalty" ? " can't activate planeswalkers' loyalty abilities" : "")).join(",")} this turn.`);
        return;
      }
      if (e.self) {
        // Kaito, Dancing Shadow: about its source, only while it's the same object (CR 400.7).
        const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        if (!src || src.zone !== "battlefield" || (ctx.sourceZc !== undefined && (src.zoneChanges ?? 0) !== ctx.sourceZc)) return;
        for (const rule of e.rules) (s.turnRules ??= []).push({ turn: s.turn, player: ctx.controller, rule, object: { id: src.id, zc: src.zoneChanges ?? 0 } });
        log(s, `${player(s, ctx.controller).name} may activate loyalty abilities of ${defOf(s, src).name} twice this turn.`);
        return;
      }
      for (const rule of e.rules) (s.turnRules ??= []).push({ turn: s.turn, player: ctx.controller, rule, ...(e.byColors ? { byColors: e.byColors } : {}) });
      if (e.rules[0] === "seeHexproof") {
        log(s, `${player(s, ctx.controller).name}'s spells and abilities can target their opponents and their creatures as though they didn't have hexproof this turn.`);
        return;
      }
      if (e.rules[0] === "loyaltyTwice") {
        log(s, `${player(s, ctx.controller).name} may activate the loyalty abilities of planeswalkers they control twice this turn.`);
        return;
      }
      if (e.rules[0] === "extraLoyalty") {
        log(s, `${player(s, ctx.controller).name} may activate a loyalty ability of each planeswalker they control once more this turn.`);
        return;
      }
      log(s, `${player(s, ctx.controller).name}${e.rules.map((r) => (r === "cantLoseLife" ? " can't lose life" : r === "cantLoseGame" ? " can't lose the game" : r === "flash" ? " may cast spells as though they had flash" : r === "castFromHandFree" ? " may cast spells from their hand without paying their mana costs" : r === "spellsUncounterable" ? `'s spells can't be countered${e.byColors ? ` by ${e.byColors.map((c) => COLOR_NAMES[c].toLowerCase()).join(" or ")} spells` : ""}` : r === "creatureSpellsUncounterable" ? "'s creature spells can't be countered" : "'s opponents can't win the game")).join(",")} this turn.`);
      return;
    case "flashUntilNextTurn":
      (s.flashUntil ??= []).push({ controller: ctx.controller, filter: e.filter, ...(e.thisTurn ? { turn: s.turn } : {}) });
      log(s, `${player(s, ctx.controller).name} may cast ${e.filter.text} as though they had flash ${e.thisTurn ? "this turn" : "until their next turn"}.`);
      return;
    case "opponentsHandOnlyUntilNextTurn":
      (s.handOnlyUntil ??= []).push({ controller: ctx.controller, source: src });
      log(s, `${src}: until ${player(s, ctx.controller).name}'s next turn, their opponents can't cast spells from anywhere other than their hands.`);
      return;
    case "graveyardTurn": {
      const list = (s.graveyardTurn = (s.graveyardTurn ?? []).filter((g) => g.turn === s.turn));
      list.push({ player: ctx.controller, turn: s.turn, ...(e.cast ? { cast: e.cast } : {}), ...(e.lands ? { lands: true as const } : {}), ...(e.exileInstead ? { exileInstead: true as const } : {}), ...(e.anyGraveyard ? { anyGraveyard: true as const } : {}), ...(e.exileCast ? { exileCast: true as const } : {}), ...(e.topOnly ? { topOnly: true as const } : {}), ...(e.costs ? { costs: e.costs } : {}), ...(e.entersWith ? { entersWith: e.entersWith } : {}), source: src });
      const may = [e.lands ? "play lands" : "", e.cast ? `cast ${e.cast.text.replace(/ cards?$/, "")} spells` : ""].filter(Boolean).join(" and ");
      if (may) log(s, `${player(s, ctx.controller).name} may ${may} from ${e.anyGraveyard ? "any graveyard" : e.topOnly ? "the top of their graveyard" : "their graveyard"} this turn${e.costs?.some((c) => c.kind === "forage") ? " by foraging" : ""}${e.entersWith ? `, each entering with a ${e.entersWith.counter} counter` : ""} (${src}).`);
      if (e.exileInstead) log(s, `${src}: cards that would be put into ${player(s, ctx.controller).name}'s graveyard this turn are exiled instead.`);
      return;
    }
    case "handTurn": {
      // Sen Triplets (round 412): that player's hand, for the rest of this turn (none if they've left the game, CR 800.4a).
      for (const of of players(s, e.of, ctx)) {
        if (of === ctx.controller) continue;
        (s.handTurn ??= []).push({ player: ctx.controller, of, turn: s.turn, source: src });
        log(s, `${player(s, ctx.controller).name} may play lands and cast spells from ${player(s, of).name}'s hand this turn (${src}).`);
      }
      return;
    }
    case "revealHandTurn":
      for (const pid of players(s, e.who, ctx)) {
        player(s, pid).handRevealedTurn = s.turn;
        log(s, `${player(s, pid).name} plays with their hand revealed this turn (${src}).`);
      }
      return;
    case "topTurn": {
      // Xanathar, Guild Kingpin (round 412): that player's library, not yours; none if they've left the game (CR 800.4a).
      const of = e.of ? players(s, e.of, ctx)[0] : undefined;
      if (e.of && of === undefined) return;
      const list = (s.topTurn = (s.topTurn ?? []).filter((g) => g.turn === s.turn));
      list.push({ player: ctx.controller, turn: s.turn, top: e.top, source: src, ...(of !== undefined && of !== ctx.controller ? { of } : {}), ...(e.anyColor ? { anyColor: true as const } : {}) });
      if (of !== undefined && of !== ctx.controller)
        return void log(s, `Until end of turn, ${player(s, ctx.controller).name} may look at the top card of ${player(s, of).name}'s library any time and may play that card${e.anyColor ? ", spending mana as though it were mana of any color to cast spells this way" : ""} (${src}).`);
      log(s, `${player(s, ctx.controller).name} may look at the top card of their library any time and play cards from the top of their library this turn${e.top.payLife ? ", paying life rather than mana costs for spells" : ""} (${src}).`);
      return;
    }
    case "graveyardCastThisTurn": {
      // Locke: the cards milled, as they are now (CR 400.7).
      // Havengul Lich (round 400): the target card, still in its graveyard as that object (CR 400.7).
      const cards = e.what ? objects(s, e.what, ctx).filter((o) => o.zone === "graveyard").map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 })) : e.milled ? [...(s.resolving?.milled ?? [])] : undefined;
      if (cards && !cards.length) return;
      const yardOf = e.fromYardOf ? players(s, e.fromYardOf, ctx)[0] : undefined;
      if (e.fromYardOf && yardOf === undefined) return;
      (s.graveGrants ??= []).push({ key: `grant${s.nextId++}`, player: ctx.controller, turn: s.turn, filter: e.filter, source: src, ...(e.rider ? { rider: e.rider } : {}), ...(cards ? { cards } : {}), ...(yardOf !== undefined ? { fromYardOf: yardOf } : {}), ...(e.anyType ? { anyType: true as const } : {}) });
      if (yardOf !== undefined) {
        log(s, `${player(s, ctx.controller).name} may cast a ${e.filter.text.replace(/ card$/, "")} spell from ${player(s, yardOf).name}'s graveyard this turn${e.anyType ? ", spending mana as though it were mana of any color" : ""} (${src}).`);
        return;
      }
      if (cards) log(s, `${player(s, ctx.controller).name} may cast a spell from among ${cards.map((c) => defOf(s, obj(s, c.id)).name).join(", ")} this turn (${src}).`);
      else log(s, `${player(s, ctx.controller).name} may cast a ${e.filter.text.replace(/ card$/, "")} spell from their graveyard this turn (${src}).`);
      return;
    }
    case "noLifeGain":
      // Flames of the Blood Hand: "If that player ... would gain life this turn, that player gains no life instead": that one
      // player's life gain this turn does nothing (CR 119.7; rulings: not a player the damage was redirected to).
      if (e.players === "player") {
        for (const pid of e.who ? players(s, e.who, ctx) : []) {
          (s.noLifeGain ??= []).push({ turn: s.turn, controller: ctx.controller, who: "player", player: pid });
          log(s, `${src}: ${player(s, pid).name} gains no life this turn.`);
        }
        return;
      }
      (s.noLifeGain ??= []).push({ turn: s.turn, controller: ctx.controller, who: e.players });
      log(s, `${src}: ${e.players === "all" ? "players" : `${player(s, ctx.controller).name}'s opponents`} can't gain life this turn.`);
      return;
    case "noLifeGainForGame":
      for (const pid of players(s, e.who, ctx)) {
        player(s, pid).cantGainLifeForGame = true;
        log(s, `${player(s, pid).name} can't gain life for the rest of the game (${src}).`);
      }
      return;
    case "noPrevention":
      s.noPreventionTurn = s.turn;
      log(s, `${src}: damage can't be prevented this turn.`);
      return;
    case "damageMod": {
      const mod = { ...e.mod, ...(e.mod.amount !== undefined ? { amount: amountNow(s, e.mod.amount, ctx) } : {}) };
      if (e.byTarget !== undefined) {
        const t = ctx.targets[e.byTarget];
        const o = t?.kind === "object" ? s.objects[t.id] : undefined;
        if (!o || o.zone !== "battlefield") return;
        mod.by = { ...mod.by, chosen: { id: o.id, zc: o.zoneChanges ?? 0 } };
      }
      if (e.toTarget !== undefined) {
        const t = ctx.targets[e.toTarget];
        const o = t?.kind === "object" ? s.objects[t.id] : undefined;
        if (!o || o.zone !== "battlefield") return;
        mod.to = { ...mod.to, chosen: { id: o.id, zc: o.zoneChanges ?? 0 } };
      }
      // Desperate Gambit: "that source", chosen earlier in this resolution; none chosen, nothing happens.
      if (e.chosenSource) {
        const c = s.resolving?.chosenSource;
        if (!c) return;
        mod.by = { ...mod.by, chosen: c };
      }
      if (e.choose) {
        const chosen = chooseDamageSource(s, ctx, e.choose, src, e.choosePermanent);
        if (chosen === "paused") return "paused";
        if (!chosen) return;
        mod.by = { ...mod.by, chosen };
      }
      if (e.bySubject) {
        // "The next time that creature would deal combat damage": the trigger's creature, as the object it is.
        const o = ctx.subject && s.objects[ctx.subject.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
        mod.by = { ...mod.by, chosen: { id: o.id, zc: ctx.subject!.zc } };
      }
      if (e.toPlayer) {
        const [p] = players(s, e.toPlayer, ctx);
        if (p === undefined) return;
        mod.to = { player: p, permanentsOf: p };
      }
      const live = (s.damageMods ?? []).filter((r) => r.turn === s.turn || (r.until === "yourNextTurn" && !(s.activePlayer === r.you && s.turn > r.turn)));
      s.damageMods = [...live, { id: `dm${s.nextId++}`, mod, you: ctx.controller, name: ctx.sourceDef.name, turn: s.turn, ...(e.until ? { until: e.until } : {}) }];
      log(s, `${src}: ${e.mod.text.replace(/\.$/, "")}.`);
      return;
    }
    case "rememberGroup":
      if (s.resolving) s.resolving.created = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id);
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
      if (!sc.drawQueue) {
        s.resolving!.drawnBefore = s.resolving!.drawnThisWay;
        s.resolving!.drawnThisWay = [];
        s.resolving!.drawReplaced = undefined;
      }
      const queue = (sc.drawQueue ??= players(s, e.who, ctx));
      // Tales of the Ancestors: "each player with fewer cards in hand than the player with the most ... draws cards equal to
      // the difference": every difference worked out before anyone draws (CR 608.2h), or the first draws would change it.
      if (typeof e.n === "object" && "count" in e.n && e.n.count.kind === "behindMost") sc.drawEach ??= Object.fromEntries(queue.map((pid) => [pid, amountNow(s, e.n, { ...ctx, eachOne: pid })]));
      while (queue.length) {
        const pid = queue.shift()!;
        s.resolving!.drawing = true;
        const n = sc.drawEach?.[pid] ?? amountNow(s, e.n, { ...ctx, eachOne: pid });
        s.resolving!.drawing = undefined;
        log(s, `${player(s, pid).name} draws ${n} card${n === 1 ? "" : "s"}.`);
        if (!draw(s, pid, n)) return "paused";
      }
      sc.drawEach = undefined;
      return;
    }
    case "drawUpTo": {
      // "Its controller may draw up to two cards" (Arcane Denial): each player, in turn order, chooses how many before
      // drawing any (rulings), then draws them.
      const sc = (s.resolving!.scratch ??= {});
      const queue = (sc.drawUpToQueue ??= apnap(s, players(s, e.who, ctx)));
      while (queue.length) {
        const pid = queue[0]!;
        if (sc.drawUpTo === undefined && !player(s, pid).lost) {
          const options = Array.from({ length: e.n + 1 }, (_, i) => String(e.n - i));
          s.pending = { kind: "chooseOption", player: pid, source: src, what: "drawUpTo", options, labels: options.map((n) => (n === "0" ? "Draw none" : n === "1" ? "Draw 1 card" : `Draw ${n} cards`)), prompt: `draw up to ${e.n === 1 ? "one card" : `${e.n} cards`}?` };
          return "paused";
        }
        const n = Number(sc.drawUpTo ?? 0);
        sc.drawUpTo = undefined;
        queue.shift();
        // Truce: 2 life for each card fewer than two (a choice of fewer; drawing from an empty library still drew).
        if (e.shortLife && n < e.n && !player(s, pid).lost) gainLife(s, pid, (e.n - n) * e.shortLife);
        if (n <= 0 || player(s, pid).lost) continue;
        log(s, `${player(s, pid).name} draws ${n} card${n === 1 ? "" : "s"}.`);
        if (!draw(s, pid, n)) return "paused";
      }
      sc.drawUpToQueue = undefined;
      return;
    }
    case "poison":
      for (const pid of players(s, e.who, ctx)) {
        const n = putPlayerCounters(s, pid, "poison", e.upTo !== undefined ? Math.max(0, e.upTo - (player(s, pid).poison ?? 0)) : amountNow(s, e.n, ctx));
        if (n <= 0) continue;
        const p = player(s, pid);
        log(s, `${p.name} gets ${n === 1 ? "a poison counter" : `${n} poison counters`}.`);
      }
      return;
    case "banCounters": {
      // Suncleanser: for as long as the source remains on the battlefield; if it has already left, the duration has ended
      // and this does nothing (CR 611.2b).
      const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!src || src.zone !== "battlefield" || (ctx.sourceZc !== undefined && (src.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const bans = (src.bansCounters ??= []);
      for (const o of e.what ? objects(s, e.what, ctx).filter((x) => x.zone === "battlefield") : []) {
        bans.push({ zc: src.zoneChanges ?? 0, id: o.id, objZc: o.zoneChanges ?? 0 });
        log(s, `${defOf(s, o).name} can't have counters put on it for as long as ${src ? defOf(s, src).name : "its source"} remains on the battlefield.`);
      }
      for (const pid of e.who ? players(s, e.who, ctx) : []) {
        bans.push({ zc: src.zoneChanges ?? 0, player: pid });
        log(s, `${player(s, pid).name} can't get counters for as long as ${defOf(s, src).name} remains on the battlefield.`);
      }
      return;
    }
    case "loseAllCounters":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (e.poison) {
          const n = p.poison ?? 0;
          if (s.resolving) s.resolving.poisonLost = (s.resolving.poisonLost ?? 0) + n;
          if (!n) continue;
          p.poison = 0;
          log(s, `${p.name} loses all poison counters.`);
          continue;
        }
        if (e.rad) {
          if (!p.rad) continue;
          p.rad = 0;
          log(s, `${p.name} loses all rad counters.`);
          continue;
        }
        if (!p.poison && !p.energy && !p.experience && !p.rad) continue;
        if (e.counted && s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + (p.poison ?? 0) + (p.energy ?? 0) + (p.experience ?? 0) + (p.rad ?? 0);
        p.poison = 0;
        loseEnergy(s, p.id, p.energy ?? 0);
        p.experience = 0;
        p.rad = 0;
        log(s, `${p.name} loses all counters.`);
      }
      return;
    case "doublePlayerCounters":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        for (const kind of ["poison", "energy", "experience", "rad"] as const) {
          const n = p[kind] ?? 0;
          if (n <= 0) continue;
          const put = putPlayerCounters(s, pid, kind, n);
          if (put > 0) log(s, `${p.name} gets ${put} more ${kind === "energy" ? "energy" : `${kind}`} counter${put === 1 ? "" : "s"}.`);
        }
      }
      return;
    case "emblem": {
      // Named for its source as it is now, or as it last existed (CR 114.3: most emblems have no name; this is for the log).
      const from = ctxSource(s, ctx).name.split(" // ")[0]!;
      // Oko, Shadowmoor Scion: the creature type chosen as this resolved (none chosen: nothing to give it, CR 608.2h).
      const type = e.chosenType ? ctx.chosen?.type : undefined;
      if (e.chosenType && type === undefined) return;
      for (const pid of players(s, e.who, ctx)) {
        createEmblem(s, pid, e.abilities, from, type);
        log(s, `${player(s, pid).name} gets an emblem with ${e.abilities.map((a) => `"${(type !== undefined ? a.replace(/\bof the chosen type\b/g, `of the chosen type (${type})`) : a).replace(/~/g, "this emblem")}"`).join(" and ")}.`);
      }
      invalidateCharacteristics(s);
      return;
    }
    case "getEnergy":
      for (const pid of players(s, e.who, ctx)) {
        const n = putPlayerCounters(s, pid, "energy", amountNow(s, e.n, ctx));
        if (n <= 0) continue;
        const p = player(s, pid);
        log(s, `${p.name} gets ${"{E}".repeat(Math.min(n, 10))}${n > 10 ? ` (${n})` : ""}.`);
      }
      return;
    case "getRad":
      for (const pid of players(s, e.who, ctx)) {
        const n = putPlayerCounters(s, pid, "rad", amountNow(s, e.n, { ...ctx, eachOne: pid }));
        if (n > 0) log(s, `${player(s, pid).name} gets ${n === 1 ? "a rad counter" : `${n} rad counters`}.`);
      }
      return;
    case "radiation": {
      // CR 728.1: "if that player has one or more rad counters" (checked again now, CR 603.4), they mill that many; for each
      // nonland card milled this way, they lose 1 life and remove a rad counter.
      const p = player(s, ctx.controller);
      const n = millCount(s, p.id, p.rad ?? 0);
      if (n <= 0) return;
      const milled: ObjectId[] = [];
      for (const id of p.library.slice(0, n)) {
        moveObject(s, id, "graveyard", { milled: true });
        if (obj(s, id).zone === "graveyard") milled.push(id);
      }
      const k = milled.filter((id) => !isType(defOf(s, obj(s, id)), "Land")).length;
      log(s, `${p.name} mills ${n} card${n === 1 ? "" : "s"} from radiation${k ? `, ${k} of them nonland` : ""}.`);
      if (!k) return;
      // Strong, the Brutish Thespian: they gain that much life instead (rulings).
      const strong = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === p.id && abilitiesOf(s, obj(s, id)).radiationGains);
      if (strong) {
        gainLife(s, p.id, k);
        log(s, `${p.name} gains ${k} life from radiation instead.`);
      } else loseLife(s, p.id, k);
      p.rad = Math.max(0, (p.rad ?? 0) - k);
      log(s, `${p.name} removes ${k === 1 ? "a rad counter" : `${k} rad counters`}.`);
      return;
    }
    case "getExperience":
      for (const pid of players(s, e.who, ctx)) {
        const n = putPlayerCounters(s, pid, "experience", amountNow(s, e.n, ctx));
        if (n > 0) log(s, `${player(s, pid).name} gets ${n === 1 ? "an experience counter" : `${n} experience counters`}.`);
      }
      return;
    case "ringTempts":
      return ringTempts(s, ctx, src);
    case "becomeMonarch":
      for (const pid of players(s, e.who, ctx)) becomeMonarch(s, pid);
      return;
    case "cantBecomeMonarch":
      for (const pid of players(s, e.who, ctx)) {
        const no = ((s.turnLog ??= {}).cantBecomeMonarch ??= []);
        if (!no.includes(pid)) no.push(pid);
        log(s, `${player(s, pid).name} can't become the monarch this turn.`);
      }
      return;
    case "becomeDayNight":
      setDayNight(s, e.v === "switch" ? (s.dayNight === "night" ? "day" : "night") : e.v);
      return;
    case "extraLandThisTurn": {
      // Only this turn; on another player's turn it lets them play none (rulings on Explore).
      // "You may play X additional lands this turn" (Nahiri's Lithoforming): X as it resolves.
      const p = player(s, ctx.controller);
      const n = amountNow(s, e.n, ctx);
      if (!n) return;
      p.extraLands = { turn: s.turn, n: (p.extraLands?.turn === s.turn ? p.extraLands.n : 0) + n };
      log(s, `${p.name} may play ${n === 1 ? "an additional land" : `${n} additional lands`} this turn.`);
      return;
    }
    case "reduceSpeedIfFastest": {
      // Spikeshell Harrier: only a speed greater than every other player's (no speed counts as 0, CR 702.179f), and never
      // below 1.
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const speed = p.speed ?? 0;
        if (livingPlayers(s).some((q) => q !== pid && (player(s, q).speed ?? 0) >= speed) || speed <= 1) continue;
        p.speed = speed - 1;
        invalidateCharacteristics(s); // max speed abilities
        log(s, `${p.name}'s speed is reduced to ${p.speed}.`);
      }
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
      // The mana empties from the pool as the step or phase ends (CR 106.4). "Target player adds ...": that player.
      if (e.who) {
        const color = s.resolving?.chosen?.color;
        for (const pid of players(s, e.who, ctx)) {
          // Radiant Lotus: "three mana of the chosen color for each artifact sacrificed this way": that many times over.
          const added = e.mana ? e.mana.repeat(e.times === undefined ? 1 : amountNow(s, e.times, ctx)) : color && e.chosen ? `{${color}}`.repeat(e.chosen * (e.times === undefined ? 1 : amountNow(s, e.times, ctx))) : "";
          const from = manaSourceOrigins(s, ctx);
          for (const m of added.matchAll(/\{([WUBRGC])\}/g)) addMana(s, pid, [m[1] as ManaType], { from, ...(e.only ? { only: e.only } : {}), ...(e.keep ? { keep: e.keep } : {}) });
          if (added) log(s, `${player(s, pid).name} adds ${added}.`);
        }
        return;
      }
      const p = player(s, ctx.controller);
      const color = s.resolving?.chosen?.color;
      if (e.sacrificedType) {
        // Squandered Resources: a type the sacrificed land could produce as it last existed (CR 106.7, 608.2h), chosen as
        // it resolves (CR 605.3b); one that could produce none adds nothing (rulings).
        const could = ctx.sacrificed?.[0]?.couldProduce ?? [];
        const sc = (s.resolving!.scratch ??= {});
        if (!could.length) {
          log(s, `${src}: the sacrificed land couldn't produce mana, so no mana is added.`);
          return;
        }
        if (could.length > 1 && sc.either === undefined) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "either", options: could.map((_, i) => String(i)), labels: could.map((m) => `Add {${m}}`), prompt: "choose the type of mana" };
          return "paused";
        }
        const made = could[could.length > 1 ? Math.max(0, Math.min(could.length - 1, sc.either!)) : 0]!;
        delete sc.either;
        const from = s.resolving?.item.manaAbility ? (s.resolving.item.manaAbility.from ?? []) : manaSourceOrigins(s, ctx);
        addMana(s, p.id, [made], { from });
        log(s, `${p.name} adds {${made}}.`);
        return;
      }
      if (e.split) {
        // How many of the first color, the rest the second, chosen as it resolves (CR 608.2d).
        const n = amountNow(s, e.times ?? 1, ctx);
        const sc = (s.resolving!.scratch ??= {});
        if (!n) return;
        const mix = (k: number) => `{${e.split![0]}}`.repeat(k) + `{${e.split![1]}}`.repeat(n - k);
        if (sc.either === undefined) {
          const ks = Array.from({ length: n + 1 }, (_, i) => n - i);
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "either", options: ks.map(String), labels: ks.map((k) => `Add ${mix(k)}`), prompt: "choose the mana" };
          return "paused";
        }
        const k = Math.max(0, Math.min(n, sc.either));
        delete sc.either;
        // Tapped for mana (Orcish Lumberjack): Mana Reflection's replacement multiplies it (CR 106.12b).
        const made = [...mix(k).matchAll(/\{([WUBRGC])\}/g)].map((m) => m[1] as ManaType);
        const added = s.resolving?.item.manaAbility?.tapped ? tappedForMana(s, ctx.controller, ctx.sourceId ? s.objects[ctx.sourceId] : undefined, made, s.resolving.item.manaAbility.instead) : made;
        // Domri, Chaos Bringer: a creature spell it's spent on gains riot (ManaLot.riot).
        for (const m of added) addMana(s, p.id, [m], { from: manaSourceOrigins(s, ctx), ...(e.riot ? { riot: src } : {}) });
        log(s, `${p.name} adds ${added.map((m) => `{${m}}`).join("")}.`);
        return;
      }
      if (e.anyColors) {
        // "Add X mana in any combination of colors" (CR 106.1b): X worked out first (CR 608.2h), then how much of each
        // color, chosen by the player adding it (608.2d). Hazel of the Rootbloom's has {T} in its cost: tapped for mana,
        // so Mana Reflection multiplies it (CR 106.12b).
        const sc = (s.resolving!.scratch ??= {});
        if (!sc.manaMix) {
          const n = Math.max(0, amountNow(s, e.times ?? 1, ctx));
          if (!n) return;
          // Omnath, Locus of All: "in any combination of its colors", the looked-at card's colors (CR 105.2).
          const rv = e.revealedColors ? s.resolving?.revealed : undefined;
          const card = rv && s.objects[rv.id];
          const colors = e.revealedColors ? (card && (card.zoneChanges ?? 0) === rv!.zc ? characteristics(s, card).colors : []) : undefined;
          if (colors && !colors.length) {
            log(s, `${src}: the card has no colors, so no mana is added.`);
            return;
          }
          s.pending = { kind: "manaMix", player: ctx.controller, source: src, n, ...(colors ? { colors: COLORS.filter((c) => colors.includes(c)) } : {}) };
          return "paused";
        }
        const mix = sc.manaMix;
        delete sc.manaMix;
        const from = manaSourceOrigins(s, ctx);
        const mixed = COLORS.flatMap((c) => Array<ManaType>(mix[c] ?? 0).fill(c));
        const colors = s.resolving?.item.manaAbility?.tapped ? tappedForMana(s, ctx.controller, ctx.sourceId ? s.objects[ctx.sourceId] : undefined, mixed, s.resolving.item.manaAbility.instead) : mixed;
        for (const c of colors) addMana(s, p.id, [c], { from, ...(e.only ? { only: e.only } : {}), ...(e.keep ? { keep: e.keep } : {}) });
        if (colors.length) log(s, `${p.name} adds ${colors.map((c) => `{${c}}`).join("")}.`);
        return;
      }
      let added = e.mana ? e.mana.repeat(e.times === undefined ? 1 : amountNow(s, e.times, ctx)) : color && e.chosen ? `{${color}}`.repeat(e.chosen * (e.times === undefined ? 1 : amountNow(s, e.times, ctx))) : "";
      // Carpet of Flowers: "if you haven't added mana with this ability this turn".
      const marked = e.markSource && added && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (marked) (marked.triggeredThisTurn ??= []).push(`${ctx.sourceZc ?? marked.zoneChanges ?? 0}|addedMana`);
      // An activated mana ability with {T} in its cost taps its source for mana (CR 106.12): Mana Reflection's
      // replacement effect multiplies what it produces (106.12b).
      if (s.resolving?.item.manaAbility?.tapped) added = tappedForMana(s, ctx.controller, ctx.sourceId ? s.objects[ctx.sourceId] : undefined, [...added.matchAll(/\{([WUBRGC])\}/g)].map((m) => m[1] as ManaType), s.resolving.item.manaAbility.instead).map((m) => `{${m}}`).join("");
      // What the mana's source was (CR 106.3): a mana ability's source as it was activated, else a snow spell, or the
      // ability's source (snow mana, CR 107.4h; mana from a creature).
      const from = s.resolving?.item.manaAbility ? (s.resolving.item.manaAbility.from ?? []) : manaSourceOrigins(s, ctx);
      for (const m of added.matchAll(/\{([WUBRGC])\}/g)) {
        // "Until end of turn, you don't lose this mana as steps and phases end."
        addMana(s, p.id, [m[1] as ManaType], { from, ...(e.only ? { only: e.only } : {}), ...(e.keep ? { keep: e.keep } : {}) });
        if (s.resolving?.item.manaAbility) (s.resolving.made ??= []).push(m[1] as ManaType);
      }
      if (added) log(s, `${p.name} adds ${added}.`);
      return;
    }
    case "manaTriggerThisTurn":
      (s.manaTriggersThisTurn ??= []).push({ controller: ctx.controller, source: src, trigger: e.trigger });
      log(s, `Until end of turn, ${e.trigger.text.replace(/^W/, "w").replace(/\.$/, "")}.`);
      return;
    case "stealDrawsThisTurn":
      // Plagiarize: each of that player's draws this turn is replaced (game.ts notionThief), until the cleanup step.
      for (const pid of players(s, e.who, ctx)) {
        (s.drawSteals ??= []).push({ id: `steal:${s.turn}:${(s.drawSteals ?? []).length}`, victim: pid, by: ctx.controller, source: src });
        log(s, `Until end of turn, if ${player(s, pid).name} would draw a card, ${player(s, ctx.controller).name} draws instead.`);
      }
      return;
    case "keepManaThisTurn":
      (s.keepManaThisTurn ??= []).push({ player: ctx.controller, ...(e.color ? { color: e.color } : {}) });
      log(s, `Until end of turn, ${player(s, ctx.controller).name} doesn't lose unspent ${e.color ? `${COLOR_NAMES[e.color].toLowerCase()} ` : ""}mana as steps and phases end.`);
      return;
    case "cantAttackRule":
    {
      const t = e.exceptTarget !== undefined ? ctx.targets[e.exceptTarget] : undefined;
      const except = t?.kind === "object" ? { id: t.id, zc: t.zc ?? s.objects[t.id]?.zoneChanges ?? 0 } : undefined;
      const of = e.ofPlayer ? players(s, e.ofPlayer, ctx)[0] : undefined;
      if (e.ofPlayer && of === undefined) return;
      (s.cantAttackThisTurn ??= []).push({ filter: of !== undefined ? { ...e.filter, controlledBy: of } : e.filter, controller: ctx.controller, ...(except ? { except } : {}), ...(e.combat ? { combat: s.combatsThisTurn ?? 0 } : {}) });
      log(s, of !== undefined ? `Creatures ${player(s, of).name} controls can't attack this ${e.combat ? "combat" : "turn"}.` : `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1)} can't attack this ${e.combat ? "combat" : "turn"}.`);
      return;
    }
    case "costModThisTurn": {
      // Maelstrom Muse's X, Mutated Cultist's "for each counter removed this way": counted as it resolves.
      const k = e.times !== undefined ? Math.max(0, amountNow(s, e.times, ctx)) : 1;
      if (e.times !== undefined && !k) return;
      // Cheering Fanatic: the name chosen as it resolves (CR 611.2c); with none chosen, nothing.
      const name = e.chosenName ? ctx.chosen?.name : undefined;
      if (e.chosenName && name === undefined) return;
      const named = name !== undefined ? { ...e.mod, filter: { ...e.mod.filter, named: name, text: `spells named ${name}` }, text: `Spells named ${name} cost {${-e.mod.n}} less to cast this turn.` } : e.mod;
      const mod = k === 1 ? named : { ...named, n: named.n * k };
      // Will Kenrith: "spells that player casts", the target player's, still in the game (CR 800.4a); until your next turn.
      const who = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (who === undefined) return;
      (s.costModsThisTurn ??= []).push({ player: who, mod, ...(e.untilYourNextTurn ? { untilYourNextTurn: true as const } : {}), ...(e.untilYourNextTurn && who !== ctx.controller ? { until: ctx.controller } : {}), ...(e.next ? { next: true as const } : {}) });
      log(s, `${player(s, who).name}: ${mod.text.replace(/ you cast this turn /, " they cast this turn ").replace(/ that player casts /, " they cast ").replace(/\{X\}/, `{${k}}`)}`);
      return;
    }
    case "cantBlockRule": {
      // Eunuchs' Intrigues: the creatures that player controls now or later this turn, but the one they chose (a rule for
      // the turn, not a change to the creatures there now, CR 611.2c).
      const of = e.ofPlayer ? players(s, e.ofPlayer, ctx)[0] : undefined;
      if (e.ofPlayer && of === undefined) return;
      const chosen = e.exceptChosen ? objects(s, { ref: "created" }, ctx)[0] : e.exceptTarget !== undefined ? objects(s, { ref: "target", index: e.exceptTarget }, ctx)[0] : undefined;
      // "Of that quality" (Twins of Discord): the choice made as it resolved.
      // Rumbling Ruin: "with power less than or equal to that number", counted now (CR 608.2h).
      const filter0 = bindChosen(of !== undefined ? { ...e.filter, controlledBy: of } : e.filter, ctx.chosen);
      const filter = filter0.bound ? bindBound(s, filter0, amountCtx(s, ctx)) : filter0;
      (s.cantBlockThisTurn ??= []).push({ filter, controller: ctx.controller, ...(chosen ? { except: { id: chosen.id, zc: chosen.zoneChanges ?? 0 } } : {}) });
      log(s, `${of !== undefined ? `${chosen ? "Other c" : "C"}reatures ${player(s, of).name} controls` : `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1)}`} can't block this turn.`);
      return;
    }
    case "cantBeBlockedRule": {
      // "Creatures named ~": the source's name now, as it last existed if it's gone (CR 201.5, 608.2h).
      const me = e.filter.named === "~" && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const filter = e.filter.named === "~" ? { ...e.filter, named: me?.zone === "battlefield" ? characteristics(s, me).name : ctx.sourceDef.name } : e.filter;
      (s.cantBeBlockedThisTurn ??= []).push({ filter, controller: ctx.controller });
      log(s, `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1).replace(/~/g, filter.named ?? "~")} can't be blocked this turn.`);
      return;
    }
    case "addCombatMana": {
      // Firebending (CR 702.189a): red mana that stays in the pool until end of combat (see advanceStep).
      const n = amountNow(s, e.n, ctx);
      const p = player(s, ctx.controller);
      addMana(s, p.id, Array(n).fill("R"), { from: manaSourceOrigins(s, ctx), keep: "combat" });
      if (n) log(s, `${p.name} adds ${"{R}".repeat(n)} (until end of combat).`);
      return;
    }
    case "noEffect":
      log(s, `${src}: ${e.text}.`);
      return;
    case "noteLife": {
      const o = ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      o.notedLife = player(s, ctx.controller).life;
      log(s, `${src} notes ${player(s, ctx.controller).name}'s life total: ${o.notedLife}.`);
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
    case "exchangeLife": {
      // Both players must still be there (an illegal target does nothing, CR 608.2b), and different (CR 701.12a).
      const [a] = players(s, e.a, ctx);
      const [b] = players(s, e.b, ctx);
      // Profane Transfusion's token counts both players' totals, also one that's no longer a legal target (CR 608.2b).
      const named = (r: PlayerRef, p: PlayerId | undefined) => p ?? (r.ref === "target" && ctx.targets[r.index]?.kind === "player" ? (ctx.targets[r.index] as { id: PlayerId }).id : undefined);
      const [na, nb] = [named(e.a, a), named(e.b, b)];
      const record = (lost: Record<PlayerId, number>) => {
        if (s.resolving && na !== undefined && nb !== undefined) s.resolving.exchanged = { players: [na, nb], lost };
      };
      record({});
      if (a === undefined || b === undefined || a === b) return;
      const [la, lb] = [player(s, a).life, player(s, b).life];
      // Psychic Transfer: the difference as it resolves, with a negative total as it is (rulings).
      if (e.maxDiff !== undefined && Math.abs(la - lb) > e.maxDiff) {
        log(s, `${player(s, a).name} and ${player(s, b).name}'s life totals differ by more than ${e.maxDiff}.`);
        return;
      }
      if (la === lb) return;
      const [up, down] = la < lb ? [a, b] : [b, a];
      const diff = Math.abs(la - lb);
      // A player who can't gain life can't be given a higher total, nor one who can't lose life a lower one (CR 701.12c).
      if (!canGainLife(s, up) || !canLoseLife(s, down)) {
        log(s, `${player(s, a).name} and ${player(s, b).name} can't exchange life totals.`);
        return;
      }
      log(s, `${player(s, a).name} and ${player(s, b).name} exchange life totals: ${player(s, up).name} gains ${diff} life and ${player(s, down).name} loses ${diff} life.`);
      const before = player(s, down).life;
      loseLife(s, down, diff);
      record({ [down]: before - player(s, down).life });
      gainLife(s, up, diff);
      return;
    }
    case "loseUnspentMana": {
      // Mana Short: all of it, mana kept "until end of turn" or by a permanent too (CR 106.4).
      const lost: [PlayerId, number][] = [];
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (!Object.values(p.manaPool).some((n) => n > 0)) continue;
        lost.push([pid, Object.values(p.manaPool).reduce((a, n) => a + n, 0)]);
        p.manaPool = emptyPool();
        p.manaLots = undefined;
        log(s, `${p.name} loses all unspent mana.`);
      }
      // Yurlok of Scorch Thrash: that mana lost costs life too.
      manaBurn(s, lost);
      return;
    }
    case "exchangeLifeWithSelf": {
      // CR 701.12g: the life total becomes the power or toughness ~ had, and it gets that player's previous life total.
      const [pid] = players(s, e.who, ctx);
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (pid === undefined || !me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) {
        log(s, `${src}: the exchange can't happen.`);
        return;
      }
      const life = player(s, pid).life;
      const stat = e.stat === "power" ? power(s, me) : toughness(s, me);
      // A player who can't gain (lose) life can't be given a higher (lower) total, and then nothing is exchanged (CR 701.12a).
      if ((stat > life && !canGainLife(s, pid)) || (stat < life && !canLoseLife(s, pid))) {
        log(s, `${src}: ${player(s, pid).name}'s life total can't change, so nothing is exchanged.`);
        return;
      }
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: me.id, duration: "game", affected: [me.id], mods: [e.stat === "power" ? { kind: "setPower", power: life } : { kind: "setToughness", toughness: life }] });
      invalidateCharacteristics(s);
      log(s, `${src}: ${player(s, pid).name}'s life total (${life}) and ${src}'s ${e.stat} (${stat}) are exchanged.`);
      if (stat > life) gainLife(s, pid, stat - life);
      else if (stat < life) loseLife(s, pid, life - stat);
      return;
    }
    case "setLife": {
      // CR 119.5: the player gains or loses the life it takes, which can't happen if they can't gain or lose life.
      // "The lowest (or highest, Arbiter of Knollridge) life total among all players" (Repay in Kind): counted once, before anyone's changes; the players
      // lose life at the same time (rulings).
      const who = players(s, e.who, ctx);
      const shared = e.lowest ? Math.min(...livingPlayers(s).map((pid) => player(s, pid).life)) : e.highest ? Math.max(...livingPlayers(s).map((pid) => player(s, pid).life)) : 0;
      const own = new Map(e.amount ? who.map((pid) => [pid, amountNow(s, e.amount!, { ...ctx, eachOne: pid })] as const) : []);
      simultaneousLifeLoss(s, () => {
        for (const pid of who) {
          const p = player(s, pid);
          const diff = (e.double ? 2 * p.life : e.lowest || e.highest ? shared : e.amount ? own.get(pid)! : e.n) - p.life;
          if (diff > 0 && canGainLife(s, pid)) {
            gainLife(s, pid, diff);
            log(s, `${p.name}'s life total becomes ${p.life} (${src}).`);
          } else if (diff < 0 && canLoseLife(s, pid)) {
            loseLife(s, pid, -diff);
            log(s, `${p.name}'s life total becomes ${p.life} (${src}).`);
          }
        }
      });
      return;
    }
    case "loseLife": {
      let total = 0;
      simultaneousLifeLoss(s, () => {
        for (const pid of players(s, e.who, ctx)) {
          const n = amountNow(s, e.n, { ...ctx, eachOne: pid });
          if (n <= 0) continue;
          // "Life lost this way" is what the life total actually lost: none if it can't change, twice under Bloodletter.
          const before = player(s, pid).life;
          loseLife(s, pid, n);
          total += before - player(s, pid).life;
          log(s, `${player(s, pid).name} loses ${n} life.`);
        }
      });
      if (s.resolving) s.resolving.lifeLost = (s.resolving.lifeLost ?? 0) + total;
      if (e.drain && total > 0) {
        gainLife(s, ctx.controller, total);
        log(s, `${player(s, ctx.controller).name} gains ${total} life.`);
      }
      return;
    }
    case "createdFightEach": {
      // CR 701.14: each pair deals damage at the same time as the others (rulings), each to the other.
      const created = new Set(s.resolving?.created ?? []);
      const tokens = [...created].map((id) => s.objects[id]).filter((o): o is GameObject => o?.zone === "battlefield" && objIsType(s, o, "Creature"));
      const prey = s.battlefield.map((id) => obj(s, id)).filter((o) => !created.has(o.id) && objIsType(s, o, "Creature") && objectMatches(s, e.filter, o, ctx.controller, false));
      const pairs = tokens.slice(0, prey.length).map((a, i) => [a, prey[i]!] as const);
      if (!pairs.length) return;
      const events: DamageEvent[] = pairs.flatMap(([a, b]) => [
        { src: objectSource(s, a), to: { object: b.id }, n: power(s, a) },
        { src: objectSource(s, b), to: { object: a.id }, n: power(s, b) },
      ]);
      log(s, pairs.map(([a, b]) => `${characteristics(s, a).name} fights ${characteristics(s, b).name}`).join(", ") + ".");
      const to = (x: DamageEvent) => ("object" in x.to ? x.to.object : "");
      const lethal = new Map(events.map((x) => [`${x.src.id}>${to(x)}`, lethalAmounts(s, x.src, obj(s, to(x)))]));
      const by = new Map<string, number>();
      for (const d of dealDamageBatch(s, events)) {
        if (!d.dealt || !d.src.id) continue;
        by.set(d.src.id, (by.get(d.src.id) ?? 0) + d.dealt);
        noteExcess(s, to(d), excessOver(lethal.get(`${d.src.id}>${to(d)}`)!, d.dealt), true);
      }
      for (const [id, amount] of by) fireEvent(s, { type: "dealtDamage", id, amount, combat: false });
      for (const f of pairs.flat()) if (f.zone === "battlefield") f.foughtTurn = s.turn;
      return;
    }
    case "fight":
    case "bite": {
      // CR 701.14b: if either creature is gone, isn't a creature, or is an illegal target, no damage is dealt.
      // "Each of those creatures deals damage equal to its power to ~": each target still legal and still a creature.
      // Compel Brutality: a planeswalker dealing damage equal to its loyalty, the loyalty counters on it (CR 306.5b).
      const as = objects(s, e.a, ctx).filter((a) => objIsType(s, a, e.type === "bite" && e.loyalty ? "Planeswalker" : "Creature"));
      const a = as[0];
      // "Deals damage equal to its power to each of two other target creatures": each one still a legal target, a
      // planeswalker too where it could be targeted (Bite Down). Only fighting needs both to be creatures (CR 701.14b).
      const bs = e.type === "bite" && e.self ? as : e.type === "bite" ? objects(s, e.b, ctx).filter((b) => ["Creature", "Planeswalker", "Battle"].some((t) => objIsType(s, b, t))) : objects(s, e.b, ctx).slice(0, 1).filter((b) => objIsType(s, b, "Creature"));
      if (!a || !bs.length) {
        log(s, `${src}: no damage is dealt.`);
        return;
      }
      if (e.type === "bite") {
        // Noncombat damage from the creatures themselves, all dealt at once: their own deathtouch, lifelink, infect
        // apply. Their power as it resolves (rulings on Living Inferno).
        const events: DamageEvent[] = as.flatMap((x) =>
          (e.self ? [x] : bs).flatMap((b): DamageEvent[] => {
            const src = objectSource(s, x);
            const n = (e.loyalty ? (x.counters.loyalty ?? 0) : power(s, x)) * (e.times ?? 1);
            // Ram Through: with trample, the damage beyond lethal goes to the creature's controller (CR 120.4a).
            const excess = e.excessIfTrample && objHasKeyword(s, x, "Trample") ? excessOver(lethalAmounts(s, src, b), n) : 0;
            return excess ? [{ src, to: { object: b.id }, n: n - excess }, { src, to: { player: controllerOf(s, b) }, n: excess }] : [{ src, to: { object: b.id }, n }];
          }),
        );
        const by = new Map<string, number>();
        dealtWithExcess(s, events[0]!.src, events, (evs) => {
          const out = dealDamageBatch(s, evs);
          for (const d of out) if (d.dealt && d.src.id) by.set(d.src.id, (by.get(d.src.id) ?? 0) + d.dealt);
          return out;
        });
        for (const [id, amount] of by) fireEvent(s, { type: "dealtDamage", id, amount, combat: false });
        return;
      }
      // Fighting: each creature deals damage at the same time, so each is one event per source.
      const b = bs[0]!;
      // "Whenever one or more creatures you control fight" (Neyith): the creatures as they fight, whoever dies from it.
      const fighters = [a, b].map((x) => ({ id: x.id, controller: controllerOf(s, x) }));
      const pa = e.byToughness ? toughness(s, a) : power(s, a);
      const pb = e.byToughness ? toughness(s, b) : power(s, b);
      // The excess damage each is dealt (The Last Agni Kai, Rhino's Rampage), beyond what was lethal just before (CR 120.10).
      const [srcA, srcB] = [objectSource(s, a), objectSource(s, b)];
      const [lethalB, lethalA] = [lethalAmounts(s, srcA, b), lethalAmounts(s, srcB, a)];
      const byA = dealDamage(s, srcA, { object: b }, pa);
      const byB = dealDamage(s, srcB, { object: a }, pb); // a creature fighting itself takes twice its power (CR 701.14c)
      if (a.id !== b.id) {
        noteExcess(s, b.id, excessOver(lethalB, byA), true);
        noteExcess(s, a.id, excessOver(lethalA, byB), true);
      }
      if (byA) fireEvent(s, { type: "dealtDamage", id: a.id, amount: byA, combat: false });
      if (byB) fireEvent(s, { type: "dealtDamage", id: b.id, amount: byB, combat: false });
      if (e.byToughness) return;
      // Boxing Ring: "a creature that fought this turn", even one that's dealt no damage (CR 701.14b).
      for (const f of [a, b]) if (f.zone === "battlefield") f.foughtTurn = s.turn;
      fireEvent(s, { type: "fought", ids: fighters.map((f) => f.id), controllers: fighters.map((f) => f.controller) });
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
  // Jared Carthalion: a player who can't become the monarch this turn doesn't, and the monarch stays the monarch (rulings).
  if (s.turnLog?.cantBecomeMonarch?.includes(pid)) {
    log(s, `${p.name} can't become the monarch this turn.`);
    return;
  }
  s.cards[MONARCH.oracleId] ??= MONARCH;
  s.monarch = pid;
  invalidateCharacteristics(s); // "as long as you're the monarch"
  endWhileTapped(s); // "for as long as they're the monarch" (Garland, Royal Kidnapper, CR 611.2b)
  log(s, `${p.name} becomes the monarch.`);
  fireEvent(s, { type: "becameMonarch", player: pid });
  // Palace Jailer: what it exiled returns as one of its controller's opponents becomes the monarch (CR 610.3).
  const due = (s.exiledUntilMonarch ?? []).filter((x) => x.controller !== pid && opponents(s, x.controller).includes(pid));
  if (!due.length) return;
  s.exiledUntilMonarch = s.exiledUntilMonarch!.filter((x) => !due.includes(x));
  if (!s.exiledUntilMonarch.length) s.exiledUntilMonarch = undefined;
  for (const x of due) returnUntilLeaves(s, x.cards, x.source, `${p.name} became the monarch`, x.controller);
}

/**
 * The trigger's creature as a damage source ("it deals that much damage", Kediss): as it is on the battlefield, or as
 * it last existed there once it has left (CR 608.2h), with the lifelink or deathtouch it had then (rulings on Warstorm
 * Surge, Fiendlash).
 */
/** A target permanent that deals the damage itself, while it's still a legal target (CR 608.2b). */
/**
 * "Blazing Torch deals 2 damage" in an ability it gave: that permanent, or as it last existed on the battlefield once it
 * has left, sacrificed for the ability (CR 608.2h); nothing if it's another object by then.
 */
function grantSourceSource(s: GameState, by: { id?: string; zc?: number }): DamageSource | undefined {
  const o = by.id ? s.objects[by.id] : undefined;
  if (!o) return undefined;
  if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === by.zc) return objectSource(s, o);
  const lk = s.lastKnown?.[o.id];
  if (!lk || lk.zc !== by.zc) return undefined;
  const ref = { object: o.id, zc: lk.zc };
  return lk.source ? { ...lk.source, controller: lk.controller, ref } : cardSource((lk.copyKey && s.cards[lk.copyKey]) || defOf(s, o), lk.controller, ref);
}
function targetSource(s: GameState, ctx: ResolveCtx, index: number, lastKnown?: true, exiled?: true): DamageSource | undefined {
  const o = ctx.legal[index] ? objects(s, { ref: "target", index }, ctx)[0] : undefined;
  // Selfless Exorcist: the card this resolution exiled, still that object in exile (CR 400.7), its owner its controller
  // (CR 108.4a).
  if (exiled) {
    const t = ctx.targets[index];
    if (!o || t?.kind !== "object" || o.zone !== "exile" || t.zc === undefined || (o.zoneChanges ?? 0) !== t.zc + 1) return undefined;
    return { ...objectSource(s, o), controller: o.owner, ref: { object: o.id, zc: o.zoneChanges ?? 0 } };
  }
  if (o?.zone === "battlefield") return objectSource(s, o);
  // Moved off the battlefield by this resolution, on its last move: as it last existed there (CR 608.2h).
  const lk = lastKnown && o ? s.lastKnown?.[o.id] : undefined;
  if (!o || !lk || lk.zc !== (o.zoneChanges ?? 0) - 1) return undefined;
  const ref = { object: o.id, zc: lk.zc };
  return lk.source ? { ...lk.source, controller: lk.controller, ref } : cardSource((lk.copyKey && s.cards[lk.copyKey]) || defOf(s, o), lk.controller, ref);
}

/**
 * The spell whose casting triggered this ability ("that spell deals ...", Sorcerer Class): as it is on the stack, or as
 * it last existed there once it has left (rulings, CR 608.2h), with its controller and colors as it was cast.
 */
function castSpellSource(s: GameState, ctx: ResolveCtx): DamageSource | undefined {
  const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  if (!item || !o) return undefined;
  const d = defOf(s, o);
  return { ...cardSource(d, item.controller, { object: o.id, zc: o.zone === "stack" ? (o.zoneChanges ?? 0) : (s.lastKnown?.[o.id]?.zc ?? o.zoneChanges ?? 0) }), spell: true, ...(item.copy ? {} : { cast: true as const }), colors: item.castColors ?? d.colors, ...(item.castMv !== undefined ? { manaValue: item.castMv } : {}) };
}

function subjectSource(s: GameState, ctx: ResolveCtx): DamageSource | undefined {
  const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
  // Splintering Wind: "When it leaves the battlefield, it deals 1 damage ...": a token that has ceased to exist (CR 111.7)
  // deals it as it last existed (CR 608.2h).
  if (!o && !(ctx.subject && s.lastKnown?.[ctx.subject.id]?.source)) return undefined;
  if (o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc) return objectSource(s, o);
  // A "dies" trigger's subject is the card in the graveyard, one zone change after the creature (see subjectEvenIfGone).
  const lk = s.lastKnown?.[ctx.subject!.id];
  if (!lk || (lk.zc !== ctx.subject!.zc && lk.zc !== ctx.subject!.zc - 1)) return undefined;
  const ref = { object: ctx.subject!.id, zc: lk.zc };
  return lk.source ? { ...lk.source, controller: lk.controller, ref } : cardSource((lk.copyKey && s.cards[lk.copyKey]) || defOf(s, o!), lk.controller, ref);
}

/**
 * Deal damage events at once with `deal`, noting for "this way" what was damaged and the excess damage dealt to
 * permanents: beyond what was lethal for each just before (CR 120.10). Returns the damage dealt.
 */
function dealtWithExcess(s: GameState, from: DamageSource, events: DamageEvent[], deal: (events: DamageEvent[]) => (DamageEvent & { dealt: number })[]): number {
  const lethal = new Map(events.flatMap((ev) => ("object" in ev.to ? [[ev.to.object, lethalAmounts(s, ev.src ?? from, obj(s, ev.to.object))] as const] : [])));
  const creatures = new Set(events.flatMap((ev) => ("object" in ev.to && objIsType(s, obj(s, ev.to.object), "Creature") ? [ev.to.object] : [])));
  const toObject = new Map<ObjectId, number>();
  // Drain Life's cap on each recipient, as it is just before the damage (CR 120.3): a player's life total, a planeswalker's
  // loyalty, a creature's toughness (even if it's already damaged, rulings); the smallest that applies.
  const keyOf = (to: DamageEvent["to"]) => ("player" in to ? `p:${to.player}` : `o:${to.object}`);
  const capOf = (to: DamageEvent["to"], loyaltyLost = 0): number => {
    if ("player" in to) return Math.max(0, player(s, to.player).life);
    const o = obj(s, to.object);
    const caps = [...(objIsType(s, o, "Planeswalker") ? [(o.counters.loyalty ?? 0) + loyaltyLost] : []), ...(objIsType(s, o, "Creature") ? [toughness(s, o)] : [])];
    return Math.max(0, caps.length ? Math.min(...caps) : 0);
  };
  const caps = new Map<string, number>([...s.turnOrder.map((p) => [`p:${p}`, Math.max(0, player(s, p).life)] as const), ...events.flatMap((ev) => ("object" in ev.to ? [[keyOf(ev.to), capOf(ev.to)] as const] : []))]);
  const dealtTo = new Map<string, { to: DamageEvent["to"]; n: number }>();
  let dealt = 0;
  for (const e of deal(events)) {
    dealt += e.dealt;
    const key = keyOf(e.to);
    dealtTo.set(key, { to: e.to, n: (dealtTo.get(key)?.n ?? 0) + e.dealt });
    if (e.dealt > 0 && "object" in e.to) toObject.set(e.to.object, (toObject.get(e.to.object) ?? 0) + e.dealt);
    if (e.dealt > 0 && "object" in e.to && s.resolving) (s.resolving.damagedThisWay ??= []).push(e.to.object);
    if (e.dealt > 0 && "player" in e.to && s.resolving && !(s.resolving.playersDamagedThisWay ??= []).includes(e.to.player)) s.resolving.playersDamagedThisWay.push(e.to.player);
  }
  if (s.resolving) s.resolving.damageThisWay = (s.resolving.damageThisWay ?? 0) + dealt;
  if (s.resolving && dealt > 0) s.resolving.damageCappedThisWay = (s.resolving.damageCappedThisWay ?? 0) + [...dealtTo].reduce((n, [key, d]) => n + Math.min(d.n, caps.get(key) ?? ("object" in d.to && s.objects[d.to.object] ? capOf(d.to, d.n) : 0)), 0);
  if (s.resolving) for (const [id, n] of toObject) noteExcess(s, id, excessOver(lethal.get(id) ?? [], n), creatures.has(id));
  return dealt;
}

/** "The excess damage dealt this way" (CR 120.10): in all, to `id`, and to creatures. */
function noteExcess(s: GameState, id: ObjectId, excess: number, creature: boolean) {
  const r = s.resolving;
  if (!r || !excess) return;
  r.excessDamage = (r.excessDamage ?? 0) + excess;
  (r.excessTo ??= {})[id] = (r.excessTo[id] ?? 0) + excess;
  if (creature) r.excessToCreatures = (r.excessToCreatures ?? 0) + excess;
}
