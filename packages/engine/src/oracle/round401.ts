// Round 401's sentences (read first by round373Sentence) and whole lines (compile.ts, after round 400's): Ogre
// Battlecaster's cast from your graveyard with an added cost and its "when you cast that spell" reflexive trigger.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { reflexiveBody } from "./body";
import { parseCardTarget } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 401's, read before round 400's. */
export function round401Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Ogre Battlecaster: "you may cast target instant or sorcery card from your graveyard by paying {R}{R} in addition to its
  // other costs. If that spell would be put into a graveyard, exile it instead. When you cast that spell, ~ gets +X/+0
  // until end of turn, where X is that spell's mana value.": cast as the trigger resolves or not at all, timing ignored
  // (rulings, CR 608.2g), paying its mana cost and {R}{R} more, an additional cost (CR 118.8, 601.2f); then a reflexive
  // trigger on that cast (CR 603.12), its X the spell's mana value (CR 202.3).
  // Mairsil, the Pretender: "you may exile an artifact or creature card from your hand or graveyard and put a cage counter
  // on it": a card of yours chosen as it resolves, not targeted, or none (Effect exileFromHandOrYard).
  if (plain(s) === "you may exile an artifact or creature card from your hand or graveyard and put a cage counter on it")
    return { effect: { type: "exileFromHandOrYard", filter: { kind: "card", types: ["Artifact", "Creature"], notTypes: [], notColors: [], text: "artifact or creature card" }, counters: { cage: 1 } }, next: si + 1 };
  // Kylox's Voltstrider: "you may cast an instant or sorcery spell from among cards exiled with it. If that spell would be
  // put into a graveyard, put it on the bottom of its owner's library instead.": as the trigger resolves or not at all,
  // timing ignored, paying its costs (rulings, CR 608.2g); the cards its collect evidence cost exiled (CR 607.2a, linked in
  // compile.ts linkExile); the spell's types as it's cast; then a replacement on that spell (CR 614.1a).
  if (/^[Yy]ou may cast an instant or sorcery spell from among cards exiled with (?:it|~)$/.test(plain(s))) {
    if (plain(sentences[si + 1]) !== "If that spell would be put into a graveyard, put it on the bottom of its owner's library instead") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, fromLinked: true, max: 1, filter: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" }, asSpell: true, paid: true, bottomCast: true, evidenceLinked: true }, next: si + 2 };
  }
  const cast = /^[Yy]ou may cast (target instant or sorcery card from your graveyard) by paying ((?:\{[WUBRGC0-9]\})+) in addition to its other costs$/.exec(plain(s));
  if (!cast) return null;
  if (plain(sentences[si + 1]) !== "If that spell would be put into a graveyard, exile it instead") return "fail";
  const before = ctx.targets.length;
  const what = parseCardTarget(cast[1]!, ctx, "you");
  const t = ctx.targets[before];
  if (what?.ref !== "target" || ctx.targets.length !== before + 1 || t?.kind !== "card" || t.types?.join() !== "Instant,Sorcery") return "fail";
  effects.push({ type: "castNow", what, exileAfter: true, addedMana: cast[2]! });
  const when = /^When you cast that spell, (~ gets \+X\/\+0 until end of turn), where X is that spell's mana value$/.exec(plain(sentences[si + 2]));
  if (!when) return "fail";
  const body = reflexiveBody(when[1]!, ctx, false, false, true);
  if (!body) return "fail";
  return { effect: { type: "reflexive", body, xCastMv: true }, next: si + 3 };
}

/** One whole line of round 401's (compile.ts); false when it isn't one of these. */
export function round401Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Mairsil, the Pretender: "~ has all activated abilities of all cards you own in exile with cage counters on them. You may
  // activate each of those abilities only once each turn.": as Rex, Cyber-Hound's (CompiledCard.borrows exiledWithCounter),
  // only cards its controller owns (rulings), each borrowed ability once each turn, each card's an instance of its own
  // (rulings; ActivatedAbility.onceKey). Their printed activated abilities, mana abilities among them (rulings, CR 605.1a).
  if (line === "~ has all activated abilities of all cards you own in exile with cage counters on them. You may activate each of those abilities only once each turn.") {
    if (isSpell || out.borrows) out.unsupported.push(raw);
    else out.borrows = { filter: { kind: "card", types: [], notTypes: [], notColors: [], text: "cards" }, exiledWithCounter: "cage", owned: true, oncePerTurn: true };
    return true;
  }
  return false;
}
