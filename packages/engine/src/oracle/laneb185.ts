// Lane B round B185's lines, read by compileCard before its triggers and activated abilities (after round B184's), and
// its sentences, read at the end of round B184's.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parsePunisherOptions } from "./sentences/basics";
import { parseCopyExcept } from "./tokens";
import { parseTrigger } from "./triggers";
import { roundB186Sentence } from "./laneb186";
import { num } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const CREATURE: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB185Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Prince of Thralls: "Whenever a permanent an opponent controls is put into a graveyard, put that card onto the battlefield
  // under your control unless that opponent pays 3 life.": from the battlefield (a permanent is only there), into anyone's
  // graveyard, an opponent its controller as it last existed (rulings); that opponent decides as it resolves (CR 608.2d),
  // and the card returns if they don't, whether you want it or not; nothing returns if it has left the graveyard or was a
  // token (rulings, CR 400.7, 111.7), though they're still asked.
  const thralls = /^Whenever a permanent an opponent controls is put into a graveyard, put that card onto the battlefield under your control unless that opponent (pays \d+ life)\.$/.exec(line);
  if (thralls) {
    const t = parseTrigger("Whenever a permanent an opponent controls is put into a graveyard from the battlefield, put that card onto the battlefield under your control.");
    const put = t && t !== "fail" && t.event === "permanentDies" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const options = parsePunisherOptions(thralls[1]!, {} as Ctx);
    if (!t || t === "fail" || put?.type !== "putOntoBattlefield" || put.what.ref !== "subjectCard" || options?.length !== 1 || !("pay" in options[0]!)) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "punisher", who: { ref: "subjectController" }, options, effects: [put], penalty: "Let {you} put that card onto the battlefield" }], text: line.replace(/^Whenever [^,]+, /, "").replace(/^./, (c) => c.toUpperCase()) } });
    return true;
  }
  // Volcano Hellion: "~ has echo {X}, where X is your life total.": echo (CR 702.30a) whose cost is your life total as the
  // echo trigger resolves, not locked in as it enters (rulings): {1} that many times, {0} with 0 or less.
  if (line === "~ has echo {X}, where X is your life total.") {
    const text = "Echo {X}, where X is your life total: at the beginning of your upkeep, if ~ came under your control since the beginning of your last upkeep, sacrifice it unless you pay {X}.";
    const sacrificeSelf: Effect = { type: "sacrifice", what: { ref: "self" } };
    out.triggers.push({ event: "yourUpkeep", ifEcho: true, body: { targets: [], effects: [{ type: "may", effects: [{ type: "echoPaid" }], pay: { mana: "{1}" }, payTimes: { count: { kind: "life", who: { ref: "you" } } }, otherwise: [sacrificeSelf], keep: true, echo: true, text: "Pay echo {X} (X is your life total) to keep ~" }], text } });
    return true;
  }
  // Volcano Hellion: "When ~ enters, it deals an amount of damage of your choice to you and target creature. The damage
  // can't be prevented.": the number chosen as it resolves, 0 allowed (rulings), the same amount to both at once (one
  // damage event, CR 120.3) and unpreventable (CR 615.12). (Any number may be chosen; 999 is more than can matter.)
  if (line === "When ~ enters, it deals an amount of damage of your choice to you and target creature. The damage can't be prevented.") {
    const n = { count: { kind: "chosenNumber" as const } };
    out.triggers.push({
      event: "selfEnters",
      body: {
        targets: [{ ...CREATURE, text: "target creature" }],
        effects: [
          { type: "choose", choice: "number", range: { min: 0, max: 999 }, prompt: "choose how much damage it deals to you and to the target creature" },
          { type: "damage", amount: n, to: { ref: "you" }, unpreventable: true },
          { type: "damage", amount: n, to: { ref: "target", index: 0 }, unpreventable: true, sameEvent: true },
        ],
        text: "It deals an amount of damage of your choice to you and target creature. The damage can't be prevented.",
      },
    });
    return true;
  }
  return false;
}

