import { ANY_COUNTER } from "../abilities";
import type { AmountExpr, DamageRecipient, ObjRef, PlayerRef, TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { NUM, num, counterKind, COLOR_WORDS, TYPE_WORDS, keywordOf, BASIC_TYPES, capital, singular } from "./words";
import { Ctx, addTarget } from "./body";
import { parseBoundCount, parseCount } from "./counts";
import { parseSearchFilter } from "./search";

/** Creature types with a hyphen, by how they read lowercased ("assembly-worker"). */
const HYPHENATED = new Map([...CREATURE_TYPES].filter((ty) => ty.includes("-")).map((ty) => [ty.toLowerCase(), ty]));
// The one creature type of two words (CR 205.3m), read as one word: "a Time Lord", "Time Lords you control".
HYPHENATED.set("time-lord", "Time Lord");

/** Spell and enchantment subtypes a filter can name: "Spirit or Arcane spell", "a Cartouche you control" (CR 205.3h, 205.3k). */
// Artifact subtypes (CR 205.3g) other than Vehicle, which "creature or Vehicle" handles: "a Food", "a Clue", "Equipment".
/** Planeswalker types (CR 205.3j), read only before the word "planeswalker": "Ugin planeswalker card". */
export const PLANESWALKER_TYPES = new Set("Ajani,Aminatou,Angrath,Arlinn,Ashiok,Bahamut,Basri,Bolas,Calix,Chandra,Dack,Dakkon,Daretti,Davriel,Dihada,Domri,Dovin,Ellywick,Elminster,Elspeth,Estrid,Freyalise,Garruk,Gideon,Grist,Guff,Huatli,Jace,Jared,Jaya,Kaito,Karn,Kasmina,Kaya,Kiora,Koth,Liliana,Lolth,Lukka,Minsc,Mordenkainen,Nahiri,Narset,Niko,Nissa,Nixilis,Oko,Quintorius,Ral,Rowan,Saheeli,Samut,Sarkhan,Serra,Sivitri,Sorin,Szat,Tamiyo,Tasha,Teferi,Teyo,Tezzeret,Tibalt,Tyvar,Ugin,Urza,Venser,Vivien,Vraska,Will,Windgrace,Wrenn,Xenagos,Yanggu,Yanling,Zariel".split(","));
const OTHER_SUBTYPES = ["Arcane", "Omen", "Adventure", "Aura", "Trap", "Lesson", "Cartouche", "Shrine", "Saga", "Curse", "Blood", "Clue", "Equipment", "Vehicle", "Food", "Gold", "Incubator", "Junk", "Lander", "Map", "Mutagen", "Powerstone", "Treasure", "Bobblehead", "Gate", "Desert", "Cave", "Town", "Urza's", "Locus", "Sphere", "Spacecraft", "Planet", "Plan", "Room"];

/** Historic: artifacts, legendaries and Sagas (CR 700.6). */
const CREATURE_OR_LEGENDARY: TargetSpec[] = [{ kind: "object", types: ["Creature"], text: "creature" }, { kind: "object", types: [], supertypes: ["Legendary"], text: "legendary" }];
export const HISTORIC: TargetSpec[] = [{ kind: "object", types: ["Artifact"], text: "artifact" }, { kind: "object", types: [], supertypes: ["Legendary"], text: "legendary" }, { kind: "object", types: [], subtypes: ["Saga"], text: "Saga" }];

export function parseDamageRecipient(p: string, ctx: Ctx): DamageRecipient | null {
  // "The player or planeswalker it's attacking" in an attack trigger about the source (Myr Battlesphere, Fathom Fleet
  // Swordjack), or about the creature that attacked (Hellrider, Mage Slayer): not targeted (CR 506.2).
  // Raid Bombardment: "the player or planeswalker that creature is attacking": the same, about the creature that attacked.
  const attacked = /^the player or planeswalker (it's|it is|~'s|that creature is) attacking$/i.exec(p);
  if (attacked && (attacked[1] === "that creature is" || attacked[1] === "it is")) return ctx.defending && (ctx.subject || ctx.subjectIt) ? { ref: "attackedBySelf", subject: true } : null;
  if (attacked) return !ctx.defending ? null : attacked[1] === "it's" && ctx.subjectIt ? { ref: "attackedBySelf", subject: true } : attacked[1] === "~'s" || !ctx.subject ? { ref: "attackedBySelf" } : null;
  if (/^that permanent or player$/i.test(p)) return ctx.eventRecipient ? { ref: "eventRecipient" } : null;
  const orPw = /^(that player) or a planeswalker that player controls$/i.exec(p);
  if (orPw) {
    const who = parsePlayer(orPw[1]!, ctx);
    return who && (who.ref === "chosenPlayer" || who.ref === "eventPlayer" || who.ref === "enchantedPlayer") ? { ref: "playerOrPlaneswalker", who } : null;
  }
  // Searing Blaze's "that player or planeswalker": the earlier "target player or planeswalker".
  if (/^that player or planeswalker$/i.test(p)) {
    const i = ctx.targets.findIndex((t) => t.kind === "any" && t.types?.length === 1 && t.types[0] === "Planeswalker" && /^target (?:player|opponent) or planeswalker$/.test(t.text));
    return i >= 0 && ctx.targets.filter((t) => t.kind === "any").length === 1 ? { ref: "anyTarget", index: i } : null;
  }
  if (/^any target$/i.test(p)) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", text: "any target" }) };
  // Needle Drop: "any target that was dealt damage this turn" (a player, creature, planeswalker or battle, CR 115.4).
  if (/^any target that was dealt damage this turn$/i.test(p)) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", dealtDamageThisTurn: true, text: p.toLowerCase() }) };
  // "target player or planeswalker", "target opponent or planeswalker" (Lava Axe): a player, or a planeswalker permanent.
  const pw = /^target (player|opponent) or planeswalker$/i.exec(p);
  if (pw) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", types: ["Planeswalker"], ...(pw[1]!.toLowerCase() === "opponent" ? { opponent: true } : {}), text: p.toLowerCase() }) };
  // Coalborn Entity: "target creature token, player, or planeswalker": a player, a planeswalker, or a creature that's a token.
  if (/^target creature token, player, or planeswalker$/i.test(p)) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", types: ["Creature", "Planeswalker"], creatureTokens: true, text: p.toLowerCase() }) };
  // All Will Be One, Nicol Bolas, God-Pharaoh: "target opponent, creature an opponent controls, or planeswalker an opponent
  // controls".
  if (/^target opponent, creature an opponent controls, or planeswalker an opponent controls$/i.test(p))
    return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", types: ["Creature", "Planeswalker"], opponent: true, controller: "opponent", text: p.toLowerCase() }) };
  // "Target player or battle", "target opponent or battle" (Ayara), "another target battle or opponent" (Invasion of
  // Regatha: not itself, CR 115.4): a player, or a battle permanent.
  const battle = /^(another )?target (?:(player|opponent) or battle|battle or (player|opponent))$/i.exec(p);
  if (battle) {
    const who = (battle[2] ?? battle[3])!.toLowerCase();
    return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", types: ["Battle"], ...(who === "opponent" ? { opponent: true } : {}), ...(battle[1] ? { notSource: true } : {}), text: p.toLowerCase() }) };
  }
  // Bonfire of the Damned: "... to target player or planeswalker and each creature that player or that planeswalker's
  // controller controls": the creatures of the player it targets, or of the planeswalker's controller.
  if (/^each creature that player or that planeswalker's controller controls$/i.test(p)) {
    const i = ctx.targets.length - 1;
    const t = ctx.targets[i];
    if (t?.kind !== "any" || !t.types?.includes("Planeswalker")) return null;
    return { ref: "each", filter: { kind: "object", types: ["Creature"], text: "creature" }, of: { ref: "targetOrController", index: i } };
  }
  // "any other target", "another target": not one of the targets before it, or with none, not the
  // source (CR 115.4). "Each of two targets", "each of up to two targets" (CR 115.3, 115.6).
  if (/^(any other target|another target)$/i.test(p)) {
    const before = ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "player" ? [i] : []));
    if (!before.length && ctx.spell) return null;
    const spec: TargetSpec = { kind: "any", text: "any other target", ...(before.length ? { distinctFrom: before } : { notSource: true }) };
    return { ref: "anyTarget", index: addTarget(ctx, spec) };
  }
  // Captain's Maneuver: "target creature, planeswalker, or player", "another target creature, planeswalker, or player": a
  // player, creature or planeswalker (not a battle), the second one different from the first (CR 115.3).
  const cpp = /^(another )?target creature, planeswalker, or player$/i.exec(p);
  if (cpp) {
    const before = ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "player" ? [i] : []));
    if (cpp[1] && !before.length) return null;
    return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", types: ["Creature", "Planeswalker"], text: p.toLowerCase(), ...(cpp[1] ? { distinctFrom: before } : {}) }) };
  }
  // Lozhan, Dragons' Legacy: "any target that isn't a commander": any player, or a creature, planeswalker or battle that
  // isn't a commander (rulings).
  if (/^any target that isn't a commander$/i.test(p)) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", commander: false, text: p }) };
  // "Any target that isn't a Dragon" (Wrathful Red Dragon): a player, or a creature, planeswalker or battle without
  // that subtype (CR 115.4).
  const notType = /^any target that isn't an? ([A-Z][a-z]+)$/.exec(p);
  if (notType && CREATURE_TYPES.has(notType[1]!)) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", notSubtypes: [notType[1]!], text: p }) };
  let several: RegExpExecArray | null;
  // "... and 3 damage to each of up to two other targets" (Drakuseth, Maw of Flames): none of the targets before either.
  if ((several = /^each of (up to )?(two|three|four|one or two)( other)? targets$/i.exec(p))) {
    const [required, n] = several[2] === "one or two" ? [1, 2] : several[1] ? [0, num(several[2]!)] : [num(several[2]!), num(several[2]!)];
    const first = ctx.targets.length;
    const before = several[3] ? ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "player" ? [i] : [])) : [];
    if (several[3] && !before.length) return null;
    for (let k = 0; k < n; k++) {
      const distinct = [...before, ...Array.from({ length: k }, (_, j) => first + j)];
      addTarget(ctx, { kind: "any", text: several[3] ? "any other target" : "any target", ...(k >= required ? { optional: true } : {}), ...(distinct.length ? { distinctFrom: distinct } : {}) });
    }
    return { ref: "anyTarget", index: first, n };
  }
  // "Each of X targets" (Firestorm, Meteor Blast): exactly the spell's X targets, all different (CR 115.3, 601.2c); "each
  // of up to X targets" (Crackle with Power): up to X of them.
  if (/^each of (?:up to )?X targets$/i.test(p)) {
    if (!ctx.spell || ctx.targets.some((t) => t.many)) return null;
    const index = addTarget(ctx, { kind: "any", text: "any target", many: /up to/i.test(p) ? "x" : "exactX" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index, n: 2 };
    return { ref: "anyTarget", index, n: 2 };
  }
  const player = parsePlayer(p, ctx);
  if (player) return player;
  return parseObject(p, ctx);
}

