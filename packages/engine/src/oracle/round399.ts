// Round 399's whole lines (compile.ts): permanents with the abilities of cards they exiled. Koh, the Face Stealer ("Choose
// a creature card exiled with ~" and "all activated and triggered abilities of the last chosen card"), Idris, Soul of the
// TARDIS ("exile another artifact you control until ~ leaves the battlefield", then its abilities and +X/+X) and Territory
// Forge ("all activated abilities of the exiled card"). The exile abilities are linked in compile.ts (Myr Welder's
// borrows.linked block); the borrowing is cards.ts lendersOf / withBorrowed.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const ANY_CARD: TargetSpec = { kind: "card", types: [], notTypes: [], notColors: [], text: "the exiled card" };
const CREATURE_CARD: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };

/** One whole line of round 399's (compile.ts); false when it isn't one of these. */
export function round399Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Koh, the Face Stealer: "Pay 1 life: Choose a creature card exiled with ~.": chosen as it resolves (Effect
  // chooseLinkedCard, effects/run-round399.ts) among the cards its exile abilities exiled (CR 607.2a, 607.4).
  if (line === "Pay 1 life: Choose a creature card exiled with ~.") {
    const a = isSpell ? null : parseActivated("Pay 1 life: Draw a card.");
    if (!a || a === "fail" || a.lifeCost !== 1 || a.tap || a.manaCost || a.costs?.length || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "draw") return fail(out, raw);
    const effects: Effect[] = [{ type: "chooseLinkedCard", filter: CREATURE_CARD }];
    out.activated.push({ ...a, body: { targets: [], effects, text: "Choose a creature card exiled with ~." }, text: line });
    return true;
  }
  // Koh: "~ has all activated and triggered abilities of the last chosen card.": the card its choosing ability chose last
  // (CR 607.2d), while that's still the same card in exile (CR 400.7); "~" in them is Koh (as Myr Welder's rulings).
  if (line === "~ has all activated and triggered abilities of the last chosen card.") {
    if (isSpell || out.borrows) return fail(out, raw);
    out.borrows = { filter: { ...CREATURE_CARD, text: "the last chosen card" }, linked: true, triggered: true, chosen: true };
    return true;
  }
  // Idris, Soul of the TARDIS: "When ~ enters, exile another artifact you control until ~ leaves the battlefield.": chosen
  // as it resolves, not targeted (CR 115.1), back when Idris leaves (CR 610.3), nothing exiled if Idris has already left
  // (CR 610.3c), as Yannik, Scavenging Sentinel's (laneb200.ts).
  if (line === "When ~ enters, exile another artifact you control until ~ leaves the battlefield.") {
    const t = isSpell ? null : parseTrigger("When ~ enters, sacrifice another artifact.");
    const pick = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.effects.length !== 1 || t.body.targets.length || pick?.type !== "pick" || pick.action !== "sacrifice" || pick.who.ref !== "you" || !pick.filter.notSource) return fail(out, raw);
    const effects: Effect[] = [{ ...pick, action: "exile", untilSourceLeaves: true, filter: { ...pick.filter, controller: "you", text: "other artifact you control" } }];
    out.triggers.push({ ...t, body: { targets: [], effects, text: "exile another artifact you control until ~ leaves the battlefield." } });
    return true;
  }
  // Idris: "~ has all activated and triggered abilities of the exiled card and gets +X/+X, where X is the exiled card's mana
  // value.": the card its enters ability exiled (CR 607.2a; each of them if it exiled several, CR 607.3), as printed in
  // exile; X its mana value there ({X} as 0, rulings), 0 with none (a token exiled is gone, CR 111.7).
  if (line === "~ has all activated and triggered abilities of the exiled card and gets +X/+X, where X is the exiled card's mana value.") {
    if (isSpell || out.borrows) return fail(out, raw);
    out.borrows = { filter: ANY_CARD, linked: true, triggered: true };
    const mv = { count: { kind: "linkedExiledMv" as const } };
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "modifyPT", power: mv, toughness: mv }], text: "~ gets +X/+X, where X is the exiled card's mana value." });
    return true;
  }
  // Territory Forge: "~ has all activated abilities of the exiled card.": the card its enters ability exiled (CR 607.2a),
  // only its activated abilities, mana abilities among them (a basic land's too, CR 305.6), "~" in them being the Forge
  // (rulings).
  if (line === "~ has all activated abilities of the exiled card.") {
    if (isSpell || out.borrows) return fail(out, raw);
    out.borrows = { filter: ANY_CARD, linked: true };
    return true;
  }
  return false;
}
