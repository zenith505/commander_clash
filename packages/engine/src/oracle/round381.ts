// Round 381's whole lines: a Saga whose chapters note creature types for the next creature spell of each (Long List of
// the Ents).
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { parseTargetPhrase } from "./targets";

const CORAM = "During each of your turns, you may play a land and cast a spell from among cards in graveyards that were put there from libraries this turn.";
const SOKRATES = "If ~ would deal combat damage to a player, prevent that damage. ~'s controller and that player each draw half that many cards, rounded down.";

/** A whole line of round 381's (compile.ts, after round 380's). */
export function round381Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Sokrates, Athenian Teacher's granted ability: a prevention effect for this creature's combat damage to a player (CR
  // 615.1a) with an additional effect (CR 615.5): its controller and that player each draw half the damage, rounded down,
  // even if the damage can't be prevented (rulings, CR 615.12). See staticRules in damage.ts.
  if (line === SOKRATES) {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    out.combatToPlayerDrawsHalf = (out.combatToPlayerDrawsHalf ?? 0) + 1;
    return true;
  }
  // Coram, the Undertaker: during each of your turns, a land play and a spell, once each for each Coram (as Muldrotha's,
  // rulings), from any graveyard, cards you don't own too; only a card put into that graveyard from a library this turn (as
  // the object it is, CR 400.7). All costs are paid and timing rules followed; another permission doesn't use this one up
  // (rulings). A land played this way enters under your control (CR 305.1, 110.2); a spell cast this way is yours (CR
  // 601.2a) and goes to its owner's graveyard (CR 400.3).
  if (line === CORAM) {
    const filter = isSpell ? undefined : parseTargetPhrase("nonland card from a graveyard");
    if (filter?.kind !== "card") {
      out.unsupported.push(raw);
      return true;
    }
    const { owner: _, ...f } = filter;
    (out.graveyardGrants ??= []).push({ filter: { ...f, text: "cards put there from libraries this turn" }, way: { kind: "turnPermission", costs: [], exile: false }, yourTurn: true, once: [""], arrived: "fromLibrary", anyGraveyard: true });
    out.landFromGraveyardOnce = true;
    out.landFromGraveyardArrived = "fromLibrary";
    out.landFromAnyGraveyard = true;
    return true;
  }
  return false;
}

const ENTS = "Note a creature type that hasn't been noted for ~. When you next cast a creature spell of that type this turn, that creature enters with an additional +1/+1 counter on it.";

/** A Saga chapter's effect (compile.ts, the Sagas): a body, null when it should be supported but isn't, undefined when not this round's. */
export function round381Chapter(text: string): AbilityBody | null | undefined {
  // Long List of the Ents: each chapter notes a creature type as it resolves (CR 608.2d), any creature type (CR 205.3m)
  // not noted yet for the Saga as this object (GameState.notedFor; a new object has none, CR 400.7). Then a delayed
  // trigger (CR 603.7): the next creature spell of that type you cast this turn, a changeling's spell too (CR 702.73a);
  // that creature enters with the counter (CR 614.1c). It's created even if the Saga is gone by then (CR 603.7c).
  if (text === ENTS) {
    const next = parseBody("When you next cast a creature spell this turn, that creature enters with an additional +1/+1 counter on it.", {});
    const e = next?.targets.length === 0 && next.effects.length === 1 ? next.effects[0] : undefined;
    if (e?.type !== "nextCast" || e.filter.types?.join() !== "Creature" || e.filter.subtypes?.length || e.effects.length !== 1 || e.effects[0]!.type !== "spellEntersWith") return null;
    return { targets: [], effects: [{ type: "noteCreatureType", any: true }, { ...e, ofNoted: true, text: "that creature enters with an additional +1/+1 counter on it" }], text };
  }
  return undefined;
}
