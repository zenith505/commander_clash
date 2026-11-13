// Round 349's sentences, read before round 348's (round348Sentence in oracle/round348.ts, which reads these first), and
// its whole lines (compile.ts, after round 348's): each player's upkeep or draw step acting on the top card of their
// library or a card from their hand, which they cast "if able" (Gate to the Aether, Omen Machine, Wild Evocation), and a
// creature goaded for as long as an enchantment stays (Hot Pursuit).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parsePlayer } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const LAND: TargetSpec = { kind: "card", types: ["Land"], notTypes: [], notColors: [], text: "land card" };

export function round349Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  // Gate to the Aether: "that player reveals the top card of their library. If it's an artifact, creature, enchantment, or
  // land card, the player may put it onto the battlefield.": the upkeep's player decides, and it enters under their control
  // (CR 110.2a); anything else stays on top.
  // Omen Machine: "that player exiles the top card of their library. If it's a land card, the player puts it onto the
  // battlefield. Otherwise, the player casts it without paying its mana cost if able.": not optional (rulings); a card
  // that can't be cast, or a land that can't be put onto the battlefield, stays in exile (rulings).
  // Wild Evocation: "that player reveals a card at random from their hand. If it's a land card, the player puts it onto
  // the battlefield. Otherwise, the player casts it without paying its mana cost if able.": the same from the hand
  // (rulings: cast as this resolves, timing for its card type ignored, other restrictions not; one that can't be cast stays
  // in the hand).
  const first = /^[Tt]hat player (reveals the top card of their library|exiles the top card of their library|reveals a card at random from their hand)$/.exec(line);
  if (!ctx.spell && first) {
    const who = parsePlayer("that player", ctx);
    // Only a trigger's player ("each player's upkeep"); "Target opponent ..., then reveals a card at random from their
    // hand" (Hired Torturer) is read elsewhere.
    if (who?.ref !== "eventPlayer") return null;
    const start: Effect = first[1] === "exiles the top card of their library" ? { type: "exileTopAsIt", who } : first[1] === "reveals a card at random from their hand" ? { type: "revealTop", randomFromHand: true, who } : { type: "revealTop", who };
    const put: Effect = { type: "putOntoBattlefield", what: { ref: "revealed" }, under: who };
    const mayPut = /^If it's an? (.+ card), the player may put it onto the battlefield$/.exec(plain(sentences[si + 1]));
    if (mayPut && first[1] === "reveals the top card of their library" && si + 2 === sentences.length) {
      const filter = parseSearchFilter(mayPut[1]!);
      if (filter?.kind !== "card") return "fail";
      effects.push(start);
      return { effect: { type: "if", cond: { kind: "revealedIs", filter }, effects: [{ type: "may", decider: who, effects: [put], text: "put the revealed card onto the battlefield" }] }, next: si + 2 };
    }
    if (first[1] !== "reveals the top card of their library" && plain(sentences[si + 1]) === "If it's a land card, the player puts it onto the battlefield" && plain(sentences[si + 2]) === "Otherwise, the player casts it without paying its mana cost if able" && si + 3 === sentences.length) {
      effects.push(start);
      return { effect: { type: "if", cond: { kind: "revealedIs", filter: LAND }, effects: [put], otherwise: [{ type: "castItIfAble", who }] }, next: si + 3 };
    }
    return null;
  }
  // Alchemist's Gambit: "Take an extra turn after this one. During that turn, damage can't be prevented.": during that
  // extra turn only, every prevention effect stops working (CR 615.12), whoever's damage it is.
  const last = effects[effects.length - 1];
  if (line === "During that turn, damage can't be prevented" && last?.type === "extraTurn" && last.who.ref === "you" && last.n === 1 && !last.noPrevention && !last.loseAtEnd) {
    effects.pop();
    return { effect: { ...last, noPrevention: true }, next: si + 1 };
  }
  // Hot Pursuit: "suspect target creature an opponent controls. As long as ~ remains on the battlefield, that creature is
  // also goaded.": goaded by you (CR 701.15a) for as long as ~ stays; nothing if ~ has already left as this resolves, while
  // the creature is still suspected (rulings, CR 611.2b).
  const prev = effects[effects.length - 1];
  if (!ctx.spell && line === "As long as ~ remains on the battlefield, that creature is also goaded" && prev?.type === "suspect" && !prev.no && prev.what.ref === "target") {
    return { effect: { type: "continuous", what: prev.what, mods: [{ kind: "goad" }], duration: "whileControlled", whileOnBattlefield: true }, next: si + 1 };
  }
  return null;
}

/** Round 349's whole lines: true when the line is one of them (supported, or pushed to `out.unsupported`). */
export function round349Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Hot Pursuit: "At the beginning of combat on your turn, if two or more players have lost the game, gain control of all
  // goaded and/or suspected creatures until end of turn. Untap them. They gain haste until end of turn.": an intervening
  // "if" (CR 603.4), players who left the game counted (CR 800.4a); every creature goaded by anyone, suspected, or both,
  // with nothing to choose (rulings).
  if (line === "At the beginning of combat on your turn, if two or more players have lost the game, gain control of all goaded and/or suspected creatures until end of turn. Untap them. They gain haste until end of turn.") {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    const none = { types: [], notTypes: [], notColors: [] };
    const filter: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], anyOf: [{ kind: "object", ...none, status: "goaded", text: "goaded" }, { kind: "object", ...none, suspected: true, text: "suspected" }], text: "all goaded and/or suspected creatures" };
    out.triggers.push({
      event: "yourBeginCombat",
      ifCond: { kind: "amount", amount: { count: { kind: "players", lostGame: true } }, min: 2 },
      body: {
        targets: [],
        effects: [
          { type: "continuous", what: { ref: "each", filter }, mods: [{ kind: "control" }], duration: "endOfTurn" },
          { type: "untap", what: { ref: "affected" } },
          { type: "continuous", what: { ref: "affected" }, mods: [{ kind: "addKeywords", keywords: ["Haste"] }], duration: "endOfTurn" },
        ],
        text: "gain control of all goaded and/or suspected creatures until end of turn. Untap them. They gain haste until end of turn.",
      },
    });
    return true;
  }
  return false;
}
