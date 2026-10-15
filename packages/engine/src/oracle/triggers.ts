import type { TriggeredAbility, SpellCondition, TargetSpec, TriggerEvent } from "../abilities";
import { NUM, X, num, singularWord } from "./words";
import { parseStaticCondition } from "./statics";
import { parseBody, replaceX } from "./body";
import { parseTargetPhrase } from "./targets";

const TRIGGERS: [RegExp, TriggerEvent][] = [
  [/^When(?:ever)? ~ enters(?: the battlefield)?, (.+)$/, "selfEnters"],
  [/^When(?:ever)? ~ dies, (.+)$/, "selfDies"],
  [/^When(?:ever)? ~ leaves the battlefield, (.+)$/, "selfLeaves"],
  [/^When(?:ever)? ~ is put into (?:a|your) graveyard from the battlefield, (.+)$/, "selfToGraveyard"],
  [/^When(?:ever)? ~ becomes the target of a spell or ability, (.+)$/, "selfBecomesTarget"],
  [/^At the beginning of (?:the|each) end step, (.+)$/, "eachEndStep"],
  [/^When you cast (?:this spell|~), (.+)$/, "selfCast"],
  [/^When(?:ever)? ~ attacks, (.+)$/, "selfAttacks"],
  // Attacking a planeswalker isn't attacking a player (rulings): see TriggeredAbility.attacksPlayer.
  [/^Whenever ~ attacks a player, (.+)$/, "selfAttacks"],
  [/^Whenever ~ attacks for the first time each turn, (.+)$/, "selfAttacks"],
  // "Attacks while saddled": it has to be saddled as it attacks (CR 702.171b).
  [/^Whenever ~ attacks while saddled, (.+)$/, "selfAttacks"],
  [/^Whenever ~ enlists a creature, (.+)$/, "selfEnlists"], // CR 702.154c
  [/^When(?:ever)? ~ attacks or blocks, (.+)$/, "selfAttacksOrBlocks"],
  // The beginning of combat step (CR 507) and end of combat step (CR 511).
  [/^At the beginning of combat on your turn, (.+)$/, "yourBeginCombat"],
  [/^At the beginning of (?:each combat|combat on each player's turn), (.+)$/, "eachBeginCombat"],
  [/^At end of combat on your turn, (.+)$/, "yourEndCombat"],
  [/^At end of combat, (.+)$/, "eachEndCombat"],
  // Battle cards aren't supported, so nothing can attack one and "a player or battle" is just a player.
  // Revisit when battles are (CR 310).
  [/^Whenever ~ deals combat damage to a player(?: or battle)?, (.+)$/, "selfDealsCombatDamageToPlayer"],
  [/^Whenever ~ deals combat damage, (.+)$/, "selfDealsCombatDamage"],
  [/^Whenever ~ deals damage to a player, (.+)$/, "selfDealsDamageToPlayer"],
  [/^Whenever ~ deals damage, (.+)$/, "selfDealsDamage"],
  // Damage dealt to it at the same time by several sources is one event (rulings): "that much" is all of it.
  [/^Whenever ~ is dealt damage, (.+)$/, "selfIsDealtDamage"],
  [/^Whenever another creature you control enters, (.+)$/, "anotherCreatureYouControlEnters"],
  [/^Whenever another creature enters the battlefield under your control, (.+)$/, "anotherCreatureYouControlEnters"],
  // Landfall
  [/^Whenever a land (?:you control enters|enters the battlefield under your control), (.+)$/, "landYouControlEnters"],
  // Blocking (CR 509.3). The "a creature" forms are matched first, by parseBlockTrigger.
  [/^Whenever ~ blocks or becomes blocked, (.+)$/, "selfBlocksOrBecomesBlocked"],
  [/^Whenever ~ becomes blocked, (.+)$/, "selfBecomesBlocked"],
  [/^Whenever ~ attacks and isn't blocked, (.+)$/, "selfAttacksUnblocked"],
  [/^Whenever ~ attacks alone, (.+)$/, "selfAttacksAlone"],
  [/^Whenever ~ blocks, (.+)$/, "selfBlocks"],
  [/^Whenever you gain life, (.+)$/, "youGainLife"],
  [/^Whenever you choose a creature as your Ring-bearer, (.+)$/, "youChooseRingBearer"],
  [/^Whenever an opponent loses life, (.+)$/, "opponentLosesLife"],
  [/^At the beginning of your upkeep, (.+)$/, "yourUpkeep"],
  [/^At the beginning of each (?:player's )?upkeep, (.+)$/, "eachUpkeep"],
  [/^At the beginning of your draw step, (.+)$/, "yourDrawStep"],
  [/^At the beginning of each player's draw step, (.+)$/, "eachDrawStep"],
  [/^At the beginning of your end step, (.+)$/, "yourEndStep"],
  [/^When ~ is turned face up, (.+)$/, "selfTurnedFaceUp"],
  [/^Whenever ~ becomes tapped, (.+)$/, "selfBecomesTapped"],
  [/^When ~ becomes monstrous, (.+)$/, "selfBecomesMonstrous"],
  [/^Whenever you exert a creature, (.+)$/, "youExert"],
  [/^When(?:ever)? ~ exploits a creature, (.+)$/, "selfExploits"],
  // Heroic (an ability word): "Whenever you cast a spell that targets ~".
  [/^Whenever you cast a spell that targets ~, (.+)$/, "selfTargetedByYourSpell"],
];

const SELF_EVENTS: TriggerEvent[] = [
  "selfEnters", "selfDies", "selfLeaves", "selfToGraveyard", "selfBecomesTarget", "selfAttacks", "selfAttacksOrBlocks", "selfDealsCombatDamageToPlayer", "selfTurnedFaceUp",
  "selfDealsDamage", "selfDealsCombatDamage", "selfTargetedByYourSpell", "selfLastTimeCounterRemoved", "selfExploits",
  "selfBlocks", "selfBecomesBlocked", "selfAttacksUnblocked", "selfAttacksAlone", "selfBlocksOrBecomesBlocked", "selfBlocksCreature", "selfBlockedByCreature", "selfBlocksOrBlockedByCreature",
  "selfDealsDamageToCreature", "selfDealsCombatDamageToCreature", "selfDealsDamageToPlayer", "selfBecomesTapped", "selfIsDealtDamage", "selfBecomesMonstrous",
];

/** What an attached permanent's creature does (see TriggeredAbility.host): the event, and what its text can say. */
const HOST_TRIGGERS: [RegExp, TriggerEvent, { thatMuch?: true; eventPlayer?: true; defending?: true; toOpponent?: true; creature?: true }][] = [
  [/^attacks or blocks, (.+)$/, "selfAttacksOrBlocks", {}],
  [/^attacks, (.+)$/, "selfAttacks", { defending: true }],
  [/^blocks or becomes blocked, (.+)$/, "selfBlocksOrBecomesBlocked", {}],
  [/^becomes blocked, (.+)$/, "selfBecomesBlocked", { defending: true }],
  [/^attacks and isn't blocked, (.+)$/, "selfAttacksUnblocked", { defending: true }],
  [/^attacks alone, (.+)$/, "selfAttacksAlone", { defending: true }],
  [/^blocks, (.+)$/, "selfBlocks", {}],
  // An attacking creature's combat damage to a player is dealt to the player it attacks (CR 510.1a); a blocking
  // creature deals none to players. So "defending player" is that player.
  [/^deals combat damage to (?:a player(?: or battle)?|defending player), (.+)$/, "selfDealsCombatDamageToPlayer", { thatMuch: true, eventPlayer: true }],
  [/^deals combat damage to an opponent, (.+)$/, "selfDealsCombatDamageToPlayer", { thatMuch: true, eventPlayer: true, toOpponent: true }],
  [/^deals damage to a player, (.+)$/, "selfDealsDamageToPlayer", { thatMuch: true, eventPlayer: true }],
  [/^deals damage to an opponent, (.+)$/, "selfDealsDamageToPlayer", { thatMuch: true, eventPlayer: true, toOpponent: true }],
  [/^deals combat damage to a creature, (.+)$/, "selfDealsCombatDamageToCreature", { thatMuch: true, creature: true }],
  [/^deals damage to a creature, (.+)$/, "selfDealsDamageToCreature", { thatMuch: true, creature: true }],
  [/^deals combat damage, (.+)$/, "selfDealsCombatDamage", { thatMuch: true }],
  [/^deals damage, (.+)$/, "selfDealsDamage", { thatMuch: true }],
  [/^becomes the target of a spell or ability, (.+)$/, "selfBecomesTarget", {}],
  [/^becomes tapped, (.+)$/, "selfBecomesTapped", {}],
  [/^is dealt damage, (.+)$/, "selfIsDealtDamage", { thatMuch: true }],
];

/**
 * "Whenever enchanted creature deals damage, you gain that much life", "Whenever equipped creature attacks, put a
 * +1/+1 counter on it", "Whenever ~ or equipped creature deals combat damage to a player, draw a card": triggered
 * abilities of an Aura or Equipment about the creature it's attached to as the event happens. "It" and "that
 * creature" are that creature (the subject); after "deals damage to a creature", the creature dealt damage
 * ("the other creature"). "Enchanted creature" in the effect is whatever it's attached to as it resolves.
 */
function parseHostTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever enchanted land becomes tapped": an Aura on something other than a creature can only see that.
  const m = /^When(?:ever)? (~ or )?(?:enchanted|equipped) (creature|land|artifact|permanent) (.+)$/.exec(line);
  if (!m) return null;
  for (const [re, event, o] of HOST_TRIGGERS) {
    const h = re.exec(m[3]!);
    if (!h) continue;
    if (m[2] !== "creature" && event !== "selfBecomesTapped") return "fail";
    let text = h[1]!;
    // "~ or equipped creature": "it" could be either (Ogre-Head Helm's "you may sacrifice it" is the Helm).
    if (m[1] && /\b(it|its|that creature)\b/i.test(text)) return "fail";
    if (o.creature) {
      if (/\b(it|its)\b/i.test(text)) return "fail"; // the creature dealing damage, or the one dealt it?
      text = text.replace(/\bthe other creature\b/g, "that creature");
    }
    const thatMuch = o.thatMuch && /\bthat (?:much|many)\b/.test(text);
    if (thatMuch) {
      if (/\bX\b/.test(text)) return "fail";
      text = text.replace(/\bthat (?:much|many)\b/g, "X");
    }
    let body = parseBody(text, { ...(o.creature ? { subject: true } : { subjectIt: true }), ...(o.eventPlayer ? { eventPlayer: true } : {}), ...(o.defending ? { defending: true } : {}) });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, h[1]!) };
    return { event, body, host: m[1] ? "orSelf" : "attached", ...(o.toOpponent ? { toOpponent: true } : {}) };
  }
  return null; // "whenever equipped creature dies" is parseDiesTrigger's
}

/**
 * "Whenever ~ blocks a creature", "Whenever ~ becomes blocked by a creature", "Whenever ~ blocks or
 * becomes blocked by a nonblack creature": once for each such creature, which "that creature" means.
 */
const BLOCK_TRIGGERS: [RegExp, TriggerEvent][] = [
  [/^Whenever ~ blocks or becomes blocked by (an? .+?), (.+)$/, "selfBlocksOrBlockedByCreature"],
  [/^Whenever ~ becomes blocked by (an? .+?), (.+)$/, "selfBlockedByCreature"],
  [/^Whenever ~ blocks (an? .+?), (.+)$/, "selfBlocksCreature"],
];

/**
 * "Whenever ~ deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next
 * untap step": once for each creature it dealt damage to (CR 603.2c), which "that creature" and "it" mean.
 */
function parseDamagesCreatureTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever ~ deals (combat )?damage to a creature, (.+)$/.exec(line);
  if (!m) return null;
  let text = m[2]!;
  const thatMuch = /\bthat (?:much|many)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, { subjectIt: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[2]!) };
  return { event: m[1] ? "selfDealsCombatDamageToCreature" : "selfDealsDamageToCreature", body };
}

function parseBlockTrigger(line: string): TriggeredAbility | "fail" | null {
  for (const [re, event] of BLOCK_TRIGGERS) {
    const m = re.exec(line);
    if (!m) continue;
    const what = m[1]!.replace(/^an? /, "");
    const filter = what === "creature" ? undefined : parseTargetPhrase(what);
    if (filter === null || (filter && filter.kind !== "object")) return "fail";
    const body = parseBody(m[2]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ "), { subject: true });
    if (!body) return "fail";
    return { event, body, ...(filter ? { subjectFilter: { ...filter, text: what } } : {}) };
  }
  return null;
}

/**
 * "Whenever you cast a noncreature spell", "Whenever an opponent casts a creature spell",
 * "Whenever a player casts a spell", magecraft's "whenever you cast or copy an instant or sorcery spell".
 */
const CAST_TRIGGER = /^When(?:ever)? (you|an opponent|a player) casts? (or copy |or copies )?(an? .+?)(?: spell)?, (.+)$/;
const CAST_BY = { you: "you", "an opponent": "opponent", "a player": "any" } as const;

/**
 * "When ~ becomes the target of a spell, sacrifice it", "Whenever ~ becomes the target of a spell or ability for the first
 * time each turn, counter that spell or ability" (Glyph Keeper), valiant's "... a spell or ability you control for the
 * first time each turn", "Whenever a permanent you control becomes the target of a spell or ability an opponent controls".
 * "That player" is the controller of the spell or ability; "that spell or ability" is it.
 */
function parseTargetedTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^When(?:ever)? (~|an?(?:other)? .+?) becomes the target of a spell( or ability)?( you control| an opponent controls)?( for the first time each turn)?, (.+)$/.exec(line);
  if (!m) return null;
  const targeted = { ...(m[2] ? {} : { spell: true as const }), ...(m[3] ? { by: m[3] === " you control" ? ("you" as const) : ("opponent" as const) } : {}), ...(m[4] ? { first: true as const } : {}) };
  const counter = /^counter that spell or ability\.?$/.exec(m[5]!) && m[2];
  if (m[1] === "~") {
    const text = m[5]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ ");
    const body = counter ? { targets: [], effects: [{ type: "counterCause" as const }], text: "Counter that spell or ability." } : parseBody(text, { selfIt: true, ...(m[3] !== " you control" ? { eventPlayer: true } : {}) });
    return body ? { event: "selfBecomesTarget", targeted, body } : "fail";
  }
  // "A permanent you control", "another creature you control": the subject, which "that permanent" or "it" is.
  const other = /^another /.test(m[1]!);
  const what = m[1]!.replace(/^an? |^another /, "");
  const filter = parseTargetPhrase(what);
  if (!filter || filter.kind !== "object" || counter) return "fail";
  const body = parseBody(m[5]!.replace(/\bthat (?:permanent|creature)\b/g, "it"), { subjectIt: true, ...(m[3] !== " you control" ? { eventPlayer: true } : {}) });
  return body ? { event: "permanentBecomesTarget", targeted: { ...targeted, ...(other ? { other } : {}) }, subjectFilter: { ...filter, text: what }, body } : "fail";
}

function parseCastTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever you cast your second spell each turn", "Whenever an opponent casts their second spell each turn".
  const nth = /^Whenever (you|an opponent|a player) casts? (?:your|their) second spell each turn, (.+)$/.exec(line);
  if (nth) {
    const body = parseBody(nth[2]!, { castSpell: true, eventPlayer: true });
    return body ? { event: "castSpell", cast: { by: CAST_BY[nth[1] as keyof typeof CAST_BY], spell: { kind: "spell", text: "spell" }, nth: 2 }, body } : "fail";
  }
  const m = CAST_TRIGGER.exec(line);
  if (!m) return null;
  const what = m[3]!.replace(/^an? /, "");
  // "a spell of the chosen color", "a creature spell of the chosen type": the choice made as this permanent entered.
  const spell = /^spell$/.test(what) ? { kind: "spell" as const, text: "spell" } : parseTargetPhrase(/\bspell\b/.test(what) ? what : `${what} spell`, { chosen: true });
  if (!spell || spell.kind !== "spell") return "fail";
  // "That player" is the one who cast it.
  const body = parseBody(m[4]!, { castSpell: true, eventPlayer: true });
  if (!body) return "fail";
  return { event: "castSpell", cast: { by: CAST_BY[m[1] as keyof typeof CAST_BY], spell: { ...spell, text: /\bspell\b/.test(what) ? what : `${what} spell` }, ...(m[2] ? { orCopy: true } : {}) }, body };
}

/**
 * "Whenever a creature you control enters", "Whenever another nontoken creature you control with power 2 or
 * less enters", "Whenever ~ or another Ally you control enters", "When a creature with mana value 5 or
 * greater enters": the entering permanent is the subject ("that creature", "it", "its power"). "One or
 * more" (one trigger for several entering at once) isn't modeled.
 */
const ENTERS_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) enters(?: the battlefield)?( under your control| under an opponent's control)?, (.+)$/;

function parseEntersTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = ENTERS_TRIGGER.exec(line);
  if (!m) return null;
  let phrase = m[2]!;
  if (m[3]) phrase += m[3] === " under your control" ? " you control" : " an opponent controls";
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object") return "fail";
  const body = parseBody(m[4]!, { subjectIt: true });
  if (!body) return "fail";
  const kind = m[1]!.toLowerCase();
  return {
    event: "permanentEnters",
    enters: { filter: { ...filter, text: phrase }, ...(kind === "another" ? { other: true } : {}), ...(kind === "~ or another" ? { orSelf: true } : {}) },
    body,
  };
}

