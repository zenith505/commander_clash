import type { DamageRecipient, Effect, PlayerRef } from "../abilities";
import { putPlayerCounters } from "../counters";
import { abilitiesOf, cardIdOf, defOf, isType, objHasKeyword, objIsType, power, toughness } from "../cards";
import { addPhases, opponents, returnUntilLeaves, canGainLife, canLoseLife, draw, gainLife, giveCitysBlessing, livingPlayers, log, loseLife, millCount, moveObject, obj, player, playerLoses, simultaneousLifeLoss, winGame } from "../game";
import { MONARCH } from "../oracle";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { cardSource, dealDamage, dealDamageBatch, dealPlanned, excessOver, lethalAmounts, objectSource, planDamage, type DamageEvent, type DamageSource } from "../damage";
import { COLORS, type GameObject, type GameState, type ManaOrigin, type ManaType, type ObjectId, type PlayerId, type RedirectShield } from "../types";
import { addMana, manaOriginsOf } from "../spend";
import { tapManaTimes, timesAsMuch } from "../manaabilities";
import { ResolveCtx, apnap, objects, players, amountNow, runEffectInner, damageRecipients, ctxSource } from "./resolve";
import { fireEvent } from "./triggers";
import { bindChosen, objectMatches } from "./targeting";
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
  return out;
}

