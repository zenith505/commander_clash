import type { Amount, AmountExpr, Affects, Modification, StaticAbility, StaticCondition, CostMod, EntersChoice, EntersCondition, TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { NUM, num, COUNTER, counterKind, X, PT, ptAmt, COLOR_WORDS, BASIC_TYPES, capital, singular } from "./words";
import { replaceX, usesX, scaleAmount } from "./body";
import { parseCount } from "./counts";
import { pickFilter, parseGroup, parseTargetPhrase } from "./targets";
import { parseGrants } from "./grants";

/** What "~ enters tapped unless ..." waits for (CR 614.1d). */
export function parseEntersCondition(text: string): EntersCondition | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^you control ${NUM} or (fewer|more) other lands$`).exec(text)))
    return { kind: "control", who: "you", types: ["Land"], other: true, ...(m[2] === "fewer" ? { max: num(m[1]!) } : { min: num(m[1]!) }) };
  if ((m = new RegExp(`^you control ${NUM} or more basic lands$`).exec(text))) return { kind: "control", who: "you", types: ["Land"], supertypes: ["Basic"], min: num(m[1]!) };
  if (/^you control a basic land$/.test(text)) return { kind: "control", who: "you", types: ["Land"], supertypes: ["Basic"], min: 1 };
  if (/^you control a planeswalker$/.test(text)) return { kind: "control", who: "you", types: ["Planeswalker"], min: 1 };
  if (/^you control a legendary creature$/.test(text)) return { kind: "control", who: "you", types: ["Creature"], supertypes: ["Legendary"], min: 1 };
  if ((m = /^you control an? (\w+)(?: or an? (\w+))?$/.exec(text)) && [m[1], m[2]].every((x) => x === undefined || BASIC_TYPES.includes(x)))
    return { kind: "control", who: "you", subtypes: [m[1]!, ...(m[2] ? [m[2]] : [])], min: 1 };
  if ((m = new RegExp(`^your opponents control ${NUM} or more lands$`).exec(text))) return { kind: "control", who: "opponents", types: ["Land"], min: num(m[1]!) };
  if ((m = /^a player has (\d+) or less life$/.exec(text))) return { kind: "playerLifeAtMost", n: Number(m[1]) };
  if ((m = new RegExp(`^you have ${NUM} or more opponents$`).exec(text))) return { kind: "opponents", min: num(m[1]!) };
  return null;
}

/** "As ~ enters, you may pay 2 life. If you don't, it enters tapped." and the reveal-a-card lands (CR 614.12). */
export function parseEntersChoice(line: string): EntersChoice | null {
  let m: RegExpExecArray | null;
  if ((m = /^As ~ enters(?: the battlefield)?, you may pay (\d+) life\. If you don't, (?:it|~) enters(?: the battlefield)? tapped\.$/.exec(line))) return { kind: "payLife", n: Number(m[1]) };
  if ((m = /^As ~ enters(?: the battlefield)?, you may reveal an? (.+?) card from your hand\. If you don't, (?:it|~) enters(?: the battlefield)? tapped\.$/.exec(line))) {
    const subtypes = m[1]!.split(/ or /);
    if (!subtypes.every((x) => BASIC_TYPES.includes(x) || CREATURE_TYPES.has(x))) return null;
    return { kind: "reveal", filter: { kind: "card", subtypes, text: `${m[1]} card` } };
  }
  return null;
}

/**
 * A static ability that applies only "as long as" something is true: threshold's "~ gets +1/+1 as long
 * as there are seven or more cards in your graveyard", "As long as you control three or more artifacts,
 * ~ has flying", Kird Ape's "~ gets +1/+2 as long as you control a Forest", "~ has first strike as long
 * as it's attacking". An ability word in front ("Metalcraft —", "Descend 4 —") has no rules meaning
 * (CR 207.2c); the condition is spelled out after it.
 */
export function parseConditionalStatic(line: string): StaticAbility | null {
  const text = line.replace(/^[A-Z][A-Za-z' -]+(?: \d+)? — /, "").replace(/\.$/, "");
  let statement: string | undefined;
  let cond: string | undefined;
  let m: RegExpExecArray | null;
  // Soulbond (CR 702.95b): "As long as ~ is paired with another creature, each of those creatures gets +2/+2",
  // "... both creatures have lifelink": the pair, while it lasts.
  if ((m = /^As long as ~ is paired with another creature, (?:each of those creatures|both creatures) (.+)$/.exec(text))) {
    const mods = parseStaticMods(m[1]!);
    return mods ? { affects: { kind: "paired" }, mods, text: line } : null;
  }
  // "As long as equipped creature is a Human, it gets an additional +1/+1": a second bonus, only for a Human.
  if ((m = /^As long as (enchanted|equipped) creature is an? ([A-Z][a-z]+), it (gets|has) (.+)$/.exec(text)) && CREATURE_TYPES.has(m[2]!)) {
    const st = parseStatic(`${capital(m[1]!)} creature ${m[3]} ${m[4]!.replace(/^an additional /, "")}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], subtypes: [m[2]!], text: `${m[2]} creature` } } };
  }
  // Aerial Modification: "As long as enchanted permanent is a Vehicle, it's a creature in addition to its other types."
  // A type-changing effect (layer 4) whose condition looks at the permanent as the earlier effects in that layer left it.
  if ((m = /^As long as (?:enchanted|equipped) permanent is an? (Vehicle), it's a creature in addition to its other types$/.exec(text)))
    return { affects: { kind: "attached" }, mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [] }], text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [m[1]!], text: m[1]! } } };
  if ((m = /^(.+?) as long as (.+)$/.exec(text))) [statement, cond] = [m[1], m[2]];
  else if ((m = /^As long as ([^,]+), (.+)$/.exec(text))) [cond, statement] = [m[1], m[2]];
  else if ((m = /^During your turn, (.+)$/.exec(text))) [cond, statement] = ["it's your turn", m[1]];
  // Wayward Swordtooth: "~ can't attack or block unless you have the city's blessing".
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless you have the city's blessing$/.exec(text))) [statement, cond] = [m[1], "you don't have the city's blessing"];
  // Flowering Lumberknot: "~ can't attack or block unless it's paired with a creature with soulbond".
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless it's paired with a creature with soulbond$/.exec(text))) [statement, cond] = [m[1], "it's not paired with a creature with soulbond"];
  // Hellkite Hatchling: "~ has flying and trample if it devoured a creature" (CR 702.82b).
  else if ((m = /^(~ .+?) if it devoured a creature$/.exec(text))) [statement, cond] = [m[1], "it devoured a creature"];
  if (!statement || !cond) return null;
  // "During your turn, equipped creature gets +1/+0": the statement starts a sentence of its own.
  const st = parseStatic(`${statement.replace(/\bgets an additional\b/, "gets").replace(/^(it|this creature|this permanent)\b/i, "~").replace(/^(enchanted|equipped|creatures|other) /, (w) => w.charAt(0).toUpperCase() + w.slice(1))}.`);
  if (!st || st.condition) return null;
  // "This spell has flash as long as ...": it works from your hand, which a static ability of a permanent can't.
  if (st.mods.some((x) => x.kind === "addKeywords" && x.keywords.includes("Flash"))) return null;
  const condition = parseStaticCondition(cond, st);
  return condition ? { ...st, text: line, condition } : null;
}

