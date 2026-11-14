// Round 368's sentences, read before round 367's (round367Sentence in oracle/round367.ts reads these first), and its whole
// lines (compile.ts, after round 367's): a creature growing by how much bigger the creature that died was (Drizzt
// Do'Urden), an Aura traded for a copy of it on each other attacker (Three Dog, Galaxy News DJ) and mana that finds a
// cheaper instant or sorcery for the next spell (Codie, Vociferous Codex).
import type { AbilityBody, Amount, CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseManaAbility } from "./mana-abilities";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round368Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void sentences;
  void effects;
  // Gorex, the Tombshell: "choose a card at random exiled with ~ and put that card into its owner's hand": one of the cards
  // linked to it still in exile (CR 607.2a, 607.2q), as it is or as it last existed for "dies" (CR 603.10a).
  if (/^[Cc]hoose a card at random exiled with ~ and put that card into its owner's hand\.?$/.test(s)) {
    if (ctx.spell) return "fail";
    return { effect: { type: "moveLinked", dest: "hand", one: true, random: true }, next: si + 1 };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const DRIZZT = "Whenever a creature dies, if it had power greater than ~'s power, put a number of +1/+1 counters on ~ equal to the difference.";

const GOREX_COST = "As an additional cost to cast ~, you may exile any number of creature cards from your graveyard. ~ costs {2} less to cast for each card exiled this way.";
/** Round 368's additional costs, read before the other "As an additional cost to cast ~" lines (compile.ts). */
export function round368Cost(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Gorex, the Tombshell: how many is announced as it's cast, none too (CR 601.2b, 107.3a), the cards chosen and exiled as
  // the costs are paid (CR 601.2h); a reduction of {2} of generic mana each, after its other costs are added (commander
  // tax too), never below {B}{B}, and more may be exiled than reduce it (rulings, CR 601.2f). The cards are linked to the
  // permanent it becomes (CR 607.2q).
  if (line === GOREX_COST) {
    if (isSpell || out.sacrificedReduction !== undefined || out.additionalCosts?.some((c) => "x" in c && c.x)) return fail(out, raw);
    (out.additionalCosts ??= []).push({ kind: "exileFromGraveyard", n: 0, x: true, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, linkSpell: true });
    out.sacrificedReduction = 2;
    out.costExileLinked = true;
    return true;
  }
  return false;
}

const CODIE = "{4}, {T}: Add {W}{U}{B}{R}{G}. When you next cast a spell this turn, exile cards from the top of your library until you exile an instant or sorcery card with lesser mana value. Until end of turn, you may cast that card without paying its mana cost. Put each other card exiled this way on the bottom of your library in a random order.";
const THREE_DOG = "Whenever you attack, you may pay {2} and sacrifice an Aura attached to ~. When you sacrifice an Aura this way, for each other attacking creature you control, create a token that's a copy of that Aura attached to that creature.";

export function round368Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Drizzt Do'Urden: any creature, ~ too, dying (CR 700.4); an intervening if (CR 603.4) on its power as it last existed on
  // the battlefield (CR 603.10a) against ~'s power now, or as ~ last existed if it has left, checked as it triggers and
  // again as it resolves, so of several creatures dying at once some may put nothing by then (rulings). The counters are
  // the difference as it resolves (CR 608.2h).
  if (line === DRIZZT) {
    const t = isSpell ? null : parseTrigger("Whenever a creature dies, put a +1/+1 counter on ~.");
    const put = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "permanentDies" || t.ifCond || t.body.effects.length !== 1 || put?.type !== "counters" || put.what.ref !== "self") return fail(out, raw);
    const n: Amount = { count: { kind: "difference", of: [{ kind: "power", of: { ref: "subject" } }, { kind: "power", of: { ref: "self" } }] } };
    out.triggers.push({ ...t, ifCond: { kind: "subjectPT", stat: "power", greaterThanSource: true }, body: { ...t.body, effects: [{ ...put, n }], text: "put a number of +1/+1 counters on ~ equal to the difference." } });
    return true;
  }
  // Three Dog, Galaxy News DJ: once each combat you attack with one or more creatures (CR 508.3d), Three Dog among them or
  // not; then, as it resolves, both payments or neither: {2} and an Aura you control attached to ~ (you can only sacrifice
  // your own permanents, CR 701.21a), not asked without one. Sacrificing one is a reflexive trigger (CR 603.12) carrying
  // the Aura as it last existed; see runAuraCopiesOnAttackersEffect (effects/run-round368.ts).
  if (line === THREE_DOG) {
    const t = isSpell ? null : parseTrigger("Whenever you attack, draw a card.");
    if (!t || t === "fail" || t.event !== "creaturesYouControlAttack" || t.ifCond) return fail(out, raw);
    const aura = { kind: "object" as const, types: ["Enchantment"], subtypes: ["Aura"], notTypes: [], notColors: [], controller: "you" as const, attachedTo: { kind: "object" as const, objectId: "~", text: "~" }, text: "Aura attached to ~" };
    const copies = "for each other attacking creature you control, create a token that's a copy of that Aura attached to that creature.";
    const body: AbilityBody = {
      targets: [],
      effects: [
        { type: "may", pay: { mana: "{2}" }, effects: [{ type: "pick", who: { ref: "you" }, filter: aura, n: 1, action: "sacrifice" }], text: "pay {2} and sacrifice an Aura attached to ~" },
        { type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ type: "reflexive", sacrificed: true, body: { targets: [], effects: [{ type: "auraCopiesOnAttackers" }], text: copies } }] },
      ],
      text: "you may pay {2} and sacrifice an Aura attached to ~. When you sacrifice an Aura this way, " + copies,
    };
    out.triggers.push({ ...t, body });
    return true;
  }
  // Codie, Vociferous Codex: a mana ability (CR 605.1a), activated while casting a spell too, that spell being the next
  // one (rulings); its delayed trigger (CR 603.7) resolves before that spell, even if the spell is countered (rulings).
  // The card found is cast later this turn, with its usual timing, for free (alternative costs can't be used, CR 118.9);
  // with none found, every card exiled goes back in a random order (rulings). See exileUntilNonland `lesserThanCause`.
  if (line === CODIE) {
    const m = isSpell ? null : parseManaAbility("{4}, {T}: Add {W}{U}{B}{R}{G}. When you next cast a spell this turn, draw a card.");
    if (!m?.nextCast || m.nextCast.filter.types?.length || m.nextCast.filter.notTypes?.length) return fail(out, raw);
    const text = "exile cards from the top of your library until you exile an instant or sorcery card with lesser mana value. Until end of turn, you may cast that card without paying its mana cost. Put each other card exiled this way on the bottom of your library in a random order.";
    out.mana.push({ ...m, text: line, nextCast: { ...m.nextCast, effects: [{ type: "exileUntilNonland", untilTypes: ["Instant", "Sorcery"], lesserThanCause: true, then: "freeThisTurn", restBottom: true }], text } });
    return true;
  }
  return false;
}
