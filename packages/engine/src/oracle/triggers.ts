import { allEffects, type AbilityBody, type BatchTrigger, type Effect, type TriggeredAbility, type SpellCondition, type SpentReq, type StaticCondition, type TargetSpec, type TriggerEvent } from "../abilities";
import { COUNTER, differenceInHand, NUM, X, num, parseSpentReq, singular, singularWord, SPENT } from "./words";
import { parseActivateCondition, parseStaticCondition } from "./statics";
import { parseBody, replaceX } from "./body";
import { ANY_COUNTER } from "../abilities";
import { parseGroup, parseKeywordList, parseTargetPhrase } from "./targets";
import { CREATURE_TYPES } from "../keywords";
import { parseSearchFilter } from "./search";
import { parseCount } from "./counts";
import { parseToken } from "./tokens";
const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

const TRIGGERS: [RegExp, TriggerEvent][] = [
  [/^When(?:ever)? ~ enters(?: the battlefield)?, (.+)$/, "selfEnters"],
  [/^When(?:ever)? ~ dies, (.+)$/, "selfDies"],
  // "When this creature transforms into [this face]" (CR 701.27e): it transformed or converted and now has this face up,
  // so this face's abilities are the ones it has. Entering transformed isn't transforming (712.14a).
  [/^When(?:ever)? ~ transforms into ~, (.+)$/, "selfTransformsInto"],
  // Coin flips (CR 705.2): each one won or lost.
  [/^Whenever you win a coin flip, (.+)$/, "youWinFlip"],
  [/^Whenever you lose a coin flip, (.+)$/, "youLoseFlip"],
  [/^Whenever a player wins a coin flip, (.+)$/, "playerWinsFlip"],
  // The God-Eternals: "When ~ dies or is put into exile from the battlefield" (CR 700.4: "dies" is going to a graveyard).
  [/^When(?:ever)? ~ dies or is put into exile from the battlefield, (.+)$/, "selfDiesOrExiled"],
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
  // "Whenever ~ attacks a battle" (CR 310.5): see TriggeredAbility.attacksBattle.
  [/^Whenever ~ attacks a battle, (.+)$/, "selfAttacks"],
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
  // "To a player or battle": either (TriggeredAbility.orBattle).
  [/^Whenever ~ deals combat damage to a player(?: or battle)?, (.+)$/, "selfDealsCombatDamageToPlayer"],
  [/^Whenever ~ deals combat damage to a player or planeswalker, (.+)$/, "selfDealsCombatDamageToPlayer"],
  [/^Whenever ~ deals combat damage, (.+)$/, "selfDealsCombatDamage"],
  [/^Whenever ~ deals damage to a player, (.+)$/, "selfDealsDamageToPlayer"],
  [/^Whenever ~ deals damage, (.+)$/, "selfDealsDamage"],
  // Damage dealt to it at the same time by several sources is one event (rulings): "that much" is all of it.
  [/^Whenever ~ is dealt damage, (.+)$/, "selfIsDealtDamage"],
  // "Whenever a source deals damage to ~, that source's controller ..." (Phyrexian Obliterator): once for each source
  // that deals it damage at the same time; "that source's controller" is that player (rulings).
  [/^Whenever a source deals damage to ~, (.+)$/, "selfDealtDamageBySource"],
  [/^Whenever another creature you control enters, (.+)$/, "anotherCreatureYouControlEnters"],
  [/^Whenever another creature enters the battlefield under your control, (.+)$/, "anotherCreatureYouControlEnters"],
  // Landfall
  [/^Whenever a land (?:you control enters|enters the battlefield under your control), (.+)$/, "landYouControlEnters"],
  // Blocking (CR 509.3). The "a creature" forms are matched first, by parseBlockTrigger.
  [/^Whenever ~ blocks or becomes blocked, (.+)$/, "selfBlocksOrBecomesBlocked"],
  [/^Whenever ~ becomes blocked, (.+)$/, "selfBecomesBlocked"],
  [/^Whenever ~ attacks and isn't blocked, (.+)$/, "selfAttacksUnblocked"],
  // "Whenever ~ attacks a player and isn't blocked" (Master of Cruelties): not a planeswalker or battle (rulings); "that
  // player" is the defending player. See TriggeredAbility.attacksPlayer.
  [/^Whenever ~ attacks a player and isn't blocked, (.+)$/, "selfAttacksUnblocked"],
  [/^Whenever ~ attacks alone, (.+)$/, "selfAttacksAlone"],
  [/^Whenever ~ blocks, (.+)$/, "selfBlocks"],
  [/^Whenever you gain life, (.+)$/, "youGainLife"],
  [/^Whenever you create a token, (.+)$/, "youCreateToken"], // once for each token (CR 111.2)
  [/^Whenever you collect evidence, (.+)$/, "youCollectEvidence"],
  [/^Whenever you proliferate, (.+)$/, "youProliferate"],
  [/^Whenever you scry or surveil, (.+)$/, "youScryOrSurveil"],
  [/^Whenever you scry, (.+)$/, "youScry"],
  [/^Whenever you surveil, (.+)$/, "youSurveil"],
  [/^Whenever a spell or ability you control counters a spell, (.+)$/, "youCounterSpell"],
  [/^Whenever you complete a dungeon, (.+)$/, "youCompleteDungeon"],
  [/^Whenever you fully unlock a Room, (.+)$/, "youFullyUnlockRoom"],
  [/^Whenever you commit a crime, (.+)$/, "youCommitCrime"], // CR 700.13
  [/^Whenever an opponent commits a crime, (.+)$/, "opponentCommitsCrime"],
  [/^Whenever you choose a creature as your Ring-bearer, (.+)$/, "youChooseRingBearer"],
  [/^Whenever an opponent loses life, (.+)$/, "opponentLosesLife"],
  // Emet-Selch: once for life lost at the same time, however many opponents lost it.
  [/^Whenever one or more opponents lose life, (.+)$/, "opponentsLoseLife"],
  [/^Whenever an opponent gains life, (.+)$/, "opponentGainsLife"],
  [/^Whenever you lose life, (.+)$/, "youLoseLife"],
  // Playing a land (CR 305.1), not putting one onto the battlefield with an effect (rulings on Burgeoning).
  [/^Whenever you play a land, (.+)$/, "youPlayLand"],
  [/^When(?:ever)? you play another land, (.+)$/, "youPlayAnotherLand"],
  [/^Whenever an opponent plays a land, (.+)$/, "opponentPlaysLand"],
  [/^Whenever a player plays a land, (.+)$/, "playerPlaysLand"],
  [/^Whenever you're dealt damage, (.+)$/, "youAreDealtDamage"],
  [/^Whenever damage that would be dealt to you is prevented, (.+)$/, "youDamagePrevented"],
  [/^Whenever an opponent is dealt damage, (.+)$/, "opponentIsDealtDamage"],
  [/^Whenever enchanted player is dealt damage, (.+)$/, "enchantedPlayerDealtDamage"],
  // Sower of Discord, with "As ~ enters, choose two players" (checked in compile.ts).
  [/^Whenever damage is dealt to one of the chosen players, (.+)$/, "chosenPlayerDealtDamage"],
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
  [/^Whenever ~ becomes untapped, (.+)$/, "selfBecomesUntapped"],
  [/^When ~ becomes monstrous, (.+)$/, "selfBecomesMonstrous"],
  [/^Whenever ~ mutates, (.+)$/, "selfMutates"],
  [/^Whenever you exert a creature, (.+)$/, "youExert"],
  [/^When(?:ever)? ~ exploits a creature, (.+)$/, "selfExploits"],
  // Heroic (an ability word): "Whenever you cast a spell that targets ~".
  [/^Whenever you cast a spell that targets ~, (.+)$/, "selfTargetedByYourSpell"],
];

const SELF_EVENTS: TriggerEvent[] = [
  "selfEnters", "selfDies", "selfDiesOrExiled", "selfLeaves", "selfLostControl", "selfToGraveyard", "selfBecomesTarget", "selfAttacks", "selfAttacksOrBlocks", "selfDealsCombatDamageToPlayer", "selfTurnedFaceUp", "selfTransformsInto",
  "selfDealsDamage", "selfDealsCombatDamage", "selfTargetedByYourSpell", "selfLastTimeCounterRemoved", "selfExploits",
  "selfBlocks", "selfBecomesBlocked", "selfAttacksUnblocked", "selfAttacksAlone", "selfBlocksOrBecomesBlocked", "selfBlocksCreature", "selfBlockedByCreature", "selfBlocksOrBlockedByCreature",
  "selfDealsDamageToCreature", "selfDealsCombatDamageToCreature", "selfDealsDamageToPlayer", "selfBecomesTapped", "selfIsDealtDamage", "selfBecomesMonstrous", "selfMutates",
  "selfBecomesUntapped",
];

/** "Each other opponent" after "deals combat damage to an opponent": each opponent but that player (see parsePlayer). */
function otherOpponents(text: string): string {
  return text.replace(/\beach other opponent\b/g, "each opponent other than that player");
}

/** The ability's text as printed again, after otherOpponents. */
function withOtherOpponents(body: AbilityBody): AbilityBody {
  return body.text.includes("each opponent other than that player") ? { ...body, text: body.text.replaceAll("each opponent other than that player", "each other opponent") } : body;
}

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
  [/^becomes untapped, (.+)$/, "selfBecomesUntapped", {}],
  [/^is dealt damage, (.+)$/, "selfIsDealtDamage", { thatMuch: true }],
];

/**
 * A hosted trigger's body with each "other" group or count made "other than the subject" (the creature the Aura or
 * Equipment is attached to), or null if some other "other" is in it.
 */
function otherMeansSubject(body: AbilityBody): AbilityBody | null {
  let ok = true;
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== "object") return x;
    const o = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)])) as Record<string, unknown>;
    if (o.other === true) {
      if (o.ref === "each" || o.kind === "permanents") {
        delete o.other;
        o.otherThanSubject = true;
      } else ok = false;
    }
    return o;
  };
  const out = walk(body) as AbilityBody;
  return ok ? out : null;
}

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
  // "Whenever equipped creature deals combat damage during your turn, ..." (The Aetherspark): it triggers only during
  // its controller's turn.
  const yours = /^(deals (?:combat )?damage) during your turn, /.exec(m[3]!);
  if (yours) m[3] = m[3]!.replace(" during your turn, ", ", ");
  // "Whenever equipped creature becomes blocked by a creature, you may draw two cards" (Infiltration Lens): once for each
  // creature blocking it (rulings), which "that creature" would mean.
  const byOne = m[2] === "creature" && !m[1] && !yours ? /^becomes blocked by a creature, (.+)$/.exec(m[3]!) : null;
  if (byOne) {
    if (/\b(it|its|that creature)\b/i.test(byOne[1]!)) return "fail";
    const body = parseBody(byOne[1]!, {});
    return body ? { event: "selfBlockedByCreature", body, host: "attached" } : "fail";
  }
  for (const [re, event, o] of HOST_TRIGGERS) {
    const h = re.exec(m[3]!);
    if (!h) continue;
    if (m[2] !== "creature" && event !== "selfBecomesTapped" && event !== "selfBecomesUntapped") return "fail";
    let text = o.toOpponent ? otherOpponents(h[1]!) : h[1]!;
    // "Deals combat damage to a player or battle" (Beamtown Beatstick): "that player" isn't about a battle (CR 310).
    const orBattle = /^deals combat damage to a player or battle, /.test(m[3]!);
    if (orBattle && /\b(that player|defending player)\b/.test(text)) return "fail";
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
    // "Each other creature ...", "for each other creature you control": other than the creature it's attached to (Martial
    // Impetus, Sigil of Valor), which "it" is.
    if (!o.creature && /\bother\b/.test(text)) {
      const moved = otherMeansSubject(body);
      if (!moved) return "fail";
      body = moved;
    }
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, h[1]!) };
    return { event, body: withOtherOpponents(body), host: m[1] ? "orSelf" : "attached", ...(o.toOpponent ? { toOpponent: true } : {}), ...(orBattle ? { orBattle: true as const } : {}), ...(yours ? { activeIf: { kind: "yourTurn" as const } } : {}) };
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
 * "Whenever a creature an opponent controls is dealt excess noncombat damage, amass Orcs X, where X is that excess damage"
 * (Fall of Cair Andros), "Whenever one or more creatures your opponents control are dealt excess noncombat damage"
 * (Magmatic Galleon), Aegar's "if a Giant, Wizard, or spell you controlled dealt damage to it this turn" (an intervening
 * if, CR 603.4): excess damage as CR 120.10 has it, the permanent the subject.
 */
function parseExcessTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (one or more|an?) (.+?) (?:is|are) dealt excess (noncombat )?damage, (.+)$/.exec(line);
  if (!m) return null;
  const oneOrMore = m[1] === "one or more";
  const phrase = oneOrMore ? m[2]!.replace(/^creatures your opponents control$/, "creature an opponent controls") : m[2]!;
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object") return "fail";
  let text = m[4]!;
  let ifCond: StaticCondition | undefined;
  const aegar = /^if a ((?:[A-Z][a-z]+, )*[A-Z][a-z]+,? or )?spell you controlled dealt damage to it this turn, (.+)$/.exec(text);
  if (aegar) {
    const subtypes = (aegar[1] ?? "").replace(/,? or $/, "").split(", ").filter(Boolean);
    if (!subtypes.every((st) => CREATURE_TYPES.has(st))) return "fail";
    ifCond = { kind: "subjectDamagedBy", subtypes, spell: true };
    text = aegar[2]!;
  } else if (/^if /.test(text)) return "fail";
  const where = /^(.+), where X is that excess damage\.$/.exec(text);
  if (where) text = `${where[1]}.`;
  if (oneOrMore && /\b(it|that|those)\b/.test(text)) return "fail";
  let body = parseBody(text, { subjectIt: true });
  if (!body) return "fail";
  if (where) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: m[4]!.replace(/^if [^]+? this turn, /, "") };
  return { event: "permanentDealtExcess", body, excess: { filter: { ...filter, text: m[2]! }, ...(m[3] ? { noncombat: true as const } : {}), ...(oneOrMore ? { oneOrMore: true as const } : {}) }, ...(ifCond ? { ifCond } : {}) };
}

/**
 * "Whenever ~ deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next
 * untap step": once for each creature it dealt damage to (CR 603.2c), which "that creature" and "it" mean.
 */
function parseDamagesCreatureTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever ~ deals (combat )?damage to a creature, (.+)$/.exec(line);
  if (!m) return null;
  let text = m[2]!;
  // Overclocked Electromancer, after "if that creature was dealt excess damage this turn": the excess damage it has been
  // dealt this turn (CR 120.10).
  const excess = /^(.+), where X is that excess damage\.$/.exec(text);
  if (excess) {
    const body = parseBody(`${excess[1]}.`, { subjectIt: true });
    return body ? { event: m[1] ? "selfDealsCombatDamageToCreature" : "selfDealsDamageToCreature", body: { ...replaceX(body, { count: { kind: "eventExcess" } }), text } } : "fail";
  }
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

/**
 * "Whenever a creature deals damage to you, destroy it" (Dread), "Whenever a creature deals combat damage to you" (Teysa),
 * "Whenever a source an opponent controls deals damage to you, that player sacrifices a permanent of their choice"
 * (Michiko Konda): once for each source (CR 603.2c). A creature or permanent is "it" and "that creature"; for a source of
 * any kind, "that player" is its controller and "that many" the damage.
 */
function parseGroupDamagesPlayers(line: string): TriggeredAbility | "fail" | null {
  // "Whenever one or more Pirates you control deal damage to your opponents, you create a Treasure token for each opponent
  // dealt damage" (Malcolm, Keen-Eyed Navigator): combat damage or not (rulings), once for the damage dealt at the same
  // time (CR 603.2c), even to one opponent (rulings). "Whenever one or more Pirates you control deal damage to a player"
  // (Francisco, Fowl Marauder): once for each player they deal damage to at once (rulings), "that player" them.
  // "Whenever one or more Zombies you control deal combat damage to one or more of your opponents, you may draw cards
  // equal to the number of opponents dealt damage this way. If you do, discard that many cards." (Hordewing Skaab): once
  // for each combat damage step (rulings), that many discarded however many were drawn (rulings).
  const skaab = /^Whenever one or more (.+?) you control deal combat damage to one or more of your opponents, you may draw cards equal to the number of opponents dealt damage this way\. If you do, discard that many cards\.$/.exec(line);
  if (skaab) {
    const spec = parseTargetPhrase(skaab[1]!.split(/\s+/).map(singularWord).join(" "));
    const body0 = parseBody("You may draw X cards. If you do, discard X cards.");
    if (spec?.kind !== "object" || !body0) return "fail";
    const body = { ...replaceX(body0, { count: { kind: "eventAmount" } }), text: line.replace(/^[^,]+, /, "") };
    return { event: "groupDealsDamageToPlayers", body, damageGroup: { filter: { ...spec, text: skaab[1]! }, opponents: true, combat: true } };
  }
  const m = /^Whenever one or more (.+?) you control deal damage to (your opponents|a player), (.+)$/.exec(line);
  if (!m) return null;
  const spec = parseTargetPhrase(m[1]!.split(/\s+/).map(singularWord).join(" "));
  const opponents = m[2] === "your opponents";
  // Breeches, Brazen Plunderer: "exile the top card of each of those opponents' libraries. You may play those cards this
  // turn, and you may spend mana as though it were mana of any color to cast those spells.": each opponent dealt damage
  // (rulings), each card face up with its own permission (CR 400.7), mana of any type for those spells (CR 609.4b).
  if (spec?.kind === "object" && opponents && m[3] === "exile the top card of each of those opponents' libraries. You may play those cards this turn, and you may spend mana as though it were mana of any color to cast those spells.")
    return { event: "groupDealsDamageToPlayers", body: { targets: [], effects: [{ type: "impulse", n: 1, until: "thisTurn", who: { ref: "eventPlayers" }, anyType: true }], text: m[3]! }, damageGroup: { filter: { ...spec, text: m[1]! }, opponents: true } };
  if (spec?.kind !== "object" || /\b(?:they|them|their|those)\b/.test(m[3]!)) return "fail";
  const each = opponents ? /^you create (an?) (.+?) token for each opponent dealt damage(\.?)$/.exec(m[3]!) : null;
  if (opponents && !each) return "fail";
  const body0 = parseBody(each ? `Create X ${each[2]} tokens${each[3]}` : m[3]!, { eventPlayer: !opponents });
  if (!body0) return "fail";
  const body = each ? { ...replaceX(body0, { count: { kind: "eventAmount" } }), text: m[3]! } : body0;
  return { event: "groupDealsDamageToPlayers", body, damageGroup: { filter: { ...spec, text: m[1]! }, ...(opponents ? { opponents: true as const } : { perPlayer: true as const }) } };
}

