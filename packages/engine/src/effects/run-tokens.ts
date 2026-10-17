import type { Effect, TokenSpec } from "../abilities";
import { defOf, power, toughness } from "../cards";
import { auraHostOptions, enterTogether, livingPlayers, log, moveObject, nameOf, newObject, opponents, player } from "../game";
import { tokensToCreate } from "../counters";
import { copyKey, type CopyExcept } from "../copies";
import type { CardDef, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { ResolveCtx, apnap, objects, players, amountNow } from "./resolve";
import { inCombat, attackDefault } from "./triggers";
import { attackChoices } from "./run-zones";
import { copiedValues } from "./run-copies";
import { controllerOf, invalidateCharacteristics } from "../layers";

/**
 * Create `n` tokens that are copies of `base` for this player (CR 707.2), doubled by token doublers (CR 614.1a). They
 * enter at the same time (CR 608.2f), so each sees the others enter and none counts another as it enters (603.6a, 614.12).
 */
export function tokenCopies(s: GameState, pid: PlayerId, base: CardDef, n: number, ctx: ResolveCtx, opts: { except?: CopyExcept; tapped?: boolean; attacking?: boolean; defender?: PlayerId } = {}) {
  const key = copyKey(s, base, opts.except);
  const k = tokensToCreate(s, pid, s.cards[key]!, n);
  const defender = opts.defender ?? (opts.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined);
  enterTogether(s, () => {
    for (let i = 0; i < k; i++) {
      const o = newObject(s, s.cards[key]!, pid, "exile");
      o.isToken = true;
      moveObject(s, o.id, "battlefield", opts.tapped || opts.attacking ? { tapped: true } : {});
      if (defender !== undefined && o.zone === "battlefield") o.attacking = defender;
      s.resolving?.created?.push(o.id);
      noteCreated(s, pid, o);
    }
  });
  if (k) log(s, `${player(s, pid).name} creates ${k === 1 ? "a token that's a copy" : `${k} tokens that are copies`} of ${base.name}.`);
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
          if (livingPlayers(s).includes(pid)) tokenCopies(s, ctx.controller, base, 1, ctx, { tapped: true, defender: pid });
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
      // The copiable values of what it copies as it is now, or as it last existed (CR 707.2, 608.2h): a card in
      // a graveyard is copied as that card; "a copy of it" for a creature that has left is of it as it last was
      // (offspring and squad rulings).
      const base = e.ofSource ? ctx.sourceDef : copiedValues(s, e.what, ctx);
      if (!base) return;
      const n = amountNow(s, e.n, ctx);
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const pid of players(s, e.who, ctx)) tokenCopies(s, pid, base, n, ctx, e);
      });
      return;
    }
    case "createToken": {
      const n = amountNow(s, e.n, ctx);
      // "Attacking that player or a planeswalker they control" (Adeline): what each opponent's tokens attack is chosen
      // first, as they enter (CR 508.4, rulings), one opponent at a time; then they're all created at once.
      if (e.attackingEach && e.orPlaneswalker && inCombat(s) && s.activePlayer === ctx.controller) {
        const sc = (s.resolving!.scratch ??= {});
        const picks = (sc.attackEach ??= {});
        for (const opp of apnap(s, opponents(s, ctx.controller))) {
          if (picks[opp] !== undefined) continue;
          const options = attackChoices(s, ctx.controller, ctx.sourceId).filter((a) => a.player === opp);
          if (options.length < 2) continue;
          if (sc.attackWhom === undefined) {
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: options.map((a) => a.key), labels: options.map((a) => a.label), prompt: `choose what the ${e.token.name} token${n === 1 ? "" : "s"} for ${player(s, opp).name} attack${n === 1 ? "s" : ""}` };
            return "paused";
          }
          picks[opp] = sc.attackWhom;
          sc.attackWhom = undefined;
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
      const k = tokensToCreate(s, pid, e.token, n);
      const defender = inCombat(s) && s.activePlayer === pid ? opp : undefined;
      // A planeswalker chosen for this opponent's tokens, if it's still there (Adeline).
      const pw = defender !== undefined ? /^\d+:(.+)$/.exec(picks[opp] ?? "")?.[1] : undefined;
      const walker = pw && s.objects[pw]?.zone === "battlefield" && controllerOf(s, s.objects[pw]!) === opp ? s.objects[pw] : undefined;
      for (let i = 0; i < k; i++) {
        const t = createToken(s, pid, e.token, { tapped: true, attacking: defender });
        if (walker && t?.zone === "battlefield" && t.attacking !== undefined) t.attackingPermanent = { id: walker.id, zc: walker.zoneChanges ?? 0 };
      }
      if (k) log(s, `${src} creates ${k === 1 ? "a" : k} tapped${defender !== undefined ? " and attacking" : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${defender !== undefined ? ` (attacking ${walker ? `${defOf(s, walker).name} (${player(s, defender).name})` : player(s, defender).name})` : ""}.`);
    }
    return;
  }
  for (const pid of players(s, e.who, ctx)) {
    const k = tokensToCreate(s, pid, e.token, n);
    // "Tapped and attacking" (CR 508.4): put onto the battlefield attacking, never declared as attackers.
    const defender = e.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined;
    const counters = e.counters ? { [e.counters.counter]: amountNow(s, e.counters.n, ctx) } : undefined;
    for (let i = 0; i < k; i++) createToken(s, pid, e.token, { tapped: e.tapped || e.attacking, attacking: defender, ...(counters ? { counters } : {}) });
    if (k) log(s, `${src} creates ${k === 1 ? "a" : k}${e.tapped || e.attacking ? " tapped" : ""}${defender !== undefined ? " and attacking" : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${defender !== undefined && livingPlayers(s).length > 2 ? ` (attacking ${player(s, defender).name})` : ""}.`);
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
      const k = tokensToCreate(s, pid, e.token, n);
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

/** A token `pid` created (CR 111.2), for "the number of Treasure tokens you created this turn". */
function noteCreated(s: GameState, pid: PlayerId, o: GameObject) {
  ((s.turnLog ??= {}).tokensCreated ??= []).push({ player: pid, subtypes: [...defOf(s, o).subtypes] });
}
