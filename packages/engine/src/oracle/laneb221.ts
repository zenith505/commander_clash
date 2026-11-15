// Lane B round B221's lines, read by compileCard before its triggers and activated abilities (after round B220's), and its
// whole spells (chained from round B220's).
import type { AbilityBody, CompiledCard, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";
import { roundB222Spell } from "./laneb222";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

const DESECRATOR = "When ~ enters or dies, exile another card from a graveyard. When you do, choose one — • Remove X counters from target permanent, where X is the mana value of the exiled card. • Target creature an opponent controls gets -X/-X until end of turn, where X is the mana value of the exiled card.";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB221Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Cemetery Desecrator: "When ~ enters or dies, exile another card from a graveyard. When you do, choose one — • Remove X
  // counters from target permanent, where X is the mana value of the exiled card. • Target creature an opponent controls
  // gets -X/-X until end of turn, where X is the mana value of the exiled card.": two triggers (CR 603.2). The card is
  // chosen as the trigger resolves, from any graveyard (not a target, as Cemetery Prowler's), and isn't ~'s own card (in the
  // graveyard when it died; Resplendent Marshal's "another"). Exiling one triggers the reflexive ability (CR 603.12), whose
  // mode and target are chosen as it's put on the stack, not before the card is exiled (rulings); with no other card in any
  // graveyard nothing is exiled and it doesn't trigger. X is the exiled card's mana value as it is in exile (CR 202.3). Its
  // controller chooses which counters are removed, of any kinds, and all of them if there are fewer than X (rulings).
  if (!isSpell && line === DESECRATOR) {
    const both = [trig("When ~ enters, exile a card from a graveyard."), trig("When ~ dies, exile a card from a graveyard.")];
    // The reflexive ability's modes with X its own (the x it carries, CR 603.12), read as Hylda of the Icy Crown's are.
    const shape = trig("When ~ enters, you may pay {X}. When you do, choose one — • Remove X counters from target permanent. • Target creature an opponent controls gets -X/-X until end of turn.");
    const may = shape?.body.effects[0];
    const reflexive = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    const modal = reflexive?.type === "reflexive" ? reflexive.body.modal : undefined;
    if (both.some((t) => !t) || !modal || modal.modes.length !== 2 || modal.modes[0]!.effects[0]?.type !== "removeAnyCounters" || modal.modes[1]!.effects[0]?.type !== "continuous") return fail();
    const bullets = DESECRATOR.replace(/^.*? choose one — /, "").split("•").map((b) => b.trim()).filter(Boolean);
    const body: AbilityBody = { targets: [], effects: [], text: `Choose one — ${bullets.map((b) => `• ${b}`).join(" ")}`, modal: { ...modal, modes: modal.modes.map((m, i) => ({ ...m, text: bullets[i]! })) } };
    const mv = { count: { kind: "manaValue" as const, of: { ref: "chosenFromYard" as const } } };
    for (const t of both as TriggeredAbility[]) {
      const [pick] = t.body.effects;
      if (t.body.effects.length !== 1 || pick?.type !== "chooseFromGraveyard" || !pick.anyGraveyard || pick.dest !== "exile" || pick.n !== 1 || pick.upTo || pick.filter || pick.who) return fail();
      out.triggers.push({ ...t, body: { targets: [], effects: [{ ...pick, notSelf: true }, { type: "reflexive", body, aboutYardChosen: true, xAmount: mv }], text: DESECRATOR.replace(/^When ~ enters or dies, /, "") } });
    }
    return true;
  }
  // Callous Oppressor: "As ~ enters, an opponent chooses a creature type.": its controller chooses which opponent (as a
  // tribute player is chosen, CR 702.104a), then that opponent chooses the type, as it enters (CR 614.12); its "{T}: Gain
  // control of target creature that isn't of the chosen type for as long as ~ remains tapped." is read below.
  if (!isSpell && line === "As ~ enters, an opponent chooses a creature type.") {
    (out.entersChoose ??= []).push({ what: "creatureType", byOpponent: true });
    return true;
  }
  // "{T}: Gain control of target creature that isn't of the chosen type for as long as ~ remains tapped.": the type chosen as
  // ~ entered (none chosen: any creature); a changeling creature is of every type, so it can't be targeted (CR 702.73a).
  // The control ends once ~ untaps or leaves the battlefield, or its controller changes (CR 611.2b).
  if (!isSpell && line === "{T}: Gain control of target creature that isn't of the chosen type for as long as ~ remains tapped.") {
    const a = parseActivated("{T}: Gain control of target creature for as long as ~ remains tapped.");
    const t = a && a !== "fail" ? a.body.targets[0] : undefined;
    if (!a || a === "fail" || a.body.targets.length !== 1 || t?.kind !== "object") return fail();
    const target: TargetSpec = { ...t, chosen: "notType", text: "target creature that isn't of the chosen type" };
    out.activated.push({ ...a, body: { ...a.body, targets: [target], text: "Gain control of target creature that isn't of the chosen type for as long as ~ remains tapped." }, text: line });
    return true;
  }
  return false;
}