function parseSourceDamagesOpponent(line: string): TriggeredAbility | "fail" | null {
  // "Whenever another source you control deals exactly 1 damage to a permanent or player, ~ deals 2 damage to that
  // permanent or player" (Ghyrson Starn): each source's damage to each permanent or player, that amount after prevention
  // and replacement (it's the damage dealt, CR 120.4); once for each of them dealt at the same time (rulings).
  const exact = /^Whenever (another|a) source you control deals exactly (one|two|three|\d+) damage to a permanent or player, (.+)$/.exec(line);
  if (exact) {
    if (/\b(it|its|that source|that creature|that player|that permanent)\b(?! or player)/.test(exact[3]!)) return "fail";
    const body = parseBody(exact[3]!, { eventRecipient: true });
    if (!body) return "fail";
    return { event: "sourceYouControlDealsDamage", body, sourceDamage: { exactly: num(exact[2]!), ...(exact[1] === "another" ? { other: true as const } : {}) } };
  }
  // "Whenever a source you control deals noncombat damage to an opponent, you draw that many cards" (Niv-Mizzet,
  // Visionary): "that player" is the opponent, "that many" the damage. Not from a graveyard (Asgardian Inspiration).
  // "Whenever a source you control deals 5 or more damage to a player" (Dragonborn Champion): one source at one time
  // (rulings), to any player, you included.
  const m0 = /^Whenever a source you control deals (one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more damage to a player, (.+)$/.exec(line);
  const m = m0 ? ([m0[0], undefined, m0[2]] as const) : /^Whenever a source you control deals (noncombat )?damage to an opponent, (.+)$/.exec(line);
  if (!m) return null;
  let text = m[2]!;
  if (/\b(it|its|that source|that creature|from your graveyard)\b/.test(text)) return "fail";
  const thatMuch = /\bthat (?:much|many|amount of)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many|amount of)\b/g, "X");
  }
  let body = parseBody(text, { eventPlayer: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[2]!) };
  return { event: "sourceYouControlDamagesOpponent", body, ...(m[1] ? { noncombatOnly: true as const } : {}), ...(m0 ? { minDamage: num(m0[1]!), anyPlayer: true as const } : {}) };
}

function parseDamagesYouTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (an?) (.+?) deals (combat )?damage to you, (.+)$/.exec(line);
  if (!m) return null;
  const who = /^source(?: (an opponent|you) controls?)?$/.exec(m[2]!);
  let text = m[4]!;
  const thatMuch = /\bthat (?:much|many)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  const damagesYou = { by: who ? (who[1] === "an opponent" ? ("opponent" as const) : who[1] === "you" ? ("you" as const) : ("any" as const)) : undefined, ...(m[3] ? { combat: true as const } : {}) };
  if (who) {
    // "That player" is the source's controller only when it's an opponent's.
    if (/\b(it|its|that source|that creature)\b/.test(text) || (damagesYou.by !== "opponent" && /\bthat player\b/.test(text))) return "fail";
    let body = parseBody(text, { eventPlayer: true });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[4]!) };
    return { event: "dealsDamageToYou", body, damagesYou: { by: damagesYou.by!, ...(m[3] ? { combat: true as const } : {}) } };
  }
  const filter = parseTargetPhrase(m[2]!);
  if (!filter || filter.kind !== "object" || filter.controller) return "fail";
  let body = parseBody(text.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[4]!) };
  return { event: "dealsDamageToYou", body, subjectFilter: { ...filter, text: m[2]! }, damagesYou: m[3] ? { combat: true } : {} };
}

function parseBlockTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever a creature blocks" (anyone's), "Whenever a Rat you control becomes blocked": "it" and "that creature" are
  // that creature, once for each (CR 509.3a, 509.3c).
  const other = /^Whenever (an?) ((?:[a-z]+ )?creature) blocks, (.+)$/.exec(line) ?? /^Whenever (an?) (.+?) you control becomes blocked, (.+)$/.exec(line);
  if (other) {
    const blocks = / blocks, /.test(line);
    const filter = parseTargetPhrase(other[2]!);
    if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length)) return "fail";
    const body = parseBody(other[3]!.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true });
    if (!body) return "fail";
    return { event: blocks ? "creatureBlocks" : "creatureBecomesBlocked", body, subjectFilter: { ...filter, ...(blocks ? {} : { controller: "you" as const }), text: blocks ? other[2]! : `${other[2]} you control` } };
  }
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
// "Whenever you cast another spell that has convoke" (Kasla): the spell is on the stack, never the permanent or card
// whose ability this is, so "another" changes nothing.
// "An Aura, Equipment, or Vehicle spell" (Sram): a list, its commas before the spell's last word.
const CAST_TRIGGER = /^When(?:ever)? (you|an opponent|another player|a player|enchanted player) casts? (or copy |or copies )?(an? (?:[A-Za-z]+, )+or [A-Za-z]+ spell|an? [^,]*? with mana value, power, or toughness equal to the chosen number|an? .+?|another (?!player).+?)(?: spell)?, (.+)$/;
// "Another player" is any other player, all of them opponents in a free-for-all Commander game (CR 903.2, 800.4a).
const CAST_BY = { you: "you", "an opponent": "opponent", "another player": "opponent", "a player": "any", "enchanted player": "enchanted" } as const;

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
  // "Whenever you cast your second spell each turn", "Whenever an opponent casts their second spell each turn", "...
  // their first noncreature spell each turn" (Esper Sentinel): counting only the spells of that kind they cast this turn.
  // "Whenever a player casts their second spell during their turn" (The Council of Four): only in their own turn.
  // "Whenever you cast your first spell during each opponent's turn" (Wavebreak Hippocamp): the first you cast in that turn.
  const nth = /^Whenever (you|an opponent|a player) casts? (?:your|their) (first|second) (?:(.+?) )?spell (each turn|during their turn|during each opponent's turn), (.+)$/.exec(line);
  if (nth) {
    const parsed = nth[3] ? parseTargetPhrase(`${nth[3]} spell`) : { kind: "spell" as const, text: "spell" };
    const kind = parsed && { ...parsed, text: nth[3] ? `${nth[3]} spell` : "spell" };
    if (kind?.kind !== "spell") return "fail";
    if ((nth[4] === "during their turn" && nth[1] === "you") || (nth[4] === "during each opponent's turn" && nth[1] !== "you")) return "fail";
    const body = parseBody(nth[5]!, { castSpell: true, eventPlayer: true });
    return body ? { event: "castSpell", cast: { by: CAST_BY[nth[1] as keyof typeof CAST_BY], spell: kind, nth: nth[2] === "first" ? 1 : 2, ...(nth[3] ? { nthOfKind: true as const } : {}), ...(nth[4] === "during their turn" ? { ownTurn: true as const } : {}), ...(nth[4] === "during each opponent's turn" ? { opponentsTurn: true as const } : {}) }, body } : "fail";
  }
  // "A creature spell with mana value 4, 5, or 6" (Kozilek's Unsealing): without the commas, as one phrase.
  const m = CAST_TRIGGER.exec(line.replace(/ with mana value (\d+), (\d+), or (\d+),/, (all, a: string, b: string, c: string) => (Number(b) === Number(a) + 1 && Number(c) === Number(b) + 1 ? ` with mana value ${a} through ${c},` : all)));
  if (!m) return null;
  let what = m[3]!.replace(/^(?:an?|another) /, "");
  // "Whenever you cast an instant or sorcery spell during your turn" (Ral, Monsoon Mage): only while you're the active player.
  const duringYours = m[1] === "you" && / during your turn$/.test(what);
  if (duringYours) what = what.replace(/ during your turn$/, "");
  // "Whenever you cast a spell while ~ is attacking" (Fire Lord Azula): only while it's an attacking creature as the
  // spell is cast.
  const whileAttacking = / while ~ is attacking$/.test(what);
  if (whileAttacking) what = what.replace(/ while ~ is attacking$/, "");
  // "Whenever you cast a spell from exile", "... from anywhere other than your hand", "... from your graveyard": the zone
  // it was cast from (CR 601.2a); "your graveyard" and "your library" are its caster's own.
  const fromM = / from (anywhere other than (?:your|their) hand|(?:your|their) hand|exile|your graveyard|a graveyard|your library)$/.exec(what);
  let from: NonNullable<TriggeredAbility["cast"]>["from"];
  if (fromM) {
    what = what.slice(0, fromM.index);
    const z = fromM[1]!;
    from = /^anywhere/.test(z) ? "notHand" : /hand$/.test(z) ? "hand" : z === "exile" ? "exile" : z === "a graveyard" ? "graveyard" : z === "your graveyard" ? "ownGraveyard" : "ownLibrary";
  }
  // "Whenever a player casts a spell they don't own" (Gonti, Night Minister): owned by someone other than its caster (CR
  // 108.3), a card they took over or stole.
  const notOwned = / (?:they|you) (?:don't|doesn't) own$/.exec(what);
  if (notOwned) what = what.slice(0, notOwned.index);
  // Folk Hero's "Whenever you cast a spell that shares a creature type with this creature": one creature type in common,
  // a changeling having every one (CR 702.73a).
  const shares = / that shares a creature type with ~$/.exec(what);
  if (shares) what = what.slice(0, shares.index);
  // "Whenever you cast a spell that targets a creature you control" (Season of Growth), "an instant or sorcery spell that
  // targets a creature" (repartee), "... that targets an opponent or a creature an opponent controls" (Danitha): what
  // one of its targets is as it's cast. "That targets only ..." isn't modeled.
  const tg = / that targets (.+)$/.exec(what);
  let targets: (TargetSpec | "you")[] | undefined;
  if (tg) {
    what = what.slice(0, tg.index);
    targets = [];
    for (const part of tg[1]!.split(/,? or (?=you\b|an? |one or more )/)) {
      if (part === "you") { targets.push("you"); continue; }
      const one = /^an? (.+)$/.exec(part);
      const many = /^one or more (.+)$/.exec(part);
      const phrase = one ? one[1]! : many ? many[1]!.replace(/^(\w+?)s\b/, "$1") : undefined;
      const spec = phrase && !/\bonly\b|~/.test(phrase) ? parseTargetPhrase(phrase) : null;
      if (spec?.kind !== "object" && spec?.kind !== "player") return "fail";
      targets.push(spec);
    }
  }
  // "A creature spell with power 5 or greater" (Monstrous Vortex): the spell's power on the stack (spellMatches).
  const pw = / with (power|toughness) (\d+) or (greater|less)$/.exec(what);
  if (pw) what = what.slice(0, pw.index);
  // "A spell that has convoke" (Joyful Stormsculptor), "a creature spell with flying", "with infect": the spell as it
  // was cast; convoke from another permanent's "spells you cast have convoke" too (game.ts hasConvoke).
  const kwM = !pw ? / (?:with|that has) (convoke|flying|infect)$/.exec(what) : null;
  if (kwM) what = what.slice(0, kwM.index);
  // "A spell with {X} in its mana cost", "a permanent spell with a mana cost that contains {X}" (Unbound Flourishing): the
  // mana symbol {X} in the mana cost of the spell (the half cast, for a split card), not another X.
  const xM = !pw && !kwM ? / with (?:\{X\} in its mana cost|a mana cost that contains \{X\})$/.exec(what) : null;
  if (xM) what = what.slice(0, xM.index);
  // "a spell of the chosen color", "a creature spell of the chosen type": the choice made as this permanent entered.
  // "A noncreature spell with mana value less than ~'s power" (Pollywog Prodigy): worked out as it's cast (TargetSpec.bound).
  const parsed0 = /^spell$/.test(what) ? { kind: "spell" as const, text: "spell" } : parseTargetPhrase(/\bspell\b/.test(what) ? what : `${what} spell`, { chosen: true, count: (t) => (t === "~'s power" || t === "the number of experience counters you have" ? parseCount(t, null) : null) });
  // Firespitter Whelp: "a noncreature or Dragon spell": either kind (TargetSpec.anyOf).
  const orKind = !parsed0 ? /^(non[a-z]+|[A-Z][a-z]+) or ([A-Z][a-z]+|non[a-z]+)(?: spell)?$/.exec(what) : null;
  const sides = orKind ? [parseTargetPhrase(`${orKind[1]} spell`), parseTargetPhrase(`${orKind[2]} spell`)] : [];
  const parsed = orKind && sides.every((x) => x?.kind === "spell" && !x.anyOf) ? { kind: "spell" as const, types: [], notTypes: [], notColors: [], anyOf: sides as TargetSpec[], text: `${orKind[1]} or ${orKind[2]} spell` } : parsed0;
  if (!parsed || parsed.kind !== "spell" || (pw && !parsed.types?.includes("Creature"))) return "fail";
  const range = pw && (pw[3] === "greater" ? { min: Number(pw[2]) } : { max: Number(pw[2]) });
  const spell = range ? { ...parsed, [pw![1] as "power" | "toughness"]: range } : parsed;
  if (pw) what = m[3]!.replace(/^(?:an?|another) /, "").replace(/ that targets .+$/, "");
  // "Whenever you cast a spell, if mana from a Treasure was spent to cast it, ..." (CR 106.3): an intervening if (CR
  // 603.4) that can't change once it's cast. A copy wasn't cast, so no mana was spent on it.
  const treasure = /^if mana from a Treasure was spent to cast it, (.+)$/.exec(m[4]!);
  if (treasure && m[2]) return "fail";
  // "If at least four mana was spent to cast it", "if no mana was spent to cast it" (CR 601.2h): the same.
  const spentIf = new RegExp(`^if ${SPENT} was spent to cast (?:it|that spell), (.+)$`).exec(m[4]!);
  const spent = spentIf ? parseSpentReq(spentIf[1]!) : undefined;
  if (spentIf && (m[2] || !spent)) return "fail";
  // Ancient Cellarspawn: "if the amount of mana spent to cast it was less than its mana value, target opponent loses life
  // equal to the difference": its mana value as cast, X included (CR 202.3e), against the mana spent (CR 601.2h); fixed
  // once it's cast, so checking it as it triggers is checking it as it resolves too (CR 603.4).
  const short = /^if the amount of mana spent to cast it was less than its mana value, (.+)$/.exec(m[4]!);
  if (short && m[2]) return "fail";
  // "That player" is the one who cast it.
  // "If eight or more mana was spent to cast that spell, ... it deals that much damage to each opponent" (Tellah): the
  // mana spent to cast it (CR 601.2h), which the cast event carries.
  let text = treasure ? treasure[1]! : spentIf ? spentIf[2]! : short ? short[1]!.replace(/\bloses life equal to the difference(\.?)$/, "loses X life$1") : m[4]!;
  if (short && !/\bloses X life\.?$/.test(text)) return "fail";
  const thatMuch = /\bIf [^.,]+ mana was spent to cast that spell, [^.]*\bthat much\b/.test(text) && !/\bX\b/.test(text) && !m[2];
  if (thatMuch) text = text.replace(/\bthat much\b/g, "X");
  let body = parseBody(text, { castSpell: true, eventPlayer: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: body.text.replace(/\bX\b/g, "that much") };
  if (short) body = { ...replaceX(body, { count: { kind: "castShortfall" } }), text: body.text.replace(/\bloses X life\b/, "loses life equal to the difference") };
  return { event: "castSpell", cast: { by: CAST_BY[m[1] as keyof typeof CAST_BY], spell: { ...spell, text: /\bspell\b/.test(what) ? what : `${what} spell` }, ...(m[2] ? { orCopy: true } : {}), ...(treasure ? { treasure: true as const } : {}), ...(spent ? { spent } : {}), ...(short ? { spentLessThanMv: true as const } : {}), ...(targets ? { targets } : {}), ...(from ? { from } : {}), ...(shares ? { sharesTypeWithSelf: true as const } : {}), ...(notOwned ? { notOwned: true as const } : {}), ...(kwM ? { keyword: capital(kwM[1]!) } : {}), ...(xM ? { xInCost: true as const } : {}), ...(duringYours ? { ownTurn: true as const } : {}), ...(whileAttacking ? { selfAttacking: true as const } : {}) }, body };
}

/**
 * "Whenever a creature you control enters", "Whenever another nontoken creature you control with power 2 or
 * less enters", "Whenever ~ or another Ally you control enters", "When a creature with mana value 5 or
 * greater enters": the entering permanent is the subject ("that creature", "it", "its power"). "One or
 * more" (one trigger for several entering at once) isn't modeled.
 */
/**
 * "Whenever a Dragon you control is dealt damage, it deals that much damage to any target that isn't a Dragon" (Wrathful
 * Red Dragon): once for each such permanent, for all the damage dealt to it at the same time; "it" is that permanent.
 */
function parseIsDealtDamageTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever a creature is dealt damage, ~ deals that much damage to that creature's controller" (Repercussion): anyone's.
  const m = /^Whenever an? (.+?) (?:(you control|an opponent controls) )?is dealt damage, (.+)$/.exec(line);
  if (!m) return null;
  const whose = m[2];
  if (!whose && m[1] !== "creature") return null;
  const filter = parseTargetPhrase(whose ? `${m[1]!} ${whose}` : m[1]!);
  if (filter?.kind !== "object") return "fail";
  const thatMuch = /\bthat much\b/.test(m[3]!);
  if (thatMuch && /\bX\b/.test(m[3]!)) return "fail";
  let body = parseBody(thatMuch ? m[3]!.replace(/\bthat much\b/g, "X") : m[3]!, { subjectIt: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[3]!) };
  return { event: "permanentIsDealtDamage", dealtFilter: { ...filter, text: whose ? `${m[1]!} ${whose}` : m[1]! }, body };
}

/** Valgavoth, Harrower of Souls: "Whenever an opponent loses life for the first time during each of their turns, ..." */
function parseFirstLifeLossTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever an opponent loses life for the first time during each of their turns, (.+)$/.exec(line);
  if (!m) return null;
  const body = parseBody(m[1]!, { eventPlayer: true });
  return body ? { event: "opponentLosesLife", firstOnTheirTurn: true, body } : "fail";
}

