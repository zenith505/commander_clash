import { allEffects, type AbilityBody, type BatchTrigger, type CounterKind, type Effect, type ObjRef, type TriggeredAbility, type SpellCondition, type SpentReq, type StaticCondition, type TargetSpec, type TriggerEvent } from "../abilities";
import { COUNTER, counterKind, differenceInHand, keywordOf, NUM, X, num, parseSpentReq, singular, singularWord, SPENT } from "./words";
import { parseActivateCondition, parseStaticCondition } from "./statics";
import { parseBody, replaceX } from "./body";
import { ANY_COUNTER } from "../abilities";
import { HISTORIC, parseGroup, parseKeywordList, parseTargetPhrase, pickFilter } from "./targets";
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
  // Kaya the Inexorable's granted "When this creature dies or is put into exile": the same, an ability that works only on
  // the battlefield (CR 113.6, 603.6c).
  [/^When(?:ever)? ~ dies or is put into exile(?: from the battlefield)?, (.+)$/, "selfDiesOrExiled"],
  // Exiled as a craft material (CR 702.167a). The rulings' other case, exiled by a mana ability activated while paying
  // for the craft ability, can't happen here: mana abilities are activated before the craft ability is.
  [/^When ~ is exiled from the battlefield while you're activating a craft ability, (.+)$/, "selfExiledCrafting"],
  [/^When(?:ever)? ~ leaves the battlefield, (.+)$/, "selfLeaves"],
  [/^When you lose control of ~, (.+)$/, "selfLostControl"],
  [/^When(?:ever)? ~ is put into (?:a|your) graveyard from the battlefield, (.+)$/, "selfToGraveyard"],
  // Haunt (CR 702.55b-c): it triggers from exile, see "hauntedDies".
  [/^When the creature ~ haunts dies, (.+)$/, "hauntedDies"],
  [/^When(?:ever)? ~ becomes the target of a spell or ability, (.+)$/, "selfBecomesTarget"],
  [/^At the beginning of (?:the|each|each player's) end step, (.+)$/, "eachEndStep"],
  [/^When you cast (?:this spell|~), (.+)$/, "selfCast"],
  [/^When(?:ever)? ~ attacks, (.+)$/, "selfAttacks"],
  // Arashin War Beast: once per combat damage step, however many blocking creatures it dealt combat damage to (rulings).
  [/^Whenever ~ deals combat damage to one or more blocking creatures, (.+)$/, "selfDealsCombatDamageToBlockers"],
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
  // "When ~ deals combat damage to a player" (RMS Titanic) is the same trigger (CR 603.1).
  [/^When(?:ever)? ~ deals combat damage to a player(?: or battle)?, (.+)$/, "selfDealsCombatDamageToPlayer"],
  [/^Whenever ~ deals combat damage to a player or planeswalker, (.+)$/, "selfDealsCombatDamageToPlayer"],
  // Raphael, Tag Team Tough: only the first time this object deals combat damage to a player this turn (TriggeredAbility.firstHit).
  [/^Whenever ~ deals combat damage to a player for the first time each turn, (.+)$/, "selfDealsCombatDamageToPlayer"],
  [/^Whenever ~ deals combat damage, (.+)$/, "selfDealsCombatDamage"],
  [/^Whenever ~ deals damage to a player, (.+)$/, "selfDealsDamageToPlayer"],
  [/^Whenever ~ deals damage, (.+)$/, "selfDealsDamage"],
  // Damage dealt to it at the same time by several sources is one event (rulings): "that much" is all of it.
  [/^Whenever ~ phases in, (.+)$/, "selfPhasesIn"],
  [/^Whenever ~ phases out, (.+)$/, "selfPhasesOut"],
  [/^Whenever ~ is dealt damage, (.+)$/, "selfIsDealtDamage"],
  [/^Whenever ~ is dealt noncombat damage, (.+)$/, "selfIsDealtNoncombatDamage"],
  [/^Whenever ~ is dealt combat damage, (.+)$/, "selfIsDealtCombatDamage"],
  // "Whenever a source deals damage to ~, that source's controller ..." (Phyrexian Obliterator): once for each source
  // that deals it damage at the same time; "that source's controller" is that player (rulings).
  [/^Whenever a source deals damage to ~, (.+)$/, "selfDealtDamageBySource"],
  [/^Whenever another creature you control enters, (.+)$/, "anotherCreatureYouControlEnters"],
  [/^Whenever another creature enters the battlefield under your control, (.+)$/, "anotherCreatureYouControlEnters"],
  // Landfall
  [/^Whenever a land (?:you control enters|enters the battlefield under your control), (.+)$/, "landYouControlEnters"],
  // Blocking (CR 509.3). The "a creature" forms are matched first, by parseBlockTrigger.
  [/^Whenever ~ blocks or becomes blocked, (.+)$/, "selfBlocksOrBecomesBlocked"],
  [/^When(?:ever)? ~ becomes blocked, (.+)$/, "selfBecomesBlocked"],
  [/^Whenever ~ attacks and isn't blocked, (.+)$/, "selfAttacksUnblocked"],
  // "Whenever ~ attacks a player and isn't blocked" (Master of Cruelties): not a planeswalker or battle (rulings); "that
  // player" is the defending player. See TriggeredAbility.attacksPlayer.
  [/^Whenever ~ attacks a player and isn't blocked, (.+)$/, "selfAttacksUnblocked"],
  [/^Whenever ~ attacks alone, (.+)$/, "selfAttacksAlone"],
  // "When ~ blocks, return it to its owner's hand at end of combat" (Wall of Junk): the same event (CR 603.2).
  [/^When(?:ever)? ~ blocks, (.+)$/, "selfBlocks"],
  [/^Whenever you gain life, (.+)$/, "youGainLife"],
  [/^Whenever you pay life, (.+)$/, "youPayLife"],
  // The Millennium Calendar: the permanents you untap in your untap step's turn-based action (CR 502.3), all at once.
  [/^Whenever you untap one or more permanents during your untap step, (.+)$/, "youUntapInUntapStep"],
  [/^Whenever you create a token, (.+)$/, "youCreateToken"], // once for each token (CR 111.2)
  [/^Whenever you collect evidence, (.+)$/, "youCollectEvidence"],
  [/^Whenever you investigate, (.+)$/, "youInvestigate"],
  [/^Whenever you give a gift, (.+)$/, "youGiveGift"],
  [/^Whenever you pay ~'s cumulative upkeep, (.+)$/, "selfCumulativeUpkeepPaid"],
  [/^Whenever you foretell a card, (.+)$/, "youForetell"],
  [/^When(?:ever)? you proliferate, (.+)$/, "youProliferate"],
  [/^Whenever you forage, (.+)$/, "youForage"], // CR 701.61a
  [/^Whenever you become the monarch, (.+)$/, "youBecomeMonarch"],
  [/^Whenever an opponent becomes the monarch, (.+)$/, "opponentBecomesMonarch"],
  [/^Whenever another player loses the game, (.+)$/, "anotherPlayerLosesGame"],
  // Blood Tyrant: "Whenever a player loses the game": the same, since a player who loses leaves the game with every object
  // they own and control (CR 800.4a), so the permanent with this ability is never theirs by then.
  [/^Whenever a player loses the game, (.+)$/, "anotherPlayerLosesGame"],
  [/^When enchanted player loses the game, (.+)$/, "enchantedPlayerLosesGame"],
  // CR 731.1: the change from one to the other, not the first time it becomes day or night (rulings on The Celestus).
  [/^Whenever day becomes night or night becomes day, (.+)$/, "dayNightChanges"],
  // CR 701.30: "Whenever you clash" is any clash you take part in, started by you or an opponent (rulings).
  [/^Whenever you clash and win, (.+)$/, "youWinClash"],
  [/^Whenever you win a clash, (.+)$/, "youWinClash"],
  [/^Whenever you clash, (.+)$/, "youClash"],
  [/^Whenever you scry or surveil, (.+)$/, "youScryOrSurveil"],
  [/^Whenever you scry, (.+)$/, "youScry"],
  [/^Whenever you surveil, (.+)$/, "youSurveil"],
  [/^Whenever a spell or ability you control counters a spell, (.+)$/, "youCounterSpell"],
  [/^Whenever a spell you've cast is countered, (.+)$/, "yourSpellCountered"],
  [/^Whenever you complete a dungeon, (.+)$/, "youCompleteDungeon"],
  [/^Whenever you fully unlock a Room, (.+)$/, "youFullyUnlockRoom"],
  // Case File Auditor: "whenever you solve a Case": one of your Cases becomes solved (CR 719.3b, rulings).
  [/^Whenever you solve a Case, (.+)$/, "youSolveCase"],
  [/^Whenever you commit a crime, (.+)$/, "youCommitCrime"], // CR 700.13
  [/^Whenever an opponent commits a crime, (.+)$/, "opponentCommitsCrime"],
  [/^Whenever you choose a creature as your Ring-bearer, (.+)$/, "youChooseRingBearer"],
  [/^Whenever an opponent loses life, (.+)$/, "opponentLosesLife"],
  // The Master of Lake-town: any player, you included.
  [/^Whenever a player loses life, (.+)$/, "playerLosesLife"],
  // Emet-Selch: once for life lost at the same time, however many opponents lost it.
  [/^Whenever one or more opponents lose life, (.+)$/, "opponentsLoseLife"],
  // Ob Nixilis, Captive Kingpin: the same, only if one of them lost exactly 1 life in that event (all the combat damage
  // dealt to a player at once added up, rulings).
  [/^Whenever one or more opponents each lose exactly 1 life, (.+)$/, "opponentsLoseOneLife"],
  [/^Whenever an opponent gains life, (.+)$/, "opponentGainsLife"],
  [/^Whenever a player gains life, (.+)$/, "playerGainsLife"],
  [/^Whenever you lose life, (.+)$/, "youLoseLife"],
  // Playing a land (CR 305.1), not putting one onto the battlefield with an effect (rulings on Burgeoning).
  [/^Whenever you play a land, (.+)$/, "youPlayLand"],
  [/^When(?:ever)? you play another land, (.+)$/, "youPlayAnotherLand"],
  [/^Whenever an opponent plays a land, (.+)$/, "opponentPlaysLand"],
  [/^Whenever a player plays a land, (.+)$/, "playerPlaysLand"],
  [/^Whenever you're dealt damage, (.+)$/, "youAreDealtDamage"],
  [/^When(?:ever)? you're dealt combat damage, (.+)$/, "youAreDealtCombatDamage"],
  [/^Whenever damage that would be dealt to you is prevented, (.+)$/, "youDamagePrevented"],
  [/^Whenever an opponent is dealt damage, (.+)$/, "opponentIsDealtDamage"],
  [/^Whenever an opponent is dealt noncombat damage, (.+)$/, "opponentIsDealtNoncombatDamage"],
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
  // Relic Seeker (CR 702.112b).
  [/^When ~ becomes renowned, (.+)$/, "selfBecomesRenowned"],
  [/^Whenever ~ evolves, (.+)$/, "selfEvolves"],
  [/^Whenever ~ becomes crewed, (.+)$/, "selfBecomesCrewed"],
  [/^Whenever ~ mutates, (.+)$/, "selfMutates"],
  [/^Whenever you exert a creature, (.+)$/, "youExert"],
  [/^When(?:ever)? ~ exploits a creature, (.+)$/, "selfExploits"],
  // Heroic (an ability word): "Whenever you cast a spell that targets ~".
  [/^Whenever you cast a spell that targets ~, (.+)$/, "selfTargetedByYourSpell"],
  // Shah of Naar Isle: "When ~'s echo cost is paid" (CR 702.30a): as its echo trigger resolves and the cost is paid.
  [/^When ~'s echo cost is paid, (.+)$/, "selfEchoPaid"],
];

const SELF_EVENTS: TriggerEvent[] = [
  "selfEnters", "selfDies", "selfDiesOrExiled", "selfExiledCrafting", "selfLeaves", "selfLostControl", "selfToGraveyard", "selfBecomesTarget", "selfAttacks", "selfAttacksOrBlocks", "selfDealsCombatDamageToPlayer", "selfTurnedFaceUp", "selfTransformsInto",
  "selfDealsDamage", "selfDealsCombatDamage", "selfDealsCombatDamageToBlockers", "selfTargetedByYourSpell", "selfLastTimeCounterRemoved", "selfLastCounterRemoved", "selfEchoPaid", "selfExploits",
  "selfBlocks", "selfBecomesBlocked", "selfAttacksUnblocked", "selfAttacksAlone", "selfBlocksOrBecomesBlocked", "selfBlocksCreature", "selfBlockedByCreature", "selfBlocksOrBlockedByCreature",
  "selfDealsDamageToCreature", "selfDealsCombatDamageToCreature", "selfDealsDamageToPlayer", "selfBecomesTapped", "selfIsDealtDamage", "selfIsDealtNoncombatDamage", "selfIsDealtCombatDamage", "selfBecomesMonstrous", "selfEvolves", "selfMutates", "selfPhasesIn", "selfPhasesOut",
  "selfBecomesUntapped", "selfBecomesCrewed", "selfCrewsVehicle",
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
const HOST_TRIGGERS: [RegExp, TriggerEvent, { thatMuch?: true; eventPlayer?: true; defending?: true; toOpponent?: true; creature?: true; spell?: true; aura?: true }][] = [
  [/^attacks or blocks, (.+)$/, "selfAttacksOrBlocks", {}],
  [/^attacks, (.+)$/, "selfAttacks", { defending: true }],
  [/^blocks or becomes blocked, (.+)$/, "selfBlocksOrBecomesBlocked", {}],
  [/^becomes blocked, (.+)$/, "selfBecomesBlocked", { defending: true }],
  [/^attacks and isn't blocked, (.+)$/, "selfAttacksUnblocked", { defending: true }],
  [/^attacks alone, (.+)$/, "selfAttacksAlone", { defending: true }],
  // Neglected Heirloom: "When equipped creature transforms, transform this Equipment" (CR 701.27).
  [/^transforms, (.+)$/, "selfTransforms", {}],
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
  // Spectral Prison: "When enchanted creature becomes the target of a spell, sacrifice ~": of a spell only.
  [/^becomes the target of a spell, (.+)$/, "selfBecomesTarget", { spell: true }],
  // Brinebound Gift: "Whenever ... enchanted creature becomes the target of an Aura spell": a spell with that subtype.
  [/^becomes the target of an Aura spell, (.+)$/, "selfBecomesTarget", { spell: true, aura: true }],
  [/^becomes tapped, (.+)$/, "selfBecomesTapped", {}],
  [/^becomes untapped, (.+)$/, "selfBecomesUntapped", {}],
  [/^is dealt damage, (.+)$/, "selfIsDealtDamage", { thatMuch: true }],
  // Fatal Mutation: "When enchanted creature is turned face up, destroy it" (CR 708.8: it doesn't enter again).
  [/^is turned face up, (.+)$/, "selfTurnedFaceUp", {}],
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
  // Darksteel Garrison: "Whenever fortified land becomes tapped" (CR 301.6).
  const m = /^When(?:ever)? (~ or )?(?:enchanted|equipped) (creature|land|artifact|permanent) (.+)$/.exec(line) ?? /^When(?:ever)? (~ or )?fortified (land) (.+)$/.exec(line);
  if (!m) return null;
  // "Whenever equipped creature deals combat damage during your turn, ..." (The Aetherspark): it triggers only during
  // its controller's turn.
  const yours = /^(deals (?:combat )?damage) during your turn, /.exec(m[3]!);
  if (yours) m[3] = m[3]!.replace(" during your turn, ", ", ");
  // "Whenever equipped creature becomes blocked by a creature, you may draw two cards" (Infiltration Lens): once for each
  // creature blocking it (rulings), which "that creature" would mean.
  // Mammoth Harness, Barrow-Blade, Wooden Stake: "Whenever enchanted creature blocks or becomes blocked by a creature, ...":
  // once for each creature it blocks or is blocked by (CR 509.3c-d), "that creature" and "the other creature" being that
  // one. Dead-Iron Sledge: "destroy both creatures", the two of them as it triggered (rulings: moving the Equipment after
  // that changes nothing).
  const inBlock = m[2] === "creature" && !m[1] && !yours ? /^blocks or becomes blocked by (an? .+?), (.+)$/.exec(m[3]!) : null;
  if (inBlock) {
    const what = inBlock[1]!.replace(/^an? /, "");
    const filter = what === "creature" ? undefined : parseTargetPhrase(what);
    if (filter === null || (filter && filter.kind !== "object")) return "fail";
    const text = inBlock[2]!.replace(/\bthe other creature\b/g, "that creature");
    if (/\b(its?|enchanted|equipped)\b/i.test(text.replace(/^(destroy that creature\. )It (can't be regenerated\.)$/, "$1$2"))) return "fail";
    const body = /^destroy both creatures\.$/.test(text) ? { targets: [], effects: [{ type: "destroy" as const, what: { ref: "eventGroup" as const } }], text } : parseBody(text, { subject: true });
    return body ? { event: "selfBlocksOrBlockedByCreature", body, host: "attached", ...(filter ? { subjectFilter: { ...filter, text: what } } : {}) } : "fail";
  }
  // Shield of the Righteous: "Whenever equipped creature blocks a creature, that creature doesn't untap during its
  // controller's next untap step": once for each creature it blocks, "that creature" that attacker, whoever controls it
  // then (rulings: it isn't tapped by this, and it's that creature's next untap step under whoever controls it).
  const blocksOne = m[2] === "creature" && !m[1] && !yours ? /^blocks a creature, (that creature doesn't untap during its controller's next untap step\.)$/.exec(m[3]!) : null;
  if (blocksOne) {
    const body = parseBody(blocksOne[1]!, { subject: true });
    return body ? { event: "selfBlocksCreature", body, host: "attached" } : "fail";
  }
  // Hedron Blade: "Whenever equipped creature becomes blocked by one or more colorless creatures, it gains deathtouch until
  // end of turn": once per combat, however many there are (as for Serra Inquisitors), "it" the equipped creature.
  const byMany = m[2] === "creature" && !m[1] && !yours ? /^becomes blocked by one or more (.+?), (.+)$/.exec(m[3]!) : null;
  if (byMany) {
    const phrase = byMany[1]!.replace(/ and\/or /g, " or ");
    const filter = /s$/.test(phrase) ? pickFilter(phrase.replace(/s$/, "")) : null;
    if (!filter || filter.kind !== "object" || !(filter.types?.includes("Creature") || filter.subtypes?.length)) return "fail";
    const body = parseBody(byMany[2]!, { subjectIt: true, defending: true });
    return body ? { event: "selfBecomesBlocked", body, host: "attached", blockFilter: { ...filter, text: byMany[1]! } } : "fail";
  }
  // Fractured Loyalty: "Whenever enchanted creature becomes the target of a spell or ability, that spell or ability's
  // controller gains control of that creature": the player who controls that spell or ability as it targets (CR 115.10),
  // for good (a control effect with no duration, CR 611.2a).
  if (m[2] === "creature" && !m[1] && !yours && /^becomes the target of a spell or ability, that spell or ability's controller gains control of that creature\.?$/.test(m[3]!)) {
    const body = parseBody("that player gains control of that creature.", { subject: true, eventPlayer: true });
    return body ? { event: "selfBecomesTarget", targeted: {}, body, host: "attached" } : "fail";
  }
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
    // Elbrus, the Binding Blade: "unattach ~, then transform it": "it" is the Equipment (it transforms even if it can't be
    // unattached, rulings).
    text = text.replace(/^unattach ~, then transform it(\.?)$/, "unattach ~. Transform ~$1");
    // "Deals combat damage to a player or battle" (Beamtown Beatstick): "that player" isn't about a battle (CR 310).
    const orBattle = /^deals combat damage to a player or battle, /.test(m[3]!);
    if (orBattle && /\b(that player|defending player)\b/.test(text)) return "fail";
    // "~ or equipped creature": "it" could be either. Ogre-Head Helm: "you may sacrifice it. If you do, ...": whichever dealt
    // the damage, the equipped creature and not the Helm if it did (rulings). Simian Sling:
    // "Whenever ~ or equipped creature becomes blocked, it deals 1 damage to defending player": whichever became blocked
    // (rulings), the subject either way.
    // Tanuki Transplanter: "Whenever ~ or equipped creature attacks, add an amount of {G} equal to its power": the power of
    // whichever attacked, as the ability resolves or as it last existed (rulings). Chainflail Centipede: "it gets +2/+0
    // until end of turn": whichever attacked.
    const whichever = !!m[1] && ((event === "selfBecomesBlocked" && /^it deals \d+ damage to defending player\.?$/.test(text)) || (event === "selfAttacks" && /^add an amount of \{[WUBRGC]\} equal to its power\. Until end of turn, you don't lose this mana as steps and phases end\.?$/.test(text)) || (event === "selfAttacks" && /^it gets \+\d+\/\+\d+ until end of turn\.?$/.test(text)) || (event === "selfDealsCombatDamageToPlayer" && /^you may sacrifice it\. If you do, (?:(?!\b(?:it|its|that creature)\b)[^.])+\.?$/.test(text)));
    if (m[1] && /\b(it|its|that creature)\b/i.test(text) && !whichever) return "fail";
    if (o.creature) {
      // Neko-Te: "That creature doesn't untap during its controller's untap step": "its" is that creature's there.
      if (/\b(it|its)\b/i.test(text.replace(/\b(that creature) doesn't untap during its controller's untap step\b/gi, "$1 doesn't untap"))) return "fail"; // the creature dealing damage, or the one dealt it?
      text = text.replace(/\bthe other creature\b/g, "that creature");
    }
    // Mask of the Schemer: "it connives X, where X is the amount of damage it dealt to that player": that much.
    if (o.thatMuch && event === "selfDealsCombatDamageToPlayer" && !/\bthat (?:much|many)\b/.test(text)) text = text.replace(/^([^X]*)\bX\b([^X]*), where X is the amount of damage it dealt to that player\.$/, "$1that many$2.");
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
    return { event, body: withOtherOpponents(body), host: m[1] ? "orSelf" : "attached", ...(o.spell ? { targeted: { spell: true as const, ...(o.aura ? { spellSubtypes: ["Aura"] } : {}) } } : {}), ...(o.toOpponent ? { toOpponent: true } : {}), ...(orBattle ? { orBattle: true as const } : {}), ...(yours ? { activeIf: { kind: "yourTurn" as const } } : {}) };
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
  // Toralf, God of Fury: "~ deals damage equal to the excess to any target other than that permanent": X the excess
  // (CR 120.10), the target any but the permanent dealt it (TargetSpec.notSubject, fixed as the trigger is put on the
  // stack); the excess counts no matter what it was before (rulings).
  const toralf = /^~ deals damage equal to the excess to any target other than that permanent\.$/.test(text);
  if (toralf) {
    if (oneOrMore || /\bX\b/.test(text)) return "fail";
    text = "~ deals X damage to any target.";
  }
  if (oneOrMore && /\b(it|that|those)\b/.test(text)) return "fail";
  let body = parseBody(text, { subjectIt: true });
  if (!body) return "fail";
  if (toralf) {
    if (body.targets.length !== 1) return "fail";
    body = { ...body, targets: [{ ...body.targets[0]!, notSubject: true as const, text: "any target other than that permanent" }] };
  }
  if (where || toralf) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: m[4]!.replace(/^if [^]+? this turn, /, "") };
  return { event: "permanentDealtExcess", body, excess: { filter: { ...filter, text: m[2]! }, ...(m[3] ? { noncombat: true as const } : {}), ...(oneOrMore ? { oneOrMore: true as const } : {}) }, ...(ifCond ? { ifCond } : {}) };
}

/**
 * "Whenever ~ deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next
 * untap step": once for each creature it dealt damage to (CR 603.2c), which "that creature" and "it" mean.
 */
function parseDamagesCreatureTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever ~ deals damage to a Vampire, destroy that creature" (Vampire Slayer), "to a Goblin or Orc" (East-Mark
  // Cavalier): only a creature of those types it deals damage to triggers it, once for each (CR 603.2c).
  const typed = /^Whenever ~ deals (combat )?damage to an? ([A-Z][a-z]+)(?: or ([A-Z][a-z]+))?, (.+)$/.exec(line);
  if (typed) {
    const subtypes = [typed[2]!, ...(typed[3] ? [typed[3]] : [])];
    if (!subtypes.every((t) => CREATURE_TYPES.has(t))) return "fail";
    const t = parseDamagesCreatureTrigger(`Whenever ~ deals ${typed[1] ?? ""}damage to a creature, ${typed[4]}`);
    return !t || t === "fail" ? "fail" : { ...t, subjectFilter: { kind: "object", types: ["Creature"], subtypes, text: subtypes.join(" or ") } };
  }
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
  // Mindblade Render: "Whenever your opponents are dealt combat damage, if any of that damage was dealt by a Warrior, ...":
  // once for each combat damage step (rulings), a Warrior anyone controls dealing it to one of your opponents (rulings).
  const render = /^Whenever your opponents are dealt combat damage, if any of that damage was dealt by an? ([A-Z][a-z]+), (.+)$/.exec(line);
  if (render) {
    const spec = parseTargetPhrase(render[1]!);
    const body = parseBody(render[2]!);
    if (spec?.kind !== "object" || spec.controller || !body || /\b(?:that|those|they|them|it)\b/.test(render[2]!)) return "fail";
    return { event: "groupDealsDamageToPlayers", body, damageGroup: { filter: { ...spec, text: render[1]! }, opponents: true, combat: true, anyController: true } };
  }
  // Fblthp, Impossibly Lost: "When one or more of your opponents are dealt combat damage during your turn, ...": once for
  // each combat damage step of its controller's turn that deals combat damage to one or more of them, from any source.
  const lost = /^When one or more of your opponents are dealt combat damage during your turn, (.+)$/.exec(line);
  if (lost) {
    const body = parseBody(lost[1]!);
    if (!body || /\b(?:that|those|they|them)\b/.test(lost[1]!.replace(/\binto their library\b/, ""))) return "fail";
    return { event: "groupDealsDamageToPlayers", body, damageGroup: { filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "source" }, opponents: true, combat: true, anyController: true, yourTurn: true } };
  }
  // Puppet Master, String Puller: "Whenever one or more goaded creatures deal combat damage to one of your opponents, ...":
  // anyone's goaded creatures (CR 701.15), once for each opponent they deal combat damage to at once (CR 603.2c).
  const goaded = /^Whenever one or more goaded creatures deal combat damage to one of your opponents, (.+)$/.exec(line);
  if (goaded) {
    const spec = parseTargetPhrase("goaded creature");
    const body = parseBody(goaded[1]!, { eventPlayer: true });
    if (spec?.kind !== "object" || !body) return "fail";
    return { event: "groupDealsDamageToPlayers", body, damageGroup: { filter: { ...spec, text: "goaded creatures" }, opponents: true, perPlayer: true, combat: true, anyController: true } };
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
  // Pain Magnification: "Whenever an opponent is dealt 3 or more damage by a single source, that player discards a card".
  const single = /^Whenever an opponent is dealt (two|three|four|five|six|seven|eight|nine|ten|\d+) or more damage by a single source, (.+)$/.exec(line);
  if (single) {
    if (/\b(it|its|that source|that much|that many)\b/.test(single[2]!)) return "fail";
    const body = parseBody(single[2]!, { eventPlayer: true });
    return body ? { event: "opponentDealtDamageBySource", body, minDamage: num(single[1]!) } : "fail";
  }
  const m0 = /^Whenever a source you control deals (one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more damage to a player, (.+)$/.exec(line);
  // Talon of Pain: "a source you control other than ~"; Night Dealings: "to another player", every other player being an
  // opponent in this free-for-all game (CR 102.3).
  const m1 = m0 ? null : /^Whenever a source you control( other than ~)? deals (noncombat )?damage to (?:an opponent|another player), (.+)$/.exec(line);
  const m = m0 ? ([m0[0], undefined, m0[2]] as const) : m1 ? ([m1[0], m1[2], m1[3]] as const) : null;
  if (!m) return null;
  let text = m[2]!;
  // Fear of Burning Alive: "..., if there are four or more card types among cards in your graveyard, ...": an
  // intervening if, read with the others (parseTrigger).
  if (/^if [^,]+, /.test(text)) return null;
  if (/\b(it|its|that source|that creature|from your graveyard)\b/.test(text)) return "fail";
  const thatMuch = /\bthat (?:much|many|amount of)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many|amount of)\b/g, "X");
  }
  let body = parseBody(text, { eventPlayer: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[2]!) };
  return { event: "sourceYouControlDamagesOpponent", body, ...(m[1] ? { noncombatOnly: true as const } : {}), ...(m0 ? { minDamage: num(m0[1]!), anyPlayer: true as const } : {}), ...(m1?.[1] ? { otherSource: true as const } : {}) };
}

function parseDamagesYouTrigger(line: string): TriggeredAbility | "fail" | null {
  // Elesh Norn: "Whenever a source an opponent controls deals damage to you or a permanent you control, that source's
  // controller ...": the source's controller is "that player".
  const yours = /^Whenever a source an opponent controls deals damage to you or a permanent you control, (.+)$/.exec(line);
  if (yours) {
    const text = yours[1]!.replace(/\bthat source's controller\b/g, "that player");
    if (/\b(it|its|that source|that creature|that permanent)\b/.test(text)) return "fail";
    const body = parseBody(text, { eventPlayer: true });
    return body ? { event: "opponentSourceDamagesYouOrYours", body: { ...body, text: yours[1]! } } : "fail";
  }
  const m = /^Whenever (an?) (.+?) deals (combat )?damage to you, (.+)$/.exec(line);
  if (!m) return null;
  // Circle of Affliction: "Whenever a source of the chosen color deals damage to you, ...": once for each source of the
  // color chosen as it entered, a spell too (rulings), its colors as it dealt the damage.
  if (m[2] === "source of the chosen color") {
    if (/\b(it|its|that source|that creature|that player|that much|that many)\b/.test(m[4]!)) return "fail";
    const body = parseBody(m[4]!);
    return body ? { event: "dealsDamageToYou", body, damagesYou: { chosenColor: true, ...(m[3] ? { combat: true as const } : {}) } } : "fail";
  }
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
    // Stick, Fearless Mentor: "exile the top card of your library. You may play it until the end of your next turn": "it"
    // is the exiled card there, not the source.
    const guard = text.replace(/^exile the top card of your library\. You may play it (?=until the end of your next turn\.?$)/, "");
    if (/\b(it|its|that source|that creature)\b/.test(guard) || (damagesYou.by !== "opponent" && /\bthat player\b/.test(text))) return "fail";
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
  // Serra Inquisitors: "Whenever ~ blocks or becomes blocked by one or more black creatures", Dwarven Soldier: "... by one
  // or more Orcs", Rashka the Slayer: "Whenever ~ blocks one or more black creatures": once per combat, however many of
  // them there are (rulings on Amphibious Kavu and Rashka); "blue and/or black" is either color (CR 105.2).
  const oneOrMore = /^Whenever ~ (blocks or becomes blocked by|blocks|becomes blocked by) one or more (.+?), (.+)$/.exec(line);
  if (oneOrMore) {
    const phrase = oneOrMore[2]!.replace(/ and\/or /g, " or ");
    const filter = /s$/.test(phrase) ? pickFilter(phrase.replace(/s$/, "")) : null;
    if (!filter || filter.kind !== "object" || !(filter.types?.includes("Creature") || filter.subtypes?.length)) return "fail";
    const body = parseBody(oneOrMore[3]!, { selfIt: true });
    if (!body) return "fail";
    const event: TriggerEvent = oneOrMore[1] === "blocks" ? "selfBlocks" : oneOrMore[1] === "becomes blocked by" ? "selfBecomesBlocked" : "selfBlocksOrBecomesBlocked";
    return { event, body, blockFilter: { ...filter, text: oneOrMore[2]! } };
  }
  // "Whenever a creature blocks" (anyone's), "Whenever a Rat you control becomes blocked": "it" and "that creature" are
  // that creature, once for each (CR 509.3a, 509.3c).
  // "Whenever a creature you control blocks" (Noble Stand), "... with defender blocks" (Perimeter Captain): yours only.
  // Tetsuko Umezawa, Pursuer: "a creature an opponent controls with power or toughness 1 or less blocks".
  // Spined Sliver: "Whenever a Sliver becomes blocked, that Sliver gets ...": anyone's Sliver, "that Sliver" being it.
  // Labyrinth Raptor: "Whenever a creature you control with menace becomes blocked, defending player sacrifices a creature
  // of their choice that's blocking it": the player it attacks (CR 506.2) chooses one blocking it as this resolves.
  const raptor = /^Whenever a (creature you control with [a-z]+) becomes blocked, defending player sacrifices a creature of their choice that's blocking it\.$/.exec(line);
  if (raptor) {
    const filter = parseTargetPhrase(raptor[1]!);
    if (filter?.kind !== "object" || filter.controller !== "you" || !filter.keywords?.length) return "fail";
    return { event: "creatureBecomesBlocked", subjectFilter: { ...filter, text: raptor[1]! }, body: { targets: [], effects: [{ type: "pick", who: { ref: "eventPlayer" }, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], blockingSubject: true, text: "creature blocking it" }, n: 1, action: "sacrifice" }], text: "defending player sacrifices a creature of their choice that's blocking it." } };
  }
  // Seifer, Balamb Rival: "Whenever a creature attacking one of your opponents becomes blocked by two or more creatures,
  // that attacking creature gains deathtouch until end of turn": anyone's creature attacking that player (rulings), with
  // two or more blockers as blockers are declared (CR 509.3c); "that attacking creature" is it.
  const blockedByMany = /^Whenever an? (creature attacking one of your opponents) becomes blocked by (two|three) or more creatures, (.+)$/.exec(line);
  if (blockedByMany) {
    const filter = parseTargetPhrase(blockedByMany[1]!);
    if (filter?.kind !== "object" || filter.combat !== "attackingOpponent" || /\b(?:it|its|that creature)\b/.test(blockedByMany[3]!)) return "fail";
    const body = parseBody(blockedByMany[3]!.replace(/\bthat attacking creature\b/g, "it"), { subjectIt: true });
    return body ? { event: "creatureBecomesBlocked", body, subjectFilter: { ...filter, text: blockedByMany[1]! }, blockedByAtLeast: num(blockedByMany[2]!) } : "fail";
  }
  const anyones = /^Whenever an? ([A-Z][a-z]+) becomes blocked, (.+)$/.exec(line);
  const other = /^Whenever (an?) ((?:[a-z]+ )?creature(?: you control| an opponent controls)?(?: with [a-z]+| with power or toughness \d+ or less)?) blocks, (.+)$/.exec(line) ?? /^Whenever (an?) (.+?) you control becomes blocked, (.+)$/.exec(line) ?? (anyones && CREATURE_TYPES.has(anyones[1]!) ? ["", "a", anyones[1]!, anyones[2]!.replace(new RegExp(`\\bthat ${anyones[1]}\\b(?!'s)`, "g"), "it")] : null);
  if (other) {
    const blocks = / blocks, /.test(line);
    const filter = parseTargetPhrase(other[2]!);
    if (!filter || filter.kind !== "object" || (filter.controller && !(blocks && (filter.controller === "you" || filter.controller === "opponent"))) || !(filter.types?.includes("Creature") || filter.subtypes?.length)) return "fail";
    const body = parseBody(other[3]!.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true });
    if (!body) return "fail";
    const yours = !blocks && !anyones;
    return { event: blocks ? "creatureBlocks" : "creatureBecomesBlocked", body, subjectFilter: { ...filter, ...(yours ? { controller: "you" as const } : {}), text: yours ? `${other[2]} you control` : other[2]! } };
  }
  // Lairwatch Giant: "Whenever ~ blocks two or more creatures": as blockers are declared, once (CR 509.3a, 509.1). Nothing
  // here makes a creature block more creatures later.
  const blocksMany = /^Whenever ~ blocks (two|three) or more creatures, (.+)$/.exec(line);
  if (blocksMany) {
    const body = parseBody(blocksMany[2]!, { selfIt: true });
    return body ? { event: "selfBlocks", body, blocksAtLeast: num(blocksMany[1]!) } : "fail";
  }
  // No Quarter: "Whenever a creature becomes blocked by a creature with lesser power, destroy the blocking creature";
  // "Whenever a creature blocks a creature with lesser power, destroy the attacking creature": once for each such pair as
  // blockers are declared (CR 509.3c-d), anyone's creatures, the one destroyed the trigger's subject.
  const lesser = /^Whenever a creature (becomes blocked by|blocks) a creature with lesser power, destroy the (blocking|attacking) creature\.$/.exec(line);
  if (lesser) {
    if ((lesser[1] === "blocks") !== (lesser[2] === "attacking")) return "fail";
    const body = parseBody("Destroy it.", { subjectIt: true });
    return body ? { event: "creatureBlocksCreature", body: { ...body, text: `destroy the ${lesser[2]} creature.` }, blockPower: lesser[2] === "blocking" ? "blockerLess" : "attackerLess" } : "fail";
  }
  // Righteous Indignation: "Whenever a creature blocks a black or red creature, the blocking creature gets +1/+1 until end
  // of turn": once for each such creature it blocks (CR 509.3c), "the blocking creature" the blocker.
  const blocksA = /^Whenever (an?) (creature(?: you control)?) blocks (an? [^,]+? creature), (.+)$/.exec(line);
  if (blocksA) {
    const filter = parseTargetPhrase(blocksA[2]!);
    const attacker = parseTargetPhrase(blocksA[3]!.replace(/^an? /, ""));
    if (filter?.kind !== "object" || attacker?.kind !== "object" || attacker.controller || /\b(?:it|its|that creature)\b/.test(blocksA[4]!)) return "fail";
    const body = parseBody(blocksA[4]!.replace(/\bthe blocking creature\b/g, "it"), { subjectIt: true });
    return body ? { event: "creatureBlocksCreature", body, subjectFilter: { ...filter, text: blocksA[2]! }, blockFilter: { ...attacker, text: blocksA[3]! } } : "fail";
  }
  // "Whenever ~ crews a Vehicle, that Vehicle gains haste until end of turn" (Speedway Fanatic): it crews one when it's
  // tapped to pay its crew cost (CR 702.122d), "that Vehicle" the one crewed, once for each crew ability.
  const crews = /^Whenever ~ crews a Vehicle, (.+)$/.exec(line);
  if (crews) {
    if (/\b(?:it|its)\b/.test(crews[1]!)) return "fail";
    const body = parseBody(crews[1]!.replace(/\bthat Vehicle\b/g, "it"), { subjectIt: true });
    return body ? { event: "selfCrewsVehicle", body: { ...body, text: crews[1]! } } : "fail";
  }
  // Catacomb Dragon: "a nonartifact, non-Dragon creature" is one that's neither (the comma joins two "non-" words).
  const blockLine = line.replace(/^(Whenever ~ becomes blocked by an? non[-a-z]+), (non-?[A-Za-z]+ creature, )/, "$1 $2");
  for (const [re, event] of BLOCK_TRIGGERS) {
    const m = re.exec(blockLine);
    if (!m) continue;
    const what = m[1]!.replace(/^an? /, "");
    const filter = what === "creature" ? undefined : parseTargetPhrase(what);
    if (filter === null || (filter && filter.kind !== "object")) return "fail";
    // Battering Ram: "Whenever ~ becomes blocked by a Wall, destroy that Wall at end of combat": "that Wall" is that creature.
    // Order of the Alabaster Host: "the blocking creature gets -1/-1" is that creature, the blocker. Catacomb Dragon:
    // "where X is half the creature's power, rounded down": that creature's, as the ability resolves (CR 608.2h).
    const blockedBy = event === "selfBlockedByCreature";
    const named = (CREATURE_TYPES.has(what) ? m[2]!.replace(new RegExp(`\\bthat ${what}\\b`, "g"), "that creature") : m[2]!)
      .replace(blockedBy ? /^the blocking creature (?=gets )/ : /$^/, "that creature ")
      .replace(blockedBy ? /(, where X is half) the creature's power(, rounded (?:down|up)\.)$/ : /$^/, "$1 that creature's power$2");
    // Basalt Golem: "that creature's controller sacrifices it at end of combat. If the player does, they create a 0/2 ...
    // token": a delayed trigger for that creature (CR 603.7), whose controller then sacrifices it, and gets the token only if
    // it was sacrificed as that delayed trigger resolved (rulings), that player as it last existed.
    const sacThen = blockedBy ? /^that creature's controller sacrifices it at end of combat\. If the player does, they (create .+)\.$/.exec(named) : null;
    if (sacThen) {
      const then = parseBody(`That creature's controller ${sacThen[1]!.replace(/^create/, "creates")}.`, { subject: true });
      if (!then || then.targets.length || then.effects.length !== 1 || then.effects[0]!.type !== "createToken") return "fail";
      const effects: Effect[] = [{ type: "sacrifice", what: { ref: "subject" }, byController: true }, { type: "if", cond: { kind: "sacrificedThisWay" }, effects: then.effects }];
      return { event, body: { targets: [], effects: [{ type: "delayed", when: "endOfCombat", each: "subject", effects, text: named.replace(/ at end of combat\./, ".") }], text: named }, ...(filter ? { subjectFilter: { ...filter, text: what } } : {}) };
    }
    const body = parseBody(named.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ "), { subject: true });
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
// "A Pegasus, Unicorn, or Horse creature spell" (Thurid, Mare of Destiny) too.
const CAST_TRIGGER = /^When(?:ever)? (you|an opponent|another player|a player|enchanted player|the chosen player) casts? (or copy |or copies )?(an? (?:[A-Za-z]+, )+or [A-Za-z]+(?: creature)? spell(?: from (?:your|their) hand)?|an? [^,]*? with mana value, power, or toughness equal to the chosen number|an? .+?|another (?!player).+?)(?: spell)?, (.+)$/;
// "Another player" is any other player, all of them opponents in a free-for-all Commander game (CR 903.2, 800.4a).
// "The chosen player" (Sewer Nemesis): the player chosen as the permanent entered.
const CAST_BY = { you: "you", "an opponent": "opponent", "another player": "opponent", "a player": "any", "enchanted player": "enchanted", "the chosen player": "chosen" } as const;

/**
 * "When ~ becomes the target of a spell, sacrifice it", "Whenever ~ becomes the target of a spell or ability for the first
 * time each turn, counter that spell or ability" (Glyph Keeper), valiant's "... a spell or ability you control for the
 * first time each turn", "Whenever a permanent you control becomes the target of a spell or ability an opponent controls".
 * "That player" is the controller of the spell or ability; "that spell or ability" is it.
 */
function parseTargetedTrigger(line: string): TriggeredAbility | "fail" | null {
  // Unsettled Mariner: "Whenever you or a permanent you control becomes the target of a spell or ability an opponent
  // controls, counter that spell or ability unless its controller pays {1}." Once for you and once for each permanent it
  // targets, however many times (rulings).
  // Amulet of Safekeeping: "Whenever you become the target of ...": you only.
  const mariner = /^Whenever you (or a permanent you control becomes|become) the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays (\{\d+\})\.$/.exec(line);
  if (mariner) {
    const unless = { cost: mariner[2]! };
    const onlyYou = mariner[1] === "become";
    return { event: "permanentBecomesTarget", targeted: { by: "opponent", orYou: true, ...(onlyYou ? { onlyYou: true as const } : {}) }, subjectFilter: { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", text: "permanent you control" }, body: { targets: [], effects: [{ type: "counterUnlessPays", unless }], text: `counter that spell or ability unless its controller pays ${mariner[2]}.` } };
  }
  // Rayne, Academy Chancellor: "Whenever you or a permanent you control becomes the target of a spell or ability an
  // opponent controls, you may draw a card. You may draw an additional card if ~ is enchanted.": once for you and once for
  // each permanent it targets (rulings), whether ~ is enchanted checked as it resolves (rulings: the "if" is no intervening
  // "if"). Nothing in it about that spell or its controller.
  const youOrYours = /^Whenever you or a permanent you control becomes the target of a spell or ability an opponent controls, (.+)$/.exec(line);
  if (youOrYours) {
    const text = youOrYours[1]!.replace(/\. You may draw an additional card if ~ is enchanted\.$/, ". If ~ is enchanted, you may draw a card.");
    if (/\b(?:it|its|that player|that spell|that permanent|that spell or ability)\b/.test(text)) return "fail";
    const body = parseBody(text, {});
    return body ? { event: "permanentBecomesTarget", targeted: { by: "opponent", orYou: true }, subjectFilter: { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", text: "permanent you control" }, body } : "fail";
  }
  // Dormant Gomazoa: "Whenever you become the target of a spell, you may untap ~": any player's spell, not an ability, once
  // for each spell however many of its targets are you (rulings).
  const youSpell = /^Whenever you become the target of a spell, (.+)$/.exec(line);
  if (youSpell) {
    if (/\b(?:that player|that spell|its controller)\b/.test(youSpell[1]!)) return "fail";
    const body = parseBody(youSpell[1]!, {});
    return body ? { event: "permanentBecomesTarget", targeted: { spell: true, orYou: true, onlyYou: true }, body } : "fail";
  }
  // Leyline of Combustion: "Whenever you and/or at least one permanent you control becomes the target of a spell or
  // ability an opponent controls, ~ deals 2 damage to that player": once for each spell or ability, however many of its
  // targets are you or yours (rulings); "that player" is its controller.
  const atLeastOne = /^Whenever you and\/or at least one permanent you control becomes the target of a spell or ability an opponent controls, (.+)$/.exec(line);
  if (atLeastOne) {
    if (/\b(?:it|its|that permanent|that spell or ability)\b/.test(atLeastOne[1]!)) return "fail";
    const body = parseBody(atLeastOne[1]!, { eventPlayer: true });
    return body ? { event: "permanentBecomesTarget", targeted: { by: "opponent", orYou: true, once: true }, subjectFilter: { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", text: "permanent you control" }, body } : "fail";
  }
  // Surrak, Elusive Hunter: "Whenever a creature you control or a creature spell you control becomes the target of a spell
  // or ability an opponent controls, draw a card": once for each of them it targets, a spell on the stack too.
  const surrak = /^Whenever a creature you control or a creature spell you control becomes the target of a spell or ability an opponent controls, (.+)$/.exec(line);
  if (surrak) {
    if (/\b(?:it|its|that creature|that spell)\b/.test(surrak[1]!)) return "fail";
    const body = parseBody(surrak[1]!, {});
    const spell = parseTargetPhrase("creature spell");
    if (!body || spell?.kind !== "spell") return "fail";
    return { event: "permanentBecomesTarget", targeted: { by: "opponent", orSpell: { ...spell, text: "creature spell you control" } }, subjectFilter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creature you control" }, body };
  }
  // Silverfur Partisan: "becomes the target of an instant or sorcery spell": a spell of either type.
  // Fugitive Druid: "becomes the target of an Aura spell": a spell with that subtype.
  const typed = /^(When(?:ever)? (?:~|an?(?:other)? .+?) becomes the target of )an (instant or sorcery|Aura) spell(?! or ability)/.exec(line);
  // Skophos Maze-Warden: "Whenever another creature becomes the target of an ability of a land you control named Labyrinth of
  // Skophos, you may have ~ fight that creature." Once for each such ability, however many of its targets it is; it
  // resolves first, even if that ability is countered (rulings).
  const maze = /^Whenever another creature becomes the target of an ability of a land you control named ([^,]+), (you may have ~ fight that creature\.)$/.exec(line);
  if (maze) {
    const body = parseBody(maze[2]!, { subjectIt: true });
    if (!body) return "fail";
    return { event: "permanentBecomesTarget", targeted: { other: true, abilityOf: { kind: "object", types: ["Land"], controller: "you", named: maze[1]!, text: `land you control named ${maze[1]}` } }, subjectFilter: { kind: "object", types: ["Creature"], text: "creature" }, body };
  }
  const m = /^When(?:ever)? (~|an?(?:other)? .+?) becomes the target of a spell( or ability)?( you control| an opponent controls)?( for the first time each turn)?, (.+)$/.exec(typed ? line.replace(typed[0], `${typed[1]}a spell`) : line);
  if (!m) return null;
  const targeted = { ...(m[2] ? {} : { spell: true as const }), ...(typed ? (typed[2] === "Aura" ? { spellSubtypes: ["Aura"] } : { spellTypes: ["Instant", "Sorcery"] }) : {}), ...(m[3] ? { by: m[3] === " you control" ? ("you" as const) : ("opponent" as const) } : {}), ...(m[4] ? { first: true as const } : {}) };
  const counter = /^counter that spell or ability\.?$/.exec(m[5]!) && m[2];
  if (m[1] === "~") {
    // Bonecrusher Giant: "~ deals 2 damage to that spell's controller": the player who controls it, "that player".
    // Retromancer: "~ deals 3 damage to that spell or ability's controller" likewise.
    const text = m[5]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ ").replace(m[2] ? /\bthat spell or ability's controller\b/g : /\bthat spell's controller\b/g, "that player");
    // Frost Titan: "counter that spell or ability unless its controller pays {2}", as ward does (CR 702.21a).
    const selfTaxed = m[2] && /^counter that spell or ability unless its controller pays (\{\d+\})\.?$/.exec(m[5]!);
    if (selfTaxed) return { event: "selfBecomesTarget", targeted, body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: selfTaxed[1]! } }], text: `counter that spell or ability unless its controller pays ${selfTaxed[1]}.` } };
    // Reality Smasher: "Whenever ~ becomes the target of a spell an opponent controls, counter that spell unless its
    // controller discards a card": a card of their choice, as ward's discard is (CR 702.21a).
    if (!m[2] && m[3] === " an opponent controls" && !m[4] && /^counter that spell unless its controller discards a card\.?$/.test(m[5]!))
      return { event: "selfBecomesTarget", targeted, body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", discard: 1 } }], text: "counter that spell unless its controller discards a card." } };
    const body = counter ? { targets: [], effects: [{ type: "counterCause" as const }], text: "Counter that spell or ability." } : parseBody(text, { selfIt: true, ...(m[3] !== " you control" ? { eventPlayer: true } : {}) });
    return body ? { event: "selfBecomesTarget", targeted, body } : "fail";
  }
  // "A permanent you control", "another creature you control": the subject, which "that permanent" or "it" is.
  const other = /^another /.test(m[1]!);
  const what = m[1]!.replace(/^an? |^another /, "");
  const filter = parseTargetPhrase(what);
  if (!filter || filter.kind !== "object" || counter) return "fail";
  // Diffusion Sliver: "Whenever a Sliver creature you control becomes the target of a spell or ability an opponent
  // controls, counter that spell or ability unless its controller pays {2}": once for each of them it targets, as
  // with Unsettled Mariner.
  const taxed = m[2] && /^counter that spell or ability unless its controller pays (\{\d+\})\.?$/.exec(m[5]!);
  if (taxed) return { event: "permanentBecomesTarget", targeted: { ...targeted, ...(other ? { other } : {}) }, subjectFilter: { ...filter, text: what }, body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: taxed[1]! } }], text: `counter that spell or ability unless its controller pays ${taxed[1]}.` } };
  const body = parseBody(m[5]!.replace(/\bthat (?:permanent|creature)\b/g, "it"), { subjectIt: true, ...(m[3] !== " you control" ? { eventPlayer: true } : {}) });
  return body ? { event: "permanentBecomesTarget", targeted: { ...targeted, ...(other ? { other } : {}) }, subjectFilter: { ...filter, text: what }, body } : "fail";
}

function parseCastTrigger(line: string): TriggeredAbility | "fail" | null {
  // "Whenever you cast your second spell each turn", "Whenever an opponent casts their second spell each turn", "...
  // their first noncreature spell each turn" (Esper Sentinel): counting only the spells of that kind they cast this turn.
  // "Whenever a player casts their second spell during their turn" (The Council of Four): only in their own turn.
  // "Whenever you cast your first spell during each opponent's turn" (Wavebreak Hippocamp): the first you cast in that turn.
  // "Your third spell each turn" (Emeritus of Conflict, Captain Ripley Vance), "... in a turn" (Vance's Blasting Cannons):
  // counting the spells you've cast this turn, whether they resolved or not (rulings). "Your fourth noncreature spell each
  // turn" (The Fantasticar): the same, counting noncreature spells.
  // Nev, the Practical Dean: "your first spell with {X} in its mana cost each turn": the first of those (TargetSpec.xInCost),
  // and "X" in what it does is the X that spell was cast with (CR 107.3a).
  // Vengevine: "Whenever you cast a spell, if it's the second creature spell you cast this turn": only that one, counting
  // the whole turn's spells (rulings), which stays true once it is, so the same as "your second creature spell each turn".
  line = line.replace(/^Whenever you cast a spell, if it's the (first|second|third|fourth) ((?:creature|noncreature|instant or sorcery) )?spell you cast this turn, /, "Whenever you cast your $1 $2spell each turn, ");
  const nth = /^Whenever (you|an opponent|a player) casts? (?:your|their) (first|second|third|fourth) (?:(.+?) )?spell( with \{X\} in its mana cost)? (each turn|in a turn|during their turn|during each opponent's turn), (.+)$/.exec(line);
  if (nth) {
    const parsed = nth[3] ? parseTargetPhrase(`${nth[3]} spell`) : { kind: "spell" as const, text: "spell" };
    const kind = parsed && { ...parsed, ...(nth[4] ? { xInCost: true as const } : {}), text: `${nth[3] ? `${nth[3]} spell` : "spell"}${nth[4] ?? ""}` };
    if (kind?.kind !== "spell") return "fail";
    if ((nth[5] === "during their turn" && nth[1] === "you") || (nth[5] === "during each opponent's turn" && nth[1] !== "you")) return "fail";
    const spellX = !!nth[4] && /\bX\b/.test(nth[6]!) && !/\bwhere X is\b/.test(nth[6]!);
    // "That player" is the one who cast it, except when that's you: then it's the opponent whose turn it is (Blightwing
    // Bandit: "during each opponent's turn, look at the top card of that player's library"), or a player the text chose
    // (Vial Smasher the Fierce: "choose an opponent at random. ... that player").
    const youOpp = nth[1] === "you" && nth[5] === "during each opponent's turn";
    const body0 = parseBody(nth[6]!, { castSpell: true, ...(nth[1] !== "you" || youOpp ? { eventPlayer: true } : {}), ...(spellX ? { ownX: true } : {}) });
    const body1 = body0 && youOpp ? { ...(JSON.parse(JSON.stringify(body0).replaceAll('{"ref":"eventPlayer"}', '{"ref":"activePlayer"}')) as typeof body0), text: body0.text } : body0;
    const body = body1 && spellX ? { ...replaceX(body1, { count: { kind: "castSpellX" } }), text: body1.text } : body1;
    const nth4 = nth[5];
    return body ? { event: "castSpell", cast: { by: CAST_BY[nth[1] as keyof typeof CAST_BY], spell: kind, nth: ["first", "second", "third", "fourth"].indexOf(nth[2]!) + 1, ...(nth[3] || nth[4] ? { nthOfKind: true as const } : {}), ...(nth4 === "during their turn" ? { ownTurn: true as const } : {}), ...(nth4 === "during each opponent's turn" ? { opponentsTurn: true as const } : {}) }, body } : "fail";
  }
  // "Whenever you cast a spell other than your first spell each turn" (Arcbound Tracker): its second or later this turn,
  // counting spells cast before this was on the battlefield (rulings).
  // "Whenever you cast a spell during your turn other than your first spell that turn" (Geralf): only in your own turn.
  const notFirst = /^Whenever you cast a spell (during your turn )?other than your first spell (?:each|that) turn, (.+)$/.exec(line);
  if (notFirst) {
    const body = parseBody(notFirst[2]!, { castSpell: true, eventPlayer: true });
    return body ? { event: "castSpell", cast: { by: "you", spell: { kind: "spell", text: "spell" }, notFirst: true, ...(notFirst[1] ? { ownTurn: true as const } : {}) }, body } : "fail";
  }
  // Curse of Shaken Faith: "Whenever enchanted player casts a spell other than the first spell they cast each turn"
  // (as compile.ts splits it from "or copies a spell"); Ichneumon Druid: "Whenever an opponent casts an instant spell
  // other than the first instant spell that player casts each turn": their second or later one of the kind this turn.
  const notFirstOf = /^Whenever (enchanted player|an opponent|a player) casts an? (instant |sorcery |creature |noncreature )?spell other than the first (instant |sorcery |creature |noncreature )?spell (?:they cast|that player casts) each turn, (.+)$/.exec(line);
  if (notFirstOf && notFirstOf[2] === notFirstOf[3]) {
    const kind = notFirstOf[2] ? parseTargetPhrase(`${notFirstOf[2]}spell`) : { kind: "spell" as const, text: "spell" };
    const body = kind?.kind === "spell" ? parseBody(theyAreThatPlayer(notFirstOf[4]!), { castSpell: true, eventPlayer: true }) : null;
    return body ? { event: "castSpell", cast: { by: CAST_BY[notFirstOf[1] as keyof typeof CAST_BY], spell: { ...kind!, text: `${notFirstOf[2] ?? ""}spell` }, notFirst: true, ...(notFirstOf[2] ? { nthOfKind: true as const } : {}) }, body } : "fail";
  }
  // Alania, Divergent Storm: "Whenever you cast a spell, if it's the first instant spell, the first sorcery spell, or the
  // first Otter spell other than ~ you've cast this turn, ...": one trigger if it's the first of any of those kinds (an
  // intervening if, CR 603.4, true at resolution too); "other than ~" leaves out spells with its name.
  const firstOf = /^Whenever you cast a spell, if it's (the first .+?) you've cast this turn, (.+)$/.exec(line);
  if (firstOf) {
    const kinds: { spec: TargetSpec; notSelfName?: true }[] = [];
    for (const part of firstOf[1]!.split(/,? or |, /)) {
      const k = /^the first (.+?) spell( other than ~)?$/.exec(part);
      const spec = k ? parseTargetPhrase(`${k[1]} spell`) : null;
      if (!k || spec?.kind !== "spell") return "fail";
      kinds.push({ spec: { ...spec, text: `${k[1]} spell` }, ...(k[2] ? { notSelfName: true as const } : {}) });
    }
    const body = parseBody(firstOf[2]!, { castSpell: true, eventPlayer: true });
    return body ? { event: "castSpell", cast: { by: "you", spell: { kind: "spell", text: "spell" }, firstOfKinds: kinds }, body } : "fail";
  }
  // Kalamax, the Stormsire: "Whenever you copy an instant spell": a copy of a spell put on the stack (CR 707.10), as
  // magecraft's "cast or copy" without the cast; copying a card isn't copying a spell (rulings).
  // Curse of Shaken Faith: "Whenever enchanted player copies a spell" (as compile.ts splits it) the same way.
  const copies = /^Whenever (you copy|enchanted player copies) (an? (?:.+? )?spell), (.+)$/.exec(line);
  if (copies) {
    const t = parseCastTrigger(`Whenever ${copies[1] === "you copy" ? "you cast or copy" : "enchanted player casts or copies"} ${copies[2]}, ${copies[3]}`);
    return t && t !== "fail" && t.event === "castSpell" && t.cast?.orCopy && !t.ifCond ? { ...t, cast: { ...t.cast, onlyCopy: true } } : "fail";
  }
  // "A creature spell with mana value 4, 5, or 6" (Kozilek's Unsealing): without the commas, as one phrase.
  // "With power 4, 5, or 6" (Sarkhan's Unsealing) the same way as Kozilek's Unsealing's mana values.
  // Hallar, the Firefletcher: "Whenever you cast a spell, if that spell was kicked, ...": how it was cast can't change
  // (CR 603.4), the same as "Whenever you cast a kicked spell".
  line = line.replace(/^Whenever you cast a spell, if that spell was kicked, /, "Whenever you cast a kicked spell, ");
  // Saproling Infestation: "Whenever a player kicks a spell": casts it with its kicker cost paid (CR 702.33d; once however
  // many times a multikicker was paid).
  line = line.replace(/^Whenever a player kicks a spell, /, "Whenever a player casts a kicked spell, ");
  const m = CAST_TRIGGER.exec(line.replace(/ with (mana value|power) (\d+), (\d+), or (\d+),/, (all, key: string, a: string, b: string, c: string) => (Number(b) === Number(a) + 1 && Number(c) === Number(b) + 1 ? ` with ${key} ${a} through ${c},` : all)));
  if (!m) return null;
  let what = m[3]!.replace(/^(?:an?|another) /, "");
  // "Whenever you cast an instant or sorcery spell during your turn" (Ral, Monsoon Mage): only while you're the active player.
  const duringYours = m[1] === "you" && / during your turn$/.test(what);
  if (duringYours) what = what.replace(/ during your turn$/, "");
  // "Whenever you cast an instant spell during your main phase" (Dovin's Acuity): your turn's precombat or postcombat main
  // phase (CR 505.1).
  const duringMain = m[1] === "you" && / during your main phase$/.test(what);
  if (duringMain) what = what.replace(/ during your main phase$/, "");
  // "Whenever an opponent casts a spell during your turn" (Voice of Resurgence): only while this ability's controller is
  // the active player.
  const duringMine = m[1] === "an opponent" && / during your turn$/.test(what);
  if (duringMine) what = what.replace(/ during your turn$/, "");
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
  // Dragonlord Kolaghan: "a creature or planeswalker spell with the same name as a card in their graveyard": the caster's
  // graveyard as the spell becomes cast (rulings); a face-down spell has no name (CR 708.2).
  const nameInYard = m[1] === "an opponent" ? / with the same name as a card in their graveyard$/.exec(what) : null;
  if (nameInYard) what = what.slice(0, nameInYard.index);
  // Circle of Confinement: "a Vampire spell with the same name as a card exiled with ~": the cards its exile ability exiled
  // that are still exiled (CR 607.2a), as the spell becomes cast; a face-down spell has no name (CR 708.2).
  const nameExiled = / with the same name as a card exiled with ~$/.exec(what);
  if (nameExiled) what = what.slice(0, nameExiled.index);
  // Folk Hero's "Whenever you cast a spell that shares a creature type with this creature": one creature type in common,
  // a changeling having every one (CR 702.73a).
  const shares = / that shares a creature type with ~$/.exec(what);
  if (shares) what = what.slice(0, shares.index);
  // Volo, Guide to Monsters: "a creature spell that doesn't share a creature type with a creature you control or a creature
  // card in your graveyard", as it's cast.
  const sharesNone = / that doesn't share a creature type with a creature you control or a creature card in your graveyard$/.exec(what);
  if (sharesNone) what = what.slice(0, sharesNone.index);
  // "Whenever you cast a spell that targets a creature you control" (Season of Growth), "an instant or sorcery spell that
  // targets a creature" (repartee), "... that targets an opponent or a creature an opponent controls" (Danitha): what
  // one of its targets is as it's cast. "That targets only ..." isn't modeled.
  // "A spell that targets only a single artifact or creature you control" (Vesuvan Duplimancy): every target it has is
  // that one permanent (rulings), which "that artifact or creature" is.
  // Reflective Golem: "an instant or sorcery spell that targets only ~": every target it has is this permanent (rulings
  // on Zada: several targets all naming it count).
  const onlySelf = / that targets only ~$/.exec(what);
  if (onlySelf) what = what.slice(0, onlySelf.index);
  const onlyM = / that targets only a single (.+)$/.exec(what);
  let targetsOnly: TargetSpec | "self" | undefined = onlySelf ? "self" : undefined;
  if (onlyM) {
    what = what.slice(0, onlyM.index);
    const spec = parseTargetPhrase(onlyM[1]!);
    if (spec?.kind !== "object") return "fail";
    targetsOnly = { ...spec, text: onlyM[1]! };
  }
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
  // "With power 4, 5, or 6" (Sarkhan's Unsealing): "4 through 6" by now.
  const pw = / with (power|toughness) (\d+) (?:or (greater|less)|through (\d+))$/.exec(what);
  if (pw) what = what.slice(0, pw.index);
  // "A spell that has convoke" (Joyful Stormsculptor), "a creature spell with flying", "with infect": the spell as it
  // was cast; convoke from another permanent's "spells you cast have convoke" too (game.ts hasConvoke).
  // "A spell with cascade" (Aurora Phoenix): printed or given to it as it's cast (effects/triggers.ts hasCascade).
  const kwM = !pw ? / (?:with|that has) (convoke|flying|infect|cascade|mutate)$/.exec(what) : null;
  if (kwM) what = what.slice(0, kwM.index);
  // Garenbrig Squire: "a creature spell that has an Adventure": an adventurer card cast as the creature (CR 715.2, 715.3).
  const advM = !pw && !kwM ? / that has an Adventure$/.exec(what) : null;
  if (advM) what = what.slice(0, advM.index);
  // "A spell with {X} in its mana cost", "a permanent spell with a mana cost that contains {X}" (Unbound Flourishing): the
  // mana symbol {X} in the mana cost of the spell (the half cast, for a split card), not another X.
  const xM = !pw && !kwM ? / with (?:\{X\} in its mana cost|a mana cost that contains \{X\})$/.exec(what) : null;
  if (xM) what = what.slice(0, xM.index);
  // Namor the Sub-Mariner: "a noncreature spell with one or more blue mana symbols in its mana cost" (hybrid and Phyrexian
  // symbols are of their colors, CR 107.4e-f); "create that many" is that number of them.
  const symM = !pw && !kwM && !xM ? / with one or more (white|blue|black|red|green) mana symbols in its mana cost$/.exec(what) : null;
  if (symM) what = what.slice(0, symM.index);
  // Rage Extractor: "a spell with {H} in its mana cost" (Scryfall's {H} is the Phyrexian mana symbol): any Phyrexian mana
  // symbol of any color, hybrid ones too, however it was paid (CR 107.4f, rulings).
  const phyM = !pw && !kwM && !xM && !symM ? / with \{[HP]\} in its mana cost$/.exec(what) : null;
  if (phyM) what = what.slice(0, phyM.index);
  // Voracious Bibliophile: "a spell with one or more targets, draw that many cards": as many as it was cast with.
  const tgtsM = !pw && !kwM && !xM && !symM && !tg ? / with one or more targets$/.exec(what) : null;
  if (tgtsM) what = what.slice(0, tgtsM.index);
  const symColor = symM ? (({ white: "W", blue: "U", black: "B", red: "R", green: "G" }) as const)[symM[1] as "white"] : undefined;
  // Lullmage's Familiar: "Whenever you cast a kicked spell": its kicker cost was paid as it was cast (CR 702.33d).
  const kickedM = /^kicked(?: spell)?$/.exec(what);
  if (kickedM) what = "spell";
  // Virtual Assistant: "Whenever you cast a spell using teamwork": its teamwork cost was paid as it was cast (CR 702.194b).
  const teamworkM = !kickedM ? / using teamwork$/.exec(what) : null;
  if (teamworkM) what = what.slice(0, teamworkM.index);
  // "a spell of the chosen color", "a creature spell of the chosen type": the choice made as this permanent entered.
  // "A noncreature spell with mana value less than ~'s power" (Pollywog Prodigy): worked out as it's cast (TargetSpec.bound).
  // Chalice of the Void: "a spell with mana value equal to the number of charge counters on ~", as it's cast (rulings).
  // Runescale Stormbrood: "a noncreature spell or a Dragon spell" is "a noncreature or Dragon spell".
  what = what.replace(/^(non[a-z]+|[A-Z][a-z]+) spell or an? ([A-Z][a-z]+|non[a-z]+)$/, "$1 or $2");
  const parsed0 = /^spell$/.test(what) ? { kind: "spell" as const, text: "spell" } : parseTargetPhrase(/\bspell\b/.test(what) ? what : `${what} spell`, { chosen: true, count: (t) => (t === "~'s power" || t === "the number of experience counters you have" || /^the number of [a-z]+ counters on ~$/.test(t) ? parseCount(t, null) : null) });
  // Firespitter Whelp: "a noncreature or Dragon spell": either kind (TargetSpec.anyOf).
  // Mindsparker: "a white or blue instant or sorcery spell": one of those colors and one of those types.
  const hueKind = !parsed0 ? /^((?:white|blue|black|red|green) or (?:white|blue|black|red|green)) (instant or sorcery)(?: spell)?$/.exec(what) : null;
  const hue = hueKind ? parseTargetPhrase(`${hueKind[1]} spell`) : null;
  const kinds = hueKind ? parseTargetPhrase(`${hueKind[2]} spell`) : null;
  const parsedHue = hue?.kind === "spell" && kinds?.kind === "spell" && hue.colors?.length === 2 && !hue.types?.length ? { ...kinds, colors: hue.colors, text: `${hueKind![1]} ${hueKind![2]} spell` } : null;
  // Umara Mystic: "an instant, sorcery, or Wizard spell": any one of them.
  const orKind = !parsed0 ? /^(non[a-z]+|[A-Z][a-z]+) or ([A-Z][a-z]+|non[a-z]+)(?: spell)?$/.exec(what) ?? /^(instant), (sorcery), or ([A-Z][a-z]+)(?: spell)?$/.exec(what) : null;
  const sides = orKind ? orKind.slice(1).filter(Boolean).map((k) => parseTargetPhrase(`${k} spell`)) : [];
  const parsed = parsedHue ? parsedHue : orKind && sides.every((x) => x?.kind === "spell" && !x.anyOf) ? { kind: "spell" as const, types: [], notTypes: [], notColors: [], anyOf: sides as TargetSpec[], text: `${orKind.slice(1).filter(Boolean).join(sides.length > 2 ? ", " : " or ").replace(/, ([^,]+)$/, ", or $1")} spell` } : parsed0;
  if (!parsed || parsed.kind !== "spell" || (pw && !parsed.types?.includes("Creature"))) return "fail";
  const range = pw && (pw[4] ? { min: Number(pw[2]), max: Number(pw[4]) } : pw[3] === "greater" ? { min: Number(pw[2]) } : { max: Number(pw[2]) });
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
  // Tokka & Rahzar: "Whenever a player casts a spell, if ..., ~ deals 3 damage to that player": the same, with nothing
  // about the difference.
  if (short && /\bthe difference\b/.test(text)) return "fail";
  const thatMuch = /\bIf [^.,]+ mana was spent to cast that spell, [^.]*\bthat much\b/.test(text) && !/\bX\b/.test(text) && !m[2];
  if (thatMuch) text = text.replace(/\bthat much\b/g, "X");
  const symMany = !!symColor && /\bthat many\b/.test(text) && !/\bX\b/.test(text);
  if (symMany) text = text.replace(/\bthat many\b/g, "X");
  const tgtsMany = !!tgtsM && /\bthat many\b/.test(text) && !/\bX\b/.test(text);
  if (tgtsMany) text = text.replace(/\bthat many\b/g, "X");
  // Leyline of Resonance ("copy that spell"): the condition alone, nothing in the effect naming that permanent.
  const subjectRef = targetsOnly && onlyM && text.includes(`that ${onlyM[1]!.replace(/ (?:you|an opponent) controls?$/, "")}`);
  if (subjectRef) {
    // Read as the subject, whatever it is now (rulings: as it last existed, if it left).
    text = text.replaceAll(`that ${onlyM![1]!.replace(/ (?:you|an opponent) controls?$/, "")}`, "that creature");
  }
  // "Whenever you cast a spell with {X} in its mana cost, put X +1/+1 counters on ~" (Nev, the Practical Dean, Zaxara):
  // the X that spell was cast with (CR 107.3a), not one of this ability's own.
  const spellX = !!xM && !thatMuch && !short && /\bX\b/.test(text) && !/\bwhere X is\b/.test(text);
  let body = parseBody(text, { castSpell: true, eventPlayer: true, ...(subjectRef ? { subject: true } : {}), ...(spellX ? { ownX: true } : {}) });
  if (!body) return "fail";
  if (spellX) body = { ...replaceX(body, { count: { kind: "castSpellX" } }), text: body.text };
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: body.text.replace(/\bX\b/g, "that much") };
  if (symMany) body = { ...replaceX(body, { count: { kind: "castSpellManaSymbols", color: symColor! } }), text: body.text.replace(/\bX\b/g, "that many") };
  if (tgtsMany) body = { ...replaceX(body, { count: { kind: "castSpellTargets" } }), text: body.text.replace(/\bX\b/g, "that many") };
  if (short) body = { ...replaceX(body, { count: { kind: "castShortfall" } }), text: body.text.replace(/\bloses X life\b/, "loses life equal to the difference") };
  return { event: "castSpell", cast: { by: CAST_BY[m[1] as keyof typeof CAST_BY], spell: { ...spell, text: /\bspell\b/.test(what) ? what : `${what} spell` }, ...(m[2] ? { orCopy: true } : {}), ...(treasure ? { treasure: true as const } : {}), ...(spent ? { spent } : {}), ...(short ? { spentLessThanMv: true as const } : {}), ...(targets ? { targets } : {}), ...(targetsOnly ? { targetsOnly, ...(subjectRef ? { subjectTarget: true as const } : {}) } : {}), ...(from ? { from } : {}), ...(shares ? { sharesTypeWithSelf: true as const } : {}), ...(sharesNone ? { sharesNoTypeWithYours: true as const } : {}), ...(notOwned ? { notOwned: true as const } : {}), ...(nameInYard ? { nameInCasterYard: true as const } : {}), ...(nameExiled ? { nameExiledWithSelf: true as const } : {}), ...(kwM ? { keyword: capital(kwM[1]!) } : {}), ...(xM ? { xInCost: true as const } : {}), ...(symColor ? { manaSymbol: symColor } : {}), ...(phyM ? { phyrexianInCost: true as const } : {}), ...(tgtsM ? { hasTargets: true as const } : {}), ...(duringYours ? { ownTurn: true as const } : {}), ...(duringMain ? { ownTurn: true as const, mainPhase: true as const } : {}), ...(duringMine ? { yourTurn: true as const } : {}), ...(kickedM ? { kicked: true as const } : {}), ...(teamworkM ? { teamwork: true as const } : {}), ...(advM ? { adventure: true as const } : {}), ...(whileAttacking ? { selfAttacking: true as const } : {}) }, body };
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
  // Termination Facilitator: "Whenever a creature or planeswalker an opponent controls with a bounty counter on it is dealt
  // damage, destroy it": one with that counter as it's dealt the damage.
  // Sonic the Hedgehog: "a creature you control with flash or haste": either keyword, as it's dealt the damage.
  const m = /^Whenever an? (.+?) (?:(you control(?: with [a-z]+ or [a-z]+)?|an opponent controls(?: with an? [a-z]+ counter on it)?) )?is dealt damage, (.+)$/.exec(line);
  if (!m) return null;
  const whose = m[2];
  if (!whose && m[1] !== "creature") return null;
  const filter = parseTargetPhrase(whose ? `${m[1]!} ${whose}` : m[1]!);
  if (whose && / counter on it$/.test(whose) && (filter?.kind !== "object" || !filter.counter)) return "fail";
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
  // Cat Collector: "Whenever you gain life for the first time during each of your turns, ...".
  const gain = /^Whenever you gain life for the first time during each of your turns, (.+)$/.exec(line);
  if (gain) {
    const body = parseBody(gain[1]!, {});
    return body ? { event: "youGainLife", firstOnTheirTurn: true, body } : "fail";
  }
  // Vengeful Warchief: "Whenever you lose life for the first time each turn, ...": your first life loss this turn,
  // whoever's turn it is (counting losses before it was on the battlefield).
  // Erdwal Illuminator: "Whenever you investigate for the first time each turn, ...", counting investigations before it
  // was on the battlefield.
  // Whispering Snitch: "Whenever you surveil for the first time each turn, ...", the same.
  const firstSurveil = /^Whenever you surveil for the first time each turn, (.+)$/.exec(line);
  if (firstSurveil) {
    const body = parseBody(firstSurveil[1]!);
    return body ? { event: "youSurveil", firstEachTurn: true, body } : "fail";
  }
  const firstInvestigate = /^Whenever you investigate for the first time each turn, (.+)$/.exec(line);
  if (firstInvestigate) {
    const body = parseBody(firstInvestigate[1]!);
    return body ? { event: "youInvestigate", firstEachTurn: true, body } : "fail";
  }
  const first = /^Whenever you (gain|lose) life for the first time each turn, (.+)$/.exec(line);
  if (first) {
    const body = parseBody(first[2]!, {});
    return body ? { event: first[1] === "gain" ? "youGainLife" : "youLoseLife", firstEachTurn: true, body } : "fail";
  }
  // Moonstone Harbinger: "Whenever you gain or lose life during your turn, ...": either event, on your turn only.
  const either = /^Whenever you gain or lose life during your turn, (.+)$/.exec(line);
  if (either) {
    if (/\b(?:that much|that many|X)\b/.test(either[1]!)) return "fail";
    const body = parseBody(either[1]!, {});
    return body ? { event: "youGainLife", orLoseLife: true, body } : "fail";
  }
  // Vampire Scrivener: "Whenever you gain life during your turn, ...", "Whenever you lose life during your turn, ...": only
  // while you're the active player.
  const yourTurn = /^Whenever you (gain|lose) life during your turn, (.+)$/.exec(line);
  if (yourTurn) {
    if (/\b(?:that much|that many|X)\b/.test(yourTurn[2]!)) return "fail";
    const body = parseBody(yourTurn[2]!, {});
    return body ? { event: yourTurn[1] === "gain" ? "youGainLife" : "youLoseLife", onYourTurn: true, body } : "fail";
  }
  const m = /^Whenever an opponent loses life for the first time during each of their turns, (.+)$/.exec(line);
  if (!m) return null;
  const body = parseBody(m[1]!, { eventPlayer: true });
  return body ? { event: "opponentLosesLife", firstOnTheirTurn: true, body } : "fail";
}

// Campsite Cuisine: "Whenever ~ or a legendary creature you control enters": the same as "~ or another" (once, if ~ is one).
const ENTERS_TRIGGER = /^When(?:ever)? (~ or another|~ or an?|another|an?) (.+?) enters(?: the battlefield)?( under your control| under an opponent's control)?, (.+)$/;

function parseEntersTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = ENTERS_TRIGGER.exec(line);
  if (!m) return null;
  let phrase = m[2]!;
  // "A nonland permanent an opponent owns enters under your control" (Brainstealer Dragon): owned by another player, under
  // your control (CR 108.3).
  const owned = m[3] === " under your control" && / (?:an opponent|you don't) owns?$/.test(phrase);
  if (m[3] && !owned) phrase += m[3] === " under your control" ? " you control" : " an opponent controls";
  // Gladewalker Ritualist: "Whenever another creature you control named ~ enters": with the watcher's name (CR 201.5).
  const namedSelf = / named ~$/.test(phrase);
  const ench = ENCHANTED_CONTROLS.test(phrase);
  const parsed0 = ench ? enchantedControls(phrase) : parseTargetPhrase(namedSelf ? phrase.replace(/ named ~$/, "") : phrase, { chosen: true });
  const parsed = namedSelf ? (parsed0?.kind === "object" && parsed0.named === undefined ? { ...parsed0, named: "~" } : null) : parsed0;
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
  // Alex Wilder, Runaway: "if you cast it from anywhere other than your hand": the same, and not from its owner's hand.
  const ifCast = /^if you cast it( from anywhere other than your hand)?, /.exec(bodyText);
  if (ifCast && filter.controller !== "you") return "fail";
  if (ifCast) bodyText = bodyText.slice(ifCast[0].length);
  // Clement, the Worrywort: "return up to one target creature you control with lesser mana value": less than the entering
  // permanent's, as the target is chosen (TargetSpec.bound, settled in triggerBody).
  // Boxing Ring: "it fights up to one target creature you don't control with the same mana value": equal to it, the same way.
  const lesser = / with lesser mana value\b/.test(bodyText);
  const same = !lesser && /^it fights up to one target creature you don't control with the same mana value\.$/.test(bodyText);
  if (lesser) bodyText = bodyText.replace(/ with lesser mana value\b/, "");
  if (same) bodyText = bodyText.replace(/ with the same mana value\b/, "");
  let body = parseBody(bodyText, { subjectIt: true });
  if (!body) return "fail";
  if (lesser || same) {
    const [t, ...more] = body.targets;
    if (!t || more.length || t.kind !== "object" || t.bound || t.manaValue) return "fail";
    body = { ...body, targets: [{ ...t, bound: lesser ? { key: "manaValue", at: "most", amount: { count: { kind: "manaValue", of: { ref: "subject" } }, plus: -1 } } : { key: "manaValue", at: "exact", amount: { count: { kind: "manaValue", of: { ref: "subject" } } } }, text: `${t.text} with ${lesser ? "lesser" : "the same"} mana value` }] };
  }
  const kind = m[1]!.toLowerCase();
  return {
    event: "permanentEnters",
    enters: { filter: { ...filter, text: phrase }, ...(kind === "another" ? { other: true } : {}), ...(kind.startsWith("~ or ") ? { orSelf: true } : {}), ...(ifCast ? { ifCast: true as const } : {}), ...(ifCast?.[1] ? { notFromHand: true as const } : {}) },
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
const DIES_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) (dies or is put into exile|dies or is put into the command zone|dies|is put into a graveyard from the battlefield|leaves the battlefield(?: without dying)?|is (?:exiled|put into exile) from the battlefield|is returned to its owner's hand), (.+)$/;

/**
 * "Whenever another creature dies", "Whenever a creature you control dies", "Whenever ~ or another Zombie
 * you control dies", "Whenever a creature dealt damage by ~ this turn dies", "Whenever equipped creature
 * dies": "it" and "that card" are the card in the graveyard, "its power" as it last existed (CR 603.10a).
 */
function parseDiesTrigger(line: string): TriggeredAbility | "fail" | null {
  // Mazzy, Truesword Paladin: "Whenever an Aura you control is put into your graveyard from the battlefield": one you both
  // controlled and own (cards go to their owners' graveyards, CR 404.2), dying (CR 700.4).
  const yoursCtl = /^(Whenever an? [A-Z][a-z]+) you control is put into your graveyard from the battlefield, (.+)$/.exec(line);
  if (yoursCtl) {
    const t = parseDiesTrigger(`${yoursCtl[1]} you own dies, ${yoursCtl[2]}`);
    if (!t || t === "fail" || t.event !== "permanentDies" || t.dies?.filter?.kind !== "object" || t.dies.filter.owner !== "you" || t.dies.filter.controller) return "fail";
    return { ...t, dies: { ...t.dies, filter: { ...t.dies.filter, controller: "you", text: t.dies.filter.text.replace(/ you own$/, " you own and control") } } };
  }
  // Iron Apprentice: "When ~ dies, if it had counters on it, put those counters on target creature you control.": an
  // intervening if on ~ as it last existed (CR 603.4, 603.10a), the same as "~ or another creature" about ~ alone.
  // Deathknell Berserker: "When ~ dies, if its power was 3 or greater, ...": the same, its power as it last existed.
  // Gunner Conscript: "When ~ dies, if it was enchanted, ..." likewise, what was attached to it as it last existed.
  // Syr Vondam, Sunstar Exemplar: "When ~ dies or is put into exile while its power is 4 or greater, ...": the same, to
  // either zone, its power as it last existed on the battlefield (CR 603.10a).
  const whilePower = /^When ~ dies or is put into exile while its power is (\d+) or greater, (.+)$/.exec(line);
  const selfHad = whilePower ? ["", `if its power was ${whilePower[1]} or greater, ${whilePower[2]}`] : /^When(?:ever)? ~ dies, (if it had (?:counters|one or more counters|a counter) on it, .+|if its power was \d+ or greater, .+|if it was (?:enchanted or equipped|enchanted|equipped), .+)$/.exec(line);
  // Princess Yue: "When ~ dies, if ~ was a nonland creature, return ~ to the battlefield tapped under your control. She's a
  // land named Moon. ~ gains "{T}: Add {C}."": an intervening if on ~ as it last existed (CR 603.4, 603.10a); it returns as
  // a land only, still legendary (CR 205.1b, rulings), with its other abilities, named Moon (CR 201.4).
  const yue = /^When ~ dies, if ~ was a nonland creature, return ~ to the battlefield tapped under your control\. (?:She|He|It)'s a land named ([A-Z][a-z]+)\. ~ gains "(\{T\}: Add \{C\}\.)"$/.exec(line);
  if (yue) {
    const t = parseDiesTrigger("When ~ or another nonland creature dies, draw a card.");
    if (!t || t === "fail" || !t.dies?.orSelf) return "fail";
    const { orSelf: _, ...dies } = t.dies;
    return {
      ...t,
      dies: { ...dies, self: true },
      body: {
        targets: [],
        effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, tapped: true, becomes: { types: ["Land"], subtypes: [], name: yue[1]!, ability: yue[2]! } }],
        text: `If ~ was a nonland creature, return ~ to the battlefield tapped under your control. It's a land named ${yue[1]}. ~ gains "${yue[2]}"`,
      },
    };
  }
  // Infernal Vessel: "When ~ dies, if it wasn't a Demon, ...": the same, its creature types as it last existed.
  const selfWasnt = /^When ~ dies, if it wasn't an? ([A-Z][a-z]+), (.+)$/.exec(line);
  if (selfWasnt && CREATURE_TYPES.has(selfWasnt[1]!)) {
    const t = parseDiesTrigger(`When ~ or another non-${selfWasnt[1]} creature dies, ${selfWasnt[2]}`);
    if (!t || t === "fail" || !t.dies?.orSelf || !t.dies.filter.notSubtypes?.includes(selfWasnt[1]!)) return "fail";
    const { orSelf: _, ...dies } = t.dies;
    return { ...t, dies: { ...dies, self: true } };
  }
  // One with the Kami: "Whenever enchanted creature or another modified creature you control dies, ...": the creature the
  // Aura was attached to as it died, whoever controlled it, or a modified creature you controlled (CR 700.9, 603.10a); one
  // trigger either way.
  const orModified = /^Whenever enchanted creature or another modified creature you control dies, (.+)$/.exec(line);
  if (orModified) {
    const t = parseDiesTrigger(`Whenever a modified creature you control dies, ${orModified[1]}`);
    if (!t || t === "fail" || !t.dies || t.dies.other || t.dies.orSelf || t.dies.attached) return "fail";
    return { ...t, dies: { ...t.dies, orAttached: true } };
  }
  if (selfHad) {
    // Ambitious Augmenter: "put ~'s counters on that token" is "its counters", ~ being the one that died.
    const t = parseDiesTrigger(`When ~ or another creature ${whilePower ? "dies or is put into exile" : "dies"}, ${selfHad[1]!.replace(/\bput ~'s counters on that token\.$/, "put its counters on that token.")}`);
    if (!t || t === "fail" || !t.dies?.orSelf) return "fail";
    const { orSelf: _, ...dies } = t.dies;
    return { ...t, dies: { ...dies, self: true } };
  }
  // Captain Marvel, Shooting Star: "Whenever a creature other than ~ is exiled from the battlefield": another creature.
  line = line.replace(/^(When(?:ever)?) an? (creature|permanent|artifact) other than ~ (dies|is exiled from the battlefield|is put into exile from the battlefield|leaves the battlefield), /, "$1 another $2 $3, ");
  // Psychomancer, Shard of the Void Dragon: "is put into a graveyard from the battlefield or is put into exile from the
  // battlefield" is dying or being put into exile from it (CR 700.4).
  line = line.replace(/^(When(?:ever)? (?:~ or another|another|an?) .+?) is put into a graveyard from the battlefield or is put into exile from the battlefield, /, "$1 dies or is put into exile, ");
  // Kaya's Ghostform: "When enchanted permanent dies or is put into exile, ..." (from the battlefield, CR 603.6c).
  // Curator's Ward: "When enchanted permanent leaves the battlefield, if it was historic, ...": to any zone (CR 603.6c),
  // historic as it last existed (CR 603.10a, 700.6).
  // The Zendikons: "When enchanted land dies"; Tezzeret's Touch: "When enchanted artifact is put into a graveyard": from
  // the battlefield, the same as dying (CR 700.4), whatever it is then.
  const attachedM = /^When(?:ever)? (equipped|enchanted) (creature|permanent|land|artifact) (dies|is put into a graveyard|dies or is put into exile|leaves the battlefield), (.+)$/.exec(line);
  if (attachedM?.[3] === "is put into a graveyard") attachedM[3] = "dies";
  if (attachedM && (attachedM[2] === "land" || attachedM[2] === "artifact") && (attachedM[1] !== "enchanted" || attachedM[3] !== "dies")) return "fail";
  const attached = attachedM && [attachedM[0], attachedM[1]!, attachedM[4]!];
  // Scrap Trawler: "Whenever ~ dies or another artifact you control is put into a graveyard from the battlefield": ~ is an
  // artifact, and dying is being put into a graveyard from the battlefield (CR 700.4), so the same as "~ or another".
  const orDies = /^Whenever ~ dies or another (.+?) is put into a graveyard from the battlefield, (.+)$/.exec(line);
  if (orDies && !/\bartifact\b/.test(orDies[1]!)) return "fail";
  if (orDies) line = `Whenever ~ or another ${orDies[1]} dies, ${orDies[2]}`;
  // "Whenever an artifact is put into your graveyard from the battlefield" (Daretti's emblem): one you own dies, as
  // cards go to their owners' graveyards (CR 404.2, 700.4).
  const yours = /^(When(?:ever)? (?:~ or another|another|an?) .+?) is put into your graveyard from the battlefield, /.exec(line);
  // Shirei, Shizo's Caretaker: "a creature with power 1 or less is put into your graveyard ...": one you own with that power.
  const yoursWith = yours && /^(When(?:ever)? (?:~ or another|another|an?) [a-z]+)( with .+)$/.exec(yours[1]!);
  if (yours && !/ you (?:own|control)\b/.test(yours[1]!)) line = `${yoursWith ? `${yoursWith[1]} you own${yoursWith[2]}` : yours[1]} you own dies, ${line.slice(yours[0].length)}`.replace(/( with .+) you own dies, /, "$1 dies, ");
  // "Whenever an artifact is put into an opponent's graveyard from the battlefield" (Viridian Revel): one an opponent owns
  // dies, whoever controlled it (CR 404.2, 700.4).
  // Patron of the Nezumi: "Whenever a permanent is put into an opponent's graveyard, that player loses 1 life": a permanent
  // is only ever on the battlefield (CR 110.1), and "that player" is that graveyard's owner, the card's (CR 404.2).
  const theirs = /^(When(?:ever)? (?:another|an?) [a-z]+) is put into an opponent's graveyard from the battlefield, /.exec(line) ?? /^(When(?:ever)? (?:another|an?) permanent) is put into an opponent's graveyard, /.exec(line);
  if (theirs) line = `${theirs[1]} an opponent owns dies, ${line.slice(theirs[0].length).replace(/^that player\b/, "its owner")}`;
  // "Whenever a permanent you control is put into a graveyard" (Aetherworks Marvel): a permanent is only ever on the
  // battlefield (CR 110.1), so from there (rulings).
  line = line.replace(/^(When(?:ever)? (?:~ or another|another|an?) (?:\w+ )*permanents?(?: you control)?) is put into a graveyard, /, "$1 is put into a graveyard from the battlefield, ");
  // Last Laugh: "Whenever a permanent other than ~ is put into a graveyard from the battlefield" is "another permanent".
  // Yomiji, Who Bars the Way: "Whenever a legendary permanent other than ~ ..." likewise "another legendary permanent".
  line = line.replace(/^Whenever an? ((?:legendary |nontoken )?)permanent other than ~ is put into a graveyard from the battlefield, /, "Whenever another $1permanent is put into a graveyard from the battlefield, ");
  // Stormfront Riders: "Whenever ~ or another creature is returned to your hand from the battlefield": one you own goes to
  // its owner's hand (CR 404.2), a token too before it ceases to exist (rulings). Justice, Vance Astrovik: "Whenever another
  // nonland permanent you control is returned to its owner's hand": from the battlefield, the only place a permanent is.
  line = line.replace(/^(When(?:ever)? (?:~ or another|another|an?) [a-z]+) is returned to your hand from the battlefield, /, "$1 you own is returned to its owner's hand, ");
  // Azorius Aethermage: "Whenever a permanent is returned to your hand", any permanent you own, a token too, whoever
  // controlled it (rulings); a permanent is only ever on the battlefield (CR 110.1) and goes to its owner's hand (CR
  // 404.2). Warped Devotion: "Whenever a permanent is returned to a player's hand, that player discards a card": its owner.
  line = line.replace(/^Whenever a permanent is returned to your hand, /, "Whenever a permanent you own is returned to its owner's hand, ");
  line = line.replace(/^Whenever a permanent is returned to a player's hand, that player /, "Whenever a permanent is returned to its owner's hand, its owner ");
  const m = attached ? null : DIES_TRIGGER.exec(line);
  if (!attached && !m) return null;
  const ench = !attached && ENCHANTED_CONTROLS.test(m![2]!);
  // "That player" in a trigger about what enchanted player controls is that player.
  let bodyText = (attached ? attached[2]! : m![4]!).replace(ench ? /\bthat player\b/g : /$^/, "enchanted player");
  // "That land's controller", and "that player" after "an artifact an opponent controls": who controlled it as it last
  // existed (CR 603.10a).
  if (!attached) {
    // "Whenever another creature you own dies, return it to your hand" (Athreos): your card, so its owner's hand. Sigil of
    // the New Dawn: "you may pay {1}{W}. If you do, return that card to your hand", the same.
    if (/ you own$/.test(m![2]!)) bodyText = bodyText.replace(/^return it to your hand\b/, "return it to its owner's hand").replace(/^(you may pay [^.]+\. If you do, )return that card to your hand\.$/, "$1return that card to its owner's hand.");
    bodyText = bodyText.replace(/\bthat (?:land|artifact|creature|permanent|enchantment)'s controller\b/g, "its controller");
    if (/ an opponent controls$/.test(m![2]!)) bodyText = bodyText.replace(/\bthat player\b/g, "its controller");
  }
  // "Whenever another Zombie you control dies, if it didn't have decayed, ..." (Wilhelt): an intervening if (CR 603.4) on
  // the creature as it last existed (CR 603.10a), which can't change, so part of what dies.
  const exiled = !attached && /^is (?:exiled|put into exile) /.test(m![3]!);
  const toHand = !attached && m![3] === "is returned to its owner's hand";
  // "Whenever a creature with a coin counter on it dies or is put into exile" (Athreos, Shroud-Veiled): from the
  // battlefield to either one (CR 700.4, 603.6c).
  const diesOrExiled = !attached && m![3] === "dies or is put into exile";
  // Reyhan, Last of the Abzan: "Whenever a creature you control dies or is put into the command zone": from the
  // battlefield to a graveyard, or to the command zone instead of a hand or library (CR 903.9b). A commander that died and
  // then went from the graveyard to the command zone (CR 903.9a) wasn't on the battlefield then, so only its dying counts.
  const diesOrCommand = !attached && m![3] === "dies or is put into the command zone";
  const leaves = !attached && (m![3]!.startsWith("leaves") || exiled || diesOrExiled || diesOrCommand || toHand);
  // "Whenever another creature you control leaves the battlefield, if it didn't die, ..." (Taeko): where it went can't
  // change, so it's part of the event, like "without dying".
  const didntDie = leaves && /^if it didn't die, /.exec(bodyText);
  if (didntDie) bodyText = bodyText.slice(didntDie[0].length);
  const notDies = !!didntDie || (!attached && m![3]! === "leaves the battlefield without dying");
  // Urza's Miter: "Whenever an artifact you control is put into a graveyard from the battlefield, if it wasn't sacrificed":
  // how it went there can't change, so it's part of the event (CR 603.4, 701.21a).
  const notSacrificed = !attached && !leaves && /^if it wasn't sacrificed, /.exec(bodyText);
  if (notSacrificed) bodyText = bodyText.slice(notSacrificed[0].length);
  // "If it had a counter on it", "if it had one or more counters on it": as it last existed, so it can't change.
  // "If it had a -1/-1 counter on it" (Blowfly Infestation): of that kind.
  const hadCounter = !attached && new RegExp(`^if it had (?:a counter|one or more counters|counters|an? ${COUNTER} counter|one or more ${COUNTER} counters) on it, `).exec(bodyText);
  const hadKindOf = hadCounter ? (hadCounter[1] ?? hadCounter[2]) : undefined;
  if (hadCounter) bodyText = bodyText.slice(hadCounter[0].length);
  // Yuna, Grand Summoner: "if it had one or more counters on it, you may put that number of +1/+1 counters on target
  // creature": the counters of every kind it had as it last existed (rulings, CR 603.10a).
  const thatNumber = !!hadCounter && !hadKindOf && /^you may put that number of \+1\/\+1 counters on target creature\.$/.test(bodyText);
  if (thatNumber) bodyText = "you may put X +1/+1 counters on target creature.";
  // Reyhan: "if it had one or more +1/+1 counters on it, you may put that many +1/+1 counters on target creature": those
  // it had as it last existed (rulings: before -1/-1 counters that killed it cancelled any, CR 704.3).
  const thatMany = !!hadCounter && hadKindOf === "+1/+1" && /^you may put that many \+1\/\+1 counters on target creature\.$/.test(bodyText);
  if (thatMany) bodyText = "you may put X +1/+1 counters on target creature.";
  // "If its toughness was less than 1" (Massacre Girl, Known Killer): as it last existed (CR 603.10a), so it can't change
  // and is part of what dies, like a keyword it had.
  const wasPT = attached ? null : new RegExp(`^if its (power|toughness) was (?:less than ${NUM}|${NUM} or less|greater than ${NUM}|${NUM} or greater), (.+)$`).exec(bodyText);
  const ptRange = wasPT && (wasPT[2] ? { max: num(wasPT[2]) - 1 } : wasPT[3] ? { max: num(wasPT[3]) } : wasPT[4] ? { min: num(wasPT[4]) + 1 } : { min: num(wasPT[5]!) });
  if (wasPT) bodyText = wasPT[6]!;
  // Endless Evil: "When enchanted creature dies, if that creature was a Horror, ...": as it last existed (CR 603.10a), so
  // it can't change and is part of what dies.
  const wasType = attached?.[1] === "enchanted" && attachedM![2] === "creature" && attachedM![3] === "dies" ? /^if that creature was an? ([A-Z][a-z]+), (.+)$/.exec(bodyText) : null;
  if (wasType && !CREATURE_TYPES.has(wasType[1]!)) return "fail";
  if (wasType) bodyText = wasType[2]!;
  // Creature Bond: "When enchanted creature dies, ~ deals damage equal to that creature's toughness to the creature's
  // controller": that creature's, as it last existed.
  if (attached?.[1] === "enchanted") bodyText = bodyText.replace(/(that creature's [^.]+ to) the creature's controller\.$/, "$1 that creature's controller.");
  const wasHistoric = attached && attachedM![3] === "leaves the battlefield" ? /^if it was historic, (.+)$/.exec(bodyText) : null;
  if (wasHistoric) bodyText = wasHistoric[1]!;
  // Koll, the Forgemaster: "if it was enchanted or equipped": what was attached to it as it last existed (CR 603.10a).
  const wasAttached = attached ? null : /^if it was (enchanted or equipped|enchanted|equipped), (.+)$/.exec(bodyText);
  if (wasAttached) bodyText = wasAttached[2]!;
  const hadKw = attached ? null : /^if it (didn't have|had) ([\w ]+?), (.+)$/.exec(bodyText);
  const kw = hadKw ? parseKeywordList(hadKw[2]!) : null;
  if (hadKw && kw?.length !== 1) return "fail";
  if (hadKw) bodyText = hadKw[3]!;
  // "Return to your hand target artifact card in your graveyard with lesser mana value" (Scrap Trawler, Orah, Havi): less
  // than the one that died, as it last existed (rulings on Scrap Trawler); fixed as the target is chosen (TargetSpec.bound).
  // Colfenor, the Last Yew: "with lesser toughness": the same, as the creature last existed on the battlefield (rulings).
  // (Death's Oasis's "with lesser mana value than the creature that died" isn't a target: body.ts.)
  const lesserKey = attached ? undefined : / with lesser (mana value|toughness)\b(?! than)/.exec(bodyText)?.[1];
  const lesser = lesserKey !== undefined;
  if (lesser) bodyText = bodyText.replace(/ with lesser (?:mana value|toughness)\b/, "").replace(/^return to your hand (target [a-z ]+ card) in your graveyard\.$/, "return $1 from your graveyard to your hand.");
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
  if (thatMany) {
    body = { ...replaceX(body, { count: { kind: "counters", counter: "+1/+1", of: { ref: "subject" } } }), text: "you may put that many +1/+1 counters on target creature." };
    for (const e of body.effects) if (e.type === "may") e.text = "put that many +1/+1 counters on target creature";
  }
  if (lesser) {
    const [t, ...more] = body.targets;
    if (!t || more.length || t.kind !== "card" || t.bound || t.manaValue || t.toughness) return "fail";
    const key = lesserKey === "toughness" ? ("toughness" as const) : ("manaValue" as const);
    // "Return up to one other target creature card" after "~ or another creature ... dies": other than the one that died.
    const { notSource, ...rest } = t;
    if (notSource && m?.[1] !== "~ or another") return "fail";
    body = { ...body, targets: [{ ...rest, ...(notSource ? { notSubject: true as const } : {}), bound: { key, at: "most", amount: { count: { kind: key, of: { ref: "subject" } }, plus: -1 } }, text: `${t.text} with lesser ${lesserKey}` }] };
  }
  if (attached) {
    // "Return this card to its owner's hand" (Angelic Destiny): the Aura's card, which went to a graveyard as its creature
    // died or just after (CR 704.5m), not the Aura on the battlefield it no longer is (CR 400.7).
    if (attached[1] === "enchanted") for (const e of allEffects(body.effects)) if ((e.type === "bounce" || e.type === "putOntoBattlefield") && e.what.ref === "self") e.what = { ref: "selfCard", moved: true };
    const base: TargetSpec = wasType ? { kind: "object", types: ["Creature"], subtypes: [wasType[1]!], text: wasType[1]! } : attachedM![2] === "creature" ? { kind: "object", types: ["Creature"], text: "creature" } : { kind: "object", text: "permanent" };
    const filter: TargetSpec = wasHistoric ? { ...base, anyOf: HISTORIC, text: "historic permanent" } : base;
    const toZones = attachedM![3] === "dies or is put into exile" ? { toZones: ["graveyard", "exile"] as ("graveyard" | "exile")[] } : {};
    return { event: "permanentDies", dies: { filter, attached: true, ...(attachedM![3] !== "dies" ? { leaves: true as const, ...toZones } : {}) }, body };
  }
  let phrase = m![2]!;
  // Unscythe: "a creature dealt damage by equipped creature this turn": the creature it's attached to as the other dies,
  // whenever that damage was dealt (rulings). Vampiric Embrace: "by enchanted creature", the same for an Aura.
  const damaged = / dealt damage by (~|equipped creature|enchanted creature) this turn$/.exec(phrase);
  if (damaged) phrase = phrase.slice(0, damaged.index);
  // Baneclaw Marauder: "Whenever a creature blocking ~ dies": one that was blocking it as it last existed (CR 603.10a,
  // 509.1g), ~ dying at the same time too.
  const blockingSelf = !damaged && / blocking ~$/.exec(phrase);
  if (blockingSelf) phrase = phrase.slice(0, blockingSelf.index);
  if (blockingSelf && (m![1]!.toLowerCase() !== "a" || leaves || hadKw || wasPT || wasAttached || hadCounter)) return "fail";
  // Dance of Many: "Whenever a token created with ~ leaves the battlefield" (compile.ts reads "the token" so).
  const createdWithSelf = !damaged && !blockingSelf && phrase === "token created with ~";
  if (createdWithSelf) phrase = "token";
  if (createdWithSelf && (m![1]!.toLowerCase() !== "a" || !leaves || hadKw || wasPT || wasAttached || hadCounter)) return "fail";
  // "A creature of the chosen type" (Species Specialist): the type chosen as the watcher entered.
  const filter = ench ? enchantedControls(phrase) : parseTargetPhrase(phrase, / of the chosen type$/.test(phrase) ? { chosen: true } : undefined);
  if (!filter || filter.kind !== "object") return "fail";
  const kind = m![1]!.toLowerCase();
  const had = hadKw && kw ? (hadKw[1] === "had" ? { keywords: [...(filter.keywords ?? []), ...kw] } : { notKeywords: [...(filter.notKeywords ?? []), ...kw] }) : {};
  if (wasPT && filter[wasPT[1] as "power" | "toughness"]) return "fail";
  if (wasAttached && (filter.status || hadKw || wasPT)) return "fail";
  const attachedStatus = wasAttached ? { status: wasAttached[1] === "enchanted or equipped" ? ("enchantedOrEquipped" as const) : (wasAttached[1] as "enchanted" | "equipped") } : {};
  const wasRange = wasPT ? { [wasPT[1]!]: ptRange } : {};
  return {
    event: "permanentDies",
    dies: {
      filter: { ...filter, ...had, ...wasRange, ...attachedStatus, text: wasAttached ? `${phrase} that was ${wasAttached[1]}` : hadKw ? `${phrase} ${hadKw[1] === "had" ? "with" : "without"} ${hadKw[2]}` : wasPT ? `${phrase} with ${wasPT[1]} ${wasPT[0].slice(`if its ${wasPT[1]} was `.length, wasPT[0].length - wasPT[6]!.length - 2)}` : phrase },
      ...(kind === "another" ? { other: true } : {}),
      ...(kind === "~ or another" ? { orSelf: true } : {}),
      ...(damaged ? (damaged[1] === "~" ? { damagedBySelf: true } : { damagedByEquipped: true as const }) : {}),
      ...(blockingSelf ? { blockingSelf: true as const } : {}),
      ...(createdWithSelf ? { createdWithSelf: true as const } : {}),
      ...(leaves ? { leaves: true as const } : {}),
      ...(exiled ? { toZones: ["exile"] as ("graveyard" | "exile")[] } : diesOrExiled ? { toZones: ["graveyard", "exile"] as ("graveyard" | "exile")[] } : diesOrCommand ? { toZones: ["graveyard", "command"] as ("graveyard" | "command")[] } : toHand ? { toZones: ["hand"] as "hand"[] } : {}),
      ...(notDies ? { notDies: true as const } : {}),
      ...(hadCounter ? { hadCounter: hadKindOf ?? (true as const) } : {}),
      ...(notSacrificed ? { notSacrificed: true as const } : {}),
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
  // Subira, Tulzidi Caravanner: "whenever a creature you control with power 2 or less deals combat damage to a player":
  // its power right after the damage is dealt (rulings), as the trigger event happens.
  // Ms. Marvel, Elastic Ally: "with power greater than its base power" (CR 208.4b), the same way.
  line = line.replace(/^Whenever (an?|another) creature you control (with (?:power|toughness) \d+ or (?:less|greater)|with power greater than its base power) deals combat damage /, "Whenever $1 creature $2 you control deals combat damage ");
  // "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card" (Edric, Gix):
  // anyone's creature, dealing it to an opponent of this permanent's controller; "its controller" is the creature's.
  // The Master, Mesmerist: "Whenever a creature with skulk deals combat damage to one of your opponents, put a +1/+1
  // counter on ~ and draw a card": with the keyword as it deals the damage.
  // The Rani: "Whenever a goaded creature deals combat damage to one of your opponents, investigate": anyone's creature
  // goaded as it deals the damage (CR 701.15), once for each creature (unlike Puppet Master's "one or more").
  const any = /^Whenever a (goaded )?creature( with (skulk|flying|menace|deathtouch|trample|lifelink|infect))? deals combat damage to one of your opponents, (.+)$/.exec(line);
  if (any && !(any[1] && any[2])) {
    if (/\b(?:that player|defending player|that much|that many|you|your)\b/i.test(any[4]!)) return "fail";
    const body = parseBody(any[4]!, { subjectIt: true, eventPlayer: true });
    if (!body) return "fail";
    const kw = any[3] ? { keywords: [any[3].replace(/^./, (c) => c.toUpperCase())] } : {};
    const spec = any[1] ? parseTargetPhrase("goaded creature") : undefined;
    if (any[1] && spec?.kind !== "object") return "fail";
    const filter: TargetSpec = spec ? { ...spec, text: "goaded creature" } : { kind: "object", types: ["Creature"], ...kw, text: `creature${any[2] ?? ""}` };
    return { event: "creatureYouControlDealsCombatDamageToPlayer", dealer: { filter, anyone: true }, body, toOpponent: true };
  }
  // The Clone Saga: "Whenever a creature with the chosen name deals combat damage to a player this turn, draw a card" (a
  // delayed trigger, see floatingTrigger in body.ts): anyone's creature with that name (CR 201.2), the name bound as the
  // delayed trigger is made.
  const chosenName = /^Whenever a creature with the chosen name deals combat damage to a player, (.+)$/.exec(line);
  if (chosenName) {
    if (/\b(?:that player|defending player|that much|that many|it|its|their|they)\b/i.test(chosenName[1]!)) return "fail";
    const body = parseBody(chosenName[1]!);
    if (!body) return "fail";
    return { event: "creatureYouControlDealsCombatDamageToPlayer", dealer: { filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], chosen: "name", text: "creature with the chosen name" }, anyone: true }, body };
  }
  // Archivist of Gondor: "When your commander deals combat damage to a player, if there is no monarch, you become the
  // monarch": the commander you own (CR 903.3), whoever controls it; an intervening "if" (CR 603.4).
  const yourCmdr = /^When(?:ever)? your commander deals combat damage to a player, (?:if (there is no monarch|you're not the monarch), )?(.+)$/.exec(line);
  if (yourCmdr) {
    if (/\b(?:that player|defending player|that much|that many|it|its)\b/i.test(yourCmdr[2]!)) return "fail";
    const body = parseBody(yourCmdr[2]!);
    const ifCond = yourCmdr[1] ? parseStaticCondition(yourCmdr[1], { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
    if (!body || ifCond === null) return "fail";
    return { event: "creatureYouControlDealsCombatDamageToPlayer", dealer: { filter: { kind: "object", types: [], notTypes: [], notColors: [], commander: true, owner: "you", text: "your commander" }, anyone: true }, body, ...(ifCond ? { ifCond } : {}) };
  }
  // Curse of Stalked Prey: "Whenever a creature deals combat damage to enchanted player, put a +1/+1 counter on that
  // creature": anyone's creature, the enchanted player's own too (rulings).
  const toEnch = /^Whenever a creature deals combat damage to enchanted player, (.+)$/.exec(line);
  if (toEnch) {
    if (/\b(?:that player|defending player|that much|that many|you|your)\b/i.test(toEnch[1]!)) return "fail";
    const body = parseBody(toEnch[1]!, { subjectIt: true, eventPlayer: true });
    if (!body) return "fail";
    return { event: "creatureYouControlDealsCombatDamageToPlayer", dealer: { filter: { kind: "object", types: ["Creature"], text: "creature" }, anyone: true }, body, toEnchanted: true };
  }
  // Hooded Blightfang: "Whenever a creature you control with deathtouch deals damage to a planeswalker, destroy that
  // planeswalker"; Vraska, Swarm's Eminence: "... to a player or planeswalker, put a +1/+1 counter on that creature"; her
  // Assassin: "Whenever ~ deals damage to a planeswalker, destroy that planeswalker". Once for each recipient (CR 603.2c);
  // the creature has to have deathtouch as it deals the damage (rulings).
  // Zagras, Thief of Heartbeats: "Whenever a creature you control deals combat damage to a planeswalker, destroy that
  // planeswalker": combat damage only.
  const combatTo = /^Whenever a creature you control deals combat damage to a planeswalker, /.test(line);
  if (combatTo) line = line.replace(" deals combat damage to ", " deals damage to ");
  const dealsTo = /^Whenever (~|a creature you control(?: with (deathtouch))?) deals damage to a (planeswalker|player or planeswalker), (.+)$/.exec(line);
  if (dealsTo) {
    const what = dealsTo[3] === "planeswalker" ? "planeswalker" : "playerOrPlaneswalker";
    const dealt = /\bthat planeswalker\b/.test(dealsTo[4]!);
    if ((dealt && (what !== "planeswalker" || /\bthat creature\b/.test(dealsTo[4]!))) || /\b(?:that player|that much|that many|X)\b/.test(dealsTo[4]!)) return "fail";
    const body = parseBody(dealsTo[4]!.replace(/\bthat planeswalker\b/g, "it"), { subjectIt: true });
    if (!body) return "fail";
    const self = dealsTo[1] === "~";
    const filter = parseTargetPhrase(dealsTo[1]!.replace(/^a /, "").replace(/ you control/, "").replace(/^~$/, "creature"));
    if (filter?.kind !== "object") return "fail";
    return { event: "yourCreatureDealsDamage", dealer: { filter: { ...filter, text: dealsTo[1]!.replace(/^a /, "") } }, damageTo: { what, ...(self ? { self: true as const } : {}), ...(dealt ? { subjectDealt: true as const } : {}), ...(combatTo ? { combat: true as const } : {}) }, body };
  }
  // Brood Sliver: "Whenever a Sliver deals combat damage to a player, its controller may create a 1/1 colorless Sliver
  // creature token": anyone's Sliver, to any player; "its controller" is the Sliver's.
  // Cabal Slaver: "Whenever a Goblin deals combat damage to a player, that player discards a card": the player dealt it.
  const anySliver = /^Whenever a ([A-Z][a-z]+) deals combat damage to a player, (.+)$/.exec(line);
  if (anySliver && CREATURE_TYPES.has(anySliver[1]!)) {
    if (/\b(?:defending player|that much|that many|you|your)\b/i.test(anySliver[2]!) || (/\bthat player\b/i.test(anySliver[2]!) && !/^that player discards a card\.?$/.test(anySliver[2]!))) return "fail";
    const body = parseBody(anySliver[2]!, { subjectIt: true, eventPlayer: true });
    if (!body) return "fail";
    return { event: "creatureYouControlDealsCombatDamageToPlayer", dealer: { filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [anySliver[1]!], text: anySliver[1]! }, anyone: true }, body };
  }
  // Essence Sliver: "Whenever a Sliver deals damage, its controller gains that much life": anyone's Sliver, any damage, once
  // for all it deals at the same time (like lifelink, CR 120.3f); "its controller" is the Sliver's.
  const anyTypeDeals = /^Whenever an? ([A-Z][a-z]+) deals damage, (.+)$/.exec(line);
  if (anyTypeDeals && CREATURE_TYPES.has(anyTypeDeals[1]!)) {
    let text = anyTypeDeals[2]!;
    if (/\b(?:that player|defending player|X)\b/.test(text)) return "fail";
    const thatMuch = /\bthat (?:much|many)\b/.test(text);
    if (thatMuch) text = text.replace(/\bthat (?:much|many)\b/g, "X");
    let body = parseBody(text, { subjectIt: true });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, anyTypeDeals[2]!) };
    return { event: "permanentDealsDamage", dealer: { filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [anyTypeDeals[1]!], text: anyTypeDeals[1]! }, anyone: true }, body };
  }
  // The Beast, Deathless Prince: "Whenever a creature deals combat damage to its owner, untap ~ and draw a card": anyone's
  // creature, only to the player who owns it (CR 108.3), once for each creature.
  const toOwner = /^Whenever a creature deals combat damage to its owner, (.+)$/.exec(line);
  if (toOwner) {
    if (/\b(?:it|its|that creature|that player|its owner|its controller|that much|that many|X)\b/i.test(toOwner[1]!)) return "fail";
    const body = parseBody(toOwner[1]!);
    if (!body) return "fail";
    return { event: "creatureYouControlDealsCombatDamageToPlayer", dealer: { filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, anyone: true }, toOwner: true, body };
  }
  // Toxin Sliver: "Whenever a Sliver deals combat damage to a creature, destroy that creature. It can't be regenerated.":
  // anyone's Sliver; "that creature" is the creature dealt the damage.
  // Sosuke, Son of Seshiro: "Whenever a Warrior you control deals combat damage to a creature": yours only.
  const toCreature = /^Whenever a ([A-Z][a-z]+)( you control)? deals combat damage to a creature, (.+)$/.exec(line);
  if (toCreature && CREATURE_TYPES.has(toCreature[1]!)) {
    if (/\b(?:its controller|that player|defending player|that much|that many|X)\b/i.test(toCreature[3]!)) return "fail";
    const body = parseBody(toCreature[3]!, { subjectIt: true });
    if (!body) return "fail";
    const yours = toCreature[2] ? { controller: "you" as const } : {};
    return { event: "creatureDealsCombatDamageToCreature", dealer: { filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [toCreature[1]!], ...yours, text: `${toCreature[1]!}${toCreature[2] ?? ""}` }, anyone: true }, body };
  }
  // Quest for the Gemblades: "Whenever a creature you control deals combat damage to a creature, you may put a quest counter
  // on ~": once for each creature dealt it by each of yours (rulings), whatever the amount.
  const yoursToCreature = /^Whenever a creature you control deals combat damage to a creature, (.+)$/.exec(line);
  if (yoursToCreature) {
    if (/\b(?:it|its|that creature|its controller|that player|defending player|that much|that many|X)\b/i.test(yoursToCreature[1]!.replace(/\bon ~/, ""))) return "fail";
    const body = parseBody(yoursToCreature[1]!);
    if (!body) return "fail";
    return { event: "creatureDealsCombatDamageToCreature", dealer: { filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creature you control" }, anyone: true }, body };
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
  // "Whenever a creature you control with a counter on it deals combat damage to a player" (Ray Fillet): any kind.
  // Kassandra, Eagle Bearer: "with a legendary Equipment attached to it", as it deals the damage.
  const withKw = /^(Whenever (?:another|an?) creature) you control (with [a-z]+|with a counter on it|with a legendary Equipment attached to it) (deals combat damage to .+)$/.exec(line);
  // Samut, Vizier of Naktamun: "..., if that creature entered this turn, draw a card": an intervening if (CR 603.4) that
  // stays true once it is, so it's the same as a creature that entered this turn dealing the damage.
  const enteredIf = /^(Whenever (?:another|an?) .+? you control deals combat damage to a player), if that creature entered this turn, (.+)$/.exec(line);
  if (enteredIf) line = `${enteredIf[1]}, ${enteredIf[2]}`;
  // Kaust, Eyes of the Glade: "Whenever a creature you control that was turned face up this turn deals combat damage to a
  // player": turned face up this turn as it deals the damage (CR 708.8).
  const turnedUp = !enteredIf && /^Whenever a creature you control that was turned face up this turn (deals combat damage to a player, .+)$/.exec(line);
  if (turnedUp) line = `Whenever a creature you control ${turnedUp[1]}`;
  // "Whenever ~ or an enchanted creature you control deals combat damage to a player" (Calix, Guided by Fate): this
  // creature, enchanted or not, or another that matches; each one that deals the damage triggers it once.
  // "Whenever ~ or another nontoken Spirit you control ... deals combat damage to a player" (Millicent): the same, ~
  // whatever it is and each other one that matches.
  const orSelf = /^Whenever ~ or (an? .+? you control deals combat damage to .+)$/.exec(line) ?? /^Whenever ~ or another (.+? you control deals combat damage to .+)$/.exec(line);
  if (orSelf) line = `Whenever ${/^an? /.test(orSelf[1]!) ? "" : "a "}${orSelf[1]}`;
  const m = /^Whenever (another|an?) (.+?) you control deals combat damage to (a player(?: or battle| or planeswalker)?|an opponent), (.+)$/.exec(withKw ? `${withKw[1]} ${withKw[2]} you control ${withKw[3]}` : line);
  if (orSelf && (!m || withKw || /\b(it|its|that creature)\b/i.test(m[4]!))) return "fail";
  if (!m) return null;
  const filter = parseTargetPhrase(m[2]!);
  if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length || filter.allTypes?.includes("Creature") || filter.commander)) return "fail";
  let text = m[3] === "an opponent" ? otherOpponents(m[4]!) : m[4]!;
  // "To a player or battle": "that player" isn't about a battle (CR 310).
  if (m[3] === "a player or battle" && /\b(that player|defending player)\b/.test(text)) return "fail";
  // "To a player or planeswalker" (Flitterwing Nuisance): the same, "that player" isn't about a planeswalker.
  if (m[3] === "a player or planeswalker" && /\b(that player|defending player|that much|that many|X)\b/.test(text)) return "fail";
  const thatMuch = /\bthat (?:much|many)\b/.test(text);
  if (thatMuch) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(/\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, { subjectIt: true, eventPlayer: true });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, m[4]!) };
  if (enteredIf && (orSelf || filter.enteredThisTurn)) return "fail";
  if (turnedUp && (orSelf || withKw)) return "fail";
  return {
    event: "creatureYouControlDealsCombatDamageToPlayer",
    dealer: { filter: { ...filter, controller: "you", ...(enteredIf ? { enteredThisTurn: true as const } : {}), ...(turnedUp ? { turnedFaceUpThisTurn: true as const } : {}), text: `${m[2]} you control${enteredIf ? " that entered this turn" : turnedUp ? " that was turned face up this turn" : ""}` }, ...(m[1] === "another" ? { other: true } : {}), ...(orSelf ? { orSelf: true as const } : {}) },
    body: withOtherOpponents(body),
    ...(m[3] === "an opponent" ? { toOpponent: true as const } : {}),
    ...(m[3] === "a player or battle" ? { orBattle: true as const } : {}),
    ...(m[3] === "a player or planeswalker" ? { orPlaneswalker: true as const } : {}),
  };
}

/**
 * "Whenever a creature you control attacks, it gets +2/+2 until end of turn" (Fervent Charge), "Whenever a Dragon you
 * control attacks, bolster 2", "Whenever another creature you control attacks": once for each such creature as it's
 * declared as an attacker (CR 508.3a), not one put onto the battlefield attacking (508.4). "It" and "that creature" are
 * the attacker; "defending player" is the player it's attacking (CR 508.5a).
 */
function parseAttackerTrigger(line0: string): TriggeredAbility | "fail" | null {
  // Stinkdrinker Bandit: "Whenever a Rogue you control attacks and isn't blocked, it gets +2/+1 until end of turn": once for
  // each such creature no creature was declared to block (CR 509.1h, rulings), "it" being that creature.
  const unblocked = /^Whenever (another|an?) ([A-Za-z ]+?) you control attacks and isn't blocked, (.+)$/.exec(line0);
  if (unblocked) {
    const filter = parseTargetPhrase(unblocked[2]!);
    if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.includes("Creature") || filter.subtypes?.length)) return "fail";
    const body = parseBody(unblocked[3]!.replace(/\bthat creature\b(?!'s)/g, "it"), { subjectIt: true });
    if (!body) return "fail";
    return { event: "creatureYouControlAttacksUnblocked", attacker: { filter: { ...filter, controller: "you", text: `${unblocked[2]} you control` }, ...(unblocked[1] === "another" ? { other: true } : {}) }, body };
  }
  // "Whenever a creature you control that's enchanted or equipped attacks" (Reyav, Master Smith): one that's either as it
  // attacks.
  // Spiritual Asylum: "When a creature you control attacks, sacrifice ~": the same, triggering each time (CR 603.2).
  const line = line0.replace(/^Whenever a creature you control that's (enchanted or equipped|enchanted|equipped) attacks,/, (_, st: string) => `Whenever an ${st.replace(/ /g, "-")} creature you control attacks,`).replace(/^When a creature you control attacks, (?=sacrifice ~\.?$)/, "Whenever a creature you control attacks, ");
  // "Whenever a Zombie token you control with power 6 or greater attacks" (Dreadhorde Invasion): its power as it's declared.
  // "Whenever a creature you control with deathtouch attacks" (Hooded Blightfang), "Whenever a creature with flying
  // attacks" (Windreader Sphinx): one with it as it's declared.
  const m = /^Whenever (another|an?) (.+? you control(?: of the chosen type| with power \d+ or (?:greater|less)| with power equal to its toughness| with an? \+1\/\+1 counter on it| with a mana ability| with base power and toughness \d+\/\d+| with (?:flying|deathtouch|lifelink|trample|menace|vigilance|haste|reach|first strike|double strike|toxic))?) attacks, (.+)$/.exec(line);
  // "Whenever a creature attacks": anyone's, each one as it's declared as an attacker (Caltrops, Righteous Cause).
  // "Whenever a Kraken, Leviathan, Merfolk, Octopus, or Serpent attacks" (Summon: Leviathan): anyone's, of those types.
  const any = m ? null : /^Whenever (another|an?) ((?:[a-z]+ )?creature(?: with (?:flying|deathtouch|lifelink|trample|menace|vigilance|haste|reach|first strike|double strike))?|(?:[A-Z][a-z]+, )*[A-Z][a-z]+,? or [A-Z][a-z]+|[A-Z][a-z]+) attacks, (.+)$/.exec(line);
  // "Whenever a creature attacks you or a planeswalker you control" (Blood Reckoning, Isperia): one attacking this
  // permanent's controller, or a planeswalker they control (CR 506.2, 508.3a); "attacks you" alone, not a planeswalker.
  // "When a creature attacks you ..." (Guardian of the Ages) is the same: it triggers each time (CR 603.2).
  const you = m || any ? null : /^When(?:ever)? (an?) ((?:[a-z]+ )?creature(?: with(?:out)? [a-z]+| with power \d+ or (?:greater|less))?) attacks you( or a planeswalker you control)?, (.+)$/.exec(line);
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
  // "A creature you control with a +1/+1 counter on it" (Byrke, Long Ear of the Law): one with it as it's declared.
  // "A creature you control with a mana ability" (Raggadragga).
  const filter = m ? parseTargetPhrase(m[2]!.replace(/ you control(?= of the chosen type$| with power \d+ or (?:greater|less)$| with an? \+1\/\+1 counter on it$| with a mana ability$| with base power and toughness \d+\/\d+$| with [a-z ]+$|$)/, ""), { chosen: true }) : parseTargetPhrase(w[2]!);
  if (m) w[2] = m[2]!.replace(/ you control(?= of the chosen type$| with power \d+ or (?:greater|less)$| with an? \+1\/\+1 counter on it$| with a mana ability$| with base power and toughness \d+\/\d+$| with [a-z ]+$|$)/, "");
  if (!filter || filter.kind !== "object" || filter.controller || (filter.chosen && filter.chosen !== "type") || !(filter.types?.includes("Creature") || filter.subtypes?.length || filter.allTypes?.includes("Creature") || filter.commander)) return "fail";
  // Kitsune Ace: "Whenever a Vehicle you control attacks, choose one — • That Vehicle gains first strike ...": "that
  // Vehicle" is the attacker, as "that creature" is, in a mode too.
  const word = filter.subtypes?.length === 1 && w[2] === filter.subtypes[0] ? w[2] : undefined;
  const subjectText = word ? w[3]!.replace(new RegExp(`\\bthat ${word}\\b(?!')`, "g"), "it").replace(new RegExp(`\\bThat ${word}\\b(?!')`, "g"), "It") : w[3]!;
  const body = parseBody(subjectText.replace(/\bthat creature\b/g, "it"), { subjectIt: true, defending: true });
  if (!body) return "fail";
  if (any) return { event: "creatureYouControlAttacks", attacker: { filter: { ...filter, text: w[2]! }, anyone: true, ...(w[1] === "another" ? { other: true } : {}) }, body };
  return { event: "creatureYouControlAttacks", attacker: { filter: { ...filter, controller: "you", text: filter.chosen ? `${w[2]!.replace(/ of the chosen type$/, "")} you control of the chosen type` : / with (?:[a-z ]+|base power and toughness \d+\/\d+)$/.test(w[2]!) && (!/ with an? /.test(w[2]!) || / with a mana ability$/.test(w[2]!)) ? w[2]!.replace(/ with /, " you control with ") : `${w[2]} you control` }, ...(w[1] === "another" ? { other: true } : {}) }, body };
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
  // Banish into Fable: "When you cast this spell from your hand, ...": only a spell cast from its owner's hand (CR 601.2a).
  const castHand = /^When you cast (?:this spell|~) from your hand, (.+)$/.exec(line);
  if (castHand) {
    const t = parseTrigger(`When you cast ~, ${castHand[1]!}`);
    return t && t !== "fail" && t.event === "selfCast" ? { ...t, castFromHand: true } : "fail";
  }
  // Agent Maria Hill: "Whenever ~ becomes tapped to pay a teamwork cost": tapped as a spell's teamwork cost is paid (CR
  // 601.2h), not any other tap.
  const teamworkTap = /^Whenever ~ becomes tapped to pay a teamwork cost, (.+)$/.exec(line);
  if (teamworkTap) {
    const body = parseBody(teamworkTap[1]!);
    return body ? { event: "selfBecomesTapped", forTeamwork: true, body } : "fail";
  }
  // Foul Emissary: "When you sacrifice ~ while casting a spell with emerge": as a cost of that spell, for any reason
  // (rulings), whether or not it's cast for its emerge cost. Mana abilities are activated before a spell is cast here.
  const emerge = /^When you sacrifice ~ while casting a spell with emerge, (.+)$/.exec(line);
  if (emerge) {
    const body = parseBody(emerge[1]!);
    return body ? { event: "youSacrifice", sacrifices: { filter: { kind: "object", text: "~" }, orSelf: true, self: true, emerge: true }, body } : "fail";
  }
  const self = /^(?:When|Whenever) you sacrifice ~, (.+)$/.exec(line);
  if (self) {
    // "When you sacrifice ~, it deals 3 damage to any target" (Ordeal of Purphoros): ~ as it last existed (CR 608.2h).
    // Biolume Egg: "return it to the battlefield transformed under its owner's control at the beginning of the next end
    // step": the card where it went, as with "When ~ dies" (CR 400.7, 603.7).
    const returnIt = /^return it to the battlefield transformed under its owner's control at the beginning of the next end step\.?$/.test(self[1]!);
    const body = parseBody(self[1]!.replace(/^it deals /, "~ deals "), returnIt ? { selfCard: true } : {});
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
  // Curious Cadaver: "When you sacrifice a Clue" triggers each time, as "whenever" does (CR 603.2).
  const m = any ? [any[0], any[2], any[3], undefined, any[4]] : /^(?:Whenever|When) you sacrifice (~ or another|another|an?) (.+?)( during your turn)?, (.+)$/.exec(line);
  if (!m) return null;
  const phrase = m[2]!.replace(/ or (?=[a-z])/g, " or ");
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object" || filter.controller) return "fail";
  // "You may return target creature card with lesser mana value from your graveyard to the battlefield" (Riveteers
  // Ascendancy): less than the sacrificed permanent's, as it last existed (CR 608.2h), fixed as the target is chosen.
  const lesser = / with lesser mana value\b/.test(m[4]!);
  let body = parseBody(m[4]!.replace(/ with lesser mana value\b/, ""), { subjectIt: true, subjectLeft: true, ...(any ? { eventPlayer: true } : {}) });
  if (!body) return "fail";
  if (lesser) {
    const [t, ...more] = body.targets;
    if (!t || more.length || t.kind !== "card" || t.bound || t.manaValue) return "fail";
    body = { ...body, targets: [{ ...t, bound: { key: "manaValue", at: "most", amount: { count: { kind: "manaValue", of: { ref: "subject" } }, plus: -1 } }, text: `${t.text} with lesser mana value` }] };
  }
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
 * "Whenever a spell or ability an opponent controls destroys a noncreature permanent you control" (Karmic Justice): once
 * for each permanent destroyed (CR 701.8a), as it last existed (CR 603.10a), "that opponent" the destroying spell's or
 * ability's controller.
 */
function parseDestroyedTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever a spell or ability an opponent controls destroys an? (.+? you control), (.+)$/.exec(line);
  if (!m) return null;
  const filter = parseTargetPhrase(m[1]!);
  const body = parseBody(m[2]!.replace(/\bthat opponent\b/g, "that player"), { subjectIt: true, subjectLeft: true, eventPlayer: true });
  if (!filter || filter.kind !== "object" || !body) return "fail";
  return { event: "permanentDestroyed", destroyed: { filter: { ...filter, text: m[1]! }, by: "opponent" }, body };
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
  let exactly = false;
  // "When you attack with three or more creatures, transform ~" (Legion's Landing): "when" and "whenever" trigger alike.
  line = line.replace(/^When you attack with /, "Whenever you attack with ");
  // Path of Mettle: "Whenever you attack with at least two creatures that have first strike, double strike, vigilance,
  // and/or haste": two or more attackers with any of those, as they're declared.
  line = line.replace(/^Whenever you attack with at least (two|three|four) creatures that have ((?:[a-z ]+, )+and\/or [a-z]+), /, "Whenever you attack with $1 or more creatures with $2, ");
  // Rigo, Streetwise Mentor: "Whenever you attack a player or planeswalker with one or more creatures with power 1 or
  // less": once for each player and each planeswalker those creatures attack (CR 508.3a, 508.3e), not a battle.
  const youAttackAPlayer = /^Whenever you attack a player( or planeswalker)?( with one or more [^,]+)?, /.exec(line);
  const perWalker = !!youAttackAPlayer?.[1];
  if (youAttackAPlayer) {
    perPlayer = true;
    line = `Whenever you attack${youAttackAPlayer[2] ?? ""}, ${line.slice(youAttackAPlayer[0].length)}`;
  }
  // "Whenever one or more Halflings you control attack a player" (Meriadoc Brandybuck, Attuma, Crimson Cowl): likewise
  // once for each player those creatures attack, not a planeswalker or battle (rulings on Meriadoc Brandybuck).
  // Whirlwind, Killer Cyclone: "one or more creatures you control that entered this turn attack a player": attackers that
  // entered this turn, read as "creatures that entered this turn".
  line = line.replace(/^Whenever one or more creatures you control that entered this turn attack a player, /, "Whenever one or more creatures that entered this turn you control attack a player, ");
  // Zurzoth, Chaos Rider: "Whenever one or more Devils you control attack one or more players, you and those players each
  // draw a card, then discard a card at random": once for the declaration, only those attacking a player counting (not a
  // planeswalker, rulings; CR 508.3e), "those players" the players they attack.
  // Each draws, then each discards at random (no choice to make, CR 701.9b).
  const groupAttacksPlayers = /^Whenever one or more ([A-Z][a-z]+) you control attack one or more players, (you and those players each draw a card, then discard a card at random)\.$/.exec(line);
  if (groupAttacksPlayers) {
    const st = singularWord(groupAttacksPlayers[1]!);
    if (!CREATURE_TYPES.has(st)) return "fail";
    const who = { ref: "youAndEventPlayers" as const };
    const body: AbilityBody = { targets: [], effects: [{ type: "draw", who, n: 1 }, { type: "discard", who, n: 1, random: true }], text: `${groupAttacksPlayers[2]!}.` };
    return { event: "creaturesYouControlAttack", body, group: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], subtypes: [st], text: groupAttacksPlayers[1]! }, attacksPlayers: true };
  }
  const groupAttacksAPlayer = /^Whenever one or more (.+?) you control attack a player, /.exec(line);
  if (groupAttacksAPlayer) {
    perPlayer = true;
    line = `Whenever one or more ${groupAttacksAPlayer[1]} you control attack, ${line.slice(groupAttacksAPlayer[0].length)}`;
  }
  // "Whenever you attack with ~ and another legendary creature" (Merry, Esquire of Rohan).
  let selfAnd: TargetSpec | undefined;
  const withAnother = /^Whenever you attack with ~ and another ([a-z ]+?creature), /.exec(line);
  if (withAnother) {
    const f = parseTargetPhrase(withAnother[1]!);
    if (f?.kind !== "object" || f.controller) return "fail";
    selfAnd = { ...f, text: withAnother[1]! };
    line = `Whenever you attack, ${line.slice(withAnother[0].length)}`;
  }
  // "Whenever two or more creatures you control attack a player" (Horn of the Mark): once for each player at least two of
  // them attack, not counting those attacking planeswalkers or battles (rulings).
  const nAttackAPlayer = /^Whenever (two|three|four|five) or more creatures you control attack a player, /.exec(line);
  if (nAttackAPlayer) {
    perPlayer = true;
    line = `Whenever you attack with ${nAttackAPlayer[1]} or more creatures, ${line.slice(nAttackAPlayer[0].length)}`;
  }
  // "Whenever you attack with ~ and/or your commander" (Ainok Strike Leader): once for the attack, if it or your commander
  // (a commander you own, CR 903.3) is among the creatures you attacked with.
  let selfOrCommander = false;
  const withCommander = /^Whenever you attack with ~ and\/or your commander, /.exec(line);
  if (withCommander) {
    selfOrCommander = true;
    line = `Whenever you attack, ${line.slice(withCommander[0].length)}`;
  }
  // W'Kabi, Shield of the Nation: "Whenever you attack with your commander": once for the attack, if a commander you own
  // (CR 903.3) is among the creatures you attacked with.
  const withYourCommander = /^Whenever you attack with your commander, /.exec(line);
  if (withYourCommander) line = `Whenever you attack, ${line.slice(withYourCommander[0].length)}`;
  // "Whenever you attack with creatures with total power 6 or greater" (Ugin's Mastery): once for the attack, if the
  // creatures attacking add up to that much power as they're declared.
  let minTotalPower: number | undefined;
  const totalPower = /^Whenever you attack with creatures with total power (\d+) or greater, /.exec(line);
  if (totalPower) {
    minTotalPower = Number(totalPower[1]);
    line = `Whenever you attack, ${line.slice(totalPower[0].length)}`;
  }
  // "Whenever one or more creatures you control with power 4 or greater attack" (The Earth King): the same group.
  // Teo, Spirited Glider: "Whenever one or more creatures you control with flying attack".
  line = line.replace(/^(Whenever one or more creatures) (you control) (with power \d+ or greater|with flying) attack, /, "$1 $3 $2 attack, ");
  if ((m = /^Whenever one or more (creatures that are enchanted by an Aura you control) attack, (.+)$/.exec(line))) {
    // Killian, Decisive Mentor: whoever attacks with them (the Aura yours, the creature anyone's), once for each
    // declaration of attackers (CR 508.1, 603.2c).
    event = "creaturesYouControlAttack";
    phrase = m[1];
    bodyText = m[2]!;
    anyone = true;
  } else if ((m = /^Whenever you attack with exactly (two|three) creatures, (.+)$/.exec(line))) {
    // Alluring Suitor: "When you attack with exactly two creatures": as many attackers as were declared, no more or fewer
    // (one put onto the battlefield attacking wasn't declared and doesn't count, rulings; CR 508.1).
    event = "creaturesYouControlAttack";
    bodyText = m[2]!;
    min = num(m[1]!);
    exactly = true;
  } else if ((m = /^Whenever (?:one or more (.+?) you control attack|you attack with (one|two|three|four|five|six|seven|eight|nine|ten) or more ((?:[^,]+?, )+and\/or [a-z ]+?|.+?)|you attack), (.+)$/.exec(line))) {
    event = "creaturesYouControlAttack";
    phrase = m[1] ?? m[3];
    bodyText = m[4]!;
    const n = m[2] ? num(m[2]) : 1;
    if (n > 1) min = n;
  } else if ((m = /^Whenever (two|three) or more creatures your opponents control attack, (~ can't block this combat)\.?$/.exec(line))) {
    // Flummoxed Cyclops: an opponent's attack with two or more creatures (with no teams, each other player is an opponent,
    // CR 102.3), once for the declaration; the attackers leaving later don't matter (rulings).
    const body = parseBody(m[2]!, {});
    if (!body) return "fail";
    return { event: "creaturesYouControlAttack", body, minAttackers: num(m[1]!), anyoneAttacks: true, anotherPlayer: true };
  } else if ((m = /^Whenever another player attacks with (two|three|four|five) or more creatures, they draw a card if none of those creatures attacked you\.?$/.exec(line))) {
    // Firemane Commando: another player's attack, all of their attackers counted; they draw unless one of those creatures
    // attacked you (not your planeswalkers or battles), as they were declared (rulings).
    const draw = parseBody("That player draws a card", { eventPlayer: true });
    if (!draw) return "fail";
    const body: AbilityBody = { ...draw, effects: [{ type: "if", cond: { kind: "noneAttackedYou" }, effects: draw.effects }], text: m[0].replace(/^[^,]+, /, "") };
    return { event: "creaturesYouControlAttack", body, minAttackers: num(m[1]!), anyoneAttacks: true, anotherPlayer: true };
  } else if ((m = /^Whenever a player attacks, add (one|two|three|four|five|six|seven|eight|nine|ten) \{R\}\. Until end of combat, you don't lose this mana as steps end\.?$/.exec(line))) {
    // Avatar Roku, Firebender: any player's declaration of attackers (CR 508.1), red mana for this ability's controller
    // that stays in their pool until end of combat (as firebending's does, CR 702.189a, 500.4).
    return { event: "creaturesYouControlAttack", body: { targets: [], effects: [{ type: "addCombatMana", n: num(m[1]!) }], text: m[0].replace(/^[^,]+, /, "") }, anyoneAttacks: true };
  } else if ((m = /^Whenever a player attacks, if one or more players being attacked are poisoned, (the attacking player draws a card)\.?$/.exec(line))) {
    // Norn's Decree: any player's attack (CR 508.3d), checked as it triggers and as it resolves (CR 603.4).
    const draw = parseBody("That player draws a card.", { eventPlayer: true });
    if (!draw) return "fail";
    return { event: "creaturesYouControlAttack", body: { ...draw, text: m[1]! }, anyoneAttacks: true, ifCond: { kind: "attackedPlayerPoisoned" } };
  } else if ((m = /^Whenever one or more creatures attack one of your opponents( or a planeswalker they control)?, (.+)$/.exec(line))) {
    // Frontier Warmonger, Frenzied Gorespawn: any player's creatures (rulings), once for each of your opponents they attack
    // (with their planeswalkers, when it says so; not battles), as for "whenever you attack a player" (CR 508.3e). "Those
    // creatures" are the ones attacking that opponent, "defending player" that opponent.
    if (/\b(they|them|their|it|that player)\b/.test(m[2]!.replace(/\bthose creatures\b/g, ""))) return "fail";
    const body = parseBody(m[2]!.replace(/\bdefending player\b/g, "that player"), { eventPlayer: true, eventGroup: true });
    if (!body) return "fail";
    return { event: "creaturesYouControlAttack", body, anyoneAttacks: true, attacksOpponent: { ...(m[1] ? { orPlaneswalkers: true as const } : {}) } };
  } else if ((m = /^Whenever (?:one or more creatures attack|a player attacks with (two|three|four|five) or more creatures), (.+)$/.exec(line.replace(/^Whenever (two|three|four|five) or more creatures attack, /, "Whenever a player attacks with $1 or more creatures, ")))) {
    // Argent Dais: "Whenever two or more creatures attack": the same, whoever attacks (rulings).
    // Duelist's Heritage: whoever attacks (rulings), once for each declaration (CR 508.1, 603.2c). "Whenever a player
    // attacks with three or more creatures" (Aurelia, the Law Above): any player's attack, counting all their attackers.
    event = "creaturesYouControlAttack";
    bodyText = m[2]!;
    anyone = true;
    if (m[1]) min = num(m[1]);
    if (/\bthat player\b/.test(bodyText)) return "fail";
  } else if ((m = /^Whenever one or more (.+?) you control deal combat damage to (a player or battle|a player|an opponent|one or more players), (.+)$/.exec(line.replace(/^(Whenever one or more creatures) (you control) (each with power greater than its base power) deals /, "$1 $3 $2 deal ").replace(/^(Whenever one or more creatures) (you control) (with [a-z]+|with counters on them|with \+1\/\+1 counters on them|with power \d+ or greater|with base power \d+|that entered this turn) deal /, "$1 $3 $2 deal ")))) {
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
    // Primo, the Unbounded: "Put a number of +1/+1 counters on it equal to the damage dealt": the damage those creatures dealt
    // to that player, as Quartzwood Crasher's X.
    // Anowon, the Ruin Thief: "that player mills a card for each 1 damage dealt to them. If the player mills at least one
    // creature card this way, you draw a card": the damage the Rogues dealt (rulings), one draw however many creatures.
    const millEach = /^that player mills a card for each 1 damage dealt to them\. If the player mills at least one ([a-z]+ card) this way, (you draw a card)\.$/.exec(bodyText);
    if (millEach && !damageX) {
      shownText = bodyText;
      bodyText = `that player mills that many cards. If a ${millEach[1]} was milled this way, ${millEach[2]}.`;
    }
    const damageDealt = /^(create [^.]+ token)\. Put a number of \+1\/\+1 counters on it equal to the damage dealt\.$/.exec(bodyText);
    if (damageDealt && !damageX) {
      shownText = bodyText;
      bodyText = `${damageDealt[1]}. Put X +1/+1 counters on it.`;
      damageX = true;
    }
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
    // Descendants' Fury: "you may sacrifice one of them. If you do, reveal cards from the top of your library until you
    // reveal a creature card that shares a creature type with the sacrificed creature. Put that card onto the battlefield
    // and the rest on the bottom of your library in a random order." One of the creatures that dealt it, chosen as it
    // resolves; the sacrificed creature as it last existed (rulings).
    if (phrase === "creatures" && m[2] === "a player" && /^you may sacrifice one of them\. If you do, reveal cards from the top of your library until you reveal a creature card that shares a creature type with the sacrificed creature\. Put that card onto the battlefield and the rest on the bottom of your library in a random order\.$/.test(bodyText)) {
      const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
      const card: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
      return {
        event,
        body: {
          targets: [],
          effects: [
            { type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter: creature, n: 1, action: "sacrifice", fromGroup: true }], text: "sacrifice one of them" },
            { type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ type: "revealUntil", filter: card, found: "battlefield", rest: "bottom", sharesCreatureTypeWithSacrificed: true }] },
          ],
          text: bodyText,
        },
      };
    }
    // Kaito, Dancing Shadow: "you may return one of them to its owner's hand. If you do, you may activate loyalty abilities
    // of ~ twice this turn rather than only once." One of the creatures that dealt it, chosen as it resolves; "if you do":
    // it went to its owner's hand (as Mistbreath Elder's); twice at most however often it resolves (rulings, CR 606.3).
    if (phrase === "creatures" && m[2] === "a player" && bodyText === "you may return one of them to its owner's hand. If you do, you may activate loyalty abilities of ~ twice this turn rather than only once.") {
      const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
      return {
        event,
        body: {
          targets: [],
          effects: [
            { type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter: creature, n: 1, action: "bounce", fromGroup: true }], text: "return one of them to its owner's hand" },
            { type: "if", cond: { kind: "bouncedThisWay", returned: true }, effects: [{ type: "turnRules", rules: ["loyaltyTwice"], self: true }] },
          ],
          text: bodyText,
        },
      };
    }
    // Combat damage to a player always goes to an opponent here: attacks only go to opponents. "That opponent" is that
    // player, "each other opponent" each opponent but them (Parapet Thrasher).
    toOpponent = m[2] === "an opponent";
    if (toOpponent) bodyText = otherOpponents(bodyText).replace(/\bthat opponent\b/g, "that player");
  } else return null;
  // Angelic Guardian: "Whenever one or more creatures you control attack, they gain indestructible until end of turn":
  // "they" are those attackers, as they were declared.
  if (event === "creaturesYouControlAttack" && m[1] && !min && /^they (?:gain|get) [^.]+ until end of turn\.?$/.test(bodyText) && !/\b(?:they|them|their)\b/.test(bodyText.slice(5)))
    bodyText = `those creatures ${bodyText.slice(5)}`;
  // Vrestin, Menoptra Leader: "Whenever you attack with one or more Insects, put a +1/+1 counter on each of them": the
  // attackers of the group, as they were declared.
  if (event === "creaturesYouControlAttack" && phrase && !anyone && !perPlayer && /^put an? [^.]+ counter on each of them\.?$/.test(bodyText)) bodyText = bodyText.replace(/each of them/, "each of those creatures");
  // The attackers as a group aren't modeled. Mishra's meld sentence's "them" is Mishra and the other creature it names.
  const meldThem = /\bIf ~ and an? \w+ named [^.]+ are attacking, and you both own and control them, exile ~ and the attacking \w+ named .+, then meld them into .+$/;
  // "Look at the top three cards of your library. Put one of them into your hand ..." is about those cards.
  // "Look at the top five cards of your library. You may reveal a creature card from among them and put it into your
  // hand." (Horn of the Mark) too, and "a Hero card ... put that card into your hand" (Director Nick Fury).
  // Cosmic Cube: "Look at the top six cards of your library. You may cast a spell from among them ..." too.
  // Choco, Seeker of Paradise: "look at that many cards from the top of your library. You may put one of them into your
  // hand. Then put any number of land cards from among them ...": the cards.
  const lookAt = /\b[Ll]ook at (?:the top (?:two|three|four|five|six) cards of your library\. (?:Put (?:one|two) of them [^.]+|You may reveal an? (?:[a-z ]+|[A-Z][a-z]+) card from among them and put (?:it|that card) into your hand|You may cast a spell from among them [^.]+)|that many cards from the top of your library\. You may put one of them into your hand\. Then put any number of land cards from among them onto the battlefield tapped and the rest into your graveyard)\./;
  // "Search your library for up to that many basic land cards, put them onto the battlefield tapped" is about the cards.
  const searched = /\b[Ss]earch your library for [^,.]+ cards, put them onto the battlefield( tapped)?, then shuffle\./;
  // "Create two 1/1 red Warrior creature tokens that are tapped and attacking. Sacrifice them at the beginning of the next
  // end step." (Dalkovan Encampment): the tokens.
  const sacCreated = /\b[Cc]reate [^.]+ tokens that are tapped and attacking\. Sacrifice them at the beginning of the next end step\./;
  // "Whenever you attack with eight or more creatures, those creatures get +4/+4 until end of turn" (Champions from
  // Beyond): the creatures that attacked, as they were declared.
  // Lightmine Field: "Whenever one or more creatures attack, ~ deals damage to each of those creatures ...": anyone's
  // attackers of that declaration.
  // Aloy, Savior of Meridian: "discover X, where X is the greatest power among them": the attackers of the group.
  // Witch-king, Sky Scourge: "exile the top X cards of your library, where X is their total power": the same attackers.
  if (event === "creaturesYouControlAttack") bodyText = bodyText.replace(/, where X is the greatest power among them\.$/, ", where X is the greatest power among those creatures.").replace(/, where X is their total power\. You may play those cards this turn\.$/, ", where X is the total power of those creatures. You may play those cards this turn.");
  // Vulture, Feathered Fiend: "Whenever one or more creatures you control with flying deal combat damage to a player, put a
  // +1/+1 counter on each of those creatures": the ones that dealt that player combat damage.
  const dealtThose = event === "creaturesYouControlDealCombatDamageToPlayer" && /^put an? \+1\/\+1 counter on each of those creatures and draw a card\.?$/.test(bodyText);
  const those = (event === "creaturesYouControlAttack" || dealtThose) && !(anyone && min) && !perPlayer && !selfOrCommander && !returnOne && /\bthose creatures\b/.test(bodyText) && !/\b(they|them|their)\b/.test(bodyText);
  // "Creatures you control with counters on them gain double strike" (Chocobo Knights): not about the attackers.
  // Within Range: "each opponent loses life equal to the number of creatures attacking them": each one's own attackers.
  // Roar of Resistance: "planeswalkers they control" after "your opponents" is about those players, not the creatures.
  if (/\b(they|them|those creatures|their)\b/.test(bodyText.replace(/^each opponent loses life equal to the number of creatures attacking them\.?$/, "").replace(/\bcreatures attacking your opponents and\/or planeswalkers they control\b/g, "").replace(/ with (?:[+-]1\/[+-]1 )?counters on them\b/g, "").replace(meldThem, "").replace(lookAt, "").replace(searched, "").replace(sacCreated, "").replace(those ? /\bthose creatures\b/g : /^$/, "")) && !/that player/.test(bodyText)) return "fail";
  let group: TargetSpec | undefined;
  if (phrase && !/^creatures$/.test(phrase)) {
    // "Creatures with counters on them" (Tidus, Yuna's Guardian): each with a counter on it.
    // Haliya, Ascendant Cadet: "creatures you control with +1/+1 counters on them".
    const counters = / with (\+1\/\+1 )?counters on them$/.exec(phrase);
    // Vaan, Street Thief: "one or more Scouts, Pirates, and/or Rogues": a creature of any of them, as batchPermanents.
    const words = counters ? phrase.slice(0, counters.index) : phrase;
    const spec = parseTargetPhrase(phrase === "creatures that are enchanted by an Aura you control" ? "aura-yours-enchanted creature" : words.replace(/,? and\/or /g, (x) => x.replace("and/or", "or")).split(/(\s+|,)/).map((w) => (/^[\s,]*$/.test(w) ? w : singularWord(w))).join("") + (counters ? ` with ${counters[1] ? "a +1/+1 counter" : "counters"} on it` : ""));
    if (!spec || spec.kind !== "object") return "fail";
    group = { ...spec, text: phrase };
  }
  if (withYourCommander) group = { kind: "object", commander: true, owner: "you", text: "your commander" };
  let text = bodyText;
  // "Draw that many cards" (The Ur-Dragon), "search your library for up to that many basic land cards" (The Earth King):
  // how many of the matching creatures attacked, as they were declared.
  const thatMuch = (event === "creaturesYouControlDealCombatDamageToPlayer" || (event === "creaturesYouControlAttack" && !anyone && !perPlayer && !selfOrCommander)) && (/\bthat (?:much|many)\b/.test(text) || damageX);
  // Fangorn, Tree Shepherd: "add twice that much {G}": two for each of them.
  const twice = thatMuch && !damageX && /^add twice that much \{[WUBRGC]\}\.?$/.test(text);
  if (thatMuch && !damageX) {
    if (/\bX\b/.test(text)) return "fail";
    text = text.replace(twice ? /\btwice that much\b/g : /\bthat (?:much|many)\b/g, "X");
  }
  let body = parseBody(text, { eventPlayer: event === "creaturesYouControlDealCombatDamageToPlayer" || perPlayer, ...(those ? { eventGroup: true as const } : {}) });
  if (!body) return "fail";
  if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" }, ...(twice ? { times: 2 } : {}) }), text: shownText ?? (damageX ? body.text : twice ? bodyText : unX(body.text, bodyText)) };
  if (toOpponent) {
    const said = (b: AbilityBody): AbilityBody => ({ ...withOtherOpponents(b), text: withOtherOpponents(b).text.replaceAll("that player", "that opponent"), ...(b.modal ? { modal: { ...b.modal, modes: b.modal.modes.map(said) } } : {}) });
    body = said(body);
  }
  if (returnOne) {
    const filter: TargetSpec = group ?? { kind: "object", types: ["Creature"], text: "creature" };
    body = { ...body, effects: [...body.effects, { type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "bounce", fromGroup: true }], text: `return one of those ${phrase} to its owner's hand` }], text: `${body.text} You may return one of those ${phrase} to its owner's hand.` };
  }
  return { event, body, ...(group ? { group } : {}), ...(min ? { minAttackers: min } : {}), ...(exactly ? { exactAttackers: true as const } : {}), ...(toOpponent ? { toOpponent: true as const } : {}), ...(orBattle ? { orBattle: true as const } : {}), ...(anyone ? { anyoneAttacks: true as const } : {}), ...(perPlayer ? { perPlayer: true as const } : {}), ...(perWalker ? { perWalker: true as const } : {}), ...(selfOrCommander ? { selfOrCommander: true as const } : {}), ...(selfAnd ? { selfAnd } : {}), ...(minTotalPower ? { minTotalPower } : {}) };
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
  } else if ((m = /^Whenever one or more cards are put into exile from graveyards and\/or the battlefield( during your turn)?, (.+)$/.exec(line))) {
    // Ketramose, the New Dawn: cards (not tokens) of anyone's, for any reason, in one event.
    batch = { what: "exiledFromGraveyardsOrBattlefield" };
    yourTurn = !!m[1];
    rest = m[2]!;
  } else if ((m = /^Whenever one or more cards are put into exile( during your turn)?, (.+)$/.exec(line))) {
    // Stonebinder's Familiar: cards (not tokens, CR 111.1) from anywhere, anyone's, in one event (rulings).
    batch = { what: "exiled" };
    yourTurn = !!m[1];
    rest = m[2]!;
  } else if ((m = /^Whenever one or more cards are put into a library from anywhere, (.+)$/.exec(line))) {
    // Wan Shi Tong, All-Knowing: anyone's cards (not tokens, CR 111.1) into any library, once for each event; not a scry,
    // surveil or other reordering within a library (rulings).
    batch = { what: "toLibrary" };
    rest = m[1]!;
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
  } else if ((m = /^Whenever one or more (?:(.+?) )?cards are put into graveyards from anywhere, (.+)$/.exec(line))) {
    // Dennick, Pious Apparition: anyone's cards (not tokens, CR 111.1), into their owners' graveyards, once for each event.
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    batch = { what: "toGraveyard", ...(filter ? { filter } : {}) };
    rest = m[2]!;
  } else if ((m = /^Whenever (a player|an opponent) mills one or more (?:(.+?) )?cards, (.+)$/.exec(line))) {
    // Zellix, Sanity Flayer: cards a mill instruction put there (CR 701.17a), once for each player who milled them. "An
    // opponent" (Lo and Li): cards from an opponent's library.
    const filter = batchCards(m[2]);
    if (filter === null) return "fail";
    batch = { what: "toGraveyard", from: "library", milled: true, ...(m[1] === "an opponent" ? { whose: "opponent" as const } : {}), ...(filter ? { filter } : {}) };
    rest = m[3]!;
  } else if ((m = /^Whenever (a player|an opponent) mills an? (?:(.+?) )?card, (.+)$/.exec(line))) {
    // Glowing One: "Whenever a player mills a nonland card": once for each such card milled (rulings, CR 603.2c).
    // Infesting Radroach: "Whenever an opponent mills a nonland card": cards from an opponent's library.
    const filter = batchCards(m[2]);
    if (filter === null) return "fail";
    batch = { what: "toGraveyard", from: "library", milled: true, each: true, ...(m[1] === "an opponent" ? { whose: "opponent" as const } : {}), ...(filter ? { filter } : {}) };
    rest = m[3]!;
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
  } else if ((m = /^Whenever (?:an?|(another)) (?:(.+?) )?card (leaves (?:your|an opponent's) graveyard|is put into (?:a|your|an opponent's) graveyard from (?:anywhere(?: other than the battlefield)?|a library|your library))( during your turn)?, (.+)$/.exec(line))) {
    // Measure of Wickedness: "Whenever another card is put into your graveyard from anywhere": not this permanent's own card.
    const another = !!m[1];
    m.splice(1, 1);
    // Syr Konrad: "a creature card is put into a graveyard from anywhere other than the battlefield", "a creature card
    // leaves your graveyard": once for each card (CR 603.2c). Kishla Skimmer: "Whenever a card leaves your graveyard
    // during your turn".
    const filter = batchCards(m[1]);
    if (filter === null) return "fail";
    // Erebos's Titan: "Whenever a creature card leaves an opponent's graveyard": a card an opponent owns (CR 404.1).
    const whose = /an opponent's/.test(m[2]!) ? ("opponent" as const) : /^leaves|your graveyard/.test(m[2]!) ? ("you" as const) : undefined;
    // Bloodchief Ascension: "a card is put into an opponent's graveyard from anywhere", "that player" being its owner.
    // Dreadhound: "a creature card is put into a graveyard from a library", any library, any way (not only milled).
    // Pedantic Learning: "a land card is put into your graveyard from your library", the same (a card goes to its owner's
    // graveyard, CR 400.3).
    if (another && (m[1] || !/^is put into your graveyard from anywhere$/.test(m[2]!))) return "fail";
    batch = { what: m[2]!.startsWith("leaves") ? "leavesGraveyard" : "toGraveyard", ...(whose ? { whose } : {}), ...(filter ? { filter } : {}), ...(/other than the battlefield$/.test(m[2]!) ? { from: "notBattlefield" as const } : / (?:a|your) library$/.test(m[2]!) ? { from: "library" as const } : {}), each: true, ...(another ? { other: true as const } : {}) };
    yourTurn = !!m[3];
    rest = m[4]!;
    eachOwner = true;
  } else if ((m = /^Whenever you create one or more (creature )?tokens( for the first time each turn)?, (.+)$/.exec(line))) {
    // Staff of the Storyteller: once for each event in which you create any (CR 111.2, 603.2c), whoever controls them.
    // Akim: "for the first time each turn", counting tokens created before it was on the battlefield.
    if (m[1] && m[2]) return "fail";
    batch = { what: "created", whose: "you", ...(m[1] ? { filter: { kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature token" } } : {}), ...(m[2] ? { first: true as const } : {}) };
    rest = m[3]!;
  } else if ((m = /^Whenever (you|one or more players|a player) discards? one or more (?:(.+?) )?cards( for the first time each turn)?, (.+)$/.exec(line))) {
    const filter = batchCards(m[2]);
    if (filter === null || (m[1] === "a player" && m[3])) return "fail";
    // Tinybones, Pocket Nuisance: "Whenever a player discards one or more cards": once for each player who discarded in the
    // event (CR 603.2c).
    batch = { what: "discards", ...(m[1] === "you" ? { whose: "you" as const } : {}), ...(m[1] === "a player" ? { eachPlayer: true as const } : {}), ...(filter ? { filter } : {}), ...(m[3] ? { first: true as const } : {}) };
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
  // Polluted Cistern: "each opponent loses 1 life for each card type among those cards": the cards put there, card types
  // only (CR 205.2a), each as it last existed in the graveyard if it has left (CR 608.2h).
  if (/^each opponent loses 1 life for each card type among those cards\.?$/.test(rest) && batch.what === "toGraveyard" && batch.from === "library" && !batch.filter && !yourTurn)
    return { event: "batch", batch, body: { targets: [], effects: [{ type: "loseLife", who: { ref: "eachOpponent" }, n: { count: { kind: "eventGroupCardTypes" } } }], text: rest.replace(/\.$/, "") } };
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
  // Conspiracy Theorist: "Whenever you discard one or more nonland cards, you may exile one of them from your graveyard. If
  // you do, you may cast it this turn.": one of the cards that event discarded, still in your graveyard (CR 400.7); cast
  // with its normal timing (rulings).
  if (/^you may exile one of them from your graveyard\. If you do, you may cast it this turn\.?$/.test(rest) && batch.what === "discards" && batch.whose === "you" && !batch.first && !yourTurn)
    return { event: "batch", batch, body: { targets: [], effects: [{ type: "may", effects: [{ type: "chooseFromGraveyard", n: 1, eventGroup: true, ...(batch.filter ? { filter: batch.filter } : {}), dest: "exile", castExiledThisTurn: true }], text: "exile one of them from your graveyard (you may cast it this turn)" }], text: rest.replace(/\.$/, "") } };
  // Captain Howler, Sea Scourge: "target creature gets +2/+0 until end of turn for each card discarded this way. Whenever
  // that creature deals combat damage to a player this turn, you draw a card.": how many cards the event discarded (all of
  // them, CR 603.2c, even those that left the graveyard since); "that creature" is the target.
  const discardEach = batch.what === "discards" && !yourTurn ? /^(target creature gets [+-]\d+\/[+-]\d+ until end of turn for each card discarded this way\.)( Whenever that creature deals combat damage to a player this turn, [^.]+\.)?$/.exec(rest) : null;
  if (discardEach) {
    const body = parseBody(rest, { discardBatch: true });
    return body ? { event: "batch", batch, body } : "fail";
  }
  // Tamiyo, the Moon Sage's emblem: "Whenever a card is put into your graveyard from anywhere, you may return it to your
  // hand": that card, once for each (CR 603.2c), while it's still in the graveyard (CR 400.7; rulings: whether or not it
  // was ever in your hand).
  if (batch.each && batch.what === "toGraveyard" && batch.whose === "you" && !batch.from && !batch.other && !batch.filter && !yourTurn && /^you may return it to your hand\.?$/.test(rest))
    return { event: "batch", batch, body: { targets: [], effects: [{ type: "may", effects: [{ type: "bounce", what: { ref: "eventGroup" } }], text: "return it to your hand" }], text: rest.replace(/\.$/, "") } };
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
  // Frenzied Raider: "Whenever you activate a boast ability" (CR 702.142a).
  const boast = /^Whenever you activate a boast ability, (.+)$/.exec(line);
  if (boast) {
    const body = parseBody(boast[1]!, {});
    return body ? { event: "abilityActivated", activates: { by: "you", boast: true }, body } : "fail";
  }
  // Vizier of the Anointed: "Whenever you activate an eternalize or embalm ability" (CR 702.128a, 702.129a): it resolves
  // before that ability, after its costs are paid (rulings).
  const embalm = /^Whenever you activate an eternalize or embalm ability, (.+)$/.exec(line);
  if (embalm) {
    const body = parseBody(embalm[1]!, {});
    return body ? { event: "abilityActivated", activates: { by: "you", embalm: true }, body } : "fail";
  }
  // Afterburner Expert: "Whenever you activate an exhaust ability" (CR 702.177a), a mana ability too.
  const exhaust = /^Whenever you activate an exhaust ability, (.+)$/.exec(line);
  if (exhaust) {
    const body = parseBody(exhaust[1]!, {});
    return body ? { event: "abilityActivated", activates: { by: "you", exhaust: true, mana: true }, body } : "fail";
  }
  // Herald of Anafenza: "Whenever you activate ~'s outlast ability" (CR 702.107a).
  const outlast = /^Whenever you activate ~'s outlast ability, (.+)$/.exec(line);
  if (outlast) {
    const body = parseBody(outlast[1]!, {});
    return body ? { event: "abilityActivated", activates: { by: "you", ownOutlast: true }, body } : "fail";
  }
  // Way of the Paradox: "Whenever you activate a loyalty ability, ..."; Keral Keep Disciples: "... of a Chandra
  // planeswalker"; Way of the Mind Sculptor: "..., if you removed two or more loyalty counters to activate it, ..." (CR
  // 606.3-4). The event player is you.
  // Elspeth's Talent, Rowan's Talent: "... of enchanted planeswalker": the permanent this Aura is attached to as the
  // ability is activated (the same check as Illusionist's Bracers' "equipped creature").
  const loyalEnchanted = /^Whenever you activate a loyalty ability of enchanted planeswalker, (.+)$/.exec(line);
  if (loyalEnchanted) {
    const body = parseBody(loyalEnchanted[1]!, { activatedAbility: true });
    return body ? { event: "abilityActivated", activates: { by: "you", loyalty: true, equipped: true }, body } : "fail";
  }
  const loyal = /^Whenever you activate a loyalty ability(?: of an? ([A-Z][a-z]+) planeswalker)?, (?:if you removed (two|three|four|five) or more loyalty counters to activate it, )?(.+)$/.exec(line);
  if (loyal) {
    const of = loyal[1] ? parseTargetPhrase(`${loyal[1]} planeswalker`) : undefined;
    const body = parseBody(loyal[3]!, { activatedAbility: true });
    if (!body || (loyal[1] && (of?.kind !== "object" || !of.subtypes?.includes(loyal[1])))) return "fail";
    return { event: "abilityActivated", activates: { by: "you", loyalty: true, ...(of ? { of } : {}), ...(loyal[2] ? { loyaltyRemoved: num(loyal[2]) } : {}) }, body };
  }
  // Neerdiv, Devious Diver (as compile.ts splits it): "Whenever you activate an ability of a card in your graveyard":
  // mana abilities too, as nothing says otherwise.
  const yard = /^Whenever you activate an ability of a card in your graveyard, (.+)$/.exec(line);
  if (yard) {
    const body = parseBody(yard[1]!, { activatedAbility: true });
    return body ? { event: "abilityActivated", activates: { by: "you", inYourGraveyard: true, mana: true }, body } : "fail";
  }
  // Ertha Jo, Frontier Mentor: "Whenever you activate an ability that targets a creature or player": a mana ability can't
  // target (CR 605.1a), so it's never one.
  const targeting = /^Whenever you activate an ability that targets a creature or player, (.+)$/.exec(line);
  if (targeting) {
    const body = parseBody(targeting[1]!, { activatedAbility: true });
    return body ? { event: "abilityActivated", activates: { by: "you", targetsCreatureOrPlayer: true }, body } : "fail";
  }
  // Elrond, Moon-Reader: "Whenever you activate an ability of a creature, ..." with nothing about mana abilities: mana
  // abilities too (rulings).
  // Ceaseless Searblades: "of an Elemental": a permanent of that creature type (rulings: not a card in another zone).
  const anyOf = /^Whenever you activate an ability of an? (creature|artifact|land|permanent|Elemental), (?!if it isn't a mana ability)(.+)$/.exec(line);
  if (anyOf) {
    const f = parseTargetPhrase(anyOf[1]!);
    const body = parseBody(anyOf[2]!, { activatedAbility: true });
    return f?.kind === "object" && body ? { event: "abilityActivated", activates: { by: "you", of: f, mana: true }, body } : "fail";
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

function parseDrawTrigger(line0: string): TriggeredAbility | "fail" | null {
  // Sneaky Snacker: "When you draw your third card in a turn, ...": the same event as "each turn" (CR 121.2).
  const line = line0.replace(/^When (you draw your|an opponent draws their|a player draws their) (first|second|third|fourth|fifth) card in a turn, /, "Whenever $1 $2 card each turn, ");
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
function parseDiscardTrigger(line0: string): TriggeredAbility | "fail" | null {
  // Spiritual Focus: "Whenever a spell or ability an opponent controls causes you to discard a card": a discard that's an
  // effect of such a spell or ability, not a cost (rulings on Psychic Purge).
  const byOpponent = /^Whenever a spell or ability an opponent controls causes you to discard a card, /.test(line0);
  if (byOpponent) {
    const t = parseDiscardTrigger(line0.replace(/^Whenever a spell or ability an opponent controls causes you to discard a card, /, "Whenever you discard a card, "));
    return t && t !== "fail" && t.discards ? { ...t, discards: { ...t.discards, byOpponent: true } } : t;
  }
  // Valiant Rescuer: "Whenever you cycle another card for the first time each turn": the player's first cycle this turn.
  const first = /^(Whenever you cycle (?:another|a) card) for the first time each turn, /.exec(line0);
  const line = first ? `${first[1]}, ${line0.slice(first[0].length)}` : line0;
  // Anje Falkenrath: "Whenever you discard a card, if it has madness, ...": a card with madness, which it can't lose on
  // the way to exile or the graveyard, so the same as checking it again as the trigger resolves (CR 603.4).
  const m = /^Whenever (you|an opponent|a player) (cycles?|discards?|cycles? or discards?) (a|another|an?) ((?:[A-Za-z]+,? )*?card(?: with (?:madness|disturb))?), (.+)$/.exec(line.replace(/^(Whenever you discard a card), if it has madness, /, "$1 with madness, "));
  if (!m) return null;
  let filter: TargetSpec | undefined;
  if (m[4] === "card with madness") filter = { kind: "card", types: [], notTypes: [], notColors: [], keywords: ["Madness"], text: "card with madness" };
  else if (m[4] !== "card") {
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
  // Pitchstone Wall: "you may sacrifice ~. If you do, return the discarded card from your graveyard to your hand": that
  // card, if it's still there (CR 400.7).
  if (m[1] === "you" && m[2] === "discard" && m[3] === "a" && m[4] === "card" && /^you may sacrifice ~\. If you do, return the discarded card from your graveyard to your hand\.$/.test(m[5]!))
    return { event: "playerDiscards", discards: { by: "you" }, body: { targets: [], effects: [{ type: "may", effects: [{ type: "sacrifice", what: { ref: "self" } }], text: "sacrifice ~" }, { type: "if", cond: { kind: "youDid" }, effects: [{ type: "bounce", what: { ref: "subjectCard", zone: "graveyard" } }] }], text: m[5]! } };
  // Hashaton: "create a tapped token that's a copy of that card": the discarded card, as it last existed in the
  // graveyard if it has left (CR 608.2h).
  const copyIt = /\bcopy of that card\b/.test(m[5]!) && !/\b(?:it|its)\b/.test(m[5]!.replace(/\bexcept it's\b/, ""));
  const body = exile ? { targets: [], effects: [exileIt?.[1] ? { type: "may" as const, effects: [exile], text: m[5]!.replace(/^you may /, "").replace(/\.$/, "") } : exile], text: m[5]! } : parseBody(m[5]!, { eventPlayer: true, ...(copyIt ? { subjectIt: true, subjectLeft: true } : {}) });
  if (!body) return "fail";
  const by = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : "any";
  return { event: "playerDiscards", discards: { by, ...(/^cycles?$/.test(m[2]!) ? { cycled: true as const } : {}), ...(m[3] === "another" ? { other: true as const } : {}), ...(filter ? { filter } : {}), ...(first ? { firstEachTurn: true as const } : {}) }, body };
}

/** "Whenever a creature you control exploits a nontoken creature" (CR 702.110b): the exploited creature is the subject. */
function parseExploitsTrigger(line: string): TriggeredAbility | "fail" | null {
  // Profaner of the Dead: "When ~ exploits a creature, return to their owners' hands all creatures your opponents control
  // with toughness less than the exploited creature's toughness": the exploited creature (the trigger's subject) as it
  // last existed on the battlefield (rulings).
  const self = /^When ~ exploits a creature, return to their owners' hands all (creatures your opponents control) with (power|toughness) less than the exploited creature's \2\.$/.exec(line);
  if (self) {
    const body = parseBody(`return all ${self[1]} with ${self[2]} less than that creature's ${self[2]} to their owners' hands.`, { subject: true });
    return body ? { event: "selfExploits", body } : "fail";
  }
  const m = /^Whenever a creature you control exploits an? (.+?), (.+)$/.exec(line);
  if (!m) return null;
  const filter = m[1] === "creature" ? undefined : parseTargetPhrase(m[1]!);
  if (filter === null || (filter && filter.kind !== "object")) return "fail";
  // Henry Wu, InGen Geneticist: "draw a card. If the exploited creature had power 3 or greater, create a Treasure token.":
  // the exploited creature is the subject, its power as it last existed on the battlefield (CR 603.10a, 608.2h).
  const hadPower = /^(.+?)\. If the exploited creature had power (\d+) or greater, (create an? [^.]+)\.$/.exec(m[2]!);
  if (hadPower) {
    const first = parseBody(`${hadPower[1]}.`);
    const then = parseBody(`${capital(hadPower[3]!)}.`);
    if (!first || !then || first.targets.length || then.targets.length) return "fail";
    const body = { targets: [], effects: [...first.effects, { type: "if" as const, cond: { kind: "amountsCompare" as const, a: { count: { kind: "power" as const, of: { ref: "subject" as const } } }, atLeast: Number(hadPower[2]) }, effects: then.effects }], text: m[2]! };
    return { event: "creatureYouControlExploits", body, ...(filter ? { subjectFilter: { ...filter, text: m[1]! } } : {}) };
  }
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
  // Tamiyo, Upriser Crowned: "... to you while you're the monarch, tap those creatures and put a stun counter on each of
  // them": the monarch as the damage is dealt (a condition on the event, like Emberwilde Captain's), "those creatures" the
  // ones that dealt it, as they are now (a creature that has left is a new object, CR 400.7).
  const hurt = /^Whenever one or more creatures deal combat damage to you( while you're the monarch)?, (.+)$/.exec(line);
  if (hurt) {
    const those = /\bthose creatures\b/.test(hurt[2]!);
    const body = parseBody(hurt[2]!, those ? { eventGroup: true } : {});
    return body ? { event: "creaturesDealCombatDamageToYou", body, ...(hurt[1] ? { activeIf: { kind: "monarch" as const } } : {}) } : "fail";
  }
  // Norn's Decree: "Whenever one or more creatures an opponent controls deal combat damage to you, that opponent ...".
  const hurtBy = /^Whenever one or more creatures an opponent controls deal combat damage to you, (.+)$/.exec(line);
  if (hurtBy) {
    const body = parseBody(hurtBy[1]!.replace(/\bthat opponent\b/g, "that player"), { eventPlayer: true });
    return body ? { event: "opponentCreaturesDealCombatDamageToYou", body: { ...body, text: hurtBy[1]! } } : "fail";
  }
  // Nelly Borca: "Whenever one or more creatures an opponent controls deal combat damage to one or more of your opponents,
  // you and the controller of those creatures each draw a card."
  const crossfire = /^Whenever one or more creatures an opponent controls deal combat damage to one or more of your opponents, (.+)$/.exec(line);
  if (crossfire) {
    const body = parseBody(crossfire[1]!.replace(/\bthe controller of those creatures\b/g, "that player"), { eventPlayer: true });
    return body ? { event: "opponentCreaturesDamageYourOpponents", body: { ...body, text: crossfire[1]! } } : "fail";
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
const YARD_EVENTS: TriggerEvent[] = ["playerDraws", "youProliferate", "permanentDies", "castSpell", "spellYouControlDealsDamage", "youCommitCrime", "youScry", "youSurveil", "youScryOrSurveil", "permanentEnters", "landYouControlEnters", "anotherCreatureYouControlEnters", "creaturesYouControlAttack", "creatureYouControlAttacks", "creaturesYouControlDealCombatDamageToPlayer", "creatureYouControlDealsCombatDamageToPlayer", "yourUpkeep", "eachUpkeep", /** Old One Eye: "At the beginning of your first main phase" (CR 505.1a). */ "yourFirstMain", "yourDrawStep", "eachDrawStep", "yourEndStep", "eachEndStep", "yourBeginCombat", "eachBeginCombat", "yourEndCombat", "eachEndCombat", "ringTemptsYou", "dayNightChanges", "youCompleteDungeon", "permanentCountersPut", "youSacrifice", "opponentGainsLife"];

export function parseTrigger(raw: string): TriggeredAbility | "fail" | null {
  // Wiitigo: "At the beginning of your upkeep, put a +1/+1 counter on ~ if it has blocked or been blocked since your last
  // upkeep. Otherwise, remove a +1/+1 counter from it." Shape of the Wiitigo: the same about enchanted creature, "if it
  // attacked or blocked": checked as it resolves (not an intervening if, CR 603.4); none to remove, nothing happens.
  const wiitigo = /^At the beginning of your upkeep, put a \+1\/\+1 counter on (~|enchanted creature) if it (has blocked or been blocked|attacked or blocked) since your last upkeep\. Otherwise, remove a \+1\/\+1 counter from it\.$/.exec(raw);
  if (wiitigo) {
    const what: ObjRef = wiitigo[1] === "~" ? { ref: "self" } : { ref: "attached" };
    const cond: StaticCondition = wiitigo[2] === "attacked or blocked" ? { kind: "combatSinceYourLastUpkeep", of: wiitigo[1] === "~" ? "self" : "attached", attacked: true, blocked: true } : { kind: "combatSinceYourLastUpkeep", of: wiitigo[1] === "~" ? "self" : "attached", blocked: true, wasBlocked: true };
    return { event: "yourUpkeep", body: { targets: [], effects: [{ type: "if", cond: { kind: "state", cond }, effects: [{ type: "counters", what, counter: "+1/+1", n: 1 }], otherwise: [{ type: "removeCounters", what, counter: "+1/+1", n: 1 }] }], text: raw.replace(/^At the beginning of your upkeep, /, "") } };
  }
  // An ability word ("Magecraft —", "Landfall —") has no rules meaning (CR 207.2c).
  // "Whenever your commander enters" (Nakia, Tome of Legends): the commander you own (CR 903.3), whoever controls it.
  // Leyline Phantom: "When ~ deals combat damage, ..." triggers each time, as "whenever" does (CR 603.2).
  // Zhang Liao: "Whenever ~ deals damage to an opponent, that opponent discards a card": the player dealt it.
  const line = differenceInHand(raw.replace(/^[A-Z][A-Za-z' -]+!? — (?=(When|Whenever|At)\b)/, ""))
    .replace(/^Whenever your commander enters, /, "Whenever a commander you own enters, ")
    // Keeper of Tresserhorn: "it assigns no combat damage this turn and defending player loses 2 life": two instructions.
    .replace(/^(Whenever ~ attacks and isn't blocked), it assigns no combat damage this turn and defending player loses (\w+) life\.$/, "$1, ~ assigns no combat damage this turn. Defending player loses $2 life.")
    .replace(/^When ~ deals combat damage, /, "Whenever ~ deals combat damage, ")
    // Lifeline: "Whenever a creature dies, if another creature is on the battlefield, return the first card to the
    // battlefield under its owner's control at the beginning of the next end step": another than the one that died, which
    // is gone, so any creature (rulings: none left, none returns, checked again as it resolves, CR 603.4); the card, if
    // it's still in the graveyard then, under its owner's control.
    .replace(/^Whenever a creature dies, if another creature is on the battlefield, return the first card to the battlefield under its owner's control at the beginning of the next end step\.$/, "Whenever a creature dies, if a creature is on the battlefield, return that card to the battlefield under its owner's control at the beginning of the next end step.")
    // Cursed Wombat's granted ability: "put an additional +1/+1 counter on it" is one more on that permanent, ~.
    .replace(/^(Whenever one or more \+1\/\+1 counters are put on ~), put an additional \+1\/\+1 counter on it\./, "$1, put a +1/+1 counter on ~.")
    // Greener Pastures: "if that player controls more lands than each other player, the player creates ...": that player.
    .replace(/^(At the beginning of each player's upkeep, if that player controls more lands than each other player), the player creates /, "$1, that player creates ")
    // Kudzu, Steam Vines: "that land's controller" is the destroyed land's, as it last existed (rulings: any land, not
    // targeted; with none to move to, the Aura is left attached to nothing and state-based actions bin it).
    .replace(/^(When enchanted land becomes tapped, destroy it)\. That land's controller may attach ~ to a land of their choice\.$/, "$1. Its controller may attach ~ to a land of their choice.")
    .replace(/^(When enchanted land becomes tapped, destroy it) and ~ deals (\w+) damage to that land's controller\. That player attaches ~ to a land of their choice\.$/, "$1. ~ deals $2 damage to its controller. Its controller attaches ~ to a land of their choice.")
    // Darigaaz, the Igniter: "If you do, choose a color, then that player reveals their hand and ~ deals damage to the
    // player equal to the number of cards of that color revealed this way.": the color chosen as it resolves (rulings), then
    // the damaged player's whole hand revealed and counted.
    .replace(/^(Whenever ~ deals combat damage to a player, you may pay (?:\{[^}]+\})+\. If you do, choose a color), then that player reveals their hand and ~ deals damage to the player equal to the number of cards of that color revealed this way\.$/, "$1. That player reveals their hand. ~ deals damage to that player equal to the number of cards of the chosen color in their hand.")
    // Psychic Venom: "Whenever enchanted land becomes tapped, ~ deals 2 damage to that land's controller": the tapped land's
    // controller, as Pooling Venom's "its controller" (rulings: tapped for any reason).
    .replace(/^(Whenever enchanted land becomes tapped, ~ deals \w+ damage to) that land's controller\.$/, "$1 its controller.")
    // Slow Motion: "that player sacrifices that creature unless they pay {2}": their choice to pay as it resolves, then the
    // sacrifice if they didn't (rulings; a player can only sacrifice a creature they control, CR 701.21a).
    .replace(/^(At the beginning of the upkeep of enchanted creature's controller), that player sacrifices that creature unless they pay ((?:\{[^}]+\})+)\.$/, "$1, that player may pay $2. If they don't, that player sacrifices enchanted creature.")
    // Paralyze: "that player may pay {4}. If the player does, untap the creature.": the enchanted creature.
    .replace(/^(At the beginning of the upkeep of enchanted creature's controller, that player may pay (?:\{[^}]+\})+\. If the player does, untap) the creature\.$/, "$1 enchanted creature.")
    // Awaken the Sky Tyrant: "When a source an opponent controls deals damage to you, sacrifice ~. ...": each time, the
    // same (rulings: once for each source, though ~ can be sacrificed only once).
    .replace(/^When a source an opponent controls deals damage to you, (?=sacrifice ~\.)/, "Whenever a source an opponent controls deals damage to you, ")
    // Sawblade Skinripper: "if you sacrificed one or more permanents this turn, ~ deals that much damage": as many as you
    // sacrificed, counted as it resolves.
    .replace(/^(At the beginning of your end step), if you sacrificed one or more permanents this turn, ~ deals that much damage to any target\.$/, "$1, if you sacrificed a permanent this turn, ~ deals damage equal to the number of permanents you sacrificed this turn to any target.")
    // HYDRA Assault Robot: "Whenever another Villain and/or artifact you control enters": one permanent that's either or
    // both, as "Villain or artifact".
    .replace(/^(Whenever another [A-Z][a-z]+) and\/or (artifact|creature|enchantment) you control enters, /, "$1 or $2 you control enters, ")
    // Pollywog Symbiote: "Whenever you cast a creature spell, if it has mutate, ...": it triggers for a creature spell with
    // mutate, cast for its mutate cost or not, and resolves even if that spell is countered (rulings).
    .replace(/^Whenever you cast a creature spell, if it has mutate, /, "Whenever you cast a creature spell with mutate, ")
    // Vrondiss's Dragon Spirit token: "When this token deals damage, sacrifice it": each time it does (CR 603.2).
    .replace(/^When ~ deals damage, /, "Whenever ~ deals damage, ")
    // ED-E, Lonesome Eyebot: "Whenever you attack, if ... quest counters on ~, put a quest counter on it": "it" can only be
    // ~, the one object the trigger names.
    .replace(/^(Whenever you attack, if [^,]* on ~, put an? [a-z]+ counter on) it\.$/, "$1 ~.")
    // Clockwork Beast: "At end of combat, if ~ attacked or blocked this combat, remove a +1/+0 counter from it": the
    // intervening if (CR 603.4) is about ~, and so is "it".
    .replace(/^(At end of combat, if ~ attacked or blocked this combat, remove an? \S+ counter from) it\.$/, "$1 ~.")
    // Thunderkin Awakener: "choose target Elemental creature card in your graveyard with toughness less than ~'s toughness.
    // Return that card to the battlefield tapped and attacking": the same as returning that target.
    .replace(/^(Whenever ~ attacks), choose target ([A-Z][a-z]+ creature card) in your graveyard (with toughness less than ~'s toughness)\. Return that card (to the battlefield tapped and attacking)\./, "$1, return target $2 $3 from your graveyard $4.")
    // Daredevil Dragster: "At end of combat, if ~ attacked or blocked this combat, put a velocity counter on it. Then if it
    // has two or more velocity counters on it, sacrifice it and draw two cards": every "it" is ~; its counters as it last
    // existed if it's gone (rulings: you draw even though it can't be sacrificed).
    .replace(/^(At end of combat, if ~ attacked or blocked this combat, put an? [a-z]+ counter on) it\. Then if it (has two or more [a-z]+ counters on it), sacrifice it and (draw two cards)\.$/, "$1 ~. Then if ~ $2, sacrifice ~ and $3.")
    // Beastmaster's Magemark: "Whenever a creature you control that's enchanted becomes blocked": the same as "an enchanted
    // creature you control" (enchanted by any Aura, anyone's).
    .replace(/^Whenever a creature you control that's enchanted becomes blocked, /, "Whenever an enchanted creature you control becomes blocked, ")
    // Insubordination: "At the beginning of the end step of enchanted creature's controller, ~ deals 2 damage to that player
    // unless that creature attacked this turn": "that creature" is the enchanted creature, checked as it resolves.
    .replace(/^(At the beginning of the end step of enchanted creature's controller, ~ deals \d+ damage to that player) unless that creature attacked this turn\.$/, "$1 unless enchanted creature attacked this turn.")
    // Instill Furor: "At the beginning of your end step, sacrifice ~ unless it attacked this turn": checked as it resolves;
    // the same as an intervening "if ~ didn't attack this turn" (CR 603.4), since nothing attacks during the end step.
    .replace(/^(At the beginning of your end step), sacrifice ~ unless it attacked this turn\.$/, "$1, if ~ didn't attack this turn, sacrifice it.")
    // Siege Dragon: "Whenever ~ attacks, if defending player controls no Walls, it deals 2 damage to each creature without
    // flying that player controls": "it" is ~ and "that player" the defending player.
    .replace(/^(Whenever ~ attacks, if defending player controls no [A-Z][a-z]+s), it deals (\d+) damage to each ([a-z ]+?) that player controls\.$/, "$1, ~ deals $2 damage to each $3 defending player controls.")
    // Writ of Passage: "Whenever enchanted creature attacks, if its power is 2 or less, ...": "its" is the enchanted creature's.
    .replace(/^(Whenever enchanted creature attacks), if its (power|toughness) is /, "$1, if enchanted creature's $2 is ")
    // Electryte: "Whenever ~ deals combat damage to defending player": the only player an attacking creature can deal
    // combat damage to is the one it attacks (CR 506.2, 510.1), and a blocking one deals it to no player.
    .replace(/^Whenever ~ deals combat damage to defending player, /, "Whenever ~ deals combat damage to a player, ")
    .replace(/^(Whenever ~ deals (?:combat )?damage to an opponent), that opponent /, "$1, that player ")
    // Risona, Asari Commander: "Whenever combat damage is dealt to you": only creatures deal combat damage (CR 510.1), once
    // for each combat damage step; "if it doesn't have an indestructible counter on it" after "Whenever ~ deals ...": ~.
    .replace(/^Whenever combat damage is dealt to you, /, "Whenever one or more creatures deal combat damage to you, ")
    .replace(/^(Whenever ~ deals combat damage to a player), if it doesn't have an? ([a-z]+) counter on it, /, "$1, if ~ doesn't have an $2 counter on it, ")
    // Long Feng, Grand Secretariat: "Whenever another creature you control or a land you control is put into a graveyard
    // from the battlefield": one event for each permanent that's either (a land creature triggers it once).
    .replace(/^Whenever another creature you control or a land you control is put into a graveyard from the battlefield, /, "Whenever another creature or land you control is put into a graveyard from the battlefield, ")
    // Resolute Archangel: "if your life total is less than your starting life total, it becomes equal to ...": "it" is
    // your life total.
    .replace(/(, if your life total is less than your starting life total), it becomes equal to your starting life total\.$/, "$1, your life total becomes your starting life total.");
  if (!/^(When|Whenever|At)\b/.test(line)) return null;
  // Deus of Calamity: "Whenever ~ deals 6 or more damage to an opponent, ...": that much at one time, not added up
  // (rulings), any damage.
  const dealsMin = /^Whenever ~ deals (two|three|four|five|six|seven|eight|nine|ten|\d+) or more damage to an opponent, (.+)$/.exec(line);
  if (dealsMin) {
    if (/\bthat (?:much|many)\b/.test(dealsMin[2]!)) return "fail";
    const t = parseTrigger(`Whenever ~ deals damage to an opponent, ${dealsMin[2]}`);
    return t && t !== "fail" && t.event === "selfDealsDamageToPlayer" && t.toOpponent && !t.minDamage ? { ...t, minDamage: num(dealsMin[1]!) } : "fail";
  }
  // "Whenever you expend 4, ..." (CR 700.14): read as any "whenever you" trigger with no event of its own to refer to.
  const expend = /^Whenever you expend (\d+), (.+)$/.exec(line);
  if (expend) {
    const t = parseTrigger(`Whenever you proliferate, ${expend[2]}`);
    return t && t !== "fail" && t.event === "youProliferate" && Object.keys(t).every((k) => k === "event" || k === "body") ? { ...t, event: "youExpend", expend: Number(expend[1]) } : "fail";
  }
  // Jason Bright, Glowing Prophet: "Whenever a Zombie or Mutant you control dies, if its power was different from its base
  // power": the creature as it last existed (CR 603.10a, 608.2h); a characteristic-defining ability's value is its base
  // power, a bonus isn't (rulings).
  const notBase = /^(Whenever an? [^,]+? dies), if its power was different from its base power, (.+)$/.exec(line);
  if (notBase) {
    const t = parseTrigger(`${notBase[1]}, ${notBase[2]}`);
    return t && t !== "fail" && t.event === "permanentDies" && !t.ifCond ? { ...t, ifCond: { kind: "subjectPowerNotBase" } } : "fail";
  }
  // Voldaren Bloodcaster: "Whenever you create a Blood token, ...": once for each token of that kind you create (CR 111.2).
  const createdKind = /^Whenever you create an? ([A-Z][a-z]+) token, (.+)$/.exec(line);
  if (createdKind) {
    const filter = pickFilter(createdKind[1]!);
    const t = parseTrigger(`Whenever you create a token, ${createdKind[2]}`);
    if (!filter || filter.kind !== "object" || !filter.subtypes?.length || filter.types?.length) return "fail";
    return t && t !== "fail" && t.event === "youCreateToken" ? { ...t, createdFilter: { ...filter, text: `${createdKind[1]} token` } } : "fail";
  }
  // Marshal's Anthem: "When ~ enters, return up to X target creature cards from your graveyard to the battlefield, where X
  // is the number of times ~ was kicked": X is known as the ability is put on the stack, when its targets are chosen
  // (CR 601.2c, 603.3d), from the permanent's multikicker (CR 702.33d; TriggeredAbility.xKicked).
  const kickedX = /^(When ~ enters), (.+), where X is the number of times ~ was kicked\.$/.exec(line);
  if (kickedX && /\bup to X target\b/.test(kickedX[2]!)) {
    const t = parseTrigger(`${kickedX[1]}, ${kickedX[2]}.`);
    return t && t !== "fail" && t.event === "selfEnters" ? { ...t, xKicked: true } : "fail";
  }
  // Mirror Shield's "Whenever a creature with deathtouch blocks or becomes blocked by this creature, destroy that
  // creature": the same events as "whenever ~ blocks or becomes blocked by a creature with deathtouch" (CR 509.3c, 509.3d).
  const byIt = /^Whenever (an? creature with [a-z ]+?) blocks or becomes blocked by ~, (.+)$/.exec(line);
  if (byIt) {
    const t = parseTrigger(`Whenever ~ blocks or becomes blocked by ${byIt[1]}, ${byIt[2]}`);
    return t && t !== "fail" && t.event === "selfBlocksOrBlockedByCreature" ? t : "fail";
  }
  // Sword of Hours: "Whenever equipped creature deals combat damage, roll a d12. If the result is greater than the damage
  // dealt ...": the combat damage it dealt, all of it, the amount the trigger is about.
  const dealtAbove = /^(Whenever (?:~|equipped creature) deals combat damage), (roll a d\d+\. If the result is greater than) the damage dealt (or .+)$/.exec(line);
  if (dealtAbove) {
    const t = parseTrigger(`${dealtAbove[1]}, ${dealtAbove[2]} the damage this trigger is about ${dealtAbove[3]}`);
    return t && t !== "fail" && t.event === "selfDealsCombatDamage" ? t : "fail";
  }
  // Cartographer's Hawk: "When ~ deals combat damage to a player who controls more lands than you, ...": part of the
  // trigger event, checked as it triggers only (CR 603.2; no "if", so not again as it resolves, CR 603.4).
  const moreLands = /^(When(?:ever)? ~ deals combat damage to a player) who controls more lands than you, (.+)$/.exec(line);
  if (moreLands) {
    const t = parseTrigger(`${moreLands[1]}, ${moreLands[2]}`);
    return t && t !== "fail" && t.event === "selfDealsCombatDamageToPlayer" && !t.orBattle && !t.orPlaneswalker && !t.toOpponent ? { ...t, toMoreLands: true } : "fail";
  }
  // Jenova, Ancient Calamity: "Whenever a Mutant you control dies during your turn, ...": only during its controller's
  // turn, as it dies (CR 603.10a looks back to it).
  const diesOnYourTurn = /^(Whenever (?:an?|another) [^,]+? dies) during your turn, (.+)$/.exec(line);
  if (diesOnYourTurn) {
    const t = parseTrigger(`${diesOnYourTurn[1]}, ${diesOnYourTurn[2]}`);
    return t && t !== "fail" && t.event === "permanentDies" && !t.activeIf ? { ...t, activeIf: { kind: "yourTurn" } } : "fail";
  }
  // Foe-liage: "Whenever a land enters during your turn, ...": only during its controller's turn, as it enters.
  const entersOnYourTurn = /^(Whenever (?:an?|another) [^,]+? enters) during your turn, (.+)$/.exec(line);
  if (entersOnYourTurn) {
    const t = parseTrigger(`${entersOnYourTurn[1]}, ${entersOnYourTurn[2]}`);
    return t && t !== "fail" && t.event === "permanentEnters" && !t.activeIf ? { ...t, activeIf: { kind: "yourTurn" } } : "fail";
  }
  // Kefka, Ruler of Ruin: "Whenever an opponent loses life during your turn, you draw that many cards": it triggers only
  // during its controller's turn.
  // Zuko, Firebending Master: "Whenever you cast a spell during combat, ...": only while the game is in a combat phase
  // (CR 506.1), as the spell is cast.
  const castInCombat = /^Whenever you cast a spell during combat, (.+)$/.exec(line);
  if (castInCombat) {
    const t = parseTrigger(`Whenever you cast a spell, ${castInCombat[1]}`);
    return t && t !== "fail" && !t.activeIf ? { ...t, activeIf: { kind: "during", window: "combat" } } : "fail";
  }
  // The Blue Spirit: "Whenever a nontoken creature you control enters during combat, ...": only while the game is in a
  // combat phase (CR 506.1) as it enters.
  const entersInCombat = /^Whenever (an? [^,]+? you control) enters during combat, (.+)$/.exec(line);
  if (entersInCombat) {
    const t = parseTrigger(`Whenever ${entersInCombat[1]} enters, ${entersInCombat[2]}`);
    return t && t !== "fail" && t.event === "permanentEnters" && !t.activeIf ? { ...t, activeIf: { kind: "during", window: "combat" } } : "fail";
  }
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
  // Emberwilde Captain: "Whenever an opponent attacks you while you're the monarch, ...": a condition on the event, checked
  // as they attack only (rulings: it resolves as normal if someone else became the monarch meanwhile; attacking only your
  // planeswalkers doesn't trigger it).
  const attacksMonarch = /^Whenever an opponent attacks you while you're the monarch, (.+)$/.exec(line);
  if (attacksMonarch) {
    const t = parseTrigger(`Whenever an opponent attacks you, ${attacksMonarch[1]}`);
    return t && t !== "fail" && !t.activeIf ? { ...t, activeIf: { kind: "monarch" } } : "fail";
  }
  // The Watcher in the Water: "Whenever you draw a card during an opponent's turn, ...": a condition on the event, checked
  // as you draw (CR 603.2); every other player's turn is an opponent's here.
  const drawTheirTurn = /^Whenever you draw a card during an opponent's turn, (.+)$/.exec(line);
  if (drawTheirTurn) {
    const t = parseTrigger(`Whenever you draw a card, ${drawTheirTurn[1]}`);
    return t && t !== "fail" && !t.activeIf ? { ...t, activeIf: { kind: "yourTurn", not: true } } : "fail";
  }
  // "Whenever you get one or more {E}, ~ deals that much damage to any target" (Aether Revolt): "that much" is how many
  // you got; "during your turn" (Brotherhood Scribe) is a condition on the event.
  const energy = /^Whenever you get one or more \{E\}( during your turn)?, (.+)$/.exec(line);
  if (energy) {
    let text = energy[2]!;
    const thatMuch = /\bthat (?:much|many)\b/.test(text);
    if (thatMuch && /\bX\b/.test(text)) return "fail";
    if (thatMuch) text = text.replace(/\bthat (?:much|many)\b/g, "X");
    let body = parseBody(text, {});
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, energy[2]!) };
    return { event: "youGetEnergy", body, ...(energy[1] ? { activeIf: { kind: "yourTurn" as const } } : {}) };
  }
  // Voracious Tome-Skimmer: "Whenever you cast a spell during an opponent's turn, ...": the same, checked as you cast it.
  // Quirion Dryad: "Whenever you cast a spell that's white, blue, black, or red": a spell of any of those colors.
  const castThats = /^Whenever you cast a spell that's ((?:(?:white|blue|black|red|green), )+or (?:white|blue|black|red|green)), (.+)$/.exec(line);
  if (castThats) return parseTrigger(`Whenever you cast a ${castThats[1]} spell, ${castThats[2]}`);
  // Breath of the Sleepless: "Whenever you cast a creature spell during an opponent's turn", the same.
  const castTheirTurn = /^Whenever you cast (an? (?:(?:creature|noncreature|artifact|enchantment|instant|sorcery) )?spell) during an opponent's turn, (.+)$/.exec(line);
  if (castTheirTurn) {
    const t = parseTrigger(`Whenever you cast ${castTheirTurn[1]}, ${castTheirTurn[2]}`);
    return t && t !== "fail" && !t.activeIf ? { ...t, activeIf: { kind: "yourTurn", not: true } } : "fail";
  }
  // Ruby, Daring Tracker: "Whenever ~ attacks while you control a creature with power 4 or greater, ...": a condition on
  // the event, checked as it attacks only (rulings), not an intervening if.
  // Pugnacious Hammerskull: "while you don't control another Dinosaur", the same (rulings).
  // Burning Sun Cavalry: "Whenever ~ attacks or blocks while you control a Dinosaur", the same for both events.
  // The Chief Warg: "Ferocious — Whenever you attack while you control a creature with power 4 or greater, ...": the same,
  // for "whenever you attack".
  // Hand That Feeds (delirium): "Whenever ~ attacks while there are four or more card types among cards in your
  // graveyard", the same.
  const attacksWhile = /^Whenever (~ attacks|~ attacks or blocks|you attack) while (you (?:don't )?control .+?|there are (?:four|five|six) or more card types among cards in your graveyard), (.+)$/.exec(line);
  if (attacksWhile) {
    const cond = parseActivateCondition(attacksWhile[2]!);
    const t = cond && parseTrigger(`Whenever ${attacksWhile[1]}, ${attacksWhile[3]}`);
    return cond && t && t !== "fail" && !t.activeIf ? { ...t, activeIf: cond } : "fail";
  }
  // Social Snub: "When you cast ~ while you control a creature, you may copy ~": the same, checked as it's cast only (CR
  // 603.2), not again as the trigger resolves.
  const castWhile = /^When you cast ~ while (you control an? [a-z]+), (.+)$/.exec(line);
  if (castWhile) {
    const cond = parseActivateCondition(castWhile[1]!);
    const t = cond && parseTrigger(`When you cast ~, ${castWhile[2]}`);
    return cond && t && t !== "fail" && !t.activeIf ? { ...t, activeIf: cond } : "fail";
  }
  // Bristlebane Battler, Moonshadow: "Whenever ... while this creature has a -1/-1 counter on it, ...": a condition on the
  // event, checked as it happens only (CR 603.2), not an intervening if (CR 603.4).
  const whileCounter = /^(Whenever .+?) while ~ has an? ([+-]\d\/[+-]\d) counter on it, (.+)$/.exec(line);
  if (whileCounter) {
    const t = parseTrigger(`${whileCounter[1]}, ${whileCounter[3]}`);
    return t && t !== "fail" && !t.activeIf ? { ...t, activeIf: { kind: "selfCounter", counter: whileCounter[2] as CounterKind } } : "fail";
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
  // Faldorn: "Whenever you cast a spell from exile or a land you control enters from exile": the cast trigger, which a
  // land entering from exile under your control also triggers (played or put there, CR 603.6a).
  const landFromExile = /^Whenever you cast a spell from exile or a land you control enters from exile, (.+)$/.exec(line);
  if (landFromExile) {
    if (/\b(it|its|that card|that spell|that land)\b/.test(landFromExile[1]!)) return "fail";
    const t = parseTrigger(`Whenever you cast a spell from exile, ${landFromExile[1]}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.orCopy || t.ifCond || t.cast.from !== "exile") return "fail";
    return { ...t, cast: { ...t.cast, orLandEntersFromExile: true } };
  }
  // Fire Lord Zuko: "Whenever you cast a spell from exile and whenever a permanent you control enters from exile": two
  // trigger events for one ability (CR 603.2), the second a permanent put onto the battlefield or played from exile under
  // your control (CR 603.6a). The Lost and the Damned: "Whenever a land you control enters from anywhere other than your
  // hand or you cast a spell from anywhere other than your hand": the same with the land first.
  const permFromExile = /^Whenever you cast a spell from exile and whenever a permanent you control enters from exile, (.+)$/.exec(line);
  const landNotHand = /^Whenever a land you control enters from anywhere other than your hand or you cast a spell from anywhere other than your hand, (.+)$/.exec(line);
  if (permFromExile || landNotHand) {
    const rest = (permFromExile ?? landNotHand)![1]!;
    if (/\b(it|its|that card|that spell|that land|that permanent)\b/.test(rest)) return "fail";
    const t = parseTrigger(`Whenever you cast a spell from ${permFromExile ? "exile" : "anywhere other than your hand"}, ${rest}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.orCopy || t.ifCond || t.cast.from !== (permFromExile ? "exile" : "notHand")) return "fail";
    return { ...t, cast: { ...t.cast, ...(permFromExile ? { orPermanentEntersFromExile: true as const } : { orLandEntersNotFromHand: true as const }) } };
  }
  // Rendmaw, Creaking Nest: "whenever you play a card with two or more card types": a spell cast or a land played (CR
  // 305.1, 601.2) whose card has that many card types (CR 205.2a), as it was played.
  const playTypes = /^Whenever you play a card with (two|three) or more card types, (.+)$/.exec(line);
  if (playTypes) {
    if (/\b(it|its|that card|that spell)\b/.test(playTypes[2]!)) return "fail";
    const t = parseTrigger(`Whenever you cast a spell, ${playTypes[2]}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.orCopy || t.ifCond) return "fail";
    const minCardTypes = num(playTypes[1]!);
    const text = `card with ${playTypes[1]} or more card types`;
    return { ...t, cast: { ...t.cast, spell: { ...t.cast.spell, minCardTypes, text }, orPlaysLand: { kind: "object", types: ["Land"], notTypes: [], notColors: [], minCardTypes, text } } };
  }
  // Juju Bubble: "When you play a card, sacrifice ~": "when" and "whenever" are the same here (CR 603.1).
  const playM = /^When(?:ever)? you play (a card|a land( from exile)? or cast a spell|a legendary land or cast a legendary spell)( from exile| from anywhere other than your hand)?, (.+)$/.exec(line);
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
    // Farideh, Devil's Chosen: "... If any of those results was 10 or higher, draw a card.": the highest die of that roll.
    const anyOf = /^(.+?)\. If any of those results was (\d+) or higher, (.+)$/.exec(rolls[1]!);
    if (anyOf) {
      const first = parseBody(`${anyOf[1]}.`, {});
      const then = parseBody(anyOf[3]!, {});
      if (!first || !then || first.targets.length || then.targets.length) return "fail";
      return { event: "youRollDice", body: { targets: [], effects: [...first.effects, { type: "if", cond: { kind: "rollIn", min: Number(anyOf[2]), eventMax: true }, effects: then.effects }], text: rolls[1]! } };
    }
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
    // Mikey & Leo, Chaos & Order: "Whenever you put a counter on a creature you control, ...": the same. Ant-Man, Colony
    // Commander: "Whenever you put a +1/+1 counter on a creature" (any creature, of that kind): the same. Knight of
    // Wundagore: "on another creature" (anyone's, not ~): the same.
    // Cloaked Cadet: "Whenever one or more +1/+1 counters are put on one or more Humans you control": once for each Human
    // they're put on, only the first each turn doing anything (rulings: one card however many).
    const t = parseTrigger(once[1]!.replace(/^Whenever a counter is put on (a creature you control|another creature you control), /, "Whenever one or more counters are put on $1, ").replace(/^Whenever one or more (\+1\/\+1 )?counters are put on one or more ([A-Z][a-z]+)s you control, /, (x, k: string | undefined, type: string) => (CREATURE_TYPES.has(type) ? `Whenever one or more ${k ?? ""}counters are put on ${/^[AEIOU]/.test(type) ? "an" : "a"} ${type} you control, ` : x)).replace(/^Whenever you put a (\+1\/\+1 )?counter on (a creature you control|another creature you control|another creature|a creature), /, "Whenever you put one or more $1counters on $2, ").replace(/^Whenever you tap one or more untapped creatures your opponents control, /, "Whenever you tap an untapped creature an opponent controls, "));
    return t && t !== "fail" && !t.oncePerTurn && t.event !== "state" ? { ...t, oncePerTurn: true } : "fail";
  }
  // Acrobatic Cheerleader: "This ability triggers only once.": never again for this object, even if it's countered
  // (rulings).
  const onceEver = /^(.+?) This ability triggers only once\.$/.exec(line);
  if (onceEver) {
    const t = parseTrigger(onceEver[1]!);
    return t && t !== "fail" && !t.oncePerTurn && t.event !== "state" ? { ...t, onceEver: true } : "fail";
  }
  // Suki, Courageous Rescuer: "Whenever another permanent you control leaves the battlefield during your turn, ...": only
  // while you're the active player.
  const leavesYours = /^(Whenever (?:another|an?) [^,]+? leaves the battlefield) during your turn, (.+)$/.exec(line);
  if (leavesYours) {
    const t = parseTrigger(`${leavesYours[1]}, ${leavesYours[2]}`);
    return t && t !== "fail" && !t.activeIf ? { ...t, activeIf: { kind: "yourTurn" } } : "fail";
  }
  // Narci, Fable Singer; Tom Bombadil: "whenever the final chapter ability of a Saga you control resolves": the chapter
  // ability with the greatest chapter number its Saga has (rulings), once it has finished resolving and left the stack
  // (rulings); "that Saga's mana value" is the event's amount.
  // Historian's Boon: "Whenever the final chapter ability of a Saga you control triggers": as it triggers (CR 603.2), the
  // chapter ability with the greatest chapter number its Saga has (rulings), whether or not it resolves.
  const finalTriggers = /^Whenever the final chapter ability of a Saga you control triggers, (.+)$/.exec(line);
  if (finalTriggers) {
    if (/\b(that Saga|it|its|that ability)\b|\bX\b/.test(finalTriggers[1]!)) return "fail";
    const body = parseBody(capital(finalTriggers[1]!));
    return body ? { event: "youFinalChapterTriggers", body } : "fail";
  }
  // Aeon Chronicler: "Whenever a time counter is removed from ~ while it's exiled, ...": it works in exile (CR 113.6),
  // controlled by the card's owner (CR 113.8), once for each counter removed.
  // Riftmarked Knight: "When the last time counter is removed from ~ while it's exiled, ...": the same, for the last one.
  // Orcish Mine: "When the last ore counter is removed from ~, ...": as the permanent's last counter of that kind is
  // removed, by anything (CR 603.2, 122.1).
  const lastCounter = /^When the last ([a-z]+) counter is removed from ~, (.+)$/.exec(line);
  if (lastCounter && lastCounter[1] !== "time") {
    const body = parseBody(capital(lastCounter[2]!));
    return body ? { event: "selfLastCounterRemoved", countersKind: lastCounter[1]!, body } : "fail";
  }
  const timeExiled = /^(Whenever a|When the last) time counter is removed from ~ while it's exiled, (.+)$/.exec(line);
  if (timeExiled) {
    const body = parseBody(capital(timeExiled[2]!));
    return body ? { event: timeExiled[1] === "When the last" ? "selfLastTimeCounterRemovedExiled" : "selfTimeCounterRemovedExiled", zone: "exile", body } : "fail";
  }
  // Curator of Sun's Creation: "Whenever you discover, discover again for the same value": the value of the discover that
  // triggered it (CR 701.57a; you discover once the whole process is done, rulings).
  if (/^Whenever you discover, discover again for the same value\.?$/.test(line)) return { event: "youDiscover", body: { targets: [], effects: [{ type: "discover", n: { count: { kind: "eventAmount" } } }], text: "Discover again for the same value." } };
  const finalChapter = /^Whenever the final chapter ability of a Saga you control resolves, (.+?)(, where X is that Saga's mana value)?\.$/.exec(line);
  if (finalChapter) {
    if (/\bthat Saga\b/.test(finalChapter[1]!) || /\bX\b/.test(finalChapter[1]!) !== !!finalChapter[2]) return "fail";
    const body0 = parseBody(`${capital(finalChapter[1]!)}.`);
    if (!body0) return "fail";
    const body = finalChapter[2] ? { ...replaceX(body0, { count: { kind: "eventAmount" } }), text: line.replace(/^[^,]+, /, "") } : body0;
    return { event: "youFinalChapterResolves", body };
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
  // Righteous Authority: "At the beginning of the draw step of enchanted creature's controller, that player draws an
  // additional card": a trigger, so they just draw one more.
  // Numbing Dose: "enchanted permanent's controller"; Feedback: "enchanted enchantment's controller": the same, whatever
  // the Aura enchants. Power Leak's "Prevent X of that damage" is about the damage, not a permanent.
  const hostUpkeep = /^At the beginning of the (upkeep|draw step|end step) of (enchanted|equipped) (creature|permanent|enchantment|artifact|land)'s controller, (.+)$/.exec(line);
  // Erosion: "destroy that land unless that player pays {1} or 1 life"; Curse Artifact: "unless they sacrifice that
  // artifact": that one is the enchanted one.
  const hostWord = hostUpkeep?.[3];
  const hostRest = hostUpkeep && hostWord !== "creature" && hostWord !== "permanent" ? hostUpkeep[4]!.replace(new RegExp(`\\bthat ${hostWord}\\b`, "g"), `${hostUpkeep[2]} ${hostWord}`) : hostUpkeep?.[4];
  if (hostUpkeep && (hostUpkeep[3] === "creature" || (hostUpkeep[2] === "enchanted" && !/\bthat \w+\b/.test(hostRest!.replace(/\bthat (?:player|damage)\b/g, ""))))) {
    const t = parseTrigger(`At the beginning of each player's ${hostUpkeep[1]}, ${hostRest!.replace(/\bthat creature\b/g, `${hostUpkeep[2]} creature`).replace(/^that player draws an additional card\.$/, "that player draws a card.")}`);
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
  // "Whenever ~ and at least one other creature attack" (Sokka, Lateral Strategist).
  // Paired Tactician: "Whenever ~ and at least one other Warrior attack": the same.
  const battalion = /^Whenever ~ and at least (one|two|three) (other creatures?|other creature tokens?|[A-Z][a-z]+|other [A-Z][a-z]+) attack, (.+)$/.exec(line);
  if (battalion) {
    battalion[2] = battalion[2]!.replace(/^other (?=[A-Z])/, "");
    const tokens = /^other creature tokens?$/.test(battalion[2]!);
    if (tokens) return ((t) => (t && t !== "fail" ? { ...t, withOthers: num(battalion[1]!), withOthersToken: true as const } : "fail"))(parseTrigger(`Whenever ~ attacks, ${battalion[3]}`));
    // Enkira, Hostile Scavenger: "and at least two Zombies attack": the plural after two or three.
    const plural = battalion[1] !== "one";
    const typeWord = /^other creatures?$/.test(battalion[2]!) ? undefined : battalion[2]!;
    if (typeWord && plural && singular(typeWord) === typeWord) return "fail";
    const type = typeWord && plural ? singular(typeWord) : typeWord;
    if (type && !CREATURE_TYPES.has(type)) return "fail";
    const t = parseTrigger(`Whenever ~ attacks, ${battalion[3]}`);
    return t && t !== "fail" ? { ...t, withOthers: num(battalion[1]!), ...(type ? { withOthersType: type } : {}) } : "fail";
  }
  // Creepy Puppeteer (TriggeredAbility.oneOtherAttacker): "you may have that creature's base power and toughness become
  // 4/3 until end of turn" is a may (CR 603.5), a P/T-setting effect in layer 7b until the cleanup step.
  const puppet = /^Whenever ~ attacks, if you attacked with exactly one other creature this combat, you may have that creature's base power and toughness become (\d+)\/(\d+) until end of turn\.?$/.exec(line);
  if (puppet) {
    const inner = parseBody(`That creature has base power and toughness ${puppet[1]}/${puppet[2]} until end of turn.`, { subject: true });
    if (!inner || inner.targets.length) return "fail";
    const text = `you may have that creature's base power and toughness become ${puppet[1]}/${puppet[2]} until end of turn.`;
    return { event: "selfAttacks", oneOtherAttacker: true, body: { targets: [], effects: [{ type: "may", effects: inner.effects, text }], text } };
  }
  // Canal Courier: "Whenever ~ and another creature attack different players" (TriggeredAbility.othersAtAnotherPlayer).
  const apart = /^Whenever ~ and another creature attack different players, (.+)$/.exec(line);
  if (apart) {
    const t = parseTrigger(`Whenever ~ attacks, ${apart[1]}`);
    return t && t !== "fail" && t.event === "selfAttacks" && !t.host ? { ...t, othersAtAnotherPlayer: true } : "fail";
  }
  // Glimmer Lens: "Whenever equipped creature and at least one other creature attack, draw a card": the equipped
  // creature attacking with others, as attackers are declared (CR 508.1, 508.3a).
  const hostBattalion = /^Whenever equipped creature and at least (one|two) other creatures? attack, (.+)$/.exec(line);
  if (hostBattalion) {
    const t = parseTrigger(`Whenever equipped creature attacks, ${hostBattalion[2]}`);
    return t && t !== "fail" && t.host === "attached" ? { ...t, withOthers: num(hostBattalion[1]!) } : "fail";
  }
  // Ironsoul Enforcer: "Whenever ~ or a commander you control attacks alone": either one, the only creature declared as an
  // attacker (CR 506.5).
  const selfOrCmdAlone = /^Whenever ~ or a commander you control attacks alone, (?!if )(.+)$/.exec(line);
  if (selfOrCmdAlone) {
    if (/\b(?:it|its|that creature)\b/.test(selfOrCmdAlone[1]!)) return "fail";
    const body = parseBody(selfOrCmdAlone[1]!, { defending: true });
    return body ? { event: "creatureYouControlAttacksAlone", body, subjectFilter: { kind: "object", types: ["Creature"], commander: true, text: "commander you control" }, subjectOrSelf: true } : "fail";
  }
  // Yuriko, Blade of the Mighty and Jiang Yanggu, Alone: "Whenever a creature you control attacks a player alone": no other
  // creature was declared as an attacker attacking that player; attackers of their planeswalkers or battles, or of other
  // players, don't count (rulings, CR 506.5, 508.1). That creature is the subject, the player it attacks "that player".
  const playerAlone = /^Whenever an? (.+?) you control attacks a player alone, (?!if )(.+)$/.exec(line);
  if (playerAlone) {
    const filter = playerAlone[1] === "creature" ? undefined : parseTargetPhrase(playerAlone[1]!);
    if (filter === null || (filter && filter.kind !== "object")) return "fail";
    const body = parseBody(playerAlone[2]!, { subjectIt: true, defending: true });
    return body ? { event: "creatureYouControlAttacksPlayerAlone", body, ...(filter ? { subjectFilter: { ...filter, text: playerAlone[1]! } } : {}) } : "fail";
  }
  // "Whenever a creature you control attacks alone" (exalted's event, CR 702.83a, 506.5): that creature is the subject.
  const alone = /^Whenever an? (.+?) you control attacks alone, (?!if )(.+)$/.exec(line);
  if (alone) {
    const filter = alone[1] === "creature" ? undefined : parseTargetPhrase(alone[1]!);
    if (filter === null || (filter && filter.kind !== "object")) return "fail";
    const body = parseBody(alone[2]!, { subjectIt: true, defending: true });
    return body ? { event: "creatureYouControlAttacksAlone", body, ...(filter ? { subjectFilter: { ...filter, text: alone[1]! } } : {}) } : "fail";
  }
  // Weatherseed Totem: "When ~ is put into a graveyard from the battlefield, if it was a creature, return ~ to its owner's
  // hand": a creature put into a graveyard from the battlefield is what dies (CR 700.4), and what it was can't change.
  const wasCreature = /^When ~ is put into a graveyard from the battlefield, if it was a creature, (return ~ to its owner's hand\.)$/.exec(line);
  if (wasCreature) return parseTrigger(`When ~ dies, ${wasCreature[1]}`);
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
  // Deep-Sea Kraken: "Whenever an opponent casts a spell, if ~ is suspended, remove a time counter from it"; Pardic Dragon:
  // "..., that player may put a time counter on ~". An ability that works while the card is suspended in exile (CR 113.6,
  // 702.62b), its owner controlling it (CR 113.8), with an intervening if (CR 603.4). "It" is the card: a spell can't have
  // a time counter put on it or removed.
  const suspendedIf = /^(Whenever (?:a player|an opponent|you) casts? a spell), if ~ is suspended, (.+)$/.exec(line);
  if (suspendedIf) {
    const t = parseTrigger(`${suspendedIf[1]}, ${suspendedIf[2]!.replace(/ time counter from it\.$/, " time counter from ~.")}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.zone || t.ifCond || t.cast.orCopy) return "fail";
    // The card in exile ("selfCard"), not a permanent: only removing a time counter from it is modeled.
    const fx = t.body.effects;
    if (fx.length !== 1 || fx[0]!.type !== "removeCounters" || fx[0]!.what.ref !== "self" || fx[0]!.counter !== "time") return "fail";
    return { ...t, zone: "exile", ifCond: { kind: "selfSuspended" }, body: { ...t.body, effects: [{ ...fx[0]!, what: { ref: "selfCard" } }] } };
  }
  // Oloro, Ageless Ascetic: "At the beginning of your upkeep, if ~ is in the command zone, you gain 2 life." An ability
  // that works only in the command zone (CR 113.6), with an intervening if (CR 603.4).
  const inCommand = /^((?:When|Whenever|At)\b[^,]+), if ~ is in the command zone, (.+)$/.exec(line);
  if (inCommand) {
    const t = parseTrigger(`${inCommand[1]}, ${inCommand[2]}`);
    if (!t || t === "fail" || t.zone || t.ifCond || t.host || /^(?:When|Whenever) ~ /.test(inCommand[1]!)) return "fail";
    return { ...t, eminence: true, ifCond: { kind: "selfInCommand" as const } };
  }
  // Senu: "When a legendary creature you control attacks and isn't blocked, if this card is exiled, put it onto the
  // battlefield attacking." An ability of the face-up card in exile (CR 113.6k), controlled by its owner (CR 113.8),
  // with an intervening if (CR 603.4). It was never declared as an attacker (CR 508.4; rulings).
  const exiledAttack = /^When(?:ever)? (an? (.+?) you control) attacks and isn't blocked, if (?:this card|~) is exiled, put it onto the battlefield attacking\.$/.exec(line);
  if (exiledAttack) {
    const filter = parseTargetPhrase(exiledAttack[2]!);
    if (!filter || filter.kind !== "object" || !filter.types?.includes("Creature")) return "fail";
    const text = "put it onto the battlefield attacking";
    return { event: "creatureYouControlAttacksUnblocked", zone: "exile", ifCond: { kind: "selfInExile" }, attacker: { filter: { ...filter, controller: "you", text: exiledAttack[1]!.replace(/^an? /, "") } }, body: { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attacking: true }], text } };
  }
  // "At the beginning of your upkeep, if ~ is in your graveyard, you may pay {1}{B}{B}. If you do, return it to your hand"
  // (Pyre Zombie), "... with a creature card directly above it" (Krovikan Horror, Death Spark), "you may discard a card. If
  // you do, ..." (Gigapede): an ability of the card
  // in the graveyard (CR 113.6b) with an intervening if (CR 603.4), so it does nothing if the card has left by then
  // (nothing is paid). "Directly above" is the next card put there after it (rulings; see graveyard.ts).
  const inYard = /^(At the beginning of [^,]+), if ~ is in your graveyard( with a creature card directly above it)?, ((?:you may )?(?:(?:pay [^.]+|discard a card)\. If you do, )?)return (?:~|it) to your hand\.$/.exec(line);
  if (inYard) {
    const t = parseTrigger(`${inYard[1]}, ${inYard[3]}return ~ from your graveyard to your hand.`);
    if (!t || t === "fail" || t.zone !== "graveyard" || t.ifCond) return "fail";
    return { ...t, ifCond: { kind: "selfInGraveyard", ...(inYard[2] ? { creatureAbove: true as const } : {}) } };
  }
  // Nether Spirit: "At the beginning of your upkeep, if ~ is the only creature card in your graveyard, you may return ~ to
  // the battlefield": an ability of the card in the graveyard (CR 113.6b) with an intervening if (CR 603.4): it doesn't
  // trigger, or does nothing, while another creature card is there (rulings).
  if (/^At the beginning of your upkeep, if ~ is the only creature card in your graveyard, you may return ~ to the battlefield\.$/.test(line)) {
    const t = parseTrigger("At the beginning of your upkeep, you may return ~ from your graveyard to the battlefield.");
    if (!t || t === "fail" || t.zone !== "graveyard" || t.ifCond) return "fail";
    return { ...t, ifCond: { kind: "selfInGraveyard", onlyCreature: true } };
  }
  // "At the beginning of your upkeep, if ~ is in your graveyard, you may pay {2}{G}. If you do, return target creature
  // card from your graveyard to your hand." (Genesis): the same, about other cards; its target may be the card itself.
  const inYardOther = /^(At the beginning of your upkeep), if ~ is in your graveyard, (.+)$/.exec(line);
  if (inYardOther && !/~|\bit\b/.test(inYardOther[2]!)) {
    const t = parseTrigger(`${inYardOther[1]}, ${inYardOther[2]}`);
    if (!t || t === "fail" || t.zone || t.ifCond || t.host) return "fail";
    return { ...t, zone: "graveyard", ifCond: { kind: "selfInGraveyard" } };
  }
  // Pyrewild Shaman: "Whenever one or more creatures you control deal combat damage to a player, if ~ is in your graveyard,
  // you may pay {3}. If you do, return ~ to your hand", Moss-Pit Skeleton: "..., you may put ~ on top of your library": an
  // ability that works only there (below), with an intervening if (CR 603.4), so nothing is paid once it has left.
  // Thunderblade Charge: "..., you may pay {2}{R}{R}{R}. If you do, you may cast it without paying its mana cost": first the
  // payment, then whether to cast it (rulings), from the graveyard as it resolves (CR 608.2g).
  const inYardWhen = /^((?:When|Whenever)\b[^,]+), if ~ is in your graveyard, ((?:you may )?(?:pay [^.]+\. If you do, )?)(return ~ to your hand|put ~ on top of your library|you may cast (?:it|~) without paying its mana cost)\.$/.exec(line);
  if (inYardWhen && !/^(?:When|Whenever) ~ /.test(inYardWhen[1]!)) {
    const cast = /^you may cast/.test(inYardWhen[3]!);
    if (cast && !/^you may pay [^.]+\. If you do, $/.test(inYardWhen[2]!)) return "fail";
    const what = inYardWhen[3] === "put ~ on top of your library" ? "put ~ from your graveyard on top of your library" : "return ~ from your graveyard to your hand";
    const t = parseTrigger(`${inYardWhen[1]}, ${inYardWhen[2]}${what}.`);
    if (!t || t === "fail" || t.zone !== "graveyard" || t.ifCond) return "fail";
    if (cast) {
      const inner = t.body.effects.length === 1 && t.body.effects[0]!.type === "may" ? t.body.effects[0]! : undefined;
      if (inner?.type !== "may" || inner.effects.length !== 1 || inner.effects[0]!.type !== "bounce") return "fail";
      const text = `${inYardWhen[2]}${inYardWhen[3]}`;
      return { ...t, body: { ...t.body, effects: [{ ...inner, effects: [{ type: "castSelfFree" }], text: text.replace(/^you may /, "") }], text: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` }, ifCond: { kind: "selfInGraveyard" } };
    }
    return { ...t, ifCond: { kind: "selfInGraveyard" } };
  }
  // Bridge from Below: "Whenever a nontoken creature is put into your graveyard from the battlefield, if ~ is in your
  // graveyard, create a 2/2 black Zombie creature token", "When a creature is put into an opponent's graveyard from the
  // battlefield, if ~ is in your graveyard, exile ~": abilities that work only there (CR 113.6m), with an intervening if
  // (CR 603.4), so no token once it has left (rulings); not a card dying at the same time (CR 603.10a, triggers.ts).
  const inYardDo = /^((?:When|Whenever)\b[^,]+), if ~ is in your graveyard, (create [^.~]+ tokens?|exile ~)\.$/.exec(line);
  if (inYardDo && !/^(?:When|Whenever) ~ /.test(inYardDo[1]!)) {
    const exileSelf = inYardDo[2] === "exile ~";
    const t = parseTrigger(`${inYardDo[1]}, ${exileSelf ? "draw a card" : inYardDo[2]}.`);
    if (!t || t === "fail" || t.zone || t.ifCond || t.host || t.body.effects.length !== 1) return "fail";
    const body = exileSelf ? { targets: [], effects: [{ type: "exile" as const, what: { ref: "selfCard" as const } }], text: "exile ~." } : t.body;
    return { ...t, body, zone: "graveyard", ifCond: { kind: "selfInGraveyard" } };
  }
  // Vengeful Pharaoh: "Whenever combat damage is dealt to you or a planeswalker you control, if ~ is in your graveyard,
  // destroy target attacking creature, then put ~ on top of your library": an ability that works only in the graveyard
  // with an intervening if (CR 603.4); once for you and once for each planeswalker dealt combat damage (rulings).
  const pharaoh = /^Whenever combat damage is dealt to you or a planeswalker you control, if ~ is in your graveyard, (destroy target attacking creature), then put ~ on top of your library\.$/.exec(line);
  if (pharaoh) {
    const body = parseBody(`${capital(pharaoh[1]!)}, then put ~ from your graveyard on top of your library.`, { selfCard: true });
    return body ? { event: "combatDamageToYouOrYourPlaneswalker", body, zone: "graveyard", ifCond: { kind: "selfInGraveyard" } } : "fail";
  }
  // Infesting Radroach: "Whenever an opponent mills a nonland card, if ~ is in your graveyard, you may return it to your
  // hand": the same as "you may return ~ from your graveyard to your hand" below, an ability that works only there.
  const inYardReturn = /^(Whenever an opponent mills [^,]+), if ~ is in your graveyard, you may return it to your hand\.$/.exec(line);
  if (inYardReturn) {
    const t = parseTrigger(`${inYardReturn[1]}, you may return ~ from your graveyard to your hand.`);
    return t && t !== "fail" && t.zone === "graveyard" && t.event === "batch" && t.batch?.milled ? t : "fail";
  }
  // Prized Amalgam: works only in the graveyard (CR 113.6m), with an intervening if about the creature that entered (CR
  // 603.4); the delayed trigger returns this card only if it's still there, the same object (rulings, CR 400.7).
  if (line === "Whenever a creature enters, if it entered from your graveyard or you cast it from your graveyard, return ~ from your graveyard to the battlefield tapped at the beginning of the next end step.") {
    const t = parseTrigger("Whenever a creature enters, draw a card.");
    if (!t || t === "fail" || t.event !== "permanentEnters") return "fail";
    const text = "return ~ from your graveyard to the battlefield tapped at the beginning of the next end step.";
    return { ...t, zone: "graveyard", ifCond: { kind: "subjectFromYourGraveyard" }, body: { targets: [], effects: [{ type: "delayed", when: "nextEndStep", each: "selfCard", effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard" }, tapped: true }], text: "return ~ from your graveyard to the battlefield tapped" }], text } };
  }
  // "Whenever you cast a multicolored spell, you may return ~ from your graveyard to your hand": the effect moves the
  // card out of the graveyard, so the ability works only there (CR 113.6m). Only that one sentence: anything after it
  // would be about the card in its new zone. A trigger about ~ itself can't happen while it's in a graveyard.
  // "... to the battlefield. It gains haste until end of turn." (Bloodfeather Phoenix): the card it returned.
  // Persistent Marshstalker: "... to the battlefield tapped and attacking" after "whenever you attack" (CR 508.4).
  // Gate Colossus: "you may put ~ from your graveyard on top of your library", the same.
  // Old One Eye: "you may discard two cards. If you do, ...": only with two cards in hand (see canDoNow).
  // Akuta, Born of Ash: "you may sacrifice a Swamp. If you do, return ~ from your graveyard to the battlefield".
  const yard = /^((?:When|Whenever|At)\b.+?), ((?:you may )?(?:(?:pay [^.]+|discard (?:a card|two cards)|sacrifice an? [A-Z][a-z]+)\. If you do, )?(?:return ~ from your graveyard to (?:your hand|the battlefield(?: tapped(?: and attacking)?(?: with a \+1\/\+1 counter on it)?| attached to that creature|, then attach it to that creature)?(?:\. It gains haste until end of turn)?)|put ~ from your graveyard on top of your library))\.$/.exec(line);
  // An Aura's "when enchanted creature dies, return ~ from your graveyard" (Screams from Within) is its battlefield trigger;
  // so is "When enchanted land is put into a graveyard" (Genju of the Realm).
  if (yard && !/^(When|Whenever) ~ /.test(yard[1]!) && !/^When enchanted (?:creature|land|artifact|permanent) (?:dies|is put into a graveyard)$/.test(yard[1]!)) {
    const t = parseTrigger(`${yard[1]}, draw a card.`);
    if (!t || t === "fail" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "draw" || t.body.targets.length) return "fail";
    // A milled-cards batch (Infesting Radroach) is watched from graveyards too (see the batch event in effects/triggers.ts).
    // Centaur Vinecrasher: "Whenever a land card is put into a graveyard from anywhere": also watched from graveyards, even
    // by a card put there in the same event (rulings).
    // Afterburner Expert: an exhaust ability activated is watched from graveyards too (see the activated event).
    // Erebos's Titan: "Whenever a creature card leaves an opponent's graveyard" from its owner's graveyard (rulings: only
    // there); not one that leaves with the player who leaves the game (their cards don't move, CR 800.4a).
    if ((!YARD_EVENTS.includes(t.event) && !(t.event === "abilityActivated" && t.activates?.exhaust && t.activates.by === "you") && !(t.event === "batch" && (t.batch?.milled || (t.batch?.what === "toGraveyard" && !t.batch.first && !t.batch.whose) || (t.batch?.what === "leavesGraveyard" && t.batch.whose === "opponent")) && t.batch.each)) || t.host) return "fail";
    // "Attached to that creature": the entering creature, the trigger's subject.
    // Sword of the Meek: "..., then attach it to that creature": it returns even if it can't be attached (rulings).
    const attach = / attached to that creature$|, then attach it to that creature$/.test(yard[2]!);
    // "When a Ninja you control enters" (Smoke Shroud): a creature type means a creature.
    const creature = (f: TargetSpec | undefined) => !!f && (!!f.types?.includes("Creature") || (!f.types?.length && !!f.subtypes?.length && f.subtypes.every((x) => CREATURE_TYPES.has(x))));
    if (attach && !(t.event === "permanentEnters" && creature(t.enters?.filter)) && t.event !== "anotherCreatureYouControlEnters") return "fail";
    const body = parseBody(`${yard[2]![0]!.toUpperCase()}${yard[2]!.slice(1)}.`, { selfCard: true, ...(attach ? { subject: true } : {}) });
    return body ? { ...t, body, zone: "graveyard" } : "fail";
  }
  // Kozilek's Return, Ugin's Binding: "Whenever you cast a colorless spell with mana value 7 or greater, you may exile
  // ~ from your graveyard. If you do (When you do), ...": the cost moves the card out of the graveyard, so the ability
  // works only there (CR 113.6m); it triggers only if the card is in your graveyard as you cast the spell (rulings).
  const yardExile = /^((?:When|Whenever)\b.+?), (you may exile ~ from your graveyard\. (?:If|When) you do, .+)$/.exec(line);
  if (yardExile && !/^(When|Whenever) ~ /.test(yardExile[1]!)) {
    const t = parseTrigger(`${yardExile[1]}, draw a card.`);
    if (!t || t === "fail" || t.event !== "castSpell" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "draw" || t.body.targets.length || t.host || t.zone || t.ifCond) return "fail";
    const body = parseBody(`${yardExile[2]![0]!.toUpperCase()}${yardExile[2]!.slice(1)}`, { selfCard: true });
    return body ? { ...t, body, zone: "graveyard" } : "fail";
  }
  // "Whenever the Ring tempts you" (CR 701.54d). "If you chose a creature other than ~ as your Ring-bearer" is an
  // intervening if (CR 603.4) about the choice just made, so it can't change by the time it resolves.
  // Ringwraiths: "When the Ring tempts you" triggers each time, as "whenever" does (CR 603.2).
  const ring = /^When(?:ever)? the Ring tempts you, (if you chose a creature other than ~ as your Ring-bearer, )?(.+)$/.exec(line);
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
  // Syr Carah, the Bold: "Whenever ~ or an instant or sorcery spell you control deals damage to a player": any player (you
  // too), once for each player dealt damage (rulings), by ~ itself (combat or not) or by such a spell.
  const selfOrSpell = /^Whenever ~ or an? (.+? spell) you control deals damage to a player, (.+)$/.exec(line);
  if (selfOrSpell) {
    const filter = parseTargetPhrase(selfOrSpell[1]!);
    const body = filter?.kind === "spell" && !filter.controller ? parseBody(`${selfOrSpell[2]![0]!.toUpperCase()}${selfOrSpell[2]!.slice(1)}`) : null;
    return body ? { event: "spellYouControlDealsDamage", spellDamage: { filter: filter!, anyPlayer: true, orSelf: true }, body } : "fail";
  }
  // "Whenever an instant or sorcery spell you control deals damage to an opponent or battle" (Bloodfeather Phoenix).
  const spellDmg = /^Whenever an? (.+? spell) you control deals damage to an opponent( or battle)?, (.+)$/.exec(line);
  if (spellDmg) {
    const filter = parseTargetPhrase(spellDmg[1]!);
    const body = filter?.kind === "spell" && !filter.controller ? parseBody(`${spellDmg[3]![0]!.toUpperCase()}${spellDmg[3]!.slice(1)}`) : null;
    return body ? { event: "spellYouControlDealsDamage", spellDamage: { filter: filter!, ...(spellDmg[2] ? { orBattle: true as const } : {}) }, body } : "fail";
  }
  // Verity Circle: "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker":
  // not tapped as it attacks (CR 508.1f). As it resolves, nothing is being declared as an attacker, so only as it triggers.
  const notAttack = /^(Whenever an? [^,]+ becomes tapped), if it isn't being declared as an attacker, (.+)$/.exec(line);
  if (notAttack) {
    const t = parseTrigger(`${notAttack[1]}, ${notAttack[2]}`);
    return t && t !== "fail" && t.event === "permanentBecomesTapped" ? { ...t, notDeclaringAttack: true } : "fail";
  }
  // Lolth, Spider Queen's emblem: "Whenever an opponent is dealt combat damage by one or more creatures you control, if
  // that player lost less than 8 life this turn, they lose life equal to the difference": once for each opponent, after
  // all the combat damage is dealt (CR 510.2, 603.2c); the life lost counts every way they lost life this turn, that
  // damage included (CR 119.3), as it triggers and again as it resolves (CR 603.4).
  const lolth = /^Whenever an opponent is dealt combat damage by one or more creatures you control, if that player lost less than (\w+) life this turn, they lose life equal to the difference\.?$/.exec(line);
  if (lolth) {
    const n = num(lolth[1]!);
    const t = parseTrigger("Whenever one or more creatures you control deal combat damage to an opponent, that player loses 1 life.");
    if (!t || t === "fail" || !n) return "fail";
    const lost = { count: { kind: "lifeLostThisTurn", who: { ref: "eventPlayer" } }, times: -1, plus: n } as const;
    return { ...t, body: { targets: [], effects: [{ type: "loseLife", who: { ref: "eventPlayer" }, n: lost }], text: `that player loses life equal to the difference between ${n} and the life they lost this turn.` }, ifCond: { kind: "eventPlayerLifeLost", max: n - 1 } };
  }
  // "When this Equipment enters, if it was cast from your graveyard, ..." (Rocket-Powered Goblin Glider): the same kind of
  // intervening if, a spell cast from its owner's graveyard by that player.
  const castYard = /^(When ~ enters), if (?:it|~) was cast from your graveyard, (.+)$/.exec(line);
  if (castYard) {
    const t = parseTrigger(`${castYard[1]!}, ${castYard[2]!}`);
    return !t || t === "fail" || t.event !== "selfEnters" || t.ifFromGraveyard ? "fail" : { ...t, ifFromGraveyard: "castYours" };
  }
  // Hulkling, Burgeoning Bruiser: "Whenever another creature you control enters, if it has greater power or toughness than
  // ~, put a +1/+1 counter on ~.": evolve's words (CR 702.100a), checked as it triggers and resolves (CR 603.4), but not
  // evolve, so ~ doesn't "evolve" (CR 702.100b).
  // Evolving Adaptive: "if that creature has greater power or toughness than ~, put an oil counter on ~": the same check, an
  // oil counter.
  const evolveLike = /^Whenever another creature you control enters, if (?:it|that creature) has greater power or toughness than ~, put an? (\+1\/\+1|oil) counter on ~\.?$/.exec(line);
  if (evolveLike) {
    return { event: "anotherCreatureYouControlEnters", ifEvolves: true, body: { targets: [], effects: [{ type: "evolve", notKeyword: true, ...(evolveLike[1] === "oil" ? { counter: "oil" as const } : {}) }], text: line } };
  }
  // Ray of Frost: "When this Aura enters, if enchanted creature is red, tap it.": "it" is that creature.
  if (/^When ~ enters, if enchanted creature is (?:white|blue|black|red|green), tap it\.?$/.test(line)) {
    const t = parseTrigger(line.replace(/tap it(\.?)$/, "tap enchanted creature$1"));
    return t && t !== "fail" && t.ifCond?.kind === "attachedIs" ? t : "fail";
  }
  // Mongrel Pack: "When ~ dies during combat, ...": only a death during a combat phase (CR 506.1).
  const diesCombat = /^When ~ dies during combat, (.+)$/.exec(line);
  if (diesCombat) {
    const t = parseTrigger(`When ~ dies, ${diesCombat[1]!}`);
    return !t || t === "fail" || t.event !== "selfDies" ? "fail" : { ...t, ifDiesInCombat: true };
  }
  // Rose Noble: "Whenever you cast a Doctor spell or creature spell with doctor's companion": a spell that's either.
  const doctorOr = /^Whenever you cast a Doctor spell or creature spell with doctor's companion, (.+)$/.exec(line);
  if (doctorOr) {
    const t = parseTrigger(`Whenever you cast a Doctor spell, ${doctorOr[1]!}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast?.spell) return "fail";
    const spell: TargetSpec = { kind: "spell", anyOf: [t.cast.spell, { kind: "spell", types: ["Creature"], keywords: ["Doctor's companion"], text: "creature spell with doctor's companion" }], text: "Doctor spell or creature spell with doctor's companion" };
    return { ...t, cast: { ...t.cast, spell } };
  }
  // Maze's Mantle: "When this Aura enters, if enchanted creature has toxic, that creature gains hexproof until end of turn.":
  // "that creature" is the enchanted creature.
  if (/^When ~ enters, if enchanted creature has toxic, that creature gains /.test(line)) {
    const t = parseTrigger(line.replace(/, that creature gains /, ", enchanted creature gains "));
    return t && t !== "fail" && t.ifCond?.kind === "attachedIs" ? t : "fail";
  }
  // Volition Reins: "When this Aura enters, if enchanted permanent is tapped, untap it.": "it" is that permanent.
  if (/^When ~ enters, if enchanted permanent is tapped, untap it\.?$/.test(line)) {
    const t = parseTrigger(line.replace(/untap it(\.?)$/, "untap enchanted permanent$1"));
    return t && t !== "fail" && t.ifCond?.kind === "attachedIs" ? t : "fail";
  }
  // Codespell Cleric: "When ~ enters, if it was the second spell you cast this turn": ~ as the spell it was, as it
  // triggers and resolves (CR 603.4); a permanent that wasn't cast was no spell.
  const castNth = /^(When ~ enters), if it was the (second|third|fourth) spell you cast this turn, (.+)$/.exec(line);
  if (castNth) {
    const t = parseTrigger(`${castNth[1]!}, ${castNth[3]!}`);
    return !t || t === "fail" || t.event !== "selfEnters" || t.ifCond ? "fail" : { ...t, ifCond: { kind: "selfCastNth", n: { second: 2, third: 3, fourth: 4 }[castNth[2] as "second"] } };
  }
  // "Whenever ~ or another creature you control enters, if it entered from your graveyard or you cast it from your
  // graveyard, ..." (Grist, Voracious Larva; Prized Amalgam): how it entered can't change, so the intervening if (CR
  // 603.4) is part of the event: put onto the battlefield from its owner's graveyard, or a spell its owner cast from there.
  // Breathless Knight: "if that creature entered from a graveyard or you cast it from a graveyard": any graveyard.
  const yardOrCast = /^(When(?:ever)? .+? enters), if it entered from your graveyard or you cast it from your graveyard, (.+)$/.exec(line) ?? /^(When(?:ever)? .+? enters), if that creature entered from (a) graveyard or you cast it from a graveyard, (.+)$/.exec(line)?.filter((_, i) => i !== 2);
  if (yardOrCast) {
    const any = / from a graveyard or you cast it from a graveyard, /.test(line);
    const t = parseTrigger(`${yardOrCast[1]!}, ${yardOrCast[2]!}`);
    return !t || t === "fail" || (t.event !== "selfEnters" && t.event !== "permanentEnters") || t.ifFromGraveyard ? "fail" : { ...t, ifFromGraveyard: any ? "anyOrCast" : "yoursOrCast" };
  }
  // "When ~ enters, if you attacked this turn, ...": an intervening "if" (CR 603.4) about the game. It's
  // checked as the ability would trigger and again as it resolves, so it can't be an ordinary effect.
  // Urborg Stalker: "if that player controls a nonblack, nonland permanent", Chrome Replicator: "if you control two or more
  // nonland, nontoken permanents with ...": each one both, the comma no clause break.
  // Sarulf, Realm Eater: "if ~ has one or more +1/+1 counters on it, you may remove all of them": its +1/+1 counters.
  // Tunnel Ignus: "Whenever a land enters under an opponent's control, if that player had another land enter ...": the
  // same as "a land an opponent controls enters" (Confounding Conundrum below).
  // Lightning Coils: "if ~ has five or more charge counters on it, remove all of them from it and create that many 3/1 red
  // Elemental creature tokens with haste": all its charge counters, and a token for each one removed this way.
  const removeAndCreate = line.replace(/^(At the beginning of your upkeep, if ~ has \w+ or more ([a-z]+) counters on it), remove all of them from it and create that many (.+?) tokens( with [a-z ]+)?\./, (_, head: string, kind: string, token: string, rest: string | undefined) => `${head}, remove all ${kind} counters from ~. Create a ${token.replace(/^(\d+\/\d+) /, "$1 ")} token${rest ?? ""} for each counter removed this way.`);
  const removeThem = removeAndCreate.replace(/^Whenever a land enters under an opponent's control, (?=if that player had another land enter the battlefield under their control this turn, )/, "Whenever a land an opponent controls enters, ").replace(/^(At the beginning of your upkeep, if ~ has one or more \+1\/\+1 counters on it), you may remove all of them\. /, "$1, you may remove all +1/+1 counters from ~. ");
  const intervening = /^((?:When|Whenever|At)\b[^,]*), if ([^,]+), (.+)$/.exec(removeThem.replace(/^((?:When|Whenever|At)\b[^,]*, if [^,]*\bnon[a-z]+), (?=non[a-z]+ (?:permanents?|creatures?)\b)/, "$1 "));
  // "If it's attacking" is about the source only in an ability about the source itself.
  const aboutIt = intervening && /^(it|~)\b(?!'s (?:your|the first) | isn't that player's turn$|'s not (?:their|that player's) turn$)/.test(intervening[2]!) && !/^(When|Whenever) ~ /.test(intervening[1]!) && !/^~ is enchanted by /.test(intervening[2]!);
  // "At the beginning of each opponent's upkeep, if that player has two or fewer cards in hand": whose upkeep it is.
  // Reaper of Night: "Whenever ~ attacks, if defending player has two or fewer cards in hand": the player it attacks (or
  // the planeswalker's controller, CR 506.2), as for Septic Rats.
  // Quest for the Nihil Stone: "if that player has no cards in hand and ~ has two or more quest counters on it": both.
  const handAnd = intervening && /^At the beginning of each (?:opponent|player)'s (?:upkeep|draw step|end step)$/.test(intervening[1]!) ? /^(that player has .+? cards in hand) and (~ has .+ counters? on it)$/.exec(intervening[2]!) : null;
  const handAndCond = handAnd ? parseStaticCondition(handAnd[2]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
  if (handAnd && !handAndCond) return "fail";
  const thatHand = intervening && /^At the beginning of each (?:opponent|player)'s (?:upkeep|draw step|end step)$/.test(intervening[1]!) ? new RegExp(`^that player has (no|${NUM} or (fewer|more)) cards in hand$`).exec(handAnd ? handAnd[1]! : intervening[2]!) : intervening && /^Whenever ~ attacks$/.test(intervening[1]!) ? new RegExp(`^defending player has (no|${NUM} or (fewer|more)) cards in hand$`).exec(intervening[2]!) : null;
  const handCond = thatHand && (thatHand[1] === "no" ? { max: 0 } : thatHand[3] === "fewer" ? { max: num(thatHand[2]!) } : { min: num(thatHand[2]!) });
  // "Whenever ~ attacks, if its toughness is 3 or less" (Young Hero Role): its own power or toughness as it triggers and resolves.
  const ptIf = intervening && /^(?:When|Whenever) ~ /.test(intervening[1]!) ? new RegExp(`^(?:its|~'s) (power|toughness) is ${NUM} or (less|greater)$`).exec(intervening[2]!) : null;
  const ptCond = ptIf && ({ kind: "selfPT", stat: ptIf[1] as "power" | "toughness", ...(ptIf[3] === "less" ? { max: num(ptIf[2]!) } : { min: num(ptIf[2]!) }) } as const);
  // "When this token enters, if it's a creature, ..." (Mythos of Illuna's token): its card type as it triggers and
  // resolves (CR 603.4, rulings).
  // "When an opponent casts a creature spell, if ~ is an enchantment, it becomes a 2/2 Soldier creature" (Opal Caryatid,
  // the Hidden and Veiled cycles): ~'s type, whatever the event (rulings: nothing happens if it's no longer one). Opal
  // Guardian: "if ~ is an enchantment, ~ becomes ...".
  const typeIf = intervening && /^(?:When|Whenever) ~ /.test(intervening[1]!) ? /^(?:it's|~ is) an? (creature|artifact|enchantment|land)$/.exec(intervening[2]!) : intervening && /^(?:it|~) becomes /.test(intervening[3]!) ? /^~ is an? (creature|enchantment)$/.exec(intervening[2]!) : null;
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
  // Confounding Conundrum: "Whenever a land an opponent controls enters, if that player had another land enter the
  // battlefield under their control this turn": that land's controller, as it triggers and resolves (CR 603.4).
  const otherLand = intervening && /^Whenever a land an opponent controls enters$/.test(intervening[1]!) && intervening[2] === "that player had another land enter the battlefield under their control this turn";
  // "At the beginning of each opponent's end step, if that player controls more creatures than you" (Keeper of the
  // Accord): the active player, as it triggers and resolves (rulings).
  const activeMore = intervening && /^At the beginning of each opponent's (?:upkeep|draw step|end step)$/.test(intervening[1]!) ? /^that player controls more (lands|creatures) than you$/.exec(intervening[2]!) : null;
  // "Whenever ~ attacks, if defending player controls more lands than you" (Aerial Surveyor): the player it attacks, or
  // the controller of the planeswalker it attacks (CR 506.2), as it triggers and resolves (rulings).
  // Robber of the Rich: "if defending player has more cards in hand than you": the same, cards in hand.
  const defMore = intervening && /^Whenever ~ attacks$/.test(intervening[1]!) ? /^defending player (?:controls more (lands|creatures)|has more cards in (hand)) than you$/.exec(intervening[2]!) : null;
  // Septic Rats: "Whenever ~ attacks, if defending player is poisoned": the player it attacks (or the planeswalker's
  // controller, CR 506.2), as it triggers and resolves.
  const poisonedCond: StaticCondition | null = intervening && /^Whenever ~ attacks$/.test(intervening[1]!) && intervening[2] === "defending player is poisoned" ? { kind: "eventPlayerPoisoned" } : null;
  // "At the beginning of each player's end step, if that player didn't cast a spell this turn" (Impatience), "each
  // opponent's end step, if that player didn't cast a creature spell this turn" (Predatory Advantage): the active
  // player's spells, as it triggers and resolves (CR 603.4).
  const activeCast = intervening && /^At the beginning of each (?:opponent|player)'s end step$/.test(intervening[1]!) ? /^that player didn't cast an? (creature )?spell this turn$/.exec(intervening[2]!) : null;
  const castCond: StaticCondition | null = activeCast ? { kind: "castCount", n: 1, filter: activeCast[1] ? parseSearchFilter("creature card")! : { kind: "card", text: "spell" }, not: true, activePlayer: true } : null;
  const moreCond: StaticCondition | null = castCond ? castCond : thatMore ? { kind: "opponentMore", what: thatMore[1] as "lands" | "creatures", subjectController: true } : activeMore ? { kind: "opponentMore", what: activeMore[1] as "lands" | "creatures", activePlayer: true } : defMore ? { kind: "opponentMore", what: (defMore[1] ?? defMore[2]) as "lands" | "creatures" | "hand", eventPlayer: true } : null;
  // Deathbringer Regent: "When ~ enters, if you cast it from your hand and there are five or more other creatures on the
  // battlefield": both, the first about how it entered (see ifCastFromHand).
  const fromHandAnd = intervening && /^When ~ enters$/.test(intervening[1]!) ? /^you cast it from your hand and (.+)$/.exec(intervening[2]!) : null;
  if (fromHandAnd) intervening![3] = `if you cast it from your hand, ${intervening![3]}`;
  // Momentum Rumbler: "Whenever ~ attacks, if it doesn't have first strike, ...", "... if it has first strike, ...": its
  // keywords as it triggers and resolves (CR 603.4).
  // Guardian of the Ages: "When a creature attacks you or a planeswalker you control, if ~ has defender, it loses defender
  // and gains trample": ~'s, "it" being ~ after it.
  const kwIf = intervening && (/^Whenever ~ /.test(intervening[1]!) || /^~ /.test(intervening[2]!)) ? /^(?:it|~) (has|doesn't have) (first strike|double strike|flying|trample|vigilance|deathtouch|lifelink|haste|reach|menace|defender)$/.exec(intervening[2]!) : null;
  const kw = kwIf ? keywordOf(kwIf[2]!) : undefined;
  const kwCond: StaticCondition | null = kwIf && kw ? { kind: "selfIs", filter: { kind: "object", ...(kwIf[1] === "has" ? { keywords: [kw] } : { notKeywords: [kw] }), text: `${kwIf[1] === "has" ? "with" : "without"} ${kwIf[2]}` } } : null;
  // Wall of Resistance: "At the beginning of each end step, if ~ was dealt damage this turn, ...": as it triggers and
  // resolves (CR 603.4); only a trigger reads it, so no static ability's cache depends on it.
  const dmgCond: StaticCondition | null = intervening && /^At the beginning of /.test(intervening[1]!) && /^~ was dealt damage this turn$/.test(intervening[2]!) ? { kind: "self", is: "dealtDamageThisTurn" } : intervening && /^At the beginning of /.test(intervening[1]!) && /^~ dealt damage to an opponent this turn$/.test(intervening[2]!) ? { kind: "self", is: "dealtDamageToOpponentThisTurn" } : null;
  // Skizzik: "At the beginning of the end step, if ~ wasn't kicked, sacrifice it": as it was cast (CR 702.33d), kept by
  // the permanent; a copy or one put onto the battlefield wasn't (rulings).
  const kickCond: StaticCondition | null = intervening && /^At the beginning of /.test(intervening[1]!) && /^~ wasn't kicked$/.test(intervening[2]!) ? { kind: "self", is: "kicked", not: true } : null;
  // Slayer's Plate: "Whenever equipped creature dies, if it was a Human, ...": the creature as it last existed on the
  // battlefield (CR 603.10a, 608.2h), as it triggers and resolves (CR 603.4).
  const diedType = intervening && /^Whenever (?:equipped|enchanted) creature dies$/.test(intervening[1]!) ? /^it was an? ([A-Z][a-z]+)$/.exec(intervening[2]!) : null;
  const diedTypeCond: StaticCondition | null = diedType && CREATURE_TYPES.has(diedType[1]!) ? { kind: "subjectType", subtype: diedType[1]! } : null;
  // Sigil Captain: "Whenever a creature you control enters, if that creature is 1/1, ...": its power and toughness as
  // it triggers and resolves (CR 603.4), as it last existed if it's gone.
  const subjSize = intervening && /^Whenever (?:a|another) (?:nontoken )?creature (?:you control )?enters$/.test(intervening[1]!) ? /^that creature is (\d+)\/(\d+)$/.exec(intervening[2]!) : null;
  const subjSizeCond: StaticCondition | null = subjSize ? { kind: "allOf", conds: [{ kind: "subjectPT", stat: "power", min: Number(subjSize[1]), max: Number(subjSize[1]) }, { kind: "subjectPT", stat: "toughness", min: Number(subjSize[2]), max: Number(subjSize[2]) }] } : null;
  // Ichorplate Golem: "Whenever a creature you control enters, if it has one or more oil counters on it, ...": the
  // creature that entered, as it triggers and resolves (CR 603.4), as it last existed if it's gone.
  const subjCounter = intervening && /^Whenever (?:a|another) (?:nontoken )?creature (?:you control )?enters$/.test(intervening[1]!) ? new RegExp(`^it has (?:one or more ${COUNTER} counters|an? ${COUNTER} counter) on it$`).exec(intervening[2]!) : null;
  const subjCounterCond: StaticCondition | null = subjCounter ? { kind: "subjectCounter", counter: counterKind(subjCounter[1] ?? subjCounter[2]!) } : null;
  // "At the beginning of each player's upkeep, if that player controls a Plains" (Spiritual Sanctuary), "if there are four
  // or more basic land types among lands that player controls" (Mask of Intolerance): the active player's, as it triggers
  // and resolves (CR 603.4).
  const eachStep = intervening && /^At the beginning of each player's (?:upkeep|draw step|end step)$/.test(intervening[1]!) ? intervening[2]! : null;
  const thatControls = eachStep ? /^that player controls (an? .+)$/.exec(eachStep) : null;
  const thatControlsCond = thatControls ? parseStaticCondition(`you control ${thatControls[1]}`, { affects: { kind: "self" }, mods: [], text: "" }) : null;
  const thatTypes = eachStep ? new RegExp(`^there are ${NUM} or more basic land types among lands that player controls$`).exec(eachStep) : null;
  // Razor Pendulum: "At the beginning of each player's end step, if that player has 5 or less life": the active player's.
  const thatLife = eachStep ? /^that player has (\d+) or less life$/.exec(eachStep) : null;
  const activeCond: StaticCondition | null = thatControlsCond?.kind === "control" && thatControlsCond.who === "you" && !thatControlsCond.other ? { ...thatControlsCond, who: "eventPlayer" } : thatTypes ? { kind: "amount", amount: { count: { kind: "basicLandTypes", whose: { ref: "eventPlayer" } } }, min: num(thatTypes[1]!) } : thatLife ? { kind: "amount", amount: { count: { kind: "life", who: { ref: "eventPlayer" } } }, max: Number(thatLife[1]) } : null;
  const ifCond = otherLand ? ({ kind: "subjectControllerOtherLandEntered" } as const) : activeCond ? activeCond : subjSizeCond ? subjSizeCond : subjCounterCond ? subjCounterCond : diedTypeCond ? diedTypeCond : kickCond ? kickCond : dmgCond ? dmgCond : kwCond ? kwCond : putCond ? putCond : poisonedCond ? poisonedCond : moreCond ? moreCond : nameCond ? nameCond : typeCond ? typeCond : ptCond ? ptCond : handCond ? (handAnd ? (handAndCond ? { kind: "allOf" as const, conds: [{ kind: "eventPlayerHand" as const, ...handCond }, handAndCond] } : null) : ({ kind: "eventPlayerHand", ...handCond } as const)) : intervening && !aboutIt && parseStaticCondition(fromHandAnd ? fromHandAnd[1]! : intervening[2]!, { affects: { kind: "self" }, mods: [], text: "" });
  // "That player" is the attacked player only in "Whenever ~ attacks a player".
  if (ifCond && ifCond.kind === "defenderMostLife" && !/^Whenever ~ attacks a player$/.test(intervening![1]!)) return "fail";
  if (intervening && ifCond) {
    // Feast of the Victorious Dead: "if one or more creatures died this turn, you gain that much life and distribute that
    // many +1/+1 counters": the number of creatures that died this turn, counted as it resolves.
    let rest = kwIf && /^~ /.test(intervening[2]!) ? intervening[3]!.replace(/^it (?=(?:loses|gains|gets|has|becomes)\b)/, "~ ") : intervening[3]!;
    if (otherLand) rest = rest.replace(/^they return a land they control /, "that player returns a land they control ");
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
    // "If there are cards exiled with it, you may play one of them without paying its mana cost" (Evercoat Ursine).
    if (/^there are cards exiled with (?:~|it)$/.test(intervening[2]!)) rest = rest.replace(/^you may play one of them without paying its mana cost\.$/, "you may play one of the cards exiled with ~ without paying its mana cost.");
    // "At the beginning of your upkeep, if ~ is tapped, put a storage counter on it" (Bottomless Vault): "it" is ~, the
    // only thing named.
    // So is every "it" of "sacrifice it" (Mad Dog) and "it deals 2 damage to you unless it came under your control this
    // turn" (Erg Raiders), with no target or other object in the text.
    // So is "it" after "if there are two or more ki counters on ~" (the Kamigawa flip cards).
    // Legolas, Counter of Kills: "Whenever you scry, if ~ is tapped, you may untap it": likewise, an event with no object.
    if ((/^~ /.test(intervening[2]!) || / counters on ~$/.test(intervening[2]!)) && (/^At /.test(intervening[1]!) || /^Whenever you (?:scry|surveil|gain life|lose life)$/.test(intervening[1]!)))
      // "You may remove a +1/+1 counter from it" (Ingenious Prodigy) likewise.
      // Riders of the Mark: "return it to its owner's hand. If you do, create a number of ... tokens equal to its toughness":
      // ~ and ~'s (as it last existed, CR 608.2h).
      rest = /^return it to its owner's hand\. If you do, create a number of [^.]+ equal to its (?:power|toughness)\.$/.test(rest) ? rest.replace(/^return it/, "return ~").replace(/ equal to its /, " equal to ~'s ") : /\b(a|an|target|that|those|another|other|each|all|cards?|tokens?|creatures?|permanents?|spells?)\b|"/.test(rest) ? rest.replace(/( counters? on) it\.$/, "$1 ~.").replace(/^(you may remove an? \S+ counter from) it\./, "$1 ~.") : rest.replace(/\bit\b/g, "~");
    // Inventive Wingsmith: "if you haven't cast a spell from your hand this turn and ~ doesn't have a flying counter on it,
    // put a flying counter on it": ~, the only object named.
    if (/ and ~ doesn't have an? [a-z]+ counter on it$/.test(intervening[2]!) && /^At /.test(intervening[1]!)) rest = rest.replace(/^put an? ([a-z]+) counter on it\.$/, "put a $1 counter on ~.");
    // Emergent Haunting: "... and ~ isn't a creature, it becomes a 3/3 Spirit creature ...": ~ again.
    if (/ and ~ isn't a creature$/.test(intervening[2]!) && /^At /.test(intervening[1]!)) rest = rest.replace(/^it becomes /, "~ becomes ");
    if (typeIf && !/^(?:When|Whenever) ~ /.test(intervening[1]!)) rest = rest.replace(/^it becomes /, "~ becomes ");
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
  // "Each other player's" (Well of Ideas): with no teams, every other player is an opponent (CR 102.3).
  // Discordant Spirit: "At the beginning of each end step, if it's an opponent's turn, ...": the same (whose turn it is
  // can't change before it resolves).
  const oppStep = /^At the beginning of each (?:opponent|other player)'s (upkeep|draw step|end step), (.+)$/.exec(line) ?? /^At the beginning of (combat) on each opponent's turn, (.+)$/.exec(line) ?? /^At the beginning of each (upkeep|end step), if it's an opponent's turn, (.+)$/.exec(line);
  if (oppStep) {
    const event = oppStep[1] === "upkeep" ? "eachUpkeep" : oppStep[1] === "draw step" ? "eachDrawStep" : oppStep[1] === "combat" ? "eachBeginCombat" : "eachEndStep";
    // "They lose 2 life", "~ deals 2 damage to them": that player.
    // Slicer, Hired Muscle: "... gain control of ~ until end of turn. If you do, ... If you don't, convert it": ~.
    // Assault Suit: "... gain control of equipped creature until end of turn. If you do, untap it": that creature.
    const text = oppStep[2]!.replace(/^(you may have that player gain control of ~ until end of turn\. If you do, untap ~, goad it, and it can't be sacrificed this turn\. If you don't, convert) it\.$/, "$1 ~.").replace(/^(you may have that player gain control of equipped creature until end of turn\. If you do, untap) it\.$/, "$1 equipped creature.");
    const body = parseBody(text.replace(/^they lose /, "that player loses ").replace(/ to them\.$/, " to that player."), { eventPlayer: true });
    return body ? { event, body, opponentsTurn: true } : "fail";
  }
  // Erestor of the Council: "Whenever players finish voting, ..." (CR 701.38): its body reads the votes cast.
  const votesDone = /^Whenever players finish voting, (.+)$/.exec(line);
  if (votesDone) {
    const body = parseBody(votesDone[1]!, { votesEvent: true });
    return body ? { event: "playersFinishVoting", body } : "fail";
  }
  // Kitt Kanto, Mayhem Diva: "At the beginning of combat on each player's turn, ... target creature that player controls
  // ...": every turn's beginning of combat (CR 507.1), "that player" the active player.
  const eachCombatThat = /^At the beginning of combat on each player's turn, (.+\bthat player\b.+)$/.exec(line);
  if (eachCombatThat) {
    const body = parseBody(eachCombatThat[1]!, { eventPlayer: true });
    return body ? { event: "eachBeginCombat", body } : "fail";
  }
  // Black Vise, The Rack: "At the beginning of the chosen player's upkeep, ..." of a permanent that chose a player as it
  // entered (CR 614.12): an "each upkeep" trigger only on that player's turn; "that player" and "their" are that player.
  // Archivist of Gondor: "At the beginning of the monarch's end step, that player draws a card": an "each end step" trigger
  // only on the turn of the player who's the monarch as it begins (CR 725), "that player" being them; no intervening "if"
  // (CR 603.4), so it resolves whoever is the monarch by then.
  const monarchStep = /^At the beginning of the monarch's end step, (.+)$/.exec(line);
  if (monarchStep) {
    const body = parseBody(monarchStep[1]!, { eventPlayer: true });
    return body ? { event: "eachEndStep", body, monarchsTurn: true } : "fail";
  }
  const chosenStep = /^At the beginning of the chosen player's upkeep, (.+)$/.exec(line);
  if (chosenStep) {
    const body = parseBody(chosenStep[1]!, { eventPlayer: true });
    return body ? { event: "eachUpkeep", body, chosenPlayersTurn: true } : "fail";
  }
  const enchanted = parseEnchantedPlayerTrigger(line);
  if (enchanted) return enchanted;
  // Heroic before the other "whenever you cast" triggers.
  const heroic = /^Whenever you cast a spell that targets ~, (.+)$/.exec(line);
  if (heroic) {
    const body = parseBody(heroic[1]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ "), { selfIt: true });
    return body ? { event: "selfTargetedByYourSpell", body } : "fail";
  }
  // Druid of Horns: "Whenever you cast an Aura spell that targets ~, ...": an Aura spell targets what it will enchant (CR
  // 303.4a).
  const auraHeroic = /^Whenever you cast an Aura spell that targets ~, (.+)$/.exec(line);
  if (auraHeroic) {
    const body = parseBody(auraHeroic[1]!, {});
    return body ? { event: "selfTargetedByYourSpell", body, heroicSpell: { kind: "spell", subtypes: ["Aura"], text: "Aura spell" } } : "fail";
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
  // Brood Keeper, Bramble Elemental: "Whenever an Aura becomes attached to ~, create ...".
  const auraAttached = /^Whenever an Aura becomes attached to ~, (create [^"]+(?:"[^"]*")?[^"]*)$/.exec(line);
  if (auraAttached) {
    const body = parseBody(auraAttached[1]!);
    return body && !body.targets.length ? { event: "auraAttachedToSelf", body } : "fail";
  }
  // Siona, Captain of the Pyleas: "Whenever an Aura you control becomes attached to a creature you control, create ...".
  const auraYours = /^Whenever an Aura you control becomes attached to a creature you control, (create [^"]+(?:"[^"]*")?[^"]*)$/.exec(line);
  if (auraYours) {
    const body = parseBody(auraYours[1]!);
    return body && !body.targets.length ? { event: "auraAttachedToYours", body } : "fail";
  }
  // Enormous Energy Blade: "Whenever ~ becomes attached to a creature, tap that creature": attached to it by equip or any
  // other effect (CR 701.3a), or entering attached to it; the creature is the subject.
  const attachedTo = /^Whenever ~ becomes attached to a creature, (.+)$/.exec(line);
  if (attachedTo) {
    const body = parseBody(attachedTo[1]!.replace(/\bthat creature\b/g, "it"), { subjectIt: true });
    return body ? { event: "selfBecomesAttached", body } : "fail";
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
  // Shang-Chi and the Ten Rings: "When the tenth +1/+1 counter is put on ~".
  const nth = /^When the (second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) (\+1\/\+1|[a-z]+) counter is put on ~, (.+)$/.exec(line);
  if (nth) {
    const reach = ["second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"].indexOf(nth[1]!) + 2;
    const body = parseBody(nth[3]!, { selfIt: true });
    return body ? { event: "selfCountersPut", countersKind: nth[2]!, countersReach: reach, body } : "fail";
  }
  // Protean Hydra: "Whenever a +1/+1 counter is removed from ~", for any reason, once for each counter (rulings).
  // Chandra, Fire Artisan: "Whenever one or more loyalty counters are removed from ~", once for each event (combat damage
  // from several creatures at once is one), "that much" how many (rulings). See countersRemoved in counters.ts.
  const removed = /^Whenever (an? |one or more )(\+1\/\+1|-1\/-1|loyalty|time|[a-z]+) counters? (?:is|are) removed from ~, (.+)$/.exec(line);
  if (removed && (removed[1] === "one or more " ? / counters are /.test(line) : / counter is /.test(line))) {
    const each = removed[1] !== "one or more ";
    let text = removed[3]!.replace(/^(?:it|she|he) (?=(?:gets|gains|deals|has|becomes)\b)/, "~ ");
    const thatMuch = /\bthat (?:much|many)\b/.test(text);
    if (thatMuch) {
      if (each || /\bX\b/.test(text)) return "fail";
      text = text.replace(/\bthat (?:much|many)\b/g, "X");
    }
    let body = parseBody(text, { selfIt: true });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, removed[3]!) };
    return { event: "selfCountersRemoved", countersKind: removed[2]!, ...(each ? { countersEach: true as const } : {}), body };
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
  // Bold Plagiarist: "Whenever an opponent puts one or more counters on a creature they control, they put the same number
  // and kind of counters on ~.": that opponent puts them (rulings: so their own Bold Plagiarist doesn't trigger on these).
  if (/^Whenever an opponent puts one or more counters on a creature they control, they put the same number and kind of counters on ~\.?$/.test(line)) {
    const text = "they put the same number and kind of counters on ~.";
    return { event: "permanentCountersPut", tappedFilter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, countersByOpponentOnTheirs: true, body: { targets: [], effects: [{ type: "counters", what: { ref: "self" }, counter: "+1/+1", eventCounter: true, n: { count: { kind: "eventAmount" } }, by: { ref: "eventPlayer" } }], text } };
  }
  const youPut = /^Whenever you put one or more ((?:\+1\/\+1|-1\/-1|loyalty|time|[a-z]+) )?counters on (~|this (?:creature|artifact|enchantment|permanent)|another creature you control|a creature you control|a creature you don't control|a creature|another creature|a permanent you control|a permanent or player|a planeswalker|another [a-z]+ creature|an? [A-Z][a-z]+(?:, [A-Z][a-z]+,)? or [A-Z][a-z]+ you control), (.+)$/.exec(line);
  // Danny Pink grants "Whenever one or more counters are put on this creature for the first time each turn".
  // Axgard Artisan: "Whenever one or more +1/+1 counters are put on ~ for the first time each turn": that kind.
  const firstTime = !youPut && /^Whenever one or more (?:\+1\/\+1 )?counters are put on ~ for the first time each turn, /.test(line);
  // Botanical Brawler: "Whenever one or more +1/+1 counters are put on another permanent you control, if it's the first
  // time +1/+1 counters have been put on that permanent this turn, ...": counters put on it earlier this turn count, even
  // before Botanical Brawler was on the battlefield (rulings).
  // Stalwart Successor: "Whenever one or more counters are put on a creature you control, if it's the first time counters
  // have been put on that creature this turn, ...": any kind, the same way.
  const firstOn = !youPut && !firstTime ? (/^(Whenever one or more \+1\/\+1 counters are put on another permanent you control), if it's the first time \+1\/\+1 counters have been put on that permanent this turn, /.exec(line) ?? /^(Whenever one or more counters are put on a creature you control), if it's the first time counters have been put on that creature this turn, /.exec(line)) : null;
  // Bioessence Hydra: "Whenever one or more loyalty counters are put on planeswalkers you control": once for each
  // planeswalker they're put on (an entering one's too, rulings), "that many" those put on it.
  // Wickersmith's Tools: "Whenever one or more -1/-1 counters are put on a creature": any creature, once for each one.
  const put = youPut ?? /^Whenever one or more (\+1\/\+1 |-1\/-1 |loyalty )?counters are put on (~|a creature|another creature you control|a creature you control|a permanent you control|another permanent you control|another non-[A-Z][a-z]+ creature you control|an? [A-Z][a-z]+ you control|planeswalkers you control), (.+)$/.exec(firstTime ? line.replace(" for the first time each turn,", ",") : firstOn ? line.replace(firstOn[0], `${firstOn[1]}, `) : line);
  if (put) {
    const self = /^(?:~|this [a-z]+)$/.test(put[2]!);
    const byYou = youPut ? { countersByYou: true as const } : {};
    let text = put[3]!.replace(/\bthat (creature|permanent|planeswalker)\b/g, "it");
    const thatMuch = /\bthat (?:much|many)\b/.test(text);
    if (thatMuch) {
      if (/\bX\b/.test(text)) return "fail";
      text = text.replace(/\bthat (?:much|many)\b/g, "X");
    }
    // Auntie Ool, Cursewretch: "draw a card if you control that creature. If you don't control it, its controller loses 1
    // life": whose it is as the ability resolves, or as it last existed (CR 608.2h).
    const yoursOrNot = !self && !thatMuch ? /^(.+) if you control it\. If you don't control it, (.+)$/.exec(text) : null;
    let body: AbilityBody | null;
    if (yoursOrNot) {
      const yes = parseBody(`${yoursOrNot[1]}.`, { subjectIt: true });
      const no = parseBody(yoursOrNot[2]!, { subjectIt: true });
      if (!yes || !no || yes.targets.length || no.targets.length) return "fail";
      body = { targets: [], effects: [{ type: "if", cond: { kind: "subjectYours" }, effects: yes.effects, otherwise: no.effects }], text: put[3]! };
    } else body = parseBody(self ? text.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ ") : text, self ? { selfIt: true } : { subjectIt: true });
    if (!body) return "fail";
    if (thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, put[3]!) };
    const kind = put[1] ? { countersKind: put[1].trim() } : {};
    if (self) return { event: "selfCountersPut", body, ...kind, ...byYou, ...(firstTime ? { countersFirstTime: true as const } : {}) };
    // All Will Be One: "on a permanent or player", once for each permanent or player they're put on.
    const orPlayer = put[2] === "a permanent or player" ? { countersOrPlayer: true as const } : {};
    const filter = parseTargetPhrase(put[2]!.replace(/ or player$/, "").replace(/^another (creature)?/, (_m, c) => (c ? "creature" : "")).replace(/^an? /, "").replace(/^planeswalkers /, "planeswalker "));
    if (filter?.kind !== "object") return "fail";
    return { event: "permanentCountersPut", tappedFilter: { ...filter, ...(put[2]!.startsWith("another") ? { notSource: true } : {}) }, body, ...kind, ...byYou, ...orPlayer, ...(firstOn ? { countersFirstTime: true as const } : {}) };
  }
  // "Whenever a Dwarf you control becomes tapped", "Whenever a creature an opponent controls becomes tapped", "Whenever a
  // permanent becomes untapped" (Mesmeric Orb: "that permanent's controller").
  // "Whenever you tap an untapped creature an opponent controls" (Hylda of the Icy Crown), "Whenever you tap one or more
  // untapped creatures your opponents control, draw a card. This ability triggers only once each turn." (Sharae of Numbing
  // Depths): a creature becoming tapped because a spell or ability told this ability's controller to tap it (rulings), once
  // for each one; triggering only once each turn, "one or more" is the same as each one.
  // (The once-each-turn handler above turns Sharae's "one or more" into "an untapped creature an opponent controls".)
  const youTap = /^Whenever you tap an untapped creature an opponent controls, (.+)$/.exec(line);
  if (youTap) {
    const body = parseBody(youTap[1]!, { subjectIt: true });
    return body ? { event: "permanentBecomesTapped", tappedFilter: { kind: "object", types: ["Creature"], controller: "opponent", text: "creature an opponent controls" }, tappedByYou: true, body } : "fail";
  }
  // Roots of Life: "Whenever a land of the chosen type an opponent controls becomes tapped": a land with the basic land type
  // chosen as it entered (Chosen.landType, bound as the trigger is checked), for any reason (for mana, too: rulings).
  const chosenLand = /^Whenever a land of the chosen type (you|an opponent) controls becomes tapped, (.+)$/.exec(line);
  if (chosenLand) {
    const body = parseBody(chosenLand[2]!, { subjectIt: true });
    return body ? { event: "permanentBecomesTapped", tappedFilter: { kind: "object", types: ["Land"], controller: chosenLand[1] === "you" ? "you" : "opponent", chosen: "landType", text: `land of the chosen type ${chosenLand[1]} control${chosenLand[1] === "you" ? "" : "s"}` }, body } : "fail";
  }
  // Ramses, Assassin Lord: "Whenever a player loses the game, if they were attacked this turn by an Assassin you
  // controlled, ...": an Assassin declared as an attacker attacking that player this turn, as it was declared; even if it's
  // gone or changed since, not a planeswalker of theirs, not one put onto the battlefield attacking (rulings).
  const attackedBy = /^Whenever a player loses the game, if they were attacked this turn by an? ([A-Z][a-z]+) you controlled, (.+)$/.exec(line);
  if (attackedBy) {
    if (!CREATURE_TYPES.has(attackedBy[1]!)) return "fail";
    const t = parseTrigger(`Whenever a player loses the game, ${attackedBy[2]!}`);
    return t && t !== "fail" && t.event === "anotherPlayerLosesGame" && !t.ifCond ? { ...t, ifCond: { kind: "attackedWith", n: 1, subtype: attackedBy[1]!, eventPlayer: true } } : "fail";
  }
  // The Ninth Doctor: "Whenever ~ becomes untapped during your untap step": only as its controller's untap step untaps it
  // (CR 502.3); it goes on the stack in the next step, usually the upkeep (rulings).
  const untapStep = /^Whenever ~ becomes untapped during your untap step, (.+)$/.exec(line);
  if (untapStep) {
    const body = parseBody(untapStep[1]!);
    return body ? { event: "selfBecomesUntapped", inYourUntapStep: true, body } : "fail";
  }
  // Deeproot Pilgrimage: "Whenever one or more nontoken Merfolk you control become tapped", Rewrite History: "Whenever one
  // or more creatures you control become tapped": once for the permanents that become tapped at the same time (rulings).
  const tappedMany = /^Whenever one or more (.+?) become tapped, (.+)$/.exec(line);
  if (tappedMany) {
    const filter = parseTargetPhrase(tappedMany[1]!.replace(/^creatures /, "creature "));
    const body = filter?.kind === "object" && parseBody(tappedMany[2]!);
    return filter && body ? { event: "permanentsBecomeTapped", tappedFilter: filter, body } : "fail";
  }
  const tapped = /^Whenever an? (.+?) becomes (tapped|untapped), (.+)$/.exec(line);
  if (tapped) {
    const filter = parseTargetPhrase(tapped[1]!);
    const body = filter && filter.kind === "object" && parseBody(tapped[3]!, { subjectIt: true });
    return filter && body ? { event: tapped[2] === "tapped" ? "permanentBecomesTapped" : "permanentBecomesUntapped", tappedFilter: filter, body } : "fail";
  }
  // "Whenever a permanent is turned face up" (Aven Farseer, Bonethorn Valesk), "Whenever ~ or another creature you control
  // is turned face up" (Pine Walker), "Whenever a face-down permanent you control is turned face up" (Sumala Sentry): the
  // permanent, as it is once face up (CR 708.8: it doesn't enter), is the subject ("that creature", "it"). "Face-down"
  // is what it was until then, so any permanent turned face up.
  // "If it's a creature" (Trail of Mystery, Salt Road Ambushers): an intervening "if" about it (CR 603.4).
  const faceUp = /^Whenever (~ or another|another|an?(?: face-down)?) ((?:[A-Z][a-z]+|permanent|creature)(?: you control)?) is turned face up, (if it's a creature, )?(.+)$/.exec(line);
  if (faceUp) {
    const filter = parseTargetPhrase(faceUp[2]!);
    const body = filter?.kind === "object" ? parseBody(faceUp[4]!.replace(/\bthat (creature|permanent)\b/g, "it"), { subjectIt: true }) : null;
    if (!filter || filter.kind !== "object" || !body) return "fail";
    return { event: "permanentTurnedFaceUp", tappedFilter: { ...filter, ...(faceUp[1] === "another" ? { notSource: true } : {}) }, ...(faceUp[3] ? { ifCond: { kind: "subjectCardType", type: "Creature" } as const } : {}), body };
  }
  // Growing Dread: "Whenever you turn a permanent face up, ...": you turned it, by the special action (CR 116.2b) or by an
  // effect you control; the permanent is the subject.
  const youTurn = /^Whenever you turn an? (permanent|creature) face up, (.+)$/.exec(line);
  if (youTurn) {
    const filter = parseTargetPhrase(youTurn[1]!);
    const body = parseBody(youTurn[2]!.replace(/\bthat (creature|permanent)\b/g, "it"), { subjectIt: true });
    return filter?.kind === "object" && body ? { event: "permanentTurnedFaceUp", tappedFilter: filter, turnedByYou: true, body } : "fail";
  }
  // Norn's Inquisitor: "Whenever a permanent you control transforms into a Phyrexian, ...": it transformed or converted,
  // either way, and is a Phyrexian right after (CR 701.27e, rulings); it's the subject.
  // Cult of the Waxing Moon: "... transforms into a non-Human creature, ...": a creature without that type right after.
  const transformsInto = /^Whenever a permanent you control transforms into an? ([A-Z][a-z]+|non-[A-Z][a-z]+ creature), (.+)$/.exec(line);
  if (transformsInto) {
    const non = /^non-([A-Z][a-z]+) creature$/.exec(transformsInto[1]!);
    const filter = parseTargetPhrase(non ? `non-${non[1]} creature you control` : `${transformsInto[1]} permanent you control`);
    const body = parseBody(transformsInto[2]!.replace(/\bthat (creature|permanent)\b/g, "it"), { subjectIt: true });
    const ok = filter?.kind === "object" && (non ? filter.types?.length === 1 && filter.types[0] === "Creature" && filter.notSubtypes?.length === 1 && filter.notSubtypes[0] === non[1] && !filter.subtypes?.length : filter.subtypes?.length === 1);
    return ok && body ? { event: "permanentTransformsInto", tappedFilter: filter, body } : "fail";
  }
  // Essence Symbiote: "Whenever a creature you control mutates, put a +1/+1 counter on that creature" (CR 702.140d).
  const mutates = /^Whenever an? (creature you control) mutates, (.+)$/.exec(line);
  if (mutates) {
    const filter = parseTargetPhrase(mutates[1]!);
    const body = filter && filter.kind === "object" && parseBody(mutates[2]!, { subjectIt: true });
    return filter && body ? { event: "permanentMutates", tappedFilter: filter, body } : "fail";
  }
  // Wildgrowth Walker: "Whenever a creature you control explores, ..." (CR 701.44b), that creature the subject.
  // Nicanzil, Current Conductor: "... explores a land card", "... explores a nonland card": what it revealed.
  const explores = /^Whenever a creature you control explores( a land card| a nonland card)?, (.+)$/.exec(line);
  if (explores) {
    const body = parseBody(explores[2]!, { subjectIt: true });
    return body ? { event: "creatureYouControlExplores", body, ...(explores[1] ? { explored: explores[1] === " a land card" ? ("land" as const) : ("nonland" as const) } : {}) } : "fail";
  }
  // Valeron Wardens: "Whenever a creature you control becomes renowned, ..." (CR 702.112b), that creature the subject.
  const renowned = /^Whenever a creature you control becomes renowned, (.+)$/.exec(line);
  if (renowned) {
    const body = parseBody(renowned[1]!, { subjectIt: true });
    return body ? { event: "creatureYouControlBecomesRenowned", body } : "fail";
  }
  // Iron Monger, Ultron: "Whenever a creature you control connives, ..." (CR 701.50f), that creature the subject.
  const connives = /^Whenever a creature you control connives, (.+)$/.exec(line);
  if (connives) {
    const body = parseBody(connives[1]!, { subjectIt: true });
    return body ? { event: "creatureYouControlConnives", body } : "fail";
  }
  const block = parseBlockTrigger(line);
  if (block) return block;
  const damagesYou = parseDamagesYouTrigger(line);
  if (damagesYou) return damagesYou;
  const damages = parseDamagesCreatureTrigger(line);
  if (damages) return damages;
  // Vraska the Unseen: "whenever a creature deals combat damage to ~, destroy that creature": once for each creature
  // dealing it combat damage, which "that creature" means.
  // Liliana's Talent: "Whenever a creature deals damage to enchanted planeswalker, destroy that creature": any damage,
  // not just combat damage (rulings), once for each creature dealing it.
  const damagesHost = /^Whenever a creature deals damage to enchanted planeswalker, (.+)$/.exec(line);
  if (damagesHost) {
    const body = parseBody(damagesHost[1]!, { subjectIt: true });
    return body ? { event: "creatureDealsDamageToAttached", host: "attached", body } : "fail";
  }
  // Tephraderm: "Whenever a creature deals damage to ~, ~ deals that much damage to that creature": once for each creature
  // dealing it damage, combat damage or not, that creature the subject; "Whenever a spell deals damage to ~, ~ deals that
  // much damage to that spell's controller": once for each spell, that player the spell's controller (CR 112.1). Both
  // trigger even if the damage is lethal (rulings): it's still on the battlefield as the damage is dealt.
  const damagedByAny = /^Whenever a (creature|spell) deals damage to ~, (.+)$/.exec(line);
  if (damagedByAny) {
    const spell = damagedByAny[1] === "spell";
    const text = damagedByAny[2]!;
    if (/\bX\b/.test(text)) return "fail";
    const body = parseBody((spell ? text.replace(/\bthat spell's controller\b/g, "that player") : text).replace(/\bthat (?:much|many)\b/g, "X"), spell ? { eventPlayer: true } : { subjectIt: true });
    return body ? { event: spell ? "spellDealsDamageToSelf" : "creatureDealsDamageToSelf", body: { ...replaceX(body, { count: { kind: "eventAmount" } }), text } } : "fail";
  }
  const damagedBy = /^Whenever a creature deals combat damage to ~, (.+)$/.exec(line);
  if (damagedBy) {
    const body = parseBody(damagedBy[1]!, { subjectIt: true });
    return body ? { event: "creatureDealsCombatDamageToSelf", body } : "fail";
  }
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
  // Ever-Watching Threshold: "Whenever an opponent attacks, if they attacked you and/or a planeswalker you control": the
  // same, the attack declared before it triggers (rulings: once for each such opponent).
  // Orim's Prayer: "Whenever one or more creatures attack you" is the same as "Whenever a player attacks you with one or more
  // creatures" (only an opponent can, CR 506.2).
  const attacked = /^Whenever (?:an opponent|a player) attacks (you with (?:two|one) or more creatures|with creatures, if two or more of those creatures are attacking you and\/or planeswalkers you control|you and\/or one or more planeswalkers you control|you), (.+)$/.exec(line.replace(/^Whenever an opponent attacks, if they attacked you and\/or a planeswalker you control, /, "Whenever an opponent attacks you and/or one or more planeswalkers you control, ").replace(/^Whenever one or more creatures attack you, (?!if )/, "Whenever a player attacks you with one or more creatures, "));
  if (attacked && (/^Whenever a player/.test(line) ? /^you with one or more creatures$/.test(attacked[1]!) : true)) {
    const thatMany = /\bthat many\b/.test(attacked[2]!);
    if (thatMany && (/\bX\b/.test(attacked[2]!) || !/^you with/.test(attacked[1]!))) return "fail";
    // Sabotage Strategist: "those creatures get -1/-0 until end of turn": the ones attacking you (the trigger's group).
    let body = parseBody(attacked[2]!.replace(/\bthat opponent\b/g, "that player").replace(/\bthat many\b/g, "X"), { eventPlayer: true, eventGroup: true });
    if (!body) return "fail";
    if (thatMany) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: attacked[2]! };
    return { event: "opponentAttacksYou", attacksYou: { min: /two or more/.test(attacked[1]!) ? 2 : 1, ...(/planeswalkers you control/.test(attacked[1]!) ? { orPlaneswalkers: true as const } : {}), ...(/^with creatures, if /.test(attacked[1]!) ? { recheck: true as const } : {}) }, body: { ...body, text: attacked[2]! } };
  }
  // Mila, Crafty Companion: "Whenever an opponent attacks one or more planeswalkers you control": once each combat that
  // opponent attacks with creatures attacking your planeswalkers (rulings), however many.
  const walkers = /^Whenever an opponent attacks one or more planeswalkers you control, (.+)$/.exec(line);
  if (walkers) {
    const body = parseBody(walkers[1]!.replace(/\bthat opponent\b/g, "that player"), { eventPlayer: true });
    return body ? { event: "opponentAttacksYou", attacksYou: { min: 1, orPlaneswalkers: true, walkersOnly: true }, body: { ...body, text: walkers[1]! } } : "fail";
  }
  // Oath of Kaya: "Whenever an opponent attacks a planeswalker you control with one or more creatures": once for each of
  // your planeswalkers attacked (rulings); "that player" is the attacking opponent.
  const aWalker = /^Whenever an opponent attacks a planeswalker you control with one or more creatures, (.+)$/.exec(line);
  if (aWalker) {
    const body = parseBody(aWalker[1]!.replace(/\bthat opponent\b/g, "that player"), { eventPlayer: true });
    return body ? { event: "opponentAttacksYou", attacksYou: { min: 1, orPlaneswalkers: true, walkersOnly: true, perWalker: true }, body: { ...body, text: aWalker[1]! } } : "fail";
  }
  // Breena: "Whenever a player attacks one of your opponents, if that opponent has more life than another of your
  // opponents, ...": once for each player attacking each of your opponents (CR 508.3e); "that attacking player" is the one
  // who attacked, "that opponent" the one attacked.
  // Preacher of the Schism: "Whenever this creature attacks the player with the most life or tied for most life" (as
  // dethrone, CR 702.105a: a player, not a planeswalker or battle), "Whenever this creature attacks while you have the
  // most life or are tied for most life": as it attacks; what happens to life totals later doesn't matter (rulings).
  // Seraphic Greatsword: "Whenever equipped creature attacks the player with the most life or tied for most life": the same,
  // about the creature it equips (rulings: not when it attacks a planeswalker).
  // The Spear of Bashenga: "Whenever equipped creature attacks the monarch, destroy target tapped nonland permanent that
  // player controls": the monarch as it attacks (CR 724), a player, not a planeswalker they control; "that player" is the
  // player attacked.
  const monarchAttacked = /^Whenever (~|equipped creature) attacks the monarch, (.+)$/.exec(line);
  if (monarchAttacked) {
    const t = parseTrigger(`Whenever ${monarchAttacked[1]} attacks, ${monarchAttacked[2]!.replace(/\bthat player\b/g, "defending player")}`);
    if (!t || t === "fail" || t.event !== "selfAttacks" || t.activeIf || t.attacksMostLife || t.attacksPlayer || t.ifCond) return "fail";
    return { ...t, attacksMonarch: true };
  }
  // Namor, Atlantean King: "Whenever ~ attacks a player who has more life than you, other creatures you control attacking
  // that player get +2/+0 until end of turn": a player (not a planeswalker) with more life than its controller as it
  // attacks (part of the event, not an intervening "if", CR 603.4); the creatures attacking that player as it resolves.
  const moreLife = /^Whenever ~ attacks a player who has more life than you, (.+)$/.exec(line);
  if (moreLife) {
    const rest = moreLife[1]!.replace(/\bother creatures you control attacking that player\b/, "other attacking creatures you control");
    const t = parseTrigger(`Whenever ~ attacks a player, ${rest}`);
    if (!t || t === "fail" || t.event !== "selfAttacks" || !t.attacksPlayer || t.activeIf || t.ifCond || t.attacksMostLife) return "fail";
    if (/\bthat player\b/.test(rest)) return "fail";
    if (rest === moreLife[1]) return { ...t, attacksMoreLife: true };
    const [e, ...more] = t.body.effects;
    if (more.length || e?.type !== "continuous" || e.what.ref !== "each" || e.what.filter.combat !== "attacking") return "fail";
    return { ...t, attacksMoreLife: true, body: { ...t.body, effects: [{ ...e, what: { ...e.what, filter: { ...e.what.filter, attackingWhom: "eventPlayer", text: "other creatures you control attacking that player" } } }], text: moreLife[1]! } };
  }
  // Owlbear Cub: "Whenever ~ attacks a player who controls eight or more lands, look at the top eight cards of your
  // library. You may put a creature card from among them onto the battlefield tapped and attacking that player. ...": a
  // player (not a planeswalker) controlling that many lands as it attacks (part of the event, not an intervening "if",
  // CR 603.4); "that player" is that player (CR 508.4).
  const landsAttack = new RegExp(`^Whenever ~ attacks a player who controls ${NUM} or more lands, (.+)$`).exec(line);
  if (landsAttack) {
    const rest = landsAttack[2]!.replace(/ onto the battlefield tapped and attacking that player\. /, " onto the battlefield tapped and attacking. ");
    if (rest === landsAttack[2] || /\bthat player\b/.test(rest)) return "fail";
    const t = parseTrigger(`Whenever ~ attacks a player, ${rest}`);
    if (!t || t === "fail" || t.event !== "selfAttacks" || !t.attacksPlayer || t.activeIf || t.ifCond || t.attacksMostLife || t.attacksMoreLife) return "fail";
    const digs = allEffects(t.body.effects).filter((e) => e.type === "dig");
    if (digs.length !== 1 || digs[0]!.type !== "dig" || !digs[0]!.attacking || digs[0]!.into !== "battlefield") return "fail";
    digs[0]!.attackingEvent = true;
    return { ...t, attacksPlayerLands: num(landsAttack[1]!), body: { ...t.body, text: landsAttack[2]! } };
  }
  const mostLife = /^Whenever (~|equipped creature) attacks (the player with the most life or tied for most life|while you have the most life or are tied for most life), (.+)$/.exec(line);
  if (mostLife && (mostLife[1] === "~" || mostLife[2]!.startsWith("the player"))) {
    mostLife.splice(1, 1);
    const t = parseTrigger(`Whenever ${/^Whenever equipped/.test(line) ? "equipped creature" : "~"} attacks, ${mostLife[2]!}`);
    if (!t || t === "fail" || t.event !== "selfAttacks" || t.activeIf || t.attacksMostLife || t.ifCond) return "fail";
    return mostLife[1]!.startsWith("the player") ? { ...t, attacksMostLife: true } : { ...t, activeIf: { kind: "youMostLife" } };
  }
  // Karazikar, the Eye Tyrant: "Whenever an opponent attacks another one of your opponents": once for each of your
  // opponents that one of your opponents attacks (CR 508.3e), not a planeswalker or battle; "the attacking player" is the
  // one who attacked. "Each draw a card and lose 1 life": both draw, then both lose the life.
  const oppAttacksOther = /^Whenever an opponent attacks another one of your opponents, (.+)$/.exec(line);
  if (oppAttacksOther) {
    const rest = oppAttacksOther[1]!.replace(/\bthe attacking player\b/g, "that attacking player").replace(/^you and that attacking player each draw a card and lose (\d+) life\.$/, "you and that attacking player each draw a card. You and that attacking player each lose $1 life.");
    const t = parseTrigger(`Whenever a player attacks one of your opponents, ${rest}`);
    if (!t || t === "fail" || t.event !== "playerAttacksYourOpponent" || t.anyOpponent || t.ifCond) return "fail";
    return { ...t, attackerOpponent: true, body: { ...t.body, text: oppAttacksOther[1]! } };
  }
  // Jolene, the Plunder Queen: "Whenever a player attacks one or more of your opponents": once for each declaration of
  // attackers that attacks any of them (CR 508.3e).
  const attacksOpp = /^Whenever a player attacks (one|one or more) of your opponents, (?:if that opponent has more life than another of your opponents, )?(.+)$/.exec(line);
  if (attacksOpp) {
    const text = attacksOpp[2]!;
    const oneOrMore = attacksOpp[1] === "one or more";
    // Combat Calligrapher: "that attacking player creates a tapped ... token ... that's attacking that opponent": theirs,
    // attacking the opponent attacked (CR 508.4), never declared as an attacker. Ellie, Brick Master: "... token named
    // Cordyceps Infected that's attacking that opponent", the same with the token's name.
    const inkling = !oneOrMore && !/, if that opponent/.test(line) ? /^that attacking player creates a tapped (.+? token(?: with [a-z, ]+)?(?: named [A-Z][A-Za-z' ]+?)?) that's attacking that opponent\.?$/.exec(text) : null;
    if (inkling) {
      const body = parseBody(`Create a ${inkling[1]} that's tapped and attacking that player.`, { eventPlayer: true });
      const e = body?.effects[0];
      if (!body || body.effects.length !== 1 || e?.type !== "createToken" || !e.attackingEvent || e.who.ref !== "you") return "fail";
      return { event: "playerAttacksYourOpponent", body: { ...body, effects: [{ ...e, who: { ref: "attackingPlayer" } }], text } };
    }
    if (oneOrMore && /, if that opponent/.test(line)) return "fail";
    if (/\bthat (?:opponent|player)\b/.test(text.replace(/\bthat attacking player\b/g, ""))) return "fail";
    const body = parseBody(text.replace(/\bthat attacking player\b/g, "that player").replace(/ and you put /, ". Put "), { eventPlayer: true });
    if (!body) return "fail";
    const json = JSON.stringify(body.effects).replaceAll('{"ref":"eventPlayer"}', '{"ref":"attackingPlayer"}');
    if (json.includes("eventPlayer")) return "fail";
    const ifCond = /, if that opponent has more life/.test(line) ? { ifCond: { kind: "eventPlayerMoreThanAnotherOpponent" as const, what: "life" as const } } : {};
    return { event: "playerAttacksYourOpponent", ...ifCond, ...(oneOrMore ? { anyOpponent: true as const } : {}), body: { ...body, effects: JSON.parse(json), text } };
  }
  // Coveted Jewel: "that player draws three cards and gains control of ~. Untap it." (two instructions for that player, then
  // untapping ~).
  // Neyith of the Dire Hunt: "Whenever one or more creatures you control fight or become blocked, draw a card."
  const fightOrBlocked = /^Whenever one or more creatures you control fight or become blocked, (.+)$/.exec(line);
  if (fightOrBlocked) {
    const body = parseBody(fightOrBlocked[1]!, {});
    return body ? { event: "yourCreaturesFightOrBlocked", body } : "fail";
  }
  // Hezrou: "Whenever one or more creatures you control become blocked, each blocking creature gets -1/-1 until end of
  // turn": once as blockers are declared (CR 509.3c), every creature blocking then.
  const becomeBlocked = /^Whenever one or more creatures you control become blocked, (.+)$/.exec(line);
  if (becomeBlocked) {
    const body = parseBody(becomeBlocked[1]!, {});
    return body ? { event: "yourCreaturesBecomeBlocked", body } : "fail";
  }
  const unblocked = /^Whenever one or more creatures an opponent controls attack you and aren't blocked, (.+)$/.exec(line);
  if (unblocked) {
    const text = unblocked[1]!.replace(/^that player (draws [a-z]+ cards?) and (gains control of ~)\. Untap it\.$/, "That player $1. That player $2. Untap ~.");
    const body = parseBody(text, { eventPlayer: true });
    return body ? { event: "opponentCreaturesUnblocked", body: { ...body, text: unblocked[1]! } } : "fail";
  }
  // Psychic Surgery: "you may look at the top two cards of that library. You may exile one of those cards. Then put the
  // rest on top of that library in any order": that player's library.
  const shuffles = /^Whenever an opponent shuffles their library, (.+)$/.exec(line);
  if (shuffles) {
    const body = parseBody(theyAreThatPlayer(shuffles[1]!.replace(/\bthat library\b/g, "that player's library")), { eventPlayer: true });
    return body ? { event: "opponentShufflesLibrary", body: { ...body, text: shuffles[1]! } } : "fail";
  }
  const causes = /^Whenever a spell or ability causes (a player|its controller) to shuffle their library, (.+)$/.exec(line);
  if (causes) {
    const body = parseBody(causes[2]!, { eventPlayer: true });
    return body ? { event: causes[1] === "a player" ? "effectShufflesLibrary" : "effectShufflesOwnLibrary", body: { ...body, text: causes[2]! } } : "fail";
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
  // Aboleth Spawn: "that ability" is the entering creature's own triggered ability, put on the stack just below this one
  // (rulings).
  const entersCauses = /^Whenever a creature entering under an opponent's control causes a triggered ability of that creature to trigger, (.+)$/.exec(line);
  if (entersCauses) {
    const body = parseBody(entersCauses[1]!, { activatedAbility: true });
    return body ? { event: "opponentEntersCausesTrigger", body } : "fail";
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
  const destroyed = parseDestroyedTrigger(line);
  if (destroyed) return destroyed;
  const group = parseGroupTrigger(line);
  if (group) return group;
  const exploits = parseExploitsTrigger(line);
  if (exploits) return exploits;
  const discards = parseDiscardTrigger(line);
  if (discards) return discards;
  // "When ~ is put into a graveyard from anywhere, shuffle it into its owner's library" (CR 603.6c): "it" is the card in
  // the graveyard, and its owner controls the ability there (CR 603.3a), so "its owner" is "you".
  // Golgari Brownscale: "When ~ is put into your hand from your graveyard, you gain 2 life": the card's ability in the hand,
  // however it got there, dredge or not (rulings); a trigger that can't happen on the battlefield works where it can
  // (CR 113.6k).
  const toHand = /^When ~ is put into your hand from your graveyard, (.+)$/.exec(line);
  if (toHand) {
    const body = parseBody(toHand[1]!, {});
    return body && !/\b(?:it|~)\b/.test(toHand[1]!) ? { event: "selfToHandFromGraveyard", body } : "fail";
  }
  const anywhere = /^When ~ is put into (?:a|your) graveyard from anywhere, (.+)$/.exec(line);
  if (anywhere) {
    const body = parseBody(anywhere[1]!.replace(/^its owner shuffles their graveyard into their library/, "shuffle your graveyard into your library"), { selfCard: true });
    return body ? { event: "selfToGraveyardAnywhere", body } : "fail";
  }
  // Narcomoeba: "When ~ is put into your graveyard from your library, you may put it onto the battlefield": the same, a
  // card goes only to its owner's graveyard (CR 400.3).
  const fromLibrary = /^When ~ is put into your graveyard from your library, (.+)$/.exec(line);
  if (fromLibrary) {
    const body = parseBody(fromLibrary[1]!, { selfCard: true });
    return body ? { event: "selfToGraveyardFromLibrary", body } : "fail";
  }
  // "When you cycle ~" (CR 702.29c): "it" is the card, wherever it went.
  const cycled = /^When you cycle ~, (.+)$/.exec(line);
  if (cycled) {
    // Magmakin Artillerist: "it deals 1 damage to each opponent": the card is the source (CR 702.29c).
    const body = parseBody(cycled[1]!.replace(/^it deals /, "~ deals "), { selfCard: true });
    return body ? { event: "selfCycled", body } : "fail";
  }
  // "When ~ becomes plotted" (CR 702.170a, 702.170c): the card in exile, "it" the card as the source (Longhorn
  // Sharpshooter: "it deals 2 damage to any target").
  const plottedT = /^When ~ becomes plotted, (.+)$/.exec(line);
  if (plottedT) {
    const body = parseBody(plottedT[1]!.replace(/^it deals /, "~ deals "), { selfCard: true });
    return body ? { event: "selfPlotted", body } : "fail";
  }
  // "When you discard ~" (Titanbones, Towering Heart, Edgar's Awakening): the card's ability, wherever the discard put it
  // (CR 701.9a; like cycling, CR 702.29c), its owner controlling it (CR 113.8).
  const discarded = /^When you discard ~, (.+)$/.exec(line);
  if (discarded) {
    const body = parseBody(discarded[1]!, { selfCard: true });
    return body ? { event: "selfDiscarded", body } : "fail";
  }
  // "When a spell or ability an opponent controls causes you to discard ~" (Sand Golem, Metrognome, Psychic Purge): the
  // same, only for a discard that's an effect of a spell or ability an opponent controls, not a cost (rulings on Psychic
  // Purge); a choice that spell or ability gave you counts (rulings on Ajani's Last Stand). "That player" is that opponent.
  // Guerrilla Tactics: "it deals 4 damage" (the card is the source, rulings). Quagnoth: "return it to your hand" from
  // wherever it went (rulings: from exile too).
  const discardedBy = /^When a spell or ability an opponent controls causes you to discard ~, (.+)$/.exec(line);
  if (discardedBy) {
    const text = discardedBy[1]!.replace(/^it deals /, "~ deals ");
    const body: AbilityBody | null = text === "return it to your hand." ? { targets: [], effects: [{ type: "bounce", what: { ref: "selfCard" } }], text } : parseBody(text, { selfCard: true, eventPlayer: true });
    return body ? { event: "selfDiscarded", discardedByOpponent: true, body } : "fail";
  }
  // A state trigger (CR 603.8): "When you control no Islands, sacrifice ~."
  // "When you have 30 or more life, flip ~" (Rune-Tail), "When ~ has flying, flip it" (Student of Elements).
  // "When you control seven or more Thrulls, sacrifice ~" (Endrek Sahr).
  // The Millennium Calendar: "When there are 1,000 or more time counters on ~, sacrifice it and each opponent loses 1,000
  // life": "1,000" is a number.
  // Mazemind Tome: "When there are four or more page counters on ~, exile it. If you do, you gain 4 life."
  // Homarid: "Whenever there are four or more tide counters on ~, remove all tide counters from it": the same state
  // trigger (CR 603.8), not again until it has left the stack.
  const many = new RegExp(`^When(?:ever)? there are (\\d{1,3}(?:,\\d{3})*|${NUM.replace(/^\(/, "(?:")}) or more ([a-z]+) counters on ~, (.+)$`).exec(line);
  if (many) {
    const body = parseBody(many[3]!.replace(/\b(\d{1,3}),(\d{3})\b/g, "$1$2"), { selfIt: true });
    const min = /^[\d,]+$/.test(many[1]!) ? Number(many[1]!.replace(/,/g, "")) : num(many[1]!);
    return body && Number.isInteger(min) && min > 0 ? { event: "state", state: { kind: "selfCounters", counter: many[2]!, min }, body } : "fail";
  }
  // Afiya Grove: "When ~ has no +1/+1 counters on it, sacrifice it." (CR 603.8).
  const none = /^When ~ has no ([+-]1\/[+-]1|[a-z]+) counters on it, (.+)$/.exec(line);
  if (none) {
    const body = parseBody(none[2]!, { selfIt: true });
    return body ? { event: "state", state: { kind: "selfCounters", counter: none[1]!, min: 0, max: 0 }, body } : "fail";
  }
  // Bronze Bombshell: "When a player other than this creature's owner controls it, that player sacrifices it. If the player
  // does, this creature deals 7 damage to the player." A state trigger (CR 603.8) controlled by that player; if it has
  // changed controllers before it resolves, it can't be sacrificed and deals no damage (rulings, CR 701.21a).
  const notOwner = /^When a player other than ~'s owner controls it, that player sacrifices it\. If the player does, ~ deals (\d+) damage to the player\.$/.exec(line);
  if (notOwner) {
    const body = parseBody(`Sacrifice ~. If you do, ~ deals ${notOwner[1]} damage to you.`, { selfIt: true });
    return body ? { event: "state", state: { kind: "selfIs", filter: { kind: "object", types: [], owner: "opponent", text: "controlled by a player other than its owner" } }, body } : "fail";
  }
  // Lurking Jackals: "When an opponent has 10 or less life", Opal Avenger: "When you have 10 or less life", Veiled
  // Crocodile: "When a player has no cards in hand", Hidden Predators: "When an opponent controls a creature with power 4
  // or greater", Endangered Armodon: "When you control a creature with toughness 2 or less", Goblins of the Flarg: "When
  // you control a Dwarf". Drop of Honey: "When there are no creatures on the battlefield": anyone's; it's sacrificed even if
  // one is back by the time it resolves (rulings).
  // Last Laugh: "When no creatures are on the battlefield" is the same.
  // Garruk Relentless: "When ~ has two or fewer loyalty counters on him, transform him": "him" is ~ (CR 603.8).
  // Olivia, Crimson Bride's grant: "When you don't control a legendary Vampire, exile this creature": the same as "When you
  // control no legendary Vampires" (CR 603.8), the creature itself counting if it's one.
  const stLine = line.replace(/^(When ~ has [a-z ]+ counters) on ~, (transform ~\.)$/, "$1 on it, $2").replace(/^When you don't control an? ((?:legendary )?[A-Z][a-z]+), /, "When you control no $1s, ");
  const st = new RegExp(`^When (you control no .+?|there are no creatures on the battlefield|no creatures are on the battlefield|you control ${NUM} or more [A-Za-z]+?|you have ${NUM} or (?:more|less) life|an opponent has ${NUM} or less life|a player has no cards in hand|(?:you|an opponent) controls? an? (?:[A-Z][a-z]+|creature with (?:power|toughness) ${NUM} or (?:greater|less))|~ has [a-z ]+), (.+)$`).exec(stLine);
  if (st) {
    const state = parseStaticCondition(st[1]!.replace(/^no creatures are on the battlefield$/, "there are no creatures on the battlefield"), { affects: { kind: "self" }, mods: [], text: "" });
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
  // Captain America, Living Legend: "Whenever a creature you control becomes tapped during your turn, if it's the first
  // time that creature has become tapped this turn, untap it": during your turn, whether it triggers at all; the first
  // time is an intervening if (CR 603.4), checked again as it resolves.
  const tappedFirst = /^Whenever (an? [^,]+?) becomes tapped during your turn, if it's the first time that (?:creature|permanent) has become tapped this turn, (.+)$/.exec(line);
  if (tappedFirst) {
    const t = parseTrigger(`Whenever ${tappedFirst[1]} becomes tapped, ${tappedFirst[2]}`);
    return t && t !== "fail" && t.event === "permanentBecomesTapped" && !t.activeIf && !t.ifCond ? { ...t, activeIf: { kind: "yourTurn" }, ifCond: { kind: "subjectFirstTapThisTurn" } } : "fail";
  }
  // Tale of Katara and Toph (granted): "Whenever this creature becomes tapped for the first time during each of your
  // turns": only during its controller's turn, and only the first time it becomes tapped that turn (GameObject.tapsThisTurn);
  // a trigger condition, not an intervening if (CR 603.2, 603.4).
  const tappedFirstYours = /^Whenever ~ becomes tapped for the first time during each of your turns, (.+)$/.exec(line);
  if (tappedFirstYours) {
    const t = parseTrigger(`Whenever ~ becomes tapped, ${tappedFirstYours[1]}`);
    return t && t !== "fail" && t.event === "selfBecomesTapped" && !t.activeIf && !t.firstEachTurn ? { ...t, activeIf: { kind: "yourTurn" }, firstEachTurn: true } : "fail";
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
  // Flayer of the Hatebound: "Whenever ~ or another creature enters from your graveyard": a creature card you own put onto
  // the battlefield from there, under anyone's control.
  const orAnotherFromYard = /^Whenever ~ or another creature enters from your graveyard, (.+)$/.exec(line);
  if (orAnotherFromYard) {
    const t = parseTrigger(`Whenever ~ or another creature enters, ${orAnotherFromYard[1]}`);
    return !t || t === "fail" || t.event !== "permanentEnters" || t.ifFromGraveyard ? "fail" : { ...t, ifFromGraveyard: "yours" };
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
  // Jokulmorder: "Whenever you play an Island": playing a land with that subtype (CR 305.1), as it is on the battlefield.
  const playType = /^Whenever you play an? (Plains|Island|Swamp|Mountain|Forest), (.+)$/.exec(line);
  if (playType) {
    const t = parseTrigger(`Whenever you play a land, ${playType[2]}`);
    return !t || t === "fail" || t.event !== "youPlayLand" || t.subjectFilter ? "fail" : { ...t, subjectFilter: { kind: "object", types: ["Land"], subtypes: [playType[1]!], text: playType[1]! } };
  }
  // Hidden Herd: "When an opponent plays a nonbasic land" (CR 305.1): playing one, not one put onto the battlefield
  // (rulings).
  const oppPlays = /^When(?:ever)? an opponent plays a nonbasic land, (.+)$/.exec(line);
  if (oppPlays) {
    const t = parseTrigger(`Whenever an opponent plays a land, ${oppPlays[1]}`);
    return !t || t === "fail" || t.event !== "opponentPlaysLand" || t.subjectFilter ? "fail" : { ...t, subjectFilter: { kind: "object", types: ["Land"], notSupertypes: ["Basic"], text: "nonbasic land" } };
  }
  // Elvish Mariner: "Whenever you scry, tap up to X target nonland permanents, where X is the number of cards looked at
  // while scrying this way": how many cards that scry looked at (CR 701.22a), known as it triggers, so it can count
  // targets (CR 601.2c, 603.3d; TriggeredAbility.eventX).
  // Celeborn the Wise: "~ gets +1/+1 until end of turn for each card looked at while scrying this way": +X/+X, the same X.
  const scryEach = /^Whenever you scry, ~ gets \+1\/\+1 until end of turn for each card looked at while scrying this way\.$/.test(line);
  if (scryEach) return parseTrigger("Whenever you scry, ~ gets +X/+X until end of turn, where X is the number of cards looked at while scrying this way.");
  // Froghemoth: "Whenever ~ deals combat damage to a player, exile up to that many target cards from their graveyard. ...":
  // as many targets as the damage dealt, known as it triggers (CR 601.2c, 603.3d; TriggeredAbility.eventX).
  const hitMany = /^Whenever ~ deals combat damage to a player, exile up to that many target cards from (?:their|that player's) graveyard\. (.+)$/.exec(line);
  if (hitMany) {
    const body = parseBody(`Exile up to X target cards from that player's graveyard. ${hitMany[1]}`, { ownX: true, eventPlayer: true });
    return body ? { event: "selfDealsCombatDamageToPlayer", body: { ...body, text: line.replace(/^Whenever ~ deals combat damage to a player, /, "") }, eventX: true } : "fail";
  }
  const scryX = /^Whenever you scry, (.+), where X is the number of cards looked at while scrying this way\.$/.exec(line);
  if (scryX) {
    const body = parseBody(`${scryX[1]}.`, { ownX: true });
    return body ? { event: "youScry", body, eventX: true } : "fail";
  }
  // "When ~ enters untapped, ..." (Mystic Sanctuary): entering untapped is part of the trigger event.
  const untapped = /^When(?:ever)? ~ enters untapped, (.+)$/.exec(line);
  if (untapped) {
    const t = parseTrigger(`When ~ enters, ${untapped[1]}`);
    return !t || t === "fail" || t.event !== "selfEnters" ? "fail" : { ...t, ifEnteredUntapped: true };
  }
  // "Whenever ~ deals 4 or more damage, ..." (Spinneret and Spiderling): one damage event, all it deals at once to any
  // number of recipients (CR 120.3, the event summed per source as for "whenever ~ deals damage"), at least that much.
  // Innocent Bystander: "Whenever ~ is dealt 3 or more damage": that much at one time, not added up over the turn
  // (rulings), all the damage dealt to it at once one event.
  const dealtMin = /^Whenever ~ is dealt (one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more damage, (.+)$/.exec(line);
  if (dealtMin) {
    const t = parseTrigger(`Whenever ~ is dealt damage, ${dealtMin[2]}`);
    return !t || t === "fail" || t.event !== "selfIsDealtDamage" || t.minDamage ? "fail" : { ...t, minDamage: num(dealtMin[1]!) };
  }
  // Hercules, Olympian Hero: "Whenever ~ is dealt damage for the first time each turn": its first damage event this turn.
  // Mighty Servant of Leuk-o: "Whenever this Vehicle becomes crewed for the first time each turn, if it was crewed by
  // exactly two creatures, ...": the creatures tapped for the crew cost of the ability that crewed it (rulings), a fact
  // of that event, so the same as it resolves (CR 603.4).
  const crewedFirst = /^Whenever ~ becomes crewed for the first time each turn, (?:if it was crewed by exactly (two|three|four) creatures, )?(.+)$/.exec(line);
  if (crewedFirst) {
    const t = parseTrigger(`Whenever ~ becomes crewed, ${crewedFirst[2]}`);
    return !t || t === "fail" || t.event !== "selfBecomesCrewed" ? "fail" : { ...t, firstEachTurn: true, ...(crewedFirst[1] ? { crewedBy: num(crewedFirst[1]) } : {}) };
  }
  const dealtFirst = /^Whenever ~ is dealt damage for the first time each turn, (.+)$/.exec(line);
  if (dealtFirst) {
    const t = parseTrigger(`Whenever ~ is dealt damage, ${dealtFirst[1]}`);
    return !t || t === "fail" || t.event !== "selfIsDealtDamage" ? "fail" : { ...t, firstDealtEachTurn: true };
  }
  const selfMin = /^Whenever ~ deals (one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more damage, (.+)$/.exec(line);
  if (selfMin) {
    const t = parseTrigger(`Whenever ~ deals damage, ${selfMin[2]}`);
    return !t || t === "fail" || t.event !== "selfDealsDamage" || t.minDamage ? "fail" : { ...t, minDamage: num(selfMin[1]!) };
  }
  // Zariel, Archduke of Avernus's emblem: "At the end of the first combat phase on your turn": end of combat (CR 511.2) of
  // the turn's first combat phase only (CR 506.1), not of an additional one.
  const firstEndCombat = /^At the end of the first combat phase on your turn, (.+)$/.exec(line);
  if (firstEndCombat) {
    const t = parseTrigger(`At end of combat on your turn, ${firstEndCombat[1]}`);
    return !t || t === "fail" || t.event !== "yourEndCombat" || t.activeIf ? "fail" : { ...t, activeIf: { kind: "phase", phase: "combat", first: true, yours: true } };
  }
  for (const [re, event] of TRIGGERS) {
    const m = re.exec(line);
    if (m) {
      // "When ~ enters, it deals 2 damage...": in a trigger about the permanent itself, a leading "it" is that permanent.
      const self = SELF_EVENTS.includes(event);
      // "When ~ enters, if it was kicked, ...": an intervening if (CR 603.4) on how it was cast.
      let body0 = m[1]!;
      let ifKicked: SpellCondition | undefined;
      // Archangel of Wrath: "if it was kicked twice": both of its two kicker costs paid (each at most once, rulings).
      const kicked = /^if (?:it|~) was kicked(?: with its ((?:\{[^}]+\})+) kicker| (twice))?, (.+)$/i.exec(body0);
      if (kicked) {
        // "When you cast ~, if it was kicked, exile target land." (Sowing Mycospawn): the spell as it was cast.
        if (event !== "selfEnters" && event !== "selfCast") return "fail" as const;
        ifKicked = { kind: "kicked", ...(kicked[1] ? { cost: kicked[1] } : {}), ...(kicked[2] ? { times: 2 } : {}) };
        body0 = kicked[3]!;
      }
      // "When ~ enters, if it was bargained, ..." (CR 702.166b).
      let ifBargained = false;
      const bargained = /^if it was bargained, (.+)$/i.exec(body0);
      if (bargained) {
        if (event !== "selfEnters") return "fail" as const;
        ifBargained = true;
        body0 = bargained[1]!;
      }
      // "When it enters this way" after "~ escapes with ..." (Pharika's Spawn), written here as "if it escaped": it triggers
      // only when it escaped (CR 702.138c), with no check as it resolves.
      let ifEscaped = false;
      const escapedM = /^if it escaped, (.+)$/i.exec(body0);
      if (escapedM) {
        if (event !== "selfEnters") return "fail" as const;
        ifEscaped = true;
        body0 = escapedM[1]!;
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
        // Drowner of Truth: "When you cast ~, if {C} was spent to cast it, ...": the same, as the spell is cast.
        if ((event !== "selfEnters" && event !== "selfCast") || !req) return "fail" as const;
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
      // "If he was cast" (Anti-Venom, Horrifying Healer), read as "if ~ was cast": the same.
      const wasCast = /^if (?:you cast it|it was cast|~ was cast), (.+)$/i.exec(body0);
      if (wasCast) {
        if (event !== "selfEnters") return "fail" as const;
        ifCast = true;
        body0 = wasCast[1]!;
      }
      // Addendum on a permanent: "When this Aura enters, if you cast it during your main phase, ..." (Sentinel's Mark): an
      // intervening if (CR 603.4) on how it was cast (CR 207.2c), which can't change.
      let ifCastInMain = false;
      const inMain = /^if you cast it during your main phase, (.+)$/i.exec(body0);
      if (inMain) {
        if (event !== "selfEnters") return "fail" as const;
        ifCastInMain = true;
        body0 = inMain[1]!;
      }
      // "When ~ dies, if it had no counters on it, return it ..." (Unstoppable Slasher): an intervening if (CR 603.4) on the
      // creature as it last existed (CR 603.10a), which can't change.
      let ifNoCounters: string | undefined;
      // Deadly Grub: "if it had no time counters on it", of that kind.
      const noCounters = /^if it had no (?:([a-z]+) )?counters on it, (.+)$/i.exec(body0);
      if (noCounters) {
        if (event !== "selfDies") return "fail" as const;
        ifNoCounters = noCounters[1] ?? "any";
        body0 = noCounters[2]!;
      }
      // "When ~ dies, if it had a revival counter on it, return it to the battlefield with one fewer revival counter on it
      // at the beginning of the next end step" (Nine-Lives Familiar): an intervening if (CR 603.4) on the creature as it
      // last existed (CR 603.10a), and the counters it comes back with counted from that too.
      let ifHadCounter: string | undefined;
      // Promising Duskmage: "if it had a +1/+1 counter on it".
      const hadKind = /^if it had an? ([a-z]+|\+1\/\+1|-1\/-1) counter on it, (.+)$/.exec(body0);
      if (hadKind) {
        if (event !== "selfDies") return "fail" as const;
        ifHadCounter = hadKind[1]!;
        body0 = hadKind[2]!;
      }
      // Ochre Jelly: "if it had two or more +1/+1 counters on it", at least that many of that kind.
      let ifHadCounterMin: number | undefined;
      const hadMany = /^if it had (two|three|four|five) or more (\+1\/\+1|-1\/-1|[a-z]+) counters on it, (.+)$/.exec(body0);
      if (hadMany) {
        if (event !== "selfDies" || ifHadCounter) return "fail" as const;
        ifHadCounter = hadMany[2]!;
        ifHadCounterMin = ["two", "three", "four", "five"].indexOf(hadMany[1]!) + 2;
        body0 = hadMany[3]!;
      }
      // The Zubera: "When ~ dies, if 4 or more damage was dealt to it this turn, ...": an intervening if (CR 603.4) on damage
      // that can't change once it's gone.
      let ifDamaged: number | undefined;
      const damagedM = /^if (\d+) or more damage was dealt to it this turn, (.+)$/.exec(body0);
      if (damagedM) {
        if (event !== "selfDies") return "fail" as const;
        ifDamaged = Number(damagedM[1]);
        body0 = damagedM[2]!;
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
      const notToken = /^if it(?:'s not| isn't) a token, (.+)$/i.exec(body0);
      if (notToken) {
        // "When ~ enters, if it's not a token" (Life of the Party): a token is one for as long as it exists.
        if (event !== "selfDies" && event !== "selfEnters") return "fail" as const;
        ifNotToken = true;
        body0 = notToken[1]!;
      }
      // Otherworldly Escort: "When ~ dies, if it's not a Spirit, ...": an intervening if (CR 603.4) on the creature as it last
      // existed (CR 603.10a), which can't change.
      let ifNotSubtype: string | undefined;
      const notSub = /^if it's not an? ([A-Z][a-z]+), (.+)$/.exec(body0);
      if (notSub && CREATURE_TYPES.has(notSub[1]!)) {
        if (event !== "selfDies") return "fail" as const;
        ifNotSubtype = notSub[1]!;
        body0 = notSub[2]!;
      }
      // Guildsworn Prowler: "When ~ dies, if it wasn't blocking, ...": an intervening if (CR 603.4) on the creature as it last
      // existed (CR 603.10a).
      let ifNotBlocking = false;
      const notBlocking = /^if it wasn't blocking, (.+)$/i.exec(body0);
      if (notBlocking) {
        if (event !== "selfDies") return "fail" as const;
        ifNotBlocking = true;
        body0 = notBlocking[1]!;
      }
      // Fyndhorn Druid: "When ~ dies, if it was blocked this turn, ...": as it last existed (CR 603.10a), blocked once
      // blockers were declared for it, even if they left since (CR 509.1h).
      let ifBlockedThisTurn = false;
      const blockedM = /^if it was blocked this turn, (.+)$/i.exec(body0);
      if (blockedM) {
        if (event !== "selfDies") return "fail" as const;
        ifBlockedThisTurn = true;
        body0 = blockedM[1]!;
      }
      // Wave of Rats: "When ~ dies, if it dealt combat damage to a player this turn, ...": as it last existed (CR 603.10a),
      // that object's combat damage to any player this turn (turnLog.combatDamagedBy), which can't change once it's gone.
      let ifDealtCombatDamage = false;
      const dealtM = /^if it dealt combat damage to a player this turn, (.+)$/i.exec(body0);
      if (dealtM) {
        if (event !== "selfDies") return "fail" as const;
        ifDealtCombatDamage = true;
        body0 = dealtM[1]!;
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
      // "If its madness cost was paid" (Grave Scrabbler): cast for its madness cost (CR 702.35b).
      let ifAlt: "sneak" | "surge" | "spectacle" | "webSlinging" | "prowl" | "madness" | undefined;
      const altPaid = /^if (?:its|his|her|their) (sneak|surge|spectacle|prowl|madness) cost was paid, (.+)$/i.exec(body0) ?? /^if (?:it|he|she|they) (?:was|were) cast using (web-slinging), (.+)$/i.exec(body0);
      if (altPaid) {
        if (event !== "selfEnters") return "fail" as const;
        ifAlt = altPaid[1] === "web-slinging" ? "webSlinging" : (altPaid[1]!.toLowerCase() as "sneak" | "surge" | "spectacle" | "prowl" | "madness");
        body0 = altPaid[2]!;
      }
      // "If a source would deal damage ..., it deals that much damage plus 2 instead" (Rankle and Torbran): that "that much"
      // is the replaced damage's own, not the event's.
      let text = (self ? body0.replace(/^(?:it|he|she) (?=(?:gets|gains|deals|has|becomes|fights|explores)\b)/, "~ ").replace(/^(?:it|he|she) and (?=other )/, "~ and ") : body0).replace(/(would deal [^.]*?damage[^.]*?, it deals )that much( damage)/g, "$1THAT_MUCH$2")
        // Neheb, Dreadhorde Champion: "you may discard any number of cards. If you do, draw that many cards and add that
        // much {R}": how many were discarded, not the damage.
        .replace(/(discard any number of cards\. If you do, draw )that many( cards and add )that much( \{[WUBRGC]\})/, "$1THAT_MANY$2THAT_MUCH$3");
      // Desmond Miles: "surveil X, where X is the amount of damage it dealt to that player": that much.
      if (event === "selfDealsCombatDamageToPlayer" && !/\bthat (?:much|many)\b/.test(text)) text = text.replace(/^([^X]*)\bX\b([^X]*), where X is the amount of damage (?:it|~) dealt to that player\.$/, "$1that many$2.");
      // Jagged Poppet: "that player discards cards equal to the damage": that many, the combat damage dealt to them.
      if (event === "selfDealsCombatDamageToPlayer" && !/\bthat (?:much|many)\b/.test(text)) text = text.replace(/^that player discards cards equal to the damage\.$/, "that player discards that many cards.");
      // Kotis, the Fangkeeper: "exile the top X cards of their library, where X is the amount of damage dealt. You may cast
      // any number of spells with mana value X or less from among them ...": the same X, that damage, in both sentences.
      if (event === "selfDealsCombatDamageToPlayer" && !/\bthat (?:much|many)\b/.test(text)) text = text.replace(/^([^X.]*)\bX\b([^X.]*), where X is the amount of damage dealt\. ([^X.]*)\bX\b([^X.]*\.)$/, "$1that many$2. $3that many$4");
      // Storm the Citadel's grant: "Whenever this creature deals combat damage to a player or planeswalker, destroy target
      // artifact or enchantment defending player controls": the player dealt the damage, or the planeswalker's controller
      // (rulings), which is the trigger's player (see the planeswalker's combatDamageToPlayer event).
      const pwDefending = event === "selfDealsCombatDamageToPlayer" && /^Whenever ~ deals combat damage to a player or planeswalker, /.test(line) && !/\bthat player\b/.test(text) && /\bdefending player controls\b/.test(text);
      if (pwDefending) text = text.replace(/\bdefending player controls\b/g, "that player controls");
      // Field-Tested Frying Pan's grant: "~ gets +X/+X until end of turn, where X is the amount of life you gained": that much.
      if (event === "youGainLife" && !/\bthat (?:much|many)\b/.test(text)) text = text.replace(/^(.*\bX\b.*), where X is the amount of life you gained\.$/, (_, body: string) => `${body.replace(/\bX\b/g, "that much")}.`);
      // Cradle of Vitality: "put a +1/+1 counter on target creature for each 1 life you gained": one counter per life of
      // that one life-gaining event (rulings), as "that many".
      if (event === "youGainLife") text = text.replace(/\bput a \+1\/\+1 counter on (target creature) for each 1 life you gained\.$/, "put that many +1/+1 counters on $1.");
      // False Cure: "that player loses 2 life for each 1 life they gained": twice the life of that one life-gaining event.
      if (event === "playerGainsLife") text = text.replace(/^that player loses 2 life for each 1 life they gained\.$/, "that player loses twice that much life.");
      // "You gain that much life", "put that many +1/+1 counters on it": the damage the event dealt, or the life gained or lost.
      const playerDealt = event === "youAreDealtDamage" || event === "youAreDealtCombatDamage" || event === "opponentIsDealtDamage" || event === "opponentIsDealtNoncombatDamage" || event === "enchantedPlayerDealtDamage" || event === "youDamagePrevented" || event === "chosenPlayerDealtDamage";
      // Sower of Discord: the trigger's player is the other chosen one (see effects/triggers.ts).
      if (event === "chosenPlayerDealtDamage") {
        if (!/^the other chosen player also loses that much life\.$/.test(text)) return "fail" as const;
        text = "that player loses that much life.";
      }
      const amount = event === "selfDealsDamage" || event === "selfIsDealtDamage" || event === "selfIsDealtNoncombatDamage" || event === "selfIsDealtCombatDamage" || event === "selfDealtDamageBySource" || event === "selfDealsCombatDamage" || event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "youGainLife" || event === "opponentGainsLife" || event === "playerGainsLife" || event === "opponentLosesLife" || event === "playerLosesLife" || event === "youLoseLife" || event === "youPayLife" || event === "youUntapInUntapStep" || playerDealt;
      // "With mana value less than or equal to that damage" (Aisha of Sparks and Smoke, Covert Technician): the damage dealt.
      const damage = amount && event !== "youGainLife" && event !== "opponentGainsLife" && event !== "playerGainsLife" && event !== "opponentLosesLife" && event !== "playerLosesLife" && event !== "youLoseLife" && event !== "youPayLife" && event !== "youUntapInUntapStep" && !playerDealt;
      const thatMuch = amount && (/\bthat (?:much|many)\b/.test(text) || (damage && /\bless than or equal to that damage\b/.test(text)));
      if (thatMuch) {
        if (/\bX\b/.test(text)) return "fail" as const;
        text = text.replace(/\bthat (?:much|many)\b/g, "X");
        if (damage) text = text.replace(/\bless than or equal to that damage\b/g, "less than or equal to X");
      }
      text = text.replace(/THAT_MUCH/g, "that much").replace(/THAT_MANY/g, "that many");
      // "Put a +1/+1 counter on it", "untap it": in a trigger about the permanent itself, "it" is that
      // permanent, except after it left ("return it to your hand" means the card in the graveyard).
      const left = event === "selfDies" || event === "selfDiesOrExiled" || event === "selfExiledCrafting" || event === "selfToGraveyard" || event === "selfLeaves";
      if (event === "selfDealtDamageBySource") text = text.replace(/\bthat source's controller\b/g, "that player");
      if (event === "selfAttacksUnblocked" && /^Whenever ~ attacks a player and isn't blocked, /.test(line)) text = text.replace(/\b[Tt]hat player\b/g, (w) => (w[0] === "T" ? "Defending player" : "defending player"));
      // "At the beginning of each player's upkeep, ~ deals 1 damage to them" (Roiling Vortex): that player.
      if (event === "eachUpkeep" || event === "eachDrawStep") text = text.replace(/^~ deals (\d+) damage to them\.$/, "~ deals $1 damage to that player.");
      // "At the beginning of each postcombat main phase, the active player adds ..." (Belbe): that player is the active one.
      if (event === "eachUpkeep" || event === "eachDrawStep" || event === "eachFirstMain" || event === "eachPostcombatMain") text = text.replace(/\bthe active player\b/g, "that player");
      // Alexios: "that player gains control of ~, untaps it, .... It gains haste until end of turn": "it" is still ~.
      if (event === "eachUpkeep") text = text.replace(/^(that player gains control of ~[^.]*\.) It gains /, "$1 ~ gains ");
      // Body Launderer: "When ~ dies, return another target non-Rogue creature card with equal or lesser power from your
      // graveyard": ~'s power as it last existed (rulings), fixed as the target is chosen (TargetSpec.bound).
      // Unquenchable Fury, Zodiac Dragon: "When ~ is put into your graveyard from the battlefield, (you may) return it to your
      // hand": the card, which only triggers this from its owner's graveyard (ownGraveyard below).
      if (event === "selfToGraveyard" && /^When(?:ever)? ~ is put into your graveyard/.test(line)) text = text.replace(/^((?:you may )?)return it to your hand\.$/, "$1return ~ to its owner's hand.");
      const lesserPower = event === "selfDies" && / card with equal or lesser power from your graveyard\b/.test(text);
      if (lesserPower) text = text.replace(/ with equal or lesser power\b/, "");
      // Souls of the Faultless: "Whenever ~ is dealt combat damage, you gain that much life and attacking player loses that
      // much life": the attacking player is the active player (CR 506.2), parsed as "that player" and then made that one.
      const attackingPlayer = event === "selfIsDealtCombatDamage" && /\battacking player\b/.test(text) && !/\b(?:that|defending|the active) player\b/.test(text);
      if (attackingPlayer) text = text.replace(/\battacking player\b/g, "that player");
      let body = parseBody(text, { selfIt: self && !left, selfCard: left, eventPlayer: attackingPlayer || event === "selfDealsCombatDamageToPlayer" || event === "selfDealsDamageToPlayer" || event === "eachUpkeep" || event === "eachDrawStep" || event === "eachFirstMain" || event === "eachPostcombatMain" || (event === "eachEndStep" && /^At the beginning of each player's end step, /.test(line)) || event === "opponentLosesLife" || event === "playerLosesLife" || event === "opponentBecomesMonarch" || event === "anotherPlayerLosesGame" || event === "opponentGainsLife" || event === "playerGainsLife" || event === "selfDealtDamageBySource" || event === "opponentIsDealtDamage" || event === "opponentIsDealtNoncombatDamage" || event === "enchantedPlayerDealtDamage" || event === "chosenPlayerDealtDamage" || event === "opponentPlaysLand" || event === "playerPlaysLand", defending: event === "selfAttacks" || event === "selfBecomesBlocked" || event === "selfAttacksUnblocked" || event === "selfAttacksAlone", selfCastSpell: event === "selfCast", selfEntered: event === "selfEnters", clashed: event === "youClash", ownX: event === "selfEnters" || event === "selfCast" || event === "selfTurnedFaceUp" || event === "selfBecomesMonstrous" });
      // Brood of Cockroaches: "When ~ is put into your graveyard from the battlefield, at the beginning of the next end step,
      // you lose 1 life and return ~ to your hand": one delayed trigger doing both (rulings), about the card in the
      // graveyard now; if it has left there by then, it stays where it went (CR 400.7).
      const brood = event === "selfToGraveyard" && /^When ~ is put into your graveyard/.test(line) ? /^at the beginning of the next end step, you lose (\d+) life and return ~ to your hand\.$/.exec(text) : null;
      if (brood) body = { targets: [], effects: [{ type: "delayed", when: "nextEndStep", each: "selfCard", effects: [{ type: "loseLife", who: { ref: "you" }, n: Number(brood[1]) }, { type: "bounce", what: { ref: "subjectCard" } }], text: `you lose ${brood[1]} life and return ~ to your hand` }], text };
      // Ochre Jelly: "create a token that's a copy of it at the beginning of the next end step. The token enters with half
      // that many +1/+1 counters on it, rounded down": a delayed trigger copying ~ as it last existed on the battlefield
      // (CR 608.2h, 707.2), with half the counters it had (rulings), even if the card has left the graveyard by then.
      const split = event === "selfDies" && ifHadCounter && ifHadCounterMin ? new RegExp(`^create a token that's a copy of it at the beginning of the next end step\\. The token enters with half that many ${ifHadCounter.replace(/[+/]/g, "\\$&")} counters on it, rounded down\\.$`).exec(text) : null;
      if (split) body = { targets: [], effects: [{ type: "delayed", when: "nextEndStep", effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "self" }, lkiCopy: { halfCounters: ifHadCounter as CounterKind } }], text: "create a token that's a copy of it with half that many counters on it" }], text };
      if (body && attackingPlayer) body = { ...(JSON.parse(JSON.stringify(body).replaceAll('{"ref":"eventPlayer"}', '{"ref":"activePlayer"}')) as typeof body), text: body.text.replace(/\bthat player\b/g, "attacking player") };
      if (body && thatMuch) body = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: unX(body.text, body0) };
      if (body && lesserPower) {
        const [tg, ...more] = body.targets;
        if (!tg || more.length || tg.kind !== "card" || tg.bound || tg.power) return "fail" as const;
        body = { ...body, targets: [{ ...tg, bound: { key: "power", at: "most", amount: { count: { kind: "power", of: { ref: "self" } } } }, text: `${tg.text} with equal or lesser power` }], text: body0 };
      }
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
      // "Defending player controls" is that planeswalker's controller (rulings on Storm the Citadel), made "that player
      // controls" above.
      if (orPlaneswalker && ((!pwDefending && /\bthat player\b/.test(text)) || /\bdefending player\b/.test(text))) return "fail";
      // "To a player or battle": the same, a battle isn't a player (CR 310).
      const orBattle = / to a player or battle, /.test(line);
      if (orBattle && /\b(that player|defending player)\b/.test(text)) return "fail";
      const firstAttack = /^Whenever ~ attacks for the first time each turn, /.test(line);
      const firstHit = /^Whenever ~ deals combat damage to a player for the first time each turn, /.test(line);
      const saddled = /^Whenever ~ attacks while saddled, /.test(line);
      // "Is put into your graveyard": one its controller owns, since a card goes to its owner's graveyard (rulings on
      // Enigma Sphinx).
      const ownGraveyard = event === "selfToGraveyard" && /^When(?:ever)? ~ is put into your graveyard/.test(line);
      return body
        ? { event, body, ...(ownGraveyard ? { ownGraveyard } : {}), ...(ifNoCounters ? { ifNoCounter: ifNoCounters } : {}), ...(ifHadCounter ? { ifHadCounter } : {}), ...(ifHadCounterMin ? { ifHadCounterMin } : {}), ...(ifDamaged !== undefined ? { ifDamagedThisTurn: ifDamaged } : {}), ...(ifNotToken ? { ifNotToken } : {}), ...(ifNotSubtype ? { ifNotSubtype } : {}), ...(ifNotBlocking ? { ifNotBlocking: true as const } : {}), ...(ifBlockedThisTurn ? { ifBlockedThisTurn: true as const } : {}), ...(ifDealtCombatDamage ? { ifDealtCombatDamage: true as const } : {}), ...(ifKicked ? { ifKicked } : {}), ...(ifAlt ? { ifAlt } : {}), ...(ifBargained ? { ifBargained } : {}), ...(ifEscaped ? { ifEscaped: true as const } : {}), ...(ifEvidence ? { ifEvidence } : {}), ...(ifTreasure ? { ifTreasure } : {}), ...(ifSpent ? { ifSpent } : {}), ...(ifCastFromHand !== undefined ? { ifCastFromHand } : {}), ...(ifCast ? { ifCast } : {}), ...(ifCastInMain ? { ifCastInMain: true as const } : {}), ...(ifGift ? { ifGift } : {}), ...(ifTributeUnpaid ? { ifTributeUnpaid } : {}), ...(attacksPlayer ? { attacksPlayer } : {}), ...(attacksBattle ? { attacksBattle } : {}), ...(orPlaneswalker ? { orPlaneswalker: true as const } : {}), ...(orBattle ? { orBattle: true as const } : {}), ...(firstAttack ? { firstAttack } : {}), ...(firstHit ? { firstHit } : {}), ...(saddled ? { activeIf: { kind: "self" as const, is: "saddled" as const } } : {}), ...(onField ? { ifCond: { kind: "self" as const, is: "onBattlefield" as const } } : {}) }
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
