import type { AmountExpr, Count, ObjRef, PlayerRef } from "../abilities";
import { NUM, num, COUNTER, counterKind, COLOR_WORDS, capital, singularWord } from "./words";
import { Ctx, addTarget } from "./body";
import { parsePlayer, parseTargetPhrase } from "./targets";

/**
 * A count: "the number of creatures you control", "cards in your hand", "~'s power", "your
 * devotion to black", "twice the number of ...", "1 plus the number of ...". With `each`, the
 * singular form after "for each": "creature you control", "card in your graveyard".
 * `ctx` is the ability being read (null for a static ability, where "it" is the permanent itself).
 */
export function parseCount(text: string, ctx: Ctx | null, each = false): AmountExpr | null {
  let p = text.trim().replace(/\.$/, "");
  let m: RegExpExecArray | null;
  // Arithmetic around a count.
  if ((m = /^twice (.+)$/i.exec(p))) {
    const c = parseCount(m[1]!, ctx);
    return c && { ...c, times: 2 * (c.times ?? 1), ...(c.plus ? { plus: 2 * c.plus } : {}) };
  }
  if ((m = new RegExp(`^${NUM} plus (.+)$`, "i").exec(p))) {
    const c = parseCount(m[2]!, ctx);
    return c && { ...c, plus: (c.plus ?? 0) + num(m[1]!) };
  }
  if ((m = new RegExp(`^${NUM} minus (.+)$`, "i").exec(p))) {
    const c = parseCount(m[2]!, ctx);
    return c && { count: c.count, times: -(c.times ?? 1), plus: num(m[1]!) - (c.plus ?? 0) };
  }
  if ((m = new RegExp(`^(.+) (plus|minus) ${NUM}$`, "i").exec(p))) {
    const c = parseCount(m[1]!, ctx);
    const n = num(m[3]!) * (m[2]!.toLowerCase() === "minus" ? -1 : 1);
    return c && { ...c, plus: (c.plus ?? 0) + n };
  }
  // "The greatest power among creatures you control" (0 with none), "among other creatures you control".
  if (!each && (m = /^the greatest power among (other )?(creatures you control|creatures on the battlefield)$/i.exec(p))) {
    const spec = parseTargetPhrase(/you control/i.test(m[2]!) ? "creature you control" : "creature", { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestPower", filter: { ...spec, text: m[2]! }, ...(m[1] ? { other: true as const } : {}) } };
  }
  // "Draw a card for each counter removed this way" (Nexus Mentality, after "remove all counters").
  if (each && /^counter removed this way$/i.test(p)) return { count: { kind: "countersRemovedThisWay" } };
  // "Draw a card for each creature destroyed this way" (Decree of Pain), "for each permanent destroyed this way", "the
  // number of enchantments destroyed this way": what this spell's or ability's destroy instructions destroyed.
  if ((m = /^(.+?) (destroyed|exiled) this way$/i.exec(p)) && !/\b(you|your|that|they|their|cards?)\b/i.test(m[1]!)) {
    const spec = parseTargetPhrase(m[1]!.split(/\s+/).map(singularWord).join(" "), { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: m[2]!.toLowerCase() === "destroyed" ? "destroyedThisWay" : "exiledThisWay", filter: { ...spec, text: m[1]! } } };
  }
  // "The greatest power among creature cards exiled this way" (Szat's Will, after exiling graveyards).
  if (!each && /^the greatest power among creature cards exiled this way$/i.test(p)) return { count: { kind: "greatestPowerExiled" } };
  // "The greatest mana value among permanents you control" (Will of the Temur), 0 with none.
  if (!each && (m = /^the greatest mana value among (.+?) you control$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[1]!.split(/\s+/).map(singularWord).join(" ")} you control`, { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestManaValue", filter: { ...spec, text: `${m[1]} you control` } } };
  }
  // "The greatest number of creatures a player controls" (Investigator's Journal), "... an opponent controls".
  if (!each && (m = /^the greatest number of (.+?) (a player|an opponent) controls$/i.exec(p))) {
    const spec = parseTargetPhrase(m[1]!.split(/\s+/).map(singularWord).join(" "), { chosen: true });
    if (spec?.kind !== "object" || spec.controller) return null;
    return { count: { kind: "greatestControlled", filter: { ...spec, text: m[1]! }, ...(m[2] === "an opponent" ? { opponents: true as const } : {}) } };
  }
  if (!each && /^the greatest number of cards an opponent has drawn this turn$/i.test(p)) return { count: { kind: "greatestDrawn" } };
  if (!each) {
    const nb = /^the (?:total )?number of (.+)$/i.exec(p);
    if (nb) return parseCount(nb[1]!, ctx, true);
  }
  const count = (c: Count): AmountExpr => ({ count: c });
  // "Draw cards equal to the result", "where X is the result" (CR 706.2), "the total of those results" (Neverwinter Hydra).
  if (!each && /^(?:the result|the total of those results)$/i.test(p)) return count({ kind: "rollResult" });
  // Life and hands.
  if (/^your life total$/i.test(p)) return count({ kind: "life", who: { ref: "you" } });
  if (/^your speed$/i.test(p)) return count({ kind: "speed" });
  if (each && /^player$/i.test(p)) return count({ kind: "players" });
  if (each && /^opponent(?: you have)?$/i.test(p)) return count({ kind: "players", opponents: true });
  if (each && /^(?:of your opponents|opponent) who lost life this turn$/i.test(p)) return count({ kind: "players", opponents: true, lostLife: true });
  if ((m = /^creatures? that died (under your control )?this turn$/i.exec(p))) return count({ kind: "diedThisTurn", ...(m[1] ? { yours: true as const } : {}) });
  if (/^creatures? that attacked this turn$/i.test(p)) return count({ kind: "attackersThisTurn" });
  if ((m = /^(?:([A-Z][a-z]+) )?tokens you created this turn$/.exec(p))) return count({ kind: "tokensCreatedThisTurn", ...(m[1] ? { subtype: m[1] } : {}) });
  if (/^times? you've cast your commander from the command zone this game$/i.test(p)) return count({ kind: "commanderCasts" });
  // "For each creature in your party", "the number of creatures in your party" (CR 700.8).
  if (/^creatures? in your party$/i.test(p)) return count({ kind: "party" });
  if (each ? /^1 life your opponents have lost this turn$/i.test(p) : /^the (?:total )?amount of life your opponents (?:have )?lost this turn$/i.test(p)) return count({ kind: "opponentsLifeLost" });
  if ((m = /^cards? in (your|that player's|target player's|their|target opponent's) (hand|library)$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: m[2]!.toLowerCase() === "hand" ? "cardsInHand" : "cardsInLibrary", who });
  }
  // "Card types among cards in all graveyards" (Tarmogoyf), "in your graveyard", "in your opponents' graveyards" (CR 205.2a).
  if ((m = /^card types? among cards in (your|all|your opponents') graveyards?$/i.exec(p)))
    return count({ kind: "graveyardCardTypes", who: { ref: m[1] === "your" ? "you" : m[1] === "all" ? "eachPlayer" : "eachOpponent" } as PlayerRef });
  // Graveyards: "card in your graveyard", "creature card in your graveyard", "instant and sorcery card in all graveyards".
  if ((m = /^(.*?)cards? in (your|all|that player's|target player's|their) graveyards?$/i.exec(p))) {
    const who = /^all$/i.test(m[2]!) ? ({ ref: "eachPlayer" } as PlayerRef) : whosePlayer(m[2]!, ctx);
    if (!who) return null;
    const kinds = m[1]!.trim().replace(/ and /g, " or ");
    if (!kinds) return count({ kind: "cardsInGraveyard", who });
    const spec = parseTargetPhrase(`${kinds.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    return spec?.kind === "card" ? count({ kind: "cardsInGraveyard", who, filter: { ...spec, text: `${kinds} card` } }) : null;
  }
  // Devotion (CR 700.5): "your devotion to black", "your devotion to black and red".
  if ((m = /^your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?$/i.exec(p)))
    return count({ kind: "devotion", colors: [m[1]!, m[2]].filter(Boolean).map((w) => COLOR_WORDS[w!.toLowerCase()]!) });
  // Domain.
  if (/^basic land types? among lands you control$/i.test(p)) return count({ kind: "basicLandTypes" });
  // "For each creature it devoured" (CR 702.82b): only the permanent's own abilities know what it devoured.
  if (/^creatures? (?:it|~) devoured$/i.test(p) && (ctx === null || ctx.selfIt)) return count({ kind: "devoured" });
  // Converge: "the number of colors of mana spent to cast this spell", "for each color of mana spent to cast it".
  // "It" is the object itself only where nothing else can be "it" (not "whenever you cast a spell").
  if ((m = /^colou?rs? of mana spent to cast (~|it)$/i.exec(p)) && (m[1] === "~" || ctx === null || ctx.selfIt || ctx.spell)) return count({ kind: "colorsSpent" });
  // "For each mana from a Treasure spent to cast it" (CR 106.3): the spell's, or its permanent's enters trigger's (compile
  // checks it's one of those).
  // "For each mana from Treasures spent to activate this ability" (Mr. House): an activated ability's own.
  if (each && /^mana from Treasures spent to activate this ability$/i.test(p) && ctx?.activated) return count({ kind: "treasureSpent", activated: true });
  if ((m = /^mana from a Treasure (?:that was )?spent to cast (~|it)$/i.exec(p)) && ctx !== null && (ctx.spell || (ctx.selfIt && m[1] === "it"))) return count({ kind: "treasureSpent" });
  // "For each {S} spent to cast ~", "the amount of {S} spent to cast ~" (CR 107.4h): the spell's, or its permanent's
  // enters trigger's (compile checks it's one of those).
  if ((m = /^(?:the )?(?:amount of )?\{S\} spent to cast (~|it)$/i.exec(p)) && ctx !== null && (ctx.spell || (ctx.selfIt && m[1] === "it") || m[1] === "~")) return count({ kind: "snowSpent" });
  // Multikicker: "for each time it was kicked", "the number of times ~ was kicked" (CR 702.33d).
  if (/^times? (?:~|it) was kicked$/i.test(p)) return count({ kind: "kicked" });
  // Power, toughness, mana value: "~'s power", "its power", "that creature's toughness".
  if ((m = /^(~'s|its|that creature's|the creature's|that permanent's|that spell's|the spell's|that card's|the sacrificed (?:creature|artifact|permanent)'s) (power|toughness|mana value)$/i.exec(p))) {
    const of = whoseObject(m[1]!, ctx);
    const kind = m[2]!.toLowerCase() === "mana value" ? "manaValue" : (m[2]!.toLowerCase() as "power" | "toughness");
    if (of?.ref === "castSpell" && kind !== "manaValue") return null;
    return of && count({ kind, of });
  }
  // "Charge counter on ~", "+1/+1 counters on it".
  if ((m = new RegExp(`^${COUNTER} counters? on (~|it|that creature)$`).exec(p))) {
    const of = whoseObject(m[2] === "~" ? "~'s" : m[2] === "it" ? "its" : "that creature's", ctx);
    return of && count({ kind: "counters", counter: counterKind(m[1]!), of });
  }
  // "Aura attached to it", "Equipment attached to ~": only the permanent's own.
  if ((m = /^(Aura|Equipment)s? attached to (it|~)$/i.exec(p)) && (ctx === null || ctx.selfIt || /~/.test(m[2]!)))
    return count({ kind: "attachedToSelf", subtypes: [capital(m[1]!.toLowerCase()) === "Aura" ? "Aura" : "Equipment"] });
  // Permanents: "creature you control", "other Elf you control", "land on the battlefield", "artifacts your opponents control".
  // "Creatures target player controls" (Will of the Mardu), "that player controls": that player's permanents.
  if ((m = /^(other )?(.+?) (you control|on the battlefield|your opponents control|an opponent controls|target player controls|target opponent controls|that player controls|those players control|those opponents control)(?: ((?:with|of the chosen|of that|that aren't) .+))?$/i.exec(p))) {
    const words = m[2]!.split(/\s+/).map(singularWord).join(" ");
    const who = m[3]!.toLowerCase();
    const theirs = /^(target|that|those) /.test(who);
    const suffix = who === "you control" ? " you control" : who === "on the battlefield" || theirs ? "" : " an opponent controls";
    const spec = parseTargetPhrase(`${words}${suffix}${m[4] ? ` ${m[4]}` : ""}`, { chosen: true });
    if (spec?.kind !== "object") return null;
    const whose = theirs ? whosePlayer(who.replace(/ controls$/, "'s").replace(/^(those \w+) control$/, "$1'"), ctx) : undefined;
    if (whose === null) return null;
    return count({ kind: "permanents", filter: { ...spec, text: `${m[1] ?? ""}${m[2]} ${m[3]}` }, ...(m[1] ? { other: true } : {}), ...(whose ? { whose } : {}) });
  }
  // "attacking creature", "tapped creature": any controller.
  if ((m = /^(attacking|blocking|tapped) (creatures?)$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[1]} creature`);
    return spec?.kind === "object" ? count({ kind: "permanents", filter: { ...spec, text: p } }) : null;
  }
  // "Whenever ~ attacks, it gets +2/+0 until end of turn for each other attacking Goblin" (Goblin Piledriver): "other"
  // is the permanent itself, so only in its own abilities.
  if ((m = /^other (attacking|blocking) (.+)$/i.exec(p)) && ctx?.selfIt) {
    const spec = parseTargetPhrase(`${m[1]} ${m[2]!.split(/\s+/).map(singularWord).join(" ")}`);
    return spec?.kind === "object" && (spec.types?.length || spec.subtypes?.length) ? count({ kind: "permanents", filter: { ...spec, text: p }, other: true }) : null;
  }
  return null;
}

function whosePlayer(w: string, ctx: Ctx | null): PlayerRef | null {
  const x = w.toLowerCase();
  if (x === "your") return { ref: "you" };
  if (!ctx) return null;
  if (x === "target player's" || x === "target opponent's") {
    const i = addTarget(ctx, { kind: "player", opponent: x === "target opponent's", text: x.replace(/'s$/, "") });
    ctx.lastPlayerTarget = i;
    return { ref: "target", index: i };
  }
  // "Any number of target players' graveyards" (Stonespeaker Crystal), "their" after them: all of them.
  if (/^any number of target (?:players|opponents)'$/.test(x)) return parsePlayer(x.slice(0, -1), ctx);
  if (ctx.manyPlayers !== undefined && ctx.lastPlayerTarget === ctx.manyPlayers) return x === "their" || x === "those players'" || x === "those opponents'" ? { ref: "target", index: ctx.manyPlayers, n: 2 } : null;
  if (x === "that player's" && ctx.chosenOpponent) return { ref: "chosenPlayer" };
  if ((x === "that player's" || x === "their") && ctx.lastPlayerTarget !== undefined) return { ref: "target", index: ctx.lastPlayerTarget };
  // "At the beginning of each opponent's upkeep, ~ deals X damage to that player, where X is the number of cards in their hand".
  if ((x === "that player's" || x === "their") && ctx.eventPlayer) return { ref: "eventPlayer" };
  if (x === "enchanted player's" || x === "enchanted opponent's") return { ref: "enchantedPlayer" };
  return null;
}

function whoseObject(w: string, ctx: Ctx | null): ObjRef | null {
  const x = w.toLowerCase();
  if (x === "~'s") return { ref: "self" };
  // What was sacrificed to cast the spell, as it last existed (CR 608.2h); compile() checks there's such a cost.
  if (/^the sacrificed (creature|artifact|permanent)'s$/.test(x)) return ctx ? { ref: "sacrificed" } : null;
  if (!ctx) return x === "its" ? { ref: "self" } : null;
  // "That spell's mana value": the targeted spell (Imp's Mischief).
  if ((x === "that spell's" || x === "the spell's") && ctx.lastObjectTarget !== undefined) return ctx.targets[ctx.lastObjectTarget]?.kind === "spell" ? { ref: "target", index: ctx.lastObjectTarget } : null;
  // "Return target card from your graveyard to your hand. You gain life equal to that card's mana value": the card
  // targeted, wherever it went (Healing Technique, Razor Hippogriff).
  if (x === "that card's") return ctx.targets.length === 1 && ctx.targets[0]!.kind === "card" ? { ref: "target", index: 0 } : null;
  // In a cast trigger, the spell cast ("discover X, where X is that spell's mana value").
  if (x === "that spell's") return ctx.castSpell ? { ref: "castSpell" } : null;
  // "The creature's power" after "that creature's controller" (Boros Fury-Shield): the creature targeted.
  if (x === "the creature's") return ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" ? { ref: "target", index: ctx.lastObjectTarget } : null;
  if (x === "its" || x === "that creature's" || x === "that permanent's") {
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if ((x === "that creature's" && ctx.subject) || ctx.subjectIt) return { ref: "subject" };
    // The permanent itself; after it left the battlefield, as it last existed (CR 608.2h).
    if (x === "its" && (ctx.selfIt || ctx.selfCard || ctx.activated)) return { ref: "self" };
  }
  return null;
}
