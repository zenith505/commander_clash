// Round 366's sentences, read before round 365's (round365Sentence in oracle/round365.ts reads these first), and its whole
// lines (compile.ts, after round 365's): a shield on one creature's next combat damage to players that makes Mites from it
// (Ria Ivor, Bane of Bladehold) and a reduction for the next face-down creature spell (Panoptic Projektor).
import type { AbilityBody, CompiledCard, DamageRuleSpec, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody, type Ctx } from "./body";
import { parseTrigger } from "./triggers";
import { round367Sentence } from "./round367";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round366Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 367's sentences first (oracle/round367.ts).
  const r367 = round367Sentence(s, sentences, si, ctx, effects);
  if (r367) return r367;
  const line = plain(s);
  // Panoptic Projektor: "The next face-down creature spell you cast this turn costs {3} less to cast": a reduction for
  // only the next face-down spell its controller casts this turn (a 2/2 creature spell with no other characteristics, CR
  // 708.4, 708.2a), off its {3} (CR 702.37c, 601.2f), used up as that spell becomes cast (CR 601.2i), generic mana only.
  if (ctx.activated && line === "The next face-down creature spell you cast this turn costs {3} less to cast") {
    return {
      effect: { type: "costModThisTurn", mod: { who: "you", filter: { kind: "spell", types: ["Creature"], notTypes: [], notColors: [], text: "face-down creature spell" }, n: -3, faceDown: true, text: `${line}.` }, next: true },
      next: si + 1,
    };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const RIA =
  'At the beginning of combat on your turn, the next time target creature would deal combat damage to one or more players this combat, prevent that damage. If damage is prevented this way, create that many 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and "~ can\'t block."';

const BREATH =
  "When enchanted creature deals combat damage to a player, sacrifice it and attach ~ to a creature you control. If you do, untap all creatures you control and after this phase, there is an additional combat phase.";

const FLICKERFORM =
  "{2}{W}{W}: Exile enchanted creature and all Auras attached to it. At the beginning of the next end step, return that card to the battlefield under its owner's control. If you do, return the other cards exiled this way to the battlefield under their owners' control attached to that creature.";

export function round366Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Flickerform: see runFlickerWithAurasEffect and runReturnAurasAttachedEffect (effects/run-round366.ts).
  if (line === FLICKERFORM) {
    const a = isSpell || out.enchant?.kind !== "object" ? null : parseActivated("{2}{W}{W}: Exile enchanted creature. Return that card to the battlefield under its owner's control.");
    if (!a || a === "fail" || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "flicker" || a.body.targets.length) return fail(out, raw);
    out.activated.push({ ...a, text: line, body: { targets: [], effects: [{ type: "flickerWithAuras" }], text: line.replace(/^\{2\}\{W\}\{W\}: /, "") } });
    return true;
  }
  // Breath of Fury: the creature it enchants, as it deals combat damage to a player, is sacrificed if it's still that
  // permanent and its controller's (CR 701.21a); then ~ is attached to a creature its controller controls, chosen as it
  // resolves (not targeted, CR 701.3a), one it could enchant (CR 303.4a, 701.3b). "If you do": both happened. With no
  // creature to attach it to, nothing else happens, and ~ goes to the graveyard as a state-based action (rulings, CR
  // 704.5m). Then its controller's creatures untap and an additional combat phase follows this one (CR 500.8), with no
  // main phase between.
  if (line === BREATH) {
    const t = isSpell || out.enchant?.kind !== "object" ? null : parseTrigger("Whenever enchanted creature deals combat damage to a player, untap all creatures you control and after this phase, there is an additional combat phase.");
    const sac = isSpell ? null : parseTrigger("When enchanted creature deals combat damage to a player, sacrifice it.");
    if (!t || t === "fail" || !sac || sac === "fail" || t.event !== "selfDealsCombatDamageToPlayer" || t.host !== "attached" || sac.event !== t.event || sac.host !== "attached") return fail(out, raw);
    const [untap, phases] = t.body.effects;
    if (t.body.effects.length !== 2 || untap?.type !== "untap" || phases?.type !== "addPhases" || sac.body.effects.length !== 1 || sac.body.effects[0]!.type !== "sacrifice") return fail(out, raw);
    const body: AbilityBody = {
      targets: [],
      effects: [
        sac.body.effects[0]!,
        { type: "attachToChosen", source: { ref: "self" }, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "a creature you control" } },
        { type: "if", cond: { kind: "attachedThisWay", sacrificed: true }, effects: [untap, phases] },
      ],
      text: "sacrifice it and attach ~ to a creature you control. If you do, untap all creatures you control and after this phase, there is an additional combat phase.",
    };
    out.triggers.push({ ...t, body });
    return true;
  }
  // Yurlok of Scorch Thrash: mana burn for every player, whenever mana empties from their pool (CR 500.4, 106.4) or an
  // effect makes them lose it; not mana that stays or becomes another type (manaKeeping). See manaBurn in game.ts.
  if (line === "A player losing unspent mana causes that player to lose that much life.") {
    if (isSpell) return fail(out, raw);
    out.manaBurn = true;
    return true;
  }
  // Ria Ivor: a prevention shield (CR 615.1a) on the target's combat damage to players, used up by the first combat damage
  // event in which it would deal damage to one or more players this combat (CR 615.8: all of it, first strike's or regular,
  // not its damage to creatures or planeswalkers), ending with this combat (CR 511.3). "If damage is prevented this way,
  // create that many" is part of the prevention effect (CR 615.5), not a trigger: the ability's controller creates one
  // Mite for each 1 damage prevented, right after the damage event. Any creature can be the target.
  if (line === RIA) {
    const t = isSpell ? null : parseTrigger("At the beginning of combat on your turn, tap target creature.");
    const made = parseBody('Create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and "~ can\'t block."', {});
    const token = made?.effects.length === 1 && made.effects[0]!.type === "createToken" ? made.effects[0]!.token : undefined;
    if (!t || t === "fail" || t.event !== "yourBeginCombat" || t.body.targets.length !== 1 || !token) return fail(out, raw);
    const rule: DamageRuleSpec = { combat: "only", by: { target: { ref: "target", index: 0 } }, to: { players: "all" }, nextTime: true, thisCombat: true, tokens: token };
    const body: AbilityBody = {
      targets: t.body.targets,
      effects: [{ type: "damageRule", rule }],
      text: "the next time target creature would deal combat damage to one or more players this combat, prevent that damage. If damage is prevented this way, create that many 1/1 Phyrexian Mite tokens with toxic 1 and \"~ can't block.\"",
    };
    out.triggers.push({ ...t, body });
    return true;
  }
  return false;
}
