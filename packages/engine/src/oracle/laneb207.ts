// Lane B round B207's lines, read by compileCard before its triggers and activated abilities (after round B206's).
import type { AbilityBody, CompiledCard, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTargetPhrase } from "./targets";

const COLOR_WORDS: Record<string, string> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const BASIC_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

/**
 * "An Island or blue permanent" (Nature's Wrath): a permanent with that basic land type or that color (CR 205.3i, 105.2),
 * either one; null when it isn't this form.
 */
function landTypeOrColor(phrase: string): TargetSpec | null {
  const m = /^an? (Plains|Island|Swamp|Mountain|Forest) or (white|blue|black|red|green) permanent$/.exec(phrase);
  if (!m || !BASIC_TYPES.includes(m[1]!)) return null;
  const none = { kind: "object" as const, types: [], notTypes: [], notColors: [] };
  return { ...none, anyOf: [{ ...none, subtypes: [m[1]!], text: m[1]! }, { ...none, colors: [COLOR_WORDS[m[2]!]! as "W"], text: `${m[2]} permanent` }], text: `${m[1]} or ${m[2]} permanent` };
}

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB207Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  if (delifLine(line, raw, out)) return true;
  // Tourach's Chant, Thelon's Chant, Nature's Wrath, Overburden: "Whenever a player puts a Forest onto the battlefield,
  // ... that player ...": any permanent like that entering, by any means (a land played, a spell resolving, an effect, a
  // token created, CR 111.2, 701.7a), and "that player" is the one who put it there (GameObject.putter), even when it
  // entered under another player's control (rulings on Thelon's Chant and Nature's Wrath). A permanent that's both (an
  // Underground Sea, a blue and black creature) triggers both of Nature's Wrath's abilities (rulings).
  const m = /^Whenever a player puts (an? .+?) onto the battlefield, (.+)$/.exec(line);
  if (!m) return false;
  const typed = landTypeOrColor(m[1]!);
  const spec = typed ?? parseTargetPhrase(m[1]!.replace(/^an? /, ""), { chosen: true });
  if (!spec || spec.kind !== "object" || spec.controller || spec.owner || spec.chosen) {
    out.unsupported.push(raw);
    return true;
  }
  const filter: TargetSpec = { ...spec, text: m[1]!.replace(/^an? /, "") };
  // "That player sacrifices an Island or blue permanent of their choice": one they control (CR 701.21a), if they have one.
  const sac = /^that player sacrifices (an? .+?) of their choice\.$/.exec(m[2]!);
  const sacFilter = sac ? landTypeOrColor(sac[1]!) : null;
  let body: AbilityBody | null;
  if (sac && sacFilter) body = { targets: [], effects: [{ type: "pick", who: { ref: "eventPlayer" }, filter: sacFilter, n: 1, action: "sacrifice" }], text: m[2]! };
  else body = parseBody(m[2]!, { eventPlayer: true });
  if (!body || body.targets.length) {
    out.unsupported.push(raw);
    return true;
  }
  out.triggers.push({ event: "permanentEnters", enters: { filter, byPutter: true }, body });
  return true;
}

/**
 * Delif's Cone, Delif's Cube: "<cost>: This turn, when target creature you control attacks and isn't blocked, ...": the
 * ability makes a delayed triggered ability about that creature (CR 603.7, rulings), which triggers after blockers are
 * declared if no creature blocks it (CR 509.1h, rulings), so made after that it doesn't trigger at all (rulings). With
 * the stated duration "this turn" it can trigger in each combat this turn (CR 603.7c), about that object only (CR 400.7).
 * "It" in it is the creature; "assigns no combat damage this turn" (CR 510.1a). Cone: "you may gain life equal to its
 * power. If you do, it assigns no combat damage this turn" (its power as that resolves). Cube: "it assigns no combat
 * damage this turn and you put a cube counter on ~" (none if the Cube has left, CR 400.7).
 */
function delifLine(line: string, raw: string, out: CompiledCard): boolean {
  const m = /^(.+?): This turn, when target creature you control attacks and isn't blocked, (.+)$/.exec(line);
  if (!m) return false;
  const inner = m[2] === "it assigns no combat damage this turn and you put a cube counter on ~." ? "It assigns no combat damage this turn. Put a cube counter on ~." : m[2]!;
  const ab = parseActivated(`${m[1]}: Tap target creature you control.`);
  const body = parseBody(inner, { subjectIt: true });
  const [t] = ab && ab !== "fail" ? ab.body.targets : [];
  if (!ab || ab === "fail" || ab.body.targets.length !== 1 || t?.kind !== "object" || t.controller !== "you" || t.types?.join() !== "Creature" || !body || body.targets.length) {
    out.unsupported.push(raw);
    return true;
  }
  out.activated.push({ ...ab, text: line, body: { ...ab.body, effects: [{ type: "floatingTrigger", trigger: { event: "selfAttacksUnblocked", body }, until: "endOfTurn", about: 0 }], text: line.slice(m[1]!.length + 2) } });
  return true;
}
