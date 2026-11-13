// Lane B round B184's lines, read by compileCard before its triggers and activated abilities (after round B183's), and
// its sentences, read at the end of round B183's.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { reflexiveBody } from "./body";
import { roundB185Sentence } from "./laneb185";
import { parseSentence } from "./sentence";

type Found = { effect: Effect; next: number } | "fail" | null;

const CREATURE: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** Kathril, Aspect Warper's keywords, in its order. */
const KATHRIL = ["flying", "first strike", "double strike", "deathtouch", "hexproof", "indestructible", "lifelink", "menace", "reach", "trample", "vigilance"];

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB184Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Kathril, Aspect Warper: "When ~ enters, put a flying counter on any creature you control if a creature card in your
  // graveyard has flying. Repeat this process for first strike, ..., and vigilance. Then put a +1/+1 counter on ~ for each
  // counter put on a creature this way.": all as it resolves, no player acting in between (rulings).
  const kathril = /^When ~ enters, put a flying counter on any creature you control if a creature card in your graveyard has flying\. Repeat this process for (.+), and ([a-z ]+)\. Then put a \+1\/\+1 counter on ~ for each counter put on a creature this way\.$/.exec(line);
  if (kathril) {
    const kinds = ["flying", ...kathril[1]!.split(", "), kathril[2]!];
    if (kinds.join() !== KATHRIL.join()) out.unsupported.push(raw);
    else out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "keywordCountersFromYard", keywords: kinds }], text: line.replace(/^When ~ enters, /, "").replace(/^./, (c) => c.toUpperCase()) } });
    return true;
  }
  // Curse of Inertia: "Whenever a player attacks enchanted player with one or more creatures, that attacking player may tap
  // or untap target permanent of their choice.": once for the attack, not for one on their planeswalkers (rulings, as Curse
  // of Shallow Graves); the attacking player is the active player (CR 506.2), who chooses the target as it's put on the
  // stack though the Curse's controller controls the ability (rulings: hexproof is checked against that controller), and
  // decides as it resolves.
  if (line === "Whenever a player attacks enchanted player with one or more creatures, that attacking player may tap or untap target permanent of their choice." && out.enchant?.kind === "player") {
    out.triggers.push({ event: "enchantedPlayerAttacked", body: { targets: [{ kind: "object", chosenBy: "activePlayer", text: "target permanent of the attacking player's choice" }], effects: [{ type: "tapOrUntap", what: { ref: "target", index: 0 }, may: true, by: { ref: "activePlayer" } }], text: "That attacking player may tap or untap target permanent of their choice." } });
    return true;
  }
  // Oppressive Rays: "Activated abilities of enchanted creature cost {3} more to activate." Gloom: "Activated abilities of
  // white enchantments cost {3} more to activate." Mana abilities too (CR 605.1a: they're activated abilities); generic
  // mana added to the total cost (CR 602.2b applies 601.2f, rulings).
  const tax = /^Activated abilities of (enchanted creature|white enchantments) cost \{(\d+)\} more to activate\.$/.exec(line);
  if (tax) {
    const host = tax[1] === "enchanted creature";
    if (host && out.enchant?.kind !== "object") out.unsupported.push(raw);
    else (out.activationTaxes ??= []).push({ ...(host ? { host: true as const } : { filter: { kind: "object", types: ["Enchantment"], notTypes: [], notColors: [], colors: ["W"], text: "white enchantment" } }), n: Number(tax[2]), manaToo: true, text: line });
    return true;
  }
  return false;
}

