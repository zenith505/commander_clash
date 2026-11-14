// Round 365's sentences, read before round 364's (round364Sentence in oracle/round364.ts reads these first), and its whole
// lines (compile.ts, after round 364's): an Aura that follows whoever attacks you and drains the player it enchants
// (Archnemesis), an artifact that trades each cast creature for the ones it held (Mirror of Life Trapping), a shield whose
// reflexive trigger answers the damage it prevented (New Way Forward), attack triggers that shrink or pump attackers
// (Mirkwood Trapper) and a creature phased out until its source leaves (The Moment).
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round365Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  // The Moment: "{2}, {T}: Untap target creature you control. It phases out until ~ leaves the battlefield.": the target
  // untapped, then phased out (CR 702.26) without phasing in during its controller's untap steps, only right after ~
  // leaves the battlefield (rulings, CR 610.3), as it was (not tapped, unlike Oubliette's). If ~ has already left as this
  // resolves, the creature is untapped but doesn't phase out (rulings).
  if (ctx.activated && line === "It phases out until ~ leaves the battlefield") {
    const last = effects.at(-1);
    if (sentences.length !== si + 1 || effects.length !== 1 || last?.type !== "untap" || last.what.ref !== "target" || ctx.targets.length !== 1) return "fail";
    return { effect: { type: "phaseOut", what: last.what, untilSourceLeaves: true, noTap: true }, next: si + 1 };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const ARCHNEMESIS_ATTACK = "Whenever you attack enchanted player, that player loses 2 life. You draw a card and gain 2 life.";
const ARCHNEMESIS_MOVE = "Whenever a player attacks you, you may attach ~ to that player.";
const MIRROR = "Whenever a creature enters, if it was cast, exile it, then return all other permanent cards exiled with ~ to the battlefield under their owners' control.";
const NEW_WAY =
  "The next time a source of your choice would deal damage to you this turn, prevent that damage. When damage is prevented this way, ~ deals that much damage to that source's controller and you draw that many cards.";
const TRAPPER_YOU = "Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn.";
const TRAPPER_OTHER = "Whenever a player attacks, if they aren't attacking you, that player chooses an attacking creature. It gets +2/+0 until end of turn.";

const PERMANENT_CARD: TargetSpec = { kind: "card", types: ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"], notTypes: [], notColors: [], text: "permanent card" };

export function round365Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Archnemesis: "Whenever you attack enchanted player": once each combat you attack the player it enchants with one or
  // more creatures (CR 508.3e), not their planeswalkers or battles; "that player" is them.
  if (line === ARCHNEMESIS_ATTACK) {
    const t = isSpell || out.enchant?.kind !== "player" ? null : parseTrigger("Whenever you attack a player, that player loses 2 life. You draw a card and gain 2 life.");
    if (!t || t === "fail" || t.event !== "creaturesYouControlAttack" || !t.perPlayer || t.body.effects.length !== 3) return fail(out, raw);
    out.triggers.push({ ...t, attacksEnchanted: true, body: { ...t.body, text: "that player loses 2 life. You draw a card and gain 2 life." } });
    return true;
  }
  // Archnemesis: "Whenever a player attacks you": only an opponent can (CR 506.2), with one or more creatures attacking you,
  // not your planeswalkers or battles (CR 508.3e). It moves to that player as the trigger resolves if it's still on the
  // battlefield and could enchant them (enchant opponent, CR 702.5d, 701.3b); a new timestamp (CR 701.3c).
  if (line === ARCHNEMESIS_MOVE) {
    const t = isSpell || out.enchant?.kind !== "player" ? null : parseTrigger("Whenever an opponent attacks you, draw a card.");
    if (!t || t === "fail" || t.event !== "opponentAttacksYou") return fail(out, raw);
    const body: AbilityBody = { targets: [], effects: [{ type: "may", effects: [{ type: "attachSelfToPlayer", who: { ref: "eventPlayer" } }], text: "attach ~ to that player" }], text: "you may attach ~ to that player." };
    out.triggers.push({ ...t, body });
    return true;
  }
  // Mirror of Life Trapping: any creature entering from the stack as a resolved spell, whoever cast it (not a copy of a
  // spell, CR 707.10, nor one put onto the battlefield): an intervening if (CR 603.4) on how it got there, which can't
  // change. It's exiled linked to ~ (CR 607.2a), then every other card still exiled with ~ returns under its owner's
  // control (CR 110.2a), all at once. If the creature is no longer on the battlefield, it isn't exiled, and the others
  // still return. The cards it holds are linked to this object only: after ~ leaves, they stay exiled (CR 607.2a, 400.7).
  if (line === MIRROR) {
    const t = isSpell ? null : parseTrigger("Whenever a creature enters, exile it.");
    if (!t || t === "fail" || t.event !== "permanentEnters" || !t.enters || t.body.effects.length !== 1) return fail(out, raw);
    const body: AbilityBody = {
      targets: [],
      effects: [
        { type: "exile", what: { ref: "subject" }, linked: true },
        { type: "moveLinked", dest: "battlefield", ownersControl: true, filter: PERMANENT_CARD, exceptLinkedNow: true },
      ],
      text: "exile it, then return all other permanent cards exiled with ~ to the battlefield under their owners' control.",
    };
    out.triggers.push({ ...t, enters: { ...t.enters, ifCast: true }, body });
    return true;
  }
  // New Way Forward: the source chosen as it resolves (CR 609.7a, rulings), a shield for its next damage to you this turn
  // (CR 615.8), prevention (615.1a). "When damage is prevented this way" is a reflexive trigger of New Way Forward (CR
  // 603.12), on the stack after the damage event, "that much" the damage prevented; "that source's controller" whoever
  // controls the source as it resolves while it's still that object, otherwise its controller as the damage was prevented.
  if (line === NEW_WAY) {
    if (!isSpell || out.spell) return fail(out, raw);
    const reflect: AbilityBody = {
      targets: [],
      effects: [
        { type: "damage", amount: { count: { kind: "eventAmount" } }, to: { ref: "eventPlayer" } },
        { type: "draw", who: { ref: "you" }, n: { count: { kind: "eventAmount" } } },
      ],
      text: "~ deals that much damage to that source's controller and you draw that many cards.",
    };
    out.spell = { targets: [], effects: [{ type: "damageRule", rule: { by: { choose: { kind: "object", text: "source" } }, to: { players: "you" }, nextTime: true, reflect } }], text: line };
    return true;
  }
  // Mirkwood Trapper: "Whenever a player attacks you": as Archnemesis's; any attacking creature may be the target.
  if (line === TRAPPER_YOU) {
    const t = isSpell ? null : parseTrigger(TRAPPER_YOU.replace(/^Whenever a player attacks you, /, "Whenever an opponent attacks you, "));
    if (!t || t === "fail" || t.event !== "opponentAttacksYou" || t.body.targets.length !== 1) return fail(out, raw);
    out.triggers.push(t);
    return true;
  }
  // Mirkwood Trapper: "Whenever a player attacks, if they aren't attacking you": any player's attack (CR 508.3d), yours too,
  // with no creature attacking you (one attacking your planeswalker or a battle you protect isn't, rulings), checked as it
  // triggers and as it resolves (CR 603.4). The attacking player chooses as it resolves among the attacking creatures (not
  // targeted), and that one gets +2/+0.
  if (line === TRAPPER_OTHER) {
    if (isSpell) return fail(out, raw);
    const attacking: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], combat: "attacking", text: "attacking creature" };
    const body: AbilityBody = {
      targets: [],
      effects: [
        { type: "pick", who: { ref: "eventPlayer" }, filter: attacking, n: 1, action: "choose", anyController: true },
        { type: "continuous", what: { ref: "created" }, mods: [{ kind: "modifyPT", power: 2, toughness: 0 }], duration: "endOfTurn" },
      ],
      text: "that player chooses an attacking creature. It gets +2/+0 until end of turn.",
    };
    out.triggers.push({ event: "creaturesYouControlAttack", body, anyoneAttacks: true, ifCond: { kind: "notAttackingYou" } });
    return true;
  }
  return false;
}
