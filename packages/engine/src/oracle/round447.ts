// Round 447's whole lines (compile.ts, before round 446's): Battlefield Thaumaturge's "{1} less for each creature it
// targets" on instant and sorcery spells, and Captain America, First Avenger's "Unattach an Equipment from ~" for damage
// equal to its mana value, divided.
import type { AmountExpr, CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/** One whole line of round 447's (compile.ts); false when it isn't one of these. */
export function round447Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Battlefield Thaumaturge: "Each instant and sorcery spell you cast costs {1} less to cast for each creature it targets."
  // A cost reduction worked out after the targets are chosen (CR 601.2c, 601.2f), generic mana only, and not the spell's
  // mana cost or mana value (rulings); each target that's a creature counts, one targeted twice twice (rulings: "{1} per
  // target creature, even if the spell targets a creature more than once"), creatures on the battlefield only (CR 109.2).
  const thaumaturge = /^Each instant and sorcery spell you cast costs \{(\d+)\} less to cast for each creature it targets\.$/.exec(line);
  if (thaumaturge) {
    out.perTargetCost = [...(out.perTargetCost ?? []), { opponents: false, n: -Number(thaumaturge[1]), creatures: true, spellTypes: ["Instant", "Sorcery"] }];
    return true;
  }
  // Captain America, First Avenger: "Throw ... — {3}, Unattach an Equipment from ~: He deals damage equal to that
  // Equipment's mana value divided as you choose among one, two, or three targets." ("Throw ..." a flavor word, CR 207.2d,
  // taken off in compile.ts; "He" is ~, CR 201.5.) Which Equipment is unattached is chosen as it's activated and paid as
  // its cost (CR 602.2b, 601.2h; CostChoices.unattachEquipment), any Equipment attached to it; the amount is that
  // Equipment's mana value then (CR 202.3, an X in its cost counting 0, CR 202.3e), the ability's X (definedX), divided
  // among one to three targets with at least 1 each (CR 601.2d), so an Equipment with mana value 0 can't be the one, and
  // one with mana value 1 or 2 leaves room for that many targets only.
  if (line === "{3}, Unattach an Equipment from ~: ~ deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.") {
    const a = parseActivated("{3}: ~ deals 3 damage divided as you choose among one, two, or three targets.");
    const dmg = a && a !== "fail" ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || a.body.targets.length !== 3 || !a.body.targets.every((t) => t.divided?.total === 3) || a.body.effects.length !== 1 || dmg?.type !== "damage" || !dmg.divided) return fail(out, raw);
    const x: AmountExpr = { count: { kind: "x" } };
    const divided = { ...a.body.targets[0]!.divided!, total: 0, amount: x };
    out.activated.push({ ...a, unattachEquipment: true, body: { ...a.body, targets: a.body.targets.map((t) => ({ ...t, divided })), effects: [{ ...dmg, amount: x }], text: line.slice(line.indexOf(": ") + 2) }, text: line });
    return true;
  }
  return false;
}
