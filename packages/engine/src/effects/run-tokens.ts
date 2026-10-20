import type { Effect, ObjRef, TokenSpec } from "../abilities";
import { defOf, isType, power, toughness } from "../cards";
import { auraHostOptions, enterTogether, livingPlayers, log, moveObject, nameOf, newObject, opponents, player } from "../game";
import { tokenBatch, type TokenBatch } from "../counters";
import { copiableDef, copyEnterCounters, tokenCopyKey, type CopyExcept } from "../copies";
import type { CardDef, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { ResolveCtx, apnap, objects, players, amountNow } from "./resolve";
import { inCombat, attackDefault, fireEvent } from "./triggers";
import { attackChoices } from "./run-zones";
import { copiedValues } from "./run-copies";
import { controllerOf, invalidateCharacteristics } from "../layers";

/**
 * Create `n` tokens that are copies of `base` for this player (CR 707.2), doubled by token doublers (CR 614.1a). They
 * enter at the same time (CR 608.2f), so each sees the others enter and none counts another as it enters (603.6a, 614.12).
 */
export function tokenCopies(s: GameState, pid: PlayerId, base: CardDef, n: number, ctx: ResolveCtx, opts: { except?: CopyExcept; tapped?: boolean; attacking?: boolean; defender?: PlayerId } = {}) {
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
      if (defender !== undefined && o.zone === "battlefield") o.attacking = defender;
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
        // One copy of each of them, their copiable values as they are now (CR 707.2), all created at once.
        const bases = objects(s, e.what, ctx).map((o) => copiableDef(s, o));
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          for (const pid of players(s, e.who, ctx)) for (const base of bases) tokenCopies(s, pid, base, 1, ctx, e);
        });
        return;
      }
      // The copiable values of what it copies as it is now, or as it last existed (CR 707.2, 608.2h): a card in
      // a graveyard is copied as that card; "a copy of it" for a creature that has left is of it as it last was
      // (offspring and squad rulings).
      const base = e.ofSource ? ctx.sourceDef : copiedValues(s, e.what, ctx);
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
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const pid of players(s, e.who, ctx)) tokenCopies(s, pid, base, n, ctx, e);
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
              s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: options.map((a) => a.key), labels: options.map((a) => a.label), prompt: `choose what the ${e.token.name} token for ${player(s, opp).name} attacks${which}` };
              return "paused";
            }
            mine.push(sc.attackWhom);
            sc.attackWhom = undefined;
          }
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
      enterTogether(s, () => createTokensFor(s, e, n, ctx, src));
      return;
    }
  }
}

/** "Create N ... tokens" for each player it names. */
function createTokensFor(s: GameState, e0: Extract<Effect, { type: "createToken" }>, n: number, ctx: ResolveCtx, src: string) {
  // "An X/X token": X worked out now, once (rulings on Inscription of Insight); the token's printed power and toughness.
  const xx = e0.pt !== undefined ? amountNow(s, e0.pt, ctx) : undefined;
  const e = xx !== undefined ? { ...e0, token: { ...e0.token, power: xx, toughness: xx } } : e0;
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
    const opts = { tapped: e.tapped || e.attacking, attacking: defender, ...(counters ? { counters } : {}) };
    for (let i = 0; i < k; i++) createToken(s, pid, e.token, opts);
    if (k) log(s, `${src} creates ${k === 1 ? "a" : k}${e.tapped || e.attacking ? " tapped" : ""}${defender !== undefined ? " and attacking" : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${defender !== undefined && livingPlayers(s).length > 2 ? ` (attacking ${player(s, defender).name})` : ""}.`);
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
    oracleId: `token:${t.named ? "named:" : ""}${t.legendary ? "legendary:" : ""}${t.name}:${t.power ?? ""}/${t.toughness ?? ""}${t.loyalty !== undefined ? `:L${t.loyalty}` : ""}:${t.colors.join("")}:${t.types.join("")}:${t.keywords.join(",")}:${t.abilities ?? ""}${t.back ? `|back:${tokenDef(t.back).oracleId}` : ""}`,
    name: t.named ? t.name : `${t.name} Token`,
    manaCost: "",
    cmc: 0,
    typeLine: `${t.legendary ? "Legendary " : ""}Token ${t.types.join(" ")} — ${t.subtypes.join(" ")}`,
    supertypes: t.legendary ? ["Legendary", "Token"] : ["Token"],
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

export function createToken(s: GameState, pid: PlayerId, t: TokenSpec, opts: { tapped?: boolean; attacking?: PlayerId; counters?: Record<string, number> } = {}): GameObject {
  const o = newObject(s, tokenDef(t), pid, "exile");
  o.isToken = true;
  // It enters like any permanent, so ETB triggers see it, with any counters it's created with (CR 122.6, 614.1c).
  moveObject(s, o.id, "battlefield", { ...(opts.tapped ? { tapped: true } : {}), ...(opts.counters ? { counters: opts.counters } : {}) });
  if (opts.attacking !== undefined && o.zone === "battlefield") o.attacking = opts.attacking;
  s.resolving?.created?.push(o.id);
  noteCreated(s, pid, o);
  return o;
}

/**
 * The other tokens a replacement adds (Peregrin Took's Food, Chatterfang's Squirrels, Academy Manufactor's), created at
 * the same time. Anything else the effect says about its tokens (tapped, attacking, with counters, "exile it at end of
 * combat") applies to these too (rulings on Peregrin Took and Chatterfang).
 */
export function createExtraTokens(s: GameState, pid: PlayerId, extra: TokenBatch["extra"], opts: { tapped?: boolean; attacking?: PlayerId; counters?: Record<string, number> } = {}) {
  for (const { token, n } of extra) {
    for (let i = 0; i < n; i++) createToken(s, pid, token, opts);
    log(s, `${player(s, pid).name} also creates ${n === 1 ? "a" : n}${opts.tapped ? " tapped" : ""} ${token.power !== undefined ? `${token.power}/${token.toughness} ` : ""}${token.name} token${n > 1 ? "s" : ""}.`);
  }
}

/** A token `pid` created (CR 111.2), for "the number of Treasure tokens you created this turn". */
function noteCreated(s: GameState, pid: PlayerId, o: GameObject) {
  ((s.turnLog ??= {}).tokensCreated ??= []).push({ player: pid, subtypes: [...defOf(s, o).subtypes] });
  // "Whenever you create a token" (not a copy of a permanent spell becoming one, CR 111.12).
  fireEvent(s, { type: "tokenCreated", player: pid, id: o.id });
}
