// Round 348's sentences, read before round 347's (round347Sentence in oracle/round347.ts, which reads these first), and
// its whole lines (compile.ts, after round 347's): spells of one color with a keyword (Firesong and Sunspeaker), life
// gained because a spell of one color resolves, and any number of permanents chosen to transform (Tovolar).
import type { CompiledCard, Effect } from "../abilities";
import { parseBody, type Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseTargetPhrase } from "./targets";
import { round349Sentence } from "./round349";
import { singularWord } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round348Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 349's sentences first (oracle/round349.ts).
  const r349 = round349Sentence(s, sentences, si, ctx, effects);
  if (r349) return r349;
  const line = plain(s);
  // Tovolar, Dire Overlord: "Then transform any number of Human Werewolves you control.": any of them, none too, chosen as
  // it resolves, not targeted (CR 701.27a); a daybound one, or one that isn't a double-faced card, doesn't transform
  // (CR 702.145b, 701.27c, rulings: "can't transform via any means other than their daybound and nightbound abilities").
  const many = /^(?:Then )?[Tt]ransform any number of ([A-Z][a-z]+) ([A-Z][a-z]+) you control$/.exec(line);
  if (many && !ctx.spell) {
    const what = `${many[1]!} ${singularWord(many[2]!)}`;
    const filter = parseTargetPhrase(`${what} you control`);
    if (filter?.kind !== "object" || filter.subtypes?.length !== 2) return "fail";
    // The pick, then the transform after it, as Sunder the Gateway's (body.ts) does for one.
    effects.push({ type: "pick", who: { ref: "you" }, filter: { ...filter, text: `${what} you control` }, n: 1, anyNumber: true, action: "choose", prompt: `click any number of ${many[1]!} ${many[2]!} you control to transform them, then choose them (or choose none).` });
    return { effect: { type: "transform", what: { ref: "created" } }, next: si + 1 };
  }
  // Hollow Marauder: "any number of target opponents each discard a card. For each of those opponents who didn't discard a
  // card with mana value 4 or greater, draw a card.": the discards at once (rulings), then one card for each target
  // opponent who discarded none of those, one with an empty hand too (CR 701.9b).
  const each = /^For each of those opponents who didn't discard (an? (?:[^,]+? )?card(?: with [^,]+)?), draw a card$/.exec(line);
  const last = effects[effects.length - 1];
  if (each && last?.type === "discard" && last.who.ref === "target" && !last.random && last.n === 1) {
    const filter = parseSearchFilter(each[1]!.replace(/^an? /, ""));
    if (filter?.kind !== "card") return "fail";
    return { effect: { type: "draw", who: { ref: "you" }, n: { count: { kind: "playersDidntDiscard", who: last.who, filter } } }, next: si + 1 };
  }
  return null;
}

/** Round 348's whole lines: true when the line is one of them (supported, or pushed to `out.unsupported`). */
export function round348Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Firesong and Sunspeaker: "Red instant and sorcery spells you control have lifelink.": the damage those spells deal while
  // it's on the battlefield (CR 702.15b), as Soulfire Grand Master's, only the red ones (the spell's color as it deals it).
  const kw = /^(White|Blue|Black|Red|Green) instant and sorcery spells you control have (lifelink|deathtouch)\.$/.exec(line);
  if (kw && !isSpell) {
    const f = parseTargetPhrase(`${kw[1]!.toLowerCase()} instant or sorcery spell`);
    if (f?.kind !== "spell") out.unsupported.push(raw);
    else (out.spellsHaveKeywords ??= []).push({ filter: f, keyword: kw[2] === "lifelink" ? "Lifelink" : "Deathtouch" });
    return true;
  }
  // Firesong and Sunspeaker: "Whenever a white instant or sorcery spell causes you to gain life, ~ deals 3 damage to target
  // creature or player.": life gained as such a spell resolves, whoever controls it, by its own instructions or its damage
  // with lifelink (rulings); each life-gain event once (CR 119.9, 119.10, rulings: "for each" is one event, a spell that
  // deals damage and gains life twice). A triggered ability of such a card isn't the spell (rulings).
  const gain = /^Whenever an? (white|blue|black|red|green) instant or sorcery spell causes you to gain life, (.+)$/.exec(line);
  if (gain && !isSpell) {
    const f = parseTargetPhrase(`${gain[1]!} instant or sorcery spell`);
    const body = parseBody(gain[2]!);
    if (f?.kind !== "spell" || !body) out.unsupported.push(raw);
    else out.triggers.push({ event: "youGainLife", lifeFromSpell: { ...f, text: `${gain[1]!} instant or sorcery spell` }, body });
    return true;
  }
  return false;
}
