import type { CopyExcept } from "../copies";
import type { Amount, CounterKind, ActivatedAbility, TriggeredAbility, StaticAbility, Effect, ObjRef, AdditionalCost, TargetSpec, TokenSpec, PayCost, CastFromGraveyard, AltCostKind, EntersOption } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import { parseManaCost } from "../mana";
import type { CardDef, FaceDownKind } from "../types";
import { NUM, num, keywordOf, plainMana, sacrificeSelf, pumpSelf, BASIC_TYPES, capital, singular, singularWord } from "./words";
import { parsePayCost } from "./body";
import { parseSearchFilter } from "./search";
import { parseTargetPhrase } from "./targets";

/** "sacrifice a creature", "discard a card", "pay 3 life", "exile a creature card from your graveyard". */
/**
 * Keywords about casting from a graveyard and what happens to the spell after: flashback
 * (CR 702.34), jump-start (702.133), retrace (702.81), escape (702.138), buyback (702.27),
 * rebound (702.88), unearth (702.84). Null if the line is none of these.
 */
export function parseGraveyardKeyword(
  line: string,
  d: CardDef,
): { fromGraveyard: CastFromGraveyard } | { buyback: string } | { rebound: true } | { escapesWith: number } | { unearth: ActivatedAbility } | "fail" | null {
  const isSpell = d.types.includes("Instant") || d.types.includes("Sorcery");
  let m: RegExpExecArray | null;
  if ((m = /^(Flashback|Escape)(?: |—)(.+?)\.?$/.exec(line))) {
    const kind = m[1] === "Flashback" ? "flashback" : "escape";
    if (kind === "flashback" && !isSpell) return "fail";
    const parts = m[2]!.split(", ");
    const mana = /^(\{[^}]+\})+$/.test(parts[0]!) ? parts.shift()! : undefined;
    if (mana && (!parseManaCost(mana).supported || parseManaCost(mana).hasX)) return "fail";
    const costs: AdditionalCost[] = [];
    for (const part of parts) {
      // Escape's "Exile two other cards from your graveyard": other than this card, which is on the stack by then.
      const c = parseAdditionalCost(part.replace(/^Exile (\w+) other /, "exile $1 "));
      if (!c) return "fail";
      costs.push(c);
    }
    return { fromGraveyard: { kind, ...(mana ? { mana } : {}), costs, exile: kind === "flashback" } };
  }
  if (/^Jump-start$/.test(line)) return isSpell ? { fromGraveyard: { kind: "jumpStart", costs: [{ kind: "discard", n: 1 }], exile: true } } : "fail";
  if (/^Retrace$/.test(line)) return { fromGraveyard: { kind: "retrace", costs: [{ kind: "discard", n: 1, filter: { kind: "card", types: ["Land"], text: "land card" } }], exile: false } };
  if (/^Rebound$/.test(line)) return isSpell ? { rebound: true } : "fail";
  if ((m = /^Buyback ((?:\{[^}]+\})+)$/.exec(line))) return isSpell && parseManaCost(m[1]!).supported && !parseManaCost(m[1]!).hasX ? { buyback: m[1]! } : "fail";
  if ((m = new RegExp(`^~ escapes with ${NUM} \\+1/\\+1 counters? on it\\.$`).exec(line))) return { escapesWith: num(m[1]!) };
  if ((m = /^Unearth ((?:\{[^}]+\})+)$/.exec(line))) {
    if (!parseManaCost(m[1]!).supported || parseManaCost(m[1]!).hasX) return "fail";
    return {
      unearth: {
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        body: { targets: [], effects: [{ type: "unearth" }], text: "Return ~ from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield." },
        text: `Unearth ${m[1]}`,
      },
    };
  }
  return null;
}

/**
 * Keywords about costs: echo (CR 702.30), cumulative upkeep (702.24), evoke (702.74), dash (702.109),
 * delve (702.66), living weapon (702.92) and For Mirrodin! (702.163), scavenge (702.97), bestow (702.103), madness (702.35),
 * suspend (702.62), casualty (702.153), dredge (702.52), plot (702.170), blitz (702.152), warp (702.185).
 */