const ENTERS_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) enters(?: the battlefield)?( under your control| under an opponent's control)?, (.+)$/;

function parseEntersTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = ENTERS_TRIGGER.exec(line);
  if (!m) return null;
  let phrase = m[2]!;
  // "A nonland permanent an opponent owns enters under your control" (Brainstealer Dragon): owned by another player, under
  // your control (CR 108.3).
  const owned = m[3] === " under your control" && / (?:an opponent|you don't) owns?$/.test(phrase);
  if (m[3] && !owned) phrase += m[3] === " under your control" ? " you control" : " an opponent controls";
  const ench = ENCHANTED_CONTROLS.test(phrase);
  const parsed = ench ? enchantedControls(phrase) : parseTargetPhrase(phrase, { chosen: true });
  const filter = owned && parsed?.kind === "object" && !parsed.controller && parsed.owner === "opponent" ? { ...parsed, controller: "you" as const } : owned ? null : parsed;
  if (!filter || filter.kind !== "object" || (filter.chosen && filter.chosen !== "type")) return "fail";
  // "That land's controller" (Zo-Zu), and "that player" after "a creature an opponent controls" (Suture Priest): the
  // entering permanent's controller.
  let bodyText = ench ? m[4]!.replace(/\bthat player\b/g, "enchanted player") : m[4]!.replace(/\bthat (?:land|artifact|creature|permanent|enchantment)'s controller\b/g, "its controller");
  if (!ench && filter.controller === "opponent") bodyText = bodyText.replace(/\bthat player\b/g, "its controller");
  // "They lose life equal to its mana value" after "a nonland permanent an opponent owns" (Brainstealer Dragon): its owner.
  if (owned) bodyText = bodyText.replace(/^they lose\b/, "its owner loses");
  // "Whenever an Aura you control enters, if you cast it, ..." (Light-Paws): an intervening if (CR 603.4) on how it got
  // there, which can't change. Only of what you control: a permanent spell enters under its caster's control (CR 608.3).
  const ifCast = /^if you cast it, /.exec(bodyText);
  if (ifCast && filter.controller !== "you") return "fail";
  if (ifCast) bodyText = bodyText.slice(ifCast[0].length);
  const body = parseBody(bodyText, { subjectIt: true });
  if (!body) return "fail";
  const kind = m[1]!.toLowerCase();
  return {
    event: "permanentEnters",
    enters: { filter: { ...filter, text: phrase }, ...(kind === "another" ? { other: true } : {}), ...(kind === "~ or another" ? { orSelf: true } : {}), ...(ifCast ? { ifCast: true as const } : {}) },
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
// "Is exiled from the battlefield" (Soulherder) is leaving it for exile (CR 406.3).
const DIES_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) (dies or is put into exile|dies|is put into a graveyard from the battlefield|leaves the battlefield(?: without dying)?|is (?:exiled|put into exile) from the battlefield), (.+)$/;

/**
 * "Whenever another creature dies", "Whenever a creature you control dies", "Whenever ~ or another Zombie
 * you control dies", "Whenever a creature dealt damage by ~ this turn dies", "Whenever equipped creature
 * dies": "it" and "that card" are the card in the graveyard, "its power" as it last existed (CR 603.10a).
 */
function parseDiesTrigger(line: string): TriggeredAbility | "fail" | null {
  // Kaya's Ghostform: "When enchanted permanent dies or is put into exile, ..." (from the battlefield, CR 603.6c).
  const attachedM = /^When(?:ever)? (equipped|enchanted) (creature|permanent) (dies|dies or is put into exile), (.+)$/.exec(line);
  const attached = attachedM && [attachedM[0], attachedM[1]!, attachedM[4]!];
  // Scrap Trawler: "Whenever ~ dies or another artifact you control is put into a graveyard from the battlefield": ~ is an
  // artifact, and dying is being put into a graveyard from the battlefield (CR 700.4), so the same as "~ or another".
  const orDies = /^Whenever ~ dies or another (.+?) is put into a graveyard from the battlefield, (.+)$/.exec(line);
  if (orDies && !/\bartifact\b/.test(orDies[1]!)) return "fail";
  if (orDies) line = `Whenever ~ or another ${orDies[1]} dies, ${orDies[2]}`;
  // "Whenever an artifact is put into your graveyard from the battlefield" (Daretti's emblem): one you own dies, as
  // cards go to their owners' graveyards (CR 404.2, 700.4).
  const yours = /^(When(?:ever)? (?:~ or another|another|an?) .+?) is put into your graveyard from the battlefield, /.exec(line);
  if (yours && !/ you (?:own|control)\b/.test(yours[1]!)) line = `${yours[1]} you own dies, ${line.slice(yours[0].length)}`;
  // "Whenever a permanent you control is put into a graveyard" (Aetherworks Marvel): a permanent is only ever on the
  // battlefield (CR 110.1), so from there (rulings).
  line = line.replace(/^(When(?:ever)? (?:~ or another|another|an?) (?:\w+ )*permanents?(?: you control)?) is put into a graveyard, /, "$1 is put into a graveyard from the battlefield, ");
  const m = attached ? null : DIES_TRIGGER.exec(line);
  if (!attached && !m) return null;
  const ench = !attached && ENCHANTED_CONTROLS.test(m![2]!);
  // "That player" in a trigger about what enchanted player controls is that player.
  let bodyText = (attached ? attached[2]! : m![4]!).replace(ench ? /\bthat player\b/g : /$^/, "enchanted player");
  // "That land's controller", and "that player" after "an artifact an opponent controls": who controlled it as it last
  // existed (CR 603.10a).
  if (!attached) {
    // "Whenever another creature you own dies, return it to your hand" (Athreos): your card, so its owner's hand.
    if (/ you own$/.test(m![2]!)) bodyText = bodyText.replace(/^return it to your hand\b/, "return it to its owner's hand");
    bodyText = bodyText.replace(/\bthat (?:land|artifact|creature|permanent|enchantment)'s controller\b/g, "its controller");
    if (/ an opponent controls$/.test(m![2]!)) bodyText = bodyText.replace(/\bthat player\b/g, "its controller");
  }
  // "Whenever another Zombie you control dies, if it didn't have decayed, ..." (Wilhelt): an intervening if (CR 603.4) on
  // the creature as it last existed (CR 603.10a), which can't change, so part of what dies.
  const exiled = !attached && /^is (?:exiled|put into exile) /.test(m![3]!);
  // "Whenever a creature with a coin counter on it dies or is put into exile" (Athreos, Shroud-Veiled): from the
  // battlefield to either one (CR 700.4, 603.6c).
  const diesOrExiled = !attached && m![3] === "dies or is put into exile";
  const leaves = !attached && (m![3]!.startsWith("leaves") || exiled || diesOrExiled);
  // "Whenever another creature you control leaves the battlefield, if it didn't die, ..." (Taeko): where it went can't
  // change, so it's part of the event, like "without dying".
  const didntDie = leaves && /^if it didn't die, /.exec(bodyText);
  if (didntDie) bodyText = bodyText.slice(didntDie[0].length);
  const notDies = !!didntDie || (!attached && m![3]! === "leaves the battlefield without dying");
  // "If it had a counter on it", "if it had one or more counters on it": as it last existed, so it can't change.
  // "If it had a -1/-1 counter on it" (Blowfly Infestation): of that kind.
  const hadCounter = !attached && new RegExp(`^if it had (?:a counter|one or more counters|counters|an? ${COUNTER} counter|one or more ${COUNTER} counters) on it, `).exec(bodyText);
  const hadKindOf = hadCounter ? (hadCounter[1] ?? hadCounter[2]) : undefined;
  if (hadCounter) bodyText = bodyText.slice(hadCounter[0].length);
  // Yuna, Grand Summoner: "if it had one or more counters on it, you may put that number of +1/+1 counters on target
  // creature": the counters of every kind it had as it last existed (rulings, CR 603.10a).
  const thatNumber = !!hadCounter && !hadKindOf && /^you may put that number of \+1\/\+1 counters on target creature\.$/.test(bodyText);
  if (thatNumber) bodyText = "you may put X +1/+1 counters on target creature.";
  // "If its toughness was less than 1" (Massacre Girl, Known Killer): as it last existed (CR 603.10a), so it can't change
  // and is part of what dies, like a keyword it had.
  const wasPT = attached ? null : new RegExp(`^if its (power|toughness) was (?:less than ${NUM}|${NUM} or less|greater than ${NUM}|${NUM} or greater), (.+)$`).exec(bodyText);
  const ptRange = wasPT && (wasPT[2] ? { max: num(wasPT[2]) - 1 } : wasPT[3] ? { max: num(wasPT[3]) } : wasPT[4] ? { min: num(wasPT[4]) + 1 } : { min: num(wasPT[5]!) });
  if (wasPT) bodyText = wasPT[6]!;
  const hadKw = attached ? null : /^if it (didn't have|had) ([\w ]+?), (.+)$/.exec(bodyText);
  const kw = hadKw ? parseKeywordList(hadKw[2]!) : null;
  if (hadKw && kw?.length !== 1) return "fail";
  if (hadKw) bodyText = hadKw[3]!;
  // "Return to your hand target artifact card in your graveyard with lesser mana value" (Scrap Trawler, Orah, Havi): less
  // than the one that died, as it last existed (rulings on Scrap Trawler); fixed as the target is chosen (TargetSpec.bound).
  const lesser = !attached && / with lesser mana value\b/.test(bodyText);
  if (lesser) bodyText = bodyText.replace(/ with lesser mana value\b/, "").replace(/^return to your hand (target [a-z ]+ card) in your graveyard\.$/, "return $1 from your graveyard to your hand.");
  // Mimic Vat: "you may exile that card. If you do, return each other card exiled with ~ to its owner's graveyard" (CR
  // 607.2a). The card is exiled linked to ~; if it has left the graveyard, nothing happens and the other card stays (rulings).
  const imprint = !attached && /^you may exile that card\. If you do, return each other card exiled with ~ to its owner's graveyard\.?$/.test(bodyText);
  let body = imprint
    ? { targets: [], effects: [{ type: "may" as const, effects: [{ type: "exile" as const, what: { ref: "subjectCard" as const, zone: "graveyard" as const }, linked: true }, { type: "moveLinked" as const, dest: "graveyard" as const, other: true as const, ifLinkedNow: true as const }], text: "exile that card (the other cards exiled with ~ go to their owners' graveyards)" }], text: bodyText }
    : parseBody(bodyText, { subjectIt: true, subjectLeft: true, ...(attached?.[1] === "enchanted" ? { auraCard: true } : {}) });
  if (!body) return "fail";
  if (thatNumber) {
    body = { ...replaceX(body, { count: { kind: "counters", counter: ANY_COUNTER, of: { ref: "subject" } } }), text: "you may put that number of +1/+1 counters on target creature." };
    for (const e of body.effects) if (e.type === "may") e.text = "put that number of +1/+1 counters on target creature";
  }
  if (lesser) {
    const [t, ...more] = body.targets;
    if (!t || more.length || t.kind !== "card" || t.bound || t.manaValue) return "fail";
    body = { ...body, targets: [{ ...t, bound: { key: "manaValue", at: "most", amount: { count: { kind: "manaValue", of: { ref: "subject" } }, plus: -1 } }, text: `${t.text} with lesser mana value` }] };
  }
  if (attached) {
    // "Return this card to its owner's hand" (Angelic Destiny): the Aura's card, which went to a graveyard as its creature
    // died or just after (CR 704.5m), not the Aura on the battlefield it no longer is (CR 400.7).
    if (attached[1] === "enchanted") for (const e of allEffects(body.effects)) if ((e.type === "bounce" || e.type === "putOntoBattlefield") && e.what.ref === "self") e.what = { ref: "selfCard", moved: true };
    const filter: TargetSpec = attachedM![2] === "creature" ? { kind: "object", types: ["Creature"], text: "creature" } : { kind: "object", text: "permanent" };
    return { event: "permanentDies", dies: { filter, attached: true, ...(attachedM![3] !== "dies" ? { leaves: true as const, toZones: ["graveyard", "exile"] as ("graveyard" | "exile")[] } : {}) }, body };
  }
  let phrase = m![2]!;
  const damaged = / dealt damage by ~ this turn$/.exec(phrase);
  if (damaged) phrase = phrase.slice(0, damaged.index);
  // "A creature of the chosen type" (Species Specialist): the type chosen as the watcher entered.
  const filter = ench ? enchantedControls(phrase) : parseTargetPhrase(phrase, / of the chosen type$/.test(phrase) ? { chosen: true } : undefined);
  if (!filter || filter.kind !== "object") return "fail";
  const kind = m![1]!.toLowerCase();
  const had = hadKw && kw ? (hadKw[1] === "had" ? { keywords: [...(filter.keywords ?? []), ...kw] } : { notKeywords: [...(filter.notKeywords ?? []), ...kw] }) : {};
  if (wasPT && filter[wasPT[1] as "power" | "toughness"]) return "fail";
  const wasRange = wasPT ? { [wasPT[1]!]: ptRange } : {};
  return {
    event: "permanentDies",
    dies: {
      filter: { ...filter, ...had, ...wasRange, text: hadKw ? `${phrase} ${hadKw[1] === "had" ? "with" : "without"} ${hadKw[2]}` : wasPT ? `${phrase} with ${wasPT[1]} ${wasPT[0].slice(`if its ${wasPT[1]} was `.length, wasPT[0].length - wasPT[6]!.length - 2)}` : phrase },
      ...(kind === "another" ? { other: true } : {}),
      ...(kind === "~ or another" ? { orSelf: true } : {}),
      ...(damaged ? { damagedBySelf: true } : {}),
      ...(leaves ? { leaves: true as const } : {}),
      ...(exiled ? { toZones: ["exile"] as ("graveyard" | "exile")[] } : diesOrExiled ? { toZones: ["graveyard", "exile"] as ("graveyard" | "exile")[] } : {}),
      ...(notDies ? { notDies: true as const } : {}),
      ...(hadCounter ? { hadCounter: hadKindOf ?? (true as const) } : {}),
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
  // "Whenever a creature you control with a +1/+1 counter on it deals combat damage to a player" (Bred for the Hunt): the
  // counter is on it as it deals the damage.
  line = line.replace(/^Whenever (an?|another) (\w+) you control (with an? [^ ]+ counter on it) deals combat damage /, "Whenever $1 $2 $3 you control deals combat damage ");
  // "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card" (Edric, Gix):
  // anyone's creature, dealing it to an opponent of this permanent's controller; "its controller" is the creature's.
  const any = /^Whenever a creature deals combat damage to one of your opponents, (.+)$/.exec(line);
  if (any) {
    if (/\b(?:that player|defending player|that much|that many|you|your)\b/i.test(any[1]!)) return "fail";
    const body = parseBody(any[1]!, { subjectIt: true, eventPlayer: true });
    if (!body) return "fail";
    return { event: "creatureYouControlDealsCombatDamageToPlayer", dealer: { filter: { kind: "object", types: ["Creature"], text: "creature" }, anyone: true }, body, toOpponent: true };
  }
  // "Whenever a creature you control deals combat damage during your turn, put that many +1/+1 counters on it" (Quilled
  // Greatwurm): to anything, all its combat damage of the step at once (CR 510.2), "that many" being that total.
  const anyRecipient = /^Whenever (another|an?) (.+?) you control deals combat damage( during your turn)?, (.+)$/.exec(line);
  if (anyRecipient) {
    const filter = parseTargetPhrase(anyRecipient[2]!);
    if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length)) return "fail";
    let text = anyRecipient[4]!;
    if (/\b(?:that player|defending player|X)\b/.test(text)) return "fail";
    const thatMuch = /\bthat (?:much|many)\b/.test(text);
    if (thatMuch) text = text.replace(/\bthat (?:much|many)\b/g, "X");
    let body = parseBody(text, { subjectIt: true });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, anyRecipient[4]!) };
    return {
      event: "creatureYouControlDealsCombatDamage",
      dealer: { filter: { ...filter, controller: "you", text: `${anyRecipient[2]} you control` }, ...(anyRecipient[1] === "another" ? { other: true } : {}) },
      body,
      ...(anyRecipient[3] ? { activeIf: { kind: "yourTurn" as const } } : {}),
    };
  }
  // "Whenever a creature you control with deathtouch deals combat damage to a player" (Fynn, the Fangbearer): the
  // keyword as it deals the damage.
  const withKw = /^(Whenever (?:another|an?) creature) you control (with [a-z]+) (deals combat damage to .+)$/.exec(line);
  // "Whenever ~ or an enchanted creature you control deals combat damage to a player" (Calix, Guided by Fate): this
  // creature, enchanted or not, or another that matches; each one that deals the damage triggers it once.
  const orSelf = /^Whenever ~ or (an? .+? you control deals combat damage to .+)$/.exec(line);
  if (orSelf) line = `Whenever ${orSelf[1]}`;
  const m = /^Whenever (another|an?) (.+?) you control deals combat damage to (a player(?: or battle)?|an opponent), (.+)$/.exec(withKw ? `${withKw[1]} ${withKw[2]} you control ${withKw[3]}` : line);
  if (orSelf && (!m || withKw || /\b(it|its|that creature)\b/i.test(m[4]!))) return "fail";
  if (!m) return null;
  const filter = parseTargetPhrase(m[2]!);
  if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length || filter.allTypes?.includes("Creature") || filter.commander)) return "fail";
  let text = m[3] === "an opponent" ? otherOpponents(m[4]!) : m[4]!;
  // "To a player or battle": "that player" isn't about a battle (CR 310).
  if (m[3] === "a player or battle" && /\b(that player|defending player)\b/.test(text)) return "fail";
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
    dealer: { filter: { ...filter, controller: "you", text: `${m[2]} you control` }, ...(m[1] === "another" ? { other: true } : {}), ...(orSelf ? { orSelf: true as const } : {}) },
    body: withOtherOpponents(body),
    ...(m[3] === "an opponent" ? { toOpponent: true as const } : {}),
    ...(m[3] === "a player or battle" ? { orBattle: true as const } : {}),
  };
}

/**
 * "Whenever a creature you control attacks, it gets +2/+2 until end of turn" (Fervent Charge), "Whenever a Dragon you
 * control attacks, bolster 2", "Whenever another creature you control attacks": once for each such creature as it's
 * declared as an attacker (CR 508.3a), not one put onto the battlefield attacking (508.4). "It" and "that creature" are
 * the attacker; "defending player" is the player it's attacking (CR 508.5a).
 */
