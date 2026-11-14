// Damage amount replacements (CR 614.1a): "If a source you control would deal damage to a permanent or player, it deals
// double that damage to that permanent or player instead", "... that much damage plus 2 instead", "... half that damage,
// rounded down ...". See DamageMod in abilities.ts; damage.ts applies them.

import type { DamageMod, Effect, StaticAbility, TargetSpec } from "../abilities";
import { addTarget, type Ctx } from "./body";
import type { Color } from "../types";
import { parseCount } from "./counts";
import { parseStaticCondition } from "./statics";
import { parseTargetPhrase } from "./targets";
import { COLOR_WORDS } from "./words";

const COLOR = "(?:white|blue|black|red|green)";

/** One kind of source: "a red source you control", "a creature you control", "a red instant or sorcery spell you control". */
function sourceKind(t: string): { spec: TargetSpec; spell?: true } | null {
  // Obosh, the Preypiercer: "a source you control with an odd mana value" (a spell's with its X, rulings, CR 202.3e).
  const parity = /^(source you control) with an? (odd|even) mana value$/.exec(t);
  if (parity) {
    const k = sourceKind(parity[1]!);
    return k && { spec: { ...k.spec, manaValue: { parity: parity[2] as "odd" | "even" }, text: t } };
  }
  const you = / you control$/.test(t);
  let rest = t.replace(/ you control$/, "");
  // Leading colors ("red", "red or artifact" is handled by the caller): the target phrases don't take them before
  // "instant or sorcery spell".
  const colors: Color[] = [];
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(${COLOR}) (.+)$`).exec(rest))) {
    colors.push(COLOR_WORDS[m[1]!]!);
    rest = m[2]!;
  }
  const extra = { ...(colors.length ? { colors } : {}), ...(you ? { controller: "you" as const } : {}) };
  if (rest === "source") return { spec: { kind: "object", ...extra, text: t } };
  // "A noncreature source you control" (Disciples of the Inferno): a spell, or a permanent that isn't a creature.
  if (rest === "noncreature source") return { spec: { kind: "object", notTypes: ["Creature"], ...extra, text: t } };
  // "Sources with the chosen name" (Gideon's Intervention): the name chosen as the permanent entered (CR 201.4).
  if (rest === "source with the chosen name" && !colors.length) return { spec: { kind: "object", chosen: "name", ...extra, text: t } };
  // "Sources you control of the chosen type" (Collective Inferno): the creature type chosen as it entered (CR 205.3m).
  if (rest === "source of the chosen type" && !colors.length) return { spec: { kind: "object", chosen: "type", ...extra, text: t } };
  if (rest === "source an opponent controls" && !colors.length) return { spec: { kind: "object", controller: "opponent", text: t } };
  const typed = /^(Giant|instant or sorcery|artifact|creature) source$/.exec(rest);
  if (typed) {
    const w = typed[1]!;
    const types = w === "instant or sorcery" ? ["Instant", "Sorcery"] : w === "artifact" ? ["Artifact"] : w === "creature" ? ["Creature"] : [];
    return { spec: { kind: "object", ...(types.length ? { types } : { subtypes: [w] }), ...extra, text: t } };
  }
  if (/\bspell$/.test(rest)) {
    const p = parseTargetPhrase(rest);
    if (p?.kind !== "spell" || p.controller) return null;
    const { kind: _, text: __, ...q } = p;
    return { spec: { ...q, kind: "object", ...(colors.length ? { colors: [...(q.colors ?? []), ...colors] } : {}), ...(you ? { controller: "you" as const } : {}), text: t }, spell: true };
  }
  // A permanent: "creature you control with a +1/+1 counter on it", "Lizard, Mouse, Otter, or Raccoon you control", "red
  // planeswalker you control".
  const p = parseTargetPhrase(t);
  if (p?.kind !== "object" || p.manaValue || p.anyOf || p.chosen) return null;
  return { spec: { ...p, text: t } };
}

/** What would deal the damage, as written after "If". Null when it isn't understood. */
function parseBy(t: string, attached: boolean): { by: DamageMod["by"]; attached: boolean } | null {
  if (t === "~" || t === "this creature") return { by: { self: true }, attached: false };
  if (/^(?:equipped|enchanted) creature$/.test(t)) return { by: { self: true }, attached: true };
  if (t === "another creature" && attached) return { by: { other: true, filters: [{ spec: { kind: "object", types: ["Creature"], text: "creature" } }] }, attached };
  if (t === "a source" || t === "any source") return { by: undefined, attached };
  if ((t === "a creature ~ is blocking" || t === "a creature blocking ~") && !attached) return { by: { filters: [{ spec: { kind: "object", types: ["Creature"], text: "creature" } }], combatWithHolder: t === "a creature blocking ~" ? "blocking" : "blocked" }, attached };
  const other = /^another /.test(t);
  const body = t.replace(/^(?:another|an?|any) /, "");
  // "a red or artifact source you control" (Mechanized Warfare), "a red instant or sorcery spell you control or a red
  // planeswalker you control" (Pyromancer's Gauntlet): either one.
  const parts: string[] = [];
  const both = new RegExp(`^(${COLOR}) or (artifact) source you control$`).exec(body);
  if (both) parts.push(`${both[1]} source you control`, `${both[2]} source you control`);
  else parts.push(...body.split(/ or an? (?=\w+ (?:planeswalker|creature) you control$)/));
  const filters = parts.map(sourceKind);
  if (filters.some((f) => !f)) return null;
  return { by: { ...(other ? { other: true as const } : {}), filters: filters as { spec: TargetSpec; spell?: true }[] }, attached };
}

/** What it would be dealt to, as written after "deal damage to". Null when it isn't understood. */
function parseTo(t: string | undefined, attached: boolean): DamageMod["to"] | null {
  if (t === undefined || t === "a permanent or player" || t === "any target") return undefined;
  if (t === "an opponent or a permanent an opponent controls") return { players: "opponents", objects: { kind: "object", controller: "opponent", text: "permanent an opponent controls" } };
  if (t === "the chosen player or a permanent they control") return { players: "chosen", chosenPermanents: true };
  if (t === "you") return { players: "you" };
  if (t === "an opponent") return { players: "opponents" };
  if (t === "a player") return { players: "all" };
  // Disciples of the Inferno: a creature or battle permanent, or an opponent.
  if (t === "a creature, battle, or opponent") return { players: "opponents", objects: { kind: "object", types: ["Creature", "Battle"], text: "creature or battle" } };
  if (t === "a player or battle permanent") return { players: "all", objects: { kind: "object", types: ["Battle"], text: "battle" } };
  if (t === "enchanted player") return { players: "enchanted" };
  if (t === "~" || t === "this creature") return attached ? null : { self: true };
  if (t === "equipped creature" || t === "enchanted creature") return attached ? { self: true } : null;
  // "you or a creature you control", "you or another permanent you control" (Rem Karolus).
  const you = /^you or (.+)$/.exec(t);
  if (you) {
    const rest = parseTo(you[1]!, attached);
    return rest?.objects && !rest.players ? { ...rest, players: "you" } : null;
  }
  const other = /^another (.+)$/.exec(t);
  const phrase = (other ? other[1]! : t).replace(/^an? /, "");
  const p = parseTargetPhrase(phrase);
  if (p?.kind !== "object" || p.anyOf || p.chosen) return null;
  return { objects: { ...p, text: phrase }, ...(other ? { other: true as const } : {}) };
}

/**
 * "If a source you control would deal damage to a permanent or player, it deals double that damage to that permanent or
 * player instead" and the like, as a static ability of `~` (or of what it's attached to, for "If equipped creature would
 * deal combat damage, it deals double that damage instead"). Null when the line isn't one, or isn't fully understood.
 */
export function parseDamageMod(line: string): StaticAbility | null {
  // Gideon Blackblade: "Prevent all damage that would be dealt to ~ during your turn" is "During your turn, prevent all
  // damage that would be dealt to ~" (damage that can't be prevented is still dealt, rulings).
  if (line === "Prevent all damage that would be dealt to ~ during your turn.") {
    const a = parseDamageMod("During your turn, if a source would deal damage to ~, prevent that damage.");
    return a && { ...a, text: line, mods: a.mods.map((m) => (m.kind === "damageMod" ? { ...m, mod: { ...m.mod, text: line } } : m)) };
  }
  // Camel: "As long as ~ is attacking, prevent all damage Deserts would deal to ~ and to creatures banded with ~": each
  // Desert source's damage (an animated Desert in combat too, rulings) to it and to the other creatures in its attacking
  // band as the damage would be dealt (CR 615.1a, 702.22c), only while it's attacking.
  if (line === "As long as ~ is attacking, prevent all damage Deserts would deal to ~ and to creatures banded with ~.") {
    const a = parseDamageMod("Prevent all damage that would be dealt to ~ by Deserts.");
    const m = a?.mods[0];
    const cond = parseStaticCondition("~ is attacking", { affects: { kind: "self" }, mods: [], text: "" });
    if (!a || a.mods.length !== 1 || m?.kind !== "damageMod" || !m.mod.to?.self || !cond) return null;
    return { ...a, condition: cond, mods: [{ ...m, mod: { ...m.mod, to: { ...m.mod.to, bandedWithHolder: true }, text: line } }], text: line };
  }
  // Personal Sanctuary: "During your turn, prevent all damage that would be dealt to you": only while it's your turn.
  const during = /^During your turn, ([a-z].+)$/.exec(line);
  if (during) {
    const a = parseDamageMod(during[1]!.charAt(0).toUpperCase() + during[1]!.slice(1));
    const m = a?.mods[0];
    if (!a || a.mods.length !== 1 || m?.kind !== "damageMod" || m.mod.while) return null;
    return { ...a, mods: [{ ...m, mod: { ...m.mod, while: { kind: "yourTurn" }, text: line } }], text: line };
  }
  // Lichenthrope, Phytohydra: "If damage would be dealt to ~, put that many -1/-1 (+1/+1) counters on it instead": a
  // replacement, not prevention (rulings: damage that can't be prevented is replaced too; no damage is dealt, so nothing
  // that triggers on damage does), applied once to each source's damage to it (CR 614.1a, 614.5).
  const toCounters = /^If damage would be dealt to (?:~|this creature), put that many ([+-]1\/[+-]1) counters on it instead\.?$/.exec(line);
  if (toCounters) {
    if (toCounters[1] !== "+1/+1" && toCounters[1] !== "-1/-1") return null;
    const mod: DamageMod = { op: "counters", counter: toCounters[1], to: { self: true }, text: line };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  // Soul-Scar Mage: "If a source you control would deal noncombat damage to a creature an opponent controls, put that many
  // -1/-1 counters on that creature instead": a replacement, not prevention (rulings: damage that can't be prevented is
  // replaced too), applied once to each source's damage (CR 614.5), the counters on the creature it would be dealt to; none
  // of it is dealt (no lifelink, deathtouch or "is dealt damage" trigger, CR 614.1a). The creature's controller orders it
  // with other replacement and prevention effects (CR 616.1, rulings).
  const onThat = /^If (.+?) would deal (combat |noncombat )?damage to (a creature .+?), put that many (-1\/-1) counters on that creature instead\.?$/.exec(line);
  if (onThat) {
    const byP = parseBy(onThat[1]!, false);
    const to = byP && parseTo(onThat[3], false);
    if (!byP || byP.attached || !to?.objects || to.players || to.other || to.self || !to.objects.types?.includes("Creature")) return null;
    const mod: DamageMod = { op: "counters", counter: onThat[4]!, onDamaged: true, ...(onThat[2] ? { combat: onThat[2] === "combat " ? ("only" as const) : ("non" as const) } : {}), ...(byP.by ? { by: byP.by } : {}), to, text: line };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  // Undead Alchemist: "If a Zombie you control would deal combat damage to a player, instead that player mills that many
  // cards"; Szadek, Lord of Secrets: "If ~ would deal combat damage to a player, instead put that many +1/+1 counters on ~
  // and that player mills that many cards". Replacements, not prevention (CR 614.1a): none of the damage is dealt (so no
  // lifelink, commander damage or "deals combat damage" trigger), applied once to each source's damage (rulings: two
  // Alchemists mill once), and the damaged player orders them with prevention effects (CR 616.1, rulings on Szadek).
  const toMill = /^If (.+?) would deal combat damage to a player, instead (put that many \+1\/\+1 counters on ~ and )?that player mills that many cards\.?$/.exec(line);
  if (toMill) {
    const byP = parseBy(toMill[1]!, false);
    if (!byP || byP.attached || (toMill[2] && !byP.by?.self)) return null;
    const mod: DamageMod = { op: toMill[2] ? "counters" : "mill", ...(toMill[2] ? { counter: "+1/+1" as const } : {}), mill: true, combat: "only", to: { players: "all" }, ...(byP.by ? { by: byP.by } : {}), text: line };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  // Crumbling Sanctuary: "If damage would be dealt to a player, that player exiles that many cards from the top of their
  // library instead": a replacement, not prevention, like Undead Alchemist's mill (CR 614.1a), from any source, combat or
  // not, to every player; with no cards in the library the damage does nothing (rulings).
  if (line === "If damage would be dealt to a player, that player exiles that many cards from the top of their library instead.") {
    const mod: DamageMod = { op: "mill", mill: true, exileTop: true, to: { players: "all" }, text: line };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  // Well-Laid Plans: "Prevent all damage that would be dealt to a creature by another creature if they share a color":
  // each creature source's damage to each creature (CR 615.1a), compared as the damage would be dealt (CR 609.7b, 105.4:
  // colorless shares no color), never a creature's damage to itself.
  if (line === "Prevent all damage that would be dealt to a creature by another creature if they share a color.") {
    const byP = parseBy("a creature source", false);
    if (!byP?.by) return null;
    const mod: DamageMod = { op: "prevent", prevent: true, by: byP.by, to: { objects: { kind: "object", types: ["Creature"], text: "creature" } }, shareColor: true, text: line };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  // Force Bubble: "If damage would be dealt to you, put that many depletion counters on ~ instead": a replacement, not
  // prevention (rulings: the damage is neither dealt nor prevented), the counters on ~ for each source's damage to you.
  const toCountersYou = /^If damage would be dealt to you, put that many ([a-z]+) counters on ~ instead\.?$/.exec(line);
  if (toCountersYou) {
    const mod: DamageMod = { op: "counters", counter: toCountersYou[1]!, to: { players: "you" }, text: line };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  const text = line
    .replace(/\.$/, "")
    .replace(/^[A-Z][A-Za-z' -]+ — (?=If )/, "")
    // Gideon's Intervention: "Prevent all damage that would be dealt to you and permanents you control by sources with the
    // chosen name" is the same prevention, for each source (CR 615.1a).
    .replace(/^Prevent all damage that would be dealt to you and permanents you control by sources with the chosen name$/, "If a source with the chosen name would deal damage to you or a permanent you control, prevent that damage")
    // Energy Storm: "Prevent all damage that would be dealt by instant and sorcery spells": each such spell's damage to
    // anything, as it would be dealt (CR 615.1a).
    .replace(/^Prevent all damage that would be dealt by instant and sorcery spells$/, "If an instant or sorcery spell would deal damage to a permanent or player, prevent that damage")
    // Glacial Chasm, Solitary Confinement: "Prevent all damage that would be dealt to you" is the same, from any source.
    .replace(/^Prevent all (combat )?damage that would be dealt to you$/, "If a source would deal $1damage to you, prevent that damage")
    // "Prevent all damage that ~ would deal to red creatures" (Indentured Oaf), "... to snow creatures" (Goblin Furrier):
    // each time it would deal damage to one, as that damage would be dealt (CR 615.1a).
    .replace(/^Prevent all (combat )?damage that ~ would deal to ((?:white|blue|black|red|green|snow) creature)s$/, "If ~ would deal $1damage to a $2, prevent that damage")
    // "Prevent all combat damage that would be dealt to ~ by enchanted creatures" (Enchanted Being), "... by creatures
    // with first strike" (Tresserhorn Skyknight), "... by Walls" (Marble Priest): sources as they deal it (CR 609.7b).
    .replace(/^Prevent all (combat )?damage that would be dealt to ~ by creatures with (first strike)$/, "If a creature with $2 would deal $1damage to ~, prevent that damage")
    .replace(/^Prevent all (combat )?damage that would be dealt to ~ by (enchanted creature|Wall|Desert)s$/, "If a $2 would deal $1damage to ~, prevent that damage")
    // Light of Sanction: "Prevent all damage that would be dealt to creatures you control by sources you control": each
    // such source's damage to each such creature, both as the damage would be dealt (CR 615.1a).
    .replace(/^Prevent all damage that would be dealt to creatures you control by sources you control$/, "If a source you control would deal damage to a creature you control, prevent that damage")
    // Wall of Vapor: "Prevent all damage that would be dealt to ~ by creatures it's blocking"; Armored Transport: "... combat
    // damage ... by creatures blocking it": those in combat with it as the damage would be dealt (CR 509.1g, 609.7b).
    .replace(/^Prevent all (combat )?damage that would be dealt to ~ by creatures (it's blocking|blocking it)$/, (_, c: string | undefined, w: string) => `If a creature ${w === "it's blocking" ? "~ is blocking" : "blocking ~"} would deal ${c ?? ""}damage to ~, prevent that damage`)
    // Collective Inferno: "Double all damage that sources you control of the chosen type would deal" is the same, for each
    // source (CR 614.1a).
    .replace(/^Double all damage that sources you control of the chosen type would deal$/, "If a source of the chosen type you control would deal damage, it deals double that damage instead")
    // Mjölnir, Hammer of Thor: "Double all damage equipped creature would deal" (CR 614.1a), to anything.
    .replace(/^Double all damage (equipped|enchanted) creature would deal$/, "If $1 creature would deal damage, it deals double that damage instead")
    // Wolverine, Best There Is: "Double all damage ~ would deal".
    .replace(/^Double all damage ~ would deal$/, "If ~ would deal damage, it deals double that damage instead")
    // Absorbing Man and Titania: "Double all damage that creature sources you control would deal": each creature source's
    // damage, as it would be dealt (CR 614.1a).
    .replace(/^Double all damage that creature sources you control would deal$/, "If a creature source you control would deal damage, it deals double that damage instead")
    // Raphael, the Muscle: "Double all damage that creatures you control with counters on them would deal", each one's.
    .replace(/^Double all damage that creatures you control with counters on them would deal$/, "If a creature you control with a counter on it would deal damage, it deals double that damage instead");
  // Ojer Axonil: "If a red source you control would deal an amount of noncombat damage less than ~'s power to an opponent,
  // that source deals damage equal to ~'s power instead."
  const raise = /^If (.+?) would deal an amount of (combat |noncombat )?damage less than (.+?) to (.+?), that source deals damage equal to \3 instead$/.exec(text);
  if (raise) {
    const byP = parseBy(raise[1]!, false);
    const to = byP && parseTo(raise[4], false);
    const amount = parseCount(raise[3]!, null);
    if (!byP || to === null || !amount) return null;
    const mod: DamageMod = { op: "raiseTo", amount, text: line, ...(raise[2] ? { combat: raise[2] === "combat " ? ("only" as const) : ("non" as const) } : {}), ...(byP.by ? { by: byP.by } : {}), ...(to ? { to } : {}) };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  // Forethought Amulet: "If an instant or sorcery source would deal 3 or more damage to you, it deals 2 damage to you
  // instead": a replacement of that much damage only (rulings: not of damage that's already 2 or 1).
  const setTo = /^If (.+?) would deal (\d+) or more damage to (you), it deals (\d+) damage to you instead$/.exec(text);
  if (setTo) {
    const byP = parseBy(setTo[1]!, false);
    const to = byP && parseTo(setTo[3], false);
    if (!byP || !to || Number(setTo[4]) >= Number(setTo[2])) return null;
    const mod: DamageMod = { op: "setTo", amount: Number(setTo[4]), atLeast: Number(setTo[2]), text: line, ...(byP.by ? { by: byP.by } : {}), to };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  // Divine Presence: "If a source would deal 4 or more damage to a permanent or player, that source deals 3 damage to that
  // permanent or player instead": the same, any source to anything (a replacement, not prevention, rulings).
  // Equal Treatment (for the turn): "If any source would deal 1 or more damage to a permanent or player this turn, it deals 2
  // damage to that permanent or player instead": 1 raised to 2 as well as more lowered to 2.
  const setToAny = /^If (a source|any source) would deal (\d+) or more damage to a permanent or player, (?:that source|it) deals (\d+) damage to that permanent or player instead$/.exec(text);
  if (setToAny) {
    if (Number(setToAny[3]) >= Number(setToAny[2]) && !(setToAny[1] === "any source" && setToAny[2] === "1")) return null;
    const mod: DamageMod = { op: "setTo", amount: Number(setToAny[3]), atLeast: Number(setToAny[2]), text: line };
    return { affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line };
  }
  const OP = "(double that damage|twice that much damage|triple that damage|half that damage, rounded down|that much damage (?:plus|minus) (?:\\d+|X|an amount of damage equal to .+?))";
  const m = new RegExp(
    `^[Ii]f (.+?) would deal (combat |noncombat )?damage(?: to (.+?))?(?: while (.+?))?, (?:(?:it|that source) deals ${OP}(?:,? to (?:that (?:permanent or player|player or permanent|player|creature|permanent)|you|~|equipped creature|enchanted creature))? instead|instead it deals ${OP})(?:, where X is (.+))?$`,
  ).exec(text);
  if (!m) return parsePreventionMod(text, line);
  const [, srcText, combatWord, toText, whileText, op1, op2, xText] = m;
  const opText = (op1 ?? op2)!;
  // An Aura's or Equipment's: the ability is the permanent it's attached to (Inquisitor's Flail: "If another creature would
  // deal combat damage to equipped creature").
  const byP = parseBy(srcText!, !!toText && /^(?:equipped|enchanted) creature$/.test(toText));
  if (!byP) return null;
  const to = parseTo(toText, byP.attached);
  if (to === null) return null;
  const mod: DamageMod = { op: "times", text: line };
  if (/^double|^twice/.test(opText)) mod.n = 2;
  else if (/^triple/.test(opText)) mod.n = 3;
  else if (/^half/.test(opText)) mod.op = "half";
  else {
    const pm = /^that much damage (plus|minus) (.+)$/.exec(opText)!;
    mod.op = pm[1] as "plus" | "minus";
    const eq = /^an amount of damage equal to (.+)$/.exec(pm[2]!);
    if (/^\d+$/.test(pm[2]!)) mod.amount = Number(pm[2]);
    else {
      const what = eq ? eq[1]! : pm[2] === "X" && xText ? xText : undefined;
      const amount = what ? parseCount(what, null) : null;
      if (!amount) return null;
      mod.amount = amount;
    }
  }
  if (xText && mod.amount === undefined) return null;
  if (combatWord) mod.combat = combatWord === "combat " ? "only" : "non";
  if (byP.by) mod.by = byP.by;
  if (to) mod.to = to;
  if (whileText) {
    const cond = parseStaticCondition(whileText, { affects: { kind: "self" }, mods: [], text: "" });
    if (!cond) return null;
    mod.while = cond;
  }
  return { affects: { kind: byP.attached ? "attached" : "self" }, mods: [{ kind: "damageMod", mod }], text: line };
}

/**
 * Prevention effects of permanents that prevent some of each source's damage each time it would be dealt (CR 615.1a):
 * "If a source would deal damage to you, prevent 1 of that damage" (Urza's Armor), "... prevent all but 1 of that
 * damage" (Temple Altisaur), "... prevent half that damage, rounded up" (Gisela), "... prevent that damage" (Rem
 * Karolus), "If a source would deal 3 or less damage to ~, prevent that damage" (Callous Giant). Each applies to each
 * source's damage to each permanent or player separately (rulings on Hedron-Field Purists, Guardian Seraph).
 */
function parsePreventionMod(text: string, line: string): StaticAbility | null {
  const m =
    /^[Ii]f (.+?) would deal (combat |noncombat )?(?:(\d+) or less )?damage to (.+?), prevent (that damage|(\d+|X) of that damage|all but (\d+) of that damage|half that damage, rounded (up|down)|(\d+) damage that spell would deal to that permanent or player)(?:, where X is (.+))?$/.exec(text);
  if (!m) return null;
  const [, srcText, combatWord, atMost, toText, what, nOf, allBut, round, spellN, xText] = m;
  if (spellN && srcText !== "a spell") return null;
  const attached = /^(?:equipped|enchanted) creature$/.test(toText!);
  const byP = parseBy(srcText!.replace(/^an artifact$/, "an artifact source").replace(/^a creature$/, "a creature source"), attached);
  if (!byP) return null;
  const to = parseTo(toText, attached);
  if (to === null) return null;
  const mod: DamageMod = { op: "prevent", prevent: true, text: line };
  if (nOf || spellN) {
    mod.op = "minus";
    if (nOf === "X") {
      const amount = xText ? parseCount(xText, null) : null;
      if (!amount) return null;
      mod.amount = amount;
    } else mod.amount = Number(nOf ?? spellN);
  } else if (xText) return null;
  else if (allBut) [mod.op, mod.n] = ["allBut", Number(allBut)];
  else if (round) {
    mod.op = "half";
    // What's dealt is the rest: half rounded down when half is prevented rounded up.
    if (round === "down") mod.up = true;
  } else if (what !== "that damage") return null;
  if (atMost) mod.atMost = Number(atMost);
  if (combatWord) mod.combat = combatWord === "combat " ? "only" : "non";
  if (byP.by) mod.by = byP.by;
  if (to) mod.to = to;
  return { affects: { kind: byP.attached ? "attached" : "self" }, mods: [{ kind: "damageMod", mod }], text: line };
}

/**
 * A spell's or ability's damage amount replacement for the turn (Effect damageMod): "If a source you control would deal
 * damage this turn, it deals double that damage instead" (Insult), "If a source you control would deal damage this turn
 * to an opponent or a permanent an opponent controls, it deals triple that damage instead" (Isengard Unleashed), "Each
 * time target permanent would deal damage to a permanent or player this turn, ..." (Overblaze), "until your next turn,
 * if a source would deal damage to that player or a permanent that player controls, ..." (Lightning, Army of One).
 * Undefined when the sentence isn't one.
 */
export function parseDamageModSentence(text: string, ctx: Ctx): Effect[] | null | undefined {
  let t = text.replace(/\.$/, "");
  let until: "yourNextTurn" | undefined;
  // Morningtide's Light: "Until your next turn, prevent all damage that would be dealt to you" is the same as "if a
  // source would deal damage to you, prevent that damage" for that long (as Glacial Chasm's static, CR 615.1a).
  const u = /^[Uu]ntil your next turn, (if .+|each time target .+|prevent all damage that would be dealt to you)$/.exec(t);
  if (u) [until, t] = ["yourNextTurn", u[1]!.replace(/^each/, "Each").replace(/^prevent all damage that would be dealt to you$/, "if a source would deal damage to you, prevent that damage")];
  // "The next time a source of your choice would deal damage to you this turn, prevent half that damage, rounded down"
  // (Dark Sphere); "the next time that creature would deal combat damage this turn, it deals double that damage
  // instead" (Impulsive Maneuvers): the next damage event only.
  const next = /^The next time (a source of your choice|that creature|it) would deal (combat )?damage( to you)? this turn, (prevent half that damage, rounded (up|down)|prevent that damage|it deals double that damage instead)$/i.exec(t);
  if (next) {
    const subject = /^(?:that creature|it)$/i.test(next[1]!);
    // "A source of your choice ... prevent that damage" is a prevention rule (prevention.ts), with its riders.
    if (!subject && /^prevent that damage$/i.test(next[4]!)) return undefined;
    // Dazzling Reflection: "that creature" a target before it: a prevention rule about that target (prevention.ts).
    if (!until && subject && !ctx.subjectIt && !ctx.subject && /^that creature$/i.test(next[1]!) && /^prevent that damage$/i.test(next[4]!) && !next[2] && !next[3]) return undefined;
    if (until || (subject && !ctx.subjectIt && !(ctx.subject && /^that creature$/i.test(next[1]!)))) return null;
    const mod: DamageMod = /^it deals/.test(next[4]!) ? { op: "times", n: 2, nextTime: true, text } : next[5] ? { op: "half", prevent: true, ...(next[5] === "down" ? { up: true as const } : {}), nextTime: true, text } : { op: "prevent", prevent: true, nextTime: true, text };
    if (next[2]) mod.combat = "only";
    if (next[3]) mod.to = { players: "you" };
    return [{ type: "damageMod", mod, ...(subject ? { bySubject: true as const } : { choose: { kind: "object" as const, text: "source" } }) }];
  }
  // Kill-Suit Cultist: "The next time damage would be dealt to target creature this turn, destroy that creature instead": a
  // replacement of the next damage event to it (not prevention: rulings, the damage isn't dealt and nothing that would
  // happen because of it does; damage that can't be prevented is replaced too).
  if (/^The next time damage would be dealt to target creature this turn, destroy that creature instead$/.test(t)) {
    if (until) return null;
    const toTarget = addTarget(ctx, { kind: "object", types: ["Creature"], text: "target creature" });
    return [{ type: "damageMod", mod: { op: "destroy", nextTime: true, text }, toTarget }];
  }
  // "That source deals that damage to you instead" (Jade Monolith) is a redirection (prevention.ts), not an amount.
  if (/, (?:it|that source) deals that damage to .+ instead$/.test(t)) return undefined;
  if (!/would deal (?:combat |noncombat |1 or more )?damage\b.*, (?:it|that source) deals |would deal .*, instead it deals /.test(t) && !(until && t === "if a source would deal damage to you, prevent that damage")) return undefined;
  if (!until) {
    if (!/ this turn(?=,| to )/.test(t)) return undefined;
    t = t.replace(/ this turn(?=,| to )/, "");
  } else if (/ this turn\b/.test(t)) return null;
  let byTarget: number | undefined;
  const each = /^Each time target (permanent|creature) would deal (.+)$/.exec(t);
  if (each) {
    const spec = parseTargetPhrase(each[1]!);
    if (spec?.kind !== "object") return null;
    byTarget = addTarget(ctx, spec);
    t = `If a source would deal ${each[2]}`;
  }
  let toPlayer = false;
  if (/ to that player or a permanent that player controls,/.test(t)) {
    if (!ctx.eventPlayer) return null;
    toPlayer = true;
    t = t.replace(/ to that player or a permanent that player controls,/, ",");
  }
  // "a player or battle" (Rankle and Torbran): battles are permanents too.
  t = t.replace(/ to a player or battle,/, " to a player or battle permanent,");
  // Taii Wakeen, Perfect Shot: "{X}, {T}: If a source you control would deal noncombat damage to a permanent or player this
  // turn, it deals that much damage plus X instead": the X paid as it was activated (CR 107.3a), counted as it resolves.
  const plusX = ctx.activated && / that much damage plus X instead$/.test(t);
  if (plusX) t = t.replace(/ that much damage plus X instead$/, " that much damage plus 1 instead");
  const st = parseDamageMod(t.replace(/^if /, "If "));
  if (plusX && st?.mods[0]?.kind === "damageMod") st.mods[0].mod.amount = { count: { kind: "x" } };
  const m = st?.mods[0];
  if (!st || st.affects.kind !== "self" || m?.kind !== "damageMod" || m.mod.by?.self || m.mod.to?.self || m.mod.while || ["enchanted", "chosen"].includes(m.mod.to?.players ?? "")) return null;
  const mod: DamageMod = { ...m.mod, text };
  return [{ type: "damageMod", mod, ...(until ? { until } : {}), ...(byTarget !== undefined ? { byTarget } : {}), ...(toPlayer ? { toPlayer: { ref: "eventPlayer" } } : {}) }];
}