const DIES_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) dies, (.+)$/;

/**
 * "Whenever another creature dies", "Whenever a creature you control dies", "Whenever ~ or another Zombie
 * you control dies", "Whenever a creature dealt damage by ~ this turn dies", "Whenever equipped creature
 * dies": "it" and "that card" are the card in the graveyard, "its power" as it last existed (CR 603.10a).
 */
function parseDiesTrigger(line: string): TriggeredAbility | "fail" | null {
  const attached = /^When(?:ever)? (equipped|enchanted) creature dies, (.+)$/.exec(line);
  const m = attached ? null : DIES_TRIGGER.exec(line);
  if (!attached && !m) return null;
  const bodyText = attached ? attached[2]! : m![3]!;
  const body = parseBody(bodyText, { subjectIt: true, subjectLeft: true });
  if (!body) return "fail";
  if (attached) return { event: "permanentDies", dies: { filter: { kind: "object", types: ["Creature"], text: "creature" }, attached: true }, body };
  let phrase = m![2]!;
  const damaged = / dealt damage by ~ this turn$/.exec(phrase);
  if (damaged) phrase = phrase.slice(0, damaged.index);
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object") return "fail";
  const kind = m![1]!.toLowerCase();
  return {
    event: "permanentDies",
    dies: {
      filter: { ...filter, text: phrase },
      ...(kind === "another" ? { other: true } : {}),
      ...(kind === "~ or another" ? { orSelf: true } : {}),
      ...(damaged ? { damagedBySelf: true } : {}),
    },
    body,
  };
}