function parseAttackerTrigger(line0: string): TriggeredAbility | "fail" | null {
  // "Whenever a creature you control that's enchanted or equipped attacks" (Reyav, Master Smith): one that's either as it
  // attacks.
  const line = line0.replace(/^Whenever a creature you control that's (enchanted or equipped|enchanted|equipped) attacks,/, (_, st: string) => `Whenever an ${st.replace(/ /g, "-")} creature you control attacks,`);
  // "Whenever a Zombie token you control with power 6 or greater attacks" (Dreadhorde Invasion): its power as it's declared.
  const m = /^Whenever (another|an?) (.+? you control(?: of the chosen type| with power \d+ or (?:greater|less))?) attacks, (.+)$/.exec(line);
  // "Whenever a creature attacks": anyone's, each one as it's declared as an attacker (Caltrops, Righteous Cause).
  // "Whenever a Kraken, Leviathan, Merfolk, Octopus, or Serpent attacks" (Summon: Leviathan): anyone's, of those types.
  const any = m ? null : /^Whenever (another|an?) ((?:[a-z]+ )?creature|(?:[A-Z][a-z]+, )*[A-Z][a-z]+,? or [A-Z][a-z]+|[A-Z][a-z]+) attacks, (.+)$/.exec(line);
  // "Whenever a creature attacks you or a planeswalker you control" (Blood Reckoning, Isperia): one attacking this
  // permanent's controller, or a planeswalker they control (CR 506.2, 508.3a); "attacks you" alone, not a planeswalker.
  const you = m || any ? null : /^Whenever (an?) ((?:[a-z]+ )?creature(?: with(?:out)? [a-z]+| with power \d+ or (?:greater|less))?) attacks you( or a planeswalker you control)?, (.+)$/.exec(line);
  if (you) {
    const filter = parseTargetPhrase(you[2]!);
    if (!filter || filter.kind !== "object" || filter.controller || !filter.types?.includes("Creature")) return "fail";
    const body = parseBody(you[4]!.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true });
    if (!body) return "fail";
    return { event: "creatureYouControlAttacks", attacker: { filter: { ...filter, text: you[2]! }, anyone: true, attacksYou: you[3] ? "orPlaneswalker" : "player" }, body };
  }
  // "Whenever a creature attacks one of your opponents" (Genestealer Locus, Calculating Lich): a creature attacking an
  // opponent of this permanent's controller (CR 508.3a), not a planeswalker or battle; "or a planeswalker an opponent
  // controls" (Gahiji) too. "That player" is the player it attacks.
  const opp = m || any || you ? null : /^Whenever (an?) (.+?) attacks one of your opponents( or a planeswalker an opponent controls)?, (.+)$/.exec(line);
  if (opp) {
    const filter = parseTargetPhrase(opp[2]!);
    if (!filter || filter.kind !== "object" || !(filter.types?.includes("Creature") || filter.subtypes?.length)) return "fail";
    const body = parseBody(opp[4]!.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true, eventPlayer: true });
    if (!body) return "fail";
    return { event: "creatureYouControlAttacks", attacker: { filter: { ...filter, text: opp[2]! }, anyone: true, attacksYou: opp[3] ? "opponentOrPlaneswalker" : "opponent" }, body };
  }
  // Kazuul, Tyrant of the Cliffs: "Whenever a creature an opponent controls attacks, if you're the defending player, ...":
  // once for each creature attacking you, a planeswalker you control or a battle you protect (CR 506.2, rulings), an
  // intervening if (CR 603.4) checked again as it resolves.
  const defending = m || any || you ? null : /^Whenever a creature an opponent controls attacks, if you're the defending player, (.+)$/.exec(line);
  if (defending) {
    const body = parseBody(defending[1]!.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true });
    if (!body) return "fail";
    return { event: "creatureYouControlAttacks", attacker: { filter: { kind: "object", types: ["Creature"], text: "creature an opponent controls" }, anyone: true, attacksYou: "orPlaneswalker" }, ifCond: { kind: "subjectAttackingYou" }, body };
  }
  // "Whenever your commander attacks" (Tome of Legends, We Ride at Dawn): the commander you own (CR 903.3), whoever
  // controls it; "it" is that creature.
  const yours = m || any ? null : /^Whenever your commander attacks, (.+)$/.exec(line);
  if (yours) {
    const body = parseBody(yours[1]!.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true, defending: true });
    if (!body) return "fail";
    return { event: "creatureYouControlAttacks", attacker: { filter: { kind: "object", commander: true, owner: "you", text: "your commander" }, anyone: true }, body };
  }
  const w = m ?? any;
  if (!w) return null;
  // "A creature you control of the chosen type" (Kindred Discovery): the type chosen for this permanent.
  const filter = m ? parseTargetPhrase(m[2]!.replace(/ you control(?= of the chosen type$| with power \d+ or (?:greater|less)$|$)/, ""), { chosen: true }) : parseTargetPhrase(w[2]!);
  if (m) w[2] = m[2]!.replace(/ you control(?= of the chosen type$| with power \d+ or (?:greater|less)$|$)/, "");
  if (!filter || filter.kind !== "object" || filter.controller || (filter.chosen && filter.chosen !== "type") || !(filter.types?.includes("Creature") || filter.subtypes?.length || filter.allTypes?.includes("Creature") || filter.commander)) return "fail";
  const body = parseBody(w[3]!.replace(/\bthat creature\b/g, "it"), { subjectIt: true, defending: true });
  if (!body) return "fail";
  if (any) return { event: "creatureYouControlAttacks", attacker: { filter: { ...filter, text: w[2]! }, anyone: true, ...(w[1] === "another" ? { other: true } : {}) }, body };
  return { event: "creatureYouControlAttacks", attacker: { filter: { ...filter, controller: "you", text: filter.chosen ? `${w[2]!.replace(/ of the chosen type$/, "")} you control of the chosen type` : `${w[2]} you control` }, ...(w[1] === "another" ? { other: true } : {}) }, body };
}

/**
 * "Whenever you sacrifice another permanent", "Whenever you sacrifice a Food", "Whenever you sacrifice ~ or another
 * creature", "... a nontoken permanent during your turn": once for each permanent its controller sacrifices (CR 701.21a).
 * "It" and "that card" are the card where it went. "One or more" (once per batch) isn't modeled.
 */
function parseSacrificeTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever a player sacrifices a permanent" (Mayhem Devil), "whenever an opponent sacrifices ...": "that player" is the
  // one who sacrificed it, its controller (CR 701.21a).
  // "When you sacrifice ~" (Heaped Harvest): ~ itself, wherever it went.
  const self = /^(?:When|Whenever) you sacrifice ~, (.+)$/.exec(line);
  if (self) {
    const body = parseBody(self[1]!);
    return body ? { event: "youSacrifice", sacrifices: { filter: { kind: "object", text: "~" }, orSelf: true, self: true }, body } : "fail";
  }
  // "Whenever you sacrifice one or more Foods" (Camellia, the Seedmiser): once for each event that sacrificed any (CR
  // 603.2c), the permanents as they last existed (CR 603.10a).
  const batch = /^Whenever you sacrifice one or more (.+?), (.+)$/.exec(line);
  if (batch) {
    const other = batch[1]!.startsWith("other ");
    const filter = parseTargetPhrase(singular(batch[1]!.replace(/^other /, "")));
    const body = parseBody(batch[2]!);
    if (!filter || filter.kind !== "object" || filter.controller || !body) return "fail";
    return { event: "batch", batch: { what: "leaves", filter: { ...filter, text: batch[1]! }, whose: "you", sacrificed: true, ...(other ? { other: true as const } : {}) }, body };
  }
  const any = /^Whenever (a player|an opponent) sacrifices (an?|another) (.+?), (.+)$/.exec(line);
  const m = any ? [any[0], any[2], any[3], undefined, any[4]] : /^Whenever you sacrifice (~ or another|another|an?) (.+?)( during your turn)?, (.+)$/.exec(line);
  if (!m) return null;
  const phrase = m[2]!.replace(/ or (?=[a-z])/g, " or ");
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object" || filter.controller) return "fail";
  const body = parseBody(m[4]!, { subjectIt: true, subjectLeft: true, ...(any ? { eventPlayer: true } : {}) });
  if (!body) return "fail";
  const kind = m[1]!.toLowerCase();
  return {
    event: "youSacrifice",
    sacrifices: { filter: { ...filter, text: phrase }, ...(kind === "another" ? { other: true } : {}), ...(kind === "~ or another" ? { orSelf: true } : {}), ...(any ? { by: any[1] === "a player" ? ("any" as const) : ("opponent" as const) } : {}) },
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
  let toOpponent = false;
  let orBattle = false;
  let returnOne = false;
  let event: TriggerEvent;
  let phrase: string | undefined;
  let bodyText: string;
  let min: number | undefined;
  let anyone = false;
  let damageX = false;
  let shownText: string | undefined;
  // "Whenever you attack a player (with one or more equipped creatures)": once for each player attacked, not a
  // planeswalker or battle (CR 508.3e; rulings on Akiri, Fearless Voyager and Horizon Explorer). "That player" is them.
  let perPlayer = false;
  // "When you attack with three or more creatures, transform ~" (Legion's Landing): "when" and "whenever" trigger alike.
  line = line.replace(/^When you attack with /, "Whenever you attack with ");
  const youAttackAPlayer = /^Whenever you attack a player( with one or more [^,]+)?, /.exec(line);
  if (youAttackAPlayer) {
    perPlayer = true;
    line = `Whenever you attack${youAttackAPlayer[1] ?? ""}, ${line.slice(youAttackAPlayer[0].length)}`;
  }
  // "Whenever one or more Halflings you control attack a player" (Meriadoc Brandybuck, Attuma, Crimson Cowl): likewise
  // once for each player those creatures attack, not a planeswalker or battle (rulings on Meriadoc Brandybuck).
  const groupAttacksAPlayer = /^Whenever one or more (.+?) you control attack a player, /.exec(line);
  if (groupAttacksAPlayer) {
    perPlayer = true;
    line = `Whenever one or more ${groupAttacksAPlayer[1]} you control attack, ${line.slice(groupAttacksAPlayer[0].length)}`;
  }
  // "Whenever you attack with ~ and/or your commander" (Ainok Strike Leader): once for the attack, if it or your commander
  // (a commander you own, CR 903.3) is among the creatures you attacked with.
  let selfOrCommander = false;
  const withCommander = /^Whenever you attack with ~ and\/or your commander, /.exec(line);
  if (withCommander) {
    selfOrCommander = true;
    line = `Whenever you attack, ${line.slice(withCommander[0].length)}`;
  }
  // "Whenever one or more creatures you control with power 4 or greater attack" (The Earth King): the same group.
  line = line.replace(/^(Whenever one or more creatures) (you control) (with power \d+ or greater) attack, /, "$1 $3 $2 attack, ");
  if ((m = /^Whenever (?:one or more (.+?) you control attack|you attack with (one|two|three|four|five|six|seven|eight|nine|ten) or more (.+?)|you attack), (.+)$/.exec(line))) {
    event = "creaturesYouControlAttack";
    phrase = m[1] ?? m[3];
    bodyText = m[4]!;
    const n = m[2] ? num(m[2]) : 1;
    if (n > 1) min = n;
  } else if ((m = /^Whenever another player attacks with (two|three|four|five) or more creatures, they draw a card if none of those creatures attacked you\.?$/.exec(line))) {
    // Firemane Commando: another player's attack, all of their attackers counted; they draw unless one of those creatures
    // attacked you (not your planeswalkers or battles), as they were declared (rulings).
    const draw = parseBody("That player draws a card", { eventPlayer: true });
    if (!draw) return "fail";
    const body: AbilityBody = { ...draw, effects: [{ type: "if", cond: { kind: "noneAttackedYou" }, effects: draw.effects }], text: m[0].replace(/^[^,]+, /, "") };
    return { event: "creaturesYouControlAttack", body, minAttackers: num(m[1]!), anyoneAttacks: true, anotherPlayer: true };
  } else if ((m = /^Whenever one or more creatures attack one of your opponents( or a planeswalker they control)?, (.+)$/.exec(line))) {
    // Frontier Warmonger, Frenzied Gorespawn: any player's creatures (rulings), once for each of your opponents they attack
    // (with their planeswalkers, when it says so; not battles), as for "whenever you attack a player" (CR 508.3e). "Those
    // creatures" are the ones attacking that opponent, "defending player" that opponent.
    if (/\b(they|them|their|it|that player)\b/.test(m[2]!.replace(/\bthose creatures\b/g, ""))) return "fail";
    const body = parseBody(m[2]!.replace(/\bdefending player\b/g, "that player"), { eventPlayer: true, eventGroup: true });
    if (!body) return "fail";
    return { event: "creaturesYouControlAttack", body, anyoneAttacks: true, attacksOpponent: { ...(m[1] ? { orPlaneswalkers: true as const } : {}) } };
  } else if ((m = /^Whenever (?:one or more creatures attack|a player attacks with (two|three|four|five) or more creatures), (.+)$/.exec(line))) {
    // Duelist's Heritage: whoever attacks (rulings), once for each declaration (CR 508.1, 603.2c). "Whenever a player
    // attacks with three or more creatures" (Aurelia, the Law Above): any player's attack, counting all their attackers.
    event = "creaturesYouControlAttack";
    bodyText = m[2]!;
    anyone = true;
    if (m[1]) min = num(m[1]);
    if (/\bthat player\b/.test(bodyText)) return "fail";
  } else if ((m = /^Whenever one or more (.+?) you control deal combat damage to (a player or battle|a player|an opponent|one or more players), (.+)$/.exec(line.replace(/^(Whenever one or more creatures) (you control) (each with power greater than its base power) deals /, "$1 $3 $2 deal ").replace(/^(Whenever one or more creatures) (you control) (with [a-z]+|with counters on them|with power \d+ or greater) deal /, "$1 $3 $2 deal ")))) {
    event = "creaturesYouControlDealCombatDamageToPlayer";
    phrase = m[1];
    bodyText = m[3]!;
    // "Create an X/X ... token, where X is the amount of damage those creatures dealt to that player" (Quartzwood Crasher):
    // the damage the creatures of the group dealt, as "that much".
    const dealtX = /, where X is the amount of damage those creatures dealt to that player\.$/.exec(bodyText);
    if (dealtX && !/\bthat (?:much|many)\b/.test(bodyText)) {
      bodyText = bodyText.slice(0, dealtX.index) + ".";
      damageX = true;
    }
    // Broodcaller Scourge: "a permanent card with mana value less than or equal to that damage": the damage those
    // creatures dealt to that player.
    const thatDamage = / with mana value less than or equal to that damage\b/;
    if (thatDamage.test(bodyText) && !/\bX\b|\bthat (?:much|many)\b/.test(bodyText) && !damageX) {
      shownText = bodyText;
      bodyText = bodyText.replace(thatDamage, " with mana value X or less");
      damageX = true;
    }
    // "To a player or battle": "that player" isn't about a battle (CR 310).
    orBattle = m[2] === "a player or battle";
    if (orBattle && /\b(that player|defending player)\b/.test(bodyText)) return "fail";
    // "You may return one of those Dragons to its owner's hand" (Zurgo and Ojutai): one of the creatures that dealt it,
    // chosen as it resolves (rulings).
    const back = /(?:^|\s)You may return one of those ([A-Z][a-z]+s|creatures) to its owner's hand\.$/.exec(bodyText);
    if (back && singularWord(back[1]!) === singularWord(phrase!.split(/\s+/).pop()!)) {
      returnOne = true;
      bodyText = bodyText.slice(0, back.index).trim();
    }
    // Combat damage to a player always goes to an opponent here: attacks only go to opponents. "That opponent" is that
    // player, "each other opponent" each opponent but them (Parapet Thrasher).
    toOpponent = m[2] === "an opponent";
    if (toOpponent) bodyText = otherOpponents(bodyText).replace(/\bthat opponent\b/g, "that player");
  } else return null;
  // The attackers as a group aren't modeled. Mishra's meld sentence's "them" is Mishra and the other creature it names.
  const meldThem = /\bIf ~ and an? \w+ named [^.]+ are attacking, and you both own and control them, exile ~ and the attacking \w+ named .+, then meld them into .+$/;
  // "Look at the top three cards of your library. Put one of them into your hand ..." is about those cards.
  const lookAt = /\b[Ll]ook at the top (?:two|three|four|five) cards of your library\. Put (?:one|two) of them [^.]+\./;
  // "Search your library for up to that many basic land cards, put them onto the battlefield tapped" is about the cards.
  const searched = /\b[Ss]earch your library for [^,.]+ cards, put them onto the battlefield( tapped)?, then shuffle\./;
  // "Create two 1/1 red Warrior creature tokens that are tapped and attacking. Sacrifice them at the beginning of the next
  // end step." (Dalkovan Encampment): the tokens.
  const sacCreated = /\b[Cc]reate [^.]+ tokens that are tapped and attacking\. Sacrifice them at the beginning of the next end step\./;
  // "Whenever you attack with eight or more creatures, those creatures get +4/+4 until end of turn" (Champions from
  // Beyond): the creatures that attacked, as they were declared.
  const those = event === "creaturesYouControlAttack" && !anyone && !perPlayer && !selfOrCommander && !returnOne && /\bthose creatures\b/.test(bodyText) && !/\b(they|them|their)\b/.test(bodyText);
  if (/\b(they|them|those creatures|their)\b/.test(bodyText.replace(meldThem, "").replace(lookAt, "").replace(searched, "").replace(sacCreated, "").replace(those ? /\bthose creatures\b/g : /^$/, "")) && !/that player/.test(bodyText)) return "fail";
  let group: TargetSpec | undefined;
  if (phrase && !/^creatures$/.test(phrase)) {
    // "Creatures with counters on them" (Tidus, Yuna's Guardian): each with a counter on it.
    const counters = / with counters on them$/.exec(phrase);
    const words = counters ? phrase.slice(0, counters.index) : phrase;
    const spec = parseTargetPhrase(words.split(/\s+/).map(singularWord).join(" ") + (counters ? " with counters on it" : ""));
    if (!spec || spec.kind !== "object") return "fail";
    group = { ...spec, text: phrase };
  }
  let text = bodyText;
  // "Draw that many cards" (The Ur-Dragon), "search your library for up to that many basic land cards" (The Earth King):
  // how many of the matching creatures attacked, as they were declared.
  const thatMuch = (event === "creaturesYouControlDealCombatDamageToPlayer" || (event === "creaturesYouControlAttack" && !anyone && !perPlayer && !selfOrCommander)) && (/\bthat (?:much|many)\b/.test(text) || damageX);
  if (thatMuch && !damageX) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, { eventPlayer: event === "creaturesYouControlDealCombatDamageToPlayer" || perPlayer, ...(those ? { eventGroup: true as const } : {}) });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: shownText ?? (damageX ? body.text : unX(body.text, bodyText)) };
  if (toOpponent) {
    const said = (b: AbilityBody): AbilityBody => ({ ...withOtherOpponents(b), text: withOtherOpponents(b).text.replaceAll("that player", "that opponent"), ...(b.modal ? { modal: { ...b.modal, modes: b.modal.modes.map(said) } } : {}) });
    body = said(body);
  }
  if (returnOne) {
    const filter: TargetSpec = group ?? { kind: "object", types: ["Creature"], text: "creature" };
    body = { ...body, effects: [...body.effects, { type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "bounce", fromGroup: true }], text: `return one of those ${phrase} to its owner's hand` }], text: `${body.text} You may return one of those ${phrase} to its owner's hand.` };
  }
  return { event, body, ...(group ? { group } : {}), ...(min ? { minAttackers: min } : {}), ...(toOpponent ? { toOpponent: true as const } : {}), ...(orBattle ? { orBattle: true as const } : {}), ...(anyone ? { anyoneAttacks: true as const } : {}), ...(perPlayer ? { perPlayer: true as const } : {}), ...(selfOrCommander ? { selfOrCommander: true as const } : {}) };
}

