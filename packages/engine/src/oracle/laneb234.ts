// Lane B round B234's lines, read by compileCard before its triggers and activated abilities (after round B233's), and its
// whole spells (after round B233's).
import type { AbilityBody, CompiledCard } from "../abilities";
import type { CardDef } from "../types";
import { parseManaCost } from "../mana";
import { parseBody } from "./body";
import { roundB236Spell } from "./laneb236";
import { parseTrigger } from "./triggers";

const FIGHT = "At the beginning of combat on each opponent's turn, separate all creatures that player controls into two piles. Only creatures in the pile of their choice can attack this turn.";
const STAND = "At the beginning of combat on your turn, for each defending player, separate all creatures that player controls into two piles and that player chooses one. Only creatures in the chosen piles can block this turn.";
const SOIL_GRANTED = "Whenever a nontoken creature is put into your graveyard from the battlefield, you may pay {1}. If you do, return that card to your hand.";
// The ability word (CR 207.2c) is gone by the time the line gets here.
const SOIL = `As long as there are seven or more cards in your graveyard, ~ has "${SOIL_GRANTED}"`;
const SOUL_BURN_X = "Spend only black and/or red mana on X.";
const SOUL_BURN = "~ deals X damage to any target. You gain life equal to the damage dealt, but not more than the amount of {B} spent on X, the player's life total before the damage was dealt, the planeswalker's loyalty before the damage was dealt, or the creature's toughness.";
const DRAIN_LIFE = "~ deals X damage to any target. You gain life equal to the damage dealt, but not more life than the player's life total before the damage was dealt, the planeswalker's loyalty before the damage was dealt, or the creature's toughness.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB234Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, d: CardDef): boolean {
  // Soul Burn: "Spend only black and/or red mana on X.": each mana paying X is black or red (CR 601.2g-h), a {B/R} hybrid
  // symbol for each (CR 107.4e), only for the part of X reductions leave (rulings on Drain Life); and the most {B} that
  // could have gone to X is noted as it's cast, for its life gain (GameObject.spentOnX).
  if (line === SOUL_BURN_X && isSpell) {
    const cost = parseManaCost(d.manaCost);
    if (!cost.supported || cost.symbols.filter((y) => y.kind === "x").length !== 1 || cost.symbols.length < 2 || out.spendOnlyOnX || out.spendOnlyOnXHybrid || d.faces?.length) out.unsupported.push(raw);
    else (out.spendOnlyOnXHybrid = ["B", "R"]), (out.spentOnXOf = "B");
    return true;
  }
  if (isSpell) return false;
  // Fight or Flight: "that player" is the player whose turn it is (CR 603.2). You separate as it resolves, that player
  // chooses (CR 700.3); only the creatures in the chosen pile can attack this turn, so creatures that enter (or become
  // creatures) later can't, and with two of these only creatures in both chosen piles can (rulings).
  if (line === FIGHT) {
    const t = parseTrigger("At the beginning of combat on each opponent's turn, that player loses 1 life.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "eachBeginCombat" || !t.opponentsTurn || e?.type !== "loseLife" || e.who.ref !== "eventPlayer") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "pilesOnly", who: e.who, kind: "attack" }], text: FIGHT.slice(FIGHT.indexOf(", ") + 2) } });
    return true;
  }
  // Stand or Fall: at the beginning of combat every opponent is a defending player (CR 802.2, the attack-multiple-players
  // option Commander uses, CR 903.2); you separate each one's creatures and each chooses one of their own piles (CR 700.3).
  // Only the creatures in the chosen piles can block this turn (CR 509.1b).
  if (line === STAND) {
    const t = parseTrigger("At the beginning of combat on your turn, each opponent loses 1 life.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourBeginCombat" || e?.type !== "loseLife" || e.who.ref !== "eachOpponent") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "pilesOnly", who: e.who, kind: "block" }], text: STAND.slice(STAND.indexOf(", ") + 2) } });
    return true;
  }
  // Decaying Soil: the granted ability is a leaves-the-battlefield trigger, which looks back in time (CR 603.10a): it
  // triggers only if threshold was met just before the creature (or creatures put there at the same time) went to the
  // graveyard (rulings), and then resolves whatever happens to threshold (CR 113.7a). So it's ~'s own trigger with that
  // look-back check (TriggeredAbility.lookBackYardAtLeast); like the granted one, it's gone if ~ loses its abilities.
  // "Your graveyard" is the card's owner's (CR 404.2), so a creature card you own. Paying {1} happens as it resolves.
  if (line === SOIL) {
    const t = parseTrigger(SOIL_GRANTED);
    if (!t || t === "fail" || t.event !== "permanentDies" || t.dies?.filter.kind !== "object" || t.dies.filter.owner !== "you" || t.dies.filter.token !== false || t.dies.leaves || t.lookBackYardAtLeast !== undefined) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, lookBackYardAtLeast: 7 });
    return true;
  }
  return false;
}

/** Round B234's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB234Spell(text: string): AbilityBody | null | undefined {
  // Soul Burn: Drain Life's damage and life gain (round B179: the damage dealt, no more than the recipient's life total or
  // loyalty just before it, or its toughness), and no more than the {B} spent on X (GameObject.spentOnX, rulings: one life
  // for each black mana used on X).
  if (text === SOUL_BURN) {
    const body = parseBody(DRAIN_LIFE, { spell: true });
    const gain = body?.effects[1];
    const n = gain?.type === "gainLife" && typeof gain.n === "object" && "count" in gain.n ? gain.n.count : undefined;
    if (!body || body.effects.length !== 2 || body.effects[0]!.type !== "damage" || gain?.type !== "gainLife" || n?.kind !== "damageThisWay" || !n.capped) return null;
    return { ...body, effects: [body.effects[0]!, { ...gain, n: { count: { ...n, spentOnXCap: true } } }], text };
  }
  return roundB236Spell(text);
}
