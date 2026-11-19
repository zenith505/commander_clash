// Round 417's sentences (round373Sentence in oracle/round373.ts reads these first) and whole lines (compile.ts, before
// round 416's): Helm of Kaldra's Kaldra token, made only while you control all three Kaldra Equipment, with those
// Equipment attached to it, and Lodestone Bauble's player chosen as it's activated, even with no target.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import type { Ctx } from "./body";
import { parseBody } from "./body";
import { parseTargetPhrase } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");
const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const KALDRA = ["Helm of Kaldra", "Sword of Kaldra", "Shield of Kaldra"];

export function round417Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  const line = plain(s);
  // Helm of Kaldra: "If you control Equipment named Helm of Kaldra, Sword of Kaldra, and Shield of Kaldra, create Kaldra, a
  // legendary 4/4 colorless Avatar creature token. Attach those Equipment to it." The names are names (the Oracle text
  // keeps "Helm of Kaldra" rather than "this Equipment"), not a reference to this object (CR 201.5): any Equipment you
  // control with each name will do, checked only as it resolves (rulings: "The token isn't put onto the battlefield unless
  // you control all three Equipment when the ability resolves"), a face-down permanent having no name (CR 708.2). Then
  // each Equipment you control with one of those names is attached to the token (CR 701.3a), one that can't be staying
  // where it is (CR 701.3b). Judgment call: with the legend rule each name is normally one permanent; if you control two
  // with one name (the legend rule not applying), "those Equipment" are all of them, each being Equipment you control with
  // one of those names. The token is the first one created (as living weapon's "attach it to it", zones.ts).
  if (line === "If you control Equipment named ~, Sword of Kaldra, and Shield of Kaldra, create Kaldra, a legendary 4/4 colorless Avatar creature token" && plain(sentences[si + 1]) === "Attach those Equipment to it" && !ctx.spell) {
    const base = parseTargetPhrase("Equipment you control");
    const make = parseBody("Create Kaldra, a legendary 4/4 colorless Avatar creature token.");
    const token = make?.effects[0];
    if (base?.kind !== "object" || !base.subtypes?.includes("Equipment") || base.controller !== "you" || make?.targets.length || make?.effects.length !== 1 || token?.type !== "createToken" || token.token.name !== "Kaldra" || !token.token.legendary) return "fail";
    const named = (name: string): TargetSpec => ({ ...base, named: name, text: `Equipment you control named ${name}` });
    return {
      effect: {
        type: "if",
        cond: { kind: "state", cond: { kind: "allOf", conds: KALDRA.map((name) => ({ kind: "control" as const, who: "you" as const, filter: named(name), min: 1 })) } },
        effects: [token, { type: "attachAll", filter: { ...base, anyOf: KALDRA.map(named), text: "Equipment you control named Helm of Kaldra, Sword of Kaldra, or Shield of Kaldra" }, toCreated: true }],
      },
      next: si + 2,
    };
  }
  return null;
}

const BAUBLE = "{1}, {T}, Sacrifice ~: Put up to four target basic land cards from a player's graveyard on top of their library in any order. That player draws a card at the beginning of the next turn's upkeep.";

/** One whole line of round 417's (compile.ts); false when it isn't one of these. */
export function round417Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Lodestone Bauble: the cards all from one player's graveyard (as "from a single graveyard", TargetSpec.singleGraveyard),
  // put on top of their owner's library (CR 400.3), in the order that player arranges them, being put there at the same
  // time (CR 401.4, as for any such card in this engine); "that player" is chosen as
  // it's activated even with no target (rulings: "If you choose zero targets, you still choose a player"), the owner of
  // the cards if there are any (ActivatedAbility.choosesYardPlayer, StackItem.yardPlayer). They draw at the beginning of
  // the next turn's upkeep (a delayed trigger, CR 603.7), whether or not the cards are still legal targets as it resolves,
  // unless none is (CR 608.2b: then the ability does nothing at all).
  if (line === BAUBLE) {
    const a = isSpell ? null : parseActivated("{1}, {T}, Sacrifice ~: Put up to four target basic land cards from a single graveyard on top of its owner's library.");
    const draw = parseBody("Target player draws a card at the beginning of the next turn's upkeep.");
    const put = a && a !== "fail" ? a.body.effects[0] : undefined;
    const later = draw?.effects[0];
    if (!a || a === "fail" || !a.tap || !a.sacrificeSelf || a.body.effects.length !== 1 || put?.type !== "putInLibrary" || put.position !== "top" || a.body.targets.length !== 4 || a.body.targets.some((t) => t.kind !== "card" || !t.optional) || draw?.targets.length !== 1 || draw.effects.length !== 1 || later?.type !== "delayed" || later.when !== "nextTurnUpkeep" || later.event?.player?.ref !== "target") return fail(out, raw);
    const delayed: Effect = { ...later, event: { ...later.event, player: { ref: "yardPlayer" } }, text: "That player draws a card" };
    out.activated.push({ ...a, choosesYardPlayer: true, body: { ...a.body, effects: [put, delayed], text: line.slice("{1}, {T}, Sacrifice ~: ".length) }, text: line });
    return true;
  }
  return false;
}