/**
 * Cost changes (CR 601.2f). A permanent's "Instant and sorcery spells you cast cost {1} less to cast",
 * "Noncreature spells cost {1} more to cast", "Spells your opponents cast cost {1} more to cast"; and a
 * spell's own "This spell costs {1} less to cast for each creature card in your graveyard", "... where X
 * is ...", "... if you control a Wizard" / "If an opponent controls seven or more lands, ...". Only generic
 * mana: a reduction can't take colored mana off (CR 118.7a).
 */
export function parseCostChange(line: string): { costMod: CostMod } | { less: Amount } | { lessIf: { n: number; cond: StaticCondition } } | { lessIfTargets: { n: number; filter: TargetSpec } } | { targetTax: number } | "fail" | null {
  const text = line.replace(/^[A-Z][A-Za-z' -]+ — (?=~ costs)/, "").replace(/\.$/, ""); // "Domain —" is an ability word
  let m: RegExpExecArray | null;
  if ((m = /^Spells your opponents cast that target ~ cost \{(\d+)\} more to cast$/.exec(text))) return { targetTax: Number(m[1]) };
  if ((m = /^~ costs \{(\d+)\} less to cast for each (.+)$/.exec(text))) {
    const c = parseCount(m[2]!, null, true);
    return c ? { less: { ...c, times: (c.times ?? 1) * Number(m[1]) } } : "fail";
  }
  if ((m = /^~ costs \{X\} less to cast, where X is (.+)$/.exec(text))) {
    const c = parseCount(m[1]!, null);
    return c ? { less: c } : "fail";
  }
  if ((m = /^~ costs \{(\d+)\} less to cast if it targets (an? .+)$/.exec(text))) {
    const filter = parseTargetPhrase(m[2]!.replace(/^an? /, ""));
    return filter?.kind === "object" ? { lessIfTargets: { n: Number(m[1]), filter } } : "fail";
  }
  const self: StaticAbility = { affects: { kind: "self" }, mods: [], text: line };
  if ((m = /^~ costs \{(\d+)\} less to cast if (.+)$/.exec(text)) || (m = /^If (.+), ~ costs \{(\d+)\} less to cast$/.exec(text))) {
    const [n, condText] = /^~/.test(text) ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
    const cond = parseStaticCondition(condText, self);
    return cond ? { lessIf: { n: Number(n), cond } } : "fail";
  }
  m = /^(?:(During your turn|During turns other than yours), )?(.+?)( you cast| your opponents cast)?( with mana value \d+ or (?:greater|less))?( from your graveyard)? costs? (\{\d+\}) (less|more) to cast$/.exec(text);
  if (!m || !/spells?$/i.test(m[2]!)) return null;
  const words = m[2]!.replace(/ ?spells?$/i, "").replace(/ and /g, " or ").trim();
  // "Spells you cast", "Instant and sorcery spells", "Noncreature spells", "Dragon spells", "Blue spells"
  const filter = words ? parseTargetPhrase(`${words} spell${m[4] ?? ""}`) : { kind: "spell" as const, text: "spell" };
  if (!filter || filter.kind !== "spell") return "fail";
  const who = m[3] === " you cast" ? "you" : m[3] === " your opponents cast" ? "opponents" : "all";
  if (m[5] && who !== "you") return "fail";
  const n = Number(/\d+/.exec(m[6]!)![0]) * (m[7] === "less" ? -1 : 1);
  return {
    costMod: {
      who,
      filter: { ...filter, text: `${words ? `${words.toLowerCase()} ` : ""}spells` },
      n,
      ...(m[1] ? { turn: m[1] === "During your turn" ? "yours" : "notYours" } : {}),
      ...(m[5] ? { fromGraveyard: true } : {}),
      text: line,
    },
  };
}

const CONTROL_COUNT = new RegExp(`^(?:(no|another|an?)|${NUM} or more(?: other)?|${NUM} or fewer) (.+)$`);

/** The condition of an "as long as" static ability (see parseConditionalStatic). */
export function parseStaticCondition(text: string, st: StaticAbility): StaticCondition | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(?:there are )?${NUM} or more cards (?:are )?in your graveyard$`).exec(text))) return { kind: "graveyardAtLeast", n: num(m[1]!) };
  if ((m = new RegExp(`^there are ${NUM} or more card types among cards in your graveyard$`).exec(text))) return { kind: "graveyardTypes", n: num(m[1]!) };
  if ((m = new RegExp(`^there are ${NUM} or more permanent cards in your graveyard$`).exec(text))) return { kind: "graveyardPermanents", n: num(m[1]!) };
  if (/^it's your turn$/.test(text)) return { kind: "yourTurn" };
  if (/^you're the monarch$/.test(text)) return { kind: "monarch" };
  if (/^you have a full party$/.test(text)) return { kind: "fullParty" }; // CR 700.8a
  if ((m = /^you (don't )?control a Ring-bearer$/.exec(text))) return { kind: "ringBearer", ...(m[1] ? { not: true as const } : {}) };
  if (/^~ is your Ring-bearer$/.test(text)) return { kind: "ringBearer", self: true };
  if (/^no opponent has more life than that player$/.test(text)) return { kind: "defenderMostLife" };
  if ((m = /^(?:~|it)(?:'s| is) (not )?paired with (another creature|a creature with soulbond)$/.exec(text)) && st.affects.kind === "self")
    return { kind: "paired", ...(m[2] === "a creature with soulbond" ? { withKeyword: "Soulbond" } : {}), ...(m[1] ? { not: true as const } : {}) };
  if ((m = /^you (have|don't have) the city's blessing$/.exec(text))) return { kind: "citysBlessing", ...(m[1] === "don't have" ? { not: true as const } : {}) }; // CR 702.131c
  if (/^(?:~|it) devoured a creature$/.test(text) && st.affects.kind === "self") return { kind: "self", is: "devoured" };
  if (/^you attacked(?: with (?:a|one or more) creatures?)? this turn$/.test(text)) return { kind: "attackedThisTurn" };
  if ((m = new RegExp(`^(?:a creature|${NUM} or more creatures) died( under your control)? this turn$`).exec(text)))
    return { kind: "creatureDied", ...(m[1] ? { n: num(m[1]) } : {}), ...(m[2] ? { yours: true as const } : {}) };
  if (/^an opponent lost life this turn$/.test(text)) return { kind: "opponentLostLife" };
  if ((m = new RegExp(`^an opponent has ${NUM} or more poison counters$`).exec(text))) return { kind: "opponentPoison", n: num(m[1]!) };
  // Pestilence: "if no creatures are on the battlefield".
  if ((m = /^no (.+) (?:are|is) on the battlefield$/.exec(text))) {
    const g = parseGroup(`all ${m[1]}`);
    return g && !g.other ? { kind: "onBattlefield", filter: g.filter, max: 0 } : null;
  }
  // "It" is the source only when the ability is about the source itself.
  const self = /^(?:~|it)(?:'s| is) (attacking|enchanted|equipped|modified|tapped|untapped)$/.exec(text);
  if (self && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: self[1] as "attacking" | "enchanted" | "equipped" | "modified" | "tapped" | "untapped" };
  if ((m = new RegExp(`^(?:~|it) has an? ${COUNTER} counter on it$`).exec(text)) && (st.affects.kind === "self" || text.startsWith("~")))
    return { kind: "selfCounter", counter: counterKind(m[1]!) };
  if ((m = /^(you|an opponent|defending player) controls? (.+)$/.exec(text))) {
    const who = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : "defending";
    // Each attacking creature has its own defending player (CR 506.2), so only the source's own is modeled.
    if (who === "defending" && st.affects.kind !== "self") return null;
    const q = CONTROL_COUNT.exec(m[2]!);
    if (!q) return null;
    // NUM is a group of its own: q[1] the word, q[2] "N or more", q[3] "N or fewer", q[4] what.
    const filter = pickFilter(q[4]!);
    if (!filter) return null;
    if (q[1] === "no") return { kind: "control", who, filter, max: 0 };
    if (q[1] === "another") return { kind: "control", who, filter, min: 1, other: true };
    if (q[1]) return { kind: "control", who, filter, min: 1 };
    // "two or more other artifacts" leaves the source out
    const other = / or more other /.test(m[2]!);
    if (q[2]) return { kind: "control", who, filter, min: num(q[2]!), ...(other ? { other } : {}) };
    return { kind: "control", who, filter, max: num(q[3]!) };
  }
  return null;
}

/**
 * "Prevent all [combat|noncombat] damage that would be dealt (to|by|to and dealt by) X [by creatures|by artifact
 * sources]": X as written, and what's prevented (CR 615.1).
 */
export function parsePreventAll(text: string): { subject: string; mod: Extract<Modification, { kind: "preventDamage" }> } | null {
  const m = /^Prevent all (combat |noncombat )?damage that would be dealt (to and dealt by|to|by) (.+?)(?: by (creatures|artifact creatures|artifact sources))?$/i.exec(text);
  if (!m) return null;
  const fromTypes = m[4] === "creatures" ? ["Creature"] : m[4] === "artifact creatures" ? ["Artifact", "Creature"] : m[4] === "artifact sources" ? ["Artifact"] : undefined;
  if (fromTypes && m[2] !== "to") return null;
  const combat = m[1] === "combat " ? ("only" as const) : m[1] === "noncombat " ? ("non" as const) : undefined;
  return {
    subject: m[3]!,
    mod: { kind: "preventDamage", ...(m[2] !== "by" ? { to: true as const } : {}), ...(m[2] !== "to" ? { by: true as const } : {}), ...(combat ? { combat } : {}), ...(fromTypes ? { fromTypes } : {}) },
  };
}

/**
 * The group a static ability talks about: "creatures you control", "other Elves you
 * control", "white creatures you control", "enchanted creature", "equipped creature", "~".
 */
function parseAffected(subject: string): Affects | null {
  const x = subject.trim();
  if (x === "~") return { kind: "self" };
  if (/^(Enchanted|Equipped) (creature|permanent|artifact|land)$/.test(x)) return { kind: "attached" };
  let m = /^(Other )?((?:[A-Z]?[a-z]+ )*?)creatures (you control|your opponents control)$/i.exec(x);
  if (m) {
    const words = m[2]!.trim().split(/\s+/).filter(Boolean);
    const colors: Color[] = [];
    const subtypes: string[] = [];
    const types = ["Creature"];
    let combat: "attacking" | "blocking" | undefined;
    let colorless = false;
    for (const w of words) {
      if (COLOR_WORDS[w.toLowerCase()]) colors.push(COLOR_WORDS[w.toLowerCase()]!);
      // "Artifact creatures you control get +1/+1": both card types.
      else if (/^(artifact|enchantment)$/i.test(w) && !types.includes(capital(w.toLowerCase()))) types.push(capital(w.toLowerCase()));
      else if (CREATURE_TYPES.has(w)) subtypes.push(w);
      // "Attacking creatures you control get +1/+0": whichever are attacking right now (CR 611.3a).
      else if ((w.toLowerCase() === "attacking" || w.toLowerCase() === "blocking") && !combat) combat = w.toLowerCase() as "attacking" | "blocking";
      else if (w.toLowerCase() === "colorless" && !colorless) colorless = true; // CR 105.2c
      else return null; // "Enchanted creatures", ...: not supported yet
    }
    return {
      kind: "filter",
      types,
      subtypes: subtypes.length ? subtypes : undefined,
      colors: colors.length ? colors : undefined,
      ...(combat ? { spec: { kind: "object" as const, combat, ...(colorless ? { colorCount: "colorless" as const } : {}), text: `${combat} creature` } } : colorless ? { spec: { kind: "object" as const, colorCount: "colorless" as const, text: "colorless creature" } } : {}),
      controller: m[3]!.toLowerCase() === "you control" ? "you" : "opponent",
      other: !!m[1],
    };
  }
  // "Other Zombies you control", "Elves you control"
  m = /^(Other )?([A-Z][a-z]+) you control$/.exec(x);
  if (m && CREATURE_TYPES.has(singular(m[2]!))) return { kind: "filter", types: ["Creature"], subtypes: [singular(m[2]!)], controller: "you", other: !!m[1] };
  if (/^(All creatures|Each creature)$/i.test(x)) return { kind: "filter", types: ["Creature"] };
  // A Background's "Commander creatures you own": whoever controls them (rulings).
  if (/^Commander creatures you own$/.test(x)) return { kind: "filter", types: ["Creature"], ownedCommanders: true };
  // Anything else a group can say: "Each creature you control with a +1/+1 counter on it", "Creatures of the chosen type".
  const g = parseGroup(x, true);
  return g ? { kind: "filter", types: [], spec: g.filter, ...(g.other ? { other: true } : {}) } : null;
}

/**
 * "Can block an additional creature each combat", "an additional seven creatures", "any number of creatures"
 * (CR 509.1a). "This turn" is the same for an effect that lasts until the turn ends.
 */
export function parseExtraBlocks(text: string): Modification | null {
  let m: RegExpExecArray | null;
  if (/^can block any number of creatures(?: each combat| this turn)?$/.test(text)) return { kind: "blockAny" };
  if (/^can block an additional creature(?: each combat| this turn)$/.test(text)) return { kind: "blockAdditional", n: 1 };
  if ((m = new RegExp(`^can block (?:up to )?(?:an additional ${NUM}|${NUM} additional) creatures(?: each combat| this turn)$`).exec(text))) return { kind: "blockAdditional", n: num(m[1] ?? m[2]!) };
  return null;
}

/** "get +1/+1", "have flying and vigilance", "get +2/+0 and have first strike", "can't block". */
function parseStaticMods(rest: string): Modification[] | null {
  let m: RegExpExecArray | null;
  // "Gets +4/+4 and has first strike, and all creatures able to block it do so" (a blocking requirement, CR 509.1c).
  if ((m = /^(.+?),? and all creatures able to block it do so$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    return first && [...first, { kind: "allMustBlock" }];
  }
  // Arrest: "can't attack or block, and its activated abilities can't be activated" (mana abilities too, CR 605.1a).
  if ((m = /^(.+?),? and its activated abilities can't be activated( unless they're mana abilities)?$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    return first && [...first, { kind: "cantActivate", ...(m[2] ? { exceptMana: true as const } : {}) }];
  }
  // "Gets +0/+3 and can block an additional creature each combat", "gets +2/+2, has vigilance, and can block ...".
  if ((m = new RegExp(`^(gets? ${PT}/${PT}|(?:has|have) .+?)(?:,? and|, (?:has|have) (.+?),? and) (can block .+)$`).exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const grants = m[4] ? parseGrants(m[4]) : [];
    const more = / this turn$/.test(m[5]!) ? null : parseExtraBlocks(m[5]!);
    return first && grants && more ? [...first, ...grants, more] : null;
  }
  // "Gets +2/+2 and can't block" (Childhood Horror), "gets +1/+1 and attacks each combat if able".
  // "Gets +1/+1 and is goaded" (the Impetus Auras, CR 701.15), "gets -2/-0 and loses all abilities" (Mystic Subdual).
  if ((m = new RegExp(`^(gets? ${PT}/${PT}|(?:has|have) .+?),? and (can't .+|attacks? each combat if able|must be blocked if able|is goaded|loses all abilities)$`).exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[4]!);
    return first && second ? [...first, ...second] : null;
  }
  if ((m = new RegExp(`^gets? ${PT}/${PT}(?: and (?:has|have) (.+))?$`).exec(rest))) {
    const mods: Modification[] = [{ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) }];
    if (m[3]) {
      const grants = parseGrants(m[3]);
      if (!grants) return null;
      mods.push(...grants);
    }
    return mods;
  }
  if ((m = /^(?:has|have) (.+)$/.exec(rest))) return parseGrants(m[1]!);
  if (/^can block (?:an additional|any number|up to|\w+ additional)/.test(rest)) {
    const more = parseExtraBlocks(rest);
    return more && !/ this turn$/.test(rest) ? [more] : null;
  }
  if (/^can't attack or block$/.test(rest)) return [{ kind: "cantAttack" }, { kind: "cantBlock" }];
  // "Can't block and can't be blocked" (Changeling Outcast).
  if ((m = /^(can't [^,]+?) and (can't .+)$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[2]!);
    return first && second ? [...first, ...second] : null;
  }
  // Goaded by the static's controller (CR 701.15a): "Enchanted creature ... is goaded".
  if (/^is goaded$/.test(rest)) return [{ kind: "goad" }];
  // CR 506.5: alone means the only creature declared as an attacker (or blocker) that combat.
  if (/^can't attack or block alone$/.test(rest)) return [{ kind: "cantAttackAlone" }, { kind: "cantBlockAlone" }];
  if (/^can't attack alone$/.test(rest)) return [{ kind: "cantAttackAlone" }];
  if (/^can't block alone$/.test(rest)) return [{ kind: "cantBlockAlone" }];
  if (/^must be blocked if able$/.test(rest)) return [{ kind: "mustBeBlocked" }];
  // "Can't attack unless defending player controls an Island" (Sea Serpent), "... a Swamp", "... a blue permanent".
  if ((m = /^can't attack unless defending player controls (an? .+)$/.exec(rest))) {
    const filter = parseTargetPhrase(m[1]!.replace(/^an? /, ""));
    return filter?.kind === "object" && !filter.controller ? [{ kind: "cantAttackUnless", defenderControls: { ...filter, text: m[1]! } }] : null;
  }
  if (/^can't block$/.test(rest)) return [{ kind: "cantBlock" }];
  // "Can't block creatures with power 2 or greater" (CR 509.1b).
  if ((m = /^can't block creatures with power (\d+) or (greater|less)$/.exec(rest))) {
    const filter = parseTargetPhrase(`creature with power ${m[1]} or ${m[2]}`);
    return filter?.kind === "object" && filter.power ? [{ kind: "cantBlockCreatures", filter: { ...filter, text: `creatures with power ${m[1]} or ${m[2]}` } }] : null;
  }
  if (/^can't attack$/.test(rest)) return [{ kind: "cantAttack" }];
  if (/^can't be blocked$/.test(rest)) return [{ kind: "cantBeBlocked" }];
  if (/^can't be blocked by more than one creature$/.test(rest)) return [{ kind: "maxOneBlocker" }];
  if ((m = new RegExp(`^can't be blocked except by ${NUM} or more creatures$`).exec(rest)) && num(m[1]!) >= 2) return [{ kind: "minBlockers", n: num(m[1]!) }];
  // "Can't be blocked except by creatures with flying or reach", "... except by black creatures", "... except by
  // Walls and/or creatures with flying" (CR 509.1b).
  if ((m = /^can't be blocked except by (.+)$/.exec(rest))) {
    const filters: TargetSpec[] = [];
    for (const part of m[1]!.split(" and/or ")) {
      const kw = /^creatures with (\w+) or (\w+)$/.exec(part);
      for (const p of kw ? [`creatures with ${kw[1]}`, `creatures with ${kw[2]}`] : [part]) {
        const [head, ...tail] = p.split(/ (?=with )/);
        const filter = parseTargetPhrase([head!.split(" ").map(singular).join(" "), ...tail].join(" "));
        if (filter?.kind !== "object" || filter.controller || filter.combat) return null;
        filters.push({ ...filter, text: p });
      }
    }
    return [{ kind: "blockableOnlyBy", filters, text: m[1]! }];
  }
  if (/^can't be blocked by creatures with greater power$/.test(rest)) return [{ kind: "cantBeBlockedByGreaterPower" }];
  if ((m = /^can't be blocked by (.+)$/.exec(rest))) {
    // "creatures with power 2 or less", "Walls", "blue creatures", "artifact creatures" (CR 509.1b)
    // In the singular, as parseTargetPhrase reads it: "creature with power 2 or less", "Wall", "blue creature".
    const [head, ...rest] = m[1]!.split(/ (?=with )/);
    const phrase = [head!.split(" ").map(singular).join(" "), ...rest].join(" ");
    const filter = parseTargetPhrase(phrase);
    return filter && filter.kind === "object" ? [{ kind: "cantBeBlockedBy", filter: { ...filter, text: m[1]! } }] : null;
  }
  if (/^can block only creatures with flying$/.test(rest)) return [{ kind: "blocksOnlyFlyers" }];
  if (/^attacks? each combat if able$/.test(rest)) return [{ kind: "attacksIfAble" }];
  if (/^doesn't untap during (?:its controller's|your) untap step$/.test(rest)) return [{ kind: "doesntUntap" }];
  if (/^loses all abilities$/.test(rest)) return [{ kind: "loseAllAbilities" }];
  return null;
}

export function parseStatic(line: string): StaticAbility | null {
  let text = line.replace(/\.$/, "");
  const lands = parseLandTypeStatic(text, line);
  if (lands) return lands;
  // Null Rod: "Activated abilities of artifacts can't be activated", mana abilities too (CR 605.1a); only permanents'.
  const silenced = /^Activated abilities of (.+?) can't be activated( unless they're mana abilities)?$/.exec(text);
  if (silenced) {
    const affects = parseAffected(silenced[1]!.replace(/^./, (c) => c.toUpperCase()));
    return affects && affects.kind === "filter" ? { affects, mods: [{ kind: "cantActivate", ...(silenced[2] ? { exceptMana: true as const } : {}) }], text: line } : null;
  }
  const noAbilities = /^Enchanted (creature|permanent|artifact|land)'s activated abilities can't be activated( unless they're mana abilities)?$/.exec(text);
  if (noAbilities) return { affects: { kind: "attached" }, mods: [{ kind: "cantActivate", ...(noAbilities[2] ? { exceptMana: true as const } : {}) }], text: line };
  // "You control enchanted creature." (Mind Control)
  if (/^You control enchanted (creature|permanent|artifact|land)$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "control" }], text: line };
  // Ghostly Prison, Propaganda (CR 508.1g-h).
  const tax = /^Creatures can't attack you unless their controller pays \{(\d+)\} for each creature they control that's attacking you$/.exec(text);
  if (tax) return { affects: { kind: "self" }, mods: [{ kind: "attackTax", n: Number(tax[1]) }], text: line };
  // "Untap ~ during each other player's untap step", "Untap all permanents you control during ..." (Seedborn Muse):
  // they untap with the active player's permanents (CR 502.3); "doesn't untap during your untap step" doesn't apply.
  const untaps = /^Untap (~|all (.+?) you control|each (.+? you control(?: with .+)?)) during each other player's untap step$/.exec(text);
  if (untaps) {
    const affects = untaps[1] === "~" ? { kind: "self" as const } : parseAffected(untaps[2] ? `${untaps[2].charAt(0).toUpperCase()}${untaps[2].slice(1)} you control` : `Each ${untaps[3]}`);
    if (!affects || (affects.kind === "filter" && affects.controller !== "you" && affects.spec?.controller !== "you")) return null;
    return { affects, mods: [{ kind: "untapsDuringOthers" }], text: line };
  }
  // Prevention (CR 615.1): "Prevent all combat damage that would be dealt to ~", "Prevent all damage that would be dealt
  // by enchanted creature", "... to and dealt by enchanted creature", "... to ~ by creatures".
  const prevent = parsePreventAll(text);
  if (prevent) {
    const affects = prevent.subject === "~" ? ({ kind: "self" } as const) : parseAffected(prevent.subject.replace(/^./, (c) => c.toUpperCase()));
    return affects ? { affects, mods: [prevent.mod], text: line } : null;
  }
  // "~ is also a Cleric, Rogue, Warrior, and Wizard" (party, CR 700.8): creature types it has in addition (layer 4).
  const also = /^~ is also an? (.+)$/.exec(text);
  if (also) {
    const types = also[1]!.replace(/,? and /, ", ").split(", ");
    return types.every((t) => CREATURE_TYPES.has(t)) ? { affects: { kind: "self" }, mods: [{ kind: "addTypes", types: [], subtypes: types, supertypes: [] }], text: line } : null;
  }
  const cda = parseDefinedPT(text);
  if (cda) return { affects: { kind: "self" }, mods: [cda], text: line };
  const where = /^(.+), where X is (.+)$/.exec(text);
  if (where) text = where[1]!;
  // "Creatures with power less than ~'s power can't block it." "All creatures able to block ~ do so." (CR 509.1b-c)
  if (/^Creatures with power less than ~'s power can't block it$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "cantBeBlockedByLesserPower" }], text: line };
  if (/^All creatures able to block ~ do so$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "allMustBlock" }], text: line };
  if (/^All creatures able to block (enchanted|equipped) creature do so$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "allMustBlock" }], text: line };
  // "You may have ~ assign its combat damage as though it weren't blocked" (CR 510.1c-d; chosen as it assigns it).
  const unblocked = [{ kind: "unblockedDamage" }] as const;
  if (/^You may have ~ assign its combat damage as though it weren't blocked$/.test(text)) return { affects: { kind: "self" }, mods: [...unblocked], text: line };
  if (/^Enchanted creature's controller may have it assign its combat damage as though it weren't blocked$/.test(text)) return { affects: { kind: "attached" }, mods: [...unblocked], text: line };
  if (/^As long as ~ is attacking, for each creature you control, you may have that creature assign its combat damage as though it weren't blocked$/.test(text))
    return { affects: { kind: "filter", types: ["Creature"], controller: "you" }, mods: [...unblocked], text: line, condition: { kind: "self", is: "attacking" } };
  const grantsUnblocked = /^(.+) have "You may have ~ assign its combat damage as though it weren't blocked\."$/.exec(text);
  if (grantsUnblocked) {
    const affects = parseAffected(grantsUnblocked[1]!);
    return affects && affects.kind === "filter" ? { affects, mods: [...unblocked], text: line } : null;
  }
  const m = /^(.+?) (gets? .+|(?:has|have) .+|can't .+|can block .+|must be blocked if able|attacks? each combat if able|doesn't untap .+|loses all abilities)$/.exec(text);
  if (!m) return null;
  const affects = parseAffected(m[1]!);
  if (!affects) return null;
  // "~ gets +1/+1 for each artifact you control": counted continuously (CR 611.3a).
  const each = new RegExp(`^(gets? ${PT}/${PT}) for each (.+)$`).exec(m[2]!);
  let mods = parseStaticMods(each ? each[1]! : m[2]!);
  if (!mods) return null;
  const counts = (c: AmountExpr | null) => c && staticCountOk(c, affects) ? c : null;
  if (each) {
    const per = counts(parseCount(each[4]!, null, true));
    const pt = mods[0];
    if (!per || mods.length !== 1 || pt?.kind !== "modifyPT") return null;
    const [p, t] = [scaleAmount(pt.power, per), scaleAmount(pt.toughness, per)];
    if (p === null || t === null) return null;
    mods = [{ kind: "modifyPT", power: p, toughness: t }];
  }
  if (where) {
    const def = counts(parseCount(where[2]!, null));
    if (!def) return null;
    mods = replaceX(mods, def);
  }
  // A static ability has no X of its own to choose (CR 107.3).
  return usesX(mods) ? null : { affects, mods, text: line };
}

/**
 * Counts a static ability can use while the layers are being applied: power and toughness aren't
 * known yet then (they're what's being worked out), and "attached to it" means the permanent
 * itself only when the ability is about itself.
 */
function staticCountOk(c: AmountExpr, affects: Affects): boolean {
  const k = c.count;
  if (k.kind === "power" || k.kind === "toughness") return false;
  // "Equipped creature gets +X/+X, where X is its mana value": "its" is the equipped creature, not the source.
  if (k.kind === "manaValue" && affects.kind !== "self") return false;
  if (k.kind === "permanents" && (k.filter.power || k.filter.toughness)) return false;
  if (k.kind === "attachedToSelf" && affects.kind !== "self") return false;
  return true;
}

/**
 * Characteristic-defining abilities for power and toughness (CR 604.3, layer 7a): "~'s power and
 * toughness are each equal to the number of creatures you control", "~'s power is equal to ...",
 * "~'s power is equal to N and its toughness is equal to that number plus 1".
 */
function parseDefinedPT(text: string): Modification | null {
  let m: RegExpExecArray | null;
  const ok = (c: AmountExpr | null) => (c && staticCountOk(c, { kind: "self" }) ? c : null);
  if ((m = /^~'s power and toughness are each equal to (.+)$/.exec(text))) {
    const c = ok(parseCount(m[1]!, null));
    return c && { kind: "definePT", power: c, toughness: c };
  }
  if ((m = /^~'s power is equal to (.+?) and its toughness is equal to (.+)$/.exec(text))) {
    const p = ok(parseCount(m[1]!, null));
    const same = /^that number(?: (plus|minus) (\d+))?$/.exec(m[2]!);
    const t = same && p ? { ...p, plus: (p.plus ?? 0) + (same[1] === "minus" ? -1 : 1) * Number(same[2] ?? 0) } : ok(parseCount(m[2]!, null));
    return p && t ? { kind: "definePT", power: p, toughness: t } : null;
  }
  if ((m = /^~'s (power|toughness) is equal to (.+)$/.exec(text))) {
    const c = ok(parseCount(m[2]!, null));
    return c && { kind: "definePT", [m[1]!]: c };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Effect bodies

const BASIC_PLURAL: Record<string, string> = { Plains: "Plains", Islands: "Island", Swamps: "Swamp", Mountains: "Mountain", Forests: "Forest" };
const LAND: TargetSpec = { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "land" };

/**
 * Basic land types (CR 305.7): "Nonbasic lands are Mountains" (Blood Moon), "All Mountains are Plains" (Conversion),
 * "Enchanted land is an Island" (Spreading Seas) set a land's land types, so it loses its other land types and the
 * abilities from its rules text. "Each land is a Swamp in addition to its other land types" (Urborg), "Lands you control
 * are every basic land type in addition to their other types" (Prismatic Omen) only add types. "Islands don't untap
 * during their controllers' untap steps" (Choke).
 */
function parseLandTypeStatic(text: string, line: string): StaticAbility | null {
  let m: RegExpExecArray | null;
  if ((m = /^Nonbasic lands are (Plains|Islands|Swamps|Mountains|Forests)$/.exec(text)))
    return { affects: { kind: "filter", types: ["Land"], spec: { ...LAND, notSupertypes: ["Basic"], text: "nonbasic land" } }, mods: [{ kind: "setLandTypes", subtypes: [BASIC_PLURAL[m[1]!]!] }], text: line };
  if ((m = /^All (Plains|Islands|Swamps|Mountains|Forests) are (Plains|Islands|Swamps|Mountains|Forests)$/.exec(text)) && m[1] !== m[2])
    return { affects: { kind: "filter", types: ["Land"], subtypes: [BASIC_PLURAL[m[1]!]!] }, mods: [{ kind: "setLandTypes", subtypes: [BASIC_PLURAL[m[2]!]!] }], text: line };
  if ((m = /^Enchanted land is an? (Plains|Island|Swamp|Mountain|Forest)$/.exec(text))) return { affects: { kind: "attached" }, mods: [{ kind: "setLandTypes", subtypes: [m[1]!] }], text: line };
  if ((m = /^Each land is an? (Plains|Island|Swamp|Mountain|Forest) in addition to its other land types$/.exec(text)))
    return { affects: { kind: "filter", types: ["Land"] }, mods: [{ kind: "addTypes", types: [], subtypes: [m[1]!] }], text: line };
  if (/^Lands you control are every basic land type in addition to their other types$/.test(text))
    return { affects: { kind: "filter", types: ["Land"], controller: "you" }, mods: [{ kind: "addTypes", types: [], subtypes: [...BASIC_TYPES] }], text: line };
  if ((m = /^(Plains|Islands|Swamps|Mountains|Forests) don't untap during their controllers' untap steps$/.exec(text)))
    return { affects: { kind: "filter", types: ["Land"], subtypes: [BASIC_PLURAL[m[1]!]!] }, mods: [{ kind: "doesntUntap" }], text: line };
  return null;
}