export function runBasicsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "skip": {
      const words = { untap: "untap step", draw: "draw step", combat: "combat phase", turn: "turn" }[e.skip];
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (e.wholeTurn) {
          (p.skips ??= []).push({ what: e.skip, wholeTurn: true });
          log(s, `${p.name} will skip all combat phases of their next turn.`);
          continue;
        }
        for (let i = 0; i < e.n; i++) (p.skips ??= []).push({ what: e.skip, ...(e.thisTurn ? { turn: s.turn } : {}) });
        log(s, `${p.name} will skip their next ${e.n > 1 ? `${e.n} ${words}s` : words}${e.thisTurn ? " this turn" : ""}.`);
      }
      return;
    }
    case "endTurn":
      if (s.resolving) s.resolving.endTurn = true; // CR 724.1: once it's done resolving (continueResolution)
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
            ...(e.loseAtEnd && card ? { loseAtEnd: { controller: ctx.controller, sourceCardId: cardIdOf(card), subject: { id: card.id, zc: card.zoneChanges ?? 0 } } } : {}),
          });
        }
        log(s, `${player(s, pid).name} will take ${n === 1 ? "an extra turn" : `${n} extra turns`} after this one.`);
      }
      return;
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
      if (s.step === "upkeep") s.extraUpkeeps = (s.extraUpkeeps ?? 0) + 1;
      return;
    case "addEndStep":
      if (s.step === "end" && (s.turnLog?.endSteps ?? 0) === 1) s.extraEndSteps = (s.extraEndSteps ?? 0) + 1;
      return;
    case "addPhases": {
      // "At the beginning of that combat, ...": a delayed trigger for this added combat phase only (CR 603.7; rulings on
      // Moraug: not the turn's regular combat).
      const key = e.thatCombat || e.onlyAttack || e.thoseAttack ? (s.combatKeys = (s.combatKeys ?? 0) + 1) : undefined;
      const item = s.resolving?.item;
      const me = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const added = addPhases(s, e.phases, e.after, key);
      if (added && e.onlyAttack && key !== undefined) (s.combatAttackOnly ??= {})[key] = e.onlyAttack;
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
            ? ((r) => r.pids.map((pid) => ({ objs: [], pids: [pid], n: amountNow(s, e.amount, { ...ctx, eachOne: pid }) })))(damageRecipients(s, to, ctx))
            : [{ ...damageRecipients(s, to, ctx), n: amount }];
      const all = [e.to, ...(e.also ?? [])].flatMap(parts);
      const host = e.by === "attached" ? objects(s, { ref: "attached" }, ctx)[0] : undefined;
      const made = e.by === "created" ? objects(s, { ref: "created" }, ctx) : [];
      const by = e.by === "subject" ? subjectSource(s, ctx) : e.by === "castSpell" ? castSpellSource(s, ctx) : e.by === "created" ? (made.length === 1 && made[0]!.zone === "battlefield" ? objectSource(s, made[0]!) : undefined) : e.by === "attached" ? (host?.zone === "battlefield" ? objectSource(s, host) : undefined) : e.by ? targetSource(s, ctx, e.by.target) : ctxSource(s, ctx);
      if (!by) return;
      const from = { ...by, ...(e.unpreventable || (e.unpreventableX !== undefined && (ctx.x ?? 0) >= e.unpreventableX) ? { unpreventable: "all" as const } : {}) };
      // All dealt at once: lifelink is one life-gain event (CR 119.10).
      const lifelink = { n: 0 };
      let events: DamageEvent[] = [
        ...all.flatMap((x) => x.objs.map((o): DamageEvent => ({ src: from, to: { object: o.id }, n: x.n }))),
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
          return excess ? [{ ...ev, n: ev.n - excess }, { src: from, to: { player: controllerOf(s, o) }, n: excess }] : [ev];
        });
      const dealt = dealtWithExcess(s, from, events, (evs) => dealDamageBatch(s, evs, { lifelink }));
      gainLife(s, from.controller, lifelink.n);
      if (dealt && from.id) fireEvent(s, { type: "dealtDamage", id: from.id, amount: dealt, combat: false });
      return;
    }
    case "eachDealsDamage": {
      // Each permanent deals its own damage, all at the same time (CR 120.3); lifelink is one life gain per player (CR 119.10).
      const n = amountNow(s, e.amount, ctx);
      const victim = e.to ? objects(s, e.to, ctx).find((o) => o.zone === "battlefield") : undefined;
      if (e.to && !victim) return;
      const events: DamageEvent[] = objects(s, e.what, ctx)
        .filter((o) => o.zone === "battlefield")
        .map((o) => ({ src: objectSource(s, o), to: victim ? { object: victim.id } : { player: controllerOf(s, o) }, n }));
      const gains = new Map<PlayerId, { n: number }>();
      const dealt = dealPlanned(s, planDamage(s, events), { lifelink: (ev) => gains.get(ev.src.controller) ?? gains.set(ev.src.controller, { n: 0 }).get(ev.src.controller)! });
      for (const [pid, g] of gains) gainLife(s, pid, g.n);
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
    case "cantCast":
      for (const pid of players(s, e.who, ctx)) {
        (s.cantCastThisTurn ??= []).push({ player: pid, turn: s.turn, ...(e.filter ? { filter: e.filter } : {}), source: src, ...(e.untilYourNextTurnEnds ? { untilEndOfTurnOf: ctx.controller } : {}), ...(e.untilYourNextTurn ? { untilTurnOf: ctx.controller } : {}), ...(e.duringTheirNextTurn ? { untilEndOfTurnOf: pid, duringTheirNextTurn: true as const } : {}) });
        log(s, `${player(s, pid).name} can't cast ${e.filter ? `${e.filter.text.replace(/ spell$/, "")} ` : ""}spells ${e.duringTheirNextTurn ? "during their next turn" : e.untilYourNextTurnEnds ? `until the end of ${player(s, ctx.controller).name}'s next turn` : e.untilYourNextTurn ? `until ${player(s, ctx.controller).name}'s next turn` : "this turn"}.`);
      }
      return;
    case "cantPlayLands":
      for (const pid of players(s, e.who, ctx)) {
        (s.cantPlayLandsThisTurn ??= []).push({ player: pid, turn: s.turn, source: src });
        log(s, `${player(s, pid).name} can't play lands this turn.`);
      }
      return;
    case "turnRules":
      if (e.everyone) {
        for (const pid of livingPlayers(s)) for (const rule of e.rules) (s.turnRules ??= []).push({ turn: s.turn, player: pid, rule });
        log(s, `Players${e.rules.map((r) => (r === "cantLoseLife" ? " can't lose life" : r === "cantLoseGame" ? " can't lose the game" : r === "cantWinGame" ? " can't win the game" : "")).join(",")} this turn.`);
        return;
      }
      for (const rule of e.rules) (s.turnRules ??= []).push({ turn: s.turn, player: ctx.controller, rule, ...(e.byColors ? { byColors: e.byColors } : {}) });
      if (e.rules[0] === "seeHexproof") {
        log(s, `${player(s, ctx.controller).name}'s spells and abilities can target their opponents and their creatures as though they didn't have hexproof this turn.`);
        return;
      }
      if (e.rules[0] === "extraLoyalty") {
        log(s, `${player(s, ctx.controller).name} may activate a loyalty ability of each planeswalker they control once more this turn.`);
        return;
      }
      log(s, `${player(s, ctx.controller).name}${e.rules.map((r) => (r === "cantLoseLife" ? " can't lose life" : r === "cantLoseGame" ? " can't lose the game" : r === "flash" ? " may cast spells as though they had flash" : r === "spellsUncounterable" ? `'s spells can't be countered${e.byColors ? ` by ${e.byColors.map((c) => COLOR_NAMES[c].toLowerCase()).join(" or ")} spells` : ""}` : r === "creatureSpellsUncounterable" ? "'s creature spells can't be countered" : "'s opponents can't win the game")).join(",")} this turn.`);
      return;
    case "flashUntilNextTurn":
      (s.flashUntil ??= []).push({ controller: ctx.controller, filter: e.filter, ...(e.thisTurn ? { turn: s.turn } : {}) });
      log(s, `${player(s, ctx.controller).name} may cast ${e.filter.text} as though they had flash until their next turn.`);
      return;
    case "opponentsHandOnlyUntilNextTurn":
      (s.handOnlyUntil ??= []).push({ controller: ctx.controller, source: src });
      log(s, `${src}: until ${player(s, ctx.controller).name}'s next turn, their opponents can't cast spells from anywhere other than their hands.`);
      return;
    case "graveyardTurn": {
      const list = (s.graveyardTurn = (s.graveyardTurn ?? []).filter((g) => g.turn === s.turn));
      list.push({ player: ctx.controller, turn: s.turn, ...(e.cast ? { cast: e.cast } : {}), ...(e.lands ? { lands: true as const } : {}), ...(e.exileInstead ? { exileInstead: true as const } : {}), ...(e.anyGraveyard ? { anyGraveyard: true as const } : {}), ...(e.exileCast ? { exileCast: true as const } : {}), source: src });
      const may = [e.lands ? "play lands" : "", e.cast ? `cast ${e.cast.text.replace(/ cards?$/, "")} spells` : ""].filter(Boolean).join(" and ");
      if (may) log(s, `${player(s, ctx.controller).name} may ${may} from ${e.anyGraveyard ? "any graveyard" : "their graveyard"} this turn (${src}).`);
      if (e.exileInstead) log(s, `${src}: cards that would be put into ${player(s, ctx.controller).name}'s graveyard this turn are exiled instead.`);
      return;
    }
    case "topTurn": {
      const list = (s.topTurn = (s.topTurn ?? []).filter((g) => g.turn === s.turn));
      list.push({ player: ctx.controller, turn: s.turn, top: e.top, source: src });
      log(s, `${player(s, ctx.controller).name} may look at the top card of their library any time and play cards from the top of their library this turn${e.top.payLife ? ", paying life rather than mana costs for spells" : ""} (${src}).`);
      return;
    }
    case "graveyardCastThisTurn": {
      // Locke: the cards milled, as they are now (CR 400.7).
      const cards = e.milled ? [...(s.resolving?.milled ?? [])] : undefined;
      if (cards && !cards.length) return;
      (s.graveGrants ??= []).push({ key: `grant${s.nextId++}`, player: ctx.controller, turn: s.turn, filter: e.filter, source: src, ...(e.rider ? { rider: e.rider } : {}), ...(cards ? { cards } : {}) });
      if (cards) log(s, `${player(s, ctx.controller).name} may cast a spell from among ${cards.map((c) => defOf(s, obj(s, c.id)).name).join(", ")} this turn (${src}).`);
      else log(s, `${player(s, ctx.controller).name} may cast a ${e.filter.text.replace(/ card$/, "")} spell from their graveyard this turn (${src}).`);
      return;
    }
    case "noLifeGain":
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
      if (e.choose) {
        const chosen = chooseDamageSource(s, ctx, e.choose, src);
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
      while (queue.length) {
        const pid = queue.shift()!;
        s.resolving!.drawing = true;
        const n = amountNow(s, e.n, { ...ctx, eachOne: pid });
        s.resolving!.drawing = undefined;
        log(s, `${player(s, pid).name} draws ${n} card${n === 1 ? "" : "s"}.`);
        if (!draw(s, pid, n)) return "paused";
      }
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
    case "loseAllCounters":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (!p.poison && !p.energy && !p.experience && !p.rad) continue;
        p.poison = 0;
        p.energy = 0;
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
      for (const pid of players(s, e.who, ctx)) {
        createEmblem(s, pid, e.abilities, from);
        log(s, `${player(s, pid).name} gets an emblem with ${e.abilities.map((a) => `"${a.replace(/~/g, "this emblem")}"`).join(" and ")}.`);
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
          const added = e.mana ? e.mana.repeat(e.times === undefined ? 1 : amountNow(s, e.times, ctx)) : color && e.chosen ? `{${color}}`.repeat(e.chosen) : "";
          const from = manaSourceOrigins(s, ctx);
          for (const m of added.matchAll(/\{([WUBRGC])\}/g)) addMana(s, pid, [m[1] as ManaType], { from, ...(e.only ? { only: e.only } : {}), ...(e.keep ? { keep: "turn" as const } : {}) });
          if (added) log(s, `${player(s, pid).name} adds ${added}.`);
        }
        return;
      }
      const p = player(s, ctx.controller);
      const color = s.resolving?.chosen?.color;
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
        const added = s.resolving?.item.manaAbility?.tapped ? timesAsMuch(made, tapManaTimes(s, ctx.controller, ctx.sourceId ? s.objects[ctx.sourceId] : undefined)) : made;
        for (const m of added) addMana(s, p.id, [m], { from: manaSourceOrigins(s, ctx) });
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
          s.pending = { kind: "manaMix", player: ctx.controller, source: src, n };
          return "paused";
        }
        const mix = sc.manaMix;
        delete sc.manaMix;
        const from = manaSourceOrigins(s, ctx);
        const mixed = COLORS.flatMap((c) => Array<ManaType>(mix[c] ?? 0).fill(c));
        const colors = s.resolving?.item.manaAbility?.tapped ? timesAsMuch(mixed, tapManaTimes(s, ctx.controller, ctx.sourceId ? s.objects[ctx.sourceId] : undefined)) : mixed;
        for (const c of colors) addMana(s, p.id, [c], { from, ...(e.only ? { only: e.only } : {}), ...(e.keep ? { keep: "turn" as const } : {}) });
        if (colors.length) log(s, `${p.name} adds ${colors.map((c) => `{${c}}`).join("")}.`);
        return;
      }
      let added = e.mana ? e.mana.repeat(e.times === undefined ? 1 : amountNow(s, e.times, ctx)) : color && e.chosen ? `{${color}}`.repeat(e.chosen * (e.times === undefined ? 1 : amountNow(s, e.times, ctx))) : "";
      // Carpet of Flowers: "if you haven't added mana with this ability this turn".
      const marked = e.markSource && added && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (marked) (marked.triggeredThisTurn ??= []).push(`${ctx.sourceZc ?? marked.zoneChanges ?? 0}|addedMana`);
      // An activated mana ability with {T} in its cost taps its source for mana (CR 106.12): Mana Reflection's
      // replacement effect multiplies what it produces (106.12b).
      if (s.resolving?.item.manaAbility?.tapped) added = timesAsMuch([...added.matchAll(/\{([WUBRGC])\}/g)].map((m) => m[1] as ManaType), tapManaTimes(s, ctx.controller, ctx.sourceId ? s.objects[ctx.sourceId] : undefined)).map((m) => `{${m}}`).join("");
      // What the mana's source was (CR 106.3): a mana ability's source as it was activated, else a snow spell, or the
      // ability's source (snow mana, CR 107.4h; mana from a creature).
      const from = s.resolving?.item.manaAbility ? (s.resolving.item.manaAbility.from ?? []) : manaSourceOrigins(s, ctx);
      for (const m of added.matchAll(/\{([WUBRGC])\}/g)) {
        // "Until end of turn, you don't lose this mana as steps and phases end."
        addMana(s, p.id, [m[1] as ManaType], { from, ...(e.only ? { only: e.only } : {}), ...(e.keep ? { keep: "turn" as const } : {}) });
        if (s.resolving?.item.manaAbility) (s.resolving.made ??= []).push(m[1] as ManaType);
      }
      if (added) log(s, `${p.name} adds ${added}.`);
      return;
    }
    case "manaTriggerThisTurn":
      (s.manaTriggersThisTurn ??= []).push({ controller: ctx.controller, source: src, trigger: e.trigger });
      log(s, `Until end of turn, ${e.trigger.text.replace(/^W/, "w").replace(/\.$/, "")}.`);
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
      (s.cantAttackThisTurn ??= []).push({ filter: of !== undefined ? { ...e.filter, controlledBy: of } : e.filter, controller: ctx.controller, ...(except ? { except } : {}) });
      log(s, of !== undefined ? `Creatures ${player(s, of).name} controls can't attack this turn.` : `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1)} can't attack this turn.`);
      return;
    }
    case "costModThisTurn": {
      // Maelstrom Muse's X, Mutated Cultist's "for each counter removed this way": counted as it resolves.
      const k = e.times !== undefined ? Math.max(0, amountNow(s, e.times, ctx)) : 1;
      if (e.times !== undefined && !k) return;
      const mod = k === 1 ? e.mod : { ...e.mod, n: e.mod.n * k };
      (s.costModsThisTurn ??= []).push({ player: ctx.controller, mod, ...(e.untilYourNextTurn ? { untilYourNextTurn: true as const } : {}), ...(e.next ? { next: true as const } : {}) });
      log(s, `${player(s, ctx.controller).name}: ${e.mod.text.replace(/ you cast this turn /, " they cast this turn ").replace(/\{X\}/, `{${k}}`)}`);
      return;
    }
    case "cantBlockRule": {
      // Eunuchs' Intrigues: the creatures that player controls now or later this turn, but the one they chose (a rule for
      // the turn, not a change to the creatures there now, CR 611.2c).
      const of = e.ofPlayer ? players(s, e.ofPlayer, ctx)[0] : undefined;
      if (e.ofPlayer && of === undefined) return;
      const chosen = e.exceptChosen ? objects(s, { ref: "created" }, ctx)[0] : undefined;
      // "Of that quality" (Twins of Discord): the choice made as it resolved.
      const filter = bindChosen(of !== undefined ? { ...e.filter, controlledBy: of } : e.filter, ctx.chosen);
      (s.cantBlockThisTurn ??= []).push({ filter, controller: ctx.controller, ...(chosen ? { except: { id: chosen.id, zc: chosen.zoneChanges ?? 0 } } : {}) });
      log(s, `${of !== undefined ? `${chosen ? "Other c" : "C"}reatures ${player(s, of).name} controls` : `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1)}`} can't block this turn.`);
      return;
    }
    case "cantBeBlockedRule":
      (s.cantBeBlockedThisTurn ??= []).push({ filter: e.filter, controller: ctx.controller });
      log(s, `${e.filter.text[0]!.toUpperCase()}${e.filter.text.slice(1)} can't be blocked this turn.`);
      return;
    case "addCombatMana": {
      // Firebending (CR 702.189a): red mana that stays in the pool until end of combat (see advanceStep).
      const n = amountNow(s, e.n, ctx);
      const p = player(s, ctx.controller);
      addMana(s, p.id, Array(n).fill("R"), { from: manaSourceOrigins(s, ctx), keep: "combat" });
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
            const n = power(s, x) * (e.times ?? 1);
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
      const pa = power(s, a);
      const pb = power(s, b);
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
  s.cards[MONARCH.oracleId] ??= MONARCH;
  s.monarch = pid;
  invalidateCharacteristics(s); // "as long as you're the monarch"
  log(s, `${p.name} becomes the monarch.`);
  fireEvent(s, { type: "becameMonarch", player: pid });
  // Palace Jailer: what it exiled returns as one of its controller's opponents becomes the monarch (CR 610.3).
  const due = (s.exiledUntilMonarch ?? []).filter((x) => x.controller !== pid && opponents(s, x.controller).includes(pid));
  if (!due.length) return;
  s.exiledUntilMonarch = s.exiledUntilMonarch!.filter((x) => !due.includes(x));
  if (!s.exiledUntilMonarch.length) s.exiledUntilMonarch = undefined;
  for (const x of due) returnUntilLeaves(s, x.cards, x.source, `${p.name} became the monarch`);
}

