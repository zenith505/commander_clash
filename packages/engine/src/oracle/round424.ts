// Round 424's whole lines (compile.ts, before round 423's): Swindler's Scheme's cast trigger, Dack Fayden, Helping
// Hand's enters trigger and Emissary of Grudges's new targets.
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const SCHEME = "Whenever an opponent casts a spell from their hand, you may reveal the top card of your library. If it shares a card type with that spell, counter that spell and that opponent may cast the revealed card without paying its mana cost.";

const DACK = "When ~ enters, reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield, then shuffle. They're goaded for the rest of the game. For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen.";

const EMISSARY = "Reveal the player you chose: Choose new targets for target spell or ability if it's controlled by the chosen player and if it targets you or a permanent you control. Activate only once.";

/** One whole line of round 424's (compile.ts); false when it isn't one of these. */
export function round424Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Swindler's Scheme: an opponent's spell cast from their hand (a copy isn't cast, CR 707.10). You decide whether to
  // reveal without looking first (rulings; CR 608.2d), then Effect revealTopCounterSharing: if the card shares a card
  // type with that spell (CR 205.2a), the spell is countered (CR 701.6a) and its caster may cast the revealed card as this
  // resolves, free (CR 608.2g); otherwise the card stays on top.
  if (line === SCHEME) {
    const t = isSpell ? null : parseTrigger("Whenever an opponent casts a spell from their hand, you may draw a card.");
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "opponent" || t.cast.from !== "hand" || t.cast.orCopy || t.cast.nth || t.body.effects[0]?.type !== "may") return fail(out, raw);
    const effects: Effect[] = [{ type: "may", effects: [{ type: "revealTopCounterSharing" }], text: "reveal the top card of your library" }];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  // Dack Fayden, Helping Hand: X is the number of opponents as it resolves (players still in the game, CR 102.3, 800.4a),
  // the whole library revealed if it has fewer creature cards (CR 701.20a). Those creature cards enter at once under your
  // control (an Aura isn't a creature card), then the library is shuffled (CR 701.24a). They're goaded by you for the rest
  // of the game (CR 701.15a-b: each combat they attack, a player other than you if able; rulings: still so after you leave
  // the game). Then you choose a different opponent for each (CR 608.2d), and each opponent gains control of theirs, for
  // the rest of the game (CR 613.1b, 611.2a); goaded by you all the same.
  if (line === DACK) {
    const t = isSpell ? null : parseTrigger("When ~ enters, draw a card.");
    const creature = parseSearchFilter("creature card");
    if (!t || t === "fail" || t.event !== "selfEnters" || !creature) return fail(out, raw);
    const effects: Effect[] = [
      { type: "revealUntil", filter: creature, found: "battlefield", rest: "shuffle", n: { count: { kind: "players", opponents: true } }, remember: true },
      { type: "continuous", what: { ref: "created" }, mods: [{ kind: "goad" }], duration: "game" },
      { type: "giveEachToDifferentOpponent" },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  // Emissary of Grudges: "Reveal the player you chose" is a cost, payable only with an opponent chosen as it entered
  // (rulings: not for one that became a copy of it or changed control). Any spell or ability can be targeted; only if it's
  // still controlled by the chosen player and still targets you or a permanent you control as this resolves (CR 608.2b-c;
  // rulings: one such target among several is enough) do you choose new targets for it, any of them left unchanged (CR
  // 115.7d). Once for this object (CR 602.5b; rulings: a new object may again).
  if (line === EMISSARY) {
    const a = isSpell || !out.entersChooseSecret ? null : parseActivated("Reveal the player you chose: You may choose new targets for target spell or ability. Activate only once.");
    const nt = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || !a.revealChosen || !a.onceEver || a.body.targets.length !== 1 || a.body.targets[0]!.kind !== "spell" || a.body.targets[0]!.stackAbilities !== "both" || nt?.type !== "newTargets" || nt.index !== 0) return fail(out, raw);
    const effects: Effect[] = [{ type: "if", cond: { kind: "targetItemOfChosenTargetsYou", index: 0 }, effects: [nt] }];
    out.activated.push({ ...a, body: { ...a.body, effects, text: line.slice(line.indexOf(": ") + 2, line.lastIndexOf(" Activate")) }, text: line });
    return true;
  }
  return false;
}
