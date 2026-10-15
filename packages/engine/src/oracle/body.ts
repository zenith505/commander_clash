import type { AbilityBody, Amount, AmountExpr, Count, Effect, SpellCondition, TargetSpec, UnlessPays, PayCost } from "../abilities";
import { substituteX } from "../amounts";
import { num, NUMX, X, amt, isGroup } from "./words";
import { parseStaticCondition } from "./statics";
import { parseCount } from "./counts";
import { parseDig, parseSentence } from "./sentence";
import { compileQuoted } from "./grants";
import { parsePlayer } from "./targets";

export interface Ctx {
  targets: TargetSpec[];
  /** In a trigger about another object ("blocks a creature"), "that creature" is that object. */
  subject?: boolean;
  /** "Whenever a creature you control enters": "it", "its power", "that land" are the entering permanent too. */
  subjectIt?: boolean;
  /** In a trigger about the permanent itself, "it" (with no target before it) is that permanent. */
  selfIt?: boolean;
  /** After it left the battlefield ("When ~ dies, return it to its owner's hand"), "it" is the card in its new zone. */
  selfCard?: boolean;
  /** Index of the most recent object target, for "it" / "its controller". */
  lastObjectTarget?: number;
  /** The most recent "up to two target creatures", for "they" / "those creatures". */
  lastTargets?: { index: number; n?: number };
  /** Index of the most recent player target, for "that player's hand". */
  lastPlayerTarget?: number;
  /** In an activated ability: "its power" with no target before it is the source's. */
  activated?: boolean;
  /** The last sentence created one token: "put a +1/+1 counter on it" means that token. */
  lastCreated?: boolean;
  /** The last sentence created tokens, any number: "Sacrifice them at the beginning of the next end step". */
  lastCreatedAny?: boolean;
  /** An instant or sorcery: "other" can't mean other than its source, which isn't a permanent. */
  spell?: boolean;
  /** A "whenever a player casts a spell" trigger: "it" or "that spell" can be the spell cast. */
  castSpell?: boolean;
  /** In a "when you cast this spell" ability: "copy it" is the spell itself. */
  selfCastSpell?: boolean;
  /** "Whenever ~ deals combat damage to a player": "that player" is that player. */
  eventPlayer?: boolean;
  /** In "whenever ~ attacks" and "becomes blocked" triggers: "defending player" is the event player. */
  defending?: boolean;
  /** "Whenever another creature dies": the subject left the battlefield, so "it" and "that card" are the card where it went. */
  subjectLeft?: boolean;
}

/** Effects that can stop a resolution to wait for a player's choice. */
const PAUSING = new Set<Effect["type"]>(["discard", "scry", "surveil", "orderTop", "may", "explore", "search", "choose", "connive", "pick"]);

/** "You may [this]. If you do, ...": whether it was done is known (see canDoNow in effects.ts). */
const checkableMay = (e: Effect) =>
  (e.type === "discard" && e.who.ref === "you" && e.n === 1 && !e.random) || (e.type === "draw" && e.who.ref === "you") || (e.type === "sacrifice" && e.what.ref === "self");

