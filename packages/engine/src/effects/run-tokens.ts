import type { Effect, ObjRef, TokenSpec } from "../abilities";
import { defOf, isPermanentCard, isType, objIsType, power, toughness } from "../cards";
import { auraHostKey, auraHostLabels, auraHostName, auraHostOf, auraHostOptions, type AuraHost, enterTogether, fireOnceEntered, livingPlayers, log, moveObject, nameOf, newObject, obj, opponents, player } from "../game";
import { tokenBatch, type TokenBatch } from "../counters";
import { copiableDef, copyEnterCounters, tokenCopyKey, type CopyExcept } from "../copies";
import type { CardDef, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { ResolveCtx, apnap, objects, players, amountNow } from "./resolve";
import { inCombat, attackDefault, fireEvent } from "./triggers";
import { attackChoices } from "./run-zones";
import { copiedValues } from "./run-copies";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { objectMatches } from "./targeting";
import { defMv } from "../faces";
import { compileCard, QUOTED_SOURCE_NAME } from "../oracle";
import { manaValue, parseManaCost } from "../mana";

/**
 * Create `n` tokens that are copies of `base` for this player (CR 707.2), doubled by token doublers (CR 614.1a). They
 * enter at the same time (CR 608.2f), so each sees the others enter and none counts another as it enters (603.6a, 614.12).
 */
/** How many token copies of `base` one copy becomes for `pid` (token doublers, CR 614.1a), the first batch. */
export function tokenCopyBatch(s: GameState, pid: PlayerId, base: CardDef): number {
  return tokenBatch(s, pid, s.cards[tokenCopyKey(s, base).key]!, 1, true).same;
}

export function tokenCopies(s: GameState, pid0: PlayerId, base: CardDef, n: number, ctx: ResolveCtx, opts: { except?: CopyExcept; tapped?: boolean; attacking?: boolean; defender?: PlayerId; /** What each of the first ones attacks, as chosen (attackChoices). */ attackAt?: { player: PlayerId; planeswalker?: ObjectId }[]; /** An Aura copy: what it enchants as it enters (auraCopyHost), none if nothing it could. */ auraHost?: AuraHost | null; embalmed?: true; /** Mirror Match: "that's blocking that creature": each one a creature enters blocking it (createToken's `blocking`). */ blocking?: GameObject } = {}) {
  // A copy of a double-faced object is a double-faced token, with the same face up (CR 707.8a).
  const { key, face } = tokenCopyKey(s, base, opts.except);
  // Crafty Cutpurse: maybe another player creates them (tokenBatch's pid, CR 616.1b).
  const { pid, same: k, extra } = tokenBatch(s, pid0, s.cards[key]!, n);
  const defender = opts.defender ?? (opts.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined);
  let made = 0;
  enterTogether(s, () => {
    for (let i = 0; i < k; i++) {
      const o = newObject(s, s.cards[key]!, pid, "exile");
      o.isToken = true;
      if (opts.embalmed) o.embalmed = true;
      // An Aura token enters attached to what its controller chose (CR 303.4f); with nothing it could enchant, it isn't
      // created at all (CR 303.4g, rulings on Roles).
      const host = opts.auraHost !== undefined ? (opts.auraHost && auraHostOptions(s, o, pid).some((h) => auraHostKey(h) === auraHostKey(opts.auraHost!)) ? opts.auraHost : null) : undefined;
      if (host === null) {
        delete s.objects[o.id];
        continue;
      }
      // "Except it enters with an additional +1/+1 counter on it" (Littjara Mirrorlake).
      const counters = copyEnterCounters(opts.except, (type) => isType(s.cards[key]!, type));
      moveObject(s, o.id, "battlefield", { ...(opts.tapped || opts.attacking ? { tapped: true } : {}), ...(face !== undefined ? { face } : {}), ...(Object.keys(counters).length ? { counters } : {}), ...(host ?? {}) });
      // Worms of the Earth (round B258): a copy of a land that can't enter isn't created (CR 111.5).
      if (!s.objects[o.id]) continue;
      made++;
      const at = opts.attackAt?.[i];
      // A noncreature one enters, but not attacking (CR 506.3a).
      if (defender !== undefined && o.zone === "battlefield" && objIsType(s, o, "Creature") && attackingPlayer(s, pid, at?.player ?? defender)) o.attacking = at?.player ?? defender;
      const pw = at?.planeswalker !== undefined ? s.objects[at.planeswalker] : undefined;
      if (pw && o.attacking !== undefined && pw.zone === "battlefield") o.attackingPermanent = { id: pw.id, zc: pw.zoneChanges ?? 0 };
      // Mirror Match: entering blocking that attacker, never declared as a blocker (rulings); a noncreature one isn't
      // blocking (rulings), and an attacker no longer attacking can't be blocked.
      const foe = opts.blocking;
      if (foe && o.zone === "battlefield" && objIsType(s, o, "Creature") && foe.zone === "battlefield" && foe.attacking !== undefined && defendingAgainst(s, pid, foe)) {
        o.blocking = [foe.id];
        (foe.blockedBy ??= []).push(o.id);
        foe.becameBlockedTurn = s.turn;
      }
      s.resolving?.created?.push(o.id);
      noteCreated(s, pid, o);
    }
    createExtraTokens(s, pid, extra, { tapped: opts.tapped || opts.attacking, attacking: defender, ...(opts.blocking ? { blocking: opts.blocking } : {}) }, opts.attackAt?.slice(k));
  });
  if (made) log(s, `${player(s, pid).name} creates ${made === 1 ? "a token that's a copy" : `${made} tokens that are copies`} of ${base.name}${opts.auraHost ? ` attached to ${auraHostName(s, opts.auraHost)}` : ""}.`);
  else if (k) log(s, `${player(s, pid).name} can't create a token copy of ${base.name}: there's nothing it could enchant.`);
}

/**
 * A token copy of an Aura (Yenna, Redtooth Regent): its controller chooses what it enchants as it enters (CR 303.4f),
 * among what it could enchant, asked once for the copies made now (token doublers' extra ones go with it). `asked` is
 * the scratch key for the answer: the copied Aura's id. Undefined when it isn't an Aura, null when there's nothing it
 * could enchant, "paused" while the player chooses.
 */
export function auraCopyHost(s: GameState, pid: PlayerId, base: CardDef, except: CopyExcept | undefined, asked: ObjectId, src: string): AuraHost | null | undefined | "paused" {
  const { key } = tokenCopyKey(s, base, except);
  const d = s.cards[key]!;
  if (!d.subtypes.includes("Aura") || !compileCard(d).enchant) return undefined;
  const sc = (s.resolving!.scratch ??= {});
  const hosts = (sc.auraHosts ??= {});
  if (hosts[asked] === undefined) {
    const probe = newObject(s, d, pid, "exile");
    const options = auraHostOptions(s, probe, pid);
    delete s.objects[probe.id];
    if (!options.length) return null;
    if (options.length > 1) {
      sc.auraAsking = asked;
      s.pending = { kind: "chooseOption", player: pid, source: src, what: "enchant", options: options.map(auraHostKey), labels: auraHostLabels(s, options), prompt: `choose what the token copy of ${base.name} enchants` };
      return "paused";
    }
    hosts[asked] = auraHostKey(options[0]!);
  }
  const host = auraHostOf(hosts[asked]!);
  delete hosts[asked];
  return host;
}

/** The power and toughness of the object a token copy copies: now, or as it last existed on the battlefield. */
function copiedPT(s: GameState, ref: ObjRef, ctx: ResolveCtx): [number, number] | undefined {
  if (ref.ref !== "target") return undefined;
  const t = ctx.targets[ref.index];
  const o = t?.kind === "object" ? s.objects[t.id] : undefined;
  if (!o || t?.kind !== "object") return undefined;
  if (o.zone === "battlefield" && (t.zc === undefined || (o.zoneChanges ?? 0) === t.zc)) return [power(s, o), toughness(s, o)];
  const lk = s.lastKnown?.[t.id];
  return lk && (t.zc === undefined || lk.zc === t.zc) ? [lk.power, lk.toughness] : undefined;
}

/** Creating tokens and token copies, myriad. */
export function runTokensEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "myriad": {
      // Each choice first; then the tokens all enter at once (myriad rulings).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const defending = ctx.event?.player;
      if (!sc.queue) {
        sc.queue = apnap(s, opponents(s, ctx.controller).filter((p) => p !== defending));
        sc.chosen = {};
      }
      const me = objects(s, { ref: "self" }, ctx)[0];
      const base = me ? defOf(s, me) : ctx.sourceDef; // as it last existed if it's gone (CR 707.2, 608.2h)
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        if (sc.may === undefined && e.must) sc.may = true;
        if (sc.may === undefined) {
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `create a token copy of ${base.name} attacking ${player(s, pid).name}`, source: src };
          return "paused";
        }
        if (sc.may) sc.chosen![pid] = [];
        sc.may = undefined;
        sc.queue.shift();
      }
      r.created = [];
      if (!inCombat(s)) return;
      enterTogether(s, () => {
        for (const pid of Object.keys(sc.chosen!).map(Number) as PlayerId[])
          if (livingPlayers(s).includes(pid)) tokenCopies(s, ctx.controller, base, 1, ctx, { tapped: true, defender: pid, ...(e.except ? { except: e.except } : {}) });
      });
      return;
    }
    case "encore": {
      // CR 702.141a: one token copy of the card for each opponent (left players aren't counted, rulings), each
      // attacking that opponent this turn if able; they gain haste (an effect, not a copy exception).
      const base = ctx.sourceDef;
      const r = s.resolving;
      if (r) r.created = [];
      const made: string[] = [];
      // All the tokens at once (CR 608.2f), with their effects before anything they trigger.
      enterTogether(s, () => {
        for (const opp of apnap(s, opponents(s, ctx.controller))) {
          const before = r?.created?.length ?? 0;
          tokenCopies(s, ctx.controller, base, 1, ctx);
          const ids = (r?.created ?? []).slice(before);
          made.push(...ids);
          if (ids.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "endOfTurn", affected: ids, mods: [{ kind: "mustAttackPlayer", player: opp }] });
        }
        if (made.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "game", affected: made, mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      });
      invalidateCharacteristics(s);
      return;
    }
    case "copyChosenPerOpponent": {
      // Benthic Anomaly: you choose a creature each opponent controls, in turn order (CR 101.4, 608.2d); none for one who
      // controls none. Then one of those is copied, its power and toughness the totals of all of them as they are now.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.perOpponent) {
        sc.perOpponent = { picked: [] };
        sc.queue = apnap(s, opponents(s, ctx.controller));
        sc.chosen = {};
      }
      const st = sc.perOpponent;
      // An answer to the last question: the creature chosen for the opponent at the head of the queue.
      if (sc.chosen?.[ctx.controller]) {
        st.picked.push(...sc.chosen[ctx.controller]!);
        delete sc.chosen[ctx.controller];
      }
      const creatures = (pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      while (sc.queue?.length) {
        const opp = sc.queue[0]!;
        const options = creatures(opp);
        if (options.length > 1) {
          s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "choose", what: e.filter.text, options, count: 1, of: opp };
          return "paused";
        }
        st.picked.push(...options);
        sc.queue.shift();
      }
      sc.queue = undefined;
      const those = st.picked.filter((id) => s.objects[id]?.zone === "battlefield");
      if (!those.length) {
        log(s, `${src}: no opponent controls a creature, so no token is created.`);
        return;
      }
      if (!st.copyPick) log(s, `${player(s, ctx.controller).name} chooses ${those.map((id) => `${nameOf(s, id)} (${player(s, controllerOf(s, obj(s, id))).name}'s)`).join(", ")}.`);
      let pick = those[0]!;
      if (new Set(those.map((id) => copiableDef(s, obj(s, id)).oracleId)).size > 1) {
        if (!st.copyPick) {
          st.copyPick = true;
          delete sc.found;
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: "one of those creatures to copy", cards: those, min: 1, max: 1, dig: { looked: those, to: "to make a token copy of", rest: "aren't copied" } };
          return "paused";
        }
        pick = those.find((id) => sc.found?.includes(id)) ?? pick;
      }
      const totals = [those.reduce((n, id) => n + power(s, obj(s, id)), 0), those.reduce((n, id) => n + toughness(s, obj(s, id)), 0)] as const;
      const base = copiableDef(s, obj(s, pick));
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => tokenCopies(s, ctx.controller, base, 1, ctx, { except: { ...e.except, pt: [totals[0], totals[1]] } }));
      return;
    }
    case "createTokenCopy": {
      if (e.each) {
        // One copy of each of them (`n` of each, Doppelgang), their copiable values as they are now (CR 707.2), all created at once.
        // Red Sun's Twilight: each one destroyed this way, its copiable values as it last existed on the battlefield.
        const destroyed = e.ofDestroyed ? (s.resolving?.destroyed ?? []).filter((x) => objectMatches(s, e.ofDestroyed!, x.o, ctx.controller, false, undefined, x.ch)) : undefined;
        const objs = destroyed ? [] : objects(s, e.what, ctx);
        const bases = destroyed ? destroyed.flatMap((x) => { const lk = s.lastKnown?.[x.o.id]; const d = lk && lk.zc === (x.o.zoneChanges ?? 0) && lk.copyKey ? s.cards[lk.copyKey] : undefined; return d ? [d] : []; }) : objs.map((o) => copiableDef(s, o));
        const n = amountNow(s, e.n, ctx);
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          // Parallel Evolution: each one's controller creates its copy (CR 111.2).
          if (e.eachController) objs.forEach((o, i) => tokenCopies(s, controllerOf(s, o), bases[i]!, n, ctx, e));
          else for (const pid of players(s, e.who, ctx)) for (const base of bases) tokenCopies(s, pid, base, n, ctx, e);
        });
        return;
      }
      // The copiable values of what it copies as it is now, or as it last existed (CR 707.2, 608.2h): a card in
      // a graveyard is copied as that card; "a copy of it" for a creature that has left is of it as it last was
      // (offspring and squad rulings).
      // Ochre Jelly: the copiable values the delayed trigger remembered (createTokenCopy.lkiCopy).
      let base = e.copyKey ? s.cards[e.copyKey] : e.ofSource ? ctx.sourceDef : e.what.ref === "linkedCard" ? undefined : copiedValues(s, e.what, ctx);
      if (e.what.ref === "linkedCard") {
        // "A copy of a card exiled with ~" (Mimic Vat): the cards exiled with it as this resolves; its controller picks one
        // if there are several (a melded pair, rulings). A nonpermanent card can't be a token, so none is made (rulings).
        const sc = (s.resolving!.scratch ??= {});
        const cards = objects(s, e.what, ctx).filter((c) => isPermanentCard(defOf(s, c)));
        let pick = cards[0];
        if (cards.length > 1) {
          if (!sc.linkedCopyPick) {
            sc.linkedCopyPick = true;
            delete sc.found;
            const ids = cards.map((c) => c.id);
            s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `a card exiled with ${src} to copy`, cards: ids, min: 1, max: 1, dig: { looked: ids, to: "to make a token copy of", rest: "stay exiled" } };
            return "paused";
          }
          sc.linkedCopyPick = undefined;
          pick = cards.find((c) => sc.found?.includes(c.id)) ?? cards[0];
        }
        if (!pick) {
          log(s, `No permanent card is exiled with ${src}, so no token is created.`);
          return;
        }
        base = copiableDef(s, pick);
      }
      if (!base) return;
      // "For each opponent, ... attacking that opponent" (Mardu Siegebreaker): one group for each of them, all created at
      // once, attacking that opponent if it's this player's combat (CR 508.4), tapped either way.
      if (e.attackingEach) {
        const n = amountNow(s, e.n, ctx);
        const fight = inCombat(s) && s.activePlayer === ctx.controller;
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          for (const opp of apnap(s, opponents(s, ctx.controller))) tokenCopies(s, ctx.controller, base, n, ctx, { tapped: true, ...(fight ? { defender: opp } : {}) });
        });
        return;
      }
      if (e.except?.halfPT) {
        // Half its power and toughness as it last existed on the battlefield (Saw in Half rulings, CR 608.2h).
        const it = copiedPT(s, e.what, ctx);
        if (!it) return;
        const half = (n: number) => (e.except!.halfPT === "up" ? Math.ceil(n / 2) : Math.floor(n / 2));
        const { halfPT: _, ...rest } = e.except;
        const n = amountNow(s, e.n, ctx);
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          for (const pid of players(s, e.who, ctx)) tokenCopies(s, pid, base, n, ctx, { ...e, except: { ...rest, pt: [half(it[0]), half(it[1])] } });
        });
        return;
      }
      const n = amountNow(s, e.n, ctx);
      // "Tapped and attacking": its controller declares what each one attacks as it's created (CR 508.4; rulings on
      // Delina, Wild Mage: not necessarily what the source attacks). Asked for each before they're all created.
      const who = players(s, e.who, ctx);
      const choices = e.attacking && !e.attackingEvent && who.length === 1 ? attackChoices(s, who[0]!, ctx.sourceId) : [];
      const sc = (s.resolving!.scratch ??= {});
      const picks: string[] = [];
      if (choices.length > 1) {
        picks.push(...(sc.attackPicks ??= []));
        if (sc.attackWhom !== undefined) {
          takeAttackWhom(sc, picks, n);
          sc.attackPicks = [...picks];
        }
        if (picks.length < n) {
          const which = n > 1 ? ` (${picks.length + 1} of ${n})` : "";
          s.pending = { kind: "chooseOption", player: who[0]!, source: src, what: "attackWhom", ...attackWhomOptions(choices, n - picks.length), prompt: `choose what the token copy of ${base.name} attacks${which}` };
          return "paused";
        }
        sc.attackPicks = undefined;
      }
      const attackAt = picks.flatMap((k) => choices.filter((a) => a.key === k));
      // A copy of an Aura: what it enchants (one player creating it; asked about the copied Aura).
      const copied = e.what.ref === "target" ? objects(s, e.what, ctx)[0] : undefined;
      const auraHost = who.length === 1 && copied ? auraCopyHost(s, who[0]!, base, e.except, copied.id, src) : undefined;
      if (auraHost === "paused") return "paused";
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const pid of who) tokenCopies(s, pid, base, n, ctx, { ...e, ...(attackAt.length ? { attackAt } : {}), ...(auraHost !== undefined ? { auraHost } : {}), ...(e.attackingEvent ? { attacking: false, tapped: true, defender: eventDefender(s, ctx, pid) } : {}) });
      });
      return;
    }
    case "countModThisTurn": {
      // Until end of turn: a replacement effect of the resolved ability, not of its source (CR 611.2a), so it lasts even if
      // the source leaves.
      s.turnCountMods = [...(s.turnCountMods ?? []).filter((x) => x.turn === s.turn), { turn: s.turn, controller: ctx.controller, mod: e.mod, source: ctx.sourceId ?? "" }];
      log(s, `${src}: until end of turn, ${e.mod.what === "tokens" && e.mod.op === "double" ? "twice as many tokens are created" : "a replacement effect applies"}.`);
      return;
    }
    case "linkedExileToken": {
      // Skyclave Apparition: the leaves ability triggered after the source moved, so the object its exile ability belongs
      // to is the one before (CR 400.7, 607.2a). No exiled card, no token (rulings).
      const key = `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`;
      const cards = (s.linkedExile?.[key] ?? []).map((l) => ({ o: s.objects[l.id], zc: l.zc })).filter(({ o, zc }) => o?.zone === "exile" && (o.zoneChanges ?? 0) === zc).map(({ o }) => o!);
      if (!cards.length) return;
      // Each owner creates one token, X the total mana value of all the exiled cards (rulings).
      const x = cards.reduce((sum, c) => sum + defMv(defOf(s, c)), 0);
      const token = { ...e.token, power: x, toughness: x };
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const pid of apnap(s, [...new Set(cards.map((c) => c.owner))]).filter((pid) => !player(s, pid).lost)) {
          const { pid: by, same: k, extra } = tokenBatch(s, pid, token, 1);
          for (let i = 0; i < k; i++) createToken(s, by, token);
          if (k) log(s, `${player(s, by).name} creates ${k === 1 ? "a" : k} ${x}/${x} ${token.name} token${k > 1 ? "s" : ""} (${src}).`);
          createExtraTokens(s, by, extra);
        }
      });
      return;
    }
    case "createToken": {
      const n = amountNow(s, e.n, ctx);
      // "Attacking that player or a planeswalker they control" (Adeline): what each token attacks is chosen first, as
      // they enter (CR 508.4; rulings: "whether each token is attacking that opponent or a planeswalker they control"),
      // one opponent at a time, each of the tokens a doubler makes for them too; then they're all created at once.
      if (e.attackingEach && e.orPlaneswalker && inCombat(s) && s.activePlayer === ctx.controller) {
        const sc = (s.resolving!.scratch ??= {});
        const picks = (sc.attackEach ??= {});
        const k = tokenBatch(s, ctx.controller, e.token, n, true).same;
        for (const opp of apnap(s, opponents(s, ctx.controller))) {
          const options = attackChoices(s, ctx.controller, ctx.sourceId).filter((a) => a.player === opp);
          if (options.length < 2) continue;
          const mine = (picks[opp] ??= []);
          while (mine.length < k) {
            if (sc.attackWhom === undefined) {
              const which = k > 1 ? ` (${mine.length + 1} of ${k})` : "";
              s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", ...attackWhomOptions(options, k - mine.length), prompt: `choose what the ${e.token.name} token for ${player(s, opp).name} attacks${which}` };
              return "paused";
            }
            takeAttackWhom(sc, mine, k);
          }
        }
      }
      // "That's attacking" (Brimaz, Hero of Bladehold): its controller chooses what each one attacks as it's created
      // (CR 508.4; rulings on Brimaz: not necessarily what the source attacks), asked for each before they're all created.
      let attackAt: ReturnType<typeof attackChoices> | undefined;
      if (e.attacking && !e.attackingEach && !e.attackingEvent && !e.attachTo) {
        const who = players(s, e.who, ctx);
        const choices = who.length === 1 ? attackChoices(s, who[0]!, ctx.sourceId) : [];
        if (choices.length > 1) {
          const k = tokenBatch(s, who[0]!, e.token, n, true).same;
          const sc = (s.resolving!.scratch ??= {});
          const picks = [...(sc.attackPicks ?? [])];
          if (sc.attackWhom !== undefined) takeAttackWhom(sc, picks, k);
          sc.attackPicks = picks;
          if (picks.length < k) {
            const which = k > 1 ? ` (${picks.length + 1} of ${k})` : "";
            s.pending = { kind: "chooseOption", player: who[0]!, source: src, what: "attackWhom", ...attackWhomOptions(choices, k - picks.length), prompt: `choose what the ${e.token.name} token attacks${which}` };
            return "paused";
          }
          sc.attackPicks = undefined;
          attackAt = picks.flatMap((key) => choices.filter((a) => a.key === key));
        }
      }
      // "Attached to it": what was just put onto the battlefield, found before this list starts over.
      const hosts = e.attachTo && objects(s, e.attachTo, ctx).map((o) => o.id);
      if (s.resolving) s.resolving.created = [];
      if (hosts) {
        createAttachedTokens(s, e, hosts, n, ctx, src);
        return;
      }
      // Token doublers apply per player (CR 614.1a): "twice that many of those tokens". The tokens enter at the same time,
      // each player's too (CR 608.2f), so they see each other enter (CR 603.6a).
      enterTogether(s, () => createTokensFor(s, e, n, ctx, src, attackAt));
      // Each investigation is one (CR 701.16a), however many Clues a doubler makes of it.
      if (e.investigate) for (const pid of players(s, e.who, ctx)) for (let i = 0; i < n; i++) {
        const done = ((s.turnLog ??= {}).investigated ??= {});
        done[pid] = (done[pid] ?? 0) + 1;
        fireEvent(s, { type: "investigated", player: pid, first: done[pid] === 1 });
      }
      return;
    }
  }
}

