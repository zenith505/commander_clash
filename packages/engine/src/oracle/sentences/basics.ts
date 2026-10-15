// Sentences about damage, drawing, life, energy, the monarch, prevention, and "at end of combat" delayed triggers.

import { DUNGEONS, UNDERCITY, dungeonSupported } from "../dungeons";
import { allEffects } from "../../abilities";
import type { DamageRecipient, Effect, ObjRef, PlayerRef, TargetSpec } from "../../abilities";
import { NUM, NUMX, amt, num, plainMana, sacrificeSelf } from "../words";
import { parsePayCost, addTarget } from "../body";
import { parseCount } from "../counts";
import { parseSearch, parseSearchFilter } from "../search";
import { parseDamageRecipient, parsePlayer, parseObject, parseTargetPhrase, pickFilter } from "../targets";
import { parseSentence } from "../sentence";
import type { Ctx } from "../body";
import { parsePreventAll } from "../statics";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseBasicsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  if (/^Search your library /i.test(s)) return parseSearch(s);
  // Timetwister: "Each player shuffles their hand and graveyard into their library, then draws seven cards." Reminisce:
  // "Target player shuffles their graveyard into their library."
  if ((m = /^(?:(Target player|Each player|Target opponent) shuffles their|[Ss]huffle your) (hand and graveyard|graveyard|hand) into (?:their|your) library(?:, then (?:draws|draw) (\w+) cards?)?$/.exec(s))) {
    const who: PlayerRef | null = m[1] ? parsePlayer(m[1].toLowerCase(), ctx) : { ref: "you" };
    if (!who) return null;
    const out: Effect[] = [{ type: "shuffleZones", who, ...(m[2] !== "graveyard" ? { hand: true as const } : {}), ...(m[2] !== "hand" ? { graveyard: true as const } : {}) }];
    if (m[3]) {
      const n = num(m[3]);
      if (!Number.isInteger(n)) return null;
      out.push({ type: "draw", who, n });
    }
    return out;
  }
  // "Sacrifice it at end of combat", "destroy that creature at end of combat" (CR 511.2, 603.7), "return ~ to its
  // owner's hand at the beginning of the next cleanup step" (514.3a): a delayed trigger
  // about the source or about the object the trigger was about, with no targets of its own.
  if ((m = /^(.+?) at (end of combat|the beginning of the next cleanup step|the beginning of the next end step)$/i.exec(s)) && !(ctx.lastCreatedAny && /^(Sacrifice|Exile) (?:it|them|the tokens?|that token|those tokens)$/i.test(m[1]!))) {
    const before = ctx.targets.length;
    const inner = parseSentence(m[1]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    if (!inner || ctx.targets.length !== before) return null;
    const refs = new Set<string>();
    let players = true;
    for (const y of allEffects(inner)) {
      if ("what" in y) refs.add((y.what as ObjRef).ref);
      if ("who" in y && (y.who as PlayerRef).ref !== "you") players = false;
      if (y.type === "delayed") players = false;
    }
    if (!players || refs.size !== 1) return null;
    const [ref] = refs;
    const when = m[2] === "end of combat" ? "endOfCombat" : /cleanup/.test(m[2]!) ? "nextCleanup" : "nextEndStep";
    if (ref === "subject") return [{ type: "delayed", when, each: "subject", effects: inner, text: m[1]! }];
    // The Locust God: "When ~ dies, return it to its owner's hand at the beginning of the next end step": about the card
    // in the graveyard now; if it leaves there first, it stays where it went (rulings).
    if (ref === "selfCard") return [{ type: "delayed", when, each: "selfCard", effects: JSON.parse(JSON.stringify(inner).replace(/\{"ref":"selfCard"\}/g, '{"ref":"subjectCard"}')) as Effect[], text: m[1]! }];
    if (ref !== "self") return null;
    // The delayed trigger is about the source as it is now: if it leaves, it's a new object (CR 400.7).
    const effects = JSON.parse(JSON.stringify(inner).replace(/\{"ref":"self"\}/g, '{"ref":"subject"}')) as Effect[];
    return [{ type: "delayed", when, effects, text: m[1]! }];
  }
  // Uro: "When ~ enters, sacrifice it unless it escaped" (CR 702.138b): whether it escaped can't change.
  if (/^[Ss]acrifice (?:~|it) unless (?:it|~) escaped$/.test(s) && ctx.selfIt && ctx.lastObjectTarget === undefined)
    return [{ type: "if", cond: { kind: "state", cond: { kind: "self", is: "escaped" } }, effects: [], otherwise: [sacrificeSelf] }];
  // "Sacrifice ~ unless you pay {U}" (upkeep costs): pay to keep it, or it's sacrificed.
  if ((m = /^[Ss]acrifice (~|it) unless you pay (.+)$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const pay = parsePayCost(m[2]!);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return null;
    return [{ type: "may", effects: [], pay, otherwise: [sacrificeSelf], keep: true, text: `Pay ${m[2]} to keep ~` }];
  }
  // "Sacrifice ~ unless you discard a card" (Masticore), "sacrifice it unless you discard a card at random" (Balduvian
  // Horde): the choice is made on resolution; with no card to discard, it's sacrificed (rulings).
  if ((m = /^[Ss]acrifice (~|it) unless you discard a card( at random)?$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const discard: Effect = { type: "discard", who: { ref: "you" }, n: 1, ...(m[2] ? { random: true } : {}) };
    return [{ type: "may", effects: [discard], otherwise: [sacrificeSelf], keep: true, text: `Discard a card${m[2] ?? ""} to keep ~` }];
  }
  // "Sacrifice ~ unless you discard a land card" (Fallow Wurm), "exile it unless you discard a creature card" (Body
  // Snatcher): only such a card can be discarded; with none, it's sacrificed (exiled).
  if ((m = /^(Sacrifice|Exile) (~|it) unless you discard (an? .+? card)$/i.exec(s)) && (m[2] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const filter = parseSearchFilter(m[3]!.replace(/^an? /, ""));
    if (!filter) return null;
    const away: Effect = /^sacrifice/i.test(m[1]!) ? sacrificeSelf : { type: "exile", what: { ref: "self" } };
    return [{ type: "may", effects: [{ type: "discard", who: { ref: "you" }, n: 1, filter }], otherwise: [away], keep: true, text: `Discard ${m[3]} to keep ~` }];
  }
  // "Then discard two cards unless you discard a creature card" (Mystic Meditation, Thirst for Knowledge): a card of
  // that kind, or two cards. With none of that kind, two cards (rulings).
  if ((m = new RegExp(`^(?:[Tt]hen )?[Dd]iscard (two|three|\\d+) cards unless you discard (an? .+? card)$`).exec(s))) {
    const filter = parseSearchFilter(m[2]!.replace(/^an? /, ""));
    if (!filter) return null;
    return [{ type: "may", effects: [{ type: "discard", who: { ref: "you" }, n: 1, filter }], otherwise: [{ type: "discard", who: { ref: "you" }, n: num(m[1]!) }], keep: true, text: `Discard ${m[2]} rather than ${m[1]} cards` }];
  }
  // The Lairs: "sacrifice it unless you return a non-Lair land you control to its owner's hand". Returning one keeps it;
  // with none to return, it's sacrificed. Quickling: "unless you return another creature you control".
  if ((m = /^[Ss]acrifice (~|it) unless you return (an? .+?|another .+?) you control to its owner's hand$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const another = /^another /.test(m[2]!);
    const filter = pickFilter(m[2]!.replace(/^(?:an?|another) /, ""));
    if (!filter) return null;
    return [{ type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter: another ? { ...filter, notSource: true, text: `other ${filter.text}` } : filter, n: 1, action: "bounce" }], otherwise: [sacrificeSelf], keep: true, text: `Return ${m[2]} you control to its owner's hand to keep ~` }];
  }
  // "That player draws an additional card" (Howling Mine): just another draw.
  if ((m = /^(.*?\b[Dd]raws?) an additional card$/.exec(s))) return parseSentence(`${m[1]} a card`, ctx);
  // Poison counters on a player (CR 122.1f): "defending player gets a poison counter", "each opponent gets two".
  if ((m = new RegExp(`^(.+?) gets? (a|${NUMX}) poison counters?$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && [{ type: "poison", who, n: m[2] === "a" ? 1 : amt(m[2]!) }];
  }
  // Adding mana from a spell or a non-mana triggered ability (CR 605.5a: it uses the stack): "Add {B}{B}{B}" (Dark
  // Ritual), "add one mana of any color", "add three mana of any one color" (the color is chosen as it resolves).
  if ((m = /^[Aa]dd ((?:\{[WUBRGC]\})+)$/.exec(s))) return [{ type: "addMana", mana: m[1]! }];
  if ((m = new RegExp(`^[Aa]dd ${NUM} mana of any (one )?color$`).exec(s)) && (num(m[1]!) === 1 || m[2])) return [{ type: "choose", choice: "color" }, { type: "addMana", chosen: num(m[1]!) }];
  // Energy (CR 107.14): "You get {E}{E}", "you get X {E}", "you get an amount of {E} equal to ~'s power".
  if ((m = /^(?:[Yy]ou )?[Gg]et ((?:\{E\})+)$/.exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: m[1]!.length / 3 }];
  if ((m = new RegExp(`^(?:[Yy]ou )?[Gg]et ${NUMX} \\{E\\}$`).exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = /^(?:[Yy]ou )?[Gg]et an amount of \{E\} equal to (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    return n && [{ type: "getEnergy", who: { ref: "you" }, n }];
  }
  // The monarch (CR 725).
  if (/^You become the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "you" } }];
  // The initiative (CR 726), which ventures into Undercity; and venturing into Undercity itself (CR 701.49d). Plain
  // "venture into the dungeon" lets its player pick a dungeon that isn't modeled yet (see oracle/dungeons.ts).
  if (/^(?:You )?take the initiative$/i.test(s)) return dungeonSupported(UNDERCITY) ? [{ type: "takeInitiative", who: { ref: "you" } }] : null;
  if (/^(?:You )?venture into Undercity$/i.test(s)) return dungeonSupported(UNDERCITY) ? [{ type: "venture", undercity: true }] : null;
  if (/^(?:You )?venture into the dungeon$/i.test(s)) return DUNGEONS.length > 1 && DUNGEONS.every(dungeonSupported) ? [{ type: "venture" }] : null;
  // The Ring tempts you (CR 701.54).
  if (/^the Ring tempts you$/i.test(s)) return [{ type: "ringTempts" }];
  if (/^Target player becomes the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "target", index: addTarget(ctx, { kind: "player", text: "target player" }) } }];
  // "Choose a creature type." / "Choose a color." (the rest of the text says what it's for).
  if ((m = /^Choose an? (creature type|color)(?: other than (\w+))?$/i.exec(s)))
    return [{ type: "choose", choice: m[1]!.toLowerCase() === "color" ? "color" : "creatureType", ...(m[2] ? { except: m[2] } : {}) }];

  // "~ gets +1/+1 until end of turn for each creature blocking it (beyond the first)" (rampage, CR 702.23)
  if ((m = /^~ gets ([+-]\d+)\/([+-]\d+) until end of turn for each creature blocking it( beyond the first)?$/.exec(s)))
    return [{ type: "pumpPerBlocker", what: { ref: "self" }, power: Number(m[1]), toughness: Number(m[2]), beyondFirst: !!m[3] }];
  // Prevention (CR 615): shields for the next N damage this turn, and Fog.
  if ((m = new RegExp(`^Prevent the next ${NUMX} damage that would be dealt to (any target|target .+?) this turn$`, "i").exec(s))) {
    const to = /^any target$/i.test(m[2]!) ? parseDamageRecipient(m[2]!, ctx) : parseObject(m[2]!, ctx);
    return to ? [{ type: "preventNext", n: amt(m[1]!), to }] : null;
  }
  if (/^Prevent all combat damage that would be dealt this turn$/i.test(s)) return [{ type: "preventCombatDamage" }];
  if ((m = /^(Players|Your opponents) can't gain life this turn$/i.exec(s))) return [{ type: "noLifeGain", players: /^players$/i.test(m[1]!) ? "all" : "opponents" }];
  if (/^Damage can't be prevented this turn$/i.test(s)) return [{ type: "noPrevention" }];
  // "Prevent all combat damage that would be dealt to and dealt by that creature this turn" (Maze of Ith), "Prevent all
  // damage target creature would deal this turn": a prevention effect on that creature until the turn ends (CR 615.1).
  if ((m = /^(Prevent all .+) this turn$/i.exec(s)) || (m = /^Prevent all (combat )?damage (.+?) would deal this turn$/i.exec(s))) {
    const p = m.length === 2 ? parsePreventAll(m[1]!) : { subject: m[2]!, mod: { kind: "preventDamage" as const, by: true as const, ...(m[1] ? { combat: "only" as const } : {}) } };
    const what = p && /^(~|it|that creature|target .+)$/i.test(p.subject) ? parseObject(p.subject, ctx) : null;
    return p && what ? [{ type: "continuous", what, mods: [p.mod], duration: "endOfTurn" }] : null;
  }
  // Redirection shields (CR 614.9): "The next 1 damage that would be dealt to ~ this turn is dealt to target creature
  // you control instead" (the en-Kor), "... dealt this turn to target white creature you control is dealt to ~ instead".
  if ((m = new RegExp(`^The next ${NUMX} damage that would be dealt (this turn )?to (.+?)( this turn)? is dealt to (.+) instead$`, "i").exec(s)) && !m[2] !== !m[4]) {
    const from = /^(~|any target|target .+)$/i.test(m[3]!) ? parseDamageRecipient(m[3]!, ctx) : null;
    const to = from && /^(~|any target|any other target|another target|target .+|another target .+)$/i.test(m[5]!) ? parseDamageRecipient(m[5]!, ctx) : null;
    return from && to ? [{ type: "redirectNext", n: amt(m[1]!), from, to }] : null;
  }
  // "~ deals 2 damage to any target and 1 damage to any other target" (Arc Trail): both at once.
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+?) and ${NUMX} damage to (.+)$`, "i").exec(s))) {
    const a = parseDamageRecipient(m[2]!, ctx);
    const b = a && parseDamageRecipient(m[4]!, ctx);
    return a && b ? [{ type: "damage", amount: amt(m[1]!), to: a }, { type: "damage", amount: amt(m[3]!), to: b }] : null;
  }
  // "~ deals 3 damage divided as you choose among one, two, or three targets": how many targets and how much each
  // gets are chosen with the targets, at least 1 each (CR 601.2d); "any number of targets" is one to that many.
  if ((m = /^~ deals (\d+|one|two|three|four|five|six|seven|eight|nine|ten) damage divided as you choose among (one or two|one, two, or three|any number of) (targets|target .+)$/i.exec(s))) {
    const total = num(m[1]!);
    const n = m[2] === "one or two" ? 2 : m[2] === "one, two, or three" ? 3 : total;
    let spec: TargetSpec | null = { kind: "any", text: "any target" };
    if (m[3] !== "targets") {
      const words = m[3]!.replace(/^target /, "").replace(/ your opponents control$/, " an opponent controls").replace(/ and\/or /g, " or ");
      const one = words.replace(/\bcreatures\b/g, "creature").replace(/\bplaneswalkers\b/g, "planeswalker");
      spec = one === words ? null : parseTargetPhrase(one);
      if (spec?.kind !== "object") return null;
      spec = { ...spec, text: `target ${one}` };
    }
    const first = ctx.targets.length;
    for (let k = 0; k < n; k++)
      addTarget(ctx, { ...spec, divided: { first, n, total }, ...(k ? { optional: true, distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
    return [{ type: "damage", amount: total, to: { ref: "anyTarget", index: first, n }, divided: true }];
  }
  // Damage: "~ deals 3 damage to any target"
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+)$`, "i").exec(s))) {
    // "to each creature and each player": dealt to all of them at once (CR 120.3).
    const tos: DamageRecipient[] = [];
    for (const part of m[2]!.split(/,? and (?=each )/i)) {
      const to = parseDamageRecipient(part, ctx);
      if (!to) return null;
      tos.push(to);
    }
    return [{ type: "damage", amount: amt(m[1]!), to: tos[0]!, ...(tos.length > 1 ? { also: tos.slice(1) } : {}) }];
  }
  // Drawing
  if ((m = new RegExp(`^(?:You )?[Dd]raw ${NUMX} cards?$`).exec(s))) return [{ type: "draw", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = new RegExp(`^(.+?) draws? ${NUMX} cards?$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "draw", who, n: amt(m[2]!) }] : null;
  }
  // Life. "You may gain 1 life" leaves "Gain 1 life": yours.
  if ((m = new RegExp(`^Gain ${NUMX} life$`).exec(s))) return [{ type: "gainLife", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = new RegExp(`^(.+?) (gains?|loses?) ${NUMX} life$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    if (!who) return null;
    return [{ type: m[2]!.startsWith("gain") ? "gainLife" : "loseLife", who, n: amt(m[3]!) }];
  }
  return undefined;
}
