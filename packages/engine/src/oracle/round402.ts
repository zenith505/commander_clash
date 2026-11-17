// Round 402's sentences (read first by round373Sentence), whole lines (compile.ts) and text rewrites (body.ts): Braided
// Net's "for as long as it remains tapped", Scheming Fence's chosen permanent and Duelist's Flame's granted trigger.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 402's, read before round 401's. */
export function round402Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Braided Net: "Tap another target nonland permanent. Its activated abilities can't be activated for as long as it
  // remains tapped.": that permanent's activated abilities, mana abilities too (CR 605.1a, rulings: even ones whose cost
  // untaps it), for as long as it stays tapped (CR 611.2b), whether it was tapped already or by this (rulings).
  if (plain(s) === "Its activated abilities can't be activated for as long as it remains tapped") {
    const t = ctx.lastObjectTarget;
    const prev = effects[effects.length - 1];
    if (t === undefined || ctx.targets[t]?.kind !== "object" || ctx.targets[t]!.many || ctx.targets[t]!.optional || prev?.type !== "tap" || prev.what.ref !== "target" || prev.what.index !== t) return "fail";
    return { effect: { type: "continuous", what: { ref: "target", index: t }, mods: [{ kind: "cantActivate" }], duration: "whileTapped", whileAffectedTapped: true }, next: si + 1 };
  }
  return null;
}

/**
 * A rewrite of an ability's text before its sentences are read (body.ts). Duelist's Flame's granted trigger: "Exile up to
 * one nonland card from among them and put the rest on the bottom of your library in a random order." is The Key to the
 * Vault's "You may exile a nonland card from among them. Put the rest on the bottom of your library in a random order."
 * (one card or none, CR 107.1c; the rest go to the bottom together, CR 401.4), and "the exiled card" is that card.
 */
export function round402Text(text: string): string {
  return text.replace(
    /\bExile up to one nonland card from among them and put the rest on the bottom of your library in a random order\./,
    "You may exile a nonland card from among them. Put the rest on the bottom of your library in a random order.",
  );
}

/** One whole line of round 402's (compile.ts); false when it isn't one of these. */
export function round402Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Scheming Fence: "As ~ enters, you may choose a nonland permanent." (CR 614.12): any player's, one already on the
  // battlefield, or none (Chosen.object, the object it is then, CR 400.7).
  if (line === "As ~ enters, you may choose a nonland permanent.") {
    if (isSpell || out.entersChooseObject) out.unsupported.push(raw);
    else {
      out.entersChooseObject = { kind: "object", types: [], notTypes: ["Land"], notColors: [], text: "a nonland permanent" };
      out.entersChooseObjectOptional = true;
    }
    return true;
  }
  // Scheming Fence: "~ has all activated abilities of the chosen permanent except for loyalty abilities. You may spend mana
  // as though it were mana of any color to activate those abilities.": as Drana and Linvala's borrowing (CR 613.1f, 609.4b),
  // from the permanent chosen as it entered while it's still that object; mana abilities too (rulings: only activated
  // abilities, "~" in them being this permanent).
  if (line === "~ has all activated abilities of the chosen permanent except for loyalty abilities. You may spend mana as though it were mana of any color to activate those abilities.") {
    if (isSpell || out.borrows) out.unsupported.push(raw);
    else out.borrows = { filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "the chosen permanent" }, chosenObject: true, anyColor: true };
    return true;
  }
  return false;
}
