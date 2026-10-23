import type { Effect, ObjRef, TokenSpec } from "../abilities";
import { defOf, isPermanentCard, isType, power, toughness } from "../cards";
import { auraHostOptions, enterTogether, livingPlayers, log, moveObject, nameOf, newObject, opponents, player } from "../game";
import { tokenBatch, type TokenBatch } from "../counters";
import { copiableDef, copyEnterCounters, tokenCopyKey, type CopyExcept } from "../copies";
import type { CardDef, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { ResolveCtx, apnap, objects, players, amountNow } from "./resolve";
import { inCombat, attackDefault, fireEvent } from "./triggers";
import { attackChoices } from "./run-zones";
import { copiedValues } from "./run-copies";
import { controllerOf, invalidateCharacteristics } from "../layers";
import { defMv } from "../faces";

/**
 * Create `n` tokens that are copies of `base` for this player (CR 707.2), doubled by token doublers (CR 614.1a). They
 * enter at the same time (CR 608.2f), so each sees the others enter and none counts another as it enters (603.6a, 614.12).
 */
export function tokenCopies(s: GameState, pid: PlayerId, base: CardDef, n: number, ctx: ResolveCtx, opts: { except?: CopyExcept; tapped?: boolean; attacking?: boolean; defender?: PlayerId; /** What each of the first ones attacks, as chosen (attackChoices). */ attackAt?: { player: PlayerId; planeswalker?: ObjectId }[] } = {}) {
  // A copy of a double-faced object is a double-faced token, with the same face up (CR 707.8a).
  const { key, face } = tokenCopyKey(s, base, opts.except);
  const { same: k, extra } = tokenBatch(s, pid, s.cards[key]!, n);
  const defender = opts.defender ?? (opts.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined);
  enterTogether(s, () => {
    for (let i = 0; i < k; i++) {
      const o = newObject(s, s.cards[key]!, pid, "exile");
      o.isToken = true;
      // "Except it enters with an additional +1/+1 counter on it" (Littjara Mirrorlake).
      const counters = copyEnterCounters(opts.except, (type) => isType(s.cards[key]!, type));
      moveObject(s, o.id, "battlefield", { ...(opts.tapped || opts.attacking ? { tapped: true } : {}), ...(face !== undefined ? { face } : {}), ...(Object.keys(counters).length ? { counters } : {}) });
      const at = opts.attackAt?.[i];
      if (defender !== undefined && o.zone === "battlefield") o.attacking = at?.player ?? defender;
      const pw = at?.planeswalker !== undefined ? s.objects[at.planeswalker] : undefined;
      if (pw && o.attacking !== undefined && pw.zone === "battlefield") o.attackingPermanent = { id: pw.id, zc: pw.zoneChanges ?? 0 };
      s.resolving?.created?.push(o.id);
      noteCreated(s, pid, o);
    }
    createExtraTokens(s, pid, extra, { tapped: opts.tapped || opts.attacking, attacking: defender });
  });
  if (k) log(s, `${player(s, pid).name} creates ${k === 1 ? "a token that's a copy" : `${k} tokens that are copies`} of ${base.name}.`);
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
    case "createTokenCopy": {
      if (e.each) {
        // One copy of each of them (`n` of each, Doppelgang), their copiable values as they are now (CR 707.2), all created at once.
        const bases = objects(s, e.what, ctx).map((o) => copiableDef(s, o));
        const n = amountNow(s, e.n, ctx);
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          for (const pid of players(s, e.who, ctx)) for (const base of bases) tokenCopies(s, pid, base, n, ctx, e);
        });
        return;
      }
      // The copiable values of what it copies as it is now, or as it last existed (CR 707.2, 608.2h): a card in
      // a graveyard is copied as that card; "a copy of it" for a creature that has left is of it as it last was
      // (offspring and squad rulings).
      let base = e.ofSource ? ctx.sourceDef : e.what.ref === "linkedCard" ? undefined : copiedValues(s, e.what, ctx);
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
      const choices = e.attacking && who.length === 1 ? attackChoices(s, who[0]!, ctx.sourceId) : [];
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
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const pid of who) tokenCopies(s, pid, base, n, ctx, { ...e, ...(attackAt.length ? { attackAt } : {}) });
      });
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
          const { same: k, extra } = tokenBatch(s, pid, token, 1);
          for (let i = 0; i < k; i++) createToken(s, pid, token);
          if (k) log(s, `${player(s, pid).name} creates ${k === 1 ? "a" : k} ${x}/${x} ${token.name} token${k > 1 ? "s" : ""} (${src}).`);
          createExtraTokens(s, pid, extra);
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
        const k = tokenBatch(s, ctx.controller, e.token, n).same;
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
      if (e.attacking && !e.attackingEach && !e.attachTo) {
        const who = players(s, e.who, ctx);
        const choices = who.length === 1 ? attackChoices(s, who[0]!, ctx.sourceId) : [];
        if (choices.length > 1) {
          const k = tokenBatch(s, who[0]!, e.token, n).same;
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
      return;
    }
  }
}

