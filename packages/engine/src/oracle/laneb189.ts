// Lane B round B189's lines, read by compileCard before its triggers and activated abilities (after round B186's), and
// its sentences, read at the end of round B186's.
import type { CompiledCard, Effect } from "../abilities";
import { addTarget, type Ctx } from "./body";
import { parseSentence } from "./sentence";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB189Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Thought Prison: "When ~ enters, you may have target player reveal their hand. If you do, choose a nonland card from it
  // and exile that card.": the target chosen as it triggers (CR 603.3d), the rest only if you choose to as it resolves
  // (CR 608.2c, 608.2d); you choose the card, and none with only lands there.
  if (line === "When ~ enters, you may have target player reveal their hand. If you do, choose a nonland card from it and exile that card.") {
    const t = parseTrigger("When ~ enters, target player reveals their hand. You choose a nonland card from it. Exile that card.");
    const fx = t && t !== "fail" ? t.body.effects : [];
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.targets.length !== 1 || fx.length !== 2 || fx[0]!.type !== "lookAtHand" || fx[1]!.type !== "takeFromHand" || fx[1]!.action !== "exile") out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, effects: [{ type: "may", effects: fx, text: "have target player reveal their hand, then choose a nonland card from it and exile that card" }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Thought Prison: "Whenever a player casts a spell that shares a color or mana value with the exiled card, ~ deals 2 damage
  // to that player.": the card its imprint ability exiled (linked in compile.ts, CR 607.2a), compared as the spell is cast
  // (CR 603.2), once whether it shares one or both (rulings).
  const prison = /^Whenever a player casts a spell that shares a color or mana value with the exiled card, (~ deals \d+ damage to that player\.)$/.exec(line);
  if (prison) {
    const t = parseTrigger(`Whenever a player casts a spell, ${prison[1]}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.orCopy || t.ifCond || t.cast.from) out.unsupported.push(raw);
    else out.triggers.push({ ...t, cast: { ...t.cast, sharesColorOrMvWithLinked: true } });
    return true;
  }
  // Soulcipher Board: "Whenever a creature card is put into your graveyard from anywhere, remove an omen counter from ~.
  // Then if it has no omen counters on it, transform it.": "it" is ~ (not the card), checked as it resolves; one trigger
  // for each card (CR 603.2c), never a token (rulings, CR 111.7).
  const omen = /^Whenever a creature card is put into your graveyard from anywhere, remove an? ([a-z]+) counter from ~\. Then if it has no \1 counters on it, transform it\.$/.exec(line);
  if (omen) {
    const t = parseTrigger(`Whenever a creature card is put into your graveyard from anywhere, remove a ${omen[1]} counter from ~. If there are no ${omen[1]} counters on ~, transform ~.`);
    if (!t || t === "fail" || t.event !== "batch" || !t.batch?.each) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...t.body, text: line.replace(/^Whenever [^,]+, /, "") } });
    return true;
  }
  // Kianne, Dean of Substance: "{4}{G}: Create a 0/0 green and blue Fractal creature token. Put a +1/+1 counter on it for each
  // different mana value among nonland cards you own in exile with study counters on them.": the created token, counted as
  // it resolves, whatever exiled those cards (rulings).
  const fractal = /^(.+: Create a 0\/0 [^.]+ creature token\. Put a \+1\/\+1 counter on it for each different mana value among nonland cards) you own in exile with ([a-z]+) counters on them\.$/.exec(line);
  if (fractal) {
    const a = parseActivated(`${fractal[1]} in your graveyard.`);
    const e = a && a !== "fail" && a.body.effects.length === 2 ? a.body.effects[1]! : undefined;
    const n = e?.type === "counters" && typeof e.n === "object" && "count" in e.n ? e.n : undefined;
    if (!a || a === "fail" || e?.type !== "counters" || e.what.ref !== "created" || n?.count.kind !== "graveyardManaValues") out.unsupported.push(raw);
    else out.activated.push({ ...a, text: line, body: { ...a.body, effects: [a.body.effects[0]!, { ...e, n: { ...n, count: { ...n.count, exileCounter: fractal[2]! } } }], text: line.replace(/^[^:]+: /, "") } });
    return true;
  }
  // Imbraham, Dean of Theory: "{X}{U}{U}, {T}: Exile the top X cards of your library and put a study counter on each of them.
  // Then you may put a card you own in exile with a study counter on it into your hand.": the counters on them in exile; with
  // X 0, none exiled, though one exiled earlier may still be put into your hand (rulings).
  const study = /^(.+): Exile the top X cards of your library and put an? ([a-z]+) counter on each of them\. Then you may put a card you own in exile with an? \2 counter on it into your hand\.$/.exec(line);
  if (study) {
    const a = parseActivated(`${study[1]}: Exile the top X cards of your library. You may put a card you own with a ${study[2]} counter on it from exile into your hand.`);
    const [top, pick] = a && a !== "fail" && a.body.effects.length === 2 ? a.body.effects : [];
    if (!a || a === "fail" || top?.type !== "exileTop" || pick?.type !== "chooseFromGraveyard" || !pick.fromExile || !pick.upTo || a.body.targets.length) out.unsupported.push(raw);
    else out.activated.push({ ...a, text: line, body: { ...a.body, effects: [{ ...top, counters: { [study[2]!]: 1 } }, pick], text: line.replace(/^[^:]+: /, "") } });
    return true;
  }
  // Grimoire Thief: "You may look at cards exiled with ~.": the cards its "exile ... face down" trigger exiled (CR 406.3,
  // 607.2a), seen by whoever controls it when they're exiled and by any later controller, still after it's gone (rulings).
  if (line === "You may look at cards exiled with ~.") {
    const faceDown = out.triggers.flatMap((t) => t.body.effects).filter((e): e is Extract<Effect, { type: "exileFaceDown" }> => e.type === "exileFaceDown" && e.from === "top" && !!e.who && !e.play && !e.actor);
    if (faceDown.length !== 1 || out.activated.length) return false;
    faceDown[0]!.look = true;
    faceDown[0]!.lookControllers = true;
    return true;
  }
  return false;
}

export function roundB189Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Grimoire Thief: "Whenever ~ becomes tapped, exile the top three cards of target opponent's library face down." (CR
  // 406.3): that player's own library, linked to ~ (CR 607.2a).
  if (/^[Ee]xile the top three cards of target opponent's library face down$/.test(s)) {
    if (ctx.spell || ctx.activated) return "fail";
    const index = addTarget(ctx, { kind: "player", opponent: true, text: "target opponent" });
    return { effect: { type: "exileFaceDown", from: "top", n: 3, who: { ref: "target", index } }, next: si + 1 };
  }
  // Grimoire Thief: "Turn all cards exiled with ~ face up. Counter all spells with those names." (after its sacrifice cost).
  if (s === "Turn all cards exiled with ~ face up" && plain(sentences[si + 1]) === "Counter all spells with those names") {
    if (!ctx.activated || ctx.spell) return "fail";
    return { effect: { type: "faceUpLinkedCounterNamed" }, next: si + 2 };
  }
  // Worldpurge: "Each player chooses up to seven cards in their hand, then shuffles the rest into their library." and "Each
  // player loses all unspent mana." (CR 106.4).
  const keep = /^Each player chooses up to (seven) cards in their hand, then shuffles the rest into their library$/.exec(s);
  if (keep && ctx.spell) return { effect: { type: "keepUpToShuffleRest", who: { ref: "eachPlayer" }, n: 7 }, next: si + 1 };
  if (s === "Each player chooses up to seven cards in their hand" && /^[Tt]hen shuffles the rest into their library\.?$|^Shuffles the rest into their library\.?$/.test(sentences[si + 1] ?? "") && ctx.spell) {
    return { effect: { type: "keepUpToShuffleRest", who: { ref: "eachPlayer" }, n: 7 }, next: si + 2 };
  }
  if (s === "Each player loses all unspent mana") return { effect: { type: "loseUnspentMana", who: { ref: "eachPlayer" } }, next: si + 1 };
  // Kianne, Dean of Substance: "Exile the top card of your library. If it's a land card, put it into your hand. Otherwise,
  // put a study counter on it."
  if (s === "Exile the top card of your library" && /^If it's a land card, put it into your hand\.?$/.test(sentences[si + 1] ?? "")) {
    const other = /^Otherwise, put an? ([a-z]+) counter on it\.?$/.exec(sentences[si + 2] ?? "");
    if (!other) return null;
    return { effect: { type: "exileTopLandToHandElseCounter", counter: other[1]! }, next: si + 3 };
  }
  return null;
}