/**
 * "Tapped and attacking that player" after "Whenever you attack a player" (CR 508.4): the player the trigger is about, if
 * it's still this player's combat and that player is still in the game; otherwise the token is only tapped.
 */
function eventDefender(s: GameState, ctx: ResolveCtx, pid: PlayerId): PlayerId | undefined {
  const them = ctx.event?.player;
  return them !== undefined && inCombat(s) && s.activePlayer === pid && !player(s, them).lost && opponents(s, pid).includes(them) ? them : undefined;
}

/**
 * Volrath's Laboratory: "a creature token of the chosen color and type", named after the type (rulings: "Bird Token";
 * the " Token" is added as tokens are made),
 * with what was chosen as the source entered, or as it last existed if it's gone (CR 608.2h).
 */
function chosenColorTypeToken(s: GameState, token: TokenSpec, ctx: ResolveCtx): TokenSpec {
  const lk = ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
  const lki = lk && lk.zc === ctx.sourceZc ? lk : undefined;
  const color = ctx.chosen?.color ?? lki?.chosenColor;
  const type = ctx.chosen?.type ?? lki?.chosenType;
  return { ...token, name: type ?? "Creature", colors: color ? [color] : [], subtypes: type ? [type] : [] };
}

/** "Create N ... tokens" for each player it names. */
function createTokensFor(s: GameState, e00: Extract<Effect, { type: "createToken" }>, n: number, ctx: ResolveCtx, src: string, /** What each attacking one attacks, as chosen (attackChoices). */ attackAt?: ReturnType<typeof attackChoices>) {
  const e01 = e00.token.triggersOfExiled ? { ...e00, token: triggersOfExiledToken(s, e00.token) } : e00;
  const e0 = e01.chosenColorType ? { ...e01, token: chosenColorTypeToken(s, e01.token, ctx) } : e01;
  // "An X/X token": X worked out now, once (rulings on Inscription of Insight); the token's printed power and toughness.
  const xx = e0.pt !== undefined ? amountNow(s, e0.pt, ctx) : undefined;
  const t = e0.ptToughness !== undefined ? amountNow(s, e0.ptToughness, ctx) : undefined;
  const e = xx !== undefined ? { ...e0, token: { ...e0.token, power: xx, toughness: t ?? (e0.ptPowerOnly ? e0.token.toughness : xx) } } : e0;
  // Furygale Flocking: one group for each opponent, each token required to attack that opponent this turn (CR 508.1d), the
  // ones a doubler adds too (rulings on Chatterfang: what the effect says about its tokens applies to them).
  if (e.mustAttackEach) {
    const pid = ctx.controller;
    for (const opp of apnap(s, opponents(s, pid))) {
      const before = s.resolving?.created?.length ?? 0;
      const { pid: by, same: k, extra } = tokenBatch(s, pid, e.token, n);
      for (let i = 0; i < k; i++) createToken(s, by, e.token);
      createExtraTokens(s, by, extra);
      const ids = (s.resolving?.created ?? []).slice(before).filter((id) => s.objects[id]?.zone === "battlefield");
      if (k) log(s, `${src} creates ${k === 1 ? "a" : k} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""} that must attack ${player(s, opp).name} this turn.`);
      if (ids.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: pid, sourceName: src, duration: "endOfTurn", affected: ids, mods: [{ kind: "mustAttackPlayer", player: opp }] });
    }
    invalidateCharacteristics(s);
    return;
  }
  // One group for each opponent, attacking that opponent if it's this player's combat (CR 508.4), tapped either way.
  if (e.attackingEach) {
    const pid = ctx.controller;
    const picks = s.resolving?.scratch?.attackEach ?? {};
    for (const opp of apnap(s, opponents(s, pid))) {
      const { pid: by, same: k, extra } = tokenBatch(s, pid, e.token, n);
      const defender = inCombat(s) && s.activePlayer === by && by !== opp ? opp : undefined;
      // The planeswalker chosen for each of this opponent's tokens, if it's still there (Adeline).
      const walkerFor = (i: number) => {
        const pw = defender !== undefined ? /^\d+:(.+)$/.exec(picks[opp]?.[i] ?? "")?.[1] : undefined;
        return pw && s.objects[pw]?.zone === "battlefield" && controllerOf(s, s.objects[pw]!) === opp ? s.objects[pw] : undefined;
      };
      const at: string[] = [];
      for (let i = 0; i < k; i++) {
        const t = createToken(s, by, e.token, { tapped: true, attacking: defender });
        const walker = walkerFor(i);
        if (walker && t?.zone === "battlefield" && t.attacking !== undefined) t.attackingPermanent = { id: walker.id, zc: walker.zoneChanges ?? 0 };
        if (defender !== undefined) at.push(walker ? `${defOf(s, walker).name} (${player(s, defender).name})` : player(s, defender).name);
      }
      const whom = [...new Set(at)].join(" and ");
      if (k) log(s, `${src} creates ${k === 1 ? "a" : k} tapped${defender !== undefined ? " and attacking" : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${defender !== undefined ? ` (attacking ${whom})` : ""}.`);
      createExtraTokens(s, by, extra, { tapped: true, attacking: defender });
    }
    return;
  }
  // "Each player creates a number of ... tokens equal to the amount of mana they paid this way" (Liege of the Hollows):
  // each one's own number (PlayerRef eachOne).
  const each = JSON.stringify(e.n).includes('"eachOne"');
  for (const each0 of players(s, e.who, ctx)) {
    // Crafty Cutpurse: maybe another player creates them (tokenBatch's pid, CR 616.1b); "each one" is still this player.
    const { pid, same: k, extra } = tokenBatch(s, each0, e.token, each ? amountNow(s, e.n, { ...ctx, eachOne: each0 }) : n);
    // "Tapped and attacking" (CR 508.4): put onto the battlefield attacking, never declared as attackers.
    const defender = e.attackingEvent ? eventDefender(s, ctx, pid) : e.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined;
    // Oversimplify: each player's own number of counters (PlayerRef eachOne).
    const counters = e.counters ? { [e.counters.counter]: amountNow(s, e.counters.n, JSON.stringify(e.counters.n).includes('"eachOne"') ? { ...ctx, eachOne: each0 } : ctx) } : undefined;
    const blocking = e.blocking ? objects(s, e.blocking, ctx)[0] : undefined;
    const tapped = e.tapped || (e.attacking && !e.untapped);
    const opts = { tapped, attacking: defender, ...(counters ? { counters } : {}), ...(blocking ? { blocking } : {}) };
    const whom = new Set<string>();
    // Worms of the Earth (round B258): those not created aren't counted in the log.
    let made = 0;
    for (let i = 0; i < k; i++) {
      const at = attackAt?.[i];
      const o = createToken(s, pid, e.token, { ...opts, ...(at ? { attacking: at.player } : {}) });
      if (s.objects[o.id]) made++;
      // A planeswalker or battle chosen for it, if it's still there to be attacked (CR 506.3c).
      const pw = at?.planeswalker !== undefined ? s.objects[at.planeswalker] : undefined;
      if (pw && o.zone === "battlefield" && o.attacking !== undefined && pw.zone === "battlefield") o.attackingPermanent = { id: pw.id, zc: pw.zoneChanges ?? 0 };
      if (o.zone === "battlefield" && o.attacking !== undefined) whom.add(o.attackingPermanent ? `${defOf(s, s.objects[o.attackingPermanent.id]!).name} (${player(s, o.attacking).name})` : player(s, o.attacking).name);
    }
    // Another player's tokens (Gluntch's "choose a third player to create two Treasure tokens"): they create them.
    const maker = pid === ctx.controller ? src : player(s, pid).name;
    if (made) log(s, `${maker} creates ${made === 1 ? "a" : made}${tapped ? " tapped" : ""}${defender !== undefined ? `${tapped ? " and" : ""} attacking` : ""}${blocking && blocking.attacking !== undefined ? ` blocking ${defOf(s, blocking).name}` : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${made > 1 ? "s" : ""}${whom.size && livingPlayers(s).length > 2 ? ` (attacking ${[...whom].join(" and ")})` : ""}${pid === ctx.controller ? "" : ` (${src})`}.`);
    createExtraTokens(s, pid, extra, opts, attackAt?.slice(k));
  }
}

