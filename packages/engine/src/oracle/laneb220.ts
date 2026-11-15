// Lane B round B220's lines, read by compileCard before its triggers and activated abilities (after round B219's), and its
// whole spells (chained from round B219's).
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB220Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Spirit-Sister's Call: "At the beginning of your end step, choose target permanent card in your graveyard. You may
  // sacrifice a permanent that shares a card type with the chosen card. If you do, return the chosen card from your
  // graveyard to the battlefield and it gains "If this permanent would leave the battlefield, exile it instead of putting it
  // anywhere else."": the card types compared as the trigger resolves (CR 205.2a), Spirit-Sister's Call itself allowed; with
  // the target gone the ability does nothing (CR 608.2b). The returned permanent gains the replacement ability for good (as
  // Geth, Thane of Contracts grants it, CR 614.1a, 611.2a), which keeps working once Spirit-Sister's Call has left
  // (rulings); exiled instead, a creature doesn't die (rulings, CR 700.4).
  if (!isSpell && line === "At the beginning of your end step, choose target permanent card in your graveyard. You may sacrifice a permanent that shares a card type with the chosen card. If you do, return the chosen card from your graveyard to the battlefield and it gains \"If ~ would leave the battlefield, exile it instead of putting it anywhere else.\"") {
    const t = trig("At the beginning of your end step, return target permanent card from your graveyard to the battlefield. It gains \"If this permanent would leave the battlefield, exile it instead of putting it anywhere else.\"");
    const [put, gains] = t?.body.effects ?? [];
    const sac = parseBody("You may sacrifice a permanent. If you do, draw a card.", {});
    const [may, ifDid] = sac?.effects ?? [];
    const pick = may?.type === "may" ? may.effects[0] : undefined;
    if (!t || t.event !== "yourEndStep" || t.body.targets.length !== 1 || t.body.effects.length !== 2 || put?.type !== "putOntoBattlefield" || gains?.type !== "continuous" || may?.type !== "may" || may.effects.length !== 1 || pick?.type !== "pick" || pick.action !== "sacrifice" || ifDid?.type !== "if" || ifDid.cond.kind !== "youDid") return fail();
    const sacrifice: Effect = { ...pick, filter: { ...pick.filter, text: "permanent that shares a card type with the chosen card" }, sharesCardTypeWithTarget: 0 };
    const text = line.replace(/^At the beginning of your end step, /, "").replace("If ~ would leave", "If this permanent would leave");
    const body = { targets: t.body.targets, effects: [{ ...may, effects: [sacrifice], text: "sacrifice a permanent that shares a card type with the chosen card" }, { ...ifDid, effects: [put, gains] }], text };
    out.triggers.push({ ...t, body });
    return true;
  }
  return false;
}

/** Round B220's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB220Spell(text: string): AbilityBody | null | undefined {
  // Fervent Mastery: "If the {2}{R}{R} cost was paid, an opponent discards any number of cards, then draws that many cards.
  // Search your library for up to three cards, put them into your hand, shuffle, then discard three cards at random.": its
  // one "rather than pay" cost (CR 118.9, the Mastery check in compileCard); you choose the opponent as it resolves (rulings),
  // who chooses how many and which cards, none too (rulings, CR 107.1c), then draws as many as they discarded (Steal the
  // Show's same instruction); then your search, the shuffle (CR 701.23a) and three cards at random from your hand (CR 701.9b).
  if (text === "If the {2}{R}{R} cost was paid, an opponent discards any number of cards, then draws that many cards. Search your library for up to three cards, put them into your hand, shuffle, then discard three cards at random.") {
    const rest = parseBody("Search your library for up to three cards, put them into your hand, then shuffle. Discard three cards at random.", { spell: true });
    if (!rest || rest.targets.length || rest.effects.length !== 2 || rest.effects[0]!.type !== "search" || rest.effects[1]!.type !== "discard") return null;
    const them = { ref: "chosenPlayer" as const };
    const paid: Effect = {
      type: "if",
      cond: { kind: "altPaid", alt: "alternative" },
      effects: [{ type: "choose", choice: "opponent" }, { type: "discard", who: them, n: 99, upTo: true }, { type: "draw", who: them, n: { count: { kind: "discardedThisWay", who: them } } }],
    };
    return { targets: [], effects: [paid, ...rest.effects], text };
  }
  // Jailbreak: "Return target permanent card in an opponent's graveyard to the battlefield under their control. When that
  // permanent enters, return up to one target permanent card with equal or lesser mana value from your graveyard to the
  // battlefield.": the card comes back under its owner's control (the opponent whose graveyard it's in); the second target is
  // chosen only once it has entered, and with none entered there is none (rulings): a delayed triggered ability the spell
  // creates (CR 603.7a), triggering at once on that entering, as a reflexive one does (CR 603.12); X is the mana value of the
  // permanent put onto the battlefield this way, as it is there when it triggers (CR 202.3).
  if (text === "Return target permanent card in an opponent's graveyard to the battlefield under their control. When that permanent enters, return up to one target permanent card with equal or lesser mana value from your graveyard to the battlefield.") {
    const first = parseBody("Return target permanent card from an opponent's graveyard to the battlefield under its owner's control.", { spell: true });
    const back = parseBody("Return up to one target permanent card with mana value X or less from your graveyard to the battlefield.", { spell: true });
    const put = first?.effects[0];
    if (!first || first.targets.length !== 1 || first.effects.length !== 1 || put?.type !== "putOntoBattlefield" || !back || back.targets.length !== 1) return null;
    const backTargets = back.targets.map((t) => ({ ...t, text: "target permanent card with equal or lesser mana value from your graveyard" }));
    const reflexive: Effect = { type: "reflexive", body: { ...back, targets: backTargets, text: "Return up to one target permanent card with equal or lesser mana value from your graveyard to the battlefield." }, putThisWay: true, xPutMv: true };
    return { targets: first.targets, effects: [put, reflexive], text };
  }
  // Cultural Exchange: "Choose any number of creatures target player controls. Choose the same number of creatures another
  // target player controls. Those players exchange control of those creatures.": no creature is targeted, only the two
  // players (CR 115.1); see Effect exchangeGroups.
  if (text === "Choose any number of creatures target player controls. Choose the same number of creatures another target player controls. Those players exchange control of those creatures.") {
    const two = parseBody("Draw a card for each creature target player controls, then draw a card for each creature another target player controls.", { spell: true });
    if (!two || two.targets.length !== 2 || two.targets.some((t) => t.kind !== "player") || two.targets[1]!.distinctFrom?.[0] !== 0) return null;
    return { targets: two.targets, effects: [{ type: "exchangeGroups", a: { ref: "target", index: 0 }, b: { ref: "target", index: 1 } }], text };
  }
  return undefined;
}