export function parseCostKeyword(
  line: string,
  d: CardDef,
): {
  alt?: { kind: AltCostKind; mana: string; costs?: AdditionalCost[] };
  trigger?: TriggeredAbility;
  activated?: ActivatedAbility;
  delve?: true;
  assist?: true;
  faceDown?: { kind: FaceDownKind; cost: string };
  madness?: string;
  suspend?: { n: number; cost: string };
  plot?: string;
  casualty?: number;
  dredge?: number;
} | "fail" | null {
  let m: RegExpExecArray | null;
  // "You may pay {W}{U}{B}{R}{G} rather than pay ~'s mana cost" (Bringers), "You may pay {1} and return a basic land you
  // control to its owner's hand rather than pay ~'s mana cost" (Borderposts): an alternative cost (CR 118.9). The returned
  // land may be one just tapped for mana (rulings: mana abilities come before costs are paid, CR 601.2g-h).
  if ((m = /^You may pay ((?:\{[^}]+\})+)( and return a basic land you control to its owner's hand)? rather than pay ~'s mana cost\.?$/.exec(line)))
    return plainMana(m[1]!)
      ? { alt: { kind: "alternative", mana: m[1]!, ...(m[2] ? { costs: [{ kind: "returnToHand", filter: { kind: "object", types: ["Land"], supertypes: ["Basic"], controller: "you", text: "basic land you control" }, n: 1 }] } : {}) } }
      : "fail";
  // Bestow (CR 702.103a); "Bestow—{R}, Collect evidence 6" isn't modeled. (Cast bestowed, the card is an Aura: see bestowedDef.)
  if ((m = /^Bestow(?: |—)(.+?)\.?$/.exec(line))) return /^(\{[^}]+\})+$/.test(m[1]!) && plainMana(m[1]!) ? { alt: { kind: "bestow", mana: m[1]! } } : "fail";
  // Madness (CR 702.35a): "Madness—{1}{B}, Pay 1 life" and X madness costs aren't modeled.
  if ((m = /^Madness(?: |—)(.+?)\.?$/.exec(line))) return /^(\{[^}]+\})+$/.test(m[1]!) && plainMana(m[1]!) ? { madness: m[1]! } : "fail";
  // Suspend N—[cost] (CR 702.62a); "Suspend X—{X}{U}. X can't be 0." isn't modeled.
  if ((m = /^Suspend (\d+)—((?:\{[^}]+\})+)$/.exec(line))) return plainMana(m[2]!) ? { suspend: { n: Number(m[1]), cost: m[2]! } } : "fail";
  if (/^Suspend\b/.test(line)) return "fail";
  // Casualty N (CR 702.153a): an optional additional cost, and "when you cast this spell, if a casualty cost was paid
  // for it, copy it. If the spell has any targets, you may choose new targets for the copy."
  if ((m = /^Casualty (\d+)$/.exec(line))) {
    return {
      casualty: Number(m[1]),
      trigger: { event: "selfCast", ifCasualty: true, body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "Casualty: copy ~. You may choose new targets for the copy." } },
    };
  }
  if (/^Casualty\b/.test(line)) return "fail";
  // Dredge N (CR 702.52a).
  if ((m = /^Dredge (\d+)$/.exec(line))) return { dredge: Number(m[1]) };
  // Morph, megamorph, disguise (CR 702.37, 702.168): costs other than mana ("Reveal a blue card") aren't modeled.
  if ((m = /^(Morph|Megamorph|Disguise)(?: |—)(.+?)\.?$/.exec(line))) {
    const cost = m[2]!;
    if (!/^(\{[^}]+\})+$/.test(cost) || !plainMana(cost)) return "fail";
    return { faceDown: { kind: m[1]!.toLowerCase() as FaceDownKind, cost } };
  }
  if ((m = /^Echo(?: |—)(.+?)\.?$/.exec(line))) {
    const cost = m[1]!;
    if (!/^(\{[^}]+\})+$/.test(cost) || !plainMana(cost)) return "fail"; // "Echo—Discard a card." isn't modeled
    const text = `Echo ${cost}: at the beginning of your upkeep, if ~ came under your control since the beginning of your last upkeep, sacrifice it unless you pay ${cost}.`;
    return {
      trigger: {
        event: "yourUpkeep",
        ifEcho: true,
        body: { targets: [], effects: [{ type: "may", effects: [], pay: { mana: cost }, otherwise: [sacrificeSelf], keep: true, text: `Pay echo ${cost} to keep ~` }], text },
      },
    };
  }
  if ((m = /^Cumulative upkeep(?: |—)(.+?)\.?$/.exec(line))) {
    const raw = m[1]!.replace(/^Pay /, "");
    const pay = parsePayCost(raw);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return "fail"; // "{G} or {W}", "Sacrifice a creature", ...
    const what = describePayText(pay);
    return {
      trigger: {
        event: "yourUpkeep",
        body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay }], text: `Cumulative upkeep ${what}: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you pay ${what} for each age counter on it.` },
      },
    };
  }
  // Plot [cost] (CR 702.170a): exile it from your hand as a special action, cast it free on a later turn.
  if ((m = /^Plot ((?:\{[^}]+\})+)$/.exec(line))) return plainMana(m[1]!) && !d.types.includes("Land") ? { plot: m[1]! } : "fail";
  if (/^Plot\b/.test(line)) return "fail";
  // Blitz [cost] (CR 702.152a) and warp [cost] (CR 702.185a): alternative costs that send the permanent away at the next
  // end step. "Blitz—{2}{B}{B}, Discard a card" and "Warp—{B}, Pay 2 life" aren't modeled.
  if ((m = /^(Blitz|Warp)(?: |—)(.+?)\.?$/.exec(line))) {
    const mana = m[2]!;
    if (!/^(\{[^}]+\})+$/.test(mana) || !plainMana(mana)) return "fail";
    if (m[1] === "Blitz") return d.types.includes("Creature") ? { alt: { kind: "blitz", mana } } : "fail";
    return d.types.some((ty) => ["Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"].includes(ty)) ? { alt: { kind: "warp", mana } } : "fail";
  }
  if ((m = /^(Evoke|Dash) ((?:\{[^}]+\})+)$/.exec(line))) {
    const mana = m[2]!;
    if (!plainMana(mana)) return "fail";
    if (m[1] === "Dash") return d.types.includes("Creature") ? { alt: { kind: "dash", mana } } : "fail";
    return {
      alt: { kind: "evoke", mana },
      trigger: { event: "selfEnters", ifEvoked: true, body: { targets: [], effects: [sacrificeSelf], text: "When ~ enters, if its evoke cost was paid, its controller sacrifices it." } },
    };
  }
  if (line === "Delve") return { delve: true };
  if (line === "Assist") return { assist: true }; // CR 702.132a
  if (line === "Living weapon") {
    if (!d.subtypes.includes("Equipment")) return "fail";
    const germ: TokenSpec = { name: "Phyrexian Germ", power: 0, toughness: 0, colors: ["B"], types: ["Creature"], subtypes: ["Phyrexian", "Germ"], keywords: [] };
    return {
      trigger: {
        event: "selfEnters",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n: 1, token: germ },
            { type: "attach", what: { ref: "created" } },
          ],
          text: "Living weapon: when ~ enters, create a 0/0 black Phyrexian Germ creature token, then attach ~ to it.",
        },
      },
    };
  }
  if (line === "For Mirrodin!") {
    // CR 702.163a: "When this Equipment enters, create a 2/2 red Rebel creature token, then attach this Equipment to it."
    if (!d.subtypes.includes("Equipment")) return "fail";
    const rebel: TokenSpec = { name: "Rebel", power: 2, toughness: 2, colors: ["R"], types: ["Creature"], subtypes: ["Rebel"], keywords: [] };
    return {
      trigger: {
        event: "selfEnters",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n: 1, token: rebel },
            { type: "attach", what: { ref: "created" } },
          ],
          text: "For Mirrodin!: when ~ enters, create a 2/2 red Rebel creature token, then attach ~ to it.",
        },
      },
    };
  }
  // Embalm and eternalize (CR 702.128, 702.129): exile it from your graveyard to create a token copy of it.
  if ((m = /^(Embalm|Eternalize) ((?:\{[^}]+\})+)$/.exec(line))) {
    const cost = m[2]!;
    if (!plainMana(cost)) return "fail";
    const embalm = m[1] === "Embalm";
    const except: CopyExcept = embalm ? { colors: ["W"], addSubtypes: ["Zombie"], noManaCost: true } : { pt: [4, 4], colors: ["B"], addSubtypes: ["Zombie"], noManaCost: true };
    return {
      activated: {
        manaCost: cost,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        exileSelf: true,
        body: {
          targets: [],
          effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "self" }, except, ofSource: true }],
          text: `Create a token that's a copy of ~, except it's a ${embalm ? "white" : "4/4 black"} Zombie ${d.subtypes.join(" ")} with no mana cost.`,
        },
        text: `${m[1]} ${cost}`,
      },
    };
  }
  if ((m = /^Scavenge ((?:\{[^}]+\})+)$/.exec(line))) {
    const cost = m[1]!;
    if (!plainMana(cost) || !/^\d+$/.test(d.power ?? "")) return "fail";
    const n = Number(d.power);
    return {
      activated: {
        manaCost: cost,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        exileSelf: true,
        body: {
          targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
          effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n }],
          text: `Put ${n} +1/+1 counter${n === 1 ? "" : "s"} on target creature.`,
        },
        text: `Scavenge ${cost}`,
      },
    };
  }
  return null;
}