/** "Create N ... tokens" for each player it names. */
function createTokensFor(s: GameState, e0: Extract<Effect, { type: "createToken" }>, n: number, ctx: ResolveCtx, src: string, /** What each attacking one attacks, as chosen (attackChoices). */ attackAt?: ReturnType<typeof attackChoices>) {
  // "An X/X token": X worked out now, once (rulings on Inscription of Insight); the token's printed power and toughness.
  const xx = e0.pt !== undefined ? amountNow(s, e0.pt, ctx) : undefined;
  const e = xx !== undefined ? { ...e0, token: { ...e0.token, power: xx, toughness: e0.ptPowerOnly ? e0.token.toughness : xx } } : e0;
  // One group for each opponent, attacking that opponent if it's this player's combat (CR 508.4), tapped either way.
  if (e.attackingEach) {
    const pid = ctx.controller;
    const picks = s.resolving?.scratch?.attackEach ?? {};
    for (const opp of apnap(s, opponents(s, pid))) {
      const { same: k, extra } = tokenBatch(s, pid, e.token, n);
      const defender = inCombat(s) && s.activePlayer === pid ? opp : undefined;
      // The planeswalker chosen for each of this opponent's tokens, if it's still there (Adeline).
      const walkerFor = (i: number) => {
        const pw = defender !== undefined ? /^\d+:(.+)$/.exec(picks[opp]?.[i] ?? "")?.[1] : undefined;
        return pw && s.objects[pw]?.zone === "battlefield" && controllerOf(s, s.objects[pw]!) === opp ? s.objects[pw] : undefined;
      };
      const at: string[] = [];
      for (let i = 0; i < k; i++) {
        const t = createToken(s, pid, e.token, { tapped: true, attacking: defender });
        const walker = walkerFor(i);
        if (walker && t?.zone === "battlefield" && t.attacking !== undefined) t.attackingPermanent = { id: walker.id, zc: walker.zoneChanges ?? 0 };
        if (defender !== undefined) at.push(walker ? `${defOf(s, walker).name} (${player(s, defender).name})` : player(s, defender).name);
      }
      const whom = [...new Set(at)].join(" and ");
      if (k) log(s, `${src} creates ${k === 1 ? "a" : k} tapped${defender !== undefined ? " and attacking" : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${defender !== undefined ? ` (attacking ${whom})` : ""}.`);
      createExtraTokens(s, pid, extra, { tapped: true, attacking: defender });
    }
    return;
  }
  for (const pid of players(s, e.who, ctx)) {
    const { same: k, extra } = tokenBatch(s, pid, e.token, n);
    // "Tapped and attacking" (CR 508.4): put onto the battlefield attacking, never declared as attackers.
    const defender = e.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined;
    const counters = e.counters ? { [e.counters.counter]: amountNow(s, e.counters.n, ctx) } : undefined;
    const blocking = e.blocking ? objects(s, e.blocking, ctx)[0] : undefined;
    const tapped = e.tapped || (e.attacking && !e.untapped);
    const opts = { tapped, attacking: defender, ...(counters ? { counters } : {}), ...(blocking ? { blocking } : {}) };
    const whom = new Set<string>();
    for (let i = 0; i < k; i++) {
      const at = attackAt?.[i];
      const o = createToken(s, pid, e.token, { ...opts, ...(at ? { attacking: at.player } : {}) });
      // A planeswalker or battle chosen for it, if it's still there to be attacked (CR 506.3c).
      const pw = at?.planeswalker !== undefined ? s.objects[at.planeswalker] : undefined;
      if (pw && o.zone === "battlefield" && o.attacking !== undefined && pw.zone === "battlefield") o.attackingPermanent = { id: pw.id, zc: pw.zoneChanges ?? 0 };
      if (o.zone === "battlefield" && o.attacking !== undefined) whom.add(o.attackingPermanent ? `${defOf(s, s.objects[o.attackingPermanent.id]!).name} (${player(s, o.attacking).name})` : player(s, o.attacking).name);
    }
    if (k) log(s, `${src} creates ${k === 1 ? "a" : k}${tapped ? " tapped" : ""}${defender !== undefined ? `${tapped ? " and" : ""} attacking` : ""}${blocking && blocking.attacking !== undefined ? ` blocking ${defOf(s, blocking).name}` : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${whom.size && livingPlayers(s).length > 2 ? ` (attacking ${[...whom].join(" and ")})` : ""}.`);
    createExtraTokens(s, pid, extra, opts);
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
  for (const pid of players(s, e.who, ctx))
    for (const host of hosts) {
      if (s.objects[host]?.zone !== "battlefield") continue;
      const { same: k, extra } = tokenBatch(s, pid, e.token, n);
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
        s.resolving?.created?.push(o.id);
        noteCreated(s, pid, o);
        made++;
      }
      if (made) log(s, `${src} creates ${made === 1 ? "a" : made} ${e.token.name} ${e.token.subtypes.includes("Role") ? "Role " : ""}token${made > 1 ? "s" : ""} attached to ${nameOf(s, host)}.`);
      else if (k) log(s, `${src} can't create a ${e.token.name} token attached to ${nameOf(s, host)}.`);
    }
}