/**
 * Aura tokens created attached to permanents (Roles, CR 303.7): for each one still on the battlefield, the token is put
 * onto the battlefield attached to it. It isn't targeted, so hexproof doesn't matter, but one that couldn't legally
 * enchant it (protection from enchantments, not a creature any more) isn't created at all (rulings on Roles). Token
 * doublers make more, all attached to it; the newest Role stays (704.5z), and those are identical anyway.
 */
function createAttachedTokens(s: GameState, e: Extract<Effect, { type: "createToken" }>, hosts: ObjectId[], n: number, ctx: ResolveCtx, src: string) {
  enterTogether(s, () => attachedTokens(s, e, hosts, n, ctx, src));
  invalidateCharacteristics(s);
}

function attachedTokens(s: GameState, e: Extract<Effect, { type: "createToken" }>, hosts: ObjectId[], n: number, ctx: ResolveCtx, src: string) {
  for (const pid0 of players(s, e.who, ctx))
    for (const host of hosts) {
      if (s.objects[host]?.zone !== "battlefield") continue;
      // Crafty Cutpurse: maybe another player creates them (tokenBatch's pid, CR 616.1b).
      const { pid, same: k, extra } = tokenBatch(s, pid0, e.token, n);
      // The other tokens a replacement adds (Peregrin Took's Food) aren't Auras: they're just created.
      createExtraTokens(s, pid, extra);
      let made = 0;
      for (let i = 0; i < k; i++) {
        const o = newObject(s, tokenDef(e.token), pid, "exile");
        o.isToken = true;
        if (!auraHostOptions(s, o, pid).some((h) => "attachTo" in h && h.attachTo === host)) {
          // Never created: it leaves no trace (CR 111.1).
          delete s.objects[o.id];
          continue;
        }
        moveObject(s, o.id, "battlefield", { attachTo: host });
        if (!s.objects[o.id]) continue; // a land token Worms of the Earth stops (CR 111.5)
        s.resolving?.created?.push(o.id);
        noteCreated(s, pid, o);
        made++;
      }
      if (made) log(s, `${src} creates ${made === 1 ? "a" : made} ${e.token.name} ${e.token.subtypes.includes("Role") ? "Role " : ""}token${made > 1 ? "s" : ""} attached to ${nameOf(s, host)}.`);
      else if (k) log(s, `${src} can't create a ${e.token.name} token attached to ${nameOf(s, host)}.`);
    }
}