/** "{1}", "1 life", "{B} and 1 life", "{E}", as printed in a cost. */
function describePayText(pay: PayCost): string {
  return [pay.mana, pay.life ? `${pay.life} life` : "", pay.energy ? "{E}".repeat(pay.energy) : ""].filter(Boolean).join(" and ");
}

export function parseAdditionalCost(text: string): AdditionalCost | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^sacrifice ${NUM} (.+)$`, "i").exec(text))) {
    const n = num(m[1]!);
    const phrase = n === 1 ? m[2]! : m[2]!.split(" ").map(singularWord).join(" ");
    const spec = parseTargetPhrase(phrase);
    if (spec?.kind !== "object" || spec.controller || spec.combat) return null;
    return { kind: "sacrifice", filter: { ...spec, text: m[2]! }, n };
  }
  if ((m = new RegExp(`^discard ${NUM} cards?$`, "i").exec(text))) return { kind: "discard", n: num(m[1]!) };
  if ((m = /^pay (\d+) life$/i.exec(text))) return { kind: "payLife", n: Number(m[1]) };
  if ((m = new RegExp(`^exile ${NUM} (.+?) from your graveyard$`, "i").exec(text))) {
    const filter = parseSearchFilter(m[2]!);
    if (filter === null) return null;
    return { kind: "exileFromGraveyard", n: num(m[1]!), ...(filter ? { filter } : {}) };
  }
  return null;
}

/**
 * A line of keywords where some are abilities in their own right: "Prowess", "Ward {2}",
 * "Cycling {1}{U}", "Crew 3", "Convoke", possibly mixed with simple keywords ("Flying, ward {2}").
 * Returns what they add, or null if any part isn't one we support.
 */
interface KeywordParts {
  triggers: TriggeredAbility[];
  activated: ActivatedAbility[];
  convoke: boolean;
  improvise: boolean;
  affinity: TargetSpec[];
  /** Modular N's "enters with N +1/+1 counters" (CR 702.43a). */
  plusCounters: number;
  bloodthirst: number;
  entersOptions: EntersOption[];
  statics: StaticAbility[];
  /** Fading N's fade counters, vanishing N's time counters (CR 702.32a, 702.63a). */
  entersCounter?: { counter: CounterKind; n: number };
  devour?: { n: number; filter: TargetSpec };
  /** Sunburst (CR 702.44a); "Modular—Sunburst" always means +1/+1 counters (702.44c). */
  sunburst?: { counter?: "+1/+1" };
  amplify?: number;
  enlist?: boolean;
}

/** CR 702.189a: "Whenever this creature attacks, add N {R}. Until end of combat, you don't lose this mana as steps and phases end." */
export function firebending(n: Amount, text: string): TriggeredAbility {
  const add = typeof n === "number" ? "{R}".repeat(n) : "X {R}";
  return { event: "selfAttacks", body: { targets: [], effects: [{ type: "addCombatMana", n }], text: `${text.charAt(0).toUpperCase()}${text.slice(1)}: add ${add}. Until end of combat, you don't lose this mana as steps and phases end.` } };
}

