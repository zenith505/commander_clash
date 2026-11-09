import { allEffects, type AbilityBody, type ActivatedAbility, type AdditionalCost, type AmountExpr, type Effect, type TargetSpec } from "../abilities";
import { NUM, NUMBER_WORDS, num, X, sacrificeSelf, counterKind, singular } from "./words";
import { removeCounterCost } from "./mana-abilities";
import { parseBody, usesX } from "./body";
import { parseSearchFilter } from "./search";
import { blightCost, parseAdditionalCost } from "./keyword-abilities";
import { parseTargetPhrase, pickFilter } from "./targets";
import { parseActivateCondition, parseOnlyClauses, parseStaticCondition } from "./statics";
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
    // Skeleton Scavengers: "Pay {1} for each +1/+1 counter on ~: ...": generic mana, as much as there are counters on it as
    // it's activated (CR 602.2b, 601.2f), the same as Loreseeker's Stone's "costs {1} more to activate for each".
    .replace(/^Pay \{(\d+)\} for each ([+-]1\/[+-]1|[a-z]+) counter on ~: (.+\.)$/, "{0}: $3 This ability costs {$1} more to activate for each $2 counter on ~.")
    // Magosi, the Waterveil: "Remove an eon counter from ~ and return it to its owner's hand": the same, two costs.
    .replace(/(^|, )(Remove [^,:]+? counters? from ~) and return it to its owner's hand:/, "$1$2, Return ~ to its owner's hand:")
    // The Filigree Sylex: "Remove ten oil counters from among permanents you control and sacrifice ~: It deals 10 damage to
    // any target": two costs; "it" is ~, the one thing named, as it last existed (CR 608.2h).
    .replace(/(^|, )(Remove [^,:]+? counters? from among permanents you control) and sacrifice ~: It deals /, "$1$2, Sacrifice ~: ~ deals ")
    // Geistflame Reservoir: "Remove any number of charge counters from ~: It deals that much damage to any target": how
    // many is announced as it's activated (CR 602.2b, 601.2h), an X (none included).
    .replace(/(^|, )Remove any number of ([a-z]+) counters from ~: It deals that much damage to any target\.$/, "$1Remove X $2 counters from ~: ~ deals X damage to any target.")
    // The Archimandrite: "Tap three untapped Advisors, Artificers, and/or Monks you control": any mix of them, each one that
    // has any of those creature types.
    .replace(/(^|, )Tap (\w+) untapped ((?:[A-Z][a-z]+s, )+)and\/or ([A-Z][a-z]+s) you control(?=[,:])/, (_, pre: string, n: string, list: string, last: string) => `${pre}Tap ${n} untapped ${[...list.split(", ").filter(Boolean), last].map((w) => w.replace(/s$/, "")).join(" or ")} you control`)
    // Radiant, Serra Archangel: "Tap another untapped creature you control with flying": the same as "... untapped creature
    // with flying you control".
    .replace(/(^|, )(Tap (?:an|another|one|two|three) (?:other )?untapped (?:creature|creatures)) you control (with (?:flying|reach|defender|vigilance|haste))(?=[,:])/, "$1$2 $3 you control")
    // Razor Boomerang: "{T}, Unattach Razor Boomerang: It deals 1 damage to any target": "it" is the Equipment, the one
    // thing named, the source of the damage (rulings).
    .replace(/(Unattach \u27easource\u27eb): It deals /, "$1: \u27easource\u27eb deals ")
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
  const piece = String.raw`(?:\{[^}]+\})+|Reveal the player you chose|Sacrifice ~ and any number of [^,:]+?|Sacrifice ~ and (?:an?|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen) [^,:]+?|Sacrifice ~|Sacrifice all lands you control|Exert ~|Unattach ~|Sacrifice \u27easource\u27eb|Unattach \u27easource\u27eb|Tap enchanted (?:creature|land)|Sacrifice (?:enchanted|equipped) creature|Return ~ to its owner's hand|Put ~ on the bottom of its owner's library|Discard ~|Discard your hand|Reveal ~ from your hand|Exile ~ from your graveyard|Exile ~ from your hand|Exile ~|Remove (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifty|\d+|X) (?:[+-]\d+/[+-]\d+|[a-z]+) counters? from ~|Remove all (?:[+-]1/[+-]1|[a-z]+) counters from ~|Remove (?:a counter|two counters|three counters) from ~|Remove (?:a|one|two|three|four|five|six|seven|eight|nine|ten|X) (?:(?:[+-]1/[+-]1|[a-z]+) )?counters? from among (?:[^,:]+?, )*?[^,:]+? you control|Remove an? (?:[+-]1/[+-]1|[a-z]+) counter or an? (?:[+-]1/[+-]1|[a-z]+) counter from an? permanent you control|Remove an? (?:(?:[+-]1/[+-]1|[a-z]+) )?counter from (?:an?|another) (?:permanent|nonland permanent|creature|artifact|(?:artifact|creature|land|planeswalker|enchantment)(?:, (?:artifact|creature|land|planeswalker|enchantment))*,? or (?:artifact|creature|land|planeswalker|enchantment)) you control|Put (?:a|an|one|two|three) (?:[+-]1/[+-]1|[a-z]+) counters? on ~|Put an? [+-]1/[+-]1 counter on an? creature you control|Blight \d+|Pay \d+ life for each [a-z]+ counter on ~|Pay \d+ life|Pay X life|Pay life equal to the number of colors in your commanders' color identity|Pay half your life, rounded (?:up|down)|Pay (?:\{E\})+|Pay \w+ \{E\}|Sacrifice (?:an?|another|one|two|three|four|five|six|seven|eight|nine|ten|X) [^,:]+?|Discard (?:an?|one|two|three) [^,:]*?cards?(?: at random| with different names)?|Discard (?:two|three) (?:nonland )?cards with the same name|Discard a card with mana value X|Discard another card named ~|Discard X cards|Discard the last card you drew this turn|Reveal X (?:white|blue|black|red|green) cards from your hand|Put (?:a|one|two|three) cards? from your hand on top of your library|Put a (?:creature )?card exiled with ~ into its owner's graveyard|Put a card an opponent owns from exile into that player's graveyard|Tap (?:an|another|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|X) (?:other )?untapped [^,:]+? you control(?: other than ~| that share a creature type)?|Reveal two cards from your hand that share a color|Untap (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty) tapped [^,:]+? you control|Collect evidence \d+|Mill (?:a card|\w+ cards)|Exile the top (?:[a-z]+ )?cards? of your graveyard|Exile the top (?:card|[a-z]+ cards) of your library|Exile (?:a|an|another|one|two|three|four|five|six|seven|eight|nine|ten) [^,:]*?cards? from your graveyard|Exile any number of cards from your graveyard|Put (?:two|three|four|five) cards from your graveyard on the bottom of your library|Exile any number of [a-z ]+? cards from your graveyard with total mana value \d+ or greater|Exile X cards from your graveyard|Exile an? (?:artifact|creature) card with mana value X from your graveyard|Exile (?:a|an|one|two) [^,:]*?cards? from your hand|Exile (?:an?|another) [^,:]+? you control(?: face up)?|Exile ~ and (?:one|two|three|four|five) other [^,:]+? you control|Return (?:an?|two|three) [^,:]+? you control to (?:its|their) owner's hand|Forage`;
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
  /** Corpseweft: "where X is twice the number of cards exiled this way" (see its cost). */
  let twiceExiled = false;
  let removeCounters: ActivatedAbility["removeCounters"];
  let putCounters: ActivatedAbility["putCounters"];
  // "From among other artifacts, creatures, and planeswalkers you control" is one cost, commas and all.
  // Soul Diviner: "Remove a counter from an artifact, creature, land, or planeswalker you control": one cost, its commas kept.
  for (const part of costs.replace(/from among [^:]+? you control/g, (x) => x.replaceAll(", ", "; ")).replace(/(?<=^|, )Remove an? counter from an? (?:[a-z]+, )+(?:or )?[a-z]+ you control(?=,|$)/g, (x) => x.replaceAll(", ", "; ")).split(", ").map((x) => x.replaceAll("; ", ", "))) {
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
    else if ((c = new RegExp(`^Remove (X|${NUM.slice(1, -1)}) (?:([+-]1/[+-]1|[a-z]+) )?counters? from among (other )?(.+) you control$`).exec(part))) {
      // Retribution of the Ancients: "Remove X +1/+1 counters from among creatures you control": X announced, then that many
      // (CR 107.3a, 602.2b). NUM's own group is dropped, so the first group is the number or X.
      // Tekuthal, Hopeful Initiate: counters on permanents you control, any mix of them (CR 602.2b). "Artifacts,
      // creatures, and planeswalkers": a permanent of any of those types.
      const what = c[4]!.split(/, (?:and |or )?| and | or /).map((w) => singular(w));
      const filter = pickFilter(what.length > 2 ? `${what.slice(0, -1).join(", ")}, or ${what.at(-1)}` : what.join(" or "));
      if (!filter || filter.kind !== "object" || filter.controller) return "fail";
      if (c[1] === "X" && !c[2]) return "fail";
      extra.push({ kind: "removeCounters", n: c[1] === "X" ? 0 : num(c[1]!), filter: { ...filter, text: `${c[3] ?? ""}${c[4]} you control` }, ...(c[2] ? { counter: counterKind(c[2]) } : {}), ...(c[3] ? { other: true as const } : {}), ...(c[1] === "X" ? { x: true as const } : {}) });
    } else if ((c = /^Remove an? ([+-]1\/[+-]1|[a-z]+) counter or an? ([+-]1\/[+-]1|[a-z]+) counter from an? permanent you control$/.exec(part))) {
      // Ion Storm: "Remove a +1/+1 counter or a charge counter from a permanent you control": one counter of either kind, on
      // any one permanent you control (CR 602.2b).
      const filter = pickFilter("permanent");
      if (!filter) return "fail";
      extra.push({ kind: "removeCounters", n: 1, filter: { ...filter, controller: "you", text: "permanent you control" }, counters: [counterKind(c[1]!), counterKind(c[2]!)] });
    } else if ((c = /^Remove an? (?:([+-]1\/[+-]1|[a-z]+) )?counter from (an?|another) (permanent|nonland permanent|creature|artifact|(?:artifact|creature|land|planeswalker|enchantment)(?:, (?:artifact|creature|land|planeswalker|enchantment))*,? or (?:artifact|creature|land|planeswalker|enchantment)) you control$/.exec(part)) && c[1] !== "additional") {
      // Soul Diviner: "from an artifact, creature, land, or planeswalker you control": one permanent of any of those types.
      // "Remove a counter from a permanent you control" (Scholar of New Horizons), "... a nonland permanent ..." (O'aka): any
      // kind, on any one of them.
      // Hexavus: "from another creature you control": not this one.
      const filter = pickFilter(c[3]!);
      if (!filter) return "fail";
      extra.push({ kind: "removeCounters", n: 1, filter: { ...filter, controller: "you", text: `${c[2] === "another" ? "another " : ""}${c[3]} you control` }, ...(c[1] ? { counter: counterKind(c[1]) } : {}), ...(c[2] === "another" ? { other: true as const } : {}) });
    } else if ((c = /^Remove (a|two|three) counters? from ~$/.exec(part))) {
      // Glen Elendra Guardian: a counter of any kind on this permanent (CR 602.2b), chosen as the cost is paid. Gnarlbark
      // Elm: "Remove two counters from ~", any mix of kinds.
      extra.push({ kind: "removeCounters", n: c[1] === "a" ? 1 : num(c[1]!), filter: { kind: "object", text: "~" }, self: true });
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
    } else if ((c = /^Sacrifice an? (Aura|Equipment) attached to ~$/.exec(part))) {
      // Ronin, Shadow Stalker: "Sacrifice an Equipment attached to ~"; Faunsbane Troll: "an Aura": one attached to this
      // permanent as the cost is paid ("~" bound to its id then, see bindAttachedToSource).
      const filter = pickFilter(c[1]!);
      if (filter?.kind !== "object") return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, attachedTo: { kind: "object", objectId: "~", text: "~" }, text: `${c[1]} attached to ~` }, n: 1 });
    } else if ((c = /^Sacrifice (enchanted|equipped) creature$/.exec(part))) {
      // Bloodfire Infusion, Betrothed of Fire: "Sacrifice enchanted creature": the permanent this Aura (or Equipment) is
      // attached to as the cost is paid, which its controller must control to sacrifice it (CR 701.21a; rulings on
      // Betrothed of Fire). Bound to that permanent's id then (see bindAttachedToSource).
      extra.push({ kind: "sacrifice", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], sourceHost: true, text: `${c[1]} creature` }, n: 1 });
    } else if ((c = /^Sacrifice ~ and any number of (creatures) you control$/.exec(part))) {
      // Sword of the Ages: "Sacrifice this artifact and any number of creatures you control": this permanent and as many
      // others as its controller chooses, none too (CR 602.2b, 601.2h), how many announced like an X (CR 107.3a).
      const filter = pickFilter("creature you control");
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: "creature" }, n: 0, x: true, other: true });
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
    } else if ((c = /^Sacrifice an? (artifact|enchantment|land) or another (creature)$/.exec(part))) {
      // Malevolent Noble: "Sacrifice an artifact or another creature": the same the other way round, this permanent only
      // if it's an artifact.
      const filter = pickFilter(`${c[1]} or ${c[2]}`);
      const selfIf = pickFilter(c[1]!);
      if (!filter || !selfIf) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: `${c[1]} or another ${c[2]}` }, n: 1, other: true, selfIf });
    } else if ((c = new RegExp(`^Sacrifice ${NUM} (.+) with different names$`).exec(part)) && num(c[1]!) > 1) {
      // Transmutation Font: "three artifact tokens with different names", each name once (a face-down permanent has none,
      // CR 708.2, so it shares none).
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: `${c[2]} with different names` }, n: num(c[1]!), differentNames: true });
    } else if ((c = /^Sacrifice an? (creature|artifact)( you control)? with mana value X( other than ~)?$/.exec(part)) && (c[2] || !c[3])) {
      // Sidisi, Regent of the Mire: X announced as it's activated, then a creature with that mana value, not this one
      // (CR 107.3a, 602.2b); one with {X} in its mana cost has X as 0 there (CR 202.3e).
      // Scrap Welder: "Sacrifice an artifact with mana value X", one you control (CR 701.21a).
      const filter = pickFilter(c[1]!);
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: `${c[1]} with mana value X${c[3] ?? ""}` }, n: 1, ...(c[3] ? { other: true as const } : {}), mvX: true });
    } else if (part === "Sacrifice all lands you control") {
      // Tomb of Urami: every land its controller controls, itself included (rulings), at once (CR 701.21a); no land
      // that can't be sacrificed may stay behind (CR 118.3).
      extra.push({ kind: "sacrificeAll", lands: true });
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
    } else if (/^Reveal two cards from your hand that share a color$/.test(part)) {
      // Illuminated Folio: two cards in your hand with a color in common, staying there (CR 701.20a; rulings: colorless
      // cards share no color).
      extra.push({ kind: "reveal", filter: { kind: "card", text: "card" }, n: 2, shareColor: true });
    } else if ((c = new RegExp(`^Tap (two|three) untapped (creatures) you control that share a creature type$`).exec(part))) {
      // Weight of Conscience: creatures you control with a creature type in common, summoning sick ones too (no {T}, CR
      // 302.6; rulings).
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "tap", filter: { ...filter, text: `untapped ${filter.text} you control` }, n: num(c[1]!), shareCreatureType: true, ...(/\{T\}/.test(costs) ? { other: true } : {}) });
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
    } else if ((c = new RegExp(`^Discard ${NUM} cards with different names$`).exec(part)) && num(c[1]!) > 1) {
      // Ormos, Archive Keeper: "Discard three cards with different names": no two of them with the same name (CR 201.2).
      extra.push({ kind: "discard", n: num(c[1]!), differentNames: true });
    } else if (/^Discard the last card you drew this turn$/.test(part)) {
      // Jandor's Ring: that one card, and only while it's still in your hand (rulings), so nothing to choose.
      extra.push({ kind: "discard", n: 1, lastDrawn: true });
    } else if (/^Discard X cards$/.test(part)) {
      // "Discard X cards" (Gix, Yawgmoth Praetor): X announced as it's activated, and that many discarded (CR 107.3a, 602.2b).
      extra.push({ kind: "discard", n: 0, x: true });
    } else if ((c = /^Discard (two|three) (nonland )?cards with the same name$/.exec(part))) {
      // Sphinx of the Chimes: cards in your hand that share a name (CR 201.2), chosen as the cost is paid.
      const filter = c[2] ? parseSearchFilter("nonland card") : undefined;
      if (filter === null) return "fail";
      extra.push({ kind: "discard", n: num(c[1]!), ...(filter ? { filter } : {}), sameName: true });
    } else if ((c = new RegExp(`^Discard ${NUM} (?:(.+?) )?cards?( at random)?$`).exec(part))) {
      const filter = c[2] ? parseSearchFilter(`${c[2]} card`) : undefined;
      if (filter === null || (filter && c[3])) return "fail";
      extra.push({ kind: "discard", n: num(c[1]!), ...(filter ? { filter } : {}), ...(c[3] ? { random: true as const } : {}) });
    } else if ((c = new RegExp(`^Mill ${NUM} cards?$`).exec(part))) {
      // CR 701.17b: the top cards of your library, as many as it says or none.
      extra.push({ kind: "mill", n: num(c[1]!) });
    } else if ((c = /^Exile any number of ([a-z ]+?) cards from your graveyard with total mana value (\d+) or greater$/.exec(part))) {
      // The Capitoline Triad: cards chosen as it's activated (CR 602.2b, 601.2h) whose mana values add up; not collecting
      // evidence (CR 701.59a), though chosen the same way.
      const filter = parseSearchFilter(`${c[1]} card`);
      if (!filter) return "fail";
      extra.push({ kind: "collectEvidence", n: Number(c[2]), filter, notEvidence: true });
    } else if ((c = /^Collect evidence (\d+)$/.exec(part))) {
      // CR 701.59a: exile cards from your graveyard with total mana value N or more.
      extra.push({ kind: "collectEvidence", n: Number(c[1]) });
    } else if ((c = /^Exile (an?|another) ([^,:]+?) you control( face up)?$/.exec(part))) {
      // "Exile a creature you control" (The Soul Stone): a permanent you choose as it's activated (CR 602.2b, 601.2h),
      // exiled rather than sacrificed.
      // Primordial Mist: "Exile a face-down permanent you control face up": a face-down permanent is turned face up as it
      // leaves the battlefield (CR 708.9), and the card goes to exile face up (CR 406.3).
      const filter = pickFilter(c[2]!);
      if (!filter || (c[3] && !filter.faceDown)) return "fail";
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
    } else if (/^Exile one or more creature cards from your graveyard$/.test(part) && /^Create a tapped X\/X [a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)* creature token, where X is twice the number of cards exiled this way\.$/.test(m[2]!)) {
      // Corpseweft: "Exile one or more creature cards from your graveyard: ... where X is twice the number of cards exiled
      // this way": how many is chosen as it's activated (CR 602.2b, 601.2h), an X announced then that can't be 0; the
      // cards exiled are this activation's, none from before (rulings).
      extra.push({ kind: "exileFromGraveyard", n: 0, x: true, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" } });
      twiceExiled = true;
    } else if ((c = /^Exile an? (artifact|creature) card with mana value X from your graveyard$/.exec(part)) && /\{X\}/.test(costs)) {
      // Osgir, the Reconstructor: "{X}, {T}, Exile an artifact card with mana value X from your graveyard": X announced as
      // it's activated, paid in mana, and a card with that mana value (CR 107.3a, 602.2b).
      const filter = parseSearchFilter(`${c[1]} card`);
      if (!filter) return "fail";
      extra.push({ kind: "exileFromGraveyard", n: 1, filter: { ...filter, text: `${c[1]} card with mana value X` }, mvX: true });
    } else if (/^Exile X cards from your graveyard$/.test(part)) {
      // Necropolis Fiend: "{X}, {T}, Exile X cards from your graveyard": the one X announced as it's activated, paid in
      // mana and in that many cards (CR 107.3a, 602.2b).
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
    } else if (/^Put a card an opponent owns from exile into that player's graveyard$/.test(part)) {
      // The Eldrazi processors (Void Attendant): any card an opponent owns in exile (game.ts processCandidates).
      extra.push({ kind: "exileFromGraveyard", n: 1, process: true });
    } else if (/^Put a card exiled with ~ into its owner's graveyard$/.test(part)) {
      // Jester's Scepter: one of the cards its linked exile took (CR 607.2a).
      extra.push({ kind: "exileFromGraveyard", n: 1, linked: true });
    } else if (/^Put a creature card exiled with ~ into its owner's graveyard$/.test(part)) {
      // Shelob, Dread Weaver: a creature card among them (CR 607.2a).
      extra.push({ kind: "exileFromGraveyard", n: 1, linked: true, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" } });
    } else if (/^Put (?:two|three|four|five) cards from your graveyard on the bottom of your library$/.test(part)) {
      // Battlefield Scrounger: cards chosen as it's activated (CR 602.2b, 601.2h), put on the bottom in that order.
      const c2 = parseAdditionalCost(part);
      if (c2?.kind !== "exileFromGraveyard" || !c2.toBottom) return "fail";
      extra.push(c2);
    } else if ((c = new RegExp(`^Put ${NUM} cards? from your hand on top of your library$`).exec(part))) {
      // Several cards go on top in the order their owner chooses (CR 401.4): the first one picked ends up on top.
      extra.push({ kind: "exileFromHand", n: num(c[1]!), toLibrary: true });
    }
  }
  // "Tap enchanted creature" (Veteran's Voice): the creature tapped this way is the one this Aura is attached to as the
  // cost is paid, targets having been chosen first (CR 601.2c, 601.2h).
  const tapAttached = /(?:^|, )Tap enchanted (?:creature|land)(?=, |$)/.test(costs);
  let effectText = tapAttached ? m[2]!.replace(/\bother than the creature tapped this way\b/, "other than enchanted creature") : m[2]!;
  if (twiceExiled) effectText = effectText.replace(/, where X is twice the number of cards exiled this way\.$/, ".");
  // Painbringer: the X its cost announced (see above).
  if (/(?:^|, )Exile any number of cards from your graveyard(?=, |$)/.test(costs) && extra.some((c) => c.kind === "exileFromGraveyard" && c.x)) effectText = effectText.replace(/, where X is the number of cards exiled this way\.$/, ".");
  // Relic Amulet: "Remove all charge counters from ~: It deals that much damage to target creature": as many as were
  // removed, none if there were none (see StackItem.countersRemoved).
  if (removeCounters?.all) effectText = effectText.replace(/^It deals that much damage to (target [a-z ]+)\.$/, "~ deals X damage to $1, where X is the number of counters removed this way.");
  let sorcerySpeed = false;
  let oncePerTurn = keyword === "Boast" || keyword === "Forecast";
  let maxPerTurn: number | undefined;
  let maxPerTurnCount: AmountExpr | undefined;
  let xMin: number | undefined;
  let xIs: ActivatedAbility["xIs"];
  let uncopyable = false;
  let onceEver = keyword === "Exhaust" || keyword === "Power-up";
  // "Activate only if you have the city's blessing." (CR 602.5b): a condition checked as it's activated.
  let activateIf: ActivatedAbility["activateIf"] = keyword === "Boast" ? { kind: "self", is: "attackedThisTurn" } : keyword === "Forecast" ? { kind: "during", window: "upkeep", turn: "you" } : undefined;
  // "This ability costs {1} less to activate for each legendary creature you control." (CR 602.2b applies 601.2f)
  let costLess: ActivatedAbility["costLess"];
  let costMore: ActivatedAbility["costMore"];
  let costLessIf: ActivatedAbility["costLessIf"];
  let costLessIfTarget: ActivatedAbility["costLessIfTarget"];
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
  // Clergy of the Holy Nimbus: "Only your opponents may activate this ability": any opponent of its controller, who then
  // controls the ability (CR 602.2, 113.8); not its controller.
  let opponentsOnly = false;
  // Oft-Nabbed Goat: "Only your opponents may activate this ability and only as a sorcery": the activator's own sorcery
  // timing (CR 602.5d).
  const oppOnly = !anyone && !ownerOnly ? / Only your opponents may activate this ability( and only as a sorcery)?\.$/.exec(effectText) : null;
  if (oppOnly) {
    anyPlayer = opponentsOnly = true;
    effectText = `${effectText.slice(0, oppOnly.index)}${oppOnly[1] ? " Activate only as a sorcery." : ""}`;
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
    // Loreseeker's Stone: "This ability costs {1} more to activate for each card in your hand": generic mana added as it's
    // activated (CR 602.2b, 601.2f).
    const more = / This ability costs \{(\d+)\} more to activate for each ([^.]+)\.$/.exec(effectText);
    if (more && !costMore) {
      const c = parseCount(more[2]!, null, true);
      if (!c) return "fail";
      costMore = { ...c, times: (c.times ?? 1) * Number(more[1]) };
      effectText = effectText.slice(0, more.index);
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
    // Esquire of the King: "This ability costs {2} less to activate if you control a legendary creature", Thaumaton Torpedo:
    // "if you attacked with a Spacecraft this turn": as the cost is worked out (CR 602.2b, 601.2f).
    // Kami of Jealous Thirst: "This ability costs {4}{B} less to activate if you've drawn three or more cards this turn": the
    // colored symbol comes off too (CR 118.7).
    const lessIf = / This ability costs (\{\d+\}|\{\d+\}(?:\{[WUBRG]\})+) less to activate if (?!it targets )([^.]+)\.$/.exec(effectText);
    const lessCond = lessIf && !costLess && !costLessIf && !costLessIfTarget ? parseStaticCondition(lessIf[2]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (lessIf && lessCond) {
      const generic = /^\{(\d+)\}$/.exec(lessIf[1]!);
      costLessIf = generic ? { n: Number(generic[1]), cond: lessCond } : { n: 0, cond: lessCond, mana: lessIf[1]! };
      effectText = effectText.slice(0, lessIf.index);
      found = true;
    }
    // Raft Security Officer: "This ability costs {1} less to activate if it targets a creature with power 3 or less": as the
    // target is when the cost is worked out (CR 601.2f).
    const lessTarget = / This ability costs \{(\d+)\} less to activate if it targets (?:an? )?([^.]+)\.$/.exec(effectText);
    if (lessTarget && !costLess && !costLessIf && !costLessIfTarget) {
      const filter = parseTargetPhrase(lessTarget[2]!);
      if (filter?.kind !== "object") return "fail";
      costLessIfTarget = { n: Number(lessTarget[1]), filter: { ...filter, text: lessTarget[2]! } };
      effectText = effectText.slice(0, lessTarget.index);
      found = true;
    }
    // "Spend only mana of the chosen color to activate this ability." (Throne of Eldraine): the color chosen as it entered.
    if (/ Spend only mana of the chosen color to activate this ability\.$/.test(effectText) && !spendOnlyChosenColor) {
      spendOnlyChosenColor = true;
      effectText = effectText.slice(0, effectText.length - " Spend only mana of the chosen color to activate this ability.".length);
      found = true;
    }
    // Atalya, Samite Master: "Choose one — • ... Spend only white mana on X. • ... Spend only white mana on X.": every mode
    // says it, so it holds whichever is chosen, read as for one ability (below).
    const modesOnX = /^Choose one — /.test(effectText) && !spendOnly ? effectText.split(" • ").slice(1).map((mode) => / Spend only (white|blue|black|red|green) mana on X\.$/.exec(mode)?.[1]) : [];
    if (modesOnX.length > 1 && modesOnX.every((c) => c && c === modesOnX[0])) effectText = `${effectText.replaceAll(` Spend only ${modesOnX[0]} mana on X. •`, " •").replace(new RegExp(` Spend only ${modesOnX[0]} mana on X\\.$`), "")} Spend only ${modesOnX[0]} mana on X.`;
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
    // Prototype Portal, Soul Foundry: "X is the mana value of that card": the card its imprint ability exiled (CR 107.3c).
    if (/ X is the mana value of (?:that|the exiled) card\.$/.test(effectText) && !xIs && costs === "{X}, {T}" && /^Create a token that's a copy of the exiled card\./.test(effectText)) {
      xIs = "linkedCardMv";
      // The card exiled with ~ (CR 607.2a): its one imprint ability's card (linked in compile.ts).
      effectText = effectText.replace(/ X is the mana value of (?:that|the exiled) card\.$/, "").replace(/^Create a token that's a copy of the exiled card\./, "Create a token that's a copy of a card exiled with ~.");
      found = true;
    }
    // Voodoo Doll: "{X}{X}, {T}: ... X is the number of pin counters on ~.": X is defined by the ability (CR 107.3c), the
    // counters on it as it's activated (rulings).
    const xCounters = !xIs && /\{X\}/.test(costs) ? / X is the number of ([a-z]+) counters on ~\.$/.exec(effectText) : null;
    if (xCounters) {
      xIs = { counters: counterKind(xCounters[1]!) };
      effectText = effectText.slice(0, xCounters.index) + "";
      if (!/\.$/.test(effectText)) effectText += ".";
      found = true;
    }
    // Marath, Will of the Wild: "Choose one — • ... X can't be 0. • ... X can't be 0.": the same rule in every mode, so
    // one for the ability, whichever mode is chosen.
    if (/^Choose one — (?:• [^•]+? X can't be 0\.\s*)+$/.test(effectText.trim()) && !xMin) effectText = `${effectText.trim().replace(/ X can't be 0\.(?=\s*•|\s*$)/g, "")} X can't be 0.`;
    // "X can't be 0." (Ruthless Technomancer, Lair of the Hydra's {X}{G}): only with an X in its costs.
    if (/ X can't be 0\.$/.test(effectText) && !xMin && (extra.some((x) => "x" in x && x.x) || /\{X\}/.test(costs))) {
      xMin = 1;
      effectText = effectText.slice(0, effectText.length - " X can't be 0.".length);
      found = true;
    }
    // Goblin Ski Patrol: "Activate only once and only if you control a snow Mountain": once ever, and only then.
    if (/ Activate only once and only [^.]+\.$/.test(effectText) && !onceEver && !keyword) {
      onceEver = true;
      effectText = effectText.replace(/ Activate only once and only ([^.]+)\.$/, " Activate only $1.");
      found = true;
    }
    // Thought Shucker: "Activate only if there are seven or more cards in your graveyard and only once": once ever, and
    // only then (CR 602.5b).
    if (/ Activate only if [^.]+ and only once\.$/.test(effectText) && !onceEver && !keyword) {
      onceEver = true;
      effectText = effectText.replace(/ and only once\.$/, ".");
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
    // Withering Wisps: "Activate no more times each turn than the number of snow Swamps you control." (CR 602.5b): both
    // counted each time it's activated (rulings).
    const mostCount = / Activate no more times each turn than (the number of [^.]+)\.$/.exec(effectText);
    const mostN = mostCount && !maxPerTurn && !maxPerTurnCount ? parseCount(mostCount[1]!, null) : null;
    if (mostCount && mostN) {
      maxPerTurnCount = mostN;
      effectText = effectText.slice(0, mostCount.index);
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
  // Tornado: "Pay 3 life for each velocity counter on ~": that many for each such counter on it as the cost is worked
  // out (CR 601.2f, 119.4); none with none.
  const lifePer = /Pay (\d+) life for each ([a-z]+) counter on ~/.exec(costs);
  const life = /Pay (\d+) life(?! for each)/.exec(costs);
  // "Pay X life" only with an X in the mana cost (Krumar Initiate, below).
  if (/Pay X life/.test(costs) && !/\{X\}/.test(costs)) return "fail";
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
  // Sandman, Shifting Scoundrel: "Return ~ and target land card from your graveyard to the battlefield tapped."
  // Slimefoot and Squee: "Return this card and up to one other target creature card from your graveyard ...".
  // Mister Immortal: "Return this card from your graveyard or from exile to the battlefield tapped": it works from either
  // zone (CR 113.6k), where "~" is the card; a face-down card in exile has no abilities (CR 406.3, 708.2).
  const orExile = /^Return ~ from your graveyard or from exile to the battlefield(?: tapped)?\.$/.test(effectText);
  if (orExile) effectText = effectText.replace(" or from exile", "");
  const returnsSelf = /^(?:Return ~ and (?:up to one other )?target [a-z]+ card from your graveyard to the battlefield(?: tapped)?|Return ~ from your graveyard to (?:your hand|the battlefield(?:(?: tapped(?: and attacking)?)?(?: with (?:a|two|three) (?:\+1\/\+1|finality) counters? on (?:it|~))?| attached to target creature(?: you control(?: with power \d+ or less)?)?)?)|Put ~ from your graveyard into your library (?:second|third) from the top|Put ~ from your graveyard on top of your library|Put ~ from your graveyard onto the battlefield transformed)\./.test(effectText) ||
    // Nim Devourer: "Return this card from your graveyard to the battlefield, then sacrifice a creature." (it may be the one).
    effectText === "Return ~ from your graveyard to the battlefield, then sacrifice a creature.";
  const fromYard = /Exile ~ from your graveyard/.test(costs) || returnsSelf || inYard;
  // "{4}: Put this card from your hand onto the battlefield" (Talon Gates of Madara): it works only from your hand
  // (CR 113.6k); not playing a land (CR 305.1), and nothing happens if the card has left your hand (rulings).
  const putFromHand = effectText === "Put ~ from your hand onto the battlefield.";
  // Forecast: revealing the card is its cost, and the card stays in its owner's hand (CR 702.57b); only with the keyword.
  // Tetzimoc, Primal Death: "{B}, Reveal ~ from your hand: ..." without the keyword: from its owner's hand only, as often
  // as its other costs can be paid (CR 113.6k, 602.2b).
  const forecast = keyword === "Forecast";
  const revealHand = costs.split(", ").includes("Reveal ~ from your hand");
  if ((forecast && !revealHand) || (revealHand && (tap || untapSelf || /~/.test(costs.replace("Reveal ~ from your hand", "")) || putFromHand || inYard))) return "fail";
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
  // Shattered Seraph: "{2}, Exile this card from your hand: Target land gains ..." (not a mana ability): mana and the exile.
  const exileFromHand = costs === "Exile ~ from your hand" || (costs.split(", ").includes("Exile ~ from your hand") && costs.split(", ").every((c) => c === "Exile ~ from your hand" || /^(?:\{(?:\d+|[WUBRGC])\})+$/.test(c)));
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
  // Sword of the Ages: "X is the total power of the creatures sacrificed this way" (as they last existed, rulings), "then
  // exile ~ and those creature cards": the cards its cost put into graveyards, still there (CR 400.7; a token is gone).
  const swordAges = /(?:^|, )Sacrifice ~ and any number of creatures you control(?=, |$)/.test(costs) && effectText === "~ deals X damage to any target, where X is the total power of the creatures sacrificed this way, then exile ~ and those creature cards." ? parseBody("~ deals 1 damage to any target.", { activated: true }) : null;
  if (/(?:^|, )Sacrifice ~ and any number of /.test(costs) && !swordAges) return "fail";
  const body = swordAges
    ? { ...swordAges, effects: [{ type: "damage" as const, amount: { count: { kind: "sacrificedTotalPower" as const } }, to: { ref: "anyTarget" as const, index: 0 } }, { type: "exile" as const, what: { ref: "selfCard" as const, moved: true as const } }, { type: "exile" as const, what: { ref: "sacrificedCards" as const } }], text: effectText }
    : putFromHand || putFromCommand ? { targets: [], effects: [{ type: "putOntoBattlefield" as const, what: { ref: "selfCard" as const } }], text: effectText } : parseBody(effectText.replace(/^It (?=deals\b)/, "~ ")
    // Migloz, Maze Crusher: "{1}, Remove an oil counter from ~: It gains vigilance and menace until end of turn": with
    // nothing else named before it, "it" is the permanent whose ability this is.
    .replace(/^It (?=(?:gets|gains) [^.]*until end of turn\.$)/, returnsSelf || inYard || fromHand ? "It " : "~ ")
    // Blademane Baku: "For each counter removed, ~ gets +2/+0 until end of turn" after "Remove X ki counters from ~".
    .replace(/^For each counter removed, (~ gets [+-]\d+\/[+-]\d+ until end of turn)\.$/, removeCounters?.x ? "$1 for each counter removed this way." : "$&").replace(/^(Put [^.]+ counters? on ~\. )It (?=deals\b)/, "$1~ ").replace(/^(Untap ~\. Put an? [^.]+ counter on) it\.$/, "$1 ~."), { activated: true, ...(activateIf?.kind === "self" && activateIf.is === "attacking" ? { selfAttacking: true } : {}), ...(removeCounters?.x ? { ownX: true } : {}), ...(returnsSelf || inYard ? { selfCard: true } : {}), ...(fromHand ? { discardedSelf: true as const } : {}), ...(extra.some((c) => c.kind === "exileFromGraveyard" && c.linked) ? { costLinked: true } : {}) });
  if (!body) return "fail";
  // Corpseweft: the token is X/X for twice the cards exiled (the X announced, see above).
  if (twiceExiled) {
    const tok = body.effects.length === 1 && body.effects[0]!.type === "createToken" ? body.effects[0]! : undefined;
    if (tok?.type !== "createToken" || JSON.stringify(tok.pt) !== '{"count":{"kind":"x"}}') return "fail";
    tok.pt = { count: { kind: "x" }, times: 2 };
    xMin = 1;
  }
  if (uncopyable) body.uncopyable = true;
  // An activated ability without a target that could add mana, and that moves no card to or from a library, is a mana
  // ability (CR 605.1a): it doesn't use the stack (605.3b). One whose other instructions aren't known to stay clear of
  // libraries isn't compiled.
  // A cost that mills moves a card from a library: it uses the stack (CR 605.1a; Millikin rulings).
  const mana = extra.some((c) => c.kind === "mill") ? "stack" : manaAbilityKind(body);
  // "Remove X storage counters from ~: Add X mana ..." (Crucible of the Spirit Dragon, Petalmane Baku): an X for a mana
  // ability isn't announced anywhere yet.
  if (mana === "fail" || (mana === "mana" && (water || fromHand || exileOwn || bounceOwn || bottomOwn || keyword || halfLife || untapSelf || removeCounters?.x))) return "fail";
  if (exileFromHand && (anyPlayer || sorcerySpeed || oncePerTurn || activateIf || extra.length || (mana === "mana" ? costs !== "Exile ~ from your hand" : !JSON.stringify(body.effects).includes('"type":"mayCastExiledSelf"')))) return "fail";
  // X in the effect is the X paid in the cost (CR 107.3a); with none to pay, it isn't defined.
  if (usesX(body) && !symbols.includes("X") && !energyX && !removeCounters?.x && !extra.some((c) => ("x" in c && c.x) || ((c.kind === "discard" || c.kind === "sacrifice") && c.mvX))) return "fail";
  // Any player's: only costs any player can pay (mana, life, their own cards and permanents), not ones that tap,
  // sacrifice, exile or change the permanent itself, which only its controller could do (CR 701.21a, 602.2).
  // Only the chosen color's mana pays it: an ability of a permanent that chose one, with a mana cost, not a mana ability.
  if (spendOnlyChosenColor && (mana !== "stack" || !manaCost || fromYard || fromHand)) return "fail";
  if (spendOnly && (mana !== "stack" || manaCost !== "{X}" || spendOnlyChosenColor)) return "fail";
  // "Sacrifice Blazing Torch", "Unattach Leonin Bola": the Equipment that gave this ability (grants.ts), not a mana ability.
  const sourceCost = /Sacrifice \u27easource\u27eb/.test(costs) ? "sacrifice" : /Unattach \u27easource\u27eb/.test(costs) ? "unattach" : undefined;
  if (sourceCost && (mana !== "stack" || fromYard || fromHand)) return "fail";
  if (anyPlayer && (tap || untapSelf || mana !== "stack" || fromYard || fromHand || exileOwn || /Sacrifice ~|Exert ~|Remove |on ~|~/.test(costs) || halfLife || energy)) return "fail";
  return {
    ...(anyPlayer ? { anyPlayer: true as const } : {}),
    ...(ownerOnly ? { ownerOnly: true as const } : {}),
    ...(opponentsOnly ? { opponentsOnly: true as const } : {}),
    ...(spendOnlyChosenColor ? { spendOnlyChosenColor: true as const } : {}),
    ...(spendOnly ? { spendOnly } : {}),
    manaCost,
    ...(water ? { waterbend: water[1] === "X" ? ("X" as const) : Number(water[1]) } : {}),
    tap,
    sacrificeSelf: /Sacrifice ~/.test(costs),
    ...(sourceCost ? { grantSourceCost: { ref: "grantSource" as const, action: sourceCost } } : {}),
    ...(/Exert ~/.test(costs) ? { exertCost: true as const } : {}),
    ...(untapSelf ? { untapSelf: true as const } : {}),
    ...(/Unattach ~/.test(costs) ? { unattachCost: true as const } : {}),
    ...(tapAttached ? { tapAttached: true as const } : {}),
    ...(/Reveal the player you chose/.test(costs) ? { revealChosen: true as const } : {}),
    sorcerySpeed,
    body,
    text: raw,
    ...(fromYard ? { zone: "graveyard" as const, ...(returnsSelf || (inYard && !/Exile ~ from your graveyard/.test(costs)) ? {} : { exileSelf: true }) } : {}),
    ...(orExile ? { orExile: true as const } : {}),
    ...(exileOwn ? { exileSelf: true } : {}),
    ...(bounceOwn ? { returnSelf: true as const } : {}),
    ...(bottomOwn ? { returnSelf: true as const, toLibraryBottom: true as const } : {}),
    ...(fromHand ? { zone: "hand" as const, discardSelf: true } : {}),
    ...(exileFromHand ? { zone: "hand" as const, exileSelf: true } : {}),
    ...(putFromHand || revealHand ? { zone: "hand" as const } : {}),
    ...(putFromCommand ? { zone: "command" as const } : {}),
    ...(oncePerTurn ? { oncePerTurn } : {}),
    ...(onceEver ? { onceEver: true as const } : {}),
    ...(keyword ? { keyword } : {}),
    ...(maxPerTurn ? { maxPerTurn } : {}),
    ...(maxPerTurnCount ? { maxPerTurnCount } : {}),
    ...(xMin ? { xMin } : {}),
    ...(xIs ? { xIs } : {}),
    ...(costLess ? { costLess } : {}),
    ...(costMore ? { costMore } : {}),
    ...(costLessIf ? { costLessIf } : {}),
    ...(costLessIfTarget ? { costLessIfTarget } : {}),
    ...(activateIf ? { activateIf } : {}),
    ...(life ? { lifeCost: Number(life[1]) } : {}),
    ...(lifePer ? { lifeCostPerCounter: { n: Number(lifePer[1]), counter: counterKind(lifePer[2]!) } } : {}),
    // Krumar Initiate: "{X}{B}, {T}, Pay X life": the X announced for its mana cost (CR 107.3a, 119.4).
    ...(/Pay X life/.test(costs) && symbols.includes("X") ? { lifeCostX: true as const } : {}),
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
const MANA_RIDERS = new Set<Effect["type"]>(["addMana", "choose", "choosePlayer", "roll", "if", "may", "gainLife", "loseLife", "damage", "counters", "removeCounters", "removeSelfCounter", "delayed", "tap", "untap", "getEnergy", "poison", "skipUntap", "continuous", "sacrifice"]);

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
  // Jace, Reality Sculptor: "Activate only if there are twenty-five or more loyalty counters among Jaces you control"
  // (CR 602.5b), checked as it's activated, on top of the loyalty ability's own timing (CR 606.3).
  const onlyIf = / Activate only if ([^.]+)\.$/.exec(effectText);
  const activateIf = onlyIf ? parseActivateCondition(onlyIf[1]!.replace(/\b(twenty|thirty|forty|fifty)-(one|two|three|four|five|six|seven|eight|nine)\b/g, (_, t: string, u: string) => String(NUMBER_WORDS[t]! + NUMBER_WORDS[u]!))) : undefined;
  if (activateIf === null) return "fail";
  if (onlyIf) effectText = effectText.slice(0, onlyIf.index);
  const body = parseBody(effectText, { activated: true });
  if (!body) return "fail";
  if (usesX(body) && amount !== "X") return "fail";
  const n = Number(amount);
  return { manaCost: "", tap: false, sacrificeSelf: false, sorcerySpeed: true, body, text: raw, ...(amount === "X" ? { loyaltyX: true } : { loyalty: minus ? -n : n }), ...(activateIf ? { activateIf } : {}) };
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
