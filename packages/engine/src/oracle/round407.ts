// Round 407's triggers (parseTrigger) and whole lines (compile.ts): The Flood of Mars's attack trigger (a creature becomes a
// copy of it, a land an Island), Grub, Notorious Auntie's token copy of the blighted creature, Optimus Prime, Autobot
// Leader's bolster with a delayed convert, and Symbiote Spider-Man's "It gains this card's other abilities".
import type { CompiledCard, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import { parseActivated } from "./activated";
import { compileGranted } from "./grants";
import { parseTrigger } from "./triggers";

const FLOOD = "Whenever ~ attacks, put a flood counter on another target creature or land. If it's a creature, it becomes a copy of ~. If it's a land, it becomes an Island in addition to its other types.";
const GRUB = 'Whenever ~ attacks, you may blight 1. If you do, create a tapped and attacking token that\'s a copy of the blighted creature, except it has "At the beginning of the end step, sacrifice ~."';
const OPTIMUS = "Whenever you attack, bolster 2. The chosen creature gains trample until end of turn. When that creature deals combat damage to a player this turn, convert ~.";

const spec = (types: string[], text: string): TargetSpec => ({ kind: "object", types, notTypes: [], notColors: [], text });

/** The keys a delayed trigger's ability may have (as body.ts FLOATING_KEYS): its event and what it does. */
const plainTrigger = (t: TriggeredAbility) => Object.keys(t).every((k) => k === "event" || k === "body");

/** A triggered ability of round 407's; null when the line isn't one of these. */
export function round407Trigger(raw: string): TriggeredAbility | "fail" | null {
  // The Flood of Mars: "another target creature or land" (CR 115.1). The flood counter has no rules meaning of its own
  // (CR 122.1). Then, one after the other as written (CR 608.2c), each checked on the target as it is then (still a legal
  // one, CR 608.2b): a creature becomes a copy of ~ (CR 707.2: its copiable values now, or as it last existed if it has
  // left, CR 608.2h), and a land becomes an Island in addition to its types (CR 305.7 doesn't apply: no types are set, and
  // the Island type gives it "{T}: Add {U}", CR 305.6). Neither ends (CR 611.2a). A creature land is a creature first, and
  // its copy isn't a land, so it doesn't become an Island (rulings).
  if (raw === FLOOD) {
    const base = parseTrigger("Whenever ~ attacks, put a flood counter on another target creature or land.");
    const t = base && base !== "fail" ? base.body.targets[0] : undefined;
    const put = base && base !== "fail" ? base.body.effects[0] : undefined;
    if (!base || base === "fail" || base.event !== "selfAttacks" || base.body.targets.length !== 1 || t?.kind !== "object" || t.types?.join() !== "Creature,Land" || !t.notSource || base.body.effects.length !== 1 || put?.type !== "counters" || put.counter !== "flood") return "fail";
    const target = { ref: "target" as const, index: 0 };
    const effects: Effect[] = [
      put,
      { type: "if", cond: { kind: "targetIs", index: 0, filter: spec(["Creature"], "creature") }, effects: [{ type: "becomeCopy", what: target, of: { ref: "self" }, duration: "game" }] },
      { type: "if", cond: { kind: "targetIs", index: 0, filter: spec(["Land"], "land") }, effects: [{ type: "continuous", what: target, mods: [{ kind: "addTypes", types: [], subtypes: ["Island"] }], duration: "game" }] },
    ];
    return { ...base, body: { ...base.body, effects, text: raw.replace(/^Whenever ~ attacks, /, "") } };
  }
  // Grub, Notorious Auntie: blighting is putting a -1/-1 counter on a creature you control (CR 701.68a), any of them, Grub
  // too; only with one to put it on (CR 701.68b). "The blighted creature" is the one chosen (CR 701.68c: ObjRef "created",
  // run-zones pick), still on the battlefield even at toughness 0 until the ability has resolved (rulings, CR 704.3). The
  // token copies its copiable values (CR 707.2: as printed, or what it copies; a token as the effect that made it said;
  // {X} as 0, rulings), plus the sacrifice trigger (CR 707.9b); it enters attacking what its controller chooses (CR 508.4),
  // never declared as an attacker (CR 506.3d).
  if (raw === GRUB) {
    const blight = parseTrigger("Whenever ~ attacks, you may blight 1. If you do, draw a card.");
    const copy = parseTrigger('Whenever ~ attacks, you may sacrifice another creature. If you do, create a tapped and attacking token that\'s a copy of the sacrificed creature, except it has "At the beginning of the end step, sacrifice ~."');
    if (!blight || blight === "fail" || !copy || copy === "fail" || blight.event !== "selfAttacks" || blight.body.targets.length || copy.body.targets.length || blight.body.effects.length !== 2 || copy.body.effects.length !== 2) return "fail";
    const may = blight.body.effects[0]!;
    const pick = may.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    const ifDid = copy.body.effects[1]!;
    const token = ifDid.type === "if" && ifDid.cond.kind === "youDid" && ifDid.effects.length === 1 ? ifDid.effects[0] : undefined;
    if (pick?.type !== "pick" || pick.action !== "counters" || pick.counter?.kind !== "-1/-1" || pick.n !== 1 || token?.type !== "createTokenCopy" || token.what.ref !== "sacrificed" || !token.tapped || !token.attacking || token.except?.text?.length !== 1) return "fail";
    const effects: Effect[] = [may, { type: "if", cond: { kind: "youDid" }, effects: [{ ...token, what: { ref: "created" } }] }];
    return { ...blight, body: { targets: [], effects, text: raw.replace(/^Whenever ~ attacks, /, "") } };
  }
  // Optimus Prime, Autobot Leader: once each combat you attack with one or more creatures (CR 508.1m). Bolster 2 chooses as
  // it resolves, not targeting (CR 701.39a, rulings; ObjRef "created" after the pick), and that creature gains trample
  // until end of turn (CR 611.2c). Then a delayed trigger about it (CR 603.7c), for this turn: it triggers each time that
  // creature deals combat damage to a player (CR 603.7b, double strike's twice), its source and controller this ability's
  // (CR 603.7e). It converts ~ (CR 701.28a) only if ~ hasn't transformed or converted since the delayed trigger was made
  // (CR 701.27f, 701.28e: floating trigger `transformsAt`), and not if ~ left the battlefield since (CR 400.7).
  if (raw === OPTIMUS) {
    const base = parseTrigger("Whenever you attack, bolster 2.");
    const bolster = base && base !== "fail" ? base.body.effects[0] : undefined;
    const delayed = parseTrigger("Whenever ~ deals combat damage to a player, convert ~.");
    const conv = delayed && delayed !== "fail" ? delayed.body.effects[0] : undefined;
    if (!base || base === "fail" || base.event !== "creaturesYouControlAttack" || base.body.effects.length !== 1 || bolster?.type !== "pick" || bolster.action !== "counters" || bolster.least !== "toughness" || bolster.counter?.kind !== "+1/+1") return "fail";
    if (!delayed || delayed === "fail" || delayed.event !== "selfDealsCombatDamageToPlayer" || !plainTrigger(delayed) || delayed.body.effects.length !== 1 || conv?.type !== "transform" || !conv.convert || conv.what.ref !== "self") return "fail";
    const effects: Effect[] = [
      bolster,
      { type: "continuous", what: { ref: "created" }, mods: [{ kind: "addKeywords", keywords: ["Trample"] }], duration: "endOfTurn" },
      { type: "floatingTrigger", trigger: delayed, until: "endOfTurn", aboutCreated: true },
    ];
    return { ...base, body: { targets: [], effects, text: raw.replace(/^Whenever you attack, /, "") } };
  }
  return null;
}

const SYMBIOTE = /^(.+): Put a \+1\/\+1 counter on target creature you control\. It gains ~'s other abilities\. Activate only as a sorcery\.$/;

/** One whole line of round 407's (compile.ts); false when it isn't one of these. `others` are the card's other lines. */
export function round407Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, others: string[]): boolean {
  // Symbiote Spider-Man: "Find New Host — {2}{U/B}, Exile this card from your graveyard: Put a +1/+1 counter on target
  // creature you control. It gains this card's other abilities. Activate only as a sorcery." Its other abilities are the
  // card's other lines (abilities as printed, CR 113.1; this one isn't among them), gained by the target for the rest of the
  // game (CR 611.2a), "this creature" in them being that creature (CR 201.5b). Each has to be one the engine runs.
  const m = SYMBIOTE.exec(line);
  if (!m) return false;
  const a = isSpell ? null : parseActivated(`${m[1]!}: Put a +1/+1 counter on target creature you control. Activate only as a sorcery.`);
  const texts = others.map((l) => l.trim()).filter((l) => l);
  const granted = texts.map((t) => compileGranted(t));
  const runs = granted.every((c) => !c.unsupported.length && c.triggers.length + c.activated.length + c.mana.length + c.statics.length + c.textKeywords.length > 0);
  if (!a || a === "fail" || a.zone !== "graveyard" || !a.exileSelf || !a.sorcerySpeed || a.body.targets.length !== 1 || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "counters" || !texts.length || !runs) {
    out.unsupported.push(raw);
    return true;
  }
  const target = { ref: "target" as const, index: 0 };
  const gains: Effect = { type: "continuous", what: target, mods: texts.map((text) => ({ kind: "addAbility" as const, text })), duration: "game" };
  out.activated.push({ ...a, body: { ...a.body, effects: [...a.body.effects, gains], text: line.slice(m[1]!.length + 2).replace(/ Activate only as a sorcery\.$/, "") }, text: line });
  return true;
}