/**
 * The Book of Vile Darkness (round 398): "Create Vecna, ... with indestructible and all triggered abilities of the exiled
 * cards": the cards its cost exiled, ~ first, then the others as they were paid for, each still that card in exile (CR
 * 400.7). The rulings: the cards in exile, not the permanents they were (a copy's exiled card is that card); a token
 * exiled isn't a card and is gone (CR 704.5d). Their triggered abilities are part of the token's copiable values (the
 * rulings), so it's made with them (CardDef.borrowedTriggers): an enters ability among them triggers as it's created.
 */
function triggersOfExiledToken(s: GameState, t: TokenSpec): TokenSpec {
  const item = s.resolving?.item;
  const { triggersOfExiled: _, ...rest } = t;
  if (item?.kind !== "ability") return rest;
  const self = item.sourceId ? s.objects[item.sourceId] : undefined;
  const cards = [
    ...(self && self.zone === "exile" && !self.isToken && (self.zoneChanges ?? 0) === (item.sourceZc ?? 0) + 1 ? [self] : []),
    ...(item.costExiled ?? []).flatMap((c) => (s.objects[c.id]?.zone === "exile" && !s.objects[c.id]!.isToken && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc ? [s.objects[c.id]!] : [])),
  ];
  return cards.length ? { ...rest, triggersOf: cards.map((o) => defOf(s, o)) } : rest;
}