export function tokenDef(t: TokenSpec): CardDef {
  return {
    oracleId: `token:${t.named ? "named:" : ""}${t.legendary ? "legendary:" : ""}${t.snow ? "snow:" : ""}${t.name}:${t.power ?? ""}/${t.toughness ?? ""}${t.loyalty !== undefined ? `:L${t.loyalty}` : ""}:${t.colors.join("")}:${t.types.join("")}:${t.keywords.join(",")}:${t.abilities ?? ""}${t.back ? `|back:${tokenDef(t.back).oracleId}` : ""}`,
    name: t.named ? t.name : `${t.name} Token`,
    manaCost: "",
    cmc: 0,
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
    ...(t.loyalty !== undefined ? { loyalty: String(t.loyalty) } : {}),
  };
}

export function createToken(s: GameState, pid: PlayerId, t: TokenSpec, opts: { tapped?: boolean; attacking?: PlayerId; counters?: Record<string, number>; blocking?: GameObject } = {}): GameObject {
  const o = newObject(s, tokenDef(t), pid, "exile");
  o.isToken = true;
  // It enters like any permanent, so ETB triggers see it, with any counters it's created with (CR 122.6, 614.1c).
  moveObject(s, o.id, "battlefield", { ...(opts.tapped ? { tapped: true } : {}), ...(opts.counters ? { counters: opts.counters } : {}) });
  if (opts.attacking !== undefined && o.zone === "battlefield") o.attacking = opts.attacking;
  // Put onto the battlefield blocking (Brimaz): it blocks that attacker, never declared as a blocker (CR 509.1, rulings).
  const at = opts.blocking;
  if (at && o.zone === "battlefield" && at.zone === "battlefield" && at.attacking !== undefined) {
    o.blocking = [at.id];
    (at.blockedBy ??= []).push(o.id);
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
export function createExtraTokens(s: GameState, pid: PlayerId, extra: TokenBatch["extra"], opts: { tapped?: boolean; attacking?: PlayerId; counters?: Record<string, number>; blocking?: GameObject } = {}) {
  for (const { token, n } of extra) {
    for (let i = 0; i < n; i++) createToken(s, pid, token, opts);
    log(s, `${player(s, pid).name} also creates ${n === 1 ? "a" : n}${opts.tapped ? " tapped" : ""} ${token.power !== undefined ? `${token.power}/${token.toughness} ` : ""}${token.name} token${n > 1 ? "s" : ""}.`);
  }
}

/** A token `pid` created (CR 111.2), for "the number of Treasure tokens you created this turn". */
function noteCreated(s: GameState, pid: PlayerId, o: GameObject) {
  ((s.turnLog ??= {}).tokensCreated ??= []).push({ player: pid, subtypes: [...defOf(s, o).subtypes] });
  (s.zoneBatch ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, to: "battlefield", owner: o.owner, notCard: true, card: o.cardId, createdBy: pid });
  // "Whenever you create a token" (not a copy of a permanent spell becoming one, CR 111.12).
  fireEvent(s, { type: "tokenCreated", player: pid, id: o.id });
}

/** "All attack ...": the answer for every token still to be asked about, at once (an option with several tokens left). */
const ALL_ATTACK = "all:";

/**
 * The options of the question what a token entering attacking attacks (CR 508.4): each player or planeswalker, and with
 * `left` tokens still to ask about, the same once more for all of them.
 */
function attackWhomOptions(choices: { key: string; label: string }[], left: number): { options: string[]; labels: string[] } {
  const all = left > 1 ? choices : [];
  return { options: [...choices.map((a) => a.key), ...all.map((a) => `${ALL_ATTACK}${a.key}`)], labels: [...choices.map((a) => a.label), ...all.map((a) => `All ${left} attack ${a.label}`)] };
}

/** Record the answer to that question in `picks`, for every token left (up to `n`) if it was an "All attack" one. */
function takeAttackWhom(sc: NonNullable<NonNullable<GameState["resolving"]>["scratch"]>, picks: string[], n: number): void {
  const a = sc.attackWhom!;
  sc.attackWhom = undefined;
  if (!a.startsWith(ALL_ATTACK)) {
    picks.push(a);
    return;
  }
  while (picks.length < n) picks.push(a.slice(ALL_ATTACK.length));
}
