// Round 371's whole lines (compile.ts, after round 370's): a dread counter and a transform on the enchantment, not the
// attacker (Grasping Shadows), a sneak cost that makes an exile permanent (Turncoat Kunoichi) and a reflexive return of an
// Aura or Equipment attached to the token just created (Forum Filibuster).
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const SHADOWS = "Whenever a creature you control attacks alone, it gains deathtouch and lifelink until end of turn. Put a dread counter on ~. Then if there are three or more dread counters on it, transform it.";
const KUNOICHI = "When ~ enters, choose target creature an opponent controls. Exile that creature until ~ leaves the battlefield. If ~'s sneak cost was paid, instead exile the chosen creature.";
const FILIBUSTER = "At the beginning of your upkeep, create a 2/1 white and black Inkling creature token with flying. When you do, return up to one target Aura or Equipment card from your graveyard to the battlefield attached to that token.";

export function round371Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Grasping Shadows: "it" in the last sentence is the enchantment the dread counter was just put on, not the attacker (the
  // front face's own counters, which it keeps as it transforms, rulings); the attacker is the one declared alone (CR
  // 506.5), whatever enters attacking later (rulings). Shadows' Lair is the back face (CR 701.27a).
  if (line === SHADOWS) {
    const t = isSpell ? null : parseTrigger(line.replace("dread counters on it, transform it.", "dread counters on ~, transform ~."));
    if (!t || t === "fail" || t.event !== "creatureYouControlAttacksAlone" || t.ifCond || t.body.effects.length !== 3 || t.body.effects[2]!.type !== "if") return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, text: line.slice("Whenever a creature you control attacks alone, ".length) } });
    return true;
  }
  // Turncoat Kunoichi: one target, exiled for good if its sneak cost was paid (CR 702.190a), otherwise until it leaves the
  // battlefield (CR 610.3), not at all if it has already left by then (CR 610.3c, rulings). Whether the cost was paid is
  // read as it resolves, as the permanent last existed if it has left (CR 608.2h). A token exiled is gone for good (CR
  // 111.7, rulings).
  if (line === KUNOICHI) {
    const t = isSpell ? null : parseTrigger("When ~ enters, exile target creature an opponent controls until ~ leaves the battlefield.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || t.ifCond || t.body.targets.length !== 1 || e?.type !== "exile" || e.until !== "sourceLeaves" || !out.altCosts?.some((a) => a.kind === "sneak")) return fail(out, raw);
    const { until: _until, ...forGood } = e;
    const effects: Effect[] = [{ type: "if", cond: { kind: "state", cond: { kind: "self", is: "sneakPaid" } }, effects: [forGood], otherwise: [e] }];
    out.triggers.push({ ...t, body: { ...t.body, effects, text: line.slice("When ~ enters, ".length) } });
    return true;
  }
  // Forum Filibuster: a reflexive ability (CR 603.12) for each Inkling created this way (a token doubler makes two, each
  // with its own), its target chosen as it's put on the stack (rulings). The card returns attached to that token: an Aura
  // only if it could enchant it, else it stays in the graveyard (CR 303.4f-g); an Equipment enters unattached if the
  // token is gone or it can't equip it (CR 301.5b-c).
  if (line === FILIBUSTER) {
    const t = isSpell ? null : parseTrigger("At the beginning of your upkeep, create a 2/1 white and black Inkling creature token with flying. When you do, return up to one target creature card from your graveyard to the battlefield.");
    const r = t && t !== "fail" && t.body.effects.length === 2 ? t.body.effects[1] : undefined;
    const put = r?.type === "reflexive" ? r.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourUpkeep" || r?.type !== "reflexive" || !r.perToken || r.body.targets.length !== 1 || r.body.effects.length !== 1 || put?.type !== "putOntoBattlefield") return fail(out, raw);
    const target = { kind: "card" as const, types: [], notTypes: [], notColors: [], subtypes: ["Aura", "Equipment"], owner: "you" as const, text: "target Aura or Equipment card from your graveyard", optional: true as const };
    const reflexive: Effect = { ...r, perTokenSubject: true, body: { targets: [target], effects: [{ ...put, attachToSubject: true }], text: "Return up to one target Aura or Equipment card from your graveyard to the battlefield attached to that token." } };
    out.triggers.push({ ...t, body: { ...t.body, effects: [t.body.effects[0]!, reflexive], text: line.slice("At the beginning of your upkeep, ".length) } });
    return true;
  }
  return false;
}