export function tokenDef(t: TokenSpec): CardDef {
  return {
    oracleId: `token:${t.manaCost ? `cost${t.manaCost}:` : ""}${t.named ? "named:" : ""}${t.legendary ? "legendary:" : ""}${t.snow ? "snow:" : ""}${t.name}:${t.power ?? ""}/${t.toughness ?? ""}${t.loyalty !== undefined ? `:L${t.loyalty}` : ""}:${t.colors.join("")}:${t.types.join("")}:${t.keywords.join(",")}:${t.abilities ?? ""}${t.back ? `|back:${tokenDef(t.back).oracleId}` : ""}${t.triggersOf?.length ? `|triggersOf:${t.triggersOf.map((d) => d.oracleId).join(",")}` : ""}`,
    name: t.named ? t.name : `${t.name} Token`,
    manaCost: t.manaCost ?? "",
    cmc: t.manaCost ? manaValue(parseManaCost(t.manaCost)) : 0,
    typeLine: `${t.legendary ? "Legendary " : ""}${t.snow ? "Snow " : ""}Token ${t.types.join(" ")}${t.subtypes.length ? ` — ${t.subtypes.join(" ")}` : ""}`,
    supertypes: [...(t.legendary ? ["Legendary"] : []), ...(t.snow ? ["Snow"] : []), "Token"],
    types: t.types,
    subtypes: t.subtypes,
    oracleText: [t.keywords.join(", "), t.abilities ?? ""].filter(Boolean).join("\n"),
    ...(t.power !== undefined ? { power: String(t.power), toughness: String(t.toughness) } : {}),
    colors: t.colors,
    colorIdentity: t.colors,
    keywords: t.keywords,
    ...(t.back ? { tokenBack: tokenDef(t.back) } : {}),
    ...(t.triggersOf?.length ? { borrowedTriggers: t.triggersOf } : {}),
    ...(t.loyalty !== undefined ? { loyalty: String(t.loyalty) } : {}),
  };
}

