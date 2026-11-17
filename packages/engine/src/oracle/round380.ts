// Round 380's whole lines (compile.ts, after round 378's): a creature card given to the player whose turn it is, goaded and
// exiled at the next end step (The Beamtown Bullies), a creature card exiled from the top that may be cast with undaunted
// while it stays exiled (Durnan of the Yawning Portal), prevention whose triggers have your commanders strike back
// (Judgment of Alexander), and creature types noted for a token, counted to draw (Volo, Itinerant Scholar).
import type { CompiledCard, Effect, TargetSpec, TokenSpec } from "../abilities";
import type { CardDef } from "../types";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { compileNamedToken } from "./grants";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const BULLIES = "{T}: Target opponent whose turn it is puts target nonlegendary creature card from your graveyard onto the battlefield under their control. It gains haste. Goad it. At the beginning of the next end step, exile it.";
const DURNAN = "Whenever ~ attacks, look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains exiled, you may cast it. That spell has undaunted.";
const JUDGMENT = "Prevent all damage that would be dealt to you this turn by sources your opponents control. Whenever damage from a creature is prevented this way, each commander creature you control deals damage equal to its power to that creature.";
const JOURNAL_NOTE = "Whenever you cast a creature spell, note one of its creature types that hasn't been noted for ~.";