/** Round B221's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB221Spell(text: string): AbilityBody | null | undefined {
  // Terminal Velocity: "You may put an artifact or creature card from your hand onto the battlefield. That permanent gains
  // haste, "When this permanent leaves the battlefield, it deals damage equal to its mana value to each creature," and "At
  // the beginning of your end step, sacrifice this permanent."": all three for good (CR 611.2a), the permanent's own
  // abilities, so "your" end step is its controller's; the damage is its mana value as it last existed on the battlefield
  // (rulings, CR 608.2h), an {X} in its cost counting 0 (CR 202.3e).
  if (text === "You may put an artifact or creature card from your hand onto the battlefield. That permanent gains haste, \"When ~ leaves the battlefield, it deals damage equal to its mana value to each creature,\" and \"At the beginning of your end step, sacrifice ~.\"") {
    const body = parseBody("You may put an artifact or creature card from your hand onto the battlefield. It gains haste. It gains \"When ~ leaves the battlefield, it deals damage equal to its mana value to each creature.\" It gains \"At the beginning of your end step, sacrifice ~.\"", { spell: true });
    const [put, leaves, sac] = body?.effects ?? [];
    if (!body || body.targets.length || body.effects.length !== 3 || put?.type !== "putFromHand" || put.haste !== "game" || leaves?.type !== "continuous" || sac?.type !== "continuous" || leaves.duration !== "game" || sac.duration !== "game") return null;
    return { ...body, text };
  }
  // Storyweave: "Choose one — • Put two +1/+1 counters on target creature you control. • Put two lore counters on target Saga
  // you control. The next time one or more enchantment creatures you control enter this turn, each enters with two
  // additional +1/+1 counters on it.": the lore counters may trigger chapter abilities (CR 714.2b); then a replacement effect
  // for the next event this turn in which enchantment creatures enter under your control (CR 614.1c), each of them that is
  // one as it would enter (CR 614.12) getting two more +1/+1 counters, through the other replacements on counters (CR 614.1);
  // used up by that event (Effect nextEntersCounters).
  if (text === "Choose one — • Put two +1/+1 counters on target creature you control. • Put two lore counters on target Saga you control. The next time one or more enchantment creatures you control enter this turn, each enters with two additional +1/+1 counters on it.") {
    const body = parseBody("Choose one — • Put two +1/+1 counters on target creature you control. • Put two lore counters on target Saga you control.", { spell: true });
    const modes = body?.modal?.modes;
    if (!body || !modes || modes.length !== 2 || modes[1]!.effects.length !== 1 || modes[1]!.effects[0]!.type !== "counters" || modes[1]!.targets.length !== 1) return null;
    const next: Effect = { type: "nextEntersCounters", allTypes: ["Enchantment", "Creature"], counter: "+1/+1", n: 2 };
    const second = { ...modes[1]!, effects: [...modes[1]!.effects, next], text: "Put two lore counters on target Saga you control. The next time one or more enchantment creatures you control enter this turn, each enters with two additional +1/+1 counters on it." };
    return { ...body, text, modal: { ...body.modal!, modes: [modes[0]!, second] } };
  }
  return roundB222Spell(text);
}