/**
 * A token put onto the battlefield attacking under `pid`'s control attacks only if `pid` is an attacking player (the
 * active player, in combat) and not the player it would attack (CR 506.3b): Crafty Cutpurse's rulings, "If a token would
 * be created tapped and attacking, but the token's controller isn't an attacking player, that token is created tapped
 * but not attacking."
 */
function attackingPlayer(s: GameState, pid: PlayerId, at: PlayerId): boolean {
  return pid === s.activePlayer && at !== pid;
}

/**
 * One put onto the battlefield blocking `attacker` blocks it only if that creature is attacking `pid`, a planeswalker
 * `pid` controls or a battle `pid` protects (CR 506.3e; Crafty Cutpurse's rulings).
 */
export function defendingAgainst(s: GameState, pid: PlayerId, attacker: GameObject): boolean {
  const p = attacker.attackingPermanent ? s.objects[attacker.attackingPermanent.id] : undefined;
  if (p?.zone === "battlefield") return controllerOf(s, p) === pid || p.protector === pid;
  return attacker.attacking === pid;
}

export function createToken(s: GameState, pid: PlayerId, t0: TokenSpec, opts: { tapped?: boolean; attacking?: PlayerId; counters?: Record<string, number>; blocking?: GameObject } = {}): GameObject {
  // Gutter Grime's Ooze: "... slime counters on Gutter Grime": the name of the permanent whose ability creates it, as it is
  // now or as it last existed (CR 608.2h), so the token's ability reads it (grants.ts compileQuoted).
  const it = s.resolving?.item;
  const by = t0.abilities?.includes(QUOTED_SOURCE_NAME) && it?.kind === "ability" && it.sourceId ? s.objects[it.sourceId] : undefined;
  const byName = by ? (by.zone === "battlefield" ? characteristics(s, by).name : (s.lastKnown?.[by.id]?.source?.name ?? defOf(s, by).name)) : undefined;
  const t = byName ? { ...t0, abilities: t0.abilities!.replaceAll(QUOTED_SOURCE_NAME, byName) } : t0;
  const o = newObject(s, tokenDef(t), pid, "exile");
  o.isToken = true;
  // It enters like any permanent, so ETB triggers see it, with any counters it's created with (CR 122.6, 614.1c).
  moveObject(s, o.id, "battlefield", { ...(opts.tapped ? { tapped: true } : {}), ...(opts.counters ? { counters: opts.counters } : {}) });
  // Worms of the Earth (round B258): a land token that can't enter isn't created at all (CR 111.5).
  if (!s.objects[o.id]) return o;
  if (opts.attacking !== undefined && o.zone === "battlefield" && attackingPlayer(s, pid, opts.attacking)) o.attacking = opts.attacking;
  // Put onto the battlefield blocking (Brimaz): it blocks that attacker, never declared as a blocker (CR 509.1, rulings).
  const at = opts.blocking;
  // Only a creature can be blocking (Mirror Match rulings: a noncreature one enters but isn't).
  if (at && o.zone === "battlefield" && objIsType(s, o, "Creature") && at.zone === "battlefield" && at.attacking !== undefined && defendingAgainst(s, pid, at)) {
    o.blocking = [at.id];
    (at.blockedBy ??= []).push(o.id);
    at.becameBlockedTurn = s.turn;
  }
  s.resolving?.created?.push(o.id);
  noteCreated(s, pid, o);
  return o;
}