/**
 * "Whenever a creature you control deals combat damage to a player, draw a card", "Whenever a Vampire you control deals
 * combat damage to a player, put a +1/+1 counter on it": once for each such creature and player (CR 510.2, 603.2c).
 * "It" and "that creature" are the creature, "that player" the player, "that much" the damage.
 */
function parseDealerTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (another|an?) (.+?) you control deals combat damage to (a player(?: or battle)?|an opponent), (.+)$/.exec(line);
  if (!m) return null;
  const filter = parseTargetPhrase(m[2]!);
  if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length || filter.allTypes?.includes("Creature"))) return "fail";
  let text = m[4]!;
  const thatMuch = /\bthat (?:much|many)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, { subjectIt: true, eventPlayer: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[4]!) };
  return {
    event: "creatureYouControlDealsCombatDamageToPlayer",
    dealer: { filter: { ...filter, controller: "you", text: `${m[2]} you control` }, ...(m[1] === "another" ? { other: true } : {}) },
    body,
    ...(m[3] === "an opponent" ? { toOpponent: true as const } : {}),
  };
}

/**
 * "Whenever you sacrifice another permanent", "Whenever you sacrifice a Food", "Whenever you sacrifice ~ or another
 * creature", "... a nontoken permanent during your turn": once for each permanent its controller sacrifices (CR 701.21a).
 * "It" and "that card" are the card where it went. "One or more" (once per batch) isn't modeled.
 */
function parseSacrificeTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever you sacrifice (~ or another|another|an?) (.+?)( during your turn)?, (.+)$/.exec(line);
  if (!m) return null;
  const phrase = m[2]!.replace(/ or (?=[a-z])/g, " or ");
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object" || filter.controller) return "fail";
  const body = parseBody(m[4]!, { subjectIt: true, subjectLeft: true });
  if (!body) return "fail";
  const kind = m[1]!.toLowerCase();
  return {
    event: "youSacrifice",
    sacrifices: { filter: { ...filter, text: phrase }, ...(kind === "another" ? { other: true } : {}), ...(kind === "~ or another" ? { orSelf: true } : {}) },
    body,
    // Only while it's your turn: whether it triggers at all, not an intervening if.
    ...(m[3] ? { activeIf: { kind: "yourTurn" as const } } : {}),
  };
}

/**
 * "Whenever you draw a card", "whenever an opponent draws a card", "whenever a player draws a card",
 * "whenever you draw your second card each turn" (the count includes cards drawn before the source
 * was on the battlefield). "That player" is whoever drew.
 */
/**
 * "Whenever one or more creatures you control attack", "Whenever you attack", "Whenever you attack with one or
 * more Elves", "Whenever one or more Ninja you control deal combat damage to a player" (once per player dealt
 * damage; "that player" is that player, "that much" what the matching creatures dealt).
 */
