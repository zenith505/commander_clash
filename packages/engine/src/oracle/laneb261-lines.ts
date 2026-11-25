// Lane B round B261's lines, read by compileCard before the generic triggers (after round B257's): Mangara's Equity, Turf
// War and Aetherplasm.
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseBody, replaceX } from "./body";
import { parseTrigger } from "./triggers";
import { colorTemplate } from "./color-template";
import { COLOR_NAMES } from "../effects/describe";

const MANGARA = "Whenever a creature of the chosen color deals damage to you or a white creature you control, ~ deals that much damage to that creature.";
const TURF_ENTERS = "When ~ enters, for each player, put a contested counter on target land that player controls.";
const TURF_DAMAGE = "Whenever a creature deals combat damage to a player, if that player controls one or more lands with contested counters on them, that creature's controller gains control of one of those lands of their choice and untaps it.";
const AETHERPLASM = "Whenever ~ blocks a creature, you may return ~ to its owner's hand. If you do, you may put a creature card from your hand onto the battlefield blocking that creature.";

/** A land with a contested counter on it (CR 122.1). */
const contested = (text: string): TargetSpec => ({ kind: "object", types: ["Land"], notTypes: [], notColors: [], counter: "contested", text });

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB261Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(line);
    return true;
  };
  // Mangara's Equity: "As ~ enters, choose black or red." (CR 614.12): one of these two colors, kept as Chosen.color.
  // Its colors as a text change of color words leaves them (color-template.ts): one, "choose white", once both are white.
  const equity = colorTemplate("As ~ enters, choose black or red.", line);
  if (equity) {
    if (out.entersChoose?.some((c) => c.what === "color")) return fail();
    (out.entersChoose ??= []).push({ what: "color", options: equity[0]!.map((c) => COLOR_NAMES[c]) });
    return true;
  }
  // Mangara's Equity: a creature permanent (CR 109.2) of the chosen color, as it deals the damage, dealing it to you or to a
  // white creature you control: once for each creature and each of them dealt damage, "that much" what that one was dealt
  // (the rulings on Flameblade Angel and Elesh Norn: "you or a permanent you control" triggers for each recipient). "That
  // creature" is the creature that dealt the damage; gone from the battlefield, it isn't dealt any (CR 120.4, 400.7).
  const mangara = colorTemplate(MANGARA, line);
  if (mangara) {
    if (!out.entersChoose?.some((c) => c.what === "color")) return fail();
    const body = parseBody("~ deals X damage to it.", { subjectIt: true });
    const fx = body?.effects[0];
    if (!body || body.targets.length || body.effects.length !== 1 || fx?.type !== "damage") return fail();
    out.triggers.push({ event: "creatureDamagesYouOrYours", creatureDamagesYours: { creatureColor: mangara[0]![0]! }, body: { ...replaceX(body, { count: { kind: "eventAmount" } }), text: "~ deals that much damage to that creature." } });
    return true;
  }
  // Turf War: one target land for each player, its controller first (CR 601.2c, 603.3d), each player's own. The number of
  // targets is the number of players; with a player who controls no land it can target, there's no legal choice for that
  // target and the ability is removed from the stack, as the rulings on Vaevictis Asmadi, the Dire say of the same
  // template ("for each player, choose target permanent that player controls").
  if (line === TURF_ENTERS) {
    const t = parseTrigger("When ~ enters, put a contested counter on target land.");
    const spec = t && t !== "fail" ? t.body.targets[0] : undefined;
    const fx = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.targets.length !== 1 || spec?.kind !== "object" || spec.controller || t.body.effects.length !== 1 || fx?.type !== "counters" || fx.what.ref !== "target") return fail();
    out.triggers.push({ ...t, body: { ...t.body, targets: [{ ...spec, perOpponent: true, perPlayer: true, perOpponentRequired: true, perPlayerAll: true, text: "target land that player controls" }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Turf War: anyone's creature dealing combat damage to any player (CR 603.2c: once for each creature), an intervening if
  // (CR 603.4) about the lands with contested counters the player dealt damage controls, checked again as it resolves. The
  // creature's controller (as it is then, or as it last existed, CR 608.2h) chooses one of those lands as it resolves (not
  // targeted), gains control of it for the rest of the game (layer 2, CR 613.1b) and untaps it.
  if (line === TURF_DAMAGE) {
    const pick = { type: "pick" as const, who: { ref: "subjectController" as const }, among: { ref: "eventPlayer" as const }, filter: { ...contested("land with a contested counter on it"), controller: "you" as const }, n: 1, action: "choose" as const, prompt: "click one of {player} lands with a contested counter on it: you gain control of it and untap it" };
    out.triggers.push({
      event: "creatureYouControlDealsCombatDamageToPlayer",
      dealer: { filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, anyone: true },
      ifCond: { kind: "control", who: "eventPlayer", filter: contested("lands with contested counters on them"), min: 1 },
      body: {
        targets: [],
        effects: [pick, { type: "continuous", what: { ref: "created" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "subjectController" } }, { type: "untap", what: { ref: "created" } }],
        text: "that creature's controller gains control of one of those lands of their choice and untaps it.",
      },
    });
    return true;
  }
  // Aetherplasm: once for each attacker it blocks (CR 509.3b), "that creature" the attacker. "If you do": only if ~ was
  // returned to its owner's hand. The creature card (any, ~ itself too) is put onto the battlefield blocking that creature
  // if it's still attacking you (CR 509.4, 509.4a), never declared as a blocker and never "blocked" for triggers (CR 509.3a-
  // b, 509.4; rulings); the attacker stays blocked even if nothing is put (CR 509.1h, rulings).
  if (line === AETHERPLASM) {
    const t = parseTrigger("Whenever ~ blocks a creature, you may return ~ to its owner's hand.");
    const may = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfBlocksCreature" || t.body.targets.length || t.body.effects.length !== 1 || may?.type !== "may" || may.effects.length !== 1 || may.effects[0]!.type !== "bounce") return fail();
    const creature: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
    out.triggers.push({ ...t, body: { targets: [], effects: [may, { type: "if", cond: { kind: "youDid" }, effects: [{ type: "putFromHand", filter: creature, may: true, blockingSubject: true }] }], text: line.replace(/^Whenever ~ blocks a creature, /, "") } });
    return true;
  }
  return false;
}