/**
 * The trigger's creature as a damage source ("it deals that much damage", Kediss): as it is on the battlefield, or as
 * it last existed there once it has left (CR 608.2h), with the lifelink or deathtouch it had then (rulings on Warstorm
 * Surge, Fiendlash).
 */
/** A target permanent that deals the damage itself, while it's still a legal target (CR 608.2b). */
function targetSource(s: GameState, ctx: ResolveCtx, index: number): DamageSource | undefined {
  const o = ctx.legal[index] ? objects(s, { ref: "target", index }, ctx)[0] : undefined;
  return o?.zone === "battlefield" ? objectSource(s, o) : undefined;
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
  return { ...cardSource(d, item.controller, { object: o.id, zc: o.zone === "stack" ? (o.zoneChanges ?? 0) : (s.lastKnown?.[o.id]?.zc ?? o.zoneChanges ?? 0) }), spell: true, colors: item.castColors ?? d.colors, ...(item.castMv !== undefined ? { manaValue: item.castMv } : {}) };
}

function subjectSource(s: GameState, ctx: ResolveCtx): DamageSource | undefined {
  const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
  if (!o) return undefined;
  if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc) return objectSource(s, o);
  // A "dies" trigger's subject is the card in the graveyard, one zone change after the creature (see subjectEvenIfGone).
  const lk = s.lastKnown?.[o.id];
  if (!lk || (lk.zc !== ctx.subject!.zc && lk.zc !== ctx.subject!.zc - 1)) return undefined;
  const ref = { object: o.id, zc: lk.zc };
  return lk.source ? { ...lk.source, controller: lk.controller, ref } : cardSource((lk.copyKey && s.cards[lk.copyKey]) || defOf(s, o), lk.controller, ref);
}