export function roundB185Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Haunting Imitation, after "Each player reveals the top card of their library": "For each creature card revealed this
  // way, create a token that's a copy of that card, except it's 1/1, it's a Spirit in addition to its other types, and it
  // has flying.": one copy of each, of the card as printed (CR 707.2), all at once; the cards stay on top (rulings).
  const imitation = /^For each creature card revealed this way, create a token that's a copy of that card, except (.+)$/.exec(s);
  if (imitation) {
    const except = parseCopyExcept(imitation[1]!);
    if (!ctx.parley || effects[effects.length - 1]?.type !== "parleyReveal" || !except) return "fail";
    return { effect: { type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "parleyRevealed", filter: { kind: "card", types: ["Creature"], text: "creature card" } }, each: true, except }, next: si + 1 };
  }
  // Haunting Imitation: "If no creature cards were revealed this way, return ~ to its owner's hand.": the spell itself, as
  // it finishes resolving (as Cerebral Eruption).
  if (s === "If no creature cards were revealed this way, return ~ to its owner's hand") {
    if (!ctx.parley || !ctx.spell) return "fail";
    return { effect: { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "parleyRevealed", creature: true } }, max: 0 }, effects: [{ type: "spellToHand" }] }, next: si + 1 };
  }
  // Bloodbond March: "each player returns all cards with the same name as that spell from their graveyard to the
  // battlefield", in a cast trigger: the name the spell had as it was cast (CR 201.2); each player's own permanent cards
  // (CR 110.4b), all at once, under their control.
  if (/^[Ee]ach player returns all cards with the same name as that spell from their graveyard to the battlefield$/.test(s)) {
    if (!ctx.castSpell) return "fail";
    return { effect: { type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { kind: "card", text: "card with the same name as that spell" }, owners: true, sameNameAsCast: true }, next: si + 1 };
  }
  // Urza's Sylex: "Each player chooses six lands they control. Destroy all other permanents.": each in APNAP order (CR
  // 101.4), then everything else on the battlefield destroyed at once.
  const sylex = /^Each player chooses (\w+) lands they control$/.exec(s);
  if (sylex && plain(sentences[si + 1]) === "Destroy all other permanents") {
    const n = num(sylex[1]!);
    if (!Number.isInteger(n) || n < 1) return "fail";
    const land: TargetSpec = { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "land" };
    return { effect: { type: "keepRest", who: { ref: "eachPlayer" }, keep: [{ filter: land, n }], among: { kind: "object", types: [], notTypes: [], notColors: [], text: "permanent" }, destroy: true }, next: si + 2 };
  }
  // Mirror Match: "For each creature attacking you or a planeswalker you control, create a token that's a copy of that
  // creature and that's blocking that creature. Exile those tokens at end of combat.": the delayed trigger exiles each of
  // them at end of combat whatever happens to the originals (rulings, CR 603.7).
  if (s === "For each creature attacking you or a planeswalker you control, create a token that's a copy of that creature and that's blocking that creature" && plain(sentences[si + 1]) === "Exile those tokens at end of combat") {
    if (!ctx.spell) return "fail";
    effects.push({ type: "copiesBlockingAttackers" });
    return { effect: { type: "delayed", when: "endOfCombat", each: "created", effects: [{ type: "exile", what: { ref: "subject" } }], text: "exile ~" }, next: si + 2 };
  }
  // Manifold Insights: "Reveal the top ten cards of your library. Starting with the next opponent in turn order, each
  // opponent chooses a different nonland card from among them. Put the chosen cards into your hand and the rest on the
  // bottom of your library in a random order."
  const insights = /^Reveal the top (\w+) cards of your library$/.exec(s);
  if (insights && plain(sentences[si + 1]) === "Starting with the next opponent in turn order, each opponent chooses a different nonland card from among them" && plain(sentences[si + 2]) === "Put the chosen cards into your hand and the rest on the bottom of your library in a random order") {
    const n = num(insights[1]!);
    if (!Number.isInteger(n) || n < 1) return "fail";
    return { effect: { type: "opponentsChooseFromTop", n, filter: { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "nonland card" } }, next: si + 3 };
  }
  return roundB186Sentence(s, sentences, si, ctx, effects);
}