/**
 * The other tokens a replacement adds (Peregrin Took's Food, Chatterfang's Squirrels, Academy Manufactor's), created at
 * the same time. Anything else the effect says about its tokens (tapped, attacking, with counters, "exile it at end of
 * combat") applies to these too (rulings on Peregrin Took and Chatterfang).
 */
export function createExtraTokens(s: GameState, pid: PlayerId, extra: TokenBatch["extra"], opts: { tapped?: boolean; attacking?: PlayerId; counters?: Record<string, number>; blocking?: GameObject } = {}, /** What each of the first ones attacks, as chosen for the tokens they replace (attackChoices). */ attackAt?: { player: PlayerId; planeswalker?: ObjectId }[]) {
  let at = 0;
  const attackFor = (o: GameObject) => {
    const a = attackAt?.[at++];
    if (!a || o.zone !== "battlefield" || o.attacking === undefined) return;
    o.attacking = a.player;
    const pw = a.planeswalker !== undefined ? s.objects[a.planeswalker] : undefined;
    if (pw?.zone === "battlefield") o.attackingPermanent = { id: pw.id, zc: pw.zoneChanges ?? 0 };
  };
  for (const x of extra) {
    if (x.copyOf !== undefined) {
      for (const o of copiesInstead(s, pid, x.copyOf, x.n, opts)) attackFor(o);
      continue;
    }
    const { token, n } = x;
    for (let i = 0; i < n; i++) attackFor(createToken(s, pid, token, opts));
    log(s, `${player(s, pid).name} ${x.instead ? "" : "also "}creates ${n === 1 ? "a" : n}${opts.tapped ? " tapped" : ""} ${token.power !== undefined ? `${token.power}/${token.toughness} ` : ""}${token.name} token${n > 1 ? "s" : ""}${x.instead ? " instead" : ""}.`);
  }
}

