// Lane B round B228's lines, read by compileCard before its triggers and activated abilities (after round B227's).
import type { CompiledCard, Effect } from "../abilities";
import { canonicalKeyword, EXILED_BLOOD_CREATURE_KEYWORD, OPPONENT_CREATURE_KEYWORD } from "../keywords";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const RAYAMI_EXILE = "If a nontoken creature would die, exile that card with a blood counter on it instead.";
const ESCAPED = "As long as an opponent controls a creature with flying not named ~, ~ has flying. The same is true for first strike, trample, and protection from any color.";
const OYSTER = "{T}: For as long as ~ remains tapped, target tapped creature doesn't untap during its controller's untap step, and at the beginning of each of your draw steps, put a -1/-1 counter on that creature. When ~ leaves the battlefield or becomes untapped, remove all -1/-1 counters from the creature.";
const ADVANCING = "You may pay {0} rather than pay the power-up cost of the first power-up ability you activate during each of your turns.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB228Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Rayami, First of the Fallen: "If a nontoken creature would die, exile that card with a blood counter on it instead.": a
  // replacement effect (CR 614.1a) on any player's nontoken creature going from the battlefield to a graveyard (dying, CR
  // 700.4), a creature as it is on the battlefield (rulings: a crewed Vehicle is exiled too); the card is exiled with a blood
  // counter on it (CR 122.1). Creatures dying as Rayami leaves the battlefield at the same time are exiled too (rulings).
  if (line === RAYAMI_EXILE) {
    if (out.graveyardExile) return fail();
    out.graveyardExile = { whose: "any", permanents: true, typesNow: ["Creature"], counter: "blood" };
    return true;
  }
  // Rayami: "As long as an exiled creature card with a blood counter on it has flying, ~ has flying. The same is true for
  // first strike, ...": each keyword while a face-up creature card in exile with a blood counter on it, anyone's, however it
  // got there, has it as its own printed keyword (rulings: a conditional one doesn't apply in exile; variants such as
  // "protection from black" or "hexproof from white" are had as those variants), layer 6 (CR 613.1f).
  const bloodKw = /^As long as an exiled creature card with a blood counter on it has ([a-z ]+), ~ has \1\. The same is true for ((?:[a-z ]+, )+)and ([a-z ]+)\.$/.exec(line);
  if (bloodKw) {
    const kws = [bloodKw[1]!, ...bloodKw[2]!.split(", ").filter(Boolean), bloodKw[3]!].map((k) => (k === "protection" ? "Protection" : canonicalKeyword(k)));
    if (kws.some((k) => !k || !/^[A-Z][a-z]+(?: [a-z]+)?$/.test(k))) return fail();
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addKeywords", keywords: kws.map((k) => `${EXILED_BLOOD_CREATURE_KEYWORD}${k}`) }], text: line });
    return true;
  }
  // Escaped Shapeshifter: "As long as an opponent controls a creature with flying not named Escaped Shapeshifter, this creature
  // has flying. The same is true for first strike, trample, and protection from any color.": each keyword while a creature
  // any opponent controls (rulings: in multiplayer, any of them), with another name than this one's, has it, as the layers
  // have given it so far: layer 6 (CR 613.1f), after the effects there that give or take those creatures' abilities, which
  // it depends on (CR 613.8a). "Protection from any color": protection from each color one of those creatures has
  // protection from ("protection from each color" and "from all colors" being one for each color, CR 702.16h).
  if (line === ESCAPED) {
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addKeywords", keywords: ["Flying", "First strike", "Trample", "Protection"].map((k) => `${OPPONENT_CREATURE_KEYWORD}${k}`) }], text: line });
    return true;
  }
  // Giant Oyster: "{T}: For as long as this creature remains tapped, target tapped creature doesn't untap during its
  // controller's untap step, and at the beginning of each of your draw steps, put a -1/-1 counter on that creature. When this
  // creature leaves the battlefield or becomes untapped, remove all -1/-1 counters from the creature.": as it resolves, a
  // continuous effect for as long as the Oyster stays tapped (CR 611.2b), a delayed trigger at the beginning of each of its
  // controller's draw steps for as long (CR 603.7b; rulings: one that has triggered still resolves after the Oyster untaps),
  // and a delayed trigger the first time the Oyster leaves the battlefield or becomes untapped (CR 603.7c), all about the
  // target as it is now (CR 400.7).
  if (line === OYSTER) {
    const ab = parseActivated("{T}: For as long as ~ remains tapped, target tapped creature doesn't untap during its controller's untap step.");
    const draw = parseTrigger("At the beginning of your draw step, put a -1/-1 counter on target creature.");
    if (!ab || ab === "fail" || !ab.tap || ab.body.targets.length !== 1 || ab.body.effects.length !== 1 || ab.body.effects[0]!.type !== "continuous" || ab.body.effects[0]!.duration !== "whileTapped") return fail();
    if (!draw || draw === "fail" || draw.event !== "yourDrawStep" || draw.body.effects.length !== 1 || draw.body.effects[0]!.type !== "counters") return fail();
    const counter: Effect = { ...draw.body.effects[0]!, what: { ref: "subject" } } as Effect;
    const effects: Effect[] = [
      ...ab.body.effects,
      { type: "floatingTrigger", trigger: { ...draw, body: { targets: [], effects: [counter], text: "put a -1/-1 counter on that creature." } }, until: "whileTapped", about: 0 },
      { type: "delayed", when: "leaves", of: { ref: "self" }, about: 0, orUntaps: true, effects: [{ type: "removeCounters", what: { ref: "subject" }, counter: "-1/-1", n: "all" }], text: "remove all -1/-1 counters from the creature" },
    ];
    out.activated.push({ ...ab, body: { ...ab.body, effects, text: line.replace(/^\{T\}: /, "") }, text: line });
    return true;
  }
  // Advancing the Spirit: "You may pay {0} rather than pay the power-up cost of the first power-up ability you activate during
  // each of your turns.": an alternative cost for that activation (CR 118.9, 602.2b), during your own turn, if you haven't
  // activated a power-up ability this turn (CR 702.193a), checked as it's activated (game.ts freePowerUp).
  if (line === ADVANCING) {
    if (out.freePowerUp) return fail();
    out.freePowerUp = true;
    return true;
  }
  return false;
}
