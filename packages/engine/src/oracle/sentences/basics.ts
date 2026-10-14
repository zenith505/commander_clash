// Sentences about damage, drawing, life, energy, the monarch, prevention, and "at end of combat" delayed triggers.

import { allEffects } from "../../abilities";
import type { DamageRecipient, Effect, ObjRef, PlayerRef } from "../../abilities";
import { NUMX, amt, plainMana, sacrificeSelf } from "../words";
import { parsePayCost, addTarget } from "../body";
import { parseCount } from "../counts";
import { parseSearch } from "../search";
import { parseDamageRecipient, parsePlayer, parseObject } from "../targets";
import { parseSentence } from "../sentence";
import type { Ctx } from "../body";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseBasicsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  if (/^Search your library /i.test(s)) return parseSearch(s);
  // "Sacrifice it at end of combat", "destroy that creature at end of combat" (CR 511.2, 603.7): a delayed trigger
  // about the source or about the object the trigger was about, with no targets of its own.
  if ((m = /^(.+?) at end of combat$/i.exec(s)) && !(ctx.lastCreatedAny && /^(Sacrifice|Exile) (?:it|them|the tokens?|that token|those tokens)$/i.test(m[1]!))) {
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
    if (ref === "subject") return [{ type: "delayed", when: "endOfCombat", each: "subject", effects: inner, text: m[1]! }];
    if (ref !== "self") return null;
    // The delayed trigger is about the source as it is now: if it leaves, it's a new object (CR 400.7).
    const effects = JSON.parse(JSON.stringify(inner).replace(/\{"ref":"self"\}/g, '{"ref":"subject"}')) as Effect[];
    return [{ type: "delayed", when: "endOfCombat", effects, text: m[1]! }];
  }
  // "Sacrifice ~ unless you pay {U}" (upkeep costs): pay to keep it, or it's sacrificed.
  if ((m = /^[Ss]acrifice (~|it) unless you pay (.+)$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const pay = parsePayCost(m[2]!);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return null;
    return [{ type: "may", effects: [], pay, otherwise: [sacrificeSelf], keep: true, text: `Pay ${m[2]} to keep ~` }];
  }
  // "That player draws an additional card" (Howling Mine): just another draw.
  if ((m = /^(.*?\b[Dd]raws?) an additional card$/.exec(s))) return parseSentence(`${m[1]} a card`, ctx);
  // Energy (CR 107.14): "You get {E}{E}", "you get X {E}", "you get an amount of {E} equal to ~'s power".
  if ((m = /^(?:[Yy]ou )?[Gg]et ((?:\{E\})+)$/.exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: m[1]!.length / 3 }];
  if ((m = new RegExp(`^(?:[Yy]ou )?[Gg]et ${NUMX} \\{E\\}$`).exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = /^(?:[Yy]ou )?[Gg]et an amount of \{E\} equal to (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    return n && [{ type: "getEnergy", who: { ref: "you" }, n }];
  }
  // The monarch (CR 725).
  if (/^You become the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "you" } }];
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
  // "~ deals 2 damage to any target and 1 damage to any other target" (Arc Trail): both at once.
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+?) and ${NUMX} damage to (.+)$`, "i").exec(s))) {
    const a = parseDamageRecipient(m[2]!, ctx);
    const b = a && parseDamageRecipient(m[4]!, ctx);
    return a && b ? [{ type: "damage", amount: amt(m[1]!), to: a }, { type: "damage", amount: amt(m[3]!), to: b }] : null;
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
  // Life
  if ((m = new RegExp(`^(.+?) (gains?|loses?) ${NUMX} life$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    if (!who) return null;
    return [{ type: m[2]!.startsWith("gain") ? "gainLife" : "loseLife", who, n: amt(m[3]!) }];
  }
  return undefined;
}
