// Prevention and redirection effects of resolving spells and abilities that last the turn and aren't a shield on one
// permanent or player (CR 615, 614.9): "Prevent all damage that would be dealt to you and creatures you control this
// turn", "The next time a red source of your choice would deal damage to you this turn, prevent that damage", "The
// next X damage that a source of your choice would deal to you and/or creatures you control this turn is dealt to any
// target instead". See DamageRuleSpec.

import type { DamageRecipient, DamageRuleSpec, Effect, TargetSpec } from "../../abilities";
import type { Color } from "../../types";
import type { Ctx } from "../body";
import { addTarget } from "../body";
import { parseDamageModSentence } from "../damage-mods";
import { parseDamageRecipient, parseGroup, parseTargetPhrase } from "../targets";
import { COLOR_WORDS, NUMX, amt } from "../words";

/** "red", "black or red", "artifact", "white" before "source": what the source has to be; "" is any source. */
function sourceQuality(q: string): TargetSpec | null {
  const words = q.trim().toLowerCase();
  if (!words) return { kind: "object", text: "source" };
  const colors = words.split(/,? or |, /).map((w) => COLOR_WORDS[w]);
  if (colors.every((c): c is Color => !!c)) return { kind: "object", colors, text: `${words} source` };
  if (/^(artifact|land|creature|enchantment)$/.test(words)) return { kind: "object", types: [words.charAt(0).toUpperCase() + words.slice(1)], text: `${words} source` };
  return null;
}

/**
 * The sources a "Prevent all damage ... by S" is about: "creatures", "nongreen creatures", "creatures your opponents
 * control", "non-Human sources", "sources you don't control", "black sources and red sources".
 */