/** Split text into sentences, keeping a quoted ability ('gains "Sacrifice ~. Draw a card."') whole. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && /\s/.test(text[i]!) && (text[i - 1] === "." || (text[i - 1] === '"' && text[i - 2] === "."))) {
      if (text.slice(start, i).trim()) out.push(text.slice(start, i));
      while (i + 1 < text.length && /\s/.test(text[i + 1]!)) i++;
      start = i + 1;
    }
  }
  if (text.slice(start).trim()) out.push(text.slice(start));
  return out;
}

export function parseBody(text: string, opts: { subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; activated?: boolean; spell?: boolean; castSpell?: boolean; eventPlayer?: boolean; defending?: boolean; selfCastSpell?: boolean } = {}): AbilityBody | null {
  const modal = MODAL.exec(text.trim());
  if (modal) return parseModal(modal[1]!, modal[2]!, text.trim(), opts.spell);
  if (text.includes("•")) return null; // modes with text before them, or a kind of choice we don't support
  const ctx: Ctx = {
    targets: [],
    ...(opts.subject ? { subject: true } : {}),
    ...(opts.subjectIt ? { subject: true, subjectIt: true } : {}),
    ...(opts.subjectLeft ? { subjectLeft: true } : {}),
    ...(opts.selfIt ? { selfIt: true } : {}),
    ...(opts.selfCard ? { selfCard: true } : {}),
    ...(opts.activated ? { activated: true } : {}),
    ...(opts.spell ? { spell: true } : {}),
    ...(opts.castSpell ? { castSpell: true } : {}),
    ...(opts.eventPlayer ? { eventPlayer: true } : {}),
    ...(opts.defending ? { defending: true } : {}),
    ...(opts.selfCastSpell ? { selfCastSpell: true } : {}),
  };
  const effects: Effect[] = [];
  const sentences = splitSentences(text.trim())
    .map((x) => x.replace(/\.$/, "").trim())
    // "Draw two cards, then discard a card": two instructions, in order.
    // A search's "then shuffle" is part of the search (CR 701.23): "you may search" covers it too.
    // Not after "If you do,": all of it depends on the payment ("If you do, choose a color, then ...").
    .flatMap((x) => (/^If you do, /.test(x) ? [x] : x.split(/, then (?!shuffle)/).map((p, i) => (i ? p.charAt(0).toUpperCase() + p.slice(1) : p))))
    .filter(Boolean);
  let prevStart = 0;
  let curStart = 0;
  // "You may pay {2}" waits for the sentence after: "If you do, draw a card."
  let payFirst: { pay: PayCost; text: string } | null = null;
  // "Look at the top four cards of your library" waits for what to do with them (see parseDig).
  let dig: Partial<Extract<Effect, { type: "dig" }>> | null = null;
  for (let si = 0; si < sentences.length; si++) {
    let s = sentences[si]!.replace(/^Then,? /, "");
    [prevStart, curStart] = [curStart, effects.length];
    // Impulse draw: "Exile the top two cards of your library. Until the end of your next turn, you may play those cards."
    const exTop = new RegExp(`^[Ee]xile the top (?:card|${NUMX} cards) of your library$`).exec(s);
    const playIt = exTop && sentences[si + 1] && /^(?:(Until the end of your next turn|Until end of turn), you may play (?:that card|those cards|them)|You may play (?:that card|those cards|them) (this turn|until the end of your next turn))$/.exec(sentences[si + 1]!.replace(/\.$/, ""));
    if (exTop && playIt) {
      const when = (playIt[1] ?? playIt[2])!.toLowerCase();
      effects.push({ type: "impulse", n: exTop[1] ? amt(exTop[1]) : 1, until: /next turn/.test(when) ? "nextTurn" : "thisTurn" });
      si++;
      continue;
    }
    // "Look at the top three cards of target player's library, then put them back in any order." The player
    // looking orders them (CR 401.4 lets nobody else see them). "You may shuffle." after it is a choice to shuffle.
    const order = new RegExp(`^(You may )?[Ll]ook at the top ${NUMX} cards of (your|target player's|target opponent's) library$`).exec(s);
    if (order && /^[Pp]ut them back in any order$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const who = parsePlayer(order[3] === "your" ? "you" : order[3]!.replace(/'s$/, ""), ctx);
      if (!who) return null;
      const e: Effect = { type: "orderTop", who, n: amt(order[2]!) };
      effects.push(order[1] ? { type: "may", effects: [e], text: `look at the top ${order[2]} cards of ${order[3]} library, then put them back in any order` } : e);
      si++;
      const shuffle = /^You may (shuffle|have that player shuffle)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (shuffle && (shuffle[1] === "shuffle") === (who.ref === "you")) {
        effects.push({ type: "may", effects: [{ type: "shuffle", who }], text: shuffle[1]! });
        si++;
      }
      continue;
    }
    const look = new RegExp(`^(Look at|Reveal) the top ${NUMX} cards? of your library$`, "i").exec(s);
    if (look && !dig) {
      dig = { type: "dig", n: amt(look[2]!), reveal: /^reveal/i.test(look[1]!) };
      continue;
    }
    if (dig) {
      const done = parseDig(s, dig);
      if (!done) return null;
      if (done === "more") continue;
      effects.push(done);
      dig = null;
      continue;
    }
    if (payFirst) {
      const then = /^If you do, (.+)$/.exec(s);
      if (!then) return null;
      const inner = parseOne(then[1]!.charAt(0).toUpperCase() + then[1]!.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => PAUSING.has(e.type)))) return null;
      effects.push({ type: "may", effects: inner, pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}` });
      payFirst = null;
      continue;
    }
    const mayPay = /^[Yy]ou may pay (.+)$/.exec(s);
    if (mayPay) {
      const pay = parsePayCost(mayPay[1]!);
      if (!pay) return null;
      payFirst = { pay, text: `pay ${mayPay[1]}` };
      continue;
    }
    // "If ~ was kicked, draw a card." / "If ~ was kicked, it deals 5 damage instead." (CR 702.33e)
    const kicked = /^If (?:~|it) was kicked(?: with its ((?:\{[^}]+\})+) kicker)?, (.+)$/.exec(s);
    if (kicked) {
      const fx = parseKicked(kicked[2]!, effects.slice(prevStart), ctx);
      if (!fx) return null;
      const cond: SpellCondition = { kind: "kicked", ...(kicked[1] ? { cost: kicked[1] } : {}) };
      if (fx.instead) effects.splice(prevStart, effects.length - prevStart, { type: "if", cond, effects: fx.effects, otherwise: effects.slice(prevStart) });
      else effects.push({ type: "if", cond, effects: fx.effects });
      continue;
    }
    // "..., where X is the number of creatures you control": X is defined by the text (CR 107.3c).
    // It's read after the rest of the sentence, which may name what it counts ("that player's hand").
    const where = /^(.+), where X is (.+)$/.exec(s);
    if (where) s = where[1]!;
    const before = effects.length;
    const defineX = () => {
      if (!where) return true;
      const def = parseCount(where[2]!, ctx);
      if (!def) return false;
      effects.splice(before, effects.length - before, ...replaceX(effects.slice(before), def));
      return true;
    };
    // "You may discard a card. If you do, draw a card." (CR 608.2c): what follows depends on whether it was
    // done. Only for things the engine can tell weren't possible (discarding with no cards in hand, ...).
    // "Exile target creature. Return that card to the battlefield under its owner's control at the beginning of
    // the next end step": the exile becomes a blink that comes back with a delayed trigger (CR 603.7).
    const later =
      /^(?:At the beginning of the next end step, return (?:it|that card|the exiled card) to the battlefield under (its owner's|your) control|Return (?:it|that card|the exiled card) to the battlefield under (its owner's|your) control at the beginning of the next end step)(?: with an? (\+1\/\+1) counter on it)?$/i.exec(s);
    const now = /^(?:[Tt]hen )?[Rr]eturn (?:it|that card|them|those cards) to the battlefield under (its owner's|their owners'|your) control$/.exec(s);
    if (now && effects[effects.length - 1]?.type === "exile") {
      const prev = effects[effects.length - 1] as Extract<Effect, { type: "exile" }>;
      if (prev.until || prev.linked || isGroup(prev.what)) return null;
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under: now[1] === "your" ? "you" : "owner" };
      continue;
    }
    if (later) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || prev.until || prev.linked || isGroup(prev.what) || effects.length - 1 < 0) return null;
      const under = (later[1] ?? later[2]) === "your" ? "you" : "owner";
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under, at: "nextEndStep", ...(later[3] ? { counter: "+1/+1" as const } : {}) };
      continue;
    }
    if (/^You may choose new targets for the cop(?:y|ies)$/i.test(s)) {
      const prev = effects[effects.length - 1];
      const copy = prev?.type === "nextCast" ? prev.effects[prev.effects.length - 1] : prev;
      if (copy?.type !== "copySpell") return null;
      copy.newTargets = true;
      continue;
    }
    const ifDid = /^If you (do|don't), (.+)$/.exec(s);
    if (ifDid) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "may" || prev.pay || !prev.effects.every(checkableMay)) return null;
      const inner = parseOne(ifDid[2]!.charAt(0).toUpperCase() + ifDid[2]!.slice(1), ctx);
      if (!inner) return null;
      effects.push(ifDid[1] === "do" ? { type: "if", cond: { kind: "youDid" }, effects: inner } : { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
      continue;
    }
    // "If you attacked this turn, create a Treasure token": checked as it resolves (CR 608.2c).
    const ifState = /^If ([^,]+), (.+)$/.exec(s);
    const stateCond = ifState && !/^(it|~)\b/.test(ifState[1]!) && !/\binstead$/.test(ifState[2]!) ? parseStaticCondition(ifState[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    // "Draw two cards. If you have the city's blessing, draw three cards instead.": the condition picks which of the
    // two instructions happens, as it resolves (CR 608.2c). "Instead only you draw a card" says the same.
    const insteadOf = ifState && !/^(it|~)\b/.test(ifState[1]!) && /^instead,? |\binstead$/.test(ifState[2]!) ? parseStaticCondition(ifState[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (ifState && insteadOf) {
      const previous = effects.slice(prevStart);
      const t = ifState[2]!.replace(/^instead,? (?:only )?/, "").replace(/ instead$/, "");
      const before = ctx.targets.length;
      const inner = parseOne(t.charAt(0).toUpperCase() + t.slice(1), ctx);
      // Only one of the two happens, so neither may wait on a choice or need targets of its own (one "you may"
      // instead would leave nothing done on a "no").
      if (!inner || !previous.length || ctx.targets.length !== before || [...previous, ...inner].some((e) => PAUSING.has(e.type))) return null;
      effects.splice(prevStart, effects.length - prevStart, { type: "if", cond: { kind: "state", cond: insteadOf }, effects: inner, otherwise: previous });
      continue;
    }
    if (ifState && stateCond) {
      const inner = parseOne(ifState[2]!.charAt(0).toUpperCase() + ifState[2]!.slice(1), ctx);
      // An effect that waits on a player has to be the only one, so resuming it doesn't repeat the others.
      if (!inner || (inner.length > 1 && inner.some((e) => PAUSING.has(e.type)))) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: stateCond }, effects: inner });
      continue;
    }
    // "You may draw a card": optional, decided on resolution (CR 608.2d).
    const may = /^[Yy]ou may (.+)$/.exec(s);
    if (may) {
      const rest = may[1]!.charAt(0).toUpperCase() + may[1]!.slice(1);
      const inner = parseOne(rest, ctx);
      if (!inner) return null;
      // An effect that waits on a player has to be the only one, so resuming it doesn't repeat the others.
      if (inner.length > 1 && inner.some((e) => PAUSING.has(e.type))) return null;
      effects.push({ type: "may", effects: inner, text: may[1]! });
      if (!defineX()) return null;
      continue;
    }
    // "Until end of turn, X ..." reads the same as "X ... until end of turn".
    if (/^Until end of turn, /.test(s)) s = `${s.replace(/^Until end of turn, /, "").replace(/^./, (c) => c.toUpperCase())} until end of turn`;
    // "Target creature you control gains protection from the color of your choice until end of turn": the
    // color is chosen as it resolves (CR 608.2d), after the target was chosen on casting.
    if (/ gains? protection from the color of your choice\b/.test(s)) {
      effects.push({ type: "choose", choice: "color" });
      s = s.replace("the color of your choice", "the chosen color");
    }
    // "Each opponent loses 2 life. You gain life equal to the life lost this way."
    if (/^You gain life equal to the (?:total )?life lost this way$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "loseLife") return null;
      last.drain = true;
      continue;
    }
    // "It can't be regenerated." / "They can't be regenerated." after a destroy (CR 701.19c).
    if (/^(It|They) can't be regenerated$/i.test(s)) {
      const last = effects[effects.length - 1];
      if (!last || last.type !== "destroy") return null;
      last.noRegen = true;
      continue;
    }
    // "If that spell is countered this way, exile it instead of putting it into its owner's graveyard" (CR 701.6a).
    if (/^If that spell is countered this way, exile it instead of putting it into its owner's graveyard$/i.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counterSpell" || !last.unless) return null;
      last.exile = true;
      continue;
    }
    // "It's still a land." keeps the land type a "becomes a creature" effect would replace (CR 205.1a).
    if (/^It's still an? (land|artifact|enchantment)$/i.test(s)) {
      const last = [...effects].reverse().find((e) => e.type === "continuous" && e.mods.some((x) => x.kind === "setTypes"));
      if (!last || last.type !== "continuous") return null;
      last.mods = last.mods.map((x) => (x.kind === "setTypes" ? { kind: "addTypes", types: x.types, subtypes: x.subtypes } : x));
      continue;
    }
    // 'It has "Sacrifice ~: Add {C}."' gives the tokens just created that ability (CR 111.3).
    const has = /^(?:It has|They have|They each have) "(.+)"$/.exec(s);
    if (has) {
      const prev = effects[effects.length - 1];
      const last = prev?.type === "may" ? prev.effects[prev.effects.length - 1] : prev;
      if (last?.type !== "createToken" || last.token.abilities || !compileQuoted(has[1]!)) return null;
      last.token = { ...last.token, abilities: has[1]! };
      continue;
    }
    const fx = parseOne(s, ctx);
    if (!fx) return null;
    effects.push(...fx);
    if (!defineX()) return null;
  }
  if (payFirst || dig) return null;
  return effects.length ? { targets: ctx.targets, effects, text } : null;
}

/** "{2}{U}", "3 life", "{E}{E}", "{1} and 2 life": a cost paid as an ability resolves. */
export function parsePayCost(text: string): PayCost | null {
  let m: RegExpExecArray | null;
  if ((m = /^((?:\{E\})+)$/.exec(text))) return { energy: m[1]!.length / 3 };
  if ((m = /^(\w+) \{E\}$/.exec(text))) {
    const n = num(m[1]!);
    return Number.isFinite(n) ? { energy: n } : null;
  }
  if ((m = /^(\d+) life$/.exec(text))) return { life: Number(m[1]) };
  if ((m = /^((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+)(?: and (\d+) life)?$/.exec(text))) return { mana: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
  return null;
}

/**
 * What "If ~ was kicked, ..." does. With "instead", it replaces the sentence before (`previous`).
 * Targets only the kicked part would need are chosen only if it's kicked (CR 702.33g): not modeled.
 */
function parseKicked(text: string, previous: Effect[], ctx: Ctx): { effects: Effect[]; instead: boolean } | null {
  let t = text;
  const instead = /^instead,? /i.test(t) || / instead$/i.test(t);
  t = t.replace(/^instead,? /i, "").replace(/ instead$/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (instead && !previous.length) return null;
  // "~ deals 2 damage to any target. If ~ was kicked, it deals 5 damage instead": the same damage, more of it.
  const more = /^(?:It|~) deals (\d+|X) damage(?: to (?:that creature|that player|it))?$/.exec(t);
  if (more && instead) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "damage") return null;
    return { effects: [{ ...prev, amount: amt(more[1]!) }], instead };
  }
  t = t.replace(/^It deals /, "~ deals ");
  const before = ctx.targets.length;
  const fx = parseOne(t, ctx);
  if (!fx || ctx.targets.length !== before) return null;
  if (fx.length > 1 && fx.some((e) => PAUSING.has(e.type))) return null;
  if (instead && previous.some((e) => PAUSING.has(e.type))) return null;
  return { effects: fx, instead };
}

/** One sentence: a plain instruction, two joined by "and", or one with "for each" / "equal to" in it. */
function parseOne(s: string, ctx: Ctx): Effect[] | null {
  // Support N (CR 701.41a): "other" target creatures on a permanent, any on an instant or sorcery.
  // Support X would need a variable number of targets: not supported.
  const support = /^[Ss]upport (\d+)$/.exec(s);
  if (support) s = `Put a +1/+1 counter on each of up to ${num(support[1]!) === 1 ? "one" : support[1]} ${ctx.spell ? "" : "other "}target creature${support[1] === "1" ? "" : "s"}`;
  const fx = attempt(ctx, () => parseSentence(s, ctx)) ?? attempt(ctx, () => parseConjunction(s, ctx)) ?? attempt(ctx, () => parseForEach(s, ctx)) ?? attempt(ctx, () => parseEqualTo(s, ctx));
  const last = fx?.[fx.length - 1];
  if (fx) {
    ctx.lastCreated = (last?.type === "createToken" || last?.type === "createTokenCopy") && last.n === 1;
    ctx.lastCreatedAny = last?.type === "createToken" || last?.type === "createTokenCopy";
  }
  return fx;
}

/** Run a parse that may fail halfway, undoing any targets it added. */
function attempt<T>(ctx: Ctx, f: () => T | null): T | null {
  const saved = { n: ctx.targets.length, o: ctx.lastObjectTarget, p: ctx.lastPlayerTarget };
  const r = f();
  if (r === null) {
    ctx.targets.length = saved.n;
    ctx.lastObjectTarget = saved.o;
    ctx.lastPlayerTarget = saved.p;
  }
  return r;
}

/** Replace every X in these effects with what the text defines it as. */
export function replaceX<T>(v: T, def: AmountExpr): T {
  if (Array.isArray(v)) return v.map((x) => replaceX(x, def)) as T;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.count && (o.count as Count).kind === "x") return substituteX(o as unknown as AmountExpr, def) as T;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, replaceX(x, def)])) as T;
  }
  return v;
}

