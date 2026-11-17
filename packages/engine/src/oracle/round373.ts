// Round 373's sentences, read before round 368's (round368Sentence in oracle/round368.ts reads these first), and its whole
// lines (compile.ts, after round 372's): a copy of a legendary or Rat card from your graveyard, cast paying its costs
// (Nashi, Moon's Legacy), milling one card at a time until a creature card (Helm of Obedience) and creatures each
// opponent chooses, tapped and goaded (Fell Beast's Shriek).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import { parseActivated } from "./activated";
import { parseBody, type Ctx } from "./body";
import { parseObject } from "./targets";
import { round387Sentence } from "./round387";
import { round388Sentence } from "./round388";
import { round389Sentence } from "./round389";
import { round390Sentence } from "./round390";
import { round391Sentence } from "./round391";
import { round392Sentence } from "./round392";
import { round393Sentence } from "./round393";
import { round400Sentence } from "./round400";
import { round401Sentence } from "./round401";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round373Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Round 393's sentences (oracle/round393.ts), then round 392's (oracle/round392.ts), then round 391's (oracle/round391.ts), then round 390's (oracle/round390.ts), then round 389's (oracle/round389.ts), then round 388's (oracle/round388.ts),
  // then round 387's (oracle/round387.ts), first.
  // Round 400's (oracle/round400.ts) before all of them.
  // Round 401's (oracle/round401.ts) before round 400's.
  const r401 = round401Sentence(s, sentences, si, ctx, _effects);
  if (r401) return r401;
  const r400 = round400Sentence(s, sentences, si, ctx, _effects);
  if (r400) return r400;
  const r393 = round393Sentence(s, sentences, si, ctx, _effects);
  if (r393) return r393;
  const r392 = round392Sentence(s, sentences, si, ctx, _effects);
  if (r392) return r392;
  const r391 = round391Sentence(s, sentences, si, ctx, _effects);
  if (r391) return r391;
  const r390 = round390Sentence(s, sentences, si, ctx, _effects);
  if (r390) return r390;
  const r389 = round389Sentence(s, sentences, si, ctx, _effects);
  if (r389) return r389;
  const r388 = round388Sentence(s, sentences, si, ctx, _effects);
  if (r388) return r388;
  const r387 = round387Sentence(s, sentences, si, ctx, _effects);
  if (r387) return r387;
  // Nashi, Moon's Legacy: "exile up to one target legendary or Rat card from your graveyard and copy it. You may cast the
  // copy.", the last sentences of its ability: the copy is made in exile and cast as this resolves or never, paying its
  // costs (X chosen as usual), one not cast ceasing to exist (rulings, CR 608.2g, 707.12), as Kaervek's and Demilich's.
  // "Legendary or Rat card": a card that's either, the supertype (CR 205.4) or the creature type (205.3m).
  const nashi = /^[Ee]xile up to one target legendary or ([A-Z][a-z]+) card from your graveyard and copy it$/.exec(plain(s));
  if (nashi && plain(sentences[si + 1]) === "You may cast the copy" && sentences.length === si + 2) {
    const type = nashi[1]!;
    if (!CREATURE_TYPES.has(type)) return "fail";
    const base = parseObject("up to one target legendary card from your graveyard", ctx, true);
    if (base?.ref !== "target") return "fail";
    const spec = ctx.targets[base.index]!;
    if (spec.kind !== "card" || !spec.supertypes?.includes("Legendary") || !spec.optional) return "fail";
    ctx.targets[base.index] = { ...spec, supertypes: undefined, anyOf: [{ kind: "card", supertypes: ["Legendary"], text: "legendary card" }, { kind: "card", subtypes: [type], text: `${type} card` }], text: `target legendary or ${type} card from your graveyard` };
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: base.index }, paid: true }, next: si + 2 };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const HELM = "{X}, {T}: Target opponent mills a card, then repeats this process until a creature card or X cards have been put into their graveyard this way, whichever comes first. If one or more creature cards were put into that graveyard this way, sacrifice ~ and put one of them onto the battlefield under your control. X can't be 0.";

const SHRIEK = "Each opponent chooses a creature they control. Tap and goad the chosen creatures.";

export function round373Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Fell Beast's Shriek: each opponent in turn order chooses one of their creatures as it resolves (not a target, so
  // hexproof doesn't stop it), then all the chosen ones are tapped and goaded until your next turn (CR 701.15a). As
  // Riches' choice; its splice onto instants and sorceries adds this after the other spell's effects (rulings, CR 702.47b).
  if (line === SHRIEK) {
    if (!isSpell || out.spell) return fail(out, raw);
    const b = parseBody("Each opponent chooses a creature they control. You gain control of those creatures.", { spell: true });
    const pick = b?.effects.length === 2 ? b.effects[0] : undefined;
    if (!b || b.targets.length || pick?.type !== "pick" || pick.who.ref !== "eachOpponent" || pick.n !== 1) return fail(out, raw);
    out.spell = { targets: [], effects: [pick, { type: "tap", what: { ref: "created" } }, { type: "continuous", what: { ref: "created" }, mods: [{ kind: "goad" }], duration: "yourNextTurn" }], text: line };
    return true;
  }
  // Helm of Obedience: one card at a time until a creature card or X cards are put into the opponent's graveyard (Effect
  // millUntil). Then, if a creature card was put there, Helm is sacrificed and one of them (you choose, with a replacement
  // that mills two at a time there could be two) is put onto the battlefield under your control, even if Helm couldn't
  // be sacrificed (rulings), and only while it's still that card in that graveyard (CR 400.7).
  if (line === HELM) {
    const a = isSpell ? null : parseActivated("{X}, {T}: Target opponent mills X cards. Sacrifice ~. X can't be 0.");
    const [mill, sac] = a && a !== "fail" ? a.body.effects : [];
    if (!a || a === "fail" || a.xMin !== 1 || a.body.targets.length !== 1 || a.body.targets[0]!.kind !== "player" || a.body.effects.length !== 2 || mill?.type !== "mill" || sac?.type !== "sacrifice") return fail(out, raw);
    const creature: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
    const effects: Effect[] = [
      { type: "millUntil", who: mill.who, n: mill.n, until: creature },
      { type: "if", cond: { kind: "milledIs", filter: creature }, effects: [sac, { type: "chooseFromGraveyard", who: mill.who, youChoose: true, dest: "battlefield", filter: creature, milled: true, n: 1 }] },
    ];
    out.activated.push({ ...a, body: { ...a.body, effects, text: line.slice("{X}, {T}: ".length, -" X can't be 0.".length) }, text: line });
    return true;
  }
  return false;
}