/** What a "pick" effect picks from: "creature", "nonland permanent", "two lands", "artifact or creature", "Forest". */
export function pickFilter(phrase: string): TargetSpec | null {
  // "Artifacts, enchantments, and/or tokens" (Lich-Knights' Conquest): each permanent that's any of them.
  const list = /^((?:[a-z]+s, )+)and\/or ([a-z]+s)$/.exec(phrase.trim());
  if (list && /\btokens\b/.test(phrase)) {
    const anyOf = [...list[1]!.split(", ").filter(Boolean), list[2]!].map((w) => pickFilter(w));
    return anyOf.every((a): a is TargetSpec => !!a) ? { kind: "object", types: [], notTypes: [], notColors: [], anyOf, text: phrase.trim() } : null;
  }
  // Jungle Patrol: "Sacrifice a token named Wood": a permanent with that name (CR 201.2), here the token it makes.
  const named = /^(token|creature|artifact|permanent) named ([A-Z][A-Za-z' -]*)$/.exec(phrase.trim());
  if (named) {
    const noun = pickFilter(named[1]!);
    return noun ? { ...noun, named: named[2]!, text: phrase.trim() } : null;
  }
  // "Permanents you don't own" (Agent of Treachery): whose they are comes after the noun.
  const owned = / you (?:don't )?own$/.exec(phrase.trim().replace(/ you control$/i, ""))?.[0] ?? "";
  const words = phrase.trim().replace(/ you control$/i, "").slice(0, owned ? -owned.length : undefined).split(" ");
  // "a Plains" is already singular; "two creatures" isn't.
  const asIs = words.join(" ") + owned;
  // "creatures with decayed": the noun before "with" is the plural one. "Creatures that each have toughness greater than
  // their power" (Catapult Fodder): before "that".
  const cut = words.findIndex((w, i) => i > 0 && (w === "with" || w === "that"));
  const head = cut > 0 ? cut - 1 : words.length - 1;
  const one = parseTargetPhrase(asIs) ? asIs : words.map((w, i) => (i === head ? singular(w) : w)).join(" ") + owned;
  const spec = parseTargetPhrase(one);
  if (spec?.kind !== "object" || spec.controller) return null;
  return { ...spec, text: one };
}

export function parsePlayer(p: string, ctx: Ctx): PlayerRef | null {
  const x = p.trim().toLowerCase();
  if (x === "you") return { ref: "you" };
  // Gremlin Infestation: "enchanted artifact's controller", in a permanent's own ability.
  if (/^enchanted (?:artifact|creature|enchantment|land|permanent)'s controller$/.test(x) && !ctx.spell) return { ref: "hostController" };
  if (x === "each opponent") return { ref: "eachOpponent" };
  // Friendly Fire: "Target creature's controller reveals ...": the creature is the target, and "that player" after it is
  // its controller as it is as the spell resolves (or as it last existed, CR 608.2h).
  if (x === "target creature's controller") {
    const t = parseObjectNow("target creature", ctx);
    if (t?.ref !== "target" || t.n) return null;
    ctx.controllerNamed = t.index;
    return { ref: "targetController", index: t.index };
  }
  // Erestor of the Council: "each opponent who voted for a choice you voted for", in the vote that triggered it.
  if (x === "each opponent who voted for a choice you voted for" && ctx.votesEvent) return { ref: "votedWithYou" };
  if (x === "each player") return { ref: "eachPlayer" };
  // Blightning: "... to target player or planeswalker. That player or that planeswalker's controller discards two cards":
  // the player it targets, or the planeswalker's controller.
  // Acorn Catapult: "~ deals 1 damage to any target. That permanent's controller or that player creates ...": the player
  // targeted, or the targeted permanent's controller (as it last existed, CR 608.2h).
  if (x === "that permanent's controller or that player") {
    const i = ctx.targets.length - 1;
    return ctx.targets.length === 1 && ctx.targets[i]?.kind === "any" ? { ref: "targetOrController", index: i } : null;
  }
  if (x === "that player or that planeswalker's controller") {
    const i = ctx.targets.length - 1;
    const t = ctx.targets[i];
    return t?.kind === "any" && t.types?.includes("Planeswalker") && !t.types.includes("Creature") ? { ref: "targetOrController", index: i } : null;
  }
  // "Each opponent who chose silence" (Prisoner's Dilemma): of the words chosen before (Effect eachChooses).
  const chose = /^each (?:opponent|player) who chose ([a-z]+)$/.exec(x);
  if (chose && ctx.chooseWords?.includes(chose[1]!)) return { ref: "choseWord", option: chose[1]! };
  const lost = /^each opponent who lost (?:(\d+) or more )?life this turn$/.exec(x);
  if (lost) return { ref: "opponentsLostLife", n: lost[1] ? Number(lost[1]) : 1 };
  if (/^each opponent (?:with|who has) no cards in hand$/.test(x)) return { ref: "opponentsEmptyHanded" };
  const poisoned = new RegExp(`^each opponent (?:with|who has) ${NUM} or more poison counters$`).exec(x);
  if (poisoned) return { ref: "opponentsWithPoison", n: num(poisoned[1]!) };
  const life = /^each player with exactly (\d+) life$/.exec(x);
  if (life) return { ref: "playersWithLife", n: Number(life[1]) };
  if (/^each opponent dealt combat damage this game by a creature named ~$/.test(x)) return { ref: "opponentsCombatDamagedByName" };
  if (x === "each player who controls the most creatures") return { ref: "mostCreatures" };
  if (x === "each player who controls the most lands") return { ref: "mostCreatures", lands: true };
  if (x === "each player who controls the fewest creatures") return { ref: "mostCreatures", fewest: true };
  // Death by Dragons: "Each player other than target player creates ...".
  if (x === "each player other than target player") {
    const index = addTarget(ctx, { kind: "player", text: "target player" });
    ctx.lastPlayerTarget = index;
    return { ref: "otherThanTarget", index };
  }
  // Fade from History: "Each player who controls an artifact or enchantment creates a 2/2 green Bear creature token".
  const controlling = /^each player who controls an? (.+)$/.exec(x);
  // Bonder's Ornament: "Each player who controls a permanent named ~".
  if (controlling?.[1] === "permanent named ~") return { ref: "playersControlling", filter: { kind: "object", types: [], notTypes: [], notColors: [], named: "~", text: "permanent named ~" } };
  if (controlling) {
    const spec = parseTargetPhrase(controlling[1]!);
    return spec?.kind === "object" && !spec.controller && !spec.bound ? { ref: "playersControlling", filter: spec } : null;
  }
  // "Each opponent who doesn't control a legendary creature or planeswalker" (Nicol Bolas, Dragon-God): a legendary
  // creature or a legendary planeswalker (CR 205.4e words it so).
  const without = /^each opponent who doesn't control an? (.+)$/.exec(x);
  if (without) {
    const spec = parseTargetPhrase(without[1]!);
    if (spec?.kind === "object" && !spec.controller && !spec.bound) return { ref: "opponentsControllingNo", filter: spec };
    return null;
  }
  // Kroxa: "each opponent discards a card, then each opponent who didn't discard a nonland card this way loses 3 life":
  // those who discarded a land card or nothing (rulings).
  // Strongarm Tactics: "Each player discards a card. Then each player who didn't discard a creature card this way loses 4
  // life": you too.
  const notDiscarded = ctx.opponentsDiscarded ? /^each (opponent|player) who didn't discard an? (.+? card) this way$/.exec(x) : null;
  if (notDiscarded && (notDiscarded[1] === "opponent" || ctx.playersDiscarded)) {
    const filter = parseSearchFilter(notDiscarded[2]!);
    return filter ? { ref: "opponentsNotDiscarded", filter, ...(notDiscarded[1] === "player" ? { players: true as const } : {}) } : null;
  }
  // "Each opponent discards a card. Each opponent who can't loses 3 life." (Entropic Battlecruiser): those who had no
  // card to discard (CR 701.9b), so discarded none.
  if (ctx.opponentsDiscarded && x === "each opponent who can't") return { ref: "opponentsNotDiscarded", filter: { kind: "card", text: "card" } };
  // "Choose an opponent. That player sacrifices a creature of their choice."
  if (x === "that player" && ctx.chosenOpponent) return { ref: "chosenPlayer" };
  if (x === "that player" && ctx.clashOpp) return { ref: "clashOpponent" };
  // Stuffy Doll: "the chosen player" of "As ~ enters, choose a player" (compile checks there is one).
  if (x === "the chosen player") return { ref: "selfChosenPlayer" };
  // "~'s controller loses 2 life" (Xantcha): whoever controls the source, who may not be the ability's controller.
  if (x === "~'s controller") return { ref: "selfController" };
  // Yes Man, Personal Securitron: "When ~ leaves the battlefield, its owner creates ...": whose ~ is (CR 108.3), whoever
  // controlled it.
  if ((x === "its owner" || x === "~'s owner") && (ctx.selfIt || ctx.selfCard) && !ctx.subjectIt && !ctx.targets.length) return { ref: "selfOwner" };
  // Pendant of Prosperity: "{2}, {T}: ... This artifact's owner draws a card": in an ability of a permanent, whose that
  // permanent is (CR 108.3), not the ability's controller.
  if (x === "~'s owner" && ctx.activated && !ctx.spell) return { ref: "selfOwner" };
  // "Whenever ~ deals combat damage to a player, that player discards a card."
  if (x === "that player" && ctx.eventPlayer) return { ref: "eventPlayer" };
  // "Whenever ~ deals combat damage to an opponent, it deals that much damage to each other opponent" (Hydra Omnivore).
  // The trigger parsers write "each other opponent" this way only when the event's player is an opponent.
  if (x === "each opponent other than that player" && ctx.eventPlayer) return { ref: "otherOpponents" };
  // "Whenever a player casts their first multicolored spell each turn, each other player draws a card" (Zenith Chronicler):
  // every player but that one.
  if (x === "each other player" && ctx.eventPlayer) return { ref: "otherPlayers" };
  // "Each of that player's opponents" (Heartwood Storyteller): with no teams, every other player (CR 102.2, 800.4).
  if (x === "each of that player's opponents" && ctx.eventPlayer) return { ref: "otherPlayers" };
  // "Whenever ~ deals combat damage to a player, they lose half their life" (Unstoppable Slasher): that player, while no
  // other player has been named.
  if (x === "they" && ctx.eventPlayer && ctx.lastPlayerTarget === undefined && !ctx.chosenOpponent) return { ref: "eventPlayer" };
  // "Whenever a player casts a spell, if it's not their turn, ~ deals 4 damage to them" (Scytheclaw Raptor): the same.
  if (x === "them" && ctx.eventPlayer && ctx.lastPlayerTarget === undefined && !ctx.chosenOpponent && !ctx.lastGroup && !ctx.lastCreatedAny && !ctx.lastTargets) return { ref: "eventPlayer" };
  if (x === "defending player" && ctx.defending) return { ref: "eventPlayer" };
  if (x === "enchanted player" || x === "enchanted opponent") return { ref: "enchantedPlayer" };
  // "Any number of target players each mill two cards" (CR 601.2c, 115.6): one entry for them all until it's cast
  // (TargetSpec.many); "those players", "each of those players" are all of them.
  const many = /^any number of target (players|opponents)(?: each)?$/.exec(x);
  if (many) {
    if (ctx.targets.some((t) => t.many)) return null;
    const one = many[1] === "players" ? "target player" : "target opponent";
    const index = addTarget(ctx, { kind: "player", opponent: many[1] === "opponents", text: one, many: "any" });
    ctx.lastPlayerTarget = index;
    ctx.manyPlayers = index;
    return { ref: "target", index, n: 2 };
  }
  const manyNow = ctx.manyPlayers !== undefined && ctx.lastPlayerTarget === ctx.manyPlayers;
  if (/^(?:each of )?those (?:players|opponents)$/.test(x) && manyNow) return { ref: "target", index: ctx.manyPlayers!, n: 2 };
  // "Two target players each draw a card" (Huddle Up), "Choose two target players. Each of them ..." (Scheming
  // Symmetry): two different players (CR 115.3), then "each of them", "they" are both. "Up to two target players each
  // ..." (Kozilek, the Broken Reality): either may be left unchosen (CR 115.6).
  const twoPlayers = /^(up to )?two target players(?: each)?$/.exec(x);
  if (twoPlayers && !ctx.targets.some((t) => t.many) && ctx.manyPlayers === undefined) {
    const optional = twoPlayers[1] ? { optional: true as const } : {};
    const first = addTarget(ctx, { kind: "player", text: "target player", ...optional });
    addTarget(ctx, { kind: "player", text: "target player", distinctFrom: [first], ...optional });
    ctx.lastPlayerTarget = first;
    ctx.manyPlayers = first;
    return { ref: "target", index: first, n: 2 };
  }
  if (/^(?:each of them|they each|they)$/.test(x) && manyNow && ctx.targets[ctx.manyPlayers!]?.many === undefined) return { ref: "target", index: ctx.manyPlayers!, n: 2 };
  // "Exile target creature and all other creatures its controller controls .... That player investigates ...": that
  // creature's controller (as it last existed, CR 608.2h).
  if (x === "that player" && ctx.controllerNamed !== undefined && ctx.controllerNamed === ctx.lastObjectTarget && ctx.lastPlayerTarget === undefined) return { ref: "targetController", index: ctx.controllerNamed };
  // "Target player discards two cards. ... that player discards a card": the player targeted before.
  if (x === "that player" && ctx.lastPlayerTarget !== undefined && !manyNow) return { ref: "target", index: ctx.lastPlayerTarget };
  // "Counter target spell. ... that spell's controller mills X cards" (Induce Paranoia): who controlled it as it was
  // countered (CR 608.2h).
  if (x === "that spell's controller" && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell") return { ref: "targetController", index: ctx.lastObjectTarget };
  // "Exile target creature card from a graveyard. Its owner creates ..." (Pharika): whose card it is (CR 108.3).
  const lastCard = ctx.targets.length - 1;
  if ((x === "its owner" || x === "that card's owner") && ctx.targets[lastCard]?.kind === "card" && ctx.targets.filter((t) => t.kind === "card").length === 1 && !ctx.targets[lastCard]!.many) return { ref: "targetOwner", index: lastCard };
  // "Put target creature card from an opponent's graveyard onto the battlefield ..., then exile that player's graveyard"
  // (Nurgle's Conscription): the opponent whose graveyard held the card, its owner (CR 404.2).
  if (x === "that player" && ctx.lastPlayerTarget === undefined && ctx.targets.length === 1 && ctx.targets[0]!.kind === "card" && ctx.targets[0]!.owner === "opponent" && !ctx.targets[0]!.many) return { ref: "targetOwner", index: 0 };
  // "Destroy target creature. Its owner gains 4 life" (Path of Peace): whose it is, whoever controls it (rulings, CR 108.3).
  if (x === "its owner" && ctx.lastObjectTarget === lastCard && ctx.targets[lastCard]?.kind === "object" && !ctx.targets[lastCard]!.many) return { ref: "targetOwner", index: lastCard };
  // "Destroy target land. ~ deals 2 damage to that land's controller" (Melt Terrain): as it last existed (CR 608.2h).
  if (x === "that land's controller" && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && isLandSpec(ctx.targets[ctx.lastObjectTarget]!)) return { ref: "targetController", index: ctx.lastObjectTarget };
  // "Its owner loses life equal to its mana value" (Brainstealer Dragon): whose the entering permanent is.
  if (x === "its owner" && ctx.lastObjectTarget === undefined && ctx.subjectIt && !ctx.targets.length) return { ref: "subjectOwner" };
  if (x === "each player other than its controller" && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]!.many) return { ref: "otherThanTargetController", index: ctx.lastObjectTarget };
  if (x === "each of its controller's opponents" && ctx.subjectIt && ctx.lastObjectTarget === undefined) return { ref: "subjectControllerOpponents" };
  // Crumble: "Destroy target artifact. ... That artifact's controller gains life ...": the target's, as it last existed.
  const typedCtl = /^that (artifact|enchantment|planeswalker)'s controller$/.exec(x);
  if (typedCtl && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]!.many && ctx.targets[ctx.lastObjectTarget]!.types?.length === 1 && ctx.targets[ctx.lastObjectTarget]!.types![0] === capital(typedCtl[1]!)) return { ref: "targetController", index: ctx.lastObjectTarget };
  if (x === "its controller" || x === "that creature's controller" || x === "that permanent's controller") {
    const i = ctx.lastObjectTarget;
    if (i === undefined && ctx.subjectIt) return { ref: "subjectController" };
    // Gloom Sower, Vicious Battlerager: "Whenever ~ becomes blocked by a creature, that creature's controller loses 2
    // life": the blocker's, as it last existed (CR 608.2h).
    if (i === undefined && ctx.subject && x === "that creature's controller") return { ref: "subjectController" };
    return i !== undefined ? { ref: "targetController", index: i } : null;
  }
  // The Lord of Pain: "another target player", not the one the trigger is about (bound in triggerBody).
  if (x === "target player other than that player" && ctx.eventPlayer) {
    const index = addTarget(ctx, { kind: "player", notEventPlayer: true, text: "another target player" });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  // Hope of Ghirapur: "target player who was dealt combat damage by ~ this turn" (turnLog.combatDamagedBy, ~ as it is).
  if (x === "target player who was dealt combat damage by ~ this turn") {
    const index = addTarget(ctx, { kind: "player", combatDamagedBySource: true, text: x });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  // Wicked Akuba: "target player dealt damage by ~ this turn": any damage, combat or not.
  if (x === "target player dealt damage by ~ this turn" && ctx.activated && !ctx.spell) {
    const index = addTarget(ctx, { kind: "player", damagedBySource: true, text: x });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  // Fire and Brimstone: "target player who attacked this turn" (Player.attackedTurn).
  if (x === "target player who attacked this turn") {
    const index = addTarget(ctx, { kind: "player", attackedThisTurn: true, text: x });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  // Rix Maadi Guildmage: "target player who lost life this turn" (GameState.lostLifeThisTurn).
  if (x === "target player who lost life this turn") {
    const index = addTarget(ctx, { kind: "player", lostLifeThisTurn: true, text: x });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  // The Keepers: "target opponent who has more life than you do as you activate this ability" (TargetSpec.comparedToYou):
  // true as it's chosen, whatever happens before it resolves (rulings).
  const compared = ctx.activated ? /^target opponent who (has more life|controls more creatures|has at least two more cards in hand|has at least two fewer creature cards in their graveyard) than you do as you activate this ability$/.exec(x) : null;
  if (compared) {
    const c = compared[1]!;
    const comparedToYou: NonNullable<TargetSpec["comparedToYou"]> = /life/.test(c) ? { stat: "life", by: 1 } : /creatures$/.test(c) ? { stat: "creatures", by: 1 } : /in hand/.test(c) ? { stat: "hand", by: 2 } : { stat: "creatureCardsInGraveyard", by: 2, fewer: true };
    const index = addTarget(ctx, { kind: "player", opponent: true, comparedToYou, text: `target opponent who ${c} than you do` });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  if (x === "target player" || x === "target opponent") {
    const index = addTarget(ctx, { kind: "player", opponent: x === "target opponent", text: x });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  // "Up to one target player" (Endurance): it may be chosen or not (CR 115.6); with none, nobody does it.
  const upTo = /^up to one target (player|opponent)$/.exec(x);
  if (upTo) {
    const index = addTarget(ctx, { kind: "player", opponent: upTo[1] === "opponent", optional: true, text: `target ${upTo[1]}` });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  return null;
}

/**
 * An object reference. Targets in graveyards ("target card from a graveyard") are only
 * allowed where the caller knows what to do with a card (`cards`), since "destroy" or
 * "tap" make no sense for one.
 */
export function parseObject(p: string, ctx: Ctx, cards = false): ObjRef | null {
  if (ctx.subjectLeft && /^that card$/i.test(p.trim()) && ctx.lastObjectTarget === undefined) return { ref: "subjectCard" };
  const ref = parseObjectNow(p, ctx, cards);
  return ref?.ref === "subject" && ctx.subjectLeft ? { ref: "subjectCard" } : ref;
}

function parseObjectNow(p: string, ctx: Ctx, cards = false): ObjRef | null {
  // Sanguine Praetor: "each creature with the same mana value as the sacrificed creature"; Endemic Plague: "all creatures
  // that share a creature type with the sacrificed creature": compared with the creature as it last existed (CR 608.2h).
  const kin = /^(?:each creature|all creatures) (with the same mana value as|that shares? a creature type with) the sacrificed creature$/i.exec(p.trim());
  if (kin) return { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: p.trim().replace(/^(?:each|all) /i, "") }, sacrificedKin: /mana value/.test(kin[1]!) ? "manaValue" : "creatureType" };
  // "Each creature that convoked it" (Venerated Loxodon, CR 702.51a): the creatures tapped to cast it.
  if (/^each creature that convoked (?:it|~)$/i.test(p.trim())) return { ref: "convokers" };
  // Kjeldoran Frostbeast: "all creatures blocking or blocked by ~": the ones in combat with it as this resolves.
  if (/^(?:all creatures|each creature) blocking or blocked by ~$/i.test(p.trim()) && !ctx.spell) return { ref: "inCombatWithSelf" };
  // Trial: "all creatures blocking or blocked by target creature": those in combat with the target as this resolves.
  if (/^all creatures blocking or blocked by target creature$/i.test(p.trim())) return { ref: "inCombatWithSelf", ofTarget: addTarget(ctx, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "target creature" }) };
  // Plague Wight: "Whenever ~ becomes blocked, each creature blocking it gets -1/-1 until end of turn"; Trailblazer's
  // Torch: "Whenever equipped creature becomes blocked, it deals 2 damage to each creature blocking it": the creatures
  // blocking that attacker as this resolves (CR 509.1h), none once it has left combat (CR 506.4).
  // Joven's Ferrets: "all creatures that blocked ~ this turn": declared blocking it this turn, even if they've left combat.
  if (/^all creatures that blocked ~ this turn$/i.test(p.trim()) && !ctx.spell) return { ref: "blockHistory", of: { ref: "self" }, blockers: true };
  // Ride Down: "Creatures that were blocked by that creature this combat", after "Destroy target blocking creature": the
  // attackers it was declared blocking this combat, the target as it was chosen (rulings: not if it entered blocking).
  if (/^creatures that were blocked by that creature this combat$/i.test(p.trim()) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object")
    return { ref: "blockHistory", of: { ref: "target", index: ctx.lastObjectTarget }, blocked: true, thisCombat: true };
  // Wall of Nets: "exile all creatures blocked by ~": the attackers it's blocking as this resolves.
  if (/^all creatures blocked by ~$/i.test(p.trim()) && !ctx.spell) return { ref: "blockingIt", blocked: true };
  // The Wretched: "gain control of all creatures blocking ~": the same.
  const blockingIt = !ctx.spell ? /^(?:each creature|all creatures) blocking (~|it|that creature)$/i.exec(p.trim()) : null;
  if (blockingIt) {
    if (blockingIt[1] === "~" || (blockingIt[1] === "it" && ctx.selfIt && !ctx.subject && !ctx.subjectIt)) return { ref: "blockingIt" };
    return ctx.subject || ctx.subjectIt ? { ref: "blockingIt", subject: true } : null;
  }
  // "Put a +1/+1 counter on each of up to two target creatures", "Up to two target creatures each get +1/+1"
  const x = /\btarget\b/i.test(p) ? p.trim().replace(/^each of /i, "").replace(/ each$/i, "") : p.trim();
  // "They", "those creatures": the targets of an earlier "up to two target creatures".
  // "Create two 1/1 colorless Spirit creature tokens. They gain haste until end of turn": the tokens just created.
  if (ctx.lastCreatedAny && /^(?:each of )?(they|them|those tokens|the tokens)$/i.test(x)) return { ref: "created" };
  if (ctx.lastGathered && /^(?:each of )?those creatures$/i.test(x)) return { ref: "created" };
  // "Each creature you control named ~" (Gruff Triplets): with the source's name (CR 201.5), as it last existed if it's gone.
  // Genasi Enforcers: "Creatures you control named ~ get +1/+0 until end of turn".
  // Cylian Sunsinger: "~ and each other creature with the same name as it": every creature named ~ (CR 201.2), anyone's.
  const namedSelf = /^(each (?:other )?[a-z]+ you control|[a-z]+s you control) named ~$/i.exec(x) ?? (/^~ and each other creature with the same name as it$/i.test(x) ? ["", "each creature"] : null);
  if (namedSelf) {
    const each = parseObjectNow(namedSelf[1]!, ctx, cards);
    return each?.ref === "each" && each.filter.named === undefined ? { ...each, filter: { ...each.filter, named: "~", text: `${each.filter.text ?? namedSelf[1]} named ~` } } : null;
  }
  // "Populate. The token created this way gains haste." (Determined Iteration).
  if ((ctx.lastCreated || ctx.lastCreatedAny) && /^the token created this way$/i.test(x)) return { ref: "created" };
  // "Put all land cards from among them onto the battlefield tapped ... untap those lands" (Animist's Awakening).
  if (ctx.lastDugLands && /^those lands$/i.test(x)) return { ref: "created" };
  // Arthur, Marigold Knight: "Return that creature to its owner's hand at end of combat": the one put onto the battlefield.
  if (ctx.lastDugCreature && /^that creature$/i.test(x)) return { ref: "created" };
  // "Exile each permanent with the most votes or tied for most votes" (Council's Judgment): what the vote chose.
  if (ctx.vote?.among && !ctx.vote.choose && /^each (?:permanent|card) with the most votes or tied for most votes$/i.test(x)) return { ref: "voted" };
  // "Destroy each permanent chosen this way" (Druid of Purification): every one a player chose.
  // "Destroy the chosen creatures" (Sadistic Shell Game) likewise.
  if (ctx.vote?.choose && /^(?:each permanent chosen this way|the chosen creatures)$/i.test(x)) return { ref: "voted", any: true };
  // "Put a +1/+1 counter on target creature you control, then double the number of +1/+1 counters on each creature that had
  // a +1/+1 counter put on it this way" (Fangs of Kalonia).
  // "Goad each creature that had a double strike counter put on it this way" (Spectacular Showdown).
  const hadPut = /^each creature that had an? (\+1\/\+1|double strike) counter put on it this way$/i.exec(x);
  if (hadPut) return { ref: "countersPutThisWay", kind: hadPut[1]!.toLowerCase() };
  // Urge to Feed: "each permanent tapped this way" (the body's reading of "each of those Vampires" after tapping them).
  if (ctx.tappedThisWay && /^each permanent tapped this way$/i.test(x)) return { ref: "tappedThisWay" };
  // Lost in the Maze: "Tap X target creatures. Put a stun counter on each of those creatures you don't control."
  if (/^each of those creatures you don't control$/i.test(x) && ctx.lastTargets) return { ref: "target", ...ctx.lastTargets, notYours: true };
  // Winter Blast: "Tap X target creatures. ~ deals 2 damage to each of those creatures with flying."
  const withKw = /^each of those creatures with (flying|reach|trample|haste)$/i.exec(x);
  if (withKw && ctx.lastTargets) return { ref: "target", ...ctx.lastTargets, with: { kind: "object", types: ["Creature"], keywords: [withKw[1]!.charAt(0).toUpperCase() + withKw[1]!.slice(1).toLowerCase()], text: `creature with ${withKw[1]!.toLowerCase()}` } };
  // Blow Your House Down: "Up to three target creatures can't block this turn. Destroy any of them that are Walls.": only
  // the targets of that subtype as it resolves.
  const thatAre = /^any of them that are ([A-Z][a-z]+)s$/.exec(x);
  if (thatAre && ctx.lastTargets) return { ref: "target", ...ctx.lastTargets, with: { kind: "object", types: [], subtypes: [thatAre[1]!], text: thatAre[1]! } };
  if (/^(?:each of )?(they|them|those creatures|those permanents|those cards)$/i.test(x)) return ctx.lastTargets ? { ref: "target", ...ctx.lastTargets } : /^(?:each of )?(they|them|those creatures)$/i.test(x) && ctx.lastGroup ? ctx.lastGroup : null;
  // "Tap each creature dealt damage this way" (Aurelia's Fury): what this spell's or ability's damage hit.
  // Huatli, Warrior Poet: "Creatures dealt damage this way can't block this turn": the same.
  const dealt = /^each (creature|planeswalker|permanent) dealt damage this way$/i.exec(x) ?? /^(creature)s dealt damage this way$/i.exec(x);
  if (dealt) return { ref: "damagedThisWay", ...(dealt[1]!.toLowerCase() !== "permanent" ? { filter: { kind: "object" as const, types: [dealt[1]![0]!.toUpperCase() + dealt[1]!.slice(1).toLowerCase()], text: dealt[1]!.toLowerCase() } } : {}) };
  // "~ and up to one other target creature can't be blocked this turn" (Martha Jones), "~ and another target creature each
  // get +1/+0": the source while it's still there (CR 611.2c), and the one target, other than the source.
  // Tatsunari, Toad Rider: "~ and target Frog you control can't be blocked this turn except by ...".
  const selfAndTarget = !ctx.spell && !ctx.selfCard && !cards && !ctx.targets.length ? /^~ and ((?:up to one other|another) target (?:creature|creature you control)|target [A-Z][a-z]+ you control)$/.exec(x) : null;
  if (selfAndTarget) {
    const t = parseObjectNow(selfAndTarget[1]!, ctx, cards);
    return t?.ref === "target" && !t.n && !t.sameName && !t.sharesColor ? { ...t, andSelf: true } : null;
  }
  const several = / and all (?:Auras|Equipment)(?: you control)? attached to it$/.test(x) && /^another /.test(x) ? null : SEVERAL_TARGETS.exec(x);
  if (several) return parseSeveralTargets(several, ctx, cards);
  // After it left the battlefield, its name means the card where it went (CR 400.7 makes the permanent gone).
  if (x === "~") return ctx.selfCard ? { ref: "selfCard" } : { ref: "self" };
  // "Return Trusty Boomerang to its owner's hand" in an ability it gives: that Equipment (grants.ts binds it).
  if (x === "\u27easource\u27eb") return { ref: "grantSource" };
  // Galadriel, Elven-Queen: "put a +1/+1 counter on your Ring-bearer": the controller's, none without one (CR 701.54a).
  if (/^your Ring-bearer$/.test(x) && !ctx.spell) return { ref: "ringBearer" };
  if (ctx.subjectIt && /^that (land|artifact|enchantment|planeswalker|token|[A-Z][a-z]+)$/.test(x) && ctx.lastObjectTarget === undefined) return { ref: "subject" };
  // A legendary character's "him" or "her" is the card itself ("Then put a +1/+1 counter on her").
  if (/^(him|her)$/i.test(x) && !ctx.spell) return ctx.selfCard ? { ref: "selfCard" } : { ref: "self" };
  // "Untap target creature and gain control of it ... the creature gains ..." (Flash Conscription): the one creature it
  // targets.
  if (/^the creature$/i.test(x) && ctx.lastObjectTarget !== undefined && ctx.targets.filter((t) => t.kind === "object").length === 1 && !ctx.lastCreated) return { ref: "target", index: ctx.lastObjectTarget };
  // "Create a token that's a copy of target artifact. That token gains haste" (Cogwork Assembler), "put an artifact card
  // from your hand onto the battlefield. That artifact gains haste" (Arms Race): the one just created or put there.
  if (ctx.lastCreated && (/^(?:that|the) token$/i.test(x) || (ctx.lastPut && /^[Tt]hat (?:artifact|enchantment|land|[A-Z][a-z]+)$/.test(x)))) return { ref: "created" };
  // "Put a flood counter on target land. That land is an Island ..." (Xolatoyac): the land targeted last.
  if (/^that land$/i.test(x) && !ctx.lastCreated && ctx.lastObjectTarget !== undefined) {
    const t = ctx.targets[ctx.lastObjectTarget];
    if (t?.kind === "object" && t.types?.length === 1 && t.types[0] === "Land") return { ref: "target", index: ctx.lastObjectTarget };
  }
  // "~ and that creature each get +2/+0 and gain haste until end of turn" (Gogo, Mysterious Mime): the source and the target.
  if (/^~ and that creature(?: each)?$/i.test(x) && !ctx.spell && !ctx.selfCard && ctx.lastObjectTarget !== undefined && !ctx.lastCreated) return { ref: "target", index: ctx.lastObjectTarget, andSelf: true };
  if (/^(it|that creature|that permanent)$/i.test(x)) {
    // "Manifest dread, then put three +1/+1 counters on that creature" (Weight Room): the face-down 2/2 just manifested.
    if (ctx.lastCreated && (/^it$/i.test(x) || ((ctx.lastPut || ctx.lastManifested) && /^that creature$/i.test(x)))) return { ref: "created" };
    // "Create a 1/1 ... Otter creature token ... put a +1/+1 counter on that creature" (Otterball Antics): a spell's one
    // token, with no other creature it could mean.
    if (ctx.lastCreatedCreature && ctx.spell && /^that creature$/i.test(x) && !ctx.targets.length && !ctx.subject && !ctx.subjectIt) return { ref: "created" };
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if (ctx.subjectIt) return { ref: "subject" };
    // "Tap enchanted creature. ... put three stun counters on it": the creature named last.
    if (ctx.lastAttached && /^it$/i.test(x)) return { ref: "attached" };
    if (ctx.selfIt && /^it$/i.test(x)) return { ref: "self" };
    if (ctx.selfCard && /^it$/i.test(x)) return { ref: "selfCard" };
    return ctx.subject && /^that creature$/i.test(x) ? { ref: "subject" } : null;
  }
  // "Choose target creature you control and target Equipment. Gain control of that Equipment ... Attach it to the chosen
  // creature." (Stolen Uniform): the one target of that kind.
  const named = /^(?:that (Equipment|Aura|Vehicle)|the chosen (creature))$/.exec(x);
  if (named) {
    const at = ctx.targets.flatMap((t, i) => (t.kind === "object" && (named[1] ? t.subtypes?.includes(named[1]) : t.types?.includes("Creature")) ? [i] : []));
    return at.length === 1 ? { ref: "target", index: at[0]! } : null;
  }
  // Wall of Resurgence: "put three +1/+1 counters on target land you control. If you do, that land becomes ...": the one
  // target of that card type.
  const thatType = /^that (land|artifact|enchantment)$/.exec(x);
  if (thatType && !cards) {
    const type = capital(thatType[1]!);
    const at = ctx.targets.flatMap((t, i) => (t.kind === "object" && t.types?.includes(type) ? [i] : []));
    return at.length === 1 && ctx.targets.length === 1 && !ctx.targets[at[0]!]!.many ? { ref: "target", index: at[0]! } : null;
  }
  // "Put a +1/+1 counter on target creature you control, then it fights target creature you don't control. ... the
  // creature you control gains indestructible" (Outmuscle): the one target described that way.
  const described = /^the (creature you control|creature you don't control)$/i.exec(x);
  if (described) {
    const at = ctx.targets.flatMap((t, i) => (t.kind === "object" && t.text === `target ${described[1]!.toLowerCase()}` ? [i] : []));
    return at.length === 1 ? { ref: "target", index: at[0]! } : null;
  }
  // "Enchanted creature", "equipped creature": what the source is attached to (not targeted).
  if (/^(enchanted|equipped) (creature|permanent|artifact|land|planeswalker)$/i.test(x) && !ctx.spell) {
    ctx.lastAttached = true;
    return { ref: "attached" };
  }
  // Radiance: "target creature and each other creature that shares a color with it" (Wojek Siren), Leave No Trace's
  // enchantments: one target, and the others by color as it resolves.
  const radiance = /^target (creature|enchantment) and each other (creature|enchantment) that shares a color with it$/i.exec(x);
  if (radiance && !cards && radiance[1] === radiance[2]) {
    const t = parseObjectNow(`target ${radiance[1]}`, ctx, cards);
    if (t?.ref !== "target" || t.n) return null;
    const type = radiance[1] === "creature" ? "Creature" : "Enchantment";
    return { ...t, sharesColor: { filter: { kind: "object", types: [type], text: radiance[2]! } } };
  }
  // "Target creature and all other creatures with the same name as that creature" (Maelstrom Pulse, Homing Lightning,
  // Declaration in Stone's "all other creatures its controller controls", Legions to Ashes' "all tokens that player
  // controls"): one target, and the others by name as it resolves.
  const same = /^(target .+?) and (all|each) (?:other )?(.+?) with the same name as that (creature|permanent|artifact|enchantment|land)$/i.exec(x);
  if (same && !cards) {
    let rest = same[3]!;
    const ctl = / (?:its controller|that player) controls$/i.exec(rest);
    if (ctl) rest = rest.slice(0, ctl.index);
    const g = /^tokens$/i.test(rest) ? { filter: { kind: "object" as const, token: true, text: "tokens" }, other: false } : parseGroup(`${same[2]} ${rest}`, true);
    if (!g || g.other || (ctl && g.filter.controller)) return null;
    const t = parseObjectNow(same[1]!, ctx, cards);
    if (t?.ref !== "target" || t.n) return null;
    if (ctl) ctx.controllerNamed = t.index;
    return { ...t, sameName: { filter: g.filter, ...(ctl ? { of: true as const } : {}) } };
  }
  // Mists of Lórien: "target nonland permanent and each other nonland permanent with the same mana value as that
  // permanent": one target, and the others by mana value as it resolves.
  const sameMv = /^(target (nonland permanent|creature|permanent)) and each other (nonland permanent|creature|permanent) with the same mana value as that (?:permanent|creature)$/i.exec(x);
  if (sameMv && !cards && sameMv[2] === sameMv[3]) {
    const g = parseGroup(`all ${sameMv[3]}s`, true);
    const t = parseObjectNow(sameMv[1]!, ctx, cards);
    if (!g || g.other || t?.ref !== "target" || t.n) return null;
    return { ...t, sameMv: { filter: g.filter } };
  }
  // Hubris: "target creature and all Auras attached to it"; Silence the Believers: "any number of target creatures and all
  // Auras attached to them"; Turn to Slag: "all Equipment attached to that creature" (the target before).
  // Eaten by Spiders: "target creature with flying and all Equipment attached to that creature" likewise; Soul Nova:
  // "target attacking creature and all Equipment attached to it".
  // Orzhov Charm: "target creature you control and all Auras you control attached to it": only the Auras you control.
  // Essence Reliquary: "another target permanent you control and all Auras you control attached to it".
  // Portal of Sanctuary: "target creature you control and each Aura attached to it".
  const andAttached = /^(.*target (?:attacking )?(?:creatures?|permanent)(?: with [a-z ]+?| you control)?) and (?:all (Auras|Equipment)( you control)?|each (Aura)) attached to (?:it|them|that creature)$/i.exec(x);
  // Word of Undoing: "target creature and all white Auras you own attached to it": only those Auras.
  const andOwnAuras = !cards ? /^(target creature) and all (white|blue|black|red|green) Auras you own attached to it$/.exec(x) : null;
  if (andOwnAuras) {
    const t = parseObjectNow(andOwnAuras[1]!, ctx, cards);
    if (t?.ref !== "target" || t.n || t.sameName || t.sharesColor) return null;
    return { ...t, attachedToo: { filter: { kind: "object", types: ["Enchantment"], subtypes: ["Aura"], colors: [COLOR_WORDS[andOwnAuras[2]!]!], owner: "you", text: `${andOwnAuras[2]} Aura you own` } } };
  }
  const attachedThat = /^all (Auras|Equipment) attached to that creature$/i.exec(x);
  // Street Sweeper: "destroy all Auras attached to target land": the Auras, not the land. Strip Bare: "Destroy all Auras
  // and Equipment attached to target creature"; Disarm: "Unattach all Equipment from target creature".
  // Fulgent Distraction: "all Equipment attached to them": to each of the creatures targeted before. Scarab of the Unseen:
  // "all Auras attached to target permanent you own".
  const attachedTarget = !cards ? /^all (Auras|Equipment|Auras and Equipment) attached to (target land|target creature|target permanent you own|them)$/i.exec(x) : null;
  if (attachedTarget) {
    const t = parseObjectNow(attachedTarget[2]!, ctx, cards);
    if (t?.ref !== "target" || (t.n && attachedTarget[2] !== "them") || t.sameName || t.sharesColor || t.attachedToo) return null;
    const kind = attachedTarget[1]!;
    const filter: TargetSpec =
      kind === "Auras" ? { kind: "object", types: ["Enchantment"], subtypes: ["Aura"], text: "Aura" }
      : kind === "Equipment" ? { kind: "object", types: ["Artifact"], subtypes: ["Equipment"], text: "Equipment" }
      : { kind: "object", subtypes: ["Aura", "Equipment"], text: "Aura or Equipment" };
    return { ...t, attachedToo: { filter, only: true } };
  }
  // Treefolk Mystic: "Whenever ~ blocks or becomes blocked by a creature, destroy all Auras attached to that creature": the
  // Auras on the trigger's creature as it resolves.
  if (attachedThat && !cards && ctx.subject && !ctx.targets.length) {
    const kind = attachedThat[1]!;
    return { ref: "attachedToSubject", filter: kind === "Auras" ? { kind: "object", types: ["Enchantment"], subtypes: ["Aura"], text: "Aura" } : { kind: "object", types: ["Artifact"], subtypes: ["Equipment"], text: "Equipment" } };
  }
  if ((andAttached || attachedThat) && !cards) {
    const kind = andAttached ? (andAttached[2] ?? `${andAttached[4]}s`) : attachedThat![1]!;
    const filter: TargetSpec = kind === "Auras" ? { kind: "object", types: ["Enchantment"], subtypes: ["Aura"], text: "Aura" } : { kind: "object", types: ["Artifact"], subtypes: ["Equipment"], text: "Equipment" };
    if (attachedThat) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      if (t?.kind !== "object" || t.many || t.optional || !t.types?.includes("Creature")) return null;
      return { ref: "target", index: i, attachedToo: { filter, only: true } };
    }
    const t = parseObjectNow(andAttached![1]!, ctx, cards);
    if (t?.ref !== "target" || t.sameName || t.sharesColor) return null;
    return { ...t, attachedToo: { filter: andAttached![3] ? { ...filter, controller: "you", text: `${filter.text} you control` } : filter } };
  }
  // "Each creature target player controls", "all lands target opponent controls", "creatures that player controls": the
  // group among that player's permanents (the player targeted here or by an earlier sentence, or a trigger's player).
  // Silumgar, the Drifting Death: "creatures defending player controls get -1/-1 until end of turn" (CR 506.2).
  // Hurkyl's Recall: "all artifacts target player owns": the ones that player owns (CR 108.3).
  // Tectonic Instability: "Whenever a land enters, tap all lands its controller controls": the trigger's permanent's
  // controller.
  const of = /^(.+?) (target player|target opponent|that player|defending player|its controller) (controls|owns)\b(.*)$/i.exec(x);
  const ofGroup = of && !/^(?:up to |another |any number of |one or |\w+ )?(?:other )?target\b/i.test(of[1]!) && (of[3] === "controls" || (/^all /i.test(of[1]!) && !of[4])) ? parseGroup(`${of[1]}${of[4]}`, true, of[4] ? (t) => parseBoundCount(t, ctx) : undefined) : null;
  if (of && ofGroup && !ofGroup.other && !ofGroup.filter.controller && !ofGroup.filter.owner) {
    const who = of[2]!.toLowerCase();
    let whose: PlayerRef | null = null;
    if (who.startsWith("target ")) {
      const index = addTarget(ctx, { kind: "player", opponent: who === "target opponent", text: who });
      ctx.lastPlayerTarget = index;
      whose = { ref: "target", index };
    } else if (who === "its controller") whose = ctx.subject && !ctx.spell && ctx.lastObjectTarget === undefined && of[3] === "controls" ? { ref: "subjectController" } : null;
    else whose = parsePlayer(who === "defending player" ? who : "that player", ctx);
    if (!whose || (whose.ref === "target" && whose.n)) return null;
    return { ref: "each", filter: { ...ofGroup.filter, text: x.toLowerCase() }, of: whose, ...(of[3] === "owns" ? { ofOwner: true as const } : {}) };
  }
  // "Put a +1/+1 counter on that creature and each other creature you control that shares a creature type with it"
  // (Holy Frazzle-Cannon): the trigger's creature, and the others as this resolves.
  const subjectAnd = ctx.subject && !ctx.spell ? /^that creature and (each other .+?) that shares a creature type with it$/i.exec(x) : null;
  if (subjectAnd) {
    const g = parseGroup(subjectAnd[1]!);
    return g?.other && !/ (?:with|that|who|which) /i.test(subjectAnd[1]!) ? { ref: "each", filter: g.filter, andSubject: true } : null;
  }
  // "Sacrifice ~: Enchanted creature and other creatures that share a creature type with it get +1/+1 until end of turn"
  // (Crown of Vigor): what the Aura enchanted, as it last existed once it's sacrificed, and every other creature sharing
  // a creature type with it as this resolves (CR 608.2h).
  if (!ctx.spell && /^enchanted creature and other creatures that share a creature type with it$/i.test(x))
    return { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature that shares a creature type with enchanted creature" }, andAttached: true };
  // "It and other creatures you control that share a creature type with it each get +2/+0 ... until end of turn" (Haunted
  // One): the source while it's still there, and the others as this resolves (CR 611.2c).
  // "~ and Drakes you control each get +X/+X" (Alandra, Sky Dreamer): the same, the source counted once if it's one too.
  const andOthers = !ctx.spell ? /^~ and ((?:other )?[A-Z]?[a-z]+ you control|other .+?)( that shares? a creature type with (?:~|it))?(?: each)?$/i.exec(x) : null;
  if (andOthers) {
    const g = parseGroup(andOthers[1]!.startsWith("other ") ? andOthers[1]! : `other ${andOthers[1]!}`);
    return g?.other && !/ (?:with|that|who|which) /i.test(andOthers[1]!.replace(/ you control$/, "")) ? { ref: "each", filter: g.filter, other: true, andSelf: true, ...(andOthers[2] ? { sharesTypeWithSelf: true as const } : {}) } : null;
  }
  // "Exile ~ and each artifact and creature your opponents control" (Ajani, Strength of the Pride): all at once, the source
  // while it's still there.
  const andTheirs = !ctx.spell ? /^~ and ((?:each|all) .+ (?:your opponents control|an opponent controls))$/i.exec(x) : null;
  if (andTheirs) {
    const g = parseGroup(andTheirs[1]!);
    return g && !g.other && g.filter.kind === "object" && g.filter.controller === "opponent" ? { ref: "each", filter: g.filter, andSelf: true } : null;
  }
  // Public Execution: "Destroy target creature an opponent controls. Each other creature that player controls gets -2/-0":
  // the target's controller's creatures but that target (still there if it wasn't destroyed).
  const thatPlayers = ctx.spell && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && ctx.targets[ctx.lastObjectTarget]!.controller === "opponent" ? /^each other creature that player controls$/i.exec(x) : null;
  if (thatPlayers) return { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "other creature that player controls" }, of: { ref: "targetController", index: ctx.lastObjectTarget! }, otherThan: ctx.lastObjectTarget! };
  // "All creatures with toughness less than or equal to the number of Islands you control": counted as it resolves.
  const group = parseGroup(x, false, (t) => parseBoundCount(t, ctx));
  if (group && group.other && ctx.spell) {
    // A spell's "other creatures you control": other than the creature it targeted ("Put two +1/+1
    // counters on target creature you control. Other creatures you control get +1/+1"). Other than
    // something it only named ("Zombies you control get +2/+1. Other creatures ...") isn't modeled.
    return ctx.lastObjectTarget !== undefined ? { ref: "each", filter: group.filter, otherThan: ctx.lastObjectTarget } : null;
  }
  if (group) return { ref: "each", filter: group.filter, ...(group.other ? { other: true } : {}) };
  const m = /^target (.+)$/i.exec(x);
  if (!m) return null;
  // "Target planeswalker that player controls or battle that player protects" (Rampaging Raptor), after "Whenever ~ deals
  // combat damage to an opponent": either, about that player (CR 310.9).
  if (!cards && ctx.eventPlayer && /^planeswalker that player controls or battle that player protects$/i.test(m[1]!)) {
    const anyOf: TargetSpec[] = [
      { kind: "object", types: ["Planeswalker"], controller: "eventPlayer", text: "planeswalker that player controls" },
      { kind: "object", types: ["Battle"], protector: "eventPlayer", text: "battle that player protects" },
    ];
    return { ref: "target", index: addTarget(ctx, { kind: "object", types: ["Planeswalker", "Battle"], anyOf, text: `target ${m[1]!}` }) };
  }
  // "Target creature that's attacking that player" (Ordruun Mentor), "target nontoken creature that's attacking that
  // player" (Echoing Assault), after "Whenever you attack a player": that player, known once it triggers.
  const attackingThem = !cards && ctx.eventPlayer ? /^(.+?) that's attacking that player$/i.exec(m[1]!) : null;
  if (attackingThem) {
    const spec = parseTargetPhrase(`attacking ${attackingThem[1]!}`, { target: true });
    if (spec?.kind !== "object" || spec.combat !== "attacking" || spec.controller) return null;
    return { ref: "target", index: addTarget(ctx, { ...spec, attackingWhom: "eventPlayer", text: `target ${m[1]!}` }) };
  }
  // Topple: "target creature with the greatest power among creatures on the battlefield": one tied for it, as it's chosen
  // and as it resolves (rulings; CR 608.2b), as a bound of at least that power.
  if (!cards && /^creature with the greatest power among creatures on the battlefield$/i.test(m[1]!)) {
    const amount = parseCount("the greatest power among creatures on the battlefield", ctx);
    if (amount?.count.kind !== "greatestPower") return null;
    return { ref: "target", index: addTarget(ctx, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], bound: { key: "power", at: "least", amount }, text: `target ${m[1]!}` }) };
  }
  // Triumph of Gerrard: "target creature you control with the greatest power": one of yours tied for the greatest power among
  // creatures you control, as it's chosen and as it resolves (rulings).
  if (!cards && /^creature you control with the greatest power$/i.test(m[1]!)) {
    const amount = parseCount("the greatest power among creatures you control", ctx);
    if (amount?.count.kind !== "greatestPower") return null;
    return { ref: "target", index: addTarget(ctx, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", bound: { key: "power", at: "least", amount }, text: `target ${m[1]!}` }) };
  }
  // Culling Scales: "target nonland permanent with the lowest mana value": one tied for the lowest among nonland permanents,
  // as it's chosen and as it resolves (CR 608.2b), as a bound of at most that mana value.
  if (!cards && /^nonland permanent with the lowest mana value$/i.test(m[1]!)) {
    const filter: TargetSpec = { kind: "object", types: [], notTypes: ["Land"], notColors: [], text: "nonland permanent" };
    const amount: AmountExpr = { count: { kind: "greatestManaValue", filter, least: true } };
    return { ref: "target", index: addTarget(ctx, { ...filter, bound: { key: "manaValue", at: "most", amount }, text: `target ${m[1]!}` }) };
  }
  // Searing Blaze: "target creature that player or that planeswalker's controller controls": controlled by the player the
  // earlier "target player or planeswalker" is, or by that planeswalker's controller (TargetSpec.controlledByTarget).
  const byAny = !cards && / that player or that planeswalker's controller controls$/i.exec(m[1]!);
  if (byAny) {
    const i = ctx.targets.length - 1;
    const t = ctx.targets[i];
    const spec = parseTargetPhrase(m[1]!.slice(0, byAny.index), { target: true });
    if (t?.kind !== "any" || !t.types?.includes("Planeswalker") || t.types.length !== 1 || spec?.kind !== "object" || spec.controller || spec.xRange || spec.bound) return null;
    return { ref: "target", index: addTarget(ctx, { ...spec, controlledByTarget: i, text: `target ${m[1]!}` }) };
  }
  // Keeper of the Dead, The Fall of Kroog: "Choose target opponent. Destroy target land that player controls.": controlled
  // by the player an earlier target chose, as it's chosen and as it resolves (CR 608.2b; TargetSpec.controlledByTarget).
  const byTarget = !cards && !ctx.eventPlayer && !ctx.defending && ctx.lastPlayerTarget !== undefined && ctx.targets[ctx.lastPlayerTarget]?.kind === "player" ? / that player controls$/i.exec(m[1]!) : null;
  if (byTarget) {
    const spec = parseTargetPhrase(m[1]!.slice(0, byTarget.index), { target: true });
    if (spec?.kind !== "object" || spec.controller || spec.xRange || spec.bound) return null;
    return { ref: "target", index: addTarget(ctx, { ...spec, controlledByTarget: ctx.lastPlayerTarget, text: `target ${m[1]!}` }) };
  }
  const [phrase, theirs] = thatPlayerControls(m[1]!, ctx);
  // "Target creature card of the chosen type" (From the Rubble, Dawn-Blessed Pennant): the creature type chosen as its
  // source entered, filled in on its abilities (cards.ts abilitiesOf); compile checks the source makes that choice.
  // "Target permanent of the chosen color" (Pentarch Paladin): the same with the color.
  const spec = parseTargetPhrase(phrase, { x: true, count: boundCount(ctx), target: true, chosen: true });
  if (spec?.chosen && ((spec.chosen !== "type" && spec.chosen !== "color") || ctx.spell)) return null;
  if (!spec || spec.kind === "player" || spec.kind === "spell" || (spec.kind === "card") !== cards || (theirs && (spec.kind === "card" ? !!spec.owner : spec.kind !== "object" || spec.controller))) return null;
  // "Target creature with power X or less": the X of a spell or of an activated ability's cost (CR 107.3a).
  // With "where X is ...", body.ts makes it a bound (TargetSpec.bound) once X is read, or gives up.
  if (spec.xRange && !ctx.whereX && !ctx.spell && !ctx.activated && !ctx.ownX) return null;
  return { ref: "target", index: addTarget(ctx, theirs ? { ...spec, controller: "eventPlayer", text: `target ${m[1]!}` } : spec) };
}

/**
 * Reads the amount of a target's "with mana value less than or equal to ..." (TargetSpec.bound): only one that can be
 * worked out from the source and its controller alone, both as the target is chosen and as it resolves.
 */
function boundCount(ctx: Ctx): (text: string) => AmountExpr | null {
  return (text) => {
    const before = ctx.targets.length;
    const a = parseCount(text, ctx);
    // Sundering Archaic: "with mana value less than or equal to the number of colors of mana spent to cast ~" in an enters
    // trigger: fixed as it was cast (CR 702.69a converge, 601.2h), so known as the trigger's targets are chosen.
    if (a?.count.kind === "colorsSpent" && !a.count.of && ctx.targets.length === before && !ctx.spell && !ctx.activated && ctx.selfEntered) return a;
    if (a && ctx.targets.length === before && boundAtTargeting(a)) return a;
    ctx.targets.length = before;
    return null;
  };
}

/** Can this amount be worked out as targets are chosen, from the source and its controller alone? */
export function boundAtTargeting(a: AmountExpr): boolean {
  const c = a.count;
  const mine = (who: PlayerRef | undefined) => !who || who.ref === "you" || who.ref === "eachPlayer" || who.ref === "eachOpponent";
  switch (c.kind) {
    case "permanents":
      return mine(c.whose);
    case "cardsInHand":
    case "cardsInLibrary":
    case "cardsInGraveyard":
    case "life":
    // Betor, Ancestor's Voice: "mana value less than or equal to the amount of life you lost this turn".
    case "lifeLostThisTurn":
      return mine(c.who);
    case "greatestPower":
      return mine(c.whose);
    case "devotion":
    case "party":
    case "greatestManaValue":
    case "lifeGainedThisTurn":
    // The number a tapAnyNumber instruction tapped, fixed before its reflexive trigger's targets are chosen (settleDivided).
    case "tappedThisWay":
    // Prismabasher: "the number of colors among permanents you control".
    case "colorsAmongPermanents":
    case "cardTypesAmongPermanents":
    // Archipelagore: "the number of times ~ has mutated", fixed as the mutate trigger's targets are chosen.
    case "mutations":
    // Custodi Soulcaller: "the number of players you attacked this combat", fixed once attackers are declared.
    case "opponentsAttacked":
      return true;
    // Rot Hulk: "the number of opponents you have"; Glissa's Retriever: "... who have three or more poison counters".
    case "players":
      return Object.keys(c).every((k) => k === "kind" || k === "opponents" || k === "poisonAtLeast");
    case "power":
    case "toughness":
    case "counters":
      // "The amassed Army's power" in the reflexive trigger after amassing: fixed as its targets are chosen (settleDivided).
      return c.of.ref === "self" || (c.kind === "power" && c.of.ref === "amassed");
    case "manaValue":
      // "That spell's mana value" in a cast trigger (Hammerhead Tyrant): as it was cast, fixed then (settleDivided).
      return c.of.ref === "castSpell";
    default:
      return false;
  }
}

/** "Creature that player controls" in a trigger about a player: the phrase without it, and whether it was there. */
function thatPlayerControls(phrase: string, ctx: Ctx): [string, boolean] {
  // Auron, Venerated Guardian: "target creature defending player controls with power less than ~'s power": the same
  // as "target creature with power less than ~'s power" that player controls.
  const mid = / (that player|defending player) controls( with (?:power|toughness|mana value) [^,]+)$/i.exec(phrase);
  if (mid && (/^that/i.test(mid[1]!) ? ctx.eventPlayer : ctx.defending)) return [`${phrase.slice(0, mid.index)}${mid[2]}`, true];
  const m = / that player controls$/i.exec(phrase);
  if (m && ctx.eventPlayer) return [phrase.slice(0, m.index), true];
  // "Target nonland permanent card from that player's graveyard" (Tinybones, the Pickpocket): a card that player owns.
  // Rakshasa Debaser: "target creature card from defending player's graveyard": the player it's attacking (CR 506.2).
  const yard = / from (that|defending) player's graveyard$/i.exec(phrase);
  if (yard && (yard[1] === "that" ? ctx.eventPlayer : ctx.defending)) return [`${phrase.slice(0, yard.index)} from a graveyard`, true];
  // "Whenever ~ attacks, tap target creature defending player controls": the player it's attacking (CR 506.2, rulings).
  const d = / defending player controls$/i.exec(phrase);
  return d && ctx.defending ? [phrase.slice(0, d.index), true] : [phrase, false];
}

const SEVERAL_TARGETS = /^(?:(up to )?(one hundred|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X|twice X) (other )?|(another) |(one or two|one, two, or three|any number of|one or more) (other )?)target (.+)$/i;

/**
 * "Up to two target creatures", "two target artifacts", "one or two target creatures", "another target
 * creature", "up to one other target permanent you control" (CR 115.3, 115.6, 601.2c). Each is a
 * target of its own, in a row; "up to" ones may be left unchosen, and none can be the same as another
 * of them. "Another" or "other" means other than the targets before it, or with none before it, other
 * than the ability's source.
 */
function parseSeveralTargets(m: RegExpExecArray, ctx: Ctx, cards: boolean): ObjRef | null {
  const [, upTo, count0, other0, another, range0, other1, phrase] = m;
  // "Up to twice X target cards" (Erebos's Intervention): up to X, doubled (TargetSpec.manyTimes).
  const twice = /^twice X$/i.test(count0 ?? "");
  if (twice && (!upTo || ctx.whereX)) return null;
  const count = twice ? "X" : count0;
  const range = range0?.toLowerCase();
  const other = other0 ?? other1;
  // "Any number of target creatures" (CR 601.2c, 115.6), "up to X target artifacts" with the spell's X (107.3a): how
  // many is announced as it's cast, so one entry stands for them all until then (TargetSpec.many).
  // "Destroy X target creatures": exactly X of them (Eliminate the Competition).
  // "Up to one hundred target creatures" (Baldin, Century Herdmaster): more than a few, so as with "any number of", no
  // more than that many (TargetSpec.manyMax).
  const most = upTo && count !== "X" ? (count!.toLowerCase() === "one hundred" ? 100 : num(count!)) : 0;
  const manyMax = most > 6 ? most : undefined;
  // "One or more target creatures" (Dwarven Song): as with "any number of", but at least one (TargetSpec.manyMin).
  const many = range === "any number of" || range === "one or more" || manyMax ? ("any" as const) : count === "X" ? (upTo ? ("x" as const) : ("exactX" as const)) : undefined;
  // A spell's X, or an activated ability's {X} (CR 107.3a, 602.2b), announced before targets are chosen.
  // "Up to X target creatures ..., where X is ..." (Endurance Bobblehead): the amount, as the targets are chosen
  // (TargetSpec.manyCount, set where "where X is" is read).
  const whereMany = count === "X" && !!upTo && !!ctx.whereX;
  if (count === "X" && !whereMany && (!(ctx.spell || ctx.activated || ctx.ownX) || ctx.whereX)) return null;
  const [required, n] = many ? [0, 1] : range ? (range.startsWith("one or two") ? [1, 2] : [1, 3]) : upTo ? [0, num(count!)] : another ? [1, 1] : [num(count!), num(count!)];
  if (n < 1 || n > 6) return null;
  // Yosei, the Morning Star: "target player skips their next untap step. Tap up to five target permanents that player
  // controls": controlled by that player target (TargetSpec.controlledByTarget).
  const byTarget = !cards && !ctx.eventPlayer && !ctx.defending && ctx.lastPlayerTarget !== undefined && ctx.targets[ctx.lastPlayerTarget]?.kind === "player" && !ctx.targets[ctx.lastPlayerTarget]!.many ? / that player controls$/i.exec(phrase!) : null;
  // Chandra, Pyromaster: "1 damage to up to one target creature that player or that planeswalker's controller controls":
  // as for one such target (Searing Blaze), the earlier "target player or planeswalker".
  const lastAny = ctx.targets.length - 1;
  const byAny = !byTarget && !cards && ctx.targets[lastAny]?.kind === "any" && ctx.targets[lastAny]!.types?.length === 1 && ctx.targets[lastAny]!.types![0] === "Planeswalker" ? / that player or that planeswalker's controller controls$/i.exec(phrase!) : null;
  const byIndex = byTarget ? ctx.lastPlayerTarget : byAny ? lastAny : undefined;
  const [mine1, theirs] = thatPlayerControls(byTarget ? phrase!.slice(0, byTarget.index) : byAny ? phrase!.slice(0, byAny.index) : phrase!, ctx);
  // Sorin, Lord of Innistrad: "up to three target creatures and/or other planeswalkers": other than the source, which
  // is a planeswalker, unless it's a creature too (rulings).
  const otherWalkers = !other && !another && !ctx.spell && !ctx.targets.length && /^creatures and\/or other planeswalkers$/.test(mine1);
  const mine0 = otherWalkers ? "creatures and/or planeswalkers" : mine1;
  // "Cards from a single graveyard" (all in one), "creature cards that share a creature type" (each with each other).
  const single = (n > 1 || !!many) && / from a single graveyard$/.test(mine0);
  const share = (n > 1 || !!many) && / that share a creature type(?= from |$)/.test(mine0);
  // "Up to six target creature cards with different names" (Behold the Sinister Six!): each a name the others don't have.
  const differ = n > 1 && !many && / with different names(?= from |$)/.test(mine0);
  // "Two target creatures controlled by different players" (Run Away Together, Switcheroo's kin): each a different
  // controller from the others', checked both ways (rulings: two creatures of one player are both illegal).
  const diffCtl = n > 1 && !many && / controlled by different players$/.test(mine0);
  // Shifting Loyalties: "two target permanents that share a card type": each sharing one with the other (CR 205.2a).
  const shareCard = n > 1 && !many && / that share a card type$/.test(mine0);
  // Rivals' Duel: "two target creatures that share no creature types": each sharing none with the other.
  const shareNone = n > 1 && !many && / that share no creature types$/.test(mine0);
  // "Any number of target creature cards that each have a different mana value X or less" (Agadeem's Awakening).
  const differMv = many === "any" ? / that each have a different mana value (\d+|X) or less(?= from |$)/.exec(mine0) : null;
  // "With total mana value 6 or less" (TargetSpec.total): the group together, X being the one announced (CR 107.3a).
  const totalM = n > 1 || many ? / with total (mana value|power) (\d+|X) or less(?= from | in |$)/.exec(mine0) : null;
  // With "where X is ...", X is defined by the text, which defineX (body.ts) works out or refuses.
  if (totalM && totalM[2] === "X" && !(ctx.spell || ctx.activated || ctx.ownX || ctx.whereX)) return null;
  // "Any number of target creatures with equal toughness" (V.A.T.S.).
  const equalToughness = many === "any" && / with equal toughness$/.test(mine0);
  const total: TargetSpec["total"] | undefined = totalM ? { key: totalM[1] === "power" ? "power" : "manaValue", ...(totalM[2] === "X" ? { x: true as const } : { max: Number(totalM[2]) }) } : undefined;
  const mine = mine0.replace(/ controlled by different players$/, "").replace(/ that share a card type$/, "").replace(/ that share no creature types$/, "").replace(/ that each have a different mana value (\d+|X) or less(?= from |$)/, " with mana value $1 or less").replace(/ from a single graveyard$/, " from a graveyard").replace(/ that share a creature type(?= from |$)/, "").replace(/ with different names(?= from |$)/, "").replace(/ with total (?:mana value|power) (?:\d+|X) or less(?= from | in |$)/, "").replace(equalToughness ? / with equal toughness$/ : /^$/, "");
  // "Up to three target creatures with toughness X or less" (Finale of Eternity): each one, with the spell's X.
  // "Up to X target artifact cards each with mana value X or less" (Dance of the Manse): each one's, with the spell's X.
  const each = (n > 1 || !!many) && / each with mana value X or less(?= from |$)/.test(mine);
  // "Up to three other target creatures from the battlefield and/or creature cards from graveyards" (Angel of Serenity):
  // each target one or the other (TargetSpec.orCard).
  const both = !cards && !differMv && !each ? / from the battlefield and\/or (.+?) from graveyards$/.exec(mine) : null;
  const perm = both ? parseTargetPhrase(singularPhrase(mine.slice(0, both.index))) : undefined;
  const yard = both ? parseTargetPhrase(`${singularPhrase(both[1]!)} from a graveyard`) : undefined;
  if (both && (perm?.kind !== "object" || yard?.kind !== "card" || perm.controller || yard.owner || theirs)) return null;
  const parsed = perm && yard ? { ...perm, orCard: yard, text: `${perm.text} or ${yard.text.replace(/^target /, "")}` } : differMv || each ? parseTargetPhrase(singularPhrase(mine.replace(/ each with mana value X or less(?= from |$)/, " with mana value X or less")), { x: true }) : n > 1 || many ? parseTargetPhrase(singularPhrase(mine), ctx.spell && / with (?:toughness|power|mana value) X or less$/.test(mine) ? { x: true } : undefined) : parseTargetPhrase(mine, { x: true, count: boundCount(ctx), target: true });
  // Skullsnatcher: "up to two target cards from that player's graveyard": cards that player owns (as for one target).
  if (!parsed || parsed.kind === "player" || parsed.kind === "spell" || (parsed.kind === "card") !== cards || (theirs && (parsed.kind === "card" ? !!parsed.owner : parsed.kind !== "object" || parsed.controller))) return null;
  // "Up to one target creature card with mana value X or less": as for one target (see parseTarget).
  if (parsed.xRange && !ctx.whereX && !ctx.spell && !ctx.activated && !ctx.ownX) return null;
  if (byIndex !== undefined && (parsed.kind !== "object" || parsed.controller)) return null;
  const spec0: TargetSpec = theirs ? { ...parsed, controller: "eventPlayer", text: parsed.kind === "card" ? parsed.text.replace(/ from a graveyard$/, " from that player's graveyard") : `${parsed.text} that player controls` } : byIndex !== undefined ? { ...parsed, controlledByTarget: byIndex, text: `${parsed.text} ${byAny ? "that player or that planeswalker's controller controls" : "that player controls"}` } : parsed;
  // One group with a total to each ability: the targets that have it are that group.
  if (total && ctx.targets.some((t) => t.total)) return null;
  if (equalToughness && (total || ctx.targets.some((t) => t.equalToughness))) return null;
  const spec: TargetSpec = total ? { ...spec0, total, text: `${spec0.text} (total ${total.key === "power" ? "power" : "mana value"} ${total.x ? "X" : total.max} or less)` } : equalToughness ? { ...spec0, equalToughness, text: `${spec0.text} (all with equal toughness)` } : spec0;
  // "Destroy up to one target artifact or enchantment. ... any number of other target creatures" (Kinetic Ooze): no target
  // before it was asked to be a creature, so "other" is other than the creature the ability is on.
  const sameWord = (t: TargetSpec) => t.kind === "any" || !t.types?.length || !spec.types?.length || t.types.some((x) => spec.types!.includes(x));
  const before = ctx.targets.flatMap((t, i) => ((t.kind === "object" || t.kind === "any" || t.kind === "card") && (another || ctx.spell || t.kind !== spec.kind || sameWord(t)) ? [i] : []));
  let notSource = otherWalkers;
  if (other || another) {
    if (!before.length && ctx.spell) return null; // a spell has no source on the battlefield to be other than
    notSource = !before.length;
  }
  const first = ctx.targets.length;
  if (many) {
    // Rats' Feast: "X target cards from a single graveyard": each in the graveyard of the others (TargetSpec.singleGraveyard).
    if ((single && many !== "exactX") || share || ctx.targets.some((t) => t.many)) return null;
    addTarget(ctx, { ...spec, ...(single ? { singleGraveyard: true as const, text: spec.text.replace(/ from a graveyard$/, " from a single graveyard") } : {}), ...(notSource ? { notSource } : {}), ...(other && before.length ? { distinctFrom: before } : {}), ...(manyMax ? { manyMax } : {}), ...(range === "one or more" ? { manyMin: 1 as const } : {}), ...(whereMany ? { manyWhere: true as const } : {}), ...(twice ? { manyTimes: 2 as const } : {}), ...(differMv ? { differentManaValues: true as const, text: spec.text.replace(" with mana value ", " with a different mana value ") } : {}), many });
    // "It" can't mean one of them; "they", "those creatures" means all of them, however many.
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return { ref: "target", index: first, n: 2 };
  }
  for (let k = 0; k < n; k++) {
    const distinct = [...(other || another ? before : []), ...Array.from({ length: k }, (_, j) => first + j)];
    const group = Array.from({ length: k }, (_, j) => first + j);
    addTarget(ctx, {
      ...spec,
      ...(k >= required ? { optional: true } : {}),
      ...(notSource ? { notSource } : {}),
      ...(otherWalkers ? { notSourceUnlessCreature: true as const, text: spec.text.replace(/ or planeswalker$/, " or other planeswalker") } : {}),
      ...(distinct.length ? { distinctFrom: distinct } : {}),
      ...(single && k ? { sameGraveyardAs: group } : {}),
      ...(share && k ? { sharesCreatureTypeWith: group } : {}),
      ...(differ && k ? { differentNameFrom: group } : {}),
      ...(diffCtl ? { differentControllerFrom: Array.from({ length: n }, (_, j) => first + j).filter((j) => j !== first + k) } : {}),
      ...(shareCard ? { sharesCardTypeWith: Array.from({ length: n }, (_, j) => first + j).filter((j) => j !== first + k) } : {}),
      ...(shareNone ? { sharesNoCreatureTypeWith: Array.from({ length: n }, (_, j) => first + j).filter((j) => j !== first + k) } : {}),
      ...(single || share || differ || diffCtl || shareCard || shareNone ? { text: `${spec.text.replace(/ from a graveyard$/, single ? " from a single graveyard" : " from a graveyard")}${share ? " sharing a creature type" : ""}${differ ? " with a different name" : ""}${diffCtl ? " controlled by a different player" : ""}${shareCard ? " sharing a card type" : ""}${shareNone ? " sharing no creature type with the other" : ""}` } : {}),
    });
  }
  // "It" can't mean one of several; "they" / "those creatures" means all of them.
  if (n > 1) ctx.lastObjectTarget = undefined;
  ctx.lastTargets = { index: first, ...(n > 1 ? { n } : {}) };
  return { ref: "target", index: first, ...(n > 1 ? { n } : {}) };
}

/**
 * "creatures you control" -> "creature you control", "creature cards from your graveyard" -> "creature card from your
 * graveyard". "Artifacts and/or enchantments" -> "artifact or enchantment": each target is one or the other. "Creature
 * cards each with mana value 2 or less" -> "creature card with mana value 2 or less".
 */
function singularPhrase(p: string): string {
  const words = p.trim().replace(/ and\/or /g, " or ").replace(/ each (?=with )/, " ").split(" ");
  // "Artifacts, creatures, and/or lands" (Ghostly Flicker): a comma after one.
  const plural = (w: string) => /^(creatures|cards|permanents|artifacts|enchantments|lands|planeswalkers|battles),?$/i.test(w);
  if (words.some(plural)) words.forEach((w, i) => plural(w) && (words[i] = w.endsWith(",") ? `${singular(w.slice(0, -1))},` : singular(w)));
  else {
    // A creature type: "two target Goblins", "up to two target Elves you control".
    const j = words.findIndex((w) => /^[A-Z]/.test(w) && CREATURE_TYPES.has(singular(w)) && w !== singular(w));
    // A basic land type: "up to four target Forests" (Nissa, Worldwaker).
    const land = j < 0 ? words.findIndex((w) => /^(?:Forests|Islands|Mountains|Swamps)$/.test(w)) : -1;
    if (land >= 0) words[land] = words[land]!.slice(0, -1);
    else if (j < 0) return p;
    else {
      words[j] = singular(words[j]!);
      // Lagorin, Soul of Alacria: "up to two target Mounts and/or Vehicles": each one or the other.
      if (words[j + 1] === "or" && words[j + 2] === "Vehicles" && j + 3 === words.length) words[j + 2] = "Vehicle";
    }
  }
  return words.join(" ").replace(/ your opponents control$/, " an opponent controls").replace(/ from graveyards$/, " from a graveyard");
}

export const PERMANENT_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];

const PLURAL_TYPES: Record<string, string> = {
  creatures: "creature",
  outlaws: "outlaw", // CR 700.12
  artifacts: "artifact",
  enchantments: "enchantment",
  lands: "land",
  permanents: "permanent",
  commanders: "commander", // CR 903.3
  tokens: "token", // "tokens you control", "creature tokens you control" (CR 111.1)
  planeswalkers: "planeswalker",
  battles: "battle",
  // "Destroy all Islands" (basic land types, CR 205.3i); "Plains" is the same in the plural.
  islands: "Island",
  swamps: "Swamp",
  mountains: "Mountain",
  forests: "Forest",
  // Artifact types (CR 205.3g): "Treasures you control have ..." (Goldspan Dragon).
  treasures: "Treasure",
  clues: "Clue",
  foods: "Food",
  vehicles: "Vehicle",
  // "Destroy all Auras" (Serene Heart): an enchantment subtype (CR 205.3h).
  auras: "Aura",
  // Witchbane Orb: "destroy all Curses attached to you" (an enchantment subtype too).
  curses: "Curse",
};

/** Creature types whose plural is the same word ("all Merfolk", "all Samurai"). */
const SAME_PLURAL = new Set(["Merfolk", "Treefolk", "Moonfolk", "Kithkin", "Samurai", "Sheep", "Kor", "Kavu", "Elk", "Fish", "Vedalken"]);

/**
 * A group of permanents an effect or static ability applies to without targeting them: "all
 * creatures", "each artifact and enchantment", "other creatures you control", "all creatures without
 * flying", "each creature you control with a +1/+1 counter on it", "creatures of the chosen type".
 * "Artifacts and enchantments" means each permanent that's an artifact or an enchantment. Without
 * "all" or "each" it has to say whose they are ("creatures you control"), unless `bare` (a static
 * ability's subject, "Creatures of the chosen type get +1/+1").
 */
export function parseGroup(phrase: string, bare = false, count?: (text: string) => AmountExpr | null): { filter: TargetSpec; other: boolean } | null {
  // "Each nonland, nontoken permanent": the same as "each nonland nontoken permanent".
  let p = phrase.trim().replace(/\b(non-?[a-z]+), (?=non-?[a-z]+ )/gi, "$1 ");
  // "Each other Merfolk and/or Knight you control" (Vodalian Wave-Knight): each that's either one, or both.
  p = p.replace(/^(each (?:other )?)([A-Z][a-z]+) and\/or ([A-Z][a-z]+)(?= you control$)/, (all, e: string, a: string, b: string) => (CREATURE_TYPES.has(a) && CREATURE_TYPES.has(b) ? `${e}${a} or ${b}` : all));
  // Aku Djinn: "each creature each opponent controls" is each creature your opponents control.
  p = p.replace(/^(each (?:[a-z]+ )?creature) each opponent controls$/, "$1 your opponents control");
  // "Creatures you control that are enchanted or equipped" (Halvar, God of Battle): "enchanted-or-equipped creatures you control".
  p = p.replace(/^((?:all |each )?)(creatures|creature tokens) (you control) that are (enchanted or equipped|enchanted|equipped)$/i, (_, a: string, k: string, w: string, st: string) => `${a}${st.replace(/ /g, "-")} ${k} ${w}`);
  // "Each creature that's enchanted by an Aura you control" (Eriette of the Charmed Apple): the Aura yours, the creature anyone's.
  p = p.replace(/^((?:all |each )?)(creatures?) that(?:'s| is| are|'re) enchanted by an Aura you control$/i, "$1aura-yours-enchanted $2");
  // Archon of the Wild Rose: "other creatures you control that are enchanted by Auras you control": yours, with an Aura of
  // yours on it.
  p = p.replace(/^((?:all |each )?(?:other )?)(creatures) (you control) that are enchanted by Auras you control$/i, "$1aura-yours-enchanted $2 $3");
  // Kaima, the Fractured Calm: "each creature your opponents control that's enchanted by an Aura you control".
  p = p.replace(/^((?:all |each )?)(creatures?) (your opponents control) that(?:'s| is| are|'re) enchanted by an Aura you control$/i, "$1aura-yours-enchanted $2 $3");
  // "Each permanent you control that's a creature or Vehicle" (Ao, the Dawn Sky): each creature or Vehicle you control.
  p = p.replace(/^((?:all |each )?)permanents? you control that(?:'s| is| are|'re) (?:an? )?creatures? or (?:an? )?Vehicles?$/i, "$1creature or Vehicle you control");
  // "All nonland permanents that aren't legendary" (Urza's Ruinous Blast): the nonlegendary ones.
  p = p.replace(/^((?:all |each )?)([a-z ]+?) that (?:aren't|are not|isn't|is not) legendary$/i, "$1nonlegendary $2");
  // "Each nonland permanent that's not historic" (Desynchronization): not an artifact, not legendary, not a Saga (CR 700.6).
  p = p.replace(/^((?:all |each )?)([a-z ]+?) that(?:'s| is| are|'re) not historic$/i, "$1nonartifact nonlegendary non-Saga $2");
  // "Auras, Equipment, and modified creatures you control" (Silkguard): each permanent that's one of them (CR 700.9).
  if (/^Auras, Equipment, and modified creatures you control$/i.test(p)) {
    const anyOf: TargetSpec[] = [
      { kind: "object", types: ["Enchantment"], subtypes: ["Aura"], text: "Aura" },
      { kind: "object", types: ["Artifact"], subtypes: ["Equipment"], text: "Equipment" },
      { kind: "object", types: ["Creature"], status: "modified", text: "modified creature" },
    ];
    return { filter: { kind: "object", types: ["Enchantment", "Artifact", "Creature"], notTypes: [], notColors: [], anyOf, controller: "you", text: phrase.trim().toLowerCase() }, other: false };
  }
  // Zedruu the Greathearted: "permanents you own that your opponents control": owned by you, controlled by another
  // player (CR 108.3, 108.4).
  const ownedTheirs = /^(.+?) you own that your opponents control$/.exec(p);
  if (ownedTheirs) {
    const base = parseGroup(`${ownedTheirs[1]!} your opponents control`, bare, count);
    if (!base || base.filter.kind !== "object" || base.filter.owner) return null;
    return { filter: { ...base.filter, owner: "you", text: phrase.trim().toLowerCase() }, other: base.other };
  }
  // "Each Spider and legendary creature you control" (Ultimate Spider-Man): each creature you control that's a Spider
  // or legendary (either one, TargetSpec.anyOf), once each.
  const typeAndLegendary = /^((?:all |each )?)([A-Z][a-z]+) and legendary creatures? you control$/.exec(p);
  if (typeAndLegendary && CREATURE_TYPES.has(singular(typeAndLegendary[2]!))) {
    const base = parseGroup(`${typeAndLegendary[1]!}creature you control`, bare, count);
    if (!base || base.filter.kind !== "object" || base.filter.anyOf) return null;
    const anyOf: TargetSpec[] = [{ kind: "object", subtypes: [singular(typeAndLegendary[2]!)], text: singular(typeAndLegendary[2]!) }, { kind: "object", supertypes: ["Legendary"], text: "legendary" }];
    return { filter: { ...base.filter, anyOf, text: phrase.trim().toLowerCase() }, other: base.other };
  }
  // "Each other creature you control that's a token or a Rabbit" (Finneas, Ace Archer): either one (TargetSpec.anyOf).
  const tokenOr = /^((?:all |each )?(?:other )?creatures? you control) that(?:'s| is| are|'re) (?:a )?tokens? or (?:an? )?([A-Z][a-z]+)$/.exec(p);
  if (tokenOr && CREATURE_TYPES.has(singular(tokenOr[2]!))) {
    const base = parseGroup(tokenOr[1]!, bare, count);
    if (!base || base.filter.anyOf) return null;
    const anyOf: TargetSpec[] = [{ kind: "object", token: true, text: "token" }, { kind: "object", subtypes: [singular(tokenOr[2]!)], text: singular(tokenOr[2]!) }];
    return { filter: { ...base.filter, anyOf, text: phrase.trim().toLowerCase() }, other: base.other };
  }
  // "Each creature you control that's an artifact or Human" (Paladin Danse, Steel Maverick): either one.
  const typeOr = /^((?:[Aa]ll |[Ee]ach )?(?:other )?creatures? you control) that(?:'s| is| are|'re) (?:an? )?(artifact|enchantment)s? or (?:an? )?([A-Z][a-z]+)$/.exec(p);
  if (typeOr && CREATURE_TYPES.has(singular(typeOr[3]!))) {
    const base = parseGroup(typeOr[1]!, bare, count);
    if (!base || base.filter.anyOf) return null;
    const anyOf: TargetSpec[] = [{ kind: "object", types: [capital(typeOr[2]!)], text: typeOr[2]! }, { kind: "object", subtypes: [singular(typeOr[3]!)], text: singular(typeOr[3]!) }];
    return { filter: { ...base.filter, anyOf, text: phrase.trim().toLowerCase() }, other: base.other };
  }
  const all = /^(all|each) /i.exec(p);
  if (all) p = p.slice(all[0].length);
  const other = /^other /i.test(p);
  if (other) p = p.slice(6);
  p = subtypeClause(p);
  const whose = / (you control|your opponents control|an opponent controls|you don't control)\b/i;
  // "Attacking creatures get +1/+1 until end of turn": whichever are attacking as it resolves (CR 611.2c).
  // Blaring Captain: "attacking Warriors get +1/+1 until end of turn": the same, of that creature type.
  const combatTyped = /^(?:[Aa]ttacking|[Bb]locking) ([A-Z][a-z]+)$/.exec(p);
  // Agrus Kos: "attacking red creatures get +2/+0 until end of turn": of that color too.
  // Iron Man, Armored Avenger: "other attacking modified creatures" (CR 700.9).
  const combat = /^(attacking|blocking|attacking or blocking) (?:(?:white|blue|black|red|green|modified) )?creatures\b/i.test(p) || (!!combatTyped && /s$/.test(combatTyped[1]!) && CREATURE_TYPES.has(singular(combatTyped[1]!)));
  // "Creatures of the chosen type get +3/+3 until end of turn": every creature of that type; "creatures that aren't of
  // the chosen type get -3/-3" (Crippling Fear): every other creature.
  const ofChosen = /^creatures (?:that aren't |not )?of the chosen type$/i.test(p);
  // "Dragon creatures get +1/+1 until end of turn" (Bladewing the Risen): every creature of those types, whoever controls it.
  const typed = /^(?:[A-Z][a-z]+ )+creatures$/.test(p) && p.split(" ").slice(0, -1).every((w) => CREATURE_TYPES.has(w));
  // "White creatures get +2/+0 until end of turn" (Valorous Charge), "green creatures get -1/-1" (Rank and File): every
  // creature of that color, whoever controls it.
  // "Nonartifact creatures get -1/-1 until end of turn" (Stench of Decay): every creature that isn't an artifact.
  // "Green creatures and white creatures can't block this turn" (Flash of Defiance): each creature that's either color.
  // "Creatures with no counters on them get -2/-2 until end of turn" (Hazardous Conditions): every one, as it resolves.
  const twoHues = /^(white|blue|black|red|green) creatures and (white|blue|black|red|green) creatures$/i.exec(p);
  if (twoHues) p = `${twoHues[1]} or ${twoHues[2]} creatures`;
  // "Non-Elf creatures get -2/-2 until end of turn" (Eyeblight Massacre): every creature that isn't an Elf.
  const nonType = /^non-([a-z]+) creatures$/i.exec(p);
  // "Creature tokens get -2/-2 until end of turn" (Bloodline Culling): every creature token, whoever controls it.
  const hued = /^(?:non-?)?(?:white|blue|black|red|green)(?: or (?:white|blue|black|red|green))? creatures$/i.test(p) || /^(?:nonartifact creatures|creature tokens)$/i.test(p) || /^creatures with no counters on them$/i.test(p) || (!!nonType && CREATURE_TYPES.has(capital(nonType[1]!)));
  // Harvester of Misery: "other creatures get -2/-2 until end of turn": every creature but the source.
  const othersAll = other && /^creatures$/i.test(p);
  // Roar of Resistance: "creatures attacking your opponents and/or planeswalkers they control get +2/+0 until end of
  // turn": whichever are attacking them as it resolves (CR 611.2c), not ones attacking a battle.
  if (!all && !other && /^creatures attacking your opponents and\/or planeswalkers they control$/i.test(p))
    return { filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], combat: "attackingOpponentOrTheirPlaneswalker", text: phrase.trim().toLowerCase() }, other };
  if (!all && !whose.test(p) && !bare && !combat && !ofChosen && !typed && !hued && !othersAll) return null;
  // The kinds come first; plurals become the singular parseTargetPhrase reads ("Elves" -> "Elf").
  const cut = /\b(with|without|you control|your opponents control|an opponent controls|you don't control|of the chosen|of that|that aren't|that are not|not of|that attacked this turn|that fought this turn|that saddled (?:it|~) this turn|that dealt combat damage to you this turn|that didn't attack this turn|that entered (?:the battlefield )?this turn)\b/i.exec(p);
  let head = (cut ? p.slice(0, cut.index) : p).trim();
  const tail = cut ? p.slice(cut.index).replace(/^your opponents control/i, "an opponent controls").replace(/ your opponents control/i, " an opponent controls") : "";
  // "Each other creature you control that's a Cat, Elemental, Nightmare, Dinosaur, or Beast" (Kaheera, the Orphanguard):
  // a list of three or more creature types, read as a list (parseTargetPhrase).
  const typeList = /^((?:[A-Z][a-z]+, )+[A-Z][a-z]+,? or [A-Z][a-z]+) creature$/.exec(head);
  if (typeList && all?.[1]!.toLowerCase() === "each" && typeList[1]!.split(/,? or |, /).every((w) => CREATURE_TYPES.has(w))) {
    const spec = parseTargetPhrase(`${head} ${tail}`.trim(), { chosen: true, ...(count ? { count } : {}) });
    return spec?.kind === "object" ? { filter: { ...spec, text: phrase.trim().toLowerCase() }, other } : null;
  }
  const words = head.replace(/,? and |, or |, /g, " or ").split(/\s+/);
  // A plural noun is a group; a singular one only after "each" ("each creature", but not "all creature").
  // "All Samurai you control" (Godo, Bandit Warlord): a creature type whose plural is the same word; so is a static
  // ability's subject, "Other Merfolk get +1/+1" (Lord of Atlantis), whose verb is plural.
  // "Destroy all Plains" (Flashfires): the basic land type is the same word in the plural.
  // "Mice you control get +1/+0" (Flowerfoot Swordmaster): an irregular plural.
  const plural = words.some((w) => PLURAL_TYPES[w.toLowerCase()] || ((/s$/.test(w) || /^(?:Mice|Oxen|Pegasi)$/.test(w)) && CREATURE_TYPES.has(singular(capital(w)))) || ((!!all || bare) && SAME_PLURAL.has(w)) || (!!all && w === "Plains"));
  if (!plural && !(all && all[1]!.toLowerCase() === "each")) return null;
  head = words
    .map((w) => PLURAL_TYPES[w.toLowerCase()] ?? (/^[A-Z]/.test(w) && w !== "Plains" && CREATURE_TYPES.has(singular(w)) ? singular(w) : w))
    .join(" ");
  const spec = parseTargetPhrase(`${head} ${tail}`.trim(), { chosen: true, ...(count ? { count } : {}) });
  if (!spec || spec.kind !== "object") return null;
  return { filter: { ...spec, text: phrase.trim().toLowerCase() }, other };
}

/**
 * "target creature card from your graveyard" where the effect needs the card to be in
 * `owner`'s graveyard (e.g. "to your hand" only fits your own cards).
 */
export function parseCardTarget(p: string, ctx: Ctx, owner?: "you"): ObjRef | null {
  const i = ctx.targets.length;
  const what = parseObject(p, ctx, true);
  if (!what) return null;
  if (owner && ctx.targets[i]?.owner !== owner) {
    ctx.targets.length = i;
    return null;
  }
  return what;
}

/** The creature types that make an object an outlaw (CR 700.12). */
export const OUTLAW_TYPES = ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"];

/**
 * "Creature that isn't an Insect, Rat, Spider, or Squirrel" is a "non-Insect, non-Rat, non-Spider, non-Squirrel creature";
 * "creature you control that's an Insect, Rat, Spider, or Squirrel" an "Insect, Rat, Spider, or Squirrel creature you
 * control" (Swarmyard Massacre). Only creature types.
 */
export function subtypeClause(p: string): string {
  const m = /^(creatures?)( you control| an opponent controls)? that(?:'s| is| are|'re)( not|n't)? (?:an? )?((?:[A-Z][a-z]+, )*[A-Z][a-z]+(?:,? or (?:an? )?[A-Z][a-z]+)?)$/.exec(p);
  if (!m) return p;
  const types = m[4]!.split(/,? or (?:an? )?|, /);
  if (!types.every((t) => CREATURE_TYPES.has(t))) return p;
  return m[3] ? `${types.map((t) => `non-${t}`).join(" ")} ${m[1]}${m[2] ?? ""}` : `${m[4]!.replace(/ or an? /, " or ")} ${m[1]}${m[2] ?? ""}`;
}

/** Parse the words after "target": "nonblack creature an opponent controls", "artifact or enchantment", "spell", ... */
export function parseTargetPhrase(
  phrase: string,
  opts: {
    chosen?: boolean;
    /** "with power X or less" may be the X announced (TargetSpec.xRange). */
    x?: boolean;
    /** Reads the amount of "with mana value less than or equal to <amount>" (TargetSpec.bound); without it, unsupported. */
    count?: (text: string) => AmountExpr | null;
    /** One target ("target creature ..."), as it's chosen. */
    target?: true;
  } = {},
): TargetSpec | null {
  // Regicide: "creature that's one or more of the colors chosen as you drafted cards named ~": no colors were chosen
  // without a draft, so nothing fits (TargetSpec.drafted, oracle/draft.ts).
  const drafted = /^(.+?) that's one or more of the colors chosen as you drafted cards named ~$/.exec(phrase);
  if (drafted) {
    const head = parseTargetPhrase(drafted[1]!, opts);
    return head && head.kind === "object" ? { ...head, drafted: true, text: phrase } : null;
  }
  // Telim'Tor's Edict: "target permanent you own or control": yours by either (CR 108.3, 110.2).
  if (phrase.trim() === "permanent you own or control")
    return { kind: "object", types: [], notTypes: [], notColors: [], anyOf: [{ kind: "object", types: [], notTypes: [], notColors: [], owner: "you", text: "permanent you own" }, { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", text: "permanent you control" }], text: "target permanent you own or control" };
  // Ice Cream Kitty: "Sacrifice another creature or token": a permanent that's either (a token of any type too).
  const orToken = /^(artifact|creature|enchantment|land) or token$/.exec(phrase.trim());
  if (orToken) {
    const t = orToken[1]!.charAt(0).toUpperCase() + orToken[1]!.slice(1);
    return { kind: "object", types: [], anyOf: [{ kind: "object", types: [t], text: orToken[1]! }, { kind: "object", types: [], token: true, text: "token" }], text: phrase.trim() };
  }
  // Celestial Gatekeeper: "Bird and/or Cleric permanent cards from your graveyard": a permanent card (CR 110.4b) with
  // either creature type.
  const subPermanent = /^([A-Z][a-z]+) (?:and\/)?or ([A-Z][a-z]+) permanent (cards? from your graveyard)$/.exec(phrase.trim());
  if (subPermanent && CREATURE_TYPES.has(subPermanent[1]!) && CREATURE_TYPES.has(subPermanent[2]!)) {
    const head = parseTargetPhrase(`${subPermanent[1]} or ${subPermanent[2]} ${subPermanent[3]}`, opts);
    return head?.kind === "card" && !head.types?.length && head.subtypes?.length === 2 ? { ...head, types: [...PERMANENT_TYPES], text: `target ${phrase.trim()}` } : null;
  }
  // Rob the Hoard: "artifact, enchantment, or legendary card from your graveyard": a card that's any of them.
  const typesOrLegendary = /^(artifact|creature|enchantment|instant|sorcery|land|planeswalker), (artifact|creature|enchantment|instant|sorcery|land|planeswalker), or legendary card( from (?:your|a) graveyard)$/.exec(phrase.trim());
  if (typesOrLegendary) {
    const head = parseTargetPhrase(`${typesOrLegendary[1]} or ${typesOrLegendary[2]} card${typesOrLegendary[3]}`, opts);
    if (head?.kind !== "card" || head.types?.length !== 2) return null;
    const anyOf: TargetSpec[] = [...head.types.map((t) => ({ kind: "card" as const, types: [t], text: t.toLowerCase() })), { kind: "card", types: [], supertypes: ["Legendary"], text: "legendary" }];
    return { ...head, types: [], anyOf, text: phrase.trim() };
  }
  // "Permanent you control but don't own" (Staff of Eden): another player's that you control (CR 108.3).
  const notOwned = /^(.+ you control) but don't own$/.exec(phrase.trim());
  if (notOwned) {
    const head = parseTargetPhrase(notOwned[1]!, opts);
    return head?.kind === "object" && head.controller === "you" && !head.owner ? { ...head, owner: "opponent", text: `${head.text} but don't own` } : null;
  }
  // "Enchanted creature or enchantment creature" (Karametra's Blessing, Nyx Herald, Feast of Dreams): a creature that's
  // enchanted or is an enchantment, either one (TargetSpec.anyOf).
  const enchOr = /^(target )?enchanted creature or enchantment creature((?: you control)?)$/.exec(phrase.trim());
  if (enchOr) {
    const rest = parseTargetPhrase(`${enchOr[1] ?? ""}creature${enchOr[2]}`, opts);
    if (rest?.kind !== "object" || rest.anyOf) return null;
    const anyOf: TargetSpec[] = [{ kind: "object", status: "enchanted", text: "enchanted creature" }, { kind: "object", types: ["Enchantment"], text: "enchantment creature" }];
    return { ...rest, anyOf, text: rest.text.replace(/\bcreature\b/, "enchanted creature or enchantment creature") };
  }
  // Godhunter Octopus: "an enchantment or an enchanted permanent": a permanent that's either one (TargetSpec.anyOf).
  if (/^an? enchantment or an enchanted permanent$/.test(phrase.trim())) {
    const anyOf: TargetSpec[] = [{ kind: "object", types: ["Enchantment"], text: "enchantment" }, { kind: "object", status: "enchanted", text: "enchanted permanent" }];
    return { kind: "object", types: [], notTypes: [], notColors: [], anyOf, text: "enchantment or enchanted permanent" };
  }
  // Sonar Strike: "target attacking, blocking, or tapped creature": one that's any of them (TargetSpec.anyOf).
  const combatOrTapped = /^(target )?attacking, blocking, or tapped creature$/.exec(phrase.trim());
  if (combatOrTapped) {
    const rest = parseTargetPhrase(`${combatOrTapped[1] ?? ""}creature`, opts);
    if (rest?.kind !== "object" || rest.anyOf) return null;
    const anyOf: TargetSpec[] = [{ kind: "object", combat: "attackingOrBlocking", text: "attacking or blocking creature" }, { kind: "object", tapped: true, text: "tapped creature" }];
    return { ...rest, anyOf, text: rest.text.replace(/\bcreature\b/, "attacking, blocking, or tapped creature") };
  }
  // Tetsuo Umezawa: "target tapped or blocking creature": either one.
  const tappedOrBlocking = /^(target )?tapped or blocking creature$/.exec(phrase.trim());
  if (tappedOrBlocking) {
    const rest = parseTargetPhrase(`${tappedOrBlocking[1] ?? ""}creature`, opts);
    if (rest?.kind !== "object" || rest.anyOf) return null;
    const anyOf: TargetSpec[] = [{ kind: "object", tapped: true, text: "tapped creature" }, { kind: "object", combat: "blocking", text: "blocking creature" }];
    return { ...rest, anyOf, text: rest.text.replace(/\bcreature\b/, "tapped or blocking creature") };
  }
  // Silumgar Assassin: "target creature with power 3 or less an opponent controls": the same as "target creature an
  // opponent controls with power 3 or less".
  const withThenCtl = /^((?:target )?[a-z ]*?creature) (with (?:power|toughness|mana value) \d+ or (?:less|greater)) (an opponent controls|you control|you don't control)$/.exec(phrase.trim());
  if (withThenCtl) return parseTargetPhrase(`${withThenCtl[1]} ${withThenCtl[3]} ${withThenCtl[2]}`, opts);
  // Evaporate: "each white and/or blue creature": either color or both, as "white or blue creature" is (counted once).
  const andOr = /^((?:target |each )?)(white|blue|black|red|green) and\/or (white|blue|black|red|green) (creature|permanent)s?$/.exec(phrase.trim());
  if (andOr) return parseTargetPhrase(`${andOr[1]}${andOr[2]} or ${andOr[3]} ${andOr[4]}`, opts);
  // Surge of Righteousness: "black or red creature that's attacking or blocking" is an attacking or blocking black or red
  // creature.
  const thatsCombat = /^(target )?((?:[a-z]+ )*)creature that's (attacking or blocking|attacking|blocking)$/.exec(phrase.trim());
  if (thatsCombat) return parseTargetPhrase(`${thatsCombat[1] ?? ""}${thatsCombat[3]} ${thatsCombat[2]}creature`, opts);
  // Terminal Criticism: "creature or planeswalker that's blue or red"; Essence Burn: "black or green creature or
  // planeswalker": a creature or planeswalker of either color.
  // Flourishing Grapple: "creature or planeswalker an opponent controls that's red or white".
  const huedTypes = /^(target )?(?:(white|blue|black|red|green) or (white|blue|black|red|green) (creature or planeswalker)|(creature or planeswalker(?: an opponent controls| you control)?) that's (white|blue|black|red|green) or (white|blue|black|red|green))$/.exec(phrase.trim());
  if (huedTypes) {
    const head = parseTargetPhrase(`${huedTypes[1] ?? ""}${huedTypes[4] ?? huedTypes[5]}`, opts);
    const colors = [huedTypes[2] ?? huedTypes[6], huedTypes[3] ?? huedTypes[7]].map((c) => COLOR_WORDS[c!]!);
    return head?.kind === "object" && !head.colors && !head.anyOf ? { ...head, colors, text: `target ${phrase.trim().toLowerCase()}` } : null;
  }
  // Purge: "artifact creature or black creature": a creature that's an artifact or black, or both.
  const twoKinds = /^(target )?(artifact|black|white|blue|red|green) creature or (artifact|black|white|blue|red|green) creature$/.exec(phrase.trim());
  if (twoKinds && twoKinds[2] !== twoKinds[3]) {
    const anyOf = [twoKinds[2]!, twoKinds[3]!].map((w) => parseTargetPhrase(`${w} creature`, opts));
    if (anyOf.every((x) => x?.kind === "object" && !x.anyOf)) return { kind: "object", types: ["Creature"], notTypes: [], notColors: [], anyOf: anyOf as TargetSpec[], text: `target ${phrase.trim().toLowerCase()}` };
  }
  // Nissa's Defeat: "Forest, green enchantment, or green planeswalker": a permanent that's any of them.
  const landHued = /^(target )?(Plains|Island|Swamp|Mountain|Forest), (white|blue|black|red|green) enchantment, or (white|blue|black|red|green) planeswalker$/.exec(phrase.trim());
  if (landHued) {
    const anyOf = [landHued[2]!, `${landHued[3]} enchantment`, `${landHued[4]} planeswalker`].map((w) => parseTargetPhrase(w, opts));
    if (anyOf.every((x) => x?.kind === "object" && !x.anyOf && !x.controller)) return { kind: "object", types: [], notTypes: [], notColors: [], anyOf: anyOf as TargetSpec[], text: `target ${phrase.trim().replace(/^target /, "")}` };
  }
  // Bumi Bash: "land creature or nonbasic land": a permanent that's either one, or both.
  const landOr = /^(target )?(land|artifact) creature or nonbasic land$/.exec(phrase.trim());
  if (landOr) {
    const anyOf = [`${landOr[2]} creature`, "nonbasic land"].map((w) => parseTargetPhrase(w, opts));
    if (anyOf.every((x) => x?.kind === "object" && !x.anyOf && !x.controller)) return { kind: "object", types: [], notTypes: [], notColors: [], anyOf: anyOf as TargetSpec[], text: `target ${phrase.trim().toLowerCase().replace(/^target /, "")}` };
  }
  // Thraben Exorcism: "Spirit, creature with disturb, or enchantment": a permanent that's any of them; disturb as the
  // permanent has it (a creature cast with disturb is its back face, which hasn't, CR 702.146b).
  if (/^(target )?Spirit, creature with disturb, or enchantment$/.test(phrase.trim())) {
    const anyOf = ["Spirit", "creature", "enchantment"].map((w) => parseTargetPhrase(w, opts));
    if (anyOf[1]?.kind === "object") anyOf[1] = { ...anyOf[1], keywords: ["Disturb"], text: "creature with disturb" };
    if (anyOf.every((x) => x?.kind === "object" && !x.anyOf && !x.controller)) return { kind: "object", types: [], notTypes: [], notColors: [], anyOf: anyOf as TargetSpec[], text: "target Spirit, creature with disturb, or enchantment" };
  }
  // Heliod, the Radiant Dawn: "enchantment card that isn't a God" is a non-God enchantment card.
  const isnt = /^(target )?([a-z]+) card that isn't an? ([A-Z][a-z]+)(\b.*)$/.exec(phrase.trim());
  if (isnt) return parseTargetPhrase(`${isnt[1] ?? ""}non-${isnt[3]} ${isnt[2]} card${isnt[4]}`, opts);
  // Clavileño: "attacking Vampire that isn't a Demon" is an attacking non-Demon Vampire (creature types only).
  const typeIsnt = /^(target )?((?:[a-z]+ )*)([A-Z][a-z]+) that isn't an? ([A-Z][a-z]+)$/.exec(phrase.trim());
  if (typeIsnt && CREATURE_TYPES.has(typeIsnt[3]!) && CREATURE_TYPES.has(typeIsnt[4]!)) return parseTargetPhrase(`${typeIsnt[1] ?? ""}${typeIsnt[2]}non-${typeIsnt[4]} ${typeIsnt[3]}`, opts);
  // Bounty Agent: "legendary permanent that's an artifact, creature, or enchantment" is a legendary artifact, creature,
  // or enchantment.
  const thatsA = /^(target )?((?:[a-z]+ )*)permanent that's an? ((?:artifact|creature|enchantment|land|planeswalker|battle)(?:, (?:artifact|creature|enchantment|land|planeswalker|battle))*,? or (?:artifact|creature|enchantment|land|planeswalker|battle))$/.exec(phrase.trim());
  if (thatsA) return parseTargetPhrase(`${thatsA[1] ?? ""}${thatsA[2]}${thatsA[3]}`, opts);
  // Yenna, Redtooth Regent: "enchantment you control that doesn't have the same name as another permanent you control".
  // The Apprentice's Folly: "nontoken creature you control that doesn't have the same name as a token you control".
  const unique = / that doesn't have the same name as (another permanent|a token) you control$/.exec(phrase.trim());
  if (unique) {
    const rest = parseTargetPhrase(phrase.trim().slice(0, unique.index), opts);
    return rest?.kind === "object" && rest.controller === "you" ? { ...rest, uniqueNameAmongYours: unique[1] === "a token" ? ("tokens" as const) : true, text: `target ${phrase.trim().toLowerCase()}` } : null;
  }
  // Éowyn, Fearless Knight: "target creature an opponent controls with greater power": than the source's, or its last
  // known power if it has left (as mentor's "lesser power", CR 702.134a). Only a target: it's checked as targets are.
  const greater = opts.target && /^(.+) with greater power$/i.exec(phrase.trim());
  if (greater) {
    const rest = parseTargetPhrase(greater[1]!, opts);
    return rest?.kind === "object" && !rest.power && !rest.many ? { ...rest, greaterPowerThanSource: true, text: `${rest.text} with greater power` } : null;
  }
  // Gyrus, Waker of Corpses: "target creature card with lesser power from your graveyard": than the source's power, or
  // its last known power if it has left (as mentor's, CR 702.134a), against the card's power in the graveyard. Only a
  // target: it's checked as targets are chosen and as the ability resolves (CR 608.2b).
  const lesserCard = opts.target && /^(target )?([a-z]+ card) with lesser power (from your graveyard)$/i.exec(phrase.trim());
  if (lesserCard) {
    const rest = parseTargetPhrase(`${lesserCard[1] ?? ""}${lesserCard[2]} ${lesserCard[3]}`, opts);
    return rest?.kind === "card" && !rest.power && !rest.many ? { ...rest, lesserPowerThanSource: true, text: `target ${phrase.trim().replace(/^target /i, "").toLowerCase()}` } : null;
  }
  // Tsabo's Web: "land with an activated ability that isn't a mana ability", printed or granted (CR 605.1a).
  const nonMana = / with an activated ability that isn't a mana ability$/.exec(phrase.trim());
  if (nonMana) {
    const rest = parseTargetPhrase(phrase.trim().slice(0, nonMana.index), opts);
    return rest?.kind === "object" && !rest.nonManaActivated ? { ...rest, nonManaActivated: true, text: `target ${phrase.trim().toLowerCase()}` } : null;
  }
  // Edgewall Inn: "target card that has an Adventure from your graveyard": an adventurer card (CR 715.2), whatever its types.
  const adv = /^(target )?(card) that has an Adventure( from your graveyard)$/i.exec(phrase.trim());
  if (adv) {
    const rest = parseTargetPhrase(`${adv[1] ?? ""}${adv[2]}${adv[3]}`, opts);
    return rest?.kind === "card" && !rest.many ? { ...rest, hasAdventure: true, text: `target ${phrase.trim().replace(/^target /i, "")}` } : null;
  }
  // Magewright's Stone: "creature that has an activated ability with {T} in its cost", printed or granted (rulings).
  const tapAb = / that has an activated ability with \{T\} in its cost$/.exec(phrase.trim());
  if (tapAb) {
    const rest = parseTargetPhrase(phrase.trim().slice(0, tapAb.index), opts);
    return rest?.kind === "object" ? { ...rest, tapAbility: true, text: `target ${phrase.trim().toLowerCase()}` } : null;
  }
  // "A creature you control that's enchanted or equipped" (Reyav, Master Smith): "enchanted-or-equipped creature you control".
  let p = subtypeClause(phrase.trim()).toLowerCase().replace(/^(creature)( you control)? that's (enchanted or equipped|enchanted|equipped)$/, (_, k: string, w: string | undefined, st: string) => `${st.replace(/ /g, "-")} ${k}${w ?? ""}`);
  const text = `target ${phrase.trim().toLowerCase()}`;
  const extra: Partial<TargetSpec> = {};
  // Drown in the Loch: each candidate's own controller's graveyard.
  const loch = / with mana value less than or equal to the number of cards in its controller's graveyard$/i.exec(p);
  if (loch) {
    extra.mvAtMostControllersGraveyard = true;
    p = p.slice(0, loch.index);
    phrase = phrase.trim().slice(0, loch.index);
  }
  // Corrosion: "each artifact with mana value less than or equal to the number of rust counters on it": each one's own.
  const ownCounters = /^(.+) with mana value less than or equal to the number of ([a-z]+) counters on it$/i.exec(p);
  if (ownCounters && !opts.target) {
    extra.mvAtMostCounters = counterKind(ownCounters[2]!);
    p = ownCounters[1]!;
    phrase = phrase.trim().slice(0, ownCounters[1]!.length);
  }
  // "Card with mana value less than or equal to ~'s power from your graveyard", "creature with power less than or equal to the
  // number of Islands you control": the amount as written, read first since it may hold words of its own (TargetSpec.bound).
  // Wishing Well: "with mana value equal to the number of coin counters on ~".
  // Pollywog Prodigy: "with mana value less than ~'s power", strictly less: one less at most (CR 107.1).
  // A strict comparison the count doesn't read ("greater than its base power", Kutzil) is left to the readings below.
  // Talion, the Kindly Lord: "a spell with mana value, power, or toughness equal to the chosen number", Sanctum Prelate:
  // "with mana value equal to the chosen number" (Chosen.number, TargetSpec.equalsChosen).
  const chosenNumber = / with (mana value, power, or toughness|mana value|power or toughness) equal to the chosen number$/i.exec(phrase.trim());
  if (chosenNumber) {
    extra.chosen = "number";
    extra.equalsChosen = chosenNumber[1]!.toLowerCase() === "mana value" ? ["manaValue"] : chosenNumber[1]!.toLowerCase() === "power or toughness" ? ["power", "toughness"] : ["manaValue", "power", "toughness"];
    p = p.slice(0, chosenNumber.index);
    phrase = phrase.trim().slice(0, chosenNumber.index);
  }
  // Expel the Interlopers: "creatures with power greater than or equal to the chosen number" (Chosen.number).
  const atLeastChosen = / with power greater than or equal to the chosen number$/i.exec(phrase.trim());
  if (atLeastChosen && !extra.chosen) {
    extra.chosen = "powerAtLeast";
    p = p.slice(0, atLeastChosen.index);
    phrase = phrase.trim().slice(0, atLeastChosen.index);
  }
  // Master Symmetrist: "with power equal to its toughness" is its own comparison (TargetSpec.ptEqual, below), not an amount.
  const bound0 = / with power equal to its toughness$/i.test(phrase.trim()) ? null : / with (power|toughness|mana value) (?:(less|greater) than( or equal to)?|equal to) (.+)$/i.exec(phrase.trim());
  const from0 = bound0 && / from (?:your|a|an opponent's) graveyard$/i.exec(bound0[4]!);
  const amount0 = bound0 ? opts.count?.(from0 ? bound0[4]!.slice(0, from0.index) : bound0[4]!) : null;
  const bound = bound0 && (amount0 || !bound0[2] || bound0[3]) ? bound0 : null;
  if (bound) {
    const from = from0;
    if (!amount0) return null;
    const strict = !!bound[2] && !bound[3];
    const amount = strict ? { ...amount0, plus: (amount0.plus ?? 0) + (bound[2]!.toLowerCase() === "less" ? -1 : 1) } : amount0;
    extra.bound = { key: bound[1]!.toLowerCase() === "mana value" ? "manaValue" : (bound[1]!.toLowerCase() as "power" | "toughness"), at: !bound[2] ? "exact" : bound[2].toLowerCase() === "less" ? "most" : "least", amount };
    p = `${phrase.trim().slice(0, bound.index)}${from ? from[0] : ""}`.toLowerCase();
  }
  p = p.replace(/\btime lords?\b/g, "time-lord");
  // "Nonland permanent an opponent controls that isn't exactly two colors", "a spell that's exactly two colors" (Invasion
  // of Ravnica, Guildpact Paragon): how many colors it has (CR 105.2).
  const two = / that(?:'s| is| (isn't|is not)) exactly two colors\b/.exec(p);
  if (two) {
    extra.colorCount = two[1] ? "notTwo" : "two";
    p = p.slice(0, two.index) + p.slice(two.index + two[0].length);
  }
  // The Mimics: "a spell that's both blue and red": it has each of those colors, maybe more (CR 105.2).
  const both = / that's both (white|blue|black|red|green) and (white|blue|black|red|green)\b/.exec(p);
  if (both && both[1] !== both[2]) {
    extra.bothColors = [COLOR_WORDS[both[1]!]!, COLOR_WORDS[both[2]!]!];
    p = p.slice(0, both.index) + p.slice(both.index + both[0].length);
  }
  // Iridian Maelstrom: "each creature that isn't all colors": fewer than all five (CR 105.2).
  const notAll = !two && / that isn't all colors\b/.exec(p);
  if (notAll) {
    extra.colorCount = "notAll";
    p = p.slice(0, notAll.index) + p.slice(notAll.index + notAll[0].length);
  }
  // "Spell that wasn't cast from its owner's hand" (Wash Away): a copy was never cast (rulings).
  const notFromHand = / that wasn't cast from its owner's hand$/.exec(p);
  if (notFromHand) {
    extra.notCastFromHand = true;
    p = p.slice(0, notFromHand.index);
  }
  // Errant, Street Artist: "target spell you control that wasn't cast": a copy (CR 707.10).
  const uncast = / that wasn't cast$/.exec(p);
  if (uncast) {
    extra.notCast = true;
    p = p.slice(0, uncast.index);
  }
  const fromYard = / cast from a graveyard$/.exec(p);
  if (fromYard) {
    extra.castFromGraveyard = true;
    p = p.slice(0, fromYard.index);
  }
  // "Historic spells", "a historic permanent": artifacts, legendaries and Sagas (CR 700.6), any of them (TargetSpec.anyOf).
  if (/(?:^|\s)historic\s/.test(p)) {
    if (extra.anyOf || / or |, /.test(p)) return null;
    extra.anyOf = HISTORIC;
    p = p.replace(/(^|\s)historic\s/, "$1");
  }
  // Icy Reception: "target creature or legendary spell": a spell that's either, by its printed card (TargetSpec.anyOf).
  if (/^creature or legendary spells?$/.test(p) && !extra.anyOf) {
    extra.anyOf = CREATURE_OR_LEGENDARY;
    p = p.replace(/^creature or legendary /, "");
  }
  // "Permanents they control that are one or more colors" (All Is Dust): colored ones (CR 105.2c).
  const colored = / that(?:'s| is| are) one or more colors\b/.exec(p);
  if (colored && !extra.colorCount) {
    extra.colorCount = "colored";
    p = p.slice(0, colored.index) + p.slice(colored.index + colored[0].length);
  }
  // "Target card in a graveyard other than a basic land card" (Surgical Extraction): every card but the basic lands, the
  // only cards with the basic supertype (CR 205.4c). Only for a card in a graveyard.
  const otherThanBasic = / other than a basic land card\b/.test(p);
  if (otherThanBasic) p = p.replace(/ other than a basic land card\b/, "");
  // "Target legendary permanent card not named ~ from a graveyard" (Staff of Eden): any other name; compile fills in
  // this card's name. Only for a card target.
  if (opts.target && /^[a-z ]+ card not named ~ from /.test(p)) {
    extra.notNamed = "~";
    p = p.replace(/ not named ~(?= from )/, "");
  }
  // Dutiful Replicator: "target token you control not named ~": a permanent with any other name. Clever Conjurer:
  // "target permanent not named ~" (CR 201.5: its own name, so another one with that name can't be untapped either).
  if (opts.target && /^(?:[a-z ]*token you control|permanent) not named ~$/.test(p)) {
    extra.notNamed = "~";
    p = p.replace(/ not named ~$/, "");
  }
  // "of the chosen type", "that aren't of the chosen type", "of that color": only where the caller fills in the choice.
  const chosen = /,? (that (?:aren't|are not|isn't|is not) |not )?of (?:(?:the chosen|that) (creature type|type|color)|(a type chosen this way))/.exec(p);
  if (chosen) {
    if (!opts.chosen) return null;
    extra.chosen = chosen[3] ? (chosen[1] ? "notTypesChosen" : "typesChosen") : chosen[2] === "color" ? (chosen[1] ? "notColor" : "color") : chosen[1] ? "notType" : "type";
    p = (p.slice(0, chosen.index) + p.slice(chosen.index + chosen[0].length)).trim();
  }
  // "With mana value of the chosen quality" after "choose odd or even" (Extinction Event), "with power of that quality"
  // (Zimone's Hypothesis): zero is even.
  // Ashling's Prerogative: "without mana value of the chosen quality", the other one.
  const parityOf = / with(out)? (mana value|power) of (?:the chosen|that) quality\b/.exec(p);
  if (parityOf) {
    if (!opts.chosen || extra.chosen) return null;
    extra.chosen = "parity";
    extra.parity = { of: parityOf[2] === "power" ? "power" : "manaValue", ...(parityOf[1] ? { not: true as const } : {}) };
    p = (p.slice(0, parityOf.index) + p.slice(parityOf.index + parityOf[0].length)).trim();
  }
  // "Spell with the chosen name" (Declaration of Naught), "cards with that name" after "choose a card name" (CR 201.4).
  const withName = / with (?:the chosen|that) name\b/.exec(p);
  if (withName) {
    if (!opts.chosen) return null;
    extra.chosen = "name";
    p = (p.slice(0, withName.index) + p.slice(withName.index + withName[0].length)).trim();
  }
  // "Target creature it's blocking" (Tinder Wall): one blocked by the source.
  const blocked = / (?:it's|~ is) blocking$/.exec(p);
  if (blocked) {
    extra.blockedBySource = true;
    p = p.slice(0, blocked.index);
  }
  // "Target creature blocking ~" (Master of Arms), "... blocking or blocked by ~" (Cromat), "it" being ~. Only a target:
  // it's checked as targets are (lesserPowerOk), not in a group.
  const blocking = opts.target ? / blocking( or blocked by)? (?:it|~)$/.exec(p) : null;
  if (blocking) {
    extra.blockingSource = blocking[1] ? "either" : "blocking";
    p = p.slice(0, blocking.index);
  }
  // Witchbane Orb: "all Curses attached to you".
  const toYou = / attached to you$/.exec(p);
  if (toYou && !opts.target) {
    extra.attachedToYou = true;
    p = p.slice(0, toYou.index);
  }
  // Premature Burial: "target nonblack creature that entered since your last turn ended".
  const since = / that entered since your last turn ended$/.exec(p);
  if (since) {
    extra.enteredSinceYourLastTurn = true;
    p = p.slice(0, since.index);
  }
  // Shaile, Dean of Radiance: "each creature that entered the battlefield under your control this turn": under yours as it
  // entered, whoever controls it now.
  const enteredYours = / that entered the battlefield under your control this turn$/.exec(p);
  if (enteredYours) {
    extra.enteredThisTurn = true;
    extra.enteredUnderYou = true;
    p = p.slice(0, enteredYours.index);
  }
  // "Each green creature that entered this turn" (Oran-Rief, the Vastwood).
  const entered = / that entered (?:the battlefield )?this turn$/.exec(p);
  if (entered) {
    extra.enteredThisTurn = true;
    p = p.slice(0, entered.index);
  }
  // The Fifth Doctor: "each creature you control that didn't attack or enter this turn": neither.
  const neither = / that didn't attack or enter this turn$/.exec(p);
  if (neither) {
    extra.notEnteredThisTurn = true;
    extra.combat = "didntAttackThisTurn";
    p = p.slice(0, neither.index);
  }
  // Let the Galaxy Burn: "each creature that didn't enter this turn".
  const notEntered = / that didn't enter (?:the battlefield )?this turn$/.exec(p);
  if (notEntered) {
    extra.notEnteredThisTurn = true;
    p = p.slice(0, notEntered.index);
  }
  // The Gitrog, Ravenous Ride: "a creature that saddled it this turn" (CR 702.171c), "it" the source; only in a choice
  // made as the source's ability resolves (see pickOptions).
  const saddled = / that saddled (?:it|~) this turn$/.exec(p);
  if (saddled) {
    extra.saddledSource = true;
    p = p.slice(0, saddled.index);
  }
  // Getaway Car: "target creature that crewed it this turn" (CR 702.122d), the same for crewing.
  const crewed = / that crewed (?:it|~) this turn$/.exec(p);
  if (crewed) {
    extra.crewedSource = true;
    p = p.slice(0, crewed.index);
  }
  // Witch-king of Angmar: "a creature of their choice that dealt combat damage to you this turn".
  const dealtYou = / that dealt combat damage to you this turn$/.exec(p);
  if (dealtYou) {
    extra.dealtCombatDamageToYou = true;
    p = p.slice(0, dealtYou.index);
  }
  // Spear of Heliod: "target creature that dealt damage to you this turn".
  const dealtYouAny = / that dealt damage to you this turn$/.exec(p);
  if (dealtYouAny) {
    extra.dealtDamageToYou = true;
    p = p.slice(0, dealtYouAny.index);
  }
  // Halls of Mist: "Creatures that attacked during their controller's last turn", whoever controls each now.
  const attackedLast = / that attacked during their controller's last turn$/.exec(p);
  if (attackedLast) {
    extra.combat = "attackedLastTurn";
    p = p.slice(0, attackedLast.index);
  }
  // "Untap all creatures that attacked this turn" (Relentless Assault), "creatures you control that attacked this turn".
  const attacked = / that attacked this turn$/.exec(p);
  if (attacked) {
    extra.combat = "attackedThisTurn";
    p = p.slice(0, attacked.index);
  }
  // Boxing Ring: "a creature that fought this turn" (CR 701.14).
  const fought = / that fought this turn$/.exec(p);
  if (fought) {
    extra.foughtThisTurn = true;
    p = p.slice(0, fought.index);
  }
  // Sizzling Barrage: "target creature that blocked this turn".
  const blockedTurn = / that blocked this turn$/.exec(p);
  if (blockedTurn && !extra.combat) {
    extra.combat = "blockedThisTurn";
    p = p.slice(0, blockedTurn.index);
  }
  // Kratos, God of War: "creatures that player controls that didn't attack this turn": not declared as attackers this
  // turn (CR 508.1a); one put onto the battlefield attacking never attacked (CR 508.4).
  const didnt = !/, except for creatures that couldn't attack$/.test(p) && / that didn't attack this turn$/.exec(p);
  if (didnt) {
    extra.combat = "didntAttackThisTurn";
    p = p.slice(0, didnt.index);
  }
  // "Destroy all untapped creatures that didn't attack this turn, except for creatures that couldn't attack" (Season of
  // the Witch): the ones that could have been declared as attackers but weren't (rulings).
  const couldnt = / that didn't attack this turn, except for creatures that couldn't attack$/.exec(p);
  if (couldnt) {
    extra.combat = "couldButDidntAttack";
    p = p.slice(0, couldnt.index);
  }
  // "Destroy all creatures that aren't enchanted" (Winds of Rath), "target creature that isn't enchanted" (Brainspoil).
  const bare = / that (?:isn't|aren't|is not|are not) enchanted$/.exec(p);
  if (bare) {
    extra.status = "unenchanted";
    p = p.slice(0, bare.index);
  }
  // "Target Aura attached to a creature" (Crown of the Ages), "Aura or Equipment attached to a creature you control" (Halvar).
  // "Each Aura you control that's attached to a creature" (Sage's Reverie).
  // Savaen Elves: "target Aura attached to a land".
  const attached = / (?:that's |that are )?attached to an? (creature|permanent|land)( you control)?$/.exec(p);
  if (attached) {
    extra.attachedTo = { kind: "object", ...(attached[1] === "creature" ? { types: ["Creature"] } : attached[1] === "land" ? { types: ["Land"] } : {}), ...(attached[2] ? { controller: "you" as const } : {}), text: attached[0].trim().replace(/^attached to /, "") };
    p = p.slice(0, attached.index);
  }
  // "creature an opponent controls that was dealt damage this turn"; Giant Shark: "a creature that has been dealt damage this
  // turn", the same.
  // Executioner's Swing: "target creature that dealt damage this turn": a source of damage this turn, as this object.
  const hurter = / that dealt damage this turn$/.exec(p);
  if (hurter) {
    extra.dealtDamageAsSourceThisTurn = true;
    p = p.slice(0, hurter.index);
  }
  // Inflame: "each creature dealt damage this turn", the same.
  const hurt = hurter ? null : / (?:that (?:was|were|has been) )?dealt damage this turn$/.exec(p);
  if (hurt) {
    extra.dealtDamageThisTurn = true;
    p = p.slice(0, hurt.index);
  }
  // "creature with a +1/+1 counter on it", "creature with a bounty counter on it" (Shay Cormac), "creature you control with a level counter on it" (Time of Heroes), "a land with a trap counter on it" (Trap Digger), "creatures with ice counters on them", "creature you control with a counter on
  // it", "permanents you control with counters on them" (any kind)
  // "Target creature that has a -1/-1 counter on it" (Banewhip Punisher): the same as "with".
  p = p.replace(/ that has (an? (?:[+-]1\/[+-]1|fate) counter on it)$/, " with $1");
  // Tetzimoc, Primal Death: "each creature your opponents control with a prey counter on it".
  const counter = / with (?:an? ([+-]1\/[+-]1|ice|slime|flood|coin|bounty|divinity|stun|bribery|oil|fate|level|trap|prey|rejection|doom) counter on it|([+-]1\/[+-]1|ice|slime|flood|coin|bounty|divinity|stun|bribery|oil|level|doom) counters on (?:them|it)|a counter on (?:it|them)|(?:one or more )?counters on (?:it|them))/.exec(p);
  if (counter) {
    extra.counter = counter[1] ?? counter[2] ?? ANY_COUNTER;
    p = (p.slice(0, counter.index) + p.slice(counter.index + counter[0].length)).trim();
  }
  // "Creatures you control with three or more +1/+1 counters on them" (Runadi, Behemoth Caller).
  const counters = !counter && / with (two|three|four|five) or more ([+-]1\/[+-]1|[a-z]+) counters on (?:it|them)/.exec(p);
  if (counters) {
    extra.counter = counterKind(counters[2]!);
    extra.counterMin = ["two", "three", "four", "five"].indexOf(counters[1]!) + 2;
    p = (p.slice(0, counters.index) + p.slice(counters.index + counters[0].length)).trim();
  }
  // "Each creature you control with a mana ability" (Raggadragga): an activated or triggered one (CR 605.1).
  const manaAb = / with a mana ability$/.exec(p);
  if (manaAb) {
    extra.manaAbility = true;
    p = p.slice(0, manaAb.index);
  }
  // Midnight Arsonist: "target artifacts without mana abilities": neither an activated nor a triggered one (CR 605.1,
  // rulings).
  const noManaAb = / without mana abilities$/.exec(p);
  if (noManaAb && !manaAb) {
    extra.noManaAbility = true;
    p = p.slice(0, noManaAb.index);
  }
  // Oblivion Stone: "each nonland permanent without a fate counter on it": any kind of counter.
  // Coiling Stalker: "target creature you control that doesn't have a +1/+1 counter on it": the same.
  // Hindervines: "creatures with no +1/+1 counters on them": the same.
  const without = / (?:(?:without|that doesn't have) an?|with no) ([+-]1\/[+-]1|[a-z]+) counters? on (?:it|them)/.exec(p);
  if (without) {
    extra.notCounter = counterKind(without[1]!);
    p = (p.slice(0, without.index) + p.slice(without.index + without[0].length)).trim();
  }
  // Kassandra, Eagle Bearer: "a creature you control with a legendary Equipment attached to it" (CR 301.5a).
  const legendaryEquipped = / with a legendary equipment attached to it$/i.exec(p);
  if (legendaryEquipped) {
    if (extra.status) return null;
    extra.status = "legendaryEquipped";
    p = p.slice(0, legendaryEquipped.index);
  }
  // Due Diligence: "target creature you control other than enchanted creature": not the one the source is attached to.
  const notHost = / other than enchanted creature$/.exec(p);
  if (notHost) {
    extra.notSourceHost = true;
    p = p.slice(0, notHost.index);
  }
  const none = / with no counters on (?:it|them)/.exec(p);
  if (none) {
    extra.noCounters = true;
    p = (p.slice(0, none.index) + p.slice(none.index + none[0].length)).trim();
  }
  // "creature card from your graveyard", "card from a graveyard": a card in that zone (CR 109.2a).
  let inGraveyard = false;
  let owner: TargetSpec["owner"];
  // "Target creature card exiled with ~" (The Darkness Crystal): a card in exile linked to the source (CR 607.2a).
  let linkedExile = false;
  // "Target creature card in your graveyard with mana value X" (Likeness Looter): the same as "with mana value X in your graveyard".
  const inWith = / in (your|a|an opponent's) graveyard( with mana value (?:\d+|x)(?: or (?:greater|less))?)$/i.exec(p);
  if (inWith) p = `${p.slice(0, inWith.index)}${inWith[2]} in ${inWith[1]} graveyard`;
  // "Target creature card from a graveyard that was put there this turn" (Abyssal Harvester), "... from anywhere this turn".
  const putThere = / (?:from|in) (?:your|a|an opponent's) graveyard( that was put there (?:from anywhere )?this turn| that was put there from their library this turn| that was milled this turn| that (?:was|were) put there from the battlefield this turn| that wasn't put there this combat)$/.exec(p);
  if (putThere) {
    if (/this combat/.test(putThere[1]!)) extra.notPutThereThisCombat = true;
    else if (/from their library/.test(putThere[1]!)) extra.fromLibraryThisTurn = true;
    else if (/from the battlefield/.test(putThere[1]!)) extra.fromBattlefieldThisTurn = true;
    else if (/milled/.test(putThere[1]!)) extra.milledThisTurn = true;
    else extra.putThereThisTurn = true;
    p = p.slice(0, putThere.index + putThere[0].length - putThere[1]!.length);
  }
  const gy = / (?:from|in) (your|a|an opponent's) graveyard$/.exec(p) ?? / exiled with (?:~|it)$/.exec(p);
  if (gy) {
    p = p.slice(0, gy.index);
    linkedExile = !gy[1];
    owner = gy[1] === "your" ? "you" : gy[1] === "a" || !gy[1] ? undefined : "opponent";
    // Thor, God of Thunder: "target Equipment, instant, or sorcery card from your graveyard": a card of any one of them.
    const listed = phrase.trim().replace(/^target /i, "").replace(/ (?:from|in) (?:your|a|an opponent's) graveyard$/, "");
    // Kirri, Talented Sprout: "target Plant, Treefolk, or land card from your graveyard" too.
    const list = /^([A-Z][a-z]+), ([A-Za-z]+), or ([a-z]+) card$/.exec(listed);
    if (list && (opts.target || /^target /i.test(phrase.trim())) && !Object.keys(extra).length) {
      const anyOf = [list[1], list[2], list[3]].map((w) => parseTargetPhrase(`${w} card from your graveyard`));
      if (anyOf.some((f) => f?.kind !== "card")) return null;
      return { kind: "card", anyOf: anyOf.map((f) => ({ ...f!, owner: undefined })), ...(owner ? { owner } : {}), text };
    }
    // Rekindling Phoenix's Elemental: "return target card named Rekindling Phoenix from your graveyard": that name (CR
    // 201.2), another card's (compile keeps a quoted ability's own card name as written).
    const namedCard = /^card named ([A-Z][\w'-]*(?:,? (?:[A-Z][\w'-]*|of|the|a))*)$/.exec(listed);
    if (namedCard && !linkedExile && !Object.keys(extra).length) return { kind: "card", types: [], notTypes: [], notColors: [], named: namedCard[1]!, ...(owner ? { owner } : {}), text };
    // "Dragon creature card or Ugin planeswalker card" (Haven of the Spirit Dragon): either.
    if (/^[^,]+ card or [^,]+ card$/.test(p)) p = p.replace(/ card or /, " or ");
    // The word "card" comes before any "with ..." qualifier: "creature card with mana value 3 or less".
    const card = /(^| )card(?= with |$)/.exec(p);
    if (!card) return null;
    p = (p.slice(0, card.index) + p.slice(card.index + card[0].length)).trim();
    inGraveyard = true;
  }
  // "... with flying", "... without flying", "... with power 4 or greater", "... with mana value 3 or less"
  let m: RegExpExecArray | null;
  // "Creatures you control each with power greater than its base power" (Kutzil).
  if ((m = / (?:each )?with power greater than its? base power$/.exec(p))) {
    extra.powerAboveBase = true;
    p = p.slice(0, m.index);
  }
  // "Creature you control with base power or toughness 1" (Sword of the Squeak).
  if ((m = / with base power or toughness (\d+)$/.exec(p))) {
    extra.basePtEither = Number(m[1]);
    p = p.slice(0, m.index);
  }
  // "Other creatures you control with base power and toughness 1/1" (Bess, Soul Nourisher).
  if ((m = / with base power and toughness (\d+)\/(\d+)$/.exec(p))) {
    extra.basePT = [Number(m[1]), Number(m[2])];
    p = p.slice(0, m.index);
  }
  // "Another creature you control with base power 1" (Rapid Augmenter).
  if ((m = / with base power (\d+)$/.exec(p))) {
    extra.basePower = Number(m[1]);
    p = p.slice(0, m.index);
  }
  if ((m = / with power equal to its toughness$/.exec(p))) {
    extra.ptEqual = true;
    p = p.slice(0, m.index);
  }
  if ((m = / whose power and toughness aren't equal$/.exec(p))) {
    extra.ptUnequal = true;
    p = p.slice(0, m.index);
  }
  if ((m = / (?:with toughness greater than (?:its|their) power|that each have toughness greater than their power)$/.exec(p))) {
    extra.toughnessAbovePower = true;
    p = p.slice(0, m.index);
  }
  // Cut Down: "creature with total power and toughness 5 or less": the two added up (rulings).
  if ((m = / with total power and toughness (\d+) or (greater|less)$/.exec(p))) {
    extra.totalPT = m[2] === "greater" ? { min: Number(m[1]) } : { max: Number(m[1]) };
    p = p.slice(0, m.index);
  }
  // "Creatures you control with power or toughness 1 or less" (Tetsuko Umezawa): either one (TargetSpec.anyOf).
  if ((m = / with power or toughness (\d+) or (greater|less)$/.exec(p)) && !extra.anyOf) {
    const r = m[2] === "greater" ? { min: Number(m[1]) } : { max: Number(m[1]) };
    extra.anyOf = (["power", "toughness"] as const).map((key) => ({ kind: "object" as const, types: [], notTypes: [], notColors: [], [key]: r, text: `${key} ${m![1]} or ${m![2]}` }));
    p = p.slice(0, m.index);
  } else if ((m = / with (power|toughness) less than (\d+)$/.exec(p))) {
    // Wasp, Shrinking Savior: "each creature with power less than 0": strictly less, so one less at most (CR 107.1; power
    // can be negative, CR 107.1b).
    extra[m[1] as "power" | "toughness"] = { max: Number(m[2]) - 1 };
    p = p.slice(0, m.index);
  } else if ((m = /(?:^| )with (power|toughness|mana value) (\d+|x)(?: or (greater|less))?$/.exec(p))) {
    const key = m[1] === "mana value" ? "manaValue" : (m[1] as "power" | "toughness");
    // "With mana value 2" (Spell Snare): exactly that. With X, the X it's cast or activated with (TargetSpec.xRange).
    // "Destroy all creatures with mana value X or less", "search your library for a creature card with mana value X or
    // less": compared as it resolves (TargetSpec.bound), where the amount reader takes X.
    // "Destroy each nonland permanent with mana value X" (Steel Hellkite): exactly X, the same way.
    const xBound = m[2] === "x" && !opts.x ? opts.count?.("X") : undefined;
    if (xBound) extra.bound = { key, at: m[3] === "greater" ? "least" : m[3] === "less" ? "most" : "exact", amount: xBound };
    else if (m[2] === "x" && !opts.x) return null;
    else if (m[2] === "x") extra.xRange = { key, at: m[3] === "greater" ? "least" : m[3] === "less" ? "most" : "exact" };
    else {
      const n = Number(m[2]);
      extra[key] = m[3] === "greater" ? { min: n } : m[3] === "less" ? { max: n } : { min: n, max: n };
    }
    p = p.slice(0, m.index);
  } else if ((m = / with mana value (\d+), (\d+), or (\d+)$/.exec(p) ?? / with mana value (\d+) through (\d+)$/.exec(p)) && (m[3] === undefined || (Number(m[2]) === Number(m[1]) + 1 && Number(m[3]) === Number(m[2]) + 1))) {
    // "A creature spell with mana value 4, 5, or 6" (Kozilek's Unsealing): one in that range ("4 through 6" once a cast
    // trigger's commas are taken out).
    extra.manaValue = { min: Number(m[1]), max: Number(m[3] ?? m[2]) };
    p = p.slice(0, m.index);
  } else if ((m = / with mana cost ((?:\{[0-9WUBRGC]+\})+)(?: or ((?:\{[0-9WUBRGC]+\})+))?$/.exec(p))) {
    extra.manaCostIn = [m[1]!, ...(m[2] ? [m[2]] : [])];
    p = p.slice(0, m.index);
  } else if ((m = / with \{x\} in its mana cost$/.exec(p))) {
    extra.xInCost = true;
    p = p.slice(0, m.index);
  } else if ((m = / with an? (even|odd) mana value$/.exec(p))) {
    // "Permanent ... with an even mana value" (Desecrate Reality; zero is even).
    extra.manaValue = { parity: m[1] as "even" | "odd" };
    p = p.slice(0, m.index);
  } else if (inGraveyard && (m = /(?:^| )with (cycling(?: abilities)?|awaken|foretell|mutate|flashback|madness|disturb|a cycling ability)$/.exec(p))) {
    // Sacred Excavation: "cards with cycling from your graveyard": a card's printed keyword abilities, typecycling being
    // cycling too (CR 702.29e; the card data lists "Cycling" with it). Spellpyre Phoenix: "with a cycling ability", Herald
    // of the Forgotten: "with cycling abilities", the same.
    if (/cycling/.test(m[1]!)) m[1] = "cycling";
    extra.keywords = [capital(m[1]!)];
    p = p.slice(0, m.index);
  } else if ((m = / with (modular|flanking|fading|level up)( you control)?$/.exec(p))) {
    // Arcbound Overseer: "each creature you control with modular": modular as the card data lists it (CR 702.43a), on
    // the battlefield's characteristics (lost with all abilities, layer 6). Telim'Tor: "attacking creatures with
    // flanking" (CR 702.25a), granted flanking too. Parallax Inhibitor: "each permanent with fading you control" (CR 702.32a).
    // Venerated Teacher: "each creature you control with level up" (CR 702.87a; the card data says "Level Up").
    extra.keywords = [capital(m[1]!)];
    p = p.slice(0, m.index) + (m[2] ?? "");
  } else if ((m = / with toxic( you control| you don't control| an opponent controls)?$/.exec(p))) {
    extra.toxic = true;
    p = p.slice(0, m.index) + (m[1] ?? "");
  } else if ((m = /(?:^| )with a kicker ability$/.exec(p)) && !extra.anyOf) {
    // Murasa Sproutling: "card with a kicker ability": kicker or multikicker, a variant of it (CR 702.33c), as printed.
    extra.anyOf = ["Kicker", "Multikicker"].map((k) => ({ kind: "object" as const, keywords: [k], text: k.toLowerCase() }));
    p = p.slice(0, m.index);
  } else if ((m = /(?:^| )(with|without) ([a-z ]+?|[a-z ]+(?:, [a-z ]+)+, and\/or [a-z ]+|[a-z ]+(?:, [a-z ]+)+, or [a-z ]+)( you control| you don't control| an opponent controls)?$/.exec(p))) {
    // "Creature you control with flash or haste" (Shadow the Hedgehog): one of them is enough. "With flying, deathtouch,
    // and/or lifelink" (Henrika, Infernal Seer): any of them.
    const listed = m[1] === "with" ? /^((?:[a-z ]+, )+)(?:and\/)?or ([a-z ]+)$/.exec(m[2]!) : null;
    const either = m[1] === "with" ? /^([a-z]+) or ([a-z]+)$/.exec(m[2]!) : null;
    // "Creatures without flying or islandwalk" (Stormtide Leviathan): with neither. Path of Mettle: "without first strike,
    // double strike, vigilance, or haste": with none of them.
    const neitherList = m[1] === "without" ? /^((?:[a-z ]+, )+)or ([a-z ]+)$/.exec(m[2]!) : null;
    const neither = m[1] === "without" && !neitherList ? /^([a-z]+) or ([a-z]+)$/.exec(m[2]!) : null;
    const noneOf = neitherList ? [...neitherList[1]!.split(", ").filter(Boolean), neitherList[2]!] : neither ? [neither[1]!, neither[2]!] : undefined;
    const anyNames = listed ? [...listed[1]!.split(", ").filter(Boolean), listed[2]!] : either ? [either[1]!, either[2]!] : undefined;
    const kws = anyNames ? anyNames.map((k) => keywordOf(k)) : noneOf ? noneOf.map((k) => keywordOf(k)) : parseKeywordList(m[2]!);
    if (!kws || kws.some((k) => !k) || kws.length !== (anyNames ? anyNames.length : noneOf ? noneOf.length : 1)) return null;
    if (anyNames) extra.anyOf = kws.map((k) => ({ kind: "object" as const, keywords: [k!], text: k!.toLowerCase() }));
    else if (m[1] === "with") extra.keywords = kws as string[];
    else extra.notKeywords = kws as string[];
    // "Creature without flying you don't control" (Street Spasm): whose it is, read below.
    p = p.slice(0, m.index) + (m[3] ?? "");
  }
  // "Target 1/1 creature" (Pendelhaven, The Seedcore): power and toughness exactly those.
  if ((m = /^(\d+)\/(\d+) (?=creature\b)/.exec(p)) && !extra.power && !extra.toughness) {
    extra.power = { min: Number(m[1]), max: Number(m[1]) };
    extra.toughness = { min: Number(m[2]), max: Number(m[2]) };
    p = p.slice(m[0].length);
  }
  let controller: TargetSpec["controller"];
  // "Target creature you own" (Sword of Hearth and Home): a permanent you own, whoever controls it (CR 108.3).
  if (!inGraveyard && / you own$/.test(p)) {
    owner = "you";
    p = p.replace(/ you own$/, "");
  }
  // "Permanents you don't own" (Agent of Treachery): another player's, whoever controls it (CR 108.3).
  // "A nonland permanent an opponent owns" (Brainstealer Dragon): every other player is an opponent (CR 102.2).
  if (!inGraveyard && / (?:you don't|an opponent) owns?$/.test(p)) {
    owner = "opponent";
    p = p.replace(/ (?:you don't|an opponent) owns?$/, "");
  }
  // "Each other creature that's attacking one of your opponents" (Martial Impetus): attacking that player, not a
  // planeswalker or battle (CR 506.3), as for Oviya's static.
  if (!inGraveyard && !extra.combat && /^creature (?:that's )?attacking one of your opponents$/.test(p)) {
    extra.combat = "attackingOpponent";
    p = "creature";
  }
  // Roar of Resistance: "creatures attacking your opponents and/or planeswalkers they control".
  if (!inGraveyard && !extra.combat && /^creature (?:that's )?attacking your opponents and\/or planeswalkers they control$/.test(p)) {
    extra.combat = "attackingOpponentOrTheirPlaneswalker";
    p = "creature";
  }
  if (!inGraveyard && !extra.combat && /^creature (?:that's )?attacking you or a planeswalker you control$/.test(p)) {
    extra.combat = "attackingYouOrYourPlaneswalker";
    p = "creature";
  }
  // Crowd of True Believers: "target creature you control that's attacking alone": the only attacking creature (CR 506.5).
  if (!inGraveyard && !extra.combat && /^creature( you control)? that's attacking alone$/.test(p)) {
    extra.combat = "attackingAlone";
    p = p.replace(/ that's attacking alone$/, "");
  }
  // "Target creature attacking you" (Lulu, Stern Guardian): attacking you, not your planeswalkers (CR 506.3, 508.1b).
  // Giant Trap Door Spider: "target creature without flying that's attacking you".
  if (!inGraveyard && !extra.combat && /^creature (?:without flying )?(?:that's )?attacking you$/.test(p)) {
    extra.combat = "attackingYou";
    if (/without flying/.test(p)) extra.notKeywords = [...(extra.notKeywords ?? []), "Flying"];
    p = "creature";
  }
  if (/ (an opponent controls|you don't control)$/.test(p)) {
    controller = "opponent";
    p = p.replace(/ (an opponent controls|you don't control)$/, "");
  } else if (/ you control$/.test(p)) {
    controller = "you";
    p = p.replace(/ you control$/, "");
  }
  if (inGraveyard && (controller || / (?:you|an opponent) controls?$/.test(p))) return null;
  if (p === "player" || p === "opponent") return Object.keys(extra).length || inGraveyard ? null : { kind: "player", opponent: p === "opponent", text };
  // "Other transformed permanents you control" (Gargantuan Slabhorn, CR 701.27g).
  if ((m = /^transformed (?=permanent|creature)/.exec(p))) {
    extra.transformed = true;
    p = p.slice(m[0].length);
  }
  // "A face-down creature you control" (Ugin's Mastery, CR 708.2).
  if ((m = /^face-down (?=permanent|creature)/.exec(p))) {
    extra.faceDown = true;
    p = p.slice(m[0].length);
  }
  let tapped: boolean | undefined;
  if ((m = /^(un)?tapped /.exec(p))) {
    tapped = !m[1];
    p = p.slice(m[0].length);
  }
  // "A goaded attacking or blocking creature" (Baeloth Barrityl): the same as "an attacking or blocking goaded creature".
  if ((m = /^goaded (attacking or blocking|attacking|blocking) /.exec(p))) p = `${m[1]} goaded ${p.slice(m[0].length)}`;
  if (p.startsWith("attacking or blocking ")) {
    extra.combat = "attackingOrBlocking";
    p = p.slice("attacking or blocking ".length);
  } else if ((m = /^(unblocked) attacking /.exec(p) ?? /^(attacking|blocking|blocked|unblocked) /.exec(p))) {
    // "Unblocked attacking Ninjas you control" (Throatseeker): an unblocked creature is an attacking one (CR 509.1h).
    extra.combat = m[1] as "attacking" | "blocking" | "blocked" | "unblocked";
    p = p.slice(m[0].length);
  } else if ((m = /^nonattacking,? nonblocking /.exec(p))) {
    extra.combat = "notInCombat";
    p = p.slice(m[0].length);
  } else if ((m = /^nonattacking (?=creatures?$)/.exec(p))) {
    extra.combat = "notAttacking";
    p = p.slice(m[0].length);
  }
  const isSpell = / ?spell$/.test(p);
  if (isSpell) p = p.replace(/ ?spell$/, "");
  const types: string[] = [];
  const notTypes: string[] = [];
  const colors: Color[] = [];
  const notColors: Color[] = [];
  const supertypes: string[] = [];
  const notSupertypes: string[] = [];
  const notSubtypes: string[] = [];
  const subtypes: string[] = [];
  const SUPERTYPE_WORDS: Record<string, string> = { basic: "Basic", legendary: "Legendary", snow: "Snow" };
  // "Nontoken artifact creature or Vehicle" (Canoptek Spyder): nontoken, whichever it is.
  if (/^nontoken (?:artifact )?creature (?:and\/)?or vehicle$/.test(p)) {
    extra.token = false;
    p = p.slice("nontoken ".length);
  }
  // "Creature or Vehicle": a creature, or a Vehicle whether or not it's a creature right now.
  if (p === "creature or vehicle") {
    extra.orSubtypes = ["Vehicle"];
    p = p.replace(/ or vehicle$/, "");
  }
  // Ragamuffin Raptor: "creature or Food card": a creature card, or a Food card (an artifact subtype, CR 205.3g).
  if (p === "creature or food" && !extra.orSubtypes) {
    extra.orSubtypes = ["Food"];
    p = "creature";
  }
  // Ray of Ruin: "creature, Vehicle, or nonbasic land": any one of the three (TargetSpec.anyOf).
  if (p === "creature, vehicle, or nonbasic land" && !extra.anyOf) {
    extra.anyOf = [
      { kind: "object", types: ["Creature"], text: "creature" },
      { kind: "object", subtypes: ["Vehicle"], text: "Vehicle" },
      { kind: "object", types: ["Land"], notSupertypes: ["Basic"], text: "nonbasic land" },
    ];
    p = "permanent";
  }
  // Soldevi Adnate: "Sacrifice a black or artifact creature": a creature that's black or an artifact (TargetSpec.anyOf).
  const colorOrArtifact = /^(white|blue|black|red|green) or artifact creature$/.exec(p);
  if (colorOrArtifact && !extra.anyOf) {
    extra.anyOf = [
      { kind: "object", colors: [COLOR_WORDS[colorOrArtifact[1]!]!], text: colorOrArtifact[1]! },
      { kind: "object", types: ["Artifact"], text: "artifact" },
    ];
    p = "creature";
  }
  // Seedship Broodtender: "creature or Spacecraft card"; Avoid Fate: "instant or Aura spell"; Sokka, Bold Boomeranger:
  // "artifact or Lesson spell": either one (CR 205.3). Larval Scoutlander: "a land or Lander" (an artifact subtype).
  const orSub = /^(creature|instant) or (spacecraft|aura)$|^(artifact|land) or (lesson|lander)$/.exec(p);
  if (orSub && !extra.orSubtypes) {
    extra.orSubtypes = [capital(orSub[2] ?? orSub[4]!)];
    p = orSub[1] ?? orSub[3]!;
  }
  // "Each land and Ally you control" (Great Divide Guide): a land, or an Ally whatever its card types.
  // "Artifact creature and/or Vehicle" (Iron Spider): every Vehicle is an artifact (CR 205.3g), so "artifact" is for both
  // either way it's read: an artifact that's a creature or a Vehicle.
  if (/^artifact creature (?:and\/)?or [Vv]ehicle$/.test(p) && !extra.anyOf) {
    extra.anyOf = [{ kind: "object", types: ["Creature"], text: "artifact creature" }, { kind: "object", subtypes: ["Vehicle"], text: "Vehicle" }];
    p = "artifact";
  }
  // "Saga or enchantment creature" (Satsuki, the Living Lore): every Saga is an enchantment (CR 714.1), so "enchantment" is
  // for both: an enchantment that's a Saga or a creature.
  if (/^[Ss]aga or enchantment creature$/.test(p) && !extra.anyOf) {
    extra.anyOf = [{ kind: "object", subtypes: ["Saga"], text: "Saga" }, { kind: "object", types: ["Creature"], text: "enchantment creature" }];
    p = "enchantment";
  }
  // Urgent Exorcism: "Spirit or enchantment" is "enchantment or Spirit".
  const kindLast = /^([a-z]+) or (land|artifact|enchantment)$/.exec(p);
  if (kindLast && !extra.orSubtypes && CREATURE_TYPES.has(capital(kindLast[1]!))) p = `${kindLast[2]} or ${kindLast[1]}`;
  const orKind = /^(land|artifact|enchantment) or ([a-z]+)$/.exec(p);
  if (orKind && !extra.orSubtypes && CREATURE_TYPES.has(capital(orKind[2]!))) {
    extra.orSubtypes = [capital(orKind[2]!)];
    p = orKind[1]!;
  }
  // "Angel, Demon, or Dragon creature card" (Kaalia of the Vast): a creature that's one of those creature types; only the
  // last one has the card type, so it's for all of them.
  // "Nonland, nontoken permanent" (Mistmeadow Vanisher): one object that's neither, like "nonland nontoken permanent".
  if (/^(?:non[a-z-]+, )+non[a-z-]+ (?:permanent|creature|card)s?$/.test(p)) p = p.replace(/, /g, " ");
  const sharedType = /^((?:[a-z]+, )*[a-z]+,? or )([a-z]+ (?:creature|creatures))$/.exec(p);
  const typeAlts = sharedType ? [...sharedType[1]!.replace(/,? or $/, "").split(", "), sharedType[2]!.split(" ")[0]!] : [];
  const sharedSubtypes = typeAlts.length > 1 && typeAlts.every((w) => CREATURE_TYPES.has(capital(w))) ? typeAlts.map(capital) : null;
  if (sharedSubtypes) p = sharedType![2]!.replace(/^[a-z]+ /, "");
  const alts = p ? p.split(/,? or |, /) : [];
  // "artifact creature" is one object with both types; "artifact or creature" is either.
  const typeWords = alts.map((alt) => alt.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).length);
  if (typeWords.some((n) => n > 1) && alts.length > 1) return null;
  const allTypes = typeWords[0]! > 1 ? alts[0]!.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).map((w) => TYPE_WORDS[w]!) : null;
  // "Artifact, enchantment, or nonbasic land" (Boseiju, Who Endures): each alternative has one card type, and some have a
  // quality of their own. The object must fit one of them (TargetSpec.anyOf); `types` stays their card types.
  // A quality only on the first one ("nontoken artifact or creature") may be meant for them all, so that isn't read this way.
  const quality = (a: string) => a.trim().split(/\s+/).some((w) => !TYPE_WORDS[w]);
  const leading = quality(alts[0] ?? "") && !alts.slice(1).every(quality);
  if (alts.length > 1 && typeWords.every((n) => n === 1) && alts.some(quality) && !leading && !isSpell && !extra.token && !extra.status && extra.commander === undefined) {
    // A mana value is the whole card's ("artifact and/or non-Aura enchantment cards each with mana value X or less").
    const cardWide = (k: string) => k === "xRange" || k === "manaValue";
    if (extra.anyOf || (inGraveyard && !Object.keys(extra).every(cardWide))) return null;
    const anyOf: TargetSpec[] = [];
    for (const alt of alts) {
      const sub = parseTargetPhrase(alt);
      // "Artifact, enchantment, or tapped creature" (Summon: Yojimbo): tapped is that alternative's own quality.
      if (sub?.kind !== "object" || sub.controller || (sub.tapped !== undefined && tapped !== undefined) || sub.combat || sub.anyOf) return null;
      anyOf.push(sub);
    }
    const types = [...new Set(anyOf.flatMap((a) => a.types ?? []))];
    // A card in a graveyard (Haven of the Spirit Dragon), matched by its printed characteristics.
    if (inGraveyard) return { kind: "card", types, notTypes: [], notColors: [], anyOf, ...extra, ...(owner ? { owner } : {}), ...(linkedExile ? { linkedExile: true as const } : {}), text };
    return { kind: "object", types, notTypes: [], notColors: [], anyOf, ...extra, controller, ...(tapped !== undefined ? { tapped } : {}), text };
  }
  let outlaw = false;
  let permanentSpell = false;
  if (sharedSubtypes) subtypes.push(...sharedSubtypes);
  for (const alt of alts) {
    const words = alt.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if (w === "outlaw") {
        // "Outlaw": Assassin, Mercenary, Pirate, Rogue and/or Warlock (CR 700.12), any of them; alone among subtypes.
        if (alts.length > 1 || subtypes.length) return null;
        subtypes.push(...OUTLAW_TYPES);
        outlaw = true;
      } else if (w === "non-outlaw") {
        if (alts.length > 1 || notSubtypes.length) return null;
        notSubtypes.push(...OUTLAW_TYPES);
      } else if (w === "double-faced") {
        // Tetzin, Gnome Champion: "another double-faced artifact you control" (CR 712.1).
        if (alts.length > 1 || extra.doubleFaced) return null;
        extra.doubleFaced = true;
      } else if (w === "suspected") {
        // "Suspected creature" (CR 701.60).
        if (alts.length > 1 || extra.suspected) return null;
        extra.suspected = true;
      } else if (w === "token" || w === "nontoken") {
        // A leading one is for every alternative: "a nontoken creature or planeswalker" (Sheoldred) is a nontoken
        // creature or a nontoken planeswalker, as "a legendary creature or planeswalker" is a legendary creature or a
        // legendary planeswalker (CR 205.4e).
        if (alts.length > 1 && !(alt === alts[0] && i === 0)) return null;
        extra.token = w === "token";
      } else if (w === "enchanted-or-equipped" && !extra.status) {
        if (alts.length > 1) return null;
        extra.status = "enchantedOrEquipped";
      } else if (w === "aura-yours-enchanted" && !extra.status) {
        if (alts.length > 1) return null;
        extra.status = "enchantedByYours";
      } else if ((w === "goaded" || w === "renowned") && !extra.status) {
        // Aragorn, Hornburg Hero: "a renowned creature you control" (CR 702.112b).
        if (alts.length > 1) return null;
        extra.status = w;
      } else if ((w === "enchanted" || w === "equipped" || w === "modified") && !extra.status) {
        // "Enchanted creatures you control", "an equipped creature", "modified creature" (CR 700.9).
        if (alts.length > 1) return null;
        extra.status = w;
      } else if (w === "commander" || w === "noncommander") {
        // A commander on the battlefield (CR 903.3): "commander creature you control", "noncommander creature".
        if (alts.length > 1 || extra.commander !== undefined) return null;
        extra.commander = w === "commander";
      } else if (w.startsWith("non")) {
        const rest = w.slice(3).replace(/^-/, "");
        if (COLOR_WORDS[rest]) notColors.push(COLOR_WORDS[rest]!);
        else if (TYPE_WORDS[rest]) notTypes.push(TYPE_WORDS[rest]!);
        else if (SUPERTYPE_WORDS[rest]) notSupertypes.push(SUPERTYPE_WORDS[rest]!);
        // "Non-Lesson instant and sorcery card" (Iroh, Grand Lotus): a leading "non-" word is for every alternative, as
        // "nonartifact instant or sorcery" is.
        else if ((alts.length === 1 || (alt === alts[0] && i === 0)) && (CREATURE_TYPES.has(capital(rest)) || BASIC_TYPES.includes(capital(rest)) || ["Aura", "Equipment", "Vehicle", "Lair", "Lesson", "Saga", "Bolas", "Spacecraft"].includes(capital(rest)))) notSubtypes.push(capital(rest)); // "non-Wall", "non-Aura", "non-Lair", "non-Lesson", "non-Spacecraft"
        else return null;
      } else if (TYPE_WORDS[w]) types.push(TYPE_WORDS[w]!);
      // "Nonlegendary attacking creature": attacking after a supertype.
      else if ((w === "attacking" || w === "blocking") && alts.length === 1 && !extra.combat) extra.combat = w;
      else if (CREATURE_TYPES.has(capital(w)) || BASIC_TYPES.includes(capital(w)) || OTHER_SUBTYPES.includes(capital(w))) subtypes.push(capital(w));
      else if (PLANESWALKER_TYPES.has(capital(w)) && words[i + 1] === "planeswalker") subtypes.push(capital(w));
      // "Each Garruk you control" (Garruk, Cursed Huntsman's Wolves): a planeswalker type on its own (CR 205.3j).
      else if (PLANESWALKER_TYPES.has(capital(w)) && w !== "will" && i === words.length - 1 && !types.length) subtypes.push(capital(w));
      // A hyphenated creature type: "Assembly-Worker".
      else if (w.includes("-") && HYPHENATED.has(w)) subtypes.push(HYPHENATED.get(w)!);
      else if (COLOR_WORDS[w]) colors.push(COLOR_WORDS[w]!);
      // "Monocolored instant or sorcery card" (Maestros Confluence): a leading one is for every alternative, as a leading
      // supertype is (below), only before bare card types.
      else if ((w === "multicolored" || w === "monocolored" || w === "colorless" || w === "colored") && !extra.colorCount && (alts.length === 1 || (alt === alts[0] && i === 0 && words.length === 2 && !!TYPE_WORDS[words[1]!] && alts.slice(1).every((a) => { const ws = a.trim().split(/\s+/); return ws.length === 1 && !!TYPE_WORDS[ws[0]!]; })))) extra.colorCount = w;
      else if (SUPERTYPE_WORDS[w]) supertypes.push(SUPERTYPE_WORDS[w]!);
      else if (w === "permanent" && inGraveyard) types.push(...PERMANENT_TYPES); // "permanent card" (CR 110.4b)
      // "Green permanent spell": one that isn't an instant or a sorcery (CR 110.4a: those are the spells that become
      // permanents).
      // "Faerie or Wizard permanent spell" (Archmage of Echoes): for all of them, which are only subtypes and colors.
      else if (w === "permanent" && isSpell) {
        if (alts.length > 1 && alts.some((a) => a.trim().split(/\s+/).some((x) => TYPE_WORDS[x] || x.startsWith("non")))) return null;
        permanentSpell = true;
      }
      else if (w === "permanent" || w === "") continue;
      else return null;
    }
  }
  // "Eldrazi Spawn", "Sand Warrior", "Spider Hero card": one object with both creature types (CR 205.3), not either.
  const allSubtypes = alts.length === 1 && !sharedSubtypes && (alts[0] ?? "").trim().split(/\s+/).filter((w) => CREATURE_TYPES.has(capital(w))).length > 1;
  if (outlaw && subtypes.length !== OUTLAW_TYPES.length) return null;
  // "red or green creature" means a creature that's red or green. Mixing colors with several
  // different type alternatives ("red creature or green artifact") isn't modeled.
  // "Red instant or sorcery spell" (Jaya, Fiery Negotiator's emblem): a leading color is for every alternative, as a
  // leading "monocolored" is, only before bare card types.
  const leadingColor = alts.length > 1 && ((ws) => ws.length === 2 && !!COLOR_WORDS[ws[0]!] && ws[1] === "instant")(alts[0]!.trim().split(/\s+/)) && alts.length === 2 && alts[1]!.trim() === "sorcery";
  if (colors.length && !leadingColor && alts.filter((a) => a.split(/\s+/).some((w) => TYPE_WORDS[w])).length > 1) return null;
  // "Swamp, Mountain, black permanent, or red permanent": a color in only some alternatives would need
  // per-alternative filters too (the fields of a filter must all match).
  if (colors.length && !leadingColor && alts.length > 1 && alts.some((a) => !a.trim().split(/\s+/).some((w) => COLOR_WORDS[w]))) return null;
  // Supertypes are "and" requirements ("basic land"); with alternatives they'd need per-alternative filters.
  // "Nonlegendary, nonland card" is one card that's neither: only "non" words, so every one is required.
  const onlyNon = alts.every((a) => a.trim().split(/\s+/).every((w) => w.startsWith("non") || w === "permanent"));
  // A leading supertype is for every alternative, as "a legendary creature or planeswalker" is a legendary creature or a
  // legendary planeswalker (CR 205.4e): only before bare card types ("legendary creature or planeswalker").
  const firstWords = alts[0]?.trim().split(/\s+/) ?? [];
  const leadingSuper = supertypes.length === 1 && firstWords.length === 2 && SUPERTYPE_WORDS[firstWords[0]!] && TYPE_WORDS[firstWords[1]!] && alts.slice(1).every((a) => { const ws = a.trim().split(/\s+/); return ws.length === 1 && !!TYPE_WORDS[ws[0]!]; });
  if ((supertypes.length || (notSupertypes.length && !onlyNon)) && alts.length > 1 && !leadingSuper) return null;
  // Subtypes mixed with card types in alternatives ("Wall or artifact") would need per-alternative filters too.
  if (subtypes.length && (types.length || notTypes.length) && alts.length > 1) return null;
  if (permanentSpell) notTypes.push(...["Instant", "Sorcery"].filter((t) => !notTypes.includes(t)));
  const filters = {
    types: allTypes ? [] : types,
    ...(allTypes ? { allTypes } : {}),
    ...(allSubtypes ? { allSubtypes: true as const } : {}),
    notTypes,
    notColors,
    ...(colors.length ? { colors } : {}),
    ...(supertypes.length ? { supertypes } : {}),
    ...(notSupertypes.length ? { notSupertypes } : {}),
    ...(subtypes.length ? { subtypes } : {}),
    ...(notSubtypes.length ? { notSubtypes } : {}),
    ...extra,
  };
  if (inGraveyard) {
    if (isSpell || tapped !== undefined || extra.combat || extra.token !== undefined || extra.commander !== undefined || extra.status) return null;
    return { kind: "card", ...filters, ...(otherThanBasic ? { notSupertypes: [...(filters.notSupertypes ?? []), "Basic"] } : {}), ...(owner ? { owner } : {}), ...(linkedExile ? { linkedExile: true as const } : {}), text };
  }
  if (otherThanBasic || ((extra.notCastFromHand || extra.castFromGraveyard || extra.notCast) && !isSpell)) return null;
  if (owner && (isSpell || controller)) return null;
  // A historic spell, a legendary spell: its printed card types, supertypes and subtypes (printedMatches), which the stack
  // doesn't change. Only "legendary" among supertypes.
  // "Creature spell with power or toughness 2 or less" (Stern Scolding): as it is on the stack (see spellMatches).
  const spellPt = (extra.power || extra.toughness || (extra.anyOf && extra.anyOf !== HISTORIC && extra.anyOf.every((a) => a.power || a.toughness))) && types.length === 1 && types[0] === "Creature";
  if (isSpell) return extra.keywords || extra.notKeywords || extra.faceDown || (extra.anyOf && extra.anyOf !== HISTORIC && extra.anyOf !== CREATURE_OR_LEGENDARY && !spellPt) || ((extra.power || extra.toughness) && !spellPt) || extra.combat || extra.token !== undefined || extra.commander !== undefined || extra.status || supertypes.some((t) => t !== "Legendary") ? null : { kind: "spell", ...filters, ...(controller ? { controller } : {}), text };
  return { kind: "object", ...filters, controller, ...(tapped !== undefined ? { tapped } : {}), ...(owner ? { owner } : {}), text };
}

export function parseKeywordList(text: string): string[] | null {
  // "Protection from black and from red" is two protection abilities (CR 702.16g).
  text = text.replace(/(protection|hexproof) from (\w+) and from (\w+)/gi, "$1 from $2, $1 from $3");
  const parts = text.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const k = keywordOf(p, true);
    if (!k) return null;
    out.push(k);
  }
  return out;
}

/** A target that can only be a land: "target land", "target Mountain", "target Plains or Island". */
function isLandSpec(t: TargetSpec): boolean {
  return t.kind === "object" && (!!t.types?.includes("Land") || (!!t.subtypes?.length && t.subtypes.every((x) => BASIC_TYPES.includes(x))));
}
