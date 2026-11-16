// Round 390's sentences (read first by round373Sentence) and whole lines (compile.ts): every permanent you own shuffled
// away and replaced from the top of your library (Glimpse of Tomorrow), a search with three places for the cards found
// (Verdant Mastery), an exile of itself on its last time counter with an extra turn after it (Regenerations Restored),
// and a color chosen each time it becomes attached (Sanctuary Blade).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseStatic } from "./statics";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** A sentence of round 390's, read before round 389's. */
export function round390Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  // Regenerations Restored: "Then if ~ has no time counters on it, exile it. When you do, take an extra turn after this
  // one.": checked as the trigger resolves (CR 608.2c), of ~ as the object it is now (CR 400.7): once it has left the
  // battlefield (its vanishing sacrifice resolved first) it can't be exiled from there, and with no exile there's no
  // reflexive trigger (CR 603.12). The reflexive trigger goes on the stack the next time a player would receive priority,
  // above anything still waiting there (vanishing's sacrifice trigger), so the extra turn is taken (CR 500.7).
  if (line === "If ~ has no time counters on it, exile it" && plain(sentences[si + 1]) === "When you do, take an extra turn after this one" && sentences.length === si + 2) {
    if (!ctx.selfIt || ctx.spell || ctx.activated || ctx.targets.length) return "fail";
    const extra: Effect = { type: "reflexive", body: { targets: [], effects: [{ type: "extraTurn", who: { ref: "you" }, n: 1 }], text: "Take an extra turn after this one." } };
    return {
      effect: { type: "if", cond: { kind: "state", cond: { kind: "selfCounters", counter: "time", min: 0, max: 0 } }, effects: [{ type: "if", cond: { kind: "selfHere" }, effects: [{ type: "exile", what: { ref: "self" } }, extra] }] },
      next: si + 2,
    };
  }
  void effects;
  return null;
}

/** One whole line of round 390's (compile.ts); false when it isn't one of these. */
export function round390Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Glimpse of Tomorrow: the whole instruction is one effect (Effect glimpseOfTomorrow, effects/run-round390.ts).
  if (line === "Shuffle all permanents you own into your library, then reveal that many cards from the top of your library. Put all non-Aura permanent cards revealed this way onto the battlefield, then do the same for Aura cards, then put the rest on the bottom of your library in a random order.") {
    if (!isSpell || out.spell) return fail(out, raw);
    out.spell = { targets: [], effects: [{ type: "glimpseOfTomorrow" }], text: line };
    return true;
  }
  // Verdant Mastery: up to four basic land cards found and revealed (CR 701.23); with the {3}{G} alternative cost paid
  // (CR 118.9, SpellCondition altPaid; a copy of it too, rulings) the first one goes onto the battlefield tapped under an
  // opponent's control, chosen as it resolves (rulings, CR 608.2d), before the search, then two under yours, the rest into
  // your hand; otherwise two under yours and the rest into your hand. The searcher chooses which card goes where (the
  // order the cards are found in); with fewer found, they go to the places in the order given.
  if (line === "Search your library for up to four basic land cards and reveal them. Put one of them onto the battlefield tapped under an opponent's control if the {3}{G} cost was paid. Put two of them onto the battlefield tapped under your control and the rest into your hand. Then shuffle.") {
    if (!isSpell || out.spell || !out.altCosts?.some((a) => a.kind === "alternative" && a.mana === "{3}{G}")) return fail(out, raw);
    const filter = parseSearchFilter("basic land card");
    if (!filter) return fail(out, raw);
    const base = { type: "search" as const, filter, n: 4, upTo: true, reveal: true, others: { zone: "hand" as const } };
    const paid: Effect[] = [{ type: "choose", choice: "opponent" }, { ...base, dest: { zone: "battlefield", tapped: true, under: { ref: "chosenPlayer" } }, firstN: 1, second: { n: 2, dest: { zone: "battlefield", tapped: true } } }];
    const unpaid: Effect[] = [{ ...base, dest: { zone: "battlefield", tapped: true }, firstN: 2 }];
    out.spell = { targets: [], effects: [{ type: "if", cond: { kind: "altPaid", alt: "alternative" }, effects: paid, otherwise: unpaid }], text: line };
    return true;
  }
  // Sanctuary Blade: "As ~ becomes attached to a creature, choose a color." (CompiledCard.attachChooseColor, asked by
  // game.ts askAttachColor each time it becomes attached to a creature).
  if (line === "As ~ becomes attached to a creature, choose a color.") {
    if (isSpell || out.attachChooseColor) return fail(out, raw);
    out.attachChooseColor = true;
    return true;
  }
  // Sanctuary Blade: "Equipped creature gets +2/+0 and has protection from the last chosen color.": the color its "as ~
  // becomes attached" chose most recently (Chosen.color, replaced each time); none chosen, no protection (rulings).
  if (line === "Equipped creature gets +2/+0 and has protection from the last chosen color.") {
    const st = !isSpell && out.attachChooseColor ? parseStatic("Equipped creature gets +2/+0 and has protection from the chosen color.") : null;
    if (!st || st.affects.kind !== "attached") return fail(out, raw);
    out.statics.push({ ...st, text: line });
    return true;
  }
  return false;
}

/**
 * Regenerations Restored: its trigger on time counters removed and vanishing's "When the last time counter is removed
 * from ~, sacrifice it" trigger together on the last counter, and go on the stack in the order its controller chooses (CR
 * 603.3b). The engine doesn't ask; the time-counter trigger resolves first (TriggeredAbility.resolveFirst, as Warping
 * Wurm's), as its controller would have it: the other order sacrifices ~ first, so it can't be exiled and there's no extra
 * turn, and either way ~ leaves the battlefield.
 */
export function markExileBeforeVanishing(out: CompiledCard): void {
  if (!out.triggers.some((t) => t.event === "selfLastTimeCounterRemoved")) return;
  const i = out.triggers.findIndex((t) => t.event === "selfCountersRemoved" && t.countersKind === "time" && JSON.stringify(t.body.effects).includes('"extraTurn"') && JSON.stringify(t.body.effects).includes('"exile","what":{"ref":"self"}'));
  if (i >= 0) out.triggers[i] = { ...out.triggers[i]!, resolveFirst: true };
}