/**
 * Deal damage events at once with `deal`, noting for "this way" what was damaged and the excess damage dealt to
 * permanents: beyond what was lethal for each just before (CR 120.10). Returns the damage dealt.
 */
function dealtWithExcess(s: GameState, from: DamageSource, events: DamageEvent[], deal: (events: DamageEvent[]) => (DamageEvent & { dealt: number })[]): number {
  const lethal = new Map(events.flatMap((ev) => ("object" in ev.to ? [[ev.to.object, lethalAmounts(s, ev.src ?? from, obj(s, ev.to.object))] as const] : [])));
  const creatures = new Set(events.flatMap((ev) => ("object" in ev.to && objIsType(s, obj(s, ev.to.object), "Creature") ? [ev.to.object] : [])));
  const toObject = new Map<ObjectId, number>();
  let dealt = 0;
  for (const e of deal(events)) {
    dealt += e.dealt;
    if (e.dealt > 0 && "object" in e.to) toObject.set(e.to.object, (toObject.get(e.to.object) ?? 0) + e.dealt);
    if (e.dealt > 0 && "object" in e.to && s.resolving) (s.resolving.damagedThisWay ??= []).push(e.to.object);
    if (e.dealt > 0 && "player" in e.to && s.resolving && !(s.resolving.playersDamagedThisWay ??= []).includes(e.to.player)) s.resolving.playersDamagedThisWay.push(e.to.player);
  }
  if (s.resolving) s.resolving.damageThisWay = (s.resolving.damageThisWay ?? 0) + dealt;
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
