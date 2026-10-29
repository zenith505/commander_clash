import { allEffects, type AbilityBody, type ActivatedAbility, type AdditionalCost, type Effect, type TargetSpec } from "../abilities";
import { NUM, num, X, sacrificeSelf, counterKind, singular } from "./words";
import { removeCounterCost } from "./mana-abilities";
import { parseBody, usesX } from "./body";
import { parseSearchFilter } from "./search";
import { blightCost, parseAdditionalCost } from "./keyword-abilities";
import { pickFilter } from "./targets";
import { parseOnlyClauses } from "./statics";
import { parseCount } from "./counts";
import type { ManaType } from "../types";

/** The ability words (CR 207.2c): no rules meaning, unlike keyword abilities written the same way ("Boast — {1}{R}: ..."). */
const ABILITY_WORDS = new Set(["adamant", "addendum", "alliance", "battalion", "bloodrush", "celebration", "channel", "chroma", "cohort", "constellation", "converge", "corrupted", "council's dilemma", "coven", "delirium", "descend 4", "descend 8", "disappear", "domain", "eerie", "eminence", "enrage", "fateful hour", "fathomless descent", "ferocious", "flurry", "formidable", "grandeur", "hellbent", "heroic", "imprint", "infusion", "inspired", "join forces", "kinship", "landfall", "lieutenant", "magecraft", "metalcraft", "morbid", "opus", "pack tactics", "paradox", "parley", "radiance", "raid", "rally", "renew", "repartee", "revolt", "secret council", "spell mastery", "strive", "survival", "sweep", "tempting offer", "threshold", "undergrowth", "valiant", "vivid", "void", "will of the council"]);

/**
 * Keyword abilities written "[Keyword] — [cost]: [effect]" have rules meaning (CR 702: these are its keywords, with max
 * speed from 702.179 and Case's "solved"); any other italic word before an ability that isn't an ability word is a
 * flavor word (CR 207.2d), with no rules meaning.
 */
const KEYWORD_NAMES = new Set(["defender", "double strike", "enchant", "equip", "first strike", "flash", "flying", "haste", "hexproof", "indestructible", "intimidate", "landwalk", "lifelink", "protection", "reach", "shroud", "trample", "vigilance", "ward", "rampage", "cumulative upkeep", "flanking", "phasing", "buyback", "shadow", "cycling", "echo", "fading", "kicker", "flashback", "madness", "fear", "morph", "amplify", "provoke", "storm", "affinity", "entwine", "modular", "sunburst", "bushido", "soulshift", "splice", "offering", "ninjutsu", "epic", "convoke", "dredge", "transmute", "bloodthirst", "haunt", "replicate", "forecast", "graft", "ripple", "split second", "suspend", "vanishing", "absorb", "aura swap", "delve", "fortify", "frenzy", "gravestorm", "poisonous", "transfigure", "champion", "changeling", "evoke", "hideaway", "prowl", "reinforce", "conspire", "persist", "wither", "retrace", "devour", "exalted", "unearth", "cascade", "level up", "rebound", "umbra armor", "infect", "battle cry", "living weapon", "undying", "miracle", "soulbond", "overload", "scavenge", "unleash", "cipher", "evolve", "extort", "fuse", "bestow", "tribute", "dethrone", "hidden agenda", "outlast", "prowess", "dash", "exploit", "menace", "renown", "awaken", "devoid", "ingest", "myriad", "surge", "skulk", "emerge", "escalate", "melee", "crew", "fabricate", "partner", "improvise", "aftermath", "embalm", "eternalize", "afflict", "ascend", "assist", "jump-start", "mentor", "afterlife", "riot", "spectacle", "escape", "companion", "mutate", "encore", "boast", "foretell", "demonstrate", "daybound and nightbound", "disturb", "cleave", "training", "compleated", "reconfigure", "blitz", "casualty", "enlist", "read ahead", "ravenous", "squad", "space sculptor", "visit", "prototype", "living metal", "more than meets the eye", "for mirrodin!", "toxic", "backup", "bargain", "craft", "disguise", "solved", "plot", "saddle", "spree", "freerunning", "gift", "offspring", "impending", "exhaust", "start your engines!", "harmonize", "mobilize", "job select", "tiered", "station", "warp", "mayhem", "firebending", "sneak", "increment", "paradigm", "power-up", "teamwork", "max speed", "level"]);

/** Keywords written "[Keyword] — [text]", which keep their dash: not ability or flavor words. */
export const KEYWORD_WORDS = KEYWORD_NAMES;