/**
 * Esix, Mirrormind Crown: `n` tokens that are copies of this permanent as it is now (CR 707.2: a token is copied as the
 * effect that made it said, a copy as what it copies, X is 0, rulings), instead of the tokens an effect would create.
 * What the effect says about how they enter (tapped, attacking, with counters) still applies to them (rulings).
 */
function copiesInstead(s: GameState, pid: PlayerId, of: ObjectId, n: number, opts: { tapped?: boolean; attacking?: PlayerId; counters?: Record<string, number>; blocking?: GameObject }): GameObject[] {
  const src = s.objects[of];
  if (!src || n <= 0) return [];
  const base = copiableDef(s, src);
  const { key, face } = tokenCopyKey(s, base);
  const made: GameObject[] = [];
  for (let i = 0; i < n; i++) {
    const o = newObject(s, s.cards[key]!, pid, "exile");
    o.isToken = true;
    moveObject(s, o.id, "battlefield", { ...(opts.tapped ? { tapped: true } : {}), ...(face !== undefined ? { face } : {}), ...(opts.counters ? { counters: opts.counters } : {}) });
    if (!s.objects[o.id]) continue; // a land token Worms of the Earth stops (CR 111.5)
    if (opts.attacking !== undefined && o.zone === "battlefield" && objIsType(s, o, "Creature") && attackingPlayer(s, pid, opts.attacking)) o.attacking = opts.attacking;
    const at = opts.blocking;
    if (at && o.zone === "battlefield" && at.zone === "battlefield" && at.attacking !== undefined && objIsType(s, o, "Creature") && defendingAgainst(s, pid, at)) {
      o.blocking = [at.id];
      (at.blockedBy ??= []).push(o.id);
      at.becameBlockedTurn = s.turn;
    }
    s.resolving?.created?.push(o.id);
    noteCreated(s, pid, o);
    made.push(o);
  }
  log(s, `${player(s, pid).name} creates ${n === 1 ? "a token that's a copy" : `${n} tokens that are copies`} of ${base.name} instead.`);
  return made;
}

/** A token `pid` created (CR 111.2), for "the number of Treasure tokens you created this turn". */
function noteCreated(s: GameState, pid: PlayerId, o: GameObject) {
  const it = s.resolving?.item;
  if (it?.kind === "ability" && it.sourceId !== undefined && it.sourceZc !== undefined) {
    o.createdWith = { id: it.sourceId, zc: it.sourceZc };
    invalidateCharacteristics(s); // a characteristic-defining ability about its creator (Gutter Grime's Ooze)
  }
  ((s.turnLog ??= {}).tokensCreated ??= []).push({ player: pid, subtypes: [...defOf(s, o).subtypes] });
  // Not if it was put into exile instead (Hallowed Moonlight): it never entered.
  if (o.zone === "battlefield") (s.zoneBatch ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, to: "battlefield", owner: o.owner, notCard: true, card: o.cardId, createdBy: pid });
  // "Whenever you create a token" (not a copy of a permanent spell becoming one, CR 111.12).
  fireOnceEntered(s, { type: "tokenCreated", player: pid, id: o.id });
}

/** "All attack ...": the answer for every token still to be asked about, at once (an option with several tokens left). */
const ALL_ATTACK = "all:";

/**
 * The options of the question what a token entering attacking attacks (CR 508.4): each player or planeswalker, and with
 * `left` tokens still to ask about, the same once more for all of them.
 */
export function attackWhomOptions(choices: { key: string; label: string }[], left: number): { options: string[]; labels: string[] } {
  const all = left > 1 ? choices : [];
  return { options: [...choices.map((a) => a.key), ...all.map((a) => `${ALL_ATTACK}${a.key}`)], labels: [...choices.map((a) => a.label), ...all.map((a) => `All ${left} attack ${a.label}`)] };
}

/** Record the answer to that question in `picks`, for every token left (up to `n`) if it was an "All attack" one. */
export function takeAttackWhom(sc: NonNullable<NonNullable<GameState["resolving"]>["scratch"]>, picks: string[], n: number): void {
  const a = sc.attackWhom!;
  sc.attackWhom = undefined;
  if (!a.startsWith(ALL_ATTACK)) {
    picks.push(a);
    return;
  }
  while (picks.length < n) picks.push(a.slice(ALL_ATTACK.length));
}