function sourceGroup(p: string): TargetSpec | null {
  const t = p.trim();
  const colors = /^((?:white|blue|black|red|green) sources(?:,? (?:and|or) (?:white|blue|black|red|green) sources)*)$/i.exec(t);
  if (colors) return { kind: "object", colors: t.toLowerCase().split(/ sources(?:,? (?:and|or) )?/).filter(Boolean).map((w) => COLOR_WORDS[w]!), text: t.toLowerCase() };
  const src = /^(?:(non-?)([A-Z]\w+|colorless|artifact|creature) )?sources( you don't control| your opponents control)?$/i.exec(t);
  if (src) {
    const spec: TargetSpec = { kind: "object", text: t.toLowerCase() };
    const w = src[2]?.toLowerCase();
    if (w === "colorless") {
      if (src[1]) return null;
      spec.colorCount = "colorless";
    } else if (w === "artifact" || w === "creature") spec[src[1] ? "notTypes" : "types"] = [w.charAt(0).toUpperCase() + w.slice(1)];
    else if (src[2]) {
      if (!src[1]) return null;
      spec.notSubtypes = [src[2]];
    }
    if (src[3]) spec.controller = "opponent";
    return spec;
  }
  if (!/creatures\b/i.test(t)) return null;
  const g = parseGroup(t, true);
  return g && !g.other && g.filter.types?.includes("Creature") ? g.filter : null;
}

/** Who a prevention effect protects, when it isn't a target: "you", "players", "creatures you control", "you and permanents you control". */
function protectedGroup(p: string): DamageRuleSpec["to"] | null {
  const t = p.trim().toLowerCase();
  if (t === "you") return { players: "you" };
  if (t === "players") return { players: "all" };
  const you = /^you and(?:\/or)? (.+)$/.exec(t);
  const g = parseGroup(you ? you[1]! : t, true);
  if (!g || g.other || (you && g.filter.controller !== "you")) return null;
  return { ...(you ? { players: "you" as const } : {}), objects: g.filter };
}

/** A target or a group: "target creature", "any target", "enchanted creature", or as protectedGroup. */
function protectedAny(p: string, ctx: Ctx): DamageRuleSpec["to"] | null {
  if (/^(any target|target .+|enchanted creature)$/i.test(p.trim())) {
    const target = parseDamageRecipient(p.trim(), ctx);
    return target ? { target } : null;
  }
  return protectedGroup(p);
}

/** Where a redirection sends the damage: "any target", "target creature you control", "~", "another target creature", "you". */
function destination(p: string, ctx: Ctx): DamageRecipient | null {
  const t = p.trim();
  if (/^you$/i.test(t)) return { ref: "you" };
  if (t === "~") return { ref: "self" };
  if (!/^(any target|any other target|another target(?: .+)?|target .+)$/i.test(t)) return null;
  return parseDamageRecipient(t, ctx);
}

const rule = (r: DamageRuleSpec): Effect[] => [{ type: "damageRule", rule: r }];

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parsePreventionSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  const mod = parseDamageModSentence(s, ctx);
  if (mod !== undefined) return mod;
  let m: RegExpExecArray | null;
  const QUAL = "(?:an? )((?:(?:white|blue|black|red|green)(?:,? or (?:white|blue|black|red|green))*|artifact|land|creature) )?source of your choice( of the chosen color)?";
  const choose = (q: string | undefined, chosenColor: string | undefined): TargetSpec | null => {
    const spec = sourceQuality(q ?? "");
    if (!spec || (chosenColor && q)) return null;
    return chosenColor ? { ...spec, chosen: "color", text: "source of the chosen color" } : spec;
  };

  // "The next time a red source of your choice would deal damage to you this turn, prevent that damage" (CR 615.8):
  // also "to target creature", "to any target", "to you and/or creatures you control", and to anything at all.
  if ((m = new RegExp(`^The next time ${QUAL} would deal damage(?: to (.+?))? this turn, (prevent that damage|that damage is dealt to (.+) instead|that source deals that damage to you instead)$`, "i").exec(s))) {
    const by = choose(m[1], m[2]);
    const to = m[3] ? protectedAny(m[3], ctx) : undefined;
    if (!by || to === null) return null;
    const redirect = /^prevent/i.test(m[4]!) ? undefined : m[5] ? destination(m[5], ctx) : ({ ref: "you" } as const);
    if (redirect === null) return null;
    return rule({ by: { choose: by }, ...(to ? { to } : {}), nextTime: true, ...(redirect ? { redirect } : {}) });
  }
  // "Prevent all damage a source of your choice would deal this turn" (Pay No Heed), "... would deal to you this turn",
  // "Prevent all damage that would be dealt to you this turn by a source of your choice" (Consulate Surveillance).
  if ((m = new RegExp(`^Prevent all damage ${QUAL} would deal(?: to (.+?))? this turn$`, "i").exec(s)) ?? (m = new RegExp(`^Prevent all damage that would be dealt(?: to (.+?))? this turn by ${QUAL}$`, "i").exec(s))) {
    const [q, chosen, toText] = m[0]!.startsWith("Prevent all damage that") ? [m[2], m[3], m[1]] : [m[1], m[2], m[3]];
    const by = choose(q, chosen);
    const to = toText ? protectedAny(toText, ctx) : undefined;
    return by && to !== null ? rule({ by: { choose: by }, ...(to ? { to } : {}) }) : null;
  }
  // "The next X damage that a source of your choice would deal to you and/or creatures you control this turn is dealt
  // to any target instead" (Shining Shoal, Harm's Way): one shield for all of them (rulings).
  if ((m = new RegExp(`^The next ${NUMX} damage that ${QUAL} would deal to (.+?) this turn is dealt to (.+) instead$`, "i").exec(s))) {
    const by = choose(m[2], m[3]);
    const to = protectedAny(m[4]!, ctx);
    const redirect = to && destination(m[5]!, ctx);
    return by && to && redirect ? rule({ by: { choose: by }, to, n: amt(m[1]!), redirect }) : null;
  }
  // "Prevent the next 3 damage that would be dealt to any target this turn by a source of your choice" (Healing Grace).
  if ((m = new RegExp(`^Prevent the next ${NUMX} damage that would be dealt to (.+?) this turn by ${QUAL}$`, "i").exec(s))) {
    const by = choose(m[3], m[4]);
    const to = protectedAny(m[2]!, ctx);
    return by && to ? rule({ by: { choose: by }, to, n: amt(m[1]!) }) : null;
  }
  // "All damage that would be dealt this turn to target creature you control by a source of your choice is dealt to
  // another target creature instead" (Kor Chant), "... to target creature this turn by ... is dealt to ~ instead".
  if ((m = new RegExp(`^All damage that would be dealt (?:this turn )?to (.+?) (?:this turn )?by ${QUAL} is dealt to (.+) instead$`, "i").exec(s))) {
    const to = protectedAny(m[1]!, ctx);
    const by = choose(m[2], m[3]);
    const redirect = to && destination(m[4]!, ctx);
    return by && to && redirect ? rule({ by: { choose: by }, to, redirect }) : null;
  }

  // "Prevent all damage that would be dealt to you and creatures you control this turn" (Safe Passage), "... this turn
  // to creatures you control" (Sivvi's Ruse), "... by creatures this turn" (Ethereal Haze), "Prevent all combat damage
  // that would be dealt to players this turn" (Defend the Hearth), "... to you and creatures you control this turn by
  // creatures" (Eerie Interference): a rule of the game until the turn ends, so also for permanents that arrive later
  // (CR 611.2c). One about a target or ~ is a prevention effect on that object (basics.ts).
  // "Prevent all damage that would be dealt by target instant or sorcery spell this turn" (Hidden Retreat): as Hallow.
  if ((m = /^Prevent all damage that would be dealt by target ((?:instant or sorcery )?spell) this turn$/i.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    return spec?.kind === "spell" ? rule({ by: { target: { ref: "target", index: addTarget(ctx, spec) } } }) : null;
  }
  if ((m = /^Prevent all (combat |noncombat )?damage that would be dealt (.+)$/i.exec(s))) {
    const rest = m[2]!;
    if (!/\bthis turn\b/i.test(rest) || (rest.match(/\bthis turn\b/gi) ?? []).length > 1) return undefined;
    const t = rest.replace(/ ?\bthis turn\b ?/i, " ").trim();
    const parts = /^(?:to (.+?))?(?: ?by (.+))?$/i.exec(t);
    if (!parts || (!parts[1] && !parts[2])) return undefined;
    if (parts[1] && /^(~|it|him|her|that creature|those creatures|target .+|up to .+|any target|enchanted .+|equipped .+)$/i.test(parts[1])) return undefined;
    if (parts[2] && /^(~|it|that creature|target .+|enchanted .+|equipped .+)$/i.test(parts[2])) return undefined;
    const to = parts[1] ? protectedGroup(parts[1]) : undefined;
    const by = parts[2] ? sourceGroup(parts[2]) : undefined;
    if (to === null || by === null) return null;
    const combat = m[1] ? (m[1].trim().toLowerCase() === "combat" ? "only" : "non") : undefined;
    return rule({ ...(combat ? { combat } : {}), ...(to ? { to } : {}), ...(by ? { by: { filter: by } } : {}) });
  }
  // "Prevent all damage that creatures would deal to players this turn" (Chameleon Blur), "Prevent all damage that black
  // sources and red sources would deal this turn" (Luminesce).
  if ((m = /^Prevent all (combat )?damage that (.+?) would deal(?: to (.+?))? this turn$/i.exec(s))) {
    if (/^(~|it|that creature|target .+|enchanted .+|equipped .+)$/i.test(m[2]!)) return undefined;
    const by = sourceGroup(m[2]!);
    const to = m[3] ? protectedGroup(m[3]) : undefined;
    return by && to !== null ? rule({ ...(m[1] ? { combat: "only" as const } : {}), by: { filter: by }, ...(to ? { to } : {}) }) : null;
  }
  // "Prevent all damage target spell would deal this turn" (Hallow): that spell, and the permanent it becomes.
  if ((m = /^Prevent all damage target ((?:instant or sorcery )?spell) would deal this turn$/i.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    return spec?.kind === "spell" ? rule({ by: { target: { ref: "target", index: addTarget(ctx, spec) } } }) : null;
  }
  return undefined;
}

/**
 * An additional effect of the prevention effect just before it (CR 615.5): "You gain life equal to the damage
 * prevented this way", "If damage from a black source is prevented this way, you gain that much life", "If damage is
 * prevented this way, ~ deals that much damage to that source's controller".
 */
export function parsePreventionRider(s: string): Pick<DamageRuleSpec, "gainLife" | "dealBack"> | undefined {
  if (/^You gain life equal to the damage prevented this way$/i.test(s)) return { gainLife: {} };
  const m =
    /^(?:If|Whenever) damage(?: from an? ((?:white|blue|black|red|green)(?: or (?:white|blue|black|red|green))?) source)? is prevented this way(?: this turn)?, (you gain that much life|~ deals that much damage to (?:that|the) source's controller)$/i.exec(s);
  if (!m) return undefined;
  const cond = m[1] ? { colors: m[1].toLowerCase().split(" or ").map((w) => COLOR_WORDS[w]!) } : {};
  return /gain/i.test(m[2]!) ? { gainLife: cond } : { dealBack: cond };
}

