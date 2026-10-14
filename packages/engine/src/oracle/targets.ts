import type { DamageRecipient, ObjRef, PlayerRef, TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { num, COLOR_WORDS, TYPE_WORDS, keywordOf, BASIC_TYPES, capital, singular } from "./words";
import { Ctx, addTarget } from "./body";

export function parseDamageRecipient(p: string, ctx: Ctx): DamageRecipient | null {
  if (/^any target$/i.test(p)) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", text: "any target" }) };
  // "target player or planeswalker", "target opponent or planeswalker" (Lava Axe): a player, or a planeswalker permanent.
  const pw = /^target (player|opponent) or planeswalker$/i.exec(p);
  if (pw) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", types: ["Planeswalker"], ...(pw[1]!.toLowerCase() === "opponent" ? { opponent: true } : {}), text: p.toLowerCase() }) };
  // "any other target", "another target": not one of the targets before it, or with none, not the
  // source (CR 115.4). "Each of two targets", "each of up to two targets" (CR 115.3, 115.6).
  if (/^(any other target|another target)$/i.test(p)) {
    const before = ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "player" ? [i] : []));
    if (!before.length && ctx.spell) return null;
    const spec: TargetSpec = { kind: "any", text: "any other target", ...(before.length ? { distinctFrom: before } : { notSource: true }) };
    return { ref: "anyTarget", index: addTarget(ctx, spec) };
  }
  let several: RegExpExecArray | null;
  if ((several = /^each of (up to )?(two|three|four|one or two) targets$/i.exec(p))) {
    const [required, n] = several[2] === "one or two" ? [1, 2] : several[1] ? [0, num(several[2]!)] : [num(several[2]!), num(several[2]!)];
    const first = ctx.targets.length;
    for (let k = 0; k < n; k++)
      addTarget(ctx, { kind: "any", text: "any target", ...(k >= required ? { optional: true } : {}), ...(k ? { distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
    return { ref: "anyTarget", index: first, n };
  }
  const player = parsePlayer(p, ctx);
  if (player) return player;
  return parseObject(p, ctx);
}

/** What a "pick" effect picks from: "creature", "nonland permanent", "two lands", "artifact or creature", "Forest". */
export function pickFilter(phrase: string): TargetSpec | null {
  const words = phrase.trim().replace(/ you control$/i, "").split(" ");
  // "a Plains" is already singular; "two creatures" isn't.
  const asIs = words.join(" ");
  const one = parseTargetPhrase(asIs) ? asIs : words.map((w, i) => (i === words.length - 1 ? singular(w) : w)).join(" ");
  const spec = parseTargetPhrase(one);
  if (spec?.kind !== "object" || spec.controller) return null;
  return { ...spec, text: one };
}

export function parsePlayer(p: string, ctx: Ctx): PlayerRef | null {
  const x = p.trim().toLowerCase();
  if (x === "you") return { ref: "you" };
  if (x === "each opponent") return { ref: "eachOpponent" };
  if (x === "each player") return { ref: "eachPlayer" };
  // "Whenever ~ deals combat damage to a player, that player discards a card."
  if (x === "that player" && ctx.eventPlayer) return { ref: "eventPlayer" };
  if (x === "defending player" && ctx.defending) return { ref: "eventPlayer" };
  if (x === "its controller" || x === "that creature's controller" || x === "that permanent's controller") {
    const i = ctx.lastObjectTarget;
    if (i === undefined && ctx.subjectIt) return { ref: "subjectController" };
    return i !== undefined ? { ref: "targetController", index: i } : null;
  }
  if (x === "target player" || x === "target opponent") {
    const index = addTarget(ctx, { kind: "player", opponent: x === "target opponent", text: x });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  return null;
}

/**
 * An object reference. Targets in graveyards ("target card from a graveyard") are only
 * allowed where the caller knows what to do with a card (`cards`), since "destroy" or
 * "tap" make no sense for one.
 */
export function parseObject(p: string, ctx: Ctx, cards = false): ObjRef | null {
  if (ctx.subjectLeft && /^that card$/i.test(p.trim()) && ctx.lastObjectTarget === undefined) return { ref: "subjectCard" };
  const ref = parseObjectNow(p, ctx, cards);
  return ref?.ref === "subject" && ctx.subjectLeft ? { ref: "subjectCard" } : ref;
}

function parseObjectNow(p: string, ctx: Ctx, cards = false): ObjRef | null {
  // "Put a +1/+1 counter on each of up to two target creatures", "Up to two target creatures each get +1/+1"
  const x = /\btarget\b/i.test(p) ? p.trim().replace(/^each of /i, "").replace(/ each$/i, "") : p.trim();
  // "They", "those creatures": the targets of an earlier "up to two target creatures".
  if (/^(?:each of )?(they|them|those creatures|those permanents|those cards)$/i.test(x)) return ctx.lastTargets ? { ref: "target", ...ctx.lastTargets } : null;
  const several = SEVERAL_TARGETS.exec(x);
  if (several) return parseSeveralTargets(several, ctx, cards);
  // After it left the battlefield, its name means the card where it went (CR 400.7 makes the permanent gone).
  if (x === "~") return ctx.selfCard ? { ref: "selfCard" } : { ref: "self" };
  if (ctx.subjectIt && /^that (land|artifact|enchantment|token|[A-Z][a-z]+)$/.test(x) && ctx.lastObjectTarget === undefined) return { ref: "subject" };
  if (/^(it|that creature|that permanent)$/i.test(x)) {
    if (ctx.lastCreated && /^it$/i.test(x)) return { ref: "created" };
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if (ctx.subjectIt) return { ref: "subject" };
    if (ctx.selfIt && /^it$/i.test(x)) return { ref: "self" };
    if (ctx.selfCard && /^it$/i.test(x)) return { ref: "selfCard" };
    return ctx.subject && /^that creature$/i.test(x) ? { ref: "subject" } : null;
  }
  // "Enchanted creature", "equipped creature": what the source is attached to (not targeted).
  if (/^(enchanted|equipped) (creature|permanent|artifact|land)$/i.test(x) && !ctx.spell) return { ref: "attached" };
  const group = parseGroup(x);
  if (group && group.other && ctx.spell) {
    // A spell's "other creatures you control": other than the creature it targeted ("Put two +1/+1
    // counters on target creature you control. Other creatures you control get +1/+1"). Other than
    // something it only named ("Zombies you control get +2/+1. Other creatures ...") isn't modeled.
    return ctx.lastObjectTarget !== undefined ? { ref: "each", filter: group.filter, otherThan: ctx.lastObjectTarget } : null;
  }
  if (group) return { ref: "each", filter: group.filter, ...(group.other ? { other: true } : {}) };
  const m = /^target (.+)$/i.exec(x);
  if (!m) return null;
  const [phrase, theirs] = thatPlayerControls(m[1]!, ctx);
  const spec = parseTargetPhrase(phrase);
  if (!spec || spec.kind === "player" || spec.kind === "spell" || (spec.kind === "card") !== cards || (theirs && (spec.kind !== "object" || spec.controller))) return null;
  return { ref: "target", index: addTarget(ctx, theirs ? { ...spec, controller: "eventPlayer", text: `target ${m[1]!}` } : spec) };
}

/** "Creature that player controls" in a trigger about a player: the phrase without it, and whether it was there. */
function thatPlayerControls(phrase: string, ctx: Ctx): [string, boolean] {
  const m = / that player controls$/i.exec(phrase);
  return m && ctx.eventPlayer ? [phrase.slice(0, m.index), true] : [phrase, false];
}

const SEVERAL_TARGETS = /^(?:(up to )?(one|two|three|four|five|six|\d+) (other )?|(another) |(one or two|one, two, or three) )target (.+)$/i;

/**
 * "Up to two target creatures", "two target artifacts", "one or two target creatures", "another target
 * creature", "up to one other target permanent you control" (CR 115.3, 115.6, 601.2c). Each is a
 * target of its own, in a row; "up to" ones may be left unchosen, and none can be the same as another
 * of them. "Another" or "other" means other than the targets before it, or with none before it, other
 * than the ability's source.
 */
function parseSeveralTargets(m: RegExpExecArray, ctx: Ctx, cards: boolean): ObjRef | null {
  const [, upTo, count, other, another, range, phrase] = m;
  const [required, n] = range ? (range.startsWith("one or two") ? [1, 2] : [1, 3]) : upTo ? [0, num(count!)] : another ? [1, 1] : [num(count!), num(count!)];
  if (n < 1 || n > 6) return null;
  const [mine, theirs] = thatPlayerControls(phrase!, ctx);
  const parsed = parseTargetPhrase(n > 1 ? singularPhrase(mine) : mine);
  if (!parsed || parsed.kind === "player" || parsed.kind === "spell" || (parsed.kind === "card") !== cards || (theirs && (parsed.kind !== "object" || parsed.controller))) return null;
  const spec: TargetSpec = theirs ? { ...parsed, controller: "eventPlayer", text: `${parsed.text} that player controls` } : parsed;
  const before = ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "card" ? [i] : []));
  let notSource = false;
  if (other || another) {
    if (!before.length && ctx.spell) return null; // a spell has no source on the battlefield to be other than
    notSource = !before.length;
  }
  const first = ctx.targets.length;
  for (let k = 0; k < n; k++) {
    const distinct = [...(other || another ? before : []), ...Array.from({ length: k }, (_, j) => first + j)];
    addTarget(ctx, { ...spec, ...(k >= required ? { optional: true } : {}), ...(notSource ? { notSource } : {}), ...(distinct.length ? { distinctFrom: distinct } : {}) });
  }
  // "It" can't mean one of several; "they" / "those creatures" means all of them.
  if (n > 1) ctx.lastObjectTarget = undefined;
  ctx.lastTargets = { index: first, ...(n > 1 ? { n } : {}) };
  return { ref: "target", index: first, ...(n > 1 ? { n } : {}) };
}

/** "creatures you control" -> "creature you control", "creature cards from your graveyard" -> "creature card from your graveyard". */
function singularPhrase(p: string): string {
  const words = p.trim().split(" ");
  const i = words.findIndex((w) => /^(creatures|cards|permanents|artifacts|enchantments|lands|planeswalkers|battles)$/i.test(w));
  if (i >= 0) words[i] = singular(words[i]!);
  else {
    // A creature type: "two target Goblins", "up to two target Elves you control".
    const j = words.findIndex((w) => /^[A-Z]/.test(w) && CREATURE_TYPES.has(singular(w)) && w !== singular(w));
    if (j < 0) return p;
    words[j] = singular(words[j]!);
  }
  return words.join(" ").replace(/ your opponents control$/, " an opponent controls").replace(/ from graveyards$/, " from a graveyard");
}

export const PERMANENT_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];

const PLURAL_TYPES: Record<string, string> = {
  creatures: "creature",
  artifacts: "artifact",
  enchantments: "enchantment",
  lands: "land",
  permanents: "permanent",
  planeswalkers: "planeswalker",
  battles: "battle",
};

/**
 * A group of permanents an effect or static ability applies to without targeting them: "all
 * creatures", "each artifact and enchantment", "other creatures you control", "all creatures without
 * flying", "each creature you control with a +1/+1 counter on it", "creatures of the chosen type".
 * "Artifacts and enchantments" means each permanent that's an artifact or an enchantment. Without
 * "all" or "each" it has to say whose they are ("creatures you control"), unless `bare` (a static
 * ability's subject, "Creatures of the chosen type get +1/+1").
 */
export function parseGroup(phrase: string, bare = false): { filter: TargetSpec; other: boolean } | null {
  let p = phrase.trim();
  const all = /^(all|each) /i.exec(p);
  if (all) p = p.slice(all[0].length);
  const other = /^other /i.test(p);
  if (other) p = p.slice(6);
  const whose = / (you control|your opponents control|an opponent controls|you don't control)\b/i;
  // "Attacking creatures get +1/+1 until end of turn": whichever are attacking as it resolves (CR 611.2c).
  const combat = /^(attacking|blocking|attacking or blocking) creatures\b/i.test(p);
  if (!all && !whose.test(p) && !bare && !combat) return null;
  // The kinds come first; plurals become the singular parseTargetPhrase reads ("Elves" -> "Elf").
  const cut = /\b(with|without|you control|your opponents control|an opponent controls|you don't control|of the chosen|of that|that aren't|that are not|not of)\b/i.exec(p);
  let head = (cut ? p.slice(0, cut.index) : p).trim();
  const tail = cut ? p.slice(cut.index).replace(/^your opponents control/i, "an opponent controls").replace(/ your opponents control/i, " an opponent controls") : "";
  const words = head.replace(/,? and |, or |, /g, " or ").split(/\s+/);
  // A plural noun is a group; a singular one only after "each" ("each creature", but not "all creature").
  const plural = words.some((w) => PLURAL_TYPES[w.toLowerCase()] || (/s$/.test(w) && CREATURE_TYPES.has(singular(capital(w)))));
  if (!plural && !(all && all[1]!.toLowerCase() === "each")) return null;
  head = words
    .map((w) => PLURAL_TYPES[w.toLowerCase()] ?? (/^[A-Z]/.test(w) && w !== "Plains" && CREATURE_TYPES.has(singular(w)) ? singular(w) : w))
    .join(" ");
  const spec = parseTargetPhrase(`${head} ${tail}`.trim(), { chosen: true });
  if (!spec || spec.kind !== "object") return null;
  return { filter: { ...spec, text: phrase.trim().toLowerCase() }, other };
}

/**
 * "target creature card from your graveyard" where the effect needs the card to be in
 * `owner`'s graveyard (e.g. "to your hand" only fits your own cards).
 */
export function parseCardTarget(p: string, ctx: Ctx, owner?: "you"): ObjRef | null {
  const i = ctx.targets.length;
  const what = parseObject(p, ctx, true);
  if (!what) return null;
  if (owner && ctx.targets[i]?.owner !== owner) {
    ctx.targets.length = i;
    return null;
  }
  return what;
}

/** Parse the words after "target": "nonblack creature an opponent controls", "artifact or enchantment", "spell", ... */
export function parseTargetPhrase(phrase: string, opts: { chosen?: boolean } = {}): TargetSpec | null {
  let p = phrase.trim().toLowerCase();
  const text = `target ${p}`;
  const extra: Partial<TargetSpec> = {};
  // "of the chosen type", "that aren't of the chosen type", "of that color": only where the caller fills in the choice.
  const chosen = /,? (that (?:aren't|are not|isn't|is not) |not )?of (?:the chosen|that) (creature type|type|color)/.exec(p);
  if (chosen) {
    if (!opts.chosen) return null;
    extra.chosen = chosen[2] === "color" ? (chosen[1] ? "notColor" : "color") : chosen[1] ? "notType" : "type";
    p = (p.slice(0, chosen.index) + p.slice(chosen.index + chosen[0].length)).trim();
  }
  // "creature with a +1/+1 counter on it"
  const counter = / with an? ([+-]1\/[+-]1) counter on (?:it|them)/.exec(p);
  if (counter) {
    extra.counter = counter[1] === "+1/+1" ? "+1/+1" : "-1/-1";
    p = (p.slice(0, counter.index) + p.slice(counter.index + counter[0].length)).trim();
  }
  // "creature card from your graveyard", "card from a graveyard": a card in that zone (CR 109.2a).
  let inGraveyard = false;
  let owner: TargetSpec["owner"];
  const gy = / (?:from|in) (your|a|an opponent's) graveyard$/.exec(p);
  if (gy) {
    p = p.slice(0, gy.index);
    owner = gy[1] === "your" ? "you" : gy[1] === "a" ? undefined : "opponent";
    // The word "card" comes before any "with ..." qualifier: "creature card with mana value 3 or less".
    const card = /(^| )card(?= with |$)/.exec(p);
    if (!card) return null;
    p = (p.slice(0, card.index) + p.slice(card.index + card[0].length)).trim();
    inGraveyard = true;
  }
  // "... with flying", "... without flying", "... with power 4 or greater", "... with mana value 3 or less"
  let m: RegExpExecArray | null;
  if ((m = / with (power|toughness|mana value) (\d+) or (greater|less)$/.exec(p))) {
    const n = Number(m[2]);
    const key = m[1] === "mana value" ? "manaValue" : (m[1] as "power" | "toughness");
    extra[key] = m[3] === "greater" ? { min: n } : { max: n };
    p = p.slice(0, m.index);
  } else if ((m = / (with|without) ([a-z ]+)$/.exec(p))) {
    const kws = parseKeywordList(m[2]!);
    if (!kws || kws.length !== 1) return null;
    if (m[1] === "with") extra.keywords = kws;
    else extra.notKeywords = kws;
    p = p.slice(0, m.index);
  }
  let controller: TargetSpec["controller"];
  if (/ (an opponent controls|you don't control)$/.test(p)) {
    controller = "opponent";
    p = p.replace(/ (an opponent controls|you don't control)$/, "");
  } else if (/ you control$/.test(p)) {
    controller = "you";
    p = p.replace(/ you control$/, "");
  }
  if (inGraveyard && (controller || / (?:you|an opponent) controls?$/.test(p))) return null;
  if (p === "player" || p === "opponent") return Object.keys(extra).length || inGraveyard ? null : { kind: "player", opponent: p === "opponent", text };
  let tapped: boolean | undefined;
  if ((m = /^(un)?tapped /.exec(p))) {
    tapped = !m[1];
    p = p.slice(m[0].length);
  }
  if (p.startsWith("attacking or blocking ")) {
    extra.combat = "attackingOrBlocking";
    p = p.slice("attacking or blocking ".length);
  } else if ((m = /^(attacking|blocking) /.exec(p))) {
    extra.combat = m[1] as "attacking" | "blocking";
    p = p.slice(m[0].length);
  }
  const isSpell = / ?spell$/.test(p);
  if (isSpell) p = p.replace(/ ?spell$/, "");
  const types: string[] = [];
  const notTypes: string[] = [];
  const colors: Color[] = [];
  const notColors: Color[] = [];
  const supertypes: string[] = [];
  const notSupertypes: string[] = [];
  const notSubtypes: string[] = [];
  const subtypes: string[] = [];
  const SUPERTYPE_WORDS: Record<string, string> = { basic: "Basic", legendary: "Legendary", snow: "Snow" };
  const alts = p ? p.split(/ or |, /) : [];
  // "artifact creature" is one object with both types; "artifact or creature" is either.
  const typeWords = alts.map((alt) => alt.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).length);
  if (typeWords.some((n) => n > 1) && alts.length > 1) return null;
  const allTypes = typeWords[0]! > 1 ? alts[0]!.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).map((w) => TYPE_WORDS[w]!) : null;
  for (const alt of alts) {
    const words = alt.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if (w === "token" || w === "nontoken") {
        if (alts.length > 1) return null;
        extra.token = w === "token";
      } else if (w.startsWith("non")) {
        const rest = w.slice(3).replace(/^-/, "");
        if (COLOR_WORDS[rest]) notColors.push(COLOR_WORDS[rest]!);
        else if (TYPE_WORDS[rest]) notTypes.push(TYPE_WORDS[rest]!);
        else if (SUPERTYPE_WORDS[rest]) notSupertypes.push(SUPERTYPE_WORDS[rest]!);
        else if (alts.length === 1 && (CREATURE_TYPES.has(capital(rest)) || BASIC_TYPES.includes(capital(rest)))) notSubtypes.push(capital(rest)); // "non-Wall"
        else return null;
      } else if (TYPE_WORDS[w]) types.push(TYPE_WORDS[w]!);
      else if (CREATURE_TYPES.has(capital(w)) || BASIC_TYPES.includes(capital(w))) subtypes.push(capital(w));
      else if (COLOR_WORDS[w]) colors.push(COLOR_WORDS[w]!);
      else if (SUPERTYPE_WORDS[w]) supertypes.push(SUPERTYPE_WORDS[w]!);
      else if (w === "permanent" && inGraveyard) types.push(...PERMANENT_TYPES); // "permanent card" (CR 110.4b)
      else if (w === "permanent" || w === "") continue;
      else return null;
    }
  }
  // "red or green creature" means a creature that's red or green. Mixing colors with several
  // different type alternatives ("red creature or green artifact") isn't modeled.
  if (colors.length && alts.filter((a) => a.split(/\s+/).some((w) => TYPE_WORDS[w])).length > 1) return null;
  // Supertypes are "and" requirements ("basic land"); with alternatives they'd need per-alternative filters.
  if ((supertypes.length || notSupertypes.length) && alts.length > 1) return null;
  // Subtypes mixed with card types in alternatives ("Wall or artifact") would need per-alternative filters too.
  if (subtypes.length && (types.length || notTypes.length) && alts.length > 1) return null;
  const filters = {
    types: allTypes ? [] : types,
    ...(allTypes ? { allTypes } : {}),
    notTypes,
    notColors,
    ...(colors.length ? { colors } : {}),
    ...(supertypes.length ? { supertypes } : {}),
    ...(notSupertypes.length ? { notSupertypes } : {}),
    ...(subtypes.length ? { subtypes } : {}),
    ...(notSubtypes.length ? { notSubtypes } : {}),
    ...extra,
  };
  if (inGraveyard) {
    if (isSpell || tapped !== undefined || extra.combat || extra.token !== undefined) return null;
    return { kind: "card", ...filters, ...(owner ? { owner } : {}), text };
  }
  if (isSpell) return extra.keywords || extra.notKeywords || extra.power || extra.toughness || extra.combat || extra.token !== undefined || supertypes.length ? null : { kind: "spell", ...filters, text };
  return { kind: "object", ...filters, controller, ...(tapped !== undefined ? { tapped } : {}), text };
}

export function parseKeywordList(text: string): string[] | null {
  // "Protection from black and from red" is two protection abilities (CR 702.16g).
  text = text.replace(/protection from (\w+) and from (\w+)/gi, "protection from $1, protection from $2");
  const parts = text.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const k = keywordOf(p, true);
    if (!k) return null;
    out.push(k);
  }
  return out;
}