function parseGroupTrigger(line: string): TriggeredAbility | "fail" | null {
  let m: RegExpExecArray | null;
  let event: TriggerEvent;
  let phrase: string | undefined;
  let bodyText: string;
  let min: number | undefined;
  if ((m = /^Whenever (?:one or more (.+?) you control attack|you attack with (one|two|three|four|five) or more (.+?)|you attack)(?: a player)?, (.+)$/.exec(line))) {
    event = "creaturesYouControlAttack";
    phrase = m[1] ?? m[3];
    bodyText = m[4]!;
    const n = m[2] ? num(m[2]) : 1;
    if (n > 1) min = n;
  } else if ((m = /^Whenever one or more (.+?) you control deal combat damage to (?:a player|an opponent|one or more players), (.+)$/.exec(line))) {
    event = "creaturesYouControlDealCombatDamageToPlayer";
    phrase = m[1];
    bodyText = m[2]!;
    // Combat damage to a player always goes to an opponent here: attacks only go to opponents.
  } else return null;
  if (/\b(they|them|those creatures|their)\b/.test(bodyText) && !/that player/.test(bodyText)) return "fail"; // the attackers as a group aren't modeled
  let group: TargetSpec | undefined;
  if (phrase && !/^creatures$/.test(phrase)) {
    const spec = parseTargetPhrase(phrase.split(/\s+/).map(singularWord).join(" "));
    if (!spec || spec.kind !== "object") return "fail";
    group = { ...spec, text: phrase };
  }
  let text = bodyText;
  const thatMuch = event === "creaturesYouControlDealCombatDamageToPlayer" && /\bthat (?:much|many)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, { eventPlayer: event === "creaturesYouControlDealCombatDamageToPlayer" });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, bodyText) };
  return { event, body, ...(group ? { group } : {}), ...(min ? { minAttackers: min } : {}) };
}

function parseDrawTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (you|an opponent|a player) draws? (a card|your (first|second|third) card each turn), (.+)$/.exec(line);
  if (!m) return null;
  const body = parseBody(m[4]!, { eventPlayer: true });
  if (!body) return "fail";
  const by = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : "any";
  const nth = m[3] ? { first: 1, second: 2, third: 3 }[m[3] as "first"] : undefined;
  return { event: "playerDraws", draws: { by, ...(nth ? { nth } : {}) }, body };
}

/**
 * "Whenever you discard a card", "whenever an opponent discards a card" ("that player" is who discarded), "whenever you
 * cycle or discard another card" (the same as "discard", rulings), "whenever a player cycles a card", "whenever you
 * discard a creature card". "One or more cards" (once per batch) isn't modeled.
 */
function parseDiscardTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (you|an opponent|a player) (cycles?|discards?|cycles? or discards?) (a|another|an?) ((?:[a-z]+ )?card), (.+)$/.exec(line);
  if (!m) return null;
  let filter: TargetSpec | undefined;
  if (m[4] !== "card") {
    const f = parseTargetPhrase(m[4]!);
    if (!f || f.kind !== "card") return "fail";
    filter = f;
  }
  const body = parseBody(m[5]!, { eventPlayer: true });
  if (!body) return "fail";
  const by = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : "any";
  return { event: "playerDiscards", discards: { by, ...(/^cycles?$/.test(m[2]!) ? { cycled: true as const } : {}), ...(m[3] === "another" ? { other: true as const } : {}), ...(filter ? { filter } : {}) }, body };
}

/** "Whenever a creature you control exploits a nontoken creature" (CR 702.110b): the exploited creature is the subject. */
function parseExploitsTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever a creature you control exploits an? (.+?), (.+)$/.exec(line);
  if (!m) return null;
  const filter = m[1] === "creature" ? undefined : parseTargetPhrase(m[1]!);
  if (filter === null || (filter && filter.kind !== "object")) return "fail";
  if (/\bexploited\b/.test(m[2]!)) return "fail"; // "the exploited creature" isn't modeled
  const body = parseBody(m[2]!);
  if (!body) return "fail";
  return { event: "creatureYouControlExploits", body, ...(filter ? { subjectFilter: { ...filter, text: m[1]! } } : {}) };
}

/** The events that abilities of cards in graveyards see (fireEvent's `fromGraveyards`). */
const YARD_EVENTS: TriggerEvent[] = ["castSpell", "permanentEnters", "landYouControlEnters", "anotherCreatureYouControlEnters", "creaturesYouControlAttack", "creaturesYouControlDealCombatDamageToPlayer", "yourUpkeep", "eachUpkeep", "yourDrawStep", "eachDrawStep", "yourEndStep", "eachEndStep", "yourBeginCombat", "eachBeginCombat", "yourEndCombat", "eachEndCombat"];

