import { allEffects, type AbilityBody, type ActivatedAbility, type AdditionalCost, type Effect } from "../abilities";
import { NUM, num, X, sacrificeSelf, counterKind } from "./words";
import { removeCounterCost } from "./mana-abilities";
import { parseBody, usesX } from "./body";
import { parseSearchFilter } from "./search";
import { parseAdditionalCost } from "./keyword-abilities";
import { pickFilter } from "./targets";
import { parseOnlyClauses } from "./statics";
import { parseCount } from "./counts";

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
  return word && ABILITY_WORDS.has(word[1]!.toLowerCase()) ? raw.slice(word[0].length) : raw;
}

export function parseActivated(raw: string): ActivatedAbility | "fail" | null {
  // An ability word (CR 207.2c), or a flavor word ("Blow Up — {T}, Sacrifice ~: ...", CR 207.2d): no rules meaning.
  const word = /^([A-Z][^—•":{}]*?) — /.exec(raw);
  // "Exhaust — [Cost]: [Effect]" means "[Cost]: [Effect]. Activate only once." (CR 702.177a); "Boast — [Cost]: [Effect]"
  // means "... Activate only if this creature attacked this turn and only once each turn." (CR 702.142a); "Power-up —
  // [Cost]: [Effect]" means "[Cost]: [Effect]. If this permanent entered this turn, this ability's cost is reduced by this
  // permanent's mana cost. Activate this ability only once." (CR 702.193a).
  const keyword = word && /^(Exhaust|Boast|Power-up)$/.test(word[1]!) ? (word[1] as "Exhaust" | "Boast" | "Power-up") : undefined;
  const line = word && (keyword || ABILITY_WORDS.has(word[1]!.toLowerCase()) || !KEYWORD_NAMES.has(word[1]!.toLowerCase())) ? raw.slice(word[0].length) : raw;
  // Costs: mana symbols run together ("{1}{R}"), other parts are comma-separated ("{2}, {T}, Sacrifice ~").
  const piece = String.raw`(?:\{[^}]+\})+|Reveal the player you chose|Sacrifice ~|Exert ~|Discard ~|Exile ~ from your graveyard|Exile ~ from your hand|Exile ~|Remove (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) (?:[+-]1/[+-]1|[a-z]+) counters? from ~|Put (?:a|an|one|two|three) (?:[+-]1/[+-]1|[a-z]+) counters? on ~|Pay \d+ life|Pay life equal to the number of colors in your commanders' color identity|Pay half your life, rounded (?:up|down)|Pay (?:\{E\})+|Pay \w+ \{E\}|Sacrifice (?:an?|another|one|two|three|four|five) [^,:]+?|Discard (?:an?|one|two|three) [^,:]*?cards?(?: at random)?|Put (?:a|one|two|three) cards? from your hand on top of your library|Put a card exiled with ~ into its owner's graveyard|Tap (?:an|one|two|three|four|five) untapped [^,:]+? you control|Collect evidence \d+|Mill (?:a card|\w+ cards)|Exile the top (?:[a-z]+ )?cards? of your graveyard|Exile (?:a|an|one|two|three|four|five) [^,:]*?cards? from your graveyard`;
  const m = new RegExp(`^((?:${piece})(?:, (?:${piece}))*): (.+)$`).exec(line);
  if (!m) return null;
  // "Pay half your life, rounded up" (Murderous Betrayal) has a comma of its own: read it apart from the other costs.
  const halfLife = /Pay half your life, rounded (up|down)/.exec(m[1]!);
  const costs = halfLife ? m[1]!.replace(halfLife[0], "Pay half your life") : m[1]!;
  // Sacrificing other permanents or discarding cards as part of the cost (CR 602.2b, 601.2h).
  const extra: AdditionalCost[] = [];
  let removeCounters: ActivatedAbility["removeCounters"];
  let putCounters: ActivatedAbility["putCounters"];
  for (const part of costs.split(", ")) {
    let c: RegExpExecArray | null;
    if ((c = new RegExp(`^Put ${NUM} ([+-]1/[+-]1|[a-z]+) counters? on ~$`).exec(part))) putCounters = { counter: counterKind(c[2]!), n: num(c[1]!) };
    else if (/^Remove /.test(part)) {
      const rc = removeCounterCost(part);
      if (!rc || !Number.isFinite(rc.n)) return "fail"; // "Remove X counters" isn't modeled
      removeCounters = rc;
    } else if ((c = /^Sacrifice another (\w+) or an? (\w+)$/.exec(part))) {
      // "Sacrifice another creature or an artifact" (Street Urchin): this permanent too if it's an artifact (rulings).
      const filter = pickFilter(`${c[1]} or ${c[2]}`);
      const selfIf = pickFilter(c[2]!);
      if (!filter || !selfIf) return "fail";
      extra.push({ kind: "sacrifice", filter: { ...filter, text: `${c[1]} or ${/^[aeiou]/i.test(c[2]!) ? "an" : "a"} ${c[2]}` }, n: 1, other: true, selfIf });
    } else if (part !== "Sacrifice ~" && (c = new RegExp(`^Sacrifice (another|${NUM}) (.+)$`).exec(part))) {
      const filter = pickFilter(c[3]!); // NUM is a group of its own
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter, n: c[1] === "another" ? 1 : num(c[1]!), ...(c[1] === "another" ? { other: true } : {}) });
    } else if ((c = new RegExp(`^Tap ${NUM} untapped (.+) you control$`).exec(part))) {
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "tap", filter: { ...filter, text: `untapped ${filter.text} you control` }, n: num(c[1]!), ...(/\{T\}/.test(costs) ? { other: true } : {}) });
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
    } else if (/^Exile (?!~|the top )/.test(part)) {
      // "Exile a card from your graveyard" (Relic of Progenitus' cousins, Sigarda): cards chosen as it's activated.
      const c2 = parseAdditionalCost(part);
      if (c2?.kind !== "exileFromGraveyard" || c2.top || c2.x) return "fail";
      extra.push(c2);
    } else if (/^Exile the top /.test(part)) {
      // "Exile the top creature card of your graveyard" (Necratog): no choice, the topmost one (CR 404.1).
      const top = parseAdditionalCost(part);
      if (top?.kind !== "exileFromGraveyard" || !top.top) return "fail";
      extra.push(top);
    } else if (/^Put a card exiled with ~ into its owner's graveyard$/.test(part)) {
      // Jester's Scepter: one of the cards its linked exile took (CR 607.2a).
      extra.push({ kind: "exileFromGraveyard", n: 1, linked: true });
    } else if ((c = new RegExp(`^Put ${NUM} cards? from your hand on top of your library$`).exec(part))) {
      // Several cards go on top in the order their owner chooses (CR 401.4): the first one picked ends up on top.
      extra.push({ kind: "exileFromHand", n: num(c[1]!), toLibrary: true });
    }
  }
  let effectText = m[2]!;
  let sorcerySpeed = false;
  let oncePerTurn = keyword === "Boast";
  let maxPerTurn: number | undefined;
  let onceEver = keyword === "Exhaust" || keyword === "Power-up";
  // "Activate only if you have the city's blessing." (CR 602.5b): a condition checked as it's activated.
  let activateIf: ActivatedAbility["activateIf"] = keyword === "Boast" ? { kind: "self", is: "attackedThisTurn" } : undefined;
  // "This ability costs {1} less to activate for each legendary creature you control." (CR 602.2b applies 601.2f)
  let costLess: ActivatedAbility["costLess"];
  // "Activate only if this card is in your graveyard" (Loathsome Troll): it works only from there (CR 113.6j).
  let inYard = false;
  // "Any player may activate this ability" (CR 602.2): its controller is whoever activates it (CR 113.8), "you" in it
  // being that player; "but only during their turn" is the activator's turn.
  let anyPlayer = false;
  const anyone = / Any player may activate this ability(?: but only ([^.]+))?\.$/.exec(effectText);
  if (anyone) {
    anyPlayer = true;
    effectText = `${effectText.slice(0, anyone.index)}${anyone[1] ? ` Activate only ${anyone[1].replace(/\btheir\b/g, "your")}.` : ""}`;
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
      const c = parseCount(less[2]!, null, true);
      if (!c) return "fail";
      costLess = { ...c, times: (c.times ?? 1) * Number(less[1]) };
      effectText = effectText.slice(0, less.index);
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
    // Restrictions (CR 602.5b, 506.8g): "Activate only as a sorcery", "... only once each turn", "... only during your
    // upkeep", "... only during your turn and only if an opponent lost life this turn", in any combination.
    const only = / Activate only ([^.]+)\.$/.exec(effectText);
    if (only && !activateIf && !sorcerySpeed && !oncePerTurn && !keyword) {
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
  const energy = energyIn(costs);
  if (energy < 0) return "fail";
  const symbols = [...costs.replace(/Pay (?:\{E\})+|Pay \w+ \{E\}/, "").matchAll(/\{([^}]+)\}/g)].map((x) => x[1]!);
  if (symbols.some((x) => x === "Q" || x === "E")) return "fail";
  const tap = symbols.includes("T");
  // "{3}, Exile this card from your graveyard: ...", "{2}{B}: Return this card from your graveyard to your hand":
  // it works only from your graveyard (CR 113.6j), where "~" is the card.
  const returnsSelf = /^(?:Return ~ from your graveyard to (?:your hand|the battlefield(?: tapped)?)|Put ~ from your graveyard into your library third from the top)\./.test(effectText);
  const fromYard = /Exile ~ from your graveyard/.test(costs) || returnsSelf || inYard;
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
  const manaCost = symbols
    .filter((x) => x !== "T")
    .map((x) => `{${x}}`)
    .join("");
  // "Sacrifice ~: It deals damage equal to its power to ...", "Put two +1/+1 counters on ~. It deals 1 damage to any
  // target": "it" is the source, the only object named before it.
  const body = parseBody(effectText.replace(/^It (?=deals\b)/, "~ ").replace(/^(Put [^.]+ counters? on ~\. )It (?=deals\b)/, "$1~ "), { activated: true, ...(returnsSelf || inYard ? { selfCard: true } : {}), ...(extra.some((c) => c.kind === "exileFromGraveyard" && c.linked) ? { costLinked: true } : {}) });
  if (!body) return "fail";
  // An activated ability without a target that could add mana, and that moves no card to or from a library, is a mana
  // ability (CR 605.1a): it doesn't use the stack (605.3b). One whose other instructions aren't known to stay clear of
  // libraries isn't compiled.
  // A cost that mills moves a card from a library: it uses the stack (CR 605.1a; Millikin rulings).
  const mana = extra.some((c) => c.kind === "mill") ? "stack" : manaAbilityKind(body);
  if (mana === "fail" || (mana === "mana" && (fromHand || exileOwn || keyword || halfLife))) return "fail";
  if (exileFromHand && (mana !== "mana" || anyPlayer || sorcerySpeed || oncePerTurn || activateIf || extra.length)) return "fail";
  // X in the effect is the X paid in the cost (CR 107.3a); with none to pay, it isn't defined.
  if (usesX(body) && !symbols.includes("X")) return "fail";
  // Any player's: only costs any player can pay (mana, life, their own cards and permanents), not ones that tap,
  // sacrifice, exile or change the permanent itself, which only its controller could do (CR 701.21a, 602.2).
  if (anyPlayer && (tap || mana !== "stack" || fromYard || fromHand || exileOwn || /Sacrifice ~|Exert ~|Remove |on ~|~/.test(costs) || halfLife || energy)) return "fail";
  return {
    ...(anyPlayer ? { anyPlayer: true as const } : {}),
    manaCost,
    tap,
    sacrificeSelf: /Sacrifice ~/.test(costs),
    ...(/Exert ~/.test(costs) ? { exertCost: true as const } : {}),
    ...(/Reveal the player you chose/.test(costs) ? { revealChosen: true as const } : {}),
    sorcerySpeed,
    body,
    text: raw,
    ...(fromYard ? { zone: "graveyard" as const, ...(returnsSelf || (inYard && !/Exile ~ from your graveyard/.test(costs)) ? {} : { exileSelf: true }) } : {}),
    ...(exileOwn ? { exileSelf: true } : {}),
    ...(fromHand ? { zone: "hand" as const, discardSelf: true } : {}),
    ...(exileFromHand ? { zone: "hand" as const, exileSelf: true } : {}),
    ...(oncePerTurn ? { oncePerTurn } : {}),
    ...(onceEver ? { onceEver: true as const } : {}),
    ...(keyword ? { keyword } : {}),
    ...(maxPerTurn ? { maxPerTurn } : {}),
    ...(costLess ? { costLess } : {}),
    ...(activateIf ? { activateIf } : {}),
    ...(life ? { lifeCost: Number(life[1]) } : {}),
    ...(/Pay life equal to the number of colors in your commanders' color identity/.test(costs) ? { lifeCostIdentity: true as const } : {}),
    ...(halfLife ? { halfLifeCost: halfLife[1] as "up" | "down" } : {}),
    ...(energy ? { energyCost: energy } : {}),
    ...(extra.length ? { costs: extra } : {}),
    ...(removeCounters ? { removeCounters } : {}),
    ...(putCounters ? { putCounters } : {}),
    ...(mana === "mana" ? { mana: true as const } : {}),
  };
}

/** Instructions that move a card to or from a library (CR 605.1a): an ability with one isn't a mana ability. */
const LIBRARY_EFFECTS = new Set<Effect["type"]>(["draw", "mill", "putInLibrary", "exileTop", "revealTopToHand", "surveil", "handToTop", "shuffleIntoLibrary", "shuffleSpell", "shuffleZones", "search", "dig", "impulse", "cascade", "discover", "ripple", "explore", "hideaway", "recruit", "connive", "orderTop", "scry", "clash", "revealTop", "putInGraveyard", "castFromAmong"]);
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
  return Number.isFinite(n) ? n : -1; // a number we don't read ("fifty")
}

// ---------------------------------------------------------------------------
// Static abilities (CR 604)