export function roundB184Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Friend or foe ("each friend" and "each foe" were made "each player who chose friend/foe" in body.ts).
  // Regna's Sanction: "Each friend puts a +1/+1 counter on each creature they control."
  const counters = /^Each player who chose ([a-z]+) puts a \+1\/\+1 counter on each creature they control$/.exec(s);
  if (counters) {
    if (!ctx.chooseWords?.includes(counters[1]!)) return "fail";
    return { effect: { type: "playersPutCounterEach", who: { ref: "choseWord", option: counters[1]! }, counter: "+1/+1", filter: CREATURE }, next: si + 1 };
  }
  // Regna's Sanction: "Each foe chooses one untapped creature they control, then taps the rest.": each in APNAP order,
  // seeing the earlier choices, then every other creature those players control is tapped at once (rulings); none to
  // choose with no untapped creature.
  // (The sentence comes split at ", then".)
  const keep = /^Each player who chose ([a-z]+) chooses one untapped creature they control$/.exec(s);
  if (keep && plain(sentences[si + 1]) === "Taps the rest") {
    if (!ctx.chooseWords?.includes(keep[1]!)) return "fail";
    return { effect: { type: "keepRest", who: { ref: "choseWord", option: keep[1]! }, keep: [{ filter: { ...CREATURE, tapped: false, text: "untapped creature" }, n: 1 }], among: CREATURE, tap: true }, next: si + 2 };
  }
  // Zndrsplt's Judgment: "Each friend creates a token that's a copy of a creature they control.": each in APNAP order
  // chooses one (not targeted), then each creates a copy of theirs at once (rulings, CR 707.2); none with no creature.
  const copy = /^Each player who chose ([a-z]+) creates a token that's a copy of a creature they control$/.exec(s);
  if (copy) {
    if (!ctx.chooseWords?.includes(copy[1]!)) return "fail";
    // The pick puts each player's chosen creature in Resolving.created; each copy is its controller's.
    effects.push({ type: "pick", who: { ref: "choseWord", option: copy[1]! }, filter: CREATURE, n: 1, action: "choose" });
    return { effect: { type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "created" }, each: true, eachController: true }, next: si + 1 };
  }
  // The Fugitive Doctor: "target instant or sorcery card in your graveyard gains flashback {2}{R}{G} until end of turn":
  // flashback with this cost, not the card's mana cost (CR 702.34a; round 340's grant), so with it X is 0 (rulings).
  const fixed = /^(target instant or sorcery card in your graveyard) gains flashback ((?:\{[0-9WUBRGC]\})+) until end of turn$/i.exec(plain(s));
  if (fixed && !ctx.spell) {
    const fx = parseSentence(`${fixed[1]} gains flashback with its mana cost until end of turn`, ctx);
    const grant = fx?.length === 1 && fx[0]!.type === "grantFlashback" && fx[0]!.what?.ref === "target" ? fx[0]! : undefined;
    if (grant?.type !== "grantFlashback") return "fail";
    return { effect: { ...grant, mana: fixed[2]!.toUpperCase() }, next: si + 1 };
  }
  // Feral Encounter: "You may cast the exiled card this turn" after looking at the top cards and exiling a creature card
  // from among them: cast only (CR 601.3), the usual timing rules applying.
  if (s === "You may cast the exiled card this turn") {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "dig" || prev.into !== "exile" || prev.play || prev.count !== 1 || !prev.filter?.types?.length || prev.filter.types.includes("Land")) return "fail";
    effects.pop();
    return { effect: { ...prev, play: "thisTurn", playCast: true }, next: si + 1 };
  }
  // Feral Encounter: "At the beginning of the next combat phase this turn, target creature you control deals damage equal
  // to its power to up to one target creature you don't control.": a delayed trigger (CR 603.7), its targets chosen as it's
  // put on the stack (rulings); none if no combat phase is left this turn (rulings).
  const combat = /^At the beginning of the next combat phase this turn, (.+)$/.exec(s);
  if (combat) {
    const body = reflexiveBody(plain(combat[1]), ctx);
    if (!body?.effects.length) return "fail";
    return { effect: { type: "delayed", when: "nextBeginCombat", thisTurn: true, effects: body.effects, targets: body.targets, text: plain(combat[1]) }, next: si + 1 };
  }
  return roundB185Sentence(s, sentences, si, ctx, effects);
}