export function parseTrigger(raw: string): TriggeredAbility | "fail" | null {
  // An ability word ("Magecraft —", "Landfall —") has no rules meaning (CR 207.2c).
  const line = raw.replace(/^[A-Z][A-Za-z' -]+ — (?=(When|Whenever|At)\b)/, "");
  if (!/^(When|Whenever|At)\b/.test(line)) return null;
  // "At the beginning of the upkeep of enchanted creature's controller, ~ deals 1 damage to that player": "that player"
  // is that controller, whose upkeep it is; "that creature" is the enchanted creature.
  const hostUpkeep = /^At the beginning of the upkeep of (enchanted|equipped) creature's controller, (.+)$/.exec(line);
  if (hostUpkeep) {
    const t = parseTrigger(`At the beginning of each player's upkeep, ${hostUpkeep[2]!.replace(/\bthat creature\b/g, `${hostUpkeep[1]} creature`)}`);
    return t && t !== "fail" ? { ...t, hostControllersUpkeep: true } : "fail";
  }
  // Battalion: "Whenever ~ and at least two other creatures attack, ..." (as attackers are declared, CR 508.1).
  const battalion = /^Whenever ~ and at least (one|two|three) other creatures attack, (.+)$/.exec(line);
  if (battalion) {
    const t = parseTrigger(`Whenever ~ attacks, ${battalion[2]}`);
    return t && t !== "fail" ? { ...t, withOthers: num(battalion[1]!) } : "fail";
  }
  // "Whenever a creature you control attacks alone" (exalted's event, CR 702.83a, 506.5): that creature is the subject.
  const alone = /^Whenever an? (.+?) you control attacks alone, (?!if )(.+)$/.exec(line);
  if (alone) {
    const filter = alone[1] === "creature" ? undefined : parseTargetPhrase(alone[1]!);
    if (filter === null || (filter && filter.kind !== "object")) return "fail";
    const body = parseBody(alone[2]!, { subjectIt: true, defending: true });
    return body ? { event: "creatureYouControlAttacksAlone", body, ...(filter ? { subjectFilter: { ...filter, text: alone[1]! } } : {}) } : "fail";
  }
  // The Enduring cycle: "When ~ dies, if it was a creature, return it to the battlefield under its owner's control.
  // It's an enchantment. (It's not a creature.)" Only a creature dies here (CR 700.4), so the intervening if (CR 603.4)
  // holds whenever it triggers. It enters as an enchantment only, without its creature types (rulings, CR 205.1b).
  if (/^When ~ dies, if it was a creature, return it to the battlefield under its owner's control\. It's an enchantment\.(?: \(It's not a creature\.\))?$/.test(line))
    return {
      event: "selfDies",
      body: {
        targets: [],
        effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, owner: true, becomes: { types: ["Enchantment"], subtypes: [] } }],
        text: "If it was a creature, return it to the battlefield under its owner's control. It's an enchantment.",
      },
    };
  // "Whenever you cast a multicolored spell, you may return ~ from your graveyard to your hand": the effect moves the
  // card out of the graveyard, so the ability works only there (CR 113.6m). Only that one sentence: anything after it
  // would be about the card in its new zone. A trigger about ~ itself can't happen while it's in a graveyard.
  const yard = /^((?:When|Whenever|At)\b.+?), ((?:you may )?(?:pay [^.]+\. If you do, )?return ~ from your graveyard to (?:your hand|the battlefield(?: tapped| attached to that creature)?))\.$/.exec(line);
  if (yard && !/^(When|Whenever) ~ /.test(yard[1]!)) {
    const t = parseTrigger(`${yard[1]}, draw a card.`);
    if (!t || t === "fail" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "draw" || t.body.targets.length) return "fail";
    if (!YARD_EVENTS.includes(t.event) || t.host) return "fail";
    // "Attached to that creature": the entering creature, the trigger's subject.
    const attach = / attached to that creature$/.test(yard[2]!);
    if (attach && !(t.event === "permanentEnters" && t.enters?.filter.types?.includes("Creature")) && t.event !== "anotherCreatureYouControlEnters") return "fail";
    const body = parseBody(`${yard[2]![0]!.toUpperCase()}${yard[2]!.slice(1)}.`, { selfCard: true, ...(attach ? { subject: true } : {}) });
    return body ? { ...t, body, zone: "graveyard" } : "fail";
  }
  // "Whenever the Ring tempts you" (CR 701.54d). "If you chose a creature other than ~ as your Ring-bearer" is an
  // intervening if (CR 603.4) about the choice just made, so it can't change by the time it resolves.
  const ring = /^Whenever the Ring tempts you, (if you chose a creature other than ~ as your Ring-bearer, )?(.+)$/.exec(line);
  if (ring) {
    const body = parseBody(ring[2]!, {});
    return body ? { event: "ringTemptsYou", body, ...(ring[1] ? { ifOtherBearer: true } : {}) } : "fail";
  }
  // "When ~ enters, if you attacked this turn, ...": an intervening "if" (CR 603.4) about the game. It's
  // checked as the ability would trigger and again as it resolves, so it can't be an ordinary effect.
  const intervening = /^((?:When|Whenever|At)\b[^,]*), if ([^,]+), (.+)$/.exec(line);
  // "If it's attacking" is about the source only in an ability about the source itself.
  const aboutIt = intervening && /^(it|~)\b(?!'s (?:your|the first) )/.test(intervening[2]!) && !/^(When|Whenever) ~ /.test(intervening[1]!);
  // "At the beginning of each opponent's upkeep, if that player has two or fewer cards in hand": whose upkeep it is.
  const thatHand = intervening && /^At the beginning of each opponent's (?:upkeep|draw step|end step)$/.test(intervening[1]!) ? new RegExp(`^that player has (no|${NUM} or (fewer|more)) cards in hand$`).exec(intervening[2]!) : null;
  const handCond = thatHand && (thatHand[1] === "no" ? { max: 0 } : thatHand[3] === "fewer" ? { max: num(thatHand[2]!) } : { min: num(thatHand[2]!) });
  const ifCond = handCond ? ({ kind: "eventPlayerHand", ...handCond } as const) : intervening && !aboutIt && parseStaticCondition(intervening[2]!, { affects: { kind: "self" }, mods: [], text: "" });
  // "That player" is the attacked player only in "Whenever ~ attacks a player".
  if (ifCond && ifCond.kind === "defenderMostLife" && !/^Whenever ~ attacks a player$/.test(intervening![1]!)) return "fail";
  if (intervening && ifCond) {
    const t = parseTrigger(`${intervening[1]}, ${intervening[3]}`);
    return t && t !== "fail" && !t.ifCond ? { ...t, ifCond } : "fail";
  }
  // "At the beginning of each opponent's upkeep, ~ deals 1 damage to that player": an "each upkeep" trigger that
  // triggers only on its controller's opponents' turns; "that player" is the active player.
  const oppStep = /^At the beginning of each opponent's (upkeep|draw step|end step), (.+)$/.exec(line);
  if (oppStep) {
    const event = oppStep[1] === "upkeep" ? "eachUpkeep" : oppStep[1] === "draw step" ? "eachDrawStep" : "eachEndStep";
    // "They lose 2 life", "~ deals 2 damage to them": that player.
    const body = parseBody(oppStep[2]!.replace(/^they lose /, "that player loses ").replace(/ to them\.$/, " to that player."), { eventPlayer: true });
    return body ? { event, body, opponentsTurn: true } : "fail";
  }
  // Heroic before the other "whenever you cast" triggers.
  const heroic = /^Whenever you cast a spell that targets ~, (.+)$/.exec(line);
  if (heroic) {
    const body = parseBody(heroic[1]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ "), { selfIt: true });
    return body ? { event: "selfTargetedByYourSpell", body } : "fail";
  }
  const hosted = parseHostTrigger(line);
  if (hosted) return hosted;
  // "Whenever ~ deals damage to an opponent": an opponent of its controller.
  const toOpp = /^Whenever ~ deals damage to an opponent, (.+)$/.exec(line);
  if (toOpp) {
    const t = parseTrigger(`Whenever ~ deals damage to a player, ${toOpp[1]}`);
    return t && t !== "fail" ? { ...t, toOpponent: true } : "fail";
  }
  // "Whenever this Equipment becomes unattached from a permanent, sacrifice that permanent" (Grafted Wargear).
  const unattached = /^Whenever ~ becomes unattached from a permanent, (.+)$/.exec(line);
  if (unattached) {
    const body = parseBody(unattached[1]!.replace(/\bthat permanent\b/g, "it"), { subjectIt: true });
    return body ? { event: "selfBecomesUnattached", body } : "fail";
  }
  const targetedBy = parseTargetedTrigger(line);
  if (targetedBy) return targetedBy;
  const cast = parseCastTrigger(line);
  if (cast) return cast;
  // "Whenever one or more +1/+1 counters are put on ~ / on a creature you control" (CR 122.6: also as it enters with
  // them). "That many" is how many were put on it.
  const put = /^Whenever one or more (\+1\/\+1 )?counters are put on (~|another creature you control|a creature you control), (.+)$/.exec(line);
  if (put) {
    const self = put[2] === "~";
    let text = put[3]!;
    const thatMuch = /\bthat (?:much|many)\b/.test(text);
    if (thatMuch) {
      if (/\bX\b/.test(text)) return "fail";
      text = text.replace(/\bthat (?:much|many)\b/g, "X");
    }
    let body = parseBody(self ? text.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ ") : text, self ? { selfIt: true } : { subjectIt: true });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, put[3]!) };
    const kind = put[1] ? { countersKind: "+1/+1" } : {};
    if (self) return { event: "selfCountersPut", body, ...kind };
    const filter = parseTargetPhrase(put[2]!.replace(/^another /, "creature ").replace(/^a creature/, "creature"));
    if (filter?.kind !== "object") return "fail";
    return { event: "permanentCountersPut", tappedFilter: { ...filter, ...(put[2]!.startsWith("another") ? { notSource: true } : {}) }, body, ...kind };
  }
  // "Whenever a Dwarf you control becomes tapped", "Whenever a creature an opponent controls becomes tapped".
  const tapped = /^Whenever an? (.+?) becomes tapped, (.+)$/.exec(line);
  if (tapped) {
    const filter = parseTargetPhrase(tapped[1]!);
    const body = filter && filter.kind === "object" && parseBody(tapped[2]!, { subjectIt: true });
    return filter && body ? { event: "permanentBecomesTapped", tappedFilter: filter, body } : "fail";
  }
  const block = parseBlockTrigger(line);
  if (block) return block;
  const damages = parseDamagesCreatureTrigger(line);
  if (damages) return damages;
  const enters = parseEntersTrigger(line);
  if (enters) return enters;
  const draws = parseDrawTrigger(line);
  if (draws) return draws;
  const dies = parseDiesTrigger(line);
  if (dies) return dies;
  const dealer = parseDealerTrigger(line);
  if (dealer) return dealer;
  const sacrifices = parseSacrificeTrigger(line);
  if (sacrifices) return sacrifices;
  const group = parseGroupTrigger(line);
  if (group) return group;
  const exploits = parseExploitsTrigger(line);
  if (exploits) return exploits;
  const discards = parseDiscardTrigger(line);
  if (discards) return discards;
  // "When ~ is put into a graveyard from anywhere, shuffle it into its owner's library" (CR 603.6c): "it" is the card in
  // the graveyard, and its owner controls the ability there (CR 603.3a), so "its owner" is "you".
  const anywhere = /^When ~ is put into (?:a|your) graveyard from anywhere, (.+)$/.exec(line);
  if (anywhere) {
    const body = parseBody(anywhere[1]!.replace(/^its owner shuffles their graveyard into their library/, "shuffle your graveyard into your library"), { selfCard: true });
    return body ? { event: "selfToGraveyardAnywhere", body } : "fail";
  }
  // "When you cycle ~" (CR 702.29c): "it" is the card, wherever it went.
  const cycled = /^When you cycle ~, (.+)$/.exec(line);
  if (cycled) {
    const body = parseBody(cycled[1]!, { selfCard: true });
    return body ? { event: "selfCycled", body } : "fail";
  }
  // A state trigger (CR 603.8): "When you control no Islands, sacrifice ~."
  const st = /^When (you control no .+?), (.+)$/.exec(line);
  if (st) {
    const state = parseStaticCondition(st[1]!, { affects: { kind: "self" }, mods: [], text: "" });
    const body = state && parseBody(st[2]!, { selfIt: true });
    return state && body ? { event: "state", state, body } : "fail";
  }
  for (const [re, event] of TRIGGERS) {
    const m = re.exec(line);
    if (m) {
      // "When ~ enters, it deals 2 damage...": in a trigger about the permanent itself, a leading "it" is that permanent.
      const self = SELF_EVENTS.includes(event);
      // "When ~ enters, if it was kicked, ...": an intervening if (CR 603.4) on how it was cast.
      let body0 = m[1]!;
      let ifKicked: SpellCondition | undefined;
      const kicked = /^if it was kicked(?: with its ((?:\{[^}]+\})+) kicker)?, (.+)$/i.exec(body0);
      if (kicked) {
        if (event !== "selfEnters") return "fail" as const;
        ifKicked = { kind: "kicked", ...(kicked[1] ? { cost: kicked[1] } : {}) };
        body0 = kicked[2]!;
      }
      // "When Leonardo enters, if his sneak cost was paid, ..." (CR 702.190a).
      let ifSneaked = false;
      const sneaked = /^if (?:its|his|her|their) sneak cost was paid, (.+)$/i.exec(body0);
      if (sneaked) {
        if (event !== "selfEnters") return "fail" as const;
        ifSneaked = true;
        body0 = sneaked[1]!;
      }
      let text = self ? body0.replace(/^(?:it|he|she) (?=(?:gets|gains|deals|has|becomes|fights|explores)\b)/, "~ ") : body0;
      // "You gain that much life", "put that many +1/+1 counters on it": the damage the event dealt, or the life gained or lost.
      const amount = event === "selfDealsDamage" || event === "selfIsDealtDamage" || event === "selfDealsCombatDamage" || event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "youGainLife" || event === "opponentLosesLife";
      const thatMuch = amount && /\bthat (?:much|many)\b/.test(text);
      if (thatMuch) {
        if (/\bX\b/.test(text)) return "fail" as const;
        text = text.replace(/\bthat (?:much|many)\b/g, "X");
      }
      // "Put a +1/+1 counter on it", "untap it": in a trigger about the permanent itself, "it" is that
      // permanent, except after it left ("return it to your hand" means the card in the graveyard).
      const left = event === "selfDies" || event === "selfToGraveyard" || event === "selfLeaves";
      let body = parseBody(text, { selfIt: self && !left, selfCard: left, eventPlayer: event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "eachUpkeep" || event === "eachDrawStep" || event === "opponentLosesLife", defending: event === "selfAttacks" || event === "selfBecomesBlocked" || event === "selfAttacksUnblocked" || event === "selfAttacksAlone", selfCastSpell: event === "selfCast" });
      if (body && thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, body0) };
      const attacksPlayer = /^Whenever ~ attacks a player, /.test(line);
      const firstAttack = /^Whenever ~ attacks for the first time each turn, /.test(line);
      const saddled = /^Whenever ~ attacks while saddled, /.test(line);
      return body
        ? { event, body, ...(ifKicked ? { ifKicked } : {}), ...(ifSneaked ? { ifSneaked } : {}), ...(attacksPlayer ? { attacksPlayer } : {}), ...(firstAttack ? { firstAttack } : {}), ...(saddled ? { activeIf: { kind: "self" as const, is: "saddled" as const } } : {}) }
        : ("fail" as const);
    }
  }
  return "fail" as const;
}

/** The text shown for a trigger whose "that much" was parsed as X: the words it had ("loses that much life"). */
function unX(text: string, original: string): string {
  const words = [...original.matchAll(/\bthat (?:much|many)\b/g)].map((m) => m[0]);
  let i = 0;
  return text.replace(/\bX\b/g, (x) => words[i++] ?? x);
}