/** Does anything in here use the X announced while casting or activating? */
export function usesX(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(usesX);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.count && (o.count as Count).kind === "x") return true;
    return Object.values(o).some(usesX);
  }
  return false;
}

/** What "unless its controller pays ..." asks for: "{2}", "{X}", "{1} for each card in your hand", "{2} and 2 life". */
export function parseUnlessPays(text: string, ctx: Ctx): UnlessPays | null {
  let m: RegExpExecArray | null;
  if (text === "{X}") return { cost: "", generic: X };
  if ((m = /^((?:\{(?:\d+|[WUBRGC])\})+)(?: and (\d+) life)?$/.exec(text))) return { cost: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
  if ((m = /^\{(\d+)\} for each (.+)$/.exec(text))) {
    const per = parseCount(m[2]!, ctx, true);
    const generic = per && scaleAmount(Number(m[1]), per);
    return generic === null || generic === undefined ? null : { cost: "", generic };
  }
  return null;
}

/** N for each of something: N times the count. Null if N isn't a plain number. */
export function scaleAmount(n: Amount, per: AmountExpr): Amount | null {
  if (typeof n !== "number") return null;
  if (n === 0) return 0;
  // "-1/-1 for each Swamp": the count times 1, made negative.
  return { count: per.count, times: Math.abs(n) * (per.times ?? 1), ...(per.plus ? { plus: Math.abs(n) * per.plus } : {}), ...(n < 0 ? { negate: true } : {}) };
}

/**
 * "Draw a card for each creature you control", "You gain 2 life for each Elf you control",
 * "Target creature gets +1/+1 until end of turn for each artifact you control". The count is made
 * as it resolves (CR 608.2h). The number before it is what gets multiplied.
 */
function parseForEach(s: string, ctx: Ctx): Effect[] | null {
  const m = /^(.+) for each (.+)$/.exec(s) ?? /^For each (.+?), (.+)$/.exec(s);
  if (!m) return null;
  const [main, phrase] = s.startsWith("For each ") ? [m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1), m[1]!] : [m[1]!, m[2]!];
  const fx = parseSentence(main, ctx);
  if (!fx || fx.length !== 1) return null;
  const per = parseCount(phrase, ctx, true);
  if (!per) return null;
  const scaled = scaleEffect(fx[0]!, per);
  return scaled ? [scaled] : null;
}