/** "Other creatures you control", "tokens you control", "artifacts and/or creatures you control": what a batch trigger counts. */
function batchPermanents(phrase: string): { filter: TargetSpec; other: boolean } | null {
  const other = /^other /.test(phrase);
  const p = phrase.replace(/^other /, "");
  const group = parseGroup(p, true);
  if (group) return { filter: group.filter, other };
  // "Tokens your opponents control" (Kambal): each one "an opponent controls", the verb left as it is.
  const opp = / your opponents control$/.test(p);
  const one = p.replace(/,? and\/or /g, (x) => x.replace("and/or", "or")).replace(/ your opponents control$/, "").split(/(\s+|,)/).map((w) => (/^[\s,]*$/.test(w) ? w : singularWord(w))).join("") + (opp ? " an opponent controls" : "");
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
  let eachOwner = false;
  if ((m = /^Whenever one or more (?:(.+?) )?cards (leave your graveyard|are put into exile from your graveyard)( during your turn)?, (.+)$/.exec(line))) {
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    batch = { what: "leavesGraveyard", whose: "you", ...(filter ? { filter } : {}), ...(m[2] !== "leave your graveyard" ? { to: "exile" as const } : {}) };
    yourTurn = !!m[3];
    rest = m[4]!;
  } else if ((m = /^Whenever one or more cards are put into exile from your library and\/or your graveyard, (.+)$/.exec(line))) {
    // Laelia: cards exiled from either zone in one event, by anyone, for any reason (rulings).
    batch = { what: "exiledFromLibraryOrGraveyard", whose: "you" };
    rest = m[1]!;
  } else if ((m = /^Whenever one or more (?:(.+?) )?cards are put into your graveyard from (anywhere|your library)( during your turn| for the first time each turn)?, (.+)$/.exec(line))) {
    // Crawling Sensation: "for the first time each turn", counting events before it was on the battlefield.
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    const first = m[3] === " for the first time each turn";
    batch = { what: "toGraveyard", whose: "you", ...(filter ? { filter } : {}), ...(m[2] === "your library" ? { from: "library" as const } : {}), ...(first ? { first: true as const } : {}) };
    yourTurn = !!m[3] && !first;
    rest = m[4]!;
  } else if ((m = /^Whenever a player mills one or more (?:(.+?) )?cards, (.+)$/.exec(line))) {
    // Zellix, Sanity Flayer: cards a mill instruction put there (CR 701.17a), once for each player who milled them.
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    batch = { what: "toGraveyard", from: "library", milled: true, ...(filter ? { filter } : {}) };
    rest = m[2]!;
  } else if ((m = /^Whenever one or more (?:(.+?) )?cards are milled, (.+)$/.exec(line))) {
    // The Wise Mothman: cards a mill instruction put into any graveyard (CR 701.17a), once for the whole event even when
    // several players mill at the same time (rulings).
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    batch = { what: "toGraveyard", from: "library", milled: true, together: true, ...(filter ? { filter } : {}) };
    rest = m[2]!;
    // "..., where X is the number of nonland cards milled this way": how many of them, known as it triggers, so it can
    // count targets (CR 601.2c, 603.3d).
    const x = new RegExp(`^(.+), where X is the number of ${m[1] ? `${m[1]} ` : ""}cards milled this way\\.?$`).exec(rest);
    if (x) {
      const body = parseBody(`${x[1]}.`, { ownX: true });
      if (!body) return "fail";
      return { event: "batch", batch, body, eventX: true };
    }
  } else if ((m = /^Whenever an? (?:(.+?) )?card (leaves your graveyard|is put into (?:a|your|an opponent's) graveyard from anywhere(?: other than the battlefield)?), (.+)$/.exec(line))) {
    // Syr Konrad: "a creature card is put into a graveyard from anywhere other than the battlefield", "a creature card
    // leaves your graveyard": once for each card (CR 603.2c).
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    const whose = /^leaves|your graveyard/.test(m[2]!) ? ("you" as const) : /an opponent's/.test(m[2]!) ? ("opponent" as const) : undefined;
    // Bloodchief Ascension: "a card is put into an opponent's graveyard from anywhere", "that player" being its owner.
    batch = { what: m[2]!.startsWith("leaves") ? "leavesGraveyard" : "toGraveyard", ...(whose ? { whose } : {}), ...(filter ? { filter } : {}), ...(/other than the battlefield$/.test(m[2]!) ? { from: "notBattlefield" as const } : {}), each: true };
    rest = m[3]!;
    eachOwner = true;
  } else if ((m = /^Whenever you create one or more (creature )?tokens( for the first time each turn)?, (.+)$/.exec(line))) {
    // Staff of the Storyteller: once for each event in which you create any (CR 111.2, 603.2c), whoever controls them.
    // Akim: "for the first time each turn", counting tokens created before it was on the battlefield.
    if (m[1] && m[2]) return "fail";
    batch = { what: "created", whose: "you", ...(m[1] ? { filter: { kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature token" } } : {}), ...(m[2] ? { first: true as const } : {}) };
    rest = m[3]!;
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
  } else if ((m = /^Whenever one or more lands enter under an opponent's control( without being played)?, (.+)$/.exec(line))) {
    // Deep Gnome Terramancer: lands put onto the battlefield under an opponent's control, not played (CR 305.1, 305.4).
    batch = { what: "enters", filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "lands" }, whose: "opponent", ...(m[1] ? { notPlayed: true as const } : {}) };
    rest = m[2]!;
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
  // Kotis, Celes: "if one or more of them entered from a graveyard or was cast from a graveyard" (an intervening if about
  // the event, CR 603.4).
  const fromYard = /^if one or more of them entered from a graveyard or was cast from a graveyard, (.+)$/.exec(rest);
  if (fromYard && batch.what === "enters") {
    batch.fromGraveyard = true;
    rest = fromYard[1]!;
  }
  // Twilight Diviner: "if they entered or were cast from a graveyard, create a token that's a copy of one of them": an
  // intervening if (CR 603.4) about those that did, and one of them of your choice, while it's still that permanent.
  const diviner = /^if they entered or were cast from a graveyard, create a token that's a copy of one of them\.?$/.exec(rest);
  if (diviner && batch.what === "enters" && batch.filter && !yourTurn) {
    const filter = { ...batch.filter, text: batch.filter.text.replace(/^creatures\b/, "creature") };
    return {
      event: "batch",
      batch: { ...batch, fromGraveyard: true, onlyFromGraveyard: true },
      body: { targets: [], effects: [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "choose", fromGroup: true }, { type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "created" } }], text: rest.replace(/\.$/, "") },
    };
  }
  // Kambal, Profiteering Mayor: "for each of them, create a tapped token that's a copy of it", those that entered.
  const eachCopy = /^for each of them, create an? (tapped )?token that's a copy of it\.?$/.exec(rest);
  if (eachCopy && batch.what === "enters" && !yourTurn) return { event: "batch", batch, body: { targets: [], effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "eventGroup" }, each: true, ...(eachCopy[1] ? { tapped: true } : {}) }], text: rest.replace(/\.$/, "") } };
  // Hedge Shredder: "Whenever one or more land cards are put into your graveyard from your library, put them onto the
  // battlefield tapped": those cards, if still in the graveyard (CR 400.7).
  const putThem = /^put them onto the battlefield( tapped)?\.?$/.exec(rest);
  if (putThem && batch.what === "toGraveyard" && batch.from === "library" && batch.filter && !yourTurn)
    return { event: "batch", batch, body: { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "eventGroup" }, ...(putThem[1] ? { tapped: true } : {}) }], text: rest.replace(/\.$/, "") } };
  // Colossal Grave-Reaver: "put one of them onto the battlefield": one you choose of those cards still in the graveyard
  // (CR 400.7), under your control.
  if (/^put one of them onto the battlefield\.?$/.test(rest) && batch.what === "toGraveyard" && batch.from === "library" && batch.filter && !yourTurn)
    return { event: "batch", batch, body: { targets: [], effects: [{ type: "chooseFromGraveyard", n: 1, dest: "battlefield", eventGroup: true, filter: batch.filter }], text: rest.replace(/\.$/, "") } };
  // The Skullspore Nexus: "create a green Fungus Dinosaur creature token with base power and toughness each equal to the
  // total power of those creatures", the ones that died, as they last existed (rulings, CR 608.2h).
  const totalPower = /^create an? ([a-z]+(?: and [a-z]+)? (?:[A-Z][a-z]+ )+)creature token with base power and toughness each equal to the total power of those creatures\.?$/.exec(rest);
  if (totalPower && batch.what === "leaves" && batch.dies && !yourTurn) {
    const token = parseToken(0, 0, totalPower[1]!.trim());
    if (!token) return "fail";
    return { event: "batch", batch, body: { targets: [], effects: [{ type: "createToken", who: { ref: "you" }, n: 1, token, pt: { count: { kind: "eventGroupPower" } } }], text: rest.replace(/\.$/, "") } };
  }
  // The objects as a group: not modeled. "Exile the top card of your library. You may play that card ..." (Inti) is about
  // the exiled card, not them.
  const aboutThem = rest.replace(/exile the top card of your library\. (?:Until (?:the end of your next turn|end of turn|your next end step), you may play that card|You may play that card (?:this turn|until the end of your next turn|until your next end step))\.?$/i, "");
  // "Search your library for a Plains card, put it onto the battlefield tapped" (Deep Gnome Terramancer): the card found.
  const notThem = aboutThem.replace(/search your library for [^,]+, put it (?:onto the battlefield(?: tapped)?|into your hand)/i, "");
  if (/\b(it|its|they|them|their|those|that card|that creature|that token|one of them|among them|this way)\b/i.test(notThem)) return "fail";
  let text = rest;
  const thatMuch = /\bthat (?:much|many)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, eachOwner ? { eventPlayer: true } : {});
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
  // Illusionist's Bracers: whoever activates it (rulings: the Bracers' controller controls the copy).
  const equipped = /^Whenever an ability of equipped creature is activated, if it isn't a mana ability, (.+)$/.exec(line);
  if (equipped) {
    const body = parseBody(equipped[1]!, { activatedAbility: true });
    return body ? { event: "abilityActivated", activates: { by: "any", equipped: true }, body } : "fail";
  }
  // Satoru Umezawa: "Whenever you activate a ninjutsu ability" (commander ninjutsu is one too, CR 702.49d).
  const ninja = /^Whenever you activate a ninjutsu ability, (.+)$/.exec(line);
  if (ninja) {
    const body = parseBody(ninja[1]!, {});
    return body ? { event: "abilityActivated", activates: { by: "you", ninjutsu: true }, body } : "fail";
  }
  // "An ability with {X} in its activation cost" (Glava, Unbound Flourishing as compile.ts splits it).
  const m = /^Whenever (a player|an opponent|you) activates? an ability( of (?:an?|another) (.+?)(?: on the battlefield)?| with \{X\} in its activation cost)?(?: that isn't a mana ability|, if it isn't a mana ability), (.+)$/.exec(line);
  if (!m) return /^Whenever (a player|an opponent|you) activates an? /.test(line) ? "fail" : null;
  let of: TargetSpec | undefined;
  const xCost = m[2] === " with {X} in its activation cost";
  if (m[2] && !xCost) {
    const f = parseTargetPhrase(m[3]!);
    if (f?.kind !== "object") return "fail";
    of = f;
  }
  const body = parseBody(theyAreThatPlayer(m[4]!), { eventPlayer: true, activatedAbility: true });
  if (!body) return "fail";
  return { event: "abilityActivated", activates: { by: m[1] === "an opponent" ? "opponent" : m[1] === "you" ? "you" : "any", ...(of ? { of } : {}), ...(xCost ? { xCost: true as const } : {}) }, body };
}

/**
 * "Whenever you tap ~ for mana, target opponent creates a 1/1 colorless Spirit creature token" (Forbidden Orchard),
 * "whenever a player taps a land for mana, ~ deals 1 damage to that player" (Manabarbs), "whenever an opponent taps a
 * Mountain for mana": tapped for mana (CR 106.12). A body that adds mana is a triggered mana ability instead (CR 605.1b,
 * mana-abilities.ts); one that doesn't uses the stack like any other trigger.
 */
function parseManaTapTrigger(line: string): TriggeredAbility | "fail" | null {
  const self = /^Whenever you tap ~ for mana, (.+)$/.exec(line);
  const other = !self ? /^Whenever (you|a player|an opponent) taps? an? (.+?) for mana, (.+)$/.exec(line) : null;
  if (!self && !other) return null;
  let filter: TargetSpec | undefined;
  if (other) {
    const f = parseTargetPhrase(other[2]!);
    if (f?.kind !== "object" || f.controller || f.chosen) return "fail";
    filter = { ...f, text: other[2]! };
  }
  // Zhur-Taa Druid: "it deals 1 damage to each opponent", "it" being ~.
  // Treasure Nabber: "gain control of that artifact", the permanent tapped.
  const text = self ? self[1]!.replace(/^it deals /, "~ deals ") : other![3]!.replace(/\bthat (artifact|land|permanent|creature)\b/g, "it");
  const body = parseBody(theyAreThatPlayer(text), self ? { eventPlayer: true, selfIt: true } : { eventPlayer: true, subjectIt: true });
  if (!body || allEffects(body.effects).some((e) => e.type === "addMana")) return "fail";
  const by = self || other![1] === "you" ? "you" : other![1] === "an opponent" ? "opponent" : "any";
  return { event: "tappedForMana", manaTap: { by, ...(filter ? { filter } : {}) }, body };
}

function parseDrawTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever a player draws their second card during their turn" (The Council of Four): only cards drawn in their own
  // turn count, the second of that turn.
  const m = /^Whenever (you|an opponent|a player|enchanted player|enchanted opponent) draws? (a card(?: except the first one (?:they|you) draw in each of (?:their|your) draw steps)?|(?:your|their) (first|second|third|fourth|fifth) card (?:each|during their) turn), (.+)$/.exec(line);
  if (!m) return null;
  const ownTurn = / during their turn$/.test(m[2]!);
  const body = parseBody(theyAreThatPlayer(m[4]!), { eventPlayer: true });
  if (!body) return "fail";
  const by = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : /^enchanted /.test(m[1]!) ? "enchanted" : "any";
  const nth = m[3] ? { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }[m[3] as "first"] : undefined;
  const except = / except the first one /.test(m[2]!);
  return { event: "playerDraws", draws: { by, ...(nth ? { nth } : {}), ...(except ? { notFirstInDrawStep: true as const } : {}), ...(ownTurn ? { ownTurn: true as const } : {}) }, body };
}

/**
 * "Whenever you discard a card", "whenever an opponent discards a card" ("that player" is who discarded), "whenever you
 * cycle or discard another card" (the same as "discard", rulings), "whenever a player cycles a card", "whenever you
 * discard a creature card". "One or more cards" (once per batch) isn't modeled.
 */
function parseDiscardTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (you|an opponent|a player) (cycles?|discards?|cycles? or discards?) (a|another|an?) ((?:[A-Za-z]+,? )*?card), (.+)$/.exec(line);
  if (!m) return null;
  let filter: TargetSpec | undefined;
  if (m[4] !== "card") {
    const f = parseSearchFilter(m[4]!);
    if (!f || f.kind !== "card") return "fail";
    filter = f;
  }
  // "Exile that card from your graveyard" (Necropotence): the discarded card, if it's there (rulings: not if it went
  // somewhere else, as with madness, or has left).
  // "You may exile that card from your graveyard. If you do, you may play that card this turn" (Containment Construct),
  // "... If you do, until the end of your next turn, you may play that card" (Moonstone): that card, the object it
  // became in exile (CR 400.7), by you, its owner.
  const exileIt = m[1] === "you" && m[2] === "discard" && m[3] === "a" && m[4] === "card" ? /^(you may )?exile that card from your graveyard(?:\. If you do, (you may play that card this turn|until the end of your next turn, you may play that card))?\.$/.exec(m[5]!) : null;
  // Tinybones: "Whenever an opponent discards a card, exile it from their graveyard with a stash counter on it": the
  // discarded card, if it's there (rulings on Necropotence), with the counter on it in exile.
  const exileTheirs = m[1] !== "you" && m[2] === "discards" && m[3] === "a" && m[4] === "card" ? new RegExp(`^exile it from their graveyard with an? ${COUNTER} counter on it\\.$`).exec(m[5]!) : null;
  const exile: Effect | undefined = exileIt
    ? { type: "exile", what: { ref: "subjectCard", zone: "graveyard" }, ...(exileIt[2] ? { ownerMay: { play: true, until: /next turn/.test(exileIt[2]) ? ("nextTurn" as const) : ("thisTurn" as const) } } : {}) }
    : exileTheirs
      ? { type: "exile", what: { ref: "subjectCard", zone: "graveyard" }, counters: { [exileTheirs[1]!]: 1 } }
      : undefined;
  // Hashaton: "create a tapped token that's a copy of that card": the discarded card, as it last existed in the
  // graveyard if it has left (CR 608.2h).
  const copyIt = /\bcopy of that card\b/.test(m[5]!) && !/\b(?:it|its)\b/.test(m[5]!.replace(/\bexcept it's\b/, ""));
  const body = exile ? { targets: [], effects: [exileIt?.[1] ? { type: "may" as const, effects: [exile], text: m[5]!.replace(/^you may /, "").replace(/\.$/, "") } : exile], text: m[5]! } : parseBody(m[5]!, { eventPlayer: true, ...(copyIt ? { subjectIt: true, subjectLeft: true } : {}) });
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
  // Paradox Haze: "At the beginning of enchanted player's first upkeep each turn, that player gets an additional upkeep
  // step after this step" (CR 500.8; rulings: an upkeep skipped doesn't trigger it, two of them make two more).
  const haze = /^At the beginning of enchanted player's first upkeep each turn, that player gets an additional upkeep step after this step\.$/.test(line);
  if (haze) return { event: "eachUpkeep", body: { targets: [], effects: [{ type: "addUpkeepStep" }], text: "That player gets an additional upkeep step after this step." }, enchantedPlayersTurn: true, firstUpkeep: true };
  // "At the beginning of each of enchanted player's postcombat main phases" (Shadow of the Second Sun): every main phase
  // of their turn but the first (CR 505.1a, rulings).
  const step = /^At the beginning of (?:each of )?enchanted (?:player|opponent)'s (upkeep|draw step|end step|postcombat main phases), (.+)$/.exec(line);
  if (step) {
    if (/^each of /.test(line.slice("At the beginning of ".length)) !== (step[1] === "postcombat main phases")) return "fail";
    const event = step[1] === "upkeep" ? "eachUpkeep" : step[1] === "draw step" ? "eachDrawStep" : step[1] === "end step" ? "eachEndStep" : "eachPostcombatMain";
    // "That player draws two additional cards" in their draw step: a trigger, so they just draw two more.
    const body = parseBody(theyAreThatPlayer(step[2]!).replace(/^that player draws (\w+) additional cards?\.$/, "that player draws $1 cards."), { eventPlayer: true });
    return body ? { event, body, enchantedPlayersTurn: true } : "fail";
  }
  // Witch-king of Angmar: "Whenever one or more creatures deal combat damage to you, ...".
  const hurt = /^Whenever one or more creatures deal combat damage to you, (.+)$/.exec(line);
  if (hurt) {
    const body = parseBody(hurt[1]!);
    return body ? { event: "creaturesDealCombatDamageToYou", body } : "fail";
  }
  const attacks = /^Whenever a creature attacks enchanted player, (.+)$/.exec(line);
  if (attacks) {
    const body = parseBody(attacks[1]!.replace(/\bthat creature\b/g, "it"), { subjectIt: true });
    return body ? { event: "creatureAttacksEnchantedPlayer", body } : "fail";
  }
  const truce = /^When you attack enchanted (?:opponent|player) or a planeswalker they control or when they attack you or a planeswalker you control, (.+)$/.exec(line);
  if (truce) {
    const body = parseBody(truce[1]!);
    return body ? { event: "attackBetweenYouAndEnchanted", body } : "fail";
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
const YARD_EVENTS: TriggerEvent[] = ["permanentDies", "castSpell", "spellYouControlDealsDamage", "youCommitCrime", "youScry", "youSurveil", "youScryOrSurveil", "permanentEnters", "landYouControlEnters", "anotherCreatureYouControlEnters", "creaturesYouControlAttack", "creaturesYouControlDealCombatDamageToPlayer", "yourUpkeep", "eachUpkeep", "yourDrawStep", "eachDrawStep", "yourEndStep", "eachEndStep", "yourBeginCombat", "eachBeginCombat", "yourEndCombat", "eachEndCombat"];

export function parseTrigger(raw: string): TriggeredAbility | "fail" | null {
  // An ability word ("Magecraft —", "Landfall —") has no rules meaning (CR 207.2c).
  // "Whenever your commander enters" (Nakia, Tome of Legends): the commander you own (CR 903.3), whoever controls it.
  const line = differenceInHand(raw.replace(/^[A-Z][A-Za-z' -]+ — (?=(When|Whenever|At)\b)/, "")).replace(/^Whenever your commander enters, /, "Whenever a commander you own enters, ");
  if (!/^(When|Whenever|At)\b/.test(line)) return null;
  // "Whenever you expend 4, ..." (CR 700.14): read as any "whenever you" trigger with no event of its own to refer to.
  const expend = /^Whenever you expend (\d+), (.+)$/.exec(line);
  if (expend) {
    const t = parseTrigger(`Whenever you proliferate, ${expend[2]}`);
    return t && t !== "fail" && t.event === "youProliferate" && Object.keys(t).every((k) => k === "event" || k === "body") ? { ...t, event: "youExpend", expend: Number(expend[1]) } : "fail";
  }
  // Kefka, Ruler of Ruin: "Whenever an opponent loses life during your turn, you draw that many cards": it triggers only
  // during its controller's turn.
  const lossOnYourTurn = /^Whenever an opponent loses life during your turn, (.+)$/.exec(line);
  if (lossOnYourTurn) {
    const t = parseTrigger(`Whenever an opponent loses life, ${lossOnYourTurn[1]}`);
    return t && t !== "fail" && !t.activeIf ? { ...t, activeIf: { kind: "yourTurn" } } : "fail";
  }
  // Springheart Nantuko: "Whenever a land you control enters, you may pay {1}{G} if ~ is attached to a creature you
  // control. If you do, create a token that's a copy of that creature. If you didn't create a token this way, create a
  // 1/1 green Insect creature token." Not paying, or not being attached then, makes the Insect (rulings).
  const nantuko = /^(Whenever a land you control enters), you may pay (\{[^.]+\}) if ~ is attached to a creature you control\. If you do, create a token that's a copy of that creature\. If you didn't create a token this way, (create [^.]+ token)\.$/.exec(line);
  if (nantuko) {
    const t = parseTrigger(`${nantuko[1]}, you may pay ${nantuko[2]}. If you do, create a token that's a copy of enchanted creature.`);
    const insect = parseBody(`${nantuko[3]!.charAt(0).toUpperCase()}${nantuko[3]!.slice(1)}.`, {});
    if (!t || t === "fail" || !insect || insect.targets.length) return "fail";
    const host: TargetSpec = { kind: "object", types: ["Creature"], controller: "you", text: "creature you control" };
    return { ...t, body: { targets: [], effects: [{ type: "if", cond: { kind: "state", cond: { kind: "attachedIs", filter: host } }, effects: t.body.effects }, { type: "if", cond: { kind: "createdNone" }, effects: insect.effects }], text: line.replace(/^[^,]+, /, "") } };
  }
  const groupDamage = parseGroupDamagesPlayers(line);
  if (groupDamage) return groupDamage;
  const sourceDamage = parseSourceDamagesOpponent(line);
  if (sourceDamage) return sourceDamage;
  // Ruby, Daring Tracker: "Whenever ~ attacks while you control a creature with power 4 or greater, ...": a condition on
  // the event, checked as it attacks only (rulings), not an intervening if.
  const attacksWhile = /^Whenever ~ attacks while (you control .+?), (.+)$/.exec(line);
  if (attacksWhile) {
    const cond = parseActivateCondition(attacksWhile[1]!);
    const t = cond && parseTrigger(`Whenever ~ attacks, ${attacksWhile[2]}`);
    return cond && t && t !== "fail" && !t.activeIf ? { ...t, activeIf: cond } : "fail";
  }
  // Wedding Ring: "Whenever an opponent who controls an artifact named ~ draws a card during their turn, you draw a card",
  // "... gains life during their turn, you gain that much life": any artifact with that name, not only the token copy
  // the first ability made (rulings); a trigger condition checked as the event happens (CR 603.2).
  const weddingRing = /^Whenever an opponent who controls an artifact named ~ (draws a card|gains life) during their turn, (.+)$/.exec(line);
  if (weddingRing) {
    const t = parseTrigger(`Whenever an opponent ${weddingRing[1]}, ${weddingRing[2]}`);
    return t && t !== "fail" ? { ...t, eventPlayerIf: { controlsArtifactNamedSelf: true, theirTurn: true } } : "fail";
  }
  // Carpet of Flowers: "At the beginning of each of your main phases, if you haven't added mana with this ability this
  // turn, you may add X mana of any one color, where X is the number of Islands target opponent controls." Not a mana
  // ability (rulings; CR 605.1b: it has a target), so it uses the stack; X is counted as it resolves.
  const carpet = /^At the beginning of each of your main phases, if you haven't added mana with this ability this turn, you may add X mana of any one color, where X is the number of (Islands|Swamps|Mountains|Forests|Plains) target opponent controls\.$/.exec(line);
  if (carpet) {
    const land = carpet[1] === "Plains" ? "Plains" : carpet[1]!.replace(/s$/, "");
    const islands: TargetSpec = { kind: "object", types: ["Land"], subtypes: [land], text: land };
    return {
      event: "yourMain",
      ifCond: { kind: "addedManaThisTurn", not: true },
      body: {
        targets: [{ kind: "player", opponent: true, text: "target opponent" }],
        effects: [{ type: "may", effects: [{ type: "choose", choice: "color" }, { type: "addMana", chosen: 1, times: { count: { kind: "permanents", filter: islands, whose: { ref: "target", index: 0 } } }, markSource: true }], text: `add X mana of any one color, where X is the number of ${carpet[1]} target opponent controls` }],
        text: line.replace(/^[^,]+, /, ""),
      },
    };
  }
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
  // "Whenever you play a land or cast a spell" (Infernal Sovereign), "... a card from exile" (Prosper), "a land from exile or
  // cast a spell from exile" (Urianger), "a legendary land or cast a legendary spell" (Shanid): the cast trigger, which
  // playing a land (CR 305.1) that matches also triggers, from the same zone. Not one that looks at "it" (the card played).
  // "Whenever you play a land or cast a spell, if it shares a card type with the exiled card, ..." (Cemetery Protector),
  // "Whenever a player plays a land or casts a spell, if ..., ~ deals 2 damage to that player" (Cemetery Gatekeeper).
  const sharesM = /^Whenever (you play a land or cast|a player plays a land or casts) a spell, if it shares a card type with the exiled card, (.+)$/.exec(line);
  if (sharesM) {
    const anyone = sharesM[1]!.startsWith("a player");
    if (/\b(it|its|that card|that spell)\b/.test(sharesM[2]!)) return "fail";
    const t = parseTrigger(`Whenever ${anyone ? "a player casts" : "you cast"} a spell, ${sharesM[2]}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.orCopy || t.ifCond || t.cast.from) return "fail";
    const land = parseTargetPhrase("land");
    return land?.kind === "object" ? { ...t, cast: { ...t.cast, orPlaysLand: { ...land, text: "land" }, sharesTypeWithLinked: true } } : "fail";
  }
  const playM = /^Whenever you play (a card|a land( from exile)? or cast a spell|a legendary land or cast a legendary spell)( from exile| from anywhere other than your hand)?, (.+)$/.exec(line);
  if (playM && !(playM[2] && !playM[3]) && !(playM[2] && playM[3] !== " from exile")) {
    const legendary = /legendary/.test(playM[1]!);
    const body = playM[4]!;
    if (/\b(it|its|that card|that spell)\b/.test(body)) return "fail";
    const t = parseTrigger(`Whenever you cast a ${legendary ? "legendary " : ""}spell${playM[3] ?? ""}, ${body}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.orCopy || t.ifCond) return "fail";
    const land = parseTargetPhrase(legendary ? "legendary land" : "land");
    return land?.kind === "object" ? { ...t, cast: { ...t.cast, orPlaysLand: { ...land, text: legendary ? "legendary land" : "land" } } } : "fail";
  }
  // Tecutlan, The Myriad Pools, Barracks of the Thousand: "Whenever you cast a permanent spell using mana produced by ~":
  // some of the mana spent to cast it (CR 601.2h) came from this permanent.
  const usingMana = /^Whenever you cast (an? .+? spell) using mana produced by ~, (.+)$/.exec(line);
  if (usingMana) {
    const t = parseTrigger(`Whenever you cast ${usingMana[1]}, ${usingMana[2]}`);
    return t && t !== "fail" && t.event === "castSpell" && t.cast && !t.cast.orCopy && !t.ifCond ? { ...t, cast: { ...t.cast, manaFromSelf: true } } : "fail";
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
    // "Whenever a counter is put on a creature you control, ..." (Hollowmurk Siege): once for each counter, but only the
    // first of them each turn does anything, so it's the same as "one or more counters".
    const t = parseTrigger(once[1]!.replace(/^Whenever a counter is put on (a creature you control|another creature you control), /, "Whenever one or more counters are put on $1, "));
    return t && t !== "fail" && !t.oncePerTurn && t.event !== "state" ? { ...t, oncePerTurn: true } : "fail";
  }
  // "You may draw a card. Do this only once each turn." (CR 603.2h): it triggers only if its controller hasn't done it
  // this turn; choosing to do it is what counts (rulings on Ancient Cornucopia), so a "no" lets it trigger again.
  const doOnce = /^(.+?) Do this only once each turn\.?$/.exec(line);
  if (doOnce) {
    const t = parseTrigger(doOnce[1]!);
    if (!t || t === "fail" || t.oncePerTurn || t.event === "state") return "fail";
    const may = t.body.effects[0];
    // "You may cast target instant or sorcery card from your graveyard" (Emet-Selch): casting it is doing it.
    if (may?.type === "castNow" && !may.once && t.body.effects.length === 1) return { ...t, body: { ...t.body, effects: [{ ...may, once: true }] } };
    // "Look at the top card of your library. You may cast that card ..." (Planetarium of Wan Shi Tong): casting it is.
    if (may?.type === "castFromAmong" && may.look && !may.once && t.body.effects.length === 1) return { ...t, body: { ...t.body, effects: [{ ...may, once: true }] } };
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
  // "When you unlock this door, ..." (CR 709.5h): as the door becomes unlocked, on the battlefield or as the Room enters
  // because that half was cast (see normalizeSelf for the door's index).
  const door = /^When you unlock door ([01]), (.+)$/.exec(line);
  if (door) {
    const body = parseBody(door[2]!, {});
    return body ? { event: "selfDoorUnlocked", door: Number(door[1]), body } : "fail";
  }
  // "Whenever ~ and at least one Human attack, ..." (Goldbug, Scrappy Scout): others of that creature type.
  // "Whenever this token and at least one other creature token attack" (Valor's Reach Tag Team): other tokens.
  const battalion = /^Whenever ~ and at least (one|two|three) (other creatures|other creature tokens?|[A-Z][a-z]+) attack, (.+)$/.exec(line);
  if (battalion) {
    const tokens = /^other creature tokens?$/.test(battalion[2]!);
    if (tokens) return ((t) => (t && t !== "fail" ? { ...t, withOthers: num(battalion[1]!), withOthersToken: true as const } : "fail"))(parseTrigger(`Whenever ~ attacks, ${battalion[3]}`));
    const type = battalion[2] === "other creatures" ? undefined : battalion[2]!;
    if (type && !CREATURE_TYPES.has(type)) return "fail";
    const t = parseTrigger(`Whenever ~ attacks, ${battalion[3]}`);
    return t && t !== "fail" ? { ...t, withOthers: num(battalion[1]!), ...(type ? { withOthersType: type } : {}) } : "fail";
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
  // Yedora, Grave Gardener: "..., you may return it to the battlefield face down under its owner's control. It's a Forest
  // land. (It has no other types or abilities.)": face down, its characteristics those the effect gives it (CR 708.2a).
  const forest = /^(.+), (you may )?return it to the battlefield face down under its owner's control\. It's a Forest land\.(?: \(It has no other types or abilities\.\))?$/.exec(line);
  if (forest) {
    const t = parseTrigger(`${forest[1]}, ${forest[2] ?? ""}return it to the battlefield under its owner's control.`);
    if (!t || t === "fail") return "fail";
    const put = (e: Effect): Effect | null => (e.type === "putOntoBattlefield" && e.what.ref === "subjectCard" && e.owner && !e.tapped && !e.counters ? { ...e, faceDown: "forest" } : e.type === "may" && e.effects.length === 1 ? (((x) => x && { ...e, effects: [x], text: `${e.text.replace(/ to the battlefield/, " to the battlefield face down")}. It's a Forest land` })(put(e.effects[0]!))) : null);
    const fx = t.body.effects.length === 1 ? put(t.body.effects[0]!) : null;
    return fx ? { ...t, body: { ...t.body, effects: [fx], text: line.replace(/^[^,]+, /, "") } } : "fail";
  }
  // Eminence (C17): "Whenever you cast another Vampire spell, if ~ is in the command zone or on the battlefield, ..." (Edgar
  // Markov), "... This ability triggers only if ~ is in the command zone or on the battlefield" (Sahir): the ability
  // works in the command zone too (CR 113.6), with an intervening if (CR 603.4) for the first.
  const eminence = /^((?:When|Whenever|At)\b[^,]+), if ~ is in the command zone or on the battlefield, (.+)$/.exec(line) ?? /^((?:When|Whenever|At)\b[^,]+), (.+?) This ability triggers only if ~ is in the command zone or on the battlefield\.$/.exec(line);
  if (eminence) {
    const t = parseTrigger(`${eminence[1]}, ${eminence[2]}`);
    if (!t || t === "fail" || t.zone || t.ifCond || t.host || /^(?:When|Whenever) ~ /.test(eminence[1]!)) return "fail";
    return { ...t, eminence: true, ...(/This ability triggers only/.test(line) ? {} : { ifCond: { kind: "selfCommandOrBattlefield" as const } }) };
  }
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
  // "At the beginning of your upkeep, if ~ is in your graveyard, you may pay {2}{G}. If you do, return target creature
  // card from your graveyard to your hand." (Genesis): the same, about other cards; its target may be the card itself.
  const inYardOther = /^(At the beginning of your upkeep), if ~ is in your graveyard, (.+)$/.exec(line);
  if (inYardOther && !/~|\bit\b/.test(inYardOther[2]!)) {
    const t = parseTrigger(`${inYardOther[1]}, ${inYardOther[2]}`);
    if (!t || t === "fail" || t.zone || t.ifCond || t.host) return "fail";
    return { ...t, zone: "graveyard", ifCond: { kind: "selfInGraveyard" } };
  }
  // "Whenever you cast a multicolored spell, you may return ~ from your graveyard to your hand": the effect moves the
  // card out of the graveyard, so the ability works only there (CR 113.6m). Only that one sentence: anything after it
  // would be about the card in its new zone. A trigger about ~ itself can't happen while it's in a graveyard.
  // "... to the battlefield. It gains haste until end of turn." (Bloodfeather Phoenix): the card it returned.
  const yard = /^((?:When|Whenever|At)\b.+?), ((?:you may )?(?:pay [^.]+\. If you do, )?return ~ from your graveyard to (?:your hand|the battlefield(?: tapped| attached to that creature)?(?:\. It gains haste until end of turn)?))\.$/.exec(line);
  // An Aura's "when enchanted creature dies, return ~ from your graveyard" (Screams from Within) is its battlefield trigger.
  if (yard && !/^(When|Whenever) ~ /.test(yard[1]!) && !/^When enchanted creature dies$/.test(yard[1]!)) {
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
  // A meld card's meld trigger (CR 701.42a), as normalizeSelf words it: "At the beginning of your end step, if you both
  // own and control ~ and a creature named Bruna, the Fading Light, exile ~ and the creature named Bruna, the Fading
  // Light, then meld them into ...": an intervening if (CR 603.4), its name maybe with a comma. Titania's also counts
  // the land cards in your graveyard.
  const meldIf = /^((?:When|Whenever|At)\b[^,]*), if (?:(.+?) and )?you both own and control ~ and an? (creature|land|artifact) named (.+?), ((?:you may pay [^.]+\. If you do, )?exile ~ and the \3 named \4, then meld them into .+)$/.exec(line);
  if (meldIf) {
    const meld: StaticCondition = { kind: "meldPartner", type: (meldIf[3]!.charAt(0).toUpperCase() + meldIf[3]!.slice(1)) as "Creature" | "Land" | "Artifact" };
    const also = meldIf[2] ? parseStaticCondition(meldIf[2], { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
    if (also === null) return "fail";
    const t = parseTrigger(`${meldIf[1]}, ${meldIf[5]}`);
    return t && t !== "fail" && !t.ifCond ? { ...t, ifCond: also ? { kind: "allOf", conds: [also, meld] } : meld } : "fail";
  }
  const excess = parseExcessTrigger(line);
  if (excess) return excess;
  // "Whenever an instant or sorcery spell you control deals damage to an opponent or battle" (Bloodfeather Phoenix).
  const spellDmg = /^Whenever an? (.+? spell) you control deals damage to an opponent( or battle)?, (.+)$/.exec(line);
  if (spellDmg) {
    const filter = parseTargetPhrase(spellDmg[1]!);
    const body = filter?.kind === "spell" && !filter.controller ? parseBody(`${spellDmg[3]![0]!.toUpperCase()}${spellDmg[3]!.slice(1)}`) : null;
    return body ? { event: "spellYouControlDealsDamage", spellDamage: { filter: filter!, ...(spellDmg[2] ? { orBattle: true as const } : {}) }, body } : "fail";
  }
  // "When ~ enters, if you attacked this turn, ...": an intervening "if" (CR 603.4) about the game. It's
  // checked as the ability would trigger and again as it resolves, so it can't be an ordinary effect.
  const intervening = /^((?:When|Whenever|At)\b[^,]*), if ([^,]+), (.+)$/.exec(line);
  // "If it's attacking" is about the source only in an ability about the source itself.
  const aboutIt = intervening && /^(it|~)\b(?!'s (?:your|the first) | isn't that player's turn$|'s not their turn$)/.test(intervening[2]!) && !/^(When|Whenever) ~ /.test(intervening[1]!) && !/^~ is enchanted by /.test(intervening[2]!);
  // "At the beginning of each opponent's upkeep, if that player has two or fewer cards in hand": whose upkeep it is.
  const thatHand = intervening && /^At the beginning of each (?:opponent|player)'s (?:upkeep|draw step|end step)$/.test(intervening[1]!) ? new RegExp(`^that player has (no|${NUM} or (fewer|more)) cards in hand$`).exec(intervening[2]!) : null;
  const handCond = thatHand && (thatHand[1] === "no" ? { max: 0 } : thatHand[3] === "fewer" ? { max: num(thatHand[2]!) } : { min: num(thatHand[2]!) });
  // "Whenever ~ attacks, if its toughness is 3 or less" (Young Hero Role): its own power or toughness as it triggers and resolves.
  const ptIf = intervening && /^(?:When|Whenever) ~ /.test(intervening[1]!) ? new RegExp(`^(?:its|~'s) (power|toughness) is ${NUM} or (less|greater)$`).exec(intervening[2]!) : null;
  const ptCond = ptIf && ({ kind: "selfPT", stat: ptIf[1] as "power" | "toughness", ...(ptIf[3] === "less" ? { max: num(ptIf[2]!) } : { min: num(ptIf[2]!) }) } as const);
  // "When this token enters, if it's a creature, ..." (Mythos of Illuna's token): its card type as it triggers and
  // resolves (CR 603.4, rulings).
  const typeIf = intervening && /^(?:When|Whenever) ~ /.test(intervening[1]!) ? /^(?:it's|~ is) an? (creature|artifact|enchantment|land)$/.exec(intervening[2]!) : null;
  const typeCond: StaticCondition | null = typeIf && { kind: "selfIs", filter: { kind: "object", types: [(typeIf[1]!.charAt(0).toUpperCase() + typeIf[1]!.slice(1)) as "Creature"], text: typeIf[1]! } };
  // "Whenever a nontoken creature you control enters, if it doesn't have the same name as another creature you control
  // or a creature card in your graveyard" (Guardian Project): about the creature that entered.
  const nameCond: StaticCondition | null = intervening && /^Whenever an? [^,]*creature you control enters$/.test(intervening[1]!) && intervening[2] === "it doesn't have the same name as another creature you control or a creature card in your graveyard" ? { kind: "subjectNameUnique" } : null;
  // "Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability" (Kodama of
  // the East Tree), "if it wasn't cast" (Preston, the Vanisher): what entered, as it triggers and resolves (CR 603.4).
  const putCond: StaticCondition | null = intervening && /^Whenever (?:another|a) [^,]+ enters$/.test(intervening[1]!) && intervening[2] === "it wasn't put onto the battlefield with this ability" ? { kind: "subjectPutBySelf", not: true } : intervening && /^Whenever (?:another|an?) [^,]+ you control enters$/.test(intervening[1]!) && /^you (didn't )?cast it from your hand$/.test(intervening[2]!) ? { kind: "subjectCastFromHand", ...(/didn't/.test(intervening[2]!) ? { not: true as const } : {}) } : intervening && /^Whenever (?:another|an?) [^,]+ you control enters$/.test(intervening[1]!) && /^it (wasn't|was) cast$/.test(intervening[2]!) ? { kind: "subjectWasCast", ...(/wasn't/.test(intervening[2]!) ? { not: true as const } : {}) } : null;
  // "Whenever a land an opponent controls enters, if that player controls more lands than you" (Archaeomancer's Map):
  // the entering land's controller, as it triggers and resolves (rulings).
  const thatMore = intervening && /^Whenever an? [a-z]+ an opponent controls enters$/.test(intervening[1]!) ? /^that player controls more (lands|creatures) than you$/.exec(intervening[2]!) : null;
  // "At the beginning of each opponent's end step, if that player controls more creatures than you" (Keeper of the
  // Accord): the active player, as it triggers and resolves (rulings).
  const activeMore = intervening && /^At the beginning of each opponent's (?:upkeep|draw step|end step)$/.test(intervening[1]!) ? /^that player controls more (lands|creatures) than you$/.exec(intervening[2]!) : null;
  const moreCond: StaticCondition | null = thatMore ? { kind: "opponentMore", what: thatMore[1] as "lands" | "creatures", subjectController: true } : activeMore ? { kind: "opponentMore", what: activeMore[1] as "lands" | "creatures", activePlayer: true } : null;
  const ifCond = putCond ? putCond : moreCond ? moreCond : nameCond ? nameCond : typeCond ? typeCond : ptCond ? ptCond : handCond ? ({ kind: "eventPlayerHand", ...handCond } as const) : intervening && !aboutIt && parseStaticCondition(intervening[2]!, { affects: { kind: "self" }, mods: [], text: "" });
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
    // Lathiel, the Bounteous Dawn: "if you gained life this turn, distribute up to that many +1/+1 counters": the life
    // gained this turn, counted as it's put on the stack, where the counters are divided (rulings, CR 601.2d).
    if (/^you gained life this turn$/.test(intervening[2]!) && /^distribute up to that many /.test(rest)) {
      rest = `${rest.replace(/^distribute up to that many /, "distribute up to X ").replace(/\.$/, "")}, where X is the amount of life you gained this turn.`;
    }
    // "If there are cards exiled with ~, put them into their owner's graveyard" (Valakut Exploration): those cards.
    if (/^there are cards exiled with ~$/.test(intervening[2]!)) rest = rest.replace(/^put them into their owner's graveyard,/, "put all cards exiled with ~ into their owners' graveyards,");
    // "At the beginning of your upkeep, if ~ is tapped, put a storage counter on it" (Bottomless Vault): "it" is ~, the
    // only thing named.
    // So is every "it" of "sacrifice it" (Mad Dog) and "it deals 2 damage to you unless it came under your control this
    // turn" (Erg Raiders), with no target or other object in the text.
    // So is "it" after "if there are two or more ki counters on ~" (the Kamigawa flip cards).
    if ((/^~ /.test(intervening[2]!) || / counters on ~$/.test(intervening[2]!)) && /^At /.test(intervening[1]!))
      // "You may remove a +1/+1 counter from it" (Ingenious Prodigy) likewise.
      rest = /\b(a|an|target|that|those|another|other|each|all|cards?|tokens?|creatures?|permanents?|spells?)\b|"/.test(rest) ? rest.replace(/( counters? on) it\.$/, "$1 ~.").replace(/^(you may remove an? \S+ counter from) it\./, "$1 ~.") : rest.replace(/\bit\b/g, "~");
    const t = parseTrigger(`${intervening[1]}, ${rest}`);
    if (!t || t === "fail" || t.ifCond) return "fail";
    // "Whenever a Mountain you control enters, if you control at least five other Mountains" (Valakut, the Molten
    // Pinnacle): Mountains other than that new one, as it triggers and as it resolves (rulings, CR 603.4).
    const kinds = (f: TargetSpec) => JSON.stringify([f.types, f.subtypes, f.supertypes]);
    if (ifCond.kind === "control" && ifCond.other && t.event === "permanentEnters" && t.enters && kinds(t.enters.filter) === kinds(ifCond.filter)) {
      const { other: _, ...rest } = ifCond;
      return { ...t, ifCond: { ...rest, otherThanSubject: true } };
    }
    return { ...t, ifCond };
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
    // Slicer, Hired Muscle: "... gain control of ~ until end of turn. If you do, ... If you don't, convert it": ~.
    const text = oppStep[2]!.replace(/^(you may have that player gain control of ~ until end of turn\. If you do, untap ~, goad it, and it can't be sacrificed this turn\. If you don't, convert) it\.$/, "$1 ~.");
    const body = parseBody(text.replace(/^they lose /, "that player loses ").replace(/ to them\.$/, " to that player."), { eventPlayer: true });
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
  // "Whenever ~ deals damage to an opponent": an opponent of its controller. "Whenever ~ deals combat damage to an
  // opponent, it deals that much damage to each other opponent" (Hydra Omnivore): each opponent but the one it hit.
  const toOpp = /^Whenever ~ deals (combat )?damage to an opponent, (.+)$/.exec(line);
  if (toOpp) {
    const t = parseTrigger(`Whenever ~ deals ${toOpp[1] ?? ""}damage to a player, ${otherOpponents(toOpp[2]!)}`);
    return t && t !== "fail" ? { ...t, body: withOtherOpponents(t.body), toOpponent: true } : "fail";
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
  // Midnight Clock: "When the twelfth hour counter is put on ~, ...": it triggers when counters put on it take it from
  // fewer than twelve to twelve or more (rulings), as a Saga's chapter does (CR 714.2b).
  const nth = /^When the (second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) ([a-z]+) counter is put on ~, (.+)$/.exec(line);
  if (nth) {
    const reach = ["second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"].indexOf(nth[1]!) + 2;
    const body = parseBody(nth[3]!, { selfIt: true });
    return body ? { event: "selfCountersPut", countersKind: nth[2]!, countersReach: reach, body } : "fail";
  }
  // "Whenever a +1/+1 counter is put on ~" (Fathom Mage): once for each counter put on it (rulings).
  const each = /^Whenever an? ((?:\+1\/\+1|-1\/-1|[a-z]+) )counter is put on ~, (.+)$/.exec(line);
  if (each) {
    const body = parseBody(each[2]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ "), { selfIt: true });
    return body ? { event: "selfCountersPut", countersKind: each[1]!.trim(), countersEach: true, body } : "fail";
  }
  // "Whenever a -1/-1 counter is put on a creature, you may create a 1/1 green Elf Warrior creature token" (Flourishing
  // Defenses): once for each counter put on any creature (CR 122.6).
  const eachOn = /^Whenever an? ((?:\+1\/\+1|-1\/-1) )counter is put on (a creature|a creature you control|a creature an opponent controls), (.+)$/.exec(line);
  if (eachOn) {
    if (/\b(it|its|that creature)\b/.test(eachOn[3]!)) return "fail";
    const body = parseBody(eachOn[3]!, {});
    const filter = parseTargetPhrase(eachOn[2]!.replace(/^an? /, ""));
    return body && filter?.kind === "object" ? { event: "permanentCountersPut", tappedFilter: filter, countersKind: eachOn[1]!.trim(), countersEach: true, body } : "fail";
  }
  // "Whenever one or more +1/+1 counters are put on ~ / on a creature you control" (CR 122.6: also as it enters with
  // them). "That many" is how many were put on it.
  // "Whenever you put one or more -1/-1 counters on a creature" (Hapatra, Nest of Scarabs; Terrasymbiosis): only counters
  // its controller puts (CR 122.6 and the rulings on Generous Patron: the player whose spell or ability puts them, the
  // controller of a wither or infect source, and for a permanent entering with counters its controller). It triggers
  // once for each permanent they're put on at the same time (rulings on Hapatra).
  const youPut = /^Whenever you put one or more ((?:\+1\/\+1|-1\/-1|loyalty|time|[a-z]+) )?counters on (~|this (?:creature|artifact|enchantment|permanent)|another creature you control|a creature you control|a creature you don't control|a creature|another creature|a permanent you control|a permanent or player|a planeswalker|another [a-z]+ creature|an? [A-Z][a-z]+(?:, [A-Z][a-z]+,)? or [A-Z][a-z]+ you control), (.+)$/.exec(line);
  // Danny Pink grants "Whenever one or more counters are put on this creature for the first time each turn".
  const firstTime = !youPut && /^Whenever one or more counters are put on ~ for the first time each turn, /.test(line);
  const put = youPut ?? /^Whenever one or more (\+1\/\+1 )?counters are put on (~|another creature you control|a creature you control|another non-[A-Z][a-z]+ creature you control), (.+)$/.exec(firstTime ? line.replace(" for the first time each turn,", ",") : line);
  if (put) {
    const self = /^(?:~|this [a-z]+)$/.test(put[2]!);
    const byYou = youPut ? { countersByYou: true as const } : {};
    let text = put[3]!.replace(/\bthat (creature|permanent|planeswalker)\b/g, "it");
    const thatMuch = /\bthat (?:much|many)\b/.test(text);
    if (thatMuch) {
      if (/\bX\b/.test(text)) return "fail";
      text = text.replace(/\bthat (?:much|many)\b/g, "X");
    }
    let body = parseBody(self ? text.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ ") : text, self ? { selfIt: true } : { subjectIt: true });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, put[3]!) };
    const kind = put[1] ? { countersKind: put[1].trim() } : {};
    if (self) return { event: "selfCountersPut", body, ...kind, ...byYou, ...(firstTime ? { countersFirstTime: true as const } : {}) };
    // All Will Be One: "on a permanent or player", once for each permanent or player they're put on.
    const orPlayer = put[2] === "a permanent or player" ? { countersOrPlayer: true as const } : {};
    const filter = parseTargetPhrase(put[2]!.replace(/ or player$/, "").replace(/^another (creature)?/, (_m, c) => (c ? "creature" : "")).replace(/^an? /, ""));
    if (filter?.kind !== "object") return "fail";
    return { event: "permanentCountersPut", tappedFilter: { ...filter, ...(put[2]!.startsWith("another") ? { notSource: true } : {}) }, body, ...kind, ...byYou, ...orPlayer };
  }
  // "Whenever a Dwarf you control becomes tapped", "Whenever a creature an opponent controls becomes tapped", "Whenever a
  // permanent becomes untapped" (Mesmeric Orb: "that permanent's controller").
  const tapped = /^Whenever an? (.+?) becomes (tapped|untapped), (.+)$/.exec(line);
  if (tapped) {
    const filter = parseTargetPhrase(tapped[1]!);
    const body = filter && filter.kind === "object" && parseBody(tapped[3]!, { subjectIt: true });
    return filter && body ? { event: tapped[2] === "tapped" ? "permanentBecomesTapped" : "permanentBecomesUntapped", tappedFilter: filter, body } : "fail";
  }
  const block = parseBlockTrigger(line);
  if (block) return block;
  const damagesYou = parseDamagesYouTrigger(line);
  if (damagesYou) return damagesYou;
  const damages = parseDamagesCreatureTrigger(line);
  if (damages) return damages;
  const enters = parseEntersTrigger(line);
  if (enters) return enters;
  const dealt = parseIsDealtDamageTrigger(line);
  if (dealt) return dealt;
  const firstLoss = parseFirstLifeLossTrigger(line);
  if (firstLoss) return firstLoss;
  const draws = parseDrawTrigger(line);
  if (draws) return draws;
  // Cunning Rhetoric: "Whenever an opponent attacks you and/or one or more planeswalkers you control": once each combat that
  // opponent attacks with one or more creatures attacking you or your planeswalkers (CR 508.3e).
  // Lulu, Stern Guardian: "Whenever an opponent attacks you": with one or more creatures attacking you, not your
  // planeswalkers or battles (rulings).
  // Struggle for Project Purity: "Whenever a player attacks you with one or more creatures, that player gets twice that
  // many rad counters": only an opponent can attack you (CR 506.2); "that many" is how many were declared attacking you
  // (rulings).
  const attacked = /^Whenever (?:an opponent|a player) attacks (you with (?:two|one) or more creatures|with creatures, if two or more of those creatures are attacking you and\/or planeswalkers you control|you and\/or one or more planeswalkers you control|you), (.+)$/.exec(line);
  if (attacked && (/^Whenever a player/.test(line) ? /^you with one or more creatures$/.test(attacked[1]!) : true)) {
    const thatMany = /\bthat many\b/.test(attacked[2]!);
    if (thatMany && (/\bX\b/.test(attacked[2]!) || !/^you with/.test(attacked[1]!))) return "fail";
    let body = parseBody(attacked[2]!.replace(/\bthat opponent\b/g, "that player").replace(/\bthat many\b/g, "X"), { eventPlayer: true });
    if (!body) return "fail";
    if (thatMany) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: attacked[2]! };
    return { event: "opponentAttacksYou", attacksYou: { min: /two or more/.test(attacked[1]!) ? 2 : 1, ...(/planeswalkers you control/.test(attacked[1]!) ? { orPlaneswalkers: true as const } : {}), ...(/^with creatures, if /.test(attacked[1]!) ? { recheck: true as const } : {}) }, body: { ...body, text: attacked[2]! } };
  }
  // Breena: "Whenever a player attacks one of your opponents, if that opponent has more life than another of your
  // opponents, ...": once for each player attacking each of your opponents (CR 508.3e); "that attacking player" is the one
  // who attacked, "that opponent" the one attacked.
  const attacksOpp = /^Whenever a player attacks one of your opponents, (?:if that opponent has more life than another of your opponents, )?(.+)$/.exec(line);
  if (attacksOpp) {
    const text = attacksOpp[1]!;
    if (/\bthat (?:opponent|player)\b/.test(text.replace(/\bthat attacking player\b/g, ""))) return "fail";
    const body = parseBody(text.replace(/\bthat attacking player\b/g, "that player").replace(/ and you put /, ". Put "), { eventPlayer: true });
    if (!body) return "fail";
    const json = JSON.stringify(body.effects).replaceAll('{"ref":"eventPlayer"}', '{"ref":"attackingPlayer"}');
    if (json.includes("eventPlayer")) return "fail";
    const ifCond = /, if that opponent has more life/.test(line) ? { ifCond: { kind: "eventPlayerMoreThanAnotherOpponent" as const, what: "life" as const } } : {};
    return { event: "playerAttacksYourOpponent", ...ifCond, body: { ...body, effects: JSON.parse(json), text } };
  }
  // Coveted Jewel: "that player draws three cards and gains control of ~. Untap it." (two instructions for that player, then
  // untapping ~).
  const unblocked = /^Whenever one or more creatures an opponent controls attack you and aren't blocked, (.+)$/.exec(line);
  if (unblocked) {
    const text = unblocked[1]!.replace(/^that player (draws [a-z]+ cards?) and (gains control of ~)\. Untap it\.$/, "That player $1. That player $2. Untap ~.");
    const body = parseBody(text, { eventPlayer: true });
    return body ? { event: "opponentCreaturesUnblocked", body: { ...body, text: unblocked[1]! } } : "fail";
  }
  const searches = /^Whenever an opponent searches their library, (.+)$/.exec(line);
  if (searches) {
    const body = parseBody(theyAreThatPlayer(searches[1]!), { eventPlayer: true });
    return body ? { event: "opponentSearchesLibrary", body } : "fail";
  }
  const activates = parseActivatesTrigger(line);
  if (activates) return activates;
  // Firebender Ascension: "that ability" is the creature's triggered ability, put on the stack just below this one (rulings).
  const attackCauses = /^Whenever a creature you control attacking causes a triggered ability of that creature to trigger, (.+)$/.exec(line);
  if (attackCauses) {
    const body = parseBody(attackCauses[1]!, { activatedAbility: true });
    return body ? { event: "attackCausesTrigger", body } : "fail";
  }
  const manaTap = parseManaTapTrigger(line);
  if (manaTap) return manaTap;
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
    // Magmakin Artillerist: "it deals 1 damage to each opponent": the card is the source (CR 702.29c).
    const body = parseBody(cycled[1]!.replace(/^it deals /, "~ deals "), { selfCard: true });
    return body ? { event: "selfCycled", body } : "fail";
  }
  // A state trigger (CR 603.8): "When you control no Islands, sacrifice ~."
  // "When you have 30 or more life, flip ~" (Rune-Tail), "When ~ has flying, flip it" (Student of Elements).
  // "When you control seven or more Thrulls, sacrifice ~" (Endrek Sahr).
  const st = new RegExp(`^When (you control no .+?|you control ${NUM} or more [A-Za-z]+?|you have ${NUM} or more life|~ has [a-z ]+), (.+)$`).exec(line);
  if (st) {
    const state = parseStaticCondition(st[1]!, { affects: { kind: "self" }, mods: [], text: "" });
    const body = state && parseBody(st[st.length - 1]!, { selfIt: true });
    return state && body ? { event: "state", state, body } : "fail";
  }
  // "When this artifact enters during the declare attackers step" (Misleading Signpost): only then does it trigger at all
  // (rulings), not an intervening if.
  const entersDuring = /^When ~ enters during the declare attackers step, (.+)$/.exec(line);
  if (entersDuring) {
    const t = parseTrigger(`When ~ enters, ${entersDuring[1]}`);
    return t && t !== "fail" && t.event === "selfEnters" && !t.activeIf ? { ...t, activeIf: { kind: "during", window: "declareAttackers" } } : "fail";
  }
  // "Whenever this creature becomes tapped during your turn" (granted by Dionus, Elvish Archdruid): only while it's its
  // controller's turn, whether it triggers at all.
  const tappedYours = /^Whenever ~ becomes tapped during your turn, (.+)$/.exec(line);
  if (tappedYours) {
    const t = parseTrigger(`Whenever ~ becomes tapped, ${tappedYours[1]}`);
    return t && t !== "fail" && t.event === "selfBecomesTapped" && !t.activeIf ? { ...t, activeIf: { kind: "yourTurn" } } : "fail";
  }
  // "Whenever you commit a crime during your turn" (Overzealous Muscle, CR 700.13): only while it's your turn, whether it
  // triggers at all, not an intervening if.
  const crime = /^Whenever you commit a crime during your turn, (.+)$/.exec(line);
  if (crime) {
    const body = parseBody(crime[1]!, { selfIt: true });
    return body ? { event: "youCommitCrime", body, activeIf: { kind: "yourTurn" } } : "fail";
  }
  // "When ~ enters from a graveyard" / "from your graveyard" (Phyrexian Dragon Engine, Oscorp Industries): where it came
  // from is part of the trigger event (CR 603.6a); a card is only ever in its owner's graveyard (CR 404.2), so "your" is
  // its owner, who must be its controller now.
  // "When ~ enters from your hand" (Thousand-Faced Shadow): put onto the battlefield from its owner's hand, cast or not
  // (ninjutsu, CR 702.49a).
  const fromHand = /^When(?:ever)? ~ enters from your hand, (.+)$/.exec(line);
  if (fromHand) {
    const t = parseTrigger(`When ~ enters, ${fromHand[1]}`);
    return !t || t === "fail" || t.event !== "selfEnters" ? "fail" : { ...t, ifFromHand: true };
  }
  const fromYard = /^When(?:ever)? ~ enters from (a|your) graveyard, (.+)$/.exec(line);
  if (fromYard) {
    const t = parseTrigger(`When ~ enters, ${fromYard[2]}`);
    return !t || t === "fail" || t.event !== "selfEnters" ? "fail" : { ...t, ifFromGraveyard: fromYard[1] === "a" ? "any" : "yours" };
  }
  // "Whenever an artifact or creature an opponent controls enters untapped" (Charismatic Conqueror), "whenever a
  // permanent you control enters tapped" (Amulet of Vigor): how it entered is part of the trigger event.
  // River Kelpie: "Whenever ~ or another permanent enters from a graveyard": where it came from is part of the event.
  const othersFromYard = /^Whenever (?!~ enters)(.+?) enters from a graveyard, (.+)$/.exec(line);
  if (othersFromYard) {
    const t = parseTrigger(`Whenever ${othersFromYard[1]} enters, ${othersFromYard[2]}`);
    return !t || t === "fail" || t.event !== "permanentEnters" ? "fail" : { ...t, ifFromGraveyard: "any" };
  }
  const howEnters = /^Whenever (?!~ )(.+?) enters (tapped|untapped), (.+)$/.exec(line);
  if (howEnters) {
    const t = parseTrigger(`Whenever ${howEnters[1]} enters, ${howEnters[3]}`);
    if (!t || t === "fail" || t.event !== "permanentEnters" || !t.enters || t.enters.filter.tapped !== undefined) return "fail";
    return { ...t, enters: { ...t.enters, filter: { ...t.enters.filter, tapped: howEnters[2] === "tapped", text: `${t.enters.filter.text} that enters ${howEnters[2]}` } } };
  }
  // "When ~ enters untapped, ..." (Mystic Sanctuary): entering untapped is part of the trigger event.
  const untapped = /^When(?:ever)? ~ enters untapped, (.+)$/.exec(line);
  if (untapped) {
    const t = parseTrigger(`When ~ enters, ${untapped[1]}`);
    return !t || t === "fail" || t.event !== "selfEnters" ? "fail" : { ...t, ifEnteredUntapped: true };
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
        // "When you cast ~, if it was kicked, exile target land." (Sowing Mycospawn): the spell as it was cast.
        if (event !== "selfEnters" && event !== "selfCast") return "fail" as const;
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
      // "If it was cast" (Wedding Ring): the same, a permanent spell resolving under its caster's control (CR 608.3).
      const wasCast = /^if (?:you cast it|it was cast), (.+)$/i.exec(body0);
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
      // "When ~ dies, if it had a revival counter on it, return it to the battlefield with one fewer revival counter on it
      // at the beginning of the next end step" (Nine-Lives Familiar): an intervening if (CR 603.4) on the creature as it
      // last existed (CR 603.10a), and the counters it comes back with counted from that too.
      let ifHadCounter: string | undefined;
      const hadKind = /^if it had an? ([a-z]+) counter on it, (.+)$/.exec(body0);
      if (hadKind) {
        if (event !== "selfDies") return "fail" as const;
        ifHadCounter = hadKind[1]!;
        body0 = hadKind[2]!;
      }
      let fewer: string | undefined;
      const fewerM = / with one fewer ([a-z]+) counter on it\b/.exec(body0);
      if (fewerM) {
        if (fewerM[1] !== ifHadCounter) return "fail" as const;
        fewer = fewerM[1]!;
        // Under the control of the player who puts it there, this ability's controller (CR 110.2a).
        body0 = body0.replace(fewerM[0], "").replace(/^return it to the battlefield at the beginning of the next end step(\.?)$/, "return it to the battlefield under your control at the beginning of the next end step$1");
      }
      // "When ~ dies, if it's not a token, ..." (Vaultborn Tyrant): an intervening if (CR 603.4) on the creature as it last
      // existed (CR 603.10a).
      let ifNotToken = false;
      const notToken = /^if it's not a token, (.+)$/i.exec(body0);
      if (notToken) {
        if (event !== "selfDies") return "fail" as const;
        ifNotToken = true;
        body0 = notToken[1]!;
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
      // "When Spiders-Man enters, if they were cast using web-slinging, ..." (CR 702.188a).
      let ifAlt: "sneak" | "surge" | "spectacle" | "webSlinging" | "prowl" | undefined;
      const altPaid = /^if (?:its|his|her|their) (sneak|surge|spectacle|prowl) cost was paid, (.+)$/i.exec(body0) ?? /^if (?:it|he|she|they) (?:was|were) cast using (web-slinging), (.+)$/i.exec(body0);
      if (altPaid) {
        if (event !== "selfEnters") return "fail" as const;
        ifAlt = altPaid[1] === "web-slinging" ? "webSlinging" : (altPaid[1]!.toLowerCase() as "sneak" | "surge" | "spectacle" | "prowl");
        body0 = altPaid[2]!;
      }
      // "If a source would deal damage ..., it deals that much damage plus 2 instead" (Rankle and Torbran): that "that much"
      // is the replaced damage's own, not the event's.
      let text = (self ? body0.replace(/^(?:it|he|she) (?=(?:gets|gains|deals|has|becomes|fights|explores)\b)/, "~ ").replace(/^(?:it|he|she) and (?=other )/, "~ and ") : body0).replace(/(would deal [^.]*?damage[^.]*?, it deals )that much( damage)/g, "$1THAT_MUCH$2");
      // "You gain that much life", "put that many +1/+1 counters on it": the damage the event dealt, or the life gained or lost.
      const playerDealt = event === "youAreDealtDamage" || event === "opponentIsDealtDamage" || event === "enchantedPlayerDealtDamage" || event === "youDamagePrevented" || event === "chosenPlayerDealtDamage";
      // Sower of Discord: the trigger's player is the other chosen one (see effects/triggers.ts).
      if (event === "chosenPlayerDealtDamage") {
        if (!/^the other chosen player also loses that much life\.$/.test(text)) return "fail" as const;
        text = "that player loses that much life.";
      }
      const amount = event === "selfDealsDamage" || event === "selfIsDealtDamage" || event === "selfDealtDamageBySource" || event === "selfDealsCombatDamage" || event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "youGainLife" || event === "opponentGainsLife" || event === "opponentLosesLife" || event === "youLoseLife" || playerDealt;
      // "With mana value less than or equal to that damage" (Aisha of Sparks and Smoke, Covert Technician): the damage dealt.
      const damage = amount && event !== "youGainLife" && event !== "opponentGainsLife" && event !== "opponentLosesLife" && event !== "youLoseLife" && !playerDealt;
      const thatMuch = amount && (/\bthat (?:much|many)\b/.test(text) || (damage && /\bless than or equal to that damage\b/.test(text)));
      if (thatMuch) {
        if (/\bX\b/.test(text)) return "fail" as const;
        text = text.replace(/\bthat (?:much|many)\b/g, "X");
        if (damage) text = text.replace(/\bless than or equal to that damage\b/g, "less than or equal to X");
      }
      text = text.replace(/THAT_MUCH/g, "that much");
      // "Put a +1/+1 counter on it", "untap it": in a trigger about the permanent itself, "it" is that
      // permanent, except after it left ("return it to your hand" means the card in the graveyard).
      const left = event === "selfDies" || event === "selfDiesOrExiled" || event === "selfToGraveyard" || event === "selfLeaves";
      if (event === "selfDealtDamageBySource") text = text.replace(/\bthat source's controller\b/g, "that player");
      if (event === "selfAttacksUnblocked" && /^Whenever ~ attacks a player and isn't blocked, /.test(line)) text = text.replace(/\b[Tt]hat player\b/g, (w) => (w[0] === "T" ? "Defending player" : "defending player"));
      // "At the beginning of each player's upkeep, ~ deals 1 damage to them" (Roiling Vortex): that player.
      if (event === "eachUpkeep" || event === "eachDrawStep") text = text.replace(/^~ deals (\d+) damage to them\.$/, "~ deals $1 damage to that player.");
      // "At the beginning of each postcombat main phase, the active player adds ..." (Belbe): that player is the active one.
      if (event === "eachUpkeep" || event === "eachDrawStep" || event === "eachFirstMain" || event === "eachPostcombatMain") text = text.replace(/\bthe active player\b/g, "that player");
      // Alexios: "that player gains control of ~, untaps it, .... It gains haste until end of turn": "it" is still ~.
      if (event === "eachUpkeep") text = text.replace(/^(that player gains control of ~[^.]*\.) It gains /, "$1 ~ gains ");
      let body = parseBody(text, { selfIt: self && !left, selfCard: left, eventPlayer: event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "eachUpkeep" || event === "eachDrawStep" || event === "eachFirstMain" || event === "eachPostcombatMain" || event === "opponentLosesLife" || event === "opponentGainsLife" || event === "selfDealtDamageBySource" || event === "opponentIsDealtDamage" || event === "enchantedPlayerDealtDamage" || event === "chosenPlayerDealtDamage" || event === "opponentPlaysLand" || event === "playerPlaysLand", defending: event === "selfAttacks" || event === "selfBecomesBlocked" || event === "selfAttacksUnblocked" || event === "selfAttacksAlone", selfCastSpell: event === "selfCast", ownX: event === "selfEnters" || event === "selfCast" || event === "selfTurnedFaceUp" });
      if (body && thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, body0) };
      if (body && fewer) {
        // The one return of the card itself, maybe delayed to the next end step.
        const effs = body.effects.length === 1 && body.effects[0]!.type === "delayed" ? body.effects[0]!.effects : body.effects;
        const ret = effs.length === 1 && effs[0]!.type === "putOntoBattlefield" && ["selfCard", "subjectCard"].includes(effs[0]!.what.ref) ? effs[0]! : undefined;
        if (!ret || ret.type !== "putOntoBattlefield" || ret.counters) return "fail" as const;
        ret.countersFromLast = { kind: fewer, plus: -1 };
      }
      const attacksPlayer = /^Whenever ~ attacks (?:a player|an opponent)(?: and isn't blocked)?, /.test(line);
      const attacksBattle = /^Whenever ~ attacks a battle, /.test(line);
      // "To a player or planeswalker": "that player" could be either's (a planeswalker's controller isn't dealt it).
      const orPlaneswalker = / to a player or planeswalker, /.test(line);
      if (orPlaneswalker && /\b(that player|defending player)\b/.test(text)) return "fail";
      // "To a player or battle": the same, a battle isn't a player (CR 310).
      const orBattle = / to a player or battle, /.test(line);
      if (orBattle && /\b(that player|defending player)\b/.test(text)) return "fail";
      const firstAttack = /^Whenever ~ attacks for the first time each turn, /.test(line);
      const saddled = /^Whenever ~ attacks while saddled, /.test(line);
      // "Is put into your graveyard": one its controller owns, since a card goes to its owner's graveyard (rulings on
      // Enigma Sphinx).
      const ownGraveyard = event === "selfToGraveyard" && /^When(?:ever)? ~ is put into your graveyard/.test(line);
      return body
        ? { event, body, ...(ownGraveyard ? { ownGraveyard } : {}), ...(ifNoCounters ? { ifNoCounter: "any" as const } : {}), ...(ifHadCounter ? { ifHadCounter } : {}), ...(ifNotToken ? { ifNotToken } : {}), ...(ifKicked ? { ifKicked } : {}), ...(ifAlt ? { ifAlt } : {}), ...(ifBargained ? { ifBargained } : {}), ...(ifEvidence ? { ifEvidence } : {}), ...(ifTreasure ? { ifTreasure } : {}), ...(ifSpent ? { ifSpent } : {}), ...(ifCastFromHand !== undefined ? { ifCastFromHand } : {}), ...(ifCast ? { ifCast } : {}), ...(ifGift ? { ifGift } : {}), ...(ifTributeUnpaid ? { ifTributeUnpaid } : {}), ...(attacksPlayer ? { attacksPlayer } : {}), ...(attacksBattle ? { attacksBattle } : {}), ...(orPlaneswalker ? { orPlaneswalker: true as const } : {}), ...(orBattle ? { orBattle: true as const } : {}), ...(firstAttack ? { firstAttack } : {}), ...(saddled ? { activeIf: { kind: "self" as const, is: "saddled" as const } } : {}), ...(onField ? { ifCond: { kind: "self" as const, is: "onBattlefield" as const } } : {}) }
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