/** A line without its ability word ("Threshold — "), which has no rules meaning (CR 207.2c). */
export function stripAbilityWord(raw: string): string {
  const word = /^([A-Z][A-Za-z' 0-9]+) — /.exec(raw);
  if (!word) return raw;
  if (ABILITY_WORDS.has(word[1]!.toLowerCase())) return raw.slice(word[0].length);
  // A flavor word before a mana ability ("Genomic Enhancement — {T}: Add ...", Biophagus) has no rules meaning either (CR
  // 207.2d). Not a keyword written with a dash ("Exhaust — ", CR 702), a modal choice ("Choose two — •") or a chapter.
  const flavor = /^\{/.test(raw.slice(word[0].length)) && !KEYWORD_NAMES.has(word[1]!.toLowerCase()) && !/^(?:Exhaust|Boast|Power-up|Choose\b|[IVX]+$)/.test(word[1]!);
  return flavor ? raw.slice(word[0].length) : raw;
}

export function parseActivated(raw: string): ActivatedAbility | "fail" | null {
  // An ability word (CR 207.2c), or a flavor word ("Blow Up — {T}, Sacrifice ~: ...", CR 207.2d): no rules meaning.
  const word = /^([A-Z][^—•":{}]*?) — /.exec(raw);
  // "Exhaust — [Cost]: [Effect]" means "[Cost]: [Effect]. Activate only once." (CR 702.177a); "Boast — [Cost]: [Effect]"
  // means "... Activate only if this creature attacked this turn and only once each turn." (CR 702.142a); "Power-up —
  // [Cost]: [Effect]" means "[Cost]: [Effect]. If this permanent entered this turn, this ability's cost is reduced by this
  // permanent's mana cost. Activate this ability only once." (CR 702.193a). "Forecast — [Cost], Reveal ~ from your hand:
  // [Effect]" works only from its owner's hand, only during their upkeep and only once each turn (CR 702.57a-b).
  const keyword = word && /^(Exhaust|Boast|Power-up|Forecast)$/.test(word[1]!) ? (word[1] as "Exhaust" | "Boast" | "Power-up" | "Forecast") : undefined;
  // "Remove five quest counters from ~ and sacrifice it" (Quest for the Holy Relic): two costs, paid in any order (CR 601.2h).
  const line = (word && (keyword || ABILITY_WORDS.has(word[1]!.toLowerCase()) || !KEYWORD_NAMES.has(word[1]!.toLowerCase())) ? raw.slice(word[0].length) : raw).replace(/(^|, )(Remove [^,:]+? counters? from ~) and sacrifice it:/, "$1$2, Sacrifice ~:").replace(/(^|, )(Remove [^,:]+? counters? from ~) and exile it:/, "$1$2, Exile ~:")
    // Sawtooth Thresher: "Remove two +1/+1 counters from ~: It gets +4/+4 until end of turn": "it" is ~, the one thing named.
    .replace(/^(Remove [^,:]+? counters? from ~): It (gets|gains) /, "$1: ~ $2 ")
    // Sandstone Deadfall: "Sacrifice two lands and ~", Zombie Assassin: "Exile two cards from your graveyard and ~": the
    // same costs as "Sacrifice ~ and two lands", "Exile two cards from your graveyard, Exile ~" (paid in any order, CR 601.2h).
    .replace(/(^|, )Sacrifice (an?|two|three) ([a-z]+) and ~(?=[,:])/, "$1Sacrifice ~ and $2 $3")
    .replace(/(^|, )(Exile (?:a|one|two|three) cards? from your graveyard) and ~(?=[,:])/, "$1$2, Exile ~")
    // The Heralds: "Sacrifice a white creature, a blue creature, and a black creature": one cost, three different creatures
    // (rulings); Urborg Panther: "Sacrifice a creature named Feral Shadow, a creature named Breathstealer, and ~": the
    // permanent itself and one of each of the others.
    .replace(/(^|, )Sacrifice (an? [a-z]+ creature|a creature named [A-Z][A-Za-z' -]*), (an? [a-z]+ creature|a creature named [A-Z][A-Za-z' -]*), and (an? [a-z]+ creature|a creature named [A-Z][A-Za-z' -]*|~)(?=:)/, (_, pre: string, a: string, b: string, c: string) => (c === "~" ? `${pre}Sacrifice ~, Sacrifice ${a}; and ${b}` : `${pre}Sacrifice ${a}; ${b}; and ${c}`));
  // Costs: mana symbols run together ("{1}{R}"), other parts are comma-separated ("{2}, {T}, Sacrifice ~").
  const piece = String.raw`(?:\{[^}]+\})+|Reveal the player you chose|Sacrifice ~ and (?:an?|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen) [^,:]+?|Sacrifice ~|Exert ~|Unattach ~|Tap enchanted (?:creature|land)|Return ~ to its owner's hand|Put ~ on the bottom of its owner's library|Discard ~|Discard your hand|Reveal ~ from your hand|Exile ~ from your graveyard|Exile ~ from your hand|Exile ~|Remove (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifty|\d+|X) (?:[+-]\d+/[+-]\d+|[a-z]+) counters? from ~|Remove all (?:[+-]1/[+-]1|[a-z]+) counters from ~|Remove a counter from ~|Remove (?:a|one|two|three|four|five|six|seven|eight|nine|ten) (?:(?:[+-]1/[+-]1|[a-z]+) )?counters? from among (?:[^,:]+?, )*?[^,:]+? you control|Remove an? (?:(?:[+-]1/[+-]1|[a-z]+) )?counter from (?:an?|another) (?:permanent|nonland permanent|creature|artifact) you control|Put (?:a|an|one|two|three) (?:[+-]1/[+-]1|[a-z]+) counters? on ~|Put an? [+-]1/[+-]1 counter on an? creature you control|Blight \d+|Pay \d+ life|Pay life equal to the number of colors in your commanders' color identity|Pay half your life, rounded (?:up|down)|Pay (?:\{E\})+|Pay \w+ \{E\}|Sacrifice (?:an?|another|one|two|three|four|five|six|seven|eight|nine|ten|X) [^,:]+?|Discard (?:an?|one|two|three) [^,:]*?cards?(?: at random)?|Discard a card with mana value X|Discard another card named ~|Discard X cards|Reveal X (?:white|blue|black|red|green) cards from your hand|Put (?:a|one|two|three) cards? from your hand on top of your library|Put a card exiled with ~ into its owner's graveyard|Tap (?:an|another|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|X) (?:other )?untapped [^,:]+? you control(?: other than ~)?|Untap (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty) tapped [^,:]+? you control|Collect evidence \d+|Mill (?:a card|\w+ cards)|Exile the top (?:[a-z]+ )?cards? of your graveyard|Exile the top (?:card|[a-z]+ cards) of your library|Exile (?:a|an|another|one|two|three|four|five) [^,:]*?cards? from your graveyard|Exile any number of cards from your graveyard|Exile (?:a|an|one|two) [^,:]*?cards? from your hand|Exile (?:an?|another) [^,:]+? you control|Exile ~ and (?:one|two|three|four|five) other [^,:]+? you control|Return (?:an?|two|three) [^,:]+? you control to (?:its|their) owner's hand|Forage`;
  // "Waterbend {N}" (CR 701.67a) is paying {N}, part of which tapped artifacts and creatures can pay.
  const water = /^Waterbend \{(\d+|X)\}(?=[,:])/.exec(line);
  const m = new RegExp(`^((?:${piece})(?:, (?:${piece}))*): (.+)$`).exec(water ? line.slice("Waterbend ".length) : line);
  if (!m) return null;
  // "Pay half your life, rounded up" (Murderous Betrayal) has a comma of its own: read it apart from the other costs.
  const halfLife = /Pay half your life, rounded (up|down)/.exec(m[1]!);
  // "Exile this Vehicle and four other artifact creatures and/or Vehicles you control" (Mechtitan Core): two costs, the
  // permanent itself and the others (CR 602.2b, 601.2h).
  const costs = (halfLife ? m[1]!.replace(halfLife[0], "Pay half your life") : m[1]!).replace(/(^|, )Exile ~ and (one|two|three|four|five) other ([^,:]+? you control)(?=, |$)/, "$1Exile ~, Exile $2 other $3");
  // Sacrificing other permanents or discarding cards as part of the cost (CR 602.2b, 601.2h).
  const extra: AdditionalCost[] = [];
  let removeCounters: ActivatedAbility["removeCounters"];
  let putCounters: ActivatedAbility["putCounters"];
  // "From among other artifacts, creatures, and planeswalkers you control" is one cost, commas and all.
  for (const part of costs.replace(/from among [^:]+? you control/g, (x) => x.replaceAll(", ", "; ")).split(", ").map((x) => x.replaceAll("; ", ", "))) {
    let c: RegExpExecArray | null;
    if ((c = new RegExp(`^Put ${NUM} ([+-]1/[+-]1|[a-z]+) counters? on ~$`).exec(part))) putCounters = { counter: counterKind(c[2]!), n: num(c[1]!) };
    else if ((c = /^Put an? ([+-]1\/[+-]1) counter on an? (creature) you control$/.exec(part))) {
      // Hatchet Bully: "Put a -1/-1 counter on a creature you control": any one of them, ~ too.
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "putCounter", counter: counterKind(c[1]!), n: 1, filter: { ...filter, controller: "you", text: `${c[2]} you control` } });
    } else if ((c = /^Blight (\d+)$/.exec(part))) {
      // Blight N (CR 701.68a): N -1/-1 counters on one creature you control (Gristle Glutton, Sting-Slinger).
      extra.push(blightCost(Number(c[1])));
    }
    else if ((c = new RegExp(`^Remove ${NUM} (?:([+-]1/[+-]1|[a-z]+) )?counters? from among (other )?(.+) you control$`).exec(part))) {
      // Tekuthal, Hopeful Initiate: counters on permanents you control, any mix of them (CR 602.2b). "Artifacts,
      // creatures, and planeswalkers": a permanent of any of those types.
      const what = c[4]!.split(/, (?:and |or )?| and | or /).map((w) => singular(w));
      const filter = pickFilter(what.length > 2 ? `${what.slice(0, -1).join(", ")}, or ${what.at(-1)}` : what.join(" or "));
      if (!filter || filter.kind !== "object" || filter.controller) return "fail";
      extra.push({ kind: "removeCounters", n: num(c[1]!), filter: { ...filter, text: `${c[3] ?? ""}${c[4]} you control` }, ...(c[2] ? { counter: counterKind(c[2]) } : {}), ...(c[3] ? { other: true as const } : {}) });
    } else if ((c = /^Remove an? (?:([+-]1\/[+-]1|[a-z]+) )?counter from (an?|another) (permanent|nonland permanent|creature|artifact) you control$/.exec(part)) && c[1] !== "additional") {
      // "Remove a counter from a permanent you control" (Scholar of New Horizons), "... a nonland permanent ..." (O'aka): any
      // kind, on any one of them.
      // Hexavus: "from another creature you control": not this one.
      const filter = pickFilter(c[3]!);
      if (!filter) return "fail";
      extra.push({ kind: "removeCounters", n: 1, filter: { ...filter, controller: "you", text: `${c[2] === "another" ? "another " : ""}${c[3]} you control` }, ...(c[1] ? { counter: counterKind(c[1]) } : {}), ...(c[2] === "another" ? { other: true as const } : {}) });
    } else if (part === "Remove a counter from ~") {
      // Glen Elendra Guardian: a counter of any kind on this permanent (CR 602.2b), chosen as the cost is paid.
      extra.push({ kind: "removeCounters", n: 1, filter: { kind: "object", text: "~" }, self: true });
    } else if ((c = /^Remove all ([+-]1\/[+-]1|[a-z]+) counters from ~$/.exec(part))) {
      // Sage of Hours: however many there are, none included (rulings); see StackItem.countersRemoved.
      if (removeCounters) return "fail";
      removeCounters = { counter: counterKind(c[1]!), n: 0, all: true };
    } else if ((c = /^Remove X ([+-]1\/[+-]1|[a-z]+) counters from ~$/.exec(part))) {
      // The Bakus: "Remove X ki counters from ~": X announced, then that many removed (CR 107.3a, 601.2b).
      if (removeCounters) return "fail";
      removeCounters = { counter: counterKind(c[1]!), n: 0, x: true };
    } else if (/^Remove /.test(part)) {
      const rc = removeCounterCost(part);
      if (!rc || !Number.isFinite(rc.n)) return "fail"; // "Remove X counters" isn't modeled
      removeCounters = rc;
    } else if ((c = new RegExp(`^Sacrifice ~ and ${NUM} (.+)$`).exec(part))) {
      // Mount Doom: "Sacrifice ~ and a legendary artifact": this permanent and another one (CR 602.2b). Glass-Cast Heart:
      // "Sacrifice this artifact and thirteen Blood tokens", each one another permanent (rulings).
      const n = num(c[1]!);
      const filter = pickFilter(n > 1 ? c[2]!.split(" ").map((w, i, all) => (i === all.length - 1 ? singular(w) : w)).join(" ") : c[2]!);
      if (!filter || !Number.isInteger(n) || n < 1) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: c[2]! }, n, other: true });
    } else if ((c = /^Sacrifice an? ([A-Z]\w+|creature) and an? ((?:snow )?[A-Z]\w+)$/.exec(part)) && c[1] !== c[2]) {
      // Viscerid Drone: "Sacrifice a creature and a Swamp", "... and a snow Swamp": the same, one of each.
      // "Sacrifice a Swamp and a Forest" (Jarad, Golgari Lich Lord): two permanents, one of each; a land that's both
      // counts as only one of them (rulings, CR 602.2b).
      const a = pickFilter(c[1]!);
      const b = pickFilter(c[2]!);
      const both = a?.kind === "object" && b?.kind === "object" ? (pickFilter(`${c[1]} or ${c[2]}`) ?? { kind: "object" as const, anyOf: [a, b], text: `${c[1]} or ${c[2]}` }) : null;
      if (!a || !b || !both || a.kind !== "object" || b.kind !== "object") return "fail";
      extra.push({ kind: "sacrifice", filter: { ...both, text: `${c[1]} and a ${c[2]}` }, n: 2, oneOfEach: [a, b] });
    } else if ((c = /^Sacrifice (an? [^,]+), (?:(an? [^,]+), )?and (an? [^,]+)$/.exec(part))) {
      // The Heralds, Urborg Panther (kept as one part above): one permanent for each, all different (rulings on Sphinx's Herald;
      // a multicolored creature pays for one of them only, CR 602.2b).
      const items = [c[1]!, c[2], c[3]!].filter((x): x is string => !!x).map((x) => x.replace(/^an? /, ""));
      const specs = items.map((x) => pickFilter(x));
      if (specs.some((f) => f?.kind !== "object")) return "fail";
      const anyOf = specs as TargetSpec[];
      extra.push({ kind: "sacrifice", filter: { kind: "object", types: [], notTypes: [], notColors: [], anyOf, text: items.length === 2 ? `${items[0]} and a ${items[1]}` : `${items[0]}, a ${items[1]}, and a ${items[2]}` }, n: items.length, oneOfEach: anyOf });
    } else if ((c = /^Sacrifice another (\w+) or an? (\w+(?: token)?)$/.exec(part))) {
      // "Sacrifice another creature or an artifact" (Street Urchin): this permanent too if it's an artifact (rulings).
      // "Sacrifice another creature or a Treasure" (Skullport Merchant): a card type or a subtype, either one. "Or a Blood
      // token" (Anje, Maid of Dishonor).
      const parts = [pickFilter(c[1]!), pickFilter(c[2]!)];
      const filter = pickFilter(`${c[1]} or ${c[2]}`) ?? (parts.every((x) => x?.kind === "object") ? { kind: "object" as const, types: [], notTypes: [], notColors: [], anyOf: parts as TargetSpec[], text: `${c[1]} or ${c[2]}` } : null);
      const selfIf = pickFilter(c[2]!);
      if (!filter || !selfIf) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: `${c[1]} or ${/^[aeiou]/i.test(c[2]!) ? "an" : "a"} ${c[2]}` }, n: 1, other: true, selfIf });
    } else if ((c = new RegExp(`^Sacrifice ${NUM} (.+) with different names$`).exec(part)) && num(c[1]!) > 1) {
      // Transmutation Font: "three artifact tokens with different names", each name once (a face-down permanent has none,
      // CR 708.2, so it shares none).
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: `${c[2]} with different names` }, n: num(c[1]!), differentNames: true });
    } else if (part !== "Sacrifice ~" && (c = new RegExp(`^Sacrifice (another|X|${NUM}) (other )?(.+)$`).exec(part))) {
      // "Sacrifice two other artifacts and/or creatures" (Mondrak): not this permanent; any mix of the two.
      const andOr = / and\/or /.test(c[4]!) ? c[4]!.split(" and/or ").map((w) => singular(w)).join(" or ") : undefined;
      // "Sacrifice a creature of the chosen type" (Etchings of the Chosen): the type chosen for the source as it entered,
      // bound as the cost is paid (activatedCosts).
      const ofChosen = !andOr && / of the chosen type$/.exec(c[4]!);
      // Shadowborn Apostle: "Sacrifice six creatures named ~": with this card's name (bound in compile, CR 201.5).
      const namedSelf = !andOr && !ofChosen && / named ~$/.exec(c[4]!);
      const cut = ofChosen || namedSelf;
      const head = cut ? pickFilter(c[4]!.slice(0, cut.index)) : null;
      const filter = ofChosen ? head && { ...head, chosen: "type" as const, text: c[4]! } : namedSelf ? head && { ...head, named: "~", text: c[4]! } : pickFilter(andOr ?? c[4]!); // NUM is a group of its own
      if (!filter || (c[3] && c[1] === "another")) return "fail";
      // "Sacrifice X Squirrels" (Chatterfang): X is announced as it's activated, and is how many (CR 107.3a, 602.2b).
      extra.push({ kind: "sacrifice", filter: c[3] ? { ...filter, text: `other ${andOr ?? c[4]!}` } : filter, n: c[1] === "another" || c[1] === "X" ? (c[1] === "X" ? 0 : 1) : num(c[1]!), ...(c[1] === "another" || c[3] ? { other: true } : {}), ...(c[1] === "X" ? { x: true as const } : {}) });
    } else if ((c = new RegExp(`^Tap (another|X|${NUM}) (other )?untapped (.+) you control( other than ~)?$`).exec(part))) {
      // "Tap another untapped creature you control" (Tyvar, the Pummeler): not the source. "Tap X untapped Knights you
      // control" (Aryel): X is announced as it's activated, and is how many (CR 107.3a, 602.2b).
      // Saradoc, Master of Buckland: "Tap two other untapped Halflings you control": not the source either. "Tap an
      // untapped red creature you control other than ~" (Impelled Giant): not the source either.
      // ${NUM} has groups of its own: the last three are "other", the permanents and "other than ~".
      const [otherWord, what, butSelf] = [!!c[c.length - 3], c[c.length - 2]!, !!c[c.length - 1]];
      const other = c[1] === "another" || otherWord || butSelf;
      if ((otherWord || butSelf) && (c[1] === "another" || c[1] === "X")) return "fail";
      if (otherWord && butSelf) return "fail";
      const filter = pickFilter(what.replace(/^([a-z]+)s and\/or ([a-z]+)s$/, "$1 or $2")); // "artifacts and/or creatures" (Warden of the Inner Sky): either
      if (!filter) return "fail";
      extra.push({ kind: "tap", filter: { ...filter, text: `untapped ${c[1] === "another" || otherWord ? "other " : ""}${filter.text} you control${butSelf ? " other than ~" : ""}` }, n: c[1] === "another" ? 1 : c[1] === "X" ? 0 : num(c[1]!), ...(/\{T\}/.test(costs) || other ? { other: true } : {}), ...(c[1] === "X" ? { x: true as const } : {}) });
    } else if ((c = new RegExp(`^Untap ${NUM} tapped (.+) you control$`).exec(part))) {
      // "Untap a tapped creature you control" (Halo Fountain): permanents that are tapped, any of them (CR 602.2b).
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "tap", filter: { ...filter, text: `tapped ${filter.text} you control` }, n: num(c[1]!), untap: true, ...(/\{T\}/.test(costs) ? { other: true } : {}) });
    } else if ((c = /^Discard a card with mana value X$/.exec(part))) {
      // Kozilek, the Great Distortion: X is announced as it's activated (CR 107.3a, 602.2b), before its targets.
      extra.push({ kind: "discard", n: 1, filter: { kind: "card", text: "card with mana value X" }, mvX: true });
    } else if ((c = /^Reveal X (white|blue|black|red|green) cards from your hand$/.exec(part))) {
      // The Martyrs (Martyr of Sands): X is announced as it's activated, then that many cards of the color are revealed,
      // staying in the hand (CR 107.3a, 602.2b, 701.20a).
      const filter = parseSearchFilter(`${c[1]} card`);
      if (!filter) return "fail";
      extra.push({ kind: "reveal", filter, n: 0, x: true });
    } else if (/^Discard another card named ~$/.test(part)) {
      // Grandeur (Tarox Bladewing, Baru): a card in your hand with its name; compile() puts the name in.
      extra.push({ kind: "discard", n: 1, filter: { kind: "card", types: [], notTypes: [], notColors: [], named: "~", text: "card named ~" } });
    } else if (/^Discard X cards$/.test(part)) {
      // "Discard X cards" (Gix, Yawgmoth Praetor): X announced as it's activated, and that many discarded (CR 107.3a, 602.2b).
      extra.push({ kind: "discard", n: 0, x: true });
    } else if ((c = new RegExp(`^Discard ${NUM} (?:(.+?) )?cards?( at random)?$`).exec(part))) {
      const filter = c[2] ? parseSearchFilter(`${c[2]} card`) : undefined;
      if (filter === null || (filter && c[3])) return "fail";
      extra.push({ kind: "discard", n: num(c[1]!), ...(filter ? { filter } : {}), ...(c[3] ? { random: true as const } : {}) });
    } else if ((c = new RegExp(`^Mill ${NUM} cards?$`).exec(part))) {
      // CR 701.17b: the top cards of your library, as many as it says or none.
      extra.push({ kind: "mill", n: num(c[1]!) });
    } else if ((c = /^Collect evidence (\d+)$/.exec(part))) {
      // CR 701.59a: exile cards from your graveyard with total mana value N or more.
      extra.push({ kind: "collectEvidence", n: Number(c[1]) });
    } else if ((c = /^Exile (an?|another) ([^,:]+?) you control$/.exec(part))) {
      // "Exile a creature you control" (The Soul Stone): a permanent you choose as it's activated (CR 602.2b, 601.2h),
      // exiled rather than sacrificed.
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter, n: 1, exile: true, ...(c[1] === "another" ? { other: true } : {}) });
    } else if ((c = /^Exile (one|two|three|four|five) other ([^,:]+?) you control$/.exec(part))) {
      // Mechtitan Core: "four other artifact creatures and/or Vehicles": not this permanent; any mix of the two.
      const andOr = / and\/or /.test(c[2]!) ? c[2]!.split(" and/or ").map((w) => w.split(" ").map((x, i, a) => (i === a.length - 1 ? singular(x) : x)).join(" ")).join(" or ") : singular(c[2]!);
      const filter = pickFilter(andOr);
      if (!filter || filter.kind !== "object") return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: `other ${c[2]}` }, n: num(c[1]!), exile: true, other: true });
    } else if (new RegExp(`^Exile ${NUM} (?:[^,:]+? )?cards? from your hand$`).test(part)) {
      // "Exile a nonland card from your hand" (Jhoira of the Ghitu): chosen as it's activated (CR 602.2b, 601.2h).
      const c2 = parseAdditionalCost(part);
      if (c2?.kind !== "exileFromHand" || c2.mvX) return "fail";
      extra.push(c2);
    } else if (/^Exile any number of cards from your graveyard$/.test(part) && /, where X is the number of cards exiled this way\.$/.test(m[2]!)) {
      // Painbringer: "Exile any number of cards from your graveyard: ... where X is the number of cards exiled this way":
      // how many is chosen as it's activated (CR 602.2b, 601.2h), so it's an X announced then (none included).
      extra.push({ kind: "exileFromGraveyard", n: 0, x: true });
    } else if (/^Exile (?!~|the top )/.test(part)) {
      // "Exile a card from your graveyard" (Relic of Progenitus' cousins, Sigarda): cards chosen as it's activated.
      const c2 = parseAdditionalCost(part);
      if (c2?.kind !== "exileFromGraveyard" || c2.top || c2.x) return "fail";
      extra.push(c2);
    } else if ((c = new RegExp(`^Exile the top (card|${NUM} cards) of your library$`).exec(part))) {
      // "{2}, Exile the top card of your library: You gain 1 life." (Royal Herbalist): face up; without enough cards
      // there, it can't be activated (Whirling Catapult's rulings, CR 118.3).
      extra.push({ kind: "mill", n: c[1] === "card" ? 1 : num(c[2]!), exile: true });
    } else if (/^Exile the top /.test(part)) {
      // "Exile the top creature card of your graveyard" (Necratog): no choice, the topmost one (CR 404.1).
      const top = parseAdditionalCost(part);
      if (top?.kind !== "exileFromGraveyard" || !top.top) return "fail";
      extra.push(top);
    } else if (/^Return (?!~)/.test(part)) {
      // "Return a Forest you control to its owner's hand" (Quirion Ranger), "return two lands you control to their owner's
      // hand" (Multani): permanents chosen and returned as it's activated (CR 602.2b, 601.2h).
      const r = parseAdditionalCost(part.replace(/^Return/, "return"));
      if (r?.kind !== "returnToHand" || r.x) return "fail";
      extra.push(r);
    } else if (part === "Forage") {
      // CR 701.61a: exile three cards from your graveyard or sacrifice a Food, as it's activated (CR 602.2b).
      extra.push({ kind: "forage" });
    } else if (/^Put a card exiled with ~ into its owner's graveyard$/.test(part)) {
      // Jester's Scepter: one of the cards its linked exile took (CR 607.2a).
      extra.push({ kind: "exileFromGraveyard", n: 1, linked: true });
    } else if ((c = new RegExp(`^Put ${NUM} cards? from your hand on top of your library$`).exec(part))) {
      // Several cards go on top in the order their owner chooses (CR 401.4): the first one picked ends up on top.
      extra.push({ kind: "exileFromHand", n: num(c[1]!), toLibrary: true });
    }
  }
  // "Tap enchanted creature" (Veteran's Voice): the creature tapped this way is the one this Aura is attached to as the
  // cost is paid, targets having been chosen first (CR 601.2c, 601.2h).
  const tapAttached = /(?:^|, )Tap enchanted (?:creature|land)(?=, |$)/.test(costs);
  let effectText = tapAttached ? m[2]!.replace(/\bother than the creature tapped this way\b/, "other than enchanted creature") : m[2]!;
  // Painbringer: the X its cost announced (see above).
  if (/(?:^|, )Exile any number of cards from your graveyard(?=, |$)/.test(costs) && extra.some((c) => c.kind === "exileFromGraveyard" && c.x)) effectText = effectText.replace(/, where X is the number of cards exiled this way\.$/, ".");
  let sorcerySpeed = false;
  let oncePerTurn = keyword === "Boast" || keyword === "Forecast";
  let maxPerTurn: number | undefined;
  let xMin: number | undefined;
  let uncopyable = false;
  let onceEver = keyword === "Exhaust" || keyword === "Power-up";
  // "Activate only if you have the city's blessing." (CR 602.5b): a condition checked as it's activated.
  let activateIf: ActivatedAbility["activateIf"] = keyword === "Boast" ? { kind: "self", is: "attackedThisTurn" } : keyword === "Forecast" ? { kind: "during", window: "upkeep", turn: "you" } : undefined;
  // "This ability costs {1} less to activate for each legendary creature you control." (CR 602.2b applies 601.2f)
  let costLess: ActivatedAbility["costLess"];
  let costLessIf: ActivatedAbility["costLessIf"];
  // "Activate only if this card is in your graveyard" (Loathsome Troll): it works only from there (CR 113.6j).
  let inYard = false;
  // "Any player may activate this ability" (CR 602.2): its controller is whoever activates it (CR 113.8), "you" in it
  // being that player; "but only during their turn" is the activator's turn.
  let anyPlayer = false;
  let spendOnlyChosenColor = false;
  let spendOnly: ManaType[] | undefined;
  const anyone = / Any player may activate this ability(?: but only ([^.]+))?\.$/.exec(effectText);
  if (anyone) {
    anyPlayer = true;
    effectText = `${effectText.slice(0, anyone.index)}${anyone[1] ? ` Activate only ${anyone[1].replace(/\btheir\b/g, "your")}.` : ""}`;
  }
  // Personal Incarnation: "Only ~'s owner may activate this ability": its owner, whoever controls it (CR 602.2); "you" in
  // it is that player, who controls the ability (CR 113.8).
  let ownerOnly = false;
  if (!anyone && / Only ~'s owner may activate this ability\.$/.test(effectText)) {
    anyPlayer = ownerOnly = true;
    effectText = effectText.slice(0, effectText.length - " Only ~'s owner may activate this ability.".length);
  }
  for (let found = true; found; ) {
    found = false;
    if (/ Activate only if ~ is in your graveyard\.$/.test(effectText) && !inYard && !keyword) {
      inYard = true;
      effectText = effectText.slice(0, effectText.length - " Activate only if ~ is in your graveyard.".length);
      found = true;
    }
    const less = / This ability costs \{(\d+)\} less to activate for each ([^.]+)\.$/.exec(effectText);
    if (less && !costLess) {
      // Mobilized District: "for each legendary creature and planeswalker you control": each legendary permanent that's a
      // creature and/or a planeswalker, once (rulings).
      const c = parseCount(less[2]!.replace(/^legendary creature and planeswalker you control$/, "legendary creature or planeswalker you control"), null, true);
      if (!c) return "fail";
      costLess = { ...c, times: (c.times ?? 1) * Number(less[1]) };
      effectText = effectText.slice(0, less.index);
      found = true;
    }
    // Baru, Wurmspeaker: "This ability costs {X} less to activate, where X is the greatest power among Wurms you control":
    // generic mana only, counted as it's activated (CR 602.2b, 601.2f).
    const lessX = / This ability costs \{X\} less to activate, where X is ([^.]+)\.$/.exec(effectText);
    if (lessX && !costLess && !/\b(?:it targets|~'s)\b/.test(lessX[1]!)) {
      const c = parseCount(lessX[1]!, null);
      if (!c) return "fail";
      costLess = c;
      effectText = effectText.slice(0, lessX.index);
      found = true;
    }
    // Hylda's Crown of Winter: "This ability costs {1} less to activate during your turn."
    const lessTurn = / This ability costs \{(\d+)\} less to activate during your turn\.$/.exec(effectText);
    if (lessTurn && !costLess && !costLessIf) {
      costLessIf = { n: Number(lessTurn[1]), cond: { kind: "yourTurn" } };
      effectText = effectText.slice(0, lessTurn.index);
      found = true;
    }
    // "Spend only mana of the chosen color to activate this ability." (Throne of Eldraine): the color chosen as it entered.
    if (/ Spend only mana of the chosen color to activate this ability\.$/.test(effectText) && !spendOnlyChosenColor) {
      spendOnlyChosenColor = true;
      effectText = effectText.slice(0, effectText.length - " Spend only mana of the chosen color to activate this ability.".length);
      found = true;
    }
    // "Spend only black mana on X." (Crypt Rats, Crimson Hellkite): with {X} the whole mana cost, all of it (CR 107.3).
    const onlyOnX = / Spend only (white|blue|black|red|green) mana on X\.$/.exec(effectText);
    if (onlyOnX && !spendOnly) {
      spendOnly = [({ white: "W", blue: "U", black: "B", red: "R", green: "G" } as const)[onlyOnX[1] as "white"]];
      effectText = effectText.slice(0, onlyOnX.index);
      found = true;
    }
    // "This ability can't be copied and X can't be 0." (Gogo, Master of Mimicry): a copy effect makes no copy of it
    // (AbilityBody.uncopyable), and the X paid is 1 or more.
    if (/ This ability can't be copied and X can't be 0\.$/.test(effectText) && !xMin && !uncopyable && /\{X\}/.test(costs)) {
      xMin = 1;
      uncopyable = true;
      effectText = effectText.slice(0, effectText.length - " This ability can't be copied and X can't be 0.".length);
      found = true;
    }
    if (/ This ability can't be copied\.$/.test(effectText) && !uncopyable) {
      uncopyable = true;
      effectText = effectText.slice(0, effectText.length - " This ability can't be copied.".length);
      found = true;
    }
    // "X can't be 0." (Ruthless Technomancer, Lair of the Hydra's {X}{G}): only with an X in its costs.
    if (/ X can't be 0\.$/.test(effectText) && !xMin && (extra.some((x) => "x" in x && x.x) || /\{X\}/.test(costs))) {
      xMin = 1;
      effectText = effectText.slice(0, effectText.length - " X can't be 0.".length);
      found = true;
    }
    // In the Trenches: "Activate only as a sorcery and only once." Both (CR 602.5b), once for as long as it's that object.
    if (/ Activate only as a sorcery and only once\.$/.test(effectText) && !onceEver && !sorcerySpeed && !keyword) {
      onceEver = true;
      sorcerySpeed = true;
      effectText = effectText.slice(0, effectText.length - " Activate only as a sorcery and only once.".length);
      found = true;
    }
    // "Activate only once." (CR 602.5b): for as long as it's the same object (CR 400.7), like exhaust (702.177a).
    if (/ Activate only once\.$/.test(effectText) && !onceEver && !keyword) {
      onceEver = true;
      effectText = effectText.slice(0, effectText.length - " Activate only once.".length);
      found = true;
    }
    // "Activate no more than twice each turn." (CR 602.5b)
    const most = / Activate no more than (twice|three times) each turn\.$/.exec(effectText);
    if (most && !maxPerTurn) {
      maxPerTurn = most[1] === "twice" ? 2 : 3;
      effectText = effectText.slice(0, most.index);
      found = true;
    }
    // "You can't activate this ability during combat." (Djinn of Infinite Deceits, CR 602.5b): any time but then.
    if (/ You can't activate this ability during combat\.$/.test(effectText) && !activateIf) {
      activateIf = { kind: "during", window: "combat", not: true };
      effectText = effectText.slice(0, effectText.length - " You can't activate this ability during combat.".length);
      found = true;
    }
    // Restrictions (CR 602.5b, 506.8g): "Activate only as a sorcery", "... only once each turn", "... only during your
    // upkeep", "... only during your turn and only if an opponent lost life this turn", in any combination.
    // With exhaust too: "Exhaust — {4}: Earthbend 4. Activate only during your turn." (Bitter Work), once ever and only then.
    const only = / Activate only ([^.]+)\.$/.exec(effectText);
    if (only && !activateIf && !sorcerySpeed && !oncePerTurn && (!keyword || keyword === "Exhaust")) {
      const clauses = parseOnlyClauses(only[1]!);
      if (!clauses) return "fail";
      sorcerySpeed = !!clauses.sorcery;
      oncePerTurn = !!clauses.once;
      activateIf = clauses.cond;
      effectText = effectText.slice(0, only.index);
      found = true;
    }
  }
  const life = /Pay (\d+) life/.exec(costs);
  // "Pay X {E}" (Sphinx of the Revelation): X announced as it's activated (CR 107.3a, 107.14).
  const energyX = /Pay X \{E\}/.test(costs);
  const energy = energyX ? 0 : energyIn(costs);
  if (energy < 0) return "fail";
  const symbols = [...costs.replace(/Pay (?:\{E\})+|Pay \w+ \{E\}/, "").matchAll(/\{([^}]+)\}/g)].map((x) => x[1]!);
  if (symbols.some((x) => x === "E")) return "fail";
  const tap = symbols.includes("T");
  // The untap symbol (CR 107.6): only on a permanent, and not with {T} too.
  const untapSelf = symbols.includes("Q");
  if (untapSelf && (tap || symbols.filter((x) => x === "Q").length > 1 || inYard)) return "fail";
  // "{3}, Exile this card from your graveyard: ...", "{2}{B}: Return this card from your graveyard to your hand":
  // it works only from your graveyard (CR 113.6j), where "~" is the card.
  // Gryff's Boon: "Return ~ from your graveyard to the battlefield attached to target creature."
  const returnsSelf = /^(?:Return ~ from your graveyard to (?:your hand|the battlefield(?:(?: tapped)?(?: with (?:a|two|three) (?:\+1\/\+1|finality) counters? on (?:it|~))?| attached to target creature)?)|Put ~ from your graveyard into your library third from the top|Put ~ from your graveyard on top of your library)\./.test(effectText);
  const fromYard = /Exile ~ from your graveyard/.test(costs) || returnsSelf || inYard;
  // "{4}: Put this card from your hand onto the battlefield" (Talon Gates of Madara): it works only from your hand
  // (CR 113.6k); not playing a land (CR 305.1), and nothing happens if the card has left your hand (rulings).
  const putFromHand = effectText === "Put ~ from your hand onto the battlefield.";
  // Forecast: revealing the card is its cost, and the card stays in its owner's hand (CR 702.57b); only with the keyword.
  const forecast = keyword === "Forecast";
  if (forecast !== costs.split(", ").includes("Reveal ~ from your hand") || (forecast && (tap || untapSelf || /~/.test(costs.replace("Reveal ~ from your hand", "")) || putFromHand || inYard))) return "fail";
  // Derevi: "{1}{G}{W}{U}: Put ~ onto the battlefield from the command zone": it works only from the command zone (CR
  // 113.6k, rulings); it isn't cast, so no commander tax.
  const putFromCommand = effectText === "Put ~ onto the battlefield from the command zone.";
  if (putFromCommand && (tap || /~/.test(costs) || inYard)) return "fail";
  if (putFromHand && (fromYard || tap || /~/.test(costs))) return "fail";
  if (fromYard && (tap || /Sacrifice ~|Remove /.test(costs))) return "fail";
  if (returnsSelf && /Exile ~ from your graveyard/.test(costs)) return "fail";
  // "{1}{G}, Discard this card: ..." (channel and the like): it works only while the card is in your hand, and
  // discarding it is part of the cost (CR 602.2b, 701.9a).
  const fromHand = /Discard ~/.test(costs);
  if (fromHand && (tap || fromYard || /Sacrifice ~|Exert ~|Remove |on ~/.test(costs))) return "fail";
  // "{1}, Exile ~: Exile all graveyards. Draw a card." (Relic of Progenitus): exiling the permanent itself is part of the
  // cost, paid as it's activated (CR 602.2b, 601.2h), like sacrificing it but into exile.
  const exileOwn = costs.split(", ").includes("Exile ~");
  // "Exile ~ from your hand: Add {R}" (Simian Spirit Guide): it works only while the card is in your hand (CR 113.6k),
  // and exiling it is the whole cost. A mana ability all the same (CR 605.1a).
  const exileFromHand = costs === "Exile ~ from your hand";
  if (exileOwn && (fromYard || fromHand || /Sacrifice ~/.test(costs))) return "fail";
  // "{1}{G}, {T}, Return ~ to its owner's hand: ..." (Shigeki): returning the permanent itself is part of the cost (CR
  // 602.2b, 601.2h).
  const bounceOwn = costs.split(", ").includes("Return ~ to its owner's hand");
  if (bounceOwn && (fromYard || fromHand || exileOwn || /Sacrifice ~/.test(costs))) return "fail";
  // Timestream Navigator: "{2}{U}{U}, {T}, Put ~ on the bottom of its owner's library: ...": the same, into the library.
  const bottomOwn = costs.split(", ").includes("Put ~ on the bottom of its owner's library");
  if (bottomOwn && (fromYard || fromHand || exileOwn || bounceOwn || /Sacrifice ~/.test(costs))) return "fail";
  if (untapSelf && (fromYard || fromHand || exileFromHand || putFromHand || bottomOwn)) return "fail";
  const manaCost = symbols
    .filter((x) => x !== "T" && x !== "Q")
    .map((x) => `{${x}}`)
    .join("");
  // "Sacrifice ~: It deals damage equal to its power to ...", "Put two +1/+1 counters on ~. It deals 1 damage to any
  // target": "it" is the source, the only object named before it.
  // Shadowheart: "Sacrifice another creature: Draw X cards, where X is that creature's power": the creature sacrificed to
  // pay the cost, as it last existed on the battlefield (CR 608.2h).
  const oneSac = extra.filter((c) => c.kind === "sacrifice");
  if (oneSac.length === 1 && oneSac[0]!.kind === "sacrifice" && oneSac[0]!.n === 1 && oneSac[0]!.filter.types?.length === 1 && oneSac[0]!.filter.types[0] === "Creature")
    effectText = effectText.replace(/^Draw X cards, where X is that creature's power\.$/, "Draw cards equal to the sacrificed creature's power.");
  // Slogurk, the Overslime: "Remove three +1/+1 counters from ~: Return it to its owner's hand": "it" is ~, the only
  // object the ability names.
  if (/^Remove \w+ [^,:]*counters? from ~$/.test(costs)) effectText = effectText.replace(/^Return it to its owner's hand\.$/, "Return ~ to its owner's hand.");
  const body = putFromHand || putFromCommand ? { targets: [], effects: [{ type: "putOntoBattlefield" as const, what: { ref: "selfCard" as const } }], text: effectText } : parseBody(effectText.replace(/^It (?=deals\b)/, "~ ")
    // Blademane Baku: "For each counter removed, ~ gets +2/+0 until end of turn" after "Remove X ki counters from ~".
    .replace(/^For each counter removed, (~ gets [+-]\d+\/[+-]\d+ until end of turn)\.$/, removeCounters?.x ? "$1 for each counter removed this way." : "$&").replace(/^(Put [^.]+ counters? on ~\. )It (?=deals\b)/, "$1~ "), { activated: true, ...(returnsSelf || inYard ? { selfCard: true } : {}), ...(fromHand ? { discardedSelf: true as const } : {}), ...(extra.some((c) => c.kind === "exileFromGraveyard" && c.linked) ? { costLinked: true } : {}) });
  if (!body) return "fail";
  if (uncopyable) body.uncopyable = true;
  // An activated ability without a target that could add mana, and that moves no card to or from a library, is a mana
  // ability (CR 605.1a): it doesn't use the stack (605.3b). One whose other instructions aren't known to stay clear of
  // libraries isn't compiled.
  // A cost that mills moves a card from a library: it uses the stack (CR 605.1a; Millikin rulings).
  const mana = extra.some((c) => c.kind === "mill") ? "stack" : manaAbilityKind(body);
  // "Remove X storage counters from ~: Add X mana ..." (Crucible of the Spirit Dragon, Petalmane Baku): an X for a mana
  // ability isn't announced anywhere yet.
  if (mana === "fail" || (mana === "mana" && (water || fromHand || exileOwn || bounceOwn || bottomOwn || keyword || halfLife || untapSelf || removeCounters?.x))) return "fail";
  if (exileFromHand && (mana !== "mana" || anyPlayer || sorcerySpeed || oncePerTurn || activateIf || extra.length)) return "fail";
  // X in the effect is the X paid in the cost (CR 107.3a); with none to pay, it isn't defined.
  if (usesX(body) && !symbols.includes("X") && !energyX && !removeCounters?.x && !extra.some((c) => ("x" in c && c.x) || (c.kind === "discard" && c.mvX))) return "fail";
  // Any player's: only costs any player can pay (mana, life, their own cards and permanents), not ones that tap,
  // sacrifice, exile or change the permanent itself, which only its controller could do (CR 701.21a, 602.2).
  // Only the chosen color's mana pays it: an ability of a permanent that chose one, with a mana cost, not a mana ability.
  if (spendOnlyChosenColor && (mana !== "stack" || !manaCost || fromYard || fromHand)) return "fail";
  if (spendOnly && (mana !== "stack" || manaCost !== "{X}" || spendOnlyChosenColor)) return "fail";
  if (anyPlayer && (tap || untapSelf || mana !== "stack" || fromYard || fromHand || exileOwn || /Sacrifice ~|Exert ~|Remove |on ~|~/.test(costs) || halfLife || energy)) return "fail";
  return {
    ...(anyPlayer ? { anyPlayer: true as const } : {}),
    ...(ownerOnly ? { ownerOnly: true as const } : {}),
    ...(spendOnlyChosenColor ? { spendOnlyChosenColor: true as const } : {}),
    ...(spendOnly ? { spendOnly } : {}),
    manaCost,
    ...(water ? { waterbend: water[1] === "X" ? ("X" as const) : Number(water[1]) } : {}),
    tap,
    sacrificeSelf: /Sacrifice ~/.test(costs),
    ...(/Exert ~/.test(costs) ? { exertCost: true as const } : {}),
    ...(untapSelf ? { untapSelf: true as const } : {}),
    ...(/Unattach ~/.test(costs) ? { unattachCost: true as const } : {}),
    ...(tapAttached ? { tapAttached: true as const } : {}),
    ...(/Reveal the player you chose/.test(costs) ? { revealChosen: true as const } : {}),
    sorcerySpeed,
    body,
    text: raw,
    ...(fromYard ? { zone: "graveyard" as const, ...(returnsSelf || (inYard && !/Exile ~ from your graveyard/.test(costs)) ? {} : { exileSelf: true }) } : {}),
    ...(exileOwn ? { exileSelf: true } : {}),
    ...(bounceOwn ? { returnSelf: true as const } : {}),
    ...(bottomOwn ? { returnSelf: true as const, toLibraryBottom: true as const } : {}),
    ...(fromHand ? { zone: "hand" as const, discardSelf: true } : {}),
    ...(exileFromHand ? { zone: "hand" as const, exileSelf: true } : {}),
    ...(putFromHand || forecast ? { zone: "hand" as const } : {}),
    ...(putFromCommand ? { zone: "command" as const } : {}),
    ...(oncePerTurn ? { oncePerTurn } : {}),
    ...(onceEver ? { onceEver: true as const } : {}),
    ...(keyword ? { keyword } : {}),
    ...(maxPerTurn ? { maxPerTurn } : {}),
    ...(xMin ? { xMin } : {}),
    ...(costLess ? { costLess } : {}),
    ...(costLessIf ? { costLessIf } : {}),
    ...(activateIf ? { activateIf } : {}),
    ...(life ? { lifeCost: Number(life[1]) } : {}),
    ...(/Pay life equal to the number of colors in your commanders' color identity/.test(costs) ? { lifeCostIdentity: true as const } : {}),
    ...(halfLife ? { halfLifeCost: halfLife[1] as "up" | "down" } : {}),
    ...(energy ? { energyCost: energy } : {}),
    ...(costs.split(", ").includes("Discard your hand") ? { discardHand: true as const } : {}),
    ...(energyX ? { energyX: true as const } : {}),
    ...(extra.length ? { costs: extra } : {}),
    ...(removeCounters ? { removeCounters } : {}),
    ...(putCounters ? { putCounters } : {}),
    ...(mana === "mana" ? { mana: true as const } : {}),
  };
}

/** Instructions that move a card to or from a library (CR 605.1a): an ability with one isn't a mana ability. */
const LIBRARY_EFFECTS = new Set<Effect["type"]>(["draw", "mill", "putInLibrary", "exileTop", "revealTopToHand", "surveil", "handToTop", "shuffleIntoLibrary", "shuffleSpell", "taintedPact", "shuffleZones", "search", "dig", "impulse", "cascade", "discover", "ripple", "explore", "hideaway", "recruit", "connive", "orderTop", "scry", "clash", "revealTop", "putInGraveyard", "castFromAmong"]);
/** Instructions that don't: what mana abilities do besides adding mana (Pristine Talisman's life, Glittering Stockpile's counter). */
const MANA_RIDERS = new Set<Effect["type"]>(["addMana", "choose", "roll", "if", "may", "gainLife", "loseLife", "damage", "counters", "removeCounters", "removeSelfCounter", "delayed", "tap", "untap", "getEnergy", "poison", "skipUntap", "continuous", "sacrifice"]);

/**
 * Whether an activated ability's effect makes it a mana ability (CR 605.1a): no target, it could add mana, and it
 * moves no card to or from a library ("Draw a card" makes Chromatic Sphere's use the stack, rulings). A delayed
 * trigger it sets up (Barbed Sextant's draw at the next upkeep) is a separate ability, so that draw doesn't count.
 * "fail" when it could add mana but does something not known either way.
 */
export function manaAbilityKind(body: AbilityBody): "mana" | "stack" | "fail" {
  const bodies = body.modal ? body.modal.modes : [body];
  const effects = bodies.flatMap((b) => allEffects(b.effects));
  if (!effects.some((e) => e.type === "addMana")) return "stack";
  if (bodies.some((b) => b.targets.length) || body.targets.length || JSON.stringify(effects.filter((e) => e.type !== "delayed")).includes('"targets":[{')) return "stack";
  if (effects.some((e) => LIBRARY_EFFECTS.has(e.type))) return "stack";
  return effects.every((e) => MANA_RIDERS.has(e.type)) ? "mana" : "fail";
}

/**
 * A loyalty ability (CR 606): "+1: You gain 2 life.", "−3: ~ deals 4 damage to target creature.", "0: ...", "−X: ...",
 * where X in the effect is the X announced for the cost (CR 107.3). Activated only as a sorcery (CR 606.3).
 */
export function parseLoyalty(sign: string, amount: string, effectText: string, raw: string): ActivatedAbility | "fail" {
  const minus = sign === "−" || sign === "-";
  if (amount === "X" && !minus) return "fail";
  const body = parseBody(effectText, { activated: true });
  if (!body) return "fail";
  if (usesX(body) && amount !== "X") return "fail";
  const n = Number(amount);
  return { manaCost: "", tap: false, sacrificeSelf: false, sorcerySpeed: true, body, text: raw, ...(amount === "X" ? { loyaltyX: true } : { loyalty: minus ? -n : n }) };
}

/** How much energy "Pay {E}{E}" or "Pay eight {E}" asks for (CR 107.14), or 0. */
export function energyIn(costs: string): number {
  const m = /Pay ((?:\{E\})+)|Pay (\w+) \{E\}/.exec(costs);
  if (!m) return 0;
  if (m[1]) return m[1].length / 3;
  const n = num(m[2]!);
  return Number.isFinite(n) ? n : -1; // a number we don't read ("sixty")
}

// ---------------------------------------------------------------------------
// Static abilities (CR 604)