/** Multiply an effect's number by a count. */
function scaleEffect(e: Effect, per: AmountExpr): Effect | null {
  const sc = (n: Amount) => scaleAmount(n, per);
  switch (e.type) {
    case "damage": {
      const amount = sc(e.amount);
      return amount === null ? null : { ...e, amount };
    }
    case "draw":
    case "gainLife":
    case "loseLife":
    case "counters":
    case "createToken":
    case "mill":
    case "discard":
    case "scry":
    case "surveil":
    case "preventNext": {
      if (e.type === "counters" && e.perLastKnownCounter) return null;
      const n = sc(e.n);
      return n === null ? null : ({ ...e, n } as Effect);
    }
    case "continuous": {
      if (e.mods.length !== 1 || e.mods[0]!.kind !== "modifyPT") return null;
      const [p, t] = [sc(e.mods[0]!.power), sc(e.mods[0]!.toughness)];
      return p === null || t === null ? null : { ...e, mods: [{ kind: "modifyPT", power: p, toughness: t }] };
    }
    default:
      return null;
  }
}

/**
 * "~ deals damage to target creature equal to the number of lands you control", "You gain life
 * equal to its power", "Draw cards equal to ...": the same as X with X defined as that number.
 */
function parseEqualTo(s: string, ctx: Ctx): Effect[] | null {
  // The count is the last group, except where the text puts it in the middle.
  const forms: [RegExp, (m: RegExpExecArray) => string, number?][] = [
    [/^(.+?) deals damage to (.+) equal to (.+)$/i, (m) => `${m[1]} deals X damage to ${m[2]}`],
    [/^(.+?) deals damage equal to (.+?) to (.+)$/i, (m) => `${m[1]} deals X damage to ${m[3]}`, 2],
    [/^(.+?) (gains?|loses?) life equal to (.+)$/i, (m) => `${m[1]} ${m[2]} X life`],
    [/^(.*?)([Dd]raws?) cards equal to (.+)$/, (m) => `${m[1]}${m[2]} X cards`],
    [/^(.*?)([Mm]ills?) cards equal to (.+)$/, (m) => `${m[1]}${m[2]} X cards`],
    [/^Put a number of ([+-]1\/[+-]1) counters on (.+) equal to (.+)$/i, (m) => `Put X ${m[1]} counters on ${m[2]}`],
    [/^Create a number of (.+) tokens equal to (.+)$/i, (m) => `Create X ${m[1]} tokens`],
  ];
  for (const [re, rewrite, group] of forms) {
    const m = re.exec(s);
    if (!m) continue;
    const fx = parseSentence(rewrite(m), ctx);
    const def = fx && parseCount(m[group ?? m.length - 1]!, ctx);
    return fx && def ? replaceX(fx, def) : null;
  }
  return null;
}