export function keywordAbilities(line: string, d: CardDef): KeywordParts | null {
  const out: KeywordParts = { triggers: [], activated: [], convoke: false, improvise: false, affinity: [], plusCounters: 0, bloodthirst: 0, entersOptions: [], statics: [] };
  const plus = (n: number, what: ObjRef = { ref: "self" }): Effect => ({ type: "counters", what, counter: "+1/+1", n });
  for (const raw of line.split(/[,;]\s*/)) {
    const p = raw.trim();
    let m: RegExpExecArray | null;
    if (keywordOf(p)) continue;
    if (/^prowess$/i.test(p)) {
      // CR 702.108a: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn."
      out.triggers.push({
        event: "castSpell",
        cast: { by: "you", spell: { kind: "spell", notTypes: ["Creature"], text: "noncreature spell" } },
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: 1, toughness: 1 }], duration: "endOfTurn" }], text: "Prowess: ~ gets +1/+1 until end of turn." },
      });
    } else if (/^extort$/i.test(p)) {
      // CR 702.101a: "Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you
      // gain life equal to the total life lost this way." Each instance triggers separately (702.101b).
      const drain: Effect = { type: "loseLife", who: { ref: "eachOpponent" }, n: 1, drain: true };
      out.triggers.push({
        event: "castSpell",
        cast: { by: "you", spell: { kind: "spell", text: "spell" } },
        body: { targets: [], effects: [{ type: "may", effects: [drain], pay: { mana: "{W/B}" }, text: "pay {W/B}. If you do, each opponent loses 1 life and you gain that much life" }], text: "Extort: you may pay {W/B}. If you do, each opponent loses 1 life and you gain life equal to the total life lost this way." },
      });
    } else if (/^convoke$/i.test(p)) out.convoke = true;
    else if (/^improvise$/i.test(p)) out.improvise = true;
    else if (/^storm$/i.test(p)) {
      // CR 702.40a: "When you cast this spell, copy it for each other spell that was cast before it this turn. If the
      // spell has any targets, you may choose new targets for any of the copies."
      out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "storm", newTargets: true }], text: "Storm: copy ~ for each other spell cast before it this turn." } });
    } else if (/^cascade$/i.test(p)) {
      // CR 702.85a: "When you cast this spell, exile cards from the top of your library until you exile a nonland card
      // whose mana value is less than this spell's mana value. You may cast that card without paying its mana cost if
      // the resulting spell's mana value is less than this spell's mana value. Then put all cards exiled this way that
      // weren't cast on the bottom of your library in a random order." Each instance triggers (CR 702.85c).
      out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "cascade" }], text: "Cascade: exile cards from the top of your library until you exile a cheaper nonland card. You may cast it without paying its mana cost." } });
    }
    else if ((m = /^affinity for (\w+)$/i.exec(p))) {
      // CR 702.41a: "This spell costs {1} less to cast for each [text] you control."
      const spec = parseTargetPhrase(singular(m[1]!));
      if (spec?.kind !== "object") return null;
      out.affinity.push({ ...spec, controller: "you", text: `${m[1]} you control` });
    }
    else if (/^toxic \d+$/i.test(p)) continue; // a static ability, read from the keywords (see textKeywords)
    else if (/^exalted$/i.test(p)) {
      // CR 702.83a: "Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn."
      // Each instance triggers separately (CR 702.83a).
      out.triggers.push({
        event: "creatureYouControlAttacksAlone",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "modifyPT", power: 1, toughness: 1 }], duration: "endOfTurn" }], text: "Exalted: that creature gets +1/+1 until end of turn." },
      });
    }
    else if (/^melee$/i.test(p)) {
      // CR 702.121a: "Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked
      // with a creature this combat." Each instance triggers separately (702.121b).
      const n = { count: { kind: "opponentsAttacked" as const } };
      out.triggers.push({ event: "selfAttacks", body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: n, toughness: n }], duration: "endOfTurn" }], text: "Melee: ~ gets +1/+1 until end of turn for each opponent you attacked with a creature this combat." } });
    } else if ((m = /^bushido (\d+)$/i.exec(p))) {
      // CR 702.45a: "Whenever this creature blocks or becomes blocked, it gets +N/+N until end of turn."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfBlocksOrBecomesBlocked", body: { targets: [], effects: [pumpSelf(n, n)], text: `Bushido ${n}: ~ gets +${n}/+${n} until end of turn.` } });
    } else if (/^flanking$/i.test(p)) {
      // CR 702.25a: "Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn."
      out.triggers.push({
        event: "selfBlockedByCreature",
        subjectFilter: { kind: "object", types: ["Creature"], notKeywords: ["Flanking"], text: "creature without flanking" },
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "modifyPT", power: -1, toughness: -1 }], duration: "endOfTurn" }], text: "Flanking: the blocking creature gets -1/-1 until end of turn." },
      });
    } else if ((m = /^rampage (\d+)$/i.exec(p))) {
      // CR 702.23a: "Whenever this creature becomes blocked, it gets +N/+N until end of turn for each creature blocking it beyond the first."
      const n = Number(m[1]);
      out.triggers.push({
        event: "selfBecomesBlocked",
        body: { targets: [], effects: [{ type: "pumpPerBlocker", what: { ref: "self" }, power: n, toughness: n, beyondFirst: true }], text: `Rampage ${n}: ~ gets +${n}/+${n} until end of turn for each creature blocking it beyond the first.` },
      });
    } else if (/^(persist|undying)$/i.test(p)) {
      // CR 702.79a / 702.93a: "When this permanent is put into a graveyard from the battlefield, if it had no
      // -1/-1 (+1/+1) counters on it, return it to the battlefield under its owner's control with a -1/-1 (+1/+1) counter on it."
      const counter = /^persist$/i.test(p) ? "-1/-1" : "+1/+1";
      out.triggers.push({
        event: "selfDies",
        ifNoCounter: counter,
        body: { targets: [], effects: [{ type: "returnToBattlefield", counter }], text: `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}: return ~ to the battlefield with a ${counter} counter on it.` },
      });
    } else if ((m = /^renown (\d+)$/i.exec(p))) {
      // CR 702.112a: "When this creature deals combat damage to a player, if it isn't renowned, put N +1/+1
      // counters on it and it becomes renowned."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfDealsCombatDamageToPlayer", ifNotRenowned: true, body: { targets: [], effects: [{ type: "renown", n }], text: `Renown ${n}: if ~ isn't renowned, put ${n} +1/+1 counter${n > 1 ? "s" : ""} on it and it becomes renowned.` } });
    } else if ((m = /^fabricate (\d+)$/i.exec(p))) {
      // CR 702.123a: "When this permanent enters, you may put N +1/+1 counters on it. If you don't, create N 1/1 colorless Servo artifact creature tokens."
      const n = Number(m[1]);
      const servo: TokenSpec = { name: "Servo", power: 1, toughness: 1, colors: [], types: ["Artifact", "Creature"], subtypes: ["Servo"], keywords: [] };
      out.triggers.push({
        event: "selfEnters",
        body: {
          targets: [],
          effects: [{ type: "may", effects: [plus(n)], text: `put ${n} +1/+1 counter${n > 1 ? "s" : ""} on ~ (otherwise create ${n} Servo${n > 1 ? "s" : ""})`, otherwise: [{ type: "createToken", who: { ref: "you" }, n, token: servo }] }],
          text: `Fabricate ${n}: put ${n} +1/+1 counter${n > 1 ? "s" : ""} on ~ or create ${n} 1/1 Servo${n > 1 ? "s" : ""}.`,
        },
      });
    } else if ((m = /^graft (\d+)$/i.exec(p))) {
      // CR 702.58a: "This permanent enters with N +1/+1 counters on it" and "Whenever another creature enters, if this
      // permanent has a +1/+1 counter on it, you may move a +1/+1 counter from this permanent onto that creature."
      out.plusCounters += Number(m[1]);
      const text = "move a +1/+1 counter from ~ onto that creature";
      out.triggers.push({
        event: "permanentEnters",
        enters: { filter: { kind: "object", types: ["Creature"], text: "creature" }, other: true },
        ifCond: { kind: "selfCounter", counter: "+1/+1" },
        body: { targets: [], effects: [{ type: "may", effects: [{ type: "moveCounter", counter: "+1/+1", from: { ref: "self" }, to: { ref: "subject" } }], text }], text: `Graft: you may ${text}.` },
      });
    } else if ((m = /^modular(?: (\d+)|—(sunburst))$/i.exec(p))) {
      // CR 702.43a: "This permanent enters with N +1/+1 counters on it" and "When this permanent is put into a graveyard
      // from the battlefield, you may put a +1/+1 counter on target artifact creature for each +1/+1 counter on this permanent."
      // "Modular—Sunburst": a +1/+1 counter for each color of mana spent to cast it instead (CR 702.44c).
      if (m[2]) {
        if (out.sunburst) return null;
        out.sunburst = { counter: "+1/+1" };
      } else out.plusCounters += Number(m[1]);
      const text = "put a +1/+1 counter on target artifact creature for each +1/+1 counter on ~";
      out.triggers.push({
        event: "selfToGraveyard",
        body: {
          targets: [{ kind: "object", allTypes: ["Artifact", "Creature"], text: "target artifact creature" }],
          effects: [{ type: "may", effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: 1, perLastKnownCounter: "+1/+1" }], text }],
          text: `Modular: you may ${text}.`,
        },
      });
    } else if ((m = /^amplify (\d+)$/i.exec(p))) {
      // CR 702.38a; two instances would each work separately (702.38b): not modeled.
      if (out.amplify) return null;
      out.amplify = Number(m[1]);
    } else if (/^sunburst$/i.test(p)) {
      // CR 702.44a: "If this object is entering as a creature, ignoring any type-changing effects that would affect it, it
      // enters with a +1/+1 counter on it for each color of mana spent to cast it. Otherwise, it enters with a charge
      // counter on it for each color of mana spent to cast it." Two instances would each work (702.44d): not modeled.
      if (out.sunburst) return null;
      out.sunburst = {};
    } else if ((m = /^afflict (\d+)$/i.exec(p))) {
      // CR 702.130a: "Whenever this creature becomes blocked, defending player loses N life."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfBecomesBlocked", body: { targets: [], effects: [{ type: "loseLife", who: { ref: "eventPlayer" }, n }], text: `Afflict ${n}: defending player loses ${n} life.` } });
    } else if ((m = /^annihilator (\d+)$/i.exec(p))) {
      // CR 702.86a: "Whenever this creature attacks, defending player sacrifices N permanents of their choice."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfAttacks", body: { targets: [], effects: [{ type: "pick", who: { ref: "eventPlayer" }, filter: { kind: "object", text: "permanent" }, n, action: "sacrifice" }], text: `Annihilator ${n}: defending player sacrifices ${n} permanent${n === 1 ? "" : "s"}.` } });
    } else if (/^ingest$/i.test(p)) {
      // CR 702.115a: "Whenever this creature deals combat damage to a player, that player exiles the top card of their library."
      out.triggers.push({ event: "selfDealsCombatDamageToPlayer", body: { targets: [], effects: [{ type: "exileTop", who: { ref: "eventPlayer" }, n: 1 }], text: "Ingest: that player exiles the top card of their library." } });
    } else if (/^dethrone$/i.test(p)) {
      // CR 702.105a: "Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on this creature."
      out.triggers.push({ event: "selfAttacks", attacksMostLife: true, body: { targets: [], effects: [plus(1)], text: "Dethrone: put a +1/+1 counter on ~." } });
    } else if (/^enlist$/i.test(p)) {
      // CR 702.154a: "As this creature attacks, you may tap up to one untapped creature you control that you didn't
      // choose to attack with and that either has haste or has been under your control continuously since this turn
      // began. When you do, this creature gets +X/+0 until end of turn, where X is the tapped creature's power."
      // Each instance works on its own (702.154d): not modeled.
      if (out.enlist) return null;
      out.enlist = true;
      out.triggers.push({
        event: "selfEnlists",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: { count: { kind: "power", of: { ref: "subject" } } }, toughness: 0 }], duration: "endOfTurn" }], text: "Enlist: ~ gets +X/+0 until end of turn, where X is the enlisted creature's power." },
      });
    } else if (/^training$/i.test(p)) {
      // CR 702.149a: "Whenever this creature and at least one other creature with power greater than this
      // creature's power attack, put a +1/+1 counter on this creature."
      out.triggers.push({ event: "selfAttacks", training: true, body: { targets: [], effects: [plus(1)], text: "Training: put a +1/+1 counter on ~." } });
    } else if ((m = /^fading (\d+)$/i.exec(p))) {
      // CR 702.32a: "This permanent enters with N fade counters on it" and "At the beginning of your upkeep,
      // remove a fade counter from this permanent. If you can't, sacrifice the permanent."
      if (out.entersCounter) return null;
      out.entersCounter = { counter: "fade", n: Number(m[1]) };
      out.triggers.push({ event: "yourUpkeep", body: { targets: [], effects: [{ type: "removeSelfCounter", counter: "fade", orSacrifice: true }], text: "Fading: remove a fade counter from ~. If you can't, sacrifice it." } });
    } else if ((m = /^vanishing(?: (\d+))?$/i.exec(p))) {
      // CR 702.63a-b: "This permanent enters with N time counters on it," "At the beginning of your upkeep, if this
      // permanent has a time counter on it, remove a time counter from it," and "When the last time counter is
      // removed from this permanent, sacrifice it."
      if (m[1]) {
        if (out.entersCounter) return null;
        out.entersCounter = { counter: "time", n: Number(m[1]) };
      }
      out.triggers.push({
        event: "yourUpkeep",
        ifCond: { kind: "selfCounter", counter: "time" },
        body: { targets: [], effects: [{ type: "removeSelfCounter", counter: "time" }], text: "Vanishing: if ~ has a time counter on it, remove a time counter from it." },
      });
      out.triggers.push({ event: "selfLastTimeCounterRemoved", body: { targets: [], effects: [sacrificeSelf], text: "Vanishing: when the last time counter is removed from ~, sacrifice it." } });
    } else if (/^evolve$/i.test(p)) {
      // CR 702.100a
      out.triggers.push({ event: "anotherCreatureYouControlEnters", ifEvolves: true, body: { targets: [], effects: [{ type: "evolve" }], text: "Evolve: if that creature is bigger, put a +1/+1 counter on ~." } });
    } else if (/^battle cry$/i.test(p)) {
      // CR 702.91a: "Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn."
      out.triggers.push({
        event: "selfAttacks",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "allCreatures", other: true, attacking: true }, mods: [{ kind: "modifyPT", power: 1, toughness: 0 }], duration: "endOfTurn" }], text: "Battle cry: each other attacking creature gets +1/+0 until end of turn." },
      });
    } else if ((m = /^firebending (\d+)$/i.exec(p))) {
      out.triggers.push(firebending(Number(m[1]), p));
    } else if (/^provoke$/i.test(p)) {
      // CR 702.39a: "Whenever this creature attacks, you may choose to have target creature defending player controls
      // block this creature this combat if able. If you do, untap that creature." Each instance triggers (702.39b).
      const it: ObjRef = { ref: "target", index: 0 };
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [{ kind: "object", types: ["Creature"], controller: "eventPlayer", text: "target creature defending player controls" }],
          effects: [{ type: "may", effects: [{ type: "mustBlockSource", what: it }, { type: "untap", what: it }], text: "have target creature defending player controls block ~ this combat if able and untap it" }],
          text: "Provoke: you may have target creature defending player controls untap and block ~ if able.",
        },
      });
    } else if (/^mentor$/i.test(p)) {
      // CR 702.134a: "Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power."
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [{ kind: "object", types: ["Creature"], combat: "attacking", lesserPowerThanSource: true, text: "target attacking creature with lesser power" }],
          effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: 1 }],
          text: "Mentor: put a +1/+1 counter on target attacking creature with lesser power.",
        },
      });
    } else if (/^exploit$/i.test(p)) {
      // CR 702.110a: "When this creature enters, you may sacrifice a creature."
      out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "exploit" }], text: "Exploit: you may sacrifice a creature." } });
    } else if (/^soulbond$/i.test(p)) {
      // CR 702.95a: "When this creature enters, if you control both this creature and another creature and both are
      // unpaired, you may pair this creature with another unpaired creature you control for as long as both remain
      // creatures on the battlefield under your control" and "Whenever another creature you control enters, if you
      // control both that creature and this one and both are unpaired, you may pair that creature with this creature
      // for as long as both remain creatures on the battlefield under your control."
      out.triggers.push({ event: "selfEnters", ifSoulbond: true, body: { targets: [], effects: [{ type: "soulbond" }], text: "Soulbond: you may pair ~ with another unpaired creature you control." } });
      out.triggers.push({ event: "anotherCreatureYouControlEnters", ifSoulbond: true, body: { targets: [], effects: [{ type: "soulbond" }], text: "Soulbond: you may pair that creature with ~." } });
    } else if (/^riot$/i.test(p)) out.entersOptions.push("riot"); // CR 702.136a; each instance works separately (702.136b)
    else if (/^unleash$/i.test(p)) {
      // CR 702.98a: "You may have this permanent enter with an additional +1/+1 counter on it" and "This
      // permanent can't block as long as it has a +1/+1 counter on it" (any +1/+1 counter, rulings).
      out.entersOptions.push("unleash");
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "cantBlock" }], condition: { kind: "selfCounter", counter: "+1/+1" }, text: "Unleash: ~ can't block as long as it has a +1/+1 counter on it." });
    } else if ((m = /^afterlife (\d+)$/i.exec(p))) {
      // CR 702.135a: "When this permanent is put into a graveyard from the battlefield, create N 1/1 white and black
      // Spirit creature tokens with flying." Each instance triggers (702.135b).
      const n = Number(m[1]);
      const spirit: TokenSpec = { name: "Spirit", power: 1, toughness: 1, colors: ["W", "B"], types: ["Creature"], subtypes: ["Spirit"], keywords: ["Flying"] };
      out.triggers.push({ event: "selfToGraveyard", body: { targets: [], effects: [{ type: "createToken", who: { ref: "you" }, n, token: spirit }], text: `Afterlife ${n}: create ${n === 1 ? "a" : n} 1/1 white and black Spirit creature token${n > 1 ? "s" : ""} with flying.` } });
    } else if ((m = /^bloodthirst (\d+)$/i.exec(p))) out.bloodthirst += Number(m[1]); // CR 702.54a
    else if ((m = /^devour(?: (artifact|food|land))? (\d+)$/i.exec(p))) {
      // CR 702.82a, c: "Devour [quality] N": as it enters, sacrifice any number of [quality] permanents (creatures).
      if (out.devour) return null;
      const q = m[1]?.toLowerCase();
      const filter: TargetSpec =
        q === "artifact" ? { kind: "object", types: ["Artifact"], text: "artifact" }
        : q === "food" ? { kind: "object", subtypes: ["Food"], text: "Food" }
        : q === "land" ? { kind: "object", types: ["Land"], text: "land" }
        : { kind: "object", types: ["Creature"], text: "creature" };
      out.devour = { n: Number(m[2]), filter };
    }
    else if ((m = /^soulshift (\d+)$/i.exec(p))) {
      // CR 702.46a: "When this permanent is put into a graveyard from the battlefield, you may return target
      // Spirit card with mana value N or less from your graveyard to your hand."
      const n = Number(m[1]);
      const text = `return target Spirit card with mana value ${n} or less from your graveyard to your hand`;
      out.triggers.push({
        event: "selfDies",
        body: {
          targets: [{ kind: "card", owner: "you", subtypes: ["Spirit"], manaValue: { max: n }, text: `target Spirit card with mana value ${n} or less from your graveyard` }],
          effects: [{ type: "may", effects: [{ type: "bounce", what: { ref: "target", index: 0 } }], text }],
          text: `Soulshift ${n}: you may ${text}.`,
        },
      });
    } else if ((m = /^ward—pay (\d+) life\.?$/i.exec(p))) {
      // CR 702.21a with a life cost: "counter that spell or ability unless that player pays N life".
      const life = Number(m[1]);
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", life }, ward: true }], text: `Ward—Pay ${life} life: counter that spell or ability unless its controller pays ${life} life.` },
      });
    } else if ((m = /^ward ((?:\{(?:\d+|[WUBRGC])\})+)$/i.exec(p))) {
      // CR 702.21a: "Whenever this permanent becomes the target of a spell or ability an opponent
      // controls, counter that spell or ability unless that player pays [cost]."
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: m[1]! }, ward: true }], text: `Ward ${m[1]}: counter that spell or ability unless its controller pays ${m[1]}.` },
      });
    } else if ((m = /^ninjutsu ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.49a: "[Cost], Reveal this card from your hand, Return an unblocked attacking creature you control to
      // its owner's hand: Put this card onto the battlefield from your hand tapped and attacking."
      out.activated.push({
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        costs: [{ kind: "returnToHand", filter: { kind: "object", types: ["Creature"], controller: "you", text: "unblocked attacker you control" }, n: 1, unblockedAttacker: true }],
        body: { targets: [], effects: [{ type: "ninjutsu" }], text: "Put ~ onto the battlefield from your hand tapped and attacking." },
        text: `Ninjutsu ${m[1]}`,
      });
    } else if (/^myriad$/i.test(p)) {
      // CR 702.116a: "Whenever this creature attacks, for each opponent other than defending player, you may create a
      // token that's a copy of this creature that's tapped and attacking that player ... exile the tokens at end of combat."
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [],
          effects: [
            { type: "myriad" },
            { type: "delayed", when: "endOfCombat", each: "created", effects: [{ type: "exile", what: { ref: "subject" } }], text: "exile ~" },
          ],
          text: "Myriad: for each opponent other than defending player, you may create a token copy of ~ that's tapped and attacking that player. Exile the tokens at end of combat.",
        },
      });
    } else if ((m = /^mobilize (\d+)$/i.exec(p))) {
      // CR 702.181a: "Whenever this creature attacks, create N tapped and attacking 1/1 red Warrior creature tokens.
      // Sacrifice them at the beginning of the next end step."
      const n = Number(m[1]);
      const warrior: TokenSpec = { name: "Warrior", power: 1, toughness: 1, colors: ["R"], types: ["Creature"], subtypes: ["Warrior"], keywords: [] };
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n, token: warrior, tapped: true, attacking: true },
            { type: "delayed", when: "nextEndStep", each: "created", effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "sacrifice ~" },
          ],
          text: `Mobilize ${n}: create ${n === 1 ? "a" : n} tapped and attacking 1/1 red Warrior creature token${n > 1 ? "s" : ""}. Sacrifice ${n > 1 ? "them" : "it"} at the beginning of the next end step.`,
        },
      });
    } else if ((m = /^cycling ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.29a: "[Cost], Discard this card: Draw a card." Only while the card is in your hand.
      out.activated.push({
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "Draw a card." },
        text: `Cycling ${m[1]}`,
      });
    } else if ((m = /^([a-z]+(?: [a-z]+)?)cycling ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.29e: "[Type]cycling [cost]" means "[Cost], Discard this card: Search your library for a
      // [type] card, reveal it, put it into your hand, then shuffle." It's a cycling ability (702.29f).
      const type = m[1]!
        .split(" ")
        .map((w) => (CREATURE_TYPES.has(capital(w.toLowerCase())) || BASIC_TYPES.includes(capital(w.toLowerCase())) ? capital(w.toLowerCase()) : w.toLowerCase()))
        .join(" ");
      const filter = parseSearchFilter(`${type} card`);
      if (!filter) return null;
      out.activated.push({
        manaCost: m[2]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        body: { targets: [], effects: [{ type: "search", filter, n: 1, upTo: false, reveal: true, dest: { zone: "hand" } }], text: `Search your library for a ${filter.text}, reveal it, put it into your hand, then shuffle.` },
        text: `${capital(m[1]!.toLowerCase())}cycling ${m[2]}`,
      });
    } else if ((m = /^crew (\d+)$/i.exec(p)) && d.subtypes.includes("Vehicle")) {
      // CR 702.122a: "Tap any number of other untapped creatures you control with total power N or
      // greater: This permanent becomes an artifact creature until end of turn." It keeps its other
      // types and subtypes, Vehicle included (CR 205.1b).
      out.activated.push({
        manaCost: "",
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        crew: Number(m[1]),
        body: {
          targets: [],
          effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }], duration: "endOfTurn" }],
          text: "~ becomes an artifact creature until end of turn.",
        },
        text: `Crew ${m[1]}`,
      });
    } else return null;
  }
  return out;
}

/**
 * Keywords that the card data only names generically ("Protection", "Toxic") but whose
 * details are in the text: "Protection from black", "Toxic 2". These replace the generic
 * ones in the printed characteristics (see layers.ts).
 */
export function textKeywords(line: string): string[] {
  const out: string[] = [];
  for (const raw of line.split(/[,;]\s*/)) {
    const p = raw.trim();
    if (/^protection from /i.test(p) && keywordOf(p)) out.push(keywordOf(p)!);
    const tox = /^toxic (\d+)$/i.exec(p);
    if (tox) out.push(`Toxic ${tox[1]}`);
  }
  return out;
}

export function isKeywordLine(line: string): boolean {
  return line
    .split(/[,;]\s*/)
    .every((p) => !!keywordOf(p));
}