export function round380Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, d: CardDef): boolean {
  // The Beamtown Bullies: the opponent must be the active player (CR 102.1), so it's activated only during an opponent's turn
  // (no legal target otherwise, CR 602.2b, 601.2c). That player puts the card onto the battlefield under their control (CR
  // 110.2a; GameObject.putter); if they're an illegal target as it resolves, it stays in the graveyard (CR 608.2b). "It"
  // is the permanent it became (CR 400.7): haste with no duration lasts (CR 611.2a), goaded by you until your next turn
  // (CR 701.15a), and exiled by your delayed trigger at the beginning of the next end step (CR 603.7), while it's that object.
  if (line === BULLIES) {
    const a = isSpell ? null : parseActivated("{T}: Put target nonlegendary creature card from your graveyard onto the battlefield under your control. It gains haste. At the beginning of the next end step, exile it.");
    const put = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const goad = parseBody("Goad target creature.")?.effects[0];
    if (!a || a === "fail" || !a.tap || a.manaCost || a.body.targets.length !== 1 || put?.type !== "putOntoBattlefield" || put.haste !== "game" || put.atEndStep !== "exile" || goad?.type !== "continuous" || goad.mods[0]?.kind !== "goad") return fail(out, raw);
    const opponent: TargetSpec = { kind: "player", opponent: true, activePlayer: true, text: "target opponent whose turn it is" };
    const effects: Effect[] = [
      { ...put, what: { ref: "target", index: 1 }, under: { ref: "target", index: 0 }, putByUnder: true },
      { ...goad, what: { ref: "created" } },
    ];
    out.activated.push({ ...a, body: { targets: [opponent, a.body.targets[0]!], effects, text: line.slice("{T}: ".length) }, text: line });
    return true;
  }
  // Durnan of the Yawning Portal: you may exile one creature card of the four, the rest going to the bottom in the order you
  // choose (CR 401.4); you may cast that object for as long as it stays exiled (CR 400.7), with its normal timing and costs
  // (rulings), never playing it as a land (CR 601.3); "That spell has undaunted": {1} less for each opponent (CR
  // 702.125a-b), counted as its total cost is determined (CR 601.2f, rulings).
  if (line === DURNAN) {
    const t = isSpell ? null : parseTrigger(line.slice(0, line.indexOf(" For as long as ")));
    const dig = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfAttacks" || dig?.type !== "dig" || dig.into !== "exile" || dig.rest !== "bottom" || dig.random || !dig.upTo || dig.count !== 1 || dig.play) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...dig, play: "exiled", playCast: true, playUndaunted: true }], text: line.slice("Whenever ~ attacks, ".length) } });
    return true;
  }
  // Judgment of Alexander: a prevention shield for damage to you this turn from sources your opponents control as the damage
  // would be dealt (CR 615.1a). "Whenever damage from a creature is prevented this way" triggers (CR 603.2), once for each
  // creature whose damage it prevents in a damage event, controlled by you; "that creature" is that permanent while it's
  // still that object (CR 400.7). Each commander creature you control (CR 903.3) deals damage equal to its power as the
  // trigger resolves, all at once, each the source of its own damage (CR 120.3).
  if (line === JUDGMENT) {
    const b = isSpell && !out.spell ? parseBody(line.slice(0, line.indexOf(" Whenever "))) : null;
    const rule = b?.effects.length === 1 && b.effects[0]!.type === "damageRule" ? b.effects[0]! : undefined;
    if (!b || b.targets.length || rule?.type !== "damageRule" || rule.rule.to?.players !== "you" || rule.rule.by === undefined || !("filter" in rule.rule.by) || rule.rule.by.filter?.controller !== "opponent") return fail(out, raw);
    const commanders: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", commander: true, text: "commander creature you control" };
    const reflect = { targets: [], effects: [{ type: "bite" as const, a: { ref: "each" as const, filter: commanders }, b: { ref: "subject" as const } }], text: "each commander creature you control deals damage equal to its power to that creature." };
    out.spell = { targets: [], effects: [{ ...rule, rule: { ...rule.rule, reflect, reflectEachCreature: true } }], text: line };
    return true;
  }
  // Volo, Itinerant Scholar: its Journal is a named legendary Book token (CR 111.4, 205.4d) with hexproof and the noting
  // ability; "Volo's Journal" in that ability is the token itself (CR 201.5a).
  const short = d.name.split(" // ")[0]!.split(",")[0]!;
  if (line === `When ~ enters, create ~'s Journal, a legendary colorless Book artifact token with hexproof and "Whenever you cast a creature spell, note one of its creature types that hasn't been noted for ⟪source⟫'s Journal."`) {
    const t = isSpell ? null : parseTrigger("When ~ enters, draw a card.");
    const name = `${short}'s Journal`;
    const ability = `Whenever you cast a creature spell, note one of its creature types that hasn't been noted for ${name}.`;
    if (!t || t === "fail" || t.event !== "selfEnters" || !compileNamedToken(name, ability, ["Artifact"], ["Book"])) return fail(out, raw);
    const token: TokenSpec = { name, named: true, legendary: true, colors: [], types: ["Artifact"], subtypes: ["Book"], keywords: ["Hexproof"], abilities: ability };
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "createToken", who: { ref: "you" }, n: 1, token }], text: line.slice("When ~ enters, ".length) } });
    return true;
  }
  // Volo's Journal: once for each creature spell you cast (CR 603.2), the type chosen as it resolves (Effect noteCreatureType).
  if (line === JOURNAL_NOTE) {
    const t = isSpell ? null : parseTrigger("Whenever you cast a creature spell, draw a card.");
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "you" || t.cast.spell.types?.join() !== "Creature" || t.cast.orCopy) return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "noteCreatureType" }], text: line.slice("Whenever you cast a creature spell, ".length) } });
    return true;
  }
  // Volo: "Draw a card for each creature type noted for target permanent you control named Volo's Journal": a target with
  // that name (CR 201.2), the types noted for it as this resolves.
  if (line === "{2}, {T}: Draw a card for each creature type noted for target permanent you control named ~'s Journal.") {
    const a = isSpell ? null : parseActivated("{2}, {T}: Draw a card.");
    const draw = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || draw?.type !== "draw" || draw.n !== 1) return fail(out, raw);
    const journal: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", named: `${short}'s Journal`, text: `target permanent you control named ${short}'s Journal` };
    out.activated.push({ ...a, body: { targets: [journal], effects: [{ ...draw, n: { count: { kind: "notedTypes", of: { ref: "target", index: 0 } } } }], text: line.slice("{2}, {T}: ".length).replace(/~/g, short) }, text: line });
    return true;
  }
  return false;
}
