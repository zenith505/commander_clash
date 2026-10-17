import type { BatchTrigger, Effect, TriggeredAbility, SpellCondition, SpentReq, StaticCondition, TargetSpec, TriggerEvent } from "../abilities";
import { COUNTER, NUM, X, num, parseSpentReq, singularWord, SPENT } from "./words";
import { parseStaticCondition } from "./statics";
import { parseBody, replaceX } from "./body";
import { parseGroup, parseKeywordList, parseTargetPhrase } from "./targets";

const TRIGGERS: [RegExp, TriggerEvent][] = [
  [/^When(?:ever)? ~ enters(?: the battlefield)?, (.+)$/, "selfEnters"],
  [/^When(?:ever)? ~ dies, (.+)$/, "selfDies"],
  [/^When(?:ever)? ~ leaves the battlefield, (.+)$/, "selfLeaves"],
  [/^When you lose control of ~, (.+)$/, "selfLostControl"],
  [/^When(?:ever)? ~ is put into (?:a|your) graveyard from the battlefield, (.+)$/, "selfToGraveyard"],
  // Haunt (CR 702.55b-c): it triggers from exile, see "hauntedDies".
  [/^When the creature ~ haunts dies, (.+)$/, "hauntedDies"],
  [/^When(?:ever)? ~ becomes the target of a spell or ability, (.+)$/, "selfBecomesTarget"],
  [/^At the beginning of (?:the|each) end step, (.+)$/, "eachEndStep"],
  [/^When you cast (?:this spell|~), (.+)$/, "selfCast"],
  [/^When(?:ever)? ~ attacks, (.+)$/, "selfAttacks"],
  // Attacking a planeswalker isn't attacking a player (rulings): see TriggeredAbility.attacksPlayer.
  // "Whenever ~ attacks an opponent" (Kaalia of the Vast): every player it can attack is an opponent (CR 506.2, 102.3).
  [/^Whenever ~ attacks (?:a player|an opponent), (.+)$/, "selfAttacks"],
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
  [/^Whenever you collect evidence, (.+)$/, "youCollectEvidence"],
  [/^Whenever you complete a dungeon, (.+)$/, "youCompleteDungeon"],
  [/^Whenever you commit a crime, (.+)$/, "youCommitCrime"], // CR 700.13
  [/^Whenever an opponent commits a crime, (.+)$/, "opponentCommitsCrime"],
  [/^Whenever you choose a creature as your Ring-bearer, (.+)$/, "youChooseRingBearer"],
  [/^Whenever an opponent loses life, (.+)$/, "opponentLosesLife"],
  [/^Whenever you're dealt damage, (.+)$/, "youAreDealtDamage"],
  [/^Whenever an opponent is dealt damage, (.+)$/, "opponentIsDealtDamage"],
  [/^Whenever enchanted player is dealt damage, (.+)$/, "enchantedPlayerDealtDamage"],
  [/^At the beginning of your upkeep, (.+)$/, "yourUpkeep"],
  [/^At the beginning of each (?:player's )?upkeep, (.+)$/, "eachUpkeep"],
  [/^At the beginning of your draw step, (.+)$/, "yourDrawStep"],
  [/^At the beginning of each player's draw step, (.+)$/, "eachDrawStep"],
  [/^At the beginning of your end step, (.+)$/, "yourEndStep"],
  // Main phases (CR 505.1a): the first one is the precombat main phase, every other one a postcombat main phase.
  [/^At the beginning of (?:your (?:first|precombat) main phase|each of your precombat main phases), (.+)$/, "yourFirstMain"],
  [/^At the beginning of each player's (?:first|precombat) main phase, (.+)$/, "eachFirstMain"],
  [/^At the beginning of (?:your postcombat main phase|each of your postcombat main phases), (.+)$/, "yourPostcombatMain"],
  [/^At the beginning of each postcombat main phase, (.+)$/, "eachPostcombatMain"],
  [/^At the beginning of each of your main phases, (.+)$/, "yourMain"],
  [/^When ~ is turned face up, (.+)$/, "selfTurnedFaceUp"],
  [/^Whenever ~ becomes tapped, (.+)$/, "selfBecomesTapped"],
  [/^When ~ becomes monstrous, (.+)$/, "selfBecomesMonstrous"],
  [/^Whenever you exert a creature, (.+)$/, "youExert"],
  [/^When(?:ever)? ~ exploits a creature, (.+)$/, "selfExploits"],
  // Heroic (an ability word): "Whenever you cast a spell that targets ~".
  [/^Whenever you cast a spell that targets ~, (.+)$/, "selfTargetedByYourSpell"],
];

const SELF_EVENTS: TriggerEvent[] = [
  "selfEnters", "selfDies", "selfLeaves", "selfLostControl", "selfToGraveyard", "selfBecomesTarget", "selfAttacks", "selfAttacksOrBlocks", "selfDealsCombatDamageToPlayer", "selfTurnedFaceUp",
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
    // "With mana value less than or equal to that damage" (Glamdring): the damage dealt, like "that much".
    const thatMuch = o.thatMuch && /\bthat (?:much|many)\b|\bless than or equal to that damage\b/.test(text);
    if (thatMuch) {
      if (/\bX\b/.test(text)) return "fail";
      text = text.replace(/\bthat (?:much|many)\b/g, "X").replace(/\bless than or equal to that damage\b/g, "less than or equal to X");
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
const CAST_TRIGGER = /^When(?:ever)? (you|an opponent|a player|enchanted player) casts? (or copy |or copies )?(an? .+?)(?: spell)?, (.+)$/;
const CAST_BY = { you: "you", "an opponent": "opponent", "a player": "any", "enchanted player": "enchanted" } as const;

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
  let what = m[3]!.replace(/^an? /, "");
  // "A creature spell with power 5 or greater" (Monstrous Vortex): the spell's power on the stack (spellMatches).
  const pw = / with (power|toughness) (\d+) or (greater|less)$/.exec(what);
  if (pw) what = what.slice(0, pw.index);
  // "a spell of the chosen color", "a creature spell of the chosen type": the choice made as this permanent entered.
  const parsed = /^spell$/.test(what) ? { kind: "spell" as const, text: "spell" } : parseTargetPhrase(/\bspell\b/.test(what) ? what : `${what} spell`, { chosen: true });
  if (!parsed || parsed.kind !== "spell" || (pw && !parsed.types?.includes("Creature"))) return "fail";
  const range = pw && (pw[3] === "greater" ? { min: Number(pw[2]) } : { max: Number(pw[2]) });
  const spell = range ? { ...parsed, [pw![1] as "power" | "toughness"]: range } : parsed;
  if (pw) what = m[3]!.replace(/^an? /, "");
  // "Whenever you cast a spell, if mana from a Treasure was spent to cast it, ..." (CR 106.3): an intervening if (CR
  // 603.4) that can't change once it's cast. A copy wasn't cast, so no mana was spent on it.
  const treasure = /^if mana from a Treasure was spent to cast it, (.+)$/.exec(m[4]!);
  if (treasure && m[2]) return "fail";
  // "If at least four mana was spent to cast it", "if no mana was spent to cast it" (CR 601.2h): the same.
  const spentIf = new RegExp(`^if ${SPENT} was spent to cast (?:it|that spell), (.+)$`).exec(m[4]!);
  const spent = spentIf ? parseSpentReq(spentIf[1]!) : undefined;
  if (spentIf && (m[2] || !spent)) return "fail";
  // "That player" is the one who cast it.
  // "If eight or more mana was spent to cast that spell, ... it deals that much damage to each opponent" (Tellah): the
  // mana spent to cast it (CR 601.2h), which the cast event carries.
  let text = treasure ? treasure[1]! : spentIf ? spentIf[2]! : m[4]!;
  const thatMuch = /\bIf [^.,]+ mana was spent to cast that spell, [^.]*\bthat much\b/.test(text) && !/\bX\b/.test(text) && !m[2];
  if (thatMuch) text = text.replace(/\bthat much\b/g, "X");
  let body = parseBody(text, { castSpell: true, eventPlayer: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: body.text.replace(/\bX\b/g, "that much") };
  return { event: "castSpell", cast: { by: CAST_BY[m[1] as keyof typeof CAST_BY], spell: { ...spell, text: /\bspell\b/.test(what) ? what : `${what} spell` }, ...(m[2] ? { orCopy: true } : {}), ...(treasure ? { treasure: true as const } : {}), ...(spent ? { spent } : {}) }, body };
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
  const ench = ENCHANTED_CONTROLS.test(phrase);
  const filter = ench ? enchantedControls(phrase) : parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object") return "fail";
  // "That land's controller" (Zo-Zu), and "that player" after "a creature an opponent controls" (Suture Priest): the
  // entering permanent's controller.
  let bodyText = ench ? m[4]!.replace(/\bthat player\b/g, "enchanted player") : m[4]!.replace(/\bthat (?:land|artifact|creature|permanent|enchantment)'s controller\b/g, "its controller");
  if (!ench && filter.controller === "opponent") bodyText = bodyText.replace(/\bthat player\b/g, "its controller");
  const body = parseBody(bodyText, { subjectIt: true });
  if (!body) return "fail";
  const kind = m[1]!.toLowerCase();
  return {
    event: "permanentEnters",
    enters: { filter: { ...filter, text: phrase }, ...(kind === "another" ? { other: true } : {}), ...(kind === "~ or another" ? { orSelf: true } : {}) },
    body,
  };
}

const ENCHANTED_CONTROLS = / enchanted (?:player|opponent) controls$/;

/** "A creature enchanted player controls" (an Aura with "enchant player", CR 702.5d), only in enters and dies triggers. */
function enchantedControls(phrase: string): TargetSpec | null {
  const spec = parseTargetPhrase(phrase.replace(ENCHANTED_CONTROLS, " you control"));
  return spec?.kind === "object" && spec.controller === "you" ? { ...spec, controller: "enchanted" } : null;
}

// "Is put into a graveyard from the battlefield" is what "dies" means (CR 700.4), for any permanent.
const DIES_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) (dies|is put into a graveyard from the battlefield|leaves the battlefield(?: without dying)?), (.+)$/;

/**
 * "Whenever another creature dies", "Whenever a creature you control dies", "Whenever ~ or another Zombie
 * you control dies", "Whenever a creature dealt damage by ~ this turn dies", "Whenever equipped creature
 * dies": "it" and "that card" are the card in the graveyard, "its power" as it last existed (CR 603.10a).
 */
function parseDiesTrigger(line: string): TriggeredAbility | "fail" | null {
  const attached = /^When(?:ever)? (equipped|enchanted) creature dies, (.+)$/.exec(line);
  const m = attached ? null : DIES_TRIGGER.exec(line);
  if (!attached && !m) return null;
  const ench = !attached && ENCHANTED_CONTROLS.test(m![2]!);
  // "That player" in a trigger about what enchanted player controls is that player.
  let bodyText = (attached ? attached[2]! : m![4]!).replace(ench ? /\bthat player\b/g : /$^/, "enchanted player");
  // "That land's controller", and "that player" after "an artifact an opponent controls": who controlled it as it last
  // existed (CR 603.10a).
  if (!attached) {
    bodyText = bodyText.replace(/\bthat (?:land|artifact|creature|permanent|enchantment)'s controller\b/g, "its controller");
    if (/ an opponent controls$/.test(m![2]!)) bodyText = bodyText.replace(/\bthat player\b/g, "its controller");
  }
  // "Whenever another Zombie you control dies, if it didn't have decayed, ..." (Wilhelt): an intervening if (CR 603.4) on
  // the creature as it last existed (CR 603.10a), which can't change, so part of what dies.
  const leaves = !attached && m![3]!.startsWith("leaves");
  // "Whenever another creature you control leaves the battlefield, if it didn't die, ..." (Taeko): where it went can't
  // change, so it's part of the event, like "without dying".
  const didntDie = leaves && /^if it didn't die, /.exec(bodyText);
  if (didntDie) bodyText = bodyText.slice(didntDie[0].length);
  const notDies = !!didntDie || (!attached && m![3]! === "leaves the battlefield without dying");
  // "If it had a counter on it", "if it had one or more counters on it": as it last existed, so it can't change.
  const hadCounter = !attached && /^if it had (?:a counter|one or more counters|counters) on it, /.exec(bodyText);
  if (hadCounter) bodyText = bodyText.slice(hadCounter[0].length);
  const hadKw = attached ? null : /^if it (didn't have|had) ([\w ]+?), (.+)$/.exec(bodyText);
  const kw = hadKw ? parseKeywordList(hadKw[2]!) : null;
  if (hadKw && kw?.length !== 1) return "fail";
  if (hadKw) bodyText = hadKw[3]!;
  const body = parseBody(bodyText, { subjectIt: true, subjectLeft: true });
  if (!body) return "fail";
  if (attached) return { event: "permanentDies", dies: { filter: { kind: "object", types: ["Creature"], text: "creature" }, attached: true }, body };
  let phrase = m![2]!;
  const damaged = / dealt damage by ~ this turn$/.exec(phrase);
  if (damaged) phrase = phrase.slice(0, damaged.index);
  const filter = ench ? enchantedControls(phrase) : parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object") return "fail";
  const kind = m![1]!.toLowerCase();
  const had = hadKw && kw ? (hadKw[1] === "had" ? { keywords: [...(filter.keywords ?? []), ...kw] } : { notKeywords: [...(filter.notKeywords ?? []), ...kw] }) : {};
  return {
    event: "permanentDies",
    dies: {
      filter: { ...filter, ...had, text: hadKw ? `${phrase} ${hadKw[1] === "had" ? "with" : "without"} ${hadKw[2]}` : phrase },
      ...(kind === "another" ? { other: true } : {}),
      ...(kind === "~ or another" ? { orSelf: true } : {}),
      ...(damaged ? { damagedBySelf: true } : {}),
      ...(leaves ? { leaves: true as const } : {}),
      ...(notDies ? { notDies: true as const } : {}),
      ...(hadCounter ? { hadCounter: true as const } : {}),
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
  if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length || filter.allTypes?.includes("Creature") || filter.commander)) return "fail";
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
 * "Whenever a creature you control attacks, it gets +2/+2 until end of turn" (Fervent Charge), "Whenever a Dragon you
 * control attacks, bolster 2", "Whenever another creature you control attacks": once for each such creature as it's
 * declared as an attacker (CR 508.3a), not one put onto the battlefield attacking (508.4). "It" and "that creature" are
 * the attacker; "defending player" is the player it's attacking (CR 508.5a).
 */
function parseAttackerTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (another|an?) (.+?) you control attacks, (.+)$/.exec(line);
  if (!m) return null;
  const filter = parseTargetPhrase(m[2]!);
  if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length || filter.allTypes?.includes("Creature") || filter.commander)) return "fail";
  const body = parseBody(m[3]!.replace(/\bthat creature\b/g, "it"), { subjectIt: true, defending: true });
  if (!body) return "fail";
  return { event: "creatureYouControlAttacks", attacker: { filter: { ...filter, controller: "you", text: `${m[2]} you control` }, ...(m[1] === "another" ? { other: true } : {}) }, body };
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

/** "Other creatures you control", "tokens you control", "artifacts and/or creatures you control": what a batch trigger counts. */
function batchPermanents(phrase: string): { filter: TargetSpec; other: boolean } | null {
  const other = /^other /.test(phrase);
  const p = phrase.replace(/^other /, "");
  const group = parseGroup(p, true);
  if (group) return { filter: group.filter, other };
  const one = p.replace(/,? and\/or /g, (x) => x.replace("and/or", "or")).replace(/ your opponents control\b/, " an opponent controls").split(/(\s+|,)/).map((w) => (/^[\s,]*$/.test(w) ? w : singularWord(w))).join("");
  const spec = parseTargetPhrase(one);
  return spec?.kind === "object" ? { filter: { ...spec, text: phrase }, other } : null;
}

/** "Creature cards", "artifact and/or creature cards", "cards": the cards a batch trigger counts. */
function batchCards(kind: string | undefined): TargetSpec | undefined | null {
  if (!kind) return undefined;
  const spec = parseTargetPhrase(`${kind.replace(/ and\/or /g, " or ")} card from a graveyard`);
  if (spec?.kind !== "card") return null;
  const { owner: _, ...rest } = spec;
  return { ...rest, text: `${kind} cards` };
}

/**
 * "Whenever one or more cards leave your graveyard", "Whenever one or more tokens you control enter", "Whenever one or more
 * other creatures die", "Whenever one or more creature cards are put into your graveyard from anywhere", "Whenever you
 * discard one or more cards": once for each event that moves one or more of them (CR 603.2c). "That many" is how many.
 * What the event moved as a group ("them", "those cards", "one of them") isn't modeled.
 */
function parseBatchTrigger(line: string): TriggeredAbility | "fail" | null {
  let m: RegExpExecArray | null;
  let batch: BatchTrigger;
  let rest: string;
  let yourTurn = false;
  if ((m = /^Whenever one or more (?:(.+?) )?cards (leave your graveyard|are put into exile from your graveyard)( during your turn)?, (.+)$/.exec(line))) {
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    batch = { what: "leavesGraveyard", whose: "you", ...(filter ? { filter } : {}), ...(m[2] !== "leave your graveyard" ? { to: "exile" as const } : {}) };
    yourTurn = !!m[3];
    rest = m[4]!;
  } else if ((m = /^Whenever one or more (?:(.+?) )?cards are put into your graveyard from (anywhere|your library)( during your turn)?, (.+)$/.exec(line))) {
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    batch = { what: "toGraveyard", whose: "you", ...(filter ? { filter } : {}), ...(m[2] === "your library" ? { from: "library" as const } : {}) };
    yourTurn = !!m[3];
    rest = m[4]!;
  } else if ((m = /^Whenever (you|one or more players) discards? one or more (?:(.+?) )?cards( for the first time each turn)?, (.+)$/.exec(line))) {
    const filter = batchCards(m[2]);
    if (filter === null) return "fail";
    batch = { what: "discards", ...(m[1] === "you" ? { whose: "you" as const } : {}), ...(filter ? { filter } : {}), ...(m[3] ? { first: true as const } : {}) };
    rest = m[4]!;
  } else if ((m = /^Whenever ~ and\/or one or more other (.+?) enter, (.+)$/.exec(line))) {
    // "Whenever ~ and/or one or more other Vampires you control enter" (Anje): it or any of the others (CR 603.2c).
    const what = batchPermanents(`other ${m[1]!}`);
    if (!what?.other) return "fail";
    batch = { what: "enters", filter: what.filter, other: true, orSelf: true };
    rest = m[2]!;
    // Satoru: "if none of them were cast or no mana was spent to cast them": none of them was cast with mana spent on it.
    const none = /^if none of them were cast or no mana was spent to cast them, (.+)$/.exec(rest);
    if (none) {
      batch.noneCastWithMana = true;
      rest = none[1]!;
    }
  } else if ((m = /^Whenever one or more (.+?) (enter|die|leave the battlefield( without dying)?|are put into a graveyard from the battlefield)( during your turn)?, (.+)$/.exec(line))) {
    const what = batchPermanents(m[1]!);
    if (!what) return "fail";
    const verb = m[2]!;
    // "Creatures die": only a creature dies (CR 700.4), as it last existed.
    if (verb === "die" && !(what.filter.types?.includes("Creature") || what.filter.allTypes?.includes("Creature") || what.filter.subtypes?.length)) return "fail";
    batch = {
      what: verb === "enter" ? "enters" : "leaves",
      filter: what.filter,
      ...(what.other ? { other: true as const } : {}),
      ...(verb === "die" || /^are put/.test(verb) ? { dies: true as const } : {}),
      ...(m[3] ? { notDies: true as const } : {}),
    };
    yourTurn = !!m[4];
    rest = m[5]!;
  } else return null;
  // The objects as a group: not modeled.
  if (/\b(it|its|they|them|their|those|that card|that creature|that token|one of them|among them|this way)\b/i.test(rest)) return "fail";
  let text = rest;
  const thatMuch = /\bthat (?:much|many)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, {});
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, rest) };
  return { event: "batch", batch, body, ...(yourTurn ? { activeIf: { kind: "yourTurn" as const } } : {}) };
}

/**
 * "Whenever a player activates an ability that isn't a mana ability" (Burning-Tree Shaman), "Whenever an opponent
 * activates an ability of an artifact, creature, or land that isn't a mana ability" (Immolation Shaman), "... on the
 * battlefield, if it isn't a mana ability" (Harsh Mentor). One that mana abilities trigger too isn't modeled.
 */
function parseActivatesTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (a player|an opponent) activates an ability( of (?:an?|another) (.+?)(?: on the battlefield)?)?(?: that isn't a mana ability|, if it isn't a mana ability), (.+)$/.exec(line);
  if (!m) return /^Whenever (a player|an opponent|you) activates an? /.test(line) ? "fail" : null;
  let of: TargetSpec | undefined;
  if (m[2]) {
    const f = parseTargetPhrase(m[3]!);
    if (f?.kind !== "object") return "fail";
    of = f;
  }
  const body = parseBody(theyAreThatPlayer(m[4]!), { eventPlayer: true });
  if (!body) return "fail";
  return { event: "abilityActivated", activates: { by: m[1] === "an opponent" ? "opponent" : "any", ...(of ? { of } : {}) }, body };
}

function parseDrawTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (you|an opponent|a player|enchanted player|enchanted opponent) draws? (a card|your (first|second|third) card each turn), (.+)$/.exec(line);
  if (!m) return null;
  const body = parseBody(theyAreThatPlayer(m[4]!), { eventPlayer: true });
  if (!body) return "fail";
  const by = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : /^enchanted /.test(m[1]!) ? "enchanted" : "any";
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

/** "They lose 2 life", "~ deals 2 damage to them": the trigger's player, "that player". */
const theyAreThatPlayer = (text: string) => text.replace(/^they (lose|draw|discard|mill|sacrifice|exile)s? /, (_, v: string) => `that player ${v === "lose" ? "loses" : `${v}s`} `).replace(/ to them\.$/, " to that player.");

/**
 * Triggers about the player an Aura with "enchant player" enchants (CR 702.5d): "At the beginning of enchanted player's
 * upkeep" (only on that player's turn; "that player" is that player), "Whenever a creature attacks enchanted player"
 * (that creature is the subject), "Whenever enchanted player is attacked" (once as attackers are declared; "each
 * opponent attacking that player does the same": each opponent of its controller with a creature attacking them).
 */
function parseEnchantedPlayerTrigger(line: string): TriggeredAbility | "fail" | null {
  const step = /^At the beginning of enchanted (?:player|opponent)'s (upkeep|draw step|end step), (.+)$/.exec(line);
  if (step) {
    const event = step[1] === "upkeep" ? "eachUpkeep" : step[1] === "draw step" ? "eachDrawStep" : "eachEndStep";
    // "That player draws two additional cards" in their draw step: a trigger, so they just draw two more.
    const body = parseBody(theyAreThatPlayer(step[2]!).replace(/^that player draws (\w+) additional cards?\.$/, "that player draws $1 cards."), { eventPlayer: true });
    return body ? { event, body, enchantedPlayersTurn: true } : "fail";
  }
  const attacks = /^Whenever a creature attacks enchanted player, (.+)$/.exec(line);
  if (attacks) {
    const body = parseBody(attacks[1]!.replace(/\bthat creature\b/g, "it"), { subjectIt: true });
    return body ? { event: "creatureAttacksEnchantedPlayer", body } : "fail";
  }
  const attacked = /^Whenever enchanted player is attacked, (.+)$/.exec(line);
  if (attacked) {
    const same = / Each opponent attacking that player does the same\.$/;
    const body = parseBody(attacked[1]!.replace(same, ""), { eventPlayer: true });
    if (!body) return "fail";
    if (!same.test(attacked[1]!)) return { event: "enchantedPlayerAttacked", body };
    // "Does the same": what "you" did, for each of them.
    const again = body.effects.map((e) => ((e.type === "draw" || e.type === "gainLife" || e.type === "createToken") && e.who.ref === "you" ? { ...e, who: { ref: "opponentsAttackingEventPlayer" as const } } : null));
    if (body.targets.length || again.some((e) => !e)) return "fail";
    return { event: "enchantedPlayerAttacked", body: { ...body, effects: [...body.effects, ...(again as Effect[])], text: attacked[1]! } };
  }
  return null;
}

/** The events that abilities of cards in graveyards see (fireEvent's `fromGraveyards`). */
const YARD_EVENTS: TriggerEvent[] = ["castSpell", "youCommitCrime", "permanentEnters", "landYouControlEnters", "anotherCreatureYouControlEnters", "creaturesYouControlAttack", "creaturesYouControlDealCombatDamageToPlayer", "yourUpkeep", "eachUpkeep", "yourDrawStep", "eachDrawStep", "yourEndStep", "eachEndStep", "yourBeginCombat", "eachBeginCombat", "yourEndCombat", "eachEndCombat"];

export function parseTrigger(raw: string): TriggeredAbility | "fail" | null {
  // An ability word ("Magecraft —", "Landfall —") has no rules meaning (CR 207.2c).
  const line = raw.replace(/^[A-Z][A-Za-z' -]+ — (?=(When|Whenever|At)\b)/, "");
  if (!/^(When|Whenever|At)\b/.test(line)) return null;
  // "When this Class becomes level 2, draw two cards" (CR 716.2a).
  const level = /^When ~ becomes level (\d+), (.+)$/.exec(line);
  if (level) {
    const body = parseBody(level[2]!, { selfIt: true });
    return body ? { event: "selfBecomesLevel", level: Number(level[1]), body } : "fail";
  }
  // Vazi: "Whenever an opponent casts a spell or activates an ability, if mana from a Treasure was spent to cast it or
  // activate it, ...": the cast trigger, which an activation (of any ability, CR 602.2) with a Treasure's mana also triggers.
  const orActivates = /^Whenever (an opponent|you|a player) casts? a spell or activates? an ability, if mana from a Treasure was spent to cast it or activate it, (.+)$/.exec(line);
  if (orActivates) {
    const t = parseTrigger(`Whenever ${orActivates[1]} ${orActivates[1] === "you" ? "cast" : "casts"} a spell, if mana from a Treasure was spent to cast it, ${orActivates[2]}`);
    if (!t || t === "fail" || !t.cast?.treasure || /\b(it|that spell|that player)\b/.test(orActivates[2]!)) return "fail";
    return { ...t, cast: { ...t.cast, orActivates: true } };
  }
  // Krovikan Vampire: "At the beginning of each end step, if a creature dealt damage by ~ this turn died, put that card
  // onto the battlefield under your control. Sacrifice it when you lose control of ~." Every such card still in a
  // graveyard as it resolves, even one that died in response (rulings); an intervening if (CR 603.4).
  if (/^At the beginning of each end step, if a creature dealt damage by ~ this turn died, put that card onto the battlefield under your control\. Sacrifice it when you lose control of ~\.$/.test(line))
    return {
      event: "eachEndStep",
      ifCond: { kind: "damagedBySelfDied" },
      body: { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "diedDamagedBySelf" }, sacrificeOnLostControl: true }], text: "Put each creature card dealt damage by ~ this turn that died onto the battlefield under your control. Sacrifice it when you lose control of ~." },
    };
  // Rolling dice (CR 706): "whenever you roll one or more dice" once for each instruction to roll; "whenever you roll a 4
  // or higher", "when you roll a natural 20", "whenever you roll a die's highest natural result" once for each die that
  // does (rulings on Mr. House and Netherese Puzzle-Ward). Ignored rolls never happened (706.6).
  const rolls = /^Whenever you roll one or more dice, (.+)$/.exec(line);
  if (rolls) {
    const body = parseBody(rolls[1]!, {});
    return body ? { event: "youRollDice", body } : "fail";
  }
  const die = /^Whenever you roll an? (\d+) or higher, (.+)$/.exec(line) ?? /^When(?:ever)? you roll (a natural (\d+)|a die's highest natural result), (.+)$/.exec(line);
  if (die) {
    const natural = /^When/.test(line) && die.length === 4;
    const what = natural ? (die[2] ? { natural: Number(die[2]) } : { natural: "max" as const }) : { min: Number(die[1]) };
    let text = die[die.length - 1]!;
    // Mr. House: "If you rolled 6 or higher, instead [do this]": that die's result (the trigger's event).
    const instead = /^(.+?)\. If you rolled (\d+) or higher, instead create that token and (an? [^.]+ token)\.$/.exec(text);
    if (instead) {
      const base = parseBody(`${instead[1]}.`, {});
      const more = parseBody(`Create ${instead[3]}.`, {});
      if (!base || !more || base.targets.length || !/^create an? [^.]+ token$/i.test(instead[1]!)) return "fail";
      text = text.replace(/\.$/, "");
      const body = { targets: [], effects: [{ type: "if" as const, cond: { kind: "rollIn" as const, min: Number(instead[2]), event: true as const }, effects: [...structuredClone(base.effects), ...more.effects], otherwise: base.effects }], text: `${text}.` };
      return { event: "youRollDie", rolls: what, body };
    }
    const zone = /\breturn ~ from your graveyard to your hand$/.test(text.replace(/\.$/, "")) ? { zone: "graveyard" as const } : {};
    const body = parseBody(`${text[0]!.toUpperCase()}${text.slice(1)}`, zone.zone ? { selfCard: true } : {});
    return body ? { event: "youRollDie", rolls: what, body, ...zone } : "fail";
  }
  // "This ability triggers only once each turn": once it has triggered this turn, it doesn't again (the object's own
  // count; a new object starts over, CR 400.7).
  const once = /^(.+?) This ability triggers only once each turn\.?$/.exec(line);
  if (once) {
    const t = parseTrigger(once[1]!);
    return t && t !== "fail" && !t.oncePerTurn && t.event !== "state" ? { ...t, oncePerTurn: true } : "fail";
  }
  // "You may draw a card. Do this only once each turn." (CR 603.2h): it triggers only if its controller hasn't done it
  // this turn; choosing to do it is what counts (rulings on Ancient Cornucopia), so a "no" lets it trigger again.
  const doOnce = /^(.+?) Do this only once each turn\.?$/.exec(line);
  if (doOnce) {
    const t = parseTrigger(doOnce[1]!);
    if (!t || t === "fail" || t.oncePerTurn || t.event === "state") return "fail";
    const may = t.body.effects[0];
    // "You may discard a card. If you do, draw a card": choosing to discard is doing it.
    if (may?.type !== "may" || may.once || !t.body.effects.slice(1).every((e) => e.type === "if" && e.cond.kind === "youDid")) return "fail";
    return { ...t, body: { ...t.body, effects: [{ ...may, once: true }, ...t.body.effects.slice(1)] } };
  }
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
  // "At the beginning of your upkeep, if ~ is in your graveyard, you may pay {1}{B}{B}. If you do, return it to your hand"
  // (Pyre Zombie), "... with a creature card directly above it" (Krovikan Horror, Death Spark): an ability of the card
  // in the graveyard (CR 113.6b) with an intervening if (CR 603.4), so it does nothing if the card has left by then
  // (nothing is paid). "Directly above" is the next card put there after it (rulings; see graveyard.ts).
  const inYard = /^(At the beginning of [^,]+), if ~ is in your graveyard( with a creature card directly above it)?, ((?:you may )?(?:pay [^.]+\. If you do, )?)return (?:~|it) to your hand\.$/.exec(line);
  if (inYard) {
    const t = parseTrigger(`${inYard[1]}, ${inYard[3]}return ~ from your graveyard to your hand.`);
    if (!t || t === "fail" || t.zone !== "graveyard" || t.ifCond) return "fail";
    return { ...t, ifCond: { kind: "selfInGraveyard", ...(inYard[2] ? { creatureAbove: true as const } : {}) } };
  }
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
  // "Whenever ~ attacks, if its toughness is 3 or less" (Young Hero Role): its own power or toughness as it triggers and resolves.
  const ptIf = intervening && /^(?:When|Whenever) ~ /.test(intervening[1]!) ? new RegExp(`^(?:its|~'s) (power|toughness) is ${NUM} or (less|greater)$`).exec(intervening[2]!) : null;
  const ptCond = ptIf && ({ kind: "selfPT", stat: ptIf[1] as "power" | "toughness", ...(ptIf[3] === "less" ? { max: num(ptIf[2]!) } : { min: num(ptIf[2]!) }) } as const);
  // "When this token enters, if it's a creature, ..." (Mythos of Illuna's token): its card type as it triggers and
  // resolves (CR 603.4, rulings).
  const typeIf = intervening && /^(?:When|Whenever) ~ /.test(intervening[1]!) ? /^(?:it's|~ is) an? (creature|artifact|enchantment|land)$/.exec(intervening[2]!) : null;
  const typeCond: StaticCondition | null = typeIf && { kind: "selfIs", filter: { kind: "object", types: [(typeIf[1]!.charAt(0).toUpperCase() + typeIf[1]!.slice(1)) as "Creature"], text: typeIf[1]! } };
  const ifCond = typeCond ? typeCond : ptCond ? ptCond : handCond ? ({ kind: "eventPlayerHand", ...handCond } as const) : intervening && !aboutIt && parseStaticCondition(intervening[2]!, { affects: { kind: "self" }, mods: [], text: "" });
  // "That player" is the attacked player only in "Whenever ~ attacks a player".
  if (ifCond && ifCond.kind === "defenderMostLife" && !/^Whenever ~ attacks a player$/.test(intervening![1]!)) return "fail";
  if (intervening && ifCond) {
    // Feast of the Victorious Dead: "if one or more creatures died this turn, you gain that much life and distribute that
    // many +1/+1 counters": the number of creatures that died this turn, counted as it resolves.
    let rest = intervening[3]!;
    if (/^one or more creatures died this turn$/.test(intervening[2]!) && /\bthat (much|many)\b/.test(rest)) {
      const died = "the number of creatures that died this turn";
      rest = rest.replace(/\byou gain that much life\b/g, `you gain life equal to ${died}`).replace(new RegExp(`\\bdistribute that many ${COUNTER} counters\\b`, "g"), `distribute a number of $1 counters equal to ${died}`).replace(/ and (distribute a number of)/, ". Distribute a number of");
      if (/\bthat (much|many)\b/.test(rest)) return "fail";
    }
    const t = parseTrigger(`${intervening[1]}, ${rest}`);
    return t && t !== "fail" && !t.ifCond ? { ...t, ifCond } : "fail";
  }
  // "At the beginning of your second main phase": the turn's second main phase, a postcombat one (CR 505.1a-b).
  const second = /^At the beginning of your second main phase, (.+)$/.exec(line);
  if (second) {
    const t = parseTrigger(`At the beginning of your postcombat main phase, ${second[1]}`);
    return t && t !== "fail" ? { ...t, secondMain: true } : "fail";
  }
  // "At the beginning of each opponent's upkeep, ~ deals 1 damage to that player": an "each upkeep" trigger that
  // triggers only on its controller's opponents' turns; "that player" is the active player.
  // "At the beginning of combat on each opponent's turn, tap target creature that player controls" (Citadel Siege, CR 507.1).
  const oppStep = /^At the beginning of each opponent's (upkeep|draw step|end step), (.+)$/.exec(line) ?? /^At the beginning of (combat) on each opponent's turn, (.+)$/.exec(line);
  if (oppStep) {
    const event = oppStep[1] === "upkeep" ? "eachUpkeep" : oppStep[1] === "draw step" ? "eachDrawStep" : oppStep[1] === "combat" ? "eachBeginCombat" : "eachEndStep";
    // "They lose 2 life", "~ deals 2 damage to them": that player.
    const body = parseBody(oppStep[2]!.replace(/^they lose /, "that player loses ").replace(/ to them\.$/, " to that player."), { eventPlayer: true });
    return body ? { event, body, opponentsTurn: true } : "fail";
  }
  const enchanted = parseEnchantedPlayerTrigger(line);
  if (enchanted) return enchanted;
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
  const batch = parseBatchTrigger(line);
  if (batch) return batch;
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
  const activates = parseActivatesTrigger(line);
  if (activates) return activates;
  const dies = parseDiesTrigger(line);
  if (dies) return dies;
  const dealer = parseDealerTrigger(line);
  if (dealer) return dealer;
  const attacker = parseAttackerTrigger(line);
  if (attacker) return attacker;
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
  // "Whenever you commit a crime during your turn" (Overzealous Muscle, CR 700.13): only while it's your turn, whether it
  // triggers at all, not an intervening if.
  const crime = /^Whenever you commit a crime during your turn, (.+)$/.exec(line);
  if (crime) {
    const body = parseBody(crime[1]!, { selfIt: true });
    return body ? { event: "youCommitCrime", body, activeIf: { kind: "yourTurn" } } : "fail";
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
      // "When ~ enters, if it was bargained, ..." (CR 702.166b).
      let ifBargained = false;
      const bargained = /^if it was bargained, (.+)$/i.exec(body0);
      if (bargained) {
        if (event !== "selfEnters") return "fail" as const;
        ifBargained = true;
        body0 = bargained[1]!;
      }
      // "When ~ enters, if evidence was collected, ..." (CR 701.59c).
      let ifEvidence = false;
      const evidence = /^if evidence was collected, (.+)$/i.exec(body0);
      if (evidence) {
        if (event !== "selfEnters") return "fail" as const;
        ifEvidence = true;
        body0 = evidence[1]!;
      }
      // "When ~ enters, if mana from a Treasure was spent to cast it, ..." (CR 106.3).
      let ifTreasure = false;
      const treasure = /^if mana from a Treasure was spent to cast it, (.+)$/i.exec(body0);
      if (treasure) {
        if (event !== "selfEnters") return "fail" as const;
        ifTreasure = true;
        body0 = treasure[1]!;
      }
      // "When ~ enters, if {R} was spent to cast it, ...", adamant's "if at least three mana of the same color was spent to
      // cast it": an intervening if (CR 603.4) on the mana spent to cast it (CR 601.2h), which can't change.
      let ifSpent: SpentReq | undefined;
      const spentIf = new RegExp(`^if ${SPENT} was spent to cast it, (.+)$`, "i").exec(body0);
      if (spentIf) {
        const req = parseSpentReq(spentIf[1]!);
        if (event !== "selfEnters" || !req) return "fail" as const;
        ifSpent = req;
        body0 = spentIf[2]!;
      }
      // "When ~ enters, if you cast it from your hand, ..." (a commander cast from the command zone wasn't, rulings on
      // Phage the Untouchable): an intervening if (CR 603.4) on how it got there, which can't change.
      let ifCastFromHand: boolean | undefined;
      const fromHand = /^if you (didn't )?cast it from your hand, (.+)$/i.exec(body0);
      if (fromHand) {
        if (event !== "selfEnters") return "fail" as const;
        ifCastFromHand = !fromHand[1];
        body0 = fromHand[2]!;
      }
      // "When ~ enters, if it's on the battlefield, ..." (Stalking Yeti): an intervening if (CR 603.4), so the ability does
      // nothing once it has left.
      let onField = false;
      const here = /^if it's on the battlefield, (.+)$/i.exec(body0);
      if (here) {
        if (event !== "selfEnters") return "fail" as const;
        onField = true;
        body0 = here[1]!;
      }
      // "When ~ enters, if you cast it, ..." (Geological Appraiser): an intervening if (CR 603.4) on how it got there.
      let ifCast = false;
      const wasCast = /^if you cast it, (.+)$/i.exec(body0);
      if (wasCast) {
        if (event !== "selfEnters") return "fail" as const;
        ifCast = true;
        body0 = wasCast[1]!;
      }
      // "When ~ dies, if it had no counters on it, return it ..." (Unstoppable Slasher): an intervening if (CR 603.4) on the
      // creature as it last existed (CR 603.10a), which can't change.
      let ifNoCounters = false;
      const noCounters = /^if it had no counters on it, (.+)$/i.exec(body0);
      if (noCounters) {
        if (event !== "selfDies") return "fail" as const;
        ifNoCounters = true;
        body0 = noCounters[1]!;
      }
      // "When ~ enters, if tribute wasn't paid, ..." (CR 702.104b).
      let ifTributeUnpaid = false;
      const tribute = /^if tribute wasn't paid, (.+)$/i.exec(body0);
      if (tribute) {
        if (event !== "selfEnters") return "fail" as const;
        ifTributeUnpaid = true;
        body0 = tribute[1]!;
      }
      // "When ~ enters, if the gift was promised, ..." (CR 702.174b).
      let ifGift = false;
      const gifted = /^if the gift was promised, (.+)$/i.exec(body0);
      if (gifted) {
        if (event !== "selfEnters") return "fail" as const;
        ifGift = true;
        body0 = gifted[1]!;
      }
      // "When Leonardo enters, if his sneak cost was paid, ..." (CR 702.190a), "if its surge cost was paid" (702.117a),
      // "if its spectacle cost was paid" (702.137a).
      let ifAlt: "sneak" | "surge" | "spectacle" | undefined;
      const altPaid = /^if (?:its|his|her|their) (sneak|surge|spectacle) cost was paid, (.+)$/i.exec(body0);
      if (altPaid) {
        if (event !== "selfEnters") return "fail" as const;
        ifAlt = altPaid[1]!.toLowerCase() as "sneak" | "surge" | "spectacle";
        body0 = altPaid[2]!;
      }
      let text = self ? body0.replace(/^(?:it|he|she) (?=(?:gets|gains|deals|has|becomes|fights|explores)\b)/, "~ ") : body0;
      // "You gain that much life", "put that many +1/+1 counters on it": the damage the event dealt, or the life gained or lost.
      const playerDealt = event === "youAreDealtDamage" || event === "opponentIsDealtDamage" || event === "enchantedPlayerDealtDamage";
      const amount = event === "selfDealsDamage" || event === "selfIsDealtDamage" || event === "selfDealsCombatDamage" || event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "youGainLife" || event === "opponentLosesLife" || playerDealt;
      // "With mana value less than or equal to that damage" (Aisha of Sparks and Smoke, Covert Technician): the damage dealt.
      const damage = amount && event !== "youGainLife" && event !== "opponentLosesLife" && !playerDealt;
      const thatMuch = amount && (/\bthat (?:much|many)\b/.test(text) || (damage && /\bless than or equal to that damage\b/.test(text)));
      if (thatMuch) {
        if (/\bX\b/.test(text)) return "fail" as const;
        text = text.replace(/\bthat (?:much|many)\b/g, "X");
        if (damage) text = text.replace(/\bless than or equal to that damage\b/g, "less than or equal to X");
      }
      // "Put a +1/+1 counter on it", "untap it": in a trigger about the permanent itself, "it" is that
      // permanent, except after it left ("return it to your hand" means the card in the graveyard).
      const left = event === "selfDies" || event === "selfToGraveyard" || event === "selfLeaves";
      // "At the beginning of each player's upkeep, ~ deals 1 damage to them" (Roiling Vortex): that player.
      if (event === "eachUpkeep" || event === "eachDrawStep") text = text.replace(/^~ deals (\d+) damage to them\.$/, "~ deals $1 damage to that player.");
      // "At the beginning of each postcombat main phase, the active player adds ..." (Belbe): that player is the active one.
      if (event === "eachUpkeep" || event === "eachDrawStep" || event === "eachFirstMain" || event === "eachPostcombatMain") text = text.replace(/\bthe active player\b/g, "that player");
      let body = parseBody(text, { selfIt: self && !left, selfCard: left, eventPlayer: event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "eachUpkeep" || event === "eachDrawStep" || event === "eachFirstMain" || event === "eachPostcombatMain" || event === "opponentLosesLife" || event === "opponentIsDealtDamage" || event === "enchantedPlayerDealtDamage", defending: event === "selfAttacks" || event === "selfBecomesBlocked" || event === "selfAttacksUnblocked" || event === "selfAttacksAlone", selfCastSpell: event === "selfCast", ownX: event === "selfEnters" || event === "selfCast" });
      if (body && thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, body0) };
      const attacksPlayer = /^Whenever ~ attacks (?:a player|an opponent), /.test(line);
      const firstAttack = /^Whenever ~ attacks for the first time each turn, /.test(line);
      const saddled = /^Whenever ~ attacks while saddled, /.test(line);
      return body
        ? { event, body, ...(ifNoCounters ? { ifNoCounter: "any" as const } : {}), ...(ifKicked ? { ifKicked } : {}), ...(ifAlt ? { ifAlt } : {}), ...(ifBargained ? { ifBargained } : {}), ...(ifEvidence ? { ifEvidence } : {}), ...(ifTreasure ? { ifTreasure } : {}), ...(ifSpent ? { ifSpent } : {}), ...(ifCastFromHand !== undefined ? { ifCastFromHand } : {}), ...(ifCast ? { ifCast } : {}), ...(ifGift ? { ifGift } : {}), ...(ifTributeUnpaid ? { ifTributeUnpaid } : {}), ...(attacksPlayer ? { attacksPlayer } : {}), ...(firstAttack ? { firstAttack } : {}), ...(saddled ? { activeIf: { kind: "self" as const, is: "saddled" as const } } : {}), ...(onField ? { ifCond: { kind: "self" as const, is: "onBattlefield" as const } } : {}) }
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
