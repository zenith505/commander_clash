import type { DamageRecipient, ObjRef, PlayerRef, TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { num, COLOR_WORDS, TYPE_WORDS, keywordOf, BASIC_TYPES, capital, singular } from "./words";
import { Ctx, addTarget } from "./body";

/** Creature types with a hyphen, by how they read lowercased ("assembly-worker"). */
const HYPHENATED = new Map([...CREATURE_TYPES].filter((ty) => ty.includes("-")).map((ty) => [ty.toLowerCase(), ty]));

/** Spell and enchantment subtypes a filter can name: "Spirit or Arcane spell", "a Cartouche you control" (CR 205.3h, 205.3k). */
// Artifact subtypes (CR 205.3g) other than Vehicle, which "creature or Vehicle" handles: "a Food", "a Clue", "Equipment".
const OTHER_SUBTYPES = ["Arcane", "Aura", "Trap", "Lesson", "Cartouche", "Shrine", "Saga", "Curse", "Blood", "Clue", "Equipment", "Food", "Gold", "Incubator", "Junk", "Lander", "Map", "Mutagen", "Powerstone", "Treasure"];

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
  // "Each of X targets" (Firestorm, Meteor Blast): exactly the spell's X targets, all different (CR 115.3, 601.2c).
  if (/^each of X targets$/i.test(p)) {
    if (!ctx.spell || ctx.targets.some((t) => t.many)) return null;
    const index = addTarget(ctx, { kind: "any", text: "any target", many: "exactX" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index, n: 2 };
    return { ref: "anyTarget", index, n: 2 };
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
  // "creatures with decayed": the noun before "with" is the plural one.
  const head = words.indexOf("with") > 0 ? words.indexOf("with") - 1 : words.length - 1;
  const one = parseTargetPhrase(asIs) ? asIs : words.map((w, i) => (i === head ? singular(w) : w)).join(" ");
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
  if (x === "enchanted player" || x === "enchanted opponent") return { ref: "enchantedPlayer" };
  // "Any number of target players each mill two cards" (CR 601.2c, 115.6): one entry for them all until it's cast
  // (TargetSpec.many); "those players", "each of those players" are all of them.
  const many = /^any number of target (players|opponents)(?: each)?$/.exec(x);
  if (many) {
    if (ctx.targets.some((t) => t.many)) return null;
    const one = many[1] === "players" ? "target player" : "target opponent";
    const index = addTarget(ctx, { kind: "player", opponent: many[1] === "opponents", text: one, many: "any" });
    ctx.lastPlayerTarget = index;
    ctx.manyPlayers = index;
    return { ref: "target", index, n: 2 };
  }
  const manyNow = ctx.manyPlayers !== undefined && ctx.lastPlayerTarget === ctx.manyPlayers;
  if (/^(?:each of )?those (?:players|opponents)$/.test(x) && manyNow) return { ref: "target", index: ctx.manyPlayers!, n: 2 };
  // "Exile target creature and all other creatures its controller controls .... That player investigates ...": that
  // creature's controller (as it last existed, CR 608.2h).
  if (x === "that player" && ctx.controllerNamed !== undefined && ctx.controllerNamed === ctx.lastObjectTarget && ctx.lastPlayerTarget === undefined) return { ref: "targetController", index: ctx.controllerNamed };
  // "Target player discards two cards. ... that player discards a card": the player targeted before.
  if (x === "that player" && ctx.lastPlayerTarget !== undefined && !manyNow) return { ref: "target", index: ctx.lastPlayerTarget };
  // "Counter target spell. ... that spell's controller mills X cards" (Induce Paranoia): who controlled it as it was
  // countered (CR 608.2h).
  if (x === "that spell's controller" && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell") return { ref: "targetController", index: ctx.lastObjectTarget };
  // "Exile target creature card from a graveyard. Its owner creates ..." (Pharika): whose card it is (CR 108.3).
  const lastCard = ctx.targets.length - 1;
  if ((x === "its owner" || x === "that card's owner") && ctx.targets[lastCard]?.kind === "card" && ctx.targets.filter((t) => t.kind === "card").length === 1 && !ctx.targets[lastCard]!.many) return { ref: "targetOwner", index: lastCard };
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
  // "Create two 1/1 colorless Spirit creature tokens. They gain haste until end of turn": the tokens just created.
  if (ctx.lastCreatedAny && /^(?:each of )?(they|them|those tokens|the tokens)$/i.test(x)) return { ref: "created" };
  if (/^(?:each of )?(they|them|those creatures|those permanents|those cards)$/i.test(x)) return ctx.lastTargets ? { ref: "target", ...ctx.lastTargets } : /^(they|them|those creatures)$/i.test(x) && ctx.lastGroup ? ctx.lastGroup : null;
  // "Tap each creature dealt damage this way" (Aurelia's Fury): what this spell's or ability's damage hit.
  const dealt = /^each (creature|planeswalker|permanent) dealt damage this way$/i.exec(x);
  if (dealt) return { ref: "damagedThisWay", ...(dealt[1]!.toLowerCase() !== "permanent" ? { filter: { kind: "object" as const, types: [dealt[1]![0]!.toUpperCase() + dealt[1]!.slice(1).toLowerCase()], text: dealt[1]!.toLowerCase() } } : {}) };
  const several = SEVERAL_TARGETS.exec(x);
  if (several) return parseSeveralTargets(several, ctx, cards);
  // After it left the battlefield, its name means the card where it went (CR 400.7 makes the permanent gone).
  if (x === "~") return ctx.selfCard ? { ref: "selfCard" } : { ref: "self" };
  if (ctx.subjectIt && /^that (land|artifact|enchantment|token|[A-Z][a-z]+)$/.test(x) && ctx.lastObjectTarget === undefined) return { ref: "subject" };
  // A legendary character's "him" or "her" is the card itself ("Then put a +1/+1 counter on her").
  if (/^(him|her)$/i.test(x) && !ctx.spell) return ctx.selfCard ? { ref: "selfCard" } : { ref: "self" };
  // "Untap target creature and gain control of it ... the creature gains ..." (Flash Conscription): the one creature it
  // targets.
  if (/^the creature$/i.test(x) && ctx.lastObjectTarget !== undefined && ctx.targets.filter((t) => t.kind === "object").length === 1 && !ctx.lastCreated) return { ref: "target", index: ctx.lastObjectTarget };
  if (/^(it|that creature|that permanent)$/i.test(x)) {
    if (ctx.lastCreated && (/^it$/i.test(x) || (ctx.lastPut && /^that creature$/i.test(x)))) return { ref: "created" };
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if (ctx.subjectIt) return { ref: "subject" };
    // "Tap enchanted creature. ... put three stun counters on it": the creature named last.
    if (ctx.lastAttached && /^it$/i.test(x)) return { ref: "attached" };
    if (ctx.selfIt && /^it$/i.test(x)) return { ref: "self" };
    if (ctx.selfCard && /^it$/i.test(x)) return { ref: "selfCard" };
    return ctx.subject && /^that creature$/i.test(x) ? { ref: "subject" } : null;
  }
  // "Put a +1/+1 counter on target creature you control, then it fights target creature you don't control. ... the
  // creature you control gains indestructible" (Outmuscle): the one target described that way.
  const described = /^the (creature you control|creature you don't control)$/i.exec(x);
  if (described) {
    const at = ctx.targets.flatMap((t, i) => (t.kind === "object" && t.text === `target ${described[1]!.toLowerCase()}` ? [i] : []));
    return at.length === 1 ? { ref: "target", index: at[0]! } : null;
  }
  // "Enchanted creature", "equipped creature": what the source is attached to (not targeted).
  if (/^(enchanted|equipped) (creature|permanent|artifact|land)$/i.test(x) && !ctx.spell) {
    ctx.lastAttached = true;
    return { ref: "attached" };
  }
  // "Target creature and all other creatures with the same name as that creature" (Maelstrom Pulse, Homing Lightning,
  // Declaration in Stone's "all other creatures its controller controls", Legions to Ashes' "all tokens that player
  // controls"): one target, and the others by name as it resolves.
  const same = /^(target .+?) and (all|each) (?:other )?(.+?) with the same name as that (creature|permanent|artifact|enchantment|land)$/i.exec(x);
  if (same && !cards) {
    let rest = same[3]!;
    const ctl = / (?:its controller|that player) controls$/i.exec(rest);
    if (ctl) rest = rest.slice(0, ctl.index);
    const g = /^tokens$/i.test(rest) ? { filter: { kind: "object" as const, token: true, text: "tokens" }, other: false } : parseGroup(`${same[2]} ${rest}`, true);
    if (!g || g.other || (ctl && g.filter.controller)) return null;
    const t = parseObjectNow(same[1]!, ctx, cards);
    if (t?.ref !== "target" || t.n) return null;
    if (ctl) ctx.controllerNamed = t.index;
    return { ...t, sameName: { filter: g.filter, ...(ctl ? { of: true as const } : {}) } };
  }
  // "Each creature target player controls", "all lands target opponent controls", "creatures that player controls": the
  // group among that player's permanents (the player targeted here or by an earlier sentence, or a trigger's player).
  const of = /^(.+?) (target player|target opponent|that player) controls\b(.*)$/i.exec(x);
  const ofGroup = of && !/^(?:up to |another |any number of |one or |\w+ )?(?:other )?target\b/i.test(of[1]!) ? parseGroup(`${of[1]}${of[3]}`, true) : null;
  if (of && ofGroup && !ofGroup.other && !ofGroup.filter.controller) {
    const who = of[2]!.toLowerCase();
    let whose: PlayerRef | null = null;
    if (who.startsWith("target ")) {
      const index = addTarget(ctx, { kind: "player", opponent: who === "target opponent", text: who });
      ctx.lastPlayerTarget = index;
      whose = { ref: "target", index };
    } else whose = parsePlayer("that player", ctx);
    if (!whose || (whose.ref === "target" && whose.n)) return null;
    return { ref: "each", filter: { ...ofGroup.filter, text: x.toLowerCase() }, of: whose };
  }
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
  const spec = parseTargetPhrase(phrase, { x: true });
  if (!spec || spec.kind === "player" || spec.kind === "spell" || (spec.kind === "card") !== cards || (theirs && (spec.kind !== "object" || spec.controller))) return null;
  // "Target creature with power X or less": the X of a spell or of an activated ability's cost (CR 107.3a).
  if (spec.xRange && ((!ctx.spell && !ctx.activated) || ctx.whereX)) return null;
  return { ref: "target", index: addTarget(ctx, theirs ? { ...spec, controller: "eventPlayer", text: `target ${m[1]!}` } : spec) };
}

/** "Creature that player controls" in a trigger about a player: the phrase without it, and whether it was there. */
function thatPlayerControls(phrase: string, ctx: Ctx): [string, boolean] {
  const m = / that player controls$/i.exec(phrase);
  if (m && ctx.eventPlayer) return [phrase.slice(0, m.index), true];
  // "Whenever ~ attacks, tap target creature defending player controls": the player it's attacking (CR 506.2, rulings).
  const d = / defending player controls$/i.exec(phrase);
  return d && ctx.defending ? [phrase.slice(0, d.index), true] : [phrase, false];
}

const SEVERAL_TARGETS = /^(?:(up to )?(one|two|three|four|five|six|\d+|X) (other )?|(another) |(one or two|one, two, or three|any number of) (other )?)target (.+)$/i;

/**
 * "Up to two target creatures", "two target artifacts", "one or two target creatures", "another target
 * creature", "up to one other target permanent you control" (CR 115.3, 115.6, 601.2c). Each is a
 * target of its own, in a row; "up to" ones may be left unchosen, and none can be the same as another
 * of them. "Another" or "other" means other than the targets before it, or with none before it, other
 * than the ability's source.
 */
function parseSeveralTargets(m: RegExpExecArray, ctx: Ctx, cards: boolean): ObjRef | null {
  const [, upTo, count, other0, another, range0, other1, phrase] = m;
  const range = range0?.toLowerCase();
  const other = other0 ?? other1;
  // "Any number of target creatures" (CR 601.2c, 115.6), "up to X target artifacts" with the spell's X (107.3a): how
  // many is announced as it's cast, so one entry stands for them all until then (TargetSpec.many).
  // "Destroy X target creatures": exactly X of them (Eliminate the Competition).
  const many = range === "any number of" ? ("any" as const) : count === "X" ? (upTo ? ("x" as const) : ("exactX" as const)) : undefined;
  // A spell's X, or an activated ability's {X} (CR 107.3a, 602.2b), announced before targets are chosen.
  if (count === "X" && (!(ctx.spell || ctx.activated) || ctx.whereX)) return null;
  const [required, n] = many ? [0, 1] : range ? (range.startsWith("one or two") ? [1, 2] : [1, 3]) : upTo ? [0, num(count!)] : another ? [1, 1] : [num(count!), num(count!)];
  if (n < 1 || n > 6) return null;
  const [mine0, theirs] = thatPlayerControls(phrase!, ctx);
  // "Cards from a single graveyard" (all in one), "creature cards that share a creature type" (each with each other).
  const single = (n > 1 || !!many) && / from a single graveyard$/.test(mine0);
  const share = (n > 1 || !!many) && / that share a creature type(?= from |$)/.test(mine0);
  const mine = mine0.replace(/ from a single graveyard$/, " from a graveyard").replace(/ that share a creature type(?= from |$)/, "");
  const parsed = parseTargetPhrase(n > 1 || many ? singularPhrase(mine) : mine);
  if (!parsed || parsed.kind === "player" || parsed.kind === "spell" || (parsed.kind === "card") !== cards || (theirs && (parsed.kind !== "object" || parsed.controller))) return null;
  const spec: TargetSpec = theirs ? { ...parsed, controller: "eventPlayer", text: `${parsed.text} that player controls` } : parsed;
  const before = ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "card" ? [i] : []));
  let notSource = false;
  if (other || another) {
    if (!before.length && ctx.spell) return null; // a spell has no source on the battlefield to be other than
    notSource = !before.length;
  }
  const first = ctx.targets.length;
  if (many) {
    if (single || share || ctx.targets.some((t) => t.many)) return null;
    addTarget(ctx, { ...spec, ...(notSource ? { notSource } : {}), ...(other && before.length ? { distinctFrom: before } : {}), many });
    // "It" can't mean one of them; "they", "those creatures" means all of them, however many.
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return { ref: "target", index: first, n: 2 };
  }
  for (let k = 0; k < n; k++) {
    const distinct = [...(other || another ? before : []), ...Array.from({ length: k }, (_, j) => first + j)];
    const group = Array.from({ length: k }, (_, j) => first + j);
    addTarget(ctx, {
      ...spec,
      ...(k >= required ? { optional: true } : {}),
      ...(notSource ? { notSource } : {}),
      ...(distinct.length ? { distinctFrom: distinct } : {}),
      ...(single && k ? { sameGraveyardAs: group } : {}),
      ...(share && k ? { sharesCreatureTypeWith: group } : {}),
      ...(single || share ? { text: `${spec.text.replace(/ from a graveyard$/, single ? " from a single graveyard" : " from a graveyard")}${share ? " sharing a creature type" : ""}` } : {}),
    });
  }
  // "It" can't mean one of several; "they" / "those creatures" means all of them.
  if (n > 1) ctx.lastObjectTarget = undefined;
  ctx.lastTargets = { index: first, ...(n > 1 ? { n } : {}) };
  return { ref: "target", index: first, ...(n > 1 ? { n } : {}) };
}

/**
 * "creatures you control" -> "creature you control", "creature cards from your graveyard" -> "creature card from your
 * graveyard". "Artifacts and/or enchantments" -> "artifact or enchantment": each target is one or the other. "Creature
 * cards each with mana value 2 or less" -> "creature card with mana value 2 or less".
 */
function singularPhrase(p: string): string {
  const words = p.trim().replace(/ and\/or /g, " or ").replace(/ each (?=with )/, " ").split(" ");
  const plural = (w: string) => /^(creatures|cards|permanents|artifacts|enchantments|lands|planeswalkers|battles)$/i.test(w);
  if (words.some(plural)) words.forEach((w, i) => plural(w) && (words[i] = singular(w)));
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
  outlaws: "outlaw", // CR 700.12
  artifacts: "artifact",
  enchantments: "enchantment",
  lands: "land",
  permanents: "permanent",
  planeswalkers: "planeswalker",
  battles: "battle",
  // "Destroy all Islands" (basic land types, CR 205.3i); "Plains" is the same in the plural.
  islands: "Island",
  swamps: "Swamp",
  mountains: "Mountain",
  forests: "Forest",
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
  // "Creatures of the chosen type get +3/+3 until end of turn": every creature of that type.
  const ofChosen = /^creatures of the chosen type$/i.test(p);
  if (!all && !whose.test(p) && !bare && !combat && !ofChosen) return null;
  // The kinds come first; plurals become the singular parseTargetPhrase reads ("Elves" -> "Elf").
  const cut = /\b(with|without|you control|your opponents control|an opponent controls|you don't control|of the chosen|of that|that aren't|that are not|not of|that attacked this turn)\b/i.exec(p);
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

/** The creature types that make an object an outlaw (CR 700.12). */
export const OUTLAW_TYPES = ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"];

/** Parse the words after "target": "nonblack creature an opponent controls", "artifact or enchantment", "spell", ... */
export function parseTargetPhrase(phrase: string, opts: { chosen?: boolean; /** "with power X or less" may be the X announced (TargetSpec.xRange). */ x?: boolean } = {}): TargetSpec | null {
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
  // "Untap all creatures that attacked this turn" (Relentless Assault), "creatures you control that attacked this turn".
  const attacked = / that attacked this turn$/.exec(p);
  if (attacked) {
    extra.combat = "attackedThisTurn";
    p = p.slice(0, attacked.index);
  }
  // "Destroy all creatures that aren't enchanted" (Winds of Rath), "target creature that isn't enchanted" (Brainspoil).
  const bare = / that (?:isn't|aren't|is not|are not) enchanted$/.exec(p);
  if (bare) {
    extra.status = "unenchanted";
    p = p.slice(0, bare.index);
  }
  // "creature an opponent controls that was dealt damage this turn"
  const hurt = / that was dealt damage this turn$/.exec(p);
  if (hurt) {
    extra.dealtDamageThisTurn = true;
    p = p.slice(0, hurt.index);
  }
  // "creature with a +1/+1 counter on it", "creatures with ice counters on them"
  const counter = / with (?:an? ([+-]1\/[+-]1|ice) counter on it|([+-]1\/[+-]1|ice) counters on them)/.exec(p);
  if (counter) {
    extra.counter = counter[1] ?? counter[2]!;
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
  if ((m = /(?:^| )with (power|toughness|mana value) (\d+|x)(?: or (greater|less))?$/.exec(p))) {
    const key = m[1] === "mana value" ? "manaValue" : (m[1] as "power" | "toughness");
    // "With mana value 2" (Spell Snare): exactly that. With X, the X it's cast or activated with (TargetSpec.xRange).
    if (m[2] === "x" && !opts.x) return null;
    if (m[2] === "x") extra.xRange = { key, at: m[3] === "greater" ? "least" : m[3] === "less" ? "most" : "exact" };
    else {
      const n = Number(m[2]);
      extra[key] = m[3] === "greater" ? { min: n } : m[3] === "less" ? { max: n } : { min: n, max: n };
    }
    p = p.slice(0, m.index);
  } else if ((m = / with an? (even|odd) mana value$/.exec(p))) {
    // "Permanent ... with an even mana value" (Desecrate Reality; zero is even).
    extra.manaValue = { parity: m[1] as "even" | "odd" };
    p = p.slice(0, m.index);
  } else if ((m = / (with|without) ([a-z ]+?)( you control| you don't control| an opponent controls)?$/.exec(p))) {
    // "Creature you control with flash or haste" (Shadow the Hedgehog): one of them is enough.
    const either = m[1] === "with" ? /^([a-z]+) or ([a-z]+)$/.exec(m[2]!) : null;
    const kws = either ? [either[1]!, either[2]!].map((k) => keywordOf(k)) : parseKeywordList(m[2]!);
    if (!kws || kws.some((k) => !k) || kws.length !== (either ? 2 : 1)) return null;
    if (either) extra.anyOf = kws.map((k) => ({ kind: "object" as const, keywords: [k!], text: k!.toLowerCase() }));
    else if (m[1] === "with") extra.keywords = kws as string[];
    else extra.notKeywords = kws as string[];
    // "Creature without flying you don't control" (Street Spasm): whose it is, read below.
    p = p.slice(0, m.index) + (m[3] ?? "");
  }
  // "Target 1/1 creature" (Pendelhaven, The Seedcore): power and toughness exactly those.
  if ((m = /^(\d+)\/(\d+) (?=creature\b)/.exec(p)) && !extra.power && !extra.toughness) {
    extra.power = { min: Number(m[1]), max: Number(m[1]) };
    extra.toughness = { min: Number(m[2]), max: Number(m[2]) };
    p = p.slice(m[0].length);
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
  // "Creature or Vehicle": a creature, or a Vehicle whether or not it's a creature right now.
  if (p === "creature or vehicle") {
    extra.orSubtypes = ["Vehicle"];
    p = p.replace(/ or vehicle$/, "");
  }
  const alts = p ? p.split(/,? or |, /) : [];
  // "artifact creature" is one object with both types; "artifact or creature" is either.
  const typeWords = alts.map((alt) => alt.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).length);
  if (typeWords.some((n) => n > 1) && alts.length > 1) return null;
  const allTypes = typeWords[0]! > 1 ? alts[0]!.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).map((w) => TYPE_WORDS[w]!) : null;
  // "Artifact, enchantment, or nonbasic land" (Boseiju, Who Endures): each alternative has one card type, and some have a
  // quality of their own. The object must fit one of them (TargetSpec.anyOf); `types` stays their card types.
  // A quality only on the first one ("nontoken artifact or creature") may be meant for them all, so that isn't read this way.
  const quality = (a: string) => a.trim().split(/\s+/).some((w) => !TYPE_WORDS[w]);
  const leading = quality(alts[0] ?? "") && !alts.slice(1).every(quality);
  if (alts.length > 1 && typeWords.every((n) => n === 1) && alts.some(quality) && !leading && !inGraveyard && !isSpell && !extra.token && !extra.status && extra.commander === undefined) {
    if (extra.anyOf) return null;
    const anyOf: TargetSpec[] = [];
    for (const alt of alts) {
      const sub = parseTargetPhrase(alt);
      if (sub?.kind !== "object" || sub.controller || sub.tapped !== undefined || sub.combat || sub.anyOf) return null;
      anyOf.push(sub);
    }
    const types = [...new Set(anyOf.flatMap((a) => a.types ?? []))];
    return { kind: "object", types, notTypes: [], notColors: [], anyOf, ...extra, controller, ...(tapped !== undefined ? { tapped } : {}), text };
  }
  let outlaw = false;
  for (const alt of alts) {
    const words = alt.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if (w === "outlaw") {
        // "Outlaw": Assassin, Mercenary, Pirate, Rogue and/or Warlock (CR 700.12), any of them; alone among subtypes.
        if (alts.length > 1 || subtypes.length) return null;
        subtypes.push(...OUTLAW_TYPES);
        outlaw = true;
      } else if (w === "non-outlaw") {
        if (alts.length > 1 || notSubtypes.length) return null;
        notSubtypes.push(...OUTLAW_TYPES);
      } else if (w === "suspected") {
        // "Suspected creature" (CR 701.60).
        if (alts.length > 1 || extra.suspected) return null;
        extra.suspected = true;
      } else if (w === "token" || w === "nontoken") {
        if (alts.length > 1) return null;
        extra.token = w === "token";
      } else if ((w === "enchanted" || w === "equipped" || w === "modified") && !extra.status) {
        // "Enchanted creatures you control", "an equipped creature", "modified creature" (CR 700.9).
        if (alts.length > 1) return null;
        extra.status = w;
      } else if (w === "commander" || w === "noncommander") {
        // A commander on the battlefield (CR 903.3): "commander creature you control", "noncommander creature".
        if (alts.length > 1 || extra.commander !== undefined) return null;
        extra.commander = w === "commander";
      } else if (w.startsWith("non")) {
        const rest = w.slice(3).replace(/^-/, "");
        if (COLOR_WORDS[rest]) notColors.push(COLOR_WORDS[rest]!);
        else if (TYPE_WORDS[rest]) notTypes.push(TYPE_WORDS[rest]!);
        else if (SUPERTYPE_WORDS[rest]) notSupertypes.push(SUPERTYPE_WORDS[rest]!);
        else if (alts.length === 1 && (CREATURE_TYPES.has(capital(rest)) || BASIC_TYPES.includes(capital(rest)) || ["Aura", "Equipment", "Vehicle", "Lair"].includes(capital(rest)))) notSubtypes.push(capital(rest)); // "non-Wall", "non-Aura", "non-Lair"
        else return null;
      } else if (TYPE_WORDS[w]) types.push(TYPE_WORDS[w]!);
      // "Nonlegendary attacking creature": attacking after a supertype.
      else if ((w === "attacking" || w === "blocking") && alts.length === 1 && !extra.combat) extra.combat = w;
      else if (CREATURE_TYPES.has(capital(w)) || BASIC_TYPES.includes(capital(w)) || OTHER_SUBTYPES.includes(capital(w))) subtypes.push(capital(w));
      // A hyphenated creature type: "Assembly-Worker".
      else if (w.includes("-") && HYPHENATED.has(w)) subtypes.push(HYPHENATED.get(w)!);
      else if (COLOR_WORDS[w]) colors.push(COLOR_WORDS[w]!);
      else if ((w === "multicolored" || w === "monocolored" || w === "colorless") && alts.length === 1 && !extra.colorCount) extra.colorCount = w;
      else if (SUPERTYPE_WORDS[w]) supertypes.push(SUPERTYPE_WORDS[w]!);
      else if (w === "permanent" && inGraveyard) types.push(...PERMANENT_TYPES); // "permanent card" (CR 110.4b)
      else if (w === "permanent" || w === "") continue;
      else return null;
    }
  }
  if (outlaw && subtypes.length !== OUTLAW_TYPES.length) return null;
  // "red or green creature" means a creature that's red or green. Mixing colors with several
  // different type alternatives ("red creature or green artifact") isn't modeled.
  if (colors.length && alts.filter((a) => a.split(/\s+/).some((w) => TYPE_WORDS[w])).length > 1) return null;
  // "Swamp, Mountain, black permanent, or red permanent": a color in only some alternatives would need
  // per-alternative filters too (the fields of a filter must all match).
  if (colors.length && alts.length > 1 && alts.some((a) => !a.trim().split(/\s+/).some((w) => COLOR_WORDS[w]))) return null;
  // Supertypes are "and" requirements ("basic land"); with alternatives they'd need per-alternative filters.
  // "Nonlegendary, nonland card" is one card that's neither: only "non" words, so every one is required.
  const onlyNon = alts.every((a) => a.trim().split(/\s+/).every((w) => w.startsWith("non") || w === "permanent"));
  if ((supertypes.length || (notSupertypes.length && !onlyNon)) && alts.length > 1) return null;
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
    if (isSpell || tapped !== undefined || extra.combat || extra.token !== undefined || extra.commander !== undefined || extra.status) return null;
    return { kind: "card", ...filters, ...(owner ? { owner } : {}), text };
  }
  if (isSpell) return extra.keywords || extra.notKeywords || extra.anyOf || extra.power || extra.toughness || extra.combat || extra.token !== undefined || extra.commander !== undefined || extra.status || supertypes.length ? null : { kind: "spell", ...filters, ...(controller ? { controller } : {}), text };
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
