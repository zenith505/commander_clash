import type { CounterKind, ManaAbility, ManaProduce, ManaSpend, ManaTrigger, TargetSpec } from "../abilities";
import type { Color, ManaType } from "../types";
import { NUM, num, COUNTER, counterKind, ALL_COLORS, sacrificeSelf, singular, keywordOf } from "./words";
import { energyIn } from "./activated";
import { parseTargetPhrase, pickFilter } from "./targets";
import { parseCount } from "./counts";
import { parseBody } from "./body";
import { allEffects } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import { parseOnlyClauses, parseStaticCondition } from "./statics";
import { parseSearchFilter } from "./search";

/**
 * A mana ability (CR 605.1a): "{T}: Add {G}.", "{T}: Add {W} or {U}. ~ deals 1 damage to you.",
 * "{1}, {T}: Add {W}{U}.", "{T}, Sacrifice ~: Add one mana of any color.", "{T}: Add {C}{C}.",
 * "{T}: Add {G} for each creature you control.", "Sacrifice ~: Add {C}." Null if the line isn't one
 * we can run (mana that can only be spent on some spells, "in any combination", ...).
 */
export function parseManaAbility(line0: string): ManaAbility | null {
  // Victory Chimes: "{T}: A player of your choice adds {C}." Still a mana ability (rulings, CR 605.1a): its mana goes to
  // the player chosen.
  // Yurlok of Scorch Thrash: "{1}, {T}: Each player adds {B}{R}{G}." A mana ability too (CR 605.1a): the same mana for
  // every player still in the game, all at once.
  const each = /^(.+): Each player adds ((?:\{[WUBRGC]\})+)\.$/.exec(line0);
  if (each) {
    const ab = parseManaAbility(`${each[1]}: Add ${each[2]}.`);
    return ab && ab.produces.kind === "fixed" ? { ...ab, text: line0, toEachPlayer: true } : null;
  }
  const chosen = /^(.+): A player of your choice adds ((?:\{[WUBRGC]\})+)\.$/.exec(line0);
  if (chosen) {
    const ab = parseManaAbility(`${chosen[1]}: Add ${chosen[2]}.`);
    return ab && { ...ab, text: line0, toChosenPlayer: true };
  }
  // Metalworker: "{T}: Reveal any number of artifact cards in your hand. Add {C}{C} for each card revealed this way." A
  // mana ability (rulings): how many is chosen as it's activated.
  // Sacellum Godspeaker: "Reveal any number of creature cards with power 5 or greater from your hand. Add {G} for each
  // card revealed this way." The same (rulings: a mana ability, none revealed adds nothing).
  // Rosheen, Roaring Prophet: "Reveal any number of cards with {X} in their mana cost in your hand. Add {C}{C} for each
  // card revealed this way. Spend this mana only on costs that contain {X}.": the same, its mana restricted (CR 106.6;
  // rulings: any cost that contains {X}, all of it, not only the {X} part).
  const reveal = /^(.+): Reveal any number of ([a-z]+ cards|cards with \{X\} in their mana cost)( with power \d+ or greater)? (?:in|from) your hand\. Add ((?:\{[WUBRGC]\})+) for each card revealed this way\.( Spend this mana only [^.]+\.)?$/.exec(line0);
  if (reveal) {
    const ab = parseManaAbility(`${reveal[1]}: Add ${reveal[4]}.${reveal[5] ?? ""}`);
    const filter = parseSearchFilter(reveal[2] === "cards with {X} in their mana cost" ? "card with {X} in its mana cost" : `${reveal[2]!.replace(/s$/, "")}${reveal[3] ?? ""}`);
    if (!ab || !filter || ab.produces.kind !== "fixed" || (reveal[5] && !ab.spendOnly)) return null;
    return { ...ab, text: line0, produces: { kind: "revealX", filter, per: ab.produces.mana } };
  }
  // "{T}: For each color among permanents you control, add one mana of that color." (Bloom Tender), "{2}, {T}: Choose a
  // color. Add an amount of mana of that color equal to ..." (Nykthos, Three Tree City: the color is chosen as it resolves,
  // CR 605.3b, like "X mana of any one color").
  const line = line0
    .replace(/: For each color among (monocolored )?permanents you control, add one mana of that color\./, ": Add one mana of each color among $1permanents you control.")
    // Sunbird Effigy: "For each color among the exiled cards used to craft ~, add one mana of that color." (CR 702.167c).
    .replace(/: For each color among the exiled cards used to craft ~, add one mana of that color\./, ": Add one mana of each color among the exiled cards used to craft ~.")
    .replace(/: Choose a color\. Add an amount of mana of that color equal to your devotion to that color\./, ": Add an amount of mana of the chosen color equal to your devotion to that color.")
    .replace(/: Choose a color\. Add an amount of mana of that color equal to (.+?)\./, ": Add X mana of any one color, where X is $1.")
    // "Choose a color. Add one mana of that color for each charge counter on ~." (Astral Cornucopia): the same.
    .replace(/: Choose a color\. Add one mana of that color for each ([^.]+? counter) on ~\./, ": Add X mana of any one color, where X is the number of $1s on ~.")
    // Selvala, Eager Trailblazer: "Choose a color. Add one mana of that color for each different power among creatures
    // you control.": the same, each power counted once (Golden Ratio's count).
    .replace(/: Choose a color\. Add one mana of that color for each (different power among creatures you control)\./, ": Add X mana of any one color, where X is each $1.")
    // Meteor Crater: "Choose a color of a permanent you control. Add one mana of that color.": one of the colors among
    // them, never colorless (rulings), as for Mox Amber.
    .replace(/: Choose a color of a permanent you control\. Add one mana of that color\.$/, ": Add one mana of any color among permanents you control.")
    // Corrupted Grafstone: "Choose a color of a card in your graveyard. Add one mana of that color.": the same among the
    // cards there (The Grey Havens' kind), none with only colorless cards.
    .replace(/: Choose a color of a card in your graveyard\. Add one mana of that color\.$/, ": Add one mana of any color among cards in your graveyard.")
    // Doubling Cube: a mana ability (rulings), adding as much again of each type of mana in the pool.
    .replace(/: Double the amount of each type of unspent mana you have\.$/, ": Add as much again of each type of unspent mana you have.");
  const part = String.raw`\{[^}]+\}|Sacrifice ~|Return ~ to its owner's hand|Exert ~|Discard your hand|Pay \d+ life|Pay (?:\{E\})+|Remove (?:a|an|one|two|three|four|five) [a-z]+ counters? from ~|Put an? [^,:]+? counter on ~|Remove (?:any number of|X|one or more) (?:[a-z]+|[+-]\d+\/[+-]\d+) counters from ~|Tap (?:an|one|two|three) untapped [^,:]+? you control`;
  const m = new RegExp(`^((?:${part})(?:, (?:${part}))*): Add ([^.]+)\\.((?: [^.]+\\.)*)$`).exec(line);
  if (!m) return null;
  const costs = m[1]!.split(", ");
  let tap = false;
  let untapSelf = false;
  let sacrificeSelf = false;
  let returnSelf = false;
  let manaCost = "";
  let lifeCost: number | undefined;
  let energyCost: number | undefined;
  let removeCounters: ManaAbility["removeCounters"];
  let tapCost: ManaAbility["tapCost"];
  let removeX: { counter: CounterKind; any: boolean; oneOrMore?: boolean } | undefined;
  let discardHand = false;
  let exert = false;
  let putCost: CounterKind | undefined;
  for (const c of costs) {
    const pc = new RegExp(`^Put an? ${COUNTER} counter on ~$`).exec(c);
    const rc = removeCounterCost(c);
    const tc = new RegExp(`^Tap ${NUM} untapped (.+) you control$`).exec(c);
    // Rasputin, the Oneiromancer: "Remove one or more dream counters from ~": X counters, at least one (CR 107.3a).
    const rx = new RegExp(`^Remove (any number of|X|one or more) ${COUNTER} counters from ~$`).exec(c);
    if (rc) removeCounters = rc;
    // "Put a -0/-1 counter on ~: Add {G}" (Wall of Roots): put as the cost is paid, with the rest (CR 602.2b, 605.3a).
    else if (pc && !putCost) putCost = counterKind(pc[1]!);
    else if (rx && !removeX && !removeCounters) removeX = { counter: counterKind(rx[2]!), any: rx[1] === "any number of", ...(rx[1] === "one or more" ? { oneOrMore: true } : {}) };
    else if (tc) {
      const filter = pickFilter(tc[2]!);
      if (!filter || tapCost) return null;
      tapCost = { kind: "tap", filter: { ...filter, text: `untapped ${filter.text} you control` }, n: num(tc[1]!), ...(costs.includes("{T}") ? { other: true } : {}) };
    }
    else if (c === "{T}") tap = true;
    // Pili-Pala: "{2}, {Q}: Add one mana of any color." (CR 107.6), not with {T} as well.
    else if (c === "{Q}" && !untapSelf && !costs.includes("{T}")) untapSelf = true;
    else if (c === "Discard your hand" && !discardHand) discardHand = true;
    else if (c === "Sacrifice ~") sacrificeSelf = true;
    // "Return ~ to its owner's hand" (Grinning Ignus): paid with the rest (CR 602.2b, 605.3a).
    else if (c === "Return ~ to its owner's hand" && !returnSelf) returnSelf = true;
    // "Exert ~" (CR 701.43a): it won't untap during its controller's next untap step.
    else if (c === "Exert ~" && !exert) exert = true;
    else if (/^Pay \d+ life$/.test(c)) lifeCost = Number(/\d+/.exec(c)![0]);
    else if (/^Pay (\{E\})+$/.test(c)) energyCost = energyIn(c);
    // "{W/U}, {T}: Add ..." (filter lands): hybrid symbols are paid with either color (CR 107.4e).
    else if (/^(\{(\d+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+$/.test(c)) manaCost += c;
    else return null;
  }
  const produces = removeX ? removedProduced(m[2]!, removeX.counter, removeX.any, !!removeX.oneOrMore) : parseManaProduced(m[2]!);
  if (!produces || (removeCounters && removeX)) return null;
  const out: ManaAbility = { text: line0, manaCost, tap, ...(untapSelf ? { untapSelf: true as const } : {}), sacrificeSelf, produces, ...(lifeCost ? { lifeCost } : {}), ...(energyCost ? { energyCost } : {}), ...(removeCounters ? { removeCounters } : {}), ...(tapCost ? { tapCost } : {}), ...(discardHand ? { discardHand: true as const } : {}), ...(returnSelf ? { returnSelf: true as const } : {}), ...(exert ? { skipNextUntap: true } : {}), ...(putCost ? { putCounter: putCost } : {}) };
  let m2: RegExpExecArray | null;
  // Magus Lucea Kane: "When you next cast a spell with {X} in its mana cost or activate an ability with {X} in its
  // activation cost this turn, copy that spell or ability. You may choose new targets for the copy.": a delayed trigger
  // made as the mana ability resolves (CR 603.7a, 605.3b), triggering once (CR 603.7c) for whichever comes first that
  // turn, the mana symbol {X} only (rulings); the copy keeps X, modes and divisions (CR 707.10), even if the original was
  // countered, and resolves first (rulings). Its mana needn't be spent on that spell (rulings).
  const MAGUS = "When you next cast a spell with {X} in its mana cost or activate an ability with {X} in its activation cost this turn, copy that spell or ability. You may choose new targets for the copy.";
  let rest = m[3] ?? "";
  if (rest.includes(MAGUS)) {
    rest = rest.replace(MAGUS, "");
    out.nextCast = { type: "nextCast", filter: { kind: "spell", xInCost: true, text: "spell with {X} in its mana cost" }, effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "copy that spell or ability. You may choose new targets for the copy", xAbility: true };
  }
  for (const extra of rest.split(/(?<=\.) /).map((x) => x.trim()).filter(Boolean)) {
    const dmg = new RegExp(`^~ deals ${NUM} damage to you\\.$`).exec(extra);
    if (dmg) out.selfDamage = num(dmg[1]!);
    else if ((m2 = new RegExp(`^~ deals ${NUM} damage to you if (you don't control an? [A-Z][a-z]+)\\.$`).exec(extra)) && !out.selfDamage) {
      const cond = parseStaticCondition(m2[2]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond) return null;
      out.selfDamage = num(m2[1]!);
      out.selfDamageIf = cond;
    }
    else if (extra === "~ doesn't untap during your next untap step.") out.skipNextUntap = true;
    else if (extra === "During your next untap step, as you untap your permanents, return ~ to its owner's hand.") out.returnAtNextUntap = true;
    // Farrelite Priest: "If this ability has been activated four or more times this turn, sacrifice ~ at the beginning of
    // the next end step." A mana ability resolves at once (CR 605.3b), so the fourth activation and each one after it
    // make a delayed trigger (rulings on Dragon Whelp).
    else if ((m2 = /^If this ability has been activated (four|five|three|two) or more times this turn, sacrifice ~ at the beginning of the next end step\.$/.exec(extra)) && !out.sacrificeIfActivated) out.sacrificeIfActivated = num(m2[1]!);
    else if ((m2 = /^If (?:any of )?that mana is spent on an? (?:([A-Z][a-z]+) )?creature spell, it gains haste( until end of turn)?\.$/.exec(extra)) && !out.spentHaste && (!m2[1] || CREATURE_TYPES.has(m2[1]))) {
      // "If that mana is spent on a Dragon creature spell, it gains haste until end of turn" (Carnelian Orb of Dragonkind).
      out.spentHaste = m2[2] ? "endOfTurn" : "game";
      if (m2[1]) out.spentHasteType = m2[1];
    }
    else if (extra === "If that mana is spent on an instant or sorcery spell, that spell can't be countered.") out.spentUncounterable = true;
    else if (extra === "If this mana is spent to cast a creature spell, that creature enters with an additional +1/+1 counter on it.") out.spentCreatureCounter = true;
    // Guildmages' Forum, Animal Attendant: only for a creature spell that's multicolored, or that isn't a Human.
    else if ((m2 = /^If that mana is (?:spent on|spent to cast) an? (multicolored|non-Human) creature spell, that creature enters with an additional \+1\/\+1 counter on it\.$/.exec(extra)) && !out.spentCreatureCounter) out.spentCreatureCounter = m2[1] === "multicolored" ? "multicolored" : "nonHuman";
    // Chocobo Camp: "When you next cast a Bird creature spell this turn, ...": a creature type too.
    else if (/^When you next cast an? (?:(?:[A-Z][a-z]+ )?[a-z ]+ )?spell(?: with \{X\} in its mana cost)? this turn, /.test(extra) && !out.nextCast) {
      const body = parseBody(extra);
      const e = body?.effects.length === 1 && !body.targets.length ? body.effects[0]! : undefined;
      if (e?.type !== "nextCast" || e.cascade || e.who) return null;
      out.nextCast = e;
    }
    else if (extra === "If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on it equal to the number of times it's been cast from the command zone this game.") out.spentCommanderCounters = true;
    // Depletion lands: "Put a depletion counter on ~.", "If there are no depletion counters on ~, sacrifice it."
    else if ((m2 = new RegExp(`^Put an? ${COUNTER} counter on ~\\.$`).exec(extra)) && !out.putCounter) out.putCounter = counterKind(m2[1]!);
    else if ((m2 = new RegExp(`^If there are no ${COUNTER} counters on ~, sacrifice it\\.$`).exec(extra)) && !out.sacrificeIfNo && removeCounters?.counter === counterKind(m2[1]!)) out.sacrificeIfNo = counterKind(m2[1]!);
    // "If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead" (Urza's Tower), "If a card is exiled
    // with ~, add {C}{C} instead" (Ugin's Labyrinth): the symbols written out. (Leafkin Druid's "add {G}{G} instead" is an activated mana ability with an "if" instead, mana-abilities-with-costs.)
    else if ((m2 = new RegExp(`^If (you control an Urza's [^,]+|a card is exiled with ~), add ((?:\\{[WUBRGC]\\}){2,}) instead\\.$`).exec(extra)) && new Set(m2[2]!.match(/[WUBRGC]/g)).size === 1 && out.produces.kind === "fixed" && !out.produces.n && !out.produces.count) {
      const p = out.produces;
      const sym = m2[2]!.match(/[WUBRGC]/)![0];
      const n = m2[2]!.match(/\{/g)!.length;
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || p.mana.some((x) => x !== sym) || n <= p.mana.length) return null;
      out.produces = { kind: "fixed", mana: [p.mana[0]!], n: { count: { kind: "stateIf", cond }, times: n - p.mana.length, plus: p.mana.length } };
    }
    else if ((m2 = new RegExp(`^If ([^,]+), add ${NUM} \\{([WUBRGC])\\} instead\\.$`).exec(extra)) && out.produces.kind === "fixed" && !out.produces.n && !out.produces.count) {
      // "Add {G}{G}. If you've completed a dungeon, add six {G} instead." (Undermountain Adventurer): as it resolves.
      const p = out.produces;
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || p.mana.some((x) => x !== m2![3]) || num(m2[2]!) <= p.mana.length) return null;
      out.produces = { kind: "fixed", mana: [p.mana[0]!], n: { count: { kind: "stateIf", cond }, times: num(m2[2]!) - p.mana.length, plus: p.mana.length } };
    }
    else if ((m2 = /^If ([^,]+), add (\{[WUBRGC]\}) instead\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "fixed" && out.produces.mana.length === 1 && !out.produces.n && !out.produces.count) {
      // River of Tears: "Add {U}. If you played a land this turn, add {B} instead." Checked as it resolves.
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      const produces = parseManaProduced(m2[2]!);
      if (!cond || !produces) return null;
      out.insteadIf = { cond, produces };
    }
    else if ((m2 = /^If ([^,]+), add three mana of that type instead\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "landsCouldProduce" && !out.produces.n) {
      // Incubation Druid: "If ~ has a +1/+1 counter on it, add three mana of that type instead."
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond) return null;
      out.insteadIf = { cond, produces: { ...out.produces, n: 3 } };
    }
    else if ((m2 = /^If ([^,]+), instead add ([^.]+)\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "fixed" && !out.produces.n && !out.produces.count) {
      // Gemstone Caverns: "If ~ has a luck counter on it, instead add one mana of any color."
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      const produces = parseManaProduced(m2[2]!);
      if (!cond || !produces) return null;
      out.insteadIf = { cond, produces };
    }
    else if ((m2 = /^If ([^,]+), add (.+ mana of any one color) instead\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "oneOf" && !out.produces.n) {
      // Ilysian Caryatid: "Add one mana of any color. If you control a creature with power 4 or greater, add two mana of
      // any one color instead." Checked as it resolves.
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      const produces = parseManaProduced(m2[2]!);
      if (!cond || !produces) return null;
      out.insteadIf = { cond, produces };
    }
    else if (extra === "Activate only as an instant." && !out.instantOnly) out.instantOnly = true;
    // Foraging Wickermaw: "Add one mana of any color. ~ becomes that color until end of turn." The color of the mana it
    // added (CR 605.3b), its only color until end of turn (CR 105.3).
    else if (extra === "~ becomes that color until end of turn." && out.produces.kind === "oneOf" && out.produces.amount === 1 && !out.becomesManaColor && !out.produces.n) out.becomesManaColor = true;
    else if ((m2 = /^Activate only ([^.]+)\.$/.exec(extra)) && !out.activateIf && !out.oncePerTurn) {
      // "Activate only if you control a Swamp", "... only once each turn", "... only during an opponent's turn" (CR 602.5b).
      const clauses = parseOnlyClauses(m2[1]!);
      if (!clauses) return null;
      // "Activate only as a sorcery" (Grinning Ignus): still a mana ability (CR 605.1a, rulings), so it isn't used to pay.
      if (clauses.sorcery) out.sorceryOnly = true;
      if (clauses.once) out.oncePerTurn = true;
      if (clauses.cond) out.activateIf = clauses.cond;
    }
    else if ((m2 = /^This mana can't be spent to cast (?:an? )?non([a-z]+) spells?\.$/.exec(extra)) && !out.spendOnly) {
      // A Powerstone's "can't be spent to cast a nonartifact spell": on anything but those spells (CR 111.10h).
      const spells = spellFilter(m2[1]!);
      if (!spells || !spells.types?.length) return null;
      out.spendOnly = { spells, abilities: "any", other: true, text: extra };
    } else if ((m2 = /^When that mana is spent to cast a creature spell that shares a creature type with your commander, scry (\d+)\.$/.exec(extra)) && !out.spentTrigger) {
      const text = extra.replace(/^When that mana is spent to cast a creature spell that shares a creature type with your commander, /, "");
      out.spentTrigger = { sharesCommanderType: true, body: { targets: [], effects: [{ type: "scry", n: Number(m2[1]) }], text: text[0]!.toUpperCase() + text.slice(1) } };
    } else if ((m2 = /^When that mana is spent to cast an? (red )?instant or sorcery spell, copy that spell and you may choose new targets for the copy\.$/.exec(extra)) && !out.spentTrigger) {
      // Primal Wellspring, Pyromancer's Goggles: a triggered ability of its source (CR 603.1), the spell it paid for
      // copied as the trigger resolves (CR 707.10).
      out.spentTrigger = { instantOrSorcery: true, ...(m2[1] ? { color: "R" as const } : {}), body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "Copy that spell and you may choose new targets for the copy." } };
    } else if ((m2 = /^When you spend this mana to cast (your commander|an? (?:[^,]+? )?spell(?: with [^,]+)?), (.+)\.$/.exec(extra)) && !out.spentTrigger) {
      // A delayed triggered ability made by the mana ability, one for each mana it makes, that triggers when that mana is
      // spent (CR 106.6, 106.6a, 603.7a, rulings on Gilanra): "draw a card" (Gilanra), "scry 2" (Lapis Orb), "you gain 2 life" (Scaled
      // Nurturer), "scry X, where X is the number of times it's been cast from the command zone this game" (Study Hall).
      const commander = m2[1] === "your commander";
      const spell = commander ? undefined : parseTargetPhrase(m2[1]!.replace(/^an? /, ""));
      if (!commander && (spell?.kind !== "spell" || spell.controller || spell.chosen)) return null;
      const effect = m2[2]!.replace(/^./, (c) => c.toUpperCase());
      const studyX = commander && effect === "Scry X, where X is the number of times it's been cast from the command zone this game";
      // Jade Orb of Dragonkind: "it enters with an additional +1/+1 counter on it and gains hexproof until your next turn",
      // about the spell that mana paid for: one more counter for each such mana (rulings, CR 614.1c), and hexproof on
      // the permanent it becomes from when it enters (rulings, CR 400.7a).
      const jade = !commander && effect === "It enters with an additional +1/+1 counter on it and gains hexproof until your next turn";
      const body = studyX
        ? { targets: [], effects: [{ type: "scry" as const, n: { count: { kind: "castSpellCommanderCasts" as const } } }], text: `${effect}.` }
        : jade
          ? { targets: [], effects: [{ type: "spellEntersWith" as const, counter: "+1/+1", n: 1 }, { type: "spellGains" as const, mods: [{ kind: "addKeywords" as const, keywords: ["Hexproof"] }], until: "yourNextTurn" as const }], text: `${effect}.` }
          : parseBody(`${effect}.`, {});
      if (!body || body.targets.length || !body.effects.length || allEffects(body.effects).some((e) => "what" in e)) return null;
      out.spentTrigger = { ...(commander ? { commander: true as const } : { spell: spell! }), body };
    } else if ((/^Spend this mana only /.test(extra) || extra === "This mana can't be spent to pay generic mana costs.") && !out.spendOnly) {
      const only = parseManaSpend(extra);
      if (!only) return null;
      out.spendOnly = only;
    } else return null;
  }
  return out;
}

/**
 * A triggered mana ability about a permanent being tapped for mana (CR 605.1b, 106.12a): "Whenever enchanted land is
 * tapped for mana, its controller adds an additional one mana of any color." (Fertile Ground), "Whenever a player taps
 * a land for mana, that player adds one mana of any type that land produced." (Mana Flare), "Whenever you tap a Swamp
 * for mana, add an additional {B}." (Crypt Ghast). Null if the line isn't one; "fail" if it is one we can't run.
 */
export function parseManaTrigger(line: string): ManaTrigger | "fail" | null {
  let m: RegExpExecArray | null;
  let what: string;
  const out: Partial<ManaTrigger> = { text: line };
  let adds: string;
  let perOtherSameName = false;
  // Winter's Night: "... That land doesn't untap during its controller's next untap step.": the land tapped for mana, as
  // the triggered mana ability resolves (rulings: whoever controls it at that untap step).
  const noUntap = /^(Whenever a player taps an? .+? for mana, that player adds .+?\.) That land doesn't untap during its controller's next untap step\.$/.exec(line);
  if (noUntap) {
    out.landSkipsUntap = true;
    line = noUntap[1]!;
  }
  // Overabundance: "Whenever a player taps a land for mana, that player adds one mana of any type that land produced, and ~
  // deals 1 damage to the player.": the damage too, all one mana ability (rulings, CR 605.1b), dealt even when the land
  // made no mana (rulings). Barbflare Gremlin: "... if ~ is tapped, that player adds one mana of any type that land
  // produced. Then that land deals 1 damage to that player.": an intervening if (CR 603.4), checked as it triggers and
  // resolves, both at once here (CR 605.4a); the land is the damage's source.
  const selfDamage = /^(Whenever a player taps a land for mana, that player adds .+?), and ~ deals 1 damage to the player\.$/.exec(line);
  const landDamage = selfDamage ? null : /^(Whenever a player taps a land for mana, (?:if ~ is tapped, )?that player adds .+?\.) Then that land deals 1 damage to that player\.$/.exec(line);
  if (selfDamage) {
    out.damage = "self";
    out.evenWithoutMana = true;
    line = `${selfDamage[1]!}.`;
  } else if (landDamage) {
    out.damage = "land";
    line = landDamage[1]!;
  }
  const ifTapped = /^(Whenever a player taps an? .+? for mana), if ~ is tapped, (that player adds .+)$/.exec(line);
  if (ifTapped) {
    if (!out.damage) return "fail";
    out.ifSelfTapped = true;
    line = `${ifTapped[1]!}, ${ifTapped[2]!}`;
  }
  if ((m = /^Whenever (?:(enchanted|fortified) |an? )(.+?) is tapped for mana( of the chosen color)?, its controller adds (?:an additional )?(.+)\.$/.exec(line))) {
    if (m[1]) out.attached = true;
    what = m[2]!;
    if (m[3]) out.ofChosen = true;
    adds = m[4]!;
  } else if ((m = /^Whenever (a player taps|you tap) an? (.+?) for (mana|\{[WUBRGC]\})( while you're the monarch)?, (that player adds|add) (?:an additional )?(.+)\.$/.exec(line))) {
    if ((m[1] === "you tap") !== (m[5] === "add") || (m[4] && m[1] !== "you tap")) return "fail";
    // "While you're the monarch" (Regal Behemoth): only then does it trigger (CR 725).
    if (m[4]) out.whileMonarch = true;
    m = [m[0], m[1], m[2], m[3], m[5], m[6]] as unknown as RegExpExecArray;
    if (m[1] === "you tap") out.you = true;
    // "Whenever you tap a permanent for {C}" (Forsaken Monument): only when it made one or more {C}.
    if (m[3] !== "mana") out.madeType = m[3]![1] as ManaType;
    what = m[2]!;
    adds = m[5]!;
  } else if (/^Whenever a land you control is tapped for mana, add an additional one mana of any type that land produced for each other land you control with the same name as it\.$/.test(line)) {
    // Sasaya's Essence: lands its controller controls, who is the one tapping them for mana (CR 106.12a), with one more
    // mana of a type the land made for each other land they control with its name, counted as it resolves (rulings).
    out.you = true;
    what = "land";
    adds = "one mana of any type that land produced";
    perOtherSameName = true;
  } else if ((m = /^Whenever a land's ability causes you to add one or more mana of the chosen color, (add an additional one mana of that color)\.$/.exec(line))) {
    // Caged Sun: any ability of a land, {T} in its cost or not (rulings), and only for its controller.
    out.you = true;
    out.anyAbility = true;
    out.ofChosen = true;
    what = "land";
    adds = "one mana of that color";
  } else return null;
  // Extraplanar Lens: "a land with the same name as the exiled card", the card its imprint ability exiled (CR 607.2a).
  const named = / with the same name as the exiled card$/.exec(what);
  if (named) {
    if (out.attached) return "fail";
    out.sameNameAsLinked = true;
    what = what.slice(0, named.index);
  }
  const filter = parseTargetPhrase(what);
  if (filter?.kind !== "object" || filter.controller || filter.chosen || filter.tapped || filter.combat) return "fail";
  out.filter = { ...filter, text: what };
  if (/^(\{[WUBRGC]\})+$/.test(adds)) out.adds = { kind: "fixed", mana: [...adds.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType) };
  else if ((m = /^((?:\{[WUBRGC]\})+) for each (.+)$/.exec(adds))) {
    const times = parseCount(m[2]!, null, true);
    if (!times) return "fail";
    out.adds = { kind: "fixed", mana: [...m[1]!.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType), times };
  } else if (adds === "one mana of any color") out.adds = { kind: "anyColor", n: 1 };
  else if (adds === "two mana in any combination of colors") out.adds = { kind: "anyColor", n: 2 };
  else if (adds === "one mana of the chosen color" || (adds === "one mana of that color" && out.ofChosen)) out.adds = { kind: "chosenColor" };
  // Keeper of Progenitus: "Whenever a player taps a Mountain, Forest, or Plains for mana, that player adds one mana of any
  // type that land produced": a land with one of those types.
  else if ((m = /^one mana of any type that (.+) produced$/.exec(adds)) && (what.endsWith(m[1]!) || (named && m[1] === "land" && what === "land") || (m[1] === "land" && !!filter.subtypes?.length && filter.subtypes.every((t) => ["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(t)) && !filter.types?.length))) out.adds = { kind: "produced", ...(perOtherSameName ? { perOtherSameName: true as const } : {}) };
  else return "fail";
  return out as ManaTrigger;
}

/** "Remove three spore counters from ~", "Remove a +1/+1 counter from ~" as part of a cost. */
export function removeCounterCost(part: string): { counter: CounterKind; n: number } | null {
  const m = new RegExp(`^Remove ${NUM} ${COUNTER} counters? from ~$`).exec(part);
  return m ? { counter: counterKind(m[2]!), n: num(m[1]!) } : null;
}

/**
 * What a storage land adds for the counters removed (ManaProduce "removeX"): "{B} for each storage counter removed this
 * way" after "Remove any number of", "X mana in any combination of {U} and/or {B}" after "Remove X". Null for the rest
 * ("X mana in any combination of colors": each multiset of colors, ManaProduce "removeX" `mix`).
 */
function removedProduced(text: string, counter: CounterKind, any: boolean, oneOrMore = false): ManaProduce | null {
  // Rasputin, the Oneiromancer: "Remove one or more dream counters from ~: Add that much {C}": one {C} per counter.
  const thatMuch = /^that much \{([WUBRGC])\}$/.exec(text);
  if (oneOrMore) return thatMuch ? { kind: "removeX", counter, colors: [thatMuch[1] as ManaType], min: 1 } : null;
  // Kyren Toy: "Remove X charge counters from ~: Add an amount of {C} equal to X plus one": X chosen as it's activated,
  // 0 too (CR 107.3a), and one more {C} than that.
  const plusOneX = /^an amount of \{([WUBRGC])\} equal to X plus one$/.exec(text);
  if (!any && plusOneX) return { kind: "removeX", counter, colors: [plusOneX[1] as ManaType], min: 0, base: 1 };
  // Petalmane Baku, Haruspex: "Remove X ki counters from ~: Add X mana of any one color": X of one color chosen as it
  // resolves (CR 106.1b, 605.3b); none removed adds nothing, so X is at least 1 here.
  if (!any && text === "X mana of any one color") return { kind: "removeX", counter, colors: ["W", "U", "B", "R", "G"], min: 1, oneColor: true };
  const each = new RegExp(`^\\{([WUBRGC])\\} for each ${COUNTER} counter removed this way$`).exec(text);
  if (any && each && counterKind(each[2]!) === counter) return { kind: "removeX", counter, colors: [each[1] as ManaType], min: 0 };
  // The Mana Batteries: "{G}, then add an additional {G} for each charge counter removed this way": one more than removed.
  const plusOne = new RegExp(`^\\{([WUBRGC])\\}, then add an additional \\{([WUBRGC])\\} for each ${COUNTER} counter removed this way$`).exec(text);
  if (any && plusOne && plusOne[1] === plusOne[2] && counterKind(plusOne[3]!) === counter) return { kind: "removeX", counter, colors: [plusOne[1] as ManaType], min: 0, base: 1 };
  const combo = /^X mana in any combination of \{([WUBRG])\} and\/or \{([WUBRG])\}$/.exec(text);
  if (!any && combo && combo[1] !== combo[2]) return { kind: "removeX", counter, colors: [combo[1] as ManaType, combo[2] as ManaType], min: 1 };
  // Crucible of the Spirit Dragon: "Remove X storage counters from ~: Add X mana in any combination of colors": X chosen
  // as it's activated (CR 107.3a, 602.2b), then each multiset of X colors (CR 106.1b, 605.3b), as an "anyColors" ability
  // makes them; none removed adds nothing, so X is at least 1 here.
  if (!any && text === "X mana in any combination of colors") return { kind: "removeX", counter, colors: ["W", "U", "B", "R", "G"], min: 1, mix: true };
  return null;
}

function parseManaProduced(text: string): ManaProduce | null {
  const sym = (x: string) => /^\{([WUBRGC])\}$/.exec(x)?.[1] as ManaType | undefined;
  if (/^(\{[WUBRGC]\})+$/.test(text)) return { kind: "fixed", mana: [...text.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType) };
  // "{W} or {U}", "{R}, {G}, or {W}"
  const parts = text.split(/, or |, | or /);
  if (parts.length > 1 && parts.every((x) => sym(x))) return { kind: "oneOf", options: parts.map((x) => sym(x)!), amount: 1 };
  // "{W}{W}, {W}{U}, or {U}{U}": one of these combinations (filter lands).
  if (parts.length > 1 && parts.every((x) => /^(\{[WUBRGC]\})+$/.test(x))) return { kind: "combos", options: parts.map((x) => [...x.matchAll(/\{([WUBRGC])\}/g)].map((y) => y[1] as ManaType)) };
  // "Add six {G}" (Castle Garenbrig): the symbol that many times.
  const many = new RegExp(`^${NUM} (\\{[WUBRGC]\\})$`).exec(text);
  if (many && num(many[1]!) > 1) return { kind: "fixed", mana: Array<ManaType>(num(many[1]!)).fill(sym(many[2]!)!) };
  const any = new RegExp(`^${NUM} mana of any (?:one )?color$`).exec(text);
  if (any) return { kind: "oneOf", options: ALL_COLORS, amount: num(any[1]!) };
  if (text === "one mana of any color in your commander's color identity") return { kind: "commanderIdentity" };
  if (text === "one mana of ~'s last noted type") return { kind: "noted" };
  const could = /^one mana of any (color|type) that a (land|Gate|basic land) (you control|an opponent controls) could produce$/.exec(text);
  if (could) return { kind: "landsCouldProduce", whose: could[3] === "you control" ? "you" : "opponent", ...(could[1] === "type" ? { anyType: true } : {}), ...(could[2] === "Gate" ? { subtype: "Gate" } : {}), ...(could[2] === "basic land" ? { basic: true as const } : {}) };
  // "one mana of the chosen color", "{B} or one mana of the chosen color" (chosen as it entered).
  const chosen = /^(?:(\{[WUBRGC]\}) or )?one mana of the chosen color$/.exec(text);
  if (chosen) return { kind: "chosenColor", ...(chosen[1] ? { also: sym(chosen[1])! } : {}) };
  // "Four mana of the chosen color" (Throne of Eldraine).
  const chosenN = new RegExp(`^${NUM} mana of the chosen color$`).exec(text);
  if (chosenN && num(chosenN[1]!) > 1) return { kind: "chosenColor", n: num(chosenN[1]!) };
  // "an amount of {G} equal to ~'s power", "X mana of any one color, where X is the number of Elves on the battlefield".
  // A static count: "~" is the permanent, "you" its controller.
  const amount = /^an amount of (\{[WUBRGC]\}) equal to (.+)$/.exec(text);
  if (amount) {
    const n = parseCount(amount[2]!, null);
    return n && { kind: "fixed", mana: [sym(amount[1]!)!], n };
  }
  // "Two mana of different colors" (Interplanar Beacon, Lotus Field's artifacts): one of the ten pairs of two colors,
  // chosen as it resolves (CR 605.3b), like a filter land's combinations.
  if (text === "two mana of different colors")
    return { kind: "combos", options: ALL_COLORS.flatMap((a, i) => ALL_COLORS.slice(i + 1).map((b) => [a, b] as ManaType[])) };
  // "Two mana in any combination of colors", "X mana in any combination of colors, where X is ..." (Selvala).
  const combo = new RegExp(`^(?:${NUM}|(X)) mana in any combination of colors(?:, where X is (.+))?$`).exec(text);
  if (combo && !!combo[2] === !!combo[3]) {
    if (!combo[2]) return num(combo[1]!) > 1 ? { kind: "anyColors", n: num(combo[1]!) } : null;
    const n = parseCount(combo[3]!, null);
    return n && { kind: "anyColors", n };
  }
  // "Two mana in any combination of {U}, {B}, and/or {R}" (Relic of Sauron): only those colors.
  const some = new RegExp(`^${NUM} mana in any combination of ((?:\\{[WUBRG]\\}, )*\\{[WUBRG]\\},? and/or \\{[WUBRG]\\})$`).exec(text);
  if (some && num(some[1]!) > 1) {
    const colors = [...some[2]!.matchAll(/\{([WUBRG])\}/g)].map((x) => x[1] as Color);
    return new Set(colors).size === colors.length ? { kind: "anyColors", n: num(some[1]!), colors } : null;
  }
  // "X mana in any combination of {U} and/or {R}, where X is ~'s power" (Vivi Ornitier).
  const two = /^X mana in any combination of \{([WUBRG])\} and\/or \{([WUBRG])\}, where X is (.+)$/.exec(text);
  if (two && two[1] !== two[2]) {
    const n = parseCount(two[3]!, null);
    return n && { kind: "anyColors", n, colors: [two[1] as Color, two[2] as Color] };
  }
  const xAny = /^X mana of any one color, where X is (.+)$/.exec(text);
  if (xAny) {
    const n = /^each different /.test(xAny[1]!) ? parseCount(xAny[1]!.slice(5), null, true) : parseCount(xAny[1]!, null);
    return n && { kind: "oneOf", options: ALL_COLORS, amount: 1, n };
  }
  // "Add X {G} or X {W}, where X is the number of other creatures you control" (Brigid, Doun's Mind): X mana, all of the
  // one color chosen (CR 605.3b, like "X mana of any one color").
  const xEither = /^X \{([WUBRGC])\} or X \{([WUBRGC])\}, where X is (.+)$/.exec(text);
  if (xEither && xEither[1] !== xEither[2]) {
    const n = parseCount(xEither[3]!, null);
    return n && { kind: "oneOf", options: [xEither[1] as ManaType, xEither[2] as ManaType], amount: 1, n };
  }
  // "One mana of any color among legendary creatures and planeswalkers you control" (Mox Amber), "... among legendary
  // permanents you control" (Plaza of Heroes); "one mana of any of the exiled card's colors" (Chrome Mox: the card its
  // imprint ability exiled, linked in compile.ts); "... of the exiled cards' colors" (Pit of Offerings: the cards its
  // enters ability exiled from graveyards).
  if (text === "one mana of any of the exiled card's colors" || text === "one mana of any of the exiled cards' colors") return { kind: "colorsAmong", linked: true };
  // "One mana of any of this creature's colors" (given by Katilda, Dawnhart Prime): its own colors as it's activated.
  if (text === "one mana of any of ~'s colors") return { kind: "colorsAmong", self: true };
  const among = /^one mana of any color among (legendary )?(.+?) you control$/.exec(text);
  if (among) {
    const words = among[2]!.split(/ and | or /).map((w) => singular(w));
    const spec = parseTargetPhrase(`${words.join(" or ")} you control`);
    if (spec?.kind !== "object" || spec.supertypes || spec.chosen) return null;
    return { kind: "colorsAmong", filter: { ...spec, ...(among[1] ? { supertypes: ["Legendary"] } : {}), text: `${among[1] ?? ""}${among[2]} you control` } };
  }
  // "One mana of any color among legendary creature cards in your graveyard" (The Grey Havens).
  const yard = /^one mana of any color among (?:(.+?) )?cards in your graveyard$/.exec(text);
  if (yard) {
    if (!yard[1]) return { kind: "colorsAmong", filter: { kind: "card", text: "cards in your graveyard" }, inYard: true };
    const spec = parseTargetPhrase(`${yard[1]} card from a graveyard`);
    if (spec?.kind !== "card" || spec.chosen) return null;
    return { kind: "colorsAmong", filter: { ...spec, text: `${yard[1]} cards in your graveyard` }, inYard: true };
  }
  if (text === "one mana of each color among permanents you control") return { kind: "eachColorAmong" };
  if (text === "one mana of each color among the exiled cards used to craft ~") return { kind: "eachColorAmong", linked: true };
  // Tarnation Vista: "For each color among monocolored permanents you control": only permanents with exactly one color.
  if (text === "one mana of each color among monocolored permanents you control") return { kind: "eachColorAmong", monocolored: true };
  if (text === "an amount of mana of the chosen color equal to your devotion to that color") return { kind: "devotion" };
  if (text === "as much again of each type of unspent mana you have") return { kind: "doublePool" };
  const each = /^(\{[WUBRGC]\}) for each (.+) you control$/.exec(text);
  // Powerstone Shard: "{C} for each artifact you control named ~": with this card's name, bound in compile (CR 201.5).
  const named = /^(\{[WUBRGC]\}) for each (.+) you control named ~$/.exec(text);
  if (named) {
    const spec = parseTargetPhrase(named[2]!);
    if (spec?.kind !== "object" || spec.named !== undefined) return null;
    return { kind: "fixed", mana: [sym(named[1]!)!], count: { ...spec, controller: "you", named: "~", text: `${named[2]} you control named ~` } };
  }
  if (each) {
    const spec = parseTargetPhrase(each[2]!);
    if (spec?.kind !== "object") return null;
    return { kind: "fixed", mana: [sym(each[1]!)!], count: { ...spec, controller: "you", text: `${each[2]} you control` } };
  }
  return null;
}

/**
 * "Spend this mana only to cast a creature spell.", "... to cast instant and sorcery spells.", "... to activate
 * abilities.", "... to cast artifact spells or activate abilities of artifacts." (CR 106.6). Null for anything else
 * ("of the chosen type", "and that spell can't be countered", "... source").
 */
export function parseManaSpend(sentence: string): ManaSpend | null {
  if (sentence === "Spend this mana only on costs that contain {X}.") return { xCosts: true, text: sentence };
  // Smoky Lounge: "Spend this mana only to cast Room spells and unlock doors": a Room spell (an enchantment subtype, CR
  // 205.3h), or unlocking a door (a special action, CR 709.5e).
  if (sentence === "Spend this mana only to cast Room spells and unlock doors.") return { spells: { kind: "spell", subtypes: ["Room"], text: "Room spells" }, unlockDoors: true, text: sentence };
  // Tin Street Gossip: "Spend this mana only to cast face-down spells or to turn creatures face up": a spell cast face down
  // (CR 708.4), and the special action of turning a face-down permanent face up by any of its ways (CR 116.2b, 702.37e,
  // 702.168d, 701.40b, 701.58b).
  if (sentence === "Spend this mana only to cast face-down spells or to turn creatures face up.") return { faceDownSpells: true, faceUp: ["morph", "megamorph", "disguise", "manifest", "cloak"], text: sentence };
  // Qarsi Deceiver: "... to cast a face-down creature spell, pay a mana cost to turn a manifested creature face up, or pay a
  // morph cost": a face-down spell is a 2/2 creature spell (CR 708.2a); a megamorph cost is a morph cost (CR 702.37b); not a
  // disguise cost, nor a cloaked permanent's mana cost (a cloaked permanent isn't a manifested one, CR 701.58a).
  if (sentence === "Spend this mana only to cast a face-down creature spell, pay a mana cost to turn a manifested creature face up, or pay a morph cost.") return { faceDownSpells: true, faceUp: ["morph", "megamorph", "manifest"], text: sentence };
  // Adarkar Unicorn: "Spend this mana only to pay cumulative upkeep costs" (CR 702.24a).
  if (sentence === "Spend this mana only to pay cumulative upkeep costs.") return { cumulativeUpkeep: true, text: sentence };
  // Quinjet Technician: "Spend this mana only to activate power-up abilities" (CR 702.193).
  if (sentence === "Spend this mana only to activate power-up abilities.") return { powerUpAbilities: true, text: sentence };
  // Niko Defies Destiny: "to foretell cards" (the special action's {2}, CR 702.143a, 116.2h) "or cast spells that have
  // foretell", from anywhere (rulings).
  if (sentence === "Spend this mana only to foretell cards or cast spells that have foretell.") return { foretell: true, text: sentence };
  // Karfell Harbinger: "Spend this mana only to foretell a card from your hand or cast an instant or sorcery spell": the
  // foretell special action's cost (CR 702.143a, 116.2h), or an instant or sorcery spell however it's cast; not a foretold
  // creature spell.
  if (sentence === "Spend this mana only to foretell a card from your hand or cast an instant or sorcery spell.") return { foretellAction: true, spells: spellFilter("instant or sorcery")!, text: sentence };
  // Throne of Makindi: "Spend this mana only to cast kicked spells" (CR 702.33d).
  if (sentence === "Spend this mana only to cast kicked spells.") return { kickedSpells: true, text: sentence };
  // Volshe Tideturner: "only to cast an instant or sorcery spell or a kicked spell": either kind of spell.
  if (sentence === "Spend this mana only to cast an instant or sorcery spell or a kicked spell.") return { kickedSpells: true, spells: spellFilter("instant or sorcery")!, text: sentence };
  // The Ringhart Crest: "Spend this mana only to cast a creature spell of the chosen type or a legendary creature spell": a
  // creature spell with the creature type chosen as it entered (bound by boundSpend), or any legendary creature spell, also
  // with no type chosen (rulings) (CR 106.6).
  if (sentence === "Spend this mana only to cast a creature spell of the chosen type or a legendary creature spell.")
    return { text: sentence, spells: { kind: "spell", types: ["Creature"], anyOf: [{ kind: "spell", types: ["Creature"], chosen: "type", text: "creature spell of the chosen type" }, { kind: "spell", types: ["Creature"], supertypes: ["Legendary"], text: "legendary creature spell" }], text: "creature spells of the chosen type or legendary creature spells" } };
  // Chandra's Embercat: "only to cast an Elemental spell or a Chandra planeswalker spell": a spell with that creature type
  // (a kindred spell too), or a planeswalker spell with that planeswalker type (CR 205.3j).
  const orWalker = /^Spend this mana only to cast an? ([A-Z][a-z]+) spell or an? ([A-Z][a-z]+) planeswalker spell\.$/.exec(sentence);
  if (orWalker && CREATURE_TYPES.has(orWalker[1]!))
    return { text: sentence, spells: { kind: "spell", anyOf: [{ kind: "spell", subtypes: [orWalker[1]!], text: `${orWalker[1]} spell` }, { kind: "spell", types: ["Planeswalker"], subtypes: [orWalker[2]!], text: `${orWalker[2]} planeswalker spell` }], text: `${orWalker[1]} spells or ${orWalker[2]} planeswalker spells` } };
  // Unblinking Observer: "only to pay a disturb cost or cast an instant or sorcery spell": a spell cast for its disturb cost
  // (CR 702.146a), or an instant or sorcery spell.
  if (sentence === "Spend this mana only to pay a disturb cost or cast an instant or sorcery spell.") return { disturb: true, spells: spellFilter("instant or sorcery")!, text: sentence };
  // Jegantha, the Wellspring: on any cost, but never on generic mana (rulings: a hybrid {2/W} only as its {W}).
  if (sentence === "This mana can't be spent to pay generic mana costs.") return { spells: { kind: "spell", text: "spells" }, abilities: "any", other: true, notGeneric: true, text: sentence };
  // Thran Turbine: "This mana can't be spent to cast spells": on abilities and other costs only (CR 106.6).
  if (sentence === "This mana can't be spent to cast spells.") return { abilities: "any", other: true, text: sentence };
  // Thieving Varmint: "Spend this mana only to cast spells you don't own" (CR 106.6, 108.3): the spell's owner, not its caster.
  if (sentence === "Spend this mana only to cast spells you don't own.") return { spells: { kind: "spell", text: "spells you don't own" }, notOwnSpells: true, text: sentence };
  // Brotherhood Headquarters: "only to cast an Assassin spell or a spell that has freerunning, or to activate an ability of
  // an Assassin source": a spell with that creature type or with freerunning (CR 702.173), or an ability of a permanent or
  // card anywhere with that creature type.
  if (sentence === "Spend this mana only to cast an Assassin spell or a spell that has freerunning, or to activate an ability of an Assassin source.")
    return { spells: { kind: "spell", anyOf: [{ kind: "spell", subtypes: ["Assassin"], text: "Assassin spell" }, { kind: "spell", keywords: ["Freerunning"], text: "spell that has freerunning" }], text: "Assassin spells or spells that have freerunning" }, abilities: { kind: "object", subtypes: ["Assassin"], text: "Assassin source" }, anyZone: true, text: sentence };
  // Altar of the Lost: "Spend this mana only to cast spells with flashback from a graveyard" (CR 106.6, 702.34a).
  if (sentence === "Spend this mana only to cast spells with flashback from a graveyard.") return { spells: { kind: "spell", text: "spells with flashback from a graveyard" }, flashbackFromGraveyard: true, text: sentence };
  // Interdimensional Web Watch: "Spend this mana only to cast spells from exile" (CR 106.6): any spell cast from exile.
  if (sentence === "Spend this mana only to cast spells from exile.") return { spells: { kind: "spell", text: "spells from exile" }, fromExile: true, text: sentence };
  // Mm'menon, the Right Hand: "Spend this mana only to cast a spell from anywhere other than your hand" (CR 106.6): a spell
  // cast from any zone but a hand (the library, a graveyard, exile, the command zone), on none of an ability's costs.
  if (sentence === "Spend this mana only to cast a spell from anywhere other than your hand.") return { spells: { kind: "spell", text: "spells from anywhere other than your hand" }, notFromHand: true, text: sentence };
  // Lord of the Forsaken, Rootcoil Creeper: "Spend this mana only to cast a spell from your graveyard" (CR 106.6): a spell
  // cast from its caster's own graveyard (CR 404.1), by any permission.
  if (/^Spend this mana only to cast (?:a spell|spells) from your graveyard\.$/.test(sentence)) return { spells: { kind: "spell", text: "spells from your graveyard" }, fromOwnGraveyard: true, text: sentence };
  // Overgrown Zealot: "Spend this mana only to turn permanents face up": the special action of turning a face-down
  // permanent face up by any of its ways (CR 116.2b; rulings: morph or disguise costs, a manifested or cloaked permanent's
  // costs). Creeping Peeper: "... to cast an enchantment spell, unlock a door, or turn a permanent face up" (CR 709.5e too).
  if (sentence === "Spend this mana only to turn permanents face up.") return { faceUp: ["morph", "megamorph", "disguise", "manifest", "cloak"], text: sentence };
  if (sentence === "Spend this mana only to cast an enchantment spell, unlock a door, or turn a permanent face up.") return { spells: { kind: "spell", types: ["Enchantment"], text: "enchantment spells" }, unlockDoors: true, faceUp: ["morph", "megamorph", "disguise", "manifest", "cloak"], text: sentence };
  // Karolina Dean, Runaway: "This mana can't be spent to cast spells from your hand": on anything else (CR 106.6).
  if (sentence === "This mana can't be spent to cast spells from your hand.") return { spells: { kind: "spell", text: "spells" }, notFromHand: true, abilities: "any", other: true, text: sentence };
  // "This mana can't be spent to cast nonartifact spells" (Karn, Legacy Reforged): on anything but those spells (CR 106.6).
  const cant = /^This mana can't be spent to cast (?:an? )?non([a-z]+) spells?\.$/.exec(sentence);
  if (cant) {
    const spells = spellFilter(cant[1]!);
    return spells?.types?.length ? { spells, abilities: "any", other: true, text: sentence } : null;
  }
  // "Spend this mana only to cast monocolored spells of that color" (Throne of Eldraine): of the color chosen for its source.
  if (sentence === "Spend this mana only to cast monocolored spells of that color.") return { text: sentence, spells: { kind: "spell", colorCount: "monocolored", chosen: "color", text: "monocolored spells of the chosen color" } };
  // Troyan, Gutsy Explorer: "Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their
  // mana costs" (Helga: "creature spells ..."). A spell with {X} qualifies whatever its mana value.
  const mvOrX = /^Spend this mana only to cast (?:(creature) )?spells with mana value (\d+) or greater or (?:(creature) )?spells with \{X\} in their mana costs\.$/.exec(sentence);
  if (mvOrX) {
    if (mvOrX[1] !== mvOrX[3]) return null;
    const what = mvOrX[1] ? "creature spells" : "spells";
    return { text: sentence, spells: { kind: "spell", ...(mvOrX[1] ? { types: ["Creature"] } : {}), anyOf: [{ kind: "spell", manaValue: { min: Number(mvOrX[2]) }, text: `mana value ${mvOrX[2]} or greater` }, { kind: "spell", xInCost: true, text: "with {X} in its mana cost" }], text: `${what} with mana value ${mvOrX[2]} or greater or with {X} in their mana costs` } };
  }
  // Titans' Nest: "Spend this mana only to cast a spell that's one or more colors without {X} in its mana cost" (CR
  // 105.2c, 107.3; rulings: an {X} in an additional or alternative cost doesn't stop it).
  if (sentence === "Spend this mana only to cast a spell that's one or more colors without {X} in its mana cost.") return { text: sentence, spells: { kind: "spell", colorCount: "colored", noXInCost: true, text: "spells that are one or more colors without {X} in their mana costs" } };
  // "Only to cast a Dragon spell or an Omen spell" (Maelstrom of the Spirit Dragon): a spell with either subtype (an Omen
  // half is "Sorcery — Omen", CR 205.3k).
  const m = /^Spend this mana only to (.+?)(, and that spell can't be countered)?\.$/.exec(sentence.replace(/^Spend this mana only to cast an? (\w+) spell or an? (\w+) spell\.$/, "Spend this mana only to cast $1 or $2 spells."));
  if (!m) return null;
  const only: ManaSpend = { text: sentence, ...(m[2] ? { uncounterable: true as const } : {}) };
  // "Only to cast an instant or sorcery spell or to gain a Class level" (Sorcerer Class): a Class's level ability too.
  const level = /^(.+) or to gain a Class level$/.exec(m[1]!);
  if (level) only.classLevel = true;
  // "Of the chosen type" (Unclaimed Territory): the type its source's controller chose for it (see spend.ts boundSpend).
  // Woodland Weavemaster: "to cast Elf spells and activate abilities of Elf sources": either, as with "or" (CR 106.6).
  for (const part of (level ? level[1]! : m[1]!).split(/,? or (?:to )?(?=activate |cast )|(?<=^cast [^,]+ spells) and (?=activate abilities of )/)) {
    let x: RegExpExecArray | null;
    // "Cast a spell of the chosen type" (Eclipsed Realms): any spell with that creature type (CR 205.3m).
    if (/^cast (?:a spell|spells) of the chosen type$/.test(part) && !only.spells) only.spells = { kind: "spell", chosen: "type", text: "spells of the chosen type" };
    // Corrupted Crossroads: "cast a spell with devoid": that keyword on the spell (rulings: not just any colorless spell).
    else if ((x = /^cast (?:a spell|spells) with (devoid)$/.exec(part)) && !only.spells) only.spells = { kind: "spell", keywords: [keywordOf(x[1]!)!], text: `spells with ${x[1]}` };
    else if ((x = /^cast (?:an? )?(.+? spells? of the chosen type|.+?) spells?$/.exec(part) ?? /^cast (?:an? )?(.+? spells? of the chosen type)$/.exec(part)) && !only.spells) {
      const spec = spellFilter(x[1]!);
      if (!spec) return null;
      only.spells = spec;
    } else if (part === "cast spells" && !only.spells) only.spells = { kind: "spell", text: "spells" };
    else if ((part === "activate abilities" || part === "activate an ability") && !only.abilities) only.abilities = "any";
    // "Activate an equip ability" (Freya Crescent), "activate equip abilities" (Ronin, Shadow Stalker): CR 702.6a.
    else if ((part === "activate an equip ability" || part === "activate equip abilities") && !only.equipAbilities) only.equipAbilities = true;
    // "Activate an ability of a source of the chosen type" (Eclipsed Realms): a permanent or a card anywhere with that
    // creature type (rulings).
    else if (part === "activate an ability of a source of the chosen type" && !only.abilities) {
      only.abilities = { kind: "object", chosen: "type", text: "source of the chosen type" };
      only.anyZone = true;
    }
    else if ((x = /^activate (?:abilities of|an ability of an?) (.+?)( sources?)?( of the chosen type)?$/.exec(part)) && !only.abilities) {
      const words = x[1]!.split(" ");
      const spec = parseTargetPhrase([...words.slice(0, -1), singular(words[words.length - 1]!)].join(" "));
      if (spec?.kind !== "object" || spec.controller || spec.chosen || spec.counter || spec.tapped || spec.combat || spec.token) return null;
      only.abilities = { ...spec, ...(x[3] ? { chosen: "type" as const } : {}), text: `${x[1]!}${x[2] ?? ""}${x[3] ?? ""}` };
      // "Abilities of artifacts" are of artifact permanents (CR 109.2); an "artifact source" can be anywhere.
      if (x[2]) only.anyZone = true;
    } else return null;
  }
  // "That spell" is a spell this mana is spent on.
  if (only.uncounterable && (!only.spells || only.abilities)) return null;
  return only;
}

/** "creature", "instant and sorcery", "noncreature", "Dragon": a filter on the spell's characteristics. */
function spellFilter(words0: string): TargetSpec | null {
  if (words0 === "legendary") return { kind: "spell", supertypes: ["Legendary"], text: "legendary spells" };
  // Séance Board: "instant, sorcery, Demon, and Spirit spells": a spell of one of those card types or creature types.
  const mixed = words0.split(/, (?:and |or )?| and | or /);
  if (mixed.length > 1 && mixed.every((w) => ["instant", "sorcery", "creature", "artifact", "enchantment", "planeswalker"].includes(w) || CREATURE_TYPES.has(w)) && mixed.some((w) => CREATURE_TYPES.has(w)) && mixed.some((w) => !CREATURE_TYPES.has(w)))
    return { kind: "spell", types: mixed.filter((w) => !CREATURE_TYPES.has(w)).map((w) => w.charAt(0).toUpperCase() + w.slice(1)), orSubtypes: mixed.filter((w) => CREATURE_TYPES.has(w)), text: `${words0} spells` };
  // "A creature spell of the chosen type" (Unclaimed Territory).
  const chosen = / spells? of the chosen type$/.test(words0);
  const words = words0.replace(/ spells? of the chosen type$/, "");
  const spec = parseTargetPhrase(`${words.replace(/ and(?:\/or)? /g, " or ")} spell`);
  if (spec?.kind !== "spell" || spec.chosen || spec.counter || spec.controller) return null;
  return { ...spec, ...(chosen ? { chosen: "type" as const } : {}), text: chosen ? words0 : `${words0} spells` };
}
