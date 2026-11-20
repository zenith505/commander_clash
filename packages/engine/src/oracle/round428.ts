// Round 428's whole lines (compile.ts, before round 427's) and sentences (body.ts chain): Ninja Teen's sneak given to the
// creature cards in your graveyard, and Dynaheir, Invoker Adept's haste-like permission and its copy of the next ability
// you spend four or more mana to activate.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseTargetPhrase } from "./targets";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/** A spell filter nothing is checked against: a nextCast about activated abilities only (Dynaheir, `minManaSpent`). */
const NO_SPELL: TargetSpec = { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "ability" };

/** One whole line of round 428's (compile.ts); false when it isn't one of these. */
export function round428Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ninja Teen (level 3): "Creature cards in your graveyard have sneak {3}{B}.": sneak (CR 702.190a) for the creature cards
  // in its controller's graveyard, an alternative cost of their own beside any sneak they have (rulings: either may be
  // used). On its own it lets nothing be cast from there; the next line's permission does.
  const sneak = /^Creature cards in your graveyard have sneak ((?:\{[^}]+\})+)\.$/.exec(line);
  if (sneak) {
    const filter = isSpell ? null : parseTargetPhrase("creature card from a graveyard");
    if (filter?.kind !== "card") return fail(out, raw);
    const { owner: _, ...f } = filter;
    (out.sneakGrants ??= []).push({ filter: { ...f, text: "creature cards" }, mana: sneak[1]! });
    return true;
  }
  // Ninja Teen (level 3): "You may cast creature spells from your graveyard using their sneak abilities.": a permission to
  // cast them from there only for a sneak cost (their own or one given to them, rulings), which doesn't change when they
  // can be cast: during your declare blockers step, returning an unblocked attacker you control (rulings, CR 702.190a).
  if (line === "You may cast creature spells from your graveyard using their sneak abilities.") {
    const filter = isSpell ? null : parseTargetPhrase("creature card from a graveyard");
    if (filter?.kind !== "card") return fail(out, raw);
    const { owner: _, ...f } = filter;
    (out.graveyardGrants ??= []).push({ filter: { ...f, text: "creature cards" }, way: { kind: "permission", costs: [], exile: false, alt: "sneak" } });
    return true;
  }
  // Dynaheir, Invoker Adept: "You may activate abilities of other creatures you control as though those creatures had
  // haste.": Thousand-Year Elixir's permission (CR 302.6), not for its own abilities; they don't gain haste (rulings).
  if (line === "You may activate abilities of other creatures you control as though those creatures had haste.") {
    if (isSpell) return fail(out, raw);
    out.creatureAbilitiesHaste = "others";
    return true;
  }
  return false;
}

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One sentence of an ability's effect (body.ts); null when it isn't one of these, "fail" when it's one we can't do. */
export function round428Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  const line = plain(s);
  // Dynaheir, Invoker Adept: "{T}: When you next activate an ability that isn't a mana ability this turn by spending four or
  // more mana to activate it, copy that ability. You may choose new targets for the copy.": a delayed triggered ability
  // (CR 603.7a), once (603.7c), as its controller next activates an ability that isn't a mana ability (CR 605.1a; rulings: a
  // mana ability doesn't use it up) with four or more mana spent on its costs (CR 602.2b, 601.2h); one with less doesn't
  // use it up. The copy isn't activated, and it resolves first (CR 707.10).
  if (ctx.activated && line === "When you next activate an ability that isn't a mana ability this turn by spending four or more mana to activate it, copy that ability") {
    if (plain(sentences[si + 1]) !== "You may choose new targets for the copy" || sentences.length !== si + 2 || effects.length || ctx.targets.length) return "fail";
    return { effect: { type: "nextCast", filter: NO_SPELL, effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "copy that ability", minManaSpent: 4 }, next: si + 2 };
  }
  return null;
}
