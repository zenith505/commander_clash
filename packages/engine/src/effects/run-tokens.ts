import type { Effect, TokenSpec } from "../abilities";
import { defOf, power, toughness } from "../cards";
import { livingPlayers, log, moveObject, newObject, opponents, player } from "../game";
import { tokensToCreate } from "../counters";
import { copyKey, type CopyExcept } from "../copies";
import type { CardDef, GameState, PlayerId } from "../types";
import { ResolveCtx, apnap, objects, players, amountNow } from "./resolve";
import { inCombat, attackDefault } from "./triggers";

/** Create `n` tokens that are copies of `base` for this player (CR 707.2), doubled by token doublers (CR 614.1a). */
export function tokenCopies(s: GameState, pid: PlayerId, base: CardDef, n: number, ctx: ResolveCtx, opts: { except?: CopyExcept; tapped?: boolean; attacking?: boolean; defender?: PlayerId } = {}) {
  const key = copyKey(s, base, opts.except);
  const k = tokensToCreate(s, pid, s.cards[key]!, n);
  const defender = opts.defender ?? (opts.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined);
  for (let i = 0; i < k; i++) {
    const o = newObject(s, s.cards[key]!, pid, "exile");
    o.isToken = true;
    moveObject(s, o.id, "battlefield", opts.tapped || opts.attacking ? { tapped: true } : {});
    if (defender !== undefined && o.zone === "battlefield") o.attacking = defender;
    s.resolving?.created?.push(o.id);
  }
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
      for (const pid of Object.keys(sc.chosen!).map(Number) as PlayerId[])
        if (livingPlayers(s).includes(pid)) tokenCopies(s, ctx.controller, base, 1, ctx, { tapped: true, defender: pid });
      return;
    }
    case "createTokenCopy": {
      // The copiable values of what it copies as it is now, or as it last existed (CR 707.2, 608.2h): a card in
      // a graveyard is copied as that card.
      const source = e.ofSource ? undefined : objects(s, e.what, ctx)[0];
      const base = e.ofSource ? ctx.sourceDef : source && defOf(s, source);
      if (!base) return;
      const n = amountNow(s, e.n, ctx);
      if (s.resolving) s.resolving.created = [];
      for (const pid of players(s, e.who, ctx)) tokenCopies(s, pid, base, n, ctx, e);
      return;
    }
    case "createToken": {
      const n = amountNow(s, e.n, ctx);
      if (s.resolving) s.resolving.created = [];
      // Token doublers apply per player (CR 614.1a): "twice that many of those tokens".
      for (const pid of players(s, e.who, ctx)) {
        const k = tokensToCreate(s, pid, e.token, n);
        // "Tapped and attacking" (CR 508.4): put onto the battlefield attacking, never declared as attackers.
        const defender = e.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined;
        for (let i = 0; i < k; i++) createToken(s, pid, e.token, { tapped: e.tapped || e.attacking, attacking: defender });
        if (k) log(s, `${src} creates ${k === 1 ? "a" : k}${e.tapped || e.attacking ? " tapped" : ""}${defender !== undefined ? " and attacking" : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${defender !== undefined && livingPlayers(s).length > 2 ? ` (attacking ${player(s, defender).name})` : ""}.`);
      }
      return;
    }
  }
}

export function tokenDef(t: TokenSpec): CardDef {
  return {
    oracleId: `token:${t.name}:${t.power ?? ""}/${t.toughness ?? ""}:${t.colors.join("")}:${t.types.join("")}:${t.keywords.join(",")}:${t.abilities ?? ""}`,
    name: `${t.name} Token`,
    manaCost: "",
    cmc: 0,
    typeLine: `Token ${t.types.join(" ")} — ${t.subtypes.join(" ")}`,
    supertypes: ["Token"],
    types: t.types,
    subtypes: t.subtypes,
    oracleText: [t.keywords.join(", "), t.abilities ?? ""].filter(Boolean).join("\n"),
    ...(t.power !== undefined ? { power: String(t.power), toughness: String(t.toughness) } : {}),
    colors: t.colors,
    colorIdentity: t.colors,
    keywords: t.keywords,
  };
}

export function createToken(s: GameState, pid: PlayerId, t: TokenSpec, opts: { tapped?: boolean; attacking?: PlayerId } = {}) {
  const o = newObject(s, tokenDef(t), pid, "exile");
  o.isToken = true;
  moveObject(s, o.id, "battlefield", opts.tapped ? { tapped: true } : {}); // enters like any permanent, so ETB triggers see it
  if (opts.attacking !== undefined && o.zone === "battlefield") o.attacking = opts.attacking;
  s.resolving?.created?.push(o.id);
}
