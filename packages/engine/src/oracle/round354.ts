// Round 354's pieces: tiered modes that are only a base power and toughness (Vincent's Limit Break, read in compile.ts's
// spree branch), and the Spirit tokens of Hofri Ghostforge, each linked to the card exiled for it.
import { allEffects, type CompiledCard, type Effect } from "../abilities";
import type { Ctx } from "./body";
import { round355Sentence } from "./round355";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/**
 * Espers to Magicite: "Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this
 * way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.": a
 * reflexive trigger (CR 603.12) whose target is chosen as it's put on the stack (rulings), among the cards this exiled
 * that are still in exile (CR 400.7); the token copies the printed card (rulings, CR 707.2), an artifact only, its
 * subtypes of other card types gone (CR 205.1a, as Machine God's Effigy's), X in its mana cost 0 (rulings).
 */
export function round354Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Round 355's sentences first (oracle/round355.ts).
  const r355 = round355Sentence(s, sentences, si, ctx, _effects);
  if (r355) return r355;
  const line = plain(s);
  if (ctx.spell && line === "Exile each opponent's graveyard" && plain(sentences[si + 1]) === "When you do, choose up to one target creature card exiled this way" && plain(sentences[si + 2]) === "Create a token that's a copy of that card, except it's an artifact and it loses all other card types" && sentences.length === si + 3 && !ctx.targets.length) {
    _effects.push({ type: "exileGraveyard", who: { ref: "eachOpponent" } });
    const body = {
      targets: [{ kind: "card" as const, types: ["Creature"], notTypes: [], notColors: [], inExile: true as const, optional: true, text: "up to one target creature card exiled this way" }],
      effects: [{ type: "createTokenCopy" as const, who: { ref: "you" as const }, n: 1, what: { ref: "target" as const, index: 0 }, except: { setTypes: ["Artifact"] } }],
      text: "choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.",
    };
    return { effect: { type: "reflexive", body, exiledThisWay: true }, next: si + 3 };
  }
  // Rootweaver Druid: "each opponent may search their library for up to three basic land cards. They each put one of those
  // cards onto the battlefield tapped under your control and the rest onto the battlefield tapped under their control. Then
  // each player who searched their library this way shuffles.": one opponent at a time, in turn order from the active
  // player (from the next opponent on your turn), each deciding, searching and putting their lands before the next decides
  // (rulings); a searcher who finds only one card puts it under your control (rulings), and picks which one is yours. Each
  // shuffles right after putting their lands: no player looks at a library between that and the end of the ability.
  if (!ctx.spell && /^[Ee]ach opponent may search their library for up to three basic land cards$/.test(line) && plain(sentences[si + 1]) === "They each put one of those cards onto the battlefield tapped under your control and the rest onto the battlefield tapped under their control" && plain(sentences[si + 2]) === "Then each player who searched their library this way shuffles" && sentences.length === si + 3) {
    const search: Effect = {
      type: "search",
      filter: { kind: "card", types: ["Land"], notTypes: [], notColors: [], supertypes: ["Basic"], text: "basic land card" },
      n: 3,
      upTo: true,
      reveal: false,
      dest: { zone: "battlefield", tapped: true, under: { ref: "you" } },
      others: { zone: "battlefield", tapped: true },
      firstN: 1,
      who: { ref: "eachOne" },
      may: true,
    } as Effect;
    return { effect: { type: "repeat", effects: [search], n: 1, forEach: { ref: "eachOpponent" }, apnapOrder: true }, next: si + 3 };
  }
  return null;
}

/**
 * Vincent's Limit Break: "Tiered ... Until end of turn, target creature you control gains "..." and has the chosen base
 * power and toughness. • Galian Beast — {0} — 3/2. ...": each mode is the spell's one sentence with that mode's base power
 * and toughness (CR 702.183a: exactly one mode, chosen as it's cast, its cost an additional cost; a copy keeps it, rulings).
 * The modes' texts become those sentences and the sentence leaves the spell's other lines (it joins the spell's text);
 * anything else is left as it is. Returns what each mode shows, or nothing if it isn't this kind of spell.
 */
export function round354Tiered(spree: { texts: string[]; lines: string[]; tiered?: true }, spellLines: string[]): string[] | undefined {
  if (!spree.tiered || spellLines.length !== 1 || !spree.texts.length) return undefined;
  const pts = spree.texts.map((t) => /^(\d+)\/(\d+)\.$/.exec(t));
  const names = spree.lines.slice(1).map((l) => /^• ([A-Z][^—•]*?) — /.exec(l)?.[1]);
  if (pts.some((m) => !m) || names.length !== pts.length || names.some((n) => !n)) return undefined;
  const line = spellLines[0]!;
  if (!/^Until end of turn, target creature you control gains "[^"]+" and has the chosen base power and toughness\.$/.test(line)) return undefined;
  spree.texts = pts.map((m) => line.replace("the chosen base power and toughness", `base power and toughness ${m![1]}/${m![2]}`));
  // "This creature" in the quoted ability, as players read it: the one it's given to, not the spell.
  const shown = (t: string) => t.replace(/"[^"]+"/, (q) => q.replace(/~/g, "this creature"));
  spree.lines.splice(1, 0, shown(line));
  spellLines.length = 0;
  // What each mode shows: the tier's name and its sentence.
  return spree.texts.map((t, i) => `${names[i]}: ${shown(t)}`);
}

/**
 * Hofri Ghostforge's Spirit token: "When this token leaves the battlefield, return the exiled card to its owner's
 * graveyard.": the card Hofri's trigger exiled for this token (linked to it by linkSubjectCardToCreated, see
 * round354Finish), only that card and only while it's still in exile (rulings, CR 400.7). A token that copies the Spirit
 * has the ability but no linked card, so it returns nothing (rulings).
 */
export const HOFRI_GRANTED = "When ~ leaves the battlefield, return the exiled card to its owner's graveyard.";

export function round354Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (line === HOFRI_GRANTED) {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ event: "selfLeaves", body: { targets: [], effects: [{ type: "returnLinked", dest: "graveyard", createdLink: true }], text: HOFRI_GRANTED } });
    return true;
  }
  return false;
}

/**
 * Hofri Ghostforge: "Whenever another nontoken creature you control dies, exile it. If you do, create a token that's a copy
 * of that creature, except ... it has "When this token leaves the battlefield, return the exiled card to its owner's
 * graveyard."": the card exiled is linked to each token this resolution created (rulings: every one of them if a
 * replacement made several).
 */
export function round354Finish(out: CompiledCard): void {
  for (const t of out.triggers) {
    for (const e of allEffects(t.body.effects)) {
      if (e.type !== "if" || e.cond.kind !== "youDid") continue;
      const i = e.effects.findIndex((x) => x.type === "createTokenCopy" && x.what.ref === "subjectCard" && !!x.except?.text?.includes(HOFRI_GRANTED));
      if (i >= 0 && !e.effects.some((x) => x.type === "linkSubjectCardToCreated")) e.effects.splice(i + 1, 0, { type: "linkSubjectCardToCreated" } as Effect);
    }
  }
}