// "Choose one —" and its bulleted modes. Other kinds ("choose one that hasn't been chosen",
// "choose one at random", Escalate, Spree's "+ {cost} —" modes) aren't supported yet.
const MODAL = /^[Cc]hoose (one|two|three|one or both|one or more|up to one) —\s*((?:•[^•]+)+)$/;

/** How many modes each "Choose ..." allows (CR 700.2), given how many there are. */
const MODE_COUNTS: Record<string, (n: number) => [number, number]> = {
  one: () => [1, 1],
  two: () => [2, 2],
  three: () => [3, 3],
  "one or both": () => [1, 2],
  "one or more": (n) => [1, n],
  "up to one": () => [0, 1],
};

function parseModal(count: string, bullets: string, text: string, spell?: boolean): AbilityBody | null {
  const modes: AbilityBody[] = [];
  for (const b of bullets.split("•").map((x) => x.trim()).filter(Boolean)) {
    const body = parseBody(b, { spell });
    if (!body) return null; // every mode has to work, or the card isn't supported
    modes.push(body);
  }
  const [min, max] = MODE_COUNTS[count]!(modes.length);
  if (modes.length < 2 || max > modes.length) return null;
  return { targets: [], effects: [], text, modal: { min, max, modes } };
}

/** "X and Y" where each half is its own effect. */
function parseConjunction(s: string, ctx: Ctx): Effect[] | null {
  const parts = s.split(/,? and (?=(?:you|each|target|draw|~|its|create|put|return|exile|destroy|tap|untap|mill)\b|get (?:\{E\}|\w+ \{E\}|an amount of \{E\}))/i);
  if (parts.length < 2) return null;
  const out: Effect[] = [];
  for (const p of parts) {
    const fx = parseSentence(p.charAt(0).toUpperCase() + p.slice(1), ctx);
    if (!fx) return null;
    out.push(...fx);
  }
  return out;
}

export function addTarget(ctx: Ctx, spec: TargetSpec): number {
  ctx.targets.push(spec);
  ctx.lastCreated = false;
  const i = ctx.targets.length - 1;
  if (spec.kind === "object" || spec.kind === "spell") ctx.lastObjectTarget = i;
  return i;
}
