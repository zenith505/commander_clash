// Lane B round B210's lines, read by compileCard before its triggers and activated abilities (after round B209's), and
// its whole spells, read after round B206's.
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";
import { compileGranted, playerMark, SPELL_CONTROLLER } from "./grants";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB210Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Thought Lash: "When a player doesn't pay ~'s cumulative upkeep, that player exiles all cards from their library.": it
  // triggers as the upkeep goes unpaid, before ~ is sacrificed, and resolves after (rulings); that player is the one who
  // didn't pay (CR 702.24a), their whole library exiled.
  if (line === "When a player doesn't pay ~'s cumulative upkeep, that player exiles all cards from their library.") {
    out.triggers.push({ event: "selfCumulativeUpkeepUnpaid", body: { targets: [], effects: [{ type: "exileGraveyard", who: { ref: "eventPlayer" }, library: true }], text: "that player exiles all cards from their library." } });
    return true;
  }
  // Mystic Barrier: "When ~ enters and at the beginning of your upkeep, choose left or right.": two triggers, each choice
  // kept on the permanent as the last chosen direction while it's still that object (CR 400.7); before the first one
  // resolves no direction is chosen, so it restricts nothing (as Pramikon's rulings).
  if (line === "When ~ enters and at the beginning of your upkeep, choose left or right.") {
    const enters = parseTrigger("When ~ enters, draw a card.");
    const upkeep = parseTrigger("At the beginning of your upkeep, draw a card.");
    if (!enters || enters === "fail" || enters.event !== "selfEnters" || !upkeep || upkeep === "fail" || upkeep.event !== "yourUpkeep") return fail();
    const body = (): AbilityBody => ({ targets: [], effects: [{ type: "choose", choice: "direction", keepOnSource: true }], text: "choose left or right." });
    out.triggers.push({ ...enters, body: body() }, { ...upkeep, body: body() });
    return true;
  }
  // Mystic Barrier: "Each player may attack only the nearest opponent in the last chosen direction and planeswalkers
  // controlled by that opponent.": Pramikon's rule (attackProblem), by the direction its triggers chose last; two of them
  // with different directions leave only an opponent nearest both ways (rulings). Creatures put onto the battlefield
  // attacking aren't declared as attackers, so it doesn't apply to them (rulings, CR 508.4).
  if (line === "Each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent.") {
    if (out.entersChoose?.some((c) => c.what === "direction")) return fail();
    out.attackNearestChosen = true;
    return true;
  }
  // Portcullis: "Whenever a creature enters, if there are two or more other creatures on the battlefield, exile that
  // creature. Return that card to the battlefield under its owner's control when ~ leaves the battlefield.": an intervening
  // if (CR 603.4), counted as it triggers and again as it resolves (rulings), not counting the creature that entered (~
  // itself if it's a creature too); the return is a delayed trigger the ability makes (CR 603.7, rulings).
  if (line === "Whenever a creature enters, if there are two or more other creatures on the battlefield, exile that creature. Return that card to the battlefield under its owner's control when ~ leaves the battlefield.") {
    const t = parseTrigger("Whenever a creature enters, if there are two or more other creatures on the battlefield, exile that creature.");
    if (!t || t === "fail" || t.event !== "permanentEnters" || t.ifCond?.kind !== "onBattlefield" || t.ifCond.min !== 2 || t.ifCond.max !== undefined || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "exile") return fail();
    const { other: _other, ...count } = t.ifCond;
    out.triggers.push({ ...t, ifCond: { ...count, otherThanSubject: true }, body: { targets: [], effects: [{ type: "exileReturnWhenSourceLeaves" }], text: line.replace(/^Whenever [^,]+, if [^,]+, /, "") } });
    return true;
  }
  return false;
}

/** Round B210's whole spells, read after round B206's: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB210Spell(text: string): AbilityBody | null | undefined {
  // Kaboom!: "Choose any number of target players or planeswalkers. For each of them, reveal cards from the top of your
  // library until you reveal a nonland card, ~ deals damage equal to that card's mana value to that player or
  // planeswalker, then you put the revealed cards on the bottom of your library in any order.": the targets still legal
  // done one at a time, the active player and their planeswalkers first, then in turn order, you ordering each group
  // (rulings); with only lands left, no damage (rulings), and every revealed card goes on the bottom in the order you
  // choose (CR 401.4).
  if (text === "Choose any number of target players or planeswalkers. For each of them, reveal cards from the top of your library until you reveal a nonland card, ~ deals damage equal to that card's mana value to that player or planeswalker, then you put the revealed cards on the bottom of your library in any order.") {
    return { targets: [{ kind: "any", types: ["Planeswalker"], many: "any", text: "any number of target players or planeswalkers" }], effects: [{ type: "exileTopDamageEach", to: { ref: "anyTarget", index: 0 }, revealUntilNonland: true }], text };
  }
  // Martyrdom: 'Until end of turn, target creature you control gains "{0}: The next 1 damage that would be dealt to target
  // creature, planeswalker, or player this turn is dealt to ~ instead." Only you may activate this ability.': the ability
  // it gives can be activated only by this spell's controller as it resolves (CR 109.5), whoever controls the creature
  // then (CR 602.2), who controls the ability (CR 113.8). Damage is redirected only while the creature is still on the
  // battlefield and still a creature (rulings).
  const martyr = /^(Until end of turn, target creature you control gains "(\{0\}: The next 1 damage that would be dealt to target creature, planeswalker, or player this turn is dealt to ~ instead\.)")\. Only you may activate this ability\.$/.exec(text) ?? /^(Until end of turn, target creature you control gains "(\{0\}: The next 1 damage that would be dealt to target creature, planeswalker, or player this turn is dealt to ~ instead\.)") Only you may activate this ability\.$/.exec(text);
  if (martyr) {
    const body = parseBody(`${martyr[1]!}.`, { spell: true });
    const [gain] = body?.effects ?? [];
    const mod = gain?.type === "continuous" && gain.mods.length === 1 ? gain.mods[0] : undefined;
    if (!body || body.targets.length !== 1 || body.effects.length !== 1 || gain?.type !== "continuous" || mod?.kind !== "addAbility" || mod.text !== martyr[2]) return null;
    const granted = `${martyr[2]!} Only ${SPELL_CONTROLLER} may activate this ability.`;
    // The ability as it will be once the spell resolves: only that player may activate it.
    const check = compileGranted(granted.replace(SPELL_CONTROLLER, playerMark(0, "you")));
    if (check.unsupported.length || check.activated.length !== 1 || check.activated[0]!.onlyPlayer !== 0) return null;
    const effects: Effect[] = [{ ...gain, mods: [{ kind: "addAbility", text: granted }] }];
    return { ...body, effects, text };
  }
  return undefined;
}
